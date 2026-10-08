import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addExtraCityLandmarks } from './world-cities-extra.js';
import { createCityWaterMaterial } from './world-city-australia.js';

export const CITY_THEMES = Object.freeze(['taipei', 'kualalumpur', 'kobe', 'london', 'sydney', 'goldcoast', 'melbourne', 'paris', 'prague', 'newcastle', 'bangkok', 'sanfrancisco', 'newyork', 'vancouver', 'hanoi', 'lisbon', 'marseille', 'nice', 'warwick']);
const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);
export function cityGroundLevel(city, x, z) {
  if ((city === 'london' && x > 101 && x < 357) || (city === 'kobe' && z < -380)
    || (city === 'sydney' && (x < -390 || z > 390)) || (city === 'goldcoast' && x < -415)
    || (city === 'melbourne' && z < -380 && z > -505)) return -4;
  if ((city === 'sanfrancisco' && z > 390) || (city === 'newyork' && z > 390)
    || (city === 'vancouver' && (x < -390 || z > 390))
    || (city === 'paris' && z < -390 && z > -550)
    || (city === 'prague' && z < -390 && z > -650) || (city === 'newcastle' && z > 390 && z < 650)
    || (city === 'lisbon' && z < -385) || (city === 'marseille' && z < -390)
    || (city === 'nice' && x < -405) || (city === 'warwick' && z < -355 && z > -490)
    || (city === 'bangkok' && z < -385 && z > -630)
    || (city === 'hanoi' && (x / 145) ** 2 + (z / 185) ** 2 < 1)) return -4;
  if (city === 'goldcoast' && x < -335) return 1.15;
  if (city === 'nice' && x < -350) return 1.4;
  return 4.65;
}
function random(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function canvasMap(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; return map;
}
function facadeMap(city, index, mobile) {
  return canvasMap(mobile ? 256 : 512, mobile ? 512 : 1024, (c, width, height) => {
    c.scale(width / 512, height / 1024); const w = 512, h = 1024;
    const rand = random(7621 + index * 721), historic = ['london', 'paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick', 'sanfrancisco', 'hanoi'].includes(city);
    const colors = historic ? ['#94735c', '#b9ad97', '#b2a58c', '#725b4c', '#d0c7b4', '#988a77']
      : ['#8b9998', '#7b8e90', '#b2b5aa', '#aaa79c', '#7a8382', '#a4b3b2'];
    const regional = {
      paris: ['#d8ccae', '#c9bfa8', '#d8d3c0', '#b9ad98', '#cec3aa', '#dbd1b6'],
      prague: ['#d9c893', '#ceb79f', '#e2c6a6', '#a3b9aa', '#bf9d8b', '#d4cdaa'],
      lisbon: ['#d9c886', '#dcc2b3', '#bfd0cd', '#d1e0dc', '#cda789', '#b8c9cf'],
      marseille: ['#d5c5a6', '#c8b697', '#e1d3b7', '#bcb7a5', '#cfae92', '#ded4b9'],
      nice: ['#dbc5a5', '#d7b4a2', '#e7d6b3', '#bdc4b5', '#dabfa9', '#c9b798'],
      warwick: ['#d6cdb7', '#cebfaa', '#d5d2bb', '#b99881', '#c0ad96', '#e1d6bc'],
      sanfrancisco: ['#bfc3ba', '#b7c8c6', '#d0b7a8', '#dac897', '#b7b7c8', '#a1b9b6'],
      hanoi: ['#d2b371', '#c8b278', '#d8c18a', '#bba66d', '#d1bc8b', '#b9b38d'],
    }[city];
    c.fillStyle = (regional || colors)[index % colors.length]; c.fillRect(0, 0, w, h);
    if (historic && city !== 'hanoi') {
      for (let row = 0; row < 128; row++) for (let col = -1; col < 18; col++) {
        c.fillStyle = `rgba(38,25,15,${.05 + rand() * .14})`;
        c.fillRect(col * 31 + (row % 2) * 15.5, row * 8, 29, 6.5);
      }
    } else {
      for (let i = 0; i < 1800; i++) {
        c.fillStyle = `rgba(39,48,44,${rand() * .045})`; c.fillRect(rand() * w, rand() * h, .7 + rand() * 2, 15 + rand() * 70);
      }
    }
    // Irregular rain streaks and mortar discoloration break the repeated grid.
    for (let mark = 0; mark < 1200; mark++) {
      c.fillStyle = `rgba(36,31,23,${.018 + rand() * (historic ? .035 : .016)})`;
      c.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 2 + rand() * (historic ? 24 : 70));
    }
    if (['paris', 'marseille', 'nice', 'prague'].includes(city)) for (let floor = 0; floor < 8; floor++) {
      c.fillStyle = 'rgba(77,67,49,.16)'; c.fillRect(0, floor * 128 + 117, w, 5);
      c.fillStyle = 'rgba(255,246,219,.29)'; c.fillRect(0, floor * 128 + 112, w, 4);
    }
    if (city === 'warwick') {
      c.fillStyle = '#453d34';
      for (let row = 0; row < 8; row++) c.fillRect(0, row * 128, w, 11);
      for (let col = 0; col <= 4; col++) c.fillRect(col * 128 - 6, 0, 12, h);
      c.strokeStyle = '#453d34'; c.lineWidth = 9;
      for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) { c.beginPath(); c.moveTo(col * 128 + 9, row * 128 + 12); c.lineTo((col + 1) * 128 - 9, (row + 1) * 128 - 12); c.stroke(); }
    }
    const rows = 8, cols = historic ? 4 : [6, 8, 10][index % 3], cw = w / cols, ch = h / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const inset = historic ? city === 'warwick' ? 35 : 30 : index % 3 === 2 ? 11 : 6;
      const x = col * cw + inset, y = row * ch + (historic ? 22 : 10);
      const ww = cw - inset * 2, hh = ch - (historic ? 49 : 23);
      c.fillStyle = historic ? '#ded5bf' : index % 2 ? '#819594' : '#b7beb5'; c.fillRect(x - 4, y - 5, ww + 8, hh + 11);
      c.fillStyle = 'rgba(10,19,21,.44)'; c.fillRect(x - 1, y - 2, ww + 2, hh + 5);
      const gradient = c.createLinearGradient(x, y, x + ww, y + hh);
      gradient.addColorStop(0, historic ? '#56696a' : ['#536f77', '#77959b', '#638088', '#869994'][Math.floor(rand() * 4)]);
      gradient.addColorStop(.46, historic ? '#83908a' : '#9eafb0'); gradient.addColorStop(.49, historic ? '#52645f' : '#667f84'); gradient.addColorStop(1, historic ? '#253a36' : '#29414b');
      c.fillStyle = gradient; c.fillRect(x, y, ww, hh);
      if (rand() > .5) { c.fillStyle = 'rgba(210,204,177,.51)'; c.fillRect(x + 2, y + 2, ww - 4, hh * (.2 + rand() * .56)); }
      c.fillStyle = historic ? '#e6dfcd' : '#b9c2bf'; c.fillRect(x + ww / 2 - 1, y, 2, hh);
      c.fillRect(x, y + hh * .55, ww, historic ? 2.5 : 1.5);
      c.fillStyle = 'rgba(30,43,42,.3)'; c.fillRect(x - 3, y + hh + 4, ww + 6, 3);
      if (historic && ['nice', 'marseille', 'prague', 'hanoi'].includes(city)) {
        c.fillStyle = ['#7b8773', '#77847d', '#8a7665'][index % 3]; c.fillRect(x - 15, y, 10, hh); c.fillRect(x + ww + 5, y, 10, hh);
        c.fillStyle = 'rgba(23,38,28,.25)'; for (let slat = 0; slat < 12; slat++) { c.fillRect(x - 15, y + slat * hh / 12, 10, 1); c.fillRect(x + ww + 5, y + slat * hh / 12, 10, 1); }
      }
      if (city === 'lisbon') {
        c.strokeStyle = 'rgba(51,96,121,.4)'; c.lineWidth = 1.5;
        for (let tile = 0; tile < 4; tile++) { c.strokeRect(col * cw + 4 + tile * 13, row * ch + 112, 11, 11); }
      }
      if (!historic && index % 2) for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(225,224,212,.23)'; c.fillRect(x, y + 15 + i * 7, ww, 2); }
    }
  });
}
function signMap(title, subtitle, color = '#164c43') {
  return canvasMap(1024, 256, (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h); c.strokeStyle = '#e8eee2'; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#f4f4e7'; c.textAlign = 'center'; c.font = '700 69px Arial, sans-serif';
    let size = 69; while (c.measureText(title).width > w - 95) { size -= 2; c.font = `700 ${size}px Arial, sans-serif`; }
    c.fillText(title, w / 2, 116); c.font = '34px Arial, sans-serif'; c.fillText(subtitle, w / 2, 187);
  });
}
function clockMap() {
  return canvasMap(512, 512, (c, n) => {
    c.fillStyle = '#d8d6c3'; c.fillRect(0, 0, n, n); const mid = n / 2;
    c.beginPath(); c.arc(mid, mid, 242, 0, TAU); c.fillStyle = '#b99845'; c.fill();
    c.beginPath(); c.arc(mid, mid, 223, 0, TAU); c.fillStyle = '#f1eee1'; c.fill();
    c.strokeStyle = '#224f68'; c.lineWidth = 5;
    for (let i = 0; i < 60; i++) {
      const angle = i / 60 * TAU, radius = i % 5 ? 209 : 192;
      c.beginPath(); c.moveTo(mid + Math.sin(angle) * radius, mid - Math.cos(angle) * radius);
      c.lineTo(mid + Math.sin(angle) * 216, mid - Math.cos(angle) * 216); c.stroke();
    }
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    c.fillStyle = '#194561'; c.font = 'bold 39px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) { const angle = i / 12 * TAU; c.fillText(numerals[i], mid + Math.sin(angle) * 174, mid - Math.cos(angle) * 174); }
    for (let ring = 0; ring < 5; ring++) { c.beginPath(); c.arc(mid, mid, 51 + ring * 23, 0, TAU); c.strokeStyle = 'rgba(35,67,75,.3)'; c.lineWidth = 1.5; c.stroke(); }
    c.strokeStyle = '#1e4964'; c.lineCap = 'round'; c.lineWidth = 13;
    c.beginPath(); c.moveTo(mid, mid); c.lineTo(mid + 90, mid - 42); c.stroke();
    c.lineWidth = 8; c.beginPath(); c.moveTo(mid, mid); c.lineTo(mid - 127, mid - 99); c.stroke();
    c.fillStyle = '#b99742'; c.beginPath(); c.arc(mid, mid, 15, 0, TAU); c.fill();
  });
}

