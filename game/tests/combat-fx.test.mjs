import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  COMBO_TIERS, comboTier, crossedMilestone, hitWeight, crowdFactor, scaledCount,
  TimeScale, ComboCounter, RingIndex, QUALITY, createCombatFx,
} from '../3d-next/combat-fx.js';

test('combo tiers switch at 10 / 30 / 50 / 100 hits', () => {
  assert.deepEqual(COMBO_TIERS, [0, 10, 30, 50, 100]);
  const cases = [[0, 0], [1, 0], [9, 0], [10, 1], [29, 1], [30, 2], [49, 2], [50, 3], [99, 3], [100, 4], [999, 4]];
  for (const [count, tier] of cases) assert.equal(comboTier(count), tier, `count ${count}`);
});

test('KO milestones fire once when crossed, highest one wins', () => {
  assert.equal(crossedMilestone(48, 49), 0);
  assert.equal(crossedMilestone(49, 50), 50);
  assert.equal(crossedMilestone(50, 51), 0);
  assert.equal(crossedMilestone(98, 101), 100);
  assert.equal(crossedMilestone(40, 160), 150);   // a huge musou sweep reports the top one only
});

test('hit weight and crowd factor scale the per-hit burst', () => {
  assert.equal(hitWeight({ source: 'attack' }), 1);
  assert.equal(hitWeight({ source: 'heavy' }), 1.7);
  assert.equal(hitWeight({ source: 'special' }), 2);
  assert.ok(hitWeight({ source: 'heavy', armored: true }) < 1.7);
  assert.equal(crowdFactor(0), 1);
  for (let i = 1; i < 12; i++) assert.ok(crowdFactor(i) < crowdFactor(i - 1));
  assert.equal(scaledCount(0, 1), 0);
  assert.equal(scaledCount(7, 0.55), 4);
  assert.equal(scaledCount(1, 0.1), 1);          // never rounds a requested particle away entirely
});

test('time scale tracks hold, ease back to 1 and respect the cooldown', () => {
  const slow = new TimeScale();
  assert.equal(slow.value(), 1);
  assert.equal(slow.trigger(0.3, 0.2, { ease: 0.1 }), true);
  slow.advance(0.1);
  assert.equal(slow.value(), 0.2);
  slow.advance(0.25);                       // 0.35 s: half-way through the ease
  const easing = slow.value();
  assert.ok(easing > 0.2 && easing < 1, `easing ${easing}`);
  slow.advance(0.1);
  assert.equal(slow.value(), 1);
  // minor trigger right after is refused (cooldown), a forced one is accepted
  assert.equal(slow.trigger(0.2, 0.3), false);
  assert.equal(slow.value(), 1);
  assert.equal(slow.trigger(0.2, 0.3, { force: true }), true);
  assert.equal(slow.value(), 0.3);
  // overlapping tracks: the slowest live one wins, each keeps its own end
  slow.trigger(0.5, 0.5, { force: true });
  assert.equal(slow.value(), 0.3);
  slow.advance(0.45);
  assert.equal(slow.value(), 0.5);
  slow.advance(0.5);
  assert.equal(slow.value(), 1);
  assert.equal(slow.active(), false);
});

test('time scale sequences: freeze, then slow, then ramp; hit-stop ignores the cooldown; cancel by tag', () => {
  const ts = new TimeScale();
  ts.play([[0.05, 0], [0.3, 0.3]], { ramp: 0.3, force: true, tag: 'finisher' });
  ts.advance(0.02); assert.equal(ts.value(), 0);
  ts.advance(0.1); assert.equal(ts.value(), 0.3);
  ts.advance(0.3); const mid = ts.value(); assert.ok(mid > 0.3 && mid < 1);
  ts.advance(0.3); assert.equal(ts.value(), 1);
  assert.equal(ts.play([[0.04, 0.05]], { ramp: 0, tag: 'hitstop' }), true);
  assert.equal(ts.value(), 0.05);
  ts.advance(0.05); assert.equal(ts.value(), 1);
  ts.play([[5, 0.3]], { force: true, tag: 'leadin' });
  assert.ok(ts.has('leadin'));
  ts.cancel('leadin');
  assert.equal(ts.value(), 1);
});

