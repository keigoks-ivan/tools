// Visual-only effects state (particles, stuck arrows, ruins). It never touches the simulation, and every list has a hard cap.
export const ARROW_FLIGHT = .25, ROCK_FLIGHT = .35;
export const LIMITS = { particles: 360, stuck: 48, ruins: 40, perBuilding: 64, reserve: 70 };
export const STUCK_LIFE = 2.4, RUIN_LIFE = 24, RUIN_FADE = 4;

// 0 healthy, 1 smoking (at or below half hp), 2 burning (at or below a quarter).
export function damageStage(hp, maxHp) {
  if (!(maxHp > 0) || hp <= 0) return 0;
  const ratio = hp / maxHp; return ratio <= .25 ? 2 : ratio <= .5 ? 1 : 0;
}
// Corpses topple over in the first .3s, lie on the ground, then fade over the final .6s of the world's 2s corpse lifetime.
export function corpsePose(age, life = 2) {
  const fall = Math.min(1, Math.max(0, age / .3)), eased = fall * fall * (3 - 2 * fall);
  return { angle: eased * 1.5, squash: 1 - .12 * eased, alpha: age < life - .6 ? 1 : Math.max(0, (life - age) / .6) };
}
export function ruinAlpha(age) { return age >= RUIN_LIFE ? 0 : age > RUIN_LIFE - RUIN_FADE ? (RUIN_LIFE - age) / RUIN_FADE : 1; }

// What a damaged building shows, by remaining hp ratio: smoke columns, fire spots (drawn on the sprite, not as particles), embers.
// Halved hp: one or two smoke columns. A quarter: two to four fires and thick smoke. A tenth or less: many small fires and dense dark smoke.
export function damageProfile(ratio) {
  if (!(ratio > 0) || ratio > .5) return { smoke: 0, flames: 0, scale: 0, rate: 0, embers: 0, dark: 0 };
  if (ratio > .35) return { smoke: 1, flames: 0, scale: 0, rate: 2, embers: 0, dark: .55 };
  if (ratio > .25) return { smoke: 2, flames: 0, scale: 0, rate: 2.2, embers: 0, dark: .65 };
  if (ratio > .18) return { smoke: 3, flames: 2, scale: 1.15, rate: 2.3, embers: 1.5, dark: .78 };
  if (ratio > .12) return { smoke: 3, flames: 3, scale: 1.2, rate: 2.4, embers: 2, dark: .85 };
  if (ratio > .1) return { smoke: 4, flames: 5, scale: 1.2, rate: 2.5, embers: 2.5, dark: .9 };
  if (ratio > .05) return { smoke: 5, flames: 7, scale: 1.2, rate: 2.5, embers: 3.5, dark: .95 };
  return { smoke: 5, flames: 9, scale: 1.25, rate: 2.6, embers: 5, dark: 1 };
}
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Stable positions on the sprite (dx from the centre, up from the base, both in sprite pixels). Golden-ratio spacing keeps the first n spots unchanged as n grows.
const spread = (id, i, salt) => ((i * .618034 + hash(id, salt)) % 1) - .5;
export function fireSpots(id, count, size) {
  return Array.from({ length: count }, (_, i) => ({ dx: spread(id, i, 1) * size.width * .6, up: size.height * (.1 + hash(id, i * 7 + 2) * .68), phase: hash(id, i * 7 + 3) * 10, flip: hash(id, i * 7 + 4) < .5, size: .8 + hash(id, i * 7 + 5) * .4 }));
}
export function smokeSpots(id, count, size) {
  return Array.from({ length: count }, (_, i) => ({ dx: spread(id, i, 9) * size.width * .5, up: size.height * (.5 + hash(id, i * 7 + 12) * .35), phase: hash(id, i * 7 + 13) * 10 }));
}
// Screen offset (sprite pixels) to world offset: moving along the tile diagonal shifts only x on screen.
const spotWorld = (b, spot, size) => ({ wx: b.x + spot.dx / 42, wy: b.y - spot.dx / 42, z: spot.up - (size.bottom ?? 0) });

