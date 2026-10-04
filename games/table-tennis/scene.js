import * as THREE from 'three';
import { TABLE, clamp } from './physics.mjs?v=3';
import { createAthlete } from './athlete.js?v=3';
import { mergeGeometries } from '../../game/lib/addons/utils/BufferGeometryUtils.js';

const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);

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
function surfaceTexture(color, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, size, size);
  let seed = 37;
  for (let i = 0; i < size * size / 3; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % size; seed = (seed * 16807) % 2147483647;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.055)';
    ctx.fillRect(x, seed % size, 1, 1);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 8); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function stadiumBanner() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#101b2b'; ctx.fillRect(0, 0, 2048, 256);
  for (let x = 0; x < 2048; x += 4) { ctx.fillStyle = '#ffffff05'; ctx.fillRect(x, 0, 1, 256); }
  ctx.fillStyle = '#7ddde2'; ctx.fillRect(0, 0, 2048, 6);
  ctx.fillStyle = '#e3f4f7'; ctx.font = 'italic 900 96px Arial'; ctx.textAlign = 'center';
  ctx.fillText('RALLY', 380, 160); ctx.fillText('RALLY', 1680, 160);
  ctx.font = '600 28px Arial'; ctx.fillStyle = '#8caab9'; ctx.fillText('TABLE TENNIS ARENA', 1030, 139);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}

