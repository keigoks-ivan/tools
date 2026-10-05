// MQ-172 雲雀 (Lark): fictional high-wing, single-engine four-seat trainer in the 天青航空 (SKYGLAZE) livery. Metres.
// The aircraft's nose points along local -Z, +X is the right wing, +Y is up. Origin = physics reference point;
// wheel bottoms sit at y = -1.2 (mains at x = +-1.26, z = 0.18; nose wheel at z = -1.58). Same {group, update, dispose}
// contract as aircraft.js. Everything is generated in code: no model files, no runtime fetches.
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const DEG10 = Math.PI / 18; // one flap notch
const KT = 1.943844, FT = 3.28084;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const sgn = (v) => (v < 0 ? -1 : 1);
const hasDOM = () => typeof document !== 'undefined';

// Monotone cubic (Fritsch-Carlson) through [x, y] pairs: smooth, never overshoots. Clamped outside the range.
function monotone(points) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ---- Geometry kit -------------------------------------------------------------------------------------------------------
function geometryKit(THREE) {
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  function geo(positions, indices, uvs, colors) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }
  // Transform in place: position, Euler rotation (radians), scale (number or [x,y,z]).
  function place(g, p = [0, 0, 0], r = [0, 0, 0], s = 1, order = 'XYZ') {
    E.set(r[0], r[1], r[2], order); Q.setFromEuler(E);
    M.compose(P.set(p[0], p[1], p[2]), Q, Array.isArray(s) ? S.set(s[0], s[1], s[2]) : S.set(s, s, s));
    return g.applyMatrix4(M);
  }
  function ensureIndex(g) {
    if (!g.index) { const n = g.attributes.position.count, a = []; for (let i = 0; i < n; i++) a.push(i); g.setIndex(a); }
    return g;
  }
  function flip(g) { // reverse triangle winding (normals untouched)
    ensureIndex(g); const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    g.index.needsUpdate = true; return g;
  }
  function signedVolume(g) {
    ensureIndex(g); const p = g.attributes.position, a = g.index.array; let v = 0;
    for (let i = 0; i < a.length; i += 3) {
      const ax = p.getX(a[i]), ay = p.getY(a[i]), az = p.getZ(a[i]), bx = p.getX(a[i + 1]), by = p.getY(a[i + 1]), bz = p.getZ(a[i + 1]);
      const cx = p.getX(a[i + 2]), cy = p.getY(a[i + 2]), cz = p.getZ(a[i + 2]);
      v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
    return v;
  }
  // Closed meshes: make every face point outward, then recompute smooth normals.
  function outward(g) { if (signedVolume(g) < 0) flip(g); g.computeVertexNormals(); return g; }
  // Open patches: make the first triangle's normal agree with `dir(x,y,z)` (an outward hint).
  function facing(g, dir) {
    ensureIndex(g); const p = g.attributes.position, a = g.index.array;
    const A = new THREE.Vector3().fromBufferAttribute(p, a[0]), B = new THREE.Vector3().fromBufferAttribute(p, a[1]), C = new THREE.Vector3().fromBufferAttribute(p, a[2]);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    const c = A.clone().add(B).add(C).multiplyScalar(1 / 3), h = dir(c.x, c.y, c.z);
    if (n.x * h[0] + n.y * h[1] + n.z * h[2] < 0) flip(g);
    g.computeVertexNormals(); return g;
  }
  function mirrorX(g) { const m = g.clone(); m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)); return flip(m); }
  // Merge geometries (each already in its final place) into one; missing uv/color attributes are filled in.
  function merge(list) {
    list = list.filter(Boolean).map(ensureIndex);
    let vCount = 0, iCount = 0;
    const hasColor = list.some(g => g.attributes.color);
    for (const g of list) { if (!g.attributes.normal) g.computeVertexNormals(); vCount += g.attributes.position.count; iCount += g.index.count; }
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const col = hasColor ? new Float32Array(vCount * 3).fill(1) : null;
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    let vo = 0, io = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      for (let i = 0; i < n; i++) {
        pos[(vo + i) * 3] = g.attributes.position.getX(i); pos[(vo + i) * 3 + 1] = g.attributes.position.getY(i); pos[(vo + i) * 3 + 2] = g.attributes.position.getZ(i);
        nor[(vo + i) * 3] = g.attributes.normal.getX(i); nor[(vo + i) * 3 + 1] = g.attributes.normal.getY(i); nor[(vo + i) * 3 + 2] = g.attributes.normal.getZ(i);
        if (g.attributes.uv) { uv[(vo + i) * 2] = g.attributes.uv.getX(i); uv[(vo + i) * 2 + 1] = g.attributes.uv.getY(i); }
        if (col && g.attributes.color) { col[(vo + i) * 3] = g.attributes.color.getX(i); col[(vo + i) * 3 + 1] = g.attributes.color.getY(i); col[(vo + i) * 3 + 2] = g.attributes.color.getZ(i); }
      }
      const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      vo += n; io += a.length; g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  // Loft through rings (arrays of [x,y,z], equal length, each closed). Optional caps (fan to the centroid).
  // uvFn(ringIndex, pointIndex) -> [u, v]. Output is oriented outward (closed) when both ends are capped.
  function loft(rings, { capStart = true, capEnd = true, uvFn = null, orient = true } = {}) {
    const n = rings[0].length, positions = [], uvs = [], indices = [];
    rings.forEach((ring, r) => ring.forEach((p, i) => { positions.push(p[0], p[1], p[2]); const uv = uvFn ? uvFn(r, i) : [r / (rings.length - 1), i / n]; uvs.push(uv[0], uv[1]); }));
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + (i + 1) % n, c = a + n, d = b + n;
      indices.push(a, c, b, b, c, d);
    }
    for (const [r, on] of [[0, capStart], [rings.length - 1, capEnd]]) {
      if (!on) continue;
      const ring = rings[r], center = positions.length / 3; let cx = 0, cy = 0, cz = 0;
      for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
      positions.push(cx / n, cy / n, cz / n); const uv = uvFn ? uvFn(r, 0) : [0, 0]; uvs.push(uv[0], uv[1]);
      for (let i = 0; i < n; i++) indices.push(center, r * n + i, r * n + (i + 1) % n);
    }
    const g = geo(positions, indices, uvs);
    if (orient && capStart && capEnd) outward(g);
    return g;
  }
  // Surface patch from a closed outline in parameter space (a,b): concentric rings shrink toward the centroid so the
  // patch follows a curved surface. map(a, b) -> [x, y, z]; uv(a, b) -> [u, v] optional.
  function patch(outline, map, { rings = 3, uv = null, normal = null, step = 0.06 } = {}) {
    // Resample long edges so triangles stay small enough to follow the surface curvature.
    const dense = [];
    outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length], d = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(1, Math.ceil(d / step));
      for (let j = 0; j < k; j++) dense.push([p[0] + (q[0] - p[0]) * j / k, p[1] + (q[1] - p[1]) * j / k]); });
    outline = dense;
    let ca = 0, cb = 0; for (const [a, b] of outline) { ca += a; cb += b; } ca /= outline.length; cb /= outline.length;
    const n = outline.length, positions = [], uvs = [], normals = [], indices = [];
    const put = (pa, pb) => { positions.push(...map(pa, pb)); uvs.push(...(uv ? uv(pa, pb) : [0, 0])); if (normal) normals.push(...normal(pa, pb)); };
    for (let k = 0; k < rings; k++) {
      const s = 1 - k / rings;
      for (const [a, b] of outline) put(ca + (a - ca) * s, cb + (b - cb) * s);
    }
    put(ca, cb);
    const center = rings * n;
    for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + (i + 1) % n;
      if (k === rings - 1) indices.push(a, b, center);
      else indices.push(a, b, a + n, b, b + n, a + n);
    }
    const g = geo(positions, indices, uvs);
    if (normal) { g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); orientByNormals(g); }
    return g;
  }
  // Flip each triangle whose winding disagrees with its (analytic) vertex normals.
  function orientByNormals(g) {
    const p = g.attributes.position, nr = g.attributes.normal, a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const i0 = a[i], i1 = a[i + 1], i2 = a[i + 2];
      const ux = p.getX(i1) - p.getX(i0), uy = p.getY(i1) - p.getY(i0), uz = p.getZ(i1) - p.getZ(i0);
      const vx = p.getX(i2) - p.getX(i0), vy = p.getY(i2) - p.getY(i0), vz = p.getZ(i2) - p.getZ(i0);
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const nx = nr.getX(i0) + nr.getX(i1) + nr.getX(i2), ny = nr.getY(i0) + nr.getY(i1) + nr.getY(i2), nz = nr.getZ(i0) + nr.getZ(i1) + nr.getZ(i2);
      if (fx * nx + fy * ny + fz * nz < 0) { a[i + 1] = i2; a[i + 2] = i1; }
    }
    g.index.needsUpdate = true; return g;
  }
  // Rounded polygon outline (corners rounded with radius r, `seg` points per corner).
  function rounded(corners, r, seg = 4) {
    const out = [], n = corners.length;
    for (let i = 0; i < n; i++) {
      const p = corners[i], a = corners[(i + n - 1) % n], b = corners[(i + 1) % n];
      const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const rr = Math.min(r, da * 0.45, db * 0.45);
      const pa = [p[0] + (a[0] - p[0]) / da * rr, p[1] + (a[1] - p[1]) / da * rr], pb = [p[0] + (b[0] - p[0]) / db * rr, p[1] + (b[1] - p[1]) / db * rr];
      for (let k = 0; k <= seg; k++) { // quadratic Bezier pa -> p -> pb
        const t = k / seg, u = 1 - t;
        out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]);
      }
    }
    return out;
  }
  // Streamlined (elliptical) tube from a to b, chord along `chordDir` (projected square to the axis).
  function strut(a, b, chord, thick, { segs = 12, chordDir = [0, 0, 1], taper = 1 } = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), axis = B.clone().sub(A).normalize();
    const c = new THREE.Vector3(...chordDir); c.sub(axis.clone().multiplyScalar(c.dot(axis))).normalize();
    const t = axis.clone().cross(c).normalize();
    const ring = (O, s) => { const pts = []; for (let i = 0; i < segs; i++) { const ang = i / segs * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
      const along = cs * chord / 2 * s * (cs > 0 ? 1.15 : 0.85), across = sn * thick / 2 * s * (cs > 0 ? 1 - 0.35 * cs : 1); // teardrop: blunt nose, fine tail
      pts.push([O.x + c.x * along + t.x * across, O.y + c.y * along + t.y * across, O.z + c.z * along + t.z * across]); } return pts; };
    // chord points "forward" toward -chordDir for the nose: flip so the blunt side leads (cs<0 side is the tail above)
    return loft([ring(A, 1), ring(B, taper)]);
  }
  return { geo, place, flip, outward, facing, mirrorX, merge, loft, patch, rounded, strut, ensureIndex, orientByNormals };
}

// Buckets of geometry merged into one mesh per material key.
function bucketSet(THREE, K) {
  const parts = new Map();
  return {
    add(key, g) { if (!g) return g; if (!parts.has(key)) parts.set(key, []); parts.get(key).push(g); return g; },
    build(parent, materials, { castShadow = true, receiveShadow = true } = {}) {
      const meshes = {};
      for (const [key, list] of parts) {
        const mesh = new THREE.Mesh(K.merge(list), materials[key]);
        mesh.name = key; mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        parent.add(mesh); meshes[key] = mesh;
      }
      parts.clear();
      return meshes;
    },
  };
}

// Small generated sky (equirect) for reflections. Applied per material only (never scene.environment).
function skyEnvironment(THREE) {
  if (!hasDOM()) return null;
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), s = g.createLinearGradient(0, 0, 0, H);
  s.addColorStop(0, '#3f74b4'); s.addColorStop(0.3, '#7eaedb'); s.addColorStop(0.47, '#dce8f0'); s.addColorStop(0.5, '#f4f6f4');
  s.addColorStop(0.53, '#9aa38c'); s.addColorStop(0.7, '#6b7258'); s.addColorStop(1, '#3c4034');
  g.fillStyle = s; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dim cabin surroundings for chrome and plastic reflections inside the cockpit.
function cabinEnvironment(THREE) {
  if (!hasDOM()) return null;
  const W = 128, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), s = g.createLinearGradient(0, 0, 0, H);
  s.addColorStop(0, '#a3b6c6'); s.addColorStop(0.36, '#8b99a5'); s.addColorStop(0.5, '#3a3d41'); s.addColorStop(1, '#19191b');
  g.fillStyle = s; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(225,238,246,0.55)'; g.fillRect(W * 0.38, H * 0.24, W * 0.24, H * 0.2);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function disposeTree(group) {
  const geometries = new Set(), usedMaterials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) usedMaterials.add(material);
  });
  for (const material of usedMaterials) for (const key of Object.keys(material)) { const v = material[key]; if (v && v.isTexture) textures.add(v); }
  for (const texture of textures) texture.dispose();
  for (const material of usedMaterials) material.dispose();
  for (const g of geometries) g.dispose();
}

// ---- Shared airframe definitions (exterior and the cockpit's view of the wing) ------------------------------------------
const WING = { y0: 0.97, dihedral: 0.022, kink: 2.8, tipX: 5.42, flap: [0.7, 2.86, 0.7], aileron: [3.04, 5.26, 0.72] };
function wingAt(x) {
  const a = Math.abs(x), k = clamp((a - WING.kink) / (WING.tipX - WING.kink), 0, 1);
  return { y: WING.y0 + WING.dihedral * a, lead: lerp(-1.02, -0.9, k), chord: lerp(1.6, 1.12, k) };
}
// NACA 2412 camber line and half thickness (fractions of chord).
function naca(t, thick = 0.12, camber = 0.02, pos = 0.4) {
  const yt = 5 * thick * (0.2969 * Math.sqrt(Math.max(t, 0)) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
  const yc = camber === 0 ? 0 : t < pos ? camber / (pos * pos) * (2 * pos * t - t * t) : camber / ((1 - pos) ** 2) * ((1 - 2 * pos) + 2 * pos * t - t * t);
  return { yt: Math.max(yt, 0), yc };
}
const AIRFOIL_N = 13; // points per surface
// Airfoil ring between chord fractions ta..tb at span station x (right wing). Sharp trailing vertices are duplicated so
// normals stay crisp. Returns { pts, ts } (ts = chord fraction per point, for UVs).
function wingRing(x, ta = 0, tb = 1, { thick = 1, yOff = 0, nose = false } = {}) {
  const w = wingAt(x), pts = [], ts = [];
  const at = (t, up) => { const a = naca(t); return [x, w.y + yOff + (a.yc + (up ? 1 : -1) * a.yt * thick) * w.chord, w.lead + t * w.chord]; };
  const tOf = (s) => ta + (tb - ta) * (1 - Math.cos(s * Math.PI / 2)); // dense at the leading edge
  const tOfNose = (s) => ta + (tb - ta) * s;
  if (!nose) {
    pts.push(at(tb, true)); ts.push(tb);
    for (let i = AIRFOIL_N - 1; i >= 0; i--) { const t = tOf(i / AIRFOIL_N); pts.push(at(t, true)); ts.push(t); }
    for (let i = 1; i <= AIRFOIL_N; i++) { const t = tOf(i / AIRFOIL_N); pts.push(at(t, false)); ts.push(t); }
    pts.push(at(tb, false)); ts.push(tb); // duplicate end vertex -> crisp trailing edge / spar face
    pts.push(at(tb, true)); ts.push(tb);
  } else { // movable surface ta..tb with a rounded nose at ta
    const up = [], lo = [];
    for (let i = 0; i <= AIRFOIL_N - 3; i++) { const t = tOfNose(1 - i / (AIRFOIL_N - 3)); up.push(at(t, true)); }
    const A = at(ta, true), B = at(ta, false), cy = (A[1] + B[1]) / 2, r = Math.abs(A[1] - B[1]) / 2;
    const arc = []; for (let k = 1; k < 6; k++) { const a = Math.PI / 2 + k / 6 * Math.PI; arc.push([x, cy + Math.sin(a) * r, A[2] + Math.cos(a) * r * 0.9]); }
    for (let i = 0; i <= AIRFOIL_N - 3; i++) { const t = tOfNose(i / (AIRFOIL_N - 3)); lo.push(at(t, false)); }
    for (const p of up) { pts.push(p); ts.push(0); }
    for (const p of arc) { pts.push(p); ts.push(0); }
    for (const p of lo) { pts.push(p); ts.push(0); }
    pts.push(at(tb, false)); ts.push(1); pts.push(at(tb, true)); ts.push(1);
  }
  return { pts, ts };
}
// Builds the right wing (x >= 0): fixed structure, flap, aileron, tip cap. Left = mirror.
function wingGeometry(THREE, K, rootX = 0) {
  const ringsFor = (xs, ta, tb, opts) => xs.map(x => wingRing(x, ta, tb, opts));
  const fixedLoft = (xs, tb) => { const rs = ringsFor(xs, 0, tb); return K.loft(rs.map(r => r.pts), { uvFn: (r, i) => [xs[r] / 5.55, rs[r].ts[i]] }); };
  const [f0, f1, fh] = WING.flap, [a0, a1, ah] = WING.aileron;
  const fixed = [
    fixedLoft([rootX, f0], 1),
    fixedLoft([f0, WING.kink, f1], fh),
    fixedLoft([f1, a0], 1),
    fixedLoft([a0, 4.2, a1], ah),
    fixedLoft([a1, WING.tipX], 1),
  ];
  // Rounded tip: shrinking rings beyond tipX.
  const tipRings = [];
  for (const [dx, th, ta, tb, dy] of [[0, 1, 0, 1, 0], [0.04, 0.86, 0.01, 0.97, 0.004], [0.075, 0.62, 0.035, 0.9, 0.01], [0.1, 0.34, 0.08, 0.8, 0.016], [0.112, 0.12, 0.13, 0.7, 0.02]]) {
    tipRings.push(wingRing(WING.tipX + dx, ta, tb, { thick: th, yOff: dy }).pts.map(p => [WING.tipX + dx, p[1], p[2]]));
    // keep the chord station of the tip base for wingAt (x beyond tipX clamps to the tip chord)
  }
  const tip = K.loft(tipRings);
  const movable = (x0, x1, th, flapStyle) => {
    const xs = [x0, (x0 + x1) / 2, x1];
    const rs = xs.map(x => wingRing(x, th, 1, { nose: true, thick: 1.0 }).pts.map(p => [p[0], p[1], p[2] + 0.004]));
    const g = K.loft(rs);
    // Hinge line: at the nose of the surface; flaps pivot a little below (Fowler-like aft and down travel).
    const hingeAt = (x) => { const w = wingAt(x), a = naca(th); return new THREE.Vector3(x, w.y + (a.yc - (flapStyle ? a.yt + 0.045 : 0)) * w.chord, w.lead + th * w.chord + (flapStyle ? 0.0 : 0.0)); };
    return { geometry: g, a: hingeAt(x0), b: hingeAt(x1) };
  };
  return { fixed: K.merge(fixed), tip, flap: movable(f0 + 0.01, f1 - 0.01, fh, true), aileron: movable(a0 + 0.01, a1 - 0.01, ah, false) };
}
// Hinged control surface: a static group aligned with the hinge line holds a pivot that update() rotates about local x.
function hinged(THREE, K, parent, part, side, material, collection) {
  const a = part.a.clone(), b = part.b.clone(); if (side < 0) { a.x *= -1; b.x *= -1; }
  const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize(); if (side < 0) dir.negate();
  const hinge = new THREE.Group(); hinge.position.copy(mid); hinge.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir); parent.add(hinge);
  const pivot = new THREE.Group(); hinge.add(pivot);
  const g = side > 0 ? part.geometry.clone() : K.mirrorX(part.geometry);
  const inv = hinge.quaternion.clone().invert();
  g.applyMatrix4(new THREE.Matrix4().compose(mid.clone().negate().applyQuaternion(inv), inv, new THREE.Vector3(1, 1, 1)));
  const m = new THREE.Mesh(g, material); m.castShadow = m.receiveShadow = true; pivot.add(m);
  collection.push({ pivot, side });
  return m;
}
// Wing strut (right side): fuselage fitting -> wing at x = 2.55, 30 % chord.
function strutEnds(side = 1) {
  const x = 2.55, w = wingAt(x), a = naca(0.3), top = [side * x, w.y + (a.yc - a.yt) * w.chord - 0.01, w.lead + 0.3 * w.chord];
  return { bottom: [side * 0.56, -0.43, -0.36], top };
}

