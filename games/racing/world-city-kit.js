import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const up = new THREE.Vector3(0, 1, 0);

// Architectural details are baked into a handful of material batches per city.
export function createCityBuilder({ scene, track, mobile = false, groundHeight, materials }) {
  const group = new THREE.Group(); group.name = `${track.id}-landmark-details`; scene.add(group);
  const batches = new Map(), reserved = [], shadowMeshes = [], cache = new Map(), ownedMaterials = new Set();
  let frame = new THREE.Matrix4();
  const scale = new THREE.Vector3(1, 1, 1);
  function material(color, options = {}) {
    const key = options.map ? null : `${color}:${JSON.stringify(options)}`;
    if (key && cache.has(key)) return cache.get(key);
    const value = new THREE.MeshStandardMaterial({ color, roughness: .78, ...options });
    ownedMaterials.add(value); if (key) cache.set(key, value); return value;
  }
  function surface(base, color, options = {}) {
    const value = base?.clone() || new THREE.MeshStandardMaterial();
    value.color.set(color); Object.assign(value, { roughness: .9 }, options); ownedMaterials.add(value); return value;
  }
  function setFrame(x, z, yaw = 0, y = groundHeight(x, z)) {
    frame = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), scale);
  }
  function reserve(x, z, radius, name) { reserved.push({ x, z, radius, name }); }
  function place(fraction, side, offset, width, depth, name) {
    const point = track.sample(track.length * fraction), yaw = point.heading;
    let x, z;
    for (let attempt = 0; attempt < 30; attempt++) {
      const distance = offset + attempt * 18;
      x = point.x + point.nx * side * distance; z = point.z + point.nz * side * distance;
      const c = Math.cos(yaw), s = Math.sin(yaw), margin = track.wallOffset + 3;
      const blocked = track.samples.some(p => {
        const dx = p.x - x, dz = p.z - z;
        return Math.abs(dx * c - dz * s) < width / 2 + margin && Math.abs(dx * s + dz * c) < depth / 2 + margin;
      });
      if (!blocked && !reserved.some(r => Math.hypot(x - r.x, z - r.z) < r.radius + Math.hypot(width, depth) / 2)) break;
    }
    setFrame(x, z, yaw); reserve(x, z, Math.hypot(width, depth) / 2 + 4, name);
    return { x, z, yaw };
  }
  function bake(geometry, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), scale));
    geometry.applyMatrix4(frame);
    if (mat.userData?.surface) {
      const positions = geometry.attributes.position, normals = geometry.attributes.normal, uv = geometry.attributes.uv;
      for (let i = 0; i < positions.count; i++) {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
        if (ny > nx && ny > nz) uv.setXY(i, positions.getX(i) / 3, positions.getZ(i) / 3);
        else if (nx > nz) uv.setXY(i, positions.getZ(i) / 3, positions.getY(i) / 3);
        else uv.setXY(i, positions.getX(i) / 3, positions.getY(i) / 3);
      }
    }
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(geometry);
  }
  function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) { bake(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  function cylinder(top, bottom, h, mat, x, y, z, segments = 16, rx = 0, ry = 0, rz = 0) {
    bake(new THREE.CylinderGeometry(top, bottom, h, mobile && Math.max(top, bottom) < .6 ? Math.min(segments, 6) : segments), mat, x, y, z, rx, ry, rz);
  }
  function beam(a, b, width, mat) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const midpoint = start.clone().add(end).multiplyScalar(.5);
    const geo = new THREE.CylinderGeometry(width / 2, width / 2, direction.length(), mobile ? 5 : 8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    bake(geo, mat, midpoint.x, midpoint.y, midpoint.z);
  }
  function sphere(rx, ry, rz, mat, x, y, z) {
    const geo = new THREE.SphereGeometry(1, mobile ? 16 : 24, mobile ? 10 : 16); geo.scale(rx, ry, rz); bake(geo, mat, x, y, z);
  }
  function sign(title, subtitle, w, h, x, y, z, color = '#23473d') {
    const canvas = document.createElement('canvas'); canvas.width = mobile ? 512 : 1024; canvas.height = Math.max(64, Math.round(canvas.width * h / w));
    const ctx = canvas.getContext('2d'), cw = canvas.width, ch = canvas.height;
    ctx.fillStyle = color; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#f3f0df'; ctx.textAlign = 'center';
    let size = ch * (subtitle ? .44 : .64); ctx.font = `600 ${size}px Arial, sans-serif`;
    while (ctx.measureText(title).width > cw * .91) { size *= .93; ctx.font = `600 ${size}px Arial, sans-serif`; }
    ctx.fillText(title, cw / 2, ch * (subtitle ? .52 : .73));
    if (subtitle) { ctx.font = `${ch * .2}px Arial, sans-serif`; ctx.fillText(subtitle, cw / 2, ch * .84); }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const mat = material('#ffffff', { map, roughness: .82 });
    bake(new THREE.PlaneGeometry(w, h), mat, x, y, z + .003);
    bake(new THREE.PlaneGeometry(w, h), mat, x, y, z - .003, 0, Math.PI); return mat;
  }
  function finish() {
    for (const [mat, parts] of batches) {
      const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
      if (!geometry) throw new Error(`Unable to batch ${track.id} architecture`);
      const mesh = new THREE.Mesh(geometry, mat); mesh.receiveShadow = true; mesh.castShadow = !mat.transparent;
      mesh.name = `${track.id}-architecture-${group.children.length}`; group.add(mesh);
      shadowMeshes.push(mesh);
    }
    for (const mat of ownedMaterials) if (!batches.has(mat)) mat.dispose();
    return { group, reserved, shadowMeshes, setQuality(quality) { shadowMeshes.forEach(mesh => { mesh.castShadow = quality !== 'low'; }); } };
  }
  return { group, materials, material, surface, setFrame, place, reserve, bake, box, cylinder, beam, sphere, sign, finish };
}
