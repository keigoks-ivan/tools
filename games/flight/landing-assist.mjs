// Optional novice final-approach pilot. Drives the existing stepFlight controls;
// it never moves the aircraft, edits physics, or enables the ALT/HDG autopilot.
// main owns mode gating and explicit handback. Call update at the fixed
// physics step with fresh getFlightData, and copy its commands when handing back.
import { RUNWAY, runwayOf, profileOf } from './physics.mjs?v=20261008';

const KT = 1.943844, RAD = Math.PI / 180;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = value => ((value + 180) % 360 + 360) % 360 - 180;
const settings = state => state.carrier
  ? { vref: 140, minKt: 125, maxKt: 175, flare: 0, minAgl: 15, maxDistance: 8000, maxOffset: 250, baseThrottle: .22, speedGain: .012, speedIntegral: .0008, maxCrosswind: 15.1 }
  : state.aircraft === 'hornet'
  ? { vref: 140, minKt: 125, maxKt: 200, flare: 10, minAgl: 25, maxDistance: 13000, maxOffset: 500, baseThrottle: .21, speedGain: .012, speedIntegral: .0008, maxCrosswind: 15.1 }
  : state.aircraft === 'fighter'
  ? { vref: 155, minKt: 140, maxKt: 210, flare: 12, minAgl: 25, maxDistance: 13000, maxOffset: 500, baseThrottle: .18, speedGain: .012, speedIntegral: .0008, maxCrosswind: 15.1 }
  : state.aircraft === 'light'
  ? { vref: 65, minKt: 55, maxKt: 90, flare: 6, minAgl: 15, maxDistance: 7000, maxOffset: 220, baseThrottle: .47, speedGain: .02, speedIntegral: .048, maxCrosswind: 15.1 }
  : { vref: 140, minKt: 120, maxKt: 180, flare: 25, minAgl: 30, maxDistance: 13000, maxOffset: 500, baseThrottle: .22, speedGain: .012, speedIntegral: .00048, maxCrosswind: 15.1 };

// Reasons are stable codes for bilingual UI. Eligibility concerns a straight-in
// final only; an instrument being valid alone does not mean capture is safe.
export function landingAssistEligibility(state, data) {
  const RUNWAY = runwayOf(state);
  const fail = reason => ({ eligible: false, reason });
  if (!state || !data || !Number.isFinite(data.indicatedAirspeed) || !Number.isFinite(data.agl)) return fail('unavailable');
  if (state.crashed) return fail('crashed');
  if (state.fuel <= 0) return fail('unavailable');
  if (state.challenge) return fail('challenge');
  if (state.tour) return fail('tour');
  if (state.onGround) return fail('on-ground');
  const S = settings(state), P = profileOf(state), distance = data.distanceToThreshold;
  const configurationTime = Math.max(state.gearPosition > .95 || P.fixedGear ? 0 : P.gear.transit, Math.max(0, 3 - state.flapPosition) / .35);
  const minimumDistance = Math.max(350, data.groundSpeed * (configurationTime + 5));
  if (distance < minimumDistance || distance > S.maxDistance || state.velocity.z >= 0) return fail('distance');
  if (Math.abs(wrap(data.heading - RUNWAY.heading)) > 25 || !data.ilsValid) return fail('runway-direction');
  if (Math.abs(state.position.x) > Math.min(S.maxOffset, 10 + distance * .04)) return fail('runway-position');
  const late = distance < 1500;
  if (Math.abs(data.roll) > (late ? 10 : 20) || Math.abs(data.pitch) > 12 || (late && Math.abs(data.sideslip) > 8)) return fail('attitude');
  const path = P.gearHeight + (state.position.z - RUNWAY.touchdownTarget) * Math.tan(RUNWAY.glideslope * RAD);
  const tolerance = late ? (state.aircraft === 'light' ? 8 : 5) : Math.max(8, path * .3);
  if (data.agl < S.minAgl || Math.abs(state.position.y - path) > tolerance || data.verticalSpeed < (state.aircraft === 'light' ? -4 : -7) || data.verticalSpeed > (state.aircraft === 'light' ? 3 : 5)) return fail('altitude');
  const kt = data.indicatedAirspeed * KT;
  const maximumKt = distance < 2000 ? Math.min(S.maxKt, state.aircraft === 'light' ? 75 : profileOf(state).military ? 185 : 160) : S.maxKt;
  if (kt < S.minKt || kt > maximumKt || data.stallWarning || data.overspeedWarning) return fail('speed');
  if (Math.abs(state.wind?.x || 0) * KT > S.maxCrosswind || Math.abs(state.wind?.y || 0) > 1 || (state.wind?.z || 0) < -5) return fail('wind');
  return { eligible: true, reason: '' };
}

