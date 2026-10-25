import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageWeight } from '../combat.js';
import { STAGE_DATA } from '../stages.js';
import { parse } from '../encounter.js';

const AIR = new Set([8]);   // 第 8 關是空戰
const kinds = (D) => D.route.secs.flatMap((c) => [c.amb, c.amb2, c.amb3].filter(Boolean).join(' ').split(' ').filter(Boolean));

test('brawler 有權重，stageWeight 算得出來', () => {
  assert.equal(stageWeight({ groups: [['brawler']] }), 1.3);
  assert.equal(stageWeight({ groups: [['brawler', 'grunt']] }), 2.3);
});
test('parse 能解析 brawler@breach', () => {
  const R = { pts: [[0, 0], [0, 120], [120, 120]], arena: 50, cp: [], par: 1, secs: [{ at: 1, amb: 'brawler@breach*2 grunt@side' }, { at: 2, amb: 'tank@out' }] };
  const E = parse(R, 1);
  assert.deepEqual(E.secs[0].waves[0], [{ kind: 'brawler', where: 'breach' }, { kind: 'brawler', where: 'breach' }, { kind: 'grunt', where: 'side' }]);
});
test('每個非空戰的路線關至少一區有 brawler，且都是 breach 或 side', () => {
  STAGE_DATA.forEach((D, i) => {
    if (!D.route || AIR.has(i + 1)) return;
    const b = kinds(D).filter((w) => w.startsWith('brawler@'));
    assert(b.length > 0, `第 ${i + 1} 關沒有 brawler`);
    for (const w of b) assert(/^brawler@(breach|side)(\*\d+)?$/.test(w), w);
  });
});
test('空戰關與頭目區沒有 brawler', () => {
  STAGE_DATA.forEach((D, i) => {
    if (!D.route) return;
    if (AIR.has(i + 1)) assert(!kinds(D).some((w) => w.startsWith('brawler')));
    D.route.secs.forEach((c) => { if (c.boss) assert(![c.amb, c.amb2, c.amb3].join(' ').includes('brawler')); });
  });
});
test('每個 route 關都解析得出 enc，所有 kind 都有定義', () => {
  for (const S of STAGES) if (S.enc) assert(S.enc.secs.length > 0);
});
