import * as THREE from 'three';

export const facadeNames=['glass','office','concrete','brick2'];
export const tileWidths=[36,28.8,20.4,20.4];
const facadeCache=new WeakMap();

export function facadeMaps(world){
  if(facadeCache.has(world))return facadeCache.get(world);
  const loader=typeof document==='undefined'?null:new THREE.TextureLoader();
  const maps=facadeNames.map((type,i)=>{
    const existing=world.A?.fac?.[[0,1,3,4][i]];
    if(existing?.[0])return existing;
    if(!loader)return [];
    return ['col','nor','arm'].map((kind,j)=>{
      const texture=loader.load(new URL('./zero/assets/env/fac_'+type+'_'+kind+'.webp',import.meta.url).href);
      if(!j)texture.colorSpace=THREE.SRGBColorSpace;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
      return texture;
    });
  });
  facadeCache.set(world,maps);
  return maps;
}

// Keep dozens of street blocks in a handful of indexed meshes; retain metre-based window and pavement UVs.
export class Faces {
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
