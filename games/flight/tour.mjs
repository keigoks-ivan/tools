// Sightseeing tours: route data, start state, ring-passing logic, landmark captions and best times. Pure logic (no DOM, no three.js).
// Frame and units are physics.mjs': metres, local frame (origin = runway 14 centre at field elevation, -z = runway heading 137.3 deg true,
// +x = right). Ring altitudes are feet MSL (what the pilot reads on the altimeter); the physics state holds metres above the field.
// Coordinates are whole metres / feet on purpose: dev/check_tours.py hashes them to prove that dev/tour_clearance.json matches this file.
import { AIRCRAFT, RUNWAY, createFlightState, stepFlight, quaternionFromEuler } from './physics.mjs';

const FT = 3.28084, KT = 1.943844, RAD = Math.PI / 180;
const freeze = o => Object.freeze(o);
const wrap = v => ((v + 180) % 360 + 360) % 360 - 180;
const ring = (x, z, altFt) => freeze({ x, z, altFt });

export const RING = freeze({ radius: 150, tube: 12 }); // metres. Hit = crossing the ring plane inside `radius`.
export const START_KT = 200;                           // indicated, flaps 0, gear up
export const LIMITS = freeze({ minLegM: 3000, maxTurnDeg: 60, maxGradePct: 5, ringClearFt: 1000, legClearFt: 800 });

const lm = (id, zh, en, x, z, radiusM, factZh, factEn) => freeze({ id, zh, en, x, z, radiusM, factZh, factEn });

// Facts: Wikipedia (Churfirsten, Walensee, Quinten, Mürtschenstock, Glärnisch, Uetliberg, Zürich Hauptbahnhof, Grossmünster, Lake Zurich), checked 2026-10-05.
export const TOURS = freeze([
  freeze({
    id: 'alps', scenery: 'alps', tagZh: '阿爾卑斯', tagEn: 'Alps',
    zh: '阿爾卑斯：瓦倫湖與屈爾菲爾斯坦', en: 'Alps: Walensee and the Churfirsten',
    descZh: '沿瓦倫湖北岸的陡崖飛行，折返掠過米爾琴施托克，飛向格拉爾尼施山。', descEn: 'Along the Walensee beneath the Churfirsten cliffs, back past the Mürtschenstock, toward the Glärnisch.',
    // Start over the lake's western end near Weesen, heading east. Right-hand U-turn south of the lake (wide, because a 200 kt turn needs room), then west past the Mürtschenstock toward the Glärnisch.
    start: ring(-2300, -53030, 7000),
    rings: freeze([ring(-5640, -57270, 7600), ring(-9280, -61270, 8300), ring(-7210, -68160, 9150), ring(-230, -69940, 9550), ring(4890, -64880, 9800), ring(9400, -63260, 9800)]),
    landmarks: freeze([
      lm('walensee', '瓦倫湖', 'Walensee', -7150, -58870, 4500, '湖面海拔 419 公尺，北岸是整排陡崖', 'Surface 419 m above sea level, 151 m deep'),
      lm('churfirsten', '屈爾菲爾斯坦（Churfirsten）', 'Churfirsten', -14080, -61350, 6500, '最高峰 2,306 公尺，南面是陡峭岩壁，直落瓦倫湖', 'Highest peak Hinterrugg, 2,306 m; the south face drops almost sheer to the lake'),
      lm('quinten', '屈因滕（Quinten）', 'Quinten', -10410, -62520, 2800, '湖北岸的小村，沒有道路，只能搭船或步行', 'A village on the north shore with no road: boat or footpath only'),
      lm('muertschenstock', '米爾琴施托克（Mürtschenstock）', 'Mürtschenstock', -2640, -63180, 6500, '最高點 2,441 公尺', 'Highest summit Ruchen, 2,441 m'),
      lm('glaernisch', '格拉爾尼施山（Glärnisch）', 'Glärnisch', 10760, -61480, 8000, '最高點約 2,900 公尺', 'Highest point Bächistock, 2,915 m'),
    ]),
  }),
  freeze({
    id: 'city', scenery: 'city', tagZh: '蘇黎世', tagEn: 'Zurich',
    zh: '蘇黎世：老城、湖與烏埃特利山', en: 'Zurich: old town, lake and the Uetliberg',
    descZh: '低飛掠過火車站、老城和湖口，沿湖南下，再繞過烏埃特利山。', descEn: 'A low pass over the station, old town and lake outlet, down the lake, then around the Uetliberg.',
    start: ring(4460, -1440, 3000),
    rings: freeze([ring(6040, -4340, 2900), ring(9260, -10220, 2900), ring(14660, -10430, 3600), ring(17620, -5920, 4350), ring(15230, -960, 4600), ring(10520, 690, 4600)]),
    landmarks: freeze([
      lm('hb', '蘇黎世火車站', 'Zurich HB', 7630, -7230, 2500, '第一座車站 1847 年啟用，是瑞士最大的火車站', 'Opened 1847, 408 m above sea level'),
      lm('grossmuenster', '蘇黎世大教堂（Grossmünster）', 'Grossmünster', 8000, -8060, 2500, '茨溫利 1519 年起在這裡講道，帶起蘇黎世的宗教改革', 'From 1520 Zwingli started the Swiss German Reformation here'),
      lm('limmat', '利馬特河與湖口', 'Limmat and lake outlet', 8250, -8350, 2500, '蘇黎世湖在此經利馬特河流出，湖面海拔 406 公尺', 'Lake Zurich drains here into the Limmat; surface 406 m above sea level'),
      lm('lake', '蘇黎世湖', 'Lake Zurich', 10500, -11800, 4500, '全長約 40 公里，最深 136 公尺', 'About 40 km long, 136 m deep'),
      lm('uetliberg', '烏埃特利山', 'Uetliberg', 12460, -7070, 4800, '山頂約 870 公尺，有觀景塔和電視塔', 'Summit Uto Kulm, 870 m, with a lookout tower and a 186 m TV mast'),
    ]),
  }),
]);
export const tourById = id => TOURS.find(t => t.id === id) || null;

