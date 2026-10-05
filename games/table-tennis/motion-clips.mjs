// Hand-authored whole-body poses guided by visible WTT 2D frames. These are
// animation designs, not recovered 3D motion capture or measured player traits.
const copy = value => Array.isArray(value) ? value.map(copy) : typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
const pose = (ready, patch) => ({ ...copy(ready), ...patch });

const lin = {
  hips: [0, 0.765, -0.025], hipYaw: 0, chest: [0.56, 0, 0], neck: [-0.38, 0, 0],
  playingElbow: [-0.30, 0.865, 0.31], freeElbow: [0.33, 0.87, 0.27], freeHand: [0.30, 0.835, 0.51],
  wrist: [0.33, 0, -0.32], freePalm: 2.6, shoulders: [-0.012, -0.014],
  knees: [[-0.25, 0.405, 0.20], [0.25, 0.435, 0.23]], feet: [[-0.30, -0.055], [0.30, 0.050]], footYaw: [-0.10, 0.17],
  paddleReady: [-0.14, 1.01, 0.56],
};
const harimoto = {
  hips: [0, 0.782, -0.006], hipYaw: 0, chest: [0.62, 0, 0], neck: [-0.44, 0, 0],
  playingElbow: [-0.27, 0.885, 0.325], freeElbow: [0.32, 0.895, 0.275], freeHand: [0.295, 0.85, 0.53],
  wrist: [0.28, 0.04, -0.12], freePalm: 2.5, shoulders: [-0.017, -0.020],
  knees: [[-0.26, 0.43, 0.23], [0.26, 0.43, 0.23]], feet: [[-0.315, -0.022], [0.315, 0.025]], footYaw: [-0.13, 0.13],
  paddleReady: [-0.055, 1.055, 0.57],
};

const linFore = [lin,
  pose(lin, { hips: [-0.055, 0.744, -0.035], hipYaw: -0.38, chest: [0.59, -0.25, -0.025], playingElbow: [-0.425, 0.905, 0.25], freeElbow: [0.34, 0.89, 0.27], freeHand: [0.39, 0.90, 0.51], wrist: [0.36, -0.10, -0.45], knees: [[-0.27, 0.36, 0.18], [0.22, 0.44, 0.24]], footYaw: [-0.20, 0.10] }),
  pose(lin, { hips: [-0.005, 0.752, 0.008], hipYaw: 0.065, chest: [0.53, 0.13, 0.01], playingElbow: [-0.31, 0.965, 0.37], freeElbow: [0.35, 0.87, 0.28], freeHand: [0.36, 0.835, 0.42], wrist: [0.22, 0.05, -0.30], knees: [[-0.24, 0.39, 0.23], [0.25, 0.40, 0.23]] }),
  pose(lin, { hips: [0.065, 0.785, 0.008], hipYaw: 0.27, chest: [0.49, 0.22, 0.035], playingElbow: [-0.18, 1.06, 0.49], freeElbow: [0.35, 0.85, 0.16], freeHand: [0.40, 0.80, 0.10], wrist: [0.30, 0.25, 0.28], freePalm: 2.8, knees: [[-0.24, 0.445, 0.22], [0.26, 0.39, 0.25]], footYaw: [0.04, 0.25] }), lin];
const linBack = [lin,
  pose(lin, { hips: [0.024, 0.742, -0.018], hipYaw: 0.11, chest: [0.61, 0.11, -0.01], playingElbow: [-0.16, 0.91, 0.43], freeElbow: [0.34, 0.88, 0.28], freeHand: [0.35, 0.89, 0.51], wrist: [0.43, 0.04, 0.19] }),
  pose(lin, { hips: [0.008, 0.750, 0.008], hipYaw: -0.035, chest: [0.56, -0.07, 0], playingElbow: [-0.125, 0.96, 0.475], freeElbow: [0.35, 0.86, 0.29], freeHand: [0.36, 0.82, 0.47], wrist: [0.25, 0.02, 0.20] }),
  pose(lin, { hips: [-0.025, 0.768, 0.013], hipYaw: -0.10, chest: [0.53, -0.09, 0.015], playingElbow: [-0.13, 1.01, 0.55], freeElbow: [0.34, 0.85, 0.27], freeHand: [0.33, 0.82, 0.40], wrist: [0.18, -0.05, 0.26], freePalm: 2.6 }), lin];
