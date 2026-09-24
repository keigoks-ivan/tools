// Standalone judge page for combat-fx.js: the real heroine (swordswoman-v4.glb) and rigged oni (oni-v2.glb) in the
// night-market arena, driven by the real Arena (musou mode, director API) with a scripted combo loop.
//   ?fx=new (default) | legacy (battle.js's current effects, for before/after) | off
//   ?quality=desktop|mobile  ?cam=fixed|follow|close  ?enemies=10  ?seed=7  ?true=1 (真・無雙)  ?flurry=1 (long special demo)
//   ?capture=1  no rAF loop; drive it with window.__fx.step(seconds) and screenshot (deterministic)
// Not part of the game. toonVroidHero / makeEnemy / the airborne launch mirror battle.js (which does not export them).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Arena } from '../2d/combat.js';
import { createNightMarket } from './world.js';
import { prepareRiggedOni, createRiggedOni } from './oni.js';
import { createCombatFx } from './combat-fx.js?v=20260925a';

const params = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const mode = ['new', 'legacy', 'off'].includes(params.get('fx')) ? params.get('fx') : 'new';
const quality = params.get('quality') === 'mobile' ? 'mobile' : 'desktop';
let camMode = ['follow', 'close'].includes(params.get('cam')) ? params.get('cam') : 'fixed';
const capture = params.get('capture') === '1';
const crowd = Math.max(1, Math.min(16, Number(params.get('enemies') || 10)));
// ?true=1 marks the special as 真・無雙; ?flurry=1 replaces the Arena's 3-hit special with the planned long special
// (10 'special' swings every 0.3 s + 'musouFinish'), emitted here only to judge the effects.
const trueMusou = params.get('true') === '1';
const flurryDemo = params.get('flurry') === '1';
if (capture) document.body.classList.add('capture');

// Seeded Math.random so capture runs reproduce the same frames (oni.js picks idle / attack variants with it).
let seed = Number(params.get('seed') || 7) >>> 0;
Math.random = () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const toWorldX = x => (x - 640) / 60;
const toWorldZ = y => (y - 500) / 60;
const yawFromFacing = facing => Math.PI / 2 - facing;
const turnToward = (from, to, rate) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * rate;

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: capture });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.info.autoReset = true;
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
const groundAt = () => 0;

// ---- heroine (same look as battle.js) ----
function toonVroidHero(root) {
  const gradient = new THREE.DataTexture(new Uint8Array([96, 160, 220, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const outline = new THREE.MeshBasicMaterial({ color: 0x0b0714, side: THREE.BackSide });
  outline.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'transformed += normal * 0.0035;\n#include <project_vertex>');
  };
  outline.customProgramCacheKey = () => 'vroid-outline';
  const converted = new Map();
  const toon = material => {
    if (!converted.has(material)) {
      converted.set(material, new THREE.MeshToonMaterial({
        name: material.name, map: material.map || null, color: material.color.clone(), gradientMap: gradient,
        transparent: material.transparent, alphaTest: material.alphaTest, opacity: material.opacity,
        depthWrite: material.depthWrite, side: material.side,
      }));
    }
    return converted.get(material);
  };
  const meshes = [];
  root.traverse(object => { if (object.isMesh) meshes.push(object); });
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toon) : toon(mesh.material);
    mesh.frustumCulled = false;
    const materials = [].concat(mesh.material);
    if (materials.some(material => material.transparent || material.alphaTest > 0)) continue;
    const shell = mesh.clone(false);
    shell.material = outline;
    shell.raycast = () => {};
    mesh.parent.add(shell);
  }
}

