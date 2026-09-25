import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Arena, MUSOU_FLURRY } from '../2d/combat.js';
import { createCombatFx, koGrade, swingHitstop, QUALITY } from '../3d-next/combat-fx.js';

const STEP = 1 / 60;

// ---------------------------------------------------------------------------------------------
// 1a. Spin fix: freezing the camera-yaw basis used for camera-relative input during the musou breaks the
// hero-facing <-> camera-yaw feedback loop described in battle.js (syncCamera / the frame() input transform).
// This mirrors that small piece of battle.js math directly (battle.js itself cannot be imported standalone: it
// touches `location`/`document` at module scope) against the real Arena flurry simulation.
// ---------------------------------------------------------------------------------------------

const yawFromFacing = facing => Math.PI / 2 - facing;
const turnToward = (from, to, rate) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * rate;

function simulateHeldDirection({ lockDuringMusou }) {
  const arena = new Arena({
    seed: 5, warriorMode: true, musou: true, director: true, jump: true, musouFlurry: true,
    bounds: { minX: -4000, maxX: 4000, minY: -4000, maxY: 4000 },
  });
  arena.drainEvents();
  arena.hero.energy = 100;
  let cameraYaw = Math.PI, musouYawLock = null, started = false;
  let baseFacing = null, maxDelta = 0;
  const total = MUSOU_FLURRY.standard.duration + 0.5;
  for (let t = 0; t < total; t += STEP) {
    const inMusou = !!(arena.attack?.flurry && arena.hero.action === 'special');
    if (inMusou && baseFacing === null) baseFacing = arena.hero.facing;   // facing right as the flurry takes over
    const yawBasis = lockDuringMusou ? (musouYawLock ?? cameraYaw) : cameraYaw;
    if (lockDuringMusou) musouYawLock = inMusou ? (musouYawLock ?? cameraYaw) : null;
    const fx = Math.sin(yawBasis), fz = Math.cos(yawBasis);
    // player holds a single fixed physical direction the whole time (inputX = 1, inputY = 0)
    const moveX = fx * -0 + -fz * 1, moveZ = fz * -0 + fx * 1;
    const input = { x: moveX, y: moveZ };
    if (!started) { input.special = true; started = true; }
    arena.update(STEP, input);
    arena.drainEvents();
    if (!(lockDuringMusou && inMusou)) {
      cameraYaw = turnToward(cameraYaw, yawFromFacing(arena.hero.facing), Math.min(1, STEP * 1.6));
    }
    // only the spin *during* the musou is the bug being fixed; ordinary camera-relative steering resumes
    // (and legitimately turns the hero) once control returns to the player.
    if (inMusou && baseFacing !== null) {
      const wrapped = ((arena.hero.facing - baseFacing + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      maxDelta = Math.max(maxDelta, Math.abs(wrapped));
    }
  }
  return maxDelta * 180 / Math.PI;
}

test('musou camera-yaw lock stops the hero spinning while a direction is held through the whole flurry', () => {
  const locked = simulateHeldDirection({ lockDuringMusou: true });
  const unlocked = simulateHeldDirection({ lockDuringMusou: false });
  assert.ok(locked < 45, `locked facing drift ${locked.toFixed(1)}°`);
  assert.ok(unlocked > locked + 20, `unlocked (${unlocked.toFixed(1)}°) should drift far more than locked (${locked.toFixed(1)}°)`);
});

// ---------------------------------------------------------------------------------------------
// leapAt / sweeps: opt-in MUSOU_FLURRY fields, only surfaced through musouStart / swing events; the 2.5D game
// and any Arena without musouFlurry must never see them.
// ---------------------------------------------------------------------------------------------

function arena3d(options = {}) {
  const arena = new Arena({
    seed: 9, warriorMode: true, musou: true, director: true, jump: true, musouFlurry: true,
    bounds: { minX: -2000, maxX: 4000, minY: -2000, maxY: 3000 }, ...options,
  });
  arena.drainEvents();
  return arena;
}
function run(arena, seconds, input = {}) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += STEP) { arena.update(STEP, input); events.push(...arena.drainEvents()); }
  return events;
}

