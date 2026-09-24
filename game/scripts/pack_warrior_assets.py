"""Package generated rear-view art as a four-frame atlas and lossless WebP.

Offline dependencies: Pillow, NumPy, SciPy. Runtime has none of these.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label


ASSETS = Path(__file__).resolve().parents[1] / "2d" / "assets"
source = Image.open(ASSETS / "rumi-rear-source-v1.png").convert("RGBA")
pixels = np.asarray(source)
atlas = Image.new("RGBA", (2048, 1536))

for row in range(2):
    top, bottom = row * 625, min((row + 1) * 625, source.height)
    if row == 1:
        bottom = source.height
    components, count = label(pixels[top:bottom, :, 3] > 16)
    sizes = np.bincount(components.ravel())
    figure_ids = sorted(range(1, count + 1), key=lambda index: sizes[index], reverse=True)[:2]
    figure_ids.sort(key=lambda index: np.where(components == index)[1].min())
    for col, figure_id in enumerate(figure_ids):
        mask = binary_dilation(components == figure_id, iterations=2)
        ys, xs = np.nonzero(mask)
        left, right = xs.min(), xs.max() + 1
        upper, lower = ys.min(), ys.max() + 1
        cut = pixels[top + upper:top + lower, left:right].copy()
        cut[~mask[upper:lower, left:right]] = 0
        frame = Image.fromarray(cut)
        atlas.alpha_composite(frame, (col * 1024 + (1024 - frame.width) // 2,
                                      row * 768 + 700 - frame.height))

atlas.save(ASSETS / "rumi-rear-v1.png")
for name in ("rumi-rear-v1", "night-market-chase-v1"):
    original = Image.open(ASSETS / f"{name}.png").convert("RGBA")
    path = ASSETS / f"{name}.webp"
    original.save(path, "WEBP", lossless=True, method=6)
    decoded = Image.open(path).convert("RGBA")
    before, after = np.asarray(original), np.asarray(decoded)
    assert np.array_equal(before[:, :, 3], after[:, :, 3])
    assert np.array_equal(before[before[:, :, 3] > 0, :3], after[before[:, :, 3] > 0, :3])
    print(f"{name}: {original.width}×{original.height}; {path.stat().st_size:,} bytes; visible pixels match")
