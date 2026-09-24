// Preview for march-art.js: the same renderer / fog / lights as battle.js, the real MarchDirector
// for barrier / lantern / lamp state, the VRoid heroine for scale and optional rigged oni.
// Free camera (orbit + fly) and gameplay camera (behind / above the hero, as battle.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MarchDirector, LAYOUT, toWorld } from './march.js';
import { createMarchArt } from './march-art.js';
import { prepareRiggedOni, createRiggedOni } from './oni.js';

const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
if (params.get('clean') === '1') document.body.classList.add('clean');
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111327);
scene.fog = params.get('fog') === '0' ? null : new THREE.FogExp2(0x16182e, 0.018);   // ?fog=0 only for the overview shot
const camera = new THREE.PerspectiveCamera(50, 1, 0.08, params.get('far') ? Number(params.get('far')) : 100);
scene.add(new THREE.HemisphereLight(0xadb4e4, 0x212033, 2.0));
const moon = new THREE.DirectionalLight(0xdac7ff, 2.1);
moon.position.set(-7, 12, 4);
scene.add(moon);
const rim = new THREE.DirectionalLight(0x7049dd, 1.2);
rim.position.set(6, 4, -8);
scene.add(rim);

const march = new MarchDirector({ seed: 17 });
const graybox = params.get('graybox') === '1';
const t0 = performance.now();
const world = graybox
  ? (await import('./march-world.js')).createMarchWorld(THREE, scene)
  : await createMarchArt(THREE, scene, LAYOUT);
const buildMs = Math.round(performance.now() - t0);
if (params.has('seg')) march.skipTo(Math.max(0, Math.min(3, Number(params.get('seg')))));

