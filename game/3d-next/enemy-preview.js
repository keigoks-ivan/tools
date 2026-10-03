import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { prepareRiggedOni, createRiggedOni } from './oni.js?v=20261003enemy1';
import { ONI_LOOKS } from './oni-art.js?v=20261003enemy1';

const $=id=>document.getElementById(id);
const descriptions={grunt:'鐵面、層疊肩甲、鍛造軍刀',runner:'輕裝斥候、半肩披風、皮革束帶',elite:'古銅玄甲、腰部疊甲、鍛造軍刀',shield:'斜面鳶盾、中央盾徽、銅甲護裙',archer:'反曲弓、背負箭筒、綠色半披風',bomber:'鐵箍火藥罐、點燃引信、皮革背帶',summoner:'紫色長披袍、魂晶法杖、祭器光環',captain:'赤旗、赤色戰袍、軍刀與角冠',boss:'骨色重甲、尖冠、長披風','officer-red':'赤銅甲、紅袍、骨冠','officer-shadow':'霜藍甲、靛色長披風、幽藍紋路','officer-chase':'青鋼甲、青色長披風、魂光紋路'};
const renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:true});
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x10121d);
const camera=new THREE.PerspectiveCamera(35,1,.08,60);
scene.add(new THREE.HemisphereLight(0xadb4e4,0x212033,2));
const key=new THREE.DirectionalLight(0xdac7ff,2.1);key.position.set(-7,12,4);scene.add(key);
const rim=new THREE.DirectionalLight(0x7049dd,1.2);rim.position.set(6,4,-8);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CylinderGeometry(1.18,1.22,.06,64),new THREE.MeshStandardMaterial({color:0x232a39,roughness:.7,metalness:.3}));floor.position.y=-.04;scene.add(floor);
const ring=new THREE.Mesh(new THREE.TorusGeometry(1.18,.006,4,64),new THREE.MeshBasicMaterial({color:0x9d8cba}));ring.rotation.x=Math.PI/2;ring.position.y=-.002;scene.add(ring);
for(const [id,look] of Object.entries(ONI_LOOKS)){const opt=document.createElement('option');opt.value=id;opt.textContent=look.name;$('role').append(opt);}
let actor,shared,turn=false,angle=0,strike=-1,last=0,nextFrame=0,frames=0,elapsed=0;
function resize(){const w=innerWidth,h=innerHeight;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(0,1.65,Math.max(5.7,4.8/camera.aspect));camera.lookAt(0,1.22,0);camera.updateProjectionMatrix();}
resize();addEventListener('resize',resize);
function choose(style){if(!shared)return;actor?.dispose();const role=style.startsWith('officer')?'boss':style;actor=createRiggedOni(THREE,shared,role,clone,{style});scene.add(actor.root);actor.root.scale.setScalar(role==='boss'?1/1.4:1);angle=0;strike=-1;actor.update('chase',0,.016);$('role').disabled=false;$('role').value=style;$('title').textContent=ONI_LOOKS[style].name;$('detail').textContent=descriptions[style];}
$('role').onchange=e=>choose(e.target.value);
$('front').onclick=()=>{angle=0;turn=false;$('turn').setAttribute('aria-pressed','false');};
$('back').onclick=()=>{angle=Math.PI;turn=false;$('turn').setAttribute('aria-pressed','false');};
$('turn').onclick=()=>{turn=!turn;$('turn').setAttribute('aria-pressed',String(turn));};
$('attack').onclick=()=>{actor?.onTelegraph(.72);strike=0;};
try{shared=prepareRiggedOni(THREE,await new GLTFLoader().loadAsync('../assets/enemies/oni-v2.glb?v=20260925b'));const requested=new URLSearchParams(location.search).get('role');choose(ONI_LOOKS[requested]?requested:'shield');}
catch(error){console.error(error);$('title').textContent='載入失敗';$('error').textContent=error.message;}
function frame(now){requestAnimationFrame(frame);if(document.hidden){last=nextFrame=now;return;}if(now+.25<nextFrame)return;nextFrame+=Math.max(1,Math.floor((now-nextFrame)/(1000/60))+1)*(1000/60);const dt=Math.min(.1,(now-last)/1000);last=now;if(actor){if(turn)angle+=dt*.38;actor.root.rotation.y=angle;if(strike>=0){strike+=dt;actor.update(strike<.72?'telegraph':'attack',strike,dt);if(strike>1.65)strike=-1;}else actor.update('chase',0,dt);}renderer.render(scene,camera);frames++;elapsed+=dt;if(elapsed>1){const meshes=[];actor?.root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});$('status').textContent=`${Math.round(frames/elapsed)} FPS · ${renderer.info.render.calls} draw calls · ${Math.round(meshes[0]?.geometry.index.count/3 || 0).toLocaleString()} 三角面／模型`;frames=elapsed=0;}}
requestAnimationFrame(frame);
addEventListener('pagehide',()=>{actor?.dispose();shared?.dispose();floor.geometry.dispose();floor.material.dispose();ring.geometry.dispose();ring.material.dispose();renderer.dispose();});
