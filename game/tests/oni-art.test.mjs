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
      const u=g.attributes.uv.getX(i),v=g.attributes.uv.getY(i);assert.ok(u>=0&&u<=1&&v>=0&&v<=1,style+' equipment atlas bounds');
      assert.equal(body.skeleton.bones[g.attributes.skinIndex.getX(i)].name,'mixamorig'+feature.bone);
      assert.equal(g.attributes.skinWeight.getX(i),1);
    }
    actor.dispose();
  }
  assert.ok(shared.art.stats().bytes<10*1024*1024,'all 12 cached variants under 10 MiB');
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

test('clones share geometry and textures while keeping independent skeletons and disposal',()=>{
  const a=createRiggedOni(THREE,shared,'shield',clone),b=createRiggedOni(THREE,shared,'shield',clone);
  const ma=bodyOf(a),mb=bodyOf(b);assert.equal(ma.geometry,mb.geometry);assert.equal(ma.material,mb.material);assert.notEqual(ma.skeleton,mb.skeleton);
  assert.equal(ma.material.map,atlas);assert.equal(ma.material.emissiveMap,emission);
  let disposed=0,texturesDisposed=0;atlas.addEventListener('dispose',()=>texturesDisposed++);emission.addEventListener('dispose',()=>texturesDisposed++);ma.geometry.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,0);b.update('chase',0,.016);b.root.updateMatrixWorld(true);assert.ok(Number.isFinite(mb.getVertexPosition(0,new THREE.Vector3()).x));b.dispose();assert.equal(disposed,0);assert.equal(texturesDisposed,0);
  const stats=shared.art.stats();console.log('Enemy art cache',stats);shared.dispose();assert.equal(disposed,1);assert.equal(texturesDisposed,2);
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
