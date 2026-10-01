// 戶外場地的共用靜態幾何；換關時組裝，樹與岩塊以實例繪製。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
const noise = new ImprovedNoise();
function colored(g, color, foliage = false) {
  if(g.index) g=g.toNonIndexed();
  const p=g.attributes.position,c=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++) {
    const shade=foliage ? 0.8+0.22*Math.max(0,p.getY(i)/12)+noise.noise(p.getX(i)*1.8,p.getY(i)*1.5,p.getZ(i)*1.8)*0.15 : 1;
    c.set(color.map(v=>v*shade),i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(c,3));
  g.setAttribute('leaf',new THREE.BufferAttribute(new Float32Array(p.count).fill(foliage?1:0),1));return g;
}
function branch(a,b,radius) {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),d=end.clone().sub(start);
  const g=new THREE.CylinderGeometry(radius*.35,radius,d.length(),6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
  return colored(g.translate(...start.add(end).multiplyScalar(.5).toArray()),[.075,.052,.033]);
}
export function fieldTreeGeometry(pine = true) {
  const parts=[branch([0,0,0],[.2,pine?10.4:9.7,0],pine?.32:.42)];
  const card=(pts,variant)=>{
    const g=new THREE.BufferGeometry(),pos=[],uv=[],corners=[[0,0],[1,0],[1,1],[0,1]],x=(variant%2)*.5,y=variant<2?.5:0;
    for(const i of [0,1,2,0,2,3]){pos.push(...pts[i]);uv.push(x+.003+corners[i][0]*.494,y+.003+corners[i][1]*.494);}
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    for(let i=0;i<g.attributes.normal.count;i++){const n=new THREE.Vector3(pos[i*3]*.12,.85,pos[i*3+2]*.12).normalize();g.attributes.normal.setXYZ(i,n.x,n.y,n.z);}
    parts.push(colored(g,[.78,.83,.70],true));
  };
  if(pine) {
    for(let level=0;level<8;level++) {
      const y=3.2+level*.95,reach=3.7-level*.39;
      for(let b=0;b<9;b++) {
        const a=b/9*Math.PI*2+level*.71+Math.sin(b*7.3+level)*.16,cs=Math.cos(a),sn=Math.sin(a),spread=reach*(.86+.18*Math.sin(b*4.1+level*2.7));
        const pt=(d,side,h)=>[cs*d-sn*side,y+h,sn*d+cs*side];
        card([pt(.1,-reach*.4,.65),pt(spread,-reach*.4,-.7),pt(spread,reach*.4,-.7),pt(.1,reach*.4,.65)],(b+level)%2);
      }
    }
  } else {
    for(let i=0;i<10;i++) {
      const a=i*2.399,dist=i<7?2.0:1.0,y=6.1+(i%4)*1.25,x=Math.cos(a)*dist,z=Math.sin(a)*dist,size=1.9+(i%3)*.2;
      parts.push(branch([.1,3.4+(i%3),0],[x,y,z],.13));
      for(let axis=0;axis<3;axis++) {
        const t=a+axis*Math.PI/3,dx=Math.cos(t)*size,dz=Math.sin(t)*size;
        card([[x-dx,y-size*.7,z-dz],[x+dx,y-size*.7,z+dz],[x+dx,y+size*.7,z+dz],[x-dx,y+size*.7,z-dz]],2+i%2);
      }
    }
  }
  // 枝幹與剪影葉片合在同一個網格，沿用實例繪製。
  const g=mergeVertices(mergeGeometries(parts));g.computeBoundingSphere();return g;
}
export function fieldRockGeometry() {
  const g=new THREE.IcosahedronGeometry(1,2),p=g.attributes.position;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),s=1+noise.noise(x*3.1,y*2.6,z*3.1)*.22;
    p.setXYZ(i,x*s,(y+1)*.55*(.9+noise.noise(x*4,9,z*4)*.12),z*s);
  }
  const out=mergeVertices(g);out.computeVertexNormals();out.computeBoundingSphere();return out;
}

