"""The four march cues, composed and arranged in code.

  market   夜市霓虹   126 BPM, A minor pentatonic, 32 bars (≈61 s loop)
           gayageum 16th riff over house groove, janggu 3-3-2, haegeum theme, breakdown + build
  plaza    魂門階梯   138 BPM, D minor, 40 bars (≈70 s loop) — plaza and stairs segments
           rolling 16th bass, buk accents, gayageum tremolo arps, choir in the climax, half-time section
  boss     魂門守將   140 BPM, C minor / phrygian colour, 40 bars (≈69 s loop)
           taiko ensemble, geomungo ostinato, reese bass, brass stabs, formant choir, wailing haegeum
  victory / defeat    one-shot stings (≈6 s)

Each loop is rendered periodically (see song.py), mastered to about -16 LUFS integrated
with ≤ -1 dBTP, and exported with a pre-roll / post-roll so the loop points survive MP3
encoder delay.
"""
import math

import numpy as np

from dsp import SR, db, midi_hz, rng, secs
from instruments import (brass_stab, buk, buk_rim, choir_part, clap, crash, fm_bell, gayageum, geomungo, haegeum, hat,
                         janggu_deok, janggu_kung, kick, mono_synth, pluck_synth, reverse_cymbal, riser, shaker, snare,
                         sub_boom, supersaw_chord, taiko, tom)
from song import Song

VEL = {'X': 1.0, 'x': 0.78, 'o': 0.5, 'g': 0.32}


class Kit:
    """Pre-rendered drum variants (round-robin + velocity humanising)."""

    def __init__(self, seed=0):
        self.r = rng(seed)
        self.v = {
            'kick': [kick(seed + i) for i in range(3)],
            'snare': [snare(seed + i) for i in range(4)],
            'clap': [clap(seed + i) for i in range(3)],
            'hat': [hat(seed + i) for i in range(6)],
            'ohat': [hat(seed + i, True) for i in range(3)],
            'shaker': [shaker(seed + i) for i in range(4)],
            'crash': [crash(seed + i) for i in range(2)],
            'buk': [buk(seed + i) for i in range(3)],
            'buk_hi': [buk(seed + 10 + i, pitch=1.35, length=0.9) for i in range(3)],
            'rim': [buk_rim(seed + i) for i in range(3)],
            'kung': [janggu_kung(seed + i) for i in range(3)],
            'deok': [janggu_deok(seed + i) for i in range(4)],
            'deok_soft': [janggu_deok(seed + 20 + i, soft=True) for i in range(4)],
            'taiko': [taiko(seed + i) for i in range(3)],
            'taiko_hi': [taiko(seed + 5 + i, pitch=1.6, length=1.4) for i in range(3)],
            'tom_hi': [tom(165, seed + i) for i in range(2)],
            'tom_lo': [tom(98, seed + i) for i in range(2)],
        }
        self.i = {k: 0 for k in self.v}

    def get(self, name):
        lst = self.v[name]
        self.i[name] = (self.i[name] + 1) % len(lst)
        return lst[self.i[name]]

    def hit(self, song, bus, name, t, vel=1.0, pan=0.0, jitter=0.004):
        g = vel * (1 + self.r.uniform(-0.06, 0.06))
        song.add(bus, self.get(name), max(0.0, t + self.r.uniform(-jitter, jitter)), g, pan)
        if name == 'kick':
            song.duck_on(t)

    def pattern(self, song, bus, name, bar, pat, gain=1.0, pan=0.0, step=0.25, jitter=0.004):
        for t, ch in song.steps(bar, pat, step):
            self.hit(song, bus, name, t, VEL.get(ch, 0.78) * gain, pan, jitter)


def chord_bar(song, bus, bar, midis, beats=4.0, seed=0, gain=1.0, **kw):
    song.add(bus, supersaw_chord(midis, beats * song.spb - 0.02, seed=seed, **kw), song.t(bar), gain)


def gaya_line(song, bus, notes, seed=0, gain=1.0, pan=0.0, vel_scale=1.0):
    """notes: (bar, beat, dur_beats, midi, vel[, opts dict])"""
    r = rng(seed)
    for k, n in enumerate(notes):
        bar, beat, du, m, v = n[:5]
        opts = n[5] if len(n) > 5 else {}
        a = gayageum(m, du * song.spb, v * vel_scale, seed=seed * 1000 + k, **opts)
        song.add(bus, a, song.t(bar, beat) + r.uniform(-0.003, 0.006), gain, pan + r.uniform(-0.08, 0.08))


def riff16(bar, steps, vel_pat=None, dur=0.5):
    """steps: dict step->midi over one or more bars (16 steps per bar)."""
    out = []
    for st, m in sorted(steps.items()):
        b = bar + st // 16
        beat = (st % 16) * 0.25
        acc = 1.0 if (st % 8) in (0, 3, 6) else 0.72
        out.append((b, beat, dur, m, acc))
    return out


def lead_notes(song, notes, bar0=0, oct_shift=0):
    """(bar, beat, dur_beats, midi[, ornament]) -> haegeum note list in seconds."""
    out = []
    for n in notes:
        bar, beat, du, m = n[:4]
        orn = n[4] if len(n) > 4 else None
        out.append((song.t(bar0 + bar, beat), du * song.spb * 0.97, m + 12 * oct_shift, 0.95, orn))
    return out


def add_lead(song, bus, notes, gain=1.0, pan=0.0, seed=0, **kw):
    tail = secs(3.0)
    y = haegeum(notes, song.length + tail, seed=seed, **kw)
    song.add(bus, y, 0.0, gain, pan)


def add_mono(song, bus, notes, gain=1.0, pan=0.0, **kw):
    y = mono_synth(notes, song.length + secs(2.0), **kw)
    song.add(bus, y, 0.0, gain, pan)


