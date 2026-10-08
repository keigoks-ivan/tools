import { TRACK } from './track.mjs';
import { VEHICLES } from './vehicles.mjs';

const G = 9.80665, TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const wrap = (value, length) => ((value % length) + length) % length;
const angleDelta = (a, b) => wrap(b - a + Math.PI, TAU) - Math.PI;

// SI units and radians throughout. This is a simplified rear-drive bicycle
// model with axle load transfer and combined tyre grip, not a full tyre solver.
export function createDrivingState(track = TRACK) {
  const p = track.spawn || track.sample(0);
  return {
    x: p.x, y: p.y, z: p.z, heading: p.heading,
    vx: 0, vz: 0, speed: 0, yawRate: 0, steering: 0, steeringAngle: 0,
    throttle: 0, brake: 0, braking: 0, rpm: 950, gear: 1,
    slip: 0, slipAngle: 0, frontSlip: 0, rearSlip: 0,
    longitudinalAccel: 0, lateralAccel: 0,
    offTrack: false, s: p.s || 0, offset: 0,
    lap: 1, lapTime: 0, lastLap: null, bestLap: null, lastLapValid: false,
    invalidLap: false, collision: 0, elapsed: 0,
    _lastS: p.s || 0, _lastX: p.x, _lastZ: p.z, _lastSpeed: 0,
    _checkpointCount: 0, _nextCheckpoint: 1,
  };
}

export function resetDriving(state, track = TRACK) {
  Object.assign(state, createDrivingState(track));
  return state;
}

function updateLap(state, road, dt, track) {
  state.lapTime += dt;
  const delta = angleDelta(state._lastS / track.length * TAU, road.s / track.length * TAU) / TAU * track.length;
  const displacement = Math.hypot(state.x - state._lastX, state.z - state._lastZ);
  const motionLimit = Math.max(3, Math.max(state.speed, state._lastSpeed) * dt * 1.8 + 1);
  const continuous = Math.abs(delta) <= motionLimit && displacement <= motionLimit;
  const forward = Math.cos(state.heading - road.heading) > .15;
  if (!continuous) {
    state.invalidLap = true;
    state._checkpointCount = 0; state._nextCheckpoint = 1;
  }
  if (state.offTrack) state.invalidLap = true;

  const crossedStart = state._lastS > track.length * .75 && road.s < track.length * .25 && delta > 0;
  if (continuous && forward && delta > 0) {
    const checkpoint = track.length * state._nextCheckpoint / 8;
    const toCheckpoint = wrap(checkpoint - state._lastS, track.length);
    if (state._nextCheckpoint < 8 && toCheckpoint > 0 && toCheckpoint <= delta + 1e-6) {
      state._checkpointCount++; state._nextCheckpoint++;
    }
    if (crossedStart) {
      if (state._checkpointCount === 7) {
        state.lastLap = state.lapTime;
        state.lastLapValid = !state.invalidLap;
        if (state.lastLapValid && (state.bestLap === null || state.lastLap < state.bestLap)) state.bestLap = state.lastLap;
        state.lap++;
      }
      state.lapTime = 0; state.invalidLap = state.offTrack;
      state._checkpointCount = 0; state._nextCheckpoint = 1;
    }
  }
  // Crossing the timing line backwards cannot complete or preserve a circuit.
  if (state._lastS < track.length * .25 && road.s > track.length * .75 && delta < 0) {
    state.invalidLap = true; state._checkpointCount = 0; state._nextCheckpoint = 1;
  }
  state._lastS = road.s; state._lastX = state.x; state._lastZ = state.z; state._lastSpeed = state.speed;
}

