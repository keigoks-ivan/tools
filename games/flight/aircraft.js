import { createAviationSurfaceKit, roundedCabinPart, sceneEnvironmentBinding } from './aviation-materials.js?v=20261005';

// MQ-320 civil twinjet (fictional A320neo / 737 MAX class) and its two-crew glass cockpit, built procedurally.
// All dimensions are metres. The aircraft's nose points along local -Z, +X is the right wing, +Y is up.
// Gear contact points: main wheels (±3.22 ± 0.3, -4.0, 2.75), nose wheels (±0.195, -4.0, -13.56); profiles.mjs gearHeight 4.
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const isBrowser = typeof document !== 'undefined';

// Monotone cubic (Fritsch-Carlson) through [[x, y], ...], x ascending.
function monotone(points) {
  const n = points.length, xs = points.map(p => p[0]), ys = points.map(p => p[1]), d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---- Geometry kit shared by the exterior and the cockpit ----
function geometryKit(THREE) {
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  function build(positions, normals, uvs, indices, colors) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs || new Array(positions.length / 3 * 2).fill(0), 2));
    if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    if (indices) g.setIndex(indices);
    if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); else g.computeVertexNormals();
    return g;
  }
  // Grid surface from rows of points (equal length). Normals from central differences, so closed loops and
  // lofts stay smooth across seams. orient: 'centroid' flips the whole surface so normals point away from each
  // row's centroid (closed lofts); a number forces the sign; tipNormals fills degenerate rows.
  function grid(rows, { closed = false, uv = null, orient = 'centroid', flip = false } = {}) {
    const R = rows.length, C = rows[0].length, cols = closed ? C + 1 : C;
    const positions = [], normals = [], uvs = [], indices = [];
    const a = v3(), b = v3(), n = v3(), centroid = v3();
    const normalAt = (i, j) => {
      const jp = closed ? (j + 1) % C : Math.min(C - 1, j + 1), jm = closed ? (j - 1 + C) % C : Math.max(0, j - 1);
      const ip = Math.min(R - 1, i + 1), im = Math.max(0, i - 1);
      a.subVectors(rows[i][jp], rows[i][jm]); b.subVectors(rows[ip][j], rows[im][j]);
      return n.crossVectors(b, a);
    };
    const raw = [];
    let sign = 0;
    for (let i = 0; i < R; i++) {
      centroid.set(0, 0, 0); for (const p of rows[i]) centroid.add(p); centroid.multiplyScalar(1 / C);
      raw.push([]);
      for (let j = 0; j < C; j++) {
        const nn = normalAt(i, j).clone(); raw[i].push(nn);
        if (orient === 'centroid' && nn.lengthSq() > 1e-14) sign += nn.clone().normalize().dot(a.subVectors(rows[i][j], centroid));
      }
    }
    let s = orient === 'centroid' ? (sign < 0 ? -1 : 1) : (typeof orient === 'number' ? orient : 1);
    if (flip) s = -s;
    // degenerate normals (collapsed rows such as a nose tip) borrow the neighbour row's average direction
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      if (raw[i][j].lengthSq() < 1e-14) {
        const k = i === 0 ? 1 : i === R - 1 ? R - 2 : i; const avg = v3();
        for (const q of raw[k]) avg.add(q.clone().normalize());
        raw[i][j].copy(avg.lengthSq() > 1e-10 ? avg : v3(0, 1, 0));
      }
      raw[i][j].normalize().multiplyScalar(s);
    }
    for (let i = 0; i < R; i++) for (let jj = 0; jj < cols; jj++) {
      const j = jj % C, p = rows[i][j], nn = raw[i][j];
      positions.push(p.x, p.y, p.z); normals.push(nn.x, nn.y, nn.z);
      const t = uv ? uv(i, jj, p) : [i / (R - 1), jj / (cols - 1)]; uvs.push(t[0], t[1]);
    }
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const p0 = i * cols + j, p1 = p0 + 1, p2 = p0 + cols, p3 = p2 + 1;
      if (s > 0) indices.push(p0, p2, p1, p1, p2, p3); else indices.push(p0, p1, p2, p1, p3, p2);
    }
    // the winding has to agree with the normals; check one quad and swap if needed
    const g = build(positions, normals, uvs, indices);
    fixWinding(g);
    return g;
  }
  function fixWinding(g) {
    const pos = g.attributes.position, nor = g.attributes.normal, idx = g.index.array;
    let agree = 0;
    const pa = v3(), pb = v3(), pc = v3(), fn = v3(), nn = v3();
    for (let k = 0; k < idx.length; k += 3) {
      pa.fromBufferAttribute(pos, idx[k]); pb.fromBufferAttribute(pos, idx[k + 1]); pc.fromBufferAttribute(pos, idx[k + 2]);
      fn.crossVectors(pb.sub(pa), pc.sub(pa)); if (fn.lengthSq() < 1e-16) continue;
      nn.fromBufferAttribute(nor, idx[k]).add(v3().fromBufferAttribute(nor, idx[k + 1])).add(v3().fromBufferAttribute(nor, idx[k + 2]));
      agree += Math.sign(fn.dot(nn));
    }
    if (agree < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.index.needsUpdate = true;
    return g;
  }
  // Lathe around the z axis: profile [[z, r], ...]; segments around. Returns a grid whose rows follow the profile.
  function lathe(profile, segments, { orient = 1, uv = null, ellipse = 1, cx = 0, cy = 0 } = {}) {
    const rows = profile.map(([z, r]) => {
      const row = [];
      for (let j = 0; j < segments; j++) { const a = j / segments * TAU; row.push(v3(cx + Math.cos(a) * r, cy + Math.sin(a) * r * ellipse, z)); }
      return row;
    });
    const g = grid(rows, { closed: true, orient: 'none', uv: uv || ((i, j) => [i / (profile.length - 1), j / segments]) });
    // decide orientation: the normal at the widest profile point must point away from the axis (orient = 1) or toward it
    let best = 0; profile.forEach(([, r], i) => { if (r > profile[best][1]) best = i; });
    const nr = g.attributes.normal, k = best * (segments + 1);
    const radial = nr.getX(k) * Math.cos(0) + nr.getY(k) * Math.sin(0);
    if (Math.sign(radial || 1) !== Math.sign(orient)) flipGeometry(g);
    return g;
  }
  function flipGeometry(g) {
    const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
    const idx = g.index.array; for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    nr.needsUpdate = true; g.index.needsUpdate = true; return g;
  }
  // Fill a planar polygon given as a strip of point pairs (top[i], bottom[i]) -> quads between consecutive pairs.
  function strip(top, bottom, normal, uvFn = null) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let i = 0; i < top.length; i++) {
      for (const p of [top[i], bottom[i]]) { positions.push(p.x, p.y, p.z); normals.push(normal.x, normal.y, normal.z); const t = uvFn ? uvFn(p) : [0, 0]; uvs.push(t[0], t[1]); }
      if (i < top.length - 1) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
    }
    return fixWinding(build(positions, normals, uvs, indices));
  }
  function merge(list) {
    const positions = [], normals = [], uvs = [], indices = [], colors = [];
    let offset = 0; const withColor = list.length && list.every(g => g.attributes.color);
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i));
        uvs.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); if (withColor) colors.push(c.getX(i), c.getY(i), c.getZ(i));
      }
      if (g.index) for (const k of g.index.array) indices.push(k + offset); else for (let i = 0; i < p.count; i++) indices.push(i + offset);
      offset += p.count; g.dispose();
    }
    return build(positions, normals, uvs, indices, withColor ? colors : null);
  }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = v3(0, 1, 0);
  // place a geometry (already built around its own origin) with position / quaternion / scale
  function placed(g, position, quaternion = null, scale = null) {
    m4.compose(position, quaternion || qt.identity(), scale || v3(1, 1, 1)); g.applyMatrix4(m4); return g;
  }
  // cylinder (or cone) between two points
  function rod(a, b, r0, r1 = r0, seg = 10, open = false) {
    const A = a.isVector3 ? a : v3(...a), B = b.isVector3 ? b : v3(...b), d = B.clone().sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
    const q = new THREE.Quaternion().setFromUnitVectors(up, d.normalize());
    return placed(g, A.clone().add(B).multiplyScalar(0.5), q);
  }
  function box(cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    return placed(g, v3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)));
  }
  function setUV(g, u, v) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v); return g; }
  function colorize(g, color) {
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
  }
  // flip a surface so that sum(fn(point, normal)) is positive
  function orientBy(g, fn) {
    const p = g.attributes.position, n = g.attributes.normal, a = v3(), b = v3(); let s = 0;
    for (let i = 0; i < p.count; i++) s += fn(a.fromBufferAttribute(p, i), b.fromBufferAttribute(n, i));
    if (s < 0) flipGeometry(g); return g;
  }
  return { v3, build, grid, lathe, strip, merge, placed, rod, box, setUV, flipGeometry, fixWinding, colorize, orientBy };
}

