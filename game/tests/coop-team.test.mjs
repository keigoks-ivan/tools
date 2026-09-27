// 三人連線第三階段的純邏輯：救援狀態機、全滅、合體視窗、補給裁定、交棒遲滯（net/team.js）。
// 兩台裝置一起跑的整合測試在 coop-sync.test.mjs 最後面。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSOU_FLURRY } from '../2d/combat.js';
import { COMBO, ComboWindow, HANDOFF, HandoffPolicy, PICKUP_REACH, ReviveTracker, STATUS, TEAM, comboProfile, grantPickup, readStatus, statusBits, teamWiped } from '../3d-next/net/team.js';
import { assignTargets } from '../3d-next/net/authority.js';
import { cleanClaim, cleanState } from '../../workers/coop-relay/src/logic.js';
import { decodeState, encodeState } from '../3d-next/net/protocol.js';

const run = (tracker, seconds, players, dt = 1 / 60) => {
  let last = { progress: [], revived: [] };
  const revived = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) { last = tracker.update(dt, players()); revived.push(...last.revived); }
  return { ...last, revived };
};

test('revive: a teammate standing still next to a downed player revives them after ~3 s', () => {
  const tracker = new ReviveTracker();
  let downed = true;
  const players = () => [{ id: 'A', x: 0, y: 0, downed }, { id: 'B', x: 60, y: 0, downed: false }];
  const half = run(tracker, 0.75, players);
  assert.deepEqual(half.revived, []);
  const [[id, pct, by]] = half.progress;
  assert.equal(id, 'A'); assert.equal(by, 'B');
  assert.ok(pct >= 25 && pct <= 40, `about a third after 0.75 s (settle ${TEAM.stillSettle} s first): ${pct}`);
  let rest = { revived: [] };
  for (let t = 0; t < 2; t += 1 / 60) { const r = tracker.update(1 / 60, players()); rest = { progress: r.progress, revived: [...rest.revived, ...r.revived] }; if (r.revived.includes('A')) downed = false; }
  assert.deepEqual(rest.revived, ['A'], 'revived once');
  assert.deepEqual(rest.progress, []);
  assert.equal(tracker.progress.size, 0);
  assert.ok(TEAM.reviveSeconds === 1.5 && TEAM.reviveHp === 0.5);
});

test('revive: walking past, standing too far, being downed yourself or not being present does not count', () => {
  // walking past at running speed: the anchor keeps resetting, progress never starts
  let x = -200;
  const walker = new ReviveTracker();
  const walking = run(walker, 2, () => { x += 5; return [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x, y: 0 }]; });
  assert.deepEqual(walking.progress, []);
  // too far
  const far = run(new ReviveTracker(), 4, () => [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: TEAM.reviveRadius + 5, y: 0 }]);
  assert.deepEqual(far.revived, []);
  // two downed players cannot revive each other
  const both = run(new ReviveTracker(), 4, () => [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: 30, y: 0, downed: true }]);
  assert.deepEqual(both.revived, []);
  // a teammate whose state is stale (not present) cannot revive
  const stale = run(new ReviveTracker(), 4, () => [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: 30, y: 0, present: false }]);
  assert.deepEqual(stale.revived, []);
});

test('revive: stepping away pauses and rewinds progress; the nearest still teammate is credited', () => {
  const tracker = new ReviveTracker();
  let bx = 40;
  run(tracker, 1.2, () => [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: bx, y: 0 }]);
  const before = tracker.progress.get('A').seconds;
  bx = 400;   // B walks off to fight
  run(tracker, 0.25, () => [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: bx, y: 0 }]);
  const after = tracker.progress.get('A').seconds;
  assert.ok(Math.abs(before - after - 0.25 * TEAM.reviveDecay) < 0.05, `rewinds at ×${TEAM.reviveDecay} (${before.toFixed(2)} → ${after.toFixed(2)})`);
  const three = tracker.update(1 / 60, [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: 400, y: 0 }, { id: 'C', x: 20, y: 0 }]);
  assert.ok(three.progress.length === 1);
  run(tracker, 0.5, () => [{ id: 'A', x: 0, y: 0, downed: true }, { id: 'B', x: 70, y: 0 }, { id: 'C', x: 20, y: 0 }]);
  assert.equal(tracker.progress.get('A').by, 'C', 'nearest reviver');
  // the downed player leaving clears their entry
  tracker.update(1 / 60, [{ id: 'C', x: 20, y: 0 }]);
  assert.equal(tracker.progress.size, 0);
});

