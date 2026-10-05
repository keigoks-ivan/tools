# Airline management game: research report (2026-10-05)

Evidence labels: [W] = found in a web search this session (source named); [M] = from my own background knowledge, NOT verified this session; [?] = uncertain.
Search was shallow (standard-mode searches, one pass). Almost no first-hand player reviews were read; "praise/complaints" below are from review snippets and may not be representative.

## Part 1. How similar games are designed

| Game | Core loop / what the player decides | Demand, price, competition | Complexity handling | Praise / complaints | Session |
|---|---|---|---|---|---|
| Airline Tycoon (Deluxe) | Real-time, walk around an airport building: take flight jobs at a desk, buy/upgrade planes, hire crew, sabotage rivals [W: Steam/GOG pages, thedailystar review] | Flights are jobs on a board, not a demand model; AI rivals with personalities (sabotage) [W] | Whole game is a cartoon airport; rooms = menus | Praise: strong characters, humour. Complaints: late game monotonous, needs more disasters; UI tedious on small screens [W]. AT2 is Mostly Negative on Steam [W, 18-38% by snippet, figures inconsistent] | ~1 hr/scenario [M] |
| Aerobiz Supersonic / Air Management (Koei) | Turn-based. Bid for slots, buy aircraft, open routes between countries, set ad budgets, buy off events [W: Giant Bomb/SegaRetro] | Scripted world events (wars, Olympics) plus random events (storms, crashes) [W] | Few numeric levers per turn | Era classic, no modern review data found. Medium run ~2 hours [W] | ~2 hr |
| Pocket Planes | Tap-based: load passengers/cargo onto planes, send to cities, upgrade fleet [W: PocketGamer, GameInformer] | Jobs are given, no pricing | Super simple | Praise: quick satisfying start, 4.6 stars. Complaints: peaks early and loses altitude; layover system poorly explained [W] | Minutes, idle |
| Airline Manager 4 (mobile/Steam) | Buy real aircraft, open routes from real hubs, set fares/frequency [W] | Easy Mode vs Simulation Mode toggle [W] | Minimalist UI; mode switch hides realism | Seen as accessible but strategic; freemium monetization. I did not find specific complaints [?] | Idle style, minutes per day |
| Airlines Manager (Gameloft-style) | Same family: fleet, routes, hubs, 190 models, 2,700 airports [W: App Store] | Not verified | Not verified | 10M players claimed [W] | Not verified |
| AirwaySim | Real-time shared world: 30 real minutes = 1 game day; players compete for slots, aircraft, routes [W: airwaysim.com] | Point-to-point demand described by players as "fairly unsophisticated"; forum asks for passenger route-choice by price/time/stopovers [W] | None, it is a pro-level sim | Steep learning curve, polished [W] | Weeks to months |
| AirlineSim (Simulogics) | Persistent online sim, EUR ~4.50/month [W] | Demand and airport capacity modelled on reality [W] | "For pros" | "Best but very challenging, steep learning curve" [W] | Weeks to months |
| MIT ePODS / 16.75J Airline Management (teaching sim) | Student teams: fleet planning, route evaluation, scheduling, pricing, revenue management in a competitive market. Built by Boeing and MIT since 1994 [W: MIT OCW syllabus] | Revenue-management focus, rival teams | Run in rounds, with six "input presentations" per semester [W] | No player-review data (university tool) | One semester |
| Mini Metro / Two Point style (design benchmarks, not airline games) | One-screen, few verbs, instant visual feedback | n/a | Complexity emerges from few rules | [M] not researched | 5-15 min |

Not found / not verified: Airlines Manager complaints, Airline Empires, AT2 reasons for failure, any Reddit threads, Cart Life / Papers Please (cited from design lore only [M]), any browser-based educational airline sim with a published learning evaluation.

### Synthesis
Mechanics that teach airline economics best per unit of complexity:
1. Route = a price, a frequency and an aircraft; profit is shown per route. This is the actual unit of airline decision-making. [M, consistent with MIT course scope [W]]
2. Visible unit economics: show revenue per seat-km vs cost per seat-km and the break-even load factor on each route. Nothing in the games surveyed did this simply; it is the opportunity.
3. Fixed vs variable cost (lease and crew are paid whether or not the plane flies) makes "growth losing money" understandable.
4. One scripted shock (fuel spike, demand crash, new rival) per few turns, as Aerobiz does [W], so lessons are reproducible instead of random.
5. Easy/Simulation mode split as in AM4 [W]: not needed for a 30-min game, but the idea of hiding second-order mechanics until later is sound.

