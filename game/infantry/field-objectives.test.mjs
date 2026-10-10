import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid, SURFACES } from '../mech/zero/kit.js';
import { SCENARIOS } from './scenarios.mjs';
import { Navigation } from './navigation.mjs';
import { buildBattlefield } from './map.js';
import { FIELD_OBJECTIVES, chooseFieldSite, FieldTask } from './field-objectives.mjs';
import { buildFieldObjective } from './field-objectives.js';

const modes = ['defend', 'assault'], kinds = ['intel', 'cache', 'relay'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const materials = () => Object.fromEntries([...SURFACES, 'rock', 'asphalt', 'grass'].map(key => [key, new THREE.MeshStandardMaterial({ vertexColors: true })]));
function fixture(scenario) {
  const scene = new THREE.Scene(), surfaces = materials(), map = buildBattlefield(scene, surfaces, scenario);
  return { scene, map, surfaces, dispose() { map.dispose(); for (const material of Object.values(surfaces)) material.dispose(); } };
}
function unblocked(map, p, radius = .34, step = .48) {
  const origin = new THREE.Vector3(p.x, p.y, p.z), probe = origin.clone();
  map.solid.pushOut(probe, radius, origin.y, origin.y + 1.46, step);
  assert(probe.distanceTo(origin) < 1e-6, `physical collider at ${p.x}, ${p.z}`);
}
function walkable(map, from, path) {
  let previous = from;
  for (const next of path) {
    const steps = Math.max(1, Math.ceil(distance(previous, next) / .18));
    for (let step = 0; step <= steps; step++) {
      const ratio = step / steps, x = previous.x + (next.x - previous.x) * ratio, z = previous.z + (next.z - previous.z) * ratio;
      unblocked(map, { x, z, y: map.ground(x, z) });
    }
    previous = next;
  }
}

test('all seven scenes describe the three optional tasks and their actual bilingual rewards', () => {
  assert.deepEqual(Object.keys(FIELD_OBJECTIVES).sort(), SCENARIOS.map(s => s.id).sort());
  for (const scenario of SCENARIOS) {
    const definition = FIELD_OBJECTIVES[scenario.id];
    for (const field of ['name', 'brief']) for (const language of ['zh', 'en']) assert(definition[field][language].length > 5);
    for (const kind of kinds) for (const field of ['name', 'brief', 'reward']) for (const language of ['zh', 'en']) assert(definition.kinds[kind][field][language].length > 3);
    assert.match(definition.kinds.intel.reward.en, /30 seconds/);
    assert.match(definition.kinds.cache.reward.en, /Health \+15, shield \+25, grenade \+1/);
    assert.match(definition.kinds.relay.reward.en, /support \+1/);
  }
});

for (const scenario of SCENARIOS) for (const mode of modes) test(`${scenario.id}/${mode}: 32 seeded sites are grounded and physically reachable side detours`, () => {
  const f = fixture(scenario), { map } = f, positions = new Set();
  try {
    for (let seed = 0; seed < 32; seed++) {
      const site = chooseFieldSite(map, { scene: scenario.id, mode, seed });
      assert(site, `no site for seed ${seed}`);
      assert.deepEqual(site, chooseFieldSite(map, { scene: scenario.id, mode, seed }), 'seeded replay must be reproducible');
      assert(distance(site, map.starts[mode]) >= 10 - 1e-8);
      for (const target of [...scenario.targets, { x: 0, z: -39 }]) assert(distance(site, target) >= 8 - 1e-8);
      assert(distance(site, map.supply) >= 5 - 1e-8);
      assert(Math.abs(site.x) >= 5, 'equipment belongs on a side detour');
      assert(site.z < scenario.targets[0].z, 'side task must not send the player into the far enemy spawn area');
      assert.equal(site.y, map.ground(site.x, site.z));
      unblocked(map, site, .45, 0);
      const path = map.nav.route(map.starts[mode], site);
      assert(path.length > 0);
      assert(distance(path.at(-1), site) < .001);
      walkable(map, map.starts[mode], path);
      positions.add(`${site.x}/${site.z}`);
    }
    assert(positions.size >= 3, 'replays should offer more than a single equipment position');
  } finally { f.dispose(); }
});

test('a physically sealed start cannot be bridged by a nearest grid node on another island', () => {
  const solid = new Solid();
  // The small central cell has no nav nodes. A nearest-node-only check would
  // silently begin outside its walls and return a plausible-looking route.
  for (const [x0, x1, z0, z1] of [[-1.1, -1, -31, -27], [1, 1.1, -31, -27], [-1.1, 1.1, -31, -30], [-1.1, 1.1, -28, -27]]) solid.add({ x0, x1, z0, z1, y0: 0, y1: 3 });
  const bounds = { x0: -20, x1: 20, z0: -40, z1: 0 }, ground = () => 0;
  const map = { bounds, ground, solid, starts: { defend: { x: 0, y: 0, z: -29 } }, nav: new Navigation(solid, bounds, ground), supply: { x: -5, z: -39 } };
  assert.equal(chooseFieldSite(map, { scene: 'pass', mode: 'defend', seed: 2 }), null);
});

test('missing scenes, unavailable terrain, and invalid persisted task fields fail safely', () => {
  assert.equal(chooseFieldSite(null, { scene: 'pass' }), null);
  assert.equal(chooseFieldSite({}, { scene: '__proto__' }), null);
  assert.throws(() => new FieldTask('pass', '__proto__', { x: 0, y: 0, z: 0 }), TypeError);
  assert.throws(() => new FieldTask('__proto__', 'intel', { x: 0, y: 0, z: 0 }), TypeError);
  assert.throws(() => new FieldTask('pass', 'intel', { x: 0, y: NaN, z: 0 }), TypeError);
});

test('the three-second hold is frame-rate independent, emits one completion and cannot be farmed', () => {
  for (const fps of [30, 60, 144]) {
    const task = new FieldTask('rail', 'intel', { x: 10, y: 0, z: -21 });
    const site = task.site;
    let completions = 0;
    for (let frame = 0; frame < fps * 3 - 1; frame++) { assert.equal(task.update(1 / fps, { near: true, interact: true }), null); }
    assert(task.ratio < 1);
    if (task.update(1 / fps, { near: true, interact: true }) === 'completed') completions++;
    assert(task.completed); assert.equal(task.progress, 3); assert.equal(task.ratio, 1);
    for (let frame = 0; frame < fps * 10; frame++) if (task.update(1 / fps, { near: true, interact: true, blocked: frame % 2 === 0 }) === 'completed') completions++;
    assert.equal(completions, 1);
    assert.equal(task.site, site); assert.equal(task.progress, 3);
  }
});

test('incoming fire, leaving the station, and releasing E reduce progress without clearing enemies', () => {
  const task = new FieldTask('underground', 'relay', { x: -10, y: 0, z: -19 });
  for (let i = 0; i < 20; i++) task.update(.1, { near: true, interact: true });
  assert(Math.abs(task.progress - 2) < 1e-8);
  for (let i = 0; i < 5; i++) assert.equal(task.update(.1, { near: true, interact: true, blocked: true }), null);
  assert(Math.abs(task.progress - 1.25) < 1e-8);
  task.update(.1, { near: true, interact: false }); assert(Math.abs(task.progress - 1.19) < 1e-8);
  for (let i = 0; i < 20; i++) task.update(.1, { near: false, interact: true });
  assert.equal(task.progress, 0);
  let event = null;
  for (let i = 0; i < 30; i++) event = task.update(.1, { near: true, interact: true, alive: 14, pending: 20 });
  assert.equal(event, 'completed', 'optional interaction has no global enemy-clear condition');
});

test('long paused frames cannot complete an unattended task and a new deployment starts fresh', () => {
  const task = new FieldTask('city', 'cache', { x: 8, y: 0, z: -19 });
  task.update(3600, { near: true, interact: true }); assert.equal(task.progress, .25);
  task.update(NaN, { near: true, interact: true }); assert.equal(task.progress, .25);
  task.update(-20, { near: true, interact: true }); assert.equal(task.progress, .25);
  const replay = new FieldTask('city', 'cache', task.site);
  assert.equal(replay.progress, 0); assert.equal(replay.completed, false);
});

for (const scenario of SCENARIOS) test(`${scenario.id}: all equipment variants fit their footprint, complete cyan, and own their resources`, () => {
  const f = fixture(scenario), { map } = f;
  const borrowedTexture = new THREE.Texture();
  map.artMaterials.metal.map = borrowedTexture;
  try {
    for (const kind of kinds) {
      const site = chooseFieldSite(map, { scene: scenario.id, mode: 'assault', seed: 7 });
      const task = new FieldTask(scenario.id, kind, site), solidCount = map.solid.list.length;
      const visual = buildFieldObjective(map, task), ownedGeometry = new Set(), ownedMaterial = new Set();
      let textureDisposals = 0, sharedMaterialDisposals = 0, geometryDisposals = 0, materialDisposals = 0, meshes = 0;
      // A borrowed texture is deliberately attached to a map material so the
      // scene-clone path can be checked for accidental ownership/disposal.
      assert.equal(visual.root.parent, map.root); assert.equal(map.solid.list.length, solidCount);
      assert.equal(visual.root.userData.completed, false);
      visual.root.updateMatrixWorld(true);
      const body = visual.root.getObjectByName('field-equipment');
      body.traverse(mesh => {
        if (!mesh.isMesh) return;
        meshes++;
        const attribute = mesh.geometry.attributes.position;
        for (let i = 0; i < attribute.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
          assert(Math.hypot(p.x - site.x, p.z - site.z) <= .451, `${kind} overhang exceeds validated footprint`);
          assert(p.y <= site.y + 1.46, 'antenna must fit the validated height');
        }
      });
      assert(meshes <= 18, 'a single task must keep its render cost bounded');
      visual.root.traverse(mesh => { if (!mesh.isMesh) return; ownedGeometry.add(mesh.geometry); ownedMaterial.add(mesh.material); });
      assert([...ownedMaterial].some(material => material.map === borrowedTexture), 'weathered equipment should reuse existing surface textures');
      for (const geometry of ownedGeometry) geometry.addEventListener('dispose', () => geometryDisposals++);
      for (const material of ownedMaterial) material.addEventListener('dispose', () => materialDisposals++);
      for (const material of Object.values(map.artMaterials)) material.addEventListener('dispose', () => sharedMaterialDisposals++);
      for (const material of ownedMaterial) for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (material[key]) material[key].addEventListener('dispose', () => textureDisposals++);
      for (let i = 0; i < 30; i++) task.update(.1, { near: true, interact: true });
      visual.update(.1);
      assert.equal(visual.root.userData.completed, true);
      const halo = visual.root.getObjectByName('field-ground-indicator');
      assert.equal(halo.material.color.getHex(), 0x5ebeb7);
      const lens = [...ownedMaterial].find(material => material.emissive?.getHex() === 0x45bcb4);
      assert(lens, 'completed status must have a cyan indicator');
      visual.dispose(); visual.dispose(); visual.update(1);
      assert.equal(visual.root.parent, null);
      assert.equal(geometryDisposals, ownedGeometry.size);
      assert.equal(materialDisposals, ownedMaterial.size);
      assert.equal(sharedMaterialDisposals, 0); assert.equal(textureDisposals, 0);
      assert.equal(map.solid.list.length, solidCount);
    }
  } finally { f.dispose(); borrowedTexture.dispose(); }
});
