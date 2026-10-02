// Character poses are baked once into normal animation tracks. Local players,
// turntables and interpolated teammates therefore use the same choreography.
import { MOCAP } from './mocap-data.js?v=20261002w';
import { HEROES } from './heroes.js?v=20261002w';

// Mixamo motion capture, retargeted offline (assets/animations/README.md), is
// time-warped so each recorded impact lands on the combat clock in heroes.js.
// Every bone keeps its captured motion; only the hips' floor travel is damped
// because the combat code moves the hero.
const parsedMocap = new Map();
function mocap(T, name) {
  if (!parsedMocap.has(name)) {
    const clip = T.AnimationClip.parse(MOCAP[name]);
    parsedMocap.set(name, { clip, samplers: clip.tracks.map(track => ({ name: track.name, sample: track.createInterpolant() })) });
  }
  return parsedMocap.get(name);
}
// warp: [[game seconds, source seconds], ...]; linear between keys, then
// continued at the last rate so an outgoing segment keeps moving through a fade.
function warpTime(warp, t, duration) {
  if (t <= warp[0][0]) return warp[0][1];
  let i = 0; while (i < warp.length - 2 && t > warp[i + 1][0]) i++;
  const [t0, s0] = warp[i], [t1, s1] = warp[i + 1];
  return Math.min(duration, Math.max(0, s0 + (t - t0) * (s1 - s0) / (t1 - t0)));
}
function samplePose(T, segment, t, rest) {
  const { clip, samplers } = mocap(T, segment.clip), at = warpTime(segment.warp, t, clip.duration), pose = new Map();
  for (const { name, sample } of samplers) pose.set(name, Array.from(sample.evaluate(at)));
  const hips = pose.get('J_Bip_C_Hips.position');
  if (hips) {
    // Damped floor travel: a step still shifts the weight, a slide no longer drags the hero off its mark.
    const origin = samplers.find(s => s.name === 'J_Bip_C_Hips.position').sample.evaluate(segment.warp[0][1]);
    let dx = (hips[0] - origin[0]) * .3, dz = (hips[2] - origin[2]) * .3; const d = Math.hypot(dx, dz);
    if (d > .12) { dx *= .12 / d; dz *= .12 / d; }
    hips[0] = rest.x + dx; hips[2] = rest.z + dz;
  }
  return pose;
}
const qa = [0, 0, 0, 0];
function blendPose(T, from, to, w) {
  const a = new T.Quaternion(), b = new T.Quaternion();
  for (const [name, value] of to) {
    const old = from.get(name); if (!old) continue;
    if (value.length === 4) { a.fromArray(old); b.fromArray(value); a.slerp(b, w); a.toArray(qa); value.splice(0, 4, ...qa); }
    else for (let i = 0; i < value.length; i++) value[i] = old[i] + (value[i] - old[i]) * w;
  }
  return to;
}
function sampleSegments(T, segments, t, rest) {
  let i = 0; while (i < segments.length - 1 && t >= segments[i + 1].warp[0][0]) i++;
  const segment = segments[i], pose = samplePose(T, segment, t, rest), since = t - segment.warp[0][0], fade = segment.fade ?? .1;
  if (i === 0 || since >= fade) return pose;
  return blendPose(T, samplePose(T, segments[i - 1], t, rest), pose, T.MathUtils.smoothstep(since / fade, 0, 1));
}
const LOWER_BODY = /^J_Bip_(C_Hips|[LR]_(UpperLeg|LowerLeg|Foot|ToeBase))\./;
// A bone-only copy of the rig answers "where are the feet" for a sampled pose
// without touching the source model.
const floorRigs = new WeakMap();
function floorRig(T, source) {
  if (!floorRigs.has(source)) {
    const rig = source.clone(true); rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.set(1, 1, 1); rig.updateMatrixWorld(true);
    const legs = ['Hips', 'L_UpperLeg', 'L_LowerLeg', 'R_UpperLeg', 'R_LowerLeg'].map(n => rig.getObjectByName(`J_Bip_${n.includes('_') ? n : `C_${n}`}`));
    const feet = ['L', 'R'].map(side => rig.getObjectByName(`J_Bip_${side}_Foot`));
    floorRigs.set(source, { rig, legs, feet, floor: Math.min(...feet.map(f => f.getWorldPosition(new T.Vector3()).y)) - .015, point: new T.Vector3() });
  }
  return floorRigs.get(source);
}
// Crossfading a tall stance into a crouch can sink a foot; lift the hips just enough.
function keepFeetAboveFloor(T, source, pose) {
  const { rig, legs, feet, floor, point } = floorRig(T, source), hips = pose.get('J_Bip_C_Hips.position');
  if (!hips) return;
  for (const bone of legs) { const value = pose.get(`${bone.name}.quaternion`); if (value) bone.quaternion.fromArray(value); }
  legs[0].position.fromArray(hips); rig.updateMatrixWorld(true);
  const low = Math.min(...feet.map(foot => foot.getWorldPosition(point).y));
  if (low < floor) hips[1] += (floor - low) / rig.getObjectByName('J_Bip_C_Hips').parent.getWorldScale(point).y;
}
// lower: segments that supply the hips and legs (jump, back-step) under the shot.
// overlay(t): [[bone, rotation]] — a world-space turn applied on top of the capture.
function bakeMocap(T, source, name, duration, segments, { lower, overlay } = {}) {
  const rest = source.getObjectByName('J_Bip_C_Hips').position, count = Math.ceil(duration * 60), times = [], values = new Map();
  const q = new T.Quaternion(), parent = new T.Quaternion();
  // World rotation of a bone's parent in the sampled pose (rest rotation where a bone is not animated).
  const parentWorld = (bone, pose) => {
    parent.identity(); const chain = []; for (let node = source.getObjectByName(bone).parent; node; node = node.parent) chain.unshift(node);
    for (const node of chain) { const value = pose.get(`${node.name}.quaternion`); parent.multiply(value ? q.fromArray(value) : node.quaternion); }
    return parent;
  };
  for (let frame = 0; frame <= count; frame++) {
    const t = frame / count * duration, pose = sampleSegments(T, segments, t, rest);
    if (lower) for (const [track, value] of sampleSegments(T, lower, t, rest)) if (LOWER_BODY.test(track)) pose.set(track, value);
    if (overlay) for (const [bone, rotation] of overlay(t)) {
      const value = pose.get(`${bone}.quaternion`); if (!value) continue;
      const frame = parentWorld(bone, pose).clone();
      q.fromArray(value).premultiply(frame).premultiply(rotation).premultiply(frame.invert()).toArray(qa); value.splice(0, 4, ...qa);
    }
    keepFeetAboveFloor(T, source, pose);
    times.push(t);
    for (const [track, value] of pose) { if (!values.has(track)) values.set(track, []); values.get(track).push(...value); }
  }
  const tracks = [...values].map(([track, v]) => new (v.length / times.length === 4 ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack)(track, times, v));
  // Keep quaternion hemispheres continuous so interpolation never takes the long way round.
  for (const track of tracks) if (track instanceof T.QuaternionKeyframeTrack) for (let i = 4; i < track.values.length; i += 4) {
    const v = track.values, dot = v[i] * v[i - 4] + v[i + 1] * v[i - 3] + v[i + 2] * v[i - 2] + v[i + 3] * v[i - 1];
    if (dot < 0) for (let k = 0; k < 4; k++) v[i + k] = -v[i + k];
  }
  return new T.AnimationClip(name, duration, tracks).optimize();
}
const loop = (T, source, name, clip) => bakeMocap(T, source, name, mocap(T, clip).clip.duration, [{ clip, warp: [[0, 0], [1, 1]] }]);

