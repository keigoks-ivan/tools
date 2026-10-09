import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { loftGeometry, projectedNormals, weldSurfaceNormals } from './vehicle-body-surfaces.js';

test('reflection normals on a rounded fender remain independent of tessellation density', () => {
  const project=(u,v)=>[u,Math.sqrt(1-u*u),v];
  for(const columns of [4,16]){
    const geometry=loftGeometry(columns,4,(u,v)=>project(u*.8,v),new THREE.Vector3(0,1,0),0);
    const p=geometry.attributes.position,n=geometry.attributes.normal;
    for(let i=0;i<p.count;i++){const expected=new THREE.Vector3(p.getX(i),p.getY(i),0).normalize(),actual=new THREE.Vector3().fromBufferAttribute(n,i);assert.ok(expected.dot(actual)>.99999,'coarse diagonals do not flatten the fender reflection');}
    geometry.dispose();
  }
});

test('coincident panel boundaries share one shadow normal without smoothing an unrelated crease', () => {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0,1,0,0],3));g.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,1,0,0,0,0,1],3));weldSurfaceNormals(g);
  const n=g.attributes.normal;assert.ok(new THREE.Vector3().fromBufferAttribute(n,0).distanceTo(new THREE.Vector3().fromBufferAttribute(n,1))<1e-8);assert.equal(n.getZ(2),1,'a separate panel retains its geometric normal');g.dispose();
});

test('a forward-facing optic follows the recessed nose normal rather than its original flat triangulation', () => {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.4,0,-.032,0,.2,0],3));g.setIndex([0,1,2]);
  projectedNormals(g,[[0,0],[.4,0],[0,.2]],(x,y)=>[x,y,-.2*x*x],new THREE.Vector3(0,0,1));const n=g.attributes.normal;
  assert.ok(n.getZ(0)>.999);assert.ok(n.getX(1)>.15&&n.getZ(1)>.98,'recessed outer lens rolls with the fascia');g.dispose();
});
