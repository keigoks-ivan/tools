import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { prepareRiggedOni, createRiggedOni } from '../3d-next/oni.js';
import { ONI_LOOKS } from '../3d-next/oni-art.js';

const bytes=stripImages(await readFile(new URL('../assets/enemies/oni-v2.glb',import.meta.url)));
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer,'',resolve,reject));
const atlas=new THREE.DataTexture(new Uint8Array([180,170,160,255]),1,1);
const emission=new THREE.DataTexture(new Uint8Array([100,50,200,255]),1,1);
gltf.scene.traverse(o=>{if(o.isSkinnedMesh){o.material.map=atlas;o.material.emissiveMap=emission;}});
const shared=prepareRiggedOni(THREE,gltf);
const bodyOf=actor=>{let body;actor.root.traverse(o=>{if(o.isSkinnedMesh && o.material!==shared.outline)body=o;});return body;};

test('all enemy uniforms retain the source rig and stay within the geometry budget',()=>{
  const source=shared.templates.oni_grunt.geometry;
  for(const style of Object.keys(ONI_LOOKS)){
    const actor=createRiggedOni(THREE,shared,style.startsWith('officer')?'boss':style,clone,{style});
    const body=bodyOf(actor),g=body.geometry;
    let draws=0;actor.root.traverse(o=>{if(o.isMesh)draws++;});assert.equal(draws,2,style);
    assert.ok(g.index.count/3<11000,style+' triangle budget');
    assert.ok(g.attributes.position.count>source.attributes.position.count);
    for(const attr of Object.values(g.attributes))for(const v of attr.array)assert.ok(Number.isFinite(v),style+' finite vertices');
    for(let i=0;i<g.attributes.skinWeight.count;i++){
      let sum=0;for(let lane=0;lane<4;lane++){const w=g.attributes.skinWeight.getComponent(i,lane);sum+=w;if(w>0)assert.ok(g.attributes.skinIndex.getComponent(i,lane)<body.skeleton.bones.length);}
      assert.ok(Math.abs(sum-1)<.002,style+' skin weights');
    }
    for(const feature of g.userData.features)for(let i=feature.offset;i<feature.offset+feature.count;i++){
      const u=g.attributes.uv.getX(i),v=g.attributes.uv.getY(i);assert.ok(v>=0&&v<=1 && (feature.surface?u>feature.surface*2&&u<feature.surface*2+1:u>=0&&u<=1),style+' equipment atlas bounds');
      assert.equal(body.skeleton.bones[g.attributes.skinIndex.getX(i)].name,'mixamorig'+feature.bone);
      assert.equal(g.attributes.skinWeight.getX(i),1);
    }
    actor.dispose();
    shared.art.corpseGeometry(style);
  }
  assert.ok(shared.art.stats().bytes<10*1024*1024,'all 12 live and dead variants under 10 MiB');
});

test('weapons remain attached to hands through real wind-up and strike clips',()=>{
  for(const [style,featureName] of [['grunt','forged sabre'],['shield','shield shell'],['archer','recurve bow'],['summoner','ritual staff']]){
    const actor=createRiggedOni(THREE,shared,style,clone),body=bodyOf(actor),g=body.geometry;
    const f=g.userData.features.find(f=>f.name===featureName),bone=body.skeleton.bones[g.attributes.skinIndex.getX(f.offset)];
    const localPoints=[],worldPoints=[];
    actor.onTelegraph(.72);
    for(let frame=0;frame<65;frame++){
      actor.update(frame<44?'telegraph':'attack',frame/60,1/60);actor.root.updateMatrixWorld(true);body.skeleton.update();
      const p=body.getVertexPosition(f.offset,new THREE.Vector3());body.localToWorld(p);worldPoints.push(p.clone());localPoints.push(bone.worldToLocal(p));
    }
    for(const p of localPoints)assert.ok(p.distanceTo(localPoints[0])<.0001,style+' detached equipment');
    assert.ok(worldPoints.some(p=>p.distanceTo(worldPoints[0])>.05),style+' weapon did not animate');
    actor.dispose();
  }
});

test('laminated bow is closed and its outward faces are visible',()=>{
  const g=shared.art.geometry('archer'),f=g.userData.features.find(f=>f.name==='recurve bow');
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let volume=0,triangles=0;
  for(let i=0;i<g.index.count;i+=3){const indices=[0,1,2].map(k=>g.index.getX(i+k));if(!indices.every(j=>j>=f.offset&&j<f.offset+f.count))continue;
    a.fromBufferAttribute(g.attributes.position,indices[0]);b.fromBufferAttribute(g.attributes.position,indices[1]);c.fromBufferAttribute(g.attributes.position,indices[2]);volume+=a.dot(b.cross(c))/6;triangles++;
  }
  assert.ok(triangles>100);assert.ok(volume>.0001,'bow faces point inward and disappear under face culling');
});

