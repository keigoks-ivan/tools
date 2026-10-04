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
export function sampleStroke(age, lead, contact, ready, handedness = 'forehand', spin = 1) {
  const backhand = handedness === 'backhand';
  const direction = backhand ? -1 : 1;
  const low = spin < 0;
  const duration = backhand ? 0.33 : 0.43;
  const followTime = backhand ? 0.095 : 0.14;
  const wind = add(contact, [direction * (backhand ? -0.10 : -0.16), low ? 0.05 : backhand ? -0.065 : -0.105, backhand ? -0.11 : -0.20]);
  const follow = add(contact, [direction * (backhand ? 0.11 : 0.19), low ? -0.07 : backhand ? 0.13 : 0.22, backhand ? 0.015 : -0.035]);
  const times = [-lead, -lead * 0.45, 0, followTime, duration];
  const keys = [ready, wind, contact, follow, ready];
  const contactVelocity = [direction * (backhand ? 1.25 : 1.65), low ? -0.7 : backhand ? 0.95 : 1.3, 1.65];
  const tangents = [
    [0, 0, 0],
    mul(sub(contact, ready), 1 / (lead * 0.85)),
    contactVelocity,
    mul(sub(ready, contact), 0.85 / duration),
    [0, 0, 0],
  ];
  if (age <= times[0]) return { center: [...ready], phase: 'windup', load: 0, turn: 0, rise: 0 };
  if (age >= duration) return { center: [...ready], phase: 'ready', load: 0, turn: 0, rise: 0 };
  let segment = 0;
  while (age > times[segment + 1]) segment++;
  const span = times[segment + 1] - times[segment];
  const t = (age - times[segment]) / span;
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
  const h10 = t ** 3 - 2 * t ** 2 + t;
  const h01 = -2 * t ** 3 + 3 * t ** 2;
  const h11 = t ** 3 - t ** 2;
  const center = keys[segment].map((v, i) => h00 * v + h10 * span * tangents[segment][i] + h01 * keys[segment + 1][i] + h11 * span * tangents[segment + 1][i]);
  const before = smoothstep((age + lead) / lead);
  const after = smoothstep(age / 0.22);
  const load = age < 0 ? Math.sin(before * Math.PI * 0.65) : (1 - after) * 0.9;
  const turns = backhand ? [0, -0.19, 0.065, 0.22, 0] : [0, -0.32, 0.10, 0.36, 0];
  const turnTangents = [0, 0, backhand ? 1.5 : 2.0, 0, 0];
  const turn = direction * (h00 * turns[segment] + h10 * span * turnTangents[segment] + h01 * turns[segment + 1] + h11 * span * turnTangents[segment + 1]);
  const rises = [0, -0.025, 0, 0.035, 0];
  const riseTangents = [0, 0, 0.16, 0, 0];
  const rise = h00 * rises[segment] + h10 * span * riseTangents[segment] + h01 * rises[segment + 1] + h11 * span * riseTangents[segment + 1];
  return { center, phase: age < 0 ? 'windup' : age < followTime ? 'follow-through' : 'recovery', load, turn, rise };
}
