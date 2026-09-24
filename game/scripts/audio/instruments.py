"""Instrument voices built from dsp.py: plucked strings (gayageum / geomungo), Korean and
modern drums, synth bass, supersaw pads, formant choir, bowed haegeum-style lead, brass
stabs, bells and transition effects. Each function returns a mono or stereo float array.
"""
import math

import numpy as np
from scipy.ndimage import uniform_filter1d

from dsp import (SR, TAU, body_ir, bp, butter_bp, butter_hp, butter_lp, db, env_adsr, env_perc, hp,
                 lp, midi_hz, modal, noise, peq, pulse, rng, saturate, saw, secs, sine, ks_string, svf)


def _norm(x, peak=1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def _conv(x, ir):
    n = len(x) + len(ir) - 1
    nf = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(ir, nf), nf)[:n]
    return y[: len(x) + len(ir) // 2]


# ================================================================ plucked strings

_GAYA_BODY = None


def _gaya_body():
    global _GAYA_BODY
    if _GAYA_BODY is None:
        _GAYA_BODY = body_ir([182, 297, 431, 612, 845, 1210, 1780], [0.05, 0.04, 0.035, 0.03, 0.02, 0.015, 0.01],
                             [1.0, 0.8, 0.7, 0.55, 0.4, 0.3, 0.2], length=0.09, r=rng(77))
    return _GAYA_BODY


def gayageum(midi, dur, vel=1.0, seed=0, bend_in=0.0, vib=0.0, vib_delay=0.18, bend_down=0.0, ring=None):
    """12-string zither pluck: KS string + silk-pluck excitation + resonant body.
    bend_in: semitones below the note it starts from (slides up in ~70 ms).
    vib: nonghyeon vibrato depth in semitones. bend_down: semitone drop over the note tail."""
    r = rng(seed)
    ring = ring if ring is not None else max(dur, 0.35) + 0.6
    n = secs(ring)
    t = np.arange(n) / SR
    semis = np.zeros(n)
    if bend_in:
        semis -= bend_in * np.exp(-t / 0.045)
    if vib:
        ramp = np.clip((t - vib_delay) / 0.25, 0, 1)
        semis += vib * ramp * np.sin(TAU * 5.2 * np.maximum(t - vib_delay, 0) + r.uniform(0, 0.4))
    if bend_down:
        semis -= bend_down * np.clip((t - dur * 0.55) / max(dur * 0.4, 0.05), 0, 1) ** 1.5
    f = midi_hz(midi) * 2 ** (semis / 12)
    f0 = float(midi_hz(midi))
    bright = float(np.clip(0.42 + 0.2 * vel + (f0 - 300) / 3000, 0.35, 0.8))
    t60 = float(np.clip(2.6 - f0 / 700, 0.9, 2.4))
    s = ks_string(f, t60, bright=bright, r=r, pluck_pos=0.12 + 0.06 * r.random(), exc_lp=2500 + 3500 * vel)
    body = _conv(s, _gaya_body())[:n]
    s = 0.55 * s + 0.45 * _norm(body, np.max(np.abs(s)))
    # finger / silk attack noise
    k = secs(0.012)
    click = butter_bp(r.standard_normal(k), 1800, 6000) * np.exp(-np.arange(k) / (0.003 * SR))
    s[:k] += click * 0.25 * vel
    # damp after the gate
    if ring > dur + 0.05:
        g = np.ones(n)
        st = secs(dur + 0.25)
        if st < n:
            g[st:] = np.exp(-(np.arange(n - st)) / (0.12 * SR))
        s *= g
    s = butter_hp(s, 90)
    return _norm(s, vel)


def geomungo(midi, dur, vel=1.0, seed=0, bend_in=0.0):
    """Deep, stick-struck zither: darker string, woody slap and a low body."""
    r = rng(seed + 500)
    n = secs(max(dur, 0.3) + 0.8)
    t = np.arange(n) / SR
    semis = -bend_in * np.exp(-t / 0.06) if bend_in else np.zeros(n)
    f = midi_hz(midi) * 2 ** (semis / 12)
    s = ks_string(f, 1.4, bright=0.38, r=r, pluck_pos=0.07, exc_lp=1800)
    ir = body_ir([96, 152, 233, 340, 505], [0.08, 0.06, 0.04, 0.03, 0.02], [1, 0.8, 0.6, 0.4, 0.25], length=0.14, r=rng(88))
    s = 0.5 * s + 0.5 * _norm(_conv(s, ir)[:n], np.max(np.abs(s)))
    k = secs(0.03)
    slap = modal(k, [820, 1330, 2240], [0.006, 0.004, 0.003], [1, 0.6, 0.4], r) + 0.4 * butter_bp(r.standard_normal(k), 1000, 5000) * np.exp(-np.arange(k) / (0.004 * SR))
    s[:k] += slap * 0.4 * vel
    g = np.ones(n)
    st = secs(dur + 0.15)
    if st < n:
        g[st:] = np.exp(-(np.arange(n - st)) / (0.1 * SR))
    return _norm(butter_hp(s * g, 45), vel)


# ================================================================ drums

def kick(seed=0, punch=1.0, length=0.55, low=46.0):
    r = rng(seed)
    n = secs(length)
    t = np.arange(n) / SR
    f = low + 120 * np.exp(-t / 0.032) + 70 * np.exp(-t / 0.005)
    body = sine(f) * (np.exp(-t / 0.28) * np.clip(t / 0.002, 0, 1))
    body = saturate(body * 1.6, 1.3)
    ck = secs(0.012)
    click = butter_hp(r.standard_normal(ck), 2500) * np.exp(-np.arange(ck) / (0.0015 * SR))
    body[:ck] += click * 0.35 * punch
    thump = butter_bp(r.standard_normal(secs(0.05)), 90, 400) * np.exp(-np.arange(secs(0.05)) / (0.012 * SR))
    body[: len(thump)] += thump * 0.25
    return _norm(body, 1.0)


def snare(seed=0, tone=1.0, length=0.35):
    r = rng(seed + 11)
    n = secs(length)
    t = np.arange(n) / SR
    shell = modal(n, [180 * tone, 330 * tone, 476 * tone], [0.07, 0.045, 0.03], [1, 0.55, 0.3], r)
    f = 185 * tone * (1 + 0.25 * np.exp(-t / 0.01))
    shell += 0.6 * sine(f) * np.exp(-t / 0.06)
    wires = butter_bp(r.standard_normal(n), 1500, 9000) * np.exp(-t / 0.16)
    wires = wires * 0.9 + butter_hp(r.standard_normal(n), 5000) * np.exp(-t / 0.05) * 0.4
    s = shell * 0.8 + wires * 0.9
    s[: secs(0.004)] += butter_hp(r.standard_normal(secs(0.004)), 3000) * 0.6
    return _norm(saturate(_norm(s, 1.0), 1.4), 1.0)


def clap(seed=0, length=0.4):
    r = rng(seed + 21)
    n = secs(length)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, off in enumerate([0.0, 0.011, 0.021, 0.034]):
        m = t >= off
        e[m] += np.exp(-(t[m] - off) / (0.006 if k < 3 else 0.13)) * (0.8 if k < 3 else 1.0)
    s = butter_bp(r.standard_normal(n), 900, 5200) * e
    return _norm(s, 1.0)


_HAT_RATIOS = [1.0, 1.4836, 1.8003, 2.5465, 2.6309, 3.8961]


def hat(seed=0, open_=False, length=None):
    r = rng(seed + 31)
    length = length or (0.45 if open_ else 0.09)
    n = secs(length)
    t = np.arange(n) / SR
    base = 305 * (1 + 0.01 * r.uniform(-1, 1))
    metal = np.zeros(n)
    for rt in _HAT_RATIOS:
        metal += np.sign(np.sin(TAU * base * rt * t + r.uniform(0, TAU)))
    s = butter_bp(metal, 7000, 14000) * 0.5 + butter_hp(r.standard_normal(n), 8000) * 0.6
    s *= np.exp(-t / (0.16 if open_ else 0.022)) * np.clip(t / 0.0008, 0, 1)
    return _norm(s, 1.0)


def shaker(seed=0):
    r = rng(seed + 41)
    n = secs(0.12)
    t = np.arange(n) / SR
    e = np.clip(t / 0.018, 0, 1) * np.exp(-np.maximum(t - 0.018, 0) / 0.03)
    return _norm(butter_bp(r.standard_normal(n), 4500, 12000) * e, 1.0)


def crash(seed=0, length=4.2):
    r = rng(seed + 51)
    n = secs(length)
    t = np.arange(n) / SR
    s = butter_hp(r.standard_normal(n), 3000) * np.exp(-t / 0.75)
    m = np.zeros(n)
    for _ in range(40):
        f = r.uniform(2800, 11000)
        m += np.sin(TAU * f * t + r.uniform(0, TAU)) * np.exp(-t / r.uniform(0.4, 1.4))
    s = s + 0.02 * m
    s += butter_bp(r.standard_normal(n), 400, 3000) * np.exp(-t / 0.08) * 0.8
    s *= np.clip(t / 0.001, 0, 1)
    return _norm(butter_hp(s, 350), 1.0)


def reverse_cymbal(dur, seed=0):
    c = crash(seed, length=dur + 0.1)[: secs(dur)]
    y = c[::-1].copy()
    y *= np.linspace(0, 1, len(y)) ** 1.5
    return _norm(y, 1.0)


def tom(freq=110, seed=0, length=0.6):
    r = rng(seed + 61)
    n = secs(length)
    t = np.arange(n) / SR
    f = freq * (1 + 0.4 * np.exp(-t / 0.03))
    s = sine(f) * np.exp(-t / 0.22) + 0.4 * modal(n, [freq * 1.59, freq * 2.14], [0.1, 0.07], [1, 0.6], r)
    s[: secs(0.006)] += butter_hp(r.standard_normal(secs(0.006)), 2000) * 0.5
    return _norm(saturate(s, 1.2), 1.0)


def buk(seed=0, pitch=1.0, length=1.3, stick=1.0):
    """Korean barrel drum: deep membrane with falling pitch, stick attack, shell ring."""
    r = rng(seed + 71)
    n = secs(length)
    t = np.arange(n) / SR
    f0 = 88 * pitch
    f = f0 * (1 + 0.18 * np.exp(-t / 0.05))
    s = sine(f) * np.exp(-t / 0.42)
    s += modal(n, [f0 * 1.59, f0 * 2.14, f0 * 2.3, f0 * 2.65, f0 * 2.92, f0 * 3.5],
               [0.22, 0.15, 0.12, 0.09, 0.07, 0.05], [0.55, 0.4, 0.3, 0.22, 0.15, 0.1], r, jitter=0.01)
    k = secs(0.025)
    att = butter_bp(r.standard_normal(k), 600, 4500) * np.exp(-np.arange(k) / (0.005 * SR))
    s[:k] += att * 0.7 * stick
    s += butter_lp(r.standard_normal(n), 300) * np.exp(-t / 0.06) * 0.35
    return _norm(saturate(_norm(s), 1.3), 1.0)


def buk_rim(seed=0):
    r = rng(seed + 81)
    n = secs(0.12)
    t = np.arange(n) / SR
    s = modal(n, [930, 1510, 2330, 3480], [0.03, 0.02, 0.012, 0.008], [1, 0.7, 0.5, 0.3], r, jitter=0.02)
    s += butter_bp(r.standard_normal(n), 1500, 7000) * np.exp(-t / 0.006) * 0.8
    return _norm(s, 1.0)


def janggu_kung(seed=0, pitch=1.0):
    """Left head (gungpyeon): soft mallet, round low boom."""
    r = rng(seed + 91)
    n = secs(0.7)
    t = np.arange(n) / SR
    f0 = 118 * pitch
    s = sine(f0 * (1 + 0.12 * np.exp(-t / 0.04))) * np.exp(-t / 0.28)
    s += modal(n, [f0 * 1.6, f0 * 2.2, f0 * 2.7], [0.12, 0.08, 0.05], [0.4, 0.25, 0.12], r)
    s *= np.clip(t / 0.004, 0, 1)
    s[: secs(0.02)] += butter_bp(r.standard_normal(secs(0.02)), 200, 1500) * np.exp(-np.arange(secs(0.02)) / (0.006 * SR)) * 0.4
    return _norm(s, 1.0)


def janggu_deok(seed=0, pitch=1.0, soft=False):
    """Right head (chaepyeon) with the thin bamboo stick: crisp snap over a tight head."""
    r = rng(seed + 101)
    n = secs(0.25)
    t = np.arange(n) / SR
    f0 = 345 * pitch
    head = modal(n, [f0, f0 * 1.58, f0 * 2.13, f0 * 2.9], [0.07, 0.05, 0.03, 0.02], [1, 0.6, 0.4, 0.2], r, jitter=0.01)
    snap = butter_hp(r.standard_normal(n), 2500) * np.exp(-t / (0.012 if not soft else 0.006))
    snap = peq(snap, 3200, 8, 2.0)
    s = head * (0.7 if not soft else 0.5) + snap * (0.8 if not soft else 0.35)
    return _norm(s, 1.0)


def taiko(seed=0, pitch=1.0, length=2.2):
    """Big drum (odaiko / large buk): huge low body, felt-beater thump, long room."""
    r = rng(seed + 111)
    n = secs(length)
    t = np.arange(n) / SR
    f0 = 58 * pitch
    s = sine(f0 * (1 + 0.3 * np.exp(-t / 0.07))) * np.exp(-t / 0.75)
    s += modal(n, [f0 * 1.52, f0 * 2.03, f0 * 2.47, f0 * 3.1, f0 * 3.72], [0.4, 0.3, 0.22, 0.15, 0.1],
               [0.6, 0.45, 0.3, 0.2, 0.12], r, jitter=0.01)
    k = secs(0.05)
    s[:k] += butter_lp(r.standard_normal(k), 1200) * np.exp(-np.arange(k) / (0.012 * SR)) * 0.9
    s += butter_bp(r.standard_normal(n), 60, 250) * np.exp(-t / 0.2) * 0.3
    return _norm(saturate(_norm(s), 1.5), 1.0)


def riser(dur, seed=0, f_lo=300, f_hi=7000):
    r = rng(seed + 121)
    n = secs(dur)
    x = np.linspace(0, 1, n)
    fc = f_lo * (f_hi / f_lo) ** (x ** 1.4)
    s = bp(r.standard_normal(n), fc, 2.2) + 0.3 * hp(r.standard_normal(n), fc * 0.8)
    s *= x ** 2
    return _norm(s, 1.0)


def sub_boom(seed=0, length=1.6, f0=55):
    n = secs(length)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.8 * np.exp(-t / 0.08))
    s = sine(f) * np.exp(-t / 0.5) * np.clip(t / 0.003, 0, 1)
    return _norm(saturate(s, 1.2), 1.0)


