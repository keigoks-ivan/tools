# SKYGLAZE v22 — colourful game artwork

Generated on 2026-10-06 using **built-in OpenAI imagegen**, in generate mode. No CLI, API key, stock photographs, manufacturer models or third-party airline marks. Production files are local WebP re-encodings of the selected outputs; aircraft/facility alpha is preserved. Original PNGs remain in `/Users/ivanchang/.codex/generated_images/01a10bbf-ec35-7531-98ed-0a265201a3da/`.

| Production asset | Purpose | Dimensions | Bytes |
|---|---|---|---|
| `../../art/v4/coast.webp` | Shared illustrative coastal backplate | 1536 × 1024 | 288576 |
| `../../art/v4/aircraft.webp` | Six aircraft-family portraits, 3 × 2 atlas | 1536 × 1024 | 261950 |
| `../../art/v4/facilities.webp` | Maintenance/lounge/fuel/tower, 2 × 2 atlas | 1536 × 1024 | 391646 |
| `../../art/v4/cities.webp` | Regional travel illustrations, 3 × 3 atlas | 1254 × 1254 | 472122 |

The aircraft portraits are artistic interpretations. Real type names, simplified seats and range are rendered separately from the existing catalog. Regional scenes illustrate their region, rather than each of the 180 cities. All bases share one stylised airport; it is not a replica of the chosen airport. The first seven travel cells are used for the seven regions; two alternate scenes are retained in the atlas. The tower portrait is retained for future dispatch art; the three real facility cards use their own portraits.

The new game controls and airline crest are original SVG in `../../ui-premium-art.js`. The playable airport remains original procedural geometry, with coloured roof districts, pink ornamental trees, sand shelves, rock clusters and a small locally drawn sky reflection. Globe clouds are a still mathematical shader effect, with no extra texture/draw call. NASA/Natural Earth and three.js credits remain in `../LICENSES.md`.

## Final prompts

### coast

Original PNG: `exec-1a6d3c1a-0628-4a35-8363-4a748c761da9.png`.

```text
Use case: stylized-concept.
Asset type: a production environment backplate for SKYGLAZE, a cute but richly art-directed airline management video game. Landscape 1536x1024.
Primary request: a beautiful coastal aviation world at golden hour, premium stylized 3D game environment art, much richer than simple low-poly blocks.
Scene: blue and lavender sky with soft sculpted cumulus clouds, warm peach sunlight at the left horizon; far-off rounded green and purple coastal hills and a tiny varied-color seaside city with coral, cream and blue roofs along the distant horizon. Lower 65% is open shimmering turquoise and deep-blue coastal water, with gentle wave highlights and a restrained warm reflection, leaving the entire central foreground water free for an interactive 3D airport island to be rendered over it.
Composition: elevated three-quarter camera looking across the sea, low horizon around the upper third, spacious clear center and foreground. Detailed scenery concentrated at far edges and horizon. No airport, runway, aircraft or buildings in the foreground; no island in the center.
Style: premium cozy videogame 3D illustration, sculpted shapes, velvet greenery, clean glossy ceramic accents, sophisticated atmospheric depth, crisp but soft edges. Rich varied colors: azure, sea teal, lavender, peach, warm golden cream, emerald foliage. Calm and joyful.
Constraints: environment only, no UI, no lettering, no numbers, no branding, no watermark, no photorealism, no frames. This is original decorative scenery, not a real place.
```

### aircraft

Original PNG: `exec-b707eed6-854e-414f-a770-b3360289df7e.png`.

