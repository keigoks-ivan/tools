import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMission } from '../lastline/mission.js';

const route = [[192, -120], [360, -120], [360, 120], [600, 120]];
const site = Object.assign([360, -120], { label: '接通車隊設施', seconds: .2 });
const waves = [{}, { operation: { kind: 'console', points: [site] } }, {}, {}];

function fixture(t) {
  const storage = new Map(), chapters = [], noop = () => {};
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
  const make = (chapter, resumeSave = false) => createMission({
    config: { chapter, next: chapter + 1, choiceAt: 1, route, waves }, resumeSave,
    scene: new THREE.Scene(), world: { height: () => 0 },
    player: { pos: new THREE.Vector3(360, 0, -120) },
    combat: () => fight, zhud: { say: noop },
    input: { reset: noop, unlock: noop, touch: { on: true }, keys: new Set(['KeyB']) },
    saveChapter: chapter => chapters.push(chapter),
  });
  const fight = { stats: { kills: 3 }, phase: 'fight', damageFx: 0, enemies: [], events: [], note: noop };
  return { make, chapters, read: key => JSON.parse(storage.get('lastline.' + key) ?? 'null') };
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
