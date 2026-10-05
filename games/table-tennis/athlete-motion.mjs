const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smoothstep = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, n) => a.map(v => v * n);
const length = a => Math.hypot(...a);
const unit = a => mul(a, 1 / (length(a) || 1));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);

// Both lengths remain constant, including targets outside the reach envelope.
export function solveTwoBone(origin, target, pole, upperLength, lowerLength) {
  const delta = sub(target, origin);
  const distance = clamp(length(delta), Math.abs(upperLength - lowerLength) + 0.001, upperLength + lowerLength - 0.001);
  const direction = unit(delta);
  let bend = sub(pole, mul(direction, dot(pole, direction)));
  if (length(bend) < 0.0001) bend = sub([0, 0, 1], mul(direction, direction[2]));
  if (length(bend) < 0.0001) bend = [1, 0, 0];
  bend = unit(bend);
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const offset = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  return {
    joint: add(origin, add(mul(direction, along), mul(bend, offset))),
    end: add(origin, mul(direction, distance)),
    reachError: Math.max(0, length(delta) - distance),
  };
}

// Cubic Hermite keys share tangents at contact, so a hit continues the stroke.
export function strokeDuration(handedness = 'forehand', spin = 1, serve = false) {
  if (serve) return 0.30;
  if (spin < -0.1) return 0.33;
  if (handedness === 'backhand') return 0.32;
  return Math.abs(spin) < 0.15 ? 0.37 : 0.47;
}

export function sampleStroke(age, lead, contact, ready, handedness = 'forehand', spin = 1, clip = {}) {
  const backhand = handedness === 'backhand';
  const direction = backhand ? -1 : 1;
  const low = spin < -0.1, flat = Math.abs(spin) < 0.15;
  const shotStyle = low ? 'push' : flat ? 'drive' : 'loop';
  const duration = clip.duration ?? strokeDuration(handedness, spin);
  const followTime = clip.followTime ?? (backhand ? 0.10 : low ? 0.11 : flat ? 0.12 : 0.165);
  const wind = add(contact, clip.wind ?? [direction * (low ? -0.065 : backhand ? -0.08 : flat ? -0.18 : -0.22), low ? 0.10 : flat ? -0.015 : backhand ? -0.050 : -0.155, backhand ? -0.115 : low ? -0.16 : flat ? -0.23 : -0.26]);
  const follow = add(contact, clip.follow ?? [direction * (low ? 0.075 : backhand ? 0.13 : 0.265), low ? -0.13 : flat ? 0.025 : backhand ? 0.085 : 0.265, low ? 0.14 : backhand ? 0.125 : 0.085]);
  const times = [-lead, -lead * (clip.duration ? 0.48 : 0.45), 0, followTime, duration];
  const keys = [ready, wind, contact, follow, clip.recoveryReady ?? ready];
  const contactVelocity = clip.velocity ?? [direction * (low ? 0.65 : backhand ? 1.15 : 2.15), low ? -1.15 : flat ? 0.18 : backhand ? 0.75 : 1.75, low ? 1.7 : backhand ? 2.0 : 2.25];
  const tangents = [
    [0, 0, 0],
    mul(sub(contact, ready), 1 / (lead * 0.85)),
    contactVelocity,
    mul(sub(ready, contact), 0.85 / duration),
    [0, 0, 0],
  ];
  if (age <= times[0]) return { center: [...ready], phase: 'windup', load: 0, turn: 0, rise: 0, shotStyle };
  if (age >= duration) return { center: [...keys[4]], phase: 'ready', load: 0, turn: 0, rise: 0, shotStyle };
  let segment = 0;
  while (age > times[segment + 1]) segment++;
  const span = times[segment + 1] - times[segment];
  const t = (age - times[segment]) / span;
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
  const h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2;
  const h11 = t ** 3 - t ** 2;
  const center = keys[segment].map((v, i) => h00 * v + h10 * span * tangents[segment][i] + h01 * keys[segment + 1][i] + h11 * span * tangents[segment + 1][i]);
  const loads = [0, low ? 0.45 : 0.95, low ? 0.35 : 0.72, 0, 0];
  const load = h00 * loads[segment] + h10 * span * (segment === 2 ? -2 : 0) + h01 * loads[segment + 1] + h11 * span * (segment + 1 === 2 ? -2 : 0);
  const turns = low ? [0, -0.12, 0.025, 0.13, 0] : backhand ? [0, -0.16, 0.055, 0.20, 0] : flat ? [0, -0.35, 0.13, 0.40, 0] : [0, -0.43, 0.14, 0.48, 0];
  const turnTangents = [0, 0, low ? 0.65 : backhand ? 1.5 : 2.6, 0, 0];
  const turn = direction * (h00 * turns[segment] + h10 * span * turnTangents[segment] + h01 * turns[segment + 1] + h11 * span * turnTangents[segment + 1]);
  const rises = low ? [0, -0.008, -0.012, 0.005, 0] : [0, -0.033, 0, backhand ? 0.017 : 0.042, 0];
  const riseTangents = [0, 0, 0.16, 0, 0];
  const rise = h00 * rises[segment] + h10 * span * riseTangents[segment] + h01 * rises[segment + 1] + h11 * span * riseTangents[segment + 1];
  return { center, phase: age < 0 ? 'windup' : age < followTime ? 'follow-through' : 'recovery', load, turn, rise, shotStyle };
}

export function sampleServe(age, lead, contact, ready, recoveryReady = ready) {
  const times = [-lead, -lead * 0.58, -Math.min(0.105, lead * 0.25), 0, 0.105, 0.30];
  const keys = [ready, add(contact, [-0.13, -0.15, -0.34]), add(contact, [-0.16, -0.10, -0.29]), contact, add(contact, [0.08, 0.075, -0.045]), recoveryReady];
  const tangents = [[0, 0, 0], [0, 0, 0], [0.3, 0.4, 1.4], [1.0, 0.65, 2.3], [-0.4, -0.1, -0.5], [0, 0, 0]];
  if (age <= -lead || age >= 0.30) return { center: [...(age < 0 ? ready : recoveryReady)], phase: age < 0 ? 'windup' : 'ready', load: 0, turn: 0, rise: 0, toss: 0 };
  let segment = 0; while (age > times[segment + 1]) segment++;
  const span = times[segment + 1] - times[segment], t = (age - times[segment]) / span;
  const basis = [2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2];
  const sample = (values, slopes) => basis[0] * values[segment] + basis[1] * span * slopes[segment] + basis[2] * values[segment + 1] + basis[3] * span * slopes[segment + 1];
  const center = keys[segment].map((v, i) => sample(keys.map(key => key[i]), tangents.map(key => key[i])));
  const turn = sample([0, -0.26, -0.32, -0.08, 0.14, 0], [0, 0, 0.7, 1.5, 0, 0]);
  const rise = sample([0, -0.012, -0.018, 0.008, 0.022, 0], [0, 0, 0.04, 0.10, 0, 0]);
  const prep = smoothstep((age + lead) / Math.max(0.12, lead * 0.5));
  const tossAge = age + lead - 0.18;
  const toss = tossAge > 0 && tossAge < 0.11 ? Math.sin(tossAge / 0.11 * Math.PI) : 0;
  return { center, phase: age < 0 ? 'windup' : age < 0.105 ? 'follow-through' : 'recovery', load: prep * (1 - smoothstep(age / 0.20)), turn, rise, toss, shotStyle: 'serve' };
}
