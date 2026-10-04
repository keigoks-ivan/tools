// 道具的形狀（回傳 {材質名: 幾何}，由 Builder.mesh 合併進地圖）：燒毀轎車、油桶、飛彈架、機庫吊車、工具車、體積光錐
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grimeTex } from './kit.js';
import { buildJapaneseCar } from '../japanese-cars.mjs';

const cache = {};
function prism(pts, w, bev = 0.04, holes = []) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, w - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 10 });
  g.rotateY(-Math.PI / 2);
  g.computeBoundingBox();
  g.translate(-(g.boundingBox.min.x + g.boundingBox.max.x) / 2, 0, 0);
  return g;
}
function merge(list) {
  const gs = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; });
  return mergeGeometries(gs, false);
}
const cyl = (r, h, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg);

// ---------------------------------------------------------------- 車殼：沿車長（z）排一圈圈斷面，接成一張光滑曲面
//   ring(z)＝右半邊斷面（由下往上到車頂中線）的點 [[x,y],...]，左半邊自動鏡射；每個斷面點數要一樣
//   skip(z0,z1,k)＝這格不畫（燒掉的窗）；glass＝這格畫成玻璃；inner＝這格背面也畫（從窗洞看進去的車門、車頂內側）
//   col(x,y,z,k)＝頂點色（煙燻、灰燼、鏽、烤漆色帶）；warp(p)＝整體變形（凹陷、塌陷）
function loft(S) {
  const Z = S.z, rings = Z.map((z) => S.ring(z)), n = rings[0].length, R = 2 * n - 1;
  const P = [], C = [];
  for (let i = 0; i < Z.length; i++) for (let m = 0; m < R; m++) {
    const k = m < n ? m : 2 * n - 2 - m, [hx, y] = rings[i][k], x = m < n ? hx : -hx;
    const v = new THREE.Vector3(x, y, Z[i]); if (S.warp) S.warp(v, k);
    P.push(v.x, v.y, v.z); C.push(...S.col(x, y, Z[i], k));
  }
  const id = (i, m) => i * R + m, out = [], gl = [], inn = [];
  for (let i = 0; i < Z.length - 1; i++) for (let m = 0; m < R - 1; m++) {
    const k = m < n - 1 ? m : 2 * n - 3 - m, z0 = Z[i], z1 = Z[i + 1];
    if (S.skip && S.skip(z0, z1, k)) continue;
    const q = [id(i, m), id(i, m + 1), id(i + 1, m + 1), id(i, m), id(i + 1, m + 1), id(i + 1, m)];
    (S.glass && S.glass(z0, z1, k) ? gl : out).push(...q);
    if (S.inner && S.inner(z0, z1, k)) inn.push(q[0], q[2], q[1], q[3], q[5], q[4]);
  }
  // 頭尾封口（扇形）
  const cap = (i, dir) => {
    const r = rings[i], yc = (r[0][1] + r[n - 1][1]) * 0.5, c = P.length / 3;
    const v = new THREE.Vector3(0, yc, Z[i]); if (S.warp) S.warp(v, -1);
    P.push(v.x, v.y, v.z); C.push(...S.col(0, yc, Z[i], -1));
    for (let m = 0; m < R; m++) { const a = id(i, m), b = id(i, (m + 1) % R); if (dir > 0) out.push(c, a, b); else out.push(c, b, a); }
  };
  if (S.caps !== false) { cap(0, -1); cap(Z.length - 1, 1); }
  const mk = (idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  const body = mk(out), res = { body, glass: gl.length ? mk(gl) : null, inner: null };
  if (inn.length) {
    // 內側：沿外殼法線往內縮 3 cm，反面、深色
    const ip = [], np = body.attributes.normal;
    for (let j = 0; j < P.length / 3; j++) ip.push(P[j * 3] - np.getX(j) * 0.03, P[j * 3 + 1] - np.getY(j) * 0.03, P[j * 3 + 2] - np.getZ(j) * 0.03);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ip, 3)); g.setIndex(inn); g.computeVertexNormals();
    res.inner = g;
  }
  return res;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// 固定的小雜訊（同一個 seed 每次一樣）
