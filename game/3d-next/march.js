/**
 * 夜市大街行軍關（3D 灰模）— level director. Renderer independent: runs in node for tests.
 *
 * Design: game/design/level-night-market-march.md. Four gated segments along one street
 * (south → north = +z → -z in world metres, large y → small y in Arena px):
 *   1 入口市集  kill 30            → barrier 1 opens
 *   2 夜市廣場  break 3 妖燈, then 敵將「赤角」 → barrier 2 opens
 *   3 魂門階梯  hold the 魂燈 40 s, then 敵將「影爪」 → barrier 3 opens
 *   4 魂門頂端  守將「魂門守將」, two phases → clear + rank
 *
 * Units: the Arena works in px (60 px = 1 m, x = 640 + wx*60, y = 500 + wz*60). LEVEL is
 * authored in metres; every event and hazard this module emits uses Arena px (x, y, radius,
 * length, width) so battle.js can keep using toWorldX / toWorldZ.
 *
 * Integration (see MarchDirector below): battle.js creates `new MarchDirector({ mobile })`,
 * uses `march.arena` wherever it used `arena`, calls `march.update(dt, input)` instead of
 * `arena.update`, `march.drainEvents()` instead of `arena.drainEvents()`, reads `march.hud()`
 * for the HUD, `march.view()` for world props (march-world.js update), and `march.result`
 * once `march.state !== 'play'`.
 */
import { Arena } from '../2d/combat.js';

export const PX_PER_M = 60;
/** On-screen enemy budget (props such as lanterns excluded). Tune after device measurement. */
export const ENEMY_CAP = { desktop: 16, mobile: 10 };

export const toPx = (wx, wz) => ({ x: 640 + wx * PX_PER_M, y: 500 + wz * PX_PER_M });
export const toWorld = (x, y) => ({ x: (x - 640) / PX_PER_M, z: (y - 500) / PX_PER_M });

/**
 * LAYOUT — the whole level as plain data (no functions, JSON-serialisable). The graybox
 * (march-world.js) and the art scene both build from it; the director reads the same table.
 *
 * Coordinates: world metres, three.js axes. x = left(-)/right(+), z = south(+) → north(-), the
 * hero walks toward -z. y = up. Arena px convert with toPx / toWorld (60 px = 1 m).
 * Floor height is heightAt(x, z) (flat 0 except stairs.ramps / sideStairs; top = stairs.topHeight).
 *
 *   segments[i]   playable area of segment i. shape 'rect' → minX..maxX × minZ..maxZ;
 *                 shape 'circle' → centre (cx, cz), radius r, clipped to minZ..maxZ.
 *                 entry = where skipTo() puts the hero.
 *   gates[i]      barrier wall between segment i and i+1: a wall across x ∈ [-halfWidth, halfWidth] at z.
 *                 Closed until the objective is done, opens, then seals once the hero is enterDepth past it.
 *   stairs        ramps: floor rises from h0 (at z0) to h1 (at z1) — four flights; flat between them.
 *                 tiers: the three terraces (for set dressing). sideStairs: on the middle tier the floor
 *                 drops outward past |x| = fromX by `slope` m per m (enemy entry stairs, left and right).
 *   props         fountain / lamp (solid circles), lanterns (demon lanterns, breakable objective props),
 *                 soulGate (the gate arch behind the boss platform).
 *   breakables    crates / jars / barrels: { segment, type, x, z }. Hit to break; drop food or wine.
 *   spawns        where enemies appear (see each entry's comment).
 */
export const LAYOUT = {
  units: 'metres',
  pxPerMetre: PX_PER_M,
  start: { x: 0, z: 0 },
  segments: [
    { id: 'market', name: '入口市集', shape: 'rect', minX: -7, maxX: 7, minZ: -30, maxZ: 2, entry: { x: 0, z: 0 } },
    { id: 'plaza', name: '夜市廣場', shape: 'circle', cx: 0, cz: -41, r: 12.5, minZ: -52, maxZ: -30, entry: { x: 0, z: -33.5 } },
    { id: 'stairs', name: '魂門階梯', shape: 'rect', minX: -8, maxX: 8, minZ: -84, maxZ: -52, entry: { x: 0, z: -55.5 } },
    { id: 'top', name: '魂門頂端', shape: 'circle', cx: 0, cz: -92.5, r: 10, minZ: -102.5, maxZ: -84, entry: { x: 0, z: -87.5 } },
  ],
  gates: [{ z: -30, halfWidth: 7 }, { z: -52, halfWidth: 8 }, { z: -84, halfWidth: 5.3 }],
  enterDepth: 3,
  stairs: {
    ramps: [
      { z0: -52, z1: -54, h0: 0, h1: 0.6 },
      { z0: -61, z1: -63, h0: 0.6, h1: 1.8 },
      { z0: -72, z1: -74, h0: 1.8, h1: 3.0 },
      { z0: -82, z1: -84, h0: 3.0, h1: 3.6 },
    ],
    tiers: [
      { name: 'lower', minZ: -61, maxZ: -54, height: 0.6 },
      { name: 'middle', minZ: -72, maxZ: -63, height: 1.8 },
      { name: 'upper', minZ: -82, maxZ: -74, height: 3.0 },
    ],
    topHeight: 3.6,
    sideStairs: { minZ: -72, maxZ: -63, fromX: 8, toX: 12, slope: 0.45 },
  },
  fountain: { x: 0, z: -41, r: 2.6 },
  lanterns: [{ x: -9.4, z: -38 }, { x: 9.4, z: -38 }, { x: 0, z: -49.5 }],
  lamp: { x: 0, z: -67.5, r: 0.9 },
  soulGate: { z: -103.5, halfWidth: 4.2, height: 11.8, portalY: 7.2, portalRadius: 3 },
  soulGateZ: -103.5,
  breakables: [
    // type: crate (wooden crate), jar (wine jar), barrel (stall barrel)
    { segment: 0, type: 'barrel', x: -6.2, z: -3 }, { segment: 0, type: 'crate', x: 6.2, z: -6 },
    { segment: 0, type: 'jar', x: -6.3, z: -11 }, { segment: 0, type: 'crate', x: 6.2, z: -15.5 },
    { segment: 0, type: 'barrel', x: -6.2, z: -20 }, { segment: 0, type: 'jar', x: 6.3, z: -25 },
    { segment: 1, type: 'crate', x: -10.5, z: -44 }, { segment: 1, type: 'jar', x: 10.5, z: -44 },
    { segment: 1, type: 'barrel', x: -6, z: -32.5 }, { segment: 1, type: 'crate', x: 6, z: -32.5 },
    { segment: 2, type: 'crate', x: -7, z: -57 }, { segment: 2, type: 'jar', x: 7, z: -57 },
    { segment: 2, type: 'barrel', x: -7, z: -78 }, { segment: 2, type: 'crate', x: 7, z: -78 },
    { segment: 3, type: 'jar', x: -8.2, z: -90 }, { segment: 3, type: 'crate', x: 8.2, z: -90 },
    { segment: 3, type: 'barrel', x: -5.5, z: -99.5 }, { segment: 3, type: 'jar', x: 5.5, z: -99.5 },
  ],
  spawns: {
    // Market groups step out from behind the stalls at x = ±marketSideX, 5–11 m ahead of the hero.
    marketSideX: 6.6,
    // Plaza groups appear 1.8 m from each lantern, on the fountain side.
    lanternRing: 1.8,
    // Stairs waves climb the side stairs (both sides every wave) onto the middle tier.
    stairEntries: { left: [{ x: -7.6, z: -65.5 }, { x: -7.6, z: -69.5 }], right: [{ x: 7.6, z: -65.5 }, { x: 7.6, z: -69.5 }] },
    // Extra stairs groups march down from the upper tier.
    stairsTop: [{ x: -4, z: -80 }, { x: 4, z: -80 }],
    officers: { red: { x: 0, z: -46.5 }, shadow: { x: 0, z: -79 }, market: { x: 0, z: -26 } },
    boss: { x: 0, z: -97 },
    bossSummonRadius: 5,
  },
};
/** @deprecated alias kept for existing callers. */
export const LEVEL = LAYOUT;
LAYOUT.stairEntries = LAYOUT.spawns.stairEntries;
LAYOUT.bossStart = LAYOUT.spawns.boss;

