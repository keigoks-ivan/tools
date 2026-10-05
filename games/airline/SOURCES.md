# Skyglaze (天青航空) 資料來源 / Sources

Generated from sources.mjs. Status: verified = read in a public source on 2026-10-05; secondary = low-quality summary only; design = game design value.

## 全球航空業獲利與載客率 / Industry profit and load factor [verified]

2025 年淨利 395 億美元、淨利率 3.9%、每位旅客獲利 7.90 美元；2026 年預測淨利率 3.9%、載客率 83.8%、燃油占營運成本 25.7%、人事占 28%、投入資本報酬率 6.8%（資金成本 8.2%）。

2025 net profit US$39.5B, net margin 3.9%, US$7.90 per passenger; 2026 forecast net margin 3.9%, load factor 83.8%, fuel 25.7% of operating cost, labour 28%, ROIC 6.8% against an 8.2% cost of capital.

- Source: IATA press release, 9 Dec 2025 <https://www.iata.org/en/pressroom/2025-releases/2025-12-09-01/>
- Used for: CONST.industryMargin; end-report benchmark; cost-share test ranges

## 航空公司成本結構 / Airline cost structure [verified]

IATA 世界航空運輸統計（2022 至 2023）：燃油 28.7%、折舊與攤銷 9.1%、飛行員 8.6%、機務維修 8.4%、一般行政 7.7%、場站 7.1%、航管費約 4.3%。燃油占比各區差異大：北美 25.5%，拉丁美洲 36.3%。

IATA World Air Transport Statistics (2022-23): fuel 28.7%, depreciation and amortisation 9.1%, flight crew 8.6%, maintenance 8.4%, general and administrative 7.7%, station 7.1%, navigation about 4.3%. Fuel varies by region: 25.5% North America to 36.3% Latin America.

- Source: IATA Knowledge Hub, "Unveiling the biggest airline costs" <https://www.iata.org/en/publications/newsletters/iata-knowledge-hub/unveiling-the-biggest-airline-costs/>
- Used for: cost-share test ranges: fuel 17-36%, labour 20-32%, maintenance 6-11%; maintenance per block hour; overhead

## 飛機持有成本占比 / Ownership cost share [design]

IATA 的折舊占 9.1%，是以自有、已折舊的機隊為主。遊戲的機隊全部租賃（或新購），租金按市場價，所以持有成本占 15% 到 21%，高於 IATA 的折舊比例。這是刻意保留的差異：它讓「飛機閒置也要付租金」這一課看得見。

IATA shows depreciation at 9.1%, mostly on owned, partly depreciated fleets. The game leases at market rent (or buys new), so ownership is 15-21% of cost, above IATA’s depreciation share. Kept on purpose so that "an idle aircraft still costs its lease" is visible.

- Source: Design value (see lease rates below)
- Used for: AIRCRAFT.leasePerMonth; CONST.deprYears

## 損益平衡載客率 / Break-even load factor [secondary]

常見說法是全球損益平衡載客率 80% 左右，但我們沒在 IATA 原始資料找到這個數字，所以遊戲不直接用它；有一則網路摘要稱傳統航空約 74% 到 80%、廉航 82% 到 86%（來源品質低）。遊戲不設定損益平衡載客率，而是由成本與票價算出：損益平衡載客率 = 載客率 × 成本 ÷ 營收。整體網路的結果約 65% 到 80%。

A commonly quoted figure is an industry break-even load factor near 80%, but we could not find it in IATA primary data, so the game does not use it directly. One web summary gives 74-80% for full-service and 82-86% for low-cost carriers (low-quality source). The game does not set it; it is computed as load factor x cost / revenue. Network results land around 65-80%.

- Source: Search summary; IATA release (load factor 83.5% in 2024, 83.8% forecast 2026) <https://www.iata.org/en/pressroom/2025-releases/2025-12-09-01/>
- Used for: route and company breakEvenLF

## 廉航的輔助收入 / Low-cost ancillary revenue [verified]