const hn = (x, y, z, s) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 17.17) * 43758.5453; return v - Math.floor(v); };
const soot = (x, y, z, s) => 0.5 + 0.5 * Math.sin(x * 3.1 + z * 1.7 + s) * Math.sin(y * 5.3 + z * 2.3 + s * 2.1);
// 只保留位置、法線、顏色，合併
function mergeC(list, col = null) {
  const gs = list.filter(Boolean).map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.color) { const c = col || [1, 1, 1], a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set(c, i); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    return n;
  });
  return mergeGeometries(gs, false);
}
const tint = (g, c) => { const n = g.index ? g.toNonIndexed() : g; const a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set(c, i); n.setAttribute('color', new THREE.BufferAttribute(a, 3)); return n; };
const box = (w, h, d, x, y, z, c) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c || [1, 1, 1]);

// 輪子：燒掉的車只剩鋼圈壓在地上（輪胎殘骸很薄）；沒燒的是扁掉的輪胎
function wheel(x, z, burned, r = 0.19, side = 1) {
  const rim = [], dark = [];
  const cy = burned ? r + 0.02 : 0.3;
  rim.push(tint(new THREE.CylinderGeometry(r, r, 0.17, 14, 1, true).rotateZ(Math.PI / 2).translate(x, cy, z), [0.55, 0.5, 0.46]));
  rim.push(tint(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.02, 14).rotateZ(Math.PI / 2).translate(x + side * 0.05, cy, z), [0.5, 0.46, 0.42]));
  rim.push(tint(new THREE.TorusGeometry(r, 0.02, 4, 14).rotateY(Math.PI / 2).translate(x + side * 0.08, cy, z), [0.6, 0.55, 0.5]));
  if (burned) dark.push(tint(new THREE.TorusGeometry(r + 0.03, 0.04, 5, 14).rotateY(Math.PI / 2).scale(1, 0.8, 1).translate(x - side * 0.03, cy - 0.03, z), [0.35, 0.33, 0.32]));
  else dark.push(tint(new THREE.TorusGeometry(0.24, 0.085, 6, 16).rotateY(Math.PI / 2).scale(1, 0.92, 1).translate(x, 0.29, z), [0.5, 0.5, 0.5]));
  return { rim, dark };
}
// 輪拱內側的深色擋泥板（不然從輪拱看得到車殼裡面是空的）
const flip = (g) => { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); return g; };
const liner = (x, z, r, w, y = 0.3) => tint(flip(new THREE.CylinderGeometry(r, r, w, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(x, y, z)), [0.25, 0.24, 0.23]);

// ---------------------------------------------------------------- 日本乘用車（面向 +Z）；保留舊的撞車 variant 2
export function car(variant = 0, burned = true, detail = true) {
  return buildJapaneseCar(variant === 2 ? 0 : variant === 3 ? 2 : variant, { burned, crashed: variant === 2, detail });
}

// 乘用車的烤漆、橡膠、輪圈與玻璃不套建築窗簾或鏽鐵照片；全車共用五個材質。
export function carMaterials() {
  if (cache.carMaterials) return cache.carMaterials;
  const material = (opts) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, ...opts });
  const carPaint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .26, metalness: .06, clearcoat: .8, clearcoatRoughness: .18, envMapIntensity: 1, vertexColors: true });
  const carGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .09, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.2, vertexColors: true });
  carGlass.userData.noCast = true;
  return (cache.carMaterials = { carPaint, carDark: material({ roughness: .94 }), carMetal: material({ roughness: .24, metalness: .7 }), carGlass, carLights: material({ roughness: .18, metalness: .05 }) });
}

