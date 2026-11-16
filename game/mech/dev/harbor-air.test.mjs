import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../combat.js';
import { Mech, initMechMaterials } from '../mechs.js';
import { HarborAirBattle, HARBOR_BOSS } from '../harbor-air.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const noop = () => {};
const silent = new Proxy({}, { get: () => noop });

function fixture() {
  // The production mech needs a small CanvasTexture for the eye. Geometry and
  // motion are kept real; the test only replaces the render/audio environment.
  globalThis.document ||= { createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop: noop }), fillRect: noop,
  }) }) };
  initMechMaterials({});
  const world = { height: () => 0, support: () => 0, raycast: () => -1, collide: () => false, hitBuilding: noop, blast: noop, stomp: noop };
  const player = { pos: V(0, 32, 88), vel: V(), grounded: false, speed: 0, qbT: 0, yaw: 0, dashT: 0 };
  const hero = new Mech('hero'); hero.root.position.copy(player.pos);
  const scene = new THREE.Scene(); scene.add(hero.root);
  const combat = Object.assign(Object.create(Combat.prototype), { scene, world, player, hero, audio: silent, fx: silent, cockpit: silent, stage: 10,
    phase: 'done', events: [], enemies: [], debris: [], missiles: [], notes: [], nextId: 1, od: { gauge: 0 }, hitstop: 0,
    stats: { time: 0, hits: 0, kills: 0, score: 0, chain: 0, maxChain: 0, lastKill: -99 }, rifle: { reload: -1 },
    saber: {}, cannon: {}, msl: { locks: [] }, hurt: noop,
  });
  const battle = new HarborAirBattle({ combat, player, world });
  const tick = (seconds, until) => {
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
      combat.stats.time += dt;
      combat.updateEnemies(dt);
      battle.update();
      if (until?.()) break;
    }
  };
  const hit = (e, damage) => combat.damageEnemy(e, damage, 0, e.pos.clone(), V(0, 0, 1), true);
  return { battle, combat, player, tick, hit };
}

test('two local interceptors stay airborne when the pilot lands or is hidden, and the boss does not overlap their wave', () => {
  const { battle, combat, player, tick, hit } = fixture();
  assert.equal(battle.start(), 'interceptors');
  assert.deepEqual(combat.alive.map(e => e.airborne), [true, true]);
  assert.equal(battle.startBoss(), null);
  player.grounded = true; player.pos.y = 0; combat.hero.root.position.y = 0;
  combat.world.raycast = () => 0;
  tick(8);
  assert.ok(combat.alive.every(e => e.airborne && !e.grounded && e.pos.y > 23 && !e.los));
  hit(combat.alive[0], 1e5); assert.equal(battle.update(), 'interceptors');
  hit(combat.alive[0], 1e5); assert.equal(battle.update(), 'awaitingBoss');
  assert.equal(combat.phase, 'done');
  const boss = battle.startBoss();
  assert.equal(combat.alive.length, 1); assert.equal(boss, battle.focus); assert.equal(boss.bossName, HARBOR_BOSS);
});

test('boss changes its attack, warns before launching a single capped volley, and takes extra recovery damage', () => {
  const { battle, combat, tick, hit } = fixture();
  const e = battle.startBoss();
  let beams = 0;
  combat.fx = new Proxy({ beam: () => beams++ }, { get: (o, k) => o[k] || noop });
  tick(5, () => beams >= 1);
  assert.ok(beams > 0, 'first stage fires the charged beam');
  assert.equal(combat.missiles.length, 0);
  hit(e, 1e5);
  assert.equal(battle.update(), 'boss2'); assert.equal(e.ap, e.apMax * .55);
  tick(6, () => e.volley > 0);
  assert.equal(e.volley, 4); assert.ok(e.warn > 0 && combat.missiles.length === 0, 'warning precedes the volley');
  tick(10);
  assert.equal(combat.missiles.length, 4, 'never queue another volley while a live one remains');
  assert.ok(combat.missiles.every(m => m.target === 'player' && m.harbor && m.own === 'enemy' && m.turn > 0 && m.vel.length() > 10));
  combat.missiles.length = 0;
  tick(7, () => e.harborAir.exposed > 0);
  assert.ok(e.harborAir.exposed > 0);
  const armor = e.ap; hit(e, 1000); assert.equal(armor - e.ap, 1250);
  hit(e, 1e5); assert.equal(battle.update(), 'won');
  assert.equal(combat.missiles.length, 0); assert.equal(combat.phase, 'done');
});
