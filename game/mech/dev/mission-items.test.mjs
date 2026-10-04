import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMap } from '../zero/map.js';
import { Solid, SURFACES } from '../zero/kit.js';
import { ENCOUNTERS } from '../zero/script.js';

function fixture(t, missingModels = true) {
  const previous = globalThis.document, gradient = { addColorStop() {} };
  const context = new Proxy({ measureText: s => ({ width: String(s).length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient },
    { get: (o, k) => k in o ? o[k] : (() => {}), set: (o, k, v) => (o[k] = v, true) });
  globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }), fonts: { load: () => Promise.resolve() } };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const scene = new THREE.Scene(), solid = new Solid();
  const mats = Object.fromEntries(SURFACES.map(k => [k, new THREE.MeshStandardMaterial({ vertexColors: true })]));
  const placer = missingModels ? { M: { nodes: new Proxy({}, { get: () => [{ mat: new THREE.MeshStandardMaterial() }] }), has: () => false }, reg: [], bagWalls: [], size: () => new THREE.Vector3(3, 3, 3), add: () => null } : null;
  return { scene, solid, map: buildMap(scene, mats, solid, placer) };
}

test('前傳每個 E 任務都有可見實體，缺少掃描模型時仍保留原互動座標', t => {
  const { map } = fixture(t), expected = {
    radio: [-61.05, .76, -57.45], codes: [-60.95, .76, -56.45], smap: [-63, 1.1, -61.1],
    fuse: [38.3, .79, 45], rec_a: [-46.2, 1.16, 12.1], rec_b: [-36.8, .78, 11.2], rec_c: [-37.4, 1.28, 17.35],
    panel1: [11.3, 7, 76], panel2: [11.3, 7, 100.5],
  };
  for (const id of ENCOUNTERS.flatMap(e => (e.pickups || []).map(p => p.id))) {
    const it = map.items[id]; assert(it?.h && it.pin, id + ' 只剩提示點'); assert.deepEqual(it.p.toArray(), expected[id]);
    assert.equal(it.h.visible, true); assert.equal(typeof it.h.reset, 'function');
    const origin = id.startsWith('panel') ? it.pin.clone().add(new THREE.Vector3(1, 0, 0)) :
      id === 'smap' ? it.pin.clone().add(new THREE.Vector3(0, 0, 1)) : it.p.clone().add(new THREE.Vector3(0, 1, 0));
    const direction = id.startsWith('panel') ? new THREE.Vector3(-1, 0, 0) : id === 'smap' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);
    const hit = new THREE.Raycaster(origin, direction, 0, 1.5).intersectObjects(map.meshes, false)[0];
    assert(hit, id + ' 沒有可視表面');
    if (id.startsWith('panel')) assert(hit.point.x > 10.68, id + ' 只看見後面的機庫牆');
    else if (id === 'smap') assert(hit.point.z > -61.68, '紙地圖埋在室內粉刷層');
    else assert(hit.point.y > it.p.y + .02, id + ' 埋在桌面下面');
  }
  assert(map.meshes.length <= 30, '缺模型的備援地圖新增過多材質桶');
  assert.deepEqual(map.marks.key.toArray(), [-38.6, 0, 32.4]);
});

test('收取和安裝只改合併桶內物件頂點，重玩完整還原，固定設備保留箱體', t => {
  const { map, solid } = fixture(t, false), colliders = solid.list.slice();
  const baseline = map.meshes.map(m => m.geometry.attributes.position.array.slice());
  const restored = () => map.meshes.every((m, k) => m.geometry.attributes.position.array.every((v, i) => v === baseline[k][i]));
  let changedFloats = 0;
  for (const id of ['radio', 'codes', 'fuse', 'rec_a', 'rec_b', 'rec_c', 'panel1', 'panel2']) {
    const it = map.items[id]; if (it.persistent) it.h.install(); else it.h.hide();
    let changes = 0;
    for (const [k, mesh] of map.meshes.entries()) {
      const values = mesh.geometry.attributes.position.array;
      for (let i = 0; i < values.length; i += 3) {
        if (values[i] === baseline[k][i] && values[i + 1] === baseline[k][i + 1] && values[i + 2] === baseline[k][i + 2]) continue;
        changes += 3;
        const source = values[i] || values[i + 1] || values[i + 2] ? values : baseline[k];
        assert(Math.hypot(source[i] - it.pin.x, source[i + 1] - it.pin.y, source[i + 2] - it.pin.z) < 1, id + ' 移除了周圍建築或其他物件');
      }
    }
    assert(changes >= 18, id + ' 沒有可見收取／安裝變化'); changedFloats += changes;
    assert.equal(it.h.visible, !!it.persistent); if (it.persistent) assert.equal(it.h.installed, true);
    it.h.reset(); assert(restored(), id + ' 重玩沒有還原'); if (it.persistent) assert.equal(it.h.installed, false);
  }
  map.items.smap.h.install(); assert(restored(), '拍下地圖卻把牆上的地圖拿走'); assert.equal(map.items.smap.h.installed, true);
  map.items.smap.h.reset(); assert.equal(map.items.smap.h.installed, false);
  assert(changedFloats / 9 < 1500, '互動道具使用過多幾何'); assert.deepEqual(solid.list, colliders);
});
