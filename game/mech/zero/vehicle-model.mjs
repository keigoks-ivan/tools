// 架空近未來四輪載具，單位為公尺、車頭 +Z；共用街景車的五種材質。
import * as THREE from 'three';
import { VEHICLE_TYPES } from './ground-vehicle.mjs';

const cache = new Map(), TAU = Math.PI * 2;
const keys = { body: 'carPaint', dark: 'carDark', metal: 'carMetal', glass: 'carGlass', lights: 'carLights' };
const color = { dark: [.035,.042,.045], rubber: [.035,.037,.038], metal: [.46,.49,.49], seal: [.023,.028,.029], glass: [.64,.76,.81] };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));

class Bucket {
  constructor() { this.p = []; this.n = []; this.c = []; }
  triangle(a, b, c, tint, outward) {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    if (n.lengthSq() < 1e-14) return;
    if (outward && n.dot(new THREE.Vector3(...outward)) < 0) { [b,c] = [c,b]; n.negate(); }
    n.normalize();
    for (const p of [a,b,c]) { this.p.push(...p); this.n.push(n.x,n.y,n.z); this.c.push(...tint); }
  }
  quad(a,b,c,d,tint,outward) { this.triangle(a,b,c,tint,outward); this.triangle(a,c,d,tint,outward); }
  add(g, tint) {
    const v = g.index ? g.toNonIndexed() : g, p = v.attributes.position, n = v.attributes.normal;
    for (let i=0;i<p.count;i++) { this.p.push(p.getX(i),p.getY(i),p.getZ(i)); this.n.push(n.getX(i),n.getY(i),n.getZ(i)); this.c.push(...tint); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c,3));
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}

function box(b,w,h,d,x,y,z,tint,rx=0,ry=0,rz=0) { b.add(new THREE.BoxGeometry(w,h,d).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x,y,z),tint); }
function cylinder(b,r,h,x,y,z,tint,axis='y',segments=12,open=false) {
  const g = new THREE.CylinderGeometry(r,r,h,segments,1,open);
  if (axis==='x') g.rotateZ(Math.PI/2); if (axis==='z') g.rotateX(Math.PI/2);
  b.add(g.translate(x,y,z),tint);
}
function line(b,a,c,r,tint,segments=6) {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...c),d=end.clone().sub(start),g=new THREE.CylinderGeometry(r,r,d.length(),segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())).translate(...start.add(end).multiplyScalar(.5).toArray()); b.add(g,tint);
}
function pane(out,a,b,c,d,outward) {
  const q=[a,b,c,d],mid=q.reduce((s,p)=>s.map((v,i)=>v+p[i]/4),[0,0,0]),inner=q.map(p=>p.map((v,i)=>mid[i]+(v-mid[i])*.85));
  for (let i=0;i<4;i++) out.dark.quad(q[i],q[(i+1)%4],inner[(i+1)%4],inner[i],color.seal,outward);
  out.glass.quad(...inner,color.glass,outward);
}

