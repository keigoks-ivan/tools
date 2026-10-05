import * as THREE from 'three';
import { mergeGeometries } from '../../game/lib/addons/utils/BufferGeometryUtils.js';
import { sampleServe, sampleStroke, smoothstep, solveTwoBone } from './athlete-motion.mjs?v=4';
import { blendBodyPose, motionDefinition, MOTION_PROFILES, readyBodyPose, resolveMotionProfile, sampleBodyClip } from './motion-clips.mjs?v=4';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DOWN = new THREE.Vector3(0, -1, 0);
const vec = a => new THREE.Vector3(...a);
const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
const sphere = new THREE.SphereGeometry(1, 20, 14);
const quat = new THREE.Quaternion();

function weaveTexture(kind = 'cloth') {
  const size = 128, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4;
    const noise = Math.sin(x * 173.3 + y * 47.7) * Math.cos(x * 13.1 - y * 91.8);
    const knit = kind === 'hair' ? Math.sin(x * 1.4 + Math.sin(y * 0.035) * 3) * 16 : Math.sin(x * Math.PI) * Math.cos(y * Math.PI * 0.5) * 14;
    const value = clamp(Math.round(151 + noise * 16 + knit), 0, 255);
    data[index] = data[index + 1] = data[index + 2] = value; data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(kind === 'hair' ? 3 : 4, 4);
  texture.needsUpdate = true;
  return texture;
}
const clothWeave = weaveTexture(), hairWeave = weaveTexture('hair');

function jerseyTexture(color, side) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'), c = new THREE.Color(color);
  ctx.fillStyle = `#${c.getHexString()}`; ctx.fillRect(0, 0, 1024, 1024);
  const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
  gradient.addColorStop(0, 'rgba(255,255,255,.12)'); gradient.addColorStop(0.5, 'rgba(255,255,255,0)'); gradient.addColorStop(1, 'rgba(0,0,0,.30)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 1024);
  for (const x of [0, 512]) {
    ctx.fillStyle = '#102026'; ctx.fillRect(x - 54, 0, 108, 1024);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + 51, 20, 3, 970);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.075)'; ctx.lineWidth = 1;
  for (let y = 0; y < 1024; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y + 32); ctx.stroke(); }
  ctx.fillStyle = '#eeeae1'; ctx.textAlign = 'center';
  const lettering = (text, x, y, font) => { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.font = font; ctx.fillText(text, 0, 0); ctx.restore(); };
  lettering('RALLY / PERFORMANCE', 256, 295, '600 29px Arial');
  lettering(side === 1 ? 'LIN Y.J.' : 'HARIMOTO', 768, 300, '700 44px Arial');
  lettering(side === 1 ? 'LEFT / TPE' : 'RIGHT / JPN', 768, 346, '600 26px Arial');
  lettering(side === 1 ? '01' : '02', 768, 550, '700 150px Arial');
  ctx.fillStyle = 'rgba(240,241,228,.7)'; ctx.fillRect(203, 346, 106, 3);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}

