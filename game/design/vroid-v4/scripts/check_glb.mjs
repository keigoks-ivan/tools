import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const file = process.argv[2];
const buf = await readFile(file);
function chunks(input){const b=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);const v=new DataView(b.buffer,b.byteOffset,b.byteLength);const out=[];let o=12;while(o<b.length){const s=v.getUint32(o,true),t=v.getUint32(o+4,true);out.push({t,d:b.slice(o+8,o+8+s)});o+=8+s;}return out;}
const cs=chunks(buf); const json=JSON.parse(new TextDecoder().decode(cs.find(c=>c.t===0x4e4f534a).d));
console.log('bytes',buf.length,'images',(json.images||[]).length,(json.images||[]).map(i=>i.mimeType).join(','),'ext',json.extensionsUsed);
// strip images for node parsing
delete json.images; delete json.textures; delete json.samplers;
for (const m of json.materials||[]) { const p=m.pbrMetallicRoughness||{}; delete p.baseColorTexture; delete p.metallicRoughnessTexture; delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture; }
json.extensionsUsed=(json.extensionsUsed||[]).filter(e=>!/webp|texture_transform/.test(e)); json.extensionsRequired=(json.extensionsRequired||[]).filter(e=>!/webp/.test(e));
let js=new TextEncoder().encode(JSON.stringify(json)); const pad=(4-js.length%4)%4; js=new Uint8Array([...js,...new Array(pad).fill(32)]);
const bin=cs.find(c=>c.t===0x004e4942).d;
const total=12+8+js.length+8+bin.length; const out=new Uint8Array(total); const dv=new DataView(out.buffer);
dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);dv.setUint32(12,js.length,true);dv.setUint32(16,0x4e4f534a,true);out.set(js,20);
dv.setUint32(20+js.length,bin.length,true);dv.setUint32(24+js.length,0x004e4942,true);out.set(bin,28+js.length);
const gltf = await new Promise((res,rej)=>new GLTFLoader().parse(out.buffer,'',res,rej));
const meshes=[]; gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
let tris=0; for(const m of meshes){const g=m.geometry; tris+=(g.index?g.index.count:g.attributes.position.count)/3;}
console.log('meshes',meshes.map(m=>`${m.name}${m.isSkinnedMesh?'(skin)':''}${m.morphTargetInfluences?'[morph '+m.morphTargetInfluences.length+']':''}`).join(' '));
console.log('tris',tris,'materials',new Set(meshes.flatMap(m=>[].concat(m.material))).size);
console.log('clips',gltf.animations.map(c=>`${c.name}:${c.duration.toFixed(2)}s/${c.tracks.length}`).join(' '));
const sword=gltf.scene.getObjectByName('Hero_sword'); assert.ok(sword?.isSkinnedMesh,'Hero_sword skinned');
const face=meshes.find(m=>m.morphTargetDictionary); console.log('face keys',face&&Object.keys(face.morphTargetDictionary).join(','),'defaults',face&&face.morphTargetInfluences.map(v=>v.toFixed(2)).join(','));
// animate every clip; check for NaN and explosion of the sword tip and body
const mixer=new THREE.AnimationMixer(gltf.scene); const p=new THREE.Vector3();
for(const clip of gltf.animations){mixer.stopAllAction(); mixer.clipAction(clip).reset().play(); let maxd=0;
  for(const f of [0,.25,.5,.75,.98]){mixer.setTime(clip.duration*f); gltf.scene.updateMatrixWorld(true);
    for(const m of meshes){ if(!m.isSkinnedMesh) continue; m.skeleton.update(); for(let i=0;i<m.geometry.attributes.position.count;i+=97){ m.getVertexPosition(i,p); m.localToWorld(p); assert.ok(Number.isFinite(p.x+p.y+p.z),`${clip.name} NaN`); maxd=Math.max(maxd,Math.hypot(p.x,p.z),p.y);} } }
  console.log('clip',clip.name,'max extent',maxd.toFixed(2));}
console.log('GLB_CHECK_OK');
