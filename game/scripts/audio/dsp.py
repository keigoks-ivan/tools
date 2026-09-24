"""DSP primitives for the march audio build (numpy + scipy + numba, all offline).

Everything here is synthesis or processing written for this project: oscillators, a
TPT state-variable filter with per-sample cutoff, a Karplus-Strong string with a
time-varying (bendable) fractional delay, an 8-line feedback-delay-network reverb,
chorus / ping-pong delay, a stereo-linked compressor, a look-ahead limiter and an
ITU-R BS.1770-4 loudness meter. No samples, no downloads.
"""
import math
import os
import tempfile

# keep numba's JIT cache out of the repo
os.environ.setdefault('NUMBA_CACHE_DIR', os.path.join(tempfile.gettempdir(), 'march-audio-numba'))

import numpy as np
from numba import njit
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 44100
TAU = 2 * math.pi


def rng(seed):
    return np.random.default_rng(seed)


def secs(n):
    return int(round(n * SR))


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def db(x):
    return 10 ** (x / 20.0)


# ---------------------------------------------------------------- oscillators (vectorised)

def _polyblep(t, dt):
    out = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    out[m] = x + x - x * x - 1.0
    m = t > 1.0 - dt
    x = (t[m] - 1.0) / dt[m]
    out[m] = x * x + x + x + 1.0
    return out


def phase(freq, phase0=0.0):
    """Phase in cycles (0..1) for a per-sample frequency array."""
    dt = np.asarray(freq, dtype=float) / SR
    return (phase0 + np.cumsum(dt) - dt[0]) % 1.0, dt


def saw(freq, phase0=0.0):
    t, dt = phase(freq, phase0)
    dt = np.clip(dt, 1e-7, 0.5)
    return 2.0 * t - 1.0 - _polyblep(t, dt)


def pulse(freq, width=0.5, phase0=0.0):
    t, dt = phase(freq, phase0)
    dt = np.clip(dt, 1e-7, 0.5)
    a = 2.0 * t - 1.0 - _polyblep(t, dt)
    t2 = (t + width) % 1.0
    b = 2.0 * t2 - 1.0 - _polyblep(t2, dt)
    return 0.5 * (a - b)


def sine(freq, phase0=0.0):
    t, _ = phase(freq, phase0)
    return np.sin(TAU * t)


def const(v, n):
    return np.full(n, float(v))


def env_adsr(n, a, d, s, r, hold=None):
    """Linear-attack, exponential decay/release envelope; hold = gate length in s."""
    t = np.arange(n) / SR
    gate = hold if hold is not None else n / SR - r
    e = np.empty(n)
    att = t < a
    e[att] = t[att] / max(a, 1e-6)
    dec = ~att
    e[dec] = s + (1 - s) * np.exp(-(t[dec] - a) / max(d, 1e-6))
    rel = t > gate
    if rel.any():
        g_at = s + (1 - s) * math.exp(-(max(gate - a, 0)) / max(d, 1e-6)) if gate > a else gate / max(a, 1e-6)
        e[rel] = g_at * np.exp(-(t[rel] - gate) / max(r, 1e-6))
    return e


def env_perc(n, a, decay, curve=1.0):
    t = np.arange(n) / SR
    e = np.exp(-t / max(decay, 1e-6))
    if curve != 1.0:
        e = e ** curve
    if a > 0:
        e *= np.clip(t / a, 0, 1)
    return e


def fade_out(x, sec):
    n = min(len(x), secs(sec))
    if n > 0:
        x[-n:] *= np.cos(np.linspace(0, math.pi / 2, n)) ** 2 if x.ndim == 1 else (np.cos(np.linspace(0, math.pi / 2, n)) ** 2)[:, None]
    return x


def noise(n, r):
    return r.standard_normal(n) * 0.5


def pink(n, r):
    w = r.standard_normal(n)
    spec = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    spec /= np.sqrt(f / 100.0)
    y = np.fft.irfft(spec, n)
    return y / (np.std(y) + 1e-9) * 0.5


# ---------------------------------------------------------------- filters