// Great sword (蒼鋒). Source seconds come from the right-hand speed peak of each
// capture; game seconds are the chain clocks in heroes.js.
export function createGreatswordClips(T, source) {
  if (!source.getObjectByName('J_Bip_R_Hand')) return [];
  const moves = [
    ['azureSweep', .70, [{ clip: 'gs_slash_3', warp: [[0, .20], [.28, .80], [.70, 1.40]] }]],
    ['azureRise', .76, [{ clip: 'gs_slide_attack', warp: [[0, 1.0], [.30, 1.47], [.76, 2.13]] }]],
    ['azureSlam', 1.12, [{ clip: 'gs_casting', warp: [[0, .27], [.30, .63], [.40, 1.5], [.68, 2.35], [.85, 2.9], [1.12, 4.1]] }]],
    ['azureGuard', .68, [{ clip: 'gs_attack', warp: [[0, .30], [.24, .47], [.68, 1.05]] }]],
    // 蒼龍裂陣: gather, sweep (0.9 s), rising cut (1.65 s), double spin (2.4 s), leap and slam (3.05 s).
    ['azureUlt', 3.6, [
      { clip: 'gs_power_up', warp: [[0, .15], [.62, 1.15]] },
      { clip: 'gs_slash_3', fade: .15, warp: [[.58, .45], [.90, .80], [1.20, 1.20]] },
      { clip: 'gs_slide_attack', fade: .12, warp: [[1.25, 1.10], [1.65, 1.41], [1.85, 1.62]] },
      { clip: 'gs_high_spin_attack', fade: .15, warp: [[1.85, .20], [2.08, .43], [2.40, 1.10], [2.55, 1.25]] },
      { clip: 'gs_jump_attack', fade: .12, warp: [[2.50, .40], [3.05, 1.20], [3.35, 1.50], [3.60, 2.0]] },
    ]],
  ];
  return [loop(T, source, 'azureIdle', 'gs_idle_2'), loop(T, source, 'azureRun', 'gs_run'), ...moves.map(([name, duration, segments]) => bakeMocap(T, source, name, duration, segments))];
}

