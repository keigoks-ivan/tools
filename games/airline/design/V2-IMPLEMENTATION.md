# 天青航空 v2 — 2026-10-05

Implemented direction A, with B’s hub facilities and scenario challenges. Scope is confined to `games/airline/`.

## Decisions

- The owner explicitly requested actual aircraft, overriding the handoff’s fictional-brand rule. Player-facing types are ATR 72-600, Embraer E190, Airbus A320neo, Airbus A321LR, Airbus A350-900 and Boeing 777-300ER. Internal MQ keys remain for existing saves and calibration. Aircraft illustrations are schematic; range, cabin capacity and economics remain simplified game profiles, described on the fleet and sources pages.
- The owner asked for a game-like interface and a large art upgrade. The main screen now has a complete 3D globe, blue cockpit frame, flight trails, airport queues, per-flight estimated profit receipts, boarding-pass route cards, an interactive airport workshop, route-opening feedback and achievements derived from settled results.
- Music was requested with chords and a mute test. `ui-music.js` contains an original 16-bar, 76 BPM electric-piano composition, seventh/ninth/thirteenth chords, soft bass and a chord pad. It renders once into a seamless local loop after a user gesture. It starts muted, fades out before suspending, supports replay and suspends in the background. No sound files or third-party requests.
- The handoff’s scoped Git workflow takes precedence over CLAUDE.md’s broad `git add -A` example. Only airline files are staged and committed.

## Gameplay and accounting

The deterministic model runs exactly once per turn. Playback takes 60 seconds for a month, 90 seconds for a season, with pause, 1×/2×/4× and direct settlement. Current routes and economic results are frozen during playback. Edits are queued for the following turn. Modals and hidden tabs suspend the simulation clock. Saves include current playback and queued plans; old saves migrate and resumed flights start paused.

Maintenance depot: $6M construction, $25k/month operations, 10-year depreciation, maintenance −30%. Lounge: $3M, $22k/month, 10 years, business appeal +8% for full service only. Fuel storage: $2M, $10k/month, 10 years, prebuy three months of 30% of unhedged fuel. Upfront fuel cash is not charged again when consumed. Costs, appeal and capacity are design values; only maintenance −30% follows the AirTycoon 4 reference.

Scenarios: open skies, 3.9% first-year profit, five-route connecting hub with 5% cumulative transfers, and ten-year shock survival. Progress uses settled results; achievement stamps grant no economic bonus.

## Verification

- `node --test games/airline/model.test.mjs games/airline/v2.test.mjs`: 69 tests, including the unchanged 63 base tests. Base sensible strategies retain the +3…+8% calibration at every hub/mode; naive and idle checks remain. Optional all-facility stress tests allow +1…+12%, since facilities are additional investments, and require positive cash. Optional facilities are not represented as unchanged base calibration.
- `tests/browser-v2.py`: isolated Chrome, 1280×800, 390×844, 844×390 and dark scheme; route editing, frozen current results, speed and pause, saves/resume, queued facilities, both languages, source credits, fallback and corrupted saves. A low-cost event choice and subsequent fleet-panel changes are checked against the actual operating model. Full sensible Taipei/year and Singapore/decade runs and a naive Taipei/year run.
- `tests/play-v2.py`: all 31 destinations other than the chosen hub, opening feedback, interactive facility selection/planning, achievements; actual Web Audio output, default silence, mute, replay and background suspension at all four viewport/theme variants.
- Local textures only; mobile uses 2K, desktop 4K. The globe has two WebGL draw calls and about 20k desktop triangles, caps pixel ratio and sampled aircraft, and stops repainting when paused. SVG fallback retains every management feature.
- Detailed measurements and final screenshots accompany this note. A real touch phone has not been tested. Headless SwiftShader frame cadence is a software-rendering measurement, not proof of the 60 FPS real-phone target.

Final moving-network stress check (31 routes, sampled aircraft): Apple M4 / headless Chrome Metal averaged 16.67 ms per frame, p95 16.80 ms (about 60 FPS); the 2D overlay averaged 1.21 ms. SwiftShader software rendering averaged 40.00 ms, p95 50.10 ms. The measured first-play resource payload is about 3.0 MB decoded on desktop and 2.2 MB on mobile, below 8 MB. These are local machine measurements; real-phone 60 FPS remains unverified.

