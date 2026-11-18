import { rayCapsule } from '../flight.mjs';
import { ARENA } from './arena-layout.mjs';

export const STEP = 1 / 30;
export const LIMITS = Object.freeze({
  hp: 9000, energy: 100, magazine: 40, reload: 2, missileCooldown: 7,
  shieldCapacity: 1500, shieldDuration: 2.5, shieldCooldown: 9,
  roundSeconds: 120, relaySeconds: 30, captureSeconds: 4,
  countdownSeconds: 3, intermissionSeconds: 3, rounds: 3, wins: 2,
});
const RADIUS = 4.2;
const HEIGHT = 17.4;
const AIM_HEIGHT = 11;
const RIFLE_INTERVAL = 0.27;
const RIFLE_RANGE = 520;
const MISSILE_SPEED = 144;
const MISSILE_RANGE = 390;
const MISSILE_LOCK = 0.55;
const GROUND_WALK = 16;
const GROUND_BOOST = 46;
const AIR_CRUISE = 28;
const AIR_BOOST = 74;
const ANGLE_LIMIT = 1.38;
const EPSILON = 1e-5;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const axis = v => Number.isFinite(v) ? clamp(v, -1, 1) : 0;
const rounded = v => Math.round(v * 100) / 100;
const roundedAngle = v => Math.round(v * 10000) / 10000;
const posArray = p => [rounded(p.x), rounded(p.y), rounded(p.z)];
const ticks = seconds => Math.round(seconds / STEP);
const { bounds } = ARENA;
const coverBoxes = ARENA.cover.map(({x, z, width, depth, height}) => ({
  x0: x - width / 2, x1: x + width / 2, z0: z - depth / 2, z1: z + depth / 2, height,
}));

export function sanitizeInput(raw) {
  return {
    mx: axis(raw?.mx), mz: axis(raw?.mz),
    yaw: Number.isFinite(raw?.yaw) ? wrapAngle(raw.yaw) : null,
    pitch: Number.isFinite(raw?.pitch) ? clamp(raw.pitch, -ANGLE_LIMIT, ANGLE_LIMIT) : null,
    ascend: raw?.ascend === true, descend: raw?.descend === true,
    boost: raw?.boost === true, fire: raw?.fire === true,
    missile: raw?.missile === true, missileCancel: raw?.missileCancel === true,
    ...(raw?.shield === true ? { shield: true } : {}),
  };
}

function createPilot(slot) {
  const { x, z, yaw } = ARENA.spawn[slot];
  return {
    x, y: 0, z, yaw, pitch: 0, vx: 0, vy: 0, vz: 0, hp: LIMITS.hp, en: LIMITS.energy,
    ammo: LIMITS.magazine, reload: 0, rifleCooldown: 0, missileCooldown: 0, lock: 0,
    shieldHp: 0, shieldUntil: 0, shieldReadyAt: 0,
    flying: false, boosting: false, missileHeld: false, overheat: false, recoveryWait: 0,
  };
}

function coversPoint(x, z, b) {
  return x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS;
}

function blocked(x, y, z) {
  return coverBoxes.some(b => y < b.height - EPSILON && coversPoint(x, z, b));
}

function floorBelow(x, y, z) {
  let floor = 0;
  for (const b of coverBoxes) if (y >= b.height - EPSILON && b.height > floor && coversPoint(x, z, b)) floor = b.height;
  return floor;
}

