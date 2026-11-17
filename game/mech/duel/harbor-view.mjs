import * as THREE from '../../lib/three.module.js';
import { ARENA } from './arena-layout.mjs';
import { MeshBatch } from './mesh-batch.mjs';

const CONCRETE = 0x757770, BLACK = 0x232f30, STEEL = 0x74817e;
const YELLOW=0xcb9953, IVORY=0xc3c7bd, LIGHT=0xffd498;
const SUN = new THREE.Vector3(-.62,.245,.745).normalize();
const harborFog = 0xa4a0a0;
const blend = (a,b,t) => new THREE.Color(a).lerp(new THREE.Color(b),t);
const seeded = seed => () => {
  seed = Math.imul(1664525,seed)+1013904223|0;
  return (seed>>>0)/4294967296;
};

function shed(m, glass, c) {
  const {x,z,width:w,depth:d,height:h,color} = c, eave=h-3.15;
  m.box(x,eave/2,z,w,eave,d,color);
  m.box(x,.58,z,w,1.16,d,0x4a534f);
  const pitch=Math.atan2(3.04,d*.5), span=Math.hypot(3.04,d*.5);
  for(const side of [-1,1]) {
    const front=z+side*(d*.5+.026);
    m.box(x,eave-.2,front,w,.56,.12,STEEL);
    m.box(x,(eave+h-.12)*.5,z+side*d*.25,w,.26,span,0x434f50,side*pitch);
    m.box(x,h-.26,z+.04,w,.32,1,0x39494c);
    m.box(x,eave*.51,front,w,.34,.18,0x90928b);
    for(let j=1;j<20;j++) {
      const xx=x-w*.5+w*j/20;
      m.box(xx,eave*.54,front+.07*side,.24,eave*.88,.27,0x88918e);
    }
    for(const u of [-.3,.3]) {
      const xx=x+u*w,doorY=4.25;
      m.box(xx,doorY,front+.15*side,w*.257,8.35,.23,BLACK);
      m.box(xx,doorY,front+.295*side,w*.227,7.7,.18,0x65706c);
      for(let i=0;i<9;i++) m.box(xx,.91+.83*i,front+.405*side,w*.223,.11,.12,0x464e4a);
      m.box(xx,9.85,front+.08*side,w*.278,.71,.13,STEEL);
      glass.box(xx,9.79,front+.292*side,1.71,.27,.15,LIGHT);
    }
    for(let i=-4;i<=4;i++) {
      const xx=x+i*w*.094;
      m.box(xx,13.91,front+.18*side,3.61,1.53,.17,BLACK);
      m.box(xx,13.94,front+.264*side,3.34,1.28,.085,0x678b8b);
      m.box(xx,13.94,front+.324*side,.15,1.28,.06,0x9da4a0);
    }
  }
  for(const side of [-1,1]) {
    const end=x+side*(w*.5+.012), reach=d*.5;
    for(let j=0;j<14;j++) {
      const zz=z+(j-6.5)*d*.07, level=eave+3*(1-Math.abs(zz-z)/reach);
      m.box(end,(eave+level)*.5,zz,.16,level-eave+.03,d*.071,color);
      m.box(end+.09*side,eave*.55,zz,.14,eave*.83,.23,0x88918e);
    }
    m.beam([end,eave,z-reach],[end,h-.12,z],.26,STEEL);
    m.beam([end,h-.12,z],[end,eave,z+reach],.26,STEEL);
  }
}

function containers(m, c) {
  const {x,z,width:w,depth:d,height:h,color} = c;
  const rows = h>=11 ? 3 : 2;
  const h0 = h/rows, w0=w/2, d0=d/2;
  for(let level=0;level<rows;level++) for(let n=0;n<4;n++) {
    const cx=x+(n%2-.5)*w0, cz=z+(Math.floor(n/2)-.5)*d0, yy=level*h0;
    const col=blend(color,n%3?0x89877a:0x263d41,(level+1)*.085+n*.044);
    m.box(cx,yy+h0*.5,cz,w0-.19,h0-.07,d0-.12,col);
    const trim=blend(col,BLACK,.44), corrugation=blend(col,IVORY,.14);
    const face=cz+(n<2?-1:1)*(d0*.5-.047);
    m.box(cx,yy+h0-.16,face,w0,.27,.17,trim);
    m.box(cx,yy+.19,face,w0,.24,.19,trim);
    for(let i=1;i<13;i++) m.box(cx+w0*(i/13-.5),yy+h0*.5,face,.14,h0-.67,.24,corrugation);
    for(const edge of [-1,1]) m.box(cx+edge*(w0*.5-.2),yy+h0*.5,face,.25,h0,.31,trim);
    const endSide=n%2?1:-1, end=cx+endSide*(w0*.5-.07);
    m.box(end,yy+h0*.5,cz,.16,h0-.64,d0-.85,blend(col,STEEL,.13));
    for(const across of [-1,1]) {
      m.box(end+endSide*.14,yy+h0*.52,cz+across*d0*.2,.22,h0*.84,.13,STEEL);
      m.box(end+endSide*.19,yy+h0*.43,cz+across*(d0*.2-.36),.23,.17,.63,STEEL);
    }
    m.box(end+endSide*.1,yy+h0*.5,cz,.14,h0*.81,.1,trim);
    m.box(cx+w0*.32,yy+h0*.69,face,w0*.21,.35,.35,blend(col,IVORY,.57));
  }
}

