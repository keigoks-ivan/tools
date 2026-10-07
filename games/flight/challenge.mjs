// Landing challenge: level data, start states, wind, grading and progress. Pure logic (no DOM, no three.js).
// Frame and units are physics.mjs': metres, m/s, local frame (-z = runway heading, +x = right of the runway heading).
import { AIRCRAFT, RUNWAY, PROFILES, createFlightState, quaternionFromEuler } from './physics.mjs?v=20261007';

const KT = 1.943844, RAD = Math.PI / 180, TAU = Math.PI * 2;
const GLIDE = Math.tan(RUNWAY.glideslope * RAD);
const pathHeight = (km, gearHeight = AIRCRAFT.gearHeight) => gearHeight + (km * 1000 + RUNWAY.nearThreshold - RUNWAY.touchdownTarget) * GLIDE; // same geometry as getFlightData's glideslope deviation
const freeze = o => Object.freeze(o);

// weather: look of the sky ('clear' | 'crosswind' | 'fog', see world.js). wind: kt, steady crosswind from the right, gust amplitude (+-), headwind swing (+-).
// start: km out, metres right of the centreline (+x), metres above the glidepath, indicated kt, gear, flaps.
const wind = (cross = 0, gust = 0) => freeze({ cross, gust, head: gust * .4 });
const start = (o = {}) => freeze({ km: 7, right: 0, above: 0, kt: null, gear: true, flaps: 3, ...o });
export const LEVELS = Object.freeze([
  freeze({ id: 1, zh: '晴天無風', en: 'Clear and calm', descZh: '從 7 公里外對準跑道，穩穩落地。', descEn: 'Line up from 7 km out and land softly.', weather: 'clear', wind: wind(), start: start() }),
  freeze({ id: 2, zh: '偏離航道', en: 'Off course', descZh: '飛機偏在中線右邊 300 公尺，又高了 100 公尺。先修正再落地。', descEn: 'You start 300 m right of the centreline and 100 m high. Correct first, then land.', weather: 'clear', wind: wind(), start: start({ right: 300, above: 100 }) }),
  freeze({ id: 3, zh: '側風 10 節', en: '10 kt crosswind', descZh: '右側吹來 10 節風。機頭要朝右偏一點，才飛得直。', descEn: 'A 10 kt wind from the right. Point the nose a little right to track straight.', weather: 'crosswind', wind: wind(10), start: start() }),
  freeze({ id: 4, zh: '側風加陣風', en: 'Crosswind and gusts', descZh: '右側 15 節側風，風速忽強忽弱。小幅修正，別追著風跑。', descEn: '15 kt from the right, gusting. Make small corrections.', weather: 'crosswind', wind: wind(15, 8), start: start() }),
  freeze({ id: 5, zh: '濃霧', en: 'Dense fog', descZh: '濃霧中只看得到近處。靠儀表飛，約 2 公里內才見跑道。', descEn: 'Fog hides the runway until about 2 km. Fly the instruments.', weather: 'fog', wind: wind(), start: start() }),
  freeze({ id: 6, zh: '又高又快', en: 'High and fast', descZh: '4 公里外高了 150 公尺，時速 190 節。收油門、開擾流板（B）。', descEn: '4 km out, 150 m high and 190 kt. Cut thrust and use spoilers (B).', weather: 'clear', wind: wind(), start: start({ km: 4, above: 150, kt: 190, gear: false, flaps: 1 }) }),
  freeze({ id: 7, zh: '最終考驗', en: 'Final exam', descZh: '濃霧加 12 節側風，陣風 ±6 節。', descEn: 'Fog, a 12 kt crosswind and gusts of +-6 kt.', weather: 'fog', wind: wind(12, 6), start: start() }),
]);
// MQ-172 (light): same ids, weather and unlock rule. Starts 4 km out (226 m on the glidepath, about 2.2 min at 65 kt). Wind in kt.
const lstart = (o = {}) => freeze({ km: 4, right: 0, above: 0, kt: null, gear: true, flaps: 3, ...o });
export const LIGHT_LEVELS = Object.freeze([
  freeze({ id: 1, aircraft: 'light', zh: '晴天無風', en: 'Clear and calm', descZh: '從 4 公里外對準跑道，穩穩落地。', descEn: 'Line up from 4 km out and land softly.', weather: 'clear', wind: wind(), start: lstart() }),
  freeze({ id: 2, aircraft: 'light', zh: '偏離航道', en: 'Off course', descZh: '飛機偏在中線右邊 150 公尺，又高了 50 公尺。先修正再落地。', descEn: 'You start 150 m right of the centreline and 50 m high. Correct first, then land.', weather: 'clear', wind: wind(), start: lstart({ right: 150, above: 50 }) }),
  freeze({ id: 3, aircraft: 'light', zh: '側風 10 節', en: '10 kt crosswind', descZh: '右側吹來 10 節風。機頭要朝右偏一點，才飛得直。', descEn: 'A 10 kt wind from the right. Point the nose a little right to track straight.', weather: 'crosswind', wind: wind(10), start: lstart() }),
  freeze({ id: 4, aircraft: 'light', zh: '側風加陣風', en: 'Crosswind and gusts', descZh: '右側 12 節側風，陣風最高到 16 節。小幅修正，別追著風跑。', descEn: '12 kt from the right, gusting to 16. Make small corrections.', weather: 'crosswind', wind: wind(12, 4), start: lstart() }),
  freeze({ id: 5, aircraft: 'light', zh: '濃霧', en: 'Dense fog', descZh: '濃霧中只看得到近處。靠儀表飛，約 2 公里內才見跑道。', descEn: 'Fog hides the runway until about 2 km. Fly the instruments.', weather: 'fog', wind: wind(), start: lstart() }),
  freeze({ id: 6, aircraft: 'light', zh: '又高又快', en: 'High and fast', descZh: '3 公里外高了 80 公尺，時速 95 節。收油門到慢車，降到 85 節以下再放滿襟翼。', descEn: '3 km out, 80 m high and 95 kt. Idle power, slow below 85 kt, then full flaps.', weather: 'clear', wind: wind(), start: lstart({ km: 3, above: 80, kt: 95, flaps: 1 }) }),
  freeze({ id: 7, aircraft: 'light', zh: '最終考驗', en: 'Final exam', descZh: '濃霧加 10 節側風，陣風 ±4 節。', descEn: 'Fog, a 10 kt crosswind and gusts of +-4 kt.', weather: 'fog', wind: wind(10, 4), start: lstart() }),
]);
// The level list for an aircraft: 'jet' | 'light' | a flight state. Progress keys: 'flightChallenge' (jet), 'flightChallenge.light' (light).
export const FIGHTER_LEVELS = Object.freeze(LEVELS.map(l => freeze({ ...l, aircraft: 'fighter', ...(l.id === 6 ? { descZh: '4 公里外高了 150 公尺，220 節。關後燃器、收油門，開減速板（B）。', descEn: '4 km out, 150 m high, 220 kt. Afterburner off, idle power and speed brakes (B).', start: start({ km: 4, above: 150, kt: 220, gear: false, flaps: 1 }) } : {}) })));
export const levelsFor = x => ({ light: LIGHT_LEVELS, fighter: FIGHTER_LEVELS }[typeof x === 'string' ? x : x?.aircraft] || LEVELS);
export const levelById = (id, aircraft = 'jet') => levelsFor(aircraft).find(l => l.id === Number(id)) || null;
export const nextLevel = (id, aircraft = 'jet') => levelsFor(aircraft).find(l => l.id === Number(id) + 1) || null;

