import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from './vendor/addons/utils/BufferGeometryUtils.js';

const clamp = THREE.MathUtils.clamp;
const asset = name => new URL(`./assets/${name}`, import.meta.url).href;

function resources(group) {
  const materials = new Set(), textures = new Set();
  let disposed = false;
  function collect(material) {
    if (!material) return;
    materials.add(material);
    Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
  }
  return {
    material(Type, options) { const m = new Type(options); collect(m); return m; },
    collect,
    texture(texture) { textures.add(texture); return texture; },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set();
      group.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(collect);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => { texture.dispose(); texture.source?.data?.close?.(); });
    },
  };
}

function contactShadow(group, store, width, length) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.translate(64, 128); ctx.scale(54, 110);
  const gradient = ctx.createRadialGradient(0, 0, .1, 0, 0, 1);
  gradient.addColorStop(0, 'rgba(0,0,0,.7)');
  gradient.addColorStop(.6, 'rgba(0,0,0,.5)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
  const texture = store.texture(new THREE.CanvasTexture(canvas));
  const material = store.material(THREE.MeshBasicMaterial, {
    map: texture, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.25, length * 1.1), material);
  shadow.name = 'contact-shadow'; shadow.rotation.x = -Math.PI / 2; shadow.position.y = .009;
  shadow.renderOrder = 1; group.add(shadow);
}

function controller({ group, store, chassis, wheels, paint, rearLights, dimensions, wheelRadius, model }) {
  const spinRotation = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0);
  let spin = 0, steer = 0, pitch = 0, roll = 0;
  let triangles = 0;
  group.traverse(node => { if (node.isMesh) triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3; });
  group.userData.model = { ...model, ...dimensions, wheelRadius, triangles: Math.round(triangles) };
  return {
    group, dimensions,
    setPaint(color) {
      for (const material of paint) {
        material.color.set(color);
        material.clearcoat = 1;
        material.clearcoatRoughness = .1;
      }
    },
    update(state = {}, dt = 1 / 60) {
      const step = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
      const speed = Number.isFinite(state.speed) ? state.speed : 0;
      const target = Number.isFinite(state.steerAngle) ? clamp(state.steerAngle, -.55, .55) : clamp(state.steering || 0, -1, 1) * .42;
      steer = THREE.MathUtils.damp(steer, target, 13, step);
      spin = (spin - speed * step / wheelRadius) % (Math.PI * 2);
      spinRotation.setFromAxisAngle(axis, spin);
      for (const item of wheels) {
        item.pivot.rotation.y = item.front ? steer : 0;
        item.spin.quaternion.copy(item.base).premultiply(spinRotation);
      }
      const longitudinal = Number.isFinite(state.longitudinalAccel) ? state.longitudinalAccel : (state.acceleration || 0);
      const lateral = Number.isFinite(state.lateralAccel) ? state.lateralAccel : 0;
      pitch = THREE.MathUtils.damp(pitch, clamp(-longitudinal * .0035, -.045, .045), 7, step);
      roll = THREE.MathUtils.damp(roll, clamp(lateral * .0045, -.052, .052), 7, step);
      chassis.rotation.x = pitch; chassis.rotation.z = roll;
      rearLights.forEach(light => { light.emissiveIntensity = .3 + clamp(state.brake || 0, 0, 1) * 2.4; });
    },
    dispose: () => store.dispose(),
  };
}

function mergeStaticParts(parent) {
  const batches = new Map();
  parent.children.filter(node => node.isMesh).forEach(node => {
    node.updateMatrix();
    const geometry = node.geometry.clone().applyMatrix4(node.matrix);
    geometry.deleteAttribute('uv');
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    if (!batches.has(node.material)) batches.set(node.material, []);
    batches.get(node.material).push({ node, geometry });
  });
  for (const [material, parts] of batches) {
    if (parts.length < 2) { parts[0].geometry.dispose(); continue; }
    const merged = mergeGeometries(parts.map(part => part.geometry));
    if (merged) {
      const node = new THREE.Mesh(merged, material);
      node.name = `${parent.name}-${material.name || material.type}`;
      node.castShadow = !material.transparent; node.receiveShadow = !material.transparent;
      parent.add(node);
      parts.forEach(part => { parent.remove(part.node); part.node.geometry.dispose(); });
    }
    parts.forEach(part => part.geometry.dispose());
  }
}

