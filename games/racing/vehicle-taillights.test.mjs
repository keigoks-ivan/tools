import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { addVehicleTailLights, TAIL_LAMP_PROFILES } from './vehicle-taillights.js';

for (const mobile of [true,false]) for (const vehicle of Object.keys(TAIL_LAMP_PROFILES)) {
  test(`${vehicle} / ${mobile ? 'mobile' : 'desktop'}: physical lamps follow curved fascia with a bounded fit cost`, () => {
    const chassis = new THREE.Group(), materials = new Set(), geometries = new Set();
    const black = new THREE.MeshStandardMaterial(), rearLight = new THREE.MeshPhysicalMaterial();
    materials.add(black); materials.add(rearLight);
    let calls = 0;
    const fascia = (x,y) => -2.34 + .22*x*x + .04*(y-.8)**2;
    const result = addVehicleTailLights({ vehicle,mobile,halfWidth:.96,baseY:.46,chassis,black,rearLight,
      fasciaPoint(x,y,offset) { calls++; return [x,y-.46,fascia(x,y)-offset]; },
      material(name,Type,options) { const mat = new Type(options); mat.name = name; materials.add(mat); return mat; },
      mesh(geometry,mat,parent,name) { const node = new THREE.Mesh(geometry,mat); node.name = name; parent.add(node); geometries.add(geometry); return node; },
    });
    assert.ok(result.lights > 0);
    assert.equal(calls,result.samples);
    assert.ok(calls <= 84,'many lens vertices share a small rear-surface fit grid');
    let triangles = 0;
    for (const node of chassis.children) {
      const p = node.geometry.attributes.position;
      assert.ok(p.array.every(Number.isFinite));
      assert.ok(node.geometry.attributes.normal.array.every(Number.isFinite));
      assert.ok(node.geometry.index.array.every(i => i >= 0 && i < p.count));
      triangles += node.geometry.index.count/3;
      for (let i=0;i<p.count;i++) {
        const depth = fascia(p.getX(i),p.getY(i)+.46)-p.getZ(i);
        assert.ok(depth >= -.006 && depth <= .028,`${node.name}: lamp depth ${depth} must fit the body`);
      }
      for (let i=0;i<node.geometry.index.count;i+=3) {
        const corners=[0,1,2].map(offset => node.geometry.index.getX(i+offset));
        const x=corners.reduce((sum,index) => sum+p.getX(index),0)/3;
        const y=corners.reduce((sum,index) => sum+p.getY(index),0)/3+.46;
        const z=corners.reduce((sum,index) => sum+p.getZ(index),0)/3;
        assert.ok(fascia(x,y)-z >= -.006,`${node.name}: a broad lamp triangle must not cut through the curved bumper`);
      }
    }
    assert.ok(triangles < (mobile ? 5000 : 8000),'original lens artwork stays within a bounded geometry budget');
    for (const side of TAIL_LAMP_PROFILES[vehicle].fullWidth ? [1] : [-1,1]) {
      const housings = chassis.children.filter(n => n.userData.tailLamp.component === 'recessed-tail-lamp-housing');
      assert.ok(housings.length > 0);
      assert.ok(chassis.children.some(n => n.userData.tailLamp.component === 'sculpted-smoked-tail-lens'));
    }
    assert.ok(chassis.children.some(n => n.material === rearLight),'the physical internal guides use the braking-controlled material');
    const disposal = new Map([...materials,...geometries].map(resource => [resource,0]));
    for (const resource of disposal.keys()) resource.addEventListener('dispose',() => disposal.set(resource,disposal.get(resource)+1));
    for (const resource of disposal.keys()) resource.dispose();
    assert.ok([...disposal.values()].every(count => count === 1),'the caller can own every generated resource');
  });
}

test('X3 has separate opposed guides in two smoked housings; Nissan centre band remains unlit', () => {
  const x3 = TAIL_LAMP_PROFILES.bmwX3;
  assert.equal(x3.fullWidth,undefined);
  assert.equal(x3.units[0].leds.length,3);
  const z = TAIL_LAMP_PROFILES.nissanZ;
  assert.equal(z.fullWidth,true);
  assert.equal(z.units[0].leds.length,4);
  assert.ok(z.units[0].leds.every(led => Math.abs(led.capsule[0])-led.capsule[2]/2 > .4),'capsules stay outboard of the non-emitting centre fascia');
});