function chassis(out,p,type) {
  const apc=type==='apc',w=p.width/2,half=p.length/2,r=p.wheelRadius,arch=r+.075,paint=apc?[.29,.335,.32]:[.19,.235,.205];
  // 門、引擎蓋、斜面風擋與車頂有不同斷面；輪拱真的挖空。
  const sections=apc ? [[-half,.95,2.10],[-half+.18,.99,2.21],[-1.95,1,2.25],[-.25,.995,2.25],[.9,.985,2.20],[1.28,.98,2.04],[1.86,.98,1.33],[2.55,.97,1.17],[half,.86,1.00]] : [[-half,.86,1.48],[-half+.17,.92,1.78],[-1.7,.925,1.90],[-.36,.925,1.90],[.62,.915,1.87],[.97,.91,1.77],[1.39,.90,1.15],[2.05,.89,1.10],[half,.79,.96]];
  const cuts=[...sections.map(q=>q[0]),...[-.49,-.37,.48,.60,.85,1.02].filter(z=>z>-half&&z<half)];
  for (const z of [-p.wheelbase/2,p.wheelbase/2]) for (let i=0;i<=8;i++) cuts.push(z-arch*Math.cos(i/8*Math.PI));
  const zs=[...new Set(cuts.map(z=>+z.toFixed(6)))].sort((a,b)=>a-b),rings=[];
  const shape=z=>{
    let i=0; while(i<sections.length-2 && z>sections[i+1][0]) i++;
    const a=sections[i],b=sections[i+1],t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0]))),width=(a[1]+(b[1]-a[1])*t)*w,roof=a[2]+(b[2]-a[2])*t;
    let sill=.36; for(const axle of [-p.wheelbase/2,p.wheelbase/2]) { const dz=z-axle; if(Math.abs(dz)<arch) sill=Math.max(sill,r+Math.sqrt(arch*arch-dz*dz)); }
    const belt=Math.min(apc?1.36:1.23,roof-.12),halfRing=[[width,sill],[width,Math.max(sill+.015,Math.min(belt-.1,1.01))],[width*.995,Math.max(sill+.02,belt)],[width*.91,roof-.09],[width*.80,roof],[0,roof]];
    return [...halfRing,...halfRing.slice(0,-1).reverse().map(([x,y])=>[-x,y])].map(([x,y])=>[x,y,z]);
  };
  for(const z of zs) rings.push(shape(z));
  for(let i=0;i<zs.length-1;i++)for(let k=0;k<rings[i].length-1;k++) {
    const z0=zs[i],z1=zs[i+1],side=k===2||k===7,window=side && (apc?z0>=.9&&z1<=1.28:z0>=-1.7&&z1<=.85) && !(z0>=-.49&&z1<=-.37) && !(z0>=.48&&z1<=.60);
    const windshield=(k===3||k===4||k===5||k===6) && (apc?z0>=1.28&&z1<=1.86:z0>=1.02&&z1<=1.39);
    const a=rings[i][k],b=rings[i][k+1],c=rings[i+1][k+1],d=rings[i+1][k],outward=[(a[0]+b[0])/2, .2, 0];
    if(!window&&!windshield)out.body.quad(a,b,c,d,paint,outward);
  }
  // 大片車窗只做一圈膠條，不隨輪拱細分成小格子。
  for(const side of [-1,1])for(const [z0,z1]of apc?[[.90,1.28]]:[[-1.7,-.49],[-.37,.48],[.60,.85]]) {
    const a=shape(z0),b=shape(z1),k=side>0?2:7;
    pane(out,a[k],a[k+1],b[k+1],b[k],[side,0,0]);
  }
  const frontBottomZ=apc?1.86:1.39,frontTopZ=apc?1.28:1.02,bottomY=apc?1.40:1.17,topY=apc?1.98:1.69,glassW=apc?.91:.68;
  pane(out,[-glassW,bottomY,frontBottomZ],[glassW,bottomY,frontBottomZ],[glassW,topY,frontTopZ],[-glassW,topY,frontTopZ],[0,.4,1]);
  for(const [i,sign]of [[0,-1],[rings.length-1,1]]) {
    // 頭尾面板退進車殼邊緣，格柵、燈具與坡道才不會被整片烤漆遮住。
    const capZ=zs[i]-(sign>0?.06:-.055),ring=rings[i].map(q=>[q[0],q[1],capZ]),mid=[0,.79,capZ];
    if(!apc&&sign<0) {
      const shape=new THREE.Shape(ring.map(q=>new THREE.Vector2(q[0],q[1])));
      shape.holes.push(new THREE.Path([[-.63,1.09],[-.63,1.41],[.63,1.41],[.63,1.09]].map(q=>new THREE.Vector2(...q))));
      out.body.add(new THREE.ShapeGeometry(shape).rotateY(Math.PI).translate(0,0,capZ),paint);
    } else for(let j=0;j<ring.length;j++)out.body.triangle(mid,ring[j],ring[(j+1)%ring.length],paint,[0,0,sign]);
  }
  box(out.dark,p.width*.68,.13,p.length*.81,0,.34,0,color.dark);
  for(const x of [-p.track*.30,p.track*.30])box(out.metal,.09,.11,p.length*.78,x,.30,0,[.16,.18,.18]);
  for(const z of [-p.wheelbase/2,p.wheelbase/2]) {
    cylinder(out.metal,.063,p.track,0,r,z,[.17,.19,.20],'x',8);
    box(out.dark,.30,.18,.25,0,r,z,[.12,.14,.14]);
    for(const side of [-1,1]) {
      line(out.metal,[side*p.track/2,r-.05,z-.18],[side*p.track*.29,r+.22,z+.11],.036,[.25,.28,.28]);
      // 八段外翻輪拱、內襯與擋泥板避免輪胎貼在完整箱型車殼上。
      for(let i=0;i<8;i++) {
        const a=i/8*Math.PI,b=(i+1)/8*Math.PI,pt=(theta,rad,xx)=>[xx,r+Math.sin(theta)*rad,z-Math.cos(theta)*rad];
        out.body.quad(pt(a,arch,side*(w-.045)),pt(b,arch,side*(w-.045)),pt(b,arch+.035,side*w),pt(a,arch+.035,side*w),paint,[side,0,0]);
        out.dark.quad(pt(a,arch-.005,side*(w-.19)),pt(b,arch-.005,side*(w-.19)),pt(b,arch-.005,side*(w-.04)),pt(a,arch-.005,side*(w-.04)),color.dark,[0,-1,0]);
      }
      box(out.dark,.18,.33,.035,side*(w-.13),r-.12,z-arch-.015,color.rubber);
    }
  }
  // 分層保險桿與正面凹進去的散熱格柵。
  for(const sign of [-1,1]) {
    box(out.dark,p.width*.91,.19,.11,0,.57,sign*(half-.09),[.07,.083,.08]);
    box(out.metal,p.width*.74,.075,.075,0,.48,sign*(half-.055),[.38,.40,.38]);
    for(const x of [-w*.57,w*.57]) { cylinder(out.metal,.048,.038,x,.58,sign*(half-.025),color.metal,'z',6); box(out.dark,.11,.06,.022,x,.68,sign*(half-.012),[.012,.018,.017]); }
  }
  box(out.dark,p.width*.48,.22,.025,0,.84,half-.018,[.012,.018,.019]);
  for(let i=-4;i<=4;i++)box(out.metal,.022,.16,.014,i*p.width*.046,.84,half-.007,[.25,.29,.28]);
  const frontLampY=apc?.93:.87;
  for(const side of [-1,1]) {
    cylinder(out.dark,.11,.025,side*w*.68,frontLampY,half-.019,color.seal,'z',12);
    cylinder(out.lights,.085,.018,side*w*.68,frontLampY,half-.009,[.92,.91,.77],'z',12);
    box(out.lights,.10,.043,.016,side*w*.80,frontLampY-.15,half-.013,[.84,.34,.035]);
    box(out.lights,.105,.135,.024,side*w*.79,.86,-half+.014,[.55,.027,.022]);
    box(out.lights,.105,.047,.023,side*w*.79,.74,-half+.014,[.86,.43,.045]);
  }
  for(const side of [-1,1]) {
    const x=side*(w-.075);
    // 分開的踏板、門縫、把手與鉸鏈；低飽和裸露邊緣只有數公分。
    box(out.dark,.10,.09,apc?1.45:1.33,x,.39,-.15,[.085,.095,.089]);
    for(const z of apc?[-.65,.98]:[-.39,.60]) {
      box(out.dark,.012,.78,.014,side*w*.93,1.17,z,color.seal);
      box(out.metal,.02,.044,.12,side*w*.934,1.26,z+.16,[.43,.45,.43]);
      for(const y of [.98,1.47])box(out.metal,.025,.07,.045,side*w*.94,y,z-.06,[.23,.27,.25]);
    }
    for(let i=0;i<(apc?7:4);i++)box(out.dark,.009,.035,.14,side*(w-.014),1.09,-1.55+i*.18,color.seal);
    const mirrorZ=apc?1.12:.88,mirrorY=apc?1.9:1.63;
    line(out.metal,[side*w*.87,mirrorY-.11,mirrorZ],[side*(w-.03),mirrorY+.01,mirrorZ+.04],.016,color.dark);
    box(out.dark,.075,.20,.16,side*(w-.04),mirrorY+.045,mirrorZ+.015,color.seal);
    box(out.glass,.008,.16,.12,side*(w-.079),mirrorY+.045,mirrorZ+.015,[.72,.80,.83]);
  }
  if(apc) {
    // 駕駛艙後為裝甲人員廂；後坡道的橫樑與上車踏階可辨識。
    box(out.dark,1.43,1.20,.012,0,1.18,-half+.038,[.10,.12,.115]);
    box(out.body,1.38,1.14,.022,0,1.18,-half+.025,[.26,.30,.285]);
    for(const x of [-.66,.66])box(out.metal,.038,1.10,.028,x,1.18,-half+.014,[.33,.36,.345]);
    for(const y of [.69,1.10,1.53])box(out.dark,1.25,.014,.026,0,y,-half+.013,color.seal);
    box(out.metal,.65,.07,.30,0,.36,-half+.15,[.36,.38,.35]);
    for(const side of [-1,1])for(const z of [-1.85,-1.12,-.38]) {
      box(out.body,.033,.48,.54,side*(w-.02),1.49,z,[.27,.31,.293]);
      for(const dz of [-.21,.21])for(const y of [1.30,1.68])cylinder(out.metal,.018,.026,side*(w-.014),y,z+dz,[.39,.41,.39],'x',6);
    }
    for(const x of [-.55,.55])box(out.body,.64,.035,.87,x,2.26,-1.38,[.265,.31,.293]);
    for(let i=0;i<5;i++)box(out.dark,.027,.008,.40,-.47+i*.095,2.283,-1.38,color.seal);
  } else {
    // 車頂行李架與背門有實際接合點，沒有虛構商標或部隊文字。
    for(const x of [-.64,.64]) {
      box(out.metal,.035,.09,1.96,x,1.985,-.40,[.16,.19,.175]);
      for(const z of [-1.20,.30])box(out.metal,.028,.12,.036,x,1.925,z,[.21,.24,.22]);
    }
    for(const z of [-1.24,-.93,.30])box(out.metal,1.29,.029,.032,0,2.006,z,[.22,.26,.24]);
    pane(out,[-.63,1.09,-half],[.63,1.09,-half],[.63,1.41,-half],[-.63,1.41,-half],[0,0,-1]);
    box(out.metal,.27,.037,.045,0,.96,-half+.023,[.42,.46,.43]);
    box(out.dark,.018,.43,.02,.78,1.05,-half+.011,color.seal);
    cylinder(out.metal,.10,.23,0,.66,half-.13,[.26,.28,.28],'x',12);
    line(out.metal,[-.55,.77,half-.09],[-.46,.94,half-.16],.022,[.25,.29,.27]);
    line(out.metal,[.55,.77,half-.09],[.46,.94,half-.16],.022,[.25,.29,.27]);
  }
  // 雨刷位於斜風擋外，實體細線而非貼圖文字。
  const windshieldZ=apc?1.57:1.18,windshieldY=apc?1.72:1.43;
  for(const x of [-.37,.37])line(out.dark,[x,windshieldY-.12,windshieldZ+.10],[x+.13,windshieldY+.13,windshieldZ-.04],.010,color.seal,4);
}

