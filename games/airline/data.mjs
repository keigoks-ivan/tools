// 天青航空：航線經營 — game data (pure ES module, no DOM).
// Every number is either from a public source (see sources.mjs, tag 'verified') or a design value (tag 'design').
// Money is US$ (constant dollars, no inflation). Distances km. Fuel in kg.

export const AIRLINE = { zh: '天青航空', en: 'Skyglaze' };
export const HUBS = ['TPE', 'NRT', 'SIN', 'DXB', 'ZRH'];

// ---------------------------------------------------------------- constants
export const CONST = {
  industryMargin: 0.039,        // IATA 2025/2026 net margin
  fuelPriceUsdPerKg: 0.72,      // jet fuel ~ US$100/bbl incl. crack spread (design; IATA 2025 crude ~US$90)
  routeFactor: 1.04,            // flown distance vs great circle (design)
  taxiClimbHours: 0.55,         // fixed block-time overhead per flight (design)
  maxWeekly: 28,                // 4 round trips a day
  fareTier: { low: 0.8, mid: 1.0, high: 1.25 },       // design
  segFare: { biz: 1.6, lei: 0.8 },                      // fare paid by segment relative to the reference fare (design)
  elasticity: { biz: 0.7, lei: 1.6 },                   // InterVISTAS-style values, flagged design
  shareElasticityMult: 1.0,     // a small entrant has low share in the observed total market; k=e approximates its elasticity
  freqExp: { biz: 1.12, lei: 1.05 },
  seatsRef: 160,
  spillP: 8, transferSpareShare: 0.6, connectionReserve: 0.15, premiumUplift: 0.25,
  ramp: { year: [0.7, 0.9, 1], decade: [0.9, 1] },
  rampLabel: 'age 0,1,2 turns',
  hedge: { premium: 0.02, tenor: { year: 9, decade: 4 } },
  tiers: ['low', 'mid', 'high'],
  // costs not tied to an aircraft type (US$)
  groundLabourPerDep: 1300, groundLabourPerPax: 11, crewScale: 1.25, airportScale: 1.3, fareScale: 1, hubDemand: { TPE: 1, NRT: 1, SIN: 1, DXB: 1, ZRH: 1 }, hubYield: { TPE: { year: 1.1659, decade: 1.145 }, NRT: { year: 1.1171, decade: 1.0763 }, SIN: { year: 1.0985, decade: 1.0855 }, DXB: { year: 1.0843, decade: 1.0537 }, ZRH: { year: 1.1461, decade: 1.08 } }, transferHandling: 14,
  paxCharge: 3.0,
  distribution: { fsc: 0.055, lcc: 0.015 },
  overhead: { base: 330000, perAircraft: 70000 },   // per month
  launchCostPerRoute: 120000,                       // per month-equivalent; scaled by mpt^0.5
  returnLeaseMonths: 2,
  loan: { downPct: 0.2, termYears: 12, baseRate: 0.055, spread: 0 },
  deprYears: 25, residualPct: 0.1,
  resaleVsBook: 0.92,
  govLoanRate: 0.03,
  ancillary: { fsc: { base: 6, pct: 0.02 }, lcc: { base: 20, pct: 0.045 } },
  lcc: {
    fareFactorShort: 0.8, fareFactorLong: 0.95,   // LCC reference discount; simplified design assumption, not measured fares
    quality: { biz: 0.55, lei: 1.15 },
    crewMult: 0.86, groundMult: 0.8, airportMult: 0.88, overheadMult: 0.72, extraHours: 1.5, transferMult: 0.1,
    switchCostPerAircraft: 450000, switchDemandHit: 0.9
  },
  fsc: { quality: { biz: 1, lei: 1 } },
  transferDetourMax: 1.8,
  baseRate: 0.055
};

// ---------------------------------------------------------------- modes
export const MODES = {
  year: {
    id: 'year', zh: '一年', en: 'One Year',
    descZh: '12 個月。三種機型、一家對手、約八件預定事件。',
    descEn: '12 months. 3 aircraft types, 1 rival, ~8 scripted events.',
    turns: 12, monthsPerTurn: 1, weeksPerTurn: 52 / 12,
    startCash: 45e6,
    types: ['MQ-72', 'MQ-320', 'MQ-350'],
    startFleet: { 'MQ-320': 2 },
    rivals: 1, loans: false, buy: false, slots: false, hedgeFromTurn: 2,
    transferK: 0.012, demandScale: 1, yieldScale: 1, growthPerYear: 0, maxWeekly: 28,
    modelChoiceTurn: 5   // 0-based: month 6
  },
  decade: {
    id: 'decade', zh: '十年', en: 'Ten Years',
    descZh: '共 20 回合。六種機型、兩家對手、買機貸款、機場時段限制、轉機旅客與景氣循環。',
    descEn: '20 turns. 6 types, 2 rivals, buy-with-loan, airport slots, transfer traffic and a boom/bust cycle.',
    turns: 20, monthsPerTurn: 6, weeksPerTurn: 26,
    startCash: 150e6,
    types: ['MQ-72', 'MQ-190', 'MQ-320', 'MQ-321', 'MQ-350', 'MQ-400'],
    startFleet: { 'MQ-320': 2, 'MQ-190': 1 },
    rivals: 2, loans: true, buy: true, slots: true, hedgeFromTurn: 0,
    transferK: 0.03, demandScale: 1, yieldScale: 1, growthPerYear: 0.025, maxWeekly: 28, slotCap: 14, hubSlotCap: 110,
    modelChoiceTurn: 0
  }
};

// ---------------------------------------------------------------- seasonality profiles (12 months, Jan..Dec; normalised to mean 1)
const norm = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.map(v => +(v / m).toFixed(3)); };
const SEASON = {
  north: norm([0.82, 0.80, 0.93, 1.00, 1.05, 1.12, 1.22, 1.22, 1.05, 1.00, 0.88, 0.92]),
  asia: norm([1.08, 1.05, 0.95, 0.95, 0.95, 1.00, 1.10, 1.10, 0.95, 1.00, 0.95, 1.06]),
  gulf: norm([1.12, 1.10, 1.05, 0.95, 0.82, 0.75, 0.80, 0.82, 0.90, 1.05, 1.15, 1.20]),
  south: norm([1.20, 1.05, 0.95, 1.00, 0.88, 0.85, 0.95, 0.90, 0.95, 1.00, 1.00, 1.20]),
  tropic: norm([1.10, 1.00, 0.95, 0.90, 0.85, 0.85, 0.95, 0.95, 0.90, 1.00, 1.10, 1.20])
};

// ---------------------------------------------------------------- cities
// pop = effective air-travel catchment millions (design, not a census count); business/tourism 0..1 weights; feeLevel multiplies airport charges (design, ~0.6 Asia low-cost to ~1.8 London/Zurich)
const C = (id, zh, en, lat, lon, pop, business, tourism, season, feeLevel, slotLimited, blurbZh, blurbEn) =>
  ({ id, zh, en, lat, lon, pop, business, tourism, season: SEASON[season], feeLevel, slotLimited, blurbZh, blurbEn });
