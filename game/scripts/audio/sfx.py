"""Sound effects for the march level, built from recorded CC0 sources and packed into one mono sprite.

Sources (see samplelib.py for the folder layout, CREDITS.md for licences): OpenGameArt StarNinjas sword swings
and clashes, Kenney impact / RPG / interface / sci-fi packs, OpenGameArt "breaking and falling" and
"80 CC0 creature SFX", VSCO 2 CE / VCSL orchestral percussion, MuseScore General choir. Each effect layers
recordings (aligned on their loudest point, repitched, EQ'd) with at most a small synthesised support layer
(low thump / air). Seeded variants avoid repetition. Sound ids are the ones audio.js maps game events to.

build_sprite() returns (audio, table, info):
  table[id] = [[start_s, dur_s], ...] relative to the calibration marker; info['marker'] = marker position.
"""
import math

import numpy as np

import library as lib
import samplelib as L
from dsp import SR, TAU, bp, butter_bp, butter_hp, butter_lp, db, hp, peq, reverb, rng, saturate, secs, sine
from sampler import _play

GAP = 0.12
MARKER_AT = 0.05
MARKER_LEN = 0.012


# ------------------------------------------------------------------ recorded-source helpers

def src(rel):
    """Mono float64 of a sample under the samples root (glob allowed, first match)."""
    p = L.find(rel)
    if not p:
        raise SystemExit(f'missing sample {rel}')
    return L.read(p[0]).mean(axis=1).astype(float)


def sfx(name):
    return src('sfx/**/' + name) if '/' not in name else src('sfx/' + name)


def env_of(x, win=0.01):
    k = max(1, int(win * SR))
    return np.convolve(np.abs(x), np.ones(k) / k, mode='same')


def trim(x, db_=-45.0, pre=0.002):
    e = np.abs(x)
    thr = e.max() * 10 ** (db_ / 20)
    i = int(np.argmax(e > thr))
    j = len(x) - int(np.argmax(e[::-1] > thr * 0.3))
    return x[max(0, i - int(pre * SR)):j].copy()


