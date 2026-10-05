// Scripted pilot for the MQ-172 light aircraft (flyability tests only; not used by the game). Drives physics.mjs through stepFlight.
// Local frame: -z = runway heading, +x = right of the runway heading; data.heading is in local degrees (0 = runway heading).
import { RUNWAY, stepFlight, getFlightData } from './physics.mjs';

const KT = 1.943844, FT = 3.28084, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = v => ((v + 180) % 360 + 360) % 360 - 180;

// Light circuit in AIRPORT-frame coordinates (x, z), left-hand pattern, 2,900 ft MSL (field 1,401 ft); base/final at 2,300 ft MSL.
export const LIGHT_CIRCUIT = Object.freeze([
  Object.freeze({ x: 0, z: -3500 }), Object.freeze({ x: -2500, z: -3500 }), Object.freeze({ x: -2500, z: 5500 }), Object.freeze({ x: 0, z: 5500 }),
]);
export const LIGHT_CIRCUIT_ALT_FT = 2900, LIGHT_FINAL_ALT_FT = 2300;

// Takeoff on the runway: full power, rotate at 55 kt, climb at 75 kt, flaps up at 300 ft AGL. Returns stepFlight input.
export function takeoffPilot(s, d, { rotateKt = 55, climbKt = 75, flaps = 1 } = {}) {
  const kt = d.indicatedAirspeed * KT;
  const out = { throttle: 1, flaps, trim: s.trim };
  const err = wrap(d.heading) + s.position.x * 0.02;
  if (s.onGround) {
    out.yaw = clamp(-err * 0.05, -0.5, 0.5);
    out.pitch = kt >= rotateKt ? clamp((10 - d.pitch) * 0.12, 0, 0.5) : 0;
    return out;
  }
  out.pitch = clamp((clamp(8 + (climbKt - kt) * 0.25, 4, 10) - d.pitch) * 0.12 - s.angularVelocity.x * 1.5, -0.4, 0.5);
  out.roll = clamp(-d.roll * 0.05 - wrap(d.heading) * 0.02, -0.5, 0.5);
  if (d.agl > 90) out.flaps = 0;
  return out;
}

// Final approach and landing from a few km out (the light version of challenge.pilot.mjs). mem: { flare, ig, il }.
export function approachPilot(s, d, mem, { vref = 65, flareAgl = 6 } = {}) {
  const kt = d.indicatedAirspeed * KT, agl = d.agl;
  const out = { flaps: kt > 100 ? 1 : kt > 85 ? 2 : 3, brake: 0, trim: s.trim };
  if (s.onGround) {
    const err = wrap(d.heading) + s.position.x * 0.02;
    return { ...out, throttle: 0, pitch: 0, roll: 0, yaw: clamp(-err * 0.05, -0.5, 0.5), brake: 1 };
  }
  const loc = d.ilsValid ? d.localizerDeviation : 0;
  const track = wrap(d.groundTrack);
  const trackTarget = clamp(-loc * 4.5, -10, 10) * (agl < 40 ? 0.5 : 1);
  const bankTarget = clamp((trackTarget - track) * 2.5, -22, 22);
  const roll = clamp((bankTarget - d.roll) * 0.055 + s.angularVelocity.z * 1.8, -0.65, 0.65);
  const gs = d.gsValid ? d.glideslopeDeviation : 0;
  let throttle, pitch;
  if (agl < flareAgl || mem.flare) {
    mem.flare = true;
    throttle = 0;
    const vsTarget = -(0.25 + Math.max(0, agl - 1) * 0.2);
    pitch = clamp((vsTarget - d.verticalSpeed) * 0.3, -0.4, 0.5);
  } else {
    const gamma = Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) / RAD;
    mem.il = clamp((mem.il || 0) + gs * 0.004, -1, 1);
    const gammaTarget = -3 - clamp(gs * 2.5 + mem.il, -2, 4);
    pitch = clamp((gammaTarget - gamma) * 0.12 + s.angularVelocity.x * -0.5, -0.45, 0.45);
    mem.ig = clamp((mem.ig || 0) + (vref - kt) * 0.0004, -0.25, 0.25);
    throttle = clamp(0.47 + (vref - kt) * 0.02 + mem.ig, 0, 1);
    if (kt > vref + 15 && gs > 0.3) throttle = 0;
  }
  return { ...out, throttle, pitch, roll, yaw: 0 };
}

// Whole circuit: takeoff, climb, four legs on the autopilot, descent to 2,300 ft, final, flare, landing, brakes.
// Returns { state, data, track (1 s samples), phases, time }. wind is a stepFlight wind vector or a function of time.
export function flyCircuit({ seconds = 900, wind = null, apAltitude = LIGHT_CIRCUIT_ALT_FT, apKt = 90 } = {}, createState) {
  const s = createState(), mem = { flare: false, ig: 0, il: 0 }, track = [], phases = [];
  let phase = 'takeoff', leg = 0, d = getFlightData(s);
  const setPhase = p => { phase = p; phases.push({ phase: p, t: s.elapsed }); };
  setPhase('takeoff');
  const ft = y => (y + RUNWAY.fieldElevation) * FT;
  const local = feet => feet / FT - RUNWAY.fieldElevation;
  for (let i = 0; i < seconds * 120 && !s.crashed; i++) {
    d = getFlightData(s);
    if (i % 120 === 0) track.push({ t: s.elapsed, x: s.position.x, y: s.position.y, z: s.position.z, kt: d.indicatedAirspeed * KT, vs: d.verticalSpeed, phase });
    if (s.touchdown && s.onGround && d.groundSpeed < 1) break;
    let input;
    if (phase === 'takeoff') {
      input = takeoffPilot(s, d);
      if (!s.onGround && d.agl > 150) { setPhase('circuit'); s.autopilot.enabled = true; }
    }
    if (phase === 'circuit') {
      const wp = LIGHT_CIRCUIT[leg];
      const bearing = Math.atan2(wp.x - s.position.x, -(wp.z - s.position.z)) / RAD;
      const dist = Math.hypot(wp.x - s.position.x, wp.z - s.position.z);
      if (dist < 450 && leg < 3) leg++;
      else if (leg === 3 && dist < 400) { setPhase('final'); s.autopilot.enabled = false; mem.leg = 3; }
      const target = (leg >= 2 && s.position.z > 2500) || leg === 3 ? LIGHT_FINAL_ALT_FT : apAltitude;
      const hdg = leg === 3 ? Math.atan2(wp.x - s.position.x, -(wp.z - s.position.z)) / RAD : bearing;
      input = { flaps: 0, autopilot: { enabled: true, heading: ((hdg % 360) + 360) % 360, altitude: local(target), speed: apKt / KT } };
      if (d.agl < 400 && !s.autopilot.enabled) input.autopilot.enabled = true;
    }
    if (phase === 'final') input = approachPilot(s, d, mem);
    stepFlight(s, input, 1 / 120, { wind: typeof wind === 'function' ? wind(s.elapsed) : wind || undefined });
  }
  d = getFlightData(s);
  return { state: s, data: d, track, phases, time: s.elapsed, ft };
}
