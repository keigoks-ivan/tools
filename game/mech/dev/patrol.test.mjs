import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Patrols, arrivalPoint, updateInfantry, MAX_ACTORS } from '../zero/patrol.js';
import { Reinforcements } from '../reinforcements.mjs';
import { Solid } from '../zero/kit.js';
const v = (x = 0, z = 0) => new THREE.Vector3(x, 0, z);
function fixture() {
  const G = { enemies: [], nextId: 1, player: { pos: v() }, playerEye: v(), solid: { floorAt: () => 0, sees: () => false, pushOut: () => false } };
  const spawn = def => { const e = { pos: v(def.x, def.z), lastSeen: v(), state: def.patrol ? 'patrol' : 'idle', dead: false, hp: 150, pi: 0, wait: 2, nades: 1, ammo: 18, id: G.nextId++, s: { yaw: 0, update() {} }, update() {}, dispose() {} }; G.enemies.push(e); return e; };
  const A = { id: 'A', enemies: [{ x: 10, z: 0, alert: true, patrol: [[10, 0], [10, 10]] }] };
  const B = { id: 'B', enemies: [{ x: 250, z: 0, patrol: [[250, 10], [250, 0]] }] };
  const R = { id: 'R', after: 'A', enemies: [{ x: 15, z: 0, alert: true }] };
  const P = new Patrols(G, [A, B, R], spawn); P.reset(new Set()); return { G, P, A, B, R };
}
test('garrisons exist before objectives while plot responses remain queued', () => {
  const { G, P, A, B, R } = fixture(); G.solid.sees = () => true;
  assert.equal(P.group(A).length, 1); assert.equal(P.group(B).length, 1); assert.equal(P.group(R).length, 0);
  P.update(0, true); assert.equal(G.enemies.length, 1); assert.equal(G.enemies[0].state, 'patrol');
  for (let i = 0; i < 6; i++) P.update(.5);
  assert(P.group(B)[0].pos.z > 0); assert.equal(P.group(B)[0].actor, null);
});
test('streaming preserves damage, ammo, patrol phase and deaths across revisits and save reload', () => {
  const { G, P, A } = fixture(); P.update(0, true);
  const e = G.enemies[0]; e.hp = 70; e.ammo = 4; e.pi = 1; e.nades = 0; e.lastSeen.set(12, 0, 3);
  G.player.pos.set(300, 0, 0); P.update(.5); assert.equal(P.group(A)[0].actor, null);
  G.player.pos.set(0, 0, 0); P.update(.5); const restored = P.group(A)[0].actor;
  assert.equal(restored.hp, 70); assert.equal(restored.ammo, 4); assert.equal(restored.pi, 1); assert.equal(restored.nades, 0);
  restored.dead = true; const saved = JSON.parse(JSON.stringify(P.snapshot()));
  for (const e of G.enemies) e.dispose(); G.enemies.length = 0;
  P.reset(new Set(), saved); P.update(0, true);
  assert(P.group(A)[0].dead); assert.equal(P.group(A)[0].actor, null);
});
test('optional mission completion keeps the patrol alive; older saves clear completed combat groups', () => {
  const { P, A, B } = fixture(); A.operation = { bypass: true };
  P.reset(new Set(['A', 'B'])); assert(!P.group(A)[0].dead); assert(P.group(B)[0].dead);
});
test('distant patrol never walks through a wall or changes floor', () => {
  const { G, P, B } = fixture(); G.solid.pushOut = () => true; P.update(1);
  assert.equal(P.group(B)[0].pos.z, 0);
  G.solid.pushOut = () => false; G.solid.sees = () => true; G.solid.floorAt = () => 6; P.update(1); assert.equal(P.group(B)[0].pos.z, 0);
});
test('visible or nearby arrival is deferred without losing the queued soldier', () => {
  const { G } = fixture(); const d = { x: 0, z: 0 }; G.solid.sees = () => true;
  assert.equal(arrivalPoint(G, d), null);
  const Q = new Reinforcements(); Q.add([d], 0); assert.equal(Q.tick(1, 0, () => null), null); assert.equal(Q.pending.length, 1);
  G.solid.sees = () => false; const at = arrivalPoint(G, d); assert(at); assert(v(at.x, at.z).distanceTo(G.player.pos) >= 18);
  assert(Q.tick(2, 0, d => arrivalPoint(G, d))); assert.equal(Q.pending.length, 0);
});
test('nearby combat stays responsive while distant quiet patrol has bounded update work', () => {
  const { G } = fixture(); const calls = [0, 0, 0];
  G.enemies = [15, 55, 85].map((x, i) => ({ pos: v(x), state: 'patrol', update(dt) { calls[i]++; this.time = (this.time || 0) + dt; } }));
  for (let i = 0; i < 60; i++) updateInfantry(G, 1 / 60);
  assert.deepEqual(calls, [60, 10, 4]); for (const e of G.enemies) assert(Math.abs(e.time - 1) < 1e-6);
  G.enemies[2].state = 'combat'; updateInfantry(G, 1 / 60); assert.equal(calls[2], 5);
});

test('crowded visible garrisons stay within the render actor budget and stream gradually', () => {
  const {G,P,A}=fixture();G.solid.sees=()=>true;
  A.enemies=Array.from({length:60},(_,i)=>({x:5+i*.1,z:0}));P.reset(new Set());P.update(0,true);
  assert.equal(G.enemies.length,MAX_ACTORS);assert.equal(P.records.filter(r=>r.E===A).length,60);
  P.update(1);assert.equal(G.enemies.length,MAX_ACTORS);
});
test('old checkpoint overlap is repaired on the same floor without losing the soldier state', () => {
  const {G,P,A}=fixture();G.solid=new Solid();G.solid.add({x0:9.5,x1:10.5,y0:0,y1:1.3,z0:-1,z1:1});
  P.reset(new Set(),[{key:'A:0',p:[10,0,0],hp:70,ammo:4,pi:1,dead:false}]);const r=P.group(A)[0];
  assert(!G.solid.pushOut(r.pos.clone(),.34,r.pos.y,r.pos.y+1.7,.45));assert(r.pos.distanceTo(v(10,0))<1);assert.equal(r.pos.y,0);assert.equal(r.data.hp,70);assert.equal(r.data.ammo,4);assert.equal(r.data.pi,1);assert(!r.dead);
});