const loader = new GLTFLoader();
const [gltf, oniGltf] = await Promise.all([
  loader.loadAsync('../assets/heroes/swordswoman-v4.glb?v=20260924b'),
  loader.loadAsync('../assets/enemies/oni-v2.glb?v=20260924a'),
]);
const riggedOni = prepareRiggedOni(THREE, oniGltf);
const hero = new THREE.Group();
scene.add(hero);
const heroModel = gltf.scene;
toonVroidHero(heroModel);
const bounds = new THREE.Box3().setFromObject(heroModel);
const heroScale = 1.78 / bounds.getSize(new THREE.Vector3()).y;
heroModel.scale.setScalar(heroScale);
heroModel.position.y = -bounds.min.y * heroScale;
hero.add(heroModel);
const mixer = new THREE.AnimationMixer(heroModel);
for (const clip of gltf.animations) for (const track of clip.tracks) {
  if (!/Hips\.position$/i.test(track.name)) continue;
  const x = track.values[0], z = track.values[2];
  for (let i = 0; i < track.values.length; i += 3) { track.values[i] = x; track.values[i + 2] = z; }
}
const actions = new Map(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
let currentAction = null, currentName = '';
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
  currentAction = next; currentName = name;
}
play('idle');
const sword = heroModel.getObjectByName('Hero_sword');

// ---- enemies (same construction as battle.js makeEnemy) ----
function makeEnemy(role, enemy) {
  if (role !== 'officer') return createRiggedOni(THREE, riggedOni, role, cloneSkinned);
  const actor = createRiggedOni(THREE, riggedOni, 'boss', cloneSkinned);
  actor.root.scale.setScalar(0.8);
  const tinted = [];
  actor.root.traverse(object => {
    if (!object.isSkinnedMesh || object.material !== riggedOni.toon) return;
    object.material = riggedOni.toon.clone();
    object.material.color.setHex(enemy?.variant === 'shadow' ? 0x8fa6ff : 0xff8f80);
    tinted.push(object.material);
  });
  const dispose = actor.dispose;
  actor.dispose = () => { dispose(); for (const material of tinted) material.dispose(); };
  return actor;
}

// ---- simulation ----
const arena = new Arena({ seed: 17, warriorMode: true, musou: true, director: true });
const enemies = new Map(), corpses = [], airborne = new Map();
const respawns = [];
function spawnAround(role, angle, dist, extra = {}) {
  const h = arena.hero;
  const x = Math.max(120, Math.min(1160, h.x + Math.cos(angle) * dist * 60));
  const y = Math.max(230, Math.min(610, h.y + Math.sin(angle) * dist * 60 * 0.8));
  const hp = role === 'officer' ? 70 : 24;
  return arena.spawn(role, x, y, { hp, facing: angle + Math.PI, cooldown: 1 + Math.random() * 2, ...(role === 'officer' ? { guard: true, range: 96, name: '赤角' } : null), ...extra });
}
function populate() {
  for (let i = 0; i < crowd; i++) {
    const role = i === crowd - 1 && crowd >= 4 ? 'officer' : i % 4 === 3 ? 'runner' : 'grunt';
    spawnAround(role, -Math.PI / 2 + (i / crowd) * Math.PI * 2 + 0.2, role === 'officer' ? 2.4 : 2.0 + (i % 3) * 0.7);
  }
}
populate();

const fx = mode === 'new' ? createCombatFx({
  THREE, scene, camera, renderer, hero, heroModel, sword, hud: $('hud'), quality, groundAt, seed: 99,
}) : null;
if (fx) fx.setKills(46);   // so the 50人斬 banner shows within the first loop
const legacy = mode === 'legacy' ? createLegacyFx() : null;

const fxCost = { frame: 0, total: 0, frames: 0, peak: 0 };
let hitstopUntil = 0, realClock = 0, gameClock = 0, paused = false, autoplay = true;
const input = { x: 0, y: 0 };
const worldPos = new THREE.Vector3();

function launch(id, vy, spin = 0) {
  const state = airborne.get(id) || { y: 0, vy: 0, spin: 0, turn: 0 };
  state.vy = Math.max(state.vy, vy); state.spin = spin;
  airborne.set(id, state);
}

