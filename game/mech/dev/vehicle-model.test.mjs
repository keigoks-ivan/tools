import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGroundVehicleModel } from '../zero/vehicle-model.mjs';
import { GroundVehicle, VEHICLE_TYPES } from '../zero/ground-vehicle.mjs';
import { Solid } from '../zero/kit.js';

const materials={};for(const key of ['carPaint','carDark','carMetal','carGlass','carLights'])materials[key]=new THREE.MeshStandardMaterial({vertexColors:true});
const model=type=>createGroundVehicleModel(type,{materials});
const geometries=m=>{const result=[];m.root.traverse(o=>{if(o.isMesh)result.push(o.geometry);});return result;};
const matrixOf=(m,index=0)=>{const a=new THREE.Matrix4();m.root.getObjectByName('vehicle-tyres').getMatrixAt(index,a);return a;};

test('four-wheel patrol and APC fit their controller footprint and strict rendering budget',()=>{
  for(const type of ['patrol','apc']) {
    const m=model(type),p=VEHICLE_TYPES[type];m.root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(m.root),size=box.getSize(new THREE.Vector3());
    assert.equal(m.profile.forward,'+Z');assert.equal(m.profile.fictional,true);
    assert.deepEqual([m.profile.length,m.profile.width,m.profile.height],[p.length,p.width,p.height]);
    assert(size.x<=p.width+.003,'mirrors, armour and wheels must fit the collision width');
    assert(size.z<=p.length+.003,'bumper and rear steps must fit the collision length');
    assert(Math.abs(box.min.y)<1e-6,'tread must contact the ground at y=0');
    assert(box.max.y<=m.profile.totalHeight+.001);
    let triangles=0,calls=0;m.root.traverse(o=>{assert(!o.isLight);if(o.isMesh){calls++;triangles+=o.geometry.attributes.position.count/3*(o.count||1);assert(Object.values(materials).includes(o.material));}});
    assert.equal(calls,9);assert.equal(triangles,m.profile.triangles);assert(triangles<=(type==='patrol'?4500:6500));
    assert.equal(m.wheels.length,4);assert.equal(m.wheels.filter(w=>w.userData.front).length,2);
    for(const w of m.wheels)assert.equal(w.position.y,p.wheelRadius);
  }
});

test('all model surfaces have finite attributes, nondegenerate faces and correct shading normals',()=>{
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(const type of ['patrol','apc'])for(const destroyed of [false,true]) {
    const m=model(type);m.update({destroyed});
    for(const g of geometries(m)) {
      assert.deepEqual(Object.keys(g.attributes).sort(),['color','normal','position']);
      const p=g.attributes.position,q=g.attributes.normal;assert.equal(p.count,q.count);assert.equal(p.count,g.attributes.color.count);
      for(const attr of Object.values(g.attributes))assert([...attr.array].every(Number.isFinite));
      for(let i=0;i<p.count;i+=3) {
        a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);b.cross(c);
        assert(b.lengthSq()>1e-14,'no degenerate triangle');b.normalize();
        n.set(q.getX(i)+q.getX(i+1)+q.getX(i+2),q.getY(i)+q.getY(i+1)+q.getY(i+2),q.getZ(i)+q.getZ(i+1)+q.getZ(i+2)).normalize();
        assert(b.dot(n)>.25,'normal agrees with triangle winding');
      }
    }
  }
});

test('wheel steering follows the controller turn and both outside rims stay on their correct side',()=>{
  for(const type of ['patrol','apc']) {
    const m=model(type);m.update({steer:.38,wheelSpin:1.23});
    for(let i=0;i<4;i++) {
      const w=m.wheels[i],mat=matrixOf(m,i),p=new THREE.Vector3(.1,0,0).applyMatrix4(mat).sub(w.position);
      assert(p.x*w.userData.side>0,'the common outer rim is mirrored by rotation, not negative scale');
      assert.equal(w.rotation.x,1.23);assert.equal(w.rotation.y,w.userData.front?-.38:0);
      assert(mat.determinant()>.99999,'instanced tyre transforms must not invert normals');
      const worldTop=new THREE.Vector3(0,.1,0).applyMatrix4(mat).sub(w.position);assert(worldTop.z>0,'left and right tyre spin agree on forward travel');
    }
    const previous=matrixOf(m,2);m.update({steer:0,wheelSpin:1.73});assert.notDeepEqual(matrixOf(m,2).elements,previous.elements);
  }
});