// Longbow (翠翎). The capture nocks at 0.55 s and reaches full draw at 1.0 s of
// the draw clip, and looses at 0.19 s of the recoil clip. Each shot plays draw
// then release so the release frame sits on the move's hit time; later arrows
// start from the quiver reach at 0.30 s.
const DRAW = 'lb_standing_draw_arrow', RECOIL = 'lb_standing_aim_recoil';
function volley(hits, duration) {
  const segments = []; let from = 0;
  hits.forEach((hit, i) => {
    const lead = hit - from, next = hits[i + 1];
    segments.push({ clip: DRAW, fade: .08, warp: [[from, i ? .30 : lead >= .55 ? .15 : lead >= .36 ? .40 : .55], [hit - .03, 1]] });
    const end = next === undefined ? duration : hit + Math.min(.12, (next - hit) * .35);
    segments.push({ clip: RECOIL, fade: .03, warp: [[hit - .03, .16], [hit, .19], [end, next === undefined ? .70 : .34]] });
    from = end;
  });
  return segments;
}
export function createArcherClips(T, source) {
  if (!source.getObjectByName('J_Bip_L_Hand')) return [];
  const profile = HEROES.jade, moves = [...new Map([...profile.chain, ...profile.charges, profile.counter, profile.air].map(move => [move.clip, move])).values()];
  const clips = [loop(T, source, 'jadeIdle', 'lb_standing_idle_01'), loop(T, source, 'jadeRun', 'lb_standing_run_forward')];
  for (const move of moves) {
    const lower = move.clip === 'jadeAir' ? [{ clip: 'lb_fall_a_loop', warp: [[0, 0], [1, 1]] }]
      : move.clip === 'jadeGuard' ? [{ clip: 'lb_standing_dodge_backward', warp: [[0, .10], [move.duration, .95]] }] : undefined;
    clips.push(bakeMocap(T, source, move.clip, move.duration, volley(move.hits, move.duration), { lower }));
  }
  // 翠羽天雨: an upward volley at 0.65 s, a held stance while the rain falls, the finishing shot at 2.75 s.
  const up = new T.Quaternion(), axis = new T.Vector3(1, 0, 0);
  clips.push(bakeMocap(T, source, 'jadeUlt', 3.6, [
    { clip: DRAW, warp: [[0, .15], [.62, 1]] },
    { clip: RECOIL, fade: .03, warp: [[.62, .16], [.65, .19], [1.25, .70]] },
    { clip: 'lb_standing_idle_01', fade: .2, warp: [[1.25, 0], [2.05, .8]] },
    { clip: DRAW, fade: .15, warp: [[2.05, .15], [2.72, 1]] },
    { clip: RECOIL, fade: .03, warp: [[2.72, .16], [2.75, .19], [3.6, .70]] },
  ], { overlay: t => {
    // Lean back from the waist so the arrow line rises toward the sky (the hero faces +Z).
    up.setFromAxisAngle(axis, -.85 * T.MathUtils.smoothstep(t, .1, .45) * (1 - T.MathUtils.smoothstep(t, .85, 1.2))); return [['J_Bip_C_Spine', up]];
  } }));
  return clips;
}

