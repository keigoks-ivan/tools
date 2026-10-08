import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js';
import { addAustralianLandmarks, createCityWaterMaterial, addCityWaterPlane } from './world-city-australia.js';
import { addAmericanLandmarks } from './world-city-america.js';
import { addEuropeanLandmarks } from './world-city-europe.js';

function archGeometry(width, height, depth, radius, openings = 1) {
  const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(width / 2, height); shape.lineTo(-width / 2, height); shape.closePath();
  for (let i = 0; i < openings; i++) {
    const center = (i - (openings - 1) / 2) * width / (openings + .35);
    const hole = new THREE.Path(); hole.moveTo(center - radius, -.1); hole.lineTo(center - radius, height * .48); hole.absarc(center, height * .48, radius, Math.PI, 0, true); hole.lineTo(center + radius, -.1); hole.closePath(); shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }); geometry.translate(0, 0, -depth / 2); return geometry;
}
function addAsianLandmarks(options) {
  const { track, mobile } = options, b = createCityBuilder(options);
  const water = createCityWaterMaterial(track.id === 'hanoi' ? '#587e72' : '#796e57');
  if (track.id === 'bangkok') addCityWaterPlane(b, water, 0, -507.5, 5000, 245);
  const stone = b.surface(options.materials.concrete, '#d6d0b9');
  const white = b.surface(options.materials.concrete, '#e1decf');
  const yellow = b.surface(options.materials.concrete, '#d6bc7c');
  const gold = b.material('#c5a04a', { metalness: .68, roughness: .39 });
  const red = b.material('#a82e25', { roughness: .64 });
  const roof = b.material('#6a7066', { metalness: .32, roughness: .59 });
  const dark = b.material('#304a4c', { metalness: .22, roughness: .34 });
  function tierRoof(width, depth, y, x = 0, z = 0, mat = roof) {
    const geometry = new THREE.CylinderGeometry(0, 1, 1, 4); geometry.rotateY(Math.PI / 4); geometry.scale(width / Math.sqrt(2), 2.2, depth / Math.sqrt(2));
    b.bake(geometry, mat, x, y + 1.1, z);
    for (const side of [-1, 1]) b.box(width, .23, .25, mat, x, y + .05, z + side * depth / 2);
  }
  function templeHall(width, depth, x, z, thai = false) {
    b.box(width, 8, depth, white, x, 4, z);
    for (const side of [-1, 1]) for (let zz = -depth / 2 + 2; zz < depth / 2; zz += 3.5) b.cylinder(.26, .32, 7, gold, x + side * width * .43, 3.5, z + zz, 8);
    for (let layer = 0; layer < 3; layer++) tierRoof(width + 4 - layer * 2, depth + 3 - layer * 2.5, 8 + layer * 2, x, z, thai ? red : roof);
    if (thai) for (const side of [-1, 1]) {
      b.beam([x, 11, z + side * depth / 2], [x, 18, z + side * (depth / 2 + 2)], .45, gold);
      b.beam([x - width * .48, 8, z + side * depth / 2], [x - width * .49, 11, z + side * (depth / 2 + 2)], .25, gold);
      b.beam([x + width * .48, 8, z + side * depth / 2], [x + width * .49, 11, z + side * (depth / 2 + 2)], .25, gold);
    }
  }
  if (track.id === 'bangkok') {
    const hull = b.material('#694b38', { roughness: .71 }), blue = b.material('#417aa1', { roughness: .58 });
    for (const [x, z, yaw] of [[-190, -463, .5], [105, -526, -.6], [255, -460, -.2]]) {
      b.setFrame(x, z, yaw, -.1);
      const outline = new THREE.Shape(); outline.moveTo(-1.2, -8); outline.lineTo(-1.65, -5); outline.lineTo(-1.65, 6); outline.lineTo(0, 10); outline.lineTo(1.65, 6); outline.lineTo(1.65, -5); outline.lineTo(1.2, -8); outline.closePath();
      const boat = new THREE.ExtrudeGeometry(outline, { depth: .65, bevelEnabled: false }); boat.rotateX(-Math.PI / 2); b.bake(boat, hull);
      b.box(3.0, .08, 11.5, blue, 0, 2.1, -1);
      for (const side of [-1, 1]) for (const zz of [-5, 3]) b.beam([side * 1.3, .7, zz], [side * 1.3, 2.1, zz], .065, white);
      b.box(3.1, .16, 15.5, red, 0, .75, -.5); b.box(2.6, .18, 14.5, hull, 0, .87, -.5);
      b.beam([0, .7, -7.2], [0, .12, -12], .15, dark);
    }
    b.setFrame(-65, 45); b.reserve(-65, 45, 104, 'Wat Arun temple precinct');
    b.box(100, 1.2, 110, stone, 0, .6, 0);
    function prang(x, z, h) {
      const tiers = [[0, .20], [.06, .18], [.15, .14], [.25, .12], [.36, .10], [.48, .078], [.62, .056], [.78, .035], [.91, .016]];
      for (let i = 0; i < tiers.length - 1; i++) {
        const [a, r] = tiers[i], [next, top] = tiers[i + 1], height = (next - a) * h;
        b.cylinder(top * h, r * h, height, white, x, (a + next) * h / 2, z, 12);
        b.cylinder(r * h + .6, r * h + .9, .6, stone, x, a * h + .3, z, 12);
        const count = mobile ? 12 : 20;
        for (let j = 0; j < count; j++) {
          const angle = j / count * Math.PI * 2, radius = r * h;
          b.box(.4, .7, .35, j % 3 ? gold : red, x + Math.sin(angle) * radius, a * h + 1.1, z + Math.cos(angle) * radius, 0, angle);
        }
      }
      b.cylinder(0, .014 * h, .10 * h, gold, x, .96 * h, z, 8);
      for (const side of [-1, 1]) for (let step = 0; step < 16; step++) b.box(4.5, .7, 1.2, stone, x, .7 * step + 1, z + side * (h * .22 - step * .7));
    }
    prang(0, 0, 82);
    for (const x of [-32, 32]) for (const z of [-34, 34]) prang(x, z, 29);
    templeHall(26, 42, 140, 5, true); b.reserve(75, 50, 36, 'Wat Arun ceremonial hall');
    b.sign('วัดอรุณ', 'WAT ARUN · TEMPLE OF DAWN', 22, 4, 0, 4, -55.7, '#635343');
    b.place(.34, 1, 86, 26, 28, 'Bangkok golden chedi'); b.cylinder(12, 15, 3, white, 0, 1.5, 0, 12);
    for (let tier = 0; tier < 10; tier++) b.cylinder(8.5 - tier * .7, 10 - tier * .7, 1.2, gold, 0, 4 + tier * 1.2, 0, 24);
    b.cylinder(0, 3.2, 16, gold, 0, 23, 0, 24);
    b.place(.78, -1, 29, 8, 14, 'Bangkok tuk tuk stop');
    for (let i = -1; i <= 1; i++) {
      b.box(1.6, .55, 2.7, i % 2 ? red : gold, i * 2.3, .7, 0); b.box(1.6, .12, 1.7, dark, i * 2.3, 1.85, -.3);
      for (const side of [-1, 1]) b.beam([i * 2.3 + side * .65, 1, .35], [i * 2.3 + side * .65, 1.85, .35], .08, dark);
      for (const side of [-1, 1]) b.cylinder(.28, .28, .15, dark, i * 2.3 + side * .65, .3, -.75, 12, 0, 0, Math.PI / 2);
      b.cylinder(.28, .28, .15, dark, i * 2.3, .3, 1, 12, 0, 0, Math.PI / 2);
    }
  } else if (track.id === 'hanoi') {
    b.setFrame(0, 0, 0, 1.4); b.reserve(0, 0, 188, 'Hoan Kiem Lake');
    const lake = new THREE.CircleGeometry(1, mobile ? 64 : 96); lake.rotateX(-Math.PI / 2); lake.scale(140, 1, 180); b.bake(lake, water);
    const shorePositions = [], shoreIndices = [], shoreline = mobile ? 64 : 96;
    for (let i = 0; i <= shoreline; i++) {
      const a = i / shoreline * Math.PI * 2;
      shorePositions.push(Math.sin(a) * 140, -.2, Math.cos(a) * 180, Math.sin(a) * 147, 2.0, Math.cos(a) * 187);
      if (i) { const k = i * 2; shoreIndices.push(k, k - 2, k + 1, k + 1, k - 2, k - 1); }
    }
    const bank = new THREE.BufferGeometry(); bank.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3)); bank.setIndex(shoreIndices); bank.computeVertexNormals(); b.bake(bank, stone);
    b.sphere(14, 1.9, 10, stone, -20, .7, 15); b.setFrame(-20, 15, 0, 3.1);
    const weatheredStone = b.surface(options.materials.concrete, '#c1c3af');
    for (let tier = 0; tier < 3; tier++) {
      const width = 10 - tier * 2.4, depth = 7.4 - tier * 1.7, y = tier * 3.6;
      b.box(width, .5, depth, white, 0, y + .25, 0);
      for (const side of [-1, 1]) {
        b.bake(archGeometry(width, 2.9, .6, tier === 2 ? .7 : width * .085, tier === 2 ? 1 : 3), weatheredStone, 0, y + .45, side * depth / 2);
        b.bake(archGeometry(depth, 2.9, .6, tier === 2 ? .6 : .7, tier === 2 ? 1 : 2), weatheredStone, side * width / 2, y + .45, 0, 0, Math.PI / 2);
      }
      b.box(width + .65, .28, depth + .65, weatheredStone, 0, y + 3.4, 0);
      for (const side of [-1, 1]) { b.box(width + .65, .35, .18, weatheredStone, 0, y + 3.64, side * (depth + .45) / 2); b.box(.18, .35, depth + .65, weatheredStone, side * (width + .45) / 2, y + 3.64, 0); }
    }
    tierRoof(4, 3, 11.4, 0, 0, weatheredStone);
    b.setFrame(60, 75, -.45, 2.5); b.reserve(60, 75, 50, 'The Huc bridge and Ngoc Son temple');
    for (let step = 0; step < 24; step++) {
      const z = -26 + step * 2.2, elevation = 1.2 + Math.sin(step / 23 * Math.PI) * 1.5;
      b.box(3.7, .15, 2.28, red, 0, elevation, z);
      for (const side of [-1, 1]) { b.box(.12, 1.4, .12, red, side * 1.75, elevation + .7, z); b.box(.10, .10, 2.5, red, side * 1.75, elevation + 1.4, z); }
      if (step % 4 === 0) for (const side of [-1, 1]) b.cylinder(.19, .22, 3.5, red, side * 1.25, elevation - 1.75, z, 8);
    }
    b.box(21, 1, 17, stone, 0, 1, 33); templeHall(12, 9, 0, 32);
    b.place(.53, 1, 102, 70, 44, 'Hanoi Opera House');
    b.box(70, 15, 42, yellow, 0, 7.5, 0); b.box(71, .9, 43, white, 0, 15, 0); b.box(70, .9, 43, white, 0, 4, 0);
    for (let x = -29; x <= 29; x += 7.3) {
      b.cylinder(.5, .6, 10.5, white, x, 9, -22, 12); b.box(3.8, 4.4, .08, dark, x, 10, -21.1);
      b.bake(archGeometry(5, 3.7, .7, 1.55), white, x, .5, -21.6);
    }
    b.box(73, 1.2, 45, white, 0, 16, 0); b.box(32, 4, 24, yellow, 0, 18.5, 0); tierRoof(35, 27, 20.8);
    for (const side of [-1, 1]) { b.sphere(8, 5, 7, roof, side * 27, 20, 0); b.cylinder(0, 1.6, 3, roof, side * 27, 26, 0, 8); }
    b.sign('NHÀ HÁT LỚN HÀ NỘI', 'HANOI OPERA HOUSE', 28, 2.3, 0, 15, -22.9, '#8c7043');
  }
  const result = b.finish();
  for (const mesh of result.shadowMeshes) if (mesh.material === water) mesh.castShadow = false;
  return { ...result, update(_state, elapsed) { water.normalMap.offset.set(elapsed * .006, elapsed * .004); }, setQuality(quality) { result.setQuality(quality); for (const mesh of result.shadowMeshes) if (mesh.material === water) mesh.castShadow = false; } };
}

export function addExtraCityLandmarks(options) {
  if (['bangkok', 'hanoi'].includes(options.track.id)) return addAsianLandmarks(options);
  if (['sydney', 'goldcoast', 'melbourne'].includes(options.track.id)) return addAustralianLandmarks(options);
  if (['sanfrancisco', 'newyork', 'vancouver'].includes(options.track.id)) return addAmericanLandmarks(options);
  if (['paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick'].includes(options.track.id)) return addEuropeanLandmarks(options);
  return { reserved: [] };
}