export function fieldArchitecture(S, profile, H, box, face, tank) {
  const {x0,x1,z0,z1}=S,w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2;
  const stone=profile==='badlands'?[.56,.49,.38,0,1]:[.48,.51,.49,0,1],metal=[.23,.28,.29,0,2],dark=[.065,.09,.10,0,4];
  const panel=[.53,.57,.55,0,2],rib=[.32,.36,.36,0,2];
  box(x0,x1,0,.9,z0,z1,stone);
  if(profile==='airfield' && !S.target) {
    const wall=H*.55,rise=H-wall;
    box(x0,x1,.9,wall,z0,z1,panel);
    // 拱頂機庫：沿跨度分成十二條鋼板，端面封閉、滑門仍保留碰撞。
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI,b=(i+1)/12*Math.PI;
      const ax=cx-Math.cos(a)*w/2,bx=cx-Math.cos(b)*w/2,ay=wall+Math.sin(a)*rise,by=wall+Math.sin(b)*rise;
      face([ax,ay,z0],[ax,ay,z1],[bx,by,z1],[bx,by,z0],i%3?panel:rib);
      for(const z of [z0,z1]) {
        const pts=[[ax,wall,z],[bx,wall,z],[bx,by,z],[ax,ay,z]];if(z===z0)pts.reverse();face(...pts,panel);
      }
    }
    box(cx-w*.34,cx+w*.34,.2,wall*.94,z1+.04,z1+.1,dark);
    for(let x=cx-w*.34;x<=cx+w*.34;x+=w*.17)box(x-.1,x+.1,.2,wall*.94,z1+.11,z1+.24,metal);
  } else if(profile==='fortress') {
    // 斜收的混凝土掩體與厚屋簷，避免要塞仍像倉庫。
    box(x0+1.4,x1-1.4,.9,H-1.1,z0+1.2,z1-1.2,stone);
    face([x0,.9,z1],[x1,.9,z1],[x1-1.4,H-1.1,z1-1.2],[x0+1.4,H-1.1,z1-1.2],stone);
    face([x1,.9,z0],[x0,.9,z0],[x0+1.4,H-1.1,z0+1.2],[x1-1.4,H-1.1,z0+1.2],stone);
    box(x0-.5,x1+.5,H-1.1,H,z0-.5,z1+.5,stone);
    for(let x=x0+3;x<x1-2;x+=6)box(x,x+3.5,H*.57,H*.69,z1-1.13,z1-1.05,dark);
    box(cx-2.8,cx+2.8,0,H*.52,z1-1.04,z1-.94,metal);
  } else {
    const industrial=profile==='depot',wall=industrial?H-3:H-2.5;
    box(x0,x1,.9,wall,z0,z1,panel);
    if(industrial) {
      for(let i=0;i<3;i++) {
        const a=z0+i*d/3,b=a+d/3;
        face([x0,wall,a],[x0,H,b],[x1,H,b],[x1,wall,a],metal);
        face([x0,H,b],[x0,wall,b],[x1,wall,b],[x1,H,b],dark);
      }
    } else {
      face([x0-.6,wall,z1+.6],[cx,H,z1+.6],[cx,H,z0-.6],[x0-.6,wall,z0-.6],metal);
      face([cx,H,z1+.6],[x1+.6,wall,z1+.6],[x1+.6,wall,z0-.6],[cx,H,z0-.6],metal);
      for(const z of [z0,z1]) {const pts=[[x0,wall,z],[x1,wall,z],[cx,H,z],[cx,H,z]];if(z===z0)pts.reverse();face(...pts,panel);}
    }
    for(let x=x0+4;x<x1-2;x+=6) {
      box(x-.13,x+.13,.9,wall,z1,z1+.32,rib);
      box(x-1.25,x+1.25,wall*.62,wall*.82,z1+.03,z1+.12,dark);
    }
    box(cx-w*.21,cx+w*.21,.15,wall*.56,z1+.1,z1+.24,metal);
    box(cx-w*.23,cx+w*.23,wall*.56,wall*.56+.25,z1,z1+2.4,rib);
    if(industrial) {
      for(let x=x0+3;x<x1-1;x+=8) {
        box(x,x+.25,.8,wall,z0-.35,z0,rib);
        box(x,x+5,wall-3,wall-1,z0-.1,z0-.02,dark);
      }
      tank(cx+w*.26,cz,H,2.2,3.8);
    }
  }
  // 卸貨月台、護欄、管線與配電櫃提供尺度，同樓體一起破壞。
  if(profile==='depot'||profile==='airfield') {
    const wall=profile==='airfield'?H*.55:H-3;
    box(cx-w*.28,cx+w*.28,0,.75,z1+.3,z1+4,stone);
    for(let step=0;step<3;step++)box(cx+w*.28,cx+w*.28+1.4,0,.75-step*.2,z1+step*.6,z1+4,stone);
    for(const side of [-1,1]) {
      const x=cx+side*w*.38;
      box(x-1.1,x+1.1,0,2.8,z1+.7,z1+2.2,metal);
      box(x-1.25,x+1.25,2.8,3.05,z1+.5,z1+2.4,rib);
      for(let y=.5;y<2.5;y+=.3)box(x-.8,x+.8,y,y+.08,z1+2.21,z1+2.31,dark);
    }
    box(x0+2,x0+2.4,wall+.5,wall+1,z0+2,z1-2,metal);
    for(let z=z0+3;z<z1-1;z+=6)box(x0+1.7,x0+2.7,wall,wall+.6,z-.15,z+.15,rib);
    for(let x=cx-w*.26;x<cx+w*.26;x+=4) {box(x-.1,x+.1,.75,2.4,z1+3.7,z1+3.9,metal);box(x,x+3.8,2.2,2.32,z1+3.7,z1+3.9,metal);}
  }
  // 固定散熱百葉、排水管及檢修梯都寫入樓體區段，摧毀時一起消失。
  for(let y=H*.25;y<H*.55;y+=.45)box(x1+.03,x1+.14,y,y+.11,cz-2.5,cz+2.5,metal);
  for(let y=1;y<H-.8;y+=.65)box(x0+.7,x0+1.8,y,y+.09,z0-.32,z0-.16,metal);
  box(x0+.63,x0+.73,.5,H,z0-.34,z0-.2,metal);box(x0+1.77,x0+1.87,.5,H,z0-.34,z0-.2,metal);
}

