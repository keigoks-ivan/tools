import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const noise = new ImprovedNoise();
const up = new THREE.Vector3(0, 1, 0);
function random(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function canvasTexture(paint, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function barkTexture() {
  return canvasTexture((c, size) => {
    const rand = random(187); c.fillStyle = '#635a4c'; c.fillRect(0, 0, size, size);
    for (let i = 0; i < 850; i++) {
      const x = rand() * size, y = rand() * size, value = 38 + Math.floor(rand() * 66);
      c.strokeStyle = `rgba(${value + 11},${value + 5},${value},.55)`; c.lineWidth = .4 + rand() * 2.3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - .5) * 5, y + 8 + rand() * 38); c.stroke();
    }
  });
}
function leafTexture(type) {
  return canvasTexture((c, size) => {
    const rand = random(type === 'pine' ? 677 : type === 'cypress' ? 943 : 551);
    if (type === 'pine') {
      const sprays = [];
      for (let twig = 0; twig < 15; twig++) {
        const t = .06 + twig * .059, x = 25 + t * 199, y = 237 - t * 214;
        const spread = 40 + Math.sin(t * Math.PI) * 54;
        for (const side of [-1, 1]) {
          const endX = x + side * spread * .72 + 17, endY = y + side * spread * .54 - 24;
          sprays.push({ x, y, endX, endY });
        }
      }
      c.strokeStyle = '#646b55'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(23, 240); c.lineTo(229, 15); c.stroke();
      for (const { x, y, endX, endY } of sprays) {
        const angle = Math.atan2(endY - y, endX - x), length = Math.hypot(endX - x, endY - y);
        c.strokeStyle = '#566c52'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x, y); c.lineTo(endX, endY); c.stroke();
        for (let n = 0; n < 85; n++) {
          const t = rand(), nx = x + Math.cos(angle) * length * t, ny = y + Math.sin(angle) * length * t;
          const needleLength = 9 + rand() * 19, needleAngle = angle + (n % 2 ? -1 : 1) * (.52 + rand() * .50);
          const light = rand() * 42; c.strokeStyle = `rgb(${49 + light * .65},${70 + light * .78},${56 + light * .62})`; c.lineWidth = 1.5 + rand() * .6;
          c.beginPath(); c.moveTo(nx, ny); c.lineTo(nx + Math.cos(needleAngle) * needleLength, ny + Math.sin(needleAngle) * needleLength); c.stroke();
        }
      }
    } else {
      const count = type === 'cypress' ? 1150 : 1400;
      for (let i = 0; i < count; i++) {
        const x = rand() * 2 - 1, y = rand() * 2 - 1;
        if (x * x + y * y > .92 || noise.noise(x * 4, y * 4, 4) < -.33) continue;
        const light = rand() * 43, olive = type === 'olive';
        c.fillStyle = olive ? `rgb(${74 + light * .9},${86 + light * .86},${75 + light * .74})` : `rgb(${27 + light},${44 + light},${29 + light * .65})`;
        c.beginPath(); c.ellipse((.5 + x * .48) * size, (.5 + y * .48) * size, olive ? 2.4 : 2, olive ? 6.2 : 3.8, rand() * Math.PI, 0, Math.PI * 2); c.fill();
      }
    }
  });
}
function branch(parts, a, b, radiusA, radiusB, sides = 6) {
  const direction = new THREE.Vector3().subVectors(b, a), geometry = new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), sides, 1, true);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(geometry);
}
function card(parts, center, width, height, yaw, tilt, roll = 0) {
  const geometry = new THREE.PlaneGeometry(width, height);
  geometry.rotateZ(roll); geometry.rotateX(tilt); geometry.rotateY(yaw); geometry.translate(center.x, center.y, center.z); parts.push(geometry);
}
function merged(parts) {
  const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose()); geometry.computeBoundingSphere(); return geometry;
}
function pinePrototype(seed, mobile) {
  const rand = random(seed), stems = [], leaves = [];
  const lean = (rand() - .5) * .035, top = new THREE.Vector3(lean, 1, .015);
  branch(stems, new THREE.Vector3(), top, .015, .001, 8);
  const layers = mobile ? 9 : 10;
  for (let layer = 0; layer < layers; layer++) {
    const t = layer / (layers - 1), y = .20 + t * .684, radius = (.23 - t * .180) * (.87 + rand() * .26), count = t > .77 ? 5 : mobile ? 6 : 7;
    const phase = rand() * Math.PI * 2;
    for (let b = 0; b < count; b++) {
      const yaw = phase + b / count * Math.PI * 2, length = radius * (.77 + rand() * .33), droop = .035 + rand() * .035;
      const a = new THREE.Vector3(lean * y, y, .015 * y), end = new THREE.Vector3(Math.cos(yaw) * length + a.x, y - droop, Math.sin(yaw) * length + a.z);
      branch(stems, a, end, .0034 * (1 - y * .68), .00065, 5);
      for (let twig = 0; twig < (mobile ? 3 : 4); twig++) {
        const t = .32 + twig * (mobile ? .25 : .18), center = a.clone().lerp(end, t); center.y += (rand() - .5) * .012;
        const width = Math.max(.056, radius * .88) * (.85 + rand() * .3), height = width * (.90 + rand() * .2);
        center.y -= height * .13;
        card(leaves, center, width, height, yaw + Math.PI / 2 + (rand() - .5) * 1.1, .30 + rand() * .60, (rand() - .5) * .7);
        if (twig === 2) card(leaves, center, width * .95, height * 1.05, yaw + Math.PI / 2 + .75, .1 + rand() * .35, -.35);
      }
    }
  }
  for (let i = 0; i < 5; i++) card(leaves, new THREE.Vector3(lean, .932, .015), .04, .12, i * Math.PI / 2.5, .15, 0);
  return { bark: merged(stems), foliage: merged(leaves) };
}
function broadleafPrototype(seed, type) {
  const rand = random(seed), stems = [], leaves = [], cypress = type === 'cypress', scrub = type === 'scrub';
  const trunkHeight = cypress ? .85 : scrub ? .25 : .36, lean = (rand() - .5) * .045;
  branch(stems, new THREE.Vector3(), new THREE.Vector3(lean, trunkHeight, .025), cypress ? .012 : .028, .006, 8);
  if (cypress) {
    for (let level = 0; level < 12; level++) {
      const y = .17 + level * .067, radius = (.058 + Math.sin((y - .08) / .95 * Math.PI) * .047) * (1 - level * .018);
      for (let n = 0; n < 7; n++) {
        const yaw = n * Math.PI * 2 / 7 + level * .55, center = new THREE.Vector3(lean * y + Math.cos(yaw) * radius * .32, y, .025 * y + Math.sin(yaw) * radius * .32);
        card(leaves, center, radius * 1.65, .16 + rand() * .035, yaw, .1 + rand() * .27, (rand() - .5) * .25);
      }
    }
    for (let i = 0; i < 3; i++) card(leaves, new THREE.Vector3(lean, .947, .025), .057, .11, i * Math.PI / 3, 0);
  } else {
    const forks = scrub ? 6 : 7;
    for (let fork = 0; fork < forks; fork++) {
      const yaw = fork * Math.PI * 2 / forks + rand() * .4, reach = (scrub ? .25 : .29) * (.6 + rand() * .5), crownY = (scrub ? .47 : .62) + rand() * .15;
      const base = new THREE.Vector3(lean, trunkHeight * .75, .025), elbow = new THREE.Vector3(Math.cos(yaw) * reach * .40, trunkHeight + .14, Math.sin(yaw) * reach * .4);
      const end = new THREE.Vector3(Math.cos(yaw) * reach, crownY, Math.sin(yaw) * reach);
      branch(stems, base, elbow, .013, .008, 6); branch(stems, elbow, end, .008, .002, 5);
      for (let twig = 0; twig < 3; twig++) {
        const angle = yaw + (twig - 1) * .6, center = end.clone().add(new THREE.Vector3(Math.cos(angle) * .065, (twig - 1) * .033, Math.sin(angle) * .065));
        branch(stems, end.clone().lerp(elbow, .22), center, .0024, .0007, 4);
        for (let n = 0; n < 8; n++) {
          const point = center.clone().add(new THREE.Vector3((rand() - .5) * .10, (rand() - .5) * .10, (rand() - .5) * .10));
          card(leaves, point, .14 + rand() * .045, .12 + rand() * .05, rand() * Math.PI * 2, (rand() - .5) * Math.PI * .85, (rand() - .5) * .7);
        }
      }
    }
    for (let i = 0; i < 24; i++) {
      const yaw = rand() * Math.PI * 2, r = rand() * .14;
      card(leaves, new THREE.Vector3(Math.cos(yaw) * r, .65 + rand() * .2, Math.sin(yaw) * r), .16, .14, yaw, rand() * .7, rand() * .5);
    }
  }
  return { bark: merged(stems), foliage: merged(leaves) };
}
function grassGeometry(seed) {
  const rand = random(seed), positions = [], colors = [], indices = [];
  const bottom = new THREE.Color('#4f5231'), tip = new THREE.Color('#aea16a'), color = new THREE.Color();
  for (let blade = 0; blade < 11; blade++) {
    const yaw = rand() * Math.PI * 2, x = (rand() - .5) * .4, z = (rand() - .5) * .4, h = .28 + rand() * .53;
    const width = .012 + rand() * .019, bend = .07 + rand() * .18, offset = positions.length / 3;
    for (let segment = 0; segment <= 3; segment++) {
      const t = segment / 3, w = width * (1 - t) + .0007;
      for (const side of [-1, 1]) {
        positions.push(x + Math.cos(yaw) * bend * t * t + Math.sin(yaw) * w * side, h * t, z + Math.sin(yaw) * bend * t * t - Math.cos(yaw) * w * side);
        color.copy(bottom).lerp(tip, t * .73); colors.push(color.r, color.g, color.b);
      }
      if (segment < 3) { const k = offset + segment * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function rockGeometry(seed) {
  const geometry = new THREE.SphereGeometry(1, 12, 8), positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), dent = 1 + noise.noise(x * 2.6, y * 2.1, z * 2.8 + seed) * .22;
    positions.setXYZ(i, x * dent + y * .12, Math.max(-.65, y * dent) + .58, z * dent);
  }
  geometry.computeVertexNormals(); return geometry;
}

export function addVegetation({ scene, track, mobile = false, groundHeight, materials = {} }) {
  const theme = track.theme, alpine = theme === 'alpine', canyon = theme === 'canyon', grandprix = theme === 'grandprix';
  const rand = random(alpine ? 382 : canyon ? 603 : grandprix ? 932 : 744), half = track.width / 2, bounds = track.bounds;
  const group = new THREE.Group(); group.name = 'Dimensional vegetation'; scene.add(group);
  const start = track.sample(0), shadows = [], occupied = new Map();
  const barkMap = barkTexture(); barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
  const bark = new THREE.MeshStandardMaterial({ map: barkMap, color: alpine ? '#d5d0bd' : '#d1c6af', roughness: 1 });
  const species = alpine ? ['pine'] : canyon ? ['scrub'] : ['olive', 'cypress'];
  const data = Object.fromEntries(species.map(type => [type, [[], [], []]]));
  let treeCount = 0;
  const treeBudget = alpine ? (mobile ? 340 : 480) : canyon ? 110 : grandprix ? 130 : (mobile ? 190 : 240);
  function validPosition(x, z, radius, managed = false) {
    const near = track.nearest(x, z), y = groundHeight(x, z, near);
    if (near.distance < track.wallOffset + radius + (managed ? 19 : 2.5) || near.distance > 285) return null;
    if (theme === 'costa' && (x < -202 || y < 2.5)) return null;
    const startX = x - start.x, startZ = z - start.z, localX = startX * start.nx + startZ * start.nz, localZ = startX * Math.sin(start.heading) + startZ * Math.cos(start.heading);
    if (localX > 13 && localX < 48 && Math.abs(localZ) < 32) return null;
    if (grandprix && localX < -18 && localX > -70 && localZ > 12 && localZ < 65) return null;
    return { x, y: y - .04, z, near };
  }
  function addTree(x, z, type) {
    if (treeCount >= treeBudget) return;
    const h = alpine ? 11 + rand() * 10 : canyon ? .65 + rand() * 1.2 : type === 'cypress' ? 9 + rand() * 5 : 5.2 + rand() * 3.8;
    const radius = h * (type === 'cypress' ? .115 : .33), p = validPosition(x, z, radius, grandprix); if (!p) return;
    const cellX = Math.floor(x / 9), cellZ = Math.floor(z / 9);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const other of occupied.get(`${cellX + dx},${cellZ + dz}`) || []) if (Math.hypot(x - other.x, z - other.z) < Math.min(radius + other.radius, alpine ? 5.5 : 6)) return;
    }
    const key = `${cellX},${cellZ}`; if (!occupied.has(key)) occupied.set(key, []); occupied.get(key).push({ x, z, radius });
    data[type][Math.floor(rand() * 3)].push({ ...p, h, rotation: rand() * Math.PI * 2, width: .82 + rand() * .3 }); treeCount++;
  }
  const spacing = mobile ? (alpine ? 20 : 25) : (alpine ? 14 : 19);
  for (let s = 0; s < track.length; s += spacing) {
    const a = track.sample(s + rand() * spacing);
    for (const side of [-1, 1]) {
      const density = .5 + noise.noise(a.x / 58, a.z / 58, 3) * .8;
      if (rand() > density * (grandprix ? .58 : canyon ? .43 : .94)) continue;
      const distance = track.wallOffset + (grandprix ? 29 : 8) + rand() * (alpine ? 48 : 36);
      const type = alpine ? 'pine' : canyon ? 'scrub' : rand() < (grandprix ? .22 : .34) ? 'cypress' : 'olive';
      addTree(a.x + a.nx * distance * side, a.z + a.nz * distance * side, type);
      if (alpine || (!canyon && !grandprix && rand() < .4)) {
        const clusterSize = 1;
        for (let j = 0; j < clusterSize; j++) addTree(a.x + a.nx * (distance + 10 + rand() * 24) * side + (rand() - .5) * 16, a.z + a.nz * (distance + 10 + rand() * 24) * side + (rand() - .5) * 16, type);
      }
    }
  }
  const distantAttempts = alpine ? (mobile ? 220 : 350) : canyon ? 80 : grandprix ? 110 : 160;
  for (let i = 0; i < distantAttempts; i++) {
    const x = bounds.minX - 110 + rand() * (bounds.maxX - bounds.minX + 220), z = bounds.minZ - 110 + rand() * (bounds.maxZ - bounds.minZ + 220);
    if (noise.noise(x / 70, z / 70, 3) < -.05) continue;
    addTree(x, z, alpine ? 'pine' : canyon ? 'scrub' : rand() < .32 ? 'cypress' : 'olive');
  }
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  for (const type of species) {
    if (!data[type].some(trees => trees.length)) continue;
    const map = leafTexture(type === 'scrub' ? 'olive' : type);
    const foliage = new THREE.MeshStandardMaterial({ map, alphaTest: .22, side: THREE.DoubleSide, roughness: 1, color: canyon ? '#c8be8d' : alpine ? '#ccd5cc' : type === 'olive' ? '#d2d9ce' : '#d4d3b8' });
    for (let variant = 0; variant < 3; variant++) {
      const trees = data[type][variant]; if (!trees.length) continue;
      const prototype = type === 'pine' ? pinePrototype(270 + variant * 43, mobile) : broadleafPrototype(560 + variant * 31, type);
      const stems = new THREE.InstancedMesh(prototype.bark, bark, trees.length), crown = new THREE.InstancedMesh(prototype.foliage, foliage, trees.length);
      stems.name = `${type} trunks`; crown.name = `${type} branches and foliage`;
      for (let i = 0; i < trees.length; i++) {
        const tree = trees[i]; quaternion.setFromAxisAngle(up, tree.rotation); position.set(tree.x, tree.y, tree.z); scale.set(tree.h * tree.width, tree.h, tree.h * tree.width);
        matrix.compose(position, quaternion, scale); stems.setMatrixAt(i, matrix); crown.setMatrixAt(i, matrix);
        const shade = .87 + rand() * .23; crown.setColorAt(i, new THREE.Color().setRGB(shade * (alpine ? .93 : 1), shade, shade * .94));
      }
      stems.castShadow = crown.castShadow = stems.receiveShadow = crown.receiveShadow = true; group.add(stems, crown); shadows.push(stems, crown);
    }
  }
  if (!grandprix) {
    const rockMat = materials.rock || new THREE.MeshStandardMaterial({ color: canyon ? '#b78865' : alpine ? '#9ba29d' : '#b3aa92', roughness: 1 });
    const rockData = [[], [], []], rockAttempts = canyon ? (mobile ? 170 : 270) : (mobile ? 85 : 140);
    for (let i = 0; i < rockAttempts; i++) {
      const a = track.sample(rand() * track.length), side = rand() < .5 ? -1 : 1, offset = track.wallOffset + 2 + rand() * (canyon ? 60 : 33), size = .25 + Math.pow(rand(), 1.8) * (canyon ? 5.2 : 2.9);
      const p = validPosition(a.x + a.nx * offset * side, a.z + a.nz * offset * side, size); if (!p) continue;
      rockData[Math.floor(rand() * 3)].push({ ...p, size, stretch: .7 + rand() * .6, rotation: rand() * Math.PI * 2 });
    }
    for (let variant = 0; variant < 3; variant++) {
      const rocks = rockData[variant]; if (!rocks.length) continue;
      const mesh = new THREE.InstancedMesh(rockGeometry(variant + 3), rockMat, rocks.length); mesh.name = 'Weathered roadside rocks';
      for (let i = 0; i < rocks.length; i++) {
        const rock = rocks[i]; position.set(rock.x, rock.y - rock.size * .13, rock.z); quaternion.setFromAxisAngle(up, rock.rotation); scale.set(rock.size * 1.2, rock.size * rock.stretch * .64, rock.size);
        matrix.compose(position, quaternion, scale); mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, new THREE.Color().setScalar(.88 + rand() * .17));
      }
      mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); shadows.push(mesh);
    }
  }
  const grassData = [], grassAttempts = mobile ? (canyon ? 650 : 1000) : (canyon ? 1100 : 1750);
  for (let i = 0; i < grassAttempts; i++) {
    const a = track.sample(rand() * track.length), side = rand() < .5 ? -1 : 1, offset = half + 1.5 + rand() * (grandprix ? 9 : canyon ? 23 : 15);
    const x = a.x + a.nx * offset * side, z = a.z + a.nz * offset * side, near = track.nearest(x, z), y = groundHeight(x, z, near);
    if (near.distance < half + 1.4 || (theme === 'costa' && (x < -207 || y < 2))) continue;
    if (grandprix && (near.distance > track.wallOffset - .6 || near.distance < half + 3)) continue;
    if (canyon && noise.noise(x / 16, z / 17, 6) < .05) continue;
    const dx = x - start.x, dz = z - start.z, localX = dx * start.nx + dz * start.nz, localZ = dx * Math.sin(start.heading) + dz * Math.cos(start.heading);
    if (localX > 14 && localX < 37 && Math.abs(localZ) < 23) continue;
    grassData.push({ x, y: y - .015, z, size: grandprix ? .26 + rand() * .2 : .50 + rand() * .65, rotation: rand() * Math.PI * 2 });
  }
  const grassMat = new THREE.MeshStandardMaterial({ color: alpine ? '#bbc2a0' : canyon ? '#c7b58a' : grandprix ? '#83a965' : '#c4ba8c', vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  const grass = new THREE.InstancedMesh(grassGeometry(320), grassMat, grassData.length); grass.name = 'Roadside grass tufts';
  for (let i = 0; i < grassData.length; i++) {
    const tuft = grassData[i]; quaternion.setFromAxisAngle(up, tuft.rotation); position.set(tuft.x, tuft.y, tuft.z); scale.set(tuft.size, tuft.size, tuft.size); matrix.compose(position, quaternion, scale); grass.setMatrixAt(i, matrix);
  }
  grass.receiveShadow = true; group.add(grass);
  group.userData.treeCount = Object.values(data).reduce((sum, variants) => sum + variants.reduce((n, list) => n + list.length, 0), 0);
  return { setQuality(level) { shadows.forEach(mesh => { mesh.castShadow = level !== 'low'; }); grass.visible = level !== 'low' || mobile; } };
}