test('musouStart carries leapAt/sweeps (opt-in) and the named swings are flagged sweep:true', () => {
  for (const [isTrueHp, F] of [[100, MUSOU_FLURRY.standard], [30, MUSOU_FLURRY.true]]) {
    const arena = arena3d();
    arena.hero.energy = 100;
    arena.hero.hp = isTrueHp;
    const events = run(arena, F.duration + 0.1, { special: true });
    const start = events.find(event => event.type === 'musouStart');
    assert.equal(start.leapAt, F.leapAt);
    assert.deepEqual(start.sweeps, F.sweeps);
    const swings = events.filter(event => event.type === 'swing' && event.flurry);
    assert.equal(swings.length, F.swings);
    for (const swing of swings) assert.equal(swing.sweep, F.sweeps.includes(swing.index + 1), `swing ${swing.index + 1} sweep flag`);
    assert.equal(swings.filter(event => event.sweep).length, F.sweeps.length);
  }
});

test('a plain musou special (no musouFlurry) never emits musouStart, leapAt or sweeps', () => {
  const arena = new Arena({ seed: 1, warriorMode: true, musou: true, director: true });   // musouFlurry: false
  arena.hero.energy = 100;
  const events = run(arena, 2.2, { special: true });
  assert.equal(events.some(event => event.type === 'musouStart'), false);
  const special = events.find(event => event.type === 'special');
  assert.ok(special);
  assert.equal('leapAt' in special, false);
  assert.equal(events.some(event => 'sweep' in event), false);
});

test('the 2.5D game (default Arena) has no musouFlurry state at all', () => {
  const arena = new Arena({ seed: 17, warriorMode: true });   // game/2d/main.js's exact construction
  assert.equal(arena.musouFlurry, false);
  arena.hero.energy = 999;
  const events = run(arena, 1.5, { special: true });
  assert.equal(events.some(event => event.type === 'musouStart'), false);
});

// ---------------------------------------------------------------------------------------------
// Pure helpers: KO grade stamp and the data-driven, accelerating hit-stop schedule.
// ---------------------------------------------------------------------------------------------

test('koGrade: 撃/斬/破/天 thresholds, highest one at or below the count wins', () => {
  assert.equal(koGrade(0), '撃');
  assert.equal(koGrade(5), '撃');
  assert.equal(koGrade(6), '斬');
  assert.equal(koGrade(11), '斬');
  assert.equal(koGrade(12), '破');
  assert.equal(koGrade(19), '破');
  assert.equal(koGrade(20), '天');
  assert.equal(koGrade(999), '天');
});

test('swingHitstop starts longer and shortens toward the last swing', () => {
  const first = swingHitstop(0, 10), last = swingHitstop(9, 10);
  assert.ok(first > last, `first ${first} should be longer than last ${last}`);
  assert.ok(first <= 0.06 && last >= 0.02, 'stays inside a sane hit-stop range');
  let prev = Infinity;
  for (let i = 0; i < 10; i++) { const v = swingHitstop(i, 10); assert.ok(v <= prev + 1e-9, `swing ${i} did not shorten monotonically`); prev = v; }
});

// ---------------------------------------------------------------------------------------------
// combat-fx rig shared by the draw-budget / allocation / occlusion tests below.
// ---------------------------------------------------------------------------------------------

function makeHero() {
  const bones = [new THREE.Bone(), new THREE.Bone()];
  bones[0].name = 'Hips'; bones[1].name = 'J_Bip_R_Hand';
  bones[1].position.y = 1;
  bones[0].add(bones[1]);
  const skinned = (geometry, name) => {
    const count = geometry.attributes.position.count;
    const index = new Uint16Array(count * 4), weight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { index[i * 4] = geometry.attributes.position.getY(i) > 0.5 ? 1 : 0; weight[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshToonMaterial({ color: 0x8866ff }));
    mesh.name = name;
    return mesh;
  };
  const model = new THREE.Group();
  const body = skinned(new THREE.BoxGeometry(0.4, 1.6, 0.3, 1, 4, 1).translate(0, 0.8, 0), 'Body');
  const sword = skinned(new THREE.BoxGeometry(0.05, 0.05, 1.0).translate(0, 1, 0.6), 'Hero_sword');
  model.add(bones[0], body, sword);
  const skeleton = new THREE.Skeleton(bones);
  model.updateMatrixWorld(true);
  body.bind(skeleton); sword.bind(skeleton);
  const hero = new THREE.Group();
  hero.add(model);
  return { hero, model, sword };
}
function fakeRenderer() {
  return { compile() {}, domElement: { width: 1280, height: 720 }, copyFramebufferToTexture() {} };
}
function makeFx(quality = 'desktop') {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 2.5, 4);
  camera.lookAt(0, 1, 0);
  const rig = makeHero();
  scene.add(rig.hero);
  const target = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  target.position.set(0, 0, -1.5);
  scene.add(target);
  const renderer = fakeRenderer();
  const fx = createCombatFx({ THREE, scene, camera, renderer, hero: rig.hero, heroModel: rig.model, sword: rig.sword, quality, seed: 5 });
  return { fx, scene, camera, rig, target, renderer };
}

