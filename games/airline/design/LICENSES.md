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
