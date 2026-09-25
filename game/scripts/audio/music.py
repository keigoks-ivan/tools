"""The five march cues, arranged for recorded instruments (VSCO 2 CE / VCSL / MuseScore General choir) with a
thin hybrid layer (synth kick + sine sub) only under the drums and bass.

  market   夜市霓虹   126 BPM, A minor pentatonic, 32 bars (≈61 s loop)
           đàn tranh (gayageum stand-in) 16th riff, frame-drum janggu 3-3-2, pizzicato / spiccato strings,
           solo-violin (haegeum stand-in) theme, string pads, breakdown with bent zither, cymbal-swell build
  plaza    魂門階梯   138 BPM, D minor, 40 bars (≈70 s loop) — plaza and stairs
           cello / bass spiccato ostinato, bass-drum buk accents, zither arpeggios, choir + brass in the climax
  boss     魂門守將   140 BPM, C minor / phrygian colour, 40 bars (≈69 s loop)
           concert bass drum + timpani "taiko" ensemble, low zither + pizz ostinato, horn / trombone / trumpet
           stabs, choir, solo-violin lament, gong
  victory / defeat    one-shot stings

Composition data lives in score.py. Rendering uses song.py (periodic loops, circular effects), sampler.py
(velocity layers, round robins, pitch curves) and library.py (instrument definitions).
"""
import math

import numpy as np

import library as lib
from dsp import SR, hall_ir, midi_hz, rng, secs, butter_hp, butter_lp
from instruments import kick as synth_kick, mono_synth, sub_boom
from score import (B_CH, B_GAYA, B_PROG, B_THEME, M_CH, M_PROG, M_RIFF_A, M_RIFF_B, M_RIFF_C, M_THEME, M_THEME_HI,
                   P_CH, P_PROG, P_THEME1, P_THEME2)
from song import Song

VEL = {'X': 1.0, 'x': 0.78, 'o': 0.5, 'g': 0.32}


def place(st, pan=0.0, width=1.0):
    """Stereo image: shrink the side signal, then balance-pan."""
    m = (st[:, 0] + st[:, 1]) * 0.5
    s = (st[:, 0] - st[:, 1]) * 0.5 * width
    l, r = m + s, m - s
    a = (pan + 1) * math.pi / 4
    return np.stack([l * math.cos(a) * math.sqrt(2), r * math.sin(a) * math.sqrt(2)], 1)


class Ctx:
    """Per-cue helpers bound to a Song: humanised timing / velocity and instrument shortcuts."""

    def __init__(self, song, seed):
        lib.reset_round_robins()
        self.s = song
        self.r = rng(seed)
        self.p = lib.perc()

    def jit(self, t, ms=6.0):
        t = t + self.r.uniform(-ms, ms) / 1000
        return t if self.s.loop else max(0.0, t)   # loops wrap negative times to the end

    def hv(self, v, amt=0.06):
        return float(np.clip(v * (1 + self.r.uniform(-amt, amt)), 0.05, 1.0))

    # ---- percussion
    def hit(self, bus, group, t, vel=0.8, pan=0.0, width=0.8, gain=1.0, pitch=0.0, length=None, ms=4.0):
        x = self.p.hit(group, self.hv(vel), pitch=pitch, length=length)
        self.s.add(bus, place(x, pan, width), self.jit(t, ms), gain)

    def pattern(self, bus, group, bar, pat, gain=1.0, pan=0.0, width=0.8, pitch=0.0, length=None, ms=4.0):
        for t, ch in self.s.steps(bar, pat):
            self.hit(bus, group, t, VEL.get(ch, 0.78), pan, width, gain, pitch, length, ms)

    def kick(self, bar, pat, gain=1.0):
        """Hybrid kick: synthesised punch (sub + click) — the only non-recorded drum."""
        for t, ch in self.s.steps(bar, pat):
            v = VEL.get(ch, 0.78)
            k = synth_kick(int(self.r.integers(3)))
            self.s.add('kick', np.stack([k, k], 1), self.jit(t, 2), gain * v)
            self.s.duck_on(t)

    # ---- pitched
    def note(self, bus, inst, t, midi, dur, vel=0.8, pan=0.0, width=1.0, gain=1.0, ms=8.0, **kw):
        y = inst.note(midi, dur, self.hv(vel), **kw)
        self.s.add(bus, place(y, pan, width), self.jit(t - inst.last_lag, ms), gain)

    def chord(self, bus, inst, t, midis, dur, vel=0.6, pan=0.0, spread=0.5, width=0.9, gain=1.0, strum=0.0, **kw):
        n = len(midis)
        for i, m in enumerate(midis):
            p = pan + (spread * (i / max(1, n - 1) * 2 - 1) if n > 1 else 0)
            self.note(bus, inst, t + i * strum, m, dur, vel, p, width, gain / math.sqrt(n), **kw)

    def strings(self, bus, t, voicing, dur, vel=0.55, bass=None, gain=1.0, attack=0.12):
        """Section pad: celli (lowest), violas (middle), violins (top two) — like a string reduction."""
        v = sorted(voicing)
        vl = [m for m in v[-2:]]
        va = [m for m in v[1:-2]] or [v[1]]
        vc = [bass if bass is not None else v[0]]
        for m in vl:
            self.note(bus, lib.violins(), t, m + (12 if m < 60 else 0), dur, vel, -0.45, 0.8, gain * 0.6, fade_in=attack)
        for m in va:
            self.note(bus, lib.violas(), t, m, dur, vel, 0.1, 0.8, gain * 0.55, fade_in=attack)
        for m in vc:
            self.note(bus, lib.celli(), t, m + (12 if m < 36 else 0), dur, vel, 0.45, 0.8, gain * 0.6, fade_in=attack)

    def violin_line(self, bus, notes, inst=None, pan=0.0, gain=1.0, vib_extra=1.0, octave=0):
        """Legato lead: portamento from the previous note, scoops / 농현 shakes / falls as pitch curves."""
        inst = inst or lib.solo_violin()
        prev = None
        for (t, dur, m, v, orn) in sorted(notes, key=lambda n: n[0]):
            m = m + 12 * octave
            legato = prev is not None and t - (prev[0] + prev[1]) < 0.04
            n_out = int((dur + 0.4) * SR)
            tt = np.arange(n_out) / SR
            bend = np.zeros(n_out)
            if legato:
                bend += (prev[2] - m) * np.exp(-tt / 0.045)
            if orn == 'scoop':
                bend -= 1.0 * np.exp(-tt / 0.07)
            elif orn == 'shake':
                bend += 0.5 * vib_extra * np.clip((tt - 0.12) / 0.25, 0, 1) * np.sin(2 * np.pi * 5.8 * tt)
            elif orn == 'fall':
                bend -= 2.0 * np.clip((tt - dur * 0.65) / (dur * 0.35 + 1e-3), 0, 1) ** 2
            y = inst.note(m, dur, self.hv(v, 0.04), bend=bend, start_offset=0.09 if legato else 0.0,
                          fade_in=0.035 if legato else 0.0, release=0.18)
            at = t - (0.02 if legato else inst.last_lag)
            self.s.add(bus, place(y, pan, 0.6), at if self.s.loop else max(0.0, at), gain)
            prev = (t, dur, m)

    def zither(self, bus, notes, pan=0.0, gain=1.0, width=0.7):
        """notes: (t, dur, midi, vel, opts). opts: vib (use the vibrato articulation), bend_in, bend_down."""
        for (t, dur, m, v, o) in notes:
            o = o or {}
            inst = lib.dantranh_vib() if o.get('vib') else lib.dantranh()
            n_out = int((dur + 2.5) * SR)
            tt = np.arange(n_out) / SR
            bend = np.zeros(n_out)
            if o.get('bend_in'):
                bend -= o['bend_in'] * np.exp(-tt / 0.06)
            if o.get('bend_down'):
                bend -= o['bend_down'] * np.clip((tt - dur * 0.55) / max(dur * 0.4, 0.05), 0, 1) ** 1.5
            ring = o.get('ring', 1.2 if dur < 0.4 else 2.0)
            y = inst.note(m, dur, self.hv(v, 0.08), bend=bend, ring=ring)
            self.s.add(bus, place(y, pan + self.r.uniform(-0.06, 0.06), width), self.jit(t - inst.last_lag, 5), gain)

    def sub(self, notes, gain=1.0):
        """Hybrid sine sub under the recorded basses (sidechained with the kick on the bus)."""
        y = mono_synth(notes, self.s.length + secs(2), osc='bass', base_cut=90, env_cut=60, env_dec=0.1, q=0.7, sub=1.6,
                       detune_c=0, drive=1.1)
        y = butter_lp(y, 120)
        self.s.add('sub', np.stack([y, y], 1), 0.0, gain)

    def swell_into(self, bus, t_peak, group='cymbal_swell', gain=1.0):
        """Place a recorded cymbal crescendo so that its loudest point lands on t_peak, cut right after."""
        x = self.p.hit(group, 0.9)
        env = np.abs(x).max(axis=1)
        k = int(np.argmax(np.convolve(env, np.ones(2048) / 2048, mode='same')))
        y = x[:k + int(0.03 * SR)].copy()
        f = int(0.03 * SR)
        y[-f:] *= (np.cos(np.linspace(0, math.pi / 2, f)) ** 2)[:, None]
        self.s.add(bus, y, max(0.0, t_peak - k / SR), gain)


