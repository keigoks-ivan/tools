import * as THREE from 'three';
import { sampleStroke, smoothstep, solveTwoBone } from './athlete-motion.mjs';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DOWN = new THREE.Vector3(0, -1, 0);
const vec = a => new THREE.Vector3(...a);
const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
const sphere = new THREE.SphereGeometry(1, 24, 18);
const quat = new THREE.Quaternion();

function addMesh(parent, geometry, mat, position = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.fromArray(position); mesh.scale.fromArray(scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}
function oval(parent, mat, position, scale) { return addMesh(parent, sphere, mat, position, scale); }

// Elliptical sections give the shoulders, waist, calves and shoes distinct shapes.
function sections(inputRings, sides = 24) {
  const rings = inputRings[0][0] > inputRings[inputRings.length - 1][0] ? [...inputRings].reverse() : inputRings;
  const positions = [], indices = [];
  for (const [y, width, depth, forward = 0] of rings) {
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2;
      positions.push(Math.cos(angle) * width, y, Math.sin(angle) * depth + forward);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) {
      const a = j * sides + i, b = j * sides + (i + 1) % sides, c = a + sides, d = b + sides;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (const end of [0, rings.length - 1]) {
    const index = positions.length / 3;
    positions.push(0, rings[end][0], rings[end][3] || 0);
    for (let i = 0; i < sides; i++) {
      const a = end * sides + i, b = end * sides + (i + 1) % sides;
      if (end === 0) indices.push(index, b, a); else indices.push(index, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function jointChain(parent, upperLength, lowerLength, upperMat, lowerMat, radii, name) {
  const anchor = new THREE.Group(); anchor.name = `${name}-anchor`; parent.add(anchor);
  const upper = new THREE.Group(); upper.name = `${name}-upper`; anchor.add(upper);
  const lower = new THREE.Group(); lower.name = `${name}-lower`; lower.position.y = -upperLength; upper.add(lower);
  const end = new THREE.Group(); end.name = `${name}-end`; end.position.y = -lowerLength; lower.add(end);
  addMesh(upper, sections([[0, radii[0] * 0.90, radii[0] * 0.85], [-upperLength * 0.22, radii[0], radii[0] * 0.95], [-upperLength * 0.68, radii[1], radii[1] * 0.95], [-upperLength, radii[1] * 0.85, radii[1] * 0.80]]), upperMat);
  addMesh(lower, sections([[0, radii[2] * 0.82, radii[2] * 0.80], [-lowerLength * 0.28, radii[2], radii[2] * 1.05], [-lowerLength * 0.74, radii[3] * 1.15, radii[3]], [-lowerLength, radii[3], radii[3] * 0.82]]), lowerMat);
  oval(lower, lowerMat, [0, 0, 0], [radii[1] * 0.95, radii[1] * 0.95, radii[1] * 0.94]);
  return { anchor, upper, lower, end, upperLength, lowerLength, reachError: 0 };
}

function placeChain(chain, targetInAnchor, pole) {
  const result = solveTwoBone([0, 0, 0], targetInAnchor.toArray(), pole, chain.upperLength, chain.lowerLength);
  const elbow = vec(result.joint), end = vec(result.end);
  chain.upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().normalize());
  const lowerDirection = end.sub(elbow).normalize().applyQuaternion(chain.upper.quaternion.clone().invert());
  chain.lower.quaternion.setFromUnitVectors(DOWN, lowerDirection);
  chain.reachError = result.reachError;
}

function rootPointToAnchor(root, anchor, point) {
  return anchor.worldToLocal(root.localToWorld(point.clone()));
}
function orientEnd(root, end, rotation) {
  root.getWorldQuaternion(quat);
  const desired = quat.clone().multiply(new THREE.Quaternion().setFromEuler(rotation));
  end.parent.getWorldQuaternion(quat);
  end.quaternion.copy(quat.invert().multiply(desired));
}

export function createAthlete(scene, side, color, handed = 'right') {
  const mirror = handed === 'left' ? -1 : 1;
  const root = new THREE.Group(); root.name = side === 1 ? 'player-athlete' : 'opponent-athlete';
  root.position.z = side * 1.94; root.rotation.y = side === 1 ? Math.PI : 0; scene.add(root);
  const skin = material(side === 1 ? 0xc6926f : 0xd3a482);
  const shirt = material(color), shorts = material(0x263c3b), socks = material(0xe9ece3);
  const soleMat = material(0x354b47), hairMat = material(side === 1 ? 0x2d2b27 : 0x36322a);
  const trim = material(side === 1 ? 0x36584d : 0xf3dfcc);
  const pelvis = new THREE.Group(); pelvis.name = 'pelvis'; root.add(pelvis);
  addMesh(pelvis, sections([[-0.12, 0.165, 0.10], [-0.045, 0.176, 0.115], [0.028, 0.154, 0.106]]), shorts);
  const spine = new THREE.Group(); spine.name = 'spine'; spine.position.y = 0.025; pelvis.add(spine);
  addMesh(spine, sections([[-0.035, 0.172, 0.119], [0.03, 0.153, 0.107], [0.08, 0.144, 0.105], [0.23, 0.176, 0.12], [0.36, 0.215, 0.118], [0.415, 0.219, 0.104], [0.46, 0.152, 0.087], [0.478, 0.067, 0.054]]), shirt);
  // The trim follows the cloth surface; the collar leaves an actual neck opening.
  const stripe = addMesh(spine, new THREE.BoxGeometry(0.32, 0.018, 0.004), trim, [0, 0.30, 0.119]);
  stripe.rotation.z = 0.06;
  const collar = addMesh(spine, new THREE.TorusGeometry(0.060, 0.006, 8, 32), trim, [0, 0.478, 0]); collar.rotation.x = Math.PI / 2; collar.scale.z = 0.8;
  oval(spine, skin, [0, 0.49, 0.005], [0.051, 0.073, 0.053]);
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.60, 0.013); spine.add(head);
  addMesh(head, sections([[-0.116, 0.030, 0.038, 0.015], [-0.09, 0.054, 0.056, 0.01], [-0.055, 0.073, 0.070, 0.005], [0.00, 0.085, 0.080], [0.055, 0.086, 0.079, -0.002], [0.10, 0.065, 0.061, -0.003], [0.122, 0.025, 0.026, -0.003]]), skin);
  const hair = addMesh(head, new THREE.SphereGeometry(1, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat, [0, 0.044, -0.006], [0.091, 0.088, 0.084]);
  hair.rotation.x = -0.05;
  oval(head, hairMat, [0, 0.014, -0.048], [0.085, 0.093, 0.043]);
  for (const sign of [-1, 1]) {
    oval(head, skin, [sign * 0.088, -0.01, -0.002], [0.014, 0.025, 0.015]);
    oval(head, hairMat, [sign * 0.032, 0.018, 0.078], [0.014, 0.004, 0.003]);
    oval(head, material(0x44332b), [sign * 0.033, 0.005, 0.080], [0.0045, 0.0035, 0.003]);
  }
  oval(head, skin, [0, -0.014, 0.083], [0.014, 0.028, 0.021]);
  oval(head, material(0x9c6653), [0, -0.052, 0.077], [0.020, 0.0025, 0.002]);

  const legs = [-1, 1].map(sign => {
    const leg = jointChain(pelvis, 0.405, 0.415, skin, skin, [0.087, 0.057, 0.065, 0.032], `leg-${sign}`);
    leg.anchor.position.set(sign * 0.097, -0.025, 0);
    addMesh(leg.upper, sections([[0.018, 0.107, 0.105], [-0.08, 0.113, 0.111], [-0.165, 0.102, 0.095]]), shorts);
    addMesh(leg.lower, sections([[-0.268, 0.041, 0.040], [-0.39, 0.036, 0.034], [-0.42, 0.035, 0.033]]), socks);
    const shoe = new THREE.Group(); leg.end.add(shoe);
    oval(shoe, socks, [0, -0.033, 0.055], [0.058, 0.044, 0.126]);
    oval(shoe, soleMat, [0, -0.060, 0.058], [0.060, 0.014, 0.129]);
    oval(shoe, trim, [sign * 0.052, -0.026, 0.061], [0.004, 0.016, 0.055]);
    for (let i = 0; i < 3; i++) addMesh(shoe, new THREE.BoxGeometry(0.054, 0.004, 0.006), soleMat, [0, 0.005, 0.045 + i * 0.02]);
    return { ...leg, sign, shoe, worldX: null, step: null };
  });
  const arms = [-1, 1].map(sign => {
    const arm = jointChain(spine, 0.305, 0.285, skin, skin, [0.046, 0.031, 0.035, 0.024], `arm-${sign}`);
    arm.anchor.position.set(sign * 0.205, 0.405, 0);
    addMesh(arm.upper, sections([[0.065, 0.013, 0.012], [0.040, 0.044, 0.042], [0, 0.061, 0.057], [-0.075, 0.058, 0.055], [-0.135, 0.047, 0.044]]), shirt);
    oval(arm.end, skin, [0, 0.014, 0.002], [0.029, 0.047, 0.024]);
    oval(arm.end, skin, [-sign * 0.024, 0.019, 0.014], [0.012, 0.027, 0.014]);
    return { ...arm, sign };
  });
  const dominant = arms.find(arm => arm.sign === -mirror);
  const paddle = new THREE.Group(); paddle.name = 'paddle'; dominant.end.add(paddle);
  const bladeCenter = new THREE.Vector3(0, 0.127, 0.009);
  const blade = addMesh(paddle, new THREE.CylinderGeometry(0.085, 0.085, 0.013, 48), material(0xb6946b), bladeCenter.toArray(), [1, 1, 1.13]); blade.rotation.x = Math.PI / 2;
  for (const [z, color] of [[0.018, 0xa93d34], [-0.0005, 0x272f2d]]) {
    const face = addMesh(paddle, new THREE.CylinderGeometry(0.082, 0.082, 0.0035, 48), material(color), [0, 0.127, z], [1, 1, 1.13]); face.rotation.x = Math.PI / 2;
  }
  addMesh(paddle, new THREE.CapsuleGeometry(0.013, 0.069, 6, 12), material(0xb39872), [0, 0.026, 0.007], [1, 1, 0.83]);

  const handWorld = new THREE.Vector3(), freeHandWorld = new THREE.Vector3(), paddleWorld = new THREE.Vector3();
  let stroke = null, strokeId = 0, previousX = null, velocity = 0, nextFoot = 0, readyAmount = 0;
  let lastCenter = new THREE.Vector3(-0.18 * mirror, 1.04, 0.37);
  let pose = { phase: 'ready', handedness: 'forehand', contact: false };
  const readyCenter = new THREE.Vector3(-0.19 * mirror, 1.04, 0.34);

  function localContact(event, x = root.position.x) {
    return new THREE.Vector3((event.x - x) * -side, event.y, (root.position.z - event.z) * side);
  }
  function beginSwing(time, event = {}) {
    const lead = Math.max(0.065, event.contactDelay ?? event.lead ?? 0.12);
    const target = { x: event.x ?? root.position.x + side * mirror * 0.19, y: event.y ?? 1.07, z: event.z ?? side * 1.54 };
    stroke = {
      id: ++strokeId, startedAt: time, contactAt: event.contactTime ?? time + lead, lead,
      handedness: event.handedness || (localContact(target).x * mirror > 0.025 ? 'backhand' : 'forehand'),
      spin: event.spin ?? 1, target, ready: lastCenter.clone(), contact: false,
    };
  }
  function contact(time, event = {}) {
    if (!stroke || time > stroke.contactAt + 0.42) beginSwing(time - 0.10, { ...event, contactDelay: 0.10 });
    stroke.contactAt = time;
    stroke.target = { x: event.x ?? stroke.target.x, y: event.y ?? stroke.target.y, z: event.z ?? stroke.target.z };
    stroke.spin = event.spin ?? stroke.spin; stroke.contact = true;
  }

  function update(time, dt, x, ball, active, swingState) {
    const elapsed = clamp(dt || 0, 0, 0.04);
    if (previousX === null) previousX = x;
    const rawVelocity = elapsed > 0 ? (x - previousX) / elapsed : 0;
    velocity += (clamp(rawVelocity, -3.3, 3.3) - velocity) * (1 - Math.exp(-elapsed * 16));
    previousX = x; root.position.x = x;
    readyAmount += ((active || stroke ? 1 : 0) - readyAmount) * (1 - Math.exp(-elapsed * 16));
    if (swingState && !stroke && swingState.target && time < swingState.until) beginSwing(swingState.startedAt ?? time, { ...swingState.target, ...swingState });
    const clipDuration = stroke?.handedness === 'backhand' ? 0.33 : 0.43;
    if (stroke && time > stroke.contactAt + clipDuration) stroke = null;
    const target = stroke ? localContact(stroke.target, x) : readyCenter.clone();
    const canonicalTarget = [target.x * mirror, target.y, target.z];
    const canonicalReady = stroke ? [stroke.ready.x * mirror, stroke.ready.y, stroke.ready.z] : null;
    const canonical = stroke ? sampleStroke(time - stroke.contactAt, stroke.lead, canonicalTarget, canonicalReady, stroke.handedness, stroke.spin) : { center: [-0.19, 1.04, 0.34], phase: 'ready', load: 0, turn: 0, rise: 0 };
    const sample = { ...canonical, center: [canonical.center[0] * mirror, canonical.center[1], canonical.center[2]], turn: canonical.turn * mirror };
    const hipTurn = stroke ? sampleStroke(time - stroke.contactAt + 0.025, stroke.lead, canonicalTarget, canonicalReady, stroke.handedness, stroke.spin).turn * mirror * smoothstep((time - stroke.startedAt) / 0.025) : 0;
    const swingBlend = stroke ? smoothstep((time - stroke.startedAt) / Math.min(stroke.lead, 0.08)) * (1 - smoothstep((time - stroke.contactAt - (clipDuration - 0.25)) / 0.25)) : 0;
    const localVelocity = velocity * -side;
    const lowContact = stroke ? clamp((1.04 - target.y) * 0.35, 0, 0.10) * swingBlend : 0;
    const shift = stroke ? clamp(target.x * 0.18, -0.105, 0.105) * swingBlend + sample.turn * 0.055 : 0;
    // WTT frames provide projected 2D poses; this is an approximate playing stance.
    pelvis.position.set(shift, 0.905 - readyAmount * 0.105 - lowContact + sample.rise + Math.sin(time * 2.3 + side) * 0.002, -0.018);
    pelvis.rotation.set(0, hipTurn * 0.60, clamp(-localVelocity * 0.016, -0.045, 0.045));
    spine.rotation.set(0.075 + readyAmount * 0.325, sample.turn * 0.40, clamp(-localVelocity * 0.018, -0.047, 0.047));
    spine.rotation.x += sample.load * 0.045;
    head.rotation.x = -(0.04 + readyAmount * 0.13);
    head.rotation.y = ball ? clamp(((ball.x - x) * -side) * 0.16 - sample.turn * 0.8, -0.32, 0.32) : -sample.turn * 0.65;
    // A planted foot keeps its world position until a discrete shuffle transfers it.
    for (const leg of legs) if (leg.worldX === null) leg.worldX = x + -side * leg.sign * 0.28;
    const movingFoot = legs.find(leg => leg.step);
    if (!movingFoot) {
      const candidates = legs.map(leg => ({ leg, error: x + -side * leg.sign * 0.28 - leg.worldX }));
      candidates.sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
      if (Math.abs(candidates[0].error) > 0.10) {
        let choice = candidates[0].leg;
        if (Math.abs(candidates[0].error) < 0.17) choice = legs[nextFoot];
        const duration = clamp(0.14 - Math.abs(velocity) * 0.021, 0.075, 0.14);
        const worldGoal = x + -side * choice.sign * 0.28 + velocity * duration;
        choice.step = { at: time, from: choice.worldX, to: worldGoal, duration };
        nextFoot = legs.indexOf(choice) === 0 ? 1 : 0;
      }
    }
    for (const leg of legs) {
      let lift = 0;
      if (leg.step) {
        const t = clamp((time - leg.step.at) / leg.step.duration, 0, 1);
        leg.worldX = THREE.MathUtils.lerp(leg.step.from, leg.step.to, smoothstep(t));
        lift = Math.sin(t * Math.PI) * 0.035;
        if (t >= 1) leg.step = null;
      }
      leg.ankle = new THREE.Vector3((leg.worldX - x) * -side, 0.083 + lift, leg.sign * 0.025 - 0.015);
      const hip = leg.anchor.position.clone().applyEuler(pelvis.rotation).add(new THREE.Vector3(pelvis.position.x, 0, pelvis.position.z));
      const horizontalSq = (leg.ankle.x - hip.x) ** 2 + (leg.ankle.z - hip.z) ** 2;
      const maxHeight = leg.ankle.y - hip.y + Math.sqrt(Math.max(0.1, 0.818 ** 2 - horizontalSq));
      pelvis.position.y = Math.min(pelvis.position.y, maxHeight);
    }
    root.updateMatrixWorld(true);
    for (const leg of legs) {
      placeChain(leg, rootPointToAnchor(root, leg.anchor, leg.ankle), [0, 0, 1]);
      root.updateMatrixWorld(true);
      orientEnd(root, leg.end, new THREE.Euler(0, -leg.sign * 0.11, 0));
    }
    root.updateMatrixWorld(true);
    const center = vec(sample.center);
    const wristBlend = stroke ? smoothstep((time - stroke.startedAt) / Math.min(0.08, stroke.lead)) * (1 - smoothstep((time - stroke.contactAt - (clipDuration - 0.23)) / 0.23)) : 0;
    const wristPitch = THREE.MathUtils.lerp(0.14, stroke?.spin < 0 ? -0.20 : 0.14, wristBlend);
    let wristRoll = mirror * THREE.MathUtils.lerp(-0.18, stroke?.handedness === 'backhand' ? 0.24 : -0.18, wristBlend);
    if (stroke) wristRoll += sample.turn * 0.45;
    const wristRotation = new THREE.Euler(wristPitch, sample.turn * 0.38, wristRoll);
    const wristQuaternion = new THREE.Quaternion().setFromEuler(wristRotation);
    const handTarget = center.clone().sub(bladeCenter.clone().applyQuaternion(wristQuaternion));
    for (const arm of arms) {
      const isDominant = arm === dominant;
      const balancing = new THREE.Vector3(0.255 * mirror - sample.turn * 0.15, 1.01 - lowContact, 0.24 - sample.load * 0.065);
      const armTarget = isDominant ? handTarget : balancing;
      // The elbow pole stays below and behind the hand throughout both strokes.
      placeChain(arm, rootPointToAnchor(root, arm.anchor, armTarget), [arm.sign * 0.52, -0.45, -0.55]);
      root.updateMatrixWorld(true);
      orientEnd(root, arm.end, isDominant ? wristRotation : new THREE.Euler(-0.17, 0, 0.25 * mirror));
    }
    root.updateMatrixWorld(true);
    dominant.end.getWorldPosition(handWorld);
    arms.find(arm => arm !== dominant).end.getWorldPosition(freeHandWorld);
    paddleWorld.copy(bladeCenter); paddle.localToWorld(paddleWorld);
    lastCenter.copy(paddleWorld); root.worldToLocal(lastCenter);
    pose = {
      phase: sample.phase, time, strokeId: stroke?.id ?? strokeId, handedness: stroke?.handedness ?? 'forehand', dominantHand: handed,
      contact: stroke?.contact ?? false, contactAt: stroke?.contactAt ?? null,
      target: stroke ? { ...stroke.target } : null, paddle: paddleWorld.toArray(), hand: handWorld.toArray(),
      shoulderTurn: pelvis.rotation.y + spine.rotation.y, hipTurn: pelvis.rotation.y, footMoving: legs.findIndex(leg => leg.step),
      reachError: dominant.reachError,
    };
    root.userData.pose = pose;
  }
  update(0, 0, 0, null, false);
  return {
    root, handWorld, freeHandWorld, paddleWorld, beginSwing, contact, update,
    strike(time, position, spin) { contact(time, { ...position, spin }); },
    endSwing() { if (stroke) stroke.contact = false; },
    reset() {
      stroke = null; strokeId = 0; previousX = null; velocity = 0; nextFoot = 0; readyAmount = 0;
      for (const leg of legs) { leg.worldX = null; leg.step = null; }
      lastCenter.copy(readyCenter);
    },
    metrics() { return { ...pose, armLengths: [dominant.upperLength, dominant.lowerLength], legLengths: [legs[0].upperLength, legs[0].lowerLength] }; },
  };
}
