// Generic twin-engine narrowbody. SI units; this is a simulation model, not aircraft certification data.
export const AIRCRAFT = Object.freeze({
  name: 'MQ-320', emptyMass: 50000, initialFuel: 8500,
  wingArea: 122.6, span: 35.8, length: 37.6, chord: 3.5,
  maxThrust: 240000, gearHeight: 4, maxSpeed: 155, rotateSpeed: 72,
  inertia: Object.freeze({ x: 5100000, y: 5700000, z: 1700000 }),
});
export const RUNWAY = Object.freeze({
  length: 3660, width: 60, elevation: 0, nearThreshold: 1830,
  farThreshold: -1830, heading: 0, touchdownTarget: 1430,
});

const G = 9.80665;
const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const length = v => Math.hypot(v.x, v.y, v.z);
const wrapAngle = v => ((v + 180) % 360 + 360) % 360 - 180;
const unit = v => { const n = length(v) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
const copy = v => ({ x: v.x || 0, y: v.y || 0, z: v.z || 0 });
// Indicated-airspeed limit (m/s): VMO clean, reduced with flap extension.
const speedLimit = flapPosition => flapPosition > 0.2 ? 120 - 11 * flapPosition : AIRCRAFT.maxSpeed;

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

function airState(state) {
  const wind = state.wind;
  const relative = { x: state.velocity.x - wind.x, y: state.velocity.y - wind.y, z: state.velocity.z - wind.z };
  const body = inverseRotate(state.quaternion, relative);
  const speed = length(relative);
  return {
    relative, body, speed,
    aoa: speed > 1 ? Math.atan2(-body.y, -body.z) : 0,
    beta: speed > 1 ? Math.asin(clamp(body.x / speed, -1, 1)) : 0,
    density: atmosphere(state.position.y),
  };
}

function coefficients(aoa, flap, spoilers, agl) {
  const fraction = flap / 3;
  const slope = 5.1;
  const cl0 = 0.22 + 0.75 * fraction;
  const stallAlpha = (16 - fraction) * RAD;
  const maxLift = cl0 + slope * stallAlpha;
  let lift = cl0 + slope * aoa;
  if (aoa > stallAlpha) {
    lift = maxLift * (0.55 + 0.45 * Math.exp(-(aoa - stallAlpha) * 9)) * Math.max(0.12, Math.cos(aoa));
  } else if (aoa < -18 * RAD) {
    const negativeMax = cl0 - slope * 18 * RAD;
    lift = negativeMax * (0.55 + 0.45 * Math.exp((aoa + 18 * RAD) * 9)) * Math.max(0.12, Math.cos(aoa));
  }
  const groundEffect = 1 + 0.1 * clamp(1 - Math.max(0, agl) / (AIRCRAFT.span * 0.5), 0, 1);
  lift *= groundEffect * (spoilers ? 0.55 : 1);
  const separated = Math.max(0, Math.abs(aoa) - stallAlpha);
  return {
    lift, maxLift, stallAlpha,
    drag: 0.023 + fraction * 0.07 + 0.045 * lift * lift + (spoilers ? 0.065 : 0) + 0.9 * separated,
  };
}

export function createFlightState(scenario = 'runway') {
  const approach = scenario === 'approach';
  const cruise = scenario === 'cruise';
  const speed = approach ? 75 : cruise ? 120 : 0;
  const altitude = approach ? 370 : cruise ? 1800 : AIRCRAFT.gearHeight;
  const gamma = approach ? -3 * RAD : 0;
  const pitch = approach ? 2 * RAD : cruise ? 4.6 * RAD : 0;
  const state = {
    scenario: approach ? 'approach' : cruise ? 'cruise' : 'runway',
    position: { x: cruise ? -1400 : 0, y: altitude, z: approach ? 8830 : cruise ? 6000 : 1650 },
    velocity: { x: 0, y: speed * Math.sin(gamma), z: -speed * Math.cos(gamma) },
    quaternion: quaternionFromEuler(pitch), angularVelocity: { x: 0, y: 0, z: 0 },
    throttle: approach ? 0.24 : cruise ? 0.205 : 0,
    engine: approach ? 0.24 : cruise ? 0.205 : 0,
    flaps: approach ? 3 : cruise ? 0 : 1,
    flapPosition: approach ? 3 : cruise ? 0 : 1,
    gear: !cruise, gearPosition: cruise ? 0 : 1,
    trim: approach ? 0.29 : cruise ? 0.25 : 0.15,
    brake: 0, spoilers: false, fuel: AIRCRAFT.initialFuel,
    onGround: !approach && !cruise, crashed: false, crashReason: '',
    elapsed: 0, touchdown: null, gLoad: 1,
    groundElevation: 0,
    wind: { x: 0, y: 0, z: 0 },
    // Autopilot speed is indicated airspeed in m/s, matching the cockpit speed selector.
    autopilot: { enabled: false, heading: 0, altitude: approach ? 370 : cruise ? 1800 : 1000, speed: (speed || 120) * Math.sqrt(atmosphere(altitude) / 1.225) },
  };
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

function autopilotControls(state, controls, air, angles, dt) {
  if (!state.autopilot.enabled || state.onGround) return controls;
  const ap = state.autopilot;
  const headingError = wrapAngle(ap.heading - angles.heading);
  const bankTarget = clamp(headingError * 0.8, -25, 25);
  const altitudeError = ap.altitude - state.position.y;
  const verticalTarget = clamp(altitudeError * 0.035, -8, 8);
  const flightPath = Math.atan2(state.velocity.y, Math.hypot(state.velocity.x, state.velocity.z)) / RAD;
  const pitchTarget = clamp((verticalTarget - state.velocity.y) * 0.75 + flightPath + air.aoa / RAD, -6, 13);
  const aero = coefficients(air.aoa, state.flapPosition, state.spoilers, state.position.y - state.groundElevation);
  const drag = 0.5 * air.density * air.speed * air.speed * AIRCRAFT.wingArea * (aero.drag + 0.019 * state.gearPosition);
  const climbThrust = (AIRCRAFT.emptyMass + state.fuel) * G * state.velocity.y / Math.max(air.speed, 30);
  const availableThrust = AIRCRAFT.maxThrust * Math.pow(air.density / 1.225, 0.7) * Math.max(0.55, 1 - air.speed * 0.0011);
  const indicatedSpeed = air.speed * Math.sqrt(air.density / 1.225);
  // Never command a speed above the current flap limit (4 m/s margin) and pull thrust back if above it.
  const speedCap = speedLimit(state.flapPosition) - 4;
  const speedError = Math.min(ap.speed, speedCap) - indicatedSpeed;
  ap.speedIntegral = clamp((ap.speedIntegral || 0) + speedError * dt * 0.0015, -0.18, 0.18);
  const trimPitchRate = clamp(((2.6 + state.trim * 8) * RAD - air.aoa) * 0.55, -0.13, 0.13);
  return {
    ...controls,
    pitch: clamp((pitchTarget - angles.pitch) * 0.12 - state.angularVelocity.x * 2 - trimPitchRate / 0.19, -0.65, 0.65),
    roll: clamp((bankTarget - angles.roll) * 0.055 + state.angularVelocity.z * 1.8, -0.65, 0.65),
    yaw: clamp(air.beta * 1.4, -0.3, 0.3),
    throttle: clamp((drag + climbThrust) / availableThrust + speedError * 0.025 + ap.speedIntegral - Math.max(0, indicatedSpeed - speedCap) * 0.2, 0, 1),
  };
}

function advance(state, controls, dt) {
  const air = airState(state);
  const angles = attitude(state.quaternion);
  controls = autopilotControls(state, controls, air, angles, dt);
  state.throttle = controls.throttle;
  state.engine += (state.throttle - state.engine) * (1 - Math.exp(-dt / (state.throttle > state.engine ? 3.5 : 2.2)));
  state.flapPosition += clamp(state.flaps - state.flapPosition, -0.35 * dt, 0.35 * dt);
  state.gearPosition += clamp((state.gear ? 1 : 0) - state.gearPosition, -dt / 5, dt / 5);
  state.fuel = Math.max(0, state.fuel - (0.12 + state.engine * 1.23) * dt);
  const mass = AIRCRAFT.emptyMass + state.fuel;
  const qArea = 0.5 * air.density * air.speed * air.speed * AIRCRAFT.wingArea;
  const aero = coefficients(air.aoa, state.flapPosition, state.spoilers, state.position.y - state.groundElevation);
  const lift = qArea * aero.lift;
  const drag = qArea * (aero.drag + 0.019 * state.gearPosition + 0.2 * Math.abs(air.beta));
  const direction = unit(air.body);
  const liftDirection = unit({ x: 0, y: -air.body.z, z: air.body.y });
  const thrust = state.fuel > 0 ? AIRCRAFT.maxThrust * state.engine * Math.pow(air.density / 1.225, 0.7) * Math.max(0.55, 1 - air.speed * 0.0011) : 0;
  const bodyForce = {
    x: -drag * direction.x - qArea * air.beta * 0.72,
    y: lift * liftDirection.y - drag * direction.y,
    z: lift * liftDirection.z - drag * direction.z - thrust,
  };
  const force = rotateVector(state.quaternion, bodyForce);
  let acceleration = { x: force.x / mass, y: force.y / mass - G, z: force.z / mass };
  state.gLoad = bodyForce.y / (mass * G);

  // Stability augmentation damps angular rates while retaining AoA trim, stall and inertia.
  const targetAoA = (2.6 + state.trim * 8) * RAD;
  const pitchRateTarget = controls.pitch * 0.19 + clamp((targetAoA - air.aoa) * 0.55, -0.13, 0.13);
  const rollRateTarget = -controls.roll * 0.31;
  const yawRateTarget = -controls.yaw * 0.105 - air.beta * 0.55;
  const controlAuthority = clamp(qArea / 260000, 0, 1.9);
  const omega = state.angularVelocity;
  const pitchMoment = AIRCRAFT.inertia.x * (pitchRateTarget - omega.x) * 0.95 * controlAuthority;
  const rollMoment = AIRCRAFT.inertia.z * (rollRateTarget - omega.z) * 2.1 * controlAuthority;
  const yawMoment = AIRCRAFT.inertia.y * (yawRateTarget - omega.y) * 0.85 * controlAuthority;
  // Rigid-body cross terms conserve the coupling between yaw, roll and pitch.
  omega.x += (pitchMoment - (AIRCRAFT.inertia.z - AIRCRAFT.inertia.y) * omega.y * omega.z) / AIRCRAFT.inertia.x * dt;
  omega.y += (yawMoment - (AIRCRAFT.inertia.x - AIRCRAFT.inertia.z) * omega.z * omega.x) / AIRCRAFT.inertia.y * dt;
  omega.z += (rollMoment - (AIRCRAFT.inertia.y - AIRCRAFT.inertia.x) * omega.x * omega.y) / AIRCRAFT.inertia.z * dt;

  if (state.onGround) {
    const groundSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    const normal = Math.max(0, G - force.y / mass);
    const onRunway = Math.abs(state.position.x) <= RUNWAY.width / 2 && Math.abs(state.position.z) <= RUNWAY.length / 2;
    const friction = (onRunway ? 0.014 : 0.085) * normal + controls.brake * 3.8;
    if (groundSpeed > 0.005) {
      const braking = Math.min(friction, groundSpeed / dt);
      acceleration.x -= braking * state.velocity.x / groundSpeed;
      acceleration.z -= braking * state.velocity.z / groundSpeed;
    }
    const right = rotateVector(state.quaternion, { x: 1, y: 0, z: 0 });
    const side = state.velocity.x * right.x + state.velocity.z * right.z;
    const grip = Math.min(5.5, Math.abs(side) * 3) * Math.sign(side) * clamp(normal / G, 0, 1);
    acceleration.x -= grip * right.x;
    acceleration.z -= grip * right.z;
    const steering = -controls.yaw * 0.4 * clamp(groundSpeed / 4, 0, 1) / (1 + groundSpeed / 18);
    omega.y += (steering - omega.y) * (1 - Math.exp(-dt * 4));
    omega.z += (angles.roll * RAD * 2.5 - omega.z) * (1 - Math.exp(-dt * 8));
    if (groundSpeed < 35 || (controls.pitch <= 0.05 && angles.pitch < 0.5)) {
      omega.x += (-angles.pitch * RAD * 4 - omega.x) * (1 - Math.exp(-dt * 8));
    }
    if (angles.pitch < 0) omega.x += (-angles.pitch * RAD * 4 - omega.x) * (1 - Math.exp(-dt * 8));
    if (angles.pitch > 12.5 && groundSpeed > 25) { crash(state, 'tail-strike'); return; }
    if (Math.abs(angles.roll) > 8 && groundSpeed > 25) { crash(state, 'wing-strike'); return; }
    if (force.y > mass * G * 1.015 && groundSpeed > 40) {
      state.onGround = false;
    } else {
      acceleration.y = 0;
      state.velocity.y = 0;
      state.position.y = RUNWAY.elevation + AIRCRAFT.gearHeight;
      state.gLoad = 1;
    }
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
  const contactHeight = (onRunway ? RUNWAY.elevation : state.groundElevation) + (state.gearPosition > 0.95 ? AIRCRAFT.gearHeight : 1.4);
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
    if (terrainHit || state.touchdown.sinkRate > 10 || air.speed > 110 || landingAngles.pitch < -4) crash(state, 'ground-impact');
    else if (state.gearPosition < 0.95) crash(state, 'gear-up');
    else if (Math.abs(state.position.x) > RUNWAY.width / 2 || Math.abs(state.position.z) > RUNWAY.length / 2) crash(state, 'off-runway');
    else if (state.touchdown.sinkRate > 4.5) crash(state, 'hard-landing');
    else if (Math.abs(landingAngles.roll) > 8) crash(state, 'wing-strike');
    else if (landingAngles.pitch > 13) crash(state, 'tail-strike');
    else if (Math.abs(state.touchdown.headingError) > 20) crash(state, 'side-load');
    state.onGround = true;
    state.velocity.y = 0;
    state.angularVelocity.x *= 0.2;
    state.angularVelocity.z *= 0.2;
  }
  if (state.onGround && state.position.z < RUNWAY.farThreshold - 60 && Math.hypot(state.velocity.x, state.velocity.z) > 35) crash(state, 'runway-overrun');
}

export function stepFlight(state, input = {}, dt = 1 / 120, environment = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || state.crashed) return state;
  // Bound interruption recovery; callers should use a fixed-step accumulator for elapsed real time.
  dt = Math.min(dt, 0.25);
  state.wind = copy(environment.wind || state.wind);
  state.groundElevation = environment.groundElevation || 0;
  state.flaps = clamp(Math.round(input.flaps ?? state.flaps), 0, 3);
  state.gear = input.gear ?? state.gear;
  state.trim = clamp(input.trim ?? state.trim, -1, 1);
  state.spoilers = input.spoilers ?? state.spoilers;
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

export function getFlightData(state) {
  const air = airState(state);
  const angles = attitude(state.quaternion);
  const aero = coefficients(air.aoa, state.flapPosition, state.spoilers, state.position.y - state.groundElevation);
  const mass = AIRCRAFT.emptyMass + state.fuel;
  const stallSpeed = Math.sqrt(2 * mass * G / (air.density * AIRCRAFT.wingArea * aero.maxLift));
  const distance = state.position.z - RUNWAY.nearThreshold;
  const localizerDistance = state.position.z - (RUNWAY.farThreshold - 300);
  const glideDistance = state.position.z - RUNWAY.touchdownTarget;
  const aligned = Math.abs(wrapAngle(angles.heading - RUNWAY.heading)) < 40;
  const ilsValid = !state.onGround && !state.crashed && aligned && localizerDistance > 0;
  const gsValid = ilsValid && glideDistance > 0;
  const localizer = ilsValid ? Math.atan2(state.position.x, localizerDistance) / RAD : 0;
  const glideslope = gsValid ? Math.atan2(state.position.y - AIRCRAFT.gearHeight, glideDistance) / RAD - 3 : 0;
  return {
    ...angles, airspeed: air.speed, indicatedAirspeed: air.speed * Math.sqrt(air.density / 1.225),
    groundSpeed: Math.hypot(state.velocity.x, state.velocity.z), altitude: state.position.y,
    agl: state.position.y - state.groundElevation, verticalSpeed: state.velocity.y,
    groundTrack: (Math.atan2(state.velocity.x, -state.velocity.z) / RAD + 360) % 360,
    aoa: air.aoa / RAD, sideslip: air.beta / RAD, gLoad: state.gLoad,
    stallSpeed, stallWarning: !state.onGround && (air.aoa > aero.stallAlpha - 2 * RAD || air.speed < stallSpeed * 1.08),
    overspeedWarning: air.speed * Math.sqrt(air.density / 1.225) > speedLimit(state.flapPosition),
    gearWarning: !state.onGround && state.position.y < 180 && state.velocity.y < -0.5 && state.gearPosition < 0.95,
    engineN1: state.fuel > 0 && !state.crashed ? 20 + state.engine * 80 : 0,
    distanceToThreshold: distance, localizer, glideslope,
    localizerDeviation: localizer, glideslopeDeviation: glideslope, ilsValid, gsValid,
    runwayRemaining: Math.max(0, state.position.z - RUNWAY.farThreshold),
    onRunway: Math.abs(state.position.x) <= RUNWAY.width / 2 && Math.abs(state.position.z) <= RUNWAY.length / 2,
    onGround: state.onGround, crashed: state.crashed, crashReason: state.crashReason,
    fuel: state.fuel, throttle: state.throttle, trim: state.trim,
    flapPosition: state.flapPosition, gearPosition: state.gearPosition,
    windSpeed: Math.hypot(state.wind.x, state.wind.z),
    windDirection: (Math.atan2(-state.wind.x, state.wind.z) / RAD + 360) % 360,
  };
}
