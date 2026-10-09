import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRenderPipeline } from './render-pipeline.js';

function renderer(){const calls=[];let target=null;return{calls,capabilities:{maxSamples:4},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},render:(scene,camera)=>calls.push({scene,camera,target})};}
test('high quality draws the world once, restores the target and keeps output sizing correct',()=>{
  const r=renderer(),pipeline=createRenderPipeline(r),world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,16/9,.05,4200);
  pipeline.resize(1280,720);pipeline.setQuality('high');pipeline.render(world,camera);
  assert.equal(r.calls.length,3);assert.equal(r.calls[0].scene,world);assert.equal(r.calls[1].target.width,640);assert.equal(r.calls[1].target.height,360);
  assert.equal(r.calls[0].target.width,1280);assert.equal(r.calls[0].target.height,720);assert.equal(r.calls[0].target.samples,4);
  assert.equal(r.calls[2].target,null);assert.equal(r.getRenderTarget(),null);
  pipeline.dispose();
});
test('phones skip the occlusion pass and low quality preserves direct rendering',()=>{
  const r=renderer(),pipeline=createRenderPipeline(r,{mobile:true}),world=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  pipeline.resize(844,390);pipeline.setQuality('high');pipeline.render(world,camera);
  assert.equal(r.calls.length,2);assert.equal(r.calls[0].target.samples,2);
  r.calls.length=0;pipeline.setQuality('low');pipeline.render(world,camera);assert.deepEqual(r.calls,[{scene:world,camera,target:null}]);
  pipeline.dispose();pipeline.render(world,camera);assert.equal(r.calls.length,1,'a disposed pipeline cannot render again');
});
test('render target and shared quad resources dispose once',()=>{
  const r=renderer(),pipeline=createRenderPipeline(r),world=new THREE.Scene(),camera=new THREE.PerspectiveCamera();pipeline.render(world,camera);
  const resources=new Set(r.calls.filter(c=>c.target).flatMap(c=>[c.target,c.target.depthTexture].filter(Boolean)));
  for(const call of r.calls.filter(c=>c.scene!==world))resources.add(call.scene.children[0].geometry);
  let count=0;for(const resource of resources)resource.addEventListener('dispose',()=>count++);
  pipeline.dispose();pipeline.dispose();assert.equal(count,resources.size);
});
