import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// All motion is local to one small civilian prop. Its next journey starts only when the sector changes.
function trafficMesh(type){
  const root=new THREE.Group(), buckets=[[],[]], cube=new THREE.BoxGeometry(),wheel=new THREE.CylinderGeometry(.62,.62,.34,12).rotateX(Math.PI/2);
  const tint=new THREE.Color(), matrix=new THREE.Matrix4(), pos=new THREE.Vector3(),rot=new THREE.Quaternion(),size=new THREE.Vector3();
  function part(g,x,y,z,w,h,d,color,glass=false,tilt=0){
    matrix.compose(pos.set(x,y,z),rot.setFromAxisAngle(upZ,tilt),size.set(w,h,d));
    const copy=g.clone().applyMatrix4(matrix);
    const cols=new Float32Array(copy.attributes.position.count*3);
    tint.setHex(color);
    for(let i=0;i<cols.length;i+=3)tint.toArray(cols,i);
    copy.setAttribute('color',new THREE.BufferAttribute(cols,3));buckets[+glass].push(copy);
  }
  const upZ=new THREE.Vector3(0,0,1);
  const box=(...args)=>part(cube,...args);
  if(type==='rail'){
    const paint=0xd7d7c9;
    box(0,1.20,0,8.2,1.20,2.32,paint);
    box(0,2.15,0,7.8,1.1,2.24,0x39474b,true);
    box(-.09,2.83,0,7.95,.35,2.36,paint);
    box(-.52,3.12,0,3.31,.32,1.47,0xa5aeaa);
    for(const side of [-1,1]){
      box(0,1.38,side*1.17,7.95,.21,.06,0x688b86);
      for(const x of [-3.17,-2,-.8,.55,1.81,2.98])box(x,2.16,side*1.14,.12,1.09,.08,paint);
      box(3.8,1.10,side*.93,.53,.3,.36,0xf0d6a2);
      for(const x of [-2.65,2.52]){
        part(wheel,x,.65,side*1.09,1,1,1,0x2d3638,false,0);
      }
    }
    box(4.03,1.68,0,.13,.19,1.88,0x445351);
    box(4.01,2.2,0,.10,.85,2.03,0x41565a,true);
  }else{
    const ferry=type==='aomi',length=ferry?45:20,w=ferry?12:5.7;
    // The tapered bow and shallow transom read from the cockpit and from air.
    const ring=[[-.50,.31],[-.44,.44],[.25,.49],[.45,.33],[.55,.02]];
    const verts=[],uv=[],idx=[];
    for(const [along,beam] of ring){
      for(const [span,y] of [[-.80,-.3],[-1,2.45],[1,2.45],[.80,-.3]]){
        verts.push(along*length,y,beam*w*span);uv.push(along+.5,span*.5+.5);
      }
    }
    for(let i=0;i<ring.length-1;i++)for(let j=0;j<4;j++){
      const a=i*4+j,b=i*4+(j+1)%4;idx.push(a,b,b+4,a,b+4,a+4);
    }
    idx.push(0,1,2,0,2,3,16,18,17,16,19,18);
    const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));shell.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));shell.setIndex(idx);shell.computeVertexNormals();
    part(shell,0,0,0,1,1,1,ferry?0x6a7778:0x954d45);
    shell.dispose();
    box(-length*.13,3.55,0,length*.35,2.5,w*.69,0xd0d0bf);
    box(-length*.10,5.40,0,length*.27,1.45,w*.64,0x4b6670,true);
    box(-length*.10,6.22,0,length*.32,.34,w*.75,0xd3d4c8);
    for(const side of [-1,1]){
      for(let j=0;j<5;j++)box((-length*.19)+length*j*.041,5.40,side*w*.325,.16,1.42,.13,0xd1d1c6);
      box(-length*.05,2.8,side*w*.44,length*.60,.27,.24,0xb4a690);
      for(let j=-2;j<3;j++)box(j*length*.116,2.04,side*w*.46,1.18,.8,.23,0x424d4c);
    }
    box(-length*.31,4.6,0,1.2,4.4,1.45,0x855944);
    box(-length*.31,6.94,0,1.27,.48,1.5,0x404645);
    if(ferry)for(const side of [-1,1]){
      box(length*.29,2.8,side*w*.32,5.8,1.25,1.74,0x86908a);
      box(length*.15,3.0,side*w*.31,3.4,1.61,1.76,0x9b9b80);
    }
  }
  for(const [i,parts] of buckets.entries()){
    if(!parts.length)continue;
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:i?.26:.69,metalness:i?.37:.17});
    const g=mergeGeometries(parts),m=new THREE.Mesh(g,material);
    m.userData.fieldGeometry=m.userData.fieldMaterial=true;m.receiveShadow=m.castShadow=true;root.add(m);
    for(const p of parts)p.dispose();
  }
  cube.dispose();wheel.dispose();
  return root;
}

export function tokyoTraffic(world,group){
  const r=world.fieldRoute,type=r.district;
  if(!['lock','rail','aomi'].includes(type))return null;
  const root=trafficMesh(type);group.add(root);
  root.name={lock:'三號工作艇',rail:'整備班車',aomi:'三號艇'}[type];
  let pts,stageStops;
  if(type==='rail'){
    // Keep the bus on the road shoulder, offset from the player and the central encounter markers.
    pts=r.pts.map(([x,z])=>[x+6.6,z-5.8]);stageStops=[0,...r.secs.map(s=>s.at)];
  }else if(type==='lock'){
    pts=[[86,144],[103,144],[150,143],[219,145],[299,145],[385,145]];stageStops=[0,0,0,0,1,2,3,5];
  }else{
    pts=[[417,151],[443,155],[484,174],[531,202],[598,241]];
    stageStops=r.secs.map(()=>0).concat(4);
  }
  const distances=[0];
  for(let i=1;i<pts.length;i++)distances.push(distances[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  let distance=0,time=0;
  function pose(){
    let i=1;
    while(i<pts.length-1&&distance>distances[i])i++;
    const [x,z]=pts[i-1],[xx,zz]=pts[i],t=(distance-distances[i-1])/(distances[i]-distances[i-1]);
    const px=x+(xx-x)*t,pz=z+(zz-z)*t;
    root.position.set(px,type==='rail'?world.height(px,pz)+.14:.13+Math.sin(time*1.2)*.085,pz);
    root.rotation.y=-Math.atan2(zz-z,xx-x);
    root.rotation.x=type==='rail'?0:.010*Math.sin(time*.88);
  }
  const stop=(sec,done)=>distances[done?pts.length-1:stageStops[Math.max(0,Math.min(stageStops.length-1,sec??0))]];
  const control={root,reset(sec=0){distance=stop(sec,false);time=0;pose();},update(dt,sec,done){
    time+=dt;
    const goal=stop(sec,done),remaining=goal-distance,speed=type==='rail'?16:type==='lock'?8:11.5;
    if(remaining>.01)distance+=Math.min(remaining,dt*speed*Math.min(1,.22+remaining/14));
    pose();
  }};
  control.reset();return control;
}
