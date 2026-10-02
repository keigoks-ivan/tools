// 駐守部隊獨立於任務時鐘；遠處只有狀態，接近後才建立骨架與武器。
import * as THREE from 'three';
export const MAX_ACTORS = 24;
const fields = ['hp', 'state', 'aware', 'pi', 'wait', 'ammo', 'nades', 'id', 'role', 'side', 'notSeen', 'searchT'];
const point = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
export class Patrols {
  constructor(G, encounters, spawn) { this.G = G; this.encounters = encounters; this.spawn = spawn; this.records = []; this.clock = 0; }
  reset(done, saved = []) {
    this.records = []; this.clock = 0;
    const states = new Map((Array.isArray(saved) ? saved : []).map(s => [s.key, s]));
    for (const E of this.encounters) {
      // after 是劇情派來的追兵，留給增援入口；其他都是事先駐守的部隊。
      if (E.after) continue;
      E.enemies.forEach((def, i) => {
        const key = E.id + ':' + i, old = states.get(key);
        const pos = new THREE.Vector3(def.x, def.y || (def.type === 'drone' ? 4 : 0), def.z);
        if (def.type !== 'drone') pos.y = this.G.solid.floorAt(pos.x, pos.z, pos.y + .5);
        const data = { state: def.patrol || def.type === 'drone' ? 'patrol' : 'idle', pi: 0, wait: 1 + i * .3, yaw: def.yaw || 0, dead: done.has(E.id) && !E.operation?.bypass };
        if (old && point(old.p) && Math.max(Math.abs(old.p[0]), Math.abs(old.p[2])) < (this.G.footExtent || 320) + 32 && old.p[1] >= 0 && old.p[1] < 40) {
          pos.fromArray(old.p); data.dead = !!old.dead;
          for (const k of fields) if (typeof old[k] === 'number' && Number.isFinite(old[k]) || k === 'state' && ['idle', 'patrol', 'combat'].includes(old[k]) || k === 'role' && ['line', 'support', 'flank'].includes(old[k])) data[k] = old[k];
          if (Number.isFinite(old.yaw)) data.yaw = old.yaw;
          if (point(old.lastSeen)) data.lastSeen = old.lastSeen;
          if (Array.isArray(old.seenBodies)) data.seenBodies = old.seenBodies.filter(Number.isFinite).slice(0, 160);
        }
        if (def.patrol?.length) data.pi = Math.max(0, Math.floor(data.pi || 0)) % def.patrol.length;
        const r = { key, E, def, data, p: pos, actor: null, type: def.type || 'trooper' };
        for (const k of ['dead', 'state', 'sees']) Object.defineProperty(r, k, { get: () => r.actor ? r.actor[k] : r.data[k] });
        Object.defineProperty(r, 'lastSeen', { get: () => r.actor?.lastSeen || (r.data.lastSeen ? new THREE.Vector3().fromArray(r.data.lastSeen) : r.p) });
        Object.defineProperty(r, 'pos', { get: () => r.actor?.pos || r.p });
        this.records.push(r);
      });
    }
    this.G.nextId = Math.max(this.G.nextId, ...this.records.map(r => (r.data.id || 0) + 1));
  }
  group(E) { return this.records.filter(r => r.E === E); }
  remember(r) {
    const e = r.actor; if (!e) return;
    r.p.copy(e.pos); r.data.dead = e.dead;
    for (const k of fields) if (e[k] !== undefined) r.data[k] = e[k];
    r.data.yaw = e.s?.yaw ?? e.yaw; r.data.lastSeen = e.lastSeen.toArray(); if (e.seenBodies) r.data.seenBodies = [...e.seenBodies];
  }
  snapshot() { return this.records.map(r => { this.remember(r); return { key: r.key, p: r.p.toArray(), ...r.data }; }); }
  release(r) {
    this.remember(r); r.actor.dispose();
    const i = this.G.enemies.indexOf(r.actor); if (i >= 0) this.G.enemies.splice(i, 1);
    r.actor = null;
  }
  create(r) {
    const d = r.data, e = this.spawn({ ...r.def, alert: false });
    e.pos.copy(r.p);
    for (const k of fields) if (d[k] !== undefined) e[k] = d[k];
    if (d.lastSeen) e.lastSeen.fromArray(d.lastSeen);
    if (Array.isArray(d.seenBodies)) e.seenBodies = new Set(d.seenBodies);
    if (e.s) { e.s.yaw = e.s.aimYaw = e.s.bodyYaw = d.yaw; e.s.update(0); }
    else { e.yaw = d.yaw; e.home.set(r.def.x, r.def.y || 4, r.def.z); }
    r.actor = e; e.resident = r;
    this.G.nextId = Math.max(this.G.nextId, e.id + 1);
  }
  distant(r, dt) {
    const d = r.data, route = r.def.patrol;
    if (d.searchT > 0) { d.searchT = Math.max(0, d.searchT - dt); if (!d.searchT && d.state !== 'combat') d.aware = Math.min(d.aware || 0, .25); return; }
    if (d.dead || d.state === 'combat' || !route?.length) return;
    const p = route[d.pi % route.length], dx = p[0] - r.p.x, dz = p[1] - r.p.z, L = Math.hypot(dx, dz);
    if (L < .6) { d.wait -= dt; if (d.wait <= 0) { d.pi = (d.pi + 1) % route.length; d.wait = 2; } return; }
    const k = Math.min(L, dt * (r.type === 'heavy' ? 1.2 : 1.6)) / L;
    const next = r.p.clone(); next.x += dx * k; next.z += dz * k;
    // 遠處也不穿牆、不從高架掉到地面；路線被擋就等近處導航接手。
    const y = this.G.solid.floorAt(next.x, next.z, r.p.y + .5);
    if (Math.abs(y - r.p.y) > .6 || !this.G.solid.sees(r.p.clone().add(new THREE.Vector3(0, .6, 0)), next.clone().add(new THREE.Vector3(0, .6, 0))) || this.G.solid.pushOut(next.clone(), .34, next.y, next.y + 1.7, .45)) return;
    next.y = y; r.p.copy(next); d.yaw = Math.atan2(dx, dz);
  }
  update(dt, warm = false) {
    this.clock += dt; if (!warm && this.clock < .5) return;
    const elapsed = this.clock; this.clock = 0;
    const center = this.G.scout?.active ? this.G.scout.pos : this.G.player.pos;
    const eye = this.G.scout?.active ? this.G.scout.pos : this.G.playerEye;
    const visible = r => this.G.solid.sees(eye, r.pos.clone().add(new THREE.Vector3(0, r.type === 'drone' ? 0 : 1.5, 0)));
    for (const r of this.records) {
      if (r.actor) {
        this.remember(r);
        if (!this.G.enemies.includes(r.actor)) r.actor = null;
        else if (Math.min(r.pos.distanceTo(this.G.player.pos), r.pos.distanceTo(center)) > 45 && !visible(r) && (r.state !== 'combat' || r.pos.distanceTo(this.G.player.pos) > 110)) this.release(r);
      } else this.distant(r, elapsed);
    }
    const near = this.records.filter(r => !r.dead && !r.actor && (r.pos.distanceTo(this.G.player.pos) < 35 || r.pos.distanceTo(center) < 95 && visible(r))).sort((a, b) => Math.min(a.pos.distanceToSquared(this.G.player.pos), a.pos.distanceToSquared(center)) - Math.min(b.pos.distanceToSquared(this.G.player.pos), b.pos.distanceToSquared(center)));
    let slots = warm ? MAX_ACTORS : 4;
    for (const r of near) {
      if (slots <= 0 || this.G.enemies.filter(e => !e.dead).length >= MAX_ACTORS) break;
      this.create(r); slots--;
    }
  }
}
// 增援從入口後方／側道出現，鏡頭看得到的位置不生人，也不貼著玩家。
export function arrivalPoint(G, def) {
  const base = new THREE.Vector3(def.x, def.y || (def.type === 'drone' ? 4 : 0), def.z);
  for (const radius of [0, 8, 16, 24, 32, 48, 64]) for (const [dx, dz] of radius ? [[0, 1], [1, 0], [0, -1], [-1, 0], [.707, .707], [.707, -.707], [-.707, .707], [-.707, -.707]] : [[0, 0]]) {
    const p = base.clone(); p.x += dx * radius; p.z += dz * radius;
    if (Math.hypot(p.x, p.z) > (G.footExtent || 160) * 1.42 || p.distanceTo(G.player.pos) < 18) continue;
    if (def.type !== 'drone') { p.y = G.solid.floorAt(p.x, p.z, base.y + .5); if (Math.abs(p.y - base.y) > .6) continue; }
    if (G.solid.pushOut(p.clone(), .6, p.y, p.y + 1.7, .45)) continue;
    const head = p.clone().add(new THREE.Vector3(0, def.type === 'drone' ? 0 : 1.5, 0));
    const eye = G.scout?.active ? G.scout.pos : G.playerEye;
    const inView = !G.aimDir || head.clone().sub(eye).normalize().dot(G.aimDir) > .45;
    if (inView && G.solid.sees(eye, head)) continue;
    return { ...def, x: p.x, y: p.y, z: p.z };
  }
  return null;
}
export function updateInfantry(G, dt) {
  for (const e of G.enemies) {
    const dist = e.pos.distanceTo(G.player.pos);
    // 近處與交火維持原更新；中距離安靜巡邏降到 10 Hz，遠處降到 4 Hz。
    const facing = G.aimDir && new THREE.Vector3().subVectors(e.pos, G.playerEye).normalize().dot(G.aimDir) > .55;
    const interval = e.dead || e.state === 'combat' || dist < 35 || facing ? 0 : dist < 70 ? .1 : .25;
    e.patrolDt = (e.patrolDt || 0) + dt;
    if (e.patrolDt + 1e-6 < interval) continue;
    const step = e.patrolDt; e.patrolDt = 0; e.update(step);
  }
}