// Air density ratio, same ISA formula as physics.mjs (to turn the indicated speed of level 6 into a true airspeed).
const densityRatio = altitude => Math.pow(Math.max(216.65, 288.15 - Math.max(0, altitude + RUNWAY.fieldElevation) * .0065) / 288.15, 4.2561);

export function createLevelState(level, aircraft = 'jet') {
  if (typeof level === 'number') level = levelById(level, aircraft);
  const light = level.aircraft === 'light', id = level.aircraft || 'jet', s = createFlightState('approach', id), c = level.start;
  const custom = c.km !== (light ? 4 : 7) || c.right || c.above || c.kt || !c.gear || c.flaps !== 3;
  s.challenge = level.id;
  if (!custom) return s; // level 1 is the approach scenario, untouched
  s.position = { x: c.right, y: pathHeight(c.km, PROFILES[id].gearHeight) + c.above, z: RUNWAY.nearThreshold + c.km * 1000 };
  if (c.kt) {
    const tas = c.kt / KT / Math.sqrt(densityRatio(s.position.y)), gamma = -RUNWAY.glideslope * RAD;
    let aoa = 4.5 * RAD;
    if (light || id === 'fighter') { // lift = weight at this speed: aoa from the light aero table (flap position c.flaps)
      const P = PROFILES[id], A = P.aero, rho = 1.225 * densityRatio(s.position.y), q = .5 * rho * tas * tas;
      aoa = ((P.emptyMass + P.initialFuel) * 9.80665 * Math.cos(gamma) / (q * P.wingArea) - A.cl0 - (A.flapTable ? A.flapTable.cl0[c.flaps] : A.flapCl0 * c.flaps / 3)) / A.slope;
    }
    s.velocity = { x: 0, y: tas * Math.sin(gamma), z: -tas * Math.cos(gamma) };
    s.quaternion = quaternionFromEuler(gamma + aoa);
    s.autopilot.speed = c.kt / KT; s.autopilot.altitude = s.position.y;
  }
  s.gear = c.gear; s.gearPosition = c.gear ? 1 : 0; s.flaps = c.flaps; s.flapPosition = c.flaps;
  if (c.kt) { s.throttle = s.engine = light ? .1 : .2; }
  return s;
}

