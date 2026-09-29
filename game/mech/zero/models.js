// 照片掃描模型（Poly Haven CC0）：載入、擺放（同模型用 instancing、按區塊切開好讓看不到的區塊不畫）、外牆模組
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('./assets/models/', import.meta.url).href;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _b = new THREE.Box3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
import { BRK } from './destruct.js';
import { grimeShader } from './kit.js';

export const PROPS = ['Barrel_01', 'barrel_03', 'cardboard_box_01', 'cement_bag', 'concrete_road_barrier_02', 'covered_car', 'exterior_aircon_unit', 'hand_truck',
  'metal_jerrycan_green', 'metal_office_desk', 'metal_trash_can', 'modular_airduct_circular_01', 'modular_chainlink_fence', 'modular_fire_escape',
  'mounted_fluorescent_lights', 'old_military_crate', 'old_tyre', 'plastic_crate_02', 'portable_generator',
  'propane_tank', 'rollershutter_door', 'security_light', 'sofa_03', 'steel_frame_shelves_01',
  'tool_cart', 'trashbag', 'utility_box_02', 'water_manhole_cover', 'wooden_military_crate', 'facade_apartments', 'facade_factory'];

const SOLID1 = new Set(['Barrel_01', 'barrel_03', 'cement_bag', 'concrete_road_barrier_02', 'covered_car', 'metal_jerrycan_green', 'old_military_crate', 'old_tyre', 'portable_generator', 'propane_tank', 'trashbag', 'utility_box_02', 'water_manhole_cover', 'wooden_military_crate']);

export class Models {
  static async load(onStep = () => {}, aniso = 4) {
    const L = new GLTFLoader(), M = new Models();
    await Promise.all(PROPS.map(async (n) => {
      try { const g = await L.loadAsync(BASE + n + '.glb'); M._add(n, g.scene, aniso); }
      catch (e) { console.warn('[models] 載入失敗', n, e); }
      onStep();
    }));
    return M;
  }
  constructor() { this.lib = {}; this.nodes = {}; }
  // 整個模型烤成一組零件（道具）；外牆套件另外把每個模組分開存（去掉展示用的位移）
  _add(name, scene, aniso) {
    scene.updateMatrixWorld(true);
    const parts = [], kit = name.startsWith('facade_');
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material;
      for (const t of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (mat[t]) mat[t].anisotropy = aniso;
      if (mat.transparent && !mat.alphaMap && mat.opacity >= 1) mat.transparent = false;
      // 折射玻璃（發電機油表窗）：只要畫面上有一個，整座城就要多畫一遍給它折射；改成深色亮面玻璃，看起來一樣
      if (mat.transmission > 0) { mat.transmission = 0; mat.color.multiplyScalar(0.2); mat.roughness = 0.08; mat.metalness = 0; }
      mat.envMapIntensity = 1;
      // 外牆模組：套上風化髒污（水痕、大範圍明暗）；灰泥的橘色壓暗、褪色一點
      if (kit && !mat.userData.grime && !/glass/i.test(mat.name)) { mat.userData.grime = 0.85; mat.side = THREE.FrontSide; if (/plaster/i.test(mat.name)) mat.color.setRGB(0.8, 0.8, 0.86); mat.onBeforeCompile = (sh) => grimeShader(sh, mat); }   // 外牆只從外面看：背面不畫
      if (name === 'rollershutter_door' && !mat.userData.grime) { mat.color.multiplyScalar(0.62); mat.userData.grime = 0.9; mat.onBeforeCompile = (sh) => grimeShader(sh, mat); }   // 鐵捲門原本白得發亮：壓暗、加髒污
      if (SOLID1.has(name)) mat.side = THREE.FrontSide;   // 封閉的實心道具：背面看不到，不畫（省一半三角形的點陣化）
      if (name === 'cement_bag') { mat.color.set(0x5f5443); mat.map = null; mat.userData.grime = 0.8; mat.onBeforeCompile = (sh) => grimeShader(sh, mat); }   // 水泥袋改成沙包色（麻布）：拿掉印著 CEMENT 字和紅條的貼圖，只留布紋凹凸
      // 壓縮過的頂點（int16 正規化）先轉回浮點數，不然套矩陣會被截在 ±1
      const g = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(o.geometry.attributes)) {
        if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) { g.setAttribute(k, a.clone()); continue; }
        const n = a.count, sz = a.itemSize, arr = new Float32Array(n * sz);
        for (let i = 0; i < n; i++) { arr[i * sz] = a.getX(i); if (sz > 1) arr[i * sz + 1] = a.getY(i); if (sz > 2) arr[i * sz + 2] = a.getZ(i); if (sz > 3) arr[i * sz + 3] = a.getW(i); }
        g.setAttribute(k, new THREE.BufferAttribute(arr, sz));
      }
      if (o.geometry.index) g.setIndex(o.geometry.index.clone());
      const w = o.matrixWorld.clone();
      if (kit) { w.decompose(_p, _q, _s); w.compose(new THREE.Vector3(), _q, _s); }
      g.applyMatrix4(w);
      g.computeBoundingBox();
      if (kit) { const nm = o.parent && o.parent !== scene && o.parent.isGroup && !o.parent.isScene ? o.parent.name : o.name; (this.nodes[name + ':' + nm] ||= []).push({ geo: g, mat }); }
      else parts.push({ geo: g, mat });
    });
    if (!kit) {
      const box = new THREE.Box3(); for (const p of parts) box.union(p.geo.boundingBox);
      // 模型原點放到底部中心
      const c = box.getCenter(new THREE.Vector3());
      for (const p of parts) { p.geo.translate(-c.x, -box.min.y, -c.z); p.geo.computeBoundingBox(); }
      box.translate(new THREE.Vector3(-c.x, -box.min.y, -c.z));
      this.lib[name] = { parts, box, size: box.getSize(new THREE.Vector3()) };
    }
  }
  has(name) { return !!(this.lib[name] || this.nodes[name]); }
  get(name) {
    if (this.lib[name]) return this.lib[name];
    const parts = this.nodes[name]; if (!parts) return null;
    const box = new THREE.Box3(); for (const p of parts) box.union(p.geo.boundingBox);
    return (this.lib[name] = { parts, box, size: box.getSize(new THREE.Vector3()) });
  }
}

