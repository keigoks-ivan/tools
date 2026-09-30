// 遭遇戰（第 1、2 關）：沿著固定的街道路線推進，每到一個路口就有伏兵從轉角、樓頂、天上殺出來；
//   清完一區補一點 AP，再往下一區走。支路用路障封死（有碰撞），下一個目標點有光柱、HUD 距離、雷達路線
//   路線頂點都在路口（120 m 格線）或空地中央，走在街道中心線上
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { carGeometry } from './env.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const NODE = 120, CAP = 9, HEAL = 0.18;   // CAP＝同時在場最多幾台；HEAL＝每清完一區補多少 AP
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const _t = new THREE.Vector3(), _u = new THREE.Vector3();
// 路口 (i,j)—(i2,j2) 之間那段路的編號（vehicles.js 用同一條公式判斷支路封了沒）
export const edgeKey = (i, j, i2, j2) => (i + i2 + 20) * 100 + (j + j2 + 20);

// 關卡路線、伏兵寫法都搬到 stages.js

export function parse(R, n) {
  const P = R.pts.map(([x, z]) => ({ x, z, s: 0 }));
  for (let i = 1; i < P.length; i++) P[i].s = P[i - 1].s + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
  const end = P[P.length - 1], N = R.secs.length;
  const L = (t) => (t || '').split(' ').filter(Boolean).flatMap((w) => {
    const [a, m] = w.split('*'), [kind, where] = a.split('@');
    return Array.from({ length: +m || 1 }, () => ({ kind, where }));
  });
  const secs = R.secs.map((c, i) => {
    const a = P[c.at - 1], b = P[c.at], d = P[c.at + 1];
    const turn = !!d && Math.abs((b.x - a.x) * (d.z - b.z) - (b.z - a.z) * (d.x - b.x)) > 1;
    return { i, at: c.at, s: b.s, turn, tip: c.tip, last: i === N - 1, trig: i === N - 1 ? R.fin : 58, pre: L(c.pre), waves: [c.amb, c.amb2, c.amb3].filter(Boolean).map(L),
      go: c.go, lines: c.lines, talkClear: c.clear, hold: c.hold, gap: c.gap, boss: c.boss, targets: c.targets };
  });
  // 路線走過的路段、路口（斜線＝走進空地，不算街道）
  const edges = new Set(), nodes = new Map();
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    if (a.x !== b.x && a.z !== b.z) continue;
    const m = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 10);
    for (let k = 0; k <= m; k++) {
      const x = Math.round(a.x + (b.x - a.x) * k / m), z = Math.round(a.z + (b.z - a.z) * k / m), gi = x / NODE, gj = z / NODE;
      if (Number.isInteger(gi) && Number.isInteger(gj)) { if (Math.hypot(x - end.x, z - end.z) > R.arena) nodes.set(gi * 100 + gj, [gi, gj]); }
      else if (Number.isInteger(gj)) { const i0 = Math.floor(gi); edges.add(edgeKey(i0, gj, i0 + 1, gj)); }
      else if (Number.isInteger(gi)) { const j0 = Math.floor(gj); edges.add(edgeKey(gi, j0, gi, j0 + 1)); }
    }
  }
  // 要封的支路：路線經過的路口（終點區除外），不在路線上的那幾條
  const bars = [];
  for (const [gi, gj] of nodes.values()) for (const [di, dj] of DIRS) {
    const k = edgeKey(gi, gj, gi + di, gj + dj);
    if (!edges.has(k) && !bars.some((b) => b.k === k)) bars.push({ k, gi, gj, di, dj });
  }
  return { n, pts: P, len: end.s, secs, cp: R.cp, par: R.par, over: R.over || 1, edges, bars, blocked: new Set(bars.map((b) => b.k)) };
}
// 給 stageWeight 用的「敵機清單」（每區一批）
export const encGroups = (E) => E.secs.map((c) => [...c.pre, ...c.waves.flat()].map((o) => o.kind));

// 路線上第 s 公尺的點與行進方向
export function pointAt(E, s) {
  const P = E.pts;
  s = clamp(s, 0, E.len);
  let i = 1;
  while (i < P.length - 1 && P[i].s < s) i++;
  const a = P[i - 1], b = P[i], L = b.s - a.s || 1, f = (s - a.s) / L;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L, i };
}
// 世界座標投到路線上（只看 s0..s1 這一段，免得從隔壁平行街跳格）：回傳 {s, d}
function project(E, x, z, s0 = 0, s1 = 1e9) {
  const P = E.pts;
  let best = null;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    if (b.s < s0 || a.s > s1) continue;
    const L = b.s - a.s, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    const t = clamp((x - a.x) * ux + (z - a.z) * uz, Math.max(0, s0 - a.s), Math.min(L, s1 - a.s));
    const d = Math.hypot(a.x + ux * t - x, a.z + uz * t - z);
    if (!best || d < best.d) best = { s: a.s + t, d };
  }
  return best;
}

