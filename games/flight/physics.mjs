import { CARRIER, onCarrierDeck, crossedArrestingWire } from './carrier.mjs?v=20261008';
import { AIRPORT } from './airport.mjs';
import { PROFILES } from './profiles.mjs?v=20261008';

// Aircraft models live in profiles.mjs. SI units; this is a simulation model, not aircraft certification data.
// AIRCRAFT is the original twin-engine narrowbody (MQ-320) and keeps every key it always had; the light single (MQ-172) is PROFILES.light.
export { PROFILES };
export const AIRCRAFT = PROFILES.jet;
export const profileOf = state => PROFILES[state?.aircraft] || PROFILES.jet;
// Runway geometry in the local frame (origin = runway centre, -z = runway heading); values come from the airport config.
// `elevation` is the local runway height (0); `fieldElevation` is its height above sea level, used for air density.
export const RUNWAY = Object.freeze({
  length: AIRPORT.runway.lengthM, width: AIRPORT.runway.widthM, elevation: 0, fieldElevation: AIRPORT.runway.elevationM,
  // nearThreshold is the landing threshold (displaced from the pavement end); the pavement spans +-length/2.
  nearThreshold: AIRPORT.runway.lengthM / 2 - (AIRPORT.runway.displacedNearM || 0), farThreshold: -AIRPORT.runway.lengthM / 2, heading: 0,
  touchdownTarget: AIRPORT.runway.lengthM / 2 - (AIRPORT.runway.displacedNearM || 0) - AIRPORT.runway.touchdownZoneM, glideslope: AIRPORT.ils.glideslopeDeg,
});

export const runwayOf = state => state?.carrier ? CARRIER : RUNWAY;