Scenario feasibility was checked in the economic model at TPE: first-year seed 1 with a five-aircraft strategy, network seed 1 with a twelve-aircraft budget, and resilience seed 7 with a nine-aircraft budget all met their respective final goals. Full browser playthroughs ended at +3.97% (Taipei/year), +6.61% (Singapore/decade) and −44.27% (naive Taipei/year), with each route’s explanation visible.

Release cache version: 15. Changed modules and new image assets carry the same version, so cached pre-deployment responses do not mix with the release.

Machine-readable results: `v2/verification.json`. Final screenshots: `v2/screenshots/`.

## Airport illustration

Mode: built-in OpenAI imagegen, new image, transparent background. Saved project asset: `games/airline/art/v2/airport.webp` (1536×1024). Generation prompt:

```text
Use case: stylized-concept
Asset type: original airport diorama illustration for the SKYGLAZE airline management game's interactive hub screen.
Primary request: a beautiful, playful miniature airport that feels like a premium cozy strategy game, with satisfying toy-like 3D detail.
Scene: an isolated isometric airport on a low rounded rectangular island base, transparent background. A modern white and pale-blue terminal with curved glass facade and two jet bridges in the upper middle, a charming control tower on the upper left, a navy runway diagonally across the foreground, two pale sky-blue Airbus A320neo-shaped passenger aircraft with ink-navy engines and delicately cracked porcelain blue tails, one parked at the terminal and one taxiing, miniature blue airport buses and baggage carts, tiny trees and warm yellow runway lights. Leave some open paved space on the right side of the airport for future facility overlays.
Style: polished 3D miniature clay and porcelain render, crisp silhouettes, excellent material detail, friendly rounded architecture, sophisticated mobile game art. Clear recognizable aircraft proportions, no faces.
Composition: wide 3:2 canvas; all island edges and aircraft entirely inside the frame with generous transparent padding; isometric camera looking down around 35 degrees; scene reads well at 340px wide.
Lighting: soft sunny morning, delicate ambient shadows, warm inviting highlights.
Palette: pale sky blue #D6E6F4, porcelain off-white #F7F6F2, medium blue #6E9CCB, ink navy #1E3550, a few small warm gold accents.
Constraints: genuinely transparent surrounding background; original invented airport architecture; no manufacturer logos, no lettering, no text, no watermark, no UI buttons or interface.
```

## Release 16 — global airport expansion

180 airports, up from 32. Added 148 destinations including Taiwanese regional airports, Japanese regional cities, China, Southeast Asian islands, South Asia, Europe, North and Central America, South America, Africa and Oceania. The five selectable home hubs stay compatible with existing saves. Phnom Penh uses Techo (KTI); no duplicate metropolitan airports were added. New codes/coordinates were checked against the 2026-10-05 OurAirports snapshot (public domain), with the source URL and CSV hash in `LICENSES.md`.

The destination picker searches Chinese/English names and airport codes, filters seven regions, optionally filters by the mode's available aircraft range, and lists nearer airports first. Airports outside range remain inspectable and clearly labelled. The route editor still enforces actual aircraft range; a regional route can use ATR 72-600.

Demand remains a game model. New effective aviation catchments use 65% of approximate metro/island population, a participation assumption rather than a census or measured passenger statistic. Business/leisure appeal, seasons, fees and slot flags are design inputs. Existing yield calibration was adjusted at NRT (1.100/1.150), DXB (1.204/1.200) and ZRH (1.250/1.221), with year/decade order. TPE and SIN values are unchanged. No profit bonuses, event changes or relaxed calibration assertions were introduced.

Verification: all 72 Node tests pass, including all original 69 tests and three catalog/range/operation tests. New forecasts were checked for every city from every hub and mode; the same new regional route settles identically after saving. Base sensible seed-1 margins range from 3.83% to 7.34%, with positive cash. All three challenges remain attainable. Isolated Chrome checks cover 1280×800, 390×844, 844×390 and dark mode, seven region filters, trimmed Chinese/English/code searches, empty results, range filtering, a new regional route, save/resume, settlement and English UI. All 148 new route editors were visited on desktop with no errors. Full Taipei/year, Singapore/decade and naive playthroughs pass, as do the existing queued-edit and SVG-fallback checks. The queued-edit check selects a current bot route because the expanded planner may choose a different network. Cache version is 16. Evidence and screenshots: `v2/cities/`.