// ---------------------------------------------------------------- 擺放：累積每個模型的矩陣，最後按區塊建 InstancedMesh
export class Placer {
  constructor(models, solid, chunk = 120) { this.M = models; this.solid = solid; this.chunk = chunk; this.list = new Map(); this.reg = []; this.bagWalls = []; }
  // o：scale（數字或 [x,y,z]）、solid（加碰撞盒）、hit（子彈材質）、cast（投影子）、tilt（繞 X 傾斜）、roll
  add(name, x, y, z, ry = 0, o = {}) {
    const m = this.M.get(name); if (!m) return null;
    const s = o.scale ?? 1, S = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
    _q.setFromEuler(new THREE.Euler(o.tilt || 0, ry, o.roll || 0, 'YXZ'));
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, S);
    const C = name.startsWith('facade_') ? 48 : this.chunk;
    // 同一區塊同一模型只建一個 InstancedMesh（原本投不投影子分成兩個，多一個 draw call）：有一個要投就全部投
    const key = name + '|' + Math.floor(x / C) + ',' + Math.floor(z / C);
    let e = this.list.get(key); if (!e) this.list.set(key, (e = { name, key, mats: [], cast: false }));
    if (o.cast !== false) e.cast = true;
    const i = e.mats.length;
    e.mats.push(mat);
    const h = { mat, hide() { for (const im of e.ims || []) { im.setMatrixAt(i, ZERO); im.instanceMatrix.needsUpdate = true; } } };
    let box = null;
    const brk = BRK[name] && !o.noBreak && !o.bag;
    if (o.solid || brk) {
      _b.copy(m.box).applyMatrix4(mat);
      // 可破壞但不擋路的小東西：只接子彈
      box = this.solid.add({ x0: _b.min.x + (o.inset || 0), x1: _b.max.x - (o.inset || 0), y0: _b.min.y, y1: o.top ?? _b.max.y, z0: _b.min.z + (o.inset || 0), z1: _b.max.z - (o.inset || 0), mat: o.hit || 'metal', noMove: !o.solid, noFloor: !o.solid });
    }
    if (brk) this.reg.push({ name, h, box });
    return h;
  }
  size(name) { const m = this.M.get(name); return m ? m.size : null; }
  build(scene) {
    let calls = 0, tris = 0;
    // 外牆模組：同一區塊、同材質的全部合併成一個網格（不投影子：後面的牆體已經會投）
    const merged = new Map();
    for (const e of this.list.values()) {
      if (!e.name.startsWith('facade_')) continue;
      const m = this.M.get(e.name), ck = e.key.split('|')[1];
      for (const p of m.parts) {
        const k = ck + '|' + p.mat.uuid;
        let g = merged.get(k); if (!g) merged.set(k, (g = { mat: p.mat, list: [] }));
        for (const mt of e.mats) g.list.push(p.geo.clone().applyMatrix4(mt));
      }
    }
    for (const g of merged.values()) {
      const keep = ['position', 'normal', 'uv'];
      const gs = g.list.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const a of Object.keys(y.attributes)) if (!keep.includes(a)) y.deleteAttribute(a); if (!y.attributes.uv) y.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(y.attributes.position.count * 2), 2)); return y; });
      const geo = mergeGeometries(gs, false); if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, g.mat); mesh.castShadow = false; mesh.receiveShadow = true;
      scene.add(mesh); calls++; tris += geo.attributes.position.count / 3;
    }
    for (const e of this.list.values()) {
      if (e.name.startsWith('facade_')) continue;
      const m = this.M.get(e.name);
      for (const p of m.parts) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, e.mats.length);
        (e.ims ||= []).push(im);
        e.mats.forEach((mt, i) => im.setMatrixAt(i, mt));
        // 小東西不投影子、不算 AO（省兩趟繪製；肉眼幾乎看不出差別）
        const big = m.size.x * m.size.y * m.size.z > 0.35;
        im.castShadow = e.cast && big && !p.mat.transparent; im.receiveShadow = true;
        if (!big) im.userData.noAO = true;
        im.computeBoundingSphere();
        scene.add(im); calls++;
        tris += (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3 * e.mats.length;
      }
    }
    return { calls, tris };
  }
}

