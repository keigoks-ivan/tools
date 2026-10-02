import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createChapterWorld } from '../3d-next/chapter-world.js';
import { heightAt } from '../3d-next/march.js';

function fixture() {
  const scene = new T.Scene(), group = new T.Group(); scene.add(group);
  const textures = [new T.Texture(), new T.Texture(), new T.Texture()];
  for (const [i, name] of ['march-stone-0', 'march-props-0', 'march-sky'].entries()) {
    const material = i === 1 ? new T.MeshBasicMaterial({ map: textures[i] }) : new T.ShaderMaterial({ uniforms: { map: { value: textures[i] } } });
    const mesh = new T.Mesh(new T.PlaneGeometry(), material); mesh.name = name; group.add(mesh);
  }
  return { scene, group, textures, scenery: createChapterWorld(T, scene, { group, heightAt }) };
}

test('chapter scenery stays within geometry, draw and particle budgets, reusing the loaded atlases', () => {
  const { scene, group, textures, scenery } = fixture();
  for (const environment of ['frost', 'citadel']) {
    scenery.apply({ environment });
    const stats = scenery.stats();
    assert.ok(stats.triangles < (environment === 'frost' ? 52000 : 65000));
    assert.ok(stats.meshes <= 10);
    assert.ok(stats.geometryBytes < 2.2 * 1048576);
    assert.equal(stats.particles, 256);
    const set = scene.getObjectByName(`chapter-${environment}`);
    set.traverse(o => {
      if (!o.isMesh) return;
      assert.equal(o.castShadow, false);
      for (const value of o.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
      const normal = o.geometry.attributes.normal;
      for (let i = 0; i < normal.count; i++) assert.ok(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) > 0.5, 'valid normals for curved surfaces and both cloth faces');
      if (o.material.map) assert.ok(textures.includes(o.material.map), 'no new texture allocation');
      if (o.material.uniforms?.map) assert.ok(textures.includes(o.material.uniforms.map.value));
    });
    // Every floor vertex continues to match the existing movement/collision height field.
    const floor = set.children.find(o => o.material?.vertexColors);
    const p = floor.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) assert.ok(Math.abs(p.getY(i) - heightAt(p.getX(i), p.getZ(i)) - 0.01) < 1e-5);
    assert.ok(group.children.every(o => !o.visible));
  }
  scenery.dispose();
});

test('repeated chapter switches reuse sets, stop inactive weather, and release only owned resources', () => {
  const { scene, group, textures, scenery } = fixture();
  const nodes = {};
  for (let i = 0; i < 4; i++) for (const environment of ['frost', 'citadel']) {
    scenery.apply({ environment });
    const set = scene.getObjectByName(`chapter-${environment}`);
    if (nodes[environment]) assert.equal(set, nodes[environment]);
    nodes[environment] = set;
    assert.equal(scene.children.length, 1 + Object.keys(nodes).length);
  }
  const frost = nodes.frost.children.find(o => o.isPoints).geometry.attributes.position;
  const before = Array.from(frost.array);
  scenery.update(1 / 60); assert.deepEqual(Array.from(frost.array), before);
  scenery.apply({}); assert.ok(group.children.every(o => o.visible));
  assert.ok(!nodes.frost.visible && !nodes.citadel.visible);
  let released = 0, textureReleased = 0;
  for (const set of Object.values(nodes)) set.traverse(o => o.geometry?.addEventListener('dispose', () => released++));
  for (const texture of textures) texture.addEventListener('dispose', () => textureReleased++);
  scenery.dispose(); assert.equal(scene.children.length, 1);
  assert.ok(released > 15); assert.equal(textureReleased, 0, 'shared night-market textures remain owned by the base world');
});
