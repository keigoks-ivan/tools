import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { kitanoScenery } from '../kobe-kitano.js';
import { Solid } from '../zero/kit.js';
import { historyCard } from '../kobe-history.mjs';
import { createHistoryPlaques, HISTORY_PLAQUE_LABELS, historyPlaqueUV, historyPlaqueAtlas } from '../kobe-history-plaques.mjs';

const fixture=options=>{
  const solid=new Solid(),K=kitanoScenery({face(){},solid:q=>solid.add({...q}),floor:q=>solid.add({...q})},{detail:false,...options});
  return {solid,K,scene:new THREE.Scene()};
};
const distance=(p,a,b)=>{
  const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[2]-a[2]-t*dz);
};

test('四牌在真實庭台上且避開所有已驗證路線，四方旋轉與比例均保持有限座標',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const scale of [.75,1,1.3]) {
    const {scene,K,solid}=fixture({x:130,z:26,ground:2,yaw,scale}),before=solid.list.length,plaques=createHistoryPlaques(scene,K,{solid});
    assert.equal(plaques.items.length,4);assert.equal(solid.list.length,before,'Plaques changed physics');
    let tris=0;for(const mesh of plaques.meshes) {
      assert(!mesh.castShadow&&!mesh.receiveShadow&&mesh.userData.noAO);assert(!mesh.isLight);
      const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;tris+=p.count/3;
      assert([...p.array,...n.array].every(Number.isFinite));
      for(let i=0;i<p.count;i++)assert(p.getX(i)>=K.bounds.x0-.001&&p.getX(i)<=K.bounds.x1+.001&&p.getY(i)>=K.bounds.y0-.001&&p.getY(i)<=K.bounds.y1+.001&&p.getZ(i)>=K.bounds.z0-.001&&p.getZ(i)<=K.bounds.z1+.001,'Plaque geometry outside district');
      for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);assert(new THREE.Vector3().crossVectors(b.sub(a),c.sub(a)).length()>1e-7);}
    }
    assert(tris<=600);assert(plaques.meshes.length<=2);
    for(const it of plaques.items) {
      assert(historyCard(it.id));assert.equal(it.id,it.historyCard);assert(it.p.isVector3&&it.pin.isVector3);assert(Math.abs(it.scale-scale)<1e-6);
      assert(Math.abs(solid.floorAt(it.base[0],it.base[2],it.base[1]+.1)-it.base[1])<.001,'Floating base');
      assert(it.base[0]>=K.bounds.x0&&it.base[0]<=K.bounds.x1&&it.base[2]>=K.bounds.z0&&it.base[2]<=K.bounds.z1);
      for(const [id,route]of Object.entries(K.routes))for(let i=1;i<route.length;i++)assert(distance(it.base,route[i-1],route[i])>1.35*scale,`${it.id} overlaps ${id}`);
      const entrance=K.landmarks.find(l=>l.id===it.id).entrance;assert(Math.hypot(it.base[0]-entrance[0],it.base[2]-entrance[2])<4*scale);
      const toward=new THREE.Vector3(...entrance).sub(new THREE.Vector3(...it.base));toward.y=0;assert(toward.dot(new THREE.Vector3(...it.normal))>0,'Plaque back faces approach');
    }
    plaques.dispose();assert.equal(scene.children.length,0);
  }
});

test('解說字牌使用正確名稱與年代限定，四格UV不重疊且不新增高解析貼圖',()=>{
  assert.deepEqual(HISTORY_PLAQUE_LABELS.map(p=>p.name),['萌黄の館','風見鶏の館','うろこの家','北野天満神社']);
  assert.equal(HISTORY_PLAQUE_LABELS[0].date,'1903年 建築');assert.equal(HISTORY_PLAQUE_LABELS[1].date,'1909年頃 建築');
  assert.equal(HISTORY_PLAQUE_LABELS[2].date,'明治後期 建築');assert(HISTORY_PLAQUE_LABELS[2].note.includes('伝わる'));
  assert(HISTORY_PLAQUE_LABELS[3].date.includes('本殿・拝殿 1742年'));assert(HISTORY_PLAQUE_LABELS[3].note.includes('社伝'));
  const texture=historyPlaqueAtlas();assert.equal(texture.image.width,512);assert.equal(texture.image.height,256);assert.equal(texture,historyPlaqueAtlas());
  assert.equal(texture.colorSpace,THREE.SRGBColorSpace);
  for(let i=0;i<4;i++)for(const [u,v]of historyPlaqueUV(i)){assert(u>i%2*.5&&u<(i%2+1)*.5);assert(v>1-(Math.floor(i/2)+1)*.5&&v<1-Math.floor(i/2)*.5);}
  assert.throws(()=>historyPlaqueUV(4));assert.throws(()=>historyPlaqueUV(-1));
});

test('重設與跨場景重用cached材質不會增生mesh，dispose只釋放自有geometry',()=>{
  const {scene,K}=fixture(),a=createHistoryPlaques(scene,K),material=a.material;let materialDisposed=0,mapDisposed=0;
  material.addEventListener('dispose',()=>materialDisposed++);material.map.addEventListener('dispose',()=>mapDisposed++);
  assert.equal(createHistoryPlaques(scene,K),a);assert.equal(scene.children.length,2);
  const other=new THREE.Scene(),b=createHistoryPlaques(other,K);assert.equal(b.material,material);assert.equal(b.meshes[1].material,a.meshes[1].material);
  const supplied=new THREE.MeshStandardMaterial({vertexColors:true});const third=createHistoryPlaques(new THREE.Scene(),K,{materials:{landmarkPaint:supplied}});assert.equal(third.meshes[1].material,supplied);
  for(let i=0;i<4;i++){a.dispose();const next=createHistoryPlaques(scene,K);assert.equal(scene.children.length,2);assert.equal(next.material,material);next.dispose();assert.equal(scene.children.length,0);}
  b.dispose();third.dispose();assert.equal(materialDisposed,0);assert.equal(mapDisposed,0);
});

test('Canvas使用既有日文字體且字體ready只重畫同一張圖集，無DOM可用小DataTexture',async t=>{
  const old=globalThis.document;t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old;});
  const texts=[],loads=[];let finish;const ready=new Promise(resolve=>{finish=resolve;});
  const ctx=new Proxy({measureText:s=>({width:s.length*17}),fillText:(...a)=>texts.push(a)},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  globalThis.document={createElement:()=>({getContext:()=>ctx}),fonts:{load:(font,text)=>{loads.push({font,text});return ready;}}};
  const m=await import('../kobe-history-plaques.mjs?canvas-test'),a=m.historyPlaqueAtlas(),version=a.version;
  assert(a.isCanvasTexture);assert.equal(texts.length,16);assert.equal(loads.length,2);assert(loads.every(l=>l.font.includes('Noto Sans')));
  finish();await ready;await Promise.resolve();await Promise.resolve();assert.equal(texts.length,32);assert(a.version>version);assert.equal(m.historyPlaqueAtlas(),a);
  delete globalThis.document;const fallback=await import('../kobe-history-plaques.mjs?fallback-test'),data=fallback.historyPlaqueAtlas();assert(data.isDataTexture);assert.equal(data.image.data.length,512*256*4);
});
