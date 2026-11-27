import * as THREE from 'three';
import {carGeometry} from '../env.js';
import {instancedCarMaterial} from '../car-material.js';
import {fieldMaterial,signAtlas} from '../front-scenery.mjs';
import {waterfront} from './tokyo-waterfront.mjs';
import {tokyoTraffic} from './tokyo-traffic.mjs';
import {aerialGround,distantCity} from './tokyo-distance.mjs';

const up=new THREE.Vector3(0,1,0);
const roadZ=[60,-100,-260,-420], roadX=[-640,-480,-320,-160,0,160,320,480,640];
const concrete=0xb1b2aa, curb=0xbdbbb0, dark=0x485353, metal=0x939d97;
const paint=[0x9f5442,0x71838a,0x5d776e,0x827b62,0x88483b,0xc0b79c,0x486172];
const districts=['lock','tsukuda','toyosu','rail','wakasu','aomi'];
const facadeNames=['glass','office','concrete','brick2'];
const tileWidths=[36,28.8,20.4,20.4];
const facadeCache=new WeakMap();

function facadeMaps(world){
  if(facadeCache.has(world))return facadeCache.get(world);
  const loader=typeof document==='undefined'?null:new THREE.TextureLoader();
  const maps=facadeNames.map((type,i)=>{
    const existing=world.A?.fac?.[[0,1,3,4][i]];
    if(existing?.[0])return existing;
    if(!loader)return [];
    return ['col','nor','arm'].map((kind,j)=>{
      const texture=loader.load(new URL('../zero/assets/env/fac_'+type+'_'+kind+'.webp',import.meta.url).href);
      if(!j)texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
      return texture;
    });
  });
  facadeCache.set(world,maps);
  return maps;
}

// Keep dozens of street blocks in a handful of indexed meshes; retain metre-based window and pavement UVs.
class Faces {
  constructor(material){this.material=material;this.p=[];this.uv=[];this.col=[];this.index=[];}
  quad(pts,uv,color){
    const base=this.p.length/3,c=new THREE.Color(color);
    for(let i=0;i<4;i++){this.p.push(...pts[i]);this.uv.push(...uv[i]);this.col.push(c.r,c.g,c.b);}
    this.index.push(base,base+1,base+2,base,base+2,base+3);
  }
  finish(root,name,shadow=true){
    if(!this.p.length){this.material.dispose();return;}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));
    g.setIndex(this.index);g.computeVertexNormals();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,this.material);
    mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=shadow;
    mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;root.add(mesh);
  }
}

