# Handoff: 天青航空 SKYGLAZE airline game, v2 redesign

For: Codex (or any coding agent) taking over the redesign of the airline management game.
Repo: `github.com/keigoks-ivan/tools` (local checkout `/Users/ivanchang/tools`). Game folder: `games/airline/`.
Live: https://tools.investmquest.com/games/airline/ (GitHub Pages; a push to `main` is live in about 1–2 minutes).
Written 2026-10-05 by Claude Code (coordinator session). The current version is live and works; this document hands over the next step.

---

## 1. What the owner wants (verbatim, then meaning)

- Original goal: 「可以簡化經營的難度。但是要可以玩完就知道大概航空公司是怎樣獲利或大概要怎樣經營。」
  Meaning: a simplified, educational airline management game. After one playthrough, a non-expert understands roughly how an airline makes or loses money.
- New request (2026-10-05): 「航空公司這個的玩法要再更有趣，畫面要變厲害很多。Airline Manager 4、Fly Corp、AirTycoon 4 都可以參考。」 Then: 「AirTycoon 4 也要參考。」
  Meaning: make it **much more fun** and the visuals **much more impressive**. Use all three games as references, and use AirTycoon 4 just as much as the other two.
- The owner reads Chinese and is not a programmer. Any choice you put to them should be short and in Chinese, with at most two options plus your recommendation, shown as pictures where possible. They have said 「直接給我看圖片」 (just show me the pictures).

## 2. Decisions already made (do not re-open them)

| Topic | Decision |
|---|---|
| Name | 「天青航空」, English **SKYGLAZE** (not "Tianqing", not "Celeste": a real French airline called Céleste exists) |
| Palette | Blue. `--sky #D6E6F4`, `--blue-l #A9C9E8`, `--blue #6E9CCB`, `--blue-d #2F5D8C`, `--navy #1E3550`, off-white `#F7F6F2`, warning cinnabar `#B5533C`. Elegant serif CJK headings ("Noto Serif TC", "Songti TC", "PMingLiU", serif), clean sans for numbers |
| Aircraft look | Livery "1A": whole body pale sky-blue gradient, tail with a porcelain crackle network, ink-navy engines, 「天青航空」 + SKYGLAZE wordmark. The same airline flies in the flight sim `/games/flight/`, whose 3D models you can reuse (§6) |
| Hubs | Player picks from 5: 台北桃園 TPE (default), 東京成田 NRT, 新加坡 SIN, 杜拜 DXB, 蘇黎世 ZRH |
| Modes | 「一年」 = 12 turns of 1 month. 「十年」 = 20 turns of half a year (IATA summer/winter season). Both must be selectable. If you move to real-time play, keep a short and a long mode with the same meaning |
| Aircraft family | Fictional MQ types: MQ-72 turboprop, MQ-190 regional jet, MQ-320 narrowbody, MQ-321 long-range narrowbody, MQ-350 widebody, MQ-400 large widebody. Never use real brand names |
| Teaching | Keep per-route profit/loss with one plain-language Chinese sentence saying *why*, load factor vs break-even load factor, the cost breakdown, the 3.9% industry margin line, scripted lesson events, the end report card, and the 「資料來源」 sources page |
| Language | Chinese default, English toggle. Every string goes through `tr(zh, en)` |

## 3. Current state: what exists and works

Commits: `1eba8a3` (game), `bd4a0ee` (hero art from the 3D jet). About 3,000 lines of JS.