async function createConceptGT({ renderer, mobile }) {
  const decoder = new DRACOLoader();
  decoder.setDecoderPath(new URL('./vendor/draco/', import.meta.url).href);
  decoder.setWorkerLimit(mobile ? 1 : 2);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  let gltf;
  try { gltf = await loader.loadAsync(asset('car-concept-gt.glb')); }
  finally { decoder.dispose(); }
  const group = new THREE.Group(); group.name = 'Concept GT';
  const native = gltf.scene; group.add(native);
  const store = resources(group), paints = [], rearLights = [];
  native.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(native, true), size = bounds.getSize(new THREE.Vector3());
  const scale = 4.85 / size.z;
  native.scale.multiplyScalar(scale);
  group.updateMatrixWorld(true);
  bounds.setFromObject(native, true);
  const center = bounds.getCenter(new THREE.Vector3());
  native.position.set(-center.x, -bounds.min.y, -center.z);
  group.updateMatrixWorld(true);
  native.traverse(node => {
    if (!node.isMesh) return;
    const items = Array.isArray(node.material) ? node.material : [node.material];
    items.forEach(material => {
      store.collect(material);
      if (/^Paint 1/.test(material.name) && !paints.includes(material)) paints.push(material);
      if (material.name === 'Brakelight' && !rearLights.includes(material)) rearLights.push(material);
      if (material.name === 'Glass') {
        material.transmission = 0; material.transparent = true; material.opacity = mobile ? .36 : .47;
        material.roughness = .08; material.depthWrite = false;
      }
      if (material.name === 'Tireside' || material.name === 'Tiretread') material.roughness = .78;
      if (material.name === 'Headlight') material.emissiveIntensity = 1.7;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() || 1);
      }
    });
    node.castShadow = !items.some(material => material.transparent) && (!mobile || /Body|Wheel/.test(node.name));
    node.receiveShadow = true;
  });
  const wheels = [];
  for (const name of ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']) {
    const wheel = native.getObjectByName(name);
    if (!wheel) continue;
    group.attach(wheel);
    const pivot = new THREE.Group(); pivot.name = `${name}-steer`; pivot.position.copy(wheel.position);
    group.add(pivot); group.updateMatrixWorld(true); pivot.attach(wheel);
    const front = name.includes('Front');
    // The showcase source has its front wheels posed at 30 degrees; align their axle before driving.
    if (front) {
      const normal = new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
      wheel.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(normal.z, normal.x)));
    }
    wheels.push({ pivot, spin: wheel, front, base: wheel.quaternion.clone() });
  }
  const chassis = new THREE.Group(); chassis.name = 'suspension-response'; chassis.position.y = .48;
  group.add(chassis); group.updateMatrixWorld(true); chassis.attach(native);
  bounds.setFromObject(group, true); size.copy(bounds.getSize(new THREE.Vector3()));
  const wheelbase = Math.abs(wheels[0].pivot.position.z - wheels[2].pivot.position.z);
  const wheelRadius = wheels[0].pivot.position.y;
  const dimensions = { length: 4.85, width: size.x, height: size.y, wheelbase };
  contactShadow(group, store, dimensions.width, dimensions.length);
  return controller({ group, store, chassis, wheels, paint: paints, rearLights, dimensions, wheelRadius, model: {
    name: 'Concept GT', author: 'Eric Chadwick / Darmstadt Graphics Group GmbH', license: 'CC BY 4.0',
    source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept',
  } });
}