def add_choir(song, bus, chords, vowel='a', gain=1.0, seed=0, parts=('bass', 'tenor', 'alto', 'soprano')):
    """chords: (start_s, dur_s, [b, t, a, s] midis)"""
    pans = {'bass': -0.15, 'tenor': 0.35, 'alto': -0.4, 'soprano': 0.2}
    lv = {'bass': 1.0, 'tenor': 0.9, 'alto': 0.85, 'soprano': 0.75}
    for pi, part in enumerate(parts):
        notes = [(st, du, ms[pi], 1.0) for st, du, ms in chords if ms[pi] is not None]
        y = choir_part(notes, song.length + secs(3.0), part, vowel, seed=seed + pi)
        y = y / (np.sqrt(np.mean(y[y != 0] ** 2)) + 1e-9) * 0.12 if np.any(y) else y
        song.add(bus, y, 0.0, gain * lv[part], pans[part])


# ====================================================================== MARKET

M_CH = {  # root (bass octave 2), pad voicing, pentatonic riff key tones
    'Am': (45, [57, 60, 64, 71]),
    'F': (41, [53, 57, 60, 64]),
    'G': (43, [55, 59, 62, 64]),
    'Em': (40, [52, 55, 59, 62]),
    'Dm': (38, [50, 57, 60, 65]),
    'Esus': (40, [52, 57, 59, 64]),
    'E': (40, [52, 56, 59, 64]),
}
M_PROG = ['Am', 'F', 'G', 'Em', 'Am', 'F', 'Dm', 'Esus']

M_RIFF_A = {0: 69, 2: 76, 3: 74, 4: 72, 6: 69, 7: 67, 8: 69, 10: 72, 11: 74, 12: 76, 14: 79, 15: 76,
            16: 74, 18: 72, 19: 69, 20: 72, 22: 74, 24: 76, 26: 74, 27: 72, 28: 69, 30: 67, 31: 64}
M_RIFF_B = {0: 67, 2: 74, 3: 72, 4: 69, 6: 67, 7: 64, 8: 67, 10: 69, 11: 72, 12: 74, 14: 76, 15: 74,
            16: 76, 18: 74, 19: 71, 20: 69, 22: 67, 24: 64, 26: 67, 27: 69, 28: 71, 30: 74, 31: 76}
M_RIFF_C = {0: 69, 2: 76, 3: 74, 4: 72, 6: 69, 7: 67, 8: 69, 10: 72, 11: 74, 12: 76, 14: 79, 15: 76,
            16: 74, 18: 72, 19: 69, 20: 74, 22: 76, 24: 76, 26: 74, 27: 71, 28: 71, 30: 68, 31: 71}

M_THEME = [  # bars relative to section start; haegeum
    (0, 0, 1.5, 76), (0, 1.5, 0.5, 74), (0, 2, 1, 72), (0, 3, 1, 74),
    (1, 0, 2, 76, 'scoop'), (1, 2, 1, 79), (1, 3, 1, 76),
    (2, 0, 1.5, 74), (2, 1.5, 0.5, 72), (2, 2, 2, 69),
    (3, 0, 1, 67), (3, 1, 1, 69), (3, 2, 1, 72), (3, 3, 1, 71),
    (4, 0, 3, 69, 'shake'), (4, 3, 0.5, 72), (4, 3.5, 0.5, 74),
    (5, 0, 1.5, 76), (5, 1.5, 0.5, 79), (5, 2, 2, 81),
    (6, 0, 1, 79), (6, 1, 1, 77), (6, 2, 1, 76), (6, 3, 1, 74),
    (7, 0, 3.5, 76, 'shake'),
]
M_THEME_HI = [
    (0, 0, 1.5, 81), (0, 1.5, 0.5, 79), (0, 2, 1, 76), (0, 3, 1, 79),
    (1, 0, 2, 81, 'scoop'), (1, 2, 1, 84), (1, 3, 1, 81),
    (2, 0, 1.5, 79), (2, 1.5, 0.5, 76), (2, 2, 2, 74),
    (3, 0, 1, 76), (3, 1, 1, 79), (3, 2, 1, 81), (3, 3, 1, 83),
    (4, 0, 2, 84, 'shake'), (4, 2, 0.5, 83), (4, 2.5, 0.5, 81), (4, 3, 1, 79),
    (5, 0, 3, 81), (5, 3, 0.5, 79), (5, 3.5, 0.5, 76),
    (6, 0, 1, 77), (6, 1, 1, 76), (6, 2, 1, 74), (6, 3, 1, 72),
    (7, 0, 2, 71, 'scoop'), (7, 2, 1.5, 76, 'fall'),
]


