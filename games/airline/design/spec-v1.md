# 天青航空：航線經營 — design spec (coordinator decisions, 2026-10-05)

Goal (user): a simplified airline management browser game; after one play-through a non-expert understands roughly how an airline makes or loses money and how to run one. Easy to play, no busywork. Research: games/airline/design/research-v1.md (read it; [W]=found, [M]=memory, [?]=uncertain).

## Identity
- Airline: 「天青航空」 TIANQING — named after Ru-ware celadon「雨過天青雲破處」. Palette: pale celadon ~#A9C8C2, deep celadon ~#4E7F78, ink ~#2F4F4A, warm off-white ~#F6F3EC, accent for warnings: muted cinnabar ~#B5533C. Elegant serif CJK headings ("Noto Serif TC", "Songti TC", "PMingLiU", serif), clean sans for numbers. Calm, refined, not cartoonish.
- Same company as the flight-sim game (/games/flight/, its aircraft are being repainted in this livery). Aircraft names follow the flight sim's fictional MQ family.
- Location: games/airline/ (new folder; site rules in /Users/ivanchang/tools/CLAUDE.md — every HTML page needs `<meta name="robots" content="noindex">` after `<meta charset>`). Bilingual like the flight game: every string via tr(zh, en), Chinese default.

## Modes (both selectable at start)
- 「一年」 (Mode A): 12 turns, 1 turn = 1 month, ~20–30 min. 3 aircraft types, 1 rival, ~8 scripted events. Month 6: one decision 「要不要改走廉價路線？」 (LCC vs full-service: seat density, fares, ancillary, service cost) — the clearest LCC lesson.
- 「十年」 (Mode B): 20 turns, 1 turn = one IATA season (summer/winter half-year), ~40 min. 6 aircraft types, 2 rivals (one LCC, one full-service), buy-vs-lease with loans, airport slot limits at congested airports, connecting (transfer) traffic through the hub, a boom/bust cycle with scripted crises (an oil shock like 2008, a pandemic like SARS/COVID — fictionalised, no real names needed), business-model choice at the start (with plain explanation) and the option to switch later at a cost.
- Replay is encouraged instead of longer games: end screen suggests 「換一種走法再玩一次」.

## Hubs (player picks; default 台北桃園)
台北桃園 (default) · 東京成田 · 新加坡 · 杜拜 · 蘇黎世. Each teaches something different (Taipei: between NE and SE Asia, strong transfer potential; Tokyo: huge home market; Singapore: no domestic market, all international; Dubai: geography superconnector, long-haul transfer; Zurich: rich small market, high costs). Routes always start at the hub (hub-and-spoke); transfer traffic matters in Mode B (and a small, visible "hub effect" in A).

## World
~32 cities across Asia, Middle East, Europe, North America, Oceania covering all hubs' natural networks (e.g. Taipei, Tokyo, Osaka, Seoul, Shanghai, Beijing, Hong Kong, Manila, Bangkok, Singapore, Kuala Lumpur, Ho Chi Minh City, Jakarta, Delhi, Mumbai, Dubai, Doha, Istanbul, London, Paris, Frankfurt, Amsterdam, Zurich, Rome, Madrid, Los Angeles, San Francisco, New York, Vancouver, Sydney, Melbourne, Auckland). Each city: lat/lon, metro population, business weight, tourism weight, seasonality profile, airport fee level, slot-limited flag (Mode B), short Chinese one-liner.
Map: simplified world land polygons (Natural Earth 110m, public domain) as an inline/static SVG or JSON in the repo; no external map tiles or fetches.

## Aircraft (fictional MQ family; numbers from real classes, cite sources)
Mode A: MQ-72 渦槳 (~70 seats, ~1,500 km), MQ-320 窄體 (~180, ~6,000 km), MQ-350 寬體 (~320, ~14,000 km).
Mode B adds: MQ-190 支線噴射 (~100, ~3,500 km), MQ-321 長程窄體 (~200, ~7,400 km), MQ-400 大型寬體 (~400, ~13,500 km).
Per type: seats (FSC vs LCC density), range, cruise speed → block time, daily utilisation cap (hours), lease per month, purchase price (B), costs per block hour (fuel burn, crew, maintenance), per-departure fees.

