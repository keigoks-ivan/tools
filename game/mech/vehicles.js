// 戰鬥載具：主力戰車、攻擊直升機、戰鬥機。
// 一發就爆的砲灰——血量低、打人不痛、準頭差，讓 18 m 高的機體打起來很爽。
// 幾何只建一次（每種材質合併成一個網格），同型載具全部共用 InstancedMesh；AI、武器、擊毀、殘骸都在這裡。
// 對 combat.js 來說，Vehicle 長得像 Enemy（pos、chest()、scale、ap、los、locks…），所以鎖定、HUD、雷達、分數、連殺都直接沿用。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stencilAtlas, stencilUV, detailMaps } from './textures.js';

const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _n = V3(), _v = V3(), _s = V3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _mt = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const ONE = new THREE.Vector3(1, 1, 1);
const STUB = { removeFromParent() {} };

// ---------------------------------------------------------------- 種類
//   ap＝耐久（步槍 430、飛彈 330、濺射 132 都一發死）；score＝擊毀分；scale＝給 HUD 框、光劍距離用的「體型」
//   cy＝胸口（瞄準點）離原點的高度；hitR＝飛彈近炸半徑；weight＝評價時間用的份量（雜兵機＝1）
export const VKIND = {
  tank: { ap: 120, score: 40, label: 'TNK', scale: 0.4, cy: 1.8, hitR: 5.5, stag: 1e9, weight: 0.25 },
  heli: { ap: 100, score: 60, label: 'HELI', scale: 0.6, cy: 0, hitR: 7, stag: 1e9, weight: 0.35 },
  jet: { ap: 100, score: 80, label: 'JET', scale: 0.6, cy: 0, hitR: 9, stag: 1e9, weight: 0.45 },
};
// 載具打人的總傷害上限：一群戰車同時開火也融不掉你（桶子滿 480、每秒回 20；不夠就故意打偏）
const BUDGET = { cap: 480, rate: 20 };
const DMG = { shell: 240, shellSplash: 0.45, mg: 10, rocket: 110, jetMsl: 150, jetGun: 10 };
const NODE = 120, NMAX = 5, LANE = 3.8;   // 道路格線（每 120 m 一條）、可用的路口範圍、車道偏移
const SHELL_V = 240;
const BURNT = [0.16, 0.14, 0.13];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 射線（原點 o、單位方向 d）對直立膠囊：回傳命中距離或 -1（同 combat.js）
function rayCapsule(o, d, cap, maxT) {
  const hx = d.x, hz = d.z, h2 = hx * hx + hz * hz;
  let t = h2 > 1e-6 ? ((cap.x - o.x) * hx + (cap.z - o.z) * hz) / h2 : 0;
  t = clamp(t, 0, maxT);
  const px = o.x + hx * t - cap.x, pz = o.z + hz * t - cap.z, dh = Math.hypot(px, pz);
  if (dh > cap.r) return -1;
  const y = o.y + d.y * t;
  if (y < cap.y0 - cap.r || y > cap.y1 + cap.r) return -1;
  const back = h2 > 1e-6 ? Math.sqrt(cap.r * cap.r - dh * dh) / Math.sqrt(h2) : 0;
  return Math.max(0, t - back);
}
const inCap = (p, cap, pad) => Math.hypot(p.x - cap.x, p.z - cap.z) < cap.r + pad && p.y > cap.y0 - pad && p.y < cap.y1 + pad;

// ================================================================ 幾何工具（同 mechs.js 的做法：非索引、頂點色＋每頂點 PBR）
const EXT_EDGE = (nx, ny, nz) => (Math.abs(nz) > 0.12 && Math.abs(nz) < 0.97 ? 1 : 0);
const BOX_EDGE = (nx, ny, nz) => ((Math.abs(nz) > 0.12 && Math.abs(nz) < 0.97) || (Math.abs(nx) > 0.3 && Math.abs(ny) > 0.3 && Math.abs(nz) < 0.12) ? 1 : 0);
function prep(g, edgeFn) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.normal, e = new Float32Array(n.count);
  if (edgeFn) for (let i = 0; i < n.count; i++) e[i] = edgeFn(n.getX(i), n.getY(i), n.getZ(i));
  g.userData.edge = e;
  return g;
}
function extrude(shape, depth, bev) {
  if (Array.isArray(shape)) shape = new THREE.Shape(shape.map(([x, y]) => new THREE.Vector2(x, y)));
  bev = Math.max(0.004, Math.min(bev, depth * 0.3));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.004, depth - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev,
    bevelSegments: 1, curveSegments: 5,
  });
  g.translate(0, 0, -(depth - bev * 2) / 2);
  return g;
}
function oct(w, h, cut) {
  const x = w / 2, y = h / 2;
  cut = Math.min(cut, x * 0.45, y * 0.45);
  return cut > 0.004
    ? [[-x + cut, -y], [x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]]
    : [[-x, -y], [x, -y], [x, y], [-x, y]];
}
// 倒角方塊：寬 w（x）、高 h（y）、深 d（z）
const blk = (w, h, d, c = 0.03, cut = c) => prep(extrude(oct(w, h, cut), d, Math.min(c, w * 0.2, h * 0.2, d * 0.3)), BOX_EDGE);
// 側面輪廓 [[z,y]...] 沿 X 擠出寬度
function prof(pts, width, c = 0.04) { const g = prep(extrude(pts, width, c), EXT_EDGE); g.rotateY(-Math.PI / 2); return g; }
// 俯視輪廓 [[x,z]...] 沿 Y 擠出高度（中心在 y＝0）
function top(pts, h, c = 0.04) { const g = prep(extrude(pts.map(([x, z]) => [x, -z]), h, c), EXT_EDGE); g.rotateX(-Math.PI / 2); return g; }
const cyl = (rt, rb, h, seg = 16) => prep(new THREE.CylinderGeometry(rt, rb, h, seg));
const cylZ = (rt, rb, h, seg = 16) => cyl(rt, rb, h, seg).rotateX(Math.PI / 2);     // 軸朝 +z（rt 在 +z 端）
const cylX = (rt, rb, h, seg = 16) => cyl(rt, rb, h, seg).rotateZ(-Math.PI / 2);    // 軸朝 +x
const sph = (r, ws = 14, hs = 10) => prep(new THREE.SphereGeometry(r, ws, hs));
function lathe(pts, seg = 16) { return prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)); }
function taper(g, sxTop, szTop = sxTop) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y || 1);
    p.setX(i, p.getX(i) * THREE.MathUtils.lerp(1, sxTop, t));
    p.setZ(i, p.getZ(i) * THREE.MathUtils.lerp(1, szTop, t));
  }
  g.computeVertexNormals();
  return g;
}
// 機身放樣：站位 [z, 半寬, 頂, 底]（z 由前往後遞減），截面是超橢圓
function loft(st, seg = 20, pw = 2.5) {
  const pos = [], idx = [];
  for (const s of st) {
    const yc = (s[2] + s[3]) / 2, h = (s[2] - s[3]) / 2;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      pos.push(s[1] * Math.sign(c) * Math.pow(Math.abs(c), 2 / pw), yc + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw), s[0]);
    }
  }
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
    idx.push(a, c, b, b, c, d);
  }
  const l = st.length - 1, c0 = pos.length / 3;
  pos.push(0, (st[0][2] + st[0][3]) / 2, st[0][0], 0, (st[l][2] + st[l][3]) / 2, st[l][0]);
  for (let k = 0; k < seg; k++) { idx.push(c0, k, (k + 1) % seg); idx.push(c0 + 1, l * seg + ((k + 1) % seg), l * seg + k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return prep(g, null);
}
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

const P = (hex, m = 0, r = 0.6) => ({ c: new THREE.Color(hex), m, r });
const E = (r, g, b) => ({ c: new THREE.Color(r, g, b), m: 0, r: 1, glow: true });   // 發光（HDR 顏色）
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
class Kit {
  constructor(seed = 1) { this.g = []; this.rnd = rng(seed); this.soot = []; }
  add(g, p, m) {
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), pbr = new Float32Array(n * 4), dcl = new Float32Array(n * 4);
    const e = g.userData.edge, ds = g.userData.dcl;
    // 每片零件的漆色有一點批次差（金屬、發光、標示不動）
    const k = p.m < 0.5 && !p.glow && !ds ? 1 + (this.rnd() - 0.5) * 0.08 : 1;
    for (let i = 0; i < n; i++) {
      col[i * 3] = p.c.r * k; col[i * 3 + 1] = p.c.g * k; col[i * 3 + 2] = p.c.b * k;
      pbr[i * 4] = p.m; pbr[i * 4 + 1] = p.r; pbr[i * 4 + 2] = e ? e[i] : 0;
      dcl[i * 4 + 3] = 1;
    }
    if (ds) dcl.set(ds);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 4));
    g.setAttribute('dcl', new THREE.BufferAttribute(dcl, 4));
    this.g.push(g);
    return this;
  }
  // 燻黑來源：零件座標 (x,y,z)、半徑 R（排氣口、砲口）
  sootAt(x, y, z, R) { this.soot.push([x, y, z, R]); return this; }
  // pbr.w＝離地高度（下半部沾灰塵用）；yOff＝這個零件原點離地多高，dust=false 就不沾；dcl.w＝1−燻黑量
  build(yOff = 0, dust = true) {
    const g = mergeGeometries(this.g);
    const p = g.attributes.position, pbr = g.attributes.pbr, dcl = g.attributes.dcl;
    for (let i = 0; i < p.count; i++) {
      pbr.setW(i, dust ? p.getY(i) + yOff : 99);
      let s = 0;
      for (const [x, y, z, R] of this.soot) {
        const d = Math.hypot(p.getX(i) - x, p.getY(i) - y, p.getZ(i) - z);
        if (d < R) s = Math.max(s, THREE.MathUtils.smoothstep(R - d, 0, R * 0.7));
      }
      if (s > 0) dcl.setW(i, 1 - s);
    }
    g.computeBoundingSphere();
    return g;
  }
}
// 噴漆標示片（同 mechs.js）：面朝 face（'z'、'-z'、'x'、'-x'、'y'、'-y'），tint：1 米白 2 黑 3 黃 4 紅 5 圖集原色 6 灰
function sten(cell, w, h, { tint = 1, digit = 0, face = 'z', ox = 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, h).toNonIndexed();
  const uv = g.attributes.uv, n = uv.count, d = new Float32Array(n * 4);
  const [u0, v0, u1, v1] = stencilUV(cell, digit);
  for (let i = 0; i < n; i++) {
    d[i * 4] = u0 + (u1 - u0) * uv.getX(i); d[i * 4 + 1] = v0 + (v1 - v0) * uv.getY(i);
    d[i * 4 + 2] = tint; d[i * 4 + 3] = 1;
  }
  g.deleteAttribute('uv');
  g.translate(ox, 0, 0);
  if (face === 'x') g.rotateY(Math.PI / 2); else if (face === '-x') g.rotateY(-Math.PI / 2);
  else if (face === '-z') g.rotateY(Math.PI); else if (face === 'y') g.rotateX(-Math.PI / 2); else if (face === '-y') g.rotateX(Math.PI / 2);
  g.userData.edge = new Float32Array(n);
  g.userData.dcl = d;
  return g;
}
function digits(str, h, opt = {}) {
  const w = h * 0.5, list = [];
  for (let k = 0; k < str.length; k++) list.push(sten('d0', w, h, { ...opt, digit: +str[k], ox: (k - (str.length - 1) / 2) * w * 0.95 }));
  const g = mergeGeometries(list), d = new Float32Array(g.attributes.position.count * 4);
  let o = 0;
  for (const s of list) { d.set(s.userData.dcl, o); o += s.userData.dcl.length; }
  g.userData.edge = new Float32Array(g.attributes.position.count);
  g.userData.dcl = d;
  return g;
}
// 合併（保留倒角邊）
function merge(list) {
  const g = mergeGeometries(list), e = new Float32Array(g.attributes.position.count);
  let o = 0;
  for (const s of list) { if (s.userData.edge) e.set(s.userData.edge, o); o += s.attributes.position.count; }
  g.userData.edge = e;
  return g;
}
const _up = new THREE.Vector3(0, 1, 0);
// 兩點之間的圓柱（管線、支柱、天線、面板縫）
function rod(a, b, r0, r1 = r0, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = cyl(r1, r0, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.divideScalar(len)));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
function pipe(points, r, seg = 12, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return prep(new THREE.TubeGeometry(curve, seg, r, radial, false));
}
function ring(r, t, seg = 16) { return prep(new THREE.TorusGeometry(r, t, 5, seg)); }   // 圓環（軸朝 z）

