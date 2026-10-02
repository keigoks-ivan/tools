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
  const shaft=createArrowGeometry(T),parts=[];
  for(const turn of [0,Math.PI/2]) {
    const strip=new T.PlaneGeometry(1,1);strip.rotateX(Math.PI/2);strip.rotateZ(turn);strip.translate(0,0,-.15);parts.push(strip);
  }
  const ribbon=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  const core=ribbon.clone(),alpha=new Float32Array(capacity);
  for(const geometry of [ribbon,core])geometry.setAttribute('arrowAlpha',new T.InstancedBufferAttribute(alpha,1).setUsage(T.DynamicDrawUsage));
  function glowMaterial() {
    const material=new T.MeshBasicMaterial({color:0xffffff,transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    material.defines={USE_UV:''};material.customProgramCacheKey=()=> 'jade-arrow-ribbon-v1';
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float arrowAlpha; varying float vArrowAlpha;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArrowAlpha=arrowAlpha;');
      shader.fragmentShader='varying float vArrowAlpha;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a *= vArrowAlpha * pow(max(0.0,1.0-abs(vUv.x*2.0-1.0)),1.6) * smoothstep(0.0,0.45,vUv.y) * (1.0-smoothstep(0.85,1.0,vUv.y));');
    };
    return material;
  }
  const materials=[new T.MeshStandardMaterial({color:0xe7ead6,emissive:0x35956a,emissiveIntensity:.5,metalness:.25,roughness:.45}),glowMaterial(),glowMaterial()];
  const meshes=[shaft,ribbon,core].map((geometry,i)=>{const mesh=new T.InstancedMesh(geometry,materials[i],capacity);mesh.frustumCulled=false;mesh.visible=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);return mesh;});
  const items=Array.from({length:capacity},()=>({visible:false,remaining:0,speed:0,vx:0,vz:0,tier:1,position:new T.Vector3()}));
  const dummy=new T.Object3D(),color=new T.Color();let cursor=0;
  function write(index) {
    const item=items[index];dummy.position.copy(item.position);dummy.rotation.set(0,Math.atan2(item.vx,item.vz),0);
    for(const [i,mesh] of meshes.entries()) {
      if(!item.visible)dummy.scale.setScalar(0);
      else if(i===0)dummy.scale.setScalar(1+item.tier*.06);
      else dummy.scale.set(i===1?.13+item.tier*.045:.025+item.tier*.009,i===1?.13+item.tier*.045:.025+item.tier*.009,.9+item.tier*.28);
      dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
    }
    alpha[index]=item.visible?.65+item.tier*.06:0;
  }
  function flush(){const active=items.some(item=>item.visible);for(const mesh of meshes){mesh.visible=active;mesh.instanceMatrix.needsUpdate=true;}ribbon.attributes.arrowAlpha.needsUpdate=true;core.attributes.arrowAlpha.needsUpdate=true;}
  for(let i=0;i<capacity;i++)write(i);
  return {
    onEvent(event) {
      if(event.type!=='arrow')return;
      const index=cursor++%capacity,item=items[index],x=(event.x-640)/60,z=(event.y-500)/60;
      Object.assign(item,{id:event.id,remaining:event.range/60,speed:event.speed/60,vx:Math.cos(event.facing),vz:Math.sin(event.facing),tier:Math.min(5,event.fxTier||1),visible:true});
      item.position.set(x,groundAt(x,z)+1.30+(event.height||0),z);
      meshes[1].setColorAt(index,color.setHex(item.tier>=4?0x79e5b8:0x51d8a0));meshes[2].setColorAt(index,color.setHex(item.tier>=4?0xffedbc:0xf2ffdf));
      meshes[1].instanceColor.needsUpdate=true;meshes[2].instanceColor.needsUpdate=true;write(index);flush();
    },
    update(dt,projectiles) {
      for(const [index,item] of items.entries()) {
        if(!item.visible)continue;
        if(projectiles) {
          const shot=projectiles.find(p=>p.id===item.id);
          if(!shot)item.visible=false;
          else {item.position.x=(shot.x-640)/60;item.position.z=(shot.y-500)/60;}
        } else {
          const distance=Math.min(item.remaining,item.speed*dt);item.position.x+=item.vx*distance;item.position.z+=item.vz*distance;item.remaining-=distance;if(item.remaining<=0)item.visible=false;
        }
        write(index);
      }
      flush();
    },
    reset(){items.forEach((item,i)=>{item.visible=false;write(i);});flush();},
    dispose(){for(const mesh of meshes){scene.remove(mesh);mesh.dispose();}for(const geometry of [shaft,ribbon,core])geometry.dispose();for(const material of materials)material.dispose();},
    stats(){return {capacity,active:items.filter(item=>item.visible).length};},
  };
}
