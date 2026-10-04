import * as THREE from 'three';
import { TABLE, clamp } from './physics.mjs';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);

function mesh(geometry, material, parent, x, y, z, sx = 1, sy = sx, sz = sx) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function box(parent, material, x, y, z, sx, sy, sz) { return mesh(boxGeometry, material, parent, x, y, z, sx, sy, sz); }
function line(parent, a, b, color = 0xcfd7c0, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  const object = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(object);
  return object;
}
function textTexture(text, color = '#e3e6d0', width = 1024, height = 256) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${height * 0.73}px Arial`; ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function sign(parent, text, x, y, z, w, h, color) {
  const material = new THREE.MeshBasicMaterial({ map: textTexture(text, color), transparent: true, depthWrite: false });
  return mesh(new THREE.PlaneGeometry(w, h), material, parent, x, y, z);
}
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#b6aa8b'; ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    ctx.fillStyle = row % 2 ? '#c1b69b' : '#bfb295'; ctx.fillRect(0, row * 32, 256, 31);
    ctx.fillStyle = '#a3967b'; ctx.fillRect((row % 3) * 80 + 20, row * 32, 1, 32);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = 'rgba(113,96,64,.07)'; ctx.beginPath();
      ctx.moveTo(0, row * 32 + i * 1.7); ctx.lineTo(256, row * 32 + i * 1.7 + 2); ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 10); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildRoom(scene) {
  const cream = mat(0xc5c3ac), green = mat(0x667964), dark = mat(0x38473c), metal = mat(0x353d37, { roughness: 0.5 });
  box(scene, mat(0xffffff, { map: floorTexture() }), 0, -0.045, -0.5, 12, 0.08, 15);
  box(scene, mat(0x718779, { roughness: 0.94 }), 0, 0.001, 0, 5.8, 0.018, 8.5);
  const boundary = mat(0xc3cfb5);
  for (const x of [-2.62, 2.62]) box(scene, boundary, x, 0.012, 0, 0.022, 0.006, 7.9);
  for (const z of [-3.95, 3.95]) box(scene, boundary, 0, 0.012, z, 5.25, 0.006, 0.022);
  box(scene, cream, 0, 2.35, -5.1, 11, 4.7, 0.15);
  box(scene, green, 0, 0.83, -5, 11, 1.66, 0.06);
  box(scene, dark, 0, 0.12, -4.95, 11, 0.2, 0.1);
  for (let x = -5; x <= 5; x += 0.25) box(scene, mat(x % 1 === 0 ? 0x6b7c68 : 0x60705d), x, 0.84, -4.96, 0.025, 1.55, 0.025);
  sign(scene, 'RALLY', 0, 2.23, -4.98, 3.1, 0.68, '#5b6e53');
  sign(scene, 'TABLE TENNIS CLUB', 0, 1.85, -4.97, 2.1, 0.19, '#7d8770');
  sign(scene, '01', -3.8, 2.55, -4.97, 0.54, 0.4, '#66785f');
  box(scene, cream, 4.65, 2.35, 0, 0.2, 4.7, 12);
  box(scene, green, 4.53, 0.78, 0, 0.04, 1.55, 12);
  box(scene, cream, -4.65, 0.76, 0, 0.2, 1.55, 12);
  box(scene, cream, -4.65, 4.15, 0, 0.2, 1.1, 12);
  const glass = new THREE.MeshBasicMaterial({ color: 0xdfebda, transparent: true, opacity: 0.38 });
  box(scene, glass, -4.64, 2.5, 0, 0.025, 1.8, 12);
  for (let z = -5; z <= 5; z += 1.7) {
    box(scene, cream, -4.63, 2.5, z, 0.25, 2.05, 0.12);
    box(scene, dark, -4.47, 2.5, z, 0.035, 1.8, 0.045);
  }
  box(scene, cream, -4.59, 2.5, 0, 0.23, 0.08, 12);
  // Daylight falling through the side windows, without an image dependency.
  const sunPatch = new THREE.MeshBasicMaterial({ color: 0xe2ddb6, transparent: true, opacity: 0.16, depthWrite: false });
  for (let z = -4; z < 5; z += 1.72) {
    const patch = mesh(new THREE.PlaneGeometry(2.9, 1.45), sunPatch, scene, -2.78, 0.025, z);
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = -0.48;
  }
  for (const x of [-3.2, 3.2]) {
    box(scene, metal, x, 0.29, -3.8, 1.5, 0.065, 0.42);
    box(scene, mat(0x9a8060), x, 0.39, -3.8, 1.58, 0.12, 0.47);
    for (const offset of [-0.57, 0.57]) box(scene, metal, x + offset, 0.17, -3.8, 0.065, 0.34, 0.35);
  }
  box(scene, mat(0xd8d6bf), -3.37, 0.48, -3.79, 0.49, 0.07, 0.37);
  const bag = mesh(new THREE.CapsuleGeometry(0.16, 0.28, 6, 12), mat(0x35443f), scene, 3.17, 0.6, -3.8);
  bag.rotation.z = Math.PI / 2; bag.scale.z = 0.85;
  mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 16), mat(0x7197a1, { roughness: 0.28 }), scene, -3.88, 0.57, -3.8);
  box(scene, dark, 4.41, 1.8, -1.8, 0.1, 1.55, 2.0);
  for (let z = -2.57; z <= -1; z += 0.39) box(scene, mat(0x596654), 4.33, 1.8, z, 0.065, 1.44, 0.016);
  for (const z of [-2.7, 1.6]) {
    box(scene, metal, 0, 4.15, z, 5.9, 0.04, 0.04);
    for (const x of [-1.75, 1.75]) box(scene, mat(0xe5e6d2, { emissive: 0xe5e6d2, emissiveIntensity: 0.6 }), x, 4.09, z, 1.1, 0.065, 0.16);
  }
}

function buildTable(scene) {
  const green = mat(0x245f60, { roughness: 0.48 }), frame = mat(0x263c38, { roughness: 0.53 }), white = mat(0xe6e8d7);
  box(scene, green, 0, TABLE.height - 0.025, 0, 1.525, 0.05, 2.74);
  box(scene, frame, 0, TABLE.height - 0.09, 0, 1.49, 0.09, 2.68);
  for (const x of [-0.7525, 0.7525]) box(scene, white, x, TABLE.height + 0.001, 0, 0.018, 0.003, 2.74);
  for (const z of [-1.36, 1.36]) box(scene, white, 0, TABLE.height + 0.001, z, 1.525, 0.003, 0.018);
  box(scene, white, 0, TABLE.height + 0.001, 0, 0.006, 0.003, 2.74);
  for (const z of [-0.87, 0.87]) {
    for (const x of [-0.56, 0.56]) {
      box(scene, frame, x, 0.35, z, 0.055, 0.65, 0.055);
      const wheel = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), mat(0x1b2420), scene, x, 0.06, z);
      wheel.rotation.z = Math.PI / 2;
    }
    box(scene, frame, 0, 0.3, z, 1.14, 0.045, 0.045);
  }
  box(scene, frame, 0, 0.45, 0, 0.04, 0.05, 1.82);
  const net = new THREE.Group(); scene.add(net);
  const netMaterial = new THREE.MeshBasicMaterial({ color: 0xe5ebda, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
  mesh(new THREE.PlaneGeometry(1.73, TABLE.net), netMaterial, net, 0, TABLE.height + TABLE.net / 2, 0);
  for (let x = -0.86; x < 0.87; x += 0.025) line(net, vector(x, TABLE.height, 0), vector(x, TABLE.height + TABLE.net, 0), 0xd6e2d0, 0.44);
  for (let y = TABLE.height; y < TABLE.height + TABLE.net; y += 0.021) line(net, vector(-0.865, y, 0), vector(0.865, y, 0), 0xd6e2d0, 0.44);
  box(net, white, 0, TABLE.height + TABLE.net, 0, 1.75, 0.012, 0.01);
  for (const x of [-0.85, 0.85]) {
    box(net, frame, x, TABLE.height + 0.045, 0, 0.026, 0.24, 0.026);
    box(net, frame, x * 0.95, TABLE.height - 0.029, 0, 0.11, 0.017, 0.075);
  }
  const label = sign(scene, 'RALLY', 0, TABLE.height - 0.093, 1.376, 0.25, 0.047, '#b7c3ae');
  label.material.depthWrite = true;
}

function createAthlete(scene, side, color) {
  const root = new THREE.Group(); root.rotation.y = side === 1 ? Math.PI : 0; root.position.z = side * 1.94; scene.add(root);
  const skin = mat(side === 1 ? 0xc39573 : 0xd1a581, { roughness: 0.86 });
  const shirt = mat(color, { roughness: 0.9 });
  const shorts = mat(0x273733), white = mat(0xe3e8d9), hairMat = mat(0x252b25);
  const torso = new THREE.Group(); root.add(torso);
  const points = [[0.13, 0], [0.147, 0.08], [0.18, 0.26], [0.21, 0.4], [0.165, 0.45]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = mesh(new THREE.LatheGeometry(points, 28), shirt, torso, 0, 0.86, 0, 1, 1, 0.64);
  mesh(sphereGeometry, skin, torso, 0, 1.342, 0, 0.07, 0.095, 0.069);
  mesh(sphereGeometry, skin, torso, 0, 1.535, 0.01, 0.106, 0.145, 0.099);
  const hair = mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat, torso, 0, 1.582, 0.001, 0.11, 0.108, 0.104);
  mesh(sphereGeometry, hairMat, torso, 0, 1.55, -0.049, 0.101, 0.11, 0.062);
  mesh(sphereGeometry, skin, torso, 0, 1.534, 0.107, 0.021, 0.032, 0.028);
  for (const x of [-0.104, 0.104]) mesh(sphereGeometry, skin, torso, x, 1.535, 0, 0.02, 0.034, 0.023);
  for (const x of [-0.04, 0.04]) {
    mesh(sphereGeometry, white, torso, x, 1.569, 0.096, 0.02, 0.009, 0.008);
    mesh(sphereGeometry, hairMat, torso, x, 1.569, 0.104, 0.007, 0.008, 0.003);
    box(torso, hairMat, x, 1.587, 0.096, 0.034, 0.005, 0.007);
  }
  mesh(sphereGeometry, mat(0x9e6f59), torso, 0, 1.476, 0.099, 0.026, 0.004, 0.005);
  mesh(new THREE.TorusGeometry(0.077, 0.011, 6, 24), mat(0x263e36), torso, 0, 1.317, 0, 1, 1, 0.82).rotation.x = Math.PI / 2;
  const chestStripe = box(torso, white, 0, 1.185, 0.124, 0.32, 0.022, 0.004); chestStripe.rotation.z = -0.08;
  box(torso, mat(0xc5df8e), -0.115, 1.232, 0.122, 0.029, 0.016, 0.006);
  box(torso, mat(0x162b25), 0, 1.192, -0.128, 0.07, 0.12, 0.005);
  for (const x of [-0.105, 0.105]) mesh(new THREE.CylinderGeometry(0.107, 0.108, 0.24, 20), shorts, root, x, 0.773, 0, 1, 1, 0.86);
  const limbs = [];
  function segment(material, radius) {
    const object = mesh(cylinderGeometry, material, root, 0, 0, 0); limbs.push(object);
    return { object, radius };
  }
  function connect(seg, a, b) {
    const delta = new THREE.Vector3().subVectors(b, a);
    seg.object.position.copy(a).add(b).multiplyScalar(0.5);
    seg.object.scale.set(seg.radius, delta.length(), seg.radius);
    seg.object.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
  }
  const legs = [-1, 1].map(sign => ({ sign, thigh: segment(skin, 0.065), calf: segment(skin, 0.047),
    knee: mesh(sphereGeometry, skin, root, 0, 0, 0, 0.062), sock: segment(white, 0.05),
    shoe: mesh(sphereGeometry, white, root, 0, 0, 0, 0.075, 0.056, 0.139),
    sole: box(root, mat(0x334b42), 0, 0, 0, 0.13, 0.021, 0.22) }));
  const arms = [-1, 1].map(sign => ({ sign, upper: segment(skin, 0.039), fore: segment(skin, 0.032), sleeve: segment(shirt, 0.063),
    elbow: mesh(sphereGeometry, skin, root, 0, 0, 0, 0.038), hand: mesh(sphereGeometry, skin, root, 0, 0, 0, 0.032, 0.05, 0.035) }));
  const paddle = new THREE.Group(); root.add(paddle);
  const rubber = mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.012, 40), mat(0xa84636, { roughness: 0.95 }), paddle, 0, 0.065, 0);
  rubber.rotation.x = Math.PI / 2; rubber.scale.z = 1.12;
  const back = mesh(new THREE.CylinderGeometry(0.087, 0.087, 0.004, 40), mat(0x222a25), paddle, 0, 0.065, -0.009);
  back.rotation.x = Math.PI / 2; back.scale.z = 1.12;
  box(paddle, mat(0xb79768), 0, -0.055, 0, 0.026, 0.105, 0.022);
  let swingAt = -100, swingPoint = null, swingSpin = 1, previousX = 0;
  const handWorld = new THREE.Vector3();
  return {
    root,
    strike(time, position, spin) { swingAt = time; swingPoint = position; swingSpin = spin; },
    update(time, dt, x, ball, active) {
      const velocity = dt > 0 ? (x - previousX) / dt : 0; previousX = x;
      root.position.x = x;
      const step = Math.sin(time * 17) * Math.min(Math.abs(velocity) * 0.023, 0.055);
      const crouch = active ? 0.08 : 0.025;
      const breathe = Math.sin(time * 2.6 + side) * 0.006;
      torso.position.y = -crouch + breathe;
      torso.rotation.x = active ? 0.17 : 0.07;
      torso.rotation.z = clamp(-velocity * 0.035, -0.1, 0.1);
      const age = time - swingAt;
      const swing = age >= 0 && age < 0.5;
      torso.rotation.y = swing ? Math.sin(age / 0.5 * Math.PI) * (swingSpin < 0 ? 0.17 : -0.3) : clamp((ball?.x - x || 0) * 0.18, -0.2, 0.2);
      for (const leg of legs) {
        const s = leg.sign;
        const lift = s * step;
        const hip = vector(s * 0.105, 0.82 - crouch, 0);
        const knee = vector(s * 0.2, 0.44 - crouch * 0.25, 0.16 + s * 0.045);
        const ankle = vector(s * 0.26, 0.12 + Math.max(0, lift), 0.025 + s * 0.06);
        connect(leg.thigh, hip, knee); connect(leg.calf, knee, ankle);
        leg.knee.position.copy(knee); connect(leg.sock, ankle, ankle.clone().add(vector(0, 0.13, -0.016)));
        leg.shoe.position.copy(ankle).add(vector(0, -0.045, 0.04)); leg.shoe.rotation.y = -s * 0.16;
        leg.sole.position.copy(leg.shoe.position).add(vector(0, -0.025, 0.018)); leg.sole.rotation.y = -s * 0.16;
      }
      let hand = vector(-0.31, 1.00 - crouch, 0.36);
      if (ball && ball.hitter === -side && ball.received) {
        const localX = (ball.x - x) * -side;
        hand.x = clamp(localX, -0.49, 0.4);
        hand.y = clamp(ball.y, 0.85, 1.15) - 0.015;
        hand.z = clamp((root.position.z - ball.z) * side, 0.2, 0.63);
      }
      if (swing && swingPoint) {
        const contact = vector((swingPoint.x - x) * -side, swingPoint.y - 0.05, (root.position.z - swingPoint.z) * side);
        const recovery = clamp(age / 0.46, 0, 1);
        hand.copy(contact).lerp(vector(0.13, swingSpin < 0 ? 0.89 : 1.35, 0.42), Math.sin(recovery * Math.PI / 2));
      }
      for (const arm of arms) {
        const shoulder = vector(arm.sign * 0.195, 1.245 - crouch, 0.023);
        const target = arm.sign === -1 ? hand : vector(0.29, 1.03 - crouch + breathe, 0.26);
        // Bend the elbow outwards and behind the hand, keeping a natural ready pose.
        const midpoint = shoulder.clone().add(target).multiplyScalar(0.5);
        const elbow = midpoint.add(vector(arm.sign * 0.13, -0.11, -0.075));
        connect(arm.upper, shoulder, elbow); connect(arm.fore, elbow, target);
        connect(arm.sleeve, shoulder, shoulder.clone().lerp(elbow, 0.43));
        arm.elbow.position.copy(elbow); arm.hand.position.copy(target);
      }
      paddle.position.copy(hand).add(vector(0, 0.035, 0.009));
      paddle.rotation.set(swingSpin < 0 ? -0.34 : 0.24, swing ? -0.26 : 0.1, -0.18);
      root.updateMatrixWorld(); handWorld.copy(hand); root.localToWorld(handWorld);
    },
    handWorld,
  };
}

export function createScene(canvas, court, onContextLost) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, 1.65);
  renderer.setPixelRatio(pixelRatio); renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.14;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbec8b4); scene.fog = new THREE.Fog(0xbec8b4, 9, 20);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 40);
  scene.add(new THREE.HemisphereLight(0xe8efe4, 0x576147, 2.4));
  const sun = new THREE.DirectionalLight(0xffeed0, 3.4); sun.position.set(-4, 7, 2); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 20;
  sun.shadow.normalBias = 0.015; sun.shadow.bias = -0.00015; sun.shadow.radius = 3; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdce9eb, 0.75); fill.position.set(4, 4, -3); scene.add(fill);
  buildRoom(scene); buildTable(scene);
  const player = createAthlete(scene, 1, 0xd7e0c5), opponent = createAthlete(scene, -1, 0x9e604f);
  const ball = mesh(sphereGeometry, mat(0xffefd2, { roughness: 0.6, emissive: 0xffb840, emissiveIntensity: 0.22 }), scene, 0, 1.2, 1, 0.029);
  ball.material.depthTest = false; ball.renderOrder = 5;
  const ballShadow = mesh(new THREE.CircleGeometry(0.033, 24), new THREE.MeshBasicMaterial({ color: 0x1e3028, transparent: true, opacity: 0.33, depthWrite: false }), scene, 0, TABLE.height + 0.004, 0);
  ballShadow.rotation.x = -Math.PI / 2;
  const target = mesh(new THREE.RingGeometry(0.065, 0.079, 40), new THREE.MeshBasicMaterial({ color: 0xd3ef85, transparent: true, opacity: 0.76, depthWrite: false }), scene, 0, TABLE.height + 0.005, -0.91);
  target.rotation.x = -Math.PI / 2;
  const spot = mesh(new THREE.CircleGeometry(0.06, 32), new THREE.MeshBasicMaterial({ color: 0xd3ef85, transparent: true, opacity: 0.1, depthWrite: false }), scene, 0, TABLE.height + 0.004, -0.91);
  spot.rotation.x = -Math.PI / 2;
  const trailPositions = new Float32Array(36 * 3);
  const trailGeometry = new THREE.BufferGeometry(); trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xf9f4ce, transparent: true, opacity: 0.3 }));
  trail.frustumCulled = false; scene.add(trail);
  const history = [];
  const impact = mesh(new THREE.RingGeometry(0.025, 0.032, 32), new THREE.MeshBasicMaterial({ color: 0xe2f4b1, transparent: true, opacity: 0, depthWrite: false }), scene, 0, TABLE.height + 0.009, 0);
  impact.rotation.x = -Math.PI / 2;
  let impactTime = -10, perfTime = 0, frames = 0;
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), intersection = new THREE.Vector3();
  const movePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.77);
  function resize() {
    const rect = court.getBoundingClientRect(); camera.aspect = rect.width / rect.height;
    const mobile = rect.width < 600;
    camera.position.set(0.2, mobile ? 3.95 : 3.3, mobile ? 6.85 : 5.8);
    camera.fov = mobile ? 42 : 39; camera.lookAt(0, 0.74, -0.28); camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }
  new ResizeObserver(resize).observe(court); resize();
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onContextLost(); });
  return {
    scene, camera, renderer, player, opponent,
    moveTarget(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera); ray.ray.intersectPlane(movePlane, intersection);
      return clamp(intersection.x, -1.1, 1.1);
    },
    event(event, time) {
      if (event.type === 'bounce') { impact.position.set(event.x, TABLE.height + 0.008, event.z); impactTime = time; }
      if (event.type === 'hit' || event.type === 'serve') {
        const avatar = event.side === 1 ? player : opponent;
        const p = event.type === 'serve' ? { x: avatar.root.position.x, y: 1.15, z: event.side * 1.28 } : event;
        avatar.strike(time, p, event.spin || 0);
        history.length = 0;
      }
    },
    render(match, time, dt, aim, paused) {
      const b = match.ball;
      const active = match.phase === 'rally';
      player.update(time, dt, match.playerX, b, active); opponent.update(time, dt, match.opponentX, b, active);
      if (b && active) {
        ball.visible = true; ball.position.set(b.x, b.y, b.z); ball.rotation.x += dt * b.spin * 12;
        const onTable = Math.abs(b.x) < TABLE.halfWidth && Math.abs(b.z) < TABLE.halfLength;
        ballShadow.position.set(b.x, onTable ? TABLE.height + 0.007 : 0.025, b.z);
        ballShadow.visible = true; ballShadow.scale.setScalar(1 + Math.max(0, b.y - TABLE.height) * 0.4);
        if (!paused) history.unshift(ball.position.clone());
        history.length = Math.min(history.length, 15);
        for (let i = 0; i < 36; i++) (history[Math.min(i, history.length - 1)] || ball.position).toArray(trailPositions, i * 3);
        trailGeometry.attributes.position.needsUpdate = true; trailGeometry.setDrawRange(0, history.length); trail.visible = true;
      } else {
        trail.visible = false; history.length = 0; ballShadow.visible = false;
        ball.visible = match.phase === 'ready' || match.phase === 'idle';
        const avatar = match.server === 1 ? player : opponent;
        ball.position.copy(avatar.handWorld).add(vector(0.045, 0.045, 0));
      }
      target.position.x = spot.position.x = aim * 0.59;
      const pulse = 1 + Math.sin(time * 3.5) * 0.08; target.scale.setScalar(pulse);
      const impactAge = time - impactTime;
      impact.material.opacity = Math.max(0, 0.8 - impactAge * 3); impact.scale.setScalar(1 + impactAge * 6);
      perfTime += dt; frames++;
      if (frames >= 100) {
        if (perfTime / frames > 0.026 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.2); renderer.setPixelRatio(pixelRatio); }
        frames = 0; perfTime = 0;
      }
      renderer.render(scene, camera);
    },
  };
}
