"""Recorded-sample access for the march audio build.

The raw sample packs are NOT in the repo (they are large and only their processed results ship).
Download them separately and point MARCH_SAMPLES (or --samples) at a folder laid out like:

  <samples>/vsco/   VSCO 2 Community Edition (CC0)  github.com/sgossner/VSCO-2-CE
  <samples>/vcsl/   Versilian Community Sample Library (CC0)  github.com/sgossner/VCSL
  <samples>/choir/MuseScore_General.sf3   (MIT)  MuseScore General SoundFont
  <samples>/sfx/    Kenney impact / rpg / interface / sci-fi packs (CC0), OpenGameArt CC0 packs:
                    sword_-_starninjas_1, sword_clash_-_starninjas_0, sfx_breaking_and_falling, 80-CC0-creature-SFX_0

Decoding uses libsndfile through ctypes (Homebrew: brew install libsndfile) for WAV / OGG / FLAC / MP3,
so no extra Python packages are needed. Decoded audio is cached as .npy under MARCH_AUDIO_CACHE
(default: the system temp dir) because VCSL/VSCO files are 24-bit / multi-channel and slow to read.
"""
import ctypes
import ctypes.util
import glob
import hashlib
import os
import re
import struct
import tempfile

import numpy as np
from scipy import signal

SR = 44100
CACHE = os.environ.get('MARCH_AUDIO_CACHE') or os.path.join(tempfile.gettempdir(), 'march-audio-cache')


def samples_root():
    root = os.environ.get('MARCH_SAMPLES')
    if not root or not os.path.isdir(root):
        raise SystemExit('Set MARCH_SAMPLES (or pass --samples) to the downloaded sample folder; see samplelib.py.')
    return root


# ------------------------------------------------------------------ libsndfile via ctypes

class _Info(ctypes.Structure):
    _fields_ = [('frames', ctypes.c_int64), ('samplerate', ctypes.c_int), ('channels', ctypes.c_int),
                ('format', ctypes.c_int), ('sections', ctypes.c_int), ('seekable', ctypes.c_int)]


_LIB = None


def _lib():
    global _LIB
    if _LIB is None:
        cands = [ctypes.util.find_library('sndfile'), '/opt/homebrew/lib/libsndfile.dylib', '/usr/local/lib/libsndfile.dylib',
                 'libsndfile.so.1']
        for c in cands:
            if not c:
                continue
            try:
                _LIB = ctypes.CDLL(c)
                break
            except OSError:
                continue
        if _LIB is None:
            raise SystemExit('libsndfile not found (brew install libsndfile)')
        _LIB.sf_open.restype = ctypes.c_void_p
        _LIB.sf_open.argtypes = [ctypes.c_char_p, ctypes.c_int, ctypes.POINTER(_Info)]
        _LIB.sf_readf_float.restype = ctypes.c_int64
        _LIB.sf_readf_float.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), ctypes.c_int64]
        _LIB.sf_close.argtypes = [ctypes.c_void_p]
        _LIB.sf_strerror.restype = ctypes.c_char_p
        _LIB.sf_strerror.argtypes = [ctypes.c_void_p]
    return _LIB


def _sf_read(path):
    lib = _lib()
    info = _Info()
    h = lib.sf_open(path.encode(), 0x10, ctypes.byref(info))
    if not h:
        raise IOError(f'libsndfile cannot open {path}: {lib.sf_strerror(None).decode()}')
    try:
        n = info.frames if info.frames > 0 else 1 << 26
        buf = np.zeros(n * info.channels, dtype=np.float32)
        got = lib.sf_readf_float(h, buf.ctypes.data_as(ctypes.POINTER(ctypes.c_float)), n)
    finally:
        lib.sf_close(h)
    return buf[: got * info.channels].reshape(-1, info.channels), info.samplerate