# ================================================================ synth voices

def mono_synth(notes, total_len, osc='bass', glide=0.0, seed=0, base_cut=380.0, env_cut=1600.0, env_dec=0.12,
               q=1.1, attack=0.004, release=0.05, sub=0.6, detune_c=9.0, drive=1.6, vib=0.0, vib_rate=5.5):
    """Monophonic phrase renderer. notes: list of (start_s, dur_s, midi, vel). Returns mono array."""
    r = rng(seed)
    n = total_len
    freq = np.zeros(n)
    amp = np.zeros(n)
    cut = np.full(n, base_cut)
    notes = sorted(notes)
    cur = midi_hz(notes[0][2]) if notes else 110.0
    for i, (st, du, m, v) in enumerate(notes):
        a = secs(st)
        b = min(n, secs(st + du))
        nxt = secs(notes[i + 1][0]) if i + 1 < len(notes) else n
        e = min(n, max(b, min(nxt, b + secs(release * 6))))
        if a >= n:
            continue
        target = float(midi_hz(m))
        seg = np.arange(e - a) / SR
        if glide > 0 and i > 0 and secs(notes[i - 1][0] + notes[i - 1][1]) >= a - secs(0.01):
            fcur = cur + (target - cur) * (1 - np.exp(-seg / glide))
        else:
            fcur = np.full(e - a, target)
        if vib:
            ramp = np.clip((seg - 0.22) / 0.3, 0, 1)
            fcur = fcur * 2 ** (vib * ramp * np.sin(TAU * vib_rate * seg + r.uniform(0, 1)) / 12)
        freq[a:e] = fcur
        cur = target
        gate = (b - a) / SR
        env = np.where(seg < attack, seg / attack, 1.0)
        rel = seg > gate
        env[rel] = np.exp(-(seg[rel] - gate) / release)
        amp[a:e] = np.maximum(amp[a:e], env * v)
        cut[a:e] = base_cut + env_cut * v * np.exp(-seg / env_dec)
    # hold freq through silent gaps (no clicks)
    last = 110.0
    zero = freq == 0
    if zero.any():
        idx = np.where(~zero, np.arange(n), 0)
        np.maximum.accumulate(idx, out=idx)
        freq = np.where(zero, freq[idx], freq)
        freq[freq == 0] = last
    amp = uniform_filter1d(amp, secs(0.003))
    cut = uniform_filter1d(cut, secs(0.002))
    dc = 2 ** (detune_c / 1200)
    if osc == 'bass':
        x = 0.5 * saw(freq * dc, r.random()) + 0.5 * saw(freq / dc, r.random()) + sub * sine(freq)
    elif osc == 'reese':
        x = 0.35 * (saw(freq * dc, r.random()) + saw(freq / dc, r.random()) + saw(freq * dc * dc, r.random())) + sub * sine(freq)
    else:
        x = saw(freq, r.random())
    y = svf(np.ascontiguousarray(x), np.ascontiguousarray(cut), q, 0)
    y = saturate(y * drive, 1.0) * amp
    return y


