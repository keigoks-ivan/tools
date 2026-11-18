import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFootContactShadows } from '../foot-contact.mjs';

function fixture() {
  const root = new THREE.Group();
  const feet = [-1, 1].map(side => {
    const foot = new THREE.Group(); foot.position.set(side * 3, 1, .5);
    foot.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 3.6)));
    root.add(foot); return foot;
  });
  const contacts = createFootContactShadows(root, feet);
  const worldMatrix = i => { root.updateMatrixWorld(true); const m = new THREE.Matrix4(); contacts.mesh.getMatrixAt(i, m); return m.premultiply(root.matrixWorld); };
  return { root, feet, contacts, worldMatrix, opacity: () => [...contacts.mesh.geometry.attributes.contactOpacity.array] };
}

test('contact shadows follow the actual soles after root translation, turn and scale', () => {
  const { root, feet, contacts, worldMatrix, opacity } = fixture();
  root.position.set(17, 4, -28); root.rotation.y = .7; root.scale.setScalar(1.25);
  contacts.update({ grounded: true, groundAt: () => 4 });
  for (let i = 0; i < feet.length; i++) {
    const sole = feet[i].localToWorld(new THREE.Vector3(0, -1, 0));
    const shadow = new THREE.Vector3().setFromMatrixPosition(worldMatrix(i));
    assert(Math.hypot(sole.x - shadow.x, sole.z - shadow.z) < 1e-5);
    assert(Math.abs(shadow.y - 4.012) < 1e-5);
    assert(opacity()[i] > .6);
  }
  assert.equal(contacts.mesh.count, 2);
});

test('each foot fades independently when lifted and the contact pass disappears in flight', () => {
  const { root, feet, contacts, opacity } = fixture();
  contacts.update({ grounded: true, groundAt: () => 0 }); const grounded = opacity();
  feet[0].position.y += .65; contacts.update({ grounded: true, groundAt: () => 0 });
  assert(opacity()[0] < grounded[0] * .25); assert.equal(opacity()[1], grounded[1]);
  root.position.y = 4; contacts.update({ grounded: false, groundAt: () => 0 });
  assert.equal(contacts.mesh.visible, false); assert.deepEqual(opacity(), [0, 0]);
  root.position.y = 0; feet[0].position.y = 1; contacts.update({ grounded: true, groundAt: () => 0 });
  assert.equal(contacts.mesh.visible, true); assert.deepEqual(opacity(), grounded);
});

test('separate support heights and gentle slopes remain attached without stretched cliff shadows', () => {
  const { feet, contacts, worldMatrix } = fixture();
  const floor = x => x < 0 ? 2 + x * .08 : 0;
  feet[0].position.y += floor(-3);
  contacts.update({ grounded: true, groundAt: floor });
  for (let i = 0; i < 2; i++) {
    const m = worldMatrix(i), p = new THREE.Vector3().setFromMatrixPosition(m);
    assert(Math.abs(p.y - floor(p.x) - .012) < 1e-5);
    const n = new THREE.Vector3(0, 1, 0).transformDirection(m);
    assert(Math.abs(n.x / n.y - (i ? 0 : -.08)) < 1e-5);
    assert(m.elements.every(Number.isFinite));
  }
});
