// Verlet cloth for capes and tabards. A small particle grid is pinned to a bone, falls under
// gravity, trails when the hero runs, and is pushed out of spheres riding the body and legs,
// so it hangs and swings instead of moving as one rigid plate. Everything is allocated once;
// each frame only rewrites one position buffer.
//
// The cloth lives in the model's own space: the game snaps the hero's facing in a single frame,
// and a world-space cloth would be flung through the body. Running still trails the cloth
// through the model's acceleration and an airflow opposite to its travel.
//
// shape(u, v) -> [x, y, z] gives the resting cloth in model rest space (u across, v down);
// the top row (v = 0) is pinned to `pin`. colliders: [[bone, [x, y, z], radius], ...] in rest space.
export function createClothKit(T, root, { name, pin, shape, cols = 11, rows = 16, colliders = [], materials, hem = [1, 1, 1], iterations = 6 }) {
  root.updateMatrixWorld(true);
  const count = cols * rows, rootWorld = root.matrixWorld.clone();
  const local = (bone, p) => new T.Vector3(...p).applyMatrix4(rootWorld).applyMatrix4(bone.matrixWorld.clone().invert());
  const pinBone = root.getObjectByName(pin);
  const rest = [], anchors = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const p = shape(i / (cols - 1), j / (rows - 1)); rest.push(local(pinBone, p));
    if (j === 0) anchors.push(rest.at(-1));
  }
  const spheres = colliders.map(([bone, p, r]) => { const b = root.getObjectByName(bone); return { bone: b, at: local(b, p), r, model: new T.Vector3() }; });
  const links = [];
  const link = (a, b, k) => links.push({ a, b, k, length: 0 });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const n = j * cols + i;
    if (i + 1 < cols) link(n, n + 1, 1);
    if (j + 1 < rows) link(n, n + cols, 1);
    // The pinned row carries only straight-down links: shear or bend links to it would make the curved
    // shoulder line act like a rigid shell, so a leaning chest would hold the whole cape out at an angle.
    if (j === 0) continue;
    // Weak shear and vertical-only bend links: across-the-cape bend links also stiffen a curved cape.
    if (i + 1 < cols && j + 1 < rows) { link(n, n + cols + 1, .25); link(n + 1, n + cols, .25); }
    if (j + 2 < rows) link(n, n + cols * 2, .08);
  }
  const now = new Float32Array(count * 3), old = new Float32Array(count * 3);
  const geometry = new T.BufferGeometry(), positions = new T.Float32BufferAttribute(count * 3, 3).setUsage(T.DynamicDrawUsage);
  const uv = [], colors = [], index = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    uv.push(i / (cols - 1), 1 - j / (rows - 1));
    const edge = j >= rows - 1 || i === 0 || i === cols - 1 ? 1 : 0; colors.push(...(edge ? hem : [1, 1, 1]));
    if (i + 1 < cols && j + 1 < rows) { const n = j * cols + i; index.push(n, n + cols, n + 1, n + 1, n + cols, n + cols + 1); }
  }
  geometry.setAttribute('position', positions); geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geometry.setIndex(index);
  const group = new T.Group(); group.name = name;
  materials.forEach((material, i) => { const mesh = new T.Mesh(geometry, material); mesh.frustumCulled = false; mesh.name = `${name}_${i}`; group.add(mesh); });
  root.add(group);
  const v = new T.Vector3(), w = new T.Vector3(), toModel = new T.Matrix4(), pinMatrix = new T.Matrix4();
  const place = new T.Vector3(), lastPlace = new T.Vector3(), velocity = new T.Vector3(), lastVelocity = new T.Vector3(), push = new T.Vector3(), turn = new T.Quaternion();
  let last = 0, ready = false;
  const read = (array, n, out) => out.set(array[n * 3], array[n * 3 + 1], array[n * 3 + 2]);
  const write = (array, n, p) => { array[n * 3] = p.x; array[n * 3 + 1] = p.y; array[n * 3 + 2] = p.z; };
  function reset() {
    for (let n = 0; n < count; n++) { v.copy(rest[n]).applyMatrix4(pinMatrix); write(now, n, v); write(old, n, v); }
    for (const l of links) l.length = read(now, l.a, v).distanceTo(read(now, l.b, w));
    velocity.set(0, 0, 0); lastVelocity.set(0, 0, 0); push.set(0, 0, 0); ready = true;
  }
  function step(dt) {
    // Gravity plus the inertia of the moving hero (model units are metres).
    const ax = push.x * dt * dt, ay = (push.y - 9.8) * dt * dt, az = push.z * dt * dt, damping = .98;
    for (let n = cols; n < count; n++) {
      const i = n * 3;
      for (let k = 0; k < 3; k++) { const p = now[i + k], speed = (p - old[i + k]) * damping; old[i + k] = p; now[i + k] = p + speed; }
      now[i] += ax; now[i + 1] += ay; now[i + 2] += az;
    }
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < cols; i++) { v.copy(anchors[i]).applyMatrix4(pinMatrix); write(now, i, v); }
      for (const l of links) {
        read(now, l.a, v); read(now, l.b, w); const d = w.sub(v), length = d.length();
        if (length < 1e-6) continue;
        const pull = (length - l.length) / length * .5 * l.k, pinnedA = l.a < cols, pinnedB = l.b < cols;
        const ka = pinnedA ? 0 : pinnedB ? 2 : 1, kb = pinnedB ? 0 : pinnedA ? 2 : 1;
        for (let k = 0; k < 3; k++) { const c = d.getComponent(k) * pull; now[l.a * 3 + k] += c * ka; now[l.b * 3 + k] -= c * kb; }
      }
      for (const s of spheres) {
        const r = s.r + .012;
        for (let n = cols; n < count; n++) {
          read(now, n, v).sub(s.model); const d = v.length();
          if (d < r && d > 1e-6) { v.multiplyScalar(r / d).add(s.model); write(now, n, v); }
        }
      }
    }
    for (let n = cols; n < count; n++) if (now[n * 3 + 1] < .02) now[n * 3 + 1] = .02;
  }
  group.userData.updateCloth = () => {
    if (!group.visible) { ready = false; return; }
    root.updateMatrixWorld(true);
    // Slow frames catch up in up to eight 120 Hz substeps so the cloth still settles.
    const t = performance.now() / 1000, dt = Math.min(1 / 15, Math.max(0, t - last)); last = t;
    toModel.copy(root.matrixWorld).invert();
    pinMatrix.multiplyMatrices(toModel, pinBone.matrixWorld);
    for (const s of spheres) s.model.copy(s.at).applyMatrix4(s.bone.matrixWorld).applyMatrix4(toModel);
    // The hero's travel, expressed in model space: an airflow against the motion plus the
    // acceleration it feels when starting, stopping or dashing.
    root.getWorldPosition(place);
    const scale = root.getWorldScale(w).y || 1;
    if (!ready || place.distanceTo(lastPlace) > 2 * scale) reset();
    else if (dt > 0) {
      velocity.subVectors(place, lastPlace).divideScalar(dt * scale);
      root.getWorldQuaternion(turn).invert();
      push.subVectors(velocity, lastVelocity).divideScalar(dt).multiplyScalar(-.35).addScaledVector(velocity, -1.6).applyQuaternion(turn);
      if (push.length() > 40) push.setLength(40);
      lastVelocity.copy(velocity);
    }
    lastPlace.copy(place);
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) step(dt / steps);
    for (let n = 0; n < count; n++) positions.setXYZ(n, now[n * 3], now[n * 3 + 1], now[n * 3 + 2]);
    positions.needsUpdate = true; geometry.computeVertexNormals();
  };
  group.userData.resetCloth = () => { ready = false; };
  group.userData.colliders = spheres;
  return group;
}
