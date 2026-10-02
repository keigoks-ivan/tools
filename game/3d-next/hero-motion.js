// Character poses are baked once into normal animation tracks. Local players,
// turntables and interpolated teammates therefore use the same choreography.
import { createFreeMotionSampler } from './free-motion.js?v=20261002j';
import { HEROES } from './heroes.js?v=20261002k';

export function createArmSolver(T, root, side, limb = 'Arm') {
  const upper = root.getObjectByName(`J_Bip_${side}_Upper${limb}`), lower = root.getObjectByName(`J_Bip_${side}_Lower${limb}`), hand = root.getObjectByName(`J_Bip_${side}_${limb === 'Arm' ? 'Hand' : 'Foot'}`);
  const shoulder = new T.Vector3(), elbow = new T.Vector3(), wrist = new T.Vector3(), axis = new T.Vector3(), bend = new T.Vector3(), desired = new T.Vector3(), end = new T.Vector3(), from = new T.Vector3(), to = new T.Vector3();
  const world = new T.Quaternion(), parent = new T.Quaternion(), normal = new T.Vector3(), z = new T.Vector3();
  const frame = new T.Matrix4(), previousNormal=new T.Vector3();
  const rootRotation=new T.Quaternion(),previousRootRotation=new T.Quaternion(),rootDelta=new T.Quaternion();
  let hasNormal=false;
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
  const solve = (target, pole, rotation) => {
    upper.getWorldPosition(shoulder); lower.getWorldPosition(elbow); hand.getWorldPosition(wrist);
    const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
    axis.subVectors(target, shoulder); const d = T.MathUtils.clamp(axis.length(), Math.abs(a - b) + 0.005, (a + b) * 0.98); axis.normalize();
    end.copy(shoulder).addScaledVector(axis, d);
    bend.copy(pole).addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + d * d) / (2 * d), height = Math.sqrt(Math.max(0, a * a - along * along));
    desired.copy(shoulder).addScaledVector(axis, along).addScaledVector(bend, height);
    normal.crossVectors(bend, axis).normalize();
    root.getWorldQuaternion(rootRotation);
    if(limb==='Arm' && hasNormal) {
      rootDelta.copy(previousRootRotation).invert().premultiply(rootRotation);previousNormal.applyQuaternion(rootDelta);
      previousNormal.addScaledVector(axis,-previousNormal.dot(axis)).normalize();
      if(normal.dot(previousNormal)<0)normal.negate();
      const angle=previousNormal.angleTo(normal);
      if(angle>.15) {
        const sign=new T.Vector3().crossVectors(previousNormal,normal).dot(axis)<0?-1:1;
        normal.copy(previousNormal).applyAxisAngle(axis,sign*.15);
      }
      bend.crossVectors(axis,normal).normalize();desired.copy(shoulder).addScaledVector(axis,along).addScaledVector(bend,height);
    }
    previousNormal.copy(normal);previousRootRotation.copy(rootRotation);hasNormal=true;
    aim(upper, desired); aim(lower, end);
    hand.parent.getWorldQuaternion(parent).invert(); hand.quaternion.copy(parent.multiply(rotation)); hand.updateMatrixWorld(true);
    return end.distanceTo(target);
  };
  solve.reset=()=>{hasNormal=false;};
  return solve;
}