def at_peak(x, lead=0.035, dur=None, fade_in=0.012):
    """Start `lead` seconds before the loudest point (so a swing's whoosh peaks right after the event)."""
    k = int(np.argmax(env_of(x, 0.02)))
    a = max(0, k - int(lead * SR))
    y = x[a:].copy() if dur is None else x[a:a + int(dur * SR)].copy()
    f = min(len(y) // 4, int(fade_in * SR))
    if f > 0 and a > 0:
        y[:f] *= np.linspace(0, 1, f) ** 2
    return fade_end(y, 0.04)


def pitch(x, semis):
    if not semis:
        return x
    r = 2 ** (semis / 12)
    n = int(len(x) / r) - 4
    st = np.ascontiguousarray(np.stack([x, x], 1), dtype=np.float32)
    return _play(st, np.full(n, r), n, 0.0)[:, 0].astype(float)


def fit(x, dur, fade=0.05):
    y = x[:int(dur * SR)].copy()
    return fade_end(y, fade)


def fade_end(x, sec=0.03):
    x = np.asarray(x, dtype=float).copy()
    f = max(1, min(len(x) // 3, secs(sec)))
    x[-f:] *= np.cos(np.linspace(0, math.pi / 2, f)) ** 2
    return x


def nrm(x, peak=1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def mix(n, *layers):
    out = np.zeros(n)
    for x, g, at in layers:
        a = secs(at)
        if a >= n:
            continue
        x = np.asarray(x, dtype=float)
        k = min(len(x), n - a)
        out[a:a + k] += fade_end(nrm(x[:k]), 0.02) * g
    return out


def room(x, rt=0.6, wet=0.2, damp=5000, size=0.6, pre=0.008):
    st = np.stack([x, x], 1)
    w = reverb(st, rt60=rt, damp_hz=damp, size=size, predelay=pre, lo_cut=120, mod=2.0)
    return x + wet * (w[:, 0] + w[:, 1]) * 0.5 * 2.2


def pad(x, sec):
    return np.concatenate([x, np.zeros(secs(sec))])


def thump(dur, f_start, f_end, decay, drive=1.4):
    """Synth support: a short pitched low-end thud under recorded impacts (phones lose it, headphones feel it)."""
    n = secs(dur)
    t = np.arange(n) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / (decay * 0.35))
    y = sine(f) * np.exp(-t / decay) * np.clip(t / 0.0015, 0, 1)
    return fade_end(saturate(y * drive, 1.0), min(0.06, dur * 0.3))


def air(dur, f0=2500, f1=9000, seed=0, peak=0.25):
    """Synth support: a thin high 'air' swish (band-passed noise sweep)."""
    r = rng(seed)
    n = secs(dur)
    x = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** np.clip(x / peak, 0, 1)
    env = np.where(x < peak, (x / peak) ** 2, np.exp(-(x - peak) / (1 - peak) * 4))
    return fade_end(bp(r.standard_normal(n), fc, 1.2) * env, 0.03)


def perc(group, vel=0.9, length=None, pitch_=0.0):
    x = lib.perc().hit(group, vel, pitch=pitch_, length=length)
    return x.mean(axis=1).astype(float)


def inst_note(inst, midi, dur, vel=0.8, **kw):
    return inst.note(midi, dur, vel, **kw).mean(axis=1).astype(float)


def chord_of(inst, midis, dur, vel=0.8, strum=0.0, **kw):
    parts = [inst_note(inst, m, dur, vel, **kw) for m in midis]
    n = max(len(p) for p in parts) + secs(strum * len(midis))
    out = np.zeros(n)
    for i, p in enumerate(parts):
        a = secs(strum * i)
        out[a:a + len(p)] += p
    return out


# ------------------------------------------------------------------ designs (sound ids used by audio.js)

def s_swing_light(v):
    x = sfx(['sword.1.ogg', 'sword.3.ogg', 'sword.7.ogg'][v])
    y = at_peak(butter_hp(x, 250), 0.035, 0.32)
    body = at_peak(pitch(sfx(['cloth4.ogg', 'cloth2.ogg', 'cloth4.ogg'][v]), 3 + v), 0.035, 0.3)
    n = len(y)
    return mix(n, (y, 1.0, 0), (butter_bp(body, 400, 3000), 0.45, 0), (air(0.2, seed=v), 0.15, 0.0))


def s_swing_heavy(v):
    x = sfx(['sword.9.ogg', 'sword.5.ogg'][v])
    y = at_peak(pitch(butter_hp(x, 120), -4), 0.05, 0.55)
    body = at_peak(pitch(sfx('cloth1.ogg' if v == 0 else 'cloth3.ogg'), -5), 0.05, 0.5)
    n = len(y)
    low = thump(0.4, 110, 55, 0.12, 1.2)
    return mix(n, (y, 1.0, 0), (butter_lp(body, 2500), 0.6, 0), (low, 0.35, 0.03), (air(0.3, 1500, 6000, v + 5), 0.15, 0))


def s_swing_musou(v):
    x = sfx(['sword.2.ogg', 'sword.3.ogg', 'sword.10.ogg'][v])
    y = at_peak(pitch(butter_hp(x, 400), 2), 0.03, 0.3)
    body = at_peak(pitch(sfx('cloth4.ogg'), 5 + v), 0.03, 0.28)
    tri = fit(perc('triangle', 0.35), 0.35)
    return mix(len(y), (y, 1.0, 0), (butter_bp(body, 500, 4000), 0.4, 0), (butter_hp(tri, 3000), 0.08, 0.02),
               (air(0.22, 3000, 12000, v + 9), 0.15, 0))


def s_hit_light(v):
    punch = trim(sfx(f'impactPunch_medium_00{v}.ogg'))
    cut = at_peak(sfx(['knifeSlice.ogg', 'knifeSlice2.ogg', 'chop.ogg', 'knifeSlice.ogg'][v]), 0.005, 0.25)
    n = secs(0.36)
    return fade_end(room(mix(n, (punch, 1.0, 0), (butter_hp(cut, 1500), 0.45, 0), (thump(0.2, 170, 80, 0.06, 1.6), 0.35, 0)),
                         0.35, 0.1), 0.04)


def s_hit_heavy(v):
    punch = trim(sfx(f'impactPunch_heavy_00{v}.ogg'))
    crunch = trim(sfx(['bfh1_hit_08.ogg', 'bfh1_hit_06.ogg', 'bfh1_hit_01.ogg'][v]))
    n = secs(0.62)
    mid = trim(sfx(f'impactPunch_medium_00{v}.ogg'))
    cut = at_peak(sfx(['chop.ogg', 'knifeSlice2.ogg', 'chop.ogg'][v]), 0.005, 0.25)
    return fade_end(room(mix(n, (punch, 0.8, 0), (butter_hp(mid, 250), 0.7, 0), (butter_hp(crunch, 600), 0.75, 0.0),
                             (butter_hp(cut, 1200), 0.35, 0), (thump(0.45, 130, 48, 0.15, 2.0), 0.35, 0)), 0.6, 0.14), 0.06)


def s_hit_finisher(v):
    punch = trim(sfx(f'impactPunch_heavy_00{3 + v}.ogg'))
    boom = trim(sfx(['explosionCrunch_000.ogg', 'explosionCrunch_002.ogg'][v]))
    debris = trim(sfx(['bfh1_rock_breaking_03.ogg', 'bfh1_rock_falling_04.ogg'][v]))
    n = secs(1.2)
    crunch = trim(sfx(['bfh1_hit_08.ogg', 'bfh1_hit_01.ogg'][v]))
    return fade_end(room(mix(n, (punch, 0.8, 0), (boom, 0.6, 0.0), (butter_hp(crunch, 500), 0.8, 0), (butter_hp(debris, 800), 0.6, 0.02),
                             (thump(0.8, 110, 38, 0.28, 2.4), 0.4, 0)), 1.0, 0.18), 0.1)


def s_hit_prop(v):
    a = trim(sfx(f'impactWood_medium_00{v}.ogg'))
    b = trim(sfx(f'impactPlank_medium_00{v}.ogg'))
    return fade_end(mix(secs(0.4), (a, 1.0, 0), (butter_hp(b, 150), 0.5, 0)), 0.05)


def s_hit_lantern(v):
    a = trim(sfx(f'impactWood_light_00{v}.ogg'))
    paper = trim(sfx(['bookPlace1.ogg', 'bookPlace3.ogg'][v]))
    glass = trim(sfx(f'impactGlass_light_00{v}.ogg'))
    return fade_end(mix(secs(0.4), (a, 0.8, 0), (paper, 0.7, 0), (glass, 0.35, 0.005)), 0.05)


def s_guard(v):
    clash = trim(sfx(['sword_clash.2.ogg', 'sword_clash.3.ogg', 'sword_clash.5.ogg'][v]))
    clank = trim(sfx(f'impactMetal_heavy_00{v + 1}.ogg'))
    n = secs(1.0)
    return fade_end(room(mix(n, (clash, 1.0, 0), (clank, 0.6, 0), (thump(0.1, 220, 150, 0.025), 0.3, 0)), 0.7, 0.14), 0.1)


def s_guard_break(v):
    clash = trim(sfx(['sword_clash.1.ogg', 'sword_clash.6.ogg'][v]))
    shatter = trim(sfx(['bfh1_glass_breaking_01.ogg', 'bfh1_metal_falling_02.ogg'][v]))
    anvil = fit(perc('anvil', 0.9), 0.8)
    n = secs(1.3)
    return fade_end(room(mix(n, (clash, 1.0, 0), (anvil, 0.45, 0), (butter_hp(shatter, 1200), 0.5, 0.01),
                             (thump(0.6, 120, 45, 0.18, 2.0), 0.5, 0)), 1.0, 0.18), 0.12)


def _voice(name, semis, lp_=5000, dur=None):
    x = trim(sfx(name), -24)
    y = butter_lp(pitch(x, semis), lp_)
    return y if dur is None else fit(y, dur)


def s_oni(v):
    name, semis = [('troll_02.ogg', -3), ('monster_06.ogg', -3), ('hurt_05.ogg', -4), ('grunt_03.ogg', -2)][v]
    y = _voice(name, semis, 4500)
    return fade_end(room(pad(y, 0.15), 0.4, 0.1), 0.05)


def s_boss_roar(v):
    a = _voice('roar_02.ogg', -6, 4000)
    b = _voice('monster_04.ogg', -4, 3500)
    c = _voice('monster_07.ogg', -5, 3500)
    n = max(len(a), len(b), len(c)) + secs(0.2)
    rum = butter_lp(rng(3).standard_normal(n), 110) * np.sin(np.linspace(0, math.pi, n)) ** 1.5
    y = mix(n, (a, 1.0, 0), (b, 0.7, 0.08), (c, 0.55, 0.15), (rum, 0.4, 0))
    return fade_end(room(pad(y, 0.9), 1.6, 0.26, damp=3500, size=1.0), 0.2)


def s_boss_grunt(v):
    y = _voice(['monster_03.ogg', 'troll_01.ogg'][v], -6, 3500)
    return fade_end(room(pad(y, 0.3), 0.8, 0.18, damp=3500), 0.08)


def s_soul_burst(v):
    poof = trim(sfx(f'impactSoft_medium_00{v}.ogg'))
    sparkle = fit(lib.perc().hit('bell_tree', 0.6, pitch=[0, 2, -2][v]).mean(axis=1), 0.7, 0.3)
    shards = trim(sfx(['bfh1_glass_breaking_02.ogg', 'bfh1_glass_breaking_05.ogg', 'bfh1_glass_falling_01.ogg'][v]))
    n = secs(0.9)
    return fade_end(room(mix(n, (poof, 0.7, 0), (butter_hp(sparkle, 2500), 0.45, 0.02), (butter_hp(shards, 3000), 0.18, 0.01),
                             (air(0.5, 1500, 7000, v + 20, 0.4), 0.2, 0)), 0.9, 0.25, damp=7000), 0.1)


def s_launch(v):
    wh = at_peak(pitch(sfx(['cloth2.ogg', 'cloth4.ogg'][v]), 3), 0.06, 0.4)
    hit = trim(sfx(f'impactPunch_medium_00{v + 2}.ogg'))
    return fade_end(mix(secs(0.45), (hit, 0.6, 0), (wh, 0.9, 0)), 0.05)


def s_land(v):
    a = trim(sfx(f'impactSoft_heavy_00{v}.ogg'))
    dust = trim(sfx(f'footstep_grass_00{v}.ogg'))
    step = trim(sfx(f'footstep_concrete_00{v}.ogg'))
    return fade_end(mix(secs(0.45), (a, 0.7, 0), (butter_hp(step, 200), 0.8, 0), (butter_hp(dust, 400), 0.6, 0.0)), 0.06)


def s_jump(v):
    wh = at_peak(pitch(sfx(['cloth1.ogg', 'cloth2.ogg'][v]), 4), 0.05, 0.3)
    scuff = trim(sfx(f'footstep0{v}.ogg'))
    return fade_end(mix(secs(0.32), (scuff, 0.5, 0), (wh, 0.9, 0.0), (air(0.2, 2000, 8000, v + 30), 0.12, 0)), 0.05)


def s_plunge(v):
    a = trim(sfx('impactMining_000.ogg'))
    b = trim(sfx('bfh1_rock_breaking_01.ogg'))
    c = trim(sfx('lowFrequency_explosion_001.ogg'))
    d = trim(sfx('impactPlate_heavy_001.ogg'))
    n = secs(1.5)
    e = trim(sfx('bfh1_hit_01.ogg'))
    return fade_end(room(mix(n, (a, 0.8, 0), (c, 0.6, 0), (d, 0.5, 0), (butter_hp(b, 500), 0.8, 0.02), (butter_hp(e, 400), 0.7, 0),
                             (thump(1.0, 110, 36, 0.32, 2.6), 0.4, 0)), 1.2, 0.2, damp=4500), 0.15)


def _glock(notes, step=0.07, vel=0.75, ring=1.2):
    g = lib.glock()
    parts = [inst_note(g, m, 0.3, vel, ring=ring) for m in notes]
    n = max(len(p) for p in parts) + secs(step * len(notes)) + 10
    out = np.zeros(n)
    for i, p in enumerate(parts):
        a = secs(step * i)
        out[a:a + len(p)] += p
    return out


def s_pickup_charm(v):
    g = _glock([88, 95], 0.075, 0.7, 0.9)
    tri = fit(perc('triangle', 0.4), 0.8, 0.3)
    return fade_end(room(mix(secs(1.1), (g, 1.0, 0), (tri, 0.2, 0.0)), 1.0, 0.25, damp=8000), 0.12)


def s_pickup_lamp(v):
    g = _glock([81, 85, 88, 93], 0.065, 0.75, 1.2)
    h = chord_of(lib.harp(), [69, 73, 76, 81], 0.6, 0.6, strum=0.03, ring=1.0)
    bt = fit(perc('bell_tree', 0.5), 1.0, 0.3)
    return fade_end(room(mix(secs(1.6), (g, 0.8, 0), (h, 0.7, 0.0), (butter_hp(bt, 2500), 0.3, 0.05)), 1.4, 0.3, damp=8000), 0.15)


def s_pickup_crystal(v):
    gl = trim(sfx('glass_004.ogg'))
    g = _glock([93, 97, 100, 105], 0.045, 0.7, 1.0)
    ff = at_peak(pitch(sfx('forceField_002.ogg'), 7), 0.02, 0.8)
    return fade_end(room(mix(secs(1.3), (gl, 0.6, 0), (g, 0.9, 0.01), (butter_hp(ff, 400), 0.35, 0)), 1.2, 0.3, damp=9000), 0.15)


def s_musou_start(v):
    true = v == 1
    draw = trim(sfx('drawKnife1.ogg' if not true else 'drawKnife2.ogg'))
    drum = fit(perc('bass_drum2', 1.0), 2.0, 0.4)
    timp = fit(perc('timpani_lo', 0.9), 1.6, 0.4)
    ch = chord_of(lib.choir('aah'), [45, 57, 64, 69] if not true else [38, 50, 57, 65], 1.0 if not true else 1.4, 0.9)
    br = chord_of(lib.horns_stac(), [57, 64, 69] if not true else [50, 57, 62], 0.5, 1.0)
    tb = chord_of(lib.trombones_stac(), [45, 52] if not true else [38, 45], 0.5, 1.0)
    swell = fit(perc('cymbal_swell', 0.8), 1.6, 0.4)
    n = secs(2.6 if true else 2.1)
    layers = [(draw, 0.55, 0), (drum, 1.0, 0), (timp, 0.7, 0), (ch, 0.45, 0.0), (br, 0.6, 0), (tb, 0.5, 0), (swell, 0.35, 0.3)]
    if true:
        layers += [(fit(perc('gong', 0.7), 2.4, 0.5), 0.45, 0), (chord_of(lib.choir('ooh'), [26 + 12, 38, 45], 1.6, 0.9), 0.35, 0.05)]
    return fade_end(room(mix(n, *layers), 1.6, 0.22, damp=6000, size=1.1), 0.3)


def s_musou_finish(v):
    true = v == 1
    a = trim(sfx('lowFrequency_explosion_000.ogg'))
    b = trim(sfx('explosionCrunch_001.ogg' if not true else 'explosionCrunch_003.ogg'))
    drum = fit(perc('bass_drum2', 1.0), 2.5, 0.5)
    crash = fit(perc('crash', 1.0), 2.8, 0.8)
    gong = fit(perc('gong', 1.0), 3.0, 0.8)
    debris = trim(sfx('bfh1_rock_breaking_02.ogg'))
    n = secs(3.4 if true else 2.8)
    layers = [(a, 1.0, 0), (b, 0.75, 0.0), (drum, 0.9, 0), (crash, 0.45, 0.0), (gong, 0.35, 0.02), (butter_hp(debris, 600), 0.35, 0.05),
              (thump(1.6, 95, 34, 0.6, 3.0), 0.5, 0)]
    if true:
        layers += [(fit(perc('bass_drum2', 1.0), 2.0, 0.5), 0.8, 0.14), (chord_of(lib.choir('aah'), [38, 50, 57, 65], 1.4, 1.0), 0.35, 0.05)]
    return fade_end(room(mix(n, *layers), 2.0, 0.22, damp=5000, size=1.2), 0.35)


def s_officer_down(v):
    drum = fit(perc('bass_drum2', 1.0), 2.2, 0.5)
    gong = fit(perc('gong', 1.0), 2.4, 0.6)
    br = chord_of(lib.horns(), [57, 60, 64], 0.6, 0.95)
    tb = chord_of(lib.trombones(), [45, 52], 0.6, 0.95)
    crash = fit(perc('crash', 0.9), 2.2, 0.6)
    n = secs(2.4)
    return fade_end(room(mix(n, (drum, 1.0, 0), (gong, 0.5, 0), (br, 0.55, 0), (tb, 0.45, 0), (crash, 0.35, 0)), 1.6, 0.2, damp=5000,
                         size=1.1), 0.25)


def s_officer_appear(v):
    drum = fit(perc('bass_drum', 1.0), 1.2, 0.3)
    timp = fit(perc('timpani_hi', 0.9), 1.2, 0.3)
    draw = trim(sfx('drawKnife2.ogg'))
    shout = _voice('troll_02.ogg', -4, 4000)
    return fade_end(room(mix(secs(1.4), (drum, 1.0, 0), (timp, 0.6, 0), (draw, 0.4, 0.05), (shout, 0.6, 0.12)), 1.0, 0.2), 0.15)


def s_gate_open(v):
    g = _glock([100, 98, 96, 93, 91, 88, 86, 84], 0.055, 0.7, 1.2)
    ff = at_peak(sfx('forceField_000.ogg'), 0.05, 1.0)
    swell = fit(perc('cymbal_swell', 0.6), 1.2, 0.5)
    tub = inst_note(lib.tubular(), 69, 0.5, 0.7, ring=2.0)
    n = secs(2.4)
    return fade_end(room(mix(n, (g, 0.7, 0.05), (butter_hp(ff, 300), 0.55, 0), (swell, 0.3, 0), (tub, 0.4, 0.4)), 1.8, 0.3, damp=7000,
                         size=1.1), 0.25)


def s_gate_close(v):
    a = trim(sfx('impactMetal_000.ogg'))
    ff = at_peak(pitch(sfx('forceField_003.ogg'), -5), 0.02, 0.9)
    door = trim(sfx('doorClose_4.ogg'))
    clank = trim(sfx('metalPot1.ogg'))
    return fade_end(room(mix(secs(1.3), (a, 0.8, 0), (ff, 0.5, 0), (door, 0.7, 0), (butter_hp(clank, 300), 0.35, 0)), 1.0, 0.2), 0.15)


def s_lantern_break(v):
    glass = trim(sfx(['bfh1_glass_breaking_01.ogg', 'bfh1_glass_breaking_04.ogg'][v]))
    wood = trim(sfx(['bfh1_wood_breaking_03.ogg', 'bfh1_wood_breaking_01.ogg'][v]))
    paper = trim(sfx('bookFlip3.ogg'))
    fire = at_peak(sfx('thrusterFire_003.ogg'), 0.02, 0.7)
    n = secs(1.2)
    return fade_end(room(mix(n, (glass, 0.8, 0), (wood, 0.8, 0), (paper, 0.4, 0.02), (butter_lp(fire, 3000), 0.4, 0),
                             (thump(0.35, 140, 60, 0.1, 1.8), 0.4, 0)), 0.9, 0.18), 0.12)


def s_lamp_hit(v):
    bell = trim(sfx(['impactBell_heavy_004.ogg', 'impactBell_heavy_003.ogg'][v]))
    clank = trim(sfx(f'impactMetal_medium_00{v}.ogg'))
    return fade_end(room(mix(secs(0.8), (bell, 1.0, 0), (clank, 0.4, 0)), 0.6, 0.15), 0.1)


def s_lamp_break(v):
    bell = trim(sfx('impactBell_heavy_000.ogg'))
    glass = trim(sfx('bfh1_glass_breaking_06.ogg'))
    tub = pitch(inst_note(lib.tubular(), 62, 0.4, 0.8, ring=2.5), -1.0)
    rock = trim(sfx('bfh1_rock_falling_01.ogg'))
    n = secs(2.2)
    return fade_end(room(mix(n, (bell, 1.0, 0), (glass, 0.7, 0.01), (tub, 0.4, 0), (butter_hp(rock, 400), 0.35, 0.1),
                             (thump(0.7, 110, 45, 0.2, 2.0), 0.4, 0)), 1.3, 0.22), 0.2)


def s_lamp_secured(v):
    tub = chord_of(lib.tubular(), [69, 73, 76], 0.5, 0.7, strum=0.07, ring=2.2)
    g = _glock([81, 85, 88, 93], 0.07, 0.6, 1.4)
    ch = chord_of(lib.choir('aah'), [57, 64, 69, 73], 1.1, 0.6)
    n = secs(2.2)
    return fade_end(room(mix(n, (tub, 0.8, 0), (g, 0.5, 0.05), (ch, 0.35, 0.05)), 1.6, 0.25, damp=8000), 0.25)


def s_ui_click(v):
    return fade_end(trim(sfx(['select_002.ogg', 'click_001.ogg'][v])), 0.01)


def s_hurt(v):
    punch = trim(sfx(f'impactPunch_medium_00{v + 3}.ogg'))
    cloth = trim(sfx(['cloth2.ogg', 'cloth4.ogg'][v]))
    slap = trim(sfx(f'impactGeneric_light_00{v}.ogg'))
    return fade_end(room(mix(secs(0.45), (punch, 0.9, 0), (butter_hp(slap, 400), 0.6, 0), (butter_hp(cloth, 300), 0.6, 0),
                             (thump(0.25, 160, 70, 0.07, 1.8), 0.3, 0)), 0.4, 0.1), 0.06)


def s_dodge(v):
    wh = at_peak(pitch(sfx(['cloth3.ogg', 'cloth1.ogg'][v]), 2), 0.05, 0.32)
    scuff = fit(trim(sfx(f'footstep0{v + 4}.ogg')), 0.12, 0.04)
    return fade_end(mix(secs(0.35), (scuff, 0.5, 0), (wh, 1.0, 0), (air(0.25, 1500, 6000, v + 40), 0.12, 0)), 0.05)


def s_sidestep(v):
    return fade_end(at_peak(pitch(sfx('cloth4.ogg'), 3), 0.04, 0.24), 0.05)


def s_boss_slam(v):
    a = trim(sfx('impactMining_003.ogg'))
    b = trim(sfx('bfh1_rock_breaking_02.ogg'))
    c = trim(sfx('lowFrequency_explosion_001.ogg'))
    drum = fit(perc('bass_drum2', 1.0), 1.8, 0.4)
    n = secs(1.9)
    e = trim(sfx('bfh1_rock_breaking_01.ogg'))
    return fade_end(room(mix(n, (a, 0.8, 0), (c, 0.6, 0), (drum, 0.7, 0), (butter_hp(b, 500), 0.85, 0.02), (butter_hp(e, 400), 0.6, 0.04),
                             (thump(1.2, 90, 30, 0.45, 2.8), 0.35, 0)), 1.4, 0.22, damp=3500, size=1.1), 0.2)


def s_boss_sweep(v):
    wh = at_peak(pitch(butter_hp(sfx('sword.9.ogg'), 150), -8), 0.06, 0.7)
    cl = at_peak(pitch(sfx('cloth1.ogg'), -6), 0.06, 0.7)
    return fade_end(room(mix(secs(0.8), (wh, 1.0, 0), (butter_lp(cl, 2000), 0.6, 0), (thump(0.6, 70, 40, 0.25, 1.4), 0.3, 0.05)),
                         0.8, 0.18), 0.08)


def s_boss_jump(v):
    wh = at_peak(pitch(sfx('cloth2.ogg'), -4), 0.05, 0.7)
    hit = trim(sfx('impactPunch_heavy_004.ogg'))
    return fade_end(room(mix(secs(0.8), (hit, 0.6, 0), (wh, 1.0, 0.02)), 0.8, 0.18), 0.08)


def s_boss_intro(v):
    d1 = fit(perc('bass_drum2', 1.0), 2.5, 0.5)
    d2 = fit(perc('bass_drum2', 0.95), 2.5, 0.5)
    gong = fit(perc('gong', 1.0), 3.0, 0.8)
    ch = chord_of(lib.choir('ooh'), [36, 48, 55, 61], 2.2, 0.9)
    br = chord_of(lib.trombones(), [36, 43, 49], 2.0, 0.85) + 0
    tuba = inst_note(lib.tuba(), 24 + 12, 2.0, 0.9)
    n = secs(3.2)
    return fade_end(room(mix(n, (d1, 1.0, 0), (d2, 0.9, 0.43), (gong, 0.45, 0), (ch, 0.45, 0.1), (br, 0.5, 0.43), (tuba, 0.4, 0.43)),
                         2.0, 0.22, damp=4000, size=1.2), 0.3)


def s_telegraph(v):
    tri = fit(perc('triangle', 0.5), 0.35, 0.15)
    click = fit(trim(sfx(['metalClick.ogg', 'metalLatch.ogg'][v])), 0.12, 0.04)
    return fade_end(mix(secs(0.35), (butter_hp(tri, 2000), 0.6, 0.0), (butter_hp(click, 1500), 0.5, 0)), 0.06)


def s_summon(v):
    x = perc('cymbal_swell', 0.7)
    k = int(np.argmax(env_of(x, 0.05)))
    swell = fade_end(x[max(0, k - secs(1.0)):k + secs(0.05)], 0.05)
    ch = chord_of(lib.choir('ooh'), [36, 43, 49, 55], 1.1, 0.8)
    ff = at_peak(pitch(sfx('forceField_001.ogg'), -3), 0.3, 0.9)
    n = secs(1.5)
    return fade_end(room(mix(n, (swell, 0.5, 0), (ch, 0.5, 0.1), (butter_hp(ff, 200), 0.4, 0.2)), 1.2, 0.25), 0.15)


def s_break_wood(v):
    a = trim(sfx(['bfh1_wood_breaking_01.ogg', 'bfh1_wood_breaking_03.ogg'][v]))
    b = trim(sfx(f'impactWood_heavy_00{v}.ogg'))
    c = trim(sfx(f'impactPlank_medium_00{v + 2}.ogg'))
    return fade_end(room(mix(secs(0.8), (a, 1.0, 0), (b, 0.8, 0), (c, 0.4, 0.01)), 0.6, 0.15), 0.08)


def s_break_jar(v):
    a = trim(sfx(['bfh1_breaking_02.ogg', 'bfh1_breaking_03.ogg'][v]))
    b = trim(sfx(f'impactGlass_heavy_00{v}.ogg'))
    return fade_end(room(mix(secs(0.9), (a, 1.0, 0), (b, 0.6, 0)), 0.6, 0.15), 0.08)


def s_drop(v):
    a = trim(sfx(['glass_002.ogg', 'glass_003.ogg'][v]))
    return fade_end(mix(secs(0.3), (a, 1.0, 0)), 0.05)


def s_heal(v):
    g = _glock([81, 88, 93, 100], 0.09, 0.55, 1.0)
    bt = fit(perc('bell_tree', 0.5), 1.0, 0.3)
    return fade_end(room(mix(secs(1.2), (g, 0.8, 0.05), (butter_hp(bt, 2500), 0.4, 0)), 1.0, 0.3, damp=8000), 0.15)


# id -> (design fn, variants, target momentary-max loudness LUFS, peak dBFS)
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
    lib.reset_round_robins()
    out = {}
    for sid, (fn, nv, target, peak) in DESIGNS.items():
        if only and sid not in only:
            continue
        vs = []
        for v in range(nv):
            x = np.asarray(fn(v), dtype=float)
            x = butter_hp(x, 35)
            thr = np.max(np.abs(x)) * db(-60)
            nz = np.where(np.abs(x) > thr)[0]
            x = x[max(0, nz[0] - 16): nz[-1] + 1]
            x = fade_end(x, 0.02)
            x = x * db(target - momentary_max(x))
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
    marker = np.sin(TAU * 2000 * np.arange(mk) / SR) * np.hanning(mk) * 0.9
    at = secs(MARKER_AT)
    gap = secs(GAP)
    parts = [np.zeros(at), marker, np.zeros(gap)]
    pos = at + mk + gap
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
