"""Build the baseball recordings and original home-run fanfare.

Requires Python numpy/scipy and ffmpeg. Download the CC0 sources listed in
assets/audio/CREDITS.md separately; raw recordings do not ship in the game.
  python3 tools/make_audio.py --samples /tmp/baseball-samples --recordings /tmp
The samples folder contains vsco/ and kenney/Audio/; recordings are named
baseball-{hit,mitt,cheer}-recording.mp3. Only this game's audio folder is written.
"""
import argparse
import functools
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'


@functools.lru_cache(None)
def read(path):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le',
                        '-ar', str(SR), '-ac', '2', 'pipe:1'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype='<f4').reshape(-1, 2).astype(float)


def filt(x, hz, kind='highpass'):
    return signal.sosfilt(signal.butter(2, hz, kind, fs=SR, output='sos'), x, axis=0)


def fade(x, attack=.004, release=.08):
    x = x.copy()
    for n, front in [(min(len(x)//2, int(attack*SR)), True), (min(len(x)//2, int(release*SR)), False)]:
        if n:
            ramp = np.sin(np.linspace(0, math.pi/2, n))**2
            x[:n] *= ramp[:, None] if front else 1
            if not front:
                x[-n:] *= ramp[::-1, None]
    return x


def peak_trim(x, duration=.55):
    env = np.sqrt(np.mean(x*x, axis=1))
    k = int(np.argmax(signal.convolve(env, np.ones(132)/132, mode='same')))
    start = max(0, k-int(.006*SR))
    return fade(x[start:start+int(duration*SR)], .001, .08)


def pitch(x, semis):
    rate = 2**(semis/12)
    return signal.resample_poly(x, 10000, round(rate*10000), axis=0)


def norm(x, peak=-2.0):
    return x * (10**(peak/20)/(np.max(np.abs(x))+1e-10))


def stadium(x, amount=.16):
    out = np.pad(x, ((0, int(.32*SR)), (0, 0)))
    for i, delay in enumerate([.057, .093, .143, .207]):
        n = int(delay*SR)
        out[n:n+len(x)] += x[:, ::-1] * amount * (.72**i)
    return fade(out, .001, .12)


def save(name, x, music=False):
    x = fade(filt(x, 50 if not music else 30), .002, .12)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp)/'mix.wav'
        wavfile.write(src, SR, np.int16(np.clip(x, -1, 1)*32767))
        if music:
            filters = 'acompressor=threshold=0.20:ratio=2:attack=15:release=180,loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=out:st=8.2:d=0.8'
            args = ['-af', filters, '-ar', str(SR), '-codec:a', 'libmp3lame', '-b:a', '192k']
        else:
            args = ['-ar', '32000', '-codec:a', 'pcm_s16le']
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), *args, str(OUT/name)], check=True)
    return {'file': name, 'seconds': round(len(x)/SR, 3), 'bytes': (OUT/name).stat().st_size}


def build_sfx(samples, recordings):
    base = peak_trim(read(recordings/'baseball-hit-recording.mp3'), .48)
    wood = peak_trim(read(samples/'kenney/Audio/impactWood_medium_000.ogg'), .18)
    wood = norm(filt(wood, 220))
    entries = []
    for name, semis, support, level in [('hit-soft.wav', -2.0, .09, -4), ('hit-line.wav', 0, .17, -2), ('hit-power.wav', .65, .22, -1.8)]:
        x = filt(pitch(base, semis), 120)
        n = min(len(x), len(wood)); x[:n] += wood[:n]*support
        entries.append(save(name, norm(stadium(x, .12), level)))
    mitt = read(recordings/'baseball-mitt-recording.mp3')
    env = np.sqrt(np.mean(mitt*mitt, axis=1))
    peaks, _ = signal.find_peaks(signal.convolve(env, np.ones(176)/176, mode='same'), distance=int(.65*SR), height=env.max()*.18)
    peaks = sorted(peaks, key=lambda k: env[max(0,k-80):k+80].max(), reverse=True)[:2]
    if len(peaks) != 2:
        raise ValueError('Expected two separate ball-into-glove recordings')
    for i, k in enumerate(sorted(peaks)):
        x = mitt[max(0,k-int(.006*SR)):k+int(.34*SR)]
        entries.append(save(f'mitt-{i+1}.wav', norm(stadium(filt(fade(x,.001,.06),110), .08), -4)))
    for name, source in [('step.wav','footstep_grass_002.ogg'), ('bounce.wav','impactGeneric_light_001.ogg')]:
        entries.append(save(name, norm(peak_trim(read(samples/'kenney/Audio'/source), .3), -8)))
    cheer = read(recordings/'baseball-cheer-recording.mp3')
    entries.append(save('cheer.mp3', norm(fade(cheer[:int(5.0*SR)],.10,.55), -5), True))
    # Crossfade the endpoints of the quieter tail for a seamless stadium bed.
    bed = filt(cheer[int(4*SR):int(12.5*SR)], 4000, 'lowpass'); n = int(.8*SR)
    w = np.linspace(0,1,n)[:,None]
    bed[:n] = bed[-n:]*(1-w)+bed[:n]*w; bed=bed[:-n]
    with tempfile.TemporaryDirectory() as tmp:
        src=Path(tmp)/'bed.wav'; wavfile.write(src,SR,np.int16(norm(bed,-10)*32767))
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-codec:a','libmp3lame','-b:a','128k',str(OUT/'crowd-bed.mp3')],check=True)
    entries.append({'file':'crowd-bed.mp3','seconds':round(len(bed)/SR,3),'bytes':(OUT/'crowd-bed.mp3').stat().st_size})
    return entries


