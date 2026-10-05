// Scripted approach pilot for the landing-challenge flyability tests (not used by the game). Flies through stepFlight at 120 Hz.
import { RUNWAY, stepFlight, getFlightData } from './physics.mjs';
import { createLevelState, windAt, grade } from './challenge.mjs';

const KT = 1.943844, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function flyLevel(level, { seconds = 260, vref = 140, ground = 0 } = {}) {
  const s = createLevelState(level), mem = { flare: false, ig: 0, il: 0 };
  let data = getFlightData(s);
  for (let i = 0; i < seconds * 120 && !s.crashed; i++) {
    data = getFlightData(s);
    if (s.touchdown && s.onGround && data.groundSpeed < 2.5) break;
    stepFlight(s, pilot(s, data, mem, vref), 1 / 120, { wind: windAt(level, s.elapsed), groundElevation: ground });
  }
  data = getFlightData(s);
  return { state: s, data, result: grade(s, data), time: s.elapsed };
}

export function pilot(s, d, mem, vref) {
  const kt = d.indicatedAirspeed * KT, agl = d.agl;
  const out = { gear: true, flaps: 3, spoilers: false, brake: 0, trim: s.trim };
  if (s.onGround) {
    // rollout: idle, spoilers, brakes, keep the nose on the centreline
    const err = (d.heading > 180 ? d.heading - 360 : d.heading) + s.position.x * 0.02;
    return { ...out, throttle: 0, pitch: 0, roll: 0, yaw: clamp(-err * 0.05, -.5, .5), spoilers: true, brake: 1 };
  }
  // configuration: flaps and gear come down as speed allows (flap limits 212 / 190 / 169 kt)
  out.gear = true; out.flaps = kt > 205 ? 1 : kt > 180 ? 2 : 3;
  if (s.challenge === 6 && kt > 175) out.flaps = Math.min(out.flaps, kt > 200 ? 1 : 2);
  // lateral: converge on the course through ground track, bank-limited
  const loc = d.ilsValid ? d.localizerDeviation : 0;
  const track = ((d.groundTrack + 180) % 360) - 180;
  const trackTarget = clamp(-loc * 4.5, -10, 10) * (agl < 60 ? 0.5 : 1);
  const bankTarget = clamp((trackTarget - track) * 2.5, -22, 22);
  const roll = clamp((bankTarget - d.roll) * 0.055 + s.angularVelocity.z * 1.8, -.65, .65);
  // vertical
  const gs = d.gsValid ? d.glideslopeDeviation : 0;
  let throttle, pitch;
  const vt = kt > vref + 8 || gs > 0.4 ? vref : vref;
  if (agl < 25 || mem.flare) {
    mem.flare = true;
    throttle = 0;
    const vsTarget = -(0.5 + Math.max(0, agl - 4) * 0.14);
    pitch = clamp((vsTarget - d.verticalSpeed) * 0.3, -.4, .5);
  } else {
    const gamma = Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) * 180 / Math.PI;
    mem.il = clamp(mem.il + gs * 0.004, -1, 1);
    const gammaTarget = -3 - clamp(gs * 2.5 + mem.il, -2, 4);
    pitch = clamp((gammaTarget - gamma) * 0.12 + s.angularVelocity.x * -0.5, -.45, .45);
    mem.ig = clamp(mem.ig + (vt - kt) * 0.0004 / 120 * 120 * 0.01 * 120 / 120, -.25, .25);
    throttle = clamp(0.22 + (vt - kt) * 0.012 + mem.ig, 0, 1);
    if (kt > vt + 20 && gs > 0.3) throttle = 0;
    out.spoilers = gs > 0.35 && kt < 200 || kt > vt + 25;
    if (agl < 150) out.spoilers = false;
  }
  return { ...out, throttle, pitch, roll, yaw: 0 };
}
