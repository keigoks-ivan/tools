"""Render REDLINE / 144: an original 64-bar racing instrumental.

All instruments are generated mathematically. No recordings, sample libraries,
third-party scores or licensed songs are used. Requires numpy, scipy and ffmpeg.
The output is a streaming MP3; the game does not synthesize music on a phone.
"""
from functools import lru_cache
from pathlib import Path
import json
import math
import subprocess
import tempfile

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100
BPM = 144
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 64
LENGTH = round(SR * BAR * BARS)
RNG = np.random.default_rng(458144)
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'


def time(length):
    return np.arange(round(SR * length), dtype=np.float64) / SR


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def filt(x, frequency, kind='lowpass', order=2):
    return signal.sosfilt(signal.butter(order, frequency, kind, fs=SR, output='sos'), x)


def edge(x, attack=.004, release=.015):
    x = x.copy()
    a, r = min(len(x), round(SR * attack)), min(len(x), round(SR * release))
    x[:a] *= np.linspace(0, 1, a)
    x[-r:] *= np.linspace(1, 0, r)
    return x.astype(np.float32)


@lru_cache(None)
def guitar(note, length, bright=False):
    """Double-tracked power-string excitation into a soft-clipped cabinet."""
    t = time(length)
    frequency = hz(note)
    # Harmonic strings avoid the aliasing of an unbounded sawtooth oscillator.
    wave = np.zeros_like(t)
    for ratio, weight in [(1, 1), (1.0018, .43), (1.4983, .58), (2.002, .25)]:
        for harmonic in range(1, 15):
            f = frequency * ratio * harmonic
            if f > 11000:
                break
            wave += weight / harmonic * np.sin(2 * np.pi * f * t + .09 * harmonic)
    wave *= np.exp(-t * (2.6 if bright else 7.6))
    wave += filt(RNG.normal(0, .09, len(t)), 2100, 'highpass') * np.exp(-t * 80)
    driven = np.tanh(wave * (1.6 if bright else 2.3))
    driven = filt(filt(driven, 80, 'highpass'), 5000 if bright else 3400)
    return edge(driven, .002, .024)


@lru_cache(None)
def bass(note, length):
    t = time(length)
    f = hz(note)
    wave = np.sin(2 * np.pi * f * t)
    wave += .27 * np.sin(4 * np.pi * f * t) + .14 * np.sin(6 * np.pi * f * t)
    return edge(np.tanh(wave * 1.5) * np.exp(-t * 2), .004, .018)


@lru_cache(None)
def lead(note, length):
    t = time(length)
    frequency = hz(note)
    vibrato = .004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / .2)
    phase = 2 * np.pi * np.cumsum(frequency * (1 + vibrato)) / SR
    wave = np.sin(phase) + .36 * np.sin(phase * 2 + .2) + .23 * np.sin(phase * 3)
    wave += .15 * np.sin(2 * np.pi * frequency * 1.003 * t)
    return edge(filt(np.tanh(wave * 1.2), 6600) * np.exp(-t * .6), .013, .055)


@lru_cache(None)
def arp(note):
    t = time(BEAT * .27)
    f = hz(note)
    wave = np.sin(2 * np.pi * f * t) + .31 * np.sin(4 * np.pi * f * t)
    return edge(wave * np.exp(-t * 18), .002, .008)


def kick():
    t = time(.38)
    f = 48 + 133 * np.exp(-t * 39)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 13)
    click = filt(RNG.normal(0, .18, len(t)), 3800, 'highpass') * np.exp(-t * 120)
    return edge(np.tanh((tone + click) * 1.4), .001, .02)


def snare():
    t = time(.29)
    wire = filt(filt(RNG.normal(0, .65, len(t)), 1300, 'highpass'), 11000)
    body = np.sin(2 * np.pi * 186 * t) + .37 * np.sin(2 * np.pi * 324 * t)
    return edge(wire * np.exp(-t * 21) + body * .54 * np.exp(-t * 33), .001, .018)


