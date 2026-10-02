"""Pack ambientCG CC0 source ZIPs into the shared, bounded game texture set.

Usage: python3 game/scripts/march-art/prepare_surfaces.py STONE_ZIP WOOD_ZIP
Sources and license: game/assets/march/SURFACE-CREDITS.md
"""
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

TARGET = Path(__file__).resolve().parents[2] / 'assets' / 'march'


def load(archive, suffix):
    name = next(name for name in archive.namelist() if name.endswith('_' + suffix + '.jpg'))
    return Image.open(io.BytesIO(archive.read(name))).resize((512, 512), Image.Resampling.LANCZOS)


def prepare(stone_zip, wood_zip):
    with zipfile.ZipFile(stone_zip) as stone, zipfile.ZipFile(wood_zip) as wood:
        rgb = np.asarray(load(stone, 'Color').convert('RGB'), dtype=float)
        ao = np.asarray(load(stone, 'AmbientOcclusion').convert('L'), dtype=float) / 255
        luma = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
        moss = (rgb[:, :, 1] > rgb[:, :, 0] * 1.05) & (rgb[:, :, 1] > rgb[:, :, 2] * 1.12)
        # Neutral aged stone works under both warm market and cold bridge lighting.
        rgb = (rgb * 0.25 + luma[:, :, None] * 0.75)
        rgb *= np.where(moss, 0.68, 1)[:, :, None] * (0.78 + 0.22 * ao[:, :, None])
        Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(TARGET / 'stone-colour.webp', quality=90, method=6)
        normal = load(stone, 'NormalGL').convert('RGB')
        normal.putalpha(load(stone, 'Roughness').convert('L'))
        normal.save(TARGET / 'stone-surface.webp', quality=88, method=6)
        grain = load(wood, 'Color').convert('RGB').transpose(Image.Transpose.ROTATE_90)
        grain.save(TARGET / 'wood-grain.webp', quality=90, method=6)
    for name in ['stone-colour.webp', 'stone-surface.webp', 'wood-grain.webp']:
        print(name, (TARGET / name).stat().st_size)


if __name__ == '__main__':
    prepare(*sys.argv[1:])