export function buildTokyo(world,group){
  const route=world.fieldRoute,district=route.district,di=districts.indexOf(district);
  if(di<0)throw new Error('Unknown Tokyo district '+district);
  group.name='東京・'+district;
  let seed=16457+di*197;
  const rand=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  const facades=facadeMaps(world).map(([map,normalMap,roughnessMap],i)=>new Faces(new THREE.MeshStandardMaterial({
    vertexColors:true,map:map??null,normalMap:normalMap??null,roughnessMap:roughnessMap??null,
    normalScale:new THREE.Vector2(.24,.24),roughness:i===0?.54:.86,metalness:i===0?.24:.075,
  })));
  const road=new Faces(fieldMaterial(world,0xa2a5a4,.87,.035,'asphalt',true));
  const walk=new Faces(fieldMaterial(world,0xc4c1b7,.87,.035,'precast',true));

  const cube=new THREE.BoxGeometry(),round=new THREE.CylinderGeometry(1,1,1,10);
  const batches=new Map();
  function batch(key,geometry,material,ownsGeometry=false,ownsMaterial=true){
    batches.set(key,{geometry,material,ownsGeometry,ownsMaterial,matrices:[],colors:[]});
  }
  batch('solid',cube,fieldMaterial(world,0xffffff,.66,.20,'paint'),true);
  batch('stone',cube,fieldMaterial(world,0xffffff,.88,.03,'precast'));
  batch('glass',cube,new THREE.MeshStandardMaterial({roughness:.19,metalness:.50,envMapIntensity:1.25}));
  batch('pole',round,fieldMaterial(world,0xffffff,.65,.21,'paint'),true);
  batch('mark',cube,new THREE.MeshStandardMaterial({roughness:.89,metalness:0}));
  // Stamped corrugations, locking bars and corner fittings are shaded per container.
  // A stack stays a single cube per box, even on long quays with several hundred boxes.
  const cargo=new THREE.MeshStandardMaterial({roughness:.70,metalness:.25});
  cargo.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vContainer; varying vec3 vContainerN;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvContainer=position;vContainerN=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vContainer; varying vec3 vContainerN;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 p=vContainer+.5;
        if(abs(vContainerN.y)<.5){
          bool side=abs(vContainerN.z)>.5;
          float u=side?p.x:p.z;
          float rib=u*(side?25.:7.);
          float fade=1.-smoothstep(.25,.65,fwidth(rib));
          float flute=smoothstep(.10,.32,fract(rib))-smoothstep(.54,.80,fract(rib));
          float panel=smoothstep(.025,.04,p.y)*(1.-smoothstep(.96,.98,p.y));
          diffuseColor.rgb*=1.-fade*panel*(.19*flute+.06);
          float seam=abs(fract((u+.125)*4.)-.5);
          if(!side)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.27,.27,.24),fade*panel*(1.-smoothstep(.025,.07,seam))*.75);
          float corners=step(min(u,1.-u),side?.016:.052)*step(min(p.y,1.-p.y),.059);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.13,.12),corners*.7);
          diffuseColor.rgb*=.86+.14*smoothstep(0.,.32,p.y);
        }`);
  };
  batch('cargo',cube,cargo);
  const signs=[];
  const mat=new THREE.Matrix4(),scale=new THREE.Vector3(),origin=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const direction=new THREE.Vector3(),tilt=new THREE.Euler();
  function place(key,x,y,z,w,h,d,col,angle=0){
    rotation.setFromAxisAngle(up,angle);
    mat.compose(origin.set(x,y,z),rotation,scale.set(w,h,d));
    const bucket=batches.get(key);bucket.matrices.push(mat.clone());bucket.colors.push(col);
  }
  const box=(x,y,z,w,h,d,color,k='solid')=>place(k,x,y,z,w,h,d,color);
  const pole=(x,y,z,r,h,c)=>place('pole',x,y,z,r,h,r,c);
  function beam(a,b,width,col){
    direction.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const length=direction.length();
    if(length<.001)return;
    rotation.setFromUnitVectors(up,direction.divideScalar(length));
    mat.compose(origin.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2),rotation,scale.set(width,length,width));
    const batch=batches.get('solid');batch.matrices.push(mat.clone());batch.colors.push(col);
  }
  function deck(a,b,width,depth,tint){
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
    rotation.setFromEuler(tilt.set(0,-Math.atan2(dz,dx),0)).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.asin(dy/length)));
    mat.compose(origin.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2),rotation,scale.set(length,depth,width));
    const bucket=batches.get('solid');bucket.matrices.push(mat.clone());bucket.colors.push(tint);
  }
  const solid=(x,z,w,d,h,bottom)=>world.addCollider({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top:h,...(bottom===undefined?{}:{bottom})});
  const sign=(name,x,y,z,rotation,width)=>signs.push([name,x,y,z,rotation,width]);
  function ground(f,x,z,w,d,y,tint=0xffffff,scale=7){
    const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2;
    const pts=[[a,y,c],[a,y,e],[b,y,e],[b,y,c]];
    f.quad(pts,pts.map(([x,y,z])=>[x/scale,z/scale]),tint);
  }
  // Keep new structures off diagonal mission routes as well as the four parallel avenues.
  function clearLot(x,z,w,d){
    const hx=w/2+6,hz=d/2+6;
    if(route.secs?.some(s=>s.targets?.some(t=>Math.abs(x-t.x)<hx+9&&Math.abs(z-t.z)<hz+9)))return false;
    const pts=route.pts||[];
    for(let i=1;i<pts.length;i++){
      const [a,b]=pts[i-1],[c,e]=pts[i];
      let enter=0,leave=1;
      for(const [q,delta,half] of [[x-a,c-a,hx],[z-b,e-b,hz]]){
        if(Math.abs(delta)<.0001){if(Math.abs(q)>half){leave=-1;break;}}
        else {const t=(q-half)/delta,u=(q+half)/delta;enter=Math.max(enter,Math.min(t,u));leave=Math.min(leave,Math.max(t,u));}
      }
      if(enter<=leave)return false;
    }
    return true;
  }
  const roofPalette=[0x838782,0x798887,0x818081,0xa29c8f];
  function wallFaces(x,z,w,d,h,style,base=0){
    const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2;
    const bucket=facades[style],T=tileWidths[style];
    const tint=new THREE.Color().setHSL(.08+rand()*.07,.025+rand()*.08,.82+rand()*.135).getHex();
    for(const side of [[[a,0,e],[b,0,e]],[[b,0,c],[a,0,c]],[[a,0,c],[a,0,e]],[[b,0,e],[b,0,c]]]){
      const [p,q]=side;p[1]=q[1]=base;const ww=(Math.abs(q[0]-p[0])+Math.abs(q[2]-p[2]))/T;
      bucket.quad([p,q,[q[0],base+h,q[2]],[p[0],base+h,p[2]]],[[0,0],[ww,0],[ww,h/T],[0,h/T]],tint);
    }
  }
  function building(x,z,w,d,h,style,roof=0){
    wallFaces(x,z,w,d,h,style);
    const a=x-w/2,e=z+d/2;
    box(x,h+.18,z,w+.24,.36,d+.24,roofPalette[roof]);
    box(x,.42,z,w+.18,.68,d+.18,0x92938a);
    const yy=h+1.1;
    box(x-w*.21,yy,z+d*.16,w*.17,1.78,d*.20,concrete);
    if(h>20){box(x-w*.21,h+2.1,z+d*.16,w*.18,.23,d*.212,metal);pole(x+w*.24,h+1.4,z+d*.18,1.1,2.7,0x829396);}
    if(h>42){
      box(x,h+2.1,z,w*.53,3.8,d*.50,0x849397,'stone');
      for(const k of [-1,1])box(x+k*(w*.5-.36),h+.65,z,.45,.91,d,curb);
      for(const k of [-1,1])box(x,h+.65,z+k*(d*.5-.35),w,.91,.45,curb);
      if(style!==0)for(let y=5.6;y<h-2;y+=6.7){
        box(x,y,e+.36,w*.95,.48,1.33,curb);
        box(x,y+.85,e+.87,w*.91,.83,.14,0x777f79);
      }
    }else if(h<20){
      if(h>8 && w<32){
        // Compact outdoor condenser, casing and drain pipe beside an apartment balcony.
        box(x+w*.25,4.9,e+.53,w*.36,.30,1.53,curb);
        box(x+w*.25,5.48,e+1.17,w*.36,.91,.15,metal);
        box(x+w*.33,5.41,e+.53,1.1,.70,.60,0xc9c8b7);
      }
      // Eaves, rain leaders and split-level shop awnings throw shadows at pedestrian scale.
      box(x,h-.19,e+.38,w+.65,.22,1.32,0x687571);
      box(a+.24,h*.48,e+.18,.15,h*.93,.16,metal);
      box(x,3.25,e+.61,w*.70,.30,1.72,[0x788c83,0x92755f,0x697e88][roof%3]);
      if(w<24){
        box(a+1.4,1.6,e+.31,1.32,2.95,.25,0x526465,'glass');
        // Ground-floor shop fronts interrupt the apartment window grid.
        box(x,1.46,e+.14,w*.65,2.65,.22,0x556467,'glass');
        for(const k of [-1,0,1])box(x+k*w*.23,1.46,e+.28,.10,2.66,.13,curb);
        if(signs.length<24 && Math.abs(z)<428 && Math.abs(x)<540 && rand()>.52){
          sign(['青果店','文具店','自転車店','精肉店'][roof],x,3.65,e+.25,0,Math.min(8.3,w*.68));
        }
      }
    }
    solid(x,z,w,d,h+.38);
  }

  function container(x,y,z,w,h,d,index,collide=true){
    const col=paint[index%paint.length];
    box(x,y+h/2,z,w,h,d,col,'cargo');
    if(collide)solid(x,z,w,d,y+h);
  }
  function shed(x,z,w,d,h){
    const col=[0x9eaaa7,0x969d98,0xb7b5a4][Math.floor(rand()*3)];
    box(x,h/2,z,w,h,d,col,'stone');
    for(const s of [-1,1]){
      const cell=batches.get('solid');
      rotation.setFromEuler(tilt.set(0,0,-s*.12));
      mat.compose(origin.set(x+s*w/4,h+w*.014,z),rotation,scale.set(w*.515,.65,d+1.8));
      cell.matrices.push(mat.clone());cell.colors.push(0x84928d);
    }
    for(let i=-1;i<=1;i++){
      const xx=x+i*w*.285,front=z+d/2+.06;
      box(xx,h*.36,front,w*.22,h*.63,.27,0x758487);
      for(let j=1;j<7;j++)box(xx,h*.08+j*h*.079,front+.17,w*.21,.10,.09,0x566568);
      box(xx,h*.78,front+.02,w*.20,h*.12,.2,0x51656b,'glass');
    }
    solid(x,z,w,d,h+.65);
  }
  const treeSets=[[],[]];
  const tree=(x,z,size=1,k=0)=>treeSets[Math.abs(k)%2].push([x,z,size,rand()*6.28]);
  function streetBlock(x,z,i){
    const aomi=district==='aomi',wood=district==='rail',park=district==='wakasu';
    if(park){
      ground(walk,x,z,116,108,.09,0x8d9879,9);
      for(let j=0;j<19;j++){const px=x+(rand()-.5)*92,pz=z+(rand()-.5)*90;tree(px,pz,.8+rand()*.83,j);}
      if(i%4===1&&clearLot(x,z,13,8))shed(x,z,13,8,3.5);
      return;
    }
    if(aomi&&i%5!==1){
      for(let line=-1;line<=1;line++)for(let bay=-2;bay<=2;bay++){
        const xx=x+bay*14,zz=z+line*12;
        if(!clearLot(xx,zz,12.2,4.3))continue;
        const layers=1+Math.floor(rand()*3);
        for(let j=0;j<layers;j++)container(xx,.11+j*3.0,zz,12.2,2.97,4.3,Math.floor(rand()*7),j===layers-1);
      }
      return;
    }
    if(wood||aomi||(district==='toyosu'&&i%4===1)){
      const w=45+rand()*28,d=30+rand()*19;
      if(clearLot(x,z-15,w,d))shed(x,z-15,w,d,8+rand()*4);
      if(wood)for(let j=0;j<3;j++){
        const xx=x-31+28*j,zz=z+31;
        if(!clearLot(xx,zz,21,6))continue;
        for(let k=0;k<5;k++)box(xx,1+k*.58,zz+(k%2)*.5,21,.48,5.5,[0xb19876,0xc1ac82,0xa18566][k%3]);
        for(const s of [-1,1])box(xx+s*6,1.89,zz,.19,2.8,6,dark);
        solid(xx,zz,21,6,3.42);
      }
      return;
    }
    const tall=district==='tsukuda' ? i%3===1 : district==='toyosu'&&i%3===0;
    if(tall){
      const w=34+rand()*12,d=28+rand()*16,h=58+rand()*65;
      if(clearLot(x,z,w,d))building(x,z,w,d,h,i%2?0:1,i%4);
      for(let k=-2;k<=2;k++)tree(x+k*14,z+43,.86+rand()*.3,k);
    }else{
      const rowH=district==='lock'?13:district==='toyosu'?26:10;
      for(let r=0;r<2;r++)for(let j=0;j<3;j++){
        const w=17+rand()*11,d=18+rand()*12;
        const xx=x+(j-1)*47+(rand()-.5)*5,zz=z+(r-.5)*100;
        if(clearLot(xx,zz,w,d))building(xx,zz,w,d,rowH*.60+rand()*rowH,2+(j+r+i)%2,(j+i)%4);
        if(r===1){
          const frontage=zz+d*.5;
          box(xx,1,frontage+1.9,1.04,1.9,.81,0xad5548);
          box(xx,1.34,frontage+2.32,.81,.83,.04,0xd4d8cd,'glass');
        }
      }
    }
  }

  aerialGround(group,district);
  const bankEnd=district==='lock'?169:district==='tsukuda'?390:3400;
  ground(road,0,-260,1700,755,.028,0xb5b8b5,5);
  for(const [r,z] of roadZ.entries()){
    ground(road,0,z,1480,22,.095,0xcdd0cf,5);
    for(const side of [-1,1])ground(walk,0,z+side*14.1,1475,5.8,.089,0xc8c6bb);
    for(let x=-714;x<735;x+=13){
      if(roadX.some(k=>Math.abs(k-x)<16))continue;
      for(const side of [-1,1]){
        box(x,.153,z+side*10.2,12.95,.023,.18,0xbdbdb0,'mark');
        box(x,.23,z+side*11.2,12.94,.35,.37,curb);
      }
      if((x+714)%39===0){
        for(const si of [-1,1]){
          const verge=z+si*15.0;
          pole(x,3.85,verge,.14,7.7,metal);
          beam([x,7.55,verge],[x,8.03,verge-si*2.4],.13,metal);
          box(x,7.98,verge-si*2.61,.44,.15,1.16,0xc7caca);
          if(district==='lock'||district==='tsukuda'||district==='toyosu'){
            box(x+6,.195,verge,2.45,.16,2.32,0x686961);
            tree(x+6,verge,.71+rand()*.39,si+x);
          }
        }
      }
      box(x,.132,z,5,.025,.22,0xdfd6b4,'mark');
    }
    for(const x of roadX){
      for(let i=-4;i<=4;i++)box(x+i*2.1,.145,z+12,.87,.025,3.0,0xd4d2bf,'mark');
      if((x/160+r)%2===0){
        pole(x+13.7,3.8,z-13,.12,7.55,metal);beam([x+13.7,7.55,z-13],[x+8,7.55,z-13],.14,metal);
        box(x+8.4,7.38,z-13,2.0,.67,.55,dark);
        box(x+8.94,7.39,z-12.69,.33,.31,.14,0x85a496);
      }
    }
  }
  for(const x of roadX){
    ground(road,x,-263,22,760,.105,0xc9cbc7,5);
    for(const side of [-1,1])ground(walk,x+side*14.2,-267,5.7,758,.105,0xc9c6bc);
    for(let z=-585;z<101;z+=14){
      if(roadZ.some(k=>Math.abs(z-k)<18))continue;
      box(x,.14,z,.21,.027,5,0xe0d9c5,'mark');
      for(const s of [-1,1]){
        box(x+s*10.3,.153,z,.18,.027,13.98,0xbdbdb0,'mark');
        box(x+s*11.3,.23,z,.36,.35,13.94,curb);
      }
    }
  }
  for(const [r,rz] of roadZ.entries())for(let col=-4;col<=3;col++){
    const x=col*160+80,z=rz-80,i=r*8+col+4;
    ground(walk,x,z,133,133,.10,0xb5b4aa,8);
    streetBlock(x,z,i);
  }
  // The waterfront road opens directly onto the quay. Mooring fixtures and floodwall seams follow its length.
  ground(walk,0,99,1580,41,.205,0xb4b3a7,6);
  box(0,-1.28,120,1580,4.8,2.1,concrete,'stone');
  box(0,1.14,119.5,1580,.35,2.5,curb);
  for(let x=-760;x<=760;x+=13){
    box(x,-.54,121.10,.13,3.1,.12,0x69746d);
    if(district!=='aomi'){
      box(x,1.9,118.4,.15,1.42,.17,metal);
      box(x+6.5,2.57,118.4,13,.12,.13,metal);
      box(x+6.5,2.03,118.4,13,.10,.10,metal);
    }
  }
  const waterGeom=new THREE.PlaneGeometry(6800,bankEnd-119.8).rotateX(-Math.PI/2);
  waterGeom.translate(0,.085,(119.8+bankEnd)/2);
  const waterMat=new THREE.MeshStandardMaterial({color:di===0?0x446f69:0x48717c,roughness:.44,metalness:.12});
  const water=new THREE.Mesh(waterGeom,waterMat);
  const clock={value:0};
  // Stipple the reflected silhouette instead of rendering a second camera. The main
  // span and piers share the exact profile used by waterfront(); wind and view angle
  // vary the image on the bay without another render target.
  const reflectedBridge=district==='wakasu'?`
    vec3 ray=normalize(vec3(vBay.x,.085,vBay.y)-cameraPosition);
    ray=reflect(ray,normalize(vec3(-grad.x,1.,-grad.y)));
    float hitT=(370.-vBay.y)/(abs(ray.z)>.001?ray.z:.001);
    if(hitT>0. && hitT<610.){
      vec2 hit=vec2(vBay.x,0.)+ray.xy*hitT;
      float u=(hit.x+430.)/620.,t=min(u,1.-u);
      float roof=31.+(t<.19?4.+t/.19*27.:t<.34?31.-(t-.19)/.15*7.:24.-(t-.34)/.16*14.);
      float foot=1.-smoothstep(4.,9.,min(abs(hit.x+318.4),abs(hit.x-78.4)));
      float surface=foot*(1.-smoothstep(28.,31.,hit.y));
      if(u>0. && u<1.){
        surface=max(surface,1.-smoothstep(1.,2.8,abs(hit.y-31.)));
        float diag=abs(fract(u*26.)-.5)*2.;
        float bar=1.-smoothstep(.065,.17,abs(diag-(hit.y-31.)/max(3.,roof-31.)));
        if(hit.y>=31. && hit.y<=roof)surface=max(surface,bar*.65);
      }
      diffuseColor.rgb*=1.-.43*surface*(1.-smoothstep(260.,610.,hitT))*(.61+.39*n3);
    }`:'';
  waterMat.customProgramCacheKey=()=> 'tokyo-inlet-v2-'+district;
  waterMat.onBeforeRender=()=>{clock.value=performance.now()*.001;};
  waterMat.onBeforeCompile=shader=>{
    shader.uniforms.bayClock=clock;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vBay;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvBay=position.xz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vBay;uniform float bayClock;
      float bayHash(vec2 p){vec3 h=fract(vec3(p.xyx)*.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
      float bayNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(bayHash(i),bayHash(i+vec2(1.,0.)),f.x),mix(bayHash(i+vec2(0.,1.)),bayHash(i+1.),f.x),f.y);}`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec2 p=vBay;
        float n1=bayNoise(p*.18+vec2(bayClock*.12,0.));
        float n2=bayNoise(p*.37+vec2(0.,-bayClock*.18));
        float n3=bayNoise(p*1.09+vec2(bayClock*.28,bayClock*.11));
        float fine=1.-smoothstep(.16,1.1,length(fwidth(p)));
        vec2 grad=vec2(.018,.037)*cos(p.x*1.7+p.y*2.38+11.*n1+bayClock*.82);
        grad+=vec2(.024,-.026)*cos(p.x*2.78-p.y*1.71+9.*n2-bayClock*1.1);
        grad+=vec2(.045,.027)*cos(p.x*4.61+p.y*6.25+13.*n3+bayClock*1.63)*fine;
        grad*=.2+.8*(1.-smoothstep(.5,2.9,length(fwidth(p))));
        diffuseColor.rgb*=.95+.058*n1+.025*n2;
        ${reflectedBridge}
        normal=normalize(mat3(viewMatrix)*vec3(-grad.x,1.,-grad.y));`);
  };
  water.name='東京湾・水面';water.receiveShadow=true;water.userData.fieldGeometry=water.userData.fieldMaterial=true;group.add(water);
  for(let i=0;i<40;i++){
    const x=-732+i*37.7,z=(di===1?424:201)+(i%3)*24;
    if(di===0||di===1)building(x,z,23+rand()*10,20+rand()*12,13+rand()*(di===1?70:27),i%3,i%4);
    if(i%3===0||district==='wakasu')tree(x,84+rand()*6,.83+rand()*.42,i);
    if(i%2===0){
      pole(x,4.3,89,.11,8.6,metal);beam([x,8.35,89],[x,8.82,87.2],.15,metal);
      box(x,8.72,86.9,.48,.25,1.35,0xcbd0c8);
    }
  }
  if(district==='tsukuda'){
    ground(walk,0,408,1980,38,1.05,0xbbbaa8);
    box(0,-.48,390,1980,3.2,3.4,concrete,'stone');
  }
  if(district==='lock'||district==='tsukuda'){
    // Utility cables follow the side street. A shallow sag catches the sun between concrete posts.
    for(const z of [-275,-115,75]){
      for(let x=-609;x<560;x+=70){
        pole(x,5.25,z,.18,10.5,0x8d938d);box(x,9.46,z,2.9,.22,.24,dark);
        for(const s of [-1,1]){
          const ax=x+s*.89;
          beam([ax,9.68,z],[ax+35,8.63,z],.060,0x435052);
          beam([ax+35,8.63,z],[ax+70,9.68,z],.060,0x435052);
        }
        box(x+.42,8.11,z,.67,1.05,.70,metal);
      }
    }
  }
  if(district==='aomi'||district==='rail'){
    // Stage equipment and loaded trailers between the road grid and the berth.
    for(let n=0;n<22;n++){
      const x=-629+(n%11)*121+(n>10?10:0),z=n<11?84:-84;
      box(x,1.07,z,9.9,.32,2.55,0x56656b);
      for(const s of [-1,1])for(const q of [-3.5,2.6,3.6])box(x+q,.55,z+s*1.16,.75,1.02,.31,0x39403d);
      if(n%3!==1)container(x,1.30,z,9.8,2.48,2.44,n,false);
      else{
        box(x+3.35,1.9,z,2.46,2.65,2.48,0xa4b2aa);
        box(x+3.38,2.23,z,2.55,.92,2.52,0x455d66,'glass');
      }
    }
  }
  waterfront({box,beam,deck,solid,sign,container,tree,clearLot},district);
  distantCity({tower:wallFaces,box,beam,ground:(x,z,w,d)=>ground(walk,x,z,w,d,1.8,0xa5aaa4,8),rand,district});

  if(world.prepareFoliage&&typeof document!=='undefined'){
    world.prepareFoliage();
    for(const [i,entries] of treeSets.entries()){
      const key='tree'+i;batch(key,world.fieldTrees[i?3:1],world.fieldTreeMaterial,false,false);
      for(const [x,z,size,yaw] of entries)place(key,x,Math.max(0,world.height(x,z)),z,size,size,size,0xffffff,yaw);
    }
  }
  const carMat=instancedCarMaterial(world.A?.wearM);
  for(let v=0;v<2;v++){
    const key='car'+v;
    batch(key,carGeometry(v),carMat,false,!v);
    for(let j=0;j<10;j++){
      const x=-544+j*113+v*6.5,z=roadZ[(j+v)%4]+(j%2?9:-9);
      if(!clearLot(x,z,5.3,2.2))continue;
      place(key,x,.135,z,1,1,1,[0xc9c7b9,0x4e5b5d,0x777e88,0x93534c][(j+v)%4],j%2?Math.PI:0);
    }
  }
  facades.forEach((f,i)=>f.finish(group,'東京・'+facadeNames[i]));
  road.finish(group,'車道',false);walk.finish(group,'歩道',false);
  for(const [key,b] of batches){
    if(!b.matrices.length){if(b.ownsMaterial)b.material.dispose();continue;}
    const m=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length),c=new THREE.Color();
    b.matrices.forEach((matrix,i)=>{m.setMatrixAt(i,matrix);m.setColorAt(i,c.setHex(b.colors[i]));});
    m.name='東京・'+key;m.castShadow=key!=='mark';m.receiveShadow=true;
    m.userData.fieldGeometry=b.ownsGeometry;m.userData.fieldMaterial=b.ownsMaterial;
    if(key.startsWith('tree')){
      m.userData.fieldTree=m.userData.noAO=true;m.customDepthMaterial=world.fieldTreeDepth;m.visible=world.fieldFoliageReady;
    }
    m.computeBoundingSphere();group.add(m);
  }
  world.tokyoTraffic=tokyoTraffic(world,group);
  const atlas=signAtlas(group,signs);
  if(atlas)group.children.at(-1).geometry.addEventListener('dispose',()=>atlas.dispose());
}
