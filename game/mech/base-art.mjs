import * as THREE from 'three';
import { BASE_OPS } from './base-layout.mjs';

// 保留通行寬度的機體整備基地。所有固定零件加入港口既有的材質批次。
export function buildBase(world,b) {
  const box=(k,x,z,y,w,h,d,rx=0,ry=0,rz=0,tint=0xffffff)=>b.box(k,x,world.height(x,z)+y,z,w,h,d,rx,ry,rz,tint);
  const solid=(x,z,w,d,h)=>world.addCollider({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top:world.height(x,z)+h});
  const cube=(x,z,w,d,h,k='concrete')=>{box(k,x,z,h/2,w,h,d);solid(x,z,w,d,h);};
  const painted=(x,z,y,w,h,d,color)=>box('cargo',x,z,y,w,h,d,0,0,0,color);
  // 圍牆的門洞與兩翼聯絡口維持全寬；內部車道有清楚的轉彎和停機位。
  for(const [x,z,w,d] of [[113,178,211,4],[347,178,143,4],[9,426,4,500],[419,426,4,500],[214,674,412,4],
    [80,465,136,3],[374,465,86,3]]) {
    cube(x,z,w,d,8.2);
    box('trim',x,z,8.4,w+.6,.6,d+.6);
    const horizontal=w>d,len=Math.max(w,d);
    for(let t=-len/2+8;t<len/2;t+=32)box('hull',x+(horizontal?t:0),z+(horizontal?0:t),5.1,horizontal?1.1:w+1.2,10.2,horizontal?d+1.2:1.1);
  }
  for(const [x,z,w,d] of [[249,209,38,245],[242,420,35,439],[211,376,352,40],[211,539,352,42],[229,626,155,45],
    [86,466,30,213],[352,463,30,226]]) {
    const y=world.height(x,z);
    b.box('asphalt',x,y+.07,z,w,.12,d);
    const long=d>w;
    for(const side of [-1,1])b.box('stripe',x+(long?side*(w/2-2):0),y+.15,z+(long?0:side*(d/2-2)),long?.36:w,.05,long?d:.36);
    const len=long?d:w;
    for(let j=-len/2+8;j<len/2;j+=21)b.box('mark',x+(long?0:j),y+.17,z+(long?j:0),long?.34:6,.06,long?6:.34);
  }
  for(const side of [-1,1]){
    const x=247+side*29;cube(x,178,7,10,29,'hull');
    painted(x,178,12,7.5,3.5,10.8,0xd9983b);
    cube(x+side*17,188,16,16,17);
    box('glass',x+side*17,179.8,13,14,4,.45);
  }
  painted(247,178,28,66,6,5.5,0x657c78);
  // 開敞機庫有挑高門、拱折屋面、天窗、檢修架與落地的側牆。
  function hangar(x,z,w,d,h,id) {
    for(const s of [-1,1]){
      cube(x+s*w*.5,z,2.5,d,h,'paint');
      box('cargo',x+s*w*.25,z,h+2,w*.52,1.3,d+3,0,0,-s*.14,0x758b8b);
      for(let dz=-d*.4;dz<d*.45;dz+=14) {
        box('hull',x+s*(w*.5-1.7),z+dz,h*.5,1.1,h,1.6);
        box('glass',x+s*w*.28,z+dz,h+2.9,w*.21,.24,5,0,0,-s*.14);
      }
    }
    cube(x,z+d/2,w,2,h,'hull');
    painted(x,z-d/2,h-2,w,4.2,2.4,id?0x586b65:0x727c88);
    for(const s of [-1,1]){
      painted(x+s*(w*.5-3.8),z-d*.5,6.2,4.4,12,2.3,0xd6ab64);
      box('hull',x+s*w*.27,z,7,3.1,14,3.3);
      box('trim',x+s*w*.27,z,14,6,.6,9);
    }
    box('hull',x,z+6,h-5,w-3,2.2,3);
    box('mark',x+4,z+6,h-9,1.4,7.5,1.2);
  }
  // 建物夾在各出入口之間，掩體背後仍有兩條可穿越的整備走道。
  hangar(158,278,51,66,22,0);hangar(335,279,54,69,22,1);
  hangar(366,433,54,62,18,0);hangar(91,584,62,56,26,1);
  hangar(359,594,55,59,23,0);
  const cylinder=new THREE.CylinderGeometry(1,1,1,12);
  for(const x of [57,92,127]) {
    const z=407,y=world.height(x,z);
    b.add('trim',cylinder,x,y+6,z,8,12,8);
    b.add('hull',cylinder,x,y+12.4,z,8.3,1.1,8.3);
    solid(x,z,15,15,12);
    for(const dx of [-2.7,2.7])box('darkRock',x+dx,z,15.5,1.4,6.4,1.4);
  }
  cube(78,402,28,6,14,'paint');
  cube(226,663,63,17,29,'paint');
  box('hull',226,662,36,31,14,17);
  box('glass',226,652.8,38,36,6,2.8);
  box('trim',226,662,42,40,1.5,24);
  box('hull',221,662,51,.8,19,.8);
  box('stripe',221,662,54,9,.55,1);
  for(const [x,z] of [[154,344],[298,346],[173,504],[300,516],[35,249],[399,497]]) {
    cube(x,z,22,12,6.5);
    painted(x,z,7,23,1.1,13,0x61756f);
    box('glass',x,z-6.25,4,12,1.5,.4);
    for(const dx of [-9,9])box('mark',x+dx,z-6.3,2.4,.55,4.8,.4);
  }
  // 整備中的機體與懸吊夾具共用場景材質，沒有骨架或 AI。
  for(const [x,z] of [[156,287],[334,288],[90,592],[358,605]]){
    for(const side of [-1,1]){
      const dx=side*3.5;
      box('hull',x+dx,z,4,2.8,8,3.8,0,0,side*.08);
      box('paint',x+dx,z,8.4,3,5,3.4,0,0,-side*.12);
      box('hull',x+dx*1.7,z,12.3,2.5,6,2.8,0,0,side*.12);
    }
    painted(x,z,13.3,9.5,6,5.5,0x738078);box('hull',x,z,18,3.4,3.4,3.1);
    box('trim',x,z-1.7,18,2.1,.4,.23);
  }
  cylinder.dispose();
}