def haegeum(notes, total_len, seed=0, glide=0.07, vib=0.32, bright=1.0):
    """Two-string fiddle voice: legato saw/pulse with portamento, delayed vibrato, bow noise and a
    nasal body (formant peaks). notes: list of (start_s, dur_s, midi, vel[, ornament])."""
    r = rng(seed + 900)
    n = total_len
    freq = np.zeros(n)
    amp = np.zeros(n)
    notes = sorted(notes, key=lambda x: x[0])
    prev_f = None
    prev_end = -1.0
    for i, note in enumerate(notes):
        st, du, m, v = note[:4]
        orn = note[4] if len(note) > 4 else None
        a = secs(st)
        rel = 0.09
        e = min(n, secs(st + du + rel * 4))
        if a >= n:
            continue
        seg = np.arange(e - a) / SR
        target = float(midi_hz(m))
        legato = prev_f is not None and st - prev_end < 0.03
        if legato:
            f = target + (prev_f - target) * np.exp(-seg / glide)
        else:
            f = np.full(e - a, target)
        semis = np.zeros(e - a)
        if orn == 'scoop':
            semis -= 1.0 * np.exp(-seg / 0.07)
        elif orn == 'fall':
            semis -= 2.0 * np.clip((seg - du * 0.7) / (du * 0.3 + 1e-3), 0, 1) ** 2
        elif orn == 'shake':  # wide Korean vibrato (nonghyeon)
            semis += 0.55 * np.clip((seg - 0.1) / 0.2, 0, 1) * np.sin(TAU * 6.0 * seg)
        if du > 0.3 and orn != 'shake':
            ramp = np.clip((seg - 0.2) / 0.35, 0, 1)
            semis += vib * ramp * np.sin(TAU * 5.4 * seg + r.uniform(0, 2))
        freq[a:e] = f * 2 ** (semis / 12)
        att = 0.035 if legato else 0.07
        env = np.clip(seg / att, 0, 1)
        swell = 1 + 0.18 * np.clip((seg - 0.1) / max(du, 0.2), 0, 1)
        env = env * swell
        gate = du
        relm = seg > gate
        env[relm] = env[relm] * np.exp(-(seg[relm] - gate) / rel)
        amp[a:e] = np.maximum(amp[a:e], env * v)
        prev_f = target
        prev_end = st + du
    zero = freq == 0
    if zero.any():
        idx = np.where(~zero, np.arange(n), 0)
        np.maximum.accumulate(idx, out=idx)
        freq = np.where(zero, freq[idx], freq)
        freq[freq == 0] = 440.0
    amp = uniform_filter1d(amp, secs(0.004))
    # slow random pitch wander (unfretted string, no fingerboard)
    wander = butter_lp(r.standard_normal(n), 3, 1)
    freq = freq * 2 ** (wander / (np.std(wander) + 1e-9) * 0.06 / 12)
    x = 0.7 * saw(freq, r.random()) + 0.3 * pulse(freq * 1.002, 0.3, r.random())
    # bow: continuous hiss following the level, plus a scratch at each fresh bow stroke
    bow = butter_bp(r.standard_normal(n), 1800, 6000) * 0.1
    onsets = np.zeros(n)
    for note in notes:
        a = secs(note[0])
        k = secs(0.05)
        if a + k < n:
            onsets[a:a + k] += np.exp(-np.arange(k) / (0.012 * SR))
    scratch = butter_bp(r.standard_normal(n), 900, 4000) * onsets * 0.25
    x = x + bow + scratch
    # irregular bow-pressure tremor
    trem = 1 + 0.05 * butter_lp(r.standard_normal(n), 8, 1) / 0.02
    x *= np.clip(trem, 0.85, 1.15)
    # dense wooden body: many resonant modes (what makes a bowed tone read as an instrument)
    x = x * 0.45 + 0.55 * _norm(_conv(x, _fiddle_body())[:n], np.max(np.abs(x)))
    y = butter_hp(x, 220)
    y = peq(y, 720, 5, 1.4)
    y = peq(y, 1550, 6 * bright, 1.8)
    y = peq(y, 3100, 3, 2.0)
    y = peq(y, 400, -3, 1.0)
    y = butter_lp(y, 5200 + 1500 * bright, 2)
    return y * amp


