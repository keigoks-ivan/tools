# HUNTR/X hero assets

The body, face, garments, hair and weapons are authored by `game/hero-model.js` and exported offline by `game/scripts/build_hero_assets.mjs`. These are skinned 3D surfaces, not portrait billboards. The skeleton and 13 animation clips reuse the existing repository Maria / Mixamo-derived asset; their provenance and terms remain those of that source. No new third-party character mesh or image texture is included.

| Asset | Bytes | Vertices | Triangles | Surfaces | Clips |
|---|---:|---:|---:|---:|---:|
| Rumi | 1,774,264 | 13,997 | 22,114 | 4 | 13 |
| Mira | 1,773,848 | 13,986 | 22,154 | 4 | 13 |
| Zoey | 1,727,824 | 13,361 | 20,786 | 4 | 13 |

Each surface shares the same 65-joint order; cloned skeletons are consolidated in the game. These counts exclude runtime outlines and weapon glow passes. Hair uses mixed head/spine/hips weights, not simulated strands. Expressions and new motion capture are not included.

The game preloads Rumi only and loads Mira/Zoey on selection. No runtime procedural build or texture decode is required for these models. Source Maria remains in the repository for rebuilding; its 7,896,492-byte runtime file is no longer downloaded by the main game startup.