function buildArena(scene) {
  const steel = mat(0x18232e, { metalness: 0.6, roughness: 0.38 });
  const stands = mat(0x101a28), seats = mat(0x213b52), trim = mat(0x354858);
  const floor = mat(0xffffff, { map: surfaceTexture('#151e29'), roughness: 0.94 });
  box(scene, floor, 0, -0.065, -1, 24, 0.12, 24);
  const playingSurface = mat(0xffffff, { map: surfaceTexture('#592737'), roughness: 0.89 });
  box(scene, playingSurface, 0, 0.003, 0, 7.5, 0.012, 9.6);
  const lines = mat(0xa87886, { roughness: 1 });
  for (const x of [-3.48, 3.48]) box(scene, lines, x, 0.011, 0, 0.018, 0.002, 9.02);
  for (const z of [-4.5, 4.5]) box(scene, lines, 0, 0.011, z, 6.96, 0.002, 0.018);
  const courtMark = sign(scene, 'RALLY', 0, 0.014, -3.64, 1.42, 0.29, '#bf91a0');
  courtMark.rotation.x = -Math.PI / 2;
  const arenaMark = sign(scene, 'TABLE TENNIS ARENA', 0, 0.015, 3.76, 1.65, 0.13, '#bf91a0');
  arenaMark.rotation.x = -Math.PI / 2; arenaMark.rotation.z = Math.PI;
  // The audience sits behind the playable area; the camera side stays open.
  for (let row = 0; row < 5; row++) {
    box(scene, stands, 0, 0.12 + row * 0.34, -5.85 - row * 0.74, 15, 0.26 + row * 0.68, 0.74);
    box(scene, trim, 0, 0.285 + row * 0.34, -5.51 - row * 0.74, 15, 0.025, 0.06);
  }
  const seatInstances = new THREE.InstancedMesh(boxGeometry, seats, 105);
  const bodyInstances = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.13, 0.2, 3, 8), new THREE.MeshBasicMaterial({ color: 0x8293a3 }), 94);
  const headInstances = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x83909c }), 94);
  const object = new THREE.Object3D(); let person = 0, seat = 0;
  const colors = [0x33556c, 0x6d5260, 0x5c6974, 0x263b55, 0x4a5362, 0x725858];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 21; col++) {
    const x = (col - 10) * 0.58, y = 0.44 + row * 0.34, z = -5.79 - row * 0.74;
    object.position.set(x, y - 0.08, z); object.scale.set(0.43, 0.08, 0.40); object.rotation.set(0, 0, 0);
    object.updateMatrix(); seatInstances.setMatrixAt(seat++, object.matrix);
    if ((col + row * 7) % 10 === 0) continue;
    object.position.set(x, y + 0.20, z + 0.03); object.scale.set(1, 1, 1); object.rotation.z = ((col % 3) - 1) * 0.045;
    object.updateMatrix(); bodyInstances.setMatrixAt(person, object.matrix); bodyInstances.setColorAt(person, new THREE.Color(colors[(col + row * 3) % colors.length]));
    object.position.y = y + 0.50; object.rotation.z = 0; object.updateMatrix(); headInstances.setMatrixAt(person, object.matrix);
    headInstances.setColorAt(person, new THREE.Color([0xb7957f, 0xa28471, 0x8e7665][(col + row) % 3])); person++;
  }
  bodyInstances.count = headInstances.count = person; scene.add(seatInstances, bodyInstances, headInstances);
  const bannerMaterial = new THREE.MeshBasicMaterial({ map: stadiumBanner() });
  box(scene, steel, 0, 0.39, -4.98, 8.8, 0.78, 0.11);
  mesh(new THREE.PlaneGeometry(8.6, 0.72), bannerMaterial, scene, 0, 0.39, -4.914);
  for (const x of [-3.97, 3.97]) {
    const board = mesh(new THREE.PlaneGeometry(5.9, 0.69), bannerMaterial, scene, x, 0.37, -1.95);
    board.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    box(scene, steel, x, 0.35, -1.95, 0.08, 0.70, 5.95);
  }
  const rail = mat(0x465461, { metalness: 0.6, roughness: 0.5 });
  box(scene, rail, 0, 2.19, -8.88, 15, 0.032, 0.032);
  for (const x of [-6.4, -3.2, 0, 3.2, 6.4]) box(scene, rail, x, 1.7, -8.88, 0.035, 0.98, 0.035);
  box(scene, stands, 0, 3.25, -10.0, 24, 6.5, 0.2);
  sign(scene, 'RALLY', 0, 3.68, -9.87, 3.7, 0.76, '#afc5d5');
  sign(scene, 'EVERY POINT STARTS HERE', 0, 3.14, -9.85, 2.85, 0.18, '#537e94');
  const glow = new THREE.MeshBasicMaterial({ color: 0x9cdfe9 });
  for (const z of [-3.7, 1.3]) {
    box(scene, steel, 0, 5.5, z, 11.5, 0.08, 0.08);
    for (const x of [-3.2, 0, 3.2]) {
      box(scene, steel, x, 5.42, z, 0.85, 0.15, 0.32);
      box(scene, glow, x, 5.335, z, 0.72, 0.012, 0.24);
    }
  }
  box(scene, new THREE.MeshBasicMaterial({ color: 0x51a8bb }), 0, 2.61, -9.84, 14, 0.018, 0.01);
  scene.traverse(object => { if (object.isMesh) object.castShadow = false; });
}