function canvas2d(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

// A small equirectangular sky (the game's zenith/horizon colours, sun glow, hazy ground) used as a per-material
// environment map. The renderer turns it into a PMREM on first use; scene.environment is never touched.
function skyEnvironment(THREE, { interior = false } = {}) {
  if (!isBrowser) return null;
  const W = 256, H = 128, [canvas, g] = canvas2d(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, interior ? '#6d8fb0' : '#3f7db2'); sky.addColorStop(0.7, interior ? '#b9cfdc' : '#9cc3dc'); sky.addColorStop(1, '#dbe8ee');
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  const ground = g.createLinearGradient(0, H / 2, 0, H);
  ground.addColorStop(0, '#b4bcb4'); ground.addColorStop(0.08, '#8a9177'); ground.addColorStop(1, interior ? '#2e3236' : '#525c45');
  g.fillStyle = ground; g.fillRect(0, H / 2, W, H / 2);
  // sun glow in the game's sun direction (-0.52, 0.54, -0.66)
  const d = new THREE.Vector3(-0.52, 0.54, -0.66).normalize();
  const u = Math.atan2(d.z, d.x) / TAU + 0.5, v = Math.asin(d.y) / Math.PI + 0.5;
  const sx = u * W, sy = (1 - v) * H, glow = g.createRadialGradient(sx, sy, 0, sx, sy, 34);
  glow.addColorStop(0, 'rgba(255,250,235,1)'); glow.addColorStop(0.18, 'rgba(255,240,210,0.65)'); glow.addColorStop(1, 'rgba(255,235,200,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  if (interior) { g.fillStyle = 'rgba(20,24,28,0.55)'; g.fillRect(0, H * 0.58, W, H * 0.42); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of [].concat(object.material)) materials.add(material);
  });
  for (const material of materials) for (const key of Object.keys(material)) { const value = material[key]; if (value && value.isTexture) textures.add(value); }
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

// =====================================================================================================
export function createAircraft(THREE) {
  const K = geometryKit(THREE), { v3 } = K;
  const finish = createAviationSurfaceKit(THREE);
  const group = new THREE.Group();
  group.name = 'MQ-320 civil twinjet';
  const env = skyEnvironment(THREE);
  // the environment adds diffuse light on top of the game's hemisphere light, so it stays low
  const std = (params) => new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.4, ...params });
  const phys = (params) => new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.42, ...params });

  // ---------------- Fuselage: profile curves (z -> value) ----------------
  // [z, crown, keel, half-width, height of the widest line]
  const FUSE = [
    [-18.60, -0.07, -0.07, 0.00, -0.07], [-18.575, 0.03, -0.16, 0.10, -0.07], [-18.52, 0.13, -0.26, 0.20, -0.065],
    [-18.42, 0.25, -0.38, 0.33, -0.06], [-18.26, 0.39, -0.53, 0.49, -0.045], [-18.03, 0.54, -0.70, 0.67, -0.02],
    [-17.72, 0.69, -0.88, 0.87, 0.02], [-17.32, 0.84, -1.05, 1.08, 0.07], [-16.85, 0.99, -1.19, 1.29, 0.12],
    [-16.35, 1.14, -1.31, 1.47, 0.17], [-15.85, 1.43, -1.40, 1.62, 0.22], [-15.35, 1.77, -1.46, 1.75, 0.27],
    [-14.85, 2.04, -1.49, 1.85, 0.32], [-14.25, 2.23, -1.52, 1.925, 0.36],
    [-13.55, 2.33, -1.53, 1.965, 0.40], [-12.70, 2.365, -1.53, 1.97, 0.42], [-11.80, 2.37, -1.53, 1.97, 0.42],
    [6.40, 2.37, -1.53, 1.97, 0.42], [7.60, 2.37, -1.47, 1.97, 0.44], [8.80, 2.36, -1.33, 1.96, 0.48],
    [10.00, 2.33, -1.12, 1.92, 0.55], [11.20, 2.26, -0.86, 1.84, 0.64], [12.40, 2.15, -0.57, 1.71, 0.75],
    [13.60, 2.01, -0.25, 1.53, 0.86], [14.80, 1.86, 0.08, 1.30, 0.97], [16.00, 1.70, 0.40, 1.03, 1.06],
    [17.00, 1.56, 0.62, 0.78, 1.10], [17.80, 1.45, 0.80, 0.55, 1.12], [18.30, 1.38, 0.89, 0.40, 1.13], [18.60, 1.34, 0.93, 0.31, 1.13],
  ];
  const crown = monotone(FUSE.map(r => [r[0], r[1]])), keel = monotone(FUSE.map(r => [r[0], r[2]]));
  const halfWidth = monotone(FUSE.map(r => [r[0], r[3]])), waist = monotone(FUSE.map(r => [r[0], r[4]]));
  // Section point at angle theta (0 = crown, pi/2 = right side, pi = keel).
  function fuselagePoint(z, theta, out = v3()) {
    const w = halfWidth(z), t = crown(z), b = keel(z), m = waist(z), c = Math.cos(theta), s = Math.sin(theta);
    const R = (t - m) * (1 + c) / 2 + (m - b) * (1 - c) / 2;
    return out.set(w * s, m + R * c, z);
  }
  function fuselageNormal(z, theta) {
    const e = 0.002, p = fuselagePoint(z, theta), a = fuselagePoint(z, theta + e).sub(fuselagePoint(z, theta - e));
    const b = fuselagePoint(z + e, theta).sub(fuselagePoint(z - e, theta));
    const n = a.cross(b).normalize();
    if (n.dot(v3(p.x, p.y - waist(z), 0)) < 0) n.negate();
    return n;
  }
  // theta on a side (+1 right, -1 left) where the surface reaches height y at station z
  function thetaAt(z, y, side = 1) {
    let lo = 0, hi = Math.PI;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (fuselagePoint(z, mid).y > y) lo = mid; else hi = mid; }
    const th = (lo + hi) / 2; return side > 0 ? th : TAU - th;
  }
  const surfaceAt = (z, theta, offset = 0) => fuselagePoint(z, theta).add(fuselageNormal(z, theta).multiplyScalar(offset));
  const fuselageRowsZ = [];
  for (const r of FUSE) fuselageRowsZ.push(r[0]);
  for (const z of [-17.52, -17.08, -16.6, -16.1, -15.6, -15.1, -14.55, -13.9, -9, -6, -3, 0, 3, 7.0, 8.2, 9.4, 10.6, 11.8, 13.0, 14.2, 15.4, 16.5, 17.4, 18.05, 18.45]) fuselageRowsZ.push(z);
  fuselageRowsZ.sort((a, b) => a - b);
  const AROUND = 72;
  const fuselageRows = fuselageRowsZ.map(z => { const row = []; for (let j = 0; j < AROUND; j++) row.push(fuselagePoint(z, j / AROUND * TAU)); return row; });
  const fuselageGeometry = K.grid(fuselageRows, { closed: true, uv: (i, j) => [(fuselageRowsZ[i] + 18.6) / 37.2, j / AROUND] });
  // the tail end: a small cap around the APU exhaust
  {
    const z = 18.6, ring = []; for (let j = 0; j <= AROUND; j++) ring.push(fuselagePoint(z, j / AROUND * TAU));
    const c = v3(0, waist(z) + 0.02, z), positions = [c.x, c.y, c.z], normals = [0, 0, 1], uvs = [1, 0.5], indices = [];
    ring.forEach((p, j) => { positions.push(p.x, p.y, p.z); normals.push(0, 0, 1); uvs.push(1, j / AROUND); if (j) indices.push(0, j, j + 1); });
    var tailCap = K.fixWinding(K.build(positions, normals, uvs, indices));
  }

  // ---------------- Body texture: livery 1A gradient + doors + panel lines ----------------
  const BODY_W = 2048, BODY_H = 1024;
  const bodyUV = (z, theta) => [(z + 18.6) / 37.2 * BODY_W, (1 - theta / TAU) * BODY_H];
  let bodyMap = null;
  if (isBrowser) {
    const [canvas, g] = canvas2d(BODY_W, BODY_H);
    // The radial UV wraps from the crown, around the right side, belly and left side (belly at canvas mid-height):
    // one soft vertical gradient, pale sky blue on top to a deeper blue underneath.
    const sky = g.createLinearGradient(0, 0, 0, BODY_H);
    sky.addColorStop(0, '#b6d8ff'); sky.addColorStop(0.25, '#9ccaff'); sky.addColorStop(0.5, '#82b4f6');
    sky.addColorStop(0.75, '#9ccaff'); sky.addColorStop(1, '#b6d8ff');
    g.fillStyle = sky; g.fillRect(0, 0, BODY_W, BODY_H);
    // subtle panel lines: frame joints and lap joints
    g.strokeStyle = 'rgba(40,70,110,0.10)'; g.lineWidth = 1.2;
    for (let z = -13.4; z < 16; z += 2.42) { const [x] = bodyUV(z, 0); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, BODY_H); g.stroke(); }
    for (const th of [0.62, 1.95, 2.55, TAU - 0.62, TAU - 1.95, TAU - 2.55]) { const y = (1 - th / TAU) * BODY_H; g.beginPath(); g.moveTo(bodyUV(-14, 0)[0], y); g.lineTo(bodyUV(15, 0)[0], y); g.stroke(); }
    g.strokeStyle = 'rgba(30,55,90,0.16)'; g.lineWidth = 1.4; // radome joint
    { const [x] = bodyUV(-16.95, 0); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, BODY_H); g.stroke(); }
    // outline traced on the body: points given as (z, y) on one side
    const trace = (side, points) => { g.beginPath(); points.forEach(([z, y], i) => { const [px, py] = bodyUV(z, thetaAt(z, y, side)); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); };
    const rounded = (zc, yc, w, h, r, n = 5) => {
      const pts = [], corners = [[zc + w / 2 - r, yc + h / 2 - r, 0], [zc - w / 2 + r, yc + h / 2 - r, Math.PI / 2], [zc - w / 2 + r, yc - h / 2 + r, Math.PI], [zc + w / 2 - r, yc - h / 2 + r, Math.PI * 1.5]];
      for (const [cz, cy, a0] of corners) for (let k = 0; k <= n; k++) { const a = a0 + k / n * Math.PI / 2; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      return pts;
    };
    for (const side of [-1, 1]) {
      // passenger doors and overwing exits: pale panels with a darker edge (livery 1A)
      for (const [z, y, w, h] of [[-11.95, 0.44, 0.77, 1.61], [10.1, 0.44, 0.77, 1.61], [-1.35, 0.66, 0.47, 1.13], [0.45, 0.66, 0.47, 1.13]]) {
        trace(side, rounded(z, y, w + 0.09, h + 0.09, 0.16)); g.fillStyle = '#758a97'; g.fill();
        trace(side, rounded(z, y, w, h, 0.13)); g.fillStyle = '#bcdcff'; g.fill();
        trace(side, rounded(z + 0.2 * (z < 0 ? 1 : -1) * (h > 1.3 ? 1 : 0), y + 0.11, 0.1, 0.035, 0.012, 2)); g.fillStyle = '#101c29'; g.fill();
      }
      // cargo doors (right side only on the real thing; both here look fine) and service panels as faint lines
      g.strokeStyle = 'rgba(30,60,95,0.35)'; g.lineWidth = 1.6;
      if (side > 0) for (const [z, y, w, h] of [[-7.6, -0.78, 1.8, 1.24], [6.2, -0.78, 1.8, 1.24]]) { trace(side, rounded(z, y, w, h, 0.12)); g.stroke(); }
      trace(side, rounded(16.9, 1.15, 0.5, 0.42, 0.05)); g.stroke(); // APU access
    }
    bodyMap = new THREE.CanvasTexture(canvas); bodyMap.colorSpace = THREE.SRGBColorSpace; bodyMap.anisotropy = 4;
  }
  const paint = phys({ color: 0xffffff, map: bodyMap, roughness: 0.37, metalness: 0.04, clearcoat: 0.58, clearcoatRoughness: 0.17, envMapIntensity: 0.42 });
  finish.relief(paint, { bumpScale: 0.008 });
  const fuselage = new THREE.Mesh(K.merge([fuselageGeometry, tailCap]), paint);
  fuselage.name = 'fuselage'; fuselage.castShadow = fuselage.receiveShadow = true; group.add(fuselage);

  // ---------------- Windows ----------------
  const glass = phys({ color: 0x182b3b, transparent: true, opacity: 0.94, depthWrite: false, roughness: 0.045, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.52, envMapIntensity: 0.95 });
  const frameDark = std({ color: 0x1c2733, roughness: 0.55, metalness: 0.2 });
  const glassParts = [], darkParts = [];
  // patch on the fuselage over a quad in (z, theta) parameter space
  function surfacePatch(corners, offset, nz = 6, nt = 6, inset = 0) {
    const rows = [];
    const [c0, c1, c2, c3] = corners; // bottom-front, bottom-rear, top-rear, top-front (z, theta)
    for (let i = 0; i <= nt; i++) {
      const row = [], fv = lerp(inset, 1 - inset, i / nt);
      for (let j = 0; j <= nz; j++) {
        const fu = lerp(inset, 1 - inset, j / nz);
        const z = lerp(lerp(c0[0], c1[0], fu), lerp(c3[0], c2[0], fu), fv), th = lerp(lerp(c0[1], c1[1], fu), lerp(c3[1], c2[1], fu), fv);
        row.push(surfaceAt(z, th, offset));
      }
      rows.push(row);
    }
    return K.grid(rows, { orient: 'none' });
  }
  function orientOutward(g, center) { // make normals point away from the fuselage axis
    const n = g.attributes.normal, p = g.attributes.position; let s = 0;
    for (let i = 0; i < n.count; i++) s += n.getX(i) * p.getX(i) + n.getY(i) * (p.getY(i) - center);
    if (s < 0) K.flipGeometry(g); return g;
  }
  // cockpit windows: two front panels, a sliding side window and a small aft window per side
  const cockpitWindows = (side) => {
    const T = (th) => side > 0 ? th : TAU - th;
    // corners: bottom-front, bottom-rear, top-rear, top-front as (z, theta)
    return [
      [[-16.3, T(0.05)], [-16.0, T(0.6)], [-15.28, T(0.55)], [-15.36, T(0.05)]],
      [[-15.86, T(1.1)], [-14.98, T(1.12)], [-14.98, T(0.635)], [-15.22, T(0.635)]],
      [[-14.84, T(1.12)], [-14.27, T(1.12)], [-14.27, T(0.65)], [-14.84, T(0.645)]],
    ].map(q => side > 0 ? q : [q[0], q[1], q[2], q[3]]);
  };
  for (const side of [-1, 1]) {
    for (const quad of cockpitWindows(side)) {
      const c = quad.map(q => q.slice());
      // dark frame slightly larger than the glass
      const grow = (k, dz, dth) => [c[k][0] + dz, c[k][1] + dth];
      const s = side;
      const frame = [grow(0, -0.05, s * 0.025), grow(1, 0.05, s * 0.025), grow(2, 0.05, -s * 0.025), grow(3, -0.05, -s * 0.025)];
      darkParts.push(orientOutward(surfacePatch(frame, 0.006, 6, 6), 0.3));
      glassParts.push(orientOutward(surfacePatch(c, 0.012, 6, 6), 0.3));
    }
    // Parked windscreen wipers: separate from the dark glass so the arm catches sunlight.
    const front = cockpitWindows(side)[0], mix = t => [lerp(front[0][0], front[1][0], t), lerp(front[0][1], front[1][1], t)];
    const at = t => surfaceAt(...mix(t), 0.035);
    darkParts.push(K.rod(at(0.08), at(0.72), 0.013, 0.013, 6), K.rod(at(0.38), at(0.78).add(v3(0, -0.06, 0)), 0.014, 0.019, 6));
  }
  // cabin window strip: rounded rectangles that follow the fuselage curvature
  function cabinWindow(zc, yc, side, w = 0.25, h = 0.35, r = 0.1, off = 0.011) {
    const pts = [[zc, yc]];
    const corners = [[zc + w / 2 - r, yc + h / 2 - r, 0], [zc - w / 2 + r, yc + h / 2 - r, Math.PI / 2], [zc - w / 2 + r, yc - h / 2 + r, Math.PI], [zc + w / 2 - r, yc - h / 2 + r, Math.PI * 1.5]];
    for (const [cz, cy, a0] of corners) for (let k = 0; k <= 3; k++) { const a = a0 + k / 3 * Math.PI / 2; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    const positions = [], normals = [], indices = [];
    for (const [z, y] of pts) { const th = thetaAt(z, y, side), p = surfaceAt(z, th, off), n = fuselageNormal(z, th); positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); }
    const count = pts.length - 1; for (let k = 1; k <= count; k++) indices.push(0, k, k % count + 1);
    return K.fixWinding(K.build(positions, normals, null, indices));
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 37; k++) {
      const z = -11.15 + k * 0.565;
      if (z > 9.55) break;
      glassParts.push(cabinWindow(z, 0.8, side));
      darkParts.push(cabinWindow(z, 0.8, side, 0.3, 0.4, 0.12, 0.007));
    }
  }
  const glassMesh = new THREE.Mesh(K.merge(glassParts), glass); glassMesh.name = 'windows'; group.add(glassMesh);

  // ---------------- Decals: 「天青航空」 SKYGLAZE wordmark and MQ-320 mark (one atlas) ----------------
  let decalMaterial = null;
  if (isBrowser) {
    const [canvas, g] = canvas2d(1536, 416);
    { // 「天青航空」 serif name followed by spaced SKYGLAZE caps
      const height = 160; g.fillStyle = '#1e3550'; g.textBaseline = 'alphabetic';
      const cjk = `700 ${height * 0.7}px "Noto Serif TC", "Songti TC", "PMingLiU", "Noto Serif CJK TC", serif`;
      const latin = `500 ${height * 0.3}px "Helvetica Neue", "Avenir Next", Arial, sans-serif`;
      g.font = cjk; const w1 = g.measureText('天青航空').width;
      g.font = latin; if ('letterSpacing' in g) g.letterSpacing = `${height * 0.09}px`; const w2 = g.measureText('SKYGLAZE').width;
      const gap = height * 0.35, x0 = (1536 - w1 - gap - w2) / 2;
      g.textAlign = 'left'; g.font = cjk; if ('letterSpacing' in g) g.letterSpacing = '0px'; g.fillText('天青航空', x0, height * 0.75);
      g.font = latin; if ('letterSpacing' in g) g.letterSpacing = `${height * 0.09}px`; g.fillText('SKYGLAZE', x0 + w1 + gap, height * 0.74);
      if ('letterSpacing' in g) g.letterSpacing = '0px';
    }
    g.fillStyle = '#1e3550'; g.font = `700 ${256 * 0.53}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('MQ-320', 384, 160 + 128);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    decalMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0.05, envMap: env, envMapIntensity: 0.6 });
  }
  function curvedDecal(side, y, z, width, height, v0, v1, u1 = 1) {
    const positions = [], normals = [], uvs = [], indices = [], columns = 24, rows = 6;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const u = col / columns, v = row / rows, py = y + (v - 0.5) * height, pz = z + side * (0.5 - u) * width;
      const th = thetaAt(pz, py, side), p = surfaceAt(pz, th, 0.016), n = fuselageNormal(pz, th);
      positions.push(p.x, p.y, p.z); normals.push(n.x, n.y, n.z); uvs.push(u * u1, lerp(v0, v1, v));
      if (row < rows && col < columns) { const a = row * (columns + 1) + col, b = a + columns + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    return K.fixWinding(K.build(positions, normals, uvs, indices));
  }
  if (decalMaterial) {
    const parts = [];
    for (const side of [-1, 1]) {
      parts.push(curvedDecal(side, 1.21, -4.6, 10.8, 1.1, 256 / 416, 1));
      parts.push(curvedDecal(side, 0.02, 8.25, 2.2, 0.6, 0, 256 / 416, 0.5));
    }
    const decals = new THREE.Mesh(K.merge(parts), decalMaterial); decals.name = 'livery decals'; decals.renderOrder = 1; group.add(decals);
  }

  // ---------------- Wings ----------------
  // stations: x, chord-line height at the leading edge, leading-edge z, chord, thickness/chord
  const WING = [[1.3, -0.32, -3.65, 7.7, 0.15], [6.0, -0.12, -0.7, 5.8, 0.13], [12.0, 0.4, 2.9, 3.65, 0.115], [17.65, 0.93, 5.75, 1.75, 0.105]];
  function station(table, x) {
    let i = 0; while (i < table.length - 2 && x > table[i + 1][0]) i++;
    const a = table[i], b = table[i + 1], t = (x - a[0]) / (b[0] - a[0]);
    return { y: lerp(a[1], b[1], t), le: lerp(a[2], b[2], t), chord: lerp(a[3], b[3], t), tc: lerp(a[4], b[4], t) };
  }
  const halfThickness = (t, tc) => 5 * tc * (0.2969 * Math.sqrt(Math.max(t, 0)) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1015 * t ** 4);
  const camberLine = (t, m = 0.018, p = 0.42) => t < p ? m / (p * p) * (2 * p * t - t * t) : m / ((1 - p) ** 2) * ((1 - 2 * p) + 2 * p * t - t * t);
  // airfoil surface point; frame(x) gives {y, le, chord, tc}; sideSign mirrors x
  function foilPoint(st, x, t, upper, sideSign, camber = 1) {
    const h = halfThickness(t, st.tc) * st.chord, c = camberLine(t) * st.chord * camber;
    return v3(sideSign * x, st.y + c + (upper ? h : -h), st.le + t * st.chord);
  }
  const cosSpace = (a, b, n) => { const out = []; for (let k = 0; k <= n; k++) out.push(a + (b - a) * (1 - Math.cos(Math.PI * k / n)) / 2); return out; };
  const N_FOIL = 16;
  // Ring pieces for one spanwise station. kind: 'full' | 'fixed' (0..cut with a cove) | 'flap' (cut..1 with a rounded nose)
  function foilRings(st, x, side, kind, cut, camber = 1) {
    const pieces = [];
    if (kind === 'full') {
      const main = [];
      for (const t of cosSpace(1, 0, N_FOIL)) main.push(foilPoint(st, x, t, true, side, camber));
      for (const t of cosSpace(0, 1, N_FOIL).slice(1)) main.push(foilPoint(st, x, t, false, side, camber));
      pieces.push(main, [main[main.length - 1], main[0]].map(p => p.clone()));
    } else if (kind === 'fixed') {
      const main = [];
      for (const t of cosSpace(cut, 0, N_FOIL)) main.push(foilPoint(st, x, t, true, side, camber));
      for (const t of cosSpace(0, cut, N_FOIL).slice(1)) main.push(foilPoint(st, x, t, false, side, camber));
      const U = main[0], L = main[main.length - 1], cove = [];
      const r = (U.y - L.y) / 2, cy = (U.y + L.y) / 2, depth = r * 0.95 + 0.03;
      for (let k = 0; k <= 6; k++) { const a = Math.PI * k / 6; cove.push(v3(U.x, cy - r * Math.cos(a), U.z - depth * Math.sin(a))); }
      cove.cove = true; pieces.push(main, cove);
    } else {
      const main = [];
      const U = foilPoint(st, x, cut, true, side, camber), L = foilPoint(st, x, cut, false, side, camber);
      for (const t of cosSpace(1, cut, N_FOIL / 2)) main.push(foilPoint(st, x, t, true, side, camber));
      const r = (U.y - L.y) / 2, cy = (U.y + L.y) / 2, depth = r * 0.95;
      for (let k = 1; k < 6; k++) { const a = Math.PI * k / 6; main.push(v3(U.x, cy + r * Math.cos(a), U.z - depth * Math.sin(a))); }
      for (const t of cosSpace(cut, 1, N_FOIL / 2)) main.push(foilPoint(st, x, t, false, side, camber));
      pieces.push(main, [main[main.length - 1], main[0]].map(p => p.clone()));
    }
    return pieces;
  }
  // loft a list of stations (x values) of one kind; returns geometries (one per ring piece)
  function foilLoft(table, xs, side, kind, cut, uvFn, camber = 1) {
    const ringsPerX = xs.map(x => foilRings(station(table, x), x, side, kind, cut, camber));
    const out = [];
    for (let p = 0; p < ringsPerX[0].length; p++) {
      const rows = ringsPerX.map(r => r[p]);
      out.push(K.grid(rows, { orient: 'centroid', uv: uvFn ? (i, j, pt) => uvFn(pt) : null }));
    }
    // orient each piece: shells away from the section centre, the cove toward the open slot behind it
    const tMid = kind === 'flap' ? (1 + cut) / 2 : kind === 'fixed' ? cut * 0.5 : 0.45;
    out.forEach((g, p) => {
      const cove = ringsPerX[0][p].cove;
      K.orientBy(g, (pt, n) => {
        const x = Math.abs(pt.x), st = station(table, x);
        const cy = st.y + camberLine(cove ? cut : tMid) * st.chord * camber, cz = st.le + (cove ? cut : tMid) * st.chord;
        const d = n.y * (pt.y - cy) + n.z * (pt.z - cz);
        return cove ? -d : d;
      });
    });
    return out;
  }
  // cap: fill the airfoil region between t0 and t1 at span x (facing outboard if dir > 0)
  function foilCap(table, x, side, t0, t1, dir, uvFn, camber = 1) {
    const st = station(table, x), top = [], bottom = [];
    for (const t of cosSpace(t0, t1, 8)) { top.push(foilPoint(st, x, t, true, side, camber)); bottom.push(foilPoint(st, x, t, false, side, camber)); }
    return K.strip(top, bottom, v3(side * dir, 0, 0), uvFn);
  }
  // end cap of a flap-type piece (cut..1 plus its rounded nose)
  function flapCap(table, x, side, cut, dir, uvFn, camber = 1) {
    const st = station(table, x), U = foilPoint(st, x, cut, true, side, camber), L = foilPoint(st, x, cut, false, side, camber);
    const r = (U.y - L.y) / 2, cy = (U.y + L.y) / 2, depth = r * 0.95, top = [], bottom = [];
    for (let k = 0; k < 4; k++) { const a = Math.PI / 2 * k / 4; top.push(v3(U.x, cy + r * Math.sin(a), U.z - depth * Math.cos(a))); bottom.push(v3(U.x, cy - r * Math.sin(a), U.z - depth * Math.cos(a))); }
    for (const t of cosSpace(cut, 1, 8)) { top.push(foilPoint(st, x, t, true, side, camber)); bottom.push(foilPoint(st, x, t, false, side, camber)); }
    return K.strip(top, bottom, v3(side * dir, 0, 0), uvFn);
  }
  // wing texture: grey with a brighter leading edge, slat seam, spar and rib lines; the last rows stay plain
  let wingMap = null;
  if (isBrowser) {
    const [canvas, g] = canvas2d(512, 512);
    g.fillStyle = '#c3cbd0'; g.fillRect(0, 0, 512, 512);
    const le = g.createLinearGradient(0, 0, 40, 0); le.addColorStop(0, '#dfe5e8'); le.addColorStop(1, 'rgba(195,203,208,0)');
    g.fillStyle = le; g.fillRect(0, 0, 40, 480);
    g.strokeStyle = 'rgba(70,84,94,0.55)'; g.lineWidth = 1.5;
    for (const x of [62]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 480); g.stroke(); } // slat seam
    g.strokeStyle = 'rgba(70,84,94,0.22)'; g.lineWidth = 1;
    for (const x of [150, 330]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 480); g.stroke(); }
    for (let y = 18; y < 480; y += 26) { g.beginPath(); g.moveTo(62, y); g.lineTo(330, y); g.stroke(); }
    g.strokeStyle = 'rgba(60,70,80,0.35)'; for (let y = 40; y < 480; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(62, y); g.stroke(); }
    g.fillStyle = '#c3cbd0'; g.fillRect(0, 488, 512, 24);
    wingMap = new THREE.CanvasTexture(canvas); wingMap.colorSpace = THREE.SRGBColorSpace; wingMap.anisotropy = 4;
  }
  const wingGrey = std({ color: 0xffffff, map: wingMap, roughness: 0.46, metalness: 0.28 });
  finish.relief(wingGrey, { bumpScale: 0.005 });
  const PLAIN_UV = [0.5, 0.015]; // plain grey corner of the wing texture
  const wingUV = (table, span0, span1) => (p) => { const x = Math.abs(p.x), st = station(table, x); return [clamp((p.z - st.le) / st.chord, 0, 1), clamp(1 - (x - span0) / (span1 - span0), 0, 1) * 0.94 + 0.05]; };
  const staticWing = [], movables = { flaps: [], ailerons: [], spoilers: [], elevators: [], rudder: null };
  // Hinged surface: a pivot group whose local X runs along the hinge line, so rotation.x deflects the surface.
  function hinge(a, b, parent = group, canonical = true) {
    const dir = b.clone().sub(a).normalize(); if (canonical && (dir.x < 0 || (Math.abs(dir.x) < 1e-6 && dir.y < 0))) dir.negate();
    const base = new THREE.Group(); base.position.copy(a); base.quaternion.setFromUnitVectors(v3(1, 0, 0), dir); parent.add(base);
    const pivot = new THREE.Group(); base.add(pivot); base.updateMatrix();
    const inverse = base.matrix.clone().invert();
    return { pivot, dir, toLocal: (g) => g.applyMatrix4(inverse) };
  }
  const FLAP_CUT = 0.755, AIL_CUT = 0.76;
  const flapSpans = [[2.3, 7.1], [7.25, 12.75]], ailSpan = [13.0, 16.7];
  for (const side of [-1, 1]) {
    const uv = wingUV(WING, 1.3, 17.65);
    // fixed structure, spanwise: full / cut segments
    const segs = [
      ['full', [1.3, 2.3]], ['fixed', [2.3, 6.0, 7.1], FLAP_CUT], ['full', [7.1, 7.25]], ['fixed', [7.25, 12.0, 12.75], FLAP_CUT],
      ['full', [12.75, 13.0]], ['fixed', [13.0, 16.7], AIL_CUT], ['full', [16.7, 17.65]],
    ];
    for (const [kind, xs, cut] of segs) staticWing.push(...foilLoft(WING, xs, side, kind, cut || 0, uv));
    // side walls where a cut segment meets a full one (seen when the flaps run out)
    for (const [x, cut, dir] of [[2.3, FLAP_CUT, 1], [7.1, FLAP_CUT, -1], [7.25, FLAP_CUT, 1], [12.75, FLAP_CUT, -1], [13.0, AIL_CUT, 1], [16.7, AIL_CUT, -1]]) staticWing.push(foilCap(WING, x, side, cut, 1, dir, uv));
    // flaps: Fowler-style, rotating about a hinge line below the wing so they run aft and down
    for (const [x0, x1] of flapSpans) {
      const s0 = station(WING, x0 + 0.02), s1 = station(WING, x1 - 0.02), mid = x0 < 6 ? 6.0 : 12.0;
      const h0 = v3(side * (x0 + 0.02), s0.y - 0.13 * s0.chord, s0.le + 0.79 * s0.chord), h1 = v3(side * (x1 - 0.02), s1.y - 0.13 * s1.chord, s1.le + 0.79 * s1.chord);
      const hg = hinge(h0, h1), parts = foilLoft(WING, [x0 + 0.02, mid, x1 - 0.02], side, 'flap', FLAP_CUT + 0.002, uv);
      parts.push(flapCap(WING, x0 + 0.02, side, FLAP_CUT + 0.002, -1, uv), flapCap(WING, x1 - 0.02, side, FLAP_CUT + 0.002, 1, uv));
      const mesh = new THREE.Mesh(K.merge(parts.map(hg.toLocal)), wingGrey); mesh.castShadow = mesh.receiveShadow = true; hg.pivot.add(mesh);
      movables.flaps.push({ pivot: hg.pivot, side, mesh, hinge: hg, span: [x0, x1] });
    }
    { // aileron hinged at its nose
      const [x0, x1] = ailSpan, s0 = station(WING, x0 + 0.02), s1 = station(WING, x1 - 0.02);
      const h0 = v3(side * (x0 + 0.02), s0.y + camberLine(AIL_CUT) * s0.chord, s0.le + (AIL_CUT + 0.01) * s0.chord), h1 = v3(side * (x1 - 0.02), s1.y + camberLine(AIL_CUT) * s1.chord, s1.le + (AIL_CUT + 0.01) * s1.chord);
      const hg = hinge(h0, h1), parts = foilLoft(WING, [x0 + 0.02, x1 - 0.02], side, 'flap', AIL_CUT + 0.002, uv);
      parts.push(flapCap(WING, x0 + 0.02, side, AIL_CUT + 0.002, -1, uv), flapCap(WING, x1 - 0.02, side, AIL_CUT + 0.002, 1, uv));
      const mesh = new THREE.Mesh(K.merge(parts.map(hg.toLocal)), wingGrey); mesh.castShadow = true; hg.pivot.add(mesh);
      movables.ailerons.push({ pivot: hg.pivot, side });
    }
    // spoilers: thin panels on the upper skin ahead of the flaps, hinged at their leading edge
    for (const panels of [[[2.55, 4.15], [4.25, 5.9]], [[7.45, 8.95], [9.05, 10.5], [10.6, 12.0]]]) {
      const xa = panels[0][0], xb = panels[panels.length - 1][1], t0 = 0.565, t1 = FLAP_CUT - 0.004;
      const sa = station(WING, xa), sb = station(WING, xb);
      const hg = hinge(foilPoint(sa, xa, t0, true, side), foilPoint(sb, xb, t0, true, side));
      const parts = [];
      for (const [p0, p1] of panels) {
        const top = [], bottom = [];
        for (let i = 0; i <= 3; i++) {
          const x = lerp(p0, p1, i / 3), st = station(WING, x), rowTop = [], rowBottom = [];
          for (const t of [t0, (t0 + t1) / 2, t1]) { const p = foilPoint(st, x, t, true, side); rowTop.push(p.clone().add(v3(0, 0.014, 0))); rowBottom.push(p.clone().add(v3(0, -0.012, 0))); }
          top.push(rowTop); bottom.push(rowBottom);
        }
        const centre = foilPoint(station(WING, (p0 + p1) / 2), (p0 + p1) / 2, (t0 + t1) / 2, true, side);
        const out = (g) => K.orientBy(g, (pt, n) => n.dot(pt.clone().sub(centre)));
        parts.push(K.orientBy(K.grid(top, { orient: 'none', uv: (i, j, p) => uv(p) }), (pt, n) => n.y), K.orientBy(K.grid(bottom, { orient: 'none', uv: (i, j, p) => uv(p) }), (pt, n) => -n.y));
        const edge = (rowsA, rowsB) => out(K.grid([rowsA, rowsB], { orient: 'none', uv: (i, j, p) => uv(p) }));
        parts.push(edge(top[3], bottom[3]), edge(top[0], bottom[0]), edge(top.map(r => r[2]), bottom.map(r => r[2])));
      }
      const mesh = new THREE.Mesh(K.merge(parts.map(hg.toLocal)), wingGrey); mesh.castShadow = true; hg.pivot.add(mesh);
      movables.spoilers.push({ pivot: hg.pivot, side });
    }
  }

  // ---------------- Sharklets ----------------
  const glaze = phys({ color: 0x86b4f0, roughness: 0.38, metalness: 0.06, clearcoat: 0.6, clearcoatRoughness: 0.15 }); // 天青 sky-blue glaze
  const teal = phys({ color: 0x3a689c, roughness: 0.4, metalness: 0.08, clearcoat: 0.5, clearcoatRoughness: 0.2 }); // deep blue accent
  const sharkletParts = [], tealParts = [];
  for (const side of [-1, 1]) {
    const rings = [], tipRings = [];
    const N = 14;
    for (let k = 0; k <= N; k++) {
      const s = k / N;
      // path: a tight blend from the tip into a near-vertical, slightly canted and swept fin
      const R = 0.32, CANT = 0.06, SB = 0.4, bend = smooth(s / SB), phi = bend * (Math.PI / 2 - CANT), phiEnd = Math.PI / 2 - CANT;
      const base = s < SB ? v3(17.65 + R * Math.sin(phi), 0.93 + R * (1 - Math.cos(phi)), 0)
        : v3(17.65 + R * Math.sin(phiEnd) + (s - SB) / (1 - SB) * 1.72 * Math.sin(CANT), 0.93 + R * (1 - Math.cos(phiEnd)) + (s - SB) / (1 - SB) * 1.72 * Math.cos(CANT), 0);
      const le = lerp(5.75, 7.2, Math.pow(s, 1.25)), chord = lerp(1.75, 0.5, Math.pow(s, 0.85)) * (1 - 0.05 * Math.sin(s * Math.PI)), tc = lerp(0.105, 0.085, s);
      const N2 = v3(-Math.sin(phi), Math.cos(phi), 0); // thickness direction (up, then inboard)
      const camberFade = 1 - smooth(s / 0.25), ring = [];
      const pt = (t, sign) => { const h = halfThickness(t, tc) * chord * (k === N ? 0.12 : 1) * sign + camberLine(t) * chord * camberFade; return v3(side * (base.x + N2.x * h), base.y + N2.y * h, le + t * chord); };
      for (const t of cosSpace(1, 0, N_FOIL)) ring.push(pt(t, 1));
      for (const t of cosSpace(0, 1, N_FOIL).slice(1)) ring.push(pt(t, -1));
      (k >= N - 2 ? tipRings : rings).push(ring);
      if (k === N - 2) rings.push(ring);
    }
    sharkletParts.push(K.grid(rings, { closed: true, orient: 'centroid' }));
    tealParts.push(K.grid(tipRings, { closed: true, orient: 'centroid' }));
  }
  const sharklets = new THREE.Mesh(K.merge(sharkletParts), glaze); sharklets.castShadow = true; group.add(sharklets);

  // ---------------- Horizontal stabiliser + elevators ----------------
  const TAIL = [[0.5, 1.51, 10.76, 4.82, 0.11], [3.35, 1.7, 13.05, 3.4, 0.1], [6.25, 1.99, 15.17, 1.65, 0.09]];
  const ELEV_CUT = 0.7;
  for (const side of [-1, 1]) {
    const uv = wingUV(TAIL, 0.5, 6.25);
    staticWing.push(...foilLoft(TAIL, [0.5, 1.4], side, 'full', 0, uv, 0), ...foilLoft(TAIL, [1.4, 3.35, 5.95], side, 'fixed', ELEV_CUT, uv, 0), ...foilLoft(TAIL, [5.95, 6.25], side, 'full', 0, uv, 0));
    staticWing.push(foilCap(TAIL, 1.4, side, ELEV_CUT, 1, 1, uv, 0), foilCap(TAIL, 5.95, side, ELEV_CUT, 1, -1, uv, 0), foilCap(TAIL, 6.25, side, 0, 1, 1, uv, 0));
    const s0 = station(TAIL, 1.42), s1 = station(TAIL, 5.93);
    const hg = hinge(v3(side * 1.42, s0.y, s0.le + (ELEV_CUT + 0.01) * s0.chord), v3(side * 5.93, s1.y, s1.le + (ELEV_CUT + 0.01) * s1.chord));
    const parts = foilLoft(TAIL, [1.42, 3.35, 5.93], side, 'flap', ELEV_CUT + 0.002, uv, 0);
    parts.push(flapCap(TAIL, 1.42, side, ELEV_CUT + 0.002, -1, uv, 0), flapCap(TAIL, 5.93, side, ELEV_CUT + 0.002, 1, uv, 0));
    const mesh = new THREE.Mesh(K.merge(parts.map(hg.toLocal)), wingGrey); mesh.castShadow = true; hg.pivot.add(mesh);
    movables.elevators.push({ pivot: hg.pivot, side });
  }

  // ---------------- Vertical fin with dorsal fillet + rudder ----------------
  const finLE = (y) => 11.2 + (y - 1.9) * 0.779 - (y < 2.3 ? 2.8 : 2.8 * (1 - smooth((y - 2.3) / 1.4)));
  const finTE = (y) => 17.3 + (y - 1.9) * 0.08;
  const finHalf = (y) => lerp(0.3, 0.1, clamp((y - 1.9) / 5.65, 0, 1));
  const FIN_TOP = 7.55, RUDDER_CUT = 0.69;
  const finYs = [1.2, 1.9, 2.25, 2.5, 2.75, 3.0, 3.3, 3.65, 4.1, 4.8, 5.6, 6.4, 7.1, FIN_TOP];
  const finUV = (p) => [(p.z - 8.6) / 9.6, (p.y - 1.4) / 6.2];
  function finSection(y, t0, t1, kind) {
    const le = finLE(y), te = finTE(y), chord = te - le, half = finHalf(y);
    const thick = (t) => { const base = halfThickness(t, 0.1) / halfThickness(0.3, 0.1); return half * base; };
    const pt = (t, s) => v3(s * thick(t), y, le + t * chord);
    const ring = [];
    if (kind === 'full') { for (const t of cosSpace(1, 0, 14)) ring.push(pt(t, 1)); for (const t of cosSpace(0, 1, 14).slice(1)) ring.push(pt(t, -1)); return [ring, [ring[ring.length - 1], ring[0]].map(p => p.clone())]; }
    if (kind === 'fixed') {
      for (const t of cosSpace(t1, 0, 14)) ring.push(pt(t, 1)); for (const t of cosSpace(0, t1, 14).slice(1)) ring.push(pt(t, -1));
      const a = ring[ring.length - 1], b = ring[0], cove = [], r = (b.x - a.x) / 2;
      for (let k = 0; k <= 6; k++) { const ang = Math.PI * k / 6; cove.push(v3(-r * Math.cos(ang), y, a.z - (r * 0.95 + 0.02) * Math.sin(ang))); }
      cove.cove = true; return [ring, cove];
    }
    // rudder
    const U = pt(t0, 1), r = U.x;
    for (const t of cosSpace(1, t0, 8)) ring.push(pt(t, 1));
    for (let k = 1; k < 6; k++) { const ang = Math.PI * k / 6; ring.push(v3(r * Math.cos(ang), y, U.z - r * 0.95 * Math.sin(ang))); }
    for (const t of cosSpace(t0, 1, 8)) ring.push(pt(t, -1));
    return [ring, [ring[ring.length - 1], ring[0]].map(p => p.clone())];
  }
  function finLoft(ys, t0, t1, kind) {
    const sections = ys.map(y => finSection(y, t0, t1, kind)), out = [];
    for (let p = 0; p < sections[0].length; p++) out.push(K.grid(sections.map(s => s[p]), { orient: 'none', uv: (i, j, pt) => finUV(pt) }));
    const tMid = kind === 'rudder' ? (1 + t0) / 2 : kind === 'fixed' ? t1 * 0.5 : 0.45;
    out.forEach((g, p) => {
      const cove = sections[0][p].cove;
      K.orientBy(g, (pt, n) => {
        const le = finLE(pt.y), cz = le + (cove ? t1 : tMid) * (finTE(pt.y) - le), d = n.x * pt.x + n.z * (pt.z - cz);
        return cove ? -d : d;
      });
    });
    return out;
  }
  const finParts = [
    ...finLoft(finYs.filter(y => y <= 2.25), 0, 1, 'full'),
    ...finLoft(finYs.filter(y => y >= 2.25 && y <= 7.1), 0, RUDDER_CUT, 'fixed'),
    ...finLoft([7.1, FIN_TOP], 0, 1, 'full'),
  ];
  { // tip cap and the side walls of the rudder bay
    const y = FIN_TOP, le = finLE(y), chord = finTE(y) - le, top = [], bottom = [];
    for (const t of cosSpace(0, 1, 10)) { const h = finHalf(y) * halfThickness(t, 0.1) / halfThickness(0.3, 0.1); top.push(v3(h, y, le + t * chord)); bottom.push(v3(-h, y, le + t * chord)); }
    finParts.push(K.strip(top, bottom, v3(0, 1, 0), finUV));
    for (const [yy, dir] of [[2.25, 1], [7.1, -1]]) {
      const l = finLE(yy), c = finTE(yy) - l, a = [], b = [];
      for (const t of cosSpace(RUDDER_CUT, 1, 6)) { const h = finHalf(yy) * halfThickness(t, 0.1) / halfThickness(0.3, 0.1); a.push(v3(h, yy, l + t * c)); b.push(v3(-h, yy, l + t * c)); }
      finParts.push(K.strip(a, b, v3(0, dir, 0), finUV));
    }
  }
  let finMap = null;
  // Porcelain crackle (開片): Voronoi cells from jittered seeds (half-plane clipping); each shared edge is drawn once with a slight wobble.
  function crackleCells(g, W, H, seed, count, color, alpha, width) {
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = []; for (let i = 0; i < count; i++) pts.push([rnd() * W, rnd() * H]);
    const pad = 60, seen = new Set(); g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width; g.lineCap = 'round';
    pts.forEach((p, i) => {
      let poly = [[-pad, -pad], [W + pad, -pad], [W + pad, H + pad], [-pad, H + pad]];
      pts.forEach((q, j) => {
        if (j === i || !poly.length) return;
        const nx = q[0] - p[0], ny = q[1] - p[1], c = (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2;
        const out = [], dist = (v) => v[0] * nx + v[1] * ny - c;
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length], da = dist(a), db = dist(b);
          if (da <= 0) out.push(a);
          if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        }
        poly = out;
      });
      for (let k = 0; k < poly.length; k++) {
        let a = poly[k], b = poly[(k + 1) % poly.length];
        if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) [a, b] = [b, a];
        const key = `${a[0].toFixed(1)},${a[1].toFixed(1)},${b[0].toFixed(1)},${b[1].toFixed(1)}`;
        if (seen.has(key) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue; seen.add(key);
        const wob = (Math.sin(a[0] * 12.9898 + a[1] * 78.233 + b[0] * 3.7 + b[1] * 5.1) * 43758.5453) % 1;
        const mx = (a[0] + b[0]) / 2 + wob * 7, my = (a[1] + b[1]) / 2 + ((wob * 7919) % 1) * 7;
        g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(mx, my, b[0], b[1]); g.stroke();
      }
    });
    g.globalAlpha = 1;
  }
  if (isBrowser) {
    // Fin: blue glaze gradient with a porcelain crackle network (開片). u spans z 8.6..18.2, v spans y 1.4..7.6.
    const W = 1024, H = 662, [canvas, g] = canvas2d(W, H);
    const glazeGradient = g.createLinearGradient(W * 0.16, 0, W, H); glazeGradient.addColorStop(0, '#a6caf8'); glazeGradient.addColorStop(1, '#6ba0e4');
    g.fillStyle = glazeGradient; g.fillRect(0, 0, W, H);
    crackleCells(g, W, H, 11, 24, '#24497a', 0.55, 5.2);
    crackleCells(g, W, H, 12, 70, '#4f7db0', 0.45, 2.4);
    // deep-blue band across the upper fin (y 5.92..6.38)
    const vy = (y) => (1 - (y - 1.4) / 6.2) * H;
    g.fillStyle = '#3a689c'; g.fillRect(0, vy(6.38), W, vy(5.92) - vy(6.38));
    finMap = new THREE.CanvasTexture(canvas); finMap.colorSpace = THREE.SRGBColorSpace; finMap.anisotropy = 4;
  }
  const finPaint = phys({ color: finMap ? 0xffffff : 0x86b4f0, map: finMap, roughness: 0.4, metalness: 0.06, clearcoat: 0.55, clearcoatRoughness: 0.16 });
  const fin = new THREE.Mesh(K.merge(finParts), finPaint); fin.name = 'fin'; fin.castShadow = fin.receiveShadow = true; group.add(fin);
  {
    const ys = [2.27, 3.3, 4.8, 6.4, 7.08];
    const a = v3(0, ys[0], finLE(ys[0]) + (RUDDER_CUT + 0.012) * (finTE(ys[0]) - finLE(ys[0])));
    const b = v3(0, ys[4], finLE(ys[4]) + (RUDDER_CUT + 0.012) * (finTE(ys[4]) - finLE(ys[4])));
    const hg = hinge(a, b);
    const parts = finLoft(ys, RUDDER_CUT + 0.003, 1, 'rudder');
    for (const [yy, dir] of [[ys[0], -1], [ys[4], 1]]) {
      const l = finLE(yy), c = finTE(yy) - l, p = [], q = [];
      for (const t of cosSpace(RUDDER_CUT + 0.003, 1, 6)) { const h = finHalf(yy) * halfThickness(t, 0.1) / halfThickness(0.3, 0.1); p.push(v3(h, yy, l + t * c)); q.push(v3(-h, yy, l + t * c)); }
      parts.push(K.strip(p, q, v3(0, dir, 0), finUV));
    }
    const rudder = new THREE.Mesh(K.merge(parts.map(hg.toLocal)), finPaint); rudder.castShadow = true; hg.pivot.add(rudder);
    movables.rudder = hg.pivot;
  }

  // ---------------- Belly fairing, pylons, flap-track canoes ----------------
  function ovalLoft(sections, around = 28, exponent = 2) { // sections: [z, top, bottom, halfWidth, mid, cx]
    const rows = sections.map(([z, t, b, w, m, cx = 0]) => {
      const row = [];
      for (let j = 0; j < around; j++) {
        const th = j / around * TAU, c = Math.cos(th), s = Math.sin(th), e = 2 / exponent;
        const cc = Math.sign(c) * Math.abs(c) ** e, ss = Math.sign(s) * Math.abs(s) ** e;
        const R = (t - m) * (1 + c) / 2 + (m - b) * (1 - c) / 2;
        row.push(v3(cx + w * ss, m + R * cc, z));
      }
      return row;
    });
    return K.grid(rows, { closed: true, orient: 'centroid' });
  }
  {
    const zs = [-5.6, -5.0, -4.2, -3.2, -2, 0, 2, 3.6, 5.0, 6.2, 7.2];
    const fw = monotone([[-5.6, 1.7], [-4.6, 2.02], [-3.2, 2.24], [0, 2.36], [3, 2.32], [5, 2.16], [6.4, 1.88], [7.2, 1.55]]);
    const fb = monotone([[-5.6, -1.48], [-4.2, -1.62], [-2, -1.71], [2, -1.73], [4.6, -1.68], [6.2, -1.58], [7.2, -1.46]]);
    const g = ovalLoft(zs.map(z => [z, -0.15, fb(z), fw(z), -0.78]), 40, 2.6);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) { const th = Math.atan2(pos.getX(i), pos.getY(i) - 0.42); uv.setXY(i, (pos.getZ(i) + 18.6) / 37.2, ((th + TAU) % TAU) / TAU); }
    var bellyFairing = g;
  }
  const canoes = [];
  for (const side of [-1, 1]) {
    // pylon: forward over the fan cowl, aft fairing under the wing
    const pz = [-3.2, -2.6, -1.9, -1.2, -0.55, 0.1, 0.8, 1.5, 2.2, 2.75];
    const ptop = monotone([[-3.2, -0.46], [-2.4, -0.37], [-1.6, -0.25], [-1.0, -0.14], [-0.4, -0.08], [2.75, -0.18]]);
    const pbot = monotone([[-3.2, -0.5], [-1.9, -0.6], [-0.55, -0.72], [0.1, -0.97], [0.8, -0.93], [1.5, -0.8], [2.2, -0.6], [2.75, -0.36]]);
    const pw = monotone([[-3.2, 0.1], [-2.4, 0.17], [-0.5, 0.2], [1.0, 0.17], [2.2, 0.11], [2.75, 0.05]]);
    const pylon = ovalLoft(pz.map(z => [z, ptop(z), pbot(z), pw(z), (ptop(z) + pbot(z)) / 2, side * 5.65]), 20, 3);
    K.setUV(pylon, ...PLAIN_UV); staticWing.push(pylon);
    // flap-track fairings: the part behind the hinge rides with the flap
    for (const x of [3.6, 8.9, 11.7]) {
      const st = station(WING, x), lower = (t) => foilPoint(st, x, t, false, side).y;
      const z0 = st.le + 0.42 * st.chord, z1 = st.le + st.chord + 0.85, zs = [], split = st.le + 0.79 * st.chord;
      for (let k = 0; k <= 10; k++) zs.push(lerp(z0, z1, k / 10));
      const depth = (z) => { const s = (z - z0) / (z1 - z0); return 0.36 * Math.sin(Math.PI * Math.pow(s, 0.75)) + 0.02; };
      const sec = (z) => { const t = clamp((z - st.le) / st.chord, 0, 1), y0 = t < 1 ? lower(t) : lower(1) - (z - st.le - st.chord) * 0.02; return [z, y0 + 0.06, y0 - depth(z), 0.15 * Math.sin(Math.PI * Math.pow((z - z0) / (z1 - z0), 0.6)) + 0.01, y0 - depth(z) * 0.45, side * x]; };
      const front = ovalLoft(zs.filter(z => z <= split + 1e-6).concat([split]).map(sec), 14, 2.4);
      const back = ovalLoft([split, ...zs.filter(z => z > split)].map(sec), 14, 2.4);
      K.setUV(front, ...PLAIN_UV); K.setUV(back, ...PLAIN_UV); staticWing.push(front);
      const flap = movables.flaps.find(f => f.side === side && x >= f.span[0] && x <= f.span[1]);
      canoes.push({ flap, geometry: back });
    }
  }
  for (const flap of movables.flaps) {
    const mine = canoes.filter(c => c.flap === flap).map(c => flap.hinge.toLocal(c.geometry));
    if (mine.length) { const m = new THREE.Mesh(K.merge(mine), wingGrey); m.castShadow = true; flap.pivot.add(m); }
  }
  { const m = new THREE.Mesh(bellyFairing, paint); m.name = 'belly fairing'; m.castShadow = m.receiveShadow = true; group.add(m); }
  const wings = new THREE.Mesh(K.merge(staticWing), wingGrey); wings.name = 'wings'; wings.castShadow = wings.receiveShadow = true; group.add(wings);

  // ---------------- Engines (high-bypass nacelles) ----------------
  const ink = phys({ color: 0x1e3550, roughness: 0.36, metalness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.14 }); // ink-navy nacelles
  const lipMetal = std({ color: 0xd2d8dc, roughness: 0.2, metalness: 1, envMapIntensity: 1.1 });
  const engineMetal = std({ color: 0x5d646b, roughness: 0.42, metalness: 0.75 });
  const darkMetal = std({ color: 0x23282e, roughness: 0.5, metalness: 0.6 });
  finish.apply(lipMetal, 'brushed', { repeat: [2, 12], bumpScale: 0.00004 });
  finish.apply(engineMetal, 'brushed', { repeat: [3, 6], bumpScale: 0.00015 });
  finish.apply(darkMetal, 'brushed', { repeat: [2, 8], bumpScale: 0.0002 });
  if (isBrowser) {
    const [canvas, g] = canvas2d(1024, 256);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 256);
    g.strokeStyle = 'rgba(25,42,55,0.38)'; g.lineWidth = 1.5;
    for (const x of [120, 510, 825]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (const y of [45, 95, 162, 212]) { g.beginPath(); g.moveTo(135, y); g.lineTo(815, y); g.stroke(); }
    g.fillStyle = '#c4ced7'; g.font = '600 12px Arial';
    for (const y of [67, 190]) { g.fillText('NO STEP', 475, y); g.strokeRect(250, y - 10, 55, 21); }
    g.fillStyle = 'rgba(50,64,76,0.32)';
    for (const x of [126, 504, 831]) for (let y = 5; y < 256; y += 13) g.fillRect(x, y, 1.2, 1.2);
    ink.map = new THREE.CanvasTexture(canvas); ink.map.colorSpace = THREE.SRGBColorSpace; ink.map.anisotropy = 4;
    finish.relief(ink, { bumpScale: 0.006 });
  }
  const inkParts = [], lipParts = [], engineMetalParts = [], darkMetalParts = [], engineFans = [];
  let fanMat = null, spinMat = null, faceMat = null;
  const SEG = 48;
  for (const side of [-1, 1]) {
    const cx = side * 5.65, cy = -1.61;
    const L = (profile, segments = SEG, orient = 1) => K.lathe(profile, segments, { orient, cx, cy });
    // cowl: from the lip's outer shoulder to the fan nozzle exit, then a short inner wall
    inkParts.push(L([[-4.12, 1.115], [-3.85, 1.155], [-3.4, 1.183], [-2.8, 1.19], [-2.1, 1.165], [-1.45, 1.1], [-0.95, 1.02], [-0.58, 0.955], [-0.55, 0.94]]));
    darkMetalParts.push(L([[-0.55, 0.94], [-0.6, 0.905], [-0.95, 0.9]], SEG, -1));
    // intake lip (polished), from the inner throat round to the outer shoulder
    lipParts.push(L([[-3.98, 0.925], [-4.14, 0.94], [-4.25, 0.965], [-4.31, 1.0], [-4.32, 1.035], [-4.3, 1.07], [-4.24, 1.095], [-4.12, 1.115]]));
    // inlet duct down to the fan face (inner wall, normals toward the axis)
    engineMetalParts.push(L([[-3.98, 0.925], [-3.75, 0.905], [-3.5, 0.9]], SEG, -1));
    // core cowl, core nozzle, exhaust plug
    engineMetalParts.push(L([[-1.05, 0.79], [-0.6, 0.77], [-0.2, 0.71], [0.15, 0.62], [0.42, 0.53], [0.47, 0.515]]));
    darkMetalParts.push(L([[0.47, 0.515], [0.44, 0.47], [0.2, 0.47]], 32, -1));
    darkMetalParts.push(L([[0.15, 0.42], [0.45, 0.4], [0.75, 0.31], [1.0, 0.17], [1.12, 0.06], [1.15, 0.0]], 32));
    // bypass duct floor seen through the fan nozzle
    darkParts.push(K.placed(new THREE.RingGeometry(0.76, 0.93, SEG, 1), v3(cx, cy, -1.0)));
    // fan: wide-chord swept blades, spinner with a white swirl
    const fan = new THREE.Group(); fan.position.set(cx, cy, -3.58); group.add(fan); engineFans.push(fan);
    const bladePositions = [], bladeIndices = [];
    const BLADES = 18;
    for (let b = 0; b < BLADES; b++) {
      const phi0 = b / BLADES * TAU, start = bladePositions.length / 3, spans = 5;
      for (let i = 0; i <= spans; i++) {
        const r = lerp(0.3, 0.885, i / spans), stagger = lerp(0.55, 1.12, i / spans), chord = lerp(0.3, 0.44, i / spans), sweep = 0.06 * (i / spans) ** 2;
        for (const c of [-0.5, 0, 0.5]) {
          const phi = phi0 + (c * chord * Math.sin(stagger)) / r, z = -c * chord * Math.cos(stagger) - sweep + (c === 0 ? -0.025 : 0);
          bladePositions.push(Math.cos(phi) * r, Math.sin(phi) * r, z);
        }
        if (i < spans) { const a = start + i * 3; for (const k of [0, 1]) bladeIndices.push(a + k, a + k + 3, a + k + 1, a + k + 1, a + k + 3, a + k + 4); }
      }
    }
    const blades = new THREE.Mesh(K.build(bladePositions, null, null, bladeIndices), engineFanMaterial()); fan.add(blades);
    const spinner = new THREE.Mesh(K.lathe([[-0.42, 0.0], [-0.4, 0.06], [-0.33, 0.15], [-0.22, 0.24], [-0.08, 0.3], [0.08, 0.32]], 32, { orient: 1, uv: (i, j) => [j / 32, i / 5] }), spinnerMaterial());
    fan.add(spinner);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 36), darkFace()); disc.position.z = 0.16; disc.rotation.y = Math.PI; fan.add(disc);
  }
  function engineFanMaterial() { return fanMat || (fanMat = std({ color: 0x3e454d, roughness: 0.32, metalness: 0.85, side: THREE.DoubleSide })); }
  function darkFace() { return faceMat || (faceMat = new THREE.MeshStandardMaterial({ color: 0x0c1116, roughness: 0.9 })); }
  function spinnerMaterial() {
    if (spinMat) return spinMat;
    let map = null;
    if (isBrowser) { // dark spinner with a white spiral (visible when it turns)
      const [canvas, g] = canvas2d(128, 128); g.fillStyle = '#2b3238'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#e8edf0'; g.lineWidth = 9; g.beginPath();
      for (let y = 0; y <= 128; y += 4) { const x = (y / 128) * 70 + 10; if (y) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    }
    return (spinMat = std({ color: 0xffffff, map, roughness: 0.3, metalness: 0.6 }));
  }
  const addMerged = (parts, material, name, shadow = true) => {
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(K.merge(parts), material); mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = shadow; group.add(mesh); return mesh;
  };
  addMerged(inkParts, ink, 'nacelles');
  addMerged(lipParts, lipMetal, 'intake lips');
  addMerged(engineMetalParts, engineMetal, 'engine cores');
  addMerged(tealParts, teal, 'sharklet tips');

  // ---------------- APU exhaust, antennas, probes ----------------
  darkMetalParts.push(K.rod(v3(0, 1.15, 18.4), v3(0, 1.15, 18.62), 0.17, 0.16, 20, true));
  darkParts.push(K.placed(new THREE.CircleGeometry(0.16, 20), v3(0, 1.15, 18.62)));
  const smallParts = [];
  const blade = (x, y, z, h, len, down = false) => { // swept blade antenna
    const s = down ? -1 : 1, pts = [[0, 0], [len, 0], [len * 0.72, h], [len * 0.42, h]];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 0.03, bevelEnabled: false });
    g.translate(0, 0, -0.015); g.rotateY(-Math.PI / 2); if (down) g.rotateZ(Math.PI);
    return K.placed(g, v3(x, y, z));
  };
  smallParts.push(blade(0, 2.35, -7.4, 0.32, 0.5), blade(0, 2.35, 4.2, 0.24, 0.42), blade(0, -1.68, -9.5, 0.3, 0.45, true), blade(0, -1.71, 4.9, 0.22, 0.4, true));
  smallParts.push(K.placed(new THREE.SphereGeometry(0.42, 16, 6, 0, TAU, 0, Math.PI / 2), v3(0, 2.33, 6.4), null, v3(0.8, 0.22, 1.5))); // satcom fairing
  for (const side of [-1, 1]) { // pitot probes and AoA vanes on the nose
    const th = thetaAt(-15.9, 0.55, side), p = surfaceAt(-15.9, th, 0), n = fuselageNormal(-15.9, th);
    smallParts.push(K.rod(p, p.clone().add(n.clone().multiplyScalar(0.14)), 0.02, 0.02, 6), K.rod(p.clone().add(n.clone().multiplyScalar(0.12)), p.clone().add(n.clone().multiplyScalar(0.12)).add(v3(0, 0, -0.16)), 0.014, 0.009, 6));
    const th2 = thetaAt(-15.2, 0.15, side), q = surfaceAt(-15.2, th2, 0), n2 = fuselageNormal(-15.2, th2);
    smallParts.push(K.rod(q, q.clone().add(n2.clone().multiplyScalar(0.09)), 0.012, 0.012, 5));
  }
  smallParts.forEach(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 2).fill(0), 2)); });
  addMerged(smallParts.map(g => g.index ? g : (g.setIndex([...Array(g.attributes.position.count).keys()]), g)), std({ color: 0x9aa5ad, roughness: 0.4, metalness: 0.6 }), 'antennas');

  // ---------------- Landing gear ----------------
  const gearPaint = std({ color: 0xd9dde0, roughness: 0.45, metalness: 0.35 });
  const chrome = std({ color: 0xe6ebee, roughness: 0.12, metalness: 1, envMapIntensity: 1.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.88, metalness: 0 });
  const hubMaterial = std({ color: 0xb8bfc4, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
  finish.apply(chrome, 'brushed', { bumpScale: 0.00002 });
  finish.apply(rubber, 'rubber', { repeat: [1, 8], bumpScale: 0.007 });
  const gears = [], wheelSets = [];
  // tyre: lathe around x (axle). Profile in (axial offset, radius).
  function tyre(radius, width) {
    const prof = [[-0.36, 0.62], [-0.47, 0.68], [-0.5, 0.78], [-0.48, 0.9], [-0.4, 0.97], [-0.22, 1.0], [0.22, 1.0], [0.4, 0.97], [0.48, 0.9], [0.5, 0.78], [0.47, 0.68], [0.36, 0.62]].map(([a, r]) => [a * width, r * radius]);
    const g = K.lathe(prof, 28, { orient: 1 }); g.rotateY(Math.PI / 2); return g;
  }
  function hub(radius, width, outer) {
    const prof = [[0.36, 0.0], [0.4, 0.18], [0.38, 0.3], [0.44, 0.42], [0.45, 0.6], [0.36, 0.63]].map(([a, r]) => [a * width * outer, r * radius]);
    const g = K.lathe(prof, 20, { orient: 1 }); g.rotateY(Math.PI / 2); return g;
  }
  function wheelSet(parent, positions, radius, width, axleY, axleZ) {
    const set = new THREE.Group(); set.position.set(0, axleY, axleZ); parent.add(set);
    const tyres = [], hubs = [];
    for (const x of positions) {
      tyres.push(K.placed(tyre(radius, width), v3(x, 0, 0)));
      const outer = Math.sign(x) || 1;
      hubs.push(K.placed(hub(radius, width, outer), v3(x, 0, 0)));
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * TAU, y = Math.cos(angle) * radius * 0.32, z = Math.sin(angle) * radius * 0.32;
        hubs.push(K.rod(v3(x + width * 0.42 * outer, y, z), v3(x + width * 0.49 * outer, y, z), radius * 0.022, radius * 0.022, 6));
      }
    }
    const t = new THREE.Mesh(K.merge(tyres), rubber), h = new THREE.Mesh(K.merge(hubs), hubMaterial);
    t.castShadow = h.castShadow = true; set.add(t, h); wheelSets.push({ set, radius }); return set;
  }
  for (const side of [-1, 1]) {
    const gear = new THREE.Group(); gear.position.set(side * 3.22, -1.03, 2.75); group.add(gear);
    const strut = [], shiny = [];
    strut.push(K.rod(v3(0, 0.62, 0), v3(0, -1.75, 0), 0.14, 0.13, 14));
    shiny.push(K.rod(v3(0, -1.6, 0), v3(0, -2.36, 0), 0.085, 0.085, 12));
    strut.push(K.rod(v3(0, -2.3, -0.06), v3(0, -2.5, 0.06), 0.1, 0.1, 10)); // axle bogie block
    strut.push(K.rod(v3(-0.5, -2.42, 0), v3(0.5, -2.42, 0), 0.075, 0.075, 10));
    strut.push(K.rod(v3(0, 0.25, -0.95), v3(0, -1.55, -0.02), 0.06, 0.05, 8)); // drag brace
    strut.push(K.rod(v3(-side * 1.0, 0.45, 0.15), v3(0, -1.25, 0.02), 0.055, 0.05, 8)); // side stay
    strut.push(K.box(0, -1.85, -0.17, 0.05, 0.3, 0.06, 0.5, 0, 0), K.box(0, -2.12, -0.17, 0.05, 0.3, 0.06, -0.5, 0, 0)); // torque links
    const legDoor = K.box(side * 0.2, -0.55, 0.02, 0.045, 1.55, 0.62); K.setUV(legDoor, ...PLAIN_UV);
    const sm = new THREE.Mesh(K.merge(strut), gearPaint), cm = new THREE.Mesh(K.merge(shiny), chrome), dm = new THREE.Mesh(legDoor, wingGrey);
    sm.castShadow = cm.castShadow = dm.castShadow = true; gear.add(sm, cm, dm);
    const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(0.12, 0.1, -0.18), v3(0.17, -1.5, -0.22), v3(0.14, -2.2, -0.3), v3(0.23, -2.42, -0.19)]), 15, 0.013, 6, false);
    const brakes = new THREE.Mesh(K.merge([hose, K.box(-0.15, -2.25, -0.26, 0.11, 0.22, 0.16), K.box(0.15, -2.25, -0.26, 0.11, 0.22, 0.16)]), darkMetal); gear.add(brakes);
    wheelSet(gear, [-0.3, 0.3], 0.55, 0.36, -2.42, 0);
    gears.push({ group: gear, side, nose: false });
  }
  const noseGear = new THREE.Group(); noseGear.position.set(0, -0.78, -13.56); group.add(noseGear);
  {
    const strut = [], shiny = [];
    strut.push(K.rod(v3(0, 0.3, 0), v3(0, -1.95, 0), 0.1, 0.095, 12));
    shiny.push(K.rod(v3(0, -1.8, 0), v3(0, -2.72, 0), 0.065, 0.065, 10));
    strut.push(K.rod(v3(-0.27, -2.84, 0), v3(0.27, -2.84, 0), 0.05, 0.05, 8));
    strut.push(K.rod(v3(0, -2.65, 0), v3(0, -2.9, 0.03), 0.07, 0.07, 8));
    strut.push(K.rod(v3(0, 0.05, -1.0), v3(0, -1.45, -0.02), 0.045, 0.04, 8)); // drag strut (forward)
    strut.push(K.box(0, -2.1, -0.13, 0.04, 0.24, 0.05, 0.5, 0, 0), K.box(0, -2.34, -0.13, 0.04, 0.24, 0.05, -0.5, 0, 0));
    const door = K.box(0, -0.62, 0.13, 0.5, 0.75, 0.035); K.setUV(door, 0.5, 0.5);
    const sm = new THREE.Mesh(K.merge(strut), gearPaint), cm = new THREE.Mesh(K.merge(shiny), chrome), dm = new THREE.Mesh(door, paint);
    sm.castShadow = cm.castShadow = dm.castShadow = true; noseGear.add(sm, cm, dm);
    wheelSet(noseGear, [-0.195, 0.195], 0.38, 0.26, -2.84, 0);
    gears.push({ group: noseGear, side: 0, nose: true });
  }
  // nose-gear bay doors (long doors hinged at their outer edges) and the dark bay behind them
  const noseDoors = [];
  for (const side of [-1, 1]) {
    const z0 = -16.5, z1 = -13.25, th0 = Math.PI - side * 0.012, th1 = Math.PI - side * 0.235; // from the keel line out to the hinge edge
    const ends = [surfaceAt(z0, th1, 0.012), surfaceAt(z1, th1, 0.012)];
    const hg = hinge(ends[0], ends[1], group, false);
    const outer = surfacePatch([[z0, th0], [z1, th0], [z1, th1], [z0, th1]], 0.012, 6, 3);
    orientOutward(outer, 0.3);
    const inner = surfacePatch([[z0, th0], [z1, th0], [z1, th1], [z0, th1]], -0.02, 6, 3);
    orientOutward(inner, 0.3); K.flipGeometry(inner);
    const door = K.merge([outer, inner]); const uv = door.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.13, 0.5);
    const mesh = new THREE.Mesh(hg.toLocal(door), paint); mesh.castShadow = true; hg.pivot.add(mesh);
    noseDoors.push({ pivot: hg.pivot, sign: side * Math.sign(hg.dir.z) });
  }
  const bayParts = [];
  { const z0 = -16.5, z1 = -13.25; bayParts.push(surfacePatch([[z0, Math.PI - 0.2], [z1, Math.PI - 0.2], [z1, Math.PI + 0.2], [z0, Math.PI + 0.2]].map(([z, th]) => [z, th]), 0.004, 4, 2)); }
  for (const side of [-1, 1]) { // main wheel wells in the fairing underside
    const g = new THREE.CircleGeometry(0.62, 20); g.rotateX(Math.PI / 2); bayParts.push(K.placed(g, v3(side * 0.95, -1.738, 2.75), null, v3(1.3, 1, 1.05)));
  }
  const bays = new THREE.Mesh(K.merge(bayParts.map(g => g.index ? g : (g.setIndex([...Array(g.attributes.position.count).keys()]), g))), new THREE.MeshStandardMaterial({ color: 0x0d1318, roughness: 0.95, side: THREE.DoubleSide }));
  bays.name = 'gear bays'; group.add(bays);

  addMerged(darkParts.map(g => g.index ? g : (g.setIndex([...Array(g.attributes.position.count).keys()]), g)), frameDark, 'window frames and ducts', false);
  addMerged(darkMetalParts, darkMetal, 'exhaust');

  // ---------------- Lights ----------------
  const navParts = [], strobeParts = [], beaconParts = [], landingParts = [];
  const bulb = (list, color, x, y, z, r = 0.07) => list.push(K.colorize(K.placed(new THREE.SphereGeometry(r, 10, 6), v3(x, y, z)), color));
  for (const side of [-1, 1]) {
    bulb(navParts, side < 0 ? 0xff263e : 0x2bffad, side * 17.72, 0.99, 5.66, 0.08);
    bulb(strobeParts, 0xf1f8ff, side * 17.86, 0.99, 7.52, 0.07);
    bulb(landingParts, 0xfff0d2, side * 2.55, -0.42, -2.86, 0.09);
  }
  bulb(navParts, 0xe6f2ff, 0, 1.36, 18.62, 0.06);
  bulb(beaconParts, 0xff263e, 0, 2.43, 2.0, 0.09); bulb(beaconParts, 0xff263e, 0, -1.79, 2.0, 0.09);
  const lightMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lightMesh = (parts, name) => { const m = new THREE.Mesh(K.merge(parts), lightMaterial); m.name = name; group.add(m); return m; };
  const navMesh = lightMesh([...navParts, ...landingParts], 'nav lights'), strobeMesh = lightMesh(strobeParts, 'strobes'), beaconMesh = lightMesh(beaconParts, 'beacons');
  // soft glows (one Points object per light group)
  let glowTexture = null;
  if (isBrowser) {
    const [canvas, g] = canvas2d(64, 64), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64); glowTexture = new THREE.CanvasTexture(canvas);
  }
  function glow(points, size, opacity) {
    const positions = [], colors = [];
    for (const [x, y, z, color] of points) { positions.push(x, y, z); const c = new THREE.Color(color); colors.push(c.r, c.g, c.b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTexture, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false }));
    p.frustumCulled = false; group.add(p); return p;
  }
  const navGlow = glow([[-17.72, 0.99, 5.66, 0xff2a40], [17.72, 0.99, 5.66, 0x2bffad], [0, 1.36, 18.62, 0xe6f2ff]], 1.1, 0.75);
  const strobeGlow = glow([[-17.86, 0.99, 7.52, 0xf4f9ff], [17.86, 0.99, 7.52, 0xf4f9ff]], 3.2, 1);
  const beaconGlow = glow([[0, 2.43, 2.0, 0xff3040], [0, -1.79, 2.0, 0xff3040]], 1.6, 0.9);
  const reflectScene = sceneEnvironmentBinding(group, env);

  // ---------------- Animation ----------------
  let gearExtension = 1, flapExtension = 0, spoilerExtension = 0, elapsed = 0;
  function update(state = {}, data = {}) {
    reflectScene();
    const dt = clamp(data.dt ?? state.dt ?? 1 / 60, 0, 0.1); elapsed += dt;
    const gearValue = data.gear ?? state.gear ?? true;
    const targetGear = typeof gearValue === 'number' ? clamp(gearValue, 0, 1) : (gearValue ? 1 : 0);
    const actualGear = data.gearPosition ?? state.gearPosition;
    gearExtension = typeof actualGear === 'number' ? clamp(actualGear, 0, 1) : gearExtension + clamp(targetGear - gearExtension, -dt * 0.35, dt * 0.35);
    const targetFlaps = clamp(data.flaps ?? state.flaps ?? 0, 0, 3);
    const actualFlaps = data.flapPosition ?? state.flapPosition;
    flapExtension = typeof actualFlaps === 'number' ? clamp(actualFlaps, 0, 3) : flapExtension + clamp(targetFlaps - flapExtension, -dt * 0.8, dt * 0.8);
    for (const gear of gears) {
      gear.group.visible = gearExtension > 0.03;
      if (gear.nose) gear.group.rotation.x = (1 - gearExtension) * 1.45; // nose gear folds forward
      else gear.group.rotation.z = gear.side * -(1 - gearExtension) * 1.43; // main gear folds inward
    }
    // the long nose-gear doors open for the transit only (like the real thing); the small leg door stays with the strut
    const doorOpen = smooth(gearExtension / 0.12) * (1 - smooth((gearExtension - 0.86) / 0.12));
    for (const door of noseDoors) door.pivot.rotation.x = door.sign * doorOpen * 1.45;
    bays.visible = gearExtension > 0.03;
    const speed = data.groundSpeed ?? state.speed ?? 0;
    for (const { set, radius } of wheelSets) set.rotation.x -= speed * dt / radius;
    for (const flap of movables.flaps) flap.pivot.rotation.x = flapExtension / 3 * 0.56;
    const spoilerValue = data.spoilers ?? state.spoilers ?? false;
    const spoilerTarget = typeof spoilerValue === 'number' ? clamp(spoilerValue, 0, 1) : Number(spoilerValue);
    spoilerExtension += clamp(spoilerTarget - spoilerExtension, -dt * 2.5, dt * 2.5);
    for (const spoiler of movables.spoilers) spoiler.pivot.rotation.x = -spoilerExtension * 0.82;
    const roll = clamp(state.rollInput ?? data.rollInput ?? 0, -1, 1);
    for (const aileron of movables.ailerons) aileron.pivot.rotation.x = -roll * aileron.side * 0.3; // right roll: right aileron up
    const pitch = clamp(state.pitchInput ?? data.pitchInput ?? 0, -1, 1);
    for (const elevator of movables.elevators) elevator.pivot.rotation.x = -pitch * 0.32; // pull: trailing edges up
    const yaw = clamp(state.yawInput ?? data.yawInput ?? 0, -1, 1);
    noseGear.rotation.y = data.onGround ? -yaw * 0.42 * clamp(1 - speed / 55, 0, 1) : 0;
    movables.rudder.rotation.x = yaw * 0.3; // right yaw: trailing edge to the right
    const engine = data.engine ?? state.engine ?? data.throttle ?? state.throttle ?? 0;
    const n1 = data.engineN1 ?? (state.crashed || state.fuel === 0 ? 0 : 20 + engine * 80);
    for (const fan of engineFans) fan.rotation.z += dt * Math.max(0, n1) * 0.57;
    const lights = data.lights ?? true;
    navMesh.visible = navGlow.visible = lights;
    beaconMesh.visible = beaconGlow.visible = lights && elapsed % 1.3 < 0.14;
    strobeMesh.visible = strobeGlow.visible = lights && (elapsed % 1.1 < 0.065 || (elapsed % 1.1 > 0.15 && elapsed % 1.1 < 0.21));
  }
  update({}, {});
  return { group, update, dispose: () => { disposeObject(group); finish.dispose(); env?.dispose(); } };
}

// =====================================================================================================
// Two-crew glass cockpit seen from the captain's seat. Add the returned Group to the camera (the eye sits at the
// group origin, -Z forward) and hide the exterior model in pilot view. The Group also carries
// .update(state, data) and .dispose(). Options: headingOffset (deg added to the runway-frame heading, e.g. the
// runway bearing) and altitudeOffset (m added to the local altitude, e.g. field elevation), so the displays read
// like the game's HTML instruments. If state.lookYaw / state.lookPitch are passed, the cockpit counter-rotates
// so it stays fixed to the airframe while the pilot looks around.
const KT = 1.943844, FT = 3.28084, DEG = Math.PI / 180;
const wrap360 = (v) => ((v % 360) + 360) % 360;
const angleDiff = (a, b) => ((a - b + 540) % 360) - 180;
const C = { green: '#3df26e', cyan: '#33dcff', magenta: '#ff5cf4', amber: '#ffb420', white: '#f4f7f8', red: '#ff3b30', yellow: '#ffe83a', grey: '#5d666e', tape: '#3a4148' };

function txt(g, s, x, y, size, color = C.white, align = 'center', weight = 700, base = 'middle') {
  g.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`; g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(String(s), x, y);
}
function line(g, x1, y1, x2, y2, color = C.white, width = 2) { g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function poly(g, pts, fill, stroke, width = 2) {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

// ---------- live display pages (512 x 512 unless noted); big type so they read at a glance ----------
function drawPFD(g, v) {
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  // flight mode annunciator
  for (const x of [102, 204, 306, 408]) line(g, x, 6, x, 56, '#4b5257', 2);
  // FMA columns: A/THR mode | vertical | lateral | approach capability | engagement status
  if (v.ap) txt(g, 'SPEED', 51, 22, 22, C.green); else { txt(g, 'MAN', 51, 18, 20, C.white); txt(g, 'THR', 51, 40, 20, C.white); }
  const capture = v.ap && v.ils;
  txt(g, capture ? 'G/S' : v.ap ? 'ALT' : '', 153, 22, 22, C.green); txt(g, capture ? 'LOC' : v.ap ? 'HDG' : '', 255, 22, 22, C.green);
  if (!v.ap && v.ils) { txt(g, 'G/S', 153, 44, 20, C.cyan); txt(g, 'LOC', 255, 44, 20, C.cyan); }
  if (capture) { txt(g, 'CAT 3', 357, 18, 19, C.white); txt(g, 'DUAL', 357, 40, 19, C.white); }
  txt(g, v.ap ? 'AP1' : '', 460, 12, 18, C.white); txt(g, '1 FD 2', 460, 29, 16, C.white); if (v.ap) txt(g, 'A/THR', 460, 45, 15, C.white);
  // attitude sphere
  const cx = 252, cy = 248, ppd = 6.4;
  g.save(); rrect(g, 142, 66, 220, 344, 34); g.clip();
  g.translate(cx, cy); g.rotate(-v.roll * DEG); g.translate(0, v.pitch * ppd);
  g.fillStyle = '#1f8fe0'; g.fillRect(-400, -900, 800, 900); g.fillStyle = '#8b5422'; g.fillRect(-400, 0, 800, 900);
  line(g, -400, 0, 400, 0, C.white, 3);
  for (let a = -30; a <= 30; a += 2.5) {
    if (!a) continue; const y = -a * ppd, major = a % 10 === 0, mid = a % 5 === 0, w = major ? 48 : mid ? 26 : 12;
    if (Math.abs(a - v.pitch) > 22) continue;
    line(g, -w, y, w, y, C.white, major ? 3 : 2);
    if (major) { txt(g, Math.abs(a), -w - 20, y, 22); txt(g, Math.abs(a), w + 20, y, 22); }
  }
  g.restore();
  // roll scale (fixed) and roll index (moving)
  g.save(); g.translate(cx, cy);
  for (const b of [-45, -30, -20, -10, 0, 10, 20, 30, 45]) {
    const a = (b - 90) * DEG, r0 = 150, r1 = b % 30 === 0 || Math.abs(b) === 45 ? 168 : 160;
    if (b) line(g, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, C.white, 3);
  }
  poly(g, [[0, -150], [-10, -166], [10, -166]], C.yellow);
  g.rotate(-v.roll * DEG); poly(g, [[0, -148], [-11, -132], [11, -132]], null, C.yellow, 3);
  const slip = clamp(v.slip / 6, -1, 1) * 18; poly(g, [[slip - 13, -128], [slip + 13, -128], [slip + 16, -120], [slip - 16, -120]], null, C.yellow, 2.5);
  g.restore();
  // aircraft symbol
  for (const s of [-1, 1]) poly(g, [[cx + s * 92, cy - 5], [cx + s * 38, cy - 5], [cx + s * 38, cy + 18], [cx + s * 30, cy + 18], [cx + s * 30, cy + 5], [cx + s * 92, cy + 5]], '#000', C.yellow, 3);
  g.fillStyle = '#000'; g.fillRect(cx - 7, cy - 7, 14, 14); g.strokeStyle = C.yellow; g.lineWidth = 3; g.strokeRect(cx - 7, cy - 7, 14, 14);
  // speed tape
  g.save(); g.beginPath(); g.rect(14, 66, 92, 344); g.clip(); g.fillStyle = C.tape; g.fillRect(14, 66, 92, 344);
  const kpx = 3.3;
  for (let s = Math.floor((v.ias - 60) / 10) * 10; s <= v.ias + 60; s += 10) {
    if (s < 30) continue; const y = cy - (s - v.ias) * kpx; line(g, 92, y, 106, y, C.white, 3);
    if (s % 20 === 0) txt(g, String(s).padStart(3, '0'), 54, y, 30);
  }
  if (v.vs1 > 0) { // amber VLS strip and red/black alpha-max barber
    const vls = cy - (v.vs1 * 1.23 - v.ias) * kpx, vmin = cy - (v.vs1 - v.ias) * kpx;
    g.fillStyle = C.amber; g.fillRect(96, vls, 6, Math.max(0, vmin - vls));
    for (let y = vmin; y < 420; y += 16) { g.fillStyle = C.red; g.fillRect(96, y, 9, 9); }
  }
  if (v.overspeed) for (let y = 60; y < cy - 10; y += 16) { g.fillStyle = C.red; g.fillRect(96, y, 9, 9); }
  const sel = cy - (v.apSpeed - v.ias) * kpx;
  if (sel > 70 && sel < 406) poly(g, [[106, sel], [92, sel - 11], [92, sel + 11]], C.cyan);
  g.restore();
  if (sel <= 70) txt(g, Math.round(v.apSpeed), 60, 62, 24, C.cyan); else if (sel >= 406) txt(g, Math.round(v.apSpeed), 60, 432, 24, C.cyan);
  // trend arrow and speed reference
  if (Math.abs(v.trend) > 2) { const ty = cy - v.trend * kpx; line(g, 112, cy, 112, ty, C.yellow, 3); poly(g, [[112, ty], [105, ty + Math.sign(v.trend) * 10], [119, ty + Math.sign(v.trend) * 10]], C.yellow); }
  line(g, 6, cy, 110, cy, C.yellow, 4); poly(g, [[106, cy], [124, cy - 10], [124, cy + 10]], C.yellow);
  // altitude tape
  g.save(); g.beginPath(); g.rect(392, 66, 74, 344); g.clip(); g.fillStyle = C.tape; g.fillRect(392, 66, 74, 344);
  const fpx = 0.34;
  for (let a = Math.floor((v.alt - 600) / 100) * 100; a <= v.alt + 600; a += 100) {
    const y = cy - (a - v.alt) * fpx; line(g, 392, y, a % 500 === 0 ? 410 : 402, y, C.white, 3);
    if (a % 500 === 0) txt(g, String(Math.round(a / 100)).padStart(2, '0'), 440, y, 28);
  }
  if (v.ra < 2000) { const gy = cy + (v.ra) * fpx; g.fillStyle = '#d02a1a'; g.fillRect(392, gy, 12, 500); }
  const ay = cy - (v.apAlt - v.alt) * fpx;
  if (ay > 70 && ay < 406) { g.strokeStyle = C.cyan; g.lineWidth = 3; g.strokeRect(394, ay - 16, 70, 32); }
  g.restore();
  if (ay <= 70) txt(g, Math.round(v.apAlt), 430, 61, 19, C.cyan); else if (ay >= 406) txt(g, Math.round(v.apAlt), 430, 434, 22, C.cyan);
  // altitude window
  poly(g, [[380, cy], [392, cy - 24], [470, cy - 24], [470, cy + 24], [392, cy + 24]], '#000', C.yellow, 3);
  txt(g, Math.round(v.alt / 20) * 20, 429, cy + 1, 30, C.green);
  // vertical speed
  poly(g, [[474, 96], [500, 96], [510, 150], [510, 346], [500, 400], [474, 400]], '#2c3237');
  const vsY = (f) => cy - Math.sign(f) * (Math.min(Math.abs(f), 2000) / 2000 * 112 + Math.max(0, Math.min(Math.abs(f), 6000) - 2000) / 4000 * 36);
  for (const f of [-6000, -2000, -1000, 0, 1000, 2000, 6000]) { const y = vsY(f); line(g, 474, y, f ? 484 : 492, y, C.white, 2); }
  const vy = vsY(v.vs); line(g, 510, cy + (vy - cy) * 0.15, 476, vy, Math.abs(v.vs) > 6000 ? C.amber : C.green, 4);
  if (Math.abs(v.vs) > 200) { const t = Math.round(Math.abs(v.vs) / 100); g.fillStyle = '#000'; g.fillRect(468, vy + (v.vs > 0 ? -30 : 6), 44, 24); txt(g, String(t).padStart(2, '0'), 490, vy + (v.vs > 0 ? -18 : 18), 22, C.green); }
  // heading tape
  g.save(); g.beginPath(); g.rect(142, 438, 220, 52); g.clip(); g.fillStyle = C.tape; g.fillRect(142, 438, 220, 52);
  const hpx = 7;
  for (let h = Math.floor((v.hdg - 20) / 5) * 5; h <= v.hdg + 20; h += 5) {
    const x = cx + angleDiff(h, v.hdg) * hpx; line(g, x, 438, x, h % 10 === 0 ? 454 : 447, C.white, 3);
    if (h % 10 === 0) txt(g, String(Math.round(wrap360(h) / 10) % 36).padStart(2, '0'), x, 472, 24);
  }
  const tx = cx + angleDiff(v.trk, v.hdg) * hpx; poly(g, [[tx, 440], [tx - 7, 449], [tx, 458], [tx + 7, 449]], null, C.green, 3);
  if (v.ils) { const x = cx + angleDiff(v.course, v.hdg) * hpx; line(g, x, 438, x, 462, C.magenta, 4); }
  const hx = cx + angleDiff(v.apHdg, v.hdg) * hpx; poly(g, [[hx, 440], [hx - 9, 430], [hx + 9, 430]], C.cyan);
  g.restore();
  line(g, cx, 426, cx, 452, C.yellow, 4);
  // ILS deviation scales
  if (v.ils) {
    for (const k of [-2, -1, 1, 2]) { g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.arc(cx + k * 34, 398, 5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(374, cy + k * 34, 5, 0, Math.PI * 2); g.stroke(); }
    const lx = cx - clamp(v.loc / 0.8, -2.3, 2.3) * 34, gy = cy + clamp(v.gs / 0.35, -2.3, 2.3) * 34;
    poly(g, [[lx, 386], [lx + 12, 398], [lx, 410], [lx - 12, 398]], C.magenta);
    poly(g, [[374, gy - 12], [386, gy], [374, gy + 12], [362, gy]], C.magenta);
    txt(g, `ILS${v.ident}`, 14, 456, 22, C.magenta, 'left'); txt(g, `${v.dme.toFixed(1)}NM`, 14, 482, 20, C.magenta, 'left');
  }
  if (v.ra < 2500) txt(g, Math.round(v.ra / 10) * 10, cx, 372, 30, v.ra < 200 ? C.amber : C.green);
  txt(g, 'QNH', 436, 468, 18, C.cyan); txt(g, '1013', 436, 492, 22, C.cyan);
  if (v.stall && v.blink) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(186, 96, 132, 40); txt(g, 'STALL', cx, 116, 32, C.red); }
}

function drawND(g, v) {
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  const range = v.dme < 4 ? 5 : v.dme < 9 ? 10 : v.dme < 18 ? 20 : 40; // auto range on approach
  const cx = 256, cy = 436, R = 330, nmPx = R / range;
  // runway and extended centreline from the aircraft's runway-frame position
  if (v.rwy) {
    const h = v.hdgLocal * DEG, toScreen = (dx, dz) => { const m = 1 / 1852; const fwd = (dx * Math.sin(h) - dz * Math.cos(h)) * m, right = (dx * Math.cos(h) + dz * Math.sin(h)) * m; return [cx + right * nmPx, cy - fwd * nmPx]; };
    const thr = v.rwy, a = toScreen(thr.dx, thr.dz), b = toScreen(thr.dx, thr.far), far = toScreen(thr.dx, thr.dz + 16 * 1852);
    g.save(); g.beginPath(); g.arc(cx, cy, R + 4, Math.PI, 0); g.lineTo(512, 512); g.lineTo(0, 512); g.closePath(); g.clip();
    g.setLineDash([16, 12]); line(g, far[0], far[1], a[0], a[1], C.magenta, 3); g.setLineDash([]);
    const nx = (b[1] - a[1]), ny = -(b[0] - a[0]), nl = Math.hypot(nx, ny) || 1, wpx = 4;
    poly(g, [[a[0] + nx / nl * wpx, a[1] + ny / nl * wpx], [b[0] + nx / nl * wpx, b[1] + ny / nl * wpx], [b[0] - nx / nl * wpx, b[1] - ny / nl * wpx], [a[0] - nx / nl * wpx, a[1] - ny / nl * wpx]], null, C.white, 3);
    txt(g, `RW${v.ident}`, a[0] + 14, a[1] + 4, 20, C.white, 'left');
    g.restore();
  }
  // half-range ring
  g.setLineDash([10, 10]); g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R / 2, Math.PI * 1.18, Math.PI * 1.82); g.stroke(); g.setLineDash([]);
  txt(g, range / 2, cx - R / 2 * 0.86 - 14, cy - R / 2 * 0.5, 20, C.cyan); txt(g, range, 40, 230, 20, C.cyan);
  // compass arc
  g.strokeStyle = C.white; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
  for (let a = Math.ceil((v.hdg - 52) / 5) * 5; a <= v.hdg + 52; a += 5) {
    const d = angleDiff(a, v.hdg) * DEG; if (Math.abs(d) > 50 * DEG) continue;
    const s = Math.sin(d), c = Math.cos(d), len = a % 10 === 0 ? 18 : 10;
    line(g, cx + s * R, cy - c * R, cx + s * (R + len), cy - c * (R + len), C.white, 3);
    if (a % 10 === 0) txt(g, String(Math.round(wrap360(a) / 10) % 36), cx + s * (R + 36), cy - c * (R + 36), a % 30 === 0 ? 30 : 24, C.white);
  }
  // selected heading, track, ILS course pointer
  const mark = (ang, fn) => { const d = angleDiff(ang, v.hdg) * DEG; if (Math.abs(d) < 52 * DEG) { g.save(); g.translate(cx, cy); g.rotate(d); fn(); g.restore(); } };
  mark(v.apHdg, () => poly(g, [[0, -R], [-11, -R - 16], [11, -R - 16]], C.cyan));
  mark(v.trk, () => poly(g, [[0, -R + 4], [-8, -R + 16], [0, -R + 28], [8, -R + 16]], null, C.green, 3));
  if (v.ils) mark(v.course, () => { line(g, 0, -R + 2, 0, -R + 46, C.magenta, 4); poly(g, [[0, -R - 2], [-9, -R + 14], [9, -R + 14]], C.magenta); });
  line(g, cx, cy - R - 26, cx, cy - R + 4, C.yellow, 5);
  // aircraft symbol
  line(g, cx - 34, cy, cx + 34, cy, C.yellow, 5); line(g, cx, cy - 22, cx, cy + 40, C.yellow, 5); line(g, cx - 13, cy + 32, cx + 13, cy + 32, C.yellow, 4);
  // data
  txt(g, 'GS', 12, 22, 20, C.white, 'left'); txt(g, Math.round(v.gs), 46, 22, 26, C.green, 'left');
  txt(g, 'TAS', 108, 22, 20, C.white, 'left'); txt(g, Math.round(v.tas), 152, 22, 26, C.green, 'left');
  txt(g, `${String(Math.round(v.windDir)).padStart(3, '0')}/${Math.round(v.windKt)}`, 12, 54, 24, C.green, 'left');
  if (v.windKt > 1) { g.save(); g.translate(30, 98); g.rotate(angleDiff(v.windDir + 180, v.hdg) * DEG); line(g, 0, -20, 0, 20, C.green, 3); poly(g, [[0, 22], [-7, 10], [7, 10]], C.green); g.restore(); }
  txt(g, `${v.ils ? 'ILS' : 'RW'}${v.ident}`, 500, 22, 24, C.white, 'right');
  txt(g, `${String(Math.round(v.course)).padStart(3, '0')}°`, 500, 52, 24, C.green, 'right');
  txt(g, `${v.dme.toFixed(1)} NM`, 500, 80, 24, C.white, 'right');
}

function drawEWD(g, v) {
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  const gauge = (x, y, r, value, max, red, label, cmd) => {
    const a0 = Math.PI * 0.82, a1 = Math.PI * 2.08, ang = (val) => a0 + clamp(val / max, 0, 1.02) * (a1 - a0);
    g.strokeStyle = C.white; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r, a0, ang(red)); g.stroke();
    g.strokeStyle = C.red; g.beginPath(); g.arc(x, y, r, ang(red), a1); g.stroke();
    for (let k = 0; k <= 10; k++) { const a = a0 + k / 10 * (a1 - a0); line(g, x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a) * (r - (k % 5 ? 7 : 13)), y + Math.sin(a) * (r - (k % 5 ? 7 : 13)), C.white, 3); }
    if (cmd != null) { const a = ang(cmd); g.strokeStyle = C.cyan; g.lineWidth = 3; g.beginPath(); g.arc(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9), 6, 0, Math.PI * 2); g.stroke(); }
    const a = ang(value); line(g, x, y, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), value > red ? C.red : C.white, 5);
    g.fillStyle = '#000'; g.fillRect(x + 4, y + 8, r - 2, 40); g.strokeStyle = '#7d858c'; g.lineWidth = 2; g.strokeRect(x + 4, y + 8, r - 2, 40);
    txt(g, label, x + 4 + (r - 2) / 2, y + 29, 30, value > red ? C.red : C.green);
  };
  for (const [i, x] of [[0, 112], [1, 300]]) {
    gauge(x, 110, 78, v.n1[i], 110, 104, v.n1[i].toFixed(1), v.cmd);
    gauge(x, 268, 54, v.egt[i], 1100, 1060, Math.round(v.egt[i]), null);
  }
  txt(g, 'N1', 206, 96, 22, C.white); txt(g, '%', 206, 122, 20, C.cyan);
  txt(g, 'EGT', 206, 258, 20, C.white); txt(g, '°C', 206, 282, 18, C.cyan);
  // right column: fuel and flaps
  txt(g, 'FOB :', 400, 34, 22, C.white, 'left'); txt(g, Math.round(v.fob / 10) * 10, 500, 66, 32, C.green, 'right'); txt(g, 'KG', 500, 94, 18, C.cyan, 'right');
  txt(g, 'S', 402, 150, 22, C.white); txt(g, 'F', 492, 150, 22, C.white); txt(g, 'FLAP', 448, 150, 18, C.white);
  const pos = clamp(v.flap / 3, 0, 1), slat = clamp(v.flap / 1.2, 0, 1), target = clamp(v.flapCmd / 3, 0, 1);
  const moving = Math.abs(v.flap - v.flapCmd) > 0.02;
  for (let k = 1; k <= 3; k++) { g.fillStyle = C.white; g.beginPath(); g.arc(448 + k * 15, 172 + k * 10, 3.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(436 - k * 13, 172 + k * 8, 3.5, 0, Math.PI * 2); g.fill(); }
  poly(g, [[432, 166], [452, 166], [458, 174], [438, 174]], '#c8d0d6');
  poly(g, [[436, 168], [436 - slat * 40, 168 + slat * 24], [436 - slat * 40 - 12, 168 + slat * 24 - 6]], null, moving ? C.cyan : C.green, 4);
  line(g, 456, 172, 456 + pos * 46, 172 + pos * 31, moving ? C.cyan : C.green, 5);
  if (moving) { const tx = 456 + target * 46, ty = 172 + target * 31; poly(g, [[tx, ty - 8], [tx + 8, ty], [tx, ty + 8], [tx - 8, ty]], null, C.cyan, 2); }
  txt(g, v.flapCmd >= 2.95 ? 'FULL' : String(Math.round(v.flapCmd)), 448, 228, 26, moving ? C.cyan : C.green);
  // memo / warnings
  line(g, 8, 340, 504, 340, '#7d858c', 2); line(g, 330, 350, 330, 504, '#7d858c', 2);
  let y = 368;
  const warn = []; if (v.stall) warn.push(['STALL', C.red]); if (v.overspeed) warn.push(['OVERSPEED', C.red]); if (v.gearWarn) warn.push(['L/G GEAR NOT DOWN', C.red]);
  if (v.spoilers && v.thr > 0.5) warn.push(['SPD BRK  ⟶ RETRACT', C.amber]); if (v.fob < 1500) warn.push(['FUEL LO LEVEL', C.amber]);
  if (warn.length) for (const [t, c] of warn) { txt(g, t, 14, y, 24, c, 'left'); y += 32; }
  else if (v.ldgMemo) {
    for (const [t, ok] of [['LDG GEAR DN', v.gearDown], ['SIGNS ON', true], ['SPLRS ARM', true], ['FLAPS FULL', v.flapCmd >= 2.95]]) { txt(g, t, 14, y, 24, ok ? C.green : C.cyan, 'left'); y += 32; }
  } else { txt(g, 'SEAT BELTS', 14, y, 24, C.green, 'left'); txt(g, 'NO SMOKING', 14, y + 32, 24, C.green, 'left'); }
  y = 368;
  if (v.spoilers) { txt(g, 'SPEED BRK', 342, y, 24, v.thr > 0.5 ? C.amber : C.green, 'left'); y += 32; }
  if (v.ap) { txt(g, 'AP 1', 342, y, 24, C.green, 'left'); y += 32; txt(g, 'A/THR', 342, y, 24, C.green, 'left'); y += 32; }
  if (v.onGround && v.brake > 0.1) txt(g, 'BRAKES', 342, y, 24, C.green, 'left');
}