// ---- Fuselage shape (shared by the exterior and the cockpit) -----------------------------------------------------------
// Profile curves: top, bottom, half-width, section exponent, upper-side tuck.
const topLine = monotone([[-2.98, 0.1], [-2.93, 0.165], [-2.84, 0.205], [-2.7, 0.235], [-2.45, 0.27], [-2.1, 0.315], [-1.8, 0.36], [-1.62, 0.4],
  [-1.5, 0.48], [-1.38, 0.57], [-1.26, 0.665], [-1.14, 0.765], [-1.04, 0.865], [-0.98, 0.92], [-0.92, 0.955], [-0.8, 0.975], [-0.5, 0.98],
  [0.45, 0.98], [0.62, 0.965], [0.8, 0.925], [1.0, 0.87], [1.4, 0.765], [1.8, 0.685], [2.2, 0.625], [2.6, 0.578], [3.0, 0.542], [3.5, 0.512], [4.0, 0.49], [4.4, 0.472], [4.66, 0.452]]);
const bottomLine = monotone([[-2.98, -0.34], [-2.93, -0.42], [-2.84, -0.47], [-2.7, -0.51], [-2.45, -0.54], [-2.1, -0.565], [-1.75, -0.585], [-1.4, -0.6],
  [-1.0, -0.615], [0.3, -0.62], [0.7, -0.6], [1.0, -0.56], [1.4, -0.46], [1.8, -0.33], [2.2, -0.2], [2.6, -0.07], [3.0, 0.05], [3.4, 0.15], [3.8, 0.23], [4.2, 0.31], [4.45, 0.36], [4.66, 0.4]]);
const halfWidth = monotone([[-2.98, 0.22], [-2.93, 0.31], [-2.84, 0.38], [-2.7, 0.43], [-2.45, 0.47], [-2.1, 0.5], [-1.75, 0.53], [-1.4, 0.57], [-1.0, 0.6],
  [-0.5, 0.61], [0.3, 0.61], [0.7, 0.6], [1.0, 0.57], [1.4, 0.5], [1.8, 0.42], [2.2, 0.345], [2.6, 0.28], [3.0, 0.22], [3.4, 0.17], [3.8, 0.12], [4.2, 0.08], [4.45, 0.055], [4.66, 0.03]]);
const exponent = monotone([[-2.98, 2.2], [-2.6, 2.5], [-1.6, 2.6], [-1.0, 3.1], [0.6, 3.1], [1.6, 2.6], [3.0, 2.3], [4.66, 2.1]]);
const tuckOf = monotone([[-2.98, 0.04], [-1.6, 0.08], [-1.0, 0.1], [0.6, 0.1], [2.0, 0.06], [4.66, 0.03]]);
const sec = (z) => { const top = topLine(z), bot = bottomLine(z); return { cy: (top + bot) / 2, ry: (top - bot) / 2, rx: halfWidth(z), n: exponent(z), tuck: tuckOf(z) }; };
// Point on the section at angle theta (0 = crown, pi/2 = right side, pi = belly).
const surf = (z, theta, off = 0) => {
  const s = sec(z), sn = Math.sin(theta), cs = Math.cos(theta);
  const ny = sgn(cs) * Math.pow(Math.abs(cs), 2 / s.n), nx = sgn(sn) * Math.pow(Math.abs(sn), 2 / s.n);
  const x = nx * s.rx * (1 - s.tuck * Math.max(0, ny) ** 2), y = s.cy + ny * s.ry;
  if (!off) return [x, y, z];
  const l = Math.hypot(nx / s.rx, ny / s.ry) || 1; // approximate outward normal of the section
  return [x + off * nx / s.rx / l, y + off * ny / s.ry / l, z];
};
const thetaAt = (z, y, side = 1) => { const s = sec(z), ny = clamp((y - s.cy) / s.ry, -1, 1); const th = Math.acos(sgn(ny) * Math.pow(Math.abs(ny), s.n / 2)); return side > 0 ? th : TAU - th; };
const sideX = (z, y) => surf(z, thetaAt(z, y, 1))[0];
// Analytic outward normal (finite differences of the loft): keeps glossy glass reflections smooth.
const surfNormal = (z, th) => {
  const e = 1e-3, a = surf(z, th + e), b = surf(z, th - e), c = surf(z + e, th), d = surf(z - e, th);
  const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], zx = c[0] - d[0], zy = c[1] - d[1], zz = c[2] - d[2];
  const nx = zy * tz - zz * ty, ny = zz * tx - zx * tz, nz = zx * ty - zy * tx, l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
};

// Cabin glazing outlines shared by the exterior and the cockpit: windscreen and rear deck in (z, theta), side windows in (z, y).
function windowOutlines(K) {
  // Windscreen in (z, theta): bottom edge on the cowl line, top edge under the wing leading edge.
  const zBottom = (th) => { // where the surface at this theta reaches the windscreen sill height
    const target = 0.41 - 0.06 * Math.min(1, (Math.abs(th) / 1.05) ** 2);
    let lo = -1.75, hi = -1.0; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (surf(mid, th)[1] < target) lo = mid; else hi = mid; } return (lo + hi) / 2;
  };
  const outline = [];
  const thB = 1.1, thT = 0.57, zT = -0.975;
  for (let i = 0; i <= 16; i++) { const th = -thB + 2 * thB * i / 16; outline.push([zBottom(th), th]); }
  for (let i = 1; i <= 6; i++) { const t = i / 6; outline.push([lerp(zBottom(thB), zT, t), lerp(thB, thT, t)]); }
  for (let i = 1; i <= 12; i++) { const th = thT - 2 * thT * i / 12; outline.push([zT, th]); }
  for (let i = 1; i < 6; i++) { const t = i / 6; outline.push([lerp(zT, zBottom(-thB), t), lerp(-thT, -thB, t)]); }
  return {
    windscreen: K.rounded(outline, 0.05, 3), zBottom, thB, thT, zT,
    doorWin: K.rounded([[-1.2, 0.38], [0.06, 0.38], [0.06, 0.84], [-0.88, 0.84]], 0.07, 4),
    rearWin: K.rounded([[0.2, 0.36], [1.12, 0.42], [1.3, 0.6], [0.92, 0.82], [0.2, 0.84]], 0.08, 4),
    deck: K.rounded([[0.66, -0.62], [1.42, -0.42], [1.42, 0.42], [0.66, 0.62]], 0.08, 3),
  };
}