@njit(cache=True)
def svf(x, fc, q, mode):
    """Topology-preserving SVF. fc: per-sample cutoff (Hz). mode 0 LP, 1 BP, 2 HP, 3 notch, 4 peak-BP(unity)."""
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        f = fc[i]
        if f < 10.0:
            f = 10.0
        if f > 0.45 * 44100.0:
            f = 0.45 * 44100.0
        g = math.tan(math.pi * f / 44100.0)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v1
        elif mode == 2:
            y[i] = x[i] - k * v1 - v2
        elif mode == 3:
            y[i] = x[i] - k * v1
        else:
            y[i] = k * v1
    return y


def lp(x, fc, q=0.707):
    return svf(np.ascontiguousarray(x, dtype=float), _arr(fc, len(x)), q, 0)


def hp(x, fc, q=0.707):
    return svf(np.ascontiguousarray(x, dtype=float), _arr(fc, len(x)), q, 2)


def bp(x, fc, q=1.0):
    """Band-pass with unity peak gain."""
    return svf(np.ascontiguousarray(x, dtype=float), _arr(fc, len(x)), q, 4)


def _arr(v, n):
    if np.isscalar(v):
        return np.full(n, float(v))
    return np.ascontiguousarray(v, dtype=float)


def sos_filter(x, sos):
    return signal.sosfilt(sos, x, axis=0)


def peq(x, f0, gain_db, q=1.0):
    """RBJ peaking EQ (static)."""
    A = 10 ** (gain_db / 40)
    w = TAU * f0 / SR
    al = math.sin(w) / (2 * q)
    b = [1 + al * A, -2 * math.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * math.cos(w), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def shelf(x, f0, gain_db, high=True, s=1.0):
    A = 10 ** (gain_db / 40)
    w = TAU * f0 / SR
    al = math.sin(w) / 2 * math.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = math.cos(w)
    if high:
        b = [A * ((A + 1) + (A - 1) * c + 2 * math.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * math.sqrt(A) * al)]
        a = [(A + 1) - (A - 1) * c + 2 * math.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * math.sqrt(A) * al]
    else:
        b = [A * ((A + 1) - (A - 1) * c + 2 * math.sqrt(A) * al), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - 2 * math.sqrt(A) * al)]
        a = [(A + 1) + (A - 1) * c + 2 * math.sqrt(A) * al, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - 2 * math.sqrt(A) * al]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def butter_hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'highpass', fs=SR, output='sos'), x, axis=0)


def butter_lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'lowpass', fs=SR, output='sos'), x, axis=0)


def butter_bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x, axis=0)


# ---------------------------------------------------------------- Karplus-Strong string

@njit(cache=True)
def _ks(n, period, exc, loss, bright):
    size = 8192
    mask = size - 1
    buf = np.zeros(size)
    y = np.zeros(n)
    s = 0.0
    ne = exc.shape[0]
    for i in range(n):
        p = period[i]
        rp = i - p
        i0 = int(math.floor(rp))
        fr = rp - i0
        a = buf[i0 & mask] if i0 >= 0 else 0.0
        b = buf[(i0 + 1) & mask] if i0 + 1 >= 0 else 0.0
        d = a + (b - a) * fr
        s = s + bright * (d - s)
        v = loss * s
        if i < ne:
            v += exc[i]
        buf[i & mask] = v
        y[i] = v
    return y


def ks_string(freq_curve, t60, bright=0.6, exc=None, r=None, pluck_pos=0.18, exc_lp=4000.0):
    """Plucked string. freq_curve: per-sample Hz (bends / vibrato allowed). t60 in seconds."""
    n = len(freq_curve)
    f0 = float(np.median(freq_curve[: min(n, 2000)]))
    period = SR / np.asarray(freq_curve, dtype=float)
    # one-pole loop filter phase delay at low f ~ (1-b)/b samples; compensate so pitch is right
    period = period - (1.0 - bright) / bright
    period = np.maximum(period, 2.0)
    loss = 10 ** (-3.0 * (SR / f0) / (t60 * SR))
    if exc is None:
        r = r or rng(1)
        m = max(8, int(SR / f0))
        e = r.uniform(-1, 1, m)
        e = butter_lp(e, exc_lp, 1)
        # pluck position comb
        k = max(1, int(m * pluck_pos))
        e2 = e.copy()
        e2[k:] -= e[:-k]
        exc = e2 * np.hanning(m) ** 0.25
    return _ks(n, np.ascontiguousarray(period), np.ascontiguousarray(exc, dtype=float), loss, bright)


