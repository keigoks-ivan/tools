import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js?v=city-drive-17';
import { createCityWaterMaterial, addCityWaterPlane } from './world-city-australia.js?v=city-drive-17';

const TAU = Math.PI * 2;

function empireFacadeMap() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d6d0bc'; ctx.fillRect(0, 0, 128, 128);
  // A repeated 4.4 m bay by 3.6 m storey, with recessed windows and narrow
  // masonry ribs. The window detail stays visible after distant filtering.
  ctx.fillStyle = '#c2bcaa'; ctx.fillRect(0, 0, 5, 128); ctx.fillRect(0, 123, 128, 5);
  ctx.fillStyle = '#eee9d6'; ctx.fillRect(6, 0, 3, 128); ctx.fillRect(0, 117, 128, 3);
  ctx.fillStyle = '#a7a08d'; ctx.fillRect(34, 22, 62, 91);
  ctx.fillStyle = '#263b45'; ctx.fillRect(38, 25, 53, 81);
  ctx.fillStyle = '#59717b'; ctx.fillRect(40, 27, 18, 76);
  ctx.fillStyle = '#73848a'; ctx.fillRect(42, 28, 4, 72);
  ctx.fillStyle = '#172d34'; ctx.fillRect(38, 25, 53, 5); ctx.fillRect(61, 25, 3, 81);
  ctx.fillStyle = '#b9b3a3'; ctx.fillRect(35, 108, 61, 4);
  ctx.fillStyle = '#ede6cf'; ctx.fillRect(34, 112, 63, 3);
  for (let n = 0; n < 180; n++) {
    const x = (n * 71 + 13) % 128, y = (n * 47 + 19) % 128;
    if (x < 31 || x > 99) { ctx.fillStyle = n % 2 ? 'rgba(87,82,66,.08)' : 'rgba(255,255,235,.18)'; ctx.fillRect(x, y, 1, 1); }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4; return map;
}

function empireSectionGeometry(part) {
  const geometry = new THREE.BoxGeometry(part.w, part.top - part.bottom, part.d);
  const positions = geometry.attributes.position, normals = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i) + (part.top + part.bottom) / 2;
    if (Math.abs(normals.getY(i)) > .5) uv.setXY(i, .08, .08);
    else if (Math.abs(normals.getX(i)) > .5) uv.setXY(i, positions.getZ(i) / 4.4, y / 3.6);
    else uv.setXY(i, positions.getX(i) / 4.4, y / 3.6);
  }
  return geometry;
}

function pointedArchGeometry(width, height, thickness) {
  const left = new THREE.Vector2(-width / 2, 0), right = new THREE.Vector2(width / 2, 0), apex = new THREE.Vector2(0, height);
  const points = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    points.push(new THREE.Vector2((1 - t) ** 2 * left.x + 2 * (1 - t) * t * left.x + t * t * apex.x,
      2 * (1 - t) * t * height * .64 + t * t * apex.y));
  }
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    points.push(new THREE.Vector2((1 - t) ** 2 * apex.x + 2 * (1 - t) * t * right.x + t * t * right.x,
      (1 - t) ** 2 * apex.y + 2 * (1 - t) * t * height * .64));
  }
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, p.y, 0)));
  return new THREE.TubeGeometry(curve, 24, thickness / 2, 6, false);
}

