"""Sample-playback engine: velocity layers, round robins, pitch curves (bends / vibrato / portamento),
crossfaded sustain extension, release tails. Pure numpy + numba; samples come from samplelib.
"""
import math
import os
import re
import tempfile

# keep numba's JIT cache out of the repo
os.environ.setdefault('NUMBA_CACHE_DIR', os.path.join(tempfile.gettempdir(), 'march-audio-numba'))

import numpy as np  # noqa: E402
from numba import njit  # noqa: E402

import samplelib as L

SR = 44100


@njit(cache=True)
def _play(data, inc, out_len, start):
    """Variable-rate 4-point Hermite playback of stereo `data` from `start` with per-sample increments."""
    n = data.shape[0]
    out = np.zeros((out_len, 2), dtype=np.float32)
    pos = start
    for i in range(out_len):
        ip = int(pos)
        if ip + 2 >= n:
            break
        fr = pos - ip
        for c in range(2):
            xm1 = data[ip - 1, c] if ip >= 1 else data[0, c]
            x0 = data[ip, c]
            x1 = data[ip + 1, c]
            x2 = data[ip + 2, c]
            c1 = 0.5 * (x1 - xm1)
            c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2
            c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1)
            out[i, c] = ((c3 * fr + c2) * fr + c1) * fr + x0
        pos += inc[i]
    return out


def trim_onset(x, thresh_db=-36.0, pre=0.003):
    pk = float(np.max(np.abs(x))) + 1e-12
    thr = pk * 10 ** (thresh_db / 20)
    idx = np.argmax(np.abs(x).max(axis=1) > thr)
    a = max(0, idx - int(pre * SR))
    y = x[a:]
    # trim trailing near-silence
    tail = np.where(np.abs(y).max(axis=1) > pk * 10 ** (-70 / 20))[0]
    if len(tail):
        y = y[: tail[-1] + 1]
    return np.ascontiguousarray(y, dtype=np.float32)


