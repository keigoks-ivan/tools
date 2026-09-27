// 駕駛艙：玩家坐在機體胸口的全景球形螢幕艙裡（四周整圈都是螢幕，映出外面的景色）。
// 看得到：前方低矮儀表台（雷達、機體狀態、武裝三塊螢幕）、兩側立柱小螢幕、兩支操縱桿和戴手套的雙手、螢幕面板之間的接縫。
// 艙內光線＝螢幕映出的外面（夕陽方向）＋儀表光＋警示燈＋開火閃光。
// 鏡頭：跟著胸口走；飛行員的頭坐在「彈簧」上——落腳、落地、中彈時頭晚一拍，整個艙在眼前晃。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0), ORIGIN = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();

// 方位角 a（往右為正）、仰角 e（往上為正）、距離 d → 座標（眼睛在原點、面向 −Z）
function sph(a, e, d, out = new THREE.Vector3()) {
  return out.set(d * Math.cos(e) * Math.sin(a), d * Math.sin(e), -d * Math.cos(e) * Math.cos(a));
}
// 朝向眼睛的座標系（+Z 指向眼睛）
function facing(a, e, d) {
  const c = sph(a, e, d);
  return new THREE.Matrix4().lookAt(ORIGIN, c, UP).setPosition(c);
}
const rb = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2) - 1e-4));
const cyl = (r, h, n = 14) => new THREE.CylinderGeometry(r, r, h, n);

// 零件收集：同材質合併成一個網格（少 draw call）
class Parts {
  constructor() { this.by = new Map(); this.base = null; }
  addM(mat, g, m) {
    if (g.index) g = g.toNonIndexed();
    if (m) g.applyMatrix4(m);
    if (this.base) g.applyMatrix4(this.base);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return g;
  }
  add(mat, g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')), _s.set(scl[0], scl[1], scl[2]));
    return this.addM(mat, g, _m);
  }
  // 兩點之間的膠囊／錐管（手指、手腕、袖子）
  seg(mat, a, b, r, r2 = null) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = r2 === null ? new THREE.CapsuleGeometry(r, Math.max(1e-3, L), 4, 12) : new THREE.CylinderGeometry(r2, r, L, 14);
    _m.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q.setFromUnitVectors(UP, d.divideScalar(L)), _s.set(1, 1, 1));
    return this.addM(mat, g, _m);
  }
  build(parent) {
    for (const [mat, list] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = mesh.receiveShadow = !!mat.isMeshStandardMaterial && !mat.transparent;
      parent.add(mesh);
    }
    this.by.clear();
    return parent;
  }
}

