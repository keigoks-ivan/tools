import { SCENARIOS } from './scenarios.mjs';

const words = (zh, en) => Object.freeze({ zh, en });
const kinds = (intel, cache, relay) => Object.freeze({
  intel: Object.freeze({
    name: words(intel[0], intel[1]),
    brief: words('靠近情報終端，安全時按住 E 三秒下載現地紀錄。任務可隨時放棄，不影響主線。', 'Approach the terminal and hold E for three safe seconds to retrieve its records. This optional task does not block the main mission.'),
    reward: words('雷達與戰術地圖標示敵軍三十秒。', 'Reveal enemies on radar and the tactical map for 30 seconds.'),
  }),
  cache: Object.freeze({
    name: words(cache[0], cache[1]),
    brief: words('靠近物資箱，安全時按住 E 三秒整理可用補給。每次出擊只能領取一次。', 'Approach the supply case and hold E for three safe seconds to recover its contents. It can be claimed once per sortie.'),
    reward: words('生命＋15、護盾＋25、手榴彈＋1；上限為100／60／3。', 'Health +15, shield +25, grenade +1; capped at 100 / 60 / 3.'),
  }),
  relay: Object.freeze({
    name: words(relay[0], relay[1]),
    brief: words('靠近通訊控制台，安全時按住 E 三秒恢復連線。受火力干擾時進度回退，可稍後再試。', 'Approach the relay console and hold E for three safe seconds to reconnect it. Incoming fire sets progress back; you can try again later.'),
    reward: words('戰術支援次數＋1，上限三次。', 'Tactical support +1, capped at three charges.'),
  }),
});

/** Scene-specific fiction; reward quantities belong to the mission integration. */
export const FIELD_OBJECTIVES = Object.freeze({
  pass: Object.freeze({ name: words('山道備援節點', 'Pass backup station'), brief: words('撤離車隊留下的山道備援設備，值得繞路回收。', 'Recover backup equipment left by the evacuation convoy.'), kinds: kinds(['車隊路況紀錄','Convoy route records'],['山道急救箱','Pass emergency case'],['隧道備援電台','Tunnel backup radio']) }),
  city: Object.freeze({ name: words('街區救援節點', 'District relief station'), brief: words('街區臨時救援站留下情報、物資與通訊設備。', 'A neighborhood relief station holds records, supplies, and communications equipment.'), kinds: kinds(['街區撤離紀錄','District evacuation records'],['診所備用物資','Clinic reserve supplies'],['民防備援通訊','Civil defense relay']) }),
  forest: Object.freeze({ name: words('林間前哨節點', 'Woodland outpost station'), brief: words('林間前哨的備援器材藏在主通路旁，位置已標示。', 'The woodland outpost has backup equipment beside the main approach. Its position is marked.'), kinds: kinds(['前哨觀測紀錄','Outpost observation records'],['巡邏班補給箱','Patrol supply case'],['林間短波電台','Woodland shortwave radio']) }),
  dam: Object.freeze({ name: words('水壩維修節點', 'Dam maintenance station'), brief: words('維修班留下設備與紀錄，可協助守住水壩通道。', 'Maintenance equipment and records can help secure the dam approaches.'), kinds: kinds(['水壩值勤紀錄','Dam duty records'],['維修班醫療物資','Maintenance medical supplies'],['機房備援控制台','Plant backup console']) }),
  airfield: Object.freeze({ name: words('機場地勤節點', 'Airfield ground crew station'), brief: words('地勤備援設備仍可使用，但回收時需要短暫停步。', 'Ground crew backup equipment still works, but recovery requires a short halt.'), kinds: kinds(['地勤航班紀錄','Ground crew flight records'],['整備區備用物資','Staging reserve supplies'],['航管備援中繼台','Air traffic backup relay']) }),
  underground: Object.freeze({ name: words('地下維修節點', 'Underground maintenance station'), brief: words('停電前留下的離線紀錄與備援設備仍可回收。', 'Offline records and backup equipment left before the blackout can still be recovered.'), kinds: kinds(['工廠離線紀錄','Factory offline records'],['工班緊急物資','Work crew emergency supplies'],['封鎖備援控制台','Lockdown backup console']) }),
  rail: Object.freeze({ name: words('鐵路調度節點', 'Rail dispatch station'), brief: words('調度班留在貨場旁的紀錄與物資，能支援目前防線。', 'Dispatch records and supplies beside the freight yard can support the current line.'), kinds: kinds(['貨運調度紀錄','Freight dispatch records'],['月台備用物資','Platform reserve supplies'],['調度備援通訊台','Dispatch backup relay']) }),
});

