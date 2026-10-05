// Optional v2 systems. Economic assumptions are design values; the base game is unchanged without facilities.
import { MODES, CONST, CITIES, AIRCRAFT } from './data.mjs?v=19';
export const FACILITIES = {
  depot: { zh: '維修基地', en: 'Maintenance depot', cost: 6000000, monthly: 25000, years: 10,
    effectZh: '維修費 −30%', effectEn: 'Maintenance −30%',
    lessonZh: '航班夠多，省下的維修費才會超過基地的固定成本。', lessonEn: 'Enough flights are needed to offset the depot’s fixed costs.' },
  lounge: { zh: '貴賓室', en: 'Premium lounge', cost: 3000000, monthly: 22000, years: 10,
    effectZh: '商務客吸引力 +8%', effectEn: 'Business appeal +8%',
    lessonZh: '提高商務客吸引力，但不保證客滿。廉航模式不增加需求。', lessonEn: 'Attract business travellers; full seats are not guaranteed. No demand bonus in low-cost mode.' },
  tank: { zh: '燃油庫', en: 'Fuel storage', cost: 2000000, monthly: 10000, years: 10,
    effectZh: '可預購 3 個月燃油', effectEn: 'Prebuy 3 months of fuel',
    lessonZh: '預購未避險燃油的 30%。先付現金，漲價時少受影響，跌價時比較貴。', lessonEn: 'Prebuy 30% of unhedged fuel. Pay cash now; rises hurt less, falls make stored fuel dearer.' },
};
export const SCENARIOS = {
  free: { zh: '自由經營', en: 'Open skies', tagZh: '從第一條航線開始', tagEn: 'Build your first network',
    descZh: '自己決定規模，讓每一條航線都有理由。', descEn: 'Choose your scale and give every route a purpose.' },
  margin: { zh: '站穩第一年', en: 'A profitable first year', mode: 'year', seed: 1, tagZh: '12 個月 · 獲利挑戰', tagEn: '12 months · profit challenge',
    descZh: '累計淨利率達 3.9%，現金保持正值。', descEn: 'Finish with a 3.9% total margin and positive cash.' },
  network: { zh: '打造轉機樞紐', en: 'The connecting hub', mode: 'decade', seed: 1, tagZh: '十年 · 航網挑戰', tagEn: '10 years · network challenge',
    descZh: '完成十年，至少 5 條航線、轉機旅客占 5%，累計獲利。', descEn: 'Finish ten years with 5 routes, 5% connecting traffic and a total profit.' },
  resilience: { zh: '撐過危機', en: 'Weather the storm', mode: 'decade', seed: 7, tagZh: '十年 · 生存挑戰', tagEn: '10 years · survival challenge',
    descZh: '經歷油價與疫情衝擊，完成十年且現金仍高於開局的 50%。', descEn: 'Survive fuel and pandemic shocks; finish with at least half your starting cash.' },
};
export function scenarioProgress(state, report) {
  const id = state.scenario || 'free', sc = SCENARIOS[id] || SCENARIOS.free;
  const margin = state.totals.revenue > 0 ? state.totals.profit / state.totals.revenue : 0;
  const hist = state.history || [];
  const transfer = hist.reduce((a, h) => a + (h.transferPax || 0), 0) / Math.max(1, hist.reduce((a, h) => a + (h.pax || 0), 0));
  const criteria = id === 'margin' ? [margin >= CONST.industryMargin, state.cash > 0]
    : id === 'network' ? [state.routes.length >= 5, transfer >= 0.05, state.totals.profit > 0]
    : id === 'resilience' ? [state.cash >= MODES[state.mode].startCash * 0.5, !!state.lessons.pandemic, !!state.lessons.fuel]
    : [state.turn > 0, state.totals.profit > 0, margin >= CONST.industryMargin];
  return { id, sc, margin, transfer, criteria, complete: !!state.finished && !state.gameOver && criteria.every(Boolean), progress: state.turn / MODES[state.mode].turns };
}
export const newClock = () => ({ elapsed: 0, speed: 1, running: false });
export const turnSeconds = mode => mode === 'decade' ? 90 : 60;
export function advanceClock(clock, dt, mode, suspended = false) {
  const duration = turnSeconds(mode);
  const elapsed = Math.min(duration, Math.max(0, clock.elapsed) + (clock.running && !suspended && Number.isFinite(dt) ? Math.max(0, dt) * clock.speed : 0));
  return { ...clock, elapsed, running: clock.running && elapsed < duration };
}
export function fuelOrder(state) {
  const m = MODES[state.mode];
  const monthlyKg = state.routes.reduce((sum, r) => {
    const a = AIRCRAFT[r.type], c = CITIES[r.city], h = CITIES[state.hub];
    const rad = Math.PI / 180, x = Math.sin((c.lat-h.lat)*rad/2)**2 + Math.cos(c.lat*rad)*Math.cos(h.lat*rad)*Math.sin((c.lon-h.lon)*rad/2)**2;
    const distance = 6371 * 2 * Math.asin(Math.sqrt(x)) * CONST.routeFactor;
    return sum + 2 * r.weekly * (52/12) * (CONST.taxiClimbHours + distance / a.speedKmh) * a.fuelPerBlockHour;
  }, 0);
  const kg = monthlyKg * 3 * 0.3 * (1 - state.hedge.frac);
  return { kg, cost: kg * CONST.fuelPriceUsdPerKg * state.fuelSpot, months: m.monthsPerTurn };
}
