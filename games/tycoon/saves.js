// 本機存檔與 JSON 備份共用格式；相容原本 { w, meta } 的存檔。
import { deserialize, serialize, BUSINESSES } from './sim.js';
import { stockLimit } from './businesses.js';
import { MARKET_VERSION, districtOf } from './market.js';
import { strategyValid, managerValid } from './strategy.js';
export const SAVE_KEY = 'tycoon.save.v1';
export const MANUAL_KEY = 'tycoon.save.manual.v1';
export const BACKUP_KEY = SAVE_KEY + '.backup';
export const MAX_SAVE_BYTES = 20 * 1024 * 1024;

function validate(w) {
  const bad = () => { throw new Error('存檔內容不完整或已損壞'); };
  const array = (a, n) => Array.isArray(a) && (n == null || a.length === n);
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const safe = (v, depth = 0) => {
    if (depth > 60 || typeof v === 'number' && !finite(v)) bad();
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (['__proto__', 'prototype', 'constructor'].includes(k)) bad(); safe(x, depth + 1); }
  };
  safe(w);
  if (!w || w.v !== 1 || !Number.isInteger(w.t) || w.t < 0 || !Number.isInteger(w.seed) || !['playing', 'won', 'lost', 'bankrupt'].includes(w.status)) bad();
  if (!array(w.bld) || !w.bld.length || !array(w.lots) || !w.lots.length || !array(w.shops) || !array(w.dM, w.bld.length * w.lots.length) || !array(w.ll, w.lots.length ** 2)) bad();
  if (!w.companies?.player || !w.cal || !w.wages || !w.events || !array(w.events.list) || !array(w.eventLog) || !array(w.monthly)) bad();
  if (!['r', 'r_del', 'c', 'c_del'].every((k) => finite(w.cal[k])) || !['basic', 'market', 'high'].every((k) => finite(w.wages[k]) && w.wages[k] > 0)) bad();
  const lots = new Set(w.lots.map((l) => l.id)), ids = new Set(w.shops.map((s) => s.id));
  if (lots.size !== w.lots.length || ids.size !== w.shops.length) bad();
  for (const b of w.bld) if (!finite(b.pop) || b.pop < 0) bad();
  if (w.market) {
    if (w.market.version !== MARKET_VERSION || !Number.isInteger(w.market.startT) || w.market.startT < 0 || w.market.startT > w.t || !finite(w.market.areaKm2) || w.market.areaKm2 <= 0) bad();
    for (const b of w.bld) if (!finite(b.basePop) || b.basePop < 0 || !Number.isInteger(b.floors) || b.floors < 1 || districtOf(b.districtId).id !== b.districtId) bad();
  }
  if (w.pressure) {
    if (!w.market || w.pressure.version !== 1 || !Number.isInteger(w.pressure.startT) || w.pressure.startT < 0 || w.pressure.startT > w.t) bad();
    for (const d of Object.keys(w.pressure.occupancy || {})) if (districtOf(d).id !== d || !finite(w.pressure.occupancy[d]) || w.pressure.occupancy[d] < 0 || w.pressure.occupancy[d] > 1 || !finite(w.pressure.population?.[d]) || w.pressure.population[d] <= 0) bad();
    if (Object.keys(w.pressure.occupancy || {}).length !== 6) bad();
    if (Object.keys(w.pressure.population || {}).length !== 6 || Object.keys(w.pressure.population).some((d) => !Object.hasOwn(w.pressure.occupancy, d))) bad();
  }
  for (const l of w.lots) if (!finite(l.ping) || l.ping <= 0 || !finite(l.rent) || !finite(l.deposit) || l.shopId && !ids.has(l.shopId)) bad();
  for (const l of w.lots) if (l.baseRent != null && (!finite(l.baseRent) || l.baseRent <= 0)) bad();
  for (const co of Object.values(w.companies)) {
    if (!finite(co.cash) || !finite(co.awareness) || !co.cm || !array(co.rows) || !array(co.loans) || !array(co.day30) || !finite(co.adWan) || !finite(co.adDayUnits) || !finite(co.yearProfit)) bad();
    if (co.lastExpansionT != null && (!Number.isInteger(co.lastExpansionT) || co.lastExpansionT < 0 || co.lastExpansionT > w.t)) bad();
    for (const l of co.loans) if (!finite(l.balance) || l.balance < 0 || !finite(l.payment)) bad();
    if (co.expansion && (!co.expansion.projects || !['factory', 'warehouse', 'lab'].every((k) => ['none', 'building', 'ready'].includes(co.expansion.facilities?.[k]?.status)) || !array(co.expansion.facilities.warehouse.orders))) bad();
  }
  for (const s of w.shops) {
    const b = BUSINESSES[s.businessId || 'tea'];
    if (!b || !lots.has(s.lotId) || !w.companies[s.company] || !['open', 'renovating', 'closed'].includes(s.status)) bad();
    if (!array(s.staff, 3) || !s.staff.every((n) => Number.isInteger(n) && n >= 1 && n <= 6) || !array(s.F, w.bld.length) || !array(s.buyB, w.bld.length) || !array(s.days) || !array(s.history) || !array(s.hourEMA, 12) || !array(s.today?.hourly, 12) || !s.mtd || !s.promo || !s.shortage) bad();
    if (!finite(s.inv) || s.inv < 0 || !finite(s.rent) || !Object.keys(b.items).every((k) => finite(s.prices?.[k]) && s.prices[k] > 0)) bad();
    if (!['basic', 'market', 'high'].includes(s.wageLevel) || !['平價', '標準', '講究'].includes(s.grade) || !finite(s.openAtT) || !finite(s.Bw) || !finite(s.Bd) || !finite(s.waitMin)) bad();
    if (!['walk', 'del', 'lost', 'storeRev', 'gmv', 'cogs', 'pack', 'wageMilli', 'openDays', 'rentDays'].every((k) => finite(s.mtd[k]))) bad();
    if (s.mtd.rentUnits != null && (!finite(s.mtd.rentUnits) || s.mtd.rentUnits < 0)) bad();
    if (s.lease) {
      const l = s.lease;
      if (!w.pressure || !['startT', 'endT', 'noticeAtT', 'termDays'].every((k) => Number.isInteger(l[k]) && l[k] >= 0) || l.endT <= l.startT || ![365, 730].includes(l.termDays) || l.noticeAtT > l.endT) bad();
      if (l.offer && !['rent', 'longRent'].every((k) => Number.isInteger(l.offer[k]) && l.offer[k] > 0)) bad();
      if (l.plan && (!['A', 'B', 'C'].includes(l.plan.key) || l.plan.key !== 'C' && (!['rent', 'deposit', 'termDays'].every((k) => Number.isInteger(l.plan[k]) && l.plan[k] > 0) || l.plan.termDays !== (l.plan.key === 'B' ? 730 : 365) || l.plan.deposit !== l.plan.rent * (l.plan.key === 'B' ? 3 : 2)))) bad();
    } else if (w.pressure && s.status !== 'closed') bad();
    if (s.assetLevel != null && (!Number.isInteger(s.assetLevel) || s.assetLevel < 0 || s.assetLevel > (b.upgrades?.length || 0))) bad();
    if (s.stock && (!Number.isInteger(s.stock.day) || s.stock.day < -1 || !['qty', 'value', 'prepared'].every(k => Number.isInteger(s.stock[k]) && s.stock[k] >= 0) || s.stock.qty > s.stock.prepared)) bad();
    if (s.strategy && !strategyValid(s, s.strategy) || s.manager && (!managerValid(s.manager) || s.manager.lastReviewT > w.t)) bad();
    if (s.stock?.mix && (!array(s.stock.mix, Object.keys(b.items).length) || s.stock.mix.some((n) => !finite(n) || n < 0) || Math.abs(s.stock.mix.reduce((a, n) => a + n, 0) - 1) > 1e-8)) bad();
    if (s.stock?.weights && !strategyValid(s, { profile: 'balanced', weights: s.stock.weights })) bad();
    if (s.stock?.grade != null && !['平價', '標準', '講究'].includes(s.stock.grade)) bad();
    for (const k of ['strategyDayUnits', 'managerDayUnits']) if (s.mtd[k] != null && (!finite(s.mtd[k]) || s.mtd[k] < 0)) bad();
    if (s.status !== 'closed' && w.lots.find(l => l.id === s.lotId).shopId !== s.id) bad();
    if (s.operations) {
      if (!Number.isInteger(s.operations.seats) || s.operations.seats < 1 || !Number.isInteger(s.operations.stations) || s.operations.stations < 1) bad();
      if (['cafe', 'restaurant'].includes(s.businessId) && !['takeaway', 'balanced', 'dinein'].includes(s.operations.mode)) bad();
      if (s.businessId === 'salon' && !['quick', 'standard', 'premium'].includes(s.operations.service)) bad();
      if (s.businessId === 'fitness' && !['open', 'coached', 'classes'].includes(s.operations.focus)) bad();
      if (['bento', 'bakery'].includes(s.businessId) && (!Number.isInteger(s.operations.prep) || s.operations.prep < 40 || s.operations.prep > 600 || s.operations.prep % 20 || !(s.businessId === 'bento' ? [0, 15, 30] : [0, 20, 35]).includes(s.operations.markdown))) bad();
      if (['convenience', 'supermarket'].includes(s.businessId) && (!Number.isInteger(s.operations.stockTarget) || s.operations.stockTarget < (s.businessId === 'supermarket' ? 100000 : 20000) || s.operations.stockTarget > stockLimit(s) || s.operations.stockTarget % (s.businessId === 'supermarket' ? 100000 : 10000) || typeof s.operations.autoStock !== 'boolean')) bad();
    }
  }
  for (const e of w.events.list) if (e.kind === 'lease' && (!ids.has(e.shopId) || !Number.isInteger(e.leaseEndT) || e.leaseEndT < 0 || !array(e.choices) || !['A', 'B', 'C'].every((key) => e.choices.some((c) => c.key === key)) || !e.choices.every((c) => ['A', 'B', 'C', 'D'].includes(c.key)))) bad();
}

