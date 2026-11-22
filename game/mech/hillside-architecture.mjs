import * as THREE from 'three';
import { shopUV } from './urban.js';
import { streetfront } from './streetfront.js';

const plaster=[.76,.73,.66,0,1],trim=[.64,.62,.54,0,1],metal=[.28,.32,.32,0,2];
const wood=[.39,.24,.14,0,5], dark=[.15,.17,.17,0,2], cream=[.83,.78,.64,0,6];
const canvasColors=[[.69,.37,.16,0,6],[.22,.43,.42,0,6],[.45,.27,.23,0,6]];
const uv=[[0,0],[1,0],[1,1],[0,1]];

export function alleySkin(world){
  if(world.alleySkin)return world.alleySkin;
  // 已經解碼的住宅窗格作為載入期間的立面。圖集只在進入住宅街時取用一次。
  const c=document.createElement('canvas');c.width=144;c.height=192;
  const ctx=c.getContext('2d');
  for(let i=0;i<3;i++){
    const src=world.A.fac[i+2][0].image;
    ctx.drawImage(src,0,0,src.width/6,src.height/6,i*48,0,48,48);
    ctx.drawImage(src,0,0,src.width/6,src.height/6,i*48,96,48,48);
    ctx.fillStyle='#88847b';ctx.fillRect(i*48,144,48,48);
    ctx.fillStyle=['#8d7151','#776550','#66775d'][i];ctx.fillRect(i*48,48,48,48);
  }
  const fallback=new THREE.CanvasTexture(c);fallback.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshStandardMaterial({map:fallback,roughness:.84,vertexColors:true});
  mat.name='hillside-shopfronts';
  mat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float burn; varying float chipped;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nchipped=burn;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float chipped;')
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        vec2 panel=fract(vMapUv*vec2(3.,4.));
        float shop=step(.5,vMapUv.y)*(1.-step(.75,vMapUv.y));
        float glazing=max(shop,step(.25,vMapUv.y)*step(.16,panel.x)*step(panel.x,.84)*step(.24,panel.y)*step(panel.y,.82));
        float fracture=smoothstep(.78,.97,chipped);
        diffuseColor.rgb=mix(diffuseColor.rgb*(1.-.27*chipped),vec3(.32,.27,.21),fracture);
        roughnessFactor=mix(.88,mix(.26,.43,shop),glazing*(1.-chipped));`)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        totalEmissiveRadiance+=diffuseColor.rgb*shop*(1.-chipped)*.19;`);
  };
  const loader=new THREE.TextureLoader();
  loader.load(new URL('./assets/hillside-frontages-v1.webp',import.meta.url).href,tex=>{
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
    mat.map=tex;mat.needsUpdate=true;fallback.dispose();
  },undefined,()=>{});
  return world.alleySkin=mat;
}

export function stairLanding(z0,z1,floor){
  const bays=Math.max(1,Math.round((z1-z0)/3.4));
  return (z1+z0)*.5+(floor%2?-1:1)*(z1-z0)/bays*(bays%2?1:.5);
}

