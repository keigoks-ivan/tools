import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {building,foldedSolids} from './fold-architecture.mjs';
import {dock,summit} from './dock-summit.mjs';
import {createExercise} from './missions.mjs';

import {HEIGHT,DECK} from './campaign.mjs';
const teal=0x54dfe0, amber=0xffaf56, violet=0xa989f3, steel=0x536673, shell=0x243541;
const cube=new THREE.BoxGeometry(),round=new THREE.CylinderGeometry(.5,.5,1,12);
const gate=new THREE.TorusGeometry(17,.7,6,64);
const arc=new THREE.TorusGeometry(1, .065, 6, 8, Math.PI/3.4);
const glassTube=new THREE.CylinderGeometry(.5,.5,1,24,1,true);
const dome=new THREE.SphereGeometry(.5,12,8,0,Math.PI*2,0,Math.PI/2);
const face=new THREE.PlaneGeometry(1,1);
const surfaces={
  shop:{roughness:.44,metalness:.13},
  conservatory:{roughness:.31,metalness:.28},
  optics:{roughness:.35,metalness:.46},
  radiator:{roughness:.4,metalness:.44},
  caisson:{roughness:.58,metalness:.41},
  shutter:{roughness:.39,metalness:.42},
  asphalt:{span:[16,16],url:'../zero/assets/env/asphalt_diff.webp',roughness:.87,metalness:.04},
  quayside:{span:[19,23],roughness:.81,metalness:.05},
  curtain:{span:[16,25],roughness:.34,metalness:.37},
  paving:{span:[19,19],roughness:.79,metalness:.07},
  ceramic:{span:[21,21],roughness:.47,metalness:.14},
  'car-deck':{span:[17,22],roughness:.31,metalness:.58},
  glazing:{span:[18,9],roughness:.49,metalness:.24},
};
const maps=new Map();
// Course art is released with the course, independently of the shared mech asset CDN.
const mapLoader=new THREE.TextureLoader(new THREE.LoadingManager());
// Share textures within the selected course. Dropping the last material also
// releases the GPU texture when a slow request finishes after a level switch.
function bindTexture(mat,url,repeat,apply){
  if(typeof document==='undefined')return;
  let entry=maps.get(url);
  if(!entry){
    entry={refs:0,ready:mapLoader.loadAsync(new URL(url,import.meta.url).href).then(t=>{
      t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
      if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;
      return t;
    }).catch(()=>null)};
    maps.set(url,entry);
  }
  let active=true;entry.refs++;
  mat.addEventListener('dispose',function release(){
    active=false;mat.removeEventListener('dispose',release);
    if(--entry.refs===0){maps.delete(url);entry.ready.then(t=>t?.dispose());}
  });
  entry.ready.then(t=>{if(active&&t)apply(t);});
}
function surfaceMaterial(key,assets){
  const spec=surfaces[key],mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:spec.roughness,metalness:spec.metalness});
  if(key==='asphalt'&&assets?.asphD)mat.map=assets.asphD;
  else bindTexture(mat,spec.url||('./'+key+'.webp'),!!spec.span,t=>{mat.map=t;mat.needsUpdate=true;});
  return mat;
}
// Local planar coordinates keep the material at the same scale on pavement, windows and moving cars.
function projectUV(g,span){
  const {position,normal,uv}=g.attributes;
  for(let i=0;i<uv.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i)),nz=Math.abs(normal.getZ(i));
    if(ny>nx&&ny>nz)uv.setXY(i,x/span[0],z/span[1]);
    else uv.setXY(i,(nx>nz?z:x)/span[0],y/span[1]);
  }
}
// Each assembly shares a draw per surface, including its architectural detail and strip lighting.
function batch(root,name,assets,castWalls=false){
  const parts=new Map(),pose=new THREE.Object3D(),color=new THREE.Color();
  function add(g,x,y,z,w,h,d,tint,lit=false,rx=0,ry=0,rz=0){
    pose.position.set(x,y,z);pose.rotation.set(rx,ry,rz);pose.scale.set(w,h,d);pose.updateMatrix();
    const copy=g.clone().applyMatrix4(pose.matrix);
    const attr=new Float32Array(copy.attributes.position.count*3);color.setHex(tint);
    const pos=copy.attributes.position;
    for(let i=0;i<pos.count;i++){
      // Bake a small amount of ground bounce/occlusion into the bottom of opaque assemblies.
      const shade=lit===true||lit==='glass'?1:1-.18*Math.max(0,1-Math.max(0,pos.getY(i))/6);
      attr[i*3]=color.r*shade;attr[i*3+1]=color.g*shade;attr[i*3+2]=color.b*shade;
    }
    copy.setAttribute('color',new THREE.BufferAttribute(attr,3));
    if(surfaces[lit]?.span)projectUV(copy,surfaces[lit].span);
    if(!parts.has(lit))parts.set(lit,[]);parts.get(lit).push(copy);
  }
  function strut(a,b,width,depth,tint,lit=false){
    const delta=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const length=delta.length(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.divideScalar(length));
    const e=new THREE.Euler().setFromQuaternion(q);
    add(cube,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,width,length,depth,tint,lit,e.x,e.y,e.z);
  }
  // A single-sided face carries a whole photographed panel, with its original UVs.
  function panel(x,y,z,w,h,key,rx=0,ry=0){
    add(face,x,y,z,w,h,1,0xffffff,key,rx,ry);
  }
  return {add,strut,panel,box:(...args)=>add(cube,...args),finish(){
    for(const [key,items] of parts){
      const geo=mergeGeometries(items);for(const p of items)p.dispose();
      const mat=key==='glass'?new THREE.MeshStandardMaterial({vertexColors:true,roughness:.18,metalness:.38,transparent:true,opacity:.27,depthWrite:false,side:THREE.DoubleSide}):surfaces[key]?surfaceMaterial(key,assets):key?new THREE.MeshBasicMaterial({vertexColors:true}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.27});
      const m=new THREE.Mesh(geo,mat);
      m.name=name;m.receiveShadow=key!==true;
      // Keep streets and thin architectural decals out of the shadow map.
      m.castShadow=key!==true&&key!=='glass'&&key!=='paving'&&key!=='asphalt'&&
        (key!=='ceramic'||castWalls)&&(!surfaces[key]||!!surfaces[key].span||key==='shutter');
      m.userData.fieldGeometry=m.userData.fieldMaterial=true;root.add(m);
    }
  }};
}
const palette={
  dock:{zenith:0x75afc3,horizon:0xffdfb8,sun:0xffedc7,env:.95,fill:1.85,fog:.00078},
  summit:{zenith:0x518ebc,horizon:0xe4e7e2,sun:0xffedcd,env:.98,fill:1.84,fog:.00092},
  fold:{zenith:0x89b7ce,horizon:0xf2dabb,sun:0xffefd0,env:1.05,fill:2.35,fog:.00072},
  echo:{zenith:0x394773,horizon:0xb9aabe,sun:0xf5d5bd,env:.76,fill:1.35,fog:.00083},
  rail:{zenith:0x344456,horizon:0x8d9da9,sun:0xe5d0b1,env:.86,fill:1.56,fog:.0012},
};
function sky(root,world,district){
  const colors=palette[district];
  if(world.hemi){
    world.hemi.intensity=colors.fill;world.scene.environmentIntensity=colors.env;
    world.scene.fog.density=colors.fog;
    if(district==='rail'){
      world.sun.intensity=2.25;world.sun.color.setHex(0xd9e5ed);
    }
  }
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{
    vista:{value:null},withVista:{value:0},summit:{value:district==='summit'?1:0},sunDir:{value:world.lightDir||new THREE.Vector3(-.66,.19,.72).normalize()},
    squall:{value:district==='rail'?1:0},cloudMap:{value:world.A?.sky||null},topColor:{value:new THREE.Color(colors.zenith)},horizon:{value:new THREE.Color(colors.horizon)},sun:{value:new THREE.Color(colors.sun)}},
    vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 p;uniform sampler2D cloudMap,vista;uniform float withVista,squall,summit;uniform vec3 sunDir;uniform vec3 topColor,horizon,sun;
    void main(){
      vec3 n=normalize(p);float elevation=asin(clamp(n.y,-1.,1.));
      vec2 uv=vec2(fract(atan(n.z,n.x)/6.2831853+.53),clamp((elevation+.17453)/1.74533,.006,.994));
      vec3 cloud=texture2D(cloudMap,uv).rgb;
      float density=dot(cloud,vec3(.2126,.7152,.0722));
      float height=smoothstep(.0,.80,n.y);
      vec3 sky=mix(horizon,topColor,height)*(.58+.95*density)+cloud*.105;
      float shaft=smoothstep(.16,.84,.48+.32*sin(uv.x*55.+n.y*3.)+.2*sin(uv.x*87.-n.y*7.));
      vec3 rainSky=sky*(.46+.69*smoothstep(.12,.65,density));
      sky=mix(sky,mix(rainSky,vec3(.31,.38,.43),shaft*.47*(1.-smoothstep(.0,.47,n.y))),squall);
      // The seamless panorama closes the distant horizon at every bearing. Only a narrow
      // elevation band is painted; the original cloud dome remains above the ridges.
      float v=(elevation+mix(.104,.115,summit))/mix(.305,.416,summit);
      float band=withVista*(1.-smoothstep(.70,.99,v));
      if(band>.001){
        float u=fract(uv.x*2.+.24);
        vec3 landscape=texture2D(vista,vec2(u,clamp(v,.012,.985))).rgb;
        float haze=.24+.12*squall+.16*(1.-smoothstep(.12,.47,v));
        sky=mix(sky,mix(landscape*(.98-.12*squall),sky,haze),band);
      }
      float key=max(dot(n,sunDir),0.);
      gl_FragColor=vec4(sky+sun*(.23*pow(key,17.)+.65*pow(key,320.)),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
  bindTexture(material,'./vista-'+district+'.webp',false,t=>{
    material.uniforms.vista.value=t;material.uniforms.withVista.value=1;
  });
  const m=new THREE.Mesh(new THREE.SphereGeometry(2200,24,12),material);m.renderOrder=-2;
  m.userData.fieldGeometry=m.userData.fieldMaterial=true;root.add(m);
}
const block=(x,z,w,d,top,bottom=0)=>({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top,bottom});
function fold(root,site,world){
  const pair=new THREE.Group(),solids=foldedSolids(site);root.add(pair);site.city=pair;
  for(const ceiling of [false,true]){
    const layer=new THREE.Group();pair.add(layer);
    if(ceiling){layer.rotation.z=Math.PI;layer.position.y=HEIGHT;}
    const p=batch(layer,ceiling?'琥珀上城':'青色下城',world.A),accent=ceiling?amber:teal;
    const limestone=ceiling?0xf0d2b5:0xd3e0dc,trim=ceiling?0xab7957:0x567b86;
    p.box(0,-1,0,1240,2,1330,ceiling?0xffe2c5:0xd3e7eb,'paving');
    p.box(0,-.045,0,97,.15,1260,ceiling?0xd7d2bf:0xbccdd4,'asphalt');
    for(let z=-580;z<=580;z+=17){
      for(const side of [-1,1])p.box(side*19,.09,z,.36,.06,8,ceiling?0xe1ce98:0xe2e6dd);
    }
    for(let i=-4;i<=4;i++)for(let j=-5;j<=5;j++){
      const x=i*116,z=j*104;
      if(i===0){
        p.box(0,.055,z,4,.11,72,ceiling?0xb6a391:0x819da5);
        p.box(0,.13,z,1.05,.1,54,accent,true);
        for(const side of [-1,1]){
          const sx=side*52;
          // Raised platforms carry a bronze-and-glass arcade below and a solar canopy above.
          if(ceiling){
            // Frosted walk-on skylights read as a lit ceiling when viewed from the lower city.
            const sx=side*31;
            p.box(sx,.135,z-8,6.6,.24,47,trim);
            p.box(sx,.283,z-8,5.8,.07,45,0xcad8cc,true);
            p.box(sx,.36,z-8,.23,.12,46,trim);
            for(let k=-3;k<=3;k++)p.box(sx,.37,z-8+k*6.25,6,.13,.36,trim);
          }
          const stopZ=z+13;
          if(j%2===0){
            p.box(sx+side*3,1,stopZ,8,2,24,limestone,'paving');
            for(const off of [-9,9]){
              p.strut([sx+side*5,1.6,stopZ+off],[sx+side*4,9,stopZ+off],.8,.85,trim);
              p.strut([sx+side*4,7.4,stopZ+off],[sx-side*3,9.5,stopZ+off],.6,.6,trim);
            }
            p.box(sx,9.5,stopZ,10,.65,25,ceiling?0x576d7d:0x6b9991,false,0,0,side*.09);
            p.box(sx,9.24,stopZ,8,.15,22,0xabc7bd,'glass',0,0,side*.09);
            p.box(sx+side*1.4,2.18,stopZ,1.6,.48,12,0x9f7958);
            solids.register([block(sx+side*3,stopZ,8,24,2),block(sx,stopZ,10,25,10,9)],ceiling);
          }
          p.box(sx,.10,z,1.1,.16,101,limestone);
          p.box(sx+side*5,.22,z,5,.44,95,trim);
          // Prismatic underlights break up the long shadowed soffit when this street is overhead.
          p.box(sx+side*12,.12,z,4,.19,37,0x91aaa9);
          for(let k=-2;k<=2;k++)p.box(sx+side*12,.25,z+k*6.6,2.5,.12,5.7,ceiling?0xf2dfb7:0xb4dfe0,true);
          for(let k=-4;k<=4;k++)p.box(side*(27+k*2),.1,z+41,.85,.13,6,0xe2d9b9);
          p.strut([sx,0,z-29],[sx+side*1.8,10,z-29],.66,.82,trim);
          p.box(sx-side,10.2,z-29,6.4,.52,1,limestone);
          p.box(sx-side,9.83,z-29,4.4,.12,.71,accent,true);
        }
        continue;
      }
      building(p,solids,i,j,ceiling);
    }
    for(const z of [-96,195,314]){
      const activeRing=ceiling===(z===-96);
      for(const side of [-1,1]){
        p.box(side*34,2.2,z,9,4.4,12,limestone);
        p.strut([side*34,3,z],[side*28,25,z],3.8,6.5,trim);
        p.strut([side*28,25,z],[side*21,HEIGHT/2-12,z],1.9,3.1,limestone);
        p.strut([side*34,5,z-2.8],[side*28,25,z-2.8],.58,.5,accent,true);
      }
      if(activeRing){
        p.add(gate,0,HEIGHT/2,z,1.13,1.13,1,accent,true);
        for(let k=0;k<6;k++){
          p.add(arc,0,HEIGHT/2,z,22,22,16,limestone,false,0,0,k*Math.PI/3);
          const a=k*Math.PI/3,rx=Math.cos(a),ry=Math.sin(a);
          p.box(rx*22,HEIGHT/2+ry*22,z,4.3,2.5,4.7,trim,false,0,0,a);
          p.box(rx*22,HEIGHT/2+ry*22,z-2.4,2.4,.76,.2,accent,true,0,0,a);
        }
      }
      p.box(0,.12,z,30,.15,4,accent,true);
    }
    p.finish();
  }
  site.setLayer=upper=>{
    pair.position.y=upper?HEIGHT:0;pair.rotation.z=upper?Math.PI:0;
    solids.orient(upper);
  };
  site.setLayer(false);
}
function echo(root,site){
  const p=batch(root,'殘響雙翼'),porcelain=0xe7e3d5,frame=0x586879;
  p.box(0,-1.2,25,430,2.4,690,0xb8c7cd,'ceramic');
  // Repeated elliptical ribs leave clear sight lines along both wings of the recording hall.
  for(let z=-242;z<=322;z+=70){
    for(let i=0;i<12;i++){
      const a=Math.PI*i/12,b=Math.PI*(i+1)/12;
      const x=158*Math.cos(a),y=18+53*Math.sin(a),xx=158*Math.cos(b),yy=18+53*Math.sin(b);
      p.strut([x,y,z],[xx,yy,z],2.1,4.5,porcelain);
      p.strut([x,y+4,z+4],[xx,yy+4,z+4],1.25,2.4,frame);
      p.strut([x,y,z],[xx,yy+4,z+4],.62,.81,frame);
      if(i>0&&i<11)site.boxes.push(block((x+xx)/2,z,Math.abs(x-xx)+1.4,4.5,Math.max(y,yy)+1,Math.min(y,yy)-1));
      // Long folded roof leaves frame the two recording wings, with an open central oculus.
      if(z<318&&(i===2||i===3||i===8||i===9)){
        const dx=xx-x,dy=yy-y,span=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
        for(const end of [-1,1]){
          p.box((x+xx)/2,(y+yy)/2+1.35,z+35+end*16.4,span,1.55,29.8,0xbac8c9,'ceramic',0,0,angle);
          p.box((x+xx)/2,(y+yy)/2+.22,z+35+end*16.4,span*.72,.62,26.8,0x536b7b,false,0,0,angle);
        }
        p.box((x+xx)/2,(y+yy)/2+1,z+35,span,.55,3.3,0xb6d3cc,'glass',0,0,angle);
        for(let k=0;k<4;k++){
          const t=(k+.5)/4,mid=y+dy*t;
          site.boxes.push(block(x+dx*t,z+35,Math.abs(dx)*.25,62,mid+2+Math.abs(dy)/8,mid-.6-Math.abs(dy)/8));
        }
      }
      if(i===2||i===9||i===5||i===6){
        p.strut([x,y+1,z],[x,y+1,z+69],1.1,1,frame);
        p.strut([x,y-.65,z+6],[x,y-.65,z+62],.65,.7,i<6?violet:teal,true);
      }
    }
  }
  // Optical terminal: the concentric rings and suspended lens give the two branches a common destination.
  const endZ=330;
  p.box(0,22,endZ+7,104,44,8,0x677c86,'glazing');
  site.boxes.push(block(0,endZ+7,104,8,44));
  for(const size of [1.2,1.48,1.78])p.add(gate,0,33,endZ,size,size,2.7,size===1.48?teal:porcelain,size===1.48);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,dx=Math.cos(a),dy=Math.sin(a);
    p.strut([dx*22,33+dy*22,endZ],[dx*30,33+dy*30,endZ],1.3,3.8,frame);
  }
  p.add(dome,0,33,endZ-1,33,14,33,0x87b9be,false,-Math.PI/2);
  for(const side of [-1,1]){
    p.box(side*56,9,endZ-2,10,18,21,porcelain);
    p.strut([side*56,17,endZ],[side*26,50,endZ],3.8,7,porcelain);
  }
  // The first recording head is also the street-level landmark dividing the two approaches.
  p.box(0,4,-102,19,8,8,frame);
  p.box(0,8.4,-104,19.8,.85,5.5,porcelain);
  p.add(round,0,16,-102,19,6,19,0x5a7182,false,Math.PI/2);
  p.add(round,0,16,-105.2,14,1.2,14,0x202b42,false,Math.PI/2);
  p.add(dome,0,16,-106,10,3.8,10,0x759baa,false,-Math.PI/2);
  p.add(gate,0,16,-106,.46,.46,.74,teal,true);
  for(let k=0;k<6;k++)p.add(arc,0,16,-105.7,10.4,10.4,9,porcelain,false,0,0,k*Math.PI/3);
  // Nested objective lens with a flared housing, an iris and a two-sided gimbal.
  for(const [scale,depth,tint] of [[.79,1.2,0x49515c],[.66,.82,porcelain],[.55,.55,0x5e858e]]){
    p.add(gate,0,16,-104.8-depth,scale,scale,depth,tint);
  }
  p.add(dome,0,16,-107,8,3.2,8,0x193746,false,-Math.PI/2);
  p.add(gate,0,16,-108,.21,.21,.54,teal,true);
  for(let k=0;k<8;k++){
    const a=k*Math.PI/4,dx=Math.cos(a),dy=Math.sin(a);
    p.box(dx*10.6,16+dy*10.6,-105.8,3.8,1.1,1.5,frame,false,0,0,a);
  }
  for(const side of [-1,1]){
    p.strut([side*8.5,2,-102],[side*12.6,16,-102],2.5,4.3,frame);
    p.add(round,side*12,16,-102,5.2,3.3,5.2,0x939f9c,false,0,0,Math.PI/2);
    p.panel(side*5,4.2,-106.1,7.2,5.6,'optics',0,Math.PI);
  }
  site.boxes.push(block(0,-102,26,13,30));
  for(const side of [-1,1]){
    const branch=side<0?teal:violet,x=side*44;
    // Dichroic mirror banks lean toward the recording head, outside the two approach lanes.
    for(let j=0;j<5;j++){
      const px=side*(139+j%2*6),pz=-179+92*j;
      p.box(px,2.4,pz,19,4.8,14,frame,'ceramic');
      for(const dz of [-4,4])p.strut([px,3,pz+dz],[px-side*1.8,18,pz+dz],2.2,2,porcelain);
      p.add(round,px,19,pz,8,16,8,frame,false,Math.PI/2);
      p.box(px-side*1.1,23,pz,22,24,1.6,frame,false,-.29,side*.39);
      p.panel(px-side*1.5,22.7,pz-.95,20.6,22,'optics',.29,Math.PI+side*.39);
      site.boxes.push(block(px,pz,19,13,31));
    }
    p.box(x,.5,-166,12,1,19,frame);p.box(x,3.3,-166,8,5.6,15,porcelain);
    p.strut([x,5,-166],[x+side*6,26,-163],4.8,10,porcelain);
    p.strut([x+side*6,26,-163],[x+side*25,33,-158],4.3,9.5,frame);
    p.strut([x-side*.5,5,-171],[x+side*5.4,25,-168],.8,1.05,branch,true);
    site.boxes.push(block(x,-166,10,17,15));
    p.box(side*128,19,-116,29,12,34,porcelain);
    p.box(side*128,20,-133.4,25,6,1,0x8fb7bd,'glazing');
    p.box(side*128,20,-98.6,25,6,1,0x8fb7bd,'glazing');
    p.box(side*128,26,-116,32,1.2,37,frame);
    for(const dz of [-10,10])p.strut([side*150,0,-116+dz],[side*129,15,-116+dz],2.5,2.5,frame);
    site.boxes.push(block(side*128,-116,30,35,26.6,13));
    // Coloured overhead glass occupies only two narrow strips, leaving the vault open to flight.
    for(let section=0;section<7;section++){
      const z=-204+section*70;
      p.box(side*112,55.8,z,24,.42,62,side<0?0x7eabbc:0x968ab0,'glass',0,0,-side*.34);
      p.box(side*111,56.3,z,1.3,1,66,porcelain);
    }
  }
  // A central spine splits the two approach lanes but leaves the entrance and exit connected.
  for(const z of [-76,-24,28,80]){
    p.box(0,9,z,17,18,49,shell);site.boxes.push(block(0,z,17,49,18));
    p.box(0,18.8,z,19,1.6,49,steel);
    p.panel(0,9,z-24.57,15.3,16.8,'optics',0,Math.PI);
    for(const side of [-1,1]){
      p.box(side*8.55,10,z,.2,8,42,0x151f30);
      for(const off of [-13,13])p.panel(side*8.73,9.1,z+off,18,10.2,'optics',0,side*Math.PI/2);
      for(let k=-18;k<=18;k+=6)p.box(side*8.75,12,z+k,.4,2.7,.7,side<0?teal:violet,true);
    }
  }
  for(const side of [-1,1]){
    const x=side*88,col=side<0?teal:violet;
    // Fine luminous inlays lead to the rescue stations and read clearly against the matte tiles.
    for(const off of [-15,15]){
      p.box(x+off,.09,76,.72,.15,210,frame);
      p.box(x+off,.19,76,.22,.12,210,col,true);
    }
    for(let z=-160;z<0;z+=21)p.box(x*(z+200)/200,.12,z,3,.2,7,col,true);
    for(let i=0;i<10;i++){
      const z=-205+i*53,px=side*156;
      p.box(px,4,z,11,8,13,porcelain);
      p.strut([px,6,z],[px-side*5,33,z],3.2,6.4,frame);
      p.box(px-side*9,33,z,20,3.5,8,porcelain);
      p.box(px-side*10,31,z,12,.4,5,col,true);
      p.box(px-side*3.65,17,z,.5,26,3.6,col,true);
      p.box(x,.1,z,2,.12,27,col,true);
      if(i===5||i===7){p.box(x+side*32,4,z,17,8,15,steel);site.boxes.push(block(x+side*32,z,17,15,8));}
    }
    for(let i=0;i<4;i++){
      const z=-116+i*89;
      p.box(side*180,22,z,17,44,73,0x87959c);
      p.box(side*171.2,24,z,.8,19,62,0xd4e0e5,'glazing');
      p.box(side*169,13.5,z,5,2.2,73,porcelain);
      for(let k=-2;k<=2;k++)p.box(side*170.3,24,z+k*14,1.4,21,.9,frame);
    }
    p.add(round,x,.48,158,32,.96,32,col,true);
    p.add(round,x,1,158,28,.3,28,0x667780);
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;p.box(x+13.5*Math.cos(a),1.23,158+13.5*Math.sin(a),2.6,.2,.8,porcelain,true,0,-a,0);
    }
    const pod=new THREE.Group();pod.position.set(x,0,186);root.add(pod);
    const cell=batch(pod,'受困友機・識別燈');
    cell.box(0,5,0,5,6,3,0x98aab2);cell.box(0,9,0,2.9,2.6,2.5,0xb8c8c9);
    for(const s of [-1,1]){cell.box(s*1.8,1.9,0,2.25,3.8,2.5,steel);cell.box(s*3.6,5.4,0,1.8,5,2.2,steel);}
    cell.box(0,9.2,-1.33,2,.42,.15,col,true);cell.finish();
    const prison=new THREE.Group();pod.add(prison);const bars=batch(prison,'救援艙');
    bars.add(round,0,1.2,0,18,2.4,18,frame);bars.add(round,0,14.4,0,17,1.4,17,porcelain);
    bars.add(dome,0,15,0,15,6,15,0x8fa8ae);
    bars.add(glassTube,0,7.8,0,14.3,12.8,14.3,col,'glass');
    for(let i=0;i<8;i++){const a=i*Math.PI/4;bars.box(7*Math.cos(a),7,7*Math.sin(a),.35,14,.35,col,true);}
    bars.add(gate,0,14,0,.42,.42,.42,col,true,Math.PI/2);bars.finish();
    (site.cells??=[]).push(prison);
  }
  p.finish();
}
const carCenters=[-174,-116,-58,0,58,116,174,232];
export function trainPose(lane,time){
  return {x:lane*(45+15*Math.sin(time*.19)),z:lane*64*Math.sin(time*.135+.42)};
}
// Cross-section rings form a bevelled shell; the cab drops and tapers towards its windscreen.
function carriageProfile(sections){
  const vertices=[],uv=[],indices=[];
  const profile=[[-.80,-1],[.80,-1],[1,-.56],[1,.46],[.83,1],[-.83,1],[-1,.46],[-1,-.56]];
  for(const [z,w,h,cy] of sections)for(const [x,y] of profile){
    vertices.push(x*w,cy+y*h,z);uv.push((x+1)*.5,(y+1)*.5);
  }
  for(let j=0;j<sections.length-1;j++)for(let i=0;i<8;i++){
    const a=j*8+i,b=j*8+(i+1)%8;indices.push(a,b,b+8,a,b+8,a+8);
  }
  const last=vertices.length/3-8;
  for(let k=1;k<7;k++)indices.push(0,k+1,k,last,last+k,last+k+1);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
const carriage=carriageProfile([[-26,8.6,4.4,0],[-23,10,5.8,0],[23,10,5.8,0],[26,8.6,4.4,0]]);
const cab=carriageProfile([[0,9.5,5.4,0],[4,9,4.8,-.5],[9,7.8,3.1,-1.6],[15,5.3,1.45,-2.7],[17,3.6,.82,-2.8]]);
function estuary(root){
  const positions=[],colors=[],indices=[],color=new THREE.Color();
  for(let band=0;band<2;band++){
    const n=176,offset=positions.length/3,r=band?930:1150;
    for(let i=0;i<=n;i++){
      const a=2*Math.PI*(i%n)/n,crest=37+18*Math.sin(4*a+band)+14*Math.cos(9*a+band*2)+6*Math.sin(22*a);
      const h=band?crest*.61:crest+26;
      for(const [y,rad,tint] of [[-4,r-44,band?0x798c90:0xaab4b7],[h*.63,r-16,band?0x788990:0xa6b3b8],[h,r,band?0x98a4a7:0xb6bec1]]){
        positions.push(Math.sin(a)*rad,y,Math.cos(a)*rad);
        color.setHex(tint).multiplyScalar(.96+.04*Math.sin(19*a+band));colors.push(color.r,color.g,color.b);
      }
      if(i<n)for(let row=0;row<2;row++){const v=offset+i*3+row;indices.push(v,v+1,v+4,v,v+4,v+3);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
  mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;root.add(mesh);
}
function water(root,world){
  const material=new THREE.ShaderMaterial({uniforms:{vista:{value:null},ready:{value:0},lightDir:{value:world.lightDir||new THREE.Vector3(-.66,.19,.72).normalize()}},vertexShader:`
    varying vec3 point;void main(){point=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(point,1.);}`,
    fragmentShader:`varying vec3 point;uniform sampler2D vista;uniform float ready;uniform vec3 lightDir;void main(){
      vec3 view=normalize(cameraPosition-point);float distanceFade=1.-smoothstep(120.,780.,length(cameraPosition-point));
      float wave=point.x*1.42+point.z*.34+1.4*sin(point.z*.18)+.9*sin(point.x*.09-point.z*.14);
      float ripples=.5+.5*sin(wave)*clamp(1.-fwidth(wave)*.38,0.,1.);
      float spread=.5+.5*sin(point.z*.91-point.x*.58);
      vec2 ripple=vec2(sin(wave),cos(point.z*.39+point.x*.27))*(.014+.025*distanceFade);
      vec3 normal=normalize(vec3(ripple.x,1.,ripple.y)),reflection=reflect(-view,normal);
      float bearing=atan(reflection.z,reflection.x)/6.2831853+.53;
      float u=fract(bearing*2.+.24),v=clamp((asin(clamp(reflection.y,-1.,1.))+.104)/.305,.02,.96);
      vec3 env=mix(vec3(.46,.57,.60),texture2D(vista,vec2(u,v)).rgb,ready*.65);
      float fresnel=pow(1.-clamp(dot(view,normal),0.,1.),3.);
      float glint=pow(max(0.,dot(reflection,lightDir)),90.)*(.4+.6*ripples);
      vec3 c=mix(vec3(.052,.135,.145),env,.15+.70*fresnel);
      gl_FragColor=vec4(c+vec3(.86,.73,.52)*glint+vec3(.025)*spread*ripples*distanceFade,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
  bindTexture(material,'./vista-'+world.fieldRoute.district+'.webp',false,t=>{
    material.uniforms.vista.value=t;material.uniforms.ready.value=1;
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2350,2350),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-2;
  mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;root.add(mesh);
}
function rail(root,site,world){
  const bed=batch(root,'河口重工碼頭'),warm=0xcea379,beam=0x6d838a;
  water(root,world);
  // A distant shipyard closes the view at either end of the bridge.
  for(const end of [-1,1]){
    for(let k=0;k<16;k++){
      const x=(k-7.5)*42,h=16+((k*17+21)%41);
      bed.box(x,h/2-1,end*(815+(k%3)*22),28+(k%4)*4,h,30,0xabb3b5,'glazing');
      if(k%4===1){
        bed.add(round,x,h+5,end*840,14,12,14,0x95a3a6);
        bed.box(x,h+17,end*840,1.5,14,1.5,0x788791);
      }
    }
  }
  estuary(root);
  for(const side of [-1,1]){
    const x=side*306;
    bed.box(x,.5,0,85,7.2,1300,0x687b81);
    for(let i=0;i<11;i++){
      const z=i*116-590,depth=24+(i%3)*14;
      bed.box(x,8,z,46,10,depth,0x89949a,'glazing');
      bed.box(x,13.5,z,50,1.7,depth+4,0xa7ada7);
      if(i%3===1){
        bed.add(round,x+side*39,14,z,31,26,31,0xb4bdba);bed.add(dome,x+side*39,27,z,31,6,31,0xb0af9f);
      }
      if(i%3!==0)continue;
      const cx=x-side*39;
      for(const dz of [-12,12]){
        bed.strut([cx-12,4,z+dz],[cx-7,41,z+dz],2.8,3,warm);
        bed.strut([cx+12,4,z+dz],[cx+7,41,z+dz],2.8,3,warm);
      }
      bed.box(cx,41,z,20,5,31,beam);
      bed.strut([cx+side*8,44,z],[cx-side*44,57,z],3,3,warm);
      bed.strut([cx,67,z],[cx-side*44,57,z],.9,1,warm);
      bed.strut([cx,42,z],[cx,67,z],2,2,warm);
      bed.strut([cx-side*38,56,z],[cx-side*38,24,z],.45,.45,beam);
    }
  }
  bed.finish();
  const sleepers=new THREE.Group();root.add(sleepers);
  site.recoveryHeight=10.6; // upper surface of the bridge under the trains
  const tunnel=batch(sleepers,'河口斜張橋');
  tunnel.box(0,8,0,225,4,2304,0x708087);
  for(const side of [-1,1]){
    tunnel.box(side*108,12,0,2.2,4.2,2304,beam);
    tunnel.box(side*110,16,0,.7,.85,2304,0xc8c4b3);
    for(let z=-1152;z<1152;z+=36){
      tunnel.box(side*110,13.5,z,.9,6.6,1.1,beam);
      tunnel.box(side*109,16.8,z+9,.8,.32,12,amber,true);
    }
  }
  for(const x of [-54,-44,-6,6,44,54])tunnel.box(x,10.4,0,1.8,.85,2304,0x9aafb1);
  for(let z=-1080;z<=1080;z+=72){
    tunnel.box(0,10.18,z,205,.33,3.1,0x485e68);
    for(const side of [-1,1]){
      const x=side*105;
      tunnel.strut([x,12,z],[x+side*3,39,z],1.2,1.8,beam);
      tunnel.strut([x+side*3,39,z],[x-side*7,42,z],1.4,2,0xc7c3ab);
      tunnel.box(x-side*6,41.1,z,4,.35,1.1,0xffddab,true);
    }
  }
  for(let z=-1080;z<=1080;z+=360){
    for(const side of [-1,1]){
      const x=side*93,tip=side*28;
      tunnel.strut([x,7,z],[tip,108,z],4.1,7.5,0xbfc7c2);
      tunnel.strut([x+side*10,7,z],[tip+side*2.6,108,z+4],2.1,3.7,beam);
      for(let i=1;i<=5;i++)for(const d of [-1,1]){
        tunnel.strut([tip+side*i*2,105-i*2,z],[x,13,z+i*d*26],.54,.54,0x9eaeb3);
      }
      tunnel.box(tip,108,z,4,1,8,amber,true);
    }
    tunnel.box(0,102,z,64,3.4,6,0xbcc5c2);
    // A lower signal gallery passes overhead; the upper truss remains the bridge silhouette.
    for(const side of [-1,1]){
      tunnel.strut([side*72,38,z],[side*45,53,z],2.3,3.8,beam);
      tunnel.box(side*54,40,z,35,1.6,3.8,beam);
      for(const dx of [-12,-5,2,10])tunnel.box(side*(54+dx),41.9,z-1.6,.4,2.6,.4,0xb3b8ad);
      tunnel.box(side*55,43,z-1.6,34,.45,.44,0xb9b4a6);
      tunnel.box(side*44,37,z-1.55,7,6,2.1,0x31404a);
      for(const k of [-1,1])tunnel.add(round,side*44+k*1.7,37,z-2.7,1.8,.5,1.8,k<0?0x81e7cf:0xbd715c,true,Math.PI/2);
    }
  }
  tunnel.finish();
  const rainPos=[];let seed=173;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<820;i++){const x=(rand()-.5)*460,y=5+rand()*120,z=(rand()-.5)*920;rainPos.push(x,y,z,x+.9,y-3.1,z-2.45);}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rainPos,3));
  const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xb8d3df,transparent:true,opacity:.40,depthWrite:false}));
  rain.userData.fieldGeometry=rain.userData.fieldMaterial=true;root.add(rain);
  site.trains=[];
  for(const lane of [-1,0,1]){
    const train=new THREE.Group();root.add(train);const p=batch(train,'磁浮裝甲列車'),boxes=[];
    const accent=[amber,teal,violet][lane+1];
    for(const z of carCenters){
      const livery=[0xd9b993,0xc5d9da,0xb5adcb][lane+1],dark=0x324b5a;
      p.add(carriage,0,DECK-6.15,z,1,1,1,livery);
      p.box(0,DECK-.69,z,20.5,1.38,53.3,0xd4e0de,'car-deck');
      p.box(0,DECK-10.1,z,16.5,2.8,46,dark);
      for(const s of [-1,1]){
        p.box(s*10.06,DECK-5.1,z,.22,3,43,0xb3d3df,'glazing');
        p.box(s*10.12,DECK-6.9,z,.22,.42,48,accent,true);
        for(let j=-19;j<=20;j+=6)p.box(s*10.17,DECK-4.8,z+j,.28,3.8,.32,steel);
        p.box(s*8.4,DECK+.06,z,.28,.12,46,accent,true);
      }
      for(const side of [-1,1]){
        p.box(side*7.1,DECK+.12,z,1.15,.08,45,livery);
        p.box(side*7.1,DECK+.18,z-8,.48,.04,26,accent);
        for(let k=0;k<3;k++)p.box(side*(6.8-k*.6),DECK+.13,z+19,1.9,.16,.46,accent,true,0,side*.65);
        for(const off of [-17,17]){
          p.box(side*8.9,DECK-9.3,z+off,1.2,2.6,6.5,dark);
          p.box(side*9.6,DECK-9.4,z+off,.25,.56,4.7,steel);
        }
      }
      // Recessed paired radiator cassettes leave the landing plane clear.
      for(const end of [-1,1]){
        const hz=z+end*12.5;
        p.box(0,DECK+.07,hz,8,.14,11.8,0x42565e);
        p.panel(0,DECK+.16,hz,7.4,11.2,'radiator',-Math.PI/2);
        for(const dx of [-4.1,4.1])p.box(dx,DECK+.13,hz,.35,.24,12.1,0x8b9999);
      }
      // The concertina can be seen through the gap during a transfer.
      for(let k=0;k<3;k++)p.box(0,DECK-5.3,z+26.6+k*.93,13.2-k%2,7.4-k%2,1,dark);
      p.box(0,DECK-6.4,z+27,12.2,5.7,1.5,dark);
      if(z===carCenters[0]||z===carCenters.at(-1)){
        const dir=z<0?-1:1;
        p.add(cab,0,DECK-6.3,z+dir*23,1,1,1,livery,false,0,dir<0?Math.PI:0);
        p.box(0,DECK-3.8,z+dir*30.1,12.4,.35,5.3,0x354e5b,false,dir*.28);
        for(const s of [-1,1])p.box(s*4.8,DECK-8.1,z+dir*37,2.5,.55,1.1,dir>0?0xffedc6:0xff8b6b,true);
      }
      const b=block(0,z,21,54,DECK,DECK-12);site.boxes.push(b);boxes.push(b);
    }

    p.finish();site.trains.push({lane,train,boxes});
  }
  site.moveTrains=time=>{
    for(const {lane,train,boxes} of site.trains){
      const {x,z}=trainPose(lane,time);train.position.set(x,0,z);
      for(let i=0;i<boxes.length;i++){const b=boxes[i];b.x0=x-10.5;b.x1=x+10.5;b.z0=z+carCenters[i]-27;b.z1=b.z0+54;}
    }
    sleepers.position.z=-(time*78%360);rain.position.set(0,-(time*15%12),-(time*46%19));
  };
  site.deckAt=(x,z)=>site.trains.find(t=>t.boxes.some(b=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1));
  site.moveTrains(0);
}
export function buildExercise(world,root){
  const id=world.fieldRoute.district;
  const site={boxes:[],create:(combat,enc)=>createExercise(id,site,combat,enc)};
  sky(root,world,id);
  if(id==='dock'){water(root,world);estuary(root);dock(root,site,batch);}
  else if(id==='summit')summit(root,site,batch,world.A);
  else ({fold,echo,rail})[id](root,site,world);
  if(id!=='rail'){
    for(const box of site.boxes)world.addCollider(box);
    site.boxes=site.gates?.map(g=>g.box)||[];
  }
  return site;
}