// Same fixed-step movement runs on the server and under local input prediction.
export function advancePilot(p, raw, dt = STEP) {
  const input = sanitizeInput(raw);
  p.yaw = input.yaw ?? p.yaw;
  p.pitch = input.pitch ?? p.pitch;
  if (p.hp <= 0) return;
  p.recoveryWait = Math.max(0, (p.recoveryWait || 0) - dt);
  if (p.overheat && p.en >= 18) p.overheat = false;
  const floor = floorBelow(p.x, p.y, p.z);
  const grounded = p.y <= floor + EPSILON;
  const climbing = input.ascend && !input.descend && !p.overheat && p.en > 0;
  if (climbing) p.flying = true;
  if (p.overheat) p.flying = false;
  p.boosting = input.boost && !p.overheat && p.en > 0;
  const size = Math.hypot(input.mx, input.mz);
  const scale = Math.min(1, 1 / (size || 1));
  const dirX = Math.sin(p.yaw), dirZ = Math.cos(p.yaw);
  const forward = size < .01 && p.boosting ? 1 : input.mz * scale;
  const strafe = input.mx * scale;
  const maxSpeed = p.flying ? (p.boosting ? AIR_BOOST : AIR_CRUISE) : (p.boosting ? GROUND_BOOST : GROUND_WALK);
  const targetX = (forward * dirX - strafe * dirZ) * maxSpeed;
  const targetZ = (forward * dirZ + strafe * dirX) * maxSpeed;
  const rate = p.flying ? 5 : p.boosting ? 3.2 : 6;
  const follow = 1 - Math.exp(-rate * dt);
  p.vx += (targetX - p.vx) * follow;
  p.vz += (targetZ - p.vz) * follow;

  const rising = climbing && p.y < bounds.ceiling - EPSILON;
  const drain = (p.boosting ? (p.flying ? 18 : 12) : 0) + (p.flying ? 5 + 4 * Math.min(size, 1) + (rising ? 6 : 0) : 0);
  if (drain > 0) {
    p.en = Math.max(0, p.en - drain * dt);
    p.recoveryWait = .55;
    if (p.en <= EPSILON) {
      p.en = 0;
      p.flying = false;
      p.boosting = false;
      p.overheat = true;
    }
  } else if (grounded && p.recoveryWait === 0) {
    p.en = Math.min(LIMITS.energy, p.en + 31 * dt);
  }
  if (p.flying) p.vy = rising ? 24 : input.descend ? -22 : 0;
  else p.vy = grounded ? 0 : Math.max(-44, p.vy - 32 * dt);

  const towardY = Math.min(bounds.ceiling, p.y + p.vy * dt);
  // Check lateral cover at the new height on ascent and old height on descent.
  const slideY = Math.max(p.y, towardY);
  const x = clamp(p.x + p.vx * dt, bounds.minX + RADIUS, bounds.maxX - RADIUS);
  const z = clamp(p.z + p.vz * dt, bounds.minZ + RADIUS, bounds.maxZ - RADIUS);
  if (blocked(x, slideY, p.z) || x === p.x) p.vx = 0; else p.x = x;
  if (blocked(p.x, slideY, z) || z === p.z) p.vz = 0; else p.z = z;
  const landing = floorBelow(p.x, slideY, p.z);
  p.y = Math.max(landing, towardY);
  if (p.y <= landing + EPSILON && p.vy <= 0) { p.vy = 0; p.flying = false; }
  if (p.y >= bounds.ceiling && p.vy > 0) p.vy = 0;
}

export function pilotAim(pilot) {
  const cp = Math.cos(pilot.pitch);
  return {
    from: { x: pilot.x, y: pilot.y + AIM_HEIGHT, z: pilot.z },
    dir: { x: Math.sin(pilot.yaw) * cp, y: Math.sin(pilot.pitch), z: Math.cos(pilot.yaw) * cp },
  };
}

function segmentBox(o, d, maxT, b) {
  let enter = 0, exit = maxT;
  for (const [a, lower, upper] of [['x', b.x0, b.x1], ['y', 0, b.height], ['z', b.z0, b.z1]]) {
    if (Math.abs(d[a]) < EPSILON) {
      if (o[a] < lower || o[a] > upper) return maxT;
      continue;
    }
    const near = (lower - o[a]) / d[a], far = (upper - o[a]) / d[a];
    enter = Math.max(enter, Math.min(near, far));
    exit = Math.min(exit, Math.max(near, far));
    if (enter > exit) return maxT;
  }
  return enter;
}

function obstacleDistance(origin, dir, range) {
  let stop = dir.y < -EPSILON ? Math.min(range, Math.max(0, -origin.y / dir.y)) : range;
  for (const b of coverBoxes) stop = Math.min(stop, segmentBox(origin, dir, stop, b));
  return stop;
}