def midi(note):
    m=re.fullmatch(r'([A-G])([#b]?)(\d)',note)
    return 12*(int(m[3])+2)+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[m[1]]+{'':0,'#':1,'b':-1}[m[2]]


def instrument(folder):
    zones=[]
    for p in folder.glob('*.wav'):
        n=re.search(r'_([A-G][#b]?\d)_',p.name)
        if n: zones.append((midi(n[1]),p))
    if not zones: raise ValueError(f'No instrument recordings in {folder}')
    def note(m, dur):
        root,p=min(zones,key=lambda z:abs(z[0]-m))
        x=read(p); env=np.max(np.abs(x),axis=1); onset=np.flatnonzero(env>env.max()*.008)[0]
        x=pitch(x[max(0,onset-int(.005*SR)):],m-root)
        x=x[:int((dur+.12)*SR)]
        return fade(x,.004,.12)
    return note


def build_music(samples):
    # Original four-bar C-major victory hook, 132 BPM: melody, brass harmony,
    # low trombone pulse, snare backbeat/roll, concert bass drum and cymbal.
    trumpet=instrument(samples/'vsco/Brass/Trumpet/sus')
    trombone=instrument(samples/'vsco/Brass/Tenor Trombone/stac')
    mix=np.zeros((int(9.0*SR),2)); beat=60/132
    def add(x, t, gain=1, pan=0):
        start=max(0,int(t*SR)); n=min(len(x),len(mix)-start)
        if n>0: mix[start:start+n] += x[:n]*gain*np.sqrt([1-pan,1+pan])
    melody=[(0,72,.65),(1,76,.4),(1.5,79,.4),(2,84,1.3),(3.5,79,.4),
             (4,81,.65),(5,79,.4),(5.5,77,.4),(6,76,1.1),(7.5,74,.4),
             (8,74,.4),(8.5,77,.4),(9,79,.8),(10,83,.75),(11,79,.7),
             (12,84,3.5)]
    for b,n,d in melody: add(trumpet(n,d*beat),b*beat,.68,-.12)
    for bar,ch in enumerate([[48,55,60,64],[53,60,65,69],[43,50,55,59],[48,55,60,64]]):
        for b in [0,1.5,2.5]:
            for i,n in enumerate(ch[:3]):add(trombone(n,.5*beat),(bar*4+b)*beat,.26,.16+i*.04)
        if bar==3:
            for i,n in enumerate([60,64,67,72]):add(trumpet(n,1.45),12*beat,.24,(i-1.5)*.24)
    drums=samples/'vsco/Percussion'
    kick=read(drums/'BDrumNewhit_v5_rr1_Sum.wav')
    snares=[read(drums/f'Snare2-HitSN_v5_rr{i}_Sum.wav') for i in [1,2]]
    crash=read(drums/'cymbal-crash1_mf_rr1.wav')
    for b in range(12):
        if b%2==0: add(kick,b*beat,.25)
        else: add(snares[b%2],b*beat,.18,.08)
    for i in range(8):add(snares[i%2],(11+i/8)*beat,.035+i*.014,.08)
    add(kick,12*beat,.36);add(crash,12*beat,.17,-.2);add(crash,0,.05,-.2)
    mix=stadium(mix,.055)[:int(9*SR)]
    return save('homerun.mp3',norm(mix,-3),True)


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--samples',type=Path,required=True);ap.add_argument('--recordings',type=Path,required=True)
    a=ap.parse_args();OUT.mkdir(parents=True,exist_ok=True)
    info=build_sfx(a.samples,a.recordings);info.append(build_music(a.samples))
    print(json.dumps(info,indent=2))


if __name__=='__main__': main()
