# Asset licences — SKYGLAZE v2 mockups

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
