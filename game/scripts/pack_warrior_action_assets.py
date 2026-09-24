"""Align the four extra rear-view action poses for the lightweight canvas game."""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label


assets = Path(__file__).resolve().parents[1] / "2d" / "assets"
source = Image.open(assets / "rumi-rear-action-source-v2.png").convert("RGBA")
atlas = Image.new("RGBA", (1536, 1280))
cell_width, cell_height = source.width // 2, source.height // 2

for row in range(2):
    for col in range(2):
        cell = source.crop((col * cell_width, row * cell_height,
                            (col + 1) * cell_width, (row + 1) * cell_height))
        pixels = np.asarray(cell).copy()
        components, count = label(pixels[:, :, 3] > 16)
        sizes = np.bincount(components.ravel())
        figure_id = np.argmax(sizes[1:]) + 1 if count else 0
        mask = binary_dilation(components == figure_id, iterations=2)
        pixels[~mask] = 0
        cell = Image.fromarray(pixels)
        bounds = cell.getchannel("A").getbbox()
        if not bounds:
            raise ValueError(f"Missing action pose at {row}, {col}")
        figure = cell.crop(bounds)
        if figure.width > 768 or figure.height > 590:
            raise ValueError(f"Action pose does not fit the frame: {row}, {col}")
        atlas.alpha_composite(figure, (col * 768 + (768 - figure.width) // 2,
                                      row * 640 + 590 - figure.height))

output = assets / "rumi-rear-actions-v2.webp"
atlas.save(output, "WEBP", quality=90, method=6)
assert Image.open(output).size == atlas.size
print(f"{output.name}: {output.stat().st_size:,} bytes")
