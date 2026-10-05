// Novice mode: pure logic (no DOM, no three.js). main.js feeds it the live state and shows the result.
// Every function reads the same units as physics.mjs: metres, m/s, local frame (-z = runway heading), data.heading in local degrees.
import { AIRCRAFT, RUNWAY, PROFILES } from './physics.mjs';

const KT = 1.943844, FT = 3.28084, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = v => ((v + 180) % 360 + 360) % 360 - 180;

export const NOVICE = Object.freeze({
  // ILS "centred": instruments.js draws LOC dots 21 px apart on a 43 px = 2.5 deg scale, GS dots 25 px apart on a 51 px = 0.7 deg scale.
  locDot: 2.5 * 21 / 43, gsDot: 0.7 * 25 / 51,
  centreDots: 0.5, leaveDots: 0.75, // centred inside half a dot; stays "centred" until 3/4 dot (no flicker)
  rotateKt: Math.round(AIRCRAFT.rotateSpeed * KT),
  gearUpAglM: 50 / FT, gearUpVs: 1, // retract once above 50 ft AGL and climbing faster than 1 m/s (~200 ft/min)
  gearDownAglM: 2000 / FT, gearDownLowAglM: 250, // extend below 2,000 ft AGL on the approach path; or below 250 m AGL when sinking
  flapRetractKt: 160, flapRetractAglM: 30, flapWaitAglM: 500 / FT, // takeoff flaps 1 -> 0 at 160 kt (flap-1 limit is ~212 kt), above 30 m AGL
  flapExtend: Object.freeze([[200, 1], [180, 2], [160, 3]]), // [max IAS kt, flaps allowed]; flap 3 limit is ~169 kt, flap 2 ~190 kt, flap 1 ~212 kt
  noticeSec: 4, glowSec: 2, flareAglM: 25, // flare cue uses the same agl < 25 test as mission() in main.js
  boxSpacingM: 400, boxFarM: 10000, boxFar: Object.freeze({ w: 120, h: 80 }), boxNear: Object.freeze({ w: 60, h: 40 }),
});

// MQ-172 (light): same shape as NOVICE, numbers from PROFILES.light.novice. No gear steps ever (fixed gear), flap schedule inside Vfe
// (110 kt flaps 1, 85 kt above), approach bands around 65 kt, flare cue at 8 m, circuit altitudes 2,900 / 2,300 ft MSL.
const LN = PROFILES.light.novice;
export const NOVICE_LIGHT = Object.freeze({
  ...NOVICE, light: true,
  rotateKt: LN.rotateKt, flapRetractKt: LN.flapRetractKt, flapRetractAglM: LN.flapRetractAglM, flapWaitAglM: LN.flapWaitAglM,
  flapExtend: Object.freeze(LN.flapExtend.map(r => Object.freeze([...r]))), approachKt: Object.freeze([...LN.approachSpeedKt]),
  flareAglM: LN.flareAglM, boxFarM: LN.boxFarM, boxSpacingM: LN.boxSpacingM, boxFar: Object.freeze({ ...LN.boxFar }), boxNear: Object.freeze({ ...LN.boxNear }),
  circuitAltFt: LN.circuitAltFt, finalAltFt: LN.finalAltFt, freeAimM: LN.freeAimM, alignedAglM: LN.alignedAglM, climbPitchDeg: LN.climbPitchDeg,
});
// The novice table for an aircraft: 'jet' | 'light' | a flight state (reads state.aircraft). Anything else is the jet.
export const noviceFor = x => (typeof x === 'string' ? x : x?.aircraft) === 'light' ? NOVICE_LIGHT : NOVICE;

// Same condition main.js mission() uses for the stabilised approach (routeIndex only matters for the takeoff scenario).
export function approachActive(state, data, routeIndex = 0) {
  if (state.crashed || (state.touchdown && state.onGround)) return false;
  if (state.tour) return false; // sightseeing tour: no ILS boxes, no automatic gear and flaps until the tour is over
  const aligned = data.agl < (state.aircraft === 'light' ? NOVICE_LIGHT.alignedAglM : 800) && data.distanceToThreshold > -300 && data.distanceToThreshold < 13000 && Math.abs(state.position.x) < 1500 && Math.min(data.heading, 360 - data.heading) < 35;
  return state.scenario === 'approach' || (aligned && (state.scenario !== 'runway' || routeIndex >= 3));
}