| File | Role |
|---|---|
| `model.mjs` | Pure, deterministic economic model (seeded; no DOM). Exports `newGame({mode, hub, seed})`, `routeOptions(state, city)`, `fleetNeeded`, `estimateRoute(state, city, type, weekly, fare)`, `applyDecisions(state, decisions)` (never throws; returns `{state, errors}`), `pendingEvents`, `simulateTurn(state)` → `{state, report}`, `endReport`, `serialize`/`deserialize`, plus helpers `distanceKm`, `refFareMid`, `blockHoursFor`, and `_internals` |
| `data.mjs` | `MODES`, `HUBS`, `CITIES` (32), `AIRCRAFT` (6), `EVENTS` (9 year / 15 decade), `LESSONS`, `GLOSSARY`, `AIRLINE`, `CONST`, `HUB_WEATHER`, `RIVALS` (輕羽航空 LCC, 雲錦航空 full-service) |
| `sources.mjs`, `SOURCES.md` | Real-world numbers with status `verified` / `secondary` / `design` and links (IATA, lessor rates, Ryanair FY25, airport fees…) |
| `bots.mjs` | `sensibleBot`, `naiveBot`, `idleBot`, `play()`, `summarise()`; used by the tests |
| `model.test.mjs` | 63 tests. Determinism, serialize round-trip, every hub × mode calibration (sensible +3…+8% margin with positive cash; naive ≤ −10% or bankrupt; idle loses slowly), each event moves its metric the right way, cost shares within IATA-like ranges, `applyDecisions` errors, end-report wording |
| `index.html`, `style.css`, `ui.js`, `ui-util.js` (`tr`, `BRAND_EN`, money format 萬/億 and K/M/B, glossary), `ui-map.js` (flat SVG map, pan/zoom, label collision), `ui-art.js`, `landmap.mjs` (Natural Earth 110m land, baked), `backend.mjs` (switch between real model and `mock-model.mjs`), `art/hero.webp`, `art/thumb.webp` | Current UI: start screen, flat world map with routes, route panel, event modal, turn results (the teaching core), end report, sources page, dark theme |
| `/games/index.html` | Lobby card for this game (模擬 section, class `card airline`) |

- Saves: `localStorage` keys `tq-airline-save-<mode>`, `tq-airline-best`, `tq-airline-sel`, `tq-terms`, `lang`. Every access is wrapped in try/catch. If the v2 save format changes, ignore or migrate old saves; never crash on them.
- Debug: `?debug=1` exposes `window.__tq` with `ff(n)` (fast-forward n turns) and `end()`.
- Calibration (seed 1, sensible full-service bot): the margin ends between +3.5% and +7.3% at every hub × mode; average cost shares are fuel 28%, labour 25%, ownership 18%, airport 10.5%, maintenance 7.6%, distribution 5.8%, overhead 4.5%. LCC ancillary revenue is about 19% of revenue.
- Known weaknesses:
  - The LCC sensible bot is slightly negative at NRT.
  - Decade margins vary a lot between seeds.
  - Some city labels are hidden when zoomed out.
  - Lessons with no criterion (season, festival) count as "handled" once seen.
  - Not tested on a real phone touch device.

## 4. The redesign brief

### 4.1 References: what to borrow (verify with your own research)
- **Fly Corp:** a living world. Planes visibly fly their routes, and passengers pile up at airports as dots. Minimal, beautiful map, speed controls, unlocking new regions, Mini Metro-like flow. The satisfying feedback is constant.
- **Airline Manager 4:** the management loop. Buy or lease aircraft, set prices, and buy fuel when the price is low (a fuel market). Marketing campaigns, maintenance checks, hub growth, achievements and steady progression. **Avoid** its monetisation-driven waiting and tedium.
- **AirTycoon 4:** a turn-based iOS game (2015). Its features are hub buildings (maintenance depot, lounge, fuel tank), buy / lease / used aircraft with cabin class split, competitor airlines and scenarios. See §4.2 for the correction about the globe.

### 4.2 Two directions (research done; read these first)
- `design/research.md`: research on the three reference games, with sources and the 10 most transferable ideas.
- `design/directions.md`: the two directions in Chinese, each feature tagged with its reference game.
- `design/choices.jpg`: a one-page comparison, the picture to show the owner.
- `design/mockups/`: `A-desktop.jpg`, `A-phone.jpg`, `B-desktop.jpg`, `B-phone.jpg`, plus `*-notes.jpg` annotated with which game each feature comes from.
- `design/mockup-src/`: working three.js source for the mockups (globe, arcs, plane sprites), with NASA textures. See its README.
- `design/LICENSES.md`: asset licences.

**Correction from the research.** AirTycoon 4 is a turn-based iOS game (TRADEGAME Lab, 2015). No source shows it with a 3D globe; that is AirTycoon 5's map option, and Fly Corp uses a flat map. The globe in both mockups is our own choice. AirTycoon 4's sourced signature features are:
- hub buildings: a maintenance depot (−30% maintenance), a lounge (more premium passengers), a fuel tank
- buy, lease or used aircraft, with a tip to keep leases under 30% of the fleet
- cabin class split
- competitor airlines
- turn-based play

