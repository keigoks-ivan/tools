"""Arrangement + mixing engine.

A Song owns stereo buses of exactly one loop length. Note audio that runs past the loop end
wraps to the start (so ringing tails of the last bar sound under bar 1), and every stateful
effect (reverb, delay, compressor, limiter) is run "circularly": on two back-to-back copies
of the loop, keeping the second copy. The result is sample-exactly periodic, so the loop
seam is inaudible by construction. Stings (loop=False) render linearly with a tail.
"""
import math

import numpy as np

from dsp import (SR, butter_hp, butter_lp, chorus, compress, convolve, db, limit, lufs, pan_st, peq, pingpong, reverb,
                 secs, shelf, short_term_max, true_peak_db)


class Song:
    def __init__(self, bpm, bars, loop=True, tail=0.0, beats=4, seed=0, swing=0.0):
        self.bpm = bpm
        self.spb = 60.0 / bpm
        self.bar = beats * self.spb
        self.bars = bars
        self.loop = loop
        self.length = secs(bars * self.bar) if loop else secs(bars * self.bar + tail)
        self.buses = {}
        self.cfg = {}
        self.seed = seed
        self.swing = swing
        self.duck_times = []

    # -------- time helpers
    def t(self, bar, beat=0.0):
        b = bar * 4 + beat
        if self.swing:
            frac = (beat * 4) % 2
            if abs(frac - 1) < 1e-6:
                b += self.swing / 4
        return b * self.spb

    def steps(self, bar, pattern, step=0.25):
        """Yield (time_s, char) for a string pattern ('.' = rest) of 16th steps starting at bar."""
        for i, ch in enumerate(pattern.replace(' ', '').replace('|', '')):
            if ch != '.':
                yield self.t(bar, i * step), ch

    # -------- buses
    def bus(self, name, gain_db=0.0, reverb_send=0.0, delay_send=0.0, pan=0.0, hp=0.0, lp=0.0, duck=0.0,
            comp=None, eq=None, chorus_mix=0.0, width=1.0, level=None):
        """level: target loudness (LUFS, pre-master) for the processed bus; overrides gain_db."""
        if name not in self.buses:
            self.buses[name] = np.zeros((self.length, 2))
            self.cfg[name] = dict(gain_db=gain_db, level=level, reverb_send=reverb_send, delay_send=delay_send, pan=pan, hp=hp, lp=lp,
                                  duck=duck, comp=comp, eq=eq or [], chorus_mix=chorus_mix, width=width)
        return self.buses[name]

    def add(self, name, audio, time_s, gain=1.0, pan=0.0):
        buf = self.buses[name]
        if audio.ndim == 1:
            audio = pan_st(audio, pan)
        elif pan:
            audio = audio * np.array([math.sqrt(max(0, 1 - pan)), math.sqrt(max(0, 1 + pan))])
        start = secs(time_s)
        n = len(audio)
        if n > 256:  # every voice ends on a short raised-cosine fade: no truncation clicks
            f = min(n // 4, secs(0.03))
            audio = audio.copy()
            ramp = np.cos(np.linspace(0, math.pi / 2, f)) ** 2
            audio[-f:] *= ramp[:, None] if audio.ndim == 2 else ramp
        L = self.length
        if self.loop:
            start %= L
            pos = 0
            while pos < n:
                s = (start + pos) % L
                k = min(n - pos, L - s)
                buf[s:s + k] += audio[pos:pos + k] * gain
                pos += k
        else:
            if start >= L:
                return
            k = min(n, L - start)
            buf[start:start + k] += audio[:k] * gain

    def add_track(self, name, mono_or_st, gain=1.0, pan=0.0, offset=0.0):
        self.add(name, mono_or_st, offset, gain, pan)

    def duck_on(self, time_s):
        self.duck_times.append(time_s)

    # -------- processing
    def circ(self, fn, x):
        if not self.loop:
            return fn(x)
        L = len(x)
        y = fn(np.concatenate([x, x], axis=0))
        return y[L:2 * L]

    def duck_curve(self, depth, release=0.16):
        """Kick-synchronous sidechain-style gain curve (deterministic)."""
        L = self.length
        g = np.zeros(L)
        t = np.arange(L) / SR
        for tk in self.duck_times:
            for shift in ((-self.length / SR, 0.0, self.length / SR) if self.loop else (0.0,)):
                dt = t - (tk + shift)
                m = (dt >= -0.004) & (dt < release * 6)
                if not m.any():
                    continue
                d = dt[m]
                shape = np.where(d < 0, 1.0, np.exp(-np.maximum(d - 0.015, 0) / release))
                g[m] = np.maximum(g[m], shape)
        return 1.0 - depth * g

    def mixdown(self, reverb_cfg=None, delay_s=None, delay_fb=0.3, master=None, stats=None, ir=None):
        """ir: stereo impulse response for a convolution hall (else the FDN reverb with reverb_cfg)."""
        reverb_cfg = reverb_cfg or dict(rt60=2.0, damp_hz=6000, size=1.0)
        rev = (lambda z: convolve(z, ir)) if ir is not None else (lambda z: reverb(z, **reverb_cfg))
        L = self.length
        dry = np.zeros((L, 2))
        rsend = np.zeros((L, 2))
        dsend = np.zeros((L, 2))
        for name, buf in self.buses.items():
            c = self.cfg[name]
            x = buf
            if c['hp']:
                x = self.circ(lambda z: butter_hp(z, c['hp']), x)
            if c['lp']:
                x = self.circ(lambda z: butter_lp(z, c['lp']), x)
            for f0, g, q in c['eq']:
                x = self.circ(lambda z: peq(z, f0, g, q), x)
            if c['chorus_mix']:
                x = self.circ(lambda z: chorus(z, mix=c['chorus_mix']), x)
            if c['comp']:
                thr, ratio, att, rel = c['comp']
                x = self.circ(lambda z: compress(z, thr, ratio, att, rel)[0], x)
            if c['width'] != 1.0:
                m = (x[:, 0] + x[:, 1]) / 2
                s = (x[:, 0] - x[:, 1]) / 2 * c['width']
                x = np.stack([m + s, m - s], 1)
            if c['duck']:
                x = x * self.duck_curve(c['duck'])[:, None]
            if c['level'] is not None and np.any(x):
                x = x * db(c['level'] - lufs(x))
            else:
                x = x * db(c['gain_db'])
            if stats is not None:
                stats[name] = lufs(x) if np.any(x) else -99
            dry += x
            rsend += x * c['reverb_send']
            dsend += x * c['delay_send']
        wet = self.circ(rev, rsend) if np.any(rsend) else 0
        dl = self.circ(lambda z: pingpong(z, delay_s or self.spb * 0.75, delay_fb), dsend) if (np.any(dsend)) else 0
        if np.any(dsend):
            wet = wet + self.circ(rev, dl * 0.25) + dl
        mix = dry + wet
        return mix


def master_chain(song, mix, target_lufs=-16.0, ceiling_db=-1.5, tilt=None, glue=(-14.0, 2.0, 0.02, 0.25)):
    """HP, gentle EQ, glue compression, iterative loudness match with a look-ahead limiter."""
    x = song.circ(lambda z: butter_hp(z, 28, 2), mix)
    x = song.circ(lambda z: shelf(z, 110, 1.0, high=False), x)
    x = song.circ(lambda z: peq(z, 320, -1.5, 0.8), x)
    x = song.circ(lambda z: shelf(z, 9000, 1.0, high=True), x)
    if tilt:
        for f0, g, q in tilt:
            x = song.circ(lambda z: peq(z, f0, g, q), x)
    thr, ratio, att, rel = glue
    # normalise before glue so the threshold means the same thing on every track
    x = x / (np.max(np.abs(x)) + 1e-9) * db(-6)
    x = song.circ(lambda z: compress(z, thr, ratio, att, rel)[0], x)
    gain = 0.0
    y = x
    for _ in range(6):
        y = song.circ(lambda z: limit(z * db(gain), ceiling_db, 0.004, 0.09), x)
        cur = lufs(y)
        err = target_lufs - cur
        if abs(err) < 0.1:
            break
        gain += err
    # inter-sample safety: pull down if 4x-oversampled peak exceeds the ceiling
    tp = true_peak_db(y)
    if tp > ceiling_db + 0.3:
        y = y * db(ceiling_db + 0.3 - tp)
    return y


def report(name, y):
    return dict(name=name, seconds=round(len(y) / SR, 3), lufs=round(lufs(y), 2), short_term_max=round(short_term_max(y), 2),
                true_peak=round(true_peak_db(y), 2), sample_peak=round(float(20 * np.log10(np.max(np.abs(y)) + 1e-12)), 2))
