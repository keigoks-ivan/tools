/**
 * Graybox geometry for the 夜市大街行軍關 (see march.js LEVEL). Plain boxes / cylinders in
 * readable colours: street + stalls, round plaza with fountain, three stair tiers with side
 * stairs, the top platform and the soul gate. Dynamic props follow the director's view():
 * barriers (visible while a gate is closed), demon lanterns, the soul lamp, heal drops and red
 * ground telegraphs.
 *
 *   const world = createMarchWorld(THREE, scene);
 *   world.update(march.view(), dt, seconds);   // every frame
 *   world.heightAt(x, z)                         // floor height in metres (hero / enemy y)
 *   world.constrainCamera(camera.position, heroPosition)   // after moving the camera
 *   world.dispose();
 */
import { LAYOUT, LEVEL, heightAt, toWorld } from './march.js';

const COLORS = {
  market: 0x3b4058, plaza: 0x47425e, stairs: 0x4e4a66, top: 0x5a5474, curb: 0x2a2e40, wall: 0x23273a,
  stall: 0x5b4a44, awnings: [0xc2493f, 0xd08a2c, 0x2f8f8a, 0x7a4fc0], hanging: 0xffb45f,
  fountain: 0x6b7086, water: 0x3a8fd0, barrier: 0xa35cff, gate: 0x2d2a44, portal: 0x9c59ff,
  lantern: 0xff3d5a, lanternPost: 0x3a2a2a, lamp: 0x46e0d0, lampPedestal: 0x6d6a80, heal: 0x5cff8a, danger: 0xff3b30,
  crate: 0xa0703c, jar: 0x7a3b2a, barrel: 0x8a5a2c, bun: 0xfff0d8, wine: 0xc070ff,
};

