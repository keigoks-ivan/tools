// 機體：硬表面零件（切角＋倒角裝甲、車床零件、蛇腹管）逐骨合併成一個網格。
// 單一材質：頂點色＋每頂點 PBR（金屬度、粗糙度、倒角邊、靜止高度）；掉漆、刮痕、雨痕、腳部沙塵都在 shader 裡用真實磨損貼圖（三面投影）算。
// 主角機 XG-01「蒼焰」、敵機 AGX-9「獵犬」、指揮官機、重裝機。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeDecal } from './textures.js';
import { MechMotion, wrap, lerpAngle, damp } from './anim.js';

// ================================================================ 材質
const MATS = {};
export function initMechMaterials(A) {
  MATS.clean = paintMaterial(A, 0.24);
  MATS.dirty = paintMaterial(A, 0.58);
  MATS.shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
}
function paintMaterial(A, wear) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wearMap = { value: A.wearM };
    sh.uniforms.frameMap = { value: A.frameM };
    sh.uniforms.wearAmt = { value: wear };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 pbr; varying vec4 vPbr; varying vec3 vOP; varying vec3 vON;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPbr = pbr; vOP = position; vON = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D wearMap, frameMap; uniform float wearAmt;
        varying vec4 vPbr; varying vec3 vOP; varying vec3 vON;
        vec4 wv_tri(sampler2D t, vec3 p, vec3 n, float s){
          vec3 a = pow(abs(n), vec3(4.0)); a /= (a.x + a.y + a.z + 1e-5);
          return texture2D(t, p.zy * s) * a.x + texture2D(t, p.xz * s + 0.31) * a.y + texture2D(t, p.xy * s + 0.67) * a.z;
        }
        float wv_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float wv_n(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(wv_h(i), wv_h(i + vec3(1,0,0)), f.x), mix(wv_h(i + vec3(0,1,0)), wv_h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(wv_h(i + vec3(0,0,1)), wv_h(i + vec3(1,0,1)), f.x), mix(wv_h(i + vec3(0,1,1)), wv_h(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wv_nO = normalize(vON);
        vec4 wv_W = wv_tri(wearMap, vOP, wv_nO, 0.22);
        vec4 wv_F = wv_tri(frameMap, vOP, wv_nO, 0.45);
        float wv_S = wv_tri(wearMap, vOP * vec3(1.0, 0.1, 1.0), wv_nO, 0.32).b;
        float wv_nz = wv_n(vOP * 0.45);
        float wv_nz2 = wv_n(vOP * 1.9 + 7.0);
        float wv_paint = 1.0 - step(0.5, vPbr.x);
        float wv_edge = vPbr.z;
        float wv_chipN = (1.0 - wv_W.b) * 0.95 + wv_edge * (0.2 + 0.55 * wv_nz) + (wv_nz - 0.5) * 0.35;
        float wv_th = 1.0 - wearAmt * 0.26;
        float wv_chip = wv_paint * smoothstep(wv_th, wv_th + 0.04, wv_chipN);
        float wv_halo = wv_paint * smoothstep(wv_th - 0.1, wv_th, wv_chipN) * (1.0 - wv_chip);
        vec3 wv_base = diffuseColor.rgb * (0.9 + wv_nz * 0.14 + (wv_nz2 - 0.5) * 0.06);
        wv_base = mix(wv_base, wv_base * 1.2 + 0.015, wv_edge * mix(0.3, 0.6, wv_paint));
        float wv_streak = smoothstep(0.3, 0.9, 1.0 - wv_S) * wv_paint * wearAmt;
        wv_base *= 1.0 - wv_streak * 0.35;
        float wv_dust = smoothstep(4.8, 0.0, vPbr.w) * (0.35 + 0.65 * wv_nz) * wearAmt;
        wv_base = mix(wv_base, vec3(0.32, 0.28, 0.23), wv_dust * 0.42);
        wv_base *= 1.0 - wv_halo * 0.45;
        diffuseColor.rgb = mix(wv_base, vec3(0.5, 0.5, 0.52) * (0.8 + wv_W.g), wv_chip);
        float wv_bump = wv_W.b * 0.45 - wv_chip * 0.5 + (1.0 - wv_paint) * wv_F.b * 0.5;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(vPbr.y + (wv_W.g - 0.15) * 0.4 * wv_paint + (wv_F.g - 0.65) * 0.6 * (1.0 - wv_paint) + wv_dust * 0.4 + wv_streak * 0.12, 0.06, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.3 + wv_W.g * 0.3, wv_chip);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = max(vPbr.x, wv_chip * 0.95);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(wv_bump), hy = dFdy(wv_bump);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad * 0.03);
        }`);
  };
  return m;
}
const glowCache = new Map();
function glow(r, g, b) {
  const k = [r, g, b].join();
  if (!glowCache.has(k)) glowCache.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }));
  return glowCache.get(k);
}

// ================================================================ 零件工具
// 每個零件都轉成非索引幾何，只留 position/normal；userData.edge＝倒角面（給邊緣磨損）
function prep(g, edgeFn) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.normal, e = new Float32Array(n.count);
  if (edgeFn) for (let i = 0; i < n.count; i++) e[i] = edgeFn(n.getX(i), n.getY(i), n.getZ(i));
  g.userData.edge = e;
  return g;
}
const EXT_EDGE = (nx, ny, nz) => (Math.abs(nz) > 0.12 && Math.abs(nz) < 0.97 ? 1 : 0);
const BOX_EDGE = (nx, ny, nz) => ((Math.abs(nz) > 0.12 && Math.abs(nz) < 0.97) || (Math.abs(nx) > 0.3 && Math.abs(ny) > 0.3 && Math.abs(nz) < 0.12) ? 1 : 0);
function extrude(pts, depth, bev) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  bev = Math.max(0.005, Math.min(bev, depth * 0.3));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.005, depth - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev,
    bevelSegments: 1, curveSegments: 6,
  });
  g.translate(0, 0, -(depth - bev * 2) / 2);
  return g;
}
// 切角矩形外框
function oct(w, h, cut) {
  const x = w / 2, y = h / 2;
  cut = Math.min(cut, x * 0.45, y * 0.45);
  return cut > 0.004
    ? [[-x + cut, -y], [x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]]
    : [[-x, -y], [x, -y], [x, y], [-x, y]];
}
// 倒角方塊（正面外框切角 cut、前後倒角 c）
function blk(w, h, d, c = 0.1, cut = c) {
  return prep(extrude(oct(w, h, cut), d, Math.min(c, w * 0.2, h * 0.2)), BOX_EDGE);
}
// 側面輪廓 [[z,y]...] 沿 X 擠出 width
function prof(pts, width, c = 0.1) {
  const g = prep(extrude(pts, width, c), EXT_EDGE);
  g.rotateY(-Math.PI / 2);
  return g;
}
// 正面輪廓 [[x,y]...] 沿 Z 擠出 thick
function blade(pts, thick, c = 0.03) { return prep(extrude(pts, thick, c), EXT_EDGE); }
function lathe(pts, seg = 20) { return prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)); }
function cyl(rt, rb, h, seg = 18, open = false) { return prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)); }
function sph(r, ws = 18, hs = 12) { return prep(new THREE.SphereGeometry(r, ws, hs)); }
// 嵌入式螺栓：與所屬骨頭一起合併，毋須多一個 draw call。
function bolt(r = 0.1) { return cyl(r, r * 1.08, r * 0.42, 8); }
// 噴射口鐘形（開口朝 -Y）
function bell(r, len) {
  return lathe([[r * 0.3, 0.05], [r * 0.5, 0], [r * 0.62, -len * 0.2], [r * 0.85, -len * 0.62], [r, -len], [r * 0.93, -len * 1.02], [r * 0.78, -len * 0.62], [r * 0.5, -len * 0.18], [r * 0.3, -len * 0.05]], 20);
}
// 沿 Y 漸縮
function taper(g, sxTop, szTop = 1, sxBot = 1, szBot = 1) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y || 1);
    p.setX(i, p.getX(i) * THREE.MathUtils.lerp(sxBot, sxTop, t));
    p.setZ(i, p.getZ(i) * THREE.MathUtils.lerp(szBot, szTop, t));
  }
  g.computeVertexNormals();
  return g;
}
// 把「沿 Z 延伸、厚度在 X」的板子繞垂直軸彎：中間往 +X 鼓
function bendPlate(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), th = z / R;
    p.setX(i, (x + R) * Math.cos(th) - R);
    p.setZ(i, (x + R) * Math.sin(th));
  }
  g.computeVertexNormals();
  return g;
}
function noEdge(g) { g.userData.edge = new Float32Array(g.attributes.position.count); return g; }
// 蛇腹管
function hose(points, r, rings = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const parts = [prep(new THREE.TubeGeometry(curve, rings * 2, r * 0.72, 8, false))];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, p = curve.getPoint(t), tg = curve.getTangent(t);
    const g = new THREE.TorusGeometry(r, r * 0.3, 6, 12);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg));
    g.translate(p.x, p.y, p.z);
    parts.push(prep(g));
  }
  return noEdge(mergeGeometries(parts));
}
// 一串水平環（關節護套）
function ribs(y0, y1, n, r, t) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.TorusGeometry(r, t, 6, 20); g.rotateX(Math.PI / 2);
    g.translate(0, THREE.MathUtils.lerp(y0, y1, n > 1 ? k / (n - 1) : 0), 0);
    parts.push(prep(g));
  }
  return noEdge(mergeGeometries(parts));
}
// 前方弧形環（單眼滑軌上下緣）
function arcRing(r, t, arc) {
  const g = new THREE.TorusGeometry(r, t, 6, 28, arc);
  g.rotateZ(Math.PI / 2 - arc / 2); g.rotateX(Math.PI / 2);
  return prep(g);
}

const P = (hex, m = 0, r = 0.5) => ({ c: new THREE.Color(hex), m, r });
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// ================================================================ 塗裝（m＝金屬度，r＝粗糙度）
const SCHEMES = {
  hero: {
    main: P(0xe2e4df, 0.08, 0.35), second: P(0x1b3472, 0.08, 0.38), accent: P(0xb6262e, 0.06, 0.38), yellow: P(0xd9a62c, 0.3, 0.34),
    frame: P(0x737c84, 0.85, 0.38), dark: P(0x171d25, 0.55, 0.58), weapon: P(0x303943, 0.55, 0.47), sole: P(0x17191a, 0.1, 0.85),
    eye: [0.12, 2.1, 0.95], wear: 'clean',
  },
  grunt: {
    main: P(0x566041, 0, 0.62), second: P(0x3a432f, 0, 0.64), accent: P(0x6b7153, 0, 0.6), yellow: P(0xb08422, 0, 0.55),
    frame: P(0x51555a, 0.75, 0.5), dark: P(0x1a1b1c, 0.2, 0.68), weapon: P(0x36393c, 0.45, 0.5), sole: P(0x131415, 0, 0.9),
    eye: [12, 0.6, 3], wear: 'dirty',
  },
  ace: {
    main: P(0x851c22, 0, 0.5), second: P(0x4a1015, 0, 0.52), accent: P(0x2a2a2e, 0, 0.5), yellow: P(0xc2952c, 0, 0.45),
    frame: P(0x4a4d52, 0.8, 0.45), dark: P(0x171718, 0.2, 0.62), weapon: P(0x2b2c2f, 0.45, 0.45), sole: P(0x131415, 0, 0.9),
    eye: [12, 0.6, 3], wear: 'dirty',
  },
  heavy: {
    main: P(0x4a4e53, 0, 0.58), second: P(0x2c2f33, 0, 0.6), accent: P(0xb85c18, 0, 0.5), yellow: P(0xb85c18, 0, 0.5),
    frame: P(0x46494d, 0.8, 0.46), dark: P(0x161617, 0.2, 0.68), weapon: P(0x2c2e32, 0.5, 0.45), sole: P(0x121314, 0, 0.9),
    eye: [12, 3, 0.5], wear: 'dirty',
  },
};

// ================================================================ 機體
export class Mech {
  constructor(style = 'hero', schemeKey = style) {
    this.style = style;
    this.schemeKey = schemeKey;
    const S = (this.S = SCHEMES[schemeKey]);
    this.root = new THREE.Group();
    this.bones = {};
    this.parts = new Map();
    this.glows = [];
    this.nozzles = [];
    this.mat = MATS[S.wear];
    const hero = style === 'hero';
    const L = (this.L = hero
      ? { pelvis: 9.9, hip: [1.45, -0.5, 0], knee: [0, -4.25, 0.1], ankle: [0, -4.0, -0.1], torso: [0, 0.85, 0], head: [0, 4.95, 0.35], shoulder: [3.05, 3.95, -0.05], elbow: -2.85, hand: -3.05 }
      : { pelvis: 9.4, hip: [1.55, -0.55, 0], knee: [0, -3.95, 0.15], ankle: [0, -3.6, -0.1], torso: [0, 0.7, 0], head: [0, 5.35, 0.3], shoulder: [3.4, 3.95, -0.1], elbow: -2.9, hand: -3.0 });
    const b = this.bones;
    const bone = (name, parent, x, y, z) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); b[name] = o; return o; };
    bone('pelvis', this.root, 0, L.pelvis, 0);
    bone('torso', b.pelvis, ...L.torso).rotation.order = 'YXZ';
    bone('head', b.torso, ...L.head);
    bone('back', b.torso, 0, 0, 0);
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      bone('shoulder' + n, b.torso, sx * L.shoulder[0], L.shoulder[1], L.shoulder[2]).rotation.order = 'YXZ';
      bone('elbow' + n, b['shoulder' + n], 0, L.elbow, 0);
      bone('hand' + n, b['elbow' + n], 0, L.hand, 0);
      bone('hip' + n, b.pelvis, sx * L.hip[0], L.hip[1], L.hip[2]).rotation.order = 'YXZ';
      bone('knee' + n, b['hip' + n], ...L.knee);
      bone('ankle' + n, b['knee' + n], ...L.ankle);
    }
    if (hero) this.buildHero(S); else this.buildGrunt(S, style);
    this.buildFlames();
    this.finish();

    this.legYaw = 0; this.pose = { boost: 0, air: 0 };
    this.land = 0; this.landV = 0; this.thrust = 0; this.recoil = 0; this.swing = 0;
    this.motion = new MechMotion(this);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(this.muzzleLocal);
    this.weapon.add(this.muzzle);
    this.root.traverse((o) => { if (o.isMesh || o.isSprite) o.userData.mech = this; });
  }

  // 零件放到某骨頭（骨頭座標）
  add(bone, g, paint, pos = [0, 0, 0], rot = [0, 0, 0], scl = null) {
    _m4.compose(_v.set(...pos), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ')), scl ? _s.set(...scl) : _s.set(1, 1, 1));
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count, e = g.userData.edge;
    const col = new Float32Array(n * 3), pbr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 3] = paint.c.r; col[i * 3 + 1] = paint.c.g; col[i * 3 + 2] = paint.c.b;
      pbr[i * 4] = paint.m; pbr[i * 4 + 1] = paint.r; pbr[i * 4 + 2] = e ? e[i] : 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 4));
    if (!this.parts.has(bone)) this.parts.set(bone, []);
    this.parts.get(bone).push(g);
    return g;
  }
  addGlow(bone, g, color, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(g, glow(...color));
    m.position.set(...pos); m.rotation.set(...rot);
    m.userData.noAO = true;
    bone.add(m);
    this.glows.push(m);
    return m;
  }

  // 每根骨頭合併成一個網格；pbr.w 記錄靜止時離地高度（腳部沙塵用）
  finish() {
    this.root.updateMatrixWorld(true);
    this.meshes = [];
    for (const [bone, list] of this.parts) {
      const g = mergeGeometries(list);
      const p = g.attributes.position, pbr = g.attributes.pbr;
      for (let i = 0; i < p.count; i++) pbr.setW(i, _v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(bone.matrixWorld).y);
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      bone.add(mesh);
      this.meshes.push(mesh);
    }
    this.parts.clear();
  }

  // ======================= 主角機 XG-01 =======================
  buildHero(S) {
    const b = this.bones, A = this.add.bind(this);
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const ank = b['ankle' + n], kn = b['knee' + n], hp = b['hip' + n];
      // 腳掌
      A(ank, prof([[-1.6, -0.85], [2.45, -0.85], [2.6, -0.5], [1.65, -0.1], [0.7, 0.32], [-0.75, 0.38], [-1.7, -0.2]], 2.05, 0.13), S.accent);
      A(ank, prof([[0.75, 0.3], [1.7, -0.08], [2.62, -0.48], [2.66, -0.6], [1.55, -0.3], [0.6, 0.1]], 1.2, 0.06), S.main);
      // 兩片腳尖裝甲與腳背脊線，讓腳掌看起來是承重機構。
      for (const side of [-1, 1]) {
        A(ank, prof([[0.35, 0.43], [1.45, 0.18], [2.48, -0.35], [2.05, -0.45], [0.48, 0.12]], 0.67, 0.055), S.main, [side * 0.57, 0.04, 0]);
        A(ank, blk(0.12, 0.13, 1.25, 0.025), S.frame, [side * 0.96, 0.25, 1.05], [0, side * 0.12, 0]);
      }
      A(ank, blk(2.15, 0.3, 4.4, 0.06), S.sole, [0, -1.0, 0.45]);
      A(ank, prof([[-1.85, -0.87], [-1.0, -0.87], [-1.0, -0.1], [-1.6, -0.32]], 1.3, 0.08), S.frame);
      A(ank, cyl(0.62, 0.62, 1.6), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const s of [-1, 1]) A(ank, blk(0.25, 1.25, 1.9, 0.08, 0.3), S.main, [s * 1.05, -0.12, -0.15]);
      // 小腿
      A(kn, cyl(0.5, 0.55, 3.9), S.frame, [0, -2.0, 0]);
      A(kn, taper(prof([[1.0, 0.2], [1.3, -1.0], [1.22, -3.1], [1.02, -4.15], [-1.2, -4.15], [-1.5, -3.2], [-1.55, -1.4], [-1.0, 0.2]], 2.3, 0.16), 0.92, 1, 1.03, 1), S.main);
      A(kn, prof([[1.28, -1.15], [1.44, -1.3], [1.34, -3.05], [1.13, -4.05], [0.98, -4.0], [1.12, -3.0], [1.18, -1.25]], 1.5, 0.07), S.main);
      A(kn, prof([[0.4, 0.95], [1.35, 0.55], [1.52, -0.55], [1.22, -1.15], [0.5, -0.42]], 1.8, 0.13), S.main);
      A(kn, blade([[-0.55, 0.35], [0.55, 0.35], [0.83, -0.2], [0.48, -1.0], [-0.48, -1.0], [-0.83, -0.2]], 0.2, 0.055), S.second, [0, 0, 1.52]);
      for (const side of [-1, 1]) {
        A(kn, prof([[1.47, -1.25], [1.55, -1.5], [1.4, -3.15], [1.12, -3.8], [1.0, -3.7], [1.23, -1.4]], 0.35, 0.045), S.second, [side * 0.84, 0, 0]);
        A(kn, cyl(0.105, 0.105, 2.0, 10), S.frame, [side * 0.78, -2.25, -1.17], [0.13, 0, 0]);
        A(kn, cyl(0.15, 0.15, 0.8, 10), S.dark, [side * 0.78, -1.25, -1.06], [0.13, 0, 0]);
      }
      A(kn, blk(1.0, 0.26, 0.14, 0.04), S.accent, [0, -0.3, 1.5], [-0.28, 0, 0]);
      A(kn, blk(1.45, 1.7, 0.5, 0.1), S.frame, [0, -3.15, -1.55]);
      for (const dx of [-0.42, 0.42]) {
        A(kn, bell(0.36, 0.7), S.dark, [dx, -3.85, -1.6], [0.45, 0, 0]);
        this.nozzles.push({ bone: kn, pos: [dx, -4.5, -1.9], rot: [0.45, 0, 0], r: 0.34, len: 3.2 });
      }
      A(kn, blk(0.14, 1.15, 0.5, 0.03), S.yellow, [sx * 1.12, -2.1, 0.45], [0, 0, -sx * 0.03]);
      A(kn, cyl(0.68, 0.68, 1.8), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      A(kn, cyl(0.14, 0.14, 2.4), S.frame, [-sx * 0.75, -1.4, -0.95], [0.12, 0, 0]);
      // 大腿
      A(hp, cyl(0.62, 0.58, 4.2), S.frame, [0, -2.1, 0]);
      A(hp, taper(blk(1.95, 3.3, 2.15, 0.2, 0.35), 1.1, 1.06, 0.95, 0.96), S.main, [0, -2.45, 0.05]);
      A(hp, blade([[-0.65, 0], [0.65, 0], [0.88, -0.5], [0.75, -2.05], [0.35, -2.58], [-0.35, -2.58], [-0.75, -2.05], [-0.88, -0.5]], 0.19, 0.055), S.main, [0, -1.02, 1.21]);
      A(hp, blk(0.92, 0.12, 0.09, 0.02), S.second, [0, -1.55, 1.34]);
      A(hp, blk(0.14, 1.7, 1.2, 0.04), S.main, [sx * 1.08, -2.3, 0]);
      A(hp, blk(1.1, 0.38, 0.14, 0.04), S.second, [0, -1.35, 1.13]);
      A(hp, sph(0.85), S.frame);
    }
    // 腰
    const pv = b.pelvis;
    A(pv, blk(3.0, 1.2, 2.3, 0.1), S.frame, [0, -0.1, 0]);
    A(pv, taper(blk(4.1, 1.0, 2.75, 0.2, 0.35), 1.02, 1.02, 0.95, 0.96), S.main, [0, 0.35, 0]);
    A(pv, prof([[1.25, 0.1], [1.42, -0.55], [0.8, -1.45], [-0.6, -1.3], [-0.9, 0.1]], 1.35, 0.12), S.accent);
    A(pv, blk(0.95, 0.5, 0.16, 0.05), S.yellow, [0, 0.35, 1.42]);
    for (const sx of [-1, 1]) {
      A(pv, prof([[0.2, 0.4], [0.55, -2.2], [0.1, -2.3], [-0.15, 0.35]], 1.75, 0.1), S.main, [sx * 1.05, 0, 1.3], [0.05, 0, sx * 0.08]);
      A(pv, blk(0.95, 0.55, 0.1, 0.03), S.yellow, [sx * 1.1, -0.95, 1.72], [-0.1, 0, sx * 0.08]);
      A(pv, prof([[1.1, 0.4], [1.0, -1.9], [-1.1, -1.9], [-1.2, 0.4]], 0.38, 0.08), S.main, [sx * 2.2, -0.15, 0], [0, 0, sx * 0.12]);
      A(pv, blk(1.2, 1.0, 1.2, 0.1), S.frame, [sx * 1.7, -0.1, 0]);
    }
    A(pv, prof([[0.12, 0.4], [0.12, -1.8], [-0.35, -1.7], [-0.35, 0.4]], 2.7, 0.08), S.main, [0, 0, -1.3]);
    // 胸
    const t = b.torso;
    A(t, blk(2.6, 1.5, 2.3, 0.15), S.frame, [0, 0.6, 0]);
    A(t, ribs(0.25, 0.95, 3, 1.25, 0.12), S.dark);
    A(t, taper(blk(3.0, 1.3, 2.6, 0.2, 0.4), 1.08, 1.05), S.accent, [0, 1.35, 0.1]);
    A(t, taper(prof([[1.5, 0.35], [1.85, 2.4], [1.6, 3.25], [-1.3, 3.4], [-1.75, 1.9], [-1.5, 0.35]], 4.8, 0.22), 1.1, 1, 0.82, 1), S.second, [0, 1.5, 0]);
    // 胸甲左右錯層，中央露出深色機架；前方是真實幾何縫隙。
    for (const side of [-1, 1]) {
      A(t, blade([[0.28, 2.32], [1.75, 2.48], [2.38, 3.7], [2.06, 4.55], [0.58, 4.23], [0.34, 3.32]].map(([x, y]) => [x * side, y]), 0.26, 0.075), S.main, [0, 0, 1.93]);
      A(t, blade([[0.45, 2.5], [1.47, 2.55], [1.68, 2.85], [0.55, 2.79]].map(([x, y]) => [x * side, y]), 0.11, 0.025), S.frame, [0, 0, 2.11]);
      for (const x of [0.85, 1.75]) A(t, bolt(0.085), S.frame, [side * x, 4.13, 2.12], [Math.PI / 2, 0, 0]);
    }
    A(t, blade([[-0.27, 2.55], [0.27, 2.55], [0.42, 3.5], [0.16, 4.05], [-0.16, 4.05], [-0.42, 3.5]], 0.2, 0.05), S.accent, [0, 0, 2.08]);
    A(t, blk(1.5, 1.2, 0.3, 0.1, 0.2), S.second, [0, 2.65, 1.72], [-0.15, 0, 0]);
    A(t, blk(1.1, 0.12, 0.1, 0.02), S.dark, [0, 2.15, 1.85], [-0.15, 0, 0]);
    for (const sx of [-1, 1]) {
      A(t, blk(1.25, 0.95, 0.32, 0.08, 0.15), S.yellow, [sx * 1.45, 3.05, 2.28], [-0.12, 0, 0]);
      for (let k = 0; k < 4; k++) A(t, blk(1.02, 0.07, 0.12, 0.015), S.dark, [sx * 1.45, 2.75 + k * 0.2, 2.49], [-0.12, 0, 0]);
      A(t, blk(0.95, 1.45, 2.35, 0.15, 0.3), S.main, [sx * 2.4, 3.9, -0.05]);
      A(t, blade([[0, 0], [0.55, 0], [0.78, 0.38], [0.3, 0.75], [-0.45, 0.62]], 0.16, 0.04), S.yellow, [sx * 2.4, 3.78, 1.25]);
    }
    A(t, taper(blk(5.3, 0.9, 3.2, 0.22, 0.5), 1.0, 1.0, 0.95, 1), S.second, [0, 4.75, -0.05]);
    A(t, cyl(0.6, 0.7, 0.6), S.frame, [0, 5.0, 0.3]);
    // 背包
    const bk = b.back;
    A(bk, taper(blk(3.1, 3.3, 1.5, 0.22, 0.45), 0.9, 1, 1, 1), S.main, [0, 2.8, -2.25]);
    A(bk, blk(2.3, 1.1, 0.6, 0.1), S.frame, [0, 1.5, -2.95]);
    A(bk, blk(2.6, 0.5, 0.4, 0.08), S.second, [0, 3.9, -3.0]);
    A(bk, blk(2.05, 0.32, 0.08, 0.025), S.dark, [0, 3.94, -3.25]);
    for (let k = 0; k < 6; k++) A(bk, blk(0.19, 0.27, 0.09, 0.025), S.yellow, [-0.86 + k * 0.34, 3.94, -3.31], [0, 0, -0.38]);
    for (const sx of [-1, 1]) {
      A(bk, bell(0.95, 1.5), S.dark, [sx * 0.85, 1.55, -3.0], [0.35, 0, 0]);
      A(bk, cyl(0.62, 0.62, 0.25), S.frame, [sx * 0.85, 1.6, -2.98], [0.35, 0, 0]);
      this.addGlow(bk, cyl(0.48, 0.48, 0.06, 16), [0.12, 1.6, 3.0], [sx * 0.85, 0.25, -3.43], [0.35, 0, 0]);
      this.nozzles.push({ bone: bk, pos: [sx * 0.85, 0.1, -3.55], rot: [0.35, 0, 0], r: 0.9, len: 7 });
      A(bk, cyl(0.2, 0.2, 1.9), S.main, [sx * 1.0, 4.6, -2.4], [-0.5, 0, -sx * 0.35]);
      A(bk, cyl(0.24, 0.24, 0.35), S.accent, [sx * 1.33, 5.35, -2.0], [-0.5, 0, -sx * 0.35]);
      A(bk, blk(0.5, 1.6, 0.8, 0.08), S.frame, [sx * 1.7, 2.6, -2.5]);
      for (let k = 0; k < 3; k++) A(bk, blk(0.53, 0.1, 0.19, 0.025), S.dark, [sx * 1.74, 2.1 + k * 0.34, -3.04]);
    }
    // 頭
    const h = b.head;
    A(h, cyl(0.5, 0.6, 0.7), S.frame, [0, 0.25, 0]);
    A(h, taper(blk(1.5, 1.3, 1.65, 0.2, 0.4), 0.82, 0.9, 1, 1), S.main, [0, 0.95, -0.05]);
    A(h, prof([[0.96, 0.3], [0.99, 0.8], [0.62, 1.05], [0.45, 0.28]], 0.95, 0.06), S.main);
    A(h, blade([[-0.53, 0.89], [0.53, 0.89], [0.65, 1.14], [0.43, 1.28], [-0.43, 1.28], [-0.65, 1.14]], 0.1, 0.025), S.dark, [0, 0, 1.04]);
    A(h, blk(0.55, 0.25, 0.3, 0.06), S.accent, [0, 0.35, 0.9]);
    for (const sx of [-1, 1]) {
      A(h, blk(0.08, 0.3, 0.06, 0.01), S.dark, [sx * 0.14, 0.55, 1.0]);
      A(h, blk(0.35, 0.72, 0.98, 0.08), S.main, [sx * 0.84, 0.85, 0]);
      A(h, cyl(0.1, 0.1, 0.35), S.yellow, [sx * 0.72, 1.28, 0.62], [Math.PI / 2, 0, 0]);
      A(h, blade([[0, 0], [0.16, 0.2], [1.8, 1.32], [1.9, 1.22], [0.36, -0.04]].map(([x, y]) => [x * sx, y]), 0.12, 0.02), S.yellow, [0, 1.28, 0.82]);
    }
    this.addGlow(h, mergeGeometries([-1, 1].map((sx) => blade([[0.04, -0.055], [0.36, -0.02], [0.3, 0.07], [0.03, 0.055]].map(([x, y]) => [x * sx, y]), 0.045, 0.012))), S.eye, [0, 1.04, 1.13]);
    A(h, blk(0.4, 0.42, 0.3, 0.06), S.accent, [0, 1.45, 0.8]);
    A(h, blk(0.4, 0.15, 0.6, 0.04), S.frame, [0, 1.62, 0]);
    A(h, blade([[-0.51, 0.88], [0.51, 0.88], [0.35, 0.32], [0, 0.12], [-0.35, 0.32]], 0.19, 0.04), S.main, [0, 0, 1.03]);
    // 手臂
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const sh = b['shoulder' + n], el = b['elbow' + n];
      A(sh, sph(0.9), S.frame);
      A(sh, taper(blk(2.3, 2.2, 2.45, 0.25, 0.55), 1.0, 1.0, 0.92, 0.95), S.main, [sx * 0.35, 0.05, 0]);
      A(sh, blk(0.2, 1.2, 2.3, 0.05), S.second, [sx * 1.52, 0.2, 0]);
      A(sh, blk(1.8, 0.32, 0.18, 0.04), S.accent, [sx * 0.35, 0.75, 1.24]);
      A(sh, cyl(0.55, 0.5, 2.2), S.frame, [0, -1.6, 0]);
      A(sh, blk(1.3, 1.8, 1.4, 0.15, 0.3), S.main, [0, -1.95, 0]);
      A(el, cyl(0.6, 0.6, 1.3), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      A(el, taper(blk(1.5, 2.9, 1.65, 0.2, 0.4), 0.9, 0.92, 1.08, 1.06), S.main, [0, -1.55, 0]);
      A(el, blk(1.62, 0.45, 1.78, 0.1), S.main, [0, -2.85, 0]);
      A(el, blk(0.9, 0.35, 0.15, 0.04), S.accent, [0, -0.55, 0.84]);
      A(el, blk(0.16, 1.7, 0.9, 0.04), S.frame, [sx * 0.8, -1.5, 0]);
      this.buildHand(b['hand' + n], S, sx);
    }
    // 光束步槍
    const W = new THREE.Group();
    A(W, blk(0.62, 0.95, 4.4, 0.1), S.weapon, [0, 0, 0.6]);
    A(W, blk(0.5, 0.55, 2.2, 0.08), S.weapon, [0, 0.55, 0.9]);
    A(W, cyl(0.2, 0.23, 2.6), S.frame, [0, 0.05, 4.0], [Math.PI / 2, 0, 0]);
    A(W, blk(0.52, 0.52, 0.55, 0.08), S.weapon, [0, 0.05, 5.35]);
    A(W, blk(0.45, 0.45, 1.4, 0.06), S.weapon, [0, 0.95, 1.6]);
    A(W, blk(0.4, 1.3, 0.5, 0.06), S.frame, [0, -0.9, 0], [0.25, 0, 0]);
    A(W, blk(0.55, 0.9, 1.2, 0.08), S.accent, [0, -0.75, 2.1]);
    A(W, prof([[0, 0.35], [-2.0, 0.2], [-2.2, -0.5], [-0.4, -0.45]], 0.5, 0.06), S.weapon, [0, 0, -1.6]);
    A(W, blk(0.08, 0.25, 1.4, 0.02), S.yellow, [0.32, 0.1, 0.4]);
    this.addGlow(W, cyl(0.17, 0.17, 0.08), [0.3, 4, 1.6], [0, 0.95, 2.32], [Math.PI / 2, 0, 0]);
    this.attachWeapon(W, new THREE.Vector3(0, 0.05, 5.7));
    // 盾（左前臂外側）
    const SH = new THREE.Group();
    const shOut = [[3.3, 0], [2.5, 1.45], [-2.3, 1.25], [-3.5, 0], [-2.3, -1.25], [2.5, -1.45]].map(([y, z]) => [z, y]);
    A(SH, bendPlate(prof(shOut, 0.3, 0.06), 5), S.main);
    A(SH, bendPlate(prof(shOut.map(([z, y]) => [z * 0.84, y * 0.86]), 0.34, 0.06), 5), S.accent, [0.08, 0, 0]);
    A(SH, blk(0.12, 2.4, 0.45, 0.02), S.yellow, [0.3, 0.9, 0]);
    A(SH, blk(0.12, 0.45, 1.5, 0.02), S.yellow, [0.3, 1.5, 0]);
    A(SH, blk(0.5, 1.2, 0.8, 0.08), S.frame, [-0.35, 0, 0]);
    SH.position.set(1.05, -1.5, 0.3);
    b.elbowL.add(SH);
    // 光劍（揮砍時才出現）
    this.saber = new THREE.Group();
    A(this.saber, cyl(0.2, 0.2, 1.4), S.frame);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 11, 12).translate(0, 6.2, 0), glow(9, 2.2, 5.5));
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 11.6, 12, 1, true).translate(0, 6.2, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 1.8), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.userData.noAO = halo.userData.noAO = true;
    this.saber.add(core, halo);
    this.saber.position.set(0, -0.9, 0.35);
    this.saber.rotation.x = Math.PI / 2;
    this.saber.visible = false;
    b.handL.add(this.saber);
    // 標誌
    this.decal(b.shoulderL, makeDecal('01', 'XG-01 AZURE FLAME'), [1.64, 0.1, 0.3], [0, Math.PI / 2, 0], [1.3, 0.65]);
    this.decal(b.shoulderR, makeDecal('01', 'XG-01 AZURE FLAME'), [-1.64, 0.1, 0.3], [0, -Math.PI / 2, 0], [1.3, 0.65]);
    this.height = 19;
  }

  buildHand(hd, S, sx) {
    const A = this.add.bind(this);
    A(hd, blk(1.0, 1.05, 0.85, 0.12), S.frame, [0, -0.55, 0.05]);
    A(hd, blk(1.1, 0.35, 0.95, 0.08), S.main, [0, -0.28, 0.05]);
    for (let k = 0; k < 4; k++) {
      const x = -0.36 + k * 0.24;
      A(hd, blk(0.21, 0.5, 0.4, 0.05), S.dark, [x, -1.1, 0.22], [0.55, 0, 0]);
      A(hd, blk(0.21, 0.42, 0.36, 0.05), S.dark, [x, -1.35, 0.55], [1.4, 0, 0]);
    }
    A(hd, blk(0.28, 0.55, 0.36, 0.06), S.dark, [-sx * 0.55, -0.75, 0.4], [0.5, 0, sx * 0.3]);
  }

  // 武器在自身座標沿 +Z 建模、握把在 (0,-0.8,0)；轉到手上沿手臂方向
  attachWeapon(W, muzzle) {
    W.position.set(0, -0.9, 0.95);
    W.rotation.x = Math.PI / 2;
    this.bones.handR.add(W);
    this.weapon = W;
    this.muzzleLocal = muzzle;
  }

  decal(bone, tex, pos, rot, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
    m.position.set(...pos); m.rotation.set(...rot);
    m.userData.noAO = true; m.userData.decal = true;
    bone.add(m);
    return m;
  }

  // ======================= 單眼敵機 AGX-9 =======================
  buildGrunt(S, style) {
    const b = this.bones, A = this.add.bind(this);
    const heavy = style === 'heavy', ace = this.schemeKey === 'ace';
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const ank = b['ankle' + n], kn = b['knee' + n], hp = b['hip' + n];
      // 腳掌
      const fz = 0.88;
      A(ank, prof([[-1.95, -0.95], [2.6, -0.95], [2.7, -0.58], [1.8, -0.12], [0.8, 0.42], [-0.95, 0.5], [-2.0, -0.15]].map(([z, y]) => [z * fz, y]), 2.45, 0.16), S.main);
      A(ank, prof([[1.5, -0.95], [2.8, -0.95], [2.82, -0.62], [1.72, -0.2]].map(([z, y]) => [z * fz, y]), 2.6, 0.1), S.second);
      for (const side of [-1, 1]) {
        A(ank, prof([[0.35, 0.42], [1.45, 0.08], [2.26, -0.48], [1.4, -0.28], [0.42, 0.12]], 0.76, 0.055), S.main, [side * 0.68, 0.04, 0]);
        A(ank, blk(0.17, 0.12, 1.2, 0.025), S.frame, [side * 1.1, 0.23, 0.78]);
      }
      A(ank, blk(2.6, 0.34, 4.7, 0.08), S.sole, [0, -1.13, 0.35]);
      A(ank, prof([[-2.15, -0.96], [-1.2, -0.96], [-1.2, -0.05], [-1.9, -0.3]], 1.5, 0.1), S.frame);
      A(ank, cyl(0.72, 0.72, 1.9), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const s of [-1, 1]) A(ank, blk(0.28, 1.3, 1.7, 0.08, 0.3), S.second, [s * 1.22, -0.1, -0.15]);
      // 小腿（下寬）
      A(kn, cyl(0.55, 0.62, 3.6), S.frame, [0, -1.8, 0]);
      A(kn, taper(prof([[0.95, 0.12], [1.2, -1.2], [1.5, -2.9], [1.56, -3.78], [-1.62, -3.78], [-1.56, -2.5], [-1.2, -0.9], [-0.85, 0.18]], 2.15, 0.18), 0.82, 1, 1.3, 1), S.main);
      A(kn, prof([[1.25, -0.6], [1.6, -2.85], [1.66, -3.62], [1.3, -3.64], [1.1, -0.8]], 1.2, 0.1), S.second);
      A(kn, blk(0.13, 1.6, 1.5, 0.04), S.second, [sx * 1.33, -2.45, -0.15], [0, 0, sx * 0.13]);
      A(kn, blk(1.9, 1.3, 0.5, 0.1), S.frame, [0, -3.05, -1.62]);
      for (let k = 0; k < 3; k++) A(kn, blk(1.7, 0.1, 0.16, 0.02), S.dark, [0, -2.7 - k * 0.3, -1.9]);
      for (const dx of [-0.45, 0.45]) {
        A(kn, bell(0.34, 0.65), S.dark, [dx, -3.55, -1.72], [0.5, 0, 0]);
        this.nozzles.push({ bone: kn, pos: [dx, -4.15, -2.05], rot: [0.5, 0, 0], r: 0.32, len: 3 });
      }
      A(kn, prof([[0.55, 0.95], [1.45, 0.45], [1.45, -0.75], [0.95, -1.15], [0.45, -0.3]], 1.75, 0.14), S.second);
      A(kn, blade([[-0.72, 0.26], [0.72, 0.26], [0.88, -0.44], [0.54, -0.95], [-0.54, -0.95], [-0.88, -0.44]], 0.18, 0.05), S.main, [0, 0, 1.5]);
      for (const side of [-1, 1]) {
        A(kn, blk(0.14, 1.65, 0.18, 0.035), S.frame, [side * 0.76, -2.1, 1.62], [0, 0, side * 0.08]);
        for (const yy of [-1.4, -2.1, -2.8]) A(kn, bolt(0.085), S.frame, [side * 1.3, yy, 1.13], [Math.PI / 2, 0, 0]);
      }
      A(kn, cyl(0.78, 0.78, 2.0), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      A(kn, cyl(0.16, 0.16, 2.2), S.frame, [-sx * 0.72, -1.25, -1.0], [0.15, 0, 0]);
      // 大腿：蛇腹護套＋前裝甲
      A(hp, cyl(0.62, 0.58, 3.8), S.frame, [0, -2.0, 0]);
      A(hp, ribs(-0.7, -3.3, 7, 0.92, 0.2), S.dark);
      A(hp, prof([[0.7, -0.2], [1.18, -0.9], [1.12, -3.0], [0.75, -3.45], [0.35, -3.3], [0.35, -0.3]], 1.8, 0.1), S.main);
      A(hp, prof([[1.12, -0.9], [1.29, -1.2], [1.2, -2.92], [1.01, -3.2], [0.96, -1.06]], 1.35, 0.065), S.second);
      A(hp, cyl(0.13, 0.13, 2.25, 10), S.frame, [sx * 1.0, -2.0, -0.65], [-0.1, 0, 0]);
      A(hp, sph(0.9), S.frame);
    }
    // 腰
    const pv = b.pelvis;
    A(pv, blk(3.2, 1.3, 2.4, 0.1), S.frame, [0, -0.1, 0]);
    A(pv, taper(blk(4.5, 0.95, 3.3, 0.18, 0.3), 1.0, 1.0, 0.94, 0.95), S.second, [0, 0.55, 0]);
    A(pv, prof([[1.3, 0.2], [1.45, -0.55], [0.85, -1.35], [-0.6, -1.25], [-0.95, 0.2]], 1.35, 0.12), S.second, [0, -0.2, 0]);
    for (const sx of [-1, 1]) {
      A(pv, prof([[0.25, 0.45], [0.6, -2.35], [0.2, -2.5], [-0.1, 0.4]], 2.0, 0.1), S.main, [sx * 1.3, 0.1, 1.45], [0.06, 0, sx * 0.1]);
      A(pv, blk(1.7, 0.22, 0.08, 0.02), S.accent, [sx * 1.38, -1.6, 1.86], [-0.12, 0, sx * 0.1]);
      A(pv, prof([[1.35, 0.5], [1.45, -2.1], [-1.35, -2.1], [-1.45, 0.5]], 0.45, 0.1), S.main, [sx * 2.5, 0, 0], [0, 0, sx * 0.18]);
      A(pv, blk(1.3, 1.0, 1.3, 0.1), S.frame, [sx * 1.9, -0.1, 0]);
    }
    A(pv, prof([[0.2, 0.45], [0.15, -2.0], [-0.4, -1.9], [-0.35, 0.45]], 3.0, 0.1), S.main, [0, 0, -1.55]);
    // 胴體
    const t = b.torso;
    A(t, blk(2.9, 1.6, 2.5, 0.15), S.frame, [0, 0.75, 0]);
    A(t, ribs(0.3, 1.2, 3, 1.35, 0.14), S.dark);
    A(t, taper(blk(5.0, 3.5, 3.9, 0.45, 0.9), 1.06, 1.0, 0.84, 0.92), S.main, [0, 3.15, 0]);
    // 厚胸甲上的左右裝甲與腹部凹槽，避免整片矩形正面。
    A(t, blade([[-0.73, 1.55], [0.73, 1.55], [0.6, 3.02], [0.34, 3.3], [-0.34, 3.3], [-0.6, 3.02]], 0.18, 0.045), S.dark, [0, 0, 2.04]);
    for (let k = 0; k < 4; k++) A(t, blk(0.9, 0.075, 0.12, 0.02), S.frame, [0, 1.8 + k * 0.28, 2.18]);
    for (const sx of [-1, 1]) {
      A(t, blade([[0.45, 3.25], [2.2, 3.22], [2.48, 3.8], [2.06, 4.65], [0.76, 4.52], [0.54, 4.04]].map(([x, y]) => [sx * x, y]), 0.4, 0.09), S.second, [0, 0, 2.15]);
      A(t, blk(1.45, 0.11, 0.12, 0.025), S.frame, [sx * 1.55, 3.43, 2.4], [0, 0, sx * 0.08]);
      for (const x of [0.95, 2.0]) A(t, bolt(0.09), S.frame, [sx * x, 4.35, 2.4], [Math.PI / 2, 0, 0]);
      A(t, blk(0.95, 1.0, 0.3, 0.06), S.dark, [sx * 1.35, 2.15, 1.9]);
      for (let k = 0; k < 4; k++) A(t, blk(0.85, 0.08, 0.12, 0.02), S.frame, [sx * 1.35, 1.8 + k * 0.23, 2.04]);
      A(t, blk(0.45, 2.7, 3.0, 0.12, 0.4), S.second, [sx * 2.62, 2.9, -0.05]);
      A(t, cyl(0.95, 1.0, 0.8), S.frame, [sx * 2.95, 3.95, -0.1], [0, 0, Math.PI / 2]);
      A(t, hose([[sx * 1.6, 3.8, 2.05], [sx * 1.95, 4.8, 2.35], [sx * 1.35, 5.6, 2.1], [sx * 0.6, 5.75, 1.6]], 0.24, 14), S.dark);
      A(t, hose([[sx * 1.6, 0.6, 1.1], [sx * 2.4, 0.9, 0.6], [sx * 2.5, 1.3, -1.1], [sx * 1.6, 1.8, -1.95]], 0.26, 12), S.dark);
    }
    A(t, blk(1.5, 1.35, 0.35, 0.1, 0.2), S.second, [0, 2.45, 1.92], [-0.1, 0, 0]);
    A(t, blk(3.4, 0.8, 2.8, 0.2, 0.4), S.second, [0, 5.0, 0.1]);
    // 背包
    const bk = b.back;
    A(bk, blk(4.0, 3.6, 1.8, 0.25, 0.5), S.second, [0, 3.0, -2.6]);
    A(bk, blk(2.2, 0.6, 0.3, 0.06), S.dark, [0, 4.2, -3.55]);
    for (const sx of [-1, 1]) {
      A(bk, bell(0.8, 1.3), S.dark, [sx * 1.1, 1.3, -3.0], [0.45, 0, 0]);
      A(bk, cyl(0.55, 0.55, 0.25), S.frame, [sx * 1.1, 1.32, -2.95], [0.45, 0, 0]);
      this.addGlow(bk, cyl(0.43, 0.43, 0.06, 14), [0.14, 1.25, 2.3], [sx * 1.1, 0.18, -3.42], [0.45, 0, 0]);
      this.nozzles.push({ bone: bk, pos: [sx * 1.1, 0.05, -3.6], rot: [0.45, 0, 0], r: 0.75, len: 6 });
      A(bk, cyl(0.5, 0.5, 3.0), S.main, [sx * 2.25, 3.1, -2.6]);
      A(bk, sph(0.5), S.main, [sx * 2.25, 4.6, -2.6], [0, 0, 0], [1, 0.5, 1]);
      A(bk, sph(0.5), S.main, [sx * 2.25, 1.6, -2.6], [0, 0, 0], [1, 0.5, 1]);
      A(bk, cyl(0.38, 0.38, 2.35, 12), S.frame, [sx * 2.25, 3.1, -2.6]);
    }
    // 頭：圓頂＋單眼滑軌
    const h = b.head;
    h.scale.setScalar(0.84);
    this.eyeRail = { r: 1.44, y: 1.05, sz: 1.08 };
    const hz = [1, 1, 1.08];
    A(h, cyl(0.55, 0.65, 0.8), S.frame, [0, 0.25, 0]);
    A(h, lathe([[0.001, 2.25], [0.6, 2.2], [1.05, 1.95], [1.3, 1.52], [1.38, 1.02], [1.32, 0.5], [1.1, 0.15], [0.001, 0.05]], 28), S.main, [0, 0, 0], [0, 0, 0], hz);
    A(h, prep(new THREE.CylinderGeometry(1.4, 1.4, 0.46, 28, 1, true, -1.3, 2.6)), S.dark, [0, 1.05, 0], [0, 0, 0], hz);
    A(h, arcRing(1.4, 0.07, 2.7), S.frame, [0, 1.29, 0], [0, 0, 0], hz);
    A(h, arcRing(1.39, 0.07, 2.7), S.frame, [0, 0.81, 0], [0, 0, 0], hz);
    A(h, prof([[1.05, 0.8], [1.45, 0.55], [1.32, 0.1], [0.55, 0.02]], 1.5, 0.08), S.second);
    for (let k = 0; k < 3; k++) A(h, blk(0.9, 0.07, 0.12, 0.02), S.dark, [0, 0.28 + k * 0.14, 1.42], [0.25, 0, 0]);
    for (const sx of [-1, 1]) A(h, cyl(0.3, 0.3, 0.45), S.frame, [sx * 1.3, 0.62, 0.55], [0, 0, Math.PI / 2]);
    for (const sx of [-1, 1]) {
      A(h, hose([[sx * 0.68, 0.25, 1.28], [sx * 0.82, -0.13, 1.22], [sx * 0.86, -0.24, 0.65]], 0.09, 6), S.dark);
      A(h, bolt(0.09), S.frame, [sx * 0.98, 1.78, 0.74], [Math.PI / 2, 0, 0]);
    }
    if (ace) A(h, blade([[0, 0], [0.18, 0.1], [0.05, 2.4], [-0.08, 0.1]], 0.14, 0.02), S.yellow, [0, 1.75, 0.95], [-0.35, 0, 0]);
    this.eye = this.addGlow(h, new THREE.SphereGeometry(0.2, 12, 8), S.eye, [0, 1.05, 1.5]);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: new THREE.Color(...S.eye).multiplyScalar(0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    flare.scale.setScalar(2.4);
    flare.userData.noAO = true;
    this.eye.add(flare);
    // 手臂
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const sh = b['shoulder' + n], el = b['elbow' + n];
      A(sh, sph(0.95), S.frame);
      if (n === 'R') {
        // 右肩：弧形盾
        A(sh, bendPlate(prof(oct(4.0, 4.3, 0.7), 0.42, 0.12), 2.8), S.main, [-1.95, -0.25, 0.1], [0, Math.PI, 0]);
        A(sh, bendPlate(prof(oct(4.3, 4.55, 0.75), 0.3, 0.08), 2.8), S.second, [-1.72, -0.25, 0.1], [0, Math.PI, 0]);
        A(sh, blk(0.8, 1.2, 1.2, 0.1), S.frame, [-1.2, 0, 0]);
      } else {
        // 左肩：尖刺護甲
        A(sh, taper(blk(2.4, 2.5, 3.1, 0.3, 0.9), 0.85, 0.9, 1, 1), S.main, [0.95, 0.35, 0]);
        A(sh, blk(0.25, 1.6, 2.4, 0.06), S.second, [2.18, 0.2, 0]);
        for (const [y, z] of [[1.25, 0.85], [1.35, -0.6], [1.7, 0.12], [0.55, 1.15], [0.6, -1.1]]) {
          const tilt = 0.35 + (y - 0.5) * 0.25;
          A(sh, lathe([[0.001, 1.25], [0.34, 0], [0.38, -0.1], [0.001, -0.12]], 10), S.frame, [1.95, y, z], [0, 0, -(Math.PI / 2 - tilt)]);
        }
      }
      A(sh, cyl(0.55, 0.5, 2.6), S.frame, [0, -1.5, 0]);
      A(sh, ribs(-0.8, -2.4, 4, 0.74, 0.17), S.dark);
      A(el, cyl(0.62, 0.62, 1.4), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      A(el, taper(blk(1.75, 2.9, 1.95, 0.3, 0.55), 0.88, 0.9, 1.08, 1.06), S.main, [0, -1.55, 0]);
      A(el, blk(0.22, 2.1, 1.35, 0.06, 0.25), S.second, [sx * 0.98, -1.55, 0]);
      A(el, cyl(0.45, 0.45, 0.6), S.frame, [0, -3.0, 0]);
      this.buildHand(b['hand' + n], S, sx);
    }
    // 武器
    const W = new THREE.Group();
    if (!heavy) {
      A(W, blk(0.75, 1.0, 3.6, 0.12), S.weapon, [0, 0, 0.4]);
      A(W, blk(0.56, 0.62, 1.6, 0.08), S.weapon, [0, 0.1, 2.9]);
      A(W, cyl(0.2, 0.2, 2.4), S.frame, [0, 0.1, 4.2], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.3, 0.3, 0.6), S.weapon, [0, 0.1, 5.5], [Math.PI / 2, 0, 0]);
      A(W, cyl(1.0, 1.0, 0.6, 24), S.weapon, [-0.7, 0.35, 0.3], [0, 0, Math.PI / 2]);
      A(W, cyl(0.35, 0.35, 0.65), S.frame, [-0.72, 0.35, 0.3], [0, 0, Math.PI / 2]);
      A(W, blk(0.42, 1.2, 0.5, 0.06), S.frame, [0, -0.8, 0], [0.25, 0, 0]);
      A(W, prof([[0, 0.3], [-1.8, 0.2], [-1.9, -0.5], [-0.3, -0.35]], 0.55, 0.08), S.weapon, [0, 0, -1.3]);
      A(W, cyl(0.2, 0.2, 1.0), S.frame, [0, 0.75, 0.6], [Math.PI / 2, 0, 0]);
      this.attachWeapon(W, new THREE.Vector3(0, 0.1, 5.9));
    } else {
      A(W, blk(0.95, 1.25, 6.5, 0.15), S.weapon, [0, 0, 1.6]);
      A(W, cyl(0.45, 0.5, 3.4), S.frame, [0, 0.1, 6.0], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.62, 0.62, 0.7), S.accent, [0, 0.1, 7.7], [Math.PI / 2, 0, 0]);
      A(W, blk(0.42, 1.2, 0.5, 0.06), S.frame, [0, -0.9, 0], [0.25, 0, 0]);
      A(W, blk(0.7, 0.9, 2.2, 0.1), S.second, [0, 0.9, 0.6]);
      this.attachWeapon(W, new THREE.Vector3(0, 0.1, 8.2));
      for (const sx of [-1, 1]) {
        A(t, blk(1.9, 1.7, 2.8, 0.2, 0.3), S.second, [sx * 3.0, 5.25, 0]);
        A(t, blk(1.76, 1.5, 0.12, 0.06), S.frame, [sx * 3.0, 5.25, 1.45]);
        for (let k = 0; k < 6; k++) {
          const x = sx * 3.0 + ((k % 3) - 1) * 0.5, y = 5.25 + ((k / 3) | 0) * 0.6 - 0.3;
          A(t, cyl(0.22, 0.22, 0.13, 10), S.dark, [x, y, 1.55], [Math.PI / 2, 0, 0]);
          A(t, cyl(0.11, 0.11, 0.14, 10), S.accent, [x, y, 1.65], [Math.PI / 2, 0, 0]);
        }
      }
    }
    this.decal(b.shoulderL, makeDecal(ace ? '00' : String(10 + ((Math.random() * 80) | 0)), ace ? 'AGX-9C CMD' : 'AGX-9 HOUND', '#e8e4d8', '#c8202a'),
      [2.32, -0.1, 0], [0, Math.PI / 2, 0], [1.4, 0.7]);
    this.height = 18;
    if (heavy) this.root.scale.setScalar(1.25);
  }

  // 推進器火焰：內焰（白藍、短）＋外焰（藍、長）
  buildFlames() {
    this.flames = [];
    const inner = prep(new THREE.CylinderGeometry(0.55, 0.05, 1, 14, 1, true).translate(0, -0.5, 0).scale(1, 0.45, 1));
    const outer = prep(new THREE.CylinderGeometry(1.0, 0.1, 1, 14, 1, true).translate(0, -0.5, 0));
    for (const [geo, rgb] of [[inner, [0.7, 1.7, 4.0]], [outer, [0.06, 0.22, 1.15]]]) {
      const c = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) c.set(rgb, i);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    const flameGeo = mergeGeometries([inner, outer]);
    const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const nz of this.nozzles) {
      const g = new THREE.Group();
      g.position.set(...nz.pos); g.rotation.set(...nz.rot);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.userData.noAO = true;
      g.add(flame);
      g.scale.set(nz.r, 0.01, nz.r);
      g.visible = false;
      nz.bone.add(g);
      this.flames.push({ g, len: nz.len });
    }
  }

  get scale() { return this.root.scale.x; }

  // 第一人稱：只看得到手臂與武器，其他部位只投影子
  setFirstPerson(on) {
    const keep = new Set(['shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL'].map((n) => this.bones[n]));
    const kept = (o) => keep.has(o.parent) || keep.has(o.parent.parent) || keep.has(o.parent.parent?.parent);
    for (const m of this.meshes) {
      if (!m.userData.origMat) m.userData.origMat = m.material;
      m.material = on && !kept(m) ? MATS.shadowOnly : m.userData.origMat;
    }
    for (const g of this.glows) g.visible = !on || kept(g);
    this.root.traverse((o) => { if (o.userData.decal) o.visible = !on || kept(o); });
  }

  // 動作全部在 anim.js（MechMotion）；st = { vel, grounded, boost, torsoYaw, pitch, thrust, aim(Vector3|null), lean }
  animate(dt, st) { this.motion.update(dt, st); }
  impact(s) { this.motion.impact(s); }

  capsule() {
    const p = this.root.position, k = this.scale;
    return { x: p.x, z: p.z, y0: p.y + 1 * k, y1: p.y + 17 * k, r: 3.2 * k };
  }

  // 拆成碎片（爆炸用）
  shatter() {
    this.root.updateMatrixWorld(true);
    return this.meshes.map((m) => {
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      m.matrixWorld.decompose(pos, q, sc);
      return { mesh: m, pos, q, sc };
    });
  }
}

let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

export { wrap, lerpAngle, damp };