// ---------------------------------------------------------------- 燒毀的公車（長 10.4、寬 2.5、高 3 m，面向 +Z）：一整排窗洞看得到燒黑的車廂和座椅鐵架
export function bus() {
  if (cache.bus) return cache.bus;
  const H = 5.2, AX = [3.3, -2.9], AR = 0.62;
  const zs = [-5.2, -5.15, -5.05]; for (let z = -4.9; z < 4.9; z += 0.3) zs.push(+z.toFixed(2)); zs.push(4.95, 5.08, 5.15, 5.2);
  const pil = (z) => { const u = (z + 4.6) / 1.15; return Math.abs(u - Math.round(u)) * 1.15 < 0.13 || z < -4.7; };   // 每 1.15 m 一根窗柱
  const ring = (z) => {
    const e = Math.abs(z), end = sstep(4.85, 5.2, e), wb = 1.25 - end * 0.05;
    let ys = 0.28; for (const a of AX) { const d = Math.abs(z - a); if (d < AR) ys = Math.max(ys, 0.42 + Math.sqrt(AR * AR - d * d)); }
    const sag = 0.16 * Math.sin(Math.PI * sstep(-4.5, 4.5, z)), yr = 3.0 - end * 0.12 - sag;
    return [[wb - 0.03, ys], [wb, Math.min(ys + 0.3, 1.12)], [wb + 0.01, 1.2], [wb, 1.3], [wb - 0.02, 1.36], [wb - 0.05, yr - 0.32], [wb - 0.1, yr - 0.08], [wb - 0.35, yr], [wb * 0.5, yr + 0.05], [0, yr + 0.06]];
  };
  const door = (z0, z1) => z0 >= 3.95 && z1 <= 4.95;   // 前門（右側）
  const win = (z0, z1, k) => (k === 4 && z0 >= -4.75 && z1 <= 4.95 && !pil((z0 + z1) / 2)) || (k === 3 && door(z0, z1));
  const col = (x, y, z, k) => {
    const up = sstep(1.2, 2.8, y), s = soot(x, y, z * 0.7, 3), w = k >= 3 && k <= 5 ? 0.5 : 1;
    const v = lerp(0.5, 0.72, up) * lerp(0.5, 1, s) * w * (0.85 + hn(x, y, z, 5) * 0.2);
    return [v * 1.08, v * 0.86, v * 0.72];
  };
  const warp = (p) => { p.y += (hn(Math.round(p.x * 2), 0, Math.round(p.z * 2), 9) - 0.5) * 0.05 * sstep(1.5, 2.6, p.y); };
  const L0 = loft({ z: zs, ring, skip: win, inner: (z0, z1, k) => k !== 4 && k < 9, col, warp });
  // 前後擋風玻璃燒掉：在頭尾封口前面挖不了洞，改成深色面板＋框
  const dk = [0.16, 0.15, 0.14], dark = [tint(L0.inner, [0.14, 0.13, 0.12]), box(2.3, 0.2, 10, 0, 0.3, 0, dk), box(2.3, 0.08, 9.6, 0, 0.62, 0, [0.2, 0.19, 0.18]),
    box(2.1, 1.25, 0.04, 0, 1.95, 5.215, [0.06, 0.06, 0.06]), box(2.1, 0.9, 0.04, 0, 2.1, -5.215, [0.06, 0.06, 0.06]), box(1.6, 0.3, 0.04, 0, 2.72, 5.2, [0.1, 0.1, 0.1])];
  const metal = [];
  // 座椅鐵架兩排
  for (let z = -4.3; z < 3.4; z += 0.85) for (const x of [-0.7, 0.7]) {
    metal.push(box(0.85, 0.05, 0.42, x, 1.05, z, [0.32, 0.28, 0.25]), tint(new THREE.BoxGeometry(0.85, 0.5, 0.05).rotateX(-0.15).translate(x, 1.32, z - 0.2), [0.32, 0.28, 0.25]));
    metal.push(box(0.04, 0.45, 0.04, x, 0.84, z, [0.3, 0.27, 0.25]));
  }
  for (const a of AX) for (const s of [-1, 1]) { const w = wheel(s * 1.02, a, true, 0.3, s); metal.push(...w.rim); dark.push(...w.dark); dark.push(liner(s * 0.95, a, AR - 0.02, 0.5, 0.42)); }
  const body = mergeC([L0.body, box(2.4, 0.22, 0.14, 0, 0.5, 5.25, [0.32, 0.27, 0.23]), tint(new THREE.BoxGeometry(2.4, 0.22, 0.14).rotateZ(0.08).translate(0, 0.45, -5.25), [0.32, 0.27, 0.23])]);
  return (cache.bus = { body, dark: mergeC(dark), metal: mergeC(metal) });
}

