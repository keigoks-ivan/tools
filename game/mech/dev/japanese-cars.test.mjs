import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildJapaneseCar } from '../japanese-cars.mjs';

const names=['body','dark','metal','glass','lights'];
const triangles=car=>names.reduce((sum,key)=>sum+(car[key]?.attributes.position.count||0)/3,0);
const bounds=car=>names.reduce((box,key)=>car[key]?box.union(car[key].boundingBox):box,new THREE.Box3());

test('three Japanese silhouettes use metre proportions, ground contact and five reusable buckets',()=>{
  const expected=[[4.60,1.78,1.43],[3.995,1.695,1.515],[4.395,1.795,1.54]];
  for(let variant=0;variant<3;variant++)for(const detail of [false,true]) {
    const car=buildJapaneseCar(variant,{detail}),p=car.profile,b=bounds(car),size=b.getSize(new THREE.Vector3());
    assert.deepEqual([p.length,p.width,p.height],expected[variant]);assert.equal(p.forward,'+Z');
    assert(Math.abs(p.axles[1]-p.axles[0]-p.wheelbase)<1e-6);
    assert(size.x<=1.90&&size.z<=4.70&&size.y<=1.65);
    assert(Math.abs(b.min.y)<1e-6,'tyres must touch y=0');
    assert(Math.abs(b.max.y-p.height)<1e-5,'roof must retain the model height');
    assert(triangles(car)<= (detail?2200:750),'all material parts must fit the instanced car budget');
    assert.strictEqual(buildJapaneseCar(variant,{detail}),car);
    for(const key of names)assert(car[key]?.isBufferGeometry);
  }
  assert.strictEqual(buildJapaneseCar(3),buildJapaneseCar(0));
  assert.notStrictEqual(buildJapaneseCar(0,{detail:false}).body,buildJapaneseCar(0).body);
});

test('all intact, burned and crashed geometry has finite attributes and outward shading normals',()=>{
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(let variant=0;variant<3;variant++)for(const detail of [false,true])for(const burned of [false,true])for(const crashed of [false,true]) {
    const car=buildJapaneseCar(variant,{detail,burned,crashed});
    assert(triangles(car)<=(detail?2200:750));
    for(const key of names) {
      const g=car[key];if(!g){assert.equal(key,'glass');assert(burned);continue;}
      assert.deepEqual(Object.keys(g.attributes).sort(),['color','normal','position']);
      const p=g.attributes.position,q=g.attributes.normal;
      assert.equal(p.count,q.count);assert.equal(g.attributes.color.count,p.count);
      for(const attribute of Object.values(g.attributes))assert([...attribute.array].every(Number.isFinite));
      for(let i=0;i<p.count;i+=3) {
        a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);b.cross(c);
        assert(b.lengthSq()>1e-14,`${variant}/${key}: degenerate triangle`);b.normalize();
        n.set(q.getX(i)+q.getX(i+1)+q.getX(i+2),q.getY(i)+q.getY(i+1)+q.getY(i+2),q.getZ(i)+q.getZ(i+1)+q.getZ(i+2)).normalize();
        assert(b.dot(n)>.25,`${variant}/${key}: normal disagrees with face winding`);
      }
    }
  }
});

test('wheel arches cut through the body and cabin windows leave real openings when burned',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const hits=(geometry,y,z)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld();
    return new THREE.Raycaster(new THREE.Vector3(2,y,z),new THREE.Vector3(-1,0,0)).intersectObject(mesh);
  };
  for(let variant=0;variant<3;variant++)for(const detail of [false,true]) {
    const car=buildJapaneseCar(variant,{detail}),burned=buildJapaneseCar(variant,{detail,burned:true});
    for(const axle of car.profile.axles)assert.equal(hits(car.body,.42,axle).length,0,'body must not cover a wheel with a dark painted circle');
    assert(hits(car.body,.70,0).length>0,'door skin between the arches must remain');
    assert(hits(car.glass,1.16,0).length>0,'narrow greenhouse must have separate side glass');
    assert.equal(hits(car.body,1.16,0).length,0,'intact window must not have paint underneath');
    assert.equal(burned.glass,null);assert.equal(hits(burned.body,1.16,0).length,0,'burned window must remain an opening');
    assert(Math.abs(bounds(burned).max.y-car.profile.height)<1e-5,'burning must retain the recognizable roof silhouette');
    const crashed=buildJapaneseCar(variant,{detail,crashed:true});
    assert(bounds(crashed).max.z<bounds(car).max.z-.20,'crash damage must shorten only the nose');
  }
});

test('painted crown uses shared smooth section normals while the lamps and rims keep sharp faces',()=>{
  for(let variant=0;variant<3;variant++) {
    const car=buildJapaneseCar(variant),p=car.body.attributes.position,n=car.body.attributes.normal;
    let smoothCrown=false;
    for(let i=0;i<p.count;i+=3) {
      if(p.getY(i)<1.15||p.getY(i+1)<1.15||p.getY(i+2)<1.15)continue;
      const a=new THREE.Vector3().fromBufferAttribute(n,i),b=new THREE.Vector3().fromBufferAttribute(n,i+1),c=new THREE.Vector3().fromBufferAttribute(n,i+2);
      if(a.distanceTo(b)>.01&&a.dot(b)>.70&&a.dot(c)>.70)smoothCrown=true;
    }
    assert(smoothCrown,'crown shading must interpolate along the continuous shell');
    const lamp=car.lights.attributes.normal;
    for(let i=0;i<lamp.count;i+=3)for(let j=1;j<3;j++)assert(new THREE.Vector3().fromBufferAttribute(lamp,i).distanceTo(new THREE.Vector3().fromBufferAttribute(lamp,i+j))<1e-6);
  }
});

test('bowed bumper corners and distinct lamp silhouettes survive the reduced street geometry',()=>{
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),lampHeights=[];
  for(let variant=0;variant<3;variant++)for(const detail of [false,true]) {
    const car=buildJapaneseCar(variant,{detail}),half=car.profile.length/2,mesh=new THREE.Mesh(car.body,material);mesh.updateMatrixWorld();
    const noseAt=x=>new THREE.Raycaster(new THREE.Vector3(x,.72,half+1),new THREE.Vector3(0,0,-1)).intersectObject(mesh)[0]?.point.z;
    assert(noseAt(0)-noseAt(.55)>.07,'nose corners must sweep back from the centre rather than end in a flat plate');
    const lamp=car.lights.attributes.position,ys=[];
    for(let i=0;i<lamp.count;i++)if(lamp.getZ(i)>half-.40)ys.push(lamp.getY(i));
    const height=Math.max(...ys)-Math.min(...ys);
    if(!detail)lampHeights[variant]=height;
    assert(ys.length>0);assert(height>(variant===1?.16:.03));
    const glass=car.glass.attributes.color;
    assert(glass.getX(0)<.07&&glass.getY(0)<.08&&glass.getZ(0)<.09,'glass must read as dark neutral blue rather than turquoise paper');
  }
  assert(lampHeights[1]>lampHeights[0]+.025,'Fit lamps must be taller than the Prius low hooked LED lamps');
  assert(lampHeights[1]>lampHeights[2]+.07,'Fit lamps must remain distinct from the Mazda narrow lamp strip');
});
