// Character poses are baked once into normal animation tracks. Local players,
// turntables and interpolated teammates therefore use the same choreography.
function createArmSolver(T, root, side) {
  const upper = root.getObjectByName(`J_Bip_${side}_UpperArm`), lower = root.getObjectByName(`J_Bip_${side}_LowerArm`), hand = root.getObjectByName(`J_Bip_${side}_Hand`);
  const shoulder = new T.Vector3(), elbow = new T.Vector3(), wrist = new T.Vector3(), axis = new T.Vector3(), bend = new T.Vector3(), desired = new T.Vector3(), end = new T.Vector3(), from = new T.Vector3(), to = new T.Vector3();
  const world = new T.Quaternion(), parent = new T.Quaternion(), normal = new T.Vector3(), z = new T.Vector3();
  const frame = new T.Matrix4();
  upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
  const restNormal = new T.Vector3().subVectors(elbow, shoulder).cross(new T.Vector3().subVectors(wrist, elbow)).normalize();
  const frames = new Map();
  for (const [bone, child] of [[upper, lower], [lower, hand]]) {
    const x = child.position.clone().normalize();
    const y = restNormal.clone().applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()).invert());
    y.addScaledVector(x, -y.dot(x)).normalize();
    if (y.lengthSq() < .5) { y.set(0,0,1).addScaledVector(x,-x.z).normalize(); }
    const local = new T.Matrix4().makeBasis(x, y, new T.Vector3().crossVectors(x, y));
    frames.set(bone, new T.Quaternion().setFromRotationMatrix(local).invert());
  }
  function aim(bone, point) {
    bone.getWorldPosition(from); to.subVectors(point, from).normalize();
    z.crossVectors(to, normal).normalize();
    frame.makeBasis(to, normal, z);
    world.setFromRotationMatrix(frame).multiply(frames.get(bone));
    bone.parent.getWorldQuaternion(parent).invert();
    bone.quaternion.copy(parent.multiply(world)); bone.updateMatrixWorld(true);
  }
  return (target, pole, rotation) => {
    upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    axis.subVectors(target, shoulder); const d = T.MathUtils.clamp(axis.length(), Math.abs(a - b) + 0.005, (a + b) * 0.98); axis.normalize();
    end.copy(shoulder).addScaledVector(axis, d);
    bend.copy(pole).addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + d * d) / (2 * d), height = Math.sqrt(Math.max(0, a * a - along * along));
    desired.copy(shoulder).addScaledVector(axis, along).addScaledVector(bend, height);
    normal.crossVectors(bend, axis).normalize();
    aim(upper, desired); aim(lower, end);
    hand.parent.getWorldQuaternion(parent).invert(); hand.quaternion.copy(parent.multiply(rotation)); hand.updateMatrixWorld(true);
    return end.distanceTo(target);
  };
}

