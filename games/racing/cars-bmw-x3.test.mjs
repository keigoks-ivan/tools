import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from './vendor/three.module.js';

register('data:text/javascript,' + encodeURIComponent(`export function initialize(data){globalThis.three=data.three;}export function resolve(specifier,context,nextResolve){return nextResolve(specifier==='three'?globalThis.three:specifier,context);}`), { parentURL: import.meta.url, data: { three: new URL('./vendor/three.module.js', import.meta.url).href } });
const { createBMWX3, BMW_X3_DIMENSIONS, BMW_X3_RUNNING_GEAR } = await import('./cars-bmw-x3.js');
function surfaces(car, names) {
  const list=[];car.group.traverse(node=>{if(node.isMesh&&names.some(name=>node.name.includes(name)))list.push(node);});return list;
}
function rayPoint(meshes, origin, direction) {
  const hits=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObjects(meshes,false);
  assert.ok(hits.length,'a physical surface closes this part of the car');return hits[0].point;
}
for(const mobile of[false,true]) {
  test(`G45 ${mobile?'phone':'desktop'}: selected-car API, bounded geometry and ownership`,()=>{
    const car=createBMWX3({mobile}),geometries=new Set(),materials=new Set(),textures=new Set();let triangles=0,meshes=0;
    assert.deepEqual(car.dimensions,{length:4.755,width:1.920,height:1.660,wheelbase:2.865});
    car.group.traverse(node=>{if(!node.isMesh)return;meshes++;geometries.add(node.geometry);materials.add(node.material);for(const value of Object.values(node.material))if(value?.isTexture)textures.add(value);for(const attribute of Object.values(node.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite),`${node.name} has finite positions/normals`);assert.ok(node.geometry.index);assert.ok(node.geometry.index.array.every(i=>i<node.geometry.attributes.position.count));triangles+=node.geometry.index.count/3;});
    assert.ok(triangles>25000&&triangles<(mobile?50000:100000),`bounded detail: ${triangles}`);assert.ok(meshes<65,`bounded draws: ${meshes}`);assert.equal(textures.size,2);assert.ok([...materials].every(m=>(m.transmission||0)===0));
    const wheels=car.group.children.filter(node=>node.name.endsWith('-steer'));assert.equal(wheels.length,4);assert.equal(wheels[0].position.z-wheels[2].position.z,2.865);assert.equal(wheels[0].position.z,1.4975);assert.equal(wheels[2].position.z,-1.3675);
    assert.equal(wheels[0].position.y,.3687);assert.equal(wheels[2].position.y,.36645);assert.equal(wheels[0].position.x,-.811);assert.equal(wheels[2].position.x,-.8115);
    car.update({speed:20,steeringAngle:.3,longitudinalAccel:3,lateralAccel:4,brake:1},.08);assert.ok(wheels[0].rotation.y>.15);assert.equal(wheels[2].rotation.y,0);assert.ok(wheels[0].getObjectByName('wheel-spin').rotation.x<0);assert.ok(car.group.getObjectByName('suspension-response').rotation.x<0);assert.ok(car.group.getObjectByName('suspension-response').rotation.z>0);
    assert.ok([...materials].find(m=>m.name==='led-brakelamp').emissiveIntensity>2);car.setPaint('#2674b8');assert.equal([...materials].find(m=>m.name==='body-paint').color.getHexString(),'2674b8');
    car.update({speed:NaN,steeringAngle:NaN,longitudinalAccel:NaN,lateralAccel:NaN},NaN);car.group.updateMatrixWorld(true);car.group.traverse(node=>assert.ok(node.matrixWorld.elements.every(Number.isFinite)));
    const count=new Map([...geometries,...materials,...textures].map(resource=>[resource,0]));for(const resource of count.keys())resource.addEventListener('dispose',()=>count.set(resource,count.get(resource)+1));car.dispose();car.dispose();assert.ok([...count.values()].every(value=>value===1),'each live owned resource disposes once');
  });
  test(`G45 ${mobile?'phone':'desktop'}: sculpted shoulders and real recessed hatch`,()=>{
    const car=createBMWX3({mobile,inspectParts:true});car.group.updateMatrixWorld(true);
    const body=surfaces(car,['sculpted-body']),hatch=surfaces(car,['sculpted-hatch-and-bumper']);
    const shoulder=rayPoint(body,[2,1.095,-.02],[-1,0,0]),waist=rayPoint(body,[2,.718,-.02],[-1,0,0]),belt=rayPoint(body,[2,1.205,-.02],[-1,0,0]);
    assert.ok(shoulder.x-waist.x>.07,'door waist is a broad concave surface, not a flat box');assert.ok(shoulder.x-belt.x>.045,'shoulder rolls inward towards the windows');
    const outer=rayPoint(hatch,[.58,.72,-4],[0,0,1]),inner=rayPoint(hatch,[0,.72,-4],[0,0,1]);assert.ok(inner.z-outer.z>.055,'number-plate well is at least 55 mm recessed into the hatch');
    const upper=rayPoint(hatch,[0,1.00,-4],[0,0,1]),lower=rayPoint(hatch,[0,.61,-4],[0,0,1]);assert.ok(lower.z-upper.z>.05,'lower hatch tapers into the bumper');
    const rear=car.group.getObjectByName('g45-rear-window'),positions=rear.geometry.getAttribute('position');let maxY=-Infinity,minY=Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<positions.count;i++){maxY=Math.max(maxY,positions.getY(i)+.46);minY=Math.min(minY,positions.getY(i)+.46);minZ=Math.min(minZ,positions.getZ(i));maxZ=Math.max(maxZ,positions.getZ(i));}
    assert.ok(maxY>1.56&&maxY<1.60);assert.ok(minY>1.26&&minY<1.29);assert.ok(maxZ-minZ>.30,'rear privacy glass slopes continuously down to the hatch');
    car.dispose();
  });
  test(`G45 ${mobile?'phone':'desktop'}: front/rear lamps occupy real physical enclosures`,()=>{
    const car=createBMWX3({mobile,inspectParts:true});car.group.updateMatrixWorld(true);
    const heads=surfaces(car,['front-headlamp-clear-lens']),tails=surfaces(car,['tail-lamp-moulded-lens']);assert.equal(heads.length,2);assert.equal(tails.length,2);
    const headBounds=new THREE.Box3().setFromObject(heads[0]),tailBounds=new THREE.Box3().setFromObject(tails[0]);assert.ok(headBounds.getSize(new THREE.Vector3()).y>.145,'front enclosure has the official tall outer corner');assert.ok(headBounds.getSize(new THREE.Vector3()).z>.12,'headlamp wraps around the front shoulder');
    assert.ok(tailBounds.getSize(new THREE.Vector3()).y>.19,'outer tail block is taller than the inner blade');assert.ok(tailBounds.getSize(new THREE.Vector3()).z>.10,'rear lens wraps around the quarter');
    assert.equal(surfaces(car,['three-thick-horizontal-grille-bars']).length,6);assert.equal(surfaces(car,['black-quad-exhaust-tip']).length,4);
    assert.equal(surfaces(car,['double-L-front-light-guide']).length,4);assert.equal(surfaces(car,['opposed-L-thick-light-guide']).length,6);
    const paint=surfaces(car,['sculpted-front-fascia']);assert.equal(new THREE.Raycaster(new THREE.Vector3(.27,.87,4),new THREE.Vector3(0,0,-1)).intersectObjects(paint).length,0,'front grille is cut out of the painted fascia rather than a black sticker');
    for(const side of[-1,1]){
      const hit=new THREE.Raycaster(new THREE.Vector3(side*.85,.54,4),new THREE.Vector3(0,0,-1)).intersectObject(car.group,true)[0];
      assert.equal(hit.object.material.name,'recessed-air-intake','both swept outer air curtains are real openings with a recessed black interior');
    }
    car.dispose();
  });
  test(`G45 ${mobile?'phone':'desktop'}: readable recessed plate and four grounded tyre contacts`,()=>{
    const car=createBMWX3({mobile,inspectParts:true});car.group.updateMatrixWorld(true);
    const hit=new THREE.Raycaster(new THREE.Vector3(0,.704,-4),new THREE.Vector3(0,0,1)).intersectObject(car.group,true)[0];
    assert.equal(hit.object.material.name,'rear-number-plate-artwork','original lettering is the outermost plate surface');assert.ok(hit.object.geometry.getAttribute('uv'));assert.equal(hit.object.material.map.image.width,256);assert.equal(hit.object.material.map.image.height,64);
    const shadow=car.group.getObjectByName('contact-shadow'),{width,height,data}=shadow.material.map.image;assert.equal(width,64);assert.equal(height,128);
    const sample=(x,z)=>{const px=Math.round((x/shadow.geometry.parameters.width+.5)*63),py=Math.round((.5-z/shadow.geometry.parameters.height)*127);return data[(py*64+px)*4+3];};
    for(const z of[1.4975,-1.3675])for(const x of[-.811,.811])assert.ok(sample(x,z)>165,'the tyre touches a darker local contact patch');
    assert.ok(sample(.81,.03)<sample(.811,1.4975)-70,'open road between the tyres is lighter than the contact patch');assert.equal(data[3],0);
    assert.equal(shadow.castShadow,false);assert.equal(shadow.receiveShadow,false);car.dispose();
  });
  test(`G45 ${mobile?'phone':'desktop'}: rolled rear shoulders are closed in both three-quarter views`,()=>{
    const car=createBMWX3({mobile,inspectParts:true});car.group.updateMatrixWorld(true);
    const camera=new THREE.PerspectiveCamera(38,1920/814,.05,100),ray=new THREE.Raycaster();
    for(const side of[-1,1]){
      camera.position.set(side*4.08,2.12,-5.10);camera.lookAt(0,.88,0);camera.updateMatrixWorld(true);
      for(const[x,y]of[[1129,423],[1130,420],[1135,420],[1130,425]]){
        ray.setFromCamera(new THREE.Vector2(side*(x/1920*2-1),1-y/814*2),camera);
        const hit=ray.intersectObject(car.group,true)[0];
        assert.ok(hit?.object.material.name==='body-paint','the painted rolled corner closes the silhouette without exposing interior geometry');
        assert.ok(Math.abs(hit.point.x)>.82&&hit.point.y>1.22&&hit.point.z<-2,'the ray reaches the actual outer rear quarter');
      }
    }
    car.dispose();
  });
}
test('G45 side glass, roof and front/rear wheel specification are symmetric',()=>{
  assert.ok(Math.abs(BMW_X3_DIMENSIONS.length-BMW_X3_DIMENSIONS.wheelbase-(.880+1.010))<1e-12);assert.equal(BMW_X3_RUNNING_GEAR.rimRadius,21*.0254/2);
  const car=createBMWX3({mobile:true,inspectParts:true});car.group.updateMatrixWorld(true);
  const roof=surfaces(car,['gently-crowned-roof']),middle=rayPoint(roof,[0,3,-.30],[0,-1,0]),edge=rayPoint(roof,[.6,3,-.30],[0,-1,0]);assert.ok(middle.y-edge.y<.025,'roof crown is shallow, with long straight shoulder lines');
  const sideWindows=surfaces(car,['g45-window-']).filter(node=>!node.name.includes('seal'));assert.equal(sideWindows.length,6);assert.ok(sideWindows.every(node=>node.geometry.attributes.position.array.every(Number.isFinite)));
  const closed=surfaces(car,['closed-wheel-well-back']);assert.equal(closed.length,4);car.dispose();
});


