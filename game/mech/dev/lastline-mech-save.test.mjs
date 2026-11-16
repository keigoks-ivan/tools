import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMission } from '../lastline/mission.js';

const route = [[192, -120], [360, -120], [360, 120], [600, 120]];
const site = Object.assign([360, -120], { label: '接通車隊設施', seconds: .2 });
const waves = [{}, { operation: { kind: 'console', points: [site] } }, {}, {}];

function fixture(t) {
  const storage = new Map(), chapters = [], said = [], noop = () => {};
  const scene = new THREE.Scene();
  const globals = {
    document: { body: { append: noop }, createElement: () => ({
      addEventListener(type, handler) { this[type] = handler; }
    }) },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    location: { search: '?mute', href: 'https://example.test/game/mech/lastline/' },
    addEventListener: noop,
  };
  const originals = Object.entries(globals).map(([key, value]) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    return [key, original];
  });
  t.after(() => {
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    }
  });
  const make = (chapter, resumeSave = false, overrides = {}) => createMission({
    config: { chapter, next: chapter + 1, choiceAt: 1, route, waves, ...overrides }, resumeSave,
    scene, world: { height: () => 0 }, fx: { explosion: noop },
    player: { pos: new THREE.Vector3(360, 0, -120) },
    combat: () => fight, zhud: { say: (...line) => said.push(line) },
    input: { reset: noop, unlock: noop, touch: { on: true }, keys: new Set(['KeyB']) },
    saveChapter: chapter => chapters.push(chapter),
  });
  const fight = { stats: { kills: 3 }, phase: 'fight', damageFx: 0, enemies: [], events: [], note: noop, hurt: noop, audio: { explosion: noop } };
  return { make, chapters, said, scene, fight, read: key => JSON.parse(storage.get('lastline.' + key) ?? 'null'),
    write: (key, value) => storage.set('lastline.' + key, JSON.stringify(value)) };
}

for (const [choice, liveHP, savedHP] of [['rescue', 49, 90], ['artillery', 31, 72]]) {
  test(`橋頭選擇 ${choice} 留在原檢查點，車隊在重試與重載一起倒回安全路口`, t => {
    const { make, read } = fixture(t), mission = make(4), convoy = mission.convoy;
    while (convoy.index < 1) convoy.step(.1, true, convoy.pos);
    convoy.damage(28);
    mission.onWave(1);
    mission.tick(.1); mission.tick(.1);
    const before = read('checkpoint');
    assert(before.operation.done);
    for (let i = 0; i < 25; i++) mission.tick(.1);
    convoy.damage(41);
    const live = convoy.snapshot();
    assert.notDeepEqual(live.pos, before.convoy.pos);
    assert.equal(mission.ready(2, { go: [360, 120, 90] }), false);
    mission.panel.click({ target: { closest: selector => selector === '[data-choice]' ? { dataset: { choice } } : null } });
    const saved = read('checkpoint');
    assert.deepEqual(saved, { ...before, convoy: { ...before.convoy, choice, hp: savedHP } });
    assert.deepEqual(convoy.snapshot(), { ...live, choice, hp: liveHP });
    assert.equal(read('choice'), choice);
    assert.equal(mission.restart(), 1);
    assert.deepEqual(convoy.snapshot(), saved.convoy);
    assert.deepEqual(mission.operation.snapshot(), saved.operation);
    const resumed = make(4, true);
    assert.equal(resumed.startWave, 1);
    assert.deepEqual(resumed.convoy.snapshot(), saved.convoy);
    resumed.onWave(1);
    assert.deepEqual(resumed.operation.snapshot(), saved.operation);
    assert.equal(read('checkpoint').convoy.hp, savedHP);
  });
}

test('第 4 到 6 章交接先保留下一章入口，第一戰前也有檢查點復原目標', t => {
  const { make, chapters, read } = fixture(t);
  const first = make(4);
  assert(first.convoy.choose('artillery'));
  for (const chapter of [4, 5, 6]) {
    const mission = chapter === 4 ? first : make(chapter, true);
    mission.convoy.damage(9);
    mission.onEnd(true);
    mission.finish();
    assert.deepEqual(read('checkpoint'), { chapter: chapter + 1 });
    const destination = new URL(location.href);
    assert.equal(destination.searchParams.get('ch'), String(chapter + 1));
    assert(destination.searchParams.has('mute'));
    const resumed = make(chapter + 1, true);
    assert.equal(resumed.startWave, 0);
    assert.equal(resumed.convoy.hp, mission.convoy.hp);
    assert.equal(resumed.convoy.choice, 'artillery');
  }
  assert.deepEqual(chapters, [5, 6, 7]);
});

