import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import * as THREE from './vendor/three.module.js';
import { VEHICLES, PRODUCTION_CAR_DIMENSIONS } from './vehicles.mjs';
import { REAR_DETAIL_PROFILES } from './vehicle-rear-details.js';

// The browser import map resolves this same vendored Three module in production.
register('data:text/javascript,' + encodeURIComponent(`
  let three;
  export function initialize(data) { three = data.three; }
  export function resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three' ? three : specifier, context);
  }
`), { parentURL: import.meta.url, data: { three: new URL('./vendor/three.module.js', import.meta.url).href } });
const { createProductionCar } = await import('./cars-production.js');
globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({}, {get(target,key){return target[key]||(()=>{});},set(target,key,value){target[key]=value;return true;}});}};}};

for (const mobile of [false, true]) {
  for (const [id, spec] of Object.entries(PRODUCTION_CAR_DIMENSIONS)) {
    test(`${id} / ${mobile ? 'mobile' : 'desktop'}: finite model, real wheelbase, moving wheels and complete disposal`, () => {
      const car = createProductionCar({ vehicle: id, mobile });
      assert.equal(car.group.name, VEHICLES[id].name);
      assert.deepEqual(car.dimensions, spec);
      const geometry = new Set(), material = new Set(), texture = new Set();
      let meshCount = 0, triangleCount = 0;
      car.group.traverse(node => {
        if (!node.isMesh) return;
        meshCount++;
        geometry.add(node.geometry);
        for (const item of (Array.isArray(node.material) ? node.material : [node.material])) {
          material.add(item);
          for (const value of Object.values(item)) if (value?.isTexture) texture.add(value);
        }
        for (const [name, attribute] of Object.entries(node.geometry.attributes)) {
          assert.ok(attribute.count > 0, `${node.name}: empty ${name}`);
          assert.ok(attribute.array.every(Number.isFinite), `${node.name}: invalid ${name}`);
        }
        assert.ok(node.geometry.index.array.every(index => index < node.geometry.attributes.position.count), 'all triangles address existing vertices');
        triangleCount += node.geometry.index.count / 3;
      });
      assert.ok(meshCount < 65, `bounded draw count: ${meshCount}`);
      const detailBudget = id === 'bmwX3' ? (mobile ? 50000 : 100000) : (mobile ? 35000 : 60000);
      assert.ok(triangleCount > 8000 && triangleCount < detailBudget, `bounded detail: ${triangleCount}`);
      const bounds = new THREE.Box3().setFromObject(car.group), size = bounds.getSize(new THREE.Vector3());
      assert.ok(bounds.min.y > -.002, `tyres meet road: ${bounds.min.y}`);
      assert.ok(size.x > spec.width && size.x < spec.width + .7, 'mirrors and contact shadow bound the complete car');
      assert.ok(size.z > spec.length && size.z < spec.length + .8, 'bumpers and contact shadow bound the complete car');
      const wheels = car.group.children.filter(node => node.name.endsWith('-steer'));
      assert.equal(wheels.length, 4);
      assert.ok(Math.abs(Math.abs(wheels[0].position.z - wheels[2].position.z) - spec.wheelbase) < 1e-9);
      car.update({ speed: 28, steeringAngle: -.2, longitudinalAccel: 3, lateralAccel: 4, brake: 1 }, .08);
      assert.ok(wheels[0].rotation.y < -.1, 'front wheels follow the physical steering angle');
      assert.equal(wheels[2].rotation.y, 0, 'rear wheel upright stays aligned');
      assert.notEqual(wheels[0].getObjectByName('wheel-spin').rotation.x, 0, 'tyres rotate with speed');
      const chassis = car.group.getObjectByName('suspension-response');
      assert.ok(chassis.rotation.x < 0 && chassis.rotation.z > 0, 'body responds to acceleration');
      const lamp = [...material].find(item => item.name === 'led-brakelamp');
      assert.ok(lamp.emissiveIntensity > 2, 'brakes illuminate rear lamps');
      car.setPaint('#2674b8');
      assert.equal([...material].find(item => item.name === 'body-paint').color.getHexString(), '2674b8');
      car.update({ speed: NaN, steeringAngle: NaN, longitudinalAccel: NaN, lateralAccel: NaN }, NaN);
      car.group.updateMatrixWorld();
      car.group.traverse(node => assert.ok(node.matrixWorld.elements.every(Number.isFinite), 'invalid telemetry cannot corrupt the scene'));
      const disposed = new Map();
      for (const resource of [...geometry, ...material, ...texture]) {
        disposed.set(resource, 0);
        resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
      }
      car.dispose(); car.dispose();
      assert.ok([...disposed.values()].every(count => count === 1), 'every owned live resource disposes once');
    });
  }
}

