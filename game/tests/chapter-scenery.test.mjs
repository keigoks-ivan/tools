import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createChapterWorld } from '../3d-next/chapter-world.js';
import { heightAt } from '../3d-next/march.js';

function fixture() {
  const scene = new T.Scene(), group = new T.Group(); scene.add(group);
  const textures = Array.from({ length: 6 }, () => new T.Texture());
  for (const [i, name] of ['march-stone-0', 'march-props-0', 'march-sky'].entries()) {
    const material = i === 1 ? new T.MeshBasicMaterial({ map: textures[i] }) : new T.ShaderMaterial({ uniforms: { map: { value: textures[i] } } });
    if (i === 0) Object.assign(material.uniforms, { stoneColour: { value: textures[3] }, stoneSurface: { value: textures[4] }, woodGrain: { value: textures[5] } });
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
      for (const key of ['map','normalMap','roughnessMap','bumpMap']) if (o.material[key]) assert.ok(textures.includes(o.material[key]), 'reuse loaded maps without per-chapter allocation');
      if (o.material.uniforms?.map) assert.ok(textures.includes(o.material.uniforms.map.value));
    });
    // Every floor vertex continues to match the existing movement/collision height field.
    const floor = set.children.find(o => o.material?.vertexColors);
    assert.equal(floor.material.map,textures[3]);
    assert.equal(floor.material.normalMap,textures[4]);
    assert.equal(floor.material.roughnessMap,textures[4]);
    const colors = floor.geometry.attributes.color;
    const colourAt = (x,z) => { const p=floor.geometry.attributes.position; for(let i=0;i<p.count;i++) if(p.getX(i)===x && p.getZ(i)===z) return colors.getX(i); };
    assert.ok(colourAt(11,0)<colourAt(8,0), 'baked rail contact shade darkens the floor below scenery');
    const shader = { fragmentShader: '#include <roughnessmap_fragment>\n#include <map_fragment>\n#include <color_fragment>' };
    floor.material.onBeforeCompile(shader);
    assert.ok(shader.fragmentShader.includes('float roughnessFactor = roughness;'));
    assert.ok(shader.fragmentShader.includes('vRoughnessMapUv).a'), 'roughness reads the packed alpha rather than the normal Y channel');
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