def modal(n, freqs, decays, amps, r=None, jitter=0.0):
    """Sum of exponentially decaying sinusoids (drum membranes, bells, bodies)."""
    t = np.arange(n) / SR
    y = np.zeros(n)
    r = r or rng(0)
    for f, d, a in zip(freqs, decays, amps):
        ph = r.uniform(0, TAU)
        ff = f * (1 + jitter * r.uniform(-1, 1))
        y += a * np.sin(TAU * ff * t + ph) * np.exp(-t / d)
    return y


def body_ir(freqs, decays, amps, length=0.12, r=None):
    n = secs(length)
    ir = modal(n, freqs, decays, amps, r)
    ir[0] += 1.0
    return ir / np.max(np.abs(ir))


# ---------------------------------------------------------------- effects

@njit(cache=True)
def _fdn(xl, xr, rt60, damp, size, mod_depth):
    n = xl.shape[0]
    base = np.array([1153.0, 1327.0, 1451.0, 1597.0, 1741.0, 1867.0, 2029.0, 2213.0])
    lens = np.empty(8, dtype=np.int64)
    for j in range(8):
        lens[j] = int(base[j] * size)
    maxl = 0
    for j in range(8):
        if lens[j] > maxl:
            maxl = lens[j]
    L = 1
    while L < maxl + 64:
        L *= 2
    mask = L - 1
    lines = np.zeros((8, L))
    g = np.empty(8)
    for j in range(8):
        g[j] = 10.0 ** (-3.0 * lens[j] / (rt60 * 44100.0))
    lpst = np.zeros(8)
    # input diffusers (allpass)
    apl = np.array([142, 107, 379, 277, 211, 163])
    apbuf = np.zeros((6, 512))
    apg = 0.62
    outl = np.empty(n)
    outr = np.empty(n)
    v = np.zeros(8)
    o = np.zeros(8)
    for i in range(n):
        # diffuse mono-ish input pair
        inl = xl[i]
        inr = xr[i]
        for k in range(3):
            idx = (i - apl[k]) & 511
            dly = apbuf[k, idx]
            w = inl + apg * dly
            apbuf[k, i & 511] = w
            inl = dly - apg * w
        for k in range(3, 6):
            idx = (i - apl[k]) & 511
            dly = apbuf[k, idx]
            w = inr + apg * dly
            apbuf[k, i & 511] = w
            inr = dly - apg * w
        for j in range(8):
            ln = lens[j]
            if mod_depth > 0.0 and j < 4:
                ln = ln + int(mod_depth * math.sin(i * (0.00013 + j * 0.000037)))
            s = lines[j, (i - ln) & mask]
            lpst[j] = lpst[j] + damp * (s - lpst[j])
            o[j] = lpst[j] * g[j]
        # Hadamard 8 (fast)
        a0 = o[0] + o[1]; a1 = o[0] - o[1]; a2 = o[2] + o[3]; a3 = o[2] - o[3]
        a4 = o[4] + o[5]; a5 = o[4] - o[5]; a6 = o[6] + o[7]; a7 = o[6] - o[7]
        b0 = a0 + a2; b1 = a1 + a3; b2 = a0 - a2; b3 = a1 - a3
        b4 = a4 + a6; b5 = a5 + a7; b6 = a4 - a6; b7 = a5 - a7
        v[0] = b0 + b4; v[1] = b1 + b5; v[2] = b2 + b6; v[3] = b3 + b7
        v[4] = b0 - b4; v[5] = b1 - b5; v[6] = b2 - b6; v[7] = b3 - b7
        sc = 0.35355339059327373
        for j in range(8):
            fb = v[j] * sc
            if j % 2 == 0:
                fb += inl * 0.5
            else:
                fb += inr * 0.5
            lines[j, i & mask] = fb
        outl[i] = o[0] + o[2] + o[4] + o[6]
        outr[i] = o[1] + o[3] + o[5] + o[7]
    return outl, outr


