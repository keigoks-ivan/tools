// 秋季神戶共用枝葉：程式生成 512 圖集，沒有下載、粒子、風場或額外照明。
import * as THREE from 'three';
import { fieldTreeGeometry, fieldLeafMaterial } from './fieldart.js';

const palettes = [['#b94822','#dd8735','#b68c36'],['#932a20','#cf5425','#ba762a']];
function maple(ctx,x,y,size,angle,color) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();
  const outline=[[-.09,.48],[-.48,.27],[-.30,.08],[-.62,-.23],[-.27,-.18],[-.32,-.64],[-.09,-.40],[0,-.87],[.10,-.4],[.32,-.64],[.27,-.18],[.62,-.23],[.30,.08],[.48,.27],[.09,.48]];
  outline.forEach(([a,b],i)=>i?ctx.lineTo(a*size,b*size):ctx.moveTo(a*size,b*size));ctx.closePath();ctx.fill();
  if(size>9){ctx.strokeStyle='rgba(76,42,20,.32)';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(0,size*.52);ctx.lineTo(0,-size*.7);ctx.stroke();}
  ctx.restore();
}
let shared = null;
let canopy = null;
// 遠山林冠的高度、樹種與明暗共用一張 512 圖；樹冠約五公尺，不增加遠樹模型。
export function forestCanopy() {
  if(canopy)return canopy;
  const S=512,px=new Uint8Array(S*S*4),radii=[],random=(()=>{let seed=527;return()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);})();
  for(let j=0;j<24;j++)for(let i=0;i<24;i++)radii.push([(i+.2+random()*.6)*S/24,(j+.2+random()*.6)*S/24,10+random()*9,72+random()*175,128+random()*110]);
  for(const [cx,cy,r,species,tone]of radii)for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++) {
    const d=((x-cx)**2+(y-cy)**2)/(r*r);if(d>=1)continue;
    const k=(((y+S)%S)*S+(x+S)%S)*4,h=44+Math.sqrt(1-d)*190;
    if(h>px[k]){px[k]=h;px[k+1]=species;px[k+2]=tone;}
  }
  for(let i=0;i<px.length;i+=4){if(!px[i]){px[i]=32;px[i+1]=100;px[i+2]=120;}px[i+3]=255;}
  canopy=new THREE.DataTexture(px,S,S);canopy.name='kobe-forest-canopy';canopy.wrapS=canopy.wrapT=THREE.RepeatWrapping;
  canopy.magFilter=THREE.LinearFilter;canopy.minFilter=THREE.LinearMipmapLinearFilter;canopy.generateMipmaps=true;canopy.anisotropy=4;canopy.needsUpdate=true;return canopy;
}
export function autumnFoliage() {
  if(shared)return shared;
  if(typeof document==='undefined')return {material:fieldLeafMaterial(null),depth:fieldLeafMaterial(null,true)};
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
  let seed=173;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let tile=0;tile<4;tile++) {
    const ox=tile%2*256,oy=Math.floor(tile/2)*256,colors=palettes[tile%2];
    ctx.save();ctx.beginPath();ctx.rect(ox+3,oy+3,250,250);ctx.clip();
    if(tile<2) {
      for(let i=0;i<6;i++)maple(ctx,ox+52+i%3*73,oy+72+Math.floor(i/3)*105,48+random()*12,random()*6.28,colors[i%3]);
      ctx.restore();continue;
    }
    // 細枝與有缺口的冠緣；每張卡片含多片有七裂輪廓的楓葉。
    for(let i=0;i<14;i++) {
      const a=i*2.399,reach=70+random()*39;
      ctx.strokeStyle='rgba(73,50,32,.65)';ctx.lineWidth=1+random();ctx.beginPath();ctx.moveTo(ox+128,oy+157);ctx.lineTo(ox+128+Math.cos(a)*reach,oy+118+Math.sin(a)*reach);ctx.stroke();
    }
    for(let i=0;i<420;i++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random())*112;
      const x=ox+128+Math.cos(a)*r,y=oy+128+Math.sin(a)*r*(.82+random()*.18),s=6+random()*7;
      maple(ctx,x,y,s,random()*6.28,colors[Math.floor(random()*3)]);
    }
    ctx.restore();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;map.name='kobe-autumn-leaves';
  shared={map,material:fieldLeafMaterial(map),depth:fieldLeafMaterial(map,true)};
  return shared;
}

// 固定位置、兩個實例批次；不參與 AI、碰撞或每幀更新。
export function buildAutumnTrees(scene, points, height = () => 0) {
  const {material,depth}=autumnFoliage(),meshes=[],dummy=new THREE.Object3D();
  for(let variant=0;variant<2;variant++) {
    const sites=points.filter((p,i)=>i%2===variant);if(!sites.length)continue;
    const mesh=new THREE.InstancedMesh(fieldTreeGeometry(false,variant),material,sites.length);
    mesh.name='kobe-autumn-trees';mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depth;mesh.userData.noAO=true;
    sites.forEach(([x,z,scale=.7],i)=>{
      dummy.position.set(x,height(x,z)-.04,z);dummy.rotation.set(0,i*2.399+variant,0);dummy.scale.set(scale,scale*(.92+.08*Math.sin(i*7)),scale);dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);const t=.8+.12*Math.sin(x*.7+z*.3);mesh.setColorAt(i,new THREE.Color(t,t*.95,t*.85));
    });
    mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
  // 零動畫落葉：葉片沿樹穴與路緣堆積，單一小網格；沒有每片葉子的物件。
  const pos=[],uv=[],col=[],normal=[];
  points.forEach(([x,z,scale=.7],i)=>{
    for(let k=0;k<16;k++) {
      const a=k*2.399+i,r=.7+(k%5)*.38*scale,cx=x+Math.cos(a)*r,cz=z+Math.sin(a)*r,size=.28+(k%3)*.09,y=height(cx,cz)+.022+k*.0001;
      const pts=[[cx-size,y,cz+size],[cx+size,y,cz+size],[cx+size,y,cz-size],[cx-size,y,cz-size]],u=(k%2)*.5,v=.5;
      for(const n of [0,1,2,0,2,3]) {
        pos.push(...pts[n]);normal.push(0,1,0);uv.push(u+.003+(n===1||n===2?.494:0),v+.003+(n>=2?.494:0));col.push(.68,.61,.52);
      }
    }
  });
  if(pos.length) {
    const g=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',pos,3],['normal',normal,3],['uv',uv,2],['color',col,3]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
    g.setAttribute('leaf',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3).fill(1),1));
    const leaves=new THREE.Mesh(g,material);leaves.name='kobe-autumn-litter';leaves.receiveShadow=true;leaves.userData.noAO=true;scene.add(leaves);meshes.push(leaves);
  }
  return {meshes,count:points.length};
}