function createApexR({ mobile }) {
  const group = new THREE.Group(); group.name = 'APEX R';
  const store = resources(group);
  const paint = store.material(THREE.MeshPhysicalMaterial, { color: '#efc96b', metalness: .45, roughness: .27, clearcoat: 1, clearcoatRoughness: .1 });
  const carbon = store.material(THREE.MeshStandardMaterial, { color: '#1c2427', metalness: .28, roughness: .42 });
  const rubber = store.material(THREE.MeshStandardMaterial, { color: '#111516', roughness: .86 });
  const alloy = store.material(THREE.MeshStandardMaterial, { color: '#a2a9ad', metalness: 1, roughness: .23 });
  const brake = store.material(THREE.MeshStandardMaterial, { color: '#737c7e', metalness: .82, roughness: .48 });
  const caliper = store.material(THREE.MeshStandardMaterial, { color: '#d15228', metalness: .45, roughness: .32 });
  const glass = store.material(THREE.MeshPhysicalMaterial, { color: '#19313b', metalness: .22, roughness: .08, clearcoat: 1, transparent: true, opacity: mobile ? .83 : .76, depthWrite: false });
  const lamp = store.material(THREE.MeshStandardMaterial, { color: '#d7f4f3', emissive: '#c2e4ef', emissiveIntensity: 1.4, roughness: .22, metalness: .3 });
  const rearLamp = store.material(THREE.MeshStandardMaterial, { color: '#940c08', emissive: '#ec160b', emissiveIntensity: .3, roughness: .22 });
  const chassis = new THREE.Group(); chassis.name = 'suspension-response'; chassis.position.y = .46; group.add(chassis);
  function mesh(geometry, material, parent = chassis) {
    const item = new THREE.Mesh(geometry, material); item.castShadow = !material.transparent; item.receiveShadow = !material.transparent; parent.add(item); return item;
  }
  function box(w, h, l, material, x, y, z, parent = chassis) {
    const shape = new THREE.BoxGeometry(w, h, l), item = mesh(shape, material, parent);
    item.position.set(x, y - (parent === chassis ? .46 : 0), z); return item;
  }
  function line(points, radius, material, parent = chassis) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(point[0], point[1] - (parent === chassis ? .46 : 0), point[2])));
    return mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, 5, false), material, parent);
  }
  function roundedPanel(width, height, depth, material, x, y, z, radius = .04) {
    const shape = new THREE.Shape(), w = width / 2, h = height / 2, r = Math.min(radius, w, h);
    shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const item = mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 5 }), material);
    item.position.set(x, y - .46, z); return item;
  }
  // Loft a flowing upper shell; the lower side panels have real wheel arch cutouts.
  const controlStations = [
    [-2.14, .82, .60], [-1.93, .98, .78], [-1.60, 1.00, .87], [-1.32, .99, .91],
    [-.85, .91, .78], [-.15, .91, .73], [.48, .90, .70], [.94, .98, .81],
    [1.30, 1.00, .90], [1.65, .98, .82], [1.99, .90, .64], [2.14, .80, .52],
  ];
  const profileCurve = new THREE.CatmullRomCurve3(controlStations.map(p => new THREE.Vector3(...p)));
  const stations = profileCurve.getPoints(64).map(p => p.toArray());
  const shell = [], indices = [], rows = 33;
  for (let i = 0; i < stations.length; i++) {
    const [z, width, shoulder] = stations[i];
    for (let j = 0; j < rows; j++) {
      const u = j / (rows - 1) * 2 - 1;
      shell.push(u * width, shoulder - .46 + .055 * Math.cos(u * Math.PI / 2), z);
      if (i && j) { const a = i * rows + j, b = a - 1, c = a - rows, d = c - 1; indices.push(a, c, b, b, c, d); }
    }
  }
  const hullGeometry = new THREE.BufferGeometry(); hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shell, 3)); hullGeometry.setIndex(indices); hullGeometry.computeVertexNormals();
  mesh(hullGeometry, paint).name = 'sculpted-upper-shell';
  function section(z) {
    let i = stations.findIndex(item => item[0] >= z); if (i <= 0) i = 1;
    const a = stations[i - 1], b = stations[i], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)];
  }
  for (const side of [-1, 1]) {
    const vertices = [], face = [], count = 150;
    for (let i = 0; i <= count; i++) {
      const z = -2.14 + i / count * 4.28, [width, top] = section(z);
      let lower = .30;
      for (const wheelZ of [-1.31, 1.31]) {
        const distance = Math.abs(z - wheelZ);
        if (distance < .407) lower = Math.max(lower, .348 + Math.sqrt(.407 ** 2 - distance ** 2));
      }
      vertices.push(side * width, top - .46, z, side * (width - .014), lower - .46, z);
      if (i) { const a = i * 2, b = a - 2; face.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(side < 0 ? face : face.flatMap((_, i, array) => i % 3 === 0 ? [array[i], array[i + 2], array[i + 1]] : [])); geometry.computeVertexNormals(); mesh(geometry, paint);
    box(.11, .08, 1.65, carbon, side * .92, .29, 0);
    line([[side * .94, .55, -.84], [side * .93, .56, -.48], [side * .92, .64, -.36]], .018, carbon);
    box(.06, .30, .40, carbon, side * .89, .53, -.71);
    const intake = box(.068, .23, .32, carbon, side * .92, .55, -.62); intake.rotation.x = -.18;
    const mirrorStem = box(.24, .025, .035, carbon, side * .96, .91, .26);
    mirrorStem.rotation.z = side * .16;
    const mirror = mesh(new THREE.SphereGeometry(1, 16, 10), paint); mirror.scale.set(.12, .065, .09); mirror.position.set(side * 1.04, .94 - .46, .22);
  }
  // The curved greenhouse is narrower than the wide fenders and meets a low rear engine deck.
  const canopyControls = [[-.97, .59, .80], [-.67, .65, 1.14], [-.26, .65, 1.22], [.20, .64, 1.19], [.64, .71, .91], [.80, .73, .75]];
  const canopyStations = new THREE.CatmullRomCurve3(canopyControls.map(p => new THREE.Vector3(...p))).getPoints(40).map(p => p.toArray());
  const canopy = [], canopyIndices = [], segments = 24;
  for (let i = 0; i < canopyStations.length; i++) {
    const [z, width, peak] = canopyStations[i], base = section(z)[1] + .018;
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI;
      canopy.push(-Math.cos(angle) * width, base - .46 + (peak - base) * Math.sin(angle), z);
      if (i && j) { const a = i * (segments + 1) + j, b = a - 1, c = a - segments - 1, d = c - 1; canopyIndices.push(a, c, b, b, c, d); }
    }
  }
  const canopyGeometry = new THREE.BufferGeometry(); canopyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(canopy, 3)); canopyGeometry.setIndex(canopyIndices); canopyGeometry.computeVertexNormals(); mesh(canopyGeometry, glass).name = 'panoramic-coupe-cabin';
  const roofVertices = [], roofIndices = [];
  const roofStations = canopyStations.filter(([z]) => z > -.59 && z < .21);
  for (let i = 0; i < roofStations.length; i++) {
    const [z, width, peak] = roofStations[i], base = section(z)[1] + .018;
    for (let j = 0; j <= 12; j++) {
      const angle = Math.PI / 2 + (j / 12 - .5) * 1.3;
      roofVertices.push(-Math.cos(angle) * width, base - .46 + (peak - base) * Math.sin(angle) + .009, z);
      if (i && j) { const a = i * 13 + j, b = a - 1, c = a - 13, d = c - 1; roofIndices.push(a, c, b, b, c, d); }
    }
  }
  const roofGeometry = new THREE.BufferGeometry(); roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roofVertices, 3)); roofGeometry.setIndex(roofIndices); roofGeometry.computeVertexNormals(); mesh(roofGeometry, carbon);
  for (const side of [-1, 1]) {
    line(canopyStations.map(([z, w]) => [side * w, section(z)[1] + .025, z]), .022, carbon);
    line([[side * .71, .91, .64], [side * .51, 1.11, .37], [side * .27, 1.20, .22], [0, 1.22, .20]], .020, paint);
    line([[side * .59, .80, -.97], [side * .52, 1.07, -.72], [side * .30, 1.20, -.55], [0, 1.23, -.50]], .025, paint);
    line([[side * .65, .77, -.26], [side * .52, 1.08, -.26], [0, 1.23, -.26]], .012, carbon);
    line([[side * .91, .75, -.78], [side * .91, .70, -.42], [side * .91, .71, .15], [side * .92, .76, .69]], .006, carbon);
  }
  // Splitter, air intakes, paired LED signatures and a vented rear engine cover.
  for (const [z, direction] of [[-2.14, -1], [2.14, 1]]) {
    const [width, shoulder] = section(z), fascia = new THREE.Shape();
    fascia.moveTo(-width, .31 - .46);
    fascia.lineTo(width, .31 - .46); fascia.lineTo(width, shoulder - .46);
    for (let i = 24; i >= 0; i--) {
      const u = i / 24 * 2 - 1;
      fascia.lineTo(u * width, shoulder - .46 + .055 * Math.cos(u * Math.PI / 2));
    }
    fascia.closePath();
    const skin = mesh(new THREE.ExtrudeGeometry(fascia, { depth: .10, bevelEnabled: true, bevelThickness: .015, bevelSize: .016, bevelSegments: 3, steps: 1 }), paint);
    skin.position.z = direction < 0 ? z - .015 : z - .10;
  }
  box(1.74, .075, .24, carbon, 0, .29, 2.05);
  roundedPanel(1.42, .17, .035, carbon, 0, .42, 2.155, .07);
  roundedPanel(1.38, .17, .03, carbon, 0, .49, -2.205, .07);
  for (let i = -9; i <= 9; i++) box(.011, .13, .008, brake, i * .065, .49, -2.214);
  for (const side of [-1, 1]) {
    line([[side * .22, .64, 2.03], [side * .45, .67, 1.99], [side * .77, .67, 1.86]], .023, lamp);
    line([[side * .25, .62, 2.025], [side * .46, .63, 1.99], [side * .76, .63, 1.85]], .012, lamp);
    box(.12, .18, .10, paint, side * .46, .41, 2.13);
    box(.09, .16, .09, carbon, side * .73, .43, 2.14);
    line([[side * .78, .64, -2.02], [side * .65, .65, -2.20], [side * .15, .65, -2.20]], .018, rearLamp);
    const exhaust = mesh(new THREE.CylinderGeometry(.052, .052, .12, 16, 1, true), alloy); exhaust.rotation.x = Math.PI / 2; exhaust.position.set(side * .38, .37 - .46, -2.22);
    box(.06, .24, .16, carbon, side * .59, .35, -2.12);
    for (let j = 0; j < 4; j++) box(.26, .014, .035, carbon, side * .48, .87 + j * .005, -1.36 + j * .09);
  }
  box(1.54, .10, .31, carbon, 0, .28, -1.99);
  for (let i = -2; i <= 2; i++) box(.018, .15, .31, carbon, i * .28, .31, -1.99);
  // Swan-neck rear wing with shaped aerofoil and vertical endplates.
  for (const side of [-1, 1]) {
    line([[side * .59, .77, -1.72], [side * .60, 1.21, -1.48], [side * .62, 1.30, -1.83]], .027, carbon);
    box(.024, .16, .44, carbon, side * 1.0, 1.30, -1.86);
  }
  const wingVertices = [], wingIndices = [], wingSections = 24;
  for (let i = 0; i <= 8; i++) {
    const x = -1 + i / 4;
    for (let j = 0; j <= wingSections; j++) {
      const angle = j / wingSections * Math.PI * 2;
      wingVertices.push(x, 1.30 - .46 + Math.sin(angle) * .022 + .018 * Math.cos(angle), -1.86 + Math.cos(angle) * .215);
      if (i && j) { const a = i * (wingSections + 1) + j, b = a - 1, c = a - wingSections - 1, d = c - 1; wingIndices.push(a, c, b, b, c, d); }
    }
  }
  const wingGeometry = new THREE.BufferGeometry(); wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wingVertices, 3)); wingGeometry.setIndex(wingIndices); wingGeometry.computeVertexNormals(); mesh(wingGeometry, carbon);
  const stripe = box(.14, .009, 1.15, carbon, 0, .775, 1.2); stripe.rotation.x = -.028;
  const wheels = [];
  for (const z of [-1.31, 1.31]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.name = `${z > 0 ? 'front' : 'rear'}-${side}-steer`; pivot.position.set(side * .92, .348, z); group.add(pivot);
      const spin = new THREE.Group(); spin.name = 'wheel-spin'; pivot.add(spin);
      const tire = mesh(new THREE.TorusGeometry(.274, .074, 10, mobile ? 28 : 40), rubber, spin); tire.rotation.y = Math.PI / 2; tire.scale.z = 1.35;
      for (const offset of [-.105, .105]) {
        const bead = mesh(new THREE.TorusGeometry(.244, .009, 5, 32), rubber, spin); bead.rotation.y = Math.PI / 2; bead.position.x = offset;
      }
      const rim = mesh(new THREE.CylinderGeometry(.232, .232, .18, mobile ? 24 : 36, 1, true), alloy, spin); rim.rotation.z = Math.PI / 2;
      const disc = mesh(new THREE.CylinderGeometry(.185, .185, .015, 28), brake, spin); disc.rotation.z = Math.PI / 2; disc.position.x = side * .06;
      const pad = box(.06, .105, .055, caliper, side * .08, .47, -.155, pivot); pad.position.y = .10; pad.position.z = -.13;
      const faceX = side * .11;
      for (let i = 0; i < 10; i++) {
        const angle = i / 10 * Math.PI * 2;
        const spoke = mesh(new THREE.BoxGeometry(.021, .021, .19), alloy, spin);
        spoke.position.set(faceX, Math.sin(angle) * .13, Math.cos(angle) * .13); spoke.rotation.x = -angle;
        const bolt = mesh(new THREE.SphereGeometry(.009, 5, 4), alloy, spin); bolt.position.set(faceX + side * .011, Math.sin(angle) * .047, Math.cos(angle) * .047);
      }
      for (let i = 0; i < 20; i++) {
        const angle = i / 20 * Math.PI * 2;
        const hole = mesh(new THREE.CircleGeometry(.008, 5), carbon, spin); hole.rotation.y = side * Math.PI / 2;
        hole.position.set(side * .069, Math.sin(angle) * .15, Math.cos(angle) * .15);
      }
      const hub = mesh(new THREE.CylinderGeometry(.048, .048, .055, 12), carbon, spin); hub.rotation.z = Math.PI / 2; hub.position.x = faceX;
      for (let j = 0; j < (mobile ? 20 : 32); j++) {
        const angle = j / (mobile ? 20 : 32) * Math.PI * 2;
        const groove = mesh(new THREE.BoxGeometry(.10, .002, .015), carbon, spin); groove.position.set(0, Math.sin(angle) * .347, Math.cos(angle) * .347); groove.rotation.x = -angle;
      }
      wheels.push({ pivot, spin, front: z > 0, base: spin.quaternion.clone() });
      const liner = [];
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; liner.push([side * .955, .348 + Math.sin(a) * .405, z + Math.cos(a) * .405]); }
      line(liner, .018, carbon);
      mergeStaticParts(spin); mergeStaticParts(pivot);
    }
  }
  mergeStaticParts(chassis);
  contactShadow(group, store, 2.15, 4.34);
  return controller({ group, store, chassis, wheels, paint: [paint], rearLights: [rearLamp], dimensions: { length: 4.34, width: 2.32, height: 1.43, wheelbase: 2.62 }, wheelRadius: .348, model: {
    name: 'APEX R', author: 'APEX project', license: 'Original procedural game artwork',
  } });
}

export async function createExtraCar({ renderer, mobile = false, vehicle }) {
  if (vehicle === 'conceptGT') return createConceptGT({ renderer, mobile });
  if (vehicle === 'apexR') return createApexR({ mobile });
  throw new RangeError(`Unknown vehicle: ${vehicle}`);
}