// ---- geometry ------------------------------------------------------------------------------------------------------
export const bearing = (a, b) => Math.atan2(b.x - a.x, -(b.z - a.z)) / RAD; // local degrees, 0 = runway heading, clockwise
export function legs(tour) {
  const pts = [tour.start, ...tour.rings], out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], lengthM = Math.hypot(b.x - a.x, b.z - a.z);
    out.push({ to: i - 1, lengthM, heading: bearing(a, b), gradePct: (b.altFt - a.altFt) / FT / lengthM * 100 });
  }
  for (let i = 0; i < out.length; i++) out[i].turnDeg = i ? wrap(out[i].heading - out[i - 1].heading) : 0;
  return out;
}
export const tourLengthM = tour => legs(tour).reduce((s, l) => s + l.lengthM, 0);
// Unit normal of ring i (the incoming leg), in the local frame including the slope.
export function ringNormal(tour, i) {
  const a = i ? tour.rings[i - 1] : tour.start, b = tour.rings[i];
  const d = { x: b.x - a.x, y: (b.altFt - a.altFt) / FT, z: b.z - a.z }, n = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / n, y: d.y / n, z: d.z / n };
}
export const ringHeightM = ringDef => ringDef.altFt / FT - RUNWAY.fieldElevation; // local y

// ---- start state: level, trimmed, flaps 0, gear up ---------------------------------------------------------------------
const densityRatio = altitude => Math.pow(Math.max(216.65, 288.15 - Math.max(0, altitude + RUNWAY.fieldElevation) * .0065) / 288.15, 4.2561);
export function createTourState(tour) {
  const s = createFlightState('cruise'), h = bearing(tour.start, tour.rings[0]), hr = h * RAD, y = ringHeightM(tour.start);
  const ias = START_KT / KT, tas = ias / Math.sqrt(densityRatio(y));
  s.tour = tour.id;
  s.position = { x: tour.start.x, y, z: tour.start.z };
  s.velocity = { x: tas * Math.sin(hr), y: 0, z: -tas * Math.cos(hr) };
  s.quaternion = quaternionFromEuler(2.5 * RAD, hr, 0);
  s.flaps = 0; s.flapPosition = 0; s.gear = false; s.gearPosition = 0;
  s.throttle = s.engine = .3;
  // Let the autopilot settle the aircraft for a while, then hand it over with its thrust, trim and attitude but at the start point again.
  s.autopilot = { enabled: true, heading: h, altitude: y, speed: ias };
  for (let i = 0; i < 60 * 120; i++) stepFlight(s, { gear: false, flaps: 0, autopilot: { enabled: true, heading: h, altitude: y, speed: ias } }, 1 / 120, {});
  const settled = { ...s.autopilot };
  s.position = { x: tour.start.x, y, z: tour.start.z }; s.elapsed = 0; s.fuel = AIRCRAFT.initialFuel; s.angularVelocity = { x: 0, y: 0, z: 0 };
  s.autopilot = { ...settled, enabled: false };
  return s;
}