function hitDistance(origin, dir, target, maxT) {
  return rayCapsule(origin, dir, {
    x: target.x, z: target.z, y0: target.y + RADIUS, y1: target.y + HEIGHT - RADIUS, r: RADIUS,
  }, maxT);
}

function rifleImpact(from, dir, target) {
  const stop = obstacleDistance(from, dir, RIFLE_RANGE);
  const hit = target ? hitDistance(from, dir, target, stop) : -1;
  const struck = hit >= 0 && hit < stop;
  return { distance: struck ? hit : stop, struck };
}

function pointAt(o, d, distance) {
  return { x: o.x + d.x * distance, y: o.y + d.y * distance, z: o.z + d.z * distance };
}

export function aimTarget(pilot, target) {
  const { from, dir } = pilotAim(pilot);
  return pointAt(from, dir, rifleImpact(from, dir, target).distance);
}

function heading(o, target) {
  const x = target.x - o.x, y = target.y + AIM_HEIGHT - o.y, z = target.z - o.z;
  const distance = Math.hypot(x, y, z);
  return { dir: { x: x / (distance || 1), y: y / (distance || 1), z: z / (distance || 1) }, distance };
}

function event(match, type, fields) {
  match.events.push({ id: match.nextId++, tick: match.tick, type, ...fields });
}

function closeShield(pilot, tick) {
  pilot.shieldHp = 0;
  pilot.shieldReadyAt = tick + ticks(LIMITS.shieldCooldown);
}

function stepShield(pilot, tick, activate) {
  if (pilot.shieldHp > 0 && tick >= pilot.shieldUntil) closeShield(pilot, tick);
  if (!activate || pilot.hp <= 0 || pilot.shieldHp > 0 || tick < pilot.shieldReadyAt) return;
  pilot.shieldHp = LIMITS.shieldCapacity;
  pilot.shieldUntil = tick + ticks(LIMITS.shieldDuration);
}

function absorbDamage(match, slot, amount, damage) {
  const pilot = match.players[slot];
  const absorbed = match.shieldEnabled ? Math.min(amount, pilot.shieldHp) : 0;
  if (absorbed > 0) {
    pilot.shieldHp -= absorbed;
    if (pilot.shieldHp === 0) closeShield(pilot, match.tick);
  }
  damage[slot] += amount - absorbed;
  return absorbed;
}

function weapons(match, slot, input, damage) {
  const p = match.players[slot], target = match.players[1 - slot];
  p.rifleCooldown = Math.max(0, p.rifleCooldown - STEP);
  p.missileCooldown = Math.max(0, p.missileCooldown - STEP);
  if (p.reload > 0) {
    p.reload = Math.max(0, p.reload - STEP);
    if (p.reload < EPSILON) { p.reload = 0; p.ammo = LIMITS.magazine; }
  }
  if (input.missileCancel) { p.missileHeld = false; p.lock = 0; }
  const release = p.missileHeld && !input.missile;
  p.missileHeld = input.missile && !input.missileCancel;
  if (p.rifleCooldown > EPSILON && !p.missileHeld && !release) return;
  if (!input.fire && !p.missileHeld && !release) return;

  const { from, dir } = pilotAim(p);
  if (input.fire && p.ammo > 0 && p.rifleCooldown <= EPSILON) {
    p.ammo--;
    p.rifleCooldown = RIFLE_INTERVAL;
    if (p.ammo === 0) p.reload = LIMITS.reload;
    const { distance, struck } = rifleImpact(from, dir, target);
    const absorbed = struck ? absorbDamage(match, 1 - slot, Math.round(430 * clamp(1 - (distance - 200) / 700, .55, 1)), damage) : 0;
    event(match, 'rifle', { owner: slot, from: posArray(from), to: posArray(pointAt(from, dir, distance)), hit: struck ? 1 - slot : null,
      ...(absorbed > 0 ? { absorbed } : {}) });
  }
  if (p.missileCooldown > EPSILON || (!p.missileHeld && !release)) return;
  const course = heading(from, target);
  const aim = course.dir;
  const visible = course.distance <= MISSILE_RANGE && aim.x * dir.x + aim.y * dir.y + aim.z * dir.z > .965
    && obstacleDistance(from, aim, course.distance) >= course.distance - EPSILON;
  if (p.missileHeld) {
    p.lock = visible ? Math.min(1, p.lock + STEP / MISSILE_LOCK) : 0;
  } else {
    if (p.lock >= 1 && visible) {
      const direction = { x: aim.x * .85 + dir.x * .15, y: aim.y * .85 + dir.y * .15, z: aim.z * .85 + dir.z * .15 };
      match.projectiles.push({ id: match.nextId++, owner: slot, ...from,
        vx: direction.x * MISSILE_SPEED, vy: direction.y * MISSILE_SPEED, vz: direction.z * MISSILE_SPEED, life: 3.5 });
      p.missileCooldown = LIMITS.missileCooldown;
      event(match, 'launch', { owner: slot, from: posArray(from) });
    }
    p.lock = 0;
  }
}