## Turn loop (≤ 4–5 decision kinds per turn)
1. Open / close routes (hub → city), choose aircraft type and weekly frequency per route.
2. Fare level per route: 低 / 中 / 高 (relative to a distance-based reference fare).
3. Fleet: lease (A) / lease or buy with loan (B), return/sell.
4. Fuel hedging % (from month 3 in A; any time in B).
5. (Event decisions when they appear.)
The game auto-computes aircraft needed from weekly block hours ÷ utilisation; you can't fly what you don't have.

## Economic model (pure, deterministic with seed)
- Market demand per city pair per turn: gravity model on population/business/tourism weights with distance decay, × season, calibrated to plausible real magnitudes (cite where possible; flag design values).
- Price response: elasticity by segment (business less elastic than leisure; long-haul less elastic than short-haul) — design values are fine if flagged as such.
- Share vs rivals: frequency share S-curve × fare attractiveness × product (LCC/FSC); rivals respond with simple, readable rules (enter your best route, match fares, add frequency).
- Passengers = min(seats offered, captured demand) (+ transfer passengers through hub where applicable, which compete for the same seats).
- Revenue = pax × average fare (+ ancillary; much higher for LCC) (+ cargo optional, skip if not needed).
- Costs: fuel (block hours × burn × fuel price index, minus hedge effect), crew/labour (block hours; LCC lower), maintenance (block hours + cycles), airport & navigation (per departure + per pax, by city fee level), aircraft ownership (lease/month or depreciation+interest), distribution (% of revenue; LCC lower), overhead (fixed per turn, scales with fleet). Calibrate so a sensible network's cost shares land near IATA's (fuel ~25–30%, labour ~25–30%, etc. — verify and cite) and net margin for good play ~3–8%, bad play ≤ −10%, industry reference 3.9% (IATA 2025).
- Unit metrics shown per route and company: 載客率 (load factor), 損益平衡載客率 (break-even LF), 每座位公里收入 (RASK), 每座位公里成本 (CASK), 平均票價 (yield proxy).

## Feedback (the teaching core)
- After each turn: per-route P&L card: revenue, cost by category (bar), LF vs break-even LF (two bars), one plain-language Chinese sentence of cause (e.g. 「大飛機只坐了五成，攤到每個座位的成本太高」「油價漲了三成，你沒有避險」「對手降價，你的客人被搶走一成」). Company summary: cash, margin vs 3.9% industry line.
- Glossary popovers for every term the first time it appears.
- Scripted lesson events (A ~8, B ~12): fuel spike; LCC rival entry on your best route; empty widebody trap; full-but-unprofitable route (fare too low); hub effect (feeder routes lift a trunk route); utilisation (an aircraft that sits idle still costs its lease); seasonality dip; strike/typhoon disruption; (B) pandemic demand collapse, recovery, slot limit at a congested airport, interest-rate rise on loans.
- End report card: which lessons you encountered/handled, final margin vs industry, best/worst route and why, and 「換一種走法再玩一次」 suggestions. Lose early if cash < 0 (with a clear explanation of why).
- 「資料來源」 page listing the real-world numbers used and their sources (from SOURCES.md).

## Persistence
localStorage (try/catch everything; works without it): autosave per mode, best results per hub/mode.

## Quality bars
- Pure model in model.mjs/data.mjs with node tests: deterministic; for EVERY hub × mode, scripted bots: a sensible strategy ends with margin ~+3…+8% and positive cash; a naive-bad strategy (widebody on a short thin route, fares too low, no hedge before the spike) loses; doing nothing loses slowly from overhead; each scripted event fires and has the intended direction of effect.
- Phone-friendly (~400 px wide) and desktop. No console errors. Chinese text follows ~/.claude/skills/zh-analyst-prose/SKILL.md; full-width punctuation after Chinese.
