import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Arena } from '../2d/combat.js';
import { FramePacer } from '../frame-pacing.js';
import { createNightMarket } from './world.js';
import { createOni } from './oni.js';

const $ = id => document.getElementById(id);
const isMobile = () => matchMedia('(pointer: coarse)').matches || innerWidth <= 900;
const debug = new URLSearchParams(location.search).has('debug');
const toWorldX = x => (x - 640) / 60;
const toWorldZ = y => (y - 500) / 60;
const yawFromFacing = facing => Math.PI / 2 - facing;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const turnToward = (from, to, rate) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * rate;

function renderRatio(width, height) {
  const budget = isMobile() ? 1_600_000 : 3_000_000;
  return Math.max(0.65, Math.min(devicePixelRatio || 1, isMobile() ? 1.25 : 1.5, Math.sqrt(budget / Math.max(1, width * height))));
}

function loadRumi() {
  return new GLTFLoader().loadAsync('../assets/heroes/rumi-v2.glb?v=20260924b');
}

function makeBladeTrail(scene, sword) {
  const attribute = sword.geometry.attributes.position;
  sword.geometry.computeBoundingBox();
  const box = sword.geometry.boundingBox;
  const span = box.getSize(new THREE.Vector3());
  const axis = span.x > span.y && span.x > span.z ? 'x' : span.y > span.z ? 'y' : 'z';
  let near = 0, far = 0;
  for (let i = 1; i < attribute.count; i++) {
    if (attribute.getComponent(i, axis === 'x' ? 0 : axis === 'y' ? 1 : 2) < attribute.getComponent(near, axis === 'x' ? 0 : axis === 'y' ? 1 : 2)) near = i;
    if (attribute.getComponent(i, axis === 'x' ? 0 : axis === 'y' ? 1 : 2) > attribute.getComponent(far, axis === 'x' ? 0 : axis === 'y' ? 1 : 2)) far = i;
  }
  const segments = 12;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(segments * 2 * 3);
  const colors = new Float32Array(positions.length);
  const indices = [];
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2, b = a + 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  const samples = [];
  const pointA = new THREE.Vector3(), pointB = new THREE.Vector3();
  return {
    update(active) {
      if (active) {
        sword.updateMatrixWorld(true);
        sword.skeleton.update();
        sword.getVertexPosition(near, pointA);
        sword.getVertexPosition(far, pointB);
        sword.localToWorld(pointA);
        sword.localToWorld(pointB);
        const root = pointA.clone().lerp(pointB, 0.7);
        if (samples.length && new THREE.Vector3(...samples.at(-1).slice(3)).distanceTo(pointB) > 1.3) samples.length = 0;
        samples.push([...root.toArray(), ...pointB.toArray()]);
      } else if (samples.length) samples.shift();
      while (samples.length > segments) samples.shift();
      mesh.visible = samples.length >= 2;
      if (!mesh.visible) return;
      const last = samples.at(-1);
      for (let i = 0; i < segments; i++) {
        const sample = samples[i] || last;
        const base = i * 6;
        positions.set(sample, base);
        const glow = i < samples.length ? Math.pow((i + 1) / samples.length, 2) : 0;
        colors.set([glow * .12, glow * .04, glow * .28, glow * .4, glow * .25, glow * .65], base);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
    clear() { samples.length = 0; mesh.visible = false; },
  };
}

export async function createBattle(canvas) {
  const gltf = await loadRumi();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111327);
  scene.fog = new THREE.FogExp2(0x16182e, 0.018);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 100);
  scene.add(new THREE.HemisphereLight(0xadb4e4, 0x212033, 2.0));
  const moon = new THREE.DirectionalLight(0xdac7ff, 2.1);
  moon.position.set(-7, 12, 4);
  scene.add(moon);
  const rim = new THREE.DirectionalLight(0x7049dd, 1.2);
  rim.position.set(6, 4, -8);
  scene.add(rim);
  createNightMarket(THREE, scene);

  const hero = new THREE.Group();
  scene.add(hero);
  const heroModel = gltf.scene;
  const sourceBounds = new THREE.Box3().setFromObject(heroModel);
  const scale = 1.78 / sourceBounds.getSize(new THREE.Vector3()).y;
  heroModel.scale.setScalar(scale);
  heroModel.position.y = -sourceBounds.min.y * scale;
  hero.add(heroModel);
  const mixer = new THREE.AnimationMixer(heroModel);
  const actions = new Map(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  for (const clip of gltf.animations) for (const track of clip.tracks) {
    if (!/Hips\.position$/i.test(track.name)) continue;
    const x = track.values[0], z = track.values[2];
    for (let i = 0; i < track.values.length; i += 3) { track.values[i] = x; track.values[i + 2] = z; }
  }
  let currentAction = null;
  let currentName = '';
  function play(name, duration = 0) {
    const next = actions.get(name) || actions.get('idle');
    if (currentName === name && duration === 0) return;
    if (currentAction && currentAction !== next) currentAction.fadeOut(0.08);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(duration > 0 ? next.getClip().duration / duration : 1);
    next.setLoop(duration > 0 ? THREE.LoopOnce : THREE.LoopRepeat, duration > 0 ? 1 : Infinity);
    next.clampWhenFinished = duration > 0;
    next.fadeIn(0.08).play();
    currentAction = next;
    currentName = name;
  }
  play('idle');
  const sword = heroModel.getObjectByName('Hero_sword') || heroModel.getObjectByName('rumi_sword');
  const trail = sword?.isSkinnedMesh ? makeBladeTrail(scene, sword) : { update() {}, clear() {} };
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
  const effects = [];
  const enemies = new Map();
  const arena = new Arena({ seed: 17, warriorMode: true });
  const keys = new Set();
  const edges = {};
  const joystick = { x: 0, y: 0, pointer: null };
  const stick = $('stick');
  const knob = $('knob');
  const pacer = new FramePacer(60);
  let running = false, paused = false, raf = 0, lastAt = 0, cameraYaw = Math.PI;
  let hudAt = 0, toastUntil = 0, lastAnimSerial = 0, frames = 0, fpsAt = 0;
  const viewPosition = new THREE.Vector3(), focus = new THREE.Vector3();

  function resize() {
    const width = canvas.clientWidth || innerWidth, height = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(renderRatio(width, height));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    updatePortrait();
  }
  function isPortrait() { return isMobile() && innerHeight > innerWidth; }
  function updatePortrait() {
    $('rotateOverlay').hidden = !running || !isPortrait();
    if (isPortrait()) stopFrames();
    else if (running && !paused && !document.hidden) resumeFrames();
  }
  function clearInput() {
    keys.clear();
    for (const action of Object.keys(edges)) delete edges[action];
    joystick.x = joystick.y = 0;
    if (joystick.pointer !== null) {
      try { stick.releasePointerCapture(joystick.pointer); } catch {}
      joystick.pointer = null;
    }
    knob.style.transform = '';
  }
  function stopFrames() { if (raf) cancelAnimationFrame(raf); raf = 0; pacer.reset(); lastAt = 0; clearInput(); }
  function resumeFrames() { if (!raf && running && !paused && !isPortrait() && !document.hidden) { pacer.reset(); lastAt = 0; raf = requestAnimationFrame(frame); } }
  function toast(text, seconds = 1.7) { $('toast').textContent = text; toastUntil = arena.time + seconds; }
  function flash(x, z, color = 0xc697ff, radius = 0.45, life = 0.24) {
    if (effects.length >= 20) {
      const old = effects.shift(); scene.remove(old.mesh); old.mesh.material.dispose();
    }
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.025, z);
    mesh.scale.setScalar(radius);
    scene.add(mesh);
    effects.push({ mesh, age: 0, life, radius });
  }
  function onEvents() {
    for (const event of arena.drainEvents()) {
      const x = toWorldX(event.x ?? arena.hero.x), z = toWorldZ(event.y ?? arena.hero.y);
      if (event.type === 'slash') {
        const clip = event.kind === 'heavy' ? 'heavy' : `slash${event.combo || 1}`;
        play(clip, event.kind === 'heavy' ? 0.58 : 0.36);
        lastAnimSerial = arena.attackSerial;
      }
      if (event.type === 'dodge') play('roll', 0.42);
      if (event.type === 'special') { play('heavyfin', 0.68); flash(x, z, 0xcf96ff, 3.4, 0.48); toast('魂門亂舞！'); }
      if (event.type === 'hit') flash(x, z, 0xd9a8ff, 0.44, 0.22);
      if (event.type === 'telegraph') flash(x, z, 0xff665e, event.role === 'boss' ? 1.4 : 0.84, event.duration || 0.7);
      if (event.type === 'hurt') { play('hurt', 0.38); toast('注意敵人起手！', 0.9); }
      if (event.type === 'wave') toast(event.wave === 'boss' ? '魂門守將現身' : `第 ${event.wave} 波敵人`);
      if (event.type === 'kill') flash(x, z, 0x9d66de, event.role === 'boss' ? 2.4 : 0.8, 0.4);
    }
  }
  function syncEnemies(dt) {
    const active = new Set();
    for (const enemy of arena.enemies) {
      active.add(enemy.id);
      let actor = enemies.get(enemy.id);
      if (!actor) { actor = createOni(THREE, enemy.role); enemies.set(enemy.id, actor); scene.add(actor.root); }
      actor.root.position.set(toWorldX(enemy.x), 0, toWorldZ(enemy.y));
      actor.root.rotation.y = yawFromFacing(enemy.facing);
      actor.update(enemy.action, enemy.actionTime, dt);
    }
    for (const [id, actor] of enemies) if (!active.has(id)) { scene.remove(actor.root); actor.dispose(); enemies.delete(id); }
  }
  function syncHero(dt) {
    const h = arena.hero;
    hero.position.set(toWorldX(h.x), 0, toWorldZ(h.y));
    hero.rotation.y = yawFromFacing(h.facing);
    if (h.action === 'idle' || h.action === 'run') play(h.action);
    if (h.action === 'dead' && currentName !== 'death') play('death', 1);
    if (h.action === 'win' && currentName !== 'win') play('win', 1.2);
    mixer.update(dt);
    hero.updateMatrixWorld(true);
    trail.update(h.action === 'attack' || h.action === 'heavy' || h.action === 'special');
  }
  function syncCamera(dt) {
    const h = arena.hero;
    const targetYaw = yawFromFacing(h.facing);
    cameraYaw = turnToward(cameraYaw, targetYaw, Math.min(1, dt * (h.action === 'run' ? 2.6 : 1.6)));
    const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    const dist = 3.7;
    viewPosition.set(hero.position.x - fx * dist, 2.45, hero.position.z - fz * dist);
    camera.position.lerp(viewPosition, Math.min(1, dt * 7));
    focus.set(hero.position.x + fx * 1.7, 0.84, hero.position.z + fz * 1.7);
    camera.lookAt(focus);
  }
  function updateHud() {
    const h = arena.hero;
    $('hpFill').style.width = `${h.hp / h.maxHp * 100}%`;
    $('hpText').textContent = String(Math.ceil(h.hp));
    $('energyFill').style.width = `${h.energy}%`;
    $('waveText').textContent = arena.bossQueued || arena.enemies.some(enemy => enemy.role === 'boss') ? '魂門守將' : arena.wave === 1 ? '第一波' : '第二波';
    $('killText').textContent = String(arena.kills).padStart(2, '0');
    $('comboText').textContent = h.combo > 1 && h.action === 'attack' ? `${h.combo} 連斬` : '';
    document.querySelector('[data-action="special"]')?.classList.toggle('ready', h.energy >= 100);
    if (arena.time > toastUntil) $('toast').textContent = '';
  }
  function finish() {
    running = false;
    stopFrames();
    $('resultTitle').textContent = arena.state === 'win' ? '夜市重歸寧靜' : '重新集結';
    $('resultText').textContent = `擊倒 ${arena.kills} 名敵人。${arena.state === 'win' ? '你已完成這次 3D 單場試作。' : '看到攻擊警示先閃避；普攻接重擊可以打退一群敵人。'}`;
    $('result').hidden = false;
    document.body.dataset.mode = 'result';
  }
  function frame(timestamp) {
    raf = 0;
    if (!running || paused || document.hidden || isPortrait()) return;
    raf = requestAnimationFrame(frame);
    if (!pacer.shouldRender(timestamp)) return;
    const dt = lastAt ? Math.min(0.05, (timestamp - lastAt) / 1000) : 1 / 60;
    lastAt = timestamp;
    const inputX = joystick.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const inputY = joystick.y + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    const moveX = fx * -inputY + -fz * inputX;
    const moveZ = fz * -inputY + fx * inputX;
    arena.update(dt, { x: moveX, y: moveZ, ...edges });
    for (const key of Object.keys(edges)) delete edges[key];
    onEvents();
    syncEnemies(dt);
    syncHero(dt);
    syncCamera(dt);
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.age += dt;
      if (effect.age >= effect.life) { scene.remove(effect.mesh); effect.mesh.material.dispose(); effects.splice(i, 1); continue; }
      const progress = effect.age / effect.life;
      effect.mesh.scale.setScalar(effect.radius * (1 + progress * 0.95));
      effect.mesh.material.opacity = (1 - progress) * 0.7;
    }
    renderer.render(scene, camera);
    if (timestamp >= hudAt) { updateHud(); hudAt = timestamp + 100; }
    if (debug) {
      frames++;
      if (timestamp - fpsAt >= 1000) {
        $('diagnostics').textContent = `${Math.round(frames * 1000 / (timestamp - fpsAt))} fps · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} tris · ${enemies.size} enemies`;
        fpsAt = timestamp; frames = 0;
      }
    }
    if (arena.state !== 'play') finish();
  }
  function start() {
    arena.reset();
    trail.clear();
    cameraYaw = Math.PI;
    camera.position.set(0, 2.45, 3.7);
    lastAnimSerial = 0;
    onEvents();
    syncEnemies(0);
    syncHero(0);
    syncCamera(1);
    updateHud();
    $('result').hidden = true;
    $('pauseOverlay').hidden = true;
    document.body.dataset.mode = 'play';
    paused = false;
    running = true;
    resize();
    renderer.render(scene, camera);
    resumeFrames();
  }
  function pause(value = !paused) {
    if (!running) return;
    paused = value;
    $('pauseOverlay').hidden = !paused;
    if (paused) stopFrames(); else resumeFrames();
  }
  function moveStick(event) {
    if (event.pointerId !== joystick.pointer) return;
    const rect = stick.getBoundingClientRect(), radius = rect.width * 0.34;
    const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
    joystick.x = dx * scale / radius; joystick.y = dy * scale / radius;
    knob.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
  }
  stick.addEventListener('pointerdown', event => { if (!running || paused || isPortrait() || joystick.pointer !== null) return; event.preventDefault(); joystick.pointer = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); });
  stick.addEventListener('pointermove', moveStick);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, event => { if (event.pointerId === joystick.pointer) { joystick.pointer = null; joystick.x = joystick.y = 0; knob.style.transform = ''; } });
  for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('pointerdown', event => { if (!running || paused || isPortrait()) return; event.preventDefault(); button.setPointerCapture(event.pointerId); edges[button.dataset.action] = true; });
  window.addEventListener('keydown', event => {
    if (!running) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'p') { pause(); return; }
    if (paused) return;
    keys.add(key);
    const action = { j: 'attack', k: 'heavy', shift: 'dodge', e: 'special' }[key];
    if (action && !event.repeat) edges[action] = true;
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  $('pauseBtn').addEventListener('click', () => pause(true));
  $('resume').addEventListener('click', () => pause(false));
  $('retry').addEventListener('click', start);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.addEventListener('blur', () => { if (running) pause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopFrames(); else resumeFrames(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stopFrames(); toast('3D 畫面暫停，請重新載入頁面。', 10); });
  if (debug) document.body.classList.add('debug');
  resize();
  return { start, pause, arena, scene, camera, renderer };
}