test('combo counter uses a 2.5 s window', () => {
  const combo = new ComboCounter(2.5);
  assert.equal(combo.hit(0), 1);
  assert.equal(combo.hit(1), 2);
  assert.equal(combo.hit(3.4), 3);
  assert.ok(Math.abs(combo.remaining(4.65) - 0.5) < 1e-9);
  assert.equal(combo.tick(5.0), false);
  assert.equal(combo.tick(6.0), true);
  assert.equal(combo.count, 0);
  assert.equal(combo.max, 3);
  assert.equal(combo.hit(6.1), 1);
});

test('ring index reuses the oldest slot', () => {
  const ring = new RingIndex(3);
  assert.deepEqual([ring.next(), ring.next(), ring.next(), ring.next(), ring.next()], [0, 1, 2, 0, 1]);
  assert.equal(ring.wrapped, true);
});

/** Minimal skinned "heroine" + sword so ghosts, aura and the blade sampler are exercised. */
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
  return { hero, model, sword, bones, vertexCount: body.geometry.attributes.position.count + sword.geometry.attributes.position.count };
}

function makeFx(quality = 'desktop') {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  camera.position.set(0, 2.5, 4);
  camera.lookAt(0, 1, 0);
  const rig = makeHero();
  scene.add(rig.hero);
  const target = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), new THREE.MeshToonMaterial({ color: 0x333333 }));
  target.position.set(0, 0, -1.5);
  scene.add(target);
  const fx = createCombatFx({ THREE, scene, camera, hero: rig.hero, heroModel: rig.model, sword: rig.sword, quality, seed: 3 });
  return { fx, scene, camera, rig, target };
}

const at = new THREE.Vector3(0, 0, -1.5);
const EVENTS = [
  { type: 'slash', kind: 'attack', combo: 4 },
  { type: 'swing', kind: 'attack', combo: 4, index: 0, last: false, radius: 180, facing: -Math.PI / 2 },
  { type: 'hit', source: 'attack', damage: 5, hp: 10, enemyId: 1 },
  { type: 'hit', source: 'heavy', damage: 9, hp: 0, enemyId: 1 },
  { type: 'hit', source: 'special', damage: 12, hp: 3, enemyId: 1, armored: true },
  { type: 'guard', source: 'attack', enemyId: 1 },
  { type: 'guardBreak', source: 'heavy', enemyId: 1 },
  { type: 'kill', role: 'grunt', enemyId: 1 },
  { type: 'kill', role: 'officer', enemyId: 2 },
  { type: 'swing', kind: 'attack', combo: 5, index: 3, last: true, radius: 195, facing: -Math.PI / 2 },
  { type: 'swing', kind: 'heavy', combo: 5, index: 0, last: true, radius: 200, facing: -Math.PI / 2 },
  { type: 'special', radius: 280 },
  { type: 'swing', kind: 'special', index: 0, last: false, radius: 280 },
  { type: 'swing', kind: 'special', index: 2, last: true, radius: 280 },
  { type: 'dodge', facing: 0 },
  { type: 'knockback', source: 'heavy' },
  { type: 'bossSlam', radius: 180 }, { type: 'bossSweep', radius: 216 }, { type: 'roar' }, { type: 'hurt' },
  { type: 'special', radius: 320, true: true },
  { type: 'swing', kind: 'special', index: 5, last: false, radius: 280, true: true },
  { type: 'musouFinish', radius: 380, true: true },
  { type: 'jump' }, { type: 'airSlash', facing: 0, radius: 150 }, { type: 'plunge' }, { type: 'land', radius: 190 }, { type: 'land' },
];

test('an event storm stays inside the pools: no new GPU resources, bounded draws and particles', () => {
  const { fx, scene, rig, target } = makeFx('mobile');
  const children = scene.children.length;
  const actions = ['attack', 'heavy', 'special'];
  // warm-up: one of each event (the enemy flash materials are created lazily, once per source material)
  for (const event of EVENTS) fx.onEvent(event, at, target);
  fx.update(1 / 60, 1 / 60, { heroAction: 'attack' });
  const probe = () => ({ material: new THREE.Material().id, geometry: new THREE.BufferGeometry().id, texture: new THREE.Texture().id });
  const before = probe();
  for (let frame = 0; frame < 900; frame++) {
    rig.bones[1].rotation.x = Math.sin(frame * 0.3) * 1.5;   // swing the "sword" so the trail samples move
    rig.hero.updateMatrixWorld(true);
    for (let k = 0; k < 6; k++) fx.onEvent(EVENTS[(frame * 7 + k) % EVENTS.length], at, target);
    fx.update(1 / 60, (1 / 60) * fx.timeScale(), { heroAction: actions[frame % 3] });
    const stats = fx.stats();
    assert.ok(stats.particlesAlive <= stats.particleCap, 'particle cap exceeded');
    assert.ok(stats.stripSlotsUsed <= QUALITY.mobile.stripSlots, 'strip slots exceeded');
    assert.ok(stats.drawCalls <= 3 + QUALITY.mobile.ghosts + 1, `draw calls ${stats.drawCalls}`);
  }
  const after = probe();
  assert.equal(after.material - before.material, 1, 'materials were allocated during the storm');
  assert.equal(after.geometry - before.geometry, 1, 'geometries were allocated during the storm');
  assert.equal(after.texture - before.texture, 1, 'textures were allocated during the storm');
  assert.equal(scene.children.length, children, 'scene children changed');
  assert.ok(target.material.isMeshToonMaterial);
  fx.dispose();
});