export function createPolearmClips(T, source, animations) {
  const idle = animations.find(c => c.name === 'idle'), run = animations.find(c => c.name === 'run');
  if (!idle || !source.getObjectByName('J_Bip_R_Hand')) return [];
  // Only bones are sampled; mesh geometry, materials and the live rig are untouched.
  const root = source.clone(true); root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  const bones = []; root.traverse(b => { if (b.isBone) bones.push(b); });
  const hips = root.getObjectByName('J_Bip_C_Hips'), chest = root.getObjectByName('J_Bip_C_Chest');
  const imported=createFreeMotionSampler(T,root,'polearm');
  const sourceRight=new T.Vector3(),sourceLeft=new T.Vector3(),sourceCentre=new T.Vector3(),sourceRotation=new T.Quaternion(),previousRotation=new T.Quaternion();
  const neck = root.getObjectByName('J_Bip_C_Neck');
  const torsoRest = ['C_Spine','C_Chest','C_UpperChest','C_Neck','C_Head','R_Shoulder','L_Shoulder'].map(name => { const bone=root.getObjectByName(`J_Bip_${name}`); return { bone, rotation:bone.quaternion.clone() }; });
  const grip = [];
  for (const side of ['R','L']) for (const finger of ['Index','Middle','Ring','Little']) for (let joint=1;joint<=3;joint++) {
    const bone=root.getObjectByName(`J_Bip_${side}_${finger}${joint}`);
    grip.push({ bone, rotation:bone.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),(side==='R'?1:-1)*[0,1.05,1.45,.8][joint])) });
  }
  root.updateMatrixWorld(true);
  const feet = ['R','L'].map(side => ({
    solve: createArmSolver(T,root,side,'Leg'),
    rotation: root.getObjectByName(`J_Bip_${side}_Foot`).getWorldQuaternion(new T.Quaternion()),
  }));
  for (const track of idle.tracks) { const [name, property] = track.name.split('.'); root.getObjectByName(name)?.[property]?.fromArray(track.createInterpolant().evaluate(.1)); }
  root.updateMatrixWorld(true);
  const right = createArmSolver(T, root, 'R'), left = createArmSolver(T, root, 'L');
  const rightTarget = new T.Vector3(), leftTarget = new T.Vector3(), direction = new T.Vector3(), pole = new T.Vector3(), offset = new T.Vector3();
  const weaponRotation = new T.Quaternion(), handRotation = new T.Quaternion(), leftRotation = new T.Quaternion();
  const mountInverse = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1), new T.Vector3(1, 0, 0))).invert();
  const flip = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI);
  const footRotation = new T.Quaternion(), turnRotation = new T.Quaternion(), up = new T.Vector3(0,1,0);
  // [time, grip centre x/y/z, shaft yaw/pitch, hip turn, torso lean]. The
  // blade leads a curved stroke; the pelvis shifts between planted, staggered feet.
  const guard = [0, -.015, 1.13, .25, .95, .35, -.10, .015];
  const key = (t, x, y, z, yaw, pitch, turn = 0, lean = 0) => [t, x, y, z, yaw, pitch, turn, lean];
  const sweep = [guard, key(.24,-.035,1.15,.20,-1.05,.24,-.28,-.025), key(.40,.015,1.10,.31,.65,.12,.20,.09), key(.64,.03,1.10,.25,1.35,.20,.30,.055), [1,...guard.slice(1)]];
  const rise = [[0,...sweep[3].slice(1)],key(.12,.03,1.10,.25,1.35,.20,.30,.055),key(.24,-.025,1.02,.26,.45,-.42,.18,.09),key(.395,-.015,1.24,.27,.35,.82,-.18,-.035),key(.64,-.02,1.32,.22,.20,1.12,-.26,-.07),[1,...guard.slice(1)]];
  const slam = [[0,...rise[4].slice(1)],key(.32,-.015,1.37,.17,.12,1.30,-.20,-.09),key(.48,-.01,1.39,.21,.08,1.30,-.18,-.085),key(.607,0,1.05,.30,.08,-.70,.22,.19),key(.76,.005,1.02,.28,.12,-.82,.27,.14),[1,...guard.slice(1)]];
  const ultimate = [guard,key(.15,-.015,1.34,.20,-.65,.9,-.25,-.07),key(.25,.005,1.10,.30,.70,.12,.22,.08),key(.32,.02,1.08,.25,1.30,.16,.28,.06),key(.37,-.02,1.02,.24,.45,-.40,.18,.07),key(1.65/3.6,-.02,1.24,.26,.35,.85,-.18,-.04),key(.54,-.02,1.3,.21,.15,1.12,-.24,-.07),key(.59,-.03,1.14,.21,-1.05,.22,-.28,-.025),key(2.4/3.6,.01,1.10,.30,.70,.1,.22,.08),key(.74,-.01,1.39,.18,.10,1.30,-.18,-.08),key(3.05/3.6,0,1.05,.3,.08,-.70,.22,.19),key(.92,.005,1.02,.28,.12,-.82,.27,.14),[1,...guard.slice(1)]];
  const definitions = [
    ['azureIdle', idle.duration, [guard,[1,...guard.slice(1)]], idle],
    ['azureRun', run.duration, [guard,[1,...guard.slice(1)]], run],
    ['azureSweep', .7, sweep, idle], ['azureRise', .76, rise, idle], ['azureSlam', 1.12, slam, idle],
    ['azureGuard', .68, sweep, idle], ['azureUlt', 3.6, ultimate, idle],
  ];
  const clips = [];
  for (const [name, duration, keys, base] of definitions) {
    right.reset();left.reset();
    const hipTrack = base.tracks.find(track => track.name === `${hips.name}.position`);
    // Monotone Hermite tangents maintain speed through the impact keys without
    // overshooting a wrist target. Extremes and the resting ends have zero speed.
    const tangent = (i,j) => {
      if (i === 0 || i === keys.length - 1) return 0;
      const before=(keys[i][j]-keys[i-1][j])/(keys[i][0]-keys[i-1][0]);
      const after=(keys[i+1][j]-keys[i][j])/(keys[i+1][0]-keys[i][0]);
      return before*after<=0 ? 0 : 2*before*after/(before+after);
    };
    const samplers = base.tracks.map(track => {
      const [name, property] = track.name.split('.');
      return { bone: root.getObjectByName(name), property, sample: track.createInterpolant() };
    });
    const times = [], values = bones.map(() => []), positions = [];
    const count = Math.ceil(duration * 90);
    for (let i = 0; i <= count; i++) {
      const t = i / count, seconds = t * duration;
      const at = base === idle ? .1 : Math.min(seconds, base.duration - .00001);
      for (const { bone, property, sample } of samplers) if (bone) bone[property].fromArray(sample.evaluate(at));
      for (const { bone,rotation } of grip) bone.quaternion.copy(rotation);
      for (const { bone,rotation } of torsoRest) bone.quaternion.copy(rotation);
      let k = 0; while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
      const a = keys[k], b = keys[k + 1], span=b[0]-a[0], u=T.MathUtils.clamp((t-a[0])/span,0,1);
      const p = a.map((v,j) => j ? (2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*span*tangent(k,j)+(-2*u**3+3*u*u)*b[j]+(u**3-u*u)*span*tangent(k+1,j) : t);
      if (base === run) {
        // Preserve authored running legs and root height, retaining the guard.
        if (hipTrack) { hips.position.x = hipTrack.values[0]; hips.position.z = hipTrack.values[2]; }
        hips.quaternion.setFromEuler(new T.Euler(0,p[6],0));
      } else {
        hips.position.set(p[6]*.28, .86-Math.max(0,p[7])*.30, -Math.abs(p[6])*.025);
        hips.position.y += Math.sin(t*Math.PI*2)*.003;
        const transfer=name==='azureIdle'?0:T.MathUtils.smoothstep(t,.12,.40)*(1-T.MathUtils.smoothstep(t,name==='azureSweep'?.44:name==='azureRise'?.46:name==='azureGuard'?.42:.69,name==='azureSweep'?.60:name==='azureRise'?.62:name==='azureGuard'?.56:.96));
        hips.position.z+=transfer*.10;
        hips.quaternion.setFromEuler(new T.Euler(p[7]*.35,p[6]*2.1,-p[6]*.08));
      }
      const sourceName=name==='azureRise' ? 'Melee_2H_Attack_Chop' : name==='azureSlam' ? 'Melee_2H_Attack_Chop' : name==='azureUlt' ? seconds>=2.65?'Melee_2H_Attack_Chop':'Melee_2H_Attack_Spin' : name==='azureSweep'||name==='azureGuard' ? 'Melee_2H_Attack_Slice' : 'Melee_2H_Idle';
      const sourcePhase=name==='azureRise' ? .55-.23*T.MathUtils.smootherstep(seconds,0,.60) : name==='azureSlam' ? .32+.20*Math.min(1,(seconds/.68)**1.7)+.48*T.MathUtils.smoothstep(seconds,.72,1.12) : name==='azureUlt' ? seconds<2.65?seconds/2.65*.8:.32+.20*T.MathUtils.smoothstep(seconds,2.65,3.05)+.48*T.MathUtils.smoothstep(seconds,3.15,3.6) : t;
      const blendIn=name==='azureRise' ? T.MathUtils.smoothstep(seconds,0,.22) : name==='azureUlt'&&seconds>=2.65 ? T.MathUtils.smoothstep(seconds,2.65,2.83) : 1;
      const previousSource=name==='azureUlt'?'Melee_2H_Attack_Spin':'Melee_2H_Attack_Slice', previousTime=(name==='azureUlt'?.8:.43/.7)*imported.duration(previousSource);
      const sourceTime=sourcePhase*imported.duration(sourceName);
      if(base!==run) {
        const hipPosition=hips.position.clone();
        if(blendIn<1)imported.apply(previousSource,previousTime);
        imported.apply(sourceName,sourceTime,blendIn);hips.position.copy(hipPosition);
        hips.rotation.y+=p[6]*.35;
      }
      chest.rotation.x += p[7]*.35; chest.rotation.y += p[6]*.10;
      neck.rotation.y -= T.MathUtils.clamp(p[6]*1.1,-.4,.4);
      root.updateMatrixWorld(true);
      if (base !== run) {
        // Grounding adapts the imported two-handed stroke to a long weapon.
        // The front foot supports; the rear foot lifts to advance
        // and lifts again on recovery. No grounded foot translates along the floor.
        const striking = name !== 'azureIdle';
        const advance = striking ? T.MathUtils.smoothstep(t,.12,.40) : 0;
        const recovery = name==='azureSweep' ? [.44,.60] : name==='azureRise' ? [.46,.62] : name==='azureGuard' ? [.42,.56] : [.69,.96];
        const recover = striking ? T.MathUtils.smoothstep(t,...recovery) : 0;
        const lift = .10*(Math.sin(advance*Math.PI)+Math.sin(recover*Math.PI));
        const travel = T.MathUtils.smoothstep(advance,.15,.85), returnTravel = T.MathUtils.smoothstep(recover,.15,.85);
        turnRotation.setFromAxisAngle(up,p[6]*.9);
        footRotation.copy(turnRotation).multiply(feet[0].rotation);
        feet[0].solve(rightTarget.set(-.22,.09+lift,-.20+.34*travel*(1-returnTravel)),pole.set(-.1,0,1),footRotation);
        footRotation.copy(turnRotation).multiply(feet[1].rotation);
        feet[1].solve(leftTarget.set(.22,.09,.22),pole.set(.1,0,1),footRotation);
      }
      weaponRotation.setFromEuler(new T.Euler(Math.PI/2-p[5],p[4],0,'YXZ'));
      if(base!==run) {
        imported.position(sourceName,sourceTime,'J_Bip_R_Hand',sourceRight);
        imported.position(sourceName,sourceTime,'J_Bip_L_Hand',sourceLeft);
        if(blendIn<1) {
          imported.position(previousSource,previousTime,'J_Bip_R_Hand',rightTarget);sourceRight.lerp(rightTarget,1-blendIn);
          imported.position(previousSource,previousTime,'J_Bip_L_Hand',leftTarget);sourceLeft.lerp(leftTarget,1-blendIn);
        }
        sourceCentre.copy(sourceRight).lerp(sourceLeft,.5);
        sourceCentre.x=T.MathUtils.clamp(sourceCentre.x,-.14,.14);sourceCentre.y=T.MathUtils.clamp(sourceCentre.y,1.0,1.43);sourceCentre.z=Math.max(.32,sourceCentre.z);
        imported.rotation(sourceName,sourceTime,'J_Bip_C_WeaponGrip',sourceRotation);
        if(blendIn<1){imported.rotation(previousSource,previousTime,'J_Bip_C_WeaponGrip',previousRotation);sourceRotation.slerp(previousRotation,1-blendIn);}
        // The source weapon socket preserves the actual blade swing and roll.
        weaponRotation.copy(sourceRotation);
      }
      handRotation.copy(weaponRotation).multiply(mountInverse);
      direction.set(0,1,0).applyQuaternion(weaponRotation);
      // A 40 cm grip supports the long blade. Targets and elbow guides are
      // authored together; neither shoulder has to chase the weapon behind it.
      // Carry descending cuts beside the right shoulder rather than through
      // the centre of the chest; keep both grip targets on the same rigid shaft.
      if(base!==run){p[1]=sourceCentre.x;p[2]=sourceCentre.y;p[3]=sourceCentre.z/ .68;}
      rightTarget.set(p[1]-(base===run?direction.x*.08:0),p[2],p[3]*.68).addScaledVector(direction,-.20);
      offset.set(-.045,-.012,.025).applyQuaternion(handRotation); rightTarget.sub(offset);
      leftRotation.copy(handRotation).multiply(flip);
      leftTarget.copy(rightTarget).add(offset).addScaledVector(direction,.40).sub(offset.set(.045,-.012,.025).applyQuaternion(leftRotation));
      // Project the rigid grip as a pair into both reach spheres. Translating
      // both wrists together preserves spacing; independently clamping wrists
      // would bend the shaft or slide the supporting hand during a low stroke.
      for (let pass=0;pass<24;pass++) {
        let corrected=false;
        for(const torsoName of (name==='azureSlam'||name==='azureUlt'&&seconds>=2.65?['C_Spine','C_Chest','C_UpperChest']:[])) {
          const torso=root.getObjectByName(`J_Bip_${torsoName}`).getWorldPosition(new T.Vector3());
          const palmOffset=new T.Vector3(-.045,-.012,.025).applyQuaternion(handRotation);
          const closest=rightTarget.clone().add(palmOffset).addScaledVector(direction,torso.clone().sub(rightTarget).sub(palmOffset).dot(direction));
          const away=closest.sub(torso),distance=away.length();
          const clearance=.19*(name==='azureUlt'?T.MathUtils.smoothstep(seconds,2.65,2.85):1);
          if(distance<clearance) {
            const outward=new T.Vector3(-1,0,0).addScaledVector(direction,direction.x);
            if(outward.lengthSq()<.001)outward.set(0,0,1).addScaledVector(direction,-direction.z);
            outward.normalize();const along=away.dot(outward),travel=-along+Math.sqrt(along*along+clearance*clearance-distance*distance);
            outward.multiplyScalar(travel);rightTarget.add(outward);leftTarget.add(outward);corrected=true;
          }
        }
        for (const [side,target] of [['R',rightTarget],['L',leftTarget]]) {
          const upper=root.getObjectByName(`J_Bip_${side}_UpperArm`), lower=root.getObjectByName(`J_Bip_${side}_LowerArm`), hand=root.getObjectByName(`J_Bip_${side}_Hand`);
          const shoulder=upper.getWorldPosition(new T.Vector3());
          const reach=(lower.position.length()+hand.position.length())*.975;
          const delta=new T.Vector3().subVectors(target,shoulder), distance=delta.length();
          if (distance>reach) {
            delta.multiplyScalar(reach/distance-1);
            rightTarget.add(delta); leftTarget.add(delta); corrected=true;
          }
        }
        if (!corrected) break;
      }
      turnRotation.setFromAxisAngle(up,p[6]*2.1);
      right(rightTarget,pole.set(-.9,-.2,-.4).applyQuaternion(turnRotation),handRotation);
      left(leftTarget,pole.set(.9,-.2,-.4).applyQuaternion(turnRotation),leftRotation);
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

// KayKit CC0 bow clips provide torso, head and arm trajectories. IK adapts
// the imported motion to this rig's bow grip, cheek anchor and combat clock.
export function createArcherClips(T, source, animations) {
  const idle=animations.find(c=>c.name==='idle'), run=animations.find(c=>c.name==='run');
  if(!idle || !source.getObjectByName('J_Bip_L_Hand')) return [];
  const root=source.clone(true); root.position.set(0,0,0); root.quaternion.identity(); root.scale.set(1,1,1);
  const bones=[];root.traverse(b=>{if(b.isBone)bones.push(b);});
  const rest=bones.map(b=>({position:b.position.clone(),rotation:b.quaternion.clone()}));
  const restRotations=new Map(bones.map((bone,i)=>[bone,rest[i].rotation]));
  const imported=createFreeMotionSampler(T,root,'bow');
  const elbowGuide=new T.Vector3(),shoulderGuide=new T.Vector3(),rightGuide=new T.Vector3(-1,-.4,0),leftGuide=new T.Vector3(.6,-.6,-.2);
  root.updateMatrixWorld(true);
  const feet=['R','L'].map(side=>({ solve:createArmSolver(T,root,side,'Leg'), rotation:root.getObjectByName(`J_Bip_${side}_Foot`).getWorldQuaternion(new T.Quaternion()) }));
  for(const track of idle.tracks) { const [name,property]=track.name.split('.'); root.getObjectByName(name)?.[property]?.fromArray(track.createInterpolant().evaluate(.1)); }
  root.updateMatrixWorld(true);
  const right=createArmSolver(T,root,'R'), left=createArmSolver(T,root,'L');
  const hips=root.getObjectByName('J_Bip_C_Hips'), chest=root.getObjectByName('J_Bip_C_Chest'), neck=root.getObjectByName('J_Bip_C_Neck');
  const target=new T.Vector3(), pole=new T.Vector3(), offset=new T.Vector3(), centre=new T.Vector3(), direction=new T.Vector3();
  const rotation=new T.Quaternion(), handRotation=new T.Quaternion();
  const mountInverse=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(0,0,1),new T.Vector3(1,0,0))).invert();
  const profile=HEROES.jade, moves=[...new Map([...profile.chain,...profile.charges,profile.counter,profile.air].map(move=>[move.clip,move])).values()];
  const definitions=[['jadeIdle',idle.duration,[],idle],['jadeRun',run.duration,[],run],...moves.map(move=>[move.clip,move.duration,move.hits,idle]),['jadeUlt',3.6,[.65,2.75],idle]];
  return definitions.map(([name,duration,shots,base])=>{
    right.reset();left.reset();
    const times=[],values=bones.map(()=>[]),positions=[],count=Math.ceil(duration*90);
    const samplers=base===run ? run.tracks.map(track=>{const[name,property]=track.name.split('.');return {bone:root.getObjectByName(name),property,sample:track.createInterpolant()};}) : [];
    for(let frame=0;frame<=count;frame++) {
      const seconds=frame/count*duration;
      bones.forEach((b,i)=>{b.position.copy(rest[i].position);b.quaternion.copy(rest[i].rotation);});
      for(const {bone,property,sample} of samplers) if(bone)bone[property].fromArray(sample.evaluate(seconds));
      let draw=0,tension=0;
      for(const [index,at] of shots.entries()) {
        const loaded=T.MathUtils.smoothstep(seconds,Math.max(0,at-.16,index?shots[index-1]+.18:name==='jadeShot'?0:.12),at-.04);
        draw=Math.max(draw,loaded*(1-T.MathUtils.smoothstep(seconds,at+.055,at+.16)));
        tension=Math.max(tension,loaded*(1-T.MathUtils.smoothstep(seconds,at,at+.035)));
      }
      const phase=seconds/duration;
      const fan=['jadeFan','jadeSpread'].includes(name), burst=name==='jadeBurst';
      const cant=name==='jadeDouble' ? -.10 : fan ? -.22 : burst ? .13 : 0;
      const lift=name==='jadeUlt' ? .62*T.MathUtils.smoothstep(seconds,.12,.40)*(1-T.MathUtils.smoothstep(seconds,.75,1.0)) : 0;
      const move=moves.find(move=>move.clip===name);
      const end=move?(Number.isFinite(move.cancel)?move.cancel:move.duration):duration;
      const step=move&&name!=='jadeAir'?T.MathUtils.smoothstep(seconds,.02,Math.min(.18,end*.35)):0;
      const recover=move?T.MathUtils.smoothstep(seconds,name==='jadeDouble'?.34:Math.max(shots.at(-1)+.04,end-.15),name==='jadeDouble'?.54:end):0;
      const travel=T.MathUtils.smoothstep(step,.12,.88)*(1-T.MathUtils.smoothstep(recover,.12,.88)),footLift=move&&name!=='jadeAir'?.095*(Math.sin(step*Math.PI)+Math.sin(recover*Math.PI)):0;
      const sideStep=['jadeFan','jadeSpread','jadeBurst'].includes(name);
      const bob=base===run ? Math.sin(phase*Math.PI*4)*.012 : Math.sin(phase*Math.PI*2)*.003;
      if(base!==run) {
        hips.position.set(draw*(fan?.045:burst?-.02:.018),.95-draw*(fan?.045:burst?.035:.025)+bob,0);
        hips.quaternion.setFromEuler(new T.Euler(.015,-.45-draw*(fan?.65:burst?.30:.45),0));
      } else { hips.position.x=0;hips.position.z=0; }
      let sourceName='Ranged_Bow_Idle',sourceTime=seconds%imported.duration(sourceName),sourceWeight=base===run?0:1;
      let sourceMix=0;
      for(const [index,at] of shots.entries()) {
        const start=index?shots[index-1]+.12:0, end=index+1<shots.length?at+.12:duration;
        if(seconds>=start && seconds<=end) {
          const upper=name==='jadeUlt' && index===0;
          sourceName=seconds<=at ? `Ranged_Bow_Draw${upper?'_Up':''}` : `Ranged_Bow_Release${upper?'_Up':''}`;
          const d=imported.duration(sourceName);
          sourceTime=seconds<=at ? d*(.35+.65*T.MathUtils.smoothstep(seconds,start,at-.035)) : Math.min(d,(seconds-at)*1.5);
          sourceMix=T.MathUtils.smoothstep(seconds,start,start+.06)*(1-T.MathUtils.smoothstep(seconds,end-.06,end));
          break;
        }
      }
      if(sourceWeight) {
        imported.apply('Ranged_Bow_Idle',seconds%imported.duration('Ranged_Bow_Idle'));
        if(sourceMix)imported.apply(sourceName,sourceTime,sourceMix);
        hips.position.set(draw*.018+travel*(sideStep?.065:-.065),.95-draw*.025-travel*.02+bob,travel*(sideStep?.03:-.05));
        // The support foot stays planted as the stepping foot transfers weight.
        hips.rotation.y-=draw*(fan?.20:burst?.06:.10);
      }
      neck.rotation.y+=T.MathUtils.clamp(.20+draw*.20,0,.40);
      for(const side of ['R','L']) for(const finger of ['Index','Middle','Ring','Little']) for(let joint=1;joint<=3;joint++) {
        const bone=root.getObjectByName(`J_Bip_${side}_${finger}${joint}`);
        const curl=side==='L' ? [0,.85,1.2,.65][joint] : [0,.6,1.2,.65][joint]*tension;
        bone.quaternion.copy(restRotations.get(bone)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),(side==='R'?1:-1)*curl));
      }
      root.updateMatrixWorld(true);
      if(base!==run) {
        feet[0].solve(target.set(-.16-travel*(sideStep?0:.12),.09+(sideStep?0:footLift),-.16-travel*(sideStep?0:.22)),pole.set(-.1,0,1),feet[0].rotation);
        feet[1].solve(target.set(.16+travel*(sideStep?.22:0),.09+(sideStep?footLift:0),.16+travel*(sideStep?.10:0)),pole.set(.1,0,1),feet[1].rotation);
      }
      rotation.setFromEuler(new T.Euler(-lift,0,-.30*(1-draw)+cant*draw,'YXZ'));
      handRotation.copy(rotation).multiply(mountInverse);
      centre.set(.08+travel*(sideStep?.065:-.065),1.18+draw*.205+lift*.18-travel*.02+bob,.30+draw*.11+travel*(sideStep?.03:-.05));
      direction.set(0,0,1).applyQuaternion(rotation);
      target.copy(centre).sub(offset.set(.045,-.012,.025).applyQuaternion(handRotation));
      leftGuide.set(.6,-.6,-.2);rightGuide.set(-1,-.4,0);
      if(sourceWeight) {
        for(const [side,guide] of [['R',rightGuide]]) {
          imported.position(sourceName,sourceTime,`J_Bip_${side}_LowerArm`,elbowGuide);
          imported.position(sourceName,sourceTime,`J_Bip_${side}_UpperArm`,shoulderGuide);
          guide.normalize().lerp(elbowGuide.sub(shoulderGuide).normalize(),.35*sourceMix).normalize();
        }
      }
      left(target,leftGuide,handRotation);
      target.copy(centre).addScaledVector(direction,-.08-draw*.38).sub(offset.set(-.045,-.012,.025).applyQuaternion(handRotation));
      if(sourceWeight) {
        imported.position(sourceName,sourceTime,'J_Bip_R_Hand',offset);
        target.lerp(offset,T.MathUtils.clamp((1-draw)*sourceMix,.0,.65));
        target.x=Math.min(target.x,-.12*(1-draw)+.12*draw);
        target.z=Math.max(target.z,.15*(1-draw)-.06*draw);
      }
      if(base===run)target.set(-.18,1.04+Math.sin(phase*Math.PI*2)*.06,.18+Math.cos(phase*Math.PI*2)*.10);
      right(target,rightGuide,handRotation);
      times.push(seconds);bones.forEach((b,i)=>values[i].push(...b.quaternion.toArray()));positions.push(...hips.position.toArray());
    }
    const tracks=bones.map((b,i)=>new T.QuaternionKeyframeTrack(`${b.name}.quaternion`,times,values[i]));
    tracks.push(new T.VectorKeyframeTrack(`${hips.name}.position`,times,positions));
    return new T.AnimationClip(name,duration,tracks).optimize();
  });
}

