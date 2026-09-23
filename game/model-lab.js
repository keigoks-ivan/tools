import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const HEROES = [
  { id: 'rumi', name: 'RUMI', number: '01', file: './assets/heroes/rumi.glb?v=20260924a' },
  { id: 'mira', name: 'MIRA', number: '02', file: './assets/heroes/mira.glb?v=20260924a' },
  { id: 'zoey', name: 'ZOEY', number: '03', file: './assets/heroes/zoey.glb?v=20260924a' },
];
const ANIMATIONS = ['idle', 'run', 'slash1', 'heavy', 'roll'];
const stage = document.querySelector('#stage');
const statusLight = document.querySelector('#status-light');
const statusText = document.querySelector('#status-text');
const retryButton = document.querySelector('#retry');
const loader = new GLTFLoader();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1728);
scene.fog = new THREE.Fog(0x0b1728, 8, 17);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(stage.clientWidth, stage.clientHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
stage.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xb9d8ff, 0x182238, 1.9));
const key = new THREE.DirectionalLight(0xffefd8, 3.1);
key.position.set(-3.8, 6.5, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -2;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 15;
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.025;
scene.add(key);
const fill = new THREE.DirectionalLight(0x8eafff, 1.35);
fill.position.set(4, 3.5, -4);
scene.add(fill);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x111e30, roughness: 0.88, metalness: 0.08 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.015;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(14, 28, 0x2b475a, 0x203044);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const ramp = new THREE.DataTexture(new Uint8Array([74, 126, 185, 255]), 4, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false;
ramp.needsUpdate = true;

let current = null;
let mixer = null;
let activeAction = null;
let paused = false;
let bindPoseMode = true;
let raf = 0;
let lastDraw = 0;
let selectedHero = 'rumi';
let selectedAnimation = 'idle';
let orbitYaw = 0;
let activeView = 'front';
let dragging = false;
let dragX = 0;
let loadToken = 0;
let lastFrameStats = { renders: 0, fpsCap: 30, paused: false, hidden: document.hidden };
const clock = new THREE.Clock();

const setStatus = (message, state = '') => {
  statusText.textContent = message;
  statusLight.className = `status-light${state ? ` ${state}` : ''}`;
  retryButton.classList.toggle('visible', state === 'error');
};

function convertMaterial(original) {
  const common = {
    name: original.name,
    color: original.color ? original.color.clone() : new THREE.Color(0xffffff),
    map: original.map || null,
    vertexColors: Boolean(original.vertexColors),
    transparent: Boolean(original.transparent),
    opacity: original.opacity,
    alphaMap: original.alphaMap || null,
    alphaTest: original.alphaTest || 0,
    side: original.side,
    depthWrite: original.depthWrite,
  };
  if (original.name === 'HeroDetails') {
    return new THREE.MeshBasicMaterial({ ...common, toneMapped: false });
  }
  return new THREE.MeshToonMaterial({ ...common, gradientMap: ramp });
}

function makeOutlineMaterial(rootScale) {
  const width = 0.0035 / rootScale;
  const material = new THREE.MeshBasicMaterial({ color: 0x101321, side: THREE.BackSide, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `transformed += normal * ${width.toFixed(5)};\n#include <project_vertex>`,
    );
  };
  material.customProgramCacheKey = () => `model-lab-outline-${width.toFixed(5)}`;
  return material;
}

function addOutline(object, material) {
  if (object.userData.noOutline || object.userData.isOutline) return null;
  if (!object.material) return null;

  const outline = object.clone(false);
  outline.name = `${object.name || 'mesh'}_ink`;
  outline.userData = { ...outline.userData, isOutline: true };
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = object.renderOrder - 1;
  outline.material = material;
  outline.raycast = () => {};
  object.parent.add(outline);
  return outline;
}

function disposeRoot(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isSkinnedMesh && object.skeleton) skeletons.add(object.skeleton);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture && value !== ramp) textures.add(value);
      }
    }
  });
  scene.remove(root);
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function disposeSourceMaterials(root) {
  const materials = new Set();
  root.traverse(object => {
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const material of materials) material.dispose();
}

function getClip(clips, requested) {
  const key = requested.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clips.find(clip => clip.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key)
    || clips.find(clip => clip.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(key));
}

function lockHipsRootMotion(clips) {
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (!/Hips\.position$/i.test(track.name) || track.values.length < 3) continue;
      const values = track.values;
      const x = values[0];
      const z = values[2];
      for (let index = 0; index < values.length; index += 3) {
        values[index] = x;
        values[index + 2] = z;
      }
      track.needsUpdate = true;
    }
  }
}