def hat(opened=False):
    t = time(.24 if opened else .066)
    noise = filt(RNG.normal(0, .4, len(t)), 7200, 'highpass')
    for f in [4137, 5918, 7123, 8267]:
        noise += .06 * np.sin(2 * np.pi * f * t)
    return edge(noise * np.exp(-t * (15 if opened else 57)), .001, .012)


def crash():
    t = time(1.9)
    shimmer = filt(filt(RNG.normal(0, .3, len(t)), 4300, 'highpass'), 15000)
    return edge(shimmer * np.exp(-t * 2.8), .002, .16)


def tom(frequency):
    t = time(.26)
    phase = 2 * np.pi * np.cumsum(frequency + 65 * np.exp(-t * 21)) / SR
    return edge(np.sin(phase) * np.exp(-t * 13), .001, .018)


def render():
    buses = {key: np.zeros((LENGTH, 2), dtype=np.float32) for key in ['drums', 'bass', 'guitar', 'lead', 'air']}

    def add(bus, sample, when, gain=1, pan=0, echo=False):
        index = round(when * SR) % LENGTH
        angle = (pan + 1) * np.pi / 4
        stereo = np.asarray(sample, np.float32)[:, None] * np.array([math.cos(angle), math.sin(angle)], dtype=np.float32) * gain
        end = min(len(stereo), LENGTH - index)
        buses[bus][index:index + end] += stereo[:end]
        if end < len(stereo):
            buses[bus][:len(stereo) - end] += stereo[end:]
        if echo:
            for delay, level in [(BEAT * .75, .24), (BEAT * 1.5, .11)]:
                add('air', sample, when + delay, gain * level, -pan)

    kicks = [kick() for _ in range(3)]
    snares = [snare() for _ in range(4)]
    hats = [hat() for _ in range(5)]
    open_hat, cymbal = hat(True), crash()
    roots = [38, 34, 41, 36]  # D minor / B-flat / F / C; two bars per chord.
    hook_a = [74, 74, 77, 81, 79, 77, 74, 72, 70, 72, 74, 77, 76, 72, 69, 72]
    hook_b = [81, 79, 77, 74, 77, 79, 81, 84, 82, 81, 79, 77, 76, 77, 79, 72]

    for bar in range(BARS):
        intro = bar < 8
        breakdown = 40 <= bar < 48
        chorus = 24 <= bar < 40 or bar >= 48
        root = roots[(bar // 2) % 4]
        if bar in [39, 47, 63]:
            root = 33  # A turnaround resolves to the next D downbeat.
        start = bar * BAR
        strength = .74 if intro else .69 if breakdown else 1

        # Driving kick/snare with offbeat hats, occasional sixteenth ghosts and fills.
        kick_steps = [0, 2] if breakdown else [0, 1.5, 2, 3.5] if bar % 4 == 3 else [0, 1, 2, 3]
        for step in kick_steps:
            add('drums', kicks[bar % 3], start + step * BEAT, .63 * strength)
        for step in ([2] if breakdown else [1, 3]):
            add('drums', snares[bar % 4], start + step * BEAT, .53 * strength)
            add('air', snares[bar % 4], start + step * BEAT + .038, .055, -.25)
        for step in range(8 if not breakdown else 4):
            when = start + step * BEAT / (2 if not breakdown else 1)
            add('drums', hats[(bar + step) % 5], when, .17 if step % 2 else .09, -.22)
        if not breakdown:
            for step in [1.5, 3.5]:
                add('drums', open_hat, start + step * BEAT, .13, .28)
        if bar % 8 == 0:
            add('drums', cymbal, start, .36, .18)
        if bar % 8 == 7:
            for j, frequency in enumerate([180, 143, 110, 85]):
                add('drums', tom(frequency), start + (3 + j * .25) * BEAT, .37, -.4 + j * .25)
            for step in [3.25, 3.75]:
                add('drums', snares[(bar + 1) % 4], start + step * BEAT, .27)

        # Bass and palm-muted, stereo double-tracked power chords interlock.
        riff = [(0, 0), (.5, 0), (.75, 12), (1.5, 0), (2, 0), (2.5, 7), (3, 0), (3.5, 12)]
        if breakdown:
            riff = [(0, 0), (2, 0), (3.5, 7)]
        for step, interval in riff:
            length = BEAT * (.45 if interval == 12 else .55)
            add('bass', bass(root - 12 + interval, length), start + step * BEAT, .39 * strength)
            if not breakdown or step == 0:
                for pan, cents in [(-.72, 0), (.72, 0)]:
                    # Tiny timing difference is the second guitar take, not a copied mono pan.
                    delay = .006 if pan > 0 else 0
                    add('guitar', guitar(root + interval, length + .07), start + step * BEAT + delay, .115 * strength, pan)
        if chorus:
            for pan in [-.65, .65]:
                add('guitar', guitar(root + 12, BAR * .94, True), start + (.008 if pan > 0 else 0), .075, pan)

        # A composed eight-bar lead phrase, answered in the final chorus.
        if chorus or bar in [6, 7, 22, 23, 38, 39, 46, 47]:
            phrase = hook_b if bar >= 56 else hook_a
            for j, (step, duration) in enumerate([(0, .75), (1, .5), (1.75, .75), (3, .75)]):
                note = phrase[(bar % 4) * 4 + j]
                add('lead', lead(note, BEAT * duration), start + step * BEAT, .18 if chorus else .12, -.08, True)
        if intro or breakdown or chorus:
            chord = [root + 24, root + 27, root + 31, root + 36]
            if root in [34, 41, 36]:
                chord[1] += 1
            for step in range(16):
                note = chord[(step + bar) % 4]
                add('air', arp(note), start + step * BEAT / 4, .13 if breakdown else .055, .43 if step % 2 else -.43, True)

        # Filtered sweep leads into each big section; drum drops make the return hit harder.
        if bar in [7, 23, 47]:
            t = time(BAR)
            noise = filt(RNG.normal(0, .15, len(t)), 1900, 'highpass')
            sweep = noise * (t / BAR) ** 2
            add('air', edge(sweep, .05, .025), start, .55)

    # Gentle kick sidechain leaves the low end clear while preserving guitar transients.
    t = np.arange(LENGTH, dtype=np.float32) / SR
    phase = np.mod(t, BEAT)
    duck = 1 - .20 * np.exp(-phase / .06)
    for bus in ['bass', 'guitar', 'lead', 'air']:
        buses[bus] *= duck[:, None]
    mix = sum(buses.values())
    for channel in range(2):
        mix[:, channel] = filt(mix[:, channel], 28, 'highpass')
    mix = np.tanh(mix * 1.24)
    peak = float(np.max(np.abs(mix)))
    mix *= .86 / peak
    # Circular composition makes the loop a musical transition with no fade or dead air.
    return mix, {
        'title': 'REDLINE / 144', 'bpm': BPM, 'bars': BARS,
        'durationSeconds': LENGTH / SR, 'sampleRate': SR, 'channels': 2,
        'peak': float(np.max(np.abs(mix))), 'rms': float(np.sqrt(np.mean(mix * mix))),
        'sectionRms': [float(np.sqrt(np.mean(mix[round(i * BAR * SR):round((i + 8) * BAR * SR)] ** 2))) for i in range(0, BARS, 8)],
        'composition': 'Original D-minor electronic rock. Intro, riff, chorus, breakdown, final chorus; synthesized instruments only.',
    }


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    music, metadata = render()
    assert np.all(np.isfinite(music)) and .08 < metadata['rms'] < .4
    assert metadata['peak'] < .9 and min(metadata['sectionRms']) > .045
    with tempfile.TemporaryDirectory(prefix='apex-original-music-') as temporary:
        wav = Path(temporary) / 'redline.wav'
        wavfile.write(wav, SR, np.round(music * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '160k',
                        '-metadata', 'title=REDLINE / 144', '-metadata', 'artist=APEX Racing — Original Score',
                        str(OUT / 'apex-redline.mp3')], check=True)
    (OUT / 'music-manifest.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))
