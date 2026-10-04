import * as THREE from 'three';
import { TABLE, clamp } from './physics.mjs?v=2';
import { createAthlete } from './athlete.js?v=2';

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
  const threads = [];
  for (let x = -0.86; x < 0.87; x += 0.025) threads.push(x, TABLE.height, 0, x, TABLE.height + TABLE.net, 0);
  for (let y = TABLE.height; y < TABLE.height + TABLE.net; y += 0.021) threads.push(-0.865, y, 0, 0.865, y, 0);
  const netGeometry = new THREE.BufferGeometry(); netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(threads, 3));
  net.add(new THREE.LineSegments(netGeometry, new THREE.LineBasicMaterial({ color: 0xd6e2d0, transparent: true, opacity: 0.44 })));
  box(net, white, 0, TABLE.height + TABLE.net, 0, 1.75, 0.012, 0.01);
  for (const x of [-0.85, 0.85]) {
    box(net, frame, x, TABLE.height + 0.045, 0, 0.026, 0.24, 0.026);
    box(net, frame, x * 0.95, TABLE.height - 0.029, 0, 0.11, 0.017, 0.075);
  }
  const label = sign(scene, 'RALLY', 0, TABLE.height - 0.093, 1.376, 0.25, 0.047, '#b7c3ae');
  label.material.depthWrite = true;
}

export function createScene(canvas, court, onContextLost) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio); renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.14;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbec8b4); scene.fog = new THREE.Fog(0xbec8b4, 9, 20);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.08, 40);
  scene.add(new THREE.HemisphereLight(0xe8efe4, 0x576147, 2.4));
  const sun = new THREE.DirectionalLight(0xffeed0, 3.4); sun.position.set(-4, 7, 2); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5; sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 20;
  sun.shadow.normalBias = 0.015; sun.shadow.bias = -0.00015; sun.shadow.radius = 3; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdce9eb, 0.75); fill.position.set(4, 4, -3); scene.add(fill);
  buildRoom(scene); buildTable(scene);
  const player = createAthlete(scene, 1, 0xce6733, 'left'), opponent = createAthlete(scene, -1, 0x426eae, 'right');
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
  function resize() {
    const rect = court.getBoundingClientRect(); camera.aspect = rect.width / rect.height;
    const mobile = rect.width < 600;
    camera.position.set(mobile ? 1.55 : 3.5, mobile ? 4.4 : 3.2, mobile ? 5.5 : 3.5);
    camera.fov = mobile ? 48 : 40; camera.lookAt(0, 0.72, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const center = new THREE.Vector3(0, 0.72, 0);
    let fit = 1;
    for (const x of [-1.05, 1.05]) for (const y of [0, 1.75]) for (const z of [-2.2, 2.2]) {
      const point = vector(x, y, z).project(camera); fit = Math.max(fit, Math.abs(point.x) / 0.87, Math.abs(point.y) / 0.76);
    }
    fit = Math.min(fit, mobile ? 1.2 : 1.3);
    if (fit > 1) camera.position.sub(center).multiplyScalar(fit).add(center);
    camera.lookAt(center); camera.updateMatrixWorld(); renderer.setSize(rect.width, rect.height, false);
  }
  new ResizeObserver(resize).observe(court); resize();
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onContextLost(); });
  return {
    scene, camera, renderer, player, opponent,
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
    reset() { player.reset(); opponent.reset(); history.length = 0; impactTime = -10; },
    event(event, time) {
      if (event.type === 'bounce') { impact.position.set(event.x, TABLE.height + 0.008, event.z); impactTime = time; }
      const avatar = event.side === 1 ? player : opponent;
      if (event.type === 'swing') avatar.beginSwing(time, event);
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
        if (!paused) history.unshift(ball.position.clone());
        history.length = Math.min(history.length, 15);
        for (let i = 0; i < 36; i++) (history[Math.min(i, history.length - 1)] || ball.position).toArray(trailPositions, i * 3);
        trailGeometry.attributes.position.needsUpdate = true; trailGeometry.setDrawRange(0, history.length); trail.visible = true;
      } else {
        trail.visible = false; history.length = 0; ballShadow.visible = false;
        ball.visible = match.phase === 'ready' || match.phase === 'idle';
        const avatar = match.server === 1 ? player : opponent;
        ball.position.copy(avatar.freeHandWorld).add(vector(0, 0.045, 0));
        if (match.pendingServe) {
          const progress = clamp((time - match.pendingServe.startedAt) / (match.pendingServe.at - match.pendingServe.startedAt), 0, 1);
          ball.position.lerp(vector(match.pendingServe.target.x, match.pendingServe.target.y, match.pendingServe.target.z), progress);
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
