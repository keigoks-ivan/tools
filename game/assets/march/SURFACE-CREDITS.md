# Shared surface details

The three processed WebP textures use free ambientCG assets licensed under
[Creative Commons CC0 1.0 Universal](https://docs.ambientcg.com/license/).
They may be modified and redistributed, including in commercial games.

| Game asset | Source | Processing |
| --- | --- | --- |
| `stone-colour.webp` | [PavingStones067](https://ambientcg.com/a/PavingStones067), Color + AmbientOcclusion from `PavingStones067_1K-JPG.zip` | 512²; neutralize moss colour, soften AO into albedo; WebP quality 90 |
| `stone-surface.webp` | Same source, NormalGL + Roughness | 512²; linear RGB = OpenGL tangent-space normal, alpha = roughness; WebP quality 88 |
| `wood-grain.webp` | [Wood051](https://ambientcg.com/a/Wood051), Color from `Wood051_1K-JPG.zip` | 512²; rotate grain for columns; WebP quality 90 |

The original source packs are not bundled. To reproduce, download the two 1K-JPG
ZIPs from the source pages and run:

```
python3 game/scripts/march-art/prepare_surfaces.py /path/to/PavingStones067_1K-JPG.zip /path/to/Wood051_1K-JPG.zip
```

Only these three 512² textures are loaded once by the base world; every chapter
reuses the same Texture objects. Packed roughness is read from **alpha**, never
from the normal map's green channel. Total downloads: 304,244 bytes; estimated
RGBA GPU storage including mipmaps: 4 MiB. No displacement geometry, shadow pass,
additional lights or post-processing is introduced.

When regenerating, update `SURFACE_VERSION`, the corresponding preload versions
and exact byte weights, and the environment module cache keys.