const at = new THREE.Vector3(0, 0, -1.5);

/** Drives one full 天刃 long-form musou (real MUSOU_FLURRY timing, sweeps and leapAt) through combat-fx, calling
 * cameraPre/cameraPost every step (like battle.js) so the post-cleave screen split actually captures. Returns the
 * highest fx.stats() seen from the finisher through a short recovery window. */
function runLongMusou(fx, camera, target, { isTrue = false, enemies } = {}) {
  const F = isTrue ? MUSOU_FLURRY.true : MUSOU_FLURRY.standard;
  const every = (F.swingEnd - F.swingStart) / (F.swings - 1);
  const swingTimes = Array.from({ length: F.swings }, (_, i) => F.swingStart + i * every);
  fx.onEvent({
    type: 'musouStart', true: isTrue, duration: F.duration, radius: F.radius, finishRadius: F.finishRadius,
    swings: swingTimes, impact: F.impact, timeScale: F.timeScale, freezes: F.freezes, leapAt: F.leapAt, sweeps: F.sweeps, facing: 0,
  }, at, target);
  const frame = () => { fx.update(STEP, STEP * fx.timeScale(), { heroAction: 'special', enemies }); fx.cameraPre(camera); fx.cameraPost(camera); };
  let game = 0, swing = 0, guard = 0;
  while (game < F.impact - 1e-6 && guard++ < 3000) {
    if (swing < F.swings && game >= swingTimes[swing] - 1e-9) {
      fx.onEvent({ type: 'swing', kind: 'special', index: swing, last: swing === F.swings - 1, radius: F.radius, true: isTrue, sweep: F.sweeps.includes(swing + 1) }, at, target);
      fx.onEvent({ type: 'hitstop', duration: 0.06 }, at);
      swing++;
    }
    game += STEP * fx.timeScale();
    frame();
  }
  fx.onEvent({ type: 'musouFinish', radius: F.finishRadius, true: isTrue }, at, target);
  frame();
  let peak = fx.stats();
  for (let i = 0; i < 20; i++) { frame(); const s = fx.stats(); if (s.drawCalls > peak.drawCalls) peak = s; }
  return peak;
}

// ---------------------------------------------------------------------------------------------
// Draw-call budget at the 天刃 finale's peak, both quality tiers.
// ---------------------------------------------------------------------------------------------

for (const quality of ['desktop', 'mobile']) {
  test(`天刃 finale draw-call budget at peak (${quality})`, () => {
    const { fx, camera, target } = makeFx(quality);
    const base = 2 + 1 + QUALITY[quality].ghosts + 1;   // 2 particle pools + 1 strip batch + ghosts + aura
    const peak = runLongMusou(fx, camera, target, { isTrue: true });
    assert.ok(peak.cinematicDraws <= 4, `cinematic draws ${peak.cinematicDraws} exceed the +4 budget`);
    assert.ok(peak.drawCalls <= base + 4, `peak draws ${peak.drawCalls} exceed ${base + 4} (${quality})`);
    fx.dispose();
  });
}

// ---------------------------------------------------------------------------------------------
// Pool bounds: a full 真・無雙 天刃 run (10-12 swings incl. 3 sweeps, leap, cleave, split, shockwave) must not
// allocate any new GPU resource once its pooled meshes/materials/texture already exist (created once, reused).
// ---------------------------------------------------------------------------------------------