function wheelGeometry(p) {
  const tire=new Bucket(),rim=new Bucket(),r=p.wheelRadius,half=(p.width-p.track)/2,segments=16;
  const ring=[[-half,.69],[-half*.82,.97],[half*.82,.97],[half,.69]];
  const pt=(x,rad,a)=>[x,Math.cos(a)*rad,Math.sin(a)*rad];
  for(let j=0;j<ring.length-1;j++)for(let i=0;i<segments;i++) {
    const a=i/segments*TAU,b=(i+1)/segments*TAU;
    tire.quad(pt(ring[j][0],ring[j][1]*r,a),pt(ring[j][0],ring[j][1]*r,b),pt(ring[j+1][0],ring[j+1][1]*r,b),pt(ring[j+1][0],ring[j+1][1]*r,a),color.rubber,[0,Math.cos((a+b)/2),Math.sin((a+b)/2)]);
  }
  // 交錯的立體胎塊只保留外側與迎風面；遮住的底面不消耗三角形。
  for(let i=0;i<16;i++)for(const lane of [-1,1]) {
    const a=i/16*TAU,b=a+.16,x0=lane>0?.015:-half*.72,x1=lane>0?half*.72:-.015;
    tire.quad(pt(x0,r,a),pt(x1,r,a),pt(x1,r,b),pt(x0,r,b),[.047,.049,.047],[0,Math.cos(a+.08),Math.sin(a+.08)]);
    tire.quad(pt(x0,r*.96,a),pt(x1,r*.96,a),pt(x1,r,a),pt(x0,r,a),[.032,.035,.033],[0,-Math.sin(a),Math.cos(a)]);
  }
  const x=half-.04,rr=r*.66;
  for(let i=0;i<16;i++) {
    const a=i/16*TAU,b=(i+1)/16*TAU;
    rim.quad(pt(x,rr,a),pt(x,rr,b),pt(x,rr*.85,b),pt(x,rr*.85,a),[.43,.48,.45],[1,0,0]);
    tire.triangle([x-.009,0,0],pt(x-.009,rr*.85,a),pt(x-.009,rr*.85,b),[.013,.018,.016],[1,0,0]);
  }
  cylinder(rim,rr*.24,.025,x+.007,0,0,[.34,.38,.35],'x',8);
  for(let i=0;i<6;i++) {
    const a=i/6*TAU,b=a+.29;
    rim.quad(pt(x+.006,rr*.22,a-.12),pt(x+.006,rr*.86,a),pt(x+.006,rr*.86,b),pt(x+.006,rr*.22,b+.12),[.49,.53,.50],[1,0,0]);
    const cy=Math.cos(a)*rr*.37,cz=Math.sin(a)*rr*.37;
    rim.quad([x+.014,cy-.013,cz-.013],[x+.014,cy+.013,cz-.013],[x+.014,cy+.013,cz+.013],[x+.014,cy-.013,cz+.013],[.66,.69,.65],[1,0,0]);
  }
  return { tire: tire.geometry(), rim: rim.geometry() };
}