export function createMarchWorld(THREE, scene) {
  const root = new THREE.Group();
  root.name = 'march-world';
  scene.add(root);
  const statics = new THREE.Group();   // merged per material once the layout is built
  const geometries = [], materials = [], lights = [];
  const box = track(new THREE.BoxGeometry(1, 1, 1), geometries);
  const cylinder = track(new THREE.CylinderGeometry(1, 1, 1, 40), geometries);
  const disc = track(new THREE.CircleGeometry(1, 48), geometries);
  const ring = track(new THREE.RingGeometry(0.93, 1, 48), geometries);
  const matCache = new Map();
  const mat = (color, extra = {}) => {
    const key = `${color}:${JSON.stringify(extra)}`;
    if (!matCache.has(key)) matCache.set(key, track(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra }), materials));
    return matCache.get(key);
  };
  const glow = (color, intensity = 1.4, extra = {}) => mat(color, { emissive: color, emissiveIntensity: intensity, ...extra });

  function add(geometry, material, x, y, z, sx, sy, sz, parent = statics) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }
  /** Box whose top face sits at `top` (metres), bottom at `bottom`. */
  const slab = (material, x, z, width, depth, top, bottom = -0.3) => add(box, material, x, (top + bottom) / 2, z, width, top - bottom, depth);

  // ---- 1. 入口市集 ----
  const market = LEVEL.segments[0];
  slab(mat(COLORS.market), 0, (market.minZ + market.maxZ) / 2 + 1, 14, market.maxZ - market.minZ + 6, 0);
  slab(mat(COLORS.wall), 0, market.maxZ + 3, 22, 1, 3);                       // south backdrop
  for (const side of [-1, 1]) {
    slab(mat(COLORS.curb), side * 7.25, -14, 0.5, 34, 0.35);
    for (let i = 0; i < 6; i++) {
      const z = 0 - i * 5.2;
      const awning = COLORS.awnings[(i + (side > 0 ? 1 : 0)) % COLORS.awnings.length];
      slab(mat(COLORS.stall), side * 9.4, z, 3.2, 3.8, 2.2, 0);
      const roof = add(box, mat(awning), side * 8.5, 2.55, z, 2.2, 0.12, 4.2);
      roof.rotation.z = side * 0.28;
      add(box, glow(COLORS.hanging, 1.6), side * 7.5, 2.1, z + 1.3, 0.28, 0.4, 0.28);
    }
  }

  // ---- 2. 夜市廣場 ----
  const plaza = LEVEL.segments[1];
  add(cylinder, mat(COLORS.plaza), plaza.cx, -0.15, plaza.cz, plaza.r + 0.4, 0.3, plaza.r + 0.4);
  const f = LEVEL.fountain;
  add(cylinder, mat(COLORS.fountain), f.x, 0.3, f.z, f.r, 0.6, f.r);
  add(cylinder, glow(COLORS.water, 0.6), f.x, 0.58, f.z, f.r - 0.3, 0.06, f.r - 0.3);
  add(cylinder, mat(COLORS.fountain), f.x, 1.1, f.z, 0.35, 2.2, 0.35);
  // Low wall around the plaza with the market opening (south) and the stairs opening (north).
  for (let i = 0; i < 48; i++) {
    const a = (i + 0.5) / 48 * Math.PI * 2;
    const x = plaza.cx + Math.cos(a) * (plaza.r + 0.4), z = plaza.cz + Math.sin(a) * (plaza.r + 0.4);
    if (z > plaza.maxZ - 0.5 && Math.abs(x) < 7.5 || z < plaza.minZ + 1 && Math.abs(x) < 8.5) continue;
    const piece = add(box, mat(COLORS.wall), x, 0.45, z, 1.7, 0.9, 0.4);
    piece.rotation.y = -a + Math.PI / 2;
  }

  // ---- 3. 魂門階梯 ----
  const stairs = LEVEL.segments[2];
  const floorAt = z => heightAt(0, z);
  // Terraces and steps as thin slices so the geometry follows heightAt exactly.
  for (let z = stairs.maxZ; z > stairs.minZ - 0.01; z -= 0.5) {
    const top = floorAt(z - 0.25);
    const tier = top < 0.7 ? 0 : top < 1.9 ? 1 : 2;
    slab(mat(COLORS.stairs, { color: new THREE.Color(COLORS.stairs).offsetHSL(0, 0, tier * 0.04).getHex() }), 0, z - 0.25, 16, 0.5, top);
  }
  for (const side of [-1, 1]) {
    // Side walls, open on the middle tier where the side stairs come up.
    slab(mat(COLORS.wall), side * 8.3, -57.5, 0.6, 11, 1.4);
    slab(mat(COLORS.wall), side * 8.3, -78, 0.6, 12, 4.2);
    // Side stairs dropping outward to the dark street below.
    for (let k = 0; k < 8; k++) {
      const x = side * (8.25 + k * 0.5);
      slab(mat(COLORS.stairs), x, -67.5, 0.5, 9, heightAt(x + side * 0.25, -67.5), -0.3);
    }
    slab(mat(COLORS.curb), side * 12.6, -67.5, 1.2, 9, 0.02);
  }
  // Soul lamp pedestal (the flame itself is dynamic).
  const lampAt = LEVEL.lamp, lampY = heightAt(lampAt.x, lampAt.z);
  add(cylinder, mat(COLORS.lampPedestal), lampAt.x, lampY + 0.4, lampAt.z, lampAt.r, 0.8, lampAt.r);

  // ---- 4. 魂門頂端 ----
  const top = LEVEL.segments[3];
  add(cylinder, mat(COLORS.top), top.cx, 1.8, top.cz, top.r + 0.3, 3.6, top.r + 0.3);
  for (let i = 0; i < 40; i++) {
    const a = (i + 0.5) / 40 * Math.PI * 2;
    const x = top.cx + Math.cos(a) * (top.r + 0.25), z = top.cz + Math.sin(a) * (top.r + 0.25);
    if (z > top.maxZ - 1 && Math.abs(x) < 6) continue;
    const piece = add(box, mat(COLORS.wall), x, 4.0, z, 1.6, 0.8, 0.35);
    piece.rotation.y = -a + Math.PI / 2;
  }
  const gateZ = LEVEL.soulGateZ;
  for (const x of [-4.2, 4.2]) slab(mat(COLORS.gate), x, gateZ, 1.1, 1.3, 11, 3.6);
  slab(mat(COLORS.gate), 0, gateZ, 11, 1.6, 11.8, 10.9);
  const torus = track(new THREE.TorusGeometry(3, 0.12, 8, 48), geometries);
  add(torus, glow(COLORS.portal, 2), 0, 7.2, gateZ + 0.5, 1, 1, 1).name = 'soul-gate-portal';

  mergeStatics(THREE, statics, root, geometries);

  // ---- Barriers (dynamic) ----
  const barrierMaterial = track(new THREE.MeshStandardMaterial({ color: COLORS.barrier, emissive: COLORS.barrier, emissiveIntensity: 1.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), materials);
  const barriers = LEVEL.gates.map(gate => {
    const y = heightAt(0, gate.z + 0.5);
    const mesh = add(box, barrierMaterial, 0, y + 1.8, gate.z, gate.halfWidth * 2 + 1, 3.6, 0.25, root);
    mesh.userData.open = 0;
    return mesh;
  });

  // ---- Demon lanterns (dynamic) ----
  const lanterns = LEVEL.lanterns.map(at => {
    const group = new THREE.Group();
    group.position.set(at.x, 0, at.z);
    root.add(group);
    add(box, mat(COLORS.lanternPost), 0, 1.1, 0, 0.18, 2.2, 0.18, group);
    const body = add(box, track(new THREE.MeshStandardMaterial({ color: COLORS.lantern, emissive: COLORS.lantern, emissiveIntensity: 2 }), materials), 0, 2.4, 0, 0.8, 1.1, 0.8, group);
    return { group, body };
  });

  // ---- Soul lamp flame (dynamic) ----
  const flameMaterial = track(new THREE.MeshStandardMaterial({ color: COLORS.lamp, emissive: COLORS.lamp, emissiveIntensity: 2.2 }), materials);
  const flame = add(new THREE.SphereGeometry(0.5, 20, 14), flameMaterial, lampAt.x, lampY + 1.3, lampAt.z, 1, 1.3, 1, root);
  geometries.push(flame.geometry);
  const lampLight = new THREE.PointLight(COLORS.lamp, 6, 12, 2);
  lampLight.position.set(lampAt.x, lampY + 2, lampAt.z);
  root.add(lampLight); lights.push(lampLight);

  // ---- Scene lights: one per segment keeps the graybox legible without shadows ----
  for (const [color, x, y, z, intensity] of [[0xffa050, 0, 4, -12, 7], [0xb070ff, 0, 5, -41, 9], [0xff6080, 0, 8, -97, 9]]) {
    const light = new THREE.PointLight(color, intensity, 26, 1.6);
    light.position.set(x, y, z);
    root.add(light); lights.push(light);
  }

  // ---- Heal drops and ground telegraphs (pooled by id) ----
  // Pickups: 肉包 (bun / bigBun) as pale buns with a green heal glow, 酒 (wine) as a violet bottle.
  const bunGeometry = track(new THREE.SphereGeometry(0.28, 16, 10), geometries);
  bunGeometry.scale(1, 0.7, 1);
  const bottleGeometry = track(new THREE.CylinderGeometry(0.12, 0.2, 0.55, 12), geometries);
  const pickupMaterials = {
    bun: track(new THREE.MeshStandardMaterial({ color: COLORS.bun, emissive: COLORS.heal, emissiveIntensity: 0.5 }), materials),
    wine: track(new THREE.MeshStandardMaterial({ color: COLORS.wine, emissive: COLORS.wine, emissiveIntensity: 1.2 }), materials),
  };
  const pickups = new Map();
  // Breakables (LAYOUT.breakables): crate = box, jar = squat cylinder, barrel = tall cylinder.
  const breakableMaterials = { crate: mat(COLORS.crate), jar: mat(COLORS.jar), barrel: mat(COLORS.barrel) };
  const breakables = LAYOUT.breakables.map(spot => {
    const y = heightAt(spot.x, spot.z);
    const mesh = spot.type === 'crate' ? add(box, breakableMaterials.crate, spot.x, y + 0.4, spot.z, 0.8, 0.8, 0.8, root)
      : spot.type === 'jar' ? add(cylinder, breakableMaterials.jar, spot.x, y + 0.35, spot.z, 0.38, 0.7, 0.38, root)
        : add(cylinder, breakableMaterials.barrel, spot.x, y + 0.5, spot.z, 0.42, 1.0, 0.42, root);
    mesh.userData.baseY = mesh.position.y;
    return mesh;
  });
  const decals = new Map();
  const dangerFill = { color: COLORS.danger, transparent: true, depthWrite: false, side: THREE.DoubleSide };

  function decalFor(hazard) {
    let decal = decals.get(hazard.id);
    if (decal) return decal;
    const group = new THREE.Group();
    const edgeMaterial = new THREE.MeshBasicMaterial({ ...dangerFill, opacity: 0.9 });
    const fillMaterial = new THREE.MeshBasicMaterial({ ...dangerFill, opacity: 0.35 });
    let edge, fill;
    if (hazard.shape === 'circle') {
      edge = new THREE.Mesh(ring, edgeMaterial);
      fill = new THREE.Mesh(disc, fillMaterial);
      edge.rotation.x = fill.rotation.x = -Math.PI / 2;
    } else {
      // Unit plane anchored at its near edge, stretched along the lunge direction.
      const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      geometries.push(plane);
      edge = new THREE.Mesh(plane, edgeMaterial);
      fill = new THREE.Mesh(plane, fillMaterial);
      edge.rotation.x = fill.rotation.x = -Math.PI / 2;
    }
    group.add(edge, fill);
    root.add(group);
    decal = { group, edge, fill, edgeMaterial, fillMaterial, shape: hazard.shape };
    decals.set(hazard.id, decal);
    return decal;
  }

  let gateState = LEVEL.gates.map(() => false);
  /** Keeps the camera on the hero's side of every closed barrier and above the floor. */
  function constrainCamera(position, heroPosition) {
    LEVEL.gates.forEach((gate, i) => {
      if (gateState[i]) return;
      if (heroPosition.z < gate.z && position.z > gate.z - 0.35) position.z = gate.z - 0.35;
      else if (heroPosition.z > gate.z && position.z < gate.z + 0.35) position.z = gate.z + 0.35;
    });
    position.y = Math.max(position.y, heightAt(position.x, position.z) + 0.6);
    return position;
  }

  function update(view, dt = 0, time = 0) {
    gateState = view.gates.map(gate => gate.open);
    for (let i = 0; i < barriers.length; i++) {
      const mesh = barriers[i];
      const target = view.gates[i]?.open ? 1 : 0;
      mesh.userData.open += (target - mesh.userData.open) * Math.min(1, dt * 4);
      mesh.visible = mesh.userData.open < 0.98;
      mesh.scale.y = 3.6 * (1 - mesh.userData.open);
      mesh.position.y = heightAt(0, LEVEL.gates[i].z + 0.5) + mesh.scale.y / 2;
    }
    barrierMaterial.emissiveIntensity = 1 + Math.sin(time * 3) * 0.25;
    view.lanterns.forEach((state, i) => {
      const { group, body } = lanterns[i];
      if (state.broken) {
        body.rotation.z = 1.2;
        body.position.set(0.5, 0.35, 0);
        body.material.emissiveIntensity = 0.05;
      } else {
        const ratio = state.hp / state.maxHp;
        body.rotation.z = 0;
        body.position.set(0, 2.4 + Math.sin(time * 2 + i) * 0.06, 0);
        body.material.emissiveIntensity = 0.8 + ratio * 1.6 + (ratio < 1 ? Math.sin(time * 14) * 0.3 : 0);
      }
      group.visible = view.segment <= 2;
    });
    const lamp = view.lamp;
    if (lamp.down) {
      flameMaterial.color.setHex(0x333344); flameMaterial.emissive.setHex(0x221133);
      flame.scale.set(0.5, 0.4, 0.5);
      lampLight.intensity = 0.5 + Math.random() * 0.5;
    } else {
      const ratio = lamp.hp / lamp.maxHp;
      const color = lamp.secured ? new THREE.Color(0xffd36a) : new THREE.Color(0xff4040).lerp(new THREE.Color(COLORS.lamp), ratio);
      flameMaterial.color.copy(color); flameMaterial.emissive.copy(color);
      const pulse = 1 + Math.sin(time * 5) * 0.06;
      flame.scale.set(pulse, 1.3 * pulse, pulse);
      lampLight.color.copy(color);
      lampLight.intensity = 6;
    }
    view.breakables?.forEach((state, i) => {
      const mesh = breakables[i];
      mesh.visible = !state.broken;
      // Shake a little when damaged.
      mesh.rotation.z = state.hp < state.maxHp ? Math.sin(time * 30) * 0.05 : 0;
    });
    // Pickups (blink during their last 3 s).
    const alive = new Set();
    for (const pickup of view.pickups) {
      alive.add(pickup.id);
      let mesh = pickups.get(pickup.id);
      if (!mesh) {
        mesh = new THREE.Mesh(pickup.kind === 'wine' ? bottleGeometry : bunGeometry, pickup.kind === 'wine' ? pickupMaterials.wine : pickupMaterials.bun);
        if (pickup.kind === 'bigBun') mesh.scale.setScalar(1.5);
        root.add(mesh); pickups.set(pickup.id, mesh);
      }
      const p = toWorld(pickup.x, pickup.y);
      mesh.position.set(p.x, heightAt(p.x, p.z) + 0.5 + Math.sin(time * 3) * 0.1, p.z);
      mesh.rotation.y = time * 2;
      const left = pickup.until !== undefined && view.time !== undefined ? pickup.until - view.time : Infinity;
      mesh.visible = left > 3 || Math.sin(time * 18) > 0;
    }
    for (const [id, mesh] of pickups) if (!alive.has(id)) { root.remove(mesh); pickups.delete(id); }
    // Telegraphs: edge shows the full area, the fill grows until the hit lands.
    const live = new Set();
    for (const hazard of view.hazards) {
      live.add(hazard.id);
      const decal = decalFor(hazard);
      const p = toWorld(hazard.x, hazard.y);
      decal.group.position.set(p.x, heightAt(p.x, p.z) + 0.04, p.z);
      const k = hazard.progress;
      if (hazard.shape === 'circle') {
        const r = hazard.radius / 60;
        decal.edge.scale.setScalar(r);
        decal.fill.scale.setScalar(Math.max(0.01, r * k));
      } else {
        const length = hazard.length / 60, width = hazard.width / 60;
        // The plane's length axis points to local -z after lying flat; turn it onto the lunge direction.
        decal.group.rotation.y = Math.atan2(-Math.cos(hazard.facing), -Math.sin(hazard.facing));
        decal.edge.scale.set(width, length, 1);
        decal.fill.scale.set(width, Math.max(0.01, length * k), 1);
        decal.edge.material.opacity = 0.5;
      }
      decal.fillMaterial.opacity = 0.25 + 0.45 * k;
    }
    for (const [id, decal] of decals) if (!live.has(id)) {
      root.remove(decal.group);
      decal.edgeMaterial.dispose(); decal.fillMaterial.dispose();
      decals.delete(id);
    }
  }

  return {
    group: root,
    heightAt,
    update,
    constrainCamera,
    dispose() {
      scene.remove(root);
      for (const decal of decals.values()) { decal.edgeMaterial.dispose(); decal.fillMaterial.dispose(); }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      lights.length = 0;
    },
  };
}

/** Bakes every static mesh into one non-indexed geometry per material (≈ one draw per colour). */
function mergeStatics(THREE, statics, root, geometries) {
  statics.updateMatrixWorld(true);
  const byMaterial = new Map();
  statics.traverse(object => {
    if (!object.isMesh) return;
    if (!byMaterial.has(object.material)) byMaterial.set(object.material, []);
    const baked = object.geometry.toNonIndexed();
    baked.applyMatrix4(object.matrixWorld);
    byMaterial.get(object.material).push(baked);
  });
  for (const [material, parts] of byMaterial) {
    let count = 0;
    for (const part of parts) count += part.attributes.position.count;
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
    let offset = 0;
    for (const part of parts) {
      position.set(part.attributes.position.array, offset * 3);
      normal.set(part.attributes.normal.array, offset * 3);
      offset += part.attributes.position.count;
      part.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.computeBoundingSphere();
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'march-static';
    root.add(mesh);
  }
}

function track(item, list) {
  list.push(item);
  return item;
}