test('team wipe only when every player is downed', () => {
  assert.equal(teamWiped([{ downed: true }, { downed: true }]), true);
  assert.equal(teamWiped([{ downed: true }, { downed: false }]), false);
  assert.equal(teamWiped([{ downed: true }, {}]), false, 'unknown state counts as standing');
  assert.equal(teamWiped([{ downed: true }]), true, 'last one standing went down after the others left');
  assert.equal(teamWiped([]), false);
});

test('downed players are targeted less: enemies prefer the standing player', () => {
  const enemies = [1, 2, 3].map(id => ({ id, role: 'grunt', x: 10 * id, y: 0, action: 'chase' }));
  const standingFar = { id: 'B', x: 300, y: 0 };
  const plain = assignTargets(enemies, [{ id: 'A', x: 0, y: 0 }, standingFar]);
  assert.ok([...plain.values()].includes('A'), 'without the penalty A (next to them) gets some');
  const withPenalty = assignTargets(enemies, [{ id: 'A', x: 0, y: 0, penalty: TEAM.downedTargetPenalty }, standingFar]);
  const countA = map => [...map.values()].filter(id => id === 'A').length;
  assert.ok(countA(withPenalty) < countA(plain), `fewer enemies on downed A (${countA(plain)} → ${countA(withPenalty)})`);
  assert.equal(withPenalty.get(1), 'B', 'the enemy right next to downed A still goes for standing B');
  const onlyDowned = assignTargets(enemies, [{ id: 'A', x: 0, y: 0, penalty: TEAM.downedTargetPenalty }]);
  assert.equal(onlyDowned.size, 3, 'still a target when nobody else is around');
});

test('combo musou window: two musou starts within 1.5 s form a combo; the bonus copies the profile', () => {
  const combo = new ComboWindow();
  assert.deepEqual(combo.note('A', 1000), []);
  assert.deepEqual(combo.note('B', 1000 + COMBO.windowMs), ['A'], 'edge of the window counts');
  assert.deepEqual(combo.note('C', 1000 + COMBO.windowMs + 10), ['B'], 'A is out of the window for C');
  combo.reset();
  assert.deepEqual(combo.note('A', 0), []);
  assert.deepEqual(combo.note('B', 1600), [], 'too late');
  const F = MUSOU_FLURRY.standard;
  const boosted = comboProfile(F);
  assert.equal(boosted.damageScale, F.damageScale * COMBO.damage);
  assert.equal(boosted.radius, F.radius * COMBO.radius);
  assert.equal(boosted.finishRadius, F.finishRadius * COMBO.radius);
  assert.equal(boosted.combo, true);
  assert.equal(F.damageScale, 1, 'MUSOU_FLURRY itself is not changed');
  assert.ok(MUSOU_FLURRY.true.finishDamage * comboProfile(MUSOU_FLURRY.true).damageScale <= 40, 'boosted 真・天刃 finish still passes the claim limit');
});

test('pickup arbitration: first valid claim wins, far or downed claimants are refused', () => {
  const pickups = [{ id: 1, x: 100, y: 100 }, { id: 2, x: 900, y: 100 }];
  assert.equal(grantPickup(pickups, 1, { x: 120, y: 110 }), 0);
  assert.equal(grantPickup(pickups, 2, { x: 120, y: 110 }), -1, 'too far');
  assert.equal(grantPickup(pickups, 1, { x: 100 + PICKUP_REACH + 1, y: 100 }), -1);
  assert.equal(grantPickup(pickups, 1, { x: 100, y: 100, downed: true }), -1, 'downed');
  assert.equal(grantPickup(pickups, 3, { x: 100, y: 100 }), -1, 'already taken');
  assert.equal(grantPickup(pickups, 1, null), -1);
});