const radius = .45;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); }
  return n >>> 0;
}
function random(seed) {
  let n = seed >>> 0;
  return () => { n = (n + 0x6d2b79f5) >>> 0; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Conservative standing-capsule segment check also verifies the connection from
// the actual start to its grid node. nav.route alone starts at a nearest node.
function clearRouteSegment(map, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const box of map.solid.list) {
    if (box.dead || box.noMove || box.ramp || box.y1 <= Math.min(a.y, b.y) + .48 || box.y0 >= Math.max(a.y, b.y) + 1.7) continue;
    let lo = 0, hi = 1;
    for (const [p, d, min, max] of [[a.x, dx, box.x0 - .34, box.x1 + .34], [a.z, dz, box.z0 - .34, box.z1 + .34]]) {
      if (Math.abs(d) < 1e-9) { if (p < min || p > max) { lo = 2; break; } }
      else { const v0 = (min - p) / d, v1 = (max - p) / d; lo = Math.max(lo, Math.min(v0, v1)); hi = Math.min(hi, Math.max(v0, v1)); }
    }
    if (lo <= hi && hi >= 0 && lo <= 1) return false;
  }
  return true;
}

function clearFootprint(map, p) {
  const bounds = map.bounds;
  if (bounds && (p.x - radius < bounds.x0 || p.x + radius > bounds.x1 || p.z - radius < bounds.z0 || p.z + radius > bounds.z1)) return false;
  // Equipment stands on terrain, rather than on a crate, roof, or ramp.
  const base = map.ground(p.x, p.z);
  if (!Number.isFinite(base)) return false;
  if (typeof map.solid.floorAt === 'function' && map.solid.floorAt(p.x, p.z, base + .16, radius) > base + .12) return false;
  // Adjustable feet can accommodate the existing gently sloping terrain.
  for (const [x, z] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]) if (Math.abs(map.ground(p.x + x, p.z + z) - base) > .1) return false;
  for (const box of map.solid.list) {
    if (box.dead || box.y1 <= base + .015 || box.y0 >= base + 1.46) continue;
    const x = clamp(p.x, box.x0, box.x1), z = clamp(p.z, box.z0, box.z1);
    if ((p.x - x) ** 2 + (p.z - z) ** 2 < radius ** 2 - 1e-8) return false;
  }
  return true;
}

/** Return an accessible, grounded optional detour; never substitute another island. */
export function chooseFieldSite(map, { scene, mode = 'defend', seed = 0 } = {}) {
  const scenario = SCENARIOS.find(s => s.id === scene);
  const start = map?.starts?.[mode];
  if (!scenario || !finitePoint(start) || !map.nav?.nodes || typeof map.nav.route !== 'function' || !map.solid?.list || typeof map.ground !== 'function') return null;
  const first = scenario.targets[0], randomValue = random(hash(`${scene}/${mode}/${seed}`));
  const side = randomValue() < .5 ? -1 : 1;
  const ideal = { x: side * (7 + randomValue() * 5), z: start.z + (first.z - start.z) * (.42 + randomValue() * .15) };
  const targets = [...scenario.targets, { x: 0, z: -39 }];
  const candidates = [];
  for (const node of map.nav.nodes) {
    if (node.blocked || !finitePoint(node) || node.z > first.z + 3 || node.z < start.z - 3 || distance(node, start) < 10 - 1e-8 || targets.some(p => distance(node, p) < 8 - 1e-8) || (finitePoint(map.supply) && distance(node, map.supply) < 5 - 1e-8)) continue;
    if ((map.spawns || []).some(p => distance(node, p) < 20)) continue;
    const site = { x: node.x, y: map.ground(node.x, node.z), z: node.z };
    if (!clearFootprint(map, site)) continue;
    const directLane = Math.abs(site.x) < 5 ? 12 : 0;
    const forward = site.z > first.z - 8 ? 14 : 0;
    const score = distance(site, ideal) + directLane + forward;
    candidates.push({ site, score });
  }
  candidates.sort((a, b) => a.score - b.score || a.site.z - b.site.z || a.site.x - b.site.x);
  const from = { x: start.x, y: Number.isFinite(start.y) ? start.y : map.ground(start.x, start.z), z: start.z };
  for (const { site } of candidates) {
    const route = map.nav.route(from, site);
    if (!route.length) continue;
    let previous = from, valid = true;
    for (const point of route) {
      if (!clearRouteSegment(map, previous, point)) { valid = false; break; }
      previous = point;
    }
    if (valid && distance(previous, site) < .01) return site;
  }
  return null;
}

/** One physical task per deployment. Only a new FieldTask starts another sortie. */
export class FieldTask {
  constructor(scene, kind, site) {
    const description = Object.hasOwn(FIELD_OBJECTIVES, scene) ? FIELD_OBJECTIVES[scene] : null;
    if (!description || !Object.hasOwn(description.kinds, kind) || !finitePoint(site) || !Number.isFinite(site.y)) throw new TypeError('Invalid field objective');
    this.scene = scene;
    this.kind = kind;
    this.site = Object.freeze({ x: site.x, y: site.y, z: site.z });
    this.definition = description.kinds[kind];
    this.holdTime = 3;
    this.progress = 0;
    this.completed = false;
  }
  get ratio() { return clamp(this.progress / this.holdTime, 0, 1); }
  update(dt, { near = false, interact = false, blocked = false } = {}) {
    if (this.completed) return null;
    const elapsed = Number.isFinite(dt) ? clamp(dt, 0, .25) : 0;
    if (near && interact && !blocked) this.progress = Math.min(this.holdTime, this.progress + elapsed);
    else this.progress = Math.max(0, this.progress - elapsed * (blocked ? 1.5 : near ? .6 : 1));
    if (this.progress >= this.holdTime - 1e-8) { this.progress = this.holdTime; this.completed = true; return 'completed'; }
    return null;
  }
}