// 沿水平弧線掃出剖面（prof＝[[離眼水平距離, 高度], ...]；a0..a1＝方位角）
function sweep(prof, a0, a1, segs) {
  const n = prof.length, pos = [], uv = [], idx = [];
  const vl = [0];
  for (let i = 1; i < n; i++) vl.push(vl[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  for (let s = 0; s <= segs; s++) {
    const a = a0 + (a1 - a0) * s / segs, sa = Math.sin(a), ca = Math.cos(a);
    for (let i = 0; i < n; i++) { const [r, y] = prof[i]; pos.push(r * sa, y, -r * ca); uv.push(a * 2.5, vl[i] * 2.5); }
  }
  for (let s = 0; s < segs; s++) for (let i = 0; i < n - 1; i++) {
    const a = s * n + i, b = a + n;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 球面上的細帶（螢幕面板接縫）
function ribbon(points, dirs, w) {
  const pos = [], idx = [];
  points.forEach((c, i) => {
    const t = dirs[i];
    pos.push(c.x + t.x * w / 2, c.y + t.y * w / 2, c.z + t.z * w / 2, c.x - t.x * w / 2, c.y - t.y * w / 2, c.z - t.z * w / 2);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- 程序貼圖
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// 金屬／塗裝表面的細刮痕與髒污（粗糙度＋凹凸）
function grungeTex() {
  const S = 256, [c, x] = canvas(S, S), r = rng(11);
  const img = x.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const v = 150 + (r() - 0.5) * 34; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 90; k++) {
    x.strokeStyle = `rgba(${r() < 0.5 ? 210 : 90},${r() < 0.5 ? 210 : 90},${r() < 0.5 ? 210 : 90},${0.15 + r() * 0.3})`;
    x.lineWidth = 0.5 + r();
    const x0 = r() * S, y0 = r() * S, a = r() * Math.PI, l = 8 + r() * 50;
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); x.stroke();
  }
  for (let k = 0; k < 25; k++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(60,60,60,0.35)'); g.addColorStop(1, 'rgba(60,60,60,0)');
    x.save(); x.translate(r() * S, r() * S); x.scale(10 + r() * 30, 10 + r() * 30); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// 手套／布料的細紋
function fabricTex() {
  const S = 128, [c, x] = canvas(S, S), r = rng(5);
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = 140 + 30 * Math.sin(i * 1.6) * Math.sin(j * 1.6) + (r() - 0.5) * 40;
    const p = (j * S + i) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
// 窗玻璃上的污漬、雨痕、刮痕（黑底＝透明，加亮混合）
function dirtTex() {
  const S = 512, [c, x] = canvas(S, S), r = rng(29);
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 60; k++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const a = 0.05 + r() * 0.12;
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.translate(r() * S, r() * S); x.rotate(r() * 3); x.scale(8 + r() * 50, 6 + r() * 30); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  x.lineCap = 'round';
  for (let k = 0; k < 140; k++) {   // 雨痕：往下流、會稍微歪
    let px = r() * S, py = r() * S;
    x.strokeStyle = `rgba(255,255,255,${0.06 + r() * 0.16})`; x.lineWidth = 0.8 + r() * 1.6;
    x.beginPath(); x.moveTo(px, py);
    const n = 3 + r() * 8;
    for (let i = 0; i < n; i++) { px += (r() - 0.5) * 4; py += 4 + r() * 10; x.lineTo(px, py); }
    x.stroke();
  }
  for (let k = 0; k < 40; k++) {    // 細刮痕
    x.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.25})`; x.lineWidth = 0.6;
    const x0 = r() * S, y0 = r() * S, a = r() * Math.PI, l = 10 + r() * 60;
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.9, 0.9);
  return t;
}
// 小標示字（印在面板上）
const LABELS = ['RADAR', 'RNG 600', 'STATUS', 'ARMS', 'FCS', 'SPD', 'ALT', 'EN CELL', 'BALANCER', 'CAUTION', 'XG-01', 'MSL ARM', 'SYS 1', 'SYS 2', 'IFF', 'COMM', 'HOT', 'VENT', 'GEN', 'LINK'];
function labelTex() {
  const W = 1024, H = 256, [c, x] = canvas(W, H);
  const rect = {};
  x.font = '700 30px Rajdhani, "Arial Narrow", sans-serif';
  x.textBaseline = 'middle';
  let px = 6, py = 4;
  for (const s of LABELS) {
    const w = Math.ceil(x.measureText(s).width) + 14;
    if (px + w > W) { px = 6; py += 42; }
    const warn = s === 'CAUTION' || s === 'HOT';
    if (warn) { x.fillStyle = '#d9a21a'; x.fillRect(px, py, w, 36); x.fillStyle = '#111'; }
    else x.fillStyle = s === 'XG-01' ? '#e8ecef' : '#b9c3c8';
    x.fillText(s, px + 7, py + 19);
    rect[s] = [px, py, w, 36];
    px += w + 8;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, rect, W, H };
}
function atlasPlane(w, h, r, W, H) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (r[0] + u * r[2]) / W, 1 - (r[1] + (1 - v) * r[3]) / H);
  }
  return g;
}

// 螢幕圖集（1024×1024）上的區域
const SCR = {
  radar: [0, 0, 512, 512], status: [512, 0, 512, 384], arms: [512, 384, 512, 384], spd: [0, 512, 256, 256], alt: [256, 512, 256, 256],
  sys: [0, 768, 256, 256], gauge: [256, 768, 256, 256], bars: [512, 768, 512, 128], wave: [512, 896, 512, 128],
};
// 窗戶輪廓（z＝−1 平面上的座標，x 往右、y 往上）：上寬下窄，跟參考圖一樣
const WIN = [[-0.64, 0.5], [0.64, 0.5], [0.82, 0.06], [0.46, -0.95], [-0.46, -0.95], [-0.82, 0.06]];
const ZW = 1.1;   // 窗戶離眼睛的距離（公尺）
const tp = (x, y, z = ZW) => new THREE.Vector3(x * z, y * z, -z);
function offsetPoly(poly, d) {   // 凸多邊形往外擴 d
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const n1 = new THREE.Vector2(a[1] - p[1], p[0] - a[0]).normalize(), n2 = new THREE.Vector2(p[1] - b[1], b[0] - p[0]).normalize();
    const m = n1.clone().add(n2).normalize(), k = d / Math.max(0.3, m.dot(n1));
    out.push([p[0] + m.x * k, p[1] + m.y * k]);
  }
  return out;
}
const shapeOf = (poly, s = 1) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x * s, y * s)));
const COL = { bg: '#02070a', grid: '#0b2830', dim: '#1f6f7c', cy: '#6ff0ff', wh: '#e6f6f8', am: '#ffb347', rd: '#ff4a3a', pk: '#ff6fd0', gr: '#6dff9a' };

// ---------------------------------------------------------------- 駕駛艙
export class Cockpit {
  constructor(world, camera, scene, cam) {
    this.world = world; this.camera = camera; this.scene = scene; this.cam = cam;
    this.root = new THREE.Group();
    scene.add(this.root);
    scene.environment = world.envMap;
    scene.environmentIntensity = 0.15;
    this.t = 0;
    this.baseFov = camera.fov;
    this.eyeLocal = new THREE.Vector3(0, 2.75, 1.25);   // 胸口（軀幹骨頭座標）
    this.off = new THREE.Vector3(); this.offV = new THREE.Vector3();
    this.prevEye = new THREE.Vector3(); this.prevVel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.inited = false;
    this.sp = { p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0 };   // 旋轉晃動彈簧
    this.vib = 0; this.fovKick = 0;
    this.flash = { c: new THREE.Color(), i: 0 };
    this.hurtT = 0;
    this.screenT = 0;
    this.win = 1;

    this.makeMaterials();
    this.build();
    this.makeLights();
  }

  makeMaterials() {
    const grunge = grungeTex(), fab = fabricTex();
    const std = (c, m, r, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, side: THREE.DoubleSide, ...o });
    this.M = {
      frame: std(0x3b4247, 0.85, 0.42, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.4 }),
      panel: std(0x273036, 0.55, 0.55, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.35 }),
      hull: std(0x1a1e21, 0.6, 0.62, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.5 }),
      strut: std(0x16191b, 0.7, 0.45),
      orangeC: std(0xc8581a, 0.0, 0.45, { bumpMap: fab, bumpScale: 0.2 }),
      hose: std(0x121314, 0.0, 0.7, { bumpMap: fab, bumpScale: 1.2 }),
      matte: std(0x0f1113, 0.1, 0.82),
      white: std(0xc4c9cd, 0.05, 0.42, { roughnessMap: grunge }),
      orange: std(0xd4661c, 0.05, 0.5),
      rubber: std(0x0c0c0d, 0.0, 0.92, { bumpMap: fab, bumpScale: 0.5 }),
      chrome: std(0xa0a6ac, 1.0, 0.2),
      glove: std(0x2b2e34, 0.0, 0.62, { bumpMap: fab, bumpScale: 0.6 }),
      sleeve: std(0x1b2740, 0.0, 0.78, { bumpMap: fab, bumpScale: 0.8 }),
      seam: new THREE.MeshBasicMaterial({ color: 0x030405, side: THREE.DoubleSide }),
      glass: new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.18, depthWrite: false }),
      dirt: new THREE.MeshBasicMaterial({ map: dirtTex(), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    const L = labelTex();
    this.labels = L;
    this.M.label = new THREE.MeshStandardMaterial({ map: L.tex, transparent: true, alphaTest: 0.2, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    // 儀表螢幕（畫在 canvas 上，每秒更新 15 次）
    const [sc, sx] = canvas(1024, 1024);
    this.sc = sc; this.sx = sx;
    this.screenTex = new THREE.CanvasTexture(sc);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    this.M.screen = new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.45, 1.45, 1.45) });
  }

  build() {
    const M = this.M, P = new Parts(), S = new Parts(), G = new Parts(), Lb = new Parts();
    this.lampDefs = [];
    const lamp = (base, pos, kind, big = false) => {
      const m = new THREE.Matrix4().compose(_p.set(...pos), _q.identity(), _s.set(big ? 1.6 : 1, 1, 1));
      if (base) m.premultiply(base);
      this.lampDefs.push({ m, kind, ph: Math.random() * 10 });
    };
    const label = (base, name, pos, h = 0.011) => {
      const r = this.labels.rect[name];
      const g = atlasPlane(h * r[2] / r[3], h, r, this.labels.W, this.labels.H);
      Lb.base = base; Lb.add(M.label, g, pos); Lb.base = null;
    };

    // ---- 艙壁：一大片厚鐵板，中間挖出上寬下窄的窗
    const wall = new THREE.Shape([new THREE.Vector2(-5, -5), new THREE.Vector2(5, -5), new THREE.Vector2(5, 5), new THREE.Vector2(-5, 5)]);
    wall.holes.push(shapeOf(WIN, ZW));
    P.add(M.hull, new THREE.ExtrudeGeometry(wall, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 1 }), [0, 0, -ZW - 0.12]);
    // ---- 窗框：一圈較亮的厚金屬框＋鉚釘
    const rim = shapeOf(offsetPoly(WIN, 0.075), ZW);
    rim.holes.push(shapeOf(WIN, ZW));
    P.add(M.frame, new THREE.ExtrudeGeometry(rim, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1 }), [0, 0, -ZW - 0.015]);
    const mid = offsetPoly(WIN, 0.04);
    for (let i = 0; i < mid.length; i++) {
      const a = mid[i], b = mid[(i + 1) % mid.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) * ZW, n = Math.floor(L / 0.11);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        P.add(M.chrome, cyl(0.0065, 0.008, 8), [(a[0] + (b[0] - a[0]) * t) * ZW, (a[1] + (b[1] - a[1]) * t) * ZW, -ZW + 0.043], [Math.PI / 2, 0, 0]);
      }
    }
    // ---- 窗玻璃（髒污只在對著太陽時才看得到）＋玻璃上的細支架（Y 字形）
    const gg = new THREE.ShapeGeometry(shapeOf(WIN, ZW));
    this.dirt = new THREE.Mesh(gg, M.dirt);
    this.dirt.position.z = -ZW + 0.004;
    this.dirt.renderOrder = 2;
    this.root.add(this.dirt);
    const strut = (a, b, w = 0.009) => {
      const A = tp(a[0], a[1], ZW - 0.012), B = tp(b[0], b[1], ZW - 0.012);
      const d = new THREE.Vector3().subVectors(B, A), L = d.length();
      const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(1, 1, 1));
      P.addM(M.strut, rb(w, L + 0.006, 0.012, 0.003), m);
    };
    const clip = (x, y, s = 1) => P.add(M.strut, rb(0.02 * s, 0.03 * s, 0.022 * s, 0.005), tp(x, y, ZW - 0.014).toArray());
    for (const sx of [-1, 1]) {
      strut([sx * 0.64, 0.5], [sx * 0.22, -0.04]);
      strut([sx * 0.22, -0.04], [sx * 0.22, -0.98]);
      clip(sx * 0.22, -0.04, 1.3);
      clip(sx * 0.445, 0.25, 1.1);
      for (const y of [-0.3, -0.48, -0.66]) clip(sx * 0.22, y);
    }
    strut([-0.445, 0.25], [0.445, 0.25], 0.011);

    // ---- 儀表箱：o＝{ a, e, d（方位、仰角、距離）, w, h, dep, roll, tilt, turn, scr:[名, 寬, 高, x, y], keys:[x, y, 欄, 列], lamps:[x, y, 數, 種類], name:[字, x, y], handles, vent:[x, y] }
    const box = (o) => {
      const base = facing(o.a * D, o.e * D, o.d);
      base.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((o.tilt || 0) * D, (o.turn || 0) * D, (o.roll || 0) * D, 'YXZ')));
      const { w, h, dep } = o;
      P.base = S.base = G.base = base;
      P.add(M.panel, rb(w, h, dep, 0.02), [0, 0, -dep / 2]);
      P.add(M.frame, rb(w - 0.024, h - 0.024, 0.012, 0.005), [0, 0, 0.004]);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add(M.chrome, cyl(0.0048, 0.005, 8), [sx * (w / 2 - 0.022), sy * (h / 2 - 0.022), 0.011], [Math.PI / 2, 0, 0]);
      if (o.scr) for (const sc of Array.isArray(o.scr[0]) ? o.scr : [o.scr]) {
        const [k, sw, sh, sx = 0, sy = 0] = sc;
        P.add(M.matte, rb(sw + 0.022, sh + 0.022, 0.012, 0.005), [sx, sy, 0.009]);
        S.add(M.screen, atlasPlane(sw, sh, SCR[k], 1024, 1024), [sx, sy, 0.0152]);
        G.add(M.glass, new THREE.PlaneGeometry(sw, sh), [sx, sy, 0.016]);
      }
      if (o.keys) {
        const [kx, ky, c, r] = o.keys;
        for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) P.add((i * 3 + j) % 7 === 5 ? M.orange : M.matte, rb(0.019, 0.015, 0.008, 0.003), [kx + i * 0.026, ky - j * 0.022, 0.013]);
      }
      if (o.lamps) { const [lx, ly, n, kind] = o.lamps; for (let i = 0; i < n; i++) lamp(base, [lx + i * 0.02, ly, 0.0115], Array.isArray(kind) ? kind[i % kind.length] : kind); }
      if (o.name) label(base, o.name[0], [o.name[1], o.name[2], 0.0112], o.name[3] || 0.011);
      if (o.handles) for (const sx of [-1, 1]) {
        P.add(M.chrome, cyl(0.006, h * 0.62, 10), [sx * (w / 2 + 0.02), 0, 0.022]);
        for (const sy of [-1, 1]) P.add(M.frame, rb(0.026, 0.016, 0.034, 0.004), [sx * (w / 2 + 0.01), sy * h * 0.31, 0.008]);
      }
      if (o.vent) for (let i = 0; i < 6; i++) P.add(M.matte, rb(o.vent[2] || w * 0.35, 0.006, 0.006, 0.002), [o.vent[0], o.vent[1] - i * 0.012, 0.011]);
      P.base = S.base = G.base = null;
      return base;
    };
    // 左側
    box({ a: -30, e: 32, d: 0.8, w: 0.3, h: 0.15, dep: 0.2, roll: 2, tilt: -12, vent: [-0.04, 0.04, 0.16], lamps: [0.07, 0.04, 3, ['ok', 'idle', 'sys']] });
    box({ a: -41, e: 21, d: 0.8, w: 0.32, h: 0.24, dep: 0.2, roll: 4, scr: ['sys', 0.13, 0.13, -0.065, 0.0], keys: [0.035, 0.07, 4, 5], name: ['SYS 1', -0.12, 0.093], lamps: [0.04, -0.095, 4, ['ok', 'sys', 'idle', 'ok']] });
    box({ a: -44, e: 2, d: 0.72, w: 0.3, h: 0.21, dep: 0.16, roll: -2, scr: ['status', 0.2, 0.15, -0.025, 0.0], name: ['STATUS', -0.115, 0.088], lamps: [0.106, 0.05, 1, 'warn'], handles: true });
    box({ a: -42, e: -19, d: 0.64, w: 0.26, h: 0.24, dep: 0.16, roll: 3, scr: ['radar', 0.17, 0.17, -0.02, 0.008], name: ['RADAR', -0.1, 0.105], lamps: [0.095, 0.06, 1, 'ok'], vent: [0.095, 0.02, 0.03] });
    box({ a: -48, e: -36, d: 0.6, w: 0.24, h: 0.16, dep: 0.2, roll: -4, keys: [-0.08, 0.04, 6, 2], handles: true });
    // 右側
    box({ a: 29, e: 32, d: 0.8, w: 0.28, h: 0.15, dep: 0.2, roll: -2, tilt: -12, vent: [0.0, 0.04, 0.18], lamps: [-0.1, -0.04, 4, ['sys', 'ok', 'ok', 'idle']] });
    box({ a: 38, e: 21, d: 0.78, w: 0.28, h: 0.26, dep: 0.2, roll: -8, scr: ['gauge', 0.15, 0.15, 0.02, 0.01], name: ['FCS', -0.12, 0.1], lamps: [-0.115, 0.05, 1, 'warn'], vent: [-0.1, 0.0, 0.03] });
    box({ a: 44, e: 1, d: 0.72, w: 0.3, h: 0.21, dep: 0.16, roll: 2, scr: ['arms', 0.2, 0.15, 0.025, 0.0], name: ['ARMS', -0.12, 0.088], lamps: [-0.123, 0.05, 1, 'ok'], handles: true });
    box({ a: 42, e: -20, d: 0.64, w: 0.3, h: 0.24, dep: 0.18, roll: -3, scr: [['spd', 0.09, 0.09, -0.06, 0.04], ['alt', 0.09, 0.09, 0.05, 0.04]], keys: [-0.1, -0.045, 8, 2], name: ['SPD', -0.1, 0.1] });
    box({ a: 48, e: -36, d: 0.6, w: 0.24, h: 0.16, dep: 0.2, roll: 4, vent: [0, 0.05, 0.16], lamps: [-0.08, -0.04, 5, ['ok', 'idle', 'sys', 'ok', 'idle']] });
    // 頭頂：兩塊橫條螢幕
    box({ a: -13, e: 30.5, d: 0.72, w: 0.3, h: 0.1, dep: 0.14, roll: 1, tilt: -18, scr: ['wave', 0.2, 0.05, 0.035, 0.0], name: ['GEN', -0.13, 0.03], lamps: [-0.13, -0.02, 2, ['ok', 'sys']] });
    box({ a: 11, e: 30.5, d: 0.72, w: 0.34, h: 0.1, dep: 0.14, roll: -1, tilt: -18, scr: ['bars', 0.24, 0.06, -0.03, 0.0], name: ['VENT', 0.1, 0.03], lamps: [0.11, -0.02, 2, ['boost', 'boost']] });
    // 撥桿（帶護蓋）
    for (const sx of [-1, 1]) {
      const base = facing(sx * 33 * D, 26 * D, 0.74);
      P.base = base;
      P.add(M.panel, rb(0.08, 0.05, 0.04, 0.008), [0, 0, -0.02]);
      for (let k = 0; k < 3; k++) {
        const x = (k - 1) * 0.022;
        P.add(M.chrome, cyl(0.0025, 0.02, 8), [x, -0.004, 0.012], [-0.9, 0, 0]);
        P.add(M.orange, rb(0.014, 0.004, 0.024, 0.002), [x, -0.008, 0.012], [0.5, 0, 0]);
      }
      lamp(base, [0, 0.016, 0.002], 'warn', true);
      P.base = null;
    }
    // ---- 管線：橘色電纜、黑色軟管（照參考圖掛在窗邊）
    const tube = (mat, pts, r) => P.addM(mat, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([a, e, d]) => sph(a * D, e * D, d))), 48, r, 8, false));
    tube(M.orangeC, [[-31, 29, 0.74], [-33, 19, 0.66], [-35.5, 7, 0.63], [-35, -5, 0.61], [-38, -13, 0.62]], 0.0085);
    tube(M.orangeC, [[-32, 28, 0.76], [-35, 14, 0.7], [-38, 11, 0.68], [-40, 12, 0.7]], 0.0065);
    tube(M.hose, [[-38, 28.5, 0.76], [-22, 27, 0.71], [-4, 27.8, 0.69], [14, 27.2, 0.7], [32, 28.5, 0.76]], 0.016);
    tube(M.hose, [[-36, 30.5, 0.77], [-18, 29.2, 0.72], [4, 29.6, 0.7], [20, 29.4, 0.72], [30, 30.5, 0.77]], 0.011);
    tube(M.orangeC, [[31, 29, 0.74], [33, 17, 0.66], [35, 5, 0.63], [37, -8, 0.62]], 0.0075);
    tube(M.hose, [[36, 12, 0.74], [33, 9, 0.66], [34, 0, 0.64], [37, -3, 0.68]], 0.012);
    // 電纜接頭
    for (const [a, e, d] of [[-38, -13, 0.62], [37, -8, 0.62], [-40, 12, 0.7]]) {
      P.base = facing(a * D, e * D, d);
      P.add(M.frame, cyl(0.016, 0.03, 12), [0, 0, 0], [Math.PI / 2, 0, 0]);
      P.base = null;
    }

    // ---- 扶手台（操縱桿底座）
    for (const sx of [-1, 1]) {
      P.add(M.panel, rb(0.16, 0.1, 0.55, 0.025), [sx * 0.31, -0.54, -0.3]);
      P.add(M.frame, rb(0.165, 0.016, 0.56, 0.007), [sx * 0.31, -0.49, -0.3]);
      P.add(M.matte, rb(0.12, 0.012, 0.13, 0.006), [sx * 0.3, -0.478, -0.5]);
    }

    // ---- 開機前關著的裝甲擋板（開機時往上收）
    const SP = new Parts();
    SP.add(M.hull, new THREE.ExtrudeGeometry(shapeOf(offsetPoly(WIN, 0.06), ZW), { depth: 0.03, bevelEnabled: false }), [0, 0, -ZW - 0.23]);
    for (let y = -0.95; y < 0.55; y += 0.13) SP.add(M.frame, rb(1.9, 0.05, 0.03, 0.008), [0, y * ZW, -ZW - 0.18]);
    this.shutter = SP.build(new THREE.Group());
    this.root.add(this.shutter);

    P.build(this.root); S.build(this.root); G.build(this.root); Lb.build(this.root);

    // ---- 指示燈（同一個 InstancedMesh，每盞顏色各自變）
    const lg = rb(0.011, 0.0065, 0.004, 0.0015);
    this.lamps = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.lampDefs.length);
    this.lampDefs.forEach((d, i) => { this.lamps.setMatrixAt(i, d.m); this.lamps.setColorAt(i, _c.setRGB(0, 0, 0)); });
    this.root.add(this.lamps);

    // ---- 兩支操縱桿＋手
    this.sticks = [this.buildStick(1), this.buildStick(-1)];
  }

  // 操縱桿與戴手套的手（右手；左手鏡像）
  buildStick(side) {
    const M = this.M, P = new Parts(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const base = new THREE.Group();
    base.position.set(side * 0.3, -0.455, -0.51);
    base.scale.x = side;
    const pivot = new THREE.Group();
    pivot.rotation.set(-0.22, 0, 0.24, 'YXZ');
    base.add(pivot);
    this.root.add(base);
    // 蛇腹護套、桿身
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(0.03 + (i % 2) * 0.006 - i * 0.0012, i * 0.0038));
    P.add(M.rubber, new THREE.LatheGeometry(pts, 16));
    P.add(M.chrome, cyl(0.011, 0.05), [0, 0.06, 0]);
    // 握把座標：握把軸＝+Y，從桿頂 y＝0.075 開始
    const gp = new Parts();
    gp.add(M.frame, cyl(0.017, 0.012), [0, 0.006, 0]);
    gp.add(M.rubber, new THREE.CapsuleGeometry(0.021, 0.075, 4, 16), [0, 0.07, 0], [0, 0, 0], [1, 1, 1.12]);
    gp.add(M.panel, rb(0.046, 0.028, 0.058, 0.01), [0, 0.135, -0.006], [-0.15, 0, 0]);
    gp.add(M.rubber, cyl(0.0065, 0.009, 10), [-0.008, 0.152, -0.02]);
    gp.add(M.orange, cyl(0.0055, 0.006, 10), [0.012, 0.15, 0.006]);
    gp.add(M.frame, rb(0.011, 0.024, 0.012, 0.003), [0, 0.104, -0.03], [0.25, 0, 0]);
    // 手掌（在握把右側，掌心朝握把）
    gp.add(M.glove, rb(0.026, 0.09, 0.085, 0.012), [0.035, 0.072, 0.03]);
    // 手指：從指根繞過握把前方到左側
    const finger = (y, r, k, idx = false) => {
      const P0 = V(0.034, y, -0.014);
      const path = idx
        ? [P0, V(0.018 * k, y, -0.045 * k), V(-0.004, y - 0.004, -0.05 * k), V(-0.017, y - 0.008, -0.042 * k)]
        : [P0, V(0.016 * k, y - 0.002, -0.042 * k), V(-0.016 * k, y - 0.004, -0.034 * k), V(-0.03 * k, y - 0.006, -0.011 * k), V(-0.026 * k, y - 0.007, 0.006 * k)];
      for (let i = 0; i < path.length - 1; i++) gp.seg(M.glove, path[i], path[i + 1], r * (1 - i * 0.06));
      gp.add(M.glove, new THREE.SphereGeometry(r * 1.2, 12, 8), [P0.x, P0.y, P0.z]);
    };
    finger(0.11, 0.0092, 1, true);
    finger(0.088, 0.0096, 0.92);
    finger(0.066, 0.0092, 0.9);
    finger(0.046, 0.0082, 0.86);
    // 拇指（壓在頂部按鈕上）
    gp.add(M.glove, new THREE.SphereGeometry(0.017, 12, 10), [0.03, 0.1, 0.03], [0, 0, 0], [0.8, 1, 1.1]);
    gp.seg(M.glove, V(0.028, 0.105, 0.034), V(0.018, 0.13, 0.016), 0.012);
    gp.seg(M.glove, V(0.018, 0.13, 0.016), V(0.004, 0.146, -0.002), 0.011);
    gp.seg(M.glove, V(0.004, 0.146, -0.002), V(-0.005, 0.152, -0.012), 0.0102);
    // 手背護甲、指節護板
    gp.add(M.white, rb(0.008, 0.07, 0.062, 0.004), [0.0505, 0.075, 0.032]);
    gp.add(M.orange, rb(0.009, 0.011, 0.064, 0.003), [0.051, 0.1, 0.032]);
    gp.add(M.white, rb(0.012, 0.082, 0.022, 0.005), [0.043, 0.078, -0.012], [0, -0.3, 0]);
    // 手腕、護腕、袖子（往後下方出畫面）
    gp.seg(M.glove, V(0.035, 0.066, 0.07), V(0.04, 0.052, 0.11), 0.026);
    gp.seg(M.white, V(0.04, 0.052, 0.105), V(0.045, 0.043, 0.15), 0.033, 0.034);
    gp.seg(M.orange, V(0.045, 0.043, 0.15), V(0.046, 0.041, 0.158), 0.0345, 0.0345);
    gp.seg(M.sleeve, V(0.046, 0.041, 0.155), V(0.08, -0.09, 0.46), 0.036, 0.047);
    const grip = new THREE.Group();
    grip.position.y = 0.075;
    gp.build(grip);
    pivot.add(grip);
    P.build(pivot);
    return { base, pivot, grip, side, tx: 0, tz: 0, rec: 0 };
  }

  makeLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x050608, 0.6);   // 從窗戶進來的天光
    this.key = new THREE.DirectionalLight(0xffffff, 0);             // 艙內反射回來的補光（從背後打）
    this.key.position.set(0.2, 0.5, 1);
    this.sunL = new THREE.DirectionalLight(0xffc890, 0);            // 太陽：只有在前方時，光才會穿過窗戶照進來（有影子）
    this.sunL.castShadow = true;
    this.sunL.shadow.mapSize.set(1024, 1024);
    const c = this.sunL.shadow.camera;
    c.left = -1.4; c.right = 1.4; c.top = 1.4; c.bottom = -1.4; c.near = 0.1; c.far = 8;
    this.sunL.shadow.bias = -0.0004; this.sunL.shadow.normalBias = 0.003;
    this.sunL.target.position.set(0, -0.1, -0.4);
    this.conL = new THREE.PointLight(0x7fe8ff, 0, 1.4, 2);          // 儀表光
    this.conL.position.set(0, -0.28, -0.55);
    this.warnL = new THREE.PointLight(0xff2412, 0, 2.5, 2);         // 警示紅燈
    this.warnL.position.set(0, 0.35, -0.2);
    this.flashL = new THREE.PointLight(0xffffff, 0, 3, 2);          // 開火／爆炸閃光
    this.flashL.position.set(0.3, 0.1, -1.2);
    s.add(this.hemi, this.key, this.key.target, this.sunL, this.sunL.target, this.conL, this.warnL, this.flashL);
  }

  // 撞擊晃動：kind＝step（落腳）／land（落地）／hit（中彈）／fire（開火）／qb（快速閃避）
  kick(kind, s = 1, dir = 0) {
    const sp = this.sp;
    if (kind === 'step') { sp.pv -= 0.35 * s; sp.rv += dir * 0.16 * s; this.vib = Math.max(this.vib, 0.35 * s); }
    else if (kind === 'land') { sp.pv -= 1.1 * s; this.offV.y -= 1.2 * s; this.vib = Math.max(this.vib, 0.8 * s); }
    else if (kind === 'hit') {
      sp.pv += (Math.random() - 0.6) * 1.4 * s; sp.rv += (dir || (Math.random() - 0.5)) * 1.2 * s; sp.yv += (dir || (Math.random() - 0.5)) * 0.5 * s;
      this.offV.x += (Math.random() - 0.5) * 1.5 * s; this.vib = Math.max(this.vib, 1.2 * s); this.hurtT = 0.35 * s;
    } else if (kind === 'fire') { sp.pv += 0.25 * s; this.vib = Math.max(this.vib, 0.25 * s); this.sticks[0].rec = 1; }
    else if (kind === 'qb') { this.fovKick = Math.max(this.fovKick, 7 * s); this.vib = Math.max(this.vib, 0.7 * s); }
  }
  // 閃光（開火、爆炸）：c＝THREE.Color，i＝強度，pos＝方向（艙內座標，可省略）
  flashAt(c, i, x = 0.3, y = 0.1, z = -1.2) {
    if (i < this.flash.i) return;
    this.flash.c.copy(c); this.flash.i = i;
    this.flashL.position.set(x, y, z);
  }

  // 每幀：擺鏡頭、擺駕駛艙、更新燈光與儀表
  // ui：{ yaw, pitch（瞄準，機體朝向慣例）, boot, move:{x,y}, turn:{x,y}, boost, hover, speed, alt, vs, ap, apMax, en, parts, rifle, msl, saber, od, lockAlert, danger, radar, fire }
  // 深度遮罩（放進城市那一層先畫）：艙壁擋住的畫面先填「最近」的深度，
  // 後面的城市、天空、煙在那些像素直接被顯卡跳過——看不到的地方就不算，畫面完全不變。
  // 形狀＝整片艙壁減掉比窗戶再大一圈的洞（寧可多算一點邊，也不能在窗緣缺一塊）。
  depthMask() {
    const s = new THREE.Shape([new THREE.Vector2(-5, -5), new THREE.Vector2(5, -5), new THREE.Vector2(5, 5), new THREE.Vector2(-5, 5)]);
    s.holes.push(shapeOf(offsetPoly(WIN, 0.05), ZW));
    const g = new THREE.ShapeGeometry(s, 1);
    g.translate(0, 0, -ZW);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { pm: { value: this.cam.projectionMatrix }, mm: { value: this.root.matrixWorld } },
      // 用駕駛艙鏡頭投影＋艙體晃動，跟艙壁在畫面上的位置一模一樣；深度壓在最前面
      vertexShader: 'uniform mat4 pm, mm; void main() { vec4 p = pm * mm * vec4(position, 1.0); gl_Position = vec4(p.xy, -0.99999 * p.w, p.w); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth,
    }));
    m.frustumCulled = false;
    m.renderOrder = -1e6;
    m.userData.noAO = true;
    m.onBeforeRender = () => this.root.updateMatrixWorld();
    return m;
  }

  update(dt, mech, ui) {
    this.t += dt;
    const cam = this.camera, b = mech.bones;
    // ---- 眼睛位置＋頭部彈簧
    b.torso.updateWorldMatrix(true, false);
    const eye = _v.copy(this.eyeLocal).applyMatrix4(b.torso.matrixWorld);
    const idt = 1 / Math.max(dt, 1e-3);
    if (!this.inited || eye.distanceTo(this.prevEye) > 30) { this.prevEye.copy(eye); this.prevVel.set(0, 0, 0); this.inited = true; }
    const vel = _v2.subVectors(eye, this.prevEye).multiplyScalar(idt);
    this.acc.subVectors(vel, this.prevVel).multiplyScalar(idt).clampLength(0, 160);
    this.prevEye.copy(eye); this.prevVel.copy(vel);
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, W = 13, Z = 0.5;
    for (let i = 0; i < n; i++) {
      for (const k of ['x', 'y', 'z']) {
        const g = k === 'y' ? 0.5 : 0.22;
        this.offV[k] += (-W * W * this.off[k] - 2 * Z * W * this.offV[k] - this.acc[k] * g) * h;
        this.off[k] += this.offV[k] * h;
      }
      const sp = this.sp, w = 17, z = 0.42;
      sp.pv += (-w * w * sp.p - 2 * z * w * sp.pv) * h; sp.p += sp.pv * h;
      sp.rv += (-w * w * sp.r - 2 * z * w * sp.rv) * h; sp.r += sp.rv * h;
      sp.yv += (-w * w * sp.y - 2 * z * w * sp.yv) * h; sp.y += sp.yv * h;
    }
    this.off.x = clamp(this.off.x, -0.12, 0.12); this.off.y = clamp(this.off.y, -0.2, 0.2); this.off.z = clamp(this.off.z, -0.12, 0.12);
    cam.position.copy(eye).add(this.off);

    // ---- 視線：瞄準方向＋一半的機身前傾／側傾＋晃動
    this.vib = Math.max(this.vib * Math.exp(-dt * 7), (ui.boost || 0) * 0.3 + (ui.hover || 0) * 0.15);
    const t = this.t, vb = this.vib;
    const jx = (Math.sin(t * 57) + Math.sin(t * 91) * 0.5) * 0.0035 * vb, jy = (Math.sin(t * 63) + Math.sin(t * 83) * 0.5) * 0.0025 * vb;
    const tX = b.torso.rotation.x + b.pelvis.rotation.x, tZ = b.torso.rotation.z + b.pelvis.rotation.z;
    const tY = mech.legYaw + b.pelvis.rotation.y + b.torso.rotation.y;
    const vp = ui.pitch - 0.5 * tX + this.sp.p * 0.1 + jx;
    const vy = ui.yaw + Math.PI + this.sp.y * 0.08 + jy;
    const vr = -0.5 * tZ + this.sp.r * 0.1;
    cam.quaternion.setFromEuler(_e.set(vp, vy, vr, 'YXZ'));
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    const fov = this.baseFov + (ui.boost || 0) * 5 + this.fovKick;
    if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // ---- 駕駛艙相對視線：機身慢半拍（扭轉）、頭部彈簧位移、推進器高頻震
    const rY = clamp(wrap(tY - ui.yaw) * 0.5, -0.07, 0.07);
    const rP = clamp(-0.12 * ui.pitch - 0.5 * tX, -0.12, 0.12) + jx * 1.5;
    const rR = -0.5 * tZ + jy;
    this.root.quaternion.setFromEuler(_e.set(rP, rY, rR, 'YXZ'));
    _q.copy(cam.quaternion).invert();
    this.root.position.copy(this.off).negate().applyQuaternion(_q);
    this.scene.environmentRotation.set(0, -vy, 0);

    // 開機：擋板往上收
    const bt = ui.boot ?? 1;
    this.win = clamp((bt - 0.55) / 0.35, 0, 1);
    const ease = this.win * this.win * (3 - 2 * this.win);
    this.shutter.position.y = ease * 1.75;
    this.shutter.visible = this.win < 1;
    this.updateSticks(dt, ui);
    this.updateLights(dt, ui, _q);
    this.updateLamps(ui);
    this.screenT -= dt;
    if (this.screenT <= 0) { this.screenT = 1 / 15; this.drawScreens(ui); }
  }

  updateSticks(dt, ui) {
    const mv = ui.move || { x: 0, y: 0 }, tn = ui.turn || { x: 0, y: 0 };
    for (const s of this.sticks) {
      // 左桿＝移動；右桿＝轉向（跟著滑鼠）
      const tx = s.side < 0 ? mv.y * 0.22 + (ui.boost || 0) * 0.1 : -clamp(tn.y, -1, 1) * 0.16;
      const tz = s.side < 0 ? -mv.x * 0.2 * s.side : -clamp(tn.x, -1, 1) * 0.2;
      s.tx = damp(s.tx, tx, 10, dt); s.tz = damp(s.tz, tz, 10, dt);
      s.rec = Math.max(0, s.rec - dt * 7);
      s.pivot.rotation.x = -0.22 - s.tx + s.rec * 0.04;
      s.pivot.rotation.z = 0.24 + s.tz;
      s.grip.position.z = s.rec * 0.006;
    }
  }

  updateLights(dt, ui, qInv) {
    const w = this.world, boot = ui.boot ?? 1;
    const win = this.win;                                   // 擋板打開多少
    const ins = clamp((boot - 0.12) / 0.2, 0, 1);          // 儀表亮度
    // 窗外天光
    this.hemi.color.copy(w.fogColor).multiplyScalar(1.3);
    this.hemi.groundColor.setRGB(0.015, 0.016, 0.018);
    this.hemi.intensity = 0.5 * win + 0.015;
    this.key.color.copy(w.fogColor).lerp(_c.setRGB(1, 0.85, 0.7), 0.4);
    this.key.intensity = 0.35 * win;
    this.scene.environmentIntensity = 0.03 + 0.12 * win;
    // 太陽方向（轉到艙內座標）：在前方才照得進來
    const sd = _v.copy(w.lightDir).applyQuaternion(qInv);
    this.sunL.position.copy(this.sunL.target.position).addScaledVector(sd, 4);
    this.sunL.color.copy(w.sun.color);
    const front = clamp(-sd.z * 2.2, 0, 1);
    this.sunL.intensity = 3.2 * win * front;
    // 玻璃污漬：正對太陽時亮起來
    const glint = Math.pow(clamp(-sd.z, 0, 1), 6);
    this.M.dirt.color.copy(w.sun.color).multiplyScalar((0.05 + glint * 0.55) * win);
    this.conL.intensity = 0.045 * ins;
    // 警示燈：被鎖定慢閃、危險快閃
    const la = ui.lockAlert || 0, dg = ui.danger ? 1 : 0;
    const blink = dg ? (Math.sin(this.t * 14) > 0 ? 1 : 0.1) : la > 0.01 ? (Math.sin(this.t * (la > 0.7 ? 22 : 9)) > 0 ? 1 : 0) : 0;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.warnL.intensity = (0.25 * blink * Math.max(dg, la) + this.hurtT * 0.8) + (boot < 0.15 ? 0.06 : 0);
    // 閃光
    this.flash.i = Math.max(0, this.flash.i - dt * this.flash.i * 9 - dt * 2);
    this.flashL.color.copy(this.flash.c);
    this.flashL.intensity = this.flash.i;
  }

  updateLamps(ui) {
    const boot = ui.boot ?? 1, t = this.t;
    const on = clamp((boot - 0.3) / 0.15, 0, 1);
    const la = ui.lockAlert || 0, dg = !!ui.danger;
    this.lampDefs.forEach((d, i) => {
      let r = 0, g = 0, b = 0;
      const k = (Math.sin(t * 2.3 + d.ph * 7) > 0.2) ? 1 : 0.25;
      switch (d.kind) {
        case 'ok': r = 0.15; g = 1.9; b = 0.5; break;
        case 'idle': r = 2.2; g = 1.1; b = 0.1; if (k < 1) { r *= 0.2; g *= 0.2; b *= 0.2; } break;
        case 'sys': r = 0.3; g = 1.6; b = 2.4; if (Math.sin(t * 5 + d.ph * 3) > 0.85) { r *= 0.2; g *= 0.2; b *= 0.2; } break;
        case 'boost': { const v = (ui.boost || 0) + (ui.hover || 0); r = 0.4 * v + 0.05; g = 1.8 * v + 0.1; b = 3 * v + 0.15; break; }
        case 'warn': { const on2 = dg || la > 0.01 ? (Math.sin(t * (dg ? 14 : 9)) > 0 ? 1 : 0.08) : 0.04; r = 3.2 * on2; g = 0.18 * on2; b = 0.08 * on2; break; }
      }
      const f = d.kind === 'warn' ? 1 : on;
      this.lamps.setColorAt(i, _c.setRGB(r * f, g * f, b * f));
    });
    this.lamps.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- 儀表畫面
  drawScreens(ui) {
    const x = this.sx, boot = ui.boot ?? 1;
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
    const on = (at) => clamp((boot - at) / 0.06, 0, 1);
    const scr = [['radar', 0.2, this.drawRadar], ['status', 0.26, this.drawStatus], ['arms', 0.32, this.drawArms], ['spd', 0.16, this.drawSpd], ['alt', 0.18, this.drawAlt],
      ['sys', 0.14, this.drawSys], ['gauge', 0.22, this.drawGauge], ['bars', 0.28, this.drawBars], ['wave', 0.24, this.drawWave]];
    for (const [k, at, fn] of scr) {
      const r = SCR[k], o = on(at);
      if (o <= 0) continue;
      x.save();
      x.beginPath(); x.rect(r[0], r[1], r[2], r[3]); x.clip();
      x.translate(r[0], r[1]);
      x.fillStyle = COL.bg; x.fillRect(0, 0, r[2], r[3]);
      if (o < 1) this.drawBoot(x, r[2], r[3], o, k);
      else fn.call(this, x, r[2], r[3], ui);
      // 掃描線＋中彈雜訊
      x.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < r[3]; y += 4) x.fillRect(0, y, r[2], 1);
      if (this.hurtT > 0.05) {
        for (let k2 = 0; k2 < 10; k2++) {
          x.fillStyle = `rgba(${150 + Math.random() * 100},${200 + Math.random() * 55},255,${Math.random() * 0.5 * this.hurtT * 3})`;
          x.fillRect(0, Math.random() * r[3], r[2], 2 + Math.random() * 10);
        }
      }
      x.restore();
    }
    this.screenTex.needsUpdate = true;
  }

  drawBoot(x, w, h, o, name) {
    x.strokeStyle = COL.cy; x.fillStyle = COL.cy;
    x.globalAlpha = Math.random() < 0.3 ? 0.4 : 1;
    x.font = `600 ${Math.round(w * 0.07)}px Rajdhani, sans-serif`;
    x.textAlign = 'left'; x.textBaseline = 'top';
    x.fillText('BOOT ' + name.toUpperCase(), w * 0.08, h * 0.35);
    x.strokeRect(w * 0.08, h * 0.55, w * 0.84, h * 0.06);
    x.fillRect(w * 0.08, h * 0.55, w * 0.84 * o, h * 0.06);
    x.globalAlpha = 1;
  }

  grid(x, w, h, s) {
    x.strokeStyle = COL.grid; x.lineWidth = 1;
    x.beginPath();
    for (let i = s; i < w; i += s) { x.moveTo(i, 0); x.lineTo(i, h); }
    for (let j = s; j < h; j += s) { x.moveTo(0, j); x.lineTo(w, j); }
    x.stroke();
  }

  drawRadar(x, w, h, ui) {
    const cx = w / 2, cy = h / 2 + 8, R = 222, range = 600, k = R / range, t = this.t;
    const yaw = ui.yaw || 0, sa = Math.sin(yaw), ca = Math.cos(yaw);
    x.lineWidth = 2;
    // 距離環
    for (const r of [200, 400, 600]) { x.strokeStyle = r === 600 ? COL.dim : COL.grid; x.beginPath(); x.arc(cx, cy, r * k, 0, Math.PI * 2); x.stroke(); }
    x.strokeStyle = COL.grid; x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
    // 視野扇形
    x.strokeStyle = COL.dim; x.beginPath();
    for (const s of [-1, 1]) { x.moveTo(cx, cy); x.lineTo(cx + Math.sin(s * 50 * D) * R, cy - Math.cos(50 * D) * R); }
    x.stroke();
    // 方位刻度（機頭朝上，北方跟著轉）
    x.fillStyle = COL.dim; x.font = '600 26px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 10) {
      const a = d * D - yaw;
      const r0 = d % 30 === 0 ? R - 14 : R - 7;
      x.strokeStyle = COL.dim; x.beginPath();
      x.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); x.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); x.stroke();
      if (d % 90 === 0) { x.fillStyle = d === 0 ? COL.am : COL.dim; x.fillText('NESW'[d / 90], cx + Math.sin(a) * (R - 30), cy - Math.cos(a) * (R - 30)); }
    }
    // 掃描線
    const sw = (t * 2.4) % (Math.PI * 2);
    if (x.createConicGradient) {
      const g = x.createConicGradient(sw - Math.PI / 2 - 1.2, cx, cy);
      g.addColorStop(0, 'rgba(111,240,255,0)'); g.addColorStop(0.19, 'rgba(111,240,255,0.22)'); g.addColorStop(0.191, 'rgba(111,240,255,0)'); g.addColorStop(1, 'rgba(111,240,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    }
    // 光點
    for (const o of ui.radar || []) {
      const dx = o.x - (ui.px || 0), dz = o.z - (ui.pz || 0);
      const f = dx * sa + dz * ca, r = -dx * ca + dz * sa;
      let px = cx + r * k, py = cy - f * k;
      const dist = Math.hypot(px - cx, py - cy);
      const edge = dist > R - 6;
      if (edge) { px = cx + (px - cx) / dist * (R - 6); py = cy + (py - cy) / dist * (R - 6); }
      const ang = Math.atan2(px - cx, -(py - cy));
      const age = ((sw - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      x.globalAlpha = edge ? 0.6 : 1 - age / (Math.PI * 2) * 0.65;
      if (o.kind === 'missile') { x.fillStyle = COL.am; x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill(); }
      else if (o.kind === 'wreck') { x.strokeStyle = '#5a6a70'; x.beginPath(); x.moveTo(px - 6, py - 6); x.lineTo(px + 6, py + 6); x.moveTo(px + 6, py - 6); x.lineTo(px - 6, py + 6); x.stroke(); }
      else {
        const s = o.kind === 'heavy' ? 13 : o.kind === 'ace' ? 12 : 10;
        x.fillStyle = o.kind === 'ace' ? '#ff7b3a' : COL.rd;
        x.beginPath(); x.moveTo(px, py - s); x.lineTo(px + s, py); x.lineTo(px, py + s); x.lineTo(px - s, py); x.closePath(); x.fill();
        if (o.locked) { x.strokeStyle = COL.wh; x.lineWidth = 2; x.strokeRect(px - s - 6, py - s - 6, (s + 6) * 2, (s + 6) * 2); }
      }
      x.globalAlpha = 1;
    }
    // 自機
    x.fillStyle = COL.cy; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 8, cy + 8); x.lineTo(cx, cy + 4); x.lineTo(cx - 8, cy + 8); x.closePath(); x.fill();
    x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = COL.cy; x.font = '600 26px Rajdhani, sans-serif';
    x.fillText('RNG 600', 14, 10);
    x.textAlign = 'right';
    const hdg = Math.round(((yaw / D) % 360 + 360) % 360);
    x.fillText('HDG ' + String(hdg).padStart(3, '0'), w - 14, 10);
    const ne = (ui.radar || []).filter((o) => o.kind !== 'missile' && o.kind !== 'wreck').length;
    x.textBaseline = 'bottom'; x.fillStyle = ne ? COL.rd : COL.dim;
    x.fillText('HOSTILE ' + ne, w - 14, h - 8);
  }

  drawStatus(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const pc = ui.parts || {};
    const col = (v) => (v === undefined || v > 0.6) ? COL.cy : v > 0.3 ? COL.am : (Math.sin(this.t * 10) > 0 ? COL.rd : '#5a1410');
    // 機體剪影（正面）
    const ox = 118, oy = 60;
    const part = (v, pts) => { x.fillStyle = col(v); x.globalAlpha = 0.85; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(ox + a, oy + b) : x.moveTo(ox + a, oy + b))); x.closePath(); x.fill(); x.globalAlpha = 1; };
    part(pc.head, [[-12, 0], [12, 0], [15, 22], [-15, 22]]);
    part(pc.torso, [[-44, 28], [44, 28], [36, 92], [22, 118], [-22, 118], [-36, 92]]);
    part(pc.armR, [[-50, 28], [-88, 34], [-92, 128], [-66, 132], [-56, 60]]);
    part(pc.armL, [[50, 28], [88, 34], [92, 128], [66, 132], [56, 60]]);
    part(pc.legR, [[-24, 124], [-4, 124], [-8, 226], [-40, 232], [-36, 180]]);
    part(pc.legL, [[24, 124], [4, 124], [8, 226], [40, 232], [36, 180]]);
    x.strokeStyle = COL.bg; x.lineWidth = 3;
    x.font = '700 30px Rajdhani, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'top';
    x.fillStyle = COL.wh; x.fillText('XG-01', 16, 10);
    // 右半：耐久、能量
    const ap = ui.ap ?? 1, apMax = ui.apMax ?? 1, en = ui.en ?? 1;
    const f = clamp(ap / apMax, 0, 1);
    const X0 = 250;
    x.fillStyle = COL.dim; x.font = '600 26px Rajdhani, sans-serif'; x.fillText('ARMOR', X0, 40);
    x.fillStyle = f > 0.3 ? COL.wh : COL.rd; x.font = '700 70px Rajdhani, sans-serif';
    x.fillText(Math.round(ap).toLocaleString('en-US'), X0, 64);
    x.fillStyle = COL.grid; x.fillRect(X0, 142, 230, 14);
    x.fillStyle = f > 0.3 ? COL.cy : COL.rd; x.fillRect(X0, 142, 230 * f, 14);
    x.fillStyle = COL.dim; x.font = '600 26px Rajdhani, sans-serif'; x.fillText('EN', X0, 176);
    x.fillStyle = COL.grid; x.fillRect(X0 + 44, 184, 186, 14);
    x.fillStyle = en > 0.25 ? COL.cy : COL.am; x.fillRect(X0 + 44, 184, 186 * clamp(en, 0, 1), 14);
    x.fillStyle = COL.dim; x.fillText('GEN', X0, 226); x.fillText('BAL', X0, 262); x.fillText('FCS', X0, 298);
    x.fillStyle = COL.wh;
    x.fillText(`${Math.round(62 + (1 - en) * 30 + (ui.boost || 0) * 8)}°C`, X0 + 70, 226);
    x.fillStyle = ui.hover || (ui.alt || 0) > 3 ? COL.am : COL.gr; x.fillText(ui.hover || (ui.alt || 0) > 3 ? 'AIR' : 'OK', X0 + 70, 262);
    x.fillStyle = COL.gr; x.fillText('LINK', X0 + 70, 298);
  }

  drawArms(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const t = this.t;
    x.textAlign = 'left'; x.textBaseline = 'top';
    // 右手：光束步槍
    const rf = ui.rifle || { ammo: 12, mag: 12, reload: -1 };
    x.fillStyle = COL.dim; x.font = '600 24px Rajdhani, sans-serif'; x.fillText('R  BEAM RIFLE', 16, 12);
    x.fillStyle = rf.ammo > 0 ? COL.wh : COL.rd; x.font = '700 54px Rajdhani, sans-serif';
    x.textAlign = 'right'; x.fillText(String(rf.ammo).padStart(2, '0'), w - 16, 4); x.textAlign = 'left';
    for (let i = 0; i < rf.mag; i++) { x.fillStyle = i < rf.ammo ? COL.pk : COL.grid; x.fillRect(16 + i * 24, 46, 18, 16); }
    if (rf.reload >= 0) {
      x.fillStyle = COL.grid; x.fillRect(16, 68, w - 32, 10);
      x.fillStyle = COL.am; x.fillRect(16, 68, (w - 32) * rf.reload, 10);
    }
    // 左肩：飛彈
    const ms = ui.msl || { ready: 6, max: 6, cd: 1, locks: 0 };
    x.fillStyle = COL.dim; x.font = '600 24px Rajdhani, sans-serif'; x.fillText('L  MISSILE', 16, 102);
    for (let i = 0; i < ms.max; i++) {
      x.fillStyle = i < ms.locks ? COL.rd : ms.cd >= 1 ? COL.cy : COL.grid;
      x.fillRect(16 + i * 42, 134, 34, 22);
    }
    if (ms.cd < 1) { x.fillStyle = COL.am; x.fillRect(16, 162, (ms.max * 42 - 8) * ms.cd, 6); }
    x.fillStyle = ms.locks ? COL.rd : COL.dim; x.textAlign = 'right'; x.font = '700 30px Rajdhani, sans-serif';
    x.fillText(ms.locks ? `LOCK ${ms.locks}` : ms.cd >= 1 ? 'READY' : 'LOAD', w - 16, 128); x.textAlign = 'left';
    // 光劍
    const sb = ui.saber ?? 1;
    x.fillStyle = COL.dim; x.font = '600 24px Rajdhani, sans-serif'; x.fillText('S  BEAM SABER', 16, 190);
    x.textAlign = 'right'; x.fillStyle = sb >= 1 ? COL.gr : COL.am; x.fillText(sb >= 1 ? 'READY' : `${Math.round(sb * 100)}%`, w - 16, 190); x.textAlign = 'left';
    // 覺醒
    const od = ui.od || { gauge: 0, active: false };
    x.fillStyle = COL.dim; x.fillText('OVERDRIVE', 16, 262);
    x.fillStyle = COL.grid; x.fillRect(16, 294, w - 32, 26);
    const full = od.gauge >= 1;
    x.fillStyle = od.active ? COL.rd : full ? (Math.sin(t * 8) > 0 ? COL.am : '#8a5a1a') : COL.am;
    x.fillRect(16, 294, (w - 32) * clamp(od.gauge, 0, 1), 26);
    if (full || od.active) { x.fillStyle = COL.bg; x.font = '700 24px Rajdhani, sans-serif'; x.fillText(od.active ? 'ACTIVE' : 'READY  [Q]', 26, 294); }
  }

  // 系統檢查清單（左上）
  drawSys(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const t = this.t, rows = ['GEN', 'CELL', 'COOL', 'FCS', 'IFF', 'LINK', 'BAL'];
    x.font = '600 22px Rajdhani, sans-serif'; x.textBaseline = 'top';
    rows.forEach((n, i) => {
      const y = 12 + i * 33;
      x.textAlign = 'left'; x.fillStyle = COL.dim; x.fillText(n, 12, y);
      const v = n === 'CELL' ? (ui.en ?? 1) : n === 'COOL' ? 1 - (ui.boost || 0) * 0.35 : 0.8 + 0.15 * Math.sin(t * (0.7 + i * 0.3) + i);
      x.fillStyle = COL.grid; x.fillRect(80, y + 6, 120, 10);
      x.fillStyle = v < 0.3 ? COL.am : COL.cy; x.fillRect(80, y + 6, 120 * clamp(v, 0, 1), 10);
      x.textAlign = 'right'; x.fillStyle = COL.wh; x.fillText(String(Math.round(v * 100)), w - 10, y);
    });
  }
  // 大數字＋兩個圓環（右上，參考圖那塊「03」）：剩下幾台敵機、能量、溫度
  drawGauge(x, w, h, ui) {
    const n = (ui.radar || []).filter((o) => o.kind !== 'missile' && o.kind !== 'wreck').length;
    x.textAlign = 'left'; x.textBaseline = 'top';
    x.fillStyle = COL.dim; x.font = '600 22px Rajdhani, sans-serif'; x.fillText('HOSTILE', 12, 10);
    x.fillStyle = n ? COL.am : COL.cy; x.font = '700 76px Rajdhani, sans-serif'; x.fillText(String(n).padStart(2, '0'), 12, 30);
    const ring = (cx, cy, r, v, c, name) => {
      x.lineWidth = 9; x.strokeStyle = COL.grid; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = c; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(v, 0, 1)); x.stroke();
      x.fillStyle = COL.wh; x.font = '700 24px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(Math.round(v * 100)), cx, cy);
      x.fillStyle = COL.dim; x.font = '600 18px Rajdhani, sans-serif'; x.fillText(name, cx, cy + r + 18);
    };
    const en = ui.en ?? 1, heat = clamp(0.35 + (1 - en) * 0.4 + (ui.boost || 0) * 0.25, 0, 1);
    ring(70, 170, 38, en, en > 0.25 ? COL.cy : COL.am, 'EN');
    ring(180, 170, 38, heat, heat > 0.8 ? COL.rd : COL.am, 'HEAT');
    x.textAlign = 'right'; x.textBaseline = 'top'; x.font = '700 26px Rajdhani, sans-serif';
    x.fillStyle = ui.lockAlert > 0.01 ? (Math.sin(this.t * 16) > 0 ? COL.rd : COL.bg) : COL.gr;
    x.fillText(ui.lockAlert > 0.01 ? 'LOCK!' : 'CLEAR', w - 12, 14);
  }
  // 推進器輸出直條（頭頂，參考圖綠色那排）
  drawBars(x, w, h, ui) {
    const t = this.t, b = (ui.boost || 0) + (ui.hover || 0) * 0.7;
    for (let i = 0; i < 14; i++) {
      const v = clamp(0.25 + b * 0.6 + 0.12 * Math.sin(t * (3 + i * 0.7) + i * 1.3) + (Math.random() - 0.5) * 0.08 * (1 + b), 0.05, 1);
      const bx = 10 + i * 35, bh = (h - 24) * v;
      x.fillStyle = COL.grid; x.fillRect(bx, 12, 24, h - 24);
      x.fillStyle = v > 0.85 ? COL.am : COL.gr; x.fillRect(bx, h - 12 - bh, 24, bh);
    }
  }
  // 反應爐波形（頭頂）
  drawWave(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const t = this.t, amp = 18 + (ui.boost || 0) * 24 + (ui.hover || 0) * 12;
    x.strokeStyle = COL.cy; x.lineWidth = 3; x.beginPath();
    for (let i = 0; i <= w; i += 4) {
      const y = h / 2 + Math.sin(i * 0.045 + t * 7) * amp * 0.6 + Math.sin(i * 0.13 - t * 11) * amp * 0.3;
      if (i) x.lineTo(i, y); else x.moveTo(i, y);
    }
    x.stroke();
    x.fillStyle = COL.wh; x.font = '700 24px Rajdhani, sans-serif'; x.textAlign = 'right'; x.textBaseline = 'top';
    x.fillText(`${(98 + Math.sin(t) * 1.5).toFixed(1)}%`, w - 10, 6);
  }

  drawSpd(x, w, h, ui) {
    const sp = Math.round((ui.speed || 0) * 3.6);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = COL.dim; x.font = '600 30px Rajdhani, sans-serif'; x.fillText('km/h', w / 2, 200);
    x.fillStyle = (ui.boost || 0) > 0.5 ? COL.cy : COL.wh; x.font = '700 92px Rajdhani, sans-serif'; x.fillText(String(sp), w / 2, 120);
    // 速度弧
    x.lineWidth = 10; x.strokeStyle = COL.grid; x.beginPath(); x.arc(w / 2, 130, 110, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
    x.strokeStyle = (ui.boost || 0) > 0.5 ? COL.cy : COL.dim; x.beginPath(); x.arc(w / 2, 130, 110, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * clamp(sp / 200, 0, 1))); x.stroke();
    if ((ui.boost || 0) > 0.5) { x.fillStyle = COL.cy; x.font = '700 30px Rajdhani, sans-serif'; x.fillText('BOOST', w / 2, 36); }
  }

  drawAlt(x, w, h, ui) {
    const alt = Math.max(0, Math.round(ui.alt || 0)), vs = ui.vs || 0;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = COL.dim; x.font = '600 30px Rajdhani, sans-serif'; x.fillText('m', w / 2, 200);
    x.fillStyle = COL.wh; x.font = '700 92px Rajdhani, sans-serif'; x.fillText(String(alt), w / 2, 120);
    // 升降箭頭
    x.fillStyle = vs > 1 ? COL.gr : vs < -1 ? COL.am : COL.grid;
    const up = vs >= 0 ? -1 : 1;
    x.beginPath(); x.moveTo(w - 36, 128 + up * 30); x.lineTo(w - 20, 128); x.lineTo(w - 52, 128); x.closePath(); x.fill();
    if (ui.hover) { x.fillStyle = COL.cy; x.font = '700 30px Rajdhani, sans-serif'; x.fillText('HOVER', w / 2, 36); }
  }
}