// ============================================================================================================================
export function createLightAircraft(THREE) {
  const group = new THREE.Group();
  group.name = 'MQ-172 light single';
  const K = geometryKit(THREE);
  const env = skyEnvironment(THREE);
  const phys = (color, roughness, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, envMap: env, envMapIntensity: 0.4, ...extra });
  const std = (color, roughness = 0.5, metalness = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: env, envMapIntensity: 0.5, ...extra });
  const materials = {
    body: phys(0xffffff, 0.34, { clearcoat: 0.55, clearcoatRoughness: 0.14 }),
    wing: phys(0xf1eee6, 0.4, { clearcoat: 0.3, clearcoatRoughness: 0.2 }),
    flap: phys(0xe4e2da, 0.42, { clearcoat: 0.25, clearcoatRoughness: 0.2 }),
    accent: phys(0x6ba0e4, 0.34, { clearcoat: 0.55, clearcoatRoughness: 0.14 }),  // cowling blue: wheel pants, intake lips
    navy: phys(0x3a689c, 0.36, { clearcoat: 0.5, clearcoatRoughness: 0.15 }),     // tips
    fin: phys(0xffffff, 0.36, { clearcoat: 0.55, clearcoatRoughness: 0.14 }),
    glass: phys(0x0a1824, 0.05, { clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, specularIntensity: 1 }),
    lens: phys(0xdfeefa, 0.04, { transparent: true, opacity: 0.16, envMapIntensity: 1.4, depthWrite: false }),
    spinner: std(0xe2e6ea, 0.16, 1, { envMapIntensity: 1.15 }),
    metal: std(0xb4bec6, 0.32, 0.85, { envMapIntensity: 0.9 }),
    exhaust: std(0x6d5a4c, 0.55, 0.7),
    dark: std(0x161d24, 0.6, 0.2, { envMapIntensity: 0.3 }),
    recess: std(0x59626b, 0.3, 0.8, { envMapIntensity: 0.9 }),
    paint: phys(0x9ccaff, 0.34, { clearcoat: 0.55, clearcoatRoughness: 0.14 }),  // body colour for small parts
    rubber: std(0x15181b, 0.9, 0, { envMapIntensity: 0.2 }),
    blade: std(0xffffff, 0.45, 0.25, { vertexColors: true, envMapIntensity: 0.6 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff1cc, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.6, envMap: env }),
  };
  const B = bucketSet(THREE, K);

  // ---- Livery textures ---------------------------------------------------------------------------------------------------
  const Z0 = -2.98, Z1 = 4.66; // fuselage loft range (u runs nose -> tail)
  const zRows = [-2.98, -2.965, -2.945, -2.92, -2.89, -2.85, -2.8, -2.74, -2.66, -2.56, -2.44, -2.3, -2.12, -1.94, -1.76, -1.62, -1.52, -1.42, -1.32, -1.22, -1.12, -1.04, -0.98, -0.92, -0.84, -0.6,
    -0.2, 0.2, 0.48, 0.66, 0.84, 1.04, 1.28, 1.54, 1.8, 2.08, 2.38, 2.7, 3.02, 3.36, 3.7, 4.02, 4.3, 4.48, 4.6, 4.66];
  const SEG = 48;
  {
    const positions = [], uvs = [], indices = [];
    zRows.forEach((z, r) => {
      for (let i = 0; i <= SEG; i++) {
        const p = surf(z, i / SEG * TAU); positions.push(...p); uvs.push((z - Z0) / (Z1 - Z0), i / SEG);
        if (r < zRows.length - 1 && i < SEG) { const a = r * (SEG + 1) + i, b = a + SEG + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
      }
    });
    for (const [r, z] of [[0, zRows[0]], [zRows.length - 1, zRows[zRows.length - 1]]]) { // end caps
      const s = sec(z), c = positions.length / 3; positions.push(0, s.cy, z); uvs.push((z - Z0) / (Z1 - Z0), 0.5);
      for (let i = 0; i < SEG; i++) { const a = r * (SEG + 1) + i; if (r === 0) indices.push(c, a + 1, a); else indices.push(c, a, a + 1); }
    }
    const g = K.geo(positions, indices, uvs);
    K.outward(g);
    // Smooth the crown seam (column 0 and column SEG share positions).
    const nrm = g.attributes.normal;
    for (let r = 0; r < zRows.length; r++) {
      const a = r * (SEG + 1), b = a + SEG;
      const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b), l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
    }
    B.add('body', g);
  }
  // Body texture: the approved sky-blue gradient (crown -> sides -> belly), blue cowling, panel lines.
  if (hasDOM()) {
    const W = 2048, H = 1024, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    // v runs crown (0) -> right side (.25) -> belly (.5) -> left side (.75): one soft vertical pale-sky-blue gradient.
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#b6d8ff'); sky.addColorStop(0.25, '#9ccaff'); sky.addColorStop(0.5, '#82b4f6');
    sky.addColorStop(0.75, '#9ccaff'); sky.addColorStop(1, '#b6d8ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const U = (z) => (z - Z0) / (Z1 - Z0) * W, V = (th) => (1 - th / TAU) * H;
    g.fillStyle = '#6ba0e4'; g.fillRect(0, 0, U(-1.6), H); // blue cowling
    const line = (pts, closed = false, dark = 'rgba(28,52,84,0.42)', light = 'rgba(255,255,255,0.32)') => {
      for (const [style, dx, w] of [[light, 1.6, 1.4], [dark, 0, 1.8]]) for (const wrap of [-H, 0, H]) {
        g.strokeStyle = style; g.lineWidth = w; g.beginPath();
        pts.forEach(([u, v], i) => (i ? g.lineTo(u + dx, v + wrap + dx * 0.5) : g.moveTo(u + dx, v + wrap + dx * 0.5)));
        if (closed) g.closePath(); g.stroke();
      }
    };
    const rivets = (pts, every = 9, color = 'rgba(30,55,90,0.25)') => {
      g.fillStyle = color; let acc = 0;
      for (let i = 1; i < pts.length; i++) { const [u0, v0] = pts[i - 1], [u1, v1] = pts[i], d = Math.hypot(u1 - u0, v1 - v0);
        for (let s = (every - acc) % every; s < d; s += every) { const t = s / d; for (const wrap of [-H, 0, H]) g.fillRect(u0 + (u1 - u0) * t - 0.8, v0 + (v1 - v0) * t - 0.8 + wrap, 1.7, 1.7); }
        acc = (acc + d) % every; }
    };
    const ring = (z) => [[U(z), 0], [U(z), H]];
    const sideOutline = (outline, side) => outline.map(([z, y]) => [U(z), V(thetaAt(z, y, side))]);
    line(ring(-1.6)); rivets([[U(-1.585), 0], [U(-1.585), H]], 14);
    for (const z of [1.7, 2.7, 3.7]) { line(ring(z)); rivets([[U(z) + 5, 0], [U(z) + 5, H]], 11); }
    for (const th of [Math.PI / 2 - 0.05, 1.5 * Math.PI + 0.05]) line([[U(-2.86), V(th)], [U(-1.6), V(th)]]); // cowl split
    for (const side of [-1, 1]) {
      const door = K.rounded([[-1.06, -0.33], [0.14, -0.33], [0.14, 0.9], [-0.92, 0.9], [-1.3, 0.42], [-1.16, 0.0]], 0.08, 4);
      line(sideOutline(door, side), true);
    }
    line(sideOutline(K.rounded([[0.62, -0.3], [1.12, -0.3], [1.12, 0.2], [0.62, 0.2]], 0.05, 3), -1), true); // baggage door (left)
    line(K.rounded([[U(-2.38), V(0.3)], [U(-2.02), V(0.3)], [U(-2.02), V(TAU - 0.3) - H], [U(-2.38), V(TAU - 0.3) - H]], 6, 3), true); // oil door on top
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    materials.body.map = texture;
  }

  // ---- Glass: wraparound windscreen, cabin windows, rear deck window -------------------------------------------------------
  {
    const { windscreen: outline, doorWin, rearWin, deck } = windowOutlines(K);
    B.add('glass', K.patch(outline, (z, th) => surf(z, th, 0.007), { rings: 6, normal: surfNormal, step: 0.08 }));
    // Side windows in (z, y), both sides.
    for (const side of [-1, 1]) for (const win of [doorWin, rearWin]) {
      B.add('glass', K.patch(win, (z, y) => surf(z, thetaAt(z, y, side), 0.008), { rings: 4, normal: (z, y) => surfNormal(z, thetaAt(z, y, side)), step: 0.07 }));
    }
    // Rear deck window behind the wing ("all-round view").
    B.add('glass', K.patch(deck, (z, th) => surf(z, th, 0.008), { rings: 4, normal: surfNormal, step: 0.08 }));
  }
  // Decals (wordmark on the forward fuselage, registration on the tail cone): one lit, transparent material.
  if (hasDOM()) {
    const W = 1024, H = 512, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    // 「天青航空」 wordmark: serif CJK name with spaced SKYGLAZE caps beneath (rows 0..300).
    const mh = 300;
    g.fillStyle = '#1e3550'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `700 ${mh * 0.5}px "Noto Serif TC", "Songti TC", "PMingLiU", "Noto Serif CJK TC", serif`;
    g.fillText('天青航空', W / 2, mh * 0.56);
    g.font = `500 ${mh * 0.15}px "Helvetica Neue", "Avenir Next", Arial, sans-serif`;
    if ('letterSpacing' in g) g.letterSpacing = `${mh * 0.05}px`;
    g.fillText('SKYGLAZE', W / 2 + (mh * 0.025), mh * 0.86);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    // MQ-172 registration (rows 320..448).
    g.font = `700 ${128 * 0.58}px Arial, sans-serif`; g.textBaseline = 'middle';
    g.save(); g.translate(W / 2, 384); g.scale(1.33, 1); g.fillText('MQ-172', 0, 0); g.restore();
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    materials.decal = new THREE.MeshPhysicalMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.14, envMap: env, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const strip = (side, y0, y1, z0, z1, v0, v1) => {
      const positions = [], uvs = [], normals = [], indices = [], cols = 12, rows = 3;
      for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
        const u = c / cols, v = r / rows, y = lerp(y0, y1, v), z = lerp(z0, z1, u), th = thetaAt(z, y, side);
        positions.push(...surf(z, th, 0.004)); normals.push(...surfNormal(z, th)); uvs.push(side > 0 ? 1 - u : u, lerp(v0, v1, v));
        if (r < rows && c < cols) { const a = r * (cols + 1) + c, b = a + cols + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
      }
      const g = K.geo(positions, indices, uvs); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      return K.orientByNormals(g);
    };
    for (const side of [-1, 1]) {
      B.add('decal', strip(side, -0.19, 0.2, -0.98, 0.22, 1 - 300 / 512, 1));          // forward fuselage wordmark
      B.add('decal', strip(side, 0.24, 0.36, 2.35, 3.15, 1 - 448 / 512, 1 - 320 / 512)); // registration
    }
  }

  // ---- Cowling details: intakes, air filter, cooling outlet, exhaust ------------------------------------------------------
  {
    const noseZ = (x, y) => { let lo = -2.98, hi = -2.2; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (sideX(mid, y) < x) lo = mid; else hi = mid; } return (lo + hi) / 2; };
    for (const side of [-1, 1]) {
      const x = side * 0.27, y = -0.07, z = noseZ(0.27, y) + 0.012;
      B.add('dark', K.place(new THREE.CylinderGeometry(1, 1, 1, 18), [x, y, z + 0.03], [Math.PI / 2, 0, 0], [0.095, 0.08, 0.075]));
      B.add('accent', K.place(new THREE.TorusGeometry(1, 0.2, 8, 22), [x, y, z - 0.006], [0, side * 0.4, 0], [0.1, 0.085, 0.08]));
    }
    B.add('dark', K.place(new THREE.BoxGeometry(1, 1, 1), [0, -0.405, noseZ(0.12, -0.4) + 0.02], [-0.5, 0, 0], [0.16, 0.06, 0.05])); // air filter
    B.add('dark', K.place(new THREE.BoxGeometry(1, 1, 1), [0, -0.59, -1.68], [0.22, 0, 0], [0.46, 0.03, 0.12]));                     // cooling outlet
    B.add('exhaust', K.place(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12, 1, true), [0.24, -0.6, -1.95], [0.9, 0, 0]));
    B.add('dark', K.place(new THREE.CircleGeometry(0.028, 12), [0.24, -0.6 - Math.cos(0.9) * 0.08, -1.95 + Math.sin(0.9) * 0.08], [Math.PI / 2 + 0.9, 0, 0]));
  }

  // ---- Wing, flaps, ailerons ----------------------------------------------------------------------------------------------
  const W = wingGeometry(THREE, K);
  // Wing detail texture (multiplies the off-white paint): faint rib lines and rivet rows, u = span, v = chord.
  if (hasDOM()) {
    const Wd = 1024, Hd = 256, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, Wd, Hd);
    g.fillStyle = 'rgba(70,80,90,0.16)';
    for (let x = 0.75; x < 5.5; x += 0.46) g.fillRect(x / 5.55 * Wd, 0, 1.5, Hd);
    g.fillStyle = 'rgba(60,70,80,0.2)';
    for (const t of [0.07, 0.24, 0.66]) for (let x = 0; x < Wd; x += 5) g.fillRect(x, (1 - t) * Hd, 1.5, 1.5);
    g.fillStyle = 'rgba(70,80,90,0.2)'; g.fillRect(0, (1 - 0.07) * Hd - 1, Wd, 1);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; materials.wing.map = t;
  }
  B.add('wing', W.fixed); B.add('wing', K.mirrorX(W.fixed));
  B.add('navy', W.tip); B.add('navy', K.mirrorX(W.tip));
  const flaps = [], ailerons = [];
  for (const side of [-1, 1]) { hinged(THREE, K, group, W.flap, side, materials.flap, flaps); hinged(THREE, K, group, W.aileron, side, materials.flap, ailerons); }
  W.flap.geometry.dispose(); W.aileron.geometry.dispose();

  // Struts with root and wing fairings; fuel caps; pitot; landing light in the left wing leading edge.
  for (const side of [-1, 1]) {
    const { bottom, top } = strutEnds(side);
    B.add('wing', K.strut(bottom, top, 0.11, 0.036, { segs: 14, chordDir: [0, 0, 1] }));
    const dirv = new THREE.Vector3(...top).sub(new THREE.Vector3(...bottom)).normalize();
    const cuff = (p, len, s) => K.strut(p, [p[0] + dirv.x * len, p[1] + dirv.y * len, p[2] + dirv.z * len], 0.15 * s, 0.06 * s, { segs: 14 });
    B.add('wing', cuff([top[0] - dirv.x * 0.2, top[1] - dirv.y * 0.2, top[2] - dirv.z * 0.2], 0.21, 1));
    B.add('wing', cuff(bottom.map((v, i) => v - [dirv.x, dirv.y, dirv.z][i] * 0.03), 0.16, 1.05));
    B.add('paint', K.place(new THREE.SphereGeometry(1, 12, 6), [bottom[0] - side * 0.01, bottom[1], bottom[2]], [0, 0, 0], [0.05, 0.045, 0.12])); // root fitting fairing
    const w = wingAt(1.55), a = naca(0.36);
    B.add('metal', K.place(new THREE.CylinderGeometry(0.035, 0.035, 0.014, 16), [side * 1.55, w.y + (a.yc + a.yt) * w.chord + 0.002, w.lead + 0.36 * w.chord], [0.03, 0, 0]));
  }
  {
    const x = -2.1, w = wingAt(x), a = naca(0.2), yl = w.y + (a.yc - a.yt) * w.chord;
    B.add('metal', K.place(new THREE.CylinderGeometry(0.009, 0.012, 0.09, 8), [x, yl - 0.04, w.lead + 0.25], [0, 0, 0]));
    B.add('metal', K.place(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 8), [x, yl - 0.085, w.lead + 0.04], [Math.PI / 2, 0, 0]));
    // Landing / taxi light: dark recess, two lamps, clear lens following the leading edge.
    // Leading-edge strip from 6 % chord on top, round the nose, to 6 % underneath; pushed out along the local normal.
    const x0 = -2.42, x1 = -2.78;
    const lensLoft = (off) => {
      const xs = [x0, (x0 + x1) / 2, x1], cols = 12, positions = [], indices = [];
      for (const x of xs) {
        const w2 = wingAt(x), cy2 = w2.y + naca(0.06).yc * w2.chord, cz2 = w2.lead + 0.06 * w2.chord;
        for (let i = 0; i <= cols; i++) {
          const s = -1 + 2 * i / cols, t = 0.06 * s * s, a2 = naca(t), up = s < 0;
          const p = [x, w2.y + (a2.yc + (up ? 1 : -1) * a2.yt) * w2.chord, w2.lead + t * w2.chord];
          const nx = p[1] - cy2, nz = p[2] - cz2, l = Math.hypot(nx, nz) || 1;
          positions.push(p[0], p[1] + nx / l * off, p[2] + nz / l * off);
        }
      }
      for (let r = 0; r < xs.length - 1; r++) for (let i = 0; i < cols; i++) { const a2 = r * (cols + 1) + i, b2 = a2 + cols + 1; indices.push(a2, b2, a2 + 1, a2 + 1, b2, b2 + 1); }
      return K.facing(K.geo(positions, indices), () => [0, 0, -1]);
    };
    B.add('recess', lensLoft(0.002)); B.add('lens', lensLoft(0.008));
    for (const lx of [-2.52, -2.68]) { const w2 = wingAt(lx); B.add('lamp', K.place(new THREE.SphereGeometry(0.019, 10, 6), [lx, w2.y + 0.004, w2.lead + 0.016])); }
  }

  // ---- Empennage: fin with dorsal fillet, rudder, stabiliser, elevator -----------------------------------------------------
  const HINGE_Z = 4.3;
  const finLE = monotone([[0.36, 1.92], [0.48, 2.06], [0.57, 2.3], [0.65, 2.58], [0.72, 2.8], [0.8, 2.98], [1.5, 3.93]]);
  const finHalf = (y, t) => { const cv = (HINGE_Z - finLE(y)) / 0.72; return naca(t, 0.1, 0).yt * Math.min(cv, 1.3); };
  const finRing = (y, scale = 1, trimLE = 0) => {
    const le = finLE(y) + trimLE, c = HINGE_Z - le, pts = [];
    const tOf = (s) => 0.72 * (1 - Math.cos(s * Math.PI / 2));
    pts.push([0, y, HINGE_Z]);
    for (let i = AIRFOIL_N - 1; i >= 0; i--) { const t = tOf(i / AIRFOIL_N); pts.push([finHalf(y, t) * scale, y, le + t / 0.72 * c]); }
    for (let i = 1; i <= AIRFOIL_N; i++) { const t = tOf(i / AIRFOIL_N); pts.push([-finHalf(y, t) * scale, y, le + t / 0.72 * c]); }
    pts.push([-finHalf(y, 0.72) * scale, y, HINGE_Z]); pts.push([finHalf(y, 0.72) * scale, y, HINGE_Z]);
    pts[0] = [finHalf(y, 0.72) * scale, y, HINGE_Z];
    return pts;
  };
  const finUV = (p) => [(p[2] - 2.5) / 2.4, (p[1] - 0.35) / 1.2];
  {
    const ys = [0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.86, 1.0, 1.15, 1.3, 1.44, 1.5];
    const rings = ys.map(y => finRing(y));
    rings.push(finRing(1.515, 0.6, 0.03)); rings.push(finRing(1.524, 0.2, 0.08));
    const g = K.loft(rings, { uvFn: (r, i) => finUV(rings[r][i]) });
    B.add('fin', g);
  }
  const rudder = new THREE.Group(); rudder.position.set(0, 0, HINGE_Z); group.add(rudder);
  const rudderTE = monotone([[0.3, 4.82], [0.4, 4.85], [1.2, 4.82], [1.38, 4.8], [1.46, 4.76], [1.51, 4.66], [1.535, 4.5]]);
  const rudderHalf = (y) => finHalf(clamp(y, 0.4, 1.5), 0.72);
  const rudderRings = [];
  for (const y of [0.3, 0.33, 0.4, 0.7, 1.0, 1.25, 1.38, 1.46, 1.51, 1.535]) {
    // Ring in rudder-local z (0 = hinge): rounded nose (right side -> front -> left side), then both sides taper aft.
    const te = rudderTE(y) - HINGE_Z, r = rudderHalf(y) * (y > 1.5 ? 0.6 : 1) * (y < 0.33 ? 0.7 : 1), pts = [];
    const nose = 5, tail = 9;
    for (let k = 0; k <= nose; k++) { const phi = k / nose * Math.PI; pts.push([r * Math.cos(phi), y, 0.012 - r * 0.9 * Math.sin(phi)]); }
    const sideAt = (s, t) => [s * (r * (1 - t) ** 1.1 + 0.0025 * t), y, 0.012 + t * (te - 0.012)];
    for (let k = 1; k <= tail; k++) pts.push(sideAt(-1, k / tail));
    for (let k = tail; k >= 1; k--) pts.push(sideAt(1, k / tail));
    rudderRings.push(pts);
  }
  {
    const g = K.loft(rudderRings, { uvFn: (r, i) => finUV([0, rudderRings[r][i][1], rudderRings[r][i][2] + HINGE_Z]) });
    const m = new THREE.Mesh(g, materials.fin); m.castShadow = m.receiveShadow = true; rudder.add(m);
  }
  // Fin livery: sky-blue glaze gradient with a porcelain crackle network (開片), mapped as before (u = (z-2.5)/2.4,
  // v = (y-0.35)/1.2); mirrored repeat continues the pattern onto the dorsal fillet.
  function crackleCells(g, Wc, Hc, seed, count, color, alpha, width) {
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = []; for (let i = 0; i < count; i++) pts.push([rnd() * Wc, rnd() * Hc]);
    const pad = 60, seen = new Set(); g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width; g.lineCap = 'round';
    pts.forEach((p, i) => {
      let poly = [[-pad, -pad], [Wc + pad, -pad], [Wc + pad, Hc + pad], [-pad, Hc + pad]];
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
  if (hasDOM()) {
    const Wc = 1024, Hc = 512, canvas = document.createElement('canvas'); canvas.width = Wc; canvas.height = Hc;
    const g = canvas.getContext('2d');
    const glaze = g.createLinearGradient(0, 0, Wc, Hc); glaze.addColorStop(0, '#a6caf8'); glaze.addColorStop(1, '#6ba0e4');
    g.fillStyle = glaze; g.fillRect(0, 0, Wc, Hc);
    crackleCells(g, Wc, Hc, 7, 18, '#24497a', 0.55, 4.2);
    crackleCells(g, Wc, Hc, 8, 60, '#4f7db0', 0.45, 2.1);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    materials.fin.map = texture;
  } else materials.fin.color.set(0x86b4f0);

  // Horizontal tail (fixed stabiliser + elevator), y = 0.42.
  const TAIL_Y = 0.42, ELEV_HINGE = 4.12;
  const stabLE = (x) => 3.42 + 0.5 * Math.min(Math.abs(x), 1.72) / 1.72;
  const elevTE = (x) => 4.64 - 0.04 * Math.min(Math.abs(x), 1.72) / 1.72;
  const stabHalf = (x, t) => { const cv = (ELEV_HINGE - stabLE(x)) / 0.65; return naca(t, 0.09, 0).yt * Math.min(cv, 1.1); };
  const stabRing = (x, scale = 1, dz = 0) => {
    const le = stabLE(x) + dz, pts = [], tOf = (s) => 0.65 * (1 - Math.cos(s * Math.PI / 2));
    pts.push([x, TAIL_Y + stabHalf(x, 0.65) * scale, ELEV_HINGE]);
    for (let i = AIRFOIL_N - 1; i >= 0; i--) { const t = tOf(i / AIRFOIL_N); pts.push([x, TAIL_Y + stabHalf(x, t) * scale, le + t / 0.65 * (ELEV_HINGE - le)]); }
    for (let i = 1; i <= AIRFOIL_N; i++) { const t = tOf(i / AIRFOIL_N); pts.push([x, TAIL_Y - stabHalf(x, t) * scale, le + t / 0.65 * (ELEV_HINGE - le)]); }
    pts.push([x, TAIL_Y - stabHalf(x, 0.65) * scale, ELEV_HINGE]); pts.push([x, TAIL_Y + stabHalf(x, 0.65) * scale, ELEV_HINGE]);
    return pts;
  };
  {
    const right = K.loft([stabRing(0), stabRing(0.9), stabRing(1.72)]);
    B.add('wing', right); B.add('wing', K.mirrorX(right));
    const tip = K.loft([stabRing(1.72), stabRing(1.76, 0.7, 0.02), stabRing(1.79, 0.35, 0.06), stabRing(1.8, 0.1, 0.12)].map(r => r.map(p => [p[0], p[1], p[2]])));
    B.add('navy', tip); B.add('navy', K.mirrorX(tip));
  }
  const elevator = new THREE.Group(); elevator.position.set(0, TAIL_Y, ELEV_HINGE); group.add(elevator);
  {
    const ring = (x) => {
      const r = stabHalf(x, 0.65), te = elevTE(x) - ELEV_HINGE, pts = [];
      for (let k = 0; k <= 5; k++) { const phi = k / 5 * Math.PI; pts.push([x, r * Math.cos(phi), 0.01 - r * 0.9 * Math.sin(phi)]); }
      for (let k = 1; k <= 9; k++) { const t = k / 9; pts.push([x, -(r * (1 - t) ** 1.1 + 0.002 * t), 0.01 + t * (te - 0.01)]); }
      pts.push([x, 0.002, te]);
      for (let k = 8; k >= 1; k--) { const t = k / 9; pts.push([x, r * (1 - t) ** 1.1 + 0.002 * t, 0.01 + t * (te - 0.01)]); }
      return pts;
    };
    const half = K.loft([ring(0.07), ring(0.9), ring(1.7)]);
    const both = K.merge([half, K.mirrorX(half)]);
    const m = new THREE.Mesh(both, materials.flap); m.castShadow = m.receiveShadow = true; elevator.add(m);
  }

  // ---- Propeller: polished spinner, two twisted blades (black, yellow tips), translucent disc at power -----------------------
  const prop = new THREE.Group(); prop.position.set(0, -0.12, -3.02); group.add(prop);
  {
    // Lathe profile from the tip (y = -0.41) up to the base (y = 0), revolved about y, then turned so -y points forward (-z).
    const pts = []; for (let i = 12; i >= 0; i--) { const s = i / 12; pts.push(new THREE.Vector2(0.205 * Math.pow(Math.max(0, 1 - s ** 2.1), 0.55), -s * 0.41)); }
    const sp = K.place(new THREE.LatheGeometry(pts, 24), [0, 0, 0], [Math.PI / 2, 0, 0]);
    const spinner = new THREE.Mesh(sp, materials.spinner); spinner.castShadow = true; prop.add(spinner);
    const plate = new THREE.Mesh(K.place(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 28), [0, 0, 0.005], [Math.PI / 2, 0, 0]), materials.spinner); prop.add(plate);
  }
  const blades = new THREE.Group(); prop.add(blades);
  {
    const list = [], black = new THREE.Color(0x1d2329), yellow = new THREE.Color(0xf2c230);
    for (const dir of [-1, 1]) {
      const rs = [0.14, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.88, 0.88, 0.93, 0.955, 0.965];
      const rings = rs.map((r, k) => {
        const chord = r < 0.3 ? lerp(0.075, 0.125, (r - 0.14) / 0.16) : r < 0.88 ? lerp(0.125, 0.1, (r - 0.3) / 0.58) : 0.1 * Math.sqrt(Math.max(0.05, 1 - ((r - 0.88) / 0.087) ** 2));
        const thick = chord * lerp(0.2, 0.08, r);
        const beta = Math.atan(1.5 / (TAU * Math.max(r, 0.2)));
        const pts = [];
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, cx = Math.cos(a) * chord / 2, cz = Math.sin(a) * thick / 2 * (Math.sin(a) > 0 ? 1 : 0.35);
          // chord along x (direction of rotation), pitched by beta toward z
          pts.push([dir * (cx * Math.cos(beta) - cz * Math.sin(beta)) , dir * r, -0.06 + cx * Math.sin(beta) * dir * dir + cz * Math.cos(beta)]); }
        return { pts, col: k >= 8 ? yellow : black };
      });
      const g = K.loft(rings.map(r => r.pts));
      const col = []; rings.forEach(r => r.pts.forEach(() => col.push(r.col.r, r.col.g, r.col.b))); col.push(black.r, black.g, black.b, yellow.r, yellow.g, yellow.b);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      list.push(g);
    }
    const m = new THREE.Mesh(K.merge(list), materials.blade); m.castShadow = true; blades.add(m);
  }
  let disc;
  {
    let mat;
    if (hasDOM()) {
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), R = S / 2;
      const grad = g.createRadialGradient(R, R, 0, R, R, R);
      grad.addColorStop(0, 'rgba(40,44,48,0)'); grad.addColorStop(0.2, 'rgba(40,44,48,0.10)'); grad.addColorStop(0.75, 'rgba(40,44,48,0.24)');
      grad.addColorStop(0.86, 'rgba(40,44,48,0.3)'); grad.addColorStop(0.9, 'rgba(242,194,48,0.42)'); grad.addColorStop(0.985, 'rgba(242,194,48,0.32)'); grad.addColorStop(1, 'rgba(242,194,48,0)');
      g.fillStyle = grad; g.fillRect(0, 0, S, S);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    } else mat = new THREE.MeshBasicMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    disc = new THREE.Mesh(new THREE.CircleGeometry(0.965, 40), mat); disc.position.z = -0.06; disc.visible = false; prop.add(disc);
  }

  // ---- Fixed tricycle gear: spring-steel legs, faired wheel pants, nose oleo -------------------------------------------------
  const wheels = [];
  const tireGeometry = (r, w) => {
    const pts = [new THREE.Vector2(r * 0.55, -w * 0.42)];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI; pts.push(new THREE.Vector2(r - w * 0.3 + Math.cos(a) * w * 0.3, Math.sin(a) * w / 2)); }
    pts.push(new THREE.Vector2(r * 0.55, w * 0.42));
    const g = new THREE.LatheGeometry(pts, 18); g.rotateZ(Math.PI / 2); return g;
  };
  function wheel(x, y, z, r, w) {
    const tire = new THREE.Mesh(tireGeometry(r, w), materials.rubber); tire.position.set(x, y, z); tire.castShadow = true; tire.receiveShadow = true; group.add(tire);
    const hub = K.place(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.9, 14), [0, 0, 0], [0, 0, Math.PI / 2]);
    const hm = new THREE.Mesh(hub, materials.metal); tire.add(hm);
    wheels.push({ tire, radius: r });
  }
  // Wheel pant: streamlined teardrop (NACA-style thickness along z), the tyre shows through the bottom.
  function pant(cx, cy, cz, len, front, height, halfW) {
    const rows = [], z0 = cz - front, peak = naca(0.3, 0.12, 0).yt;
    for (const t of [0, 0.012, 0.04, 0.09, 0.16, 0.25, 0.36, 0.5, 0.64, 0.78, 0.9, 0.97, 1]) {
      const k = Math.max(naca(t, 0.12, 0).yt / peak, 0.03), z = z0 + t * len;
      const hw = halfW * k, hh = height / 2 * Math.max(k, 0.05) * (1 - 0.15 * t), yc = cy - 0.02 * t + 0.01 * (1 - k);
      const pts = []; for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, sn = Math.sin(a), cs = Math.cos(a); pts.push([cx + sgn(sn) * Math.pow(Math.abs(sn), 0.85) * hw, yc + sgn(cs) * Math.pow(Math.abs(cs), 0.9) * hh, z]); }
      rows.push(pts);
    }
    return K.loft(rows);
  }
  const MAIN = { x: 1.26, z: 0.18, r: 0.215, w: 0.15 }, NOSE = { z: -1.58, r: 0.18, w: 0.12 };
  for (const side of [-1, 1]) {
    const axleY = -1.2 + MAIN.r;
    wheel(side * MAIN.x, axleY, MAIN.z, MAIN.r, MAIN.w);
    B.add('accent', pant(side * MAIN.x, axleY + 0.06, MAIN.z, 1.02, 0.36, 0.41, 0.115));
    B.add('wing', K.strut([side * 0.5, -0.58, MAIN.z + 0.02], [side * 1.14, axleY + 0.12, MAIN.z], 0.085, 0.035, { segs: 12, taper: 0.8 })); // spring-steel leg, faired
    // Step on the leg.
    const sx = side * 0.86, sy = -0.86;
    B.add('metal', K.place(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), [sx, sy, MAIN.z - 0.08], [Math.PI / 2, 0, 0]));
    B.add('metal', K.place(new THREE.BoxGeometry(0.11, 0.012, 0.08), [sx, sy + 0.01, MAIN.z - 0.17]));
  }
  {
    const axleY = -1.2 + NOSE.r;
    wheel(0, axleY, NOSE.z, NOSE.r, NOSE.w);
    B.add('accent', pant(0, axleY + 0.04, NOSE.z, 0.8, 0.3, 0.32, 0.09));
    B.add('wing', K.place(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 14), [0, -0.66, -1.63], [0.12, 0, 0]));           // oleo cylinder
    B.add('metal', K.place(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 12), [0, -0.8, -1.61], [0.12, 0, 0]));            // chrome piston
  }

  // ---- Antennas, door handles -----------------------------------------------------------------------------------------------
  const blade = (h, c) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(c, 0); s.quadraticCurveTo(c * 0.7, h * 0.5, c * 0.55, h); s.lineTo(c * 0.3, h); s.quadraticCurveTo(c * 0.15, h * 0.4, 0, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false, curveSegments: 4 }); };
  {
    const wTop = (() => { const a = naca(0.35), w = wingAt(0); return w.y + (a.yc + a.yt) * w.chord; })();
    B.add('dark', K.place(blade(0.13, 0.09), [-0.004, wTop - 0.005, -0.32], [0, -Math.PI / 2, 0]));
    B.add('dark', K.place(blade(0.11, 0.08), [-0.004, topLine(1.95) - 0.005, 1.95], [0, -Math.PI / 2, 0]));
    B.add('dark', K.place(blade(0.07, 0.06), [-0.004, bottomLine(0.9) + 0.005, 0.9], [Math.PI, -Math.PI / 2, 0]));
    for (const side of [-1, 1]) B.add('dark', K.place(new THREE.CylinderGeometry(0.004, 0.006, 0.42, 6), [side * 0.17, 1.43, 3.8], [0, 0, side * 1.2], 1, 'ZXY')); // VOR whiskers
    for (const side of [-1, 1]) {
      const z = 0.02, y = 0.3, p = surf(z, thetaAt(z, y, side), 0.012);
      B.add('metal', K.place(new THREE.BoxGeometry(0.018, 0.022, 0.13), p));
      B.add('dark', K.place(new THREE.BoxGeometry(0.004, 0.04, 0.17), surf(z, thetaAt(z, y, side), 0.002)));
    }
  }

  // ---- Lights ----------------------------------------------------------------------------------------------------------------
  const glow = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return new THREE.MeshBasicMaterial({ color: c }); };
  const tipZ = (() => { const w = wingAt(WING.tipX); return w.lead + w.chord * 0.12; })(), tipY = wingAt(WING.tipX).y;
  const lightMesh = (geometryList, material) => { const m = new THREE.Mesh(K.merge(geometryList), material); group.add(m); return m; };
  const navR = lightMesh([K.place(new THREE.SphereGeometry(1, 12, 8), [-5.53, tipY + 0.005, tipZ], [0, 0, 0], [0.028, 0.026, 0.045])], glow(0xff263e, 3));
  const navG = lightMesh([K.place(new THREE.SphereGeometry(1, 12, 8), [5.53, tipY + 0.005, tipZ], [0, 0, 0], [0.028, 0.026, 0.045])], glow(0x2bffad, 3));
  const navW = new THREE.Mesh(K.place(new THREE.SphereGeometry(1, 10, 6), [0, 0.36, 4.85 - HINGE_Z], [0, 0, 0], [0.016, 0.02, 0.03]), glow(0xe6f2ff, 3)); rudder.add(navW);
  const strobe = lightMesh([-1, 1].map(s => K.place(new THREE.SphereGeometry(1, 10, 6), [s * 5.545, tipY + 0.012, tipZ + 0.08], [0, 0, 0], [0.018, 0.02, 0.03])), glow(0xf1f8ff, 4));
  const beacon = lightMesh([K.place(new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, Math.PI / 2), [0, 1.522, 4.06], [0, 0, 0], [0.032, 0.05, 0.032])], glow(0xff263e, 3));
  B.add('dark', K.place(new THREE.CylinderGeometry(0.036, 0.04, 0.02, 12), [0, 1.52, 4.06]));
  for (const s of [-1, 1]) B.add('lens', K.place(new THREE.SphereGeometry(1, 12, 8), [s * 5.535, tipY + 0.006, tipZ + 0.02], [0, 0, 0], [0.034, 0.032, 0.07]));
  const navLights = [navR, navG, navW], strobes = [strobe], beacons = [beacon];

  B.build(group, materials);
  for (const m of group.children) if (m.isMesh && (m.material === materials.lens || m.material === materials.decal)) { m.castShadow = false; }

  const input = (name, state, data) => state[name] ?? data[name] ?? 0;
  let flapExtension = 0, elapsed = 0, propAngle = 0;
  function update(state = {}, data = {}) {
    const dt = clamp(data.dt ?? state.dt ?? 1 / 60, 0, 0.1); elapsed += dt;
    const targetFlaps = clamp(data.flaps ?? state.flaps ?? 0, 0, 3);
    const actualFlaps = data.flapPosition ?? state.flapPosition;
    flapExtension = typeof actualFlaps === 'number' ? clamp(actualFlaps, 0, 3) : flapExtension + clamp(targetFlaps - flapExtension, -dt * 0.8, dt * 0.8);
    for (const flap of flaps) flap.pivot.rotation.x = flapExtension * DEG10;
    const roll = clamp(input('rollInput', state, data), -1, 1);
    // Roll right (+): right aileron up (TE up = negative x-rotation), left aileron down.
    for (const aileron of ailerons) aileron.pivot.rotation.x = -roll * aileron.side * 0.3;
    elevator.rotation.x = -clamp(input('pitchInput', state, data), -1, 1) * 0.4;   // pull (+) = TE up
    rudder.rotation.y = clamp(input('yawInput', state, data), -1, 1) * 0.4;          // right (+) = TE right
    const engine = data.engine ?? state.engine ?? data.throttle ?? state.throttle ?? 0;
    propAngle += dt * (3 + clamp(engine, 0, 1) * 70);
    prop.rotation.z = -propAngle; // clockwise seen from the cockpit
    const fast = engine > 0.3;
    blades.visible = !fast; disc.visible = fast;
    const speed = data.groundSpeed ?? state.speed ?? 0;
    for (const w of wheels) w.tire.rotation.x -= speed * dt / w.radius;
    const lights = data.lights ?? true;
    for (const light of navLights) light.visible = lights;
    for (const light of beacons) light.visible = lights && elapsed % 1.3 < 0.14;
    for (const light of strobes) light.visible = lights && (elapsed % 1.1 < 0.065 || (elapsed % 1.1 > 0.15 && elapsed % 1.1 < 0.21));
  }
  return { group, update, dispose: () => disposeTree(group) };
}

