// Four small interpretive plaques. Shared atlas/materials survive scene resets; only geometry is owned.
import * as THREE from 'three';
import { JAPANESE_FONT } from './urban.js';

export const HISTORY_PLAQUE_LABELS=Object.freeze([
  Object.freeze({id:'moegi',name:'萌黄の館',date:'1903年 建築',note:'旧シャープ住宅',offset:Object.freeze([2.8,2.2])}),
  Object.freeze({id:'kazamidori',name:'風見鶏の館',date:'1909年頃 建築',note:'旧トーマス住宅',offset:Object.freeze([-2.8,.9])}),
  Object.freeze({id:'uroko',name:'うろこの家',date:'明治後期 建築',note:'大正期に移築と伝わる',offset:Object.freeze([2.8,1.2])}),
  Object.freeze({id:'tenman',name:'北野天満神社',date:'本殿・拝殿 1742年',note:'社伝：1180年創建',offset:Object.freeze([-2.55,1.1])}),
]);
const SIZE=512,CELL_W=256,CELL_H=128,PAD=3;
let atlas,plateMaterial,structureMaterial;
const instances=new WeakMap();
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const font=JAPANESE_FONT.replace(', sans-serif',', "Noto Sans TC", sans-serif');

export function historyPlaqueUV(index) {
  if(!Number.isInteger(index)||index<0||index>3)throw new RangeError('Invalid history plaque');
  const x=index%2*.5,y=1-(Math.floor(index/2)+1)*.5;
  return [[x+PAD/SIZE,y+PAD/(CELL_H*2)],[x+.5-PAD/SIZE,y+PAD/(CELL_H*2)],[x+.5-PAD/SIZE,y+.5-PAD/(CELL_H*2)],[x+PAD/SIZE,y+.5-PAD/(CELL_H*2)]];
}

export function historyPlaqueAtlas() {
  if(atlas)return atlas;
  let canvas,ctx;
  if(typeof document!=='undefined'){canvas=document.createElement('canvas');canvas.width=SIZE;canvas.height=CELL_H*2;ctx=canvas.getContext('2d');}
  const draw=()=>HISTORY_PLAQUE_LABELS.forEach((p,i)=>{
    const x=i%2*CELL_W,y=Math.floor(i/2)*CELL_H;
    ctx.fillStyle='#e6decb';ctx.fillRect(x,y,CELL_W,CELL_H);
    // Maintained stone/enamel: quiet edge wear, a clear centre and readable ink.
    ctx.fillStyle='#d4ccb8';ctx.fillRect(x,y,3,CELL_H);ctx.fillRect(x+CELL_W-3,y,3,CELL_H);
    ctx.strokeStyle='#827968';ctx.lineWidth=1;ctx.strokeRect(x+7,y+7,CELL_W-14,CELL_H-14);
    ctx.textAlign='center';ctx.textBaseline='middle';
    const text=(t,yy,size,bold=false,color='#263129')=>{ctx.fillStyle=color;let s=size;while(s>12){ctx.font=(bold?'bold ':'')+s+'px '+font;const width=ctx.measureText?.(t)?.width;if(!Number.isFinite(width)||width<=CELL_W-26)break;s--;}ctx.font=(bold?'bold ':'')+s+'px '+font;ctx.fillText(t,x+CELL_W/2,y+yy);};
    text(p.name,31,26,true);text(p.date,67,20);text(p.note,93,17);text('史実・公式資料',114,12,false,'#5c625b');
  });
  if(ctx){draw();atlas=new THREE.CanvasTexture(canvas);}
  else {const data=new Uint8Array(SIZE*CELL_H*2*4);for(let i=0;i<data.length;i+=4){data[i]=230;data[i+1]=222;data[i+2]=203;data[i+3]=255;}atlas=new THREE.DataTexture(data,SIZE,CELL_H*2);}
  atlas.name='kobe-history-four-plaques';atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;atlas.needsUpdate=true;
  if(ctx&&document.fonts) {
    const ready=document.fonts.load?Promise.all([document.fonts.load('bold 26px "Noto Sans JP"',HISTORY_PLAQUE_LABELS.map(p=>p.name+p.date+p.note).join('')+'史実公式資料'),document.fonts.load('20px "Noto Sans TC"','史実公式資料')]):Promise.resolve(document.fonts.ready);
    ready.then(()=>{draw();atlas.needsUpdate=true;}).catch(()=>{});
  }
  return atlas;
}

