import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function random(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function signMap(title, sub, background = '#262c29', aspect = 4) {
  const canvas = document.createElement('canvas'), wide = aspect > 8;
  canvas.width = wide ? 2048 : 1024; canvas.height = wide ? Math.max(64, Math.round(canvas.width / aspect)) : 256;
  const context = canvas.getContext('2d'); context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#eddfbb';
  if (wide) {
    context.textAlign = 'center'; context.font = `700 ${Math.round(canvas.height * .51)}px Arial`;
    context.fillText(title, canvas.width * .5, canvas.height * .54);
    context.fillStyle = '#c2c9c0'; context.font = `${Math.round(canvas.height * .15)}px Arial`;
    context.fillText(sub, canvas.width * .5, canvas.height * .84);
  } else {
    context.fillRect(26, 35, 7, 181);
    let size = 96; context.font = `700 ${size}px Arial`;
    while (context.measureText(title).width > 920 && size > 40) { size -= 4; context.font = `700 ${size}px Arial`; }
    context.fillText(title, 55, 130);
    context.fillStyle = '#c2c9c0'; context.font = '27px Arial'; context.fillText(sub, 60, 193);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function surface(base, color, values = {}) {
  const material = base?.clone() || new THREE.MeshStandardMaterial();
  material.color.set(color); Object.assign(material, { roughness: .9 }, values); return material;
}
function rockGeometry(seed, width, height, depth, layers = 11) {
  const rand = random(seed), sides = 22, positions = [], uv = [], indices = [];
  const profile = Array.from({ length: sides }, (_, i) => 1 + Math.sin(i * 1.7 + seed) * .12 + rand() * .12);
  for (let layer = 0; layer <= layers; layer++) {
    const elevation = layer / layers, taper = 1 - elevation * .35;
    for (let side = 0; side <= sides; side++) {
      const index = side % sides, angle = side / sides * Math.PI * 2;
      const ledge = Math.sin(layer * 2.24 + seed) * .046 + Math.sin(layer * .82) * .031;
      const radius = profile[index] * (taper + ledge);
      const x = Math.cos(angle) * width * .5 * radius, z = Math.sin(angle) * depth * .5 * radius;
      const y = elevation * height + Math.sin(angle * 3 + seed) * elevation * height * .085;
      positions.push(x, y, z); uv.push(side / sides * width / 3, elevation * height / 3);
      if (layer < layers && side < sides) { const k = layer * (sides + 1) + side, next = k + sides + 1; indices.push(k, next, k + 1, next, next + 1, k + 1); }
    }
  }
  const top = positions.length / 3; positions.push(0, height * .98, 0); uv.push(.5, .5);
  for (let side = 0; side < sides; side++) { const k = layers * (sides + 1) + side; indices.push(top, k + 1, k); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

// Bake small architectural components together so details do not add one draw call each.
export function addLandmarks({ scene, track, mobile = false, groundHeight, materials = {} }) {
  const theme = track.theme, rand = random(4973), batches = new Map(), shadowMeshes = [];
  const concrete = surface(materials.concrete, '#b9bab2');
  const plaster = surface(materials.concrete, theme === 'canyon' ? '#b49c77' : '#d9d1bc');
  const stone = surface(materials.rock, theme === 'canyon' ? '#bb9470' : theme === 'alpine' ? '#89918d' : '#bbb5a2');
  const darkStone = surface(materials.rock, theme === 'canyon' ? '#986948' : '#777e75');
  const timber = new THREE.MeshStandardMaterial({ color: theme === 'alpine' ? '#695446' : '#8d7458', roughness: .95 });
  const steel = new THREE.MeshStandardMaterial({ color: '#5c6664', roughness: .46, metalness: .75 });
  const dark = new THREE.MeshStandardMaterial({ color: '#313b36', roughness: .76, metalness: .18 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#5c797d', metalness: .22, roughness: .12, clearcoat: .9 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d5dbd5', roughness: .52, metalness: .35 });
  const tile = [0, 1, 2].map(i => new THREE.MeshStandardMaterial({ color: ['#996c50', '#85573e', '#b07b54'][i], roughness: .97 }));
  const roof = new THREE.MeshStandardMaterial({ color: theme === 'alpine' ? '#505d59' : '#7f6751', roughness: .81, metalness: theme === 'alpine' ? .4 : 0 });
  const seatBlue = new THREE.MeshStandardMaterial({ color: '#45748b', roughness: .85 });
  const seatGrey = new THREE.MeshStandardMaterial({ color: '#b1b8ad', roughness: .86 });
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
  let frame = new THREE.Matrix4();
  function bake(geometry, material, x, y, z, rx = 0, ry = 0, rz = 0, metric = false) {
    rotation.setFromEuler(new THREE.Euler(rx, ry, rz)); matrix.compose(new THREE.Vector3(x, y, z), rotation, scale);
    geometry.applyMatrix4(matrix); geometry.applyMatrix4(frame);
    if (metric) {
      const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) {
        const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i)), az = Math.abs(normal.getZ(i));
        if (ay > ax && ay > az) uv.setXY(i, position.getX(i) / 3, position.getZ(i) / 3);
        else if (ax > az) uv.setXY(i, position.getZ(i) / 3, position.getY(i) / 3);
        else uv.setXY(i, position.getX(i) / 3, position.getY(i) / 3);
      }
    }
    if (!batches.has(material)) batches.set(material, []); batches.get(material).push(geometry);
  }
  function box(w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) { bake(new THREE.BoxGeometry(w, h, d), material, x, y, z, rx, ry, rz, !!material.map); }
  function cylinder(radius, length, material, x, y, z, rx = 0, ry = 0, rz = 0, segments = 8) { bake(new THREE.CylinderGeometry(radius, radius, length, segments), material, x, y, z, rx, ry, rz); }
  function beam(a, b, thickness, material = steel) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start), mid = start.add(end).multiplyScalar(.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const geometry = new THREE.BoxGeometry(thickness, direction.length(), thickness);
    geometry.applyQuaternion(quaternion); bake(geometry, material, mid.x, mid.y, mid.z);
  }
  function setFrame(distance, offset, along = 0) {
    const point = track.sample(distance), x = point.x + point.nx * offset + Math.sin(point.heading) * along, z = point.z + point.nz * offset + Math.cos(point.heading) * along;
    frame = new THREE.Matrix4().compose(new THREE.Vector3(x, groundHeight(x, z), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), point.heading), scale);
    return point;
  }
  function foundation(width, depth, centerX, centerZ, top, material = stone) {
    const columns = Math.ceil(width / 3), rows = Math.ceil(depth / 3), cellWidth = width / columns, cellDepth = depth / rows;
    const originY = new THREE.Vector3().setFromMatrixPosition(frame).y;
    for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
      const x = centerX - width * .5 + (column + .5) * cellWidth, z = centerZ - depth * .5 + (row + .5) * cellDepth;
      let bottom = top - .7;
      for (const dx of [-.5, 0, .5]) for (const dz of [-.5, 0, .5]) {
        const point = new THREE.Vector3(x + dx * cellWidth, 0, z + dz * cellDepth).applyMatrix4(frame);
        bottom = Math.min(bottom, groundHeight(point.x, point.z) - originY - .85);
      }
      box(cellWidth + .025, top - bottom, cellDepth + .025, material, x, (top + bottom) * .5, z);
    }
  }
  function windowFace(x, y, z, width, height, shutter = false) {
    box(.07, height, width, glass, x, y, z);
    for (const dz of [-width / 2, 0, width / 2]) box(.16, height + .12, .065, trim, x - .03, y, z + dz);
    for (const dy of [-height / 2, height / 2]) box(.17, .065, width + .18, trim, x - .05, y + dy, z);
    if (shutter) for (const side of [-1, 1]) {
      box(.11, height + .1, width * .39, dark, x - .1, y, z + side * width * .73);
      for (let row = 0; row < 9; row++) box(.15, .075, width * .32, timber, x - .15, y - height * .44 + row * height / 10, z + side * width * .73, 0, 0, .15);
    }
  }
  function roofGable(width, depth, height, rise, centerZ, tiled = false) {
    const slope = Math.atan2(rise, width * .5), panelWidth = Math.hypot(width * .5, rise);
    for (const side of [-1, 1]) {
      const angle = -side * slope;
      box(panelWidth + .5, .16, depth + 1.1, tiled ? tile[1] : roof, side * width * .25, height + rise * .5, centerZ, 0, 0, angle);
      if (tiled) {
        const rows = Math.ceil(panelWidth / .52), columns = Math.ceil(depth / .25), prototype = new THREE.CylinderGeometry(.105, .105, .56, mobile ? 5 : 7, 1, true, 0, Math.PI);
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
          const distance = (row + .5) * panelWidth / rows;
          const x = side * (width * .5 - distance * Math.cos(slope)), y = height + distance * Math.sin(slope) + .14;
          const z = centerZ - depth * .5 + (col + .5) * depth / columns;
          bake(prototype.clone(), tile[(row + col * 2) % tile.length], x, y, z, 0, 0, Math.PI / 2 - side * slope);
        }
        prototype.dispose();
      } else {
        for (let z = centerZ - depth * .5; z <= centerZ + depth * .5; z += .8) box(panelWidth + .5, .09, .045, steel, side * width * .25, height + rise * .5 + .13, z, 0, 0, angle);
      }
    }
    for (const z of [centerZ - depth * .5, centerZ + depth * .5]) {
      const geometry = new THREE.BufferGeometry();
      const front = z < centerZ;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([-width / 2, height, z, width / 2, height, z, 0, height + rise, z], 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, width / 3, 0, width / 6, rise / 3], 2));
      geometry.setIndex(front ? [0, 2, 1] : [0, 1, 2]); geometry.computeVertexNormals(); bake(geometry, tiled ? plaster : timber, 0, 0, 0);
    }
    box(.24, .24, depth + 1.2, tiled ? tile[0] : steel, 0, height + rise + .1, centerZ);
  }
  function fence(distance, offset, length, height = 2.6) {
    const wire = [], wireColor = new THREE.Color('#72807b');
    for (let s = distance; s < distance + length; s += 4) {
      const a = track.sample(s), b = track.sample(Math.min(s + 4, distance + length));
      const ax = a.x + a.nx * offset, az = a.z + a.nz * offset, bx = b.x + b.nx * offset, bz = b.z + b.nz * offset;
      const ay = groundHeight(ax, az), by = groundHeight(bx, bz);
      frame.identity(); cylinder(.055, height + .2, steel, ax, ay + height / 2, az);
      for (let y = .4; y <= height; y += .5) wire.push(ax, ay + y, az, bx, by + y, bz);
      for (let t = .125; t < 1; t += .125) {
        const x = THREE.MathUtils.lerp(ax, bx, t), z = THREE.MathUtils.lerp(az, bz, t), y = THREE.MathUtils.lerp(ay, by, t);
        wire.push(x, y, z, x, y + height, z);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: .46 })); scene.add(mesh);
  }
  function retainingWall(distance, length, side, offset, height = 2) {
    for (let s = distance; s < distance + length; s += 4.2) {
      const point = setFrame(s, offset * side); box(1.6, height, 4.3, stone, 0, height * .4, 2.1); box(1.9, .21, 4.35, concrete, 0, height * .9 + .1, 2.1);
      for (let row = 0; row < 3; row++) for (let block = 0; block < 4; block++) {
        box(.065, .05, .98, darkStone, -side * .83, row * height / 3, .57 + block * 1.05);
        box(.07, height / 3 - .05, .045, darkStone, -side * .83, height * (row + .5) / 3 - .1, block * 1.05 + (row % 2 ? .5 : 0));
      }
      if (Math.abs(point.curvature) > .03) break;
    }
  }

  if (theme === 'costa') {
    setFrame(22, 35);
    foundation(21, 45, 0, 6, -.28);
    box(21, .4, 45, stone, 0, -.12, 6); box(12, 6.2, 23, plaster, 0, 3.1, 11);
    box(12.4, .24, 23.3, stone, 0, .25, 11); box(12.3, .15, 23.4, plaster, 0, 3.3, 11);
    roofGable(13, 24, 6.25, 2.15, 11, true);
    box(1.2, 2.5, 1.05, plaster, 3.3, 8.7, 18); box(1.45, .16, 1.3, stone, 3.3, 10, 18);
    for (let z = 3; z <= 20; z += 5.6) {
      windowFace(-6.06, 4.78, z, 1.6, 1.65, true);
      box(.09, 2.35, 3.4, dark, -6.1, 1.47, z);
      for (let row = 0; row < 11; row++) box(.12, .025, 3.15, trim, -6.17, .42 + row * .21, z);
    }
    box(5.5, 3.05, 9, plaster, 7.2, 1.52, -5);
    const villaFrame = frame.clone(); frame.multiply(new THREE.Matrix4().makeTranslation(7.2, 0, 0));
    roofGable(6.2, 9.6, 3.1, 1.3, -5, true); frame.copy(villaFrame);
    for (let z = -13; z < 29; z += 4.8) box(.45, 1, .45, stone, -10.3, .5, z);
    for (const y of [.35, .78]) box(.08, .055, 43, steel, -10.3, y, 7.5);
    for (const z of [-8, 24]) { box(4, .16, 2.4, timber, -8.7, 1.15, z); for (const dz of [-.85, .85]) box(3.3, .16, .38, timber, -8.7, .58, z + dz); }
    const boardMaterial = new THREE.MeshBasicMaterial({ map: signMap('CAPO AZZURRO', 'COASTAL MOTOR CLUB · PADDOCK') });
    bake(new THREE.PlaneGeometry(8, 1.3), boardMaterial, -6.19, 3.4, 11, 0, -Math.PI / 2);
    retainingWall(track.length * .16, 108, -1, track.wallOffset + 3.6, 1.45);
    for (let position = -250; position < 250; position += 47) {
      const z = position + (rand() - .5) * 15, x = -223 + Math.sin(z * .017) * 7, nearest = track.nearest(x, z);
      if (nearest.distance < track.wallOffset + 12) continue;
      const top = Math.max(1.2, Math.min(nearest.y - 2.5, groundHeight(x, z) + 1.5));
      frame.identity(); bake(rockGeometry(71 + position, 17 + rand() * 8, (top + 2.8) / 1.085, 18 + rand() * 7, 9), stone, x, -2.8, z);
      bake(rockGeometry(19 + position, 10, 3.1 + rand() * 1.6, 12, 8), darkStone, x - 9, -2.8, z + 11);
    }
  } else if (theme === 'alpine') {
    setFrame(18, 34);
    foundation(22, 41, 0, 8, -.29);
    box(22, .4, 41, stone, 0, -.14, 8); box(14, 3.2, 24, stone, 0, 1.6, 10); box(14, 4.6, 24, timber, 0, 5.5, 10);
    roofGable(17, 28, 7.6, 3.1, 10);
    for (let y = 3.4; y < 7.8; y += .22) box(.13, .055, 24, dark, -7.05, y, 10);
    for (let z = 1; z < 23; z += 4.3) { windowFace(-7.14, 5.95, z, 1.7, 1.8, true); windowFace(-7.08, 1.9, z, 1.65, 1.4); }
    box(2.6, .18, 25, timber, -7.6, 4.1, 10);
    for (const z of [-2, 5, 12, 21]) { box(.23, 7.5, .23, timber, -8.7, 3.7, z); beam([-8.7, 3.9, z], [-7.05, 5.1, z], .16, timber); }
    for (let z = -2; z <= 22; z += .28) box(.075, 1, .065, timber, -8.8, 4.65, z);
    box(.15, .12, 25, timber, -8.8, 5.15, 10); box(1.15, 3, 1.2, stone, 3.5, 10.4, 17);
    const boardMaterial = new THREE.MeshBasicMaterial({ map: signMap('ALPINE PASS', 'SUMMIT LODGE · MOTOR CLUB', '#493e35') });
    bake(new THREE.PlaneGeometry(8, 1.25), boardMaterial, -7.2, 3.2, 10, 0, -Math.PI / 2);
    retainingWall(track.length * .31, 85, 1, track.wallOffset + 5.2, 2.6);
    retainingWall(track.length * .64, 72, -1, track.wallOffset + 5.2, 2.1);
    for (const [fraction, side] of [[.22, 1], [.39, -1], [.59, 1], [.77, -1]]) {
      for (let j = 0; j < (mobile ? 4 : 6); j++) {
        setFrame(track.length * fraction + j * 10, side * (track.wallOffset + 16 + rand() * 8));
        bake(rockGeometry(j + fraction * 923, 13 + rand() * 9, 8 + rand() * 8, 18, 9), stone, 0, -2, 0);
      }
    }
  } else if (theme === 'canyon') {
    setFrame(15, 38);
    foundation(26, 40, 0, 9, -.16);
    box(26, .2, 40, stone, 0, -.1, 9); box(10, 3.7, 19, plaster, 3, 1.85, 9); box(11.1, .22, 21, roof, 3, 3.87, 9, 0, 0, -.025);
    for (let z = 1; z < 17; z += 6) windowFace(-2.08, 2, z, 2.2, 1.6);
    box(8.8, .15, 18, steel, -5.8, 4.12, 9);
    for (const z of [1, 17]) for (const x of [-9.9, -2.4]) { box(.16, 4.1, .16, steel, x, 2, z); beam([x, 3.8, z], [x + 1.2, 4.13, z], .12); }
    const boardMaterial = new THREE.MeshBasicMaterial({ map: signMap('RED ROCK', 'DESERT SERVICE · WATER · FUEL', '#524537') });
    bake(new THREE.PlaneGeometry(8.4, 1.2), boardMaterial, -10.02, 4.8, 9, 0, -Math.PI / 2);
    for (const z of [4, 11]) { box(.95, 1.7, .65, trim, -7.8, .85, z); box(.04, .4, .46, dark, -8.29, 1.22, z); cylinder(.2, 1.3, steel, -5.8, .65, z + 3); }
    cylinder(1.25, 4.4, steel, 12, 2.4, 19); box(3.3, .2, 3.2, steel, 12, 4.7, 19);
    for (const [fraction, side] of [[.24, 1], [.42, -1], [.56, 1], [.7, -1], [.89, 1]]) {
      const count = mobile ? 4 : 6;
      for (let j = 0; j < count; j++) {
        setFrame(track.length * fraction + j * 18, side * (track.wallOffset + 30 + rand() * 8));
        bake(rockGeometry(23 + j + fraction * 378, 26 + rand() * 13, 17 + rand() * 15, 28, 13), j % 2 ? darkStone : stone, 0, -3, 0);
      }
    }
  } else {
    setFrame(30, 35);
    foundation(23, 113, 0, 41, -.22, concrete);
    box(23, .28, 113, concrete, 0, -.12, 41); box(16, 4.6, 96, concrete, 1, 2.3, 43);
    box(16.6, .3, 99, steel, 1, 4.78, 43); box(14.5, 3.6, 93, concrete, 2, 6.75, 43);
    box(18, .22, 101, trim, .3, 8.7, 43); box(2.3, .18, 96, concrete, -7.5, 4.72, 43);
    for (let z = -.5; z < 88; z += 8) {
      box(.16, 3.7, 7.15, dark, -7.12, 2.05, z);
      for (let slat = 0; slat < 17; slat++) box(.19, .025, 7.05, trim, -7.23, .28 + slat * .22, z);
      windowFace(-5.35, 6.9, z, 6.5, 2.5);
      box(.3, 4.5, .3, steel, -7.65, 2.25, z - 4); box(.23, 3.75, .23, steel, -5.55, 6.6, z - 4);
      box(.38, .7, .45, trim, -8, 3.7, z + 2.5);
    }
    for (let z = -5; z <= 92; z += 1.8) { box(.065, 1.15, .065, steel, -8.62, 5.35, z); }
    box(.08, .07, 98, steel, -8.62, 5.97, 43);
    const pitSign = new THREE.MeshBasicMaterial({ map: signMap('APEX INTERNATIONAL', 'PIT LANE · TIME ATTACK', '#262c29', 30 / 1.15) });
    bake(new THREE.PlaneGeometry(30, 1.15), pitSign, -5.6, 8.4, 43, 0, -Math.PI / 2);
    for (const z of [6, 31, 63, 87]) { box(3.5, .5, 2.6, trim, 3, 9.04, z); box(3, .16, 2.3, dark, 3, 9.4, z); }

    setFrame(64, -37); frame.multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    const rows = 9, columns = mobile ? 44 : 54, rowDepth = 1.7, rowRise = .59, width = columns * .62 + 4;
    foundation(width + 4, rows * rowDepth + 3, 0, 5.6, 0, concrete);
    for (let row = 0; row < rows; row++) {
      const z = row * rowDepth, y = .5 + row * rowRise;
      box(width, .35, rowDepth, concrete, 0, y - .175, z);
      for (let col = 0; col < columns; col++) {
        if (col === 13 || col === 14 || col === 31 || col === 32) continue;
        const x = (col - columns * .5) * .62, material = (row + Math.floor(col / 8)) % 4 ? seatBlue : seatGrey;
        box(.48, .12, .43, material, x, y + .38, z + .2); box(.48, .47, .095, material, x, y + .62, z + .47, -.14);
        box(.065, .35, .065, steel, x, y + .16, z + .25);
      }
    }
    for (let x = -width * .5 + 1; x < width * .5; x += 4.2) {
      beam([x, .1, 0], [x, .15 + (rows - 1) * rowRise, (rows - 1) * rowDepth], .27, steel);
      for (const row of [2, 5, 8]) {
        const height = .15 + row * rowRise;
        box(.28, height, .28, concrete, x, height * .5, row * rowDepth);
      }
    }
    const roofY = 9, roofDepth = rows * rowDepth + 3;
    box(width + 4, .19, roofDepth, trim, 0, roofY, 5.6, -.045);
    for (const x of [-width * .5, 0, width * .5]) {
      for (const z of [-3, 14]) box(.27, roofY, .27, steel, x, roofY * .5, z);
      beam([x, 7.75, -3], [x, 8.7, 14], .18);
      beam([x, 8.7, -3], [x, 7.6, 14], .15);
      for (let z = -3; z < 14; z += 2.5) beam([x, 7.8, z], [x, 8.6, z + 2.5], .085);
    }
    for (let x = -width * .5; x <= width * .5; x += 1.8) box(.07, 1.1, .07, steel, x, .95, -1.03);
    box(width, .065, .065, steel, 0, 1.5, -1.03);
    const spectators = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .18, .48, 7), new THREE.MeshStandardMaterial({ roughness: 1 }), mobile ? 130 : 245);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(.115, 7, 5), new THREE.MeshStandardMaterial({ roughness: .95 }), spectators.count);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .4, .14), new THREE.MeshStandardMaterial({ color: '#4a5151', roughness: .95 }), spectators.count * 2);
    let people = 0;
    for (let row = 0; row < rows && people < spectators.count; row++) for (let col = 0; col < columns && people < spectators.count; col++) {
      if (col === 13 || col === 14 || col === 31 || col === 32 || rand() > .64) continue;
      const x = (col - columns * .5) * .62, y = .5 + row * rowRise, z = row * rowDepth + .13;
      matrix.makeTranslation(x, y + .69, z); matrix.premultiply(frame); spectators.setMatrixAt(people, matrix);
      matrix.makeTranslation(x, y + 1.04, z); matrix.premultiply(frame); heads.setMatrixAt(people, matrix);
      for (const side of [-1, 1]) { matrix.makeTranslation(x + side * .1, y + .32, z - .27); matrix.premultiply(frame); legs.setMatrixAt(people * 2 + (side > 0 ? 1 : 0), matrix); }
      spectators.setColorAt(people, new THREE.Color().setHSL(rand(), .1 + rand() * .5, .15 + rand() * .33));
      heads.setColorAt(people, new THREE.Color().setHSL(.04 + rand() * .045, .22 + rand() * .16, .3 + rand() * .38)); people++;
    }
    spectators.count = heads.count = people; legs.count = people * 2;
    spectators.castShadow = heads.castShadow = true; spectators.receiveShadow = heads.receiveShadow = legs.receiveShadow = true; scene.add(spectators, heads, legs); shadowMeshes.push(spectators, heads);
    const standSign = new THREE.MeshBasicMaterial({ map: signMap('APEX INTERNATIONAL', 'GRANDSTAND A · CHASE YOUR BEST LAP', '#262c29', width / 1.1) });
    bake(new THREE.PlaneGeometry(width, 1.1), standSign, 0, 8.55, -3.12, 0, Math.PI);

    setFrame(20, 0);
    const span = track.width + 13, pillarX = span * .5;
    for (const side of [-1, 1]) {
      for (const z of [-.7, .7]) { box(.28, 8.4, .28, steel, side * pillarX, 4.2, z); box(.9, .3, .9, concrete, side * pillarX, .15, z); }
      for (let y = .8; y < 8; y += 1.5) beam([side * pillarX, y, -.7], [side * pillarX, y + 1.5, .7], .095);
    }
    for (const y of [7.4, 8.6]) for (const z of [-.7, .7]) box(span, .16, .16, steel, 0, y, z);
    for (let x = -pillarX; x < pillarX; x += 2) for (const z of [-.7, .7]) beam([x, 7.4, z], [Math.min(pillarX, x + 2), 8.6, z], .09);
    const gantryMap = signMap('APEX INTERNATIONAL', 'TIME ATTACK · START / FINISH', '#262c29', (span - 1) / 1.45), gantryMat = new THREE.MeshBasicMaterial({ map: gantryMap });
    bake(new THREE.PlaneGeometry(span - 1, 1.45), gantryMat, 0, 7.92, -.82, 0, Math.PI); bake(new THREE.PlaneGeometry(span - 1, 1.45), gantryMat, 0, 7.92, .82);
    const signal = new THREE.MeshStandardMaterial({ color: '#771b15', roughness: .42, emissive: '#230600', emissiveIntensity: .6 });
    for (let x = -2; x <= 2; x += 1) { box(.55, 1.05, .38, dark, x, 6.67, -.1); for (const y of [6.46, 6.9]) cylinder(.15, .045, signal, x, y, -.33, Math.PI / 2, 0, 0, 12); }
    fence(0, track.wallOffset + 3, 148, 3.2); fence(0, -track.wallOffset - 4, 148, 3.2);
    fence(track.length * .31, -track.wallOffset - 4, 84); fence(track.length * .67, track.wallOffset + 4, 115);
  }

  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries); geometries.forEach(part => part.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); shadowMeshes.push(mesh);
  }
  // Materials unused in the selected theme have no scene owner to dispose them.
  for (const material of [concrete, plaster, stone, darkStone, timber, steel, dark, glass, trim, ...tile, roof, seatBlue, seatGrey]) if (!batches.has(material)) material.dispose();
  return { setQuality(level) { shadowMeshes.forEach(mesh => { mesh.castShadow = level !== 'low'; }); } };
}
