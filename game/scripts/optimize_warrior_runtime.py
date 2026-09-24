"""Encode only the chase-view runtime art at high quality for faster loading."""
from pathlib import Path

import numpy as np
from PIL import Image


assets = Path(__file__).resolve().parents[1] / "2d" / "assets"
for name in ("rumi-rear", "enemies-actions", "night-market-chase"):
    source = Image.open(assets / f"{name}-v1.png")
    source = source.convert("RGBA" if "A" in source.getbands() else "RGB")
    target = assets / f"{name}-v2.webp"
    source.save(target, "WEBP", quality=98, method=6)

    before = np.asarray(source, dtype=np.float32)
    after = np.asarray(Image.open(target).convert(source.mode), dtype=np.float32)
    if source.mode == "RGBA":
        assert np.array_equal(before[:, :, 3], after[:, :, 3]), f"{name}: changed transparency"
        visible = before[:, :, 3] > 128
        colors_before, colors_after = before[visible, :3], after[visible, :3]
    else:
        colors_before, colors_after = before, after
    mse = np.mean((colors_before - colors_after) ** 2)
    psnr = 10 * np.log10(255 ** 2 / mse)
    assert psnr >= 37, f"{name}: visual quality below 37 dB ({psnr:.2f})"
    print(f"{target.name}: {target.stat().st_size:,} bytes; {psnr:.2f} dB; alpha unchanged")
