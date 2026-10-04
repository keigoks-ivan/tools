import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { kitanoScenery, kitanoBuilder, kitanoSignMaterial, kitanoSignUV, KITANO_LABELS } from '../kobe-kitano.js';
import { Solid } from '../zero/kit.js';
import { Pilot } from '../zero/player.js';

function fixture(options={}) {
  const faces=[],signs=[],solid=new Solid();
  const district=kitanoScenery({face:(...f)=>faces.push(f),sign:(points,id)=>signs.push({points,id}),
    solid:q=>solid.add({...q}),floor:q=>solid.add({...q})},options);
  return {faces,signs,solid,district};
}
function walk(solid,points,label) {
  const p=new Pilot(solid);p.reset(new THREE.Vector3(...points[0]),0);
  for(const target of points.slice(1)) {
    const [x,y,z]=target,limit=Math.ceil(Math.hypot(x-p.pos.x,z-p.pos.z)*30)+600;let frame=0;
    while(Math.hypot(x-p.pos.x,z-p.pos.z)>.18&&frame++<limit) {
      p.yaw=Math.atan2(x-p.pos.x,z-p.pos.z);p.update(1/60,{my:1,mx:0,lookX:0,lookY:0,sprint:true});
    }
    assert(frame<limit,`${label}: stopped at ${p.pos.toArray()}, target ${target}`);
    assert(Math.abs(p.pos.y-y)<.35,`${label}: unsupported route at ${target}`);
  }
}

test('完整北野近景與遠景保留地標、280m長街及不同洋館體量，靜態幾何可重現',()=>{
  const a=fixture(),b=fixture(),far=fixture({detail:false});
  const digest=f=>createHash('sha256').update(JSON.stringify([f.faces,f.signs])).digest('hex');
  assert.equal(digest(a),digest(b));
  for(const f of [a,far]) {
    const K=f.district;
    assert.equal(K.houses.length,17);assert.equal(K.landmarks.length,4);assert.equal(Object.keys(K.routes).length,18);
    assert.equal(K.bounds.x1-K.bounds.x0,112);assert.equal(K.bounds.z1-K.bounds.z0,280);
    assert(K.routes.walk.at(-1)[1]>28&&K.routes.walk.at(-1)[1]<32);
    assert(new Set(K.houses.map(h=>`${h.w},${h.d},${h.h}`)).size>=10);
    assert.deepEqual(K.landmarks.map(l=>l.id),['moegi','kazamidori','uroko','tenman']);
    assert.equal(K.triangles,(f.faces.length+f.signs.length)*2);
    for(const [a,b,c,d,col]of f.faces) {
      assert([...a,...b,...c,...d,...col].every(Number.isFinite));
      const area=new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).length();
      assert(area>1e-9,'Invisible or degenerate first triangle');
      for(const p of [a,b,c,d])assert(p[0]>=K.bounds.x0-.001&&p[0]<=K.bounds.x1+.001&&p[2]>=K.bounds.z0-.001&&p[2]<=K.bounds.z1+.001,'Geometry outside declared bounds');
    }
  }
  assert(a.district.triangles<=44000);assert(far.district.triangles<=10000);
  assert(a.district.planting.plants>=40);assert.equal(far.district.planting.plants,0);
});

test('四個旋轉方向的每棟庭院與地標都可往返步行，樹根與花帶落在真實台地上',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
    const {solid,district:K}=fixture({x:37,z:-21,ground:3,yaw});
    for(const [id,route]of Object.entries(K.routes)) {
      walk(solid,route,`${yaw}/${id}/up`);walk(solid,[...route].reverse(),`${yaw}/${id}/down`);
    }
    for(const [x,z,s,y]of K.treePoints) {
      assert(s>0);assert(Math.abs(K.heightAt(x,z)-y)<.001,'Floating tree root');
      assert(Math.abs(solid.floorAt(x,z,y+.01)-y)<.001,'Tree root lacks solid support');
    }
    for(const s of K.gardenSites)assert(Math.abs(K.heightAt(s.x,s.z)-s.ground)<.001,'Floating garden planting');
    const p=new THREE.Vector3(...K.routes.walk[7]);p.y=3;
    const original=p.clone();assert(solid.pushOut(p,.34,p.y,p.y+1.7,.45));assert(p.distanceTo(original)>.3,'Raised street has a walkable hollow underneath');
  }
});

test('正面玻璃沒有被牆面蓋住，近遠立面均保留透明材質面',()=>{
  for(const detail of [true,false]) {
    const {faces}=fixture({detail});
    const ray=new THREE.Ray(new THREE.Vector3(-20.75,3.8,10),new THREE.Vector3(0,0,1));
    let distance=Infinity,surface=-1;
    for(const [a,b,c,d,col]of faces)for(const t of [[a,b,c],[a,c,d]]) {
      const hit=ray.intersectTriangle(...t.map(p=>new THREE.Vector3(...p)),false,new THREE.Vector3());
      if(hit&&ray.origin.distanceTo(hit)<distance){distance=ray.origin.distanceTo(hit);surface=col[4];}
    }
    assert.equal(surface,4,'Front window is hidden by an opaque wall');assert(distance<5);
  }
});

