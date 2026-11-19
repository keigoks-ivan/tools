import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function fieldMaterial(world, color, roughness, metalness, surface, vertexColors = false) {
  const A = world.A;
  const stone = surface === 'concrete' || surface === 'precast';
  const map = stone ? A?.rubD : surface === 'asphalt' ? A?.asphD : null;
  const normalMap = stone ? A?.rubN : surface === 'asphalt' ? A?.asphN : surface === 'paint' ? A?.wearN : null;
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, map:map??null, normalMap:normalMap??null, vertexColors, normalScale: new THREE.Vector2(.18,.18) });
  if(surface==='precast' && map) {
    mat.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        vec3 aggregate=texture2D(map,vMapUv).rgb;
        diffuseColor.rgb*=mix(vec3(.72),aggregate,.36);
      `);
    };
  }
  return mat;
}

export class PropBatch {
  constructor(materials) {
    this.materials = materials;
    this.parts = new Map();
    this.cube = new THREE.BoxGeometry();
    this.plane = new THREE.PlaneGeometry(1,1,8,2).rotateX(-Math.PI/2);
    this.matrix = new THREE.Matrix4();
    this.origin = new THREE.Vector3();
    this.size = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.quat = new THREE.Quaternion();
    this.color = new THREE.Color();
  }
  add(key, geometry, x,y,z, w=1,h=1,d=1, rx=0,ry=0,rz=0, tint=0xffffff) {
    this.matrix.compose(this.origin.set(x,y,z),this.quat.setFromEuler(this.rotation.set(rx,ry,rz)),this.size.set(w,h,d));
    const mesh = geometry.clone().applyMatrix4(this.matrix);
    this.collect(key,mesh,tint);
  }
  collect(key, mesh, tint) {
    const p = mesh.attributes.position, n = mesh.attributes.normal, uv = mesh.attributes.uv;
    const colors = this.materials[key].vertexColors ? new Float32Array(p.count*3) : null;
    this.color.setHex(tint);
    for (let i=0; i<p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (Math.abs(n.getY(i))>.7) uv.setXY(i,x/4.2,z/4.2);
      else if (Math.abs(n.getX(i))>.7) uv.setXY(i,z/4.2,y/4.2);
      else uv.setXY(i,x/4.2,y/4.2);
      if(colors)this.color.toArray(colors,i*3);
    }
    if(colors)mesh.setAttribute('color',new THREE.BufferAttribute(colors,3));
    if (!this.parts.has(key)) this.parts.set(key,[]);
    this.parts.get(key).push(mesh);
  }
  box(key,...args) { this.add(key,this.cube,...args); }
  ground(world,key,x,z,w,d,lift) {
    const mesh=this.plane.clone().scale(w,1,d).translate(x,0,z);
    const p=mesh.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,world.height(p.getX(i),p.getZ(i))+lift);
    mesh.computeVertexNormals();
    this.collect(key,mesh,0xffffff);
  }
  finish(root) {
    for (const [key, geometries] of this.parts) {
      const g=mergeGeometries(geometries);
      geometries.forEach(o=>o.dispose());
      const m=new THREE.Mesh(g,this.materials[key]);
      m.name=key; m.castShadow=key!=='asphalt'&&key!=='mark'&&key!=='stripe';m.receiveShadow=true;
      m.userData.fieldGeometry=true;root.add(m);
    }
    this.cube.dispose();
    this.plane.dispose();
    this.parts.clear();
  }
}

// 一張小型字圖、一個網格容納所有遠近路牌。文字由字型繪製。
export function signAtlas(root,signs) {
  if(typeof document==='undefined')return null;
  const c=document.createElement('canvas');c.width=512;c.height=64*signs.length;
  const ctx=c.getContext('2d'),parts=[];
  signs.forEach(([label,x,y,z,rotation,width],i)=>{
    const v=i*64;
    ctx.fillStyle='#263f46';ctx.fillRect(0,v,512,64);
    ctx.strokeStyle='#bfcbc5';ctx.lineWidth=2;ctx.strokeRect(5,v+5,502,54);
    ctx.font='bold 35px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f0f1e4';
    ctx.fillText(label,256,v+32);
    const g=new THREE.PlaneGeometry(width,width/8).rotateY(rotation).translate(x,y,z);
    const uv=g.attributes.uv;
    for(let j=0;j<uv.count;j++)uv.setY(j,1-(i+1-uv.getY(j))/signs.length);
    parts.push(g);
  });
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshStandardMaterial({map,roughness:.73});
  const mesh=new THREE.Mesh(mergeGeometries(parts),mat);
  parts.forEach(p=>p.dispose());mesh.userData.fieldGeometry=true;root.add(mesh);
  return {dispose(){mat.dispose();map.dispose();}};
}
