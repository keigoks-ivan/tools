import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 兩輛救援車共用網格和材質。車體分材質合批，不加光源或下載貼圖。
export function createConvoy(scene) {
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0xc4c9bd, roughness: 0.72, metalness: 0.25 }),
    new THREE.MeshStandardMaterial({ color: 0x253339, roughness: 0.6, metalness: 0.65 }),
    new THREE.MeshStandardMaterial({ color: 0x101719, roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ color: 0x244351, roughness: 0.21, metalness: 0.75 }),
    new THREE.MeshStandardMaterial({ color: 0xb33728, roughness: 0.64, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0xffd394, emissive: 0xe6ab57, emissiveIntensity: 0.45, roughness: 0.4 }),
  ];
  const parts = materials.map(() => []);
  const add = (g, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
    if (g.index) { const flat = g.toNonIndexed(); g.dispose(); g = flat; }
    parts[m].push(g);
  };
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry);
  const round = (w, h, d, m, x, y, z) => add(new RoundedBoxGeometry(w, h, d, 1, 0.14), m, x, y, z);
  // 輪拱、斜切車頭與設備艙，輪廓不依靠一個大方塊。
  round(3.9, 2.9, 6.8, 0, 0, 2.5, -1.5);
  const cab = new THREE.Shape();
  cab.moveTo(-1.45, -1.45); cab.lineTo(1.45, -1.45); cab.lineTo(1.45, 0.65); cab.lineTo(0.68, 1.45); cab.lineTo(-1.45, 1.45); cab.closePath();
  const cg = new THREE.ExtrudeGeometry(cab, { depth: 3.7, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.09, bevelThickness: 0.09 });
  cg.rotateY(-Math.PI / 2); add(cg, 0, 1.85, 2.48, 4.3);
  box(3.5, 0.45, 10.7, 1, 0, 0.95, 0);
  box(3.9, 0.46, 0.35, 1, 0, 1.02, 5.85);
  box(3.4, 0.65, 0.11, 2, 0, 1.9, 5.76);
  for (let i = 0; i < 6; i++) box(3.1, 0.035, 0.045, 1, 0, 1.67 + i * 0.105, 5.84);
  box(3.35, 1.1, 0.08, 3, 0, 3.15, 5.38, -0.73);
  box(3.36, 0.06, 0.12, 1, 0, 2.79, 5.73);
  box(0.07, 1.1, 0.11, 1, 0, 3.15, 5.42, -0.73);
  for (const s of [-1, 1]) {
    box(0.06, 1.08, 1.8, 3, s * 1.95, 3.16, 3.9);
    box(0.07, 0.08, 2, 1, s * 1.99, 2.54, 3.9);
    box(0.07, 1.1, 0.045, 1, s * 1.99, 1.93, 4.63);
    box(0.09, 0.08, 0.38, 1, s * 2, 2.32, 3.15);
    box(0.12, 0.5, 0.35, 1, s * 2.24, 3.17, 4.72);
    box(0.32, 0.04, 0.06, 1, s * 2.07, 2.97, 4.72);
    box(0.06, 0.27, 6.2, 4, s * 1.97, 1.97, -1.5);
    for (const z of [-3.25, -1.25, 3.7]) {
      add(new THREE.CylinderGeometry(0.78, 0.78, 0.52, 12), 2, s * 1.8, 0.83, z, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.56, 12), 1, s * 1.83, 0.83, z, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.59, 8), 0, s * 1.85, 0.83, z, 0, 0, Math.PI / 2);
      box(0.5, 0.22, 1.95, 0, s * 1.77, 1.58, z);
    }
    for (const z of [-3.4, -1.8, -0.2]) {
      box(0.08, 0.76, 1.25, 1, s * 1.96, 3.14, z);
      box(0.09, 0.62, 1.12, 3, s * 1.99, 3.14, z);
    }
    box(0.64, 0.34, 0.12, 5, s * 1.28, 1.38, 5.85);
    box(0.44, 0.34, 0.1, 4, s * 1.45, 1.53, -4.94);
    box(0.08, 1.45, 0.49, 4, s * 1.98, 2.72, -4.24);
    box(0.09, 0.48, 1.41, 4, s * 2, 2.72, -4.24);
  }
  box(3.3, 0.18, 5.9, 1, 0, 4.06, -1.5);
  for (const z of [-3.6, -2.8, -2, -1.2, -0.4]) box(2.1, 0.07, 0.08, 0, 0, 4.18, z);
  round(1.5, 0.36, 1.3, 0, 0, 4.24, 0.9);
  box(2, 0.13, 0.34, 5, 0, 4.14, 3.54);
  box(0.035, 1.3, 0.035, 1, 1.22, 4.33, 2.1);
  // 後門縫、鉸鏈與踏板。
  box(0.055, 2.5, 0.05, 1, 0, 2.45, -4.98);
  box(3.48, 0.13, 0.36, 1, 0, 1.2, -5.13);
  for (const x of [-1.65, 1.65]) for (const y of [1.65, 2.9]) box(0.12, 0.28, 0.08, 1, x, y, -4.98);
  const geometries = parts.map(p => { const g = mergeGeometries(p); p.forEach(a => a.dispose()); return g; });
  const trucks = [0, 1].map(() => {
    const root = new THREE.Group();
    geometries.forEach((g, i) => { const m = new THREE.Mesh(g, materials[i]); m.castShadow = i !== 3 && i !== 5; m.receiveShadow = true; root.add(m); });
    scene.add(root); return root;
  });
  return { trucks, triangles: geometries.reduce((n, g) => n + g.attributes.position.count / 3, 0), geometries,
    update(pos, yaw, terrain, trail = null) { trucks.forEach((r, i) => {
      const pose = trail && trail(i);
      const z = pose ? pose.pos[1] : pos[1] - Math.cos(yaw) * i * 16, x = pose ? pose.pos[0] : pos[0] - Math.sin(yaw) * i * 16;
      r.position.set(x, terrain(x, z) + 0.02, z); r.rotation.y = pose ? pose.yaw : yaw;
    }); },
    dispose() { trucks.forEach(r => r.removeFromParent()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}

// 城外救援站的升降閘口：合批護欄、切角立柱和反光條，不加即時光源。
export function createEvacGate(scene, x, z, y) {
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xb6b6a8, roughness: 0.86 }),
    new THREE.MeshStandardMaterial({ color: 0x28363b, roughness: 0.65, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0xe2ad64, roughness: 0.5, emissive: 0x6d431f, emissiveIntensity: 0.25 }),
  ];
  const parts = mats.map(() => []), root = new THREE.Group(); root.position.set(x, y, z);
  const box = (w, h, d, m, px, py, pz) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(px, py, pz); parts[m].push(g); };
  for (const s of [-1, 1]) {
    const g = new RoundedBoxGeometry(2.4, 8, 3.6, 1, 0.38); g.translate(s * 8.5, 4, 0); parts[0].push(g.index ? g.toNonIndexed() : g);
    box(2.7, 0.45, 4, 1, s * 8.5, 7.75, 0);
    box(2.48, 0.85, 0.07, 2, s * 8.5, 5.5, 1.84);
    box(2.48, 0.15, 0.08, 1, s * 8.5, 5.5, 1.89);
    for (let i = 0; i < 6; i++) { box(0.15, 2, 0.18, 1, s * (10 + i * 2), 1.1, 0); box(2.2, 0.12, 0.18, 1, s * (10 + i * 2), 1.8, 0); }
  }
  const beam = new THREE.Group(); beam.position.set(-7.1, 3.2, 0);
  const bg = new THREE.BoxGeometry(14.2, 0.45, 0.55); bg.translate(7.1, 0, 0);
  beam.add(new THREE.Mesh(bg, mats[0]));
  const stripes = [];
  for (let i = 0; i < 9; i++) { const g = new THREE.BoxGeometry(0.6, 0.48, 0.58).toNonIndexed(); g.translate(0.8 + i * 1.55, 0, 0); stripes.push(g); }
  const sg = mergeGeometries(stripes); stripes.forEach(g => g.dispose()); beam.add(new THREE.Mesh(sg, mats[2]));
  parts.forEach((p, i) => { const g = mergeGeometries(p); p.forEach(a => a.dispose()); const mesh = new THREE.Mesh(g, mats[i]); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); });
  root.add(beam); scene.add(root);
  return { root, beam, open(v) { beam.rotation.z = Math.min(1, Math.max(0, v)) * Math.PI / 2; } };
}