// ---- ring passing ---------------------------------------------------------------------------------------------------------
export function createTourRun(tour) {
  return { tour, next: 0, hits: 0, misses: 0, done: false, results: [], offsets: [], prev: null };
}
// Call every frame with the aircraft position. A ring is passed when the position crosses its plane (negative side to positive side along the
// incoming leg): inside `radius` of the ring centre it is a hit, outside a miss. A jump of more than 400 m in one call is a teleport (no test).
// Returns the events of this call: [{ type: 'hit' | 'miss', index }].
export function updateTourRun(run, position) {
  const events = [], p = { x: position.x, y: position.y, z: position.z }, prev = run.prev;
  run.prev = p;
  if (!prev || run.done || Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) > 400) return events;
  while (run.next < run.tour.rings.length) {
    const r = run.tour.rings[run.next], n = ringNormal(run.tour, run.next), c = { x: r.x, y: ringHeightM(r), z: r.z };
    const d0 = (prev.x - c.x) * n.x + (prev.y - c.y) * n.y + (prev.z - c.z) * n.z, d1 = (p.x - c.x) * n.x + (p.y - c.y) * n.y + (p.z - c.z) * n.z;
    if (!(d0 < 0 && d1 >= 0)) break;
    const f = d0 / (d0 - d1), q = { x: prev.x + (p.x - prev.x) * f - c.x, y: prev.y + (p.y - prev.y) * f - c.y, z: prev.z + (p.z - prev.z) * f - c.z };
    const hit = Math.hypot(q.x, q.y, q.z) <= RING.radius, index = run.next;
    run.results.push(hit); run.offsets.push(Math.round(Math.hypot(q.x, q.y, q.z))); run.next++; if (hit) run.hits++; else run.misses++;
    events.push({ type: hit ? 'hit' : 'miss', index });
  }
  if (run.next >= run.tour.rings.length) run.done = true;
  return events;
}
// What the player needs to know about the next ring: distance (m), turn needed (local degrees, + = right), altitude (ft MSL).
export function nextRingCue(run, state, data) {
  if (run.done) return null;
  const r = run.tour.rings[run.next], dx = r.x - state.position.x, dz = r.z - state.position.z, diff = wrap(bearing(state.position, r) - data.heading);
  return { index: run.next, count: run.tour.rings.length, distanceM: Math.hypot(dx, dz), diff, altFt: r.altFt, target: r };
}

// ---- landmark captions ----------------------------------------------------------------------------------------------------------
// The landmark you are closest to (as a share of its own radius), if you are inside that radius. Big mountains use a larger radius than the 3 km of the town landmarks.
export function nearestLandmark(tour, position) {
  let best = null, bestShare = 1;
  for (const l of tour.landmarks) {
    const share = Math.hypot(l.x - position.x, l.z - position.z) / l.radiusM;
    if (share < bestShare) { best = l; bestShare = share; }
  }
  return best;
}

// ---- best times: { [tourId]: seconds } ---------------------------------------------------------------------------------------------
export function parseTourBest(text) {
  try {
    const o = JSON.parse(text), out = {};
    if (o && typeof o === 'object') for (const t of TOURS) { const v = Number(o[t.id]); if (Number.isFinite(v) && v > 0) out[t.id] = v; }
    return out;
  } catch { return {}; }
}
export const recordTourBest = (best, id, seconds) => (!best[id] || seconds < best[id]) ? { ...best, [id]: Math.round(seconds * 10) / 10 } : best;
export const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