// Plain-language ILS cue. LOC + = aircraft right of the course (say left); GS + = above the glidepath (say lower).
export function ilsCue(data, last = null) {
  if (!data.ilsValid) return null;
  const ok = (dev, dot, was) => Math.abs(dev) <= dot * (was ? NOVICE.leaveDots : NOVICE.centreDots);
  const loc = data.localizerDeviation, gs = data.glideslopeDeviation;
  const h = ok(loc, NOVICE.locDot, last?.h.state === 'ok') ? { state: 'ok', zh: '對準了', en: 'On course' }
    : loc > 0 ? { state: 'left', zh: '往左一點', en: 'A bit left' } : { state: 'right', zh: '往右一點', en: 'A bit right' };
  h.far = Math.abs(loc) > 2 * NOVICE.locDot;
  if (!data.gsValid) return { h, v: null };
  const v = ok(gs, NOVICE.gsDot, last?.v?.state === 'ok') ? { state: 'ok', zh: '高度剛好', en: 'Height is right' }
    : gs > 0 ? { state: 'low', zh: '再低一點', en: 'A bit lower' } : { state: 'high', zh: '再高一點', en: 'A bit higher' };
  v.far = Math.abs(gs) > 2 * NOVICE.gsDot;
  return { h, v };
}

// Turn direction toward a point in the local frame. Forward = (sin h, -cos h) in (x, z), the same as main.js uses for the camera.
export function turnCue(data, target, state) {
  const bearing = Math.atan2(target.x - state.position.x, -(target.z - state.position.z)) / RAD;
  const diff = wrap(bearing - data.heading);
  return { dir: Math.abs(diff) < 10 ? 'straight' : diff > 0 ? 'right' : 'left', diff };
}
const TURN = { left: ['往左轉', 'Turn left'], right: ['往右轉', 'Turn right'], straight: ['直飛', 'Fly straight'] };

const mslFt = data => (data.altitude + RUNWAY.fieldElevation) * FT;
function altitudeWords(data, targetFt) {
  const d = mslFt(data) - targetFt, t = targetFt.toLocaleString('en-US');
  return Math.abs(d) < 250 ? [`高度保持 ${t} 呎`, `hold ${t} ft`] : d < 0 ? [`爬升到 ${t} 呎`, `climb to ${t} ft`] : [`下降到 ${t} 呎`, `descend to ${t} ft`];
}

