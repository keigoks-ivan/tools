// 連鎖後勤的設定與純查詢；現金、進貨及事件由 sim.js 統一記帳。
import { P, unwrap } from './params.js';

export const E = unwrap(P.expansion);
export const FACILITY_KEYS = Object.keys(E.facilities);
const emptyFacility = () => ({ status: 'none', active: true, completeAtT: null, stockValue: 0, stockCost: 0, orders: [], auto: true, target: 200000 });
export function newExpansion() {
  return { facilities: Object.fromEntries(FACILITY_KEYS.map((k) => [k, emptyFacility()])), projects: {}, research: null, factoryLeft: 0, batchUntilT: 0 };
}
export function ready(exp, key) { return exp?.facilities[key]?.status === 'ready'; }
export function effects(exp) {
  const completed = exp?.projects || {};
  let quality = 0, speed = 1, material = 1, waste = 0;
  for (const [k, p] of Object.entries(E.projects)) if (completed[k]) { quality += p.quality || 0; speed += p.speed || 0; material *= 1 - (p.material || 0); waste += p.waste || 0; }
  return { quality, speed, material, waste };
}
