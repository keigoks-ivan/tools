import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { createGreatswordClips } from '../3d-next/hero-motion.js';
import { createHeroEquipment } from '../3d-next/hero-equipment.js';
import { HEROES } from '../3d-next/heroes.js';

// The cloth reads performance.now(); drive it with a fixed 60 Hz clock.
let clock = 0;
const realPerformance = globalThis.performance;
test.before(() => { globalThis.performance = { now: () => clock * 1000 }; });
test.after(() => { globalThis.performance = realPerformance; });

async function setup() {
  globalThis.ProgressEvent = class { constructor(type, init) { Object.assign(this, init); } };
  const bytes = await readFile(new URL('../assets/heroes/swordswoman-v4.glb', import.meta.url));
  const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size).toString());
  const strip = value => { for (const k of Object.keys(value)) { if (/texture$/i.test(k)) delete value[k]; else if (value[k] && typeof value[k] === 'object') strip(value[k]); } };
  json.materials.forEach(strip); json.images = []; json.textures = [];
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + size).toString('base64')}`;
  const root = (await new GLTFLoader().parseAsync(JSON.stringify(json), '')).scene;
  const hero = new T.Group(); hero.add(root);
  const equipment = createHeroEquipment(T, root, root.getObjectByName('Hero_sword')); equipment.apply(HEROES.azure);
  const mixer = new T.AnimationMixer(root); mixer.clipAction(createGreatswordClips(T, root).find(c => c.name === 'azureIdle')).play();
  const cape = root.getObjectByName('azure_cape');
  const run = (seconds, each = () => {}) => { for (let i = 0; i < Math.round(seconds * 60); i++) { clock += 1 / 60; each(1 / 60); mixer.update(1 / 60); hero.updateMatrixWorld(true); equipment.update(); } };
  // Model-space cloth points; world() maps them to world space for comparisons with the bones.
  const points = () => { const p = cape.children[0].geometry.attributes.position; return Array.from({ length: p.count }, (_, n) => new T.Vector3().fromBufferAttribute(p, n)); };
  const world = () => points().map(q => q.applyMatrix4(root.matrixWorld));
  return { root, hero, equipment, cape, run, points, world };
}
const behindChest = (root, point) => {
  const chest = root.getObjectByName('J_Bip_C_UpperChest');
  const back = new T.Vector3(0, 0, -1).applyQuaternion(chest.getWorldQuaternion(new T.Quaternion())).setY(0).normalize();
  return point.clone().sub(chest.getWorldPosition(new T.Vector3())).setY(0).dot(back);
};

test('azure cape hangs down her back, outside the body and above the floor, without reallocating', async () => {
  const { root, cape, run, points } = await setup();
  run(.1); const attribute = cape.children[0].geometry.attributes.position, array = attribute.array;
  run(3);
  assert.equal(cape.children[0].geometry.attributes.position, attribute); assert.equal(attribute.array, array);
  const p = points(), hem = p.slice(-13), centre = p.reduce((a, b) => a.add(b), new T.Vector3()).divideScalar(p.length);
  assert.ok(Math.max(...hem.map(q => q.y)) < .75, 'hem does not fall below the hips');
  assert.ok(Math.min(...p.map(q => q.y)) >= .019, 'cape passes through the floor');
  assert.ok(behindChest(root, centre) > .05, 'cape is not on her back');
  root.updateMatrixWorld(true);
  for (const s of cape.userData.colliders) for (const q of p.slice(13)) assert.ok(q.distanceTo(s.model) > s.r - .01, `cape inside ${s.bone.name}`);
});

test('snapping her facing does not fling the cape through the body, and running makes it trail', async () => {
  const { root, hero, run, points, world } = await setup();
  run(2);
  hero.rotation.y = Math.PI; run(.5);
  const centre = () => world().reduce((a, b) => a.add(b), new T.Vector3()).divideScalar(points().length);
  assert.ok(behindChest(root, centre()) > .05, 'turning flung the cape to the front');
  const still = points().slice(-13).reduce((a, b) => a + b.z, 0) / 13;
  // Run toward her facing (model +Z, world -Z after the turn) at 6 m/s.
  run(1.5, dt => { hero.position.z -= 6 * dt; });
  const running = points().slice(-13).reduce((a, b) => a + b.z, 0) / 13;
  assert.ok(running < still - .08, `hem did not trail while running (${still.toFixed(2)} -> ${running.toFixed(2)})`);
});