def reverb(st, rt60=2.2, damp_hz=5500.0, size=1.0, predelay=0.02, lo_cut=180.0, mod=6.0):
    """Stereo FDN reverb, returns the 100% wet stereo signal."""
    st = np.asarray(st, dtype=float)
    pd = secs(predelay)
    xl = np.concatenate([np.zeros(pd), st[:, 0]])[: len(st)]
    xr = np.concatenate([np.zeros(pd), st[:, 1]])[: len(st)]
    xl = butter_hp(xl, lo_cut)
    xr = butter_hp(xr, lo_cut)
    damp = 1 - math.exp(-TAU * damp_hz / SR)
    l, r = _fdn(np.ascontiguousarray(xl), np.ascontiguousarray(xr), rt60, damp, size, mod)
    out = np.stack([l, r], 1) * 0.35
    return out


@njit(cache=True)
def _moddelay(x, dly):
    n = x.shape[0]
    y = np.empty(n)
    for i in range(n):
        rp = i - dly[i]
        i0 = int(math.floor(rp))
        fr = rp - i0
        a = x[i0] if 0 <= i0 < n else 0.0
        b = x[i0 + 1] if 0 <= i0 + 1 < n else 0.0
        y[i] = a + (b - a) * fr
    return y


def chorus(st, rate=0.35, depth_ms=3.5, base_ms=14.0, mix=0.45):
    st = np.asarray(st, dtype=float)
    n = len(st)
    t = np.arange(n) / SR
    out = st.copy()
    for ch, ph in ((0, 0.0), (1, math.pi / 2)):
        d = (base_ms + depth_ms * np.sin(TAU * rate * t + ph)) * SR / 1000
        d2 = (base_ms * 1.37 + depth_ms * 0.8 * np.sin(TAU * rate * 1.31 * t + ph + 1.1)) * SR / 1000
        src = np.ascontiguousarray(st[:, ch])
        out[:, ch] = st[:, ch] * (1 - mix * 0.5) + mix * 0.5 * (_moddelay(src, d) + _moddelay(src, d2))
    return out


@njit(cache=True)
def _pingpong(xl, xr, d, fb, damp):
    n = xl.shape[0]
    L = 1
    while L < d + 8:
        L *= 2
    mask = L - 1
    bl = np.zeros(L)
    br = np.zeros(L)
    sl = 0.0
    sr = 0.0
    yl = np.empty(n)
    yr = np.empty(n)
    for i in range(n):
        dl = bl[(i - d) & mask]
        dr = br[(i - d) & mask]
        sl = sl + damp * (dl - sl)
        sr = sr + damp * (dr - sr)
        bl[i & mask] = xl[i] + sr * fb
        br[i & mask] = xr[i] * 0.3 + sl * fb
        yl[i] = dl
        yr[i] = dr
    return yl, yr


def pingpong(st, delay_s, fb=0.35, damp_hz=3500.0):
    st = np.asarray(st, dtype=float)
    damp = 1 - math.exp(-TAU * damp_hz / SR)
    l, r = _pingpong(np.ascontiguousarray(st[:, 0]), np.ascontiguousarray(st[:, 1]), secs(delay_s), fb, damp)
    return np.stack([l, r], 1)


@njit(cache=True)
def _comp_gain(det, thr, ratio, knee, att, rel):
    n = det.shape[0]
    g = np.empty(n)
    env = -120.0
    for i in range(n):
        x = det[i]
        lvl = 20.0 * math.log10(x + 1e-9)
        coef = att if lvl > env else rel
        env = lvl + coef * (env - lvl)
        over = env - thr
        if over <= -knee / 2:
            red = 0.0
        elif over >= knee / 2:
            red = over * (1.0 - 1.0 / ratio)
        else:
            red = (1.0 - 1.0 / ratio) * (over + knee / 2) ** 2 / (2 * knee)
        g[i] = 10.0 ** (-red / 20.0)
    return g


def compress(st, thr=-18.0, ratio=3.0, attack=0.01, release=0.15, knee=6.0, makeup=0.0, sidechain=None):
    st = np.asarray(st, dtype=float)
    det = np.abs(st).max(axis=1) if st.ndim == 2 else np.abs(st)
    if sidechain is not None:
        det = np.abs(sidechain).max(axis=1) if sidechain.ndim == 2 else np.abs(sidechain)
    att = math.exp(-1 / (attack * SR))
    rel = math.exp(-1 / (release * SR))
    g = _comp_gain(np.ascontiguousarray(det), thr, ratio, knee, att, rel) * db(makeup)
    return st * (g[:, None] if st.ndim == 2 else g), g