Ryanair 2025 財年輔助收入 47.19 億歐元，占營收 139.49 億歐元的 33.8%，每位旅客 23.63 歐元；easyJet 約 25%（較早年度）。遊戲中廉航輔助收入占營收約 19%，低於 Ryanair，因為 Ryanair 是極端案例。

Ryanair FY2025 ancillary revenue EUR 4,719M = 33.8% of EUR 13,949M revenue, EUR 23.63 per passenger; easyJet about 25% (older year). The game’s low-cost ancillary share is about 19%, below Ryanair, which is the extreme case.

- Source: Travel Extra summary of Ryanair FY25 results; Ryanair FY25 results presentation <https://www.travelextra.ie/74971-2/>
- Used for: CONST.ancillary (lcc base US$20 + 4.5% of reference fare; fsc US$6 + 2%)

## 廉航單位成本 / Low-cost unit cost [verified]

Ryanair 2025 財年不含燃油的單位成本為每位旅客 36 歐元。搜尋未取得 Lufthansa 不含燃油的絕對每座位公里成本，也未取得可引用的「廉航比傳統航空低幾成」的數字；歐洲傳統航空是全球單位成本最高的區域（CAPA）。遊戲的廉航每座位公里成本比同一航網的傳統航空低約 23%，是設計值。

Ryanair FY2025 unit cost ex-fuel was EUR 36 per passenger. No absolute ex-fuel CASK for Lufthansa and no citable "low-cost is x% cheaper" ratio could be found; European full-service carriers have the highest unit cost in the world (CAPA). The game’s low-cost CASK is about 23% below a full-service carrier on the same network: a design value.

- Source: Ryanair FY25 presentation; CAPA CASK analysis <https://investor.ryanair.com/wp-content/uploads/2025/05/FY25-Ryanair-Presentation.pdf>
- Used for: CONST.lcc.* (seat density, crew, ground, airport, overhead multipliers)

## 窄體機租金 / Narrowbody lease rates [verified]

新的 A320neo、737 MAX 8 月租約 40 萬美元，A321neo 約 46 萬美元；2025 年海南航空一筆租約約 34.5 萬到 36 萬美元。MQ-320 取 40 萬、MQ-321 取 46 萬。

New A320neo / 737 MAX 8 about US$400k a month, A321neo about US$460k; a 2025 Hainan Airlines deal about US$345-360k. MQ-320 uses 400k, MQ-321 uses 460k.

- Source: ch-aviation, 2025 <https://www.ch-aviation.com/news/144317-chinas-hainan-airlines-holding-announces-new-a320neo-leases>
- Used for: AIRCRAFT[MQ-320].leasePerMonth; AIRCRAFT[MQ-321].leasePerMonth

## 寬體機租金 / Widebody lease rates [verified]

A350-900 月租約 92.5 萬美元（2021 年 1 月）至 95.4 萬美元（2023 年 1 月）；777-300ER 機齡 12 年約 31.4 萬美元（2022 年 10 月）；A330 機齡 10 年約 20 萬出頭；新的 787-8 約 86.2 萬美元（2010 年資料）。MQ-350 取 95 萬；MQ-400 設為較新世代的大型雙發機，取 105 萬（設計值）。

A350-900 about US$925k a month (Jan 2021) to US$954k (Jan 2023); 12-year-old 777-300ER about US$314k (Oct 2022); 10-year-old A330 in the low US$200ks; new 787-8 about US$862k (2010 data). MQ-350 uses 950k; MQ-400 is a newer-generation large twin at 1,050k (design value).

- Source: IBA / aviation press via search (iba.aero, aircraft interiors, AJOT) <https://www.iba.aero/insight/new-generation-widebody-lease-rates-are-rising/>
- Used for: AIRCRAFT[MQ-350].leasePerMonth; AIRCRAFT[MQ-400].leasePerMonth

## 每輪擋小時燃油消耗 / Fuel burn per block hour [verified]

A320neo 巡航約 2,200 到 2,400 公斤每小時（Lufthansa 機隊平均 2,250）；777-300ER 約 7.35 公噸每小時（Aircraft Commerce）；Airbus 稱 A350-900 單座位燃油比 777-200ER 少約三成。MQ-320 取 2,450（含滑行與爬升，輪擋平均），MQ-400 取 7,300，MQ-350 取 5,800（由 777 與 Airbus 說法推算，設計值）。支線機與渦槳為設計值。

