// Pre-baked geographic scenery: satellite/aerial imagery and elevation come from static files in ./data/lszh
// (see dev/bake_lszh.py). The game makes no third-party imagery or elevation requests at runtime.
//
// Terrain is one set of nested square rings (finer near the airport) draped with up to four imagery layers that a
// fragment shader feathers together, so layer edges and colour differences never show as hard seams.
const EARTH_RADIUS = 6378137;

export function createGeoScenery(THREE, scene, config) {
  const airport = config.airport;
  const rwy = airport.runway;
  const radians = Math.PI / 180;
  const originX = EARTH_RADIUS * rwy.center.lon * radians;
  const originY = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + rwy.center.lat * radians / 2));
  const groundScale = Math.cos(rwy.center.lat * radians);
  const bearing = rwy.bearing * radians, cosine = Math.cos(bearing), sine = Math.sin(bearing);
  const elevation = rwy.elevationM;
  const zone = airport.flatZone;
  const base = config.baseUrl || './data/lszh/';
  const group = new THREE.Group(); group.name = 'Geographic scenery'; scene.add(group);
  const geometries = new Set(), textures = new Set();
  let disposed = false, outsideCoverage = false, layersShown = 0, failed = 0, terrainSettled = false;
  let manifest = null, near = null, far = null, material = null;
  const loadedLayers = [false, false, false, false];
  const layerNames = ['far', 'wide', 'mid', 'detail'];

  const attribution = document.createElement('div');
  attribution.className = 'geo-attribution';
  attribution.style.cssText = 'position:absolute;right:12px;bottom:10px;z-index:6;max-width:min(560px,90vw);color:#e7eef1;background:rgba(12,25,32,.72);padding:5px 8px;border-radius:4px;font:10px/1.5 Arial,sans-serif;pointer-events:auto;';
  function credit(text, href) {
    const link = document.createElement('a'); link.textContent = text; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.style.cssText = 'color:inherit;text-decoration:none;'; return link;
  }
  attribution.append(credit(airport.attribution.imagery, 'https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices'));
  attribution.append(document.createElement('br'));
  attribution.append(credit(`${airport.attribution.terrain} · ${airport.attribution.note}`, 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'));
  (config.attributionTarget || document.body).appendChild(attribution);
  attribution.hidden = true;

  function status() {
    return {
      phase: disposed ? 'disposed' : terrainSettled ? (near ? (layersShown >= 4 ? 'ready' : 'imagery') : 'fallback') : 'loading',
      terrain: near !== null, terrainSettled, imagery: layersShown > 0, layers: layersShown, totalLayers: 4, failed, outsideCoverage,
      attribution: airport.attribution,
    };
  }
  function notify() { if (!disposed) config.onStatus?.(status()); }
  function localToMercator(x, z) {
    return { x: originX + (cosine * x - sine * z) / groundScale, y: originY + (-sine * x - cosine * z) / groundScale };
  }
  function geographicPosition(x, z) {
    const point = localToMercator(x, z);
    return { latitude: (2 * Math.atan(Math.exp(point.y / EARTH_RADIUS)) - Math.PI / 2) / radians, longitude: point.x / EARTH_RADIUS / radians };
  }

  // ---- elevation -------------------------------------------------------------------------------------------
  function sampleDem(dem, mx, my) {
    const px = (mx - dem.minX) / (dem.maxX - dem.minX) * dem.n - 0.5, py = (dem.maxY - my) / (dem.maxY - dem.minY) * dem.n - 0.5;
    const x = Math.max(0, Math.min(dem.n - 1.001, px)), y = Math.max(0, Math.min(dem.n - 1.001, py));
    const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top, h = dem.heights, n = dem.n;
    const a = h[top * n + left], b = h[top * n + left + 1], c = h[(top + 1) * n + left], d = h[(top + 1) * n + left + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function absoluteHeight(mx, my) { // metres above sea level: swissALTI3D inside the near grid, eased into the far grid at its edge
    const f = sampleDem(far, mx, my);
    const u = Math.min(mx - near.minX, near.maxX - mx) / (near.maxX - near.minX), v = Math.min(my - near.minY, near.maxY - my) / (near.maxY - near.minY);
    const w = smooth(Math.min(u, v) / 0.06);
    return w <= 0 ? f : w >= 1 ? sampleDem(near, mx, my) : f + (sampleDem(near, mx, my) - f) * w;
  }
  // Height of the ground relative to the airfield (metres). Flat (0) in the airfield zone, real terrain beyond a smooth blend.
  function groundHeight(x, z) {
    if (!near) return 0;
    const dx = Math.max(zone.minX - x, 0, x - zone.maxX), dz = Math.max(zone.minZ - z, 0, z - zone.maxZ);
    const distance = Math.hypot(dx, dz);
    if (distance === 0) return 0;
    const point = localToMercator(x, z);
    return (Math.max(0, absoluteHeight(point.x, point.y)) - elevation) * smooth(distance / zone.feather);
  }

  // ---- terrain mesh: nested square rings in Web Mercator, vertices in the local frame ------------------------
  // Squares centred on the airport and aligned with Web Mercator. [outer half size, cell size, inner half size] in ground metres. 2040/60=34, (8520-2040)/120=54, (23240-8520)/320=46, (80240-23240)/1000=57 cells.
  const RINGS = [[2040, 60, 0], [8520, 120, 2040], [23240, 320, 8520], [80240, 1000, 23240]];
  function ringGeometry(outer, cell, inner) {
    const hm = outer / groundScale, cm = cell / groundScale, im = inner / groundScale;
    const n = Math.round(outer * 2 / cell), stride = n + 1;
    const positions = new Float32Array(stride * stride * 3), indices = [];
    for (let row = 0; row <= n; row++) for (let col = 0; col <= n; col++) {
      const mx = originX + (-hm + col * cm), my = originY + (hm - row * cm);
      const east = (mx - originX) * groundScale, north = (my - originY) * groundScale;
      const x = cosine * east - sine * north, z = -sine * east - cosine * north;
      const i = (row * stride + col) * 3;
      positions[i] = x; positions[i + 1] = groundHeight(x, z) - 0.1; positions[i + 2] = z;
    }
    const included = (r, c) => { // is the cell (r, c) part of the ring (not outside the square, not inside the hole)?
      if (r < 0 || c < 0 || r >= n || c >= n) return false;
      if (!inner) return true;
      const cx0 = -hm + c * cm, cy1 = hm - r * cm;
      return !(cx0 >= -im - 1e-6 && cx0 + cm <= im + 1e-6 && cy1 <= im + 1e-6 && cy1 - cm >= -im - 1e-6);
    };
    const skirt = Math.max(8, cell * 0.8), extra = [];
    const vertexIndex = (r, c) => r * stride + c;
    function pushSkirt(a, b) {
      const base = positions.length / 3 + extra.length / 3;
      for (const v of [a, b]) extra.push(positions[v * 3], positions[v * 3 + 1] - skirt, positions[v * 3 + 2]);
      indices.push(a, base, b, b, base, base + 1);
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!included(r, c)) continue;
      const a = vertexIndex(r, c), b = a + 1, d = a + stride, e = d + 1;
      indices.push(a, d, b, b, d, e);
      if (!included(r - 1, c)) pushSkirt(b, a);
      if (!included(r + 1, c)) pushSkirt(d, e);
      if (!included(r, c - 1)) pushSkirt(a, d);
      if (!included(r, c + 1)) pushSkirt(e, b);
    }
    const all = new Float32Array(positions.length + extra.length); all.set(positions); all.set(extra, positions.length);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), outer * 1.5 + 2000); geometries.add(geo); return geo;
  }

  // ---- imagery material: far / wide / mid / detail composited in the fragment shader --------------------------
  const FEATHER = [0, 2600, 720, 230]; // ground metres of blend inside each layer's edge (far layer: fades to haze)
  function makeMaterial() {
    const placeholder = new THREE.DataTexture(new Uint8Array([128, 140, 110, 255]), 1, 1); placeholder.colorSpace = THREE.SRGBColorSpace; placeholder.needsUpdate = true; textures.add(placeholder);
    const uniforms = {
      uRot: { value: new THREE.Vector3(cosine, sine, groundScale) },
      uLoaded: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFeather: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    layerNames.forEach((name, i) => { uniforms[`uTex${i}`] = { value: placeholder }; uniforms[`uBox${i}`] = { value: new THREE.Vector4(0, 0, 1, 1) }; });
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vXZ; uniform vec3 uRot; uniform vec4 uLoaded; uniform vec4 uFeather;
        uniform sampler2D uTex0; uniform sampler2D uTex1; uniform sampler2D uTex2; uniform sampler2D uTex3;
        uniform vec4 uBox0; uniform vec4 uBox1; uniform vec4 uBox2; uniform vec4 uBox3;
        vec2 layerUV(vec4 box, vec2 m) { return (m - box.xy) * box.zw; }
        float edgeWeight(vec2 uv, float feather) { vec2 e = min(uv, 1.0 - uv); return smoothstep(0.0, max(feather, 1e-5), min(e.x, e.y)); }`)
        .replace('#include <map_fragment>', `
        vec2 mer = vec2(uRot.x * vXZ.x - uRot.y * vXZ.y, -uRot.y * vXZ.x - uRot.x * vXZ.y) / uRot.z;
        vec2 uv0 = layerUV(uBox0, mer), uv1 = layerUV(uBox1, mer), uv2 = layerUV(uBox2, mer), uv3 = layerUV(uBox3, mer);
        vec3 col = texture2D(uTex0, uv0).rgb;
        col = mix(col, texture2D(uTex1, uv1).rgb, uLoaded.y * edgeWeight(uv1, uFeather.y));
        col = mix(col, texture2D(uTex2, uv2).rgb, uLoaded.z * edgeWeight(uv2, uFeather.z));
        col = mix(col, texture2D(uTex3, uv3).rgb, uLoaded.w * edgeWeight(uv3, uFeather.w));
        col = mix(fogColor, col, mix(1.0, edgeWeight(uv0, 0.07), uLoaded.x));
        diffuseColor.rgb *= col;`);
    };
    m.userData.uniforms = uniforms; m.userData.placeholder = placeholder;
    return m;
  }

  // ---- loading -----------------------------------------------------------------------------------------------
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = 'async';
      image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Failed to load ${url}`)); image.src = url;
    });
  }
  async function loadDem(meta) {
    const image = await loadImage(base + meta.file);
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, heights = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < heights.length; i++) heights[i] = (pixels[i * 4] * 256 + pixels[i * 4 + 1]) * meta.stepM + meta.offsetM; // 8-bit RGB PNG: height = (R*256+G)*step+offset
    return { ...meta, heights, n: canvas.width };
  }
  function buildTerrain() {
    material = makeMaterial();
    RINGS.forEach(([outer, cell, inner], i) => {
      const mesh = new THREE.Mesh(ringGeometry(outer, cell, inner), material);
      mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.name = `terrain ring ${i}`; group.add(mesh);
    });
  }
  const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  async function addLayer(index) {
    const name = layerNames[index], meta = manifest.layers[name];
    const file = (config.highRes && meta.files['4096']) || meta.files['3072'] || meta.files['2048'];
    const image = await loadImage(base + file);
    if (disposed) return;
    const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, config.maxAnisotropy || 4); // 16x costs ~4x the whole frame in a software renderer; 4x keeps the ground sharp enough
    texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true; textures.add(texture);
    config.renderer?.initTexture(texture); // upload once, now, instead of stalling the first frame that uses it
    image.src = ''; // the pixels live on the GPU; free the decoded copy
    const u = material.userData.uniforms, w = meta.maxX - meta.minX, h = meta.maxY - meta.minY;
    u[`uTex${index}`].value = texture;
    u[`uBox${index}`].value.set(meta.minX - originX, meta.minY - originY, 1 / w, 1 / h);
    u.uFeather.value.setComponent(index, FEATHER[index] / (2 * meta.groundHalfM));
    u.uLoaded.value.setComponent(index, 1);
    loadedLayers[index] = true; layersShown++; attribution.hidden = false; notify();
  }
  async function loadScenery() {
    notify();
    manifest = await (await fetch(base + 'scenery.json')).json();
    if (disposed) return;
    try {
      [near, far] = await Promise.all([loadDem(manifest.dem.near), loadDem(manifest.dem.far)]);
    } catch (error) { near = far = null; failed++; console.warn(error); }
    if (disposed) return;
    terrainSettled = true;
    if (near) buildTerrain();
    notify();
    if (!near) return;
    for (let i = 0; i < 4 && !disposed; i++) { // low-resolution layers first; detail arrives in the background
      try { await addLayer(i); } catch (error) { failed++; console.warn(error); notify(); }
      await frame();
    }
  }
  const ready = loadScenery().catch(error => { console.warn(error); terrainSettled = true; failed++; notify(); });
  return { ready, groundHeight, geographicPosition, status, update(time, state) {
    const position = state?.position || state?.pos;
    if (position && far) {
      const point = localToMercator(position.x, position.z);
      const outside = point.x < far.minX + 5000 || point.x > far.maxX - 5000 || point.y < far.minY + 5000 || point.y > far.maxY - 5000;
      if (outside !== outsideCoverage) { outsideCoverage = outside; notify(); }
    }
  }, dispose() {
    if (disposed) return;
    disposed = true; scene.remove(group); attribution.remove();
    geometries.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); material?.dispose();
  } };
}