export function createPolearmClips(T, source, animations) {
  const idle = animations.find(c => c.name === 'idle'), run = animations.find(c => c.name === 'run');
  if (!idle || !source.getObjectByName('J_Bip_R_Hand')) return [];
  // Only bones are sampled; mesh geometry, materials and the live rig are untouched.
  const root = source.clone(true); root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  const bones = []; root.traverse(b => { if (b.isBone) bones.push(b); });
  const hips = root.getObjectByName('J_Bip_C_Hips'), chest = root.getObjectByName('J_Bip_C_Chest');
  for (const track of idle.tracks) { const [name, property] = track.name.split('.'); root.getObjectByName(name)?.[property]?.fromArray(track.createInterpolant().evaluate(.1)); }
  root.updateMatrixWorld(true);
  const right = createArmSolver(T, root, 'R'), left = createArmSolver(T, root, 'L');
  const rightTarget = new T.Vector3(), leftTarget = new T.Vector3(), direction = new T.Vector3(), pole = new T.Vector3(), offset = new T.Vector3();
  const weaponRotation = new T.Quaternion(), handRotation = new T.Quaternion(), leftRotation = new T.Quaternion();
  const mountInverse = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1), new T.Vector3(1, 0, 0))).invert();
  const flip = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI);
  // [time, grip x/y/z, shaft yaw/pitch, hip turn, torso lean]. Curves ease into
  // wind-up, accelerate through the hit, then settle; the shaft never spins in place.
  const guard = [0, -0.20, 1.03, 0.20, 0.95, 0.40, 0, 0];
  const key = (t, x, y, z, yaw, pitch, turn = 0, lean = 0) => [t, x, y, z, yaw, pitch, turn, lean];
  const sweep = [guard, key(.20,-.21,1.05,.17,-.92,.15,-.24), key(.40,-.16,1.00,.26,1.60,.12,.28,.05), key(.62,-.18,1.03,.21,1.15,.3,.10), [1,...guard.slice(1)]];
  const rise = [guard,key(.18,-.20,.93,.19,1.25,-.5,.18,.08),key(.40,-.18,1.16,.24,-.65,.9,-.22,-.06),key(.68,-.20,1.1,.22,.45,.75,-.08),[1,...guard.slice(1)]];
  const slam = [guard,key(.32,-.15,1.25,.16,.25,1.28,-.12,-.10),key(.48,-.16,1.28,.20,.1,1.3,-.06,-.08),key(.60,-.19,.92,.26,.05,-.55,.18,.18),key(.77,-.21,.94,.25,.25,-.25,.10,.10),[1,...guard.slice(1)]];
  const ultimate = [guard,key(.14,-.15,1.29,.19,.3,1.15,-.1,-.08),key(.25,-.19,.96,.25,1.5,.08,.28,.08),key(.37,-.20,1.12,.20,-.8,.65,-.20,-.03),key(.46,-.19,.99,.25,1.5,.1,.27,.07),key(.57,-.20,1.15,.22,-.65,.8,-.18,-.04),key(.67,-.19,.97,.26,1.55,.05,.3,.1),key(.74,-.15,1.28,.18,.1,1.32,-.1,-.08),key(3.05/3.6,-.19,.91,.26,.05,-.58,.2,.2),key(.93,-.2,.95,.23,.25,-.15,.12,.08),[1,...guard.slice(1)]];
  const definitions = [
    ['azureIdle', idle.duration, [guard,[1,...guard.slice(1)]], idle],
    ['azureRun', run.duration, [guard,[1,...guard.slice(1)]], run],
    ['azureSweep', .7, sweep, idle], ['azureRise', .76, rise, idle], ['azureSlam', 1.12, slam, idle],
    ['azureGuard', .68, sweep, idle], ['azureUlt', 3.6, ultimate, idle],
  ];
  const clips = [];
  for (const [name, duration, keys, base] of definitions) {
    const hipTrack = base.tracks.find(track => track.name === `${hips.name}.position`);
    const samplers = base.tracks.map(track => {
      const [name, property] = track.name.split('.');
      return { bone: root.getObjectByName(name), property, sample: track.createInterpolant() };
    });
    const times = [], values = bones.map(() => []), positions = [];
    const count = Math.ceil(duration * 60);
    for (let i = 0; i <= count; i++) {
      const t = i / count, seconds = t * duration;
      const at = base === idle ? .1 : Math.min(seconds, base.duration - .00001);
      for (const { bone, property, sample } of samplers) if (bone) bone[property].fromArray(sample.evaluate(at));
      let k = 0; while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const a = keys[k], b = keys[k + 1], u = T.MathUtils.clamp((t - a[0]) / (b[0] - a[0]), 0, 1), ease = u * u * (3 - 2 * u);
      const p = a.map((v, j) => j ? T.MathUtils.lerp(v, b[j], ease) : t);
      // Preserve the source footwork while keeping the character's heading stable.
      if (hipTrack) { hips.position.x = hipTrack.values[0]; hips.position.z = hipTrack.values[2]; }
      hips.quaternion.setFromEuler(new T.Euler(0, p[6], 0));
      chest.rotation.x += p[7];
      if (base === idle) hips.position.y += Math.sin(t * Math.PI * 2) * .003;
      root.updateMatrixWorld(true);
      weaponRotation.setFromEuler(new T.Euler(Math.PI / 2 - p[5], p[4], 0, 'YXZ'));
      handRotation.copy(weaponRotation).multiply(mountInverse);
      direction.set(0,1,0).applyQuaternion(weaponRotation);
      // Rotate around the space between the hands rather than fixing one hand
      // while the other describes an unreachable half-metre arc.
      rightTarget.set(p[1] + .17, p[2] + .10, p[3] - .02).addScaledVector(direction, -.14);
      offset.set(-.045,-.012,.025).applyQuaternion(handRotation); rightTarget.sub(offset);
      leftRotation.copy(handRotation).multiply(flip);
      leftTarget.copy(rightTarget).add(offset).addScaledVector(direction, .28).sub(offset.set(-.045,-.012,.025).applyQuaternion(leftRotation));
      right(rightTarget, pole.set(-.8,-.45,-.35), handRotation);
      left(leftTarget, pole.set(.8,-.45,-.35), leftRotation);
      times.push(seconds); bones.forEach((bone,j) => values[j].push(...bone.quaternion.toArray()));
      positions.push(hips.position.x, hips.position.y, hips.position.z);
    }
    const tracks = bones.map((b,j) => new T.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values[j]));
    tracks.push(new T.VectorKeyframeTrack(`${hips.name}.position`, times, positions));
    clips.push(new T.AnimationClip(name, duration, tracks).optimize());
  }
  return clips;
}

