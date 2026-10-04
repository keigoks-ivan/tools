// 北野の保存建築。塗膜、石目、煉瓦、瓦の明度／粗さ／高さを一枚にまとめる。
import * as THREE from 'three';

const SIZE=512,CELL=256,PAD=2,SPAN=CELL-PAD*2;
export const KITANO_HERITAGE_TILES=Object.freeze({
  paint:Object.freeze({index:0,scale:Object.freeze([2.4,2.4]),roughness:.75,relief:.022}),
  stone:Object.freeze({index:1,scale:Object.freeze([1.2,.6]),roughness:.94,relief:.035}),
  brick:Object.freeze({index:2,scale:Object.freeze([.72,.34]),roughness:.90,relief:.025}),
  roof:Object.freeze({index:3,scale:Object.freeze([.8,.72]),roughness:.86,relief:.020}),
});
const wrap=(n,size)=>((n%size)+size)%size;
const hash=(x,y,s)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(s,982451653);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const smooth=t=>t*t*(3-2*t);
function noise(u,v,nx,ny,s) {
  const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
  const a=(dx,dy)=>hash(wrap(ix+dx,nx),wrap(iy+dy,ny),s);
  return (a(0,0)*(1-fx)+a(1,0)*fx)*(1-fy)+(a(0,1)*(1-fx)+a(1,1)*fx)*fy;
}
const edge=n=>Math.min(wrap(n,1),1-wrap(n,1));
const clamp=n=>Math.max(0,Math.min(1,n));
function pixels() {
  const data=new Uint8Array(SIZE*SIZE*4);
  for(let tile=0;tile<4;tile++)for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++) {
    const px=wrap(x-PAD,SPAN),py=wrap(y-PAD,SPAN),u=px/SPAN,v=py/SPAN;
    const cloud=noise(u,v,4,4,19+tile),grain=hash(px,py,31+tile)-.5;
    let tone=.963+(cloud-.5)*.038+grain*.020,rough=.94+grain*.04,height=.5+grain*.045;
    if(tile===0) {
      // 再塗装された木部と漆喰。細い水筋と塗膜の揺らぎだけを残す。
      const wash=Math.max(0,(noise(u,v,24,2,73)-.57)/.43)*noise(u,v,4,3,91);
      const fiber=Math.sin(u*Math.PI*96+noise(u,v,3,6,52)*3)*.006;
      tone-=wash*.082;tone+=fiber;rough+=wash*.04;height+=fiber*.5;
    } else if(tile===1) {
      const row=Math.floor(v*2),dx=edge(u*2+(row%2)*.5),dy=edge(v*2);
      const joint=1-Math.min(smooth(clamp(dx/.026)),smooth(clamp(dy/.023)));
      tone=.91+(cloud-.5)*.085+grain*.027-joint*.075;
      rough=.96+grain*.035;height=.53+(cloud-.5)*.08+grain*.04-joint*.26;
    } else if(tile===2) {
      const row=Math.floor(v*4),dx=edge(u*3+(row%2)*.5),dy=edge(v*4);
      const joint=1-Math.min(smooth(clamp(dx/.020)),smooth(clamp(dy/.035)));
      const block=hash(wrap(Math.floor(u*3+(row%2)*.5),3),row,117);
      tone=.93+(block-.5)*.075+grain*.023-joint*.18;
      rough=.94+grain*.035+joint*.03;height=.55+grain*.055-joint*.31;
    } else {
      const row=Math.floor(v*3),dx=edge(u*4+(row%2)*.5),dy=wrap(v*3,1);
      const joint=1-smooth(clamp(dx/.035)),lap=1-smooth(clamp(dy/.07));
      tone=.92+(cloud-.5)*.07+grain*.025-joint*.14-lap*.08;
      rough=.92+grain*.04;height=.44+dy*.12+grain*.035-joint*.16-lap*.17;
    }
    const k=((Math.floor(tile/2)*CELL+y)*SIZE+tile%2*CELL+x)*4;
    data[k]=Math.round(clamp(tone)*255);data[k+1]=Math.round(clamp(rough)*255);
    data[k+2]=Math.round(clamp(height)*255);data[k+3]=255;
  }
  return data;
}
let atlas;
export function kitanoHeritageAtlas() {
  if(atlas)return atlas;
  const data=pixels();let image;
  if(typeof document!=='undefined') {
    const c=document.createElement('canvas');c.width=c.height=SIZE;const ctx=c.getContext('2d');
    if(ctx?.createImageData&&ctx?.putImageData) {
      const d=ctx.createImageData(SIZE,SIZE);
      if(d?.data?.length===data.length){d.data.set(data);ctx.putImageData(d,0,0);image=c;}
    }
  }
  const texture=image?new THREE.CanvasTexture(image):new THREE.DataTexture(data,SIZE,SIZE);
  texture.name='kitano-maintained-heritage';texture.colorSpace=THREE.NoColorSpace;texture.flipY=false;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;
  texture.needsUpdate=true;atlas=texture;return atlas;
}