test('articulated visible barrel uses +Z yaw and positive elevation at the real controller muzzle',()=>{
  for(const type of ['patrol','apc']) {
    const m=model(type),p=VEHICLE_TYPES[type],yaw=.71,pitch=.28;
    m.update({turretYaw:yaw,turretPitch:pitch});m.root.updateMatrixWorld(true);
    const muzzle=m.muzzle.getWorldPosition(new THREE.Vector3()),mount=m.turret.getWorldPosition(new THREE.Vector3()),direction=muzzle.clone().sub(mount).normalize();
    const expected=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    assert(direction.distanceTo(expected)<1e-6);assert(Math.abs(muzzle.distanceTo(mount)-p.muzzle)<1e-6);assert.equal(mount.y,p.turretY);assert.equal(mount.z,p.turretZ);
    const v=new GroundVehicle({type,id:'visible-muzzle',solid:new Solid(),model:m,pos:new THREE.Vector3(8,0,12),yaw:.4});
    v.enter(new THREE.Vector3(6,0,12));v.setMode('gun');v.update(1/60,{lookYaw:1.1,lookPitch:.2});m.root.updateMatrixWorld(true);
    const aimed=m.muzzle.getWorldPosition(new THREE.Vector3()).sub(m.turret.getWorldPosition(new THREE.Vector3())).normalize();
    assert(aimed.distanceTo(new THREE.Vector3(Math.sin(1.1)*Math.cos(.2),Math.sin(.2),Math.cos(1.1)*Math.cos(.2)))<1e-6);
  }
});

test('actual wheel arches and separate large cabin panes are visible from side rays',()=>{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),hits=(g,x,y,z)=>{const mesh=new THREE.Mesh(g,mat);mesh.updateMatrixWorld();return new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(-1,0,0)).intersectObject(mesh);};
  for(const type of ['patrol','apc']) {
    const m=model(type),p=VEHICLE_TYPES[type],body=m.root.getObjectByName('vehicle-body').geometry,glass=m.root.getObjectByName('vehicle-glass').geometry;
    for(const axle of m.profile.axles)assert.equal(hits(body,2,p.wheelRadius,axle).length,0,'painted shell cannot cover the wheel with a full block');
    const z=type==='patrol'?-.9:1.08,y=type==='patrol'?1.53:1.70;
    assert(hits(glass,2,y,z).length>0,'side glass is its own physical surface');
    assert.equal(hits(body,2,y,z).length,0,'paint does not fill the side window');
    const front=new THREE.Mesh(body,mat);front.updateMatrixWorld();
    assert(new THREE.Raycaster(new THREE.Vector3(0,.55,p.length/2+1),new THREE.Vector3(0,0,-1)).intersectObject(front).length>0,'the front lower cap must close the triangle between the sill corners');
    m.root.updateMatrixWorld(true);
    assert.equal(new THREE.Raycaster(new THREE.Vector3(.07,.84,p.length/2+1),new THREE.Vector3(0,0,-1)).intersectObject(m.root,true)[0].object.name,'vehicle-dark','the real grille cavity must be visible in front of the recessed painted cap');
  }
});

test('destruction and retry reuse cached geometry without mutating shared materials or other cars',()=>{
  for(const type of ['patrol','apc']) {
    const a=model(type),b=model(type),normal=geometries(a),savedColors=normal.map(g=>g.attributes.color.array.slice()),materialColors=Object.values(materials).map(m=>m.color.getHex());
    a.update({destroyed:true});const burned=geometries(a);assert(burned.every((g,i)=>g!==normal[i]));
    assert.deepEqual(geometries(b),normal);assert.deepEqual(Object.values(materials).map(m=>m.color.getHex()),materialColors);
    for(let i=0;i<normal.length;i++)assert.deepEqual(normal[i].attributes.color.array,savedColors[i]);
    for(let i=0;i<20;i++) {a.update({destroyed:false});assert.deepEqual(geometries(a),normal);a.update({destroyed:true});assert.deepEqual(geometries(a),burned);}
    a.update({destroyed:false});assert.deepEqual(geometries(a),normal);a.dispose();a.dispose();assert.equal(a.root.children.length,0);
    const c=model(type);assert.deepEqual(geometries(c),normal,'disposal never frees the shared cached geometry');
  }
  assert.throws(()=>createGroundVehicleModel('tank',{materials}),RangeError);assert.throws(()=>createGroundVehicleModel('patrol'),TypeError);
});
