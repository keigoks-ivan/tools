import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Arena } from '../2d/combat.js';
import { FramePacer } from '../frame-pacing.js';
import { createNightMarket } from './world.js';
import { createOni, prepareRiggedOni, createRiggedOni } from './oni.js';
import { touchHint, HoldRepeat } from './touch-input.js';
import { assetPlan, createPreloader } from './preload.js?v=20260925b';

const $ = id => document.getElementById(id);
const isMobile = () => matchMedia('(pointer: coarse)').matches || innerWidth <= 900;
const touchScreen = () => matchMedia('(pointer: coarse)').matches;
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

// 預設：紫刃＋夜市大街行軍關（march.js 關卡導演＋march-art.js 場景美術；march-world.js 為灰模備用）
// ?hero=rumi 回到舊 Rumi 單場；?level=single 讓紫刃打原本的單場
const pageParams = new URLSearchParams(location.search);
const heroChoice = pageParams.get('hero') === 'rumi' ? 'rumi' : 'vroid';
const marchLevel = heroChoice === 'vroid' && pageParams.get('level') !== 'single';

// 檔案由 preload.js 下載（boot.js 在標題畫面就開始抓）；?hero=vroid 同時換上 Mixamo 骨架的新鬼兵（oni-v2.glb），
// 載入失敗時退回程序化鬼兵。行軍關與打擊特效模組延後載入，boot.js 也會提早呼叫 loadLazyModules()
let lazyModules = null;
export function loadLazyModules() {
  if (!lazyModules) {
    lazyModules = Promise.all([
      marchLevel ? Promise.all([import('./march.js'), import('./march-art.js?v=20260925e')]) : null,
      // ?hero=vroid：打擊特效模組（combat-fx.js）；載入失敗時退回下方原本的特效與時間倍率
      heroChoice === 'vroid' ? import('./combat-fx.js?v=20260925e').catch(error => { console.warn('combat-fx failed, using built-in effects', error); return null; }) : null,
    ]).catch(error => { lazyModules = null; throw error; });
  }
  return lazyModules;
}

/** GLB bytes -> gltf（每次呼叫都重新解析，重試時不會拿到上一次改過材質的模型） */
export function parseGltf(buffer) { return new GLTFLoader().parseAsync(buffer, ''); }

/** 這一頁（?hero／?level）要用的預載器；boot.js 沒傳時 createBattle 自己建一個 */
export function createBattleAssets(options = {}) {
  return createPreloader({ plan: assetPlan({ hero: heroChoice, march: marchLevel }), loadEngine: () => loadLazyModules().then(() => ({ parseGltf })), ...options });
}
const MARCH_FILES = { 'atlas.json': 'march-atlas', 'march-props.webp': 'march-props', 'march-stone.webp': 'march-stone', 'march-sky.webp': 'march-sky' };

// VRoid 模型：四階卡通明暗＋背面外擴描邊，保留眼睛、眉毛、頭髮貼圖的透明設定
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
  const faces = meshes.filter(mesh => mesh.morphTargetDictionary?.Fcl_EYE_Close !== undefined);
  const rest = faces.length ? faces[0].morphTargetInfluences[faces[0].morphTargetDictionary.Fcl_EYE_Close] : 0;
  let nextBlink = 2.5, blinkAt = -1;
  return {
    update(time) {
      if (!faces.length) return;
      if (time > nextBlink) { blinkAt = time; nextBlink = time + 2.8 + Math.random() * 2.6; }
      const t = (time - blinkAt) / 0.14;
      const value = t >= 0 && t < 1 ? rest + (1 - rest) * Math.sin(t * Math.PI) : rest;
      for (const mesh of faces) mesh.morphTargetInfluences[mesh.morphTargetDictionary.Fcl_EYE_Close] = value;
    },
  };
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