const materials=new Map();
export function kitanoHeritageMaterial(kind='paint') {
  const tile=KITANO_HERITAGE_TILES[kind];if(!tile)throw new RangeError('Invalid Kitano heritage surface');
  if(materials.has(kind))return materials.get(kind);
  const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:tile.roughness,metalness:0,map:kitanoHeritageAtlas()});
  m.name='kitano-heritage-'+kind;m.userData.tile=2.4;
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{heritageTile:{value:new THREE.Vector2(tile.index%2*CELL,Math.floor(tile.index/2)*CELL)},
      heritageScale:{value:new THREE.Vector2(...tile.scale)},heritageRelief:{value:tile.relief}});
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHeritageWorld,vHeritageNormal;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        vec4 heritagePosition=vec4(transformed,1.0);vec3 heritageNormal=objectNormal;
        #ifdef USE_INSTANCING
          heritagePosition=instanceMatrix*heritagePosition;heritageNormal=mat3(instanceMatrix)*heritageNormal;
        #endif
        vHeritageWorld=(modelMatrix*heritagePosition).xyz;vHeritageNormal=mat3(modelMatrix)*heritageNormal;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vHeritageWorld,vHeritageNormal;
      uniform vec2 heritageTile,heritageScale;uniform float heritageRelief;
      vec2 heritageProjection(){vec3 n=abs(normalize(vHeritageNormal));return (n.y>max(n.x,n.z)?vHeritageWorld.xz:vec2(n.x>n.z?vHeritageWorld.z:vHeritageWorld.x,vHeritageWorld.y))/heritageScale;}
      vec2 heritageUV(vec2 uv){return (heritageTile+vec2(2.5)+fract(uv)*252.0)/512.0;}
      vec3 heritageNormal(vec3 p,vec3 n,vec2 dh,float face){
        vec3 sx=normalize(dFdx(p)),sy=normalize(dFdy(p));vec3 r1=cross(sy,n),r2=cross(n,sx);
        float det=dot(sx,r1)*face;return normalize(abs(det)*n-sign(det)*(dh.x*r1+dh.y*r2));
      }`)
      .replace('#include <map_fragment>',`vec2 heritagePlane=heritageProjection();
        vec4 heritageSample=texture2D(map,heritageUV(heritagePlane));diffuseColor.rgb*=heritageSample.r;`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor*heritageSample.g,.45,1.0);`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float heritageH=heritageSample.b;
        vec2 heritageDx=dFdx(heritagePlane),heritageDy=dFdy(heritagePlane);
        vec2 heritageDh=heritageRelief*vec2(texture2D(map,heritageUV(heritagePlane+heritageDx)).b-heritageH,
          texture2D(map,heritageUV(heritagePlane+heritageDy)).b-heritageH);
        normal=heritageNormal(-vViewPosition,normal,heritageDh,faceDirection);`);
  };
  m.customProgramCacheKey=()=> 'kitano-heritage-v1-'+kind;
  materials.set(kind,m);return m;
}
