import * as THREE from './vendor/three.module.js';

// Surface normals follow the continuous shape rather than the particular
// diagonals of a sparse mesh, preserving clean reflections on broad panels.
export function surfaceNormal(project, u, v, direction) {
  const h=.0001,a=new THREE.Vector3(...project(u+h,v)).sub(new THREE.Vector3(...project(u-h,v))),b=new THREE.Vector3(...project(u,v+h)).sub(new THREE.Vector3(...project(u,v-h)));
  const normal=a.cross(b).normalize();if(normal.dot(direction)<0)normal.negate();return normal;
}

export function loftGeometry(columns, rows, project, direction, baseY=.46, include=()=>true) {
  const vertices=[],normals=[],indices=[];
  for(let i=0;i<=columns;i++)for(let j=0;j<=rows;j++){
    const u=i/columns,v=j/rows,p=project(u,v),n=surfaceNormal(project,u,v,direction);
    vertices.push(p[0],p[1]-baseY,p[2]);normals.push(n.x,n.y,n.z);
  }
  for(let i=1;i<=columns;i++)for(let j=1;j<=rows;j++){
    if(!include((i-.5)/columns,(j-.5)/rows))continue;
    const a=i*(rows+1)+j,b=a-1,c=a-rows-1,d=c-1;
    const p=k=>new THREE.Vector3(...vertices.slice(k*3,k*3+3));
    if(p(c).sub(p(a)).cross(p(b).sub(p(a))).dot(direction)>=0)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);return geometry;
}

export function projectedNormals(geometry, parameters, project, direction) {
  const normals=[];
  for(const [u,v]of parameters){const n=surfaceNormal(project,u,v,direction);normals.push(n.x,n.y,n.z);}
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return geometry;
}

export function weldSurfaceNormals(geometry, tolerance=.00001) {
  const position=geometry.attributes.position,normal=geometry.attributes.normal,groups=new Map();
  for(let i=0;i<position.count;i++){
    const key=[position.getX(i),position.getY(i),position.getZ(i)].map(value=>Math.round(value/tolerance)).join(':');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);
  }
  for(const indices of groups.values()){
    if(indices.length<2)continue;
    const n=new THREE.Vector3();for(const i of indices)n.add(new THREE.Vector3().fromBufferAttribute(normal,i));n.normalize();
    for(const i of indices)normal.setXYZ(i,n.x,n.y,n.z);
  }
  return geometry;
}
