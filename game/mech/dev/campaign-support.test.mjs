import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEscortSupport, escortSupport } from '../lastline/campaign-support.mjs';
import { customsConvoyConfig } from '../lastline/convoy-plan.mjs';
import { ENCOUNTERS, MECH_CONFIGS } from '../lastline/script.js';

const plan = (chapter, ledger) => applyEscortSupport(MECH_CONFIGS[chapter], escortSupport(ledger));
const timings = (config, wave) => config.waves[wave].operation.points.map(point => point.seconds);

test('護送支援只讀作業成果與有效的廣播收據，已存組合優先', () => {
  const drydock = { crane: true, cooling: true, boot: true };
  const ledger = {
    ...drydock, alarm: true, permit: 1, engineer: false, other: true, broadcast: true,
    vehicleSupport: ['ground-crew', 'quiet-channel', 'ground-crew', 'first-aid', null],
  };
  assert.deepEqual(escortSupport(ledger), { ...drydock, alarm: true, vehicleSupport: ['quiet-channel', 'ground-crew'] });
  assert.deepEqual(escortSupport(ledger, {}), {});
  assert.deepEqual(escortSupport(ledger, null), {});
  const saved = { permit: true, broadcast: { evidence: false, manifest: true, other: true } };
  assert.deepEqual(escortSupport(ledger, saved), { permit: true, broadcast: { evidence: false, manifest: true } });
  assert.deepEqual(escortSupport({ broadcast: { evidence: true } }), {});
  assert.deepEqual(escortSupport(), {});
  const earned = Object.fromEntries(ENCOUNTERS.filter(e => e.operation?.reward).map(e => [e.operation.reward, true]));
  assert.deepEqual(escortSupport(earned), earned);
});

test('第 4 章切斷一組增援，維修備品作用於後續波次並保留海關路線與維修支援', () => {
  const base = MECH_CONFIGS[4];
  const earned = escortSupport({ alarm: true, crane: true, cooling: true, boot: true, vehicleSupport: ['ground-crew', 'shuttle-tools'] });
  for (const clue of [null, 'shift-log', 'fax-copy']) {
    const customs = customsConvoyConfig(base, clue), configured = applyEscortSupport(customs, earned);
    assert.equal(configured.route, customs.route);
    assert.equal(configured.choiceAt, customs.choiceAt);
    assert.equal(configured.support, earned);
    assert.equal(configured.waves[0], customs.waves[0]);
    assert.equal(configured.waves[1].list, customs.waves[1].list);
    assert.deepEqual(configured.waves[1].reinforce, base.waves[1].reinforce.slice(0, -1));
    assert.equal(configured.waves[2].operation, customs.waves[2].operation);
    assert.equal(configured.waves[3].repair, .30);
    assert(configured.waves[1].lines.some(([, text]) => text.includes('海關警報')));
  }
  assert.equal(base.waves[1].reinforce.length, 2);
  assert.equal(base.waves[3].repair, .18);
  assert.equal(plan(4, { crane: true, cooling: true }).waves[1].repair, .18);
  assert.equal(plan(5, earned).waves[2].repair, .33);
  assert.equal(plan(6, { vehicleSupport: ['ground-crew'] }).waves[2].repair, .22);
});

test('第 5 章分別使用已驗證原始檔及港務中繼，現場備援仍有完整廣播流程', () => {
  const ordinary = plan(5, {});
  assert.deepEqual(timings(ordinary, 1), [6, 4]);
  assert.deepEqual(timings(ordinary, 2), [24]);
  assert.equal(ordinary.waves[1].operation.points[0].label, '上傳海關現場紀錄');
  assert.match(ordinary.start.lines[2][1], /海關現場紀錄/);
  assert.match(ordinary.end[0][1], /海關現場紀錄/);
  assert.doesNotMatch(ordinary.end[0][1], /名單|原始簽章/);
  assert.deepEqual(timings(plan(5, { evidence: true }), 1), [4, 4]);
  assert.deepEqual(timings(plan(5, { relay: true }), 1), [6, 2]);
  const both = plan(5, { evidence: true, manifest: true, relay: true });
  assert.deepEqual(timings(both, 1), [4, 2]);
  assert.deepEqual(timings(both, 2), [24]);
  assert.match(both.end[0][1], /原始簽章和轉運名單/);
  assert.equal(both.waves[1].operation.kind, ordinary.waves[1].operation.kind);
  assert.deepEqual(both.waves[1].operation.points.map(point => [...point]), ordinary.waves[1].operation.points.map(point => [...point]));
  assert.notEqual(ordinary.start, MECH_CONFIGS[5].start);
  assert.notEqual(ordinary.start.lines[1], MECH_CONFIGS[5].start.lines[1]);
  assert.equal(MECH_CONFIGS[5].waves[1].operation.points[0].seconds, 6);
});

test('第 6、7 章沿原場地運用工程隊、雙授權、醫療成果及港外廣播', () => {
  assert.deepEqual(timings(plan(6, { engineer: true, crew: true }), 1), [2, 5]);
  assert.deepEqual(timings(plan(6, { engineer: true, crew: true }), 2), [20]);
  assert.deepEqual(timings(plan(6, {}), 1), [4, 5]);
  assert.deepEqual(timings(plan(6, {}), 2), [26]);
  const ordinary = plan(7, { broadcast: true });
  assert.deepEqual(timings(ordinary, 0), [4, 4]);
  assert.deepEqual(timings(ordinary, 1), [30]);
  assert.deepEqual(timings(plan(7, { permit: true }), 0), [2, 4]);
  assert.deepEqual(timings(plan(7, { auth: true }), 0), [4, 2]);
  assert.deepEqual(timings(plan(7, { medics: true, manifest: true }), 1), [22]);
  const supported = plan(7, {
    permit: true, auth: true, medics: true, manifest: true,
    vehicleSupport: ['oxygen-reserve', 'safe-cargo'], broadcast: { evidence: false, manifest: false },
  });
  assert.deepEqual(timings(supported, 0), [2, 2]);
  assert.deepEqual(timings(supported, 1), [17]);
  assert.deepEqual(timings(supported, 2), [6]);
  assert.deepEqual(supported.waves[2].reinforce, ordinary.waves[2].reinforce.slice(0, -1));
  assert.equal(supported.waves[2].list, ordinary.waves[2].list);
  assert.equal(ordinary.waves[2].reinforce.length, 2);
});