A320neo cruise about 2,200-2,400 kg/h (Lufthansa fleet average 2,250); 777-300ER about 7.35 t/h (Aircraft Commerce); Airbus says the A350-900 burns about 30% less per seat than the 777-200ER. MQ-320 uses 2,450 (block average incl. taxi and climb), MQ-400 7,300, MQ-350 5,800 (derived from the 777 figure and Airbus’s claim; design). Regional jet and turboprop are design values.

- Source: The Flying Engineer / Wikipedia A320neo; Aircraft Commerce 777 fuel guide; Airbus <https://theflyingengineer.com/airbus-a320neo-vs-boeing-737-max-fuel-burn-comparison/>
- Used for: AIRCRAFT.*.fuelPerBlockHour; CONST.fuelPriceUsdPerKg = 0.72 (jet about US$0.72/kg, i.e. roughly US$90-100/bbl crude plus crack spread; design)

## 機組成本 / Crew cost [secondary]

A320 的機組成本約每飛行小時 1,000 到 1,200 美元，總直接營運成本每飛行小時 6,000 到 7,500 美元（低品質彙整）。MIT 航空資料顯示不同航空公司的同型機組與維修成本可差三到四倍（例如 737-500：United 機組 927、維修 1,048；Southwest 機組 388、維修 251 美元每輪擋小時，舊資料）。MQ-320 的機組成本取 1,100 × 1.1，再加地勤人事，使人事占成本 24% 到 28%（IATA 人事 28%）。

A320 crew cost is about US$1,000-1,200 per flight hour and total direct operating cost US$6,000-7,500 per flight hour (low-quality compilation). MIT airline data show crew and maintenance cost per block hour for the same type differing 3-4x between carriers (737-500: United crew 927, maintenance 1,048; Southwest 388 and 251; old data). MQ-320 crew is 1,100 x 1.1 plus ground staff, putting labour at 24-28% of cost (IATA 28%).

- Source: Aviation Week operating-cost tables; MIT Airline Data Project; aircraft operating-cost compilations <https://web.mit.edu/airlinedata/www/2016%2012%20Month%20Documents/Aircraft%20and%20Related/Carrier%20Detail%20Block%20Hour/United%20Airlines%20Aircraft%20Operating%20Statistics%2D%20Cost%20Per%20Block%20Hour%20%28Unadjusted%29.htm>
- Used for: AIRCRAFT.*.crewPerBlockHour; CONST.crewScale; CONST.groundLabourPerDep / PerPax

## 機場與航管費用 / Airport and navigation charges [verified]

新加坡樟宜：A320 級窄體每次降落的起降、停放與登機橋費約 1,200 新幣，2030 年 4 月前逐年升到約 1,725 新幣。蘇黎世：每位出發的本地旅客 30.40 瑞士法郎、轉機旅客 14.00 瑞士法郎。倫敦希斯洛：2025 年每位旅客收費上限約 23.73 英鎊。旅客費用多數轉嫁到機票稅費，所以遊戲只計入航空公司自行負擔的部分：每趟起降費（依機型）加按距離計的航管費，再加每位旅客 3 美元，全部乘以機場費率係數（0.6 到 1.8，設計值），再乘 1.3 的調整係數。

Singapore Changi: landing, parking and aerobridge fees for an A320-class narrowbody about S$1,200 per landing, rising to about S$1,725 by April 2030. Zurich: CHF 30.40 per departing local passenger, CHF 14.00 per transfer passenger. London Heathrow: 2025 price cap about GBP 23.73 per passenger. Passenger charges mostly pass through to ticket taxes, so the game counts only the airline-borne part: a per-departure fee by aircraft type plus distance-based navigation, plus US$3 per passenger, all times a city fee level (0.6-1.8, design) and a 1.3 scaling factor.

