import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// All four buses share one geometry and draw call. They follow cleared streets at their own speed.
export function createConvoy(root,route){
  const cube=new THREE.BoxGeometry(),wheel=new THREE.CylinderGeometry(.53,.53,.26,12).rotateX(Math.PI/2);
  const parts=[],color=new THREE.Color(),body=0xd4ceba,trim=0x9a4c43,glass=0x354954;
  function part(g,x,y,z,w,h,d,tint){
    const copy=g.clone().scale(w,h,d).translate(x,y,z),colors=new Float32Array(copy.attributes.position.count*3);
    color.setHex(tint);for(let i=0;i<colors.length;i+=3)color.toArray(colors,i);
    copy.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(copy);
  }
  const box=(...args)=>part(cube,...args);
  box(0,1.16,0,10.9,1.38,2.45,body);box(0,2.27,0,10.6,1.18,2.43,glass);
  box(0,2.99,0,10.81,.29,2.51,body);box(-1,3.23,0,3.6,.34,1.65,0x9d9e94);
  for(const side of [-1,1]){
    box(0,1.48,side*1.23,10.73,.25,.05,trim);
    for(const x of [-4.8,-3.35,-1.9,-.45,1,2.45,3.9,5.03])box(x,2.26,side*1.218,.11,1.2,.075,body);
    for(const x of [-3.23,3.3])part(wheel,x,.57,side*1.20,1,1,1,0x313738);
    box(5.46,1.16,side*.89,.10,.20,.44,0xe6ddaf);
  }
  box(5.39,2.76,0,.13,.29,1.7,0x303b3b);
  const g=mergeGeometries(parts),material=new THREE.MeshStandardMaterial({roughness:.47,metalness:.18,vertexColors:true});
  for(const p of parts)p.dispose();cube.dispose();wheel.dispose();
  const fleet=new THREE.InstancedMesh(g,material,4);
  fleet.name='末班車隊';fleet.castShadow=fleet.receiveShadow=true;fleet.frustumCulled=false;
  fleet.userData.fieldGeometry=fleet.userData.fieldMaterial=true;root.add(fleet);
  const pose=new THREE.Object3D(),pts=route.pts,dist=[0];
  for(let i=1;i<pts.length;i++)dist.push(dist[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  // Miter the left-lane offset once per corner, so all four buses stay in lane through a turn.
  const lane=pts.map((b,k)=>{
    const a=pts[Math.max(0,k-1)],c=pts[Math.min(pts.length-1,k+1)];
    const l=k?dist[k]-dist[k-1]:dist[1],r=k+1<pts.length?dist[k+1]-dist[k]:l;
    const ux=(k?b[0]-a[0]:c[0]-b[0])/l,uz=(k?b[1]-a[1]:c[1]-b[1])/l;
    const vx=k+1<pts.length?(c[0]-b[0])/r:ux,vz=k+1<pts.length?(c[1]-b[1])/r:uz;
    const m=6/(1+ux*vx+uz*vz);
    return [b[0]+(uz+vz)*m,b[1]-(ux+vx)*m];
  });
  let traveled=0;
  function target(sec){return sec>0?dist[route.secs[Math.min(sec,route.secs.length)-1].at]:0;}
  function draw(){
    for(let bus=0;bus<fleet.count;bus++){
      const s=traveled-17*bus-12;
      let i=1;while(i<pts.length-1 && s>dist[i])i++;
      const [x,z]=lane[i-1],dx=lane[i][0]-x,dz=lane[i][1]-z,t=(s-dist[i-1])/(dist[i]-dist[i-1]);
      pose.position.set(x+dx*t,.17,z+dz*t);
      pose.rotation.y=-Math.atan2(dz,dx);pose.updateMatrix();fleet.setMatrixAt(bus,pose.matrix);
    }
    fleet.instanceMatrix.needsUpdate=true;
  }
  draw();
  return {reset(sec){traveled=target(sec);draw();},update(dt,sec,done){
    const remaining=target(done?route.secs.length:sec)-traveled;
    if(remaining<=.01)return;
    traveled+=Math.min(remaining,dt*Math.min(18,2.5+remaining*.7));draw();
  }};
}