test('all current models have distinct body and greenhouse geometry rather than a relabelled shell', () => {
  const hashes = new Set();
  for (const id of Object.keys(PRODUCTION_CAR_DIMENSIONS)) {
    const car = createProductionCar({ vehicle: id, mobile: true });
    const body = car.group.getObjectByName('suspension-response-body-paint');
    assert.ok(body, `${id}: painted silhouette exists`);
    const bytes = body.geometry.attributes.position.array;
    hashes.add(createHash('sha256').update(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)).digest('hex'));
    assert.ok(car.group.userData.model.signatures.length >= 4, `${id}: marque details present`);
    car.dispose();
  }
  assert.equal(hashes.size, Object.keys(PRODUCTION_CAR_DIMENSIONS).length);
  assert.ok(PRODUCTION_CAR_DIMENSIONS.bmwX3.height > PRODUCTION_CAR_DIMENSIONS.porsche911gt3rs.height + .3);
});

test('SL and MX-5 have open passenger compartments with seats instead of an opaque coupe roof', () => {
  for (const id of ['amgSL63', 'mazdaMX5', 'porsche911gt3rs']) {
    const car = createProductionCar({ vehicle: id, mobile: true });
    car.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(-.32, 2, -.08), new THREE.Vector3(0, -1, 0));
    const firstHit = ray.intersectObject(car.group, true)[0];
    assert.ok(firstHit, `${id}: seating position has a physical surface below it`);
    if (id === 'porsche911gt3rs') {
      assert.equal(car.group.userData.model.openTop, false);
      assert.ok(firstHit.point.y > 1.2, 'the coupe roof covers the seating position');
    } else {
      assert.equal(car.group.userData.model.openTop, true);
      assert.ok(firstHit.point.y > .6 && firstHit.point.y < .7, `${id}: the seat cushion is visible from above`);
      assert.equal(firstHit.object.material.name, 'open-cabin-leather');
    }
    car.dispose();
  }
});

test('selectable catalog consists of current real models plus the explicitly labelled classic', () => {
  assert.equal(Object.keys(VEHICLES).length, 21);
  assert.equal(VEHICLES.conceptGT, undefined);
  assert.equal(VEHICLES.apexR, undefined);
  for (const vehicle of Object.values(VEHICLES)) {
    assert.ok(vehicle.source.startsWith('https://'));
    assert.ok([4, 6, 8, 12].includes(vehicle.cylinders));
    assert.ok(Object.isFrozen(vehicle.gears));
    if (vehicle.dimensions) assert.ok(Math.abs(vehicle.frontAxle + vehicle.rearAxle - vehicle.dimensions.wheelbase) < .001);
    else assert.ok(vehicle.name.includes('經典'));
  }
});

test('Porsche rear shoulders recede and the coupe roof has a shallow crown', () => {
  const car = createProductionCar({ vehicle: 'porsche911gt3rs', mobile: true });
  car.group.updateMatrixWorld(true);
  const body = car.group.getObjectByName('suspension-response-body-paint');
  const bumperDepth = x => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, .64, -4), new THREE.Vector3(0, 0, 1));
    return ray.intersectObject(body)[0].point.z;
  };
  assert.ok(bumperDepth(.78) - bumperDepth(0) > .065, 'bumper corners wrap inward instead of ending in a flat wall');
  const roofHeight = x => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 2, -.10), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(car.group, true)[0].point.y;
  };
  assert.ok(roofHeight(0) - roofHeight(.30) < .025, 'roof is gently crowned rather than a hemispherical canopy');
  const windows = car.group.getObjectByName('suspension-response-tinted-glass');
  assert.equal(windows?.material.depthWrite ?? car.group.getObjectByName('model-specific-greenhouse').material.depthWrite, true, 'glazing has consistent occlusion at the rear view');
  car.dispose();
});

