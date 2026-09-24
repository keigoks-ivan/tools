"""Sound effects for the march level, synthesised and packed into one mono sprite.

Every effect is layered: a transient (click / crack), a body (pitched thump, modal ring,
formant voice) and a tail (noise, debris, room), with seeded variants so repeated events do
not sound identical. build_sprite() returns (audio, table, info):
  table[id] = [[start_s, dur_s], ...]  positions relative to the calibration marker
  info['marker'] = where the marker burst starts in the file (the runtime re-measures it after
  decoding, so MP3 encoder delay / decoder trimming differences cancel out).
"""
import math

import numpy as np

from dsp import (SR, TAU, bp, butter_bp, butter_hp, butter_lp, db, hp, lp, lufs, midi_hz, modal, peq, reverb, rng,
                 saturate, saw, secs, sine, svf)
from instruments import fm_bell, choir_part, supersaw_chord, brass_stab, taiko, crash

GAP = 0.12          # silence between sprite entries (s)
MARKER_AT = 0.05    # marker burst position (s)
MARKER_LEN = 0.012


def _n(x, peak=1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def tl(n):
    return np.arange(n) / SR


def mix(n, *layers):
    out = np.zeros(n)
    for x, g, at in layers:
        a = secs(at)
        if a >= n:
            continue
        k = min(len(x), n - a)
        out[a:a + k] += fade_end(np.asarray(x[:k], dtype=float), 0.02) * g
    return out


def room(x, rt=0.6, wet=0.25, damp=5000, size=0.6, pre=0.008):
    st = np.stack([x, x], 1)
    w = reverb(st, rt60=rt, damp_hz=damp, size=size, predelay=pre, lo_cut=120, mod=2.0)
    return x + wet * (w[:, 0] + w[:, 1]) * 0.5 * 2.2


def pad_tail(x, sec):
    return np.concatenate([x, np.zeros(secs(sec))])


def fade_end(x, sec=0.03):
    f = max(1, min(len(x) // 3, secs(sec)))
    x = x.copy()
    x[-f:] *= np.cos(np.linspace(0, math.pi / 2, f)) ** 2
    return x


# ------------------------------------------------------------------ building blocks

def whoosh(r, dur, f0, f1, f2=None, q=1.3, peak=0.45, air=0.35, sing=0.0, sing_f=2400.0, shimmer=0.0):
    """Noise through a band-pass that sweeps f0 -> f1 (-> f2) with a bell envelope.
    sing: thin blade whistle (doppler drop); shimmer: violet energy partials."""
    n = secs(dur)
    t = np.linspace(0, 1, n)
    f2 = f2 or f0
    up = np.clip(t / peak, 0, 1)
    down = np.clip((t - peak) / (1 - peak), 0, 1)
    fc = np.where(t < peak, f0 + (f1 - f0) * up ** 1.2, f1 + (f2 - f1) * down ** 0.8)
    env = np.where(t < peak, up ** 2.2, np.exp(-down * 4.0))
    nz = r.standard_normal(n)
    body = bp(nz, fc, q)
    body += 0.5 * bp(r.standard_normal(n), fc * 1.9, q * 1.4)
    a = hp(r.standard_normal(n), 7000) * np.exp(-((t - peak) / 0.12) ** 2) * air
    y = (body + a) * env
    if sing:
        f = sing_f * (1.06 - 0.12 * t)
        y += sine(f) * env ** 1.5 * sing * (1 + 0.3 * np.sin(TAU * 37 * t * dur))
    if shimmer:
        f = 1320 * (1.0 + 0.25 * t)
        sh = sine(f) * 0.5 + sine(f * 1.5) * 0.35 + sine(f * 2.01) * 0.25 + sine(f * 3.02) * 0.15
        y += sh * env ** 1.3 * shimmer
    return _n(fade_end(y), 1.0)


def thump(r, dur, f_start, f_end, decay, drive=1.4):
    n = secs(dur)
    t = tl(n)
    f = f_end + (f_start - f_end) * np.exp(-t / (decay * 0.35))
    y = sine(f) * np.exp(-t / decay) * np.clip(t / 0.0015, 0, 1)
    return fade_end(saturate(y * drive, 1.0), min(0.06, dur * 0.3))


def click(r, dur=0.004, lo=2000.0, hi=12000.0):
    n = secs(dur)
    return butter_bp(r.standard_normal(n), lo, hi) * np.exp(-tl(n) / (dur / 3))


def noise_burst(r, dur, lo, hi, decay, attack=0.001):
    n = secs(dur)
    t = tl(n)
    return fade_end(butter_bp(r.standard_normal(n), lo, hi) * np.exp(-t / decay) * np.clip(t / attack, 0, 1), min(0.04, dur * 0.3))


def metal(r, dur, f0, ratios, decays, amps, beat=2.5):
    n = secs(dur)
    t = tl(n)
    y = np.zeros(n)
    for rt, d, a in zip(ratios, decays, amps):
        f = f0 * rt * (1 + 0.004 * r.uniform(-1, 1))
        ph = r.uniform(0, TAU)
        y += a * np.exp(-t / d) * (np.sin(TAU * f * t + ph) + 0.6 * np.sin(TAU * (f + beat * r.uniform(0.5, 1.5)) * t + ph))
    return y


def debris(r, dur, count, f_lo, f_hi, decay=(0.006, 0.03), density_decay=0.25, tonal=0.6):
    n = secs(dur)
    y = np.zeros(n)
    for _ in range(count):
        at = r.exponential(density_decay)
        a = secs(at)
        if a >= n - 10:
            continue
        d = r.uniform(*decay)
        k = min(n - a, secs(d * 6))
        tt = tl(k)
        f = r.uniform(f_lo, f_hi)
        g = r.uniform(0.3, 1.0) * math.exp(-at / (density_decay * 2))
        grain = tonal * np.sin(TAU * f * tt + r.uniform(0, TAU)) + (1 - tonal) * butter_bp(r.standard_normal(k), f * 0.6, min(f * 1.6, 20000))
        y[a:a + k] += grain * np.exp(-tt / d) * g
    return y


_VOWEL = {  # formants for a big throat (oni): F, bw, gain dB
    'u': [(330, 70, 0), (800, 90, -10), (2200, 150, -22)],
    'o': [(450, 80, 0), (820, 90, -6), (2500, 150, -18)],
    'a': [(700, 100, 0), (1150, 110, -4), (2500, 160, -14)],
    'e': [(520, 90, 0), (1750, 120, -8), (2550, 160, -14)],
}


def voice(r, dur, f0_curve, vowel_from='o', vowel_to=None, scale=0.8, growl=0.5, sub=0.4, breath=0.3, drive=2.5,
          attack=0.02, release=0.12, am=28.0):
    """Monster voice: jittery glottal saw + subharmonic growl through (moving) formants."""
    n = secs(dur)
    t = tl(n)
    x = np.linspace(0, 1, n)
    jit = 1 + 0.03 * butter_lp(r.standard_normal(n), 40, 1) / 0.05
    f0 = np.interp(x, np.linspace(0, 1, len(f0_curve)), f0_curve) * np.clip(jit, 0.9, 1.1)
    src = saw(f0, r.random()) + sub * saw(f0 * 0.5, r.random())
    src *= 1 + growl * np.sin(TAU * am * t + r.uniform(0, TAU)) * (0.6 + 0.4 * butter_lp(r.standard_normal(n), 10, 1) / 0.1)
    nz = r.standard_normal(n) * breath * 2
    src = src + nz
    vf = _VOWEL[vowel_from]
    vt = _VOWEL[vowel_to or vowel_from]
    y = np.zeros(n)
    for (fa, ba, ga), (fb, bb, gb) in zip(vf, vt):
        fc = (fa + (fb - fa) * x) * scale
        g = db(ga + (gb - ga) * x)
        y += bp(src, fc, float(np.mean(fc)) / ((ba + bb) / 2)) * g
    env = np.clip(t / attack, 0, 1) * np.clip((dur - t) / release, 0, 1) * (1 - 0.45 * x)
    y = saturate(_n(y) * drive, 1.0) * env
    y = butter_hp(y, 60)
    return _n(y, 1.0)


def bell(midi, dur, r, bright=1.0, decay=0.9, ratio=3.5, index=2.5):
    return fm_bell(midi, dur, ratio=ratio, index=index * bright, seed=int(r.integers(1 << 30)), decay=decay)


def glass(r, dur, f0, decay=0.5):
    n = secs(dur)
    t = tl(n)
    y = np.zeros(n)
    for rt, a, d in ((1.0, 1.0, 1.0), (2.76, 0.5, 0.6), (5.40, 0.3, 0.35), (8.93, 0.15, 0.2)):
        y += a * np.sin(TAU * f0 * rt * t + r.uniform(0, TAU)) * np.exp(-t / (decay * d))
    return y * np.clip(t / 0.001, 0, 1)


# ------------------------------------------------------------------ designs

def s_swing_light(v):
    r = rng(1000 + v)
    dur = [0.2, 0.24, 0.18][v % 3]
    f0, f1, f2 = [(500, 2600, 1100), (650, 3200, 1400), (420, 2200, 900)][v % 3]
    y = whoosh(r, dur, f0, f1, f2, q=1.1, peak=0.2, air=0.45, sing=0.12, sing_f=[2600, 2900, 2300][v % 3], shimmer=0.07)
    return y


def s_swing_heavy(v):
    r = rng(1100 + v)
    dur = 0.42 + 0.05 * v
    w = whoosh(r, dur, 250, 1500, 500, q=0.9, peak=0.2, air=0.3, sing=0.1, sing_f=1500, shimmer=0.12)
    n = len(w)
    sub = thump(r, dur, 90, 45, 0.25, 1.1) * np.exp(-((tl(n) - dur * 0.2) / 0.1) ** 2)
    return _n(w + 0.35 * sub)


def s_swing_musou(v):
    r = rng(1200 + v)
    dur = 0.22 + 0.03 * (v % 2)
    w = whoosh(r, dur, 700, 3800, 1500, q=1.2, peak=0.18, air=0.5, sing=0.1, sing_f=3000 + 300 * v, shimmer=0.25)
    return w


def s_hit_light(v):
    r = rng(1300 + v)
    n = secs(0.34)
    tear = noise_burst(r, 0.12, 1200, 5500, 0.035)
    tear = saturate(tear * 2.0, 1.0)
    body = thump(r, 0.2, 170 + 15 * v, 75, 0.06, 1.6)
    punch = thump(r, 0.12, 420 + 30 * v, 190, 0.028, 1.8)
    thwack = saturate(noise_burst(r, 0.1, 300, 1600, 0.03) * 2.0, 1.0)
    spark = debris(r, 0.25, 8, 3500, 9000, (0.002, 0.008), 0.05, 0.3)
    y = mix(n, (click(r, 0.004, 2500, 12000), 0.8, 0), (tear, 0.8, 0.002), (body, 0.4, 0), (punch, 0.55, 0), (thwack, 0.9, 0.001), (spark, 0.2, 0.015))
    return _n(fade_end(room(y, 0.35, 0.12)))


def s_hit_heavy(v):
    r = rng(1400 + v)
    n = secs(0.7)
    crunch = saturate(noise_burst(r, 0.25, 150, 3500, 0.07) * 3.0, 1.0)
    body = thump(r, 0.5, 130 + 10 * v, 48, 0.16, 2.0)
    scrape = metal(r, 0.25, 1650 + 120 * v, [1, 1.52, 2.33], [0.05, 0.035, 0.02], [1, 0.6, 0.4]) * 0.5
    spark = debris(r, 0.4, 14, 2500, 9000, (0.002, 0.01), 0.08, 0.35)
    punch = thump(r, 0.2, 330 + 20 * v, 150, 0.05, 2.0)
    y = mix(n, (click(r, 0.005, 1500, 10000), 1.0, 0), (crunch, 0.9, 0.002), (body, 0.6, 0), (punch, 0.55, 0), (scrape, 0.35, 0.004), (spark, 0.22, 0.02))
    return _n(fade_end(room(y, 0.6, 0.18)))


def s_hit_finisher(v):
    r = rng(1500 + v)
    n = secs(1.3)
    crack = saturate(noise_burst(r, 0.3, 400, 8000, 0.04) * 3, 1.0)
    body = thump(r, 0.9, 110, 38, 0.3, 2.5)
    crunch = saturate(noise_burst(r, 0.4, 120, 2500, 0.12) * 3, 1.0)
    shatter = debris(r, 1.0, 40, 1800, 7500, (0.004, 0.03), 0.18, 0.7)
    ring = metal(r, 1.0, 420, [1, 2.1, 3.6, 5.2], [0.4, 0.25, 0.15, 0.1], [1, 0.6, 0.4, 0.25]) * 0.25
    punch = thump(r, 0.25, 300, 130, 0.06, 2.2)
    y = mix(n, (click(r, 0.006, 1200, 12000), 1.0, 0), (crack, 0.7, 0.001), (body, 0.75, 0), (punch, 0.5, 0), (crunch, 0.75, 0.004),
            (shatter, 0.35, 0.02), (ring, 0.35, 0.0))
    return _n(fade_end(room(y, 1.1, 0.25)))


def s_hit_prop(v):  # crate / jar / barrel struck but not broken
    r = rng(1600 + v)
    n = secs(0.3)
    wood = modal(n, [240 + 30 * v, 520, 910, 1480], [0.05, 0.03, 0.02, 0.012], [1, 0.7, 0.45, 0.3], r, 0.03)
    y = mix(n, (click(r, 0.004, 1500, 8000), 0.6, 0), (wood, 1.0, 0), (noise_burst(r, 0.1, 400, 3000, 0.02), 0.4, 0))
    return _n(fade_end(room(y, 0.3, 0.1)))


def s_hit_lantern(v):
    r = rng(1650 + v)
    n = secs(0.35)
    paper = debris(r, 0.25, 22, 1200, 5000, (0.002, 0.006), 0.04, 0.1)
    frame = modal(n, [380, 720, 1300], [0.04, 0.03, 0.02], [1, 0.6, 0.4], r)
    buzz = sine(np.full(n, 110.0)) * np.sign(sine(np.full(n, 55.0))) * np.exp(-tl(n) / 0.1) * 0.3
    y = mix(n, (click(r, 0.004), 0.5, 0), (paper, 0.8, 0), (frame, 0.8, 0), (buzz, 0.6, 0))
    return _n(fade_end(room(y, 0.4, 0.12)))


def s_guard(v):
    r = rng(1700 + v)
    n = secs(1.3)
    f0 = [760, 820, 700][v % 3]
    ring = metal(r, 1.3, f0, [1, 2.32, 4.25, 6.63, 9.38], [0.45, 0.28, 0.16, 0.1, 0.06], [1, 0.7, 0.5, 0.3, 0.2])
    y = mix(n, (click(r, 0.003, 3000, 14000), 1.2, 0), (noise_burst(r, 0.05, 3000, 10000, 0.01), 0.6, 0),
            (ring, 0.45, 0), (thump(r, 0.08, 220, 150, 0.02), 0.5, 0))
    return _n(fade_end(room(y, 0.8, 0.2)))


def s_guard_break(v):
    r = rng(1800 + v)
    n = secs(1.3)
    ring = metal(r, 1.2, 560, [1, 2.32, 4.25, 6.63], [0.5, 0.3, 0.16, 0.1], [1, 0.7, 0.5, 0.3])
    shatter = debris(r, 1.0, 55, 2000, 9000, (0.003, 0.025), 0.2, 0.75)
    down = whoosh(r, 0.5, 3000, 900, 300, q=1.0, peak=0.15, air=0.2)
    body = thump(r, 0.6, 120, 45, 0.18, 2.0)
    y = mix(n, (click(r, 0.004, 2000, 14000), 1.2, 0), (ring, 0.4, 0), (shatter, 0.45, 0.01), (down, 0.35, 0.02), (body, 0.9, 0))
    return _n(fade_end(room(y, 1.0, 0.25)))


def s_oni(v):
    r = rng(1900 + v)
    if v == 0:   # attack shout "hah!"
        y = voice(r, 0.36, [120, 135, 110, 90], 'a', 'o', scale=0.78, growl=0.4, sub=0.45, breath=0.14, drive=2.0, attack=0.015, release=0.12)
    elif v == 1:   # growl "grrr"
        y = voice(r, 0.55, [85, 92, 80, 75], 'o', 'u', scale=0.72, growl=0.75, sub=0.55, breath=0.18, drive=2.4, attack=0.04, release=0.18, am=24)
    elif v == 2:   # hurt grunt "ugh"
        y = voice(r, 0.3, [130, 110, 80], 'e', 'o', scale=0.8, growl=0.3, sub=0.35, breath=0.12, drive=1.8, attack=0.01, release=0.1)
    else:
        y = voice(r, 0.42, [100, 115, 95, 70], 'a', 'u', scale=0.75, growl=0.55, sub=0.5, breath=0.15, drive=2.2, attack=0.02, release=0.15)
    return _n(fade_end(room(pad_tail(y, 0.15), 0.4, 0.12)))


def s_boss_roar(v):
    r = rng(2000 + v)
    dur = 1.9
    y = voice(r, dur, [55, 70, 88, 84, 78, 62, 50], 'o', 'a', scale=0.62, growl=0.85, sub=0.8, breath=0.45, drive=3.5,
              attack=0.12, release=0.5, am=31)
    y2 = voice(rng(2050 + v), dur, [82, 104, 131, 125, 116, 93, 75], 'u', 'a', scale=0.7, growl=0.6, sub=0.3, breath=0.3,
               drive=3.0, attack=0.15, release=0.5, am=27)
    n = len(y)
    rumble = butter_lp(r.standard_normal(n), 120) * np.sin(np.linspace(0, math.pi, n)) ** 1.5
    out = y + 0.55 * y2 + 1.2 * _n(rumble)
    return _n(fade_end(room(pad_tail(out, 0.8), 1.6, 0.3, damp=3500, size=1.0)))


def s_boss_grunt(v):
    r = rng(2100 + v)
    y = voice(r, 0.6, [70, 84, 72, 58], 'o', 'a', scale=0.64, growl=0.7, sub=0.8, breath=0.35, drive=3.2, attack=0.03, release=0.2)
    return _n(fade_end(room(pad_tail(y, 0.3), 0.8, 0.2, damp=3500)))


def s_soul_burst(v):
    r = rng(2200 + v)
    n = secs(0.95)
    poof = thump(r, 0.25, 110, 50, 0.07, 1.3)
    puff = noise_burst(r, 0.3, 100, 900, 0.07, 0.004)
    swirl = whoosh(r, 0.55, 700, 5200, 3000, q=1.6, peak=0.55, air=0.2, shimmer=0.25)
    sets = [[88, 91, 93, 96], [86, 89, 93, 98], [88, 93, 95, 100]]
    notes = np.zeros(n)
    for k, m in enumerate(sets[v % 3]):
        b = bell(m, 0.6, r, 0.8, 0.22, ratio=2.0 + 0.5 * (k % 2), index=1.4)
        a = secs(0.03 + 0.045 * k)
        notes[a:a + len(b)] += b[: n - a] * (0.9 - 0.12 * k)
    y = mix(n, (poof, 0.45, 0), (puff, 0.35, 0), (swirl, 0.45, 0.02), (notes, 0.25, 0))
    return _n(fade_end(room(y, 0.9, 0.3, damp=7000)))


def s_launch(v):
    r = rng(2300 + v)
    n = secs(0.45)
    up = whoosh(r, 0.4, 350, 2400, 2000, q=1.0, peak=0.35, air=0.25)
    y = mix(n, (thump(r, 0.15, 150, 80, 0.05), 0.7, 0), (up, 0.6, 0.0))
    return _n(fade_end(y))


def s_land(v):
    r = rng(2400 + v)
    n = secs(0.45)
    dust = noise_burst(r, 0.3, 200, 1800, 0.08, 0.003)
    scuff = noise_burst(r, 0.12, 600, 3500, 0.03)
    y = mix(n, (thump(r, 0.3, 100, 48, 0.09, 1.8), 0.5, 0), (thump(r, 0.12, 240, 120, 0.03, 1.5), 0.6, 0), (dust, 0.7, 0.002),
            (scuff, 0.6, 0.001), (click(r, 0.003, 800, 5000), 0.4, 0))
    return _n(fade_end(room(y, 0.4, 0.1)))


def s_jump(v):
    r = rng(2500 + v)
    n = secs(0.3)
    up = whoosh(r, 0.24, 500, 2600, 1800, q=0.9, peak=0.3, air=0.3)
    scuff = noise_burst(r, 0.06, 500, 4000, 0.015)
    y = mix(n, (scuff, 0.5, 0), (up, 0.7, 0.01))
    return _n(fade_end(y))


def s_plunge(v):
    r = rng(2600 + v)
    n = secs(1.5)
    body = thump(r, 1.2, 120, 36, 0.35, 2.8)
    crack = saturate(noise_burst(r, 0.2, 300, 7000, 0.04) * 3, 1.0)
    rocks = debris(r, 1.2, 45, 250, 2500, (0.005, 0.04), 0.25, 0.35)
    dust = whoosh(r, 0.9, 1500, 500, 200, q=0.8, peak=0.08, air=0.1)
    ringf = 180 * np.exp(-tl(secs(0.8)) / 0.4) + 90
    ring = sine(ringf) * np.exp(-tl(secs(0.8)) / 0.25)
    y = mix(n, (click(r, 0.006, 1000, 12000), 1.0, 0), (body, 0.8, 0), (crack, 0.8, 0.002), (rocks, 0.5, 0.03), (dust, 0.45, 0.01), (ring, 0.3, 0))
    return _n(fade_end(room(y, 1.2, 0.25, damp=4500)))


def s_pickup_charm(v):
    r = rng(2700 + v)
    n = secs(1.0)
    a = bell(88, 0.9, r, 0.6, 0.35, ratio=2.0, index=1.2)
    b = bell(95, 0.9, r, 0.6, 0.4, ratio=2.0, index=1.2)
    sh = whoosh(r, 0.5, 2500, 7000, 5000, q=1.8, peak=0.6, air=0.1)
    y = mix(n, (a, 0.8, 0), (b, 0.8, 0.075), (sh, 0.18, 0.02))
    return _n(fade_end(room(y, 1.0, 0.3, damp=8000)))


def s_pickup_lamp(v):
    r = rng(2800 + v)
    n = secs(1.6)
    y = np.zeros(n)
    for k, m in enumerate([81, 85, 88, 93]):
        b = bell(m, 1.2, r, 0.7, 0.5, ratio=2.0, index=1.0)
        a = secs(0.06 * k)
        y[a:a + len(b)] += b[: n - a] * 0.7
    pad = supersaw_chord([69, 73, 76, 81], 0.6, seed=v, voices=5, attack=0.12, release=0.35, cutoff=2200)
    pad = pad.mean(axis=1)
    warm = sine(np.full(secs(0.9), 220.0)) * np.sin(np.linspace(0, math.pi, secs(0.9))) ** 2
    y = mix(n, (y, 1.0, 0), (pad, 0.6, 0.0), (warm, 0.25, 0))
    return _n(fade_end(room(y, 1.4, 0.35, damp=8000)))


def s_pickup_crystal(v):
    r = rng(2900 + v)
    n = secs(1.3)
    y = np.zeros(n)
    for k, f in enumerate([1318, 1760, 2093, 2637, 3136]):
        g = glass(r, 0.7, f, 0.35)
        a = secs(0.035 * k)
        y[a:a + len(g)] += g[: n - a] * (0.6 - 0.05 * k)
    rise = whoosh(r, 0.6, 600, 4500, 4000, q=1.8, peak=0.7, air=0.1, shimmer=0.4)
    hum = sine(np.linspace(110, 165, secs(0.8))) * np.sin(np.linspace(0, math.pi, secs(0.8))) ** 2
    hum = saturate(hum * 2, 1.0)
    y = mix(n, (y, 0.8, 0), (rise, 0.35, 0), (hum, 0.25, 0.05))
    return _n(fade_end(room(y, 1.2, 0.35, damp=9000)))


def _choir_stab(midis, dur, vowel='a', seed=0):
    parts = ['bass', 'tenor', 'alto', 'soprano']
    n = secs(dur + 1.2)
    y = np.zeros(n)
    for p, m in zip(parts, midis):
        y += choir_part([(0, dur, m, 1.0)], n, p, vowel, seed=seed + len(p), unison=5)
    return _n(y)


def s_musou_start(v):
    true = v == 1
    r = rng(3000 + v)
    dur = 2.6 if true else 2.1
    n = secs(dur)
    # unsheath: metal scrape rising + ringing edge
    sc = whoosh(r, 0.45, 2500, 8000, 6000, q=2.0, peak=0.7, air=0.4)
    edge = metal(r, 1.2, 1780, [1, 1.51, 2.39, 3.3], [0.5, 0.35, 0.2, 0.12], [1, 0.6, 0.4, 0.25]) * np.clip(tl(secs(1.2)) / 0.2, 0, 1)
    tk = taiko(3000 + v, pitch=0.8 if true else 1.0, length=1.8)
    boom = thump(r, 1.4, 90, 40 if true else 48, 0.45, 2.2)
    ch = _choir_stab([45, 57, 64, 69] if not true else [38, 50, 57, 65], 0.9 if not true else 1.3, 'a', seed=v)
    swell = whoosh(r, dur * 0.8, 200, 5000, 6000, q=0.9, peak=0.92, air=0.25, shimmer=0.35)
    stab = brass_stab([57, 64, 69] if not true else [50, 57, 62, 65], 0.5, seed=v).mean(axis=1)
    layers = [(sc, 0.35, 0), (edge, 0.12, 0.25), (tk, 0.8, 0), (boom, 0.7, 0), (ch, 0.35, 0.02), (swell, 0.35, 0.1), (stab, 0.3, 0)]
    if true:
        crackle = debris(r, 2.0, 70, 3000, 10000, (0.001, 0.004), 0.7, 0.2)
        low = _choir_stab([26, 38, 45, 50], 1.5, 'o', seed=9)
        layers += [(crackle, 0.15, 0.2), (low, 0.25, 0.05)]
    y = mix(n, *layers)
    return _n(fade_end(room(y, 1.8, 0.3, damp=6000, size=1.1), 0.2))


def s_musou_finish(v):
    true = v == 1
    r = rng(3100 + v)
    dur = 3.4 if true else 2.8
    n = secs(dur)
    boom = thump(r, dur, 95, 34, 0.65 if true else 0.5, 3.0)
    crack = saturate(noise_burst(r, 0.25, 500, 10000, 0.05) * 3, 1.0)
    m = secs(dur)
    x = np.linspace(0, 1, m)
    blast = lp(r.standard_normal(m), 9000 * (0.035 ** x), 0.8) * np.exp(-x * dur / 0.7)
    blast = saturate(_n(blast) * 2.0, 1.0)
    shards = debris(r, dur, 80 if true else 55, 1500, 8000, (0.004, 0.04), 0.5, 0.6)
    ring = sum(bell(mm, dur, r, 0.8, 1.2, ratio=1.41, index=2.0) for mm in ([57, 64, 69, 76] if not true else [50, 57, 62, 65, 74]))
    tk = taiko(3100 + v, pitch=0.75, length=2.2)
    layers = [(click(r, 0.008, 800, 14000), 1.0, 0), (boom, 1.0, 0), (crack, 0.5, 0.001), (blast, 0.55, 0.004),
              (shards, 0.25, 0.03), (ring, 0.06, 0.0), (tk, 0.6, 0)]
    if true:
        layers += [(thump(r, 1.5, 80, 30, 0.5, 2.5), 0.8, 0.14), (_choir_stab([38, 50, 57, 65], 1.2, 'a', seed=11), 0.3, 0.05)]
    y = mix(n, *layers)
    return _n(fade_end(room(y, 2.2, 0.3, damp=5000, size=1.2), 0.3))


def s_officer_down(v):
    r = rng(3200 + v)
    n = secs(2.4)
    tk = taiko(3200, pitch=0.9, length=2.2)
    gong = metal(r, 2.4, 196, [1, 1.52, 2.03, 2.71, 3.4, 4.3], [1.4, 1.0, 0.7, 0.5, 0.35, 0.25], [1, 0.8, 0.6, 0.45, 0.3, 0.2], beat=1.2)
    gong *= np.clip(tl(len(gong)) / 0.004, 0, 1)
    stab = brass_stab([57, 60, 64, 69], 0.35, seed=4, vel=1.0).mean(axis=1)
    cr = crash(3200, 2.4)
    y = mix(n, (tk, 1.0, 0), (gong, 0.45, 0.0), (stab, 0.55, 0), (thump(r, 1.2, 80, 38, 0.4, 2.0), 0.5, 0), (cr, 0.3, 0))
    return _n(fade_end(room(y, 1.8, 0.28, damp=5000, size=1.1), 0.2))


def s_officer_appear(v):
    r = rng(3250 + v)
    n = secs(1.4)
    tk = taiko(3250, pitch=1.1, length=1.3)
    glint = metal(r, 0.6, 2400, [1, 1.5, 2.2], [0.25, 0.15, 0.1], [1, 0.6, 0.4])
    shout = voice(r, 0.4, [110, 128, 100], 'a', 'o', scale=0.76, growl=0.5, sub=0.5, drive=3.0)
    y = mix(n, (tk, 1.0, 0), (glint, 0.15, 0.02), (shout, 0.5, 0.08), (thump(r, 0.6, 70, 40, 0.2), 0.5, 0))
    return _n(fade_end(room(y, 1.2, 0.25)))


def s_gate_open(v):
    r = rng(3300 + v)
    n = secs(2.4)
    y = np.zeros(n)
    for k, m in enumerate([100, 98, 96, 93, 91, 88, 86, 84]):
        b = glass(r, 0.9, float(midi_hz(m)), 0.4)
        a = secs(0.05 * k)
        y[a:a + len(b)] += b[: n - a] * (0.5 + 0.05 * k)
    swell = whoosh(r, 1.6, 150, 1800, 3500, q=0.8, peak=0.35, air=0.2, shimmer=0.3)
    dissolve = debris(r, 2.0, 60, 3000, 9000, (0.002, 0.01), 0.6, 0.8)
    sub = sine(np.linspace(55, 82, secs(1.4))) * np.sin(np.linspace(0, math.pi, secs(1.4))) ** 2
    y = mix(n, (y, 0.4, 0), (swell, 0.5, 0), (dissolve, 0.15, 0.1), (sub, 0.4, 0))
    return _n(fade_end(room(y, 2.0, 0.35, damp=7000, size=1.1), 0.2))


def s_gate_close(v):
    r = rng(3350 + v)
    n = secs(1.4)
    hum = saturate(sine(np.full(secs(1.2), 73.0)) * np.exp(-tl(secs(1.2)) / 0.4) * 2, 1.0)
    shim = whoosh(r, 0.5, 5000, 1800, 900, q=1.2, peak=0.1, air=0.1, shimmer=0.3)
    clack = modal(secs(0.3), [420, 910, 1530], [0.06, 0.04, 0.025], [1, 0.7, 0.4], r)
    y = mix(n, (thump(r, 0.8, 110, 42, 0.25, 2.0), 0.5, 0), (clack, 0.85, 0), (hum, 0.35, 0), (shim, 0.5, 0), (click(r, 0.004, 1000, 8000), 0.5, 0))
    return _n(fade_end(room(y, 1.2, 0.25)))


def s_lantern_break(v):
    r = rng(3400 + v)
    n = secs(1.5)
    paper = debris(r, 0.8, 60, 900, 5000, (0.002, 0.008), 0.12, 0.05)
    glassy = debris(r, 1.0, 35, 2500, 8000, (0.005, 0.03), 0.15, 0.85)
    fire = whoosh(r, 0.9, 200, 1400, 400, q=0.7, peak=0.25, air=0.1)
    hiss_f = np.linspace(330, 180, secs(1.0))
    hiss = (saw(hiss_f) + saw(hiss_f * 1.06)) * np.exp(-tl(secs(1.0)) / 0.3)
    hiss = butter_bp(hiss, 300, 3000)
    y = mix(n, (click(r, 0.005, 1500, 10000), 0.8, 0), (thump(r, 0.4, 140, 60, 0.12, 1.8), 0.8, 0), (paper, 0.4, 0.0),
            (glassy, 0.35, 0.01), (fire, 0.5, 0.02), (hiss, 0.12, 0.03))
    return _n(fade_end(room(y, 1.0, 0.25)))


def s_lamp_hit(v):
    r = rng(3500 + v)
    n = secs(0.8)
    clonk = metal(r, 0.8, 330 + 20 * v, [1, 2.1, 2.9, 4.4], [0.25, 0.18, 0.1, 0.06], [1, 0.8, 0.5, 0.3], beat=6.0)
    ping = metal(r, 0.6, 1480 + 60 * v, [1, 1.06], [0.18, 0.12], [1, 0.8], beat=11.0)
    y = mix(n, (click(r, 0.004, 1000, 8000), 0.7, 0), (clonk, 0.5, 0), (ping, 0.14, 0), (thump(r, 0.2, 160, 90, 0.05), 0.45, 0),
            (debris(r, 0.3, 10, 2000, 6000, (0.002, 0.006), 0.05, 0.4), 0.2, 0.01))
    return _n(fade_end(room(y, 0.7, 0.2)))


def s_lamp_break(v):
    r = rng(3600 + v)
    n = secs(2.2)
    crack = metal(r, 1.5, 290, [1, 2.1, 2.9, 4.4, 6.1], [0.6, 0.4, 0.25, 0.15, 0.1], [1, 0.8, 0.6, 0.4, 0.3], beat=9.0)
    shatter = debris(r, 1.2, 60, 1500, 8000, (0.004, 0.03), 0.25, 0.75)
    drone_f = np.linspace(98, 92, secs(1.8))
    drone = butter_lp(saw(drone_f) + saw(drone_f * 1.059) + saw(drone_f * 1.5), 900) * np.sin(np.linspace(0, math.pi, secs(1.8))) ** 1.2
    y = mix(n, (click(r, 0.006, 1000, 12000), 1.0, 0), (thump(r, 0.7, 110, 45, 0.2, 2.0), 0.9, 0), (crack, 0.3, 0),
            (shatter, 0.4, 0.01), (drone, 0.18, 0.05))
    return _n(fade_end(room(y, 1.4, 0.3), 0.2))


def s_lamp_secured(v):
    r = rng(3700 + v)
    n = secs(2.2)
    y = np.zeros(n)
    for k, m in enumerate([81, 85, 88, 93, 97]):
        b = bell(m, 1.8, r, 0.7, 0.8, ratio=2.0, index=1.1)
        a = secs(0.07 * k)
        y[a:a + len(b)] += b[: n - a] * 0.6
    pad = supersaw_chord([57, 64, 69, 73, 76], 1.1, seed=3, voices=5, attack=0.2, release=0.6, cutoff=2400).mean(axis=1)
    y = mix(n, (y, 0.8, 0), (pad, 0.55, 0), (thump(r, 0.6, 90, 55, 0.2, 1.2), 0.35, 0))
    return _n(fade_end(room(y, 1.6, 0.35, damp=8000), 0.2))


def s_ui_click(v):
    r = rng(3800 + v)
    n = secs(0.09)
    wood = modal(n, [1850, 2930, 4400], [0.012, 0.008, 0.005], [1, 0.6, 0.3], r)
    y = mix(n, (click(r, 0.002, 2000, 9000), 0.4, 0), (wood, 1.0, 0))
    return _n(fade_end(y, 0.02))


def s_hurt(v):
    r = rng(3900 + v)
    n = secs(0.45)
    body = butter_lp(thump(r, 0.3, 120 - 10 * v, 55, 0.08, 2.0), 1500)
    cloth = noise_burst(r, 0.12, 400, 2500, 0.03)
    zap = debris(r, 0.3, 12, 1800, 5000, (0.002, 0.006), 0.06, 0.2)
    punch = thump(r, 0.15, 280 - 20 * v, 140, 0.04, 2.0)
    crunch = saturate(noise_burst(r, 0.12, 350, 2200, 0.035) * 2.5, 1.0)
    y = mix(n, (click(r, 0.004, 600, 5000), 0.6, 0), (body, 0.4, 0), (punch, 0.9, 0), (cloth, 0.75, 0.002), (crunch, 0.7, 0.003), (zap, 0.3, 0.01))
    return _n(fade_end(room(y, 0.4, 0.12)))


def s_dodge(v):
    r = rng(4000 + v)
    n = secs(0.35)
    w = whoosh(r, 0.3, 350, 1800, 700, q=0.8, peak=0.25, air=0.3)
    y = mix(n, (noise_burst(r, 0.07, 800, 5000, 0.015), 0.4, 0), (w, 0.8, 0.0))
    return _n(fade_end(y))


def s_sidestep(v):
    r = rng(4050 + v)
    return whoosh(r, 0.22, 450, 2000, 800, q=0.8, peak=0.3, air=0.25)


def s_boss_slam(v):
    r = rng(4100 + v)
    n = secs(1.9)
    body = thump(r, 1.6, 90, 30, 0.5, 3.0)
    rocks = debris(r, 1.5, 70, 150, 2200, (0.006, 0.05), 0.35, 0.3)
    crack = saturate(noise_burst(r, 0.35, 200, 6000, 0.06) * 3, 1.0)
    rumble = butter_lp(r.standard_normal(secs(1.8)), 140) * np.exp(-tl(secs(1.8)) / 0.5)
    y = mix(n, (click(r, 0.008, 500, 9000), 1.0, 0), (body, 0.8, 0), (crack, 0.85, 0.002), (rocks, 0.55, 0.03), (_n(rumble), 0.45, 0.01))
    return _n(fade_end(room(y, 1.4, 0.25, damp=3500, size=1.1), 0.2))


def s_boss_sweep(v):
    r = rng(4200 + v)
    n = secs(0.8)
    w = whoosh(r, 0.7, 160, 1100, 350, q=0.8, peak=0.22, air=0.25)
    sub = thump(r, 0.7, 70, 40, 0.3, 1.5) * np.sin(np.linspace(0, math.pi, secs(0.7)))
    edge = whoosh(r, 0.6, 1200, 4200, 1500, q=2.2, peak=0.22, air=0.1)
    y = mix(n, (w, 1.0, 0), (sub, 0.5, 0), (edge, 0.25, 0.04))
    return _n(fade_end(room(y, 0.8, 0.2)))


def s_boss_jump(v):
    r = rng(4250 + v)
    n = secs(0.8)
    up = whoosh(r, 0.7, 150, 1400, 900, q=0.8, peak=0.6, air=0.2)
    y = mix(n, (thump(r, 0.3, 90, 50, 0.1, 2.0), 0.8, 0), (up, 0.8, 0.02))
    return _n(fade_end(room(y, 0.8, 0.2)))


def s_boss_intro(v):
    r = rng(4300 + v)
    n = secs(3.2)
    t1 = taiko(4300, pitch=0.7, length=2.4)
    t2 = taiko(4301, pitch=0.75, length=2.4)
    drone_f = np.full(secs(3.0), 65.4)
    drone = butter_lp(saw(drone_f) + saw(drone_f * 1.059) + 0.7 * saw(drone_f * 1.498) + 0.5 * saw(drone_f * 2.12), 700)
    drone *= np.clip(tl(len(drone)) / 1.2, 0, 1) ** 2 * np.clip((3.0 - tl(len(drone))) / 0.8, 0, 1)
    ch = _choir_stab([36, 48, 55, 61], 2.0, 'o', seed=21)
    cluster = brass_stab([48, 49, 55, 60], 1.6, seed=7, vel=0.8).mean(axis=1)
    y = mix(n, (t1, 1.0, 0), (t2, 0.9, 0.43), (drone, 0.35, 0), (ch, 0.6, 0.1), (cluster, 0.5, 0.43), (thump(r, 1.5, 70, 32, 0.5, 2.0), 0.35, 0))
    return _n(fade_end(room(y, 2.2, 0.3, damp=4000, size=1.2), 0.3))


def s_telegraph(v):
    r = rng(4400 + v)
    n = secs(0.35)
    glint = metal(r, 0.35, 3100 + 200 * v, [1, 1.47, 2.09], [0.09, 0.06, 0.04], [1, 0.5, 0.3])
    sw = whoosh(r, 0.2, 3000, 7000, 5000, q=2.5, peak=0.6, air=0.2)
    y = mix(n, (sw, 0.4, 0), (glint, 0.5, 0.08))
    return _n(fade_end(y))


def s_summon(v):
    r = rng(4500 + v)
    n = secs(1.5)
    rev = whoosh(r, 1.0, 200, 2000, 2200, q=0.9, peak=0.9, air=0.15)
    ch = _choir_stab([36, 43, 49, 55], 1.0, 'o', seed=31)
    y = mix(n, (rev, 0.6, 0), (ch, 0.35, 0.1), (thump(r, 0.6, 80, 45, 0.2, 1.5), 0.6, 0.95))
    return _n(fade_end(room(y, 1.2, 0.3), 0.15))


def s_break_wood(v):
    r = rng(4600 + v)
    n = secs(0.8)
    cracks = np.zeros(n)
    for k in range(6):
        a = secs(r.uniform(0, 0.08) + 0.012 * k)
        m = modal(secs(0.12), [r.uniform(250, 420), r.uniform(600, 900), r.uniform(1200, 1800), r.uniform(2400, 3200)],
                  [0.03, 0.02, 0.012, 0.008], [1, 0.7, 0.5, 0.3], r)
        cracks[a:a + len(m)] += m[: n - a] * r.uniform(0.4, 1.0)
    splinters = debris(r, 0.5, 30, 1500, 6000, (0.002, 0.008), 0.08, 0.1)
    y = mix(n, (click(r, 0.005, 1000, 8000), 0.8, 0), (thump(r, 0.25, 140, 70, 0.06, 1.5), 0.8, 0), (cracks, 0.5, 0), (splinters, 0.35, 0.005))
    return _n(fade_end(room(y, 0.6, 0.18)))


def s_break_jar(v):
    r = rng(4700 + v)
    n = secs(0.9)
    shards = debris(r, 0.8, 50, 1800, 7000, (0.004, 0.03), 0.12, 0.85)
    y = mix(n, (click(r, 0.004, 1500, 12000), 0.9, 0), (thump(r, 0.2, 180, 90, 0.04), 0.6, 0), (shards, 0.6, 0.004),
            (noise_burst(r, 0.2, 2000, 9000, 0.05), 0.25, 0))
    return _n(fade_end(room(y, 0.6, 0.18)))


def s_drop(v):
    r = rng(4800 + v)
    n = secs(0.35)
    b = glass(r, 0.3, 2637 + 200 * v, 0.12)
    y = mix(n, (b, 0.5, 0), (click(r, 0.003, 2000, 8000), 0.3, 0))
    return _n(fade_end(y))


def s_heal(v):
    r = rng(4900 + v)
    n = secs(1.2)
    rise = whoosh(r, 0.9, 900, 5000, 5500, q=1.5, peak=0.75, air=0.1, shimmer=0.3)
    y = np.zeros(n)
    for k, m in enumerate([81, 88, 93]):
        b = bell(m, 0.8, r, 0.5, 0.4, ratio=2.0, index=0.8)
        a = secs(0.25 + 0.08 * k)
        y[a:a + len(b)] += b[: n - a] * 0.5
    return _n(fade_end(room(mix(n, (rise, 0.5, 0), (y, 0.6, 0)), 1.0, 0.3, damp=8000)))


# id -> (design fn, variants, target loudness LUFS-M-max, peak dBFS)
DESIGNS = {
    'swing_light': (s_swing_light, 3, -17, -3),
    'swing_heavy': (s_swing_heavy, 2, -15, -2),
    'swing_musou': (s_swing_musou, 3, -17, -3),
    'hit_light': (s_hit_light, 4, -14, -1),
    'hit_heavy': (s_hit_heavy, 3, -12, -1),
    'hit_finisher': (s_hit_finisher, 2, -11, -1),
    'hit_prop': (s_hit_prop, 2, -16, -2),
    'hit_lantern': (s_hit_lantern, 2, -16, -2),
    'guard': (s_guard, 3, -14, -1),
    'guard_break': (s_guard_break, 2, -12, -1),
    'oni': (s_oni, 4, -16, -2),
    'boss_roar': (s_boss_roar, 1, -12, -1),
    'boss_grunt': (s_boss_grunt, 2, -14, -1),
    'soul_burst': (s_soul_burst, 3, -17, -2),
    'launch': (s_launch, 2, -17, -3),
    'land': (s_land, 2, -16, -2),
    'jump': (s_jump, 2, -19, -4),
    'plunge': (s_plunge, 1, -11, -1),
    'pickup_charm': (s_pickup_charm, 1, -17, -3),
    'pickup_lamp': (s_pickup_lamp, 1, -16, -3),
    'pickup_crystal': (s_pickup_crystal, 1, -16, -3),
    'musou_start': (s_musou_start, 2, -11, -1),
    'musou_finish': (s_musou_finish, 2, -10, -1),
    'officer_down': (s_officer_down, 1, -12, -1),
    'officer_appear': (s_officer_appear, 1, -14, -1),
    'gate_open': (s_gate_open, 1, -14, -2),
    'gate_close': (s_gate_close, 1, -16, -2),
    'lantern_break': (s_lantern_break, 2, -13, -1),
    'lamp_hit': (s_lamp_hit, 2, -16, -2),
    'lamp_break': (s_lamp_break, 1, -12, -1),
    'lamp_secured': (s_lamp_secured, 1, -14, -2),
    'ui_click': (s_ui_click, 2, -24, -8),
    'hurt': (s_hurt, 2, -14, -1),
    'dodge': (s_dodge, 2, -19, -4),
    'sidestep': (s_sidestep, 1, -21, -6),
    'boss_slam': (s_boss_slam, 1, -11, -1),
    'boss_sweep': (s_boss_sweep, 1, -14, -2),
    'boss_jump': (s_boss_jump, 1, -16, -2),
    'boss_intro': (s_boss_intro, 1, -12, -1),
    'telegraph': (s_telegraph, 2, -20, -6),
    'summon': (s_summon, 1, -16, -2),
    'break_wood': (s_break_wood, 2, -14, -1),
    'break_jar': (s_break_jar, 2, -14, -1),
    'drop': (s_drop, 2, -24, -8),
    'heal': (s_heal, 1, -19, -4),
}


def momentary_max(x):
    from scipy import signal
    from dsp import _kweight_sos
    y = signal.sosfilt(_kweight_sos(), np.concatenate([x, np.zeros(secs(0.4))]))
    blk = secs(0.4)
    hop = secs(0.02)
    best = -120.0
    for s in range(0, max(1, len(y) - blk), hop):
        best = max(best, -0.691 + 10 * np.log10(np.mean(y[s:s + blk] ** 2) + 1e-12))
    return best


def render_all(only=None):
    out = {}
    for sid, (fn, nv, target, peak) in DESIGNS.items():
        if only and sid not in only:
            continue
        vs = []
        for v in range(nv):
            x = np.asarray(fn(v), dtype=float)
            x = butter_hp(x, 35)
            # trim leading silence (keep the transient on sample 0) and trailing silence
            thr = np.max(np.abs(x)) * db(-60)
            nz = np.where(np.abs(x) > thr)[0]
            x = x[max(0, nz[0] - 16): nz[-1] + 1]
            x = fade_end(x, 0.02)
            g = db(target - momentary_max(x))
            x = x * g
            # sample-peak cap leaves ≥ 2 dB for MP3 overshoot (the decoded sprite must stay below 0 dBTP)
            pk = np.max(np.abs(x))
            cap = db(min(peak, -2.0))
            if pk > cap:
                x = x * cap / pk
            vs.append(x)
        out[sid] = vs
    return out


def build_sprite():
    sounds = render_all()
    mk = secs(MARKER_LEN)
    marker = np.sin(TAU * 2000 * tl(mk)) * np.hanning(mk) * 0.9
    at = secs(MARKER_AT)
    gap = secs(GAP)
    parts = [np.zeros(at), marker, np.zeros(gap)]
    pos = at + mk + gap          # in samples, exact
    table = {}
    for sid, vs in sounds.items():
        table[sid] = []
        for x in vs:
            table[sid].append([round((pos - at) / SR, 6), round(len(x) / SR, 6)])
            parts.append(x)
            parts.append(np.zeros(gap))
            pos += len(x) + gap
    audio = np.concatenate(parts)
    return audio, table, dict(marker=at / SR, markerLen=mk / SR, markerHz=2000)