// Wind vector (m/s) for stepFlight, in the same frame as the old fixed `{ x: 7.72 }` crosswind. That vector is the velocity of the AIR:
// +x moves the air toward the right of the runway heading, so it is a wind FROM THE LEFT. "From the right" is therefore -x.
// +z is air moving back along the approach (a headwind). Gusts are 2-3 sines with incommensurate periods (smooth, deterministic).
const GUST = [[3.1, 0], [5.3, 1.7], [10.7, 4.1]], SWAY = [[4.3, .6], [7.9, 2.2]];
const sines = (list, t) => list.reduce((a, [p, f]) => a + Math.sin(TAU * t / p + f), 0) / list.length * (list.length > 2 ? 1.5 : 1.4);
export function windAt(level, t = 0, aircraft = 'jet') {
  if (typeof level === 'number') level = levelById(level, aircraft);
  const w = level?.wind;
  if (!w || (!w.cross && !w.gust)) return { x: 0, y: 0, z: 0 };
  const g = clampUnit(sines(GUST, t)), h = clampUnit(sines(SWAY, t));
  return { x: -(w.cross + w.gust * g) / KT, y: 0, z: w.head * h / KT };
}
const clampUnit = v => Math.max(-1, Math.min(1, v));

// Grading: one star per check. Crash or stopping off the runway scores nothing. Sink rate in ft/min, offsets in metres.
export const THRESHOLDS = Object.freeze({ sinkFpm: 360, offsetM: 6, spotM: 400 }); // spot: a clean glidepath approach with the flare cue floats ~250 m past the aim point, so 400 m still rewards it
export const LIGHT_THRESHOLDS = Object.freeze({ sinkFpm: 300, offsetM: 5, spotM: 300 }); // MQ-172: slower, lighter aircraft, shorter flare float
export function grade(state, data) {
  const T = state.aircraft === 'light' ? LIGHT_THRESHOLDS : THRESHOLDS, t = state.touchdown, fpm = t ? Math.round(t.sinkRate * 196.85) : null, off = t ? Math.abs(t.lateralOffset) : null;
  const spot = t ? Math.round(Math.abs(t.position.z - RUNWAY.touchdownTarget)) : null;
  const stopped = !state.crashed && !!t && state.onGround && data.onRunway && data.groundSpeed < 2.5;
  const safe = !state.crashed && !!t && data.onRunway;
  const mk = (id, ok, value, zh, en) => ({ id, ok: safe && ok, value, zh, en });
  const checks = [
    mk('sink', t && fpm < T.sinkFpm, fpm, `落地很輕：${t ? `${fpm} 呎／分` : '—'}`, `Soft touchdown: ${t ? `${fpm} ft/min` : '—'}`),
    mk('centre', t && off < T.offsetM, off, `對準中線：${t ? `偏 ${off.toFixed(1)} 公尺` : '—'}`, `On the centreline: ${t ? `${off.toFixed(1)} m off` : '—'}`),
    mk('spot', t && spot < T.spotM, spot, `落點準：${t ? `差 ${spot} 公尺` : '—'}`, `Right spot: ${t ? `${spot} m from target` : '—'}`),
  ];
  const stars = checks.filter(c => c.ok).length;
  return { pass: stopped && stars >= 1, stars, checks };
}

// Progress: a plain object { [levelId]: bestStars }. main.js keeps it in localStorage; everything here returns new objects.
export const bestStars = (progress, id) => Math.max(0, Math.min(3, Math.floor(Number(progress?.[id]) || 0)));
export const isUnlocked = (progress, id) => id <= 1 || bestStars(progress, id - 1) >= 1;
export const recordResult = (progress, id, stars) => ({ ...progress, [id]: Math.max(bestStars(progress, id), Math.max(0, Math.min(3, Math.floor(stars)))) });
export function parseProgress(text, aircraft = 'jet') {
  try {
    const o = JSON.parse(text), out = {};
    if (o && typeof o === 'object') for (const l of levelsFor(aircraft)) if (bestStars(o, l.id)) out[l.id] = bestStars(o, l.id);
    return out;
  } catch { return {}; }
}
export const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