@njit(cache=True)
def _release(target, rc):
    n = target.shape[0]
    out = np.empty(n)
    g = 1.0
    for i in range(n):
        t = target[i]
        if t < g:
            g = t
        else:
            g = t + rc * (g - t)
        out[i] = g
    return out


def limit(st, ceiling_db=-1.0, lookahead=0.004, release=0.08):
    """Zero-latency (offline, centred) look-ahead limiter; guarantees |y| <= ceiling on samples."""
    st = np.asarray(st, dtype=float)
    c = db(ceiling_db)
    peak = np.abs(st).max(axis=1) if st.ndim == 2 else np.abs(st)
    req = np.minimum(1.0, c / np.maximum(peak, 1e-9))
    la = max(1, secs(lookahead))
    m = minimum_filter1d(req, size=2 * la + 1, mode='nearest')
    sm = uniform_filter1d(m, size=la + 1, mode='nearest')
    sm = np.minimum(sm, req)
    g = _release(np.ascontiguousarray(sm), math.exp(-1 / (release * SR)))
    g = np.minimum(g, req)
    y = st * (g[:, None] if st.ndim == 2 else g)
    return np.clip(y, -c, c)


def saturate(x, drive=1.5):
    return np.tanh(x * drive) / math.tanh(drive)


def pan_st(mono, pan=0.0, width=0.0):
    """Constant-power pan. pan -1..1."""
    a = (pan + 1) * math.pi / 4
    return np.stack([mono * math.cos(a), mono * math.sin(a)], 1) * math.sqrt(2)


def widen(st, amount=1.2):
    m = (st[:, 0] + st[:, 1]) * 0.5
    s = (st[:, 0] - st[:, 1]) * 0.5 * amount
    return np.stack([m + s, m - s], 1)


def haas(mono, ms=11.0, pan=0.0):
    d = secs(ms / 1000)
    a = mono
    b = np.concatenate([np.zeros(d), mono])[: len(mono)]
    st = np.stack([a, b], 1) if pan >= 0 else np.stack([b, a], 1)
    return st


# ---------------------------------------------------------------- loudness (ITU-R BS.1770-4)

def _kweight_sos():
    # pyloudnorm-style re-derivation of the K-weighting filters for any sample rate
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40)
    K = math.tan(math.pi * fc / SR)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.499666774155
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    s1 = np.concatenate([b, a])
    Q2, fc2 = 0.5003270373253953, 38.13547087613982
    K = math.tan(math.pi * fc2 / SR)
    a0 = 1 + K / Q2 + K * K
    b2 = [1, -2, 1]
    a2 = [1, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0]
    s2 = np.concatenate([b2, a2])
    return np.stack([s1, s2])


def lufs(st):
    st = np.asarray(st, dtype=float)
    if st.ndim == 1:
        st = st[:, None]
    y = signal.sosfilt(_kweight_sos(), st, axis=0)
    blk = int(0.4 * SR)
    hop = int(0.1 * SR)
    if len(y) < blk:
        return -70.0
    ms = []
    for s in range(0, len(y) - blk + 1, hop):
        ms.append(np.sum(np.mean(y[s:s + blk] ** 2, axis=0)))
    ms = np.array(ms)
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    g1 = ms[ld > -70]
    if len(g1) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(np.mean(g1)) - 10
    g2 = ms[(ld > -70) & (ld > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g2)))


def short_term_max(st):
    st = np.asarray(st, dtype=float)
    if st.ndim == 1:
        st = st[:, None]
    y = signal.sosfilt(_kweight_sos(), st, axis=0)
    blk = 3 * SR
    hop = SR // 10
    best = -70.0
    for s in range(0, max(1, len(y) - blk + 1), hop):
        v = -0.691 + 10 * np.log10(np.sum(np.mean(y[s:s + blk] ** 2, axis=0)) + 1e-12)
        best = max(best, v)
    return float(best)


def true_peak_db(st):
    st = np.asarray(st, dtype=float)
    up = signal.resample_poly(st, 4, 1, axis=0)
    return float(20 * np.log10(np.max(np.abs(up)) + 1e-12))


def sample_peak_db(st):
    return float(20 * np.log10(np.max(np.abs(st)) + 1e-12))
