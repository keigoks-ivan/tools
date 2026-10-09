import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Input } from '../mech/input.js';
import { Pilot } from '../mech/zero/player.js';
import { HumanKit } from '../mech/zero/human.js';
import { ViewModel } from '../mech/zero/viewmodel.js';
import { ZeroAudio } from '../mech/zero/sfx.js';
import { loadSurfaces } from '../mech/zero/kit.js';
import { Models } from '../mech/zero/models.js';
import { Post } from '../mech/post.js';
import { pixelRatio, qualityLevel, FrameGate } from '../mech/runtime.js';
import { buildBattlefield, addSigns } from './map.js?v=2';
import { addBattlefieldArt } from './art.js';
import { SCENARIOS, MODES, DIFFICULTIES, Mission, selection } from './scenarios.mjs';
import { InfantryHUD } from './hud.js';
import { Combat } from './combat.js';
import { operationFor } from './operations.mjs';
import { evaluateSortie, recordSortie } from './medals.mjs';

const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp;
const mutedTest=new URLSearchParams(location.search).has('mute');
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('greyline.'+key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem('greyline.'+key,JSON.stringify(value));}catch{}};
let language=read('language','zh')==='en'?'en':'zh',choice=selection(read('selection',{}));
let variantIndex=clamp(Math.floor(Number(read('operation',0))||0),0,2),sortieSeed=Date.now()>>>0;
const words={
  lobby:['遊戲大廳','Games lobby'],fullscreen:['全螢幕','Fullscreen'],standalone:['鋼鐵黃昏・獨立步兵篇','IRON DUSK / STANDALONE INFANTRY'],tagline:['機甲離開之後，防線由我們守住。','When the mechs leave, we hold the line.'],
  battlefields:['座戰場','BATTLEFIELDS'],operations:['種作戰','OPERATIONS'],squad:['支小隊','SQUAD'],choose:['選擇戰場','CHOOSE YOUR BATTLEFIELD'],selectedBattlefield:['目前戰場','SELECTED BATTLEFIELD'],defend:['守衛戰','Hold the line'],assault:['衝鋒戰','Breakthrough'],defendShort:['抵擋四波攻擊','Survive four enemy waves'],assaultShort:['依序奪下三座據點','Secure three sectors'],
  difficulty:['難度','Difficulty'],settings:['操作與設定','Controls & settings'],deploy:['開始作戰','DEPLOY SQUAD'],desktop:['建議鍵盤＋滑鼠遊玩，亦提供觸控操作','Keyboard + mouse recommended · Touch controls included'],cleanup:['最後兩名敵人自動定位・不用繞地圖找人','The final two enemies are tracked automatically'],
  quality:['畫質','Graphics'],sensitivity:['滑鼠靈敏度','Mouse sensitivity'],volume:['音效音量','Effects volume'],music:['音樂音量','Music volume'],move:['移動','Move'],run:['跑步／狙擊屏息','Sprint / hold breath'],mouse:['滑鼠','MOUSE'],aim:['左鍵開火・右鍵瞄準','Left: fire · Right: aim'],crouch:['蹲下','Crouch'],jump:['跳躍','Jump'],reload:['換彈','Reload'],weapons:['長槍／手槍／衝鋒槍','Rifle / pistol / SMG'],grenade:['手榴彈','Grenade'],interact:['按住佔領／補給','Hold to capture / resupply'],mapPause:['戰術地圖／暫停','Map / pause'],resume:['返回','Back'],quit:['返回戰場選單','Battlefield selection'],tactical:['戰術地圖','Tactical map'],mapLegend:['青色：小隊　琥珀：目標　紅色：目視敵軍／最後殘敵','Cyan: squad · Gold: objective · Red: visible enemies / last survivors'],back:['返回戰場 · M','Back to battle · M'],retry:['再次作戰','Deploy again'],chooseAnother:['選擇其他戰場','Another battlefield'],fire:['射擊','Fire'],ads:['瞄準','Aim'],sprint:['跑','Run'],swap:['換槍','Swap'],interactShort:['操作','Use'],
  operationPlan:['作戰方案','Operation plan'],reshuffle:['每次部署重新編排敵軍與攻勢方向','Each deployment reshuffles enemy formations and attack lanes'],squadCommands:['小隊：跟隨／原地掩護／推進','Squad: follow / hold position / advance'],command:['小隊','Squad'],
};
const text=(zh,en)=>language==='zh'?zh:en;
function translate(){document.documentElement.lang=language==='zh'?'zh-Hant':'en';for(const el of document.querySelectorAll('[data-t]'))el.textContent=words[el.dataset.t][language==='zh'?0:1];$('language').textContent=language==='zh'?'EN':'中文';}
const briefingImage=id=>`./assets/briefing/${id}.webp?v=2`;
function renderMenu(){
  const focusedScene=document.activeElement?.closest('[data-scene]')?.dataset.scene;
  translate();$('scenarios').innerHTML=SCENARIOS.map((s,i)=>`<button class="scenario" data-scene="${s.id}" aria-pressed="${s.id===choice.scene}" style="--scene-accent:${s.color}"><img class="scenario-image" src="${briefingImage(s.id)}" alt="" width="1672" height="941" loading="${s.id===choice.scene?'eager':'lazy'}" decoding="async"><span class="index">0${i+1}</span><span class="scenario-state" aria-hidden="true">✓</span><span class="scenario-copy"><strong>${s.name[language]}</strong><small>${s.code.split(' / ')[1]}</small></span></button>`).join('');
  if(focusedScene)$('scenarios').querySelector(`[data-scene="${focusedScene}"]`)?.focus({preventScroll:true});
  const s=SCENARIOS.find(s=>s.id===choice.scene);document.documentElement.style.setProperty('--gold',s.color);
  $('menu').style.setProperty('--scene-accent',s.color);
  if($('heroSceneImage').getAttribute('src')!==briefingImage(s.id))$('heroSceneImage').src=briefingImage(s.id);
  $('heroSceneName').textContent=s.name[language];$('heroSceneCode').textContent=s.code;
  $('sceneCode').textContent=s.code;$('sceneName').textContent=s.name[language];$('sceneBrief').textContent=s.brief[language];$('difficulty').value=choice.difficulty;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',b.dataset.mode===choice.mode);
  $('operation').innerHTML=[0,1,2].map(i=>`<option value="${i}">${operationFor(choice.scene,sortieSeed,i).name[language]}</option>`).join('');$('operation').value=variantIndex;
  const op=operationFor(choice.scene,sortieSeed,variantIndex),goal=(op.bonusGoalByMode?.[choice.mode]||op.bonusGoal)[language];
  $('operationBrief').textContent=op.brief[language];$('bonusBrief').textContent=text(`額外任務：${goal} · 完成 +750 分`,`BONUS: ${goal} · +750 points`);
  const records=read('records',{}),record=records[`${choice.scene}.${choice.mode}.${choice.difficulty}.${variantIndex}`];
  let clears=0,gold=0;for(const scene of SCENARIOS)for(const variant of [0,1,2]){const r=records[`${scene.id}.${choice.mode}.${choice.difficulty}.${variant}`];if(r?.wins)clears++;if(r?.medal==='gold')gold++;}
  $('campaignProgress').textContent=text(`作戰集章 ${clears}/21 · 金章 ${gold}/21 · 七戰場各三種方案`,`OPERATIONS ${clears}/21 · GOLD ${gold}/21 · Three plans per battlefield`);
  const medalNames={gold:text('金章','GOLD'),silver:text('銀章','SILVER'),bronze:text('銅章','BRONZE')};
  $('best').textContent=record?text(`${medalNames[record.medal]||''} · 最佳 ${record.score} 分 · ${formatTime(record.time)} · 完成 ${record.wins} 次`,`${medalNames[record.medal]||''} · BEST ${record.score} pts · ${formatTime(record.time)} · ${record.wins} clears`):text('金章條件：額外任務完成、三名隊友生還通關','GOLD: clear the bonus objective with all three squadmates alive');
}
const formatTime=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const settings={quality:qualityLevel(read('quality',1)),sensitivity:clamp(Number(read('sensitivity',1))||1,.3,2.5),volume:clamp(Number(read('volume',.8))||0,0,1),music:clamp(Number(read('music',.7))||0,0,1)};
let renderer,scene,camera,vScene,vCamera,post,kit,materials,models,sky,environment,map,player,vm,input,audio,hud,combat,mission;
let state='loading',crouch=false,lastTime=0,playTime=0,nades=3,grenades=[],prompt='',notice='',noticeT=0,hurt=0,cleanup=false;
let settingsFrom='menu',supplyProgress=0,supplyCooldown=0,spawnCounter=0;
let telemetry={},squadCommand={mode:'follow'},stageSpawns=0,lastSpawnStage=-1;
const gate=new FrameGate(),lights=[];
function note(zh,en){notice=text(zh,en);noticeT=4;}
function failure(error){console.error('[greyline]',error);$('loading').hidden=false;$('status').textContent=text('載入失敗。請重新整理後再試；瀏覽器需要支援 WebGL 2。','Loading failed. Refresh and use a browser with WebGL 2 support.');$('loadProgress').style.width='100%';}
async function initialize(){
  renderer=new THREE.WebGLRenderer({canvas:$('gl'),antialias:false,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,800);camera.rotation.order='YXZ';
  vScene=new THREE.Scene();vCamera=new THREE.PerspectiveCamera(54,innerWidth/innerHeight,.01,10);
  let loaded=0;const progress=()=>{$('loadProgress').style.width=Math.min(95,5+(++loaded)*1.5)+'%';};
  const tex=new THREE.TextureLoader(),aniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  async function surface(name,stem,color,tile){
    const base='../mech/zero/assets/env/';const [map,normalMap,arm]=await Promise.all([tex.loadAsync(base+stem+'_diff.webp'),tex.loadAsync(base+stem+'_nor.webp'),name==='rock'?Promise.resolve(null):tex.loadAsync(base+stem+'_arm.webp')]);
    for(const t of [map,normalMap,arm].filter(Boolean)){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=aniso;}map.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map,normalMap,roughnessMap:arm,color,roughness:1,vertexColors:true});material.normalScale.setScalar(.6);material.userData.tile=tile;progress();return material;
  }
  [materials,models,kit,sky,environment]=await Promise.all([
    loadSurfaces(renderer,progress),Models.load(progress,aniso),HumanKit.load('../mech/zero/assets/soldier.glb').then(k=>{progress();return k;}),
    tex.loadAsync('../mech/zero/assets/env/sky.webp').then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.mapping=THREE.EquirectangularReflectionMapping;progress();return t;}),
    new RGBELoader().loadAsync('../mech/assets/env.hdr').then(hdr=>{const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(hdr);hdr.dispose();pmrem.dispose();progress();return target.texture;}),
  ]);
  const [rock,asphalt,grass]=await Promise.all([surface('rock','rock',0x99998d,4),surface('asphalt','asphalt',0xa8a6a0,4),surface('grass','grass',0x9caa84,3)]);Object.assign(materials,{rock,asphalt,grass});
  scene.environment=environment;vScene.environment=environment;
  const sun=new THREE.DirectionalLight(0xffd0a1,2.8);sun.position.set(-35,70,-30);sun.target.position.set(0,0,15);sun.castShadow=true;sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=95;sun.shadow.camera.bottom=-70;sun.shadow.camera.far=250;sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;scene.add(sun,sun.target);scene.add(new THREE.HemisphereLight(0xc3d6e3,0x544735,1.45));
  for(let i=0;i<3;i++){const l=new THREE.PointLight(0xffd5a1,18,16,2);scene.add(l);lights.push(l);}
  post=new Post(renderer,scene,camera,vScene,vCamera);post.gtao.updateGtaoMaterial({radius:.9,distanceExponent:1.5,thickness:.8,scale:1.1,distanceFallOff:1});post.gtao.updatePdMaterial({radius:4,rings:2,samples:12});post.u.vignette.value=.2;post.u.grain.value=.012;
  audio=new ZeroAudio();audio.setVolume(mutedTest?0:settings.volume);audio.setMusicVolume(mutedTest?0:settings.music);input=new Input($('gl'));input.sens=settings.sensitivity;hud=new InfantryHUD($('hud'),camera);
  rebuild();vm=new ViewModel(kit,vScene,audio,{});vm.holder.visible=false;vm.arms.root.visible=false;
  applyQuality(sun);bindControls(sun);$('loading').hidden=true;$('menu').hidden=false;state='menu';renderMenu();requestAnimationFrame(frame);
}
function applyQuality(sun){renderer.setPixelRatio(pixelRatio(innerWidth,innerHeight,devicePixelRatio,settings.quality));renderer.setSize(innerWidth,innerHeight);post.setQuality(settings.quality);post.setSize(innerWidth,innerHeight);post.gtao.enabled=settings.quality>0;post.bloom.enabled=settings.quality>0;sun.shadow.mapSize.setScalar(settings.quality===2?2048:1024);sun.shadow.map?.dispose();sun.shadow.map=null;renderer.shadowMap.enabled=settings.quality>0;}
function rebuild(){
  combat?.clear();map?.dispose();map=buildBattlefield(scene,materials,SCENARIOS.find(s=>s.id===choice.scene));addSigns(map,language);addBattlefieldArt(map,models,choice.scene);
  const fogDensity={pass:.0048,city:.0045,forest:.0065,dam:.0048,airfield:.0038,underground:.018,rail:.0045};
  scene.background=choice.scene==='underground'?new THREE.Color(0x141c26):sky;scene.fog=new THREE.FogExp2(choice.scene==='underground'?0x162630:SCENARIOS.find(s=>s.id===choice.scene).fog,fogDensity[choice.scene]);
  scene.environmentIntensity=choice.scene==='underground'?.45:1;vScene.environmentIntensity=.5;
  player=new Pilot(map.solid);player.reset(new THREE.Vector3(0,map.ground(0,-29),-29),0);
  player.onStep=speed=>audio?.step(choice.scene==='forest'?'dirt':'concrete',speed);player.onLand=k=>{audio.land(k);vm.land(k);};player.onShieldBreak=()=>audio.shieldBreak();player.onRecharge=()=>audio.shieldRecharge();
  camera.position.set(12,6+map.ground(12,-32),-32);camera.lookAt(-5,3+map.ground(-5,20),20);map.beacon.visible=false;
}
function start(){
  combat?.clear();clearGrenades();sortieSeed=(sortieSeed+Math.floor(Math.random()*65535)+1)>>>0;mission=new Mission({...choice,operation:operationFor(choice.scene,sortieSeed,variantIndex)});spawnCounter=0;stageSpawns=0;lastSpawnStage=-1;telemetry={shots:0,hits:0,grenadeKills:0,supplyUses:0};squadCommand={mode:'follow'};playTime=0;hurt=0;crouch=false;nades=3;cleanup=false;supplyProgress=supplyCooldown=0;
  const p=map.starts[choice.mode];player.reset(new THREE.Vector3(p.x,p.y,p.z),0);player.stam=player.stepPh=0;
  vm.refill();vm.cur='smg';for(const [k,g]of Object.entries(vm.g))g.visible=k==='smg';vm.ads=0;vm.scoped=false;vm.lastTrigger=false;vm.cd=0;vm.nadeT=-1;vm.kick.set(0,0,0);vm.kickV.set(0,0,0);vm.rot.set(0,0,0);vm.rotV.set(0,0,0);
  combat=new Combat({scene,map,kit,audio,player,difficulty:DIFFICULTIES[choice.difficulty],onPlayerHurt:(damage,from)=>{player.damage(damage);hurt=.9;audio.hurt(damage/20,from?Math.atan2(from.x-player.pos.x,from.z-player.pos.z)-player.yaw:0);},onKill:()=>{mission.kills++;}});combat.spawnSquad(p);
  audio.unlock();audio.setPaused(false);audio.music('battle',{stage:1});state='play';input.enabled=true;input.reset();for(const id of ['menu','pause','result','tactical'])$(id).hidden=true;$('playButtons').hidden=false;$('touch').hidden=!input.touch.on;
  if(!input.touch.on)input.lock();note(`作戰：${mission.operation.name.zh} · F 下達小隊指令`,`OPERATION: ${mission.operation.name.en} · F commands your squad`);write('selection',choice);updateSquadButton();
}
function pause(next='paused'){
  if(state!=='play')return;state=next;input.enabled=false;input.reset();input.unlock();audio.setPaused(true);$('touch').hidden=true;
  if(next==='tactical'){$('tactical').hidden=false;drawTactical();}else{settingsFrom='play';$('pause').hidden=false;$('quit').hidden=false;$('resume').textContent=text('繼續作戰','Resume battle');}
}
function resume(){if(settingsFrom==='menu'&&state==='settings'){state='menu';$('pause').hidden=true;return;}
  $('pause').hidden=true;$('tactical').hidden=true;state='play';input.enabled=true;input.reset();audio.unlock();audio.setPaused(false);$('touch').hidden=!input.touch.on;if(!input.touch.on)input.lock();}