- Source: Changi Airport Group fee notices; CAPA (Zurich); UK CAA <https://changiairport.com/content/dam/cacorp/documents/changiairportgroup/list-of-fees-and-charges.pdf>
- Used for: AIRCRAFT.*.airportPerDep / navPerKm; CITIES.*.feeLevel; CONST.airportScale, CONST.paxCharge

## 參考票價 / Reference fares [verified]

2025 至 2026 年線上可見的單程經濟艙票價：台北到東京平均約 123 美元（最低約 168 起）、台北到曼谷 157 到 218 美元、蘇黎世到倫敦平均約 73 美元（最低 106 起）、蘇黎世到新加坡約 582 美元、倫敦到新加坡約 499 美元（525 起）、洛杉磯到台北 450 到 844 美元。參考票價公式：30 + 0.14 × 距離^0.9 美元，再乘機場費率（所得）係數與長程高艙等比重。遊戲的「平均票價」包含商務艙座位，長程高於經濟艙價格。

One-way economy fares visible online in 2025-26: Taipei-Tokyo average about US$123 (from about 168), Taipei-Bangkok 157-218, Zurich-London average about 73 (from 106), Zurich-Singapore about 582, London-Singapore about 499 (from 525), Los Angeles-Taipei 450-844. Reference fare: 30 + 0.14 x distance^0.9 US$, times a local price level (from the city fee level) and a premium-cabin share on long routes. The game’s average fare includes premium-cabin seats, so it sits above economy fares on long routes.

- Source: FareCompare, Kupi, Omio, airline route pages (lowest-fare aggregators; used as ranges, not averages of paid fares) <https://www.farecompare.com/flights/Zurich-ZRH/London-LON/market.html>
- Used for: refFareMid(); CONST.premiumUplift; CONST.fareTier

## 飛機日利用率 / Daily utilisation [secondary]

廉航通常每天超過 12 個輪擋小時（英國 CAA 摘要）；easyJet 11.9 小時（2012 年第三季，舊資料）；傳統航空短程約 8 到 9 小時（未附出處的常見說法）。遊戲的上限：窄體 11 小時，廉航 +1.5 小時；寬體 15 小時，廉航 +0.5 小時；渦槳 8 小時。上限不是平均值，因為每週班次由玩家決定。

Low-cost carriers typically exceed 12 block hours a day (UK CAA snippet); easyJet 11.9 h (Q3 FY2012, old); legacy short-haul about 8-9 h (commonly cited, no source). Game caps: narrowbody 11 h, low-cost +1.5 h; widebody 15 h, low-cost +0.5 h; turboprop 8 h. A cap, not an average, because the player sets weekly flights.

- Source: UK CAA; easyJet; Boeing ABS "Great Convergence" 2025 <https://services.boeing.com/bgsmedias/sys_master/noindex/h5a/h07/8978938986526/ABS-Great-Convergence-Low-Cost%20Carriers-2025/ABS-Great-Convergence-Low-Cost-Carriers-2025.pdf>
- Used for: AIRCRAFT.*.maxHoursPerDay; CONST.lcc.extraHours

## 燃油避險 / Fuel hedging [verified]

Ryanair 約 80% 到 84% 已避險（每桶 67 到 77 美元）；Lufthansa 在 2024 年底已避險 2025 年需求的 76%；SAS 未來 12 個月 0%。遊戲的避險：鎖定當時油價，費用 2%，展期後以市價重新鎖定；範例玩家用 50%。

Ryanair about 80-84% hedged at US$67-77/bbl; Lufthansa had hedged 76% of 2025 needs by end-2024; SAS 0% for the next 12 months. In the game a hedge locks the spot index at purchase for a 2% fee and rolls to the then-spot price at expiry; the sample operator hedges 50%.

- Source: Reuters-style factbox, Hydrocarbon Processing, March 2026 <https://www.hydrocarbonprocessing.com/news/2026/03/how-airlines-have-hedged-against-fuel-price-increases/>
- Used for: CONST.hedge

## 2008 年油價衝擊 / The 2008 oil shock [verified]

2008 年 6 月油價 107 美元時，IATA 把全年預測從獲利 96 億美元改為虧損 23 億美元；燃油帳單 1,760 億美元，比 2007 年多 400 億；2008 至 2009 兩年合計虧損約 310 億美元。2020 年初的預測是虧損 840 億美元。事件「油價暴漲」的指數 1.8 與 1.9 是這個量級的虛構版本。