function gunGeometry(p,type) {
  const base=new Bucket(),gun=new Bucket(),steel=[.14,.17,.18],brushed=[.39,.42,.43],apc=type==='apc';
  // 炮座原點與 GroundVehicle 的 turretY / turretZ 完全相同。
  cylinder(base,.29,.075,0,-.115,0,[.29,.33,.30],'y',16,true);
  cylinder(base,.20,.078,0,-.042,0,[.15,.18,.17],'y',12,true);
  for(const side of [-1,1]) {
    box(base,.045,.19,.16,side*.135,-.032,0,brushed);
    cylinder(base,.053,.024,side*.15,0,0,brushed,'x',8);
  }
  for(let i=0;i<8;i++) { const a=i/8*TAU,x=Math.sin(a)*.235,z=Math.cos(a)*.235; base.quad([x-.013,-.066,z-.013],[x+.013,-.066,z-.013],[x+.013,-.066,z+.013],[x-.013,-.066,z+.013],[.48,.51,.48],[0,1,0]); }
  box(gun,.18,.115,.51,0,.003,-.074,steel);
  box(gun,.155,.018,.40,0,.070,-.088,[.26,.30,.30]);
  box(gun,.11,.075,.16,0,-.015,-.37,steel);
  for(const side of [-1,1])line(gun,[side*.09,.022,-.30],[side*.13,-.078,-.39],.021,[.22,.25,.25]);
  box(gun,.18,.035,.035,0,-.07,-.41,[.22,.25,.25]);
  box(gun,.11,.05,.16,.16,-.026,-.05,[.30,.34,.31]);
  box(gun,.12,.17,.28,-.19,-.041,-.08,[.27,.31,.285]);
  for(let i=0;i<4;i++)box(gun,.003,.011,.19,-.252,-.093+i*.035,-.08,[.14,.18,.16]);
  // 開放式散熱護罩、裸露槍管、槍口環與凹進去的膛口。
  const barrelStart=.245,barrelEnd=p.muzzle-.068;
  cylinder(gun,.024,barrelEnd-barrelStart,0,0,(barrelStart+barrelEnd)/2,[.28,.31,.32],'z',12,true);
  for(const x of [-.050,.050])for(const y of [-.036,.036])box(gun,.015,.015,.41,x,y,.37,[.20,.24,.24]);
  for(let i=0;i<5;i++)for(const side of [-1,1]) {
    const z=.19+i*.085;gun.quad([side*.05,-.034,z],[side*.05,-.034,z+.016],[side*.05,.034,z+.051],[side*.05,.034,z+.035],[.25,.29,.29],[side,0,0]);
  }
  cylinder(gun,.039,.068,0,0,p.muzzle-.034,[.29,.33,.33],'z',12,true);
  cylinder(gun,.018,.008,0,0,p.muzzle-.029,[.018,.021,.023],'z',12);
  for(const z of [.078,.49]) { box(gun,.016,.073,.024,0,.084,z,[.23,.27,.27]); box(gun,.054,.012,.024,0,.115,z,brushed); }
  if(apc) {
    // 低矮防護翼板跟著炮座轉向，但不跟著炮管仰俯。
    for(const side of [-1,1])box(base,.025,.31,.40,side*.31,.045,.16,[.29,.33,.31],0,side*-.23);
    box(base,.60,.16,.023,0,.062,.39,[.29,.33,.31],-.25);
  }
  return { base:base.geometry(),gun:gun.geometry() };
}

