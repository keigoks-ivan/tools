"""Recorded instruments used by music.py (all CC0 / MIT, see game/assets/audio/march/CREDITS.md).

Octave conventions differ between packs (verified by pitch detection on short articulations):
VSCO sections / brass and VCSL (C3 = middle C: Dan Tranh, glockenspiel, chimes) name notes one octave low (+12); VSCO solo violin and harp use
scientific pitch (0).
"""
import functools

import numpy as np
from scipy import signal

import samplelib as L
from sampler import Instrument, Percussion, Zone, perc_group, zones_from

SR = 44100
NOTE = r'(?P<n>[A-Ga-g][#b]?-?\d)'


@functools.lru_cache(None)
def dantranh():
    """Vietnamese 16-string zither (đàn tranh) — stands in for the gayageum (same zither family)."""
    z = zones_from('vcsl/Chordophones/Zithers/Dan Tranh/Normal/*.wav', rf'^{NOTE}_(?P<v>mf|f|ff)_', 12,
                   layer_map={'mf': 0, 'f': 1, 'ff': 2})
    return Instrument('dantranh', z, ring=2.2, release=0.3, vel_curve=0.35, lag_cap=0.02)


@functools.lru_cache(None)
def dantranh_vib():
    """Đàn tranh with left-hand vibrato (the 농현 gesture)."""
    z = zones_from('vcsl/Chordophones/Zithers/Dan Tranh/Vibrato/*.wav', rf'^{NOTE}_vib_(?P<v>mf|ff)_', 12,
                   layer_map={'mf': 0, 'ff': 1})
    return Instrument('dantranh_vib', z, ring=3.0, release=0.4, vel_curve=0.35, lag_cap=0.02)


@functools.lru_cache(None)
def dantranh_trem():
    z = zones_from('vcsl/Chordophones/Zithers/Dan Tranh/Tremolo/*.wav', rf'^{NOTE}_Trem_', 12)
    return Instrument('dantranh_trem', z, sustain=True, release=0.35, vel_curve=0.3, lag_cap=0.02)


@functools.lru_cache(None)
def harp():
    z = zones_from('vsco/Strings/Harp/*.wav', rf'_{NOTE}_', 0)
    return Instrument('harp', z, ring=2.5, release=0.3, vel_curve=0.4, lag_cap=0.02)


@functools.lru_cache(None)
def solo_violin():
    z = zones_from('vsco/Strings/Solo Violin/Arco Vib/*.wav', rf'_{NOTE}_(?P<v>p|f)\.', 0, layer_map={'p': 0, 'f': 1})
    return Instrument('solo_violin', z, sustain=True, release=0.22, vel_curve=0.45, lag_cap=0.12)


@functools.lru_cache(None)
def violins():
    z = zones_from('vsco/Strings/Violin Section/susVib/*.wav', rf'_{NOTE}_v(?P<v>\d)', 12)
    return Instrument('violins', z, sustain=True, release=0.45, vel_curve=0.4, lag_cap=0.25)


@functools.lru_cache(None)
def violas():
    z = zones_from('vsco/Strings/Viola Section/susvib/*.wav', rf'_{NOTE}_v(?P<v>\d)_', 12)
    return Instrument('violas', z, sustain=True, release=0.45, vel_curve=0.4, lag_cap=0.25)


@functools.lru_cache(None)
def celli():
    z = zones_from('vsco/Strings/Cello Section/susvib/*.wav', rf'_{NOTE}_v(?P<v>\d)_', 12)
    return Instrument('celli', z, sustain=True, release=0.45, vel_curve=0.4, lag_cap=0.2)


@functools.lru_cache(None)
def violins_spic():
    z = zones_from('vsco/Strings/Violin Section/Spic/*.wav', rf'_{NOTE}_v(?P<v>\d)_rr', 12, rr_re=r'_rr(\d)')
    return Instrument('violins_spic', z, ring=0.5, release=0.12, vel_curve=0.4, lag_cap=0.08)


