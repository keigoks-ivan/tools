# Painted storefront atlas

`storefront-atlas.webp` is a production texture generated with the built-in
image_gen tool on 2026-09-23. It is a 2 × 4 grid of eight storefronts shared by
the existing 24 storefront planes. No additional meshes, lights or render passes
are needed. The game loads it only while preparing stage one; failure keeps the
original procedural storefronts.

The tool returned a 1254 × 1254 PNG (2,659,678 bytes), despite the requested
1024-square size. The runtime WebP is lossless, retains all 1254 × 1254 pixels,
and is 1,738,638 bytes. Decoded RGB bytes were compared with the source PNG.
Each panel has more texels than the original 512 × 256 facade; a two-pixel UV
inset avoids neighboring panels at edges. Base-level RGBA texture storage falls
from 12,582,912 bytes (24 individual textures) to 6,290,064 bytes (one atlas),
before mipmaps. This is texture storage, not a claim about whole-game memory.

The original generated PNG remains in the local generated-images output;
this lossless WebP is also a full-resolution archival representation.

## Generation prompt

Production texture asset for a refined anime-style Seoul neon action game. Create exactly one SQUARE 1024 x 1024 pixel texture ATLAS composed of exactly TWO equal columns and FOUR equal rows: 8 rectangular storefront panels, each 512 x 256 pixels, edge-to-edge grid with no gaps, no borders, no panel labels. Every panel is a perfectly straight front-facing ORTHOGRAPHIC flat storefront facade (a diffuse color texture to map onto a plane), not a perspective scene. Each storefront fills its whole rectangle with facade only: no pavement, no sky, no people, no vehicles, no exterior protruding furniture or hanging objects crossing panel boundaries. Visually intricate but clean hand-painted anime background aesthetic, navy/charcoal frames, restrained warm gold interior windows and muted magenta/cyan accent strips, believable painted depth and interior shelves. A coherent set of eight variants: cozy cafe, noodle shop, music store, record shop, small convenience store, bookshop, herbal shop, late-night bakery. Include upper awning/fascia, framed windows, side entrance door, fine painted material details and subtle contact shadows in each. No readable letters, no logos, no text, no watermarks, no excessive neon haze, no photographic realism. Medium-dark overall so game characters and sword effects remain dominant. Soft interior light is painted into image rather than floodlighting. Precise 2-column by 4-row grid is essential. Match a polished contemporary anime fantasy night market.
