// 主角變招：輕 N 下接重擊出第 N+1 招（昇龍斬／疾風突／旋風斬／地裂斬）；閃避結束馬上輕攻擊＝迴身斬；單按重擊照舊。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, MUSOU_CHARGE, MUSOU_CHAIN, MUSOU_COUNTER, MUSOU_HEAVY } from '../2d/combat.js';

const STEP = 1 / 60;
function arena() { return new Arena({ seed: 3, warriorMode: true, musou: true, director: true }); }
function step(a, input = {}, n = 1) { const events = []; for (let i = 0; i < n; i++) { a.update(STEP, input); events.push(...a.drainEvents()); } return events; }
/** 按 lights 下輕攻擊（每下等到可接下一招），再按重擊；回傳重擊那一刻的招式 */
function chain(a, lights) {
  for (let i = 0; i < lights; i++) {
    step(a, { attack: true });
    while (a.hero.actionTime < MUSOU_CHAIN[i].cancel) step(a);
  }
  const events = step(a, { heavy: true });
  return { attack: a.attack, slash: events.find(e => e.type === 'slash') };
}

test('heavy alone is the old charge spin', () => {
  const { attack } = chain(arena(), 0);
  assert.equal(attack.duration, MUSOU_HEAVY.duration);
  assert.equal(attack.charge, 0);
});

test('1-4 lights then heavy give the four charge moves, each with its own clip and name', () => {
  for (let n = 1; n <= 4; n++) {
    const { attack, slash } = chain(arena(), n);
    assert.equal(attack.charge, n + 1);
    assert.equal(attack.clip, MUSOU_CHARGE[n - 1].clip);
    assert.equal(slash.name, MUSOU_CHARGE[n - 1].name);
  }
});

test('疾風突 dashes about 4 m forward; only its last hit counts as heavy', () => {
  const a = arena();
  const x0 = a.hero.x, y0 = a.hero.y;
  const { attack } = chain(a, 2);
  const start = { x: a.hero.x, y: a.hero.y };
  const enemy = a.spawn('grunt', start.x + Math.cos(a.hero.facing) * 200, start.y + Math.sin(a.hero.facing) * 200, { hp: 99, ai: 'external' });
  const sources = [];
  const orig = a._damageEnemy.bind(a);
  a._damageEnemy = (e, d, s, p) => { if (e === enemy) sources.push(s); return orig(e, d, s, p); };
  step(a, {}, Math.ceil(attack.duration / STEP) + 1);
  assert.ok(Math.hypot(a.hero.x - start.x, a.hero.y - start.y) > 150, 'moved forward');
  assert.ok(sources.length >= 1 && sources.at(-1) === 'heavy');
  assert.ok(x0 !== undefined && y0 !== undefined);
});

test('light attack right after a dodge is the 迴身斬 counter, then the chain carries on', () => {
  const a = arena();
  step(a, { dodge: true });
  step(a, {}, Math.ceil(0.42 / STEP) + 1);
  const events = step(a, { attack: true });
  assert.equal(a.attack.counter, true);
  assert.equal(a.attack.clip, MUSOU_COUNTER.clip);
  assert.ok(events.some(e => e.type === 'slash' && e.counter));
  while (a.hero.actionTime < MUSOU_COUNTER.cancel) step(a);
  step(a, { attack: true });
  assert.equal(a.hero.combo, 2);
  assert.equal(a.attack.counter, false);
  // 閃避很久之後再按：普通第一下
  const b = arena();
  step(b, { dodge: true });
  step(b, {}, Math.ceil(1.2 / STEP));
  step(b, { attack: true });
  assert.equal(b.attack.counter, false);
});