// ---------------------------------------------------------------- 外牆：沿一面牆排 3 m 模組（每層 3.2 m：牆 3.0 ＋線腳 0.2）
//   side：'n' 's' 'e' 'w'（牆面朝外的方向）；模組原點在右下角、x∈[−3,0]、面向 +Z
export const FLOOR = 3.2;
const APT = {
  ground: [['wall_door_centered_small_01', 'door_centered_small_01'], ['wall_window_centered_large_01', 'window_centered_large_01'], ['wall_door_centered_large_01', 'door_centered_large_01'], ['wall_door_window_small_01', 'door_window_small_01']],
  upper: [['wall_window_centered_small_01', 'window_centered_small_01'], ['wall_window_centered_small_02', 'window_centered_small_02'], ['wall_window_centered_large_01', 'window_centered_large_01'], ['wall_window_centered_large_02', 'window_centered_large_02'],
    ['wall_window_centered_double_01', 'window_centered_double_01'], ['wall_window_centered_double_02', 'window_centered_double_02'], ['wall_window_offset_small_01', 'window_offset_small_01'], ['wall_window_offset_small_03', 'window_offset_small_03'], ['wall_standard_standard_01', null]],
  cornice: 'cornice_standard_standard_01', crown: 'crown_standard_standard_01', base: 'base_standard_01', pier: 'wall_pier_standard_01',
};
const FAC = {
  ground: [['wall_door_garage_door_01', 'door_garage_door_01', 6], ['wall_door_recessed_large_01', 'door_recessed_large_01'], ['wall_window_centered_large_01', 'window_centered_large_01'], ['wall_door_centered_small_01', 'door_centered_small_01']],
  upper: [['wall_window_tall_large_01', 'window_tall_large_01'], ['wall_window_tall_small_01', 'window_tall_small_01'], ['wall_window_centered_medium_01', 'window_centered_medium_01'], ['wall_window_centered_large_02', 'window_centered_large_02'], ['wall_window_centered_small_01', 'window_centered_small_01'], ['wall_standard_standard_01', null]],
  cornice: 'cornice01_standard_standard_01', crown: 'crown_standard_standard_01', base: 'base_standard_standard_01', pier: 'wall_pier_standard_01',
};
export function facade(P, kitName, side, x0, x1, z0, z1, floors, rnd, o = {}) {
  const K = kitName === 'factory' ? FAC : APT, pre = kitName === 'factory' ? 'facade_factory:' : 'facade_apartments:';
  const along = side === 'n' || side === 's';
  const a0 = along ? x0 : z0, a1 = along ? x1 : z1;
  const fix = side === 'n' ? z1 : side === 's' ? z0 : side === 'e' ? x1 : x0;
  // 模組面向 +Z；轉到對應的外牆方向（ry）；模組 x∈[−3,0] 往「右」延伸
  const ry = side === 'n' ? 0 : side === 's' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
  const dirA = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, ry);   // 模組 +X 方向在世界的方向
  const len = a1 - a0, n = Math.floor(len / 3), margin = (len - n * 3) / 2;
  const at = (a, y) => {
    // 牆面上沿走向 a 的點（世界）
    const p = along ? new THREE.Vector3(a, y, fix) : new THREE.Vector3(fix, y, a);
    return p;
  };
  // 模組的右下角（x=0）要落在 a＋3（沿 dirA 的正方向），所以依 dirA 決定起點
  const place = (name, a, y, extra = {}) => {
    if (o.hide && a + 3 > o.hide[0] && a < o.hide[1]) return null;   // 這段牆被隔壁房間貼住：不放模組（亂數照抽）
    const alongSign = along ? Math.sign(dirA.x) : Math.sign(dirA.z);
    const aa = alongSign > 0 ? a + 3 : a;   // 模組 x=0 那端
    const p = at(aa, y);
    return P.add(pre + name, p.x, p.y, p.z, ry, extra);
  };
  const top = Math.min(floors, o.maxFloors ?? 99);
  for (let f = 0; f < top; f++) {
    const y = f * FLOOR + (o.y0 || 0);
    const list = f === 0 && !o.noGround ? K.ground : K.upper;
    for (let i = 0; i < n; i++) {
      const a = a0 + margin + i * 3;
      let pick = list[Math.floor(rnd() * list.length)];
      if (pick[2] === 6) { if (i + 1 < n && rnd() < 0.5) { place(pick[0], a + 3, y); if (pick[1]) place(pick[1], a + 3, y); i++; continue; } pick = list[2]; }

      place(pick[0], a, y);
      if (pick[1]) place(pick[1], a, y);
      if (pick[3] && P.M.has('rollershutter_door')) { const c = at(a + 1.5, y); P.add('rollershutter_door', c.x + (along ? 0 : (side === 'e' ? 0.05 : -0.05)), y, c.z + (along ? (side === 'n' ? 0.05 : -0.05) : 0), ry, { scale: [1.25, 1.0, 1] }); }
    }
    // 樓層線腳
    for (let i = 0; i < n; i++) place(K.cornice, a0 + margin + i * 3, y + 3.0, { cast: false });
  }
  // 底座、屋頂
  for (let i = 0; i < n; i++) { place(K.base, a0 + margin + i * 3, (o.y0 || 0), { cast: false }); if (top === floors) place(K.crown, a0 + margin + i * 3, top * FLOOR + (o.y0 || 0) - 0.2); }
  return { margin, n, top };
}