function drawSD(g, v) {
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
  txt(g, 'WHEEL', 14, 26, 28, C.white, 'left'); line(g, 14, 44, 112, 44, C.white, 2);
  // ground spoilers
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = 256 + s * (70 + k * 30), y = 74;
    if (v.spoiler > 0.5) poly(g, [[x - 9, y + 6], [x + 9, y + 6], [x, y - 12]], null, C.green, 3); else line(g, x - 10, y + 6, x + 10, y + 6, C.green, 4);
  }
  // gear: two triangles per leg
  const leg = (x, y, label) => {
    const down = v.gearPos > 0.98 && v.gearCmd, moving = v.gearPos > 0.02 && v.gearPos < 0.98;
    const col = moving ? C.red : down ? C.green : null;
    for (const s of [-1, 1]) { const px = x + s * 20; if (col) poly(g, [[px - 16, y - 14], [px + 16, y - 14], [px, y + 16]], col); else poly(g, [[px - 16, y - 14], [px + 16, y - 14], [px, y + 16]], null, C.grey, 2); }
    if (moving) txt(g, 'UNLK', x, y + 34, 20, C.red); else if (!down) txt(g, 'UP', x, y + 34, 20, C.grey);
    txt(g, label, x, y - 30, 18, C.white);
  };
  leg(256, 140, 'NOSE'); leg(128, 210, 'L'); leg(384, 210, 'R');
  // brake temperatures
  for (const [x, i] of [[96, 0], [160, 1], [352, 2], [416, 3]]) {
    const t = Math.round(v.brakeTemp[i] / 5) * 5; g.strokeStyle = '#7d858c'; g.lineWidth = 2; g.strokeRect(x - 30, 262, 60, 34);
    txt(g, t, x, 280, 24, t > 300 ? C.amber : C.green);
  }
  txt(g, '°C', 256, 280, 18, C.cyan); txt(g, 'AUTO BRK', 256, 318, 20, C.white); txt(g, 'MED', 256, 342, 22, C.green);
  // fuel
  line(g, 8, 366, 504, 366, '#7d858c', 2);
  const wing = Math.min(v.fob / 2, 3700), ctr = Math.max(0, v.fob - 2 * wing) / 1;
  for (const [x, q, n] of [[86, wing, 'L'], [256, ctr, 'CTR'], [426, wing, 'R']]) {
    g.strokeStyle = C.white; g.lineWidth = 2; g.strokeRect(x - 66, 386, 132, 50);
    txt(g, n, x, 376, 16, C.white); txt(g, Math.round(q / 10) * 10, x, 412, 28, C.green);
  }
  txt(g, 'FOB', 14, 462, 22, C.white, 'left'); txt(g, `${Math.round(v.fob / 10) * 10}`, 150, 462, 30, C.green, 'right'); txt(g, 'KG', 158, 462, 18, C.cyan, 'left');
  line(g, 8, 482, 504, 482, '#7d858c', 2);
  txt(g, `TAT ${v.tat >= 0 ? '+' : ''}${Math.round(v.tat)} °C`, 14, 498, 18, C.green, 'left');
  txt(g, `GW ${Math.round(v.gw / 100) * 100} KG`, 498, 498, 18, C.green, 'right');
  txt(g, v.utc, 256, 498, 18, C.green);
}