const harFore = [harimoto,
  pose(harimoto, { hips: [-0.038, 0.759, -0.015], hipYaw: -0.25, chest: [0.65, -0.18, -0.02], playingElbow: [-0.36, 0.94, 0.29], freeElbow: [0.34, 0.90, 0.30], freeHand: [0.34, 0.89, 0.52], wrist: [0.30, -0.08, -0.26] }),
  pose(harimoto, { hips: [0.012, 0.773, 0.024], hipYaw: 0.095, chest: [0.60, 0.10, 0.015], playingElbow: [-0.28, 0.985, 0.42], freeElbow: [0.33, 0.87, 0.29], freeHand: [0.35, 0.825, 0.46], wrist: [0.19, 0.02, -0.12] }),
  pose(harimoto, { hips: [0.045, 0.788, 0.015], hipYaw: 0.21, chest: [0.57, 0.14, 0.02], playingElbow: [-0.175, 1.06, 0.50], freeElbow: [0.35, 0.86, 0.20], freeHand: [0.35, 0.81, 0.14], wrist: [0.26, 0.14, 0.15] }), harimoto];
const harBack = [harimoto,
  pose(harimoto, { hips: [0.017, 0.757, 0.004], hipYaw: 0.075, chest: [0.68, 0.095, -0.015], playingElbow: [-0.155, 0.92, 0.46], freeElbow: [0.34, 0.89, 0.31], freeHand: [0.34, 0.88, 0.52], wrist: [0.43, 0.02, 0.29], knees: [[-0.27, 0.395, 0.24], [0.26, 0.395, 0.24]] }),
  pose(harimoto, { hips: [0.006, 0.768, 0.037], hipYaw: -0.045, chest: [0.62, -0.08, 0], playingElbow: [-0.15, 0.96, 0.505], freeElbow: [0.34, 0.87, 0.31], freeHand: [0.36, 0.83, 0.46], wrist: [0.21, -0.03, 0.28] }),
  pose(harimoto, { hips: [-0.019, 0.788, 0.024], hipYaw: -0.105, chest: [0.59, -0.10, 0.012], playingElbow: [-0.12, 1.00, 0.575], freeElbow: [0.34, 0.86, 0.30], freeHand: [0.34, 0.82, 0.42], wrist: [0.16, -0.05, 0.32] }), harimoto];

export const MOTION_PROFILES = Object.freeze({
  'lin-yun-ju': { ready: lin, forehand: linFore, backhand: linBack, tempo: 1, stepTime: 0.145 },
  harimoto: { ready: harimoto, forehand: harFore, backhand: harBack, tempo: 0.82, stepTime: 0.115 },
});
export const resolveMotionProfile = id => id === 'harimoto' || id === 'tomokazu-harimoto' ? 'harimoto' : 'lin-yun-ju';
export const readyBodyPose = id => copy(MOTION_PROFILES[resolveMotionProfile(id)].ready);

