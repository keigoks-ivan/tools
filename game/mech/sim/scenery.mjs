import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createExercise} from './missions.mjs';

import {HEIGHT,DECK} from './campaign.mjs';
const teal=0x54dfe0, amber=0xffaf56, violet=0xa989f3, steel=0x536673, shell=0x243541;
const cube=new THREE.BoxGeometry(),round=new THREE.CylinderGeometry(.5,.5,1,12);
const gate=new THREE.TorusGeometry(17,.7,6,64);
// One indexed batch per moving assembly. Repeated fixtures carry colour in their vertices.
function batch(root,name){
  const parts=[[],[]],pose=new THREE.Object3D(),color=new THREE.Color();
  function add(g,x,y,z,w,h,d,tint,lit=false,rx=0,ry=0,rz=0){
    pose.position.set(x,y,z);pose.rotation.set(rx,ry,rz);pose.scale.set(w,h,d);pose.updateMatrix();
    const copy=g.clone().applyMatrix4(pose.matrix);
    const attr=new Float32Array(copy.attributes.position.count*3);color.setHex(tint);
    for(let i=0;i<attr.length;i+=3)color.toArray(attr,i);
    copy.setAttribute('color',new THREE.BufferAttribute(attr,3));parts[+lit].push(copy);
  }
  return {add,box:(...args)=>add(cube,...args),finish(){
    for(let i=0;i<2;i++){
      if(!parts[i].length)continue;
      const geo=mergeGeometries(parts[i]);for(const p of parts[i])p.dispose();
      const m=new THREE.Mesh(geo,i?new THREE.MeshBasicMaterial({vertexColors:true}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:.59,metalness:.28}));
      m.name=name;m.receiveShadow=!i;m.castShadow=!i;m.userData.fieldGeometry=m.userData.fieldMaterial=true;root.add(m);
    }
  }};
}
function sky(root,district){
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{tint:{value:new THREE.Color(district==='fold'?0x47536e:district==='echo'?0x514064:0x32505d)}},
    vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 p;uniform vec3 tint;void main(){vec3 n=normalize(p);float band=pow(1.-abs(n.y),4.);gl_FragColor=vec4(mix(tint*.11,tint*1.5,band),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
  const m=new THREE.Mesh(new THREE.SphereGeometry(2200,24,12),material);m.renderOrder=-2;
  m.userData.fieldGeometry=m.userData.fieldMaterial=true;root.add(m);
}
const block=(x,z,w,d,top,bottom=0)=>({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top,bottom});
function fold(root,site){
  const pair=new THREE.Group();root.add(pair);site.city=pair;
  for(const ceiling of [false,true]){
    const layer=new THREE.Group();pair.add(layer);
    if(ceiling){layer.rotation.z=Math.PI;layer.position.y=HEIGHT;}
    const p=batch(layer,ceiling?'琥珀上城':'青色下城'),accent=ceiling?amber:teal;
    p.box(0,-1,0,1240,2,1330,ceiling?0x484650:0x334652);
    for(let i=-4;i<=4;i++)for(let j=-5;j<=5;j++){
      const x=i*116,z=j*104;
      if(i===0){p.box(0,.05,z,1.1,.1,53,accent,true);continue;}
      const h=21+((Math.abs(i)*13+(j+13)*19)%37),w=38+(Math.abs(i)*9+j+5)%14,d=53;
      p.box(x,h/2,z,w,h,d,ceiling?0x64545a:0x475760);
      p.box(x,h+1,z,w+2,2,d+2,steel);p.box(x+3,h+3.1,z+3,w*.52,3,d*.62,shell);
      for(let level=4;level<h;level+=6.3){
        p.box(x,level,z,w+.28,2.0,d+.28,0x202d38);
        for(const s of [-1,1])p.box(x+s*w*.502,level+.6,z+5,.3,.65,d*.54,accent,true);
      }
      // Both layers have identical footprints in the player's current gravity frame.
      if(!ceiling){
        site.boxes.push(block(x,z,w+2,d+2,h+2),block(x,z,w+2,d+2,HEIGHT,HEIGHT-h-2));
      }
    }
    for(const z of [-96,195,314]){
      for(const side of [-1,1]){
        p.box(side*34,12,z,4,24,7,steel);p.box(side*34,14,z-3.6,1,17,.32,accent,true);
      }
      if(ceiling===(z===-96))p.add(gate,0,HEIGHT/2,z,1.13,1.13,1,accent,true);
      p.box(0,.12,z,30,.15,4,accent,true);
    }
    p.finish();
  }
  site.setLayer=upper=>{pair.position.y=upper?HEIGHT:0;pair.rotation.z=upper?Math.PI:0;};
}
function echo(root,site){
  const p=batch(root,'殘響雙翼'),floor=0x293441;
  p.box(0,-1.2,25,430,2.4,690,floor);
  // A central spine splits the two approach lanes but leaves the entrance and exit connected.
  for(const z of [-76,-24,28,80]){
    p.box(0,9,z,17,18,49,shell);site.boxes.push(block(0,z,17,49,18));
    p.box(0,18.8,z,19,1.6,49,steel);
    for(const side of [-1,1]){
      p.box(side*8.55,10,z,.2,8,42,0x151f30);
      for(let k=-18;k<=18;k+=6)p.box(side*8.75,12,z+k,.4,2.7,.7,side<0?teal:violet,true);
    }
  }
  for(const z of [-140,132,260]){
    p.box(0,47,z,312,4,9,shell);
    for(const s of [-1,1]){
      p.box(s*77,44.7,z,133,.5,3,s<0?teal:violet,true);
      p.box(s*144,37,z,3,24,7,steel,false,0,0,-s*.69);
    }
  }
  for(const side of [-1,1]){
    const x=side*88,col=side<0?teal:violet;
    for(let z=-160;z<0;z+=21)p.box(x*(z+200)/200,.12,z,3,.2,7,col,true);
    for(let i=0;i<10;i++){
      const z=-205+i*53,px=side*156;
      p.box(px,18,z,7,36,8,shell);p.box(px-side*10,34,z,25,4,8,steel);
      p.box(px-side*3.65,17,z,.5,26,3.6,col,true);
      p.box(x,.1,z,2,.12,27,col,true);
      if(i===5||i===7){p.box(x+side*32,4,z,17,8,15,steel);site.boxes.push(block(x+side*32,z,17,15,8));}
    }
    for(let i=0;i<4;i++){
      const z=-116+i*89;
      p.box(side*180,26,z,17,52,73,0x505566);p.box(side*170,24,z,.8,23,51,0x282c3e);
    }
    p.add(round,x,.48,158,32,.96,32,col,true);
    p.add(round,x,1,158,26,.3,26,0x3e4a55);
    const pod=new THREE.Group();pod.position.set(x,0,186);root.add(pod);
    const cell=batch(pod,'受困友機・識別燈');
    cell.box(0,5,0,5,6,3,0x98aab2);cell.box(0,9,0,2.9,2.6,2.5,0xb8c8c9);
    for(const s of [-1,1]){cell.box(s*1.8,1.9,0,2.25,3.8,2.5,steel);cell.box(s*3.6,5.4,0,1.8,5,2.2,steel);}
    cell.box(0,9.2,-1.33,2,.42,.15,col,true);cell.finish();
    const prison=new THREE.Group();pod.add(prison);const bars=batch(prison,'救援艙');
    for(let i=0;i<8;i++){const a=i*Math.PI/4;bars.box(7*Math.cos(a),7,7*Math.sin(a),.35,14,.35,col,true);}
    bars.add(gate,0,14,0,.42,.42,.42,col,true,Math.PI/2);bars.finish();
    (site.cells??=[]).push(prison);
  }
  p.finish();
}
const carCenters=[-174,-116,-58,0,58,116,174,232];
export function trainPose(lane,time){
  return {x:lane*(45+15*Math.sin(time*.19)),z:lane*64*Math.sin(time*.135+.42)};
}
function rail(root,site){
  const bed=batch(root,'雨線高架橋');
  for(const x of [-125,125]){
    bed.box(x,3,0,11,6,1460,steel);bed.box(x,6,0,1,.35,1460,teal,true);
  }
  bed.box(0,-1.1,0,1600,2,1600,0x21343d);bed.finish();
  const sleepers=new THREE.Group();root.add(sleepers);
  const tunnel=batch(sleepers,'掠過的門架');
  for(let z=-840;z<920;z+=72){
    for(const x of [-118,118]){
      tunnel.box(x,35,z,3,70,4,steel);tunnel.box(x*.88,71,z,32,3.4,4,steel);
      tunnel.box(x*.85,69,z,11,.7,2,amber,true);
    }
    tunnel.box(0,2,z,234,1.2,3.4,0x637480);
  }
  tunnel.finish();
  const rainPos=[];let seed=173;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<820;i++){const x=(rand()-.5)*460,y=5+rand()*120,z=(rand()-.5)*920;rainPos.push(x,y,z,x+.45,y-2.8,z-1.9);}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rainPos,3));
  const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0x8299aa,transparent:true,opacity:.28,depthWrite:false}));
  rain.userData.fieldGeometry=rain.userData.fieldMaterial=true;root.add(rain);
  site.trains=[];
  for(const lane of [-1,0,1]){
    const train=new THREE.Group();root.add(train);const p=batch(train,'磁浮裝甲列車'),boxes=[];
    const accent=[amber,teal,violet][lane+1];
    for(const z of carCenters){
      p.box(0,DECK-6,z,20,12,54,shell);
      p.box(0,DECK-.7,z,21,1.4,54,steel);p.box(0,DECK-9,z,18,5,51,0x212c33);
      for(const s of [-1,1]){
        p.box(s*10.06,DECK-4.8,z,.2,3.8,44,0x14232c);
        p.box(s*10.12,DECK-6.9,z,.22,.42,48,accent,true);
        for(let j=-19;j<=20;j+=6)p.box(s*10.17,DECK-4.8,z+j,.28,3.8,.32,steel);
        p.box(s*8.4,DECK+.06,z,.28,.12,46,accent,true);
      }
      for(const offset of [-15,13])p.box(0,DECK+.09,z+offset,7.6,.18,4.2,0x30434b);
      const b=block(0,z,21,54,DECK,DECK-12);site.boxes.push(b);boxes.push(b);
    }
    p.box(0,DECK-4,262,18,6,7,steel);p.box(0,DECK-4,265.7,13,1.2,.35,accent,true);
    p.finish();site.trains.push({lane,train,boxes});
  }
  site.moveTrains=time=>{
    for(const {lane,train,boxes} of site.trains){
      const {x,z}=trainPose(lane,time);train.position.set(x,0,z);
      for(let i=0;i<boxes.length;i++){const b=boxes[i];b.x0=x-10.5;b.x1=x+10.5;b.z0=z+carCenters[i]-27;b.z1=b.z0+54;}
    }
    sleepers.position.z=-(time*78%72);rain.position.set(0,-(time*15%12),-(time*46%19));
  };
  site.deckAt=(x,z)=>site.trains.find(t=>t.boxes.some(b=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1));
  site.moveTrains(0);
}
export function buildExercise(world,root){
  const id=world.fieldRoute.district;
  const site={boxes:[],create:(combat,enc)=>createExercise(id,site,combat,enc)};
  sky(root,id);
  if(id==='fold')fold(root,site);else if(id==='echo')echo(root,site);else rail(root,site);
  if(id!=='rail'){for(const box of site.boxes)world.addCollider(box);site.boxes.length=0;}
  return site;
}