function handleEvents() {
  for (const event of arena.drainEvents()) {
    const x = toWorldX(event.x ?? arena.hero.x), z = toWorldZ(event.y ?? arena.hero.y);
    worldPos.set(x, groundAt(x, z), z);
    if (event.type === 'slash') play(event.kind === 'heavy' ? 'charge' : `combo${event.combo || 1}`, arena.attack?.duration || 0.5);
    if (event.type === 'dodge') play('roll', 0.42);
    if (event.type === 'special') {
      play('musou', 2.0);
      if (trueMusou) event.true = true;
      if (flurryDemo) {
        const timeline = trueMusou ? { windup: 0.55, finish: 4.3, end: 5.0 } : { windup: 0.55, finish: 3.6, end: 4.2 };
        flurry = { start: gameClock, next: 0, done: false, timeline, swings: trueMusou ? 12 : 10 };
        emitFx({ type: 'musouStart', timeline, true: trueMusou || undefined });
      }
    }
    if (flurryDemo && event.type === 'swing' && event.kind === 'special') continue;   // replaced by the synthetic flurry
    if (event.type === 'hit') {
      const heavy = event.source !== 'attack';
      const target = arena.enemies.find(enemy => enemy.id === event.enemyId);
      const staggers = !event.armored && (!target || !target.guard || target.guardBrokenUntil > arena.time || event.hp === 0);
      if (staggers) launch(event.enemyId, event.source === 'special' ? 7.5 : heavy ? 6 : 1.6, heavy ? 9 : 0);
      if (staggers) enemies.get(event.enemyId)?.onHit?.(event.source, event.hp > 0);
    }
    if (event.type === 'hitstop') hitstopUntil = realClock + (event.duration || 0.035) * 2;
    if (event.type === 'telegraph') enemies.get(event.enemyId)?.onTelegraph?.(event.duration || 0.7);
    const t0 = performance.now();
    fx?.onEvent(event, worldPos, enemies.get(event.enemyId)?.root);
    fxCost.frame += performance.now() - t0;
    legacy?.onEvent(event, x, z);
    if (event.type === 'kill') {
      launch(event.enemyId, 8, 12);
      const actor = enemies.get(event.enemyId);
      if (actor?.rigged) { actor.onKill(); enemies.delete(event.enemyId); corpses.push(actor); while (corpses.length > 8) corpses.shift().dispose(); }
      respawns.push({ at: gameClock + (event.role === 'officer' ? 3 : 1.2), role: event.role === 'officer' ? 'officer' : Math.random() < 0.25 ? 'runner' : 'grunt' });
    }
  }
}

function syncEnemies(dt) {
  const active = new Set();
  for (const enemy of arena.enemies) {
    active.add(enemy.id);
    let actor = enemies.get(enemy.id);
    if (!actor) {
      actor = makeEnemy(enemy.role, enemy); enemies.set(enemy.id, actor); scene.add(actor.root);
      actor.root.position.set(toWorldX(enemy.x), 0, toWorldZ(enemy.y)); actor.root.rotation.y = yawFromFacing(enemy.facing);
      actor.onSpawn?.();
    }
    const air = airborne.get(enemy.id);
    const x = toWorldX(enemy.x), z = toWorldZ(enemy.y);
    const k = Math.min(1, dt * (actor.grounded() ? 1.2 : 14));
    actor.root.position.x += (x - actor.root.position.x) * k;
    actor.root.position.z += (z - actor.root.position.z) * k;
    if (!actor.grounded()) actor.root.rotation.y = turnToward(actor.root.rotation.y, yawFromFacing(enemy.facing), Math.min(1, dt * 10));
    actor.root.position.y = groundAt(x, z) + (air ? air.y : 0);
    actor.update(enemy.action, enemy.actionTime, dt, enemy);
    if (air) fx?.trackAirborne(enemy.id, actor.root.position.x, 0, actor.root.position.z, air.y);
  }
  for (const [id, actor] of enemies) if (!active.has(id)) { actor.dispose(); enemies.delete(id); }
  for (let i = corpses.length - 1; i >= 0; i--) {
    const corpse = corpses[i];
    corpse.update('dead', 0, dt);
    if (corpse.finished()) { corpse.dispose(); corpses.splice(i, 1); }
  }
}
function updateAirborne(dt) {
  for (const [id, state] of airborne) {
    state.vy -= 22 * dt; state.y += state.vy * dt; state.turn += state.spin * dt;
    if (state.y <= 0) { state.y = 0; if (state.vy < -3) state.vy *= -0.25; else airborne.delete(id); }
  }
}

