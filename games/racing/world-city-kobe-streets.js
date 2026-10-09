import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js?v=city-drive-15';
import { cityDistrictAt, cityDistrictForPoint } from './world-city-districts.mjs?v=city-drive-15';

// Kaigan-dori's masonry offices sit alongside the separately authored port monuments.
export function addKobeStreets(options) {
  const { track, mobile, groundHeight, materials } = options, b = createCityBuilder(options);
  const stone = b.surface(materials.concrete, '#c9c3b4', { map: null });
  const clay = b.surface(materials.concrete, '#bfad8f', { map: null });
  const cream = b.surface(materials.concrete, '#d4d0c1', { map: null });
  const paving = b.surface(materials.concrete, '#aaa9a0');
  const steel = b.material('#565e5d', { roughness: .59, metalness: .42 });
  const glass = b.material('#526869', { roughness: .30, metalness: .20 });
  const dark = b.material('#343c3c', { roughness: .79 });
  const green = b.material('#5a755a', { roughness: .94 });
  const canvas = document.createElement('canvas'); canvas.width = mobile ? 512 : 1024; canvas.height = canvas.width / 2;
  const c = canvas.getContext('2d'), unit = canvas.width / 4;
  for (let tile = 0; tile < 8; tile++) {
    const x = tile % 4 * unit, y = Math.floor(tile / 4) * unit;
    c.save(); c.translate(x, y); c.fillStyle = tile < 4 ? '#c2b7a0' : '#32454a'; c.fillRect(0, 0, unit, unit);
    if (tile === 0 || tile === 1) {
      for (let row = 0; row < 9; row++) for (let col = 0; col < 4; col++) {
        c.fillStyle = ['#beb5a0', '#d0c9b8', '#c7baa1'][(row + col + tile) % 3]; c.fillRect((col - row % 2 * .5) * unit / 4 + 1, row * unit / 9 + 1, unit / 4 - 2, unit / 9 - 2);
      }
    } else if (tile === 2 || tile === 3) {
      c.fillStyle = '#4e676b'; c.fillRect(unit * .08, unit * .05, unit * .84, unit * .90);
      c.fillStyle = '#78908e'; c.fillRect(unit * .10, unit * .08, unit * .31, unit * .53);
      c.fillStyle = '#313f3e'; for (const xx of [.07, .48, .89]) c.fillRect(xx * unit, unit * .04, unit * .04, unit * .92);
      for (const yy of [.05, .63, .92]) c.fillRect(unit * .07, yy * unit, unit * .86, unit * .025);
    } else {
      c.fillStyle = ['#455f59', '#726147', '#8d7057', '#d0d0bd'][tile - 4]; c.fillRect(0, 0, unit, unit);
      c.fillStyle = tile === 7 ? '#3e585d' : '#f2ecda'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 ${unit * .18}px Arial, sans-serif`;
      c.fillText(['海岸珈琲', '港ベーカリー', '神戸の書店', '自動販売機'][tile - 4], unit / 2, unit * .38);
      c.font = `${unit * .085}px Arial, sans-serif`; c.fillText(['KAIGAN COFFEE', 'PORT BAKERY', 'KOBE BOOKS', 'DRINKS'][tile - 4], unit / 2, unit * .66);
      if (tile === 7) for (let col = 0; col < 6; col++) { c.fillStyle = ['#6f8596', '#b48470', '#728b67'][col % 3]; c.fillRect((.10 + col * .14) * unit, unit * .80, unit * .08, unit * .15); }
    }
    for (let mark = 0; mark < 90; mark++) { c.fillStyle = mark % 3 ? '#766c5421' : '#efe9d41c'; c.fillRect((mark * 43 + tile * 17) % unit, (mark * 73 + tile * 13) % unit, unit * .018, unit * .009); }
    c.restore();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const atlas = b.material('#ffffff', { map, roughness: .85 });
  function panel(tile, w, h, x, y, z, yaw = Math.PI) {
    const geometry = new THREE.PlaneGeometry(w, h), uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (tile % 4 + .004 + uv.getX(i) * .992) / 4, 1 - (Math.floor(tile / 4) + .004 + (1 - uv.getY(i)) * .992) / 2);
    b.bake(geometry, atlas, x, y, z, 0, yaw);
  }
  const footprints = [];
  function place(s, side, width, depth, name, heritage = false) {
    if (!heritage && cityDistrictAt(track, s, side)?.density === 0) return null;
    const p = track.sample(s), yaw = p.heading + side * Math.PI / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
    for (let attempt = 0; attempt < 12; attempt++) {
      const offset = track.wallOffset + depth / 2 + 7 + attempt * 3;
      const x = p.x + p.nx * side * offset, z = p.z + p.nz * side * offset;
      if (!heritage && cityDistrictForPoint(track, x, z)?.density === 0) continue;
      if (z < -345) continue;
      const blocked = track.samples.some(q => { const dx = q.x - x, dz = q.z - z; return Math.abs(dx * c - dz * sn) < width / 2 + track.wallOffset + 3 && Math.abs(dx * sn + dz * c) < depth / 2 + track.wallOffset + 3; });
      if (blocked || footprints.some(q => Math.hypot(q.x - x, q.z - z) < (q.width + width) / 2 + 6)) continue;
      const entry = { x, z, yaw, width, depth, name, heritage }; footprints.push(entry); b.reserve(x, z, Math.hypot(width, depth) / 2 + 5, name);
      b.setFrame(x, z, yaw, Math.max(groundHeight(x, z), p.y - .12)); return entry;
    }
    return null;
  }
  function window(w, h, x, y, z, side = 0) {
    const yaw = side ? side * Math.PI / 2 : Math.PI;
    if (side) b.box(.15, h + .20, w + .18, dark, x, y, z); else b.box(w + .18, h + .20, .15, dark, x, y, z);
    panel(2, w, h, x + (side ? side * .086 : 0), y, z + (side ? 0 : -.086), yaw);
  }
  function roundedOffice(width, depth, height, y, material, radius = 3.8) {
    const shape = new THREE.Shape(); shape.moveTo(width / 2, depth / 2); shape.lineTo(width / 2, -depth / 2); shape.lineTo(-width / 2, -depth / 2); shape.lineTo(-width / 2, depth / 2 - radius);
    shape.absarc(-width / 2 + radius, depth / 2 - radius, radius, Math.PI, Math.PI / 2, true); shape.lineTo(width / 2, depth / 2); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: mobile ? 12 : 20 }); geometry.rotateX(-Math.PI / 2); b.bake(geometry, material, 0, y, 0);
  }
  if (place(73, -1, 34, 23, 'Kaigan-dori Mitsui OSK masonry office', true)) {
    const w = 29, d = 18, front = -d / 2;
    b.box(w + 2, .22, d + 8, paving, 0, .05, -2.0);
    roundedOffice(w, d, 5.0, 0, stone); roundedOffice(w, d, 18.4, 5.0, clay); roundedOffice(w, d, 3.5, 23.45, cream);
    panel(0, w - 4.0, 4.8, 2.0, 2.5, front - .03);
    for (let bay = 0; bay < 8; bay++) {
      const x = -w / 2 + 2.0 + bay * 3.55;
      if (x < -w / 2 + 4.4) continue;
      for (let floor = 0; floor < 5; floor++) window(1.40, floor === 4 ? 1.9 : 2.50, x, 7.2 + floor * 4.05, front - .12);
      if (bay < 7) b.box(.39, 17.1, .34, cream, x + 1.68, 14.0, front - .12);
      b.box(1.6, 1.0, .12, clay, x, 9.2, front - .17); b.box(1.6, 1.0, .12, clay, x, 17.25, front - .17);
      window(1.35, 2.65, x, 2.9, front - .14);
    }
    for (const side of [-1, 1]) for (let bay = 0; bay < 4; bay++) {
      const z = -6.5 + bay * 4.2; if (side === -1 && z < front + 4.45) continue;
      for (let floor = 0; floor < 5; floor++) window(1.35, floor === 4 ? 1.9 : 2.5, side * (w / 2 + .12), 7.2 + floor * 4.05, z, side);
    }
    for (const [height, reach, thick] of [[5.15, .42, .40], [22.9, .85, .58], [23.55, .55, .24], [27.1, .50, .38]]) roundedOffice(w + reach * 2, d + reach * 2, thick, height - thick / 2, stone, 3.8 + reach);
    for (let dentil = 0; dentil < 27; dentil++) b.box(.27, .28, .49, cream, -w / 2 + 4.0 + dentil * (w - 4.0) / 26, 22.46, front - .43);
    const cornerX = -w / 2 + 3.8, cornerZ = front + 3.8;
    for (let floor = 0; floor < 5; floor++) for (let strip = 0; strip < 3; strip++) {
      const angle = Math.PI * (.56 + strip * .19), nx = Math.cos(angle), nz = -Math.sin(angle);
      panel(2, 1.08, floor === 4 ? 1.9 : 2.5, cornerX + nx * 3.86, 7.2 + floor * 4.05, cornerZ + nz * 3.86, Math.atan2(nx, nz));
    }
    const arch = new THREE.Shape(); arch.moveTo(-2.8, 0); arch.lineTo(-2.8, 1.0); arch.absarc(0, 1.0, 2.8, Math.PI, 0, true); arch.lineTo(2.8, 0); arch.closePath();
    const pediment = new THREE.ExtrudeGeometry(arch, { depth: .6, bevelEnabled: false, curveSegments: mobile ? 12 : 20 });
    b.bake(pediment, stone, cornerX - 2.70, 26.3, cornerZ - 2.70, 0, -Math.PI * .75);
    b.box(2.35, 2.9, .21, dark, cornerX - 2.78, 1.6, cornerZ - 2.78, 0, -Math.PI * .75);
    for (const x of [-6.0, 1.1, 8.2]) { b.cylinder(.37, .37, .10, stone, x, 21.50, front - .20, 14, Math.PI / 2); b.cylinder(.20, .20, .13, clay, x, 21.50, front - .25, 10, Math.PI / 2); }
  }
  if (place(174, 1, 28, 19, 'Kaigan-dori Chartered Building', true)) {
    const w = 24, d = 14, front = -d / 2;
    b.box(w + 2, .22, d + 7, paving, 0, .05, -1.5);
    b.box(w, 9.4, d - 1.5, cream, 0, 4.7, .75); b.box(w, 7.1, d, cream, 0, 13.25, 0);
    panel(1, w - .1, 9.2, 0, 4.7, front + 1.47);
    for (let bay = 0; bay < 7; bay++) {
      const x = -w / 2 + 1.65 + bay * 3.45;
      window(1.35, 6.05, x, 4.4, front + 1.29);
      for (const y of [11.4, 14.8]) window(1.35, 2.35, x, y, front - .05);
    }
    for (const x of [-5.5, -1.85, 1.85, 5.5]) {
      b.cylinder(.39, .50, 8.85, cream, x, 4.75, front - .47, mobile ? 12 : 18);
      b.box(1.18, .28, 1.15, stone, x, .40, front - .47); b.box(1.25, .40, 1.15, stone, x, 9.17, front - .47);
      for (const side of [-1, 1]) { b.cylinder(.23, .23, .13, stone, x + side * .44, 9.13, front - .91, 10, Math.PI / 2); b.cylinder(.105, .105, .15, clay, x + side * .44, 9.13, front - .99, 8, Math.PI / 2); }
    }
    for (const [y, reach, height] of [[9.65, .48, .47], [16.90, .39, .30], [17.30, .29, .19]]) b.box(w + reach * 2, height, d + reach * 2, stone, 0, y, 0);
    for (let notch = 0; notch < 28; notch++) b.box(.23, .17, .33, stone, -w / 2 + notch * w / 27, 9.33, front - .20);
    b.box(w + .15, .65, .20, cream, 0, 17.72, front + .07);
  }
  for (const [s, side, index] of [[130, -1, 4], [233, 1, 5], [292, -1, 0], [track.length * .26, 1, 1], [track.length * .56, -1, 2], [track.length * .78, 1, 3]]) {
    if (!place(s, side, 23, 13, `Kobe local coffee and office block ${index}`)) continue;
    b.box(22, .19, 19, paving, 0, .045, -1.5);
    for (let bay = 0; bay < 3; bay++) {
      const x = (bay - 1) * 6.8, h = 9.5 + (bay + index) % 3 * 3.1, wall = (bay + index) % 2 ? cream : stone;
      b.box(6.6, h - 3.0, 11, wall, x, (h + 3) / 2, 0); b.box(6.6, 3.0, 9.5, wall, x, 1.5, .75);
      b.box(6.0, 2.55, .1, glass, x, 1.4, -4.8); b.box(6.3, .78, .18, dark, x, 2.93, -5.60); panel(4 + (bay + index) % 3, 6.12, .66, x, 2.93, -5.71);
      for (const side of [-1, 1]) b.box(.17, 2.8, .60, steel, x + side * 3.14, 1.40, -5.21);
      for (let floor = 0; floor < (h - 3.5) / 3.1; floor++) for (const side of [-1, 1]) window(1.73, 1.95, x + side * 1.72, 5 + floor * 3.1, -5.57);
      b.box(6.8, .19, 11.2, steel, x, h + .1, 0); b.box(.9, .62, .44, cream, x + 2.0, 4.0, -5.79);
    }
    b.box(.87, 1.85, .70, cream, 9.6, .98, -6.2); panel(7, .76, 1.62, 9.6, 1.0, -6.57); b.box(.63, .22, .1, dark, 9.6, .49, -6.65);
    for (const x of [-9.4, -5.1, 1.3, 6.9]) { b.cylinder(.19, .19, .79, dark, x, .5, -7.75, 8); b.cylinder(.23, .23, .11, steel, x, .90, -7.75, 8); }
    for (const x of [-9.1, 8.2]) { b.box(1.45, .56, 1.0, stone, x, .38, -6.35); b.box(1.25, .20, .83, green, x, .75, -6.35); }
  }
  const backstreets = [];
  for (const lot of footprints.slice(0, 4)) {
    const width = lot.width + 6, depth = 9, distance = (lot.depth + depth) / 2 + 4.0;
    const x = lot.x + Math.sin(lot.yaw) * distance, z = lot.z + Math.cos(lot.yaw) * distance, c = Math.cos(lot.yaw), sn = Math.sin(lot.yaw);
    if (cityDistrictForPoint(track, x, z)?.density === 0) continue;
    if (track.samples.some(q => { const dx = q.x - x, dz = q.z - z; return Math.abs(dx * c - dz * sn) < width / 2 + track.wallOffset + 3 && Math.abs(dx * sn + dz * c) < depth / 2 + track.wallOffset + 3; })) continue;
    const p = track.sample(track.nearest(x, z).s); b.setFrame(x, z, lot.yaw, Math.max(groundHeight(x, z), p.y - .12)); b.reserve(x, z, Math.hypot(width, depth) / 2 + 3, 'Kobe masonry-office backstreet');
    backstreets.push({ x, z, yaw: lot.yaw, width, depth }); b.box(width + 2, .13, 15, paving, 0, .01, -2.8);
    for (let bay = 0; bay < 4; bay++) {
      const xx = (bay - 1.5) * width / 4, w = width / 4 - .13, height = 9 + bay % 3 * 3.0;
      b.box(w, height, depth, bay % 2 ? cream : clay, xx, height / 2, 0); b.box(w + .12, .19, depth + .19, steel, xx, height + .14, 0);
      for (let floor = 2.1; floor < height; floor += 3.0) for (const side of [-1, 1]) window(1.28, 1.85, xx + side * w * .24, floor, -depth / 2 - .08);
      b.box(.67, .53, .47, cream, xx + w * .29, 3.8, -depth / 2 - .34);
    }
    const vanX = width / 2 - 4;
    b.box(1.7, 1.20, 3.6, cream, vanX, 1.04, -6.3); b.box(1.58, .51, 1.1, glass, vanX, 1.44, -7.60); b.box(1.74, .25, 3.68, dark, vanX, .48, -6.3);
    for (const side of [-1, 1]) for (const zz of [-7.46, -5.12]) { b.cylinder(.29, .29, .14, dark, vanX + side * .85, .39, zz, 10, 0, 0, Math.PI / 2); b.cylinder(.16, .16, .15, steel, vanX + side * .85, .39, zz, 8, 0, 0, Math.PI / 2); }
    b.box(.39, .19, .025, stone, vanX - .54, .74, -8.12); b.box(.39, .19, .025, stone, vanX + .54, .74, -8.12);
  }
  b.group.userData.localStreets = { family: 'kaigan-dori-masonry-and-offices', blocks: footprints, backstreets, atlasSize: canvas.width };
  return b.finish();
}