// The one thing to do now. ctx: { touch, routeIndex, route, circuitAltFt, tour: { diff, altFt } | null, notice: { gear: {age, to}, flaps: {age, to} } }
export function nextStep(state, data, commands, ctx = {}) {
  const N = noviceFor(state), light = !!N.light, touch = !!ctx.touch, kt = data.indicatedAirspeed * KT, step = (id, zh, en, glow = null) => ({ id, zh, en, glow });
  if (state.crashed) return step('none', '', '');
  const aloft = !state.onGround;
  if (aloft && data.stallWarning) return step('stall', touch ? '速度太慢：搖桿往上推，加油門' : '速度太慢：按 ↑ 壓低機頭，加油門', 'Too slow: nose down and add thrust', 'throttle');
  if (state.onGround && state.touchdown) {
    return data.groundSpeed < 2.5 ? step('stopped', '已停穩', 'Stopped')
      : step('brake', touch ? '油門收回，按住煞車' : '油門收回，按住空白鍵煞車', touch ? 'Idle thrust and hold BRAKE' : 'Idle thrust and hold Space to brake', 'brake');
  }
  const approach = approachActive(state, data, ctx.routeIndex);
  if (approach && aloft && data.agl < N.flareAglM) {
    return step('flare', touch ? '收油門，輕輕往下拉搖桿' : '收油門（S），輕按 ↓ 拉平', touch ? 'Idle thrust, gently pull back' : 'Idle thrust (S), gently press ↓ to flare', 'throttle');
  }
  const n = ctx.notice || {}, fresh = (a, s = N.noticeSec) => a && a.age < s;
  const recent = (light ? ['flaps'] : ['gear', 'flaps']).filter(k => fresh(n[k])).sort((a, b) => n[a].age - n[b].age)[0];
  if (recent) {
    const to = n[recent].to, zh = recent === 'gear' ? `起落架已自動${to ? '放下' : '收起'}` : `襟翼已自動${to === 0 ? '收起' : `放到 ${to}`}`;
    const en = recent === 'gear' ? `Gear ${to ? 'lowered' : 'raised'} automatically` : `Flaps ${to === 0 ? 'retracted' : `set to ${to}`} automatically`;
    return step(`auto-${recent}`, zh, en, n[recent].age < N.glowSec ? recent : null);
  }
  if (ctx.tour) { // sightseeing tour: ctx.tour = { diff, altFt } from tour.mjs nextRingCue (diff = degrees to turn, + = right)
    const turn = TURN[Math.abs(ctx.tour.diff) < 10 ? 'straight' : ctx.tour.diff > 0 ? 'right' : 'left'], alt = altitudeWords(data, ctx.tour.altFt);
    return step('tour', `飛向下一個圈：${turn[0]}，${alt[0]}`, `Fly to the next ring: ${turn[1].toLowerCase()}, ${alt[1]}`);
  }
  if (approach && light) {
    if (commands.flaps < 3) {
      if (kt > N.flapExtend[1][0] + 5) return step('slow-down', `放襟翼 3：先收油門，減速到 ${N.flapExtend[1][0]} 節`, `Flaps 3: reduce power, slow to ${N.flapExtend[1][0]} kt`, 'throttle');
      return step('config', '放襟翼 3', 'Set flaps 3', 'flaps');
    }
    if (kt > N.approachKt[1]) return step('final-fast', '速度太快，收油門', 'Too fast: reduce power', 'throttle');
    if (kt < N.approachKt[0]) return step('final-slow', '速度太慢，加油門', 'Too slow: add power', 'throttle');
    return step('final', '跟著方框飛，對準跑道', 'Follow the boxes to the runway');
  }
  if (approach) {
    if (!commands.gear || commands.flaps < 3) {
      if (commands.flaps < 3 && kt > N.flapExtend[2][0] + 5) return step('slow-down', '放襟翼 3 和起落架：先收油門，減速到 160 節', 'Flaps 3 and gear: reduce thrust, slow to 160 kt', 'throttle');
      return step('config', '放襟翼 3 和起落架', 'Set flaps 3 and gear down', !commands.gear ? 'gear' : 'flaps');
    }
    if (kt > 165) return step('final-fast', '速度太快，收油門', 'Too fast: reduce thrust', 'throttle');
    if (kt < 125) return step('final-slow', '速度太慢，加油門', 'Too slow: add thrust', 'throttle');
    return step('final', '跟著方框飛，對準跑道', 'Follow the boxes to the runway');
  }
  if (state.scenario === 'runway' && state.onGround) {
    if (kt < N.rotateKt) {
      if (commands.throttle < .95) return step('throttle', touch ? '把油門推到 100%' : '按 W 推油門到 100%', touch ? 'Push thrust to 100%' : 'Press W to push thrust to 100%', 'throttle');
      return step('roll', `加速中，保持在跑道中線（${Math.round(kt)} 節，${N.rotateKt} 節拉起）`, `Accelerating on the centerline (${Math.round(kt)} kt, rotate at ${N.rotateKt})`);
    }
    return step('rotate', touch ? '速度到了，把搖桿往下拉，機頭抬起' : '速度到了，按住 ↓ 拉起', touch ? 'Speed is right: pull the stick down to lift the nose' : 'Speed is right: hold ↓ to rotate');
  }
  if (state.scenario === 'runway') {
    if (data.agl < N.gearUpAglM) {
      return data.verticalSpeed < N.gearUpVs ? step('rotate', touch ? '再往下拉一點，讓機頭抬高' : '繼續按 ↓，讓機頭抬高', 'Keep pulling to raise the nose')
        : light ? step('climb', `繼續爬升，保持機頭向上約 ${N.climbPitchDeg} 度`, `Keep climbing, nose about ${N.climbPitchDeg}° up`) : step('climb', '繼續爬升，保持機頭向上約 10 度', 'Keep climbing, nose about 10° up');
    }
    // Not while sinking below the auto-extend height: autoConfig lowers the gear then, and telling the player to raise it would fight it.
    if (!light && commands.gear && !(data.verticalSpeed < -1 && data.agl < N.gearDownLowAglM)) return step('gear', '收起落架', 'Raise the landing gear', 'gear');
    if (commands.flaps > 0) {
      if (kt >= N.flapRetractKt) return step('flaps', '收襟翼', 'Retract the flaps', 'flaps');
      // The wait hint only owns the line for the first 500 ft; after that the circuit cue matters more (flaps stay at 1 until 160 kt).
      if (data.agl < N.flapWaitAglM) return step('flaps-wait', `繼續加速，到 ${N.flapRetractKt} 節收襟翼`, `Keep accelerating; flaps up at ${N.flapRetractKt} kt`);
    }
  }
  // Circuit (takeoff scenario) or free flight: turn cue + altitude.
  const route = ctx.route || [], idx = ctx.routeIndex || 0, circuit = state.scenario === 'runway' && route[idx];
  const target = circuit || { x: 0, z: RUNWAY.nearThreshold + (light ? N.freeAimM : 9000) };
  const targetFt = circuit ? (idx >= 3 ? (light ? N.finalAltFt : 3000) : (ctx.circuitAltFt || N.circuitAltFt || 4500)) : (light ? N.circuitAltFt : 3000);
  const turn = TURN[turnCue(data, target, state).dir], alt = altitudeWords(data, targetFt);
  return step(circuit ? 'circuit' : 'free', `${turn[0]}，${alt[0]}`, `${turn[1]}, ${alt[1]}`);
}