// 街道座標以外牆為零，正向朝街。門窗、雨棚及招牌都從同一個開口定位。
export function dressFloor({detail,out,signs,x0,x1,z0,z1,gy,front,lot,half,i,count,base,top,shop,stepBack}){
  const edge=front>0?z1:z0,span=x1-x0,mx=(x0+x1)*.5;
  const pt=([x,y,s])=>[x,gy+y,edge+front*s];
  const emit=(a,b,y,h,s,t,col)=>detail(a,b,y,h,Math.min(edge+front*s,edge+front*t),Math.max(edge+front*s,edge+front*t),col);
  function sheet(points,col){
    const p=points.map(pt),a=new THREE.Vector3(...p[0]),b=new THREE.Vector3(...p[1]),c=new THREE.Vector3(...p[2]);
    out.quad(...p,b.sub(a).cross(c.sub(a)).normalize().toArray(),uv,col);
  }
  function sign(points,n,id,horizontal){
    signs.quad(...points.map(pt),n,shopUV(id,horizontal),[1,1,1]);
  }
  const outer=half?x1:x0,inside=half?-1:1;
  if(!i){
    // 一樓玻璃退入柱列，招牌與斜棚分開；門洞踏階延伸到整排店窗下方。
    emit(x0,x1,-.9,.16,-.92,.64,trim);
    for(let a=x0+.1;a<x1-.12;a+=1.68){
      const b=Math.min(a+1.65,x1-.1);
      emit(a,b,-.10,.105,.66,2.05,[.53,.50,.43,0,3]);
    }
    emit(x0+.10,x1-.10,-.12,.12,2.07,2.21,trim);
    emit(x0+.16,x1-.16,.16,.27,-.83,.28,plaster);
    const bays=Math.max(1,Math.round(span/3.4)),dw=span/bays,door=half?bays-1:0;
    for(let j=0;j<=bays;j++){
      const x=x0+dw*j;
      emit(Math.max(x0,x-.105),Math.min(x1,x+.105),.24,top-.12,-.72,.09,shop===1?wood:trim);
      if(j===bays)break;
      const a=x+.11,b=x+dw-.11;
      if(j===door){
        const doorX=(a+b)*.5;
        emit(doorX-.045,doorX+.045,.27,2.44,-.56,-.49,wood);
        emit(doorX+.18,doorX+.22,1,1.43,-.48,-.40,metal);
        emit(a,b,2.43,2.52,-.65,-.49,wood);
      } else {
        emit(a,b,.24,.63,-.75,-.29,shop===0?wood:trim);
        emit(a-.04,b+.04,.62,.69,-.66,-.21,metal);
      }
    }
    emit(x0,x1,2.85,top+.04,-.77,.20,shop===1?wood:plaster);
    const a=x0+.15,b=x1-.15;
    if(shop!==1){
      const strips=shop===0?Math.max(3,Math.round(span/1.05)):1;
      for(let k=0;k<strips;k++){
        const l=a+(b-a)*k/strips,r=a+(b-a)*(k+1)/strips;
        const color=shop===0&&k%2?cream:canvasColors[shop];
        let roof=[[l,3.05,.16],[r,3.05,.16],[r,2.60,1.43],[l,2.60,1.43]];
        if(front>0)roof.reverse();sheet(roof,color);
        let lip=[[l,2.40,1.43],[r,2.40,1.43],[r,2.60,1.43],[l,2.60,1.43]];
        if(front<0)lip.reverse();sheet(lip,color);
      }
    }else{
      emit(a,b,2.86,3.02,.12,1.12,wood);
      for(let k=0;k<5;k++){
        const l=mx+(k-2.5)*.48;
        emit(l,l+.455,2.12+(k%2)*.045,2.83,.49,.54,canvasColors[1]);
      }
    }
    const sw=Math.min(5.5,span*.52);
    if(shop===2){
      for(const x of [mx-.82,mx+.82]){
        emit(x-.52,x+.52,.26,.66,.16,.72,wood);
        emit(x-.48,x+.48,.645,.675,.19,.69,[.22,.17,.12,0,5]);
        for(let k=0;k<17;k++){
          const a=k*2.40,r=.16+.13*Math.sin(k*.87);
          const X=x+.31*Math.sin(k*3.7),Z=.45+.13*Math.cos(k*2.3),Y=.77+.23*Math.cos(k*4.1);
          const u=r*Math.cos(a),v=r*Math.sin(a),dx=.063*Math.sin(a),dz=-.063*Math.cos(a);
          const tip=[X+u,Y+.08,Z+v],left=[X+u*.54+dx,Y,Z+v*.54+dz],right=[X+u*.54-dx,Y,Z+v*.54-dz];
          const pts=[[X,.66,Z],left,tip,right];if(front>0)pts.reverse();
          sheet(pts,k%4?[.24,.36,.18,0,6]:[.55,.41,.18,0,6]);
        }
      }
    }else{
      emit(mx-sw/2-.10,mx+sw/2+.10,3.07,3.82,.11,.30,dark);
      sign([[mx-front*sw/2,3.12,.32],[mx+front*sw/2,3.12,.32],[mx+front*sw/2,3.77,.32],[mx-front*sw/2,3.77,.32]],[0,0,front],shop,true);
      if((lot+half)%2===0){
        const x=outer+inside*.70;
        emit(x-.055,x+.055,3.94,4.03,.08,1.95,metal);
        emit(x-.08,x+.08,3.18,3.91,.32,1.83,cream);
        for(const dir of [-1,1]){
          const X=x+dir*.086,ss=dir*front>0?[1.80,.35]:[.35,1.80];
          sign([[X,3.23,ss[0]],[X,3.23,ss[1]],[X,3.85,ss[1]],[X,3.85,ss[0]]],[dir,0,0],shop,true);
        }
      }
    }
    // 側門的鐵捲門只遮住一個開間，其餘櫥窗仍有室內陳列。
    if((lot+half)%4===1){
      const a=x0+dw*(door===0?1:0)+.12,b=a+dw-.24;
      emit(a,a+.07,.27,2.73,-.31,-.22,metal);
      emit(b-.07,b,.27,2.73,-.31,-.22,metal);
      emit(a-.06,b+.06,2.73,2.91,-.27,.07,cream);
    }
    streetfront(x0,x1,true,emit,{seed:lot*.74+half*.27});
  }else{
    const balcony=(lot+i+half)%4!==1&&lot%3!==0;
    const l=x0+span*(half?.10:.05),r=x1-span*((lot+i)%2?.20:.07),depth=1.05+(lot%2)*.32;
    if(balcony){
      emit(l,r,base-.23,base+.07,-.23,depth,trim);
      if((lot+half)%2===0){
        emit(l,r,base+.07,base+.76,depth-.14,depth,plaster);
        emit(l,r,base+.76,base+.82,depth-.18,depth+.04,metal);
      }else{
        for(let x=l+.08;x<r;x+=.67)emit(x,x+.048,base+.07,base+.96,depth-.065,depth,metal);
        emit(l,r,base+.31,base+.36,depth-.055,depth+.015,metal);
      }
      emit(l,r,base+.95,base+1.04,depth-.07,depth+.035,metal);
      for(const end of [l,r-.10])emit(end,end+.10,base+.08,base+.94,0,depth,trim);
    }
    if((i+lot+half)%3===0){
      const a=x0+span*.70;
      emit(a,a+1.02,base+.91,base+1.57,.035,.43,cream);
      const cx=a+.36,cy=base+1.24;
      for(let k=0;k<10;k++){
        const ray=t=>[cx+.235*Math.cos(t),cy+.235*Math.sin(t),.436];
        const A=k*Math.PI/5,B=A+Math.PI/5,pts=[[cx,cy,.436],ray(A),ray(B),[cx,cy,.436]];
        if(front<0)pts.reverse();sheet(pts,dark);
      }
      for(let j=0;j<5;j++)emit(cx-.21,cx+.21,cy-.16+j*.075,cy-.142+j*.075,.441,.46,metal);
      for(let j=0;j<3;j++)emit(a+.66,a+.93,base+1.16+j*.085,base+1.19+j*.085,.43,.45,metal);
      emit(a+.11,a+.22,base+.77,base+.91,.05,.37,metal);
    }
    if(stepBack)emit(x0,x1,base+.12,base+.22,.15,1.38,trim);
  }
  const pipe=outer+inside*.34;
  emit(pipe-.062,pipe+.062,base-.13,top+.01,.09,.22,metal);
  emit(pipe-.10,pipe+.10,base+.58,base+.66,.07,.23,dark);
  // 可從側巷看見的折返樓梯。踏板及立板連為同一網格，只露出必要的面。
  if(i<count-1&&(lot+half)%3===2){
    const y=base+.18,side=half?1:-1;
    const lower=stairLanding(z0,z1,i),upper=stairLanding(z0,z1,i+1),direction=Math.sign(upper-lower);
    const start=lower+direction*.45,end=upper-direction*.45,step=(end-start)/12;
    const u=outer+side*.04,v=outer+side*1.30;
    const put=(pts,n,col)=>out.quad(...pts,n,uv,col);
    const deck=(zA,zB,h)=>put([[Math.min(u,v),gy+h,Math.max(zA,zB)],[Math.max(u,v),gy+h,Math.max(zA,zB)],[Math.max(u,v),gy+h,Math.min(zA,zB)],[Math.min(u,v),gy+h,Math.min(zA,zB)]],[0,1,0],metal);
    for(let j=0;j<12;j++){
      const z=start+j*step,h=y+(top-base)*(j+1)/12;
      deck(z,z+step,h);
      let pts=[[u,gy+h-(top-base)/12,z],[v,gy+h-(top-base)/12,z],[v,gy+h,z],[u,gy+h,z]];
      if(side*Math.sign(step)>0)pts.reverse();put(pts,[0,0,-Math.sign(step)],dark);
    }
    deck(lower-direction*.56,start,y);deck(end,upper+direction*.56,top+.18);
    for(let j=0;j<=4;j++){
      const z=start+(end-start)*j/4,h=y+(top-base)*j/4;
      detail(Math.min(v,v-side*.05),Math.max(v,v-side*.05),h,h+1,z-.035,z+.035,metal);
    }
    for(const h of [0,.96]){
      const H=gy+y+h,T=gy+top+.18+h,pts=[[v,H,start],[v,T,end],[v,T+.085,end],[v,H+.085,start]];
      if(side*Math.sign(step)>0)pts.reverse();put(pts,[side,0,0],metal);
    }
  }
}

