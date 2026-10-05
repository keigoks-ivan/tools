// Aircraft profiles: pure data, no imports. SI units (m, kg, N, s, rad) unless a key says otherwise (kt, ft, deg).
// physics.mjs reads the top-level physics keys and the sections aero / thrust / gear / sas / ap / ground / crash / speedLimit /
// scenarios. The ui / novice / challenge / tour sections are plain numbers and text for the game layers (main.js, novice.mjs,
// challenge.mjs, tour.mjs); physics.mjs never reads them.
// The jet profile holds the original MQ-320 constants exactly: golden.jet.json guards that.
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

const jet = {
  id: 'jet', name: 'MQ-320', nameZh: '雙發客機', nameEn: 'Twinjet', emptyMass: 50000, initialFuel: 8500,
  wingArea: 122.6, span: 35.8, length: 37.6, chord: 3.5,
  maxThrust: 240000, gearHeight: 4, maxSpeed: 155, rotateSpeed: 72,
  inertia: { x: 5100000, y: 5700000, z: 1700000 },
  fixedGear: false, hasSpoilers: true,
  // lift = cl0 + flapCl0*f/3 + slope*aoa; stall angle = stall - flapStall*f/3 deg; drag = cd0 + f/3*flapCd + k*CL^2 (+ spoilers)
  aero: {
    slope: 5.1, cl0: 0.22, flapCl0: 0.75, stall: 16, flapStall: 1, negStall: 18, flapTable: null,
    cd0: 0.023, flapCd: 0.07, k: 0.045, separatedCd: 0.9, cdGear: 0.019, betaDrag: 0.2, sideForce: 0.72,
    spoilerLift: 0.55, spoilerCd: 0.065, groundEffect: 0.1,
  },
  // jet: thrust = maxThrust*engine*(rho/1.225)^lapseExp*max(floor, 1 - slope*V)
  thrust: { type: 'jet', lapseExp: 0.7, floor: 0.55, slope: 0.0011, spoolUp: 3.5, spoolDown: 2.2, fuelIdle: 0.12, fuelPerEngine: 1.23 },
  gear: { transit: 5, bellyHeight: 1.4, warningAgl: 180, warningVs: -0.5 },
  speedLimit: { clean: 155, flapOver: 0.2, base: 120, perFlap: 11 }, // IAS m/s
  sas: { pitch: 0.19, roll: 0.31, yaw: 0.105, aoaGain: 0.55, aoaLimit: 0.13, betaGain: 0.55, pitchK: 0.95, rollK: 2.1, yawK: 0.85, authorityQ: 260000, authorityMax: 1.9, trimAoaBase: 2.6, trimAoaGain: 8 },
  ap: {
    bank: 25, bankGain: 0.8, vs: 8, altGain: 0.035, pitchMin: -6, pitchMax: 13, vsPitchGain: 0.75, speedMargin: 4, speedGain: 0.025, integralGain: 0.0015, integralMax: 0.18,
    overspeedGain: 0.2, minSpeed: 30, pitchGain: 0.12, pitchDamp: 2, rollGain: 0.055, rollDamp: 1.8, yawGain: 1.4, yawMax: 0.3, ctrlMax: 0.65, powerLimited: false,
  },
  ground: { friction: 0.014, frictionOff: 0.085, brake: 3.8, grip: 5.5, steer: 0.4, steerSpeed: 18, noseHoldSpeed: 35, liftOffSpeed: 40, liftOffForce: 1.015 },
  crash: { tailPitch: 12.5, wingRoll: 8, strikeSpeed: 25, impactSink: 10, impactSpeed: 110, hardSink: 4.5, landingRoll: 8, landingPitch: 13, sideHeading: 20, overrunSpeed: 35 },
  scenarios: {
    default: { speed: 120, apAltitude: 1000 },
    runway: { flaps: 1, trim: 0.15, throttle: 0, apAltitude: 1000 },
    approach: { km: 7, speed: 75, pitch: 2, throttle: 0.24, flaps: 3, trim: 0.29 },
    cruise: { altitude: 1800, speed: 120, pitch: 4.6, throttle: 0.205, flaps: 0, trim: 0.25, x: -1400, z: 6000, gear: false },
  },
  ui: {
    label: 'MQ-320', flightLabel: 'FLIGHT MQ218', engineGauge: 'n1', engines: 2, fuelUnit: 'kg', rpm: null,
    apSpeed: { min: 110, max: 290, def: 180 }, // kt indicated
    cameras: {
      cockpit: [-0.72, 1.3, -14.2], wing: { pos: [13, 3.4, 6], look: [-3, 1, -14] },
      chase: { back: 62, side: 16, up: 22, lookAhead: 3 }, attract: [55, 29, 66],
    },
    sound: { type: 'sawtooth', base: 42, gain: 85, filterBase: 210, filterGain: 520 },
    warnings: { sinkAgl: 80, sinkVs: -7, bankAgl: 100, bankDeg: 35, overspeedText: 'OVERSPEED · REDUCE THRUST' },
    score: { refKt: 140, tolKt: 12 },
    spoilerKey: true, gearKey: true, flapLabels: ['UP', '1', '2', '3'],
  },
  novice: { rotateKt: 72 * 1.943844, gearUpAglFt: 50, flapRetractKt: 160, flapExtend: [[200, 1], [180, 2], [160, 3]], approachSpeedKt: [125, 165], flareAglM: 25, boxFarM: 10000, boxSpacingM: 400, boxFar: { w: 120, h: 80 }, boxNear: { w: 60, h: 40 }, circuitAltFt: 4500 },
  challenge: { approachKm: 7, vrefKt: 140, thresholds: { sinkFpm: 360, offsetM: 6, spotM: 400 }, flapSchedule: [205, 180, 175, 200], flareAglM: 25 },
  tour: { startKt: 200, bankDeg: 25, limits: { minLegM: 3000, maxTurnDeg: 60, maxGradePct: 5, ringClearFt: 1000, legClearFt: 800 } },
};