// Dual blades (金燕). Captures: a dual-weapon combo, a one-handed sword combo,
// a double-dagger stab, a backflip kick and a running twist flip. Source seconds
// are hand-speed peaks; one strike per cut so consecutive cuts never repeat.
export function createDualBladeClips(T, source) {
  if (!source.getObjectByName('J_Bip_L_Hand')) return [];
  const DUAL = 'am_dual_weapon_combo', ONE = 'am_one_hand_sword_combo', STAB = 'am_double_dagger_stab', FLIP = 'am_flip_kick', TWIST = 'am_front_twist_flip';
  const moves = [
    ['amberCut1', .32, [{ clip: DUAL, warp: [[0, .50], [.12, .70], [.32, .90]] }]],
    ['amberCut2', .32, [{ clip: DUAL, warp: [[0, .90], [.12, 1.10], [.32, 1.32]] }]],
    ['amberCut3', .32, [{ clip: ONE, warp: [[0, .78], [.12, 1.00], [.32, 1.25]] }]],
    ['amberCut4', .32, [{ clip: ONE, warp: [[0, 1.75], [.12, 1.97], [.32, 2.20]] }]],
    ['amberCut5', .32, [{ clip: DUAL, warp: [[0, 1.55], [.12, 1.78], [.32, 2.00]] }]],
    // Sixth cut: a running twist flip with a blade on the way up and on the way down.
    ['amberCut6', .56, [{ clip: TWIST, warp: [[0, .40], [.12, .64], [.34, 1.40], [.56, 1.62]] }]],
    ['amberStab', .50, [{ clip: STAB, warp: [[0, .35], [.10, .50], [.23, .80], [.37, 1.13], [.50, 1.35]] }]],
    ['amberFlip', .50, [{ clip: FLIP, warp: [[0, .10], [.10, .23], [.23, .62], [.37, 1.20], [.50, 1.45]] }]],
    ['amberHeavy', .52, [{ clip: STAB, warp: [[0, .95], [.13, 1.13], [.33, 1.77], [.52, 2.05]] }]],
    ['amberCounter', .34, [{ clip: DUAL, warp: [[0, 2.50], [.10, 2.70], [.34, 3.00]] }]],
    // 金燕八閃: eight cuts on the flurry beats (0.38 s, then every 0.239 s), the fifth
    // and sixth in a mid-air twist, then both blades cross at 2.35 s.
    ['amberUlt', 2.8, [
      { clip: DUAL, warp: [[0, .20], [.38, .70]] },
      { clip: DUAL, fade: .08, warp: [[.50, .92], [.62, 1.10]] },
      { clip: ONE, fade: .08, warp: [[.74, .80], [.86, 1.00]] },
      { clip: ONE, fade: .08, warp: [[.97, 1.80], [1.09, 1.97]] },
      { clip: TWIST, fade: .10, warp: [[1.18, .45], [1.33, .67], [1.57, 1.13], [1.70, 1.30]] },
      { clip: STAB, fade: .10, warp: [[1.68, .95], [1.81, 1.13]] },
      { clip: ONE, fade: .08, warp: [[1.93, 2.80], [2.05, 3.00]] },
      { clip: DUAL, fade: .18, warp: [[2.10, 1.55], [2.35, 1.79], [2.80, 2.30]] },
    ]],
  ];
  return moves.map(([name, duration, segments]) => bakeMocap(T, source, name, duration, segments));
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
