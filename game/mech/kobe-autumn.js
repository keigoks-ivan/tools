// 秋季神戶共用枝葉：程式生成 512 圖集，沒有下載、粒子、風場或額外照明。
import * as THREE from 'three';
import { fieldTreeGeometry, fieldLeafMaterial } from './fieldart.js';

const palettes = [['#a94826','#d78e36','#bdab44','#6b7843'],['#9a352b','#c45c32','#e1b549','#6d884b']];
const siteNoise=(x,z,salt=0)=>{const n=Math.sin(x*12.9898+z*78.233+salt*37.719)*43758.5453;return n-Math.floor(n);};
export function autumnTreeTint(x,z,target=new THREE.Color()) {
  const patch=siteNoise(Math.floor(x/64),Math.floor(z/64),4),light=.88+siteNoise(x,z,8)*.20;
  const tone=patch<.28?[.79,1,.77]:patch<.64?[1,1,.80]:[1,.83,.72];
  return target.setRGB(tone[0]*light,tone[1]*light,tone[2]*light);
}
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
  for(let i=0;i<640;i++) {
    const cx=random()*S,cy=random()*S,r=8+random()*12;
    const patch=.5+.22*Math.sin(cx/51+Math.sin(cy/79))+.19*Math.cos(cy/63-cx/108);
    radii.push([cx,cy,r*(.72+random()*.48),r*(.72+random()*.55),45+patch*185,112+random()*130]);
  }
  for(const [cx,cy,rx,ry,species,tone]of radii)for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++) {
    const d=((x-cx)/rx)**2+((y-cy)/ry)**2;if(d>=1)continue;
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
      for(let i=0;i<6;i++)maple(ctx,ox+52+i%3*73,oy+72+Math.floor(i/3)*105,42+random()*18,random()*6.28,colors[i%4]);
      ctx.restore();continue;
    }
    // 細枝與有缺口的冠緣；每張卡片含多片有七裂輪廓的楓葉。
    for(let i=0;i<14;i++) {
      const a=i*2.399+.18*Math.sin(i*3.1),reach=64+random()*43;
      ctx.strokeStyle='rgba(73,50,32,.65)';ctx.lineWidth=1+random();ctx.beginPath();ctx.moveTo(ox+128,oy+157);ctx.lineTo(ox+128+Math.cos(a)*reach,oy+118+Math.sin(a)*reach);ctx.stroke();
    }
    for(let i=0;i<420;i++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random())*112*(.83+.11*Math.sin(a*3+tile)+.07*Math.cos(a*5));
      const x=ox+128+Math.cos(a)*r+(tile===3?Math.sin(a)*13:0),y=oy+128+Math.sin(a)*r*(tile===3?.78:.96),s=6+random()*8;
      const color=tile===3?(i%5<2?colors[3]:colors[1+i%2]):colors[i%23===0?3:i%7===0?2:i%2];
      maple(ctx,x,y,s,random()*6.28,color);
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
      const spread=.86+siteNoise(x,z,1)*.29,tall=.82+siteNoise(x,z,2)*.34;
      dummy.position.set(x,height(x,z)-.04,z);dummy.rotation.set(0,siteNoise(x,z,3)*Math.PI*2,0);
      dummy.scale.set(scale*spread,scale*tall,scale*(.84+siteNoise(x,z,5)*.28));dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,autumnTreeTint(x,z));
    });
    mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
  // 零動畫落葉：葉片沿樹穴與路緣堆積，單一小網格；沒有每片葉子的物件。
  const pos=[],uv=[],col=[],normal=[];
  points.forEach(([x,z,scale=.7],i)=>{
    const wind=siteNoise(x,z,11)*Math.PI*2;
    for(let k=0;k<16;k++) {
      const group=Math.floor(k/6),a=wind+group*1.37,r=(.64+group*.47)*scale;
      const along=(siteNoise(x+k,z,12)-.5)*.72*scale,across=(siteNoise(x,z+k,13)-.5)*.38*scale;
      const cx=x+Math.cos(a)*(r+along)-Math.sin(a)*across,cz=z+Math.sin(a)*(r+along)+Math.cos(a)*across;
      const size=(.23+siteNoise(x+k,z-k,14)*.19)*scale,turn=siteNoise(x-k,z+k,15)*Math.PI*2,cs=Math.cos(turn),sn=Math.sin(turn);
      const pts=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([dx,dz])=>{
        const px=cx+(dx*cs-dz*sn)*size,pz=cz+(dx*sn+dz*cs)*size;return [px,height(px,pz)+.022+k*.0001,pz];
      }),u=(k%2)*.5,v=.5;
      for(const n of [0,1,2,0,2,3]) {
        pos.push(...pts[n]);normal.push(0,1,0);uv.push(u+.003+(n===1||n===2?.494:0),v+.003+(n>=2?.494:0));col.push(.78,.74,.60);
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