Busywork to avoid:
- Real-time idle waiting and monetisation grind (Pocket Planes tails off [W]; AM4 freemium [W]).
- Late-game monotony (Airline Tycoon [W]); keep the game short or end it before the loop repeats.
- Crew/pilot/airport-staff micromanagement, hundreds of aircraft types, real slot auctions.
- Unexplained systems (Pocket Planes layovers [W]); every number must be traceable in one click.
- Hidden randomness: a player cannot learn from a loss they cannot explain.
- Realism for its own sake: AirwaySim/AirlineSim are praised and feared for the same steepness [W].

## Part 2. Fact base for the model

All $ are USD. Prefer IATA/airline filings; secondary news articles used where noted.

### Industry level
- 2025: net profit $39.5B, net margin 3.9%, $7.90 profit per passenger, revenue $1.008T, operating profit $67.0B, jet fuel $90/bbl. [W: IATA release 2025-12-09 via fetch]
- 2026 forecast: net profit $41B, 3.9% margin, load factor 83.8%, op margin 6.9%, fuel cost $252B = 25.7% of operating costs, non-fuel $729B, labour 28% of costs, ROIC 6.8%, 5.2B passengers. [W: same]
- Earlier 2025 forecast (June): margin 3.7% (2024: 3.4%), fuel 26.4% of costs (2024: 28.9%, $99/bbl), labour ~31% of operating costs, load factor ~83.4%. [W: networkthoughts/travelweek summaries of IATA June 2025] Note labour share differs between IATA releases (31% vs 28%); treat as ~28-31%.
- Why thin: over 60 years airlines earned about $32B profit on $11.5T revenue [W: secondary, single news snippet, check before quoting]. Mechanism [M]: high fixed costs, perishable seats, easy capacity entry, fuel and demand shocks, regulated airports/ATC suppliers with pricing power.
- Cyclicality: 2008 oil spike; IATA's forecast swung from +$9.6B to -$2.3B in June 2008 at $107 oil; fuel bill $176B, $40B above 2007. 2008-09 combined loss about $31B. [W] 2020: early forecast -$84B [W]; actual loss I recall as about -$137B [M, verify].

### Cost structure (shares of operating cost)
- Fuel ~26-29%; labour ~28-31% (IATA, above) [W].
- Aircraft ownership (lease/depreciation), maintenance, airport and navigation charges, distribution/sales, overhead make up the remaining ~40%. I did NOT find a clean current IATA split for these. Old US-major breakdown: 44% aircraft operating (fuel, maintenance, depreciation, crew), 29% servicing, 14% reservations and sales, 13% overhead [W: FAA econ-value op-costs page, undated, US majors]. For the game, assume [?]: ownership 8-10%, maintenance 8-10%, airport+ATC+handling 12-15%, distribution 4-6%, overhead 5-8%. These are my estimates.
- Narrowbody lifecycle cost: roughly $50M to buy, $120-180M to operate over 15 years; split acquisition 20-30%, maintenance 25-40%, fuel 20-30% [W: oxmaint guide, low-quality source].
- Lease: new A320neo/737 MAX 8 about $400k/month, A321neo about $460k; one 2025 Hainan deal about $345-360k/month [W: ch-aviation, aviation press]. Used/older aircraft are cheaper [M].

### Unit metrics (definitions standard [M])
- ASK = seats x km flown. RPK = paying passengers x km. Load factor = RPK/ASK. Yield = revenue per RPK. RASK = revenue/ASK = yield x load factor. CASK = cost/ASK. Break-even load factor = CASK / yield (fares and costs on same basis). Profit per ASK = RASK - CASK.
- Industry load factor about 83-84% (record) [W]. Industry break-even load factor roughly 80% [M, IATA reports it each year but the 2025 release I fetched did not state it; verify].
- CASK: European full-service carriers have the highest in the world, US the lowest; LCC gap is regional and not universal, some LCCs cost more than FSCs [W: CAPA, abstract only]. Typical European FSC vs LCC ratio about 1.5-2x on short haul [M, not verified]; I did not obtain a sourced number.

### LCC vs full-service
- Utilisation: LCCs typically >12 block hours/day [W: CAA snippet]; easyJet 11.9 h (Q3 FY2012, old) [W]; legacy short-haul about 8-9 h [M].
- Ancillary share: Ryanair FY25 ancillary EUR 4,719M = 33.8% of EUR 13,949M revenue, EUR 23.63/passenger, total about EUR 70/passenger [W: travelextra, other secondary]. easyJet about 25% of revenue, GBP 24.66 per seat [W, older year]. FY24 Ryanair average fare EUR 46.42 [W].
- Other LCC levers [M]: single fleet type (cheaper training, spares), high seat density, secondary airports with discounted fees, point-to-point with no connection bags, quick turnarounds (25 min), direct sales.
- FSCs are adding LCC-style fares and LCCs adding premium products [W: Boeing ABS 2025 snippet "Great Convergence"].

