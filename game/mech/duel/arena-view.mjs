import * as THREE from '../../lib/three.module.js';
import { ARENA } from './arena-layout.mjs';
import { aimTarget, pilotAim } from './rules.mjs';
import { createDuelMech } from './duel-mech.mjs';
import { buildHarbor } from './harbor-view.mjs';

const team = [new THREE.Color(0x66ddee),new THREE.Color(0xff985e)];
const impactColor = new THREE.Color(0xffc784);
const up=new THREE.Vector3(0,1,0);
const cover = ARENA.cover.map(({x,z,width,depth,height})=>new THREE.Box3(
  new THREE.Vector3(x-width/2-.62,-1,z-depth/2-.62),new THREE.Vector3(x+width/2+.62,height+.62,z+depth/2+.62),
));
const preview = [
  {x:-21,y:0,z:-3,yaw:1.91,pitch:.045,preview:true},
  {x:-27,y:0,z:33,yaw:1.60,pitch:.035,preview:true},
];

function relayMarker() {
  const {x,z,radius}=ARENA.relay, g=new THREE.Group();
  g.position.set(x,.035,z);
  g.add(new THREE.Mesh(
    new THREE.RingGeometry(radius-.51,radius,72).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:0xbeb691,transparent:true,opacity:.45,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),
  ));
  const pads=new THREE.InstancedMesh(new THREE.BoxGeometry(1.58,.077,.15),
    new THREE.MeshBasicMaterial({color:0xab9b70}),12);
  const mark=new THREE.Object3D();
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    mark.position.set(Math.cos(a)*(radius-2),.01,Math.sin(a)*(radius-2));
    mark.rotation.y=-a;
    mark.updateMatrix();pads.setMatrixAt(i,mark.matrix);
  }
  g.add(pads);
  const rim=g.children[0].material, ticks=pads.material;
  const ash=new THREE.Color(0xbeb691), gold=new THREE.Color(0xffd395);
  const paint=(objective,time)=>{
    const color=objective?.open?(team[objective.owner]??gold):ash;
    rim.color.copy(color);ticks.color.copy(color);
    rim.opacity=objective?.open?.72+.21*Math.sin(time*5):.40;
  };
  return {g,paint};
}

function shadowTexture() {
  const side=32, bits=new Uint8Array(side*side*4);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const r=Math.hypot((x+.5-side*.5)/(side*.5),(y+.5-side*.5)/(side*.5));
    bits[(y*side+x)*4+3]=Math.round(Math.max(0,1-r)**1.5*230);
  }
  const texture=new THREE.DataTexture(bits,side,side,THREE.RGBAFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

function effectPool(scene) {
  const traces=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,5),new THREE.MeshBasicMaterial({toneMapped:false}),22);
  const flashes=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({toneMapped:false}),18);
  const bolts=new THREE.InstancedMesh(new THREE.ConeGeometry(.63,3.9,6).translate(0,-1.2,0),
    new THREE.MeshBasicMaterial({toneMapped:false}),16);
  const ribbons=new THREE.InstancedMesh(new THREE.CylinderGeometry(.083,.26,1,5),
    new THREE.MeshBasicMaterial({toneMapped:false}),16);
  for(const m of [traces,flashes,bolts,ribbons]){
    m.count=0;m.frustumCulled=false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(m);
  }
  const trail=[], sparks=[];
  const a=new THREE.Vector3(), b=new THREE.Vector3(), delta=new THREE.Vector3();
  const object=new THREE.Object3D();
  let lastEvent=0, lastTick=-1;
  function segment(mesh,index,from,to,width,color) {
    delta.subVectors(to,from);
    const length=delta.length();
    object.position.addVectors(from,to).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(up,delta.divideScalar(length||1));
    object.scale.set(width,length,width);
    object.updateMatrix();
    mesh.setMatrixAt(index,object.matrix);
    mesh.setColorAt(index,color);
  }
  function update(state,dt) {
    if(!state || state.tick<lastTick) { lastEvent=0; lastTick=-1; trail.length=0; sparks.length=0; }
    if(state) {
      lastTick = state.tick;
      for(const evt of state.events??[]) {
        if(evt.id<=lastEvent) continue;
        lastEvent=evt.id;
        if(evt.type==='rifle') {
          trail.push({from:evt.from,to:evt.to,slot:evt.owner,t:.17});
          if(evt.hit!==null)sparks.push({at:evt.to,t:.24,dur:.24,scale:1.58});
        }
        if(evt.type==='impact')sparks.push({at:evt.at,t:.32,dur:.32,scale:3.35});
      }
    }
    for(let i=trail.length-1;i>=0;i--)if((trail[i].t-=dt)<=0)trail.splice(i,1);
    for(let i=sparks.length-1;i>=0;i--)if((sparks[i].t-=dt)<=0)sparks.splice(i,1);
    traces.count=Math.min(traces.instanceMatrix.count,trail.length);
    for(let i=0;i<traces.count;i++){
      const p=trail[trail.length-traces.count+i];
      segment(traces,i,a.fromArray(p.from),b.fromArray(p.to),.19*Math.min(1,p.t/.12),team[p.slot]);
    }
    flashes.count=Math.min(flashes.instanceMatrix.count,sparks.length);
    for(let i=0;i<flashes.count;i++){
      const p=sparks[sparks.length-flashes.count+i], pulse=Math.sin(Math.PI*(1-p.t/p.dur))*.73+.27;
      object.position.fromArray(p.at);object.rotation.set(.524,.3,0);object.scale.setScalar(p.scale*pulse);
      object.updateMatrix();flashes.setMatrixAt(i,object.matrix);flashes.setColorAt(i,impactColor);
    }
    const missiles=state?.projectiles??[];
    bolts.count=ribbons.count=Math.min(bolts.instanceMatrix.count,missiles.length);
    for(let i=0;i<bolts.count;i++){
      const p=missiles[i], color=team[p.owner];
      a.set(p.x,p.y,p.z);b.set(p.vx,p.vy,p.vz).normalize();
      object.position.copy(a);object.quaternion.setFromUnitVectors(up,b);object.scale.setScalar(1);
      object.updateMatrix();bolts.setMatrixAt(i,object.matrix);bolts.setColorAt(i,impactColor);
      b.multiplyScalar(-6.2).add(a);segment(ribbons,i,b,a,1,color);
    }
    for(const m of [traces,flashes,bolts,ribbons]){
      if(m.count){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;}
    }
  }
  return {update};
}