function burned(g) {
  const result=g.clone(),p=result.attributes.position,c=result.attributes.color;
  for(let i=0;i<c.count;i++) {
    const soot=.11+.055*(.5+.5*Math.sin(p.getY(i)*3.7+p.getZ(i)*1.9)*Math.sin(p.getX(i)*7.1));
    c.setXYZ(i,soot*1.02,soot*.90,soot*.79);
  }
  return result;
}
function geometrySet(type) {
  if(cache.has(type))return cache.get(type);
  const p=VEHICLE_TYPES[type],out={}; for(const k of Object.keys(keys))out[k]=new Bucket();
  chassis(out,p,type);
  const normal={};for(const k of Object.keys(keys))normal[k]=out[k].geometry();
  Object.assign(normal,wheelGeometry(p),gunGeometry(p,type));
  const wreck={};for(const [k,g]of Object.entries(normal))wreck[k]=burned(g);
  const triangles=Object.entries(normal).reduce((s,[key,g])=>s+g.attributes.position.count/3*(key==='tire'||key==='rim'?4:1),0);
  const profile=Object.freeze({ type,label:p.label,length:p.length,width:p.width,height:p.height,bodyHeight:p.height,totalHeight:p.turretY+(type==='apc'?.20:.13),wheelbase:p.wheelbase,track:p.track,wheelRadius:p.wheelRadius,axles:Object.freeze([-p.wheelbase/2,p.wheelbase/2]),forward:'+Z',triangles,drawCalls:9,fictional:true });
  const result={normal,wreck,profile};cache.set(type,result);return result;
}

