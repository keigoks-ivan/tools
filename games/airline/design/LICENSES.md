# Asset licences — SKYGLAZE v2 mockups

## Release 19 — twilight game environment (2026-10-06)

- `../art/v3/airport-dusk.webp` (1536×1024) and `airport-dusk-mobile.webp` (768×512): original environment art generated with the built-in OpenAI imagegen tool for this game, then resized/re-encoded as WebP. No third-party photos, airline logos or manufacturer artwork were used. The shared scene illustrates SKYGLAZE’s home airport; it does not reproduce each real airport. Final prompt and generation mode: `V2-IMPLEMENTATION.md`, release 19.
- `../ui-scene.js` and `../style-game.css`: original orbital scenery, airport lighting accents and game interface. System fonts only; all assets remain local.
- `../globe-shaders.js`, `FRAG_GAME`: original twilight styling of the existing local NASA Blue Marble and Natural Earth textures; the source credits below continue to apply.

| File | What | Source | Licence / terms | Credit line |
|---|---|---|---|---|
| tex/bm_full.jpg (5400×2700), tex/bm_4k.jpg (4096×2048, resized) | Blue Marble: Next Generation, August, with topography and bathymetry | https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ (file: assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/august/world.topo.bathy.200408.3x5400x2700.jpg) | NASA content is generally not subject to copyright in the US; the NASA media guidelines name texture maps, computer graphical simulations and web pages as allowed uses, ask that NASA be acknowledged, and forbid implying NASA endorsement (https://www.nasa.gov/nasa-brand-center/images-and-media/). The BMNG page asks: "Anyone using or republishing Blue Marble: Next Generation please credit NASA Earth Observatory." | "Earth imagery: NASA Earth Observatory (Blue Marble: Next Generation, Reto Stöckli)" |
| tex/blackmarble.jpg (3600×1800) | Earth at Night, Black Marble 2016 colour map (0.1°) | https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg (Visible Earth record 144898) | Same NASA media guidelines as above | "Night lights: NASA Earth Observatory (Black Marble 2016, Suomi NPP VIIRS)". Check the exact credit wording on the Visible Earth page before shipping; I did not read it this session. |
| tex/ne_50m_land.geojson, tex/ne_50m_admin_0_boundary_lines_land.geojson | Natural Earth 1:50m land and country borders | https://github.com/nvkelso/natural-earth-vector (geojson/) | Public domain (Natural Earth terms of use) | Optional: "Made with Natural Earth" |
| tex/mask_8k.png, tex/mask_4k.png | Land / coastline / border mask rasterised by us from the Natural Earth files above | derived | Public domain input; our derivative | — |
| tex/hero.webp | Our own render of the SKYGLAZE MQ-320 jet | games/airline/art/hero.webp | Ours | — |
| lib/aircraft.js, lib/aircraft.light.js | Our flight-sim aircraft models (procedural three.js) | games/flight/ | Ours | — |
| lib/three.module.js | three.js | game/lib/ | MIT | — |

Fonts: system fonts only (PingFang TC, Songti TC); nothing downloaded.
Game data (cities, aircraft, simulated numbers): from the game's own data.mjs / model.mjs (sim_A.json, sim_decade.json, cities.json were produced by running the model; nothing external).
No runtime fetches to third parties: every file above is local and can be committed to the repo.

## Production v2 assets (2026-10-05)

- `../art/v2/earth-2k.webp` and `earth-4k.webp`: resized/re-encoded from the Blue Marble NG August texture listed above. Credit: **NASA Earth Observatory (Blue Marble: Next Generation, Reto Stöckli)**. The [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) and [dataset credit](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/) were read on 2026-10-05. These are educational texture maps; no NASA identifiers, people or endorsement are used.
- `../art/v2/land-2k.webp` and `land-4k.webp`: resized/re-encoded from the Natural Earth 50m land/coast/border mask listed above. Public-domain source, original rasterisation.
- `../art/v2/sprite.webp`: original three.js renders of the repository’s procedural SKYGLAZE aircraft in its blue porcelain livery. Schematic artwork; not a manufacturer photo or certified model.
- `../ui-art-v2.js`: original SVG aircraft-family silhouettes and isometric facility illustrations. Real aircraft names identify the selected economic profiles; all silhouettes are schematic.
- `../globe-shaders.js`: original porcelain-coloured shader adapted from our mockup renderer.
- `/game/lib/three.module.js`: three.js, MIT (existing repository distribution).
- `../art/v2/airport.webp`: original miniature airport illustration generated with the built-in OpenAI imagegen tool on 2026-10-05, then re-encoded as WebP with its transparency preserved. No third-party photo, airline logo or manufacturer artwork was used. The final prompt and generation mode are recorded in `V2-IMPLEMENTATION.md`.
- `../ui-play.js`: original SVG challenge icons and game UI artwork.
- `../ui-music.js`: original 16-bar chord progression, melody and synthesized instruments. No samples, recordings or external music are loaded. Web Audio renders a looping buffer only after the player enables music; default is mute.
- Production v2 does **not** load Black Marble, and makes no runtime requests to NASA or any third party. Textures and fonts are local/system resources.

## Airport catalog expansion (release 16)

`../art/v2/mascot.webp`: original alternate miniature airplane character generated with the built-in OpenAI imagegen tool, selected after the owner requested a different mascot. Re-encoded to transparent 512×512 WebP. No external photo, logo or manufacturer artwork. Final prompt, mode and original source path are recorded in `V2-IMPLEMENTATION.md`.

New airport codes and coordinates in `../data.mjs` were checked against the [OurAirports public-domain dataset](https://ourairports.com/data/) downloaded on 2026-10-05. Only the selected airports' fields are baked into the game; there is no runtime data fetch. Source CSV SHA-256: `1baffe51282f40a192490ff27654309dd9252e9dafd7a179f69b2f4fa96a75af`. Names are local translations, and all catchment, appeal, season, fee and slot assumptions are game design values. OurAirports releases its data to the Public Domain and does not guarantee accuracy. Phnom Penh uses the current Techo airport (KTI), checked against [the operator's airport opening notice](https://www.techoairport.com.kh/news/kti-inauguration-ceremony).
## Dispatch and passport artwork (release 18)

`../ui-career.js`: seven original inline SVG regional postcards, created directly for this game. They use schematic skylines, mountains, coastlines and architecture, with no external photographs, manufacturer artwork or third-party illustrations. Airline emblems, XP meters, passport stamps and mission cards are original HTML/CSS/vector artwork. No new bitmap downloads or external runtime resources.

## v20 interactive airport (2026-10-06)

`../ui-airport.js` builds the main airport directly from original procedural geometry: a rounded miniature island, terminal and jet bridges, tower, three facilities, runway markings/lights, trees, clouds, vehicles, passengers and simplified aircraft. No new raster assets, manufacturer models or external runtime services are used. Aircraft shapes are schematic, with distinct regional/turboprop/narrowbody/widebody dimensions; actual type names and simplified range/capacity come from the existing catalog. All 180 bases share this illustrative scene. Geometry and the game shell are original project code, redistributable with the repository. three.js remains MIT licensed. The pre-existing v19 OpenAI-generated airport illustration is retained only for the no-WebGL fallback; its credits and prompt above remain applicable.

## v21 detailed miniature airport (2026-10-06)

`../ui-airport-art.js` adds original bevelled architecture, vaulted terminal roofs, window reflections, skylights, segmented jet bridges, an observation tower, landscaped gardens, ground markings and six schematic aircraft silhouettes. Facility construction plots, scaffolding/cranes and complete buildings follow the real planned and built state. Signage (SKYGLAZE, the selected IATA code, runway/gate numbers and facility abbreviations) and a soft contact-shadow texture are drawn locally with Canvas, without fonts or image downloads. `../ui-airport.js` supplies original materials, lighting, parked/animated aircraft, buses and baggage carts. These new assets are original project art, redistributable with the repository; no manufacturer meshes or logos are used. Airports still share an illustrative miniature rather than replicas of real terminals. Existing three.js MIT and v19 fallback-image credits remain applicable.

## v22 whole-game colour and art (2026-10-06)

`../art/v4/coast.webp`, `aircraft.webp`, `facilities.webp` and `cities.webp`: original artwork generated with the **built-in OpenAI imagegen** tool, selected for this game and re-encoded as local WebP. Aircraft/facility alpha is preserved. These are original artistic interpretations, with no manufacturer meshes, photos, airline logos or downloaded city photographs. Aircraft names and numeric profiles come separately from the existing catalog; the pictures are not certified technical drawings. Regional postcards are shared regional illustrations, not photographs of individual airports. All bases share an illustrative coastal airport. Exact final prompts, original PNG paths, production paths, dimensions and generation mode are in [the v22 art manifest](v2/PREMIUM-ART.md).

`../ui-premium-art.js` and `../style-premium.css`: original SVG controls/crest, atlas presentation and varied azure, coral, lavender, mint and gold game palette. `../ui-airport-art.js` and `../ui-airport.js`: original colour districts, ornamental trees, sand shelves, rocks, tapered miniature fuselages and a small local Canvas sky reflection. `../globe-shaders.js`: original colour/cloud styling, retaining the existing local NASA/Natural Earth textures and their credits above. No new third-party runtime requests, fonts, music samples or commercial art. Existing three.js MIT terms apply.