// ---- heroine (VRoid swordswoman, toon shaded like battle.js) ----
const hero = new THREE.Group();
scene.add(hero);
let heroMixer = null;
try {
  const gltf = await new GLTFLoader().loadAsync('../assets/heroes/swordswoman-v4.glb?v=20260924b');
  const model = gltf.scene;
  const gradient = new THREE.DataTexture(new Uint8Array([96, 160, 220, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  model.traverse(object => {
    if (!object.isMesh) return;
    const toon = m => new THREE.MeshToonMaterial({ map: m.map || null, color: m.color.clone(), gradientMap: gradient, transparent: m.transparent, alphaTest: m.alphaTest, opacity: m.opacity, depthWrite: m.depthWrite, side: m.side });
    object.material = Array.isArray(object.material) ? object.material.map(toon) : toon(object.material);
    object.frustumCulled = false;
  });
  const bounds = new THREE.Box3().setFromObject(model);
  const s = 1.78 / bounds.getSize(new THREE.Vector3()).y;
  model.scale.setScalar(s);
  model.position.y = -bounds.min.y * s;
  hero.add(model);
  heroMixer = new THREE.AnimationMixer(model);
  const idle = gltf.animations.find(clip => clip.name === 'idle') || gltf.animations[0];
  if (idle) heroMixer.clipAction(idle).play();
} catch (error) { console.warn('hero load failed', error); }

// ---- optional oni crowd (budget check: ?enemies=10) ----
const crowd = [];
if (Number(params.get('enemies')) > 0) {
  try {
    const gltf = await new GLTFLoader().loadAsync('../assets/enemies/oni-v2.glb?v=20260924a');
    const shared = prepareRiggedOni(THREE, gltf);
    const n = Number(params.get('enemies'));
    for (let i = 0; i < n; i++) {
      const actor = createRiggedOni(THREE, shared, 'grunt', cloneSkinned);
      scene.add(actor.root);
      crowd.push(actor);
    }
  } catch (error) { console.warn('oni load failed', error); }
}
function placeCrowd() {
  const h = toWorld(march.arena.hero.x, march.arena.hero.y);
  crowd.forEach((actor, i) => {
    const a = (i / crowd.length) * Math.PI * 1.3 - Math.PI * 1.15, r = 3 + (i % 3) * 1.4;
    const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
    actor.root.position.set(x, world.heightAt(x, z), z);
    actor.root.rotation.y = Math.atan2(h.x - x, h.z - z);
  });
}

// ---- cameras ----
let cam = params.get('cam') === 'free' ? 'free' : 'game';
let yaw = Math.PI, freeYaw = Math.PI * 0.8, freePitch = 0.35, freeDist = 16;
const freeTarget = new THREE.Vector3();
const focus = new THREE.Vector3();
const heroPos = () => { const p = toWorld(march.arena.hero.x, march.arena.hero.y); return new THREE.Vector3(p.x, world.heightAt(p.x, p.z), p.z); };
freeTarget.copy(heroPos()).add(new THREE.Vector3(0, 1, -6));
function syncCamera(dt, snap = false) {
  const p = hero.position;
  if (cam === 'game') {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const target = new THREE.Vector3(p.x - fx * 3.7, p.y + 2.45, p.z - fz * 3.7);
    if (snap) camera.position.copy(target); else camera.position.lerp(target, Math.min(1, dt * 7));
    world.constrainCamera(camera.position, p);
    camera.lookAt(focus.set(p.x + fx * 1.7, p.y + 0.84, p.z + fz * 1.7));
  } else {
    camera.position.set(freeTarget.x + Math.sin(freeYaw) * Math.cos(freePitch) * freeDist, freeTarget.y + Math.sin(freePitch) * freeDist, freeTarget.z + Math.cos(freeYaw) * Math.cos(freePitch) * freeDist);
    camera.lookAt(freeTarget);
  }
}
/** Named shots for screenshots: free camera at target/yaw/pitch/dist, or game camera at a hero spot. */
const SHOTS = {
  'seg1-game': { seg: 0, hero: [0, 0], yaw: Math.PI },
  'seg1-game-b': { seg: 0, hero: [1.5, -12], yaw: Math.PI },
  'seg2-game': { seg: 1, hero: [0, -33.5], yaw: Math.PI },
  'seg2-game-b': { seg: 1, hero: [-4, -45], yaw: Math.PI * 0.75 },
  'seg3-game': { seg: 2, hero: [0, -55.5], yaw: Math.PI },
  'seg3-game-b': { seg: 2, hero: [3, -66], yaw: Math.PI * 1.1 },
  'seg4-game': { seg: 3, hero: [0, -87.5], yaw: Math.PI },
  'seg4-game-back': { seg: 3, hero: [0, -97], yaw: 0 },
  'beauty-market': { free: [0, 1.6, -14], yaw: Math.PI * 0.06, pitch: 0.1, dist: 15 },
  'beauty-market-back': { free: [0, 1.6, -12], yaw: Math.PI * 0.93, pitch: 0.12, dist: 14 },
  'beauty-plaza': { free: [0, 1.5, -42], yaw: Math.PI * 0.78, pitch: 0.28, dist: 22 },
  'beauty-stairs': { free: [0, 3, -72], yaw: Math.PI * 0.86, pitch: 0.2, dist: 24 },
  'beauty-gate': { free: [0, 6, -99], yaw: Math.PI * 0.98, pitch: 0.12, dist: 16 },
  'beauty-gate-wide': { free: [0, 7, -100], yaw: Math.PI * 0.97, pitch: 0.05, dist: 30 },
  'pickups-game': { seg: 0, hero: [0, 0], yaw: Math.PI, drops: [['bun', -1.6, -2.8], ['bigBun', -0.3, -4.6], ['wine', 1.6, -2.8]] },
  'pickups-game-far': { seg: 1, hero: [0, -33.5], yaw: Math.PI, drops: [['bun', -3, -39], ['bigBun', 3.5, -37.5], ['wine', 0, -44.6]] },
  'pickups-close': { seg: 0, hero: [0, 3], yaw: Math.PI, drops: [['bun', -0.9, -2], ['bigBun', 0, -2.2], ['wine', 0.9, -2]], free: [0, 0.55, -2.1], yaw2: Math.PI * 0.02, pitch: 0.12, dist: 2.3 },
  'overview': { free: [0, 0, -52], yaw: Math.PI * 0.72, pitch: 0.75, dist: 82 },
};
function applyShot(name) {
  const shot = SHOTS[name];
  if (!shot) return false;
  if (shot.seg !== undefined) {
    march.skipTo(shot.seg);
    for (let i = 0; i < 3; i++) { march.update(1 / 60, { x: 0, y: 0 }); march.drainEvents(); }   // spawn objective props (lanterns, lamp)
    cam = 'game';
    if (shot.hero) {
      const px = { x: 640 + shot.hero[0] * 60, y: 500 + shot.hero[1] * 60 };
      Object.assign(march.arena.hero, px);
    }
    yaw = shot.yaw;
    march.arena.hero.facing = Math.PI / 2 - yaw;
    if (shot.drops) {
      march.pickups.length = 0;
      for (const [kind, x, z] of shot.drops) march._drop(kind, 640 + x * 60, 500 + z * 60);
    }
    if (shot.free) { cam = 'free'; freeTarget.set(...shot.free); freeYaw = shot.yaw2; freePitch = shot.pitch; freeDist = shot.dist; }
  } else {
    cam = 'free';
    freeTarget.set(...shot.free); freeYaw = shot.yaw; freePitch = shot.pitch; freeDist = shot.dist;
  }
  syncHero();
  placeCrowd();
  syncCamera(0, true);
  return true;
}

// ---- input ----
const keys = new Set();
let drag = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (cam === 'free') {
    if (drag.pan) {
      const right = new THREE.Vector3(Math.cos(freeYaw), 0, -Math.sin(freeYaw));
      freeTarget.addScaledVector(right, -dx * freeDist * 0.0015);
      freeTarget.y += dy * freeDist * 0.0015;
    } else {
      freeYaw -= dx * 0.005;
      freePitch = Math.max(-0.3, Math.min(1.5, freePitch + dy * 0.004));
    }
  } else yaw -= dx * 0.006;
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('wheel', e => { freeDist = Math.max(2, Math.min(140, freeDist * (e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  keys.add(key);
  if (e.repeat) return;
  if (key === 'c') { cam = cam === 'game' ? 'free' : 'game'; if (cam === 'free') freeTarget.copy(hero.position).add(new THREE.Vector3(0, 1, 0)); }
  if ('1234'.includes(key)) { march.skipTo(Number(key) - 1); yaw = Math.PI; syncHero(); syncCamera(0, true); }
  if (key === 'g') location.search = graybox ? location.search.replace(/&?graybox=1/, '') : `${location.search}${location.search ? '&' : '?'}graybox=1`;
  if (key === 'h') document.body.classList.toggle('clean');
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function syncHero() {
  const p = heroPos();
  hero.position.copy(p);
  hero.rotation.y = Math.PI / 2 - march.arena.hero.facing;
}

function resize() {
  const width = innerWidth, height = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = 0, frames = 0, fps = 0, fpsAt = 0;
const freeze = params.get('freeze') === '1' || params.has('shot');
const openGates = params.get('open') === '1';
const view = () => { const v = march.view(); if (openGates) v.gates = v.gates.map(gate => ({ ...gate, open: true })); return v; };
function step(dt) {
  if (cam === 'game') {
    const ix = Number(keys.has('d')) - Number(keys.has('a')), iy = Number(keys.has('s')) - Number(keys.has('w'));
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (!freeze || ix || iy) march.update(dt, { x: fx * -iy + -fz * ix, y: fz * -iy + fx * ix });
    march.drainEvents();
    if (ix || iy) yaw += Math.atan2(Math.sin(Math.PI / 2 - march.arena.hero.facing - yaw), Math.cos(Math.PI / 2 - march.arena.hero.facing - yaw)) * Math.min(1, dt * 2.6);
  } else {
    const speed = (keys.has('shift') ? 30 : 10) * dt;
    const f = new THREE.Vector3(-Math.sin(freeYaw), 0, -Math.cos(freeYaw)), r = new THREE.Vector3(Math.cos(freeYaw), 0, -Math.sin(freeYaw));
    if (keys.has('w')) freeTarget.addScaledVector(f, speed);
    if (keys.has('s')) freeTarget.addScaledVector(f, -speed);
    if (keys.has('d')) freeTarget.addScaledVector(r, speed);
    if (keys.has('a')) freeTarget.addScaledVector(r, -speed);
    if (keys.has('e')) freeTarget.y += speed;
    if (keys.has('q')) freeTarget.y -= speed;
  }
}
function info() {
  const i = renderer.info.render;
  const s = world.stats ? world.stats() : null;
  $('info').textContent = `${graybox ? '灰模' : '美術'} · ${fps} fps · ${i.calls} draws · ${i.triangles} tris · 段 ${march.segmentIndex + 1}` + (s ? ` · 靜態 ${s.staticTriangles} tris · 貼圖 ${(s.textureBytes / 1048576).toFixed(1)} MB · 建置 ${buildMs} ms` : '');
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  step(dt);
  syncHero();
  heroMixer?.update(dt);
  for (const actor of crowd) { try { actor.update('idle', now / 1000, dt, { action: 'idle', actionTime: now / 1000 }); } catch {} }
  world.update(view(), dt, now / 1000);
  syncCamera(dt);
  renderer.render(scene, camera);
  frames++;
  if (now - fpsAt > 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; info(); }
}
syncHero();
placeCrowd();
world.update(view(), 1 / 60, 0);
syncCamera(0, true);
if (params.has('shot')) applyShot(params.get('shot'));
requestAnimationFrame(frame);
/** Renders one frame and returns renderer stats (used by the screenshot script). */
function measure() {
  world.update(view(), 1 / 60, performance.now() / 1000);
  renderer.render(scene, camera);
  const i = renderer.info;
  const all = { calls: i.render.calls, triangles: i.render.triangles };
  // environment only: hide the heroine and the oni crowd for one render
  hero.visible = false; for (const actor of crowd) actor.root.visible = false;
  renderer.render(scene, camera);
  const env = { calls: i.render.calls, triangles: i.render.triangles };
  hero.visible = true; for (const actor of crowd) actor.root.visible = true;
  renderer.render(scene, camera);
  return { all, env, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, stats: world.stats?.(), buildMs };
}
window.__art = { THREE, march, world, scene, camera, renderer, applyShot, measure, SHOTS, setCam: value => { cam = value; syncCamera(0, true); } };
window.__ready = true;
