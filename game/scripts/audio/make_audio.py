"""Regenerate every march music cue and the SFX sprite.

  python3 -m venv /tmp/audvenv && /tmp/audvenv/bin/pip install numpy scipy numba matplotlib
  /tmp/audvenv/bin/python game/scripts/audio/make_audio.py --samples ~/march-samples            # everything
  /tmp/audvenv/bin/python game/scripts/audio/make_audio.py --samples ~/march-samples music market
  /tmp/audvenv/bin/python game/scripts/audio/make_audio.py --samples ~/march-samples sfx
  ... --wav-dir DIR   also keep the mastered 16-bit WAVs (for analyze.py)

The recorded sample packs (VSCO 2 CE, VCSL, MuseScore General SF3, Kenney / OpenGameArt CC0 SFX) are NOT in
the repo; download them separately into the layout described in samplelib.py and pass --samples (or set
MARCH_SAMPLES). Needs `lame` (brew install lame) and libsndfile (brew install libsndfile). Output goes to
game/assets/audio/march/ (<cue>.mp3, sfx.mp3, manifest.json); credits in game/assets/audio/march/CREDITS.md.
The compositions (score.py / music.py) and all processing are original; the kick and sub-bass layers are
synthesised (instruments.py).

(Not to be confused with the repo-root build.py, which must never be run.)
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402
from scipy.io import wavfile  # noqa: E402

from dsp import SR, db  # noqa: E402
from song import master_chain, report  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'audio', 'march'))
PREROLL = 0.5   # seconds of loop tail written before loopStart / loop head after loopEnd
MUSIC_LAME = ['-V', '5', '-q', '0', '--noreplaygain']
SFX_LAME = ['-V', '5', '-q', '0', '--noreplaygain', '-m', 'm']


def to_i16(x, seed=0):
    r = np.random.default_rng(seed)
    tpdf = (r.random(x.shape) - r.random(x.shape)) / 32768.0
    return np.clip(np.round((x + tpdf) * 32767), -32768, 32767).astype(np.int16)


def file_hash(path):
    with open(path, 'rb') as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


def encode(wav_i16, mp3_path, args):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'in.wav')
        wavfile.write(p, SR, wav_i16)
        subprocess.run(['lame', '--silent', *args, p, mp3_path], check=True)
    return os.path.getsize(mp3_path)


def load_manifest():
    p = os.path.join(OUT, 'manifest.json')
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {'version': 1, 'sampleRate': SR, 'music': {}, 'sfx': None}


def save_manifest(m):
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
        f.write('\n')


def build_music(names, wav_dir=None):
    import music
    man = load_manifest()
    for name in names:
        t0 = time.time()
        song, cfg = music.CUES[name]()
        stats = {}
        mix = song.mixdown(reverb_cfg=cfg.get('reverb_cfg'), ir=cfg.get('ir'), stats=stats)
        target = -16.0 if song.loop else -15.0
        y = master_chain(song, mix, target_lufs=target, ceiling_db=-2.0)   # MP3 overshoot stays under -1 dBTP
        rep = report(name, y)
        if song.loop:
            pre = int(PREROLL * SR)
            out = np.concatenate([y[-pre:], y, y[:pre]], axis=0)
            entry = dict(file=f'{name}.mp3', loop=True, loopStart=PREROLL, loopEnd=round(PREROLL + len(y) / SR, 6),
                         bpm=song.bpm, bars=song.bars)
        else:
            # trim trailing near-silence, short fade
            thr = db(-70)
            idx = np.where(np.abs(y).max(axis=1) > thr)[0]
            end = min(len(y), (idx[-1] if len(idx) else len(y)) + int(0.05 * SR))
            out = y[:end].copy()
            f = int(0.3 * SR)
            out[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
            entry = dict(file=f'{name}.mp3', loop=False, duration=round(len(out) / SR, 3))
        i16 = to_i16(out, 1)
        size = encode(i16, os.path.join(OUT, f'{name}.mp3'), MUSIC_LAME)
        if wav_dir:
            os.makedirs(wav_dir, exist_ok=True)
            wavfile.write(os.path.join(wav_dir, f'{name}.wav'), SR, i16)
        entry.update(lufs=rep['lufs'], truePeak=rep['true_peak'], bytes=size, hash=file_hash(os.path.join(OUT, f'{name}.mp3')))
        man['music'][name] = entry
        print(json.dumps({**rep, 'bytes': size, 'secs_build': round(time.time() - t0, 1),
                          'buses': {k: round(v, 1) for k, v in stats.items()}}), flush=True)
    save_manifest(man)


def build_sfx(wav_dir=None):
    import sfx
    man = load_manifest()
    audio, table, info = sfx.build_sprite()
    i16 = to_i16(audio, 2)
    size = encode(i16, os.path.join(OUT, 'sfx.mp3'), SFX_LAME)
    if wav_dir:
        os.makedirs(wav_dir, exist_ok=True)
        wavfile.write(os.path.join(wav_dir, 'sfx.wav'), SR, i16)
    man['sfx'] = dict(file='sfx.mp3', bytes=size, hash=file_hash(os.path.join(OUT, 'sfx.mp3')), marker=round(info['marker'], 6), markerLen=round(info['markerLen'], 6),
                     markerHz=info['markerHz'], sounds=table)
    save_manifest(man)
    print(json.dumps(dict(sfx_bytes=size, seconds=round(len(audio) / SR, 2), sounds=len(table),
                          variants=sum(len(v) for v in table.values()))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', nargs='?', default='all', choices=['all', 'music', 'sfx'])
    ap.add_argument('names', nargs='*')
    ap.add_argument('--wav-dir')
    ap.add_argument('--samples', help='folder with the downloaded sample packs (else $MARCH_SAMPLES)')
    a = ap.parse_args()
    if a.samples:
        os.environ['MARCH_SAMPLES'] = os.path.abspath(os.path.expanduser(a.samples))
    os.makedirs(OUT, exist_ok=True)
    if a.what in ('all', 'music'):
        import music
        build_music(a.names or list(music.CUES), a.wav_dir)
    if a.what in ('all', 'sfx'):
        build_sfx(a.wav_dir)


if __name__ == '__main__':
    main()
