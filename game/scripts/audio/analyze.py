"""Offline checks: loudness, peaks, band balance over time, loop-seam continuity and PNG
spectrograms / waveforms (for inspecting renders without listening).

  python analyze.py file.wav [more.wav ...] --png OUTDIR [--loop START END]
"""
import argparse
import json
import os
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, lufs, short_term_max, true_peak_db  # noqa: E402


def load(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x / 32768.0
    elif x.dtype == np.int32:
        x = x / 2147483648.0
    x = x.astype(float)
    if x.ndim == 1:
        x = x[:, None]
    return sr, x


def bands(x, sr, win=2.0):
    """Per-window energy in low (<200), low-mid (200-800), mid (0.8-3k), high (>3k) in dBFS."""
    m = x.mean(axis=1)
    edges = [(20, 200), (200, 800), (800, 3000), (3000, 16000)]
    sos = [signal.butter(4, e, 'bandpass', fs=sr, output='sos') for e in edges]
    ys = [signal.sosfilt(s, m) for s in sos]
    n = int(win * sr)
    out = []
    for s in range(0, len(m) - n + 1, n):
        out.append([round(10 * np.log10(np.mean(y[s:s + n] ** 2) + 1e-12), 1) for y in ys])
    return out


def seam(x, sr, a, b):
    """Compare the jump across the loop seam with typical sample-to-sample steps."""
    ia, ib = int(round(a * sr)), int(round(b * sr))
    d = np.abs(np.diff(x, axis=0)).max(axis=1)
    typical = float(np.percentile(d, 99.5))
    # what the listener hears at the wrap: x[ib-1] -> x[ia]; compare with the natural step x[ib-1] -> x[ib]
    jump = float(np.max(np.abs(x[ia] - x[ib - 1])))
    natural = float(np.max(np.abs(x[ib] - x[ib - 1]))) if ib < len(x) else None
    # periodicity: the post-roll after loopEnd must equal the audio after loopStart (and pre-roll likewise)
    w = int(0.25 * sr)
    post = float(np.max(np.abs(x[ib:ib + w] - x[ia:ia + w]))) if ib + w <= len(x) else None
    pre = float(np.max(np.abs(x[ib - w:ib] - x[ia - w:ia]))) if ia >= w else None
    return dict(wrap_step=round(jump, 5), natural_step=natural and round(natural, 5), step99_5=round(typical, 5),
                postroll_mismatch=post, preroll_mismatch=pre)


def png(x, sr, path, title):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    m = x.mean(axis=1)
    fig, ax = plt.subplots(3, 1, figsize=(14, 8), gridspec_kw=dict(height_ratios=[1, 3, 1]))
    t = np.arange(len(m)) / sr
    step = max(1, len(m) // 6000)
    ax[0].fill_between(t[::step], x[::step, 0], -x[::step, -1] if x.shape[1] > 1 else -x[::step, 0], lw=0, color='#6a4')
    ax[0].plot(t[::step], x[::step, 0], lw=0.3, color='#264')
    ax[0].set_xlim(0, t[-1]); ax[0].set_ylim(-1, 1); ax[0].set_title(title)
    f, tt, S = signal.spectrogram(m, sr, nperseg=2048, noverlap=1536)
    S = 10 * np.log10(S + 1e-12)
    ax[1].pcolormesh(tt, f, S, vmin=S.max() - 90, vmax=S.max(), shading='auto', cmap='magma')
    ax[1].set_yscale('symlog', linthresh=200); ax[1].set_ylim(30, sr / 2)
    # short-term loudness curve
    from dsp import _kweight_sos
    y = signal.sosfilt(_kweight_sos(), x, axis=0)
    blk, hop = int(0.4 * sr), int(0.1 * sr)
    ls = [-0.691 + 10 * np.log10(np.sum(np.mean(y[s:s + blk] ** 2, axis=0)) + 1e-12) for s in range(0, len(y) - blk, hop)]
    ax[2].plot(np.arange(len(ls)) * 0.1, ls, lw=0.8); ax[2].set_ylim(-45, -5); ax[2].set_xlim(0, t[-1]); ax[2].grid(alpha=.3)
    ax[2].set_ylabel('M LUFS')
    fig.tight_layout()
    fig.savefig(path, dpi=70)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--png')
    ap.add_argument('--loop', nargs=2, type=float)
    a = ap.parse_args()
    for p in a.files:
        sr, x = load(p)
        res = dict(file=os.path.basename(p), seconds=round(len(x) / sr, 2), lufs=round(lufs(x), 2), st_max=round(short_term_max(x), 2),
                   true_peak=round(true_peak_db(x), 2), peak=round(float(20 * np.log10(np.abs(x).max() + 1e-12)), 2))
        res['bands'] = bands(x, sr, 4.0)
        if a.loop:
            res['seam'] = seam(x, sr, *a.loop)
        print(json.dumps(res))
        if a.png:
            os.makedirs(a.png, exist_ok=True)
            png(x, sr, os.path.join(a.png, os.path.splitext(os.path.basename(p))[0] + '.png'), res['file'])


if __name__ == '__main__':
    main()
