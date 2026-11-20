import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Each field object uses one vertex-coloured mesh. Only the falling canopy moves separately.
export function fieldKit(scene, kind) {
  const root = new THREE.Group();
  root.name=kind;
  const material = new THREE.MeshStandardMaterial({ vertexColors:true, flatShading:true, roughness:.63, metalness:.34 });
  let parts = [];
  function part(geo, color, x, y, z, tilt=0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.rotateZ(tilt); g.translate(x,y,z);
    const c = new THREE.Color(color), colors = new Float32Array(g.attributes.position.count*3);
    for (let i=0; i<colors.length; i+=3) c.toArray(colors,i);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3)); parts.push(g);
  }
  function batch() {
    const geometry = mergeGeometries(parts);
    parts.forEach(g=>g.dispose()); parts=[];
    const mesh = new THREE.Mesh(geometry,material);
    mesh.receiveShadow=true; root.add(mesh); return mesh;
  }
  const box = (w,h,d,c,x,y,z) => part(new THREE.BoxGeometry(w,h,d),c,x,y,z);
  const tube = (r,h,c,x,y,z,tilt=0) => part(new THREE.CylinderGeometry(r,r,h,8),c,x,y,z,tilt);
  const metal=0x38464c, pale=0xd6d3b7, orange=0xe48137, blue=0x56c5d6;
  let canopy=null;
  if (kind==='recorder') {
    box(3.3,2.4,2.1,orange,0,1.3,0);
    for (const x of [-1,1]) box(.26,2.54,2.24,metal,x,1.3,0);
    box(.79,.54,.1,0xfff1bb,0,1.4,1.08);
    batch();
    const dome=new THREE.SphereGeometry(4.7,12,5,0,Math.PI*2,0,Math.PI/2);
    dome.scale(1,.54,1); part(dome,orange,0,7.2,0);
    for (const x of [-1,1]) for (const z of [-1,1]) {
      const a=new THREE.Vector3(x,2.45,z*.8), b=new THREE.Vector3(x*3.3,7.2,z*3.3);
      const v=b.clone().sub(a), g=new THREE.CylinderGeometry(.065,.065,v.length(),4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));
      part(g,pale,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    }
    canopy=batch();
  } else {
    const accent=kind==='shield'?blue:orange;
    box(7,.65,4.8,metal,0,.35,0);
    for (const x of [-2.65,2.65]) {
      box(.5,4.8,.7,metal,x,2.65,-1.55);
      box(.62,1.15,.82,accent,x,4.1,-1.55);
    }
    box(5.8,.35,.7,pale,0,4.92,-1.55);
    if (kind==='shield') {
      for (const x of [-1.15,1.15]) {
        tube(.78,3.45,metal,x,2.4,.1);
        for (let i=0;i<5;i++) tube(.9,.22,blue,x,1.1+i*.59,.1);
      }
    } else {
      for (const z of [-.7,.65]) for (const y of [1.3,2.5]) {
        tube(.57,4.7,metal,0,y,z,Math.PI/2);
        for (const x of [-1.7,1.7]) tube(.61,.36,orange,x,y,z,Math.PI/2);
      }
    }
    batch();
  }
  scene.add(root);
  return { root, canopy, dispose() { root.removeFromParent(); for (const m of root.children) m.geometry.dispose(); material.dispose(); } };
}