// ---- scripted combo loop ----
const SCRIPT = ['combo', 'charge', 'combo', 'special', 'dodge', 'jump'];
let flurry = null, jumpSim = null;
function emitFx(event) {
  const h = arena.hero;
  const x = toWorldX(h.x), z = toWorldZ(h.y);
  worldPos.set(x, groundAt(x, z), z);
  fx?.onEvent({ x: h.x, y: h.y, facing: h.facing, ...event }, worldPos);
}
function advanceDemos(dt) {
  if (flurry) {
    const t = gameClock - flurry.start, tl = flurry.timeline;
    const gap = (tl.finish - 0.3 - tl.windup) / (flurry.swings - 1);
    while (flurry.next < flurry.swings && t >= tl.windup + flurry.next * gap) {
      emitFx({ type: 'swing', kind: 'special', index: flurry.next, last: false, radius: 280, true: trueMusou || undefined });
      // a connecting swing: the Arena would emit hitstop for its hits
      emitFx({ type: 'hitstop', duration: 0.06 });
      if (flurry.next % 4 === 3) play('musou', 1.3);
      flurry.next++;
    }
    if (!flurry.done && t >= tl.finish) { flurry.done = true; emitFx({ type: 'musouFinish', radius: trueMusou ? 400 : 320, true: trueMusou || undefined }); }
    if (t >= tl.end) flurry = null;
  }
  if (jumpSim) {
    const j = jumpSim, t = (j.t += dt);
    const fire = (key, at, event, clip) => { if (!j[key] && t >= at) { j[key] = true; emitFx(event); if (clip) play(clip[0], clip[1]); } };
    fire('slash', 0.3, { type: 'airSlash', radius: 150 }, ['combo2', 0.32]);
    fire('plunge', 0.56, { type: 'plunge' }, ['charge', 0.5]);
    fire('land', 0.72, { type: 'land', radius: 190 });
    j.y = t < 0.32 ? 1.7 * (1 - (1 - t / 0.32) ** 2) : t < 0.56 ? 1.7 : t < 0.72 ? 1.7 * (1 - ((t - 0.56) / 0.16) ** 2) : 0;
    j.action = t < 0.3 ? 'jump' : t < 0.52 ? 'airSlash' : t < 0.72 ? 'plunge' : 'idle';
    if (t > 1.15) jumpSim = null;
  }
}
let phase = 0, phaseStarted = false, waitUntil = 0, dodgeFlip = 1;
function scriptInput() {
  const h = arena.hero;
  const edges = {};
  h.invulnerable = Math.max(h.invulnerable, 5);
  h.hp = h.maxHp;
  if (!autoplay || gameClock < waitUntil || jumpSim || flurry) return edges;
  const idle = h.action === 'idle' || h.action === 'run';
  const step = SCRIPT[phase % SCRIPT.length];
  if (idle && phaseStarted) {                       // move finished -> short beat, then next phase
    phaseStarted = false; phase++; waitUntil = gameClock + (step === 'special' ? 0.7 : 0.4);
    return edges;
  }
  if (idle && !phaseStarted) {
    // keep the fight near the middle of the arena
    if (Math.hypot(h.x - 640, h.y - 450) > 200) { h.x += (640 - h.x) * 0.5; h.y += (450 - h.y) * 0.5; }
    phaseStarted = true;
    if (step === 'combo') edges.attack = true;
    if (step === 'charge') edges.heavy = true;
    if (step === 'special') { h.energy = 100; edges.special = true; }
    if (step === 'dodge') { edges.dodge = true; dodgeFlip *= -1; input.x = dodgeFlip; }
    if (step === 'jump') { jumpSim = { t: 0, y: 0, action: 'jump' }; emitFx({ type: 'jump' }); play('jump', 0.7); }
    return edges;
  }
  if (step === 'combo' && h.action === 'attack' && h.combo < 5) edges.attack = true;
  return edges;
}

