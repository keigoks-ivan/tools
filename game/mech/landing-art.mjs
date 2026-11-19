import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDING, SHORE_GLSL } from './landing-layout.mjs?v=1';

function material(world, color, roughness, metalness, surface, vertexColors = false) {
  const A = world.A;
  const stone = surface === 'concrete' || surface === 'precast';
  const map = stone ? A?.rubD : surface === 'asphalt' ? A?.asphD : null;
  const normalMap = stone ? A?.rubN : surface === 'asphalt' ? A?.asphN : surface === 'paint' ? A?.wearN : null;
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, map, normalMap, vertexColors, normalScale: new THREE.Vector2(.18,.18) });
  if(surface==='precast' && map) {
    mat.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        vec3 aggregate=texture2D(map,vMapUv).rgb;
        diffuseColor.rgb*=mix(vec3(.72),aggregate,.36);
      `);
    };
  }
  return mat;
}

class PropBatch {
  constructor(materials) {
    this.materials = materials;
    this.parts = new Map();
    this.cube = new THREE.BoxGeometry();
    this.plane = new THREE.PlaneGeometry(1,1,8,2).rotateX(-Math.PI/2);
    this.matrix = new THREE.Matrix4();
    this.origin = new THREE.Vector3();
    this.size = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.quat = new THREE.Quaternion();
    this.color = new THREE.Color();
  }
  add(key, geometry, x,y,z, w=1,h=1,d=1, rx=0,ry=0,rz=0, tint=0xffffff) {
    this.matrix.compose(this.origin.set(x,y,z),this.quat.setFromEuler(this.rotation.set(rx,ry,rz)),this.size.set(w,h,d));
    const mesh = geometry.clone().applyMatrix4(this.matrix);
    this.collect(key,mesh,tint);
  }
  collect(key, mesh, tint) {
    const p = mesh.attributes.position, n = mesh.attributes.normal, uv = mesh.attributes.uv;
    const colors = this.materials[key].vertexColors ? new Float32Array(p.count*3) : null;
    this.color.setHex(tint);
    for (let i=0; i<p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(n.getY(i))>.7) uv.setXY(i,x/4.2,z/4.2);
      else if (Math.abs(n.getX(i))>.7) uv.setXY(i,z/4.2,y/4.2);
      else uv.setXY(i,x/4.2,y/4.2);
      if(colors)this.color.toArray(colors,i*3);
    }
    if(colors)mesh.setAttribute('color',new THREE.BufferAttribute(colors,3));
    if (!this.parts.has(key)) this.parts.set(key,[]);
    this.parts.get(key).push(mesh);
  }
  box(key,...args) { this.add(key,this.cube,...args); }
  ground(world,key,x,z,w,d,lift) {
    const mesh=this.plane.clone().scale(w,1,d).translate(x,0,z);
    const p=mesh.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,world.height(p.getX(i),p.getZ(i))+lift);
    mesh.computeVertexNormals();
    this.collect(key,mesh,0xffffff);
  }
  finish(root) {
    for (const [key, geometries] of this.parts) {
      const g=mergeGeometries(geometries);
      geometries.forEach(o=>o.dispose());
      const m=new THREE.Mesh(g,this.materials[key]);
      m.name=key; m.castShadow=key!=='asphalt'&&key!=='mark'&&key!=='stripe';m.receiveShadow=true;
      m.userData.fieldGeometry=true;root.add(m);
    }
    this.cube.dispose();
    this.plane.dispose();
    this.parts.clear();
  }
}

function shoreWater() {
  const mat=new THREE.MeshStandardMaterial({color:0x315965,roughness:.24,metalness:0});
  const time={value:0},bow={value:LANDING.departure},moving={value:0};
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{tideTime:time,tideBow:bow,tideMoving:moving});
    const shore=SHORE_GLSL.replaceAll('Z','p.y');
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform float tideTime; varying vec2 vLandingSea;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vLandingSea=(modelMatrix*vec4(transformed,1.0)).xz;
        vec2 p=vLandingSea;
        float distanceToSand=p.x-${shore};
        float swell=1.0-smoothstep(-60.0,0.0,distanceToSand);
        transformed.y+=swell*(sin(dot(p,vec2(.088,.035))-tideTime*1.6)*.38+sin(dot(p,vec2(.15,-.05))-tideTime*2.25)*.15);`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>',`#include <common>
        uniform float tideTime,tideBow,tideMoving;
        varying vec2 vLandingSea;
        float seaDetail(vec2 p){return sin(p.x*1.43+sin(p.y*.73))*cos(p.y*1.07+sin(p.x*.86));}
      `)
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec2 p=vLandingSea;
        float edge=p.x-${shore};
        float runup=sin(tideTime*1.45+p.y*.05)*.91+sin(tideTime*2.2+p.y*.176)*.27;
        float shoreLine=edge-runup+seaDetail(p*vec2(.58,.24))*.36;
        if(shoreLine>1.05) discard;
        float curl=edge+tideTime*2.75+sin(p.y*.051)*2.9+sin(p.y*.18)*.45;
        float breakLine=abs(fract(curl/11.0)-.48)*11.0;
        float width=max(.15,fwidth(curl));
        float foamLace=seaDetail(vec2(p.x*.88-tideTime*.43,p.y*.31))*.66+
          seaDetail(p*vec2(1.73,.74)+tideTime*.26)*.34;
        float streak=smoothstep(-.36,.51,foamLace);
        float wash=(1.0-smoothstep(.08,.72+width,abs(shoreLine)))*(.23+.53*streak);
        float breaker=(1.0-smoothstep(.15,.88+width,breakLine))*
          smoothstep(-33.0,-9.0,edge)*(1.0-smoothstep(-4.5,-.2,edge));
        float behind=tideBow-65.0-p.x;
        float wakeDist=abs(abs(p.y)-18.0-max(0.0,behind)*.19);
        float wake=smoothstep(0.0,5.0,behind)*(1.0-smoothstep(55.0,185.0,behind))*(1.0-smoothstep(1.4,9.0,wakeDist));
        float bowWash=(1.0-smoothstep(5.0,27.0,length(vec2(p.x-tideBow,p.y*.84))))*tideMoving*.48;
        float foam=clamp(wash+(breaker*.78+wake*tideMoving*.61+bowWash)*streak,0.0,.84);
        float bank=smoothstep(-35.0,0.0,edge);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.10,.177,.149),bank*.66);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.59,.65,.61),foam);
      `)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float p1=dot(p,vec2(.088,.035))-tideTime*1.6;
        float p2=dot(p,vec2(.15,-.05))-tideTime*2.25;
        vec2 gradient=vec2(.088,.035)*cos(p1)*.45+vec2(.15,-.05)*cos(p2)*.17;
        float fineWaves=1.0-smoothstep(.4,1.9,fwidth(curl));
        gradient+=vec2(.65,.79)*cos(dot(p,vec2(.65,.79))+tideTime*2.5)*.027*fineWaves;
        gradient+=vec2(-1.55,.83)*cos(dot(p,vec2(-1.55,.83))-tideTime*2.1)*.012*fineWaves;
        normal=normalize(mat3(viewMatrix)*vec3(-gradient.x,1.0,-gradient.y));`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.23,.52,foam);');
  };
  mat.customProgramCacheKey=()=> 'landing-outer-bay-v2';
  const geometry=new THREE.PlaneGeometry(1,1,67,69).rotateX(-Math.PI/2);
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const u=positions.getX(i)+.5, v=positions.getZ(i)*2;
    positions.setXYZ(i,-304-4695*(1-u)**2.18,0,Math.sign(v)*3250*Math.abs(v)**1.74);
  }
  geometry.computeBoundingSphere();
  const water=new THREE.Mesh(geometry,mat);
  water.name='神戶外港・近岸碎浪';water.receiveShadow=true;
  water.userData.fieldGeometry=true;water.userData.noAO=true;
  return {water,time,bow,moving};
}

function sign(world, root) {
  if(typeof document==='undefined')return;
  const c=document.createElement('canvas');c.width=512;c.height=112;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#244653';ctx.fillRect(0,0,512,112);
  ctx.strokeStyle='#9dafad';ctx.lineWidth=3;ctx.strokeRect(6,6,500,100);
  ctx.textAlign='center';ctx.fillStyle='#f0f2ed';ctx.font='bold 42px sans-serif';
  ctx.fillText('神戸外港',256,55);ctx.font='bold 18px sans-serif';ctx.fillText('KOBE OUTER HARBOR',256,88);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(35,7.66),new THREE.MeshStandardMaterial({map,roughness:.61}));
  m.position.set(180,20,0);m.rotation.y=-Math.PI/2;m.userData.fieldGeometry=true;root.add(m);
  return map;
}

function portArchitecture(world, root, materials) {
  const b=new PropBatch(materials);
  const collar=new THREE.CylinderGeometry(.65,1,1.55,8);
  const tetra=new THREE.CylinderGeometry(.5,1,1.25,6);
  const tower=new THREE.CylinderGeometry(.80,.91,1,14);
  const pebble=new THREE.SphereGeometry(1,6,3);
  const barrier=new THREE.BoxGeometry();
  const corners=barrier.attributes.position;
  for(let i=0;i<corners.count;i++)if(corners.getY(i)>0)corners.setXYZ(i,corners.getX(i)*.91,.5,corners.getZ(i)*.81);
  barrier.computeVertexNormals();
  const fix=(x,z,wide,deep,h)=>world.addCollider({x0:x-wide/2,x1:x+wide/2,z0:z-deep/2,z1:z+deep/2,top:world.height(x,z)+h});
  // 長海堤、兩處施工通道、朝海一側排列的消波塊。
  for(const [z,length] of [[-323,474],[0,83],[327,473]]) {
    const x=LANDING.seawall,y=world.height(x,z);
    b.box('concrete',x,y+8,z,22,16,length);
    b.box('concrete',x-11.4,y+1.95,z,12,4,length);
    b.box('concrete',x-11.3,y+4.65,z,10.2,2,length,0,0,.31);
    b.box('trim',x,y+16.2,z,22.5,.36,length);
    b.box('hull',x-10.96,y+9.3,z,.13,.55,length);
    for(let q=z-length/2+4;q<z+length/2-2;q+=12.4) {
      b.box('hull',x-11.09,y+7.0,q,.20,14,.18);
      if(Math.round(q)%3!==0)b.box('trim',x-11.16,y+7.3,q+5.7,.22,.36,10.9);
    }
    for(let q=z-length/2+3,i=0;q<z+length/2-1;q+=9.2,i++){
      const p=x-24+(i%3)*2;
      const h=2.45+Math.sin(i*2.17)*.46;
      b.add(i%5===0?'darkRock':'concrete',tetra,p,y+h*.72,q,3.2,h,3.1,.15,i*.54,1.18);
      b.add('concrete',tetra,p+3.6,y+2.6,q+2.4,2.8,h,2.5,1.21,i*.44,.2);
      b.add('darkRock',tetra,p-1.5,y+1.9,q-2.3,2.55,h*.83,3,1.56,1.39+i,.48);
    }
    fix(x,z,23,length,16.4);
    fix(x-17,z,12,length,5.2);
  }
  for(const z of [LANDING.northGap,LANDING.southGap]) {
    const x=LANDING.seawall,y=world.height(x,z);
    b.ground(world,'asphalt',x,z,83,24.5,.065);
    b.ground(world,'stripe',x,z-10,83,.25,.093);
    b.ground(world,'stripe',x,z+10,83,.25,.093);
    for(let i=0;i<10;i++)b.ground(world,'mark',x-36+i*7.8,z,4,.22,.093);
    for(const iz of [-12.4,12.4]){
      b.box('trim',x+2,y+.45,z+iz,17.5,.85,.7);
      for(const ix of [-9,10])b.add('darkRock',collar,x+ix,y+.88,z+iz,1,.95,1);
    }
  }

  // 濕灘上的斷堤、繫船柱與淺退水溝；每處大掩體都有對應碰撞。
  for(const [x,z,w,d,h] of [
    [-291,-42,18,8,3.8],[-294,39,17,9,3.1],[-252,-35,13,12,4.15],[-247,47,21,7,4.35],
    [-214,-79,16,13,7.1],[-193,70,16,13,6.8],[-174,-29,12,10,4.2],[-155,27,16,9,4.5],
    [33,-41,16,24,8.2],[38,46,16,15,7.8],[106,62,19,24,9.4],[114,-60,17,26,8.6],
    [201,72,19,27,10.2],[221,-61,16,21,9.6],[319,34,18,25,8.5],
  ]){
    const y=world.height(x,z);
    if(x<0)b.add('concrete',barrier,x,y+h/2,z,w,h,d);
    else{
      b.box('concrete',x,y+h/2,z,w,h,d);
      b.box('concrete',x,y+h,z,w+.3,.36,d+.38);
    }
    b.box('darkRock',x-w/2-.05,y+.45,z,.14,.85,d);
    if(x>0){
      b.box('hull',x-w/2-.1,y+h*.46,z,.26,h*.72,d*.76);
      b.box('cargo',x-w/2-.25,y+h*.46,z,.18,h*.61,d*.68,0,0,0,0x73827d);
      for(let dy=1.8;dy<h*.71;dy+=.85)b.box('hull',x-w/2-.36,y+dy,z,.15,.12,d*.70);
      for(const side of [-1,1])b.box('trim',x-w/2-.36,y+h*.46,z+side*d*.36,.15,h*.73,.24);
      b.box('paint',x-w*.24,y+h+.49,z+d*.16,w*.20,.81,d*.35);
      b.box('darkRock',x-w*.24,y+h+.91,z+d*.16,w*.16,.13,d*.24);
    }
    fix(x,z,w,d,h+.18);
  }
  for(const [x,z] of [[-300,-22],[-301,20],[-263,-60],[-262,65],[-165,79],[-151,-85],[64,-102],[85,104]]) {
    const y=world.height(x,z);
    b.add('darkRock',collar,x,y+1.0,z,1.8,1.22,1.8);
    b.add('trim',collar,x,y+.67,z,2.4,.46,2.4);
  }
  for(let i=0;i<84;i++){
    const z=-229+i*5.42,x=-286+Math.sin(i*4.31)*18+Math.sin(i*.74)*5;
    const size=.26+Math.abs(Math.sin(i*14.77))*.77;
    b.add(i%5===0?'concrete':'darkRock',pebble,x,world.height(x,z)+size*.24,z,size,.56*size,size*.77,.2,i*1.5,.7);
  }

  // 港區泊橋、冷鏈倉庫、繫船樁與岸橋。保留兩條可走的貨櫃走廊。
  for(const [x,z,length,width] of [[139,0,258,31],[107,88,204,23],[166,-91,192,23]]) {
    b.ground(world,'asphalt',x,z,length,width,.065);
    for(const side of [-1,1])b.ground(world,'stripe',x,z+side*(width*.5-1.15),length,.23,.095);
    for(let dx=-length/2+12;dx<length/2-7;dx+=17)b.ground(world,'mark',x+dx,z,7,.27,.095);
  }
  b.ground(world,'asphalt',249,4,137,61,.04);
  for(const z of [-24,32]){
    b.ground(world,'stripe',252,z,128,.23,.096);
    for(let x=196;x<=312;x+=14)b.ground(world,'stripe',x,z+Math.sign(z)*2, .23,4,.096);
  }
  for(const [x,z,k] of [
    [76,-125,0x516f7e],[109,-125,0x9a5a47],[142,-125,0x8a8d78],[180,-130,0x496c61],[213,-130,0x9b9c93],
    [70,125,0x9b7860],[104,125,0x496c61],[146,125,0x647887],[196,123,0x9a5a47],[236,123,0x9b9c93],[276,113,0x986835],[313,118,0x4d6971],
    [153,-54,0x596f79],[171,47,0x9c634e],[295,-45,0x768479],
  ]){
    const y=world.height(x,z), stacked=x%3===0;
    for(let level=0;level<(stacked?2:1);level++){
      const cy=y+3.4+level*6.8;
      b.box('cargo',x,cy,z,26,6.8,7.5,0,0,0,k);
      for(const dz of [-3.83,3.83]){
        for(let dx=-11.2;dx<12;dx+=1.86)b.box('cargo',x+dx,cy,z+dz,.32,6.25,.32,0,0,0,k);
        b.box('hull',x,cy-3.14,z+dz,26.1,.23,.29);
        b.box('cargo',x,cy+3.12,z+dz,26.1,.24,.29,0,0,0,k);
        for(const dx of [-12.8,12.8])b.box('hull',x+dx,cy,z+dz,.29,6.8,.32);
      }
      b.box('hull',x-13.025,cy,z,.11,6.1,6.92);
      for(const dz of [-1.73,1.73]){
        b.box('cargo',x-13.11,cy,z+dz,.18,5.86,3.28,0,0,0,k);
        const bar=z+dz*.57;
        b.box('trim',x-13.25,cy,bar,.14,5.72,.17);
        b.box('trim',x-13.27,cy-.85,bar+Math.sign(dz)*.37,.15,.14,.84);
      }
    }
    fix(x,z,26,7.5,stacked?13.6:6.8);
  }
  for(const [x,z,w,d,h] of [[336,-125,54,37,23],[350,106,53,43,20],[411,-23,72,48,29],[415,86,68,35,17]]) {
    const y=world.height(x,z);
    const front=x-w*.5, slope=.09, eave=y+h;
    b.box('cargo',x,y+h*.5,z,w,h,d,0,0,0,x%2?0xa4aba5:0x889e9f);
    b.box('concrete',x,y+1.35,z,w+.18,2.7,d+.18);
    for(const side of [-1,1]){
      b.box('hull',x,eave+d*slope*.25,z+side*d*.25,w+2.3,.44,d*.51+1.1,side*slope);
      b.box('trim',x,eave-.16,z+side*(d*.5+.45),w+2.1,.57,.42);
    }
    for(let dz=-d/2+3;dz<d/2-1;dz+=4.8){
      b.box('paint',front-.09,y+h*.53,z+dz,.18,h*.85,.16);
      b.box('glass',front-.17,y+h-3.2,z+dz+2,.28,2.8,3.4);
      b.box('trim',front-.31,y+h-4.65,z+dz+2,.31,.17,3.7);
    }
    for(const dz of [-d*.23,d*.24]){
      const wDoor=d*.23;
      b.box('hull',front-.2,y+4.4,z+dz,.37,8.8,wDoor+.56);
      b.box('cargo',front-.44,y+4.35,z+dz,.21,8.35,wDoor,0,0,0,0x718285);
      for(let dy=.9;dy<8.2;dy+=.85)b.box('hull',front-.58,y+dy,z+dz,.13,.10,wDoor);
      b.box('trim',front-1.18,y+9.0,z+dz,2.55,.25,wDoor+1.2);
    }
    b.box('trim',x-2,eave+2.1,z-7,w*.29,2.35,d*.14);
    fix(x,z,w,d,h+.8);
  }
  for(const x of [181,329,462]){
    for(const z of [-33,33]){
      const y=world.height(x,z),slant=z<0?-.13:.13;
      b.box('hull',x,y+29,z,3.8,58,4.2,slant);
      b.box('concrete',x,y+.9,z,5.5,1.8,5.8);
      if(x!==181)fix(x,z,5.2,5.2,57);
      b.box('paint',x-10,y+54,z,24,2.75,3.4);
    }
    const y=world.height(x,0);
    b.box('hull',x,y+53,0,5,5.8,79);
    b.box('paint',x,y+57,0,4.1,3,80);
    for(let z=-40;z<44;z+=10)b.box('trim',x,y+58.0,z,4.5,.45,7.4);
    for(let z=-33;z<=33;z+=11){
      b.box('hull',x-2.6,y+54.6,z,.23,4.5,.32);
      b.box('trim',x-2.68,y+57.5,z,.19,2.0,.2);
      if(z<33)b.box('trim',x-2.6,y+53.2,z+5.5,.21,11.8,.28,(z+33)%22?1.22:-1.22);
    }
    b.box('mark',x-2.8,y+58.8,0,.15,.3,71);
    b.box('cargo',x+3.35,y+50,-7,5.45,4.2,7.25,0,0,0,0x879c9b);
    b.box('glass',x+3.6,y+50.8,-10.68,4.5,2.1,.21);
    b.box('hull',x+11,y+62,-7,32,2.7,4,0,0,-.25);
    b.box('darkRock',x-4,y+42,-7,.43,20,.43);
  }
  for(const z of [165,-174]) {
    const x=474,y=world.height(x,z);
    b.add('trim',tower,x,y+11,z,10,22,10);
    b.add('concrete',tower,x+27,y+9,z+16,9,18,9);
  }
  for(const [x,z] of [[-130,-93],[-117,92],[12,-84],[13,82],[121,91],[211,-95],[351,34]]) {
    const y=world.height(x,z);
    b.box('hull',x,y+9,z,.55,18,.55);
    b.box('hull',x-1.8,y+17.3,z,4.2,.3,.48);
    b.box('trim',x-3.35,y+17.05,z,1.35,.36,.8);
  }
  b.box('hull',181,20,0,.95,7.8,35.7);
  b.box('hull',181,24,0,2.1,.58,46);
  b.box('trim',181,14,-19,.48,13,.55);
  b.box('trim',181,14,19,.48,13,.55);
  b.finish(root);collar.dispose();tetra.dispose();tower.dispose();pebble.dispose();barrier.dispose();
  return sign(world,root);
}

function hullGeometry() {
  // 船殼沿長度變截面，水線下方往龍骨內收。每段分開計算法線，保留可辨識的折角。
  const stations=[[-76,15,2.6],[-68,21,3.5],[-51,23,5],[-18,23,5],[-3,21.8,4.8],[0,19.9,4.4]];
  const strips=stations.map(([x,w,h])=>[
    [x,h,-w],[x,1.2,-w-.42],[x,-2.25,-w*.86],[x,-3.05,-w*.44],
    [x,-3.05,w*.44],[x,-2.25,w*.86],[x,1.2,w+.42],[x,h,w],
  ]);
  const a=[],u=[];
  const tri=(p,q,r)=>{for(const v of [p,q,r]){a.push(...v);u.push(v[0]/8,v[1]/5);}};
  const quad=(p,q,r,s)=>{tri(p,q,r);tri(p,r,s);};
  for(let i=1;i<strips.length;i++)for(let k=1;k<strips[i].length;k++)quad(strips[i-1][k-1],strips[i-1][k],strips[i][k],strips[i][k-1]);
  const last=strips.at(-1);
  for(let i=1;i<7;i++){tri(strips[0][0],strips[0][i+1],strips[0][i]);tri(last[0],last[i],last[i+1]);}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(a,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(u,2)); geometry.computeVertexNormals();
  return geometry;
}

function buildCraft(root, materials) {
  const ship=new THREE.Group();ship.name='L-27 近岸登陸艇';root.add(ship);
  const hull=new THREE.Mesh(hullGeometry(),materials.hull);
  hull.material.side=THREE.DoubleSide;
  hull.castShadow=hull.receiveShadow=true;hull.userData.fieldGeometry=true;ship.add(hull);
  const b=new PropBatch(materials),deck=LANDING.deck;
  b.box('asphalt',-38,deck-.32,0,75,.64,42);
  b.box('hull',-37.5,deck+.5,-22.3,75,1.45,1.9);
  b.box('hull',-37.5,deck+.5,22.3,75,1.45,1.9);
  for(const s of [-1,1]){
    b.box('darkRock',-41,.84,s*22.0,65,1.12,.72);
    b.box('trim',-35,deck+1.37,s*22.23,67,.35,.73);
    b.box('trim',-33,deck+2.8,s*21.79,63,.21,.22);
    b.box('trim',-33,deck+3.95,s*21.79,63,.21,.22);
    for(let x=-64;x<=-2;x+=5.8)b.box('trim',x,deck+2.78,s*21.8,.24,2.46,.26);
    b.box('mark',-30,deck+.03,s*16.95,57,.055,.28);
    for(const x of [-47,-32,-17])b.box('glass',x,deck+.92,s*21.4,1.45,.26,.19);
    for(let x=-58;x<=-5;x+=6.3) b.box('darkRock',x,deck+.045,s*13.0,1.1,.08,.63);
    b.box('paint',-65,deck+4.2,s*15.3,17,8.6,12.3,0,0,.05);
    b.box('hull',-64.2,deck+8.75,s*15.3,17.4,.75,12.5);
    for(const z of [s*11.4,s*15.2,s*19.15]) {
      b.box('glass',-56.42,deck+6.6,z,.28,2.75,3.2,0,0,-.13);
      b.box('trim',-56.1,deck+5.15,z,.46,.21,3.4);
    }
    b.box('hull',-66.0,deck+10.25,s*15.5,4.2,3.3,4);
    b.box('trim',-66.2,deck+16.0,s*15.5,.43,11.3,.48);
    b.box('trim',-66.2,deck+18.7,s*15.5,2.5,.33,7.1);
    b.box('glass',-66.2,deck+21.6,s*15.5,1.16,1.27,1.4);
    b.box('hull',-2.5,deck+3.35,s*19.6,5.75,6.7,4.3);
    b.box('mark',-2.8,deck+7,s*19.6,5.3,.44,.72);
    b.box('trim',-.4,deck+2.2,s*15.4,1.35,4.2,1.3);
  }
  b.box('paint',-71.4,deck+1.2,0,6.8,2.5,29);
  b.box('mark',-56,deck+.035,0,2.5,.07,37.5);
  b.finish(ship);
  const ramp=new THREE.Group();ramp.name='艏部跳板';ramp.position.y=deck;ship.add(ramp);
  const r=new PropBatch(materials),L=LANDING.ramp;
  r.box('hull',L/2,-.5,0,L,1.06,37.4);
  for(const z of [-18.3,18.3])r.box('trim',L/2,.18,z,L,.37,1.2);
  for(let x=1.4;x<L-1;x+=2.2) {
    r.box('trim',x,.02,0,.32,.15,34.3);
    for(const z of [-14.7,14.7])r.box('mark',x,.12,z,.92,.045,.8);
  }
  r.box('trim',L-.24,-.37,0,.48,1.18,36.1);
  for(const z of [-11.3,11.3]){
    r.box('hull',L*.5,.061,z,L-.8,.12,2.55);
    for(const x of [3,9,17,23])r.box('mark',x,.145,z,.55,.06,1.6,0,z<0?-.67:.67,0);
  }
  r.finish(ramp);
  return {ship,ramp};
}

export function buildLandingSite(world, root) {
  const materials={
    hull:material(world,0x4a5b60,.59,.48,'paint'),
    trim:material(world,0xa0a9a3,.67,.31,'paint'),
    paint:material(world,0x587680,.58,.24,'paint'),
    cargo:material(world,0xf5f2e9,.54,.23,'paint',true),
    glass:material(world,0x183a49,.24,.56),
    concrete:material(world,0x95938b,.88,.02,'precast'),
    darkRock:material(world,0x51534d,.85,.09,'concrete'),
    asphalt:material(world,0x999991,.88,.12,'asphalt'),
    mark:material(world,0xd69b45,.77,.12,'paint'),
    stripe:material(world,0xc7c9b9,.82,.02),
  };
  const {water,time,bow,moving}=shoreWater();root.add(water);
  const scenery=new THREE.Group();scenery.name='神戶外港・海堤與港區';root.add(scenery);
  const map=portArchitecture(world,scenery,materials);
  const {ship,ramp}=buildCraft(root,materials);
  const rampAngle=-.175;
  const sidewalls=[{z0:-23.0,z1:-20.5},{z0:20.5,z1:23.0}];
  const gate={z0:-19,z1:19};
  const site={
    ship,ramp,water,scenery,time,bow,moving,progress:0,open:0,boxes:[...sidewalls,gate],
    setPose(progress,open,dt=0){
      this.progress=progress;this.open=open;
      time.value+=dt;
      const x=THREE.MathUtils.lerp(LANDING.departure,LANDING.berth,progress);
      ship.position.x=x;ship.position.y=Math.sin(time.value*1.83)*.32*(1-progress);
      ship.rotation.x=Math.sin(time.value*1.47)*.016*(1-progress);
      ramp.rotation.z=THREE.MathUtils.lerp(1.43,rampAngle,open);
      bow.value=x;moving.value=1-progress;
      for(const b of sidewalls){b.x0=x-75;b.x1=x+.3;b.top=LANDING.deck+1.8;}
      gate.x0=x-.65;gate.x1=x+1.2;gate.top=open<.8?LANDING.deck+23:-1000;
    },
    floorAt(x,z,feetY){
      const delta=x-ship.position.x;
      let deck=-Infinity;
      if(delta>=-74&&delta<=.25&&Math.abs(z)<=21.4)deck=LANDING.deck+ship.position.y;
      else if(this.open>=.86&&delta>0&&delta<=LANDING.ramp*Math.cos(rampAngle)+.11&&Math.abs(z)<=18.5)
        deck=LANDING.deck+Math.tan(rampAngle)*delta;
      return deck<=feetY+1.65?deck:-Infinity;
    },
    dispose() {
      for(const m of new Set([...Object.values(materials),water.material]))m.dispose();
      if(map){scenery.children.find(o=>o.material.map===map)?.material.dispose();map.dispose();}
    },
  };
  site.setPose(0,0);
  return site;
}
