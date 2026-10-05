# v2 mockup source

Static mockups for the two v2 directions (`a.html` = A 即時航網, `b.html` = B 航空大亨). They are reference only; nothing on the live game uses them.

- Serve the repo root (`python3 -m http.server <port> --directory /Users/ivanchang/tools`) and open `/games/airline/design/mockup-src/a.html` or `b.html`. They import three.js from `/game/lib/` and the aircraft from `/games/flight/`.
- `globe.js`: the textured three.js globe, great-circle arcs, plane sprites and number formatting used by both mockups. It is a good starting point for v2.
- `sim_A.json` / `sim_decade.json`: real model output used for the numbers on screen (A: 一年 mode, month 5 from Taipei; B: 十年 mode, year 4 summer, the oil-shock season). `simA.mjs` regenerates them: `node simA.mjs`. `cities.json` is a city subset.
- `tex/`: Blue Marble NG 4k, Black Marble 2016, and land masks rasterised from Natural Earth 50m. See `../LICENSES.md`. Check the Black Marble credit wording before shipping.
