# Night-market march level textures

Loaded only by `game/3d-next/march-art.js` (the `?level=march` art scene). Painted offline by
`game/scripts/march-art/paint_atlas.py` (PIL + numpy, no downloads, no external services).

| File | Pixels | Bytes | Content |
| --- | --- | --- | --- |
| `march-props.webp` | 2048×2048 RGBA | ~396 KB | Props atlas: the existing painted storefronts (`assets/art/storefront-atlas.webp`, downscaled to 1024²), upper floors, giwa roof, eave, dancheong, wood, lacquer, stone, carved balustrade / stair relief, paper and demon lanterns, neon signs, banners, tarps, blossoms, petals, floor seal, glow / flame / ring / swirl / streak sprites, crates, jars, barrels, gate plaque |
| `march-stone.webp` | 1024×1024 RGBA | ~259 KB | Top half: wet flagstones (4 m × 2 m tile, alpha = wetness). Bottom half: ashlar (alpha = grime). World-space triplanar in the floor shader |
| `march-sky.webp` | 2048×512 RGB | ~95 KB | Skyline band cropped from `assets/gen/sky.jpg` (moon and corner sparkle removed), mirror-tiled around the horizon |
| `atlas.json` | — | ~2 KB | Named pixel rects inside `march-props.webp` |

Glyphs are generic Korean words (떡볶이, 포장마차, 국수, 노래방, 호떡, 야시장, 달빛시장, 분식 · 오뎅, 밤의 골목) and 魂門 on the gate plaque; no brand names.

Regenerate: `python3 game/scripts/march-art/paint_atlas.py`, then bump `VERSION` in `march-art.js`.
Screenshots: `game/scripts/march-art/report_shots.sh` (needs a static server at the repo root, port 8766 by default) writes `game/design/march-art/`.