for (const [clue, repair] of [[null, 0], ['fax-copy', 25]]) {
  test(`第 4 章 ${clue ?? '原路線'} 的維修支援效果隨檢查點保存且不重複發放`, t => {
    const { make, read, said } = fixture(t);
    const operation = { kind: 'defend', points: [site], ...(repair ? { convoyRepair: repair } : {}) };
    const config = { customsClue: clue, waves: [waves[0], waves[1], { operation }, waves[3]] };
    const mission = make(4, false, config), convoy = mission.convoy;
    while (convoy.index < 2) convoy.step(.1, true, convoy.pos);
    convoy.damage(20);
    mission.onWave(2);
    const initial = read('checkpoint');
    assert.equal(initial.customsClue, clue);
    assert.equal(initial.convoy.hp, 80);
    convoy.damage(26);
    mission.tick(.1);
    assert.equal(convoy.hp, 54);
    mission.tick(.1);
    assert.equal(convoy.hp, 54 + repair);
    const saved = read('checkpoint');
    assert.equal(saved.convoy.hp, Math.min(100, 80 + repair));
    assert.deepEqual(saved.convoy.pos, initial.convoy.pos);
    assert.equal(saved.operation.done, true);
    const repairs = () => said.filter(([speaker, line]) => speaker === '米拉' && line.includes('恢復 25%')).length;
    assert.equal(repairs(), repair ? 1 : 0);

    convoy.damage(5);
    mission.tick(.1);
    assert.equal(convoy.hp, 49 + repair);
    assert.equal(mission.restart(), 2);
    assert.equal(convoy.hp, saved.convoy.hp);
    assert.equal(mission.operation.done, true);
    convoy.damage(6);
    mission.tick(.1);
    assert.equal(convoy.hp, saved.convoy.hp - 6);

    const resumed = make(4, true, config);
    assert.equal(resumed.startWave, 2);
    resumed.onWave(2);
    resumed.convoy.damage(6);
    resumed.tick(.1);
    assert.equal(resumed.convoy.hp, saved.convoy.hp - 6);
    assert.equal(repairs(), repair ? 1 : 0);
  });
}

test('完成廣播防守及第 5 章才寫入已送達的資料，保留既有戰役成果', t => {
  const { make, read, write, fight } = fixture(t);
  const support = { evidence: true, manifest: false, vehicleSupport: ['channel-warning'] };
  const ledger = { evidence: true, manifest: true, customsClue: 'fax-copy', power: true };
  write('operations', ledger);
  fight.group = 2;
  const chapterWaves = [{}, { operation: { kind: 'console', points: [site, site] } }, { operation: { kind: 'defend', points: [site] } }];
  const config = { support, waves: chapterWaves };
  const mission = make(5, false, config);
  mission.onWave(1);
  mission.tick(.1); mission.tick(.1);
  assert.equal(mission.operation.index, 1);
  assert.equal(read('operations').broadcast, undefined);
  mission.tick(.1); mission.tick(.1);
  assert(mission.operation.done);
  assert.deepEqual(read('checkpoint').support, support);
  assert.equal(read('operations').broadcast, undefined);
  assert.equal(read('broadcast'), null);

  mission.onWave(2);
  mission.tick(.1);
  mission.onEnd(false);
  assert.deepEqual(read('operations'), ledger);
  assert.equal(mission.restart(), 2);
  assert.equal(mission.operation.progress, 0);
  mission.tick(.1); mission.tick(.1);
  assert(mission.operation.done);
  assert.deepEqual(read('operations'), ledger);
  const continued = make(5, true, config);
  assert.equal(continued.startWave, 2);
  continued.onWave(2);
  assert(continued.operation.done);
  continued.onEnd(true);
  assert.deepEqual(read('operations'), { ...ledger, broadcast: { evidence: true, manifest: false } });
  continued.finish();
  assert.deepEqual(read('checkpoint'), { chapter: 6 });
});

test('撤離結局依廣播回執交代送達內容，舊布林型紀錄走現場核對', t => {
  const { make, write } = fixture(t);
  for (const [broadcast, expected] of [
    [true, '車隊已把撤離資料帶到港外'],
    [{ evidence: false, manifest: false }, '收到了現場紀錄，已派人接應'],
    [{ evidence: true, manifest: true }, '收到了原始命令和六十四人的名單'],
    [{ evidence: true, manifest: false }, '收到了原始命令。救援人員正在逐一核對'],
    [{ evidence: false, manifest: true }, '收到了六十四人的名單。清除命令的原始證據仍待查證'],
  ]) {
    write('broadcast', true);
    write('operations', { broadcast });
    const mission = make(7, false, { next: null, final: true });
    mission.onEnd(true);
    mission.finish();
    assert(mission.panel.innerHTML.includes(expected));
  }
});

for (const [support, warningTime] of [
  [{}, 3.5], [{ frequency: true }, 5],
  [{ vehicleSupport: ['channel-warning', 'quiet-channel'] }, 5.5],
  [{ frequency: true, vehicleSupport: ['channel-warning', 'quiet-channel'] }, 7],
]) {
  test(`第 6 章實際砲擊依已取得的支援提前 ${warningTime} 秒警示`, t => {
    const { make, write, scene, fight } = fixture(t);
    write('choice', 'rescue');
    fight.group = 1;
    const point = Object.assign([...site], { seconds: 30 });
    const mission = make(6, false, { support, bombardment: true, waves: [{ list: [], operation: { kind: 'console', points: [point] } }] });
    mission.onWave(0);
    const warning = scene.getObjectByName('lastline-salvo-warning');
    for (let i = 0; i < 205 && !warning.visible; i++) mission.tick(.05);
    assert(warning.visible);
    let remaining = 0;
    while (warning.visible && remaining < 8) { mission.tick(.05); remaining += .05; }
    assert(Math.abs(remaining - warningTime) < .06, `${remaining} seconds`);
  });
}
