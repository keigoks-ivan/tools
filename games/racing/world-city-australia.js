import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js';

const TAU = Math.PI * 2;

function shellGeometry(width, length, height, mobile) {
  const rows = mobile ? 18 : 28, columns = mobile ? 18 : 28, positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const u = row / rows;
    for (let column = 0; column <= columns; column++) {
      const v = column / columns * 2 - 1;
      const taper = Math.max(.004, Math.pow(1 - u, .64));
      const x = width * .5 * v * taper;
      const y = 1.1 + height * (.3 + .7 * Math.sin(u * Math.PI * .5)) * (u + (1 - u) * Math.sqrt(Math.max(0, 1 - v * v)));
      const z = (u - .5) * length + v * v * length * .14 * (1 - u);
      positions.push(x, y, z); uvs.push(column / columns * 10, u * 18);
      if (row < rows && column < columns) {
        const k = row * (columns + 1) + column;
        indices.push(k, k + 1, k + columns + 1, k + 1, k + columns + 2, k + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function tileMap() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eceadd'; ctx.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const tint = (row * 19 + col * 13) % 3;
    ctx.fillStyle = ['#f2f0e6', '#e9e8db', '#f4f2e7'][tint]; ctx.fillRect(col * 16 + 1, row * 16 + 1, 14.5, 14.5);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; return texture;
}

function clockMap() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e9debc'; ctx.fillRect(0, 0, 256, 256);
  ctx.beginPath(); ctx.arc(128, 128, 121, 0, TAU); ctx.fillStyle = '#efe8d4'; ctx.fill();
  ctx.strokeStyle = '#2a3029'; ctx.lineWidth = 10; ctx.stroke(); ctx.fillStyle = '#343a30'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const angle = i / 12 * TAU - Math.PI / 2;
    ctx.font = '600 24px Georgia'; ctx.fillText(String(i), 128 + Math.cos(angle) * 91, 128 + Math.sin(angle) * 91);
  }
  ctx.lineCap = 'round'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.sin(.83) * 64, 128 - Math.cos(.83) * 64); ctx.stroke();
  ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 - 36, 128 - 24); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function ringGeometry(radius, height, segments, depthScale = 1) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
  geometry.scale(1, 1, depthScale); return geometry;
}

export function createCityWaterMaterial(color = '#3f7489') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), data = ctx.createImageData(128, 128);
  const height = (x, y) => {
    const u = x / 128 * TAU, v = y / 128 * TAU;
    return Math.sin(u * 5 + v * 2) * .45 + Math.sin(u * 3 - v * 7) * .3 + Math.sin(u * 11 + v * 9) * .16;
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (height(x + 1, y) - height(x - 1, y)) * .75, dy = (height(x, y + 1) - height(x, y - 1)) * .75;
    const scale = 1 / Math.hypot(dx, dy, 1), i = (y * 128 + x) * 4;
    data.data[i] = (dx * scale * .5 + .5) * 255; data.data[i + 1] = (dy * scale * .5 + .5) * 255;
    data.data[i + 2] = (scale * .5 + .5) * 255; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ color, normalMap: map, normalScale: new THREE.Vector2(.47, .47), roughness: .22, metalness: .38, envMapIntensity: .9, side: THREE.DoubleSide });
}

export function addCityWaterPlane(b, material, x, z, width, depth, height = -.5) {
  b.setFrame(x, z, 0, height);
  const geo = new THREE.PlaneGeometry(width, depth); geo.rotateX(-Math.PI / 2);
  const positions = geo.attributes.position;
  for (let i = 0; i < positions.count; i++) geo.attributes.uv.setXY(i, (positions.getX(i) + x) / 16, (positions.getZ(i) + z) / 16);
  b.bake(geo, material);
}

