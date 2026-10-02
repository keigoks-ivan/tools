import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { indexGeometry } from './index-geometry.js?v=20261002c';

// +Z is the arrow's flight axis, +Y the bow's limbs. Shared geometry is built
// once per kit; drawing only updates nine string coordinates and transforms.
export function createArrowGeometry(T) {
  const shaft=new T.CylinderGeometry(.003,.003,.70,6);shaft.rotateX(Math.PI/2);shaft.translate(0,0,.35);
  const head=new T.ConeGeometry(.015,.055,4);head.rotateX(Math.PI/2);head.translate(0,0,.7275);
  const parts=[shaft,head];
  for(const angle of [0,Math.PI*2/3,Math.PI*4/3]) {
    const feather=new T.BoxGeometry(.028,.0015,.085);feather.rotateZ(angle);feather.translate(0,0,.065);parts.push(feather);
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());const indexed=indexGeometry(merged);if(indexed!==merged)merged.dispose();return indexed;
}

export function createBowKit(T,root,fingerRest) {
  const left=root.getObjectByName('J_Bip_L_Hand'),right=root.getObjectByName('J_Bip_R_Hand'),finger=root.getObjectByName('J_Bip_R_Index2');
  const bow=new T.Group();bow.name='jade_J_Bip_L_Hand_weapon';
  const mount=new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(0,0,1),new T.Vector3(1,0,0));mount.setPosition(.045,-.012,.025);bow.applyMatrix4(mount);left.add(bow);
  const wood=new T.MeshStandardMaterial({color:0x72553a,roughness:.55}),ivory=new T.MeshStandardMaterial({color:0xe9dfc6,roughness:.4}),gold=new T.MeshStandardMaterial({color:0xc5a66d,metalness:.65,roughness:.34}),grip=new T.MeshStandardMaterial({color:0x214b3f,roughness:.8});
  const limbs=[];
  for(const side of [-1,1]) {
    const limb=new T.Group();bow.add(limb);limbs.push({limb,side});
    const points=[[0,0,0],[0,side*.20,.10],[0,side*.42,.15],[0,side*.57,.07],[0,side*.64,-.04]].map(p=>new T.Vector3(...p));
    for(const [radius,material,x] of [[.018,wood,0],[.009,ivory,.016]]) {
      const curve=new T.CatmullRomCurve3(points.map(p=>p.clone().add(new T.Vector3(x,0,0))));const mesh=new T.Mesh(new T.TubeGeometry(curve,32,radius,8,false),material);limb.add(mesh);
    }
    for(const y of [.10,.47,.60]) {const ring=new T.Mesh(new T.TorusGeometry(.021,.003,5,12),gold);ring.rotation.x=Math.PI/2;ring.position.set(0,y*side,y===.10?.04:y===.47?.13:0);limb.add(ring);}
  }
  // Batch the decorative rings on each flexing limb into one draw call.
  for(const {limb} of limbs) {
    const rings=limb.children.filter(mesh=>mesh.material===gold),parts=[];
    for(const ring of rings){ring.updateMatrix();parts.push(ring.geometry.clone().applyMatrix4(ring.matrix));limb.remove(ring);ring.geometry.dispose();}
    const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());limb.add(new T.Mesh(merged,gold));
  }
  const handle=new T.Mesh(new T.CylinderGeometry(.023,.023,.16,12),grip);bow.add(handle);
  const stringGeometry=new T.BufferGeometry();stringGeometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(9),3).setUsage(T.DynamicDrawUsage));
  const string=new T.Line(stringGeometry,new T.LineBasicMaterial({color:0xded8c6}));string.frustumCulled=false;string.name='jade_bow_string';bow.add(string);
  const arrow=new T.Mesh(createArrowGeometry(T),ivory);arrow.name='jade_nocked_arrow';bow.add(arrow);
  const palm=new T.Vector3(),tip=new T.Vector3(),offset=new T.Vector3(-.045,-.012,.025),q=new T.Quaternion(),rest=new T.Vector3(0,0,-.04);
  bow.userData.updateBow=()=>{
    bow.updateWorldMatrix(true,true);right.getWorldQuaternion(q);palm.copy(offset).applyQuaternion(q).add(right.getWorldPosition(tip));bow.worldToLocal(palm);
    const tension=T.MathUtils.clamp(finger.quaternion.angleTo(fingerRest)/1.2,0,1),flex=tension*.07;
    const positions=stringGeometry.attributes.position;
    for(const {limb,side} of limbs) {
      limb.rotation.x=-side*flex;limb.updateMatrix();tip.set(0,side*.64,-.04).applyMatrix4(limb.matrix);
      positions.setXYZ(side>0?0:2,tip.x,tip.y,tip.z);
    }
    tip.copy(rest).lerp(palm,tension);positions.setXYZ(1,tip.x,tip.y,tip.z);positions.needsUpdate=true;
    arrow.position.copy(palm);arrow.visible=tension>.55;
  };
  return bow;
}

export function createArrowFx(T,scene,groundAt,{capacity=64}={}) {
  const geometry=createArrowGeometry(T),material=new T.MeshStandardMaterial({color:0xccefdc,emissive:0x247b4c,emissiveIntensity:.5,metalness:.2,roughness:.5});
  const items=Array.from({length:capacity},()=>{const mesh=new T.Mesh(geometry,material);mesh.visible=false;scene.add(mesh);return {mesh,remaining:0,speed:0,vx:0,vz:0};});let cursor=0;
  return {
    onEvent(event) {
      if(event.type!=='arrow')return;
      const item=items[cursor++%capacity],x=(event.x-640)/60,z=(event.y-500)/60;
      Object.assign(item,{id:event.id,remaining:event.range/60,speed:event.speed/60,vx:Math.cos(event.facing),vz:Math.sin(event.facing)});
      item.mesh.position.set(x,groundAt(x,z)+1.30+(event.height || 0),z);item.mesh.rotation.set(0,Math.PI/2-event.facing,0);item.mesh.scale.setScalar(event.pierce>1?1.3:1);item.mesh.visible=true;
    },
    update(dt,projectiles) {for(const item of items)if(item.mesh.visible){if(projectiles){const shot=projectiles.find(p=>p.id===item.id);if(!shot){item.mesh.visible=false;continue;}item.mesh.position.x=(shot.x-640)/60;item.mesh.position.z=(shot.y-500)/60;continue;}const d=Math.min(item.remaining,item.speed*dt);item.mesh.position.x+=item.vx*d;item.mesh.position.z+=item.vz*d;item.remaining-=d;if(item.remaining<=0)item.mesh.visible=false;}},
    reset(){for(const item of items)item.mesh.visible=false;},
    dispose(){for(const item of items)scene.remove(item.mesh);geometry.dispose();material.dispose();},
    stats(){return {capacity,active:items.filter(item=>item.mesh.visible).length};},
  };
}