function crane(m, lamps, x,z, scale, direction=1) {
  const orange=0xb77e49, rail=0x3e5051;
  const P=(a,b,c)=>[x+a*scale*direction,b*scale,z+c*scale];
  const beam=(a,b,r,col)=>m.beam(P(...a),P(...b),r*scale,col);
  const cube=(a,b,c,w,h,d,col)=>m.box(...P(a,b,c),w*scale,h*scale,d*scale,col);
  for(const s of [-1,1]) for(const a of [-1,1]) {
    const foot=[a*13,0,s*8], top=[a*10,31,s*5];
    cube(a*13,1.15,s*8,5,2.3,4,rail);
    beam(foot,top,1.52,orange);
    beam(foot,[-a*10,31,s*5],.48,rail);
    beam(top,[a*11,58,s*4],1.46,orange);
    beam(top,[-a*11,58,s*4],.4,rail);
    beam([a*11,58,s*4],[a*11,58,-s*4],.78,orange);
  }
  cube(0,30,0,24,2.4,12,rail);
  cube(6,34.6,0,12,7,12,0xc88d59);
  cube(10.8,35.1,5.95,2.5,2,.09,0x759899);
  for(const z0 of [-3,3]) {
    beam([-28,55,z0],[46,55,z0],1.3,orange);
    beam([-22,60.5,z0],[41,60.5,z0],.9,orange);
    for(let i=-24;i<41;i+=7) {
      beam([i,55,z0],[i+5,60.5,z0],.39,rail);
      beam([i+5,60.5,z0],[i+8,55,z0],.35,rail);
    }
  }
  beam([0,57,0],[10,67,0],1.14,orange);
  beam([10,67,0],[44,57,0],.37,rail);
  beam([33,55,0],[33,26,0],.22,rail);
  cube(33,25.4,0,2.51,.7,4,rail);
  lamps.box(...P(10,67.4,0),.72*scale,.41*scale,.72*scale,0xf58060);
  lamps.box(...P(33,24.9,.7),.81*scale,.18*scale,.62*scale,LIGHT);
}

function freighter(m,l,x,z,s) {
  const w=130*s,d=26*s, edge=x+w*.5;
  m.box(x,-.19,z,w*.76,6.1*s,d,0x2c4249);
  m.box(x-8*s,2.98*s,z,w*.82,1.06*s,d,0x95a69f);
  m.box(edge-w*.128,.76*s,z,w*.28,6.4*s,d*.75,0x2c4249,0,.09);
  m.box(x-w*.38,2*s,z,w*.234,3.9*s,d*.86,0x303f44,0,-.04);
  m.box(x-w*.273,6.57*s,z,w*.206,7.28*s,d*.75,0xc2c3b3);
  m.box(x-w*.24,10.51*s,z,w*.17,1.05*s,d*.93,0xb7c3ba);
  m.box(x-w*.29,13.1*s,z-3*s,4*s,5.1*s,4.5*s,0x845144);
  m.box(x-w*.29,15.63*s,z-3*s,4.03*s,.48*s,4.6*s,BLACK);
  for(let i=0;i<7;i++) {
    const xx=x+(-.313+i*.023)*w;
    l.box(xx,8.79*s,z+d*.39,1.5*s,.55*s,.08*s,i%3===0?LIGHT:0x748c8f);
  }
  for(let i=0;i<6;i++) for(const side of [-1,1]) {
    const xx=x+i*13.1*s-15*s, zz=z+side*4.57*s;
    m.box(xx,5*s,zz,12.7*s,4.1*s,8.5*s,(i+side)%3?0x87694f:0x455f64);
    m.box(xx,7.95*s,zz,12.5*s,2.44*s,8.44*s,(i+side)%4?0x946052:0x8a8a69);
  }
  m.beam([x-w*.24,10*s,z],[x-w*.24,17*s,z],.55*s,STEEL);
  m.beam([x-w*.24-4*s,15.4*s,z],[x-w*.24+4*s,15.4*s,z],.37*s,STEEL);
  l.box(x-w*.24,17.05*s,z,.44*s,.28*s,.43*s,LIGHT);
}

