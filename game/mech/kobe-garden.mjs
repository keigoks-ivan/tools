// 北野の秋芝。地表専用の共通材質で、舗装や外壁のひび割れを流用しない。
import * as THREE from 'three';

let shared;
export function kitanoGardenMaterial() {
  if(shared)return shared;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,metalness:0});
  material.name='kitano-garden-grass';material.userData.tile=1;material.userData.noCast=true;
  if(typeof document==='undefined') { material.color.setHex(0x697446);shared=material;return material; }
  const S=512,c=document.createElement('canvas');c.width=c.height=S;const ctx=c.getContext('2d');
  let seed=1931;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const wrap=(x,y,r,draw)=>{
    const xs=[x],ys=[y];if(x<r)xs.push(x+S);if(x>S-r)xs.push(x-S);if(y<r)ys.push(y+S);if(y>S-r)ys.push(y-S);
    for(const xx of xs)for(const yy of ys)draw(xx,yy);
  };
  ctx.fillStyle='#697446';ctx.fillRect(0,0,S,S);
  // 芝の乾き具合は緩い面で変わる。斑点も境界を跨いで同じ形にする。
  for(let i=0;i<18;i++) {
    const x=random()*S,y=random()*S,r=48+random()*90;
    wrap(x,y,r,(xx,yy)=>{
      const g=ctx.createRadialGradient(xx,yy,0,xx,yy,r);
      g.addColorStop(0,i%4===0?'rgba(126,107,68,.27)':i%3===0?'rgba(151,139,91,.25)':'rgba(68,83,47,.20)');
      g.addColorStop(1,'rgba(105,116,70,0)');ctx.fillStyle=g;ctx.fillRect(xx-r,yy-r,r*2,r*2);
    });
  }
  ctx.globalAlpha=.17;
  for(let tone=0;tone<2;tone++) {
    ctx.fillStyle=tone?'#84905b':'#5c663d';
    for(let i=0;i<6000;i++)ctx.fillRect(random()*S,random()*S,.8,.8);
  }
  const tones=['#53673c','#667747','#7c854f','#8b8c57','#a49766'];
  ctx.lineWidth=.65;ctx.globalAlpha=.42;
  for(let tone=0;tone<tones.length;tone++) {
    ctx.strokeStyle=tones[tone];ctx.beginPath();
    const count=tone===4?850:1600;
    for(let i=0;i<count;i++) {
      const x=random()*S,y=random()*S,a=random()*Math.PI*2,h=3+random()*11,dx=Math.cos(a)*h,dy=Math.sin(a)*h;
      wrap(x,y,h,(xx,yy)=>{ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx+dx*.48-dy*.10,yy+dy*.48+dx*.10,xx+dx,yy+dy);});
    }
    ctx.stroke();
  }
  // 芝に混じる小さな土粒と褐色の落葉。芝全体を葉の敷物にしない。
  ctx.globalAlpha=.34;ctx.fillStyle='#827047';
  for(let i=0;i<260;i++){const x=random()*S,y=random()*S,r=.4+random()*.8;ctx.fillRect(x,y,r,r);}
  ctx.globalAlpha=.65;
  for(let i=0;i<18;i++) {
    const x=random()*S,y=random()*S,a=random()*Math.PI*2,r=5+random()*5;
    wrap(x,y,r*1.3,(xx,yy)=>{
      ctx.save();ctx.translate(xx,yy);ctx.rotate(a);ctx.fillStyle=i%3===0?'#8e6536':'#a17e42';ctx.beginPath();
      for(const [k,[u,v]]of [[-.08,.5],[-.43,.26],[-.25,.02],[-.58,-.22],[-.21,-.17],[-.28,-.59],[-.08,-.35],[0,-.8],[.11,-.37],[.31,-.58],[.22,-.14],[.59,-.20],[.26,.04],[.43,.27],[.09,.5]].entries())k?ctx.lineTo(u*r,v*r):ctx.moveTo(u*r,v*r);
      ctx.closePath();ctx.fill();ctx.restore();
    });
  }
  const map=new THREE.CanvasTexture(c);map.name='kobe-autumn-grass';map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.anisotropy=4;
  material.map=material.bumpMap=map;material.bumpScale=.014;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vec4 gardenPosition=vec4(position,1.0);
      #ifdef USE_INSTANCING
        gardenPosition=instanceMatrix*gardenPosition;
      #endif
      vec2 gardenUV=(modelMatrix*gardenPosition).xz/2.4;
      #ifdef USE_MAP
        vMapUv=gardenUV;
      #endif
      #ifdef USE_BUMPMAP
        vBumpMapUv=gardenUV;
      #endif`);
  };
  material.customProgramCacheKey=()=> 'kobe-garden-v1';shared=material;return material;
}