function moveMissiles(match, damage) {
  for (let i = match.projectiles.length - 1; i >= 0; i--) {
    const missile = match.projectiles[i], slot = 1 - missile.owner, target = match.players[slot];
    const aim = heading(missile, target).dir;
    const response = 1 - Math.exp(-3.5 * STEP);
    const x = missile.vx + (aim.x * MISSILE_SPEED - missile.vx) * response;
    const y = missile.vy + (aim.y * MISSILE_SPEED - missile.vy) * response;
    const z = missile.vz + (aim.z * MISSILE_SPEED - missile.vz) * response;
    const speed = Math.hypot(x, y, z) || MISSILE_SPEED;
    const dir = { x: x / speed, y: y / speed, z: z / speed }, distance = MISSILE_SPEED * STEP;
    const stop = obstacleDistance(missile, dir, distance);
    const hit = hitDistance(missile, dir, target, stop);
    const struck = hit >= 0 && (hit < stop || stop === distance);
    Object.assign(missile, pointAt(missile, dir, struck ? hit : stop), {
      vx: dir.x * MISSILE_SPEED, vy: dir.y * MISSILE_SPEED, vz: dir.z * MISSILE_SPEED, life: missile.life - STEP,
    });
    if (struck || stop < distance || missile.life <= 0) {
      const absorbed = struck ? absorbDamage(match, slot, 1750, damage) : 0;
      event(match, 'impact', { owner: missile.owner, at: posArray(missile), hit: struck ? slot : null,
        ...(absorbed > 0 ? { absorbed } : {}) });
      match.projectiles.splice(i, 1);
    }
  }
}

function emptyObjective() { return { open: false, owner: null, progress: 0 }; }

export function createMatch({ shieldEnabled = true } = {}) {
  return {
    tick: 0, phase: 'countdown', phaseTicks: ticks(LIMITS.countdownSeconds), round: 1, wins: [0, 0], winner: null,
    reason: null, shieldEnabled, players: [createPilot(0), createPilot(1)], projectiles: [], events: [], nextId: 1, objective: emptyObjective(),
  };
}

function endRound(match, winner, reason) {
  match.winner = winner;
  match.reason = reason;
  if (winner !== null) match.wins[winner]++;
  if (match.wins.includes(LIMITS.wins) || match.round === LIMITS.rounds) {
    const [a, b] = match.wins;
    match.winner = a === b ? null : a > b ? 0 : 1;
    match.phase = 'matchEnd';
    match.phaseTicks = 0;
  } else {
    match.phase = 'roundEnd';
    match.phaseTicks = ticks(LIMITS.intermissionSeconds);
  }
  match.projectiles = [];
}

