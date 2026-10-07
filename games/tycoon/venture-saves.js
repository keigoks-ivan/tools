import { manufacturingValid } from './manufacturing.js';
import { technologyValid } from './technology.js';
import { learningValid } from './decision-learning.js';
export const routeKey = mode => `tycoon.${mode}.save.v1`;
export const MAX_BYTES = 2 * 1024 * 1024;
const validMode = mode => ['manufacturing', 'technology'].includes(mode);
export function encodeVenture(world, now = new Date()) { return JSON.stringify({ format: 'tycoon-venture', version: 1, mode: world.mode, savedAt: now.toISOString(), world }); }
export function decodeVenture(raw, mode) {
  if (!validMode(mode) || typeof raw !== 'string' || raw.length > MAX_BYTES) throw new Error('存檔路線或大小不符。');
  const o = JSON.parse(raw);
  function safe(v, depth = 0) {
    if (depth > 40 || typeof v === 'number' && !Number.isFinite(v)) throw new Error('存檔數值不符。');
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (['__proto__', 'prototype', 'constructor'].includes(k)) throw new Error('存檔欄位不符。'); safe(x, depth + 1); }
  }
  safe(o);
  if (o.world?.learning != null && !learningValid(o.world.learning)) throw new Error('決策紀錄格式不符，原始存檔已保留。');
  if (o.format !== 'tycoon-venture' || o.version !== 1 || o.mode !== mode || !(mode === 'manufacturing' ? manufacturingValid(o.world) : technologyValid(o.world))) throw new Error('存檔已損壞、路線不符或版本不支援。');
  return { world: o.world, savedAt: o.savedAt, raw };
}
export function loadVenture(storage, mode) {
  let raw;
  try {
    raw = storage.getItem(routeKey(mode));
    if (raw) { try { return { ok: true, ...decodeVenture(raw, mode) }; } catch { /* 保留原檔，再試備份 */ } }
    const backup = storage.getItem(routeKey(mode) + '.backup');
    if (backup) { try { return { ok: true, recovered: true, ...decodeVenture(backup, mode) }; } catch { /* 保留損壞資料 */ } }
    return { ok: false, found: !!(raw || backup), raw: raw || backup, error: raw || backup ? '此路線的存檔無法讀取，原檔已保留。請匯入備份或下載原檔後重開。' : null };
  } catch { return { ok: false, found: true, error: '瀏覽器禁止讀取存檔；不會覆蓋既有資料。' }; }
}
export function storeVenture(storage, world) {
  try {
    const raw = encodeVenture(world); decodeVenture(raw, world.mode);
    const key = routeKey(world.mode), old = storage.getItem(key);
    if (old) { try { decodeVenture(old, world.mode); storage.setItem(key + '.backup', old); } catch { /* 不用損壞主檔取代有效備份 */ } }
    storage.setItem(key, raw); return { ok: true, savedAt: JSON.parse(raw).savedAt };
  } catch { return { ok: false, error: '尚未存檔：本機空間不足或存檔檢查未通過。請下載備份。' }; }
}