export function motionDefinition(id, handedness = 'forehand', shotType = 'loop', serve = false, shortReceive = false) {
  const profile = MOTION_PROFILES[resolveMotionProfile(id)], back = handedness === 'backhand';
  const keys = profile[back ? 'backhand' : 'forehand'].map(copy);
  const short = shotType === 'flick', push = shotType === 'push', block = shotType === 'block';
  const flat = ['drive', 'counter', 'block'].includes(shotType);
  if (push || block) for (let i = 1; i <= 3; i++) {
    keys[i].hipYaw *= push ? 0.35 : 0.22; keys[i].chest[1] *= 0.35;
    keys[i].hips[1] -= push ? 0.014 : 0;
    keys[i].playingElbow[0] = back ? -0.17 : block ? -0.38 : -0.29;
    keys[i].playingElbow[1] -= push ? 0.045 : 0;
    keys[i].wrist[0] = push ? -0.28 : 0.18;
  }
  if (short || shortReceive && !serve) for (let i = 1; i <= 3; i++) {
    keys[i].hips[2] += short ? 0.11 : 0.07; keys[i].hips[1] -= short ? 0.035 : 0.015;
    keys[i].chest[0] += short ? 0.11 : 0.065; keys[i].playingElbow[2] += short ? 0.14 : 0.075;
    keys[i].playingElbow[1] += short ? i === 1 ? 0.11 : 0.05 : 0;
    keys[i].feet[0][1] += short ? 0.22 : 0.17;
    if (short && i === 1) keys[i].hips[2] -= 0.13;
    // Knee poles follow the planted foot's facing, including the forward step.
    keys[i].knees = keys[i].feet.map(([x, z], leg) => {
      const hipX = keys[i].hips[0] + (leg ? 0.097 : -0.097) * Math.cos(keys[i].hipYaw);
      const hipZ = keys[i].hips[2] - (leg ? 0.097 : -0.097) * Math.sin(keys[i].hipYaw);
      return [(hipX + x) * 0.5 + Math.sin(keys[i].footYaw[leg]) * 0.23, (keys[i].hips[1] + 0.047) * 0.5, (hipZ + z) * 0.5 + Math.cos(keys[i].footYaw[leg]) * 0.23];
    });
    keys[i].freeHand = [0.32, 0.87, 0.50]; keys[i].freeElbow = [0.33, 0.80, 0.29];
    if (short) {
      keys[i].wrist[0] = i === 1 ? 0.55 : 0.05;
      // Keep the flick elbow beside the shoulder, then extend across and up.
      // A pole far ahead of the grip projects into an overhead IK bend.
      keys[i].playingElbow = i === 1 ? [-0.30, 1.02, 0.40] : i === 2 ? [-0.28, 1.03, 0.47] : [-0.26, 1.00, 0.55];
    }
  }
  if (serve) {
    const r = profile.ready;
    const held = { hips: [0, 0.79, 0.08], chest: [0.43, -0.12, 0], playingElbow: [-0.30, 0.94, 0.27], freeElbow: [0.31, 0.96, 0.38], freeHand: [0.04, 1.055, 0.625], freePalm: 1.35 };
    return { keys: [pose(r, { ...held, hipYaw: 0 }), pose(r, { ...held, hipYaw: -0.20 }), pose(r, { hips: [-0.018, 0.785, 0.13], hipYaw: 0.01, chest: [0.44, -0.025, 0], playingElbow: [-0.24, 0.94, 0.48], freeHand: [0.28, 0.90, 0.29], freeElbow: [0.39, 0.91, 0.24], freePalm: 1.90 }), pose(r, { hips: [0.02, 0.785, 0.075], hipYaw: 0.10, chest: [0.48, 0.09, 0], playingElbow: [-0.23, 0.995, 0.45], freeHand: [0.30, 0.89, 0.29] }), r], followTime: 0.105, duration: 0.30 };
  }
  const followTime = (back ? 0.115 : push ? 0.11 : flat ? 0.13 : 0.175) * profile.tempo;
  const duration = (block ? 0.24 : short ? 0.35 : push ? 0.34 : back ? 0.36 : flat ? 0.40 : 0.49) * profile.tempo;
  return {
    keys, followTime, duration,
    wind: [block ? back ? 0.03 : -0.035 : back ? 0.07 : push ? -0.075 : -0.12, short ? 0.045 : push ? 0.09 : flat ? -0.02 : back ? -0.06 : -0.105, block ? -0.04 : back ? -0.12 : -0.10],
    follow: [short ? -0.16 : back ? -0.115 : push ? 0.08 : 0.245, short ? 0.12 : push ? -0.115 : flat ? 0.025 : back ? 0.09 : 0.235, short ? 0.17 : block ? 0.085 : back ? 0.14 : 0.085],
    velocity: [back ? -1.15 : push ? 0.70 : 2.0, push ? -1.1 : flat ? 0.2 : back ? 0.9 : 1.7, short ? 2.15 : block ? 1.0 : 2.1],
  };
}

const blendShape = (a, b, c, d, weights, span, beforeSpan, afterSpan) => {
  if (Array.isArray(b)) return b.map((value, i) => blendShape(a?.[i], value, c[i], d?.[i], weights, span, beforeSpan, afterSpan));
  if (typeof b === 'object') return Object.fromEntries(Object.keys(b).map(key => [key, blendShape(a?.[key], b[key], c[key], d?.[key], weights, span, beforeSpan, afterSpan)]));
  const firstSlope = a === undefined ? 0 : (c - a) / beforeSpan;
  const lastSlope = d === undefined ? 0 : (d - b) / afterSpan;
  return weights[0] * b + weights[1] * span * firstSlope + weights[2] * c + weights[3] * span * lastSlope;
};

export function sampleBodyClip(id, age, lead, handedness = 'forehand', shotType = 'loop', serve = false, shortReceive = false) {
  const definition = motionDefinition(id, handedness, shotType, serve, shortReceive);
  const times = [-lead, -lead * (serve ? 0.42 : 0.48), 0, definition.followTime, definition.duration];
  if (age <= -lead) return copy(definition.keys[0]);
  if (age >= definition.duration) return copy(definition.keys[4]);
  let i = 0; while (age > times[i + 1]) i++;
  const span = times[i + 1] - times[i], t = (age - times[i]) / span;
  return blendShape(definition.keys[i - 1], definition.keys[i], definition.keys[i + 1], definition.keys[i + 2], [2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2], span, times[i + 1] - times[i - 1], times[i + 2] - times[i]);
}

export function blendBodyPose(a, b, t) {
  if (Array.isArray(a)) return a.map((value, i) => blendBodyPose(value, b[i], t));
  if (typeof a === 'object') return Object.fromEntries(Object.keys(a).map(key => [key, blendBodyPose(a[key], b[key], t)]));
  return a + (b - a) * t;
}