function drawISIS(g, v) { // 256 x 256 standby
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.save(); g.beginPath(); g.rect(52, 30, 152, 196); g.clip();
  g.translate(128, 128); g.rotate(-v.roll * DEG); g.translate(0, v.pitch * 4.2);
  g.fillStyle = '#1f8fe0'; g.fillRect(-300, -600, 600, 600); g.fillStyle = '#8b5422'; g.fillRect(-300, 0, 600, 600); line(g, -300, 0, 300, 0, C.white, 2);
  for (const a of [-20, -10, 10, 20]) line(g, -22, -a * 4.2, 22, -a * 4.2, C.white, 2);
  g.restore();
  for (const s of [-1, 1]) line(g, 128 + s * 26, 128, 128 + s * 60, 128, C.yellow, 5);
  g.fillStyle = '#2c3237'; g.fillRect(0, 30, 50, 196); g.fillRect(206, 30, 50, 196);
  txt(g, Math.round(v.ias), 25, 128, 24, C.white); txt(g, Math.round(v.alt / 10) * 10, 231, 128, 18, C.white);
  txt(g, 'ISIS', 128, 16, 16, C.grey); txt(g, `${String(Math.round(v.hdg)).padStart(3, '0')}`, 128, 242, 20, C.white);
}

function drawFCU(g, v) { // 512 x 48 over the glareshield's FCU strip (0.6 m x 0.055 m); transparent except windows/buttons
  g.clearRect(0, 0, 512, 48);
  const lcd = (x, w, label, value) => {
    txt(g, label, x + w / 2, 6, 9, '#ece8da', 'center', 700);
    g.fillStyle = '#060708'; g.fillRect(x, 12, w, 23); g.strokeStyle = '#15191c'; g.lineWidth = 2; g.strokeRect(x, 12, w, 23);
    txt(g, value, x + w / 2, 24.5, 20, '#ff9d2e', 'center', 700);
  };
  lcd(8, 76, 'SPD', String(Math.round(v.apSpeed)).padStart(3, '0'));
  lcd(100, 76, 'HDG', String(Math.round(v.apHdg) % 360).padStart(3, '0'));
  lcd(290, 92, 'ALT', String(Math.round(v.apAlt / 100) * 100).padStart(5, '0'));
  lcd(428, 76, 'V/S', v.ap ? '+----' : '-----');
  for (const [x, y, label, on] of [[194, 8, 'LOC', v.ils && v.ap], [232, 8, 'AP1', v.ap], [268, 8, 'AP2', false], [250, 28, 'A/THR', v.ap], [404, 8, 'EXPED', false], [404, 28, 'APPR', v.ils && v.ap]]) {
    g.fillStyle = '#262c32'; g.fillRect(x - 16, y, 32, 17); txt(g, label, x, y + 11.5, 8, '#ece8da', 'center', 700);
    g.fillStyle = on ? '#3df26e' : '#14181b'; g.fillRect(x - 9, y + 2, 18, 3);
  }
}