**A, 即時航網 (living network).**
- A light-blue 3D globe where time runs, with pause and fast-forward (about 60 s per month).
- Flight-sim planes fly the routes with trails, passengers queue at airports, and each landing pops its profit or loss.
- Blue routes make money and red ones lose it; thicker lines mean more flights. Each route has a load factor vs break-even bar.
- News cards pause the game for decisions.
- Month-end settlement is the current `model.mjs`, unchanged. Mid-month changes take effect next month.
- About 5–7 agent-days and about 3 MB of assets.

**B, 航空大亨 (tycoon).**
- Turn-based, one season per turn, on a photoreal day/night globe with city lights.
- Dense panels: an isometric hub scene with terminal, lounge, maintenance depot, fuel tank and slots; the fleet with cabin layout and the lease-share warning; a fuel market; several AI rivals; scenario goals; achievements.
- About 6–7 new model systems, each recalibrated. About 9–12 agent-days and about 3.5 MB of assets.

**Recommendation (research agent and coordinator agree): A, plus two pieces of B.** The first is B's hub-facility card: three buildings, each teaching one lesson (maintenance cost, premium demand, fuel storage and hedging). The second is scenario challenge cards for replay. A changes what the player sees every second, which is what 「更有趣、畫面厲害很多」 asks for, and it keeps the model and its tests intact. B mostly adds menus and recalibration risk, and bland, menu-heavy screens are the main complaint in reviews of AirTycoon. Choose B instead if the goal becomes many repeated ten-year playthroughs.

**The owner has not chosen yet.** Unless the owner has already told you, show `choices.jpg` with one Chinese line per option plus the recommendation, and wait for 「A」 or 「B」. If they say 「你決定」, build the recommendation.

### 4.3 Non-negotiables for v2
1. **Still teaches.** Every lesson in `LESSONS` must still be reachable and explained:
   - load factor vs break-even
   - the fuel spike and hedging
   - the empty-widebody trap
   - a route that is full but unprofitable because the fare is too low
   - hub and transfer effects
   - utilisation (idle aircraft still cost their lease)
   - seasonality
   - disruption
   - LCC entry
   - the pandemic and recovery (decade)
   - slots and interest rates (decade)

   Per-route one-sentence reasons stay. The 3.9% industry line stays.
2. **Model integrity.** Reuse `model.mjs` where you can. If you turn real-time, run the simulation in time slices or days, but keep it deterministic per seed and keep pure functions testable in node. Keep or extend the bot calibration tests (sensible +3…+8%, naive ≤ −10%, idle loses slowly) for every hub × mode, and keep cost shares IATA-like. Do not inflate margins to make it "feel good".
3. **Wow visuals, in budget.**
   - 60 fps on a mid-range phone is the target, with graceful degradation (fewer planes and effects, lower resolution).
   - Use `three.js` from the repo: `/game/lib/three.module.js`. There is no bundler or build step; ES modules are loaded directly.
   - Everything is baked into the repo, with no runtime third-party fetches or tiles.
   - Assets must be redistributable: NASA Blue Marble / Black Marble (public domain, verify and credit), Natural Earth (public domain), or your own procedural art. Record every asset's licence in `games/airline/design/LICENSES.md` and on the sources page.
   - Total download for first play is ≤ ~8 MB; lazy-load the rest.
4. **Phone first.** 390×844 portrait and 844×390 landscape, plus desktop. Touch: tap, drag and pinch on the globe. No horizontal overflow. Buttons are real `<button>`s; colour is never the only signal.
5. **Less busywork than AM4.** No waiting timers or chores. Automate repetitive actions (auto-depart, auto-assign), and let the player stay in strategy.

## 5. Repo rules (important: other agents work in this repo at the same time)

- Read `/Users/ivanchang/tools/CLAUDE.md`.
  - Every new HTML page needs `<meta name="robots" content="noindex">` right after `<meta charset>`.
  - **Never run `build.py`.**
  - Don't touch other sites or games.
- Other sessions edit other folders concurrently, so you will often see their uncommitted changes in `git status`.
  - **Commit only your own files:** `git add games/airline/...` then `git commit --only <your paths>`.
  - Never `git add -A`, never `git stash`, never `git commit --amend` on shared history, and never revert other people's changes.
- If a push is rejected:
  1. `git fetch origin`
  2. Create a separate worktree: `git worktree add /tmp/airline-push origin/main`
  3. `git cherry-pick <your commits>` there, then `git push origin HEAD:main`
  4. Remove the worktree.

  Don't rebase in the shared checkout.