/** Player-facing pickup names by kind id (floating text / HUD). */
export const PICKUP_LABELS = { bun: '護符', bigBun: '靈燈', wine: '魂晶' };

export const TUNING = {
  // Pacing (target ≈ 8 min for a competent player; see RANK_RULES for measured bot times).
  market: { goal: 85, groupMin: 5, groupMax: 7, groupEvery: 6, runnerShare: 0.25 },
  plaza: { lanternHp: 320, groupSize: 4, groupEvery: 6, runnerShare: 0.25 },
  // Every wave climbs both side stairs at once: perSide units per side, the first raidersPerSide go for the lamp.
  // topGroupEvery / topGroupSize: extra non-raider groups marching down from the upper tier.
  stairs: { holdSeconds: 110, lampHp: 40, relight: 2, waveEvery: 5.5, perSide: 2, raidersPerSide: 2, runnerShare: 0.35, topGroupEvery: 12, topGroupSize: 3,
    raiderAggro: 100, raiderSpeed: [90, 120] },   // px: raiders ignore the hero until this close; grunt / runner speed
  // March-only unit stats (Arena defaults: grunt 5, runner 4). Runners sidestep light attacks.
  // recover: seconds between attacks (Arena default 2.0). attackers: simultaneous attack tokens (Arena warrior default 2).
  units: { gruntHp: 8, runnerHp: 6, runnerEvade: 0.3, recover: { grunt: 1.5, runner: 1.2 } },
  attackers: 3,
  segmentHeal: 10,
  officerHeal: 20,
  // Breakables (LAYOUT.breakables): hp per type and what each type drops; the rest of the roll drops nothing.
  breakables: {
    hp: { crate: 6, jar: 4, barrel: 10 },
    tables: { crate: [['bun', 0.6], ['bigBun', 0.1], ['wine', 0.1]], jar: [['wine', 0.45], ['bun', 0.35]], barrel: [['bigBun', 0.35], ['bun', 0.45]] },
  },
  // Pickups auto-collect on touch and vanish after pickupLife seconds. Player-facing names (PICKUP_LABELS):
  // bun → 護符 (+15 hp), bigBun → 靈燈 (+30 hp), wine → 魂晶 (+25 musou). Kind ids stay as-is.
  drops: { bun: { heal: 15 }, bigBun: { heal: 30 }, wine: { energy: 25 } },
  pickupLife: 15,
  staggerSeconds: 2,
  staggerRadius: 12,          // m
  comboWindow: 2.5,           // s between hits before the hit counter resets
  // Killing blow on an officer / the boss: renderer slow-mo hint carried on officerDown / bossDown.
  killSlowMo: { scale: 0.2, seconds: 0.8, easeOut: 0.15 },
  officers: {
    // guard: see GUARD in 2d/combat.js; turnRate (rad/s) lets the hero get behind them.
    // guardRearm: seconds after a guard break before it can be broken again (GUARD.rearm = 3 by default).
    market: { name: '青牙', hp: 75, speed: 70, range: 100, damage: 12, telegraphTime: 0.8, recover: 1.3, specialScale: 0.5, cooldown: 1, guard: true, turnRate: 2.4, guardRearm: 2 },
    red: { name: '赤角', hp: 75, speed: 72, range: 100, damage: 14, telegraphTime: 0.8, recover: 1.2, specialScale: 0.5, cooldown: 1, guard: true, turnRate: 2.4, guardRearm: 2 },
    shadow: { name: '影爪', hp: 75, speed: 170, damage: 11, specialScale: 0.5, guard: true, guardRearm: 2, lunges: 3, lungeLength: 6, lungeWidth: 1.3, lungeTime: 0.25 },
  },
  // followUpSweep: phase-2 telegraph (s) of the sweep that follows the double slam (0 = off).
  // specialScale 1: the boss takes full musou damage (officers take half); the renderer never launches it.
  boss: { name: '魂門守將', hp: 315, speed: 55, specialScale: 1, guard: true, turnRate: 1.8, sweepRadius: 3.6, sweepDamage: 16, slamRadius: [3, 4.2], slamDamage: 22, summon: 8, sweepShare: 0.6, followUpSweep: 0.8,
    resummon: { every: 18, count: 4 } },   // phase 2: extra grunts every `every` s (within the enemy budget)
};

// ---- Rank ----------------------------------------------------------------
/** Points per criterion; total ≥ 8 → S, ≥ 6 → A, ≥ 4 → B, else C. */
export const RANK_RULES = {
  // Re-derived 2026-09-24 from the ~8 min layout: expert bot 416–461 s (avg 440), casual bot ≈ 400–435 s
  // when it survives. ≤ 7:30 → 3, ≤ 9:00 → 2, ≤ 11:00 → 1.
  time: [[450, 3], [540, 2], [660, 1]],      // clear time in seconds ≤ threshold
  combo: [[60, 3], [40, 2], [20, 1]],        // max hit combo ≥ threshold
  hp: [[0.7, 3], [0.4, 2], [0.15, 1]],       // remaining hp / max ≥ threshold
  grades: [[8, 'S'], [6, 'A'], [4, 'B'], [0, 'C']],
};

export function rankFor({ time, maxCombo, hp, maxHp = 100 }, rules = RANK_RULES) {
  const points = {
    time: rules.time.find(([limit]) => time <= limit)?.[1] ?? 0,
    combo: rules.combo.find(([limit]) => maxCombo >= limit)?.[1] ?? 0,
    hp: rules.hp.find(([limit]) => hp / maxHp >= limit)?.[1] ?? 0,
  };
  const total = points.time + points.combo + points.hp;
  const rank = rules.grades.find(([limit]) => total >= limit)[1];
  return { rank, total, points };
}

// ---- Geometry helpers (metres) ------------------------------------------------
export function insideSegment(segment, p, margin = 0) {
  if (p.z > segment.maxZ + margin || p.z < segment.minZ - margin) return false;
  if (segment.shape === 'rect') return p.x >= segment.minX - margin && p.x <= segment.maxX + margin;
  return Math.hypot(p.x - segment.cx, p.z - segment.cz) <= segment.r + margin;
}

export function clampToSegment(segment, p) {
  const z = Math.max(segment.minZ, Math.min(segment.maxZ, p.z));
  if (segment.shape === 'rect') return { x: Math.max(segment.minX, Math.min(segment.maxX, p.x)), z };
  const dx = p.x - segment.cx, dz = z - segment.cz, d = Math.hypot(dx, dz);
  if (d <= segment.r) return { x: p.x, z };
  return { x: segment.cx + dx / d * segment.r, z: segment.cz + dz / d * segment.r };
}

/** Clamps a point into the union of `segments` (nearest projection when outside all). */
export function clampToRegion(segments, p) {
  if (segments.some(segment => insideSegment(segment, p))) return p;
  let best = null, bestD = Infinity;
  for (const segment of segments) {
    const q = clampToSegment(segment, p);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) { best = q; bestD = d; }
  }
  return best;
}