export class FxState {
  constructor() { this.rand = Math.random; this.reset(); }
  reset() { this.particles = []; this.stuck = []; this.ruins = new Map(); this.seenBuildings = new Map(); this.landed = new WeakSet(); this.carry = new Map(); this.last = null; this.dt = 0; this.time = 0; }
  spawn(p) { if (this.particles.length >= LIMITS.particles) return false; this.particles.push({ age: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, z: 0, ...p }); return true; }
  // Landing / impact bookkeeping for the short-lived world effects (arrows, stones, melee hits).
  observeEffects(effects, time) {
    for (const e of effects) {
      const tx = e.tx ?? e.x, ty = e.ty ?? e.y;
      if (e.type === 'arrow' && e.age >= ARROW_FLIGHT && !this.landed.has(e)) {
        this.landed.add(e);
        const jx = (hash(e.x * 7 + tx, ty) - .5) * .5, jy = (hash(ty * 5 + e.y, tx) - .5) * .5;
        this.stuck.push({ x: tx + jx, y: ty + jy, born: time, tilt: (hash(tx, ty * 3) - .5) * .5 });
        if (this.stuck.length > LIMITS.stuck) this.stuck.shift();
      } else if (e.type === 'rock' && e.age >= ROCK_FLIGHT && !this.landed.has(e)) {
        this.landed.add(e);
        for (let k = 0; k < 7; k++) { const a = this.rand() * Math.PI * 2, s = .5 + this.rand() * 1.1; this.spawn({ type: 'dust', wx: tx, wy: ty, z: 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .8, vz: 8 + this.rand() * 10, life: .7 + this.rand() * .4, size: 5 + this.rand() * 4 }); }
        for (let k = 0; k < 5; k++) { const a = this.rand() * Math.PI * 2, s = 1 + this.rand() * 1.6; this.spawn({ type: 'chip', wx: tx, wy: ty, z: 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .8, vz: 40 + this.rand() * 40, gravity: 160, life: .55, size: 1.8 }); }
      } else if (e.type === 'hit' && !this.landed.has(e)) {
        this.landed.add(e);
        for (let k = 0; k < 5; k++) { const a = this.rand() * Math.PI * 2, s = .8 + this.rand() * 1.4; this.spawn({ type: 'spark', wx: tx, wy: ty, z: 14 + this.rand() * 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .7, vz: 20 + this.rand() * 30, gravity: 120, life: .22 + this.rand() * .12, size: 1 }); }
        this.spawn({ type: 'dust', wx: tx, wy: ty, z: 3, vz: 6, life: .45, size: 4, vx: (this.rand() - .5) * .4, vy: (this.rand() - .5) * .3 });
      }
    }
  }
  // Remember standing buildings; one that disappears while its site is in sight leaves a ruin and a burst of smoke.
  observeBuildings(world, canSee, time) {
    const present = new Set();
    for (const b of world.buildings) {
      if (b.hp > 0) { present.add(b.id); if (b.progress >= 1) this.seenBuildings.set(b.id, { id: b.id, type: b.type, team: b.team, x: b.x, y: b.y }); else this.seenBuildings.delete(b.id); }
    }
    for (const [id, s] of this.seenBuildings) {
      if (present.has(id)) continue;
      if (!canSee(s)) continue;
      this.seenBuildings.delete(id); this.carry.delete(id);
      this.ruins.set(id, { ...s, born: time }); if (this.ruins.size > LIMITS.ruins) this.ruins.delete(this.ruins.keys().next().value);
      for (let k = 0; k < 14; k++) this.spawn({ type: 'smoke', wx: s.x + (this.rand() - .5) * 2, wy: s.y + (this.rand() - .5) * 2, z: 6 + this.rand() * 20, vz: 12 + this.rand() * 14, vx: (this.rand() - .5) * .3, vy: (this.rand() - .5) * .2, life: 1.6 + this.rand() * 1.2, size: 8 + this.rand() * 8 });
    }
  }
  // Smoke columns from half health; from a quarter the renderer also paints fires on the sprite and this adds rising embers. size = { width, height, bottom } of the sprite in sprite pixels.
  emitDamage(b, size, dt) {
    const profile = damageProfile(b.hp / b.maxHp); if (!profile.smoke) { this.carry.delete(b.id); return; }
    const carry = this.carry.get(b.id) ?? { smoke: [], ember: this.rand() }; this.carry.set(b.id, carry);
    let budget = LIMITS.perBuilding - this.particles.reduce((n, p) => n + (p.owner === b.id), 0);
    const room = () => budget > 0 && this.particles.length < LIMITS.particles - LIMITS.reserve;
    smokeSpots(b.id, profile.smoke, size).forEach((spot, i) => {
      carry.smoke[i] = (carry.smoke[i] ?? this.rand()) + dt * profile.rate;
      while (carry.smoke[i] >= 1 && room()) {
        carry.smoke[i]--; budget--; const at = spotWorld(b, spot, size);
        this.spawn({ owner: b.id, type: 'smoke', ...at, wx: at.wx + (this.rand() - .5) * .25, z: at.z + (this.rand() - .5) * 4, vz: 46 + this.rand() * 20, vx: .2 + this.rand() * .2, vy: -.1 + this.rand() * .06, life: 3.6 + this.rand() * 1.4, size: 11 + this.rand() * 6, dark: profile.dark, seed: this.rand() * 6.28 });
      }
      carry.smoke[i] = Math.min(carry.smoke[i], 2);
    });
    carry.smoke.length = profile.smoke;
    if (profile.embers) {
      carry.ember += dt * profile.embers; const spots = fireSpots(b.id, profile.flames, size);
      while (carry.ember >= 1 && room()) { carry.ember--; budget--; const spot = spots[Math.floor(this.rand() * spots.length)], at = spotWorld(b, spot, size); this.spawn({ owner: b.id, type: 'ember', ...at, z: at.z + 8, vz: 26 + this.rand() * 26, vx: (this.rand() - .3) * .5, vy: (this.rand() - .5) * .3, life: .8 + this.rand() * .7, size: 1 + this.rand() }); }
      carry.ember = Math.min(carry.ember, 2);
    }
  }
  update(time) {
    const dt = this.last === null ? 0 : Math.min(.1, Math.max(0, time - this.last)); this.last = time; this.dt = dt; this.time = time;
    const list = this.particles; let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]; p.age += dt;
      if (p.age >= p.life) continue;
      p.wx += p.vx * dt; p.wy += p.vy * dt; p.z += p.vz * dt; p.vz -= p.gravity * dt;
      if (p.type === 'chip' && p.z < 0) { p.z = 0; p.vz = 0; p.vx = p.vy = 0; }
      list[n++] = p;
    }
    list.length = n;
    this.stuck = this.stuck.filter(s => time - s.born < STUCK_LIFE);
    for (const [id, r] of this.ruins) if (time - r.born >= RUIN_LIFE) this.ruins.delete(id);
    return dt;
  }
}
