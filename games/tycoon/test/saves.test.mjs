import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { SAVE_KEY, MANUAL_KEY, BACKUP_KEY, MAX_SAVE_BYTES, encodeSave, decodeSave, loadLocal, storeLocal } from '../saves.js';
import { FIXTURE, runDays } from './scenario.mjs';

const meta = { cashHist: [['2026-10', 20000000]] };
function world() {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, noRivals: true, multiBusiness: true, seed: 20261001 });
  w.companies.player.cash = 20000000;
  const id = S.openShop(w, w.lots[0].id, { businessId: 'fitness' }).shopId, s = w.shops[0];
  s.openAtT = 0; runDays(w, 8); S.upgradeShop(w, id);
  S.setOperations(w, id, { focus: 'coached' }); S.setStaffing(w, id, [2, 3, 4]); S.takeLoan(w, 'start', 1000000);
  return w;
}
const storage = () => ({ data: new Map(), getItem(k) { return this.data.get(k) || null; }, setItem(k, v) { this.data.set(k, v); } });

test('完整存檔與 JSON 備份保留時間、貸款、設備、設定與報表，續玩模擬結果一致', () => {
  const w = world(), raw = encodeSave(w, meta, new Date('2026-10-07T01:02:03Z')), loaded = decodeSave(raw);
  assert.equal(loaded.savedAt, '2026-10-07T01:02:03.000Z'); assert.deepEqual(loaded.meta, meta);
  assert.equal(S.serialize(loaded.world), S.serialize(w));
  runDays(w, 3); runDays(loaded.world, 3); assert.equal(S.serialize(loaded.world), S.serialize(w));
});
test('自動與手動存檔互相獨立，上次有效進度可恢復，重開會讀取最新進度', () => {
  const st = storage(), w = world(), first = encodeSave(w, meta);
  assert.equal(storeLocal(st, first).ok, true); assert.equal(storeLocal(st, first, MANUAL_KEY).ok, true);
  runDays(w, 2); const latest = encodeSave(w, meta);
  assert.equal(storeLocal(st, latest).ok, true);
  assert.equal(loadLocal(st).world.t, w.t); assert.equal(loadLocal(st, MANUAL_KEY, false).world.t, w.t - 48);
  assert.equal(st.getItem(BACKUP_KEY), first);
  st.setItem(SAVE_KEY, '{ broken'); const recovery = loadLocal(st);
  assert.equal(recovery.recovered, true); assert.equal(recovery.raw, first); assert.equal(st.getItem(SAVE_KEY), '{ broken');
});
test('儲存失敗不會回報成功或破壞現有進度，備份空間不足仍可保存主檔', () => {
  const st = storage(), w = world(), first = encodeSave(w, meta); storeLocal(st, first);
  const original = st.setItem; st.setItem = function(k, v) { if (k === SAVE_KEY) throw new Error('QuotaExceededError'); original.call(this, k, v); };
  runDays(w, 1); const next = encodeSave(w, meta);
  assert.equal(storeLocal(st, next).ok, false); assert.equal(st.getItem(SAVE_KEY), first); assert.equal(loadLocal(st).raw, first);
  st.setItem = function(k, v) { if (k === BACKUP_KEY) throw new Error('quota'); original.call(this, k, v); };
  const saved = storeLocal(st, next); assert.equal(saved.ok, true); assert.equal(saved.backedUp, false); assert.equal(loadLocal(st).raw, next);
  const denied = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(loadLocal(denied).ok, false); assert.equal(storeLocal(denied, next).ok, false);
});
test('舊版存檔可以遷移，缺少統計中繼資料不影響帳目', () => {
  const w = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, seed: 20261001 });
  for (const s of w.shops) { delete s.businessId; delete s.operations; delete s.stock; delete s.assetLevel; delete s.assetInvestment; delete s.leasedPing; }
  const loaded = decodeSave(JSON.stringify({ w: S.serialize(w), meta: {} }));
  assert.equal(loaded.savedAt, null); assert.deepEqual(loaded.meta.cashHist, []);
  assert.equal(loaded.world.companies.player.cash, w.companies.player.cash);
  assert.ok(loaded.world.shops.every((s) => s.businessId === 'tea' && s.assetLevel === 0));
});
test('損壞、未知版本與異常結構的匯入被拒絕，原始存檔保留', () => {
  const w = world(), raw = encodeSave(w, meta), st = storage(); storeLocal(st, raw);
  const invalid = ['{}', 'bad', JSON.stringify({ ...JSON.parse(raw), version: 99 }), 'x'.repeat(MAX_SAVE_BYTES + 1)];
  for (const mutate of [x => { x.shops[0].businessId = 'unknown'; }, x => { x.shops[0].operations.focus = 'bad'; }, x => { x.lots[0].ping = 0; }, x => { x.shops[0].F = []; }, x => { x.companies.player.cash = null; }, x => { x.companies.player.loans[0].balance = -1; }, x => { x.t = -1; }]) {
    const o = JSON.parse(raw), body = JSON.parse(o.w); mutate(body); o.w = JSON.stringify(body); invalid.push(JSON.stringify(o));
  }
  invalid.push(raw.replace('"cashHist":', '"__proto__":{"polluted":true},"cashHist":'));
  // 中繼資料不會直接合併進遊戲物件。
  assert.equal(decodeSave(invalid.pop()).world.companies.player.polluted, undefined);
  for (const bad of invalid) { assert.throws(() => decodeSave(bad)); assert.equal(storeLocal(st, bad).ok, false); assert.equal(st.getItem(SAVE_KEY), raw); }
  st.setItem(SAVE_KEY, 'broken'); st.data.delete(BACKUP_KEY); const failed = loadLocal(st);
  assert.equal(failed.ok, false); assert.equal(failed.found, true); assert.equal(failed.raw, 'broken'); assert.equal(st.getItem(SAVE_KEY), 'broken');
});
