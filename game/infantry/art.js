import * as THREE from 'three';
import { Placer, facade } from '../mech/zero/models.js';
import { Builder } from '../mech/zero/kit.js';
import { autumnTreeGeometry, autumnFoliage, buildAutumnTrees } from '../mech/kobe-autumn.js';
import { SCENARIOS } from './scenarios.mjs';


// Pine-needle bitmap cards alone disappear into subpixels at combat distances.
// Small irregular 3D needle sprays give each branch a real shaded crown while
// retaining the campaign's fine needle cards and bark at close range.
function infantryPineGeometry(variant=0,lod=0) {
  const tree=autumnTreeGeometry(true,variant),source=tree.toNonIndexed(),arrays={};
  for(const key of ['position','normal','uv','color','leaf'])arrays[key]=Array.from(source.attributes[key].array);
  const triangle=(a,b,c,tint)=>{
    for(const q of [a,b,c]){arrays.position.push(...q);const n=new THREE.Vector3(q[0]*.13,.85,q[2]*.13).normalize();arrays.normal.push(n.x,n.y,n.z);arrays.uv.push(0,0);arrays.color.push(...tint);arrays.leaf.push(0);}
  };
  for(let level=0;level<(lod?7:9);level++){
    const y=2.15+level*(lod?1.0:.76),reach=(3.15-level*(lod?.39:.29))*(variant===1?1.13:variant===2?.91:1),branches=lod?5:7;
    for(let branch=0;branch<branches;branch++)for(let spray=0;spray<(lod?2:3);spray++){
      const a=branch/branches*Math.PI*2+level*.69+variant*.43,t=.4+spray*.27,d=reach*t,cs=Math.cos(a),sn=Math.sin(a),length=reach*(.32+spray*.035),width=reach*(.17-spray*.013);
      const cy=y-.23*t+.09*Math.sin(branch*3+level),cx=cs*d,cz=sn*d,at=(u,v,h)=>[cx+cs*u-sn*v,cy+h,cz+sn*u+cs*v];
      const tip=at(length,0,-.12),back=at(-length*.58,0,.17),left=at(0,-width,-.16),right=at(0,width,-.12),top=at(0,0,.27),bottom=at(0,0,-.21);
      const shade=.8+.16*Math.sin(branch*2.3+level*1.7+spray),green=[.15*shade,.27*shade,.16*shade];
      for(const [p,q]of [[tip,right],[right,back],[back,left],[left,tip]]){triangle(p,q,top,green);triangle(q,p,bottom,green.map(v=>v*.83));}
    }
  }
  const geometry=new THREE.BufferGeometry();for(const [name,size]of [['position',3],['normal',3],['uv',2],['color',3],['leaf',1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(arrays[name],size));geometry.computeBoundingSphere();tree.dispose();source.dispose();return geometry;
}

// The campaign's real scanned assets, procedural foliage and weathered PBR are
// shared. Every scene builds its own geometry, but never disposes the asset library.
export function addBattlefieldArt(map,models,id) {
  const group=new THREE.Group();group.name='infantry-scanned-detail';map.root.add(group);
  const placer=new Placer(models,map.solid,48);
  let seed=137+id.length*29;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const protectedPoints=[...Object.values(map.starts),...map.spawns,...(SCENARIOS.find(s=>s.id===id)?.targets??[])];
  const clear=(x,z,r=.7)=>!protectedPoints.some(p=>Math.hypot(x-p.x,z-p.z)<r+1.8)&&!map.buildings.some(s=>x>s.x-s.w/2-r&&x<s.x+s.w/2+r&&z>s.z-s.d/2-r&&z<s.z+s.d/2+r);
  const prop=(name,x,z,ry=0,scale=1,extra={})=>{
    const asset=models.get(name);if(!asset)return;
    // The scan named steel_frame_shelves_01 is a 21 m warehouse rack in its
    // native units. Scale that scan to a human-height service shelf explicitly.
    const heightCap=name==='steel_frame_shelves_01'?2.25:name==='modular_fire_escape'?4.6:Infinity;
    const currentHeight=asset.size.y*(Array.isArray(scale)?scale[1]:scale);
    if(currentHeight>heightCap){const factor=heightCap/currentHeight;scale=Array.isArray(scale)?scale.map(v=>v*factor):scale*factor;}
    const ss=Array.isArray(scale)?Math.max(scale[0],scale[2]):scale,r=Math.max(.3,Math.min(1.8,Math.max(asset.size.x,asset.size.z)*ss*.4));
    if(!extra.onStructure&&!clear(x,z,r))return;
    return placer.add(name,x,extra.y??map.ground(x,z),z,ry,{scale,solid:false,noBreak:true,...extra});
  };
  for(const s of map.buildings.filter(s=>Math.abs(s.x)<(id==='city'?78:id==='dam'?48:34)&&s.z<135&&s.facade!==false)){
    const kit=s.factory?'factory':'apartments',floors=Math.max(1,Math.floor(s.h/3.2));
    facade(placer,kit,'s',s.x-s.w/2,s.x+s.w/2,s.z-s.d/2-.075,s.z+s.d/2,floors,rnd,{y0:s.y,maxFloors:4});
    facade(placer,kit,s.x<0?'e':'w',s.x-s.w/2-.075,s.x+s.w/2+.075,s.z-s.d/2,s.z+s.d/2,floors,rnd,{y0:s.y,maxFloors:4});
    for(const z of [s.z-s.d*.27,s.z+s.d*.22]){
      const x=s.x+(s.x<0?1:-1)*(s.w/2+.24),ry=s.x<0?Math.PI/2:-Math.PI/2;
      prop('exterior_aircon_unit',x,z,ry,.82,{y:s.y+Math.min(4.2,s.h-1.1),onStructure:true});
      prop('security_light',x,z+1,ry,.8,{y:s.y+Math.min(3.1,s.h-.4),onStructure:true,cast:false});
    }
    if(s.factory)prop('modular_airduct_circular_01',s.x,s.z,Math.PI/2,1.5,{y:s.y+s.h+.25,onStructure:true});
    else if(s.h>=6.4)prop('modular_fire_escape',s.x+(s.x<0?1:-1)*(s.w/2+.03),s.z, s.x<0?Math.PI/2:-Math.PI/2,.63,{y:s.y+.25,onStructure:true});
  }
  // Supply clusters are arranged outside all objectives and spawning lanes.
  for(const [x,z]of [[-24,-31],[24,-5],[-23,13],[24,47]]){
    prop('wooden_military_crate',x,z,.05,1.1);prop('metal_jerrycan_green',x+1.2,z,.6);
    prop('Barrel_01',x-1.2,z+1,0,.9);prop('old_tyre',x+1.3,z+1.1,.6);prop('trashbag',x-.6,z-1.1,0,.75);
  }
  prop('portable_generator',-7,-42,Math.PI/2);prop('old_military_crate',-5,-39,0,.9);
  for(const c of ['pass','city','forest'].includes(id)?map.cover:[])for(let i=-2;i<=2;i++)prop('cement_bag',c.x+i*.88,c.z+.7,(i%2)*.11,[1.35,1.05,1.1],{onStructure:true,y:c.y+.22});
  if(id==='city'){
    prop('covered_car',-16,-8,.14,.88);prop('covered_car',16,47,-.3,.9);
    for(const [x,z]of [[-19,-12],[19,20],[-19,43]]){prop('metal_trash_can',x,z);prop('trashbag',x+.7,z+.6);prop('plastic_crate_02',x,z+1.4);prop('cardboard_box_01',x-.6,z+1.7);}
    for(const z of [-35,-8,26,55])prop('water_manhole_cover',3,z,0,.9);
    for(const [x,z]of [[-19.5,2],[19.5,31]]){prop('concrete_road_barrier_02',x,z,.35);prop('old_tyre',x-.8,z+1);}
    prop('sofa_03',-19,18,Math.PI/2,.7);prop('metal_office_desk',19,-38,Math.PI/2,.8);
  }else if(id==='pass'){
    prop('covered_car',-17,-26,.14,1.05);prop('covered_car',17,17,-.18,.9);
    for(const z of [-16,10,38]){prop('concrete_road_barrier_02',-13.8,z,Math.PI/2);prop('concrete_road_barrier_02',13.8,z+2,Math.PI/2);}
    prop('portable_generator',-24,7,Math.PI/2,1.2);prop('metal_jerrycan_green',-23,5,.6,1.1);prop('old_military_crate',22,34,.12,1.2);
  }else if(id==='forest'){
    for(const [x,z]of [[-16,-28],[16,9],[-17,36],[17,49]]){prop('old_military_crate',x,z,0,1.2);prop('metal_jerrycan_green',x+1,z+.7);prop('wooden_military_crate',x-1.1,z+1.6,0,.9);}
    for(const [x,z]of [[-24,-3],[24,28],[-23,54]]){prop('portable_generator',x,z,Math.PI/2);prop('barrel_03',x+1.2,z+1,0,.86);}
  }else if(id==='rail'||id==='airfield'){
    for(const z of [-22,7,34]){prop('hand_truck',24,z,.35);prop('steel_frame_shelves_01',-29,z,0,.9);prop('tool_cart',24,z+2);prop('Barrel_01',24,z+3.4);prop('metal_jerrycan_green',23,z+2.7);}
    for(const [x,z]of [[-22,-3],[22,13],[-23,33]]){prop('plastic_crate_02',x,z,0,1.2);prop('cardboard_box_01',x+1,z+.6,0,1.1);prop('old_tyre',x-.9,z+1.3);}
    if(id==='airfield'){prop('portable_generator',-17,-41,Math.PI/2,1.25);prop('tool_cart',16,-40,Math.PI/2);prop('hand_truck',15,-42);prop('propane_tank',-16,-39);}
  }else if(id==='underground'||id==='dam'){
    for(const z of [-28,5,35,57]){prop('portable_generator',-24,z,Math.PI/2);prop('utility_box_02',24,z,Math.PI/2);prop('propane_tank',25,z+2);prop('modular_airduct_circular_01',-30,z,0,1.35);}
    for(const z of [-20,13,46]){prop('tool_cart',22,z);prop('steel_frame_shelves_01',-24,z,0,1.05);prop('metal_office_desk',24,z+1,Math.PI/2,.8);}
    if(id==='underground')for(const z of [-31,-7,17,41,60])for(const x of [-29.4,29.4]){
      prop('mounted_fluorescent_lights',x,z,x<0?Math.PI/2:-Math.PI/2,.85,{y:5.1,onStructure:true,cast:false});prop('utility_box_02',x,z+3,x<0?Math.PI/2:-Math.PI/2,.9,{y:.4,onStructure:true});
    }
  }
  if(['city','rail','airfield'].includes(id))for(const x of [-32.65,32.65])for(let z=-44;z<62;z+=4.7)prop('modular_chainlink_fence',x,z,Math.PI/2,[1.05,.78,1],{onStructure:true,cast:false});
  const scanStats=placer.build(group);
  group.traverse(o=>{if(o.isMesh){o.userData.sharedMaterial=true;o.userData.sharedGeometry=!!o.isInstancedMesh;if(!o.isInstancedMesh)map.ownedGeometries.add(o.geometry);}});

  const treeGroup=new THREE.Group();treeGroup.name='infantry-woodland';map.root.add(treeGroup);
  const {material,depth}=autumnFoliage();
  if(map.trees.length)for(const lod of [0,1])for(let variant=0;variant<3;variant++){
    const points=map.trees.filter(([x,z],i)=>i%3===variant&&Number(Math.abs(x)>34||z>68)===lod);if(!points.length)continue;
    const mesh=new THREE.InstancedMesh(infantryPineGeometry(variant,lod),material,points.length),dummy=new THREE.Object3D();map.ownedGeometries.add(mesh.geometry);mesh.name='pine-canopy-'+variant;
    points.forEach(([x,z,scale],i)=>{dummy.position.set(x,map.ground(x,z),z);dummy.rotation.y=i*2.399;dummy.scale.set(scale*(.87+rnd()*.23),scale*(.9+rnd()*.21),scale*(.88+rnd()*.25));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(.64+rnd()*.15,.89+rnd()*.12,.68+rnd()*.14));});
    mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depth;mesh.userData.sharedMaterial=true;mesh.userData.noAO=true;mesh.computeBoundingSphere();treeGroup.add(mesh);
  }
  if(['city','pass','rail','dam'].includes(id)){
    const points=id==='city'?[[-19.8,-32,.64],[19.8,-9,.63],[-19.8,23,.68],[19.8,56,.7],[-42,7,1.1],[46,45,1.15]]:id==='dam'?[[41,-35,.9],[45,12,1],[43,57,.8],[59,40,1.2]]:[[-39,-35,.82],[40,-24,.8],[-39,12,.85],[42,8,.8],[-39,52,.85],[40,59,.75]];
    buildAutumnTrees(treeGroup,points,map.ground);treeGroup.traverse(o=>{if(o.isMesh){o.userData.sharedMaterial=true;map.ownedGeometries.add(o.geometry);}});
  }
  // Individual grass blades and crossing leaf clusters, batched in one geometry.
  // Vegetation is low, sparse in fighting lanes, and never participates in AI collision.
  if(id!=='underground'){
    const positions=[],normal=[],uv=[],color=[],leaf=[];
    const card=(x,z,y,w,h,ry,tile,tint)=>{
      const cs=Math.cos(ry),sn=Math.sin(ry),pts=[[-1,0],[1,0],[1,1],[-1,1]].map(([u,v])=>[x+cs*w*u+sn*v*w*.18,y+h*v,z+sn*w*u-cs*v*w*.18]);
      for(const i of [0,1,2,0,2,3]){positions.push(...pts[i]);normal.push(0,.93,.37);uv.push(tile[0]+(i===1||i===2?tile[2]:0),tile[1]+(i>=2?tile[3]:0));color.push(...tint);leaf.push(1);}
    };
    const count=id==='forest'?1450:id==='pass'?1050:id==='city'?160:220;
    for(let i=0;i<count;i++){
      const side=i%2?1:-1,x=side*(id==='forest'?10.5+rnd()*28:id==='pass'?7.5+rnd()*29:28.5+rnd()*11),z=-46+rnd()*111;
      if(!clear(x,z,.1)||id==='dam'&&x<-32)continue;const y=map.ground(x,z)+.015,h=.2+rnd()*.45,w=.13+rnd()*.14,turn=rnd()*6.28,tint=[.73+rnd()*.17,.85+rnd()*.13,.6+rnd()*.14];
      card(x,z,y,w,h,turn,[.007,.506,.235,.24],tint);card(x,z,y,w,h,turn+Math.PI/2,[.007,.506,.235,.24],tint);
      if(i%8===0)for(let j=0;j<3;j++)card(x+Math.cos(j*2.1)*.12,z+Math.sin(j*2.1)*.12,y,.28,.32,turn+j*1.8,[.255,.507,.238,.24],[.68,.81,.6]);
    }
    if(positions.length){const geometry=new THREE.BufferGeometry();for(const [name,array,size]of [['position',positions,3],['normal',normal,3],['uv',uv,2],['color',color,3],['leaf',leaf,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));geometry.computeBoundingSphere();map.ownedGeometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.name='battlefield-grass-verges';mesh.receiveShadow=true;mesh.customDepthMaterial=depth;mesh.userData.sharedMaterial=true;mesh.userData.noAO=true;treeGroup.add(mesh);}
  }

  const detailMaterials=map.artMaterials;
  if(detailMaterials){
    const builder=new Builder(detailMaterials,map.solid);
    const beam=(a,c,r=.027,mat='metal',tint=[.45,.48,.45])=>{const p=new THREE.Vector3(...a),q=new THREE.Vector3(...c),d=q.clone().sub(p),geometry=new THREE.CylinderGeometry(r,r,d.length(),5,1,true);geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));builder.mesh(mat,geometry,...p.add(q).multiplyScalar(.5).toArray(),0,{shade:1,tint});geometry.dispose();};
    const scar=(x,z,r)=>{
      const y=map.ground(x,z)+.032;
      for(let k=0;k<14;k++){const a=k/14*Math.PI*2,c=(k+1)/14*Math.PI*2,r0=r*(.8+rnd()*.2),r1=r*(.8+rnd()*.2),tint=[.24,.25,.22];builder.B.floor.quad([x,y,z],[x+Math.cos(c)*r1,map.ground(x+Math.cos(c)*r1,z+Math.sin(c)*r1)+.035,z+Math.sin(c)*r1],[x+Math.cos(a)*r0,map.ground(x+Math.cos(a)*r0,z+Math.sin(a)*r0)+.035,z+Math.sin(a)*r0],[x,y,z],[0,1,0],[1,1,1,1],null,tint);}
    };
    for(const [x,z,r]of [[-13,-15,1.6],[14,3,1.2],[-14,29,1.8],[13,53,.9]])scar(x,z,r);
    // Industrial warning stripes and realistic joint drains sit flush with the floor.
    if(['city','dam','airfield','rail'].includes(id))for(const side of [-1,1])for(let z=-43;z<60;z+=9){
      const x=side*(id==='city'?18.1:id==='dam'?22:16.5),y=map.ground(x,z);
      builder.deco('metal',x-.16,x+.16,y+.035,y+.055,z-1,z+1,{tint:[.24,.28,.28]});
      for(let zz=z-.9;zz<z+1;zz+=.2)builder.deco('metal',x-.15,x+.15,y+.055,y+.07,zz,zz+.035,{tint:[.65,.68,.65]});
    }
    if(id==='forest')for(const side of [-1,1])for(const z of [-35,-4,27,56]){
      const x=side*29,y=map.ground(x,z);
      // Czech hedgehog silhouettes remain beside the woodland edges.
      beam([x-1,y+.15,z],[x+1,y+1.9,z],.105,'rust',[.4,.43,.37]);beam([x+1,y+.15,z],[x-1,y+1.9,z],.105,'rust',[.4,.43,.37]);beam([x,y+.6,z-1],[x,y+1.6,z+1],.105,'rust',[.4,.43,.37]);
    }
    if(id==='underground')for(const z of [-26,1,28,55])for(const x of [-29,29]){
      const y=map.ground(x,z);for(let i=0;i<7;i++)builder.deco('paint',x-.45,x+.45,y+.05,y+.07,z-1.2+i*.35,z-1.05+i*.35,{tint:i%2?[.18,.21,.2]:[.79,.55,.15]});
      for(const dx of [-.55,.55])beam([x+dx,y+.05,z-1.5],[x+dx,y+2.6,z-1.5],.025);
    }
    for(const mesh of builder.build(group))map.ownedGeometries.add(mesh.geometry);
    // Builder materials belong to the map or the shared surface library. Mark only
    // shared surfaces; map-owned paint/glass remain in map.ownedMaterials explicitly.
    group.traverse(o=>{if(o.isMesh&&Object.values(detailMaterials).includes(o.material))o.userData.sharedMaterial=true;});
  }
  // Two small moving mechanisms are independent from the baked structures.
  // Their map-owned geometries reuse the campaign metal surface without cloning
  // or changing any shared material, skeleton or asset-library geometry.
  if(id==='underground'){
    const positions=[],normal=[],uv=[],color=[];
    for(let blade=0;blade<8;blade++){
      const a=blade*Math.PI/4,cs=Math.cos(a),sn=Math.sin(a),pts=[[.25,-.08],[1.2,-.18],[1.32,.17],[.3,.11]].map(([r,w])=>[cs*r-sn*w,sn*r+cs*w,0]);
      for(const i of [0,2,1,0,3,2]){positions.push(...pts[i]);normal.push(0,0,-1);uv.push(pts[i][0]*.3,pts[i][1]*.3);color.push(.58,.65,.63);}
    }
    const geometry=new THREE.BufferGeometry();for(const [name,array,size]of [['position',positions,3],['normal',normal,3],['uv',uv,2],['color',color,3]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,size));geometry.computeBoundingSphere();map.ownedGeometries.add(geometry);
    const rotor=new THREE.Mesh(geometry,map.artMaterials.metal);rotor.name='turbine-rotor-motion';rotor.position.set(-13,map.ground(-13,6)+2.2,3.18);rotor.castShadow=rotor.receiveShadow=true;map.root.add(rotor);map.environmentUpdates.push(time=>{rotor.rotation.z=time*.27;});
  }
  if(id==='airfield'){
    const radar=new THREE.Group();radar.position.set(-17,5.2,1);radar.name='apron-radar-motion';
    const geometry=new THREE.SphereGeometry(2,18,10,0,Math.PI*2,0,Math.PI*.42).rotateX(Math.PI*.55);
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3).fill(.64),3));map.ownedGeometries.add(geometry);
    const dish=new THREE.Mesh(geometry,map.artMaterials.metal);dish.castShadow=dish.receiveShadow=true;radar.add(dish);map.root.add(radar);
    const pedestalGeometry=new THREE.CylinderGeometry(.15,.25,4.6,10);pedestalGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(pedestalGeometry.attributes.position.count*3).fill(.59),3));map.ownedGeometries.add(pedestalGeometry);
    const pedestal=new THREE.Mesh(pedestalGeometry,map.artMaterials.metal);pedestal.position.set(-17,2.5,1);pedestal.castShadow=pedestal.receiveShadow=true;map.root.add(pedestal);map.environmentUpdates.push(time=>{radar.rotation.y=time*.13;});
  }
  const stoneCount=id==='rail'?230:id==='forest'||id==='pass'?170:90;
  const stoneMaterial=new THREE.MeshStandardMaterial({color:0x74736b,roughness:.96,normalMap:map.artMaterials?.rock?.normalMap,normalScale:new THREE.Vector2(.3,.3)});map.ownedMaterials.add(stoneMaterial);
  const stones=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.24,0),stoneMaterial,stoneCount),dummy=new THREE.Object3D();map.ownedGeometries.add(stones.geometry);stones.name='scattered-stone-and-rubble';
  for(let i=0;i<stoneCount;i++){
    const side=i%2?1:-1,x=id==='rail'?side*(18+rnd()*4):side*(id==='forest'?17+rnd()*16:26+rnd()*7),z=-44+rnd()*105;
    dummy.position.set(x,map.ground(x,z)+.07,z);dummy.rotation.set(rnd(),rnd()*6,rnd());dummy.scale.set(.4+rnd(),.18+rnd()*.43,.4+rnd());dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);
  }
  stones.receiveShadow=true;stones.userData.noAO=true;stones.computeBoundingSphere();map.root.add(stones);
  map.artStats={scannedDrawCalls:scanStats.calls,scannedTriangles:scanStats.tris,trees:map.trees.length,stoneCount};
}