_FIDDLE = None


def _fiddle_body():
    global _FIDDLE
    if _FIDDLE is None:
        r = rng(4242)
        fr = np.sort(r.uniform(260, 5200, 36))
        dec = 0.004 + 0.02 * r.random(36) * (600 / fr) ** 0.3
        amp = r.uniform(0.3, 1.0, 36) * np.where((fr > 900) & (fr < 2200), 1.6, 1.0)
        _FIDDLE = body_ir(fr, dec, amp, length=0.06, r=rng(4243))
    return _FIDDLE


def supersaw_chord(midis, dur, seed=0, voices=7, detune=0.16, attack=0.35, release=0.9, cutoff=2600.0,
                   q=0.8, width=1.0, bright_env=0.0):
    """Stereo pad: each chord tone is a detuned saw stack spread across the field."""
    r = rng(seed)
    n = secs(dur + release * 5)
    out = np.zeros((n, 2))
    t = np.arange(n) / SR
    env = np.clip(t / attack, 0, 1) ** 1.5
    relm = t > dur
    env[relm] *= np.exp(-(t[relm] - dur) / release)
    for mi, m in enumerate(midis):
        f0 = float(midi_hz(m))
        for v in range(voices):
            d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune
            f = f0 * 2 ** (d / 12) * (1 + 0.0015 * np.sin(TAU * r.uniform(0.1, 0.3) * t + r.uniform(0, TAU)))
            x = saw(f, r.random())
            p = np.clip(((v % 2) * 2 - 1) * (0.3 + 0.7 * abs(d) / detune) * width, -1, 1)
            a = (p + 1) * math.pi / 4
            out[:, 0] += x * math.cos(a)
            out[:, 1] += x * math.sin(a)
    fc = np.full(n, cutoff)
    if bright_env:
        fc = cutoff + bright_env * np.exp(-t / 0.25)
    for ch in range(2):
        out[:, ch] = svf(np.ascontiguousarray(out[:, ch]), fc, q, 0)
    out *= env[:, None] / (len(midis) * voices) * 3.0
    return out