// options.audio：boot.js 在 ?hero=vroid 時傳入的 audio.js 實例（程式合成配樂＋音效）；Rumi 預設為 null＝靜音
// options.assets：boot.js 的預載器（createBattleAssets()）；已下載的檔案直接從記憶體取用
export async function createBattle(canvas, { audio = null, assets = null } = {}) {
  assets ||= createBattleAssets().start();
  const heroLoad = assets.gltf('hero');
  heroLoad.catch(() => {});   // rejection is handled by the Promise.all below; avoid an early unhandled-rejection report
  const oniLoad = heroChoice === 'vroid'
    ? assets.gltf('oni').then(gltf => prepareRiggedOni(THREE, gltf))
      .catch(error => { console.warn('oni-v2.glb failed, using procedural oni', error); assets.skip('oni', 'oni-parse'); return null; })
    : Promise.resolve(null);
  const fxUrls = heroChoice === 'vroid'
    ? Promise.all([assets.file('fx-particles'), assets.file('fx-strips')]).then(([particles, strips]) => ({ 'fx-particles.png': particles, 'fx-strips.png': strips }))
      .catch(error => { console.warn('fx textures preload failed, loading directly', error); assets.skip('fx-particles', 'fx-strips'); return null; })
    : Promise.resolve(null);
  const [marchModules, fxModule] = await assets.engine().then(() => loadLazyModules());
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
  // 場景在角色模型還在下載時就先建（貼圖到齊後烘焙），網路與 CPU 同時跑
  const world = marchModules ? marchModules[1].createMarchWorld(THREE, scene, undefined, { source: file => MARCH_FILES[file] ? assets.file(MARCH_FILES[file]) : null }) : (createNightMarket(THREE, scene), null);
  const worldReady = world?.ready
    ? Promise.all(Object.values(MARCH_FILES).map(id => assets.file(id))).then(() => assets.step('world', () => world.ready))
    : null;
  let gltf, riggedOni, fxTextureUrls;
  try {
    [gltf, riggedOni, fxTextureUrls] = await Promise.all([heroLoad, oniLoad, fxUrls, worldReady]);   // 等場景貼圖與烘焙完成，避免開場跳出
  } catch (error) {
    world?.dispose();
    renderer.dispose();
    throw error;
  }
  assets.progress.begin('battle');
  const groundAt = (x, z) => world ? world.heightAt(x, z) : 0;

  const hero = new THREE.Group();
  scene.add(hero);
  const heroModel = gltf.scene;
  const heroLook = heroChoice === 'vroid' ? toonVroidHero(heroModel) : { update() {} };
  if (heroChoice === 'vroid') {
    const heading = document.querySelector('.vital-heading');
    if (heading) { heading.querySelector('b').textContent = '紫刃'; heading.querySelector('small').textContent = '無雙長刀'; heading.querySelector('.hero-mark').textContent = '紫'; }
  }
  const sourceBounds = new THREE.Box3().setFromObject(heroModel);
  const scale = 1.78 / sourceBounds.getSize(new THREE.Vector3()).y;
  heroModel.scale.setScalar(scale);
  heroModel.position.y = -sourceBounds.min.y * scale;
  hero.add(heroModel);
  const mixer = new THREE.AnimationMixer(heroModel);
  // 只保留真正出刀的片段：刀尖速度峰值前約 0.2 秒到峰值後約 0.35 秒，避免把整段收招一起快轉
  const SWING_WINDOWS = { slash1: [0.36, 0.95], slash2: [0.42, 0.98], slash3: [0.58, 1.15], heavy: [0.68, 1.58], heavyfin: [0, 0.8] };
  const clips = gltf.animations.map(clip => {
    const window = SWING_WINDOWS[clip.name];
    if (!window) return clip;
    const cut = THREE.AnimationUtils.subclip(clip, clip.name, Math.round(window[0] * 24), Math.round(window[1] * 24), 24);
    return cut;
  });
  const actions = new Map(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  for (const clip of clips) for (const track of clip.tracks) {
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
  // combat-fx：刀光、打擊、無雙演出與時間倍率（頓格／慢動作／定格）；有它時下方舊特效與倍率都不作用
  let combatFx = null;
  try {
    combatFx = fxModule?.createCombatFx({
      THREE, scene, camera, renderer, hero, heroModel, sword, groundAt,
      hud: document.querySelector('.hud'), quality: isMobile() ? 'mobile' : 'desktop', textureUrls: fxTextureUrls || undefined,
      hudFade: [...document.querySelectorAll('.round-card, .score-card, .hud-footer, #toast')],
      gauge: [document.querySelector('.meter.energy'), document.querySelector('[data-action="special"]')],
    }) || null;
  } catch (error) { console.warn('combat-fx init failed, using built-in effects', error); }
  const fxPos = new THREE.Vector3(), fxFocus = new THREE.Vector3();
  let fxWarm = false;
  if (debug && combatFx) window.__combatFx = combatFx;
  const trail = !combatFx && sword?.isSkinnedMesh ? makeBladeTrail(scene, sword) : { update() {}, clear() {} };
  const ringGeometry = new THREE.RingGeometry(0.86, 1, 40);
  const effects = [];
  const enemies = new Map();
  const corpses = [];   // rigged oni finishing their death clip after the Arena removed them
  const makeEnemy = (role, enemy) => {
    if (role !== 'officer') return riggedOni ? createRiggedOni(THREE, riggedOni, role, cloneSkinned) : createOni(THREE, role);
    // 敵將：守將模型縮小並換色（赤角偏紅、影爪偏藍）
    const actor = riggedOni ? createRiggedOni(THREE, riggedOni, 'boss', cloneSkinned) : createOni(THREE, 'boss');
    actor.root.scale.setScalar(0.8);
    const tinted = [];
    if (riggedOni) actor.root.traverse(object => {
      if (!object.isSkinnedMesh || object.material !== riggedOni.toon) return;
      object.material = riggedOni.toon.clone();
      object.material.color.setHex(enemy?.variant === 'shadow' ? 0x8fa6ff : 0xff8f80);
      tinted.push(object.material);
    });
    const dispose = actor.dispose;
    actor.dispose = () => { dispose(); for (const material of tinted) material.dispose(); };
    return actor;
  };
  const march = marchModules ? new marchModules[0].MarchDirector({ seed: 17, mobile: isMobile() }) : null;
  if (march && debug) window.__march = march;   // ?debug：主控台可用 __march.skipTo(0-3) 跳段
  // 紫刃（?hero=vroid）：跳躍與無雙亂舞；Rumi 預設單場維持原本的 Arena
  const arena = march ? march.arena : new Arena({ seed: 17, warriorMode: true, musou: heroChoice === 'vroid', ...(heroChoice === 'vroid' ? { jump: true, musouFlurry: true } : {}) });
  if (debug) window.__arena = arena;   // ?debug：無頭測試可讀英雄狀態（單場與行軍關）
  if (arena.jumpEnabled) for (const element of document.querySelectorAll('[data-action="jump"], [data-jump-help]')) element.hidden = false;
  const keys = new Set();
  const edges = {};
  const joystick = { x: 0, y: 0, pointer: null };
  // 紫刃：按住「攻」會持續出招（手機連點容易誤觸縮放，也比較累）；其他按鈕仍是按一下一次
  const holds = new HoldRepeat();
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
    if (running) audio?.setPaused(paused || isPortrait());   // 直向暫停時音效也一起壓下
  }
  function clearInput() {
    keys.clear();
    for (const action of Object.keys(edges)) delete edges[action];
    joystick.x = joystick.y = 0;
    holds.clear();
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
    mesh.position.set(x, groundAt(x, z) + 0.025, z);
    mesh.scale.setScalar(radius);
    scene.add(mesh);
    effects.push({ mesh, age: 0, life, radius });
  }
  // ---- 打擊感：頓格、鏡頭震動、半月刀光、火花、擊飛 ----
  let hitstopUntil = 0, shake = 0;
  // 無雙定格（實際秒數，期間遊戲時間不前進）與敵將擊破慢動作
  let freezeUntil = 0, slowUntil = 0, slowScale = 1;
  const shakeOffset = new THREE.Vector3();
  const slashes = [], sparks = [], airborne = new Map();
  // 月牙刀光：中段最寬、兩端收尖；外緣接近白色，越往尾端越淡
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
  function crescent(x, z, facing, { radius = 2.4, tilt = 0, vertical = false, life = 0.22, spin = 1 }) {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(crescentGeometry, material);
    // 刀光弧面：mesh 先放平（或保持直立），orient 把弧心轉向角色正前方（+Z），tilt 沿前方軸滾轉成斜斬
    mesh.rotation.x = vertical ? 0 : -Math.PI / 2;
    const orient = new THREE.Group();
    orient.rotation.y = -Math.PI / 2;
    orient.add(mesh);
    const tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = tilt;
    tiltGroup.add(orient);
    const pivot = new THREE.Group();
    pivot.position.set(x, groundAt(x, z) + 0.95, z);
    pivot.rotation.y = yawFromFacing(facing);
    pivot.add(tiltGroup);
    mesh.scale.setScalar(radius * 0.75);
    scene.add(pivot);
    slashes.push({ pivot, mesh, material, age: 0, life, radius, spin });
    while (slashes.length > 8) { const old = slashes.shift(); scene.remove(old.pivot); old.material.dispose(); }
  }
  function burst(x, z, color, count = 9, height = 1.0) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(sparkGeometry, material);
      mesh.position.set(x, groundAt(x, z) + height + (Math.random() - 0.5) * 0.4, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      sparks.push({ mesh, material, age: 0, life: 0.16 + Math.random() * 0.1 });
      scene.add(mesh);
    }
    while (sparks.length > 60) { const old = sparks.shift(); scene.remove(old.mesh); old.material.dispose(); }
  }
  function launch(enemyId, vy, spin = 0) {
    const state = airborne.get(enemyId) || { y: 0, vy: 0, spin: 0, turn: 0 };
    state.vy = Math.max(state.vy, vy); state.spin = spin;
    airborne.set(enemyId, state);
  }
  function updateImpact(dt) {
    for (let i = slashes.length - 1; i >= 0; i--) {
      const s = slashes[i]; s.age += dt;
      const t = s.age / s.life;
      if (t >= 1) { scene.remove(s.pivot); s.material.dispose(); slashes.splice(i, 1); continue; }
      s.mesh.scale.setScalar(s.radius * (0.75 + 0.3 * Math.sqrt(t)));
      s.mesh.rotation.z += dt * 7 * s.spin;
      s.material.opacity = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.age += dt;
      if (p.age >= p.life) { scene.remove(p.mesh); p.material.dispose(); sparks.splice(i, 1); continue; }
      const t = p.age / p.life;
      p.mesh.scale.set(1 - t * 0.6, 1 + t * 1.8, 1);
      p.material.opacity = 1 - t;
    }
    for (const [id, state] of airborne) {
      state.vy -= 22 * dt; state.y += state.vy * dt; state.turn += state.spin * dt;
      if (state.y <= 0) { state.y = 0; if (state.vy < -3) { state.vy *= -0.25; } else airborne.delete(id); }
    }
    shake = Math.max(0, shake - dt * 2.4);
  }
  function onEvents() {
    for (const event of (march || arena).drainEvents()) {
      const x = toWorldX(event.x ?? arena.hero.x), z = toWorldZ(event.y ?? arena.hero.y);
      combatFx?.onEvent(event, fxPos.set(x, groundAt(x, z), z), enemies.get(event.enemyId)?.root);
      audio?.onEvent(event);
      if (march) marchEvent(event, x, z);
      if (event.type === 'slash' && arena.musou) {
        play(event.kind === 'heavy' ? 'charge' : `combo${event.combo || 1}`, arena.attack?.duration || 0.5);
        lastAnimSerial = arena.attackSerial;
      } else if (event.type === 'slash') {
        const clip = event.kind === 'heavy' ? 'heavy' : `slash${event.combo || 1}`;
        play(clip, event.kind === 'heavy' ? 0.58 : 0.36);
        lastAnimSerial = arena.attackSerial;
        const combo = event.combo || 1;
        if (event.kind === 'heavy') crescent(x, z, event.facing, { radius: 2.5, vertical: true, life: 0.32, spin: 0.5 });
        else crescent(x, z, event.facing, { radius: 2.2 + combo * 0.25, tilt: [0, -0.38, 0.42, 0.05][combo] || 0, life: 0.26, spin: combo % 2 ? 1 : -1 });
      }
      if (event.type === 'dodge') play('roll', 0.42);
      if (event.type === 'swing' && !combatFx) {
        // 無雙模式：每一下打擊各自一道刀光；迴旋段用前後兩道組成整圈
        const radius = (event.radius || 180) / 60;
        const tilt = [0.05, -0.42, 0.38, 0.5, -0.2][(event.combo || 1) - 1] * (event.index % 2 ? -1 : 1);
        if (event.kind === 'special' && event.flurry) {
          crescent(x, z, event.facing + event.index * 1.3, { radius: radius * 0.75, tilt: (event.index % 3 - 1) * 0.3, life: 0.3, spin: event.index % 2 ? -2 : 2 });
          if (event.true) flash(x, z, 0x9a3cff, radius * 0.6, 0.25);
        } else if (event.kind === 'special') {
          for (let i = 0; i < 3; i++) crescent(x, z, event.facing + i * 2.1 + event.index, { radius: radius * 0.8, tilt: 0.15 * (i - 1), life: 0.4, spin: 2.2 });
          flash(x, z, 0xe7c7ff, radius, 0.4);
          shake = Math.max(shake, 0.45);
        } else if (event.kind === 'heavy') {
          crescent(x, z, event.facing, { radius: 2.6, vertical: true, life: 0.34, spin: 0.5 });
          flash(x, z, 0xd8b0ff, radius * 0.9, 0.42);
          burst(x, z, 0xffe0b8, 22, 0.15);
          shake = Math.max(shake, 0.55);
        } else {
          const full = event.combo >= 4;
          crescent(x, z, event.facing, { radius: radius * 0.72, tilt, life: event.last && full ? 0.36 : 0.26, spin: event.index % 2 ? -1.4 : 1.4 });
          if (full) crescent(x, z, event.facing + Math.PI, { radius: radius * 0.72, tilt: -tilt, life: 0.3, spin: event.index % 2 ? -1.4 : 1.4 });
          if (event.last && full) { flash(x, z, 0xd8b0ff, radius * 0.8, 0.36); shake = Math.max(shake, 0.4); }
        }
      }
      if (event.type === 'special' && event.flurry) {
        play('musouFlurry', event.finishAt || 3.6); toast(event.true ? '真・魂門亂舞！' : '魂門亂舞！');
        if (event.true) flash(x, z, 0xa040ff, 2.4, 0.8);
      } else if (event.type === 'special' && arena.musou) {
        play('musou', 2.0); if (!combatFx) toast('魂門亂舞！');
      } else if (event.type === 'special') {
        play('heavyfin', 0.68); flash(x, z, 0xcf96ff, 3.4, 0.48); toast('魂門亂舞！');
        for (let i = 0; i < 3; i++) crescent(x, z, arena.hero.facing + i * 2.1, { radius: 4.2, tilt: 0.1 * i, life: 0.45, spin: 2 });
        shake = Math.max(shake, 0.5);
      }
      if (event.type === 'hit') {
        const heavy = event.source !== 'attack';
        if (!combatFx) {
          flash(x, z, 0xd9a8ff, 0.44, 0.22);
          burst(x, z, heavy ? 0xffd7a8 : 0xe2c4ff, heavy ? 14 : 8);
          shake = Math.max(shake, event.source === 'special' ? 0.5 : heavy ? 0.32 : 0.16);
        }
        // 行軍關：敵將／守將在霸體或未破防時不被打飛、不播受擊動作
        const target = march ? arena.enemies.find(enemy => enemy.id === event.enemyId) : null;
        const staggers = !target || !event.armored && (target.ai !== 'external' || target.guardBrokenUntil > arena.time || event.hp === 0);
        if (staggers && target?.role !== 'boss') launch(event.enemyId, event.source === 'special' ? 7.5 : heavy ? 6 : 1.6, heavy ? 9 : 0);
        if (staggers) enemies.get(event.enemyId)?.onHit?.(event.source, event.hp > 0);
      }
      if (event.type === 'hitstop') hitstopUntil = performance.now() + (event.duration || 0.035) * 2000;
      if (event.type === 'musouFreeze') freezeUntil = performance.now() + (event.real || 0.05) * 1000;
      if (event.type === 'officerDown' || event.type === 'bossDown') {
        const slow = event.slowMo || { scale: 0.2, seconds: 0.8 };
        slowScale = slow.scale; slowUntil = performance.now() + slow.seconds * 1000;
        if (event.banner && !combatFx) toast(event.banner, 2.2);
      }
      if (event.type === 'jump') play('jump', event.duration || 0.8);
      if (event.type === 'airSlash') {
        play('airSlash', 0.32);
        if (!combatFx) crescent(x, z, event.facing, { radius: (event.radius || 150) / 60 * 0.8, tilt: event.index % 2 ? 0.35 : -0.35, life: 0.24, spin: event.index % 2 ? -1.6 : 1.6 });
      }
      if (event.type === 'plunge') play('plunge', 0.5);
      if (event.type === 'land' && event.plunge && !combatFx) {
        flash(x, z, 0xd8b0ff, (event.radius || 190) / 60, 0.45);
        burst(x, z, 0xffe0b8, 20, 0.15);
        shake = Math.max(shake, 0.5);
      }
      if (event.type === 'musouFinish') {
        play('musouFinish', 0.6);
        if (!combatFx) {
          flash(x, z, event.true ? 0xb050ff : 0xf2e2ff, (event.radius || 320) / 60, 0.6);
          burst(x, z, event.true ? 0xc070ff : 0xffe8c0, 36, 0.4);
          shake = Math.max(shake, 0.7);
        }
      }
      if (event.type === 'telegraph') {
        flash(x, z, 0xff665e, event.role === 'boss' ? 1.4 : 0.84, event.duration || 0.7);
        enemies.get(event.enemyId)?.onTelegraph?.(event.duration || 0.7);
      }
      if (event.type === 'hurt') { play('hurt', 0.38); toast('注意敵人起手！', 0.9); }
      if (event.type === 'wave') toast(event.wave === 'boss' ? '魂門守將現身' : `第 ${event.wave} 波敵人`);
      if (event.type === 'kill') {
        if (!combatFx) { flash(x, z, 0x9d66de, event.role === 'boss' ? 2.4 : 0.8, 0.4); burst(x, z, 0xb58cff, 18, 0.9); }
        launch(event.enemyId, 8, 12);
        const actor = enemies.get(event.enemyId);
        if (actor?.rigged) {
          actor.onKill();
          enemies.delete(event.enemyId);
          if (world) settleCorpse(actor);
          corpses.push(actor);
          while (corpses.length > 8) corpses.shift().dispose();
        }
      }
    }
  }
  // ---- 行軍關（?level=march）專用：關卡事件特效、浮字、HUD；預設單場不會呼叫到這些 ----
  const popups = [];
  const popupTextures = new Map();
  function popText(text, x, y, z, color = '#ffffff') {
    const key = `${text}|${color}`;
    if (!popupTextures.has(key)) {
      const canvas2d = document.createElement('canvas');
      const font = 'bold 84px "Noto Sans TC", "PingFang TC", sans-serif';
      let g = canvas2d.getContext('2d');
      g.font = font;
      canvas2d.width = Math.max(128, Math.ceil(g.measureText(text).width + 32));
      canvas2d.height = 128;
      g = canvas2d.getContext('2d');
      g.font = font;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(10,6,20,.85)'; g.strokeText(text, canvas2d.width / 2, 68);
      g.fillStyle = color; g.fillText(text, canvas2d.width / 2, 68);
      const texture = new THREE.CanvasTexture(canvas2d);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData.aspect = canvas2d.width / canvas2d.height;
      popupTextures.set(key, texture);
    }
    const map = popupTextures.get(key);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
    sprite.position.set(x, y, z);
    sprite.scale.set(0.75 * map.userData.aspect, 0.75, 1);
    scene.add(sprite);
    popups.push({ sprite, age: 0, life: 0.6 });
    while (popups.length > 8) { const old = popups.shift(); scene.remove(old.sprite); old.sprite.material.dispose(); }
  }
  function updatePopups(dt) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const popup = popups[i];
      popup.age += dt;
      if (popup.age >= popup.life) { scene.remove(popup.sprite); popup.sprite.material.dispose(); popups.splice(i, 1); continue; }
      popup.sprite.position.y += dt * 1.2;
      popup.sprite.material.opacity = 1 - popup.age / popup.life;
    }
  }
  function clearPopups() {
    for (const popup of popups) { scene.remove(popup.sprite); popup.sprite.material.dispose(); }
    popups.length = 0;
  }
  function marchEvent(event, x, z) {
    const y = groundAt(x, z);   // flash / burst / crescent add the floor height themselves
    if (event.type === 'hint') toast(touchScreen() ? touchHint(event.text) : event.text, event.seconds || 3);
    else if (event.type === 'guard') { if (!combatFx) burst(x, z, 0xbfe4ff, 6, 1.1); popText('擋', x, y + 2.1, z, '#cfe8ff'); }
    else if (event.type === 'guardBreak' && !combatFx) { flash(x, z, 0xffd24a, 1.6, 0.4); burst(x, z, 0xffe07a, 20, 1.1); popText('破', x, y + 2.3, z, '#ffd24a'); shake = Math.max(shake, 0.45); }
    else if (event.type === 'sidestep') flash(x, z, 0x9aa4b8, 0.6, 0.2);
    else if (event.type === 'bossSlam' && !combatFx) { flash(x, z, 0xff5a3c, (event.radius || 180) / 60, 0.5); burst(x, z, 0xffb080, 24, 0.2); shake = Math.max(shake, 0.65); }
    else if (event.type === 'bossSweep' && !combatFx) { flash(x, z, 0xff7050, (event.radius || 216) / 60, 0.4); for (let i = 0; i < 2; i++) crescent(x, z, i * Math.PI, { radius: (event.radius || 216) / 60 * 0.8, life: 0.35, spin: 2.4 }); shake = Math.max(shake, 0.4); }
    else if (event.type === 'roar' && !combatFx) { flash(x, z, 0xff4060, 5, 0.8); shake = Math.max(shake, 0.6); }
    else if (event.type === 'stagger') { flash(x, z, 0xc697ff, (event.radius || 720) / 60 * 0.5, 0.7); toast('敵將倒下，小兵潰散！', 1.8); }
    else if (event.type === 'lanternBroken') { flash(x, z, 0xff3d5a, 2.2, 0.5); burst(x, z, 0xff6a80, 24, 2.2); shake = Math.max(shake, 0.35); }
    else if (event.type === 'lampHit') flash(x, z, 0xff6050, 1.1, 0.25);
    else if (event.type === 'lampBroken') { flash(x, z, 0xff3030, 3, 0.7); shake = Math.max(shake, 0.4); }
    else if (event.type === 'breakableBroken') { flash(x, z, 0xd8a868, 0.9, 0.3); burst(x, z, 0xc89a60, 14, 0.5); }
    else if (event.type === 'pickup') {
      const hx = toWorldX(arena.hero.x), hz = toWorldZ(arena.hero.y), hy = groundAt(hx, hz);
      // 玩家看到的名稱：bun → 護符、bigBun → 靈燈、wine → 魂晶（march.js PICKUP_LABELS）
      const label = marchModules[0].PICKUP_LABELS[event.kind] || '';
      if (event.energy > 0) { flash(hx, hz, 0xc070ff, 1.2, 0.5); popText(`${label} 無雙 +${Math.round(event.energy)}`, hx, hy + 2.2, hz, '#e0b0ff'); }
      if (event.amount > 0) popText(`${label} +${Math.round(event.amount)}`, hx, hy + 2.2, hz, '#8dffb0');
    } else if (event.type === 'heal') flash(toWorldX(arena.hero.x), toWorldZ(arena.hero.y), 0x5cff8a, 1.2, 0.5);
    else if (event.type === 'gateOpen') flash(x, z, 0xb070ff, 5, 0.9);
  }
  /** Rigged corpses sink toward y = 0; on stairs / the gate top keep them on the floor. */
  function settleCorpse(actor) {
    const base = groundAt(actor.root.position.x, actor.root.position.z);
    if (base <= 0) return;
    const holder = new THREE.Group();
    holder.position.y = base;
    scene.add(holder);
    actor.root.position.y -= base;
    holder.add(actor.root);
    const dispose = actor.dispose;
    actor.dispose = () => { dispose(); holder.removeFromParent(); };
  }
  let marchHud = null;
  function updateMarchHud(hud) {
    if (!marchHud) {
      document.body.classList.add('march-level');
      const style = document.createElement('style');
      style.textContent = 'body.march-level .round-card b{font-size:13px;color:#f3e6c8}'
        + '.march-foe{position:absolute;top:calc(74px + var(--safe-top,0px));left:50%;transform:translateX(-50%);width:min(46vw,360px);text-align:center;color:#f0e4ff;font-size:11px;letter-spacing:.12em;text-shadow:0 1px 6px rgba(0,0,0,.7)}'
        + '.march-foe i{display:block;height:6px;margin-top:4px;border-radius:3px;background:rgba(20,16,30,.8);overflow:hidden}.march-foe i b{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff4d6a,#ffb35c)}'
        + '.march-foe.lamp i b{background:linear-gradient(90deg,#3fe0d0,#a0fff4)}';
      document.head.append(style);
      const bar = document.createElement('div');
      bar.className = 'march-foe';
      bar.innerHTML = '<span></span><i><b></b></i>';
      document.querySelector('.hud').append(bar);
      marchHud = { bar, label: bar.querySelector('span'), fill: bar.querySelector('i b'), roundLabel: document.querySelector('.round-card span') };
    }
    $('waveText').textContent = hud.objective;
    marchHud.roundLabel.textContent = hud.segmentName;
    const show = hud.foe || hud.lamp;
    marchHud.bar.hidden = !show;
    marchHud.bar.classList.toggle('lamp', !hud.foe && !!hud.lamp);
    if (hud.foe) {
      marchHud.label.textContent = `${hud.foe.name}${hud.foe.phase === 2 ? '　怒' : ''}`;
      marchHud.fill.style.width = `${hud.foe.hp / hud.foe.maxHp * 100}%`;
    } else if (hud.lamp) {
      marchHud.label.textContent = hud.lamp.down ? '魂燈　重燃中' : '魂燈';
      marchHud.fill.style.width = `${hud.lamp.down ? 0 : hud.lamp.hp / hud.lamp.maxHp * 100}%`;
    }
  }
  function marchResultText(level) {
    const r = level.result || {};
    const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    if (level.state === 'clear') return `評價 ${r.rank}　·　時間 ${clock(r.time)}　·　最大連擊 ${r.maxCombo}　·　剩餘體力 ${Math.ceil(r.hp)}　·　擊倒 ${r.kills}`;
    return `倒在${level.hud().segmentName}（${clock(level.time)}）。看到紅圈先閃避；敵將正面會擋，用重擊破防或繞到背後。`;
  }

  function syncEnemies(dt) {
    const active = new Set();
    for (const enemy of arena.enemies) {
      if (enemy.prop) continue;   // 妖燈等道具由 march-world 繪製
      active.add(enemy.id);
      let actor = enemies.get(enemy.id);
      if (!actor) {
        actor = makeEnemy(enemy.role, enemy); enemies.set(enemy.id, actor); scene.add(actor.root);
        if (actor.rigged) { actor.root.position.set(toWorldX(enemy.x), 0, toWorldZ(enemy.y)); actor.root.rotation.y = yawFromFacing(enemy.facing); }
        actor.onSpawn?.();
      }
      const air = airborne.get(enemy.id);
      if (actor.rigged) {
        // 倒地／起身時畫面位置慢慢追上邏輯位置，避免躺著滑行；擊飛只保留高度，翻滾交給動作本身
        const x = toWorldX(enemy.x), z = toWorldZ(enemy.y);
        if (actor.grounded()) {
          const k = Math.min(1, dt * 1.2);
          actor.root.position.x += (x - actor.root.position.x) * k;
          actor.root.position.z += (z - actor.root.position.z) * k;
        } else {
          const k = Math.min(1, dt * 14);
          actor.root.position.x += (x - actor.root.position.x) * k;
          actor.root.position.z += (z - actor.root.position.z) * k;
          actor.root.rotation.y = turnToward(actor.root.rotation.y, yawFromFacing(enemy.facing), Math.min(1, dt * 10));
        }
        actor.root.position.y = groundAt(actor.root.position.x, actor.root.position.z) + (air ? air.y : 0) + (enemy.lift || 0);
        if (air) combatFx?.trackAirborne(enemy.id, actor.root.position.x, groundAt(actor.root.position.x, actor.root.position.z), actor.root.position.z, air.y);
        actor.update(enemy.action, enemy.actionTime, dt, enemy);
        continue;
      }
      actor.root.position.set(toWorldX(enemy.x), groundAt(toWorldX(enemy.x), toWorldZ(enemy.y)) + (air ? air.y : 0) + (enemy.lift || 0), toWorldZ(enemy.y));
      actor.root.rotation.y = yawFromFacing(enemy.facing) + (air ? air.turn : 0);
      actor.update(enemy.action, enemy.actionTime, dt);
    }
    for (const [id, actor] of enemies) if (!active.has(id)) { scene.remove(actor.root); actor.dispose(); enemies.delete(id); }
    for (let i = corpses.length - 1; i >= 0; i--) {
      const corpse = corpses[i];
      corpse.update('dead', 0, dt);
      if (corpse.finished()) { corpse.dispose(); corpses.splice(i, 1); }
    }
  }
  let heroGround = 0;
  function syncHero(dt) {
    const h = arena.hero;
    heroGround = groundAt(toWorldX(h.x), toWorldZ(h.y));
    hero.position.set(toWorldX(h.x), heroGround + (h.height || 0), toWorldZ(h.y));
    hero.rotation.y = yawFromFacing(h.facing);
    if (h.action === 'idle' || h.action === 'run') play(h.action);
    if (h.action === 'dead' && currentName !== 'death') play('death', 1);
    if (h.action === 'win' && currentName !== 'win') play('win', 1.2);
    mixer.update(dt);
    heroLook.update(performance.now() / 1000);
    hero.updateMatrixWorld(true);
    if (!combatFx) trail.update(h.action === 'attack' || h.action === 'heavy' || h.action === 'special' || h.action === 'airSlash' || h.action === 'plunge');
  }
  function syncCamera(dt) {
    const h = arena.hero;
    const targetYaw = yawFromFacing(h.facing);
    cameraYaw = turnToward(cameraYaw, targetYaw, Math.min(1, dt * (h.action === 'run' ? 2.6 : 1.6)));
    const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    const dist = 3.7;
    // 鏡頭跟地面高度，跳躍時只跟七成，避免整個畫面上下晃又不讓角色出框
    const lift = (hero.position.y - heroGround) * 0.7;
    viewPosition.set(hero.position.x - fx * dist, heroGround + lift + 2.45, hero.position.z - fz * dist);
    camera.position.lerp(viewPosition, Math.min(1, dt * 7));
    world?.constrainCamera(camera.position, hero.position);
    focus.set(hero.position.x + fx * 1.7, heroGround + lift + 0.84, hero.position.z + fz * 1.7);
    camera.lookAt(focus);
  }
  function updateHud() {
    const h = arena.hero;
    $('hpFill').style.width = `${h.hp / h.maxHp * 100}%`;
    $('hpText').textContent = String(Math.ceil(h.hp));
    $('energyFill').style.width = `${h.energy}%`;
    if (march) updateMarchHud(march.hud());
    else $('waveText').textContent = arena.bossQueued || arena.enemies.some(enemy => enemy.role === 'boss') ? '魂門守將' : arena.wave === 1 ? '第一波' : '第二波';
    $('killText').textContent = String(arena.kills).padStart(2, '0');
    if (!combatFx) $('comboText').textContent = march ? (march.combo >= 3 ? `${march.combo} 連擊` : '') : h.combo > 1 && h.action === 'attack' ? `${h.combo} 連斬` : '';
    document.querySelector('[data-action="special"]')?.classList.toggle('ready', h.energy >= 100);
    if (arena.time > toastUntil) $('toast').textContent = '';
  }
  function finish() {
    running = false;
    stopFrames();
    $('resultTitle').textContent = arena.state === 'win' ? '夜市重歸寧靜' : '重新集結';
    $('resultText').textContent = march ? marchResultText(march) : `擊倒 ${arena.kills} 名敵人。${arena.state === 'win' ? '你已完成這次 3D 單場試作。' : '看到攻擊警示先閃避；普攻接重擊可以打退一群敵人。'}`;
    $('result').hidden = false;
    document.body.dataset.mode = 'result';
  }
  function frame(timestamp) {
    raf = 0;
    if (!running || paused || document.hidden || isPortrait()) return;
    raf = requestAnimationFrame(frame);
    if (!pacer.shouldRender(timestamp)) return;
    const realDt = lastAt ? Math.min(0.05, (timestamp - lastAt) / 1000) : 1 / 60;
    lastAt = timestamp;
    // 遊戲時間 = 實際時間 × 無雙慢動作（arena.timeScale）× 擊破慢動作；定格期間不推進
    const now = performance.now();
    let dt;
    if (combatFx) dt = realDt * combatFx.timeScale();   // combat-fx 讀同一組事件（hitstop／musouStart.timeScale／musouFreeze／officerDown.slowMo）統一套用，不重複相乘
    else {
      dt = now < hitstopUntil ? realDt * 0.06 : realDt;
      if (arena.timeScale) dt *= arena.timeScale();
      if (now < slowUntil) dt *= slowScale;
      if (now < freezeUntil) dt = 0;
    }
    for (const action of holds.tick(realDt)) edges[action] = true;
    const inputX = joystick.x + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const inputY = joystick.y + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    const moveX = fx * -inputY + -fz * inputX;
    const moveZ = fz * -inputY + fx * inputX;
    if (march) march.update(dt, { x: moveX, y: moveZ, ...edges });
    else arena.update(dt, { x: moveX, y: moveZ, ...edges });
    for (const key of Object.keys(edges)) delete edges[key];
    onEvents();
    syncEnemies(dt);
    world?.update(march.view(), dt, performance.now() / 1000);
    syncHero(dt);
    syncCamera(realDt);
    updateImpact(combatFx ? dt : realDt);
    updatePopups(realDt);
    if (combatFx) {
      if (march) combatFx.setCombo(march.combo);
      combatFx.update(realDt, dt, { heroAction: arena.hero.action, energy: arena.hero.energy });
    }
    audio?.update(realDt, realDt > 0 ? dt / realDt : 1, arena.hero);   // 慢動作：音樂低通＋音效降調；hitstop 短定格不觸發
    if (shake > 0) {
      shakeOffset.set((Math.random() - 0.5), (Math.random() - 0.5) * 0.7, (Math.random() - 0.5)).multiplyScalar(shake * 0.22);
      camera.position.add(shakeOffset);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.age += dt;
      if (effect.age >= effect.life) { scene.remove(effect.mesh); effect.mesh.material.dispose(); effects.splice(i, 1); continue; }
      const progress = effect.age / effect.life;
      effect.mesh.scale.setScalar(effect.radius * (1 + progress * 0.95));
      effect.mesh.material.opacity = (1 - progress) * 0.7;
    }
    combatFx?.cameraPre(camera, fxFocus.set(hero.position.x, hero.position.y + 1.05, hero.position.z));
    renderer.render(scene, camera);
    combatFx?.cameraPost(camera);
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
    if (march) march.reset(); else arena.reset();
    if (riggedOni) {
      for (const actor of enemies.values()) actor.dispose();
      enemies.clear();
      for (const corpse of corpses) corpse.dispose();
      corpses.length = 0;
    }
    trail.clear();
    combatFx?.reset(); combatFx?.setKills(0);
    audio?.reset();   // 配樂由重置時的 segment／wave 事件啟動（入口市集）
    clearPopups();
    cameraYaw = Math.PI;
    camera.position.set(0, 2.45, 3.7);
    lastAnimSerial = 0;
    onEvents();
    syncEnemies(0);
    syncHero(0);
    syncCamera(1);
    if (combatFx && !fxWarm) { fxWarm = true; prewarmShaders(); }
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
  // 手機第一次畫到某種材質時才編譯 shader，會卡一下：開場先把鬼兵、守將、閃光圈、火花、浮字的材質一起編好。
  // 閃光圈等材質用完就 dispose，全部消失時 three 會連 shader 一起刪掉、下次出現再重編；各留一個隱形的在場上，shader 就一直在
  function prewarmShaders() {
    const probes = riggedOni ? ['grunt', 'boss'].map(role => makeEnemy(role)) : [];
    for (const actor of probes) scene.add(actor.root);
    const effectCount = effects.length, sparkCount = sparks.length, popupCount = popups.length;
    flash(0, 0);
    burst(0, 0, 0xffffff, 1);
    popText('擋', 0, 0, 0);
    const keepers = [...effects.splice(effectCount).map(effect => effect.mesh), ...sparks.splice(sparkCount).map(spark => spark.mesh), ...popups.splice(popupCount).map(popup => popup.sprite)];
    for (const keeper of keepers) keeper.visible = false;
    combatFx.prewarm(probes[0]?.root || [...enemies.values()][0]?.root);
    if (probes[1]) combatFx.prewarm(probes[1].root);
    for (const actor of probes) { scene.remove(actor.root); actor.dispose(); }
  }
  // 背景預熱（boot.js 在標題畫面、戰場已建好時呼叫）：先編 shader、先上傳貼圖，按開始後只剩重置與第一格
  let warmed = false;
  function warm() {
    if (warmed || running) return;
    warmed = true;
    if (combatFx && !fxWarm) { fxWarm = true; prewarmShaders(); }
    scene.traverse(object => {
      for (const material of [].concat(object.material || [])) {
        for (const value of Object.values(material)) if (value?.isTexture) renderer.initTexture(value);
      }
    });
    renderer.compile(scene, camera);
  }
  function pause(value = !paused) {
    if (!running) return;
    paused = value;
    $('pauseOverlay').hidden = !paused;
    if (paused) stopFrames(); else resumeFrames();
    audio?.setPaused(paused);
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
  for (const button of document.querySelectorAll('[data-action]')) {
    button.addEventListener('pointerdown', event => {
      if (!running || paused || isPortrait()) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); edges[button.dataset.action] = true;
      if (heroChoice === 'vroid' && button.dataset.action === 'attack') holds.press('attack', event.pointerId);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => holds.release(event.pointerId));
  }
  window.addEventListener('keydown', event => {
    if (!running) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    if (key === 'p') { pause(); return; }
    if (paused) return;
    keys.add(key);
    const action = { j: 'attack', k: 'heavy', shift: 'dodge', e: 'special', ...(arena.jumpEnabled ? { ' ': 'jump' } : {}) }[key];
    if (action && !event.repeat) edges[action] = true;
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  $('pauseBtn').addEventListener('click', () => pause(true));
  $('resume').addEventListener('click', () => pause(false));
  $('retry').addEventListener('click', start);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);   // iOS 網址列收合、分割畫面時 window resize 不一定會觸發
  window.addEventListener('blur', () => { if (running) pause(true); });
  // 鎖屏、切 App：回來時停在暫停畫面，不直接接著打
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (running) pause(true); stopFrames(); } else resumeFrames(); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stopFrames(); toast('3D 畫面暫停，請重新載入頁面。', 10); });
  if (debug) document.body.classList.add('debug');
  resize();
  assets.progress.complete('battle');
  assets.release();
  return { start, warm, pause, arena, scene, camera, renderer };
}