function canadaSailGeometry(width, length, mobile) {
  const count = mobile ? 14 : 22, positions = [], uvs = [], indices = [];
  for (let row = 0; row <= count; row++) for (let col = 0; col <= count; col++) {
    const u = row / count, v = col / count;
    const x = (u - .5) * width, z = (v - .5) * length;
    // A tensioned membrane between high ridge masts and low perimeter points.
    const ridge = Math.pow(1 - Math.abs(u * 2 - 1), .6);
    const crest = Math.pow(v, .78);
    const y = 15 + ridge * (5 + 21 * crest) - 2.3 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    positions.push(x, y, z); uvs.push(u, v);
    if (row < count && col < count) {
      const k = row * (count + 1) + col;
      indices.push(k, k + count + 1, k + 1, k + 1, k + count + 1, k + count + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function barrelCanopyGeometry(radius, length, mobile) {
  const count = mobile ? 10 : 16, positions = [], uvs = [], indices = [];
  for (let n = 0; n <= count; n++) for (const z of [-length / 2, length / 2]) {
    const a = n / count * Math.PI;
    positions.push(Math.cos(a) * radius, Math.sin(a) * radius, z); uvs.push(n / count, z > 0 ? 1 : 0);
    if (z > 0 && n < count) { const k = n * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function mountainGeometry(seed, width, height, depth, mobile) {
  const segments = mobile ? 22 : 36, rows = mobile ? 14 : 22, positions = [], uvs = [], indices = [], colors = [];
  const forest = new THREE.Color('#587360'), rock = new THREE.Color('#a3afa4');
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= segments; col++) {
    const x = (col / segments - .5) * width, z = (row / rows - .5) * depth;
    const radius = Math.hypot(x / (width * .52), z / (depth * .53));
    const ridge = Math.max(0, 1 - radius);
    const rough = 1 + .16 * Math.sin(col * 1.1 + seed) + .085 * Math.cos(row * 1.3 + col * .7);
    const peaks = .54 + .24 * Math.sin(col / segments * Math.PI * 3.1 + seed) + .22 * Math.sin(col / segments * Math.PI * 6.7 + seed * .4) ** 2;
    const shoulder = Math.sin(row / rows * Math.PI) ** 1.35 * Math.sin(col / segments * Math.PI) ** .54;
    const y = shoulder * height * peaks * rough + Math.sin(col * .39 + row * .18) * 5 * ridge;
    positions.push(x, y, z); uvs.push(x / 24, z / 24);
    const tint = forest.clone().lerp(rock, THREE.MathUtils.smoothstep(y / height, .52, 1));
    colors.push(tint.r, tint.g, tint.b);
    if (row < rows && col < segments) {
      const k = row * (segments + 1) + col;
      indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function addAmericanLandmarks(options) {
  const { track, mobile = false } = options;
  const b = createCityBuilder(options), { box, beam, bake, cylinder } = b;
  const stone = b.surface(options.materials.concrete, '#b8b3a2');
  const lightStone = b.surface(options.materials.concrete, '#cbc6b5');
  const dark = b.material('#303d3e', { roughness: .69, metalness: .2 });
  const steel = b.material('#626f70', { roughness: .42, metalness: .72 });
  const glass = b.material('#45666d', { roughness: .18, metalness: .45, envMapIntensity: .85 });
  const trim = b.material('#dfdfce', { roughness: .65 });
  const timber = b.material('#796045', { roughness: .9 });
  const water = createCityWaterMaterial(track.id === 'vancouver' ? '#4f797d' : '#486f82');
  function frontSign(...args) {
    return b.sign(...args);
  }
  addCityWaterPlane(b, water, 0, 1445, 5000, 2110);
  if (track.id === 'vancouver') addCityWaterPlane(b, water, -1445, -905, 2110, 2590);

  function suspensionBridge({ x, z, span, sideSpan, towerHeight, deckHeight, orange = false }) {
    b.setFrame(x, z, 0, .75);
    const name = orange ? 'Golden Gate Bridge' : 'Brooklyn Bridge';
    for (let along = -span / 2 - sideSpan; along <= span / 2 + sideSpan; along += 110) b.reserve(x + along, z, 63, name);
    const paint = orange ? b.material('#bd512e', { roughness: .52, metalness: .46 }) : steel;
    const half = span / 2, extent = half + sideSpan, width = orange ? 27 : 26;
    box(extent * 2, 2, width, dark, 0, deckHeight, 0); box(extent * 2, .18, width - 1, stone, 0, deckHeight + 1.1, 0);
    for (const z of [-width / 2, width / 2]) {
      box(extent * 2, 1.65, .16, paint, 0, deckHeight - 1.7, z);
      box(extent * 2, .15, .15, paint, 0, deckHeight + 2.1, z);
      for (let x = -extent; x < extent; x += 18) {
        beam([x, deckHeight - 2.3, z], [Math.min(extent, x + 18), deckHeight - .85, z], .32, paint);
        beam([x, deckHeight - .85, z], [Math.min(extent, x + 18), deckHeight - 2.3, z], .32, paint);
        cylinder(.075, .075, 1.3, paint, x, deckHeight + 1.65, z, 5);
      }
    }
    for (const x of [-half, half]) {
      if (orange) {
        for (const z of [-12.7, 12.7]) {
          box(17, 17, 24, stone, x, 6, z); box(10, towerHeight - 9, 16, paint, x, (towerHeight + 9) / 2, z);
          for (let y = 20; y < towerHeight - 4; y += 17) box(10.35, .19, 16.3, paint, x, y, z);
        }
        for (const y of [37, 78, 121, 159, 196, towerHeight - 4]) {
          box(7.3, 7.7, 25.5, paint, x, y, 0);
          if (y < 190) beam([x, y + 5, -7.1], [x, y + 28, 7.1], .7, paint);
        }
      } else {
        box(28, 5.7, 33, stone, x, -.9, 0);
        for (const z of [-11, 0, 11]) box(22, towerHeight, 5.5, stone, x, towerHeight / 2, z);
        box(23.2, 6.7, 32, lightStone, x, towerHeight - 3.3, 0);
        box(23, 8, 30, stone, x, deckHeight - 4, 0);
        for (const side of [-1, 1]) for (const dz of [-5.5, 5.5]) {
          bake(pointedArchGeometry(7.2, 27, 1.4), lightStone, x + side * 11.9, deckHeight + 1, dz, 0, side * Math.PI / 2);
        }
        for (const dz of [-13.5, 0, 13.5]) box(23.5, 1.5, 2.4, lightStone, x, towerHeight + .7, dz);
      }
    }
    const cableHeight = px => deckHeight + 10 + (towerHeight - deckHeight - 10) * (px / half) ** 2;
    const parts = mobile ? 60 : 88;
    for (const side of [-1, 1]) {
      const z = side * (width / 2 - .7);
      for (let i = 0; i < parts; i++) {
        const a = -half + i / parts * span, c = -half + (i + 1) / parts * span;
        beam([a, cableHeight(a), z], [c, cableHeight(c), z], orange ? .96 : .68, paint);
        beam([a, deckHeight + 1.3, z], [a, cableHeight(a), z], .19, paint);
      }
      for (const dir of [-1, 1]) {
        const count = mobile ? 18 : 28;
        for (let i = 0; i < count; i++) {
          const t = i / count, next = (i + 1) / count;
          const point = a => [dir * (half + sideSpan * a), towerHeight - (towerHeight - deckHeight - 2) * Math.pow(a, .7), z];
          beam(point(t), point(next), orange ? .96 : .68, paint);
          const a = point(t); beam([a[0], deckHeight + 1.3, z], a, .18, paint);
        }
      }
      if (!orange) for (const tower of [-half, half]) for (let i = 1; i < (mobile ? 12 : 18); i++) {
        const distance = span * .45 * i / (mobile ? 12 : 18);
        const px = tower + (tower < 0 ? 1 : -1) * distance;
        beam([tower, towerHeight - 1, z], [px, deckHeight + 2, z], .085, steel);
      }
    }
  }

  function victorianHouse(z, color, width = 9.8, height = 12.5) {
    const paint = b.surface(options.materials.concrete, color, { roughness: .88 });
    paint.color.multiplyScalar(1.8);
    box(17, .95, width, stone, 0, .48, z); box(14.5, height, width - .35, paint, 0, height / 2 + .9, z);
    for (const y of [1.05, 5.2, 9.25, height + .8]) box(15.1, .28, width, trim, 0, y, z);
    for (let y = 1.5; y < height; y += .43) box(.12, .045, width - .45, trim, -7.31, y, z);
    box(2.4, height - 2.1, width * .51, paint, -8, (height + .5) / 2, z - 1.1);
    for (const y of [3.3, 7.5, 11]) {
      box(.07, 2.4, width * .39, glass, -9.24, y, z - 1.1);
      for (const dz of [-width * .19, 0, width * .19]) box(.14, 2.55, .11, trim, -9.3, y, z - 1.1 + dz);
      box(.26, .2, width * .53, trim, -9.34, y - 1.26, z - 1.1);
      box(.26, .23, width * .53, trim, -9.34, y + 1.27, z - 1.1);
      box(.08, 2.2, 1.2, glass, -7.35, y, z + width * .3);
    }
    box(.12, 2.65, 1.1, timber, -7.34, 2.4, z + width * .31);
    for (let step = 0; step < 6; step++) box(.62, .18, 1.55, stone, -8.05 - step * .46, 1.07 - step * .14, z + width * .31);
    const roofWidth = width + .55, slope = Math.atan2(3, roofWidth / 2);
    for (const side of [-1, 1]) box(15.6, .2, Math.hypot(roofWidth / 2, 3), dark, 0, height + 2.4, z + side * roofWidth * .25, side * slope);
    beam([-7.8, height + .9, z - width / 2], [-7.8, height + 3.9, z], .22, trim);
    beam([-7.8, height + 3.9, z], [-7.8, height + .9, z + width / 2], .22, trim);
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute([-7.78, height + .9, z - width / 2, -7.78, height + 3.9, z, -7.78, height + .9, z + width / 2], 3));
    gable.setIndex([0, 2, 1]); bake(gable, paint);
    for (let i = -4; i <= 4; i++) box(.3, .18, .12, trim, -7.67, height + 1.06, z + i * width / 10);
    box(1.1, 2.6, .9, stone, 3.8, height + 4, z + 2.1);
    for (const dz of [-width * .40, width * .40]) {
      cylinder(.10, .12, 3.4, trim, -9.15, 2.65, z + dz, 7);
      box(.35, .16, .35, trim, -9.15, 4.4, z + dz);
    }
    box(2.9, .22, width - .5, paint, -8.05, 4.65, z);
  }

  function taxi(x, z, yaw = 0) {
    b.setFrame(x, z, yaw); const yellow = b.material('#e8b52e', { roughness: .4, metalness: .2 });
    box(1.9, .56, 4.7, yellow, 0, .71, 0); box(1.7, .65, 2.3, yellow, 0, 1.29, -.21);
    for (const side of [-1, 1]) box(.03, .44, 1.98, glass, side * .87, 1.31, -.2);
    box(1.55, .5, .045, glass, 0, 1.33, .97, -.17); box(1.53, .46, .045, glass, 0, 1.31, -1.36, .18);
    box(.9, .27, .34, trim, 0, 1.77, -.22);
    for (const zz of [-1.42, 1.44]) for (const xx of [-.87, .87]) cylinder(.32, .32, .22, dark, xx, .42, zz, 10, 0, 0, Math.PI / 2);
    box(1.45, .19, .08, steel, 0, .62, 2.4);
  }

  if (track.id === 'sanfrancisco') {
    suspensionBridge({ x: 160, z: 510, span: 1280, sideSpan: 343, towerHeight: 227, deckHeight: 67, orange: true });
    const street = b.place(.026, 1, 52, 32, 95, 'San Francisco Painted Ladies');
    const colors = ['#b8bf9c', '#b7a69a', '#929f96', '#c2ad8f', '#b49696', '#9dabaf'];
    for (let n = 0; n < 6; n++) {
      const along = -32 + n * 12.4;
      b.setFrame(street.x + Math.sin(street.yaw) * along, street.z + Math.cos(street.yaw) * along, street.yaw);
      victorianHouse(0, colors[n], 10.5, 12.1 + n * .37);
    }
    b.setFrame(142, 174, -.07); b.reserve(142, 174, 55, 'San Francisco Transamerica tapered skyline');
    const pyramidFacade = b.surface(options.materials.concrete, '#e0dccd', { map: empireFacadeMap(), roughness: .82 });
    pyramidFacade.userData = { ...pyramidFacade.userData, surface: false };
    const pyramid = new THREE.CylinderGeometry(4.3, 44, 210, 4, 1); pyramid.rotateY(Math.PI / 4);
    const positions = pyramid.attributes.position, normals = pyramid.attributes.normal, uv = pyramid.attributes.uv;
    for (let i = 0; i < positions.count; i++) uv.setXY(i, (Math.abs(normals.getX(i)) > .5 ? positions.getZ(i) : positions.getX(i)) / 4.4, (positions.getY(i) + 115) / 3.6);
    bake(pyramid, pyramidFacade, 0, 115, 0); box(61, 10, 61, lightStone, 0, 5, 0);
    for (const side of [-1, 1]) box(5, 101, 9, lightStone, side * 18.5, 77, 0);
    cylinder(.18, 4.4, 40, trim, 0, 240, 0, 4, 0, Math.PI / 4);
    const point = track.sample(track.length * .078), offset = 26;
    const x = point.x + point.nx * offset, z = point.z + point.nz * offset;
    b.setFrame(x, z, point.heading); b.reserve(x, z, 15, 'San Francisco cable car stop');
    const burgundy = b.material('#8d3730', { roughness: .73 });
    box(6, .19, 74, stone, 0, .1, 0);
    for (const xx of [-.7, .7]) box(.07, .07, 74, steel, xx, .23, 0);
    box(2.6, .43, 8.6, timber, 0, .65, -2); box(2.42, .87, 5.8, burgundy, 0, 1.28, -2.9);
    box(2.42, 1.02, 5.8, trim, 0, 2.24, -2.9); box(2.76, .25, 9.1, dark, 0, 2.93, -2);
    for (const zz of [-5, -3.65, -2.3, -.95]) for (const side of [-1, 1]) {
      box(.045, .78, 1.1, glass, side * 1.24, 2.27, zz); box(.1, 1.1, .09, timber, side * 1.29, 2.23, zz + .56);
    }
    for (const side of [-1, 1]) for (const zz of [.95, 1.95]) box(.11, 2.35, .12, trim, side * 1.24, 1.8, zz);
    box(2.3, .25, .5, timber, 0, 1.32, 1.23);
    for (const zz of [-4.6, .63]) for (const xx of [-1.03, 1.03]) cylinder(.33, .33, .17, dark, xx, .44, zz, 10, 0, 0, Math.PI / 2);
    b.sign('POWELL & HYDE', 'SAN FRANCISCO', 1.8, .43, 0, 2.74, 2.53, '#71402f');
    b.setFrame(street.x, street.z, street.yaw);
    for (let n = 0; n < 12; n++) cylinder(.09, .09, 4.9, steel, -18.9, 2.45, -39 + n * 7.8, 6);
    // A rocky bay margin grounds the northern sea cut below the racing road.
    const rock = b.surface(options.materials.rock, '#887d65');
    b.setFrame(0, 0, 0, 0);
    const bank = new THREE.BufferGeometry(), vertices = [], bankIndices = [];
    for (let n = 0; n <= 80; n++) {
      const x = -400 + n * 10, edge = 396 + Math.sin(n * 1.39) * 2.2;
      vertices.push(x, 4.45, 378, x, -.8, edge);
      if (n < 80) { const k = n * 2; bankIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    bank.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); bank.setIndex(bankIndices); bake(bank, rock);
    for (let n = 0; n < 15; n++) {
      b.setFrame(-350 + n * 47, 392 + Math.sin(n * 1.51) * 3, n * .51, -.8);
      const outcrop = new THREE.DodecahedronGeometry(1); outcrop.scale(3.3 + n % 3, 1.4 + n % 2, 2.4); bake(outcrop, rock, 0, .3, 0);
    }
  } else if (track.id === 'newyork') {
    suspensionBridge({ x: 0, z: 480, span: 486.3, sideSpan: 160, towerHeight: 84.3, deckHeight: 41.1 });
    // Manhattan rises beyond the river, preserving the full-height skyline
    // from the street camera rather than cropping a nearby 443 m tower.
    b.setFrame(-150, 1055, 0, 4.65);
    box(1660, 7.9, 950, stone, 0, -3.65, 0); box(1662, .22, 952, lightStone, 0, .2, 0);
    for (let x = -810; x < 810; x += 22) {
      cylinder(.11, .11, 1.1, steel, x, .72, -475, 6);
      box(21.9, .07, .08, steel, x + 11, 1.26, -475);
    }
    b.setFrame(-330, 975, 0, 4.65); b.reserve(-330, 975, 83, 'Empire State Building');
    const facade = b.surface(options.materials.concrete, '#ffffff', { map: empireFacadeMap(), roughness: .83 });
    facade.userData = { ...facade.userData, surface: false, cityLandmarkFacade: true };
    const sections = [
      { w: 116, d: 73, bottom: 0, top: 24 }, { w: 94, d: 64, bottom: 24, top: 51 },
      { w: 66, d: 57, bottom: 51, top: 247 }, { w: 56, d: 49, bottom: 247, top: 278 },
      { w: 43, d: 41, bottom: 278, top: 309 }, { w: 30, d: 29, bottom: 309, top: 332 },
      { w: 21, d: 20, bottom: 332, top: 356 },
    ];
    for (const part of sections) {
      bake(empireSectionGeometry(part), facade, 0, (part.top + part.bottom) / 2, 0);
      box(part.w + .55, .38, part.d + .55, lightStone, 0, part.top + .2, 0);
      for (const side of [-1, 1]) {
        for (let x = -part.w / 2 + 5; x < part.w / 2; x += 8.8) box(.22, part.top - part.bottom, .22, lightStone, x, (part.top + part.bottom) / 2, side * (part.d / 2 + .06));
      }
    }
    cylinder(4.3, 9.5, 24, lightStone, 0, 368, 0, 16); cylinder(2.2, 4.3, 28, steel, 0, 394, 0, 14);
    cylinder(.7, 2.2, 35, steel, 0, 425.5, 0, 10); cylinder(10.5, 10.5, 1.05, lightStone, 0, 335, 0, 20);
    frontSign('EMPIRE STATE', '350 FIFTH AVENUE', 15, 1.6, 0, 6, -36.62, '#665e4d');

    for (const [n, tower] of [{ x: -750, z: 745, h: 151, w: 49, d: 48 }, { x: -615, z: 880, h: 192, w: 45, d: 45 },
      { x: -480, z: 1130, h: 138, w: 61, d: 57 }, { x: -155, z: 850, h: 178, w: 64, d: 56 },
      { x: 40, z: 1000, h: 135, w: 61, d: 44 }, { x: 160, z: 870, h: 202, w: 48, d: 56 },
      { x: 360, z: 1160, h: 154, w: 76, d: 56 }, { x: 575, z: 765, h: 116, w: 56, d: 47 }].entries()) {
      b.setFrame(tower.x, tower.z, 0, 4.65);
      if (n % 2) for (const [scale, bottom, top] of [[1, 0, tower.h * .70], [.77, tower.h * .70, tower.h * .91], [.52, tower.h * .91, tower.h]]) {
        const part = { w: tower.w * scale, d: tower.d * scale, bottom, top };
        bake(empireSectionGeometry(part), facade, 0, (bottom + top) / 2, 0);
        box(part.w + .9, .5, part.d + .9, lightStone, 0, top + .1, 0);
      } else box(tower.w, tower.h, tower.d, stone, 0, tower.h / 2, 0);
      box(tower.w + 1.3, 1.8, tower.d + 1.3, lightStone, 0, tower.h, 0);
      for (let y = 5; n % 2 === 0 && y < tower.h - 2; y += mobile ? 8 : 4) {
        box(tower.w - 4, 1.65, .06, glass, 0, y, -tower.d / 2 - .05);
        for (const side of [-1, 1]) box(.06, 1.65, tower.d - 4, glass, side * (tower.w / 2 + .05), y, 0);
      }
      for (let x = -tower.w / 2 + 4; x < tower.w / 2; x += 6.8) box(.45, tower.h, .16, lightStone, x, tower.h / 2, -tower.d / 2 - .1);
    }

    const brownstone = b.place(.035, 1, 47, 30, 113, 'Manhattan brownstone frontage');
    const brick = b.surface(options.materials.concrete, '#795d49');
    for (let n = 0; n < 8; n++) {
      const z = -46 + n * 13.1;
      box(21, 17.4, 11.8, brick, 0, 8.7, z); box(22, .53, 12.1, dark, 0, 17.6, z);
      for (let floor = 0; floor < 4; floor++) for (const dz of [-3.5, 0, 3.5]) {
        const y = 3.1 + floor * 3.7;
        box(.08, 2.3, 1.68, glass, -10.56, y, z + dz); box(.36, .2, 2.02, lightStone, -10.69, y - 1.23, z + dz);
        for (const edge of [-.93, .93]) box(.22, 2.6, .16, stone, -10.68, y, z + dz + edge);
      }
      box(.09, 2.8, 1.2, timber, -10.57, 2.1, z + 2.8);
      for (let step = 0; step < 7; step++) box(.54, .16, 1.75, stone, -10.8 - step * .39, 1.34 - step * .15, z + 2.8);
      for (const side of [-1, 1]) beam([-13.5, .85, z + 2.8 + side * .9], [-11, 2.06, z + 2.8 + side * .9], .055, dark);
      // Thin projecting fire escapes read clearly from the racing camera.
      for (const y of [6.3, 10, 13.7]) {
        box(1.3, .1, 4.2, dark, -11.1, y, z - 2.3);
        for (const dz of [-2, 2]) box(.055, 1.03, .055, dark, -11.7, y + .53, z - 2.3 + dz);
        box(.055, .055, 4.2, dark, -11.7, y + 1.06, z - 2.3);
        beam([-11.9, y + .12, z - 4.1], [-11.9, y + 3.82, z -.5], .07, dark);
      }
      if (n % 2 === 0) {
        for (const x of [-1.2, 1.2]) for (const dz of [-1.2, 1.2]) beam([x, 17.8, z + dz], [x * .8, 19.1, z + dz * .8], .13, dark);
        cylinder(1.6, 1.6, 3, timber, 0, 20.5, z, 12); bake(new THREE.ConeGeometry(1.85, .8, 12), dark, 0, 22.4, z);
        for (const y of [19.25, 20.6, 21.9]) cylinder(1.63, 1.63, .07, steel, 0, y, z, 12);
      }
    }
    const road = track.sample(track.length * .11);
    for (let n = 0; n < 3; n++) taxi(road.x + road.nx * 23, road.z + road.nz * 23 + n * 11, road.heading);
    b.setFrame(brownstone.x, brownstone.z, brownstone.yaw);
    b.sign('FIFTH AVENUE', 'MANHATTAN', 8.6, .86, -11.24, 5.4, 3, '#314a3e');
  } else if (track.id === 'vancouver') {
    const white = b.material('#eeeeea', { roughness: .54, side: THREE.DoubleSide });
    b.setFrame(-485, 25, 0, 4.65); b.reserve(-485, 25, 148, 'Canada Place five sails');
    box(86, 7.7, 258, stone, 0, -2.84, 0); box(68, 9, 242, lightStone, 0, 4.5, 0);
    box(71, .55, 246, trim, 0, 9.3, 0);
    for (const side of [-1, 1]) {
      box(.18, 6.8, 224, glass, side * 34.1, 4.8, 0);
      for (let z = -112; z <= 112; z += 7) box(.34, 7.2, .35, steel, side * 34.25, 4.8, z);
      for (let z = -123; z <= 123; z += 9) cylinder(.085, .085, 1.2, steel, side * 39.6, .64, z, 5);
      for (const y of [.36, 1.12]) box(.08, .065, 247, steel, side * 39.6, y, 0);
    }
    for (let sail = 0; sail < 5; sail++) {
      const z = -94 + sail * 47;
      bake(canadaSailGeometry(65, 47, mobile), white, 0, 0, z);
      beam([0, 9.5, z + 23.5], [0, 41, z + 23.5], .55, trim);
      for (const side of [-1, 1]) beam([side * 32.5, 15, z - 23.5], [0, 41, z + 23.5], .12, steel);
      for (const side of [-1, 1]) beam([side * 32.5, 9.5, z], [side * 32.5, 15, z], .24, trim);
    }
    const canopy = b.material('#4f8282', { roughness: .24, metalness: .3, side: THREE.DoubleSide });
    for (let z = -108; z <= 108; z += 18) {
      bake(barrelCanopyGeometry(4.2, 15.5, mobile), canopy, 34.7, 4.25, z);
      for (const dz of [-7.8, 0, 7.8]) {
        const arc = new THREE.TorusGeometry(4.25, .09, 4, 16, Math.PI); bake(arc, trim, 34.7, 4.25, z + dz);
      }
      for (const x of [30.5, 38.9]) box(.11, 4.25, .11, trim, x, 2.13, z - 7.8);
    }
    frontSign('CANADA PLACE', 'VANCOUVER WATERFRONT', 20, 2.3, 0, 7, -121.2, '#375767');
    const station = b.place(.03, 1, 48, 36, 104, 'Vancouver Waterfront Station');
    const brick = b.surface(options.materials.concrete, '#995d47');
    box(31, 15.4, 101, brick, 0, 7.7, 0); box(33, .5, 104, lightStone, 0, 15.6, 0);
    for (const y of [.35, 6.4, 13.7]) box(32, .32, 102, lightStone, 0, y, 0);
    for (let z = -43; z <= 43; z += 7.8) {
      box(.1, 3.3, 3.1, glass, -15.57, 10, z); box(.12, 3.7, 3.2, glass, -15.57, 3.6, z);
      cylinder(.54, .66, 11.8, lightStone, -16.6, 6.4, z, 10);
      box(1.55, .26, 1.55, lightStone, -16.6, 12.45, z);
    }
    for (const side of [-1, 1]) box(17, .3, 103, dark, side * 7.6, 17.1, 0, 0, 0, -side * .18);
    frontSign('WATERFRONT', 'VANCOUVER • CANADA', 17, 1.7, 0, 14.2, -50.65, '#563f34');
    b.setFrame(-387, 0, 0, 4.65);
    box(5, 6.4, 686, stone, 0, -3.13, 0); box(9, .24, 688, lightStone, 0, .14, 0);
    for (let z = -310; z <= 310; z += 15) {
      cylinder(.1, .1, 1.12, steel, -3.8, .69, z, 6);
      for (const y of [.5, 1.17]) box(.075, .06, 14.95, steel, -3.8, y, z + 7.5);
    }
    // Harbour floatplanes and timber pontoons are recognisable waterfront
    // details, built from the same few merged material batches.
    b.setFrame(-600, -62, -.09, -.5);
    box(8.5, .32, 91, timber, 0, .69, 0); box(45, .32, 5.5, timber, -19, .69, 27);
    for (const x of [-3.6, 3.6]) for (let z = -39; z <= 39; z += 13) cylinder(.24, .28, 4.5, dark, x, -1, z, 8);
    box(2.1, .16, 17, timber, 19, 2.04, 27, 0, 0, .15);
    b.setFrame(-626, -88, .4, -.5);
    const floatWhite = b.material('#e9e7db', { roughness: .46, metalness: .18 });
    const floatBlue = b.material('#335367', { roughness: .38, metalness: .22 });
    const body = new THREE.CapsuleGeometry(.69, 5.8, 4, mobile ? 10 : 14); body.rotateX(Math.PI / 2); body.scale(1, 1.14, 1); bake(body, floatWhite, 0, 1.82, 0);
    box(13.6, .15, 1.63, floatWhite, 0, 2.9, -.3); box(4.8, .11, 1.03, floatWhite, 0, 2.1, -3.1);
    box(.12, 1.75, 1.53, floatBlue, 0, 2.87, -3.1, -.23);
    for (const side of [-1, 1]) {
      const float = new THREE.CapsuleGeometry(.23, 4.8, 3, 8); float.rotateX(Math.PI / 2); bake(float, floatBlue, side * 1.53, .22, .1);
      beam([side * .59, 1.42, .9], [side * 1.53, .49, 1.6], .085, steel);
      beam([side * .59, 1.42, -1.2], [side * 1.53, .49, -1.55], .085, steel);
      box(.045, .55, 1.26, glass, side * .7, 2.18, 1.14);
      beam([side * .5, 1.48, .5], [side * 4.9, 2.8, -.1], .075, steel);
    }
    box(.075, 2.1, .17, dark, 0, 1.93, 3.99);
    const cedar = b.material('#365e49', { roughness: .92 });
    for (let n = 0; n < 10; n++) {
      b.setFrame(-372, 185 + n * 15.8, 0, 4.65); const h = 13 + n % 4;
      cylinder(.19, .32, h, timber, 0, h / 2, 0, 7);
      for (let tier = 0; tier < 5; tier++) bake(new THREE.ConeGeometry((h * .23) * (1 - tier * .13), h * .31, mobile ? 9 : 13), cedar, 0, h * .38 + tier * h * .13, 0);
    }
    b.setFrame(station.x, station.z, station.yaw);
  }
  const result = b.finish(); result.group.userData.landmarks = result.reserved.map(item => item.name);
  const setQuality = result.setQuality;
  result.setQuality = level => { setQuality(level); result.group.children.forEach(mesh => { if (mesh.material === water) mesh.castShadow = false; }); };
  result.setQuality('medium');
  result.update = (_state, elapsed) => water.normalMap.offset.set(elapsed * .004, elapsed * .003); return result;
}
