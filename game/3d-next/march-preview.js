// Graybox preview for the march level: march-world.js + the real MarchDirector, with capsules
// standing in for the hero and enemies. Not part of the game; used for layout / pacing checks.
import * as THREE from 'three';
import { MarchDirector, toWorld } from './march.js';
import { createMarchWorld } from './march-world.js';
import { createMarchBot } from './march-bot.js';

const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111327);
scene.fog = new THREE.FogExp2(0x16182e, 0.012);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xc0c6f0, 0x2a2838, 2.2));
const moon = new THREE.DirectionalLight(0xdac7ff, 1.6);
moon.position.set(-7, 12, 4);
scene.add(moon);

const world = createMarchWorld(THREE, scene);
const march = new MarchDirector({ seed: Number(params.get('seed') || 17), mobile: params.has('mobile') });
let bot = params.get('bot') === '1' ? createMarchBot({ skill: params.get('skill') || 'expert', seed: march.seed }) : null;
if (params.has('seg')) march.skipTo(Math.max(0, Math.min(3, Number(params.get('seg')))));
// ?bosshp=125 starts the boss fight at that hp (e.g. to preview phase 2).
const boss = march.arena.enemies.find(enemy => enemy.kind === 'boss');
if (boss && params.has('bosshp')) boss.hp = Number(params.get('bosshp'));

// ---- Capsules ----
const capsule = new THREE.CapsuleGeometry(0.32, 1.0, 4, 10);
capsule.translate(0, 0.82, 0);
const nose = new THREE.BoxGeometry(0.16, 0.16, 0.5);
nose.translate(0, 1.25, 0.35);
const ROLE_COLORS = { hero: 0x4da3ff, grunt: 0x9a5b5b, runner: 0xe08a3a, officer: 0xff4a4a, shadow: 0x5a6cff, boss: 0xa040ff };
const ROLE_SCALE = { grunt: 1, runner: 0.9, officer: 1.3, boss: 1.8 };
function makeActor(color, scale = 1) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: 0x000000 });
  group.add(new THREE.Mesh(capsule, material), new THREE.Mesh(nose, material));
  group.scale.setScalar(scale);
  scene.add(group);
  return { group, material };
}
const hero = makeActor(ROLE_COLORS.hero);
const actors = new Map();
const yaw = facing => Math.PI / 2 - facing;

function syncActors() {
  const h = march.arena.hero;
  const hp = toWorld(h.x, h.y);
  hero.group.position.set(hp.x, world.heightAt(hp.x, hp.z) + (h.height || 0), hp.z);
  hero.group.rotation.y = yaw(h.facing);
  hero.material.emissive.setHex(h.action === 'attack' || h.action === 'heavy' ? 0x2040a0 : h.action === 'special' ? 0x8040ff : h.action === 'dodge' ? 0x406080 : h.action === 'hurt' ? 0x802020 : 0);
  const alive = new Set();
  for (const enemy of march.arena.enemies) {
    if (enemy.prop) continue;
    alive.add(enemy.id);
    let actor = actors.get(enemy.id);
    if (!actor) {
      actor = makeActor(ROLE_COLORS[enemy.variant === 'shadow' ? 'shadow' : enemy.role] ?? 0x888888, ROLE_SCALE[enemy.role] ?? 1);
      actors.set(enemy.id, actor);
    }
    const p = toWorld(enemy.x, enemy.y);
    actor.group.position.set(p.x, world.heightAt(p.x, p.z) + (enemy.lift || 0), p.z);
    actor.group.rotation.y = yaw(enemy.facing);
    const broken = enemy.guardBrokenUntil > march.arena.time;
    actor.material.emissive.setHex(broken ? 0x806000 : enemy.action === 'telegraph' ? 0x901010 : enemy.action === 'attack' ? 0xff3010 : enemy.action === 'hit' ? 0x505050 : 0);
  }
  for (const [id, actor] of actors) if (!alive.has(id)) { scene.remove(actor.group); actor.material.dispose(); actors.delete(id); }
}