## Release 16 — cute art and aircraft selection

The owner requested a cuter game and clearer range/capacity numbers. The main UI now uses powder blue, mint and cream surfaces, round cards, a soft cloud background, and an original miniature airplane mascot. The first mascot was replaced at the owner's request; the selected alternate is `../art/v2/mascot.webp`, a 512×512 transparent WebP (about 22 KB). Original generated source: `/Users/ivanchang/.codex/generated_images/01a10bbf-ec35-7531-98ed-0a265201a3da/exec-fbc3a013-5a36-4957-bd53-bbffcbac1ba4.png`. Generation mode: built-in OpenAI imagegen, new image, transparent background; copied and re-encoded with alpha preserved. Original artwork, no manufacturer assets. It appears on the opening screen, map, onboarding and aircraft guide. Reduced-motion preferences disable its float animation.

All six aircraft have a guide with maximum range and seats per one-way flight. The fleet and route editor show the same large numeric specification tiles. A selected route compares its distance to the aircraft range and shows spare range or shortage in kilometers. The guide prioritizes aircraft that reach the selected route and indicates aircraft restricted to Ten Years. Full-service and low-cost capacities follow the current chosen business model. These are the existing game profiles, with no economic changes. Seats are capacity, not a demand prediction; the guide explicitly explains this distinction and simplified profiles.

`tests/aircraft-browser.py` verifies every aircraft's displayed range/seats, Taipei–Los Angeles range matching, traditional/low-cost seat changes, default mute, English strings and all four viewport/theme variants. It checks that the Year mode offers Airbus A350-900 for LAX, marks Airbus A320neo out of range in the guide, and shows 320/370 seats for A350-900 when switching model. Evidence: `v2/cities/`.

Final local Chrome/Metal moving-network check: 8 and 169 route overlays both averaged 16.67 ms per frame, with p95 16.70/16.80 ms; 181 frames were actually painted in each measurement. The sampled plane budget remains 48 desktop / 18 mobile and the globe still uses two draw calls. Actual audio output was measured again: RMS 0.0189 while playing, 0 after mute, with suspended AudioContext. Concurrent SwiftShader stress tests were much slower (about 158 ms per frame), so software-rendering results are not evidence for real-device 60 FPS. First-play decoded resources remain around 3.1 MB. Real-phone performance is unverified. These results and scenario/calibration checks are in `v2/cities/verification.json`.

Final selected mascot prompt:

```text
Use case: stylized-concept. Asset type: a new alternate transparent mascot for SKYGLAZE, a cute cozy airline management game. Primary request: a distinctly different adorable miniature airplane mascot, super-deformed rounded toy proportions, a very short plump pill-shaped fuselage with tiny rounded swept wings and two small navy cylindrical engines, a little upright blue tail fin. Front three-quarter view facing slightly left, with wings stretched to each side in a cheerful welcoming pose. Face: two small simple shiny dark dot eyes visible through a single soft teal cockpit windshield, a tiny gentle curved smile on the round nose, small peach blush dots. Avoid huge human eyes, eyebrows, a large mouth or a realistic car-like face. Style: soft matte clay and velvety porcelain toy, Japanese cozy game visual feeling, charming and clean, tiny airliner character rather than a realistic aircraft. Very round silhouette, pale powder-blue body, mint-blue wing tips, navy engine interiors, small warm ivory highlights. A tiny puffy white cloud under and slightly behind the plane, no floor, no shadows on an opaque background. Composition: centered square icon illustration, entire airplane and all wings comfortably inside frame with wide clear padding, clearly readable at 72px. Lighting: bright soft diffused daylight, subtle ambient occlusion, no metallic reflections. Constraints: genuinely transparent background, no text, no logos, no watermark, no extra characters or scenery. Original invented friendly passenger airplane character.
```
