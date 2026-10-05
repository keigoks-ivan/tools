// Actual OSM footprints, courtyards and mapped 3D parts. The baked database is
// ODbL-1.0 (see data/lszh/buildings.json); facade detail and missing heights are inferred.
// This is visual scenery only. groundHeight remains the authoritative terrain sampler.
const EARTH_RADIUS = 6378137, RAD = Math.PI / 180, CHUNK_SIZE = 750;

export function projectBuildingPoint(airport, point) {
  const runway = airport.runway, scale = Math.cos(runway.center.lat * RAD);
  const east = EARTH_RADIUS * (point[0] - runway.center.lon) * RAD * scale;
  const north = EARTH_RADIUS * (Math.log(Math.tan(Math.PI / 4 + point[1] * RAD / 2)) - Math.log(Math.tan(Math.PI / 4 + runway.center.lat * RAD / 2))) * scale;
  const angle = runway.bearing * RAD, c = Math.cos(angle), s = Math.sin(angle);
  return { x: c * east - s * north, z: -s * east - c * north };
}

function signedArea(ring) {
  return ring.reduce((sum, point, i) => { const next = ring[(i + 1) % ring.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2;
}

function roofForm(feature, rings) {
  const shape = feature.roofShape;
  if (rings.length > 1 || !['gabled', 'hipped', 'pyramidal', 'dome', 'onion'].includes(shape)) return null;
  const points = rings[0], direction = Math.sign(signedArea(points));
  const convex = points.every((a, i) => {
    const b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    return ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) * direction >= -0.01;
  });
  if (!convex || ((shape === 'gabled' || shape === 'hipped') && points.length !== 4)) return null;
  const height = Math.min(feature.height - (feature.minHeight || 0) - 0.5, feature.roofHeight ?? Math.min(3, feature.height * 0.22));
  return height > 0.15 ? { shape, height } : null;
}

function makeFacadeTexture(THREE) {
  const size = 32, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const window = x >= 11 && x < 21 && y >= 10 && y < 25;
    const frame = x >= 10 && x <= 21 && y >= 9 && y <= 25;
    const value = window ? (y < 13 ? 70 : 110) : frame ? 160 : y === 30 ? 218 : 245;
    const i = (y * size + x) * 4; pixels[i] = value; pixels[i + 1] = window ? value + 7 : value; pixels[i + 2] = window ? value + 10 : value; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// The handle is immediate; ready resolves after local data has been fetched and built.
// onStatus is also called for unavailable data, so scenery can fail without blocking flight.
export function createCityBuildings(THREE, scene, config) {
  const group = new THREE.Group(); group.name = 'Zurich OSM building footprints'; scene.add(group);
  const abort = new AbortController(), chunks = [], materials = [], textures = [];
  let quality = config.quality || 'medium', disposed = false, loaded = false, error = null, source = null;
  let count = 0, triangles = 0, heightSources = null, credit = null, creditBreak = null, lastPosition = null, sampleClock = 0;
  const ground = (x, z) => { const height = config.groundHeight?.(x, z); return Number.isFinite(height) ? height : 0; };
  const status = () => ({ phase: disposed ? 'disposed' : error ? 'unavailable' : loaded ? 'ready' : 'loading', buildings: count, chunks: chunks.length, triangles, visibleChunks: chunks.filter(chunk => chunk.group.visible && group.visible).length, source, heightSources, error });
  const notify = () => { if (!disposed) config.onStatus?.(status()); };

  function addCredit() {
    if (typeof document === 'undefined') return;
    const target = config.attributionTarget || document.body;
    credit = document.createElement('span'); credit.className = 'building-attribution';
    const osm = document.createElement('a'); osm.href = source.copyrightUrl; osm.textContent = 'Buildings © OpenStreetMap contributors';
    const license = document.createElement('a'); license.href = source.licenseUrl; license.textContent = 'ODbL';
    const data = document.createElement('a'); data.href = String(config.dataUrl || new URL('./data/lszh/buildings.json', import.meta.url)); data.textContent = 'data';
    for (const link of [osm, license, data]) { link.target = '_blank'; link.rel = 'noopener noreferrer'; link.style.cssText = 'color:inherit;text-decoration:none;pointer-events:auto;'; }
    credit.append(osm, ' · ', license, ' · ', data);
    const existing = target.matches?.('.geo-attribution') ? target : target.querySelector?.('.geo-attribution');
    if (existing) { creditBreak = document.createElement('br'); existing.append(creditBreak, credit); }
    else { credit.style.cssText = 'position:absolute;right:12px;bottom:55px;z-index:6;color:#e7eef1;background:rgba(12,25,32,.72);padding:4px 8px;border-radius:4px;font:10px/1.5 Arial,sans-serif;pointer-events:auto;'; target.append(credit); }
    credit.hidden = true;
  }

  function refreshVisibility() {
    group.visible = quality !== 'low' && loaded;
    const radius = quality === 'high' ? 12000 : 7000;
    for (const chunk of chunks) {
      const distance = lastPosition ? Math.hypot(chunk.x - lastPosition.x, chunk.z - lastPosition.z) : Infinity;
      chunk.group.visible = distance <= radius + CHUNK_SIZE;
      chunk.walls.castShadow = chunk.roof.castShadow = quality === 'high' && distance < 1800;
    }
    const visible = group.visible && chunks.some(chunk => chunk.group.visible);
    if (credit) credit.hidden = !visible;
    if (creditBreak) creditBreak.hidden = !visible;
  }

  function geometryFrom(buffer) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    triangles += buffer.positions.length / 9;
    return geometry;
  }

  function buildChunk(key, buildings, wallMaterial, roofMaterial) {
    const [cx, cz] = key.split(',').map(Number), x = (cx + 0.5) * CHUNK_SIZE, z = (cz + 0.5) * CHUNK_SIZE;
    const walls = { positions: [], uvs: [], colors: [] }, roofs = { positions: [], uvs: [], colors: [] }, records = [];
    const color = (value, fallback) => { const result = new THREE.Color(fallback); if (typeof value === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) result.set(value); return result; };
    function vertex(buffer, point, height, tint, u = 0, v = 0) { buffer.positions.push(point.x - x, height, point.y - z); buffer.uvs.push(u, v); buffer.colors.push(tint.r, tint.g, tint.b); }
    function triangle(buffer, a, b, c, tint) {
      if ((b.y - a.y) * (c.x - a.x) - (b.x - a.x) * (c.y - a.y) < 0) [b, c] = [c, b];
      for (const point of [a, b, c]) vertex(buffer, point, point.h, tint, point.x / 10, point.y / 10);
    }
    for (const building of buildings) {
      const feature = building.feature, rings = building.rings, contour = rings[0], holes = rings.slice(1);
      const anchorX = building.x, anchorZ = building.z, base = ground(anchorX, anchorZ);
      const low = feature.minHeight || 0, form = roofForm(feature, rings), top = base + feature.height, eave = top - (form?.height || 0);
      const wallTint = color(feature.wallColor, feature.building === 'church' ? 0xc4bdab : 0xc7c4b9), roofTint = color(feature.roofColor, 0x817d72);
      const wallStart = walls.positions.length, roofStart = roofs.positions.length;
      for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], length = Math.hypot(b.x - a.x, b.y - a.y);
        const ah = low ? base + low : Math.min(eave - 0.3, ground(a.x, a.y) - 0.5), bh = low ? base + low : Math.min(eave - 0.3, ground(b.x, b.y) - 0.5);
        // Each edge has its own vertices, so walls keep hard corners and the exact source direction.
        for (const [point, height, u, v] of [[a, ah, 0, 0], [b, eave, length / 6, (eave - bh) / 3.2], [b, bh, length / 6, 0], [a, ah, 0, 0], [a, eave, 0, (eave - ah) / 3.2], [b, eave, length / 6, (eave - bh) / 3.2]]) vertex(walls, point, height, wallTint, u, v);
      }
      const flatRoof = () => {
        const all = [...contour, ...holes.flat()];
        for (const indices of THREE.ShapeUtils.triangulateShape(contour, holes)) triangle(roofs, { ...all[indices[0]], h: top }, { ...all[indices[1]], h: top }, { ...all[indices[2]], h: top }, roofTint);
      };
      if (!form) flatRoof();
      else if (form.shape === 'gabled' || form.shape === 'hipped') {
        let points = contour.slice();
        const edge = i => Math.hypot(points[(i + 1) % 4].x - points[i].x, points[(i + 1) % 4].y - points[i].y);
        if ((edge(0) < edge(1)) !== (feature.roofOrientation === 'across')) points = [points[1], points[2], points[3], points[0]];
        const [a, b, c, d] = points.map(point => ({ ...point, h: eave }));
        let r0 = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2, h: top }, r1 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2, h: top };
        if (form.shape === 'hipped') { const dx = r1.x - r0.x, dz = r1.y - r0.y, inset = Math.min(0.3, edge(1) / Math.max(edge(0), 0.1) / 2); r0 = { ...r0, x: r0.x + dx * inset, y: r0.y + dz * inset }; r1 = { ...r1, x: r1.x - dx * inset, y: r1.y - dz * inset }; }
        for (const face of [[a, b, r1], [a, r1, r0], [d, r0, r1], [d, r1, c], [a, r0, d], [b, c, r1]]) triangle(roofs, ...face, roofTint);
      } else {
        const center = { x: contour.reduce((sum, point) => sum + point.x, 0) / contour.length, y: contour.reduce((sum, point) => sum + point.y, 0) / contour.length };
        const bands = form.shape === 'pyramidal' ? 1 : 6;
        let previous = contour.map(point => ({ ...point, h: eave }));
        for (let band = 1; band <= bands; band++) {
          const t = band / bands, radius = form.shape === 'pyramidal' ? 0 : form.shape === 'onion' ? Math.max(0, Math.cos(t * Math.PI / 2) * (1 + 0.35 * Math.sin(t * Math.PI))) : Math.cos(t * Math.PI / 2);
          const next = contour.map(point => ({ x: center.x + (point.x - center.x) * radius, y: center.y + (point.y - center.y) * radius, h: eave + form.height * (form.shape === 'dome' ? Math.sin(t * Math.PI / 2) : t) }));
          for (let i = 0; i < contour.length; i++) { const j = (i + 1) % contour.length; triangle(roofs, previous[i], previous[j], next[i], roofTint); if (band < bands) triangle(roofs, previous[j], next[j], next[i], roofTint); }
          previous = next;
        }
      }
      records.push({ x: anchorX, z: anchorZ, ground: base, grounded: !low, wallStart, wallEnd: walls.positions.length, roofStart, roofEnd: roofs.positions.length });
    }
    const holder = new THREE.Group(); holder.name = `OSM buildings ${key}`; holder.position.set(x, 0, z); holder.visible = false;
    const wallGeometry = geometryFrom(walls), roofGeometry = geometryFrom(roofs);
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial), roofMesh = new THREE.Mesh(roofGeometry, roofMaterial);
    wallMesh.name = 'Mapped footprints: walls'; roofMesh.name = 'Mapped footprints: roofs'; wallMesh.receiveShadow = roofMesh.receiveShadow = true;
    holder.add(wallMesh, roofMesh); group.add(holder);
    return { group: holder, walls: wallMesh, roof: roofMesh, records, x, z };
  }

  function resampleGround() {
    // The city DEM may arrive after the base DEM. Shift whole roofs with their ground
    // anchor, preserving mapped height without replacing or altering the terrain API.
    for (const chunk of chunks) {
      if (!chunk.group.visible) continue;
      const walls = chunk.walls.geometry.attributes.position, roofs = chunk.roof.geometry.attributes.position;
      let changed = false;
      for (const record of chunk.records) {
        const height = ground(record.x, record.z), delta = height - record.ground;
        const shifted = Math.abs(delta) >= 0.05;
        if (shifted) {
          for (let i = record.wallStart + 1; i < record.wallEnd; i += 3) walls.array[i] += delta;
          for (let i = record.roofStart + 1; i < record.roofEnd; i += 3) roofs.array[i] += delta;
        }
        let foundationChanged = false;
        if (record.grounded) {
          const eave = walls.array[record.wallStart + 4], uv = chunk.walls.geometry.attributes.uv.array;
          for (let i = record.wallStart; i < record.wallEnd; i += 3) {
            if (uv[i / 3 * 2 + 1] !== 0) continue;
            const foot = Math.min(eave - 0.3, ground(chunk.x + walls.array[i], chunk.z + walls.array[i + 2]) - 0.5);
            if (Math.abs(foot - walls.array[i + 1]) >= 0.05) { walls.array[i + 1] = foot; foundationChanged = true; }
          }
        }
        if (!shifted && !foundationChanged) continue;
        record.ground = height; changed = true;
      }
      if (changed) { walls.needsUpdate = roofs.needsUpdate = true; chunk.walls.geometry.computeBoundingSphere(); chunk.roof.geometry.computeBoundingSphere(); }
    }
  }

  async function load() {
    try {
      const dataset = config.data || await fetch(config.dataUrl || new URL('./data/lszh/buildings.json', import.meta.url), { signal: abort.signal }).then(response => { if (!response.ok) throw new Error(`Building data HTTP ${response.status}`); return response.json(); });
      if (disposed) return status();
      if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.features) || !dataset.source?.copyrightUrl) throw new Error('Unsupported building database');
      source = dataset.source; heightSources = dataset.statistics?.heightSources || null;
      group.userData.provenance = source; group.userData.heightPolicy = dataset.heightPolicy;
      const facade = makeFacadeTexture(THREE); textures.push(facade);
      const wallMaterial = new THREE.MeshStandardMaterial({ map: facade, color: 0xffffff, roughness: 0.93, vertexColors: true, side: THREE.DoubleSide });
      const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true, side: THREE.DoubleSide });
      materials.push(wallMaterial, roofMaterial);
      const bins = new Map();
      for (const feature of dataset.features) {
        if (!Number.isFinite(feature.height) || feature.height <= 0 || !Array.isArray(feature.rings) || !feature.rings.every(ring => ring.length >= 3 && ring.every(point => point.length === 2 && point.every(Number.isFinite)))) continue;
        const rings = feature.rings.map(ring => ring.map(point => { const projected = projectBuildingPoint(config.airport, point); return new THREE.Vector2(projected.x, projected.z); }));
        if (signedArea(rings[0]) < 0) rings[0].reverse();
        for (const hole of rings.slice(1)) if (signedArea(hole) > 0) hole.reverse();
        const x = rings[0].reduce((sum, point) => sum + point.x, 0) / rings[0].length, z = rings[0].reduce((sum, point) => sum + point.y, 0) / rings[0].length;
        const key = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push({ feature, rings, x, z }); count++;
      }
      for (const [key, buildings] of bins) {
        if (disposed) return status();
        chunks.push(buildChunk(key, buildings, wallMaterial, roofMaterial));
        if (chunks.length % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (disposed) return status();
      loaded = true; addCredit(); refreshVisibility(); notify();
    } catch (failure) { if (!disposed) { error = failure.message || String(failure); notify(); } }
    return status();
  }

  function update(state) {
    if (disposed || !state?.position) return;
    lastPosition = state.position; refreshVisibility();
    const now = globalThis.performance?.now() ?? Date.now();
    if (group.visible && now - sampleClock > 1400) { sampleClock = now; resampleGround(); }
  }
  function setQuality(value) { quality = ['low', 'medium', 'high'].includes(value) ? value : 'medium'; refreshVisibility(); }
  function dispose() {
    if (disposed) return;
    disposed = true; abort.abort(); scene.remove(group);
    for (const chunk of chunks) { chunk.walls.geometry.dispose(); chunk.roof.geometry.dispose(); }
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    credit?.remove(); creditBreak?.remove(); chunks.length = 0;
  }
  const ready = load();
  return { ready, update, setQuality, status, dispose, group };
}