function materialsFor(materials) {
  if(!plateMaterial){plateMaterial=new THREE.MeshStandardMaterial({map:historyPlaqueAtlas(),roughness:.88,metalness:0});plateMaterial.name='kobe-history-plaque';}
  if(!structureMaterial){structureMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,metalness:.12});structureMaterial.name='kobe-history-plaque-support';}
  const supplied=materials?.structure||materials?.landmarkPaint||materials?.metal;
  return [plateMaterial,supplied?.vertexColors?supplied:structureMaterial];
}

function districtBasis(K) {
  const road=K.routes?.walk;if(!road||road.length<2||!road.slice(0,2).every(finite))throw new TypeError('Kitano routes.walk is required');
  const a=road[0],b=road[1],d=Math.hypot(b[0]-a[0],b[2]-a[2]);if(d<.01)throw new TypeError('Invalid Kitano route direction');
  const forward=[(b[0]-a[0])/d,0,(b[2]-a[2])/d],right=[forward[2],0,-forward[0]];
  const moegi=K.landmarks.find(l=>l.id==='moegi'),kaza=K.landmarks.find(l=>l.id==='kazamidori');
  const scale=moegi&&kaza?Math.hypot(kaza.entrance[0]-moegi.entrance[0],kaza.entrance[2]-moegi.entrance[2])/Math.hypot(30,21):1;
  if(!Number.isFinite(scale)||scale<=0)throw new TypeError('Invalid Kitano scale');return {forward,right,scale};
}
function nearestOnRoute(point,route) {
  let nearest=null,best=Infinity;
  for(let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[2]-a[2])*dz)/(length||1)));
    const p=[a[0]+dx*t,a[1]+(b[1]-a[1])*t,a[2]+dz*t],d=Math.hypot(point[0]-p[0],point[2]-p[2]);if(d<best){best=d;nearest=p;}
  }
  return nearest;
}

class Geometry {
  constructor(){this.positions=[];this.normals=[];this.colors=[];this.uv=[];}
  triangle(a,b,c,color,uv=[[0,0],[0,0],[0,0]]) {
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],d=Math.hypot(...n);
    for(const [i,p]of [a,b,c].entries()){this.positions.push(...p);this.normals.push(...n.map(v=>v/d));this.colors.push(...color);this.uv.push(...uv[i]);}
  }
  quad(a,b,c,d,color,uv){this.triangle(a,b,c,color,uv&&[uv[0],uv[1],uv[2]]);this.triangle(a,c,d,color,uv&&[uv[0],uv[2],uv[3]]);}
  build(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.computeBoundingBox();g.computeBoundingSphere();return g;}
}
const oct=(w,h,c)=>[[-w/2+c,-h/2],[w/2-c,-h/2],[w/2,-h/2+c],[w/2,h/2-c],[w/2-c,h/2],[-w/2+c,h/2],[-w/2,h/2-c],[-w/2,-h/2+c]];