def market():
    s = Song(bpm=126, bars=32, seed=11)
    kit = Kit(100)
    s.bus('kick', level=-12, hp=30)
    s.bus('snare', level=-16, reverb_send=0.16)
    s.bus('hats', level=-25, reverb_send=0.05, hp=3000)
    s.bus('kor', level=-18.5, reverb_send=0.2)
    s.bus('bass', level=-13.5, duck=0.45, lp=6000)
    s.bus('pad', level=-21.5, duck=0.4, reverb_send=0.3, chorus_mix=0.5, hp=180)
    s.bus('stab', level=-22.5, duck=0.3, reverb_send=0.18, delay_send=0.12, hp=200)
    s.bus('gaya', level=-16.5, reverb_send=0.2, delay_send=0.1, eq=[(2600, 1.5, 1.0)])
    s.bus('lead', level=-14, reverb_send=0.24, delay_send=0.12)
    s.bus('fx', level=-21, reverb_send=0.35)
    r = rng(5)

    for bar in range(32):
        sec = 'A' if bar < 8 else 'B' if bar < 16 else 'C' if bar < 24 else 'D'
        ch = M_PROG[bar % 8]
        root, voic = M_CH[ch]
        brk = 24 <= bar < 28
        build = bar >= 28
        # ---------------- drums
        if not brk:
            if build and bar < 30:
                kit.pattern(s, 'kick', 'kick', bar, 'X.......x.......')
            elif bar == 31:
                kit.pattern(s, 'kick', 'kick', bar, 'X...x...x.x.x...')
            else:
                kit.pattern(s, 'kick', 'kick', bar, 'X...x...x...x...' if bar % 8 != 7 else 'X...x...x...x.x.')
        if sec in 'ABC':
            kit.pattern(s, 'snare', 'clap', bar, '....X.......X...', 0.9)
            kit.pattern(s, 'snare', 'snare', bar, '....x.......x...', 0.55)
            if bar % 8 == 7:
                kit.pattern(s, 'snare', 'snare', bar, '.............oxX', 0.7)
        if build:
            roll = {28: 'o.o.o.o.o.o.o.o.', 29: 'o.o.o.o.x.x.x.x.', 30: 'xoxoxoxoxxxxxxxx', 31: 'xxxxxxxxXXXX....'}[bar]
            for t, c in s.steps(bar, roll):
                kit.hit(s, 'snare', 'snare', t, VEL[c] * (0.35 + 0.65 * (bar - 28 + (t - s.t(bar)) / s.bar) / 4))
        if sec == 'A':
            kit.pattern(s, 'hats', 'hat', bar, '..x...x...x...x.', 0.9)
            kit.pattern(s, 'hats', 'shaker', bar, 'g.o.g.o.g.o.g.o.', 0.7, pan=0.35)
        elif sec == 'B':
            kit.pattern(s, 'hats', 'hat', bar, 'gox.gox.gox.gox.', 0.9, pan=-0.15)
            kit.pattern(s, 'hats', 'shaker', bar, '..o...o...o...o.', 0.6, pan=0.35)
        elif sec == 'C':
            kit.pattern(s, 'hats', 'hat', bar, 'gxogoxogoxogoxog', 0.9, pan=-0.15)
            kit.pattern(s, 'hats', 'ohat', bar, '..x...x...x...x.', 0.55, pan=0.2)
        elif brk:
            kit.pattern(s, 'hats', 'shaker', bar, 'o.g.o.g.o.g.x.g.', 0.8, pan=0.3)
        else:
            kit.pattern(s, 'hats', 'hat', bar, 'oxoxoxoxoxoxoxox' if bar >= 30 else '..x...x...x...x.', 0.6 + 0.1 * (bar - 28))
        # janggu 3-3-2 (the traditional backbone)
        if sec in 'ABC' or brk:
            deok = 'X..x..x.x..x..x.' if not brk else 'X..x..x.X..x.ox.'
            kit.pattern(s, 'kor', 'deok', bar, deok, 0.7 if sec == 'A' else 0.8, pan=0.3)
            kit.pattern(s, 'kor', 'kung', bar, 'x.......x.......' if not brk else 'X.....x.x.......', 0.8, pan=-0.3)
            if sec != 'A':
                kit.pattern(s, 'kor', 'deok_soft', bar, '.g.g.g.g.g.g.gg.', 0.6, pan=0.3)
        if sec in 'BC' and bar % 2 == 0:
            kit.hit(s, 'kor', 'buk', s.t(bar), 0.9, -0.1)
        if bar % 8 == 7 and sec in 'ABC':
            kit.pattern(s, 'kor', 'buk_hi', bar, '........X..x..x.', 0.75, pan=0.15)
        if build:
            pat = {28: 'X.......X.......', 29: 'X...X...X...X...', 30: 'X.X.X.X.X.X.X.X.', 31: 'XXXXXXXXX.......'}[bar]
            kit.pattern(s, 'kor', 'buk', bar, pat, 0.7 + 0.08 * (bar - 28))
        # ---------------- bass
        bnotes = []
        if sec == 'A':
            for k in range(4):
                bnotes.append((s.t(bar, k + 0.5), s.spb * 0.42, root + (12 if k % 2 else 0), 0.9))
        elif sec == 'B':
            for st in (0, 3, 6, 8, 11, 14):
                bnotes.append((s.t(bar, st * 0.25), s.spb * 0.6, root + (12 if st in (6, 14) else 0), 1.0 if st in (0, 8) else 0.8))
        elif sec == 'C':
            for k in range(8):
                bnotes.append((s.t(bar, k * 0.5), s.spb * 0.4, root + (12 if k % 4 == 3 else 0), 1.0 if k % 2 == 0 else 0.75))
        elif brk:
            bnotes.append((s.t(bar), s.bar * 0.95, root - 12 if root >= 43 else root, 0.7))
        else:
            for k in range(8 if bar < 30 else 16):
                step = 0.5 if bar < 30 else 0.25
                bnotes.append((s.t(bar, k * step), step * s.spb * 0.7, root, 0.6 + 0.4 * k / 16))
        cut = 300 if brk else 420 if sec != 'C' else 520
        add_mono(s, 'bass', bnotes, base_cut=cut, env_cut=1500, env_dec=0.09, q=1.0, seed=bar, sub=0.8)
        # ---------------- harmony
        if ch == 'Esus':
            chord_bar(s, 'pad', bar, M_CH['Esus'][1], beats=2, seed=bar, cutoff=1400 if brk else 2200)
            chord_bar(s, 'pad', bar + 0.5, M_CH['E'][1], beats=2, seed=bar + 50, cutoff=1400 if brk else 2200)
        else:
            chord_bar(s, 'pad', bar, voic, seed=bar, cutoff=1300 if brk else 2000 if sec == 'A' else 2600, attack=0.6 if brk else 0.3)
        if sec == 'C' or bar in (30, 31):
            v = voic if ch != 'Esus' else M_CH['E'][1]
            for k in range(4):
                st = supersaw_chord([m + 12 for m in v], s.spb * 0.28, seed=bar * 10 + k, attack=0.004, release=0.08, cutoff=3200, bright_env=3000)
                s.add('stab', st, s.t(bar, k + 0.5), 0.8)
        if sec == 'A':
            for k in range(4):
                for m in voic[1:]:
                    s.add('stab', pluck_synth(m + 12, 0.18, seed=bar * 7 + k), s.t(bar, k + 0.5), 0.35, 0.3 if k % 2 else -0.3)
        # ---------------- gayageum
        if sec in 'ABC' and bar % 2 == 0:
            # bars 6-7 of each phrase end on Esus -> E: that riff carries G# instead of G
            riff = M_RIFF_C if bar % 8 == 6 else M_RIFF_B if bar % 4 == 2 else M_RIFF_A
            lvl = 0.9 if sec == 'A' else 0.62
            gaya_line(s, 'gaya', riff16(bar, riff, dur=0.55), seed=bar, gain=lvl, pan=0.18)
        if bar in (30,):
            gaya_line(s, 'gaya', riff16(bar, M_RIFF_A, dur=0.5), seed=bar, gain=0.8, pan=0.18)
    # breakdown solo (bars 24-27) — slow with nonghyeon bends
    solo = [(24, 0, 2, 69, 1.0, dict(vib=0.45, bend_in=1.0)), (24, 2, 1, 72, 0.8), (24, 3, 1, 74, 0.8),
            (25, 0, 3, 76, 1.0, dict(vib=0.5, bend_in=2.0)), (25, 3, 1, 74, 0.8),
            (26, 0, 2, 72, 0.95, dict(vib=0.4)), (26, 2, 1, 69, 0.8), (26, 3, 1, 67, 0.8),
            (27, 0, 3.5, 69, 1.0, dict(vib=0.55, bend_down=1.0))]
    gaya_line(s, 'gaya', solo, seed=77, gain=1.0, pan=0.0)
    # counter-melody answers in C (low gayageum under the high haegeum)
    counter = [(17, 2, 1, 64, 0.8), (17, 3, 1, 67, 0.8), (19, 2.5, 0.5, 67, 0.7), (19, 3, 1, 69, 0.8),
               (21, 2, 2, 72, 0.9, dict(vib=0.35)), (23, 2, 1, 71, 0.8), (23, 3, 1, 68, 0.8)]
    gaya_line(s, 'gaya', counter, seed=91, gain=0.8, pan=-0.35)
    # ---------------- lead
    add_lead(s, 'lead', lead_notes(s, M_THEME, 8) + lead_notes(s, M_THEME_HI, 16), gain=1.0, pan=-0.05, seed=3)
    # ---------------- fx
    for bar in (0, 8, 16):
        kit.hit(s, 'fx', 'crash', s.t(bar), 0.8 if bar else 1.0, 0.25)
    s.add('fx', sub_boom(1, 1.4, 45), s.t(0), 0.9)
    s.add('fx', sub_boom(2, 1.4, 45), s.t(16), 0.7)
    s.add('fx', riser(s.bar * 4, seed=3), s.t(28), 0.45)
    s.add('fx', reverse_cymbal(s.spb * 2, seed=4), s.t(31, 2), 0.7)
    kit.hit(s, 'fx', 'taiko', s.t(24), 0.9, 0.0)
    kit.hit(s, 'fx', 'crash', s.t(24), 0.6, -0.25)
    return s, dict(reverb_cfg=dict(rt60=1.9, damp_hz=6500, size=1.0, predelay=0.018))