def brass_stab(midis, dur, seed=0, vel=1.0):
    r = rng(seed + 300)
    n = secs(dur + 0.35)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    env = np.clip(t / 0.015, 0, 1)
    relm = t > dur
    env[relm] *= np.exp(-(t[relm] - dur) / 0.12)
    fc = 500 + 3800 * vel * np.exp(-t / 0.09) + 700
    for i, m in enumerate(midis):
        f0 = float(midi_hz(m))
        for v, d in enumerate((-0.09, -0.03, 0.03, 0.09)):
            x = saw(f0 * 2 ** (d / 12) * (1 + 0.004 * np.exp(-t / 0.05)), r.random())
            p = -0.6 + 1.2 * ((i * 4 + v) % 5) / 4
            a = (p + 1) * math.pi / 4
            out[:, 0] += x * math.cos(a)
            out[:, 1] += x * math.sin(a)
    for ch in range(2):
        out[:, ch] = svf(np.ascontiguousarray(out[:, ch]), fc, 1.2, 0)
    out = saturate(out / (len(midis) * 2.0) * 1.5, 1.2) * env[:, None]
    return out


_FORMANTS = {
    # (freq, gain dB, bandwidth Hz) — standard vowel formant tables per voice range
    ('bass', 'a'): [(600, 0, 60), (1040, -7, 70), (2250, -9, 110), (2450, -9, 120), (2750, -20, 130)],
    ('tenor', 'a'): [(650, 0, 80), (1080, -6, 90), (2650, -7, 120), (2900, -8, 130), (3250, -22, 140)],
    ('alto', 'a'): [(800, 0, 80), (1150, -4, 90), (2800, -20, 120), (3500, -36, 130), (4950, -60, 140)],
    ('soprano', 'a'): [(800, 0, 80), (1150, -6, 90), (2900, -32, 120), (3900, -20, 130), (4950, -50, 140)],
    ('bass', 'o'): [(400, 0, 40), (750, -11, 80), (2400, -21, 100), (2600, -20, 120), (2900, -40, 120)],
    ('tenor', 'o'): [(400, 0, 40), (800, -10, 80), (2600, -12, 100), (2800, -12, 120), (3000, -26, 120)],
    ('alto', 'o'): [(450, 0, 70), (800, -9, 80), (2830, -16, 100), (3500, -28, 130), (4950, -55, 135)],
    ('soprano', 'o'): [(450, 0, 70), (800, -11, 80), (2830, -22, 100), (3800, -22, 130), (4950, -50, 135)],
}