export function createLandingAssist() {
  let active = false, phase = 'off', reason = '', speedIntegral = 0, glideIntegral = 0, aircraft = null;
  let targetSpeedKt = null;

  function disengage(why = 'manual') { active = false; phase = 'off'; reason = why; }
  function engage(state, data) {
    const eligible = landingAssistEligibility(state, data);
    if (!eligible.eligible) { disengage(eligible.reason); return eligible; }
    active = true; phase = 'approach'; reason = ''; aircraft = state.aircraft;
    speedIntegral = glideIntegral = 0; targetSpeedKt = settings(state).vref;
    return eligible;
  }

  function update(state, data, dt = 1 / 120) {
    if (!active) return null;
    if (!Number.isFinite(dt) || dt <= 0) return null;
    if (state.crashed || state.aircraft !== aircraft || state.challenge || state.tour || state.fuel <= 0) { disengage(state.crashed ? 'crashed' : state.aircraft !== aircraft ? 'aircraft-changed' : state.challenge ? 'challenge' : state.tour ? 'tour' : 'unavailable'); return null; }
    dt = Math.min(dt, .1);
    const RUNWAY = runwayOf(state), S = settings(state), light = state.aircraft === 'light', kt = data.indicatedAirspeed * KT;
    if (!state.onGround && (Math.abs(state.wind?.x || 0) * KT > S.maxCrosswind || Math.abs(state.wind?.y || 0) > 1 || (state.wind?.z || 0) < -5)) { disengage('wind'); return null; }
    if (phase === 'approach' && data.agl < profileOf(state).gearHeight + 8 && state.position.z > RUNWAY.length / 2) { disengage('altitude'); return null; }
    const controls = { ...(state.carrier ? { hook: true } : {}), afterburner: false, throttle: 0, pitch: 0, roll: 0, yaw: 0, brake: 0, flaps: 3, gear: true, trim: state.trim, spoilers: false, autopilot: { enabled: false } };
    if (state.onGround) {
      if (!state.touchdown) { disengage('on-ground'); return null; }
      phase = 'rollout';
      if (state.carrier && !state.arrested) {
        controls.throttle = 1; controls.brake = 0; controls.spoilers = false;
        if (state.bolter) { phase = 'bolter'; controls.pitch = clamp((12 - data.pitch) * .06, 0, .5); }
        return controls;
      }
      const error = wrap(data.heading - RUNWAY.heading) + state.position.x * .02;
      controls.yaw = clamp(-error * .05, -.5, .5); controls.brake = 1; controls.spoilers = !light;
      if (data.groundSpeed < 1.5) { active = false; phase = 'complete'; }
      return controls;
    }
    if (state.carrier && state.bolter) {
      phase = 'bolter'; controls.throttle = 1; controls.pitch = clamp((12 - data.pitch) * .06, -.1, .5);
      if (data.agl > 60) { disengage('bolter'); }
      return controls;
    }
    if (light) controls.flaps = kt > 85 ? 1 : 3;
    else if (profileOf(state).military) controls.flaps = kt > 225 ? 1 : kt > 195 ? 2 : 3;
    else controls.flaps = kt > 180 ? 1 : kt > 160 ? 2 : 3;
    // Ground track already includes the wind drift; capture it rather than forcing
    // the nose to point along the runway during a crosswind approach.
    const lookAhead = Math.max(light ? 220 : 500, data.groundSpeed * 8);
    const trackTarget = clamp(Math.atan2(-state.position.x, lookAhead) / RAD, -12, 12);
    const bankLimit = clamp(data.agl * .4, 4, 22);
    const bankTarget = clamp(wrap(trackTarget - data.groundTrack) * 2.5, -bankLimit, bankLimit);
    controls.roll = profileOf(state).military ? clamp((bankTarget - data.roll) * .016 + state.angularVelocity.z * .55, -.5, .5) : clamp((bankTarget - data.roll) * .055 + state.angularVelocity.z * 1.8, -.65, .65);
    // Flare only over the pavement, never because terrain or a low approach
    // produced a small AGL before the runway. Once started, flare stays latched.
    if (state.carrier && data.agl < 25) {
      // Deck recovery keeps descending on-speed: there is no runway-style flare.
      const P = profileOf(state), path = P.gearHeight + (state.position.z - RUNWAY.touchdownTarget) * Math.tan(RUNWAY.glideslope * RAD);
      const vsTarget = -data.groundSpeed * Math.tan(RUNWAY.glideslope * RAD) + clamp((path - state.position.y) * .5, -2, 2);
      const qArea = .5 * 1.225 * data.indicatedAirspeed ** 2 * P.wingArea;
      const groundEffect = 1 + P.aero.groundEffect * clamp(1 - data.agl / (P.span * .5), 0, 1);
      const desiredCl = (P.emptyMass + state.fuel) * (9.80665 + (vsTarget - data.verticalSpeed) * 1.2) / Math.max(qArea, 1);
      const desiredAoA = (desiredCl / groundEffect - P.aero.cl0 - P.aero.flapCl0 * state.flapPosition / 3) / P.aero.slope / RAD;
      controls.pitch = clamp((desiredAoA - data.aoa) * .10 - state.angularVelocity.x * .8 - (data.trimPitchRate || 0) / P.sas.pitch, -.45, .45);
      speedIntegral = clamp(speedIntegral + (S.vref - kt) * S.speedIntegral * dt, -.25, .25);
      controls.throttle = clamp(S.baseThrottle + (S.vref - kt) * S.speedGain + speedIntegral, 0, 1);
    } else if (phase === 'flare' || (data.agl < S.flare && state.position.z <= RUNWAY.length / 2)) {
      phase = 'flare';
      if (profileOf(state).military) controls.throttle = data.agl > 3.0 ? clamp(.11 + (150 - kt) * .01, 0, .3) : 0;
      const vsTarget = profileOf(state).military ? -(.35 + Math.max(0, data.agl - profileOf(state).gearHeight) * .18) : light ? -(.25 + Math.max(0, data.agl - 1) * .2) : -(.5 + Math.max(0, data.agl - 4) * .14);
      if (profileOf(state).military) {
        const P = profileOf(state), qArea = .5 * 1.225 * data.indicatedAirspeed ** 2 * P.wingArea;
        const groundEffect = 1 + P.aero.groundEffect * clamp(1 - data.agl / (P.span * .5), 0, 1);
        const desiredCl = (P.emptyMass + state.fuel) * (9.80665 + (vsTarget - data.verticalSpeed) * .8) / Math.max(qArea, 1);
        const desiredAoA = (desiredCl / groundEffect - P.aero.cl0 - P.aero.flapCl0 * state.flapPosition / 3) / P.aero.slope / RAD;
        controls.pitch = clamp((desiredAoA - data.aoa) * .08 - state.angularVelocity.x * .7 - (data.trimPitchRate || 0) / P.sas.pitch, -.35, .35);
      } else controls.pitch = clamp((vsTarget - data.verticalSpeed) * .3, -.4, .5);
    } else {
      const gamma = Math.atan2(state.velocity.y, Math.hypot(state.velocity.x, state.velocity.z)) / RAD;
      const gs = data.gsValid ? data.glideslopeDeviation : 0;
      glideIntegral = clamp(glideIntegral + gs * .48 * dt, -1, 1);
      const gammaTarget = -RUNWAY.glideslope - clamp(gs * 2.5 + glideIntegral, -2, 4);
      controls.pitch = clamp((gammaTarget - gamma) * .12 - state.angularVelocity.x * .5, -.45, .45);
      speedIntegral = clamp(speedIntegral + (S.vref - kt) * S.speedIntegral * dt, -.25, .25);
      controls.throttle = clamp(S.baseThrottle + (S.vref - kt) * S.speedGain + speedIntegral, 0, 1);
    }
    return controls;
  }
  return { engage, disengage, update, get active() { return active; }, get status() { return { phase, reason, targetSpeedKt, aircraft }; } };
}
