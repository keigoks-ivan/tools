// Pre-baked geographic scenery: satellite/aerial imagery and elevation come from static files in ./data/lszh
// (see dev/bake_lszh.py). The game makes no third-party imagery or elevation requests at runtime.
//
// Terrain is one set of nested square rings (finer near the airport) draped with up to four imagery layers that a
// fragment shader feathers together, so layer edges and colour differences never show as hard seams.
//
// Tour patches (dev/bake_tours.py, data/lszh/tours.json): scenery.setTour('alps' | 'city') adds two more imagery
// slots (tour-mid, tour-detail, feathered over the base layers), a finer DEM patch mesh (the base rings are sunk under
// it) and makes groundHeight() follow the tour DEM; setTour(null) removes and disposes all of it.
//
// Country layer (dev/bake_country.py, data/lszh/country/): all of Switzerland beyond the far box. One imagery texture
// (~90 m/px) and a 200 m DEM, loaded lazily (aircraft > 45 km from the airport, scenery.ensureCountry(), or a tour whose
// box lies outside the far box). Until then nothing is requested and the airport view is unchanged. The ground outside the
// far ring is a set of 16 km chunks (472 m cells, 236 m near the aircraft) whose vertices are relative to the chunk centre
// (mesh.position carries the large local-frame offset), so float32 vertex precision does not degrade ~170 km from the origin.
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
  const ringMeshes = [];
  let countryDem = null, countryMeta = null, countryGroup = null, countryMaterial = null, countryPromise = null, countryShown = false, countryAuto = false;
  const countryChunks = [];
  let terrainDone; const terrainReady = new Promise(resolve => { terrainDone = resolve; }); // settles when the base terrain (not the imagery layers) is up
  let tour = null, tourSerial = 0, tourManifest = null, tourDem = null; // active tour patch (see setTour)
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
      tour: tour?.shown ? tour.id : null,
      phase: disposed ? 'disposed' : terrainSettled ? (near ? (layersShown >= 4 ? 'ready' : 'imagery') : 'fallback') : 'loading',
      country: countryShown, terrain: near !== null, terrainSettled, imagery: layersShown > 0, layers: layersShown, totalLayers: 4, failed, outsideCoverage,
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

  const TOUR_EDGE = 0.04;      // fraction of the tour DEM box over which its heights ease into the base terrain
  const TOUR_FEATHER = 0.18;   // tour imagery feather = this fraction of the layer's half size (wide, so patch edges do not read as seams)
  const TOUR_RING_SINK = 60;   // metres the base rings are sunk below the lowest nearby patch terrain, so they never show through the patch
  // ---- elevation -------------------------------------------------------------------------------------------
  function sampleDem(dem, mx, my) {
    const px = (mx - dem.minX) / (dem.maxX - dem.minX) * dem.n - 0.5, py = (dem.maxY - my) / (dem.maxY - dem.minY) * dem.n - 0.5;
    const x = Math.max(0, Math.min(dem.n - 1.001, px)), y = Math.max(0, Math.min(dem.n - 1.001, py));
    const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top, h = dem.heights, n = dem.n;
    const a = h[top * n + left], b = h[top * n + left + 1], c = h[(top + 1) * n + left], d = h[(top + 1) * n + left + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function sampleRectDem(dem, mx, my) { // non-square DEM (country): nx x ny cells
    const nx = dem.nx, ny = dem.ny, px = (mx - dem.minX) / (dem.maxX - dem.minX) * nx - 0.5, py = (dem.maxY - my) / (dem.maxY - dem.minY) * ny - 0.5;
    const x = Math.max(0, Math.min(nx - 1.001, px)), y = Math.max(0, Math.min(ny - 1.001, py));
    const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top, h = dem.heights;
    const a = h[top * nx + left], b = h[top * nx + left + 1], c = h[(top + 1) * nx + left], d = h[(top + 1) * nx + left + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function absoluteHeight(mx, my) { // metres above sea level: swissALTI3D inside the near grid, eased into the far grid at its edge
    const f = sampleDem(far, mx, my);
    const u = Math.min(mx - near.minX, near.maxX - mx) / (near.maxX - near.minX), v = Math.min(my - near.minY, near.maxY - my) / (near.maxY - near.minY);
    const w = smooth(Math.min(u, v) / 0.06);
    let base = w <= 0 ? f : w >= 1 ? sampleDem(near, mx, my) : f + (sampleDem(near, mx, my) - f) * w;
    if (countryDem) { // country DEM outside the far box, eased in over the outer 6% of the far box
      const fu = Math.min(mx - far.minX, far.maxX - mx) / (far.maxX - far.minX), fv = Math.min(my - far.minY, far.maxY - my) / (far.maxY - far.minY);
      const cw = 1 - smooth(Math.min(fu, fv) / 0.06);
      if (cw > 0) base += (sampleRectDem(countryDem, mx, my) - base) * cw;
    }
    if (tourDem) { // tour patch: its own swissALTI3D grid, eased into the base terrain over TOUR_EDGE of the box width
      const pu = Math.min(mx - tourDem.minX, tourDem.maxX - mx) / (tourDem.maxX - tourDem.minX), pv = Math.min(my - tourDem.minY, tourDem.maxY - my) / (tourDem.maxY - tourDem.minY);
      const pw = smooth(Math.min(pu, pv) / TOUR_EDGE);
      if (pw > 0) return pw >= 1 ? sampleDem(tourDem, mx, my) : base + (sampleDem(tourDem, mx, my) - base) * pw;
    }
    return base;
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
  function ringHeight(x, z, cell) { // ring vertex height: real ground, or (inside an active tour patch) sunk below all nearby patch terrain
    const h = groundHeight(x, z);
    if (!tourDem) return h;
    const point = localToMercator(x, z), d = tourDem;
    if (point.x < d.minX || point.x > d.maxX || point.y < d.minY || point.y > d.maxY) return h;
    let low = h;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) low = Math.min(low, groundHeight(x + i * cell / 2, z + j * cell / 2));
    return low - TOUR_RING_SINK;
  }
  function ringGeometry(outer, cell, inner) {
    const hm = outer / groundScale, cm = cell / groundScale, im = inner / groundScale;
    const n = Math.round(outer * 2 / cell), stride = n + 1;
    const positions = new Float32Array(stride * stride * 3), indices = [];
    for (let row = 0; row <= n; row++) for (let col = 0; col <= n; col++) {
      const mx = originX + (-hm + col * cm), my = originY + (hm - row * cm);
      const east = (mx - originX) * groundScale, north = (my - originY) * groundScale;
      const x = cosine * east - sine * north, z = -sine * east - cosine * north;
      const i = (row * stride + col) * 3;
      positions[i] = x; positions[i + 1] = ringHeight(x, z, cell) - 0.1; positions[i + 2] = z;
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
  function makeMaterial(shared) { // shared: the ring material; the tour patch mesh reuses its uniforms
    const placeholder = new THREE.DataTexture(new Uint8Array([128, 140, 110, 255]), 1, 1); placeholder.colorSpace = THREE.SRGBColorSpace; placeholder.needsUpdate = true; textures.add(placeholder);
    const uniforms = shared ? shared.userData.uniforms : {
      uRot: { value: new THREE.Vector3(cosine, sine, groundScale) },
      uLoaded: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFeather: { value: new THREE.Vector4(0, 0, 0, 0) },
      uLoadTour: { value: new THREE.Vector2(0, 0) }, uFeatTour: { value: new THREE.Vector2(0.01, 0.01) },
      uTexC: { value: placeholder }, uBoxC: { value: new THREE.Vector4(0, 0, 1, 1) }, uSizeC: { value: new THREE.Vector2(1, 1) }, uLoadC: { value: 0 }, uFeatC: { value: 1 },
    };
    if (!shared) {
      layerNames.forEach((name, i) => { uniforms[`uTex${i}`] = { value: placeholder }; uniforms[`uBox${i}`] = { value: new THREE.Vector4(0, 0, 1, 1) }; });
      for (const i of [4, 5]) { uniforms[`uTex${i}`] = { value: placeholder }; uniforms[`uBox${i}`] = { value: new THREE.Vector4(0, 0, 1, 1) }; }
    }
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vXZ; uniform vec3 uRot; uniform vec4 uLoaded; uniform vec4 uFeather;
        uniform sampler2D uTex0; uniform sampler2D uTex1; uniform sampler2D uTex2; uniform sampler2D uTex3;
        uniform vec4 uBox0; uniform vec4 uBox1; uniform vec4 uBox2; uniform vec4 uBox3;
        uniform sampler2D uTex4; uniform sampler2D uTex5; uniform vec4 uBox4; uniform vec4 uBox5; uniform vec2 uLoadTour; uniform vec2 uFeatTour;
        uniform sampler2D uTexC; uniform vec4 uBoxC; uniform vec2 uSizeC; uniform float uLoadC; uniform float uFeatC;
        float countryEdge(vec2 uv) { vec2 e = min(uv, 1.0 - uv) * uSizeC; return smoothstep(0.0, max(uFeatC, 1e-3), min(e.x, e.y)); }
        vec2 layerUV(vec4 box, vec2 m) { return (m - box.xy) * box.zw; }
        float edgeWeight(vec2 uv, float feather) { vec2 e = min(uv, 1.0 - uv); return smoothstep(0.0, max(feather, 1e-5), min(e.x, e.y)); }`)
        .replace('#include <map_fragment>', `
        vec2 mer = vec2(uRot.x * vXZ.x - uRot.y * vXZ.y, -uRot.y * vXZ.x - uRot.x * vXZ.y) / uRot.z;
        vec2 uv0 = layerUV(uBox0, mer), uv1 = layerUV(uBox1, mer), uv2 = layerUV(uBox2, mer), uv3 = layerUV(uBox3, mer);
        vec3 col = texture2D(uTex0, uv0).rgb;
        col = mix(col, texture2D(uTex1, uv1).rgb, uLoaded.y * edgeWeight(uv1, uFeather.y));
        col = mix(col, texture2D(uTex2, uv2).rgb, uLoaded.z * edgeWeight(uv2, uFeather.z));
        col = mix(col, texture2D(uTex3, uv3).rgb, uLoaded.w * edgeWeight(uv3, uFeather.w));
        if (uLoadTour.x > 0.0) { vec2 uv4 = layerUV(uBox4, mer); col = mix(col, texture2D(uTex4, uv4).rgb, uLoadTour.x * edgeWeight(uv4, uFeatTour.x)); }
        if (uLoadTour.y > 0.0) { vec2 uv5 = layerUV(uBox5, mer); col = mix(col, texture2D(uTex5, uv5).rgb, uLoadTour.y * edgeWeight(uv5, uFeatTour.y)); }
        vec3 outerCol = fogColor;
        if (uLoadC > 0.0) { vec2 uvC = layerUV(uBoxC, mer); outerCol = mix(fogColor, texture2D(uTexC, uvC).rgb, uLoadC * countryEdge(uvC)); }
        col = mix(outerCol, col, mix(1.0, edgeWeight(uv0, 0.07), uLoaded.x));
        diffuseColor.rgb *= col;`);
    };
    m.customProgramCacheKey = () => shared ? 'tour-patch' : 'ring';
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
      mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.name = `terrain ring ${i}`; group.add(mesh); ringMeshes.push(mesh);
    });
  }
  function rebuildRings(box) { // after a tour starts/stops (or the country DEM arrives): new ring heights (sunk under the patch, or back to plain terrain)
    ringMeshes.forEach((mesh, i) => {
      const old = mesh.geometry; mesh.geometry = ringGeometry(...RINGS[i]); old.dispose(); geometries.delete(old);
    });
    if (box) refreshCountryChunks(box);
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
  // ---- tour patches --------------------------------------------------------------------------------------------
  function patchGeometry(d) { // fine mesh over the tour DEM box, with a skirt around its edge
    const cell = d.meshCellM || 60, n = Math.max(2, Math.round(2 * d.groundHalfM / cell)), stride = n + 1, w = d.maxX - d.minX, h = d.maxY - d.minY;
    const positions = new Float32Array(stride * stride * 3), indices = [], extra = [];
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) {
      const mx = d.minX + w * c / n, my = d.maxY - h * r / n, east = (mx - originX) * groundScale, north = (my - originY) * groundScale;
      const x = cosine * east - sine * north, z = -sine * east - cosine * north, i = (r * stride + c) * 3;
      positions[i] = x; positions[i + 1] = groundHeight(x, z) - 0.1; positions[i + 2] = z;
    }
    const skirt = 400; // hides cracks between the patch edge and the coarse base ring beside it
    function pushSkirt(a, b) {
      const first = stride * stride + extra.length / 3;
      for (const v of [a, b]) extra.push(positions[v * 3], positions[v * 3 + 1] - skirt, positions[v * 3 + 2]);
      indices.push(a, first, b, b, first, first + 1);
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const a = r * stride + c, b = a + 1, e = a + stride, f = e + 1;
      indices.push(a, e, b, b, e, f);
      if (r === 0) pushSkirt(b, a);
      if (r === n - 1) pushSkirt(e, f);
      if (c === 0) pushSkirt(a, e);
      if (c === n - 1) pushSkirt(f, b);
    }
    const all = new Float32Array(positions.length + extra.length); all.set(positions); all.set(extra, positions.length);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e7); geometries.add(geo); return geo;
  }
  function makeTexture(image) {
    const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, config.maxAnisotropy || 4);
    texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true; textures.add(texture);
    config.renderer?.initTexture(texture); image.src = ''; return texture;
  }
  const nextFrame = () => Promise.race([frame(), new Promise(resolve => setTimeout(resolve, 300))]); // rAF stalls in a hidden tab
  function clearTour() { // remove the active tour (or a half-loaded one) and free its geometry, textures and DEM
    if (!tour) return;
    const t = tour; tour = null; tourDem = null; t.cancelled = true;
    if (material) {
      const u = material.userData.uniforms;
      u.uLoadTour.value.set(0, 0);
      u.uTex4.value = u.uTex5.value = material.userData.placeholder;
    }
    if (t.mesh) { group.remove(t.mesh); t.mesh.material.dispose(); }
    if (t.geometry) { t.geometry.dispose(); geometries.delete(t.geometry); }
    for (const texture of t.textures) { texture.dispose(); textures.delete(texture); }
    t.textures.length = 0; t.mesh = t.geometry = null;
    if (ringMeshes.length && !disposed) rebuildRings(t.box);
    notify();
  }
  async function buildTour(t) {
    await ready;
    if (!near || !material) throw new Error('base scenery is not available');
    if (!tourManifest) tourManifest = fetch(base + 'tours.json').then(r => { if (!r.ok) throw new Error(`tours.json: HTTP ${r.status}`); return r.json(); });
    let all;
    try { all = await tourManifest; } catch (error) { tourManifest = null; throw error; }
    const spec = all.tours?.[t.id];
    if (!spec) throw new Error(`Unknown tour "${t.id}"`);
    if (spec.dem && (spec.dem.minX < far.minX || spec.dem.maxX > far.maxX || spec.dem.minY < far.minY || spec.dem.maxY > far.maxY)) await ensureCountry(); // the tour lies (partly) beyond the far box
    if (t.cancelled) throw new Error(`Tour "${t.id}" was cancelled`);
    const pick = files => (config.highRes && files['4096']) || files['3072'] || files['4096'];
    const [dem, midImage, detailImage] = await Promise.all([
      loadDem({ ...spec.dem, stepM: spec.dem.stepM ?? 0.25, offsetM: spec.dem.offsetM ?? 0 }),
      loadImage(base + pick(spec.layers.mid.files)), loadImage(base + pick(spec.layers.detail.files)),
    ]);
    if (t.cancelled) throw new Error(`Tour "${t.id}" was cancelled`);
    tourDem = { ...dem, meshCellM: spec.dem.meshCellM, groundHalfM: spec.dem.groundHalfM };
    t.box = { minX: dem.minX, maxX: dem.maxX, minY: dem.minY, maxY: dem.maxY };
    t.geometry = patchGeometry(tourDem);
    const patchMaterial = makeMaterial(material);
    t.mesh = new THREE.Mesh(t.geometry, patchMaterial); t.mesh.frustumCulled = false; t.mesh.renderOrder = -1; t.mesh.name = `tour patch ${t.id}`; group.add(t.mesh);
    rebuildRings(t.box);
    const u = material.userData.uniforms;
    [spec.layers.mid, spec.layers.detail].forEach((meta, k) => {
      const texture = makeTexture(k ? detailImage : midImage); t.textures.push(texture);
      u[`uTex${4 + k}`].value = texture;
      u[`uBox${4 + k}`].value.set(meta.minX - originX, meta.minY - originY, 1 / (meta.maxX - meta.minX), 1 / (meta.maxY - meta.minY));
      u.uFeatTour.value.setComponent(k, TOUR_FEATHER * meta.groundHalfM / (2 * meta.groundHalfM));
      u.uLoadTour.value.setComponent(k, 1);
    });
    t.shown = true; notify();
    await nextFrame();
    if (t.cancelled) throw new Error(`Tour "${t.id}" was cancelled`);
  }
  // setTour('alps' | 'city') -> Promise that resolves once the tour's DEM + imagery are loaded and shown;
  // setTour(null) removes the patch and frees its memory. Rejects (base scenery keeps working) if anything is missing.
  // Replacing or removing a tour while it is still loading rejects the older promise.
  function setTour(id) {
    if (id != null && tour?.id === id) return tour.promise;
    tourSerial++;
    clearTour();
    if (id == null) return Promise.resolve();
    if (disposed) return Promise.reject(new Error('scenery disposed'));
    const t = { id, cancelled: false, shown: false, mesh: null, geometry: null, textures: [], promise: null };
    tour = t;
    t.promise = buildTour(t).catch(error => { if (!t.cancelled) { console.warn(`Tour "${id}" failed`, error); failed++; } if (tour === t) clearTour(); throw error; });
    return t.promise;
  }

  // ---- country layer --------------------------------------------------------------------------------------
  const CTRY = { cell: 472, chunk: 34, hole: 5, fineRange: 40000, dropRange: 60000, edgeFeatherM: 15000 }; // 34 cells = 16,048 m; hole = the far ring's 80,240 m half size = 5 chunks
  function chunkGeometry(c, div) {
    const cell = CTRY.cell / div, n = CTRY.chunk * div, stride = n + 1, cm = cell / groundScale, size = cm * n, d = countryMeta;
    const positions = new Float32Array(stride * stride * 3), indices = [], extra = [];
    const x0 = originX + c.ci * CTRY.chunk * CTRY.cell / groundScale, y0 = originY + c.cj * CTRY.chunk * CTRY.cell / groundScale;
    for (let r = 0; r <= n; r++) for (let col = 0; col <= n; col++) {
      const east = (x0 + col * cm - originX) * groundScale, north = (y0 + size - r * cm - originY) * groundScale;
      const x = cosine * east - sine * north, z = -sine * east - cosine * north, i = (r * stride + col) * 3;
      positions[i] = x - c.cx; positions[i + 1] = ringHeight(x, z, cell) - 0.1; positions[i + 2] = z - c.cz; // relative to the chunk centre (float32 precision)
    }
    const included = (r, col) => {
      if (r < 0 || col < 0 || r >= n || col >= n) return false;
      const mx = x0 + (col + 0.5) * cm, my = y0 + size - (r + 0.5) * cm;
      return mx > d.minX && mx < d.maxX && my > d.minY && my < d.maxY;
    };
    const skirt = Math.max(8, cell * 0.8);
    function pushSkirt(a, b) {
      const first = stride * stride + extra.length / 3;
      for (const v of [a, b]) extra.push(positions[v * 3], positions[v * 3 + 1] - skirt, positions[v * 3 + 2]);
      indices.push(a, first, b, b, first, first + 1);
    }
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      if (!included(r, col)) continue;
      const a = r * stride + col, b = a + 1, e = a + stride, f = e + 1;
      indices.push(a, e, b, b, e, f);
      if (!included(r - 1, col)) pushSkirt(b, a);
      if (!included(r + 1, col)) pushSkirt(e, f);
      if (!included(r, col - 1)) pushSkirt(a, e);
      if (!included(r, col + 1)) pushSkirt(f, b);
    }
    const all = new Float32Array(positions.length + extra.length); all.set(positions); all.set(extra, positions.length);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2000, 0), CTRY.chunk * CTRY.cell * 0.7072 + 3500); geometries.add(geo); return geo;
  }
  function setChunkGeometry(c, div) {
    const fresh = chunkGeometry(c, div);
    if (div === 1) { if (c.coarse) { c.coarse.dispose(); geometries.delete(c.coarse); } c.coarse = fresh; }
    else { if (c.fine) { c.fine.dispose(); geometries.delete(c.fine); } c.fine = fresh; }
    c.mesh.geometry = fresh; c.div = div;
  }
  function chunkTouches(c, box) {
    const size = CTRY.chunk * CTRY.cell / groundScale, x0 = originX + c.ci * size, y0 = originY + c.cj * size;
    return !(x0 > box.maxX || x0 + size < box.minX || y0 > box.maxY || y0 + size < box.minY);
  }
  function refreshCountryChunks(box) { // a tour patch started/stopped: re-sink / restore the country chunks under it
    for (const c of countryChunks) if (chunkTouches(c, box)) {
      const wasFine = c.div === 2;
      if (c.fine) { c.fine.dispose(); geometries.delete(c.fine); c.fine = null; }
      setChunkGeometry(c, 1); if (wasFine) setChunkGeometry(c, 2);
    }
  }
  function makeCountryMaterial(uniforms) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { uTexC: uniforms.uTexC, uBoxC: uniforms.uBoxC, uSizeC: uniforms.uSizeC, uFeatC: uniforms.uFeatC });
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vXZ; uniform vec3 uRot; uniform sampler2D uTexC; uniform vec4 uBoxC; uniform vec2 uSizeC; uniform float uFeatC;`)
        .replace('#include <map_fragment>', `
        vec2 mer = vec2(uRot.x * vXZ.x - uRot.y * vXZ.y, -uRot.y * vXZ.x - uRot.x * vXZ.y) / uRot.z;
        vec2 uvC = (mer - uBoxC.xy) * uBoxC.zw; vec2 eC = min(uvC, 1.0 - uvC) * uSizeC;
        diffuseColor.rgb *= mix(fogColor, texture2D(uTexC, uvC).rgb, smoothstep(0.0, max(uFeatC, 1e-3), min(eC.x, eC.y)));`);
      shader.uniforms.uRot = material.userData.uniforms.uRot;
    };
    m.customProgramCacheKey = () => 'country';
    return m;
  }
  function discardCountry() {
    countryShown = false; countryDem = null;
    for (const c of countryChunks) for (const g of [c.coarse, c.fine]) if (g) { g.dispose(); geometries.delete(g); }
    countryChunks.length = 0;
    if (countryGroup) { group.remove(countryGroup); countryGroup = null; }
    if (countryMaterial) { countryMaterial.dispose(); countryMaterial = null; }
    if (material) { const u = material.userData.uniforms; u.uLoadC.value = 0; u.uTexC.value = material.userData.placeholder; }
    countryMeta = null;
  }
  async function buildCountry() {
    await terrainReady;
    if (!near || !material) throw new Error('base scenery is not available');
    const response = await fetch(base + 'country/country.json');
    if (!response.ok) throw new Error(`country.json: HTTP ${response.status}`);
    const meta = await response.json(), dir = base + 'country/';
    const file = (config.highRes && meta.files['4096']) || meta.files['2048'] || meta.files['4096'];
    const [dem, image] = await Promise.all([
      (async () => { const i = await loadImage(dir + meta.dem.file), canvas = document.createElement('canvas'); canvas.width = i.naturalWidth; canvas.height = i.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(i, 0, 0);
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data, heights = new Float32Array(canvas.width * canvas.height);
        for (let k = 0; k < heights.length; k++) heights[k] = (px[k * 4] * 256 + px[k * 4 + 1]) * meta.dem.stepM + meta.dem.offsetM;
        if (canvas.width !== meta.dem.nx || canvas.height !== meta.dem.ny) throw new Error('country DEM size mismatch');
        return { ...meta.dem, heights, n: canvas.width }; })(),
      loadImage(dir + file),
    ]);
    if (disposed) throw new Error('scenery disposed');
    const u = material.userData.uniforms;
    countryMeta = meta; countryDem = dem;
    try {
      countryGroup = new THREE.Group(); countryGroup.name = 'Country terrain'; countryGroup.visible = false; group.add(countryGroup);
      countryMaterial = makeCountryMaterial(u);
      const texture = makeTexture(image);
      u.uTexC.value = texture; u.uBoxC.value.set(meta.minX - originX, meta.minY - originY, 1 / (meta.maxX - meta.minX), 1 / (meta.maxY - meta.minY));
      u.uSizeC.value.set((meta.maxX - meta.minX) * groundScale, (meta.maxY - meta.minY) * groundScale); u.uFeatC.value = CTRY.edgeFeatherM;
      const size = CTRY.chunk * CTRY.cell / groundScale, list = [];
      for (let ci = Math.floor((meta.minX - originX) / size); ci <= Math.floor((meta.maxX - originX) / size); ci++)
        for (let cj = Math.floor((meta.minY - originY) / size); cj <= Math.floor((meta.maxY - originY) / size); cj++) {
          if (ci >= -CTRY.hole && ci < CTRY.hole && cj >= -CTRY.hole && cj < CTRY.hole) continue; // the far ring covers this square
          const c = { ci, cj, div: 0, coarse: null, fine: null, mesh: null, cx: 0, cz: 0 };
          if (!chunkTouches(c, meta)) continue;
          const east = (originX + (ci + 0.5) * size - originX) * groundScale, north = ((cj + 0.5) * size) * groundScale;
          c.cx = cosine * east - sine * north; c.cz = -sine * east - cosine * north; list.push(c);
        }
      let slice = 0;
      for (const c of list) {
        c.mesh = new THREE.Mesh(new THREE.BufferGeometry(), countryMaterial); c.mesh.position.set(c.cx, 0, c.cz); c.mesh.updateMatrix(); c.mesh.matrixAutoUpdate = false;
        c.mesh.renderOrder = -1; c.mesh.name = `country chunk ${c.ci},${c.cj}`; countryGroup.add(c.mesh); countryChunks.push(c);
        setChunkGeometry(c, 1);
        if (++slice % 16 === 0) { await nextFrame(); if (disposed) throw new Error('scenery disposed'); }
      }
      rebuildRings(); // far ring's outer band now follows the country DEM
      countryGroup.visible = true; u.uLoadC.value = 1; countryShown = true; attribution.hidden = false; notify();
      await nextFrame();
    } catch (error) { discardCountry(); throw error; }
  }
  // ensureCountry() -> Promise that resolves once the country imagery + DEM are loaded and shown (immediately if already so).
  // Rejects, leaving the base scenery untouched, if anything is missing; a later call retries.
  function ensureCountry() {
    if (disposed) return Promise.reject(new Error('scenery disposed'));
    if (!countryPromise) countryPromise = buildCountry().catch(error => { countryPromise = null; failed++; console.warn('Country scenery failed', error); notify(); throw error; });
    return countryPromise;
  }
  function updateCountry(px, pz) {
    const near2 = Math.hypot(px, pz) > 45000;
    if (near2 && !countryPromise && !countryAuto) { countryAuto = true; ensureCountry().catch(() => {}); } // distant flight: one automatic attempt (a failed load is retried only by an explicit ensureCountry())
    if (!countryShown) return;
    let built = 0;
    for (const c of countryChunks) {
      const d = Math.hypot(c.cx - px, c.cz - pz);
      if (c.div === 1 && d < CTRY.fineRange && !built) { if (!c.fine) setChunkGeometry(c, 2); else { c.mesh.geometry = c.fine; c.div = 2; } built++; }
      else if (c.div === 2 && d > CTRY.dropRange) { c.mesh.geometry = c.coarse; c.div = 1; if (c.fine) { c.fine.dispose(); geometries.delete(c.fine); c.fine = null; } }
    }
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
    terrainDone();
    notify();
    if (!near) return;
    for (let i = 0; i < 4 && !disposed; i++) { // low-resolution layers first; detail arrives in the background
      try { await addLayer(i); } catch (error) { failed++; console.warn(error); notify(); }
      await frame();
    }
  }
  const ready = loadScenery().catch(error => { console.warn(error); terrainSettled = true; failed++; terrainDone(); notify(); });
  return { ready, groundHeight, geographicPosition, status, setTour, ensureCountry, update(time, state) {
    const position = state?.position || state?.pos;
    if (position && far) {
      const point = localToMercator(position.x, position.z), box = countryShown ? countryMeta : far, margin = 5000;
      const outside = point.x < box.minX + margin || point.x > box.maxX - margin || point.y < box.minY + margin || point.y > box.maxY - margin;
      if (outside !== outsideCoverage) { outsideCoverage = outside; notify(); }
      updateCountry(position.x, position.z);
    }
  }, dispose() {
    if (disposed) return;
    disposed = true; clearTour(); scene.remove(group); attribution.remove();
    geometries.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); material?.dispose();
  } };
}