// ---------------------------------------------------------------- 救護車（廂型：長 6、寬 2.4、高 2.6 m，面向 +Z）：白漆、紅色腰帶、車頭玻璃
export function van() {
  if (cache.van) return cache.van;
  const AX = [2.0, -1.9], AR = 0.45;
  const zs = [-3, -2.96, -2.88, -2.7, -2.4, -2.1, -1.9, -1.7, -1.4, -1, -0.5, 0, 0.5, 0.9, 1.15, 1.25, 1.45, 1.65, 1.8, 2.0, 2.2, 2.4, 2.6, 2.78, 2.9, 2.96, 3];
  const ring = (z) => {
    const e = Math.abs(z), end = sstep(2.7, 3, e), wb = 1.2 - end * 0.07;
    let ys = 0.36; for (const a of AX) { const d = Math.abs(z - a); if (d < AR) ys = Math.max(ys, 0.36 + Math.sqrt(AR * AR - d * d)); }
    // 車頂：後面車廂 2.6、駕駛座 2.15、引擎蓋 1.15
    const hood = lerp(1.2, 1.08, sstep(2.4, 3, z)), cab = z > 1.2 ? 2.15 : 2.6, g = 1 - sstep(1.75, 2.45, z);
    const yr = lerp(hood, cab, g) - end * 0.06, yb = Math.min(yr - 0.02, 1.2);
    const top = (f) => lerp(yb + 0.03, yr, f), c = (y, i) => Math.min(y, yb - 0.012 * (7 - i));   // 引擎蓋那段：側面的點壓到蓋子下面
    return [[wb - 0.04, ys], [wb, c(Math.min(ys + 0.25, 0.95), 1)], [wb, c(1.0, 2)], [wb, c(1.14, 3)], [wb, c(1.18, 4)], [wb, c(1.42, 5)], [wb, c(1.46, 6)], [wb - 0.01, top(0.72)], [wb - 0.08, yr - 0.02], [wb * 0.5, yr + 0.02], [0, yr + 0.025]];
  };
  const glass = (z0, z1, k) => (k === 6 && z0 >= 1.25 && z1 <= 2.2) || (k >= 8 && z0 >= 1.8 && z1 <= 2.45);
  const col = (x, y, z, k) => {
    const d = 1.45 * (0.86 + hn(x, y, z, 2) * 0.1) * lerp(0.7, 1, sstep(0.3, 1.0, y)) * lerp(0.85, 1, soot(x, y, z, 4));   // 白漆：頂點色大於 1 把鏽鐵貼圖提亮
    if (k >= 4 && k <= 5 && z < 1.3) return [0.62 * d, 0.07 * d, 0.06 * d];   // 紅色腰帶
    return [d, d * 0.98, d * 0.95];
  };
  const L0 = loft({ z: zs, ring, glass, col });
  const dk = [0.16, 0.15, 0.14], dark = [box(2.2, 0.2, 5.4, 0, 0.3, 0, dk), box(0.35, 0.18, 0.05, -0.8, 0.95, 3.0, [0.1, 0.1, 0.1]), box(0.35, 0.18, 0.05, 0.8, 0.95, 3.0, [0.1, 0.1, 0.1]), box(1, 0.3, 0.04, 0, 0.8, 3.01, [0.08, 0.08, 0.08])];
  // 後門門縫、把手、車頂警示燈
  dark.push(box(0.03, 1.9, 0.02, 0, 1.35, -3.005, [0.1, 0.1, 0.1]), box(0.03, 1.8, 0.02, 1.215, 1.3, 1.0, [0.1, 0.1, 0.1]), box(0.03, 1.8, 0.02, -1.215, 1.3, 1.0, [0.1, 0.1, 0.1]));
  const metal = [box(1.3, 0.12, 0.22, 0, 2.66, 1.0, [0.9, 0.2, 0.15]), box(2.3, 0.16, 0.14, 0, 0.5, 3.04, [0.55, 0.55, 0.55]), box(2.3, 0.16, 0.14, 0, 0.5, -3.04, [0.55, 0.55, 0.55])];
  for (const a of AX) for (const s of [-1, 1]) { const w = wheel(s * 0.98, a, false, 0.2, s); metal.push(...w.rim); dark.push(...w.dark); dark.push(liner(s * 0.9, a, AR - 0.02, 0.4, 0.36)); }
  return (cache.van = { body: L0.body, dark: mergeC(dark), metal: mergeC(metal), glass: L0.glass });
}