// Landmark heights follow official references. Street layouts are closed-course adaptations.
// Static architectural parts share material batches, including all window mullions and trusses.
export function addCityScenery({ scene, track, mobile = false, groundHeight, materials }) {
  const city = track.theme, rand = random(8053 + CITY_THEMES.indexOf(city) * 331);
  const batches = new Map(), ownedMaterials = new Set(), reserved = [], footprints = [];
  const group = new THREE.Group(); group.name = `${city}-city`; scene.add(group);
  let cityWater;
  let frame = new THREE.Matrix4();
  const scale = new THREE.Vector3(1, 1, 1), position = new THREE.Vector3(), rotation = new THREE.Quaternion();
  function material(color, options = {}) {
    const value = new THREE.MeshStandardMaterial({ color, roughness: .8, ...options }); ownedMaterials.add(value); return value;
  }
  function surface(base, color, options = {}) {
    const value = base.clone(); value.color.set(color); Object.assign(value, options); ownedMaterials.add(value); return value;
  }
  const stone = surface(materials.concrete, city === 'london' ? '#d4c6a9' : '#d8d9cd');
  const paving = surface(materials.concrete, '#c6c5b8', { roughness: .96 });
  const charcoal = material('#404b4c', { metalness: .35, roughness: .5 });
  const steel = material('#bec7c5', { metalness: .78, roughness: .35 });
  const glass = material(city === 'taipei' ? '#4c8987' : city === 'kualalumpur' ? '#728087' : '#678a96', { metalness: .32, roughness: .18 });
  const darkGlass = material('#384d56', { metalness: .35, roughness: .24 });
  const white = material('#eeeee0', { roughness: .55 });
  const gold = material('#bfa15a', { metalness: .7, roughness: .45 });
  const red = material('#b23229', { roughness: .5, metalness: .18 });
  const roof = material('#535d60', { roughness: .7 });
  const bark = material('#625646', { roughness: 1 });
  const foliageMap = canvasMap(256, 256, (c, size) => {
    const paint = random(7409);
    for (let i = 0; i < 1700; i++) {
      const x = paint() * 2 - 1, y = paint() * 2 - 1;
      if (x * x + y * y > .88 || paint() > .82) continue;
      const light = paint() * 44; c.fillStyle = `rgb(${53 + light * .8},${76 + light},${44 + light * .65})`;
      c.beginPath(); c.ellipse((x * .47 + .5) * size, (y * .47 + .5) * size, 2.3 + paint() * 1.3, 4 + paint() * 3, paint() * Math.PI, 0, TAU); c.fill();
    }
  });
  const leaf = material('#c0cead', { map: foliageMap, alphaTest: .28, side: THREE.DoubleSide, roughness: .96 });
  leaf.name = 'city-foliage';
  const signalGreen = material('#4b9d70', { emissive: '#287349', emissiveIntensity: .5 });
  const palmLeaf = material('#657a42', { roughness: .93 });
  const roadPaint = material(city === 'taipei' ? '#d7bf60' : '#ecebdc', { roughness: .96, side: THREE.DoubleSide });
  roadPaint.name = 'city-road-markings'; roadPaint.userData.cityRoadPaint = true;
  const historic = ['london', 'paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick', 'sanfrancisco', 'hanoi'].includes(city);
  if (historic) {
    const slate = ['paris', 'london', 'newcastle', 'sanfrancisco'].includes(city);
    roof.color.set(slate ? '#6b6c66' : '#bb7754'); roof.roughness = .94;
    roof.map = canvasMap(256, 256, (c, size) => {
      const noise = random(92031), colors = slate ? ['#9b9e97', '#959990', '#a2a59b', '#8d938c'] : ['#d9b08a', '#c89b75', '#d2a079', '#c3926d'];
      c.fillStyle = colors[0]; c.fillRect(0, 0, size, size);
      for (let row = 0; row < 16; row++) for (let col = -1; col < 17; col++) {
        const x = col * 16 + row % 2 * 8, y = row * 16;
        c.fillStyle = colors[Math.floor(noise() * colors.length)]; c.fillRect(x, y, 15.5, 15.5);
        c.fillStyle = 'rgba(40,30,20,.18)'; c.fillRect(x, y + 14, 16, 2);
        c.fillStyle = 'rgba(255,239,207,.17)'; c.fillRect(x + 1, y, 1.5, 15);
      }
    });
  }
  const windowMaterials = Array.from({ length: 6 }, (_, i) => material('#ffffff', { map: facadeMap(city, i, mobile), metalness: i % 2 ? .13 : .06, roughness: historic ? .86 : .5 }));
  for (const value of windowMaterials) value.map.anisotropy = mobile ? 2 : 4;
  function bake(geometry, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, metric = false) {
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    rotation.setFromEuler(new THREE.Euler(rx, ry, rz)); position.set(x, y, z);
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, rotation, scale)); geometry.applyMatrix4(frame);
    if (metric && geometry.attributes.uv) {
      const p = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        if (ny > nx && ny > nz) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3);
        else if (nx > nz) uv.setXY(i, p.getZ(i) / 3, p.getY(i) / 3);
        else uv.setXY(i, p.getX(i) / 3, p.getY(i) / 3);
      }
    }
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(geometry);
  }
  function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) { bake(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz, !!mat.map && !windowMaterials.includes(mat)); }
  function cylinder(top, bottom, h, mat, x, y, z, segments = 16, rx = 0, ry = 0, rz = 0) { bake(new THREE.CylinderGeometry(top, bottom, h, segments), mat, x, y, z, rx, ry, rz); }
  function beam(a, b, width, mat = steel) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start), middle = start.clone().add(end).multiplyScalar(.5);
    const geo = new THREE.CylinderGeometry(width / 2, width / 2, direction.length(), mobile ? 5 : 8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())); bake(geo, mat, middle.x, middle.y, middle.z);
  }
  function setFrame(x, z, yaw = 0, y = groundHeight(x, z)) {
    frame = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), scale);
  }
  function roadFrame(s, side, offset) {
    const p = track.sample(s), x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
    setFrame(x, z, p.heading + (side > 0 ? 0 : Math.PI), p.y - .25); return p;
  }
  function clearFootprint(x, z, width, depth, yaw, extra = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const u of [-.5, 0, .5]) for (const v of [-.5, 0, .5]) {
      const px = x + u * width * c + v * depth * s, pz = z - u * width * s + v * depth * c;
      if (cityGroundLevel(city, px, pz) < 4 || track.nearest(px, pz).distance < track.wallOffset + extra) return false;
    }
    return !reserved.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + Math.hypot(width, depth) * .5);
  }
  function reserve(x, z, radius, name) { reserved.push({ x, z, radius, name }); }
  function panel(w, h, mat, x, y, z, ry = 0) { bake(new THREE.PlaneGeometry(w, h), mat, x, y, z, 0, ry); }
  function sign(title, subtitle, x, y, z, w = 8, color) {
    const mat = material('#ffffff', { map: signMap(title, subtitle, color), roughness: .78 });
    panel(w, w / 4, mat, x, y, z + .003); panel(w, w / 4, mat, x, y, z - .003, Math.PI); return mat;
  }
  function cornice(w, d, y, mat = stone, depth = .35) {
    for (const side of [-1, 1]) { box(w + depth * 2, .35, depth, mat, 0, y, side * (d + depth) / 2); box(depth, .35, d, mat, side * (w + depth) / 2, y, 0); }
  }
  function facade(w, h, d, mat, x = 0, y = h / 2, z = 0) {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    const values = [d, d, w, w, w, w];
    for (let face = 0; face < 6; face++) for (let vertex = 0; vertex < 4; vertex++) {
      const id = face * 4 + vertex; uv.setXY(id, uv.getX(id) * values[face] / (city === 'london' ? 14 : 8), uv.getY(id) * (face === 2 || face === 3 ? d / 28 : h / 28));
    }
    bake(geo, mat, x, y, z);
  }
  function pitchedRoof(w, d, y, rise, mansard = false) {
    const shape = new THREE.Shape(); shape.moveTo(-d / 2 - .5, 0);
    if (mansard) { shape.lineTo(-d * .3, rise * .9); shape.lineTo(-d * .23, rise); shape.lineTo(d * .23, rise); shape.lineTo(d * .3, rise * .9); }
    else shape.lineTo(0, rise);
    shape.lineTo(d / 2 + .5, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: w + 1, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateY(Math.PI / 2); geometry.translate(-(w + 1) / 2, y, 0); bake(geometry, roof, 0, 0, 0, 0, 0, 0, true);
  }
  function tree(x, z, height = 9, palm = false) {
    setFrame(x, z); cylinder(.16, .29, height * .69, bark, 0, height * .345, 0, 7);
    if (palm) {
      for (let i = 0; i < 11; i++) {
        const angle = i / 11 * TAU, length = 3.6 + rand() * 1.7;
        beam([0, height * .72, 0], [Math.sin(angle) * length, height * .72 + .15, Math.cos(angle) * length], .14, palmLeaf);
        for (let j = 0; j < 5; j++) {
          const t = (j + 1) / 6, px = Math.sin(angle) * length * t, pz = Math.cos(angle) * length * t;
          for (const side of [-1, 1]) beam([px, height * .72 + Math.sin(t * Math.PI) * .5, pz], [px + Math.cos(angle) * side * .8, height * .72 - .5 - t * .8, pz - Math.sin(angle) * side * .8], .11, palmLeaf);
        }
      }
    } else {
      for (let i = 0; i < (mobile ? 7 : 10); i++) {
        const angle = rand() * TAU, radius = 1.2 + rand() * 1.7, y = height * (.58 + rand() * .33);
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        beam([0, height * .43, 0], [x, y, z], .15, bark);
        for (let card = 0; card < 3; card++) bake(new THREE.PlaneGeometry(4 + rand() * .9, 4.5 + rand() * .8), leaf, x, y, z, (rand() - .5) * .7, card / 3 * Math.PI + angle, (rand() - .5) * .5);
      }
    }
    box(2.2, .45, 2.2, stone, 0, .225, 0);
  }

  if (city === 'taipei') {
    const x = -55, z = 90; reserve(x, z, 91, 'Taipei 101'); setFrame(x, z);
    box(126, 18, 94, stone, 0, 9, 0); facade(112, 12, 86, windowMaterials[4], 0, 18, 0);
    box(132, .8, 100, steel, 0, 24.5, 0);
    cylinder(43, 49, 68, glass, 0, 58, 0, 4, 0, Math.PI / 4);
    for (let tier = 0; tier < 8; tier++) {
      const base = 92 + tier * 36;
      cylinder(39, 33, 34.5, glass, 0, base + 17.25, 0, 4, 0, Math.PI / 4);
      cylinder(40, 40, 1.5, steel, 0, base + 35, 0, 4, 0, Math.PI / 4);
      for (let floor = 0; floor < 8; floor++) {
        const y = base + 2 + floor * 4.1, side = (33 + (y - base) / 34.5 * 6) * Math.SQRT2;
        cornice(side, side, y, steel, .16);
      }
      for (const side of [-1, 1]) for (const axis of [-1, 1]) {
        beam([side * 23.3, base, axis * 23.3], [side * 27.6, base + 34, axis * 27.6], .8, steel);
        cylinder(2.3, 2.3, 1.2, gold, side * 28, base + 32, axis * 28, 12, Math.PI / 2);
      }
    }
    cylinder(22.5, 26, 54, glass, 0, 407, 0, 4, 0, Math.PI / 4);
    cylinder(16, 22.5, 30, steel, 0, 449, 0, 4, 0, Math.PI / 4);
    cylinder(2.2, 16, 24, glass, 0, 476, 0, 4, 0, Math.PI / 4);
    cylinder(.6, 2.1, 20, steel, 0, 498, 0, 12);
    for (let y = 28; y < 89; y += 4.1) cornice(66, 66, y, steel, .13);
    sign('TAIPEI 101', '台北 101・信義商圈', 0, 12, -47.1, 30, '#164c43');
    setFrame(-147, -80); box(82, 33, 70, stone, 0, 16.5, 0); facade(80, 18, 68, windowMaterials[2], 0, 24, 0);
    for (let col = -4; col <= 4; col++) box(1, 15, 1, stone, col * 8, 7.5, -35.2);
    sign('信義商圈', 'XINYI DISTRICT', 0, 10, -35.5, 19, '#425551'); reserve(-147, -80, 60, 'Xinyi podium');
  } else if (city === 'kualalumpur') {
    const x = -55, z = 95; reserve(x, z, 120, 'Petronas KLCC'); setFrame(x, z);
    box(154, 25, 118, stone, 0, 12.5, 0); facade(147, 19, 113, windowMaterials[0], 0, 26.5, 0);
    for (const center of [-48, 48]) {
      let bottom = 31;
      for (const [h, radius] of [[147, 27], [92, 24], [58, 20], [40, 16], [26, 12]]) {
        const shape = new THREE.Shape();
        for (let i = 0; i < 16; i++) { const angle = i / 16 * TAU, r = radius * (i % 2 ? .78 : 1); if (i) shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r); else shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); }
        shape.closePath(); const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 }); geo.rotateX(-Math.PI / 2);
        bake(geo, glass, center, bottom, 0);
        for (let y = bottom; y < bottom + h; y += 4.1) cylinder(radius + .22, radius + .22, .5, steel, center, y, 0, 16);
        for (let i = 0; i < 8; i++) { const angle = i / 8 * TAU; beam([center + Math.cos(angle) * radius, bottom, Math.sin(angle) * radius], [center + Math.cos(angle) * radius, bottom + h, Math.sin(angle) * radius], .45, steel); }
        bottom += h;
      }
      cylinder(6, 12, 18, steel, center, 403, 0, 16); cylinder(2.5, 6, 15, steel, center, 419.5, 0, 16);
      cylinder(.3, 2.5, 25, steel, center, 439.5, 0, 12);
    }
    box(58.4, 7.5, 7, glass, 0, 173.75, 0); box(61, .7, 8.3, steel, 0, 178, 0); box(61, .7, 8.3, steel, 0, 170, 0);
    for (const side of [-1, 1]) { beam([side * 38, 132, 0], [side * 14, 170, 0], 1.5); beam([side * 38, 132, 0], [side * 15, 170, 0], .55); }
    for (let i = -27; i <= 27; i += 3.5) box(.15, 7, 7.1, steel, i, 174, 0);
    sign('SURIA KLCC', 'KUALA LUMPUR CITY CENTRE', 0, 18, -59.2, 33, '#355449');
    setFrame(100, -20); cylinder(21, 24, 1.2, stone, 0, .6, 0, 48);
    cylinder(20, 20, .15, material('#77aaa9', { metalness: .22, roughness: .24 }), 0, 1.25, 0, 48);
    for (let i = 0; i < 15; i++) { const angle = i / 15 * TAU; cylinder(.08, .11, 2.2 + Math.sin(angle * 3) * .4, white, Math.cos(angle) * 11, 2, Math.sin(angle) * 11, 5); }
    reserve(100, -20, 27, 'KLCC fountain');
    setFrame(-515, 145); cylinder(3.8, 5, 275, stone, 0, 137.5, 0, 16);
    cylinder(24, 28, 23, glass, 0, 290, 0, 32); cylinder(12, 24, 24, steel, 0, 313.5, 0, 24);
    cylinder(.7, 8, 65, steel, 0, 358, 0, 16); cylinder(.3, .7, 30, steel, 0, 406, 0, 10);
    reserve(-515, 145, 40, 'KL Tower');
  } else if (city === 'kobe') {
    const x = -60, z = -110; reserve(x, z, 33, 'Kobe Port Tower'); setFrame(x, z);
    cylinder(13, 14, 6, stone, 0, 3, 0, 24);
    const levels = 14, sides = 16;
    for (let row = 0; row < levels; row++) for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, next = (side + 1) / sides * TAU;
      const y = 6 + row * 6, yy = 6 + (row + 1) * 6;
      const radius = 7.7 + Math.pow((row - 7) / 7, 2) * 6.3, rr = 7.7 + Math.pow((row + 1 - 7) / 7, 2) * 6.3;
      beam([Math.cos(angle) * radius, y, Math.sin(angle) * radius], [Math.cos(next) * rr, yy, Math.sin(next) * rr], .48, red);
      beam([Math.cos(next) * radius, y, Math.sin(next) * radius], [Math.cos(angle) * rr, yy, Math.sin(angle) * rr], .48, red);
      beam([Math.cos(angle) * radius, y, Math.sin(angle) * radius], [Math.cos(next) * radius, y, Math.sin(next) * radius], .3, red);
    }
    cylinder(13, 15, 14, glass, 0, 97, 0, 32); cylinder(15.6, 15.6, 1, red, 0, 90, 0, 32);
    for (let i = 0; i < 32; i++) { const angle = i / 32 * TAU; beam([Math.cos(angle) * 14, 90, Math.sin(angle) * 14], [Math.cos(angle) * 13, 104, Math.sin(angle) * 13], .3, red); }
    cylinder(14, 15.4, 2, red, 0, 105, 0, 32); cylinder(13.5, 14, 2, white, 0, 107, 0, 32);
    sign('KOBE', 'PORT TOWER', 0, 101.5, -14.2, 16, '#af322b');
    setFrame(68, -140); reserve(68, -140, 64, 'Kobe Maritime Museum');
    box(94, 8, 64, white, 0, 4, 0); facade(91, 6, 62, windowMaterials[1], 0, 6, 0);
    for (let rib = 0; rib <= 12; rib++) {
      const z = -29 + rib * 4.8;
      for (let step = 0; step < 13; step++) {
        const u = step / 13, v = (step + 1) / 13;
        const roofY = t => 10 + Math.pow(Math.abs(t * 2 - 1), 1.6) * 28 + t * 8 + Math.cos(rib / 12 * TAU) * 4;
        const y = roofY(u), yy = roofY(v);
        beam([-46 + u * 92, y, z], [-46 + v * 92, yy, z], .32, white);
        if (rib < 12) { beam([-46 + u * 92, y, z], [-46 + v * 92, yy, z + 4.8], .18, white); beam([-46 + u * 92, y, z], [-46 + u * 92, y, z + 4.8], .22, white); }
      }
    }
    sign('神戸海洋博物館', 'KOBE MARITIME MUSEUM', 0, 5, -32.2, 31, '#56747c');
    setFrame(180, -130); reserve(180, -130, 62, 'Harbor hotel');
    for (let level = 0; level < 19; level++) { const length = 94 - Math.pow(level / 18, 1.65) * 58; box(36, 3, length, white, 0, 2 + level * 3.3, 0); box(36.5, .35, length + .7, steel, 0, 3.6 + level * 3.3, 0); facade(34, 2.7, length - 1, windowMaterials[1], 0, 2 + level * 3.3, 0); }
  } else if (city === 'london') {
    const x = -150, z = -50; reserve(x, z, 124, 'Palace of Westminster'); setFrame(x, z);
    box(46, 29, 182, stone, 0, 14.5, 35); box(49, 1.3, 187, stone, 0, 29.5, 35);
    box(48, 8, 179, roof, 0, 33.5, 35);
    for (let i = 0; i < 29; i++) {
      const zz = -52 + i * 6.25;
      for (const side of [-1, 1]) {
        box(.6, 30.5, .8, stone, side * 23.5, 16, zz);
        for (const y of [9, 18.2, 26]) box(.12, 5.7, 2.7, darkGlass, side * 23.62, y, zz + 2.4);
        cylinder(0, .8, 4.5, stone, side * 24, 33.4, zz, 4, 0, Math.PI / 4);
      }
    }
    box(14, 60, 14, stone, 0, 30, -62);
    for (let level = 0; level < 10; level++) cornice(14, 14, 4 + level * 5.5, stone, .25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(1.6, 73, 1.6, stone, sx * 6.3, 36.5, -62 + sz * 6.3); cylinder(0, 1.45, 8, gold, sx * 6.3, 78, -62 + sz * 6.3, 4, 0, Math.PI / 4); }
    box(14.5, 13.5, 14.5, stone, 0, 67, -62);
    const clockMat = material('#ffffff', { map: clockMap(), roughness: .55 });
    for (const side of [-1, 1]) { panel(7.4, 7.4, clockMat, 0, 67, -62 + side * 7.31, side < 0 ? Math.PI : 0); panel(7.4, 7.4, clockMat, side * 7.31, 67, -62, side * Math.PI / 2); }
    box(12, 8.5, 12, stone, 0, 78, -62);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.5, 8.8, .5, gold, sx * 5.9, 78, -62 + sz * 5.9);
    cylinder(1.4, 9.3, 12.5, roof, 0, 88.5, -62, 4, 0, Math.PI / 4); cylinder(.14, 1, 2.25, gold, 0, 95, -62, 8);
    for (let i = 0; i < 7; i++) { box(12 - i * 1.5, .25, 12 - i * 1.5, gold, 0, 82.7 + i * 1.6, -62); }
    sign('WESTMINSTER', 'HOUSES OF PARLIAMENT', 0, 4, -56.3, 11, '#3e4543');
    setFrame(-150, 165); box(18, 58, 18, stone, 0, 29, 0); cylinder(0, 13, 17, roof, 0, 66.5, 0, 4, 0, Math.PI / 4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(3, 70, 3, stone, sx * 8, 35, sz * 8); cylinder(0, 2.2, 7, stone, sx * 8, 73, sz * 8, 4); }
    const eyeX = 500, eyeZ = 10; reserve(eyeX, eyeZ, 77, 'London Eye'); setFrame(eyeX, eyeZ, -.12);
    const radius = 61, centerY = 72;
    for (const side of [-1, 1]) { const torus = new THREE.TorusGeometry(radius, .55, mobile ? 5 : 8, mobile ? 96 : 128); bake(torus, white, 0, centerY, side * 2); }
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * TAU, px = Math.sin(angle) * radius, py = centerY + Math.cos(angle) * radius;
      beam([0, centerY, -3], [px, py, -2], .15, steel); beam([0, centerY, 3], [px, py, 2], .15, steel);
      const capsule = new THREE.SphereGeometry(1, mobile ? 10 : 16, mobile ? 6 : 8); capsule.scale(3.8, 2.3, 2.1); bake(capsule, glass, px, py, 0);
      bake(new THREE.TorusGeometry(2.25, .16, 5, 16), white, px, py, 0, Math.PI / 2);
    }
    for (const side of [-1, 1]) { beam([side * 27, 0, -28], [0, centerY, 0], 2.3, white); beam([side * 22, 0, 22], [0, centerY, 0], 1.8, white); }
    cylinder(3, 3, 10, steel, 0, centerY, 0, 16, Math.PI / 2);
    setFrame(510, 130); box(95, 24, 49, stone, 0, 12, 0); facade(92, 20, 47, windowMaterials[1], 0, 15, 0); box(97, 2, 51, roof, 0, 25, 0);
    reserve(510, 130, 68, 'South Bank facade');
  }

  const extra = addExtraCityLandmarks({ scene, track, mobile, groundHeight, materials });
  reserved.push(...(extra.reserved || []));
  // Preserve narrow sightlines rather than clearing whole districts around monuments.
  const vistas = { taipei: [[-55, 90]], kualalumpur: [[-55, 95]], kobe: [[-60, -110]], london: [[-150, -112]], sydney: [[-485, 25]], sanfrancisco: [[-480, 510]], vancouver: [[-485, 25]] }[city] || [];
  if (city === 'melbourne') { const station = extra.reserved?.find(item => item.name === 'Flinders Street Station'); if (station) vistas.push([station.x, station.z]); }
  for (const [x, z] of vistas) {
    const distance = Math.hypot(x - track.spawn.x, z - track.spawn.z);
    for (let along = 20; along < distance; along += 23) reserve(track.spawn.x + (x - track.spawn.x) * along / distance, track.spawn.z + (z - track.spawn.z) * along / distance, 12, 'Landmark sightline');
  }

  const shops = {
    taipei: [['信義路', 'XINYI ROAD'], ['松仁路', 'SONGREN ROAD'], ['市府路', 'CITY HALL'], ['台北市', 'TAIPEI CITY']],
    kualalumpur: [['JALAN AMPANG', 'KLCC'], ['JALAN P. RAMLEE', 'KUALA LUMPUR'], ['PERSIARAN KLCC', 'CITY CENTRE'], ['JALAN SULTAN ISMAIL', 'BUKIT BINTANG']],
    kobe: [['メリケンパーク', 'MERIKEN PARK'], ['ハーバーランド', 'HARBORLAND'], ['神戸港', 'PORT OF KOBE'], ['海岸通', 'KAIGAN DORI']],
    london: [['WESTMINSTER', 'CITY OF LONDON'], ['VICTORIA EMBANKMENT', 'RIVER THAMES'], ['PARLIAMENT SQUARE', 'WESTMINSTER'], ['SOUTH BANK', 'WATERLOO']],
    sydney: [['CIRCULAR QUAY', 'SYDNEY HARBOUR'], ['GEORGE STREET', 'THE ROCKS'], ['BENNELONG POINT', 'OPERA HOUSE'], ['HICKSON ROAD', 'DAWES POINT']],
    goldcoast: [['SURFERS PARADISE', 'GOLD COAST'], ['THE ESPLANADE', 'BEACHFRONT'], ['CAVILL AVENUE', 'SURFERS PARADISE'], ['SURF PARADE', 'QUEENSLAND']],
    melbourne: [['FLINDERS STREET', 'MELBOURNE'], ['SWANSTON STREET', 'CITY CENTRE'], ['SOUTHBANK', 'YARRA RIVER'], ['FEDERATION SQUARE', 'FLINDERS STREET']],
    paris: [['QUAI BRANLY', 'PARIS'], ['CHAMP DE MARS', 'TOUR EIFFEL'], ['PONT D’IÉNA', 'LA SEINE'], ['AVENUE DE SUFFREN', 'PARIS VII']],
    prague: [['KARLŮV MOST', 'CHARLES BRIDGE'], ['STARÉ MĚSTO', 'OLD TOWN'], ['MALÁ STRANA', 'PRAGUE'], ['NÁBŘEŽÍ', 'VLTAVA']],
    newcastle: [['QUAYSIDE', 'NEWCASTLE UPON TYNE'], ['GATESHEAD', 'TYNE BRIDGE'], ['MILLENNIUM BRIDGE', 'RIVER TYNE'], ['GREY STREET', 'NEWCASTLE']],
    sanfrancisco: [['MARINA BOULEVARD', 'SAN FRANCISCO'], ['GOLDEN GATE', 'PACIFIC COAST'], ['LOMBARD STREET', 'NORTH BEACH'], ['PRESIDIO', 'CALIFORNIA']],
    newyork: [['BROADWAY', 'MANHATTAN'], ['5TH AVENUE', 'NEW YORK'], ['BROOKLYN BRIDGE', 'EAST RIVER'], ['CENTRAL PARK', 'MIDTOWN']],
    vancouver: [['CANADA PLACE', 'VANCOUVER'], ['COAL HARBOUR', 'BURRARD INLET'], ['WEST CORDOVA ST', 'DOWNTOWN'], ['STANLEY PARK', 'BRITISH COLUMBIA']],
    hanoi: [['HỒ HOÀN KIẾM', 'HOAN KIEM LAKE'], ['PHỐ HÀNG ĐÀO', 'OLD QUARTER'], ['TRÀNG TIỀN', 'HANOI'], ['NHÀ HÁT LỚN', 'OPERA HOUSE']],
    lisbon: [['AVENIDA DA ÍNDIA', 'LISBOA'], ['BELÉM', 'RIO TEJO'], ['ALFAMA', 'ELÉCTRICO 28'], ['PRAÇA DO COMÉRCIO', 'LISBON']],
    marseille: [['VIEUX PORT', 'MARSEILLE'], ['QUAI DU PORT', 'PROVENCE'], ['LA CANEBIÈRE', 'CENTRE VILLE'], ['NOTRE DAME', 'LA GARDE']],
    nice: [['PROMENADE DES ANGLAIS', 'NICE'], ['BAIE DES ANGES', 'CÔTE D’AZUR'], ['LE NEGRESCO', 'LA PROMENADE'], ['PLACE MASSÉNA', 'VIEUX NICE']],
    warwick: [['CASTLE LANE', 'WARWICK'], ['HIGH STREET', 'OLD TOWN'], ['RIVER AVON', 'CASTLE BRIDGE'], ['SMITH STREET', 'WARWICKSHIRE']],
    bangkok: [['ถนนเจริญกรุง', 'CHAROEN KRUNG ROAD'], ['วัดอรุณ', 'WAT ARUN'], ['แม่น้ำเจ้าพระยา', 'CHAO PHRAYA RIVER'], ['ถนนมหาราช', 'MAHA RAT ROAD']],
  }[city];
  const roadSigns = shops.map(([title, sub]) => material('#ffffff', { map: signMap(title, sub, city === 'london' ? '#e4e2d6' : '#1a594b'), roughness: .85 }));
  if (city === 'london') for (const mat of roadSigns) { mat.map.dispose(); mat.map = signMap(shops[roadSigns.indexOf(mat)][0], shops[roadSigns.indexOf(mat)][1], '#3e4e4f'); }
  const shopSigns = shops.map(([title, sub], i) => material('#ffffff', { map: signMap(title, sub, ['#455c59', '#6c685a', '#725349', '#516c78'][i]), roughness: .88 }));
  function building(x, z, w, h, d, yaw, index, near = false) {
    if (cityGroundLevel(city, x, z) < 4 || !clearFootprint(x, z, w, d, yaw, 3)) return false;
    setFrame(x, z, yaw); footprints.push({ x, z, w, d, yaw });
    box(w + 2, .7, d + 2, stone, 0, -.05, 0);
    box(w + 4, .07, d + 4, paving, 0, .035, 0);
    const mat = windowMaterials[index % 6], profile = historic || near ? 0 : index % 4;
    if (profile === 1 && h > 55) {
      const lower = h * .24, upper = h - lower;
      facade(w, lower, d, mat); facade(w * .78, upper, d * .76, mat, 0, lower + upper / 2, 0);
      cornice(w, d, lower + .2, stone, .5); cornice(w * .78, d * .76, h + .3, steel, .2);
    } else if (profile === 2 && h > 70) {
      const lower = h * .56, middle = h * .29, top = h - lower - middle;
      facade(w, lower, d, mat); facade(w * .8, middle, d * .86, mat, 0, lower + middle / 2, 0);
      facade(w * .58, top, d * .66, mat, 0, lower + middle + top / 2, 0);
      for (const [ww, dd, yy] of [[w, d, lower], [w * .8, d * .86, lower + middle], [w * .58, d * .66, h]]) cornice(ww, dd, yy + .2, stone, .3);
    } else { facade(w, h, d, mat); cornice(w, d, h + .3, stone, .45); }
    const roofRise = historic ? city === 'warwick' ? 4.6 + d * .05 : ['prague', 'lisbon'].includes(city) ? 5.5 : 3.8 : 0;
    if (historic) {
      pitchedRoof(w, d, h + .5, roofRise, ['paris', 'nice', 'sanfrancisco'].includes(city));
      if (near && ['paris', 'nice', 'sanfrancisco'].includes(city)) for (let xx = -w * .36; xx <= w * .37; xx += 6.3) {
        box(2.5, 2.5, 2.7, stone, xx, h + 2, -d * .37);
        box(1.4, 1.8, .06, darkGlass, xx, h + 2, -d * .37 - 1.38);
        box(2.8, .3, 3, roof, xx, h + 3.4, -d * .37, -.13);
      }
      if (city === 'warwick' && near) {
        for (const side of [-1, 1]) { beam([side * w / 2, h + .6, -d / 2], [side * w / 2, h + roofRise + .5, 0], .24, charcoal); beam([side * w / 2, h + roofRise + .5, 0], [side * w / 2, h + .6, d / 2], .24, charcoal); }
      }
    } else {
      const upperW = profile === 1 && h > 55 ? w * .78 : profile === 2 && h > 70 ? w * .58 : w;
      const upperD = profile === 1 && h > 55 ? d * .76 : profile === 2 && h > 70 ? d * .66 : d;
      box(upperW - .7, .4, upperD - .7, roof, 0, h + .8, 0);
      if (h > 32) { box(upperW * .32, 2.3, upperD * .27, stone, 0, h + 1.8, 0); box(3, 1.7, 4, steel, upperW * .26, h + 1.6, upperD * .24); }
      if (profile === 3 && h > 65) {
        for (const xx of [-w * .39, w * .39]) box(.45, h, .35, steel, xx, h / 2, -d / 2 - .2);
        for (let level = 9; level < h; level += 12) box(w + .25, .25, d + .25, charcoal, 0, level, 0);
      }
    }
    if (near) {
      const arcade = city === 'taipei' || city === 'kobe';
      if (arcade) box(w + 2, .55, 4.8, stone, 0, 4.4, -d / 2 - 1.6);
      else {
        const awning = index % 2 ? roof : red;
        box(Math.min(w - 1, 17), .13, 2.8, awning, 0, 3.15, -d / 2 - 1.2, -.15);
        box(Math.min(w - 1, 17), .38, .1, awning, 0, 2.86, -d / 2 - 2.52);
        for (const side of [-1, 1]) beam([side * Math.min(w / 2 - 1, 8), 2.62, -d / 2 - .1], [side * Math.min(w / 2 - 1, 8), 2.96, -d / 2 - 2.45], .055, charcoal);
      }
      for (let i = -Math.floor(w / 9) / 2; i <= Math.floor(w / 9) / 2; i++) {
        const xx = i * 7.7; box(5.8, 3.2, .09, darkGlass, xx, 1.9, -d / 2 - .06);
        box(.12, 3.3, .16, steel, xx, 1.9, -d / 2 - .16);
        if (arcade) box(.6, 4.5, .6, stone, xx + 3.65, 2.2, -d / 2 - 3.4);
      }
      panel(Math.min(14, w - 3), 1.55, shopSigns[index % 4], 0, 3.4, -d / 2 - .2, Math.PI);
      for (let level = 1; level < Math.min(6, h / 5); level++) {
        const y = 5.5 + level * 3.4;
        if (['london', 'newcastle', 'paris'].includes(city)) {
          box(w + .5, .24, .7, stone, 0, y, -d / 2 -.2);
          for (let i = -w * .4; i < w * .4; i += 5) { box(3, .4, .5, stone, i, y + 2.7, -d / 2 - .2); box(.25, 2.3, .25, stone, i - 1.4, y + 1.35, -d / 2 - .17); }
        }
        if ((city === 'paris' && (level === 1 || level === 4)) || index % 3 === 2) {
          for (let i = -w * .35; i < w * .36; i += 7) { box(5, .25, 1.8, stone, i, y, -d / 2 - .5); box(5, .08, .08, steel, i, y + 1, -d / 2 - 1.3); for (let k = -2; k <= 2; k++) box(.05, 1, .05, steel, i + k, y + .5, -d / 2 - 1.3); }
        }
      }
      if (['london', 'newcastle', 'paris', 'warwick'].includes(city)) for (let i = -w / 3; i < w / 2; i += 9) { box(1.3, 2.6, 1.1, stone, i, h + roofRise + .6, 0); cylinder(.18, .2, .65, red, i, h + roofRise + 2.2, 0, 7); }
    }
    return true;
  }
  for (let s = 25, index = 0; s < track.length; s += 76, index++) for (const side of [-1, 1]) {
    const p = track.sample(s), compact = ['hanoi', 'warwick'].includes(city), w = compact ? 13 + rand() * (city === 'hanoi' ? 7 : 13) : 30 + rand() * 15, d = compact ? 15 + rand() * 8 : 23 + rand() * 11;
    const offset = track.wallOffset + 7 + d * .5;
    const x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
    const yaw = p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const height = city === 'warwick' ? 9 + rand() * 10 : city === 'hanoi' ? 10 + rand() * 10 : city === 'newcastle' ? 15 + rand() * 10 : historic ? 17 + rand() * 15 : city === 'kobe' ? 18 + rand() * 40 : 26 + rand() * 87;
    building(x, z, w, height, d, yaw, index + (side > 0 ? 1 : 0), true);
  }
  for (let x = -770; x <= 770; x += 86) for (let z = -700; z <= 730; z += 97) {
    const xx = x + (rand() - .5) * 20, zz = z + (rand() - .5) * 20, near = track.nearest(xx, zz);
    if (near.distance < 115 || (city === 'kobe' && zz < -360) || (city === 'london' && xx > 90 && xx < 360)) continue;
    if (xx > -265 && xx < 260 && zz > -265 && zz < 270) continue;
    const oldTown = ['paris', 'prague', 'lisbon', 'nice', 'marseille', 'newcastle'].includes(city);
    const height = city === 'warwick' ? 10 + rand() * 12 : city === 'hanoi' ? 12 + rand() * 14 : oldTown ? 16 + rand() * 17 : historic ? 18 + rand() * 29 : city === 'kobe' ? 25 + rand() * 74 : 38 + rand() * 163;
    building(xx, zz, city === 'hanoi' ? 15 + rand() * 14 : 34 + rand() * 29, height, city === 'hanoi' ? 16 + rand() * 9 : 26 + rand() * 28, 0, Math.floor(rand() * 6));
  }

  // Continuous raised sidewalks, correctly spaced lamps, bilingual route signs and closed-course crosswalks.
  for (let s = 0; s < track.length; s += 8) for (const side of [-1, 1]) {
    const p = track.sample(s), q = track.sample(s + 8), from = new THREE.Vector3(p.x + p.nx * side * (track.wallOffset + 3.2), p.y - .05, p.z + p.nz * side * (track.wallOffset + 3.2));
    const to = new THREE.Vector3(q.x + q.nx * side * (track.wallOffset + 3.2), q.y - .05, q.z + q.nz * side * (track.wallOffset + 3.2));
    const dir = to.clone().sub(from), middle = to.add(from).multiplyScalar(.5);
    frame.identity(); box(5.2, .3, dir.length() + .12, paving, middle.x, middle.y, middle.z, 0, Math.atan2(dir.x, dir.z));
  }
  for (let s = 18, index = 0; s < track.length; s += 45, index++) for (const side of [-1, 1]) {
    roadFrame(s, side, track.wallOffset + 3.5);
    cylinder(.07, .13, city === 'london' ? 6.2 : 8.5, charcoal, 0, city === 'london' ? 3.1 : 4.25, 0, 7);
    if (city === 'london') {
      box(.52, .6, .52, charcoal, 0, 6.5, 0); box(.37, .4, .37, white, 0, 6.47, 0); cylinder(0, .38, .45, charcoal, 0, 6.97, 0, 4, 0, Math.PI / 4);
    } else { beam([0, 8.5, 0], [-2.7, 8.25, 0], .11, steel); box(1, .14, .42, steel, -2.45, 8.17, 0); box(.76, .03, .29, white, -2.48, 8.07, 0); }
    if (index % 6 === 0) {
      const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2, mat = roadSigns[Math.floor(index / 6) % 4];
      panel(5.4, 1.35, mat, Math.sin(yaw) * .004, 4.5, .05, yaw);
      panel(5.4, 1.35, mat, -Math.sin(yaw) * .004, 4.5, .05, yaw + Math.PI);
    }
    if (index % 3 === 0) {
      const p = track.sample(s + 14), x = p.x + p.nx * (track.wallOffset + 7.4) * side, z = p.z + p.nz * (track.wallOffset + 7.4) * side;
      if (!reserved.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + 5) && !footprints.some(b => Math.hypot(x - b.x, z - b.z) < Math.hypot(b.w, b.d) * .53)) tree(x, z, 7 + rand() * 4, ['kualalumpur', 'bangkok', 'goldcoast', 'nice', 'marseille'].includes(city));
    }
  }
  for (let s = 4; s < track.length; s += 14) {
    const p = track.sample(s); setFrame(p.x, p.z, p.heading, p.y + .061);
    box(.16, .008, 6, roadPaint, city === 'taipei' ? -.14 : 0, 0, 0);
    if (city === 'taipei') box(.16, .008, 6, roadPaint, .14, 0, 0);
  }
  for (const ratio of [.10, .31, .6, .83]) {
    const p = track.sample(track.length * ratio); if (Math.abs(p.curvature) > .006) continue;
    setFrame(p.x, p.z, p.heading, p.y + .063);
    for (let x = -track.width / 2 + 1; x <= track.width / 2 - 1; x += 1.25) box(.7, .012, 4.5, roadPaint, x, 0, 0);
    for (const side of [-1, 1]) {
      cylinder(.07, .11, 6, charcoal, side * (track.wallOffset + 1.8), 3, -4.2, 8);
      box(.28, 1.12, .31, charcoal, side * (track.wallOffset + 1.8), 4.5, -4.2);
      for (let lamp = 0; lamp < 3; lamp++) cylinder(.09, .09, .035, lamp === 0 ? red : lamp === 1 ? gold : signalGreen, side * (track.wallOffset + 1.8), 4.83 - lamp * .33, -4.385, 12, Math.PI / 2);
    }
  }
  function parkedVehicle(s, side, bus = false) {
    const p = track.sample(s), offset = track.wallOffset + 11.5;
    const x = p.x + p.nx * side * offset, z = p.z + p.nz * side * offset;
    if (!clearFootprint(x, z, bus ? 2.5 : 1.9, bus ? 11 : 4.7, p.heading, 2)) return;
    setFrame(x, z, p.heading); const color = city === 'taipei' ? gold : city === 'london' ? red : white;
    if (bus) {
      const double = city === 'london'; box(2.45, double ? 3.9 : 2.8, 10.8, color, 0, double ? 2.35 : 1.8, 0);
      box(2.5, .82, 8.9, darkGlass, 0, double ? 1.75 : 2.35, .5); if (double) box(2.5, .89, 10, darkGlass, 0, 3.58, .25);
      for (let i = -4; i <= 4; i += 1.25) box(2.52, double ? 3.25 : .86, .1, color, 0, double ? 2.35 : 2.4, i);
    } else { box(1.86, .72, 4.5, color, 0, .88, 0); box(1.57, .65, 2.25, darkGlass, 0, 1.5, -.3); box(1.65, .13, 2.5, color, 0, 1.88, -.3); if (city === 'taipei') box(.46, .15, .32, white, 0, 2.02, 0); }
    for (const xx of [-1, 1]) for (const zz of [-1, 1]) cylinder(bus ? .45 : .31, bus ? .45 : .31, .22, charcoal, xx * (bus ? 1.15 : .85), bus ? .49 : .38, zz * (bus ? 3.4 : 1.45), 12, 0, 0, Math.PI / 2);
  }
  for (let s = 160, index = 0; s < track.length; s += 330, index++) parkedVehicle(s, index % 2 ? 1 : -1, index % 3 === 0);

  if (city === 'kobe' || city === 'london') {
    frame.identity();
    const water = createCityWaterMaterial(city === 'kobe' ? '#548d9b' : '#6e8787');
    water.userData.cityWater = true; cityWater = water; ownedMaterials.add(water);
    const geo = new THREE.PlaneGeometry(city === 'kobe' ? 2000 : 255, city === 'kobe' ? 1050 : 1700); geo.rotateX(-Math.PI / 2);
    bake(geo, water, city === 'kobe' ? 0 : 229, city === 'kobe' ? 2 : 2.7, city === 'kobe' ? -910 : 0);
    if (city === 'kobe') {
      box(940, 3, 18, stone, 0, 2, -379);
      for (let x = -440; x < 450; x += 12) cylinder(.28, .38, 1, charcoal, x, 4, -383, 8);
      for (let ship = 0; ship < 3; ship++) {
        setFrame(-160 + ship * 193, -435, .18 + ship * .27, 2.4);
        cylinder(8, 11, 75, white, 0, 6, 0, 4, Math.PI / 2, Math.PI / 4); box(13, 7, 35, white, 0, 12, 5); facade(12, 5, 30, windowMaterials[1], 0, 14, 5);
        box(10, 2, 38, red, 0, 17, 6); cylinder(.12, .16, 9, steel, 0, 22, 1, 8);
      }
    } else {
      for (const x of [101, 357]) for (let z = -390; z <= 390; z += 7) {
        if (track.nearest(x, z).distance < track.wallOffset + 12) continue;
        setFrame(x, z, 0, 0); box(5, 3, 7.05, stone, 0, 2.25, 0);
        cylinder(.05, .06, 1.2, charcoal, 0, 4.35, 0, 6); box(.07, .07, 7.05, charcoal, 0, 4.95, 0);
      }
      for (const z of [-315, 320]) {
        setFrame(229, z, 0, 0); box(250, 3.1, 26, stone, 0, 2.1, 0);
        for (let x = -105; x <= 105; x += 42) { box(5, 3.6, 27, stone, x, .8, 0); beam([x - 20, 0, -13], [x, 3.2, -13], .65, steel); beam([x, 3.2, -13], [x + 20, 0, -13], .65, steel); }
      }
    }
  }
  // Low, continuous regional ridges keep the city grounded rather than floating on a plain.
  if (city === 'taipei' || city === 'kobe') {
    frame.identity(); const ridgeMat = material(city === 'kobe' ? '#647d70' : '#657b65', { roughness: 1 });
    const geo = new THREE.PlaneGeometry(2400, 550, 80, 10); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), edge = Math.max(0, 1 - Math.abs(z) / 275); p.setY(i, Math.max(0, (75 + 80 * Math.sin(x / 290) ** 2 + 47 * Math.sin(x / 108) ** 2) * edge)); }
    geo.computeVertexNormals(); bake(geo, ridgeMat, city === 'taipei' ? 1100 : 0, -10, city === 'taipei' ? 150 : 1050, 0, city === 'taipei' ? Math.PI / 2 : 0);
  }
  for (const [mat, pieces] of batches) {
    const geometry = mergeGeometries(pieces); pieces.forEach(piece => piece.dispose());
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = `${city}-architecture`; mesh.castShadow = mat !== leaf && mat !== roadPaint && !mat.userData.cityWater; mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Unused materials have no world traversal owner and are cleaned immediately.
  for (const mat of ownedMaterials) if (!batches.has(mat)) { mat.map?.dispose(); mat.dispose(); }
  group.userData.landmarks = reserved.map(({ name }) => name); group.userData.buildings = footprints;
  return { group, update(state, elapsed) { extra.update?.(state, elapsed); cityWater?.normalMap.offset.set(elapsed * .004, elapsed * .003); }, setQuality(level) { extra.setQuality?.(level); group.traverse(object => { if (object.isMesh) object.castShadow = level === 'high' && object.material !== leaf && object.material !== roadPaint && !object.material.userData.cityWater; }); } };
}