export function fieldLeafMaterial(texture, depth = false) {
  const mat=depth ? new THREE.MeshDepthMaterial({map:texture,alphaTest:.42,side:THREE.DoubleSide,depthPacking:THREE.RGBADepthPacking})
    : new THREE.MeshStandardMaterial({map:texture,alphaTest:.42,side:THREE.DoubleSide,vertexColors:true,roughness:1});
  mat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float leaf; varying float vFieldLeaf;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFieldLeaf=leaf;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFieldLeaf;').replace('#include <map_fragment>','if(vFieldLeaf>.5){\n#include <map_fragment>\n}');
    if(!depth) sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nif(vFieldLeaf>.5) normal*=faceDirection;');
  };
  mat.customProgramCacheKey=()=> 'field-leaves-v2'; return mat;
}

export function fieldRadar(x,z,h,face,box,communications=false) {
  const metal=[.33,.38,.40,0,2],dish=[.65,.68,.66,0,2];
  const beam=(a,b,width=.12)=>{
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),dir=B.clone().sub(A).normalize();
    const right=new THREE.Vector3().crossVectors(dir,Math.abs(dir.y)>.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0)).normalize().multiplyScalar(width/2);
    const up=new THREE.Vector3().crossVectors(dir,right).normalize().multiplyScalar(width/2);
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>right.clone().multiplyScalar(a).addScaledVector(up,b));
    for(let i=0;i<4;i++){const j=(i+1)%4;face(A.clone().add(corners[i]).toArray(),B.clone().add(corners[i]).toArray(),B.clone().add(corners[j]).toArray(),A.clone().add(corners[j]).toArray(),metal);}
  };
  if(communications) {
    const at=(sx,sz,y)=>[x+sx*(1.4-y*.05),h+y,z+sz*(1.4-y*.05)];
    for(const [sx,sz] of [[1,1],[-1,1],[-1,-1],[1,-1]])beam(at(sx,sz,0),at(sx,sz,19),.24);
    for(let y=0;y<18;y+=3)for(const [a,b] of [[[1,1],[-1,1]],[[-1,1],[-1,-1]],[[-1,-1],[1,-1]],[[1,-1],[1,1]]])beam(at(...a,y),at(...b,y+3));
    for(const sx of [-1,1]) {beam([x,h+15,z],[x+sx*3,h+15,z]);box(x+sx*3-.3,x+sx*3+.3,h+13,h+17,z-.3,z+.3,dish);}
  } else {
    box(x-.3,x+.3,h,h+8,z-.3,z+.3,metal);
    const center=[x,h+9,z+1];
    const pt=(r,a)=>[x+Math.cos(a)*r,h+9+Math.sin(a)*r,z+1+r*r/10];
    for(let i=0;i<16;i++) {
      const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2;
      face(center,pt(2,a),pt(2,b),pt(2,b),dish);
      face(pt(2,a),pt(4.8,a),pt(4.8,b),pt(2,b),dish);
    }
    beam([x,h+9,z+1],[x,h+9,z+5],.14);
    for(const a of [0,Math.PI*2/3,Math.PI*4/3])beam(pt(4.8,a),[x,h+9,z+5],.08);
    box(x-.35,x+.35,h+8.7,h+9.3,z+4.9,z+5.6,metal);
  }
}