const G = 9.80665;
const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const length = v => Math.hypot(v.x, v.y, v.z);
const wrapAngle = v => ((v + 180) % 360 + 360) % 360 - 180;
const unit = v => { const n = length(v) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
const copy = v => ({ x: v.x || 0, y: v.y || 0, z: v.z || 0 });
// Indicated-airspeed limit (m/s): VMO clean, reduced with flap extension (jet: linear; light: Vfe steps).
const speedLimit = (P, flapPosition) => {
  const L = P.speedLimit;
  if (L.steps) { let v = L.clean; for (const [over, limit] of L.steps) if (flapPosition > over) v = limit; return v; }
  return flapPosition > L.flapOver ? L.base - L.perFlap * flapPosition : L.clean;
};
// Linear interpolation in a per-notch table (index = flap notch 0..3).
const tableAt = (table, f) => { const i = Math.min(table.length - 2, Math.max(0, Math.floor(f))); return table[i] + (table[i + 1] - table[i]) * clamp(f - i, 0, 1); };

export function normalizeQuaternion(q) {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  if (!n) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

function multiplyQuaternion(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quaternionFromEuler(pitch = 0, heading = 0, roll = 0) {
  // Inputs are radians: nose up, clockwise compass heading, right wing down.
  const p = { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) };
  const h = { x: 0, y: -Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
  const r = { x: 0, y: 0, z: -Math.sin(roll / 2), w: Math.cos(roll / 2) };
  return normalizeQuaternion(multiplyQuaternion(multiplyQuaternion(h, p), r));
}

export function rotateVector(q, v) {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx,
  };
}

function inverseRotate(q, v) { return rotateVector({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, v); }

function attitude(q) {
  const forward = rotateVector(q, { x: 0, y: 0, z: -1 });
  const up = rotateVector(q, { x: 0, y: 1, z: 0 });
  const right = rotateVector(q, { x: 1, y: 0, z: 0 });
  return {
    pitch: Math.asin(clamp(forward.y, -1, 1)) / RAD,
    heading: (Math.atan2(forward.x, -forward.z) / RAD + 360) % 360,
    roll: Math.atan2(-right.y, up.y) / RAD,
  };
}

function atmosphere(altitude) {
  // Tropospheric ISA density, sufficient for the altitude range of this prototype.
  const temperature = Math.max(216.65, 288.15 - Math.max(0, altitude) * 0.0065);
  return 1.225 * Math.pow(temperature / 288.15, 4.2561);
}

const speedOfSound = altitude => Math.sqrt(1.4 * 287.05 * Math.max(216.65, 288.15 - Math.max(0, altitude) * .0065));
function fighterWaveDrag(P, speed, altitude) {
  if (!P.military) return 0;
  const mach = speed / speedOfSound(altitude);
  return .035 * Math.exp(-Math.pow((mach - 1.05) / .19, 2)) + .012 * clamp((mach - .9) / .5, 0, 1);
}

function airState(state) {
  const RUNWAY = runwayOf(state);
  const wind = state.wind;
  const relative = { x: state.velocity.x - wind.x, y: state.velocity.y - wind.y, z: state.velocity.z - wind.z };
  const body = inverseRotate(state.quaternion, relative);
  const speed = length(relative);
  return {
    relative, body, speed,
    aoa: speed > 1 ? Math.atan2(-body.y, -body.z) : 0,
    beta: speed > 1 ? Math.asin(clamp(body.x / speed, -1, 1)) : 0,
    density: atmosphere(state.position.y + RUNWAY.fieldElevation),
  };
}

function coefficients(P, aoa, flap, spoilers, agl) {
  const A = P.aero, fraction = flap / 3;
  const slope = A.slope;
  const cl0 = A.flapTable ? A.cl0 + tableAt(A.flapTable.cl0, flap) : A.cl0 + A.flapCl0 * fraction;
  const stallAlpha = (A.stall - A.flapStall * fraction) * RAD;
  const maxLift = cl0 + slope * stallAlpha;
  let lift = cl0 + slope * aoa;
  if (aoa > stallAlpha) {
    lift = maxLift * (0.55 + 0.45 * Math.exp(-(aoa - stallAlpha) * 9)) * Math.max(0.12, Math.cos(aoa));
  } else if (aoa < -A.negStall * RAD) {
    const negativeMax = cl0 - slope * A.negStall * RAD;
    lift = negativeMax * (0.55 + 0.45 * Math.exp((aoa + A.negStall * RAD) * 9)) * Math.max(0.12, Math.cos(aoa));
  }
  const groundEffect = 1 + A.groundEffect * clamp(1 - Math.max(0, agl) / (P.span * 0.5), 0, 1);
  lift *= groundEffect * (spoilers ? A.spoilerLift : 1);
  const separated = Math.max(0, Math.abs(aoa) - stallAlpha);
  const flapDrag = A.flapTable ? tableAt(A.flapTable.cd, flap) : fraction * A.flapCd;
  return {
    lift, maxLift, stallAlpha,
    drag: A.cd0 + flapDrag + A.k * lift * lift + (spoilers ? A.spoilerCd : 0) + A.separatedCd * separated,
  };
}

// Thrust available at full power (N). Jet: lapse with density and a mild speed loss. Prop: power-limited, thrust falls linearly with speed.
function propSigma(T, density) { const sigma = density / 1.225; return (sigma - T.sigmaOffset) / (1 - T.sigmaOffset); }
function availableThrust(P, density, speed) {
  const T = P.thrust;
  if (T.type === 'prop') return propSigma(T, density) * Math.max(0, P.maxThrust - T.speedSlope * speed);
  return P.maxThrust * Math.pow(density / 1.225, T.lapseExp) * Math.max(T.floor, 1 - speed * T.slope);
}

export function createFlightState(scenario = 'runway', aircraft = 'jet') {
  const P = PROFILES[aircraft] || PROFILES.jet, S = P.scenarios;
  const carrier = scenario === 'carrier' && P.hasHook, RUNWAY = carrier ? CARRIER : runwayOf(null);
  const approach = scenario === 'approach' || carrier;
  const cruise = scenario === 'cruise';
  const speed = approach ? S.approach.speed : cruise ? S.cruise.speed : 0;
  const glide = RUNWAY.glideslope * RAD;
  // The approach starts S.approach.km from the threshold exactly on the glidepath.
  const altitude = approach ? P.gearHeight + ((carrier ? 4 : S.approach.km) * 1000 + RUNWAY.nearThreshold - RUNWAY.touchdownTarget) * Math.tan(glide) : cruise ? S.cruise.altitude : P.gearHeight;
  const gamma = approach ? -glide : 0;
  const pitch = approach ? S.approach.pitch * RAD : cruise ? S.cruise.pitch * RAD : 0;
  const gearDown = P.fixedGear || !cruise || S.cruise.gear;
  const state = {
    aircraft: P.id,
    scenario: approach ? 'approach' : cruise ? 'cruise' : 'runway',
    position: { x: cruise ? S.cruise.x : 0, y: altitude, z: approach ? RUNWAY.nearThreshold + (carrier ? 4 : S.approach.km) * 1000 : cruise ? S.cruise.z : RUNWAY.length / 2 - 180 },
    velocity: { x: 0, y: speed * Math.sin(gamma), z: -speed * Math.cos(gamma) },
    quaternion: quaternionFromEuler(pitch), angularVelocity: { x: 0, y: 0, z: 0 },
    throttle: approach ? S.approach.throttle : cruise ? S.cruise.throttle : 0,
    engine: approach ? S.approach.throttle : cruise ? S.cruise.throttle : 0,
    flaps: approach ? S.approach.flaps : cruise ? S.cruise.flaps : S.runway.flaps,
    flapPosition: approach ? S.approach.flaps : cruise ? S.cruise.flaps : S.runway.flaps,
    gear: gearDown, gearPosition: gearDown ? 1 : 0,
    trim: approach ? S.approach.trim : cruise ? S.cruise.trim : S.runway.trim,
    brake: 0, spoilers: false, fuel: P.initialFuel,
    onGround: !approach && !cruise, crashed: false, crashReason: '',
    elapsed: 0, touchdown: null, gLoad: 1,
    groundElevation: 0,
    wind: { x: 0, y: 0, z: 0 },
    // Autopilot speed is indicated airspeed in m/s, matching the cockpit speed selector.
    autopilot: { enabled: false, heading: 0, altitude: approach ? altitude : cruise ? S.cruise.altitude : S.runway.apAltitude, speed: (speed || S.default.speed) * Math.sqrt(atmosphere(altitude + RUNWAY.fieldElevation) / 1.225) },
  };
  if (carrier) {
    state.carrier = true; state.scenario = 'carrier'; state.groundElevation = CARRIER.seaHeight;
    state.velocity.z = -72 * Math.cos(glide); state.velocity.y = -72 * Math.sin(glide);
    state.quaternion = quaternionFromEuler(4.5 * RAD); state.throttle = state.engine = .22;
  }
  if (P.hasHook) { state.hook = carrier; state.hookPosition = carrier ? 1 : 0; state.arrested = null; state.bolter = false; }
  if (P.military) { state.afterburner = false; state.afterburnerLevel = 0; }
  return state;
}

function crash(state, reason) {
  state.crashed = true;
  state.crashReason = reason;
  state.velocity = { x: 0, y: 0, z: 0 };
  state.angularVelocity = { x: 0, y: 0, z: 0 };
  state.engine = 0;
  state.throttle = 0;
  state.autopilot.enabled = false;
}

function trimAoA(P, state, qArea) {
  const S = P.sas;
  if (!P.military) return (S.trimAoaBase + state.trim * S.trimAoaGain) * RAD;
  if (state.onGround) return 0;
  // Neutral fighter stick commands approximately 1 G; trim adds a small AoA bias.
  const cl0 = P.aero.cl0 + P.aero.flapCl0 * state.flapPosition / 3;
  return clamp(((P.emptyMass + state.fuel) * G / Math.max(qArea, 1) - cl0) / P.aero.slope + state.trim * 2 * RAD, -5 * RAD, 20 * RAD);
}

function autopilotControls(P, state, controls, air, angles, dt) {
  if (!state.autopilot.enabled || state.onGround) return controls;
  const ap = state.autopilot, A = P.ap, S = P.sas;
  const headingError = wrapAngle(ap.heading - angles.heading);
  const bankTarget = clamp(headingError * A.bankGain, -A.bank, A.bank);
  const altitudeError = ap.altitude - state.position.y;
  let verticalTarget = clamp(altitudeError * A.altGain, -A.vs, A.vs);
  const flightPath = Math.atan2(state.velocity.y, Math.hypot(state.velocity.x, state.velocity.z)) / RAD;
  const aero = coefficients(P, air.aoa, state.flapPosition, state.spoilers, state.position.y - state.groundElevation);
  const drag = 0.5 * air.density * air.speed * air.speed * P.wingArea * (aero.drag + fighterWaveDrag(P, air.speed, state.position.y + runwayOf(state).fieldElevation) + P.aero.cdGear * state.gearPosition);
  const climbThrust = (P.emptyMass + state.fuel) * G * state.velocity.y / Math.max(air.speed, A.minSpeed);
  const available = availableThrust(P, air.density, air.speed);
  // A power-limited aircraft cannot climb on demand: cap the commanded climb at the rate the spare thrust can sustain, so speed is protected.
  if (A.powerLimited) verticalTarget = Math.min(verticalTarget, Math.max(0, (available - drag) * air.speed / ((P.emptyMass + state.fuel) * G) * A.climbPowerFraction));
  const pitchTarget = clamp((verticalTarget - state.velocity.y) * A.vsPitchGain + flightPath + air.aoa / RAD, A.pitchMin, A.pitchMax);
  const indicatedSpeed = air.speed * Math.sqrt(air.density / 1.225);
  // Never command a speed above the current flap limit (margin) and pull thrust back if above it.
  const speedCap = speedLimit(P, state.flapPosition) - A.speedMargin;
  const speedError = Math.min(ap.speed, speedCap) - indicatedSpeed;
  ap.speedIntegral = clamp((ap.speedIntegral || 0) + speedError * dt * A.integralGain, -A.integralMax, A.integralMax);
  const trimPitchRate = clamp((trimAoA(P, state, .5 * air.density * air.speed * air.speed * P.wingArea) - air.aoa) * S.aoaGain, -S.aoaLimit, S.aoaLimit);
  return {
    ...controls,
    pitch: clamp((pitchTarget - angles.pitch) * A.pitchGain - state.angularVelocity.x * A.pitchDamp - trimPitchRate / S.pitch, -A.ctrlMax, A.ctrlMax),
    roll: clamp((bankTarget - angles.roll) * A.rollGain + state.angularVelocity.z * A.rollDamp, -A.ctrlMax, A.ctrlMax),
    yaw: clamp(air.beta * A.yawGain, -A.yawMax, A.yawMax),
    throttle: clamp((drag + climbThrust) / available + speedError * A.speedGain + ap.speedIntegral - Math.max(0, indicatedSpeed - speedCap) * A.overspeedGain, 0, 1),
  };
}

function advance(state, controls, dt) {
  const P = profileOf(state), T = P.thrust, S = P.sas, GR = P.ground, CR = P.crash, RUNWAY = runwayOf(state);
  const previousHookZ = state.position.z + CARRIER.hookAftM;
  if (state.carrier && state.onGround && !onCarrierDeck(state.position)) state.onGround = false;
  if (P.hasHook) state.hookPosition += clamp(Number(state.hook) - state.hookPosition, -dt / 1.5, dt / 1.5);
  const air = airState(state);
  const angles = attitude(state.quaternion);
  controls = autopilotControls(P, state, controls, air, angles, dt);
  state.throttle = controls.throttle;
  if (P.military) {
    if (state.autopilot.enabled) state.afterburner = false;
    const target = state.afterburner && state.throttle >= .9 && state.engine > .85 && state.fuel > 0 ? 1 : 0;
    state.afterburnerLevel += (target - state.afterburnerLevel) * (1 - Math.exp(-dt / .45));
  }
  state.engine += (state.throttle - state.engine) * (1 - Math.exp(-dt / (state.throttle > state.engine ? T.spoolUp : T.spoolDown)));
  state.flapPosition += clamp(state.flaps - state.flapPosition, -0.35 * dt, 0.35 * dt);
  if (P.fixedGear) state.gearPosition = 1;
  else state.gearPosition += clamp((state.gear ? 1 : 0) - state.gearPosition, -dt / P.gear.transit, dt / P.gear.transit);
  state.fuel = Math.max(0, state.fuel - (T.fuelIdle + state.engine * T.fuelPerEngine + (state.afterburnerLevel || 0) * (T.afterburnerFuel || 0)) * dt);
  const mass = P.emptyMass + state.fuel;
  const qArea = 0.5 * air.density * air.speed * air.speed * P.wingArea;
  const groundSurface = state.carrier && onCarrierDeck(state.position) ? runwayOf(state).elevation : state.groundElevation;
  const aero = coefficients(P, air.aoa, state.flapPosition, state.spoilers, state.position.y - groundSurface);
  let lift = qArea * aero.lift;
  if (P.military) lift = clamp(lift, S.minG * mass * G, S.maxG * mass * G);
  const waveDrag = fighterWaveDrag(P, air.speed, state.position.y + RUNWAY.fieldElevation);
  const drag = qArea * (aero.drag + waveDrag + P.aero.cdGear * state.gearPosition + P.aero.betaDrag * Math.abs(air.beta));
  const direction = unit(air.body);
  const liftDirection = unit({ x: 0, y: -air.body.z, z: air.body.y });
  let thrust = 0;
  if (state.fuel > 0) {
    thrust = T.type === 'prop'
      ? propSigma(T, air.density) * state.engine * Math.max(0, P.maxThrust - T.speedSlope * air.speed) - (1 - state.engine) * T.idleDrag * qArea
      : P.maxThrust * state.engine * Math.pow(air.density / 1.225, T.lapseExp) * Math.max(T.floor, 1 - air.speed * T.slope);
  }
  if (P.military && state.fuel > 0) thrust += (T.afterburnerThrust - P.maxThrust) * state.afterburnerLevel * Math.pow(air.density / 1.225, T.lapseExp) * Math.max(T.floor, 1 - air.speed * T.slope);
  const bodyForce = {
    x: -drag * direction.x - qArea * air.beta * P.aero.sideForce,
    y: lift * liftDirection.y - drag * direction.y,
    z: lift * liftDirection.z - drag * direction.z - thrust,
  };
  const force = rotateVector(state.quaternion, bodyForce);
  let acceleration = { x: force.x / mass, y: force.y / mass - G, z: force.z / mass };
  state.gLoad = bodyForce.y / (mass * G);

  // Stability augmentation damps angular rates while retaining AoA trim, stall and inertia.
  const targetAoA = trimAoA(P, state, qArea);
  let pitchRateTarget = controls.pitch * S.pitch + clamp((targetAoA - air.aoa) * S.aoaGain, -S.aoaLimit, S.aoaLimit);
  if (P.military && !state.onGround) {
    // Approximate fly-by-wire envelope protection: progressively unload near G/AoA limits.
    const up = Math.min(clamp((S.maxG - state.gLoad) / 2, 0, 1), clamp((S.maxAoA - air.aoa / RAD) / 5, 0, 1));
    const down = clamp((state.gLoad - S.minG) / 1.5, 0, 1);
    pitchRateTarget *= pitchRateTarget > 0 ? up : down;
    if (air.aoa / RAD > S.maxAoA) pitchRateTarget = Math.min(pitchRateTarget, -.15);
  }
  const rollRateTarget = -controls.roll * S.roll;
  const yawRateTarget = -controls.yaw * S.yaw - air.beta * S.betaGain;
  const controlAuthority = clamp(qArea / S.authorityQ, 0, S.authorityMax);
  const omega = state.angularVelocity;
  const pitchMoment = P.inertia.x * (pitchRateTarget - omega.x) * S.pitchK * controlAuthority;
  const rollMoment = P.inertia.z * (rollRateTarget - omega.z) * S.rollK * controlAuthority;
  const yawMoment = P.inertia.y * (yawRateTarget - omega.y) * S.yawK * controlAuthority;
  // Rigid-body cross terms conserve the coupling between yaw, roll and pitch.
  omega.x += (pitchMoment - (P.inertia.z - P.inertia.y) * omega.y * omega.z) / P.inertia.x * dt;
  omega.y += (yawMoment - (P.inertia.x - P.inertia.z) * omega.z * omega.x) / P.inertia.y * dt;
  omega.z += (rollMoment - (P.inertia.y - P.inertia.x) * omega.x * omega.y) / P.inertia.z * dt;

  if (state.onGround) {
    const groundSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    const normal = Math.max(0, G - force.y / mass);
    const onRunway = Math.abs(state.position.x) <= RUNWAY.width / 2 && Math.abs(state.position.z) <= RUNWAY.length / 2;
    const friction = (onRunway ? GR.friction : GR.frictionOff) * normal + controls.brake * GR.brake;
    if (groundSpeed > 0.005) {
      const braking = Math.min(friction, groundSpeed / dt);
      acceleration.x -= braking * state.velocity.x / groundSpeed;
      acceleration.z -= braking * state.velocity.z / groundSpeed;
    }
    const right = rotateVector(state.quaternion, { x: 1, y: 0, z: 0 });
    const side = state.velocity.x * right.x + state.velocity.z * right.z;
    const grip = Math.min(GR.grip, Math.abs(side) * 3) * Math.sign(side) * clamp(normal / G, 0, 1);
    acceleration.x -= grip * right.x;
    acceleration.z -= grip * right.z;
    const steering = -controls.yaw * GR.steer * clamp(groundSpeed / 4, 0, 1) / (1 + groundSpeed / GR.steerSpeed);
    omega.y += (steering - omega.y) * (1 - Math.exp(-dt * 4));
    omega.z += (angles.roll * RAD * 2.5 - omega.z) * (1 - Math.exp(-dt * 8));
    if (groundSpeed < GR.noseHoldSpeed || (controls.pitch <= 0.05 && angles.pitch < 0.5)) {
      omega.x += (-angles.pitch * RAD * 4 - omega.x) * (1 - Math.exp(-dt * 8));
    }
    if (angles.pitch < 0) omega.x += (-angles.pitch * RAD * 4 - omega.x) * (1 - Math.exp(-dt * 8));
    if (angles.pitch > CR.tailPitch && groundSpeed > CR.strikeSpeed) { crash(state, 'tail-strike'); return; }
    if (Math.abs(angles.roll) > CR.wingRoll && groundSpeed > CR.strikeSpeed) { crash(state, 'wing-strike'); return; }
    if (!state.arrested && force.y > mass * G * GR.liftOffForce && groundSpeed > GR.liftOffSpeed) {
      state.onGround = false;
    } else {
      acceleration.y = 0;
      state.velocity.y = 0;
      state.position.y = RUNWAY.elevation + P.gearHeight;
      state.gLoad = 1;
    }
  }

  if (state.arrested && state.onGround) {
    const speed = Math.hypot(state.velocity.x, state.velocity.z), deceleration = Math.min(CARRIER.arrestDeceleration, speed / dt);
    acceleration.x = speed > .001 ? -state.velocity.x / speed * deceleration : 0;
    acceleration.z = speed > .001 ? -state.velocity.z / speed * deceleration : 0;
  }
  state.velocity.x += acceleration.x * dt;
  state.velocity.y += acceleration.y * dt;
  state.velocity.z += acceleration.z * dt;
  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;

  const rate = length(omega);
  if (rate > 0) {
    const half = rate * dt / 2;
    const scale = Math.sin(half) / rate;
    state.quaternion = normalizeQuaternion(multiplyQuaternion(state.quaternion,
      { x: omega.x * scale, y: omega.y * scale, z: omega.z * scale, w: Math.cos(half) }));
  }

  const onRunway = Math.abs(state.position.x) <= RUNWAY.width / 2 && Math.abs(state.position.z) <= RUNWAY.length / 2;
  const onDeck = state.carrier && onCarrierDeck(state.position);
  const contactHeight = (onRunway || onDeck ? RUNWAY.elevation : state.groundElevation) + (state.gearPosition > 0.95 ? P.gearHeight : P.gear.bellyHeight);
  // Descending contact is a touchdown; rising terrain (not the runway) is hit regardless of vertical speed.
  const terrainHit = !onRunway && state.velocity.y > 0 && state.position.y < contactHeight - 0.05;
  if (!state.onGround && state.position.y <= contactHeight && (state.velocity.y <= 0 || terrainHit)) {
    const landingAngles = attitude(state.quaternion);
    state.touchdown = {
      sinkRate: Math.max(0, -state.velocity.y), speed: air.speed,
      lateralOffset: state.position.x, position: copy(state.position),
      pitch: landingAngles.pitch, roll: landingAngles.roll,
      headingError: wrapAngle(landingAngles.heading - RUNWAY.heading), elapsed: state.elapsed,
    };
    state.position.y = contactHeight;
    if (terrainHit || state.touchdown.sinkRate > CR.impactSink || air.speed > CR.impactSpeed || landingAngles.pitch < -4) crash(state, 'ground-impact');
    else if (state.gearPosition < 0.95) crash(state, 'gear-up');
    else if (Math.abs(state.position.x) > RUNWAY.width / 2 || Math.abs(state.position.z) > RUNWAY.length / 2) crash(state, 'off-runway');
    else if (state.touchdown.sinkRate > (state.carrier ? 7 : CR.hardSink)) crash(state, 'hard-landing');
    else if (Math.abs(landingAngles.roll) > CR.landingRoll) crash(state, 'wing-strike');
    else if (landingAngles.pitch > CR.landingPitch) crash(state, 'tail-strike');
    else if (Math.abs(state.touchdown.headingError) > CR.sideHeading) crash(state, 'side-load');
    state.onGround = true;
    state.velocity.y = 0;
    state.angularVelocity.x *= 0.2;
    state.angularVelocity.z *= 0.2;
  }
  if (state.carrier && !state.crashed && !state.arrested) {
    const hookZ = state.position.z + CARRIER.hookAftM;
    const wire = crossedArrestingWire(state, previousHookZ, hookZ, wrapAngle(attitude(state.quaternion).heading));
    if (wire !== null) { state.arrested = { wire, elapsed: state.elapsed, speed: Math.hypot(state.velocity.x, state.velocity.z), z: state.position.z }; state.afterburner = false; state.bolter = false; }
    else if (state.onGround && hookZ < CARRIER.wires.at(-1)) state.bolter = true;
  }
  if (!state.carrier && state.onGround && state.position.z < RUNWAY.farThreshold - 60 && Math.hypot(state.velocity.x, state.velocity.z) > CR.overrunSpeed) crash(state, 'runway-overrun');
}

export function stepFlight(state, input = {}, dt = 1 / 120, environment = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || state.crashed) return state;
  const P = profileOf(state);
  // Bound interruption recovery; callers should use a fixed-step accumulator for elapsed real time.
  dt = Math.min(dt, 0.25);
  state.wind = copy(environment.wind || state.wind);
  state.groundElevation = state.carrier ? CARRIER.seaHeight : environment.groundElevation || 0;
  if (P.hasHook) state.hook = input.hook ?? state.hook;
  state.flaps = clamp(Math.round(input.flaps ?? state.flaps), 0, 3);
  // Fixed gear and no spoilers on the light aircraft: those inputs are ignored.
  state.gear = P.fixedGear ? true : input.gear ?? state.gear;
  state.trim = clamp(input.trim ?? state.trim, -1, 1);
  state.spoilers = P.hasSpoilers ? input.spoilers ?? state.spoilers : false;
  if (P.military) state.afterburner = input.afterburner ?? state.afterburner;
  state.brake = clamp(input.brake ?? 0, 0, 1);
  if (input.autopilot) Object.assign(state.autopilot, input.autopilot);
  const controls = {
    pitch: clamp(input.pitch || 0, -1, 1), roll: clamp(input.roll || 0, -1, 1), yaw: clamp(input.yaw || 0, -1, 1),
    throttle: clamp(input.throttle ?? state.throttle, 0, 1), brake: state.brake,
  };
  const steps = Math.ceil(dt * 120);
  const slice = dt / steps;
  for (let i = 0; i < steps && !state.crashed; i++) {
    state.elapsed += slice;
    advance(state, controls, slice);
  }
  return state;
}

export function getFlightData(state, runway = runwayOf(state)) {
  const P = profileOf(state);
  const air = airState(state);
  const angles = attitude(state.quaternion);
  const groundSurface = state.carrier && onCarrierDeck(state.position) ? runwayOf(state).elevation : state.groundElevation;
  const aero = coefficients(P, air.aoa, state.flapPosition, state.spoilers, state.position.y - groundSurface);
  const mass = P.emptyMass + state.fuel;
  const stallSpeed = Math.sqrt(2 * mass * G / (air.density * P.wingArea * aero.maxLift));
  const distance = state.position.z - runway.nearThreshold;
  const localizerDistance = state.position.z - (runway.farThreshold - 300);
  const glideDistance = state.position.z - runway.touchdownTarget;
  const aligned = Math.abs(wrapAngle(angles.heading - runway.heading)) < 40;
  const ilsValid = !state.onGround && !state.crashed && aligned && localizerDistance > 0;
  const gsValid = ilsValid && glideDistance > 0;
  const localizer = ilsValid ? Math.atan2(state.position.x, localizerDistance) / RAD : 0;
  const glideslope = gsValid ? Math.atan2(state.position.y - runway.elevation - P.gearHeight, glideDistance) / RAD - runway.glideslope : 0;
  const running = state.fuel > 0 && !state.crashed;
  return {
    ...(P.military ? { mach: air.speed / speedOfSound(state.position.y + runway.fieldElevation), afterburnerLevel: state.afterburnerLevel, trimPitchRate: clamp((trimAoA(P, state, .5 * air.density * air.speed * air.speed * P.wingArea) - air.aoa) * P.sas.aoaGain, -P.sas.aoaLimit, P.sas.aoaLimit), gLimitWarning: state.gLoad > P.sas.maxG - .5 || state.gLoad < P.sas.minG + .5 } : {}),
    ...angles, airspeed: air.speed, indicatedAirspeed: air.speed * Math.sqrt(air.density / 1.225),
    groundSpeed: Math.hypot(state.velocity.x, state.velocity.z), altitude: state.position.y,
    agl: state.position.y - (state.carrier ? runway.elevation : state.groundElevation), verticalSpeed: state.velocity.y,
    groundTrack: (Math.atan2(state.velocity.x, -state.velocity.z) / RAD + 360) % 360,
    aoa: air.aoa / RAD, sideslip: air.beta / RAD, gLoad: state.gLoad,
    stallSpeed, stallWarning: !state.onGround && (air.aoa > aero.stallAlpha - 2 * RAD || air.speed < stallSpeed * 1.08),
    overspeedWarning: air.speed * Math.sqrt(air.density / 1.225) > speedLimit(P, state.flapPosition),
    gearWarning: !P.fixedGear && !state.onGround && state.position.y < 180 && state.velocity.y < -0.5 && state.gearPosition < 0.95,
    engineN1: running ? 20 + state.engine * 80 : 0,
    // Synthetic RPM for the light aircraft's tachometer (fixed-pitch prop: the real value also depends on airspeed).
    ...(P.ui.rpm ? { engineRpm: running ? P.ui.rpm.idle + state.engine * (P.ui.rpm.max - P.ui.rpm.idle) : 0 } : {}),
    ...(P.hasHook ? { hookPosition: state.hookPosition, arrested: state.arrested, bolter: state.bolter } : {}),
    distanceToThreshold: distance, localizer, glideslope,
    localizerDeviation: localizer, glideslopeDeviation: glideslope, ilsValid, gsValid,
    runwayRemaining: Math.max(0, state.position.z - runway.farThreshold),
    onRunway: Math.abs(state.position.x) <= runway.width / 2 && Math.abs(state.position.z) <= runway.length / 2,
    onGround: state.onGround, crashed: state.crashed, crashReason: state.crashReason,
    fuel: state.fuel, throttle: state.throttle, trim: state.trim,
    flapPosition: state.flapPosition, gearPosition: state.gearPosition,
    windSpeed: Math.hypot(state.wind.x, state.wind.z),
    windDirection: (Math.atan2(-state.wind.x, state.wind.z) / RAD + 360) % 360,
  };
}