// ================================================================ 路障（貨櫃牆＋拒馬＋燒毀車輛＋紐澤西護欄，有碰撞）
// 支路 44~72 m 處找兩側大樓最窄的地方擋住
const inBox = (w, x, z) => w.nearBoxes(x, z, 2, []).some((b) => b.top > 6 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
function measure(w, bar) {
  const { gi, gj, di, dj } = bar, lx = -dj, lz = di;
  let best = null;
  for (let d = 44; d <= 72; d += 4) {
    const cx = gi * NODE + di * d, cz = gj * NODE + dj * d;
    const side = (sg) => { for (let u = 12; u <= 34; u++) if (inBox(w, cx + lx * u * sg, cz + lz * u * sg)) return u - 0.5; return 32; };
    const L = side(-1), R = side(1), sc = L + R + (L >= 32 ? 20 : 0) + (R >= 32 ? 20 : 0);
    if (!best || sc < best.sc) best = { d, cx, cz, L, R, sc };
  }
  return best;
}
function containerGeometry() {
  // 20 呎貨櫃放大到機體尺度：側板壓出浪板
  const g = new THREE.BoxGeometry(12.2, 2.6, 2.45, 30, 1, 1), p = g.attributes.position, nm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(nm.getZ(i)) < 0.5) continue;
    const k = Math.round((p.getX(i) + 6.1) / 12.2 * 30);
    if (k > 0 && k < 30) p.setZ(i, p.getZ(i) + Math.sign(p.getZ(i)) * (k % 2 ? 0.09 : -0.02));
  }
  g.computeVertexNormals();
  return g;
}
function jerseyGeometry() {
  const s = new THREE.Shape([[-0.42, 0], [0.42, 0], [0.42, 0.12], [0.26, 0.42], [0.14, 1.15], [-0.14, 1.15], [-0.26, 0.42], [-0.42, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 4, bevelEnabled: false });
  g.translate(0, 0, -2); g.rotateY(Math.PI / 2);   // 長邊沿 x
  return g;
}
function hedgehogGeometry() {
  // 拒馬（三根鋼樑互相垂直，一角朝天）
  const bs = [[3.2, 0.26, 0.26], [0.26, 3.2, 0.26], [0.26, 0.26, 3.2]].map(([a, b, c]) => new THREE.BoxGeometry(a, b, c).toNonIndexed());
  const g = mergeGeometries(bs);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0)));
  g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y - 0.15, 0);
  return g;
}
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e8a800'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#141210';
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 32, 64); x.lineTo(i * 32 + 16, 64); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0); x.closePath(); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const CTN = [0x8a3b24, 0x2d4f7c, 0x3f6a3a, 0xb9b8ae, 0xc0621e, 0x6b2430, 0x2f6f6d, 0xc79a1d, 0x4a4f55];
function buildRoute(world, E) {
  const A = world.A, g = new THREE.Group(), boxes = [];
  const L = { ctn: [], jer: [], hog: [], car: [], rub: [], brd: [], la: [], lb: [], tth: [] };
  const o = new THREE.Object3D();
  const put = (list, x, y, z, ry, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, c = null) => {
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz, 'YXZ'); o.scale.set(sx, sy, sz); o.updateMatrix();
    list.push({ m: o.matrix.clone(), c });
  };
  for (const bar of E.bars) {
    const m = measure(world, bar), { di, dj } = bar, lx = -dj, lz = di;
    // u＝橫向（沿路障）、v＝縱向（往支路裡面為正，負的是朝路線那一面）
    const at = (u, v) => [m.cx + lx * u + di * v, m.cz + lz * u + dj * v];
    const ry = Math.atan2(-lz, lx);   // 本地 x→橫向、本地 +z→朝路線
    const gy = world.height(m.cx, m.cz);
    const box = (u0, u1, v0, v1, top) => {
      const [ax, az] = at(u0, v0), [bx, bz] = at(u1, v1);
      const b = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), top: gy + top, on: gy + top };
      world.addCollider(b); boxes.push(b);
    };
    const W = m.L + m.R, uc = (m.R - m.L) / 2, n = Math.max(1, Math.floor((W - 1) / 12.5));
    let tall = 0;
    // 後排：貨櫃疊 2~4 層（靠大樓那兩端疊高）
    for (let k = 0; k < n; k++) {
      const u = uc + (k - (n - 1) / 2) * 12.5, edge = k === 0 || k === n - 1;
      const h = edge ? 3 + (Math.random() < 0.35 ? 1 : 0) : 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let l = 0; l < h; l++) {
        const [x, z] = at(u + rand(-0.4, 0.4), 1.4 + rand(-0.15, 0.15));
        put(L.ctn, x, gy + 1.3 + l * 2.6, z, ry + rand(-0.05, 0.05), 1, 1, 1, 0, 0, new THREE.Color(CTN[(Math.random() * CTN.length) | 0]));
      }
      box(u - 6.2, u + 6.2, 0.1, 2.7, h * 2.6);
      if (h * 2.6 > tall) tall = h * 2.6;
      const top = gy + h * 2.6;
      if (edge) { const [x, z] = at(u + (k === 0 ? -5 : 5), 1.4); put(Math.random() < 0.5 ? L.la : L.lb, x, top + 0.3, z, ry, 0.6, 0.6, 0.6); }
      // 前排：單層貨櫃（歪一點）或燒毀的車；警示條紋板貼在最前面那個貨櫃的正面
      const board = (x, z, r) => { const a = rand(-2.5, 2.5), b = 1.27; put(L.brd, x + a * Math.cos(r) + b * Math.sin(r), gy + 1.35, z - a * Math.sin(r) + b * Math.cos(r), r); };
      const [fx, fz] = at(u + rand(-2, 2), -1.3);
      if (Math.random() < 0.55) {
        const r = ry + rand(-0.12, 0.12);
        put(L.ctn, fx, gy + 1.3, fz, r, 1, 1, 1, 0, 0, new THREE.Color(CTN[(Math.random() * CTN.length) | 0]));
        board(fx, fz, r);
      } else {
        for (let q = 0; q < 2; q++) {
          const [cx, cz] = at(u + (q ? 3 : -3) + rand(-0.8, 0.8), -1.6 + rand(-0.5, 0.5));
          const flip = Math.random() < 0.4;
          put(L.car, cx, gy + (flip ? 1.82 : 0.02), cz, ry + rand(-0.6, 0.6) + (Math.random() < 0.5 ? Math.PI : 0), 1.25, 1.25, 1.25, 0, flip ? Math.PI : 0, new THREE.Color(0.05 + Math.random() * 0.04, 0.036, 0.026));
        }
        board(...at(u, 1.4), ry);
      }
    }
    // 前方：紐澤西護欄、拒馬／龍齒、碎石
    for (let u = -m.L + 3; u < m.R - 2.5; u += 5.5 + rand(0, 1.2)) {
      if (Math.random() < 0.25) continue;
      const [x, z] = at(u, -3.6 + rand(-0.3, 0.3));
      put(L.jer, x, gy, z, ry + rand(-0.1, 0.1), 1.3, 1.3, 1.3);
    }
    if (Math.random() < 0.5) for (let u = -m.L + 3; u < m.R - 2; u += 3.4) { const [x, z] = at(u, -5.4); put(L.tth, x, gy + 1.2, z, ry + Math.PI / 4, 1, 1, 1); }
    else for (let q = 0; q < 3 + (Math.random() * 2 | 0); q++) { const [x, z] = at(rand(-m.L + 3, m.R - 3), -5.2 + rand(-0.6, 0.6)); put(L.hog, x, gy, z, rand(0, 6.28), 1.2, 1.2, 1.2); }
    for (let q = 0; q < 10; q++) {
      const endSide = q < 4, u = endSide ? (q % 2 ? m.R - rand(0, 3) : -m.L + rand(0, 3)) : rand(-m.L, m.R), v = endSide ? rand(-3, 2) : rand(-6.5, -2.6);
      const [x, z] = at(u, v), s = rand(0.5, 1.5);
      put(L.rub, x, gy + s * 0.3, z, rand(0, 6.28), s, s * rand(0.5, 0.9), s, rand(-0.4, 0.4), rand(-0.4, 0.4));
    }
    // 碰撞：前排雜物＋第一層貨櫃（整條）；後排每一疊各自一個（高度照疊幾層）
    box(-m.L - 1, m.R + 1, -6.2, 2.8, 2.9);
    bar.m = m; bar.tall = tall;
  }
  // 材質：貨櫃（烤漆＋鏽斑＋灰塵，用瓦礫貼圖當遮罩）、混凝土、鋼、燒毀車殼、瓦礫、警示條紋、閃爍紅燈
  const ctnMat = new THREE.MeshStandardMaterial({ map: A.rubD, roughness: 0.6, metalness: 0.45 });
  ctnMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCW = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dirt = texture2D(map, vCW.xz / 4.0 + vCW.y * 0.13).g;
        float rust = texture2D(map, vec2(vCW.x + vCW.z, vCW.y) / 7.0).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.1, 0.05), smoothstep(0.5, 0.78, rust) * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.15, 0.13), smoothstep(0.35, 0.75, dirt) * 0.45);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.45, 0.95, smoothstep(0.35, 0.75, max(dirt, rust)));');
  };
  const concMat = new THREE.MeshStandardMaterial({ map: A.rubD, normalMap: A.rubN, roughness: 0.95, color: 0xb0aaa0 });
  const steelMat = new THREE.MeshStandardMaterial({ map: A.rubD, color: 0x4a4540, metalness: 0.6, roughness: 0.55 });
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.25 });
  const rubMat = new THREE.MeshStandardMaterial({ map: A.rubD, normalMap: A.rubN, roughness: 0.95, color: 0x8a8580 });
  const brdMat = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.55 });
  const la = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.45, 0.2) }), lb = la.clone();
  const tooth = new THREE.CylinderGeometry(0.9, 1.6, 2.4, 4);
  const IM = (geo, mat, list, shadow = true) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((q, i) => { im.setMatrixAt(i, q.m); if (q.c) im.setColorAt(i, q.c); });
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    if (!shadow) im.userData.noAO = true;
    g.add(im); return im;
  };
  IM(containerGeometry(), ctnMat, L.ctn); IM(jerseyGeometry(), concMat, L.jer); IM(tooth, concMat, L.tth); IM(hedgehogGeometry(), steelMat, L.hog);
  IM(carGeometry(), carMat, L.car); IM(new THREE.DodecahedronGeometry(1, 0), rubMat, L.rub); IM(new THREE.BoxGeometry(3.6, 1.0, 0.08), brdMat, L.brd);
  const lg = new THREE.BoxGeometry(0.7, 0.5, 0.7);
  IM(lg, la, L.la, false); IM(lg, lb, L.lb, false);
  world.scene.add(g);
  return { group: g, boxes, la, lb };
}
// 換關：只顯示這一關的路障（碰撞也只開這一組）；E＝null 全部收起來
export function setRoute(world, E) {
  const M = world._enc || (world._enc = new Map());
  if (E && !M.has(E)) M.set(E, buildRoute(world, E));
  for (const [k, R] of M) { const on = k === E; R.group.visible = on; for (const b of R.boxes) b.top = on ? b.on : -1e4; }
  world.blocked = E ? E.blocked : null;
  return E ? M.get(E) : null;
}

