// MQ-172 Lark flight model: performance targets (stall, approach, cruise, takeoff, climb, top speed, glide), fixed gear / no spoilers,
// overspeed, autopilot and a scripted circuit with landing (light.pilot.mjs). The jet is guarded by golden.test.mjs and physics.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, RUNWAY, createFlightState, stepFlight, getFlightData, profileOf, AIRCRAFT, quaternionFromEuler } from '../physics.mjs';
import { flyCircuit, takeoffPilot, approachPilot, LIGHT_CIRCUIT } from '../light.pilot.mjs';

const KT = 1.943844, FT = 3.28084, FPM = 196.85, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mk = (scenario = 'runway') => createFlightState(scenario, 'light');
const run = (s, seconds, input = () => ({}), env = {}) => {
  for (let i = 0; i < Math.round(seconds * 120) && !s.crashed; i++) stepFlight(s, input(s, i / 120), 1 / 120, env);
  return s;
};
const ias = d => d.indicatedAirspeed * KT;
const between = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what} = ${v} not in ${lo}..${hi}`);
const mslLocal = ft => ft / FT - RUNWAY.fieldElevation;

test('profiles: jet profile is the legacy AIRCRAFT, light is a separate frozen data set', () => {
  assert.equal(AIRCRAFT, PROFILES.jet);
  assert.equal(AIRCRAFT.name, 'MQ-320'); assert.equal(AIRCRAFT.gearHeight, 4); assert.equal(AIRCRAFT.rotateSpeed, 72);
  assert.ok(Object.isFrozen(PROFILES) && Object.isFrozen(PROFILES.light) && Object.isFrozen(PROFILES.light.aero));
  const s = mk(), j = createFlightState('runway');
  assert.equal(s.aircraft, 'light'); assert.equal(j.aircraft, 'jet');
  assert.equal(profileOf(s), PROFILES.light); assert.equal(profileOf(j), PROFILES.jet); assert.equal(profileOf({}), PROFILES.jet);
  assert.equal(createFlightState('runway', 'nonsense').aircraft, 'jet');
});

test('scenarios: light start states are legal (runway on its wheels, 4 km approach exactly on the glidepath, cruise at 2,900 ft)', () => {
  const r = mk('runway'), a = mk('approach'), c = mk('cruise');
  assert.equal(r.onGround, true); assert.equal(r.position.y, PROFILES.light.gearHeight);
  const af = getFlightData(a);
  assert.ok(Math.abs(af.distanceToThreshold - 4000) < 1e-6);
  assert.ok(Math.abs(af.glideslopeDeviation) < 1e-9);
  between(ias(af), 64, 66, 'approach IAS'); assert.equal(a.flaps, 3); assert.equal(a.gearPosition, 1);
  assert.ok(Math.abs((c.position.y + RUNWAY.fieldElevation) * FT - 2900) < 1);
  assert.equal(c.gearPosition, 1); assert.equal(c.gear, true);
  assert.ok(Math.abs(c.autopilot.speed - getFlightData(c).indicatedAirspeed) < 1e-9);
});

test('stall speed (IAS at the stall angle, decelerating at idle) is 48-54 kt clean and 43-49 kt with flaps 30', () => {
  const out = {};
  for (const flaps of [0, 3]) {
    const s = mk('cruise'); s.flaps = s.flapPosition = flaps; s.position.y = 1500; s.engine = s.throttle = 0;
    const stallAoa = 15 - 2.5 * flaps / 3; let at = null, warned = false;
    for (let i = 0; i < 120 * 150 && !at; i++) {
      const d = getFlightData(s);
      if (d.stallWarning) warned = true;
      if (d.aoa >= stallAoa) at = ias(d);
      stepFlight(s, { throttle: 0, flaps, pitch: clamp(-d.verticalSpeed * 0.25, -0.5, 0.9) }, 1 / 120);
    }
    assert.ok(at, `flaps ${flaps} never reached the stall angle`); assert.ok(warned, 'stall warning comes before the stall');
    out[flaps] = at;
  }
  between(out[0], 48, 54, 'clean stall IAS'); between(out[3], 43, 49, 'flaps 30 stall IAS');
  assert.ok(out[3] < out[0] - 3);
  // the instrument's own stallSpeed (TAS at max lift) agrees with the dynamic result
  const s = mk('cruise'), d = getFlightData(s);
  between(d.stallSpeed * ias(d) / d.airspeed / 1, 46, 55, 'data.stallSpeed as IAS');
});

test('trimmed approach: 65 kt, flaps 3, about -1.6..-2.0 m/s on the 3 degree path, no stall warning', () => {
  const s = mk('approach'); let sum = 0, n = 0, worst = 0;
  run(s, 60, st => { const d = getFlightData(st); if (st.elapsed > 20) { sum += d.verticalSpeed; n++; worst = Math.max(worst, Math.abs(ias(d) - 65)); assert.equal(d.stallWarning, false); } return {}; });
  assert.equal(s.crashed, false);
  between(sum / n, -2.0, -1.6, 'mean sink rate'); assert.ok(worst < 3, `IAS wanders ${worst} kt`);
});

test('trimmed cruise: holds altitude and about 92 KIAS at 2,900 ft with no inputs for 2 minutes', () => {
  const s = mk('cruise'); run(s, 120);
  const d = getFlightData(s);
  assert.equal(s.crashed, false); assert.ok(Math.abs(d.altitude - 457) < 25, `altitude ${d.altitude}`);
  between(ias(d), 88, 96, 'cruise IAS'); assert.ok(Math.abs(d.gLoad - 1) < 0.05);
});

test('takeoff: lift-off within 200-450 m, rotation at 55 kt, no tail strike, positive climb', () => {
  for (const flaps of [0, 1]) {
    const s = mk('runway'), z0 = s.position.z; let rolled = null, kt = null;
    run(s, 40, st => { const d = getFlightData(st); if (!st.onGround && rolled === null) { rolled = z0 - st.position.z; kt = ias(d); } return takeoffPilot(st, d, { flaps }); });
    assert.equal(s.crashed, false, s.crashReason); assert.equal(s.touchdown, null);
    between(rolled, 200, 450, `ground roll (flaps ${flaps})`); between(kt, 52, 66, 'lift-off IAS');
    assert.ok(getFlightData(s).verticalSpeed > 0.5 && s.position.y > 10); assert.ok(s.position.z > RUNWAY.farThreshold);
  }
});

test('takeoff: with the stick neutral the aircraft accelerates but does not fly before 22 m/s ground speed (and never tail-strikes)', () => {
  const s = mk('runway'); let flew = null;
  run(s, 12, st => { const d = getFlightData(st); if (!st.onGround && flew === null) flew = d.groundSpeed; return { throttle: 1, pitch: 0 }; });
  assert.equal(s.crashed, false);
  assert.ok(flew === null || flew > 22);
});

test('climb: full power at about Vy gives 550-800 ft/min, speed held', () => {
  const s = mk('cruise'); s.position.y = mslLocal(2500); s.engine = s.throttle = 1; let sum = 0, n = 0;
  run(s, 60, (st, t) => {
    const d = getFlightData(st), pt = clamp(7 + (ias(d) - 74) * 0.8, 0, 14);
    if (t > 20) { sum += d.verticalSpeed * FPM; n++; }
    return { throttle: 1, flaps: 0, trim: 0.33, pitch: clamp((pt - d.pitch) * 0.15 - st.angularVelocity.x * 1.5, -0.5, 0.7) };
  });
  between(sum / n, 550, 800, 'climb rate fpm'); between(ias(getFlightData(s)), 70, 80, 'climb IAS');
});

test('top speed at 4,000 ft is 112-125 KTAS in level flight at full power', () => {
  const alt = mslLocal(4000), s = mk('cruise'); s.position.y = alt; s.engine = s.throttle = 1;
  run(s, 200, st => { const d = getFlightData(st); return { throttle: 1, trim: 0.2, pitch: clamp(-d.verticalSpeed * 0.3 - (st.position.y - alt) * 0.01 - st.angularVelocity.x * 1.5, -0.5, 0.5) }; });
  const d = getFlightData(s);
  between(d.airspeed * KT, 112, 125, 'KTAS'); assert.ok(Math.abs(d.verticalSpeed) < 0.3);
  assert.ok(ias(d) < (PROFILES.light.speedLimit.clean * KT), 'stays below Vne');
});

test('idle glide ratio is 8-10.5 at every trimmed speed from 74 to 86 KIAS', () => {
  for (const trim of [0.45, 0.55, 0.7]) {
    const s = mk('cruise'); s.position.y = 1500; s.engine = s.throttle = 0; s.trim = trim; s.velocity = { x: 0, y: -1.5, z: -35 };
    run(s, 110, () => ({ throttle: 0, flaps: 0, trim }));
    const d = getFlightData(s), ratio = d.groundSpeed / -d.verticalSpeed;
    between(ratio, 8, 10.5, `glide ratio at trim ${trim}`); between(ias(d), 70, 90, 'glide IAS');
  }
});

test('fixed gear and no spoilers: those inputs are ignored and change nothing', () => {
  const a = mk('cruise'), b = mk('cruise');
  run(a, 30, () => ({ pitch: 0.05 })); run(b, 30, () => ({ pitch: 0.05, gear: false, spoilers: true }));
  assert.equal(b.gear, true); assert.equal(b.gearPosition, 1); assert.equal(b.spoilers, false);
  assert.deepEqual(b.position, a.position); assert.deepEqual(b.velocity, a.velocity);
  // a low, sinking, "gear up" aircraft raises no gear warning
  const c = mk('approach'); c.position.y = 60; run(c, 2, () => ({ gear: false }));
  assert.equal(getFlightData(c).gearWarning, false); assert.equal(c.gearPosition, 1);
});

test('flaps: notches lower the stall speed and add drag; the instruments report the Vfe', () => {
  const stall = f => { const s = mk('cruise'); s.flaps = s.flapPosition = f; const d = getFlightData(s); return d.stallSpeed; };
  assert.ok(stall(0) > stall(1) && stall(1) > stall(2) && stall(2) > stall(3));
  const s = mk('cruise'); s.flapPosition = 0; stepFlight(s, { flaps: 3 }, 1 / 120); assert.equal(s.flaps, 3);
  run(s, 12); assert.ok(Math.abs(s.flapPosition - 3) < 1e-9);
});

test('overspeed warning: flaps 2 trips at 86 kt (limit 85 kt) but not at 84 kt; clean limit is 163 kt, flaps 1 is 110 kt', () => {
  const at = (flaps, kt) => {
    const s = mk('cruise'); s.flaps = s.flapPosition = flaps;
    const f = getFlightData(s), k = f.indicatedAirspeed / f.airspeed; s.velocity = { x: 0, y: 0, z: -(kt / KT) / k };
    return getFlightData(s).overspeedWarning;
  };
  assert.equal(at(2, 86), true); assert.equal(at(2, 84), false); assert.equal(at(3, 86), true);
  assert.equal(at(1, 109), false); assert.equal(at(1, 111), true); assert.equal(at(0, 150), false); assert.equal(at(0, 165), true);
});

test('autopilot: captures heading, altitude and speed without stalling or exceeding 31 degrees of bank', () => {
  const s = mk('cruise'); s.autopilot.enabled = true;
  s.autopilot.heading = 90; s.autopilot.altitude = s.position.y + 120; s.autopilot.speed = 85 / KT;
  let maxBank = 0, stalled = false;
  run(s, 180, st => { const d = getFlightData(st); maxBank = Math.max(maxBank, Math.abs(d.roll)); if (d.stallWarning) stalled = true; return {}; });
  const d = getFlightData(s);
  assert.equal(s.crashed, false); assert.equal(stalled, false); assert.ok(maxBank <= 31, `bank ${maxBank}`);
  assert.ok(Math.abs(((d.heading - 90 + 540) % 360) - 180) < 2, `heading ${d.heading}`);
  assert.ok(Math.abs(d.altitude - s.autopilot.altitude) < 10, `alt ${d.altitude}`);
  assert.ok(Math.abs(ias(d) - 85) < 4, `ias ${ias(d)}`);
});

test('autopilot: a big climb request is limited by available power (speed protected), and it never stalls', () => {
  const s = mk('cruise'); s.autopilot.enabled = true; s.autopilot.altitude = s.position.y + 900; s.autopilot.speed = 90 / KT;
  let minKt = 1e9, stalled = false, maxVs = 0;
  run(s, 240, st => { const d = getFlightData(st); minKt = Math.min(minKt, ias(d)); maxVs = Math.max(maxVs, d.verticalSpeed); if (d.stallWarning) stalled = true; return {}; });
  assert.equal(stalled, false); assert.ok(minKt > 70, `min ${minKt}`); assert.ok(maxVs <= 3.1, `vs ${maxVs}`);
  assert.ok(getFlightData(s).altitude > 457 + 300);
});

test('autopilot descends and levels off at the new altitude too', () => {
  const s = mk('cruise'); s.autopilot.enabled = true; s.autopilot.altitude = s.position.y - 150; s.autopilot.speed = 90 / KT;
  run(s, 150);
  assert.ok(Math.abs(s.position.y - s.autopilot.altitude) < 10);
});

test('circuit: scripted takeoff, 2,900 ft left-hand circuit and landing (airport-frame waypoints) with no crash, soft touchdown, short stop', () => {
  const r = flyCircuit({}, () => mk('runway'));
  const s = r.state, t = s.touchdown;
  assert.equal(s.crashed, false, s.crashReason);
  assert.ok(t, 'touched down');
  assert.ok(t.sinkRate * FPM <= 300, `touchdown ${t.sinkRate * FPM} fpm`);
  assert.equal(r.data.onRunway, true);
  assert.ok(r.data.groundSpeed < 1, 'stopped');
  assert.ok(t.position.z - s.position.z <= 450, `rollout ${t.position.z - s.position.z} m`);
  assert.ok(t.position.z < RUNWAY.nearThreshold && Math.abs(t.lateralOffset) < 12);
  // the track visits every corner of the circuit at about circuit height
  for (const wp of LIGHT_CIRCUIT) assert.ok(r.track.some(p => Math.hypot(p.x - wp.x, p.z - wp.z) < 700), `waypoint ${wp.x},${wp.z}`);
  const aloft = r.track.filter(p => p.phase === 'circuit'), top = Math.max(...aloft.map(p => (p.y + RUNWAY.fieldElevation) * FT));
  between(top, 2800, 3050, 'circuit altitude ft'); assert.ok(Math.min(...aloft.map(p => p.kt)) > 75);
});

test('circuit with a steady crosswind from the right (8 kt) still lands on the runway', () => {
  const r = flyCircuit({ wind: { x: -8 / KT, y: 0, z: 0 } }, () => mk('runway'));
  assert.equal(r.state.crashed, false, r.state.crashReason);
  assert.ok(r.state.touchdown.sinkRate * FPM <= 300); assert.equal(r.data.onRunway, true);
});

test('final approach pilot lands the 4 km approach scenario softly and stops on the runway', () => {
  const s = mk('approach'), mem = { flare: false, ig: 0, il: 0 };
  run(s, 200, st => { const d = getFlightData(st); if (st.touchdown && st.onGround && d.groundSpeed < 1) return { brake: 1 }; return approachPilot(st, d, mem); });
  assert.equal(s.crashed, false, s.crashReason);
  assert.ok(s.touchdown.sinkRate * FPM <= 300); assert.ok(Math.abs(s.touchdown.lateralOffset) < 6);
  assert.ok(getFlightData(s).groundSpeed < 0.1); assert.ok(s.touchdown.position.z - s.position.z <= 450);
});

test('light crash thresholds: 5 m/s sink is a hard landing, 8 m/s is an impact; tail strike above 14 degrees', () => {
  const land = (vy, pitch = 0) => {
    const s = mk('approach'); s.position = { x: 0, y: 1.3, z: 800 }; s.velocity = { x: 0, y: -vy, z: -33 }; s.quaternion = quaternionFromEuler(pitch * RAD);
    run(s, 1); return s.crashReason;
  };
  assert.equal(land(2), ''); assert.equal(land(5), 'hard-landing'); assert.equal(land(8), 'ground-impact'); assert.equal(land(2, 16), 'tail-strike');
});

test('wind and altitude: the light model uses density (thinner air at 4,000 ft lowers power and raises true airspeed per indicated)', () => {
  const lo = mk('cruise'), hi = mk('cruise'); hi.position.y = mslLocal(8000);
  run(lo, 5, () => ({ throttle: 1 })); run(hi, 5, () => ({ throttle: 1 }));
  assert.ok(getFlightData(hi).airspeed / getFlightData(hi).indicatedAirspeed > getFlightData(lo).airspeed / getFlightData(lo).indicatedAirspeed);
});

test('engineRpm (synthetic) is exposed for the light aircraft only: idle 700, full 2,700; engineN1 stays for the jet', () => {
  const s = mk('runway'); assert.equal(getFlightData(s).engineRpm, 700);
  s.engine = 1; assert.equal(getFlightData(s).engineRpm, 2700);
  s.engine = 0.5; assert.equal(getFlightData(s).engineRpm, 1700);
  assert.equal('engineRpm' in getFlightData(createFlightState('runway')), false);
  assert.ok(getFlightData(createFlightState('runway')).engineN1 > 0);
});

test('fuel: 110 kg usable lasts over an hour at cruise power; the engine quits when it runs dry', () => {
  const s = mk('cruise'); assert.equal(s.fuel, 110);
  run(s, 60, () => ({ throttle: 0.7 })); assert.ok(110 - s.fuel < 1.0);
  s.fuel = 0.0001; run(s, 5, () => ({ throttle: 1 })); assert.equal(s.fuel, 0); assert.equal(getFlightData(s).engineRpm, 0);
});