- Ship in milestones. Each milestone is a working, pushed game; the live version must never be broken. Bump the `?v=N` cache-busters on `ui.js`/`style.css` (and any new module entry) in `games/airline/index.html` whenever you change them. Keep the lobby card in `/games/index.html` pointing at `/games/airline/`.
- Commit messages: `feat:` / `fix:` prefixes. Chinese summary lines are fine and the owner reads them.
- Chinese copy:
  - Plain, short words, no metaphors.
  - Full-width punctuation after Chinese characters (，。：；「」).
  - Numbers and units as normal.
  - Money is US$ with 萬/億 in zh and K/M/B in en.

## 6. Reusable pieces from the flight sim (`/games/flight/`)

- `aircraft.js`: `createAircraft(THREE)` returns `{group, update(state, data), dispose()}`, the MQ-320 in the 1A livery, about 36k triangles. Nose is −Z, +X is the right wing, +Y is up. For a flying pose, pass gear up and flaps 0 through `update` (read that function for its inputs).
- `aircraft.light.js`: `createLightAircraft(THREE)` returns the MQ-172 light aircraft.
- Use these for the hangar, cut-scenes or close-ups. For the globe, use instanced low-poly or sprite planes; full models are too heavy for dozens of planes.
- How the existing hero art was rendered (headless, transparent background): `art/hero.webp`. Reproduce it with a small three.js page plus a Playwright screenshot.

## 7. How to verify (what "done" means for each milestone)

1. `cd /Users/ivanchang/tools && node --test games/airline/model.test.mjs` passes, plus any new tests (keep the calibration bands).
2. Use a headless browser check in an **isolated** browser, not the owner's Chrome profile:
   - Python Playwright: `p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=swiftshader","--enable-unsafe-swiftshader"])` with a fresh context.
   - Serve with `python3 -m http.server <port> --directory /Users/ivanchang/tools`.
   - Check 390×844, 844×390, 1280×800 and the dark scheme. There must be no console or page errors (a favicon 404 from the bare dev server is fine) and no horizontal overflow.
   - Scripted playthroughs: a sensible 一年 game from Taipei, a 十年 game from Singapore, and one deliberately bad game. They should end roughly at a profit, mixed, and a clear loss, with reasons that explain why.
3. Measure performance: frame time on the main screen with all routes active, and the asset bytes downloaded before first interaction.
4. After pushing, check the live URL returns 200 for the new files: `curl -s -o /dev/null -w "%{http_code}" https://tools.investmquest.com/games/airline/<file>`.
5. Send the owner 2–4 screenshots of the result, with a short Chinese note: what changed, what was verified, and what was not.

## 8. Suggested milestones (adjust after the direction is chosen)

1. **M1, visual shell.** The new main screen: a globe or map with routes and animated planes, driven by the existing turn model. The existing panels are restyled to match. Ship it.
2. **M2, real-time loop** (if direction A). Time slices with speed controls, passengers and money feedback, report-card pauses, and events landing as live moments. Keep the model's determinism and add tests.
3. **M3, new mechanics.** Fuel market, hangar and seat configuration, slots, unlockable regions, and competitor visibility. Each comes with its lesson text and a test that it moves the intended metric.
4. **M4, onboarding and polish.** A 3-minute guided first month, sound (optional, muted by default on mobile), achievements, the end-of-game report, a replay prompt, and save migration.

## 9. Context files (in this folder)

- `spec-v1.md`: the v1 design spec. Two things in it are out of date: the palette (it was celadon green, now blue, see §2) and the English name (now SKYGLAZE).
- `research-v1.md`: the v1 research on airline economics and similar games, with sources.
- `../SOURCES.md`: the real-world numbers used in the model.
- `research.md`, `directions.md`, `choices.jpg`, `mockups/`, `mockup-src/`, `LICENSES.md`: the v2 research, the two directions and the mockups (§4.2).


## 10. v23: manual aircraft orders (2026-10-06)

The owner explicitly requested real expansion constraints instead of automatic leases. `ui.js` now commits manual lease/purchase orders; starting fleets are unchanged. Leases reserve a refundable two-month deposit, purchases reserve 20% down, and both deliver after one settled turn. Pending aircraft cannot fly, consume fleet capacity, and survive saves. Orders per turn: 2 (year), 3 (decade). Cancellation refunds cash but keeps the spent quota; returns refund paid deposits and retain the existing two-month termination charge.