// The eight dash beats have one continuous upper-body animation. Keeping the
// planted lower-body pose avoids fast-forwarding a sword clip's kicks each hit.
export function createDualBladeUltimate(T, source, animations) {
  const idle = animations.find(c => c.name === 'idle');
  if (!idle || !source.getObjectByName('J_Bip_R_Hand')) return null;
  const root = source.clone(true); root.position.set(0,0,0); root.quaternion.identity(); root.scale.set(1,1,1);
  const bones = []; root.traverse(b => { if (b.isBone) bones.push(b); });
  for (const track of idle.tracks) { const [name,property] = track.name.split('.'); root.getObjectByName(name)?.[property]?.fromArray(track.createInterpolant().evaluate(.1)); }
  root.updateMatrixWorld(true);
  const base = bones.map(b => ({ position:b.position.clone(), quaternion:b.quaternion.clone() }));
  const right = createArmSolver(T,root,'R'), left = createArmSolver(T,root,'L');
  const hips = root.getObjectByName('J_Bip_C_Hips'), chest = root.getObjectByName('J_Bip_C_Chest');
  const handRotation = new T.Quaternion(), mountInverse = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(0,0,1),new T.Vector3(1,0,0))).invert();
  const target = new T.Vector3(), pole = new T.Vector3(), times = [], values = bones.map(() => []), positions = [];
  for (let frame=0;frame<=168;frame++) {
    const at=frame/60;
    bones.forEach((b,i) => { b.position.copy(base[i].position); b.quaternion.copy(base[i].quaternion); });
    let stroke=0;
    for (let i=0;i<8;i++) {
      const beat=.38+i*(2.05-.38)/7, p=(at-beat)/.18;
      if (p>=-1 && p<=1) stroke+=Math.sin((p+1)*Math.PI)*(i%2?-1:1);
    }
    const finish=T.MathUtils.smoothstep(at,2.12,2.30)*(1-T.MathUtils.smoothstep(at,2.35,2.62));
    const cross=T.MathUtils.smoothstep(at,2.30,2.35)*(1-T.MathUtils.smoothstep(at,2.5,2.8));
    hips.quaternion.setFromEuler(new T.Euler(0,stroke*.15,0)); chest.rotation.y+=stroke*.18;
    chest.rotation.x+=cross*.1; root.updateMatrixWorld(true);
    for (const side of [-1,1]) {
      handRotation.setFromEuler(new T.Euler(Math.PI/2-(.25+finish*.7-cross*.8),side*(.7-stroke*.6-cross*.8),side*(.35+cross*.6),'YXZ')).multiply(mountInverse);
      target.set(side*(.23-cross*.19)+stroke*.12,1.14+Math.abs(stroke)*.12+finish*.22-cross*.08,.22+cross*.06);
      (side<0?right:left)(target,pole.set(side*.8,-.45,-.35),handRotation);
    }
    times.push(at); bones.forEach((b,i) => values[i].push(...b.quaternion.toArray())); positions.push(...hips.position.toArray());
  }
  const tracks=bones.map((b,i) => new T.QuaternionKeyframeTrack(`${b.name}.quaternion`,times,values[i]));
  tracks.push(new T.VectorKeyframeTrack(`${hips.name}.position`,times,positions));
  return new T.AnimationClip('amberUlt',2.8,tracks).optimize();
}
