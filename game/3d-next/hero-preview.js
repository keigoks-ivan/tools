import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { toonVroidHero } from './battle.js?v=20261002c';
import { createHeroEquipment } from './hero-equipment.js?v=20261002c';
import { HEROES } from './heroes.js?v=20261002b';
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
let rotating = false, angle = 0, action = 'idle';
let subject = 'all', detail = false;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
  const x = subject === 'all' ? 0 : (Number(subject) - 1) * 1.35;
  camera.position.set(x, detail ? 1.58 : 1.3, detail ? 0.92 : subject === 'all' ? Math.max(6.5, 7 / camera.aspect) : Math.max(subject === '1' ? 5 : 3.4, 2.2 / camera.aspect));
  camera.lookAt(x, detail ? 1.56 : 0.95, 0); camera.updateProjectionMatrix();
  actors.forEach((actor, i) => actor.turntable.visible = subject === 'all' || i === Number(subject));
  document.querySelector('footer').hidden = detail;
  document.querySelector('footer').style.gridTemplateColumns = subject === 'all' ? 'repeat(3,1fr)' : '1fr';
  document.querySelectorAll('footer > div').forEach((item, i) => { item.hidden = subject !== 'all' && i !== Number(subject); });
  document.getElementById('detail').textContent = detail ? '全身檢視' : '髮型近看';
}
resize(); window.addEventListener('resize', resize);
try {
  const source = await new GLTFLoader().loadAsync('../assets/heroes/swordswoman-v4.glb?v=20260925d');
  for (const [i, profile] of Object.values(HEROES).entries()) {
    const model = clone(source.scene);
    const clonedMaterials = new Map();
    model.traverse(mesh => { if (!mesh.isMesh) return; mesh.material = [].concat(mesh.material).map(m => { if (!clonedMaterials.has(m)) clonedMaterials.set(m, m.clone()); return clonedMaterials.get(m); }); if (mesh.material.length === 1) mesh.material = mesh.material[0]; });
    const look = toonVroidHero(model);
    const equipment = createHeroEquipment(THREE, model, model.getObjectByName('Hero_sword'));
    equipment.apply(profile); await equipment.ready;
    const turntable = new THREE.Group(); turntable.position.x = (i - 1) * 1.35; turntable.add(model); scene.add(turntable);
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(source.animations.find(c => c.name === 'idle')).play();
    actors.push({ model, turntable, mixer, look, equipment });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x252738, roughness: 0.55, metalness: 0.35 }));
    plinth.position.set(turntable.position.x, -0.025, 0); scene.add(plinth);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.475, 0.003, 4, 48), new THREE.MeshBasicMaterial({ color: profile.tint })); rim.rotation.x = Math.PI / 2; rim.position.set(turntable.position.x, -0.01, 0); scene.add(rim);
    actors[i].plinth = plinth; actors[i].rim = rim;
  }
  document.getElementById('status').textContent = '';
  document.getElementById('front').onclick = () => { angle = 0; rotating = false; };
  document.getElementById('back').onclick = () => { angle = Math.PI; rotating = false; };
  document.getElementById('rotate').onclick = () => { rotating = !rotating; };
  document.getElementById('pose').onclick = () => {
    action = action === 'idle' ? 'combo2' : 'idle';
    for (const actor of actors) { actor.mixer.stopAllAction(); actor.mixer.clipAction(source.animations.find(c => c.name === action)).reset().play(); }
  };
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
    actor.turntable.rotation.y = 0; actor.mixer.update(dt); actor.equipment.update(); actor.look.update(t / 1000);
    actor.model.updateMatrixWorld(true);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.model.getObjectByName('J_Bip_C_Hips').getWorldQuaternion(new THREE.Quaternion()));
    actor.turntable.rotation.y = angle - Math.atan2(facing.x, facing.z);
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