function advance(state, input, dt, track, CAR) {
  const roadBefore = track.nearest(state.x, state.z, state.s);
  const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
  let longitudinal = state.vx * sin + state.vz * cos;
  let lateral = state.vx * cos - state.vz * sin;
  const speed = Math.hypot(longitudinal, lateral);
  const desiredSteer = clamp(Number(input.steer) || 0, -1, 1);
  state.steering += clamp(desiredSteer - state.steering, -dt * 3.0, dt * 3.0);
  state.throttle += clamp(clamp(Number(input.throttle) || 0, 0, 1) - state.throttle, -dt * 5, dt * 2.8);
  state.brake += clamp(clamp(Number(input.brake) || 0, 0, 1) - state.brake, -dt * 7, dt * 8);
  const steerAngle = state.steering * CAR.steerLock / (1 + Math.max(0, longitudinal) * .020);
  state.steeringAngle = steerAngle; state.braking = state.brake;

  const wheelbase = CAR.frontAxle + CAR.rearAxle;
  const frontLoad = clamp(CAR.mass * (G * CAR.rearAxle - state.longitudinalAccel * CAR.cgHeight) / wheelbase,
    CAR.mass * G * .28, CAR.mass * G * .72);
  const rearLoad = CAR.mass * G - frontLoad;
  const offset = Math.abs(roadBefore.offset);
  const grip = (offset <= track.width / 2 ? 1.06 : offset <= track.width / 2 + (track.shoulderWidth || 2) ? .70 : .47) * CAR.grip;
  const frontLimit = frontLoad * grip, rearLimit = rearLoad * grip;

  const wheelRpm = Math.max(0, longitudinal) / CAR.tyreRadius * CAR.finalDrive * 60 / TAU;
  let rpm = Math.max(CAR.idle, wheelRpm * CAR.gears[state.gear - 1]);
  if (rpm > CAR.upshift && state.gear < CAR.gears.length) state.gear++;
  else if (rpm < CAR.downshift && state.gear > 1) state.gear--;
  rpm = Math.max(CAR.idle, wheelRpm * CAR.gears[state.gear - 1]);
  const torque = CAR.torque * (.68 + .32 * Math.exp(-(((rpm - CAR.torquePeak) / CAR.torqueSpread) ** 2)));
  let drive = state.throttle * torque * CAR.gears[state.gear - 1] * CAR.finalDrive * .9 / CAR.tyreRadius;
  if (rpm > CAR.limiter) drive *= clamp((CAR.redline + 100 - rpm) / (CAR.redline + 100 - CAR.limiter), 0, 1);
  if (input.stability !== false) drive = Math.min(drive, rearLimit * .84);
  const brakeForce = state.brake * CAR.mass * G * CAR.braking;
  const frontLong = -Math.min(brakeForce * .64, frontLimit * .98);
  const rearLong = clamp(drive - brakeForce * .36, -rearLimit * .98, rearLimit * .995);
  const frontLateralLimit = Math.sqrt(Math.max(0, frontLimit ** 2 - frontLong ** 2));
  const rearLateralLimit = Math.sqrt(Math.max(0, rearLimit ** 2 - rearLong ** 2));
  const frontSlip = Math.atan2(lateral + CAR.frontAxle * state.yawRate, Math.max(3, Math.abs(longitudinal))) - steerAngle;
  const rearSlip = Math.atan2(lateral - CAR.rearAxle * state.yawRate, Math.max(3, Math.abs(longitudinal)));
  const engagement = clamp(speed / 2.5, 0, 1);
  const tyreForce = (stiffness, slip, limit) => -Math.max(1, limit) * Math.tanh(stiffness * slip / Math.max(1, limit)) * engagement;
  const frontLateral = tyreForce(CAR.frontStiffness, frontSlip, frontLateralLimit);
  const rearLateral = tyreForce(CAR.rearStiffness, rearSlip, rearLateralLimit);
  const coast = state.throttle < .03 && state.brake < .03 ? 90 : 0;
  const resistance = speed > .05 ? 145 + CAR.drag * speed * speed + coast + (offset > track.width / 2 ? 180 + speed * 3 : 0) : 0;
  const ahead = track.sample(roadBefore.s + 2), behind = track.sample(roadBefore.s - 2);
  const slope = (ahead.y - behind.y) / 4;
  const longitudinalForce = frontLong + rearLong - frontLateral * Math.sin(steerAngle)
    - resistance * Math.sign(longitudinal) - CAR.mass * G * slope * Math.cos(state.heading - roadBefore.heading);
  const lateralForce = frontLateral * Math.cos(steerAngle) + rearLateral;
  const longAccel = longitudinalForce / CAR.mass, sideAccel = lateralForce / CAR.mass;
  let yawAccel = (CAR.frontAxle * frontLateral * Math.cos(steerAngle) - CAR.rearAxle * rearLateral) / CAR.inertia;
  if (input.stability !== false && speed > 5) {
    const yawLimit = grip * G / Math.max(5, speed);
    const expectedYaw = clamp(longitudinal * Math.tan(steerAngle) / (wheelbase + longitudinal * longitudinal * .004), -yawLimit, yawLimit);
    const excess = state.yawRate - clamp(state.yawRate, expectedYaw - .055, expectedYaw + .055);
    yawAccel -= excess * 10;
  }
  longitudinal = Math.max(0, longitudinal + (longAccel + lateral * state.yawRate) * dt);
  lateral += (sideAccel - longitudinal * state.yawRate) * dt;
  state.yawRate += yawAccel * dt;
  const lowSpeedBlend = clamp(1 - speed / 5, 0, 1);
  state.yawRate += (longitudinal * Math.tan(steerAngle) / wheelbase - state.yawRate) * lowSpeedBlend * Math.min(1, dt * 16);
  lateral *= 1 - lowSpeedBlend * Math.min(1, dt * 12);
  if (longitudinal < .08 && Math.abs(lateral) < .08 && state.throttle < .01) {
    longitudinal = 0; lateral = 0; state.yawRate *= Math.max(0, 1 - dt * 18);
  }
  state.heading = wrap(state.heading + state.yawRate * dt + Math.PI, TAU) - Math.PI;
  const newSin = Math.sin(state.heading), newCos = Math.cos(state.heading);
  state.vx = longitudinal * newSin + lateral * newCos;
  state.vz = longitudinal * newCos - lateral * newSin;
  state.x += state.vx * dt; state.z += state.vz * dt;

  let road = track.nearest(state.x, state.z, roadBefore.s);
  const wall = (track.wallOffset || track.width / 2 + 4.5) - .94;
  state.collision = Math.max(0, state.collision - dt * 2.5);
  if (Math.abs(road.offset) > wall) {
    const side = Math.sign(road.offset), correction = road.offset - side * wall;
    state.x -= road.nx * correction; state.z -= road.nz * correction;
    const outward = (state.vx * road.nx + state.vz * road.nz) * side;
    if (outward > 0) {
      state.vx -= road.nx * side * outward; state.vz -= road.nz * side * outward;
      const impactLoss = clamp(1 - outward * .014, .65, 1);
      state.vx *= impactLoss; state.vz *= impactLoss; state.yawRate *= .65;
      state.collision = Math.max(state.collision, clamp(outward / 12, .1, 1));
    }
    road = track.nearest(state.x, state.z, road.s);
  }
  state.y = road.y; state.s = road.s; state.offset = road.offset;
  state.speed = Math.hypot(state.vx, state.vz);
  state.offTrack = Math.abs(road.offset) > track.width / 2 + .25;
  state.rpm = clamp(rpm + state.throttle * 220, CAR.idle, CAR.redline);
  state.longitudinalAccel = longAccel; state.lateralAccel = sideAccel;
  state.frontSlip = frontSlip; state.rearSlip = rearSlip;
  state.slipAngle = Math.atan2(lateral, Math.max(.5, longitudinal));
  const slip = clamp(Math.max(Math.abs(frontSlip), Math.abs(rearSlip), Math.abs(state.slipAngle)) / .24, 0, 1);
  state.slip += (slip * clamp(state.speed / 6, 0, 1) - state.slip) * Math.min(1, dt * 10);
  state.elapsed += dt;
  updateLap(state, road, dt, track);
}

export function stepDriving(state, input = {}, dt, track = TRACK, vehicle = VEHICLES.ferrari458) {
  const duration = clamp(Number(dt) || 0, 0, .1);
  const steps = Math.ceil(duration * 240);
  for (let i = 0; i < steps; i++) advance(state, input, duration / steps, track, vehicle);
  return state;
}