// ---------------------------------------------------------------- 油桶（200 L，帶箍）
export function barrel() {
  if (cache.barrel) return cache.barrel;
  const b = cyl(0.29, 0.88, 18).translate(0, 0.44, 0);
  const rings = [0.22, 0.66].map((y) => new THREE.TorusGeometry(0.295, 0.018, 6, 20).rotateX(Math.PI / 2).translate(0, y, 0));
  const lid = cyl(0.27, 0.02, 18).translate(0, 0.885, 0);
  return (cache.barrel = { body: merge([b, lid]), metal: merge(rings) });
}

// ---------------------------------------------------------------- 飛彈架（四枚飛彈躺在支架上）
export function missileRack() {
  if (cache.rack) return cache.rack;
  const frame = [], mis = [], tips = [];
  for (const x of [-1.2, 1.2]) for (const z of [-1.3, 1.3]) frame.push(new THREE.BoxGeometry(0.08, 1.3, 0.08).translate(x, 0.65, z));
  for (const y of [0.5, 1.1]) for (const z of [-1.3, 1.3]) frame.push(new THREE.BoxGeometry(2.5, 0.08, 0.1).translate(0, y, z));
  for (const y of [0.72, 1.32]) for (const x of [-0.6, 0.6]) {
    mis.push(cyl(0.2, 3.2, 16).rotateX(Math.PI / 2).translate(x, y, 0));
    tips.push(new THREE.ConeGeometry(0.2, 0.55, 16).rotateX(Math.PI / 2).translate(x, y, 1.87));
    for (let k = 0; k < 4; k++) tips.push(new THREE.BoxGeometry(0.02, 0.22, 0.3).translate(0, 0.2, 0).rotateZ(k * Math.PI / 2).translate(x, y, -1.45));
  }
  for (const z of [-1.3, 1.3]) for (const y of [0.72, 1.32]) for (const x of [-0.6, 0.6]) {
    frame.push(new THREE.TorusGeometry(0.215, 0.025, 5, 12, Math.PI).rotateZ(Math.PI).translate(x, y, z));
    mis.push(cyl(0.205, 0.018, 16).rotateX(Math.PI / 2).translate(x, y, z));
  }
  return (cache.rack = { metal: merge(frame), body: merge(mis), dark: merge(tips) });
}

// ---------------------------------------------------------------- 機庫天車（橫跨寬度的兩根大樑＋吊車）
export function crane(span) {
  // 工字樑的腹板、翼緣和加勁肋，避免實心方樑。
  const beams = [];
  for (const z of [-1, 1]) {
    beams.push(new THREE.BoxGeometry(span, 0.82, 0.065).translate(0, 0, z));
    for (const y of [-0.45, 0.45]) beams.push(new THREE.BoxGeometry(span, 0.08, 0.55).translate(0, y, z));
    for (let x = -span / 2 + 0.5; x < span / 2; x += 3) beams.push(new THREE.BoxGeometry(0.045, 0.82, 0.48).translate(x, 0, z));
  }
  const ties = []; for (let x = -span / 2 + 1; x < span / 2; x += 2.5) ties.push(new THREE.BoxGeometry(0.12, 0.12, 2).translate(x, -0.4, 0));
  const trolley = [new THREE.BoxGeometry(2.4, 0.22, 2.6).translate(4, -0.58, 0), cyl(0.38, 1.8, 16).rotateZ(Math.PI / 2).translate(4, -1.0, 0)];
  for (const z of [-1, 1]) for (const x of [3.15, 4.85]) trolley.push(cyl(0.22, 0.22, 12).rotateX(Math.PI / 2).translate(x, -0.58, z));
  const cables = [-0.3, 0.3].map((z) => cyl(0.025, 9, 6).translate(4, -6, z));
  const hook = [new THREE.BoxGeometry(0.9, 0.5, 0.6).translate(4, -10.6, 0), new THREE.TorusGeometry(0.25, 0.07, 6, 12, Math.PI * 1.4).translate(4, -11.1, 0)];
  return { hazard: merge(beams), metal: merge([...ties, ...cables, ...hook]), dark: merge(trolley) };
}