test('slow motion from a finisher reaches the game through timeScale() and wears off', () => {
  const { fx, target } = makeFx();
  fx.update(1 / 60, 1 / 60, { heroAction: 'attack' });
  fx.onEvent({ type: 'swing', kind: 'attack', combo: 5, index: 3, last: true, radius: 195, facing: 0 }, at, target);
  fx.update(1 / 60, 1 / 60, { heroAction: 'attack' });
  assert.ok(fx.timeScale() < 0.5, `timeScale ${fx.timeScale()}`);
  const offset = fx.cameraOffset();
  assert.ok(offset.fov < 0, 'finisher should punch the FOV in');
  for (let i = 0; i < 90; i++) fx.update(1 / 60, 1 / 60, { heroAction: 'idle' });
  assert.equal(fx.timeScale(), 1);
  assert.ok(Math.abs(fx.cameraOffset().fov) < 1e-6);
  fx.dispose();
});

test('camera pre/post restores the exact camera state', () => {
  const { fx, camera, target } = makeFx();
  fx.onEvent({ type: 'special', radius: 280 }, at, target);
  fx.onEvent({ type: 'hit', source: 'heavy', damage: 9, hp: 1, enemyId: 1 }, at, target);
  fx.update(0.2, 0.02, { heroAction: 'special' });
  const position = camera.position.clone(), quaternion = camera.quaternion.clone(), fov = camera.fov;
  fx.cameraPre(camera, new THREE.Vector3(0, 1, 0));
  assert.ok(camera.position.distanceTo(position) > 1e-3 || camera.fov !== fov, 'musou intro should move the camera');
  fx.cameraPost(camera);
  assert.ok(camera.position.distanceTo(position) < 1e-9);
  assert.ok(Math.abs(camera.quaternion.angleTo(quaternion)) < 1e-9);
  assert.equal(camera.fov, fov);
  fx.dispose();
});

test('ghosts merge the heroine into one skinned draw each; enemy flash restores the original material', () => {
  const { fx, rig, target } = makeFx('desktop');
  const stats = fx.stats();
  assert.equal(stats.echoVertices, rig.vertexCount);
  const original = target.material;
  fx.onEvent({ type: 'slash', kind: 'heavy', combo: 1 }, at, target);
  fx.onEvent({ type: 'hit', source: 'heavy', damage: 12, hp: 4, enemyId: 1 }, at, target);
  fx.update(1 / 60, 1 / 60, { heroAction: 'heavy' });
  assert.notEqual(target.material, original, 'target should flash');
  assert.ok(fx.stats().ghostsVisible >= 1, 'heavy move should leave an afterimage');
  for (let i = 0; i < 30; i++) fx.update(1 / 60, 1 / 60, { heroAction: 'idle' });
  assert.equal(target.material, original);
  assert.equal(fx.stats().ghostsVisible, 0);
  fx.dispose();
  assert.equal(rig.sword.material.type, 'MeshToonMaterial');
});

test('landing dust fires when a tracked enemy touches down', () => {
  const { fx } = makeFx();
  fx.update(1 / 60, 1 / 60);
  const alive = () => fx.stats().particlesAlive;
  fx.trackAirborne(7, 1, 0, 1, 1.2); fx.update(1 / 60, 1 / 60);
  const airborne = alive();
  fx.trackAirborne(7, 1, 0, 1, 0); fx.update(1 / 60, 1 / 60);
  assert.ok(alive() > airborne, 'no dust on landing');
  fx.dispose();
});