export function createGroundVehicleModel(type='patrol',{materials}={}) {
  if(!VEHICLE_TYPES[type])throw new RangeError('Unknown ground vehicle model');
  for(const key of Object.values(keys))if(!materials?.[key]?.isMaterial)throw new TypeError('Ground vehicle needs the shared carMaterials');
  const p=VEHICLE_TYPES[type],source=geometrySet(type),root=new THREE.Group(),meshes={},wheels=[];
  root.name=`ground-vehicle-${type}`;root.userData.fictional=true;
  for(const [key,material]of Object.entries(keys)) {
    const mesh=new THREE.Mesh(source.normal[key],materials[material]);mesh.name=`vehicle-${key}`;mesh.castShadow=key!=='glass'&&key!=='lights';mesh.receiveShadow=true;root.add(mesh);meshes[key]=mesh;
  }
  const tireMesh=new THREE.InstancedMesh(source.normal.tire,materials.carDark,4),rimMesh=new THREE.InstancedMesh(source.normal.rim,materials.carMetal,4);
  tireMesh.name='vehicle-tyres';rimMesh.name='vehicle-rims';
  for(const mesh of [tireMesh,rimMesh]) { mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;root.add(mesh); }
  for(const z of source.profile.axles)for(const side of [-1,1]) {
    const pivot=new THREE.Group();pivot.name=z>0?'front-wheel':'rear-wheel';pivot.position.set(side*p.track/2,p.wheelRadius,z);pivot.userData.front=z>0;pivot.userData.side=side;root.add(pivot);wheels.push(pivot);
  }
  const turret=new THREE.Group(),gun=new THREE.Group(),muzzle=new THREE.Object3D();
  turret.name='vehicle-turret';turret.position.set(0,p.turretY,p.turretZ);gun.name='vehicle-gun';muzzle.name='vehicle-muzzle';muzzle.position.set(0,0,p.muzzle);
  meshes.base=new THREE.Mesh(source.normal.base,materials.carMetal);meshes.gun=new THREE.Mesh(source.normal.gun,materials.carMetal);
  for(const mesh of [meshes.base,meshes.gun]) {mesh.castShadow=true;mesh.receiveShadow=true;}
  turret.add(meshes.base,gun);gun.add(meshes.gun,muzzle);root.add(turret);
  const matrix=new THREE.Matrix4(),spin=new THREE.Quaternion(),steering=new THREE.Quaternion(),rotation=new THREE.Quaternion(),axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),unit=new THREE.Vector3(1,1,1);
  let destroyed=false,disposed=false;
  function update(state={}) {
    if(disposed)return;
    const next=Boolean(state.destroyed);
    if(next!==destroyed) {
      destroyed=next;const geometry=next?source.wreck:source.normal;
      for(const [key,mesh]of Object.entries(meshes))mesh.geometry=geometry[key];tireMesh.geometry=geometry.tire;rimMesh.geometry=geometry.rim;
      root.userData.destroyed=next;
    }
    const steer=-clamp(state.steer,-.6,.6),wheelSpin=clamp(state.wheelSpin,-1e6,1e6);
    for(let i=0;i<wheels.length;i++) {
      const pivot=wheels[i];pivot.rotation.set(wheelSpin,pivot.userData.front?steer:0,0,'YXZ');
      const side=pivot.userData.side;spin.setFromAxisAngle(axisX,wheelSpin*side);
      steering.setFromAxisAngle(axisY,(pivot.userData.front?steer:0)+(side<0?Math.PI:0));rotation.copy(steering).multiply(spin);matrix.compose(pivot.position,rotation,unit);
      tireMesh.setMatrixAt(i,matrix);rimMesh.setMatrixAt(i,matrix);
    }
    tireMesh.instanceMatrix.needsUpdate=true;rimMesh.instanceMatrix.needsUpdate=true;
    turret.rotation.y=clamp(state.turretYaw,-Math.PI,Math.PI);gun.rotation.x=-clamp(state.turretPitch,-.3,.62);
  }
  function dispose() { if(disposed)return;disposed=true;root.parent?.remove(root);tireMesh.dispose();rimMesh.dispose();root.clear(); }
  update();
  return {root,wheels,turret,gun,muzzle,update,dispose,profile:source.profile};
}