// Landmark silhouettes sit beyond the playable quay.
function portTower(m,lamps,x,z) {
  const rings=11, sides=12, H=105;
  const pos=(i,n)=>{
    const t=i/rings, r=6.3+17*(t-.55)**2, a=(n/sides)*Math.PI*2;
    return [x+Math.cos(a)*r,t*H,z+Math.sin(a)*r];
  };
  for(let i=0;i<rings;i++) for(let n=0;n<sides;n++) {
    const a=pos(i,n), b=pos(i+1,n+1), c=pos(i+1,n-1);
    m.beam(a,b,.48,0xb85f4c);
    m.beam(a,c,.48,0xb05d4b);
    if(i%3===0)m.beam(a,pos(i,n+1),.33,0xbb735b);
  }
  m.cylinder(x,3,z,28,6,0x938d7d);
  m.cylinder(x,87,z,18.2,11,0xb47762);
  m.cylinder(x,92.4,z,20.8,2.85,0xbc7662);
  lamps.cylinder(x,89.2,z,19.6,1.1,0xce8c70);
  m.cylinder(x,105.3,z,17.4,3.25,0xb3705d);
  m.beam([x,106,z],[x,115,z],.67,0xb36b5a);
  lamps.box(x,115,z,.7,1,.7,0xd67857);
}

function hills(scene) {
  const draw = (distance, span, base, shift, color, fogMix, bearing = 0) => {
    const random=seeded(125+shift), width=2600, m=new THREE.BufferGeometry(), positions=[], colors=[], indices=[];
    const lower=new THREE.Color(harborFog).lerp(new THREE.Color(color),fogMix*.35), upper=new THREE.Color(color);
    for(let i=0;i<=100;i++) {
      const u=i/100, envelope=Math.sin(Math.PI*u);
      const h=(.62+.18*Math.sin(13*u+shift)+.15*Math.cos(u*27)+.075*Math.sin(u*48+shift)+random()*.045)*envelope;
      positions.push(-width/2+width*u,base,distance,-width/2+width*u,base+span*h,distance);
      colors.push(lower.r,lower.g,lower.b,upper.r,upper.g,upper.b);
      if(i<100){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    }
    m.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    m.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));m.setIndex(indices);
    const mountains = new THREE.Mesh(m,new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide}));
    mountains.rotation.y=bearing;
    scene.add(mountains);
  };
  draw(1270,373,-10,3,0x819093,.36);
  draw(995,272,-16,7,0x687f81,.63);
  draw(1390,240,-17,10,0x859398,.55,1.55);
  draw(1700,185,-17,17,0x929fa0,.47,-1.59);
}

function grit() {
  const width=256, data = new Uint8Array(width*width*4), random=seeded(14);
  for(let y=0;y<width;y++) for(let x=0;x<width;x++) {
    const at=(x+y*width)*4, r=random();
    const cloud=Math.sin((x+y)*.065)*Math.sin((y-x)*.091)+.7*Math.sin(x*.044)*Math.sin(y*.032);
    const mark=r<.015?-32:r>.989?19:0, v=191+28*(r-.5)+cloud*8+mark;
    data[at]=v+4;data[at+1]=v+1;data[at+2]=v-3;data[at+3]=255;
  }
  const tx=new THREE.DataTexture(data,width,width,THREE.RGBAFormat);
  tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(24,16);
  tx.magFilter=THREE.LinearFilter;tx.minFilter=THREE.LinearMipmapLinearFilter;tx.generateMipmaps=true;
  tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;tx.needsUpdate=true;
  return tx;
}

