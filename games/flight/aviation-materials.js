// Small deterministic PBR maps. Each aircraft owns its maps; the existing model disposers release them.
export function createAviationSurfaceKit(THREE) {
  const cache = new Map();
  const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
  function dataTexture(pixels, width, height) {
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }
  function surface(kind, repeat) {
    const key = `${kind}:${repeat.join(',')}`;
    if (cache.has(key)) return cache.get(key);
    const size = 256, bump = new Uint8Array(size * size * 4), rough = new Uint8Array(bump.length);
    let seed = 172320;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    for (let y = 0; y < size; y++) {
      const brushed = (random() - 0.5) * 16;
      for (let x = 0; x < size; x++) {
        const noise = random() - 0.5, index = (y * size + x) * 4;
        let height = 128 + noise * 7, finish = 229 + noise * 14;
        if (kind === 'plastic') { height = 128 + noise * 24; finish = 240 + noise * 20; }
        else if (kind === 'fabric') {
          const a = Math.sin(x / 8 * Math.PI * 2), b = Math.sin(y / 8 * Math.PI * 2);
          height = 128 + a * b * 24 + noise * 9; finish = 243 + Math.abs(a * b) * 11;
        } else if (kind === 'brushed') { height = 128 + brushed + noise * 3; finish = 204 + brushed * 1.4 + noise * 8; }
        else if (kind === 'rubber') {
          const groove = [48, 91, 165, 208].some(center => Math.abs(x - center) < 3);
          height = groove ? 82 + noise * 6 : 133 + noise * 14;
          finish = groove ? 250 : 231 + noise * 17;
        } else if (kind === 'glass') { height = 128 + noise * 1.6; finish = 245 + noise * 5; }
        const h = clamp(height), r = clamp(finish);
        bump[index] = bump[index + 1] = bump[index + 2] = h; bump[index + 3] = 255;
        rough[index] = rough[index + 1] = rough[index + 2] = r; rough[index + 3] = 255;
      }
    }
    const maps = { bumpMap: dataTexture(bump, size, size), roughnessMap: dataTexture(rough, size, size) };
    maps.bumpMap.repeat.set(...repeat); maps.roughnessMap.repeat.set(...repeat);
    cache.set(key, maps); return maps;
  }
  function apply(material, kind, { repeat = [1, 1], bumpScale = 0.0004, roughness = true } = {}) {
    const maps = surface(kind, repeat);
    material.bumpMap = maps.bumpMap; material.bumpScale = bumpScale;
    if (roughness) material.roughnessMap = maps.roughnessMap;
    material.needsUpdate = true;
    return material;
  }
  // Lift the existing artist-authored skin joints and rivets into a height/roughness map.
  // A local high pass rejects livery colours and gradients, keeping the panel depth very shallow.
  function relief(material, { bumpScale = 0.009 } = {}) {
    if (typeof document === 'undefined' || !material.map?.image) return;
    const source = material.map.image, width = Math.min(1024, source.width), height = Math.max(1, Math.round(source.height * width / source.width));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const bump = new Uint8Array(width * height * 4), rough = new Uint8Array(bump.length);
    const luminance = (x, y) => {
      const i = (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
      return pixels[i] * 0.21 + pixels[i + 1] * 0.72 + pixels[i + 2] * 0.07;
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const average = (luminance(x - 2, y) + luminance(x + 2, y) + luminance(x, y - 2) + luminance(x, y + 2)) / 4;
      const seam = Math.max(0, average - luminance(x, y)), i = (y * width + x) * 4;
      const h = clamp(128 - Math.min(38, seam * 1.4)), r = clamp(224 + Math.min(28, seam));
      bump[i] = bump[i + 1] = bump[i + 2] = h; bump[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = r; rough[i + 3] = 255;
    }
    const heightMap = dataTexture(bump, width, height), roughnessMap = dataTexture(rough, width, height);
    for (const map of [heightMap, roughnessMap]) {
      map.flipY = material.map.flipY;
      map.wrapS = material.map.wrapS; map.wrapT = material.map.wrapT;
    }
    material.bumpMap = heightMap; material.bumpScale = bumpScale; material.roughnessMap = roughnessMap;
    material.needsUpdate = true;
  }
  const dispose = () => { for (const maps of cache.values()) for (const map of Object.values(maps)) map.dispose(); cache.clear(); };
  return { apply, relief, dispose };
}

export function roundedCabinPart(THREE, width, height, depth, radius, segments = 4) {
  const geometry = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const inner = new THREE.Vector3(), delta = new THREE.Vector3(), point = new THREE.Vector3();
  const clamp = (value, extent) => Math.max(-extent, Math.min(extent, value));
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    inner.set(clamp(point.x, width / 2 - radius), clamp(point.y, height / 2 - radius), clamp(point.z, depth / 2 - radius));
    delta.copy(point).sub(inner).normalize(); point.copy(inner).addScaledVector(delta, radius);
    positions.setXYZ(i, point.x, point.y, point.z); normals.setXYZ(i, delta.x, delta.y, delta.z);
  }
  return geometry;
}

// Leave standalone model previews usable; a real game's atmosphere supplies coherent reflections once attached.
export function sceneEnvironmentBinding(group, fallback, select = () => true) {
  let previous;
  const materials = new Set();
  group.traverse(object => {
    for (const material of [].concat(object.material || [])) if (select(material) && material.envMap === fallback) materials.add(material);
  });
  return () => {
    let scene = group.parent;
    while (scene && !scene.isScene) scene = scene.parent;
    const environment = scene?.environment || null;
    if (previous === environment) return;
    const hadEnvironment = !!previous; previous = environment;
    for (const material of materials) {
      material.envMap = environment ? null : fallback;
      if (hadEnvironment !== !!environment) material.needsUpdate = true;
    }
  };
}