test('long musou: the intro stays short, flurry swings do not stall the game, musouFinish is the big slow-mo beat', () => {
  const { fx, target } = makeFx();
  fx.update(1 / 60, 1 / 60, { heroAction: 'idle' });
  fx.onEvent({ type: 'special', radius: 320 }, at, target);
  let real = 0;
  while (fx.timeScale() < 1 && real < 2) { fx.update(1 / 60, (1 / 60) * fx.timeScale(), { heroAction: 'special' }); real += 1 / 60; }
  assert.ok(real <= 0.5, `intro held the game for ${real.toFixed(2)} s`);
  for (let i = 0; i < 10; i++) {
    fx.onEvent({ type: 'swing', kind: 'special', index: i, last: i === 9, radius: 280 }, at, target);
    for (let f = 0; f < 18; f++) {
      fx.update(1 / 60, (1 / 60) * fx.timeScale(), { heroAction: 'special' });
      assert.equal(fx.timeScale(), 1, `flurry swing ${i} slowed the game`);
    }
  }
  fx.onEvent({ type: 'musouFinish', radius: 380, true: true }, at, target);
  fx.update(1 / 60, 1 / 60, { heroAction: 'special' });
  assert.ok(fx.timeScale() < 0.2, `finisher timeScale ${fx.timeScale()}`);
  for (let i = 0; i < 4; i++) fx.update(1 / 60, (1 / 60) * fx.timeScale(), { heroAction: 'special' });
  assert.ok(fx.cameraOffset().fov <= -8, `finisher should punch the FOV hardest (${fx.cameraOffset().fov})`);
  for (let i = 0; i < 120; i++) fx.update(1 / 60, 1 / 60, { heroAction: 'idle' });
  assert.equal(fx.timeScale(), 1);
  assert.equal(fx.stats().ghostsVisible, 0, 'aura / ghosts should be gone after the special');
  fx.dispose();
});

test('plunge landing slams, a plain landing only puffs dust', () => {
  const { fx } = makeFx();
  fx.update(1 / 60, 1 / 60);
  fx.onEvent({ type: 'land' }, at);
  fx.update(1 / 60, 1 / 60);
  assert.equal(fx.timeScale(), 1);
  const plainStrips = fx.stats().stripSlotsUsed;
  fx.onEvent({ type: 'plunge' }, at);
  fx.update(1 / 60, 1 / 60, { heroAction: 'plunge' });
  fx.onEvent({ type: 'land', radius: 190 }, at);
  fx.update(1 / 60, 1 / 60, { heroAction: 'idle' });
  assert.ok(fx.timeScale() < 1, 'plunge landing should hit-stop the world briefly');
  assert.ok(fx.stats().stripSlotsUsed >= plainStrips + 4, 'crack, scorch and shock rings expected');
  fx.dispose();
});

test('beat sheet: activation freeze, calm flurry with 0.04 s hit-stops, 0.3x lead-in, impact freeze then ramp', () => {
  const { fx, target } = makeFx();
  const frame = (heroAction = 'special') => fx.update(1 / 60, (1 / 60) * fx.timeScale(), { heroAction });
  fx.update(1 / 60, 1 / 60);
  fx.onEvent({ type: 'musouStart', timeline: { windup: 0.55, finish: 3.6, end: 4.2 } }, at, target);
  assert.equal(fx.timeScale(), 0, 'activation is a hard freeze');
  let game = 0, real = 0, swing = 0, stops = 0, minFlurryScale = 1;
  while (game < 3.6 && real < 8) {
    if (game >= 0.55 + swing * 0.28 && swing < 10) {
      fx.onEvent({ type: 'swing', kind: 'special', index: swing, radius: 280 }, at, target);
      for (let k = 0; k < 3; k++) fx.onEvent({ type: 'hit', source: 'special', damage: 8, hp: 5, enemyId: 1 }, at, target), fx.onEvent({ type: 'hitstop', duration: 0.06 }, at);
      swing++;
    }
    const scale = fx.timeScale();
    if (game > 0.6 && game < 3.4) {
      minFlurryScale = Math.min(minFlurryScale, scale);
      if (scale < 0.1) stops++;
      assert.equal(fx.cameraOffset().shake, 0, 'no camera shake during the flurry');
    }
    game += (1 / 60) * scale; real += 1 / 60;
    frame();
  }
  assert.ok(stops > 0 && stops <= 10 * 3, `hit-stop frames ${stops}`);   // ~0.04 s (2-3 frames) per swing, not per hit
  assert.ok(fx.timeScale() <= 0.31, `lead-in scale ${fx.timeScale()}`);
  fx.onEvent({ type: 'musouFinish', radius: 320 }, at, target);
  assert.equal(fx.timeScale(), 0, 'impact freeze-frame');
  for (let i = 0; i < 6; i++) frame();
  assert.ok(Math.abs(fx.timeScale() - 0.3) < 1e-9, `post-impact ${fx.timeScale()}`);
  for (let i = 0; i < 60; i++) frame('idle');
  assert.equal(fx.timeScale(), 1);
  fx.dispose();
});

