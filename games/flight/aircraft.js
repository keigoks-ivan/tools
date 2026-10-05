// All dimensions are metres. The aircraft's nose points along local -Z.
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createAircraft(THREE) {
  const group = new THREE.Group();
  group.name = 'MQ-320 civil twinjet';
  const materials = {
    white: new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.43, metalness: 0.1 }),
    navy: new THREE.MeshStandardMaterial({ color: 0x86b4f0, roughness: 0.45, metalness: 0.1 }), // 天青 sky-blue glaze (fin, winglets)
    teal: new THREE.MeshStandardMaterial({ color: 0x3a689c, roughness: 0.42, metalness: 0.1 }), // deep blue accent
    sky: new THREE.MeshStandardMaterial({ color: 0xbcdcff, roughness: 0.43, metalness: 0.1 }), // pale blue door panels
    ink: new THREE.MeshStandardMaterial({ color: 0x1e3550, roughness: 0.42, metalness: 0.12 }), // ink-navy nacelles
    wing: new THREE.MeshStandardMaterial({ color: 0xc3cbd0, roughness: 0.48, metalness: 0.32 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x758a97, roughness: 0.36, metalness: 0.65 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xa6b7bf, roughness: 0.3, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.93 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101c29, roughness: 0.65, metalness: 0.18 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x153b52, roughness: 0.16, metalness: 0.58 }),
  };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
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
  function rod(parent, material, a, b, radius = 0.06) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const object = mesh(cylinderGeometry, material, parent);
    object.position.copy(start.add(end).multiplyScalar(0.5));
    object.scale.set(radius, delta.length(), radius);
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
  function loft(sections, segments = 48, capped = true) {
    const positions = [], uvs = [], indices = [];
    for (let row = 0; row < sections.length; row++) {
      const [z, rx, ry = rx, cy = 0] = sections[row];
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * TAU;
        positions.push(Math.sin(angle) * rx, cy + Math.cos(angle) * ry, z);
        uvs.push((z + 18.6) / 37.2, i / segments);
        if (row < sections.length - 1 && i < segments) {
          const a = row * (segments + 1) + i, b = a + segments + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    if (capped) {
      for (const row of [0, sections.length - 1]) {
        const section = sections[row], center = positions.length / 3;
        positions.push(0, section[3] || 0, section[0]); uvs.push(0.5, 0.5);
        for (let i = 0; i < segments; i++) {
          const a = row * (segments + 1) + i;
          if (row === 0) indices.push(center, a, a + 1);
          else indices.push(center, a + 1, a);
        }
      }
    }
    return geometry(positions, indices, uvs);
  }
  function prism(points, thickness) {
    const positions = [], indices = [];
    for (const offset of [-thickness / 2, thickness / 2]) {
      for (const [x, y, z] of points) positions.push(x, y + offset, z);
    }
    const n = points.length;
    for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, n, n + i + 1, n + i);
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      indices.push(i, n + i, next, next, n + i, n + next);
    }
    return geometry(positions, indices);
  }
  function decal(text, color, width = 1024, height = 256) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.font = `700 ${height * 0.53}px Arial, sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }

  const fuselageSections = [
    [-18.6, 0.03, 0.03, -0.06], [-18.1, 0.43, 0.4, -0.03], [-17.2, 0.87, 0.82, 0.01],
    [-16.1, 1.31, 1.26, 0.17], [-14.5, 1.78, 1.69, 0.31], [-12.2, 1.96, 1.91, 0.39],
    [-8, 1.97, 1.93, 0.4], [0, 1.97, 1.93, 0.4], [7.5, 1.96, 1.91, 0.42],
    [10.8, 1.87, 1.82, 0.46], [13, 1.52, 1.45, 0.6], [15.2, 1.01, 0.96, 0.81],
    [17.2, 0.47, 0.45, 1.0], [18.6, 0.03, 0.03, 1.11],
  ];
  function fuselageSurface(y, z) {
    let i = 0;
    while (i < fuselageSections.length - 2 && z > fuselageSections[i + 1][0]) i++;
    const a = fuselageSections[i], b = fuselageSections[i + 1];
    const t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    const rx = a[1] + (b[1] - a[1]) * t, ry = a[2] + (b[2] - a[2]) * t, cy = a[3] + (b[3] - a[3]) * t;
    return rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  }
  function curvedDecal(material, side, y, z, width, height) {
    const positions = [], uvs = [], indices = [], columns = 20, rows = 8;
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        const u = col / columns, v = row / rows, py = y + (v - 0.5) * height, pz = z + side * (0.5 - u) * width;
        positions.push(side * (fuselageSurface(py, pz) + 0.012), py, pz); uvs.push(u, v);
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col, b = a + columns + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    return mesh(geometry(positions, indices, uvs), material);
  }
  const bodyMaterial = materials.white.clone(); bodyMaterial.color.set(0xffffff);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
    const context = canvas.getContext('2d');
    // The radial UV wraps from the crown, around the right side, belly and left side (belly at canvas mid-height):
    // one soft vertical gradient, pale sky blue on top to a deeper blue underneath.
    const sky = context.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#b6d8ff'); sky.addColorStop(0.25, '#9ccaff'); sky.addColorStop(0.5, '#82b4f6');
    sky.addColorStop(0.75, '#9ccaff'); sky.addColorStop(1, '#b6d8ff');
    context.fillStyle = sky; context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    bodyMaterial.map = texture;
  }
  mesh(loft(fuselageSections, 64), bodyMaterial);
  mesh(new THREE.SphereGeometry(1, 24, 12), materials.wing, group, 0, -1.28, 0.8, 2.13, 0.4, 5.4);

  // The dark windshield panels sit on the sloping upper nose.
  const windshields = [
    [[0.05, 1.55, -16.05], [0.05, 2.04, -14.97], [0.88, 1.88, -14.98], [0.94, 1.48, -16.02]],
    [[1.02, 1.45, -15.92], [0.96, 1.85, -14.89], [1.45, 1.48, -14.16], [1.44, 1.1, -15.26]],
    [[1.48, 1.1, -15.14], [1.48, 1.46, -14.06], [1.67, 1.29, -13.55], [1.67, 0.95, -14.27]],
  ];
  for (const side of [-1, 1]) {
    for (const panel of windshields) {
      const p = panel.map(([x, y, z]) => [x * side, y, z]);
      const g = geometry(p.flat(), side === 1 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      const window = mesh(g, materials.glass); window.material.side = THREE.DoubleSide;
    }
  }
  const windowGeometry = new THREE.CircleGeometry(1, 12);
  const windowVertices = windowGeometry.getAttribute('position');
  for (let i = 0; i < windowVertices.count; i++) {
    const y = windowVertices.getY(i) * 0.205, z = windowVertices.getX(i) * 0.145;
    windowVertices.setXYZ(i, fuselageSurface(0.79 + y, 0) + 0.014 - 1.97, y, z);
  }
  windowGeometry.computeVertexNormals();
  const windows = new THREE.InstancedMesh(windowGeometry, materials.glass, 68);
  const transform = new THREE.Object3D(); let windowIndex = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 34; i++) {
      const z = -11.45 + i * 0.61;
      transform.position.set(side * 1.97, 0.79, z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(side, 1, 1);
      transform.updateMatrix(); windows.setMatrixAt(windowIndex++, transform.matrix);
    }
  }
  windows.instanceMatrix.needsUpdate = true; group.add(windows);
  function wordmark(width = 1536, height = 160) { // 「天青航空」 serif name followed by spaced SKYGLAZE caps
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d'); g.fillStyle = '#1e3550'; g.textBaseline = 'alphabetic';
    const cjk = `700 ${height * 0.7}px "Noto Serif TC", "Songti TC", "PMingLiU", "Noto Serif CJK TC", serif`;
    const latin = `500 ${height * 0.3}px "Helvetica Neue", "Avenir Next", Arial, sans-serif`;
    g.font = cjk; const w1 = g.measureText('天青航空').width;
    g.font = latin; if ('letterSpacing' in g) g.letterSpacing = `${height * 0.09}px`; const w2 = g.measureText('SKYGLAZE').width;
    const gap = height * 0.35, x0 = (width - w1 - gap - w2) / 2;
    g.textAlign = 'left'; g.font = cjk; if ('letterSpacing' in g) g.letterSpacing = '0px'; g.fillText('天青航空', x0, height * 0.75);
    g.font = latin; if ('letterSpacing' in g) g.letterSpacing = `${height * 0.09}px`; g.fillText('SKYGLAZE', x0 + w1 + gap, height * 0.74);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }
  const titleMaterial = wordmark();
  const registrationMaterial = decal('MQ-320', '#1e3550', 768, 256);
  for (const side of [-1, 1]) {
    if (titleMaterial) curvedDecal(titleMaterial, side, 1.21, -4.6, 10.8, 1.1);
    if (registrationMaterial) curvedDecal(registrationMaterial, side, 0.02, 8.25, 2.2, 0.6);
    for (const z of [-11.95, 10.1]) {
      const door = box(materials.edge, group, side * 1.952, 0.44, z, 0.018, 1.61, 0.77);
      door.rotation.z = side * -0.065;
      box(materials.sky, group, side * 1.965, 0.44, z, 0.02, 1.52, 0.68).rotation.z = side * -0.065;
      box(materials.dark, group, side * 1.988, 0.55, z + 0.22, 0.024, 0.035, 0.1);
    }
    for (const z of [-1.35, 0.45]) {
      box(materials.edge, group, side * 1.951, 0.66, z, 0.018, 1.13, 0.47);
      box(materials.sky, group, side * 1.962, 0.66, z, 0.02, 1.04, 0.39);
    }
  }

  function airfoil(sections, side, thickness = 0.105) {
    const positions = [], indices = [], count = 24;
    for (let row = 0; row < sections.length; row++) {
      const [x, y, leading, chord] = sections[row];
      for (let i = 0; i < count; i++) {
        const upper = i < count / 2;
        const t = upper ? i / (count / 2 - 1) : 1 - (i - count / 2) / (count / 2 - 1);
        const h = 5 * thickness * chord * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
        positions.push(side * x, y + 0.014 * chord * Math.sin(t * Math.PI) + (upper ? h : -h), leading + t * chord);
        if (row < sections.length - 1) {
          const a = row * count + i, next = row * count + (i + 1) % count;
          if (side === 1) indices.push(a, next, a + count, next, next + count, a + count);
          else indices.push(a, a + count, next, next, a + count, next + count);
        }
      }
    }
    return geometry(positions, indices);
  }
  const wingSections = [[1.3, -0.32, -3.65, 7.7], [6, -0.12, -0.7, 5.8], [12, 0.4, 2.9, 3.65], [17.65, 0.93, 5.75, 1.75]];
  const flaps = [], ailerons = [], spoilers = [];
  function wingPoint(x, chordFraction = 1) {
    let section = 0;
    while (section < wingSections.length - 2 && x > wingSections[section + 1][0]) section++;
    const a = wingSections[section], b = wingSections[section + 1];
    const blend = clamp((x - a[0]) / (b[0] - a[0]), 0, 1);
    const y = a[1] + (b[1] - a[1]) * blend;
    const leading = a[2] + (b[2] - a[2]) * blend;
    const chord = a[3] + (b[3] - a[3]) * blend;
    return [x, y, leading + chord * chordFraction];
  }
  function wingPanel(side, x1, x2, front, back, collection, material = materials.wing) {
    const a = wingPoint(x1, front), b = wingPoint(x2, front);
    const c = wingPoint(x2, back), d = wingPoint(x1, back);
    const pivot = new THREE.Group();
    pivot.position.set(side * (x1 + x2) / 2, (a[1] + b[1]) / 2 + 0.1, (a[2] + b[2]) / 2);
    group.add(pivot);
    const points = [a, b, c, d].map(([x, y, z]) => [side * x - pivot.position.x, y + 0.1 - pivot.position.y, z - pivot.position.z]);
    mesh(prism(points, 0.085), material, pivot);
    collection.push({ pivot, side }); return pivot;
  }
  for (const side of [-1, 1]) {
    mesh(airfoil(wingSections, side), materials.wing);
    wingPanel(side, 2.3, 7.1, 0.77, 1.015, flaps);
    wingPanel(side, 7.25, 12.75, 0.78, 1.015, flaps);
    wingPanel(side, 13.0, 16.7, 0.74, 1.01, ailerons);
    wingPanel(side, 4.25, 8.3, 0.5, 0.69, spoilers, materials.edge);
    wingPanel(side, 8.45, 12.05, 0.5, 0.69, spoilers, materials.edge);
    mesh(airfoil([[1.05, 1.55, 11.2, 4.55], [3.35, 1.7, 13.05, 3.4], [6.25, 1.99, 15.17, 1.65]], side, 0.085), materials.wing);
    const winglet = [
      [side * 17.56, 0.98, 5.77], [side * 18.02, 2.54, 6.57],
      [side * 18.09, 2.57, 7.18], [side * 17.72, 1.01, 7.49],
    ];
    // A thin, slightly outward-canted fin at each wingtip.
    const wingletGeometry = geometry(winglet.flat(), [0, 1, 2, 0, 2, 3]);
    const wingletMaterial = materials.navy.clone(); wingletMaterial.side = THREE.DoubleSide;
    mesh(wingletGeometry, wingletMaterial);
    rod(group, materials.teal, winglet[1], winglet[2], 0.035);
  }

  // The swept vertical stabilizer is a closed wedge with a separate rudder seam.
  const tailPoints = [[1.43, 10.14], [7.57, 14.9], [7.55, 16.32], [1.38, 17.8]];
  const tailPositions = [], tailIndices = [];
  for (const side of [-1, 1]) for (const [y, z] of tailPoints) tailPositions.push(side * (y > 6 ? 0.12 : 0.34), y, z);
  tailIndices.push(0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7);
  for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; tailIndices.push(i, n, i + 4, n, n + 4, i + 4); }
  mesh(geometry(tailPositions, tailIndices), materials.navy);
  // Fin: blue glaze gradient with a porcelain crackle network (開片), drawn as an overlay.
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
  let tailMark = null;
  if (typeof document !== 'undefined') {
    const W = 1024, H = 816, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const glaze = g.createLinearGradient(0, 0, W, H); glaze.addColorStop(0, '#a6caf8'); glaze.addColorStop(1, '#6ba0e4');
    g.fillStyle = glaze; g.fillRect(0, 0, W, H);
    crackleCells(g, W, H, 11, 24, '#24497a', 0.55, 5.2);
    crackleCells(g, W, H, 12, 70, '#4f7db0', 0.45, 2.4);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    tailMark = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  for (const side of [-1, 1]) {
    if (tailMark) {
      const fx = (y) => 0.34 - 0.22 * (y - 1.4) / 6.15 + 0.012, fp = [], fu = [], fi = [];
      tailPoints.forEach(([y, z], i) => { fp.push(side * fx(y), y, z); fu.push((z - 10.1) / 7.8, (y - 1.4) / 6.2); if (i > 1) fi.push(0, i - 1, i); });
      mesh(geometry(fp, fi, fu), tailMark);
    }
    const stripe = geometry([side * 0.16, 6.38, 14.25, side * 0.155, 6.38, 16.46, side * 0.19, 5.92, 16.58, side * 0.2, 5.92, 13.89], [0, 1, 2, 0, 2, 3]);
    const stripeMaterial = materials.teal.clone(); stripeMaterial.side = THREE.DoubleSide;
    mesh(stripe, stripeMaterial);
    rod(group, materials.edge, [side * 0.142, 7.43, 15.92], [side * 0.324, 1.58, 17.25], 0.014);
  }

  const engineFans = [];
  for (const side of [-1, 1]) {
    const engine = new THREE.Group(); engine.position.set(side * 5.65, -1.61, 0); group.add(engine);
    const sections = [[-4.24, 0.98], [-4.08, 1.085], [-3.55, 1.12], [-1.9, 1.03], [-0.68, 0.83], [0.1, 0.66]];
    mesh(loft(sections, 36, false), materials.ink, engine);
    mesh(new THREE.TorusGeometry(0.971, 0.074, 8, 36), materials.metal, engine, 0, 0, -4.245);
    const throat = mesh(new THREE.CylinderGeometry(0.912, 0.86, 0.64, 32, 1, true), materials.dark, engine, 0, 0, -3.945);
    throat.rotation.x = Math.PI / 2; throat.material.side = THREE.DoubleSide;
    const fan = new THREE.Group(); fan.position.z = -3.73; engine.add(fan); engineFans.push(fan);
    const disc = mesh(new THREE.CylinderGeometry(0.867, 0.867, 0.04, 32), materials.dark, fan); disc.rotation.x = Math.PI / 2;
    const fanPositions = [], fanIndices = [];
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * TAU, start = fanPositions.length / 3;
      for (const [radius, sweep] of [[0.27, 0], [0.84, 0.15], [0.86, 0.31], [0.29, 0.2]]) {
        fanPositions.push(Math.cos(angle + sweep) * radius, Math.sin(angle + sweep) * radius, -0.04);
      }
      fanIndices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    const fanMaterial = materials.metal.clone(); fanMaterial.side = THREE.DoubleSide;
    mesh(geometry(fanPositions, fanIndices), fanMaterial, fan);
    const spinner = mesh(new THREE.ConeGeometry(0.27, 0.46, 24), materials.edge, fan, 0, 0, -0.17);
    spinner.rotation.x = -Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.655, 0.035, 8, 28), materials.edge, engine, 0, 0, 0.1);
    const exhaust = mesh(new THREE.CylinderGeometry(0.47, 0.43, 0.71, 24, 1, true), materials.dark, engine, 0, 0, 0.27);
    exhaust.rotation.x = Math.PI / 2;
    box(materials.wing, group, side * 5.65, -0.57, -1.0, 0.39, 1.32, 2.95).rotation.x = -0.1;
  }

  const gears = [], wheels = [];
  const tireGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.36, 20);
  const hubGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.373, 16);
  function wheel(parent, x, y, z, scale = 1) {
    const tire = mesh(tireGeometry, materials.rubber, parent, x, y, z, scale); tire.rotation.z = Math.PI / 2; wheels.push(tire);
    const hub = mesh(hubGeometry, materials.metal, parent, x, y, z, scale); hub.rotation.z = Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    const gear = new THREE.Group(); gear.position.set(side * 3.22, -1.03, 2.75); group.add(gear);
    rod(gear, materials.metal, [0, 0, 0], [0, -2.42, 0], 0.12);
    rod(gear, materials.edge, [0, -0.12, -0.75], [0, -1.78, 0.04], 0.07);
    rod(gear, materials.metal, [-0.46, -2.42, 0], [0.46, -2.42, 0], 0.11);
    wheel(gear, -0.3, -2.42, 0); wheel(gear, 0.3, -2.42, 0);
    box(materials.white, gear, side * -0.17, -0.7, 0.05, 0.065, 1.32, 0.58);
    gears.push({ group: gear, side, nose: false });
  }
  const noseGear = new THREE.Group(); noseGear.position.set(0, -0.78, -13.56); group.add(noseGear);
  rod(noseGear, materials.metal, [0, 0, 0], [0, -2.84, 0], 0.09);
  rod(noseGear, materials.edge, [0, -0.15, 0.8], [0, -1.8, 0], 0.06);
  wheel(noseGear, -0.195, -2.84, 0, 0.69); wheel(noseGear, 0.195, -2.84, 0, 0.69);
  box(materials.white, noseGear, 0, -0.38, 0.13, 0.62, 0.82, 0.07);
  gears.push({ group: noseGear, side: 0, nose: true });

  const lightMaterial = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5, roughness: 0.2 });
  const navLights = [], strobes = [], beacons = [];
  for (const side of [-1, 1]) {
    navLights.push(mesh(sphereGeometry, lightMaterial(side < 0 ? 0xff263e : 0x2bffad), group, side * 17.77, 1.05, 7.17, 0.09));
    strobes.push(mesh(sphereGeometry, lightMaterial(0xf1f8ff), group, side * 17.83, 1.08, 7.39, 0.07));
    navLights.push(mesh(sphereGeometry, lightMaterial(0xfff0d2), group, side * 2.82, -0.13, -2.7, 0.08));
  }
  for (const y of [-1.63, 2.35]) beacons.push(mesh(sphereGeometry, lightMaterial(0xff263e), group, 0, y, 2.0, 0.09));
  navLights.push(mesh(sphereGeometry, lightMaterial(0xe6f2ff), group, 0, 1.08, 18.55, 0.07));
  rod(group, materials.dark, [0, 2.18, -7.0], [0, 2.65, -6.6], 0.027);
  rod(group, materials.dark, [0, 2.13, 8.0], [0, 2.51, 8.35], 0.023);

  let gearExtension = 1, flapExtension = 0, elapsed = 0;
  function update(state = {}, data = {}) {
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
      if (gear.nose) gear.group.rotation.x = -(1 - gearExtension) * 1.45;
      else gear.group.rotation.z = gear.side * -(1 - gearExtension) * 1.43;
    }
    const speed = data.groundSpeed ?? state.speed ?? 0;
    for (const tire of wheels) tire.rotation.x -= speed * dt / 0.55;
    for (const flap of flaps) flap.pivot.rotation.x = flapExtension * 0.155;
    const spoilerValue = data.spoilers ?? state.spoilers ?? false;
    for (const spoiler of spoilers) spoiler.pivot.rotation.x = -(typeof spoilerValue === 'number' ? clamp(spoilerValue, 0, 1) : Number(spoilerValue)) * 0.95;
    const roll = clamp(state.rollInput ?? data.rollInput ?? 0, -1, 1);
    for (const aileron of ailerons) aileron.pivot.rotation.x = roll * aileron.side * 0.24;
    for (const fan of engineFans) fan.rotation.z += dt * (2 + (data.engine ?? state.engine ?? data.throttle ?? state.throttle ?? 0) * 55);
    const lights = data.lights ?? true;
    for (const light of navLights) light.visible = lights;
    for (const light of beacons) light.visible = lights && elapsed % 1.3 < 0.14;
    for (const light of strobes) light.visible = lights && (elapsed % 1.1 < 0.065 || (elapsed % 1.1 > 0.15 && elapsed % 1.1 < 0.21));
  }
  function dispose() {
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
  return { group, update, dispose };
}

// Add this lightweight surround to the camera and hide the exterior model in pilot view.
export function createCockpit(THREE) {
  const group = new THREE.Group(); group.name = 'Pilot windshield surround';
  const shell = new THREE.MeshStandardMaterial({ color: 0x263844, roughness: 0.87 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x101b23, roughness: 0.78 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  function box(material, x, y, z, sx, sy, sz) {
    const object = new THREE.Mesh(geometry, material); object.position.set(x, y, z); object.scale.set(sx, sy, sz); group.add(object); return object;
  }
  function bar(a, b, width = 0.036) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const object = box(shell, 0, 0, 0, width, delta.length(), width * 1.6);
    object.position.copy(start.add(end).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return object;
  }
  box(edge, 0.23, -0.67, -0.76, 2.4, 0.3, 1.13).rotation.x = -0.13;
  box(shell, 0.23, -0.77, -0.48, 2.4, 0.18, 0.64);
  bar([-0.76, -0.52, -0.88], [-0.63, 0.91, -1.06], 0.047);
  bar([0.52, -0.55, -1.27], [0.35, 0.94, -1.42], 0.025);
  bar([1.17, -0.59, -0.88], [0.94, 0.91, -1.06], 0.049);
  bar([-0.64, 0.87, -1.05], [0.95, 0.87, -1.05], 0.059);
  bar([-0.88, -0.59, -0.04], [-0.76, -0.52, -0.88], 0.07);
  box(shell, -0.96, -0.89, -0.25, 0.35, 0.35, 1.36);
  box(edge, -0.99, -0.7, -0.25, 0.36, 0.065, 1.38);
  return group;
}