test('killed bow and shield equipment retire without changing live clones',()=>{
  for(const role of ['archer','shield']){
    const dead=createRiggedOni(THREE,shared,role,clone),live=createRiggedOni(THREE,shared,role,clone);
    const deadBody=bodyOf(dead),liveBody=bodyOf(live),liveGeometry=liveBody.geometry;
    const held=liveGeometry.userData.features.filter(f=>/Hand|ForeArm/.test(f.bone));
    assert.ok(held.length>0,role+' needs held equipment for the regression');
    const scene=new THREE.Scene();scene.add(dead.root,live.root);dead.onSpawn();dead.onKill();
    const corpse=deadBody.geometry;
    assert.notEqual(corpse,liveGeometry);assert.equal(liveBody.geometry,liveGeometry);
    for(const index of corpse.index.array)assert.ok(!held.some(f=>index>=f.offset&&index<f.offset+f.count),role+' left held gear in corpse');
    assert.ok(liveGeometry.index.array.some(index=>held.some(f=>index>=f.offset&&index<f.offset+f.count)),role+' removed another actor gear');
    for(const [name,attr] of Object.entries(corpse.attributes))assert.equal(attr,liveGeometry.attributes[name],role+' duplicated vertex buffer');
    dead.root.traverse(o=>{if(o.isSkinnedMesh)assert.equal(o.geometry,corpse,'outline still shows equipment');});
    for(let i=0;i<480&&!dead.finished();i++)dead.update('dead',0,1/60);
    assert.ok(dead.finished(),role+' corpse never finishes');dead.dispose();assert.equal(dead.root.parent,null);assert.equal(scene.children.length,1);
    live.update('chase',0,.016);live.dispose();
  }
});

test('equipment surface texture stays small with packed roughness and valid patches',()=>{
  const texture=shared.gearTexture,data=texture.image.data;
  assert.equal(texture.image.width,256);assert.equal(texture.image.height,256);assert.equal(data.byteLength,256*256*4);
  assert.equal(texture.colorSpace,THREE.SRGBColorSpace);assert.equal(texture.generateMipmaps,true);
  for(let i=3;i<data.length;i+=4)assert.ok(data[i]>=90&&data[i]<=230,'invalid packed roughness');
  assert.ok(data.some((v,i)=>i%4===0&&v!==data[0]),'texture is flat');
});

test('clones share geometry and textures while keeping independent skeletons and disposal',()=>{
  const a=createRiggedOni(THREE,shared,'shield',clone),b=createRiggedOni(THREE,shared,'shield',clone);
  const ma=bodyOf(a),mb=bodyOf(b);assert.equal(ma.geometry,mb.geometry);assert.equal(ma.material,mb.material);assert.notEqual(ma.skeleton,mb.skeleton);
  assert.equal(ma.material.map,atlas);assert.equal(ma.material.emissiveMap,emission);
  let disposed=0,texturesDisposed=0,gearDisposed=0;shared.gearTexture.addEventListener('dispose',()=>gearDisposed++);atlas.addEventListener('dispose',()=>texturesDisposed++);emission.addEventListener('dispose',()=>texturesDisposed++);ma.geometry.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,0);b.update('chase',0,.016);b.root.updateMatrixWorld(true);assert.ok(Number.isFinite(mb.getVertexPosition(0,new THREE.Vector3()).x));b.dispose();assert.equal(disposed,0);assert.equal(texturesDisposed,0);assert.equal(gearDisposed,0);
  const stats=shared.art.stats();console.log('Enemy art cache',stats);shared.dispose();assert.equal(disposed,1);assert.equal(texturesDisposed,2);assert.equal(gearDisposed,1);
});

function stripImages(input) {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    const size = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + size) });
    offset += 8 + size;
  }
  const jsonChunk = chunks.find(chunk => chunk.type === 0x4e4f534a);
  assert.ok(jsonChunk, 'GLB JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(jsonChunk.data));
  json.images = [];
  json.textures = [];
  json.samplers = [];
  json.extensionsUsed = (json.extensionsUsed || []).filter(name => name !== 'EXT_texture_webp');
  json.extensionsRequired = (json.extensionsRequired || []).filter(name => name !== 'EXT_texture_webp');
  for (const material of json.materials || []) stripTextureProperties(material);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array((encoded.length + 3) & ~3).fill(0x20);
  padded.set(encoded);
  chunks[chunks.indexOf(jsonChunk)] = { type: jsonChunk.type, data: padded };
  const length = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const result = new Uint8Array(length);
  const outputView = new DataView(result.buffer);
  outputView.setUint32(0, 0x46546c67, true);
  outputView.setUint32(4, 2, true);
  outputView.setUint32(8, length, true);
  offset = 12;
  for (const chunk of chunks) {
    outputView.setUint32(offset, chunk.data.length, true);
    outputView.setUint32(offset + 4, chunk.type, true);
    result.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return result;
}

function stripTextureProperties(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (/texture$/i.test(key)) delete value[key];
    else stripTextureProperties(value[key]);
  }
}