// 換場時畫一次：R 道路、G 設施整地、B 靜態接地遮蔽。共用單張貼圖，不增加逐幀通道。
export function fieldGroundMask(route, structures, contacts, createCanvas = () => document.createElement('canvas'), profile = 'forest') {
  const size=512,span=2800,scale=size/span,canvases=[];
  const point=(x,z)=>[(x+span/2)*scale,(span/2-z)*scale];
  for(let channel=0;channel<3;channel++) {
    const c=createCanvas();c.width=c.height=size;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,size,size);canvases.push(c);
    if(channel===0) {
      ctx.lineCap=ctx.lineJoin='round';
      for(const [width,gray] of [[38,45],[27,110],[18,225]]) {
        ctx.strokeStyle=`rgb(${gray},${gray},${gray})`;ctx.lineWidth=width*scale;ctx.beginPath();
        route.pts.forEach(([x,z],i)=>{const p=point(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.stroke();
      }
    } else if(channel===1) {
      for(const s of structures) {
        const [x,y]=point(s.x,s.z),w=s.target?30:48;
        const industrial=profile==='depot'||profile==='airfield',padding=industrial?56:24;
        for(let pad=padding;pad>=0;pad-=4){const gray=Math.round((industrial?255:180)*(1-pad/(padding+4)));ctx.fillStyle=`rgb(${gray},${gray},${gray})`;ctx.fillRect(x-(w/2+pad)*scale,y-(17+pad)*scale,(w+pad*2)*scale,(34+pad*2)*scale);}
      }
    } else {
      ctx.globalCompositeOperation='lighter';
      for(const o of contacts) {
        const [x,y]=point(o.x,o.z),rad=Math.max(5,o.r)*scale;
        const g=ctx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,`rgba(255,255,255,${o.tree?.5:.7})`);g.addColorStop(.35,'rgba(255,255,255,.32)');g.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);
      }
      for(const s of structures) {
        const [x,y]=point(s.x,s.z),w=s.target?30:48;
        for(const [pad,alpha] of [[10,.10],[5,.18],[1,.25]]) {ctx.fillStyle=`rgba(255,255,255,${alpha})`;ctx.fillRect(x-(w/2+pad)*scale,y-(17+pad)*scale,(w+pad*2)*scale,(34+pad*2)*scale);}
      }
    }
  }
  const out=createCanvas();out.width=out.height=size;const ctx=out.getContext('2d'),data=ctx.createImageData(size,size);
  const channels=canvases.map(c=>c.getContext('2d').getImageData(0,0,size,size).data);
  for(let i=0;i<data.data.length;i+=4){for(let c=0;c<3;c++)data.data[i+c]=channels[c][i];data.data[i+3]=255;}
  ctx.putImageData(data,0,0);return out;
}
