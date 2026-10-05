// MQ-172 雲雀 (Lark): fictional high-wing, single-engine light trainer in the 天青航空 (SKYGLAZE) livery. Metres.
// The aircraft's nose points along local -Z, +X is the right wing, +Y is up. Origin = physics reference point;
// wheel bottoms sit at y = -1.2. Same {group, update, dispose} contract as aircraft.js.
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sgn = (v) => (v < 0 ? -1 : 1);
const DEG10 = Math.PI / 18; // one flap notch

export function createLightAircraft(THREE) {
  const group = new THREE.Group();
  group.name = 'MQ-172 light single';
  const std = (color, roughness = 0.5, metalness = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const materials = {
    white: std(0xf1eee6, 0.43),
    panel: std(0xe4e2da, 0.45),
    navy: std(0x3a689c, 0.48, 0.12),   // deep blue accent (wingtips, tailplane tips)
    celadon: std(0x86b4f0, 0.42, 0.08),   // fin / rudder blue (name kept; sky-blue glaze)
    sky: std(0xbcdcff, 0.43, 0.08),
    pant: std(0x6ba0e4, 0.42, 0.08),
    teal: std(0x4e7f78, 0.42),
    edge: std(0x758a97, 0.36, 0.65),
    metal: std(0xa6b7bf, 0.3, 0.8),
    rubber: std(0x111820, 0.93, 0),
    dark: std(0x101c29, 0.65, 0.18),
    glass: std(0x153b52, 0.16, 0.58, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    blade: std(0x1d2329, 0.55, 0.2, { side: THREE.DoubleSide }),
    tip: std(0xf2c230, 0.5, 0.1, { side: THREE.DoubleSide }),
  };
  materials.wing = std(0xf1eee6, 0.43, 0.1, { side: THREE.DoubleSide });
  materials.flap = std(0xe4e2da, 0.45, 0.1, { side: THREE.DoubleSide });
    const patchMat = (color, depth) => std(color, 0.45, 0.1, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -depth, polygonOffsetUnits: -depth });
  materials.doorEdge = patchMat(0x6f8492, 1);
  materials.doorFill = patchMat(0xbcdcff, 2);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  function mesh(geometry, material, parent = group, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (material, parent, x, y, z, sx, sy, sz) => mesh(boxGeometry, material, parent, x, y, z, sx, sy, sz);
  function rod(parent, material, a, b, radius = 0.05, chordScale = 1) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const object = mesh(cylinderGeometry, material, parent);
    object.position.copy(start.add(end).multiplyScalar(0.5));
    object.scale.set(radius, delta.length(), radius * chordScale);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  }
  function geometry(positions, indices, uvs) {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }
  // Flat slab: polygon in x/z extruded along y.
  function prism(points, thickness) {
    const positions = [], indices = [];
    for (const offset of [-thickness / 2, thickness / 2]) for (const [x, y, z] of points) positions.push(x, y + offset, z);
    const n = points.length;
    for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
    for (let i = 0; i < n; i++) { const next = (i + 1) % n; indices.push(i, n + i, next, next, n + i, n + next); }
    return geometry(positions, indices);
  }
  // Flat slab: polygon in y/z extruded along x.
  function sidePrism(points, thickness) {
    const positions = [], indices = [];
    for (const offset of [-thickness / 2, thickness / 2]) for (const [y, z] of points) positions.push(offset, y, z);
    const n = points.length;
    for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
    for (let i = 0; i < n; i++) { const next = (i + 1) % n; indices.push(i, n + i, next, next, n + i, n + next); }
    return geometry(positions, indices);
  }
  function decal(text, color, width = 1024, height = 256) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.font = `700 ${height * 0.58}px Arial, sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2);
    return canvasMaterial(canvas);
  }
  // 「天青航空」 wordmark: serif CJK name with spaced SKYGLAZE caps beneath.
  function wordmark(width = 1024, height = 300) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#1e3550'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `700 ${height * 0.5}px "Noto Serif TC", "Songti TC", "PMingLiU", "Noto Serif CJK TC", serif`;
    g.fillText('天青航空', width / 2, height * 0.56);
    g.font = `500 ${height * 0.15}px "Helvetica Neue", "Avenir Next", Arial, sans-serif`;
    if ('letterSpacing' in g) g.letterSpacing = `${height * 0.05}px`;
    g.fillText('SKYGLAZE', width / 2 + (height * 0.025), height * 0.86);
    return canvasMaterial(canvas);
  }
  function canvasMaterial(canvas) {
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  }

  // ---- Fuselage: super-elliptic loft (boxier cabin than a plain ellipse), nose -Z --------------------------------
  const N = 2.4;
  const sections = [ // [z, rx, ry, cy]
    [-3.0, 0.4, 0.4, -0.12], [-2.4, 0.46, 0.46, -0.1], [-1.7, 0.52, 0.55, 0.0],
    [-1.1, 0.62, 0.78, 0.16], [0.3, 0.62, 0.78, 0.16], [1.3, 0.5, 0.62, 0.2],
    [2.8, 0.28, 0.4, 0.3], [4.2, 0.12, 0.18, 0.42], [4.8, 0.04, 0.06, 0.45],
  ];
  function sectionAt(z) {
    let i = 0;
    while (i < sections.length - 2 && z > sections[i + 1][0]) i++;
    const a = sections[i], b = sections[i + 1];
    const t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    return { rx: a[1] + (b[1] - a[1]) * t, ry: a[2] + (b[2] - a[2]) * t, cy: a[3] + (b[3] - a[3]) * t };
  }
  const surfX = (y, z) => { const s = sectionAt(z); const v = Math.min(1, Math.abs((y - s.cy) / s.ry)); return s.rx * Math.pow(1 - Math.pow(v, N), 1 / N); };
  const topY = (x, z) => { const s = sectionAt(z); const u = Math.min(1, Math.abs(x / s.rx)); return s.cy + s.ry * Math.pow(1 - Math.pow(u, N), 1 / N); };
  function fuselageLoft(segments = 40) {
    const positions = [], uvs = [], indices = [];
    for (let row = 0; row < sections.length; row++) {
      const [z, rx, ry, cy] = sections[row];
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * TAU, s = Math.sin(angle), c = Math.cos(angle);
        positions.push(sgn(s) * Math.pow(Math.abs(s), 2 / N) * rx, cy + sgn(c) * Math.pow(Math.abs(c), 2 / N) * ry, z);
        uvs.push((z + 3) / 7.8, i / segments);
        if (row < sections.length - 1 && i < segments) {
          const a = row * (segments + 1) + i, b = a + segments + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const first = sections[0], center = positions.length / 3;
    positions.push(0, first[3], first[0]); uvs.push(0, 0.5);
    for (let i = 0; i < segments; i++) indices.push(center, i, i + 1);
    return geometry(positions, indices, uvs);
  }
  const bodyMaterial = materials.white.clone(); bodyMaterial.color.set(0xffffff);
  if (typeof document !== 'undefined') {
    const W = 1024, H = 512, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    // v runs crown (0) -> right side (.25) -> belly (.5) -> left side (.75): one soft vertical pale-sky-blue gradient.
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#b6d8ff'); sky.addColorStop(0.25, '#9ccaff'); sky.addColorStop(0.5, '#82b4f6');
    sky.addColorStop(0.75, '#9ccaff'); sky.addColorStop(1, '#b6d8ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = '#6ba0e4'; g.fillRect(0, 0, 0.19 * W, H); // blue cowling
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    bodyMaterial.map = texture;
  }
  mesh(fuselageLoft(), bodyMaterial);

  // Conforming patch on the fuselage side (windows, doors, decal).
  function sidePatch(material, side, y0, y1, z0, z1, off, cols = 6, rows = 3, flipU = false) {
    const positions = [], uvs = [], indices = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const u = c / cols, v = r / rows, y = y0 + (y1 - y0) * v, z = z0 + (z1 - z0) * u;
      positions.push(side * (surfX(y, z) + off), y, z);
      uvs.push(flipU ? 1 - u : u, v);
      if (r < rows && c < cols) { const a = r * (cols + 1) + c, b = a + cols + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    return mesh(geometry(positions, indices, uvs), material);
  }
  // Windscreen over the sloping upper cowl/roof.
  function topPatch(material, z0, z1, frac, off, cols = 8, rows = 3) {
    const positions = [], indices = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const z = z0 + (z1 - z0) * r / rows, x = (c / cols * 2 - 1) * frac * sectionAt(z).rx;
      positions.push(x, topY(x, z) + off, z);
      if (r < rows && c < cols) { const a = r * (cols + 1) + c, b = a + cols + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    return mesh(geometry(positions, indices), material);
  }
  topPatch(materials.glass, -1.62, -1.06, 0.84, 0.012);
  const registration = decal('MQ-172', '#1e3550', 640, 128), mark = wordmark();
  for (const side of [-1, 1]) {
    sidePatch(materials.doorEdge, side, -0.26, 0.82, -1.04, 0.28, 0.006, 8, 4);   // door outline
    sidePatch(materials.doorFill, side, -0.22, 0.79, -1.0, 0.24, 0.009, 8, 4);
    sidePatch(materials.glass, side, 0.28, 0.76, -0.97, 0.18, 0.012, 6, 2);       // door window
    sidePatch(materials.glass, side, 0.34, 0.72, 0.42, 1.28, 0.012, 6, 2);        // rear quarter window
    sidePatch(materials.glass, side, 0.4, 0.66, 1.4, 1.9, 0.012, 4, 2);
    box(materials.dark, group, side * (surfX(0.3, -0.2) + 0.02), 0.28, -0.2, 0.02, 0.04, 0.12); // handle
    if (mark) sidePatch(mark, side, -0.19, 0.2, -0.98, 0.22, 0.014, 8, 2, side > 0);   // forward fuselage wordmark
    if (registration) sidePatch(registration, side, 0.24, 0.36, 2.35, 3.15, 0.014, 8, 1, side > 0);
  }
  // Cowling details.
  for (const side of [-1, 1]) box(materials.dark, group, side * 0.2, -0.16, -3.0, 0.2, 0.15, 0.03);
  box(materials.dark, group, 0, -0.5, -2.45, 0.06, 0.08, 0.5); // exhaust stack
  // Roof block carrying the wing root.
  box(materials.sky, group, 0, 0.86, -0.3, 0.84, 0.12, 1.5);

  // ---- Wing: constant-chord inboard, tapering outboard ------------------------------------------------------------
  const wingRows = [[0.15, 0.97, -1.02, 1.6], [2.8, 0.99, -1.02, 1.6], [5.5, 1.04, -0.9, 1.12]]; // [x, y, leadingZ, chord]
  const THICK = 0.12;
  function wingAt(x) {
    let s = 0;
    while (s < wingRows.length - 2 && x > wingRows[s + 1][0]) s++;
    const a = wingRows[s], b = wingRows[s + 1], k = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    return { y: a[1] + (b[1] - a[1]) * k, lead: a[2] + (b[2] - a[2]) * k, chord: a[3] + (b[3] - a[3]) * k };
  }
  const half = (t) => 5 * THICK * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
  // Closed ring of points around the aerofoil between chord fractions t0..t1 at span station x (right wing, +x).
  function ring(x, t0, t1, steps, thickScale = 1, lift = 0) {
    const w = wingAt(x), pts = [];
    const at = (t, up) => [x, w.y + lift + 0.014 * w.chord * Math.sin(t * Math.PI) + (up ? 1 : -1) * thickScale * half(t) * w.chord, w.lead + t * w.chord];
    for (let i = 0; i <= steps; i++) pts.push(at(t0 + (t1 - t0) * Math.pow(i / steps, t0 === 0 ? 1.7 : 1), true));
    for (let i = steps - 1; i >= 0; i--) pts.push(at(t0 + (t1 - t0) * Math.pow(i / steps, t0 === 0 ? 1.7 : 1), false));
    return pts;
  }
  function ringLoft(rings, side, pivot = [0, 0, 0]) {
    const positions = [], indices = [], n = rings[0].length;
    for (const r of rings) for (const [x, y, z] of r) positions.push(side * x - pivot[0], y - pivot[1], z - pivot[2]);
    for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < n; i++) {
      const a = row * n + i, b = row * n + (i + 1) % n;
      indices.push(a, a + n, b, b, a + n, b + n);
    }
    for (const row of [0, rings.length - 1]) { // end caps
      const center = positions.length / 3, r = rings[row];
      let cx = 0, cy = 0, cz = 0; for (const p of r) { cx += p[0]; cy += p[1]; cz += p[2]; }
      positions.push(side * cx / n - pivot[0], cy / n - pivot[1], cz / n - pivot[2]);
      for (let i = 0; i < n; i++) indices.push(center, row * n + i, row * n + (i + 1) % n);
    }
    return geometry(positions, indices);
  }
  const flaps = [], ailerons = [];
  function movable(side, x1, x2, hinge, collection, material) {
    const rings = [ring(x1, hinge, 1, 5, 1.12), ring(x2, hinge, 1, 5, 1.12)];
    const hw = wingAt((x1 + x2) / 2);
    const pivot = new THREE.Group();
    const hingeY = hw.y + 0.014 * hw.chord * Math.sin(hinge * Math.PI), hingeZ = hw.lead + hinge * hw.chord;
    pivot.position.set(side * (x1 + x2) / 2, hingeY, hingeZ);
    group.add(pivot);
    mesh(ringLoft(rings, side, [side * (x1 + x2) / 2, hingeY, hingeZ]), material, pivot);
    collection.push({ pivot, side });
  }
  for (const side of [-1, 1]) {
    mesh(ringLoft([ring(0.15, 0, 1, 10), ring(2.8, 0, 1, 10), ring(5.5, 0, 1, 10)], side), materials.wing);
    movable(side, 0.95, 2.85, 0.7, flaps, materials.flap);
    movable(side, 3.05, 5.35, 0.72, ailerons, materials.flap);
    const tip = wingAt(5.5);
    mesh(sphereGeometry, materials.navy, group, side * 5.5, tip.y, tip.lead + tip.chord * 0.5, 0.045, 0.1, tip.chord * 0.56);
    // Strut: lower fuselage to the wing at x = 2.6; short jury strut stiffens it.
    const wing26 = wingAt(2.6);
    const top = [side * 2.6, wing26.y - 0.1, wing26.lead + 0.5];
    rod(group, materials.white, [side * 0.5, -0.4, -0.15], top, 0.04, 3);
    rod(group, materials.white, [side * 1.55, 0.52, -0.37], [side * 1.55 + side * 0.35, 0.86, -0.52], 0.022, 2);
    box(materials.white, group, side * 0.5, -0.4, -0.15, 0.1, 0.1, 0.24); // strut root fitting
  }

  // ---- Empennage --------------------------------------------------------------------------------------------------
  mesh(sidePrism([[0.55, 2.55], [1.5, 3.95], [1.5, 4.3], [0.4, 4.3]], 0.07), materials.celadon);
  const rudder = new THREE.Group(); rudder.position.set(0, 0, 4.3); group.add(rudder);
  mesh(sidePrism([[0.4, 0], [1.5, 0], [1.46, 0.5], [0.4, 0.55]], 0.06), materials.celadon, rudder);
  // Fin livery: sky-blue glaze gradient with a porcelain crackle network (開片).
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
  function finTexture() {
    if (typeof document === 'undefined') return null;
    const W = 1024, H = 512, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const glaze = g.createLinearGradient(0, 0, W, H); glaze.addColorStop(0, '#a6caf8'); glaze.addColorStop(1, '#6ba0e4');
    g.fillStyle = glaze; g.fillRect(0, 0, W, H);
    crackleCells(g, W, H, 7, 18, '#24497a', 0.55, 4.2);
    crackleCells(g, W, H, 8, 60, '#4f7db0', 0.45, 2.1);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const finMaterial = finTexture();
  function finFace(points, zShift, side, x, parent) { // texture mapped from fin coordinates: u = (z-2.5)/2.4, v = (y-0.35)/1.2
    const pos = [], uv = [], idx = [];
    points.forEach(([y, z], i) => { pos.push(side * x, y, z); uv.push((z + zShift - 2.5) / 2.4, (y - 0.35) / 1.2); if (i > 1) idx.push(0, i - 1, i); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, finMaterial); parent.add(m); return m;
  }
  if (finMaterial) for (const side of [-1, 1]) {
    finFace([[0.55, 2.55], [1.5, 3.95], [1.5, 4.3], [0.4, 4.3]], 0, side, 0.037, group).material = finMaterial;
    finFace([[0.4, 0], [1.5, 0], [1.46, 0.5], [0.4, 0.55]], 4.3, side, 0.032, rudder);
  }
  mesh(prism([[-1.7, 0, 3.95], [-0.45, 0, 3.4], [0.45, 0, 3.4], [1.7, 0, 3.95], [1.7, 0, 4.12], [-1.7, 0, 4.12]], 0.06), materials.white, group, 0, 0.42, 0);
  const elevator = new THREE.Group(); elevator.position.set(0, 0.42, 4.12); group.add(elevator);
  mesh(prism([[-1.7, 0, 0], [1.7, 0, 0], [1.55, 0, 0.52], [-1.55, 0, 0.52]], 0.055), materials.panel, elevator);
  for (const side of [-1, 1]) mesh(boxGeometry, materials.navy, group, side * 1.7, 0.42, 4.04, 0.06, 0.05, 0.5);

  // ---- Propeller (two blades + spinner), translucent disc at high power -------------------------------------------
  const prop = new THREE.Group(); prop.position.set(0, -0.12, -3.02); group.add(prop);
  const spinner = mesh(new THREE.ConeGeometry(0.2, 0.4, 20), materials.metal, prop, 0, 0, -0.2);
  spinner.rotation.x = -Math.PI / 2; spinner.castShadow = false;
  const blades = new THREE.Group(); prop.add(blades);
  for (const dir of [-1, 1]) {
    const blade = mesh(boxGeometry, materials.blade, blades, 0, dir * 0.57, -0.02, 0.12, 0.85, 0.022);
    blade.rotation.y = 0.32 * dir;
    const tip = mesh(boxGeometry, materials.tip, blades, 0, dir * 0.915, -0.02, 0.11, 0.1, 0.024);
    tip.rotation.y = 0.32 * dir; blade.castShadow = tip.castShadow = false;
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.965, 28), new THREE.MeshBasicMaterial({ color: 0xcfd8dc, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  disc.position.z = -0.02; disc.visible = false; prop.add(disc);

  // ---- Fixed tricycle gear with wheel fairings --------------------------------------------------------------------
  const wheels = [];
  const tireGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.13, 18);
  const hubGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.14, 12);
  function wheel(x, y, z, scale = 1) {
    const tire = mesh(tireGeometry, materials.rubber, group, x, y, z, scale); tire.rotation.z = Math.PI / 2; wheels.push({ tire, radius: 0.3 * scale });
    const hub = mesh(hubGeometry, materials.metal, group, x, y, z, scale); hub.rotation.z = Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    rod(group, materials.metal, [side * 0.42, -0.5, 0.18], [side * 1.16, -0.9, 0.18], 0.06, 1.8); // spring-steel leg
    wheel(side * 1.26, -0.9, 0.18);
    mesh(sphereGeometry, materials.pant, group, side * 1.26 + side * 0.03, -0.82, 0.16, 0.1, 0.27, 0.62); // wheel pant
    box(materials.navy, group, side * 1.26, -0.82, 0.16, 0.11, 0.05, 0.58);
  }
  rod(group, materials.metal, [0, -0.5, -1.55], [0, -0.92, -1.58], 0.05); // nose leg
  rod(group, materials.edge, [0, -0.62, -1.9], [0, -0.85, -1.6], 0.03);
  wheel(0, -0.92, -1.58, 0.93);
  mesh(sphereGeometry, materials.pant, group, 0, -0.85, -1.58, 0.1, 0.22, 0.4); // nose wheel pant

  // ---- Lights ------------------------------------------------------------------------------------------------------
  const lightMaterial = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, roughness: 0.2 });
  const navLights = [], strobes = [], beacons = [];
  const tip = wingAt(5.5), tipZ = tip.lead + tip.chord * 0.45;
  navLights.push(mesh(sphereGeometry, lightMaterial(0xff263e), group, -5.55, tip.y, tipZ, 0.05));
  navLights.push(mesh(sphereGeometry, lightMaterial(0x2bffad), group, 5.55, tip.y, tipZ, 0.05));
  for (const side of [-1, 1]) strobes.push(mesh(sphereGeometry, lightMaterial(0xf1f8ff), group, side * 5.5, tip.y + 0.04, tip.lead + tip.chord * 0.98, 0.04));
  navLights.push(mesh(sphereGeometry, lightMaterial(0xe6f2ff), group, 0, 0.9, 4.88, 0.045));
  beacons.push(mesh(sphereGeometry, lightMaterial(0xff263e), group, 0, 1.53, 4.0, 0.05));
  rod(group, materials.dark, [0, 1.0, -0.6], [0, 1.2, -0.5], 0.012); // antenna

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
    prop.rotation.z = propAngle;
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

function disposeTree(group) {
  const geometries = new Set(), usedMaterials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) usedMaterials.add(material);
  });
  for (const material of usedMaterials) if (material.map) textures.add(material.map);
  for (const texture of textures) texture.dispose();
  for (const material of usedMaterials) material.dispose();
  for (const g of geometries) g.dispose();
}

// Cockpit surround for the MQ-172. Added to the camera (coordinates are camera space: eye at the origin, looking -Z).
// The camera should sit at (-0.30, 0.55, -0.5) in aircraft space, so the aircraft centreline is at camera x = +0.30.
// Returns a Group that also carries .group, .update(state, data) and .dispose(), so it works as a plain Group
// (like createCockpit in aircraft.js) or with the {group, update, dispose} contract.
export function createLightCockpit(THREE) {
  const group = new THREE.Group(); group.name = 'MQ-172 cockpit';
  const shell = new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.87 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x0f171d, roughness: 0.78 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x59656e, roughness: 0.6 });
  const liner = new THREE.MeshStandardMaterial({ color: 0x3a4a54, roughness: 0.9 });
  const wingUnder = new THREE.MeshStandardMaterial({ color: 0xd9e1e5, roughness: 0.6, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa6b7bf, roughness: 0.35, metalness: 0.7 });
  const geo = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  function box(material, x, y, z, sx, sy, sz, parent = group) {
    const o = new THREE.Mesh(geo, material); o.position.set(x, y, z); o.scale.set(sx, sy, sz); parent.add(o); return o;
  }
  function bar(a, b, width = 0.04, material = shell) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const o = box(material, 0, 0, 0, width, delta.length(), width * 1.5);
    o.position.copy(start.add(end).multiplyScalar(0.5));
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return o;
  }
  const L = -0.32, R = 0.92, C = 0.3; // cabin wall x positions and centreline in camera space

  // Instrument panel (six-pack on the pilot side, radios and engine gauges to the right).
  let panelMaterial = new THREE.MeshBasicMaterial({ color: 0x1a2127 });
  if (typeof document !== 'undefined') {
    const W = 1040, H = 264, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#1b2227'; g.fillRect(0, 0, W, H);
    const dial = (cx, cy, r, draw) => {
      g.save(); g.beginPath(); g.arc(cx, cy, r + 5, 0, TAU); g.fillStyle = '#0a0d10'; g.fill();
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = '#12161a'; g.fill(); g.clip(); draw(cx, cy, r); g.restore();
      g.beginPath(); g.arc(cx, cy, r + 5, 0, TAU); g.strokeStyle = '#59656e'; g.lineWidth = 3; g.stroke();
    };
    const ticks = (cx, cy, r, n, a0, a1, len, w = 2) => {
      g.strokeStyle = '#e8eef0'; g.lineWidth = w;
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len)); g.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3)); g.stroke(); }
    };
    const needle = (cx, cy, a, len, w = 3, color = '#f4f7f8') => { g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke(); };
    const px = (x) => (x - (-0.33)) / 1.3 * W; // camera-space x -> canvas px
    const colX = [px(-0.14), px(0.1), px(0.34)], rowY = [70, 190], R0 = 52;
    dial(colX[0], rowY[0], R0, (cx, cy, r) => { // airspeed
      ticks(cx, cy, r, 12, Math.PI * 0.75, Math.PI * 2.25, 12); g.strokeStyle = '#2faa5b'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r - 7, Math.PI * 1.0, Math.PI * 1.65); g.stroke(); needle(cx, cy, Math.PI * 1.3, r - 8);
    });
    dial(colX[1], rowY[0], R0, (cx, cy, r) => { // attitude
      g.fillStyle = '#3f86c4'; g.fillRect(cx - r, cy - r, 2 * r, r); g.fillStyle = '#8a5a34'; g.fillRect(cx - r, cy, 2 * r, r);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
      g.strokeStyle = '#f2c230'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 30, cy + 2); g.lineTo(cx - 8, cy + 2); g.lineTo(cx, cy + 10); g.lineTo(cx + 8, cy + 2); g.lineTo(cx + 30, cy + 2); g.stroke();
    });
    dial(colX[2], rowY[0], R0, (cx, cy, r) => { // altimeter
      ticks(cx, cy, r, 10, -Math.PI / 2, Math.PI * 1.5, 11); needle(cx, cy, -0.9, r - 8); needle(cx, cy, 1.2, r - 24, 5);
    });
    dial(colX[0], rowY[1], R0, (cx, cy, r) => { // turn coordinator
      ticks(cx, cy, r, 2, Math.PI * 1.15, Math.PI * 1.85, 10, 3); g.fillStyle = '#e8eef0'; g.fillRect(cx - 32, cy - 3, 64, 6); g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
      g.fillStyle = '#222'; g.fillRect(cx - 24, cy + 28, 48, 14); g.fillStyle = '#e8eef0'; g.beginPath(); g.arc(cx, cy + 35, 5, 0, TAU); g.fill();
    });
    dial(colX[1], rowY[1], R0, (cx, cy, r) => { // heading indicator
      ticks(cx, cy, r, 36, 0, TAU, 8); g.fillStyle = '#e8eef0'; g.font = '700 16px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('N', cx, cy - 34); g.fillText('E', cx + 34, cy); g.fillText('S', cx, cy + 34); g.fillText('W', cx - 34, cy);
      g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 9, cy + 12); g.lineTo(cx - 9, cy + 12); g.closePath(); g.fill();
    });
    dial(colX[2], rowY[1], R0, (cx, cy, r) => { // vertical speed
      ticks(cx, cy, r, 10, Math.PI * 0.6, Math.PI * 2.4, 10); needle(cx, cy, Math.PI, r - 8);
    });
    // Radios and engine gauges on the right.
    for (let i = 0; i < 3; i++) {
      const x = px(0.58), y = 22 + i * 76; g.fillStyle = '#0a0d10'; g.fillRect(x, y, 200, 62);
      g.fillStyle = '#e6a33c'; g.font = '700 30px monospace'; g.textAlign = 'left'; g.fillText(['118.30', '121.50', '1200'][i], x + 12, y + 40);
      g.strokeStyle = '#59656e'; g.lineWidth = 2; g.strokeRect(x, y, 200, 62);
    }
    dial(px(0.9), 70, 44, (cx, cy, r) => { ticks(cx, cy, r, 8, Math.PI * 0.75, Math.PI * 2.25, 10); needle(cx, cy, Math.PI * 1.7, r - 8); });
    dial(px(0.9), 190, 44, (cx, cy, r) => { ticks(cx, cy, r, 6, Math.PI * 0.75, Math.PI * 2.25, 10); needle(cx, cy, Math.PI * 1.45, r - 8); });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    panelMaterial = new THREE.MeshBasicMaterial({ map: texture });
  }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.33), panelMaterial);
  face.position.set(C - 0.0, -0.335, -0.65); face.rotation.x = -0.2; group.add(face);
  box(edge, C, -0.7, -0.92, 1.3, 0.8, 0.4);                                 // dash body below the face
  box(edge, C, -0.8, -0.56, 1.3, 0.4, 0.12).rotation.x = 0.25;            // lower dash
  box(shell, C, -0.14, -0.83, 1.3, 0.04, 0.46);                              // low glare-shield pad
  box(trim, C, -0.14, -0.605, 1.3, 0.045, 0.012);                            // teal edge
  // Compass on the glare-shield.
  const compass = new THREE.Group(); compass.position.set(C - 0.02, -0.1, -0.88); group.add(compass);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xdfe8ea, roughness: 0.3 }));
  compass.add(dome); const base = new THREE.Mesh(cyl, edge); base.scale.set(0.045, 0.03, 0.045); base.position.y = -0.03; compass.add(base);
  box(edge, 0, 0, -0.036, 0.012, 0.012, 0.002, compass);

  // Windscreen frame, door posts, roof rail with the wing root above.
  bar([L + 0.1, -0.15, -1.05], [L - 0.0, 0.34, -0.58], 0.035);
  bar([R - 0.12, -0.15, -1.05], [R - 0.01, 0.34, -0.58], 0.035);
  bar([L - 0.02, 0.37, -0.57], [R + 0.02, 0.37, -0.57], 0.06);               // header
  box(liner, C, 0.4, 0.25, 1.3, 0.05, 1.6);                                   // roof lining
  box(shell, L - 0.02, 0.3, 0.45, 0.07, 0.17, 1.3); box(shell, R + 0.02, 0.3, 0.45, 0.07, 0.17, 1.3); // roof rails
  bar([L, -0.22, -0.55], [L - 0.02, 0.27, -0.5], 0.06); bar([R, -0.22, -0.55], [R + 0.02, 0.27, -0.5], 0.06);
  bar([L, 0.27, 0.9], [L, -0.22, 1.0], 0.06); bar([R, 0.27, 0.9], [R, -0.22, 1.0], 0.06); // rear door posts
  box(shell, L - 0.02, -0.6, 0.3, 0.07, 0.75, 1.6); box(shell, R + 0.02, -0.6, 0.3, 0.07, 0.75, 1.6); // door panels
  box(edge, L - 0.04, -0.23, 0.3, 0.12, 0.05, 1.6); box(edge, R + 0.04, -0.23, 0.3, 0.12, 0.05, 1.6); // sills / armrests
  box(edge, C, -0.93, 0.3, 1.25, 0.05, 1.8);                                   // floor
  box(shell, C, -0.65, 0.3, 0.2, 0.55, 0.4);                                   // centre console
  // Wing underside and strut seen through the side windows.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? L - 0.05 : R + 0.05, x1 = side < 0 ? -2.4 : 3.0;
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), 1.6), wingUnder);
    wing.rotation.x = Math.PI / 2; wing.position.set((x0 + x1) / 2, 0.33, 0.28); group.add(wing);
    bar([side < 0 ? L - 0.06 : R + 0.06, -0.9, 0.35], [side < 0 ? -2.3 : 2.9, 0.33, -0.04], 0.05, wingUnder);
  }
  // Seat backs (visible only when looking round).
  box(shell, 0, -0.5, 0.35, 0.5, 0.7, 0.12); box(shell, 0.6, -0.5, 0.35, 0.5, 0.7, 0.12);

  // Two yokes: pitch pulls the column toward the pilot, roll turns the wheel.
  const yokes = [];
  for (const x of [0, 0.6]) {
    const yoke = new THREE.Group(); yoke.position.set(x, -0.4, -0.4); group.add(yoke);
    const column = new THREE.Mesh(cyl, metal); column.rotation.x = Math.PI / 2; column.scale.set(0.022, 0.5, 0.022); column.position.z = -0.25; yoke.add(column);
    const wheel = new THREE.Group(); yoke.add(wheel);
    const hub = new THREE.Mesh(cyl, edge); hub.rotation.x = Math.PI / 2; hub.scale.set(0.025, 0.04, 0.025); wheel.add(hub);
    box(edge, 0, 0, 0, 0.3, 0.014, 0.014, wheel);
    for (const s of [-1, 1]) { box(edge, s * 0.15, 0.06, 0, 0.018, 0.12, 0.018, wheel); box(edge, s * 0.15, 0.125, 0, 0.034, 0.02, 0.026, wheel); }
    yokes.push({ yoke, wheel, x });
  }
  function update(state = {}, data = {}) {
    const roll = clamp(state.rollInput ?? data.rollInput ?? 0, -1, 1), pitch = clamp(state.pitchInput ?? data.pitchInput ?? 0, -1, 1);
    for (const y of yokes) { y.yoke.position.z = -0.4 + pitch * 0.07; y.wheel.rotation.z = -roll * 0.9; }
  }
  group.group = group; group.update = update; group.dispose = () => disposeTree(group);
  return group;
}