// ---- Cameras ----
const cams = ['follow', 'orbit', 'top'];
let cam = [...cams, 'level'].includes(params.get('cam')) ? params.get('cam') : 'follow';
let followYaw = Math.PI, orbitYaw = Math.PI * 0.85, orbitPitch = 0.55, orbitDist = 14;
const focus = new THREE.Vector3();
function syncCamera(dt, snap = false) {
  const p = hero.group.position;
  if (cam === 'follow') {
    followYaw += Math.atan2(Math.sin(yaw(march.arena.hero.facing) - followYaw), Math.cos(yaw(march.arena.hero.facing) - followYaw)) * Math.min(1, dt * 2);
    const fx = Math.sin(followYaw), fz = Math.cos(followYaw);
    const target = new THREE.Vector3(p.x - fx * 3.7, p.y + 2.45, p.z - fz * 3.7);
    if (snap) camera.position.copy(target); else camera.position.lerp(target, Math.min(1, dt * 7));
    world.constrainCamera(camera.position, p);
    camera.lookAt(focus.set(p.x + fx * 1.7, p.y + 0.84, p.z + fz * 1.7));
  } else if (cam === 'orbit') {
    camera.position.set(p.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist, p.y + Math.sin(orbitPitch) * orbitDist, p.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist);
    camera.lookAt(focus.set(p.x, p.y + 1, p.z));
  } else if (cam === 'level') {
    camera.position.set(46, 62, 4);
    camera.lookAt(focus.set(0, 0, -52));
  } else {
    const segment = march.segment;
    const cz = segment.shape === 'circle' ? segment.cz : (segment.minZ + segment.maxZ) / 2;
    camera.position.set(22, 34, cz + 18);
    camera.lookAt(focus.set(0, 0, cz - 2));
  }
}
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => {
  if (!drag || cam !== 'orbit') return;
  orbitYaw -= (e.clientX - drag.x) * 0.006;
  orbitPitch = Math.max(0.08, Math.min(1.45, orbitPitch + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', e => { orbitDist = Math.max(4, Math.min(80, orbitDist * (e.deltaY > 0 ? 1.1 : 0.9))); e.preventDefault(); }, { passive: false });

// ---- Input ----
const keys = new Set(), edges = {};
addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.repeat) return;
  keys.add(key);
  const action = { j: 'attack', k: 'heavy', shift: 'dodge', e: 'special', ' ': 'jump' }[key];
  if (key === ' ') e.preventDefault();
  if (action) edges[action] = true;
  if (key === 'b') bot = bot ? null : createMarchBot({ seed: march.seed });
  if (key === 'c') cam = cams[(cams.indexOf(cam) + 1) % cams.length];
  if (key === 'r') { march.reset(); resultShown = false; }
  if ('1234'.includes(key)) { march.skipTo(Number(key) - 1); resultShown = false; }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function playerInput() {
  const ix = Number(keys.has('d')) - Number(keys.has('a'));
  const iy = Number(keys.has('s')) - Number(keys.has('w'));
  const fx = Math.sin(followYaw), fz = Math.cos(followYaw);
  const input = { x: fx * -iy + -fz * ix, y: fz * -iy + fx * ix, ...edges };
  for (const key of Object.keys(edges)) delete edges[key];
  return input;
}

// ---- HUD ----
let resultShown = false;
function updateHud() {
  const hud = march.hud(), h = march.arena.hero;
  $('segName').textContent = `${hud.segment}／4　${hud.segmentName}`;
  $('objective').textContent = hud.objective;
  $('hint').textContent = hud.hint;
  $('hpFill').style.width = `${h.hp}%`;
  $('hpText').textContent = Math.ceil(h.hp);
  $('energy').textContent = Math.round(h.energy);
  $('kills').textContent = hud.kills;
  $('combo').textContent = hud.combo >= 3 ? `${hud.combo} 連擊` : '';
  const foe = hud.foe || (hud.lamp && { name: hud.lamp.down ? '魂燈（重燃中）' : '魂燈', hp: hud.lamp.down ? 0 : hud.lamp.hp, maxHp: hud.lamp.maxHp });
  $('foe').hidden = !foe;
  if (foe) { $('foeName').textContent = `${foe.name}${foe.phase === 2 ? '　怒' : ''}`; $('foeFill').style.width = `${foe.hp / foe.maxHp * 100}%`; }
  const t = march.time;
  $('diag').textContent = `${fps} fps · ${renderer.info.render.calls} draws · 敵 ${hud.alive}/${hud.cap} · ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${bot ? ' · BOT' : ''}`;
  if (march.state !== 'play' && !resultShown) {
    resultShown = true;
    const r = march.result;
    $('result').textContent = march.state === 'clear' ? `評價 ${r.rank}　${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}　最大連擊 ${r.maxCombo}　HP ${Math.ceil(r.hp)}` : '倒下了（R 重來）';
  } else if (march.state === 'play') $('result').textContent = '';
}

// ---- Loop ----
const freeze = params.get('freeze') === '1';
const speed = Number(params.get('speed') || 1);
const warp = Number(params.get('warp') || 0);
function step(dt) {
  march.update(dt, bot ? bot(march) : playerInput());
  march.drainEvents();
}
for (let t = 0; t < warp && march.state === 'play'; t += 1 / 30) step(1 / 30);
function resize() {
  const width = innerWidth, height = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
let last = 0, fps = 0, frames = 0, fpsAt = 0;
syncActors();
world.update(march.view(), 1 / 30, 0);
syncCamera(1 / 30, true);
updateHud();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  if (!freeze) for (let i = 0; i < speed; i++) step(dt);
  syncActors();
  world.update(march.view(), dt, now / 1000);
  syncCamera(dt);
  renderer.render(scene, camera);
  frames++;
  if (now - fpsAt > 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; updateHud(); }
}
requestAnimationFrame(frame);
renderer.render(scene, camera);
window.__march = { march, world, scene, camera, renderer, setCam: value => { cam = value; syncCamera(0, true); } };
window.__ready = true;
