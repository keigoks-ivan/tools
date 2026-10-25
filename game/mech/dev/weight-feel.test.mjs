import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, P, WEIGHT, BodyTurn } from '../player.js';

const world = {
  height: () => 0, support: () => 0, collide: () => false, stomp() {}, raycast: () => -1,
};
const mech = () => ({ root: new THREE.Group(), legYaw: 0 });
const idle = { mx: 0, my: 0, lookX: 0, lookY: 0, boost: false, qb: false, jump: false, hover: false, descend: false, flight: false, flightBlocked: false };
function run(opts, seq, dt = 1 / 60) {
  const p = new Player(mech(), world, {}, opts), out = [];
  for (const [n, inp] of seq) for (let i = 0; i < n; i++) { p.update(dt, { ...idle, ...inp }); out.push([p.vel.x, p.vel.z, p.pos.x, p.pos.z, p.lockMove]); }
  return { p, out };
}
const seq = [[40, { my: 1 }], [60, { my: 1, boost: true }], [5, { qb: true, my: 1 }], [60, {}], [20, { mx: 1 }]];

test('預設（不傳 heavy）與舊版參數化結果一致：到全速時間為舊的 rate 30／60', () => {
  const a = run(undefined, seq), b = run({}, seq);
  assert.deepEqual(a.out, b.out);
  const t = run(undefined, [[60, { my: 1 }]]).out.findIndex((o) => Math.abs(o[1] - P.walk) < 1e-6);
  assert.ok(Math.abs((t + 1) / 60 - P.walk / 30) < 0.03, `舊版走路到全速 ${t}`);
});

test('重量模式：走路／衝刺到全速時間落在設定值，停下有滑行', () => {
  const dt = 1 / 120;
  let r = run({ heavy: true }, [[240, { my: 1 }]], dt);
  let i = r.out.findIndex((o) => o[1] >= P.walk - 1e-6);
  assert.ok(Math.abs((i + 1) * dt - WEIGHT.walkT) < 0.03, `walk ${i * dt}`);
  r = run({ heavy: true }, [[240, { my: 1, boost: true }]], dt);
  i = r.out.findIndex((o) => o[1] >= P.boost - 1e-6);
  assert.ok(Math.abs((i + 1) * dt - WEIGHT.boostT) < 0.05, `boost ${i * dt}`);
  const old = run(undefined, [[120, { my: 1 }], [12, {}]]).out.at(-1)[1];
  const hv = run({ heavy: true }, [[120, { my: 1 }], [12, {}]]).out.at(-1)[1];
  assert.ok(hv > old, `停下滑行 重 ${hv} > 舊 ${old}`);
});

test('快速閃避：兩種模式速度一致', () => {
  const a = run(undefined, [[30, { my: 1 }], [1, { qb: true, my: 1 }], [10, { my: 1 }]]).out;
  const b = run({ heavy: true }, [[30, { my: 1 }], [1, { qb: true, my: 1 }], [10, { my: 1 }]]).out;
  assert.ok(Math.abs(a[30][1] - P.qb) < 1e-6 && Math.abs(b[30][1] - P.qb) < 1e-6);
  assert.ok(Math.abs(a[39][1] - b[39][1]) < 1.5);   // 閃避期間 rate=0，之後同樣的超速收斂規則
});

test('瞄準（yaw）不受重量模式影響', () => {
  const a = run(undefined, [[30, { lookX: -0.05 }]]).p.yaw, b = run({ heavy: true }, [[30, { lookX: -0.05 }]]).p.yaw;
  assert.equal(a, b);
});

test('機身轉向：限速、落後不超過 turnLag，差角由軀幹補回', () => {
  const bt = new BodyTurn(); bt.step(0, 0.016);
  let want = 0, prev = 0, maxV = 0;
  for (let i = 0; i < 120; i++) {
    want = 2.5; const r = bt.step(want, 1 / 60);
    maxV = Math.max(maxV, Math.abs(r.yaw - prev) * 60); prev = r.yaw;
    assert.ok(Math.abs(r.twist) <= 2.5);
    assert.ok(Math.abs(r.yaw + r.twist - want) < 1e-9);
    if (i === 10) assert.ok(Math.abs(r.twist) > WEIGHT.turnLag * 0.5, '轉大角度時有扭腰量');
  }
  assert.ok(maxV <= WEIGHT.turnMax * 3 + 1e-6, `最大轉速 ${maxV}`);
  assert.ok(Math.abs(prev - 2.5) < 0.05, '最後仍會跟上');
});

test('落地硬直：重落地比舊版更明確、輕落地不鎖', () => {
  const drop = (heavy, vy) => { const p = new Player(mech(), world, {}, { heavy }); p.grounded = false; p.pos.y = 0.1; p.vel.y = vy; p.update(1 / 60, idle); return p.lockMove; };
  assert.equal(drop(false, -30), 0.28); assert.ok(drop(true, -30) > 0.28);
  assert.ok(drop(true, -30) <= WEIGHT.lockMax); assert.ok(drop(true, -10) <= 0);
});