function addMesh(parent, geometry, mat, position = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.fromArray(position); mesh.scale.fromArray(scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}
function oval(parent, mat, position, scale) { return addMesh(parent, sphere, mat, position, scale); }

// Elliptical sections give the shoulders, waist, calves and shoes distinct shapes.
function sections(inputRings, sides = 24, subdivisions = 2) {
  const source = inputRings[0][0] > inputRings[inputRings.length - 1][0] ? [...inputRings].reverse() : inputRings;
  const rings = [];
  const catmull = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let j = 0; j < source.length - 1; j++) for (let k = 0; k < subdivisions; k++) {
    const t = k / subdivisions, a = source[Math.max(0, j - 1)], b = source[j], c = source[j + 1], d = source[Math.min(source.length - 1, j + 2)];
    rings.push([THREE.MathUtils.lerp(b[0], c[0], t), ...[1, 2, 3].map(i => catmull(a[i] || 0, b[i] || 0, c[i] || 0, d[i] || 0, t))]);
  }
  rings.push(source[source.length - 1]);
  const positions = [], indices = [], uvs = [], stride = sides + 1;
  const minimumY = rings[0][0], height = rings[rings.length - 1][0] - minimumY;
  for (const [y, width, depth, forward = 0] of rings) {
    for (let i = 0; i <= sides; i++) {
      const angle = i / sides * Math.PI * 2;
      positions.push(Math.cos(angle) * width, y, Math.sin(angle) * depth + forward);
      uvs.push(i / sides, (y - minimumY) / height);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * stride + i, b = a + 1, c = a + stride, d = b + stride;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (const end of [0, rings.length - 1]) {
    const index = positions.length / 3;
    positions.push(0, rings[end][0], rings[end][3] || 0);
    uvs.push(0.5, end === 0 ? 0 : 1);
    for (let i = 0; i < sides; i++) {
      const a = end * stride + i, b = a + 1;
      if (end === 0) indices.push(index, a, b); else indices.push(index, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let j = 0; j < rings.length; j++) {
    const a = j * stride, b = a + sides;
    const normal = new THREE.Vector3(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z); normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
  return geometry;
}

function jointChain(parent, upperLength, lowerLength, upperMat, lowerMat, radii, name) {
  const anchor = new THREE.Group(); anchor.name = `${name}-anchor`; parent.add(anchor);
  const upper = new THREE.Bone(); upper.name = `${name}-upper`; anchor.add(upper);
  const lower = new THREE.Bone(); lower.name = `${name}-lower`; lower.position.y = -upperLength; upper.add(lower);
  const end = new THREE.Bone(); end.name = `${name}-end`; end.position.y = -lowerLength; lower.add(end);
  const leg = name.startsWith('leg');
  const geometry = sections([[0, radii[0] * 0.88, radii[0] * 0.91], [-upperLength * 0.22, radii[0], radii[0] * 1.10, leg ? 0.005 : 0], [-upperLength * 0.60, radii[0] * 0.87, radii[0] * 0.98], [-upperLength * 0.90, radii[1], radii[1] * 0.98], [-upperLength, radii[1] * 0.91, radii[1] * 0.94, 0.005], [-upperLength - lowerLength * 0.12, radii[2] * 0.90, radii[2] * 0.96, -0.005], [-upperLength - lowerLength * 0.30, radii[2], radii[2] * 1.14, -0.008], [-upperLength - lowerLength * 0.68, radii[3] * 1.25, radii[3] * 1.18], [-upperLength - lowerLength, radii[3], radii[3] * 0.90]]);
  const indices = [], weights = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const distance = -geometry.attributes.position.getY(i);
    const blend = smoothstep((distance - upperLength + 0.028) / 0.056);
    indices.push(0, 1, 0, 0); weights.push(1 - blend, blend, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const skin = new THREE.SkinnedMesh(geometry, upperMat); skin.name = `${name}-skin`;
  skin.castShadow = skin.receiveShadow = true; skin.frustumCulled = false; anchor.add(skin);
  const bind = () => { anchor.updateWorldMatrix(true, true); skin.bind(new THREE.Skeleton([upper, lower])); };
  return { anchor, upper, lower, end, skin, bind, upperLength, lowerLength, reachError: 0 };
}

function mergeStatic(parent) {
  for (const child of [...parent.children]) if (!child.isMesh) mergeStatic(child);
  const groups = new Map();
  for (const mesh of parent.children) if (mesh.isMesh && !mesh.isSkinnedMesh) {
    const group = groups.get(mesh.material) || []; group.push(mesh); groups.set(mesh.material, group);
  }
  for (const [mat, meshes] of groups) if (meshes.length > 1) {
    const geometries = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
    const geometry = mergeGeometries(geometries);
    if (geometry) { for (const mesh of meshes) parent.remove(mesh); addMesh(parent, geometry, mat); }
  }
}

function mergeColored(parent) {
  const meshes = parent.children.filter(mesh => mesh.isMesh);
  const geometries = meshes.map(mesh => {
    mesh.updateMatrix(); const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix), colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(mesh.material.color.r, mesh.material.color.g, mesh.material.color.b);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return geometry;
  });
  for (const mesh of meshes) parent.remove(mesh);
  addMesh(parent, mergeGeometries(geometries), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 }));
}

function headGeometry() {
  const geometry = new THREE.SphereGeometry(1, 44, 36), positions = geometry.attributes.position;
  const gaussian = (x, y, sx, sy) => Math.exp(-(x * x / (sx * sx) + y * y / (sy * sy)) / 2);
  for (let i = 0; i < positions.count; i++) {
    const nx = positions.getX(i), ny = positions.getY(i), nz = positions.getZ(i);
    const jaw = 1 - smoothstep((-ny - 0.15) / 0.75) * 0.36;
    let x = nx * 0.09 * jaw, y = ny * 0.124, z = nz * 0.084;
    if (nz > 0) {
      const face = smoothstep(nz * 2);
      z += face * (gaussian(x, y + 0.013, 0.012, 0.029) * 0.021 + gaussian(x, y + 0.070, 0.025, 0.013) * 0.005);
      z -= face * (gaussian(x - 0.032, y - 0.012, 0.016, 0.012) + gaussian(x + 0.032, y - 0.012, 0.016, 0.012)) * 0.003;
    }
    positions.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals(); return geometry;
}
function hairGeometry() {
  const positions = [], uvs = [], indices = [], sides = 48, rows = 20;
  for (let row = 0; row <= rows; row++) for (let i = 0; i <= sides; i++) {
    const phi = i / sides * Math.PI * 2, front = Math.sin(phi);
    const edge = 1.69 - front * 0.37 + Math.cos(phi) * 0.04;
    const theta = row / rows * edge;
    const sweep = Math.sin(theta) * Math.sin(phi * 8 + theta * 3) * 0.0018;
    positions.push(Math.sin(theta) * Math.cos(phi) * (0.094 + sweep), Math.cos(theta) * 0.116 + 0.009 + Math.sin(phi + 0.4) * Math.sin(theta) * 0.003, Math.sin(theta) * Math.sin(phi) * (0.088 + sweep) - 0.005);
    uvs.push(i / sides, row / rows);
    if (row < rows && i < sides) { const a = row * (sides + 1) + i, b = a + sides + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function tube(parent, mat, points, radius = 0.0015) {
  return addMesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(vec)), 12, radius, 5, false), mat);
}
function shoeGeometry() {
  const geometry = new THREE.SphereGeometry(1, 24, 16), p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const heel = smoothstep((-z - 0.15) / 0.70), toe = smoothstep((z - 0.15) / 0.80);
    p.setXYZ(i, x * (0.058 - heel * 0.009), y * (0.047 - toe * 0.014) - 0.024 + heel * 0.006, z * 0.119 + 0.050);
  }
  geometry.computeVertexNormals(); return geometry;
}
function handGeometry(parent, skin, sign, gripping) {
  oval(parent, skin, [0, 0.012, 0], [0.028, 0.040, 0.022]);
  for (let i = 0; i < 4; i++) {
    const finger = addMesh(parent, new THREE.CapsuleGeometry(0.006, gripping ? 0.025 : 0.032, 5, 8), skin, [(i - 1.5) * 0.012, 0.047 + (i === 0 || i === 3 ? -0.003 : 0.002), gripping ? 0.010 : 0]);
    finger.rotation.x = gripping ? -0.85 : -0.12;
  }
  const thumb = addMesh(parent, new THREE.CapsuleGeometry(0.008, 0.027, 5, 8), skin, [-sign * 0.023, 0.018, 0.015]); thumb.rotation.z = -sign * 0.55; thumb.rotation.x = -0.35;
}

function placeChain(chain, targetInAnchor, pole, dt = 0) {
  const direction = targetInAnchor.clone().normalize(), preferred = vec(pole);
  preferred.addScaledVector(direction, -preferred.dot(direction));
  const anchorRotation = chain.anchor.getWorldQuaternion(new THREE.Quaternion());
  if (chain.bendWorld) {
    const previous = chain.bendWorld.clone().applyQuaternion(anchorRotation.clone().invert());
    previous.addScaledVector(direction, -previous.dot(direction));
    if (previous.lengthSq() > 1e-8) {
      previous.normalize();
      if (preferred.length() < 0.025) preferred.copy(previous);
      else {
        preferred.normalize();
        const angle = previous.angleTo(preferred), maxAngle = dt * 14;
        const rotation = new THREE.Quaternion().setFromUnitVectors(previous, preferred);
        rotation.slerp(new THREE.Quaternion(), angle > maxAngle ? 1 - maxAngle / angle : 0);
        preferred.copy(previous).applyQuaternion(rotation);
      }
    }
  }
  preferred.normalize(); chain.bendWorld = preferred.clone().applyQuaternion(anchorRotation);
  const result = solveTwoBone([0, 0, 0], targetInAnchor.toArray(), preferred.toArray(), chain.upperLength, chain.lowerLength);
  const elbow = vec(result.joint), end = vec(result.end);
  chain.upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().normalize());
  const lowerDirection = end.sub(elbow).normalize().applyQuaternion(chain.upper.quaternion.clone().invert());
  chain.lower.quaternion.setFromUnitVectors(DOWN, lowerDirection);
  chain.reachError = result.reachError;
}

function rootPointToAnchor(root, anchor, point) {
  return anchor.worldToLocal(root.localToWorld(point.clone()));
}
function orientEnd(root, end, rotation) {
  root.getWorldQuaternion(quat);
  const desired = quat.clone().multiply(new THREE.Quaternion().setFromEuler(rotation));
  end.parent.getWorldQuaternion(quat);
  end.quaternion.copy(quat.invert().multiply(desired));
}

export function createAthlete(scene, side, color, handed = 'right', profileId = handed === 'left' ? 'lin-yun-ju' : 'harimoto') {
  let mirror = handed === 'left' ? -1 : 1;
  let motionProfile = resolveMotionProfile(profileId), bodyPose = readyBodyPose(motionProfile);
  const root = new THREE.Group(); root.name = side === 1 ? 'player-athlete' : 'opponent-athlete';
  root.position.z = side * 1.94; root.rotation.y = side === 1 ? Math.PI : 0; scene.add(root);
  const skin = new THREE.MeshPhysicalMaterial({ color: motionProfile === 'lin-yun-ju' ? 0xc58f6b : 0xd2a17c, roughness: 0.62, clearcoat: 0.06, clearcoatRoughness: 0.80, bumpMap: clothWeave, bumpScale: 0.0004 });
  const jersey = jerseyTexture(color, motionProfile === 'lin-yun-ju' ? 1 : -1);
  const shirt = new THREE.MeshPhysicalMaterial({ color: jersey ? 0xffffff : color, map: jersey, roughness: 0.79, sheen: 0.50, sheenColor: new THREE.Color(0xd5dbe1), sheenRoughness: 0.86, bumpMap: clothWeave, bumpScale: 0.0010 });
  const sleeves = new THREE.MeshPhysicalMaterial({ color, roughness: 0.80, sheen: 0.40, sheenRoughness: 0.80, bumpMap: clothWeave, bumpScale: 0.0009 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x14212b, roughness: 0.85, bumpMap: clothWeave, bumpScale: 0.0008 });
  const socks = new THREE.MeshStandardMaterial({ color: 0xe4e8e9, roughness: 0.89, bumpMap: clothWeave, bumpScale: 0.0011 });
  const soleMat = material(0x25313b), hairMat = new THREE.MeshPhysicalMaterial({ color: 0x15191e, roughness: 0.64, sheen: 0.42, sheenColor: new THREE.Color(0x5c6670), sheenRoughness: 0.7, bumpMap: hairWeave, bumpScale: 0.0012 });
  const trim = material(0xe6e9e7), darkTrim = material(0x142630);
  const pelvis = new THREE.Group(); pelvis.name = 'pelvis'; root.add(pelvis);
  addMesh(pelvis, sections([[-0.112, 0.155, 0.091], [-0.050, 0.173, 0.113], [0.026, 0.151, 0.100]]), shorts);
  const spine = new THREE.Group(); spine.name = 'spine'; spine.position.y = 0.025; pelvis.add(spine);
  addMesh(spine, sections([[-0.035, 0.172, 0.115], [0.025, 0.153, 0.103], [0.09, 0.146, 0.102], [0.205, 0.172, 0.122, 0.003], [0.320, 0.201, 0.128, 0.002], [0.405, 0.221, 0.103], [0.443, 0.186, 0.087], [0.478, 0.065, 0.049]]), shirt, [0, 0, 0]);
  const collar = addMesh(spine, new THREE.TorusGeometry(0.059, 0.008, 8, 40), darkTrim, [0, 0.478, 0]); collar.rotation.x = Math.PI / 2; collar.scale.z = 0.78;
  oval(spine, skin, [0, 0.492, 0.004], [0.046, 0.075, 0.048]);
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.611, 0.011); spine.add(head);
  addMesh(head, headGeometry(), skin);
  addMesh(head, hairGeometry(), hairMat);
  const eyeWhite = material(0xc5c0b3, 0.6), eyeDark = material(0x252a2d, 0.72), lips = material(0x97624f, 0.73);
  for (const sign of [-1, 1]) {
    oval(head, skin, [sign * 0.086, -0.009, -0.009], [0.013, 0.023, 0.010]);
    oval(head, lips, [sign * 0.093, -0.011, -0.007], [0.002, 0.012, 0.005]);
    oval(head, eyeWhite, [sign * 0.032, 0.013, 0.077], [0.011, 0.0035, 0.003]);
    oval(head, eyeDark, [sign * 0.032, 0.013, 0.080], [0.003, 0.0033, 0.0015]);
    tube(head, eyeDark, [[sign * 0.017, 0.031, 0.079], [sign * 0.031, 0.035, 0.080], [sign * 0.043, 0.031, 0.074]], 0.002);
    oval(head, eyeDark, [sign * 0.007, -0.034, 0.096], [0.003, 0.0016, 0.002]);
  }
  tube(head, lips, [[-0.020, -0.052, 0.078], [0, -0.054, 0.083], [0.020, -0.052, 0.078]], 0.0018);

  const legs = [-1, 1].map(sign => {
    const leg = jointChain(pelvis, 0.405, 0.415, skin, skin, [0.081, 0.050, 0.060, 0.030], `leg-${sign}`);
    leg.anchor.position.set(sign * 0.097, -0.025, 0);
    addMesh(leg.upper, sections([[0.018, 0.099, 0.103], [-0.050, 0.105, 0.106], [-0.142, 0.093, 0.098], [-0.17, 0.096, 0.097]]), shorts);
    addMesh(leg.upper, sections([[-0.158, 0.097, 0.098], [-0.167, 0.098, 0.098]]), darkTrim);
    addMesh(leg.lower, sections([[-0.258, 0.039, 0.042], [-0.295, 0.037, 0.039], [-0.39, 0.033, 0.034], [-0.42, 0.032, 0.033]]), socks);
    addMesh(leg.lower, sections([[-0.277, 0.0395, 0.0425], [-0.270, 0.040, 0.043]]), darkTrim);
    const shoe = new THREE.Group(); leg.end.add(shoe);
    addMesh(shoe, shoeGeometry(), trim);
    addMesh(shoe, sections([[-0.070, 0.055, 0.119, 0.048], [-0.065, 0.061, 0.126, 0.050], [-0.055, 0.062, 0.125, 0.050]], 32, 2), soleMat);
    addMesh(shoe, sections([[-0.056, 0.061, 0.125, 0.050], [-0.038, 0.060, 0.122, 0.050]], 32, 2), material(0xcbd2d4));
    oval(shoe, darkTrim, [0, -0.008, -0.045], [0.044, 0.032, 0.020]);
    for (const sideSign of [-1, 1]) {
      const panel = oval(shoe, material(color), [sideSign * 0.049, -0.016, 0.051], [0.007, 0.020, 0.049]); panel.rotation.x = -0.16;
      tube(shoe, darkTrim, [[sideSign * 0.039, -0.020, -0.022], [sideSign * 0.056, -0.019, 0.064], [sideSign * 0.032, -0.025, 0.148]], 0.002);
    }
    for (let i = 0; i < 4; i++) {
      tube(shoe, trim, [[-0.023, 0.015 - i * 0.005, 0.025 + i * 0.018], [0, 0.020 - i * 0.005, 0.030 + i * 0.018], [0.023, 0.015 - i * 0.005, 0.025 + i * 0.018]], 0.0025);
    }
    mergeColored(shoe); leg.bind();
    return { ...leg, sign, shoe, worldX: null, worldZ: null, step: null };
  });
  const arms = [-1, 1].map(sign => {
    const arm = jointChain(spine, 0.305, 0.285, skin, skin, [0.047, 0.029, 0.035, 0.023], `arm-${sign}`);
    arm.anchor.position.set(sign * 0.205, 0.405, 0);
    addMesh(arm.upper, sections([[0.055, 0.025, 0.030], [0.030, 0.049, 0.048], [-0.012, 0.060, 0.057], [-0.087, 0.057, 0.053], [-0.134, 0.046, 0.046]]), sleeves);
    addMesh(arm.upper, sections([[-0.129, 0.0465, 0.0465], [-0.137, 0.047, 0.047]]), darkTrim);
    handGeometry(arm.end, skin, sign, sign === -mirror);
    arm.bind();
    return { ...arm, sign };
  });
  let dominant = arms.find(arm => arm.sign === -mirror);
  const paddle = new THREE.Group(); paddle.name = 'paddle'; dominant.end.add(paddle);
  const bladeCenter = new THREE.Vector3(0, 0.127, 0.009);
  const blade = addMesh(paddle, new THREE.CylinderGeometry(0.085, 0.085, 0.013, 48), material(0xb6946b), bladeCenter.toArray(), [1, 1, 1.13]); blade.rotation.x = Math.PI / 2;
  for (const [z, color] of [[0.018, 0xa93d34], [-0.0005, 0x272f2d]]) {
    const face = addMesh(paddle, new THREE.CylinderGeometry(0.082, 0.082, 0.0035, 48), material(color), [0, 0.127, z], [1, 1, 1.13]); face.rotation.x = Math.PI / 2;
  }
  addMesh(paddle, new THREE.CapsuleGeometry(0.013, 0.069, 6, 12), material(0xb39872), [0, 0.026, 0.007], [1, 1, 0.83]);
  mergeStatic(root);

  const handWorld = new THREE.Vector3(), freeHandWorld = new THREE.Vector3(), paddleWorld = new THREE.Vector3();
  let stroke = null, strokeId = 0, previousX = null, previousZ = null, velocity = 0, depthVelocity = 0, nextFoot = 0, readyAmount = 0.62, serveAmount = 0, rallyAmount = 0;
  let footTime = null, footRootX = 0, footRootZ = side * 1.94;
  let lastCenter = new THREE.Vector3(-0.18 * mirror, 1.04, 0.37);
  let pose = { phase: 'ready', handedness: 'forehand', contact: false };
  const readyCenter = new THREE.Vector3();
  const refreshReady = () => { readyCenter.fromArray(readyBodyPose(motionProfile).paddleReady); readyCenter.x *= mirror; };
  refreshReady();

  function localContact(event, x = root.position.x) {
    return new THREE.Vector3((event.x - x) * -side, event.y, (root.position.z - event.z) * side);
  }
  function beginSwing(time, event = {}) {
    if (event.profileId) setProfile(event.profileId);
    const lead = Math.max(0.065, event.contactDelay ?? event.lead ?? 0.12);
    const target = { x: event.x ?? root.position.x + side * mirror * 0.19, y: event.y ?? 1.07, z: event.z ?? side * 1.54 };
    stroke = {
      id: ++strokeId, startedAt: time, contactAt: event.contactTime ?? time + lead, lead,
      handedness: event.handedness || (localContact(target).x * mirror > 0.025 ? 'backhand' : 'forehand'),
      spin: event.spin ?? 1, target, ready: lastCenter.clone(), contact: false, serve: !!event.serve,
      shotType: event.shotType ?? (event.spin < -0.1 ? 'push' : Math.abs(event.spin ?? 1) < 0.15 ? 'drive' : 'loop'), stance: event.stance, bodyReady: bodyPose,
    };
  }
  function contact(time, event = {}) {
    if (!stroke || time > stroke.contactAt + 0.42) beginSwing(time - 0.10, { ...event, contactDelay: 0.10 });
    stroke.contactAt = time;
    stroke.target = { x: event.x ?? stroke.target.x, y: event.y ?? stroke.target.y, z: event.z ?? stroke.target.z };
    stroke.spin = event.spin ?? stroke.spin; stroke.contact = true;
  }

  function setProfile(id) {
    const next = resolveMotionProfile(id);
    if (next === motionProfile && handed === (next === 'lin-yun-ju' ? 'left' : 'right')) return;
    motionProfile = next; handed = next === 'lin-yun-ju' ? 'left' : 'right'; mirror = handed === 'left' ? -1 : 1;
    dominant = arms.find(arm => arm.sign === -mirror); dominant.end.add(paddle);
    for (const arm of arms) {
      for (const child of [...arm.end.children]) if (child.isMesh) { arm.end.remove(child); child.geometry.dispose(); }
      handGeometry(arm.end, skin, arm.sign, arm === dominant); mergeStatic(arm.end); arm.bendWorld = null;
    }
    const jerseyColor = next === 'lin-yun-ju' ? 0xce6733 : 0x426eae;
    shirt.map?.dispose(); shirt.map = jerseyTexture(jerseyColor, next === 'lin-yun-ju' ? 1 : -1);
    shirt.color.setHex(shirt.map ? 0xffffff : jerseyColor); sleeves.color.setHex(jerseyColor); shirt.needsUpdate = true;
    skin.color.setHex(next === 'lin-yun-ju' ? 0xc58f6b : 0xd2a17c);
    stroke = null; bodyPose = readyBodyPose(motionProfile); refreshReady(); lastCenter.copy(readyCenter);
  }

  function update(time, dt, x, ball, active, swingState, stance) {
    const elapsed = clamp(dt || 0, 0, 0.04);
    const translationStep = clamp(dt || 0, 0, 0.10);
    const rootDepth = stance?.rootZ ?? swingState?.stance?.rootZ ?? stroke?.stance?.rootZ;
    if (rootDepth !== undefined) root.position.z += clamp(side * Math.abs(rootDepth) - root.position.z, -translationStep * 3.2, translationStep * 3.2);
    if (previousX === null) previousX = x;
    if (previousZ === null) previousZ = root.position.z;
    const rawVelocity = translationStep > 0 ? (x - previousX) / translationStep : 0;
    velocity += (clamp(rawVelocity, -3.3, 3.3) - velocity) * (1 - Math.exp(-elapsed * 16));
    const rawDepthVelocity = translationStep > 0 ? (root.position.z - previousZ) / translationStep : 0;
    depthVelocity += (clamp(rawDepthVelocity, -2.6, 2.6) - depthVelocity) * (1 - Math.exp(-elapsed * 16));
    if (translationStep > 0) { previousZ = root.position.z; previousX = x; }
    root.position.x = x;
    readyAmount += ((active || stroke ? 1 : 0.62) - readyAmount) * (1 - Math.exp(-elapsed * 16));
    serveAmount += ((stroke?.serve ? 1 : 0) - serveAmount) * (1 - Math.exp(-elapsed * 13));
    rallyAmount += ((active && !stroke?.serve ? 1 : 0) - rallyAmount) * (1 - Math.exp(-elapsed * 14));
    if (swingState && !stroke && swingState.target && time < swingState.until) beginSwing(swingState.startedAt ?? time, { ...swingState.target, ...swingState });
    const tableReceive = stroke && !stroke.serve && Math.abs(stroke.target.z) < 1.37;
    const definition = motionDefinition(motionProfile, stroke?.handedness, stroke?.shotType, stroke?.serve, tableReceive);
    if (tableReceive && stroke.shotType !== 'flick') {
      definition.wind[1] = Math.max(0.04, definition.wind[1]);
      definition.follow[1] = Math.max(0.025, definition.follow[1]);
      definition.velocity[1] = 0.10;
    }
    const clipDuration = definition.duration;
    if (stroke && time > stroke.contactAt + clipDuration) stroke = null;
    const target = stroke ? localContact(stroke.target, x) : readyCenter.clone();
    const canonicalTarget = [target.x * mirror, target.y, target.z];
    const canonicalReady = stroke ? [stroke.ready.x * mirror, stroke.ready.y, stroke.ready.z] : null;
    const recoveryReady = [readyCenter.x * mirror, readyCenter.y, readyCenter.z];
    const sampleMotion = offset => stroke.serve ? sampleServe(time - stroke.contactAt + offset, stroke.lead, canonicalTarget, canonicalReady, recoveryReady) : sampleStroke(time - stroke.contactAt + offset, stroke.lead, canonicalTarget, canonicalReady, stroke.handedness, stroke.spin, { ...definition, recoveryReady });
    const canonical = stroke ? sampleMotion(0) : { center: recoveryReady, phase: 'ready', load: 0, turn: 0, rise: 0 };
    const sample = { ...canonical, center: [canonical.center[0] * mirror, canonical.center[1], canonical.center[2]], turn: canonical.turn * mirror };
    const swingBlend = stroke ? smoothstep((time - stroke.startedAt) / Math.min(stroke.lead, 0.08)) * (1 - smoothstep((time - stroke.contactAt - (clipDuration - 0.25)) / 0.25)) : 0;
    const localVelocity = velocity * -side;
    const lowContact = stroke ? clamp((1.04 - target.y) * 0.55, 0, 0.15) * swingBlend : 0;
    const profileReady = readyBodyPose(motionProfile);
    bodyPose = stroke ? sampleBodyClip(motionProfile, time - stroke.contactAt, stroke.lead, stroke.handedness, stroke.shotType, stroke.serve, tableReceive) : profileReady;
    if (stroke) bodyPose = blendBodyPose(stroke.bodyReady, bodyPose, smoothstep((time - stroke.startedAt) / Math.min(stroke.lead, 0.075)));
    const shiftedX = bodyPose.hips[0] * mirror + (stroke ? clamp(target.x * 0.14, -0.075, 0.075) * swingBlend : 0);
    pelvis.position.set(shiftedX, bodyPose.hips[1] + (1 - readyAmount) * 0.07 - lowContact, bodyPose.hips[2]);
    pelvis.rotation.set(0, bodyPose.hipYaw * mirror, clamp(-localVelocity * 0.022, -0.06, 0.06));
    spine.rotation.set(bodyPose.chest[0] - (1 - readyAmount) * 0.10, bodyPose.chest[1] * mirror, bodyPose.chest[2] * mirror + clamp(-localVelocity * 0.025, -0.06, 0.06));
    head.rotation.set(bodyPose.neck[0], bodyPose.neck[1] * mirror, bodyPose.neck[2] * mirror);
    head.rotation.y += ball ? clamp(((ball.x - x) * -side) * 0.13 - bodyPose.chest[1] * mirror * 0.40, -0.28, 0.28) : -bodyPose.chest[1] * mirror * 0.40;
    // A planted foot keeps its world position until a discrete shuffle transfers it.
    const footPose = leg => bodyPose.feet[leg.sign === -mirror ? 0 : 1];
    for (const leg of legs) if (leg.worldX === null) {
      leg.worldX = x + -side * footPose(leg)[0] * mirror;
      leg.worldZ = root.position.z + -side * footPose(leg)[1];
    }
    // Foot transfers advance between renders too: a slow frame may contain the
    // landing of one foot and the push-off of the other.
    const footElapsed = footTime === null ? 0 : clamp(time - footTime, 0, 0.18);
    const subdivisions = Math.max(1, Math.ceil(footElapsed * 120));
    const cadence = clamp(MOTION_PROFILES[motionProfile].stepTime - Math.max(Math.hypot(velocity, depthVelocity), Math.hypot(rawVelocity, rawDepthVelocity)) * 0.033, 0.050, 0.16);
    for (let subdivision = 1; subdivision <= subdivisions; subdivision++) {
      const progress = subdivision / subdivisions;
      const stepTime = time - footElapsed * (1 - progress);
      const bodyX = THREE.MathUtils.lerp(footElapsed ? footRootX : x, x, progress);
      const bodyZ = THREE.MathUtils.lerp(footElapsed ? footRootZ : root.position.z, root.position.z, progress);
      for (const leg of legs) if (leg.step) {
        if (cadence < leg.step.duration) {
          const previousTime = stepTime - footElapsed / subdivisions;
          const progress = clamp((previousTime - leg.step.at) / leg.step.duration, 0, 1);
          leg.step.duration = cadence; leg.step.at = previousTime - progress * cadence;
        }
        const progress = clamp((stepTime - leg.step.at) / leg.step.duration, 0, 1);
        leg.worldX = THREE.MathUtils.lerp(leg.step.from[0], leg.step.to[0], smoothstep(progress));
        leg.worldZ = THREE.MathUtils.lerp(leg.step.from[1], leg.step.to[1], smoothstep(progress));
        if (progress >= 1) leg.step = null;
      }
      if (!legs.some(leg => leg.step)) {
        const candidates = legs.map(leg => ({ leg, error: Math.hypot(bodyX + -side * footPose(leg)[0] * mirror - leg.worldX, bodyZ + -side * footPose(leg)[1] - leg.worldZ) }));
        candidates.sort((a, b) => b.error - a.error);
        if (candidates[0].error > 0.09) {
          let choice = candidates[0].leg;
          if (candidates[0].error < 0.17 && candidates.find(candidate => candidate.leg === legs[nextFoot]).error > 0.075) choice = legs[nextFoot];
          const duration = cadence;
          const worldGoal = [bodyX + -side * footPose(choice)[0] * mirror + clamp(rawVelocity * duration * 0.75, -0.07, 0.07), bodyZ + -side * footPose(choice)[1] + clamp(rawDepthVelocity * duration * 0.75, -0.06, 0.06)];
          choice.step = { at: stepTime, from: [choice.worldX, choice.worldZ], to: worldGoal, duration };
          nextFoot = legs.indexOf(choice) === 0 ? 1 : 0;
        }
      }
    }
    footTime = time; footRootX = x; footRootZ = root.position.z;
    const flight = legs.find(leg => leg.step);
    if (flight) {
      const transfer = Math.sin(clamp((time - flight.step.at) / flight.step.duration, 0, 1) * Math.PI);
      pelvis.position.x -= flight.sign * transfer * 0.024;
      pelvis.rotation.z += flight.sign * transfer * 0.012;
      pelvis.position.y -= transfer * 0.012;
    }
    for (const leg of legs) {
      let lift = 0; leg.pitch = 0;
      if (leg.step) {
        const t = clamp((time - leg.step.at) / leg.step.duration, 0, 1);
        leg.worldX = THREE.MathUtils.lerp(leg.step.from[0], leg.step.to[0], smoothstep(t));
        leg.worldZ = THREE.MathUtils.lerp(leg.step.from[1], leg.step.to[1], smoothstep(t));
        lift = Math.sin(t * Math.PI) ** 1.4 * 0.032;
        leg.pitch = -Math.sin(t * Math.PI) * 0.18;
        if (t >= 1) leg.step = null;
      }
      leg.ankle = new THREE.Vector3((leg.worldX - x) * -side, 0.072 + lift, (leg.worldZ - root.position.z) * -side);
      const hip = leg.anchor.position.clone().applyEuler(pelvis.rotation).add(new THREE.Vector3(pelvis.position.x, 0, pelvis.position.z));
      const horizontalSq = (leg.ankle.x - hip.x) ** 2 + (leg.ankle.z - hip.z) ** 2;
      const maxHeight = leg.ankle.y - hip.y + Math.sqrt(Math.max(0.1, 0.818 ** 2 - horizontalSq));
      pelvis.position.y = Math.min(pelvis.position.y, maxHeight);
    }
    root.updateMatrixWorld(true);
    for (const leg of legs) {
      const index = leg.sign === -mirror ? 0 : 1;
      const knee = vec(bodyPose.knees[index]); knee.x *= mirror; knee.y -= lowContact * 0.5;
      placeChain(leg, rootPointToAnchor(root, leg.anchor, leg.ankle), rootPointToAnchor(root, leg.anchor, knee).toArray(), elapsed);
      root.updateMatrixWorld(true);
      orientEnd(root, leg.end, new THREE.Euler(leg.pitch, bodyPose.footYaw[index] * mirror, 0));
    }
    root.updateMatrixWorld(true);
    const center = vec(sample.center);
    const lowBallTilt = tableReceive || stroke?.shotType === 'push' ? smoothstep((0.95 - target.y) / 0.12) * swingBlend : 0;
    const wristRotation = new THREE.Euler(THREE.MathUtils.lerp(bodyPose.wrist[0], 1.25, lowBallTilt), bodyPose.wrist[1] * mirror, bodyPose.wrist[2] * mirror);
    const wristQuaternion = new THREE.Quaternion().setFromEuler(wristRotation);
    const worldCenter = root.localToWorld(center.clone());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(wristQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(wristQuaternion);
    const bladeExtentZ = 0.096 * Math.sqrt(Math.max(0, 1 - normal.z ** 2)) + 0.012;
    const handleExtentZ = -0.101 * up.z + 0.0345 * Math.abs(up.z) - 0.002 * normal.z + 0.017;
    if (stroke && Math.abs(worldCenter.z) < 1.37 + Math.max(bladeExtentZ, handleExtentZ) && Math.abs(worldCenter.x) < 0.8625) {
      const bladeClearance = 0.096 * Math.sqrt(Math.max(0, 1 - normal.y ** 2)) + 0.012;
      const handleClearance = 0.101 * up.y + 0.0345 * Math.abs(up.y) + 0.002 * normal.y + 0.017;
      const clearance = Math.max(bladeClearance, handleClearance);
      center.y = Math.max(center.y, 0.76 + clearance);
    }
    const handTarget = center.clone().sub(bladeCenter.clone().applyQuaternion(wristQuaternion));
    for (const arm of arms) {
      const isDominant = arm === dominant;
      arm.anchor.position.y = 0.405 + bodyPose.shoulders[isDominant ? 0 : 1];
      root.updateMatrixWorld(true);
      const balancing = new THREE.Vector3(0.04 * mirror, 1.055, 0.625);
      const freeHand = vec(bodyPose.freeHand); freeHand.x *= mirror; freeHand.y -= lowContact * 0.6;
      balancing.lerp(freeHand, rallyAmount);
      if (stroke?.serve) {
        const release = smoothstep((time - stroke.startedAt - 0.18) / 0.14);
        balancing.set(THREE.MathUtils.lerp(0.04, 0.27, release) * mirror, THREE.MathUtils.lerp(1.055, 0.94, release) + sample.toss * 0.08, THREE.MathUtils.lerp(0.625, 0.30, release));
      }
      const armTarget = isDominant ? handTarget : balancing;
      const elbow = vec(isDominant ? bodyPose.playingElbow : bodyPose.freeElbow);
      elbow.x *= mirror; elbow.y -= lowContact * 0.8;
      // Clip elbows are points in court-facing body space, transformed with the
      // actual shoulder. IK adjusts reach while retaining the authored bend plane.
      placeChain(arm, rootPointToAnchor(root, arm.anchor, armTarget), rootPointToAnchor(root, arm.anchor, elbow).toArray(), elapsed);
      root.updateMatrixWorld(true);
      const freePalm = stroke?.serve ? THREE.MathUtils.lerp(1.35, 1.90, smoothstep((time - stroke.startedAt - 0.18) / 0.14)) : THREE.MathUtils.lerp(1.35, bodyPose.freePalm, rallyAmount);
      orientEnd(root, arm.end, isDominant ? wristRotation : new THREE.Euler(freePalm, 0, 0.25 * mirror));
    }
    root.updateMatrixWorld(true);
    dominant.end.getWorldPosition(handWorld);
    arms.find(arm => arm !== dominant).end.getWorldPosition(freeHandWorld);
    paddleWorld.copy(bladeCenter); paddle.localToWorld(paddleWorld);
    lastCenter.copy(paddleWorld); root.worldToLocal(lastCenter);
    pose = {
      phase: sample.phase, time, strokeId: stroke?.id ?? strokeId, handedness: stroke?.handedness ?? 'forehand', dominantHand: handed, serve: stroke?.serve ?? false,
      contact: stroke?.contact ?? false, contactAt: stroke?.contactAt ?? null,
      target: stroke ? { ...stroke.target } : null, paddle: paddleWorld.toArray(), hand: handWorld.toArray(),
      shoulderTurn: pelvis.rotation.y + spine.rotation.y, hipTurn: pelvis.rotation.y, footMoving: legs.findIndex(leg => leg.step),
      reachError: dominant.reachError,
      shotStyle: stroke?.shotType ?? 'ready', profileId: motionProfile, bodyPose, rootDepth: Math.abs(root.position.z),
      pelvisHeight: pelvis.position.y, feet: legs.map(leg => [leg.worldX, leg.worldZ]), legReachError: Math.max(...legs.map(leg => leg.reachError)),
    };
    root.userData.pose = pose;
  }
  update(0, 0, 0, null, false);
  return {
    root, handWorld, freeHandWorld, paddleWorld, beginSwing, contact, update, setProfile,
    strike(time, position, spin) { contact(time, { ...position, spin }); },
    endSwing() { if (stroke) stroke.contact = false; },
    reset() {
      stroke = null; strokeId = 0; previousX = null; previousZ = null; velocity = 0; depthVelocity = 0; nextFoot = 0; readyAmount = 0.62; serveAmount = 0; rallyAmount = 0; bodyPose = readyBodyPose(motionProfile);
      footTime = null; footRootX = root.position.x; footRootZ = root.position.z;
      for (const leg of legs) { leg.worldX = null; leg.worldZ = null; leg.step = null; }
      for (const chain of [...legs, ...arms]) chain.bendWorld = null;
      lastCenter.copy(readyCenter);
    },
    metrics() { return { ...pose, armLengths: [dominant.upperLength, dominant.lowerLength], legLengths: [legs[0].upperLength, legs[0].lowerLength] }; },
  };
}