### Network and aircraft
- Hub-and-spoke [M]: connecting traffic fills spoke flights, bigger aircraft on trunks, but needs waves of flights, costs more per passenger, and hubs are vulnerable to delays. Point-to-point: simpler, higher utilisation, needs enough local demand per route. Zurich-style hub = Swiss/MQ Air feeding long-haul (relevant to the user's setting).
- Trip cost vs seat cost: bigger aircraft has lower cost per seat but higher cost per trip, so it only works where there is demand to fill it; a half-empty widebody can lose money where a narrowbody would not [W: Leeham/Visual Approach summaries]. Transatlantic: narrowbody has lower trip cost, about 6.5% higher seat cost than widebody on one Leeham study [W].
- Fuel hedging [W: Reuters-style factbox, March 2026]: Ryanair about 80-84% hedged at $67-77/bbl; Lufthansa 76% of 2025 needs hedged at end-2024; SAS 0% hedged for next 12 months. Hedging protects against spikes but can lose if fuel falls.
- Slots: Heathrow's legal cap is 480,000 movements/yr and extremely scarce [W]. Slot-constrained airports mean you can't just add flights, so airlines up-gauge (bigger aircraft) [M].

### Demand and competition
- Elasticity: business travellers less price sensitive than leisure; leisure more elastic than business; long-haul more elastic than short-haul per the InterVISTAS report for IATA [W summary]. I could not read the numeric tables (PDF unparseable). From memory only [M, unverified]: short-haul leisure about -1.5 to -2, business about -0.6 to -1, so use leisure -1.6, business -0.7 as game parameters and flag them as design values, not citations.
- Gravity model (demand ~ pop_A x pop_B / distance^k) is standard in academic air demand work [W: Mainz/NASA/EUR papers listed; I did not extract exponents]. Game use: scale only, not claimed as calibrated.
- Seasonality [M]: summer leisure peak in Europe, Jan-Feb trough; ~+/-25% swing is a reasonable design value.
- Competition: fare and frequency matter ("S-curve": the higher-frequency carrier gets a disproportionate share) [M]; price wars cut yield on both sides and can be lost by the higher-cost carrier.

### What I could not verify
Numeric elasticities; current IATA break-even load factor; sourced FSC/LCC CASK ratio; a clean cost split for ownership/maintenance/airport/distribution; 2020 actual loss; Zurich slot/charge data; Swiss/Zurich-specific fare data.

## Part 3. Two candidate designs

### Design A: "Season" (simplest viable; recommended)
- Premise: you are MQ Air's network planner. 12 turns = 12 months (one calendar year, so seasonality is built in). Map: Zurich plus ~11 European cities (e.g. London, Paris, Frankfurt, Vienna, Barcelona, Rome, Athens, Stockholm, Lisbon, Istanbul, Berlin, Dublin), each with a population/business-share number and a distance. Target playtime 20-30 min.
- Start: cash CHF 50M [design value], 2 leased narrowbodies, no routes.
- Decisions per turn (keep to 4): (1) open/close a route from Zurich (or any open city, from month 4 once hub is built); (2) assign an aircraft type and frequency per route; (3) set fare tier per route (Low / Mid / High slider); (4) lease/return aircraft, or hedge fuel (from month 3). One optional 5th: buy ads on one route.
- Aircraft (3): 70-seat regional turboprop, 180-seat A320-class, 300-seat widebody. Each has seats, lease/month, trip cost, hours/day.
- Model (all per route-month):
  - Base demand D0 = k x (popA x popB) / dist^0.7, split leisure/business by city profile.
  - Demand = D0 x season(m) x (fare/ref_fare)^e, e = -1.6 leisure, -0.7 business; x competition share (if rival present: your share = f(price ratio, frequency ratio)).
  - Passengers = min(seats offered, demand); load factor = pax / seats.
  - Revenue = pax x fare (fare = ref_fare(dist) x tier multiplier 0.75/1.0/1.3) + ancillary CHF 10-25 per pax [Ryanair about 34% of revenue is the extreme case].
  - Cost = trips x trip_cost(type, dist) [fuel x price index + crew + airport fees + handling] + lease per aircraft per month + fixed overhead 6% of revenue. Shares calibrated to ~28% fuel, ~29% labour, rest per Part 2.
  - Calibrate so a sensible network ends with ~3-8% margin and a bad one -10% or worse.
- Lesson moments: (a) month 4 empty widebody: demand below 300 seats, trip cost makes it lose money, while a full 180-seater wins; (b) month 6 fuel spike +40% (hedge or not); (c) month 8 rival LCC enters your best route, choose a price war or leave; (d) a "full but unprofitable" route: high load, low fare tier, break-even load factor above actual; (e) month 9-10 slump or strike; (f) hub effect shown by feeder routes raising a trunk route load (simple +X% bonus from two or more routes into the same city).
- Feedback: after each turn a P&L screen per route with bars RASK vs CASK, load factor vs break-even load factor (line), and one plain sentence of cause ("You flew full planes but at a fare below cost per seat"). End of game: report card on 5 ratios and which of the 5 lessons you hit.
- End: after month 12, score = operating margin and cash vs the ~4% industry average (IATA). Lose early if cash < 0. No repeating loop, so no late-game monotony.
- Content: 12 cities, 3 aircraft types, ~6 scripted events, 1 rival. Everything in JSON; a few hundred lines of model code.

### Design B: "Airline Years" (richer)
- 3 stages over 5 simulated years x 4 quarters = 20 turns (~40 min): European short-haul, then adding Zurich hub with one long-haul route, then choosing a strategy (LCC-style vs premium) with different cost and fare profiles.
- Decisions (5): routes + aircraft + frequency; fare and cabin split (economy / premium seats trade-off); fleet buy vs lease (balance sheet and depreciation, interest); fuel hedge ratio; a strategy choice (hub vs point-to-point; LCC vs full-service) with persistent upgrades (single fleet type discount, lounge product).
- Model additions: 2 rivals with simple AI (copy your most profitable route, undercut fares), gravity demand with business/leisure split and connecting flows through the hub; aircraft ageing and maintenance cost step; credit and interest; slot limit at Zurich (cap flights per day) forcing up-gauging; macro cycle (boom/bust year based on 2008 and COVID).
- Lessons: all of A plus LCC vs FSC unit-cost comparison, hub connecting-traffic economics, fleet commonality discount, debt risk in a downturn, slot scarcity.
- Feedback: per-route and per-aircraft P&L, network map with margin colours, quarterly "board report" with CASK vs RASK trend vs the two rivals.
- End: year 5 scoring vs rivals and industry margin; bankruptcy if cash < 0 for 2 quarters.
- Content: ~20 cities, 6 aircraft types, ~15 events, 2 rivals, two cabin classes.
- Risk: longer playtime and more screens increase the risk of the same late-game repetition and unexplained systems that reviews criticise [W]; harder to tune so lessons actually trigger.

### Recommendation: A, with one hook from B
Pick Design A. Reason: the user's goal is understanding after one 20-40 minute playthrough; AirlineSim/AirwaySim show that realism produces steep learning curves [W], and Pocket Planes/Airline Tycoon show that games running past their lessons get monotonous [W]. A has a fixed 12-turn arc where each of the five lessons is forced by a scripted event, a per-route RASK vs CASK display shows why money was made or lost, and tuning is tractable. Add from B only the "choose LCC-style or full-service per route" fare/seat-density tier as a toggle in turn 6 if there is room, since that is the clearest LCC vs FSC lesson. Keep the ending short and make a second playthrough (different strategy) the replay hook rather than a longer first run.

Suggested next steps (not done): tune parameters in a spreadsheet to confirm the 3 scripted scenarios give +5%, -10% and break-even; check Zurich-region fare and charge data; get real elasticity tables from the InterVISTAS PDF.

## Sources (those actually returned by search/fetch)
- IATA press release 2025-12-09 (2025/2026 outlook): https://www.iata.org/en/pressroom/2025-releases/2025-12-09-01/
- IATA June 2025 outlook coverage: https://networkthoughts.com/2025/06/03/iata-airline-profitability-to-strengthen-slightly-in-2025/ and https://www.travelweek.ca/?p=181335
- IATA/InterVISTAS elasticities: https://www.iata.org/en/iata-repository/publications/economic-reports/estimating-air-travel-demand-elasticities---by-intervistas
- MIT OCW 16.75J: https://ocw.mit.edu/courses/16-75j-airline-management-spring-2006/pages/syllabus
- CAPA CASK: https://centreforaviation.com/analysis/iata-cask-europes-full-service-airlines-have-the-worlds-highest-us-airlines-the-lowest-281609
- Boeing ABS Great Convergence LCC 2025 (PDF, snippet only)
- Ryanair FY25 ancillary: https://www.travelextra.ie/74971-2/ (and related)
- Lease rates: https://www.ch-aviation.com/news/144317-chinas-hainan-airlines-holding-announces-new-a320neo-leases
- Hedging factbox: https://www.hydrocarbonprocessing.com/news/2026/03/how-airlines-have-hedged-against-fuel-price-increases/
- Trip vs seat cost: https://leehamnews.com/2018/04/11/is-long-haul-lcc-viable-part-3/
- FAA op-cost split: https://www.faa.gov/regulations_policies/policy_guidance/benefit_cost/econ-value-section-4-op-costs.pdf
- Games: Giant Bomb / SegaRetro (Aerobiz Supersonic), PocketGamer and GameInformer (Pocket Planes), Steam/GOG (Airline Tycoon), airwaysim.com forum, OneMileAtATime "Airline Management Simulator Games": https://onemileatatime.com/airline-simulator-games/