Base fleet/destination caps are 6/8 (year) and 10/12 (decade). A built maintenance depot expands them to 10/12 and 16/20. Route creation and frequency changes require delivered aircraft hours. Legacy games retain existing fleets/routes above the caps but cannot add more until they make room. Missions prefer feasible aircraft schedules and account for whole-aircraft costs.

The former first-year +3–8% calibration assumption is superseded by the owner's delivery/capacity requirement: the default full-service bot earns +0.8–6.6% across the five recommended bases (seed 1); decade calibration remains +3–8%. A legal TPE strategy (`budget:6, minLF:.7`) still beats the 3.9% margin challenge. A focused narrowbody low-cost bot ranges from −2.1% to +21.4%. Passenger demand, fares, operating costs and the 3.9% scoring benchmark were not retuned for these tests.

Verification: `node --test games/airline/*.test.mjs` (99 tests); isolated `tests/browser-v2.py` (four layouts, complete year/decade/bad games, model switch, WebGL fallback, performance); `tests/fleet-browser.py` (manual orders, cash, cancellation, queue reload, quota, capacity, depot, purchases and sales); `tests/map-flight-browser.py` (animation, pause/reload, reduced motion and mute). The save-reset feature shipped separately in v22.3 and retains recoverable backups under `tq-airline-save-backups`.

## 11. v24.1: planning lead times and operating resilience (2026-10-06)

The owner requested meaningful management constraints without a fully realistic simulator. New orders have mode-aware delivery dates: standard leases take 2/3 months in year mode and 1/2 half-year seasons in decade mode (narrowbody/widebody). New purchases take 2/3 seasons. Express leases are offered only when they shorten delivery; they arrive after one turn, cost 20% more per month and charge a non-refundable handling fee equal to 25% of base monthly rent. New cancellations forfeit 15% of the deposit/down payment; cancellation losses and handling fees are recognised exactly once in ownership cost. Old orders preserve their dates/refund commitments. Pending aircraft still cannot fly. Reject orders that cannot operate before the game ends.

`maintenance` and `fleetCondition` are per-type maps. Regular care preserves existing hour capacity and base maintenance cost. Intensive flying offers 108% hours / 85% maintenance cost but wears condition faster; extra care offers 88% hours / 130% cost and restores condition. Schedule slack also restores it. Fleet condition and tight schedules cause explicit technical cancellations and compensation, recorded in route accounts and the new operations report. Readiness previews, physical capacity checks and estimates use the same rules. Reject a care change that would overbook its type rather than erase a route. Policies are draft plans, saved and effective at the next operating start; running accounts remain frozen.

Facilities now use a separate `facilityOrders` construction queue. Capital is paid at start, but benefits, depreciation and running costs begin only after completion. Year: depot 3 months, lounge/tank 2. Decade: depot 2 seasons, lounge/tank 1. Existing facilities stay active. Completion appears in the report; pending construction is visible in the fleet plan, construction cards and airport scene. The fleet plan shows current and committed monthly fleet rent/loan payments. All new constants are explicitly described as compressed gameplay assumptions in `sources.mjs`.

Calibration keeps demand, base fare, fuel, labour and the 3.9% industry benchmark unchanged. The sensible yearly bot expands more cautiously (three aircraft budget), compares fares, and the long-game bot manages condition and retains one long-range aircraft during severe demand shocks. Across five bases / multiple seeds, sensible play stays profitable and below 8% for seed 1; the previous decade 3% floor is superseded by added lead-time and resilience costs (floor now 0.5% in both modes). TPE's margin challenge remains winnable using `budget:6, minLF:.62`. Contract deadlines include required delivery waiting time.

Verification: 108 Node tests; `operations-browser.py` across desktop, phone, landscape and dark preference (dates, express delivery, care/capacity refusal, save/reload, wear and compensation, construction, completions, report editing and mute); updated `fleet-browser.py` and `report-planning-browser.py`; full `browser-v2.py` including complete year/decade/naive games, playback resume, WebGL fallback, corrupted saves and performance. On this Mac use isolated Chrome `--use-angle=metal`; SwiftShader is too slow for playback timing checks. No owner browser profile or real saves are modified by tests.