const skyFragment = `
varying vec3 vDirection;
uniform vec3 sun;
float hash(vec2 p){ return fract(sin(dot(p,vec2(44.79,57.83)))*43701.186); }
float value(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main(){
 vec3 dir=normalize(vDirection);
 float h=max(0.,dir.y);
 float light=max(0.,dot(dir,sun));
 vec3 horizon=mix(vec3(.38,.46,.53),vec3(.84,.49,.28),pow(light,5.));
 vec3 color=mix(horizon,vec3(.075,.175,.31),pow(h,.51));
 color+=vec3(.47,.166,.044)*pow(light,17.)*(.74-.38*h);
 color+=vec3(.44,.24,.11)*pow(light,92.);
 color+=vec3(1.9,1.3,.64)*smoothstep(.99958,.99983,light);
 vec2 p=dir.xz*vec2(17.,14.)/(.32+1.8*h);
 float bank=value(p)*.55+value(p*2.1)*.29+value(p*4.3)*.16;
 float cloud=smoothstep(.49,.67,bank)*smoothstep(.014,.12,h)*(1.-smoothstep(.31,.73,h));
 color=mix(color,mix(vec3(.25,.32,.41),vec3(.73,.52,.42),pow(light,7.)),cloud*.63);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

const waterFragment = `
varying vec3 vWorld;
uniform vec3 sun;
uniform float time;
float wave(float a){float width=fwidth(a);return sin(a)/(1.+width*width);}
void main(){
 vec2 p=vWorld.xz;
 p+=vec2(sin(p.y*.031),cos(p.x*.024))*7.;
 float phase=wave(p.x*.084+p.y*.118+time*.83);
 float chop=wave(p.y*.22-p.x*.051-time*1.36);
 float glint=wave(p.x*.38+p.y*.5+time*1.7);
 vec3 normal=normalize(vec3(.061*phase+.028*glint,1.,.079*chop+.035*glint));
 vec3 look=normalize(cameraPosition-vWorld);
 float sky=pow(1.-max(0.,dot(normal,look)),4.);
 vec3 tinted=mix(vec3(.22,.29,.33),vec3(.41,.292,.215),pow(max(0.,dot(sun,-look)),6.));
 vec3 water=mix(vec3(.029,.081,.106),tinted,sky);
 float reflection=pow(max(0.,dot(reflect(-look,normal),sun)),47.);
 water+=reflection*vec3(.62,.30,.105)+.008*(phase+chop);
 water=mix(water,vec3(.32,.34,.35),min(.8,distance(vWorld,cameraPosition)/1700.)*.9);
 gl_FragColor=vec4(water,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

function surface(scene) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400,25,14),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{sun:{value:SUN}},
    vertexShader:`varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:skyFragment,
  }));
  sky.renderOrder=-20;scene.add(sky);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4500,4500).rotateX(-Math.PI/2),new THREE.ShaderMaterial({
    uniforms:{sun:{value:SUN},time:{value:0}},
    vertexShader:`varying vec3 vWorld;
      void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:waterFragment,
  }));
  water.position.y=-2.91;scene.add(water);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480,340).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({
    color:0xa4a39a,map:grit(),roughness:.87,metalness:.04,
  }));
  ground.receiveShadow=true;scene.add(ground);
  return water.material.uniforms.time;
}