```text
Use case: stylized-concept.
Asset type: transparent production sprite atlas for six aircraft portraits in the SKYGLAZE airline management videogame.
Primary request: one single meticulously aligned sheet of SIX isolated aircraft miniatures, exactly three equal columns by two equal rows on a genuinely transparent background, landscape 1536x1024. Every cell has a centered complete aircraft, full wings and tail visible, 12% clear padding, no overlap between cells, no cell borders, no shadows on opaque rectangles. Identical elevated front-left three-quarter camera in all six cells, nose facing lower left, tail upper right.
Required order reading left to right:
Top left: ATR 72-600 style high-wing short twin turboprop, visibly two propellers and a T-tail.
Top middle: Embraer E190 style slim regional jet, low wings, two underwing turbofans, conventional tail.
Top right: Airbus A320neo style short narrowbody jet, two underwing turbofans and upward winglets.
Bottom left: Airbus A321LR style visibly longer narrowbody, same two turbofans and winglets.
Bottom middle: Airbus A350-900 style long elegant widebody, gently curled wing tips, two large underwing turbofans.
Bottom right: Boeing 777-300ER style longest broad widebody, two very large turbofans, raked wing tips.
Art direction: premium cute videogame aircraft collectibles; credible aircraft-family silhouettes with round sculpted forms, full modeled nacelles with dark fan intakes, inset cockpit glazing, fine cabin windows, subtle panel lines and landing gear. Pale azure and warm porcelain-white airline livery, navy engines, blue tails with subtle cracked-porcelain decoration and small teal and warm gold accents. No anthropomorphic faces.
Lighting: soft warm studio key, cool blue rim, believable soft contact shadow underneath each isolated miniature, detailed reflective glazing and porcelain materials. All six are original artist interpretations, no manufacturer logo or real airline marks.
Constraints: true transparency, EXACTLY six objects arranged 3 by 2; no text, no captions, no numbers, no UI, no watermark, no extra planes. Keep every silhouette fully within its own equal rectangular cell.
```

### facilities

Original PNG: `exec-530c27be-47a0-437c-a2ca-4267fb47bb80.png`.

```text
Use case: stylized-concept. Asset type: production game facility portrait atlas. Create one landscape 1536x1024 image divided into exactly 2 columns by 2 rows, equal 768x512 cells. Four separate complete miniature airport buildings, elevated front-left three-quarter view, each centered within its own cell with 12% clear padding. Top left: coral orange maintenance hangar with blue metal curved roof, open door showing a tiny white and azure jet, workshop equipment. Top right: lavender purple and cream premium lounge with teal glass, warm gold rooftop garden and pink flowers. Bottom left: mint teal fuel depot with three silver cylindrical tanks, gold pipes, coral service truck and safety railings. Bottom right: cute azure control tower with rounded cream shaft, purple observation glass, radar and gold lamps. Premium cozy videogame 3D art, rounded crafted geometry, ceramic and painted metal textures, warm key light, crisp bevels and subtle soft contact shadows. Varied colorful palette azure, coral, lavender, mint and gold. Fully transparent background with genuine alpha, no scene floor, no frames, no text, labels, logos, numbers, UI or watermark. Every object must remain wholly inside its own equal grid cell.
```

### cities

Original PNG: `exec-c7ec42a7-83e1-4d28-a8f3-98d771a92d23.png`.

```text
Use case: stylized-concept. Asset type: production videogame regional travel postcard atlas. One square 1536x1536 image precisely divided into 3 columns by 3 rows of equal 512x512 tiles, no borders or gutters. Each tile is a colorful premium cozy 3D toy-diorama destination scene, complete composition contained in its own tile, clear readable silhouette at thumbnail size. Top row: 1 East Asian city with red temple, cherry blossom and blue mountain; 2 Middle Eastern desert city with gold domes, violet modern towers and turquoise oasis; 3 European city with cream old buildings, Eiffel-like tower, lavender sky and coral cafe. Middle row: 4 North American coastal metropolis with pastel downtown, palm trees and turquoise bay; 5 South American colorful hillside city with vivid coral yellow houses, green mountains and blue sea; 6 African coastal city with flat-topped mountain, golden landscape, cream waterfront and bright turquoise sea. Bottom row: 7 Oceania harbor with white shell-shaped opera building, teal sea and coral flowering trees; 8 tropical Asian garden city with green terraces, purple sky and gold lights; 9 European alpine village with snow peaks, coral chalets and violet lake. Original artistic regional vignettes, not exact aerial maps. Sculpted detailed miniature geometry and tactile materials, warm sunlight, abundant varied azure coral lavender mint warm gold colors. No lettering, text, captions, UI, numbers, logos or watermark anywhere.
```