@functools.lru_cache(None)
def celli_spic():
    z = zones_from('vsco/Strings/Cello Section/spic/*.wav', rf'_{NOTE}_v(?P<v>\d)_RR', 12, rr_re=r'_RR(\d)')
    return Instrument('celli_spic', z, ring=0.5, release=0.12, vel_curve=0.4, lag_cap=0.06)


@functools.lru_cache(None)
def violins_pizz():
    z = zones_from('vsco/Strings/Violin Section/Pizz/*.wav', rf'_{NOTE}_v(?P<v>\d)_rr', 12, rr_re=r'_rr(\d)')
    return Instrument('violins_pizz', z, ring=0.8, release=0.15, vel_curve=0.4, lag_cap=0.03)


@functools.lru_cache(None)
def bass_pizz():
    z = zones_from('vsco/Strings/Solo Contrabass/Pizz/*.wav', rf'_{NOTE}_v(?P<v>\d)_rr', 12, rr_re=r'_rr(\d)')
    return Instrument('bass_pizz', z, ring=1.2, release=0.2, vel_curve=0.4, lag_cap=0.03)


@functools.lru_cache(None)
def bass_sus():
    z = zones_from('vsco/Strings/Solo Contrabass/SusNV/*.wav', rf'_{NOTE}_v(?P<v>\d)_rr', 12)
    return Instrument('bass_sus', z, sustain=True, release=0.35, vel_curve=0.4, lag_cap=0.12)


@functools.lru_cache(None)
def bass_spic():
    z = zones_from('vsco/Strings/Solo Contrabass/Spic/*.wav', rf'_{NOTE}_v(?P<v>\d)_rr', 12, rr_re=r'_rr(\d)')
    return Instrument('bass_spic', z, ring=0.5, release=0.12, vel_curve=0.4, lag_cap=0.06)


@functools.lru_cache(None)
def horns():
    z = zones_from('vsco/Brass/F Horn/sus/*.wav', rf'_sus_{NOTE}_v(?P<v>\d)_', 12)
    return Instrument('horns', z, sustain=True, release=0.3, vel_curve=0.45, lag_cap=0.1)


@functools.lru_cache(None)
def horns_stac():
    z = zones_from('vsco/Brass/F Horn/stac/*.wav', rf'_stac_{NOTE}_v(?P<v>\d)_rr', 12, rr_re=r'_rr(\d)')
    return Instrument('horns_stac', z, ring=0.9, release=0.2, vel_curve=0.45, lag_cap=0.06)


@functools.lru_cache(None)
def trombones():
    z = zones_from('vsco/Brass/Tenor Trombone/sus/*.wav', rf'_sus_{NOTE}_v(?P<v>\d)_', 12)
    return Instrument('trombones', z, sustain=True, release=0.3, vel_curve=0.45, lag_cap=0.08)


@functools.lru_cache(None)
def trombones_stac():
    z = zones_from('vsco/Brass/Tenor Trombone/stac/*.wav', rf'_stac_{NOTE}_v(?P<v>\d)', 12, rr_re=r'_rr(\d)')
    return Instrument('trombones_stac', z, ring=0.9, release=0.2, vel_curve=0.45, lag_cap=0.05)


@functools.lru_cache(None)
def trumpets():
    z = zones_from('vsco/Brass/Trumpet/sus/*.wav', rf'_sus_{NOTE}_v(?P<v>\d)_', 12)
    return Instrument('trumpets', z, sustain=True, release=0.25, vel_curve=0.45, lag_cap=0.06)


@functools.lru_cache(None)
def trumpets_stac():
    z = zones_from('vsco/Brass/Trumpet/stac/*.wav', rf'_stac_{NOTE}_v(?P<v>\d)', 12, rr_re=r'_rr(\d)')
    return Instrument('trumpets_stac', z, ring=0.8, release=0.2, vel_curve=0.45, lag_cap=0.05)


@functools.lru_cache(None)
def tuba():
    z = zones_from('vsco/Brass/Tuba/sus/*_Mid.wav', rf'_sus_{NOTE}_v(?P<v>\d)_', 12)
    return Instrument('tuba', z, sustain=True, release=0.3, vel_curve=0.45, lag_cap=0.08)


