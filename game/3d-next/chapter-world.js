import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// New sets use the director's exact height field; scenery stays outside combat
// bounds. Static pieces merge by material, with one bounded weather draw.
export function createChapterWorld(T, scene, world) {
  const sets = new Map();
  const originals = [];
  world.group.traverse(mesh => {
    if (/^march-(stone|props|cutout|glow)-\d$|^march-sky$/.test(mesh.name)) originals.push(mesh);
  });
  let active = null;
  function build(kind) {
    const frost = kind === 'frost', group = new T.Group(), batches = new Map(), owned = new Set();
    group.name = `chapter-${kind}`; scene.add(group);
    const stoneMap = world.group.getObjectByName('march-stone-0')?.material.uniforms?.map?.value;
    const material = (color, extra = {}) => { const m = new T.MeshStandardMaterial({ color, roughness: 0.82, ...extra }); owned.add(m); return m; };
    const stone = material(frost ? 0x758c9b : 0x706575, { map: stoneMap });
    const dark = material(frost ? 0x243a46 : 0x302636);
    const metal = material(frost ? 0x95b7c7 : 0xc7a060, { metalness: 0.65, roughness: 0.38 });
    const roof = material(frost ? 0x314a59 : 0x233041, { roughness: 0.58 });
    const snow = material(0xd3e1e8, { roughness: 0.94 });
    const red = material(frost ? 0x673d45 : 0x802b36);
    const light = material(frost ? 0x9ceaff : 0xffc273, { emissive: frost ? 0x54bddc : 0xff762c, emissiveIntensity: 1.2 });
    function put(geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
      geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)));
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(geometry.index ? geometry.toNonIndexed() : geometry); geometry.dispose();
    }
    const box = (mat, x, y, z, sx, sy, sz, ry = 0) => put(new T.BoxGeometry(1, 1, 1), mat, x, y, z, sx, sy, sz, 0, ry);
    const pole = (mat, x, y, z, radius, height) => put(new T.CylinderGeometry(radius, radius * 1.1, height, 12), mat, x, y, z);
    // Grid vertices agree with the collision surface, including the terraces.
    const p = [], uv = [], ix = [], nx = 64, nz = 136;
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) { const wx = x - 32, wz = 20 - z; p.push(wx, world.heightAt(wx, wz) + 0.01, wz); uv.push(x / 6, z / 6); if (x < nx && z < nz) { const n = z * (nx + 1) + x; ix.push(n, n + 1, n + nx + 1, n + 1, n + nx + 2, n + nx + 1); } }
    const floor = new T.BufferGeometry(); floor.setAttribute('position', new T.Float32BufferAttribute(p, 3)); floor.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); floor.setIndex(ix); floor.computeVertexNormals();
    // Atlas UVs use the top-left flagstone tile; fract keeps detail at metre scale.
    stone.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\ndiffuseColor *= texture2D(map, vec2(0.004,0.504)+fract(vMapUv)*0.492);\n#endif'); };
    stone.customProgramCacheKey = () => 'chapter-flagstone-v1';
    put(floor, stone, 0, 0, 0);
    function lantern(x, z) {
      const y = world.heightAt(x, z);
      box(dark, x, y + 0.3, z, 0.9, 0.6, 0.9); pole(metal, x, y + 1.25, z, 0.11, 1.5);
      box(light, x, y + 2.25, z, 0.38, 0.65, 0.38);
      for (const dx of [-0.23, 0.23]) for (const dz of [-0.23, 0.23]) pole(dark, x + dx, y + 2.25, z + dz, 0.035, 0.8);
      put(new T.ConeGeometry(0.58, 0.3, 4), roof, x, y + 2.75, z, 1, 1, 1, 0, Math.PI / 4);
    }
    function eaves(x, y, z, width, depth) {
      const cross = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24 * 2 - 1; cross.push(new T.Vector3(x + t * width / 2, y + 0.6 * Math.pow(Math.abs(t), 5), z)); }
      put(new T.TubeGeometry(new T.CatmullRomCurve3(cross), 32, 0.075, 6, false), metal, 0, 0, 0);
      for (let i = 0; i < Math.ceil(width * 2); i++) {
        const t = i / Math.max(1, Math.ceil(width * 2) - 1) * 2 - 1;
        box(roof, x + t * width / 2, y + 0.16 + 0.6 * Math.pow(Math.abs(t), 5), z - depth / 2, 0.08, 0.16, depth);
      }
    }
    function arch(z, width, height) {
      const y = world.heightAt(0, z);
      for (const side of [-1, 1]) {
        pole(red, side * width, y + height / 2, z, 0.32, height);
        pole(metal, side * width, y + 0.7, z, 0.37, 0.2);
        pole(metal, side * width, y + height - 0.9, z, 0.36, 0.17);
      }
      box(red, 0, y + height - 0.7, z, width * 2 + 1, 0.34, 0.6);
      box(roof, 0, y + height, z, width * 2 + 2, 0.4, 1.6);
      for (const side of [-1, 1]) box(roof, side * (width + 0.8), y + height + 0.15, z, 1.4, 0.25, 1.6, side * 0.05);
      box(metal, 0, y + height - 0.42, z + 0.34, width * 1.5, 0.06, 0.05);
      eaves(0, y + height + 0.2, z + 0.85, width * 2 + 2, 1.7);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) box(red, side * (width - 0.5 - i * 0.34), y + height - 0.95 - i * 0.16, z, 0.55, 0.19, 0.7);
    }
    for (let z = 8; z >= -102; z -= 8) for (const side of [-1, 1]) {
      const width = z > -31 ? 10.6 : z > -53 ? 16.2 : z > -85 ? 15.4 : 11.2;
      const x = side * width, y = world.heightAt(x, z);
      lantern(side * (width - 0.5), z);
      box(dark, x, y + 0.8, z - 3.8, 0.45, 1.6, 7.6);
      box(metal, x, y + 1.5, z - 3.8, 0.55, 0.09, 7.6);
      if (frost) {
        box(snow, x, y + 1.64, z - 3.8, 0.65, 0.18, 7.6);
        put(new T.IcosahedronGeometry(1, 1), snow, side * (width + 2.5), y + 0.4, z, 2.2, 0.75, 3);
        for (let i = 0; i < 3; i++) put(new T.ConeGeometry(0.5 + i * 0.16, 3 + i, 5), metal, side * (width + 2 + i * 1.3), y + 1.5 + i * 0.5, z - i, 1, 1, 1, side * 0.18, i);
      } else {
        pole(red, side * (width + 1.1), y + 4.8, z, 0.38, 9.6);
        box(metal, side * (width + 1.1), y + 3.5, z, 0.82, 0.12, 0.82);
        box(roof, side * (width + 4.2), y + 9.6, z - 3, 8.8, 0.5, 9);
        box(metal, side * (width + 0.25), y + 9.3, z - 3, 0.12, 0.16, 9);
        eaves(side * (width + 4.2), y + 9.7, z + 1.5, 8.8, 9);
        box(red, side * (width + 1.1), y + 7.4, z + 0.5, 1.3, 3.1, 0.035);
        box(metal, side * (width + 1.1), y + 7.4, z + 0.53, 0.075, 2.8, 0.04);
      }
    }
    for (const [z, w, h] of [[-24, 8.4, 6.5], [-48, 14.5, 7.5], [-82, 13, 8], [-105, 6, 12]]) arch(z, w, h);
    for (const z of [-12, -41, -70, -96]) {
      const y = world.heightAt(0, z);
      for (const radius of [2.2, 2.6, 3.4]) put(new T.TorusGeometry(radius, 0.025, 4, 64), metal, 0, y + 0.035, z, 1, 1, 1, Math.PI / 2);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; box(light, Math.cos(a) * 3, y + 0.04, z + Math.sin(a) * 3, 0.08, 0.025, 0.35, -a); }
    }
    if (frost) for (let i = 0; i < 16; i++) for (const side of [-1, 1]) {
      const z = 15 - i * 9, x = side * (26 + i % 3 * 4);
      const height = 25 + i % 4 * 6, mountain = new T.ConeGeometry(12, height, 12, 6), positions = mountain.attributes.position;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const px = positions.getX(vertex), py = positions.getY(vertex), pz = positions.getZ(vertex), t = py / height + 0.5;
        const angle = Math.atan2(pz, px), noise = 1 + 0.2 * Math.sin(angle * 3 + i) + 0.1 * Math.sin(angle * 7 + t * 9 + i);
        positions.setXYZ(vertex, px * noise + t * 2.2 * Math.sin(i), py, pz * noise + t * 1.7 * Math.cos(i));
      }
      mountain.computeVertexNormals();
      const cap = mountain.clone(), ids = [];
      for (let vertex = 0; vertex < cap.index.count; vertex += 3) {
        const a = cap.index.getX(vertex), b = cap.index.getX(vertex + 1), c = cap.index.getX(vertex + 2);
        if ((positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3 > height * 0.12 + Math.sin(i) * 1.5) ids.push(a, b, c);
      }
      cap.setIndex(ids); cap.scale(1.004, 1.004, 1.004);
      put(mountain, dark, x, 8, z, 1, 1, 1, 0, i * 0.8); put(cap, snow, x, 8, z, 1, 1, 1, 0, i * 0.8);
    }
    else for (const side of [-1, 1]) for (let tier = 0; tier < 5; tier++) {
      const x = side * 21, y = 5 + tier * 3, w = 11 - tier * 1.4;
      box(red, x, y, -105, w - 1, 2.7, w - 1); box(roof, x, y + 1.5, -105, w + 1, 0.5, w + 1); box(metal, x, y + 1.15, -99.5 - tier * 0.7, w, 0.07, 0.06);
    }
    for (const [mat, pieces] of batches) { const geometry = mergeGeometries(pieces); const mesh = new T.Mesh(geometry, mat); mesh.name = `${kind}-set`; group.add(mesh); pieces.forEach(g => g.dispose()); }
    const weather = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) { weather[i * 3] = Math.sin(i * 17.3) * 25; weather[i * 3 + 1] = (i * 7.37) % 15; weather[i * 3 + 2] = 15 - (i * 11.17) % 130; }
    const particleGeometry = new T.BufferGeometry(); particleGeometry.setAttribute('position', new T.BufferAttribute(weather, 3));
    const particleMaterial = new T.PointsMaterial({ color: frost ? 0xe0f4ff : 0xffb865, size: frost ? 0.055 : 0.045, transparent: true, opacity: 0.65, depthWrite: false, sizeAttenuation: true }); owned.add(particleMaterial);
    const particles = new T.Points(particleGeometry, particleMaterial); group.add(particles);
    return { group, particles, weather, owned, frost };
  }
  return {
    apply(chapter) {
      const kind = chapter.environment;
      if (kind && !sets.has(kind)) sets.set(kind, build(kind));
      active = sets.get(kind) || null;
      for (const [id, set] of sets) set.group.visible = id === kind;
      for (const mesh of originals) mesh.visible = !kind;
    },
    update(dt) {
      if (!active) return;
      const { weather, frost, particles } = active;
      for (let i = 0; i < weather.length; i += 3) { weather[i + 1] += dt * (frost ? -0.8 : 0.9); if (weather[i + 1] < 0) weather[i + 1] = 15; if (weather[i + 1] > 15) weather[i + 1] = 0; }
      particles.geometry.attributes.position.needsUpdate = true;
    },
    dispose() { for (const set of sets.values()) { scene.remove(set.group); set.group.traverse(o => o.geometry?.dispose()); for (const m of set.owned) m.dispose(); } },
  };
}
