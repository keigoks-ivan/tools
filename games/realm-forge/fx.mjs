// Visual-only effects state (particles, stuck arrows, ruins). It never touches the simulation, and every list has a hard cap.
export const ARROW_FLIGHT = .25, ROCK_FLIGHT = .35;
export const LIMITS = { particles: 360, stuck: 48, ruins: 40, perBuilding: 40 };
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

const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

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
  // Smoke at half health, flames and embers at a quarter. size = { width, height } of the sprite in sprite pixels.
  emitDamage(b, size, dt) {
    const stage = damageStage(b.hp, b.maxHp); if (!stage) { this.carry.delete(b.id); return; }
    const carry = this.carry.get(b.id) ?? { smoke: this.rand(), fire: this.rand() }; this.carry.set(b.id, carry);
    carry.smoke += dt * (stage === 2 ? 7 : 4); carry.fire += dt * (stage === 2 ? 15 : 0);
    const owned = () => this.particles.reduce((n, p) => n + (p.owner === b.id), 0);
    let budget = LIMITS.perBuilding - owned();
    const spread = Math.min(.9, .25 + size.width / 260);
    while (carry.smoke >= 1 && budget > 0) { carry.smoke--; budget--; this.spawn({ owner: b.id, type: 'smoke', wx: b.x + (this.rand() - .5) * spread * 2, wy: b.y + (this.rand() - .5) * spread * 2, z: size.height * (.35 + this.rand() * .35), vz: 14 + this.rand() * 10, vx: .12 + this.rand() * .16, vy: -.06, life: 1.5 + this.rand() * 1.1, size: 6 + this.rand() * 5 }); }
    while (carry.fire >= 1 && budget > 0) { carry.fire--; budget--; this.spawn({ owner: b.id, type: this.rand() < .2 ? 'ember' : 'flame', wx: b.x + (this.rand() - .5) * spread * 2, wy: b.y + (this.rand() - .5) * spread * 2, z: size.height * (.12 + this.rand() * .45), vz: 16 + this.rand() * 14, vx: (this.rand() - .5) * .1, vy: (this.rand() - .5) * .1, life: .45 + this.rand() * .35, size: 4 + this.rand() * 4 }); }
    carry.smoke = Math.min(carry.smoke, 2); carry.fire = Math.min(carry.fire, 2);
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