# ====================================================================== PLAZA / STAIRS

P_CH = {
    'Dm': (38, [50, 57, 62, 65, 69], [62, 65, 69, 74, 77, 81]),
    'Bb': (34, [46, 53, 58, 62, 65], [58, 62, 65, 70, 74, 77]),
    'C': (36, [48, 55, 60, 64, 67], [60, 64, 67, 72, 76, 79]),
    'Am': (33, [45, 52, 57, 60, 64], [57, 60, 64, 69, 72, 76]),
    'Gm': (31, [43, 50, 55, 58, 62], [55, 58, 62, 67, 70, 74]),
    'A': (33, [45, 52, 57, 61, 64], [57, 61, 64, 69, 73, 76]),
}
P_PROG = ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'Gm', 'A']
P_THEME1 = [
    (0, 0, 1, 69), (0, 1, 1, 74), (0, 2, 1.5, 77), (0, 3.5, 0.5, 76),
    (1, 0, 2, 74, 'scoop'), (1, 2, 1, 72), (1, 3, 1, 74),
    (2, 0, 1, 76), (2, 1, 1, 79), (2, 2, 1, 76), (2, 3, 1, 72),
    (3, 0, 3, 69, 'shake'), (3, 3, 0.5, 72), (3, 3.5, 0.5, 74),
    (4, 0, 1.5, 77), (4, 1.5, 0.5, 76), (4, 2, 1, 74), (4, 3, 1, 69),
    (5, 0, 1, 70), (5, 1, 1, 74), (5, 2, 2, 77, 'scoop'),
    (6, 0, 1.5, 79), (6, 1.5, 0.5, 77), (6, 2, 1, 74), (6, 3, 1, 70),
    (7, 0, 2, 73, 'shake'), (7, 2, 1, 76), (7, 3, 1, 81),
]
P_THEME2 = [
    (0, 0, 2, 86, 'scoop'), (0, 2, 0.5, 84), (0, 2.5, 0.5, 81), (0, 3, 1, 77),
    (1, 0, 1, 79), (1, 1, 1, 77), (1, 2, 2, 74),
    (2, 0, 1, 76), (2, 1, 1, 79), (2, 2, 1.5, 84), (2, 3.5, 0.5, 82),
    (3, 0, 4, 81, 'shake'),
    (4, 0, 1, 77), (4, 1, 1, 81), (4, 2, 1, 86), (4, 3, 1, 84),
    (5, 0, 1.5, 82), (5, 1.5, 0.5, 81), (5, 2, 2, 77),
    (6, 0, 1, 79), (6, 1, 1, 82), (6, 2, 1, 86), (6, 3, 1, 84),
    (7, 0, 2, 85, 'shake'), (7, 2, 2, 81, 'fall'),
]