test('hand-off hysteresis: only after the host stays hidden/stalled, only to a stably visible player, never bouncing', () => {
  const policy = new HandoffPolicy();
  policy.becameHost(0);
  const seen = [{ id: 'B', visible: true, downed: false, present: true }];
  let t = 10000;
  assert.equal(policy.decide(t, { hidden: false }, seen), null, 'fine host keeps the role');
  // a short blip (1 s hidden) is ignored
  for (let k = 0; k < 10; k++) assert.equal(policy.decide(t += 100, { hidden: true }, seen), null);
  assert.equal(policy.decide(t += 100, { hidden: false }, seen), null);
  // hidden for longer than the grace period → hand off
  let heir = null, since = t;
  while (!heir && t < since + 5000) heir = policy.decide(t += 100, { hidden: true }, seen);
  assert.equal(heir, 'B');
  assert.ok(t - since >= HANDOFF.graceMs, `waited ${t - since} ms`);
  policy.yielded(t);
  // right after yielding: no second hand-off during the cooldown even if still bad
  for (let k = 0; k < 30; k++) assert.equal(policy.decide(t += 100, { hidden: true }, seen), null);
  // a freshly promoted host does not yield back within its minimum tenure
  const fresh = new HandoffPolicy();
  fresh.becameHost(0);
  const others = [{ id: 'A', visible: true, present: true }];
  for (let t2 = 0; t2 < HANDOFF.minTenureMs - 100; t2 += 100) assert.equal(fresh.decide(t2, { stalled: true }, others), null);
});

test('hand-off: nobody visible → keep hosting; resume when someone comes back; standing players preferred', () => {
  const policy = new HandoffPolicy();
  policy.becameHost(-1e6);
  let t = 0;
  const hiddenPeers = [{ id: 'B', visible: false, present: true }, { id: 'C', visible: false, present: false }];
  for (let k = 0; k < 100; k++) assert.equal(policy.decide(t += 100, { hidden: true }, hiddenPeers), null, 'stays host while everyone is away');
  const back = [{ id: 'B', visible: true, downed: true, present: true }, { id: 'C', visible: true, downed: false, present: true }];
  const returned = t;
  let heir = null;
  while (!heir && t < returned + 5000) heir = policy.decide(t += 100, { hidden: true }, back);
  assert.equal(heir, 'C', 'the standing player gets it before the downed one');
  assert.ok(t - returned >= HANDOFF.visibleStableMs, 'visible long enough first');
  // only a downed player is visible: still better than a stuck room
  const p2 = new HandoffPolicy();
  p2.becameHost(-1e6);
  let t2 = 0, h2 = null;
  while (!h2 && t2 < 10000) h2 = p2.decide(t2 += 100, { stalled: true }, [{ id: 'B', visible: true, downed: true, present: true }]);
  assert.equal(h2, 'B');
});

test('status bits travel through the state message and the relay sanitizer', () => {
  assert.equal(statusBits({ hidden: true, downed: true }), STATUS.hidden | STATUS.downed);
  assert.deepEqual(readStatus(2), { hidden: false, downed: true });
  assert.deepEqual(readStatus(undefined), { hidden: false, downed: false });
  const text = encodeState({ x: 1, y: 0, z: 2, yaw: 0, anim: 'death', st: statusBits({ downed: true }) }, 5);
  const { d } = JSON.parse(text);
  const clean = cleanState(d);
  assert.equal(clean.st, STATUS.downed);
  assert.equal(decodeState(clean).st, STATUS.downed);
  assert.equal(cleanState({ ...d, st: 999 }).st, undefined, 'out of range dropped');
  assert.equal(cleanState({ ...d, st: 'x' }).st, undefined);
  assert.equal('st' in JSON.parse(encodeState({ x: 1, y: 0, z: 2, yaw: 0 }, 5)).d, false, 'no status → no field');
  // retry request passes the claim sanitizer on its own
  assert.deepEqual(cleanClaim({ r: 1 }), { h: [], r: 1 });
  assert.equal(cleanClaim({ r: 2 }), null);
});
