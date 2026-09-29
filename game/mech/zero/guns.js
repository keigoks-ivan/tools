// 槍械模型（全部程序生成，同材質合併成一個網格，每把 4～6 個 draw call）
//   座標：原點＝槍托底，+Z＝槍口方向，+Y＝上，+X＝左（和人物一樣：右手在 −X）
//   userData：muzzle 槍口、gripR/gripL 雙手手腕位置、scopeEye 瞄準鏡後端、glow 能量發光材質、ammoBar 彈量燈
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detailMaps } from '../textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- 幾何積木
const rbox = (w, h, d, r = 0.004, x = 0, y = 0, z = 0, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)).translate(x, y, z);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// 沿 Z 的圓柱：r0＝後端、r1＝前端
const cylZ = (r0, r1, len, z0, seg = 20, x = 0, y = 0, open = false) => new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).rotateX(Math.PI / 2).translate(x, y, z0 + len / 2);
// 側面輪廓（z, y 座標的點）擠出成寬 w 的厚板，帶倒角
function prism(pts, w, bev = 0.003, holes = [], x = 0) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, w - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 8 });
  g.rotateY(-Math.PI / 2);   // 輪廓的 x→Z、擠出方向→−X
  g.computeBoundingBox();
  const c = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
  return g.translate(x - c, 0, 0);
}
function merge(list) {
  const gs = list.map((g) => { let n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; });
  const m = mergeGeometries(gs, false);
  m.computeBoundingSphere();
  return m;
}
const rotX = (g, a, y = 0, z = 0) => g.translate(0, -y, -z).rotateX(a).translate(0, y, z);