At US$107 oil in June 2008 IATA swung its forecast from a US$9.6B profit to a US$2.3B loss; the fuel bill was US$176B, US$40B above 2007; 2008-09 combined loss about US$31B. Early 2020 forecast was a US$84B loss. The game’s oil-shock event (index 1.8 and 1.9) is a fictional version of that scale.

- Source: IATA 2008 outlook and later summaries <https://www.iata.org/en/pressroom/2025-releases/2025-12-09-01/>
- Used for: EVENTS b-oil, a-fuel

## 機場時段 / Airport slots [verified]

希斯洛機場法定上限為每年 48 萬架次，時段極度稀缺。遊戲中擁擠機場每週最多 14 班（時段事件後降為 7 班）是設計值。

Heathrow’s legal cap is 480,000 movements a year and slots are extremely scarce. The game’s 14 flights a week at congested airports (7 after the slot event) is a design value.

- Source: UK CAA / Heathrow <https://www.caa.co.uk/media/mhpbazy1/46-frontier-slot-scarcity-and-ticket-prices-at-heathrow.pdf>
- Used for: MODES.decade.slotCap; EVENTS b-slot

## 價格彈性 / Price elasticity [design]

IATA 委託 InterVISTAS 的研究方向明確：商務客彈性低於觀光客。我們沒讀到完整數值表，而且各家摘要對長程與短程誰的彈性較高說法不一致。遊戲取觀光 -1.6、商務 -0.7（設計值），長程再乘 0.8（依設計規格，長程較不敏感）。因為採份額模型，指數乘 2，使航班在 50% 市占時的有效彈性約等於設定值。

The InterVISTAS study for IATA is clear on direction: business travellers are less elastic than leisure. We could not read the full numeric tables, and summaries disagree on whether long-haul is more or less elastic than short-haul. The game uses leisure -1.6 and business -0.7 (design values), times 0.8 on long-haul (per the design spec). In a share model the exponent is doubled so that effective elasticity at a 50% share about equals the stated value.

- Source: InterVISTAS for IATA, "Estimating air travel demand elasticities" <https://www.iata.org/en/iata-repository/publications/economic-reports/estimating-air-travel-demand-elasticities---by-intervistas>
- Used for: CONST.elasticity; CONST.shareElasticityMult

## 需求模型 / Demand model [design]

重力模型（需求與兩地人口乘積成正比、隨距離遞減）是航空需求研究的標準做法；遊戲只取其形狀，常數 8,000 使台北到東京的整體市場約每週 6 萬人次、蘇黎世到倫敦約 5 萬人次，與公開的年旅客量同一個量級。城市人口為概略都會區數字。淡旺季曲線與 ±25% 幅度為設計值。

A gravity model (demand proportional to the product of populations, decaying with distance) is the standard form in air-demand research. The game uses only its shape; the constant 8,000 puts the Taipei-Tokyo total market near 60,000 passengers a week and Zurich-London near 50,000, the same order as published annual traffic. City populations are rough metro figures. Seasonal curves and the +/-25% swing are design values.

- Source: Academic air-demand literature (Mainz, NASA, EUR papers); general knowledge
- Used for: pairBase(); CITIES.*.pop / season

## Design values