def choir_part(notes, total_len, part='alto', vowel='a', seed=0, unison=4):
    """One choir section: detuned glottal sources with individual vibrato through a vowel
    formant bank. notes: list of (start_s, dur_s, midi, vel). Returns mono."""
    r = rng(seed + 700)
    n = total_len
    src = np.zeros(n)
    for st, du, m, v in notes:
        a = secs(st)
        rel = 0.7
        e = min(n, secs(st + du + rel * 3))
        if a >= n:
            continue
        seg = np.arange(e - a) / SR
        env = np.clip(seg / 0.28, 0, 1) ** 1.3
        relm = seg > du
        env[relm] *= np.exp(-(seg[relm] - du) / rel)
        f0 = float(midi_hz(m))
        acc = np.zeros(e - a)
        for u in range(unison):
            det = r.uniform(-0.12, 0.12)
            vr = r.uniform(4.6, 5.6)
            vd = r.uniform(0.12, 0.22)
            ramp = np.clip((seg - 0.15) / 0.4, 0, 1)
            drift = 0.05 * np.sin(TAU * r.uniform(0.2, 0.5) * seg + r.uniform(0, TAU))
            f = f0 * 2 ** ((det + drift + vd * ramp * np.sin(TAU * vr * seg + r.uniform(0, TAU))) / 12)
            g = saw(f, r.random())
            acc += g
        src[a:e] += acc / unison * env * v
    src = butter_lp(src, 4200, 2)
    y = np.zeros(n)
    for f, gdb, bw in _FORMANTS[(part, vowel)]:
        y += db(gdb) * bp(src, f, f / bw)
    breath = butter_bp(r.standard_normal(n), 2000, 7000) * 0.03 * np.abs(butter_lp(src, 20, 1))
    return (y + breath) * 2.0


