const EARTH_RADIUS = 6378137;
const MERCATOR_SIZE = 2 * Math.PI * EARTH_RADIUS;
const IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const ELEVATION_URL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium';

export function createGeoScenery(THREE, scene, config) {
  if (!Number.isFinite(config?.latitude) || !Number.isFinite(config?.longitude)) throw new Error('Geographic scenery requires a latitude and longitude.');
  const radians = Math.PI / 180;
  const latitude = Math.max(-80, Math.min(80, config.latitude));
  const originX = EARTH_RADIUS * config.longitude * radians;
  const originY = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2));
  const groundScale = Math.cos(latitude * radians);
  const bearing = (config.bearing || 0) * radians, cosine = Math.cos(bearing), sine = Math.sin(bearing);
  const elevation = Number.isFinite(config.elevation) ? config.elevation : 20.9;
  const airportBounds = config.airportBounds || { minX: -180, maxX: 1900, minZ: -2200, maxZ: 2200 };
  const feather = airportBounds.feather ?? 220;
  const group = new THREE.Group(); group.name = 'Geographic satellite scenery'; scene.add(group);
  const layers = [], geometries = new Set(), surfaces = new Set(), maps = new Set(), activeImages = new Set();
  let disposed = false, dem = null, lastUpload = 0, overviewLoaded = 0, regionalLoaded = 0, detailLoaded = 0, terrainLoaded = 0;
  let complete = false, failed = 0, total = 0, outsideCoverage = false, runningImages = 0;
  const imageSlots = [], maxConcurrent = Math.min(6, Math.max(1, config.concurrency ?? 4));
  const imageryCredits = 'Esri, DigitalGlobe, GeoEye, Earthstar Geographics, and the GIS User Community';
  const terrainCredits = 'Mapzen · USGS SRTM/GMTED2010 · NOAA ETOPO1';

  const attribution = document.createElement('div');
  attribution.className = 'geo-attribution';
  attribution.style.cssText = 'position:absolute;right:12px;bottom:10px;z-index:6;max-width:min(560px,90vw);color:#e7eef1;background:rgba(12,25,32,.72);padding:5px 8px;border-radius:4px;font:10px/1.5 Arial,sans-serif;pointer-events:auto;';
  function credit(text, href) {
    const link = document.createElement('a'); link.textContent = text; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.style.cssText = 'color:inherit;text-decoration:none;'; return link;
  }
  attribution.append(credit(`Imagery © ${imageryCredits}`, 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9'));
  attribution.append(document.createElement('br'));
  attribution.append(credit(`Terrain: ${terrainCredits} · airfield elevation flattened for simulation`, 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'));
  const attributionParent = config.attributionTarget || document.body;
  attributionParent.appendChild(attribution);
  attribution.hidden = true;

  function status() {
    const loaded = overviewLoaded + regionalLoaded + detailLoaded + terrainLoaded;
    return {
      phase: disposed ? 'disposed' : complete ? (overviewLoaded ? 'ready' : 'fallback') : 'loading',
      imagery: overviewLoaded > 0, terrain: dem !== null, loaded, total, failed,
      overviewLoaded, regionalLoaded, detailLoaded, outsideCoverage, coverageKm: overview.bounds.width * groundScale / 1000,
      regionalCoverageKm: regional.bounds.width * groundScale / 1000, detailCoverageKm: detail.bounds.width * groundScale / 1000,
      attribution: { imagery: imageryCredits, terrain: terrainCredits },
    };
  }
  function notify() { if (!disposed) config.onStatus?.(status()); }
  function localToMercator(x, z) {
    return { x: originX + (cosine * x - sine * z) / groundScale, y: originY + (-sine * x - cosine * z) / groundScale };
  }
  function mercatorToLocal(x, y) {
    const east = (x - originX) * groundScale, north = (y - originY) * groundScale;
    return { x: cosine * east - sine * north, z: -sine * east - cosine * north };
  }
  function geographicPosition(x, z) {
    const point = localToMercator(x, z);
    return { latitude: (2 * Math.atan(Math.exp(point.y / EARTH_RADIUS)) - Math.PI / 2) / radians, longitude: point.x / EARTH_RADIUS / radians };
  }
  function tilePatch(zoom, count) {
    const tileSize = MERCATOR_SIZE / 2 ** zoom;
    const centerX = Math.floor((originX + MERCATOR_SIZE / 2) / tileSize);
    const centerY = Math.floor((MERCATOR_SIZE / 2 - originY) / tileSize);
    const minTileX = centerX - Math.floor(count / 2), minTileY = centerY - Math.floor(count / 2);
    const bounds = {
      minX: -MERCATOR_SIZE / 2 + minTileX * tileSize,
      maxX: -MERCATOR_SIZE / 2 + (minTileX + count) * tileSize,
      minY: MERCATOR_SIZE / 2 - (minTileY + count) * tileSize,
      maxY: MERCATOR_SIZE / 2 - minTileY * tileSize, width: count * tileSize, height: count * tileSize,
    };
    return { zoom, tileSize, minTileX, minTileY, columns: count, rows: count, bounds };
  }
  const overview = tilePatch(config.overviewZoom ?? 12, Math.min(7, Math.max(3, config.overviewTiles ?? 5)));
  const regional = tilePatch(config.regionalZoom ?? 14, Math.min(12, Math.max(6, config.regionalTiles ?? 10)));
  const detail = tilePatch(config.detailZoom ?? 16, Math.min(12, Math.max(6, config.detailTiles ?? 12)));
  function readDEM(mx, my) {
    if (!dem) return 0;
    const px = (mx - dem.bounds.minX) / dem.bounds.width * dem.width;
    const py = (dem.bounds.maxY - my) / dem.bounds.height * dem.height;
    const x = Math.max(0, Math.min(dem.width - 1.001, px)), y = Math.max(0, Math.min(dem.height - 1.001, py));
    const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top;
    const a = dem.heights[top * dem.width + left], b = dem.heights[top * dem.width + left + 1];
    const c = dem.heights[(top + 1) * dem.width + left], d = dem.heights[(top + 1) * dem.width + left + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function groundHeight(x, z) {
    const dx = Math.max(airportBounds.minX - x, 0, x - airportBounds.maxX);
    const dz = Math.max(airportBounds.minZ - z, 0, z - airportBounds.maxZ);
    const distance = Math.hypot(dx, dz);
    if (distance === 0 || !dem) return 0;
    const point = localToMercator(x, z);
    const measured = Math.max(0, readDEM(point.x, point.y)) - elevation;
    const fraction = Math.max(0, Math.min(1, distance / Math.max(1, feather)));
    const blend = fraction * fraction * (3 - 2 * fraction);
    return measured * blend;
  }
  function patchGeometry(bounds, atlasBounds, density) {
    const segmentsX = Math.max(2, Math.ceil(bounds.width / (150 / groundScale) * density));
    const segmentsY = Math.max(2, Math.ceil(bounds.height / (150 / groundScale) * density));
    const positions = new Float32Array((segmentsX + 1) * (segmentsY + 1) * 3);
    const uvs = new Float32Array((segmentsX + 1) * (segmentsY + 1) * 2), indices = [];
    for (let row = 0; row <= segmentsY; row++) for (let column = 0; column <= segmentsX; column++) {
      const mx = bounds.minX + bounds.width * column / segmentsX, my = bounds.maxY - bounds.height * row / segmentsY;
      const point = mercatorToLocal(mx, my), index = row * (segmentsX + 1) + column;
      positions[index * 3] = point.x; positions[index * 3 + 1] = groundHeight(point.x, point.z) - 0.10; positions[index * 3 + 2] = point.z;
      uvs[index * 2] = (mx - atlasBounds.minX) / atlasBounds.width; uvs[index * 2 + 1] = (my - atlasBounds.minY) / atlasBounds.height;
      if (row < segmentsY && column < segmentsX) {
        const a = index, b = a + 1, c = a + segmentsX + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals(); geo.computeBoundingSphere();
    geometries.add(geo); return geo;
  }
  function addLayer(patch) {
    const canvas = document.createElement('canvas'); canvas.width = patch.columns * 256; canvas.height = patch.rows * 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7d896b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    map.minFilter = THREE.LinearMipmapLinearFilter; maps.add(map);
    const surface = new THREE.MeshBasicMaterial({ map, fog: true }); surfaces.add(surface);
    const layer = { ...patch, canvas, ctx, map, surface, meshes: [], dirty: false, visible: false, count: 0 };
    layers.push(layer); return layer;
  }
  const overviewLayer = addLayer(overview), regionalLayer = addLayer(regional), detailLayer = addLayer(detail);
  function rectangle(minX, maxX, minY, maxY) { return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }; }
  function buildMeshes() {
    for (const [layerIndex, layer] of layers.entries()) {
      for (const mesh of layer.meshes) { group.remove(mesh); geometries.delete(mesh.geometry); mesh.geometry.dispose(); }
      layer.meshes = [];
      let patches = [layer.bounds];
      const innerLayer = layers.slice(layerIndex + 1).find(candidate => candidate.visible);
      if (innerLayer) {
        const b = layer.bounds, d = innerLayer.bounds;
        patches = [rectangle(b.minX, b.maxX, d.maxY, b.maxY), rectangle(b.minX, b.maxX, b.minY, d.minY), rectangle(b.minX, d.minX, d.minY, d.maxY), rectangle(d.maxX, b.maxX, d.minY, d.maxY)];
      }
      for (const bounds of patches) {
        if (bounds.width <= 0 || bounds.height <= 0) continue;
        const mesh = new THREE.Mesh(patchGeometry(bounds, layer.bounds, 0.5 + layerIndex * 0.25), layer.surface);
        mesh.visible = layer.visible; mesh.renderOrder = layerIndex;
        group.add(mesh); layer.meshes.push(mesh);
      }
    }
  }
  buildMeshes();
  async function loadImage(url) {
    if (runningImages >= maxConcurrent) await new Promise(resolve => imageSlots.push(resolve));
    if (disposed) throw new Error('Scenery disposed');
    runningImages++;
    try { return await new Promise((resolve, reject) => {
      if (disposed) { reject(new Error('Scenery disposed')); return; }
      const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async';
      const pending = { cancel() { finish(new Error('Scenery disposed')); image.src = ''; } };
      const timeout = setTimeout(() => { finish(new Error('Tile request timed out')); image.src = ''; }, config.tileTimeout ?? 14000);
      function finish(error) {
        clearTimeout(timeout); activeImages.delete(pending); image.onload = image.onerror = null;
        if (error) reject(error); else resolve(image);
      }
      activeImages.add(pending); image.onload = () => finish(); image.onerror = () => finish(new Error('Tile imagery unavailable')); image.src = url;
    }); } finally { runningImages--; imageSlots.shift()?.(); }
  }
  async function runQueue(tasks) {
    let index = 0;
    const concurrency = Math.min(6, Math.max(1, config.concurrency ?? 4));
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (!disposed && index < tasks.length) {
        const task = tasks[index++];
        try { await task.run(); } catch { if (!disposed) failed++; }
        notify();
      }
    }));
  }
  function tileTasks(patch, handler, base) {
    const tasks = [];
    for (let row = 0; row < patch.rows; row++) for (let column = 0; column < patch.columns; column++) {
      const tileX = patch.minTileX + column, tileY = patch.minTileY + row;
      const mx = -MERCATOR_SIZE / 2 + (tileX + 0.5) * patch.tileSize, my = MERCATOR_SIZE / 2 - (tileY + 0.5) * patch.tileSize;
      const url = base === ELEVATION_URL ? `${base}/${patch.zoom}/${tileX}/${tileY}.png` : `${base}/${patch.zoom}/${tileY}/${tileX}`;
      tasks.push({ distance: Math.hypot(mx - originX, my - originY), async run() { const image = await loadImage(url); if (!disposed) handler(image, column, row); } });
    }
    tasks.sort((a, b) => a.distance - b.distance); return tasks;
  }
  async function loadImagery(layer, count) {
    await runQueue(tileTasks(layer, (image, column, row) => {
      layer.ctx.drawImage(image, column * 256, row * 256, 256, 256); layer.dirty = true; layer.count++;
      if (layer === overviewLayer) overviewLoaded++; else if (layer === regionalLayer) regionalLoaded++; else detailLoaded++;
      if (layer === overviewLayer && !layer.visible) { layer.visible = true; for (const mesh of layer.meshes) mesh.visible = true; attribution.hidden = false; }
    }, IMAGERY_URL));
    if (disposed) return;
    layer.map.needsUpdate = true; layer.dirty = false;
    if (count && layer.count > 0) { layer.visible = true; buildMeshes(); }
  }
  const terrainZoom = config.terrainZoom ?? 11, terrainSize = MERCATOR_SIZE / 2 ** terrainZoom;
  const demMinX = Math.floor((overview.bounds.minX + MERCATOR_SIZE / 2) / terrainSize);
  const demMaxX = Math.ceil((overview.bounds.maxX + MERCATOR_SIZE / 2) / terrainSize);
  const demMinY = Math.floor((MERCATOR_SIZE / 2 - overview.bounds.maxY) / terrainSize);
  const demMaxY = Math.ceil((MERCATOR_SIZE / 2 - overview.bounds.minY) / terrainSize);
  const demPatch = { zoom: terrainZoom, tileSize: terrainSize, minTileX: demMinX, minTileY: demMinY, columns: demMaxX - demMinX, rows: demMaxY - demMinY,
    bounds: rectangle(-MERCATOR_SIZE / 2 + demMinX * terrainSize, -MERCATOR_SIZE / 2 + demMaxX * terrainSize, MERCATOR_SIZE / 2 - demMaxY * terrainSize, MERCATOR_SIZE / 2 - demMinY * terrainSize) };
  total = overview.columns * overview.rows + regional.columns * regional.rows + detail.columns * detail.rows + demPatch.columns * demPatch.rows;
  async function loadTerrain() {
    const canvas = document.createElement('canvas'); canvas.width = demPatch.columns * 256; canvas.height = demPatch.rows * 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const baseHeight = elevation + 32768;
    ctx.fillStyle = `rgb(${Math.floor(baseHeight / 256)},${Math.floor(baseHeight % 256)},0)`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await runQueue(tileTasks(demPatch, (image, column, row) => { ctx.drawImage(image, column * 256, row * 256, 256, 256); terrainLoaded++; }, ELEVATION_URL));
    if (disposed || !terrainLoaded) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, heights = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < heights.length; i++) heights[i] = pixels[i * 4] * 256 + pixels[i * 4 + 1] + pixels[i * 4 + 2] / 256 - 32768;
    dem = { heights, width: canvas.width, height: canvas.height, bounds: demPatch.bounds }; buildMeshes(); notify();
  }
  async function loadScenery() {
    notify();
    const terrainPromise = loadTerrain();
    await loadImagery(overviewLayer, false);
    if (disposed) return;
    if (overviewLoaded) {
      let source = overviewLayer;
      for (const layer of [regionalLayer, detailLayer]) {
        const b = source.bounds, d = layer.bounds;
        const sx = (d.minX - b.minX) / b.width * source.canvas.width;
        const sy = (b.maxY - d.maxY) / b.height * source.canvas.height;
        const sw = d.width / b.width * source.canvas.width, sh = d.height / b.height * source.canvas.height;
        layer.ctx.drawImage(source.canvas, sx, sy, sw, sh, 0, 0, layer.canvas.width, layer.canvas.height);
        layer.map.needsUpdate = true;
        await loadImagery(layer, true);
        if (disposed) return;
        if (layer.visible) source = layer;
      }
    }
    await terrainPromise;
    if (!disposed) { complete = true; notify(); }
  }
  const ready = loadScenery().catch(() => { if (!disposed) { complete = true; failed++; notify(); } });
  return { ready, groundHeight, geographicPosition, status, update(time, state) {
    const now = performance.now();
    if (now - lastUpload > 250) {
      for (const layer of layers) if (layer.dirty) { layer.map.needsUpdate = true; layer.dirty = false; }
      lastUpload = now;
    }
    const position = state?.position || state?.pos;
    if (position) {
      const point = localToMercator(position.x, position.z), bounds = overview.bounds;
      const outside = point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY;
      if (outside !== outsideCoverage) { outsideCoverage = outside; notify(); }
    }
  }, dispose() {
    if (disposed) return;
    disposed = true; for (const pending of activeImages) pending.cancel();
    while (imageSlots.length) imageSlots.shift()();
    scene.remove(group); attribution.remove();
    geometries.forEach(value => value.dispose()); surfaces.forEach(value => value.dispose()); maps.forEach(value => value.dispose());
  } };
}