// Auto gear/flaps. Returns only what should change: { gear?: boolean, flaps?: 0..3 }. mem is caller-owned and reset on the ground.
export function autoConfig(state, data, commands, mem = {}, routeIndex = 0) {
  if (state.crashed) return {};
  if (state.onGround) { mem.gearUp = false; mem.flapsUp = false; return {}; }
  const N = noviceFor(state), out = {}, kt = data.indicatedAirspeed * KT, approach = approachActive(state, data, routeIndex);
  if (N.light) { // fixed gear: only flaps
    if (approach) {
      const best = N.flapExtend.reduce((a, [max, flaps]) => kt <= max ? Math.max(a, flaps) : a, 0);
      if (commands.flaps < best && Math.abs(data.flapPosition - commands.flaps) < .1) out.flaps = commands.flaps + 1;
    } else if (commands.flaps > 0 && !mem.flapsUp && data.agl > N.flapRetractAglM && data.verticalSpeed > 0 && kt >= N.flapRetractKt) { out.flaps = 0; mem.flapsUp = true; }
    return out;
  }
  if (!commands.gear && ((approach && data.agl < NOVICE.gearDownAglM) || (data.verticalSpeed < -1 && data.agl < NOVICE.gearDownLowAglM))) out.gear = true;
  else if (commands.gear && !approach && !mem.gearUp && data.agl > NOVICE.gearUpAglM && data.verticalSpeed > NOVICE.gearUpVs) { out.gear = false; mem.gearUp = true; }
  if (approach) {
    const best = NOVICE.flapExtend.reduce((a, [max, flaps]) => kt <= max ? Math.max(a, flaps) : a, 0);
    if (commands.flaps < best && Math.abs(data.flapPosition - commands.flaps) < .1) out.flaps = commands.flaps + 1;
  } else if (commands.flaps > 0 && !mem.flapsUp && data.agl > NOVICE.flapRetractAglM && data.verticalSpeed > 0 && kt >= NOVICE.flapRetractKt) { out.flaps = 0; mem.flapsUp = true; }
  return out;
}

// Wireframe frames along the glidepath, built from the same geometry as getFlightData's glideslopeDeviation:
// deviation = atan2(y - gearHeight, z - touchdownTarget) - glideslope, so a point at y = gearHeight + d*tan(gs) is exactly on the path.
export function approachBoxes(aircraft = 'jet') {
  const light = (typeof aircraft === 'string' ? aircraft : aircraft?.aircraft) === 'light', N = light ? NOVICE_LIGHT : NOVICE, gh = light ? PROFILES.light.gearHeight : AIRCRAFT.gearHeight;
  const zone = RUNWAY.nearThreshold - RUNWAY.touchdownTarget, tan = Math.tan(RUNWAY.glideslope * RAD), out = [];
  for (let d = zone; d <= zone + N.boxFarM + 1e-6; d += N.boxSpacingM) {
    const f = clamp((d - zone) / N.boxFarM, 0, 1), { boxFar: a, boxNear: b } = N;
    out.push({ x: 0, y: gh + d * tan, z: RUNWAY.touchdownTarget + d, w: b.w + (a.w - b.w) * f, h: b.h + (a.h - b.h) * f, fade: f });
  }
  return out;
}
