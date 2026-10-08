import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import * as THREE from './vendor/three.module.js';
import { VEHICLES, PRODUCTION_CAR_DIMENSIONS } from './vehicles.mjs';

// The browser import map resolves this same vendored Three module in production.
register('data:text/javascript,' + encodeURIComponent(`
  let three;
  export function initialize(data) { three = data.three; }
  export function resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three' ? three : specifier, context);
  }
`), { parentURL: import.meta.url, data: { three: new URL('./vendor/three.module.js', import.meta.url).href } });
const { createProductionCar } = await import('./cars-production.js');

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
      assert.ok(triangleCount > 8000 && triangleCount < (mobile ? 35000 : 60000), `bounded detail: ${triangleCount}`);
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

test('forged wheel surfaces have physical depth with separate machined highlights', () => {
  for (const id of ['porsche911gt3rs', 'bmwX3', 'lamborghiniRevuelto', 'mazdaMX5']) {
    const car = createProductionCar({ vehicle: id, mobile: true });
    car.group.updateMatrixWorld(true);
    const wheels = car.group.children.filter(node => node.name.endsWith('-steer'));
    for (const wheel of wheels) {
      const spin = wheel.getObjectByName('wheel-spin');
      const forged = spin.children.find(node => node.material?.name === 'forged-alloy');
      const edge = spin.children.find(node => node.material?.name === 'machined-rim-edge');
      assert.ok(forged && edge, `${id}: casting and polished rim edge are separate materials`);
      forged.geometry.computeBoundingBox();
      assert.ok(forged.geometry.boundingBox.max.x - forged.geometry.boundingBox.min.x > .15, `${id}: wheel barrel has real depth`);
      assert.ok(forged.material.color.getHSL({}).l < edge.material.color.getHSL({}).l, `${id}: metal edge reflects brighter than the forged centre`);
      const side=Math.sign(wheel.position.x);
      const ray=new THREE.Raycaster(new THREE.Vector3(side*2,wheel.position.y,wheel.position.z+.15),new THREE.Vector3(-side,0,0));
      assert.ok(ray.intersectObject(forged).length, `${id}: forged faces are visible from outside on both sides`);
    }
    car.dispose();
  }
});