// 病床隔簾：沿 z 方向的一片布，有一道道直的皺褶（y 從 0 到 h）
export function curtain(len, h) {
  const key = 'cur' + len + h; if (cache[key]) return cache[key];
  const g = new THREE.PlaneGeometry(len, h, 48, 1).rotateY(Math.PI / 2).translate(0, h / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); p.setX(i, Math.sin(z * 9.5) * 0.045 + Math.sin(z * 3.1 + 1) * 0.02 + (1 - y / h) * Math.sin(z * 5) * 0.015); }
  g.computeVertexNormals(); return (cache[key] = g);
}

// 張力帆布：中央下垂、邊緣皺褶；靜態幾何合併到場景。
export function canopy() {
  if (cache.canopy) return cache.canopy;
  const g = new THREE.PlaneGeometry(2.7, 1.6, 18, 10).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), edge = Math.abs(z) / 0.8;
    p.setY(i, 0.12 - 0.18 * (1 - x * x / (1.35 * 1.35)) + Math.sin(x * 17 + z * 3) * 0.025 * edge);
  }
  g.computeVertexNormals(); return (cache.canopy = g);
}

// ---------------------------------------------------------------- 工具車（紅色抽屜櫃）
export function toolCart() {
  if (cache.cart) return cache.cart;
  const box = new THREE.BoxGeometry(0.6, 0.9, 1.0).translate(0, 0.55, 0);
  const dr = []; for (let i = 0; i < 5; i++) dr.push(new THREE.BoxGeometry(0.62, 0.02, 0.9).translate(0, 0.25 + i * 0.16, 0));
  const wh = []; for (const x of [-0.24, 0.24]) for (const z of [-0.4, 0.4]) wh.push(cyl(0.07, 0.05, 10).rotateZ(Math.PI / 2).translate(x, 0.07, z));
  return (cache.cart = { red: box, metal: merge(dr), dark: merge(wh) });
}

// ---------------------------------------------------------------- 體積光錐（假的光束：加法混色、邊緣淡出）
export function lightCone(len, r0, r1, color, opacity = 0.12) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true).translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(color) }, op: { value: opacity }, len: { value: len } },
    vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY = -position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 col; uniform float op, len; varying float vY; varying vec3 vN, vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float fall = 1.0 - smoothstep(0.0, len, vY); gl_FragColor = vec4(col * op * edge * fall, 1.0); }',
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.noAO = true; mesh.renderOrder = 3;
  return mesh;
}