// ================================================================ 目標光柱、伏兵警示光（每個場景一組，重複使用）
function markers(scene) {
  if (scene.userData.enc) return scene.userData.enc;
  const vs = `varying vec2 vUv; varying vec3 vN, vV;
    void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  const fs = `uniform float t, a, k; varying vec2 vUv; varying vec3 vN, vV;
    void main() {
      float y = vUv.y, f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float band = 0.55 + 0.45 * smoothstep(0.7, 1.0, sin(y * 90.0 - t * 5.0));
      float fade = pow(max(1.0 - y, 0.0), 1.5) * smoothstep(0.0, 0.015, y);
      gl_FragColor = vec4(vec3(0.3, 1.6, 2.1) * (0.15 + f * f * 0.9) * band * fade * a * k, 1.0);
    }`;
  const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, a: { value: 0 }, k: { value: 1 } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const core = mat.clone(); core.uniforms.t = mat.uniforms.t; core.uniforms.a = mat.uniforms.a; core.uniforms.k = { value: 2.6 };
  const root = new THREE.Group();
  const add = (m) => { m.frustumCulled = false; m.userData.noAO = true; m.castShadow = m.receiveShadow = false; root.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 170, 32, 1, true).translate(0, 85, 0), mat));
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 170, 12, 1, true).translate(0, 85, 0), core));
  const bm = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ring = add(new THREE.Mesh(new THREE.RingGeometry(10, 11.2, 64).rotateX(-Math.PI / 2), bm(new THREE.Color(0.5, 2.4, 3))));
  const pulse = add(new THREE.Mesh(new THREE.RingGeometry(10, 10.8, 64).rotateX(-Math.PI / 2), bm(new THREE.Color(0.5, 2.4, 3))));
  const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), bm(new THREE.Color(0.7, 2.8, 3.4))));
  ring.position.y = pulse.position.y = 0.5; gem.scale.set(1, 1.7, 1);
  scene.add(root);
  // 警示光：紅色光暈，伏兵出現前在那個位置閃
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const flares = Array.from({ length: 12 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(4, 0.5, 0.25), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.frustumCulled = false; s.userData.noAO = true; s.visible = false; scene.add(s);
    return { s, t: 0, T: 1 };
  });
  return (scene.userData.enc = { root, mat, ring, pulse, gem, flares, fi: 0, a: 0 });
}

// ================================================================ 遭遇戰流程
export class Encounter {
  constructor(C, E, from = 0) {
    this.C = C; this.E = E; this.N = E.secs.length;
    this.sec = clamp(from, 0, this.N - 1);
    this.state = 'idle'; this.beat = 0; this.beatT = 0; this.clrT = 0; this.t = 0;
    this.prog = this.sec ? E.secs[this.sec - 1].s : 0;   // 沿路線推進了幾公尺（只增不減）
    this.queue = []; this.warn = []; this.mine = []; this.used = new Set();
    this.wp = null; this.ahead = []; this.dist = 0; this.peak = 0;
    this.holdT = 0; this.tg = []; this.bossE = null; this.bossTalk = 0;
    C.stats.healed = C.stats.healed || 0;
  }
  get cur() { return this.E.secs[this.sec]; }
  // 開機時：擺路障、先擺好第一區的遠處戰車，光柱／警示光先畫一次（編好 shader，第一次出現不卡）
  prep() {
    this.R = setRoute(this.C.world, this.E);
    this.B = markers(this.C.scene);
    this.B.root.visible = true; this.B.a = 0;
    this.B.flares[0].s.visible = true;
    this.stock();
    this.fx(0);
  }
  begin() {
    const C = this.C, D = C.def;
    C.say(`STAGE ${C.stage}　${D.name}`, this.sec ? `從檢查點繼續——區域 ${this.sec + 1}/${this.N}` : D.tip, 4, 'cy');
    C.audio.ui('wave');
    this.state = 'move';
    C.lines(this.cur.go);
  }
  // 守點剩幾秒（HUD 用；不是守點區＝null）
  get holdLeft() { const c = this.cur; return c && c.hold && this.state === 'fight' ? Math.max(0, c.hold - this.holdT) : null; }
  tgDone() { return this.tg.every((t) => t.b.st !== 0); }
  alive() { let n = 0; for (const e of this.C.enemies) if (!e.dead) n++; return n; }

  // 每幀（戰鬥階段）：回傳 true＝最後一區也清完了
  update(dt) {
    const C = this.C, E = this.E, p = C.player.pos, c = this.cur;
    if (C.dead || this.state === 'done') return false;
    this.beatT += dt;
    const pr = project(E, p.x, p.z, this.prog - 40, this.prog + 260);
    if (pr && pr.d < 90) this.prog = Math.max(this.prog, pr.s);
    this.updQueue(dt);
    const live = this.alive() + this.queue.length;
    if (live > this.peak) this.peak = live;
    if (this.state === 'move') {
      const V = E.pts[c.at];
      if (this.prog >= c.s - c.trig || Math.hypot(p.x - V.x, p.z - V.z) < c.trig * 0.8) this.ambush(1);
    } else if (this.state === 'fight') {
      let mine = 0; for (const e of this.mine) if (!e.dead) mine++;
      // 守點：時間內 amb、amb2、amb3 輪流來；時間到才停
      const holding = c.hold && this.holdT < c.hold;
      if (c.hold) { const was = this.holdT < c.hold; this.holdT += dt; if (was && this.holdT >= c.hold) C.note('守住了　清掉剩下的', 'gr'); }
      if (holding) { if (!this.queue.length && (mine <= E.over || this.beatT > (c.gap || 18))) this.ambush(this.beat % c.waves.length + 1, true); }
      else if (!c.hold && this.beat < c.waves.length) { if (!this.queue.length && (mine <= E.over || this.beatT > 28)) this.ambush(this.beat + 1); }
      else if (!this.queue.length && this.cleared(c) && this.tgDone()) { this.clrT += dt; if (this.clrT > 0.7) return this.clear(c); }
      else this.clrT = 0;
    }
    // 頭目：剩一半、剩兩成半各講一次；倒下（或撤退）時講 down，還沒出來的護衛不再來
    const B = this.bossE, bd = c && c.boss;
    if (B && bd && B.dead && !this.bossOver) {
      this.bossOver = true;
      if (!B.fled) C.lines(bd.down, true);
      this.queue = this.queue.filter((q) => q.at);   // 已經亮警示的照樣出來，其他取消
      this.beat = Math.max(this.beat, c.waves.length);
    }
    if (B && bd && !B.dead) {
      const r = B.ap / B.apMax;
      if (this.bossTalk < 1 && r < 0.5) { this.bossTalk = 1; C.lines(bd.half, true); }
      if (this.bossTalk < 2 && r < 0.25) { this.bossTalk = 2; C.lines(bd.low, true); }
    }
    // 目標大樓倒了：提示一次
    for (const t of this.tg) if (!t.told && t.b.st !== 0) { t.told = true; C.note(`${t.name || '目標'} 摧毀　${this.tg.filter((o) => o.b.st !== 0).length}/${this.tg.length}`, 'am'); C.audio.ui('confirm'); }
    return false;
  }
  cleared(c) {
    const C = this.C;
    let mech = 0, veh = 0;
    for (const e of C.enemies) if (!e.dead) e.vehicle ? veh++ : mech++;
    return c.last ? C.enemies.length === 0 && !C.events.some((ev) => ev.spawn) : mech === 0 && veh <= 1;
  }
  // 伏擊：先亮警示、1 秒後才出現；同時在場有上限，多的排隊
  ambush(b, again = false) {   // again＝守點時輪回第一波（不重新開場）
    const C = this.C, c = this.cur, L = c.waves[b - 1];
    this.state = 'fight'; this.beat = b; this.beatT = 0; this.clrT = 0;
    if (b === 1 && !again) {
      for (const v of this.mine) if (v.pre && !v.dead) v.hold = rand(0.2, 1.2);   // 停著的戰車開始動
      C.say(c.boss ? c.boss.name : c.hold ? 'HOLD THE LINE' : c.last ? 'FINAL AREA' : 'CONTACT', c.tip || (c.hold ? `守住 ${c.hold} 秒` : `伏兵 ×${L.length}`), 2.6, c.boss || c.last ? 'am' : 'rd');
      C.lines(c.lines, true);   // 開打的喊話：插隊
      this.holdT = 0; this.bossTalk = 0; this.bossOver = false;
      if (c.boss) this.queue.push({ kind: c.boss.kind || 'ace', where: c.boss.where || 'drop', k: 0, t: 1.1, at: null, boss: true });
    } else C.say('REINFORCEMENTS', `敵方增援 ×${L.length}`, 2.4, 'am');
    C.audio.ui('wave');
    const cnt = {};
    L.forEach((o, i) => { cnt[o.where] = (cnt[o.where] ?? -1) + 1; this.queue.push({ kind: o.kind, where: o.where, k: cnt[o.where], t: 1.1 + i * 0.35, at: null }); });
  }
  updQueue(dt) {
    const C = this.C;
    let live = this.alive(), armed = 0;
    for (const q of this.queue) if (q.at) armed++;
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      q.t -= dt;
      if (!q.at) {
        if (q.t <= 1.1 && live + armed < CAP) { q.at = this.place(q); q.t = 1.1; armed++; if (q.kind !== 'jet') this.flare(q.at, 1.1); }   // 戰機從遠方掠過，不在街上亮警示
        continue;
      }
      if (q.t > 0) continue;
      this.queue.splice(i--, 1); armed--; live++;
      const e = C.spawn(q.kind, 0, 1, q.at);
      if (q.boss) {   // 頭目：血量加倍、上方顯示名字與血條；可以設定剩幾成撤退
        const bd = this.cur.boss;
        e.ap = e.apMax = Math.round(e.apMax * (bd.ap || 2)); e.bossName = bd.name; e.fleeAt = bd.flee || 0;
        e.onFlee = () => C.lines(bd.fled, true);
        this.bossE = C.boss = e;
      }
      if (e.kind === 'tank') e.pref = rand(70, 130);   // 伏兵戰車要逼近到轉角看得到你，不在 200 m 外繞圈
      this.mine.push(e);
      if (q.at.ground || e.vehicle) C.fx.dust(_t.set(q.at.x, C.world.height(q.at.x, q.at.z), q.at.z), e.vehicle ? 1.6 : 2.4);
    }
  }
  // 這一區先擺好的遠處目標（停著不動、會開砲）
  stock() {
    const c = this.cur;
    if (!c) return;
    // 這一區要打爛的大樓：找 (x,z) 附近 40 m 內、還立著的最近一棟
    this.tg = (c.targets || []).map((t) => ({ ...t, b: this.findBld(t.x, t.z) })).filter((t) => t.b);
    const cnt = {};
    for (const o of c.pre) {
      cnt[o.where] = (cnt[o.where] ?? -1) + 1;
      const v = this.C.spawn(o.kind, 0, 1, this.place({ kind: o.kind, where: o.where, k: cnt[o.where] }));
      v.hold = 1e4; v.pre = true; v.pref = rand(90, 150);
      this.mine.push(v);
    }
  }
  findBld(x, z) {
    let best = null, bd = 40;
    for (const bx of this.C.world.nearBoxes(x, z, 60, [])) {
      const b = bx.bld;
      if (!b || b.st !== 0 || bx !== b.box) continue;
      const d = Math.hypot(b.cx - x, b.cz - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  clear(c) {
    const C = this.C, pl = C.player, E = this.E;
    this.mine = []; this.used.clear(); this.warn.length = 0;
    this.bossE = null; if (C.boss && C.boss.dead) C.boss = null;
    C.lines(c.talkClear);
    if (c.last) { this.state = 'done'; return true; }
    C.say('AREA CLEAR', `區域 ${c.i + 1}/${this.N} 壓制完成`, 2.4, 'gr');
    C.audio.ui('confirm');
    // 補給：AP、機體部位、彈匣
    const add = Math.floor(Math.min(pl.apMax - pl.ap, pl.apMax * HEAL));
    if (add > 0) { pl.ap = Math.min(pl.apMax, pl.ap + add); C.stats.healed += add; }
    for (const k in C.parts) C.parts[k] = Math.min(1, C.parts[k] + 0.25);
    C.rifle.ammo = C.rifle.mag; C.rifle.reload = -1;
    C.note(add > 0 ? `補給　AP +${add}` : '補給完成', 'gr');
    this.sec++; this.state = 'move'; this.beat = 0;
    if ([].concat(E.cp).includes(this.sec)) {
      const q = pointAt(E, c.s + 5);
      C.cp = { sec: this.sec, x: q.x, z: q.z, yaw: Math.atan2(q.dx, q.dz), stats: JSON.parse(JSON.stringify(C.stats)), used: 0 };
      C.events.push({ t: 0.9, fn: () => C.note('CHECKPOINT　檢查點', 'am') });
    }
    C.events.push({ t: 1.8, fn: () => C.note('前進 ▶', 'cy') });
    this.stock();
    C.lines(this.cur.go);
    return false;
  }

  // ---------------------------------------------------------------- 伏兵出現位置
  place(q) {
    const c = this.cur, V = this.E.pts[c.at];
    const late = this.prog > c.s + 20;   // 已經衝過路口：一律從前方出現，不從背後
    let wh = q.where;
    if (late && (wh === 'side' || wh === 'far')) wh = 'out';
    const base = late ? this.prog + 120 : c.s;
    const F = { far: this.pFar, out: this.pOut, side: this.pSide, drop: this.pDrop, roof: this.pRoof, rise: this.pRise, ring: this.pRing }[wh] || this.pDrop;
    let at = F.call(this, q, base, V);
    if (!at && q.kind === 'tank') at = this.pRing(q, base, V) || this.pOut(q, Math.min(base, this.E.len - 120), V, true);
    if (!at && q.kind === 'heli') at = this.pRise(q, base, V, true);
    return at || this.pDrop(q, base, V);
  }
  pFar(q) {
    const c = this.cur, pt = pointAt(this.E, c.turn ? c.s - 22 - q.k * 20 : c.s + 50 + q.k * 20);
    return { x: pt.x, z: pt.z, tx: pt.x - pt.dx * 60, tz: pt.z - pt.dz * 60 };
  }
  pOut(q, base, V, force = false) {
    const s = base + 80 + q.k * 30 + rand(0, 40);
    if (s > this.E.len - 10 && !force) return null;
    const pt = pointAt(this.E, s);
    return { x: pt.x, z: pt.z, tx: pt.x - pt.dx * 60, tz: pt.z - pt.dz * 60 };
  }
  pSide(q, base, V) {
    const p = this.C.player.pos, gi = Math.round(V.x / NODE), gj = Math.round(V.z / NODE);
    if (Math.abs(V.x - gi * NODE) > 1 || Math.abs(V.z - gj * NODE) > 1 || Math.hypot(p.x - V.x, p.z - V.z) < 40) return null;
    const bs = [];
    for (const b of this.E.bars) {
      if (b.gi === gi && b.gj === gj) bs.push([b.di, b.dj]);
      else if (b.gi + b.di === gi && b.gj + b.dj === gj) bs.push([-b.di, -b.dj]);
    }
    if (!bs.length) return null;
    const [di, dj] = bs[q.k % bs.length], d = 30 + Math.floor(q.k / bs.length) * 13;
    const x = V.x + di * d + (q.kind === 'tank' ? 0 : rand(-4, 4) * dj), z = V.z + dj * d + (q.kind === 'tank' ? 0 : rand(-4, 4) * di);
    return { x, z, y: this.C.world.height(x, z), tx: V.x, tz: V.z, ground: true };
  }
  pDrop(q, base, V) {
    const E = this.E, w = this.C.world, p = this.C.player.pos, last = this.cur.last;
    for (let i = 0; i < 24; i++) {
      let x, z;
      if (last) { const a = rand(0, 6.283), r = rand(40, 130); x = V.x + Math.sin(a) * r; z = V.z + Math.cos(a) * r; }
      else { const pt = pointAt(E, Math.min(base + rand(50, 150), E.len - 5)), l = rand(-9, 9); x = pt.x + pt.dz * l; z = pt.z - pt.dx * l; }
      if (Math.hypot(x - p.x, z - p.z) < 50) continue;
      const h = w.height(x, z);
      if (w.support(x, z, 5, 1e4) > h + 0.5 || w.collide(_t.set(x, h, z), 5, h)) continue;
      return { x, z, y: h };
    }
    const pt = pointAt(E, Math.min(base + 90, E.len));
    return { x: pt.x, z: pt.z, y: w.height(pt.x, pt.z) };
  }
  pRoof(q, base) {
    const E = this.E, w = this.C.world, p = this.C.player.pos, list = [];
    for (const b of w.blds || []) {
      const B = b.box;
      if (b.st !== 0 || this.used.has(B) || B.x1 - B.x0 < 14 || B.z1 - B.z0 < 14 || B.top < 14 || B.top > 66) continue;
      const pr = project(E, (B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2, base + 20, base + 170);
      if (!pr || pr.d > 90) continue;
      const pt = pointAt(E, pr.s);
      const x = clamp(pt.x, B.x0 + 7, B.x1 - 7), z = clamp(pt.z, B.z0 + 7, B.z1 - 7);
      if (Math.hypot(x - p.x, z - p.z) < 60) continue;
      list.push({ x, z, y: w.support(x, z, 3.4, 1e4), B });
    }
    if (!list.length) return null;
    list.sort(() => Math.random() - 0.5);
    // 優先挑看得到玩家的樓頂
    const pc = _u.set(p.x, p.y + 12, p.z);
    const o = list.find((o) => w.raycast(_t.set(o.x, o.y + 12, o.z), pc, null) < 0) || list[0];
    this.used.add(o.B);
    return { x: o.x, z: o.z, y: o.y, roof: true };
  }
  pRise(q, base, V, force = false) {
    const E = this.E, w = this.C.world, P = this.C.player, p = P.pos;
    const free = (x, z) => Math.abs(x) < 700 && Math.abs(z) < 700 && w.support(x, z, 8, 1e4) <= w.height(x, z) + 1;
    if (!this.cur.last && !force) for (let i = 0; i < 16; i++) {
      // 平行的隔壁街（120 m 外），從那排大樓後面升起
      const pt = pointAt(E, Math.min(base + rand(40, 130), E.len)), sg = Math.random() < 0.5 ? -1 : 1;
      const x = pt.x + pt.dz * NODE * sg, z = pt.z - pt.dx * NODE * sg;
      if (free(x, z)) return { x, z, y: w.height(x, z) + 10 };
    }
    for (let i = 0; i < 40; i++) {
      const a = P.yaw + (i < 20 ? rand(-1.3, 1.3) : rand(-3.1, 3.1)), r = rand(150, 260);
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      if (free(x, z)) return { x, z, y: w.height(x, z) + 10 };
    }
    return { x: clamp(p.x + 200, -700, 700), z: p.z, y: w.height(p.x, p.z) + 90 };
  }
  pRing(q, base, V) {
    const E = this.E, P = this.C.player, p = P.pos;
    for (let i = 0; i < 80; i++) {
      const gi = ((Math.random() * 11) | 0) - 5, gj = ((Math.random() * 11) | 0) - 5, ax = Math.random() < 0.5;
      const i2 = ax ? gi + 1 : gi, j2 = ax ? gj : gj + 1;
      if (i2 > 5 || j2 > 5 || E.blocked.has(edgeKey(gi, gj, i2, j2))) continue;
      const x = (gi + i2) * NODE / 2, z = (gj + j2) * NODE / 2, dv = Math.hypot(x - V.x, z - V.z), dp = Math.hypot(x - p.x, z - p.z);
      if (dv < 100 || dv > 260 || dp < 110) continue;
      if (i < 50 && Math.abs(wrap(Math.atan2(x - p.x, z - p.z) - P.yaw)) > 1.7) continue;   // 先挑你前方的
      return { x, z, tx: V.x, tz: V.z };
    }
    return null;
  }
  // 戰車太久看不到你、要換位置時：擺到你前方的路線上
  tankSpot() {
    const E = this.E, c = this.cur;
    if (!c || c.last) return this.pRing({}, 0, E.pts[E.pts.length - 1]);
    const s = this.prog + rand(150, 260);
    if (s > E.len - 10) return null;
    const pt = pointAt(E, s);
    return { x: pt.x, z: pt.z, tx: pt.x - pt.dx * 60, tz: pt.z - pt.dz * 60 };
  }

  // ---------------------------------------------------------------- 光柱、警示光、雷達路線（每幀）
  flare(at, T) {
    const B = this.B, w = this.C.world;
    const y = at.roof ? at.y + 6 : at.ground || at.tx !== undefined ? w.height(at.x, at.z) + 6 : at.y > w.height(at.x, at.z) + 5 ? at.y : w.height(at.x, at.z) + 6;
    this.warn.push({ x: at.x, y, z: at.z, t: T + 0.9 });
    if (!B) return;
    const f = B.flares[B.fi++ % B.flares.length];
    f.s.position.set(at.x, y, at.z); f.t = T + 0.6; f.T = T + 0.6; f.s.visible = true;
  }
  fx(dt) {
    const C = this.C, E = this.E, B = this.B, c = this.cur, w = C.world;
    this.t += dt;
    for (const o of this.warn) o.t -= dt;
    if (this.warn.length && this.warn[0].t <= 0) this.warn = this.warn.filter((o) => o.t > 0);
    // 目標點：前方下一個頂點（不超過這一區的錨點）
    let wp = null;
    if (c) {
      for (let i = 1; i <= c.at; i++) if (E.pts[i].s > this.prog + 15) { wp = E.pts[i]; break; }
      wp = wp || E.pts[c.at];
    }
    const move = this.state === 'move' || this.state === 'idle';
    this.wp = move && wp ? { x: wp.x, y: w.height(wp.x, wp.z) + 38, z: wp.z } : null;
    this.dist = c ? Math.max(0, c.s - this.prog) : 0;
    const A = this.ahead; A.length = 0;
    if (c && this.state !== 'done') { const q = pointAt(E, this.prog); A.push(q.x, q.z); for (const P of E.pts) if (P.s > this.prog + 1) A.push(P.x, P.z); }
    if (this.R) { const on = Math.sin(this.t * 5) > 0; this.R.la.color.setRGB(on ? 6 : 0.3, on ? 0.45 : 0.02, on ? 0.2 : 0.01); this.R.lb.color.setRGB(on ? 0.3 : 6, on ? 0.02 : 0.45, on ? 0.01 : 0.2); }
    if (!B) return;
    B.a += ((this.wp ? 1 : 0) - B.a) * (1 - Math.exp(-dt * 3));
    if (wp) B.root.position.set(wp.x, w.height(wp.x, wp.z), wp.z);
    const T = this.t;
    B.mat.uniforms.t.value = T; B.mat.uniforms.a.value = B.a;
    B.ring.material.opacity = 0.8 * B.a;
    const ph = (T * 0.6) % 1;
    B.pulse.scale.setScalar(1 + ph * 2.2); B.pulse.material.opacity = B.a * (1 - ph) * 0.9;
    B.gem.material.opacity = B.a; B.gem.rotation.y = T * 1.6; B.gem.position.y = 38 + Math.sin(T * 2) * 1.5;
    for (const f of B.flares) {
      if (f.t <= 0) { if (f !== B.flares[0] || this.state !== 'idle') f.s.visible = false; continue; }
      f.t -= dt;
      const k = 1 - f.t / f.T, blink = 0.6 + 0.4 * Math.sin(k * 40);
      f.s.material.opacity = Math.min(1, f.t / 0.3) * blink;
      f.s.scale.setScalar(9 + 7 * k);
    }
  }
  dispose() {
    const B = this.B;
    this.queue.length = 0; this.warn.length = 0;
    if (!B) return;
    B.a = 0; B.root.visible = false;
    for (const f of B.flares) { f.t = 0; f.s.visible = false; }
  }
}
