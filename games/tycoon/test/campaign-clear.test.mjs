import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../sim.js';
import { ADVANCED_GOALS } from '../businesses.js';
import { encodeSave, decodeSave } from '../saves.js';
import { industryBoardHtml } from '../industry-view.js';
import { FIXTURE, runDays } from './scenario.mjs';
const END_DAY = S._internals.END_DAY;
function make(id = 'tea') {
  const world = S.createWorld({ mapData: FIXTURE.map, distances: FIXTURE.dist, noRivals: true, multiBusiness: true, campaignBusiness: id, seed: 7 });
  world.companies.player.awareness = .6;
  const lot = world.lots.filter(l => l.zone === '住宅').sort((a, b) => a.rent - b.rent)[0], r = S.openShop(world, lot.id, { businessId: id, ownerWorks: true });
  const shop = world.shops.find(s => s.id === r.shopId); shop.openAtT = 0; shop.industry.milestones = [0, 1, 2];
  world.companies.player.cash = 2e7;
  return world;
}
const offer = world => world.events.list.find(e => e.kind === 'campaign');
function untilOffer(world) { for (let i = 0; i < 400 && !offer(world); i++) runDays(world, 1); return offer(world); }
function toEnd(world) { while (world.status === 'playing' && world.t < END_DAY * 24 + 48) runDays(world, 1); }

test('meeting the three conditions raises a choice instead of ending the game', () => {
  const w = make(), ev = untilOffer(w);
  assert.ok(ev); assert.equal(w.status, 'playing'); assert.equal(ev.status, 'pending');
  assert.deepEqual(ev.choices.map(c => c.key), ['A', 'B']);
  assert.match(ev.text, /預設結算過關/);
  runDays(w, 60); assert.equal(w.events.list.filter(e => e.kind === 'campaign').length, 1, 'offered only once');
});
test('choosing settle ends as won; ignoring the choice defaults to settle', () => {
  const w = make(), ev = untilOffer(w);
  assert.equal(S.respondEvent(w, ev.id, 'A').ok, true);
  assert.equal(w.status, 'won'); assert.match(w.endReason, /結算過關/); assert.equal(w.campaignCleared, undefined);
  const w2 = make(); untilOffer(w2); runDays(w2, 20);
  assert.equal(w2.status, 'won'); assert.equal(offer(w2).auto, true); assert.equal(offer(w2).choice, 'A');
});
test('choosing continue keeps playing to the end date and never turns into a loss', () => {
  const w = make(), ev = untilOffer(w);
  assert.equal(S.respondEvent(w, ev.id, 'B').ok, true);
  assert.equal(w.status, 'playing'); assert.ok(w.campaignCleared); assert.equal(w.campaignCleared.goal, ADVANCED_GOALS.tea);
  w.shops.find(s => s.owner === 'player').industry.milestones = [];
  w.companies.player.cash = 1e6;
  runDays(w, 100); assert.equal(w.status, 'playing', 'no early win once continuing');
  toEnd(w); assert.equal(w.status, 'won');
  assert.equal(w.campaignCleared.goalMet, false); assert.match(w.endReason, /進階目標未達成（期末淨值 .*，差 /);
});
test('net worth at the end date decides the advanced goal text', () => {
  const w = make(), ev = untilOffer(w); S.respondEvent(w, ev.id, 'B');
  runDays(w, Math.ceil(END_DAY - w.t / 24) - 2);
  w.companies.player.cash = ADVANCED_GOALS.tea + 4e7; w.companies.player.loans = [];
  toEnd(w);
  assert.equal(w.status, 'won'); assert.equal(w.campaignCleared.goalMet, true); assert.match(w.endReason, /過關，進階目標達成/);
  const w2 = make(), ev2 = untilOffer(w2); S.respondEvent(w2, ev2.id, 'B');
  runDays(w2, Math.ceil(END_DAY - w2.t / 24) - 2);
  w2.companies.player.cash = 1e6; w2.companies.player.loans = [];
  toEnd(w2);
  assert.equal(w2.status, 'won'); assert.equal(w2.campaignCleared.goalMet, false); assert.match(w2.endReason, /進階目標未達成/);
});
test('net worth is cash minus loan balances', () => {
  const w = make(); w.companies.player.cash = 9e6; w.companies.player.loans = [{ id: 'L1', kind: 'start', principal: 5e6, balance: 4e6, payment: 1, left: 12 }];
  assert.equal(S.campaignNetWorth(w), 5e6);
});
test('running out of cash after clearing still ends as won, not bankrupt', () => {
  const w = make(), ev = untilOffer(w); S.respondEvent(w, ev.id, 'B');
  w.companies.player.cash = -1e9; w.companies.player.loans = [];
  runDays(w, 45);
  assert.equal(w.status, 'won'); assert.match(w.endReason, /現金耗盡.*進階目標未達成/);
});
test('progress line shows the cleared state and advanced goal', () => {
  const w = make(), ev = untilOffer(w), shop = w.shops.find(s => s.owner === 'player');
  const html = () => industryBoardHtml(shop, { shopId: shop.id, progress: S.campaignProgress(w), advanced: S.campaignAdvanced(w) });
  assert.match(html(), /近三月獲利 3／3/); assert.doesNotMatch(html(), /已過關/);
  S.respondEvent(w, ev.id, 'B');
  assert.match(html(), /已過關｜進階目標：淨值 \$[\d,]+／\$19,000,000/);
});
test('every store business has an advanced goal', () => {
  for (const id of Object.keys(S.BUSINESSES)) assert.ok(ADVANCED_GOALS[id] > 0, id);
});
test('old saves without the new fields load, and the new fields survive a save', () => {
  const w = make(); delete w.campaignCleared; delete w.campaignOffered;
  const old = decodeSave(encodeSave(w, {})).world; assert.equal(old.campaignCleared, undefined);
  assert.equal(S.campaignAdvanced(old).cleared, false);
  assert.ok(untilOffer(old));
  const ev = offer(old); S.respondEvent(old, ev.id, 'B');
  const back = decodeSave(encodeSave(old, {})).world; assert.equal(back.campaignCleared.goal, ADVANCED_GOALS.tea);
  const pending = make(); untilOffer(pending); assert.equal(decodeSave(encodeSave(pending, {})).world.status, 'playing');
});