test('officer killing blow: 0.2x for ~0.8 s, back to 1 within ~0.15 s after', () => {
  const { fx, target } = makeFx();
  fx.update(1 / 60, 1 / 60);
  fx.onEvent({ type: 'officer', enemyId: 9, name: '赤角' }, at);
  fx.onEvent({ type: 'kill', role: 'officer', enemyId: 9 }, at, target);
  fx.update(1 / 60, 1 / 60);
  assert.equal(fx.timeScale(), 0.2);
  for (let i = 0; i < 44; i++) fx.update(1 / 60, 1 / 60);   // ~0.75 s
  assert.equal(fx.timeScale(), 0.2);
  for (let i = 0; i < 15; i++) fx.update(1 / 60, 1 / 60);   // +0.25 s
  assert.equal(fx.timeScale(), 1);
  assert.ok(fx.cameraOffset().dolly < 1, 'camera still easing back from the push-in');
  fx.dispose();
});

test('authored musou timing (Arena musouStart.timeScale + musouFreeze) is followed, not doubled', async () => {
  const combat = await import('../2d/combat.js');
  const profile = combat.MUSOU_FLURRY?.standard ?? {
    duration: 4.2, swingStart: 0.55, impact: 3.6, timeScale: [[0, 1], [3.51, 1], [3.51, 0.3], [3.69, 0.3], [4.2, 1]],
    freezes: [{ at: 0, real: 0.08 }, { at: 3.6, real: 0.05 }],
  };
  const { fx, target } = makeFx();
  fx.update(1 / 60, 1 / 60);
  fx.onEvent({ type: 'special', flurry: true, duration: profile.duration, finishAt: profile.impact }, at, target);
  fx.onEvent({ type: 'musouStart', duration: profile.duration, impact: profile.impact, swings: [profile.swingStart], timeScale: profile.timeScale, freezes: profile.freezes }, at, target);
  fx.onEvent({ type: 'musouFreeze', real: profile.freezes[0].real, at: 0 }, at);
  assert.equal(fx.timeScale(), 0);
  let game = 0, minScale = 1;
  const frame = () => { const scale = fx.timeScale(); const dt = (1 / 60) * scale; game += dt; fx.update(1 / 60, dt, { heroAction: 'special' }); return scale; };
  for (let i = 0; i < 10; i++) frame();
  assert.equal(fx.timeScale(), 1, 'after the activation freeze the flurry runs at 1x');
  while (game < profile.impact - 0.02) minScale = Math.min(minScale, frame());
  assert.ok(Math.abs(fx.timeScale() - 0.3) < 1e-6, `authored lead-in ${fx.timeScale()}`);
  assert.ok(minScale >= 0.3 - 1e-6, `fx must not stack its own slow-mo on the authored curve (${minScale})`);
  fx.onEvent({ type: 'musouFinish', radius: 320 }, at, target);
  fx.onEvent({ type: 'musouFreeze', real: 0.05, at: profile.impact }, at);
  assert.equal(fx.timeScale(), 0);
  for (let i = 0; i < 4; i++) frame();
  assert.ok(Math.abs(fx.timeScale() - 0.3) < 1e-6);
  let guard = 0;
  while (game < profile.duration + 0.05 && guard++ < 600) frame();
  fx.onEvent({ type: 'musouEnd' }, at);
  for (let i = 0; i < 40; i++) frame();
  assert.equal(fx.timeScale(), 1);
  fx.dispose();
});

test("timing: 'game' leaves time scaling to the caller", () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), hero = new THREE.Group();
  const fx = createCombatFx({ THREE, scene, camera, hero, timing: 'game' });
  fx.onEvent({ type: 'hitstop', duration: 0.06 }, at);
  fx.onEvent({ type: 'swing', kind: 'attack', combo: 5, index: 3, last: true, radius: 195, facing: 0 }, at);
  fx.onEvent({ type: 'kill', role: 'officer', enemyId: 3 }, at);
  fx.update(1 / 60, 1 / 60);
  assert.equal(fx.timeScale(), 1);
  fx.dispose();
});