test('天刃 event storm allocates nothing on a second run: materials/geometries/textures stay bounded', () => {
  const { fx, camera, target, scene } = makeFx('desktop');
  const enemyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x664488 }));
  enemyMesh.position.set(0, 1, 2);   // roughly between the camera (0,2.5,4) and the hero chest (0,1.02,0)
  scene.add(enemyMesh);
  const enemies = new Map([[1, { root: enemyMesh }]]);
  // warm-up: creates every pooled clone once (enemy flash, occlusion dither, split framebuffer texture)
  runLongMusou(fx, camera, target, { isTrue: true, enemies });
  for (let i = 0; i < 60; i++) { fx.update(STEP, STEP, { heroAction: 'idle', enemies }); fx.cameraPre(camera); fx.cameraPost(camera); }
  fx.reset();
  const probe = () => ({ material: new THREE.Material().id, geometry: new THREE.BufferGeometry().id, texture: new THREE.Texture().id });
  const before = probe();
  runLongMusou(fx, camera, target, { isTrue: true, enemies });
  for (let i = 0; i < 60; i++) { fx.update(STEP, STEP, { heroAction: 'idle', enemies }); fx.cameraPre(camera); fx.cameraPost(camera); }
  const after = probe();
  assert.equal(after.material - before.material, 1, `materials allocated during the second run: ${after.material - before.material - 1}`);
  assert.equal(after.geometry - before.geometry, 1, `geometries allocated during the second run: ${after.geometry - before.geometry - 1}`);
  assert.equal(after.texture - before.texture, 1, `textures allocated during the second run: ${after.texture - before.texture - 1}`);
  fx.dispose();
});

// ---------------------------------------------------------------------------------------------
// Enemy occlusion (dither-fade between camera and hero during any musou; not just the long-form finale).
// ---------------------------------------------------------------------------------------------

test('enemy occlusion: dither-fades an enemy between the camera and the hero during a musou, restores after', () => {
  const { fx, scene, target } = makeFx('desktop');
  const enemy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x664488 }));
  enemy.position.set(0, 1.3, 2);   // sits on the camera(0,2.5,4) -> hero-chest(0,1.02,0) line, well inside it
  scene.add(enemy);
  const enemies = new Map([[1, { root: enemy }]]);
  const original = enemy.material;
  fx.update(STEP, STEP, { heroAction: 'idle', enemies });
  assert.equal(enemy.material, original, 'no musou yet: left untouched');
  fx.onEvent({ type: 'special', radius: 280 }, at, target);   // short-form special: occlusion still applies
  for (let i = 0; i < 30; i++) fx.update(STEP, STEP, { heroAction: 'special', enemies });
  assert.notEqual(enemy.material, original, 'occluded while the musou is active');
  assert.equal(enemy.material.alphaHash, true);
  assert.ok(enemy.material.opacity < 1 && enemy.material.opacity > 0, 'dithered, not fully invisible');
  for (let i = 0; i < 150; i++) fx.update(STEP, STEP, { heroAction: 'idle', enemies });
  assert.equal(enemy.material, original, 'restored once the musou (and its fade-out) has ended');
  fx.dispose();
});

// ---------------------------------------------------------------------------------------------
// The real Arena emits 'special' first and 'musouStart' right after. combat-fx starts the musou on the first one,
// so leapAt (only on musouStart) must be merged in — otherwise the leap camera cut never runs in the real game.
// ---------------------------------------------------------------------------------------------

test('real Arena event order (special → musouStart) still gives combat-fx the leapAt and reaches the leap cut', () => {
  const { fx } = makeFx('desktop');
  const arena = new Arena({
    seed: 5, warriorMode: true, musou: true, director: true, jump: true, musouFlurry: true,
    bounds: { minX: -4000, maxX: 4000, minY: -4000, maxY: 4000 },
  });
  arena.drainEvents();
  arena.hero.energy = 100;
  let sawLeapCut = false, first = true;
  for (let t = 0; t < MUSOU_FLURRY.standard.duration; t += STEP) {
    arena.update(STEP * fx.timeScale(), first ? { special: true } : {});
    first = false;
    for (const event of arena.drainEvents()) fx.onEvent(event, at);
    fx.update(STEP, STEP * fx.timeScale(), { heroAction: arena.hero.action });
    if (fx.debugMusou().cut === 'leap') sawLeapCut = true;
  }
  assert.equal(fx.debugMusou().leapAt ?? MUSOU_FLURRY.standard.leapAt, MUSOU_FLURRY.standard.leapAt);
  assert.ok(sawLeapCut, 'the leap camera cut never engaged with the real Arena event order');
  fx.dispose();
});