export function createHistoryPlaques(scene,K,{materials,solid}={}) {
  if(!scene?.add||!K?.landmarks?.every(l=>finite(l.entrance)))throw new TypeError('History plaques need a scene and Kitano landmarks');
  let cache=instances.get(scene);if(cache?.has(K))return cache.get(K);
  const {forward,right,scale}=districtBasis(K),fronts=new Geometry(),structures=new Geometry(),items=[];
  for(const [index,label]of HISTORY_PLAQUE_LABELS.entries()) {
    const landmark=K.landmarks.find(l=>l.id===label.id);if(!landmark)continue;
    const base=landmark.entrance.map((v,i)=>v+scale*(right[i]*label.offset[0]+forward[i]*label.offset[1]));
    const floor=solid?.floorAt?.(base[0],base[2],base[1]+.2*scale)??K.heightAt?.(base[0],base[2]);if(Number.isFinite(floor)&&Math.abs(floor-base[1])<scale)base[1]=floor;
    const approach=nearestOnRoute(base,K.routes[label.id]||K.routes.walk)||landmark.entrance,dx=approach[0]-base[0],dz=approach[2]-base[2],length=Math.hypot(dx,dz),normal=length>.001?[dx/length,0,dz/length]:forward.map(v=>-v),r=[normal[2],0,-normal[0]];
    const P=(x,y,z)=>base.map((v,i)=>v+scale*(r[i]*x+(i===1?y:0)+normal[i]*z));
    const box=(x,y,z,w,h,d,col)=>{
      const a=x-w/2,b=x+w/2,lo=y-h/2,hi=y+h/2,c=z-d/2,e=z+d/2;
      for(const f of [[[a,lo,e],[b,lo,e],[b,hi,e],[a,hi,e]],[[b,lo,c],[a,lo,c],[a,hi,c],[b,hi,c]],[[a,lo,c],[a,lo,e],[a,hi,e],[a,hi,c]],[[b,lo,e],[b,lo,c],[b,hi,c],[b,hi,e]],[[a,hi,e],[b,hi,e],[b,hi,c],[a,hi,c]],[[a,lo,c],[b,lo,c],[b,lo,e],[a,lo,e]]])structures.quad(...f.map(p=>P(...p)),col);
    };
    const stone=oct(1.06,.6,.08).map(([x,z])=>[x,z]),lo=.002,hi=.23;
    for(let i=0;i<8;i++){const a=stone[i],b=stone[(i+1)%8],col=[.45+(i%3)*.018,.46+(i%3)*.015,.43+(i%3)*.015];structures.quad(P(a[0],lo,a[1]),P(b[0],lo,b[1]),P(b[0],hi,b[1]),P(a[0],hi,a[1]),col);structures.triangle(P(0,hi,0),P(b[0],hi,b[1]),P(a[0],hi,a[1]),[.56,.56,.51]);structures.triangle(P(0,lo,0),P(a[0],lo,a[1]),P(b[0],lo,b[1]),col);}
    box(0,.235,0,.72,.05,.42,[.51,.52,.47]);box(0,.72,-.05,.06,.94,.075,[.14,.18,.17]);
    for(const y of [.97,1.35])box(0,y,-.025,.6,.035,.09,[.18,.22,.20]);
    const centre=1.23,outer=oct(1.34,.70,.045),inner=oct(1.23,.59,.022),uv=historyPlaqueUV(index),U=([x,y])=>[uv[0][0]+(x/1.23+.5)*(uv[1][0]-uv[0][0]),uv[0][1]+(y/.59+.5)*(uv[3][1]-uv[0][1])];
    for(let i=0;i<8;i++) {
      const a=outer[i],b=outer[(i+1)%8],c=inner[(i+1)%8],d=inner[i];
      structures.quad(P(a[0],centre+a[1],.024),P(b[0],centre+b[1],.024),P(c[0],centre+c[1],.042),P(d[0],centre+d[1],.042),[.27,.29,.24]);
      structures.quad(P(b[0],centre+b[1],-.04),P(a[0],centre+a[1],-.04),P(a[0],centre+a[1],.024),P(b[0],centre+b[1],.024),[.16,.20,.18]);
      structures.triangle(P(0,centre,-.04),P(b[0],centre+b[1],-.04),P(a[0],centre+a[1],-.04),[.22,.25,.22]);
      fronts.triangle(P(0,centre,.043),P(d[0],centre+d[1],.043),P(c[0],centre+c[1],.043),[1,1,1],[U([0,0]),U(d),U(c)]);
    }
    const p=new THREE.Vector3(...P(0,.8,0)),pin=new THREE.Vector3(...P(0,centre,.05));
    items.push({id:label.id,historyCard:label.id,label:label.name,p,pin,base,normal,scale});
  }
  const mats=materialsFor(materials),meshes=[fronts,structures].map((g,i)=>{const m=new THREE.Mesh(g.build(),mats[i]);m.name=i?'kobe-history-plaque-supports':'kobe-history-plaques';m.castShadow=false;m.receiveShadow=false;m.userData.noAO=true;scene.add(m);return m;});
  let disposed=false;
  const result={items,meshes,material:mats[0],dispose(){if(disposed)return;disposed=true;meshes.forEach(m=>{scene.remove(m);m.geometry.dispose();});cache?.delete(K);}};
  if(!cache){cache=new Map();instances.set(scene,cache);}cache.set(K,result);return result;
}
