import * as THREE from 'three';

function railGeometry(length) {
  const profile = [[0, -.18], [.045, -.145], [.045, -.08], [-.045, 0], [.045, .08], [.045, .145], [0, .18]];
  const positions = [], uv = [], indices = [];
  for (const z of [-length / 2, length / 2]) for (const [x, y] of profile) {
    positions.push(x, y, z); uv.push(z, y * 3);
  }
  for (let i = 0; i < profile.length - 1; i++) indices.push(i, i + 7, i + 1, i + 1, i + 7, i + 8);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function rubberTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d'); let seed = 527;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 850; i++) {
    const lane = i % 2 ? .26 : .74, x = (lane + (random() - .5) * .12) * 128;
    ctx.fillStyle = `rgba(24,24,22,${.025 + random() * .045})`;
    ctx.fillRect(x, random() * 512, .4 + random() * 2, 4 + random() * 64);
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; return map;
}

export function addRoadDetails({ scene, track, materials }) {
  const half = track.width / 2, grandprix = track.theme === 'grandprix';
  const steel = new THREE.MeshStandardMaterial({ color: '#929a96', metalness: .72, roughness: .5, side: THREE.DoubleSide, envMapIntensity: .7 });
  const count = Math.ceil(track.length / 6) * 2;
  const rails = new THREE.InstancedMesh(railGeometry(6.12), steel, grandprix ? count * 2 : count);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 1.1, .1), steel, count);
  const reflectors = new THREE.InstancedMesh(new THREE.BoxGeometry(.09, .16, .14), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .28 }), Math.ceil(Math.ceil(track.length / 6) / 3) * 2);
  const bolts = new THREE.InstancedMesh(new THREE.SphereGeometry(.025, 5, 3), steel, count);
  const barrier = grandprix ? new THREE.InstancedMesh(new THREE.BoxGeometry(.4, .72, 6.1), materials.concrete, count) : null;
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), size = new THREE.Vector3(1, 1, 1);
  let postIndex = 0, railIndex = 0, reflectorIndex = 0;
  function place(mesh, index, p, side, y, offset = track.wallOffset) {
    q.setFromAxisAngle(axis, p.heading); position.set(p.x + p.nx * offset * side, p.y + y, p.z + p.nz * offset * side);
    matrix.compose(position, q, size); mesh.setMatrixAt(index, matrix);
  }
  function segment(mesh, index, a, b, side, y, length, offset = track.wallOffset) {
    const from = new THREE.Vector3(a.x + a.nx * offset * side, a.y + y, a.z + a.nz * offset * side);
    const to = new THREE.Vector3(b.x + b.nx * offset * side, b.y + y, b.z + b.nz * offset * side);
    const direction = to.clone().sub(from), span = direction.length();
    q.setFromEuler(new THREE.Euler(-Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), Math.atan2(direction.x, direction.z), 0, 'YXZ'));
    position.copy(from).add(to).multiplyScalar(.5); size.set(1, 1, (span + .08) / length);
    matrix.compose(position, q, size); mesh.setMatrixAt(index, matrix); size.set(1, 1, 1);
  }
  for (let s = 0; s < track.length; s += 6) for (const side of [-1, 1]) {
    const p = track.sample(s), end = track.sample(Math.min(s + 6, track.length));
    place(posts, postIndex, p, side, .53);
    place(bolts, postIndex, p, side, .78, track.wallOffset - .07);
    segment(rails, railIndex++, p, end, side, .78, 6.12);
    if (grandprix) { segment(rails, railIndex++, p, end, side, 1.14, 6.12); segment(barrier, postIndex, p, end, side, .36, 6.1, track.wallOffset + .14); }
    if (Math.floor(s / 6) % 3 === 0) {
      place(reflectors, reflectorIndex, p, side, .9, track.wallOffset - .12);
      reflectors.setColorAt(reflectorIndex++, new THREE.Color(side > 0 ? '#e1e2cf' : '#94392d'));
    }
    postIndex++;
  }
  posts.count = bolts.count = postIndex; rails.count = railIndex; reflectors.count = reflectorIndex;
  for (const mesh of [posts, rails, reflectors, bolts, barrier].filter(Boolean)) {
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  }

  const positions = [], colors = [], uv = [], indices = [], red = new THREE.Color(grandprix ? '#2b7288' : '#a64b3d'), white = new THREE.Color('#ede9df');
  for (let s = 0; s < track.length; s += 2) for (const side of [-1, 1]) {
    const p = track.sample(s), q = track.sample(s + 2);
    if (Math.abs(p.curvature) < (grandprix ? .002 : .0035) || p.curvature * side < 0) continue;
    const color = Math.floor(s / 2) % 2 ? red : white, first = positions.length / 3;
    for (const a of [p, q]) for (let rib = 0; rib <= 4; rib++) {
      const r = half + rib * .2, height = .035 + Math.sin(rib / 4 * Math.PI) * .11;
      positions.push(a.x + a.nx * r * side, a.y + height, a.z + a.nz * r * side);
      uv.push(r, a.s); colors.push(color.r, color.g, color.b);
    }
    for (let rib = 0; rib < 4; rib++) { const k = first + rib; indices.push(k, k + 5, k + 1, k + 1, k + 5, k + 6); }
  }
  const curbGeo = new THREE.BufferGeometry(); curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); curbGeo.setIndex(indices); curbGeo.computeVertexNormals();
  const curbMat = materials.concrete.clone(); curbMat.vertexColors = true; curbMat.side = THREE.DoubleSide;
  const curbs = new THREE.Mesh(curbGeo, curbMat); curbs.receiveShadow = true; scene.add(curbs);

  const rubberPos = [], rubberUV = [], rubberIndices = [];
  const segments = track.samples.length;
  for (let i = 0; i <= segments; i++) {
    const p = track.sample(i / segments * track.length);
    const line = THREE.MathUtils.clamp(p.curvature * 160, -1.6, 1.6);
    for (const r of [-1.35, 1.35]) {
      rubberPos.push(p.x + p.nx * (line + r), p.y + .047, p.z + p.nz * (line + r));
      rubberUV.push(r < 0 ? 0 : 1, i / segments * track.length / 36);
    }
    if (i < segments) { const k = i * 2; rubberIndices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const rubberGeo = new THREE.BufferGeometry(); rubberGeo.setAttribute('position', new THREE.Float32BufferAttribute(rubberPos, 3));
  rubberGeo.setAttribute('uv', new THREE.Float32BufferAttribute(rubberUV, 2)); rubberGeo.setIndex(rubberIndices); rubberGeo.computeVertexNormals();
  const rubber = new THREE.Mesh(rubberGeo, new THREE.MeshStandardMaterial({ map: rubberTexture(), transparent: true, opacity: grandprix ? .5 : .24, roughness: 1, depthWrite: false, side: THREE.DoubleSide }));
  rubber.receiveShadow = true; scene.add(rubber);
}