@functools.lru_cache(None)
def tuba_stac():
    z = zones_from('vsco/Brass/Tuba/stac/*.wav', rf'_stac_{NOTE}_v(?P<v>\d)', 12, rr_re=r'_rr(\d)')
    return Instrument('tuba_stac', z, ring=0.9, release=0.2, vel_curve=0.45, lag_cap=0.05)


# ---------------------------------------------------------------- choir (MuseScore General SF3)

@functools.lru_cache(None)
def _sf():
    return L.read_sf(L.find('choir/*.sf3')[0])


def _sf_zone(sf, z):
    def load():
        x, rate, loop = L.sf_sample(sf, z['sample'])
        if rate != SR:
            g = np.gcd(int(rate), SR)
            x = signal.resample_poly(x, SR // g, rate // g).astype(np.float32)
        return np.ascontiguousarray(np.stack([x, x], 1))
    sh = z['sh']
    ls, le = sh['loop_start'], sh['loop_end']
    if not L.raw_is_sf3(sf):
        ls, le = ls - sh['start'], le - sh['start']
    scale = SR / sh['rate']
    loop = (int(ls * scale), int(le * scale)) if z['mode'] in (1, 3) and le > ls else None
    root = z['root'] - z['tune'] / 100.0
    zone = Zone(None, root, 0, 0, loader=load, loop=loop)
    zone.layer = z['vlo']
    return zone


@functools.lru_cache(None)
def choir(kind='aah'):
    sf = _sf()
    name = 'Ahh Choir' if kind == 'aah' else 'Ohh Voices'
    zs = []
    seen = set()
    for z in L.sf_instrument_zones(sf, name):
        key = (z['sample'], z['vlo'])
        if key in seen:
            continue
        seen.add(key)
        zs.append(_sf_zone(sf, z))
    uniq = sorted({z.layer for z in zs})
    for z in zs:
        z.layer = uniq.index(z.layer)
    return Instrument('choir_' + kind, zs, sustain=True, release=0.6, vel_curve=0.35, attack=0.12, lag_cap=0.18)


# ---------------------------------------------------------------- percussion

@functools.lru_cache(None)
def perc():
    V = 'vsco/Percussion/'
    C = 'vcsl/Idiophones/Struck Idiophones/'
    M = 'vcsl/Membranophones/Struck Membranophones/'
    g = {
        # big drums: buk / taiko stand-ins
        'bass_drum': perc_group(V + 'BDrumNewhit_v*_rr*_Sum.wav', r'_v(\d)_'),
        'bass_drum2': perc_group(M + 'Bass Drum 2/bassdrum_hit_*.wav', r'_hit_([a-z]+)', ['pp', 'mp', 'mf', 'f', 'ff']),
        'timpani_lo': perc_group([V + 'Timpani/Timpani1_Hit_*.wav', V + 'Timpani/Timpani2_Hit_*.wav'], r'_v(\d)_'),
        'timpani_hi': perc_group([V + 'Timpani/Timpani4_Hit_*.wav', V + 'Timpani/Timpani5_Hit_*.wav'], r'_v(\d)_'),
        # janggu stand-ins: large frame drum (hand, gungpyeon) / small frame drum stick hits (chaepyeon)
        'frame_lo': perc_group(M + 'Frame Drum/HDrumL_Hit_v*_rr*_Sum.wav', r'_v(\d)_'),
        'frame_lo_muted': perc_group(M + 'Frame Drum/HDrumL_HitMuted_v*_Sum.wav', r'_v(\d)_'),
        'frame_hi': perc_group(M + 'Frame Drum/HDrumS_Hit_v*_rr*_Sum.wav', r'_v(\d)_'),
        'frame_hi_muted': perc_group(M + 'Frame Drum/HDrumS_HitMuted_v*_Sum.wav', r'_v(\d)_'),
        'darbuka': perc_group(M + 'Darbuka/Darbuka_[345]_hit_vl*_rr*.wav', r'_vl(\d)_'),
        'log_hi': perc_group(V + 'LogDrumHi_MedM_v*_rr*_Sum.wav', r'_v(\d)_'),
        'log_lo': perc_group(V + 'LogDrumLo_MedM_v*_rr*_Sum.wav', r'_v(\d)_'),
        'tom_hi': perc_group(M + 'Tom 1/Mallet/*.wav'),
        'tom_lo': perc_group(M + 'Tom 2/Mallet/*.wav'),
        'woodblock': perc_group(C + 'Woodblock/wood_click_*.wav'),
        'claves': perc_group(V + 'Claves1_Hit_v*_rr*_Sum.wav', r'_v(\d)_'),
        # kit
        'snare': perc_group(M + 'Snare Drum, Modern 1/Snare2_HitSN_v*_rr*_Mid.wav', r'_v(\d)_'),
        'snare_roll': perc_group(V + 'Snare2-rollSN_v*_rr1_Sum.wav', r'_v(\d)_'),
        'clap': perc_group(C + 'Claps/Clap_rr*.wav'),
        'hat': perc_group(C + 'Hi-Hat Cymbal/HiHat_HitC_v*_rr*_Mid.wav', r'_v(\d)_'),
        'hat_open': perc_group(C + 'Hi-Hat Cymbal/HiHat_HitO_rr*_Mid.wav'),
        'shaker': perc_group([C + 'Shaker, Small/*.wav']),
        'tamb': perc_group(V + 'Tamb1-Hit_v*_rr*_Sum.wav', r'_v(\d)_'),
        'crash': perc_group(V + 'cymbal-crash1_*_rr*.wav', r'crash1_([a-z]+)_', ['pp', 'mp', 'mf', 'ff']),
        'sus_cymbal': perc_group(V + 'susCymb1-hit_*_rr*.wav', r'hit_([a-z]+)_', ['pp', 'mp', 'f', 'fff']),
        'cymbal_swell': perc_group([V + 'susCymb1-cresc-Short_v1.wav', V + 'susCymb1-cresc-Median_v1.wav']),
        'cymbal_swell_long': perc_group(V + 'susCymb1-cresc-Long_v1.wav'),
        'gong': perc_group(V + 'gongHit_*.wav', r'gongHit_([a-z]+)', ['p', 'mf', 'f', 'fff']),
        'triangle': perc_group(V + 'Triangle3-Hit_v*_rr*_Sum.wav', r'_v(\d)_'),
        'bell_tree': perc_group(V + 'BellTree_Stroke*_v1_Sum.wav'),
        'anvil': perc_group(V + 'Anvil_Hit1_v*_Sum.wav', r'_v(\d)_'),
    }
    return Percussion(g)


@functools.lru_cache(None)
def glock():
    z = zones_from('vcsl/Idiophones/Struck Idiophones/Glockenspiel/*.wav', rf'_{NOTE}_', 12)
    return Instrument('glock', z, ring=3.5, release=0.3, vel_curve=0.4) if z else None


@functools.lru_cache(None)
def tubular():
    z = zones_from('vcsl/Idiophones/Struck Idiophones/Tubular Bells 1/*.wav', rf'_{NOTE}_', 12)
    return Instrument('tubular', z, ring=5.0, release=0.4, vel_curve=0.4) if z else None


def reset_round_robins():
    """Round-robin / velocity-layer counters live on the cached instruments; reset them so every cue and the
    SFX sprite render identically no matter what was rendered before (reproducible builds)."""
    fns = [dantranh, dantranh_vib, dantranh_trem, harp, solo_violin, violins, violas, celli, violins_spic, celli_spic,
           violins_pizz, bass_pizz, bass_sus, bass_spic, horns, horns_stac, trombones, trombones_stac, trumpets, trumpets_stac,
           tuba, tuba_stac, glock, tubular]
    for fn in fns:
        if fn.cache_info().currsize:
            inst = fn()
            if inst is not None:
                inst.rr_counter.clear()
    if choir.cache_info().currsize:
        for kind in ('aah', 'ooh'):
            choir(kind).rr_counter.clear()
    if perc.cache_info().currsize:
        perc().rr.clear()
