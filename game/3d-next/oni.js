/**
 * Lightweight, fully geometric oni enemy for the 3D arena.
 * Local forward is +Z; the arena rotates root to face its target.
 * `time` is the current action's elapsed seconds and `dt` advances idle/chase motion.
 */
const shared = new WeakMap();

function resources(THREE) {
  let value = shared.get(THREE);
  if (value) return value;
  const geometry = {
    body: new THREE.SphereGeometry(1, 12, 9),
    head: new THREE.SphereGeometry(1, 12, 10),
    plate: new THREE.BoxGeometry(1, 1, 1),
    limb: new THREE.CylinderGeometry(0.72, 1, 1, 8),
    horn: new THREE.ConeGeometry(1, 1, 7),
    spike: new THREE.ConeGeometry(1, 1, 6),
    eye: new THREE.SphereGeometry(1, 8, 6),
    mask: (() => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.26, 0.13);
      shape.lineTo(-0.18, 0.27);
      shape.lineTo(0, 0.21);
      shape.lineTo(0.18, 0.27);
      shape.lineTo(0.26, 0.13);
      shape.lineTo(0.21, -0.12);
      shape.lineTo(0.11, -0.24);
      shape.lineTo(0.055, -0.31);
      shape.lineTo(0, -0.2);
      shape.lineTo(-0.055, -0.31);
      shape.lineTo(-0.11, -0.24);
      shape.lineTo(-0.21, -0.12);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.018, bevelThickness: 0.018 });
    })(),
    ring: new THREE.TorusGeometry(1, 0.055, 4, 12),
    blade: (() => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.08, -0.05); shape.lineTo(0.16, 0.0); shape.lineTo(0.42, 0.42);
      shape.quadraticCurveTo(0.56, 0.72, 0.38, 1.0); shape.lineTo(0.06, 0.76);
      shape.quadraticCurveTo(0.30, 0.72, 0.22, 0.54); shape.lineTo(-0.08, 0.13); shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.035, bevelThickness: 0.025 });
    })(),
  };
  const material = {
    hide: new THREE.MeshStandardMaterial({ color: 0x292437, roughness: 0.82 }),
    hideLight: new THREE.MeshStandardMaterial({ color: 0x44374e, roughness: 0.75 }),
    armor: new THREE.MeshStandardMaterial({ color: 0x51475e, roughness: 0.55, metalness: 0.22 }),
    armorDark: new THREE.MeshStandardMaterial({ color: 0x201d2b, roughness: 0.62, metalness: 0.28 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x342644, roughness: 0.88 }),
    clothLight: new THREE.MeshStandardMaterial({ color: 0x64447e, roughness: 0.78 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xc5b6c9, roughness: 0.68 }),
    horn: new THREE.MeshStandardMaterial({ color: 0xddd2dd, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xa98661, roughness: 0.45, metalness: 0.62 }),
    violet: new THREE.MeshStandardMaterial({ color: 0x9c63ff, emissive: 0x6122df, emissiveIntensity: 1.7, roughness: 0.36 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xc79eff, emissive: 0x8f3dff, emissiveIntensity: 3.2, roughness: 0.24 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xb89be0, emissive: 0x3c1d69, emissiveIntensity: 0.55, roughness: 0.29, metalness: 0.5, side: THREE.DoubleSide }),
  };
  value = { geometry, material };
  shared.set(THREE, value);
  return value;
}