// 住宅街內的常設掩體沿用原碰撞外框。設備棟的檢修開口及擋土牆的洩水口分開建模。
export function dressServiceWalls({x,z,w,d,h,type},gy,skin,details,box){
  const solid=(a,b,c,e,f,g,col)=>box(details,a,b,gy+c,gy+e,f,g,col,4);
  for(const side of [-1,1]){
    const Z=z+side*d*.5;
    const field=(a,b,c,e,near,far,col)=>solid(a,b,c,e,Math.min(Z+side*near,Z+side*far),Math.max(Z+side*near,Z+side*far),col);
    if(type===0){
      for(let a=x-w*.38;a<x+w*.5;a+=3.1){
        field(a,a+.11,.12,h-.38,-.02,.15,trim);
        for(const y of [1.2,4.2])field(a+.65,a+.93,y,y+.22,.02,.16,dark);
      }
    }else{
      const plane=(cx,y,width,height,col,row)=>{
        const at=(u,v)=>[cx+side*u,gy+y+v,Z+side*.18],l=-width*.5,r=width*.5;
        skin.quad(at(l,0),at(r,0),at(r,height),at(l,height),[0,0,side],
          [[.012,.012],[.988,.012],[.988,.988],[.012,.988]].map(([u,v])=>[(col+u)/3,(row+v)/4]),[.84,.85,.82]);
      };
      plane(x-w*.19,.02,3.65,3.55,0,0);
      field(x-w*.19-1.50,x-w*.19+1.5,3.52,3.72,.03,1.02,metal);
      const clerestory=h*.55;
      for(let j=0;j<2;j++)plane(x+(j-.5)*w*.45,clerestory,w*.405,3.4,type===2?1:0,1);
      field(x-w*.48,x+w*.48,clerestory+.02,clerestory+.17,.02,.36,trim);
      field(x+w*.34,x+w*.34+.13,.15,h-.52,.08,.22,metal);
      field(x+w*.08,x+w*.34,.72,1.54,.06,.33,metal);
    }
  }
}