function menu(){state='menu';input.enabled=false;input.unlock();input.reset();audio.setPaused(true);combat?.clear();clearGrenades();mission=null;for(const id of ['result','pause','tactical','playButtons','touch'])$(id).hidden=true;$('menu').hidden=false;vm.holder.visible=vm.arms.root.visible=false;map.beacon.visible=false;camera.position.set(12,6+map.ground(12,-32),-32);camera.lookAt(-5,3+map.ground(-5,20),20);renderMenu();}
function finish(){
  state='result';input.enabled=false;input.reset();input.unlock();audio.setPaused(true);$('touch').hidden=true;$('playButtons').hidden=true;$('result').hidden=false;
  telemetry.alliesAlive=combat.allies.filter(a=>!a.dead).length;const award=evaluateSortie(mission,telemetry,mission.operation),{won,score}=award;
  $('resultCode').textContent=`${mission.scenario.code} / ${MODES[choice.mode][language]}`;$('resultTitle').textContent=won?text('防線仍在','MISSION COMPLETE'):text('防線失守','MISSION FAILED');
  $('resultReason').textContent=won?choice.mode==='defend'?text('撤離線守住了。最後一支車隊已安全通過。','The line held. The last convoy has passed safely.'):text('三座據點已奪回，補給線重新接通。','All three sectors secured. The supply line is open.'):player.dead?text('小隊失去帶隊士兵。重新部署再試一次。','The squad lost its leader. Redeploy to try again.'):text('敵軍突破撤離線。靠近前線掩體阻止推進。','The evacuation line was overrun. Stop the advance from forward cover.');
  $('resultStats').innerHTML=`<div>${score}<small>${text('作戰分數','SCORE')}</small></div><div>${mission.kills}<small>${text('擊倒敵軍','HOSTILES DOWN')}</small></div><div>${formatTime(mission.time)}<small>${text('作戰時間','TIME')}</small></div>`;
  const medals={gold:text('金章','GOLD'),silver:text('銀章','SILVER'),bronze:text('銅章','BRONZE')},goal=(mission.operation.bonusGoalByMode?.[choice.mode]||mission.operation.bonusGoal)[language];
  $('resultMedal').textContent=won?`${medals[award.medal]} · ${award.bonus?text('額外任務完成 +750','BONUS COMPLETE +750'):text('額外任務未完成','BONUS INCOMPLETE')} · ${goal}`:text('重新部署會出現不同敵軍編隊；試著換側翼或下達小隊指令。','Redeploy for a new formation. Try another flank or command your squad.');
  $('resultDetails').textContent=text(`小隊存活 ${telemetry.alliesAlive}/3 · 命中率 ${Math.round(award.accuracy*100)}% · 手榴彈擊倒 ${telemetry.grenadeKills}`,`SQUAD ${telemetry.alliesAlive}/3 · ACCURACY ${Math.round(award.accuracy*100)}% · GRENADE KILLS ${telemetry.grenadeKills}`);
  if(won)write('records',recordSortie(read('records',{}),`${choice.scene}.${choice.mode}.${choice.difficulty}.${variantIndex}`,mission,award));
}
function bindControls(sun){
  $('scenarios').addEventListener('click',e=>{const b=e.target.closest('[data-scene]');if(!b)return;choice.scene=b.dataset.scene;write('selection',choice);rebuild();renderMenu();});
  for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{choice.mode=b.dataset.mode;write('selection',choice);renderMenu();};
  $('difficulty').onchange=()=>{choice.difficulty=$('difficulty').value;write('selection',choice);renderMenu();};
  $('operation').onchange=()=>{variantIndex=Number($('operation').value);write('operation',variantIndex);renderMenu();};
  $('language').onclick=()=>{language=language==='zh'?'en':'zh';write('language',language);rebuild();renderMenu();};
  $('deploy').onclick=start;$('retry').onclick=start;$('resultMenu').onclick=menu;$('quit').onclick=menu;$('resume').onclick=resume;$('mapClose').onclick=resume;$('pauseButton').onclick=()=>pause();$('mapButton').onclick=()=>pause('tactical');
  $('squadButton').onclick=()=>{if(state==='play')commandSquad();};
  $('settingsOpen').onclick=()=>{settingsFrom='menu';state='settings';$('pause').hidden=false;$('quit').hidden=true;$('resume').textContent=text('返回','Back');};
  for(const key of Object.keys(settings)){const el=$(key);el.value=mutedTest&&(key==='volume'||key==='music')?0:settings[key];el.oninput=()=>{settings[key]=Number(el.value);write(key,settings[key]);if(key==='quality')applyQuality(sun);if(key==='sensitivity')input.sens=settings[key];if(key==='volume')audio.setVolume(mutedTest?0:settings[key]);if(key==='music')audio.setMusicVolume(mutedTest?0:settings[key]);};}
  for(const b of document.querySelectorAll('.fullscreen'))b.onclick=()=>{const p=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();p?.catch?.(()=>note('瀏覽器未開放全螢幕','Fullscreen is unavailable in this browser'));};
  input.onLockChange=locked=>{if(!locked&&state==='play'&&!input.touch.on)pause();};
  addEventListener('keydown',e=>{if(state==='tactical'&&(e.code==='KeyM'||e.code==='Escape')){e.preventDefault();resume();}else if(state==='paused'&&e.code==='Escape')resume();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='play')pause();});addEventListener('blur',()=>{if(state==='play')pause();});
  addEventListener('resize',()=>{renderer.setPixelRatio(pixelRatio(innerWidth,innerHeight,devicePixelRatio,settings.quality));renderer.setSize(innerWidth,innerHeight);camera.aspect=vCamera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();vCamera.updateProjectionMatrix();post.setSize(innerWidth,innerHeight);});
}
function spawn(){
  const stage=choice.mode==='defend'?mission.wave:mission.objective+1;if(stage!==lastSpawnStage){lastSpawnStage=stage;stageSpawns=0;}
  const lane=mission.operation.spawnSide(stage,stageSpawns,choice.mode);let p;if(choice.mode==='defend')p=map.spawns[lane];else{const t=mission.target;p={x:clamp(t.x+(lane-1)*(9+(stageSpawns%3)*3),-28,28),z:clamp(t.z+8+(stageSpawns%3)*2,-40,61)};}
  const index=map.nav.nearest(p);if(index<0)return;const safe=map.nav.nodes[index];
  // A spawn needs a route to its active objective. No unreachable or off-map enemies enter the count.
  if(!map.nav.route(safe,mission.target).length&&Math.hypot(safe.x-mission.target.x,safe.z-mission.target.z)>3)return;
  const type=mission.operation.enemyType(stage,stageSpawns,choice.mode);
  if(combat.spawnEnemy({x:safe.x,z:safe.z,type,guard:choice.mode==='assault'?mission.target:null})){spawnCounter++;stageSpawns++;mission.spawned();}
}
function shoot(shot){
  const origin=camera.position.clone(),dir=camera.getWorldDirection(new THREE.Vector3());dir.x+=(Math.random()-.5)*shot.spread;dir.y+=(Math.random()-.5)*shot.spread;dir.z+=(Math.random()-.5)*shot.spread;dir.normalize();
  telemetry.shots++;const hit=combat.shoot(origin,dir,shot.W);if(hit?.actor&&!hit.actor.friendly){telemetry.hits++;hud.marker(hit.killed?'kill':hit.part==='head'?'head':'hit');audio.hitmark(hit.killed?'kill':hit.part==='head'?'head':'hit');}else if(hit?.wall)audio.hit(origin.addScaledVector(dir,hit.t),'concrete');
}
function throwGrenade(){
  if(nades<=0)return;nades--;const p=player.eye,velocity=player.fwd().multiplyScalar(17);velocity.y+=5;
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshStandardMaterial({color:0x596347,roughness:.62,metalness:.4}));mesh.castShadow=true;mesh.position.copy(p);scene.add(mesh);grenades.push({mesh,p,v:velocity,t:0});
}
function clearGrenades(){for(const g of grenades){scene.remove(g.mesh);g.mesh.geometry.dispose();g.mesh.material.dispose();}grenades=[];}
function updateGrenades(dt){
  for(let i=grenades.length-1;i>=0;i--){const g=grenades[i];g.t+=dt;g.v.y-=16*dt;const delta=g.v.clone().multiplyScalar(dt),L=delta.length(),hit=L>0?map.solid.ray(g.p,delta.clone().normalize(),L+.09):null;
    if(hit){g.p.addScaledVector(delta.clone().normalize(),Math.max(0,hit.t-.1));g.v.reflect(hit.n).multiplyScalar(.38);if(!g.landed){g.landed=true;audio.grenade(g.p);}}else g.p.add(delta);
    const floor=map.ground(g.p.x,g.p.z)+.09;if(g.p.y<floor){g.p.y=floor;g.v.y=Math.abs(g.v.y)*.28;g.v.x*=.8;g.v.z*=.8;}g.mesh.position.copy(g.p);g.mesh.rotation.x+=dt*5;
    if(g.t>2.5){const before=combat.enemies.filter(e=>e.dead).length;combat.explode(g.p,8);telemetry.grenadeKills+=combat.enemies.filter(e=>e.dead).length-before;audio.explosion(g.p,.6);scene.remove(g.mesh);g.mesh.geometry.dispose();g.mesh.material.dispose();grenades.splice(i,1);}
  }
}
function tick(dt){
  const c=input.state(dt),K=input.keys;if(c.pause){pause();input.endFrame();return;}if(input.pressed('KeyM')){pause('tactical');input.endFrame();return;}
  if(input.pressed('KeyF'))commandSquad();
  if(input.pressed('KeyC')||input.pressed('Tod'))crouch=!crouch;const run=K.has('ShiftLeft')||K.has('ShiftRight')||K.has('Tboost');if(run&&c.my>.3)crouch=false;
  const ads=K.has('M2')||K.has('Tmsl'),lookK=vm.scoped?vm.W.fov/72:1-vm.ads*.3;
  player.update(dt,{mx:c.mx,my:c.my,lookX:c.lookX*lookK,lookY:c.lookY*lookK,jump:c.jump,sprint:run&&!vm.scoped,crouch:crouch||K.has('ControlLeft')||K.has('ControlRight'),ads});
  player.pos.x=clamp(player.pos.x,map.bounds.x0+.4,map.bounds.x1-.4);player.pos.z=clamp(player.pos.z,map.bounds.z0+.4,map.bounds.z1-.4);
  const bob=player.grounded?Math.sin(player.stepPh*Math.PI*2)*.018*Math.min(1,player.moveK)*(1-vm.ads*.8):0;camera.position.copy(player.eye);camera.position.y+=Math.abs(bob);camera.rotation.set(player.pitch,player.yaw+Math.PI,bob*.2);
  camera.fov=THREE.MathUtils.lerp(72,vm.W.fov,vm.cur==='rifle'?(vm.scoped?1:vm.ads*.2):vm.ads)+player.sprintK*4;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  if((input.pressed('KeyG')||input.pressed('Tnade'))&&nades>0&&vm.throwNade())audio.throw();
  const shot=vm.update(dt,{fire:c.fire,ads,reload:c.reload||input.pressed('Tsaber'),swap:input.pressed('KeyQ')||input.pressed('Tcannon'),swapTo:input.pressed('Digit1')?'rifle':input.pressed('Digit2')?'pistol':input.pressed('Digit3')?'smg':null,hold:run},player,{x:c.lookX,y:c.lookY});if(shot)shoot(shot);if(vm.nadeGo)throwGrenade();
  vm.light(camera,new THREE.Vector3(-.4,.8,-.3).normalize(),null,choice.scene==='underground'||!!map.solid.ray(player.eye,new THREE.Vector3(-.4,.8,-.3).normalize(),80),dt);
  const living=combat.enemies.filter(e=>!e.dead);cleanup=living.length>0&&living.length<=2&&mission.pending===0;
  if(squadCommand.mode==='advance')squadCommand.target=mission.target;
  combat.update(dt,{mode:choice.mode,target:mission.target,cleanup,time:playTime,wave:choice.mode==='defend'?mission.wave:mission.objective+1,operation:mission.operation,squadCommand});updateGrenades(dt);
  const target=mission.target,near=Math.hypot(player.pos.x-target.x,player.pos.z-target.z)<4.5&&Math.abs(player.pos.y-map.ground(target.x,target.z))<1.5;
  const contested=combat.enemies.some(e=>!e.dead&&Math.hypot(e.pos.x-target.x,e.pos.z-target.z)<11);
  const pressure=choice.mode==='defend'?combat.enemies.filter(e=>!e.dead&&Math.hypot(e.pos.x-target.x,e.pos.z-target.z)<6).length:0;
  const interact=K.has('KeyE')||K.has('Tlock');prompt='';
  if(choice.mode==='assault'&&near)prompt=contested?text('敵軍仍在據點附近・先清除紅色標記','Sector contested · clear nearby hostiles'):text(`按住 E 佔領據點 · ${Math.floor(mission.capture/mission.rules.capture*100)}%`,`HOLD E TO CAPTURE · ${Math.floor(mission.capture/mission.rules.capture*100)}%`);
  supplyCooldown=Math.max(0,supplyCooldown-dt);const supplyNear=Math.hypot(player.pos.x-map.supply.x,player.pos.z-map.supply.z)<2.3;
  if(supplyNear){prompt=supplyCooldown>0?text(`補給整備 ${Math.ceil(supplyCooldown)} 秒`,`RESUPPLY IN ${Math.ceil(supplyCooldown)}s`):text('按住 E 補給生命、護盾與手榴彈','HOLD E TO RESTORE VITALS, SHIELD & GRENADES');if(interact&&supplyCooldown===0){supplyProgress+=dt;if(supplyProgress>=1.5){refill();telemetry.supplyUses++;supplyProgress=0;supplyCooldown=25*mission.operation.supplyMultiplier;}}else supplyProgress=0;}else supplyProgress=0;
  const events=mission.update(dt,{alive:combat.enemies.filter(e=>!e.dead).length,pressure,near,contested,interact:interact&&!supplyNear,dead:player.dead});
  for(const event of events){if(event==='spawn')spawn();if(event==='resupply'){refill();note('據點安全・小隊整備完成','Sector secure · squad resupplied');}if(event==='wave')note(`第 ${mission.wave} 波敵軍來襲`,`Enemy wave ${mission.wave} incoming`);if(event==='objective')note('小隊前進・奪下下一座據點','Squad advancing · secure the next sector');if(event==='won'||event==='lost'){finish();return;}}
  const t=mission.target;map.beacon.visible=true;map.beacon.position.set(t.x,map.ground(t.x,t.z)+.03,t.z);
  playTime+=dt;noticeT=Math.max(0,noticeT-dt);hurt=Math.max(0,hurt-dt*2);audio.setListener(player.eye,player.fwd());audio.setIntensity(clamp(living.length/10,0,1));
  post.u.damage.value=hurt;post.u.danger.value=player.hp<30?.55:0;post.u.speed.value=player.sprintK*.5;
  input.endFrame();
}
function refill(){player.hp=100;player.shield=60;vm.refill();nades=Math.max(3,nades);audio.radio('in');}
function updateSquadButton(){const labels={follow:text('跟隨','FOLLOW'),hold:text('掩護','HOLD'),advance:text('推進','ADVANCE')};$('squadButton').textContent=`F / ${labels[squadCommand.mode]}`;}
function commandSquad(){const modes=['follow','hold','advance'],mode=modes[(modes.indexOf(squadCommand.mode)+1)%3];squadCommand={mode,target:mode==='hold'?{x:player.pos.x,z:player.pos.z}:mission.target};updateSquadButton();audio.radio('in');const labels={follow:['小隊跟隨・保持交叉掩護','Squad following · covering both flanks'],hold:['小隊原地掩護・你可以繞側翼','Squad holding · take a flanking route'],advance:['小隊推進・向作戰目標移動','Squad advancing · moving toward the objective']};note(...labels[mode]);}
function drawTactical(){
  const c=$('mapCanvas').getContext('2d'),W=660,H=620,b=map.bounds,scale=Math.min((W-70)/(b.x1-b.x0),(H-70)/(b.z1-b.z0)),x=p=>(p.x-b.x0)*scale+(W-(b.x1-b.x0)*scale)/2,y=p=>H-35-(p.z-b.z0)*scale;
  c.fillStyle='#0e1d26';c.fillRect(0,0,W,H);c.strokeStyle='#8fdde015';for(let i=0;i<W;i+=40){c.beginPath();c.moveTo(i,0);c.lineTo(i,H);c.stroke();}for(let i=0;i<H;i+=40){c.beginPath();c.moveTo(0,i);c.lineTo(W,i);c.stroke();}
  for(const box of map.solid.list){if(box.noMove)continue;c.fillStyle='#71878355';c.fillRect(x({x:box.x0}),y({z:box.z1}),(box.x1-box.x0)*scale,(box.z1-box.z0)*scale);}
  const dot=(p,color,r=5)=>{c.fillStyle=color;c.beginPath();c.arc(x(p),y(p),r,0,Math.PI*2);c.fill();};
  const route=map.nav.route(player.pos,mission.target);c.strokeStyle='#d7b27b77';c.lineWidth=2;c.setLineDash([5,5]);c.beginPath();c.moveTo(x(player.pos),y(player.pos));for(const p of route)c.lineTo(x(p),y(p));c.stroke();c.setLineDash([]);
  for(const t of mission.scenario.targets){dot(t,'#d7b27b',6);c.fillStyle='#d7b27b';c.font='14px sans-serif';c.fillText(t.name[language],x(t)+12,y(t)-7);}
  if(mission.mode==='defend')dot(mission.target,'#d7b27b',8);
  for(const e of combat.enemies)if(!e.dead&&(cleanup||map.solid.sees(player.eye,e.pos.clone().add(new THREE.Vector3(0,1.5,0)))))dot(e.pos,'#ff765e');for(const a of combat.allies)if(!a.dead)dot(a.pos,'#8fdde0');dot(player.pos,'#fff',6);
}
function frame(now){
  requestAnimationFrame(frame);if(!gate.ready(now,state==='menu'?30:60))return;const dt=Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;if(document.hidden)return;
  try{if(state==='play')tick(dt);else input.endFrame();
    const sorted=map.lamps.slice().sort((a,b)=>Math.hypot(a.x-camera.position.x,a.z-camera.position.z)-Math.hypot(b.x-camera.position.x,b.z-camera.position.z));
    lights.forEach((l,i)=>{const p=sorted[i];l.intensity=p?(choice.scene==='underground'?40:18):0;if(p)l.position.set(p.x,p.y,p.z);});
    if(state==='menu'||state==='settings'){vm.holder.visible=vm.arms.root.visible=false;post.u.damage.value=0;post.u.speed.value=0;post.u.danger.value=0;}
    if(state==='play'||state==='menu')map.update?.(now/1000,dt);
    post.render(now/1000);if(state==='play')hud.drawBattle(dt,{player,vm,mission,map,camera,enemies:combat.enemies,allies:combat.allies,nades,hurt,cleanup,prompt,notice,noticeT,squadCommand,telemetry},language);else hud.draw(dt,null);
  }catch(error){state='error';input.enabled=false;input.unlock();failure(error);}
}
initialize().catch(failure);