def fm_bell(midi, dur=2.0, ratio=3.5, index=3.0, seed=0, decay=1.2):
    r = rng(seed + 400)
    n = secs(dur)
    t = np.arange(n) / SR
    f = float(midi_hz(midi))
    idx = index * np.exp(-t / (decay * 0.3))
    y = np.sin(TAU * f * t + idx * np.sin(TAU * f * ratio * t + r.uniform(0, 1)))
    y += 0.3 * np.sin(TAU * f * 2.0 * t) * np.exp(-t / (decay * 0.5))
    y *= np.exp(-t / decay) * np.clip(t / 0.002, 0, 1)
    return y


def pluck_synth(midi, dur=0.25, seed=0, cutoff=900, env=4000, decay=0.09):
    r = rng(seed + 500)
    n = secs(dur + 0.2)
    t = np.arange(n) / SR
    f = float(midi_hz(midi))
    x = 0.6 * saw(np.full(n, f * 1.004), r.random()) + 0.6 * saw(np.full(n, f / 1.004), r.random()) + 0.4 * pulse(np.full(n, f * 2), 0.25)
    fc = cutoff + env * np.exp(-t / decay)
    y = svf(np.ascontiguousarray(x), fc, 1.4, 0)
    e = np.exp(-t / (dur * 0.7)) * np.clip(t / 0.002, 0, 1)
    return y * e
