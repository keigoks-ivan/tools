import * as THREE from 'three';
import {Faces,facadeMaps,tileWidths} from '../city-facades.mjs';
import {fieldMaterial,signAtlas} from '../front-scenery.mjs';
import {fieldTreeGeometry} from '../fieldart.js';
import {carGeometry} from '../env.js';
import {instancedCarMaterial} from '../car-material.js';
import {districtLandmark,twinTowers} from './landmarks.mjs';
import {valleyFrame} from './valley.mjs';
import {createConvoy} from './traffic.mjs';

const districts=['brickfields','market','merdeka','kampung','bintang','titiwangsa','klcc'];
const pastels=[0xcebd9c,0xa8bcad,0xc99e8f,0xc2b693,0x9bb9bf,0xd0c6b3];
const plaster=0xd8ceb7,shade=0x484e4a,iron=0x637276,terracotta=0x945d4c;
function archGeometry(){
  const shape=new THREE.Shape();
  shape.moveTo(-.5,1);shape.lineTo(.5,1);shape.lineTo(.5,0);shape.lineTo(.38,0);
  shape.bezierCurveTo(.38,.80,-.38,.80,-.38,0);shape.lineTo(-.5,0);shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:9}).translate(0,0,-.5);
}
function starPrism(){
  const s=new THREE.Shape();
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,r=i%2?.789:1,x=r*Math.cos(a),y=r*Math.sin(a);
    if(i)s.lineTo(x,y);else s.moveTo(x,y);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false}).translate(0,0,-.5).rotateX(-Math.PI/2);
}
// An entire palm crown is one repeated mesh. Split leaflets leave sky visible through the tips.
function palmCrown(){
  const vertices=[];
  for(let i=0;i<11;i++){
    const a=i*2.4,cs=Math.cos(a),sn=Math.sin(a),len=3.2+.55*Math.sin(i*4.2);
    const point=(t,off,drop)=>[cs*t*len-sn*off,1.18*Math.sin(t*Math.PI)-1.35*t*t+drop,sn*t*len+cs*off];
    for(let j=0;j<10;j++){
      const t=j/10;
      for(const side of [-1,1]){
        const width=(.09+.62*Math.sin(Math.PI*(t+.07)))*side;
        vertices.push(...point(t,0,0),...point(t+.067,0,0),...point(t+.16,width,-.21));
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
export function buildKL(world,root){
  const route=world.fieldRoute,id=route.district,di=districts.indexOf(id);
  if(di<0)throw Error('Unknown Kuala Lumpur district '+id);
  root.name='吉隆坡・'+id;
  const frame=valleyFrame(id);world.bearingOffset=frame.bearing;
  world.terrainMesh?.material.userData.setDistrict(frame);
  let seed=41161+di*981;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const pick=list=>list[Math.floor(rand()*list.length)];
  const standard=(roughness,metalness,extra={})=>new THREE.MeshStandardMaterial({roughness,metalness,...extra});
  const facades=facadeMaps(world).map(([map,normalMap,roughnessMap],i)=>new Faces(new THREE.MeshStandardMaterial({
    vertexColors:true,map:map??null,normalMap:normalMap??null,roughnessMap:roughnessMap??null,
    normalScale:new THREE.Vector2(.22,.22),roughness:i===0?.42:.83,metalness:i===0?.33:.035
  })));
  if(typeof document!=='undefined' && !world.klStreetTexture){
    const url=new URL('./street-materials.webp',import.meta.url);
    // This district asset is versioned with its module; the shared-asset CDN is pinned independently.
    world.klStreetTexture=new THREE.TextureLoader(new THREE.LoadingManager()).load(url.href);
    world.klStreetTexture.colorSpace=THREE.SRGBColorSpace;world.klStreetTexture.anisotropy=4;
  }
  const streetFaces=new Faces(standard(.81,.06,{vertexColors:true,map:world.klStreetTexture??null}));
  function panel(pts,tile,tint){
    const x=(tile%2)*.5,y=tile<2?.5:0,lo=.0015,hi=.4985;
    streetFaces.quad(pts,[[x+lo,y+lo],[x+hi,y+lo],[x+hi,y+hi],[x+lo,y+hi]],tint);
  }
  function cladding(x,z,w,d,base,h,tile,tint){
    const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2;
    for(const [u,v] of [[[a,e],[b,e]],[[b,c],[a,c]],[[a,c],[a,e]],[[b,e],[b,c]]])
      panel([[u[0],base,u[1]],[v[0],base,v[1]],[v[0],base+h,v[1]],[u[0],base+h,u[1]]],tile,tint);
  }
  const floors={
    road:new Faces(fieldMaterial(world,0xa6a8a3,.84,.085,'asphalt',true)),
    pavement:new Faces(fieldMaterial(world,0xd1cdba,.88,.04,'precast',true)),
    grass:new Faces(new THREE.MeshStandardMaterial({vertexColors:true,map:world.A?.grassD??null,roughness:.96})),
  };
  const batches=new Map(),signs=[],pose=new THREE.Object3D(),col=new THREE.Color();
  const bucket=(key,geo,material,owned=true)=>batches.set(key,{geo,material,owned,matrices:[],colors:[]});
  bucket('solid',new THREE.BoxGeometry(),standard(.68,.12));
  bucket('window',new THREE.BoxGeometry(),standard(.21,.42));
  bucket('paint',new THREE.BoxGeometry(),standard(.84,.025));
  bucket('pole',new THREE.CylinderGeometry(.82,1,1,9),standard(.64,.19));
  bucket('arch',archGeometry(),standard(.79,.04));
  bucket('dome',new THREE.LatheGeometry([[.75,0],[.97,.16],[1,.33],[.89,.51],[.62,.70],[.23,.86],[.025,1]].map(([x,y])=>new THREE.Vector2(x,y)),20),standard(.48,.42));
  bucket('dial',new THREE.SphereGeometry(1,16,8),standard(.64,.15));
  bucket('star',starPrism(),standard(.29,.54));
  bucket('spire',new THREE.ConeGeometry(1,1,16),standard(.27,.63));
  bucket('frond',palmCrown(),standard(.85,0,{side:THREE.DoubleSide}));
  if(typeof document!=='undefined'){
    world.prepareFoliage();
    world.klTree??=fieldTreeGeometry(false,1,true);
    bucket('tree',world.klTree,world.fieldTreeMaterial,false);
  }
  bucket('car',carGeometry(1),instancedCarMaterial(world.A?.rubD),false);
  function put(k,x,y,z,w,h,d,tint,ry=0,rx=0,rz=0){
    const b=batches.get(k);pose.position.set(x,y,z);pose.rotation.set(rx,ry,rz,'YXZ');pose.scale.set(w,h,d);pose.updateMatrix();
    b.matrices.push(pose.matrix.clone());b.colors.push(tint);
  }
  const box=(x,y,z,w,h,d,tint,...rot)=>put('solid',x,y,z,w,h,d,tint,...rot);
  const pane=(...args)=>put('window',...args);
  const wall=(x,z,w,d,top,bottom)=>world.addCollider({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top,...(bottom===undefined?{}:{bottom})});
  const sign=(...args)=>signs.push(args);
  function beam(a,b,w,h,tint){
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
    box((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,h,length,tint,Math.atan2(dx,dz),-Math.asin(dy/length));
  }
  function ground(k,x,z,w,d,y,tint,scale=6){
    const pts=[[x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y,z-d/2]];
    floors[k].quad(pts,pts.map(v=>[v[0]/scale,v[2]/scale]),tint);
  }
  function lake(outline,color){
    const s=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
    const g=new THREE.ShapeGeometry(s).rotateX(-Math.PI/2).translate(0,.31,0);
    const m=new THREE.Mesh(g,standard(.16,.48,{color,normalMap:world.A?.asphN??null,normalScale:new THREE.Vector2(.10,.19)}));
    const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/22,uv.getY(i)/11);
    m.name='tasik';m.receiveShadow=true;m.userData.fieldGeometry=m.userData.fieldMaterial=true;root.add(m);
  }
  function tree(x,z,k=1,palm=false){
    const angle=rand()*6.28;
    if(palm){
      const height=(8.5+rand()*2)*k;
      put('pole',x,height/2,z,.26*k,height,.26*k,0x877a60);
      put('frond',x,height,z,1.23*k,k,1.23*k,pick([0x68864c,0x587243,0x768a4e]),angle);
    }else if(batches.has('tree'))put('tree',x,.24,z,k*1.53,k*1.28,k*1.37,0xabc695,angle);
  }
  function facade(x,z,w,d,h,style,tint,base=0){
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,T=tileWidths[style];
    for(const [a,b] of [[[x0,z1],[x1,z1]],[[x1,z0],[x0,z0]],[[x0,z0],[x0,z1]],[[x1,z1],[x1,z0]]]){
      const u=Math.hypot(b[0]-a[0],b[1]-a[1])/T;
      facades[style].quad([[a[0],base,a[1]],[b[0],base,b[1]],[b[0],base+h,b[1]],[a[0],base+h,a[1]]],[[0,0],[u,0],[u,h/T],[0,h/T]],tint);
    }
  }
  function tower(x,z,w,d,h,style,far=false){
    const paint=pick([0xe1e1d5,0xc7d3cd,0xd3c9c0,0xc5ced1]);
    facade(x,z,w,d,h,style,paint);box(x,h+.35,z,w+.6,.7,d+.6,0x8d9795);
    if(far && h>52){
      const upper=h*(.06+rand()*.15);
      facade(x,z,w*.69,d*.74,upper,style,paint,h+.7);
      box(x,h+upper+.9,z,w*.70,.46,d*.75,0x9faaa9);
      if(h>100)put('pole',x,h+upper+4,z,.3,7,.3,iron);
    }
    if(!far){
      wall(x,z,w,d,h+.7);
      box(x+2,h+1.65,z-2,w*.47,2.6,d*.48,0x9a9e96);
      if(h>45)for(let y=8;y<h-2;y+=style===0?12:8){
        box(x,y,z-d/2,w*.96,.48,1.1,0xa9b0a9);
        if(style!==0)box(x,y+.67,z-d/2-.4,w*.89,.8,.16,0x88938f);
      }
      if(h>90){
        facade(x,z,w*.71,d*.72,8.6,style,paint,h+.7);
        box(x,h+9.5,z,w*.72,.46,d*.73,0x9faaa9);
      }
    }
  }
  const business=['KEDAI KOPI','KEDAI RUNCIT','RESTORAN','KEDAI BUKU','BAKERI','KLINIK'];
  function shophouse(x,z,side,w,h,tint){
    const d=17,front=z+side*d/2;
    cladding(x,z,w,d,.2,h,rand()<.55?0:1,pick([0xf9f6e3,0xe0eae3,0xcbdad6,0xf6e2cd]));
    wall(x,z,w,d,h+.2);
    box(x,h+.42,front,w,.57,.73,tint);
    box(x,3.68,front+side*1.25,w+.10,.22,3.45,pick([0x898879,0x778d83,terracotta]));
    for(const off of [-.46,.46])box(x+w*off,1.84,front+side*2.68,.34,3.67,.42,plaster);
    const a=x-w/2,b=x+w/2,c=z-d/2,e=z+d/2;
    panel([[a,h+.24,c],[a,h+.62,e],[b,h+.62,e],[b,h+.24,c]],3,0xdbd7c7);
    if(signs.length<24 && rand()<.11)sign(pick(business),x,4.37,front+side*.45,side>0?0:Math.PI,w*.84);
  }
  function village(x,z,k){
    const h=4.3*k,w=9.4*k,d=13*k,base=1.48*k;
    const paint=pick([0x977552,0xa29b75,0xacb1a0,0x728c80,0xb29879]);
    for(const sx of [-1,1])for(const sz of [-1,1])box(x+sx*w*.40,base/2,z+sz*d*.40,.46,base,.48,0x655746);
    cladding(x,z,w,d,base,h,2,pick([0xf3e9d9,0xcadacc,0xd4d3c1,0xdcbfa6]));wall(x,z,w,d,h+base);
    const ridge=base+h+w*.29,eaves=base+h-.17,left=x-w*.61,right=x+w*.61,back=z+d*.57,front=z-d*.57;
    panel([[left,eaves,front],[left,eaves,back],[x,ridge,back],[x,ridge,front]],3,paint);
    panel([[x,ridge,front],[x,ridge,back],[right,eaves,back],[right,eaves,front]],3,paint);
    for(const sz of [-1,1]){
      const zz=z+sz*d*.50;
      // The end wall fills the gable under the pitched metal sheets.
      box(x,base+h+.42,zz,w*.64,.87,.23,paint);
      beam([left,eaves,zz],[x,ridge,zz],.28,.24,plaster);
      beam([x,ridge,zz],[right,eaves,zz],.28,.24,plaster);
    }
    box(x,base,z-d*.60,w*.75,.35,d*.24,paint);
    box(x,base+h*.82,z-d*.60,w*.85,.25,d*.30,0x907963,0,-.18);
    for(const sx of [-1,1])box(x+sx*w*.34,base+h*.42,z-d*.70,.18,h*.85,.18,paint);
  }
  const lakeBlock=(x,z)=>id==='titiwangsa' && x>=-160 && x<320 && z>=-160 && z<320;
  const landmarkBlock=(x,z)=>x===80 && z===80 && ['klcc','market','merdeka','bintang'].includes(id) || id==='merdeka'&&x===80&&z===-80;
  // Asphalt is continuous at junctions. Segments meet at a shared edge to avoid coplanar surfaces.
  for(let i=-4;i<=4;i++)for(let j=-4;j<=4;j++){
    const x=i*160,z=j*160,open=lakeBlock(x,z);
    if(!open || x===-160 || z===-160)ground('road',x,z,28,28,.14,0xf0efea);
    const east=!open || z===-160,south=!open || x===-160;
    if(east && i<4){
      ground('road',x+80,z,132,28,.14,0xf0eeea);
      for(let q=24;q<150;q+=16)put('paint',x+q,.18,z,6,.055,.15,0xdddac7);
    }
    if(south && j<4){
      ground('road',x,z+80,28,132,.14,0xe6e5df);
      for(let q=24;q<150;q+=16)put('paint',x,.18,z+q,.15,.055,6,0xdddac7);
    }
    if(i>=4||j>=4)continue;
    const cx=x+80,cz=z+80;
    if(open){
      ground('grass',cx,cz,160,160,.095,0xc3cb98,9);
      for(let n=0;n<9;n++){
        const px=cx+(rand()-.5)*134,pz=cz+(rand()-.5)*134;
        if(Math.hypot((px-45)/200,(pz-78)/198)>1.12)tree(px,pz,1+rand()*.45);
      }
      continue;
    }
    const green=id==='kampung'||landmarkBlock(cx,cz)&&id==='merdeka'&&cz<0;
    ground(green?'grass':'pavement',cx,cz,132,132,.20,green?0xd1cd99:0xe6e1d5,green?10:5);
    // Concrete kerbs, storm grates and shaded five-foot ways separate foot traffic from the carriageway.
    for(const side of [-1,1]){
      box(cx,.18,cz+side*66,132,.36,.34,0xaaaba0);
      box(cx+side*66,.18,cz,.34,.36,132,0xaaaba0);
      if(Math.abs(cx)<500&&Math.abs(cz)<500){
        box(cx+side*35,.168,cz-66.8,1.8,.035,.48,0x515957);
        for(let j=0;j<8;j++)box(cx+side*35-.73+j*.2,.195,cz-66.8,.054,.035,.45,iron);
      }
    }
    if(landmarkBlock(cx,cz))continue;
    const urban=id==='klcc'||id==='bintang',near=Math.abs(cx)<515 && Math.abs(cz)<515;
    if(id==='kampung'&&near){
      for(let a=0;a<3;a++)for(let b=0;b<3;b++){
        const px=cx+(a-1)*38+(rand()-.5)*12,pz=cz+(b-1)*37+(rand()-.5)*11;
        village(px,pz,.85+rand()*.50);tree(px+12,pz+5,.84+rand()*.43,rand()<.62);
      }
    }else if((!urban && id!=='titiwangsa' && rand()<.77 || (id==='bintang'&&rand()<.34)) && near){
      for(const side of [-1,1]){
        const half=rand()>.5?4:5,w=110/(half*2);
        for(let n=0;n<2*half;n++)shophouse(cx-55+(n+.5)*w,cz+side*48,side,w-.16,7.4+rand()*3.6,pick(pastels));
      }
      tower(cx,cz,36+rand()*16,34,12+rand()*23,2);
    }else{
      for(const side of [-1,1]){
        const w=27+rand()*16,d=29+rand()*29,h=(urban?38:17)+rand()*(urban?84:42);
        tower(cx+side*(29+rand()*3),cz+(rand()-.5)*52,w,d,h,urban&&rand()>.30?0:Math.floor(rand()*4));
      }
    }
    for(const side of [-1,1]){
      tree(cx+side*54,cz-61,.89+rand()*.32,!(id==='titiwangsa')&&rand()<.44);
      if(near && rand()<.72)put('car',cx+side*24,.18,cz-69,1,1,1,pick([0xa3adaa,0xa64742,0xd2cfc2,0x52646e]),side>0?Math.PI:0);
    }
    if(near){
      const px=x+16.2,pz=z+19;
      put('pole',px,4.4,pz,.16,8.8,.16,iron);
      box(px-1.24,8.9,pz,2.75,.17,.20,iron);box(px-2.75,8.81,pz,.93,.17,.37,0xd3cdb1);
      for(let f=-4;f<=4;f++)put('paint',x+f*1.15,.20,z+11,.55,.035,3.1,0xd6d3c1);
    }
  }
  // Distance is compressed, but the low roofs and the skyline stay on separate depth planes.
  for(let i=0;i<102;i++){
    const a=i*2.399+.23*rand(),r=800+rand()*150,x=r*Math.cos(a),z=r*Math.sin(a);
    tower(x,z,21+rand()*28,20+rand()*30,24+rand()**2*134,rand()<.53?0:1,true);
  }
  const props={put,box,wall,sign,beam,ground,lake,tree,facade};
  if(id!=='klcc'){
    const [x,z]=frame.twins;twinTowers(props,x,z,.73,false);
  }
  // Menara KL's narrow shaft, glazed observation head and antenna break up the office skyline.
  const [mx,mz]=[[698,495],[695,415],[723,230],[625,-690],[-705,330],[-490,-868],[-748,365]][di];
  put('pole',mx,82,mz,5.3,164,5.3,0xb8b6a8);
  put('spire',mx,171,mz,16,15,16,0xaeb2aa,0,Math.PI);
  put('pole',mx,182,mz,16,10,16,0x546771);
  for(const h of [176,182,188])put('pole',mx,h,mz,16.1,.95,16.1,0xc4c2b3);
  put('pole',mx,201,mz,2.3,27,2.3,0xaca79e);put('spire',mx,229,mz,1.5,32,1.5,0xb5aaa0);
  districtLandmark(props,id);
  const localNames=['BRICKFIELDS','PASAR SENI','DATARAN MERDEKA','KAMPUNG BARU','BUKIT BINTANG','TITIWANGSA','KLCC'];
  for(const i of [1,3,6]){
    const [x,z]=route.pts[i];
    for(const side of [-1,1]){
      put('pole',x+side*15,2.05,z+side*15,.13,4.1,.13,iron);
      sign(localNames[di],x+side*15,4.3,z+side*15,side>0?Math.PI:0,8.5);
    }
  }
  for(const [name,f] of Object.entries(floors))f.finish(root,name,false);
  streetFaces.finish(root,'吉隆坡街屋立面');
  facades.forEach((f,i)=>f.finish(root,'frontage-'+i));
  for(const [name,b] of batches){
    if(!b.matrices.length){if(b.owned)b.geo.dispose();if(name!=='tree')b.material.dispose();continue;}
    const m=new THREE.InstancedMesh(b.geo,b.material,b.matrices.length);
    b.matrices.forEach((mat,i)=>{m.setMatrixAt(i,mat);m.setColorAt(i,col.setHex(b.colors[i]));});
    m.name=name;m.receiveShadow=true;m.castShadow=name!=='paint';m.userData.fieldGeometry=b.owned;m.userData.fieldMaterial=name!=='tree';
    if(name==='tree'){m.customDepthMaterial=world.fieldTreeDepth;m.userData.fieldTree=true;m.visible=!!world.fieldFoliageReady;}
    m.computeBoundingSphere();root.add(m);
  }
  const water=root.getObjectByName('tasik');
  if(water && world.renderer){
    water.visible=false;
    try{
      world.klReflections=world.captureCarEnvironment(new THREE.Vector3(45,2,78));
      water.material.envMap=world.klReflections.texture;water.material.envMapIntensity=1.3;
    }finally{water.visible=true;}
  }
  world.klSigns=signAtlas(root,signs);
  world.klConvoy=createConvoy(root,route);
}