def read(path, mono=False, sr=SR):
    """Decoded float32 (frames, channels) at `sr`, cached."""
    st = os.stat(path)
    key = hashlib.sha1(f'{path}|{st.st_size}|{st.st_mtime}|{mono}|{sr}'.encode()).hexdigest()[:20]
    os.makedirs(CACHE, exist_ok=True)
    cp = os.path.join(CACHE, key + '.npy')
    if os.path.exists(cp):
        return np.load(cp)
    x, fs = _sf_read(path)
    if x.shape[1] > 2:
        x = x[:, :2]
    if fs != sr:
        g = np.gcd(int(fs), int(sr))
        x = signal.resample_poly(x, sr // g, fs // g, axis=0).astype(np.float32)
    if mono:
        x = x.mean(axis=1, keepdims=True)
    elif x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    x = np.ascontiguousarray(x, dtype=np.float32)
    np.save(cp, x)
    return x


def find(pattern):
    return sorted(glob.glob(os.path.join(samples_root(), pattern), recursive=True))


# ------------------------------------------------------------------ note names / pitch

_NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def note_to_midi(name):
    m = re.match(r'^([A-Ga-g])([#b]?)(-?\d)$', name)
    if not m:
        return None
    n = _NOTE[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + n


def detect_pitch(x, sr=SR, fmin=30.0, fmax=2500.0):
    """YIN-style fundamental estimate on the steady part of a sample (Hz, or None)."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    n = len(m)
    if n < sr * 0.15:
        seg = m
    else:
        a = int(min(n * 0.25, sr * 0.3))
        seg = m[a:a + int(sr * 0.5)]
    seg = seg - seg.mean()
    if np.max(np.abs(seg)) < 1e-5:
        return None
    W = len(seg) // 2
    tau_max = min(int(sr / fmin), W - 1)
    tau_min = int(sr / fmax)
    # difference function via FFT autocorrelation
    x2 = np.concatenate([seg, np.zeros(len(seg))])
    F = np.fft.rfft(x2)
    ac = np.fft.irfft(F * np.conj(F))[: tau_max + 1]
    cs = np.concatenate([[0], np.cumsum(seg ** 2)])
    e0 = cs[W]
    d = np.array([e0 + (cs[t + W] - cs[t]) - 2 * ac[t] for t in range(tau_max + 1)])
    cmnd = np.ones_like(d)
    run = np.cumsum(d[1:])
    cmnd[1:] = d[1:] * np.arange(1, tau_max + 1) / np.maximum(run, 1e-12)
    cand = np.where(cmnd[tau_min:] < 0.15)[0]
    if len(cand):
        t = cand[0] + tau_min
        while t + 1 <= tau_max and cmnd[t + 1] < cmnd[t]:
            t += 1
    else:
        t = int(np.argmin(cmnd[tau_min:]) + tau_min)
        if cmnd[t] > 0.4:
            return None
    if 1 <= t < tau_max:
        a, b, c = cmnd[t - 1], cmnd[t], cmnd[t + 1]
        den = a - 2 * b + c
        t = t + 0.5 * (a - c) / den if den != 0 else t
    return sr / t


def hz_to_midi(f):
    return 69 + 12 * np.log2(f / 440.0)


def octave_offset(files_with_names, sr=SR):
    """Most common (detected - named) octave shift for a set of (path, named_midi)."""
    shifts = []
    for p, m in files_with_names:
        x = read(p)
        f = detect_pitch(x, sr)
        if f is None:
            continue
        d = hz_to_midi(f) - m
        shifts.append(int(round(d / 12)) * 12)
    if not shifts:
        return 0
    vals, counts = np.unique(shifts, return_counts=True)
    return int(vals[np.argmax(counts)])


# ------------------------------------------------------------------ SF2 / SF3 (MuseScore General) reader

def _chunks(data, off, end):
    while off + 8 <= end:
        cid = data[off:off + 4].decode('latin1')
        size = struct.unpack('<I', data[off + 4:off + 8])[0]
        yield cid, off + 8, size
        off += 8 + size + (size & 1)


def read_sf(path):
    """Parse an SF2/SF3 file: presets, instruments with zones (key range, vel range, root key, loop, tuning),
    and sample headers. Returns a dict; sample audio is decoded lazily by sf_sample()."""
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:4] == b'RIFF' and data[8:12] == b'sfbk'
    lists = {}
    for cid, off, size in _chunks(data, 12, len(data)):
        if cid == 'LIST':
            lists[data[off:off + 4].decode()] = (off + 4, off + size)
    smpl = None
    so, se = lists['sdta']
    for cid, off, size in _chunks(data, so, se):
        if cid == 'smpl':
            smpl = (off, size)
    pd = {}
    po, pe = lists['pdta']
    for cid, off, size in _chunks(data, po, pe):
        pd[cid] = data[off:off + size]

    def recs(name, fmt, sz):
        b = pd[name]
        return [struct.unpack(fmt, b[i:i + sz]) for i in range(0, len(b), sz)]

    phdr = [(r[0].split(b'\0')[0].decode('latin1'), r[1], r[2], r[3]) for r in recs('phdr', '<20sHHHIII', 38)]
    pbag = recs('pbag', '<HH', 4)
    pgen = recs('pgen', '<HH', 4)
    inst = [(r[0].split(b'\0')[0].decode('latin1'), r[1]) for r in recs('inst', '<20sH', 22)]
    ibag = recs('ibag', '<HH', 4)
    igen = recs('igen', '<Hh', 4)
    shdr = [dict(name=r[0].split(b'\0')[0].decode('latin1'), start=r[1], end=r[2], loop_start=r[3], loop_end=r[4],
                 rate=r[5], key=r[6], correction=r[7], link=r[8], type=r[9]) for r in recs('shdr', '<20sIIIIIBbHH', 46)]

    def gens(bags, genlist, i0, i1):
        zones = []
        for b in range(i0, i1):
            g0, g1 = bags[b][0], bags[b + 1][0]
            z = {}
            for g in range(g0, g1):
                op, amt = genlist[g][0], genlist[g][1]
                z[op] = amt
            zones.append(z)
        return zones

    instruments = []
    for i in range(len(inst) - 1):
        zones = gens(ibag, igen, inst[i][1], inst[i + 1][1])
        instruments.append(dict(name=inst[i][0], zones=zones))
    presets = []
    for i in range(len(phdr) - 1):
        zones = gens(pbag, [(a, b) for a, b in pgen], phdr[i][3], phdr[i + 1][3])
        presets.append(dict(name=phdr[i][0], program=phdr[i][1], bank=phdr[i][2], zones=zones))
    return dict(data=data, smpl=smpl, presets=presets, instruments=instruments, samples=shdr, path=path)


def _range(v):
    return (v & 0xFF, (v >> 8) & 0xFF)


def sf_instrument_zones(sf, inst_name):
    """Zones of an instrument: [{sample, lo, hi, vlo, vhi, root, tune_cents, loop:(s,e)|None, mode, pan}]"""
    ins = next(i for i in sf['instruments'] if i['name'] == inst_name)
    out = []
    glob_z = {}
    for z in ins['zones']:
        if 53 not in z:          # global zone
            glob_z = z
            continue
        zz = {**glob_z, **z}
        sh = sf['samples'][zz[53]]
        lo, hi = _range(zz[43]) if 43 in zz else (0, 127)
        vlo, vhi = _range(zz[44]) if 44 in zz else (0, 127)
        root = zz.get(58, sh['key'])
        if root < 0 or root > 127:
            root = sh['key']
        tune = zz.get(51, 0) * 100 + zz.get(52, 0) + sh['correction']
        mode = zz.get(54, 0)
        out.append(dict(sample=zz[53], lo=lo, hi=hi, vlo=vlo, vhi=vhi, root=root, tune=tune, mode=mode,
                        pan=zz.get(17, 0) / 500.0, sh=sh))
    return out


def sf_sample(sf, index):
    """Decoded mono float32 of sample `index` at its own rate + (loop_start, loop_end) in decoded frames.
    SF3 stores each sample as an Ogg Vorbis stream at byte offsets [start, end) of smpl."""
    sh = sf['samples'][index]
    key = hashlib.sha1(f"{sf['path']}|{index}|{sh['name']}".encode()).hexdigest()[:20]
    os.makedirs(CACHE, exist_ok=True)
    cp = os.path.join(CACHE, 'sf_' + key + '.npy')
    if os.path.exists(cp):
        x = np.load(cp)
    else:
        off, size = sf['smpl']
        raw = sf['data'][off + sh['start']: off + sh['end']]
        if raw[:4] == b'OggS':
            with tempfile.NamedTemporaryFile(suffix='.ogg', delete=False) as t:
                t.write(raw)
                tp = t.name
            try:
                x, _ = _sf_read(tp)
            finally:
                os.unlink(tp)
            x = x.mean(axis=1).astype(np.float32)
        else:   # plain SF2 16-bit
            raw = sf['data'][off + sh['start'] * 2: off + sh['end'] * 2]
            x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
        np.save(cp, x)
    ls, le = sh['loop_start'], sh['loop_end']
    if raw_is_sf3(sf):
        pass   # SF3 (MuseScore): loop points are already relative to the decoded sample
    else:
        ls, le = ls - sh['start'], le - sh['start']
    return x, sh['rate'], (ls, le)


def raw_is_sf3(sf):
    off, _ = sf['smpl']
    return sf['data'][off:off + 4] == b'OggS'
