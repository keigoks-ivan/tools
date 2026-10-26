import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, P, WEIGHT } from '../player.js';
import { MechMotion, HEAVY } from '../anim.js';

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

function rig(heavy, stance = false) {
  const root = new THREE.Group(), bones = {};
  const bone = (name, parent, x, y, z = 0) => { const o = bones[name] = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const pelvis = bone('pelvis', root, 0, 9.75), torso = bone('torso', pelvis, 0, 0.7);
  bone('head', torso, 0, 5.15, 0.55);
  for (const [n, s] of [['R', -1], ['L', 1]]) {
    const hip = bone('hip' + n, pelvis, s * 1.55, -0.55), knee = bone('knee' + n, hip, 0, -4.15, 0.15);
    bone('ankle' + n, knee, 0, -3.75, -0.1);
    const sh = bone('shoulder' + n, torso, s * 3.4, 3.95, 0.05); sh.rotation.order = 'YXZ';
    bone('elbow' + n, sh, 0, -2.9);
  }
  torso.rotation.order = 'YXZ';
  const m = { root, bones, L: { pelvis: 9.75 }, schemeKey: 'grunt', scale: 1, pose: { boost: 0, air: 0 }, land: 0, landV: 0, legYaw: 0, recoil: 0, swing: 0, thrust: 0, flames: [] };
  if (stance) m.stance = { w: 1.3, toe: 0.1, fwd: 0.4, bend: 0.2, chest: 0.05, knee: 0.05 };
  if (heavy !== undefined) m.heavy = heavy;
  m.motion = new MechMotion(m); return m;
}
const st = (o = {}) => ({ vel: new THREE.Vector3(), grounded: true, boost: 0, torsoYaw: 0, aim: null, ...o });
function tick(m, s, dt = 1 / 60) { m.root.position.addScaledVector(s.vel, dt); m.motion.update(dt, s); m.root.updateMatrixWorld(true); }

test('機身轉向（anim.js）：預設不限速；重量模式限速、落後不超過上限、差角由軀幹補回', () => {
  const W = HEAVY, dt = 1 / 60, run = (heavy) => {
    const m = rig(heavy), out = [];
    for (let i = 0; i < 90; i++) { tick(m, st({ torsoYaw: 2.5 }), dt); out.push([m.legYaw, m.bones.torso.rotation.y]); }
    return out;
  };
  const maxRate = (o) => Math.max(...o.map((r, i) => i ? Math.abs(r[0] - o[i - 1][0]) * 60 : 0));
  const off = run(undefined), hv = run(true);
  assert.ok(maxRate(off) > W.turnMax * 2 + 0.2, `預設應快於限速 ${maxRate(off)}`);
  assert.ok(maxRate(hv) <= W.turnMax * 2 + 1e-6, `重量模式轉速 ${maxRate(hv)}`);
  assert.ok(hv.some((r) => Math.abs(r[1]) > W.turnLag * 0.5), '轉大角度時有扭腰量');
  assert.deepEqual(run(false), off);
  // 瞄準方向（腿＋軀幹）最後仍對準
  const m = rig(true); for (let i = 0; i < 400; i++) tick(m, st({ torsoYaw: 2.5 }), dt);
  assert.ok(Math.abs(m.legYaw + m.bones.torso.rotation.y - 2.5) < 0.05 && Math.abs(m.legYaw - 2.5) < 0.05);
});

test('重量步伐：預設骨盆軌跡不變；開啟後落腳更沉、落地期加長、上身有晃動', () => {
  for (const stance of [false, true]) {
    const trace = (heavy) => {
      const m = rig(heavy, stance), s = st({ vel: new THREE.Vector3(0, 0, 8) }), y = [], r = [];
      for (let i = 0; i < 480; i++) { tick(m, s); if (i > 120) { y.push(m.bones.pelvis.position.y); r.push(m.bones.torso.rotation.z); } }
      return { y, r, m };
    };
    const a = trace(undefined), b = trace(false), h = trace(true);
    assert.deepEqual(a.y, b.y);
    const span = (v) => Math.max(...v) - Math.min(...v);
    assert.ok(span(h.y) > span(a.y) * 1.05, `骨盆起伏 ${span(h.y)} > ${span(a.y)}`);
    assert.ok(span(h.y) < 1.2, `幅度克制 ${span(h.y)}`);
    assert.ok(span(h.r) >= span(a.r), '上身側傾不小於預設');
    assert.ok(Math.abs(h.m.stepCount - a.m.stepCount) <= 2, `步頻不變 ${h.m.stepCount} vs ${a.m.stepCount}`);
  }
});

test('落地硬直：重落地比舊版更明確、輕落地不鎖', () => {
  const drop = (heavy, vy) => { const p = new Player(mech(), world, {}, { heavy }); p.grounded = false; p.pos.y = 0.1; p.vel.y = vy; p.update(1 / 60, idle); return p.lockMove; };
  assert.equal(drop(false, -30), 0.28); assert.ok(drop(true, -30) > 0.28);
  assert.ok(drop(true, -30) <= WEIGHT.lockMax); assert.ok(drop(true, -10) <= 0);
});