// ================================================================ 材質
// 同機體的塗裝 shader（掉漆、刮痕、雨痕、下半部沙塵用真實磨損貼圖三面投影），尺度改成載具大小；
// instanceColor 當「燒焦」色，殘骸整台變黑、金屬感消失。
function paintMaterial(A) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wearMap = { value: A.wearM };
    sh.uniforms.frameMap = { value: A.frameM };
    sh.uniforms.dclMap = { value: stencilAtlas() };
    sh.uniforms.paintMap = { value: detailMaps().paint };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 pbr; attribute vec4 dcl; varying vec4 vPbr; varying vec4 vDcl; varying vec3 vOP; varying vec3 vON; varying vec3 vTint;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPbr = pbr; vDcl = dcl; vOP = position; vON = normal;
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor.rgb;
        #else
          vTint = vec3(1.0);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D wearMap, frameMap, dclMap, paintMap;
        varying vec4 vPbr; varying vec4 vDcl; varying vec3 vOP; varying vec3 vON; varying vec3 vTint;
        vec4 vh_tri(sampler2D t, vec3 p, vec3 n, float s){
          vec3 a = pow(abs(n), vec3(4.0)); a /= (a.x + a.y + a.z + 1e-5);
          return texture2D(t, p.zy * s) * a.x + texture2D(t, p.xz * s + 0.31) * a.y + texture2D(t, p.xy * s + 0.67) * a.z;
        }
        float vh_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vh_n(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(vh_h(i), vh_h(i + vec3(1,0,0)), f.x), mix(vh_h(i + vec3(0,1,0)), vh_h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(vh_h(i + vec3(0,0,1)), vh_h(i + vec3(1,0,1)), f.x), mix(vh_h(i + vec3(0,1,1)), vh_h(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 vh_nO = normalize(vON);
        // 噴漆標示（燒焦時跟著變黑）
        vec4 vh_dc = texture2D(dclMap, vDcl.xy);
        float vh_dA = vDcl.z > 0.5 ? vh_dc.a * 0.9 : 0.0;
        vec3 vh_tc = vDcl.z < 1.5 ? vec3(0.58, 0.56, 0.48) : vDcl.z < 2.5 ? vec3(0.018) : vDcl.z < 3.5 ? vec3(0.55, 0.36, 0.05) : vDcl.z < 4.5 ? vec3(0.42, 0.03, 0.025) : vDcl.z < 5.5 ? vh_dc.rgb : vec3(0.045, 0.05, 0.055);
        diffuseColor.rgb = mix(diffuseColor.rgb, vh_tc * vTint, vh_dA);
        vec4 vh_W = vh_tri(wearMap, vOP, vh_nO, 0.42);
        vec4 vh_F = vh_tri(frameMap, vOP, vh_nO, 0.9);
        float vh_S = vh_tri(wearMap, vOP * vec3(1.0, 0.12, 1.0), vh_nO, 0.6).b;
        float vh_nz = vh_n(vOP * 0.9);
        float vh_nz2 = vh_n(vOP * 3.3 + 7.0);
        float vh_paint = 1.0 - step(0.5, vPbr.x);
        float vh_edge = vPbr.z;
        float vh_burnt = clamp(1.0 - vTint.g, 0.0, 1.0);
        float vh_chipN = (1.0 - vh_W.b) * 0.95 + vh_edge * (0.2 + 0.55 * vh_nz) + (vh_nz - 0.5) * 0.35;
        float vh_th = 0.86;
        float vh_chip = vh_paint * smoothstep(vh_th, vh_th + 0.04, vh_chipN);
        float vh_halo = vh_paint * smoothstep(vh_th - 0.1, vh_th, vh_chipN) * (1.0 - vh_chip);
        vec4 vh_P = vh_tri(paintMap, vOP, vh_nO, 0.7);   // 漆面照片細節（刮痕、雨痕、鏽點）
        vec3 vh_base = diffuseColor.rgb * (0.86 + vh_nz * 0.18 + (vh_nz2 - 0.5) * 0.08);
        vh_base *= mix(1.0, 0.64 + 0.72 * vh_P.r, vh_paint);
        vh_base = mix(vh_base, vec3(0.17, 0.075, 0.03) * vTint, vh_P.b * vh_paint * 0.6);
        vh_base = mix(vh_base, vh_base * 1.3 + 0.012, vh_edge * mix(0.3, 0.6, vh_paint));
        float vh_streak = smoothstep(0.3, 0.9, 1.0 - vh_S) * vh_paint * 0.6;
        vh_base *= 1.0 - vh_streak * 0.35;
        float vh_dust = smoothstep(2.6, 0.0, vPbr.w) * (0.35 + 0.65 * vh_nz);
        vh_base = mix(vh_base, vec3(0.3, 0.26, 0.21) * vTint, vh_dust * 0.5);
        vh_base *= 1.0 - vh_halo * 0.45;
        diffuseColor.rgb = mix(vh_base, vec3(0.42, 0.42, 0.43) * (0.8 + vh_W.g) * vTint, vh_chip);
        // 排氣口、砲口燻黑
        float vh_soot = clamp((1.0 - vDcl.w) * (0.55 + 0.45 * vh_nz2), 0.0, 0.92);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.027, 0.024) * vTint, vh_soot);
        float vh_bump = vh_W.b * 0.35 - vh_chip * 0.5 + (1.0 - vh_paint) * vh_F.b * 0.5 + vh_paint * vh_P.r * 0.3;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(mix(vPbr.y, vh_P.g, 0.4 * vh_paint) + (vh_W.g - 0.15) * 0.3 * vh_paint + (vh_F.g - 0.65) * 0.6 * (1.0 - vh_paint) + vh_dust * 0.35 + vh_streak * 0.12 + vh_burnt * 0.4 + vh_soot * 0.3 - vh_dA * 0.06, 0.04, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.3 + vh_W.g * 0.3, vh_chip);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = max(vPbr.x * (1.0 - vh_dA) * (1.0 - vh_soot * 0.6), vh_chip * 0.95) * (1.0 - vh_burnt * 0.85);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(vh_bump), hy = dFdy(vh_bump);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad * 0.03);
        }`);
  };
  m.customProgramCacheKey = () => 'vehicle-paint-3';
  return m;
}
// 旋翼動態模糊盤：半透明徑向貼圖（細環紋＋翼尖亮環）
function discTexture() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d'), img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = ((i + 0.5) / S) * 2 - 1, v = ((j + 0.5) / S) * 2 - 1, r = Math.hypot(u, v);
    let a = 0;
    if (r < 1) {
      a = (0.13 + 0.07 * Math.sin(r * 47) ** 2) * smooth(0.05, 0.2, r) * (1 - smooth(0.9, 1, r));
      a += 0.2 * Math.exp(-(((r - 0.92) / 0.03) ** 2));
    }
    const k = (j * S + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = 40; d[k + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ================================================================ 塗裝
const TK = {
  main: P(0x4a5040, 0, 0.72), dark: P(0x252822, 0.1, 0.72), rubber: P(0x141414, 0, 0.92), steel: P(0x46494b, 0.8, 0.45),
  track: P(0x2a2a28, 0.65, 0.62), glass: P(0x070b0e, 0, 0.05), canvas: P(0x5d5441, 0, 0.95), lamp: P(0x8d8a80, 0.2, 0.25),
};
const HC = {
  body: P(0x42463d, 0, 0.7), dark: P(0x1e201e, 0.15, 0.68), steel: P(0x45484a, 0.8, 0.42), glass: P(0x0a1116, 0, 0.04),
  blade: P(0x1f2120, 0, 0.55), rubber: P(0x141414, 0, 0.9), pod: P(0x33382e, 0, 0.62),
};
const JC = {
  body: P(0x646a6f, 0, 0.58), dark: P(0x2b2e31, 0.3, 0.58), steel: P(0x4a4d50, 0.85, 0.35), glass: P(0x1a1810, 0.35, 0.04),
  nozzle: P(0x3a3632, 0.9, 0.45), msl: P(0xb8b8b2, 0, 0.5),
};

// ================================================================ 戰車（原點在地面、+z 朝前；全長約 10 m、寬 3.7 m、高 2.6 m）
function buildTank() {
  const H = new Kit(11), Tu = new Kit(12), B = new Kit(13), L = new Kit(14);
  const c = TK;
  // 履帶外圈取樣（每 0.2 m 一片履帶板；上段被側裙擋住的不做）
  const loopPts = [[-3.3, 0.02], [2.95, 0.02], [3.3, 0.18], [3.72, 0.45], [3.82, 0.66], [3.74, 0.86], [3.5, 0.97], [-3.55, 1.0], [-3.8, 0.9], [-3.9, 0.66], [-3.8, 0.42], [-3.4, 0.14], [-3.3, 0.02]];
  const shoeAt = [];
  {
    const seg = [];
    let total = 0;
    for (let i = 0; i < loopPts.length - 1; i++) { const l = Math.hypot(loopPts[i + 1][0] - loopPts[i][0], loopPts[i + 1][1] - loopPts[i][1]); seg.push(l); total += l; }
    for (let d = 0.1; d < total; d += 0.2) {
      let i = 0, a = d;
      while (a > seg[i]) { a -= seg[i]; i++; }
      const [z0, y0] = loopPts[i], [z1, y1] = loopPts[i + 1], tz = (z1 - z0) / seg[i], ty = (y1 - y0) / seg[i];
      const z = z0 + tz * a, y = y0 + ty * a;
      if (y > 0.85 && z > -3.5 && z < 3.35) continue;
      shoeAt.push([z + ty * 0.03, y - tz * 0.03, Math.atan2(-ty, tz), ty, -tz]);
    }
  }
  // 車體：下車體夾在兩條履帶之間，上車體蓋過履帶；長斜的前裝甲
  H.add(prof([[-3.55, 0.42], [3.1, 0.42], [3.72, 0.98], [-3.8, 0.98]], 2.3, 0.05), c.main);
  H.add(prof([[-3.82, 0.96], [3.35, 0.96], [3.9, 1.12], [2.15, 1.5], [-3.65, 1.52], [-3.86, 1.34]], 3.56, 0.05), c.main);
  // 履帶（中空環）
  const outer = [[-3.3, 0.02], [2.95, 0.02], [3.3, 0.18], [3.72, 0.45], [3.82, 0.66], [3.74, 0.86], [3.5, 0.97], [-3.55, 1.0], [-3.8, 0.9], [-3.9, 0.66], [-3.8, 0.42], [-3.4, 0.14]];
  const inner = [[-3.36, 0.23], [-3.71, 0.46], [-3.8, 0.66], [-3.72, 0.83], [-3.53, 0.9], [3.46, 0.87], [3.64, 0.8], [3.71, 0.66], [3.62, 0.48], [3.24, 0.26], [2.92, 0.12], [-2.98, 0.12]];
  const tshape = new THREE.Shape(outer.map(([z, y]) => new THREE.Vector2(z, y)));
  tshape.holes.push(new THREE.Path(inner.map(([z, y]) => new THREE.Vector2(z, y))));
  for (const s of [-1, 1]) {
    const g = prep(extrude(tshape, 0.6, 0.02), EXT_EDGE); g.rotateY(-Math.PI / 2);
    H.add(g, c.track, T(s * 1.48, 0, 0));
    // 履帶板（每片沿外圈切線擺好，中間一道防滑齒）
    H.add(merge(shoeAt.map(([z, y, a]) => blk(0.64, 0.05, 0.15, 0.012, 0).applyMatrix4(T(s * 1.48, y, z, a)))), c.track);
    H.add(merge(shoeAt.map(([z, y, a, nz, ny]) => blk(0.5, 0.035, 0.04, 0.008, 0).applyMatrix4(T(s * 1.48, y + ny * 0.035, z + nz * 0.035, a)))), c.steel);
    // 負重輪 ×7、主動輪（後）、導輪（前）
    for (let k = 0; k < 7; k++) {
      const z = -2.58 + k * 0.86;
      H.add(cylX(0.36, 0.36, 0.5, 18), c.rubber, T(s * 1.48, 0.48, z));
      H.add(cylX(0.27, 0.27, 0.54, 16), c.dark, T(s * 1.48, 0.48, z));
      H.add(cylX(0.13, 0.13, 0.6, 10), c.steel, T(s * 1.48, 0.48, z));
      H.add(cylX(0.2, 0.2, 0.56, 12), c.dark, T(s * 1.48, 0.48, z));
    }
    H.add(cylX(0.32, 0.32, 0.52, 16), c.dark, T(s * 1.48, 0.66, -3.55));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      H.add(blk(0.5, 0.08, 0.1, 0.01), c.steel, T(s * 1.48, 0.66 + Math.sin(a) * 0.34, -3.55 + Math.cos(a) * 0.34, a));
    }
    H.add(cylX(0.1, 0.1, 0.58, 8), c.steel, T(s * 1.48, 0.66, -3.55));
    H.add(cylX(0.29, 0.29, 0.5, 16), c.dark, T(s * 1.48, 0.63, 3.5));
    H.add(cylX(0.09, 0.09, 0.56, 8), c.steel, T(s * 1.48, 0.63, 3.5));
    // 側裙板＋接縫、下緣橡膠擋片
    H.add(prof([[-3.45, 0.56], [3.0, 0.56], [3.42, 0.86], [3.42, 1.2], [-3.45, 1.2]], 0.07, 0.015), c.main, T(s * 1.84, 0, 0));
    for (const z of [-2.1, -0.8, 0.5, 1.8]) H.add(blk(0.085, 0.64, 0.035, 0.005), c.dark, T(s * 1.84, 0.88, z));
    H.add(blk(0.03, 0.12, 6.3, 0.005), c.rubber, T(s * 1.845, 0.5, -0.2));
    // 側裙上緣螺栓、國籍標誌、前擋泥板
    const bl = [];
    for (let k = 0; k <= 16; k++) bl.push(cylX(0.035, 0.035, 0.05, 6).applyMatrix4(T(s * 1.885, 1.12, -3.2 + k * 0.4)));
    H.add(merge(bl), c.steel);
    H.add(sten('star', 0.52, 0.52, { face: s > 0 ? 'x' : '-x', tint: 1 }), c.main, T(s * 1.877, 0.87, 1.15));
    H.add(prof([[3.35, 1.13], [3.92, 1.01], [3.96, 0.93], [3.35, 1.05]], 0.64, 0.01), c.main, T(s * 1.48, 0, 0));
    // 工具：十字鎬、鏟子
    H.add(rod([s * 1.62, 1.555, -3.45], [s * 1.62, 1.555, -2.4], 0.025, 0.025, 6), c.dark);
    H.add(rod([s * 1.32, 1.555, -3.5], [s * 1.32, 1.555, -2.62], 0.022, 0.022, 6), c.canvas);
    H.add(blk(0.22, 0.02, 0.32, 0.005), c.steel, T(s * 1.32, 1.55, -2.45));
    // 車體兩側的置物箱
    H.add(blk(0.42, 0.3, 1.6, 0.03), c.main, T(s * 1.5, 1.66, -1.5));
    H.add(blk(0.42, 0.26, 0.9, 0.03), c.main, T(s * 1.5, 1.64, 0.85));
    // 大燈座＋護框
    H.add(blk(0.3, 0.22, 0.2, 0.03), c.dark, T(s * 1.35, 1.3, 3.72));
    H.add(blk(0.04, 0.3, 0.3, 0.005), c.steel, T(s * 1.35 + 0.19, 1.3, 3.78));
    H.add(blk(0.04, 0.3, 0.3, 0.005), c.steel, T(s * 1.35 - 0.19, 1.3, 3.78));
    L.add(blk(0.2, 0.13, 0.03, 0.005), E(3.4, 3.0, 2.4), T(s * 1.35, 1.3, 3.83));
    L.add(blk(0.16, 0.08, 0.03, 0.005), E(3.5, 0.18, 0.08), T(s * 1.5, 1.38, -3.87));
    // 拖車鉤
    H.add(blk(0.16, 0.14, 0.22, 0.02), c.dark, T(s * 0.85, 0.82, 3.72));
    H.add(blk(0.16, 0.14, 0.22, 0.02), c.dark, T(s * 0.85, 0.9, -3.88));
  }
  // 引擎蓋散熱格柵
  H.add(blk(2.4, 0.04, 1.5, 0.01), c.dark, T(0, 1.52, -2.75));
  for (let k = 0; k < 7; k++) H.add(blk(2.3, 0.05, 0.08, 0.01), c.main, T(0, 1.55, -3.4 + k * 0.21));
  H.add(blk(1.7, 0.32, 0.06, 0.01), c.dark, T(0, 1.18, -3.86));
  // 後方排氣百葉＋燻黑、拖車標示
  H.add(merge(Array.from({ length: 9 }, (_, k) => blk(0.05, 0.3, 0.08, 0.008).applyMatrix4(T(-0.76 + k * 0.19, 1.18, -3.9)))), c.steel);
  H.sootAt(0, 1.2, -3.95, 1.6);
  H.add(sten('tow', 0.8, 0.1, { face: '-z', tint: 1 }), c.main, T(0, 0.795, -3.731, -0.42));
  // 駕駛艙蓋＋潛望鏡
  H.add(cyl(0.32, 0.34, 0.07, 14), c.main, T(0.55, 1.54, 2.0));
  for (const x of [0.3, 0.55, 0.8]) H.add(blk(0.16, 0.08, 0.05, 0.005), c.glass, T(x, 1.55, 2.32));
  // 前裝甲上的備用履帶板
  for (let k = 0; k < 5; k++) H.add(blk(0.56, 0.05, 0.22, 0.01), c.track, T(-1.15 + k * 0.575, 1.24, 3.26, -0.23));

  // ---- 砲塔（原點在砲塔環中心，裝在車體 (0,1.5,-0.4)）
  const tw = [[0.9, 2.05], [1.62, 1.25], [1.72, -1.4], [1.52, -2.55], [-1.52, -2.55], [-1.72, -1.4], [-1.62, 1.25], [-0.9, 2.05]];
  Tu.add(taper(top(tw, 0.8, 0.05), 0.9, 0.94), c.main, T(0, 0.4, 0));
  Tu.add(cyl(1.2, 1.25, 0.2, 20), c.dark, T(0, -0.05, 0));
  // 砲塔頰上的附加裝甲塊
  for (const s of [-1, 1]) {
    const x0 = 0.9 * s, z0 = 2.05, x1 = 1.62 * s, z1 = 1.25;
    let nx = (z1 - z0) * -s, nz = -(x1 - x0) * -s; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    if (nx * s < 0) { nx = -nx; nz = -nz; }
    for (let k = 0; k < 3; k++) for (let r = 0; r < 2; r++) {
      const t = 0.2 + k * 0.3;
      Tu.add(blk(0.3, 0.22, 0.09, 0.015), c.main, T(x0 + (x1 - x0) * t + nx * 0.05, 0.24 + r * 0.27, z0 + (z1 - z0) * t + nz * 0.05, 0, Math.atan2(nx, nz)));
    }
    // 煙幕彈發射器
    Tu.add(blk(0.2, 0.2, 0.46, 0.02), c.dark, T(s * 1.66, 0.55, 0.85));
    for (let k = 0; k < 4; k++) Tu.add(cyl(0.065, 0.065, 0.3, 8), c.dark, T(s * (1.7 + (k & 1) * 0.02), 0.62 + (k & 1) * 0.13, 0.72 + (k >> 1) * 0.2, 0.8, s * 0.35));
    // 側面置物箱
    Tu.add(blk(0.22, 0.4, 1.4, 0.03), c.main, T(s * 1.82, 0.36, -1.0));
    // 天線
    Tu.add(cyl(0.06, 0.07, 0.12, 8), c.dark, T(s * 1.15, 0.86, -2.2));
    Tu.add(cyl(0.012, 0.02, 2.5, 5), c.dark, T(s * 1.15, 2.1, -2.36, -0.12));
  }
  // 砲塔側面車號、頂部雷射告警器、吊耳、風速感測器、側面扶手
  for (const s of [-1, 1]) {
    Tu.add(digits('312', 0.3, { face: s > 0 ? 'x' : '-x', tint: 1 }), c.main, T(s * 1.588, 0.42, 0.28, 0, 0, s * 0.2));
    for (const z of [0.95, -2.05]) Tu.add(blk(0.16, 0.1, 0.16, 0.02), c.dark, T(s * 1.25, 0.84, z));
    for (const z of [0.4, -1.9]) Tu.add(ring(0.06, 0.018, 8), c.steel, T(s * 1.3, 0.86, z, 0, Math.PI / 2));
    Tu.add(rod([s * 1.72, 0.66, -1.65], [s * 1.72, 0.66, -0.35], 0.02, 0.02, 5), c.steel);
    for (const z of [-1.65, -0.35]) Tu.add(rod([s * 1.64, 0.6, z], [s * 1.72, 0.66, z], 0.018, 0.018, 5), c.steel);
  }
  Tu.add(cyl(0.02, 0.025, 0.6, 5), c.dark, T(0.3, 1.1, -2.2));
  Tu.add(cyl(0.06, 0.06, 0.08, 8), c.dark, T(0.3, 1.42, -2.2));
  // 車長塔＋觀測窗、艙蓋
  Tu.add(cyl(0.36, 0.4, 0.24, 16), c.main, T(-0.72, 0.9, -0.5));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; Tu.add(blk(0.14, 0.08, 0.05, 0.005), c.glass, T(-0.72 + Math.sin(a) * 0.37, 0.92, -0.5 + Math.cos(a) * 0.37, 0, a)); }
  Tu.add(cyl(0.3, 0.3, 0.07, 14), c.main, T(-0.72, 1.05, -0.56));
  // 車長獨立瞄準鏡（小方塊立在柱子上）
  Tu.add(cyl(0.1, 0.1, 0.36, 8), c.dark, T(-0.1, 0.96, -1.15));
  Tu.add(blk(0.38, 0.3, 0.36, 0.03), c.main, T(-0.1, 1.26, -1.15));
  Tu.add(blk(0.26, 0.18, 0.02, 0.005), c.glass, T(-0.1, 1.28, -0.96));
  // 砲手瞄準鏡
  Tu.add(blk(0.46, 0.36, 0.62, 0.04), c.main, T(0.9, 0.96, 1.05));
  Tu.add(blk(0.16, 0.16, 0.02, 0.005), c.glass, T(0.8, 0.98, 1.37));
  Tu.add(blk(0.12, 0.12, 0.02, 0.005), c.glass, T(1.02, 0.98, 1.37));
  // 裝填手艙蓋、遙控機槍塔
  Tu.add(cyl(0.3, 0.3, 0.07, 14), c.main, T(0.62, 0.83, -0.45));
  Tu.add(blk(0.34, 0.3, 0.46, 0.03), c.dark, T(0.75, 0.97, -1.35));
  Tu.add(cylZ(0.035, 0.035, 0.95, 6), c.steel, T(0.75, 1.0, -0.8));
  Tu.add(blk(0.16, 0.18, 0.28, 0.02), c.main, T(0.98, 0.95, -1.35));
  // 後方置物籃＋行李
  Tu.add(blk(2.7, 0.04, 0.55, 0.005), c.dark, T(0, 0.12, -2.83));
  Tu.add(blk(2.8, 0.05, 0.05, 0.005), c.dark, T(0, 0.62, -3.1));
  for (const s of [-1, 1]) {
    Tu.add(blk(0.05, 0.05, 0.55, 0.005), c.dark, T(s * 1.38, 0.62, -2.83));
    for (const x of [1.38, 0.46]) Tu.add(blk(0.05, 0.5, 0.05, 0.005), c.dark, T(s * x, 0.37, -3.1));
  }
  Tu.add(blk(0.8, 0.36, 0.46, 0.12), c.canvas, T(-0.8, 0.32, -2.85, 0, 0.05));
  Tu.add(blk(0.9, 0.3, 0.42, 0.12), c.canvas, T(0.25, 0.3, -2.84, 0, -0.04));
  Tu.add(blk(0.18, 0.36, 0.3, 0.02), c.main, T(0.95, 0.32, -2.85));
  Tu.add(blk(0.18, 0.36, 0.3, 0.02), c.main, T(1.17, 0.32, -2.85));

  // ---- 砲管（原點在耳軸，裝在砲塔 (0,0.42,1.95)；砲口在 (0,0,5.7)）
  B.add(blk(0.84, 0.56, 0.5, 0.06), c.main, T(0, 0, 0.2));
  B.add(cylZ(0.05, 0.05, 0.1, 8), c.dark, T(0.3, 0.06, 0.47));
  B.add(cylZ(0.1, 0.125, 4.9, 18), c.main, T(0, 0, 2.85));
  const fume = lathe([[0.11, -0.45], [0.17, -0.3], [0.185, 0], [0.17, 0.3], [0.11, 0.45]], 18); fume.rotateX(Math.PI / 2);
  B.add(fume, c.main, T(0, 0, 2.7));
  for (const z of [1.3, 3.8, 4.6]) B.add(cylZ(0.132, 0.132, 0.07, 16), c.main, T(0, 0, z));
  B.add(blk(0.36, 0.26, 0.36, 0.03), c.steel, T(0, 0, 5.47));
  B.add(blk(0.37, 0.07, 0.08, 0.005), c.dark, T(0, 0, 5.4));
  B.add(blk(0.37, 0.07, 0.08, 0.005), c.dark, T(0, 0, 5.54));
  B.add(cylZ(0.075, 0.075, 0.02, 12), P(0x050505, 0, 0.9), T(0, 0, 5.66));
  B.add(blk(0.08, 0.06, 0.1, 0.005), c.dark, T(0, 0.13, 5.2));
  // 砲盾防塵套（帆布、兩道褶）、同軸機槍管、砲口燻黑
  B.add(cylZ(0.24, 0.21, 0.38, 14), c.canvas, T(0, 0, 0.64));
  for (const z of [0.54, 0.72]) B.add(cylZ(0.25, 0.25, 0.04, 14), c.canvas, T(0, 0, z));
  B.add(cylZ(0.03, 0.03, 0.34, 6), c.dark, T(0.3, 0.06, 0.62));
  B.sootAt(0, 0, 5.7, 0.9);

  return { hull: H.build(0), tur: Tu.build(1.5), bar: B.build(1.92), lit: L.build(0, false) };
}

// ================================================================ 攻擊直升機（原點在重心、+z 朝前；機身約 15 m、主旋翼直徑 14.6 m）
function buildHeli() {
  const Bd = new Kit(21), R = new Kit(22), Tr = new Kit(23), L = new Kit(24), Bc = new Kit(25);
  const c = HC;
  // 機身
  Bd.add(loft([
    [7.3, 0.1, -0.2, -0.45], [7.05, 0.36, 0.08, -0.8], [6.3, 0.55, 0.3, -1.0], [4.8, 0.62, 0.45, -1.1], [3.0, 0.68, 0.6, -1.15],
    [1.2, 0.8, 0.85, -1.15], [-0.8, 0.82, 0.9, -1.05], [-2.4, 0.6, 0.72, -0.72], [-3.6, 0.36, 0.52, -0.12], [-7.6, 0.2, 0.46, 0.12], [-8.5, 0.15, 0.42, 0.2],
  ], 22, 2.4), c.body);
  // 縱列雙座座艙罩（前座低、後座高）＋框
  const can = [[6.3, 0.18, 0.32, 0.2], [5.9, 0.48, 0.92, 0.2], [4.9, 0.56, 1.18, 0.35], [4.0, 0.56, 1.24, 0.45], [3.75, 0.58, 1.52, 0.5], [2.4, 0.6, 1.72, 0.6], [1.45, 0.55, 1.55, 0.78], [1.05, 0.3, 1.1, 0.84]];
  Bd.add(loft(can, 20, 2.2), c.glass);
  for (const i of [1, 2, 3, 4, 5, 6]) { const s = can[i]; Bd.add(loft([[s[0] + 0.05, s[1] + 0.025, s[2] + 0.025, s[3]], [s[0] - 0.05, s[1] + 0.025, s[2] + 0.025, s[3]]], 20, 2.2), c.dark); }
  // 座艙罩頂部縱樑、上下剪線器
  Bd.add(pipe(can.slice(1, 7).map((s) => [0, s[2] + 0.012, s[0]]), 0.03, 14, 5), c.dark);
  Bd.add(prof([[3.45, 1.52], [3.12, 1.92], [2.98, 1.92], [3.25, 1.52]], 0.05, 0.01), c.dark);
  Bd.add(prof([[6.3, -0.92], [6.72, -1.22], [6.56, -1.24], [6.1, -0.96]], 0.05, 0.01), c.dark);
  // 引擎整流罩、左右引擎、排氣口
  Bd.add(loft([[1.5, 0.45, 0.95, 0.6], [1.0, 0.72, 1.36, 0.6], [-1.6, 0.72, 1.36, 0.6], [-2.7, 0.38, 1.0, 0.55]], 18, 3), c.body);
  for (const s of [-1, 1]) {
    Bd.add(cylZ(0.4, 0.42, 3.0, 16), c.body, T(s * 0.98, 0.98, -0.6));
    Bd.add(cylZ(0.3, 0.3, 0.05, 14), c.dark, T(s * 0.98, 0.98, 0.92));
    // 進氣口唇環＋防異物網條、發動機艙束帶與檢修蓋鉸鏈
    Bd.add(ring(0.39, 0.05, 16), c.steel, T(s * 0.98, 0.98, 0.93));
    Bd.add(merge([0, Math.PI / 3, -Math.PI / 3].map((a) => blk(0.58, 0.03, 0.03, 0.005, 0).applyMatrix4(T(s * 0.98, 0.98, 0.955, 0, 0, a)))), c.steel);
    for (const z of [-0.1, -1.35]) Bd.add(cylZ(0.43, 0.43, 0.05, 16), c.dark, T(s * 0.98, 0.98, z));
    Bd.add(rod([s * 1.36, 1.1, 0.6], [s * 1.36, 1.1, -1.9], 0.025, 0.025, 5), c.steel);
    Bd.add(cylZ(0.27, 0.34, 0.9, 12), c.dark, T(s * 1.12, 1.05, -2.25, -0.25, s * 0.35));
    Bd.sootAt(s * 1.3, 1.15, -2.7, 1.5);
    // 短翼＋掛架＋火箭莢艙＋飛彈
    Bd.add(blk(2.2, 0.14, 1.3, 0.05), c.body, T(s * 1.85, -0.25, 0.1, 0, 0, s * -0.07));
    Bd.add(blk(0.08, 0.34, 1.0, 0.02), c.dark, T(s * 2.95, -0.33, 0.1));
    for (const x of [1.45, 2.45]) Bd.add(blk(0.12, 0.3, 0.8, 0.02), c.dark, T(s * x, -0.45, 0.15));
    Bd.add(cylZ(0.26, 0.26, 1.6, 14), c.pod, T(s * 1.45, -0.74, 0.2));
    Bd.add(cylZ(0.23, 0.23, 0.03, 12), P(0x0b0b0b, 0, 0.9), T(s * 1.45, -0.74, 1.01));
    Bd.add(cylZ(0.12, 0.26, 0.3, 12), c.pod, T(s * 1.45, -0.74, -0.75));
    // 火箭莢艙：七個發射管口、兩道束帶；短翼上 NO STEP
    Bd.add(merge([[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3) * 0.14, Math.sin(k * Math.PI / 3) * 0.14])].map(([x, y]) => cylZ(0.045, 0.045, 0.02, 8).applyMatrix4(T(s * 1.45 + x, -0.74 + y, 1.03)))), P(0x050505, 0, 0.9));
    for (const z of [0.7, -0.3]) Bd.add(cylZ(0.275, 0.275, 0.05, 14), c.dark, T(s * 1.45, -0.74, z));
    Bd.add(sten('nostep', 0.7, 0.17, { face: 'y', tint: 1 }), c.body, T(s * 1.95, -0.172, 0.3, 0, 0, s * -0.07));
    for (const x of [2.3, 2.6]) {
      Bd.add(cylZ(0.09, 0.09, 1.5, 8), P(0x5a5f55, 0, 0.55), T(s * x, -0.7, 0.2));
      Bd.add(sph(0.09, 8, 6), P(0x5a5f55, 0, 0.55), T(s * x, -0.7, 0.95));
      Bd.add(sph(0.075, 8, 6), c.glass, T(s * x, -0.7, 0.99));
      Bd.add(merge([0, 1].map((k) => blk(0.02, 0.34, 0.2, 0.004).applyMatrix4(T(s * x, -0.7, -0.45, 0, 0, Math.PI / 4 + k * Math.PI / 2)))), c.dark);
    }
    // 主起落架
    Bd.add(blk(0.1, 0.8, 0.14, 0.02), c.dark, T(s * 1.0, -1.45, 2.3, 0, 0, s * 0.25));
    Bd.add(cylX(0.3, 0.3, 0.2, 12), c.rubber, T(s * 1.12, -1.9, 2.3));
    // 機身兩側航電艙（凸出的艙體＋檢修蓋縫＋散熱百葉＋登機踏階）
    Bd.add(prof([[3.2, -0.32], [2.3, -0.24], [-0.8, -0.24], [-1.05, -0.45], [-0.85, -0.86], [2.6, -0.86], [3.25, -0.58]], 0.32, 0.05), c.body, T(s * 0.78, 0, 0));
    Bd.add(merge([rod([s * 0.945, -0.3, 1.9], [s * 0.945, -0.8, 1.9], 0.012, 0.012, 4), rod([s * 0.945, -0.3, 0.6], [s * 0.945, -0.8, 0.6], 0.012, 0.012, 4), rod([s * 0.945, -0.3, 1.9], [s * 0.945, -0.3, 0.6], 0.012, 0.012, 4)]), c.dark);
    Bd.add(merge(Array.from({ length: 5 }, (_, k) => blk(0.03, 0.04, 0.5, 0.005).applyMatrix4(T(s * 0.945, -0.45 - k * 0.07, -0.25)))), c.dark);
    Bd.add(sten('ground', 0.9, 0.08, { face: s > 0 ? 'x' : '-x', tint: 1 }), c.body, T(s * 0.945, -0.72, 1.25));
    Bd.add(blk(0.22, 0.03, 0.14, 0.005), c.steel, T(s * 0.98, -0.95, 2.9));
    // 起落架油壓緩衝柱、輪轂
    Bd.add(rod([s * 0.9, -1.15, 2.3], [s * 1.06, -1.75, 2.3], 0.045, 0.045, 6), c.steel);
    Bd.add(cylX(0.12, 0.12, 0.24, 10), c.steel, T(s * 1.12, -1.9, 2.3));
    // 機身標示：救援箭頭、加油口、國籍標誌
    Bd.add(sten('rescue', 0.5, 0.25, { face: s > 0 ? 'x' : '-x', tint: 3 }), c.body, T(s * 0.668, -0.2, 3.6));
    Bd.add(sten('fuel', 0.9, 0.08, { face: s > 0 ? 'x' : '-x', tint: 1 }), c.body, T(s * 0.81, -0.4, -0.8));
    Bd.add(sten('star', 0.42, 0.42, { face: s > 0 ? 'x' : '-x', tint: 1 }), c.body, T(s * 0.748, 0.0, -1.5, 0, s * 0.137));
    Bd.add(sten('rotor', 1.4, 0.12, { face: s > 0 ? 'x' : '-x', tint: 4 }), c.body, T(s * 0.257, 0.265, -6.5, 0, s * 0.04));
  }
  // 機鼻感測器轉塔、機砲塔
  Bd.add(sph(0.36, 14, 10), c.dark, T(0, -0.42, 7.05));
  Bd.add(blk(0.2, 0.14, 0.04, 0.01), c.glass, T(-0.1, -0.38, 7.4));
  Bd.add(blk(0.12, 0.12, 0.04, 0.01), c.glass, T(0.15, -0.46, 7.39));
  Bd.add(blk(0.4, 0.2, 0.5, 0.04), c.dark, T(0, -1.12, 5.3));
  Bd.add(sph(0.28, 12, 8), c.dark, T(0, -1.3, 5.3));
  Bd.add(cylZ(0.05, 0.055, 1.5, 8), c.steel, T(0, -1.33, 6.1));
  Bd.add(cylZ(0.075, 0.075, 0.5, 8), c.dark, T(0, -1.33, 5.75));
  Bd.add(pipe([[0, -1.08, 5.05], [0, -1.02, 4.6], [0, -0.98, 4.0]], 0.06, 8, 5), c.dark);
  Bd.add(ring(0.37, 0.04, 16), c.dark, T(0, -0.42, 6.98));
  // 天線：尾桁上、機腹
  Bd.add(prof([[-4.8, 0.45], [-5.2, 0.8], [-5.35, 0.8], [-5.1, 0.45]], 0.04, 0.008), c.dark);
  Bd.add(prof([[-1.2, -1.0], [-1.55, -1.32], [-1.7, -1.32], [-1.5, -1.0]], 0.04, 0.008), c.dark);
  // 旋翼軸
  Bd.add(cyl(0.16, 0.2, 0.8, 12), c.steel, T(0, 1.72, 0.1));
  // 尾部：垂直尾翼、水平安定面、尾輪
  Bd.add(prof([[-8.6, 0.3], [-7.4, 0.3], [-7.85, 2.3], [-8.45, 2.42], [-8.95, 0.9]], 0.16, 0.03), c.body);
  Bd.add(blk(2.9, 0.08, 0.62, 0.02), c.body, T(0, 0.46, -7.45));
  Bd.add(blk(0.08, 0.5, 0.1, 0.02), c.dark, T(0, -0.1, -7.2));
  Bd.add(cylX(0.14, 0.14, 0.1, 10), c.rubber, T(0, -0.36, -7.2));
  // 垂尾：尾旋翼齒輪箱整流罩、機號、國籍標誌、紅白警示
  Bd.add(blk(0.2, 0.4, 0.55, 0.05), c.body, T(-0.17, 1.75, -8.35));
  Bd.add(digits('07', 0.42, { face: 'x', tint: 1 }), c.body, T(0.09, 1.0, -8.2));
  Bd.add(sten('star', 0.4, 0.4, { face: '-x', tint: 1 }), c.body, T(-0.09, 1.0, -8.15));
  Bd.add(sten('redwhite', 0.6, 0.14, { face: 'x', tint: 5 }), c.body, T(0.09, 2.18, -8.17, 0.2));
  // 航行燈：左紅右綠尾白；防撞閃燈（紅）
  L.add(sph(0.1, 8, 6), E(7, 0.3, 0.2), T(3.0, -0.22, 0.1));
  L.add(sph(0.1, 8, 6), E(0.3, 6, 1.2), T(-3.0, -0.22, 0.1));
  L.add(sph(0.09, 8, 6), E(5, 5, 4.5), T(0, 0.45, -8.65));
  Bc.add(sph(0.12, 8, 6), E(9, 0.5, 0.3), T(0, 2.48, -8.45));
  Bc.add(sph(0.12, 8, 6), E(9, 0.5, 0.3), T(0, -1.18, -0.6));

  // ---- 主旋翼（原點在旋翼頭）
  R.add(cyl(0.34, 0.34, 0.3, 16), c.steel);
  R.add(cyl(0.1, 0.2, 0.36, 10), c.steel, T(0, 0.32, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const g = blk(6.9, 0.07, 0.52, 0.02);
    g.applyMatrix4(T(3.8, 0, 0, 0.07));           // 槳距
    g.applyMatrix4(T(0, 0, 0, 0, 0, -0.025));      // 下垂
    R.add(g, c.blade, T(0, 0, 0, 0, a));
    R.add(blk(0.72, 0.14, 0.26, 0.03), c.steel, T(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55, 0, a));
    // 槳根護套、翼尖蓋、彈性軸承、變距拉桿
    for (const [x, w, pp] of [[1.05, 0.5, c.dark], [7.12, 0.28, c.steel]]) {
      const cuff = blk(w, 0.1, 0.56, 0.02);
      cuff.applyMatrix4(T(x, 0, 0, 0.07)); cuff.applyMatrix4(T(0, 0, 0, 0, 0, -0.025));
      R.add(cuff, pp, T(0, 0, 0, 0, a));
    }
    R.add(sph(0.1, 8, 6), c.dark, T(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28));
    const b2 = a + 0.35;
    R.add(rod([Math.cos(b2) * 0.3, -0.4, -Math.sin(b2) * 0.3], [Math.cos(b2) * 0.52, -0.05, -Math.sin(b2) * 0.52], 0.022, 0.022, 5), c.steel);
  }
  R.add(cyl(0.42, 0.42, 0.05, 16), c.steel, T(0, 0.17, 0));
  R.add(cyl(0.42, 0.42, 0.05, 16), c.steel, T(0, -0.17, 0));
  R.add(cyl(0.36, 0.36, 0.06, 16), c.dark, T(0, -0.42, 0));
  // ---- 尾旋翼（原點在尾旋翼軸，軸朝 x）
  Tr.add(cylX(0.13, 0.13, 0.26, 10), c.steel);
  Tr.add(cylX(0.22, 0.22, 0.04, 12), c.dark, T(-0.12, 0, 0));
  for (let k = 0; k < 4; k++) {
    const g = blk(0.05, 1.3, 0.22, 0.01); g.applyMatrix4(T(0, 0.72, 0, 0, 0.1));
    Tr.add(g, c.blade, T(0, 0, 0, (k / 4) * Math.PI * 2));
  }
  const disc = new THREE.CircleGeometry(7.3, 48).rotateX(-Math.PI / 2);
  const tdisc = new THREE.CircleGeometry(1.42, 24).rotateY(Math.PI / 2);
  return { body: Bd.build(0, false), rotor: R.build(0, false), tail: Tr.build(0, false), lit: L.build(0, false), bcn: Bc.build(0, false), disc, tdisc };
}

// ================================================================ 戰鬥機（原點在重心、+z 朝前；全長 16.5 m、翼展 10 m、雙垂尾）
function buildJet() {
  const Bd = new Kit(31), L = new Kit(32);
  const c = JC, black = P(0x080808, 0, 0.9);
  Bd.add(loft([
    [8.4, 0.04, 0.02, -0.06], [7.5, 0.34, 0.26, -0.3], [5.9, 0.6, 0.52, -0.5], [3.9, 0.8, 0.66, -0.6], [1.5, 1.3, 0.6, -0.7],
    [-1.5, 1.42, 0.55, -0.6], [-5.0, 1.28, 0.5, -0.45], [-7.2, 1.08, 0.4, -0.36], [-7.9, 1.0, 0.36, -0.32],
  ], 30, 2.6), c.body);
  // 座艙罩＋風擋框、後框、IRST 球
  const can = [[5.5, 0.1, 0.54, 0.44], [4.9, 0.4, 1.02, 0.46], [3.7, 0.47, 1.18, 0.5], [2.4, 0.38, 1.0, 0.54], [1.6, 0.14, 0.72, 0.56]];
  Bd.add(loft(can, 18, 2.2), c.glass);
  for (const i of [1, 3]) { const s = can[i]; Bd.add(loft([[s[0] + 0.05, s[1] + 0.02, s[2] + 0.02, s[3]], [s[0] - 0.05, s[1] + 0.02, s[2] + 0.02, s[3]]], 18, 2.2), c.dark); }
  Bd.add(sph(0.11, 10, 8), c.glass, T(0.24, 0.56, 5.75));
  // 邊條翼（機鼻兩側一路接到主翼）
  Bd.add(top([[0.4, 6.2], [1.25, 3.4], [1.45, 1.4], [-1.45, 1.4], [-1.25, 3.4], [-0.4, 6.2]], 0.06, 0.02), c.body, T(0, 0.02, 0));
  // 主翼、水平尾翼
  Bd.add(top([[1.2, 2.3], [5.1, -3.0], [5.1, -4.4], [1.4, -5.0], [-1.4, -5.0], [-5.1, -4.4], [-5.1, -3.0], [-1.2, 2.3]], 0.16, 0.04), c.body, T(0, -0.08, 0));
  Bd.add(top([[1.0, -5.3], [3.4, -7.4], [3.4, -8.3], [0.9, -8.0], [-0.9, -8.0], [-3.4, -8.3], [-3.4, -7.4], [-1.0, -5.3]], 0.12, 0.03), c.body, T(0, -0.05, 0));
  const seam = (a, b) => rod(a, b, 0.013, 0.013, 4);
  for (const s of [-1, 1]) {
    // 襟副翼、前緣襟翼、升降舵的鉸鏈縫與分段
    Bd.add(merge([
      seam([s * 1.5, 0.0, -4.47], [s * 4.95, 0.0, -3.92]), seam([s * 1.5, 0.0, 1.62], [s * 5.0, 0.0, -3.15]),
      seam([s * 3.2, 0.0, -4.2], [s * 3.2, 0.0, -4.7]), seam([s * 1.5, 0.0, -4.47], [s * 1.5, 0.0, -4.95]),
      seam([s * 1.05, 0.01, -7.1], [s * 3.3, 0.01, -7.95]),
    ]), c.dark);
    // 外傾雙垂尾＋方向舵縫＋機號、國籍標誌
    const tail = T(s * 1.0, 0.1, 0, 0, 0, -s * 0.38);
    Bd.add(prof([[-5.2, 0.3], [-7.8, 0.3], [-8.4, 3.2], [-7.35, 3.3]], 0.12, 0.03), c.body, tail);
    Bd.add(merge([-1, 1].map((f) => seam([f * 0.062, 0.45, -7.72], [f * 0.062, 2.95, -8.22]))), c.dark, tail);
    Bd.add(digits('07', 0.5, { face: s > 0 ? 'x' : '-x', tint: 6 }), c.body, new THREE.Matrix4().multiplyMatrices(tail, T(s * 0.072, 1.45, -7.0)));
    Bd.add(sten('roundel', 0.42, 0.42, { face: s > 0 ? '-x' : 'x', tint: 6 }), c.body, new THREE.Matrix4().multiplyMatrices(tail, T(-s * 0.072, 1.6, -6.9)));
    // 進氣道：斜切唇口、黑色開口、側面警示與國籍標誌
    Bd.add(prof([[2.95, 0.12], [2.6, -0.68], [0.2, -0.62], [0.2, 0.12]], 0.72, 0.03), c.body, T(s * 1.22, 0, 0));
    Bd.add(blk(0.6, 0.72, 0.03, 0.01), black, T(s * 1.22, -0.28, 2.775, 0.41));
    Bd.add(blk(0.04, 0.78, 0.5, 0.008), c.dark, T(s * 0.84, -0.28, 2.55));
    Bd.add(sten('intake', 1.1, 0.1, { face: s > 0 ? 'x' : '-x', tint: 4 }), c.body, T(s * 1.592, 0.0, 1.75));
    Bd.add(sten('roundel', 0.5, 0.5, { face: s > 0 ? 'x' : '-x', tint: 6 }), c.body, T(s * 1.592, -0.3, 0.85));
    // 尾噴管：收斂擴散段＋調節片＋內部火焰穩定器
    const noz = lathe([[0.5, 0.45], [0.53, 0.2], [0.5, -0.25], [0.44, -0.45], [0.4, -0.44], [0.45, -0.2], [0.46, 0.3], [0.4, 0.45]].reverse(), 18);
    noz.rotateX(Math.PI / 2);
    Bd.add(noz, c.nozzle, T(s * 0.56, -0.02, -8.2));
    const pet = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; pet.push(blk(0.03, 0.03, 0.62, 0.006, 0).applyMatrix4(T(s * 0.56 + Math.cos(a) * 0.52, -0.02 + Math.sin(a) * 0.52, -8.4, -0.14 * Math.sin(a), 0.14 * Math.cos(a)))); }
    Bd.add(merge(pet), c.steel);
    Bd.add(cylZ(0.12, 0.32, 0.4, 12), black, T(s * 0.56, -0.02, -8.05));
    L.add(cylZ(0.37, 0.37, 0.03, 14), E(7, 2.6, 0.8), T(s * 0.56, -0.02, -8.3));
    Bd.sootAt(s * 0.56, 0, -8.75, 1.2);
    // 翼下飛彈：彈體、導引頭、前後翼；掛架
    Bd.add(cylZ(0.1, 0.1, 2.2, 10), c.msl, T(s * 3.3, -0.36, -2.2));
    Bd.add(sph(0.1, 10, 6), c.glass, T(s * 3.3, -0.36, -1.1));
    Bd.add(merge([0, 1].flatMap((k) => [-3.0, -1.55].map((z) => blk(0.02, z < -2 ? 0.44 : 0.3, z < -2 ? 0.26 : 0.16, 0.004).applyMatrix4(T(s * 3.3, -0.36, z, 0, 0, Math.PI / 4 + k * Math.PI / 2))))), c.dark);
    Bd.add(blk(0.06, 0.16, 1.2, 0.01), c.dark, T(s * 3.3, -0.2, -2.2));
    // 翼尖發射軌＋短程飛彈
    Bd.add(blk(0.08, 0.1, 2.6, 0.01), c.dark, T(s * 5.18, -0.1, -3.7));
    Bd.add(cylZ(0.065, 0.065, 2.7, 10), c.msl, T(s * 5.18, -0.2, -3.6));
    Bd.add(sph(0.065, 8, 6), c.glass, T(s * 5.18, -0.2, -2.25));
    Bd.add(merge([0, 1].flatMap((k) => [-4.8, -2.55].map((z) => blk(0.015, 0.28, 0.18, 0.003).applyMatrix4(T(s * 5.18, -0.2, z, 0, 0, Math.PI / 4 + k * Math.PI / 2))))), c.dark);
    // 機腹穩定鰭
    Bd.add(prof([[-5.5, -0.3], [-6.8, -0.3], [-7.05, -0.85], [-6.45, -0.85]], 0.06, 0.01), c.body, T(s * 0.85, 0, 0, 0, 0, s * 0.3));
    // 標示：機翼 NO STEP、國籍標誌；座艙旁救援箭頭
    Bd.add(sten('nostep', 0.8, 0.2, { face: 'y', tint: 6 }), c.body, T(s * 2.1, 0.008, -1.9));
    Bd.add(sten('roundel', 0.9, 0.9, { face: 'y', tint: 6 }), c.body, T(s * 3.6, 0.008, -2.9));
    Bd.add(sten('rescue', 0.46, 0.23, { face: s > 0 ? 'x' : '-x', tint: 3 }), c.body, T(s * 0.945, 0.2, 3.2, 0, -s * 0.21));
    // 翼尖燈
    L.add(sph(0.09, 8, 6), s > 0 ? E(7, 0.3, 0.2) : E(0.3, 6, 1.2), T(s * 5.12, -0.02, -2.4));
  }
  // 空速管、機砲口（左側，旁邊燻黑）、背部與機腹刀型天線、減速板縫
  Bd.add(cylZ(0.05, 0.05, 0.6, 6), c.steel, T(0.5, 0.3, 6.4));
  Bd.add(blk(0.06, 0.12, 0.34, 0.01), black, T(0.71, 0.38, 4.25, 0, 0.12));
  Bd.sootAt(0.75, 0.38, 4.0, 1.1);
  Bd.add(prof([[-2.3, 0.6], [-2.65, 0.95], [-2.8, 0.95], [-2.55, 0.6]], 0.04, 0.008), c.dark);
  Bd.add(prof([[0.8, -0.62], [0.5, -0.92], [0.35, -0.92], [0.6, -0.62]], 0.04, 0.008), c.dark);
  Bd.add(merge([seam([-0.45, 0.555, -3.4], [0.45, 0.555, -3.4]), seam([-0.45, 0.545, -4.8], [0.45, 0.545, -4.8]), seam([-0.45, 0.555, -3.4], [-0.45, 0.545, -4.8]), seam([0.45, 0.555, -3.4], [0.45, 0.545, -4.8])]), c.dark);
  return { body: Bd.build(0, false), lit: L.build(0, false) };
}

// ================================================================ 共用的 InstancedMesh（每種零件一個，所有同型載具共用）
class Pool {
  constructor(geo, mat, cap, o = {}) {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (o.color) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    m.count = 0; m.visible = false; m.frustumCulled = false;
    m.castShadow = o.shadow !== false; m.receiveShadow = o.shadow !== false;
    if (o.noAO) m.userData.noAO = true;
    this.mesh = m; this.cap = cap; this.n = 0; this.col = !!o.color;
  }
  push(mat, r = 1, g = r, b = r) {
    if (this.n >= this.cap) return;
    this.mesh.setMatrixAt(this.n, mat);
    if (this.col) { const a = this.mesh.instanceColor.array, k = this.n * 3; a[k] = r; a[k + 1] = g; a[k + 2] = b; }
    this.n++;
  }
  end() {
    const m = this.mesh;
    m.count = this.n; m.visible = this.n > 0;
    m.instanceMatrix.needsUpdate = true;
    if (this.col) m.instanceColor.needsUpdate = true;
    this.n = 0;
  }
}
let RD = null, GEO = null;
// 幾何與旋翼貼圖整個模組只建一次（換場景只重建 InstancedMesh 池）
function vehicleGeometry() { return GEO || (GEO = { tk: buildTank(), he: buildHeli(), jt: buildJet(), discTex: discTexture() }); }
function renderer(scene, A) {
  if (RD && RD.scene === scene) return RD;
  const paint = paintMaterial(A);
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const { tk, he, jt, discTex } = vehicleGeometry();
  const disc = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const pools = [];
  const P_ = (g, m, cap, o) => { const p = new Pool(g, m, cap, o); scene.add(p.mesh); pools.push(p); return p; };
  RD = {
    scene, pools,
    tHull: P_(tk.hull, paint, 40, { color: true }), tTur: P_(tk.tur, paint, 40, { color: true }), tBar: P_(tk.bar, paint, 40, { color: true }),
    tLit: P_(tk.lit, glow, 40, { shadow: false, noAO: true }),
    hBody: P_(he.body, paint, 16, { color: true }), hRot: P_(he.rotor, paint, 16, { color: true }), hTail: P_(he.tail, paint, 16, { color: true }),
    hDisc: P_(he.disc, disc, 16, { shadow: false }), hTDisc: P_(he.tdisc, disc, 16, { shadow: false }),
    hLit: P_(he.lit, glow, 16, { shadow: false, noAO: true }), hBcn: P_(he.bcn, glow, 16, { shadow: false, noAO: true, color: true }),
    jBody: P_(jt.body, paint, 8, { color: true }), jLit: P_(jt.lit, glow, 8, { shadow: false, noAO: true }),
  };
  return RD;
}

// 戰車路段幾何（整數路口座標）：d＝行進方向、r＝右手邊、a＝在這段走了幾公尺、
//   aC／uC＝轉角在舊段／新段上的位置（右轉提早、左轉晚一點）、(cx,cz)＝轉角點
function laneGeo(v) {
  const d1x = Math.sign(v.ti - v.fi), d1z = Math.sign(v.tj - v.fj), d2x = Math.sign(v.ni - v.ti), d2z = Math.sign(v.nj - v.tj);
  const r1x = -d1z, r1z = d1x, r2x = -d2z, r2z = d2x;
  const aC = NODE + LANE * (r2x * d1x + r2z * d1z), uC = LANE * (r1x * d2x + r1z * d2z);
  return {
    d1x, d1z, d2x, d2z, r1x, r1z, r2x, r2z, aC, uC,
    a: (v.pos.x - v.fi * NODE) * d1x + (v.pos.z - v.fj * NODE) * d1z,
    cx: v.ti * NODE + d2x * uC + r2x * LANE, cz: v.tj * NODE + d2z * uC + r2z * LANE,
  };
}

// ================================================================ 載具（對戰鬥系統來說像一台敵機）
class Vehicle {
  constructor(kind, id) {
    this.vehicle = true; this.kind = kind; this.K = VKIND[kind]; this.id = id; this.label = this.K.label;
    this.pos = V3(); this.vel = V3(); this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.ap = this.apMax = this.K.ap;
    this.stag = 0; this.stagT = 0; this.lastHit = 9;
    this.dead = false; this.gone = false; this.dying = 0; this.dropping = false; this.grounded = kind === 'tank';
    this.locks = 0; this.warn = 0; this.lunge = 0; this.strafe = 1; this.qbCd = 9; this.hideT = 0;
    this.los = false; this.losT = Math.random() * 0.3; this.noLos = 0;
    this.state = 'alive'; this.deadT = 0; this.killHow = null;
    this.q = new THREE.Quaternion();
    this.m = this; this.root = STUB;      // combat.js 會呼叫 e.m.impact()／e.m.capsule()／e.m.root
  }
  get scale() { return this.K.scale; }
  chest(out) { return out.set(this.pos.x, this.pos.y + this.K.cy, this.pos.z); }
  alive() { return !this.dead; }
  impact() {}
  capsule() {
    const p = this.pos;
    if (this.kind === 'tank') return { x: p.x, z: p.z, y0: p.y + 0.9, y1: p.y + 2.2, r: 3.0 };
    return { x: p.x, z: p.z, y0: p.y - 0.8, y1: p.y + 0.8, r: this.kind === 'heli' ? 5 : 6 };
  }
  // 機體座標 → 世界座標
  local(x, y, z, out) { return out.set(x, y, z).applyQuaternion(this.q).add(this.pos); }
}

// ================================================================ 載具管理
export class Vehicles {
  constructor(C) {
    this.C = C;
    this.list = [];       // 活的＋墜落中＋殘骸（combat.enemies 只放活的）
    this.shots = [];      // 戰車砲彈、直升機火箭
    this.pops = [];       // 被炸飛的砲塔
    this.budget = BUDGET.cap;
    this.pvy = 0; this.pGround = true;
    this.pc = V3();
    this.R = renderer(C.scene, C.world.A);
  }

  // ---------------------------------------------------------------- 出場
  // at＝指定位置（遭遇戰）：戰車吸到最近的路上、朝 (at.tx, at.tz) 開；直升機從 at 低空升起
  spawn(kind, i, n, at = null) {
    const v = new Vehicle(kind, this.C.nextId++);
    if (kind === 'tank') this.placeTank(v, i, n, false, at);
    else if (kind === 'heli') this.placeHeli(v, i, n, at);
    else this.placeJet(v, i, n);
    v.q.setFromEuler(_e.set(v.pitch, v.yaw, v.roll, 'YXZ'));
    this.list.push(v);
    return v;
  }
  // 戰車：在你前方 230~400 m 的道路上出現（格線座標用整數算），朝你開過來
  placeTank(v, i, n, near = false, at = null) {
    const C = this.C, p = C.player.pos, o = at ? { x: at.tx, z: at.tz } : p;
    let pick = null;
    if (at) {
      const gi = clamp(Math.round(at.x / NODE), -NMAX, NMAX), gj = clamp(Math.round(at.z / NODE), -NMAX, NMAX);
      const alongZ = Math.abs(at.x - gi * NODE) <= Math.abs(at.z - gj * NODE);
      pick = alongZ ? { x: gi * NODE, z: clamp(at.z, -NMAX * NODE, NMAX * NODE), alongZ, gi, gj } : { x: clamp(at.x, -NMAX * NODE, NMAX * NODE), z: gj * NODE, alongZ, gi, gj };
    }
    for (let tries = 0; tries < 60 && !pick; tries++) {
      const spread = n > 1 ? (i / (n - 1) - 0.5) * 1.8 : 0;
      const a = C.player.yaw + spread + rand(-0.5, 0.5) + (tries > 30 ? rand(-2.6, 2.6) : 0);
      const d = near ? rand(200, 300) : rand(230, 400);
      let x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
      const gi = clamp(Math.round(x / NODE), -NMAX, NMAX), gj = clamp(Math.round(z / NODE), -NMAX, NMAX);
      const alongZ = Math.abs(x - gi * NODE) <= Math.abs(z - gj * NODE);   // 在南北向（x 固定）的路上
      if (alongZ) { x = gi * NODE; z = clamp(z, -NMAX * NODE, NMAX * NODE); } else { z = gj * NODE; x = clamp(x, -NMAX * NODE, NMAX * NODE); }
      if (Math.hypot(x - p.x, z - p.z) < 170) continue;
      if (this.list.some((o) => o !== v && o.kind === 'tank' && o.state === 'alive' && Math.hypot(o.pos.x - x, o.pos.z - z) < 20)) continue;
      pick = { x, z, alongZ, gi, gj };
    }
    if (!pick) { const gi = p.x > 0 ? -NMAX : NMAX; pick = { x: gi * NODE, z: 0, alongZ: true, gi, gj: 0 }; }
    // 路段：兩端都是整數路口，朝你那一側開
    let fi, fj, ti, tj;
    if (pick.alongZ) {
      const j0 = clamp(Math.floor(pick.z / NODE), -NMAX, NMAX - 1);
      fi = ti = pick.gi;
      if (o.z > pick.z) { fj = j0; tj = j0 + 1; } else { fj = j0 + 1; tj = j0; }
    } else {
      const i0 = clamp(Math.floor(pick.x / NODE), -NMAX, NMAX - 1);
      fj = tj = pick.gj;
      if (o.x > pick.x) { fi = i0; ti = i0 + 1; } else { fi = i0 + 1; ti = i0; }
    }
    Object.assign(v, { fi, fj, ti, tj });
    this.pickNext(v);
    const sx = Math.sign(ti - fi), sz = Math.sign(tj - fj);
    v.pos.set(pick.x - sz * LANE, 0, pick.z + sx * LANE);
    v.pos.y = C.world.height(v.pos.x, v.pos.z);
    v.yaw = Math.atan2(sx, sz);
    if (!near) {
      v.pref = rand(130, 240); v.cruise = rand(8, 10.5); v.speed = v.cruise * 0.6;
      v.tYaw = 0; v.elev = 0; v.reload = rand(2.5, 5); v.grace = 2.5; v.hold = 0; v.holdCd = rand(2, 6);
      v.rk = 9; v.leadF = rand(0.1, 0.9); v.acc = 0; v.bob = Math.random() * 10; v.dustAcc = 0;
      v.turretOn = true; v.flat = 1; v.muz = V3(); v.air = false; v.rollV = 0; v.cook = 0;
    }
  }
  // 下一個路口：不回頭，挑「離你的距離最接近自己偏好距離」的方向（加一點亂數）
  pickNext(v) {
    const p = this.C.player.pos, bl = this.C.world.blocked;
    let best = null, bs = 1e9;
    for (const [di, dj] of DIRS) {
      const i = v.ti + di, j = v.tj + dj;
      if (Math.abs(i) > NMAX || Math.abs(j) > NMAX || (i === v.fi && j === v.fj)) continue;
      if (bl && bl.has((v.ti + i + 20) * 100 + (v.tj + j + 20))) continue;   // 遭遇戰：路障封死的支路不走（同 encounter.js edgeKey）
      // 太久看不到你：改成往你那邊開（到街上讓你看得到），不然照自己喜歡的距離繞
      const pref = v.noLos > 6 ? 40 : v.pref || 180;
      const s = Math.abs(Math.hypot(i * NODE - p.x, j * NODE - p.z) - pref) + rand(0, v.noLos > 6 ? 25 : 70);
      if (s < bs) { bs = s; best = [i, j]; }
    }
    if (!best) best = [v.fi, v.fj];
    v.ni = best[0]; v.nj = best[1];
  }
  // 直升機：遠處低空飛進來，繞著你打
  placeHeli(v, i, n, at = null) {
    const C = this.C, p = C.player.pos, w = C.world;
    const a = C.player.yaw + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0) + rand(-0.6, 0.6);
    const d = rand(420, 520);
    const x = at ? at.x : clamp(p.x + Math.sin(a) * d, -760, 760), z = at ? at.z : clamp(p.z + Math.cos(a) * d, -760, 760);
    v.alt = rand(42, 80);
    v.pos.set(x, at ? at.y : Math.max(w.height(x, z) + v.alt + 15, Math.min(w.support(x, z, 9, 1e4) + 30, w.height(x, z) + 115)), z);
    v.yaw = Math.atan2(p.x - x, p.z - z);
    v.vel.set(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(at ? 3 : 20);
    Object.assign(v, {
      mode: 'orbit', modeT: rand(6, 10), orbitR: rand(170, 260), odir: Math.random() < 0.5 ? -1 : 1, vmax: rand(22, 28),
      ax: 0, az: 0, mgN: 0, mgT: 0, mgK: 0, mgCd: rand(3, 5), mgReal: false, rkN: 0, rkT: 0, rkCd: rand(6, 10),
      rotA: Math.random() * 6, tailA: 0, rotorOn: true, grace: 3, spinV: 0, fallT: 0, trailAcc: 0,
    });
  }
  // 戰鬥機：一公里外高速切入，從你頭上掠過
  placeJet(v, i, n) {
    const C = this.C, p = C.player.pos;
    const a = C.player.yaw + rand(-0.9, 0.9) + i * 0.5;
    const d = rand(1000, 1150);
    v.pos.set(p.x + Math.sin(a) * d, 0, p.z + Math.cos(a) * d);
    v.pos.y = Math.max(p.y + 150, C.world.height(v.pos.x, v.pos.z) + 160);
    v.yaw = Math.atan2(p.x - v.pos.x, p.z - v.pos.z);
    Object.assign(v, {
      js: 'in', jT: 0, speed: rand(92, 104), climb: 0, off: rand(25, 55) * (Math.random() < 0.5 ? -1 : 1), passAlt: rand(65, 95),
      fired: false, gunN: 0, gunT: 0, gunK: 0, gunReal: false, yawRate: 0, rollV: 0, fallT: 0, trailAcc: 0, fireAcc: 0,
    });
    v.vel.set(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(v.speed);
  }

  // ---------------------------------------------------------------- 每幀
  update(dt) {
    const C = this.C, pl = C.player;
    this.budget = Math.min(BUDGET.cap, this.budget + BUDGET.rate * dt);
    this.fightOK = C.phase === 'fight' && !C.dead;
    const pc = C.hero.bones.torso.getWorldPosition(this.pc);
    // 玩家剛落地（上一幀還在往下掉）→ 踩扁腳下的戰車
    this.landing = pl.grounded && !this.pGround && this.pvy < -4;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v.state === 'alive') {
        v.lastHit += dt;
        v.losT -= dt;
        if (v.losT <= 0) {
          v.losT = 0.3 + Math.random() * 0.1;
          const ec = v.chest(_a);
          v.los = C.world.raycast(ec, pc, null) < 0 || C.world.raycast(ec, _b.copy(pc).setY(pc.y + 6), null) < 0;
        }
        v.noLos = v.los ? 0 : v.noLos + dt;
        if (v.kind === 'tank') this.updTank(v, dt, pc);
        else if (v.kind === 'heli') this.updHeli(v, dt, pc);
        else this.updJet(v, dt, pc);
      } else if (v.kind === 'tank') this.tankWreck(v, dt);
      else if (v.kind === 'heli') this.heliDown(v, dt);
      else this.jetDown(v, dt);
      v.q.setFromEuler(_e.set(v.pitch, v.yaw, v.roll, 'YXZ'));
      if (v.remove) { this.C.audio.vehicleStop?.(v.id); this.list.splice(i, 1); }
    }
    this.separate();
    this.updShots(dt, pc);
    this.updPops(dt);
    this.render();
    this.pGround = pl.grounded; this.pvy = pl.vel.y;
  }

  // 載具打到玩家：扣總量，並用關卡倍率算傷害（combat.hurt 會乘 tier.dmg）
  hitPlayer(dmg, from, kind) {
    if (!this.fightOK) return;
    this.C.hurt(dmg, from, kind);
    this.budget -= dmg;
  }
  // 預算不夠時故意打偏：往射線側面偏 lo~hi 公尺
  missOffset(to, from, lo, hi) {
    const sx = to.z - from.z, sz = from.x - to.x, L = Math.hypot(sx, sz) || 1, k = rand(lo, hi) * (Math.random() < 0.5 ? -1 : 1);
    to.x += (sx / L) * k; to.z += (sz / L) * k; to.y += rand(-3, 4);
  }

  // ---------------------------------------------------------------- 戰車
  updTank(v, dt, pc) {
    const C = this.C, w = C.world, pl = C.player, T = C.tier;
    // 路段：靠右車道＝兩條車道線，轉角＝兩條線的交點；越過轉角的分角線就換到下一段
    let L = laneGeo(v);
    for (let k = 0; k < 2; k++) {
      const px = v.pos.x - L.cx, pz = v.pos.z - L.cz, bx = L.d1x + L.d2x, bz = L.d1z + L.d2z;
      const passed = bx || bz ? px * bx + pz * bz >= 0 : L.a >= NODE;
      if (!passed) break;
      v.fi = v.ti; v.fj = v.tj; v.ti = v.ni; v.tj = v.nj;
      this.pickNext(v);
      L = laneGeo(v);
    }
    // 追蹤點：沿車道往前看 14 m（快到轉角就看進下一段）
    const la = L.a + 14;
    let tx, tz;
    if (la <= L.aC) { tx = v.fi * NODE + L.d1x * la + L.r1x * LANE; tz = v.fj * NODE + L.d1z * la + L.r1z * LANE; }
    else { const u = L.uC + la - L.aC; tx = v.ti * NODE + L.d2x * u + L.r2x * LANE; tz = v.tj * NODE + L.d2z * u + L.r2z * LANE; }
    const want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    const dYaw = wrap(want - v.yaw);
    v.yaw = wrap(v.yaw + clamp(dYaw, -0.95 * dt, 0.95 * dt));
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    // 速度：轉彎、停車開砲、前面有車就排隊、別開進你腳下
    const dxp = pl.pos.x - v.pos.x, dzp = pl.pos.z - v.pos.z, dist = Math.hypot(dxp, dzp);
    v.holdCd -= dt;
    if (v.hold > 0) v.hold -= dt;
    else if (v.los && dist > 90 && dist < 380 && v.holdCd <= 0 && v.reload < 2) { v.hold = rand(3.5, 6.5); v.holdCd = v.hold + rand(4, 8); }
    let target = v.cruise * (1 - clamp(Math.abs(dYaw) / 1.1, 0, 0.75));
    if (v.hold > 0) target = 0;
    for (const o of this.list) {
      if (o === v || o.kind !== 'tank') continue;
      const rx = o.pos.x - v.pos.x, rz = o.pos.z - v.pos.z, fa = rx * fx + rz * fz, lat = Math.abs(-rx * fz + rz * fx);
      if (fa > 0 && fa < 20 && lat < 4.5) target = Math.min(target, Math.max(0, (fa - 11) * 0.7));
    }
    if (dist < 22 && dxp * fx + dzp * fz > 0) target = 0;
    const sp0 = v.speed;
    v.speed += clamp(target - v.speed, -7 * dt, 3 * dt);
    v.acc = damp(v.acc, (v.speed - sp0) / Math.max(dt, 1e-4), 6, dt);
    v.pos.x += fx * v.speed * dt; v.pos.z += fz * v.speed * dt;
    w.collide(v.pos, 2.6, v.pos.y);
    v.pos.x = clamp(v.pos.x, -700, 700); v.pos.z = clamp(v.pos.z, -700, 700);
    v.pos.y = w.height(v.pos.x, v.pos.z);
    // 輾過路上的車、路燈
    if (v.speed > 1) w.stomp(v.pos.x + fx * 3.6, v.pos.z + fz * 3.6, 2.2, fx, fz, (o) => C.audio.trample(_c.set(o.x, 0, o.z), o.kind));
    // 履帶揚塵
    v.dustAcc += dt * 7 * clamp(v.speed / 9, 0, 1);
    if (v.dustAcc >= 1) { v.dustAcc -= 1; C.fx.trackDust?.(v.pos, _a.set(fx, 0, fz), clamp(v.speed / 10, 0, 1)); }
    // 懸吊：加速抬頭、煞車點頭、路面起伏、開砲後座晃動
    v.bob += dt * v.speed; v.rk += dt;
    const rock = v.rk < 1.6 ? 0.05 * Math.exp(-3.5 * v.rk) * Math.cos(11 * v.rk) : 0;
    v.pitch = clamp(-v.acc * 0.014, -0.05, 0.05) + Math.sin(v.bob * 0.9 + v.id) * 0.006 * Math.min(1, v.speed / 5) - rock * Math.cos(v.tYaw);
    v.roll = Math.sin(v.bob * 0.63 + v.id * 2) * 0.004 * Math.min(1, v.speed / 5) + rock * Math.sin(v.tYaw);
    // 砲塔、砲管追著你（提前量亂估）
    const hx = v.pos.x - fx * 0.4, hz = v.pos.z - fz * 0.4, hy = v.pos.y + 1.92;
    const lead = (dist / SHELL_V) * v.leadF;
    const ax = pc.x + pl.vel.x * lead - hx, ay = pc.y + pl.vel.y * lead * 0.5 - hy, az = pc.z + pl.vel.z * lead - hz;
    const tyWant = wrap(Math.atan2(ax, az) - v.yaw);
    v.tYaw = wrap(v.tYaw + clamp(wrap(tyWant - v.tYaw), -0.85 * dt, 0.85 * dt));
    const elWant = Math.atan2(ay, Math.hypot(ax, az));
    v.elev += clamp(clamp(elWant, -0.12, 0.38) - v.elev, -0.5 * dt, 0.5 * dt);
    const aimErr = Math.abs(wrap(tyWant - v.tYaw)) + Math.abs(elWant - v.elev);
    // 開砲
    v.reload -= dt; v.grace -= dt;
    if (this.fightOK && v.grace <= 0 && v.reload <= 0 && v.los && dist < 470 && dist > 35 && aimErr < 0.06) this.tankFire(v, pc, dist);
    // 引擎聲
    C.audio.vehicleLoop?.(v.id, v.pos, 'tank', clamp(0.25 + v.speed / 12, 0, 1));
    // 太久看不到你（卡在遠處繞圈）：換到你附近的路上
    // 遭遇戰：支路都封了，繞出去就回不來——看不到你 12 秒就直接換到前方路線上
    if (v.noLos > (C.enc ? 12 : 30)) { v.noLos = 0; this.placeTank(v, 0, 1, true, C.enc ? C.enc.tankSpot() : null); }
  }
  tankFire(v, pc, dist) {
    const C = this.C, pl = C.player, T = C.tier;
    const from = v.muz.lengthSq() > 0 ? v.muz.clone() : v.chest(V3());
    const real = this.budget >= DMG.shell * 0.5;
    const to = V3().copy(pc).addScaledVector(pl.vel, (dist / SHELL_V) * v.leadF);
    const sp = (0.011 * dist + 1.2) * T.aim;
    to.x += rand(-sp, sp); to.y += rand(-0.6 * sp, 0.6 * sp); to.z += rand(-sp, sp);
    if (!real) this.missOffset(to, from, 12, 20);
    const dir = to.sub(from).normalize();
    const far = _c.copy(from).addScaledVector(dir, 900);
    const tw = C.world.raycast(from, far, _n);
    const len = tw >= 0 ? tw * 900 : 900;
    const j = C.fx.shellTracer ? C.fx.shellTracer(from, _a.copy(from).addScaledVector(dir, len), SHELL_V) : -1;
    this.shots.push({ type: 'shell', from, dir, len, trav: 0, j, real, n: tw >= 0 ? _n.clone() : null, src: v.pos.clone(), whiz: false });
    C.fx.muzzle(from, dir, 'cannon');
    C.audio.cannon(from);
    C.fx.dust(_a.set(from.x, C.world.height(from.x, from.z), from.z), 0.8);
    v.rk = 0; v.reload = rand(5.5, 8) * T.fire; v.leadF = rand(0.1, 0.9);
  }
  // 戰車之間互推、別跟直升機殘骸疊在一起
  separate() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.kind !== 'tank' || a.state !== 'alive') continue;
      for (let j = 0; j < L.length; j++) {
        const b = L[j];
        if (b === a || b.kind !== 'tank') continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = 7;
        if (d < min && d > 1e-3) {
          const k = b.state === 'alive' ? 0.5 : 1;
          a.pos.x -= (dx / d) * (min - d) * k; a.pos.z -= (dz / d) * (min - d) * k;
        }
      }
    }
    // 你的腳：走過去就踩扁，站著不動就把戰車擠開
    const C = this.C, pl = C.player;
    const moving = pl.speed > 1.5 || this.landing || pl.qbT > 0 || (pl.dashT || 0) > 0;
    const reach = pl.boosting || pl.qbT > 0 ? 5.5 : 3.6;
    for (const v of L) {
      if (v.state !== 'alive') continue;
      if (v.kind === 'tank') {
        if (pl.pos.y > v.pos.y + 3.2 || pl.pos.y < v.pos.y - 3) continue;
        const dx = pl.pos.x - v.pos.x, dz = pl.pos.z - v.pos.z;
        const lat = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw), lon = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
        const ex = Math.max(0, Math.abs(lat) - 1.85), ez = Math.max(0, Math.abs(lon) - 3.9), d = Math.hypot(ex, ez);
        if (d >= reach) continue;
        if (moving && !C.dead) this.destroyBy(v, 'crush');
        else if (d < 3.4) {
          const k = (3.4 - d) / Math.max(0.5, Math.hypot(dx, dz));
          v.pos.x -= dx * k; v.pos.z -= dz * k; v.speed = 0;
        }
      } else if (v.kind === 'heli' && !C.dead) {
        // 衝撞：機體撞上直升機
        const cap = C.hero.capsule();
        if (Math.hypot(v.pos.x - cap.x, v.pos.z - cap.z) < cap.r + 5 && v.pos.y > cap.y0 - 3 && v.pos.y < cap.y1 + 3) this.destroyBy(v, 'ram');
      }
    }
  }
  destroyBy(v, how) {
    v.killHow = how;
    const d = _v.subVectors(v.pos, this.C.player.pos).setY(0);
    if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
    this.C.damageEnemy(v, 9999, 0, v.chest(V3()), d.normalize().clone());
  }

  // ---------------------------------------------------------------- 直升機
  updHeli(v, dt, pc) {
    const C = this.C, w = C.world, pl = C.player, T = C.tier, p = pl.pos;
    const hx = v.pos.x - p.x, hz = v.pos.z - p.z, hd = Math.hypot(hx, hz) || 1;
    const b = Math.atan2(hx, hz);
    // 繞圈 → 看得到你就正面衝一趟 → 拉開 → 繼續繞
    v.modeT -= dt;
    let tr, tb;
    if (v.mode === 'orbit') {
      tr = v.orbitR; tb = b + v.odir * 0.55;
      if (v.modeT <= 0 && v.los) { v.mode = 'run'; v.modeT = 9; }
    } else if (v.mode === 'run') {
      tr = 95; tb = b + v.odir * 0.12;
      if (hd < 125 || v.modeT <= 0) { v.mode = 'break'; v.modeT = 5; }
    } else {
      tr = 280; tb = b + v.odir * 1.3;
      if (v.modeT <= 0) { v.mode = 'orbit'; v.modeT = rand(9, 15); if (Math.random() < 0.3) v.odir = -v.odir; v.orbitR = rand(170, 260); }
    }
    if (v.noLos > 3) { v.noLos = 0.5; v.odir = -v.odir; v.orbitR = rand(150, 230); v.alt = rand(45, 85); }   // 被樓擋住：換邊、換高度
    const tx = clamp(p.x + Math.sin(tb) * tr, -760, 760), tz = clamp(p.z + Math.cos(tb) * tr, -760, 760);
    const dx = tx - v.pos.x, dz = tz - v.pos.z, dl = Math.hypot(dx, dz) || 1;
    const sp = Math.min(v.mode === 'run' ? 34 : v.vmax, dl * 0.6);
    let wx = (dx / dl) * sp, wz = (dz / dl) * sp;
    for (const o of this.list) {   // 直升機之間保持距離
      if (o === v || o.kind !== 'heli' || o.state !== 'alive') continue;
      const ox = v.pos.x - o.pos.x, oz = v.pos.z - o.pos.z, od = Math.hypot(ox, oz);
      if (od < 40 && od > 1e-3) { wx += (ox / od) * (40 - od) * 0.5; wz += (oz / od) * (40 - od) * 0.5; }
    }
    let ax = (wx - v.vel.x) * 1.2, az = (wz - v.vel.z) * 1.2;
    const al = Math.hypot(ax, az);
    if (al > 9) { ax *= 9 / al; az *= 9 / al; }
    v.vel.x += ax * dt; v.vel.z += az * dt;
    v.ax = damp(v.ax, ax, 4, dt); v.az = damp(v.az, az, 4, dt);
    // 高度：地面＋巡航高度；前方有高樓就爬升越過
    const lx = v.pos.x + v.vel.x * 2.5, lz = v.pos.z + v.vel.z * 2.5;
    const roof = Math.max(w.support(v.pos.x, v.pos.z, 9, 1e4), w.support(lx, lz, 9, 1e4));
    // 攔截空中目標時爬升；仍有高度上限，撞牆會繞開。
    const gnd = w.height(v.pos.x, v.pos.z);
    const intercept=!pl.grounded&&p.y-gnd>24&&v.los?p.y+(v.mode==='run'?-8:18):gnd+v.alt;
    const ty = Math.max(Math.min(intercept,gnd+250),Math.min(roof+24,gnd+250));
    v.vel.y = damp(v.vel.y, clamp((ty - v.pos.y) * 0.9, -7, 16), 2.5, dt);
    v.pos.addScaledVector(v.vel, dt);
    if (w.collide(v.pos, 7, v.pos.y - 2)) { v.vel.x *= 0.5; v.vel.z *= 0.5; v.vel.y = Math.max(v.vel.y, 8); }
    v.pos.y = Math.max(v.pos.y, w.support(v.pos.x, v.pos.z, 6, v.pos.y) + 5);
    // 機頭：近了就對著你，遠了就朝飛行方向
    const d3 = v.pos.distanceTo(pc);
    const face = hd < 460 || Math.hypot(v.vel.x, v.vel.z) < 4 ? Math.atan2(-hx, -hz) : Math.atan2(v.vel.x, v.vel.z);
    v.yaw = wrap(v.yaw + clamp(wrap(face - v.yaw), -1.1 * dt, 1.1 * dt));
    // 姿態：往前飛機頭壓低、側滑就傾斜
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const vF = v.vel.x * fx + v.vel.z * fz, vR = -v.vel.x * fz + v.vel.z * fx;
    const aF = v.ax * fx + v.az * fz, aR = -v.ax * fz + v.az * fx;
    v.pitch = damp(v.pitch, clamp(vF * 0.009 + aF * 0.03, -0.25, 0.3), 3, dt);
    v.roll = damp(v.roll, clamp(vR * 0.012 + aR * 0.035, -0.45, 0.45), 3, dt);
    v.rotA += dt * 23; v.tailA += dt * 61;
    if (v.pos.y - w.height(v.pos.x, v.pos.z) < 28) C.fx.thrusterWash(v.pos, 0.9);
    C.audio.vehicleLoop?.(v.id, v.pos, 'heli', clamp(0.65 + Math.hypot(v.vel.x, v.vel.z) / 90, 0, 1));
    // 武器：機砲點放、火箭一次兩發
    v.grace -= dt; v.mgCd -= dt; v.rkCd -= dt;
    const nose = Math.acos(clamp((-hx * fx - hz * fz) / hd, -1, 1));
    const ok = this.fightOK && v.grace <= 0 && v.los && nose < 0.35;
    if (v.mgN > 0) { v.mgT -= dt; if (v.mgT <= 0) { v.mgN--; v.mgT = 0.075; this.heliRound(v, pc); } }
    else if (v.mgCd <= 0 && ok && d3 < 420) { v.mgN = 12 + ((Math.random() * 5) | 0); v.mgT = 0; v.mgCd = rand(3.2, 5) * T.fire; v.mgReal = this.budget >= 60; }
    if (v.rkN > 0) { v.rkT -= dt; if (v.rkT <= 0) { v.rkN--; v.rkT = 0.28; this.heliRocket(v, pc); } }
    else if (v.rkCd <= 0 && ok && d3 > 120 && d3 < 460) { v.rkN = 2; v.rkT = 0; v.rkCd = rand(9, 13) * T.fire; }
  }
  heliRound(v, pc) {
    const C = this.C, pl = C.player, T = C.tier;
    const from = v.local(0, -1.33, 6.9, V3());
    const dist = from.distanceTo(pc);
    const to = V3().copy(pc).addScaledVector(pl.vel, (dist / 900) * rand(0.2, 1));
    const sp = (0.03 * dist + 1) * T.aim;
    to.x += rand(-sp, sp); to.y += rand(-sp, sp) * 0.7; to.z += rand(-sp, sp);
    if (!v.mgReal || this.budget < DMG.mg) this.missOffset(to, from, 7, 12);
    this.round(from, to, dist, (v.mgK = (v.mgK || 0) + 1), 'heli', DMG.mg, pc);
  }
  // 一發機砲彈：瞬間判定；曳光彈、打到地面的沙塵隔一發一個
  round(from, to, dist, k, kind, dmg, pc) {
    const C = this.C;
    const dir = to.sub(from).normalize();
    const t = C.dead ? -1 : rayCapsule(from, dir, C.hero.capsule(), dist + 40);
    C.fx.muzzle(from, dir, 'mg');
    C.audio.mg(from);
    if (t >= 0) {
      const hp = V3().copy(from).addScaledVector(dir, t);
      if (k % 2 === 0) C.fx.tracer(from, hp);
      this.hitPlayer(dmg, from, kind);
      if (k % 2) C.fx.impact(hp, _n.copy(dir).negate(), 'armor');
      if (k % 3 === 0) C.audio.impact(hp, 'armor');
    } else {
      const end = V3().copy(from).addScaledVector(dir, dist + 260);
      const tw = C.world.raycast(from, end, _n);
      const hp = tw >= 0 ? V3().lerpVectors(from, end, tw) : end;
      if (k % 2 === 0) C.fx.tracer(from, hp);
      if (tw >= 0 && k % 2) C.fx.impact(hp, _n, _n.y > 0.7 ? 'ground' : 'building');
      if (k % 5 === 0) C.audio.whiz(_b.copy(pc).addScaledVector(dir, 6));
    }
  }
  heliRocket(v, pc) {
    const C = this.C, pl = C.player, T = C.tier;
    const side = v.rkN % 2 ? 1 : -1;
    const from = v.local(side * 1.45, -0.74, 1.2, V3());
    const dist = from.distanceTo(pc);
    const real = this.budget >= DMG.rocket * 0.6;
    const to = V3().copy(pc).addScaledVector(pl.vel, (dist / 150) * rand(0.3, 0.9));
    const sp = (0.02 * dist + 1) * T.aim;
    to.x += rand(-sp, sp); to.y += rand(-sp, sp) * 0.5; to.z += rand(-sp, sp);
    if (!real) this.missOffset(to, from, 11, 17);
    const dir = to.sub(from).normalize();
    this.shots.push({ type: 'rocket', pos: from, vel: dir.clone().multiplyScalar(150), h: C.fx.missile('enemy'), t: 0, real, src: v.pos.clone(), whiz: false });
    C.fx.muzzle(from, dir, 'missile');
    C.audio.missileLaunch3d(from);
  }

  // ---------------------------------------------------------------- 戰鬥機
  updJet(v, dt, pc) {
    const C = this.C, w = C.world, p = C.player.pos, T = C.tier;
    const hx = p.x - v.pos.x, hz = p.z - v.pos.z, hd = Math.hypot(hx, hz) || 1;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let want = v.yaw, rate = 0.5;
    v.jT -= dt;
    if (v.js === 'in') {
      // 瞄準你旁邊 off 公尺的點掠過
      want = Math.atan2(p.x + fz * v.off - v.pos.x, p.z - fx * v.off - v.pos.z);
      if (hx * fx + hz * fz < 70 || hd < 90) { v.js = 'out'; v.jT = rand(4, 5.5); }
    } else if (v.js === 'out') {
      if (v.jT <= 0 || Math.hypot(v.pos.x, v.pos.z) > 1350) v.js = 'turn';
    } else {
      want = Math.atan2(hx, hz); rate = 0.48;
      if (Math.abs(wrap(want - v.yaw)) < 0.2) { v.js = 'in'; v.fired = false; v.off = rand(25, 55) * (Math.random() < 0.5 ? -1 : 1); v.passAlt = rand(65, 95); }
    }
    const dY = clamp(wrap(want - v.yaw), -rate * dt, rate * dt);
    v.yaw = wrap(v.yaw + dY);
    v.yawRate = damp(v.yawRate, dY / Math.max(dt, 1e-4), 4, dt);
    // 高度：你頭上 passAlt；前方有樓、有山就拉高
    const lx = v.pos.x + fx * 300, lz = v.pos.z + fz * 300;
    const airTarget=!C.player.grounded&&p.y-w.height(p.x,p.z)>24;
    const clearance=airTarget?30:45;
    const ty = Math.max(p.y+(airTarget?(v.js==='in'?-12:35):v.passAlt),w.support(v.pos.x,v.pos.z,12,1e4)+clearance,w.support(lx,lz,12,1e4)+clearance,w.height(lx,lz)+(airTarget?40:110));
    v.climb += clamp(clamp(Math.atan2(ty - v.pos.y, 350), -0.3, 0.4) - v.climb, -0.4 * dt, 0.4 * dt);
    const cp = Math.cos(v.climb);
    v.vel.set(Math.sin(v.yaw) * cp, Math.sin(v.climb), Math.cos(v.yaw) * cp).multiplyScalar(v.speed);
    v.pos.addScaledVector(v.vel, dt);
    v.pitch = -v.climb;
    v.roll = damp(v.roll, clamp(-v.yawRate * 2.4, -1.2, 1.2), 3, dt);
    C.audio.vehicleLoop?.(v.id, v.pos, 'jet', 1);
    // 攻擊：每次掠過打一輪（飛彈兩發或機砲掃射）
    if (v.js === 'in' && !v.fired && this.fightOK && v.los) {
      const d3 = v.pos.distanceTo(pc);
      const nose = Math.acos(clamp(_a.subVectors(pc, v.pos).normalize().dot(_b.set(fx * cp, Math.sin(v.climb), fz * cp)), -1, 1));
      if (d3 < 640 && d3 > 180 && nose < 0.32) {
        v.fired = true;
        if (this.budget >= DMG.jetMsl && Math.random() < 0.55) {
          this.budget -= DMG.jetMsl;
          for (const s of [-1, 1]) {
            const p0 = v.local(s * 3.3, -0.5, -1.0, V3());
            const vel = V3().copy(v.vel).multiplyScalar(0.85).add(_a.set(0, -4, 0));
            C.missiles.push({ own: 'enemy', pos: p0, vel, target: 'player', t: 0, speed: vel.length(), vmax: 175, acc: 60, turn: 0.9, dmg: DMG.jetMsl / 2, h: C.fx.missile('enemy'), life: 6, from: v.pos.clone() });
            C.audio.missileLaunch3d(p0);
          }
        } else { v.gunN = 18; v.gunT = 0; v.gunReal = this.budget >= 60; }
      }
    }
    if (v.gunN > 0) {
      v.gunT -= dt;
      if (v.gunT <= 0) {
        v.gunN--; v.gunT = 0.05;
        const from = v.local(0.5, 0.3, 6.9, V3()), dist = from.distanceTo(pc);
        const to = V3().copy(pc);
        const sp = (0.035 * dist + 2) * T.aim;
        to.x += rand(-sp, sp); to.y += rand(-sp, sp) * 0.6; to.z += rand(-sp, sp);
        if (!v.gunReal || this.budget < DMG.jetGun) this.missOffset(to, from, 8, 14);
        this.round(from, to, dist, (v.gunK = v.gunK + 1), 'jet', DMG.jetGun, pc);
      }
    }
  }

  // ---------------------------------------------------------------- 砲彈、火箭
  updShots(dt, pc) {
    const C = this.C, w = C.world, pl = C.player;
    const cap = C.hero.capsule();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.type === 'shell') {
        const t0 = s.trav;
        s.trav = Math.min(s.len, s.trav + SHELL_V * dt);
        let hitT = -1;
        if (!C.dead) for (let t = t0; t <= s.trav + 1e-3; t += 1.5) { if (inCap(_a.copy(s.from).addScaledVector(s.dir, t), cap, 0.6)) { hitT = t; break; } }
        const tip = _a.copy(s.from).addScaledVector(s.dir, s.trav);
        if (!s.whiz && tip.distanceTo(pc) < 24) { s.whiz = true; C.audio.whiz(tip); }
        if (hitT >= 0) {
          const hp = V3().copy(s.from).addScaledVector(s.dir, hitT);
          if (s.j >= 0) C.fx.projEnd?.(s.j);
          C.fx.explosion(hp, 0.55);
          C.fx.impact(hp, _n.copy(s.dir).negate(), 'armor');
          C.audio.explosion(hp, 0.8);
          if (s.real) this.hitPlayer(DMG.shell, s.src, 'tank');
          this.shots.splice(i, 1);
        } else if (s.trav >= s.len) {
          const hp = V3().copy(s.from).addScaledVector(s.dir, s.len);
          if (s.len < 899) {
            C.fx.explosion(hp, 0.7);
            C.fx.impact(hp, s.n || _n.set(0, 1, 0), s.n && s.n.y < 0.7 ? 'building' : 'ground');
            C.audio.explosion(hp, 0.8);
            C.world.blast(hp, 8, 1);
            const d = hp.distanceTo(pc);
            if (s.real && d < 14) this.hitPlayer(DMG.shell * DMG.shellSplash * (1 - d / 14), s.src, 'tank');
            const ds = clamp(1 - d / 90, 0, 1);
            if (ds > 0) C.cockpit.kick('hit', ds * 0.35, 0);
          }
          this.shots.splice(i, 1);
        }
      } else {
        const prev = _b.copy(s.pos);
        s.t += dt;
        s.vel.y -= 3 * dt;
        s.pos.addScaledVector(s.vel, dt);
        if (s.h) { s.h.pos.copy(s.pos); s.h.dir.copy(s.vel).normalize(); }
        let hit = null, onP = false;
        if (!C.dead && (inCap(s.pos, cap, 1.5) || inCap(_a.lerpVectors(prev, s.pos, 0.5), cap, 1.5))) { hit = s.pos.clone(); onP = true; }
        if (!hit) { const tw = w.raycast(prev, s.pos, _n); if (tw >= 0) hit = V3().lerpVectors(prev, s.pos, tw); }
        if (!hit && s.t > 5) hit = s.pos.clone();
        if (!s.whiz && s.pos.distanceTo(pc) < 24) { s.whiz = true; C.audio.whiz(s.pos); }
        if (hit) {
          C.fx.missileEnd(s.h);
          C.fx.explosion(hit, 0.8);
          C.audio.explosion(hit, 0.9);
          if (!onP) w.blast(hit, 7, 0.8);
          const d = hit.distanceTo(pc);
          if (s.real) { if (onP) this.hitPlayer(DMG.rocket, s.src, 'heli'); else if (d < 12) this.hitPlayer(DMG.rocket * 0.5 * (1 - d / 12), s.src, 'heli'); }
          const ds = clamp(1 - d / 90, 0, 1);
          if (ds > 0) C.cockpit.kick('hit', ds * 0.35, 0);
          this.shots.splice(i, 1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- 擊毀（combat.kill 會呼叫）
  killed(e) {
    const C = this.C;
    e.gone = true;         // 馬上離開 combat.enemies；殘骸動畫由這裡接手
    e.deadT = 0;
    // 打向它的飛彈改追附近的其他敵人（一次鎖六台、六台全滅），沒有就飛去殘骸位置
    for (const M of C.missiles) {
      if (M.own !== 'player' || M.target !== e) continue;
      let best = null, bd = 170;
      for (const o of C.enemies) {
        if (o === e || o.dead || o.gone) continue;
        const d = o.pos.distanceTo(e.pos);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) M.target = best; else { M.target = null; M.aim = e.chest(V3()); }
    }
    const how = e.killHow || (C.saber.phase === 'swing' ? 'saber' : 'shot');
    const c = e.chest(V3());
    const near = clamp(1 - c.distanceTo(C.player.pos) / 200, 0, 1);
    if (e.kind === 'tank') {
      e.state = 'wreck';
      C.audio.vehicleStop?.(e.id);
      if (how === 'crush') {
        e.flatT = 0.0001; e.speed = 0; e.vel.set(0, 0, 0);
        C.fx.explosion(_a.set(e.pos.x, e.pos.y + 1.1, e.pos.z), 0.8);
        C.fx.dust(e.pos, 1.6);
        C.audio.trample(e.pos, 'car');
        C.audio.explosion(c, 0.9);
        C.note('CRUSHED', 'am');
        C.cockpit.kick('step', 1.3, 0);
        C.fx.smokeColumn(e.pos, 6);
      } else {
        C.fx.explosion(c, 1.4);
        C.audio.explosion(c, 1.6);
        e.cook = rand(0.35, 0.8);
        e.vel.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)).multiplyScalar(e.speed);
        if (how === 'saber') { e.vel.y += 8; e.rollV = rand(3, 5) * (Math.random() < 0.5 ? -1 : 1); e.air = true; this.popTurret(e); }
        else if (Math.random() < 0.7) this.popTurret(e);
        C.fx.smokeColumn(_a.set(e.pos.x, e.pos.y + 1, e.pos.z), 9);
        if (near > 0) C.cockpit.kick('hit', near * 0.5, 0);
      }
    } else if (e.kind === 'heli') {
      e.state = 'fall'; e.fallT = 0;
      e.spinV = rand(1.6, 2.6) * (Math.random() < 0.5 ? -1 : 1);
      e.rollDir = Math.random() < 0.5 ? -1 : 1;
      C.fx.explosion(c, 0.9);
      C.audio.explosion(c, 1.1);
      if (near > 0) C.cockpit.kick('hit', near * 0.4, 0);
    } else {
      e.state = 'fall'; e.fallT = 0;
      e.rollV = rand(2, 4) * (Math.random() < 0.5 ? -1 : 1);
      C.fx.explosion(c, 1.2);
      C.audio.explosion(c, 1.4);
      C.audio.vehicleStop?.(e.id);
    }
  }
  popTurret(v) {
    v.turretOn = false;
    const pos = V3(v.pos.x - Math.sin(v.yaw) * 0.4, v.pos.y + 1.5, v.pos.z - Math.cos(v.yaw) * 0.4);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.pitch, v.yaw + v.tYaw, v.roll, 'YXZ'));
    const vel = V3(rand(-5, 5), rand(15, 21), rand(-5, 5)).addScaledVector(v.vel, 0.5);
    this.pops.push({ owner: v, pos, q, vel, ax: V3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize(), av: rand(3, 7), elev: v.elev, rest: false });
  }
  tankWreck(v, dt) {
    const C = this.C, w = C.world;
    v.deadT += dt;
    if (v.flatT > 0) { v.flatT += dt; v.flat = Math.max(0.36, 1 - v.flatT * 7); }
    if (v.air) {
      v.vel.y -= 25 * dt;
      v.pos.addScaledVector(v.vel, dt);
      v.roll += v.rollV * dt;
      w.collide(v.pos, 2.6, v.pos.y);
      const g = w.height(v.pos.x, v.pos.z);
      if (v.pos.y <= g && v.vel.y < 0) {
        v.air = false; v.vel.set(v.vel.x * 0.3, 0, v.vel.z * 0.3);
        const up = Math.abs(wrap(v.roll)) < Math.PI / 2;
        v.roll = up ? 0 : Math.PI; v.pos.y = g + (up ? 0 : 1.55);
        C.fx.dust(_a.set(v.pos.x, g, v.pos.z), 1.8);
        C.fx.explosion(_a.set(v.pos.x, g + 1, v.pos.z), 0.6);
        C.audio.debris(v.pos);
        C.audio.explosion(v.pos, 0.7);
      }
    } else {
      v.vel.x = damp(v.vel.x, 0, 2.5, dt); v.vel.z = damp(v.vel.z, 0, 2.5, dt);
      v.pos.x += v.vel.x * dt; v.pos.z += v.vel.z * dt;
      v.pitch = damp(v.pitch, 0, 5, dt);
    }
    if (v.cook > 0 && (v.cook -= dt) <= 0) {   // 彈藥殉爆
      const p = _a.set(v.pos.x, v.pos.y + 2, v.pos.z);
      C.fx.explosion(p, 0.7);
      C.fx.impact(p, _n.set(0, 1, 0), 'armor');
      C.audio.explosion(p, 0.8);
    }
    if (v.deadT > 20) v.pos.y -= dt * 0.5;
    if (v.deadT > 24) v.remove = true;
  }
  updPops(dt) {
    const C = this.C, w = C.world;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const t = this.pops[i];
      if (t.owner.remove) { this.pops.splice(i, 1); continue; }
      if (t.owner.deadT > 20) t.pos.y -= dt * 0.5;
      if (t.rest) continue;
      t.vel.y -= 22 * dt;
      t.pos.addScaledVector(t.vel, dt);
      t.q.premultiply(_q.setFromAxisAngle(t.ax, t.av * dt));
      if (Math.random() < dt * 20) C.fx.trail(t.pos);
      const g = w.height(t.pos.x, t.pos.z);
      if (t.pos.y <= g + 0.2 && t.vel.y < 0) {
        C.fx.dust(_a.set(t.pos.x, g, t.pos.z), 0.9);
        C.audio.debris(t.pos);
        if (t.vel.y < -6) { t.vel.y *= -0.3; t.vel.x *= 0.5; t.vel.z *= 0.5; t.av *= 0.5; t.pos.y = g + 0.2; }
        else {
          // 停住：正著或翻過來躺平，帶一點歪
          const up = _a.set(0, 1, 0).applyQuaternion(t.q).y > 0;
          const f = _b.set(0, 0, 1).applyQuaternion(t.q);
          t.q.setFromEuler(_e.set(rand(-0.12, 0.12), Math.atan2(f.x, f.z), (up ? 0 : Math.PI) + rand(-0.15, 0.15), 'YXZ'));
          t.pos.y = g + (up ? 0.05 : 0.8);
          t.rest = true;
        }
      }
    }
  }
  heliDown(v, dt) {
    const C = this.C, w = C.world;
    if (v.state === 'wreck') {
      v.deadT += dt;
      // 墜在屋頂上、樓塌了：殘骸跟著掉下去
      const gy = w.support(v.pos.x, v.pos.z, 3, v.pos.y);
      if (v.pos.y > gy + 1.5) { v.dropV = (v.dropV || 0) + 30 * dt; v.pos.y = Math.max(gy + 0.95, v.pos.y - v.dropV * dt); } else v.dropV = 0;
      if (v.deadT > 17) v.pos.y -= dt * 0.4;
      if (v.deadT > 20) v.remove = true;
      return;
    }
    // 打轉、冒煙、往下掉
    v.fallT += dt;
    v.spinV = clamp(v.spinV * (1 + dt * 0.9), -7, 7);
    v.yaw += v.spinV * dt;
    v.vel.y -= 15 * dt;
    v.vel.x = damp(v.vel.x, 0, 0.35, dt); v.vel.z = damp(v.vel.z, 0, 0.35, dt);
    const prev = _b.copy(v.pos);
    v.pos.addScaledVector(v.vel, dt);
    v.pitch = damp(v.pitch, 0.35, 1.2, dt); v.roll = damp(v.roll, v.rollDir * 0.5, 1.2, dt);
    v.rotA += dt * 23 * Math.max(0.35, 1 - v.fallT * 0.25);
    v.trailAcc += dt * 32;
    const tail = v.local(0, 0.6, -3, _c);
    while (v.trailAcc >= 1) { v.trailAcc -= 1; C.fx.trail(tail); }
    if (Math.random() < dt * 5) C.fx.impact(v.local(rand(-1, 1), 0.8, rand(-2, 1), _a), _n.set(0, 1, 0), 'armor');
    C.audio.vehicleLoop?.(v.id, v.pos, 'heli', Math.max(0.1, 0.8 - v.fallT * 0.3));
    const tw = w.raycast(prev, v.pos, _n);
    const g = w.support(v.pos.x, v.pos.z, 4, v.pos.y + 1.5);
    if (tw >= 0 || v.pos.y - 1.2 <= g || v.fallT > 9) {
      // 墜毀：撞牆就退回牆外、落到下面的地面或屋頂
      if (tw >= 0) { v.pos.lerpVectors(prev, v.pos, tw); if (Math.abs(_n.y) < 0.7) v.pos.addScaledVector(_n, 3); }
      const gy = w.support(v.pos.x, v.pos.z, 3, v.pos.y + 1.5);
      const p = _a.set(v.pos.x, gy + 1, v.pos.z);
      C.fx.explosion(p, 1.8);
      C.fx.smokeColumn(p, 10);
      C.audio.explosion(p, 2.2);
      C.audio.debris(p);
      w.blast(p, 16, 3);
      C.audio.vehicleStop?.(v.id);
      const near = clamp(1 - p.distanceTo(C.player.pos) / 220, 0, 1);
      if (near > 0) { C.cockpit.kick('hit', near * 0.7, 0); if (near > 0.6) C.fx.dust(_b.set(p.x, gy, p.z), 2); }
      v.state = 'wreck'; v.deadT = 0; v.rotorOn = false; v.vel.set(0, 0, 0);
      v.pos.set(p.x, gy + 0.95, p.z);
      v.roll = v.rollDir * 1.35; v.pitch = 0.12;
    }
  }
  jetDown(v, dt) {
    const C = this.C, w = C.world;
    v.fallT += dt;
    v.vel.y -= 13 * dt;
    const prev = _b.copy(v.pos);
    v.pos.addScaledVector(v.vel, dt);
    v.roll += v.rollV * dt;
    v.pitch = -Math.atan2(v.vel.y, Math.hypot(v.vel.x, v.vel.z));
    v.yaw = Math.atan2(v.vel.x, v.vel.z);
    v.trailAcc += dt * 40;
    while (v.trailAcc >= 1) { v.trailAcc -= 1; C.fx.trail(v.pos); }
    v.fireAcc += dt;
    if (v.fireAcc > 0.16) { v.fireAcc = 0; C.fx.explosion(v.local(0, 0, -4, _a), 0.32); }
    const tw = w.raycast(prev, v.pos, _n);
    const g = w.support(v.pos.x, v.pos.z, 4, v.pos.y + 1.5);
    if (tw >= 0 || v.pos.y - 1 <= g || v.fallT > 12) {
      if (tw >= 0) v.pos.lerpVectors(prev, v.pos, tw);
      const gy = w.support(v.pos.x, v.pos.z, 3, v.pos.y + 1.5);
      const p = _a.set(v.pos.x, Math.max(gy + 1, Math.min(v.pos.y, gy + 30)), v.pos.z);
      C.fx.explosion(p, 2.2);
      C.fx.smokeColumn(_c.set(p.x, gy, p.z), 8);
      C.audio.explosion(p, 2.5);
      C.audio.debris(p);
      w.blast(p, 18, 3.5);
      const near = clamp(1 - p.distanceTo(C.player.pos) / 260, 0, 1);
      if (near > 0) C.cockpit.kick('hit', near * 0.7, 0);
      v.remove = true;
    }
  }

  // ---------------------------------------------------------------- 畫出來
  render() {
    const R = this.R, t = performance.now() / 1000;
    for (const v of this.list) {
      const burnt = v.state !== 'alive';
      const [r, g, b] = burnt ? BURNT : [1, 1, 1];
      if (v.kind === 'tank') {
        _s.set(v.flat < 1 ? 1.08 : 1, v.flat, v.flat < 1 ? 1.04 : 1);
        _m.compose(v.pos, v.q, _s);
        R.tHull.push(_m, r, g, b);
        if (!burnt) R.tLit.push(_m);
        if (v.turretOn) {
          _m2.makeRotationY(v.tYaw).setPosition(0, 1.5, -0.4);
          _m3.multiplyMatrices(_m, _m2);
          R.tTur.push(_m3, r, g, b);
          const rc = v.rk < 0.7 ? 0.45 * Math.exp(-7 * v.rk) : 0;
          _m2.makeRotationX(-v.elev).multiply(_mt.makeTranslation(0, 0, -rc));
          _m2.elements[13] += 0.42; _m2.elements[14] += 1.95;
          _m.multiplyMatrices(_m3, _m2);
          R.tBar.push(_m, r, g, b);
          if (!burnt) v.muz.set(0, 0, 5.75).applyMatrix4(_m);
        }
      } else if (v.kind === 'heli') {
        _m.compose(v.pos, v.q, ONE);
        R.hBody.push(_m, r, g, b);
        if (v.rotorOn) {
          _m2.makeRotationY(v.rotA).setPosition(0, 2.14, 0.1);
          _m3.multiplyMatrices(_m, _m2);
          R.hRot.push(_m3, r, g, b);
          R.hDisc.push(_m3);
          _m2.makeRotationX(v.tailA).setPosition(-0.34, 1.75, -8.35);
          _m3.multiplyMatrices(_m, _m2);
          R.hTail.push(_m3, r, g, b);
          if (v.state === 'alive') R.hTDisc.push(_m3);
        }
        if (!burnt) {
          R.hLit.push(_m);
          const k = ((t + v.id * 0.37) % 1.1) < 0.09 ? 1 : 0.06;
          R.hBcn.push(_m, k, k, k);
        }
      } else {
        _m.compose(v.pos, v.q, ONE);
        R.jBody.push(_m, r, g, b);
        if (!burnt) R.jLit.push(_m);
      }
    }
    for (const p of this.pops) {
      _m.compose(p.pos, p.q, ONE);
      R.tTur.push(_m, BURNT[0], BURNT[1], BURNT[2]);
      _m2.makeRotationX(-p.elev); _m2.elements[13] += 0.42; _m2.elements[14] += 1.95;
      _m3.multiplyMatrices(_m, _m2);
      R.tBar.push(_m3, BURNT[0], BURNT[1], BURNT[2]);
    }
    for (const p of R.pools) p.end();
  }

  dispose() {
    for (const v of this.list) this.C.audio.vehicleStop?.(v.id);
    for (const s of this.shots) if (s.h) this.C.fx.missileEnd(s.h);
    this.list = []; this.shots = []; this.pops = [];
    for (const p of this.R.pools) p.end();
  }
}
