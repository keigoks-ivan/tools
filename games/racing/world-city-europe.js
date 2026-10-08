import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js';
import { createCityWaterMaterial, addCityWaterPlane } from './world-city-australia.js';

const TAU = Math.PI * 2;
const EUROPEAN_CITIES = new Set(['paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick']);

// These are original architectural models. The official monument references are
// documented in assets/CITY-EU-SOURCES.md; the racing streets are adaptations.
export function addEuropeanLandmarks(options) {
  const { track, mobile = false, materials } = options;
  if (!EUROPEAN_CITIES.has(track.theme)) return null;
  const b = createCityBuilder(options), city = track.theme;
  const waterMaterials = new Set();
  const stone = b.surface(materials.concrete, city === 'warwick' ? '#c5bda5' : '#ded9c7');
  const trim = b.material('#ede9d9', { roughness: .82 });
  const dark = b.material('#343c3d', { roughness: .58, metalness: .24 });
  const glass = b.material('#536c73', { roughness: .26, metalness: .28 });
  let roofMaterial, roofTexture;
  function texture(width, height, paint) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace;
    value.wrapS = value.wrapT = THREE.RepeatWrapping; value.anisotropy = mobile ? 2 : 4; return value;
  }
  function roof() {
    if (roofMaterial) return roofMaterial;
    const slate = ['paris', 'newcastle'].includes(city);
    roofTexture = texture(256, 256, (c, w, h) => {
      c.fillStyle = slate ? '#575d5c' : '#a95e40'; c.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) for (let col = -1; col < 13; col++) {
        const x = col * 22 + row % 2 * 11, y = row * 16;
        c.fillStyle = slate ? `rgb(${74 + (row * 17 + col * 7) % 24},${82 + (row * 11 + col * 3) % 22},${79 + (row * 9 + col * 7) % 17})`
          : `rgb(${146 + (row * 13 + col * 7) % 34},${71 + (row * 9 + col * 3) % 30},${46 + (row * 7 + col * 5) % 24})`;
        c.fillRect(x + 1, y + 1, 20, 14); c.fillStyle = 'rgba(15,17,14,.18)'; c.fillRect(x, y + 14, 22, 2);
        c.fillStyle = 'rgba(246,214,175,.11)'; c.fillRect(x + 1, y + 1, 1, 13);
      }
    });
    roofMaterial = b.material('#ffffff', { map: roofTexture, roughness: .94 }); return roofMaterial;
  }
  function metric(geometry) {
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      if (ny > nx && ny > nz) uv.setXY(i, p.getX(i), p.getZ(i));
      else if (nx > nz) uv.setXY(i, p.getZ(i), p.getY(i));
      else uv.setXY(i, p.getX(i), p.getY(i));
    }
    return geometry;
  }
  function box(w, h, d, mat, x = 0, y = h / 2, z = 0, ry = 0) {
    b.bake(mat.map && mat === stone ? metric(new THREE.BoxGeometry(w, h, d)) : new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry);
  }
  function pitchedRoof(w, d, y, rise, x = 0, z = 0) {
    const mat = roof();
    // Pitched roof faces are real geometry; texture tiles follow roof pitch.
    const cross = new THREE.Shape(); cross.moveTo(-d / 2, 0); cross.lineTo(0, rise); cross.lineTo(d / 2, 0); cross.closePath();
    const geometry = new THREE.ExtrudeGeometry(cross, { depth: w, bevelEnabled: false, steps: 1 });
    geometry.rotateY(Math.PI / 2); geometry.translate(-w / 2, 0, 0);
    const uv = geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    b.bake(geometry, mat, x, y, z);
  }
  function cornice(w, d, y, mat = trim) {
    box(w + .8, .32, d + .8, mat, 0, y, 0);
  }
  function windows(w, h, d, floors = 5, columns = 5, balcony = false, offsetZ = 0, offsetY = 0) {
    for (const side of [-1, 1]) for (let floor = 0; floor < floors; floor++) for (let col = 0; col < columns; col++) {
      const x = -w * .42 + col * w * .84 / Math.max(1, columns - 1), y = offsetY + 2.7 + floor * (h - 5) / Math.max(1, floors - 1), z = offsetZ + side * (d / 2 + .06);
      box(1.75, 2.6, .13, trim, x, y, z); box(1.3, 2.08, .15, glass, x, y + .04, z + side * .08);
      box(.07, 2.1, .04, trim, x, y + .04, z + side * .18); box(1.33, .07, .04, trim, x, y + .19, z + side * .18);
      if (balcony && floor > 0 && (floor === 1 || floor === floors - 1)) {
        box(2.25, .15, .8, trim, x, y - 1.18, z + side * .35);
        box(2.25, .08, .06, dark, x, y - .3, z + side * .72);
        for (let j = -2; j <= 2; j++) box(.05, .88, .05, dark, x + j * .46, y - .74, z + side * .72);
      }
    }
  }
  function arch(w, h, opening, spring, d, mat, x = 0, y = 0, z = 0, rise = opening / 2) {
    const r = opening / 2, shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(-r, 0); shape.lineTo(-r, spring);
    shape.absellipse(0, spring, r, rise, Math.PI, 0, true); shape.lineTo(r, 0);
    shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h); shape.lineTo(-w / 2, h); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, curveSegments: mobile ? 12 : 20, bevelEnabled: false });
    b.bake(metric(geometry), mat, x, y, z - d / 2);
    return { radius: r, spring };
  }
  function arcBand(radius, spring, thick, depth, mat, x, y, z, segments = 20) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI, q = (i + 1) / segments * Math.PI;
      b.beam([x + Math.cos(a) * radius, y + spring + Math.sin(a) * radius, z], [x + Math.cos(q) * radius, y + spring + Math.sin(q) * radius, z], thick, mat);
      if (depth > 0) b.beam([x + Math.cos(a) * radius, y + spring + Math.sin(a) * radius, z - depth], [x + Math.cos(q) * radius, y + spring + Math.sin(q) * radius, z - depth], thick, mat);
    }
  }
  function water(w, d, x, z, y = 2.7, color = '#789192') {
    const mat = createCityWaterMaterial(color); mat.userData.cityWater = true; waterMaterials.add(mat);
    addCityWaterPlane(b, mat, x, z, w, d, y); b.setFrame(0, 0, 0, 0);
    // Broken specular lines read as small river ripples without an animated mesh.
    const glint = b.material('#9aafb0', { roughness: .3, metalness: .28 });
    glint.userData.cityWater = true; waterMaterials.add(glint);
    for (let row = 0; row < (mobile ? 13 : 24); row++) {
      const xx = x - w * .44 + (row * 157 % Math.floor(w * .88)), zz = z - d * .42 + (row * 31 % Math.floor(d * .84));
      box(7 + row % 11, .006, .055, glint, xx, y + .012, zz);
    }
  }
  function rowBuilding(fraction, side, color, w = 26, h = 23, d = 16, mansard = false, label = '') {
    const placed = b.place(fraction, side, track.wallOffset + 40, d + 6, w + 6, label || 'historic street facade');
    b.setFrame(placed.x, placed.z, placed.yaw + side * Math.PI / 2);
    const plaster = b.material(color, { roughness: .91 });
    box(w + 1, .5, d + 1, stone, 0, -.05, 0); box(w, h, d, plaster);
    windows(w, h, d, Math.round(h / 4.5), Math.round(w / 5.6), city === 'paris' || city === 'nice');
    for (let floor = 0; floor <= Math.floor(h / 4.5); floor++) cornice(w, d, 4.2 + floor * 4.35, floor === 0 ? stone : trim);
    if (mansard) {
      const height = 4.5, mat = roof();
      const shape = new THREE.Shape(); shape.moveTo(-d / 2 - .5, 0); shape.lineTo(-d / 2 + 2.7, height); shape.lineTo(d / 2 - 2.7, height); shape.lineTo(d / 2 + .5, 0); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: w + 1, bevelEnabled: false }); geo.rotateY(Math.PI / 2); geo.translate(-(w + 1) / 2, 0, 0);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
      b.bake(geo, mat, 0, h + .35, 0);
      for (let i = -Math.floor(w / 7) / 2; i <= Math.floor(w / 7) / 2; i++) {
        const x = i * 6.5; box(2.1, 2.45, 1.6, trim, x, h + 1.9, -d / 2 + .8); box(1.2, 1.7, .12, glass, x, h + 1.9, -d / 2 - .06);
        pitchedRoof(2.65, 2.5, h + 3.12, 1.1, x, -d / 2 + .55);
      }
    } else pitchedRoof(w + 1, d + 1, h + .35, 4.4);
    for (let i = -1; i <= 1; i++) { box(1.3, 2.3, 1.1, stone, i * w * .24, h + 4.4, 0); b.cylinder(.19, .22, .6, dark, i * w * .24, h + 5.8, 0, 6); }
    if (label) b.sign(label, '', Math.min(w - 3, 16), 1.3, 0, 3.5, -d / 2 - .16, city === 'paris' ? '#333d42' : '#58695d');
  }
  function bollards(length, y, z, mat = dark) {
    for (let x = -length / 2; x <= length / 2; x += 6) {
      b.cylinder(.11, .16, 1.05, mat, x, y + .52, z, 7);
      b.bake(new THREE.SphereGeometry(.14, 8, 5), mat, x, y + 1.05, z);
    }
  }
  function railing(length, y, z, mat = dark, spacing = 2.5) {
    box(length, .065, .065, mat, 0, y + 1.1, z);
    box(length, .04, .04, mat, 0, y + .48, z);
    for (let x = -length / 2; x < length / 2; x += spacing) box(.055, 1.1, .055, mat, x, y + .55, z);
  }
  function statue(x, y, z, mat, size = 1) {
    box(.95 * size, .65 * size, .95 * size, stone, x, y + .32 * size, z);
    b.cylinder(.36 * size, .6 * size, 1.6 * size, mat, x, y + 1.45 * size, z, mobile ? 7 : 10);
    const head = new THREE.SphereGeometry(1, mobile ? 8 : 10, 6); head.scale(.25 * size, .29 * size, .25 * size);
    b.bake(head, mat, x, y + 2.51 * size, z);
    b.beam([x - .31 * size, y + 2 * size, z], [x - .69 * size, y + 1.1 * size, z + .05 * size], .17 * size, mat);
    b.beam([x + .3 * size, y + 2.02 * size, z], [x + .61 * size, y + 1.52 * size, z - .24 * size], .17 * size, mat);
  }
  function palm(x, z, height = 10) {
    b.setFrame(x, z); const bark = b.material('#77624c', { roughness: .98 }), leaf = b.material('#687849', { roughness: .9, side: THREE.DoubleSide });
    b.cylinder(.17, .32, height, bark, 0, height / 2, 0, 9);
    for (let level = 1; level < height; level += .5) b.cylinder(.21, .23, .065, bark, 0, level, 0, 9);
    for (let i = 0; i < (mobile ? 9 : 12); i++) {
      const a = i / (mobile ? 9 : 12) * TAU;
      const points = [[0, height, 0], [Math.cos(a) * 1.3, height + .65, Math.sin(a) * 1.3], [Math.cos(a) * 3.5, height + .16, Math.sin(a) * 3.5], [Math.cos(a) * 4.6, height - 1.05, Math.sin(a) * 4.6]];
      for (let k = 0; k < 3; k++) b.beam(points[k], points[k + 1], .12, leaf);
      const vertices = [];
      for (let k = 1; k <= 8; k++) {
        const r = k * .48, yy = height + Math.sin(r / 4.6 * Math.PI) * .6 - r * .22;
        for (const side of [-1, 1]) {
          const px = Math.cos(a) * r, pz = Math.sin(a) * r, length = .72 * (1 - r / 5.8);
          const ex = px - Math.sin(a) * side * length + Math.cos(a) * .33, ez = pz + Math.cos(a) * side * length + Math.sin(a) * .33;
          vertices.push(px - Math.cos(a) * .085, yy, pz - Math.sin(a) * .085, ex, yy - .42, ez, px + Math.cos(a) * .085, yy, pz + Math.sin(a) * .085);
        }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals(); b.bake(geometry, leaf);
    }
  }
  function landmarkVista(x, z) {
    const start = track.spawn, steps = Math.ceil(Math.hypot(x - start.x, z - start.z) / 25);
    for (let i = 1; i < steps; i++) {
      const t = i / steps; b.reserve(start.x + (x - start.x) * t, start.z + (z - start.z) * t, 13, 'landmark viewing corridor');
    }
  }

  if (city === 'paris') {
    const iron = b.material('#776a59', { metalness: .68, roughness: .57 });
    const platform = b.material('#817461', { metalness: .5, roughness: .62 });
    b.setFrame(-155, 155, -.15); b.reserve(-155, 155, 98, 'Eiffel Tower — 330 m lattice'); landmarkVista(-155, 155);
    box(133, .4, 133, stone, 0, -.08, 0);
    const levels = [[0, 62.5], [57, 36], [115, 19], [195, 9], [276, 3.8]];
    for (let level = 0; level < levels.length - 1; level++) {
      const [y, r] = levels[level], [yy, rr] = levels[level + 1], divisions = level < 2 ? 7 : 10;
      for (let face = 0; face < 4; face++) {
        const angle = face * Math.PI / 2;
        const transform = (a, h, n) => [a * Math.cos(angle) + n * Math.sin(angle), h, -a * Math.sin(angle) + n * Math.cos(angle)];
        for (const side of [-1, 1]) b.beam(transform(side * r, y, r), transform(side * rr, yy, rr), level === 0 ? 2.2 : 1.15, iron);
        for (let segment = 0; segment < divisions; segment++) {
          const a = segment / divisions, q = (segment + 1) / divisions, ra = r + (rr - r) * a, rq = r + (rr - r) * q, ya = y + (yy - y) * a, yq = y + (yy - y) * q;
          if (level === 0 && segment < 3) {
            for (const side of [-1, 1]) {
              b.beam(transform(side * ra, ya, ra), transform(side * (rq - 7.4), yq, rq), .62, iron);
              b.beam(transform(side * (ra - 8.8), ya, ra), transform(side * rq, yq, rq), .62, iron);
            }
          } else {
            b.beam(transform(-ra, ya, ra), transform(rq, yq, rq), level === 0 ? .73 : .45, iron);
            b.beam(transform(ra, ya, ra), transform(-rq, yq, rq), level === 0 ? .73 : .45, iron);
          }
          if (segment > 2 || level > 0) b.beam(transform(-rq, yq, rq), transform(rq, yq, rq), .49, iron);
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let step = 0; step < 24; step++) {
        const a = step / 24 * Math.PI, q = (step + 1) / 24 * Math.PI;
        b.beam([Math.cos(a) * 48, 8 + Math.sin(a) * 38, side * 47], [Math.cos(q) * 48, 8 + Math.sin(q) * 38, side * 47], 1.25, iron);
        b.beam([side * 47, 8 + Math.sin(a) * 38, Math.cos(a) * 48], [side * 47, 8 + Math.sin(q) * 38, Math.cos(q) * 48], 1.25, iron);
      }
    }
    for (const [y, r] of [[57, 40], [115, 22], [276, 5.8]]) {
      box(r * 2, 1.5, r * 2, platform, 0, y, 0);
      for (const side of [-1, 1]) { railing(r * 2, y + .75, side * r, iron, 2); box(.12, 1.2, r * 2, iron, side * r, y + 1.35, 0); }
    }
    b.cylinder(2.8, 3.8, 13, iron, 0, 283, 0, 12); b.cylinder(.7, 2.8, 19, iron, 0, 299, 0, 12); b.cylinder(.12, .65, 21.5, iron, 0, 319.25, 0, 8);
    box(19, 5.5, 12, glass, 0, 60.5, 20); box(14, 4, 8, glass, 0, 117.7, 8);
    b.sign('TOUR EIFFEL', 'CHAMP DE MARS · PARIS', 22, 4, 0, 3, -67, '#5d5548');
    b.setFrame(116, -95, -.18); b.reserve(116, -95, 38, 'Arc de Triomphe');
    box(54, .5, 36, stone, 0, -.05, 0); arch(45, 50, 14.5, 20.5 - 7.25, 22, stone);
    for (const z of [-11.15, 11.15]) {
      arcBand(7.4, 13.25, .6, 0, trim, 0, 0, z, 24);
      for (const x of [-15, 15]) {
        box(9, .9, .8, trim, x, 32, z); box(7.8, .6, .5, trim, x, 12.6, z);
        for (let col = -2; col <= 2; col++) { box(.25, 11, .24, trim, x + col * 1.3, 21, z); statue(x + col * .58, 4.5 + Math.abs(col) * .55, z + Math.sign(z) * .44, trim, 1.55); }
      }
      box(46, .9, .8, trim, 0, 34.7, z); box(46.5, 1.3, .9, trim, 0, 41.1, z); box(47, 1.4, .8, trim, 0, 49.4, z);
      for (let x = -20; x <= 20; x += 2.2) box(.7, .95, .4, trim, x, 43.1, z);
    }
    water(1800, 160, 0, -470, 2.7, '#738f8e');
    b.setFrame(0, -399, 0, 0); box(1250, 7, 6, stone, 0, 1.5, 0); box(1250, .45, 12, trim, 0, 5.18, 2); bollards(1000, 5.4, -2);
    b.setFrame(0, -475, 0, 0);
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 30; arch(30.6, 13.5, 25, 0, 17, stone, x); b.reserve(x, -475, 23, 'Pont d’Iéna stone arch'); }
    box(156, 1, 20, stone, 0, 14, 0); railing(156, 14.5, -9.5, trim); railing(156, 14.5, 9.5, trim);
    for (const [fraction, color, label] of [[.07, '#cfbea0', 'QUAI BRANLY'], [.17, '#d8cdb6', 'PARIS VII'], [.28, '#bcb59f', 'AVENUE DE SUFFREN'], [.54, '#cabfa4', 'RUE DE PARIS'], [.68, '#ddd4bf', 'BOULANGERIE'], [.79, '#c3b69e', 'CAFÉ PARISIEN']]) rowBuilding(fraction, 1, color, 31, 24, 17, true, label);
  } else if (city === 'prague') {
    const patina = b.material('#528170', { roughness: .7, metalness: .48 });
    water(1800, 260, 0, -520, 2.7, '#658d8e');
    b.setFrame(0, -493, 0, 0); const bay = 516 / 16;
    for (let i = 0; i < 16; i++) {
      const x = (i - 7.5) * bay; arch(bay + .15, 18.5, bay - 5.3, 1.7, 9.5, stone, x);
      b.reserve(x, -493, 25, 'Charles Bridge — 16 arches');
      if (i < 15) for (const side of [-1, 1]) statue(x + bay / 2, 20.1, side * 4.15, stone, 1.42);
      // Upstream cutwaters are wedge piers, not rectangular supports.
      const pier = new THREE.CylinderGeometry(3.1, 4.7, 9.5, 3); b.bake(pier, stone, x + bay / 2, 4.8, -6, 0, Math.PI / 2);
    }
    box(518, 1.15, 11, stone, 0, 19.2, 0); box(518, .95, .6, stone, 0, 20.3, -5.1); box(518, .95, .6, stone, 0, 20.3, 5.1);
    for (const x of [-270, 270]) {
      box(18, 37, 16, stone, x, 20.5, 0);
      const left = x - 9, right = x + 9;
      for (const xx of [left, right]) box(2.5, 4, 17.2, trim, xx, 40, 0);
      pitchedRoof(22, 22, 39.2, 16, x, 0);
      for (const side of [-1, 1]) {
        box(5.4, 8, .2, glass, x, 29, side * 8.1);
        for (let yy = 5; yy < 38; yy += 8) { box(18.5, .5, .3, trim, x, yy, side * 8.2); }
        for (const dx of [-6, 6]) statue(x + dx, 24, side * 8.45, trim, 1.35);
      }
      b.reserve(x, -493, 22, 'Gothic bridge tower');
    }
    // Castle district rises behind the red-roofed riverfront.
    b.setFrame(-125, 115, -.12); b.reserve(-125, 115, 93, 'Prague Castle and St Vitus skyline'); landmarkVista(-125, 115);
    box(152, 16, 66, stone, 0, 8, 0); pitchedRoof(155, 69, 16, 10);
    box(34, 45, 64, stone, 0, 38.5, 0); pitchedRoof(38, 68, 61, 20);
    for (const x of [-15, 15]) {
      box(12, 63, 13, stone, x, 47.5, -27);
      b.cylinder(0, 9.4, 24, roof(), x, 91, -27, 4, 0, Math.PI / 4);
      for (let yy = 30; yy <= 74; yy += 12) box(9.5, 7, .16, glass, x, yy, -33.7);
      for (const side of [-1, 1]) b.beam([x + side * 4.4, 74, -33.9], [x, 79, -33.9], .4, trim);
    }
    box(16, 63, 18, stone, 0, 47, 35); b.cylinder(4, 7, 7, patina, 0, 82, 35, 8); b.sphere(6, 8.5, 6, patina, 0, 90, 35); b.cylinder(.13, 2, 18, patina, 0, 104, 35, 8);
    for (let z = -20; z < 36; z += 10) for (const side of [-1, 1]) {
      box(2.5, 36, 2.5, trim, side * 18.5, 33.5, z);
      b.beam([side * 20, 31, z], [side * 14, 51, z], 1.05, trim);
      box(.18, 18, 4.5, glass, side * 17.1, 38, z);
    }
    for (let i = 0; i < 8; i++) { const x = (i - 3.5) * 15; box(11, 3, .1, glass, x, 9, -33.1); }
    for (const [f, color, title] of [[.06, '#cdb986', 'STARÉ MĚSTO'], [.16, '#cda996', 'KARLŮV MOST'], [.26, '#d9cfb4', 'MALÁ STRANA'], [.56, '#bdc2aa', 'PRAHA'], [.7, '#dfb69f', 'NÁBŘEŽÍ'], [.84, '#d2c3a5', 'ČESKÁ KAVÁRNA']]) rowBuilding(f, 1, color, 26, 24, 18, false, title);
  } else if (city === 'newcastle') {
    const green = b.material('#4c766c', { metalness: .65, roughness: .52 });
    const steel = b.material('#bec5c3', { metalness: .8, roughness: .33 });
    const brick = b.material('#967562', { roughness: .9 });
    water(1800, 260, 0, 520, 2.7, '#6c8585');
    b.setFrame(0, 494, 0, 0); landmarkVista(-60, 494); landmarkVista(30, 494);
    const span = 162, archSteps = mobile ? 28 : 40, base = 26, rise = 34;
    for (const side of [-1, 1]) {
      for (let i = 0; i < archSteps; i++) {
        const u = i / archSteps, v = (i + 1) / archSteps, x = (u - .5) * span, xx = (v - .5) * span;
        const y = base + Math.sin(u * Math.PI) * rise, yy = base + Math.sin(v * Math.PI) * rise;
        b.beam([x, y, side * 8.5], [xx, yy, side * 8.5], 1.7, green);
        b.beam([x, y + 4.3, side * 8.5], [xx, yy + 4.3, side * 8.5], 1.4, green);
        b.beam([x, y, side * 8.5], [xx, yy + 4.3, side * 8.5], .52, green);
        b.beam([x, y + 4.3, side * 8.5], [xx, yy, side * 8.5], .52, green);
        if (i % 2 === 0) b.beam([x, 24.9, side * 8.5], [x, y, side * 8.5], .5, green);
      }
      railing(244, 26.1, side * 10, green, 2);
    }
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, x = (u - .5) * span, y = base + Math.sin(u * Math.PI) * rise;
      b.beam([x, y, -8.5], [x, y, 8.5], .85, green);
      if (i < 12) b.beam([x, y, -8.5], [x + span / 12, base + Math.sin((i + 1) / 12 * Math.PI) * rise, 8.5], .6, green);
    }
    box(245, 1.1, 22, dark, 0, 25.55, 0);
    for (const x of [-90, 90]) {
      box(20, 34, 27, stone, x, 17, 0); box(23, 1.6, 30, trim, x, 34.8, 0);
      for (let col = -2; col <= 2; col++) box(2.4, 14, .14, glass, x + col * 3.2, 23, -13.6);
      b.reserve(x, 494, 32, 'Tyne Bridge stone abutment');
    }
    for (let x = -70; x <= 70; x += 35) b.reserve(x, 494, 25, 'Tyne Bridge green bowstring truss');
    // Millennium Bridge: the pedestrian curve and high arch are visibly separate.
    b.setFrame(274, 494, 0, 0); b.reserve(274, 494, 62, 'Gateshead Millennium Bridge');
    const span2 = 105;
    for (let i = 0; i < (mobile ? 30 : 44); i++) {
      const count = mobile ? 30 : 44, u = i / count, v = (i + 1) / count;
      const a = [(u - .5) * span2, 4.7 + Math.sin(u * Math.PI) * 1.3, Math.sin(u * Math.PI) * 22];
      const q = [(v - .5) * span2, 4.7 + Math.sin(v * Math.PI) * 1.3, Math.sin(v * Math.PI) * 22];
      b.beam(a, q, 3.3, steel);
      const archA = [(u - .5) * span2, 5 + Math.sin(u * Math.PI) * 45, -Math.sin(u * Math.PI) * 4];
      const archQ = [(v - .5) * span2, 5 + Math.sin(v * Math.PI) * 45, -Math.sin(v * Math.PI) * 4];
      b.beam(archA, archQ, 1.3, steel);
      for (const edge of [-1, 1]) b.beam([a[0], a[1] + 1.4, a[2] + edge * 1.5], [q[0], q[1] + 1.4, q[2] + edge * 1.5], .12, steel);
      if (i % 3 === 0) b.beam([a[0], a[1], a[2]], archA, .13, steel);
    }
    // The Glasshouse's three rounded roof volumes are a prominent Gateshead view.
    b.setFrame(105, 678, 0, 6); b.reserve(105, 678, 88, 'The Glasshouse International Centre for Music');
    box(145, 15, 64, glass, 0, 7.5, 0);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 43, rx = i === 1 ? 33 : 29, height = i === 1 ? 32 : 24;
      b.sphere(rx, height, 33, steel, x, 15, 0);
      for (let rib = -12; rib <= 12; rib++) {
        const z = rib * 2.3, r = Math.sqrt(Math.max(0, 1 - z * z / (33 * 33)));
        for (let j = 0; j < 14; j++) {
          const a = j / 14 * Math.PI, q = (j + 1) / 14 * Math.PI;
          b.beam([x + Math.cos(a) * rx * r, 15 + Math.sin(a) * height * r, z], [x + Math.cos(q) * rx * r, 15 + Math.sin(q) * height * r, z], .18, dark);
        }
      }
    }
    b.sign('THE GLASSHOUSE', 'INTERNATIONAL CENTRE FOR MUSIC', 51, 5, 0, 7, -32.2, '#536563');
    b.setFrame(0, 393, 0, 0); box(1300, 7.5, 5, stone, 0, 1.45, 0); box(1300, .3, 16, trim, 0, 5.45, -3); railing(1300, 5.6, 2.4, dark, 4);
    for (const [f, color, title] of [[.08, '#a78970', 'QUAYSIDE'], [.19, '#bda98c', 'GREY STREET'], [.31, '#8e7767', 'NEWCASTLE UPON TYNE'], [.54, '#ad927b', 'BALTIC QUARTER'], [.68, '#b8a88e', 'TYNE & WEAR'], [.82, '#95745e', 'RIVERSIDE']]) rowBuilding(f, 1, color, 28, 24, 18, true, title);
    b.place(.46, -1, 85, 42, 25, 'Victorian quayside warehouse'); box(40, 30, 23, brick); windows(40, 30, 23, 6, 8); pitchedRoof(41, 24, 30, 5);
  } else if (city === 'lisbon') {
    const iron = b.material('#a44738', { metalness: .65, roughness: .57 });
    const yellow = b.material('#d5ad4c', { roughness: .67 });
    water(1800, 740, 0, -755, 2.7, '#63979c');
    b.setFrame(-145, 105, -.06); b.reserve(-145, 105, 52, 'Belém Tower and Manueline bastion'); landmarkVista(-145, 105);
    box(54, .8, 39, stone, 0, -.1, 0);
    const bastion = new THREE.CylinderGeometry(25, 25, 5.8, 5); b.bake(bastion, stone, 0, 2.9, -13, 0, Math.PI);
    box(17, 29.4, 17, stone, 0, 14.7, 9);
    for (const y of [6.4, 12.4, 20.2, 28.6]) box(18.2, .55, 18.2, trim, 0, y, 9);
    for (const x of [-7.9, 7.9]) for (const z of [1.1, 16.9]) {
      b.cylinder(1.5, 1.65, 6.4, stone, x, 29.2, z, 10); b.cylinder(0, 1.65, 4.8, stone, x, 34.8, z, 8);
      b.sphere(.2, .3, .2, trim, x, 37.4, z);
    }
    for (const side of [-1, 1]) {
      for (const y of [9.5, 16.7, 24.3]) for (const x of [-4.3, 0, 4.3]) {
        box(1.8, 2.2, .14, dark, x, y, 9 + side * 8.56); box(.14, 2.5, .16, trim, x - 1, y, 9 + side * 8.64); box(.14, 2.5, .16, trim, x + 1, y, 9 + side * 8.64);
      }
      box(13.6, .42, 2.6, trim, 0, 14.1, 9 + side * 9.4); railing(13.6, 14.3, 9 + side * 10.6, stone, 1.05);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, x = Math.cos(a) * 22, z = -13 + Math.sin(a) * 19;
      if (z > 1) continue;
      box(2.3, 1.8, 1.1, stone, x, 6.8, z, -a);
      if (i % 2 === 0) { b.cylinder(1.75, 1.8, 4.2, stone, x, 8.2, z, 10); b.cylinder(0, 1.8, 3.1, stone, x, 11.7, z, 8); }
    }
    b.sign('TORRE DE BELÉM', 'LISBOA · RIO TEJO', 17, 2.6, 0, 1.8, -34, '#8a8068');
    // A red suspension span is seen downriver; its deck has two main towers.
    b.setFrame(0, -649, 0, 0); const span = 1013, cableY = x => 79 + 111 * (2 * x / span) ** 2;
    box(2300, 2.2, 25, dark, 0, 69.5, 0);
    for (const x of [-span / 2, span / 2]) {
      for (const side of [-1, 1]) box(6.5, 190, 7, iron, x, 95, side * 12);
      for (const y of [50, 88, 123, 158, 187]) box(27, 4, 5, iron, x, y, 0);
      for (let y = 52; y < 187; y += 34) { b.beam([x - 3, y, -12], [x - 3, y + 32, 12], 1.2, iron); b.beam([x + 3, y, 12], [x + 3, y + 32, -12], 1.2, iron); }
      b.reserve(x, -649, 37, '25 de Abril suspension bridge tower');
    }
    for (const side of [-1, 1]) for (let i = 0; i < (mobile ? 32 : 48); i++) {
      const count = mobile ? 32 : 48, x = -span / 2 + i / count * span, q = x + span / count;
      b.beam([x, cableY(x), side * 12], [q, cableY(q), side * 12], .7, iron);
      b.beam([x, 70.6, side * 12], [x, cableY(x), side * 12], .13, iron);
      b.beam([x, 68, side * 12], [q, 68, side * 12], .5, iron);
      b.beam([x, 63, side * 12], [q, 68, side * 12], .45, iron);
      if (i % 3 === 0) b.reserve(x, -649, 18, '25 de Abril bridge span');
    }
    for (const side of [-1, 1]) {
      b.beam([-1150, 45, side * 12], [-span / 2, 190, side * 12], .7, iron);
      b.beam([span / 2, 190, side * 12], [1150, 45, side * 12], .7, iron);
    }
    for (const [f, color, title] of [[.08, '#cfad81', 'ALFAMA'], [.2, '#ead8b5', 'BAIXA'], [.35, '#cfa191', 'LISBOA'], [.54, '#aac6c0', 'AZULEJOS'], [.69, '#e3c993', 'CHIADO'], [.82, '#d3b8a0', 'RIBEIRA']]) rowBuilding(f, 1, color, 25, 21, 18, false, title);
    const tram = b.place(.14, -1, track.wallOffset + 25, 4, 12, 'Historic yellow Tram 28');
    box(2.45, 1.4, 8.8, yellow, 0, 1.1, 0); box(2.4, 1.6, 8.1, trim, 0, 2.58, 0); box(2.65, .24, 9.15, dark, 0, 3.52, 0);
    for (const side of [-1, 1]) {
      for (let i = -3; i <= 3; i++) { box(.1, 1.2, .87, glass, side * 1.25, 2.62, i * 1.03); box(.15, 1.45, .1, dark, side * 1.25, 2.57, i * 1.03 + .49); }
      box(.6, 1.45, .12, glass, side * .57, 2.58, -4.1); b.cylinder(.14, .14, .08, trim, side * .7, 1.38, -4.47, 12, Math.PI / 2);
      for (const z of [-2.8, 2.8]) b.cylinder(.37, .37, .18, dark, side * 1.13, .45, z, 12, 0, 0, Math.PI / 2);
    }
    b.beam([0, 3.62, -1], [0, 4.3, 0], .08, dark); b.beam([0, 4.3, 0], [0, 3.62, 1], .08, dark);
    b.sign('28', 'PRAZERES', .9, .6, 0, 3.1, -4.58, '#33383a');
    b.setFrame(tram.x, tram.z, tram.yaw); for (const x of [-.71, .71]) box(.08, .012, 14, dark, x, .035, 0);
    b.setFrame(0, -393, 0, 0); box(1250, 7, 5, stone, 0, 1.3, 0); box(1250, .4, 12, trim, 0, 5.08, 2); bollards(1250, 5.3, -2.5);
  } else if (city === 'marseille') {
    const gold = b.material('#c5a45b', { metalness: .7, roughness: .47 });
    const bands = b.material('#73716a', { roughness: .92 });
    const ochre = b.material('#d2b69a', { roughness: .94 });
    water(1500, 900, 0, -840, 2.7, '#4c8c9b');
    // Notre-Dame de la Garde's raised limestone outcrop, striped stone and gold crown.
    b.setFrame(-110, 155, -.18); b.reserve(-110, 155, 115, 'Notre-Dame de la Garde basilica'); landmarkVista(-143, 155);
    b.sphere(112, 47, 77, stone, 0, -3, 0); box(91, 8, 53, stone, 0, 43, 0);
    box(59, 24, 24, stone, 5, 59, 0); box(16, 22, 29, stone, 36, 58, 0);
    for (let y = 48; y < 73; y += 3.2) box(59.4, .8, 24.4, bands, 5, y, 0);
    box(18, 38, 18, stone, -34, 66, 0); for (let y = 49; y < 86; y += 4.5) box(18.4, 1, 18.4, bands, -34, y, 0);
    for (const side of [-1, 1]) {
      box(10, 11, .15, glass, -34, 78, side * 9.15);
      for (let i = -1; i <= 1; i++) box(.7, 11.5, .3, trim, -34 + i * 3, 78, side * 9.35);
      for (let i = -1; i <= 3; i++) {
        const x = 5 + i * 11, z = side * 12.15; box(3.4, 8.2, .12, glass, x, 60, z); box(.5, 9.5, .25, trim, x - 2, 60, z); box(.5, 9.5, .25, trim, x + 2, 60, z);
      }
    }
    pitchedRoof(62, 28, 71.5, 7.5, 5, 0); b.sphere(7, 6.5, 7, stone, 32, 76, 0); b.cylinder(.25, .3, 4, gold, 32, 83, 0, 8);
    box(21, 1.2, 21, trim, -34, 85.8, 0); b.cylinder(5.8, 6.8, 6.5, stone, -34, 89.7, 0, 16); b.sphere(5.8, 4.6, 5.8, gold, -34, 94.4, 0);
    statue(-34, 98, 0, gold, 3.2); b.cylinder(.17, .2, 2.7, gold, -34, 108.5, 0, 8);
    for (let stair = 0; stair < 24; stair++) box(14, .32, 2, stone, -34, 47 - stair * .95, -27 - stair * 1.7);
    b.sign('NOTRE-DAME DE LA GARDE', 'MARSEILLE · LA BONNE MÈRE', 38, 4.2, 5, 51, -28, '#807262');
    b.setFrame(0, -399, 0, 0); box(1250, 7, 6, stone, 0, 1.3, 0); box(1250, .45, 18, trim, 0, 5.05, 5); bollards(1220, 5.3, -2.3);
    // Dense marina pontoons and narrow sailing yachts characterize the Vieux-Port.
    const hull = b.material('#eeeae0', { roughness: .52 }), navy = b.material('#34575f', { roughness: .56 });
    for (let dock = 0; dock < (mobile ? 5 : 8); dock++) {
      const x = -360 + dock * 98; b.setFrame(x, -496, 0, 0); box(3, .6, 166, ochre, 0, 3.35, 0); box(13, .45, 5, ochre, 0, 3.72, 69);
      b.reserve(x, -496, 12, 'Vieux-Port marina pier');
      for (let berth = 0; berth < (mobile ? 5 : 8); berth++) for (const side of [-1, 1]) {
        const z = -62 + berth * 18, y = 3.5;
        const boat = new THREE.SphereGeometry(1, mobile ? 12 : 16, 8); boat.scale(1.3, .7, 5.3); b.bake(boat, hull, side * 5.8, y, z);
        box(2.8, .15, 9, hull, side * 5.8, y + .65, z);
        box(1.6, .75, 3.2, navy, side * 5.8, y + 1.06, z + .3);
        b.beam([side * 5.8, y + .7, z], [side * 5.8, y + 13.8, z], .07, trim);
        b.beam([side * 5.8, y + 12.8, z], [side * 5.8, y + .78, z - 4.3], .024, trim);
        b.beam([side * 5.8, y + 12.8, z], [side * 5.8, y + .78, z + 4.2], .024, trim);
      }
    }
    b.setFrame(455, -479, 0, 0); b.reserve(455, -479, 36, 'Fort Saint-Jean');
    b.cylinder(14, 17, 28, stone, 0, 14, 0, 20); box(45, 13, 24, stone, -16, 6.5, 18);
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; box(1.5, 1.8, 1.5, trim, Math.cos(a) * 13.5, 28.4, Math.sin(a) * 13.5); }
    for (const [f, color, title] of [[.06, '#d0bc9c', 'VIEUX-PORT'], [.2, '#c8a17e', 'LE PANIER'], [.32, '#e1d0ad', 'LA CANEBIÈRE'], [.55, '#bfa790', 'MARSEILLE'], [.7, '#d4bfa3', 'QUAI DU PORT'], [.83, '#c7aa83', 'PROVENCE']]) rowBuilding(f, 1, color, 29, 23, 18, false, title);
  } else if (city === 'nice') {
    const pink = b.material('#e4b7ad', { roughness: .88 }), copper = b.material('#d6a29b', { metalness: .35, roughness: .73 });
    const patina = b.material('#79a59a', { metalness: .4, roughness: .78 });
    const blue = b.material('#337bad', { roughness: .57, metalness: .18 });
    water(920, 1900, -865, 0, 2.4, '#468faa');
    b.setFrame(-348, 0, Math.PI / 2, 0); box(1500, 3, 35, stone, 0, 2.5, 0); box(1500, .35, 35, stone, 0, 4.05, 0); box(1500, 2, 3, stone, 0, 2.9, -16);
    const pebbles = b.surface(materials.shoulder || materials.concrete, '#aaa59a', { roughness: .97 });
    box(1500, .25, 46, pebbles, 0, 1.55, -39); railing(1500, 4.22, -14.5, trim, 4.2);
    for (let i = 0; i < (mobile ? 24 : 44); i++) {
      const x = -540 + i * 25;
      box(.6, .035, .6, blue, x, 4.77, -8); box(.6, .52, .04, blue, x, 5.02, -8.27);
      for (const xx of [-.25, .25]) { box(.035, .5, .035, blue, x + xx, 4.52, -8.22); box(.035, .5, .035, blue, x + xx, 4.52, -7.78); box(.035, .16, .52, blue, x + xx, 4.97, -8); }
      if (i % 4 === 0) { b.cylinder(.065, .12, 7.5, dark, x + 4.5, 7.98, 11, 8); b.sphere(.5, .5, .5, trim, x + 4.5, 11.8, 11); }
    }
    b.reserve(-348, 0, 22, 'Promenade des Anglais blue chairs');
    // Negresco: pale curved corner facade, pink dome and ornate mansard silhouette.
    b.setFrame(-170, 135, Math.PI / 2); b.reserve(-170, 135, 71, 'Le Negresco hotel'); landmarkVista(-170, 135);
    box(93, 29, 52, trim, 0, 14.5, 0); box(94, 1.2, 53, stone, 0, 29.6, 0);
    windows(93, 29, 52, 6, 16, true);
    const mansard = new THREE.Shape(); mansard.moveTo(-27, 0); mansard.lineTo(-17, 8); mansard.lineTo(17, 8); mansard.lineTo(27, 0); mansard.closePath();
    const mansardGeo = new THREE.ExtrudeGeometry(mansard, { depth: 96, bevelEnabled: false, steps: 1 }); mansardGeo.rotateY(Math.PI / 2); mansardGeo.translate(-48, 30.2, 0); b.bake(mansardGeo, pink);
    box(97, .35, 35, patina, 0, 38.4, 0);
    for (let x = -36; x < 46; x += 6.7) {
      box(2.8, 3.5, 2.5, trim, x, 32.8, -26); box(1.5, 2.4, .08, glass, x, 32.8, -27.3);
      box(3.15, .32, 2.9, trim, x, 34.65, -26);
    }
    for (let floor = 0; floor < 6; floor++) cornice(93, 52, 4.4 + floor * 4.7);
    b.cylinder(13.6, 13.6, 30, trim, -41, 15, -21, 24);
    for (let floor = 0; floor < 6; floor++) for (let i = 0; i < 11; i++) {
      const a = i / 11 * TAU; box(1.1, 2.4, .13, glass, -41 + Math.sin(a) * 13.7, 3 + floor * 4.7, -21 + Math.cos(a) * 13.7, a);
    }
    b.cylinder(12.5, 14.2, 2, pink, -41, 31, -21, 24); b.sphere(12.6, 11, 12.6, copper, -41, 34, -21); b.cylinder(.2, 2, 5, patina, -41, 46.1, -21, 10);
    for (let rib = 0; rib < 12; rib++) {
      const a = rib / 12 * TAU;
      for (let i = 0; i < 10; i++) {
        const u = i / 10 * Math.PI / 2, q = (i + 1) / 10 * Math.PI / 2;
        b.beam([-41 + Math.cos(a) * Math.cos(u) * 12.7, 34 + Math.sin(u) * 11, -21 + Math.sin(a) * Math.cos(u) * 12.7], [-41 + Math.cos(a) * Math.cos(q) * 12.7, 34 + Math.sin(q) * 11, -21 + Math.sin(a) * Math.cos(q) * 12.7], .1, pink);
      }
    }
    b.sign('LE NEGRESCO', 'NICE · PROMENADE DES ANGLAIS', 35, 3.2, 0, 5, -26.25, '#67534a');
    for (const [f, color, title] of [[.1, '#dfcaaa', 'PROMENADE DES ANGLAIS'], [.24, '#e2ba9d', 'NICE'], [.4, '#d2b382', 'VIEUX NICE'], [.55, '#e3ceb1', 'RUE DE FRANCE'], [.7, '#d0b09c', 'CÔTE D’AZUR'], [.84, '#e3c79c', 'BAIE DES ANGES']]) rowBuilding(f, 1, color, 29, 25, 17, true, title);
    for (let i = 0; i < (mobile ? 12 : 19); i++) { const z = -320 + i * 38; if (track.nearest(-362, z).distance > track.wallOffset + 5) palm(-362, z, 9.5 + i % 3); }
    b.setFrame(65, 80); b.reserve(65, 80, 55, 'Old Nice terracotta district');
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 20; box(18, 22 + i % 2 * 4, 29, b.material(['#d5a884', '#e2bc98', '#cba78b'][i % 3]), x, 11 + i % 2 * 2, 0); pitchedRoof(19, 30, 22 + i % 2 * 4, 5.5, x); }
  } else if (city === 'warwick') {
    const timber = b.material('#51463a', { roughness: .93 }), plaster = b.material('#e3dbc4', { roughness: .94 });
    const lawn = b.material('#809275', { roughness: .97 });
    water(1700, 135, 0, -422.5, 2.6, '#768b7c');
    b.setFrame(-85, 115, -.05); b.reserve(-85, 115, 130, 'Warwick Castle — medieval courtyard and towers'); landmarkVista(-155, 65);
    b.sphere(131, 11, 104, stone, 0, -4, 0); box(170, .7, 125, lawn, 0, 6.6, 0);
    for (const side of [-1, 1]) {
      box(159, 16, 5, stone, 0, 15, side * 57);
      for (let x = -76; x <= 76; x += 3.9) box(2, 1.8, 5.2, stone, x, 23.9, side * 57);
      box(5, 15, 111, stone, side * 77, 14.5, 0);
      for (let z = -51; z <= 51; z += 4) box(5.2, 1.8, 2, stone, side * 77, 22.9, z);
    }
    // Caesar's tower begins lower on the bluff; its true silhouette is taller.
    for (const [x, z, height, radius, label] of [[-77, -57, 40, 11, 'Caesar’s Tower — 40 m'], [77, -57, 29, 12, 'Guy’s Tower — 29 m'], [-77, 57, 22, 8, 'Castle corner tower'], [77, 57, 25, 8.5, 'Castle corner tower']]) {
      b.cylinder(radius, radius + 1.3, height, stone, x, 7 + height / 2, z, mobile ? 18 : 28);
      b.cylinder(radius + .65, radius + .45, 1.2, trim, x, 7 + height, z, mobile ? 18 : 28);
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; box(1.5, 1.65, 1.25, stone, x + Math.cos(a) * radius, 8.4 + height, z + Math.sin(a) * radius, -a); }
      for (let floor = 0; floor < Math.floor(height / 8); floor++) for (const side of [-1, 1]) box(.6, 2.2, .1, dark, x + side * radius * .31, 12 + floor * 7, z - radius - .12);
      b.reserve(-85 + x, 115 + z, radius + 3, label);
    }
    box(92, 25, 22, stone, 0, 19.5, 42); pitchedRoof(96, 26, 32, 9, 0, 42);
    windows(92, 24, 22, 4, 15, false, 42, 7); // Courtyard windows on the domestic range.
    for (let i = -3; i <= 3; i++) { box(2.2, 5, 2, stone, i * 13, 39.8, 42); b.cylinder(.24, .26, .9, timber, i * 13, 42.8, 42, 7); }
    // Gatehouse has a true open gateway flanked by circular guard towers.
    arch(26, 21, 8, 5.5, 9, stone, 0, 7, -57);
    for (const x of [-13, 13]) {
      b.cylinder(6, 6.4, 23, stone, x, 18.5, -57, 20); b.cylinder(6.6, 6.6, 1, trim, x, 30.5, -57, 20);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; box(1.4, 1.6, 1.1, stone, x + Math.cos(a) * 6.2, 31.8, -57 + Math.sin(a) * 6.2, -a); }
    }
    for (let i = -3; i <= 3; i++) box(.17, 9, .17, timber, i, 12.3, -62);
    b.sign('WARWICK CASTLE', 'RIVER AVON · WARWICKSHIRE', 32, 3.8, 0, 6, -68, '#586352');
    b.setFrame(150, -454, 0, 0); arch(105, 13, 43, 0, 9, stone, 0, 0, 0, 10.5); box(108, .8, 11, stone, 0, 13.4, 0);
    for (const side of [-1, 1]) { box(108, 1.1, .7, stone, 0, 14.3, side * 5); for (let x = -50; x < 50; x += 4) box(.5, 1.2, .95, trim, x, 14.4, side * 5); }
    b.reserve(150, -454, 60, 'Castle Bridge over the River Avon');
    for (const fraction of [.08, .21, .39, .6, .76, .9]) {
      b.place(fraction, 1, track.wallOffset + 29, 25, 17, 'Warwick timber-framed town house');
      box(23, 13, 15, plaster); pitchedRoof(25, 17, 13, 7);
      for (const side of [-1, 1]) {
        for (let x = -11; x <= 11; x += 3.67) box(.28, 13, .22, timber, x, 6.5, side * 7.6);
        for (const y of [1, 5.1, 9.5, 13]) box(23.5, .3, .24, timber, 0, y, side * 7.65);
        for (let x = -9; x < 10; x += 6) { b.beam([x - 2, 5.3, side * 7.7], [x + 2, 9.3, side * 7.7], .19, timber); b.beam([x + 2, 5.3, side * 7.7], [x - 2, 9.3, side * 7.7], .19, timber); }
        for (const y of [3, 11]) for (const x of [-7, 0, 7]) {
          box(2.2, 2.2, .14, dark, x, y, side * 7.8); for (const xx of [-.65, 0, .65]) box(.06, 2.2, .1, trim, x + xx, y, side * 7.9); box(2.2, .06, .1, trim, x, y, side * 7.9);
        }
      }
      box(1.5, 4, 1.5, stone, 7, 19.8, 0); b.sign('WARWICK', 'HISTORIC TOWN', 9, 1.6, 0, 4.6, -7.95, '#586352');
    }
  }
  const result = b.finish();
  result.group.userData.landmarks = result.reserved.map(({ name }) => name);
  const setQuality = result.setQuality;
  result.setQuality = quality => {
    setQuality(quality);
    result.group.children.forEach(mesh => { if (waterMaterials.has(mesh.material)) mesh.castShadow = false; });
  };
  result.setQuality('medium');
  result.update = (_state, elapsed) => waterMaterials.forEach(mat => { if (mat.normalMap) mat.normalMap.offset.set(elapsed * .004, elapsed * .003); });
  return result;
}