/** Build an animated, non-billboard oni. Supported roles: grunt, runner, elite, boss. */
export function createOni(THREE, role = 'grunt') {
  const r = resources(THREE);
  const ownedGeometries = [];
  const boss = role === 'boss', elite = role === 'elite' || boss, runner = role === 'runner';
  const size = boss ? 1.62 : elite ? 1.24 : runner ? 0.88 : 1;
  const root = new THREE.Group();
  root.name = `oni-${role}`;
  const torsoPivot = new THREE.Group(); torsoPivot.position.y = 1.02 * size; root.add(torsoPivot);
  const add = (parent, name, geo, mat, pos, scale, rot) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.name = name;
    mesh.position.set(pos[0], pos[1], pos[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh;
  };
  const box = (parent, name, mat, pos, scale, rot) => add(parent, name, r.geometry.plate, mat, pos, scale, rot);
  const ball = (parent, name, mat, pos, scale) => add(parent, name, r.geometry.body, mat, pos, scale);
  const cone = (parent, name, mat, pos, scale, rot) => add(parent, name, r.geometry.horn, mat, pos, scale, rot);

  // Broad hunched torso and layered waist armor echo the heavy inked silhouette.
  ball(torsoPivot, 'corded torso', r.material.hide, [0, 0.02, 0], [0.31 * size, 0.53 * size, 0.24 * size]);
  box(torsoPivot, 'breastplate', r.material.armorDark, [0, 0.13 * size, 0.205 * size], [0.42 * size, 0.37 * size, 0.10 * size]);
  box(torsoPivot, 'chest ridge', r.material.armor, [0, 0.22 * size, 0.3 * size], [0.31 * size, 0.075 * size, 0.035 * size]);
  const waist = box(torsoPivot, 'waist sash', r.material.gold, [0, -0.3 * size, 0.04 * size], [0.6 * size, 0.09 * size, 0.35 * size]);
  waist.rotation.z = -0.035;
  for (const side of [-1, 1]) {
    box(torsoPivot, 'skirt armor', side < 0 ? r.material.cloth : r.material.clothLight,
      [side * 0.19 * size, -0.54 * size, 0.025 * size], [0.24 * size, 0.55 * size, 0.34 * size], [0.06, 0, side * -0.12]);
    box(torsoPivot, 'hip plate', r.material.armor, [side * 0.32 * size, -0.28 * size, 0.07 * size], [0.23 * size, 0.27 * size, 0.32 * size], [0, 0, side * 0.16]);
  }
  box(torsoPivot, 'front loincloth', r.material.clothLight, [0, -0.56 * size, 0.22 * size], [0.28 * size, 0.52 * size, 0.045 * size]);
  for (let i = 0; i < (boss ? 4 : elite ? 3 : 2); i++) {
    cone(torsoPivot, 'spine spike', r.material.armor, [0, (0.38 - i * 0.18) * size, -0.27 * size], [0.12 * size, 0.28 * size, 0.12 * size], [Math.PI / 2, 0, 0]);
  }

  // Masked face, split horn crown, cheek guards, and visible violet eyes.
  const head = new THREE.Group(); head.position.set(0, 0.58 * size, 0.035 * size); torsoPivot.add(head);
  ball(head, 'oni head', r.material.hideLight, [0, 0, 0], [0.29 * size, 0.35 * size, 0.26 * size]);
  add(head, 'ivory war mask', r.geometry.mask, r.material.bone, [0, -0.035 * size, 0.245 * size], [size, size, size]);
  cone(head, 'mask nose', r.material.armorDark, [0, -0.09 * size, 0.325 * size], [0.055 * size, 0.14 * size, 0.05 * size], [Math.PI, 0, 0]);
  for (const side of [-1, 1]) {
    ball(head, 'glowing eye', r.material.eye, [side * 0.14 * size, 0.055 * size, 0.337 * size], [0.043 * size, 0.022 * size, 0.016 * size]);
    cone(head, 'cheek guard', r.material.armor, [side * 0.23 * size, -0.16 * size, 0.22 * size], [0.07 * size, 0.26 * size, 0.09 * size], [Math.PI, 0, side * -0.17]);
    cone(head, 'swept oni horn', r.material.horn, [side * 0.235 * size, 0.27 * size, -0.005 * size], [0.13 * size, 0.52 * size, 0.13 * size], [0, 0, side * -0.33]);
    cone(head, 'brow horn', r.material.armor, [side * 0.31 * size, 0.05 * size, 0.12 * size], [0.075 * size, 0.25 * size, 0.075 * size], [Math.PI / 2, 0, side * 0.24]);
  }
  box(head, 'jaw plate', r.material.armorDark, [0, -0.25 * size, 0.19 * size], [0.28 * size, 0.08 * size, 0.13 * size]);

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.35 * size, 0.34 * size, 0.01 * size); torsoPivot.add(shoulder);
    ball(shoulder, 'pauldron', r.material.armor, [side * 0.02 * size, -0.02 * size, 0], [0.19 * size, 0.18 * size, 0.21 * size]);
    if (elite) cone(shoulder, 'pauldron spike', r.material.horn, [side * 0.09 * size, 0.15 * size, 0.02 * size], [0.09 * size, 0.29 * size, 0.09 * size], [0, 0, side * -0.6]);
    const upper = add(shoulder, 'upper arm', r.geometry.limb, r.material.hide, [side * 0.05 * size, -0.29 * size, 0], [0.12 * size, 0.43 * size, 0.12 * size]);
    upper.rotation.z = side * -0.17;
    const elbow = new THREE.Group(); elbow.position.set(side * 0.09 * size, -0.5 * size, 0.015 * size); shoulder.add(elbow);
    ball(elbow, 'elbow guard', r.material.armorDark, [0, 0, 0], [0.14 * size, 0.14 * size, 0.14 * size]);
    const forearm = add(elbow, 'forearm', r.geometry.limb, r.material.hideLight, [0, -0.22 * size, 0.015 * size], [0.105 * size, 0.38 * size, 0.105 * size]);
    forearm.rotation.z = side * 0.08;
    const hand = new THREE.Group(); hand.position.set(0, -0.43 * size, 0.04 * size); elbow.add(hand);
    ball(hand, 'clawed fist', r.material.armorDark, [0, -0.035 * size, 0], [0.11 * size, 0.14 * size, 0.12 * size]);
    for (let digit = -1; digit <= 1; digit++) cone(hand, 'ivory claw', r.material.horn,
      [digit * 0.075 * size, -0.11 * size, 0.085 * size], [0.035 * size, 0.14 * size, 0.035 * size], [Math.PI / 2, 0, digit * 0.2]);
    arms.push({ side, shoulder, elbow, hand });
  }
  // A thick, curved violet cleaver matches the source artwork's long weapon.
  const weapon = new THREE.Group(); arms[1].hand.add(weapon); weapon.position.set(0.07 * size, -0.04 * size, 0.02 * size);
  const haft = add(weapon, 'black iron haft', r.geometry.plate, r.material.armorDark, [0, 0.42 * size, 0], [0.075 * size, 1.12 * size, 0.075 * size]);
  haft.rotation.z = -0.12;
  const blade = add(weapon, 'crescent spirit blade', r.geometry.blade, elite ? r.material.violet : r.material.blade,
    [0.02 * size, 0.73 * size, 0.015 * size], [0.68 * size, 0.58 * size, 0.7 * size], [0, 0, -0.15]);
  blade.rotation.y = Math.PI;
  for (const y of [0.05, 0.21, 0.61]) {
    const band = add(weapon, 'haft gold wrap', r.geometry.ring, r.material.gold, [0, y * size, 0], [0.06 * size, 0.06 * size, 0.06 * size]);
    band.rotation.x = Math.PI / 2;
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 0.18 * size, 0.74 * size, 0); root.add(hip);
    const thigh = add(hip, 'thigh', r.geometry.limb, r.material.hide, [0, -0.2 * size, 0], [0.2 * size, 0.42 * size, 0.2 * size]);
    const shinPivot = new THREE.Group(); shinPivot.position.set(0, -0.4 * size, 0); hip.add(shinPivot);
    add(shinPivot, 'shin guard', r.geometry.limb, r.material.armorDark, [0, -0.17 * size, 0.04 * size], [0.16 * size, 0.37 * size, 0.17 * size]);
    box(shinPivot, 'greave plate', r.material.armor, [0, -0.17 * size, 0.14 * size], [0.21 * size, 0.27 * size, 0.07 * size]);
    ball(shinPivot, 'split hoof', r.material.hideLight, [0, -0.19 * size, 0.09 * size], [0.19 * size, 0.11 * size, 0.27 * size]);
    legs.push({ side, hip, shinPivot, thigh });
  }

  // Collapse static siblings that share a pivot and material. Their baked
  // local transforms keep the exact silhouette while the surrounding Groups
  // remain independent for animation. This removes most of the per-oni draws.
  function mergeStaticMeshes(parent) {
    const byMaterial = new Map();
    for (const child of [...parent.children]) {
      if (child.isMesh) {
        const list = byMaterial.get(child.material) || [];
        list.push(child); byMaterial.set(child.material, list);
      } else mergeStaticMeshes(child);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const geometries = [];
      for (const mesh of meshes) {
        mesh.updateMatrix();
        const sourceGeometry = mesh.geometry.clone();
        const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
        if (geometry !== sourceGeometry) sourceGeometry.dispose();
        geometry.applyMatrix4(mesh.matrix);
        geometries.push(geometry);
      }
      const attributes = Object.keys(geometries[0].attributes);
      const merged = new THREE.BufferGeometry();
      for (const name of attributes) {
        const source = geometries.map(geometry => geometry.attributes[name]).filter(Boolean);
        if (source.length !== geometries.length) continue;
        const first = source[0];
        if (source.some(attribute => attribute.itemSize !== first.itemSize)) continue;
        const length = source.reduce((sum, attribute) => sum + attribute.array.length, 0);
        const values = new first.array.constructor(length);
        let offset = 0;
        for (const attribute of source) { values.set(attribute.array, offset); offset += attribute.array.length; }
        merged.setAttribute(name, new THREE.BufferAttribute(values, first.itemSize, first.normalized));
      }
      for (const geometry of geometries) geometry.dispose();
      merged.computeBoundingSphere();
      ownedGeometries.push(merged);
      for (const mesh of meshes) parent.remove(mesh);
      const combined = new THREE.Mesh(merged, material);
      combined.name = `${role}-merged-${material.name || material.type}`;
      combined.castShadow = false; combined.receiveShadow = false;
      parent.add(combined);
    }
  }
  mergeStaticMeshes(root);

  let clock = 0;
  const update = (action = 'idle', time = 0, dt = 0) => {
    clock += Math.max(0, Math.min(dt || 0, 0.06));
    const t = Math.max(0, time || 0), phase = clock * (runner ? 10 : 7.2);
    torsoPivot.rotation.set(0, 0, 0); torsoPivot.position.y = 1.02 * size;
    for (const arm of arms) { arm.shoulder.rotation.set(0, 0, 0); arm.elbow.rotation.set(0, 0, 0); }
    for (const leg of legs) { leg.hip.rotation.set(0, 0, 0); leg.shinPivot.rotation.set(0, 0, 0); }
    head.rotation.set(0, 0, 0); weapon.rotation.set(0, 0, 0); weapon.position.set(0.07 * size, -0.04 * size, 0.02 * size);
    if (action === 'chase' || action === 'run') {
      torsoPivot.position.y += Math.abs(Math.sin(phase)) * 0.075 * size;
      torsoPivot.rotation.x = runner ? -0.18 : -0.08;
      for (const leg of legs) {
        const swing = Math.sin(phase + (leg.side < 0 ? Math.PI : 0)); leg.hip.rotation.x = swing * 0.48;
        leg.shinPivot.rotation.x = Math.max(0, -swing) * 0.62;
      }
      arms[0].shoulder.rotation.x = Math.sin(phase + Math.PI) * 0.28 - 0.12;
      arms[1].shoulder.rotation.x = Math.sin(phase) * 0.18 - 0.24;
    } else if (action === 'telegraph') {
      const windup = Math.min(1, t / (boss ? 0.9 : elite ? 0.82 : 0.72));
      torsoPivot.rotation.x = -0.12 - windup * 0.28;
      head.rotation.x = windup * -0.08;
      arms[0].shoulder.rotation.x = -0.6 - windup * 0.45;
      arms[1].shoulder.rotation.x = -1.6 - windup * 0.72;
      arms[1].shoulder.rotation.z = -0.28;
      arms[1].elbow.rotation.x = -0.4;
      weapon.rotation.z = -0.12 - windup * 0.2;
    } else if (action === 'attack') {
      const swing = Math.min(1, t / 0.28);
      torsoPivot.rotation.y = -Math.sin(swing * Math.PI) * 0.55;
      torsoPivot.rotation.x = -0.18 + Math.sin(swing * Math.PI) * 0.2;
      arms[1].shoulder.rotation.x = -1.9 + swing * 2.25;
      arms[1].shoulder.rotation.z = -0.28 + swing * 0.72;
      arms[1].elbow.rotation.x = -0.35 + swing * 0.5;
      arms[0].shoulder.rotation.x = -0.8 + swing * 0.45;
      weapon.rotation.z = -0.34 + swing * 0.85;
    } else if (action === 'hit') {
      const recoil = Math.max(0, 1 - t / 0.22);
      torsoPivot.rotation.z = -0.24 * recoil;
      torsoPivot.rotation.x = -0.32 * recoil;
      head.rotation.z = 0.2 * recoil;
      arms[0].shoulder.rotation.z = -0.48 * recoil;
      arms[1].shoulder.rotation.z = 0.55 * recoil;
    } else if (action === 'dead') {
      const fall = Math.min(1, t / 0.52);
      torsoPivot.rotation.z = -1.42 * fall;
      torsoPivot.position.y = 1.02 * size * (1 - 0.62 * fall);
      arms[0].shoulder.rotation.z = -0.9 * fall;
      arms[1].shoulder.rotation.z = 0.85 * fall;
      for (const leg of legs) leg.hip.rotation.z = leg.side * 0.25 * fall;
    } else {
      torsoPivot.position.y += Math.sin(clock * 2.4) * 0.025 * size;
      arms[0].shoulder.rotation.x = -0.22 + Math.sin(clock * 1.6) * 0.045;
      arms[1].shoulder.rotation.x = -0.36 + Math.sin(clock * 1.6 + 1) * 0.05;
    }
  };

  // Expose role proportions to the caller for spacing and health-bar placement.
  root.userData.role = role;
  root.userData.height = 2.15 * size;
  root.userData.radius = (boss ? 0.9 : elite ? 0.69 : runner ? 0.47 : 0.56) * size;
  return {
    root,
    update,
    dispose() {
      root.removeFromParent();
      root.traverse(object => { if (object.isMesh) { object.geometry = null; object.material = null; } });
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.length = 0;
    },
  };
}
