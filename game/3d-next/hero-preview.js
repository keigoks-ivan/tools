import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { toonVroidHero } from './battle.js?v=20261002m';
import { createHeroEquipment } from './hero-equipment.js?v=20261002m';
import { createGreatswordClips, createArcherClips, createComboPreview } from './hero-motion.js?v=20261002m';
import { HEROES } from './heroes.js?v=20261002m';
import { createArrowFx } from './hero-bow.js?v=20261002m';
import { createHeroSpecialFx } from './hero-special-fx.js?v=20261002m';
import { createHeroEnvironment } from './hero-hair.js?v=20261002h';

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
const profiles = Object.values(HEROES);
let motion = 'azureIdle', motionActor = null, paused = false, speed = 1;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
  const x = subject === 'all' ? 0 : (Number(subject) - (profiles.length - 1) / 2) * 1.35;
  camera.position.set(x, detail ? 1.58 : 1.3, detail ? 0.92 : subject === 'all' ? Math.max(8.5, 9 / camera.aspect) : Math.max(subject === '1' ? 5 : subject === '3' ? 4.3 : 3.4, 2.2 / camera.aspect));
  camera.lookAt(x, detail ? 1.56 : 0.95, 0); camera.updateProjectionMatrix();
  actors.forEach((actor, i) => actor.turntable.visible = subject === 'all' || i === Number(subject));
  document.querySelector('footer').hidden = detail;
  document.getElementById('motion-controls').hidden = !['1','3'].includes(subject) || detail;
  document.querySelector('footer').style.gridTemplateColumns = subject === 'all' ? `repeat(${profiles.length},1fr)` : '1fr';
  document.querySelectorAll('footer > div').forEach((item, i) => { item.hidden = subject !== 'all' && i !== Number(subject); });
  document.getElementById('detail').textContent = detail ? '全身檢視' : '髮型近看';
}
resize(); window.addEventListener('resize', resize);
try {
  const source = await new GLTFLoader().loadAsync('../assets/heroes/swordswoman-v4.glb?v=20260925d');
  const clips = [...source.animations, ...createGreatswordClips(THREE, source.scene, source.animations), ...createArcherClips(THREE, source.scene, source.animations)];
  // Play the shared roll at the same 0.42-second combat duration.
  const roll=clips.find(c=>c.name==='roll'),previewRoll=roll.clone();
  previewRoll.tracks.forEach(track=>track.scale(.42/roll.duration));previewRoll.duration=.42;
  // Keep the roll centred on the turntable, like the in-place run preview.
  const rollRoot=previewRoll.tracks.find(track=>track.name==='J_Bip_C_Hips.position');
  for(let i=3;i<rollRoot.values.length;i+=3){rollRoot.values[i]=rollRoot.values[0];rollRoot.values[i+2]=rollRoot.values[2];}
  clips[clips.indexOf(roll)]=previewRoll;
  clips.push(createComboPreview(THREE,clips,HEROES.azure),createComboPreview(THREE,clips,HEROES.jade));
  for (const [i, profile] of profiles.entries()) {
    const model = clone(source.scene);
    const clonedMaterials = new Map();
    model.traverse(mesh => { if (!mesh.isMesh) return; mesh.material = [].concat(mesh.material).map(m => { if (!clonedMaterials.has(m)) clonedMaterials.set(m, m.clone()); return clonedMaterials.get(m); }); if (mesh.material.length === 1) mesh.material = mesh.material[0]; });
    const look = toonVroidHero(model);
    const equipment = createHeroEquipment(THREE, model, model.getObjectByName('Hero_sword'));
    equipment.apply(profile); await equipment.ready;
    const turntable = new THREE.Group(); turntable.position.x = (i - (profiles.length - 1) / 2) * 1.35; turntable.add(model); scene.add(turntable);
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clips.find(c => c.name === (['azure','jade'].includes(profile.id) ? `${profile.id}Idle` : 'idle'))).play();
    actors.push({ model, turntable, mixer, look, equipment, clips, profile });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x252738, roughness: 0.55, metalness: 0.35 }));
    plinth.position.set(turntable.position.x, -0.025, 0); scene.add(plinth);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.475, 0.003, 4, 48), new THREE.MeshBasicMaterial({ color: profile.tint })); rim.rotation.x = Math.PI / 2; rim.position.set(turntable.position.x, -0.01, 0); scene.add(rim);
    actors[i].plinth = plinth; actors[i].rim = rim;
    if(profile.id==='jade') {
      actors[i].arrows=createArrowFx(THREE,scene,()=>0,{capacity:24});
      actors[i].specialFx=createHeroSpecialFx(THREE,scene,()=>0,{capacity:32});actors[i].specialFx.setStyle('jade');
    }
  }
  document.getElementById('status').textContent = '';
  controls.forEach(control => { control.disabled = false; });
  const selected=profiles.findIndex(profile=>profile.id===new URLSearchParams(location.search).get('character'));
  if(selected>=0)document.getElementById('subject').value=String(selected);
  subject = document.getElementById('subject').value; resize();
  document.getElementById('front').onclick = () => { angle = 0; rotating = false; };
  document.getElementById('side').onclick = () => { angle = Math.PI / 2; rotating = false; };
  document.getElementById('back').onclick = () => { angle = Math.PI; rotating = false; };
  document.getElementById('rotate').onclick = () => { rotating = !rotating; };
  document.getElementById('pose').onclick = () => {
    action = action === 'idle' ? 'combo2' : 'idle';
    for (const actor of actors) {
      const name = ['azure','jade'].includes(actor.profile.id) ? `${actor.profile.id}${action === 'idle' ? 'Idle' : actor.profile.id === 'jade' ? 'Shot' : 'Sweep'}` : action;
      actor.mixer.stopAllAction(); actor.mixer.clipAction(actor.clips.find(c => c.name === name)).reset().play();
      if (actor === motionActor) { document.getElementById('motion').value = name; setMotion(name); }
    }
  };
  const clock = document.getElementById('motion-time');
  function setMotion(name) {
    motion = name; motionActor = name === 'roll' ? actors[3] : actors.find(actor => name.startsWith(actor.profile.id)); motionActor.mixer.stopAllAction();
    actors.forEach(actor=>{actor.arrows?.reset();actor.specialFx?.reset();});
    const clip = motionActor.clips.find(c => c.name === name);
    motionActor.mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity).play(); clock.max = clip.duration;
    motionActor.mixer.setTime(0); clock.value = 0;
  }
  function selectMotionActor() {
    const jade = subject === '3', id = jade ? 'jade' : 'azure';
    const choices = jade ? [['Idle','持弓待機'],['Run','持弓跑步'],['Roll','翻滾閃避'],['Shot','一段・快射'],['Double','二段・雙連射'],['Fan','三段・扇形三箭'],['Burst','四段・三連貫矢'],['Combo','完整四段連技'],['Spread','扇形五箭'],['Pierce','蓄力穿透箭'],['Guard','退步返矢'],['Ult','翠羽天雨']] : [['Idle','持劍待機'],['Run','持劍跑步'],['Sweep','一段・橫掃'],['Rise','二段・挑斬'],['Slam','三段・重劈'],['Combo','完整三段連技'],['Guard','回斬'],['Ult','蒼龍裂陣']];
    const select = document.getElementById('motion'); select.replaceChildren(...choices.map(([suffix,label]) => new Option(label,suffix==='Roll'?'roll':id+suffix)));
    const label = jade ? '翠翎動作' : '蒼鋒動作'; document.getElementById('motion-label').textContent = label; select.setAttribute('aria-label',label);
    select.value=id+'Combo';setMotion(select.value);
  }
  selectMotionActor();
  document.getElementById('motion').onchange = event => setMotion(event.target.value);
  document.getElementById('motion-play').onclick = () => {
    paused = !paused; document.getElementById('motion-play').textContent = paused ? '播放' : '暫停';
    const clip = motionActor.clips.find(c => c.name === motion), playing = motionActor.mixer.clipAction(clip);
    if (!paused) { if (playing.time >= clip.duration) playing.reset(); playing.paused = false; playing.setLoop(THREE.LoopRepeat, Infinity).play(); }
  };
  function seek(time) {
    paused = true; document.getElementById('motion-play').textContent = '播放';
    const playing = motionActor.mixer.clipAction(motionActor.clips.find(c => c.name === motion));
    playing.paused = false; playing.enabled = true; playing.setLoop(THREE.LoopOnce, 1); playing.clampWhenFinished = true;
    motionActor.mixer.setTime(time);
  }
  clock.oninput = () => seek(Number(clock.value));
  document.getElementById('motion-step').onclick = () => seek(Math.min(Number(clock.max), Number(clock.value) + 1/60));
  document.getElementById('motion-speed').onchange = event => { speed = Number(event.target.value); };
  document.getElementById('subject').onchange = event => { subject = event.target.value; selectMotionActor(); if (subject === 'all') detail = false; resize(); };
  document.getElementById('detail').onclick = () => {
    detail = !detail;
    if (detail && subject === 'all') { subject = '0'; document.getElementById('subject').value = '0'; }
    document.getElementById('detail').textContent = detail ? '全身檢視' : '髮型近看'; resize();
  };
} catch (error) { document.getElementById('status').textContent = '模型載入失敗，請重新整理。'; console.error(error); }
function showArrows(actor,time) {
  actor.arrows.reset();actor.specialFx.reset();
  if(detail||!actor.turntable.visible)return;
  const moves=actor.profile.chain,cues=[];let start=0;
  if(motion==='jadeCombo')for(const move of moves) {for(const [index,at] of move.hits.entries())cues.push({move,index,at:start+at});start+=Number.isFinite(move.cancel)?move.cancel:move.duration;}
  else {const move=[...moves,...actor.profile.charges,actor.profile.counter,actor.profile.air].find(move=>move.clip===motion);if(move)for(const [index,at] of move.hits.entries())cues.push({move,index,at});}
  let newest=null;
  for(const cue of cues) {
    const age=time-cue.at,p=cue.move.projectile;if(age<0||age>(cue.move.radius-20)/p.speed)continue;
    for(let i=0;i<(p.arrows||1);i++) {
      const facing=Math.PI/2-angle+(i-((p.arrows||1)-1)/2)*(p.spread||0),distance=20+age*p.speed;
      const event={type:'arrow',x:640+actor.turntable.position.x*60+Math.cos(facing)*distance,y:500+Math.sin(facing)*distance,facing,range:cue.move.radius-20,speed:p.speed,fxTier:(cue.move.fxTier||1)+(cue.move.clip==='jadeBurst'&&cue.index===cue.move.hits.length-1?1:0)};
      actor.arrows.onEvent(event);
      if(!newest||age<newest.age)newest={event:{...event,x:640+actor.turntable.position.x*60+Math.cos(facing)*20,y:500+Math.sin(facing)*20},age};
    }
  }
  if(newest){actor.specialFx.onEvent(newest.event,actor.turntable.position);actor.specialFx.update(newest.age);}
}
let last = 0;
function frame(t) {
  requestAnimationFrame(frame); if (document.hidden) { last = t; return; } if (t - last < 33) return;
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (rotating) angle += dt * 0.5;
  for (const actor of actors) {
    actor.turntable.rotation.y = 0; if (actor !== motionActor || !paused) actor.mixer.update(dt * (actor === motionActor ? speed : 1)); actor.equipment.update(); actor.look.update(t / 1000);
    actor.model.updateMatrixWorld(true);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.model.getObjectByName('J_Bip_C_Hips').getWorldQuaternion(new THREE.Quaternion()));
    // Retargeted combat clips face +Z; preserve their animated torso turns.
    actor.turntable.rotation.y = ['azure','jade'].includes(actor.profile.id) ? angle : angle - Math.atan2(facing.x, facing.z);
    if (actor === motionActor) {
      const time = actor.mixer.clipAction(actor.clips.find(c => c.name === motion)).time;
      document.getElementById('motion-time').value = time;
      document.getElementById('motion-clock').textContent = `${time.toFixed(2)}s`;
      if(actor.arrows)showArrows(actor,time);
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
