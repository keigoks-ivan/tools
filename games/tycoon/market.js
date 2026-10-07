// 城市生活圈與共同消費預算。純聚合模型，人口不對應畫面人物數。
import { P, unwrap } from './params.js';
const V = unwrap(P), M = V.market;
export const MARKET_VERSION = 1;
export function districtAt(x, z) {
  return x >= 24 ? (z >= 16 ? 'river' : 'tech') : z >= 16 ? 'campus' : z >= 12 ? 'south' : x >= 16 ? 'east' : 'old';
}
export const districtOf = (id) => M.districts.find((d) => d.id === id) || M.districts[0];
const years = (w) => Math.max(0, w.t - w.market.startT) / (24 * 365);
export function incomeOf(w, b) { return w.market ? districtOf(b.districtId).income * Math.pow(1 + M.incomeGrowth, years(w)) : 1; }
export function updatePopulation(w) {
  if (!w.market) return;
  for (const b of w.bld) b.pop = b.basePop * Math.pow(1 + districtOf(b.districtId).growth, years(w));
  w.popAll = w.bld.reduce((a, b) => a + b.pop, 0);
}
export function configureMarket(w, startT = w.t, areaKm2 = w.market?.areaKm2 || 0) {
  w.market = { version: MARKET_VERSION, startT, areaKm2 };
  const floors = {};
  for (const b of w.bld) { b.districtId = districtAt(b.x, b.z); const k = b.districtId + ':' + b.key; floors[k] = (floors[k] || 0) + b.floors; }
  for (const b of w.bld) {
    b.basePop = (districtOf(b.districtId).people[b.key] || 0) * M.presence[b.key] * b.floors / floors[b.districtId + ':' + b.key];
  }
  updatePopulation(w);
  const byId = new Map(w.bld.map((b) => [b.id, b]));
  for (const l of w.lots) { l.districtId = byId.get(l.building)?.districtId || districtAt(l.x, l.z); l.district = districtOf(l.districtId).name; }
}
export function reach(w, id, meters) {
  const rule = w.market && M.sectors[id || 'tea'];
  return rule ? (meters <= rule.radius ? Math.exp(-rule.distance * meters / 100) : 0) : null;
}
export function deliveryReach(meters) { return meters <= M.deliveryRadius ? Math.exp(-0.15 * meters / 100) : 0; }
export function walletAt(w, b, col, weekend, external = true) {
  return w.market ? b.pop * incomeOf(w, b) * weekend * (M.wallet[b.key] + (external ? M.outsideWallet * Math.max(0, V.people.deliveryPoolMult - 1) : 0)) * M.hours[col] / 100 : Infinity;
}
// 同來源、同小時的到店與外送預期消費共同分配預算；包含促銷和熱度。
export function shareWallet(w, walk, del, prices, platformPrices, col, weekendOf, boost = [], ids = []) {
  if (!w.market) return;
  const caps = Object.entries(M.categoryCaps).map(([id, share]) => ({ share, members: ids.map((x, j) => x === id ? j : -1).filter((j) => j >= 0) })).filter((c) => c.members.length);
  for (let b = 0; b < w.bld.length; b++) {
    const local = walletAt(w, w.bld[b], col, weekendOf(w.bld[b].key), false), outside = walletAt(w, w.bld[b], col, weekendOf(w.bld[b].key)) - local;
    for (const { share, members } of caps) {
      let spend = 0;
      for (const j of members) spend += (walk[j][b] * prices[j] + del[j][b] * platformPrices[j]) * (boost[j] || 1);
      const ratio = spend ? Math.min(1, local * share / spend) : 1;
      for (const j of members) { walk[j][b] *= ratio; del[j][b] *= ratio; }
    }
    let spendWalk = 0, spendDel = 0;
    for (let j = 0; j < walk.length; j++) { spendWalk += walk[j][b] * prices[j] * (boost[j] || 1); spendDel += del[j][b] * platformPrices[j] * (boost[j] || 1); }
    const externalShare = spendDel ? Math.min(1, outside / spendDel) : 0;
    const localWant = spendWalk + spendDel * (1 - externalShare), ratio = localWant ? Math.min(1, local / localWant) : 1;
    for (let j = 0; j < walk.length; j++) { walk[j][b] *= ratio; del[j][b] *= externalShare + (1 - externalShare) * ratio; }
  }
}
export function marketDistricts(w) {
  if (!w.market) return [];
  return M.districts.map((d) => {
    const bld = w.bld.filter((b) => b.districtId === d.id), lots = w.lots.filter((l) => l.districtId === d.id);
    return { ...d, residents: bld.filter((b) => b.key === '住宅').reduce((a, b) => a + b.pop, 0), population: bld.reduce((a, b) => a + b.pop, 0), income: incomeOf(w, { districtId: d.id }), budgetDaily: bld.reduce((a, b) => a + b.pop * incomeOf(w, b) * M.wallet[b.key], 0), lots: lots.length, freeLots: lots.filter((l) => !l.shopId).length };
  });
}