def plaza():
    s = Song(bpm=138, bars=40, seed=21)
    kit = Kit(200)
    s.bus('kick', level=-12, hp=30)
    s.bus('snare', level=-16, reverb_send=0.15)
    s.bus('hats', level=-25, reverb_send=0.05, hp=3000)
    s.bus('kor', level=-18.5, reverb_send=0.22)
    s.bus('bass', level=-13.5, duck=0.5, lp=5500)
    s.bus('pad', level=-21.5, duck=0.4, reverb_send=0.3, chorus_mix=0.5, hp=160)
    s.bus('brass', level=-19, duck=0.25, reverb_send=0.2, hp=150)
    s.bus('gaya', level=-16.5, reverb_send=0.2, delay_send=0.08, eq=[(2600, 1.5, 1.0)])
    s.bus('lead', level=-14, reverb_send=0.25, delay_send=0.1)
    s.bus('saw', level=-21, reverb_send=0.2, delay_send=0.1, hp=200)
    s.bus('choir', level=-18.5, reverb_send=0.4, hp=120)
    s.bus('fx', level=-21, reverb_send=0.35)
    choir = []
    for bar in range(40):
        sec = 'ABCDE'[bar // 8]
        ch = P_PROG[bar % 8]
        root, voic, arp = P_CH[ch]
        half = sec == 'D'
        last2 = bar >= 38
        # ---------------- drums
        if half:
            kit.pattern(s, 'kick', 'kick', bar, 'X.........x.....' if bar % 2 == 0 else 'X.........x...x.')
            kit.pattern(s, 'snare', 'snare', bar, '........X.......', 1.0)
            kit.pattern(s, 'snare', 'clap', bar, '........X.......', 0.7)
            kit.pattern(s, 'hats', 'hat', bar, 'x.o.x.o.x.o.x.oo', 0.8)
        else:
            if last2:
                kit.pattern(s, 'kick', 'kick', bar, 'X...x...x...x...' if bar == 38 else 'X...x...X.X.XXXX')
            else:
                kit.pattern(s, 'kick', 'kick', bar, 'X...x...x...x...' if bar % 4 != 3 else 'X...x...x...x..x')
            kit.pattern(s, 'snare', 'snare', bar, '....X.......X...', 0.85)
            kit.pattern(s, 'snare', 'clap', bar, '....X.......X...', 0.75)
            if bar % 8 == 7 and not last2:
                kit.pattern(s, 'snare', 'snare', bar, '..........o.xoxX', 0.7)
            kit.pattern(s, 'hats', 'hat', bar, 'xoXoxoXoxoXoxoXo' if sec != 'A' else 'goxogoxogoxogoxo', 0.85, pan=-0.12)
            if sec in 'CE':
                kit.pattern(s, 'hats', 'ohat', bar, '..x...x...x...x.', 0.5, pan=0.2)
        if last2:
            roll = 'xoxoxoxoxxxxxxxx' if bar == 38 else 'xxxxxxxxXXXXXXXX'
            for t, c in s.steps(bar, roll):
                kit.hit(s, 'snare', 'snare', t, VEL[c] * (0.45 + 0.55 * (bar - 38 + (t - s.t(bar)) / s.bar) / 2))
        # janggu hwimori-style drive, buk accents
        if not half:
            kit.pattern(s, 'kor', 'deok', bar, 'X.oX.oX.X.oX.oX.' if sec != 'A' else 'X..x..x.X..x..x.', 0.75, pan=0.3)
            kit.pattern(s, 'kor', 'kung', bar, 'x.....x.x.......', 0.75, pan=-0.3)
        else:
            kit.pattern(s, 'kor', 'buk', bar, 'X.....X.....X...' if bar % 2 == 0 else 'X.....X...X.X.X.', 0.95)
            kit.pattern(s, 'kor', 'rim', bar, '...x.....x....x.', 0.55, pan=0.25)
            kit.pattern(s, 'kor', 'deok', bar, 'x.ox.ox.x.ox.ox.', 0.55, pan=0.3)
        if sec in 'BCE' and bar % 2 == 0:
            kit.hit(s, 'kor', 'buk', s.t(bar), 0.9)
            kit.hit(s, 'kor', 'buk_hi', s.t(bar, 2.75), 0.55, 0.2)
        if bar in (16, 24, 32):
            kit.hit(s, 'fx', 'taiko', s.t(bar), 1.0)
        # ---------------- bass
        bn = []
        if half:
            bn.append((s.t(bar), s.bar * 0.48, root, 1.0))
            bn.append((s.t(bar, 2.5), s.spb * 1.3, root, 0.8))
        else:
            for beat in range(4):
                for st in (1, 2, 3):
                    m = root + (12 if st == 3 else 0) + 12
                    bn.append((s.t(bar, beat + st * 0.25), s.spb * 0.2, m - 12, 0.95 if st == 1 else 0.75))
        add_mono(s, 'bass', bn, base_cut=360 if not half else 260, env_cut=1800 if not half else 900, env_dec=0.07, q=1.2,
                 seed=bar, sub=0.8, osc='bass' if not half else 'reese', drive=1.8)
        # ---------------- harmony
        chord_bar(s, 'pad', bar, voic, seed=bar, cutoff=2400 if sec != 'D' else 1500, attack=0.25)
        if sec == 'E' or (sec == 'D' and bar % 2 == 0):
            hits = [(0, 0.28), (0.75, 0.28), (1.5, 0.4)] if sec == 'E' else [(0, 0.9)]
            for b, d in hits:
                s.add('brass', brass_stab([m + 12 for m in voic[1:4]], d * s.spb * (1 if sec == 'E' else 2), seed=bar, vel=1.0), s.t(bar, b), 0.9)
            if sec == 'E':
                for b, d in [(2.5, 0.28), (3.0, 0.5)]:
                    s.add('brass', brass_stab([m + 12 for m in voic[1:4]], d * s.spb, seed=bar + 3, vel=0.8), s.t(bar, b), 0.75)
        if sec in 'CE':
            b, t_, a_, so = voic[0] - 12 + 12, voic[1], voic[2], voic[3]
            choir.append((s.t(bar), s.bar * 0.98, [voic[0], voic[1], voic[3], voic[4]]))
        elif sec == 'D':
            choir.append((s.t(bar), s.bar * 0.98, [voic[0], voic[1], voic[2], None]))
        # ---------------- gayageum tremolo arps
        if sec in 'ABCE':
            seq = arp + arp[-2:0:-1]
            notes = []
            for k in range(16):
                notes.append((bar, k * 0.25, 0.4, seq[k % len(seq)] + (0 if sec == 'A' else 12 if k % 8 == 7 else 0), 1.0 if k % 4 == 0 else 0.7))
            gaya_line(s, 'gaya', notes, seed=bar + 300, gain=0.85 if sec == 'A' else 0.55, pan=0.25 if bar % 2 else -0.1)
    # half-time gayageum solo
    solo = [(24, 0, 1.5, 74, 1.0, dict(vib=0.4, bend_in=1.0)), (24, 1.5, 0.5, 72, 0.7), (24, 2, 2, 69, 0.9, dict(vib=0.35)),
            (25, 0, 1, 70, 0.9), (25, 1, 1, 69, 0.8), (25, 2, 2, 65, 0.9, dict(vib=0.4)),
            (26, 0, 1.5, 67, 1.0, dict(bend_in=1.0)), (26, 1.5, 0.5, 70, 0.7), (26, 2, 2, 72, 0.9, dict(vib=0.45)),
            (27, 0, 4, 69, 1.0, dict(vib=0.6, bend_down=1.0)),
            (28, 0, 1.5, 77, 1.0, dict(vib=0.4, bend_in=2.0)), (28, 1.5, 0.5, 76, 0.7), (28, 2, 2, 74, 0.9, dict(vib=0.35)),
            (29, 0, 1, 74, 0.9), (29, 1, 1, 72, 0.8), (29, 2, 2, 70, 0.9, dict(vib=0.4)),
            (30, 0, 2, 70, 1.0, dict(vib=0.3)), (30, 2, 2, 74, 0.9), (31, 0, 4, 73, 1.0, dict(vib=0.5))]
    gaya_line(s, 'gaya', solo, seed=900, gain=1.3, pan=0.0)
    add_lead(s, 'lead', lead_notes(s, P_THEME1, 8) + lead_notes(s, P_THEME2, 16) + lead_notes(s, P_THEME1, 32), seed=5)
    # saw doubling an octave below in C
    add_mono(s, 'saw', [(t, d, m - 12, 0.8) for t, d, m, v, o in lead_notes(s, P_THEME2, 16)], osc='saw', glide=0.03,
             base_cut=1400, env_cut=1800, env_dec=0.3, q=0.9, sub=0.0, drive=1.1, vib=0.15, seed=7)
    add_choir(s, 'choir', choir, 'a', seed=31)
    for bar in (0, 8, 16, 32):
        kit.hit(s, 'fx', 'crash', s.t(bar), 1.0 if bar in (0, 16) else 0.8, 0.25)
    s.add('fx', sub_boom(3, 1.5, 42), s.t(0), 0.9)
    s.add('fx', sub_boom(4, 1.5, 42), s.t(24), 0.9)
    s.add('fx', riser(s.bar * 2, seed=5), s.t(38), 0.5)
    s.add('fx', reverse_cymbal(s.spb * 2, seed=6), s.t(39, 2), 0.7)
    return s, dict(reverb_cfg=dict(rt60=2.1, damp_hz=6000, size=1.1, predelay=0.02))


# ====================================================================== BOSS

B_CH = {
    'Cm': (36, [48, 55, 60, 63, 67]),
    'Db': (37, [49, 56, 61, 65, 68]),
    'Bb': (34, [46, 53, 58, 62, 65]),
    'Ab': (32, [44, 51, 56, 60, 63]),
    'Fm': (29, [41, 48, 53, 56, 60]),
    'G': (31, [43, 50, 55, 59, 62]),
}
B_PROG = ['Cm', 'Db', 'Cm', 'Bb', 'Ab', 'Fm', 'G', 'G']
B_THEME = [
    (0, 0, 2, 79, 'scoop'), (0, 2, 1, 80), (0, 3, 1, 79),
    (1, 0, 1.5, 77), (1, 1.5, 0.5, 75), (1, 2, 2, 73, 'shake'),
    (2, 0, 1, 72), (2, 1, 1, 75), (2, 2, 1, 79), (2, 3, 1, 84),
    (3, 0, 3, 82, 'shake'), (3, 3, 0.5, 80), (3, 3.5, 0.5, 79),
    (4, 0, 2, 80, 'scoop'), (4, 2, 1, 79), (4, 3, 1, 77),
    (5, 0, 1, 75), (5, 1, 1, 77), (5, 2, 2, 80),
    (6, 0, 2, 79, 'shake'), (6, 2, 1, 83), (6, 3, 1, 86),
    (7, 0, 4, 79, 'fall'),
]
B_GAYA = {0: 0, 3: 1, 6: 2, 8: 3, 10: 2, 11: 1, 12: 2, 14: 1}   # 3-3-2 chord-tone figure (index into the chord)


def boss():
    s = Song(bpm=140, bars=40, seed=31)
    kit = Kit(300)
    s.bus('kick', level=-12, hp=30)
    s.bus('snare', level=-16, reverb_send=0.18)
    s.bus('hats', level=-25, reverb_send=0.05, hp=3000)
    s.bus('taiko', level=-14.5, reverb_send=0.28, hp=35)
    s.bus('kor', level=-18.5, reverb_send=0.2)
    s.bus('bass', level=-13.5, duck=0.4, lp=4500)
    s.bus('geo', level=-18.5, reverb_send=0.15)
    s.bus('brass', level=-19, duck=0.2, reverb_send=0.22, hp=150)
    s.bus('choir', level=-18.5, reverb_send=0.45, hp=110)
    s.bus('pad', level=-21.5, duck=0.3, reverb_send=0.3, chorus_mix=0.4, hp=150)
    s.bus('gaya', level=-16.5, reverb_send=0.22, delay_send=0.1)
    s.bus('lead', level=-14, reverb_send=0.28, delay_send=0.1)
    s.bus('fx', level=-21, reverb_send=0.35)
    choir = []
    for bar in range(40):
        sec = 'ABCDE'[bar // 8]
        ch = B_PROG[bar % 8]
        root, voic = B_CH[ch]
        brk = sec == 'D' and bar < 30
        build = bar in (30, 31)
        # ---------------- taiko ensemble (always, it is the spine of the cue)
        big = 'X..x..x.X...x.x.' if bar % 2 == 0 else 'X..x..x.X..xX.XX'
        if brk:
            big = 'X.....x...x.X...' if bar % 2 == 0 else 'X.....x...x.XxXx'
        kit.pattern(s, 'taiko', 'taiko', bar, big, 0.95, jitter=0.006)
        kit.pattern(s, 'taiko', 'taiko_hi', bar, '..x...x...x...x.' if sec != 'A' else '......x.......x.', 0.55, pan=0.25, jitter=0.006)
        kit.pattern(s, 'kor', 'deok', bar, 'xoxxoxxoxoxxoxxo' if sec in 'BCE' else 'x.ox.ox.x.ox.ox.', 0.6, pan=0.35)
        kit.pattern(s, 'kor', 'rim', bar, '....x.......x...' if sec in 'AD' else '...x..x....x..x.', 0.5, pan=-0.3)
        if build:
            kit.pattern(s, 'taiko', 'taiko_hi', bar, 'x.x.x.x.xxxxxxxx' if bar == 30 else 'xxxxxxxxXXXXXXXX', 0.5 + 0.3 * (bar - 30))
            kit.pattern(s, 'kor', 'tom_lo', bar, 'x...x...x.x.x.x.', 0.6)
        # ---------------- kit
        if sec == 'A':
            kit.pattern(s, 'kick', 'kick', bar, 'X.......X.......')
            kit.pattern(s, 'snare', 'snare', bar, '........X.......', 0.7)
            kit.pattern(s, 'hats', 'hat', bar, 'x.x.x.x.x.x.x.x.', 0.6)
        elif sec in 'BCE':
            kit.pattern(s, 'kick', 'kick', bar, 'X...x...x...x...' if bar % 4 != 3 else 'X...x...x...x.xx')
            kit.pattern(s, 'snare', 'snare', bar, '....X.......X...', 0.9)
            kit.pattern(s, 'snare', 'clap', bar, '....X.......X...', 0.5)
            kit.pattern(s, 'hats', 'hat', bar, 'xoXoxoXoxoXoxoXo', 0.85, pan=-0.12)
            if sec == 'E':
                kit.pattern(s, 'hats', 'ohat', bar, '..x...x...x...x.', 0.5, pan=0.2)
        elif build:
            kit.pattern(s, 'kick', 'kick', bar, 'X...X...X...X...' if bar == 30 else 'X.X.X.X.XXXXXXXX')
            roll = 'x.x.x.x.xxxxxxxx' if bar == 30 else 'xxxxxxxxXXXXXXXX'
            for t, c in s.steps(bar, roll):
                kit.hit(s, 'snare', 'snare', t, VEL[c] * (0.4 + 0.6 * (bar - 30 + (t - s.t(bar)) / s.bar) / 2))
        # ---------------- bass (reese) + geomungo ostinato
        bn = []
        if brk:
            bn.append((s.t(bar), s.bar * 0.97, root, 0.8))
        elif sec == 'A':
            bn.append((s.t(bar), s.spb * 1.8, root, 1.0))
            bn.append((s.t(bar, 2), s.spb * 1.8, root, 0.9))
        else:
            for k in range(8):
                bn.append((s.t(bar, k * 0.5), s.spb * 0.45, root + (12 if k in (3, 7) else 0), 1.0 if k % 2 == 0 else 0.8))
        add_mono(s, 'bass', bn, osc='reese', base_cut=300 if brk else 420, env_cut=1100, env_dec=0.12, q=1.1, seed=bar, sub=0.9, drive=2.2)
        if not brk:
            fifth = root + 7
            geo_pat = {0: root + 12, 3: root + 12, 6: fifth + 12, 8: root + 12, 11: root + 12, 14: root + 22}
            for st, m in geo_pat.items():
                a = geomungo(m, s.spb * 0.6, 1.0 if st in (0, 8) else 0.75, seed=bar * 20 + st, bend_in=1.0 if st == 14 else 0.0)
                s.add('geo', a, s.t(bar, st * 0.25), 1.0, -0.2)
        # ---------------- harmony
        if sec in 'ACE':
            choir.append((s.t(bar), s.bar * 0.98, [voic[0], voic[1], voic[3], voic[4]]))
        elif sec == 'D':
            choir.append((s.t(bar), s.bar * 0.98, [voic[0], voic[1], voic[2], voic[3]]))
        chord_bar(s, 'pad', bar, voic, seed=bar, cutoff=1400 if brk else 1900, attack=0.4)
        if sec in 'BE':
            for st, d in ((0, 0.3), (3, 0.3), (6, 0.5), (10, 0.3), (12, 0.8)):
                s.add('brass', brass_stab([m + 12 for m in voic[1:5]], d * s.spb, seed=bar * 5 + st, vel=1.0 if st in (0, 12) else 0.8), s.t(bar, st * 0.25), 0.9)
        elif sec == 'C' and bar % 2 == 0:
            s.add('brass', brass_stab([m + 12 for m in voic[1:5]], 1.5 * s.spb, seed=bar, vel=0.9), s.t(bar), 0.8)
        # ---------------- gayageum high riff in B (answering the brass)
        if sec in 'BE':
            tones = sorted(set(m + 24 for m in voic[1:]))[:4]
            steps = {st: tones[i] for st, i in B_GAYA.items()}
            gaya_line(s, 'gaya', riff16(bar, steps, dur=0.5), seed=bar + 600, gain=0.9 if sec == 'B' else 0.6, pan=0.3)
    add_lead(s, 'lead', lead_notes(s, B_THEME, 16) + lead_notes(s, B_THEME, 32, 0), seed=9, vib=0.38)
    add_mono(s, 'brass', [(t, d, m - 12, 0.7) for t, d, m, v, o in lead_notes(s, B_THEME, 32)], osc='saw', glide=0.03,
             base_cut=900, env_cut=1600, env_dec=0.25, q=1.0, sub=0.0, drive=1.3, vib=0.12, seed=13, gain=0.7)
    add_choir(s, 'choir', [c for c in choir], 'a', seed=41)
    for bar in (0, 8, 16, 32):
        kit.hit(s, 'fx', 'crash', s.t(bar), 1.0 if bar in (0, 32) else 0.8, 0.25)
        s.add('fx', sub_boom(bar, 1.6, 38), s.t(bar), 1.0)
    s.add('fx', riser(s.bar * 2, seed=7, f_lo=200, f_hi=6000), s.t(30), 0.55)
    s.add('fx', reverse_cymbal(s.spb * 2, seed=8), s.t(31, 2), 0.75)
    return s, dict(reverb_cfg=dict(rt60=2.6, damp_hz=5000, size=1.25, predelay=0.025))


# ====================================================================== STINGS

def victory():
    s = Song(bpm=120, bars=3, loop=False, tail=2.8, seed=41)
    kit = Kit(400)
    s.bus('drums', level=-12.5, reverb_send=0.3)
    s.bus('brass', level=-15.5, reverb_send=0.3, hp=120)
    s.bus('gaya', level=-16.0, reverb_send=0.3, delay_send=0.1)
    s.bus('choir', level=-17.0, reverb_send=0.5, hp=110)
    s.bus('bass', level=-15.5)
    s.bus('bell', level=-21.0, reverb_send=0.5)
    s.bus('lead', level=-14.5, reverb_send=0.35)
    # hits: A (beat 0), A (1.5), F#m (2) D (2.5) E (3) -> A (4, held)
    A, Fsm, D, E = [45, 57, 61, 64, 69], [42, 54, 57, 61, 66], [38, 50, 57, 62, 66], [40, 52, 56, 59, 64]
    for beat, ch, d in ((0, A, 0.35), (1.5, A, 0.35), (2.0, Fsm, 0.4), (2.5, D, 0.4), (3.0, E, 0.8)):
        s.add('brass', brass_stab([m + 12 for m in ch[1:]], d * s.spb, seed=int(beat * 10), vel=1.0), s.t(0, beat), 0.9)
        kit.hit(s, 'drums', 'taiko', s.t(0, beat), 0.9, 0.0)
        s.add('bass', mono_synth([(0, d * s.spb, ch[0], 1.0)], secs(1.2), base_cut=500), s.t(0, beat), 1.0)
    kit.hit(s, 'drums', 'crash', 0.0, 0.8, 0.2)
    run = [69, 71, 73, 76, 78, 81, 83, 85, 88]
    for k, m in enumerate(run):
        s.add('gaya', gayageum(m, 0.3, 0.9, seed=k), s.t(0, 0.5 + k * 0.125), 0.9, 0.2)
    # final chord at bar 1
    fin = s.t(1)
    s.add('brass', brass_stab([57, 61, 64, 69, 73], 2.2, seed=9, vel=1.0), fin, 1.0)
    kit.hit(s, 'drums', 'taiko', fin, 1.0)
    kit.hit(s, 'drums', 'crash', fin, 1.0, -0.2)
    s.add('drums', sub_boom(1, 2.0, 44), fin, 0.9)
    for k, m in enumerate([69, 76, 81, 85]):
        s.add('gaya', gayageum(m, 2.5, 0.9, seed=50 + k, vib=0.25 if k == 3 else 0), fin + k * 0.06, 0.8, -0.3 + 0.2 * k)
        s.add('bell', fm_bell(m + 12, 3.0, seed=k), fin + k * 0.09, 0.5, 0.3 - 0.2 * k)
    s.add('bass', mono_synth([(0, 2.4, 33, 1.0)], secs(5.0), base_cut=400, release=0.6), fin, 1.0)
    add_choir(s, 'choir', [(fin, 2.6, [45, 52, 61, 64])], 'a', seed=3)
    add_lead(s, 'lead', [(s.t(0, 2.0), s.spb * 1.0, 76, 0.9, None), (s.t(0, 3.0), s.spb * 0.95, 80, 0.9, None),
                         (fin, 2.4, 81, 1.0, 'shake')], seed=11)
    return s, dict(reverb_cfg=dict(rt60=2.4, damp_hz=6000, size=1.2, predelay=0.02))


def defeat():
    s = Song(bpm=72, bars=2, loop=False, tail=3.2, seed=51)
    kit = Kit(500)
    s.bus('drums', level=-14.0, reverb_send=0.4)
    s.bus('pad', level=-19.0, reverb_send=0.4, hp=100)
    s.bus('choir', level=-17.0, reverb_send=0.5, hp=100)
    s.bus('lead', level=-15.0, reverb_send=0.35)
    s.bus('gaya', level=-18.0, reverb_send=0.35)
    s.bus('bass', level=-16.5)
    kit.hit(s, 'drums', 'taiko', 0.0, 1.0)
    s.add('drums', sub_boom(5, 2.5, 36), 0.0, 0.8)
    kit.hit(s, 'drums', 'taiko', s.t(1), 0.7)
    chords = [(0, [45, 52, 57, 60, 64]), (s.t(0, 2), [41, 53, 57, 60, 65]), (s.t(1), [38, 50, 57, 62, 65]), (s.t(1, 2), [40, 52, 56, 59, 64])]
    for k, (t, ch) in enumerate(chords):
        d = s.spb * 2 if k < 3 else 3.2
        s.add('pad', supersaw_chord(ch[1:], d, seed=k, attack=0.25, release=1.4, cutoff=1500), t, 1.0)
        s.add('bass', mono_synth([(0, d, ch[0] - 12 if ch[0] > 40 else ch[0], 1.0)], secs(d + 5.0), base_cut=300, release=0.8), t, 1.0)
    add_choir(s, 'choir', [(t, (s.spb * 2 if k < 3 else 3.2), [ch[0], ch[1], ch[2], ch[3]]) for k, (t, ch) in enumerate(chords)], 'o', seed=5)
    add_lead(s, 'lead', [(s.t(0, 0.5), s.spb * 0.9, 76, 0.9, None), (s.t(0, 1.5), s.spb * 0.9, 74, 0.85, None),
                         (s.t(0, 2.5), s.spb * 0.9, 72, 0.85, None), (s.t(0, 3.5), s.spb * 0.9, 71, 0.8, None),
                         (s.t(1, 0.5), s.spb * 1.8, 69, 0.85, 'shake'), (s.t(1, 2.5), 2.6, 68, 0.8, 'fall')], seed=13, vib=0.3)
    for k, (bar, beat, m) in enumerate([(0, 0, 57), (0, 2, 53), (1, 0, 50), (1, 2, 52)]):
        s.add('gaya', gayageum(m, 1.4, 0.8, seed=k + 70, vib=0.3, bend_down=0.5 if k == 3 else 0), s.t(bar, beat), 0.9, -0.2)
    return s, dict(reverb_cfg=dict(rt60=3.0, damp_hz=4500, size=1.3, predelay=0.03))


CUES = {'market': market, 'plaza': plaza, 'boss': boss, 'victory': victory, 'defeat': defeat}