export const CITIES = {};
[
  C('TPE', '台北桃園', 'Taipei Taoyuan', 25.08, 121.23, 7.0, 0.75, 0.55, 'asia', 0.8, false, '位於東北亞與東南亞之間，適合做轉機中繼。', 'Between Northeast and Southeast Asia; a natural transfer point.'),
  C('NRT', '東京成田', 'Tokyo Narita', 35.77, 140.39, 37, 0.9, 0.75, 'asia', 1.5, true, '全球最大的都會區之一，但機場起降費高、時段緊。', 'One of the largest metro areas, but landing fees are high and slots are tight.'),
  C('KIX', '大阪關西', 'Osaka Kansai', 34.43, 135.23, 19, 0.6, 0.85, 'asia', 1.3, false, '觀光客多，商務客較少。', 'Strong tourism, lighter on business travel.'),
  C('ICN', '首爾仁川', 'Seoul Incheon', 37.46, 126.44, 25, 0.75, 0.7, 'asia', 1.0, false, '商務與觀光並重的大市場。', 'A large market with both business and leisure demand.'),
  C('PVG', '上海浦東', 'Shanghai Pudong', 31.14, 121.81, 27, 0.85, 0.45, 'asia', 0.9, false, '以商務客為主的金融與製造中心。', 'A business-heavy finance and manufacturing centre.'),
  C('PEK', '北京首都', 'Beijing Capital', 40.08, 116.58, 21, 0.9, 0.5, 'asia', 0.9, true, '政治與商務中心，時段緊。', 'Political and business centre; slots are tight.'),
  C('HKG', '香港', 'Hong Kong', 22.31, 113.91, 7.5, 0.85, 0.7, 'asia', 1.1, true, '國際轉運樞紐，航班密度高、競爭激烈。', 'An international hub with dense, fiercely competitive service.'),
  C('MNL', '馬尼拉', 'Manila', 14.51, 121.02, 14, 0.5, 0.6, 'tropic', 0.8, true, '人口多，跑道容量緊，客人偏價格敏感。', 'Large population, cramped runway capacity, price-sensitive travellers.'),
  C('BKK', '曼谷', 'Bangkok', 13.69, 100.75, 11, 0.55, 1.0, 'tropic', 0.7, false, '東南亞最大的觀光目的地之一。', 'One of Southeast Asia’s biggest tourist destinations.'),
  C('SIN', '新加坡', 'Singapore', 1.36, 103.99, 5.9, 0.9, 0.75, 'asia', 1.1, false, '沒有國內線，所有航班都是國際線。', 'No domestic market; every flight is international.'),
  C('KUL', '吉隆坡', 'Kuala Lumpur', 2.74, 101.70, 8, 0.6, 0.7, 'tropic', 0.65, false, '廉價航空的大本營，票價競爭激烈。', 'A low-cost-carrier stronghold with fierce fare competition.'),
  C('SGN', '胡志明市', 'Ho Chi Minh City', 10.82, 106.66, 10, 0.55, 0.65, 'tropic', 0.6, false, '快速成長的市場，費用低。', 'A fast-growing market with low costs.'),
  C('CGK', '雅加達', 'Jakarta', -6.13, 106.66, 25, 0.6, 0.5, 'tropic', 0.7, false, '人口龐大的東南亞最大都會區。', 'Southeast Asia’s largest metro area by population.'),
  C('DEL', '德里', 'Delhi', 28.56, 77.10, 32, 0.7, 0.6, 'asia', 0.8, true, '人口龐大、成長快，機場吃緊。', 'Huge and growing, but the airport is stretched.'),
  C('BOM', '孟買', 'Mumbai', 19.09, 72.87, 21, 0.8, 0.5, 'asia', 0.9, true, '單跑道運作，時段非常稀缺。', 'A single working runway makes slots very scarce.'),
  C('DXB', '杜拜', 'Dubai', 25.25, 55.36, 3.6, 0.8, 1.0, 'gulf', 0.9, false, '地理位置居中，是歐亞非之間的轉機樞紐。', 'Geographically central; a transfer hub between Europe, Asia and Africa.'),
  C('DOH', '杜哈', 'Doha', 25.27, 51.61, 2.5, 0.7, 0.6, 'gulf', 0.9, false, '以轉機為主的海灣樞紐。', 'A Gulf hub built around connecting traffic.'),
  C('IST', '伊斯坦堡', 'Istanbul', 41.26, 28.74, 16, 0.65, 0.9, 'north', 0.8, false, '橫跨歐亞，觀光與轉機並重。', 'Spans Europe and Asia; strong tourism and transfers.'),
  C('LHR', '倫敦希斯洛', 'London Heathrow', 51.47, -0.45, 15, 1.0, 0.85, 'north', 1.8, true, '商務需求最強，但起降時段幾乎買不到。', 'The strongest business demand, but landing slots are nearly impossible to get.'),
  C('CDG', '巴黎戴高樂', 'Paris CDG', 49.01, 2.55, 12, 0.85, 1.0, 'north', 1.5, false, '觀光與商務都強的歐洲大市場。', 'A major European market strong in both tourism and business.'),
  C('FRA', '法蘭克福', 'Frankfurt', 50.03, 8.57, 5.5, 1.0, 0.45, 'north', 1.5, true, '歐洲商務樞紐，夜間限制多。', 'A European business hub with night-flight limits.'),
  C('AMS', '阿姆斯特丹', 'Amsterdam', 52.31, 4.76, 6, 0.85, 0.75, 'north', 1.4, true, '起降量有政府上限。', 'Movements are capped by the government.'),
  C('ZRH', '蘇黎世', 'Zurich', 47.46, 8.55, 4.5, 0.95, 0.6, 'north', 1.7, true, '市場小但富裕，成本很高。', 'A small, rich market with very high costs.'),
  C('FCO', '羅馬', 'Rome', 41.80, 12.25, 4.3, 0.5, 1.0, 'north', 1.1, false, '以觀光為主，夏季特別旺。', 'Tourism-led, with a strong summer peak.'),
  C('MAD', '馬德里', 'Madrid', 40.49, -3.57, 6.8, 0.65, 0.85, 'north', 1.0, false, '連結歐洲與拉丁美洲的市場。', 'A market linking Europe and Latin America.'),
  C('LAX', '洛杉磯', 'Los Angeles', 33.94, -118.41, 13, 0.8, 0.8, 'north', 1.4, false, '跨太平洋的主要門戶。', 'A main transpacific gateway.'),
  C('SFO', '舊金山', 'San Francisco', 37.62, -122.38, 7.7, 0.95, 0.7, 'north', 1.5, false, '科技業商務客多。', 'Heavy tech-industry business travel.'),
  C('JFK', '紐約甘迺迪', 'New York JFK', 40.64, -73.78, 20, 1.0, 0.85, 'north', 1.7, true, '北美最大的國際線市場，時段緊。', 'North America’s biggest international market; slots are tight.'),
  C('YVR', '溫哥華', 'Vancouver', 49.19, -123.18, 2.6, 0.6, 0.8, 'north', 1.1, false, '亞洲移民多，連結亞太的門戶。', 'Large Asian diaspora; a gateway to Asia-Pacific.'),
  C('SYD', '雪梨', 'Sydney', -33.94, 151.18, 5.3, 0.7, 0.8, 'south', 1.4, true, '澳洲最大門戶，有夜間宵禁與時段上限。', 'Australia’s biggest gateway, with a curfew and slot cap.'),
  C('MEL', '墨爾本', 'Melbourne', -37.67, 144.84, 5.1, 0.7, 0.7, 'south', 1.2, false, '澳洲第二大都會，學生與商務客多。', 'Australia’s second city, with many students and business travellers.'),
  C('AKL', '奧克蘭', 'Auckland', -37.01, 174.79, 1.7, 0.5, 0.85, 'south', 1.2, false, '市場小、距離遠，只適合少量長程航班。', 'A small, remote market that suits only a few long-haul flights.'),
  // New catchments use 65% of approximate metro/island size to represent air-travel participation (design).
  C('KHH', '高雄', 'Kaohsiung', 22.5771, 120.35, 1.82, 0.55, 0.55, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('RMQ', '台中', 'Taichung', 24.2647, 120.621, 1.885, 0.6, 0.5, 'asia', 0.7, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('HUN', '花蓮', 'Hualien', 24.0232, 121.618, 0.195, 0.15, 0.85, 'asia', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('MZG', '澎湖', 'Penghu', 23.5687, 119.628, 0.078, 0.1, 0.95, 'asia', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('KNH', '金門', 'Kinmen', 24.4279, 118.359, 0.091, 0.2, 0.65, 'asia', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('FUK', '福岡', 'Fukuoka', 33.5859, 130.451, 1.69, 0.6, 0.8, 'asia', 1.15, true, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('NGO', '名古屋中部', 'Nagoya Chubu', 34.8584, 136.805, 5.85, 0.8, 0.6, 'asia', 1.25, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('CTS', '札幌新千歲', 'Sapporo New Chitose', 42.7748, 141.6904, 1.69, 0.45, 0.95, 'asia', 1.1, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('OKA', '沖繩那霸', 'Okinawa Naha', 26.1924, 127.6398, 0.975, 0.3, 1.0, 'asia', 1.0, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('KOJ', '鹿兒島', 'Kagoshima', 31.8034, 130.719, 0.4225, 0.3, 0.75, 'asia', 1.0, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('SDJ', '仙台', 'Sendai', 38.1397, 140.917, 1.04, 0.55, 0.6, 'asia', 1.05, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('HIJ', '廣島', 'Hiroshima', 34.4361, 132.919, 0.91, 0.55, 0.75, 'asia', 1.05, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('TAK', '高松', 'Takamatsu', 34.215, 134.0155, 0.52, 0.4, 0.7, 'asia', 0.95, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('KMJ', '熊本', 'Kumamoto', 32.8373, 130.855, 0.78, 0.6, 0.75, 'asia', 1.0, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('PUS', '釜山金海', 'Busan Gimhae', 35.1795, 128.938, 2.275, 0.6, 0.8, 'asia', 0.9, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CJU', '濟州', 'Jeju', 33.5121, 126.4925, 0.455, 0.2, 1.0, 'asia', 0.8, true, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CAN', '廣州白雲', 'Guangzhou Baiyun', 23.3924, 113.299, 11.7, 0.8, 0.55, 'asia', 0.9, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('SZX', '深圳寶安', 'Shenzhen Bao\'an', 22.6395, 113.8033, 11.05, 0.9, 0.4, 'asia', 0.9, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('XMN', '廈門高崎', 'Xiamen Gaoqi', 24.5439, 118.1275, 3.25, 0.65, 0.8, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('FOC', '福州長樂', 'Fuzhou Changle', 25.9293, 119.6725, 2.6, 0.55, 0.55, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('HGH', '杭州蕭山', 'Hangzhou Xiaoshan', 30.2361, 120.4289, 7.8, 0.75, 0.85, 'asia', 0.85, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('NKG', '南京祿口', 'Nanjing Lukou', 31.735, 118.8659, 5.85, 0.75, 0.6, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('TFU', '成都天府', 'Chengdu Tianfu', 30.3125, 104.4413, 10.4, 0.6, 0.85, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CKG', '重慶江北', 'Chongqing Jiangbei', 29.7123, 106.6519, 10.4, 0.65, 0.7, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('WUH', '武漢天河', 'Wuhan Tianhe', 30.7748, 114.2137, 7.15, 0.7, 0.5, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('XIY', '西安咸陽', 'Xi\'an Xianyang', 34.4422, 108.7624, 5.85, 0.55, 0.95, 'asia', 0.75, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('KMG', '昆明長水', 'Kunming Changshui', 25.1103, 102.9367, 3.9, 0.4, 0.85, 'asia', 0.7, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('TAO', '青島膠東', 'Qingdao Jiaodong', 36.362, 120.0882, 4.55, 0.65, 0.7, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('DLC', '大連周水子', 'Dalian Zhoushuizi', 38.9657, 121.5385, 2.6, 0.6, 0.65, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('TSN', '天津濱海', 'Tianjin Binhai', 39.1244, 117.346, 6.5, 0.7, 0.5, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CSX', '長沙黃花', 'Changsha Huanghua', 28.1892, 113.22, 3.9, 0.55, 0.6, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('HAK', '海口美蘭', 'Haikou Meilan', 19.9349, 110.459, 1.82, 0.3, 0.9, 'asia', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('SYX', '三亞鳳凰', 'Sanya Phoenix', 18.3029, 109.412, 0.65, 0.2, 1.0, 'asia', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('MFM', '澳門', 'Macau', 22.1496, 113.592, 0.455, 0.35, 1.0, 'asia', 0.9, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('HAN', '河內內排', 'Hanoi Noi Bai', 21.2212, 105.807, 5.2, 0.6, 0.75, 'tropic', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('DAD', '峴港', 'Da Nang', 16.0439, 108.199, 0.845, 0.25, 1.0, 'tropic', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CXR', '芽莊金蘭', 'Nha Trang Cam Ranh', 11.9982, 109.219, 0.52, 0.2, 1.0, 'tropic', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('PQC', '富國島', 'Phu Quoc', 10.1698, 103.9935, 0.13, 0.1, 1.0, 'tropic', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('HKT', '普吉島', 'Phuket', 8.1133, 98.3174, 0.4225, 0.25, 1.0, 'tropic', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CNX', '清邁', 'Chiang Mai', 18.7668, 98.9626, 0.78, 0.25, 0.95, 'tropic', 0.65, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('USM', '蘇梅島', 'Koh Samui', 9.5478, 100.062, 0.052, 0.15, 1.0, 'tropic', 1.05, true, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CEB', '宿霧', 'Cebu', 10.3093, 123.9797, 1.95, 0.4, 0.9, 'tropic', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CRK', '克拉克', 'Clark', 15.186, 120.56, 1.3, 0.4, 0.55, 'tropic', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('DVO', '達沃', 'Davao', 7.1255, 125.646, 1.17, 0.4, 0.5, 'tropic', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('ILO', '伊洛伊洛', 'Iloilo', 10.833, 122.4934, 0.65, 0.3, 0.55, 'tropic', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('PEN', '檳城', 'Penang', 5.2963, 100.2762, 1.17, 0.7, 0.85, 'tropic', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('BKI', '亞庇', 'Kota Kinabalu', 5.9327, 116.0493, 0.585, 0.3, 0.95, 'tropic', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('KCH', '古晉', 'Kuching', 1.4874, 110.3529, 0.455, 0.3, 0.7, 'tropic', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('LGK', '蘭卡威', 'Langkawi', 6.3297, 99.7287, 0.078, 0.1, 1.0, 'tropic', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('DPS', '峇里島登巴薩', 'Bali Denpasar', -8.7484, 115.1671, 1.3, 0.3, 1.0, 'tropic', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('SUB', '泗水', 'Surabaya', -7.3798, 112.787, 6.5, 0.6, 0.4, 'tropic', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('KNO', '棉蘭瓜拉納穆', 'Medan Kualanamu', 3.6378, 98.8706, 2.6, 0.4, 0.5, 'tropic', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('YIA', '日惹', 'Yogyakarta', -7.9053, 110.0573, 1.95, 0.25, 0.9, 'tropic', 0.6, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('BWN', '汶萊斯里巴加灣', 'Bandar Seri Begawan', 4.9442, 114.928, 0.2275, 0.5, 0.45, 'tropic', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('KTI', '金邊德崇', 'Phnom Penh Techo', 11.36, 104.9213, 1.495, 0.4, 0.65, 'tropic', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('SAI', '暹粒吳哥', 'Siem Reap Angkor', 13.3697, 104.2238, 0.325, 0.15, 1.0, 'tropic', 0.65, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('VTE', '永珍', 'Vientiane', 17.9851, 102.5667, 0.52, 0.3, 0.5, 'tropic', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('RGN', '仰光', 'Yangon', 16.9073, 96.1332, 3.25, 0.4, 0.5, 'tropic', 0.6, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CCU', '加爾各答', 'Kolkata', 22.654, 88.4476, 9.75, 0.55, 0.6, 'asia', 0.7, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('BLR', '班加羅爾', 'Bengaluru', 13.1979, 77.7063, 8.45, 0.9, 0.4, 'asia', 0.85, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('MAA', '清奈', 'Chennai', 12.99, 80.1693, 7.15, 0.7, 0.45, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('HYD', '海德拉巴', 'Hyderabad', 17.2313, 78.4299, 6.5, 0.8, 0.45, 'asia', 0.8, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('COK', '科欽', 'Kochi', 10.151, 76.4008, 1.95, 0.4, 0.8, 'asia', 0.7, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('DAC', '達卡', 'Dhaka', 23.8433, 90.3978, 13.0, 0.5, 0.3, 'asia', 0.65, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CMB', '可倫坡', 'Colombo', 7.1808, 79.8841, 3.25, 0.45, 0.9, 'tropic', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('MLE', '馬累', 'Male', 4.1918, 73.5291, 0.325, 0.25, 1.0, 'tropic', 0.9, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('KTM', '加德滿都', 'Kathmandu', 27.6966, 85.3591, 1.95, 0.25, 0.95, 'asia', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('KHI', '喀拉蚩', 'Karachi', 24.9065, 67.1608, 11.05, 0.6, 0.3, 'asia', 0.7, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('ISB', '伊斯蘭馬巴德', 'Islamabad', 33.549, 72.8257, 2.6, 0.55, 0.45, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('TAS', '塔什干', 'Tashkent', 41.2579, 69.2812, 1.95, 0.55, 0.6, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('ALA', '阿拉木圖', 'Almaty', 43.3543, 77.0428, 1.625, 0.6, 0.7, 'asia', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('UBN', '烏蘭巴托成吉思汗', 'Ulaanbaatar', 47.6469, 106.8198, 0.975, 0.4, 0.7, 'asia', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('AUH', '阿布達比', 'Abu Dhabi', 24.441, 54.6492, 1.17, 0.8, 0.8, 'gulf', 0.95, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('RUH', '利雅德', 'Riyadh', 24.9576, 46.6988, 4.55, 0.8, 0.45, 'gulf', 0.9, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('JED', '吉達', 'Jeddah', 21.6802, 39.1574, 3.055, 0.55, 0.9, 'gulf', 0.85, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('MCT', '馬斯喀特', 'Muscat', 23.6002, 58.2853, 1.04, 0.5, 0.8, 'gulf', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('BAH', '巴林', 'Bahrain', 26.2673, 50.6376, 0.975, 0.7, 0.6, 'gulf', 0.9, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('KWI', '科威特', 'Kuwait City', 29.2245, 47.9698, 1.95, 0.7, 0.3, 'gulf', 0.9, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('AMM', '安曼', 'Amman', 31.7226, 35.9932, 2.6, 0.5, 0.75, 'gulf', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('MUC', '慕尼黑', 'Munich', 48.3538, 11.7861, 1.95, 0.9, 0.8, 'north', 1.4, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('BER', '柏林', 'Berlin', 52.3617, 13.5023, 3.25, 0.7, 0.9, 'north', 1.2, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('DUS', '杜塞道夫', 'Dusseldorf', 51.2895, 6.7668, 3.25, 0.85, 0.45, 'north', 1.25, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('VIE', '維也納', 'Vienna', 48.1103, 16.5697, 1.82, 0.75, 0.95, 'north', 1.25, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('PRG', '布拉格', 'Prague', 50.1009, 14.2599, 1.3, 0.55, 1.0, 'north', 1.0, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('BUD', '布達佩斯', 'Budapest', 47.4302, 19.2624, 1.755, 0.5, 0.95, 'north', 0.9, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('WAW', '華沙', 'Warsaw', 52.1657, 20.9671, 1.95, 0.75, 0.55, 'north', 1.0, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CPH', '哥本哈根', 'Copenhagen', 55.6179, 12.656, 1.3, 0.85, 0.8, 'north', 1.3, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('ARN', '斯德哥爾摩', 'Stockholm', 59.6485, 17.9288, 1.56, 0.85, 0.7, 'north', 1.3, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('OSL', '奧斯陸', 'Oslo', 60.1939, 11.1004, 0.975, 0.8, 0.7, 'north', 1.3, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('HEL', '赫爾辛基', 'Helsinki', 60.3184, 24.9633, 1.04, 0.8, 0.65, 'north', 1.25, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('DUB', '都柏林', 'Dublin', 53.4287, -6.2621, 1.3, 0.85, 0.85, 'north', 1.15, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('MAN', '曼徹斯特', 'Manchester', 53.3494, -2.2795, 1.95, 0.75, 0.65, 'north', 1.25, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('BCN', '巴塞隆納', 'Barcelona', 41.2971, 2.0785, 3.575, 0.65, 1.0, 'north', 1.1, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('LIS', '里斯本', 'Lisbon', 38.7813, -9.1359, 1.95, 0.55, 1.0, 'north', 1.0, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('MXP', '米蘭馬爾彭薩', 'Milan Malpensa', 45.6306, 8.7281, 4.55, 0.9, 0.8, 'north', 1.25, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('ATH', '雅典', 'Athens', 37.9364, 23.9445, 2.47, 0.5, 1.0, 'north', 1.0, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('BRU', '布魯塞爾', 'Brussels', 50.9014, 4.4844, 1.95, 0.9, 0.65, 'north', 1.3, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('GVA', '日內瓦', 'Geneva', 46.2381, 6.109, 0.65, 0.95, 0.8, 'north', 1.6, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('KEF', '雷克雅維克凱夫拉維克', 'Reykjavik Keflavik', 63.985, -22.6056, 0.1625, 0.4, 1.0, 'north', 1.2, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('ZAG', '札格雷布', 'Zagreb', 45.7429, 16.0688, 0.715, 0.5, 0.75, 'north', 0.9, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('SEA', '西雅圖', 'Seattle', 47.4479, -122.3103, 2.6, 0.9, 0.7, 'north', 1.3, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('ORD', '芝加哥歐海爾', 'Chicago O\'Hare', 41.9786, -87.9048, 6.175, 0.9, 0.65, 'north', 1.35, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('BOS', '波士頓', 'Boston', 42.362, -71.0079, 3.25, 0.9, 0.8, 'north', 1.4, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('IAD', '華盛頓杜勒斯', 'Washington Dulles', 38.9445, -77.4558, 3.9, 0.95, 0.75, 'north', 1.4, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('DFW', '達拉斯沃斯堡', 'Dallas Fort Worth', 32.8968, -97.038, 5.2, 0.85, 0.5, 'north', 1.2, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('IAH', '休士頓', 'Houston', 29.9844, -95.3414, 4.55, 0.85, 0.5, 'north', 1.2, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('ATL', '亞特蘭大', 'Atlanta', 33.6367, -84.4281, 3.9, 0.8, 0.5, 'north', 1.25, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('MIA', '邁阿密', 'Miami', 25.796, -80.2898, 3.9, 0.6, 1.0, 'north', 1.25, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('LAS', '拉斯維加斯', 'Las Vegas', 36.0834, -115.1518, 1.495, 0.4, 1.0, 'north', 1.1, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('SAN', '聖地牙哥', 'San Diego', 32.7336, -117.19, 2.145, 0.7, 0.85, 'north', 1.25, true, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('HNL', '檀香山', 'Honolulu', 21.3184, -157.9257, 0.65, 0.3, 1.0, 'north', 1.15, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('YYZ', '多倫多', 'Toronto', 43.6759, -79.6294, 4.55, 0.9, 0.7, 'north', 1.35, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('YUL', '蒙特婁', 'Montreal', 45.4678, -73.7423, 2.795, 0.75, 0.85, 'north', 1.2, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('YYC', '卡加利', 'Calgary', 51.1188, -114.0099, 1.04, 0.8, 0.65, 'north', 1.15, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('MEX', '墨西哥城', 'Mexico City', 19.4358, -99.0703, 14.3, 0.75, 0.75, 'north', 0.85, true, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CUN', '坎昆', 'Cancun', 21.0408, -86.8735, 0.65, 0.2, 1.0, 'north', 0.8, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('GRU', '聖保羅瓜魯柳斯', 'Sao Paulo Guarulhos', -23.4313, -46.47, 14.3, 0.85, 0.6, 'south', 1.0, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('GIG', '里約熱內盧', 'Rio de Janeiro', -22.81, -43.2506, 7.8, 0.55, 1.0, 'south', 0.95, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('EZE', '布宜諾斯艾利斯', 'Buenos Aires', -34.8222, -58.5358, 9.75, 0.65, 0.85, 'south', 0.9, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('SCL', '聖地亞哥', 'Santiago', -33.393, -70.7858, 4.55, 0.75, 0.7, 'south', 0.9, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('LIM', '利馬', 'Lima', -12.0219, -77.1143, 7.15, 0.55, 0.8, 'south', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('BOG', '波哥大', 'Bogota', 4.7016, -74.1469, 7.15, 0.6, 0.65, 'south', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('UIO', '基多', 'Quito', -0.1254, -78.3543, 1.95, 0.4, 0.85, 'south', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('PTY', '巴拿馬城', 'Panama City', 9.0714, -79.3835, 1.3, 0.65, 0.7, 'south', 0.85, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CAI', '開羅', 'Cairo', 30.1115, 31.3967, 13.65, 0.55, 1.0, 'gulf', 0.75, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CMN', '卡薩布蘭卡', 'Casablanca', 33.3675, -7.59, 2.925, 0.6, 0.75, 'gulf', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('RAK', '馬拉喀什', 'Marrakesh', 31.6048, -8.0358, 0.845, 0.2, 1.0, 'gulf', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('JNB', '約翰尼斯堡', 'Johannesburg', -26.1401, 28.2468, 6.5, 0.7, 0.65, 'south', 0.85, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CPT', '開普敦', 'Cape Town', -33.974, 18.6043, 3.12, 0.55, 1.0, 'south', 0.85, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('NBO', '奈洛比', 'Nairobi', -1.3189, 36.9282, 3.25, 0.6, 0.8, 'tropic', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('ADD', '阿迪斯阿貝巴', 'Addis Ababa', 8.9779, 38.7993, 3.25, 0.5, 0.5, 'tropic', 0.7, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('LOS', '拉哥斯', 'Lagos', 6.5774, 3.3212, 10.4, 0.65, 0.3, 'tropic', 0.8, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('ACC', '阿克拉', 'Accra', 5.6052, -0.1668, 2.6, 0.5, 0.55, 'tropic', 0.75, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('MRU', '模里西斯', 'Mauritius', -20.4302, 57.6836, 0.845, 0.35, 1.0, 'tropic', 0.85, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('SEZ', '塞席爾', 'Seychelles', -4.6743, 55.5218, 0.065, 0.15, 1.0, 'tropic', 0.9, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('ZNZ', '桑吉巴', 'Zanzibar', -6.222, 39.2249, 0.39, 0.15, 1.0, 'tropic', 0.7, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('BNE', '布里斯本', 'Brisbane', -27.3842, 153.117, 1.755, 0.65, 0.85, 'south', 1.2, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('PER', '伯斯', 'Perth', -31.9403, 115.967, 1.495, 0.8, 0.7, 'south', 1.2, false, '商務需求較強，班次便利性很重要。', 'Business-led demand; convenient frequency matters.'),
  C('ADL', '阿德雷德', 'Adelaide', -34.9475, 138.5334, 0.91, 0.55, 0.7, 'south', 1.1, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('OOL', '黃金海岸', 'Gold Coast', -28.166, 153.5066, 0.52, 0.25, 1.0, 'south', 1.0, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('CNS', '凱恩斯', 'Cairns', -16.8789, 145.7495, 0.1105, 0.2, 1.0, 'south', 1.0, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('DRW', '達爾文', 'Darwin', -12.415, 130.8818, 0.0975, 0.4, 0.65, 'south', 1.05, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('CHC', '基督城', 'Christchurch', -43.489, 172.5321, 0.325, 0.45, 0.85, 'south', 1.1, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('WLG', '威靈頓', 'Wellington', -41.3268, 174.8069, 0.2925, 0.65, 0.65, 'south', 1.15, false, '區域市場，先用合適機型與少量班次試航。', 'A regional market; start with a suitable aircraft and modest frequency.'),
  C('NAN', '楠迪', 'Nadi', -17.7618, 177.4378, 0.13, 0.2, 1.0, 'south', 0.8, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('GUM', '關島', 'Guam', 13.485, 144.7973, 0.1105, 0.3, 1.0, 'tropic', 0.9, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('SPN', '塞班', 'Saipan', 15.1194, 145.7288, 0.0325, 0.15, 1.0, 'tropic', 0.8, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.'),
  C('PPT', '大溪地帕皮提', 'Tahiti Papeete', -17.5535, -149.6069, 0.13, 0.2, 1.0, 'south', 1.1, false, '觀光需求較強，旺季要留意座位供給。', 'Leisure-led demand; watch capacity in peak season.')
].forEach(c => { CITIES[c.id] = c; });
// Airport codes/coordinates: OurAirports public-domain snapshot, 2026-10-05.
// Catchment sizes, appeal, fees, seasons and slot flags remain game design values.
export const CITY_REGIONS = {
  asia: { zh: '亞洲', en: 'Asia' },
  middleEast: { zh: '中東', en: 'Middle East' },
  europe: { zh: '歐洲', en: 'Europe' },
  northAmerica: { zh: '北美與中美', en: 'North & Central America' },
  southAmerica: { zh: '南美', en: 'South America' },
  africa: { zh: '非洲', en: 'Africa' },
  oceania: { zh: '大洋洲', en: 'Oceania' }
};
const regionCities = {
  asia: 'TPE NRT KIX ICN PVG PEK HKG MNL BKK SIN KUL SGN CGK DEL BOM KHH RMQ HUN MZG KNH FUK NGO CTS OKA KOJ SDJ HIJ TAK KMJ PUS CJU CAN SZX XMN FOC HGH NKG TFU CKG WUH XIY KMG TAO DLC TSN CSX HAK SYX MFM HAN DAD CXR PQC HKT CNX USM CEB CRK DVO ILO PEN BKI KCH LGK DPS SUB KNO YIA BWN KTI SAI VTE RGN CCU BLR MAA HYD COK DAC CMB MLE KTM KHI ISB TAS ALA UBN'.split(' '),
  middleEast: 'DXB DOH AUH RUH JED MCT BAH KWI AMM'.split(' '),
  europe: 'IST LHR CDG FRA AMS ZRH FCO MAD MUC BER DUS VIE PRG BUD WAW CPH ARN OSL HEL DUB MAN BCN LIS MXP ATH BRU GVA KEF ZAG'.split(' '),
  northAmerica: 'LAX SFO JFK YVR SEA ORD BOS IAD DFW IAH ATL MIA LAS SAN HNL YYZ YUL YYC MEX CUN PTY'.split(' '),
  southAmerica: 'GRU GIG EZE SCL LIM BOG UIO'.split(' '),
  africa: 'CAI CMN RAK JNB CPT NBO ADD LOS ACC MRU SEZ ZNZ'.split(' '),
  oceania: 'SYD MEL AKL BNE PER ADL OOL CNS DRW CHC WLG NAN GUM SPN PPT'.split(' ')
};
for (const [region, ids] of Object.entries(regionCities)) for (const id of ids) CITIES[id].region = region;


// Weather word used in event text per hub
export const HUB_WEATHER = {
  TPE: { zh: '強烈颱風', en: 'a strong typhoon' },
  NRT: { zh: '罕見大雪', en: 'a rare heavy snowstorm' },
  SIN: { zh: '連日雷暴', en: 'days of thunderstorms' },
  DXB: { zh: '沙塵暴與大霧', en: 'a dust storm and heavy fog' },
  ZRH: { zh: '暴風雪', en: 'a blizzard' }
};

// ---------------------------------------------------------------- aircraft (fictional MQ family; numbers from real classes)
// fuelPerBlockHour kg; crew/maint US$ per block hour; maintPerCycle US$ per departure; navPerKm & airportPerDep US$ (airline-borne charges);
// leasePerMonth US$ (market rates: A320neo ~US$400k, A321neo ~US$460k, A350-900 ~US$950k); price US$ (market value, not list)
const A = o => o;
export const AIRCRAFT = {
  'MQ-72': A({ id: 'MQ-72', zh: 'ATR 72-600', en: 'ATR 72-600', classZh: '支線渦槳', classEn: 'Regional turboprop', modes: ['year', 'decade'], seats: { fsc: 70, lcc: 78 }, rangeKm: 1500, speedKmh: 480, maxHoursPerDay: 8, leasePerMonth: 150000, price: 26e6, fuelPerBlockHour: 700, crewPerBlockHour: 650, maintPerBlockHour: 420, maintPerCycle: 180, airportPerDep: 260, navPerKm: 0.12, widebody: false }),
  'MQ-190': A({ id: 'MQ-190', zh: 'Embraer E190', en: 'Embraer E190', classZh: '支線噴射機', classEn: 'Regional jet', modes: ['decade'], seats: { fsc: 100, lcc: 112 }, rangeKm: 3500, speedKmh: 780, maxHoursPerDay: 9.5, leasePerMonth: 230000, price: 40e6, fuelPerBlockHour: 1750, crewPerBlockHour: 850, maintPerBlockHour: 520, maintPerCycle: 260, airportPerDep: 430, navPerKm: 0.20, widebody: false }),
  'MQ-320': A({ id: 'MQ-320', zh: 'Airbus A320neo', en: 'Airbus A320neo', classZh: '單走道客機', classEn: 'Single-aisle jet', modes: ['year', 'decade'], seats: { fsc: 168, lcc: 186 }, rangeKm: 6000, speedKmh: 820, maxHoursPerDay: 11, leasePerMonth: 400000, price: 55e6, fuelPerBlockHour: 2450, crewPerBlockHour: 1100, maintPerBlockHour: 500, maintPerCycle: 330, airportPerDep: 650, navPerKm: 0.30, widebody: false }),
  'MQ-321': A({ id: 'MQ-321', zh: 'Airbus A321LR', en: 'Airbus A321LR', classZh: '長程單走道', classEn: 'Long-range single-aisle', modes: ['decade'], seats: { fsc: 190, lcc: 220 }, rangeKm: 7400, speedKmh: 830, maxHoursPerDay: 11, leasePerMonth: 460000, price: 65e6, fuelPerBlockHour: 2850, crewPerBlockHour: 1250, maintPerBlockHour: 540, maintPerCycle: 380, airportPerDep: 760, navPerKm: 0.34, widebody: false }),
  'MQ-350': A({ id: 'MQ-350', zh: 'Airbus A350-900', en: 'Airbus A350-900', classZh: '雙走道長程客機', classEn: 'Long-haul widebody', modes: ['year', 'decade'], seats: { fsc: 320, lcc: 370 }, rangeKm: 14000, speedKmh: 880, maxHoursPerDay: 15, leasePerMonth: 950000, price: 140e6, fuelPerBlockHour: 5800, crewPerBlockHour: 2500, maintPerBlockHour: 1000, maintPerCycle: 900, airportPerDep: 1750, navPerKm: 0.85, widebody: true }),
  'MQ-400': A({ id: 'MQ-400', zh: 'Boeing 777-300ER', en: 'Boeing 777-300ER', classZh: '大型雙發客機', classEn: 'Large twin-engine widebody', modes: ['decade'], seats: { fsc: 400, lcc: 460 }, rangeKm: 13500, speedKmh: 890, maxHoursPerDay: 15, leasePerMonth: 1050000, price: 170e6, fuelPerBlockHour: 7300, crewPerBlockHour: 3100, maintPerBlockHour: 1250, maintPerCycle: 1150, airportPerDep: 2250, navPerKm: 1.0, widebody: true })
};

// ---------------------------------------------------------------- lessons
export const LESSONS = {
  seasonality: { zh: '淡旺季', en: 'Seasonality',
    explainZh: '同一條航線，旺季和淡季的客人可以差一兩成。飛機班次不會自動跟著減少，所以淡季載客率會掉，成本卻照舊。排班要看月份，淡季前就該調整。',
    explainEn: 'The same route can carry 10 to 20 percent more or fewer passengers between peak and off-peak. Flights do not shrink on their own, so load factor falls in the low season while costs stay put. Plan by month and adjust before the dip.' },
  fuel: { zh: '油價與避險', en: 'Fuel prices and hedging',
    explainZh: '燃油占航空公司成本約四分之一以上，而油價是航空公司無法控制的。提前鎖定部分油價（避險）可以在油價暴漲時保護利潤；如果油價反而下跌，已鎖定的部分就會多付錢。',
    explainEn: 'Fuel is over a quarter of an airline’s costs and the price is outside its control. Locking in part of the price in advance (hedging) protects profit when oil spikes; if oil falls instead, the locked part costs extra.' },
  hedgeCost: { zh: '避險的代價', en: 'The cost of hedging',
    explainZh: '避險是買保險，不是賭油價。油價下跌時，避險部分比市價貴，這是保險費。避險比例要看公司能承受多大的油價波動。',
    explainEn: 'Hedging is insurance, not a bet. When fuel falls, the hedged part costs more than spot; that is the premium. The right ratio depends on how much fuel volatility the company can absorb.' },
  lccEntry: { zh: '廉航進場', en: 'Low-cost rival entry',
    explainZh: '廉航的單位成本比傳統航空低兩到三成，票價可以壓得更低。傳統航空如果跟著降價，兩邊都賺不到錢；守住商務客、放掉對價格最敏感的客人，通常比打價格戰好。',
    explainEn: 'A low-cost carrier’s unit cost is two to three tenths below a full-service airline’s, so it can price lower. Matching its fares usually hurts both sides; holding on to business travellers and letting the most price-sensitive customers go is usually better than a price war.' },
  priceWar: { zh: '價格戰', en: 'Price war',
    explainZh: '跟對手比低價時，對手可以跟著降，客人沒有變多，雙方每個客人的收入卻一起下降。成本較高的一方最先撐不住。',
    explainEn: 'When you cut fares to match a rival, the rival can cut again; passengers do not increase but revenue per passenger falls for both. The higher-cost side breaks first.' },
  widebodyEmpty: { zh: '大飛機空位', en: 'The half-empty widebody',
    explainZh: '大飛機每個座位的成本比小飛機低，但每飛一趟的成本高很多。客源不夠時，坐不滿的大飛機比坐滿的小飛機更容易虧錢。機型要配合航線的客量，不是越大越好。',
    explainEn: 'A bigger aircraft costs less per seat but far more per trip. When demand is thin, a half-empty widebody loses more than a full small jet. Match aircraft size to route demand; bigger is not better.' },
  fullUnprofitable: { zh: '客滿卻虧錢', en: 'Full but unprofitable',
    explainZh: '載客率高不等於賺錢。票價如果低於每個座位的成本，客人越多虧越多。要同時看載客率和損益平衡載客率：前者高於後者才有利潤。',
    explainEn: 'A high load factor does not guarantee profit. If the fare is below the cost per seat, every extra passenger adds to the loss. Compare load factor with the break-even load factor; profit needs the first to exceed the second.' },
  hubEffect: { zh: '轉機效應', en: 'The hub effect',
    explainZh: '從不同城市飛到你的機場、再轉往遠方的旅客，會同時坐滿兩條航線。短程支線單看不賺錢，卻可能為長程幹線帶來客人。代價是轉機旅客的票價按里程分攤，每段收入比直飛客人低。',
    explainEn: 'Passengers who fly in from different cities and connect onward fill seats on two routes at once. A short feeder route may look weak by itself yet feed a long-haul trunk. The catch: a connecting passenger’s fare is split by distance, so each leg earns less than a nonstop passenger.' },
  utilisation: { zh: '飛機利用率', en: 'Aircraft utilisation',
    explainZh: '飛機不飛，租金和折舊照付。每架飛機每天飛得越久，固定成本攤得越薄。閒置的飛機或每天只飛幾小時的飛機，會拖累整家公司的成本。',
    explainEn: 'An aircraft that does not fly still costs its lease or depreciation. The more hours it flies each day, the thinner the fixed cost per hour. Idle or lightly used aircraft drag on the whole company.' },
  disruption: { zh: '營運中斷', en: 'Operational disruption',
    explainZh: '罷工、天氣和系統故障讓航班取消時，收入消失，但租金、薪水和折舊不會減少。能提前談判或準備備案的公司，損失較小。',
    explainEn: 'When strikes, weather or system failures cancel flights, revenue disappears but leases, salaries and depreciation do not. Companies that negotiate early or prepare backups lose less.' },
  strike: { zh: '勞資談判', en: 'Labour negotiation',
    explainZh: '人事成本約占航空公司成本的四分之一到三成。罷工能讓整個航班表停擺，加薪則是長期成本。兩種選擇要放在一起比較。',
    explainEn: 'Labour is a quarter to three tenths of an airline’s costs. A strike can stop the whole schedule, while a pay rise is a permanent cost. Weigh the two together.' },
  businessModel: { zh: '傳統航空與廉價航空', en: 'Full-service vs low-cost',
    explainZh: '廉價航空靠高座位密度、高利用率、低人力和直接銷售，把每座位成本壓低兩到三成，並用輔助收入（行李、選位、餐飲）補收入。但它對商務客吸引力低，長程優勢也小。',
    explainEn: 'A low-cost airline cuts unit cost by two to three tenths through dense seating, high utilisation, lean staffing and direct sales, and fills in revenue with ancillaries (bags, seats, meals). It is less attractive to business travellers, and its advantage shrinks on long flights.' },
  slot: { zh: '時段限制', en: 'Airport slots',
    explainZh: '擁擠的機場限制每家航空能飛的班次。班次不能再加時，只有換大飛機才能運更多客人，所以大型機場的客機普遍比較大。',
    explainEn: 'Congested airports cap how many flights an airline can operate. When frequency cannot grow, the only way to carry more is a bigger aircraft, which is why aircraft at big airports are bigger.' },
  interest: { zh: '利率與負債', en: 'Interest rates and debt',
    explainZh: '買飛機借的錢要付利息。浮動利率貸款在利率上升時，每期利息立刻變多。負債越高，景氣下滑時越沒有緩衝。',
    explainEn: 'Money borrowed to buy aircraft costs interest. On floating-rate loans, a rate rise lifts every period’s interest at once. The more debt, the less cushion in a downturn.' },
  boom: { zh: '景氣高峰與擴張', en: 'Boom and over-expansion',
    explainZh: '景氣好時需求成長，每家航空都想買機擴張。一旦景氣轉向，多買的飛機變成固定成本。擴張要留有退路。',
    explainEn: 'When demand booms every airline wants more aircraft. When the cycle turns, the extra aircraft become fixed costs. Expand with an exit route in mind.' },
  pandemic: { zh: '需求崩跌與現金', en: 'Demand collapse and cash',
    explainZh: '疫情讓需求在一兩個回合內掉到三成以下，而租金、貸款和基本人力照付。航空公司撐不撐得住，取決於手上現金和固定成本的比例，不是平時的獲利。',
    explainEn: 'In a pandemic, demand can fall below 30 percent within a turn or two while leases, loans and core staff still have to be paid. Survival depends on cash and the share of fixed costs, not on past profits.' },
  recovery: { zh: '復甦與運力', en: 'Recovery and capacity',
    explainZh: '需求回來的速度會比飛機和人員回來的速度快。這時票價有上漲空間，但前提是運力還在。把飛機全部退掉的公司，反而錯過反彈。',
    explainEn: 'Demand comes back faster than aircraft and crews do. Fares can rise, but only if you still have capacity. A company that returned every aircraft misses the rebound.' },
  leaseMarket: { zh: '租機市場循環', en: 'The lease market cycle',
    explainZh: '飛機供不應求時，租金和機價會漲。需要新飛機時才去市場，價錢最貴；景氣差時自己有機可賣，價錢也最低。',
    explainEn: 'When aircraft are in short supply, lease rates and prices rise. Shopping only when you need a plane means paying the most; selling in a bust means getting the least.' },
  newRoute: { zh: '新航線需要時間', en: 'New routes take time to build',
    explainZh: '新航線一開始只拿得到部分潛在客人，要經過幾個回合旅客才會認識你。評估新航線時要看第三個月之後，不是第一個月。',
    explainEn: 'A new route starts with only part of its potential customers and needs a few turns to build awareness. Judge it after month three, not month one.' }
};

// ---------------------------------------------------------------- glossary
export const GLOSSARY = {
  lf: { zh: '載客率', en: 'Load factor', explainZh: '實際載客人數除以座位數。坐滿是 100%，全球航空平均約 83%。', explainEn: 'Passengers carried divided by seats offered. 100% is full; the global average is about 83%.' },
  breakEvenLF: { zh: '損益平衡載客率', en: 'Break-even load factor', explainZh: '載客率要到多少才剛好不賠錢。實際載客率高於它就賺錢，低於它就虧錢。', explainEn: 'The load factor at which revenue exactly covers cost. Above it the route makes money; below it, it loses.' },
  rask: { zh: '每座位公里收入', en: 'RASK', explainZh: '每一個座位飛一公里，平均收到多少錢（含票價和輔助收入）。', explainEn: 'Revenue per available seat-kilometre: what each seat earns for each kilometre flown, fares and ancillaries included.' },
  cask: { zh: '每座位公里成本', en: 'CASK', explainZh: '每一個座位飛一公里，平均花多少錢。RASK 高於 CASK 才有利潤。', explainEn: 'Cost per available seat-kilometre. Profit requires RASK to exceed CASK.' },
  yield: { zh: '平均票價', en: 'Average fare', explainZh: '每位旅客平均付的機票錢，不含行李、選位等輔助收入。', explainEn: 'The average ticket price per passenger, excluding bags, seat selection and other ancillaries.' },
  ask: { zh: '座位公里', en: 'ASK', explainZh: '座位數乘以飛行公里數，是航空業衡量運力的單位。', explainEn: 'Seats multiplied by kilometres flown; the industry unit for capacity.' },
  blockHour: { zh: '輪擋時間', en: 'Block hour', explainZh: '飛機從離開登機門到停靠下一個登機門的時間，包含滑行。成本多半按它計算。', explainEn: 'Time from leaving the gate to arriving at the next gate, taxiing included. Most operating costs are counted per block hour.' },
  utilisation: { zh: '飛機利用率', en: 'Utilisation', explainZh: '一架飛機平均每天飛幾個輪擋小時。傳統航空短程約 8 至 9 小時，廉航常超過 12 小時。', explainEn: 'Average block hours an aircraft flies per day. Full-service short-haul is around 8 to 9; low-cost carriers often exceed 12.' },
  hedge: { zh: '燃油避險', en: 'Fuel hedge', explainZh: '事先約定未來一段時間用固定價格買油。油價漲時省錢，油價跌時多付，並要付少量手續費。', explainEn: 'Agreeing in advance to buy fuel at a fixed price. It saves money when oil rises and costs extra when it falls, plus a small fee.' },
  lease: { zh: '租賃', en: 'Lease', explainZh: '按月付租金使用飛機，不需要一次付出整架飛機的錢。提前退租要付違約金。', explainEn: 'Paying monthly rent to use an aircraft instead of paying its full price. Returning it early costs a fee.' },
  ownership: { zh: '飛機持有成本', en: 'Ownership cost', explainZh: '租金，或自己買的飛機每期攤提的折舊。', explainEn: 'Lease rent, or depreciation on aircraft you bought.' },
  ancillary: { zh: '輔助收入', en: 'Ancillary revenue', explainZh: '機票以外的收入，例如行李、選位、機上餐飲。廉航約占營收三分之一，傳統航空約一成以下。', explainEn: 'Revenue beyond the ticket: bags, seat selection, onboard food. Around a third of revenue at low-cost carriers, under a tenth at full-service airlines.' },
  distribution: { zh: '銷售通路成本', en: 'Distribution cost', explainZh: '訂位系統、旅行社佣金與信用卡手續費。傳統航空占營收約 5%，直接銷售的廉航低得多。', explainEn: 'Reservation systems, agent commissions and card fees. About 5% of revenue for full-service airlines, much less for direct-selling low-cost carriers.' },
  slot: { zh: '起降時段', en: 'Airport slot', explainZh: '擁擠機場分配給航空公司的起降許可。沒有時段就不能飛。', explainEn: 'Landing and take-off permission allocated at congested airports. No slot, no flight.' },
  hub: { zh: '樞紐', en: 'Hub', explainZh: '所有航線都從這裡出發的基地機場。旅客可以在這裡轉機。', explainEn: 'The home airport all routes start from, where passengers can change planes.' },
  transferPax: { zh: '轉機旅客', en: 'Transfer passengers', explainZh: '在你的樞紐換飛機繼續飛的旅客。他們同時占用兩條航線的座位。', explainEn: 'Passengers who change planes at your hub. They use seats on two routes at once.' },
  fsc: { zh: '傳統航空', en: 'Full-service carrier', explainZh: '提供商務艙、免費行李與餐飲，座位較寬，票價較高。', explainEn: 'Offers a premium cabin, free bags and meals, and wider seats at higher fares.' },
  lcc: { zh: '廉價航空', en: 'Low-cost carrier', explainZh: '座位密度高、機型單一、飛機利用率高，票價低，附加服務另外收費。', explainEn: 'Dense seating, a single fleet type and high utilisation; low fares with extras charged separately.' },
  margin: { zh: '淨利率', en: 'Net margin', explainZh: '利潤除以營收。2025 年全球航空業平均只有 3.9%，每賺 100 元只留下不到 4 元。', explainEn: 'Profit divided by revenue. The 2025 industry average was just 3.9%, under four cents on every dollar.' },
  seatDensity: { zh: '座位密度', en: 'Seat density', explainZh: '同一架飛機塞多少座位。座位多，每個座位分到的成本就少，但舒適度較低。', explainEn: 'How many seats are fitted in the same aircraft. More seats spread cost thinner but reduce comfort.' },
  fareTier: { zh: '票價等級', en: 'Fare tier', explainZh: '低、中、高三檔，相對於這條航線的參考票價。低價搶客人，高價賺單價。', explainEn: 'Low, mid or high relative to the route’s reference fare. Low wins customers; high earns more per passenger.' },
  frequency: { zh: '班次', en: 'Frequency', explainZh: '每週來回幾班。班次越多越方便，尤其是商務客，會吸引更大的客源比例。', explainEn: 'Round trips per week. More flights are more convenient, especially for business travellers, and win a bigger share of demand.' },
  elasticity: { zh: '價格彈性', en: 'Price elasticity', explainZh: '票價每調整 1%，客人數變動幾個百分點。觀光客彈性大，商務客彈性小。', explainEn: 'How many percent demand changes for each 1% change in fare. Leisure travellers react strongly; business travellers much less.' },
  loan: { zh: '飛機貸款', en: 'Aircraft loan', explainZh: '買飛機時先付兩成，其餘向銀行借，每期還本付息。利率會浮動。', explainEn: 'Buy an aircraft with 20% down and borrow the rest, paying principal and interest each period. The rate floats.' },
  depreciation: { zh: '折舊', en: 'Depreciation', explainZh: '自己買的飛機每期攤掉一部分購買價格，是帳面成本，不是當期付現。', explainEn: 'Spreading an aircraft’s purchase price over its life. It is an accounting cost, not a cash payment in that period.' },
  fuelIndex: { zh: '油價指數', en: 'Fuel price index', explainZh: '以 1.00 代表基準油價（約每桶 100 美元的噴射機燃油），1.40 表示貴了四成。', explainEn: '1.00 is the base jet fuel price (about US$100 a barrel); 1.40 means 40% higher.' },
  rampUp: { zh: '新航線爬升期', en: 'Route ramp-up', explainZh: '新航線前幾個回合只拿到部分客人，因為旅客還不認識你。', explainEn: 'A new route wins only part of its potential for the first turns because travellers do not know you yet.' }
};

// ---------------------------------------------------------------- events
// turns: candidate 0-based turns (seed picks one; keeps events apart). seq arrays are multiplicative factors from the event turn on.
// effects keys: fuel[seq], demand{all,biz,lei:[seq]}, rivalEntry, rivalAdd, disruption, labourMult, rate, slotCap, assetMarket[seq], leaseMultNew{mult,turns}, cashLoan, leaseDeferral
export const EVENTS = [
  // ---------------- Mode A
  { id: 'a-season', modes: ['year'], turns: [1], zh: '二月淡季：歐美與商務需求偏低，亞洲則因農曆年有一波旅遊。', en: 'February low season: Europe and North America and business demand are soft; Asia gets a Lunar New Year travel wave.', effects: {}, lesson: 'seasonality' },
  { id: 'a-festival', modes: ['year'], turns: [2], zh: '春季大型活動：旅遊需求上升兩成，持續一個月。', en: 'A major spring festival season lifts leisure demand by 20% for a month.', effects: { demand: { lei: [1.2] } }, lesson: 'newRoute' },
  { id: 'a-strike', modes: ['year'], turns: [3, 4], zh: '地勤工會要求加薪並威脅罷工。', en: 'Ground-handling staff demand a pay rise and threaten a strike.', effects: {},
    choices: [
      { id: 'settle', zh: '同意加薪（人事成本上升約 6%）', en: 'Agree to a pay rise (labour cost about 6% higher)', default: true, effects: { labourMult: 1.06 }, handled: true },
      { id: 'resist', zh: '拒絕談判，承擔罷工風險', en: 'Refuse and risk the strike', effects: { disruption: { cancelPct: 0.3, compPerPax: 70 } }, handled: false }
    ], lesson: 'strike' },
  { id: 'a-model', modes: ['year'], turns: [5], zh: '董事會問：要不要改走廉價路線？改走後座位變多、票價變低、輔助收入變重要，但商務客會流失，且要付改裝費。', en: 'The board asks: should we go low-cost? Seats and ancillaries go up, fares down; business travellers leave and refitting costs money.', effects: {},
    choices: [
      { id: 'fsc', zh: '維持傳統航空', en: 'Stay full-service', default: true, effects: {}, handled: true },
      { id: 'lcc', zh: '改走廉價路線', en: 'Go low-cost', effects: { switchModel: 'lcc' }, handled: true }
    ], lesson: 'businessModel' },
  { id: 'a-fuel-warn', modes: ['year'], turns: [6], zh: '新聞：中東局勢緊張，期貨市場油價走高，分析師警告下個月可能大漲。', en: 'News: Middle East tensions push oil futures up; analysts warn of a big jump next month.', effects: {}, lesson: 'fuel', warning: true },
  { id: 'a-fuel', modes: ['year'], turns: [7], zh: '油價大漲：燃油價格比平時高出四成以上，之後幾個月逐步回落。', en: 'Oil spikes: fuel is more than 40% above normal and eases over the following months.', effects: { fuel: [1.45, 1.4, 1.25, 1.12] }, lesson: 'fuel' },
  { id: 'a-lcc', modes: ['year'], turns: [8, 9], zh: '廉價航空「輕羽航空」宣布進入你最賺錢的航線，票價比你低約三成。', en: 'Low-cost rival Qingyu Air announces it is entering your most profitable route at fares about 30% below yours.', effects: { rivalEntry: { rival: 'lcc', weekly: 10, fareRatio: 0.72 } },
    choices: [
      { id: 'hold', zh: '維持票價，守住商務客', en: 'Hold fares and keep business travellers', default: true, effects: {}, handled: true },
      { id: 'fight', zh: '跟進降到最低價', en: 'Match with the lowest fare', effects: { forceFare: 'low' }, handled: false },
      { id: 'exit', zh: '退出這條航線，飛機調去別處', en: 'Leave the route and redeploy the aircraft', effects: { dropRoute: true }, handled: true }
    ], lesson: 'lccEntry' },
  { id: 'a-weather', modes: ['year'], turns: [10], zh: '{weather}襲擊樞紐，航班大量取消。', en: '{weather} hits the hub and many flights are cancelled.', effects: { disruption: { cancelPct: 0.2, compPerPax: 55 } }, lesson: 'disruption' },
  { id: 'a-slump', modes: ['year'], turns: [11], zh: '經濟放緩：企業縮減差旅，商務需求下降一成五，持續兩個月。', en: 'Economic slowdown: firms cut travel; business demand falls 15% for two months.', effects: { demand: { biz: [0.85, 0.85] } }, lesson: 'utilisation' },

  // ---------------- Mode B
  { id: 'b-model', modes: ['decade'], turns: [0], zh: '開業前先決定經營模式：傳統航空，還是廉價航空？之後改變要付改裝費，並且會流失一部分客人。', en: 'Before opening, choose your business model: full-service or low-cost? Changing later costs a refit and some customers.', effects: {},
    choices: [
      { id: 'fsc', zh: '傳統航空（高票價、商務客、轉機網路）', en: 'Full-service (higher fares, business travellers, connections)', default: true, effects: { switchModel: 'fsc' }, handled: true },
      { id: 'lcc', zh: '廉價航空（低票價、高密度、輔助收入）', en: 'Low-cost (low fares, dense seating, ancillaries)', effects: { switchModel: 'lcc' }, handled: true }
    ], lesson: 'businessModel' },
  { id: 'b-season', modes: ['decade'], turns: [1], zh: '冬季班表：旅遊需求偏低，商務需求相對穩定。', en: 'Winter schedule: leisure demand is lower while business demand holds up better.', effects: {}, lesson: 'seasonality' },
  { id: 'b-boom', modes: ['decade'], turns: [2], zh: '景氣高峰：全球需求成長，未來三個季度需求比平時高。同業都在搶飛機。', en: 'Boom: global demand grows for the next three seasons and rivals rush to order aircraft.', effects: { demand: { all: [1.08, 1.1, 1.05] } }, lesson: 'boom' },
  { id: 'b-slot', modes: ['decade'], turns: [3], zh: '機場當局收緊起降時段：你飛往最擁擠機場的班次被限制為每週 7 班。', en: 'The airport authority tightens slots: your flights to the most congested airport are capped at 7 a week.', effects: { slotCap: { cap: 7 } }, lesson: 'slot' },
  { id: 'b-lcc', modes: ['decade'], turns: [4, 5], zh: '廉價航空「輕羽航空」進入你最賺錢的航線，票價低約三成。', en: 'Low-cost carrier Qingyu Air enters your most profitable route at fares about 30% lower.', effects: { rivalEntry: { rival: 'lcc', weekly: 10, fareRatio: 0.72 } },
    choices: [
      { id: 'hold', zh: '維持票價，守住商務客', en: 'Hold fares and keep business travellers', default: true, effects: {}, handled: true },
      { id: 'fight', zh: '跟進降到最低價', en: 'Match with the lowest fare', effects: { forceFare: 'low' }, handled: false },
      { id: 'exit', zh: '退出這條航線', en: 'Leave the route', effects: { dropRoute: true }, handled: true }
    ], lesson: 'lccEntry' },
  { id: 'b-fuel-warn', modes: ['decade'], turns: [5], zh: '新聞：油價連續上漲，期貨顯示未來一年價格可能翻倍。', en: 'News: oil keeps climbing and futures suggest prices could double within a year.', effects: {}, lesson: 'fuel', warning: true },
  { id: 'b-oil', modes: ['decade'], turns: [6], zh: '油價暴漲：燃油價格接近平時的兩倍，之後幾個季度逐步回落；消費者信心下滑，需求略降。', en: 'Oil shock: fuel nearly doubles and eases over the following seasons; consumer confidence slips and demand dips.', effects: { fuel: [1.8, 1.9, 1.5, 1.3, 1.15], demand: { all: [0.97, 0.93, 0.93, 0.97] } }, lesson: 'fuel' },
  { id: 'b-rate', modes: ['decade'], turns: [8], zh: '央行升息三個百分點，浮動利率的飛機貸款利息立刻增加。', en: 'The central bank raises rates by three points; interest on floating-rate aircraft loans jumps immediately.', effects: { rate: 0.03 }, lesson: 'interest' },
  { id: 'b-strike', modes: ['decade'], turns: [9], zh: '飛行員工會要求加薪並威脅罷工。', en: 'The pilots’ union demands a pay rise and threatens a strike.', effects: {},
    choices: [
      { id: 'settle', zh: '同意加薪（人事成本上升約 8%）', en: 'Agree to a pay rise (labour cost about 8% higher)', default: true, effects: { labourMult: 1.08 }, handled: true },
      { id: 'resist', zh: '拒絕談判，承擔罷工風險', en: 'Refuse and risk the strike', effects: { disruption: { cancelPct: 0.2, compPerPax: 70 } }, handled: false }
    ], lesson: 'strike' },
  { id: 'b-fsc-adds', modes: ['decade'], turns: [10], zh: '傳統航空對手「雲錦航空」在你的主要航線增加班次，並推出更多商務艙座位。', en: 'Full-service rival Yunjin Air adds frequencies on your main routes and expands its premium cabin.', effects: { rivalAdd: { rival: 'fsc', freqAdd: 4 } }, lesson: 'priceWar' },
  { id: 'b-weather', modes: ['decade'], turns: [11], zh: '{weather}襲擊樞紐，部分航班取消。', en: '{weather} hits the hub and some flights are cancelled.', effects: { disruption: { cancelPct: 0.1, compPerPax: 55 } }, lesson: 'disruption' },
  { id: 'b-pandemic-warn', modes: ['decade'], turns: [12], zh: '新聞：新型呼吸道疾病開始蔓延，部分國家討論入境限制。', en: 'News: a new respiratory disease is spreading and several countries discuss entry restrictions.', effects: {}, lesson: 'pandemic', warning: true },
  { id: 'b-pandemic', modes: ['decade'], turns: [13], zh: '疫情爆發：各國封鎖邊境，需求在一個季度內掉到平時的三成以下。租金與貸款照付。', en: 'Pandemic: borders close and demand falls below 30% of normal within one season. Leases and loans still fall due.', effects: { demand: { all: [0.28, 0.33, 0.6, 0.8, 0.92] }, assetMarket: [0.7, 0.7, 0.8, 0.9, 1] },
    choices: [
      { id: 'loan', zh: '申請政府紓困貸款（現金增加 4,000 萬美元，年利率 3%）', en: 'Take a government relief loan (+US$40M cash at 3%)', default: true, effects: { cashLoan: 40e6 }, handled: true },
      { id: 'defer', zh: '與租賃公司協商延後租金（兩期付四成，之後補繳）', en: 'Negotiate lease deferral (pay 40% for two seasons, repay after)', effects: { leaseDeferral: { pct: 0.6, turns: 2 } }, handled: true },
      { id: 'none', zh: '不動用任何援助', en: 'Use no relief', effects: {}, handled: false }
    ], lesson: 'pandemic' },
  { id: 'b-recovery', modes: ['decade'], turns: [16], zh: '旅遊報復性反彈：觀光需求在兩個季度內高出平時兩成，商務需求仍然偏低。', en: 'Pent-up travel: leisure demand runs 20% above normal for two seasons while business stays weak.', effects: { demand: { lei: [1.2, 1.15], biz: [0.9, 0.95] } }, lesson: 'recovery' },
  { id: 'b-supply', modes: ['decade'], turns: [17], zh: '新飛機供不應求：新租約的租金上漲兩成五，持續三個季度。', en: 'Aircraft shortage: new lease rates are 25% higher for three seasons.', effects: { leaseMultNew: { mult: 1.25, turns: 3 } }, lesson: 'leaseMarket' }
];

// ---------------------------------------------------------------- rivals (fictional)
export const RIVALS = {
  lcc: { id: 'lcc', kind: 'lcc', zh: '輕羽航空', en: 'Qingyu Air', fareFloor: 0.62, baseFare: 0.72, maxWeekly: 14 },
  fsc: { id: 'fsc', kind: 'fsc', zh: '雲錦航空', en: 'Yunjin Air', fareFloor: 0.85, baseFare: 1.0, maxWeekly: 16 }
};