// ============================================================================================================================
// Left-seat cockpit. The returned group is added to the camera: the pilot's eye is the group origin, and everything is built
// in aircraft coordinates inside `cabin`, offset by -EYE (profile camera [-0.30, 0.55, -0.5]), so the aircraft centreline
// sits at camera x = +0.30. The exterior model is hidden in this view, so the parts seen through the glass (wings, struts,
// flaps, ailerons, tip lights, a faint prop disc) are part of the cockpit. Options (all optional):
//   profile         PROFILES.light: speed arcs (speedLimit, challenge.vrefKt) and tachometer range (ui.rpm)
//   altitudeOffset  metres added to data.altitude for the altimeter (field elevation), default 0
//   headingOffset   degrees added to data.heading for the compass, heading indicator and CDI course, default 0
//   speeds          { s0, s1, fe, no, ne, ref } in knots, overrides
export function createLightCockpit(THREE, options = {}) {
  const group = new THREE.Group(); group.name = 'MQ-172 cockpit';
  const EYE = options.eye ?? [-0.30, 0.55, -0.5];
  const cabin = new THREE.Group(); cabin.name = 'cabin (aircraft coordinates)'; cabin.position.set(-EYE[0], -EYE[1], -EYE[2]); group.add(cabin);
  const K = geometryKit(THREE), B = bucketSet(THREE, K), WO = windowOutlines(K), dom = hasDOM();
  const profile = options.profile || {};
  const V = { s0: 40, s1: 48, fe: 85, no: 129, ne: 163, ref: 65 };
  if (profile.speedLimit?.clean) V.ne = Math.round(profile.speedLimit.clean * KT);
  const limitSteps = profile.speedLimit?.steps; if (limitSteps?.length) V.fe = Math.round(limitSteps[limitSteps.length - 1][1] * KT);
  if (profile.challenge?.vrefKt) V.ref = profile.challenge.vrefKt;
  Object.assign(V, options.speeds || {});
  const RPM = { idle: 700, max: 2700, redline: 2700, ...(profile.ui?.rpm || {}) };
  const altOffset = options.altitudeOffset ?? 0, hdgOffset = options.headingOffset ?? 0;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const canvasTexture = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

  // ---- Materials -------------------------------------------------------------------------------------------------------------
  const skyEnv = skyEnvironment(THREE), cabEnv = cabinEnvironment(THREE);
  const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: cabEnv, envMapIntensity: 0.5, ...extra });
  const outside = (color, roughness, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0, envMap: skyEnv, envMapIntensity: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.2, ...extra });
  const basic = (extra) => new THREE.MeshBasicMaterial(extra);
  const M = {
    shell: std(0xffffff, 0.9, 0, { vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 0.15 }), // walls, headliner, floor, seats, glare shield
    trim: std(0x2c2f34, 0.6, 0, { side: THREE.DoubleSide, envMapIntensity: 0.35 }),                       // window trims, seals
    black: std(0x111214, 0.45),
    metal: std(0xc6ccd2, 0.24, 1, { envMapIntensity: 1 }),
    column: std(0x8d949b, 0.38, 0.9, { envMapIntensity: 0.7 }),
    red: std(0xb0141a, 0.4),
    white: std(0xe8e6de, 0.45),
    yoke: std(0x2a2c30, 0.48, 0, { envMapIntensity: 0.6 }),
    panel: std(0x3c4045, 0.78, 0, { side: THREE.DoubleSide, envMapIntensity: 0.2 }),
    radio: std(0x222427, 0.5, 0, { envMapIntensity: 0.35 }),
    radioLit: basic({ color: new THREE.Color(1.2, 1.2, 1.2) }),
    gaugeA: basic({ color: 0xeeeeee }), gaugeB: basic({ color: 0xeeeeee }), gaugeC: basic({ color: 0xeeeeee }),
    glass: basic({ color: 0xa9c3d2, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
    skylight: basic({ color: 0x24525e, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
    card: basic({ color: 0xffffff }),
    wing: outside(0xf1eee6, 0.45),
    flap: outside(0xe4e2da, 0.45),
    navy: outside(0x3a689c, 0.4),
    cowl: outside(0x6ba0e4, 0.36, { clearcoat: 0.55, clearcoatRoughness: 0.14, side: THREE.DoubleSide }),
  };

  // Vertex colours: base colour times a cheap cabin occlusion term (darker toward the floor and the firewall).
  const occlusion = (x, y, z) => (0.4 + 0.6 * smooth(-0.55, 0.62, y)) * (0.55 + 0.45 * smooth(-1.58, -1.05, z));
  const C = (hex) => new THREE.Color(hex);
  function tint(g, colorAt, { shade = true } = {}) {
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      c.copy(typeof colorAt === 'function' ? colorAt(x, y, z) : colorAt); const k = shade ? occlusion(x, y, z) : 1;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  }
  // Rounded box (cushions, armrests, housings): box vertices pushed onto a sphere of radius r around an inner box.
  function roundedBox(w, h, d, r, seg = 4) {
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); inner.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
      v.sub(inner); if (v.lengthSq() > 1e-12) v.normalize().multiplyScalar(r); v.add(inner); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.deleteAttribute('normal'); const m = mergeVerts(g); m.computeVertexNormals(); return m;
  }
  function mergeVerts(g) { // weld duplicate box-face vertices so the rounded box shades smoothly
    const p = g.attributes.position, map = new Map(), pos = [], remap = [];
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
      if (!map.has(key)) { map.set(key, pos.length / 3); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
      remap.push(map.get(key));
    }
    const idx = g.index ? Array.from(g.index.array, i => remap[i]) : remap;
    g.dispose(); return K.geo(pos, idx);
  }
  // Open grid sheet through rows of points (rows[i][j] -> [x,y,z]).
  function sheet(rows) {
    const n = rows[0].length, positions = [], indices = [];
    rows.forEach(row => row.forEach(p => positions.push(p[0], p[1], p[2])));
    for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < n - 1; i++) { const a = r * n + i, b = a + 1, c = a + n, d = c + 1; indices.push(a, c, b, b, c, d); }
    return K.geo(positions, indices);
  }
  const densify = (outline, step) => {
    const out = [];
    outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length], k = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
      for (let j = 0; j < k; j++) out.push([lerp(p[0], q[0], j / k), lerp(p[1], q[1], j / k)]); });
    return out;
  };
  const signedTh = (outline, side) => outline.map(([z, y]) => [z, side * thetaAt(z, y, 1)]); // side windows (z, y) -> (z, theta)

  // ---- Cabin shell: the fuselage loft offset 3 cm inward, windows cut out, frames covered by moulded trims ---------------------
  const OFF = -0.03, FLOOR = -0.46;
  const thFloor = (z) => thetaAt(z, FLOOR, 1);
  const SKY = K.rounded([[-0.05, -0.34], [0.42, -0.34], [0.42, 0.34], [-0.05, 0.34]], 0.08, 3);
  const openings = [
    { poly: WO.windscreen, glass: 'glass' }, { poly: signedTh(WO.doorWin, -1), glass: 'glass' }, { poly: signedTh(WO.doorWin, 1), glass: 'glass' },
    { poly: signedTh(WO.rearWin, -1), glass: 'glass' }, { poly: signedTh(WO.rearWin, 1), glass: 'glass' }, { poly: WO.deck, glass: 'glass' }, { poly: SKY, glass: 'skylight' },
  ];
  {
    const SNAP = 0.055, NC = 48, holes = openings.map(o => {
      const poly = densify(o.poly, 0.012); let z0 = Infinity, z1 = -Infinity, t0 = Infinity, t1 = -Infinity;
      for (const [z, t] of poly) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      return { poly, box: [z0 - 0.08, z1 + 0.08, t0 - 0.15, t1 + 0.15] };
    });
    const inside = (poly, z, t) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [zi, ti] = poly[i], [zj, tj] = poly[j]; if ((ti > t) !== (tj > t) && z < (zj - zi) * (t - ti) / (tj - ti) + zi) c = !c; } return c; };
    const metric = (z, t) => { const a = surf(z, t + 1e-3), b = surf(z, t - 1e-3); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 2e-3; };
    const nearest = (poly, z, t, m) => {
      let best = Infinity, bz = 0, bt = 0;
      for (let i = 0; i < poly.length; i++) {
        const [z0, t0] = poly[i], [z1, t1] = poly[(i + 1) % poly.length], dz = z1 - z0, dt = (t1 - t0) * m, L = dz * dz + dt * dt;
        const s = L ? clamp(((z - z0) * dz + (t - t0) * m * dt) / L, 0, 1) : 0, pz = z0 + dz * s, pt = t0 + (t1 - t0) * s, d = Math.hypot(z - pz, (t - pt) * m);
        if (d < best) { best = d; bz = pz; bt = pt; }
      }
      return { d: best, z: bz, t: bt };
    };
    const zs = []; for (let z = -1.62; z < 0.35; z += 0.05) zs.push(z); for (let z = 0.35; z < 1.46; z += 0.075) zs.push(z);
    const positions = [], params = [], on = [], ins = [];
    for (const z0 of zs) {
      const tf = thFloor(z0);
      for (let c = 0; c <= NC; c++) {
        let z = z0, t = (c / NC * 2 - 1) * tf, snapTo = -1, mask = 0;
        const m = metric(z, t); let bestD = SNAP, best = null;
        holes.forEach((h, k) => {
          const [a0, a1, b0, b1] = h.box; if (z < a0 || z > a1 || t < b0 || t > b1) return;
          if (inside(h.poly, z, t)) mask |= 1 << k;
          const n = nearest(h.poly, z, t, m); if (n.d < bestD) { bestD = n.d; best = n; snapTo = k; }
        });
        if (best) { z = best.z; t = best.t; }
        params.push([z, t]); on.push(snapTo); ins.push(mask); positions.push(...surf(z, t, OFF));
      }
    }
    const indices = [], row = NC + 1;
    const keep = (i, j, k) => {
      for (let h = 0; h < holes.length; h++) {
        const bit = 1 << h, hit = (v) => on[v] === h || (ins[v] & bit);
        if (hit(i) && hit(j) && hit(k)) { const cz = (params[i][0] + params[j][0] + params[k][0]) / 3, ct = (params[i][1] + params[j][1] + params[k][1]) / 3; if (inside(holes[h].poly, cz, ct)) return false; }
      }
      return true;
    };
    for (let r = 0; r < zs.length - 1; r++) for (let c = 0; c < NC; c++) {
      const a = r * row + c, b = a + 1, cc = a + row, d = cc + 1;
      if (keep(a, cc, b)) indices.push(a, cc, b);
      if (keep(b, cc, d)) indices.push(b, cc, d);
    }
    const headliner = C(0xc2c3c6), upper = C(0xa9a69f), lower = C(0x55585d), tmp = new THREE.Color();
    B.add('shell', tint(K.geo(positions, indices), (x, y, z) => {
      if (y > 0.84) return tmp.copy(upper).lerp(headliner, smooth(0.84, 0.9, y));
      return tmp.copy(lower).lerp(upper, smooth(0.28, 0.36, y));
    }));
  }
  // Moulded trim round each opening: reveal down to the glass, a raised lip, a foot blending into the wall.
  function trimRing(poly, { width = 0.032, lift = 0.009, reveal = true, step = 0.035 } = {}) {
    const P = densify(poly, step); let cz = 0, ct = 0; for (const [z, t] of P) { cz += z; ct += t; } cz /= P.length; ct /= P.length;
    const center = new THREE.Vector3(...surf(cz, ct, OFF));
    const pts = P.map(([z, t]) => new THREE.Vector3(...surf(z, t, OFF))), nrm = P.map(([z, t]) => new THREE.Vector3(...surfNormal(z, t)));
    const rings = reveal ? [[], [], []] : [[], []];
    pts.forEach((p, i) => {
      const T = pts[(i + 1) % pts.length].clone().sub(pts[(i - 1 + pts.length) % pts.length]), n = nrm[i];
      const out = T.cross(n).normalize(); if (out.dot(p.clone().sub(center)) < 0) out.negate();
      const at = (o, l) => p.clone().addScaledVector(out, o).addScaledVector(n, -l).toArray();
      const ringSet = reveal ? [surf(P[i][0], P[i][1], -0.006), at(0.004, lift), at(width, 0.003)] : [at(-0.004, 0.004), at(0.004, 0.004)];
      ringSet.forEach((q, k) => rings[k].push(q));
    });
    return K.loft(rings, { capStart: false, capEnd: false, orient: false });
  }
  openings.forEach((o, i) => {
    B.add('trim', trimRing(o.poly, i > 2 ? { width: 0.025, lift: 0.006, step: 0.06 } : {}));
    B.add(o.glass, K.patch(o.poly.filter((_, k) => k % 3 === 0), (z, t) => surf(z, t, -0.006), { rings: i === 0 ? 3 : 2, step: 0.12 }));
  });
  for (const side of [-1, 1]) B.add('black', trimRing(signedTh(K.rounded([[-1.06, -0.33], [0.14, -0.33], [0.14, 0.9], [-0.92, 0.9], [-1.3, 0.42], [-1.16, 0.0]], 0.08, 4), side), { reveal: false, step: 0.05 })); // door seals

  // Floor, firewall, aft bulkhead (vertex coloured; carpet and dark trim).
  const wallX = (z, y, side = 1, off = OFF) => surf(z, side * thetaAt(z, y, 1), off)[0];
  {
    const rows = []; for (let z = -1.6; z <= 1.25; z += 0.15) rows.push([[wallX(z, FLOOR, -1) * 1.02, FLOOR, z], [0, FLOOR, z], [wallX(z, FLOOR, 1) * 1.02, FLOOR, z]]);
    B.add('shell', tint(sheet(rows), C(0x34322f)));
    const fw = [], zf = -1.6; // firewall below the glare shield
    for (let i = 0; i <= 16; i++) { const y = lerp(FLOOR, 0.36, i / 16); fw.push([[wallX(zf, y, -1), y, zf], [0, y, zf], [wallX(zf, y, 1), y, zf]]); }
    B.add('shell', tint(sheet(fw), C(0x2a2b2d)));
    const ab = [], za = 1.45, s = sec(za); // aft bulkhead / baggage curtain
    for (let i = 0; i <= 12; i++) { const y = lerp(s.cy - s.ry + 0.02, s.cy + s.ry - 0.02, i / 12); ab.push([[wallX(za, y, -1), y, za], [0, y, za], [wallX(za, y, 1), y, za]]); }
    B.add('shell', tint(sheet(ab), C(0x4a4844)));
  }

  // ---- Instrument panel: extruded plate with real holes, tilted 12 degrees, gauge faces recessed behind ---------------------
  const PANEL = { y: 0.25, z: -1.2, tilt: 12 * RAD, u0: -0.535, u1: 0.535, v0: -0.2, v1: 0.18 };
  const ct = Math.cos(PANEL.tilt), st = Math.sin(PANEL.tilt);
  const PP = (u, v, w = 0) => [u, PANEL.y + v * ct + w * st, PANEL.z - v * st + w * ct]; // panel (u, v, w) -> cabin
  const onPanel = (g) => K.place(g, [0, PANEL.y, PANEL.z], [-PANEL.tilt, 0, 0]);
  const vTop = (u) => 0.18 - 0.055 * smooth(0.4, 0.53, Math.abs(u));
  const G = { asi: [-0.395, 0.095], ai: [-0.30, 0.095], alt: [-0.205, 0.095], tc: [-0.395, 0.002], hi: [-0.30, 0.002], vsi: [-0.205, 0.002], cdi: [-0.11, 0.095], tach: [-0.11, 0.002] };
  const R6 = 0.039, RE = 0.0215, RS = 0.03, RY = 0.024;
  const ENG = [[-0.485, 0.09], [-0.485, 0.04], [-0.485, -0.01], [-0.485, -0.06]];
  const STAT = { suction: [0.205, 0.12], amps: [0.205, 0.045] };
  const STACK = { u0: -0.052, u1: 0.138, v0: -0.135, v1: 0.172 };
  const YOKES = [[-0.30, -0.095], [0.30, -0.095]];
  const ANN = { u: -0.30, v: 0.1555, w: 0.18, h: 0.021 }, CLOCK = { u: 0.30, v: 0.135, w: 0.064, h: 0.016 };
  {
    const shape = new THREE.Shape(), ub = 0.53;
    shape.moveTo(-ub + 0.02, PANEL.v0); shape.lineTo(ub - 0.02, PANEL.v0); shape.quadraticCurveTo(ub, PANEL.v0, ub, PANEL.v0 + 0.02);
    for (let i = 0; i <= 40; i++) { const u = ub - 2 * ub * i / 40; shape.lineTo(u, vTop(u) - (Math.abs(u) > 0.52 ? 0.005 : 0)); }
    shape.lineTo(-ub, PANEL.v0 + 0.02); shape.quadraticCurveTo(-ub, PANEL.v0, -ub + 0.02, PANEL.v0);
    const hole = (u, v, r) => { const p = new THREE.Path(); p.absarc(u, v, r, 0, TAU, true); shape.holes.push(p); };
    for (const [u, v] of Object.values(G)) hole(u, v, R6);
    for (const [u, v] of ENG) hole(u, v, RE);
    for (const [u, v] of Object.values(STAT)) hole(u, v, RS);
    for (const [u, v] of YOKES) hole(u, v, RY);
    const rect = new THREE.Path(); rect.moveTo(STACK.u0, STACK.v0); rect.lineTo(STACK.u0, STACK.v1); rect.lineTo(STACK.u1, STACK.v1); rect.lineTo(STACK.u1, STACK.v0); rect.closePath(); shape.holes.push(rect);
    const depth = 0.022, g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 20 });
    g.translate(0, 0, -depth);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - PANEL.u0) / (PANEL.u1 - PANEL.u0), (p.getY(i) - PANEL.v0) / (PANEL.v1 - PANEL.v0));
    B.add('panel', onPanel(g));
    const planar = (geom) => { const q = geom.attributes.position, t = geom.attributes.uv; for (let i = 0; i < q.count; i++) t.setXY(i, (q.getX(i) - PANEL.u0) / (PANEL.u1 - PANEL.u0), (q.getY(i) - PANEL.v0) / (PANEL.v1 - PANEL.v0)); return geom; };
    for (const [u, v] of Object.values(STAT)) B.add('panel', onPanel(planar(new THREE.CircleGeometry(RS, 32).translate(u, v, -0.012))));
    // black backing behind the radio stack and behind the yoke holes
    B.add('black', onPanel(new THREE.PlaneGeometry(STACK.u1 - STACK.u0, STACK.v1 - STACK.v0).translate((STACK.u0 + STACK.u1) / 2, (STACK.v0 + STACK.v1) / 2, -0.021)));
    for (const [u, v] of YOKES) B.add('black', onPanel(new THREE.CircleGeometry(RY, 16).translate(u, v, -0.021)));
  }
  // Glare shield: rounded brow above the panel, sloping forward to the windscreen sill.
  {
    const sillAt = (x) => {
      let lo = -WO.thB, hi = WO.thB;
      for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (surf(WO.zBottom(mid), mid)[0] < x) lo = mid; else hi = mid; }
      const th = (lo + hi) / 2; return surf(WO.zBottom(th), th, -0.012);
    };
    const lip = [[0, -0.006], [-0.003, 0.012], [0.002, 0.026], [0.012, 0.033], [0.022, 0.029], [0.028, 0.016]];
    const rows = [];
    for (let i = 0; i <= 26; i++) {
      const u = -0.515 + 1.03 * i / 26, vt = vTop(u), row = lip.map(([dv, dw]) => PP(u, vt + dv, dw));
      const a = row[row.length - 1], s = sillAt(u);
      for (const t of [0.25, 0.5, 0.75, 1]) row.push([lerp(a[0], s[0], t), lerp(a[1], s[1], t) + Math.sin(t * Math.PI) * 0.004, lerp(a[2], s[2], t)]);
      rows.push(row);
    }
    B.add('shell', tint(sheet(rows), C(0x1c1d20), { shade: false }));
  }
  // Pedestal under the panel centre, seats, door furniture, overhead parts.
  B.add('shell', tint(K.place(roundedBox(0.12, 0.52, 0.2, 0.012, 2), [0.03, -0.2, -1.075]), C(0x3a3c40)));
  const seat = (x, z, w, rear = false) => {
    const fabric = C(0x77746d), bolster = C(0x45464a), tmp = new THREE.Color();
    const col = (px) => tmp.copy(bolster).lerp(fabric, 1 - smooth(w * 0.3, w * 0.42, Math.abs(px - x)));
    B.add('shell', tint(K.place(roundedBox(w, 0.12, rear ? 0.44 : 0.48, 0.045), [x, -0.31, z], [0.07, 0, 0]), col));
    B.add('shell', tint(K.place(roundedBox(w, 0.64, 0.12, 0.05), [x, 0.09, z + (rear ? 0.3 : 0.33)], [0.2, 0, 0]), col));
    if (!rear) {
      B.add('shell', tint(K.place(roundedBox(0.26, 0.15, 0.085, 0.035, 3), [x, 0.53, z + 0.445], [0.2, 0, 0]), C(0x5a5853), { shade: false }));
      for (const s of [-1, 1]) B.add('metal', K.place(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6), [x + s * 0.07, 0.445, z + 0.43], [0.2, 0, 0]));
    }
  };
  seat(-0.3, -0.66, 0.46); seat(0.3, -0.66, 0.46); seat(0, 0.42, 1.0, true);
  for (const x of [-0.43, -0.17, 0.17, 0.43]) B.add('metal', K.place(new THREE.BoxGeometry(0.02, 0.012, 0.75), [x, FLOOR + 0.006, -0.62])); // seat rails
  for (const side of [-1, 1]) {
    const y = 0.14, z = -0.52, wx = wallX(z, y, side);
    B.add('shell', tint(K.place(roundedBox(0.06, 0.045, 0.46, 0.02, 3), [wx - side * 0.028, y, z]), C(0x3c3f44)));          // armrest
    B.add('shell', tint(K.place(roundedBox(0.03, 0.2, 0.5, 0.012, 2), [wallX(-0.6, -0.15, side) - side * 0.008, -0.15, -0.6]), C(0x46494e))); // map pocket
    B.add('black', K.place(roundedBox(0.016, 0.02, 0.1, 0.006, 2), [wallX(-0.98, 0.24, side) - side * 0.02, 0.24, -0.98]));  // door handle
    B.add('black', K.place(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 10), [wallX(-0.98, 0.24, side) - side * 0.01, 0.24, -0.93], [0, 0, Math.PI / 2]));
    B.add('black', K.place(new THREE.BoxGeometry(0.02, 0.012, 0.05), [wallX(-0.56, 0.37, side) - side * 0.012, 0.37, -0.56]));    // window latch
    // sun visor folded against the headliner, pivot rod
    B.add('shell', tint(K.place(roundedBox(0.3, 0.008, 0.13, 0.004, 2), [side * 0.25, 0.905, -0.86], [0.12, 0, 0]), C(0x77736b), { shade: false }));
    B.add('metal', K.place(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 6), [side * 0.25, 0.912, -0.925], [0, 0, Math.PI / 2]));
    B.add('black', K.place(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 12), [side * 0.36, 0.855, -0.87], [0.5, 0, side * 0.6])); // eyeball vent
  }
  B.add('shell', tint(K.place(roundedBox(0.16, 0.03, 0.55, 0.012, 2), [0, 0.935, -0.52]), C(0x3a3c40), { shade: false })); // overhead console
  B.add('white', K.place(new THREE.CylinderGeometry(0.025, 0.025, 0.006, 16), [0, 0.917, -0.4]));                             // dome light
  // Fuel selector between the seats.
  B.add('black', K.place(new THREE.CylinderGeometry(0.055, 0.06, 0.01, 24), [0.03, FLOOR + 0.006, -0.86]));
  B.add('red', K.place(new THREE.BoxGeometry(0.018, 0.025, 0.09), [0.03, FLOOR + 0.02, -0.86], [0, 0.35, 0]));

  // ---- Outside the glass: wings with moving flaps/ailerons, struts, tip lights, nose cowl, faint prop disc --------------------
  const Wg = wingGeometry(THREE, K, 0.45);
  B.add('wing', K.mirrorX(Wg.fixed)); B.add('wing', Wg.fixed);
  B.add('navy', K.mirrorX(Wg.tip)); B.add('navy', Wg.tip);
  B.add('wing', K.loft([-0.46, 0, 0.46].map(x => wingRing(x, 0, 0.04).pts))); // leading edge over the windscreen
  const flaps = [], ailerons = [];
  for (const side of [-1, 1]) { hinged(THREE, K, cabin, Wg.flap, side, M.flap, flaps); hinged(THREE, K, cabin, Wg.aileron, side, M.flap, ailerons); }
  Wg.flap.geometry.dispose(); Wg.aileron.geometry.dispose();
  for (const side of [-1, 1]) {
    const { bottom, top } = strutEnds(side);
    B.add('wing', K.strut(bottom, top, 0.11, 0.036, { segs: 14, chordDir: [0, 0, 1] }));
    const dirv = new THREE.Vector3(...top).sub(new THREE.Vector3(...bottom)).normalize();
    B.add('wing', K.strut([top[0] - dirv.x * 0.2, top[1] - dirv.y * 0.2, top[2] - dirv.z * 0.2], [top[0] + dirv.x * 0.01, top[1] + dirv.y * 0.01, top[2] + dirv.z * 0.01], 0.15, 0.06, { segs: 14 }));
  }
  {
    const x = -2.1, w = wingAt(x), a = naca(0.2), yl = w.y + (a.yc - a.yt) * w.chord;
    B.add('metal', K.place(new THREE.CylinderGeometry(0.009, 0.012, 0.09, 8), [x, yl - 0.04, w.lead + 0.25]));
    B.add('metal', K.place(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 8), [x, yl - 0.085, w.lead + 0.04], [Math.PI / 2, 0, 0]));
  }
  {
    const rows = []; for (let i = 0; i <= 12; i++) { const z = lerp(-2.92, -1.58, i / 12), r = []; for (let j = 0; j <= 20; j++) r.push(surf(z, lerp(-1.5, 1.5, j / 20))); rows.push(r); }
    B.add('cowl', sheet(rows));
  }
  const glow = (hex, k) => basic({ color: new THREE.Color(hex).multiplyScalar(k) });
  const tipZ = (() => { const w = wingAt(WING.tipX); return w.lead + w.chord * 0.12; })(), tipY = wingAt(WING.tipX).y;
  const lamp = (list, material) => { const m = new THREE.Mesh(K.merge(list), material); cabin.add(m); return m; };
  const navR = lamp([K.place(new THREE.SphereGeometry(1, 12, 8), [-5.53, tipY + 0.005, tipZ], [0, 0, 0], [0.028, 0.026, 0.045])], glow(0xff263e, 3));
  const navG = lamp([K.place(new THREE.SphereGeometry(1, 12, 8), [5.53, tipY + 0.005, tipZ], [0, 0, 0], [0.028, 0.026, 0.045])], glow(0x2bffad, 3));
  const strobe = lamp([-1, 1].map(s => K.place(new THREE.SphereGeometry(1, 10, 6), [s * 5.545, tipY + 0.012, tipZ + 0.08], [0, 0, 0], [0.018, 0.02, 0.03])), glow(0xf1f8ff, 4));
  let disc = null;
  if (dom) {
    const c = makeCanvas(256, 256), g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(30,30,30,0)'); rg.addColorStop(0.2, 'rgba(30,30,30,0)'); rg.addColorStop(0.5, 'rgba(25,25,25,0.025)');
    rg.addColorStop(0.88, 'rgba(25,25,25,0.035)'); rg.addColorStop(0.9, 'rgba(240,200,40,0.075)'); rg.addColorStop(0.985, 'rgba(240,200,40,0.06)'); rg.addColorStop(1, 'rgba(240,200,40,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(20,20,20,0.03)';
    for (const a of [0.3, 0.3 + Math.PI]) { g.save(); g.translate(128, 128); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 122, -0.06, 0.06); g.closePath(); g.fill(); g.restore(); }
    disc = new THREE.Mesh(new THREE.CircleGeometry(0.965, 48), basic({ map: canvasTexture(c), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.set(0, -0.12, -3.08); disc.visible = false; disc.renderOrder = 2; cabin.add(disc);
  }

  // ---- Static panel artwork (2048 x 728): wear, bezels and screws, labels, placards, static gauges -------------------------------
  const PW = 2048, PH = 728, PX = PW / (PANEL.u1 - PANEL.u0);
  const X = (u) => (u - PANEL.u0) * PX, Y = (v) => (PANEL.v1 - v) * PX;
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  if (dom) {
    const c = makeCanvas(PW, PH), g = c.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = '#3d4146'; g.fillRect(0, 0, PW, PH);
    for (let i = 0; i < 14000; i++) { const l = rnd() < 0.5; g.fillStyle = l ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect(rnd() * PW, rnd() * PH, 1 + rnd() * 2, 1 + rnd() * 2); }
    const shadeTop = g.createLinearGradient(0, 0, 0, PH * 0.2); shadeTop.addColorStop(0, 'rgba(0,0,0,0.35)'); shadeTop.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = shadeTop; g.fillRect(0, 0, PW, PH * 0.2);
    const scuff = (u, v, r, a) => { const rg = g.createRadialGradient(X(u), Y(v), 0, X(u), Y(v), r * PX); rg.addColorStop(0, `rgba(210,215,220,${a})`); rg.addColorStop(1, 'rgba(210,215,220,0)'); g.fillStyle = rg; g.fillRect(X(u) - r * PX, Y(v) - r * PX, 2 * r * PX, 2 * r * PX); };
    for (let i = 0; i < 26; i++) scuff(-0.5 + rnd(), -0.19 + rnd() * 0.04, 0.02 + rnd() * 0.03, 0.05);
    for (const [u, v] of [[0.045, -0.168], [-0.49, -0.12], [-0.3, -0.165], [0.168, -0.1]]) scuff(u, v, 0.035, 0.06);
    const T = (text, u, v, size, color = '#e9e8e2', weight = 600, align = 'center') => { g.fillStyle = color; g.font = `${weight} ${size * PX}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, X(u), Y(v)); };
    const screw = (u, v) => {
      const r = 0.0027 * PX; g.fillStyle = '#1b1c1e'; g.beginPath(); g.arc(X(u), Y(v), r * 1.25, 0, TAU); g.fill();
      const sg = g.createRadialGradient(X(u) - r * 0.4, Y(v) - r * 0.4, 0, X(u), Y(v), r); sg.addColorStop(0, '#9aa0a6'); sg.addColorStop(1, '#4b4f54');
      g.fillStyle = sg; g.beginPath(); g.arc(X(u), Y(v), r, 0, TAU); g.fill();
      g.strokeStyle = '#2a2c2f'; g.lineWidth = r * 0.35; g.beginPath(); g.moveTo(X(u) - r * 0.7, Y(v) + r * 0.3); g.lineTo(X(u) + r * 0.7, Y(v) - r * 0.3); g.stroke();
    };
    const roundRect = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const bezel = (u, v, r, square = true) => {
      const s = r + 0.0065;
      g.fillStyle = '#0c0d0e'; if (square) roundRect(X(u - s), Y(v + s), 2 * s * PX, 2 * s * PX, 0.008 * PX); else { g.beginPath(); g.arc(X(u), Y(v), s * PX, 0, TAU); } g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.stroke();
      if (square) for (const [du, dv] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) screw(u + du * (s - 0.0045), v + dv * (s - 0.0045));
    };
    for (const [u, v] of Object.values(G)) bezel(u, v, R6);
    for (const [u, v] of ENG) bezel(u, v, RE, false);
    // static gauges drawn straight onto the panel (their recessed faces sample this texture)
    for (const [key, [u, v]] of Object.entries(STAT)) {
      bezel(u, v, RS);
      g.save(); g.translate(X(u), Y(v)); const k = RS * PX / 128; g.scale(k, k);
      g.fillStyle = '#0e0f11'; g.beginPath(); g.arc(0, 0, 128, 0, TAU); g.fill();
      const a0 = -120 * RAD, a1 = 120 * RAD, n = key === 'suction' ? 10 : 12;
      for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); g.strokeStyle = '#ececea'; g.lineWidth = i % 2 ? 4 : 7; g.beginPath(); g.moveTo(Math.sin(a) * 92, -Math.cos(a) * 92); g.lineTo(Math.sin(a) * 118, -Math.cos(a) * 118); g.stroke(); }
      g.strokeStyle = '#2faa55'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 104, (key === 'suction' ? lerp(a0, a1, 0.45) : lerp(a0, a1, 0.45)) - Math.PI / 2, (key === 'suction' ? lerp(a0, a1, 0.55) : lerp(a0, a1, 0.75)) - Math.PI / 2); g.stroke();
      g.fillStyle = '#ececea'; g.font = `700 34px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(key === 'suction' ? 'SUCTION' : 'AMPS', 0, 52); g.font = `600 28px ${FONT}`; g.fillText(key === 'suction' ? 'IN HG' : '-  +', 0, 84);
      const na = key === 'suction' ? lerp(a0, a1, 0.5) : lerp(a0, a1, 0.56);
      g.rotate(na); g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(-7, 18); g.lineTo(0, -108); g.lineTo(7, 18); g.closePath(); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill(); g.restore();
    }
    // annunciator and clock frames, radio stack opening, yoke boots
    g.fillStyle = '#0a0b0c'; roundRect(X(ANN.u - ANN.w / 2 - 0.004), Y(ANN.v + ANN.h / 2 + 0.004), (ANN.w + 0.008) * PX, (ANN.h + 0.008) * PX, 6); g.fill();
    g.fillStyle = '#0a0b0c'; roundRect(X(CLOCK.u - CLOCK.w / 2 - 0.006), Y(CLOCK.v + CLOCK.h / 2 + 0.012), (CLOCK.w + 0.012) * PX, (CLOCK.h + 0.024) * PX, 8); g.fill();
    for (const [i, t] of ['OAT', 'SEL', 'CTL'].entries()) { const u = CLOCK.u - 0.022 + i * 0.022; g.fillStyle = '#2d2f33'; g.beginPath(); g.arc(X(u), Y(CLOCK.v - 0.014), 0.0035 * PX, 0, TAU); g.fill(); T(t, u, CLOCK.v + 0.0135, 0.0035, '#bfbfba'); }
    g.fillStyle = '#060708'; g.fillRect(X(STACK.u0) - 3, Y(STACK.v1) - 3, (STACK.u1 - STACK.u0) * PX + 6, (STACK.v1 - STACK.v0) * PX + 6);
    for (const [u, v] of YOKES) { g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(X(u), Y(v), (RY + 0.01) * PX, 0, TAU); g.fill(); }
    // switches, key, knobs, flap selector labels
    T('OFF', -0.512, -0.105, 0.0042); T('R', -0.503, -0.097, 0.0042); T('L', -0.477, -0.097, 0.0042); T('BOTH', -0.466, -0.108, 0.0042); T('START', -0.47, -0.134, 0.0042);
    T('MAGNETOS', -0.49, -0.145, 0.0048, '#e9e8e2', 700);
    T('MASTER', -0.405, -0.143, 0.0048, '#e9e8e2', 700); T('BAT', -0.415, -0.188, 0.0038); T('ALT', -0.395, -0.188, 0.0038);
    T('AVIONICS', -0.365, -0.143, 0.0042, '#e9e8e2', 700);
    ['FUEL PUMP', 'BEACON', 'LAND', 'TAXI', 'NAV', 'STROBE'].forEach((t, i) => T(t, -0.335 + i * 0.03, -0.143, 0.0036));
    T('CARB HEAT', -0.01, -0.192, 0.0038); T('THROTTLE', 0.045, -0.192, 0.0038); T('MIXTURE', 0.1, -0.192, 0.0038);
    g.fillStyle = '#0b0c0d'; roundRect(X(0.162), Y(-0.05), 0.012 * PX, 0.104 * PX, 8); g.fill();
    T('FLAPS', 0.168, -0.04, 0.0045, '#e9e8e2', 700);
    [['UP', 0], ['10°', 1], ['20°', 2], ['FULL', 3]].forEach(([t, k]) => { const v = -0.058 - k * 0.03; T(t, 0.198, v, 0.0038, '#e9e8e2', 600, 'left'); g.fillStyle = '#e9e8e2'; g.fillRect(X(0.183), Y(v) - 2, 0.012 * PX, 4); });
    // circuit breakers, glovebox, placards, type plate, hour meter
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) T(['5', '10', '15', '5', '10', '20'][i], 0.36 + i * 0.026, -0.04 - r * 0.036, 0.0036, '#cfcfca');
    T('CIRCUIT BREAKERS', 0.425, -0.022, 0.0036);
    g.strokeStyle = '#1b1d20'; g.lineWidth = 3; roundRect(X(0.33), Y(-0.115), 0.19 * PX, 0.078 * PX, 10); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2; roundRect(X(0.33) + 2, Y(-0.115) + 2, 0.19 * PX, 0.078 * PX, 10); g.stroke();
    g.fillStyle = '#16171a'; roundRect(X(0.415), Y(-0.12), 0.02 * PX, 0.008 * PX, 4); g.fill();
    const plate = (u, v, w, h, lines, bg = '#101113', fg = '#e5e4dd') => { g.fillStyle = bg; roundRect(X(u - w / 2), Y(v + h / 2), w * PX, h * PX, 5); g.fill(); lines.forEach(([t, dv, s], i) => T(t, u, v + dv, s, fg, 600)); };
    plate(0.40, 0.133, 0.14, 0.02, [['MANEUVERING SPEED 105 KIAS', 0.0035, 0.0038], ['NO SMOKING', -0.0052, 0.0033]]);
    { const u = 0.40, v = 0.103, w = 0.13, h = 0.022, gr = g.createLinearGradient(0, Y(v + h / 2), 0, Y(v - h / 2)); gr.addColorStop(0, '#d9dcdf'); gr.addColorStop(1, '#9ea3a8');
      g.fillStyle = gr; roundRect(X(u - w / 2), Y(v + h / 2), w * PX, h * PX, 6); g.fill(); T('MQ-172  雲雀', u, v + 0.003, 0.0075, '#1e3550', 700); T('LARK · SKYGLAZE TRAINER', u, v - 0.0065, 0.0032, '#1e3550', 600); }
    plate(0.40, 0.073, 0.15, 0.02, [['THIS AIRPLANE MUST BE OPERATED IN THE', 0.004, 0.003], ['NORMAL CATEGORY · VFR DAY AND NIGHT', -0.0035, 0.003]]);
    plate(0.30, 0.095, 0.05, 0.016, [['1834.6', 0.0015, 0.0075]], '#0a0a0a', '#f0f0ea'); T('HOURS', 0.30, 0.081, 0.0034);
    T('ELT', 0.30, 0.055, 0.0036); g.fillStyle = '#c42020'; roundRect(X(0.293), Y(0.05), 0.014 * PX, 0.008 * PX, 3); g.fill();
    T('ALL SPEEDS IAS', -0.30, -0.048, 0.0034, '#cfcfca');
    T('VOR 1 / ILS', -0.11, 0.153, 0.0034, '#cfcfca'); T('ENGINE', -0.485, 0.122, 0.0036, '#cfcfca', 700);
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 40; i++) { const u = PANEL.u0 + 0.005 + (PANEL.u1 - PANEL.u0 - 0.01) * i / 40; const y = Y(vTop(u)) + 3; i ? g.lineTo(X(u), y) : g.moveTo(X(u), y); } g.stroke();
    M.panel.map = canvasTexture(c); M.panel.color.set(0xffffff);
  }

  // ---- Radio stack: six units drawn once (512 x 828), displays re-used by an unlit overlay so they glow --------------------------
  const RW = 512, RPX = RW / (STACK.u1 - STACK.u0), RH = Math.round((STACK.v1 - STACK.v0) * RPX); // drawn at RW x RH, stored at 512 x 512
  const UNITS = [['audio', 0.028], ['gps', 0.074], ['navcom', 0.044], ['adf', 0.034], ['xpdr', 0.034], ['ap', 0.034]];
  const unitRects = []; { let v = STACK.v1 - 0.003; for (const [id, h] of UNITS) { unitRects.push({ id, u0: STACK.u0 + 0.002, u1: STACK.u1 - 0.002, v0: v - h, v1: v }); v -= h + 0.0045; } }
  const unit = (id) => unitRects.find(r => r.id === id);
  const lit = []; // display rects in panel coordinates
  const litRect = (id, x0, y0, x1, y1) => { const r = unit(id), u0 = r.u0 + x0 * (r.u1 - r.u0), u1 = r.u0 + x1 * (r.u1 - r.u0), v1 = r.v1 - y0 * (r.v1 - r.v0), v0 = r.v1 - y1 * (r.v1 - r.v0); lit.push({ id, u0, u1, v0, v1 }); return { u0, u1, v0, v1 }; };
  const gpsScreen = litRect('gps', 0.2, 0.1, 0.78, 0.84), comWin = litRect('navcom', 0.04, 0.16, 0.47, 0.66), navWin = litRect('navcom', 0.53, 0.16, 0.96, 0.66);
  const adfWin = litRect('adf', 0.16, 0.14, 0.76, 0.7), xpdrWin = litRect('xpdr', 0.22, 0.14, 0.7, 0.7);
  const apWin = (() => { const r = unit('ap'); return { u0: r.u0 + 0.24 * (r.u1 - r.u0), u1: r.u0 + 0.76 * (r.u1 - r.u0), v1: r.v1 - 0.12 * (r.v1 - r.v0), v0: r.v1 - 0.6 * (r.v1 - r.v0) }; })();
  if (dom) {
    const c = makeCanvas(RW, 512), g = c.getContext('2d'); g.scale(1, 512 / RH);
    const RX = (u) => (u - STACK.u0) * RPX, RY_ = (v) => (STACK.v1 - v) * RPX;
    g.fillStyle = '#050506'; g.fillRect(0, 0, RW, RH);
    const T = (text, x, y, size, color = '#d8d8d2', weight = 600, align = 'center', font = FONT) => { g.fillStyle = color; g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(text, x, y); };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const key = (x, y, w, h, text, size = 11) => { g.fillStyle = '#2d3034'; rr(x, y, w, h, 4); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.stroke(); T(text, x + w / 2, y + h / 2 + 1, size, '#e6e6e0'); };
    const MONO = '"SF Mono", Menlo, Consolas, "Courier New", monospace';
    const win = (r) => ({ x: RX(r.u0), y: RY_(r.v1), w: (r.u1 - r.u0) * RPX, h: (r.v1 - r.v0) * RPX });
    for (const r of unitRects) {
      const x = RX(r.u0), y = RY_(r.v1), w = (r.u1 - r.u0) * RPX, h = (r.v1 - r.v0) * RPX;
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#2b2e32'); gr.addColorStop(0.08, '#1f2124'); gr.addColorStop(1, '#17181b');
      g.fillStyle = gr; rr(x, y, w, h, 5); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1.5; g.stroke();
      for (const [sx, sy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) { g.fillStyle = '#4a4e53'; g.beginPath(); g.arc(sx, sy, 2.3, 0, TAU); g.fill(); }
      if (r.id === 'audio') {
        ['COM1', 'COM2', 'COM3', 'NAV1', 'NAV2', 'DME', 'ADF', 'MKR'].forEach((t, i) => key(x + 92 + i * 47, y + h * 0.25, 40, h * 0.5, t, 10));
        [['#3b6fd6', 'O'], ['#d99a1e', 'M'], ['#e8e8e8', 'I']].forEach(([col, t], i) => { g.fillStyle = col; g.globalAlpha = 0.45; g.beginPath(); g.arc(x + 20 + i * 22, y + h / 2, 8, 0, TAU); g.fill(); g.globalAlpha = 1; T(t, x + 20 + i * 22, y + h / 2 + 1, 9, '#111'); });
      } else if (r.id === 'gps') {
        const s = win(gpsScreen); g.fillStyle = '#04060a'; g.fillRect(s.x, s.y, s.w, s.h);
        g.fillStyle = '#0b1830'; g.fillRect(s.x + s.w * 0.36, s.y, s.w * 0.64, s.h);
        T('COM', s.x + 8, s.y + 14, 11, '#9fd8ff', 700, 'left'); T('118.300', s.x + 8, s.y + 32, 17, '#39ff6a', 700, 'left', MONO); T('121.500', s.x + 8, s.y + 52, 15, '#e8f0f0', 600, 'left', MONO);
        T('VLOC', s.x + 8, s.y + 76, 11, '#9fd8ff', 700, 'left'); T('110.50', s.x + 8, s.y + 94, 17, '#39ff6a', 700, 'left', MONO); T('113.90', s.x + 8, s.y + 114, 15, '#e8f0f0', 600, 'left', MONO);
        const mx = s.x + s.w * 0.36; g.strokeStyle = '#ff38e0'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx + s.w * 0.33, s.y + s.h - 6); g.lineTo(mx + s.w * 0.31, s.y + 10); g.stroke();
        g.strokeStyle = 'rgba(120,170,220,0.35)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(mx + s.w * 0.32, s.y + s.h * 0.72, i * 28, Math.PI, TAU); g.stroke(); }
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(mx + s.w * 0.32, s.y + s.h * 0.62); g.lineTo(mx + s.w * 0.32 - 7, s.y + s.h * 0.77); g.lineTo(mx + s.w * 0.32 + 7, s.y + s.h * 0.77); g.closePath(); g.fill();
        T('LSZH', mx + s.w * 0.31 + 4, s.y + 22, 11, '#d8e8ff', 700, 'left'); T('DTK 137°', mx + 6, s.y + s.h - 26, 11, '#e8f0f0', 600, 'left'); T('GS  65KT', mx + 6, s.y + s.h - 11, 11, '#e8f0f0', 600, 'left');
        T('1.5NM', mx + s.w * 0.64 - 6, s.y + s.h - 11, 10, '#9fd8ff', 600, 'right');
        ['CDI', 'OBS', 'MSG', 'FPL', 'PROC'].forEach((t, i) => key(x + 100 + i * 50, y + h - 24, 44, 16, t, 10));
        ['RNG', 'D→', 'MENU', 'CLR', 'ENT'].forEach((t, i) => key(x + w - 92, y + 10 + i * 27, 30, 20, t, 9));
        T('GPS · NAV · COM', x + 46, y + 14, 9, '#9a9a96');
      } else if (r.id === 'navcom') {
        for (const [ww, a, b, label] of [[comWin, '124.70', '121.90', 'COM'], [navWin, '110.50', '113.90', 'NAV']]) {
          const s = win(ww); g.fillStyle = '#080404'; g.fillRect(s.x, s.y, s.w, s.h);
          T(a, s.x + s.w * 0.3, s.y + s.h / 2 + 1, 25, '#ff8a1c', 700, 'center', MONO); T(b, s.x + s.w * 0.78, s.y + s.h / 2 + 2, 17, '#ff8a1c', 600, 'center', MONO);
          T(label, s.x + s.w / 2, s.y + s.h + 12, 10, '#bdbdb8'); T('STBY', s.x + s.w * 0.78, s.y + s.h + 12, 9, '#8d8d89');
        }
      } else if (r.id === 'adf') {
        const s = win(adfWin); g.fillStyle = '#080503'; g.fillRect(s.x, s.y, s.w, s.h);
        T('ANT', s.x + 26, s.y + s.h / 2, 11, '#ffb02a', 700); T('362', s.x + s.w * 0.4, s.y + s.h / 2 + 1, 24, '#ffb02a', 700, 'center', MONO); T('FRQ', s.x + s.w * 0.62, s.y + s.h / 2, 11, '#ffb02a', 700); T('255', s.x + s.w * 0.83, s.y + s.h / 2 + 1, 20, '#ffb02a', 700, 'center', MONO);
        ['ADF', 'BFO', 'FRQ', 'FLT/ET'].forEach((t, i) => key(x + 74 + i * 66, y + h - 21, 58, 15, t, 9)); T('KR 87', x + 30, y + h / 2, 10, '#9a9a96');
      } else if (r.id === 'xpdr') {
        const s = win(xpdrWin); g.fillStyle = '#080503'; g.fillRect(s.x, s.y, s.w, s.h);
        T('ALT', s.x + 26, s.y + s.h / 2, 11, '#ffb02a', 700); T('1200', s.x + s.w * 0.55, s.y + s.h / 2 + 1, 26, '#ffb02a', 700, 'center', MONO); T('R', s.x + s.w - 14, s.y + 14, 11, '#ffb02a', 700);
        ['IDT', 'VFR', 'CLR'].forEach((t, i) => key(x + 120 + i * 84, y + h - 21, 70, 15, t, 9)); T('OFF SBY ON ALT TST', x + w - 70, y + 14, 8, '#9a9a96'); T('XPDR', x + 30, y + h / 2, 10, '#9a9a96');
      } else if (r.id === 'ap') {
        const s = win(apWin); g.fillStyle = '#0c120b'; g.fillRect(s.x, s.y, s.w, s.h);
        ['AP', 'HDG', 'NAV', 'APR', 'REV', 'ALT', 'UP', 'DN'].forEach((t, i) => key(x + 22 + i * 58, y + h - 21, 50, 15, t, 9)); T('KAP 140', x + 40, y + 14, 9, '#9a9a96');
      }
    }
    const tex = canvasTexture(c); M.radio.map = tex; M.radio.color.set(0xffffff); M.radioLit.map = tex;
    const uvRect = (geom, r) => { const t = geom.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, lerp((r.u0 - STACK.u0) / (STACK.u1 - STACK.u0), (r.u1 - STACK.u0) / (STACK.u1 - STACK.u0), t.getX(i)), lerp((r.v0 - STACK.v0) / (STACK.v1 - STACK.v0), (r.v1 - STACK.v0) / (STACK.v1 - STACK.v0), t.getY(i))); return geom; };
    for (const r of unitRects) B.add('radio', onPanel(uvRect(new THREE.PlaneGeometry(r.u1 - r.u0, r.v1 - r.v0), r).translate((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, -0.003)));
    for (const r of lit) B.add('radioLit', onPanel(uvRect(new THREE.PlaneGeometry(r.u1 - r.u0, r.v1 - r.v0), r).translate((r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, -0.0024)));
  }
  // radio knobs (dual concentric) along the right edge of the stack units
  const knob = (u, v, r = 0.0085) => {
    B.add('black', onPanel(new THREE.CylinderGeometry(r, r * 1.05, 0.008, 14).rotateX(Math.PI / 2).translate(u, v, 0.001)));
    B.add('black', onPanel(new THREE.CylinderGeometry(r * 0.65, r * 0.68, 0.016, 10).rotateX(Math.PI / 2).translate(u, v, 0.005)));
  };
  { const r = unit('gps'); knob(r.u0 + 0.014, lerp(r.v1, r.v0, 0.3)); knob(r.u0 + 0.014, lerp(r.v1, r.v0, 0.72)); }
  { const r = unit('navcom'); knob(r.u0 + 0.03, r.v0 + 0.0085, 0.0062); knob(r.u1 - 0.03, r.v0 + 0.0085, 0.0062); }
  for (const id of ['adf', 'xpdr', 'ap']) { const r = unit(id); knob(r.u1 - 0.014, (r.v0 + r.v1) / 2 + 0.004, 0.0075); }

  // ---- Switches, key, knobs, flap selector, circuit breakers ------------------------------------------------------------------
  {
    const rocker = (u, v, color, w = 0.011, h = 0.022) => B.add(color, onPanel(new THREE.BoxGeometry(w, h, 0.01).rotateX(0.18).translate(u, v, 0.004)));
    rocker(-0.411, -0.165, 'red', 0.016); rocker(-0.399, -0.165, 'red', 0.008);
    rocker(-0.365, -0.165, 'red', 0.014);
    for (let i = 0; i < 6; i++) { rocker(-0.335 + i * 0.03, -0.165, i % 2 ? 'white' : 'black'); }
    B.add('black', onPanel(new THREE.CylinderGeometry(0.016, 0.017, 0.01, 24).rotateX(Math.PI / 2).translate(-0.49, -0.115, 0.004))); // ignition switch
    B.add('metal', onPanel(new THREE.BoxGeometry(0.005, 0.03, 0.003).translate(0, 0.012, 0).rotateZ(-0.6).translate(-0.49, -0.115, 0.012)));
    B.add('metal', onPanel(new THREE.TorusGeometry(0.008, 0.002, 6, 16).translate(0, 0.031, 0).rotateZ(-0.6).translate(-0.49, -0.115, 0.012)));
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) B.add('black', onPanel(new THREE.CylinderGeometry(0.0042, 0.0045, 0.008, 8).rotateX(Math.PI / 2).translate(0.36 + i * 0.026, -0.052 - r * 0.036, 0.003)));
    for (const [u, color] of [[-0.01, 'white'], [0.1, 'red']]) { // carb heat, mixture (static, pushed in / full rich)
      B.add('metal', onPanel(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8).rotateX(Math.PI / 2).translate(u, -0.168, 0.005)));
      B.add(color, onPanel(new THREE.CylinderGeometry(0.014, 0.015, 0.016, 20).rotateX(Math.PI / 2).translate(u, -0.168, 0.026)));
      B.add(color, onPanel(new THREE.CylinderGeometry(0.012, 0.014, 0.006, 20).rotateX(Math.PI / 2).translate(u, -0.168, 0.036)));
    }
    for (const [u, v] of [[-0.01, -0.168], [0.045, -0.168], [0.1, -0.168]]) B.add('black', onPanel(new THREE.TorusGeometry(0.0075, 0.003, 6, 16).translate(u, v, 0.001)));
  }
  // Moving controls (each its own small mesh).
  const panelMount = (u, v) => { const o = new THREE.Group(); o.position.set(...PP(u, v, 0)); o.rotation.x = -PANEL.tilt; cabin.add(o); return o; };
  const throttle = new THREE.Group(); panelMount(0.045, -0.168).add(throttle);
  throttle.add(new THREE.Mesh(K.merge([new THREE.CylinderGeometry(0.0045, 0.0045, 0.11, 8).rotateX(Math.PI / 2).translate(0, 0, -0.04)]), M.metal));
  throttle.add(new THREE.Mesh(K.merge([new THREE.CylinderGeometry(0.019, 0.019, 0.022, 24).rotateX(Math.PI / 2).translate(0, 0, 0.022), K.place(new THREE.SphereGeometry(0.019, 24, 10, 0, TAU, 0, Math.PI / 2), [0, 0, 0.033], [Math.PI / 2, 0, 0], [1, 0.45, 1])]), M.black));
  const flapLever = new THREE.Group(); panelMount(0.168, -0.058).add(flapLever);
  flapLever.add(new THREE.Mesh(K.merge([new THREE.BoxGeometry(0.004, 0.004, 0.03).translate(0, 0, 0.012), new THREE.BoxGeometry(0.022, 0.011, 0.012).translate(0, -0.002, 0.03)]), M.white));
  const flapPointer = new THREE.Mesh(K.merge([new THREE.ConeGeometry(0.004, 0.009, 3).rotateZ(-Math.PI / 2).translate(0, 0, 0.003)]), M.white);
  panelMount(0.18, -0.058).add(flapPointer);
  // Trim wheel and indicator on the pedestal; rudder pedals.
  const trimWheel = new THREE.Mesh((() => {
    const g = new THREE.CylinderGeometry(0.075, 0.075, 0.022, 36, 1).rotateZ(Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, y), r = Math.hypot(y, z); if (r > 0.07) { const k = 1 - 0.035 * (Math.cos(a * 36) > 0 ? 1 : 0); p.setY(i, y * k); p.setZ(i, z * k); } }
    g.computeVertexNormals(); return g;
  })(), M.black);
  trimWheel.position.set(0.03, -0.09, -1.0); cabin.add(trimWheel);
  B.add('black', K.place(new THREE.BoxGeometry(0.006, 0.09, 0.006), [-0.012, -0.09, -0.973]));
  const trimPointer = new THREE.Mesh(K.merge([new THREE.BoxGeometry(0.012, 0.004, 0.004)]), M.white); trimPointer.position.set(-0.012, -0.09, -0.969); cabin.add(trimPointer);
  B.add('white', K.place(new THREE.BoxGeometry(0.014, 0.002, 0.002), [-0.012, -0.075, -0.97]));
  const pedals = { L: new THREE.Group(), R: new THREE.Group() }; cabin.add(pedals.L, pedals.R);
  for (const [key, dx] of [['L', -0.12], ['R', 0.12]]) {
    const parts = [];
    for (const x0 of [-0.3, 0.3]) {
      parts.push(K.place(roundedBox(0.075, 0.12, 0.014, 0.006, 2), [x0 + dx, -0.3, -1.38], [-0.45, 0, 0]));
      parts.push(K.place(new THREE.BoxGeometry(0.012, 0.22, 0.012), [x0 + dx, -0.2, -1.45], [-0.35, 0, 0]));
    }
    pedals[key].add(new THREE.Mesh(K.merge(parts), M.yoke));
  }
  // Yokes: column out of the panel, ram's-horn wheel with grips, PTT and trim switches.
  const yokes = YOKES.map(([u, v]) => {
    const mount = new THREE.Group(); mount.position.set(...PP(u, v, 0)); mount.position.y += 0.0; cabin.add(mount);
    const slide = new THREE.Group(); mount.add(slide);
    slide.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.36, 14).rotateX(Math.PI / 2).translate(0, 0, 0.06), M.column));
    const wheel = new THREE.Group(); wheel.position.z = 0.235; slide.add(wheel);
    const horn = (s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.03, 0.0, 0], [0.085, -0.006, 0], [0.13, 0.008, 0], [0.152, 0.055, 0], [0.155, 0.11, 0], [0.142, 0.15, 0]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z))), 18, 0.0135, 8, false);
    const grip = (s) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.153, 0.05, 0], [0.156, 0.095, 0], [0.149, 0.136, 0]].map(([x, y, z]) => new THREE.Vector3(s * x, y, z))), 8, 0.0175, 10, false);
    const parts = [horn(-1), horn(1), grip(-1), grip(1), roundedBox(0.085, 0.05, 0.045, 0.014, 3), K.place(new THREE.SphereGeometry(0.0145, 8, 6), [-0.142, 0.15, 0]), K.place(new THREE.SphereGeometry(0.0145, 8, 6), [0.142, 0.15, 0])];
    wheel.add(new THREE.Mesh(K.merge(parts), M.yoke));
    wheel.add(new THREE.Mesh(K.merge([K.place(new THREE.BoxGeometry(0.05, 0.022, 0.003), [0, 0.002, 0.0235])]), M.metal));
    wheel.add(new THREE.Mesh(K.merge([K.place(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 8), [-0.148, 0.163, 0.004]), K.place(new THREE.BoxGeometry(0.006, 0.01, 0.006), [-0.137, 0.115, 0.017])]), M.red));
    return { slide, wheel };
  });
  // Magnetic compass on the glare shield: card rotates with heading behind a lubber line.
  const compassCard = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.017, 48, 1, true), M.card);
  {
    const cz = -1.31, cy = 0.475; compassCard.position.set(0, cy, cz); cabin.add(compassCard);
    B.add('black', K.place(roundedBox(0.07, 0.05, 0.052, 0.01, 3), [0, cy + 0.002, cz - 0.012]));
    B.add('black', K.place(new THREE.BoxGeometry(0.066, 0.012, 0.03), [0, cy + 0.0145, cz + 0.02]));
    B.add('black', K.place(new THREE.BoxGeometry(0.066, 0.012, 0.03), [0, cy - 0.0145, cz + 0.02]));
    for (const s of [-1, 1]) B.add('black', K.place(new THREE.BoxGeometry(0.012, 0.04, 0.03), [s * 0.028, cy, cz + 0.02]));
    B.add('black', K.place(new THREE.BoxGeometry(0.03, 0.03, 0.02), [0, cy - 0.04, cz - 0.01]));
    B.add('red', K.place(new THREE.BoxGeometry(0.0012, 0.02, 0.001), [0, cy, cz + 0.0255]));
    B.add('glass', K.place(new THREE.PlaneGeometry(0.044, 0.018), [0, cy, cz + 0.035]));
    if (dom) {
      const c = makeCanvas(1024, 64), g = c.getContext('2d'); g.fillStyle = '#16171a'; g.fillRect(0, 0, 1024, 64);
      for (let d = 0; d < 360; d += 5) {
        const x = (360 - d) % 360 / 360 * 1024; g.fillStyle = '#f2f1ea'; g.fillRect(x - 1, 0, 2.5, d % 10 ? 9 : 15);
        if (d % 30 === 0) { g.font = `700 ${d % 90 ? 22 : 28}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10), x === 0 ? 0 : x, 40); if (x === 0) g.fillText('N', 1024, 40); }
      }
      M.card.map = canvasTexture(c);
    }
  }

  // ---- Live instruments: two 512 x 512 atlases (six-pack, CDI, tach) and a 512 x 256 sheet (engine, annunciator, AP, clock) ----
  const sheets = dom ? Object.fromEntries([['A', 512, 512], ['B', 512, 512], ['C', 512, 256]].map(([k, w, h]) => { const c = makeCanvas(w, h); return [k, { c, g: c.getContext('2d'), t: canvasTexture(c), w, h }]; })) : null;
  if (sheets) { M.gaugeA.map = sheets.A.t; M.gaugeB.map = sheets.B.t; M.gaugeC.map = sheets.C.t; }
  const cell = (sheet, x, y, w, h = w) => ({ sheet, x, y, w, h });
  const CELLS = {
    asi: cell('A', 0, 0, 256), ai: cell('A', 256, 0, 256), alt: cell('A', 0, 256, 256), vsi: cell('A', 256, 256, 256),
    tc: cell('B', 0, 0, 256), hi: cell('B', 256, 0, 256), cdi: cell('B', 0, 256, 256), tach: cell('B', 256, 256, 256),
    fuelL: cell('C', 0, 0, 128), fuelR: cell('C', 128, 0, 128), oilT: cell('C', 256, 0, 128), oilP: cell('C', 384, 0, 128),
    ann: cell('C', 0, 128, 480, 48), ap: cell('C', 0, 176, 256, 48), clock: cell('C', 256, 176, 192, 48),
  };
  const atlasUV = (geom, c, sw, sh) => { const t = geom.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, (c.x + t.getX(i) * c.w) / sw, 1 - (c.y + (1 - t.getY(i)) * c.h) / sh); return geom; };
  const sizeOf = { A: [512, 512], B: [512, 512], C: [512, 256] };
  const faceGeo = (key, geom) => { const c = CELLS[key]; return atlasUV(geom, c, ...sizeOf[c.sheet]); };
  for (const key of ['asi', 'ai', 'alt', 'vsi', 'tc', 'hi', 'cdi', 'tach']) { const [u, v] = G[key]; B.add('gauge' + CELLS[key].sheet, onPanel(faceGeo(key, new THREE.CircleGeometry(R6, 48)).translate(u, v, -0.012))); }
  ['fuelL', 'fuelR', 'oilT', 'oilP'].forEach((key, i) => B.add('gaugeC', onPanel(faceGeo(key, new THREE.CircleGeometry(RE, 32)).translate(ENG[i][0], ENG[i][1], -0.008))));
  B.add('gaugeC', onPanel(faceGeo('ann', new THREE.PlaneGeometry(ANN.w, ANN.h)).translate(ANN.u, ANN.v, 0.0015)));
  B.add('gaugeC', onPanel(faceGeo('clock', new THREE.PlaneGeometry(CLOCK.w, CLOCK.h)).translate(CLOCK.u, CLOCK.v, 0.0015)));
  B.add('gaugeC', onPanel(faceGeo('ap', new THREE.PlaneGeometry(apWin.u1 - apWin.u0, apWin.v1 - apWin.v0)).translate((apWin.u0 + apWin.u1) / 2, (apWin.v0 + apWin.v1) / 2, -0.0024)));

  // Dial painting (each dial drawn in a +-128 unit space; angles measured clockwise from 12 o'clock).
  const INK = '#f1f0ea';
  const polar = (a, r) => [Math.sin(a) * r, -Math.cos(a) * r];
  const ctxOf = (g) => ({
    tick(a, r0, r1, w, color = INK) { const [x0, y0] = polar(a, r0), [x1, y1] = polar(a, r1); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); },
    band(a0, a1, r, w, color) { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.arc(0, 0, r, a0 - Math.PI / 2, a1 - Math.PI / 2); g.stroke(); },
    text(t, x, y, size, color = INK, weight = 700) { g.fillStyle = color; g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); },
    needle(a, len, w, tail = 22, color = '#f6f6f2') { g.save(); g.rotate(a); g.fillStyle = color; g.beginPath(); g.moveTo(-w * 0.6, tail); g.lineTo(-w * 0.5, -len + 14); g.lineTo(0, -len); g.lineTo(w * 0.5, -len + 14); g.lineTo(w * 0.6, tail); g.closePath(); g.fill(); g.restore(); },
    hub(r = 10) { g.fillStyle = '#141518'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.strokeStyle = '#46494e'; g.lineWidth = 2; g.stroke(); },
    base() { g.fillStyle = '#050506'; g.beginPath(); g.arc(0, 0, 128, 0, TAU); g.fill(); const r = g.createRadialGradient(0, -30, 10, 0, 0, 122); r.addColorStop(0, '#1d1f22'); r.addColorStop(1, '#0d0e10'); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 121, 0, TAU); g.fill(); },
    glare() { const gr = g.createLinearGradient(-100, -110, 40, 40); gr.addColorStop(0, 'rgba(255,255,255,0.13)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.03)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 121, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 116, -2.5, -1.75); g.stroke(); },
  });
  const asiA = (kt) => { const k = clamp(kt, 0, 210); return (k <= 40 ? k / 40 * 22 : 22 + (k - 40) / 160 * 318) * RAD; };
  const vsiA = (fpm) => { const f = clamp(fpm, -2000, 2000), a = Math.abs(f); return -Math.PI / 2 + Math.sign(f) * (a <= 1000 ? a / 1000 * 90 : 90 + (a - 1000) / 1000 * 80) * RAD; };
  const tachA = (rpm) => (-135 + clamp(rpm, 0, 3500) / 3500 * 270) * RAD;
  const miniA = (t) => lerp(-100, 100, clamp(t, 0, 1)) * RAD;
  const FACES = {
    asi(g, d) { d.base(); d.band(asiA(V.s0), asiA(V.fe), 99, 7, '#f2f2ee'); d.band(asiA(V.s1), asiA(V.no), 109, 9, '#1fa64c'); d.band(asiA(V.no), asiA(V.ne), 109, 9, '#f2c21b'); d.tick(asiA(V.ne), 96, 120, 5, '#e3262d');
      for (let k = 40; k <= 200; k += 5) d.tick(asiA(k), k % 10 ? 109 : 102, 119, k % 10 ? 2 : 3.5);
      for (let k = 40; k <= 200; k += 20) { const [x, y] = polar(asiA(k), 82); d.text(String(k), x, y, k >= 100 ? 19 : 21); }
      d.text('AIRSPEED', 0, -34, 12, '#d8d7d0', 600); d.text('KNOTS', 0, 36, 13, '#d8d7d0', 600); },
    alt(g, d) { d.base(); for (let i = 0; i < 50; i++) d.tick(i / 50 * TAU, i % 5 ? 108 : 99, 119, i % 5 ? 2 : 4);
      for (let i = 0; i < 10; i++) { const [x, y] = polar(i / 10 * TAU, 83); d.text(String(i), x, y, 26); }
      g.fillStyle = '#000'; g.fillRect(36, -12, 44, 24); g.strokeStyle = '#555'; g.lineWidth = 2; g.strokeRect(36, -12, 44, 24); d.text('1013', 58, 1, 14, '#f4f4ee', 700);
      d.text('ALT', 0, -38, 14, '#d8d7d0'); d.text('100 FEET', 0, 40, 11, '#d8d7d0', 600); d.text('MB', 58, 22, 9, '#bdbdb8', 600); },
    vsi(g, d) { d.base(); for (let f = -2000; f <= 2000; f += 100) { if (Math.abs(f) > 1000 && f % 250) continue; d.tick(vsiA(f), f % 500 ? 108 : 99, 119, f % 500 ? 2 : 4); }
      d.tick(vsiA(0), 92, 119, 4); for (const f of [500, 1000, 1500, 2000]) for (const s of [-1, 1]) { const [x, y] = polar(vsiA(s * f), 82); d.text(String(f / 100), x, y, 20); }
      { const [x, y] = polar(vsiA(0), 82); d.text('0', x, y, 22); }
      d.text('UP', -34, -46, 13, '#d8d7d0'); d.text('DOWN', -34, 46, 13, '#d8d7d0'); d.text('VERTICAL SPEED', 28, -22, 9, '#d8d7d0', 600); d.text('100 FT PER MIN', 28, 22, 9, '#d8d7d0', 600); },
    tc(g, d) { d.base(); for (const a of [-90, 90]) d.tick(a * RAD, 98, 120, 5); for (const a of [-110, 110]) d.tick(a * RAD, 98, 120, 5);
      { const [x, y] = polar(-116 * RAD, 82); d.text('L', x, y, 20); } { const [x, y] = polar(116 * RAD, 82); d.text('R', x, y, 20); }
      d.text('TURN COORDINATOR', 0, -62, 9, '#d8d7d0', 600); d.text('D.C. ELEC', 0, -48, 9, '#d8d7d0', 600); d.text('2 MIN', 0, 44, 11, '#d8d7d0');
      g.strokeStyle = '#3a3b3d'; g.lineWidth = 24; g.beginPath(); g.arc(0, -46, 126, Math.PI / 2 - 0.27, Math.PI / 2 + 0.27); g.stroke();
      g.strokeStyle = '#d9d2b0'; g.lineWidth = 19; g.beginPath(); g.arc(0, -46, 126, Math.PI / 2 - 0.26, Math.PI / 2 + 0.26); g.stroke();
      g.strokeStyle = '#222'; g.lineWidth = 2.5; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 12, 68); g.lineTo(s * 12, 92); g.stroke(); }
      d.text('NO PITCH INFORMATION', 0, 104, 7, '#bdbdb8', 600); },
    tach(g, d) { d.base(); for (let r = 0; r <= 3500; r += 100) d.tick(tachA(r), r % 500 ? 109 : 100, 119, r % 500 ? 2 : 4);
      for (let r = 0; r <= 3500; r += 500) { const [x, y] = polar(tachA(r), 82); d.text(String(r / 100), x, y, 20); }
      d.band(tachA(2100), tachA(RPM.redline), 110, 9, '#1fa64c'); d.tick(tachA(RPM.redline), 98, 120, 5, '#e3262d');
      d.text('RPM', 0, -38, 14, '#d8d7d0'); d.text('X100', 0, -22, 10, '#d8d7d0', 600);
      g.fillStyle = '#000'; g.fillRect(-34, 40, 68, 20); g.strokeStyle = '#555'; g.lineWidth = 1.5; g.strokeRect(-34, 40, 68, 20);
      g.font = `600 15px ${'"SF Mono", Menlo, "Courier New", monospace'}`; g.fillStyle = '#eee'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1834.6', 0, 51); d.text('HOURS', 0, 72, 8, '#bdbdb8', 600); },
    cdi(g, d) { d.base(); g.save(); g.rotate(-hdgOffset * RAD);
      for (let a = 0; a < 360; a += 5) d.tick(a * RAD, a % 10 ? 111 : 104, 120, a % 10 ? 2 : 3);
      for (let a = 0; a < 360; a += 30) { g.save(); g.rotate(a * RAD); d.text({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a] ?? String(a / 10), 0, -92, 16); g.restore(); }
      g.restore();
      g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(0, -101); g.lineTo(-8, -117); g.lineTo(8, -117); g.closePath(); g.fill();
      g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(0, 0, 84, 0, TAU); g.fill();
      for (let i = 1; i <= 5; i++) for (const s of [-1, 1]) { g.fillStyle = INK; g.beginPath(); g.arc(s * i * 15, 0, 3.4, 0, TAU); g.fill(); g.beginPath(); g.arc(0, s * i * 15, 3.4, 0, TAU); g.fill(); }
      g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.stroke(); d.text('LOC', -52, -62, 10, '#bdbdb8', 600); d.text('GS', 62, -52, 10, '#bdbdb8', 600); },
    hi(g, d) { d.base(); for (let a = 0; a < 360; a += 45) { g.save(); g.rotate(a * RAD); g.fillStyle = a ? '#d8d7d0' : '#ff9d1c'; g.beginPath(); g.moveTo(0, -112); g.lineTo(-6, -124); g.lineTo(6, -124); g.closePath(); g.fill(); g.restore(); } },
    ai(g, d) { d.base(); },
  };
  const faceCanvases = {};
  if (sheets) for (const key of Object.keys(FACES)) { const c = makeCanvas(256, 256), g = c.getContext('2d'); g.translate(128, 128); FACES[key](g, ctxOf(g)); faceCanvases[key] = c; }
  const miniFace = (g, d, title, unitText, bands, lo, hi) => {
    d.base(); for (const [t0, t1, color] of bands) d.band(miniA(t0), miniA(t1), 104, 16, color);
    for (let i = 0; i <= 8; i++) d.tick(miniA(i / 8), i % 2 ? 106 : 96, 120, i % 2 ? 4 : 7);
    d.text(title, 0, 46, 30); d.text(unitText, 0, 80, 24, '#cfcfca', 600);
    if (lo) { const [x, y] = polar(miniA(0), 72); d.text(lo, x + 4, y - 6, 30); } if (hi) { const [x, y] = polar(miniA(1), 72); d.text(hi, x - 4, y - 6, 30); }
  };
  const OILT = [75, 250], OILP = [0, 115], FUELMAX = 24;
  const MINI = {
    fuelL: (g, d) => miniFace(g, d, 'FUEL L', 'GAL', [[0, 0.06, '#e3262d']], 'E', 'F'),
    fuelR: (g, d) => miniFace(g, d, 'FUEL R', 'GAL', [[0, 0.06, '#e3262d']], 'E', 'F'),
    oilT: (g, d) => miniFace(g, d, 'OIL', '°F', [[(100 - OILT[0]) / (OILT[1] - OILT[0]), (245 - OILT[0]) / (OILT[1] - OILT[0]), '#1fa64c'], [0.985, 1, '#e3262d']]),
    oilP: (g, d) => miniFace(g, d, 'OIL', 'PSI', [[0, 0.17, '#e3262d'], [0.17, 0.43, '#f2c21b'], [0.43, 0.78, '#1fa64c'], [0.78, 0.98, '#f2c21b'], [0.98, 1, '#e3262d']]),
  };
  if (sheets) for (const key of Object.keys(MINI)) { const c = makeCanvas(256, 256), g = c.getContext('2d'); g.translate(128, 128); MINI[key](g, ctxOf(g)); faceCanvases[key] = c; }

  // Live painters: value -> drawing. Each returns nothing; `paint(key, value)` handles clipping and the glass glare.
  function paint(key, draw) {
    const c = CELLS[key], s = sheets[c.sheet], g = s.g; s.dirty = true;
    g.save(); g.beginPath(); g.rect(c.x, c.y, c.w, c.h); g.clip(); g.clearRect(c.x, c.y, c.w, c.h);
    if (c.w === c.h) {
      g.translate(c.x + c.w / 2, c.y + c.h / 2); g.scale(c.w / 256, c.h / 256);
      if (faceCanvases[key]) g.drawImage(faceCanvases[key], -128, -128);
      const d = ctxOf(g); draw(g, d); d.glare();
    } else { g.translate(c.x, c.y); draw(g); }
    g.restore();
  }
  const PAINT = {
    asi: (kt) => paint('asi', (g, d) => { d.needle(asiA(kt), 106, 9); d.hub(); }),
    alt: (ft) => paint('alt', (g, d) => {
      g.save(); g.rotate(ft / 100000 * TAU); g.strokeStyle = '#f2f2ee'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -104); g.stroke();
      g.fillStyle = '#f2f2ee'; g.beginPath(); g.moveTo(0, -106); g.lineTo(-7, -120); g.lineTo(7, -120); g.closePath(); g.fill(); g.restore();
      d.needle(ft / 10000 * TAU, 64, 15, 14); d.needle(ft / 1000 * TAU, 108, 8, 24); d.hub(); }),
    vsi: (fpm) => paint('vsi', (g, d) => { d.needle(vsiA(fpm), 106, 9); d.hub(); }),
    tach: (rpm) => paint('tach', (g, d) => { d.needle(tachA(rpm), 104, 9); d.hub(); }),
    ai: ({ pitch, roll }) => paint('ai', (g, d) => {
      const ppd = 2.5;
      g.save(); g.beginPath(); g.arc(0, 0, 121, 0, TAU); g.clip(); g.rotate(-roll * RAD);
      g.save(); g.translate(0, clamp(pitch, -30, 30) * ppd);
      const sky = g.createLinearGradient(0, -300, 0, 0); sky.addColorStop(0, '#0f4a94'); sky.addColorStop(1, '#4a8fd6'); g.fillStyle = sky; g.fillRect(-300, -400, 600, 400);
      const gnd = g.createLinearGradient(0, 0, 0, 300); gnd.addColorStop(0, '#8a5a2c'); gnd.addColorStop(1, '#4d3017'); g.fillStyle = gnd; g.fillRect(-300, 0, 600, 400);
      g.strokeStyle = '#f6f6f2'; g.lineWidth = 3; g.beginPath(); g.moveTo(-300, 0); g.lineTo(300, 0); g.stroke();
      for (const p of [-20, -15, -10, -5, 5, 10, 15, 20]) { const y = -p * ppd, h = p % 10 ? 13 : 30; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-h, y); g.lineTo(h, y); g.stroke(); if (!(p % 10)) { d.text(String(Math.abs(p)), -h - 13, y, 12); d.text(String(Math.abs(p)), h + 13, y, 12); } }
      g.restore();
      g.fillStyle = '#f6f6f2'; g.beginPath(); g.moveTo(0, -97); g.lineTo(-8, -84); g.lineTo(8, -84); g.closePath(); g.fill();
      g.restore();
      for (const a of [-60, -30, -20, -10, 10, 20, 30, 60]) d.tick(a * RAD, Math.abs(a) % 30 ? 106 : 100, 120, Math.abs(a) % 30 ? 2.5 : 4.5);
      for (const a of [-45, 45]) { g.save(); g.rotate(a * RAD); g.fillStyle = INK; g.beginPath(); g.moveTo(0, -108); g.lineTo(-5, -119); g.lineTo(5, -119); g.closePath(); g.fill(); g.restore(); }
      g.fillStyle = '#ff9d1c'; g.beginPath(); g.moveTo(0, -101); g.lineTo(-9, -119); g.lineTo(9, -119); g.closePath(); g.fill();
      g.strokeStyle = '#1a1206'; g.lineWidth = 9; g.lineCap = 'round';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 76, 0); g.lineTo(s * 28, 0); g.lineTo(s * 18, 10); g.stroke(); }
      g.strokeStyle = '#ffa21c'; g.lineWidth = 6; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 76, 0); g.lineTo(s * 28, 0); g.lineTo(s * 18, 10); g.stroke(); }
      g.fillStyle = '#ffa21c'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill(); g.lineCap = 'butt'; }),
    hi: ({ hdg, bug }) => paint('hi', (g, d) => {
      g.save(); g.rotate(-hdg * RAD);
      for (let a = 0; a < 360; a += 5) d.tick(a * RAD, a % 10 ? 106 : 98, 116, a % 10 ? 2 : 3.5);
      for (let a = 0; a < 360; a += 30) { g.save(); g.rotate(a * RAD); d.text({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a] ?? String(a / 10), 0, -82, a % 90 ? 19 : 23); g.restore(); }
      if (bug !== null) { g.save(); g.rotate(bug * RAD); g.fillStyle = '#ff9d1c'; g.fillRect(-9, -118, 6, 13); g.fillRect(3, -118, 6, 13); g.restore(); }
      g.restore();
      g.fillStyle = '#ff9d1c'; g.beginPath(); g.moveTo(0, -98); g.lineTo(-7, -112); g.lineTo(7, -112); g.closePath(); g.fill();
      g.strokeStyle = '#f2f2ee'; g.lineCap = 'round'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -38); g.lineTo(0, 36); g.stroke(); g.beginPath(); g.moveTo(-36, -2); g.lineTo(36, -2); g.stroke();
      g.lineWidth = 4.5; g.beginPath(); g.moveTo(-14, 30); g.lineTo(14, 30); g.stroke(); g.lineCap = 'butt'; }),
    tc: ({ tilt, ball }) => paint('tc', (g, d) => {
      const a = Math.PI / 2 - clamp(ball, -1, 1) * 0.2, bx = Math.cos(a) * 126, by = -46 + Math.sin(a) * 126;
      const bg = g.createRadialGradient(bx - 3, by - 3, 1, bx, by, 9); bg.addColorStop(0, '#5a5a5a'); bg.addColorStop(1, '#050505'); g.fillStyle = bg; g.beginPath(); g.arc(bx, by, 8.5, 0, TAU); g.fill();
      g.save(); g.rotate(clamp(tilt, -34, 34) * RAD); g.strokeStyle = '#f4f4f0'; g.fillStyle = '#f4f4f0'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-86, 0); g.lineTo(86, 0); g.stroke(); g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill(); g.lineWidth = 5; g.beginPath(); g.moveTo(0, -12); g.lineTo(0, -26); g.stroke(); g.restore(); g.lineCap = 'butt'; }),
    cdi: ({ loc, gs, nav, gsOk }) => paint('cdi', (g, d) => {
      g.save(); g.beginPath(); g.arc(0, 0, 84, 0, TAU); g.clip();
      const nx = nav ? -clamp(loc / 2.5, -1, 1) * 75 : 0, ny = gsOk ? clamp(gs / 0.7, -1, 1) * 75 : 0;
      g.fillStyle = '#f6f6f2'; g.fillRect(nx - 2.5, -90, 5, 180); g.fillRect(-90, ny - 2.5, 180, 5); g.restore();
      const flag = (x, y, w, h, t) => { g.fillStyle = '#d7262b'; g.fillRect(x, y, w, h); g.strokeStyle = '#7a0f12'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h); d.text(t, x + w / 2, y + h / 2 + 1, 12, '#fff'); };
      if (!nav) flag(-70, -44, 40, 18, 'NAV'); if (!gsOk) flag(38, -20, 34, 16, 'GS'); }),
    fuelL: (gal) => paint('fuelL', (g, d) => { d.needle(miniA(gal / FUELMAX), 100, 16, 18); d.hub(16); }),
    fuelR: (gal) => paint('fuelR', (g, d) => { d.needle(miniA(gal / FUELMAX), 100, 16, 18); d.hub(16); }),
    oilT: (f) => paint('oilT', (g, d) => { d.needle(miniA((f - OILT[0]) / (OILT[1] - OILT[0])), 100, 16, 18); d.hub(16); }),
    oilP: (p) => paint('oilP', (g, d) => { d.needle(miniA((p - OILP[0]) / (OILP[1] - OILP[0])), 100, 16, 18); d.hub(16); }),
    ann: (flags) => paint('ann', (g) => {
      const items = [['LOW FUEL', '#ffb21c', flags.fuel], ['OIL PRESS', '#ff3b2f', flags.oil], ['LOW VAC', '#ffb21c', flags.vac], ['VOLTS', '#ff3b2f', flags.volts], ['STALL', '#ff3b2f', flags.stall]];
      g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, 480, 48);
      items.forEach(([t, col, on], i) => { const x = i * 96; g.fillStyle = on ? col : '#18191b'; g.globalAlpha = on ? 0.32 : 1; g.fillRect(x + 3, 3, 90, 42); g.globalAlpha = 1;
        g.font = `700 16px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = on ? '#fff3dc' : '#3c3d40'; if (on) { g.shadowColor = col; g.shadowBlur = 10; } g.fillText(t, x + 48, 25); g.shadowBlur = 0; }); }),
    ap: (ap) => paint('ap', (g) => {
      g.fillStyle = '#0c120b'; g.fillRect(0, 0, 256, 48); g.font = `700 20px "SF Mono", Menlo, "Courier New", monospace`; g.textBaseline = 'middle';
      if (ap.on) { g.fillStyle = '#c9f06a'; g.shadowColor = '#9ad13c'; g.shadowBlur = 6; g.textAlign = 'left'; g.fillText('AP', 10, 25); g.fillText('HDG', 58, 25); g.fillText('ALT', 118, 25); g.textAlign = 'right'; g.fillText(ap.alt, 248, 25); g.shadowBlur = 0; }
      else { g.fillStyle = '#1a2416'; g.textAlign = 'center'; g.fillText('88 888 888 88888', 128, 25); } }),
    clock: (sec) => paint('clock', (g) => {
      g.fillStyle = '#6f7b63'; g.fillRect(0, 0, 192, 48); g.fillStyle = '#121a10'; g.font = `700 24px "SF Mono", Menlo, "Courier New", monospace`; g.textAlign = 'right'; g.textBaseline = 'middle';
      const m = Math.floor(sec / 60) % 100, s = Math.floor(sec % 60); g.fillText(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`, 184, 26);
      g.font = `700 13px ${FONT}`; g.textAlign = 'left'; g.fillText('ET', 8, 16); g.fillText('UT', 8, 34); }),
  };

  B.build(cabin, M, { castShadow: false, receiveShadow: false });

  // ---- Update -----------------------------------------------------------------------------------------------------------------
  const last = {}; let acc = 1, elapsed = 0, flapExtension = 0, prevHdg = null, prevRoll = null, turnRate = 0, rollRate = 0, vsLag = null, rpmLag = null, oilT = null, oilP = null;
  const card = { a: null, v: 0 };
  const wrap = (a) => ((a + 540) % 360) - 180;
  const changed = (key, value) => { const s = JSON.stringify(value); if (last[key] === s) return false; last[key] = s; return true; };
  const q = (v, step) => Math.round(v / step) * step;
  function update(state = {}, data = {}) {
    const dt = clamp(data.dt ?? state.dt ?? 1 / 60, 0, 0.1); elapsed += dt;
    const input = (k) => clamp(state[k] ?? data[k] ?? 0, -1, 1);
    const roll = input('rollInput'), pitch = input('pitchInput'), yaw = input('yawInput');
    for (const y of yokes) { y.slide.position.z = pitch * 0.065; y.wheel.rotation.z = -roll * 1.25; }
    pedals.R.position.z = -yaw * 0.045; pedals.L.position.z = yaw * 0.045;
    const throttleSet = clamp(state.throttle ?? data.throttle ?? 0, 0, 1);
    throttle.position.z = 0.012 + (1 - throttleSet) * 0.07;
    const selected = clamp(state.flaps ?? data.flaps ?? 0, 0, 3); flapLever.position.y = -selected * 0.03;
    const actual = data.flapPosition ?? state.flapPosition;
    flapExtension = typeof actual === 'number' ? clamp(actual, 0, 3) : flapExtension + clamp(selected - flapExtension, -dt * 0.8, dt * 0.8);
    flapPointer.position.y = -flapExtension * 0.03;
    for (const f of flaps) f.pivot.rotation.x = flapExtension * DEG10;
    for (const a of ailerons) a.pivot.rotation.x = -roll * a.side * 0.3;
    const trim = clamp(data.trim ?? state.trim ?? 0, -1, 1); trimWheel.rotation.x = -trim * 9; trimPointer.position.y = -0.09 + clamp(trim, -0.5, 0.6) * 0.07;
    const engine = clamp(data.engine ?? state.engine ?? data.throttle ?? state.throttle ?? 0, 0, 1);
    if (disc) { disc.visible = engine > 0.3 && (data.engineRpm ?? 1) > 0; disc.rotation.z -= dt * (3 + engine * 70) * 0.13; }
    const lights = data.lights ?? true; navR.visible = navG.visible = lights;
    strobe.visible = lights && (elapsed % 1.1 < 0.065 || (elapsed % 1.1 > 0.15 && elapsed % 1.1 < 0.21));
    // Flight-data derived values (smoothed like the real instruments).
    const hdg = (data.heading ?? 0) + hdgOffset, rollDeg = data.roll ?? 0;
    if (prevHdg !== null && dt > 0) { turnRate += (wrap(hdg - prevHdg) / dt - turnRate) * (1 - Math.exp(-dt / 0.45)); rollRate += (((rollDeg - prevRoll) / dt) - rollRate) * (1 - Math.exp(-dt / 0.3)); }
    prevHdg = hdg; prevRoll = rollDeg;
    if (card.a === null) card.a = hdg;
    { const err = wrap(hdg - card.a); card.v += (err * 9 - card.v * 3.2) * dt; card.a += card.v * dt; compassCard.rotation.y = card.a * RAD; }
    const vs = (data.verticalSpeed ?? 0) * 196.85; vsLag = vsLag === null ? vs : vsLag + (vs - vsLag) * (1 - Math.exp(-dt / 0.9));
    const rpmNow = data.engineRpm ?? (engine > 0 ? RPM.idle + engine * (RPM.max - RPM.idle) : 0); rpmLag = rpmLag === null ? rpmNow : rpmLag + (rpmNow - rpmLag) * (1 - Math.exp(-dt / 0.35));
    const oilTarget = rpmNow > 0 ? 150 + 45 * rpmNow / RPM.max : 80, pTarget = rpmNow > 0 ? 25 + 55 * clamp((rpmNow - 500) / (RPM.max - 500), 0, 1) : 0;
    oilT = oilT === null ? oilTarget : oilT + (oilTarget - oilT) * (1 - Math.exp(-dt / 40)); oilP = oilP === null ? pTarget : oilP + (pTarget - oilP) * (1 - Math.exp(-dt / 0.8));
    acc += dt; if (!sheets || acc < 1 / 15) return; acc = 0;
    // Gauges: redraw only what changed, at most 15 times a second.
    const kt = (data.indicatedAirspeed ?? 0) * KT, ft = ((data.altitude ?? 0) + altOffset) * FT;
    const gal = (data.fuel ?? 0) / 2 / 2.72, ap = state.autopilot ?? data.autopilot;
    const values = {
      asi: q(kt, 0.25), alt: q(ft, 1), vsi: q(vsLag, 5), tach: q(rpmLag, 5),
      ai: { pitch: q(data.pitch ?? 0, 0.1), roll: q(rollDeg, 0.1) },
      hi: { hdg: q(hdg, 0.1), bug: ap && typeof ap.heading === 'number' ? q(ap.heading + hdgOffset, 1) : null },
      tc: { tilt: q(clamp((turnRate + rollRate * 0.08) / 3, -1.7, 1.7) * 20, 0.2), ball: q(clamp((data.sideslip ?? 0) / 8, -1, 1), 0.01) },
      cdi: { loc: q(data.localizerDeviation ?? data.localizer ?? 0, 0.01), gs: q(data.glideslopeDeviation ?? data.glideslope ?? 0, 0.005), nav: !!data.ilsValid, gsOk: !!(data.gsValid ?? data.ilsValid) },
      fuelL: q(gal, 0.1), fuelR: q(gal, 0.1), oilT: q(oilT, 0.5), oilP: q(oilP, 0.5),
      ann: { fuel: gal < 5, oil: rpmNow <= 0 || oilP < 20, vac: rpmNow < 500, volts: rpmNow < 500, stall: !!data.stallWarning },
      ap: { on: !!ap?.enabled, alt: ap && typeof ap.altitude === 'number' ? String(Math.round((ap.altitude + altOffset) * FT / 100) * 100) : '' },
      clock: Math.floor(elapsed),
    };
    for (const key of Object.keys(values)) if (changed(key, values[key])) PAINT[key](values[key]);
    for (const s of Object.values(sheets)) if (s.dirty) { s.t.needsUpdate = true; s.dirty = false; }
  }
  update({}, {});
  group.group = group;
  group.update = update;
  group.dispose = () => disposeTree(group);
  return group;
}