// Original geometry, photographed material scans shared with the active world,
// and small canvas maps keep city landmarks independent of large model files.
export function addAustralianLandmarks(options) {
  const { track, mobile = false } = options;
  const b = createCityBuilder(options), { box, cylinder, beam, bake, sphere } = b;
  const stone = b.surface(options.materials.concrete, '#b8ad98');
  const lightStone = b.surface(options.materials.concrete, '#d1c6ad');
  const steel = b.material('#536061', { roughness: .47, metalness: .74 });
  const dark = b.material('#27373a', { roughness: .64, metalness: .2 });
  const trim = b.material('#d7dcce', { roughness: .49, metalness: .28 });
  const glass = b.material('#31585e', { roughness: .19, metalness: .42, envMapIntensity: .85 });
  const timber = b.material('#805f43', { roughness: .92 });
  const water = createCityWaterMaterial(track.id === 'melbourne' ? '#53706d' : '#3f7489');
  function frontSign(...args) {
    return b.sign(...args);
  }
  if (track.id === 'sydney') {
    addCityWaterPlane(b, water, -1445, -905, 2110, 2590);
    addCityWaterPlane(b, water, 0, 1445, 5000, 2110);
  } else if (track.id === 'goldcoast') addCityWaterPlane(b, water, -1457.5, 0, 2085, 5000);
  else if (track.id === 'melbourne') addCityWaterPlane(b, water, 0, -442.5, 5000, 125);

  function palm(x, z, height = 12, yaw = 0) {
    b.setFrame(x, z, yaw);
    const lean = height * .08, top = [lean, height, 0];
    for (let i = 0; i < 6; i++) {
      const a = i / 6, next = (i + 1) / 6;
      beam([lean * a * a, height * a, 0], [lean * next * next, height * next, 0], .42 - a * .12, timber);
      cylinder(.28 - a * .05, .29 - a * .05, .12, dark, lean * a * a, height * a, 0, 7);
    }
    const green = b.material('#456e43', { roughness: .9, side: THREE.DoubleSide });
    const positions = [], uvs = [];
    for (let frond = 0; frond < (mobile ? 10 : 14); frond++) {
      const angle = frond / (mobile ? 10 : 14) * TAU + Math.sin(frond * 2.3) * .18;
      const length = 3.8 + frond % 3 * .43, rise = 1.4 + Math.sin(frond * 1.72) * .9, drop = 1.65 + Math.cos(frond * 1.17) * .75;
      const point = t => [top[0] + Math.sin(angle) * length * t, top[1] + rise * Math.sin(t * Math.PI) - drop * t * t, Math.cos(angle) * length * t];
      beam(point(0), point(1), .075, green);
      for (let leaf = 1; leaf <= 10; leaf++) for (const side of [-1, 1]) {
        const t = leaf / 12, a = point(t - .04), c = point(t + .04), mid = point(t);
        const width = .95 * Math.sin(t * Math.PI) * side;
        const tip = [mid[0] + Math.cos(angle) * width + Math.sin(angle) * .55, mid[1] - .36, mid[2] - Math.sin(angle) * width + Math.cos(angle) * .55];
        positions.push(...a, ...tip, ...c); uvs.push(0, 0, .5, 1, 1, 0);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); bake(geo, green);
  }

  function quay(x, z, length, yaw = 0) {
    b.setFrame(x, z, yaw, 4.65);
    box(4, 6.4, length, stone, 0, -3.15, 0); box(5.3, .24, length, lightStone, 0, .12, 0);
    for (let dz = -length / 2 + 3; dz < length / 2; dz += 9) {
      cylinder(.1, .1, 1.13, steel, -1.9, .64, dz, 7);
      if (dz + 9 < length / 2) for (const y of [.54, 1.05]) box(.06, .06, 9, steel, -1.9, y, dz + 4.5);
    }
  }

  function harbourFerry(x, z, yaw = 0, scale = 1) {
    b.setFrame(x, z, yaw, -.5);
    const green = b.material('#446652', { roughness: .5, metalness: .15 });
    const hull = new THREE.CapsuleGeometry(1, 1, 4, mobile ? 10 : 16); hull.rotateX(Math.PI / 2); hull.scale(4.7 * scale, 1.2 * scale, 8.5 * scale); bake(hull, dark, 0, .4, 0);
    box(8.4 * scale, 1.25 * scale, 20 * scale, green, 0, 1.5 * scale, 0);
    box(7.5 * scale, 2.7 * scale, 16.5 * scale, trim, 0, 3.48 * scale, 0);
    box(8 * scale, .2 * scale, 19.6 * scale, green, 0, 4.93 * scale, 0);
    for (const side of [-1, 1]) {
      box(.055, 1.35 * scale, 14.2 * scale, glass, side * 3.81 * scale, 3.63 * scale, 0);
      for (let n = -4; n <= 4; n++) box(.10, 1.65 * scale, .13, trim, side * 3.85 * scale, 3.66 * scale, n * 1.55 * scale);
    }
    for (const end of [-1, 1]) {
      box(5.6 * scale, .85 * scale, 3.6 * scale, green, 0, 5.5 * scale, end * 5.65 * scale);
      box(4.7 * scale, .65 * scale, .06, glass, 0, 5.62 * scale, end * 7.49 * scale);
      cylinder(.07, .10, 3.2 * scale, steel, 0, 7.3 * scale, end * 4.7 * scale, 6);
    }
    for (let n = 0; n < 7; n++) cylinder(.32, .32, .18, dark, -4.3 * scale, 1.4 * scale, (n - 3) * 2.8 * scale, 10, 0, 0, Math.PI / 2);
  }

  if (track.id === 'sydney') {
    const shell = b.material('#f5f2e7', { map: tileMap(), roughness: .37, side: THREE.DoubleSide, metalness: .025 });
    const rib = b.material('#d8d7c9', { roughness: .7 });
    b.setFrame(-485, 25, 0, 4.65); b.reserve(-485, 25, 115, 'Sydney Opera House');
    box(100, 7.6, 194, stone, 0, -2.6, 10); box(88, 6.5, 157, lightStone, 0, 4.3, 12);
    box(78, .3, 165, stone, 0, 7.8, 11);
    // Broad monumental stairs, two unequal halls and nested roof sails.
    for (let step = 0; step < 18; step++) box(78, .38, 2.8, lightStone, 0, step * .36 + .05, -95 + step * 2.35);
    for (const hall of [{ x: -21, size: 1, z: 13 }, { x: 22, size: .79, z: 27 }]) {
      for (const [index, sail] of [[0, [-35, 35, 36]], [1, [-8, 46, 47]], [2, [22, 53, 52]]]) {
        const z = sail[0] * hall.size + hall.z, width = sail[1] * hall.size, height = sail[2] * hall.size;
        bake(shellGeometry(width, 51 * hall.size, height, mobile), shell, hall.x, 7.7, z);
        for (const side of [-1, 1]) for (let line = 1; line <= (mobile ? 4 : 6); line++) {
          const v = line / ((mobile ? 4 : 6) + 1) * side;
          const point = u => [hall.x + width * .5 * v * Math.max(.004, Math.pow(1 - u, .64)),
            8.8 + height * (.3 + .7 * Math.sin(u * Math.PI * .5)) * (u + (1 - u) * Math.sqrt(1 - v * v)) + .07,
            z + (u - .5) * 51 * hall.size + v * v * 51 * hall.size * .14 * (1 - u)];
          for (let part = 0; part < 8; part++) beam(point(part / 8), point((part + 1) / 8), .095, rib);
        }
        const front = z - 25.5 * hall.size;
        const frontVertices = [], frontIndices = [];
        for (let section = 0; section <= 18; section++) {
          const v = section / 9 - 1, x = hall.x + width * .5 * v, zz = front + v * v * 51 * hall.size * .14;
          frontVertices.push(x, 8.8, zz, x, 8.8 + height * .3 * Math.sqrt(Math.max(0, 1 - v * v)), zz);
          if (section < 18) { const k = section * 2; frontIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const frontGlass = new THREE.BufferGeometry(); frontGlass.setAttribute('position', new THREE.Float32BufferAttribute(frontVertices, 3)); frontGlass.setIndex(frontIndices); bake(frontGlass, glass);
        for (let col = -3; col <= 3; col++) {
          const v = col / 4, x = hall.x + width * .5 * v, zz = front + v * v * 51 * hall.size * .14 - .04;
          beam([x, 8.8, zz], [x, 8.8 + height * .3 * Math.sqrt(1 - v * v), zz], .14, dark);
        }
        for (const side of [-1, 1]) {
          const positions = [], indices = [], count = mobile ? 12 : 18;
          const edge = u => [hall.x + side * (width * .5 * Math.max(.004, (1 - u) ** .64) + .055),
            8.8 + height * (.3 + .7 * Math.sin(u * Math.PI / 2)) * u,
            z + (u - .5) * 51 * hall.size + 51 * hall.size * .14 * (1 - u)];
          for (let n = 0; n <= count; n++) {
            const [x, y, zz] = edge(n / count); positions.push(x, 8.8, zz, x, y, zz);
            if (n < count) {
              const k = n * 2;
              indices.push(...(side > 0 ? [k, k + 1, k + 2, k + 1, k + 3, k + 2] : [k, k + 2, k + 1, k + 1, k + 2, k + 3]));
            }
            if (n > 0 && n < count && n % 2 === 0) beam([x, 8.8, zz], [x, y, zz], .12, dark);
          }
          const glazing = new THREE.BufferGeometry(); glazing.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); glazing.setIndex(indices); bake(glazing, glass);
        }
      }
      for (const rear of [{ z: 61, width: 43, length: 43, height: 37 }, { z: 78, width: 31, length: 28, height: 24 }]) {
        bake(shellGeometry(rear.width * hall.size, rear.length * hall.size, rear.height * hall.size, mobile), shell,
          hall.x, 7.7, rear.z * hall.size + hall.z, 0, Math.PI);
      }
    }
    box(14, 4.4, 20, lightStone, 0, 9.7, 83);
    frontSign('SYDNEY OPERA HOUSE', 'BENNELONG POINT', 20, 2.2, 0, 5.1, -91, '#6b6255');
    quay(-432, 27, 200); quay(-487, -74, 105, Math.PI / 2);

    // The 503 m steel arch is modelled at its actual main-span proportion.
    b.setFrame(-10, 485, 0, 4.65); b.reserve(-10, 485, 290, 'Sydney Harbour Bridge');
    box(547, 2.2, 48, dark, 0, 43.6, 0); box(551, .22, 50, stone, 0, 44.8, 0);
    for (const z of [-24.2, 24.2]) for (const y of [45.8, 47]) box(553, .15, .14, steel, 0, y, z);
    for (const x of [-266, 266]) for (const z of [-24.5, 24.5]) {
      box(26, 75, 25, stone, x, 37.5, z); box(29, 2, 28, lightStone, x, 76, z);
      box(24, 9, 23, stone, x, 81.3, z); box(27, .75, 26, lightStone, x, 86.2, z);
      for (const dx of [-7, 0, 7]) box(2.1, 5.3, .09, dark, x + dx, 81, z - 12.1);
    }
    const segments = mobile ? 24 : 32, arch = x => 38.5 + 76.5 * (1 - (x / 251.5) ** 2);
    for (let i = 0; i < segments; i++) {
      const a = -251.5 + i / segments * 503, c = -251.5 + (i + 1) / segments * 503;
      const ya = arch(a), yc = arch(c), upperA = ya + 13, upperC = yc + 13;
      for (const z of [-23.5, 23.5]) {
        beam([a, ya, z], [c, yc, z], 1.6, steel); beam([a, upperA, z], [c, upperC, z], 1.75, steel);
        beam([a, ya, z], [a, upperA, z], .66, steel); beam([a, ya, z], [c, upperC, z], .8, steel);
        if (ya > 45.4) beam([a, 45.4, z], [a, ya, z], .65, steel);
      }
      beam([a, upperA, -23.5], [c, upperC, 23.5], .52, steel); beam([a, upperA, 23.5], [c, upperC, -23.5], .52, steel);
      if (i % 2 === 0) beam([a, ya, -23.5], [a, ya, 23.5], .85, steel);
    }
    for (let x = -240; x <= 240; x += 16) for (const z of [-25, 25]) cylinder(.06, .06, 4.4, steel, x, 47, z, 5);
    quay(-386, 0, 660);
    harbourFerry(-566, -55, .06, .9); harbourFerry(-611, 117, -.19, .78);
    b.setFrame(-544, -70, .04, -.5);
    box(11, .4, 58, timber, 0, 1.1, 0);
    for (const x of [-4.8, 4.8]) for (const z of [-24, -8, 8, 24]) cylinder(.24, .28, 5.3, dark, x, -.9, z, 8);
    box(2.5, .17, 6.5, timber, 0, 1.75, -31, -.22);
  } else if (track.id === 'goldcoast') {
    const white = b.material('#e6e8db', { roughness: .53, metalness: .12 });
    const oceanGlass = b.material('#557e86', { roughness: .22, metalness: .48, envMapIntensity: .9 });
    const sand = b.surface(options.materials.shoulder, '#d6c69e');
    const red = b.material('#b34438', { roughness: .69 });
    b.setFrame(-290, 425); b.reserve(-290, 425, 54, 'Q1 Tower');
    box(83, 4.7, 74, lightStone, 0, 2.35, 0); box(65, .35, 57, white, 0, 4.9, 0);
    const levels = 77, segments = mobile ? 24 : 32;
    for (let level = 0; level < levels; level++) {
      const y = 5.2 + level * 3.11, radius = 25.5 - level * .037;
      bake(ringGeometry(radius, 2.9, segments, .72), oceanGlass, 0, y + 1.45, 0);
      bake(ringGeometry(radius + .8, .22, segments, .74), white, 0, y + 2.93, 0);
    }
    for (let side = 0; side < 12; side++) {
      const a = side / 12 * TAU;
      beam([Math.sin(a) * 26, 5, Math.cos(a) * 18.5], [Math.sin(a) * 22.8, 245, Math.cos(a) * 16.4], .54, white);
    }
    const crownVertices = [], crownUvs = [], crownIndices = [], crownRows = 10;
    const crownPoint = (t, a) => {
      const radius = 22.5 * Math.max(.025, (1 - t) ** .58);
      return [Math.sin(a) * radius + 3.6 * t * t, 245.2 + 41 * t - 9 * Math.sin(t * Math.PI) * (1 - Math.cos(a)) * .5, Math.cos(a) * radius * .72];
    };
    for (let row = 0; row <= crownRows; row++) for (let col = 0; col <= segments; col++) {
      crownVertices.push(...crownPoint(row / crownRows, col / segments * TAU)); crownUvs.push(col / segments, row / crownRows);
      if (row < crownRows && col < segments) {
        const k = row * (segments + 1) + col;
        crownIndices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
      }
    }
    const crown = new THREE.BufferGeometry(); crown.setAttribute('position', new THREE.Float32BufferAttribute(crownVertices, 3));
    crown.setAttribute('uv', new THREE.Float32BufferAttribute(crownUvs, 2)); crown.setIndex(crownIndices); bake(crown, oceanGlass);
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) for (let part = 0; part < crownRows; part++) beam(crownPoint(part / crownRows, a), crownPoint((part + 1) / crownRows, a), .68, white);
    cylinder(.34, .64, 36.4, steel, 0, 304.3, 0, 10);
    cylinder(.13, .33, 15, steel, 0, 315, 0, 8);
    frontSign('Q1', 'SURFERS PARADISE', 14, 5, 0, 11, -20, '#284b55');
    for (const side of [-1, 1]) for (let n = 0; n < 5; n++) palm(-290 + side * 43, 387 + n * 18, 12 + n % 3, n * .3);

    // A separate beach promenade keeps sand, landscaping and street furniture
    // off the racing line, while the western straight opens to the Pacific.
    b.setFrame(-363, 0, 0, 1.2); box(65, .18, 890, sand, 0, -.09, 0);
    b.setFrame(0, 0, 0, 0);
    const shore = new THREE.BufferGeometry();
    shore.setAttribute('position', new THREE.Float32BufferAttribute([-434, -.7, -1000, -415, 1.18, -1000, -434, -.7, 1000, -415, 1.18, 1000], 3));
    shore.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 19, 0, 0, 2000, 19, 2000], 2)); shore.setIndex([0, 2, 1, 1, 2, 3]); bake(shore, sand);
    b.setFrame(-327, 0, 0, 4.65); b.reserve(-327, 0, 26, 'Surfers Paradise promenade');
    box(12, .3, 695, lightStone, 0, -.1, 0); box(1.35, 3.65, 695, stone, -5.3, -1.83, 0);
    for (let z = -320; z <= 320; z += 80) b.reserve(-327, z, 43, 'Gold Coast beachfront promenade');
    for (let z = -310; z <= 310; z += 29) {
      palm(-322, z, 11 + (z + 310) % 3, z * .03);
      b.setFrame(-325, z + 9, 0, 4.65);
      box(3.2, .12, .5, timber, 0, .65, 0); box(3.2, .55, .12, timber, 0, 1.02, .29);
      for (const x of [-1.1, 1.1]) box(.14, .65, .35, steel, x, .32, 0);
      cylinder(.085, .085, 5.8, steel, 4.8, 2.9, 0, 6); box(.35, .12, .8, white, 4.8, 5.83, -.35);
    }
    b.setFrame(-325, -8, -Math.PI / 2, 4.65); b.reserve(-325, -8, 18, 'Surfers Paradise beach entrance');
    for (const x of [-6.9, 6.9]) {
      box(.7, 6.9, .65, red, x, 3.45, 0); box(1.05, .2, 1, white, x, 6.95, 0);
      beam([x, 6.75, 0], [0, 8.45, 0], .22, white);
    }
    frontSign('SURFERS PARADISE', 'GOLD COAST • QUEENSLAND', 12.8, 1.8, 0, 7, .02, '#6d5742');
    for (let z = -290; z <= 290; z += 58) {
      b.setFrame(-373, z, z * .04, 1.2);
      cylinder(.045, .045, 2, timber, 0, 1, 0, 6);
      bake(new THREE.ConeGeometry(1.6, .65, 10, 1, true), white, 0, 2.1, 0);
      box(1.8, .18, .8, trim, 3, .32, .9, 0, 0, -.08);
      box(.4, .14, .8, trim, 3.9, .48, .9, 0, 0, -.7);
    }
    // Broken foam bands and a gently sloping sand margin meet the ocean,
    // rather than leaving a sharp featureless plane at the sea's edge.
    const foam = b.material('#e0e7de', { transparent: true, opacity: .17, depthWrite: false, roughness: .9, side: THREE.DoubleSide });
    foam.userData.waterSurface = true; b.setFrame(0, 0, 0, -.475);
    const positions = [], indices = [];
    for (let band = 0; band < 3; band++) for (let section = 0; section <= 160; section++) {
      const z = -800 + section * 10, x = -431.6 - band * 3.8 + Math.sin(z * .019 + band * 1.8) * .5;
      const width = .17 + .48 * Math.sin(section * .8 + band) ** 2;
      positions.push(x - width, 0, z, x + width, 0, z);
      if (section < 160 && Math.sin(section * .39 + band) > -.55) {
        const k = (band * 161 + section) * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const foamGeo = new THREE.BufferGeometry(); foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); foamGeo.setIndex(indices); bake(foamGeo, foam);
    b.setFrame(-377, 103, .04, 1.2);
    for (const x of [-2.5, 2.5]) for (const z of [-2, 2]) beam([x, 0, z], [x * .77, 3.8, z * .77], .16, white);
    box(5.4, .26, 4.7, white, 0, 3.5, 0); box(4.75, 1.05, 3.8, white, 0, 4.1, 0); box(5.2, .2, 4.5, red, 0, 4.75, 0);
    for (const side of [-1, 1]) box(.06, .69, 2.7, glass, side * 2.41, 4.2, 0);
    cylinder(.065, .065, 4.8, steel, 4.8, 2.4, 0, 7);
    const patrolYellow = b.material('#edcd4b', { roughness: .75 });
    box(.9, .5, .015, red, 5.2, 4.47, 0); box(.9, .5, .015, patrolYellow, 5.2, 3.98, 0);
    for (const color of [red, trim]) {
      const board = new THREE.CapsuleGeometry(.3, 2.6, 4, 8); board.scale(.8, 1, .11); bake(board, color, color === red ? -3.1 : -3.8, 1.65, .5, 0, 0, -.24);
    }
  } else if (track.id === 'melbourne') {
    const yellow = b.surface(options.materials.concrete, '#b89650');
    yellow.color.setRGB(1.65, 1.15, .47);
    const redBrick = b.surface(options.materials.concrete, '#8e5f45');
    const copper = b.material('#547b69', { roughness: .7, metalness: .46 });
    const cream = b.material('#d6c294', { roughness: .8 });
    const tramGreen = b.material('#2e5b47', { roughness: .54, metalness: .2 });
    const clock = b.material('#ffffff', { map: clockMap(), roughness: .86 });
    const location = b.place(.065, 1, 59, 42, 196, 'Flinders Street Station');
    const station = { ...location };
    box(38, 1.2, 194, redBrick, 0, .6, 0); box(34, 16.3, 185, yellow, 0, 9.25, 0);
    for (const y of [2, 6.5, 11.2, 17.65]) box(35.2, .4, 187, cream, 0, y, 0);
    box(35.8, .42, 189, cream, 0, 18, 0);
    for (let z = -85; z <= 85; z += 8.6) for (const side of [-1, 1]) {
      box(.18, 3.15, 2.7, glass, side * 17.08, 8.8, z); box(.18, 3, 2.45, glass, side * 17.08, 14.1, z);
      for (const dz of [-1.55, 1.55]) box(.45, 10.2, .44, cream, side * 17.18, 11.3, z + dz);
      box(.58, .28, 3.6, cream, side * 17.2, 7.07, z); box(.58, .28, 3.4, cream, side * 17.2, 12.37, z);
      for (const y of [8.8, 14.1]) box(.27, 2.9, .08, cream, side * 17.22, y, z);
    }
    // Distinctive corner dome: yellow drum, oxidised copper roof and lantern.
    cylinder(12.5, 13.5, 19.2, yellow, -3, 10.7, -76, 20);
    cylinder(13.1, 13.1, .5, cream, -3, 20.55, -76, 20);
    const dome = new THREE.SphereGeometry(1, mobile ? 20 : 32, 12, 0, TAU, 0, Math.PI / 2); dome.scale(12.6, 10.2, 12.6); bake(dome, copper, -3, 20.9, -76);
    for (let rib = 0; rib < 12; rib++) {
      const a = rib / 12 * TAU;
      for (let part = 0; part < 7; part++) {
        const point = t => [-3 + 12.68 * Math.sin(t * Math.PI / 2) * Math.sin(a), 20.9 + 10.3 * Math.cos(t * Math.PI / 2), -76 + 12.68 * Math.sin(t * Math.PI / 2) * Math.cos(a)];
        beam(point(part / 7), point((part + 1) / 7), .115, cream);
      }
    }
    cylinder(2.7, 2.7, 3.6, copper, -3, 32.25, -76, 12); cylinder(3.2, 3.4, .3, cream, -3, 34.15, -76, 12);
    bake(new THREE.ConeGeometry(3.6, 3.7, 12), copper, -3, 36.1, -76); cylinder(.09, .12, 3.1, copper, -3, 39.25, -76, 6);
    box(.18, 9, 8.8, dark, -17.25, 6.1, -76);
    const arch = new THREE.TorusGeometry(4.4, .72, 7, 22, Math.PI); bake(arch, cream, -17.38, 7.5, -76, 0, -Math.PI / 2);
    for (const z of [-80.4, -71.6]) box(.92, 6.9, .85, cream, -17.4, 4.05, z);
    for (let step = 0; step < 5; step++) box(2.5, .22, 12.5, cream, -18.3 - step * .42, 1.1 - step * .18, -76);
    for (let n = -3; n <= 3; n++) bake(new THREE.CircleGeometry(.55, 20), clock, -17.5, 10.8, -76 + n * 1.17, 0, -Math.PI / 2);
    // The photograph's triangular pediment and central clock complete the
    // station entrance above the row of seven departure clocks.
    const pediment = new THREE.BufferGeometry();
    pediment.setAttribute('position', new THREE.Float32BufferAttribute([-17.5, 18, -88, -17.5, 23.1, -76, -17.5, 18, -64], 3));
    pediment.setIndex([0, 2, 1]); bake(pediment, yellow);
    beam([-17.65, 18.05, -88.6], [-17.65, 23.5, -76], .45, cream); beam([-17.65, 23.5, -76], [-17.65, 18.05, -63.4], .45, cream);
    bake(new THREE.CircleGeometry(1.66, 28), clock, -17.72, 20.3, -76, 0, -Math.PI / 2);
    frontSign('FLINDERS STREET', 'MELBOURNE', 19, 1.55, 0, 18.5, -93.2, '#705c37');
    // The Elizabeth Street clock tower sits at the other end of the long facade.
    box(13, 27, 14, yellow, 0, 13.5, 77); box(15, .55, 16, cream, 0, 26.8, 77);
    box(12, 6.5, 12, yellow, 0, 30.2, 77);
    for (const side of [-1, 1]) bake(new THREE.CircleGeometry(2.15, 28), clock, side * 6.12, 30.2, 77, 0, side * Math.PI / 2);
    bake(new THREE.ConeGeometry(9.9, 7.7, 4), copper, 0, 37.15, 77, 0, Math.PI / 4);
    for (const side of [-1, 1]) {
      const slope = side * .2; box(18.3, .24, 168, copper, side * 8.8, 19.3, 0, 0, 0, -slope);
    }

    const point = track.sample(track.length * .075), sideOffset = 24.5;
    const tramX = point.x + point.nx * sideOffset, tramZ = point.z + point.nz * sideOffset;
    b.setFrame(tramX, tramZ, point.heading); b.reserve(tramX, tramZ, 11, 'Melbourne heritage tram stop');
    box(6.3, .2, 82, stone, 0, .04, 0);
    for (const x of [-.72, .72]) box(.075, .065, 82, steel, x, .185, 0);
    for (let z = -39; z <= 39; z += 9.8) {
      cylinder(.07, .08, 6, steel, 3.9, 3, z, 6); beam([3.9, 6, z], [-1.1, 6, z], .065, steel);
    }
    box(.022, .022, 82, steel, 0, 6, 0);
    // Green-and-cream W-class silhouette, drop-centre doors and trolley pole.
    box(2.65, .5, 13.7, dark, 0, .82, -9); box(2.54, 1.35, 13.3, tramGreen, 0, 1.67, -9);
    box(2.58, 1.32, 13.3, cream, 0, 2.85, -9); box(2.72, .22, 13.8, copper, 0, 3.65, -9);
    for (let z = -14.8; z < -3.1; z += 1.32) for (const side of [-1, 1]) {
      box(.025, .93, 1.03, glass, side * 1.3, 2.87, z);
      box(.055, 1.31, .09, timber, side * 1.32, 2.85, z + .57);
    }
    for (const side of [-1, 1]) box(.04, 1.9, 2.5, dark, side * 1.32, 1.95, -9);
    for (const z of [-15.68, -2.31]) {
      box(2.24, .91, .04, glass, 0, 2.9, z); box(.07, 1.15, .09, cream, 0, 2.84, z);
      cylinder(.17, .17, .09, trim, 0, 1.57, z + (z < -9 ? -.03 : .03), 12, Math.PI / 2);
      box(2.65, .18, .25, steel, 0, .78, z);
    }
    for (const z of [-13.4, -4.6]) for (const x of [-1.06, 1.06]) cylinder(.36, .36, .18, dark, x, .53, z, 10, 0, 0, Math.PI / 2);
    beam([0, 3.75, -11], [0, 6, -5.5], .055, steel);
    frontSign('CITY CIRCLE', '35', 1.8, .39, 0, 3.48, -15.73, '#233b2e');
    box(3.5, .28, 14, lightStone, 6, .18, 13); box(4.2, .13, 14.5, steel, 6, 3.1, 13);
    for (const z of [6.4, 19.6]) box(.11, 3.1, .11, steel, 6, 1.55, z);
    box(.06, 2.65, 13.4, glass, 7.8, 1.74, 13);
    b.setFrame(station.x, station.z, station.yaw);
    for (let z = -76; z < 80; z += 20) {
      box(2.7, .16, .51, timber, -24, .66, z); for (const x of [-25, -23]) box(.13, .65, .4, steel, x, .33, z);
    }
    quay(0, -378, 710, Math.PI / 2);
  }
  const result = b.finish();
  result.group.userData.landmarks = result.reserved.map(item => item.name);
  const setQuality = result.setQuality;
  result.setQuality = level => { setQuality(level); result.group.children.forEach(mesh => { if (mesh.material === water || mesh.material.userData.waterSurface) mesh.castShadow = false; }); };
  result.setQuality('medium');
  result.update = (_state, elapsed) => water.normalMap.offset.set(elapsed * .004, elapsed * .003);
  return result;
}
