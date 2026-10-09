import * as THREE from 'three';
import { Solid, Builder } from '../mech/zero/kit.js';
import { Navigation } from './navigation.mjs';
import { forestCanopy } from '../mech/kobe-autumn.js';

const clamp=THREE.MathUtils.clamp;
export const BOUNDS={x0:-32,x1:32,z0:-47,z1:63};

// All detail is baked into material buckets. Sloping roads use the same height
// function as infantry collision and navigation, so decoration cannot create traps.
export function buildBattlefield(scene, materials, scenario) {
  const id=scenario.id, root=new THREE.Group();root.name='infantry-'+id;scene.add(root);
  const solid=new Solid(), signs=[], lamps=[], trees=[], buildings=[], cover=[],environmentUpdates=[];
  const ownedMaterials=new Set(),ownedTextures=new Set(),ownedGeometries=new Set();
  const paint=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82,metalness:0,vertexColors:true,normalMap:materials.concrete.normalMap,normalScale:new THREE.Vector2(.12,.12)});
  paint.userData.tile=3;paint.userData.noCast=true;ownedMaterials.add(paint);
  const glass=new THREE.MeshStandardMaterial({color:0x253b45,roughness:.2,metalness:.18,vertexColors:true});glass.userData.tile=3;ownedMaterials.add(glass);
  const mats={...materials,paint,glass};
  const b=new Builder(mats,solid);
  const ground=(x,z)=>id==='dam'?clamp((z-3)/35,0,1)*5.6:id==='pass'?clamp((z+30)/88,0,1)*5.4:id==='city'?clamp((z+15)/70,0,1)*2.6:id==='forest'?Math.max(0,.24*Math.sin(z*.09)+.16*Math.sin(x*.18+z*.05)+.12):0;
  const floorAt=solid.floorAt.bind(solid),ray=solid.ray.bind(solid);
  solid.floorAt=(x,z,yRef,r=0)=>Math.max(ground(x,z),floorAt(x,z,yRef,r));
  solid.ray=(o,d,max,skip)=>{
    let hit=ray(o,d,max,skip),best=hit?.t??max;
    if(id==='pass'||id==='dam'||id==='city'||id==='forest')for(let t=.1;t<best;t+=.5){
      if(o.y+d.y*t<=ground(o.x+d.x*t,o.z+d.z*t)){
        let lo=Math.max(0,t-.5),hi=t;for(let k=0;k<7;k++){const m=(lo+hi)/2;if(o.y+d.y*m<=ground(o.x+d.x*m,o.z+d.z*m))hi=m;else lo=m;}
        const x=o.x+d.x*hi,z=o.z+d.z*hi,h=.03;
        hit={t:hi,n:new THREE.Vector3(ground(x-h,z)-ground(x+h,z),h*2,ground(x,z-h)-ground(x,z+h)).normalize(),mat:'floor',b:null};break;
      }
    }
    return hit;
  };
  const box=(m,x,z,w,h,d,o={})=>{const y=ground(x,z),base=o.base??0;b.block(m,x-w/2,x+w/2,y+base,y+base+h,z-d/2,z+d/2,{ground:y+base,...o});};
  const deco=(m,x,z,w,h,d,y=0,o={})=>box(m,x,z,w,h,d,{...o,solid:false,base:y});
  const sign=(x,z,zh,en,w=4,y=2,ry=Math.PI)=>signs.push({x,z,y:ground(x,z)+y,w,zh,en,ry});
  const wall=(x,z,w,h,d,m='wall',o={})=>box(m,x,z,w,h,d,o);
  const geo=(m,g,x,y,z,ry=0,o={})=>{b.mesh(m,g,x,y,z,ry,{shade:1,...o});g.dispose();};
  const beam=(m,a,c,r=.045,tint=[.6,.64,.64])=>{
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...c),d=q.clone().sub(p),g=new THREE.CylinderGeometry(r,r,d.length(),6,1,true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));geo(m,g,...p.add(q).multiplyScalar(.5).toArray(),0,{tint});
  };
  const pipe=(m,x,y,z,r,h,tint=[.58,.63,.65])=>geo(m,new THREE.CylinderGeometry(r,r,h,14),x,y+h/2,z,0,{tint});
  const surface=(m,x0,x1,z0,z1,lift=.02,tint=[1,1,1])=>{
    const count=Math.ceil((z1-z0)/2);
    for(let i=0;i<count;i++){
      const a=z0+(z1-z0)*i/count,c=z0+(z1-z0)*(i+1)/count;
      const points=[[x0,ground(x0,c)+lift,c],[x1,ground(x1,c)+lift,c],[x1,ground(x1,a)+lift,a],[x0,ground(x0,a)+lift,a]];
      const n=new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])).cross(new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0]))).normalize();
      b.B[m].quad(...points,n.toArray(),[1,1,1,1],null,tint);
    }
  };
  const line=(x,z,w,d,tint=[.85,.78,.53])=>surface('paint',x-w/2,x+w/2,z-d/2,z+d/2,.045,tint);
  const sandbags=(x,z,w=5)=>{
    const y=ground(x,z);
    for(let row=0;row<3;row++)for(let j=0;j<Math.ceil(w/.86);j++)b.obox('fabric',x-w/2+j*.86+(row%2)*.23,y+.16+row*.28,z,.46,.17,.34,(j%3-1)*.04,{solid:false,ground:y,tint:[.68,.71,.56]});
    solid.add({x0:x-w/2-.45,x1:x+w/2+.45,y0:y,y1:y+.94,z0:z-.34,z1:z+.34,mat:'fabric'});
    cover.push({x,z:z-1.1,y});
  };
  const crate=(x,z,w=2,h=1.8,d=2,tint=[.58,.64,.58])=>{
    box('metal',x,z,w,h,d,{tint});deco('rust',x,z,w+.04,.08,d+.04,.12);deco('rust',x,z,w+.04,.08,d+.04,h-.16);
    for(const xx of [x-w*.38,x+w*.38])deco('metal',xx,z-.51*d,.065,h-.14,.06,.07,{tint:[.36,.39,.39]});
  };
  const gableRoof=(x,z,w,d,h,rise=1.8,tint=[.29,.32,.31])=>{
    const y=ground(x,z)+h;
    for(const [a,c,ya,yc]of [[x-w/2-.45,x,y,y+rise],[x,x+w/2+.45,y+rise,y]]){
      const n=new THREE.Vector3(ya-yc,c-a,0).normalize().toArray();
      b.B.corr.quad([a,ya,z-d/2-.45],[a,ya,z+d/2+.45],[c,yc,z+d/2+.45],[c,yc,z-d/2-.45],n,[1,1,1,1],null,tint);
    }
    for(const zz of [z-d/2,z+d/2]){const pts=[[x-w/2,y,zz],[x+w/2,y,zz],[x,y+rise,zz],[x,y+rise,zz]];if(zz<z)pts.reverse();b.B.brick.quad(...pts,[0,0,zz<z?-1:1],[1,1,1,1]);}
    beam('rust',[x,y+rise,z-d/2-.5],[x,y+rise,z+d/2+.5],.07);
  };
  const building=(x,z,w,h,d,label,opts={})=>{
    const y=ground(x,z);buildings.push({x,z,w,h,d,y,factory:opts.factory??['rail','underground','airfield','dam'].includes(id),facade:opts.facade!==false});
    box(opts.mat??'brick',x,z,w,h,d,{tint:opts.tint??[.82,.85,.81]});
    deco('concrete',x,z,w+.34,.26,d+.34,h,{tint:[.65,.67,.63]});
    deco('concrete',x,z,w+.12,.3,d+.12,.04,{tint:[.68,.71,.67]});
    if(opts.gable)gableRoof(x,z,w,d,h,.8+w*.09);
    else{
      for(const zz of [z-d/2,z+d/2])deco('concrete',x,zz,w+.35,.45,.18,h+.25);
      for(const xx of [x-w/2,x+w/2])deco('concrete',xx,z,.18,.45,d+.35,h+.25);
      deco('metal',x+w*.23,z+1,1.4,.8,1.4,h+.28,{tint:[.38,.43,.43]});
      pipe('metal',x-w*.26,y+h,z+1,.13,1.7);deco('metal',x-w*.26,z+1,.65,.1,.65,h+1.7);
    }
    if(opts.facade===false)for(let yy=2;yy<h-1;yy+=2.8)for(let xx=x-w/2+1.2;xx<x+w/2-1;xx+=2.2){
      deco('glass',xx,z-d/2-.035,1.1,1.45,.055,yy);deco('concrete',xx,z-d/2-.1,1.35,.12,.15,yy-.08);
    }
    // Rain pipes, service risers, satellite dishes and vents give every roof a silhouette.
    for(const xx of [x-w/2+.12,x+w/2-.12])pipe('rust',xx,y+.2,z-d/2-.13,.065,h-.3);
    if(label)sign(x,z-d/2-.2,label[0],label[1],Math.min(w-1,7),Math.min(h-.9,3.8));
  };
  const lamp=(x,z,y=5,color=0xffddb1)=>{
    pipe('metal',x,ground(x,z),z,.075,y);deco('metal',x-.45,z,1.15,.1,.24,y);deco('metal',x-.8,z,.75,.12,.45,y-.1);
    lamps.push({x:x-.8,z,y:ground(x,z)+y-.18,color});
  };
  const railing=(x,z0,z1,h=1.2)=>{
    for(let z=z0;z<=z1;z+=3){pipe('metal',x,ground(x,z),z,.045,h);deco('metal',x,z,.18,.07,.18,.03);}
    for(const y of [.55,h])beam('metal',[x,ground(x,z0)+y,z0],[x,ground(x,z1)+y,z1],.035);
  };
  const rock=(x,z,size,k=0)=>{
    const g=new THREE.DodecahedronGeometry(1,1),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const xx=p.getX(i),yy=p.getY(i),zz=p.getZ(i),n=.86+.18*Math.sin(xx*4+zz*7+k);p.setXYZ(i,xx*size*n,yy*size*(1.3+.18*Math.sin(k)),zz*size*.77);}g.computeVertexNormals();
    geo(mats.rock?'rock':'wall',g,x,ground(x,z)+size*.6,z,k*.63,{tint:[.74,.79,.72]});
  };
  const tree=(x,z,k=0,pine=true)=>{
    const scale=.75+(k%5)*.075;trees.push([x,z,scale,pine]);
    if(Math.abs(x)<32&&z>-47&&z<63)solid.add({x0:x-.25,x1:x+.25,z0:z-.25,z1:z+.25,y0:ground(x,z),y1:ground(x,z)+7*scale,mat:'wood'});
  };
  const tank=(x,z,r=1.5,h=4)=>{
    const y=ground(x,z);pipe('metal',x,y,z,r,h,[.46,.54,.55]);geo('metal',new THREE.SphereGeometry(r,12,8,0,Math.PI*2,0,Math.PI/2),x,y+h,z,0,{tint:[.54,.59,.6]});
    for(let k=0;k<4;k++){const a=k*Math.PI/2;pipe('metal',x+Math.cos(a)*r*.7,y,z+Math.sin(a)*r*.7,.1,.6);}
    pipe('rust',x+r,y,z,.1,h+.1);beam('rust',[x+r,y+h+.1,z],[x+r+1,y+h+.1,z],.1);
    solid.add({x0:x-r,x1:x+r,z0:z-r,z1:z+r,y0:y,y1:y+h+r,mat:'metal'});
  };

  // Smooth, layered mountain ridges use the campaign's forest canopy texture.
  // A heightfield gives natural saddles and folded shoulders rather than giant
  // polyhedron silhouettes. These meshes are distant scenery, outside navigation.
  const ridge=(center,width,depth,height,phase=0)=>{
    const geometry=new THREE.PlaneGeometry(width,depth,80,36).rotateX(-Math.PI/2),position=geometry.attributes.position,uv=geometry.attributes.uv,col=new Float32Array(position.count*3);
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),z=position.getZ(i)+center,v=(position.getZ(i)+depth/2)/depth;
      const crest=.64+.16*Math.sin(x*.022+phase)+.11*Math.sin(x*.047-phase*.7)+.08*Math.cos(x*.073+phase*1.5);
      const folded=Math.pow(Math.max(0,Math.sin(v*Math.PI)),1.35)*height*crest;
      const detail=(Math.sin(x*.13+z*.04)*Math.cos(z*.11)*4.7+Math.sin(x*.061-z*.07)*3.2)*Math.sin(v*Math.PI);
      position.setXYZ(i,x,ground(x,z)+folded+detail,z);uv.setXY(i,x/6,z/6);
      const patch=Math.sin(x*.081+z*.052)+Math.cos(x*.027-z*.043),shade=.62+.24*Math.sin(x*.039+z*.023);col.set([shade*(patch>.5?.82:1),shade*(patch<-.4?.84:1.03),shade*(patch>.5?.57:.73)],i*3);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geometry.computeVertexNormals();
    const material=(mats.grass??mats.floor).clone();material.color.set(0x788771);material.normalScale?.setScalar(.22);ownedMaterials.add(material);
    const compile=(mats.grass??mats.floor).onBeforeCompile;
    material.onBeforeCompile=sh=>{
      compile?.(sh);sh.uniforms.infantryCanopy={value:forestCanopy()};
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRidgeWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRidgeWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D infantryCanopy; varying vec3 vRidgeWorld;').replace('#include <color_fragment>','#include <color_fragment>\nvec3 canopySample=texture2D(infantryCanopy,vRidgeWorld.xz/64.0).rgb;float canopyCluster=smoothstep(.24,.72,canopySample.r);diffuseColor.rgb*=mix(vec3(.34,.49,.31),vec3(1.07,.99,.71),canopySample.g)*(.55+canopySample.b*.67)*( .72+canopyCluster*.35 );');
    };
    material.customProgramCacheKey=()=> 'infantry-layered-ridge-v1';
    ownedGeometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.name='layered-forest-ridge';mesh.receiveShadow=true;mesh.castShadow=false;root.add(mesh);
  };
  const terrainMat=id==='forest'||id==='pass'?mats.grass??mats.floor:id==='dam'?mats.concrete:mats.floor;
  const g=new THREE.PlaneGeometry(220,280,66,84).rotateX(-Math.PI/2),p=g.attributes.position,uv=g.attributes.uv,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),edge=Math.max(0,Math.abs(x)-34),relief=id==='pass'?Math.pow(edge,.82)*.24*(.85+.2*Math.sin(z*.035+x*.03)):id==='forest'?edge*.045:0;
    p.setY(i,id==='dam'&&(x<-34||z>69)?-13+Math.sin(x*.04+z*.03):ground(x,z)+relief-.018);uv.setXY(i,x/(terrainMat.userData.tile??4),z/(terrainMat.userData.tile??4));
    const shade=.82+.08*Math.sin(x*.15+z*.08)+.05*Math.sin(z*.37);colors.set([shade,shade*(id==='forest'?1.03:1),shade*.95],i*3);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  ownedGeometries.add(g);const terrain=new THREE.Mesh(g,terrainMat);terrain.name='battlefield-heightfield';terrain.receiveShadow=true;root.add(terrain);
  // Physical perimeter uses matching visible scenery. It cannot create a hidden enemy pocket.
  for(const x of [-33,33])solid.add({x0:x-.5,x1:x+.5,z0:-49,z1:66,y0:-2,y1:20,mat:'concrete'});
  for(const z of [-49,65])solid.add({x0:-34,x1:34,z0:z-.5,z1:z+.5,y0:-2,y1:20,mat:'concrete'});
  if(id==='underground'){wall(-33,8,1,8,114,'concrete');wall(33,8,1,8,114,'concrete');}
  else if(id==='dam'){wall(-33,8,1,2,114,'concrete');wall(33,8,1,2,114,'concrete');}
  else for(const x of [-32.7,32.7]){
    if(['city','rail','airfield'].includes(id))for(let z=-46;z<64;z+=6)pipe('metal',x,ground(x,z),z,.045,2.9);
    if(id==='city'||id==='rail')wall(x,8,.5,1.5,110,'brick');
  }
  for(const [x,z,w]of [[-8,-20,5],[9,-15,5],[-9,10,4],[8,13,4],[-8,36,5],[9,39,5]]){
    if(['pass','city','forest'].includes(id))sandbags(x,z,w);
    else{const width=id==='rail'?3.2:id==='airfield'?3.6:4,height=id==='dam'?1.15:id==='underground'?1.3:1.05;box(id==='dam'||id==='rail'?'concrete':'metal',x,z,width,height,id==='airfield'?2.2:1.2,{tint:id==='dam'?[.53,.62,.63]:id==='rail'?[.58,.57,.47]:[.4,.49,.47]});deco('rust',x,z,width+.08,.1,id==='airfield'?2.28:1.28,height,{tint:[.45,.46,.37]});cover.push({x,z:z-1.1,y:ground(x,z)});}
  }
  crate(-25,-36,3,2.3,2);crate(26,54,3,2.3,2);
  sign(0,-48,'撤離線 / 灰線步兵團','EVACUATION / GREYLINE',9,3);
  for(const z of [-34,0,32,57])lamp(29,z,id==='forest'?4.5:5);

  if(id==='pass'){
    surface(mats.asphalt?'asphalt':'floor',-4.5,4.5,-48,65,.025,[.62,.65,.64]);
    for(const z of [-38,-26,-14,-2,10,22,34,46,58])line(0,z,.14,5);
    for(const x of [-4.05,4.05])surface('paint',x-.06,x+.06,-48,65,.045,[.83,.82,.73]);
    for(const x of [-6.2,6.2]){
      for(let z=-36;z<59;z+=6){pipe('metal',x,ground(x,z)+.05,z,.045,.8);deco('concrete',x,z,.28,.18,.35);}
      for(let z=-36;z<59;z+=12)beam('metal',[x,ground(x,z)+.7,z],[x,ground(x,z+12)+.7,z+12],.07,[.65,.7,.71]);
    }
    for(const side of [-1,1])for(let i=0;i<11;i++){
      const z=-43+i*11,x=side*(35+(i%3)*2);rock(x,z,2.6+(i%4)*.7,i+side);tree(side*(28+(i%3)),z+3,i,true);
      surface(mats.grass?'grass':'floor',side<0?-23:16,side<0?-16:23,z,z+9,.025,[.83,.76,.62]);
    }
    // Tunnel portal: open central arch, real vault and retaining wings.
    const ty=ground(0,-44);
    for(let i=0;i<15;i++){
      const a=Math.PI*i/15,c=Math.PI*(i+1)/15,r0=9.2,r1=11.1;
      const pts=[[Math.cos(a)*r0,ty+2.8+Math.sin(a)*r0,-40],[Math.cos(c)*r0,ty+2.8+Math.sin(c)*r0,-40],[Math.cos(c)*r1,ty+2.8+Math.sin(c)*r1,-40],[Math.cos(a)*r1,ty+2.8+Math.sin(a)*r1,-40]];
      b.B.concrete.quad(...pts,[0,0,1],[1,1,1,1]);
      const inner=[[Math.cos(a)*r0,ty+2.8+Math.sin(a)*r0,-59],[Math.cos(c)*r0,ty+2.8+Math.sin(c)*r0,-59],pts[1],pts[0]];
      b.B.concrete.quad(...inner,[-Math.cos((a+c)/2),-Math.sin((a+c)/2),0],[.55,.55,.8,.8]);
    }
    wall(-10.1,-49,1.8,4,19,'concrete');wall(10.1,-49,1.8,4,19,'concrete');wall(-17,-44,12,8,5,'concrete');wall(17,-44,12,8,5,'concrete');
    sign(0,-39.9,'07 隧道 / 車隊撤離','TUNNEL 07 / CONVOY',12,10.3);
    building(-26,26,8,6.4,10,['山腰哨站','HILLSIDE POST'],{gable:true});building(27,45,8,6.4,13,['公路管制','ROAD CONTROL'],{gable:true});
    for(const [x,z]of [[-23,-8],[22,16],[-22,43]])crate(x,z,3,1.5,2);
    ridge(165,520,180,55,.4);ridge(280,660,210,82,1.7);ridge(395,780,220,98,3.1);
  }else if(id==='city'){
    surface(mats.asphalt?'asphalt':'floor',-18.8,18.8,-48,65,.025,[.68,.68,.67]);
    for(const x of [-20.1,20.1])surface('floor',x-1,x+1,-48,65,.045,[.79,.76,.7]);
    for(const x of [-27,27])for(const z of [-25,7,39])building(x,z,10,6.4+(z===7?6.4:3.2),21,['街區 09','DISTRICT 09'],{gable:z!==7,tint:x<0?[.9,.83,.72]:[.7,.76,.79]});
    building(-23,-41,16,3.2,9,['醫療站 / 撤離','CLINIC / EVAC'],{gable:true,tint:[.86,.82,.72]});
    for(const z of [-8,25,55])for(let x=-16;x<17;x+=2)line(x,z,1.25,2.8,[.8,.78,.68]);
    for(const z of [-38,-20,-2,16,34,52])line(0,z,.12,5,[.71,.67,.48]);
    for(const x of [-18.8,18.8])for(let z=-40;z<60;z+=4)deco('concrete',x,z,.2,.12,3.5,0,{tint:[.77,.75,.69]});
    wall(4,27,5,1.3,3,'plaster');wall(-3,30,3,2.4,2,'brick');
    for(const [x,z]of [[-17,-14],[18,17],[-16,44]]){crate(x,z,3,1.3,1.7);lamp(x,z+2,4);}
    // Broken balcony, phone cables and roof tanks provide the mountain-town skyline.
    for(const x of [-21.5,21.5])for(const z of [-20,16,42]){
      deco('concrete',x,z,2.7,.2,3,3.1);for(const zz of [z-1.4,z+1.4])beam('metal',[x-1.3,ground(x,z)+4.25,zz],[x+1.3,ground(x,z)+4.25,zz],.025);
      pipe('metal',x,ground(x,z)+3.2,z-1.4,.025,1.05);pipe('metal',x,ground(x,z)+3.2,z+1.4,.025,1.05);
    }
    for(const z of [-10,23,57])for(let i=0;i<12;i++)beam('metal',[-27+i*4.5,ground(0,z)+8+Math.sin(i/11*Math.PI)*-.75,z],[-27+(i+1)*4.5,ground(0,z)+8+Math.sin((i+1)/11*Math.PI)*-.75,z],.016,[.2,.22,.22]);
    for(let i=0;i<16;i++){const x=[-65,-47,-29,-12,12,29,47,65][i%8],z=84+Math.floor(i/8)*31+(i%3)*3;building(x,z,12+(i%3),6.4+(i%3)*3.2,15+(i%2)*2,null,{gable:i%3!==1,tint:i%2?[.74,.67,.53]:[.58,.66,.65]});}
    ridge(215,560,170,67,1.2);ridge(340,700,210,90,2.9);
  }else if(id==='forest'){
    surface(mats.grass?'grass':'floor',-8,8,-48,65,.025,[.66,.57,.41]);
    for(let i=0;i<85;i++){const side=i%2?1:-1,x=side*(19+(i*7)%13),z=-43+(i*13)%107;tree(x,z,i,true);}
    for(const side of [-1,1])for(let i=0;i<22;i++){const x=side*(11.8+(i%3)*2.7),z=-36+i*4.4+(side<0?0:2);if(scenario.targets.every(p=>Math.hypot(x-p.x,z-p.z)>3.3))tree(x,z,i,true);}
    for(const z of [-26,5,31,46]){sandbags(-21,z,7);sandbags(22,z+3,7);}
    // Low revetments, timber-lined gun pits and wooden duckboards remain walkable.
    for(const [x,z]of [[-15,-5],[15,22],[-15,48]]){
      for(const xx of [x-3,x+3]){wall(xx,z,.45,1.05,8,'wall',{tint:[.52,.51,.38]});for(let zz=z-3.5;zz<z+4;zz+=.6)pipe('rust',xx,ground(xx,zz),zz,.055,1.12,[.43,.37,.25]);}
      for(let zz=z-4;zz<z+4;zz+=.55)surface('rust',x-2.2,x+2.2,zz,zz+.42,.04,[.58,.47,.29]);
    }
    building(-26,25,6,3.2,8,['林間碉堡','FOREST BUNKER'],{mat:'concrete',facade:false,tint:[.53,.58,.48]});building(26,-38,8,3.2,8,['通訊站','RELAY'],{mat:'wall',gable:true});
    for(const side of [-1,1])for(let i=0;i<25;i++)tree(side*(40+(i%4)*8),-48+i*6,i,true);
    for(let i=0;i<35;i++)tree(-90+i*5.5,86+(i%4)*7,i,true);
    for(const side of [-1,1])for(let i=0;i<8;i++)rock(side*(42+i%2*14),-35+i*15,2+i%3,i);
    for(const [x,z]of [[-26,-10],[26,18],[-26,50]])for(let i=0;i<5;i++)beam('rust',[x-2,ground(x,z)+.2+i*.13,z+i*.27],[x+2,ground(x,z)+.2+i*.13,z+i*.27],.027,[.38,.4,.36]);
  }else if(id==='dam'){
    surface('concrete',-24,24,-48,65,.025,[.75,.8,.79]);
    // Buttresses and spillway faces stand beside the traversable maintenance ramp.
    for(const x of [-27,27])wall(x,10,5,2.3,68,'concrete',{tint:[.55,.64,.65]});
    surface('floor',-8,8,-48,65,.04,[.49,.57,.58]);
    for(const x of [-16.5,16.5])for(const z of [-26,5,37]){box('metal',x,z,3.7,1.7,4.2,{tint:[.36,.48,.48]});deco('rust',x,z,3.9,.18,4.4,1.7,{tint:[.44,.48,.4]});tank(x+(x<0?-3.4:3.4),z+2,1.2,2.8);}
    for(const z of [-31,-8,16,43]){line(0,z,44,.1,[.34,.4,.42]);lamp(-23,z,6);}
    for(const x of [-22.8,22.8])railing(x,-42,62);
    building(18,47,7,6.4,9,['閘門控制','GATE CONTROL'],{factory:true});building(-27,-35,9,6.4,13,['發電站','POWER STATION'],{factory:true});
    const waterMat=new THREE.MeshStandardMaterial({color:0x315c68,roughness:.25,metalness:.25,transparent:true,opacity:.94});ownedMaterials.add(waterMat);
    const waterTime={value:0};environmentUpdates.push(time=>{waterTime.value=time;});
    waterMat.onBeforeCompile=sh=>{sh.uniforms.infantryWaterTime=waterTime;sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vDamWater;').replace('#include <begin_vertex>','#include <begin_vertex>\nvDamWater=(modelMatrix*vec4(transformed,1.0)).xz;');sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vDamWater; uniform float infantryWaterTime;').replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(vDamWater.x*.46+vDamWater.y*.73+infantryWaterTime*.45)*sin(vDamWater.y*1.62-vDamWater.x*.21-infantryWaterTime*.71);diffuseColor.rgb*=.89+.11*ripple;');};waterMat.customProgramCacheKey=()=> 'infantry-reservoir-v1';
    const water=new THREE.Mesh(new THREE.PlaneGeometry(120,210).rotateX(-Math.PI/2),waterMat);water.position.set(-94,3.5,35);water.name='reservoir';ownedGeometries.add(water.geometry);root.add(water);
    const frontWater=new THREE.Mesh(new THREE.PlaneGeometry(66,85).rotateX(-Math.PI/2),waterMat);frontWater.position.set(0,4.5,111);ownedGeometries.add(frontWater.geometry);root.add(frontWater);
    for(let i=0;i<8;i++){
      const z=-42+i*16;geo('concrete',new THREE.CylinderGeometry(2.2,5.2,22,10),-39,-3,z,0,{tint:[.62,.69,.7]});
      wall(-35,z,7,13,3.2,'concrete');beam('metal',[-37,11,z],[-51,11,z],.18);pipe('metal',-48,-3,z,1.1,17,[.41,.5,.52]);
    }
    for(const z of [-29,0,32]){tank(31,z,1.65,4.2);deco('rust',30,z-5,2.4,.8,4.4,.2);}
    ridge(190,580,200,67,.5);ridge(325,740,220,98,2.2);
    // Three gate gantries and chain housings crown the dam at the far objective.
    for(const x of [-16,0,16]){for(const xx of [x-4,x+4])pipe('metal',xx,ground(xx,62),62,.16,10);deco('metal',x,62,8.5,.55,1.6,10);deco('rust',x,62,1.7,1.2,1.8,10.4);for(const xx of [x-.8,x+.8])beam('metal',[xx,ground(xx,62)+2,62],[xx,ground(xx,62)+10.1,62],.022);}
  }else if(id==='airfield'){
    surface(mats.asphalt?'asphalt':'floor',-19,19,-49,65,.025,[.69,.72,.73]);
    for(const z of [-38,-19,0,19,38,57]){line(0,z,.4,7,[.84,.83,.73]);for(const x of [-18,18])line(x,z,.13,12,[.77,.72,.44]);}
    for(const z of [-39,60])for(const x of [-15,-10,-5,5,10,15])line(x,z,1,6,[.81,.79,.65]);
    const hangar=(x,z)=>{
      const y=ground(x,z),w=10,d=24,h=5.5,rise=3;
      wall(x-w/2,z,.4,h,d,'brick');wall(x+w/2,z,.4,h,d,'brick');wall(x,z+d/2,w,h,.4,'corr');
      // Aircraft hangars have a segmented barrel roof and open sliding door recess.
      for(let i=0;i<18;i++){
        const a=Math.PI*i/18,c=Math.PI*(i+1)/18,xa=x-w/2*Math.cos(a),xb=x-w/2*Math.cos(c),ya=y+h+rise*Math.sin(a),yb=y+h+rise*Math.sin(c),n=[Math.sin((a+c)/2-Math.PI/2),Math.sin((a+c)/2),0];
        b.B.corr.quad([xa,ya,z-d/2],[xa,ya,z+d/2],[xb,yb,z+d/2],[xb,yb,z-d/2],n,[1,1,1,1],null,[.56,.65,.65]);
        if(i%3===0)beam('metal',[xa,ya-.1,z-d/2],[xa,ya-.1,z+d/2],.06);
      }
      wall(x-w/2+1.15,z-d/2,2.2,h,.28,'corr');wall(x+w/2-1.15,z-d/2,2.2,h,.28,'corr');deco('glass',x,z-d/2+.4,5,3,.12,.35);
      sign(x,z-d/2-.15,'維修機庫','SERVICE HANGAR',7,6.1);buildings.push({x,z,w,h,d,y,factory:true,facade:false});
      solid.add({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,y0:y,y1:y+h,mat:'metal'});
    };
    hangar(-27,7);hangar(27,39);
    // Grounded transport aircraft: tapered fuselage, dihedral wings, nacelles and landing gear.
    const aircraftBuckets=Object.fromEntries(Object.entries(b.B).map(([k,bucket])=>[k,bucket.p.length]));
    const az=22,ay=2.8,fuselage=[];
    for(const [r,z]of [[.08,-12],[.8,-10.6],[1.3,-7],[1.4,5],[1,8.5],[.2,11],[0,11.4]])fuselage.push(new THREE.Vector2(r,z));
    const fus=new THREE.LatheGeometry(fuselage,20);fus.rotateX(Math.PI/2);geo('metal',fus,0,ay,az,0,{tint:[.59,.66,.64]});
    const wing=(side,z,w,chord,y)=>{
      const pts=[[0,ay+y,az+z-chord/2],[side*w,ay+y+.65,az+z+1.2],[side*w,ay+y+.65,az+z+2.1],[0,ay+y,az+z+chord/2]];if(side<0)pts.reverse();b.B.metal.quad(...pts,[0,1,0],[1,1,1,1],null,[.56,.63,.62]);
      beam('metal',[0,ay+y,az+z],[side*w,ay+y+.65,az+z+1.7],.07);
    };
    for(const side of [-1,1]){wing(side,0,15,5,.3);wing(side,8.6,5.3,2.8,.8);for(const x of [5.1,9.6]){geo('metal',new THREE.CylinderGeometry(.64,.75,3.5,12).rotateX(Math.PI/2),side*x,ay-.25,az-.8,0,{tint:[.42,.5,.49]});geo('glass',new THREE.CylinderGeometry(.54,.54,.08,12).rotateX(Math.PI/2),side*x,ay-.25,az-2.58);beam('metal',[side*x-1,ay-.25,az-2.65],[side*x+1,ay-.25,az-2.65],.045);}beam('metal',[side*.95,ay,az+3],[side*1.1,.55,az+3],.1);geo('rust',new THREE.CylinderGeometry(.5,.5,.38,12).rotateZ(Math.PI/2),side*1.1,.48,az+3);}
    const fin=new THREE.Shape();fin.moveTo(-1,0);fin.lineTo(3.6,0);fin.lineTo(2.9,4);fin.lineTo(1.2,4);fin.lineTo(-1,0);const fg=new THREE.ExtrudeGeometry(fin,{depth:.2,bevelEnabled:false});fg.rotateY(Math.PI/2);geo('metal',fg,-.1,ay+.6,az+7,0,{tint:[.49,.56,.54]});
    deco('glass',-.7,az-7.5,.9,.7,.07,ay+.9);deco('glass',.7,az-7.5,.9,.7,.07,ay+.9);
    for(const [key,start]of Object.entries(aircraftBuckets))for(let j=start;j<b.B[key].p.length;j+=3)b.B[key].p[j]+=15;
    solid.add({x0:13.5,x1:16.5,z0:10,z1:33,y0:1.3,y1:4.2,mat:'metal'});
    sign(0,-45,'最後航班 / 撤離區','LAST DEPARTURE',9,3.4);
    for(const [x,z]of [[-21,-17],[20,4],[-20,42]])crate(x,z,4,1.6,2);
    building(60,58,9,19,9,null,{facade:false,mat:'concrete'});deco('glass',60,58,13,3,13,19);deco('metal',60,58,15,.4,15,22);pipe('metal',60,22,58,.1,9);geo('metal',new THREE.TorusGeometry(2,.08,4,20),60,27,58,.5);
    for(const z of [-38,-12,15,43,61])for(const x of [-19.8,19.8])lamps.push({x,z,y:.16,color:0x91d5ff});
  }else if(id==='underground'){
    box('concrete',0,8,66,.5,114,{base:7.4});
    for(const z of [-33,-9,15,39,61]){
      for(const x of [-25,25]){box('concrete',x,z,1.4,7.4,1.4);deco('concrete',x,z,2.4,.55,2.4,6.6);}
      box('metal',0,z,51,.6,.7,{base:6.8});sign(-24,z-.6,'動力 / 03','POWER / 03',1.2,4);
      for(const x of [-20,20]){box('metal',x,z+3.5,4.5,2.4,5.6,{tint:[.42,.5,.5]});deco('metal',x,z+3.5,3.7,.2,4.8,2.4);for(const xx of [x-1.1,x+1.1])pipe('rust',xx,ground(xx,z+3.5)+2.6,z+3.5,.13,2);}
    }
    for(const x of [-29.5,29.5]){
      for(const y of [4.8,5.35,5.9])beam('rust',[x,y,-46],[x,y,64],.15+(y-4.8)*.035,[.53,.41,.31]);
      for(let z=-40;z<64;z+=10){deco('metal',x,z,1.8,.1,.4,4.1);pipe('metal',x-.45,4.1,z,.06,2.2);lamps.push({x:x*.7,z,y:6.5,color:z%20?0xffddb1:0x9dc4d0});}
    }
    for(const z of [-11,20,47]){wall(-27,z,10,7.4,1,'metal');wall(27,z,10,7.4,1,'metal');box('metal',0,z,44,.5,1,{base:6.65});for(const x of [-21.7,21.7])for(let y=0;y<6.4;y+=.7)deco('paint',x,z-.54,.55,.33,.04,y,{tint:[.82,.56,.17]});}
    for(const x of [-13,13])for(const z of [-35,-5,25,53]){line(x,z,.16,7,[.71,.55,.22]);line(x-1,z,2,.15,[.71,.55,.22]);}
    sign(0,63.8,'封鎖控制 / 核心區','LOCKDOWN / CORE',13,4);sign(0,-12,'01 隔離門','01 ISOLATION',8,5.7);
    building(-27,41,7,5,12,null,{factory:true,facade:false});crate(25,-27,4,3,5);
    for(const z of [-22,5,32,55]){tank(-30,z,1.4,3.6);deco('glass',27,z,.12,1.1,1.4,3.3);}
    for(const z of [-29,2,34,58]){for(const x of [-10,10]){deco('metal',x,z,.15,.18,2.1,7.15);lamps.push({x,z,y:7.02,color:0xbed7db});}beam('metal',[-29,6.8,z],[29,6.8,z],.11);}
  }else if(id==='rail'){
    surface(mats.asphalt?'asphalt':'floor',-7,7,-48,65,.025,[.72,.7,.65]);
    for(const x of [-11,12]){
      surface(mats.rock?'rock':'floor',x-2.1,x+2.1,-48,65,.028,[.42,.4,.33]);
      for(const xx of [x-.73,x+.73]){deco('rust',xx,7,.13,.14,107,.03);deco('metal',xx,7,.075,.05,107,.17,{tint:[.7,.73,.72]});}
      for(let z=-46;z<64;z+=1.55){deco('rust',x,z,2.6,.12,.24,.02,{tint:[.52,.4,.28]});for(const xx of [x-.73,x+.73])deco('metal',xx,z,.24,.06,.29,.14);}
    }
    const container=(x,z,col)=>{
      box('corr',x,z,7,3.1,12,{tint:col});for(const xx of [x-3.45,x+3.45])for(const zz of [z-5.93,z+5.93])deco('metal',xx,zz,.14,3.2,.14,0,{tint:[.57,.64,.64]});
      for(const xx of [x-2,x+2])deco('metal',xx,z-6.04,.07,2.75,.08,.2);deco('metal',x,z-6.07,6.8,.08,.09,1.45);sign(x,z-6.1,'灰線物流','GREYLINE LOGISTICS',4,2.3);
    };
    container(-27,4,[.6,.8,.72]);container(27,30,[.9,.63,.45]);container(-27,45,[.7,.7,.8]);
    building(26,-39,9,6.4,10,['裝卸站','LOADING BAY'],{factory:true,gable:true});building(27,55,8,6.4,10,['調度室','DISPATCH'],{factory:true});
    // Flat wagons have wheelsets, bogie frames, deck boards and side latches.
    for(const z of [-25,12,48]){
      crate(-11,z,4.4,2.1,8);deco('metal',-11,z,4.8,.22,8.4,2.1);deco('rust',-11,z,4.4,.35,8.1,.28);
      for(const zz of [z-2.5,z+2.5])for(const x of [-12.05,-9.95])geo('metal',new THREE.CylinderGeometry(.43,.43,.32,12).rotateZ(Math.PI/2),x,.43,zz,0,{tint:[.27,.3,.3]});
    }
    for(const z of [-20,20,55]){
      for(const x of [-30,30]){box('metal',x,z,.4,10,.4);for(const dz of [-3,3])beam('metal',[x,0,z+dz],[x,10,z],.07);}
      box('metal',0,z,61,.35,.45,{base:10});for(let x=-29;x<30;x+=4)beam('metal',[x,10,z],[x+4,11.3,z],.07);beam('metal',[-30,11.3,z],[30,11.3,z],.09);
      deco('rust',17,z,2.3,1.3,2.4,10.2);beam('metal',[17,4,z],[17,10.2,z],.026);
    }
    for(const x of [-30.5,30.5])for(const z of [-43,4,49])lamp(x,z,7);
    for(let i=0;i<9;i++)container(-74+(i%3)*24,90+Math.floor(i/3)*18,[.49+i*.02,.55,.51]);
  }

  // Distinct landmarks and secondary silhouettes give each battlefield a
  // recognizable place. Only local cover touches infantry height; elevated
  // structures and distant scenery preserve every tested reinforcement route.
  if(id==='pass'){
    const z=55,y=ground(0,z);
    for(const x of [-14,14]){box('concrete',x,z,1.15,8.4,1.5);deco('concrete',x,z,2.5,.4,2.3,7.7);}
    box('metal',0,z,29,.38,2.3,{base:8.1});
    for(const x of [-14,14])for(const zz of [z-1,z+1])beam('metal',[x,y+8.5,zz],[-x,y+8.5,zz],.07);
    for(let x=-12;x<=12;x+=4){pipe('metal',x,y+8.45,z-.95,.035,1.15);pipe('metal',x,y+8.45,z+.95,.035,1.15);}
    for(const zz of [z-1,z+1])beam('metal',[-14,y+9.6,zz],[14,y+9.6,zz],.03);
    sign(0,z-1.25,'關隘 07 / 山腰巡線','PASS 07 / RIDGELINE',8,8.85);
    for(const [x,z]of [[-18,-5],[18,29],[-17,44]]){wall(x,z,2.4,1.2,1.1,'concrete',{tint:[.56,.61,.56]});for(let i=0;i<5;i++)deco('paint',x-.95+i*.43,z-.57,.2,1,.025,.13,{tint:i%2?[.14,.19,.18]:[.79,.66,.29]});}
    for(const side of [-1,1])for(let i=0;i<22;i++){const x=side*(11.5+(i%4)*2.1),z=-35+i*4.6;if(scenario.targets.every(p=>Math.hypot(x-p.x,z-p.z)>3.3))tree(x,z,i+4,true);}
  }else if(id==='city'){
    // A hill-town bell tower overlooks the clinic and the cross-street bridge.
    building(42,11,7,18,8,['舊城 / 灰鐘樓','OLD QUARTER / BELL'],{mat:'plaster',facade:false,tint:[.79,.76,.63]});
    for(const z of [7,15]){deco('glass',42,z,3.2,2.6,.09,13.4);for(const x of [40.4,43.6])pipe('concrete',x,13.2,z,.18,3.1,[.68,.66,.55]);}
    const clockY=ground(42,11)+10.4;
    geo('paint',new THREE.CylinderGeometry(1.25,1.25,.09,32).rotateX(Math.PI/2),42,clockY,6.94,0,{tint:[.72,.7,.58]});
    geo('metal',new THREE.TorusGeometry(1.28,.045,6,32),42,clockY,6.87,0,{tint:[.33,.4,.39]});
    for(let k=0;k<12;k++){const a=k*Math.PI/6;beam('metal',[42+Math.sin(a)*1.05,clockY+Math.cos(a)*1.05,6.84],[42+Math.sin(a)*1.16,clockY+Math.cos(a)*1.16,6.84],.025,[.16,.22,.22]);}
    beam('metal',[42,clockY,6.81],[41.34,clockY+.5,6.81],.034,[.16,.22,.22]);beam('metal',[42,clockY,6.81],[42.36,clockY+.72,6.81],.045,[.16,.22,.22]);
    gableRoof(42,11,7,8,18,3.2,[.28,.34,.34]);pipe('metal',42,21.2,11,.035,3.4);geo('metal',new THREE.ConeGeometry(.5,1.8,10),42,21.3,11,0,{tint:[.38,.45,.44]});
    for(const x of [-20,20])box('brick',x,7,1.1,7.9,1.1);
    box('metal',0,7,40,.35,2.4,{base:7.75});
    for(const zz of [5.85,8.15]){beam('metal',[-20,ground(0,7)+8.95,zz],[20,ground(0,7)+8.95,zz],.035);for(let x=-19;x<20;x+=2.2)pipe('metal',x,ground(0,7)+8.1,zz,.025,.9);}
    sign(0,5.7,'傷患撤離 / 醫療通道','MEDICAL EVACUATION',8,8.25);
    // Awning valances and cloth hung across service alleys bring a lived-in scale.
    for(const x of [-21.5,21.5])for(const z of [-18,15,46]){
      const y=ground(x,z);deco('fabric',x,z,2.8,.12,2.1,2.7,{tint:[.66,.49,.32]});deco('fabric',x,z-1,2.8,.3,.06,2.45,{tint:[.59,.42,.28]});
      beam('metal',[x-1.4,y+2.8,z-1],[x-1.4,y+3.7,z+1],.025);beam('metal',[x+1.4,y+2.8,z-1],[x+1.4,y+3.7,z+1],.025);
    }
    for(const z of [-10,32])for(let i=0;i<6;i++){const x=-6+i*2.4,y=ground(x,z)+7.15;deco('fabric',x,z,1.1,1.2,.04,7.1,{tint:i%2?[.54,.61,.58]:[.72,.66,.51]});beam('metal',[x-.6,y+1.2,z],[x+.6,y+1.2,z],.012);}
    sign(-16,-36,'急救 / 24H','EMERGENCY / 24H',3,2.8);
  }else if(id==='forest'){
    // Timber observation post with radio mast, diagonals, ladder and open canopy.
    const x=28,z=50,y=ground(x,z);
    for(const xx of [x-1.6,x+1.6])for(const zz of [z-1.6,z+1.6]){pipe('rust',xx,ground(xx,zz),zz,.13,6.5,[.45,.36,.23]);beam('rust',[xx,y+.2,zz],[x+(xx<x?1.6:-1.6),y+5,zz],.06,[.43,.35,.24]);}
    box('rust',x,z,3.6,.2,3.6,{base:4.7,solid:false,tint:[.48,.39,.25]});gableRoof(x,z,4.3,4.3,6.5,.9,[.33,.4,.31]);
    for(const zz of [z-1.8,z+1.8])beam('rust',[x-1.8,y+5.8,zz],[x+1.8,y+5.8,zz],.04,[.42,.37,.24]);
    for(const xx of [x-1.8,x+1.8])beam('rust',[xx,y+5.8,z-1.8],[xx,y+5.8,z+1.8],.04,[.42,.37,.24]);
    for(const xx of [x-.45,x+.45])beam('metal',[xx,y,z-2],[xx,y+5.1,z-1.4],.035);for(let i=0;i<13;i++)beam('metal',[x-.45,y+.25+i*.38,z-2+i*.045],[x+.45,y+.25+i*.38,z-2+i*.045],.025);
    pipe('metal',26,ground(26,-37),-37,.045,15);for(const xx of [23,29])beam('metal',[26,ground(26,-37)+12,-37],[xx,ground(xx,-34),-34],.014);for(const yy of [10,13])beam('metal',[24,yy,-37],[28,yy,-37],.023);
    for(const [x,z,angle]of [[-17,-17,.3],[17,15,-.25],[-17,42,.45],[18,54,-.2]]){
      const y=ground(x,z)+.35;const log=new THREE.CylinderGeometry(.27,.34,5.4,10).rotateZ(Math.PI/2);geo(mats.rock?'rock':'wall',log,x,y,z,angle,{tint:[.48,.36,.2]});
      for(const side of [-1,1])beam('rust',[x+side*1.2,y,z],[x+side*1.1,y+1.4,z+side*.65],.055,[.38,.33,.22]);
    }
    for(const x of [-18,18])for(const z of [-11,20,51]){const y=ground(x,z);box('wall',x,z,3.4,.65,2,{tint:[.44,.46,.3]});geo('wall',new THREE.DodecahedronGeometry(.6,1),x-1.4,y+.4,z-1.3,.9,{tint:[.46,.49,.36]});}
    ridge(175,510,170,35,.7);ridge(280,650,180,58,2.1);
  }else if(id==='dam'){
    // Three visible turbine halls and external penstocks create a power-station
    // skyline while the center maintenance ramp remains entirely unobstructed.
    building(39,15,14,6.4,21,['灰線 / 水力發電','GREYLINE / HYDRO POWER'],{factory:true,mat:'brick',facade:true,gable:true,tint:[.56,.66,.65]});
    for(const z of [-14,9,34]){
      const x=39,y=ground(x,z);pipe('metal',x,y,z,1.6,5.6,[.42,.51,.53]);
      for(const yy of [1,4,7])geo('metal',new THREE.TorusGeometry(2.32,.09,5,20).rotateX(Math.PI/2),x,y+yy,z,0,{tint:[.52,.59,.6]});
      beam('metal',[x,y+8.8,z],[30,ground(30,z)+8.8,z],.72,[.43,.53,.55]);
      for(const xx of [35,39])pipe('concrete',xx,ground(xx,z),z,.15,8.1,[.6,.66,.66]);
    }
    for(const z of [-18,11,40]){const y=ground(0,z)+9.7;beam('metal',[-25,y,z],[25,y,z],.21);for(const x of [-25,25])pipe('metal',x,ground(x,z),z,.18,9.8);}
    for(let i=0;i<7;i++){const z=-39+i*18;wall(-47,z,6,1.1,13,'concrete',{tint:[.55,.63,.65]});for(const x of [-50,-44])beam('metal',[x,5.1,z-6.5],[x,5.1,z+6.5],.035);}
    sign(0,61.7,'閘門 03 / 壩頂管制','GATE 03 / DAM CONTROL',10,8.6);
  }else if(id==='airfield'){
    // Windsock, radar dish, fuel farm, aircraft-service stairs and blast walls.
    const x=40,z=-24;pipe('metal',x,0,z,.09,9);beam('metal',[x,8.7,z],[x+2.8,8.7,z],.035);
    for(let i=0;i<7;i++){const sock=new THREE.CylinderGeometry(.32-i*.025,.34-i*.025,.42,10).rotateZ(Math.PI/2);geo('fabric',sock,x+.25+i*.41,8.7-i*.08,z,0,{tint:i%2?[.87,.79,.63]:[.77,.36,.23]});}
    for(const [x,z]of [[45,15],[45,23],[45,31]]){tank(x,z,2.5,5.6);for(const xx of [x-1.8,x+1.8])beam('metal',[xx,0,z-2.5],[xx,6.2,z-2.5],.04);for(let i=0;i<14;i++)beam('metal',[x-1.8,.3+i*.4,z-2.5],[x+1.8,.3+i*.4,z-2.5],.025);}
    const rx=-45,rz=44;pipe('concrete',rx,0,rz,.9,7);pipe('metal',rx,7,rz,.24,5.6);
    const dish=new THREE.SphereGeometry(5,24,12,0,Math.PI*2,0,Math.PI*.37);dish.rotateX(Math.PI*.58);geo('metal',dish,rx,11,rz,.3,{tint:[.64,.7,.67]});
    beam('metal',[rx,11,rz],[rx,14,rz-3.8],.07);geo('metal',new THREE.SphereGeometry(.35,8,6),rx,14,rz-3.8);
    for(const [x,z]of [[-19,-39],[19,-29],[-19,30]]){
      const y=ground(x,z);for(let i=0;i<9;i++)deco('metal',x,z+i*.32,2.1,.13,.4,.16+i*.21,{tint:[.56,.62,.62]});
      for(const xx of [x-1.05,x+1.05])beam('metal',[xx,y+.9,z],[xx,y+2.8,z+2.65],.035);
      for(const zz of [z,z+2.5])for(const xx of [x-1.05,x+1.05])pipe('metal',xx,y,zz,.04,zz===z?.9:2.8);
    }
    for(const [x,z]of [[-23,-9],[23,17],[-23,48]])wall(x,z,3.7,1.15,1.5,'concrete',{tint:[.65,.7,.67]});
    for(let i=0;i<5;i++)building(-68+i*28,112,19,6.4+(i%2)*3.2,24,null,{factory:true,facade:false,mat:'corr',gable:true,tint:[.62,.68,.67]});
    ridge(295,850,230,58,1.5);
  }else if(id==='underground'){
    // Large turbine rotors, motor housings and a pipe-laced suspended catwalk.
    for(const [x,z]of [[-13,6],[17,20],[-28,31],[28,56]]){
      const y=ground(x,z);geo('metal',new THREE.CylinderGeometry(1.55,1.55,5,20).rotateX(Math.PI/2),x,y+2.2,z,0,{tint:[.43,.52,.51]});
      for(const zz of [z-2.1,z+2.1])geo('rust',new THREE.TorusGeometry(1.57,.14,6,22),x,y+2.2,zz,0,{tint:[.46,.44,.32]});
      for(const xx of [x-1.25,x+1.25])box('concrete',xx,z,.45,1.2,3.9,{tint:[.48,.56,.53]});
      geo('metal',new THREE.CylinderGeometry(.55,.55,.2,12).rotateX(Math.PI/2),x,y+2.2,z-2.62,0,{tint:[.22,.28,.27]});
      for(let k=0;k<8;k++){const a=k*Math.PI/4;beam('metal',[x,y+2.2,z-2.77],[x+Math.cos(a)*1.25,y+2.2+Math.sin(a)*1.25,z-2.77],.025);}
    }
    for(const z of [5,38]){
      box('metal',0,z,44,.22,2.5,{base:5.4});
      for(const zz of [z-1.15,z+1.15]){beam('metal',[-22,6.5,zz],[22,6.5,zz],.03);for(let x=-22;x<=22;x+=3)pipe('metal',x,5.6,zz,.025,.9);}
      for(const x of [-22,22]){box('metal',x,z,.22,5.4,.3);beam('metal',[x,3.5,z],[x+(x<0?3:-3),5.4,z],.06);}
      sign(0,z-1.3,'動力 03 / 維修通道','POWER 03 / SERVICE WALK',7,5.78);
    }
    for(const x of [-13,13])for(let z=-40;z<60;z+=10){deco('metal',x,z,1.1,.08,7.8,7.05);for(const xx of [x-.35,x,x+.35])beam('rust',[xx,7.18,z-3.8],[xx,7.18,z+3.8],.06,[.44,.4,.29]);}
    deco('glass',0,64.3,20,2.2,.12,3.7);for(const x of [-10,-5,0,5,10])deco('metal',x,64.15,.1,2.4,.14,3.55);
    sign(0,-46.8,'升降機 A / 撤離廳','LIFT A / EVACUATION',10,4.8);
  }else if(id==='rail'){
    // Detailed diesel locomotive sits at the withdrawal line behind the flatcars.
    const x=12,z=21;
    solid.add({x0:x-1.7,x1:x+1.7,z0:z-5.4,z1:z+5.4,y0:.45,y1:4.7,mat:'metal'});
    box('metal',x,z,3.3,2.4,10.5,{base:.65,solid:false,tint:[.32,.44,.43]});box('metal',x,z+3.3,3.1,4,3.5,{base:.65,solid:false,tint:[.36,.48,.45]});
    deco('glass',x,z+1.5,2.6,1.2,.09,3.2);for(const xx of [x-1.59,x+1.59])deco('glass',xx,z+3.3,.08,1.2,2.3,3.2);
    geo('metal',new THREE.CylinderGeometry(1.65,1.65,3.7,14,1,false,0,Math.PI).rotateX(Math.PI/2),x,4.5,z+3.3,0,{tint:[.36,.45,.43]});
    for(const zz of [z-3.2,z+3.2])for(const xx of [x-1.4,x+1.4])geo('metal',new THREE.CylinderGeometry(.58,.58,.3,14).rotateZ(Math.PI/2),xx,.61,zz,0,{tint:[.25,.3,.3]});
    for(const xx of [x-1.8,x+1.8]){deco('metal',xx,z,.55,.16,10.4,1.05);for(let zz=z-4.5;zz<z+4.6;zz+=1.5)pipe('metal',xx,1.22,zz,.025,.9);beam('metal',[xx,2.1,z-4.9],[xx,2.1,z+4.9],.025);}
    for(let zz=z-3.8;zz<z+.4;zz+=.45)deco('metal',x-1.68,zz,.06,1.3,.12,1.5,{tint:[.23,.3,.3]});pipe('rust',x,3.2,z-.6,.2,1.4);
    // Loading platforms, distant warehouse arches and a yard signal bridge.
    for(const x of [-27,31]){box('concrete',x,11,12,.75,92,{solid:false,tint:[.6,.65,.61]});for(let z=-31;z<53;z+=16){box('metal',x,z,.22,7,.22,{solid:false});gableRoof(x,z,13,17,7,1.2,[.35,.44,.43]);}}
    building(53,46,17,9.6,20,['機修 / 06','ENGINE WORKS / 06'],{factory:true,mat:'brick',facade:false,gable:true});
    for(const x of [-14,14])pipe('metal',x,ground(x,60),60,.1,7);beam('metal',[-14,7,60],[14,7,60],.16);
    for(const x of [-12,12]){deco('metal',x,60,.55,1.7,.5,6.7);for(const y of [6.85,7.38,7.91])geo('glass',new THREE.SphereGeometry(.13,8,6),x,y,59.72,0,{tint:y===7.91?[.3,.62,.37]:[.61,.29,.18]});}
    sign(0,59.7,'灰線貨運 / 調車區','GREYLINE / FREIGHT YARD',7,6.8);
    ridge(280,750,200,55,.6);
  }

  if(id!=='underground'){
    const flagMat=mats.fabric.clone(),flagTime={value:0};flagMat.side=THREE.DoubleSide;flagMat.color.set(0xc6ac73);ownedMaterials.add(flagMat);
    const compile=mats.fabric.onBeforeCompile;
    flagMat.onBeforeCompile=sh=>{compile?.(sh);sh.uniforms.infantryFlagTime=flagTime;sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float infantryFlagTime;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=sin(position.x*3.8-infantryFlagTime*2.4)*.17*max(position.x,0.0);transformed.y+=sin(position.x*3.0-infantryFlagTime*1.7)*.035*max(position.x,0.0);');};flagMat.customProgramCacheKey=()=> 'infantry-field-flag-v1';
    const fx=id==='forest'?12:id==='dam'?11:id==='rail'?15:10,fz=-27,fy=ground(fx,fz);pipe('metal',fx,fy,fz,.045,5);
    const flagGeometry=new THREE.PlaneGeometry(2.2,1.1,14,4).translate(1.1,-.55,0);flagGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(flagGeometry.attributes.position.count*3).fill(1),3));ownedGeometries.add(flagGeometry);
    const flag=new THREE.Mesh(flagGeometry,flagMat);flag.position.set(fx,fy+4.8,fz);flag.castShadow=true;root.add(flag);environmentUpdates.push(time=>{flagTime.value=time;});
  }
  const beacon=new THREE.Group(),beaconMat=new THREE.MeshBasicMaterial({color:0xffc36d,transparent:true,opacity:.8,depthWrite:false});ownedMaterials.add(beaconMat);
  const ring=new THREE.Mesh(new THREE.RingGeometry(3.5,3.7,48).rotateX(-Math.PI/2),beaconMat);ownedGeometries.add(ring.geometry);beacon.add(ring);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,4.2,8),beaconMat);mast.position.y=2.1;ownedGeometries.add(mast.geometry);beacon.add(mast);root.add(beacon);
  const supply={x:-5,z:-39,y:ground(-5,-39)};crate(supply.x,supply.z,1.2,.9,1.1);sign(supply.x,supply.z-.6,'補給','SUPPLY',1.1,1.4);
  for(const mesh of b.build(root))ownedGeometries.add(mesh.geometry);
  const nav=new Navigation(solid,BOUNDS,ground);
  const starts={defend:{x:0,z:-29,y:ground(0,-29)},assault:{x:0,z:-42,y:ground(0,-42)}};
  const spawns=[{x:-22,z:59},{x:0,z:60},{x:22,z:59}];
  return {root,solid,ground,nav,signs,lamps,trees,buildings,cover,starts,spawns,supply,beacon,bounds:BOUNDS,artMaterials:mats,ownedMaterials,ownedTextures,ownedGeometries,environmentUpdates,update(time,dt){for(const fn of environmentUpdates)fn(time,dt);},
    dispose(){
      // Explicit ownership prevents shared surface/model/actor assets from being
      // disposed, even if another system temporarily attaches an actor to this root.
      for(const g of ownedGeometries)g.dispose();for(const tex of ownedTextures)tex.dispose();for(const m of ownedMaterials)m.dispose();scene.remove(root);
      ownedGeometries.clear();ownedTextures.clear();ownedMaterials.clear();environmentUpdates.length=0;
    }
  };
}