export function bayDoors(world,root,material) {
  const bays=BASE_OPS.filter(op=>op.bay);
  const geometry=new THREE.BoxGeometry();
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(1),3));
  const mesh=new THREE.InstancedMesh(geometry,material,bays.length*4);
  mesh.userData.fieldGeometry=true;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  const m=new THREE.Matrix4(), color=new THREE.Color();
  const doors=bays.map(({id,bay},i)=>{
    const [x,z]=bay.door,y=world.height(x,z);
    const collider={x0:x-bay.width/2,x1:x+bay.width/2,z0:z-1,z1:z+1,top:0};
    world.addCollider(collider);
    for(let j=0;j<4;j++)mesh.setColorAt(i*4+j,color.setHex([0x879a98,0x546867,0xdeaa57,0x6b7a79][j]));
    return {id,x,z,y,bay,collider,i,open:0,want:0};
  });
  const pose=d=>{
    const {i,x,y,z,bay,open}=d;
    const remaining=1-open,H=bay.height;
    const parts=[[H*remaining+.14,y+H*(1-remaining*.5),z],
      [.5,y+H*open+.24,z-1.07],[.65*remaining+.01,y+H*(.25+.75*open),z-1.09],
      [.35*remaining+.01,y+H*(.75+.25*open),z-1.09]];
    parts.forEach(([h,cy,cz],j)=>mesh.setMatrixAt(i*4+j,m.makeScale(bay.width,h,j?.16:2).setPosition(x,cy,cz)));
    d.collider.top=remaining>.27?y+H:-1000;
    mesh.instanceMatrix.needsUpdate=true;
  };
  doors.forEach(pose);mesh.computeBoundingSphere();
  return {
    reset(captured){for(const d of doors){d.open=d.want=Number(captured.includes(d.id));pose(d);}},
    open(id){const d=doors.find(d=>d.id===id);if(d)d.want=1;},
    tick(dt){for(const d of doors)if(d.open<d.want){d.open=Math.min(d.want,d.open+dt*.72);pose(d);}},
  };
}