function segmentBoundsPx(segments) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.shape === 'rect' ? s.minX : s.cx - s.r);
    maxX = Math.max(maxX, s.shape === 'rect' ? s.maxX : s.cx + s.r);
    minZ = Math.min(minZ, s.minZ);
    maxZ = Math.max(maxZ, s.maxZ);
  }
  return { minX: 640 + minX * PX_PER_M, maxX: 640 + maxX * PX_PER_M, minY: 500 + minZ * PX_PER_M, maxY: 500 + maxZ * PX_PER_M };
}

/** Floor height (m) at a world point, derived from LAYOUT.stairs. */
export function heightAt(wx, wz) {
  const { ramps, sideStairs } = LAYOUT.stairs;
  let h = 0;
  for (const ramp of ramps) {
    if (wz > ramp.z0) break;
    h = ramp.h0 + (ramp.h1 - ramp.h0) * Math.min(1, (ramp.z0 - wz) / (ramp.z0 - ramp.z1));
  }
  if (Math.abs(wx) > sideStairs.fromX && wz <= sideStairs.maxZ && wz >= sideStairs.minZ) h = Math.max(0, h - (Math.abs(wx) - sideStairs.fromX) * sideStairs.slope);
  return h;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MAX_EVENTS = 256;

/**
 * Level director. Public surface:
 *   arena                 the Arena (director mode, warriorMode + musou)
 *   update(dt, input)     step Arena + level; input is the Arena input object
 *   drainEvents()         Arena events + level events, in order (px coordinates)
 *   hud()                 { segment, segmentName, objective, timer, hint, foe, lamp, combo, maxCombo, elapsed, kills, phase }
 *   view()                { segment, time, gates, lanterns, lamp, breakables, pickups, hazards } for march-world.update
 *   hazards               live ground telegraphs [{ shape, x, y, radius | facing+length+width, start, until, attack }]
 *   state                 'play' | 'clear' | 'dead';  result (set on clear/dead)
 *   skipTo(i)             debug: jump to segment i (0-3) with the hero at its entry
 */
export class MarchDirector {
  constructor({ seed = 17, mobile = false, cap } = {}) {
    this.seed = seed >>> 0;
    this.cap = cap ?? (mobile ? ENEMY_CAP.mobile : ENEMY_CAP.desktop);
    this.arena = new Arena({ seed: this.seed, warriorMode: true, musou: true, director: true, maxAttackers: TUNING.attackers, jump: true, musouFlurry: true, bounds: segmentBoundsPx([LEVEL.segments[0]]) });
    this.reset();
  }

  reset() {
    this.arena.reset();
    this.randomState = (this.seed ^ 0x9e3779b9) >>> 0;
    this.time = 0;
    this.state = 'play';
    this.result = null;
    this.events = [];
    this.units = new Map();
    this.hazards = [];
    this.pickups = [];
    this.brokenProps = new Set();
    this.nextPickupId = 1;
    this.nextHazardId = 1;
    this.gates = LEVEL.gates.map(gate => ({ ...gate, open: false }));
    this.combo = 0;
    this.maxCombo = 0;
    this.lastHitAt = -Infinity;
    this.hint = '';
    this.hintUntil = 0;
    this.stats = { spawned: { grunt: 0, runner: 0, officer: 0, boss: 0 }, segmentTimes: [], peakAlive: 0 };
    this.segmentIndex = -1;
    this.seg = null;
    const start = toPx(LEVEL.start.x, LEVEL.start.z);
    this.arena.hero.x = start.x;
    this.arena.hero.y = start.y;
    this.arena.hero.facing = -Math.PI / 2;
    this._startSegment(0);
    return this.hud();
  }

  get segment() { return LEVEL.segments[this.segmentIndex]; }

  update(dt, input = {}) {
    if (this.state !== 'play') return this.hud();
    const arena = this.arena;
    const before = arena.time;
    arena.update(dt, input);
    const step = arena.time - before;
    this._collectArenaEvents();
    if (step > 0 && arena.state === 'play') {
      this.time += step;
      this._constrain();
      this._tickSegment(step);
      this._tickExternal(step);
      this.hazards = this.hazards.filter(hazard => hazard.until > this.time);
      this._tickPickups();
      if (this.combo > 0 && this.time - this.lastHitAt > TUNING.comboWindow) this.combo = 0;
      this._checkProgress();
      this.stats.peakAlive = Math.max(this.stats.peakAlive, this.alive());
    }
    if (arena.state === 'dead' && this.state === 'play') {
      this.state = 'dead';
      this.result = { rank: null, time: this.time, maxCombo: this.maxCombo, hp: 0, maxHp: arena.hero.maxHp, kills: arena.kills, segment: this.segmentIndex };
      this._emit('fail', { segment: this.segmentIndex });
    }
    return this.hud();
  }

  drainEvents() {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  /** Live non-prop enemies (what the renderer has to draw as characters). */
  alive() {
    return this.arena.enemies.reduce((n, enemy) => n + (enemy.action !== 'dead' && !enemy.prop ? 1 : 0), 0);
  }

  room() { return Math.max(0, this.cap - this.alive()); }

  hud() {
    const seg = this.seg;
    const foeUnit = seg?.foeId ? this.units.get(seg.foeId) : null;
    const foe = foeUnit && foeUnit.hp > 0 ? { name: foeUnit.name, hp: foeUnit.hp, maxHp: foeUnit.maxHp, role: foeUnit.role, phase: foeUnit.phase || 1 } : null;
    return {
      segment: this.segmentIndex + 1,
      segmentName: this.segment?.name || '',
      objective: this._objective(),
      timer: this.segmentIndex === 2 && seg && !seg.secured ? seg.timer : null,
      hint: this.time < this.hintUntil ? this.hint : '',
      foe,
      lamp: this.segmentIndex === 2 && seg ? { hp: seg.lamp.hp, maxHp: seg.lamp.maxHp, down: seg.lamp.down > 0 } : null,
      combo: this.combo,
      maxCombo: this.maxCombo,
      elapsed: this.time,
      kills: this.arena.kills,
      alive: this.alive(),
      cap: this.cap,
      state: this.state,
    };
  }

  view() {
    const seg = this.seg;
    return {
      segment: this.segmentIndex,
      time: this.time,
      gates: this.gates.map(gate => ({ ...gate })),
      lanterns: this.segmentIndex >= 1 ? LEVEL.lanterns.map((lantern, index) => {
        const unit = this.segmentIndex === 1 ? this.units.get(seg.lanternIds[index]) : null;
        const hp = unit ? unit.hp : 0;
        return { index, ...toPx(lantern.x, lantern.z), hp, maxHp: TUNING.plaza.lanternHp, broken: hp <= 0, enemyId: unit?.id ?? null };
      }) : LEVEL.lanterns.map((lantern, index) => ({ index, ...toPx(lantern.x, lantern.z), hp: TUNING.plaza.lanternHp, maxHp: TUNING.plaza.lanternHp, broken: false, enemyId: null })),
      lamp: { ...toPx(LEVEL.lamp.x, LEVEL.lamp.z), ...(this.segmentIndex === 2 ? { hp: seg.lamp.hp, maxHp: seg.lamp.maxHp, down: seg.lamp.down > 0, secured: seg.secured } : { hp: 1, maxHp: 1, down: false, secured: this.segmentIndex > 2 }) },
      breakables: LAYOUT.breakables.map((spot, index) => {
        const unit = this.arena.enemies.find(enemy => enemy.breakIndex === index && enemy.kind === 'breakable');
        return { index, type: spot.type, ...toPx(spot.x, spot.z), broken: this.brokenProps.has(index), hp: unit ? unit.hp : TUNING.breakables.hp[spot.type], maxHp: TUNING.breakables.hp[spot.type], enemyId: unit?.id ?? null };
      }),
      pickups: this.pickups.map(pickup => ({ ...pickup })),
      hazards: this.hazards.map(hazard => ({ ...hazard, progress: Math.min(1, (this.time - hazard.start) / Math.max(0.01, hazard.until - hazard.start)) })),
    };
  }

  /** Debug / test helper: jump to segment `index` with a clean field and the hero at its entry. */
  skipTo(index) {
    this.arena.enemies.length = 0;
    this.units.clear();
    this.hazards = [];
    this.pickups = [];
    for (let i = 0; i < this.gates.length; i++) this.gates[i].open = false;
    const entry = LEVEL.segments[index].entry;
    const p = toPx(entry.x, entry.z);
    Object.assign(this.arena.hero, { x: p.x, y: p.y, facing: -Math.PI / 2, action: 'idle', actionTime: 0 });
    this.arena.attack = null;
    this.hint = '';
    this.hintUntil = 0;
    this._startSegment(index);
  }

  // ---------------------------------------------------------------------------

  _rand() {
    let t = this.randomState += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  _emit(type, values = {}) {
    if (this.events.length >= MAX_EVENTS) this.events.shift();
    this.events.push({ type, ...values });
  }

  _say(text, seconds = 4) {
    this.hint = text;
    this.hintUntil = this.time + seconds;
    this._emit('hint', { text, seconds });
  }

  _region() {
    const i = this.segmentIndex;
    const segments = [LEVEL.segments[i]];
    if (this.gates[i]?.open) segments.push(LEVEL.segments[i + 1]);
    return segments;
  }

  _applyRegion() {
    this.arena.setBounds(segmentBoundsPx(this._region()));
  }

  _objective() {
    const i = this.segmentIndex, seg = this.seg;
    if (this.state === 'clear') return '夜市重歸寧靜';
    if (this.state === 'dead') return '重新集結';
    if (this.gates[i]?.open) return `前進：${LEVEL.segments[i + 1].name}`;
    if (i === 0) return seg.kills >= TUNING.market.goal && TUNING.officers.market ? `擊倒敵將 ${TUNING.officers.market.name}` : `擊倒妖兵 ${Math.min(seg.kills, TUNING.market.goal)}／${TUNING.market.goal}`;
    if (i === 1) return seg.broken < 3 ? `打破妖燈 ${seg.broken}／3` : `擊倒敵將 ${TUNING.officers.red.name}`;
    if (i === 2) return seg.secured ? `擊倒敵將 ${TUNING.officers.shadow.name}` : seg.lamp.down > 0 ? '魂燈重燃中…' : `守住魂燈 ${formatClock(seg.timer)}`;
    return `擊倒 ${TUNING.boss.name}`;
  }

  _startSegment(index) {
    const hero = this.arena.hero;
    if (this.segmentIndex >= 0) this.stats.segmentTimes.push(this.time);
    this.segmentIndex = index;
    if (index > 0 && this.gates[index - 1].open) {
      this.gates[index - 1].open = false;
      this._emit('gateClose', { index: index - 1, ...toPx(0, this.gates[index - 1].z) });
    }
    this._applyRegion();
    // Stragglers left behind the sealed barrier give up.
    const segment = LEVEL.segments[index];
    for (const enemy of [...this.arena.enemies]) {
      if (insideSegment(segment, toWorld(enemy.x, enemy.y), 0.5)) continue;
      this._removeUnit(enemy, enemy.prop ? 'despawn' : 'flee');
    }
    // Heal drops left behind the sealed barrier fade out.
    this.pickups = this.pickups.filter(pickup => {
      if (insideSegment(segment, toWorld(pickup.x, pickup.y), 0.5)) return true;
      this._emit('pickupLost', { pickupId: pickup.id, x: pickup.x, y: pickup.y });
      return false;
    });
    const heal = Math.min(TUNING.segmentHeal, hero.maxHp - hero.hp);
    if (heal > 0) {
      hero.hp += heal;
      this._emit('heal', { x: hero.x, y: hero.y, amount: heal });
    }
    this._emit('segment', { index, id: segment.id, name: segment.name, heal, x: hero.x, y: hero.y });
    LAYOUT.breakables.forEach((spot, breakIndex) => {
      if (spot.segment !== index || this.brokenProps.has(breakIndex)) return;
      this._spawnUnit('breakable', spot.x, spot.z, {
        kind: 'breakable', breakType: spot.type, breakIndex, hp: TUNING.breakables.hp[spot.type],
        ai: 'external', fixed: true, prop: true, action: 'idle', range: 0, cooldown: 0,
      });
    });
    if (index === 0) {
      this.seg = { kills: 0, spawned: 0, nextGroupAt: this.time + 1.2, hints: 0, officerAt: null, foeId: null };
      this._say('輕攻擊：J（攻）連按打出五連斬', 5);
    } else if (index === 1) {
      this.seg = { broken: 0, lanternIds: [], nextSpawnAt: [], officerAt: null, foeId: null };
      LEVEL.lanterns.forEach((lantern, i) => {
        const unit = this._spawnUnit('lantern', lantern.x, lantern.z, {
          hp: TUNING.plaza.lanternHp, ai: 'external', fixed: true, prop: true, kind: 'lantern', lanternIndex: i, action: 'idle', range: 0, cooldown: 0,
        });
        this.seg.lanternIds.push(unit.id);
        this.seg.nextSpawnAt.push(this.time + 1.5 + i * 2);
      });
      this._say('打破三盞妖燈，燈不滅，妖兵不停', 4);
    } else if (index === 2) {
      const t = TUNING.stairs;
      this.seg = { lamp: { hp: t.lampHp, maxHp: t.lampHp, down: 0 }, timer: t.holdSeconds, secured: false, nextWaveAt: this.time + 1.5, nextTopAt: this.time + t.topGroupEvery, side: this._rand() < 0.5 ? 'left' : 'right', officerAt: null, foeId: null, breaks: 0 };
      this._say('守住中央魂燈，妖兵會從兩側階梯衝上來', 4);
    } else {
      this.seg = { foeId: null };
      const p = LEVEL.bossStart, b = TUNING.boss;
      const boss = this._spawnUnit('boss', p.x, p.z, {
        hp: b.hp, ai: 'external', fixed: true, kind: 'boss', name: b.name, specialScale: b.specialScale, guard: b.guard, facing: Math.PI / 2,
        action: 'idle', range: 110, phase: 1, mode: 'intro', modeTime: 0, cooldown: 1, lift: 0,
      });
      this.seg.foeId = boss.id;
      this._emit('bossIntro', { enemyId: boss.id, name: b.name, x: boss.x, y: boss.y });
      this._say(`${b.name}現身！地上紅圈亮起就閃開`, 3);
    }
  }

  _openGate(index) {
    if (this.gates[index].open) return;
    this.gates[index].open = true;
    this._applyRegion();
    this._emit('gateOpen', { index, ...toPx(0, this.gates[index].z) });
    this._say(`結界破了，前往${LEVEL.segments[index + 1].name}`, 3);
  }

  _checkProgress() {
    const i = this.segmentIndex;
    if (i >= LEVEL.segments.length - 1 || !this.gates[i].open) return;
    const hero = toWorld(this.arena.hero.x, this.arena.hero.y);
    if (hero.z < this.gates[i].z - LEVEL.enterDepth) this._startSegment(i + 1);
  }

  _spawnUnit(role, wx, wz, options = {}) {
    const p = clampToRegion(this._region(), { x: wx, z: wz });
    const px = toPx(p.x, p.z);
    const enemy = this.arena.spawn(role, px.x, px.y, { segment: this.segmentIndex, ...options });
    this.units.set(enemy.id, enemy);
    if (this.stats.spawned[role] !== undefined) this.stats.spawned[role]++;
    return enemy;
  }

  _removeUnit(enemy, reason) {
    const index = this.arena.enemies.indexOf(enemy);
    if (index >= 0) this.arena.enemies.splice(index, 1);
    this.units.delete(enemy.id);
    this.hazards = this.hazards.filter(hazard => hazard.ownerId !== enemy.id);
    this._emit(reason, { enemyId: enemy.id, role: enemy.role, x: enemy.x, y: enemy.y });
  }

  _grunt(wx, wz, share, extra = {}) {
    const role = this._rand() < share ? 'runner' : 'grunt';
    const u = TUNING.units;
    const stats = role === 'runner' ? { hp: u.runnerHp, evade: u.runnerEvade, recover: u.recover.runner } : { hp: u.gruntHp, recover: u.recover.grunt };
    return this._spawnUnit(role, wx, wz, { kind: role, ...stats, ...extra });
  }

  _collectArenaEvents() {
    for (const event of this.arena.drainEvents()) {
      if (this.events.length >= MAX_EVENTS) this.events.shift();
      this.events.push(event);
      if (event.type === 'hit') {
        this.combo = this.time - this.lastHitAt <= TUNING.comboWindow ? this.combo + 1 : 1;
        this.lastHitAt = this.time;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const unit = this.units.get(event.enemyId);
        if (unit?.kind === 'raider' && unit.ai === 'external' && event.hp > 0) this._aggro(unit);
      } else if (event.type === 'hurt') {
        this.combo = 0;
      } else if (event.type === 'kill') {
        this._onKill(event);
      }
    }
  }

  _onKill(event) {
    const unit = this.units.get(event.enemyId);
    this.units.delete(event.enemyId);
    this.hazards = this.hazards.filter(hazard => hazard.ownerId !== event.enemyId);
    if (!unit) return;
    const seg = this.seg;
    if (unit.kind === 'breakable') {
      this.brokenProps.add(unit.breakIndex);
      this._emit('breakableBroken', { index: unit.breakIndex, breakType: unit.breakType, enemyId: unit.id, x: unit.x, y: unit.y });
      let roll = this._rand();
      for (const [kind, chance] of TUNING.breakables.tables[unit.breakType]) {
        if (roll < chance) { this._drop(kind, unit.x, unit.y); break; }
        roll -= chance;
      }
      return;
    }
    if (unit.kind === 'lantern') {
      seg.broken++;
      this._emit('lanternBroken', { index: unit.lanternIndex, enemyId: unit.id, x: unit.x, y: unit.y, broken: seg.broken });
      if (seg.broken === 3) seg.officerAt = this.time + 1.2;
    } else if (unit.kind === 'officer') {
      this._officerDown(unit);
      this._openGate(this.segmentIndex);
    } else if (unit.kind === 'boss') {
      this._emit('bossDown', { enemyId: unit.id, name: unit.name, x: unit.x, y: unit.y, slowMo: TUNING.killSlowMo, banner: `敵將 ${unit.name} 擊破！` });
      this._clear();
    } else if (this.segmentIndex === 0 && unit.segment === 0) {
      seg.kills++;
      if (seg.kills === 8 && seg.hints === 0) { seg.hints = 1; this._say('重擊：K（重）一刀掃開身邊的敵人', 5); }
      if (seg.kills === 16 && seg.hints === 1) { seg.hints = 2; this._say('閃避：Shift（閃）看到紅圈就閃開', 5); }
      if (seg.kills === 24 && seg.hints === 2) { seg.hints = 3; this._say('打破木箱、酒甕、木桶，裡面有護符、靈燈和魂晶', 5); }
      if (seg.kills >= TUNING.market.goal) {
        if (TUNING.officers.market) { if (seg.officerAt === null && !seg.foeId) seg.officerAt = this.time + 1; }
        else this._openGate(0);
      }
    }
  }

  _officerDown(unit) {
    const radius = TUNING.staggerRadius * PX_PER_M;
    let count = 0;
    for (const enemy of this.arena.enemies) {
      if (enemy.action === 'dead' || enemy.prop || enemy.kind === 'boss' || enemy.kind === 'officer') continue;
      if (Math.hypot(enemy.x - unit.x, enemy.y - unit.y) > radius) continue;
      if (enemy.ai === 'external') this._aggro(enemy);
      if (this.arena.stagger(enemy, TUNING.staggerSeconds)) count++;
    }
    this._emit('officerDown', { enemyId: unit.id, name: unit.name, x: unit.x, y: unit.y, slowMo: TUNING.killSlowMo, banner: `敵將 ${unit.name} 擊破！` });
    this._emit('stagger', { x: unit.x, y: unit.y, radius, duration: TUNING.staggerSeconds, count });
    this._drop('bun', unit.x, unit.y, { heal: TUNING.officerHeal });
  }

  /** Drops a pickup: kind 'bun' | 'bigBun' | 'wine' (see TUNING.drops). */
  _drop(kind, x, y, override = null) {
    const p = clampToRegion(this._region(), toWorld(x, y));
    const stats = override || TUNING.drops[kind];
    const drop = { id: this.nextPickupId++, kind, ...toPx(p.x, p.z), amount: stats.heal || 0, energy: stats.energy || 0, until: this.time + TUNING.pickupLife };
    this.pickups.push(drop);
    this._emit('drop', { pickupId: drop.id, kind, x: drop.x, y: drop.y, amount: drop.amount, energy: drop.energy });
    return drop;
  }

  _clear() {
    for (const enemy of [...this.arena.enemies]) if (enemy.action !== 'dead') this._removeUnit(enemy, 'flee');
    this.hazards = [];
    this.stats.segmentTimes.push(this.time);
    const hero = this.arena.hero;
    const rank = rankFor({ time: this.time, maxCombo: this.maxCombo, hp: hero.hp, maxHp: hero.maxHp });
    this.result = { ...rank, time: this.time, maxCombo: this.maxCombo, hp: hero.hp, maxHp: hero.maxHp, kills: this.arena.kills };
    this.state = 'clear';
    this.arena.win();
    this._collectArenaEvents();
    this._emit('clear', { ...this.result, x: hero.x, y: hero.y });
  }

  _aggro(enemy) {
    enemy.ai = null;
    enemy.kind = enemy.role;
    if (enemy.action !== 'hit') { enemy.action = 'chase'; enemy.actionTime = 0; }
    enemy.cooldown = Math.max(enemy.cooldown, 0.5);
  }

  /** Keeps hero and enemies inside the exact segment shapes and out of solid props. */
  _constrain() {
    const region = this._region();
    const solids = [];
    if (region.some(s => s.id === 'plaza')) solids.push(LEVEL.fountain);
    if (region.some(s => s.id === 'stairs')) solids.push(LEVEL.lamp);
    const fix = body => {
      let p = clampToRegion(region, toWorld(body.x, body.y));
      for (const solid of solids) {
        const dx = p.x - solid.x, dz = p.z - solid.z, d = Math.hypot(dx, dz) || 0.001, min = solid.r + 0.35;
        // Push out and slide a little along the rim so nobody gets stuck walking straight into it.
        if (d < min) p = { x: solid.x + dx / d * min - dz / d * 0.05, z: solid.z + dz / d * min + dx / d * 0.05 };
      }
      const px = toPx(p.x, p.z);
      body.x = px.x;
      body.y = px.y;
    };
    fix(this.arena.hero);
    for (const enemy of this.arena.enemies) if (!enemy.prop && enemy.action !== 'dead') fix(enemy);
  }

  _tickPickups() {
    const hero = this.arena.hero;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      if (this.time >= pickup.until) {
        this.pickups.splice(i, 1);
        this._emit('pickupLost', { pickupId: pickup.id, kind: pickup.kind, x: pickup.x, y: pickup.y });
        continue;
      }
      if (Math.hypot(pickup.x - hero.x, pickup.y - hero.y) > 80) continue;
      const amount = Math.min(pickup.amount, hero.maxHp - hero.hp);
      const energy = Math.min(pickup.energy, 100 - hero.energy);
      hero.hp += amount;
      hero.energy += energy;
      this.pickups.splice(i, 1);
      this._emit('pickup', { pickupId: pickup.id, kind: pickup.kind, x: pickup.x, y: pickup.y, amount, energy });
      if (amount > 0) this._emit('heal', { x: hero.x, y: hero.y, amount });
    }
  }

  // ---- Segment logic ----------------------------------------------------------

  _tickSegment(dt) {
    const i = this.segmentIndex, seg = this.seg;
    const heroW = toWorld(this.arena.hero.x, this.arena.hero.y);
    if (i === 0 && !this.gates[0].open) {
      const t = TUNING.market, segment = LEVEL.segments[0];
      if (seg.officerAt !== null && this.time >= seg.officerAt) {
        seg.officerAt = null;
        this._spawnOfficer('market', LAYOUT.spawns.officers.market);
      }
      const alive = this.arena.enemies.filter(enemy => enemy.segment === 0 && enemy.action !== 'dead').length;
      if (alive <= 2 && seg.nextGroupAt - this.time > 1.5 && seg.spawned > 0) seg.nextGroupAt = this.time + 1.5;
      if (seg.spawned < t.goal && this.time >= seg.nextGroupAt) {
        const want = t.groupMin + Math.floor(this._rand() * (t.groupMax - t.groupMin + 1));
        const size = Math.min(want, t.goal - seg.spawned, this.room());
        if (size > 0) {
          // Out from behind the stalls, ahead of the hero.
          const side = this._rand() < 0.5 ? -1 : 1;
          const anchor = Math.max(segment.minZ + 1.5, Math.min(segment.maxZ - 1.5, heroW.z - 5 - this._rand() * 6));
          for (let k = 0; k < size; k++) this._grunt(side * 6.6, anchor + (k - (size - 1) / 2) * 1.3, t.runnerShare);
          seg.spawned += size;
          this._emit('group', { size, side, ...toPx(side * 6.6, anchor) });
          seg.nextGroupAt = this.time + t.groupEvery;
        } else seg.nextGroupAt = this.time + 1;
      }
    } else if (i === 1) {
      const t = TUNING.plaza;
      seg.lanternIds.forEach((id, index) => {
        const lantern = this.units.get(id);
        if (!lantern || lantern.hp <= 0 || this.time < seg.nextSpawnAt[index]) return;
        const size = Math.min(t.groupSize, this.room());
        if (size <= 0) { seg.nextSpawnAt[index] = this.time + 1; return; }
        const at = LEVEL.lanterns[index];
        const toCenter = Math.atan2(LEVEL.fountain.z - at.z, LEVEL.fountain.x - at.x);
        for (let k = 0; k < size; k++) {
          const angle = toCenter + (k - (size - 1) / 2) * 0.7;
          this._grunt(at.x + Math.cos(angle) * 1.8, at.z + Math.sin(angle) * 1.8, t.runnerShare);
        }
        this._emit('lanternSpawn', { index, enemyId: id, size, x: lantern.x, y: lantern.y });
        seg.nextSpawnAt[index] = this.time + t.groupEvery;
      });
      if (seg.officerAt !== null && this.time >= seg.officerAt) {
        seg.officerAt = null;
        this._spawnOfficer('red', LAYOUT.spawns.officers.red);
      }
    } else if (i === 2) {
      this._tickLamp(dt, seg);
    }
  }

  _tickLamp(dt, seg) {
    const t = TUNING.stairs;
    if (!seg.secured) {
      if (seg.lamp.down > 0) {
        seg.lamp.down = Math.max(0, seg.lamp.down - dt);
        if (seg.lamp.down === 0) this._emit('lampRestored', { ...toPx(LEVEL.lamp.x, LEVEL.lamp.z) });
      } else {
        seg.timer = Math.max(0, seg.timer - dt);
        if (seg.timer === 0) {
          seg.secured = true;
          seg.officerAt = this.time + 1;
          for (const enemy of this.arena.enemies) if (enemy.kind === 'raider' && enemy.ai === 'external') this._aggro(enemy);
          this._emit('lampSecured', { ...toPx(LEVEL.lamp.x, LEVEL.lamp.z) });
          this._say('魂燈守住了！', 2.5);
        }
      }
      if (!seg.secured && this.time >= seg.nextWaveAt) {
        const room = this.room();
        if (room > 0) {
          // Split the budget across both stairs, starting with the side that went short last time.
          const sides = seg.side === 'left' ? ['left', 'right'] : ['right', 'left'];
          let budget = Math.min(room, t.perSide * 2);
          for (const side of sides) {
            const size = Math.min(t.perSide, budget);
            budget -= size;
            const entries = LEVEL.stairEntries[side];
            for (let k = 0; k < size; k++) {
              const at = entries[k % entries.length];
              const raider = k < t.raidersPerSide;
              this._grunt(at.x, at.z, t.runnerShare, raider ? { kind: 'raider', ai: 'external', action: 'chase', cooldown: 0.4 } : {});
            }
            if (size > 0) this._emit('group', { size, side: side === 'left' ? -1 : 1, ...toPx(entries[0].x, entries[0].z) });
          }
          seg.side = sides[1];
          seg.nextWaveAt = this.time + t.waveEvery;
        } else seg.nextWaveAt = this.time + 1;
      }
      if (!seg.secured && t.topGroupSize > 0 && this.time >= seg.nextTopAt) {
        const size = Math.min(t.topGroupSize, this.room());
        const spots = LAYOUT.spawns.stairsTop;
        for (let k = 0; k < size; k++) this._grunt(spots[k % spots.length].x + (k >= spots.length ? 1.2 : 0), spots[k % spots.length].z, t.runnerShare);
        if (size > 0) this._emit('group', { size, side: 0, ...toPx(0, spots[0].z) });
        seg.nextTopAt = this.time + (size > 0 ? t.topGroupEvery : 1);
      }
    }
    if (seg.officerAt !== null && this.time >= seg.officerAt) {
      seg.officerAt = null;
      const o = TUNING.officers.shadow;
      const unit = this._spawnUnit('officer', 0, -79, { kind: 'officer', name: o.name, hp: o.hp, ai: 'external', fixed: true, specialScale: o.specialScale, guard: o.guard, guardRearm: o.guardRearm, variant: 'shadow', action: 'chase', mode: 'chase', modeTime: 0, cooldown: 1.2, range: 80 });
      seg.foeId = unit.id;
      this._emit('officer', { enemyId: unit.id, name: o.name, variant: 'shadow', x: unit.x, y: unit.y });
      this._say(`敵將「${o.name}」現身！小心連續突刺`, 3);
    }
  }

  /** Arena-driven officer (赤角 style): guard, slow turn, heavier hits. */
  _spawnOfficer(variant, at) {
    const o = TUNING.officers[variant];
    const unit = this._spawnUnit('officer', at.x, at.z, { kind: 'officer', name: o.name, hp: o.hp, speed: o.speed, range: o.range, damage: o.damage, telegraphTime: o.telegraphTime, recover: o.recover, specialScale: o.specialScale, cooldown: o.cooldown, guard: o.guard, guardRearm: o.guardRearm, turnRate: o.turnRate, facing: Math.PI / 2, variant });
    this.seg.foeId = unit.id;
    this._emit('officer', { enemyId: unit.id, name: o.name, variant, x: unit.x, y: unit.y });
    this._say(`敵將「${o.name}」現身！正面會擋，用重擊破防或繞到背後`, 3.5);
    return unit;
  }

  _damageLamp(amount, enemy) {
    const seg = this.seg;
    if (this.segmentIndex !== 2 || seg.secured || seg.lamp.down > 0) return;
    seg.lamp.hp = Math.max(0, seg.lamp.hp - amount);
    const at = toPx(LEVEL.lamp.x, LEVEL.lamp.z);
    this._emit('lampHit', { ...at, hp: seg.lamp.hp, maxHp: seg.lamp.maxHp, enemyId: enemy.id });
    if (seg.lamp.hp > 0) return;
    seg.breaks++;
    seg.lamp.hp = seg.lamp.maxHp;
    seg.lamp.down = TUNING.stairs.relight;
    seg.timer = TUNING.stairs.holdSeconds;
    this._emit('lampBroken', { ...at, breaks: seg.breaks });
    this._say('魂燈被打爆了，計時重來！', 2.5);
  }

  // ---- Scripted AI (ai: 'external') -----------------------------------------------

  _tickExternal(dt) {
    for (const enemy of this.arena.enemies) {
      if (enemy.ai !== 'external' || enemy.action === 'dead') continue;
      enemy.actionTime += dt;
      enemy.cooldown = Math.max(0, (enemy.cooldown || 0) - dt);
      if (this._guardBroken(enemy)) continue;
      if (enemy.kind === 'raider') this._raider(enemy, dt);
      else if (enemy.kind === 'officer') this._lunger(enemy, dt);
      else if (enemy.kind === 'boss') this._boss(enemy, dt);
    }
  }

  /** Guard break or musou stun (Arena sets guardBrokenUntil / stunUntil): cancel the scripted move and stand stunned. */
  _guardBroken(enemy) {
    const broken = (enemy.guardBrokenUntil ?? -Infinity) > this.arena.time || (enemy.stunUntil ?? -Infinity) > this.arena.time;
    if (broken && enemy.mode !== 'broken') {
      enemy.mode = 'broken';
      enemy.modeTime = 0;
      enemy.move = null;
      enemy.lift = 0;
      enemy.intangible = false;
      enemy.telegraph = 0;
      this._setAction(enemy, 'hit');
      this.hazards = this.hazards.filter(hazard => hazard.ownerId !== enemy.id);
    } else if (!broken && enemy.mode === 'broken') {
      enemy.mode = 'chase';
      enemy.modeTime = 0;
      enemy.cooldown = Math.max(enemy.cooldown, 0.6);
      this._setAction(enemy, 'chase');
    }
    return broken;
  }

  _moveToward(enemy, x, y, speed, dt, stop = 0) {
    const dx = x - enemy.x, dy = y - enemy.y, d = Math.hypot(dx, dy) || 1;
    enemy.facing = Math.atan2(dy, dx);
    if (d <= stop) return d;
    const step = Math.min(d - stop, speed * dt);
    enemy.x += dx / d * step;
    enemy.y += dy / d * step;
    return d - step;
  }

  _setAction(enemy, action) {
    enemy.action = action;
    enemy.actionTime = 0;
  }

  _raider(enemy, dt) {
    const hero = this.arena.hero;
    if (Math.hypot(hero.x - enemy.x, hero.y - enemy.y) < TUNING.stairs.raiderAggro) { this._aggro(enemy); return; }
    const lamp = toPx(LEVEL.lamp.x, LEVEL.lamp.z);
    if (enemy.action === 'telegraph') {
      enemy.telegraph = Math.max(0, enemy.telegraph - dt);
      if (enemy.telegraph === 0) {
        this._setAction(enemy, 'attack');
        this._emit('enemyAttack', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, role: enemy.role, target: 'lamp' });
        this._damageLamp(enemy.role === 'runner' ? 3 : 4, enemy);
      }
    } else if (enemy.action === 'attack') {
      if (enemy.actionTime >= 0.3) { this._setAction(enemy, 'chase'); enemy.cooldown = 1.4; }
    } else {
      const speed = enemy.role === 'runner' ? TUNING.stairs.raiderSpeed[1] : TUNING.stairs.raiderSpeed[0];
      const d = this._moveToward(enemy, lamp.x, lamp.y, speed, dt, 85);
      if (d <= 90 && enemy.cooldown <= 0 && !(this.seg.lamp.down > 0)) {
        this._setAction(enemy, 'telegraph');
        enemy.telegraph = 0.6;
        this._emit('telegraph', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, duration: 0.6, role: enemy.role, target: 'lamp' });
      }
    }
  }

  _hazard(values) {
    const hazard = { id: this.nextHazardId++, start: this.time, ...values };
    this.hazards.push(hazard);
    this._emit('groundTelegraph', { ...hazard, duration: hazard.until - hazard.start });
    return hazard;
  }

  /** 影爪: fast chase, then a volley of telegraphed straight lunges, then a punishable recovery. */
  _lunger(enemy, dt) {
    const o = TUNING.officers.shadow, hero = this.arena.hero;
    const aim = first => {
      enemy.facing = Math.atan2(hero.y - enemy.y, hero.x - enemy.x);
      enemy.mode = 'aim';
      this._setAction(enemy, 'telegraph');
      enemy.telegraph = first ? 0.55 : 0.38;
      enemy.lungeFrom = { x: enemy.x, y: enemy.y };
      this._emit('telegraph', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, duration: enemy.telegraph, role: enemy.role });
      this._hazard({ shape: 'line', x: enemy.x, y: enemy.y, facing: enemy.facing, length: o.lungeLength * PX_PER_M, width: o.lungeWidth * PX_PER_M, until: this.time + enemy.telegraph, ownerId: enemy.id, attack: 'lunge' });
    };
    if (enemy.mode === 'chase') {
      const d = this._moveToward(enemy, hero.x, hero.y, o.speed, dt, 150);
      if (d <= 300 && enemy.cooldown <= 0) { enemy.lunges = 0; aim(true); }
    } else if (enemy.mode === 'aim') {
      enemy.telegraph = Math.max(0, enemy.telegraph - dt);
      if (enemy.telegraph === 0) {
        enemy.mode = 'lunge';
        enemy.hitDone = false;
        this._setAction(enemy, 'attack');
        this._emit('enemyAttack', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, role: enemy.role, move: 'lunge' });
      }
    } else if (enemy.mode === 'lunge') {
      const speed = o.lungeLength * PX_PER_M / o.lungeTime;
      enemy.x += Math.cos(enemy.facing) * speed * dt;
      enemy.y += Math.sin(enemy.facing) * speed * dt;
      const w = clampToRegion(this._region(), toWorld(enemy.x, enemy.y));
      const p = toPx(w.x, w.z);
      enemy.x = p.x; enemy.y = p.y;
      if (!enemy.hitDone && Math.hypot(hero.x - enemy.x, hero.y - enemy.y) < o.lungeWidth * PX_PER_M * 0.6) {
        enemy.hitDone = true;
        this.arena.hurtHero(o.damage, enemy);
      }
      if (enemy.actionTime >= o.lungeTime) {
        enemy.lunges++;
        if (enemy.lunges < o.lunges) aim(false);
        else { enemy.mode = 'recover'; this._setAction(enemy, 'idle'); }
      }
    } else if (enemy.mode === 'recover') {
      if (enemy.actionTime >= 1.6) { enemy.mode = 'chase'; this._setAction(enemy, 'chase'); enemy.cooldown = 0.8; }
    }
  }

  _summon(enemy, count) {
    const size = Math.min(count, this.room());
    const center = toWorld(enemy.x, enemy.y);
    const radius = LAYOUT.spawns.bossSummonRadius;
    for (let k = 0; k < size; k++) {
      const angle = k / size * Math.PI * 2;
      this._spawnUnit('grunt', center.x + Math.cos(angle) * radius, center.z + Math.sin(angle) * radius, { kind: 'grunt', hp: TUNING.units.gruntHp, recover: TUNING.units.recover.grunt, cooldown: 1 + k * 0.1 });
    }
    this._emit('summon', { enemyId: enemy.id, count: size, x: enemy.x, y: enemy.y });
  }

  /** 魂門守將: jump slam + sweep with ground telegraphs; at half hp roar, summon, double slam. */
  _boss(enemy, dt) {
    const b = TUNING.boss, hero = this.arena.hero;
    const phase2 = enemy.phase === 2;
    enemy.modeTime += dt;
    const setMode = (mode, action) => { enemy.mode = mode; enemy.modeTime = 0; this._setAction(enemy, action); };
    const safe = enemy.mode === 'chase' || enemy.mode === 'recover';
    if (enemy.phase === 1 && enemy.hp <= enemy.maxHp / 2 && safe) {
      enemy.phase = 2;
      setMode('roar', 'idle');
      enemy.move = 'roar';
      this._emit('bossPhase', { enemyId: enemy.id, phase: 2, x: enemy.x, y: enemy.y });
      this._emit('roar', { enemyId: enemy.id, x: enemy.x, y: enemy.y, duration: 1.6 });
      this._say('守將怒吼！跳砸變成連跳兩次', 3);
      // Shove the hero out of melee range.
      const dx = hero.x - enemy.x, dy = hero.y - enemy.y, d = Math.hypot(dx, dy) || 1;
      if (d < 4 * PX_PER_M) { hero.x += dx / d * 1.5 * PX_PER_M; hero.y += dy / d * 1.5 * PX_PER_M; }
      this._summon(enemy, b.summon);
      enemy.resummonAt = this.time + b.resummon.every;
      return;
    }
    const slamRadius = b.slamRadius[phase2 ? 1 : 0] * PX_PER_M;
    const startSlam = (telegraph, remaining) => {
      const target = clampToRegion(this._region(), toWorld(hero.x, hero.y));
      const at = toPx(target.x, target.z);
      enemy.slam = { fromX: enemy.x, fromY: enemy.y, toX: at.x, toY: at.y, telegraph, remaining };
      setMode('slam', 'telegraph');
      enemy.move = 'jump';
      enemy.telegraph = telegraph;
      enemy.facing = Math.atan2(at.y - enemy.y, at.x - enemy.x);
      this._emit('telegraph', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, duration: telegraph, role: enemy.role });
      this._hazard({ shape: 'circle', x: at.x, y: at.y, radius: slamRadius, until: this.time + telegraph, ownerId: enemy.id, attack: 'slam' });
      this._emit('bossJump', { enemyId: enemy.id, fromX: enemy.x, fromY: enemy.y, toX: at.x, toY: at.y, x: at.x, y: at.y, duration: telegraph });
    };
    const startSweep = telegraph => {
      setMode('sweep', 'telegraph');
      enemy.move = 'sweep';
      enemy.telegraph = telegraph;
      this._emit('telegraph', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, duration: telegraph, role: enemy.role });
      this._hazard({ shape: 'circle', x: enemy.x, y: enemy.y, radius: b.sweepRadius * PX_PER_M, until: this.time + telegraph, ownerId: enemy.id, attack: 'sweep' });
    };
    if (phase2 && b.resummon && this.time >= enemy.resummonAt) {
      enemy.resummonAt = this.time + b.resummon.every;
      this._summon(enemy, b.resummon.count);
    }
    if (enemy.mode === 'intro') {
      enemy.facing = Math.atan2(hero.y - enemy.y, hero.x - enemy.x);
      if (enemy.modeTime >= 2) setMode('chase', 'chase');
    } else if (enemy.mode === 'roar') {
      if (enemy.modeTime >= 1.6) { enemy.move = null; setMode('chase', 'chase'); enemy.cooldown = 0.4; }
    } else if (enemy.mode === 'chase') {
      const facing = enemy.facing;
      const d = this._moveToward(enemy, hero.x, hero.y, b.speed, dt, 100);
      // Turns slowly so the hero can circle behind the guard.
      const turn = Math.atan2(Math.sin(enemy.facing - facing), Math.cos(enemy.facing - facing));
      enemy.facing = facing + Math.max(-b.turnRate * dt, Math.min(b.turnRate * dt, turn));
      if (enemy.cooldown <= 0) {
        // Close: mostly sweep, sometimes jump straight onto the hero; far: always slam.
        if (d < 3.4 * PX_PER_M && this._rand() < b.sweepShare) {
          startSweep(phase2 ? 0.8 : 0.95);
        } else if (d < 13 * PX_PER_M) {
          startSlam(phase2 ? 0.95 : 1.1, phase2 ? 1 : 0);
        }
      }
    } else if (enemy.mode === 'sweep') {
      if (enemy.action === 'telegraph') {
        enemy.telegraph = Math.max(0, enemy.telegraph - dt);
        if (enemy.telegraph === 0) {
          this._setAction(enemy, 'attack');
          this._emit('enemyAttack', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, role: enemy.role, move: 'sweep' });
          this._emit('bossSweep', { enemyId: enemy.id, x: enemy.x, y: enemy.y, radius: b.sweepRadius * PX_PER_M });
          if (Math.hypot(hero.x - enemy.x, hero.y - enemy.y) <= b.sweepRadius * PX_PER_M) this.arena.hurtHero(b.sweepDamage, { id: enemy.id, role: enemy.role, facing: enemy.facing, ground: true });
        }
      } else if (enemy.actionTime >= 0.35) {
        enemy.move = null;
        setMode('recover', 'idle');
      }
    } else if (enemy.mode === 'slam') {
      const s = enemy.slam;
      const t = Math.min(1, enemy.modeTime / s.telegraph);
      // Crouch for the first 30 %, then fly along an arc and land exactly when the telegraph ends.
      const air = Math.max(0, (t - 0.3) / 0.7);
      if (air > 0 && enemy.action === 'telegraph') this._setAction(enemy, 'attack');
      enemy.x = s.fromX + (s.toX - s.fromX) * air;
      enemy.y = s.fromY + (s.toY - s.fromY) * air;
      enemy.lift = Math.sin(Math.PI * air) * (phase2 ? 3.6 : 3);
      enemy.intangible = air > 0.05;
      enemy.telegraph = Math.max(0, s.telegraph - enemy.modeTime);
      if (t >= 1) {
        enemy.lift = 0;
        enemy.intangible = false;
        this._emit('bossSlam', { enemyId: enemy.id, x: s.toX, y: s.toY, radius: slamRadius });
        if (Math.hypot(hero.x - s.toX, hero.y - s.toY) <= slamRadius) this.arena.hurtHero(b.slamDamage, { id: enemy.id, role: enemy.role, facing: enemy.facing, ground: true });
        if (s.remaining > 0) startSlam(0.75, s.remaining - 1);
        // Phase 2: the double slam ends with a sweep around the landing spot.
        else if (phase2 && b.followUpSweep) startSweep(b.followUpSweep);
        else { enemy.move = null; setMode('recover', 'idle'); }
      }
    } else if (enemy.mode === 'recover') {
      if (enemy.modeTime >= (phase2 ? 1.1 : 1.4)) { setMode('chase', 'chase'); enemy.cooldown = phase2 ? 0.5 : 0.8; }
    }
  }
}