test('風見鶏前院保留觀景視線，うろこ閣樓窗可見且樹根承重',()=>{
  const {faces,district:K}=fixture();
  assert(!K.treePoints.some(([x,z])=>Math.abs(x+14)<.01&&z<90));
  const moved=K.treePoints.find(([x,z])=>Math.abs(x+14)<.01&&Math.abs(z-103.5)<.01);
  assert(moved&&Math.abs(K.heightAt(moved[0],moved[1])-moved[3])<.001);
  const ray=new THREE.Ray(new THREE.Vector3(43.25,21.7,94),new THREE.Vector3(0,0,1));let distance=Infinity,surface=-1;
  for(const [a,b,c,d,col]of faces)for(const tri of [[a,b,c],[a,c,d]]) {
    const hit=ray.intersectTriangle(...tri.map(p=>new THREE.Vector3(...p)),true,new THREE.Vector3());
    if(hit&&ray.origin.distanceTo(hit)<distance){distance=ray.origin.distanceTo(hit);surface=col[4];}
  }
  assert.equal(surface,4,'Attic glazing hidden behind gable wall');
});

test('風見鶏官方配色：塔頂白灰木骨、下段紅磚，二樓水平木骨不遮玻璃',()=>{
  for(const detail of [true,false]) {
    const {faces}=fixture({detail}),ky=8.6;
    const surfaceAt=(x,y,z)=>{
      const ray=new THREE.Ray(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,1));let distance=Infinity,surface=-1;
      for(const [a,b,c,d,col]of faces)for(const tri of [[a,b,c],[a,c,d]]) {
        const hit=ray.intersectTriangle(...tri.map(p=>new THREE.Vector3(...p)),true,new THREE.Vector3());
        if(hit&&ray.origin.distanceTo(hit)<distance){distance=ray.origin.distanceTo(hit);surface=col[4];}
      }
      return surface;
    };
    assert.equal(surfaceAt(3.55,ky+9.2,90),6,'Tower upper floor must have pale infill');
    assert.equal(surfaceAt(3.55,ky+7.2,90),7,'Tower lower floors must retain red brick');
    assert.equal(surfaceAt(5.24,ky+9.2,90),5,'Tower upper infill must retain dark timber posts');
    assert.equal(surfaceAt(-9,ky+6.32,90),5,'Main upper floor must retain horizontal timber framing');
    assert.equal(surfaceAt(-8.2,ky+5.5,90),4,'Main upper windows must remain exposed');
  }
});

test('萌黃之館二樓廊窗從正面與兩端可見，一樓廊柱之間維持開放',()=>{
  for(const detail of [true,false]) {
    const {faces}=fixture({detail});
    for(const [origin,direction]of [[[-45,14.5,75.2],[1,0,0]],[[-41.5,14.5,67],[0,0,1]],[[-41.5,14.5,85],[0,0,-1]]]) {
      const surfaceAt=y=>{
        const ray=new THREE.Ray(new THREE.Vector3(origin[0],y,origin[2]),new THREE.Vector3(...direction));let distance=3,surface=-1;
        for(const [a,b,c,d,col]of faces)for(const tri of [[a,b,c],[a,c,d]]) {
          const hit=ray.intersectTriangle(...tri.map(p=>new THREE.Vector3(...p)),true,new THREE.Vector3());
          if(hit&&ray.origin.distanceTo(hit)<distance){distance=ray.origin.distanceTo(hit);surface=col[4];}
        }
        return surface;
      };
      assert.equal(surfaceAt(14.5),4,'Upper veranda glazing is missing or hidden by a frame');
      assert.equal(surfaceAt(10.2),-1,'Ground-floor veranda must remain open');
    }
  }
});

test('所有洋館的斜屋頂均可從上方命中正面，避免屋頂倒面被剔除',()=>{
  for(const detail of [true,false]) {
    const {faces,district:K}=fixture({detail});
    for(const h of K.houses) {
      const ray=new THREE.Ray(new THREE.Vector3(h.x,h.y+h.h+12,h.z-h.d*.24),new THREE.Vector3(0,-1,0));
      let distance=Infinity,surface=-1;
      for(const [a,b,c,d,col]of faces)for(const t of [[a,b,c],[a,c,d]]) {
        const hit=ray.intersectTriangle(...t.map(p=>new THREE.Vector3(...p)),true,new THREE.Vector3());
        if(hit&&ray.origin.distanceTo(hit)<distance){distance=ray.origin.distanceTo(hit);surface=col[4];}
      }
      assert.equal(surface,3,`Missing upward roof at ${h.x},${h.z}`);
    }
  }
});

test('日文固定路牌共用同一材質與八格UV，Builder只增加一個靜態牌桶',()=>{
  assert.deepEqual(KITANO_LABELS,['北野異人館街','風見鶏の館','萌黄の館','うろこの家','北野坂','北野天満神社','山本通','北野町広場']);
  assert.equal(kitanoSignMaterial(),kitanoSignMaterial());
  for(let i=0;i<8;i++)for(const uv of kitanoSignUV(i))assert(uv.every(v=>v>0&&v<1));
  assert.throws(()=>kitanoSignUV(8),RangeError);assert.throws(()=>kitanoSignUV(-1),RangeError);
  const counts={},B=Object.fromEntries(['concrete','metal','rust','brick','glass','painted','kitanoSigns','kitanoGarden','kitanoHeritage'].map(k=>[k,{quad(){counts[k]=(counts[k]||0)+1;}}]));
  const result=kitanoBuilder({B,solid:new Solid()});
  assert.equal(Object.values(counts).reduce((n,v)=>n+v,0)*2,result.triangles);
  assert(counts.brick>0&&counts.glass>0&&counts.kitanoSigns>0&&counts.kitanoGarden>0&&counts.kitanoHeritage>0);
  const legacy={...B};delete legacy.kitanoHeritage;assert.doesNotThrow(()=>kitanoBuilder({B:legacy,solid:new Solid()}));
  assert.throws(()=>kitanoScenery({face(){}},{yaw:.3}),RangeError);
  assert.doesNotThrow(()=>kitanoScenery({face(){}},{yaw:.3,colliders:false,detail:false}));
});