// MQ-172 Lark: light single-engine, fixed tricycle gear, 2-blade fixed-pitch prop, manual flaps. Public C172-class numbers where
// known, tuned in dev/physics.light.test.mjs elsewhere. Not certification data.
const light = {
  id: 'light', name: 'MQ-172', nameZh: '雲雀', nameEn: 'Lark', emptyMass: 990, initialFuel: 110,
  wingArea: 16.2, span: 11.0, length: 8.28, chord: 1.5,
  maxThrust: 2800, gearHeight: 1.2, maxSpeed: 83.9, rotateSpeed: 28.3,
  inertia: { x: 2474, y: 3616, z: 1742 },
  fixedGear: true, hasSpoilers: false,
  aero: {
    slope: 4.9, cl0: 0.26, flapCl0: 0, stall: 15, flapStall: 2.5, negStall: 18,
    flapTable: { cl0: [0, 0.20, 0.38, 0.52], cd: [0, 0.004, 0.018, 0.040] },
    cd0: 0.034, flapCd: 0, k: 0.060, separatedCd: 0.9, cdGear: 0, betaDrag: 0.2, sideForce: 0.72,
    spoilerLift: 1, spoilerCd: 0, groundEffect: 0.1,
  },
  // prop: thrust = sigmaP*engine*max(0, maxThrust - slope*V) - (1-engine)*idleDrag*q*S, sigmaP = (sigma - sigmaOffset)/(1 - sigmaOffset)
  thrust: { type: 'prop', speedSlope: 1300 / 60, sigmaOffset: 0.12, idleDrag: 0.010, spoolUp: 0.5, spoolDown: 0.35, fuelIdle: 0.0015, fuelPerEngine: 0.0075 },
  gear: { transit: 1, bellyHeight: 1.2, warningAgl: 0, warningVs: 0 },
  speedLimit: { clean: 83.9, steps: [[0.2, 56.6], [1, 43.7]] }, // IAS m/s: Vne 163 kt clean-ish, Vfe 110 kt (flap 1), 85 kt (flaps 2-3)
  sas: { pitch: 0.30, roll: 0.75, yaw: 0.2, aoaGain: 0.55, aoaLimit: 0.13, betaGain: 0.55, pitchK: 0.95, rollK: 2.1, yawK: 0.85, authorityQ: 5800, authorityMax: 1.9, trimAoaBase: 0, trimAoaGain: 8 },
  ap: {
    bank: 30, bankGain: 0.8, vs: 3, altGain: 0.035, pitchMin: -8, pitchMax: 10, vsPitchGain: 0.75, speedMargin: 2.5, speedGain: 0.025, integralGain: 0.0015, integralMax: 0.18,
    overspeedGain: 0.2, minSpeed: 20, pitchGain: 0.12, pitchDamp: 2, rollGain: 0.055, rollDamp: 1.8, yawGain: 1.4, yawMax: 0.3, ctrlMax: 0.65,
    powerLimited: true, climbPowerFraction: 0.85,
  },
  ground: { friction: 0.02, frictionOff: 0.06, brake: 3.0, grip: 4, steer: 0.4, steerSpeed: 18, noseHoldSpeed: 20, liftOffSpeed: 22, liftOffForce: 1.015 },
  crash: { tailPitch: 14, wingRoll: 12, strikeSpeed: 12, impactSink: 7, impactSpeed: 70, hardSink: 4.0, landingRoll: 12, landingPitch: 14, sideHeading: 20, overrunSpeed: 15 },
  scenarios: {
    default: { speed: 50, apAltitude: 460 },
    runway: { flaps: 1, trim: 0.15, throttle: 0, apAltitude: 460 },
    approach: { km: 4, speed: 34, pitch: -0.8, throttle: 0.48, flaps: 3, trim: 0.275 },
    cruise: { altitude: 457, speed: 50, pitch: 2.6, throttle: 0.70, flaps: 0, trim: 0.33, x: -1400, z: 6000, gear: true },
  },
  ui: {
    label: 'MQ-172 · VFR', flightLabel: 'MQ-172 · VFR', engineGauge: 'rpm', engines: 1, fuelUnit: 'kg', rpm: { idle: 700, max: 2700, redline: 2700 },
    apSpeed: { min: 55, max: 120, def: 90 },
    cameras: {
      cockpit: [-0.30, 0.55, -0.5], wing: { pos: [5.2, 1.4, 1.5], look: [-1, 0.3, -5] },
      chase: { back: 18, side: 5, up: 6, lookAhead: 1 }, attract: [16, 6, 20],
    },
    sound: { type: 'sawtooth', base: 38, gain: 70, filterBase: 260, filterGain: 380 },
    warnings: { sinkAgl: 60, sinkVs: -4.5, bankAgl: 80, bankDeg: 45, overspeedText: 'OVERSPEED · REDUCE POWER' },
    score: { refKt: 55, tolKt: 8 },
    spoilerKey: false, gearKey: false, flapLabels: ['UP', '10°', '20°', '30°'],
  },
  // WP2 tuned. Novice: aligned-with-the-runway test counts only below 350 m AGL (the 2,900 ft free-flight cruise is 457 m AGL and must not auto-extend flaps); rotate 55 kt; flaps 1 below 110 kt, flaps 2-3 below 85 kt (Vfe); takeoff flaps up at 70 kt and 45 m AGL; approach bands 55-75 kt (Vref 65);
  // flare cue at 8 m (the pilot flares at 6 m); boxes every 200 m from the touchdown zone out to 4.2 km, 40x28 m far to 24x16 m near; circuit 2,900 ft, base/final 2,300 ft.
  novice: { rotateKt: 55, gearUpAglFt: null, flapRetractKt: 70, flapRetractAglM: 45, flapWaitAglM: 100, flapExtend: [[110, 1], [85, 3]], approachSpeedKt: [55, 75], flareAglM: 8, boxFarM: 4200, boxSpacingM: 200, boxFar: { w: 40, h: 28 }, boxNear: { w: 24, h: 16 }, circuitAltFt: 2900, finalAltFt: 2300, freeAimM: 5000, climbPitchDeg: 8, alignedAglM: 350 },
  challenge: { approachKm: 4, vrefKt: 65, thresholds: { sinkFpm: 300, offsetM: 5, spotM: 300 }, flapSchedule: [110, 85, 85, 110], flareAglM: 6 },
  tour: { startKt: 100, bankDeg: 30, limits: { minLegM: 2000, maxTurnDeg: 75, maxClimbPct: 2, maxDescentPct: 4, minMinutes: 5, maxMinutes: 9, ringClearFt: 1000, legClearFt: 800, wallM: 600, flownWallM: 400, flownClearFt: 800, wallDropFt: 500 } },
};

export const PROFILES = deepFreeze({ jet, light });