export function createArena(canvas) {
  const renderer=new THREE.WebGLRenderer({canvas, antialias:false, powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.04;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(59,1,.65,4100);
  const {time:waterTime,sun}=buildHarbor(scene);
  const relay=relayMarker();scene.add(relay.g);
  const vehicles=[createDuelMech(0),createDuelMech(1)];
  const shadowGe=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2), shadowTex=shadowTexture();
  const shadows=vehicles.map(({root})=>{
    const marker=new THREE.Mesh(shadowGe,new THREE.MeshBasicMaterial({
      map:shadowTex,depthWrite:false,transparent:true,opacity:.77,polygonOffset:true,polygonOffsetFactor:-1,
    }));
    marker.renderOrder=1;scene.add(root,marker);return marker;
  });
  const fx=effectPool(scene);
  const aimPoint={x:.5,y:.5,visible:false};
  const center=new THREE.Vector3(), dir=new THREE.Vector3(), horizontal=new THREE.Vector3(), target=new THREE.Vector3();
  const follow=new THREE.Vector3(), collision=new THREE.Vector3(), tmp=new THREE.Vector3(), cameraRay=new THREE.Ray();
  let worldTime=0, currentWidth=0,currentHeight=0, cameraDistance=0, lastLocal=false;
  function resize() {
    const w=Math.max(1,canvas.clientWidth), h=Math.max(1,canvas.clientHeight);
    if(w===currentWidth&&h===currentHeight)return;
    currentWidth=w;currentHeight=h;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  function setQuality(level) {
    const low=level===0 || level==='low';
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,low?1:1.4));
    renderer.shadowMap.enabled=!low;sun.castShadow=!low;
    currentWidth=0;resize();
  }
  function render(state,slot,dt,cameraInput) {
    resize();
    const players=state?.players??preview;
    const p=state?.players?.[slot];
    worldTime+=dt;waterTime.value=worldTime;
    for(let i=0;i<vehicles.length;i++){
      const pilot=players[i];
      if(!pilot)continue;
      const vehicle=vehicles[i], shadow=shadows[i];
      vehicle.pose(pilot,dt);
      shadow.material.opacity=.83/(1+pilot.y*.062);
      shadow.position.set(pilot.x,.044,pilot.z);
      shadow.scale.set(17+pilot.y*.04,1,13+pilot.y*.045);
    }
    relay.paint(state?.objective,worldTime);
    fx.update(state,dt);

    aimPoint.visible=false;
    if(!p){
      const orbit=Math.sin(worldTime*.1);
      camera.position.set(14+orbit*5,14+orbit,-37-orbit*2);
      camera.lookAt(0,8,5);
    } else {
      const yaw=cameraInput?.yaw??p.yaw,pitch=cameraInput?.pitch??p.pitch;
      const pilot={x:p.x,y:p.y,z:p.z,yaw,pitch};
      const aim=pilotAim(pilot);
      center.set(aim.from.x,aim.from.y,aim.from.z);
      dir.set(aim.dir.x,aim.dir.y,aim.dir.z);
      horizontal.set(Math.sin(yaw),0,Math.cos(yaw));
      follow.copy(center).addScaledVector(up,4.3);
      cameraRay.origin.copy(follow);
      cameraRay.direction.copy(horizontal).negate().addScaledVector(up,.28).normalize();
      let back=27.6;
      for(const box of cover){
        if(cameraRay.intersectBox(box,collision))back=Math.min(back,Math.max(2.4,collision.distanceTo(follow)-1));
      }
      if(!lastLocal||cameraDistance>back)cameraDistance=back;
      else cameraDistance+=(back-cameraDistance)*(1-Math.exp(-dt*7));
      camera.position.copy(follow).addScaledVector(cameraRay.direction,cameraDistance);
      target.copy(center).addScaledVector(dir,88);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const point=aimTarget(pilot,players[1-slot]);
      tmp.set(point.x,point.y,point.z).project(camera);
      aimPoint.x=(1+tmp.x)*.5;aimPoint.y=(1-tmp.y)*.5;
      aimPoint.visible=tmp.z<1&&tmp.z>=-1&&Math.abs(tmp.x)<.95&&Math.abs(tmp.y)<.95;
    }
    lastLocal=!!p;
    renderer.render(scene,camera);
  }
  function dispose() {
    const geometries=new Set(), materials=new Set();
    scene.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      if(o.material)materials.add(o.material);
    });
    for(const geo of geometries)geo.dispose();
    for(const mat of materials){mat.map?.dispose();mat.dispose();}
    sun.shadow.dispose();renderer.dispose();
  }
  setQuality(0);
  return {render,setQuality,resize,dispose,aimPoint};
}