function relayStep(match) {
  const relay = match.objective;
  if (match.phaseTicks > ticks(LIMITS.relaySeconds)) return;
  relay.open = true;
  const { x, z, radius } = ARENA.relay;
  const inside = p => p.y < 12 && Math.hypot(p.x - x, p.z - z) <= radius;
  const a = inside(match.players[0]), b = inside(match.players[1]);
  if (a === b) {
    if (!a) relay.progress = Math.max(0, relay.progress - STEP / 2);
    if (relay.progress === 0) relay.owner = null;
    return;
  }
  const owner = a ? 0 : 1;
  if (owner !== relay.owner) { relay.owner = owner; relay.progress = 0; }
  relay.progress = Math.min(1, relay.progress + STEP / LIMITS.captureSeconds);
  if (relay.progress >= 1 - EPSILON) endRound(match, owner, 'capture');
}

export function tickMatch(match, rawInputs = []) {
  if (match.phase === 'matchEnd') return;
  match.tick++;
  match.phaseTicks--;
  while (match.events.length && (match.events[0].tick < match.tick - 10 || match.events.length > 24)) match.events.shift();
  if (match.phase === 'countdown') {
    if (match.phaseTicks === 0) { match.phase = 'fight'; match.phaseTicks = ticks(LIMITS.roundSeconds); }
    return;
  }
  if (match.phase === 'roundEnd') {
    if (match.phaseTicks === 0) {
      match.phase = 'countdown';
      match.phaseTicks = ticks(LIMITS.countdownSeconds);
      match.round++;
      match.winner = null;
      match.reason = null;
      match.players = [createPilot(0), createPilot(1)];
      match.objective = emptyObjective();
    }
    return;
  }

  const damage = [0, 0];
  for (let slot = 0; slot < 2; slot++) {
    const pilot = match.players[slot];
    advancePilot(pilot, rawInputs[slot]);
    if (match.shieldEnabled) stepShield(pilot, match.tick, rawInputs[slot]?.shield === true);
  }
  for (let slot = 0; slot < 2; slot++) {
    const input = sanitizeInput(rawInputs[slot]);
    if (rawInputs[slot] == null) input.missileCancel = true;
    weapons(match, slot, input, damage);
  }
  moveMissiles(match, damage);
  for (let slot = 0; slot < 2; slot++) match.players[slot].hp = Math.max(0, match.players[slot].hp - damage[slot]);
  const [a, b] = match.players;
  if (a.hp === 0 || b.hp === 0) endRound(match, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'destroyed');
  else {
    relayStep(match);
    if (match.phase === 'fight' && match.phaseTicks === 0) endRound(match, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'time');
  }
}

export function snapshotMatch(match) {
  return {
    tick: match.tick, phase: match.phase, clock: rounded(match.phaseTicks * STEP), round: match.round,
    wins: match.wins.slice(), winner: match.winner, reason: match.reason,
    ...(match.shieldEnabled ? { shieldEnabled: true } : {}),
    players: match.players.map(p => ({
      x: rounded(p.x), y: rounded(p.y), z: rounded(p.z), yaw: roundedAngle(p.yaw), pitch: roundedAngle(p.pitch),
      vx: rounded(p.vx), vy: rounded(p.vy), vz: rounded(p.vz), hp: p.hp, en: rounded(p.en), ammo: p.ammo,
      reload: rounded(p.reload), missileCooldown: rounded(p.missileCooldown), lock: rounded(p.lock), flying: p.flying,
      boosting: p.boosting, overheat: p.overheat, recoveryWait: rounded(p.recoveryWait),
      ...(match.shieldEnabled && match.phase === 'fight' && p.shieldHp > 0 ? { shieldHp: p.shieldHp } : {}),
      ...(match.shieldEnabled && match.phase === 'fight' && p.shieldReadyAt > match.tick
        ? { shieldCooldown: rounded((p.shieldReadyAt - match.tick) * STEP) } : {}),
    })),
    projectiles: match.projectiles.map(p => ({ id: p.id, owner: p.owner, x: rounded(p.x), y: rounded(p.y), z: rounded(p.z),
      vx: rounded(p.vx), vy: rounded(p.vy), vz: rounded(p.vz) })),
    events: match.events.slice(),
    objective: { ...match.objective, progress: rounded(match.objective.progress) },
  };
}
