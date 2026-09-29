// 道具的形狀（回傳 {材質名: 幾何}，由 Builder.mesh 合併進地圖）：燒毀轎車、油桶、飛彈架、機庫吊車、工具車、體積光錐
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// ---------------------------------------------------------------- 燒毀的轎車（長 4.6 m，面向 +Z）
// 車身輪廓帶輪拱；車窗燒空（深色）；輪框、底盤
export function car(variant = 0) {
  const key = 'car' + variant;
  if (cache[key]) return cache[key];
  const arch = (cz, r = 0.42, n = 10) => { const pts = []; for (let i = 0; i <= n; i++) { const a = Math.PI - (i / n) * Math.PI; pts.push([cz + Math.cos(a) * r, 0.28 + Math.sin(a) * r * 0.95]); } return pts; };
  const low = [[-2.3, 0.3], ...arch(-1.4), [-0.9, 0.28], [0.9, 0.28], ...arch(1.4), [2.3, 0.3], [2.33, 0.62], [2.22, 0.9], [1.25, 0.98], [-1.35, 1.0], [-2.2, 0.93], [-2.34, 0.72]];
  const body = prism(low.map(([z, y]) => [z, y]).reverse(), 1.78, 0.06);
  const greenhouse = prism([[1.2, 0.97], [0.62, 1.4], [-0.72, 1.42], [-1.3, 0.99]], 1.56, 0.04);
  const roof = prism([[0.58, 1.38], [0.62, 1.44], [-0.74, 1.46], [-0.72, 1.4]], 1.62, 0.02);
  const pillars = [];
  for (const s of [-1, 1]) {
    pillars.push(new THREE.BoxGeometry(0.07, 0.5, 0.08).rotateX(-0.62).translate(s * 0.76, 1.19, 0.92));
    pillars.push(new THREE.BoxGeometry(0.07, 0.46, 0.1).translate(s * 0.78, 1.2, -0.05));
    pillars.push(new THREE.BoxGeometry(0.07, 0.5, 0.1).rotateX(0.7).translate(s * 0.77, 1.2, -1.02));
  }
  const wheels = [], rims = [];
  for (const [x, z] of [[0.78, 1.4], [-0.78, 1.4], [0.78, -1.4], [-0.78, -1.4]]) {
    wheels.push(cyl(0.34, 0.22, 18).rotateZ(Math.PI / 2).translate(x, 0.34, z));
    rims.push(cyl(0.2, 0.235, 12).rotateZ(Math.PI / 2).translate(x, 0.34, z));
  }
  const under = new THREE.BoxGeometry(1.6, 0.18, 4.2).translate(0, 0.25, 0);
  const bumpers = [new THREE.BoxGeometry(1.82, 0.16, 0.14).translate(0, 0.45, 2.3), new THREE.BoxGeometry(1.82, 0.16, 0.14).translate(0, 0.45, -2.32)];
  const out = {
    body: merge([body, roof, ...pillars]),
    dark: merge([greenhouse, ...wheels, under, ...bumpers]),
    metal: merge(rims),
  };
  return (cache[key] = out);
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
  return (cache.rack = { metal: merge(frame), body: merge(mis), dark: merge(tips) });
}

// ---------------------------------------------------------------- 機庫天車（橫跨寬度的兩根大樑＋吊車）
export function crane(span) {
  const beams = [new THREE.BoxGeometry(span, 0.9, 0.5).translate(0, 0, -1), new THREE.BoxGeometry(span, 0.9, 0.5).translate(0, 0, 1)];
  const ties = []; for (let x = -span / 2 + 1; x < span / 2; x += 2.5) ties.push(new THREE.BoxGeometry(0.12, 0.12, 2).translate(x, -0.4, 0));
  const trolley = new THREE.BoxGeometry(2.4, 1.2, 2.6).translate(4, -0.9, 0);
  const cables = [-0.3, 0.3].map((z) => cyl(0.025, 9, 6).translate(4, -6, z));
  const hook = [new THREE.BoxGeometry(0.9, 0.5, 0.6).translate(4, -10.6, 0), new THREE.TorusGeometry(0.25, 0.07, 6, 12, Math.PI * 1.4).translate(4, -11.1, 0)];
  return { hazard: merge(beams), metal: merge([...ties, ...cables, ...hook]), dark: merge([trolley]) };
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

// ---------------------------------------------------------------- 積水（深色、光滑，反射天空）
export function puddleMat() {
  if (cache.pm) return cache.pm;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return (cache.pm = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.03, metalness: 0.0, alphaMap: t, transparent: true, depthWrite: false, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -2 }));
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
      const ng = g.toNonIndexed(); ng.computeVertexNormals();   // 平面著色：斷面清楚
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