export function buildHarbor(scene) {
  scene.fog=new THREE.Fog(harborFog,185,1200);
  const time=surface(scene);
  hills(scene);
  const m=new MeshBatch(), lamp=new MeshBatch(), trim=new MeshBatch();
  m.box(0,-2.2,0,480,4.3,340,CONCRETE);
  const rng=seeded(91);
  for(const side of [-1,1]) {
    const z=side*170;
    m.box(0,-.003,z,480,.26,1.2,0x555e5d);
    for(let j=-8;j<=8;j++) {
      const x=j*27;
      m.box(x,-1.24,z+.5*side,.97,2.16,1.23,BLACK);
      m.cylinder(x,.69,z-side*2,1.64,1.31,STEEL);
      m.cylinder(x,1.38,z-side*2,1.89,.17,BLACK);
      trim.box(x,.022,z-side*5,12,.032,.58,0xb6a15e);
    }
    const along=side*239;
    for(let j=-5;j<=5;j++) m.box(along+side*.58,-1.38,j*31.5,1.12,1.5,1.21,BLACK);
    for(let j=-4;j<=4;j++) trim.box(along-side*4,.017,j*34.6,.44,.029,17,0xada774);
    m.box(side*217,-2.4,-side*220,44,4.25,115,0x686e69);
    m.box(side*227,-2.3,side*286,268,4.52,55,0x606963);
    crane(m,lamp,side*162,-side*226,1.14,-side);
    crane(m,lamp,side*291,side*302,.99,side);
    freighter(m,lamp,side*175,side*340,.93);
  }
  for(let i=-9;i<=9;i++){
    const x=i*23.3;
    trim.box(x,.004,0,.12,.008,339,0x535953);
    if(i%3===0)trim.box(x,.009,0,.26,.012,339,0x858678);
    trim.box(x,.026,15,9.4,.047,.22,0xb8ae83);
    trim.box(x,.027,-15,9.4,.047,.22,0xb8ae83);
  }
  for(let i=-7;i<=7;i++) trim.box(0,.009,i*22.6,478,.012,.15,0x5c645e);
  for(const c of ARENA.cover) {
    const {x,z,width:w,depth:d}=c;
    trim.box(x,.012,z,w+5,.015,d+6,0x5f645e);
    if(c.kind==='shed') shed(m,lamp,c); else containers(m,c);
    for(const side of [-1,1]) {
      const at=z+side*(d*.5+3.23);
      trim.box(x,.018,at,w+5,.02,.24,YELLOW);
      for(let i=-1;i<=1;i++)trim.box(x+i*w*.28,.016,at+w*.008*side,1.17,.015,.28,YELLOW,0,.62*side);
    }
  }
  for(let i=0;i<100;i++) {
    const x=(rng()-.5)*465,z=(rng()-.5)*334,l=.4+rng()*5;
    trim.box(x,.007,z,l,.006,.025,0x545953,0,rng()*2.8);
  }
  for(const side of [-1,1]) for(const x of [-199,-61,72,197]) {
    const z=side*158;
    m.cylinder(x,12,z,.42,24,STEEL);
    m.cylinder(x,1.34,z,.94,2.68,0x46514f);
    m.beam([x,23.8,z],[x,24,z-side*3],.38,STEEL);
    m.box(x,24,z-side*3,1.49,.48,1.1,BLACK);
    lamp.box(x,23.73,z-side*3,1.15,.06,.79,LIGHT);
  }

  for(let i=0;i<31;i++) {
    const x=(i-15)*47+(rng()-.5)*18,z=530+rng()*99;
    const w=20+rng()*31,h=13+rng()*50,d=17+rng()*32;
    const col=blend(0x69777c,0x95968e,rng());
    m.box(x,h/2-1.25,z,w,h,d,col);
    if(i%4===0)m.box(x,h+1.45,z,w*.39,4.9,d*.39,col);
    for(let j=1;j<5;j++) {
      const y=h*j/5-.5;
      m.box(x,y,z-d*.5-.055,w*.78,.59,.19,0x596b70);
      if((i+j)%3===0)lamp.box(x+w*.17,y,z-d*.5-.173,w*.16,.42,.09,0xd6b78e);
    }
  }
  m.box(0,-2.4,590,1590,4.2,190,0x75817e);
  for(const side of [-1,1]) {
    m.box(side*513,-2.2,-60,170,4.35,420,0x72807c);
    for(let j=0;j<8;j++) {
      const x=side*(493+rng()*116),z=-260+j*66,w=35+rng()*43,h=15+rng()*32;
      m.box(x,h/2-.8,z,w,h,31+rng()*17,blend(0x708183,0x82857b,rng()));
      if(j%2===0)crane(m,lamp,side*444,z,.77,side);
    }
  }
  portTower(m,lamp,-219,481);
  const clear = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.76,metalness:.11});
  const harbor = m.mesh(clear);harbor.castShadow=true;scene.add(harbor);
  const groundMarking=clear.clone();
  groundMarking.polygonOffset=true;groundMarking.polygonOffsetFactor=-1;groundMarking.polygonOffsetUnits=-1;
  scene.add(trim.mesh(groundMarking),lamp.mesh(new THREE.MeshBasicMaterial({vertexColors:true})));
  const sun=new THREE.DirectionalLight(0xffb47f,2.62);
  sun.position.copy(SUN).multiplyScalar(340);
  sun.castShadow=true;
  sun.shadow.camera.left=-244;sun.shadow.camera.right=244;
  sun.shadow.camera.top=220;sun.shadow.camera.bottom=-220;
  sun.shadow.camera.near=42;sun.shadow.camera.far=670;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.00024;sun.shadow.normalBias=.45;
  const fill=new THREE.DirectionalLight(0xa4d8ef,.74);fill.position.set(340,190,-215);
  scene.add(new THREE.HemisphereLight(0xc8dbe5,0x7c7e78,1.36),sun,fill);
  return {time,sun};
}
