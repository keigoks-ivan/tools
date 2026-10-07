import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../game/lib/three.module.js';
import { createFlightState, stepFlight, getFlightData, quaternionFromEuler, PROFILES, RUNWAY } from '../physics.mjs';
import { createFighterAircraft, createFighterCockpit } from '../aircraft.fighter.js';
import { createLandingAssist, landingAssistEligibility } from '../landing-assist.mjs';
import { levelsFor, createLevelState } from '../challenge.mjs';
import { toursFor, tourById, createTourState } from '../tour.mjs';
import { autoConfig, approachBoxes } from '../novice.mjs';
import { flightAudioFrame, createFlightAudio } from '../audio.js';
const DT = 1 / 120, KT = 1.943844, RAD = Math.PI / 180;
function run(state, seconds, controls = () => ({}), wind = state.wind) {
  for (let i = 0; i < seconds / DT && !state.crashed; i++) stepFlight(state, controls(state, getFlightData(state)), DT, { wind });
  return getFlightData(state);
}

test('fighter is a separate single-engine profile; all start scenarios have coherent configuration', () => {
  for (const scenario of ['runway', 'approach', 'cruise']) {
    const s = createFlightState(scenario, 'fighter');
    assert.equal(s.aircraft, 'fighter'); assert.equal(s.afterburner, false); assert.equal(s.afterburnerLevel, 0);
    assert.equal(s.onGround, scenario === 'runway'); assert.equal(s.gear, scenario !== 'cruise');
    assert.equal(s.fuel, 2500); assert.equal(PROFILES.fighter.ui.engines, 1);
  }
  assert.ok(Object.isFrozen(PROFILES.fighter.sas));
});
for (const ab of [false, true]) test(`fighter takes off within the runway ${ab ? 'with afterburner' : 'on dry thrust'}`, () => {
  const s = createFlightState('runway', 'fighter'); let liftOffZ = null;
  const d = run(s, 30, (s, d) => {
    if (!s.onGround && liftOffZ === null) liftOffZ = s.position.z;
    return { throttle: 1, afterburner: ab, pitch: s.onGround ? (d.indicatedAirspeed * KT > 140 ? .30 : 0) : (12 - d.pitch) * .025,
      gear: s.onGround || d.agl < 20, flaps: d.indicatedAirspeed * KT > 190 ? 0 : 1 };
  });
  assert.equal(s.crashed, false, s.crashReason); assert.equal(s.onGround, false); assert.ok(d.agl > 100);
  assert.ok(liftOffZ > RUNWAY.farThreshold + 100); assert.ok(s.gearPosition < .01);
});
test('afterburner increases acceleration and fuel burn; low throttle and AP extinguish it', () => {
  const start = () => { const s = createFlightState('cruise', 'fighter'); s.position.y = 4000; s.velocity.z = -250; s.quaternion = quaternionFromEuler(.5 * RAD); return s; };
  const dry = start(), ab = start();
  const dd = run(dry, 30, () => ({ throttle: 1 })), da = run(ab, 30, () => ({ throttle: 1, afterburner: true }));
  assert.ok(da.airspeed > dd.airspeed + 25); assert.ok(ab.fuel < dry.fuel - 50); assert.ok(ab.afterburnerLevel > .99);
  run(ab, 4, () => ({ throttle: .5, afterburner: true })); assert.ok(ab.afterburnerLevel < .001);
  run(ab, 8, () => ({ throttle: 1, afterburner: true })); assert.ok(ab.afterburnerLevel > .9);
  run(ab, 4, () => ({ autopilot: { enabled: true }, afterburner: true })); assert.equal(ab.afterburner, false); assert.ok(ab.afterburnerLevel < .001);
});
test('fighter AP captures a heading, altitude and speed without an afterburner', () => {
  const s = createFlightState('cruise', 'fighter');
  const d = run(s, 180, () => ({ autopilot: { enabled: true, heading: 30, altitude: 3000, speed: 300 / KT } }));
  assert.equal(s.crashed, false); assert.ok(Math.abs(d.heading - 30) < 1);
  assert.ok(Math.abs(d.altitude - 3000) < 10); assert.ok(Math.abs(d.indicatedAirspeed * KT - 300) < 2);
  assert.ok(Math.abs(d.verticalSpeed) < .3); assert.equal(s.afterburnerLevel, 0);
});
test('fighter rolls faster than the airliner; sustained pull is limited below 9 G and 25 degrees AoA', () => {
  const rolls = ['jet', 'fighter'].map(id => { const s = createFlightState('cruise', id); run(s, 1, () => ({ roll: .6 })); return Math.abs(s.angularVelocity.z); });
  assert.ok(rolls[1] > rolls[0] * 3);
  const s = createFlightState('cruise', 'fighter'); s.position.y = 4000; s.velocity.z = -250;
  let peakG = 0, peakAoA = 0;
  run(s, 30, (s, d) => { peakG = Math.max(peakG, d.gLoad); peakAoA = Math.max(peakAoA, d.aoa); return { pitch: 1, throttle: 1, trim: 0 }; });
  assert.equal(s.crashed, false); assert.ok(peakG > 6 && peakG < 9.1); assert.ok(peakAoA < 25.5);
});
test('supersonic flight remains finite for five simulated minutes at altitude', () => {
  const s = createFlightState('cruise', 'fighter'); s.position.y = 9000; s.velocity.z = -620; s.quaternion = quaternionFromEuler(.5 * RAD);
  const d = run(s, 300, () => ({ throttle: 1, afterburner: true, trim: 0, flaps: 0, gear: false }));
  assert.equal(s.crashed, false); assert.ok(d.mach > 1.5 && d.mach < 2.3);
  for (const v of [...Object.values(s.position), ...Object.values(s.velocity), ...Object.values(s.quaternion), d.aoa, d.gLoad]) assert.ok(Number.isFinite(v));
  assert.ok(Math.abs(Math.hypot(...Object.values(s.quaternion)) - 1) < 1e-10);
});
for (const [name, options] of [
  ['normal', {}], ['high and right', { x: 180, above: 40 }], ['low and left', { x: -180, above: -40 }],
  ['crosswind', { wind: { x: 7.5, y: 0, z: 0 } }], ['overcast', { wind: { x: 1.7, y: 0, z: 2 } }],
  ['fast clean capture', { kt: 200, flaps: 0, gear: false }],
]) test(`fighter landing assist: ${name}, flare and brake to a safe stop`, () => {
  const s = createFlightState('approach', 'fighter'); s.position.x = options.x || 0; s.position.y += options.above || 0;
  if (options.kt) { const d = getFlightData(s), scale = options.kt / (d.indicatedAirspeed * KT); s.velocity.z *= scale; s.velocity.y *= scale; }
  if (options.flaps !== undefined) s.flaps = s.flapPosition = options.flaps;
  if (options.gear !== undefined) { s.gear = options.gear; s.gearPosition = Number(options.gear); }
  if (options.wind) s.wind = options.wind;
  const a = createLandingAssist(), phases = new Set(); assert.deepEqual(a.engage(s, getFlightData(s)), { eligible: true, reason: '' });
  const d = run(s, 160, (s, d) => { const input = a.update(s, d, DT); phases.add(a.status.phase); return input || { throttle: 0, brake: 1 }; });
  assert.equal(s.crashed, false, JSON.stringify(s.touchdown)); assert.ok(s.touchdown);
  assert.ok(s.touchdown.sinkRate < 2); assert.ok(Math.abs(s.touchdown.lateralOffset) < 8);
  assert.ok(d.groundSpeed < 1.5); assert.equal(a.status.phase, 'complete'); assert.equal(s.afterburner, false);
  assert.ok(phases.has('flare') && phases.has('rollout'));
});
test('fighter challenges/tours keep the selected aircraft and disable landing assist', () => {
  assert.equal(levelsFor('fighter').length, 7);
  for (const l of levelsFor('fighter')) { const s = createLevelState(l); assert.equal(s.aircraft, 'fighter'); assert.equal(landingAssistEligibility(s, getFlightData(s)).reason, 'challenge'); }
  for (const t of toursFor('fighter')) { assert.equal(tourById(t.id), t); const s = createTourState(t); assert.equal(s.aircraft, 'fighter'); assert.equal(s.crashed, false);
    assert.ok(Math.abs(getFlightData(s).indicatedAirspeed * KT - 300) < 1); assert.equal(landingAssistEligibility(s, getFlightData(s)).reason, 'tour'); }
  const s = createFlightState('cruise', 'fighter'); s.flaps = s.flapPosition = 1; s.velocity.y = 2;
  assert.equal(autoConfig(s, getFlightData(s), s, {}).flaps, 0);
  assert.equal(approachBoxes('fighter')[0].y, 2 + (RUNWAY.nearThreshold - RUNWAY.touchdownTarget) * Math.tan(RUNWAY.glideslope * RAD));
});
test('fighter geometry stays finite across gear/afterburner/control animation and releases GPU resources', () => {
  const plane = createFighterAircraft(THREE), cockpit = createFighterCockpit(THREE), s = createFlightState('cruise', 'fighter');
  const resources = new Set(); let disposals = 0, meshes = 0;
  for (const root of [plane.group, cockpit]) root.traverse(o => { if (o.isMesh) { meshes++; resources.add(o.geometry); resources.add(o.material); for (const key of ['bumpMap', 'roughnessMap']) if (o.material[key]) resources.add(o.material[key]); } });
  resources.forEach(r => r.addEventListener('dispose', () => disposals++));
  for (const gear of [0, .5, 1]) { s.gearPosition = gear; s.afterburnerLevel = 1; s.angularVelocity = { x: .2, y: .1, z: 1 }; plane.update(s, getFlightData(s)); cockpit.update(s, getFlightData(s));
    plane.group.updateMatrixWorld(); plane.group.traverse(o => { if (o.isMesh) for (const value of o.geometry.attributes.position.array) assert.ok(Number.isFinite(value)); for (const v of o.matrixWorld.elements) assert.ok(Number.isFinite(v)); }); }
  assert.ok(meshes > 100); plane.dispose(); cockpit.dispose(); assert.equal(disposals, resources.size);
});
test('fighter sound has its own engine signature and afterburner telemetry, with audio still opt-in', () => {
  const s = createFlightState('cruise', 'fighter'); s.afterburnerLevel = 1;
  const f = flightAudioFrame(s, getFlightData(s), { active: true, aircraft: PROFILES.fighter });
  assert.equal(f.id, 'fighter'); assert.equal(f.afterburner, 1); assert.equal(f.light, false);
  assert.ok(f.fanHz > flightAudioFrame({ ...s, aircraft: 'jet' }, getFlightData(s)).fanHz);
  const audio = createFlightAudio(); audio.update(s, getFlightData(s), { active: true }); assert.equal(audio.enabled, false); audio.dispose();
});
