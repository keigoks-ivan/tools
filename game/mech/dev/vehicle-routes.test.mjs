import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid, SURFACES } from '../zero/kit.js';
import { Pilot } from '../zero/player.js';
import { buildMap as zeroMap } from '../zero/map.js';
import { buildMap as harborMap } from '../lastline/map.js';
import { FOOT_EXTENT as ZERO_EXTENT } from '../zero/script.js';
import { FOOT_EXTENT as HARBOR_EXTENT } from '../lastline/script.js';
import { GroundVehicle, VEHICLE_TYPES, sweepVehiclePose } from '../zero/ground-vehicle.mjs';
import { VEHICLE_MISSIONS, validateVehicleRoute } from '../zero/vehicle-story.mjs';
import { VEHICLE_ROUTES, vehicleRoutePoses, vehicleRouteLength } from '../zero/vehicle-routes.mjs';

// Geometry/colliders are the production maps. The canvas and scanned asset handles
// are stubbed, as in street-layout.test.mjs; no WebGL context is needed.
function fixture(build,harbor) {
  const previous=globalThis.document,gradient={addColorStop(){}};
  const ctx=new Proxy({measureText:s=>({width:String(s).length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
    {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>ctx}),fonts:{load:()=>Promise.resolve()}};
  try {
    const scene=new THREE.Scene(),solid=new Solid(),mats=Object.fromEntries(SURFACES.map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
    const placer={M:{nodes:new Proxy({},{get:()=>[{mat:new THREE.MeshStandardMaterial()}]}),has:()=>true},reg:[],bagWalls:[],size:()=>new THREE.Vector3(3,3,3),add:()=>harbor?{hide(){}}:null};
    return {scene,solid,map:build(scene,mats,solid,placer,harbor?{rockN:null}:null)};
  } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
const maps={zero:fixture(zeroMap,false),lastline:fixture(harborMap,true)};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
// vehicle-ops keeps every wheel two metres inside the infantry boundary.
const roadGround=(solid,extent)=>(x,z,ref)=>Math.abs(x)<extent-2&&Math.abs(z)<extent-2?solid.floorAt(x,z,ref):NaN;
function walk(solid,points,name) {
  const pilot=new Pilot(solid);pilot.reset(new THREE.Vector3(...points[0]),0);
  for(const [x,y,z]of points.slice(1)) {
    const limit=Math.ceil(Math.hypot(pilot.pos.x-x,pilot.pos.z-z)*30)+600;let frames=0;
    while(Math.hypot(pilot.pos.x-x,pilot.pos.z-z)>.18&&frames++<limit) {
      pilot.yaw=Math.atan2(x-pilot.pos.x,z-pilot.pos.z);
      pilot.update(1/60,{mx:0,my:1,lookX:0,lookY:0,sprint:true});
    }
    assert(frames<limit,`${name}: foot route blocked at ${pilot.pos.toArray()}`);
    assert(Math.abs(pilot.pos.y-y)<.35,`${name}: unsupported foot route`);
  }
}

test('五條支線的車型、操作停車點與劇情順序一致，路程有200至600公尺',()=>{
  assert.equal(Object.keys(VEHICLE_ROUTES).length,5);
  for(const mission of VEHICLE_MISSIONS) {
    const pack=VEHICLE_ROUTES[mission.id];assert(validateVehicleRoute(mission.id,pack));
    assert.equal(pack.vehicleType,mission.vehicle==='4x4'?'patrol':'apc');
    assert(Object.isFrozen(pack)&&Object.isFrozen(pack.sites)&&Object.isFrozen(pack.driveRoutes));
    let parked=pack.vehicleSpawn,length=0;
    for(const stage of mission.stages) {
      if(stage.route) {
        const route=pack.driveRoutes[stage.route];assert(distance(parked,route[0])<.01,mission.id+' driving stage starts away from parked car');
        length+=vehicleRouteLength(route);parked=route.at(-1);
      } else {
        assert(distance(parked,pack.parking[stage.site])<.01,mission.id+' operation requires another drive stage');
        if(pack.walkRoutes?.[stage.site]) {
          assert(distance(parked,pack.walkRoutes[stage.site][0])<.01);
          assert(distance(pack.sites[stage.site],pack.walkRoutes[stage.site].at(-1))<.01);
        } else assert(distance(parked,pack.sites[stage.site])<=12,mission.id+' operation is unreachable from parked vehicle');
      }
    }
    if(mission.id==='zero_patrol')assert(length>=200&&length<=600);
    else {
      const outward=Object.entries(pack.driveRoutes).filter(([k])=>k!=='return').reduce((n,[,r])=>n+vehicleRouteLength(r),0);
      assert(outward>=200&&outward<=600,mission.id+' outward trip too short or too long');
    }
  }
});

for(const[id,pack]of Object.entries(VEHICLE_ROUTES))test(id+'：實際車體連續掃掠、轉角、四輪支撐與世界邊界',()=>{
  const {solid}=maps[pack.map],profile=VEHICLE_TYPES[pack.vehicleType],extent=pack.map==='zero'?ZERO_EXTENT:HARBOR_EXTENT;
  for(const[key,route]of Object.entries(pack.driveRoutes)) {
    const poses=vehicleRoutePoses(route);let current=poses[0];
    for(const next of poses.slice(1)) {
      const result=sweepVehiclePose(solid,current,next,pack.vehicleType,{clearance:.2,groundAt:roadGround(solid,extent)});
      assert(result.ok,`${id}/${key}: ${result.reason} near ${JSON.stringify(result.pose)}, collider ${result.hit?.b?.id}`);
      current=result.pose;assert(Math.abs(current.pitch)<=profile.slope&&Math.abs(current.roll)<=.29);
      // A separate corner/edge cylinder scan catches accidental route clipping.
      const c=Math.cos(current.yaw),s=Math.sin(current.yaw);
      for(const x of [-profile.width/2,0,profile.width/2])for(const z of [-profile.length/2,0,profile.length/2]) {
        const wx=current.x+x*c+z*s,wz=current.z-x*s+z*c;
        assert(Math.max(Math.abs(wx),Math.abs(wz))+.2<extent,id+' vehicle crosses world edge');
        const y=current.y-Math.sin(current.pitch)*z+Math.sin(current.roll)*x;
        const q=new THREE.Vector3(wx,y,wz),old=q.clone();solid.pushOut(q,.1,y,y+profile.height,profile.step);
        assert(q.distanceTo(old)<.01,id+' rotated edge overlaps a solid');
      }
      // Each wheel stays on the same floor; this does not use floorAt(...,40),
      // which could silently accept the roof of a room instead of the road.
      for(const x of [-profile.track/2,profile.track/2])for(const z of [-profile.wheelbase/2,profile.wheelbase/2]) {
        const y=current.y-Math.sin(current.pitch)*z+Math.sin(current.roll)*x;
        const floor=solid.floorAt(current.x+x*c+z*s,current.z-x*s+z*c,y+profile.step+.08);
        assert(Math.abs(floor-y)<=profile.drop+.1,id+' wheel loses road support');
      }
    }
  }
});

test('所有停車帶能安全下車並步行操作；北野完整保留步行上下坡',()=>{
  for(const[id,pack]of Object.entries(VEHICLE_ROUTES)) {
    const {solid}=maps[pack.map],extent=pack.map==='zero'?ZERO_EXTENT:HARBOR_EXTENT;
    for(const[site,park]of Object.entries(pack.parking)) {
      const matching=Object.values(pack.driveRoutes).flatMap(vehicleRoutePoses).filter(p=>Math.hypot(p.x-park[0],p.z-park[2])<.01);
      const yaws=matching.length?matching.map(p=>p.yaw):[pack.vehicleYaw];
      for(const yaw of yaws) {
        const car=new GroundVehicle({id,type:pack.vehicleType,pos:park,yaw,solid,groundAt:roadGround(solid,extent)});car.seatMode='drive';
        const exit=car.exit();assert(exit,id+'/'+site+' cannot exit');
        assert(solid.ceilAt(exit.x,exit.z,exit.y+.1,.34)>exit.y+1.76);
        const path=pack.walkRoutes?.[site];
        walk(solid,[exit.toArray(),...(path||[pack.sites[site]])],id+'/'+site);
        if(path)walk(solid,[...path].reverse(),id+'/'+site+' return');
      }
    }
  }
});

test('驗收不是把碰撞關掉：舊貨櫃通道與北野陡階仍拒絕車體',()=>{
  const blocked=sweepVehiclePose(maps.lastline.solid,{x:140,y:0,z:-20,yaw:Math.PI/2},{x:360,y:0,z:-20,yaw:Math.PI/2},'apc',{clearance:.2});
  assert(!blocked.ok&&blocked.reason==='collision');
  const K=maps.zero.map.kitano,steps=K.routes.tenman;
  assert(steps&&steps.length>2);
  let current=vehicleRoutePoses(steps)[0],rejected=false;
  for(const next of vehicleRoutePoses(steps).slice(1)) {
    const result=sweepVehiclePose(maps.zero.solid,current,next,'patrol',{clearance:.2});
    if(!result.ok){rejected=true;break;}current=result.pose;
  }
  assert(rejected,'車輛不應通過神社石階與狹窄庭院');
});

test('支線守軍已駐守，各組最多四人，出生點遠離停車帶且整段巡邏可走',()=>{
  const required={zero_patrol:'roadblock',lastline_manifest:'defend',lastline_channel:'intercept',lastline_shuttle:'defend'};
  for(const[id,stage]of Object.entries(required)) {
    const pack=VEHICLE_ROUTES[id],defs=pack.encounters?.[stage]?.enemies,solid=maps[pack.map].solid;
    assert.equal(defs?.length,4,id+' missing persistent guards');
    const site=stage==='defend'?(id==='lastline_manifest'?'medical':'dock'):stage;
    for(const def of defs) {
      const spawn=[def.x,def.y,def.z],extent=pack.map==='zero'?ZERO_EXTENT:HARBOR_EXTENT;
      assert(['trooper','officer'].includes(def.type)&&def.alert===false);
      assert(distance(spawn,pack.parking[site])>=25,id+' guard appears beside parked car');
      assert(distance(spawn,pack.vehicleSpawn)>=25,id+' guard appears beside mission spawn');
      assert(Math.max(Math.abs(def.x),Math.abs(def.z))+.5<extent);
      assert.equal(solid.floorAt(def.x,def.z,def.y+.48),def.y,id+' guard on unsupported floor');
      const p=new THREE.Vector3(...spawn),old=p.clone();solid.pushOut(p,.34,def.y,def.y+1.76,.48);
      assert(p.distanceTo(old)<.01,id+' guard inside a collider');
      assert(solid.ceilAt(def.x,def.z,def.y+.1,.34)>def.y+1.76);
      const path=def.patrol.map(([x,z])=>[x,solid.floorAt(x,z,def.y+.48),z]);
      assert(path.every(p=>Math.abs(p[1]-def.y)<.05));
      walk(solid,[spawn,...path,spawn],id+' guard patrol');
      // Defense must be able to approach its station, not get trapped in the
      // next row of containers after the alert state is activated.
      walk(solid,[spawn,pack.sites[site]],id+' guard station approach');
    }
  }
});

test('港區停車後帶有偏移與偏斜，正式駕駛仍能轉入下一段且外輪不越界',()=>{
  const solid=maps.lastline.solid,groundAt=roadGround(solid,HARBOR_EXTENT);
  for(const[id,key,baseYaw]of [['lastline_channel','intercept',Math.PI/2],['lastline_shuttle','hangar',0]]) {
    const pack=VEHICLE_ROUTES[id],route=pack.driveRoutes[key],start=route[0];
    for(const[dx,dz,dyaw]of [[0,0,0],[.604824215894,-1.12186685191,.242053304412],[-.8,1.2,-.3],[1.2,-1.5,.4]]) {
      const v=new GroundVehicle({id,type:pack.vehicleType,pos:[start[0]+dx,start[1],start[2]+dz],yaw:baseYaw+dyaw,solid,groundAt});
      v.seatMode='drive';let index=0,frames=0;
      while(index<route.length&&frames++<8000) {
        const at=route[index],x=at[0]-v.pos.x,z=at[2]-v.pos.z,a=Math.atan2(x,z),delta=Math.atan2(Math.sin(a-v.yaw),Math.cos(a-v.yaw));
        const reverse=Math.abs(delta)>1.7,goal=reverse?Math.atan2(Math.sin(a+Math.PI-v.yaw),Math.cos(a+Math.PI-v.yaw)):delta;
        v.update(.05,{my:reverse?-.75:Math.abs(goal)>.4?.45:.75,mx:(reverse?1:-1)*Math.max(-1,Math.min(1,goal*2.4))});
        assert(!v.lastBlock,`${id}: ${v.lastBlock} from offset ${dx},${dz},${dyaw} at ${v.pos.toArray()}`);
        // Use the real five-metre mission waypoint tolerance, including the
        // dense bend; an exact-pose sweep alone misses the parking drift.
        if(distance(v.pos.toArray(),at)<=5)index++;
      }
      assert.equal(index,route.length,id+' steering cannot reach next station');
      v.setMode('gun');for(let i=0;i<80;i++)v.update(.05,{});
      assert(v.exit(),id+' cannot exit after actual driving');
    }
  }
});