function buildTable(scene) {
  const surface = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: surfaceTexture('#176b83'), roughness: 0.57, clearcoat: 0.22, clearcoatRoughness: 0.64 });
  const frame = mat(0x172631, { roughness: 0.4, metalness: 0.45 }), white = mat(0xe8eff1);
  const aluminium = mat(0x8296a4, { metalness: 0.75, roughness: 0.35 });
  box(scene, surface, 0, TABLE.height - 0.021, 0, 1.525, 0.042, 2.74);
  box(scene, frame, 0, TABLE.height - 0.074, 0, 1.53, 0.064, 2.745);
  for (const x of [-0.7525, 0.7525]) box(scene, white, x, TABLE.height + 0.001, 0, 0.018, 0.002, 2.74);
  for (const z of [-1.36, 1.36]) box(scene, white, 0, TABLE.height + 0.001, z, 1.525, 0.002, 0.018);
  box(scene, white, 0, TABLE.height + 0.001, 0, 0.005, 0.002, 2.74);
  for (const z of [-0.89, 0.89]) {
    for (const x of [-0.53, 0.53]) {
      box(scene, frame, x, 0.35, z, 0.075, 0.66, 0.085);
      box(scene, aluminium, x, 0.33, z + Math.sign(z) * 0.06, 0.023, 0.48, 0.018);
      box(scene, frame, x, 0.10, z, 0.12, 0.035, 0.29);
      for (const dz of [-0.11, 0.11]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.04, 12), mat(0x111a22), scene, x, 0.047, z + dz);
        wheel.rotation.z = Math.PI / 2;
      }
      const brace = box(scene, frame, x * 0.7, 0.41, z, 0.031, 0.57, 0.034); brace.rotation.z = x < 0 ? -0.60 : 0.60;
    }
    box(scene, frame, 0, 0.21, z, 1.15, 0.045, 0.052);
    box(scene, aluminium, 0, TABLE.height - 0.13, z, 1.17, 0.026, 0.036);
  }
  box(scene, frame, 0, 0.44, 0, 0.055, 0.063, 1.83);
  const net = new THREE.Group(); scene.add(net);
  const threads = [];
  for (let x = -0.86; x < 0.87; x += 0.020) threads.push(x, TABLE.height, 0, x, TABLE.height + TABLE.net, 0);
  for (let y = TABLE.height; y < TABLE.height + TABLE.net; y += 0.017) threads.push(-0.865, y, 0, 0.865, y, 0);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(threads, 3));
  net.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xbacbd3, transparent: true, opacity: 0.38 })));
  box(net, white, 0, TABLE.height + TABLE.net, 0, 1.75, 0.013, 0.017);
  for (const x of [-0.85, 0.85]) {
    box(net, frame, x, TABLE.height + 0.052, 0, 0.029, 0.27, 0.03);
    box(net, aluminium, x * 0.95, TABLE.height - 0.036, 0, 0.11, 0.025, 0.095);
    box(net, white, x, TABLE.height + TABLE.net + 0.033, 0, 0.033, 0.012, 0.036);
  }
  sign(scene, 'RALLY · COMPETITION', 0, TABLE.height - 0.072, 1.375, 0.60, 0.035, '#c8dce6');
  for (const x of [-0.767, 0.767]) {
    const label = sign(scene, 'RALLY', x, TABLE.height - 0.075, 0.80, 0.22, 0.035, '#c8dce6');
    label.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
  }
}

// Batch stationary meshes by material; individual athlete joints remain independent.
function batchArena(scene) {
  scene.updateMatrixWorld(true); const groups = new Map(), objects = [];
  scene.traverse(object => {
    if (!object.isMesh || object.isInstancedMesh || !object.geometry.attributes.normal || Array.isArray(object.material)) return;
    const key = `${object.material.uuid}:${object.castShadow}`;
    if (!groups.has(key)) groups.set(key, { material: object.material, castShadow: object.castShadow, geometries: [] });
    const geometry = object.geometry.clone(); geometry.applyMatrix4(object.matrixWorld);
    if (geometry.attributes.uv) groups.get(key).geometries.push(geometry); else geometry.dispose();
    objects.push(object);
  });
  for (const { material, castShadow, geometries } of groups.values()) {
    if (!geometries.length) continue;
    const combined = mergeGeometries(geometries, false);
    const object = new THREE.Mesh(combined, material); object.receiveShadow = true;
    object.castShadow = castShadow; scene.add(object);
    geometries.forEach(geometry => geometry.dispose());
  }
  objects.forEach(object => object.removeFromParent());
}