test('rear glazing closes at the body rather than rising into vertical fins', () => {
  for(const id of Object.keys(PRODUCTION_CAR_DIMENSIONS)){
    const car=createProductionCar({vehicle:id,mobile:true,inspectParts:true});
    if(car.group.userData.model.openTop){car.dispose();continue;}
    const greenhouse=car.group.getObjectByName(id==='bmwX3'?'g45-rear-window':'model-specific-greenhouse'),points=greenhouse.geometry.attributes.position;
    let rear=Infinity;for(let i=0;i<points.count;i++)rear=Math.min(rear,points.getZ(i));
    const heights=[];for(let i=0;i<points.count;i++)if(Math.abs(points.getZ(i)-rear)<.0001)heights.push(points.getY(i)+.46);
    assert.ok(Math.max(...heights)-Math.min(...heights)<.09,`${id}: the rearmost glazing row closes against the rear deck`);
    assert.ok(Math.max(...heights)<car.dimensions.height-.20,`${id}: rear glass starts below the roof rather than at the next cabin peak`);
    car.dispose();
  }
});

test('body end surfaces preserve the selected rear deck and bonnet heights', () => {
  for(const [id,rearHeight,frontHeight]of [['porsche911gt3rs',.80,.61],['astonVantage',.82,.59],['bmwM4',.92,.845]]){
    const car=createProductionCar({vehicle:id,mobile:true,inspectParts:true}),body=car.group.getObjectByName(`${id}-continuous-body-shell`);
    car.group.updateMatrixWorld(true);
    for(const [direction,expected]of [[-1,rearHeight],[1,frontHeight]]){
      const ray=new THREE.Raycaster(new THREE.Vector3(0,2,direction*(car.dimensions.length/2-.001)),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(body)[0];
      assert.ok(hit,`${id}: body has a closed end surface`);
      assert.ok(Math.abs(hit.point.y-expected)<.010,`${id}: ${direction<0?'rear deck':'bonnet'} keeps its reference height (${hit.point.y})`);
    }
    car.dispose();
  }
});

test('all wheel envelopes use the selected published tyre and rim configuration', () => {
  // Nominal width in mm, sidewall percent, rim in inches. These are the
  // manufacturer configurations documented in PRODUCTION-CARS.md.
  const tyres={
    porsche911gt3rs:[[275,35,20],[335,30,21]],lamborghiniRevuelto:[[265,35,20],[345,30,21]],
    ferrari296Speciale:[[245,35,20],[305,35,20]],mclaren750s:[[245,35,19],[305,30,20]],
    astonVantage:[[275,35,21],[325,30,21]],corvetteZ06:[[275,30,20],[345,25,21]],
    bmwM4:[[275,35,19],[285,30,20]],nissanZ:[[255,40,19],[275,35,19]],
    bmwX3:[[255,40,21],[285,35,21]],amgGT63:[[295,30,20],[305,30,20]],
    mustangDarkHorse:[[305,30,19],[315,30,19]],lotusEmira:[[245,35,20],[295,30,20]],
    ferrari12cilindri:[[275,35,21],[315,35,21]],lamborghiniTemerario:[[255,35,20],[325,30,21]],
    porsche911turboS:[[255,35,20],[325,30,21]],amgSL63:[[265,40,20],[295,35,20]],
    hondaPrelude:[[235,40,19],[235,40,19]],toyotaGR86:[[215,40,18],[215,40,18]],
    mazdaMX5:[[205,45,17],[205,45,17]],bmwM2:[[275,35,19],[285,30,20]],
  };
  assert.equal(Object.keys(tyres).length,Object.keys(PRODUCTION_CAR_DIMENSIONS).length);
  for(const [id,axles]of Object.entries(tyres)){
    const car=createProductionCar({vehicle:id,mobile:true,inspectParts:true});car.group.updateMatrixWorld(true);
    const wheels=car.group.children.filter(node=>node.name.endsWith('-steer'));
    for(let i=0;i<4;i++){
      const [width,aspect,inches]=axles[i<2?0:1],rim=inches*.0254/2,radius=rim+width/1000*aspect/100;
      assert.ok(Math.abs(wheels[i].position.y-radius)<1e-6,`${id}: actual tyre envelope meets road at the selected axle radius`);
      const tyre=wheels[i].getObjectByName(id==='bmwX3'?'g45-255-285-low-profile-tyre':'tyre'),barrel=wheels[i].getObjectByName('wheel-spin').children.find(node=>node.material?.name==='forged-alloy');
      assert.ok(Math.abs(new THREE.Box3().setFromObject(tyre).getSize(new THREE.Vector3()).y/2-radius)<1e-5,`${id}: generated tyre preserves its published diameter`);
      const rimEnvelope=id==='bmwX3'?wheels[i].getObjectByName('g45-forged-rim-lip'):barrel;
      assert.ok(Math.abs(new THREE.Box3().setFromObject(rimEnvelope).getSize(new THREE.Vector3()).y/2-rim)<1e-5,`${id}: outer rim diameter stays distinct from the tyre sidewall`);
    }
    const wells=[];car.group.traverse(node=>{if(node.name.endsWith('wheel-well-back-wall')||id==='bmwX3'&&node.name.includes('closed-wheel-well-back'))wells.push(node);});
    assert.equal(wells.length,4,`${id}: all four arches have opaque inner walls`);
    car.dispose();
  }
});

test('surface-mounted front optics face upwards instead of hiding their single-sided emitters', () => {
  for(const id of ['porsche911gt3rs','porsche911turboS','ferrari296Speciale','mclaren750s','astonVantage','corvetteZ06','amgGT63','lotusEmira','lamborghiniTemerario','amgSL63','toyotaGR86','mazdaMX5','nissanZ']){
    const car=createProductionCar({vehicle:id,mobile:true,inspectParts:true}),lamps=[];
    car.group.traverse(node=>{if(node.isMesh&&node.material.name==='led-headlamp'&&/projector|porsche-optic|optical-cell/.test(node.name))lamps.push(node);});
    assert.ok(lamps.length>=2,`${id}: each front corner includes a real visible optical element`);
    for(const lamp of lamps){
      const normals=lamp.geometry.attributes.normal;let normalY=0;for(let i=0;i<normals.count;i++)normalY+=id==='ferrari296Speciale'?normals.getZ(i):normals.getY(i);
      assert.ok(normalY/normals.count>.25,`${id}: emitter normals expose their upper or forward optical face`);
    }
    car.dispose();
  }
});

test('rear plate artwork sits outside the actual bumper insert and remains visible', () => {
  for(const [id,profile]of Object.entries(REAR_DETAIL_PROFILES)){
    const car=createProductionCar({vehicle:id,mobile:true,inspectParts:true});car.group.updateMatrixWorld(true);
    const plate=car.group.getObjectByName('rear-number-plate-artwork');assert.ok(plate,`${id}: closed-course plate exists`);
    const plateHeight=id==='bmwX3'?new THREE.Box3().setFromObject(plate).getCenter(new THREE.Vector3()).y:profile.plate[0];
    const ray=new THREE.Raycaster(new THREE.Vector3(0,plateHeight,-car.dimensions.length/2-1),new THREE.Vector3(0,0,1));
    const hits=ray.intersectObject(car.group,true).filter(hit=>hit.object.isMesh&&!hit.object.name.includes('contact-shadow'));
    assert.equal(hits[0]?.object,plate,`${id}: dark diffuser or fascia must not occlude the plate`);
    assert.ok(plate.geometry.attributes.uv,'original plate atlas retains texture coordinates');
    car.dispose();
  }
});

test('round Porsche optics keep a visible face from either front three-quarter angle', () => {
  for(const id of ['porsche911gt3rs','porsche911turboS']){
    const car=createProductionCar({vehicle:id,mobile:true,inspectParts:true}),lamps=[];
    car.group.traverse(node=>{if(['911-headlamp-housing','turbo-s-round-optic'].includes(node.name))lamps.push(node);});
    assert.equal(lamps.length,2);
    for(const lamp of lamps)for(const side of [-1,1]){
      const points=lamp.geometry.attributes.position,index=lamp.geometry.index,camera=new THREE.Vector3(side*6,2.6-.46,7.5);
      let area=0,projected=0;
      for(let i=0;i<index.count;i+=3){
        const a=new THREE.Vector3().fromBufferAttribute(points,index.getX(i)),b=new THREE.Vector3().fromBufferAttribute(points,index.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(points,index.getX(i+2));
        const normal=b.clone().sub(a).cross(c.clone().sub(a)),weight=normal.length();
        if(weight<1e-9)continue;
        const direction=camera.clone().sub(a.clone().add(b).add(c).multiplyScalar(1/3)).normalize();
        projected+=Math.abs(normal.dot(direction));area+=weight;
      }
      assert.ok(projected/area>.28,`${id}: each round lamp presents a face rather than an edge-on slit (${projected/area})`);
    }
    car.dispose();
  }
});

test('forged wheel surfaces have physical depth with separate machined highlights', () => {
  for (const id of ['porsche911gt3rs', 'bmwX3', 'lamborghiniRevuelto', 'mazdaMX5']) {
    const car = createProductionCar({ vehicle: id, mobile: true });
    car.group.updateMatrixWorld(true);
    const wheels = car.group.children.filter(node => node.name.endsWith('-steer'));
    for (const wheel of wheels) {
      const spin = wheel.getObjectByName('wheel-spin');
      const forged = spin.children.find(node => node.material?.name === 'forged-alloy');
      const edge = spin.children.find(node => node.material?.name === (id==='bmwX3'?'1037m-machined-face':'machined-rim-edge'));
      assert.ok(forged && edge, `${id}: casting and polished rim edge are separate materials`);
      forged.geometry.computeBoundingBox();
      assert.ok(forged.geometry.boundingBox.max.x - forged.geometry.boundingBox.min.x > .15, `${id}: wheel barrel has real depth`);
      assert.ok(forged.material.color.getHSL({}).l < edge.material.color.getHSL({}).l, `${id}: metal edge reflects brighter than the forged centre`);
      const side=Math.sign(wheel.position.x);
      // Split spokes leave deliberate openings. Sample the casting around a
      // ring instead of aiming into one opening of a particular wheel design.
      let visible=0;
      for(let i=0;i<36;i++){
        const angle=i/36*Math.PI*2;
        const ray=new THREE.Raycaster(new THREE.Vector3(side*2,wheel.position.y+Math.sin(angle)*.15,wheel.position.z+Math.cos(angle)*.15),new THREE.Vector3(-side,0,0));
        if(ray.intersectObject(forged).length)visible++;
      }
      assert.ok(visible>=3, `${id}: forged faces are visible from outside on both sides (${visible}/36)`);
    }
    car.dispose();
  }
});

test('paint, glazing and wheel metal keep distinct reflection responses without a transmission pass', () => {
  const car=createProductionCar({vehicle:'porsche911gt3rs',mobile:true}),materials=new Map();
  car.group.traverse(node=>{if(node.isMesh)materials.set(node.material.name,node.material);});
  const paint=materials.get('body-paint'),glass=materials.get('tinted-glass');
  const alloy=materials.get('forged-alloy'),edge=materials.get('machined-rim-edge'),rubber=materials.get('tyre-rubber');
  for(const color of ['#d9d6c6','#465051','#c93324']){
    car.setPaint(color);
    assert.equal(paint.color.getHexString(),color.slice(1));
    assert.equal(paint.clearcoat,1,'smooth clearcoat gives body highlights independently of pigment');
    assert.ok(paint.metalness<.2,'paint does not shade like solid wheel metal');
    assert.ok(paint.clearcoatRoughness<paint.roughness,'clearcoat remains sharper than the colour layer');
  }
  assert.equal(glass.metalness,0,'glazing uses dielectric Fresnel reflections');
  assert.equal(glass.transmission,0,'opaque tinted glazing avoids a second scene render');
  assert.equal(glass.depthWrite,true,'the cabin keeps stable front-to-back occlusion');
  assert.ok(glass.roughness<alloy.roughness,'glass reflections are sharper than satin forgings');
  assert.ok(edge.roughness<alloy.roughness,'machined wheel lip has a distinct highlight');
  assert.equal(alloy.metalness,1);assert.equal(rubber.metalness,0);
  assert.ok(rubber.roughness>alloy.roughness,'rubber does not reflect like wheel metal');
  car.dispose();
});

test('all generated contact shadows retain four tyre patches independently of moving sun shadows', () => {
  for(const id of Object.keys(PRODUCTION_CAR_DIMENSIONS)){
    const car=createProductionCar({vehicle:id,mobile:true}),shadow=car.group.getObjectByName('contact-shadow');
    const image=shadow.material.map.image,{width,height}=shadow.geometry.parameters;
    const alpha=(x,z)=>{
      const column=Math.round((x/width+.5)*63),row=Math.round((.5-z/height)*127);
      return image.data[(row*64+column)*4+3];
    };
    assert.equal(image.data.byteLength,32768,'contact shadow remains one small texture');
    assert.equal(shadow.castShadow,false);assert.equal(shadow.receiveShadow,false);
    assert.equal(shadow.material.depthWrite,false,'soft shadow cannot hide the road');
    assert.ok(alpha(0,0)>80,`${id}: soft underbody occlusion remains visible`);
    for(const wheel of car.group.children.filter(node=>node.name.endsWith('-steer'))){
      const {x,z}=wheel.position;
      assert.ok(alpha(x,z)>165,`${id}: each tyre has a dark contact patch`);
      assert.ok(alpha(x,z)>alpha(x,z+car.group.userData.model.wheelRadius*1.3)+70,`${id}: contact patch stays localized`);
    }
    for(let x=0;x<64;x++)assert.equal(image.data[(127*64+x)*4+3],0,'texture perimeter fades completely');
    shadow.updateMatrix();const transform=shadow.matrix.clone();car.update({longitudinalAccel:8,lateralAccel:8,speed:25},.1);shadow.updateMatrix();
    assert.deepEqual(shadow.matrix.elements,transform.elements,'body roll does not lift the contact shadow');
    car.dispose();
  }
});

test('wheel rotation follows reverse travel while the speed readout remains a magnitude', () => {
  const car=createProductionCar({vehicle:'porsche911gt3rs',mobile:true});
  const wheel=car.group.getObjectByName('wheel-spin');
  car.update({speed:4,reverse:false},.03);assert.ok(wheel.rotation.x<0);
  car.update({speed:4,reverse:true},.03);assert.ok(Math.abs(wheel.rotation.x)<1e-9);
  car.update({speed:4,reverse:true},.03);assert.ok(wheel.rotation.x>0);
  car.dispose();
});

test('closed wheel-well inner walls stay beneath the bonnet on every low coupe', () => {
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  for(const mobile of [false,true])for(const id of Object.keys(PRODUCTION_CAR_DIMENSIONS).filter(id=>id!=='bmwX3')){
    const car=createProductionCar({vehicle:id,mobile,inspectParts:true});car.group.updateMatrixWorld(true);
    let shell;const walls=[];car.group.traverse(node=>{if(node.name.endsWith('continuous-body-shell'))shell=node;if(node.name==='closed-wheel-well-back-wall')walls.push(node);});
    let covered=0;
    for(const wall of walls){
      const position=wall.geometry.attributes.position;
      for(let i=0;i<position.count;i+=2){
        const point=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(wall.matrixWorld);
        ray.set(new THREE.Vector3(point.x,3,point.z),down);const hit=ray.intersectObject(shell,false)[0];
        if(hit){covered++;assert.ok(point.y<hit.point.y-.003,`${id}: wheel-well lining protrudes through bonnet`);}
      }
    }
    assert.ok(covered>40,`${id}: closed lining is covered by the actual shell`);car.dispose();
  }
});


test('all coupe bumper shoulders advance without folding back or overlapping the end fascia', () => {
  for(const mobile of [false,true])for(const id of Object.keys(PRODUCTION_CAR_DIMENSIONS).filter(id=>id!=='bmwX3')){
    const car=createProductionCar({vehicle:id,mobile,inspectParts:true}),body=car.group.getObjectByName(`${id}-continuous-body-shell`);
    for(const row of body.userData.longitudinalSurfaceRows)for(let i=1;i<row.length;i++)assert.ok(row[i]>row[i-1]+.00001,`${id}: longitudinal panel row cannot turn backwards at ${i}`);
    const position=body.geometry.attributes.position,normal=body.geometry.attributes.normal,shared=new Map();
    for(let i=0;i<position.count;i++){
      const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*100000)).join(':');
      const n=new THREE.Vector3().fromBufferAttribute(normal,i);if(shared.has(key))assert.ok(n.distanceTo(shared.get(key))<.000001,`${id}: a shared panel boundary has one shadow normal`);else shared.set(key,n);
    }
    car.dispose();
  }
});