// Preview the same early cancels and crossfade used by the playable chain.
export function createComboPreview(T, clips, profile=HEROES.jade) {
  const moves=profile.chain, segments=[];let duration=0;
  for(const move of moves){segments.push({move,start:duration,clip:clips.find(c=>c.name===move.clip)});duration+=Number.isFinite(move.cancel)?move.cancel:move.duration;}
  const times=[], tracks=segments[0].clip.tracks.map(track=>({name:track.name,type:track.ValueTypeName,values:[]}));
  const samples=segments.map(({clip})=>new Map(clip.tracks.map(track=>[track.name,track.createInterpolant()])));
  const a=new T.Quaternion(),b=new T.Quaternion(),p=new T.Vector3(),q=new T.Vector3(),count=Math.ceil(duration*90);
  for(let frame=0;frame<=count;frame++) {
    const at=frame/count*duration;times.push(at);let index=0;
    while(index<segments.length-1&&at>=segments[index+1].start)index++;
    const elapsed=at-segments[index].start,blend=index?Math.min(1,elapsed/(profile.id==='azure'?.14:.08)):1;
    for(const track of tracks) {
      const current=samples[index].get(track.name).evaluate(elapsed);
      const previous=index?samples[index-1].get(track.name).evaluate(segments[index].start-segments[index-1].start+elapsed):current;
      if(track.type==='quaternion') {a.fromArray(previous);b.fromArray(current);a.slerp(b,blend);track.values.push(...a.toArray());}
      else {p.fromArray(previous);q.fromArray(current);p.lerp(q,blend);track.values.push(...p.toArray());}
    }
  }
  return new T.AnimationClip(`${profile.id}Combo`,duration,tracks.map(track=>new (track.type==='quaternion'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack)(track.name,times,track.values))).optimize();
}