test('G45 body shoulder and upper side share a continuous narrow-band normal while preserving the SUV roof', () => {
  for(const mobile of [false,true]){
    const car=createBMWX3({mobile,inspectParts:true}),top=car.group.getObjectByName('g45-under-greenhouse-shoulder'),side=car.group.getObjectByName('g45-right-sculpted-body');
    const p=top.geometry.attributes.position,n=top.geometry.attributes.normal,q=side.geometry.attributes.position,m=side.geometry.attributes.normal,topRows=[];
    for(let i=0;i<p.count;i++)if(p.getX(i)>.84&&Math.abs(p.getZ(i))<1.4)topRows.push(i);
    let compared=0;
    for(let j=q.count-(mobile?81:113);j<q.count;j++)if(q.getX(j)>.84&&Math.abs(q.getZ(j))<1.4&&q.getY(j)>.70){
      let nearest=-1,distance=Infinity;for(const i of topRows){const d=Math.abs(p.getZ(i)-q.getZ(j))+Math.abs(p.getX(i)-q.getX(j))+Math.abs(p.getY(i)-q.getY(j));if(d<distance){distance=d;nearest=i;}}
      if(distance>.065)continue;
      assert.ok(new THREE.Vector3().fromBufferAttribute(n,nearest).dot(new THREE.Vector3().fromBufferAttribute(m,j))>.96,'the same curved belt does not shade as two perpendicular plates');compared++;
    }
    assert.ok(compared>8,'both quality levels include the physical shoulder band');car.dispose();
  }
});