def riff16(bar, steps, dur=0.5):
    out = []
    for st, m in sorted(steps.items()):
        acc = 1.0 if (st % 8) in (0, 3, 6) else 0.72
        out.append((bar + st // 16, (st % 16) * 0.25, dur, m, acc))
    return out


def lead(song, notes, bar0=0, oct_shift=0, vel=0.9):
    out = []
    for n in notes:
        bar, beat, du, m = n[:4]
        orn = n[4] if len(n) > 4 else None
        out.append((song.t(bar0 + bar, beat), du * song.spb * 0.98, m + 12 * oct_shift, vel, orn))
    return out


def gnotes(song, notes, dur_scale=1.0):
    """(bar, beat, dur_beats, midi, vel[, opts]) -> zither note tuples in seconds."""
    return [(song.t(n[0], n[1]), n[2] * song.spb * dur_scale, n[3], n[4], n[5] if len(n) > 5 else None) for n in notes]


def ir_for(rt60, seed=7, pre=0.022):
    return hall_ir(rt60=rt60, predelay=pre, seed=seed)


# ====================================================================== MARKET

def market():
    s = Song(bpm=126, bars=32, seed=11)
    c = Ctx(s, 5)
    s.bus('kick', level=-14.0, hp=28)
    s.bus('sub', level=-17.0, duck=0.5, lp=140)
    s.bus('snare', level=-17.5, reverb_send=0.12)
    s.bus('hats', level=-25.0, reverb_send=0.05, hp=400)
    s.bus('kor', level=-18.0, reverb_send=0.14)
    s.bus('buk', level=-18.5, reverb_send=0.2, hp=30)
    s.bus('bass', level=-17.0, duck=0.25, reverb_send=0.06, hp=35)
    s.bus('strings', level=-20.0, duck=0.2, reverb_send=0.32, hp=60)
    s.bus('stab', level=-21.0, duck=0.15, reverb_send=0.2, hp=120)
    s.bus('gaya', level=-15.5, reverb_send=0.2, delay_send=0.08, hp=80)
    s.bus('lead', level=-15.0, reverb_send=0.26, delay_send=0.06, hp=150)
    s.bus('fx', level=-22.0, reverb_send=0.3)
    sub = []
    for bar in range(32):
        sec = 'A' if bar < 8 else 'B' if bar < 16 else 'C' if bar < 24 else 'D'
        ch = M_PROG[bar % 8]
        root, voic = M_CH[ch]
        brk = 24 <= bar < 28
        build = bar >= 28
        # ---------------- kit (hybrid kick, recorded snare / clap / hats)
        if not brk:
            if build and bar < 30:
                c.kick(bar, 'X.......x.......')
            elif bar == 31:
                c.kick(bar, 'X...x...x.x.x...')
            else:
                c.kick(bar, 'X...x...x...x...' if bar % 8 != 7 else 'X...x...x...x.x.')
        if sec in 'ABC':
            c.pattern('snare', 'clap', bar, '....X.......X...', 0.9, width=0.6)
            c.pattern('snare', 'snare', bar, '....x.......x...', 0.7)
            if bar % 8 == 7:
                c.pattern('snare', 'snare', bar, '.............oxX', 0.75)
        if build:
            roll = {28: 'o.o.o.o.o.o.o.o.', 29: 'o.o.o.o.x.x.x.x.', 30: 'xoxoxoxoxxxxxxxx', 31: 'xxxxxxxxXXXX....'}[bar]
            for t, chh in s.steps(bar, roll):
                c.hit('snare', 'snare', t, VEL[chh] * (0.35 + 0.65 * (bar - 28 + (t - s.t(bar)) / s.bar) / 4))
        if sec == 'A':
            c.pattern('hats', 'hat', bar, '..x...x...x...x.', 0.9, pan=-0.15)
            c.pattern('hats', 'shaker', bar, 'g.o.g.o.g.o.g.o.', 0.8, pan=0.35)
        elif sec == 'B':
            c.pattern('hats', 'hat', bar, 'gox.gox.gox.gox.', 0.9, pan=-0.15)
            c.pattern('hats', 'shaker', bar, '..o...o...o...o.', 0.7, pan=0.35)
        elif sec == 'C':
            c.pattern('hats', 'hat', bar, 'gxogoxogoxogoxog', 0.9, pan=-0.15)
            c.pattern('hats', 'tamb', bar, '....x.......x...', 0.6, pan=0.3)
            c.pattern('hats', 'hat_open', bar, '..x...x...x...x.', 0.45, pan=0.2, length=0.3)
        elif brk:
            c.pattern('hats', 'shaker', bar, 'o.g.o.g.o.g.x.g.', 0.9, pan=0.3)
        else:
            c.pattern('hats', 'hat', bar, 'oxoxoxoxoxoxoxox' if bar >= 30 else '..x...x...x...x.', 0.6 + 0.1 * (bar - 28))
        # ---------------- janggu (frame drums: small = chaepyeon stick, large = gungpyeon hand)
        if sec in 'ABC' or brk:
            deok = 'X..x..x.x..x..x.' if not brk else 'X..x..x.X..x.ox.'
            c.pattern('kor', 'frame_hi', bar, deok, 0.85 if sec == 'A' else 0.9, pan=0.3)
            c.pattern('kor', 'frame_lo', bar, 'x.......x.......' if not brk else 'X.....x.x.......', 0.85, pan=-0.3)
            if sec != 'A':
                c.pattern('kor', 'frame_hi_muted', bar, '.g.g.g.g.g.g.gg.', 0.7, pan=0.3)
        if sec in 'BC' and bar % 2 == 0:
            c.hit('buk', 'bass_drum', s.t(bar), 0.75)
        if bar % 8 == 7 and sec in 'ABC':
            c.pattern('kor', 'tom_hi', bar, '........X..x..x.', 0.75, pan=0.15)
        if build:
            pat = {28: 'X.......X.......', 29: 'X...X...X...X...', 30: 'X.X.X.X.X.X.X.X.', 31: 'XXXXXXXXX.......'}[bar]
            c.pattern('buk', 'bass_drum', bar, pat, 0.6 + 0.1 * (bar - 28))
            c.pattern('kor', 'timpani_hi', bar, pat, 0.5 + 0.12 * (bar - 28), pan=-0.2)
        # ---------------- bass: cello + contrabass spiccato, sine sub underneath
        if sec == 'A':
            for k in range(4):
                t = s.t(bar, k + 0.5)
                m = root + (12 if k % 2 else 0)
                c.note('bass', lib.celli_spic(), t, m + 12, 0.2, 0.7, 0.2)
                c.note('bass', lib.bass_spic(), t, m, 0.2, 0.75, -0.1)
                sub.append((t, s.spb * 0.42, root - 12 + 12 * (k % 2 == 0), 0.9))
        elif sec == 'B':
            for st in (0, 3, 6, 8, 11, 14):
                t = s.t(bar, st * 0.25)
                v = 0.9 if st in (0, 8) else 0.72
                c.note('bass', lib.celli_spic(), t, root + 12 + (12 if st in (6, 14) else 0), 0.25, v, 0.2)
                c.note('bass', lib.bass_spic(), t, root, 0.25, v, -0.1)
                sub.append((t, s.spb * 0.6, root - 12 + 12, v))
        elif sec == 'C':
            for k in range(8):
                t = s.t(bar, k * 0.5)
                v = 0.95 if k % 2 == 0 else 0.72
                c.note('bass', lib.celli_spic(), t, root + 12 + (12 if k % 4 == 3 else 0), 0.25, v, 0.2)
                c.note('bass', lib.bass_spic(), t, root, 0.25, v, -0.1)
                sub.append((t, s.spb * 0.4, root, v))
        elif brk:
            c.note('bass', lib.bass_sus(), s.t(bar), root - 12 if root >= 43 else root, s.bar * 0.95, 0.45, -0.1, fade_in=0.2)
            sub.append((s.t(bar), s.bar * 0.95, root - 12 if root >= 43 else root, 0.6))
        else:
            step = 0.5 if bar < 30 else 0.25
            for k in range(8 if bar < 30 else 16):
                t = s.t(bar, k * step)
                v = 0.55 + 0.4 * k / 16
                c.note('bass', lib.celli_spic(), t, root + 12, 0.2, v, 0.2)
                c.note('bass', lib.bass_spic(), t, root, 0.2, v, -0.1)
                sub.append((t, step * s.spb * 0.7, root, v))
        # ---------------- strings pad
        pv = 0.35 if brk else 0.45 if sec == 'A' else 0.55 if sec == 'B' else 0.7
        if ch == 'Esus':
            c.strings('strings', s.t(bar), M_CH['Esus'][1], s.bar * 0.5, pv, bass=root - 12 if root >= 43 else root)
            c.strings('strings', s.t(bar, 2), M_CH['E'][1], s.bar * 0.5, pv, bass=root - 12 if root >= 43 else root, attack=0.05)
        else:
            c.strings('strings', s.t(bar), voic, s.bar * 0.97, pv, bass=root - 12 if root >= 43 else root,
                      attack=0.35 if brk else 0.15)
        # ---------------- offbeat colour: pizzicato (A) / spiccato stabs (C, build)
        v = voic if ch != 'Esus' else M_CH['E'][1]
        if sec == 'A' or brk:
            for k in range(4):
                c.chord('stab', lib.violins_pizz(), s.t(bar, k + 0.5), [m + 12 for m in v[1:]], 0.3, 0.55 if sec == 'A' else 0.4,
                        pan=0.25 if k % 2 else -0.25, spread=0.3, strum=0.008)
        if sec == 'C' or bar in (30, 31):
            for k in range(4):
                c.chord('stab', lib.violins_spic(), s.t(bar, k + 0.5), [m + 12 for m in v[1:]], 0.2, 0.8, spread=0.45)
                c.chord('stab', lib.violas(), s.t(bar, k + 0.5), [v[0] + 12], 0.12, 0.6, gain=0.4, release=0.1)
        # ---------------- zither riff
        if sec in 'ABC' and bar % 2 == 0:
            riff = M_RIFF_C if bar % 8 == 6 else M_RIFF_B if bar % 4 == 2 else M_RIFF_A
            lvl = 1.0 if sec == 'A' else 0.72
            c.zither('gaya', [(t, d, m, v_, None) for (t, d, m, v_, _) in gnotes(s, riff16(bar, riff, 0.55))], pan=0.18, gain=lvl)
        if bar == 30:
            c.zither('gaya', [(t, d, m, v_, None) for (t, d, m, v_, _) in gnotes(s, riff16(bar, M_RIFF_A, 0.5))], pan=0.18, gain=0.85)
    # breakdown solo with vibrato / bends
    solo = [(24, 0, 2, 69, 1.0, dict(vib=1, bend_in=1.0)), (24, 2, 1, 72, 0.8), (24, 3, 1, 74, 0.8),
            (25, 0, 3, 76, 1.0, dict(vib=1, bend_in=2.0)), (25, 3, 1, 74, 0.8),
            (26, 0, 2, 72, 0.95, dict(vib=1)), (26, 2, 1, 69, 0.8), (26, 3, 1, 67, 0.8),
            (27, 0, 3.5, 69, 1.0, dict(vib=1, bend_down=1.0, ring=2.5))]
    c.zither('gaya', gnotes(s, solo), pan=0.0, gain=1.25)
    # harp counter-line answering the violin in C
    counter = [(17, 2, 1, 64, 0.8), (17, 3, 1, 67, 0.8), (19, 2.5, 0.5, 67, 0.7), (19, 3, 1, 69, 0.8),
               (21, 2, 2, 72, 0.9), (23, 2, 1, 71, 0.8), (23, 3, 1, 68, 0.8)]
    for (t, d, m, v, _) in gnotes(s, counter):
        c.note('gaya', lib.harp(), t, m, d, v, -0.4, 0.7, 0.8)
        c.note('gaya', lib.dantranh(), t, m, d, v * 0.8, -0.3, 0.7, 0.6)
    # ---------------- lead: solo violin (haegeum role); section violins double the high theme
    c.violin_line('lead', lead(s, M_THEME, 8) + lead(s, M_THEME_HI, 16), pan=-0.05)
    c.violin_line('strings', lead(s, M_THEME_HI, 16, vel=0.7), inst=lib.violins(), pan=0.3, gain=0.55, octave=-1)
    c.sub(sub)
    # ---------------- fx
    for bar in (0, 8, 16):
        c.hit('fx', 'crash', s.t(bar), 0.85 if bar else 1.0, 0.3)
    c.hit('fx', 'sus_cymbal', s.t(24), 0.6, -0.3)
    c.hit('buk', 'bass_drum2', s.t(24), 0.95)
    c.hit('buk', 'bass_drum2', s.t(0), 0.9)
    c.swell_into('fx', s.t(32), 'cymbal_swell', 1.0)
    c.pattern('fx', 'snare_roll', 30, 'x...............', 0.7, length=s.bar * 2 - 0.05)
    s.add('sub', np.stack([sub_boom(1, 1.4, 45)] * 2, 1), s.t(0), 0.5)
    return s, dict(ir=ir_for(2.0, 7))


# ====================================================================== PLAZA / STAIRS

def plaza():
    s = Song(bpm=138, bars=40, seed=21)
    c = Ctx(s, 15)
    s.bus('kick', level=-14.0, hp=28)
    s.bus('sub', level=-17.0, duck=0.5, lp=140)
    s.bus('snare', level=-17.0, reverb_send=0.12)
    s.bus('hats', level=-25.0, reverb_send=0.05, hp=400)
    s.bus('kor', level=-18.0, reverb_send=0.16)
    s.bus('buk', level=-17.0, reverb_send=0.22, hp=30)
    s.bus('bass', level=-16.0, duck=0.2, reverb_send=0.08, hp=35)
    s.bus('strings', level=-19.5, duck=0.15, reverb_send=0.32, hp=60)
    s.bus('brass', level=-18.5, duck=0.1, reverb_send=0.25, hp=60)
    s.bus('gaya', level=-17.0, reverb_send=0.2, delay_send=0.06, hp=80)
    s.bus('lead', level=-15.0, reverb_send=0.26, delay_send=0.06, hp=150)
    s.bus('choir', level=-19.0, reverb_send=0.4, hp=100)
    s.bus('fx', level=-22.0, reverb_send=0.3)
    sub = []
    choir = []
    for bar in range(40):
        sec = 'ABCDE'[bar // 8]
        ch = P_PROG[bar % 8]
        root, voic, arp = P_CH[ch]
        half = sec == 'D'
        last2 = bar >= 38
        # ---------------- kit
        if half:
            c.kick(bar, 'X.........x.....' if bar % 2 == 0 else 'X.........x...x.')
            c.pattern('snare', 'snare', bar, '........X.......', 1.0)
            c.pattern('snare', 'clap', bar, '........X.......', 0.7)
            c.pattern('hats', 'hat', bar, 'x.o.x.o.x.o.x.oo', 0.8)
        else:
            if last2:
                c.kick(bar, 'X...x...x...x...' if bar == 38 else 'X...x...X.X.XXXX')
            else:
                c.kick(bar, 'X...x...x...x...' if bar % 4 != 3 else 'X...x...x...x..x')
            c.pattern('snare', 'snare', bar, '....X.......X...', 0.9)
            c.pattern('snare', 'clap', bar, '....X.......X...', 0.75)
            if bar % 8 == 7 and not last2:
                c.pattern('snare', 'snare', bar, '..........o.xoxX', 0.75)
            c.pattern('hats', 'hat', bar, 'xoXoxoXoxoXoxoXo' if sec != 'A' else 'goxogoxogoxogoxo', 0.85, pan=-0.12)
            if sec in 'CE':
                c.pattern('hats', 'tamb', bar, '..x...x...x...x.', 0.55, pan=0.25)
        if last2:
            roll = 'xoxoxoxoxxxxxxxx' if bar == 38 else 'xxxxxxxxXXXXXXXX'
            for t, chh in s.steps(bar, roll):
                c.hit('snare', 'snare', t, VEL[chh] * (0.45 + 0.55 * (bar - 38 + (t - s.t(bar)) / s.bar) / 2))
        # ---------------- janggu drive / buk
        if not half:
            c.pattern('kor', 'frame_hi', bar, 'X.oX.oX.X.oX.oX.' if sec != 'A' else 'X..x..x.X..x..x.', 0.85, pan=0.3)
            c.pattern('kor', 'frame_lo', bar, 'x.....x.x.......', 0.85, pan=-0.3)
        else:
            c.pattern('buk', 'bass_drum', bar, 'X.....X.....X...' if bar % 2 == 0 else 'X.....X...X.X.X.', 0.9)
            c.pattern('kor', 'log_hi', bar, '...x.....x....x.', 0.6, pan=0.25)
            c.pattern('kor', 'frame_hi', bar, 'x.ox.ox.x.ox.ox.', 0.6, pan=0.3)
            c.pattern('kor', 'timpani_lo', bar, 'X.......X.......', 0.7, pan=-0.2)
        if sec in 'BCE' and bar % 2 == 0:
            c.hit('buk', 'bass_drum', s.t(bar), 0.85)
            c.hit('kor', 'tom_lo', s.t(bar, 2.75), 0.6, 0.2)
        if bar in (16, 24, 32):
            c.hit('buk', 'bass_drum2', s.t(bar), 1.0)
            c.hit('kor', 'timpani_lo', s.t(bar), 0.9, -0.2)
        # ---------------- bass ostinato: celli + contrabass spiccato (rolling 16ths), sub underneath
        if half:
            c.note('bass', lib.bass_sus(), s.t(bar), root, s.bar * 0.48, 0.7, -0.1)
            c.note('bass', lib.celli(), s.t(bar), root + 12, s.bar * 0.48, 0.6, 0.2)
            c.note('bass', lib.tuba(), s.t(bar, 2.5), root, s.spb * 1.3, 0.55, 0.0)
            sub += [(s.t(bar), s.bar * 0.48, root, 1.0), (s.t(bar, 2.5), s.spb * 1.3, root, 0.8)]
        else:
            for beat in range(4):
                for st in (1, 2, 3):
                    t = s.t(bar, beat + st * 0.25)
                    v = 0.9 if st == 1 else 0.7
                    c.note('bass', lib.celli_spic(), t, root + 12 + (12 if st == 3 else 0), 0.14, v, 0.2, ms=4)
                    if st != 3:
                        c.note('bass', lib.bass_spic(), t, root + 12, 0.14, v * 0.9, -0.1, ms=4)
                    sub.append((t, s.spb * 0.2, root, v))
        # ---------------- harmony
        c.strings('strings', s.t(bar), voic, s.bar * 0.97, 0.5 if sec in 'AB' else 0.65 if sec != 'D' else 0.45,
                  bass=root + 12 if root < 36 else root)
        if sec == 'E' or (sec == 'D' and bar % 2 == 0):
            top = [m + 12 for m in voic[1:4]]
            if sec == 'E':
                for b, d in [(0, 0.28), (0.75, 0.28), (1.5, 0.4), (2.5, 0.28), (3.0, 0.5)]:
                    vv = 0.95 if b in (0, 1.5, 3.0) else 0.75
                    c.chord('brass', lib.horns_stac(), s.t(bar, b), top, d * s.spb, vv, spread=0.4)
                    c.chord('brass', lib.trombones_stac(), s.t(bar, b), [voic[0], voic[1]], d * s.spb, vv, pan=0.2, spread=0.2)
                    c.note('brass', lib.trumpets_stac(), s.t(bar, b), top[-1] + 12 if top[-1] < 67 else top[-1], d * s.spb, vv, -0.2)
            else:
                c.chord('brass', lib.horns(), s.t(bar), top, s.bar * 1.9, 0.75, spread=0.4, fade_in=0.05)
                c.chord('brass', lib.trombones(), s.t(bar), [voic[0], voic[1]], s.bar * 1.9, 0.7, pan=0.25, spread=0.2)
        if sec in 'CE':
            choir.append((s.t(bar), s.bar * 0.98, [voic[0], voic[1], voic[3], voic[4]]))
        elif sec == 'D':
            choir.append((s.t(bar), s.bar * 0.98, [voic[0], voic[1], voic[2], voic[3]]))
        # ---------------- zither arpeggios
        if sec in 'ABCE':
            seq = arp + arp[-2:0:-1]
            notes = []
            for k in range(16):
                notes.append((s.t(bar, k * 0.25), s.spb * 0.35, seq[k % len(seq)] + (12 if (sec != 'A' and k % 8 == 7) else 0),
                              1.0 if k % 4 == 0 else 0.7, dict(ring=0.6)))
            c.zither('gaya', notes, pan=0.25 if bar % 2 else -0.1, gain=0.95 if sec == 'A' else 0.62)
    solo = [(24, 0, 1.5, 74, 1.0, dict(vib=1, bend_in=1.0)), (24, 1.5, 0.5, 72, 0.7), (24, 2, 2, 69, 0.9, dict(vib=1)),
            (25, 0, 1, 70, 0.9), (25, 1, 1, 69, 0.8), (25, 2, 2, 65, 0.9, dict(vib=1)),
            (26, 0, 1.5, 67, 1.0, dict(bend_in=1.0)), (26, 1.5, 0.5, 70, 0.7), (26, 2, 2, 72, 0.9, dict(vib=1)),
            (27, 0, 4, 69, 1.0, dict(vib=1, bend_down=1.0, ring=2.5)),
            (28, 0, 1.5, 77, 1.0, dict(vib=1, bend_in=2.0)), (28, 1.5, 0.5, 76, 0.7), (28, 2, 2, 74, 0.9, dict(vib=1)),
            (29, 0, 1, 74, 0.9), (29, 1, 1, 72, 0.8), (29, 2, 2, 70, 0.9, dict(vib=1)),
            (30, 0, 2, 70, 1.0, dict(vib=1)), (30, 2, 2, 74, 0.9), (31, 0, 4, 73, 1.0, dict(vib=1, ring=2.5))]
    c.zither('gaya', gnotes(s, solo), gain=1.3)
    c.violin_line('lead', lead(s, P_THEME1, 8) + lead(s, P_THEME2, 16) + lead(s, P_THEME1, 32), pan=-0.05)
    c.violin_line('strings', lead(s, P_THEME2, 16, vel=0.75), inst=lib.violins(), pan=0.35, gain=0.6, octave=-1)
    c.violin_line('brass', lead(s, P_THEME1, 32, vel=0.7), inst=lib.horns(), pan=0.2, gain=0.55, octave=-1)
    for st, du, ms in choir:
        kind = 'ooh' if st >= s.t(24) and st < s.t(32) else 'aah'
        for i, m in enumerate(ms):
            if m is not None:
                c.note('choir', lib.choir(kind), st, m + (12 if i >= 2 and m < 60 else 0), du, 0.7, (-0.4, 0.4, -0.15, 0.2)[i], 0.9, 0.5)
    c.sub(sub)
    for bar in (0, 8, 16, 32):
        c.hit('fx', 'crash', s.t(bar), 1.0 if bar in (0, 16) else 0.85, 0.3)
    c.hit('fx', 'gong', s.t(24), 0.7, -0.2, length=4.0)
    c.swell_into('fx', s.t(40), 'cymbal_swell', 1.0)
    c.pattern('fx', 'snare_roll', 38, 'x...............', 0.75, length=s.bar * 2 - 0.05)
    s.add('sub', np.stack([sub_boom(3, 1.5, 42)] * 2, 1), s.t(0), 0.5)
    return s, dict(ir=ir_for(2.2, 9))


# ====================================================================== BOSS

def boss():
    s = Song(bpm=140, bars=40, seed=31)
    c = Ctx(s, 25)
    s.bus('kick', level=-15.0, hp=28)
    s.bus('sub', level=-17.0, duck=0.4, lp=140)
    s.bus('snare', level=-17.5, reverb_send=0.14)
    s.bus('hats', level=-26.0, reverb_send=0.05, hp=400)
    s.bus('taiko', level=-14.5, reverb_send=0.28, hp=30)
    s.bus('kor', level=-19.0, reverb_send=0.16)
    s.bus('bass', level=-17.0, duck=0.15, reverb_send=0.1, hp=35)
    s.bus('geo', level=-18.5, reverb_send=0.16, hp=50)
    s.bus('brass', level=-17.0, reverb_send=0.26, hp=50)
    s.bus('choir', level=-18.0, reverb_send=0.42, hp=90)
    s.bus('strings', level=-20.0, reverb_send=0.32, hp=60)
    s.bus('gaya', level=-19.0, reverb_send=0.2, hp=80)
    s.bus('lead', level=-15.0, reverb_send=0.28, delay_send=0.05, hp=150)
    s.bus('fx', level=-21.0, reverb_send=0.3)
    sub = []
    for bar in range(40):
        sec = 'ABCDE'[bar // 8]
        ch = B_PROG[bar % 8]
        root, voic = B_CH[ch]
        brk = sec == 'D' and bar < 30
        build = bar in (30, 31)
        # ---------------- "taiko" ensemble: concert bass drum + low timpani, toms / frame drums answering
        big = 'X..x..x.X...x.x.' if bar % 2 == 0 else 'X..x..x.X..xX.XX'
        if brk:
            big = 'X.....x...x.X...' if bar % 2 == 0 else 'X.....x...x.XxXx'
        c.pattern('taiko', 'bass_drum', bar, big, 0.95, ms=6)
        c.pattern('taiko', 'timpani_lo', bar, big.replace('x', '.'), 0.85, pan=-0.15, ms=6)
        c.pattern('taiko', 'tom_lo', bar, '..x...x...x...x.' if sec != 'A' else '......x.......x.', 0.7, pan=0.25, ms=6)
        c.pattern('kor', 'frame_hi', bar, 'xoxxoxxoxoxxoxxo' if sec in 'BCE' else 'x.ox.ox.x.ox.ox.', 0.75, pan=0.35)
        c.pattern('kor', 'log_hi', bar, '....x.......x...' if sec in 'AD' else '...x..x....x..x.', 0.55, pan=-0.3)
        if build:
            c.pattern('taiko', 'tom_hi', bar, 'x.x.x.x.xxxxxxxx' if bar == 30 else 'xxxxxxxxXXXXXXXX', 0.55 + 0.3 * (bar - 30))
            c.pattern('taiko', 'timpani_hi', bar, 'x...x...x.x.x.x.', 0.7, pan=0.2)
        # ---------------- kit
        if sec == 'A':
            c.kick(bar, 'X.......X.......')
            c.pattern('snare', 'snare', bar, '........X.......', 0.8)
            c.pattern('hats', 'hat', bar, 'x.x.x.x.x.x.x.x.', 0.6)
        elif sec in 'BCE':
            c.kick(bar, 'X...x...x...x...' if bar % 4 != 3 else 'X...x...x...x.xx')
            c.pattern('snare', 'snare', bar, '....X.......X...', 0.95)
            c.pattern('snare', 'clap', bar, '....X.......X...', 0.5)
            c.pattern('hats', 'hat', bar, 'xoXoxoXoxoXoxoXo', 0.85, pan=-0.12)
            if sec == 'E':
                c.pattern('hats', 'tamb', bar, '..x...x...x...x.', 0.55, pan=0.25)
        elif build:
            c.kick(bar, 'X...X...X...X...' if bar == 30 else 'X.X.X.X.XXXXXXXX')
            roll = 'x.x.x.x.xxxxxxxx' if bar == 30 else 'xxxxxxxxXXXXXXXX'
            for t, chh in s.steps(bar, roll):
                c.hit('snare', 'snare', t, VEL[chh] * (0.4 + 0.6 * (bar - 30 + (t - s.t(bar)) / s.bar) / 2))
        # ---------------- low strings / tuba + sub
        if brk:
            c.note('bass', lib.bass_sus(), s.t(bar), root, s.bar * 0.97, 0.6, -0.1, fade_in=0.15)
            c.note('bass', lib.celli(), s.t(bar), root + 12, s.bar * 0.97, 0.5, 0.2, fade_in=0.2)
            sub.append((s.t(bar), s.bar * 0.97, root, 0.8))
        elif sec == 'A':
            for b in (0, 2):
                c.note('bass', lib.bass_sus(), s.t(bar, b), root, s.spb * 1.8, 0.8, -0.1)
                c.note('bass', lib.tuba(), s.t(bar, b), root, s.spb * 1.8, 0.7, 0.05)
                sub.append((s.t(bar, b), s.spb * 1.8, root, 1.0))
        else:
            for k in range(8):
                t = s.t(bar, k * 0.5)
                v = 0.95 if k % 2 == 0 else 0.75
                m = root + (12 if k in (3, 7) else 0)
                c.note('bass', lib.celli_spic(), t, m + 12, 0.22, v, 0.2, ms=4)
                c.note('bass', lib.bass_spic(), t, m, 0.22, v, -0.1, ms=4)
                if k % 2 == 0:
                    c.note('bass', lib.tuba_stac(), t, root, 0.3, v * 0.8, 0.0, ms=4)
                sub.append((t, s.spb * 0.45, root, v))
        # geomungo-like ostinato: low zither + contrabass pizz
        if not brk:
            fifth = root + 7
            geo = {0: root + 12, 3: root + 12, 6: fifth + 12, 8: root + 12, 11: root + 12, 14: root + 22}
            for st, m in geo.items():
                t = s.t(bar, st * 0.25)
                v = 1.0 if st in (0, 8) else 0.75
                c.zither('geo', [(t, s.spb * 0.6, m + 12, v, dict(ring=0.8, bend_in=1.0 if st == 14 else 0))], pan=-0.25, gain=1.0)
                c.note('geo', lib.bass_pizz(), t, m, s.spb * 0.5, v * 0.85, 0.15)
        # ---------------- harmony: strings, brass, choir
        c.strings('strings', s.t(bar), voic, s.bar * 0.97, 0.45 if brk else 0.6, bass=root + 12 if root < 36 else root)
        if sec in 'BE':
            for st, d in ((0, 0.3), (3, 0.3), (6, 0.5), (10, 0.3), (12, 0.8)):
                t = s.t(bar, st * 0.25)
                vv = 1.0 if st in (0, 12) else 0.8
                c.chord('brass', lib.horns_stac(), t, [m + 12 for m in voic[1:4]], d * s.spb, vv, spread=0.4)
                c.chord('brass', lib.trombones_stac(), t, [voic[0], voic[1]], d * s.spb, vv, pan=0.25, spread=0.2)
                c.note('brass', lib.trumpets_stac(), t, voic[4] + 12 if voic[4] < 64 else voic[4], d * s.spb, vv, -0.25)
        elif sec == 'C' and bar % 2 == 0:
            c.chord('brass', lib.horns(), s.t(bar), [m + 12 for m in voic[1:4]], s.bar * 1.9, 0.8, spread=0.4)
            c.chord('brass', lib.trombones(), s.t(bar), [voic[0], voic[1]], s.bar * 1.9, 0.75, pan=0.25, spread=0.2)
        kind = 'ooh' if sec == 'D' else 'aah'
        if sec in 'ACDE':
            ms = [voic[0], voic[1], voic[3], voic[4]] if sec != 'D' else [voic[0], voic[1], voic[2], voic[3]]
            for i, m in enumerate(ms):
                c.note('choir', lib.choir(kind), s.t(bar), m + (12 if i >= 2 and m < 60 else 0), s.bar * 0.98, 0.75,
                       (-0.4, 0.4, -0.15, 0.2)[i], 0.9, 0.5)
        if sec in 'BE':
            tones = sorted(set(m + 24 for m in voic[1:]))[:4]
            notes = [(s.t(bar, st * 0.25), s.spb * 0.5, tones[i], 1.0 if (st % 8) in (0, 3, 6) else 0.72, dict(ring=0.8))
                     for st, i in B_GAYA.items()]
            c.zither('gaya', notes, pan=0.3, gain=0.95 if sec == 'B' else 0.7)
    c.violin_line('lead', lead(s, B_THEME, 16) + lead(s, B_THEME, 32), pan=-0.05, vib_extra=1.2)
    c.violin_line('brass', lead(s, B_THEME, 32, vel=0.8), inst=lib.horns(), pan=0.2, gain=0.6, octave=-1)
    c.violin_line('strings', lead(s, B_THEME, 16, vel=0.7), inst=lib.violins(), pan=0.35, gain=0.5, octave=-1)
    c.sub(sub)
    for bar in (0, 8, 16, 32):
        c.hit('fx', 'crash', s.t(bar), 1.0 if bar in (0, 32) else 0.85, 0.3)
        c.hit('taiko', 'bass_drum2', s.t(bar), 1.0)
    c.hit('fx', 'gong', s.t(0), 0.85, -0.25, length=5.0)
    c.hit('fx', 'gong', s.t(24), 0.7, -0.25, length=5.0)
    c.swell_into('fx', s.t(32), 'cymbal_swell', 0.8)
    c.swell_into('fx', s.t(40), 'cymbal_swell', 1.0)
    s.add('sub', np.stack([sub_boom(5, 1.6, 38)] * 2, 1), s.t(0), 0.5)
    return s, dict(ir=ir_for(2.6, 11, 0.026))


# ====================================================================== STINGS

def victory():
    s = Song(bpm=120, bars=3, loop=False, tail=3.0, seed=41)
    c = Ctx(s, 35)
    s.bus('drums', level=-13.0, reverb_send=0.3)
    s.bus('brass', level=-15.0, reverb_send=0.3, hp=50)
    s.bus('gaya', level=-16.0, reverb_send=0.3)
    s.bus('strings', level=-18.0, reverb_send=0.35, hp=50)
    s.bus('choir', level=-18.0, reverb_send=0.45, hp=90)
    s.bus('bells', level=-21.0, reverb_send=0.45)
    s.bus('lead', level=-15.5, reverb_send=0.35)
    A, Fsm, D, E = [45, 57, 61, 64, 69], [42, 54, 57, 61, 66], [38, 50, 57, 62, 66], [40, 52, 56, 59, 64]
    for beat, ch, d in ((0, A, 0.35), (1.5, A, 0.35), (2.0, Fsm, 0.4), (2.5, D, 0.4), (3.0, E, 0.8)):
        t = s.t(0, beat)
        c.chord('brass', lib.horns_stac(), t, [m + 12 for m in ch[1:4]], d * s.spb, 0.95, spread=0.4)
        c.chord('brass', lib.trombones_stac(), t, [ch[0] + 12, ch[1]], d * s.spb, 0.9, pan=0.2, spread=0.2)
        c.note('brass', lib.trumpets_stac(), t, ch[4] + 12 if ch[4] < 67 else ch[4], d * s.spb, 0.95, -0.2)
        c.note('brass', lib.tuba_stac(), t, ch[0], d * s.spb, 0.8)
        c.hit('drums', 'bass_drum', t, 0.9)
        c.hit('drums', 'timpani_lo', t, 0.8, -0.2)
    c.hit('drums', 'crash', 0.0, 0.8, 0.25)
    run = [69, 71, 73, 76, 78, 81, 83, 85, 88]
    c.zither('gaya', [(s.t(0, 0.5 + k * 0.125), 0.3, m, 0.9, dict(ring=1.2)) for k, m in enumerate(run)], pan=0.2)
    fin = s.t(1)
    c.chord('brass', lib.horns(), fin, [61, 64, 69], 2.3, 0.9, spread=0.4)
    c.chord('brass', lib.trombones(), fin, [45, 52, 57], 2.3, 0.85, pan=0.2, spread=0.3)
    c.chord('brass', lib.trumpets(), fin, [73, 76], 2.3, 0.85, pan=-0.2, spread=0.2)
    c.note('brass', lib.tuba(), fin, 33, 2.3, 0.8)
    c.strings('strings', fin, [57, 61, 64, 69, 73], 2.6, 0.7, bass=45)
    c.hit('drums', 'bass_drum2', fin, 1.0)
    c.hit('drums', 'timpani_lo', fin, 1.0, -0.2)
    c.hit('drums', 'crash', fin, 1.0, -0.2)
    c.hit('drums', 'gong', fin, 0.6, 0.2, length=3.2)
    for k, m in enumerate([69, 76, 81, 85]):
        c.zither('gaya', [(fin + k * 0.06, 2.5, m, 0.9, dict(vib=1 if k == 3 else 0, ring=2.2))], pan=-0.3 + 0.2 * k)
        if lib.glock():
            c.note('bells', lib.glock(), fin + k * 0.09, m + 12, 2.5, 0.7, 0.3 - 0.2 * k)
    if lib.tubular():
        c.note('bells', lib.tubular(), fin, 69, 3.0, 0.8, 0.1)
    for i, m in enumerate([45, 52, 61, 64]):
        c.note('choir', lib.choir('aah'), fin, m + (12 if i >= 2 and m < 60 else 0), 2.6, 0.8, (-0.4, 0.4, -0.15, 0.2)[i], 0.9, 0.5)
    c.violin_line('lead', [(s.t(0, 2.0), s.spb * 1.0, 76, 0.9, None), (s.t(0, 3.0), s.spb * 0.95, 80, 0.9, None),
                           (fin, 2.4, 81, 1.0, 'shake')])
    return s, dict(ir=ir_for(2.4, 13))


def defeat():
    s = Song(bpm=72, bars=2, loop=False, tail=3.4, seed=51)
    c = Ctx(s, 45)
    s.bus('drums', level=-15.0, reverb_send=0.4)
    s.bus('strings', level=-17.5, reverb_send=0.4, hp=50)
    s.bus('choir', level=-18.0, reverb_send=0.5, hp=90)
    s.bus('lead', level=-15.5, reverb_send=0.35)
    s.bus('gaya', level=-19.0, reverb_send=0.35)
    s.bus('bass', level=-18.0, reverb_send=0.2)
    c.hit('drums', 'bass_drum2', 0.0, 1.0)
    c.hit('drums', 'timpani_lo', 0.0, 0.8, -0.2)
    c.hit('drums', 'gong', 0.0, 0.55, 0.2, length=5.5)
    c.hit('drums', 'timpani_lo', s.t(1), 0.6, -0.2)
    chords = [(0, [45, 52, 57, 60, 64]), (s.t(0, 2), [41, 53, 57, 60, 65]), (s.t(1), [38, 50, 57, 62, 65]), (s.t(1, 2), [40, 52, 56, 59, 64])]
    for k, (t, ch) in enumerate(chords):
        d = s.spb * 2 if k < 3 else 3.4
        c.strings('strings', t, ch[1:], d, 0.55, bass=ch[0])
        c.note('bass', lib.bass_sus(), t, ch[0] - 12 if ch[0] > 40 else ch[0], d, 0.55, fade_in=0.1)
        for i, m in enumerate(ch[:4]):
            c.note('choir', lib.choir('ooh'), t, m + (12 if i >= 2 and m < 60 else 0), d, 0.65, (-0.4, 0.4, -0.15, 0.2)[i], 0.9, 0.5)
    c.violin_line('lead', [(s.t(0, 0.5), s.spb * 0.9, 76, 0.85, None), (s.t(0, 1.5), s.spb * 0.9, 74, 0.8, None),
                           (s.t(0, 2.5), s.spb * 0.9, 72, 0.8, None), (s.t(0, 3.5), s.spb * 0.9, 71, 0.75, None),
                           (s.t(1, 0.5), s.spb * 1.8, 69, 0.8, 'shake'), (s.t(1, 2.5), 2.6, 68, 0.75, 'fall')])
    c.zither('gaya', [(s.t(0, 0), 1.4, 57, 0.8, dict(vib=1)), (s.t(0, 2), 1.4, 53, 0.8, dict(vib=1)),
                      (s.t(1, 0), 1.4, 50, 0.8, dict(vib=1)), (s.t(1, 2), 1.6, 52, 0.8, dict(vib=1, bend_down=0.5, ring=2.5))], pan=-0.2)
    return s, dict(ir=ir_for(3.0, 17, 0.03))


CUES = {'market': market, 'plaza': plaza, 'boss': boss, 'victory': victory, 'defeat': defeat}