export function createCockpit(THREE, options = {}) {
  const K = geometryKit(THREE), { v3 } = K;
  const finish = createAviationSurfaceKit(THREE);
  const group = new THREE.Group(); group.name = 'MQ-320 flight deck';
  const headingOffset = options.headingOffset ?? 0, altitudeOffset = options.altitudeOffset ?? 0;
  const env = skyEnvironment(THREE, { interior: true });
  const CX = 0.56, mirror = (x) => 2 * CX - x; // eye at the origin, cockpit centreline 0.56 m to the right
  const PFD_X = -0.07, ND_X = 0.12, ISIS_X = 0.33, GEAR_X = CX + 0.215, ident = options.runwayIdent ?? '14';

  // ---------------- Static panel atlas (colour map + backlit-legend emissive map) ----------------
  const PANEL_X0 = -0.67, PANEL_X1 = mirror(PANEL_X0), PANEL_W = PANEL_X1 - PANEL_X0, PANEL_D = 0.388, FACE_D = 0.055;
  const PED_W = 0.4, PED_L = 0.72, OVH_W = 0.72, OVH_L = 0.89, CON_W = 0.24, CON_L = 0.97, PED_X0 = CX - PED_W / 2;
  const AW = 2048, AH = 1024;
  const REG = { panel: [0, 0, 2048, 324], glare: [0, 326, 2048, 46], overhead: [0, 376, 512, 632], pedestal: [516, 376, 330, 594], consoleL: [850, 376, 144, 582], consoleR: [998, 376, 144, 582], mcdu: [1146, 376, 256, 210] };
  const SIZE = { panel: [PANEL_W, PANEL_D], glare: [PANEL_W, FACE_D], overhead: [OVH_W, OVH_L], pedestal: [PED_W, PED_L], consoleL: [CON_W, CON_L], consoleR: [CON_W, CON_L], mcdu: [0.11, 0.09] };
  let atlasMap = null, atlasGlow = null, roughMap = null;
  const uvOf = (reg, fx, fy) => { const [x, y, w, h] = REG[reg]; return [(x + fx * w) / AW, 1 - (y + fy * h) / AH]; };
  if (isBrowser) {
    const [cm, m] = canvas2d(AW, AH), [ce, e] = canvas2d(AW, AH);
    m.fillStyle = '#46535e'; m.fillRect(0, 0, AW, AH); e.fillStyle = '#000'; e.fillRect(0, 0, AW, AH);
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // painter for one region in metres: x(u) / y(v) map metres to atlas pixels, k = pixels per metre
    const region = (name, x0 = 0) => { const [X, Y, W, H] = REG[name], [w, h] = SIZE[name]; return { X, Y, W, H, k: W / w, x: (u) => X + (u - x0) / w * W, y: (v) => Y + v / h * H }; };
    const legend = (s, x, y, mm, k, align = 'center') => { const size = Math.max(5, mm * k / 1000); txt(m, s, x, y, size, '#e2ded0', align, 700); txt(e, s, x, y, size, '#cfc8b4', align, 700); };
    const plate = (x, y, w, h, color = '#3e4a54') => {
      m.fillStyle = color; m.fillRect(x, y, w, h); m.lineWidth = 1.5;
      m.strokeStyle = 'rgba(0,0,0,0.45)'; m.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); m.strokeStyle = 'rgba(255,255,255,0.07)'; m.strokeRect(x + 2, y + 2, w - 4, h - 4);
    };
    // Airbus push button: dark cap with an upper (status) and lower (selection) legend; `lit` lights one of them
    const pushButton = (x, y, w, h, upper, lower, lit) => {
      m.fillStyle = '#0d1012'; m.fillRect(x - 1, y - 1, w + 2, h + 2); m.fillStyle = '#23292e'; m.fillRect(x, y, w, h);
      const fs = Math.max(4.5, h * 0.27);
      for (const [leg, f, key] of [[upper, 0.3, 'upper'], [lower, 0.74, 'lower']]) {
        if (!leg) continue; const on = lit === key;
        txt(m, leg[0], x + w / 2, y + h * f, fs, on ? leg[1] : '#4c5357'); if (on) txt(e, leg[0], x + w / 2, y + h * f, fs, leg[1]);
      }
      if (lower && !lower[0]) { m.fillStyle = lit === 'lower' ? lower[1] : '#3b4246'; m.fillRect(x + w * 0.25, y + h * 0.66, w * 0.5, h * 0.12); if (lit === 'lower') { e.fillStyle = lower[1]; e.fillRect(x + w * 0.25, y + h * 0.66, w * 0.5, h * 0.12); } }
    };
    const knobMark = (x, y, r, ticks = 0) => {
      m.fillStyle = '#14181b'; m.beginPath(); m.arc(x, y, r, 0, TAU); m.fill();
      for (let i = 0; i < ticks; i++) { const a = -2.4 + i * 4.8 / Math.max(1, ticks - 1); line(m, x + Math.cos(a - Math.PI / 2) * r * 1.25, y + Math.sin(a - Math.PI / 2) * r * 1.25, x + Math.cos(a - Math.PI / 2) * r * 1.55, y + Math.sin(a - Math.PI / 2) * r * 1.55, '#d6d2c4', 1.2); }
    };
    const toggle = (x, y, s) => { m.fillStyle = '#14181b'; m.beginPath(); m.arc(x, y, s, 0, TAU); m.fill(); m.fillStyle = '#9aa2a8'; m.fillRect(x - s * 0.25, y - s * 1.6, s * 0.5, s * 1.6); };
    // ---- main instrument panel (u = world x, v = metres down the tilted face)
    { const P = region('panel', PANEL_X0), k = P.k, X = P.x, Y = P.y;
      m.fillStyle = '#47545f'; m.fillRect(P.X, P.Y, P.W, P.H);
      for (const x of [PFD_X - 0.105, ND_X + 0.1, mirror(ND_X + 0.1), mirror(PFD_X - 0.105)]) { m.fillStyle = 'rgba(0,0,0,0.5)'; m.fillRect(X(x) - 1, P.Y, 2, P.H); }
      for (const x of [PANEL_X0 + 0.004, PANEL_X1 - 0.004]) { m.fillStyle = 'rgba(0,0,0,0.5)'; m.fillRect(X(x) - 1, P.Y, 2, P.H); }
      for (const [x0, x1] of [[PANEL_X0, PFD_X - 0.105], [mirror(PFD_X - 0.105), PANEL_X1]]) for (const v of [0.012, 0.37]) for (const x of [x0 + 0.02, x1 - 0.02]) { m.fillStyle = '#2b3238'; m.beginPath(); m.arc(X(x), Y(v), 2.5, 0, TAU); m.fill(); }
      const bezel = (xc, d0, size) => plate(X(xc - size / 2 - 0.014), Y(d0 - 0.011), (size + 0.028) * k, (size + 0.03) * k, '#272e34');
      for (const xc of [PFD_X, ND_X, mirror(ND_X), mirror(PFD_X), CX]) bezel(xc, 0.012, 0.15);
      bezel(CX, 0.19, 0.15); bezel(ISIS_X, 0.017, 0.076);
      for (const sd of [-1, 1]) {
        const at = (x) => X(sd < 0 ? x : mirror(x)), w = (mm) => mm * k / 1000;
        legend('LOUD SPKR', at(-0.52), Y(0.03), 6, k); knobMark(at(-0.52), Y(0.055), w(11), 5);
        legend('PFD/ND XFR', at(-0.52), Y(0.098), 6, k); pushButton(at(-0.52) - w(12), Y(0.106), w(24), w(18), null, ['', '#fff']);
        legend('CONSOLE/FLOOR', at(-0.52), Y(0.158), 6, k); toggle(at(-0.52), Y(0.19), w(5)); legend('BRT   OFF   DIM', at(-0.52), Y(0.208), 4.5, k);
        legend('TERR ON ND', at(-0.52), Y(0.245), 6, k); pushButton(at(-0.52) - w(12), Y(0.253), w(24), w(18), null, ['ON', '#33dcff']);
        legend('GPWS', at(-0.4), Y(0.03), 6, k); pushButton(at(-0.4) - w(14), Y(0.038), w(28), w(20), ['G/S', '#ffb420'], ['MODE', '#ffb420']);
        pushButton(at(-0.32) - w(14), Y(0.038), w(28), w(20), ['AUTO', '#ff3b30'], ['LAND', '#ff3b30']);
        pushButton(at(-0.24) - w(14), Y(0.038), w(28), w(20), ['ATC', '#ffb420'], ['MSG', '#ffb420']);
        legend('PFD', at(PFD_X - 0.06), Y(0.172), 5, k); legend('ND', at(ND_X - 0.06), Y(0.172), 5, k);
        legend('BRT', at(PFD_X + 0.06), Y(0.172), 5, k); legend('BRT', at(ND_X + 0.06), Y(0.172), 5, k);
        // pilot's chart holder and clipboard area below the displays
        plate(Math.min(at(PFD_X - 0.075), at(ND_X + 0.075)), Y(0.21), Math.abs(at(ND_X + 0.075) - at(PFD_X - 0.075)), (0.15) * k, '#414e58');
        legend('NORMAL CHECKLIST', (at(PFD_X) + at(ND_X)) / 2, Y(0.228), 5.5, k); for (let i = 0; i < 7; i++) for (const c of [-1, 1]) { const x0 = (at(PFD_X) + at(ND_X)) / 2 + c * 0.075 * k; m.fillStyle = 'rgba(226,222,208,0.35)'; m.fillRect(Math.min(x0, x0 - c * 0.06 * k), Y(0.245 + i * 0.015), 0.06 * k * (0.6 + 0.4 * ((i * 7 + c + 3) % 5) / 4), 2); }
      }
      // centre panel left column: standby instrument, clock, DDRMI
      { const x = X(ISIS_X), w = (mm) => mm * k / 1000;
        legend('CHRONO', x, Y(0.125), 5, k); knobMark(x, Y(0.165), w(26)); txt(m, '14:32', x, Y(0.165), w(9), '#3fbf62'); txt(e, '14:32', x, Y(0.165), w(9), '#5cff86');
        legend('DDRMI', x, Y(0.215), 5, k); knobMark(x, Y(0.255), w(28), 12);
        legend('AUDIO SWTG', x, Y(0.315), 5, k); knobMark(x, Y(0.338), w(9), 3); }
      // centre panel right column: landing gear, anti-skid, autobrake, brake fan, brake pressure
      { const x = X(GEAR_X), w = (mm) => mm * k / 1000;
        legend('LDG GEAR', x, Y(0.02), 7, k);
        plate(x - w(17), Y(0.072), w(34), w(110), '#30383f'); legend('UP', x + w(28), Y(0.085), 5.5, k); legend('DN', x + w(28), Y(0.165), 5.5, k);
        legend('A/SKID &', x - w(68), Y(0.19), 5, k); legend('N/W STRG', x - w(68), Y(0.2), 5, k); toggle(x - w(68), Y(0.225), w(5));
        legend('AUTO/BRK', x, Y(0.255), 6, k);
        ['LO', 'MED', 'MAX'].forEach((t, i) => pushButton(x + w(-38 + i * 38) - w(14), Y(0.262), w(28), w(20), ['DECEL', '#3df26e'], ['', '#3df26e'], t === 'MED' ? 'lower' : null));
        ['LO', 'MED', 'MAX'].forEach((t, i) => legend(t, x + w(-38 + i * 38), Y(0.292), 5, k));
        legend('BRK FAN', x - w(68), Y(0.255), 5, k); pushButton(x - w(68) - w(12), Y(0.262), w(24), w(20), ['HOT', '#ffb420'], ['', '#fff']);
        legend('ACCU PRESS', x + w(62), Y(0.19), 5, k); knobMark(x + w(62), Y(0.225), w(18), 7); legend('BRAKES', x + w(62), Y(0.252), 5, k);
        legend('ENG', x - w(140), Y(0.355), 5, k); }
    }
    // ---- glareshield face: EFIS control panels and the attention-getters each side; the FCU windows are a live layer
    { const G = region('glare', PANEL_X0), k = G.k, X = G.x, yy = (f) => G.Y + f * G.H, w = (mm) => mm * k / 1000;
      m.fillStyle = '#39454f'; m.fillRect(G.X, G.Y, G.W, G.H);
      for (const sd of [-1, 1]) {
        const at = (x) => X(sd < 0 ? x : mirror(x));
        plate(Math.min(at(-0.25), at(0.225)), yy(0.04), Math.abs(at(0.225) - at(-0.25)), G.H * 0.92, '#43515c');
        legend('QNH', at(-0.2), yy(0.13), 5, k); legend('inHg', at(-0.228), yy(0.88), 4.5, k); legend('hPa', at(-0.172), yy(0.88), 4.5, k);
        ['CSTR', 'WPT', 'VOR.D', 'NDB', 'ARPT'].forEach((t, i) => { const x = at(-0.125 + i * 0.03); pushButton(x - w(11), yy(0.12), w(22), w(16), null, ['', '#3df26e'], t === 'ARPT' ? 'lower' : null); legend(t, x, yy(0.56), 4, k); });
        [['FD', true], ['LS', true]].forEach(([t, on], i) => { const x = at(-0.11 + i * 0.04); pushButton(x - w(12), yy(0.66), w(24), w(15), null, ['', '#3df26e'], on ? 'lower' : null); legend(t, x - w(18), yy(0.8), 4.5, k); });
        legend('ND MODE', at(0.085), yy(0.12), 4.5, k); legend('LS  VOR  NAV  ARC  PLAN', at(0.085), yy(0.9), 3.6, k);
        legend('ND RANGE', at(0.165), yy(0.12), 4.5, k); legend('10 20 40 80 160 320', at(0.165), yy(0.9), 3.6, k);
        legend('CHRONO', at(-0.59), yy(0.2), 4.5, k); pushButton(at(-0.59) - w(12), yy(0.36), w(24), w(18), null, ['', '#fff']);
        legend('SIDE STICK PRIORITY', at(-0.5), yy(0.14), 4, k); pushButton(at(-0.5) - w(14), yy(0.3), w(28), w(22), ['CAPT', '#3df26e'], ['F/O', '#ff3b30']);
        legend('MASTER', at(-0.41), yy(0.1), 4, k); legend('MASTER', at(-0.33), yy(0.1), 4, k);
      }
      plate(X(CX - 0.3), yy(0.02), 0.6 * k, G.H * 0.96, '#4a5864'); // FCU body
    }
    // ---- overhead panel. Canvas top = aft edge: like the main panel folded over the crew, its "top" is the far end,
    // so legends read correctly when the pilot looks up. vf below is measured aft from the forward edge (geometry uses the same).
    { const O = region('overhead'), k = O.k, X = O.x, w = (mm) => mm * k / 1000, Yf = (vf) => O.Y + (OVH_L - vf) * k;
      m.fillStyle = '#46535e'; m.fillRect(O.X, O.Y, O.W, O.H);
      const panel = (u0, vf0, u1, vf1, title) => { const top = Yf(vf1); plate(X(u0) + 2, top + 2, (u1 - u0) * k - 4, (vf1 - vf0) * k - 4, '#44515c'); if (title) legend(title, X((u0 + u1) / 2), top + w(8), 5, k); return top; };
      const pbRow = (u0, u1, top, items) => items.forEach(([up, low, label, lit], i) => { const n = items.length, u = u0 + (i + 0.5) * (u1 - u0) / n; pushButton(X(u) - w(11), top, w(22), w(17), up, low, lit); if (label) legend(label, X(u), top + w(22), 4, k); });
      const FAULT = ['FAULT', '#ffb420'], OFF = ['OFF', '#f4f7f8'], ON = ['ON', '#33dcff'], AVAIL = ['AVAIL', '#3df26e'];
      // forward row (the strip visible over the windscreen header at rest)
      panel(0, 0, 0.12, 0.11, 'WIPER'); knobMark(X(0.06), Yf(0.06), w(10), 4);
      panel(0.12, 0, 0.36, 0.11, 'EXT LT'); ['STROBE', 'BEACON', 'WING', 'NAV&LOGO', 'RWY TURN OFF'].forEach((t, i) => { const u = 0.14 + i * 0.045; toggle(X(u), Yf(0.06), w(4)); legend(t, X(u), Yf(0.06) + w(14), 3.6, k); });
      { const t = panel(0.36, 0, 0.6, 0.11, 'ANTI ICE'); pbRow(0.37, 0.59, t + w(16), [[FAULT, ON, 'WING', null], [FAULT, ON, 'ENG 1', 'lower'], [FAULT, ON, 'ENG 2', 'lower'], [null, ON, 'PROBE/WINDOW', null]]); }
      panel(0.6, 0, 0.72, 0.11, 'WIPER'); knobMark(X(0.66), Yf(0.06), w(10), 4);
      // second row
      { const t = panel(0, 0.11, 0.12, 0.3, 'CALLS'); pbRow(0.01, 0.11, t + w(18), [[null, ['MECH', '#fff'], '', null], [null, ['FWD', '#fff'], '', null]]); pbRow(0.01, 0.11, t + w(90), [[['EMER', '#ffb420'], ['ON', '#fff'], 'EMER', null]]); }
      { const t = panel(0.12, 0.11, 0.36, 0.2, 'APU'); pbRow(0.14, 0.34, t + w(18), [[FAULT, ON, 'MASTER SW', null], [AVAIL, ON, 'START', null]]); }
      panel(0.12, 0.2, 0.36, 0.3, 'SIGNS'); ['SEAT BELTS', 'NO SMOKING', 'EMER EXIT LT'].forEach((t, i) => { const u = 0.165 + i * 0.075; toggle(X(u), Yf(0.25), w(4)); legend(t, X(u), Yf(0.25) + w(14), 3.8, k); });
      { const t = panel(0.36, 0.11, 0.6, 0.3, 'CABIN PRESS'); pbRow(0.37, 0.59, t + w(18), [[FAULT, ['MAN', '#fff'], 'MODE SEL', null], [null, ['', '#fff'], 'DITCHING', null]]); }
      knobMark(X(0.42), Yf(0.25), w(10), 6); knobMark(X(0.54), Yf(0.25), w(10), 8); legend('LDG ELEV', X(0.54), Yf(0.25) + w(18), 4, k); legend('MAN V/S', X(0.42), Yf(0.25) + w(18), 4, k);
      panel(0.6, 0.11, 0.72, 0.3, 'INT LT'); knobMark(X(0.66), Yf(0.18), w(9), 3); legend('ANN LT', X(0.66), Yf(0.26) - w(12), 4, k); toggle(X(0.66), Yf(0.26), w(4));
      // aft part: the main system panels, seen when looking up
      for (const [title, vf0, vf1] of [['ELEC', 0.36, 0.46], ['AIR COND', 0.46, 0.56], ['FUEL', 0.56, 0.68], ['HYD', 0.68, 0.76], ['FIRE', 0.76, 0.89]]) {
        const t = panel(0.12, vf0, 0.6, vf1, title);
        pbRow(0.13, 0.59, t + w(18), [[FAULT, OFF, 'L1', null], [FAULT, OFF, 'L2', null], [FAULT, OFF, 'C1', null], [FAULT, OFF, 'C2', null], [FAULT, OFF, 'R1', null], [FAULT, OFF, 'R2', null]]);
      }
      { const t = panel(0.12, 0.3, 0.6, 0.36, 'ENG'); pbRow(0.2, 0.52, t + w(14), [[FAULT, OFF, 'N1 MODE', null], [FAULT, OFF, 'MAN START', null]]); }
      { const t = panel(0, 0.3, 0.12, 0.89, 'ADIRS'); for (const vf of [0.4, 0.52, 0.64]) knobMark(X(0.06), Yf(vf), w(12), 4); pbRow(0.01, 0.11, t + w(20), [[FAULT, OFF, 'IR 1', null], [FAULT, OFF, 'IR 2', null]]); }
      { const t = panel(0.6, 0.3, 0.72, 0.89, 'OXYGEN'); pbRow(0.61, 0.71, t + w(20), [[['SYS OFF', '#fff'], OFF, 'CREW SUPPLY', null]]); pbRow(0.61, 0.71, t + w(120), [[FAULT, OFF, 'GPWS', null], [FAULT, OFF, 'RCDR', null]]); }
    }
    // ---- pedestal top (canvas top = forward end of the flat part)
    { const Q = region('pedestal', PED_X0), k = Q.k, X = Q.x, Y = Q.y, w = (mm) => mm * k / 1000, cx = X(CX);
      m.fillStyle = '#44515c'; m.fillRect(Q.X, Q.Y, Q.W, Q.H);
      plate(X(PED_X0 + 0.02), Y(0.01), (PED_W - 0.04) * k, 0.09 * k, '#3a4650'); legend('ECAM CONTROL PANEL', cx, Y(0.018), 4.5, k);
      ['ENG', 'BLEED', 'PRESS', 'ELEC', 'HYD', 'FUEL', 'APU', 'COND', 'DOOR', 'WHEEL', 'F/CTL', 'ALL'].forEach((t, i) => { const u = PED_X0 + 0.06 + (i % 6) * 0.056, v = 0.03 + Math.floor(i / 6) * 0.033; pushButton(X(u) - w(16), Y(v), w(32), w(18), null, ['', '#fff']); legend(t, X(u), Y(v) + w(24), 3.8, k); });
      // thrust quadrant slots, detents and the two gates
      for (const dx of [-0.026, 0.026]) { m.fillStyle = '#0d1012'; m.fillRect(X(CX + dx) - w(5), Y(0.13), w(10), 0.22 * k); }
      [[0.14, 'TOGA'], [0.18, 'FLX MCT'], [0.22, 'CL'], [0.3, '0'], [0.34, 'REV']].forEach(([v, t]) => { legend(t, cx, Y(v), 5, k); line(m, X(CX - 0.055), Y(v) + w(5), X(CX - 0.04), Y(v) + w(5), '#d6d2c4', 1.5); line(m, X(CX + 0.04), Y(v) + w(5), X(CX + 0.055), Y(v) + w(5), '#d6d2c4', 1.5); });
      m.fillStyle = '#0d1012'; m.fillRect(X(PED_X0 + 0.04) - w(4), Y(0.13), w(8), 0.17 * k); m.fillRect(X(PED_X0 + PED_W - 0.045) - w(4), Y(0.13), w(8), 0.17 * k);
      legend('SPEED BRAKE', X(PED_X0 + 0.045), Y(0.12), 4.5, k); [[0.14, 'RET'], [0.21, '1/2'], [0.28, 'FULL']].forEach(([v, t]) => legend(t, X(PED_X0 + 0.075), Y(v), 4, k, 'left'));
      legend('FLAPS', X(PED_X0 + PED_W - 0.045), Y(0.12), 5, k); [[0.14, '0'], [0.175, '1'], [0.21, '2'], [0.245, '3'], [0.28, 'FULL']].forEach(([v, t]) => legend(t, X(PED_X0 + PED_W - 0.075), Y(v), 4.5, k, 'right'));
      // engine masters and mode selector
      plate(X(CX - 0.12), Y(0.38), 0.24 * k, 0.11 * k, '#3a4650'); legend('ENG', cx, Y(0.39), 5, k);
      for (const s of [-1, 1]) { const x = X(CX + s * 0.075); legend(s < 0 ? 'MASTER 1' : 'MASTER 2', x, Y(0.4), 4.5, k); pushButton(x - w(14), Y(0.455), w(28), w(16), ['FIRE', '#ff3b30'], ['FAULT', '#ffb420']); legend('ON', x + w(22), Y(0.41), 4, k); legend('OFF', x + w(22), Y(0.445), 4, k); }
      legend('MODE', cx, Y(0.415), 4.5, k); knobMark(cx, Y(0.44), w(10), 3); legend('CRANK  NORM  IGN/START', cx, Y(0.475), 3.6, k);
      // radio management panels, ACP, parking brake, rudder trim
      for (const s of [-1, 1]) { const x0 = CX + s * 0.11 - 0.085; plate(X(x0), Y(0.505), 0.17 * k, 0.1 * k, '#36424b'); m.fillStyle = '#08090a'; m.fillRect(X(x0 + 0.015), Y(0.515), 0.14 * k, 0.025 * k); txt(m, '118.100   121.500', X(x0 + 0.085), Y(0.528), w(9), '#ff9d2e'); txt(e, '118.100   121.500', X(x0 + 0.085), Y(0.528), w(9), '#ff9d2e'); legend('RMP', X(x0 + 0.085), Y(0.555), 4.5, k); for (let i = 0; i < 6; i++) pushButton(X(x0 + 0.02 + i * 0.025), Y(0.565), w(18), w(14), null, ['', '#3df26e'], i === 0 ? 'lower' : null); }
      legend('PARK BRK', cx, Y(0.625), 5, k); plate(X(CX - 0.03), Y(0.63), 0.06 * k, 0.035 * k, '#2a3137');
      legend('RUD TRIM', cx, Y(0.675), 4.5, k); m.fillStyle = '#08090a'; m.fillRect(X(CX - 0.02), Y(0.68), 0.04 * k, 0.016 * k); txt(m, 'L 0.0', cx, Y(0.688), w(8), '#ff9d2e'); txt(e, 'L 0.0', cx, Y(0.688), w(8), '#ff9d2e');
    }
    // ---- side consoles (canvas top = forward end)
    for (const reg of ['consoleL', 'consoleR']) {
      const S = region(reg), k = S.k, X = S.x, Y = S.y, w = (mm) => mm * k / 1000, cx = X(CON_W / 2);
      m.fillStyle = '#44515c'; m.fillRect(S.X, S.Y, S.W, S.H);
      plate(X(0.03), Y(0.06), 0.18 * k, 0.16 * k, '#3a4650'); legend('STEERING', cx, Y(0.075), 5, k);
      plate(X(0.04), Y(0.27), 0.16 * k, 0.16 * k, '#2c343a'); legend('SIDE STICK', cx, Y(0.285), 4.5, k);
      plate(X(0.03), Y(0.48), 0.18 * k, 0.16 * k, '#3a4650'); legend('AUDIO CONTROL', cx, Y(0.495), 4.5, k);
      for (let i = 0; i < 10; i++) pushButton(X(0.05 + (i % 5) * 0.035), Y(0.52 + Math.floor(i / 5) * 0.05), w(20), w(14), null, ['', '#fff'], i === 0 ? 'lower' : null);
      plate(X(0.04), Y(0.7), 0.16 * k, 0.22 * k, '#30383f'); legend('OXY MASK', cx, Y(0.715), 4.5, k);
      pushButton(cx - w(16), Y(0.75), w(32), w(18), null, ['PRESS TO TEST', '#fff']);
    }
    // ---- MCDU page
    { const [X, Y, W, H] = REG.mcdu; m.fillStyle = '#050608'; m.fillRect(X, Y, W, H);
      const rows = [['APPR', '#f4f7f8', 'center'], ['LSZH ILS14', '#3df26e', 'center'], ['QNH       FLP RETR', '#f4f7f8', 'left'], ['1013       F=148', '#33dcff', 'left'], ['TEMP     SLT RETR', '#f4f7f8', 'left'], ['+12°        S=180', '#33dcff', 'left'], ['MAG WIND   CLEAN', '#f4f7f8', 'left'], ['030°/008    O=208', '#33dcff', 'left'], ['TRANS FL    VAPP', '#f4f7f8', 'left'], ['FL050        137', '#33dcff', 'left']];
      rows.forEach(([t, c, a], i) => { const x = a === 'center' ? X + W / 2 : X + 10, y = Y + 13 + i * 19.5; txt(m, t, x, y, i < 2 ? 15 : 13, c, a); txt(e, t, x, y, i < 2 ? 15 : 13, c, a); }); }
    // interior bounce light: add a dim copy of the albedo to the emissive map, more for the down-facing overhead
    e.globalCompositeOperation = 'lighter';
    for (const [name, fill] of [['panel', 0.2], ['glare', 0.17], ['overhead', 0.38], ['pedestal', 0.16], ['consoleL', 0.17], ['consoleR', 0.17]]) { const [x, y, w, h] = REG[name]; e.globalAlpha = fill; e.drawImage(cm, x, y, w, h, x, y, w, h); }
    e.globalAlpha = 1; e.globalCompositeOperation = 'source-over';
    // grain over the painted surfaces (map only) so large flat panels do not read as plastic
    for (let i = 0; i < 16000; i++) { m.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.025})`; m.fillRect(rnd() * AW, rnd() * AH, 2 + rnd() * 9, 2 + rnd() * 9); }
    atlasMap = new THREE.CanvasTexture(cm); atlasMap.colorSpace = THREE.SRGBColorSpace; atlasMap.anisotropy = 8;
    atlasGlow = new THREE.CanvasTexture(ce); atlasGlow.colorSpace = THREE.SRGBColorSpace; atlasGlow.anisotropy = 8;
    const [cr, r] = canvas2d(256, 256); r.fillStyle = '#e8e8e8'; r.fillRect(0, 0, 256, 256); // fine, low-contrast roughness grain
    for (let i = 0; i < 6000; i++) { const v = 215 + rnd() * 40 | 0; r.fillStyle = `rgb(${v},${v},${v})`; r.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2); }
    roughMap = new THREE.CanvasTexture(cr); roughMap.wrapS = roughMap.wrapT = THREE.RepeatWrapping; roughMap.repeat.set(8, 8);
  }
  const mat = {
    atlas: new THREE.MeshStandardMaterial({ color: 0xffffff, map: atlasMap, emissiveMap: atlasGlow, emissive: atlasGlow ? 0xffffff : 0x000000, emissiveIntensity: 1, roughness: 0.9, roughnessMap: roughMap, metalness: 0.02, envMap: env, envMapIntensity: 0.1 }),
    lining: new THREE.MeshStandardMaterial({ color: 0x9aa1a6, emissive: 0x1a1d20, roughness: 0.86, roughnessMap: roughMap, metalness: 0, envMap: env, envMapIntensity: 0.2 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x9aa1a6, emissive: 0x585d61, roughness: 0.9, roughnessMap: roughMap, metalness: 0 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x56616b, emissive: 0x101316, roughness: 0.7, roughnessMap: roughMap, metalness: 0.05, envMap: env, envMapIntensity: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2a3137, roughness: 0.78, roughnessMap: roughMap, metalness: 0.08, envMap: env, envMapIntensity: 0.25 }),
    glare: new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.93, roughnessMap: roughMap, metalness: 0, envMap: env, envMapIntensity: 0.15 }),
    knob: new THREE.MeshStandardMaterial({ color: 0x161b1f, roughness: 0.45, metalness: 0.2, envMap: env, envMapIntensity: 0.5 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xa3acb3, roughness: 0.3, metalness: 0.85, envMap: env, envMapIntensity: 0.7 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2f3a46, roughness: 0.92, metalness: 0 }),
  };
  for (const key of ['atlas', 'lining', 'frame', 'trim', 'glare', 'knob']) finish.apply(mat[key], 'plastic', { repeat: key === 'atlas' ? [8, 4] : [4, 4], bumpScale: key === 'glare' ? 0.0005 : 0.0002 });
  finish.apply(mat.metal, 'brushed', { repeat: [3, 3], bumpScale: 0.00003 });
  finish.apply(mat.seat, 'fabric', { repeat: [6, 6], bumpScale: 0.0008 });
  const parts = { atlas: [], lining: [], ceiling: [], frame: [], trim: [], glare: [], knob: [], metal: [], seat: [] };
  // ---- geometry helpers ----
  function quad(list, a, b, c, d, uv = null) { // a b c d counter-clockwise seen from the front
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    const uvs = uv ? uv.flat() : [0, 0, 1, 0, 1, 1, 0, 1];
    const g = K.build([a, b, c, d].flatMap(p => [p.x, p.y, p.z]), [n, n, n, n].flatMap(p => [p.x, p.y, p.z]), uvs, [0, 1, 2, 0, 2, 3]);
    list.push(g); return g;
  }
  // face toward the eye (origin): flip if needed
  function quadToEye(list, a, b, c, d, uv) {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const centre = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
    if (n.dot(centre) > 0) return quad(list, d, c, b, a, uv ? [uv[3], uv[2], uv[1], uv[0]] : null);
    return quad(list, a, b, c, d, uv);
  }
  function beam(list, a, b, width, depth, upHint = v3(0, 0, 1)) { // box from a to b, cross-section width x depth
    const d = b.clone().sub(a), len = d.length(); d.normalize();
    const s = new THREE.Vector3().crossVectors(d, upHint).normalize(), u = new THREE.Vector3().crossVectors(s, d).normalize();
    const g = new THREE.BoxGeometry(width, len, depth);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(s, d, u).setPosition(a.clone().add(b).multiplyScalar(0.5)));
    list.push(g); return g;
  }
  const boxAt = (list, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const g = K.box(x, y, z, sx, sy, sz, rx, ry, rz); list.push(g); return g; };
  const cyl = (list, a, b, r0, r1 = r0, seg = 12) => { const g = K.rod(a, b, r0, r1, seg); list.push(g); return g; };

  // ---------------- Windscreen frame ----------------
  // WB = windscreen bottom corners, WT = top corners (left post, centre post, right post); the glass itself is left open.
  const WB = { L: v3(-0.665, -0.255, -0.78), C: v3(CX, -0.255, -1.05), R: v3(mirror(-0.665), -0.255, -0.78) };
  const WT = { L: v3(-0.625, 0.268, -0.44), C: v3(CX, 0.268, -0.62), R: v3(mirror(-0.625), 0.268, -0.44) };
  beam(parts.frame, WB.C.clone().add(v3(0, -0.02, 0.02)), WT.C.clone().add(v3(0, 0.03, 0.02)), 0.075, 0.06, v3(0, 0, 1)); // centre post
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    beam(parts.lining, WT[side].clone().add(v3(0, 0.035, 0.02)), WT.C.clone().add(v3(0, 0.035, 0.02)), 0.07, 0.05, v3(0, 1, 0)); // header
    beam(parts.frame, WB[side].clone().add(v3(s * 0.025, -0.03, 0.03)), WT[side].clone().add(v3(s * 0.025, 0.04, 0.03)), 0.1, 0.07, v3(s, 0, 0)); // corner post
  }
  // standby compass hanging under the centre header
  boxAt(parts.frame, CX, 0.252, -0.6, 0.044, 0.03, 0.034);
  // windscreen glass: a faint tint that picks up a sky sheen at grazing angles, kept nearly clear for the approach view
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xd8e8ed, transparent: true, opacity: 0.065, roughness: 0.05, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08, ior: 1.52, envMap: env, envMapIntensity: 0.35, depthWrite: false });
  finish.apply(glassMat, 'glass', { bumpScale: 0.000008 });
  { const list = [], out = v3(0, 0, -0.012);
    quadToEye(list, WB.L.clone().add(out), WB.C.clone().add(out), WT.C.clone().add(out), WT.L.clone().add(out));
    quadToEye(list, WB.C.clone().add(out), WB.R.clone().add(out), WT.R.clone().add(out), WT.C.clone().add(out));
    const glass = new THREE.Mesh(K.merge(list), glassMat); glass.name = 'windscreen glass'; glass.renderOrder = 3; group.add(glass); }
  for (const sd of [-1, 1]) {
    const X = x => sd < 0 ? x : mirror(x), a = v3(X(-0.43), -0.247, -0.835), b = v3(X(0.18), -0.229, -0.99);
    beam(parts.trim, a, b, 0.008, 0.009, v3(0, 1, 0));
    cyl(parts.metal, a.clone().lerp(b, 0.5), a.clone().add(v3(0.11 * -sd, -0.042, 0.025)), 0.004, 0.005, 8);
    // Header fasteners and glazing seals remain outside the clear centre of the windscreen.
    beam(parts.trim, WB[sd < 0 ? 'L' : 'R'].clone().add(v3(0, 0.007, -0.006)), WB.C.clone().add(v3(0, 0.007, -0.006)), 0.008, 0.008, v3(0, 1, 0));
  }
  // ---------------- Side walls: sliding window and aft window openings ----------------
  const postZ = (y) => lerp(WB.L.z, WT.L.z, (y - WB.L.y) / (WT.L.y - WB.L.y)); // corner post line
  const SILL = -0.15, HEAD = 0.225;
  for (const sd of [-1, 1]) {
    const X = (x) => (sd < 0 ? x : mirror(x));
    const wallX = (y) => lerp(-0.665, -0.625, (y - WB.L.y) / (WT.L.y - WB.L.y));
    const P = (y, z) => v3(X(wallX(y)), y, z);
    const front = (y) => postZ(y) + 0.09; // front edge of the sliding window, parallel to the post
    quadToEye(parts.lining, P(-1.2, -0.95), P(SILL, front(SILL) - 0.06), P(SILL, 1.6), P(-1.2, 1.6));             // below the sill, down to the floor
    quadToEye(parts.lining, P(SILL, postZ(SILL)), P(SILL, front(SILL)), P(HEAD, front(HEAD)), P(HEAD, postZ(HEAD))); // strip behind the post
    quadToEye(parts.ceiling, P(HEAD, postZ(HEAD) - 0.02), P(HEAD, 1.6), P(0.36, 1.6), P(0.36, postZ(0.3)));          // above the windows
    quadToEye(parts.lining, P(SILL, -0.2), P(SILL, -0.13), P(HEAD, -0.13), P(HEAD, -0.2));                             // post between windows
    quadToEye(parts.lining, P(SILL, 0.3), P(SILL, 1.6), P(HEAD, 1.6), P(HEAD, 0.3));                                 // aft wall
    beam(parts.trim, P(SILL - 0.012, front(SILL) - 0.04).add(v3(-sd * 0.02, 0, 0)), P(SILL - 0.012, 0.6).add(v3(-sd * 0.02, 0, 0)), 0.035, 0.03, v3(0, 1, 0)); // sill / arm rest
    beam(parts.trim, P(HEAD + 0.01, postZ(HEAD) + 0.02).add(v3(-sd * 0.012, 0, 0)), P(HEAD + 0.01, 0.3).add(v3(-sd * 0.012, 0, 0)), 0.018, 0.02, v3(0, 1, 0)); // sun-visor rail
    // sliding-window frame, its handle, a gasper outlet and the document pocket
    beam(parts.frame, P(SILL + 0.012, front(SILL)).add(v3(-sd * 0.012, 0, 0)), P(HEAD - 0.01, front(HEAD)).add(v3(-sd * 0.012, 0, 0)), 0.03, 0.022, v3(sd, 0, 0));
    beam(parts.frame, P(SILL + 0.012, -0.19).add(v3(-sd * 0.012, 0, 0)), P(HEAD - 0.01, -0.19).add(v3(-sd * 0.012, 0, 0)), 0.03, 0.022, v3(sd, 0, 0));
    beam(parts.knob, P(SILL + 0.06, -0.215).add(v3(-sd * 0.03, 0, 0)), P(SILL + 0.14, -0.215).add(v3(-sd * 0.03, 0, 0)), 0.014, 0.02, v3(sd, 0, 0));
    { const c = P(-0.33, -0.36); parts.knob.push(K.rod(c, c.clone().add(v3(-sd * 0.03, 0, 0)), 0.03, 0.026, 14)); }
    { const c = P(-0.42, 0.62); boxAt(parts.frame, c.x - sd * 0.02, c.y, c.z, 0.04, 0.2, 0.36); }
    // ceiling from the wall to the overhead panel
    quadToEye(parts.ceiling, P(0.36, postZ(0.3)), v3(X(0.2), 0.305, -0.6), v3(X(0.2), 0.44, 0.65), P(0.36, 0.65));
    quadToEye(parts.ceiling, P(0.36, 0.65), v3(X(0.2), 0.44, 0.65), v3(X(0.2), 0.47, 1.6), P(0.36, 1.6));
  }
  // ---------------- Glareshield ----------------
  const LIP = { y: -0.202, z: -0.69 }, FACE = { top: [-0.21, -0.703], bottom: [-0.264, -0.692] }, PNL = { top: [-0.272, -0.745], bottom: [-0.647, -0.645] };
  quadToEye(parts.glare, WB.L, WB.C, v3(CX, LIP.y, LIP.z), v3(PANEL_X0, LIP.y, LIP.z));
  quadToEye(parts.glare, WB.C, WB.R, v3(PANEL_X1, LIP.y, LIP.z), v3(CX, LIP.y, LIP.z));
  cyl(parts.glare, v3(PANEL_X0, LIP.y - 0.007, LIP.z - 0.006), v3(PANEL_X1, LIP.y - 0.007, LIP.z - 0.006), 0.012, 0.012, 10); // rounded lip
  quadToEye(parts.atlas, v3(PANEL_X0, FACE.bottom[0], FACE.bottom[1]), v3(PANEL_X1, FACE.bottom[0], FACE.bottom[1]), v3(PANEL_X1, FACE.top[0], FACE.top[1]), v3(PANEL_X0, FACE.top[0], FACE.top[1]),
    [uvOf('glare', 0, 1), uvOf('glare', 1, 1), uvOf('glare', 1, 0), uvOf('glare', 0, 0)]);
  quadToEye(parts.trim, v3(PANEL_X0, FACE.bottom[0], FACE.bottom[1]), v3(PANEL_X1, FACE.bottom[0], FACE.bottom[1]), v3(PANEL_X1, PNL.top[0], PNL.top[1]), v3(PANEL_X0, PNL.top[0], PNL.top[1]));
  for (const x of [PANEL_X0, PANEL_X1]) beam(parts.glare, v3(x, LIP.y, LIP.z), v3(x, -0.25, -0.8), 0.025, 0.04, v3(0, 1, 0)); // end cheeks
  // FCU and EFIS knobs
  const faceAt = (x, f) => v3(x, lerp(FACE.top[0], FACE.bottom[0], f), lerp(FACE.top[1], FACE.bottom[1], f));
  const faceNormal = new THREE.Vector3(0, FACE.top[1] - FACE.bottom[1], -(FACE.top[0] - FACE.bottom[0])).normalize(); if (faceNormal.z < 0) faceNormal.negate();
  for (const fx of [0.09, 0.27, 0.656, 0.91]) { const c = faceAt(CX - 0.3 + fx * 0.6, 0.86); cyl(parts.knob, c, c.clone().addScaledVector(faceNormal, 0.022), 0.011, 0.01, 14); }
  for (const sd of [-1, 1]) for (const [x, f, r] of [[-0.2, 0.5, 0.012], [0.085, 0.5, 0.0105], [0.165, 0.5, 0.0105]]) { const xx = sd < 0 ? x : mirror(x), c = faceAt(xx, f); cyl(parts.knob, c, c.clone().addScaledVector(faceNormal, 0.018), r, r * 0.9, 12); }
  // ---------------- Main instrument panel ----------------
  const panelAt = (x, d) => v3(x, PNL.top[0] + (PNL.bottom[0] - PNL.top[0]) * d / 0.388, PNL.top[1] + (PNL.bottom[1] - PNL.top[1]) * d / 0.388);
  const panelNormal = new THREE.Vector3(0, PNL.top[1] - PNL.bottom[1], -(PNL.top[0] - PNL.bottom[0])).normalize(); if (panelNormal.z < 0) panelNormal.negate();
  quadToEye(parts.atlas, panelAt(PANEL_X0, 0.388), panelAt(PANEL_X1, 0.388), panelAt(PANEL_X1, 0), panelAt(PANEL_X0, 0),
    [uvOf('panel', 0, 1), uvOf('panel', 1, 1), uvOf('panel', 1, 0), uvOf('panel', 0, 0)]);
  // knee panel below, and the panel's outer cheeks
  quadToEye(parts.trim, panelAt(PANEL_X0, 0.388), v3(PANEL_X0, -0.95, -0.55), v3(PANEL_X1, -0.95, -0.55), panelAt(PANEL_X1, 0.388));
  // ---------------- Displays (live canvases; F/O side shows the same pages) ----------------
  const displays = [];
  function display(name, w, h, size, placements, rate) {
    let canvas = null, g = null, texture = null;
    if (isBrowser) { [canvas, g] = canvas2d(w, h); texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; texture.generateMipmaps = true; }
    const material = new THREE.MeshBasicMaterial({ map: texture, color: texture ? 0xffffff : 0x0a0d10, toneMapped: false, transparent: name === 'fcu', depthWrite: name !== 'fcu' });
    const geos = placements.map(([x, d]) => {
      const sx = size[0] / 2, list = [];
      const a = panelAt(x - sx, d + size[1]).addScaledVector(panelNormal, 0.003), b = panelAt(x + sx, d + size[1]).addScaledVector(panelNormal, 0.003);
      const c = panelAt(x + sx, d).addScaledVector(panelNormal, 0.003), e = panelAt(x - sx, d).addScaledVector(panelNormal, 0.003);
      quadToEye(list, a, b, c, e, [[0, 0], [1, 0], [1, 1], [0, 1]]); return list[0];
    });
    const mesh = new THREE.Mesh(K.merge(geos), material); mesh.name = `${name} display`; group.add(mesh);
    const entry = { name, g, texture, rate, next: 0, mesh }; displays.push(entry); return entry;
  }
  display('pfd', 512, 512, [0.15, 0.15], [[PFD_X, 0.012], [mirror(PFD_X), 0.012]], 15);
  display('nd', 512, 512, [0.15, 0.15], [[ND_X, 0.012], [mirror(ND_X), 0.012]], 8);
  display('ewd', 512, 512, [0.15, 0.15], [[CX, 0.012]], 5);
  display('sd', 512, 512, [0.15, 0.15], [[CX, 0.19]], 4);
  display('isis', 256, 256, [0.076, 0.076], [[ISIS_X, 0.017]], 10);
  // FCU windows: a transparent layer on the glareshield face
  const fcu = (() => {
    let canvas = null, g = null, texture = null;
    if (isBrowser) { [canvas, g] = canvas2d(512, 48); texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false, visible: !!texture });
    const list = [], off = (p) => p.addScaledVector(faceNormal, 0.002);
    quadToEye(list, off(faceAt(CX - 0.3, 1)), off(faceAt(CX + 0.3, 1)), off(faceAt(CX + 0.3, 0)), off(faceAt(CX - 0.3, 0)), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const mesh = new THREE.Mesh(list[0], material); mesh.name = 'FCU windows'; mesh.renderOrder = 2; group.add(mesh);
    return { g, texture, key: '' };
  })();
  // ---------------- Warning lights on the glareshield (dynamic) ----------------
  const warnMat = new THREE.MeshStandardMaterial({ color: 0x3a1210, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.4 });
  const cautMat = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xffa21a, emissiveIntensity: 0, roughness: 0.4 });
  const warnGeo = [], cautGeo = [];
  for (const sd of [-1, 1]) for (const [x, list] of [[-0.41, warnGeo], [-0.33, cautGeo]]) {
    const xx = sd < 0 ? x : mirror(x), c = faceAt(xx, 0.4).addScaledVector(faceNormal, 0.006);
    const g = new THREE.BoxGeometry(0.045, 0.026, 0.012); g.lookAt(faceNormal); g.translate(c.x, c.y, c.z); list.push(g);
  }
  const warnLights = new THREE.Mesh(K.merge(warnGeo), warnMat), cautLights = new THREE.Mesh(K.merge(cautGeo), cautMat); group.add(warnLights, cautLights);
  // ---------------- Gear lever and LDG GEAR lights (centre panel, right of the upper ECAM) ----------------
  const gx = GEAR_X, panelUp = panelAt(0, 0).sub(panelAt(0, 0.388)).normalize();
  const panelBasis = new THREE.Matrix4().makeBasis(v3(1, 0, 0), panelUp, panelNormal);
  const onPanel = (list, geo, x, d, lift = 0) => { geo.applyMatrix4(panelBasis); const c = panelAt(x, d).addScaledVector(panelNormal, lift); geo.translate(c.x, c.y, c.z); list.push(geo); return geo; };
  const gearMount = new THREE.Group(); gearMount.position.copy(panelAt(gx, 0.125).addScaledVector(panelNormal, 0.004)); gearMount.quaternion.setFromRotationMatrix(panelBasis); group.add(gearMount);
  const gearPivot = new THREE.Group(); gearMount.add(gearPivot);
  { const wheel = new THREE.CylinderGeometry(0.021, 0.021, 0.016, 18); wheel.rotateZ(Math.PI / 2); wheel.translate(0, 0, 0.075);
    gearPivot.add(new THREE.Mesh(K.rod(v3(0, 0, 0), v3(0, 0, 0.068), 0.0065, 0.0055, 8), mat.metal), new THREE.Mesh(wheel, new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.55 }))); }
  onPanel(parts.knob, new THREE.BoxGeometry(0.03, 0.11, 0.006), gx, 0.125, 0.002); // lever gate
  // raised bezels round the display units (the screens sit 4 mm behind their front faces)
  for (const [xc, d0, size] of [[PFD_X, 0.012, 0.15], [ND_X, 0.012, 0.15], [mirror(ND_X), 0.012, 0.15], [mirror(PFD_X), 0.012, 0.15], [CX, 0.012, 0.15], [CX, 0.19, 0.15], [ISIS_X, 0.017, 0.076]]) {
    const t = 0.011, h = 0.007, dc = d0 + size / 2;
    onPanel(parts.trim, new THREE.BoxGeometry(size + 2 * t, t, h), xc, d0 - t / 2, h / 2);
    onPanel(parts.trim, new THREE.BoxGeometry(size + 2 * t, t * 1.5, h), xc, d0 + size + t * 0.75, h / 2);
    onPanel(parts.trim, new THREE.BoxGeometry(t, size, h), xc - size / 2 - t / 2, dc, h / 2);
    onPanel(parts.trim, new THREE.BoxGeometry(t, size, h), xc + size / 2 + t / 2, dc, h / 2);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = xc + sx * (size / 2 + 0.005), d = sy < 0 ? d0 - 0.004 : d0 + size + 0.01;
      onPanel(parts.metal, new THREE.CylinderGeometry(0.0026, 0.0026, 0.0016, 8).rotateX(Math.PI / 2), x, d, 0.008);
      onPanel(parts.knob, new THREE.BoxGeometry(0.0032, 0.0005, 0.0003), x, d, 0.009);
    }
    if (size > 0.1) for (const s of [-1, 1]) parts.knob.push(K.rod(panelAt(xc + s * 0.06, d0 + size + 0.008).addScaledVector(panelNormal, 0.006), panelAt(xc + s * 0.06, d0 + size + 0.008).addScaledVector(panelNormal, 0.017), 0.006, 0.0055, 10));
  }
  const gearLightMat = new THREE.MeshBasicMaterial({ color: 0x18201a, toneMapped: false });
  { const list = [];
    for (const dx of [-0.03, 0, 0.03]) onPanel(list, new THREE.BoxGeometry(0.022, 0.015, 0.005), gx + dx, 0.045, 0.003);
    group.add(new THREE.Mesh(K.merge(list), gearLightMat)); }
  // ---------------- Centre pedestal: MCDU slope at the front, flat top with the thrust quadrant ----------------
  const PED = { x0: PED_X0, x1: PED_X0 + PED_W, front: [-0.667, -0.645], slope: [-0.745, -0.42], back: [-0.755, 0.3] };
  const slopeAt = (x, t) => v3(x, lerp(PED.front[0], PED.slope[0], t), lerp(PED.front[1], PED.slope[1], t)); // t 0 (top) .. 1
  const flatAt = (x, v) => { const t = v / PED_L; return v3(x, lerp(PED.slope[0], PED.back[0], t), lerp(PED.slope[1], PED.back[1], t)); }; // v metres aft
  quadToEye(parts.atlas, flatAt(PED.x0, 0), flatAt(PED.x1, 0), flatAt(PED.x1, PED_L), flatAt(PED.x0, PED_L), [uvOf('pedestal', 0, 0), uvOf('pedestal', 1, 0), uvOf('pedestal', 1, 1), uvOf('pedestal', 0, 1)]);
  quadToEye(parts.trim, slopeAt(PED.x0, 0), slopeAt(PED.x1, 0), slopeAt(PED.x1, 1), slopeAt(PED.x0, 1));
  for (const x of [PED.x0, PED.x1]) {
    quadToEye(parts.trim, slopeAt(x, 0), slopeAt(x, 1), v3(x, -1.2, PED.slope[1]), v3(x, -1.2, PED.front[1]));
    quadToEye(parts.trim, flatAt(x, 0), flatAt(x, PED_L), v3(x, -1.2, PED.back[1]), v3(x, -1.2, PED.slope[1]));
  }
  for (const x of [PED.x0, PED.x1]) beam(parts.trim, flatAt(x, 0).add(v3(0, 0.004, 0)), flatAt(x, PED_L).add(v3(0, 0.004, 0)), 0.012, 0.012, v3(0, 1, 0)); // edge rails
  const slopeUp = slopeAt(0, 0).sub(slopeAt(0, 1)).normalize(), slopeN = new THREE.Vector3(1, 0, 0).cross(slopeUp).normalize();
  const slopeBasis = new THREE.Matrix4().makeBasis(v3(1, 0, 0), slopeUp, slopeN);
  const onSlope = (list, geo, x, t, lift) => { geo.applyMatrix4(slopeBasis); const c = slopeAt(x, t).addScaledVector(slopeN, lift); geo.translate(c.x, c.y, c.z); list.push(geo); return geo; };
  // two MCDUs
  for (const dx of [-0.1, 0.1]) {
    const x0 = CX + dx - 0.074, x1 = CX + dx + 0.074, at = (x, t, h) => slopeAt(x, t).addScaledVector(slopeN, h);
    quadToEye(parts.knob, at(x0, 0.03, 0.012), at(x1, 0.03, 0.012), at(x1, 0.98, 0.012), at(x0, 0.98, 0.012));
    quadToEye(parts.atlas, at(x0 + 0.02, 0.07, 0.0135), at(x1 - 0.02, 0.07, 0.0135), at(x1 - 0.02, 0.47, 0.0135), at(x0 + 0.02, 0.47, 0.0135), [uvOf('mcdu', 0, 0), uvOf('mcdu', 1, 0), uvOf('mcdu', 1, 1), uvOf('mcdu', 0, 1)]);
    for (const sx of [x0 + 0.01, x1 - 0.01]) for (let i = 0; i < 6; i++) onSlope(parts.trim, new THREE.BoxGeometry(0.011, 0.009, 0.006), sx, 0.1 + i * 0.065, 0.014);
    for (let i = 0; i < 30; i++) onSlope(parts.trim, new THREE.BoxGeometry(0.017, 0.013, 0.006), x0 + 0.019 + (i % 6) * 0.022, 0.55 + Math.floor(i / 6) * 0.085, 0.014);
  }
  // thrust gate plates, pitch-trim wheels, engine masters, parking brake handle
  for (const dx of [-0.052, 0.052]) { const a = flatAt(CX + dx, 0.13), b = flatAt(CX + dx, 0.35); beam(parts.trim, a.add(v3(0, 0.012, 0)), b.add(v3(0, 0.012, 0)), 0.008, 0.024, v3(0, 1, 0)); }
  for (const x of [PED.x0 - 0.016, PED.x1 + 0.016]) {
    const c = flatAt(x, 0.25).add(v3(0, -0.098, 0)), wheel = new THREE.CylinderGeometry(0.1, 0.1, 0.026, 32); wheel.rotateZ(Math.PI / 2); wheel.translate(c.x, c.y, c.z); parts.knob.push(wheel);
    const stripe = new THREE.BoxGeometry(0.028, 0.012, 0.012); stripe.translate(c.x, c.y + 0.094, c.z); parts.lining.push(stripe);
  }
  for (const dx of [-0.075, 0.075]) { const p = flatAt(CX + dx, 0.43); boxAt(parts.knob, p.x, p.y + 0.014, p.z, 0.018, 0.028, 0.026); }
  { const p = flatAt(CX, 0.648); boxAt(parts.knob, p.x, p.y + 0.012, p.z, 0.05, 0.016, 0.026); }
  // levers (pivot groups below the pedestal surface so the stems travel along their slots)
  function lever(pos, list, matl) { const pivot = new THREE.Group(); pivot.position.copy(pos); group.add(pivot); pivot.add(new THREE.Mesh(K.merge(list), matl)); return pivot; }
  const thrustPivot = lever(flatAt(CX, 0.24).add(v3(0, -0.1, 0)), (() => {
    const list = [];
    for (const dx of [-0.026, 0.026]) {
      list.push(K.box(dx, 0.155, 0, 0.011, 0.13, 0.02));
      const grip = new THREE.CylinderGeometry(0.016, 0.016, 0.042, 14); grip.rotateZ(Math.PI / 2); grip.translate(dx + Math.sign(dx) * 0.008, 0.225, -0.006); list.push(grip);
      list.push(K.box(dx, 0.205, 0.012, 0.016, 0.03, 0.01)); // reverser latch
    }
    return list;
  })(), mat.knob);
  { const red = new THREE.MeshStandardMaterial({ color: 0xc8261c, roughness: 0.5 });
    for (const dx of [-0.056, 0.056]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), red); b.position.set(dx, 0.225, -0.006); thrustPivot.add(b); } }
  const speedbrakePivot = lever(flatAt(PED.x0 + 0.04, 0.21).add(v3(0, -0.1, 0)), [K.box(0, 0.15, 0, 0.008, 0.12, 0.008), K.box(0.01, 0.212, 0, 0.042, 0.012, 0.018)], mat.metal);
  const flapPivot = lever(flatAt(PED.x1 - 0.045, 0.21).add(v3(0, -0.1, 0)), [K.box(0, 0.15, 0, 0.01, 0.12, 0.01), K.box(-0.008, 0.214, 0, 0.05, 0.02, 0.03)], mat.knob);
  // ---------------- Side consoles, sidesticks, tiller, rudder pedals ----------------
  const sticks = [];
  for (const sd of [-1, 1]) {
    const X = (x) => (sd < 0 ? x : mirror(x));
    const x0 = X(-0.7), x1 = X(-0.46), top = -0.56;
    const reg = sd < 0 ? 'consoleL' : 'consoleR';
    quadToEye(parts.atlas, v3(Math.min(x0, x1), top, -0.62), v3(Math.max(x0, x1), top, -0.62), v3(Math.max(x0, x1), top, 0.35), v3(Math.min(x0, x1), top, 0.35), [uvOf(reg, 0, 0), uvOf(reg, 1, 0), uvOf(reg, 1, 1), uvOf(reg, 0, 1)]);
    quadToEye(parts.trim, v3(X(-0.46), top, -0.62), v3(X(-0.46), top, 0.35), v3(X(-0.46), -1.0, 0.35), v3(X(-0.46), -1.0, -0.62));
    quadToEye(parts.trim, v3(X(-0.7), top, -0.62), v3(X(-0.46), top, -0.62), v3(X(-0.46), -1.0, -0.62), v3(X(-0.78), -1.0, -0.62));
    // tiller
    { const c = v3(X(-0.64), top + 0.035, -0.47); const ring = new THREE.TorusGeometry(0.042, 0.008, 6, 22); ring.rotateX(Math.PI / 2); ring.translate(c.x, c.y, c.z); parts.trim.push(ring);
      parts.trim.push(K.rod(c.clone().add(v3(-0.042, 0, 0)), c.clone().add(v3(0.042, 0, 0)), 0.006, 0.006, 6), K.rod(c, c.clone().add(v3(0, -0.035, 0)), 0.012, 0.016, 10)); }
    // sidestick: pivot at the console, grip leaning slightly forward
    const pivot = new THREE.Group(); pivot.position.set(X(-0.62), top + 0.005, -0.27); group.add(pivot);
    const grip = [], dark = [];
    dark.push(K.placed(new THREE.CylinderGeometry(0.035, 0.05, 0.03, 16), v3(0, 0.012, 0)));
    grip.push(K.rod(v3(0, 0.02, 0), v3(0, 0.07, -0.006), 0.017, 0.016, 12), K.rod(v3(0, 0.07, -0.006), v3(0, 0.135, -0.018), 0.019, 0.022, 12));
    grip.push(K.placed(new THREE.SphereGeometry(0.023, 12, 8), v3(0, 0.138, -0.02), null, v3(1, 0.7, 1.15)));
    const stickMesh = new THREE.Mesh(K.merge(grip), mat.knob), bootMesh = new THREE.Mesh(K.merge(dark), mat.trim);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc8261c, roughness: 0.5 })); button.position.set(sd < 0 ? -0.012 : 0.012, 0.142, -0.008);
    pivot.add(stickMesh, bootMesh, button); sticks.push(pivot);
  }
  const pedals = [];
  for (const sd of [-1, 1]) for (const dx of [-0.13, 0.13]) {
    const pivot = new THREE.Group(); pivot.position.set((sd < 0 ? 0 : 2 * CX) + dx, -1.0, -0.62); group.add(pivot);
    const m = new THREE.Mesh(K.merge([K.box(0, 0.09, 0, 0.09, 0.15, 0.015, -0.35, 0, 0), K.box(0, 0.0, 0.04, 0.015, 0.02, 0.1)]), mat.trim); pivot.add(m);
    pedals.push({ pivot, dx });
  }
  // ---------------- Overhead panel ----------------
  { const f = v3(0, 0.292, -0.585), b = v3(0, 0.395, 0.3), x0 = CX - OVH_W / 2, x1 = CX + OVH_W / 2;
    const along = b.clone().sub(f).normalize(), down = new THREE.Vector3(0, -along.z, along.y).normalize();
    const at = (u, v, h = 0) => f.clone().addScaledVector(along, v).add(v3(x0 + u, 0, 0)).addScaledVector(down, h);
    quadToEye(parts.ceiling, v3(x0, 0.403, 0.3), v3(x1, 0.403, 0.3), v3(x1, 0.445, 0.65), v3(x0, 0.445, 0.65));
    quadToEye(parts.ceiling, v3(x0, 0.445, 0.65), v3(x1, 0.445, 0.65), v3(x1, 0.47, 1.6), v3(x0, 0.47, 1.6));
    quadToEye(parts.atlas, at(0, 0), at(OVH_W, 0), at(OVH_W, OVH_L), at(0, OVH_L), [uvOf('overhead', 0, 1), uvOf('overhead', 1, 1), uvOf('overhead', 1, 0), uvOf('overhead', 0, 0)]);
    for (const u of [0, OVH_W]) beam(parts.trim, at(u, 0, 0.006), at(u, OVH_L, 0.006), 0.016, 0.014, v3(0, 1, 0));
    beam(parts.trim, at(0, 0.004, 0.008), at(OVH_W, 0.004, 0.008), 0.014, 0.016, v3(0, 0, 1));
    // toggle levers (EXT LT, SIGNS, INT LT) and rotary knobs, standing proud of the panel
    const toggles = [...[0, 1, 2, 3, 4].map(i => [0.14 + i * 0.045, 0.06]), ...[0, 1, 2].map(i => [0.165 + i * 0.075, 0.25]), [0.66, 0.26]];
    for (const [u, v] of toggles) parts.knob.push(K.rod(at(u, v, 0), at(u, v - 0.006, 0.02), 0.0035, 0.0028, 6));
    for (const [u, v, r] of [[0.06, 0.06, 0.01], [0.66, 0.06, 0.01], [0.42, 0.25, 0.01], [0.54, 0.25, 0.01], [0.66, 0.18, 0.009], [0.06, 0.4, 0.012], [0.06, 0.52, 0.012], [0.06, 0.64, 0.012]]) parts.knob.push(K.rod(at(u, v, 0), at(u, v, 0.014), r, r * 0.9, 12));
  }
  // ---------------- First officer's seat (seen when looking right) ----------------
  { const sx = 2 * CX, tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0));
    parts.seat.push(K.placed(roundedCabinPart(THREE, 0.5, 0.1, 0.5, 0.035), v3(sx, -0.52, 0.02)));
    parts.seat.push(K.placed(roundedCabinPart(THREE, 0.48, 0.72, 0.12, 0.035), v3(sx, -0.12, 0.3), tilt));
    parts.seat.push(K.placed(roundedCabinPart(THREE, 0.3, 0.2, 0.1, 0.028), v3(sx, 0.33, 0.35), tilt));
    for (const s of [-1, 1]) {
      boxAt(parts.trim, sx + s * 0.27, -0.33, 0.05, 0.05, 0.06, 0.4);
      beam(parts.trim, v3(sx + s * 0.17, 0.18, 0.238), v3(sx + s * 0.025, -0.45, 0.215), 0.027, 0.003, v3(0, 0, 1));
      boxAt(parts.metal, sx + s * 0.04, -0.455, 0.212, 0.046, 0.025, 0.004);
      beam(parts.lining, v3(sx + s * 0.203, -0.45, 0.226), v3(sx + s * 0.203, 0.2, 0.292), 0.0015, 0.0015, v3(0, 0, 1));
    }
  }
  // ---------------- Closing surfaces (the exterior model is hidden in this view) ----------------
  quadToEye(parts.trim, v3(-0.75, -1.2, -0.95), v3(1.87, -1.2, -0.95), v3(1.87, -1.2, 1.6), v3(-0.75, -1.2, 1.6));        // floor
  quadToEye(parts.lining, v3(-0.75, -1.2, 1.6), v3(1.87, -1.2, 1.6), v3(1.87, 0.5, 1.6), v3(-0.75, 0.5, 1.6));            // rear bulkhead
  boxAt(parts.frame, CX, -0.25, 1.58, 0.75, 1.9, 0.03);                                                                          // flight-deck door
  quadToEye(parts.glare, v3(-0.75, -0.32, -0.9), v3(1.87, -0.32, -0.9), v3(1.87, -1.2, -0.9), v3(-0.75, -1.2, -0.9));      // behind the panel
  // ---------------- Merge static parts ----------------
  for (const [key, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(K.merge(list), mat[key]); mesh.name = `cockpit ${key}`; group.add(mesh);
  }
  group.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; } });

  // ---------------- Update ----------------
  let time = 0, prevIas = null, trend = 0, thrustAngle = 0, speedbrake = 0, flapLever = 0, gearLever = 1;
  const brakeTemp = [55, 55, 55, 55];
  const lookQ = new THREE.Quaternion(), lookE = new THREE.Euler(0, 0, 0, 'YXZ');
  function values(state, data) {
    const ap = state.autopilot || {};
    const ias = (data.indicatedAirspeed ?? 0) * KT, hdg = wrap360((data.heading ?? 0) + headingOffset);
    const pos = state.position;
    return {
      pitch: data.pitch ?? 0, roll: data.roll ?? 0, slip: data.sideslip ?? 0, ias, trend,
      alt: ((data.altitude ?? 0) + altitudeOffset) * FT, vs: (data.verticalSpeed ?? 0) * 196.85, ra: Math.max(0, ((data.agl ?? 0) - 4) * FT),
      hdg, hdgLocal: data.heading ?? 0, trk: wrap360((data.groundTrack ?? data.heading ?? 0) + headingOffset), course: wrap360(headingOffset),
      ils: !!data.ilsValid, loc: data.localizerDeviation ?? 0, gs: data.glideslopeDeviation ?? 0, dme: Math.max(0, (data.distanceToThreshold ?? 0) / 1852),
      ap: !!ap.enabled, apSpeed: (ap.speed ?? 0) * KT, apHdg: wrap360((ap.heading ?? 0) + headingOffset), apAlt: ((ap.altitude ?? 0) + altitudeOffset) * FT,
      vs1: (data.stallSpeed ?? 0) * KT, overspeed: !!data.overspeedWarning, stall: !!data.stallWarning, gearWarn: !!data.gearWarning, blink: time % 0.8 < 0.5,
      gs_: (data.groundSpeed ?? 0) * KT, tas: (data.airspeed ?? 0) * KT, windDir: wrap360((data.windDirection ?? 0) + headingOffset), windKt: (data.windSpeed ?? 0) * KT,
      rwy: pos && typeof data.distanceToThreshold === 'number' ? { dx: -pos.x, dz: -data.distanceToThreshold, far: typeof data.runwayRemaining === 'number' ? -data.runwayRemaining : -data.distanceToThreshold - 3000 } : null, ident,
      n1: [data.engineN1 ?? 0, data.engineN1 ?? 0], egt: [0, 1].map(() => (data.engineN1 ?? 0) > 1 ? 390 + (data.engineN1 - 20) * 6.4 : 30), cmd: 20 + (state.throttle ?? 0) * 80,
      fob: data.fuel ?? state.fuel ?? 0, flap: data.flapPosition ?? state.flapPosition ?? 0, flapCmd: state.flaps ?? data.flapPosition ?? 0,
      spoilers: !!state.spoilers, spoiler: speedbrake, thr: state.throttle ?? 0, gearPos: data.gearPosition ?? state.gearPosition ?? 1, gearCmd: state.gear ?? true,
      gearDown: (data.gearPosition ?? 1) > 0.98, onGround: !!data.onGround, brake: state.brake ?? 0, brakeTemp,
      ldgMemo: !data.onGround && (data.agl ?? 9999) < 600 && !!data.ilsValid,
      tat: 12 - ((data.altitude ?? 0) * 0.0065), gw: 50000 + (data.fuel ?? 0), utc: (() => { const m = Math.floor(14 * 60 + 32 + time / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; })(),
    };
  }
  function update(state = {}, data = {}) {
    const dt = clamp(state.dt ?? data.dt ?? 1 / 60, 0, 0.1); time += dt;
    // head look: keep the cockpit fixed to the airframe while the camera turns
    if (typeof state.lookYaw === 'number' || typeof state.lookPitch === 'number') {
      lookE.set(state.lookPitch || 0, state.lookYaw || 0, 0, 'YXZ'); lookQ.setFromEuler(lookE).invert(); group.quaternion.copy(lookQ);
    }
    // speed trend (kt over the next 10 s), smoothed
    const ias = (data.indicatedAirspeed ?? 0) * KT;
    if (prevIas != null && dt > 0) trend += ((ias - prevIas) / dt * 10 - trend) * (1 - Math.exp(-dt * 2));
    prevIas = ias;
    // controls
    const ease = (cur, target, rate) => cur + clamp(target - cur, -rate * dt, rate * dt);
    thrustAngle = ease(thrustAngle, Math.atan((lerp(0.3, 0.14, clamp(state.throttle ?? 0, 0, 1)) - 0.24) / 0.1), 3);
    thrustPivot.rotation.x = thrustAngle;
    speedbrake = ease(speedbrake, state.spoilers ? 1 : 0, 3); speedbrakePivot.rotation.x = Math.atan(-0.7 + 1.4 * speedbrake);
    flapLever = ease(flapLever, clamp(state.flaps ?? data.flapPosition ?? 0, 0, 3), 6); flapPivot.rotation.x = Math.atan(-0.7 + 1.4 * flapLever / 3);
    gearLever = ease(gearLever, (state.gear ?? true) ? 1 : 0, 6); gearPivot.rotation.x = lerp(-0.5, 0.45, gearLever);
    const roll = clamp(state.rollInput ?? 0, -1, 1), pitch = clamp(state.pitchInput ?? 0, -1, 1), yaw = clamp(state.yawInput ?? 0, -1, 1);
    for (const stick of sticks) { stick.rotation.x = pitch * 0.28; stick.rotation.z = -roll * 0.28; }
    for (const p of pedals) p.pivot.position.z = -0.62 + (p.dx < 0 ? 1 : -1) * yaw * 0.045;
    // brakes warm up when used at speed, cool slowly
    for (let i = 0; i < 4; i++) brakeTemp[i] += ((state.brake ?? 0) * (data.groundSpeed ?? 0) * 0.9 * (data.onGround ? 1 : 0) - (brakeTemp[i] - 55) * 0.004) * dt;
    // warning lights
    const warn = !!(data.stallWarning || data.overspeedWarning || data.gearWarning), caut = !!(state.spoilers && (state.throttle ?? 0) > 0.5) || (data.fuel ?? 9999) < 1500;
    warnMat.emissiveIntensity = warn && time % 0.8 < 0.5 ? 2.2 : 0; cautMat.emissiveIntensity = caut ? 1.8 : 0;
    const gp = data.gearPosition ?? state.gearPosition ?? 1;
    gearLightMat.color.set(gp > 0.02 && gp < 0.98 ? 0xff3020 : gp >= 0.98 ? 0x30ff60 : 0x18201a);
    if (!isBrowser) return;
    // displays, each at its own rate, at most two canvas uploads per frame
    let budget = 2; const v = values(state, data); v.gs = data.glideslopeDeviation ?? 0; v.gsKt = v.gs_;
    const ordered = [...displays].sort((a, b) => a.next - b.next);
    for (const d of ordered) {
      if (budget <= 0 || time < d.next) continue;
      d.next = time + 1 / d.rate; budget--;
      if (d.name === 'pfd') drawPFD(d.g, v);
      else if (d.name === 'nd') drawND(d.g, { ...v, gs: v.gs_ });
      else if (d.name === 'ewd') drawEWD(d.g, v);
      else if (d.name === 'sd') drawSD(d.g, v);
      else if (d.name === 'isis') drawISIS(d.g, v);
      d.texture.needsUpdate = true;
    }
    const key = `${v.ap}|${Math.round(v.apSpeed)}|${Math.round(v.apHdg)}|${Math.round(v.apAlt / 100)}`;
    if (key !== fcu.key) { fcu.key = key; drawFCU(fcu.g, v); fcu.texture.needsUpdate = true; }
  }
  group.update = update; group.dispose = () => { disposeObject(group); finish.dispose(); };
  update({}, {});
  return group;
}