function showBindPose() {
  if (!current || !mixer) return;
  mixer.stopAllAction();
  activeAction = null;
  current.root.traverse(object => {
    if (object.isSkinnedMesh && object.skeleton) object.skeleton.pose();
  });
  current.root.updateMatrixWorld(true);
  bindPoseMode = true;
  paused = true;
  cancelAnimationFrame(raf);
  raf = 0;
  document.querySelectorAll('[data-animation]').forEach(button => button.classList.remove('active'));
  document.querySelector('#pause').textContent = '▶　恢復動作';
  setStatus('綁定姿勢 · 靜態骨架檢視', 'ready');
  renderOnce();
}

function setAnimation(name) {
  selectedAnimation = name;
  bindPoseMode = false;
  document.querySelectorAll('[data-animation]').forEach(button => {
    button.classList.toggle('active', button.dataset.animation === name);
  });
  if (!mixer || !current) return;
  const clip = getClip(current.clips, name);
  if (!clip) {
    setStatus(`找不到「${name}」動作 · ${current.clips.map(item => item.name).join('、') || '此模型沒有動畫'}`, 'error');
    renderOnce();
    return;
  }
  const next = mixer.clipAction(clip);
  if (activeAction && activeAction !== next) activeAction.fadeOut(0.16);
  next.paused = false;
  next.reset().fadeIn(0.16).play();
  activeAction = next;
  paused = false;
  document.querySelector('#pause').textContent = 'Ⅱ　暫停動作';
  setStatus(`${current.clips.length} 個動作已載入 · ${clip.name}`, 'ready');
  startLoop();
}

function orientCamera(view) {
  const positions = {
    front: [0, 1.12, 4.35],
    side: [4.35, 1.12, 0],
    back: [0, 1.12, -4.35],
    face: [0, 1.53, 1.45],
  };
  activeView = view;
  orbitYaw = 0;
  camera.position.set(...positions[view]);
  camera.lookAt(0, view === 'face' ? 1.53 : 0.96, 0);
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  renderOnce();
}

function fitModel(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const bodyBounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh || object.userData.heroPart === 'sword') return;
    const meshBounds = new THREE.Box3().setFromObject(object);
    bounds.union(meshBounds);
    if (object.userData.heroPart === 'body') bodyBounds.union(meshBounds);
  });
  if (bodyBounds.isEmpty()) bodyBounds.copy(bounds);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('角色模型沒有有效的綁定姿勢高度');
  const scale = 1.78 / height;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3();
  const scaledBodyBounds = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh || object.userData.heroPart === 'sword') return;
    const meshBounds = new THREE.Box3().setFromObject(object);
    scaledBounds.union(meshBounds);
    if (object.userData.heroPart === 'body') scaledBodyBounds.union(meshBounds);
  });
  if (scaledBodyBounds.isEmpty()) scaledBodyBounds.copy(scaledBounds);
  root.position.set(
    root.position.x - (scaledBodyBounds.min.x + scaledBodyBounds.max.x) / 2,
    root.position.y - scaledBounds.min.y,
    root.position.z - (scaledBodyBounds.min.z + scaledBodyBounds.max.z) / 2,
  );
  root.updateMatrixWorld(true);
  return { height: 1.78, sourceHeight: height, scale };
}