export function decodeSave(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_BYTES) throw new Error('存檔檔案過大或格式不符');
  const o = JSON.parse(raw);
  if (!o || !o.w || o.format != null && (o.format !== 'tycoon' || o.version !== 1)) throw new Error('這不是支援的創業之城存檔');
  const original = typeof o.w === 'string' ? JSON.parse(o.w) : o.w;
  validate(original);
  const world = deserialize(original);
  const cashHist = o.meta?.cashHist;
  const meta = { cashHist: Array.isArray(cashHist) && cashHist.every((a) => Array.isArray(a) && typeof a[0] === 'string' && Number.isFinite(a[1])) ? cashHist : [] };
  return { world, meta, savedAt: typeof o.savedAt === 'string' && Number.isFinite(Date.parse(o.savedAt)) ? o.savedAt : null, raw };
}
export function encodeSave(world, meta, now = new Date()) {
  return JSON.stringify({ format: 'tycoon', version: 1, savedAt: now.toISOString(), w: serialize(world), meta });
}
export function loadLocal(storage, key = SAVE_KEY, fallback = true) {
  let raw;
  try { raw = storage.getItem(key); } catch { return { ok: false, found: false, error: '瀏覽器不允許讀取本機存檔' }; }
  if (raw) { try { return { ok: true, found: true, ...decodeSave(raw) }; } catch { /* 再試上一份可讀備份 */ } }
  if (fallback && key === SAVE_KEY) {
    const backup = loadLocal(storage, BACKUP_KEY, false);
    if (backup.ok) return { ...backup, recovered: true };
  }
  return { ok: false, found: !!raw, raw, error: raw ? '存檔無法讀取，原始資料已保留。可匯入備份或另存新進度。' : null };
}
export function storeLocal(storage, raw, key = SAVE_KEY) {
  let backedUp = false;
  try {
    decodeSave(raw);
    if (key === SAVE_KEY) {
      const old = loadLocal(storage, SAVE_KEY, false);
      if (old.ok) { try { storage.setItem(BACKUP_KEY, old.raw); backedUp = true; } catch { /* 備份空間不足仍嘗試儲存目前進度 */ } }
    }
    storage.setItem(key, raw);
    return { ok: true, savedAt: JSON.parse(raw).savedAt, backedUp };
  } catch {
    return { ok: false, error: '未存檔：本機空間不足或瀏覽器禁止儲存。請下載備份。' };
  }
}
