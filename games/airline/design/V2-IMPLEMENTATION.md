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