function step(realDt) {
  realClock += realDt;
  const hitstop = realClock < hitstopUntil;
  // with combat-fx the module owns hit-stop and slow motion (it receives the 'hitstop' events); otherwise battle.js rules
  const dt = fx ? realDt * fx.timeScale() : realDt * (hitstop ? 0.06 : 1);
  gameClock += dt;
  for (let i = respawns.length - 1; i >= 0; i--) if (respawns[i].at <= gameClock) {
    spawnAround(respawns[i].role, Math.random() * Math.PI * 2, respawns[i].role === 'officer' ? 3 : 3.5 + Math.random());
    respawns.splice(i, 1);
  }
  const edges = scriptInput();
  arena.update(dt, { x: input.x, y: input.y, ...edges });
  input.x = input.y = 0;
  handleEvents();
  advanceDemos(dt);
  updateAirborne(dt);
  syncEnemies(dt);
  const h = arena.hero;
  hero.position.set(toWorldX(h.x), jumpSim ? jumpSim.y : 0, toWorldZ(h.y));
  hero.rotation.y = yawFromFacing(h.facing);
  if ((h.action === 'idle' || h.action === 'run') && !jumpSim && !flurry) play(h.action);
  mixer.update(dt);
  hero.updateMatrixWorld(true);
  syncCamera(realDt);
  const t0 = performance.now();
  fx?.update(realDt, dt, { heroAction: jumpSim ? jumpSim.action : flurry ? 'special' : h.action, energy: h.energy });
  fxCost.frame += performance.now() - t0;
  fxCost.total += fxCost.frame; fxCost.frames++; fxCost.peak = Math.max(fxCost.peak, fxCost.frame); fxCost.frame = 0;
  legacy?.update(realDt, dt, h.action);
}

// ---- camera ----
let cameraYaw = Math.PI;
const viewPosition = new THREE.Vector3(), focus = new THREE.Vector3(), chest = new THREE.Vector3();
function syncCamera(dt, snap = false) {
  const h = arena.hero;
  if (camMode === 'follow') {
    cameraYaw = turnToward(cameraYaw, yawFromFacing(h.facing), Math.min(1, dt * (h.action === 'run' ? 2.6 : 1.6)));
    const fx_ = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    viewPosition.set(hero.position.x - fx_ * 3.7, hero.position.y + 2.45, hero.position.z - fz * 3.7);
    focus.set(hero.position.x + fx_ * 1.7, hero.position.y + 0.84, hero.position.z + fz * 1.7);
  } else if (camMode === 'close') {
    viewPosition.set(hero.position.x + 1.9, hero.position.y + 1.9, hero.position.z + 3.1);
    focus.set(hero.position.x - 0.4, hero.position.y + 1.0, hero.position.z - 0.8);
  } else {
    viewPosition.set(hero.position.x + 2.4, hero.position.y + 4.3, hero.position.z + 6.4);
    focus.set(hero.position.x - 0.2, hero.position.y + 0.8, hero.position.z - 0.5);
  }
  if (snap) camera.position.copy(viewPosition); else camera.position.lerp(viewPosition, Math.min(1, dt * 6));
  camera.lookAt(focus);
  legacy?.applyShake(camera);
}

function render() {
  chest.set(hero.position.x, hero.position.y + 1.05, hero.position.z);
  fx?.cameraPre(camera, chest);
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls, tris = renderer.info.render.triangles;
  fx?.cameraPost(camera);
  return { calls, tris };
}

