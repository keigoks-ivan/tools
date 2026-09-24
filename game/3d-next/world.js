/**
 * Lightweight, fully geometric Seoul night-market arena.
 * Coordinates follow the 2D Arena projection: x=(arenaX-640)/60,
 * z=(arenaY-500)/60. The gate sits ahead of the starting point (-z).
 */
export function createNightMarket(THREE, scene) {
  const root = new THREE.Group();
  root.name = 'night-market-world';
  scene.add(root);

  const geometry = {};
  const material = {};
  const ownedLights = [];
  const textures = [];
  const geo = (key, create) => geometry[key] || (geometry[key] = create());
  const mat = (key, color, extra = {}) => material[key] || (material[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.12, ...extra }));
  const box = geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geo('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const cone = geo('cone', () => new THREE.ConeGeometry(1, 1, 8));
  const torus = geo('torus', () => new THREE.TorusGeometry(1, 0.045, 5, 48));
  const plane = geo('plane', () => new THREE.PlaneGeometry(1, 1));

  const stone = mat('stone', 0x9c98a9, { roughness: 0.42, metalness: 0.22 });
  const grout = mat('grout', 0x53576b, { roughness: 0.92 });
  const wall = mat('wall', 0x22283a, { roughness: 0.86 });
  const wallLight = mat('wall-light', 0x36354b, { roughness: 0.78 });
  const roof = mat('roof', 0x111a2b, { roughness: 0.72, metalness: 0.22 });
  const trim = mat('trim', 0x89634e, { roughness: 0.55, metalness: 0.28 });
  const amber = mat('amber', 0xffb45f, { emissive: 0xff7c24, emissiveIntensity: 1.35, roughness: 0.44 });
  const amberGlass = mat('amber-glass', 0xffd08a, { emissive: 0xff9b3d, emissiveIntensity: 1.85, roughness: 0.35 });
  const purple = mat('purple', 0x9c59ff, { emissive: 0x762cff, emissiveIntensity: 1.8, roughness: 0.4 });
  const teal = mat('teal', 0x41d9d3, { emissive: 0x17a8b0, emissiveIntensity: 1.15, roughness: 0.48 });
  const blossom = mat('blossom', 0xd86aa9, { emissive: 0x571738, emissiveIntensity: 0.38, roughness: 0.8 });
  const darkBark = mat('bark', 0x302335, { roughness: 0.92 });
  // The illustrated storefront atlas keeps the established night-market art
  // direction on real 3D facades without adding more geometry or lights.
  const facades = Array.from({ length: 8 }, (_, index) => {
    const facade = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    material[`facade-${index}`] = facade;
    return facade;
  });
  new THREE.TextureLoader().load('../assets/art/storefront-atlas.webp', atlas => {
    atlas.colorSpace = THREE.SRGBColorSpace;
    textures.push(atlas);
    for (let index = 0; index < facades.length; index++) {
      const tile = atlas.clone();
      tile.repeat.set(0.5, 0.25);
      tile.offset.set((index % 2) * 0.5, (3 - Math.floor(index / 2)) * 0.25);
      tile.needsUpdate = true;
      facades[index].map = tile;
      facades[index].needsUpdate = true;
      textures.push(tile);
    }
  });
  new THREE.TextureLoader().load('../assets/gen/pavement.jpg', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3.6);
    texture.anisotropy = 4;
    stone.map = texture;
    stone.needsUpdate = true;
    textures.push(texture);
  });

  function mesh(name, geom, materialRef, x, y, z, sx, sy, sz, rz = 0) {
    const item = new THREE.Mesh(geom, materialRef);
    item.name = name;
    item.position.set(x, y, z);
    item.scale.set(sx, sy, sz);
    if (rz) item.rotation.z = rz;
    item.castShadow = false;
    item.receiveShadow = false;
    root.add(item);
    return item;
  }

  function lamp(x, z, y = 3.1) {
    mesh('lantern-frame', box, trim, x, y, z, 0.13, 0.58, 0.13);
    mesh('lantern-glow', box, amberGlass, x, y, z, 0.25, 0.38, 0.2);
    mesh('lantern-cap', cone, roof, x, y + 0.27, z, 0.19, 0.16, 0.19);
  }

  function shop(side, index, z) {
    const x = side * (11.4 + (index % 2) * 0.65);
    const width = index % 2 ? 4.7 : 5.6;
    mesh('market-shop', box, wall, x, 2.0, z, width, 4.0, 4.8);
    mesh('shop-stone-plinth', box, grout, x, 0.24, z, width + 0.22, 0.48, 5.0);
    // Layered, shallow eaves keep the roof silhouette readable without a heavy model.
    mesh('shop-eave', box, trim, x, 4.12, z - 0.04, width + 0.75, 0.18, 5.35);
    mesh('shop-roof', box, roof, x, 4.46, z, width + 0.52, 0.52, 5.0, side * -0.045);
    mesh('roof-ridge', box, wallLight, x, 4.76, z, width + 0.18, 0.12, 0.28);

    const faceX = x - side * (width / 2 + 0.055);
    const facade = mesh('illustrated-shopfront', plane, facades[(index + (side > 0 ? 0 : 4)) % 8], faceX, 2.04, z, 4.65, 3.95, 1);
    facade.rotation.y = -side * Math.PI / 2;
    lamp(x - side * (width / 2 + 0.5), z + 1.35, 3.25);
  }

  // Broad wet stone floor and a fine, low-contrast paving grid.
  mesh('wet-market-street', plane, stone, 0, -0.055, -5.0, 27.0, 31.0, 1).rotation.x = -Math.PI / 2;
  for (let x = -13; x <= 13; x += 1.55) mesh('paving-joint', box, grout, x, -0.048, -5.0, 0.01, 0.004, 30.0);
  for (let z = -19; z <= 9; z += 1.35) mesh('paving-joint', box, grout, 0, -0.047, z, 26.0, 0.004, 0.01);
  // Restrained ceremonial inlay echoes the artwork's floor medallion.
  for (const radius of [1.0, 1.55, 2.12]) {
    const ring = mesh('street-medallion', torus, purple, 0, 0.012, -7.1, radius, radius, radius);
    ring.rotation.x = -Math.PI / 2;
    ring.material = radius === 1.55 ? teal : purple;
  }

  // Shop rows stay outside the playable lane (Arena x bounds are about ±9.2).
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) shop(side, i, 3.4 - i * 5.1);
    // Recessed side alleys and low curb stones make the open combat area legible.
    mesh('market-curb', box, wallLight, side * 9.65, 0.12, -5.0, 0.34, 0.24, 28.0);
    for (let i = 0; i < 5; i++) {
      const z = 2 - i * 4.7;
      mesh('street-pedestal', box, wallLight, side * 8.9, 0.42, z, 0.62, 0.84, 0.62);
      lamp(side * 8.9, z, 1.22);
    }
  }

  // Distant gate set beyond the Arena fighting bounds, centered on the approach.
  const gateZ = -18.0;
  for (const x of [-4.7, 4.7]) {
    mesh('spirit-gate-pillar', box, wallLight, x, 3.0, gateZ, 0.9, 6.0, 1.1);
    mesh('gate-pillar-foot', box, trim, x, 0.48, gateZ, 1.35, 0.8, 1.5);
    mesh('gate-pillar-cap', box, roof, x, 6.12, gateZ, 1.45, 0.45, 1.65);
    mesh('gate-emblem', torus, purple, x, 3.8, gateZ + 0.58, 0.32, 0.32, 0.32).rotation.x = 0;
  }
  mesh('spirit-gate-lintel', box, roof, 0, 6.2, gateZ, 10.3, 0.72, 1.55);
  mesh('gate-lintel-trim', box, purple, 0, 5.78, gateZ + 0.79, 7.6, 0.055, 0.05);
  const portal = mesh('violet-spirit-portal', torus, purple, 0, 3.05, gateZ + 0.85, 2.35, 2.35, 2.35);
  portal.rotation.y = 0;
  // TorusGeometry lies in XY already, facing the player's approach along +z.
  mesh('portal-core', plane, mat('portal-core', 0x271442, { emissive: 0x351064, emissiveIntensity: 0.72, transparent: true, opacity: 0.86 }), 0, 3.05, gateZ + 0.92, 4.35, 4.35, 1);
  const skyMaterial = new THREE.MeshBasicMaterial({ map: null, color: 0xffffff, fog: false, depthWrite: false });
  material.sky = skyMaterial;
  mesh('seoul-night-sky', plane, skyMaterial, 0, 13.0, -34, 66, 29, 1);
  new THREE.TextureLoader().load('../assets/gen/sky.jpg', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    skyMaterial.map = texture;
    skyMaterial.needsUpdate = true;
    textures.push(texture);
  });

  // Cherry trees frame the distant architecture; simple clustered blossoms are cheap and legible.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (8.4 + (i % 2) * 1.2);
      const z = -14.7 - i * 2.5;
      mesh('cherry-trunk', cylinder, darkBark, x, 3.0, z, 0.24, 6.0, 0.24);
      for (const [dx, dy, dz, scale] of [[0, 5.8, 0, 1.35], [-0.9, 5.2, 0.2, 0.9], [0.8, 5.15, -0.15, 0.95]]) {
        const crown = mesh('cherry-blossom', geo('blossom-cluster', () => new THREE.IcosahedronGeometry(1, 0)), blossom, x + dx, dy, z + dz, scale, scale * 0.62, scale);
        crown.rotation.y = (i + side) * 0.4;
      }
    }
  }

  // Emissive geometry does most of the visual work; these two low-cost lights add soft color.
  const violetLight = new THREE.PointLight(0x8c4cff, 11, 18, 2);
  violetLight.position.set(0, 3.5, -15.5);
  root.add(violetLight); ownedLights.push(violetLight);
  const warmLight = new THREE.PointLight(0xff9a48, 4, 15, 2);
  warmLight.position.set(-7.5, 3.0, -3.0);
  root.add(warmLight); ownedLights.push(warmLight);

  // Batch identical pieces into instanced draws so the detailed set stays mobile-friendly.
  const batches = new Map();
  const ordinaryMeshes = [];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!object.isMesh) return;
    object.updateMatrix();
    const key = `${Object.keys(geometry).find(name => geometry[name] === object.geometry)}:${Object.keys(material).find(name => material[name] === object.material)}`;
    if (!batches.has(key)) batches.set(key, { geometry: object.geometry, material: object.material, matrices: [] });
    batches.get(key).matrices.push(object.matrix.clone());
    ordinaryMeshes.push(object);
  });
  for (const object of ordinaryMeshes) object.removeFromParent();
  for (const batch of batches.values()) {
    const instanced = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    for (let i = 0; i < batch.matrices.length; i++) instanced.setMatrixAt(i, batch.matrices[i]);
    instanced.instanceMatrix.needsUpdate = true;
    instanced.castShadow = false;
    instanced.receiveShadow = false;
    root.add(instanced);
  }

  return {
    group: root,
    bounds: { minX: -9.2, maxX: 9.2, minZ: -4.83, maxZ: 2.08 },
    dispose() {
      scene.remove(root);
      root.traverse(object => {
        if (object.isMesh) {
          object.geometry = null;
          object.material = null;
        }
      });
      for (const value of Object.values(geometry)) value.dispose();
      for (const value of Object.values(material)) value.dispose();
      for (const texture of textures) texture.dispose();
      ownedLights.length = 0;
    },
  };
}