// ---------------------------------------------------------------- 材質
const tex = {};
function decalTex(lines, w = 512, h = 128, color = '#1a1d22', bg = null) {
  const key = lines.join('|') + color + w + h;
  if (tex[key]) return tex[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.fillStyle = color;
  let y = 6;
  for (const [txt, size, weight = 700] of lines) {
    x.font = `${weight} ${size}px Rajdhani, "Arial Narrow", Arial, sans-serif`;
    x.textBaseline = 'top';
    x.fillText(txt, 8, y);
    y += size * 1.05;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return (tex[key] = t);
}
// 警示斜紋
function hazardTex() {
  if (tex.hz) return tex.hz;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#d9a62c'; x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#16181b';
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 8, 32); x.lineTo(i * 16 + 20, 0); x.lineTo(i * 16 + 12, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (tex.hz = t);
}

// 共用照片 PBR 的三面投影；零件座標固定，武器移動時紋理不會游移。
function gunSurface(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.gunWear = { value: detailMaps().paint };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 gunP, gunN;').replace('#include <begin_vertex>', '#include <begin_vertex>\ngunP = position; gunN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D gunWear; varying vec3 gunP, gunN;
      vec3 gunTri(vec3 p, vec3 n) {
        vec3 w = pow(abs(n), vec3(4.0)); w /= max(w.x+w.y+w.z, 0.0001);
        return texture2D(gunWear,p.yz*8.0).rgb*w.x + texture2D(gunWear,p.xz*8.0+0.31).rgb*w.y + texture2D(gunWear,p.xy*8.0+0.67).rgb*w.z;
      }`).replace('#include <color_fragment>', `#include <color_fragment>
      vec3 wear = gunTri(gunP, normalize(gunN));
      diffuseColor.rgb *= 0.82 + 0.36 * wear.r;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (wear.g - 0.5) * 0.24, 0.23, 0.98);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
      vec3 rx = cross(dy, normal), ry = cross(normal, dx);
      float det = dot(dx, rx);
      normal = normalize(abs(det)*normal - sign(det)*(dFdx(wear.r)*rx+dFdy(wear.r)*ry)*0.00016);`);
  };
  return m;
}
// 彈量格仍保留各格顏色介面，實際以一批實例繪製。
function ammoLights(parent, count, geometry, material, position) {
  const mesh = new THREE.InstancedMesh(geometry, material.clone(), count), matrix = new THREE.Matrix4();
  mesh.material.color.set(0xffffff); mesh.castShadow = false;
  const bars = [];
  for (let i = 0; i < count; i++) {
    matrix.makeTranslation(...position(i)); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, material.color);
    bars.push({ material: { color: material.color.clone() } });
  }
  parent.add(mesh); return { bars, mesh };
}

const MATS = {};
function mats(faction) {
  if (MATS[faction]) return MATS[faction];
  const gov = faction === 'gov';
  const M = {
    // 真槍的配色：霧面石墨灰聚合物＋槍管鋼＋一點聯邦深藍
    shell: new THREE.MeshPhysicalMaterial({ color: gov ? 0x4a4f54 : 0x3d4432, roughness: gov ? 0.55 : 0.68, metalness: 0.15, clearcoat: gov ? 0.12 : 0, clearcoatRoughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: gov ? 0x191b1e : 0x1b1c1a, roughness: 0.72, metalness: 0.25 }),
    accent: new THREE.MeshStandardMaterial({ color: gov ? 0x26324a : 0x2c3122, roughness: 0.6, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: gov ? 0x5f646a : 0x55595c, roughness: 0.38, metalness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: gov ? 0x7e2328 : 0x86601c, roughness: 0.55, metalness: 0.05 }),
    glow: new THREE.MeshBasicMaterial({ color: gov ? new THREE.Color(0.35, 2.0, 3.2) : new THREE.Color(3.2, 0.35, 0.15) }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x06090d, roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4, emissive: new THREE.Color(0.006, 0.01, 0.012) }),
  };
  for (const k of ['shell', 'dark', 'accent', 'metal', 'red']) gunSurface(M[k]);
  M.glowBase = M.glow.color.clone();
  return (MATS[faction] = M);
}

function assemble(parts, M, decals = []) {
  const g = new THREE.Group();
  for (const k of Object.keys(parts)) {
    if (!parts[k].length) continue;
    const mesh = new THREE.Mesh(merge(parts[k]), M[k]);
    mesh.castShadow = k !== 'glow' && k !== 'glass';
    mesh.receiveShadow = true;
    mesh.name = k;
    g.add(mesh);
  }
  for (const d of decals) g.add(d);
  return g;
}
function decal(texture, w, h, x, y, z, side = 1, color = 0xffffff) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, color }));
  m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
}

// ---------------------------------------------------------------- XLR-7「破城弩」雷射長槍（自己的）
// 彈量燈：8 格，在彈匣左側
export function makeRifle(o = {}) {
  const base = mats('gov'), M = { ...base, glow: base.glow.clone() };
  const P = { shell: [], dark: [], accent: [], metal: [], red: [], glow: [], glass: [] };
  const W = 0.058;
  // 槍托：鏤空骨架托（拇指孔）
  P.shell.push(prism([[0.02, -0.075], [0.02, 0.05], [0.07, 0.062], [0.25, 0.062], [0.27, 0.04], [0.27, -0.03], [0.2, -0.06], [0.1, -0.085], [0.04, -0.09]], 0.034, 0.004,
    [[[0.09, -0.05], [0.18, -0.035], [0.215, -0.02], [0.215, 0.012], [0.09, 0.012]]]));
  P.dark.push(rbox(0.046, 0.15, 0.028, 0.008, 0, -0.018, 0.012));                 // 槍托底墊（橡膠）
  for (let i = 0; i < 5; i++) P.metal.push(box(0.047, 0.003, 0.03, 0, -0.07 + i * 0.03, 0.012));
  P.accent.push(rbox(0.042, 0.022, 0.13, 0.006, 0, 0.074, 0.15));                // 貼腮板
  P.dark.push(rbox(0.012, 0.012, 0.1, 0.002, 0, 0.066, 0.15));
  // 機匣：側面輪廓（白殼）＋中間深色腰帶（分件縫）
  P.shell.push(prism([[0.24, -0.042], [0.24, 0.05], [0.27, 0.068], [0.63, 0.068], [0.66, 0.05], [0.66, -0.03], [0.62, -0.05], [0.44, -0.05], [0.4, -0.042]], W, 0.005));
  P.dark.push(box(W + 0.004, 0.012, 0.4, 0, 0.006, 0.45));
  P.dark.push(box(W + 0.003, 0.004, 0.36, 0, 0.042, 0.45));
  P.accent.push(rbox(W + 0.006, 0.026, 0.12, 0.004, 0, -0.022, 0.56));            // 能量艙蓋（深藍）
  P.red.push(box(W + 0.007, 0.006, 0.05, 0, 0.03, 0.3));                          // 紅色識別條
  // 退殼口位置：散熱格柵
  for (let i = 0; i < 6; i++) P.dark.push(box(0.004, 0.028, 0.008, -W / 2 - 0.001, 0.028, 0.5 + i * 0.016));
  for (let i = 0; i < 6; i++) P.dark.push(box(0.004, 0.028, 0.008, W / 2 + 0.001, 0.028, 0.5 + i * 0.016));
  // 螺絲
  for (const [y, z] of [[0.05, 0.28], [0.05, 0.62], [-0.03, 0.28], [-0.03, 0.62], [0.05, 0.44]]) for (const s of [-1, 1]) P.metal.push(cylZ(0.004, 0.004, 0.003, 0, 8).rotateY(Math.PI / 2).translate(s * (W / 2 + 0.002), y, z));
  // 拉柄、拋殼窗與保險撥片，沿機匣合併。
  P.dark.push(rbox(0.004, 0.027, 0.082, 0.004, -0.032, 0.028, 0.415));
  P.metal.push(rbox(0.008, 0.018, 0.063, 0.003, -0.034, 0.028, 0.42));
  P.metal.push(cylZ(0.005, 0.005, 0.029, 0, 8).rotateY(Math.PI / 2).translate(0.029, 0.028, 0.55));
  P.dark.push(rbox(0.016, 0.012, 0.032, 0.003, 0.054, 0.028, 0.55));
  P.metal.push(rbox(0.007, 0.009, 0.027, 0.002, 0.034, -0.02, 0.31));
  // 上方導軌＋齒
  P.metal.push(box(0.024, 0.01, 0.4, 0, 0.074, 0.45));
  for (let i = 0; i < 20; i++) P.metal.push(box(0.028, 0.005, 0.009, 0, 0.081, 0.265 + i * 0.019));
  // 握把（手指凹槽）＋扳機護弓＋扳機
  const grip = prism([[0.3, -0.04], [0.37, -0.04], [0.365, -0.07], [0.372, -0.09], [0.366, -0.11], [0.374, -0.13], [0.37, -0.16], [0.34, -0.17], [0.305, -0.165], [0.29, -0.12], [0.285, -0.06]], 0.034, 0.006);
  P.dark.push(rotX(grip, -0.12, -0.04, 0.33));
  for (let i = 0; i < 6; i++) P.accent.push(rotX(box(0.036, 0.004, 0.035, 0, -0.07 - i * 0.015, 0.325), -0.12, -0.04, 0.33));
  P.dark.push(prism([[0.36, -0.045], [0.45, -0.045], [0.45, -0.052], [0.43, -0.09], [0.365, -0.09], [0.365, -0.083], [0.425, -0.083], [0.44, -0.052], [0.36, -0.052]], 0.012, 0.001));
  P.metal.push(rotX(rbox(0.008, 0.032, 0.008, 0.003, 0, -0.064, 0.4), 0.25, -0.05, 0.4));
  // 能量彈匣：略前傾，側面彈量燈
  // 彈匣是獨立的一組（換彈時會拔下來）：原點＝彈匣口 (0, -0.05, 0.5)，往下前傾 0.12
  const Q = { accent: [], metal: [], dark: [], glow: [] };
  Q.accent.push(rbox(0.046, 0.13, 0.06, 0.006, 0, -0.055, 0));
  Q.metal.push(rbox(0.05, 0.012, 0.064, 0.003, 0, -0.122, 0));
  Q.dark.push(box(0.048, 0.09, 0.012, 0, -0.05, -0.024));
  Q.glow.push(box(0.03, 0.004, 0.066, 0, -0.1, 0));
  const mag = assemble(Q, M);
  mag.position.set(0, -0.05, 0.5); mag.rotation.x = 0.12;
  const lights = ammoLights(mag, 8, new THREE.BoxGeometry(0.003, 0.0085, 0.03), M.glow, (i) => [0.0245, -0.018 - i * 0.011, 0.006]);
  // 護木：前端八角殼分段，縫隙看得到裡面的發光線圈
  P.dark.push(cylZ(0.03, 0.03, 0.4, 0.64, 8));
  P.glow.push(cylZ(0.021, 0.021, 0.36, 0.66, 12));
  for (let i = 0; i < 6; i++) {
    const z = 0.66 + i * 0.058;
    P.shell.push(rbox(0.072, 0.034, 0.05, 0.006, 0, 0.028, z + 0.025));
    P.shell.push(rbox(0.072, 0.03, 0.05, 0.006, 0, -0.03, z + 0.025));
    for (const side of [-1, 1]) {
      P.metal.push(rbox(0.003, 0.018, 0.008, 0.001, side * 0.034, 0, z + 0.005));
      P.dark.push(rbox(0.004, 0.006, 0.041, 0.002, side * 0.035, -0.013, z + 0.025));
    }
    if (i % 2 === 0) P.red.push(box(0.074, 0.004, 0.02, 0, 0.046, z + 0.025));
  }
  P.accent.push(rbox(0.076, 0.016, 0.34, 0.004, 0, -0.05, 0.83));   // 下導軌蓋
  P.metal.push(box(0.022, 0.008, 0.34, 0, 0.049, 0.83));             // 上導軌延伸
  // 摺疊腳架
  for (const s of [-1, 1]) { P.metal.push(cylZ(0.005, 0.005, 0.24, 0.72, 8, s * 0.014, -0.064)); P.dark.push(rbox(0.014, 0.016, 0.02, 0.004, s * 0.014, -0.064, 0.97)); }
  P.metal.push(rbox(0.05, 0.016, 0.03, 0.004, 0, -0.062, 0.7));
  // 槍管／發射器
  P.metal.push(cylZ(0.017, 0.015, 0.2, 1.0, 20));
  P.dark.push(cylZ(0.026, 0.026, 0.04, 1.02, 16));
  for (let i = 0; i < 4; i++) P.dark.push(cylZ(0.021, 0.021, 0.008, 1.08 + i * 0.022, 16));
  P.glow.push(cylZ(0.0165, 0.0165, 0.07, 1.085, 12));
  P.metal.push(cylZ(0.026, 0.024, 0.045, 1.19, 24));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.dark.push(rbox(0.008, 0.012, 0.03, 0.002, Math.cos(a) * 0.022, Math.sin(a) * 0.022, 1.245).rotateZ(0)); }
  P.glow.push(cylZ(0.011, 0.011, 0.004, 1.232, 16));
  // 纜線：彈匣 → 護木
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.026, -0.04, 0.53), new THREE.Vector3(-0.034, -0.05, 0.6), new THREE.Vector3(-0.038, -0.03, 0.67), new THREE.Vector3(-0.037, -0.01, 0.72)]);
  P.dark.push(new THREE.TubeGeometry(cable, 16, 0.005, 6));
  // 瞄準鏡：鏡管、目鏡、物鏡、旋鈕、鏡座、測距器
  const SY = 0.122;
  P.dark.push(cylZ(0.02, 0.02, 0.26, 0.35, 24, 0, SY));
  P.dark.push(cylZ(0.026, 0.021, 0.07, 0.29, 24, 0, SY));
  P.metal.push(cylZ(0.027, 0.027, 0.012, 0.29, 24, 0, SY));
  P.dark.push(cylZ(0.021, 0.033, 0.06, 0.6, 24, 0, SY));
  P.shell.push(cylZ(0.034, 0.034, 0.03, 0.655, 24, 0, SY));
  P.metal.push(cylZ(0.0345, 0.0345, 0.004, 0.66, 24, 0, SY));
  P.glass.push(cylZ(0.029, 0.029, 0.002, 0.684, 24, 0, SY));
  P.glass.push(cylZ(0.021, 0.021, 0.002, 0.287, 20, 0, SY));
  P.metal.push(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 16).translate(0, SY + 0.03, 0.47));
  P.metal.push(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 16).rotateZ(Math.PI / 2).translate(0.031, SY, 0.47));
  P.red.push(new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, 16).translate(0, SY + 0.037, 0.47));
  for (const z of [0.4, 0.56]) { P.dark.push(rbox(0.03, 0.036, 0.022, 0.004, 0, 0.098, z)); P.dark.push(cylZ(0.024, 0.024, 0.02, z - 0.01, 20, 0, SY)); }
  P.accent.push(rbox(0.022, 0.03, 0.08, 0.004, -0.036, SY - 0.005, 0.45));
  P.glass.push(cylZ(0.008, 0.008, 0.002, 0.49, 12, -0.036, SY - 0.005));
  P.glow.push(box(0.002, 0.004, 0.012, -0.0475, SY + 0.004, 0.43));
  // 貼花
  const decals = [
    decal(decalTex([['XLR-7  ARBALEST', 58], ['FEDERAL ARMORY  S/N 0417-2209', 26, 600]], 512, 128, '#1b2029'), 0.15, 0.037, W / 2 + 0.0035, -0.022, 0.38, 1),
    decal(decalTex([['CAUTION', 40], ['HIGH ENERGY  DO NOT OPEN', 30, 600]], 512, 128, '#1b2029'), 0.09, 0.022, -W / 2 - 0.0035, 0.042, 0.33, -1),
    decal(hazardTex(), 0.05, 0.012, -0.0375, -0.03, 0.76, -1),
    decal(hazardTex(), 0.05, 0.012, 0.0375, -0.03, 0.76, 1),
  ];
  const g = assemble(P, M, decals);
  g.add(mag);
  g.userData = {
    mag, magHome: mag.position.clone(),
    kind: 'rifle', muzzle: new THREE.Vector3(0, 0, 1.25), scopeEye: new THREE.Vector3(0, SY, 0.2), scopeY: SY,
    // 手腕目標：右手在握把後上方，左手在護木下
    gripR: new THREE.Vector3(-0.002, -0.028, 0.285), gripL: new THREE.Vector3(0.028, -0.064, 0.655),
    glow: M.glow, glowBase: M.glowBase, ammoBar: lights.bars, ammoInstances: lights.mesh,
  };
  return g;
}

// ---------------------------------------------------------------- XP-2 雷射手槍（自己的）
// 原點＝握把中心（手的位置），+Z 槍口
export function makePistol() {
  const base = mats('gov'), M = { ...base, glow: base.glow.clone() };
  const P = { shell: [], dark: [], accent: [], metal: [], red: [], glow: [], glass: [] };
  // 滑套（白殼）
  P.shell.push(prism([[-0.05, 0.02], [-0.05, 0.052], [-0.04, 0.062], [0.14, 0.062], [0.16, 0.05], [0.16, 0.02]], 0.03, 0.003));
  for (let i = 0; i < 7; i++) P.dark.push(box(0.032, 0.022, 0.003, 0, 0.042, -0.04 + i * 0.006));   // 後方防滑紋
  P.dark.push(box(0.031, 0.006, 0.12, 0, 0.034, 0.08));
  P.glow.push(box(0.0315, 0.003, 0.06, 0, 0.034, 0.08));                                           // 側面能量縫
  P.red.push(box(0.0315, 0.004, 0.012, 0, 0.056, 0.13));
  // 滑套開窗、抽殼鉤、拆卸銷。
  P.dark.push(rbox(0.018, 0.002, 0.037, 0.001, -0.004, 0.063, 0.059));
  P.metal.push(rbox(0.013, 0.003, 0.031, 0.001, -0.004, 0.064, 0.059));
  for (const z of [-0.015, 0.028]) P.metal.push(cylZ(0.0027, 0.0027, 0.032, 0, 8).rotateY(Math.PI / 2).translate(-0.016, 0.01, z));
  // 準星、照門
  P.dark.push(box(0.022, 0.008, 0.01, 0, 0.066, -0.04));
  P.dark.push(box(0.004, 0.008, 0.006, 0, 0.066, 0.14));
  P.glow.push(box(0.003, 0.003, 0.002, 0, 0.068, 0.144));
  for (const s of [-1, 1]) P.glow.push(box(0.003, 0.003, 0.002, s * 0.007, 0.069, -0.046));
  // 槍身框架＋握把
  P.dark.push(prism([[-0.035, 0.02], [0.15, 0.02], [0.15, -0.005], [0.06, -0.008], [0.045, -0.035], [0.035, -0.035], [0.03, -0.01], [0.0, -0.01], [0.012, -0.11], [-0.03, -0.115], [-0.045, -0.02]], 0.028, 0.004));
  P.accent.push(rotX(rbox(0.031, 0.075, 0.03, 0.004, 0, -0.06, -0.012), -0.2, -0.02, -0.01));
  for (let i = 0; i < 5; i++) P.dark.push(rotX(box(0.032, 0.003, 0.028, 0, -0.035 - i * 0.012, -0.01), -0.2, -0.02, -0.01));
  P.metal.push(rotX(rbox(0.03, 0.01, 0.042, 0.003, 0, -0.114, -0.014), -0.2, -0.02, -0.01));
  P.metal.push(rotX(rbox(0.006, 0.022, 0.006, 0.002, 0, -0.02, 0.035), 0.3, -0.01, 0.035));
  // 發射口
  P.metal.push(cylZ(0.012, 0.012, 0.03, 0.15, 16, 0, 0.04));
  P.glow.push(cylZ(0.008, 0.008, 0.002, 0.18, 12, 0, 0.04));
  P.dark.push(box(0.03, 0.012, 0.05, 0, 0.012, 0.12));
  const g = assemble(P, M, [decal(decalTex([['XP-2', 60], ['FED. ARMORY', 30, 600]], 256, 128, '#1b2029'), 0.04, 0.02, 0.0155, 0.04, 0.03, 1)]);
  const lights = ammoLights(g, 7, new THREE.BoxGeometry(0.002, 0.006, 0.006), M.glow, (i) => [-0.016, -0.03 - i * 0.009, -0.01 - i * 0.0018]);
  // 握把底的能量匣（換彈時抽出）
  const mag = assemble({ metal: [rbox(0.026, 0.07, 0.03, 0.003, 0, -0.035, 0)], glow: [box(0.027, 0.004, 0.02, 0, -0.012, 0)] }, M);
  mag.position.set(0, -0.08, -0.018); mag.rotation.x = -0.2;
  g.add(mag);
  g.userData = { mag, magHome: mag.position.clone(), kind: 'pistol', muzzle: new THREE.Vector3(0, 0.04, 0.185), sightY: 0.068, gripR: new THREE.Vector3(0.0, -0.035, -0.055), gripL: new THREE.Vector3(0.018, -0.07, -0.045), glow: M.glow, glowBase: M.glowBase, ammoBar: lights.bars, ammoInstances: lights.mesh };
  return g;
}

// ---------------------------------------------------------------- 敵軍：AR-9「獵犬」卡賓槍（塊狀、紅光）
const ENEMY = {};
export function makeEnemyRifle(kind = 'carbine') {
  if (!ENEMY[kind]) {
    const M = mats('hound');
    const P = { shell: [], dark: [], accent: [], metal: [], red: [], glow: [], glass: [] };
    const long = kind === 'sniper', heavy = kind === 'heavy';
    const L = long ? 1.3 : heavy ? 1.1 : 0.92;
    P.dark.push(rbox(0.045, 0.12, 0.2, 0.01, 0, -0.01, 0.1));                                    // 槍托
    P.shell.push(rbox(heavy ? 0.08 : 0.06, heavy ? 0.11 : 0.09, 0.36, 0.008, 0, 0.01, 0.35));   // 機匣
    P.dark.push(box(0.064, 0.012, 0.3, 0, 0.0, 0.35));
    P.dark.push(rotX(rbox(0.03, 0.1, 0.04, 0.006, 0, -0.07, 0.3), -0.15, -0.03, 0.3));          // 握把
    P.accent.push(rotX(rbox(heavy ? 0.07 : 0.045, heavy ? 0.12 : 0.1, heavy ? 0.12 : 0.07, 0.006, 0, -0.09, 0.45), 0.1, -0.03, 0.45)); // 彈匣
    P.glow.push(rotX(box(0.047, 0.006, 0.05, 0, -0.1, 0.45), 0.1, -0.03, 0.45));
    P.shell.push(cylZ(0.03, 0.03, L - 0.6, 0.53, 6));                                            // 護木
    P.dark.push(box(0.064, 0.015, L - 0.62, 0, 0, 0.53 + (L - 0.6) / 2));
    P.metal.push(cylZ(0.014, 0.012, 0.18, L - 0.1, 12));
    P.glow.push(cylZ(0.01, 0.01, 0.004, L + 0.078, 10));
    P.dark.push(cylZ(0.022, 0.022, 0.05, L - 0.1, 10));
    if (long || heavy) { P.dark.push(cylZ(0.022, 0.03, 0.25, 0.25, 16, 0, 0.09)); P.glass.push(cylZ(0.027, 0.027, 0.003, 0.5, 16, 0, 0.09)); P.dark.push(box(0.02, 0.03, 0.12, 0, 0.065, 0.38)); }
    else { P.dark.push(rbox(0.03, 0.035, 0.07, 0.004, 0, 0.074, 0.36)); P.glow.push(box(0.02, 0.02, 0.002, 0, 0.078, 0.324)); }
    if (heavy) { P.accent.push(cylZ(0.05, 0.05, 0.12, 0.42, 12, 0, -0.1)); for (let i = 0; i < 3; i++) P.metal.push(cylZ(0.009, 0.009, 0.3, 0.8, 8, Math.cos(i * 2.1) * 0.016, Math.sin(i * 2.1) * 0.016)); }
    ENEMY[kind] = { P, M, L };
  }
  const { P, M, L } = ENEMY[kind];
  if (!ENEMY[kind].geo) ENEMY[kind].geo = Object.fromEntries(Object.entries(P).filter(([, v]) => v.length).map(([k, v]) => [k, merge(v)]));
  const g = new THREE.Group();
  for (const [k, geo] of Object.entries(ENEMY[kind].geo)) { const m = new THREE.Mesh(geo, M[k]); m.castShadow = k !== 'glow'; g.add(m); }
  g.userData = { kind, muzzle: new THREE.Vector3(0, 0, L + 0.09) };
  return g;
}

export function glowMat(faction) { return mats(faction).glow; }