function resize() {
  const width = innerWidth, height = innerHeight;
  renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio || 1, quality === 'mobile' ? 1.25 : 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

await fx?.ready;
// warm-up: first frame + shader compile
step(1 / 60);
syncCamera(0, true);
fx?.prewarm([...enemies.values()][0]?.root);
let lastInfo = render();
$('loading').remove();

// ---- diagnostics ----
let frames = 0, fpsAt = 0, fps = 0, frameMs = 0;
function diag() {
  const s = fx?.stats();
  $('diag').textContent = `${mode.toUpperCase()} · ${quality} · ${fps} fps · ${frameMs.toFixed(1)} ms/frame · ${lastInfo.calls} draws · ${Math.round(lastInfo.tris / 1000)}k tris`
    + (s ? `\nfx cpu ${(fxCost.total / Math.max(1, fxCost.frames)).toFixed(2)} ms avg / ${fxCost.peak.toFixed(2)} ms peak · fx draws ${s.drawCalls} · particles ${s.particlesAlive}/${s.particleCap} · strips ${s.stripSlotsUsed}/${s.stripSlots} · ghost verts ${s.echoVertices}\ncombo ${s.combo} (max ${s.maxCombo}) · KO ${s.kills} · timeScale ${s.timeScale.toFixed(2)}` : '');
}

// ---- input ----
const keyEdges = {};
addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (event.repeat) return;
  if (key === ' ') { autoplay = !autoplay; event.preventDefault(); }
  if (key === 'c') camMode = camMode === 'fixed' ? 'follow' : camMode === 'follow' ? 'close' : 'fixed';
  if (key === 'p') paused = !paused;
  if (key === 'f' || key === 'q') {
    const next = new URLSearchParams(location.search);
    if (key === 'f') next.set('fx', mode === 'new' ? 'legacy' : mode === 'legacy' ? 'off' : 'new');
    else next.set('quality', quality === 'desktop' ? 'mobile' : 'desktop');
    location.search = next.toString();
  }
  const action = { j: 'attack', k: 'heavy', e: 'special', l: 'dodge' }[key];
  if (action) { autoplay = false; if (action === 'special') arena.hero.energy = 100; keyEdges[action] = true; }
});
// manual presses feed the same arena input
const origUpdate = arena.update.bind(arena);
arena.update = (dt, value) => { const merged = { ...value, ...keyEdges }; for (const k of Object.keys(keyEdges)) delete keyEdges[k]; return origUpdate(dt, merged); };

function frame(now) {
  requestAnimationFrame(frame);
  if (paused) return;
  const t0 = performance.now();
  const realDt = frame.last ? Math.min(0.05, (now - frame.last) / 1000) : 1 / 60;
  frame.last = now;
  step(realDt);
  lastInfo = render();
  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
  frames++;
  if (now - fpsAt > 500) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; diag(); }
}
if (!capture) requestAnimationFrame(frame);

window.__fx = {
  fx, arena, scene, camera, renderer, mode, quality,
  /** Advances the simulation by `seconds` at a fixed 60 Hz step, then renders once. */
  step(seconds, dt = 1 / 60) {
    const n = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) step(dt);
    lastInfo = render();
    diag();
    return { t: +realClock.toFixed(3), game: +gameClock.toFixed(3), action: arena.hero.action, combo: arena.hero.combo, draws: lastInfo.calls, fx: fx?.stats() };
  },
  /** Steps until `predicate()` is true (max `limit` s); for landing on an exact event. */
  until(predicate, limit = 12, dt = 1 / 60) {
    for (let t = 0; t < limit; t += dt) { step(dt); if (predicate()) break; }
    lastInfo = render();
    diag();
    return { t: +realClock.toFixed(3), action: arena.hero.action, combo: arena.hero.combo, draws: lastInfo.calls, fx: fx?.stats() };
  },
  setCam(value) { camMode = value; syncCamera(0, true); },
  cost: () => ({ avgMs: +(fxCost.total / Math.max(1, fxCost.frames)).toFixed(3), peakMs: +fxCost.peak.toFixed(3), frames: fxCost.frames }),
  info: () => lastInfo,
  ready: true,
};
diag();

