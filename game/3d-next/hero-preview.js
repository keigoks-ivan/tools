import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { toonVroidHero } from './battle.js?v=20261002g';
import { createHeroEquipment } from './hero-equipment.js?v=20261002d';
import { createPolearmClips } from './hero-motion.js?v=20261002g';
import { HEROES } from './heroes.js?v=20261002d';
import { createHeroEnvironment } from './hero-hair.js?v=20261002c';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c101a);
scene.environment = createHeroEnvironment(THREE, renderer).texture;
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
scene.add(new THREE.HemisphereLight(0xd9e5ff, 0x3a2e43, 2.5));
for (const [color, intensity, pos] of [[0xffefd8, 3, [-3, 5, 5]], [0xa3cfff, 2.5, [4, 2, -2]]]) {
  const light = new THREE.DirectionalLight(color, intensity); light.position.set(...pos); scene.add(light);
}
const actors = [];
const controls = document.querySelectorAll('#controls button, #controls select, #motion-controls button, #motion-controls select, #motion-time');
controls.forEach(control => { control.disabled = true; });
let rotating = false, angle = 0, action = 'idle';
let subject = 'all', detail = false;
let motion = 'azureIdle', paused = false, speed = 1;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
  const x = subject === 'all' ? 0 : (Number(subject) - 1) * 1.35;
  camera.position.set(x, detail ? 1.58 : 1.3, detail ? 0.92 : subject === 'all' ? Math.max(6.5, 7 / camera.aspect) : Math.max(subject === '1' ? 5 : 3.4, 2.2 / camera.aspect));
  camera.lookAt(x, detail ? 1.56 : 0.95, 0); camera.updateProjectionMatrix();
  actors.forEach((actor, i) => actor.turntable.visible = subject === 'all' || i === Number(subject));
  document.querySelector('footer').hidden = detail;
  document.getElementById('motion-controls').hidden = subject !== '1' || detail;
  document.querySelector('footer').style.gridTemplateColumns = subject === 'all' ? 'repeat(3,1fr)' : '1fr';
  document.querySelectorAll('footer > div').forEach((item, i) => { item.hidden = subject !== 'all' && i !== Number(subject); });
  document.getElementById('detail').textContent = detail ? '全身檢視' : '髮型近看';
}
resize(); window.addEventListener('resize', resize);
try {
  const source = await new GLTFLoader().loadAsync('../assets/heroes/swordswoman-v4.glb?v=20260925d');
  const clips = [...source.animations, ...createPolearmClips(THREE, source.scene, source.animations)];
  for (const [i, profile] of Object.values(HEROES).entries()) {
    const model = clone(source.scene);
    const clonedMaterials = new Map();
    model.traverse(mesh => { if (!mesh.isMesh) return; mesh.material = [].concat(mesh.material).map(m => { if (!clonedMaterials.has(m)) clonedMaterials.set(m, m.clone()); return clonedMaterials.get(m); }); if (mesh.material.length === 1) mesh.material = mesh.material[0]; });
    const look = toonVroidHero(model);
    const equipment = createHeroEquipment(THREE, model, model.getObjectByName('Hero_sword'));
    equipment.apply(profile); await equipment.ready;
    const turntable = new THREE.Group(); turntable.position.x = (i - 1) * 1.35; turntable.add(model); scene.add(turntable);
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clips.find(c => c.name === (profile.id === 'azure' ? 'azureIdle' : 'idle'))).play();
    actors.push({ model, turntable, mixer, look, equipment, clips, profile });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x252738, roughness: 0.55, metalness: 0.35 }));
    plinth.position.set(turntable.position.x, -0.025, 0); scene.add(plinth);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.475, 0.003, 4, 48), new THREE.MeshBasicMaterial({ color: profile.tint })); rim.rotation.x = Math.PI / 2; rim.position.set(turntable.position.x, -0.01, 0); scene.add(rim);
    actors[i].plinth = plinth; actors[i].rim = rim;
  }
  document.getElementById('status').textContent = '';
  controls.forEach(control => { control.disabled = false; });
  subject = document.getElementById('subject').value; resize();
  document.getElementById('front').onclick = () => { angle = 0; rotating = false; };
  document.getElementById('side').onclick = () => { angle = Math.PI / 2; rotating = false; };
  document.getElementById('back').onclick = () => { angle = Math.PI; rotating = false; };
  document.getElementById('rotate').onclick = () => { rotating = !rotating; };
  document.getElementById('pose').onclick = () => {
    action = action === 'idle' ? 'combo2' : 'idle';
    for (const actor of actors) { if (actor.profile.id === 'azure') { motion = action === 'idle' ? 'azureIdle' : 'azureSweep'; document.getElementById('motion').value = motion; setMotion(motion); continue; } actor.mixer.stopAllAction(); actor.mixer.clipAction(actor.clips.find(c => c.name === action)).reset().play(); }
  };
  const azure = actors.find(actor => actor.profile.id === 'azure');
  const clock = document.getElementById('motion-time');
  function setMotion(name) {
    motion = name; azure.mixer.stopAllAction();
    const clip = azure.clips.find(c => c.name === name);
    azure.mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity).play(); clock.max = clip.duration;
    azure.mixer.setTime(0); clock.value = 0;
  }
  setMotion(document.getElementById('motion').value);
  document.getElementById('motion').onchange = event => setMotion(event.target.value);
  document.getElementById('motion-play').onclick = () => {
    paused = !paused; document.getElementById('motion-play').textContent = paused ? '播放' : '暫停';
    const clip = azure.clips.find(c => c.name === motion), playing = azure.mixer.clipAction(clip);
    if (!paused) { if (playing.time >= clip.duration) playing.reset(); playing.paused = false; playing.setLoop(THREE.LoopRepeat, Infinity).play(); }
  };
  function seek(time) {
    paused = true; document.getElementById('motion-play').textContent = '播放';
    const playing = azure.mixer.clipAction(azure.clips.find(c => c.name === motion));
    playing.paused = false; playing.enabled = true; playing.setLoop(THREE.LoopOnce, 1); playing.clampWhenFinished = true;
    azure.mixer.setTime(time);
  }
  clock.oninput = () => seek(Number(clock.value));
  document.getElementById('motion-step').onclick = () => seek(Math.min(Number(clock.max), Number(clock.value) + 1/60));
  document.getElementById('motion-speed').onchange = event => { speed = Number(event.target.value); };
  document.getElementById('subject').onchange = event => { subject = event.target.value; if (subject === 'all') detail = false; resize(); };
  document.getElementById('detail').onclick = () => {
    detail = !detail;
    if (detail && subject === 'all') { subject = '0'; document.getElementById('subject').value = '0'; }
    document.getElementById('detail').textContent = detail ? '全身檢視' : '髮型近看'; resize();
  };
} catch (error) { document.getElementById('status').textContent = '模型載入失敗，請重新整理。'; console.error(error); }
let last = 0;
function frame(t) {
  requestAnimationFrame(frame); if (document.hidden) { last = t; return; } if (t - last < 33) return;
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (rotating) angle += dt * 0.5;
  for (const actor of actors) {
    actor.turntable.rotation.y = 0; if (actor.profile.id !== 'azure' || !paused) actor.mixer.update(dt * (actor.profile.id === 'azure' ? speed : 1)); actor.equipment.update(); actor.look.update(t / 1000);
    actor.model.updateMatrixWorld(true);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.model.getObjectByName('J_Bip_C_Hips').getWorldQuaternion(new THREE.Quaternion()));
    // The Azure clips are authored facing +Z. Do not cancel their hip turn.
    actor.turntable.rotation.y = actor.profile.id === 'azure' ? angle : angle - Math.atan2(facing.x, facing.z);
    if (actor.profile.id === 'azure') {
      const time = actor.mixer.clipAction(actor.clips.find(c => c.name === motion)).time;
      document.getElementById('motion-time').value = time;
      document.getElementById('motion-clock').textContent = `${time.toFixed(2)}s`;
    }
    actor.plinth.visible = actor.rim.visible = actor.turntable.visible;
    actor.model.traverse(o => { if (/_Hand_weapon$/.test(o.name)) o.visible = !detail; });
  }
  if (detail && subject !== 'all') {
    const actor = actors[Number(subject)]; actor.model.updateMatrixWorld(true);
    const head = actor.model.getObjectByName('J_Bip_C_Head').getWorldPosition(new THREE.Vector3());
    camera.position.set(head.x, head.y + 0.1, head.z + 0.9); camera.lookAt(head.x, head.y + 0.1, head.z);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