- **各樞紐的票價指數 / Hub yield index**: TPE 1.17/1.23, NRT 1.09/1.10, SIN 1.32/1.33, DXB 1.20/1.23, ZRH 1.42/1.22 (year/decade). 把示範玩家的整體淨利率校準到約 5.5%，並讓五個樞紐的難度接近；數值高代表該樞紐的本地市場票價較貴或競爭較弱。這是校準值，不是量測值。 Calibrates the sample operator’s overall margin to about 5.5% and keeps the five hubs comparable in difficulty; a higher index means pricier fares or weaker competition at that hub. A calibration, not a measurement.
- **航班份額與對手 / Frequency share and rivals**: freq exponent 1.45 (business) / 1.2 (leisure); other carriers = 6 x (market/1000)^0.65 flights; spill p = 2. 班次越多，份額越大（S 形曲線）；商務客更看重班次。其他航空的班次隨市場大小增加；當週需求超過座位時，座位並不能全部賣出（溢出）。 More flights win disproportionate share (S-curve), more so for business travellers. Other carriers’ frequency grows with market size; when demand exceeds seats, not every seat sells (spill).
- **廉航參數 / Low-cost parameters**: fare 0.72 (short) to 0.86 (long) of full-service; business appeal 0.55, leisure 0.80; crew x0.86, ground x0.80, airport x0.88, overhead x0.72, distribution 1.5% vs 5.5%; seats +10 to 16%; transfers x0.25. 短程票價約低二成八，長程只低一成四；成本優勢在寬體機上只有一半。 Short-haul fares about 28% lower, long-haul 14%; the cost advantage is halved on widebodies.
- **新航線爬升期 / Route ramp-up**: year: 70%, 90%, 100% of potential; decade: 90%, 100%. 新航線前幾個回合只拿到部分客人。 New routes win only part of their potential in the first turns.
- **轉機旅客 / Transfer traffic**: K = 0.012 (year) / 0.03 (decade); detour limit 1.8; takes at most 60% of spare seats; through fare 92% of reference, split by leg distance. 兩條支線經樞紐轉接的潛在旅客，視繞路程度、班次與票價而定；一年模式只有小幅效果。 Potential connecting passengers between two spokes depend on detour, frequency and fare; the effect is small in Year mode.
- **貸款與買機 / Loans and purchases**: 20% down, 80% loan, 12-year amortisation, floating base rate 5.5%, 25-year depreciation to 10% residual, resale at 92% of book (70% in the pandemic), lease return fee 2 months, government relief loan 3%. 買機自付兩成，其餘貸款；浮動利率；疫情期間二手機價下跌。 20% down, floating-rate loan, resale value drops in the pandemic.
- **管理費用與起降費係數 / Overhead and scaling**: overhead US$330k + 70k per aircraft a month; route launch US$120k; airport scale 1.3; ground labour US$1,300 per departure + 11 per passenger. 固定成本隨機隊擴大；新航線有開辦費。 Fixed costs grow with the fleet; new routes carry a launch cost.
- **起始資金與機隊 / Starting cash and fleet**: year: US$45M and 2 x MQ-320 leased; decade: US$150M, 2 x MQ-320 and 1 x MQ-190 leased. 設計值。 Design values.

## Verification summary

- 查到：IATA 2025/2026 展望（淨利率、載客率、燃油與人事占比）、IATA 成本結構（燃油 28.7%、折舊 9.1%、機組 8.6%、維修 8.4%、行政 7.7%、場站 7.1%、航管 4.3%）、窄體與寬體租金、A320neo 與 777-300ER 油耗、Ryanair 輔助收入與單位成本、樟宜與蘇黎世費用、線上票價範例、避險比例。
- 沒查到原始來源（以設計值處理）：損益平衡載客率 80%、廉航與傳統航空的每座位公里成本比、彈性數值、支線機與渦槳的成本、A350 油耗的實測值、各機場的完整收費表。
- 各家資料對長程彈性的說法互相矛盾，遊戲依設計規格取「長程較不敏感」，並標為設計值。
- Found: IATA 2025/2026 outlook (margin, load factor, fuel and labour shares), IATA cost structure (fuel 28.7%, depreciation 9.1%, crew 8.6%, maintenance 8.4%, G&A 7.7%, station 7.1%, navigation 4.3%), narrowbody and widebody lease rates, A320neo and 777-300ER fuel burn, Ryanair ancillary revenue and unit cost, Changi and Zurich charges, online fare examples, hedge ratios.
- Not found in a primary source (treated as design values): the 80% industry break-even load factor, the low-cost vs full-service CASK ratio, numeric elasticities, regional-jet and turboprop costs, a measured A350 burn, full airport tariff tables.
- Sources contradict each other on whether long-haul is more or less elastic; the game follows the design spec (less sensitive) and flags it as a design value.