// ---------------------------------------------------------------- 遠方的濃煙柱（城裡其他地方在燒）：一片片面向鏡頭的長條，雜訊往上捲；全部一個網格、一次畫完
//   list：[[x, 底部 y, z, 寬, 高], ...]；霧照一般材質算（離越遠越淡）
export function smokePlumes(list) {
  const P = [], B = [], S = [], I = [];
  list.forEach(([x, y, z, w, h], i) => {
    const k = P.length / 3;
    for (const [u, v] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) { P.push(u, v, 0); B.push(x, y, z); S.push(w, h, i * 0.137); }
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('base', new THREE.Float32BufferAttribute(B, 3)); g.setAttribute('prm', new THREE.Float32BufferAttribute(S, 3)); g.setIndex(I);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { noise: { value: null }, time: { value: 0 } }]),
    vertexShader: `attribute vec3 base, prm; varying vec2 vUv; varying float vSeed, vDist;
      void main() {
        vec3 to = cameraPosition - base; to.y = 0.0; vec3 rt = normalize(vec3(to.z, 0.0, -to.x));
        float v = position.y, wid = prm.x * (0.55 + 0.9 * v * v);
        vec3 transformed = base + rt * position.x * wid + vec3(0.0, v * prm.y, 0.0) + vec3(0.26, 0.0, 0.1) * v * v * prm.y;   // 往上散開、被風吹斜
        vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        vUv = vec2(position.x, v); vSeed = prm.z; vDist = length(transformed - cameraPosition);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `uniform sampler2D noise; uniform float time; uniform vec3 fogColor; uniform float fogDensity; varying vec2 vUv; varying float vSeed, vDist;
      void main() {
        float t = time * 0.012, v = vUv.y;
        float n = texture2D(noise, vec2(vUv.x * 0.45 + vSeed, v * 0.6 - t)).r * 0.6 + texture2D(noise, vec2(vUv.x * 0.28 - vSeed * 3.0, v * 0.38 - t * 0.5)).b * 0.4;
        float edge = 1.0 - smoothstep(0.08, 0.5, abs(vUv.x) + (n - 0.5) * 0.4);
        float a = edge * smoothstep(0.0, 0.05, v) * (1.0 - smoothstep(0.45, 1.0, v)) * smoothstep(0.18, 0.42, n + (1.0 - v) * 0.22);
        vec3 c = mix(vec3(0.04, 0.036, 0.032), vec3(0.17, 0.155, 0.14), v) * (0.75 + n * 0.5);
        c = mix(c, fogColor, (1.0 - exp(-vDist * fogDensity * 0.35)) * 0.8);   // 霧只算一部分：煙柱在高空，不然整柱被霧洗白
        gl_FragColor = vec4(c, min(1.0, a * 1.15));
      }`,
  });
  m.uniforms.noise.value = grimeTex();
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.userData.noAO = true; mesh.name = 'plumes';
  mesh.onBeforeRender = () => { m.uniforms.time.value = performance.now() / 1000; };
  return mesh;
}

// ---------------------------------------------------------------- 積水（深色、光滑，反射天空）
export function puddleMat() {
  if (cache.pm) return cache.pm;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return (cache.pm = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.05, metalness: 0.0, alphaMap: t, transparent: true, depthWrite: false, envMapIntensity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }));   // 反光壓低：黃昏的積水不該像一面白鏡子
}

// ---------------------------------------------------------------- 水泥碎塊：扭曲的多面體（不是方塊），幾種形狀輪流用
const CHUNKS = [];
export function chunk(i) {
  if (!CHUNKS.length) {
    for (let k = 0; k < 6; k++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const P = g.attributes.position, v = new THREE.Vector3();
      const sx = 0.8 + Math.random() * 0.6, sy = 0.35 + Math.random() * 0.35, sz = 0.7 + Math.random() * 0.6;
      const cuts = [0, 1, 2].map(() => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize());
      for (let j = 0; j < P.count; j++) {
        v.fromBufferAttribute(P, j);
        // 平面切掉幾刀（斷面）＋一點雜訊
        for (const c of cuts) { const d = v.dot(c); if (d > 0.55) v.addScaledVector(c, 0.55 - d); }
        const n = 1 + (Math.sin(v.x * 7.1 + k) * Math.sin(v.y * 5.3) * Math.sin(v.z * 6.7 + k * 2)) * 0.12;
        v.multiplyScalar(n); v.x *= sx; v.y *= sy; v.z *= sz;
        P.setXYZ(j, v.x, v.y, v.z);
      }
      const ng = g.index ? g.toNonIndexed() : g.clone(); ng.computeVertexNormals();   // 平面著色：斷面清楚
      ng.translate(0, sy * 0.6, 0);
      CHUNKS.push(ng);
    }
  }
  return CHUNKS[i % CHUNKS.length];
}
// 鋼筋（從碎塊裡伸出來）
export function rebar(len) { return new THREE.CylinderGeometry(0.012, 0.012, len, 5).translate(0, len / 2, 0); }
// 沿軸的圓管
export function pipeGeo(len, r) { return new THREE.CylinderGeometry(r, r, len, 12, 1, true); }
