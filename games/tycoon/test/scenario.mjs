// 校準與測試共用的情境：只有對手和路邊小店，玩家在住宅巷弄中位數店面開一家，全預設。
import { readFileSync } from 'node:fs';
import { createWorld, stepHour, openShop, takeLoan, medianResidentialLot } from '../sim.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/map.json', import.meta.url), 'utf8'));
export const FIXTURE = fx;

export function baseWorld({ seed = 20261001, cal, noRivals = false } = {}) {
  const w = createWorld({ mapData: fx.map, distances: fx.dist, seed, cal, noRivals });
  return w;
}
/** 玩家開店（借滿開辦貸款），回傳 shop。 */
export function playerOpens(w) {
  takeLoan(w, 'start', 2000000);
  const lot = medianResidentialLot(w);
  const r = openShop(w, lot, { name: '測試茶店' });
  if (!r.ok) throw new Error(r.reason);
  return w.shops.find((s) => s.id === r.shopId);
}
export function runDays(w, days) {
  for (let i = 0; i < days * 24; i++) stepHour(w);
}