def extend_sustain(x, need, loop=None, xfade=0.12):
    """Lengthen a sustained sample to `need` frames by crossfade-looping its stable middle."""
    n = len(x)
    if n >= need:
        return x
    if loop and loop[1] - loop[0] > SR * 0.1:
        a, b = loop
    else:
        a, b = int(n * 0.35), int(n * 0.85)
    L_ = b - a
    xf = min(int(xfade * SR), L_ // 3)
    out = [x[:b].copy()]
    total = b
    fade_in = np.sin(np.linspace(0, math.pi / 2, xf))[:, None] ** 2
    fade_out = 1 - fade_in
    a = max(a, xf)
    seg = x[a:b]
    L_ = b - a
    while total < need + SR:
        prev = out[-1]
        # crossfade the end of what we have with the start of the next loop copy (both are the same material)
        prev[-xf:] = prev[-xf:] * fade_out + x[a - xf:a] * fade_in
        out.append(seg.copy())
        total += L_
    return np.ascontiguousarray(np.concatenate(out), dtype=np.float32)


class Zone:
    __slots__ = ('path', 'root', 'layer', 'rr', 'data', 'loop', 'loader', '_lag')

    def __init__(self, path, root, layer=0, rr=0, loader=None, loop=None):
        self.path, self.root, self.layer, self.rr, self.loader, self.loop = path, root, layer, rr, loader, loop
        self.data = None
        self._lag = None

    def lag(self):
        """Seconds until the sample reaches 35 % of its early peak (how late the note 'speaks')."""
        if self._lag is None:
            x = np.abs(self.get()[: int(0.8 * SR)]).max(axis=1)
            k = 441
            e = np.convolve(x, np.ones(k) / k, mode='same')
            self._lag = float(np.argmax(e > 0.35 * e.max()) / SR)
        return self._lag

    def get(self):
        if self.data is None:
            x = self.loader() if self.loader else L.read(self.path)
            self.data = trim_onset(x) if self.loop is None else x
        return self.data


class Instrument:
    """A pitched sampled instrument. zones: list[Zone]; layers are ints (0 = softest)."""

    def __init__(self, name, zones, sustain=False, release=0.25, gain=1.0, ring=None, vel_curve=0.5, max_shift=7,
                 attack=0.0, lag_cap=0.05):
        self.name = name
        self.lag_cap = lag_cap
        self.last_lag = 0.0
        self.zones = zones
        self.sustain = sustain
        self.release = release
        self.gain = gain
        self.ring = ring
        self.vel_curve = vel_curve
        self.max_shift = max_shift
        self.attack = attack
        self.layers = sorted({z.layer for z in zones})
        self.rr_counter = {}
        self._norm = None

    def norm(self):
        """Loudest layer normalised to peak 0.5 (median over its zones) so instruments are comparable."""
        if self._norm is None:
            top = self.layers[-1]
            pk = [float(np.max(np.abs(z.get()))) for z in self.zones if z.layer == top][:8]
            self._norm = 0.5 / (np.median(pk) + 1e-9)
        return self._norm

    def pick(self, midi, vel):
        li = self.layers[min(len(self.layers) - 1, int(round(vel * (len(self.layers) - 1))))]
        cands = [z for z in self.zones if z.layer == li] or self.zones
        best = min(abs(z.root - midi) for z in cands)
        near = [z for z in cands if abs(z.root - midi) - best < 0.01]
        # prefer the root at or below the note (upward repitch keeps the attack crisp) when tied
        near.sort(key=lambda z: (z.root > midi, z.rr))
        root = near[0].root
        same = [z for z in near if z.root == root]
        k = (root, li)
        i = self.rr_counter.get(k, -1) + 1
        self.rr_counter[k] = i
        return same[i % len(same)]

    def note(self, midi, dur, vel=0.8, bend=None, release=None, ring=None, gain=1.0, start_offset=0.0, fade_in=None):
        """Render one note (stereo float32). bend: array (semitones) per output sample or callable(t)->semitones."""
        z = self.pick(midi, vel)
        data = z.get()
        # the caller places the note this much earlier so it speaks on the beat (skipped audio is not played)
        self.last_lag = 0.0 if start_offset > 0 else min(self.lag_cap, z.lag())
        rel = self.release if release is None else release
        if self.sustain:
            out_len = int((dur + rel) * SR)
        else:
            rg = ring if ring is not None else self.ring
            out_len = int((dur + rel) * SR) if rg is None else int(max(dur, 0.05) * SR + rg * SR)
        t = np.arange(out_len) / SR
        semis = np.full(out_len, float(midi - z.root))
        if bend is not None:
            semis = semis + (bend(t) if callable(bend) else np.asarray(bend)[:out_len] if len(bend) >= out_len
                             else np.concatenate([bend, np.full(out_len - len(bend), bend[-1])]))
        inc = (2.0 ** (semis / 12.0)).astype(np.float64)
        need = int(np.sum(inc)) + int(start_offset * SR) + 4
        if self.sustain and need > len(data):
            data = extend_sustain(data, need, z.loop)
        y = _play(data, inc, out_len, float(start_offset * SR))
        env = np.ones(out_len, dtype=np.float32)
        att = self.attack if fade_in is None else fade_in
        if att > 0:
            k = min(out_len, int(att * SR))
            env[:k] = np.linspace(0, 1, k) ** 1.5
        if self.sustain or (ring is None and self.ring is None):
            a = int(dur * SR)
            k = out_len - a
            if k > 0:
                env[a:] *= np.cos(np.linspace(0, math.pi / 2, k)) ** 1.6
        else:
            k = min(out_len // 2, int(0.3 * SR))
            env[-k:] *= np.cos(np.linspace(0, math.pi / 2, k)) ** 2
        amp = self.gain * self.norm() * gain * ((1 - self.vel_curve) + self.vel_curve * vel)
        return y * env[:, None] * amp


class Percussion:
    """Unpitched groups: name -> list of layers (soft..loud), each a list of round-robin zones."""

    def __init__(self, groups, gain=1.0):
        self.groups = groups
        self.gain = gain
        self.rr = {}
        self._norm = {}

    def norm(self, g):
        if g not in self._norm:
            top = self.groups[g][-1]
            pk = [float(np.max(np.abs(z.get()))) for z in top]
            self._norm[g] = 0.5 / (np.median(pk) + 1e-9)
        return self._norm[g]

    def hit(self, g, vel=0.8, pitch=0.0, length=None, gain=1.0):
        layers = self.groups[g]
        li = min(len(layers) - 1, int(round(vel * (len(layers) - 1))))
        zs = layers[li]
        k = (g, li)
        i = self.rr.get(k, -1) + 1
        self.rr[k] = i
        x = zs[i % len(zs)].get()
        if pitch:
            r = 2 ** (pitch / 12)
            n = int(len(x) / r) - 4
            x = _play(x, np.full(n, r), n, 0.0)
        if length is not None and len(x) > length * SR:
            n = int(length * SR)
            x = x[:n].copy()
            f = min(n // 3, int(0.06 * SR))
            x[-f:] *= (np.cos(np.linspace(0, math.pi / 2, f)) ** 2)[:, None]
        return x * self.gain * self.norm(g) * gain * (0.45 + 0.55 * vel)


# ------------------------------------------------------------------ helpers to build zones from file names

def zones_from(pattern, name_re, offset=0, layer_map=None, rr_re=None, exclude=None):
    """Build pitched zones from files matching glob `pattern`.
    name_re captures the note name (group 'n') and optionally the layer (group 'v')."""
    zones = []
    for p in L.find(pattern):
        b = os.path.basename(p)
        if exclude and re.search(exclude, b):
            continue
        m = re.search(name_re, b)
        if not m:
            continue
        nn = m.group('n')
        nn = nn[0].upper() + nn[1:]
        midi = L.note_to_midi(nn)
        if midi is None:
            continue
        v = m.groupdict().get('v')
        layer = (layer_map or {}).get(v, int(v) if v and v.isdigit() else 0) if v is not None else 0
        rr = 0
        if rr_re:
            mr = re.search(rr_re, b)
            rr = int(mr.group(1)) if mr else 0
        zones.append(Zone(p, midi + offset, layer, rr))
    # renumber layers densely 0..n-1
    uniq = sorted({z.layer for z in zones})
    for z in zones:
        z.layer = uniq.index(z.layer)
    return zones


def perc_group(patterns, layer_re=None, order=None):
    """Files -> layers (soft..loud) of round robins. layer_re captures an int/str velocity key."""
    files = []
    for pat in patterns if isinstance(patterns, (list, tuple)) else [patterns]:
        files += L.find(pat)
    if not files:
        raise SystemExit(f'no samples for {patterns}')
    if layer_re is None:
        return [[Zone(p, 0) for p in files]]
    by = {}
    for p in files:
        m = re.search(layer_re, os.path.basename(p))
        key = m.group(1) if m else '0'
        by.setdefault(key, []).append(Zone(p, 0))
    keys = order if order else sorted(by, key=lambda k: (len(k), k))
    return [by[k] for k in keys if k in by]