test('911, 296 and M4 have raised fenders, rolled outer shoulders and an inset waist above the rocker', () => {
  for(const mobile of [false,true])for(const [id,relief]of [['porsche911gt3rs',.14],['ferrari296Speciale',.20],['bmwM4',.05]]){
    const car=createProductionCar({vehicle:id,mobile,inspectParts:true}),body=car.group.getObjectByName(`${id}-continuous-body-shell`);car.group.updateMatrixWorld(true);
    const z=car.group.children.find(n=>n.name.endsWith('-steer')).position.z;
    const height=x=>new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0)).intersectObject(body)[0]?.point.y;
    const side=y=>new THREE.Raycaster(new THREE.Vector3(1.3,y,0),new THREE.Vector3(-1,0,0)).intersectObject(body)[0]?.point.x;
    assert.ok(height(.74)>height(0)+relief,`${id}: the wheel shoulder rises above the central bonnet`);
    assert.ok(height(.74)>height(.91)+.007,`${id}: the shoulder rolls into the outer wheel arch`);
    assert.ok(side(.30)>side(.50)+.02,`${id}: the rocker returns outwards below the concave door`);
    car.dispose();
  }
});

test('M4 kidneys and 296 front optics occupy their actual upper nose with physical depth', () => {
  for(const mobile of [false,true]){
    const m4=createProductionCar({vehicle:'bmwM4',mobile,inspectParts:true});m4.group.updateMatrixWorld(true);const kidneys=m4.group.children[0].children.filter(n=>n.name==='m4-tall-kidney');
    assert.equal(kidneys.length,2);for(const kidney of kidneys){const b=new THREE.Box3().setFromObject(kidney);assert.ok(b.max.y>.82&&b.min.y<.32&&b.max.y-b.min.y>.50,'M4 tall kidneys reach the raised bonnet');assert.ok(b.max.z-b.min.z>.015,'kidney follows the molded recessed fascia');assert.equal(kidney.castShadow,false,'thin recessed trim must not cast a second coarse shadow');}const shell=m4.group.getObjectByName('bmwM4-continuous-body-shell'),hit=x=>new THREE.Raycaster(new THREE.Vector3(x,.595,4),new THREE.Vector3(0,0,-1)).intersectObject(shell)[0]?.point.z;assert.ok(hit(0)-hit(.225)>.025,'the tall kidney is recessed into the actual painted nose');m4.dispose();
    const ferrari=createProductionCar({vehicle:'ferrari296Speciale',mobile,inspectParts:true});ferrari.group.updateMatrixWorld(true);
    const lights=[];ferrari.group.traverse(n=>{if(n.name==='296-front-headlamp-housing')lights.push(n);});assert.equal(lights.length,2);
    for(const light of lights){const b=new THREE.Box3().setFromObject(light),size=b.getSize(new THREE.Vector3());assert.ok(size.x>.30&&size.x/size.y>4,'296 lamps are long forward-facing strips');assert.ok(size.z>.02,'optical housing follows the fender instead of a flat sticker');}
    ferrari.dispose();
  }
});