export function addSigns(map,language) {
  for(const s of map.signs){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const c=canvas.getContext('2d');
    c.fillStyle='#14252a';c.fillRect(0,0,768,192);c.strokeStyle='#cbb887';c.lineWidth=8;c.strokeRect(10,10,748,172);
    c.fillStyle='#cbb887';c.font='bold 18px sans-serif';c.textAlign='left';c.fillText('GREYLINE / FIELD OPERATIONS',26,35);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#f0e6cb';c.font='bold 48px sans-serif';c.fillText(s[language],384,105,710);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;map.ownedTextures.add(tex);
    const material=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});map.ownedMaterials.add(material);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(s.w,s.w/4),material);mesh.position.set(s.x,s.y,s.z);mesh.rotation.y=s.ry??Math.PI;map.ownedGeometries.add(mesh.geometry);map.root.add(mesh);
  }
  // Actual point lights are managed by the main renderer's nearby-light budget.
  for(const p of map.lamps){const material=new THREE.MeshBasicMaterial({color:p.color??0xffddb1});map.ownedMaterials.add(material);const face=new THREE.Mesh(new THREE.BoxGeometry(.6,.08,.4),material);face.position.set(p.x,p.y,p.z);map.ownedGeometries.add(face.geometry);map.root.add(face);}
}
