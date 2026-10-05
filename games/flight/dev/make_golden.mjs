// Generates dev/golden.jet.json: exact full-state samples of the JET model. Run ONCE on unmodified jet physics;
// golden.test.mjs then asserts the jet branch stays bit-identical. Re-running after a physics change would hide a regression.
//   node games/flight/dev/make_golden.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createFlightState, stepFlight, getFlightData } from '../physics.mjs';
import { AIRPORT } from '../airport.mjs';
import { LEVELS } from '../challenge.mjs';
import { flyLevel, pilot } from '../challenge.pilot.mjs';
import { nextStep, autoConfig, ilsCue, approachBoxes } from '../novice.mjs';

const KT = 1.943844, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = o => JSON.parse(JSON.stringify(o));

// Run a scripted flight; every 0.5 s record the full state, the instrument data, and optional extras.
export function record(state, script, seconds, { env = () => ({}), extra = null } = {}) {
  const out = [];
  for (let i = 0; i <= seconds * 120 && !state.crashed; i++) {
    if (i % 60 === 0) out.push({ t: i / 120, state: clone(state), data: clone(getFlightData(state)), ...(extra ? { extra: extra(state) } : {}) });
    stepFlight(state, script(state, i / 120), 1 / 120, env(state, i / 120));
  }
  out.push({ t: 'end', state: clone(state), data: clone(getFlightData(state)) });
  return out;
}

const takeoffScript = (s, t) => {
  const d = getFlightData(s), kt = d.indicatedAirspeed * KT;
  const err = (d.heading > 180 ? d.heading - 360 : d.heading) + s.position.x * 0.02;
  const inp = { throttle: 1, flaps: 1, gear: s.gear, yaw: s.onGround ? clamp(-err * 0.05, -.5, .5) : 0, trim: 0.15 };
  if (kt > 140) inp.pitch = clamp((10 - d.pitch) * 0.08 - s.angularVelocity.x * 1.5, -.4, .6);
  if (d.agl > 25 && d.verticalSpeed > 1) inp.gear = false;
  if (!s.onGround && kt > 165) inp.flaps = 0;
  if (!s.onGround) inp.roll = clamp(-d.roll * 0.05, -.5, .5);
  return inp;
};
const approachScript = (mem) => (s) => pilot(s, getFlightData(s), mem, 140);

export function build() {
const out = { version: 1, scenarios: {}, runs: {}, levels: {}, novice: {} };
for (const sc of ['runway', 'approach', 'cruise']) out.scenarios[sc] = clone(createFlightState(sc));

out.runs.takeoff = record(createFlightState('runway'), takeoffScript, 110);

{
  const mem = { flare: false, ig: 0, il: 0 }, s = createFlightState('approach');
  const arr = [];
  const rec = record(s, (st) => { const d = getFlightData(st); return st.touchdown && st.onGround && d.groundSpeed < 2.5 ? { throttle: 0, brake: 1 } : pilot(st, d, mem, 140); }, 230);
  out.runs.approachLanding = rec;
}
{
  const s = createFlightState('cruise'); s.autopilot.enabled = true;
  out.runs.cruiseAutopilot = record(s, (st, t) => ({ autopilot: t === 0 ? { enabled: true, heading: 40, altitude: 2200, speed: 130 } : t >= 59.9 && t < 60 ? { heading: 300, altitude: 1500, speed: 110 } : undefined }), 150);
}
out.runs.stall = record(createFlightState('cruise'), (s, t) => ({ throttle: t < 5 ? 0.2 : 0, pitch: t < 5 ? 0 : 0.3, flaps: 0 }), 70);
out.runs.stallFlaps3 = record((() => { const s = createFlightState('approach'); return s; })(), (s, t) => ({ throttle: 0, pitch: t < 3 ? 0 : 0.35 }), 60);
out.runs.flapGearSpoiler = record(createFlightState('cruise'), (s, t) => {
  const k = Math.floor(t / 8);
  const flaps = [0, 1, 2, 3, 2, 1, 0, 0][k % 8], gear = [false, false, false, true, true, true, false, false][k % 8];
  return { flaps, gear, spoilers: k % 4 === 3, throttle: 0.3 + 0.1 * (k % 3), pitch: Math.sin(t * 0.4) * 0.15, roll: Math.sin(t * 0.3) * 0.3, yaw: Math.sin(t * 0.2) * 0.2, trim: 0.2 + 0.02 * k };
}, 70);
out.runs.windRough = record(createFlightState('approach'), (() => { const mem = { flare: false, ig: 0, il: 0 }; return (st) => { const d = getFlightData(st); return st.touchdown && st.onGround && d.groundSpeed < 2.5 ? { throttle: 0, brake: 1 } : pilot(st, d, mem, 140); }; })(), 230,
  { env: (s, t) => ({ wind: { x: -5 + 2 * Math.sin(t / 3), y: 0, z: 3 + Math.sin(t / 5) }, groundElevation: 0 }) });
out.runs.highGround = record(createFlightState('cruise'), (s, t) => ({ autopilot: t === 0 ? { enabled: true, heading: 90, altitude: 1800, speed: 125 } : undefined }), 60, { env: () => ({ groundElevation: 150 }) });

for (const l of LEVELS) {
  const r = flyLevel(l.id);
  out.levels[l.id] = { state: clone(r.state), data: clone(r.data), result: clone(r.result), time: r.time };
}

// Novice outputs over sampled flights.
{
  const mem = { flare: false, ig: 0, il: 0 }, auto = {}, last = {};
  let ils = null;
  out.novice.approach = record(createFlightState('approach'), (st) => {
    const d = getFlightData(st);
    return st.touchdown && st.onGround && d.groundSpeed < 2.5 ? { throttle: 0, brake: 1 } : pilot(st, d, mem, 140);
  }, 230, { extra: st => {
    const d = getFlightData(st), commands = { gear: st.gear, flaps: st.flaps, throttle: st.throttle };
    ils = ilsCue(d, ils);
    return { next: nextStep(st, d, commands), nextTouch: nextStep(st, d, commands, { touch: true }), auto: autoConfig(st, d, { gear: false, flaps: 0 }, {}), autoLive: autoConfig(st, d, commands, auto), ils: clone(ils) };
  } }).map(r => ({ t: r.t, extra: r.extra }));
}
{
  const auto = {};
  out.novice.takeoff = record(createFlightState('runway'), takeoffScript, 110, { extra: st => {
    const d = getFlightData(st), commands = { gear: st.gear, flaps: st.flaps, throttle: st.throttle };
    return { next: nextStep(st, d, commands, { route: AIRPORT.waypoints, routeIndex: Math.floor(st.elapsed / 40) % 4, circuitAltFt: 4500 }), auto: autoConfig(st, d, commands, auto, Math.floor(st.elapsed / 40) % 4) };
  } }).map(r => ({ t: r.t, extra: r.extra }));
}
out.novice.boxes = approachBoxes();
return clone(out);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = build(), file = join(dirname(fileURLToPath(import.meta.url)), 'golden.jet.json');
  writeFileSync(file, JSON.stringify(out));
  console.log('wrote', file, Object.keys(out.runs).map(k => `${k}:${out.runs[k].length}`).join(' '));
}