async function loadHero(id) {
  const hero = HEROES.find(item => item.id === id);
  if (!hero) return;
  const token = ++loadToken;
  selectedHero = id;
  paused = true;
  cancelAnimationFrame(raf);
  raf = 0;
  if (mixer) mixer.stopAllAction();
  mixer = null;
  activeAction = null;
  disposeRoot(current?.root);
  current = null;
  document.querySelectorAll('[data-hero]').forEach(button => button.classList.toggle('active', button.dataset.hero === id));
  document.querySelector('#caption-name').textContent = `${hero.name}　/　${hero.number}`;
  setStatus(`正在載入 ${hero.name}…`);
  renderOnce();

  let clonedRoot = null;
  let sourceRoot = null;
  try {
    const gltf = await loader.loadAsync(hero.file);
    sourceRoot = gltf.scene;
    if (token !== loadToken) {
      disposeRoot(sourceRoot);
      sourceRoot = null;
      return;
    }
    const root = clonedRoot = SkeletonUtils.clone(gltf.scene);
    lockHipsRootMotion(gltf.animations);
    root.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = false;
      object.frustumCulled = false;
      if (Array.isArray(object.material)) object.material = object.material.map(convertMaterial);
      else if (object.material) object.material = convertMaterial(object.material);
    });
    disposeSourceMaterials(gltf.scene);
    const scaleInfo = fitModel(root);
    const outlines = [];
    const inkMaterial = makeOutlineMaterial(root.scale.x);
    root.traverse(object => {
      if (object.isMesh && !object.userData.isOutline) {
        const outline = addOutline(object, inkMaterial);
        if (outline) outlines.push(outline);
      }
    });
    scene.add(root);
    sourceRoot = null;
    mixer = new THREE.AnimationMixer(root);
    current = { id, root, clips: gltf.animations, scaleInfo, outlines };
    paused = false;
    orientCamera('front');
    if (bindPoseMode) showBindPose();
    else setAnimation(selectedAnimation);
  } catch (error) {
    if (token !== loadToken) return;
    if (clonedRoot) disposeRoot(clonedRoot);
    if (sourceRoot) {
      disposeSourceMaterials(sourceRoot);
      // The clone shares geometry and textures; these remain owned by the clone on success.
      // An early setup failure has no live clone after disposeRoot above.
      if (!clonedRoot) disposeRoot(sourceRoot);
    }
    paused = true;
    setStatus(`${hero.name} 模型尚未就緒，完成匯出後可重新載入。`, 'error');
    console.info(`Model Lab could not load ${hero.file}:`, error);
    renderOnce();
  }
}

function renderFrame(timestamp) {
  raf = 0;
  if (document.hidden || paused || !mixer) return;
  if (timestamp - lastDraw >= 1000 / 30 - 0.5) {
    const delta = Math.min(clock.getDelta(), 0.08);
    mixer.update(delta);
    renderer.render(scene, camera);
    lastDraw = timestamp;
    lastFrameStats.renders++;
    lastFrameStats.paused = paused;
  }
  raf = requestAnimationFrame(renderFrame);
}

function startLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (!document.hidden && !paused && mixer) {
    clock.start();
    lastDraw = 0;
    raf = requestAnimationFrame(renderFrame);
  }
}

function renderOnce() {
  if (document.hidden) return;
  renderer.render(scene, camera);
  lastFrameStats.renders++;
  lastFrameStats.paused = paused;
}

document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => loadHero(button.dataset.hero)));
document.querySelectorAll('[data-animation]').forEach(button => button.addEventListener('click', () => setAnimation(button.dataset.animation)));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => orientCamera(button.dataset.view)));
document.querySelector('#bind-pose').addEventListener('click', showBindPose);
document.querySelector('#pause').addEventListener('click', event => {
  if (paused && !activeAction && bindPoseMode) {
    setAnimation(selectedAnimation);
    return;
  }
  paused = !paused;
  event.currentTarget.textContent = paused ? '▶　繼續動作' : 'Ⅱ　暫停動作';
  if (paused) {
    if (activeAction) activeAction.paused = true;
    cancelAnimationFrame(raf);
    raf = 0;
    renderOnce();
  } else {
    if (activeAction) activeAction.paused = false;
    startLoop();
  }
});
retryButton.addEventListener('click', () => loadHero(selectedHero));

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  dragging = true;
  dragX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!dragging) return;
  const delta = event.clientX - dragX;
  dragX = event.clientX;
  orbitYaw += delta * 0.008;
  const distance = activeView === 'face' ? 1.45 : 4.35;
  const targetY = activeView === 'face' ? 1.53 : 0.96;
  const cameraY = activeView === 'face' ? 1.53 : 1.12;
  camera.position.set(Math.sin(orbitYaw) * distance, cameraY, Math.cos(orbitYaw) * distance);
  camera.lookAt(0, targetY, 0);
  renderOnce();
});
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderOnce();
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(stage);
document.addEventListener('visibilitychange', () => {
  lastFrameStats.hidden = document.hidden;
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
    clock.stop();
  } else if (!paused && mixer) startLoop();
  else renderOnce();
});

window.__modelLab = {
  get currentRoot() { return current?.root || null; },
  get currentHero() { return selectedHero; },
  get currentAnimation() { return selectedAnimation; },
  get stats() { return { ...lastFrameStats, paused, clipCount: current?.clips.length || 0, modelLoaded: Boolean(current) }; },
  play: setAnimation,
  view: orientCamera,
  bindPose: showBindPose,
  select: loadHero,
  reload: () => loadHero(selectedHero),
};

setStatus('正在載入 RUMI…');
resize();
loadHero('rumi');