// ---------------------------------------------------------------------------------------------
// Legacy effects: a compact copy of battle.js's current look (crescent meshes, spark planes, ground ring flashes,
// vertex-colour blade trail, hit stop + shake) so screenshots can compare before / after on the same scripted fight.
// ---------------------------------------------------------------------------------------------
function createLegacyFx() {
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
  const effects = [], slashes = [], sparks = [];
  let shake = 0;
  const shakeOffset = new THREE.Vector3();
  const crescentGeometry = (() => {
    const steps = 48, positions = [], colors = [], index = [];
    for (let i = 0; i <= steps; i++) {
      const along = i / steps, angle = -Math.PI * 0.55 + along * Math.PI * 1.1;
      const width = 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, along * 1.15)), 0.8) + 0.004;
      const glow = Math.pow(along, 1.8);
      for (const [radius, white] of [[1 - width, 0], [1, 1]]) {
        positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        colors.push(glow * (0.45 + 0.55 * white), glow * (0.22 + 0.7 * white), glow * (0.95 + 0.05 * white));
      }
      if (i < steps) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(index);
    return geometry;
  })();
  const sparkGeometry = new THREE.PlaneGeometry(0.05, 0.42);
  sparkGeometry.translate(0, 0.21, 0);
  function flash(x, z, color = 0xc697ff, radius = 0.45, life = 0.24) {
    if (effects.length >= 20) { const old = effects.shift(); scene.remove(old.mesh); old.mesh.material.dispose(); }
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.025, z); mesh.scale.setScalar(radius);
    scene.add(mesh); effects.push({ mesh, age: 0, life, radius });
  }
  function crescent(x, z, facing, { radius = 2.4, tilt = 0, vertical = false, life = 0.22, spin = 1 }) {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(crescentGeometry, material);
    mesh.rotation.x = vertical ? 0 : -Math.PI / 2;
    const orient = new THREE.Group(); orient.rotation.y = -Math.PI / 2; orient.add(mesh);
    const tiltGroup = new THREE.Group(); tiltGroup.rotation.z = tilt; tiltGroup.add(orient);
    const pivot = new THREE.Group(); pivot.position.set(x, 0.95, z); pivot.rotation.y = yawFromFacing(facing); pivot.add(tiltGroup);
    mesh.scale.setScalar(radius * 0.75);
    scene.add(pivot);
    slashes.push({ pivot, mesh, material, age: 0, life, radius, spin });
    while (slashes.length > 8) { const old = slashes.shift(); scene.remove(old.pivot); old.material.dispose(); }
  }
  function burst(x, z, color, count = 9, height = 1.0) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(sparkGeometry, material);
      mesh.position.set(x, height + (Math.random() - 0.5) * 0.4, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      sparks.push({ mesh, material, age: 0, life: 0.16 + Math.random() * 0.1 });
      scene.add(mesh);
    }
    while (sparks.length > 60) { const old = sparks.shift(); scene.remove(old.mesh); old.material.dispose(); }
  }
  // battle.js makeBladeTrail
  const trail = (() => {
    const attribute = sword.geometry.attributes.position;
    sword.geometry.computeBoundingBox();
    const span = sword.geometry.boundingBox.getSize(new THREE.Vector3());
    const axis = span.x > span.y && span.x > span.z ? 0 : span.y > span.z ? 1 : 2;
    let near = 0, far = 0;
    for (let i = 1; i < attribute.count; i++) {
      if (attribute.getComponent(i, axis) < attribute.getComponent(near, axis)) near = i;
      if (attribute.getComponent(i, axis) > attribute.getComponent(far, axis)) far = i;
    }
    const segments = 12;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(segments * 6), colors = new Float32Array(segments * 6), indices = [];
    for (let i = 0; i < segments - 1; i++) { const a = i * 2, b = a + 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    const samples = [];
    const pointA = new THREE.Vector3(), pointB = new THREE.Vector3();
    return {
      update(active) {
        if (active) {
          sword.skeleton.update();
          sword.getVertexPosition(near, pointA); sword.getVertexPosition(far, pointB);
          sword.localToWorld(pointA); sword.localToWorld(pointB);
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
          positions.set(sample, i * 6);
          const glow = i < samples.length ? Math.pow((i + 1) / samples.length, 2) : 0;
          colors.set([glow * .12, glow * .04, glow * .28, glow * .4, glow * .25, glow * .65], i * 6);
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      },
    };
  })();
  return {
    onEvent(event, x, z) {
      if (event.type === 'swing') {
        const radius = (event.radius || 180) / 60;
        const tilt = [0.05, -0.42, 0.38, 0.5, -0.2][(event.combo || 1) - 1] * (event.index % 2 ? -1 : 1);
        if (event.kind === 'special') {
          for (let i = 0; i < 3; i++) crescent(x, z, event.facing + i * 2.1 + event.index, { radius: radius * 0.8, tilt: 0.15 * (i - 1), life: 0.4, spin: 2.2 });
          flash(x, z, 0xe7c7ff, radius, 0.4); shake = Math.max(shake, 0.45);
        } else if (event.kind === 'heavy') {
          crescent(x, z, event.facing, { radius: 2.6, vertical: true, life: 0.34, spin: 0.5 });
          flash(x, z, 0xd8b0ff, radius * 0.9, 0.42); burst(x, z, 0xffe0b8, 22, 0.15); shake = Math.max(shake, 0.55);
        } else {
          const full = event.combo >= 4;
          crescent(x, z, event.facing, { radius: radius * 0.72, tilt, life: event.last && full ? 0.36 : 0.26, spin: event.index % 2 ? -1.4 : 1.4 });
          if (full) crescent(x, z, event.facing + Math.PI, { radius: radius * 0.72, tilt: -tilt, life: 0.3, spin: event.index % 2 ? -1.4 : 1.4 });
          if (event.last && full) { flash(x, z, 0xd8b0ff, radius * 0.8, 0.36); shake = Math.max(shake, 0.4); }
        }
      }
      if (event.type === 'hit') {
        flash(x, z, 0xd9a8ff, 0.44, 0.22);
        const heavy = event.source !== 'attack';
        burst(x, z, heavy ? 0xffd7a8 : 0xe2c4ff, heavy ? 14 : 8);
        shake = Math.max(shake, event.source === 'special' ? 0.5 : heavy ? 0.32 : 0.16);
      }
      if (event.type === 'kill') { flash(x, z, 0x9d66de, event.role === 'boss' ? 2.4 : 0.8, 0.4); burst(x, z, 0xb58cff, 18, 0.9); }
      if (event.type === 'guardBreak') { flash(x, z, 0xffd24a, 1.6, 0.4); burst(x, z, 0xffe07a, 20, 1.1); shake = Math.max(shake, 0.45); }
      if (event.type === 'guard') burst(x, z, 0xbfe4ff, 6, 1.1);
    },
    update(realDt, dt, action) {
      trail.update(action === 'attack' || action === 'heavy' || action === 'special');
      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i]; s.age += realDt; const t = s.age / s.life;
        if (t >= 1) { scene.remove(s.pivot); s.material.dispose(); slashes.splice(i, 1); continue; }
        s.mesh.scale.setScalar(s.radius * (0.75 + 0.3 * Math.sqrt(t))); s.mesh.rotation.z += realDt * 7 * s.spin;
        s.material.opacity = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.age += realDt;
        if (p.age >= p.life) { scene.remove(p.mesh); p.material.dispose(); sparks.splice(i, 1); continue; }
        const t = p.age / p.life; p.mesh.scale.set(1 - t * 0.6, 1 + t * 1.8, 1); p.material.opacity = 1 - t;
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i]; e.age += dt;
        if (e.age >= e.life) { scene.remove(e.mesh); e.mesh.material.dispose(); effects.splice(i, 1); continue; }
        const p = e.age / e.life; e.mesh.scale.setScalar(e.radius * (1 + p * 0.95)); e.mesh.material.opacity = (1 - p) * 0.7;
      }
      shake = Math.max(0, shake - realDt * 2.4);
    },
    applyShake(cam) {
      if (shake <= 0) return;
      shakeOffset.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5).multiplyScalar(shake * 0.22);
      cam.position.add(shakeOffset);
    },
  };
}