export function createScene(canvas, court, onContextLost) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio); renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080f1b); scene.fog = new THREE.Fog(0x080f1b, 11, 23);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.08, 40);
  scene.add(new THREE.HemisphereLight(0xc1deef, 0x302c39, 0.95));
  const sun = new THREE.DirectionalLight(0xffebdc, 2.8); sun.position.set(-3.5, 7, 3); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -3.4; sun.shadow.camera.right = 3.4;
  sun.shadow.camera.top = 4.3; sun.shadow.camera.bottom = -4.3; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 16;
  sun.shadow.radius = 5;
  sun.shadow.normalBias = 0.008; sun.shadow.bias = -0.00008; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb0d6ff, 0.8); fill.position.set(4, 4, -3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fdce3, 1.1); rim.position.set(-2, 3, -5); scene.add(rim);
  buildArena(scene); buildTable(scene); batchArena(scene);
  const player = createAthlete(scene, 1, 0xce6733, 'left'), opponent = createAthlete(scene, -1, 0x426eae, 'right');
  const ball = mesh(sphereGeometry, mat(0xffefd2, { roughness: 0.6, emissive: 0xffb840, emissiveIntensity: 0.22 }), scene, 0, 1.2, 1, 0.029);
  ball.renderOrder = 5;
  const ballShadow = mesh(new THREE.CircleGeometry(0.033, 24), new THREE.MeshBasicMaterial({ color: 0x111923, transparent: true, opacity: 0.33, depthWrite: false }), scene, 0, TABLE.height + 0.004, 0);
  ballShadow.rotation.x = -Math.PI / 2;
  const target = mesh(new THREE.RingGeometry(0.065, 0.079, 40), new THREE.MeshBasicMaterial({ color: 0x81e7ef, transparent: true, opacity: 0.76, depthWrite: false }), scene, 0, TABLE.height + 0.005, -0.91);
  target.rotation.x = -Math.PI / 2;
  const spot = mesh(new THREE.CircleGeometry(0.06, 32), new THREE.MeshBasicMaterial({ color: 0x81e7ef, transparent: true, opacity: 0.1, depthWrite: false }), scene, 0, TABLE.height + 0.004, -0.91);
  spot.rotation.x = -Math.PI / 2;
  const trailPositions = new Float32Array(36 * 3);
  const trailGeometry = new THREE.BufferGeometry(); trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xf9f4ce, transparent: true, opacity: 0.3 }));
  trail.frustumCulled = false; scene.add(trail);
  const history = [];
  const impact = mesh(new THREE.RingGeometry(0.025, 0.032, 32), new THREE.MeshBasicMaterial({ color: 0xc1f7ff, transparent: true, opacity: 0, depthWrite: false }), scene, 0, TABLE.height + 0.009, 0);
  impact.rotation.x = -Math.PI / 2;
  let impactTime = -10, perfTime = 0, frames = 0, cameraMode = 'broadcast';
  let serveStart = null;
  function resize() {
    const rect = court.getBoundingClientRect(); camera.aspect = rect.width / rect.height;
    const mobile = rect.width < 600;
    if (cameraMode === 'player') camera.position.set(mobile ? 0.40 : 0.80, mobile ? 3.7 : 2.8, mobile ? 5.5 : 4.6);
    else camera.position.set(mobile ? 1.6 : 2.9, mobile ? 4.1 : 2.7, mobile ? 5.3 : 3.9);
    const center = new THREE.Vector3(mobile ? cameraMode === 'player' ? -0.15 : -0.38 : 0, 0.69, 0);
    camera.fov = mobile ? 46 : 37; camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    let fit = 1;
    for (const x of [-1.0, 1.0]) for (const y of [0.05, 1.75]) for (const z of [-2.2, 2.2]) {
      const point = vector(x, y, z).project(camera); fit = Math.max(fit, Math.abs(point.x) / 0.89, Math.abs(point.y) / 0.78);
    }
    fit = Math.min(fit, mobile ? 1.42 : 1.3);
    if (mobile) fit *= 1.035;
    if (fit > 1) camera.position.sub(center).multiplyScalar(fit).add(center);
    camera.lookAt(center); camera.updateMatrixWorld(); renderer.setSize(rect.width, rect.height, false);
  }
  new ResizeObserver(resize).observe(court); resize();
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onContextLost(); });
  return {
    scene, camera, renderer, player, opponent,
    setCamera(mode) { cameraMode = mode === 'player' ? 'player' : 'broadcast'; resize(); },
    moveTarget(clientX) {
      const rect = canvas.getBoundingClientRect();
      return clamp(((clientX - rect.left) / rect.width - 0.5) * 3.0, -1.1, 1.1);
    },
    aimTarget(clientX) {
      const rect = canvas.getBoundingClientRect();
      return clamp(((clientX - rect.left) / rect.width - 0.5) * 3.0, -1, 1);
    },
    projectContact(contact) {
      const p = vector(contact.x, contact.y, contact.z).project(camera), rect = canvas.getBoundingClientRect();
      return { x: (p.x + 1) * rect.width / 2, y: (1 - p.y) * rect.height / 2 };
    },
    reset() { player.reset(); opponent.reset(); history.length = 0; impactTime = -10; serveStart = null; },
    event(event, time) {
      if (event.type === 'bounce') { history.length = 0; impact.position.set(event.x, TABLE.height + 0.008, event.z); impactTime = time; }
      const avatar = event.side === 1 ? player : opponent;
      if (event.type === 'swing') { if (event.serve) serveStart = { side: event.side, position: null, released: false }; avatar.beginSwing(time, event); }
      if (event.type === 'hit') { avatar.contact(time, event); history.length = 0; }
      if (event.type === 'serve') {
        avatar.contact(time, { ...event, x: event.x ?? avatar.root.position.x, y: event.y ?? 1.15, z: event.z ?? event.side * 1.28, spin: 0 }); history.length = 0;
      }
    },
    render(match, time, dt, aim, paused) {
      const b = match.ball;
      const active = match.phase === 'rally';
      player.update(time, dt, match.playerX, b, active, match.playerSwing); opponent.update(time, dt, match.opponentX, b, active, match.opponentSwing);
      if (b && active) {
        ball.visible = true; ball.position.set(b.x, b.y, b.z); ball.rotation.x += dt * b.spin * 12;
        const onTable = Math.abs(b.x) < TABLE.halfWidth && Math.abs(b.z) < TABLE.halfLength;
        ballShadow.position.set(b.x, onTable ? TABLE.height + 0.007 : 0.025, b.z);
        ballShadow.visible = true; ballShadow.scale.setScalar(1 + Math.max(0, b.y - TABLE.height) * 0.4);
        if (!paused) history.unshift({ point: ball.position.clone(), time });
        while (history.length && time - history[history.length - 1].time > 0.075) history.pop();
        history.length = Math.min(history.length, 15);
        for (let i = 0; i < 36; i++) (history[Math.min(i, history.length - 1)]?.point || ball.position).toArray(trailPositions, i * 3);
        trailGeometry.attributes.position.needsUpdate = true; trailGeometry.setDrawRange(0, history.length); trail.visible = true;
      } else {
        trail.visible = false; history.length = 0; ballShadow.visible = false;
        ball.visible = match.phase === 'ready' || match.phase === 'idle';
        const avatar = match.server === 1 ? player : opponent;
        ball.position.copy(avatar.freeHandWorld).add(vector(0, 0.045, 0));
        if (match.pendingServe) {
          const elapsed = time - match.pendingServe.startedAt;
          if (serveStart?.side === match.pendingServe.side) {
            if (!serveStart.released) { serveStart.position = ball.position.clone(); serveStart.released = elapsed >= 0.18; }
            if (serveStart.released) {
              const release = clamp((elapsed - 0.18) / (match.pendingServe.at - match.pendingServe.startedAt - 0.18), 0, 1);
              ball.position.copy(serveStart.position).lerp(vector(match.pendingServe.target.x, match.pendingServe.target.y, match.pendingServe.target.z), release);
              ball.position.y += 1.12 * release * (1 - release);
            }
          }
        }
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
