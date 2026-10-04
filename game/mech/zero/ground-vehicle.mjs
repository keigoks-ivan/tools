// 單台玩家輪式載具；+Z 車頭，地面運動學與 Solid 共用，不使用剛體。
import * as THREE from 'three';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (a, b, amount) => a + clamp(b - a, -amount, amount);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const validPos = p => p && [p.x, p.y, p.z].every(v => finite(v) && Math.abs(v) <= 100000);
const NEAR = [], SKIN = .025;

export const VEHICLE_TYPES = Object.freeze({
  patrol: Object.freeze({ label: '四輪巡邏車', length: 4.8, width: 2, height: 2.05, wheelbase: 2.85, track: 1.68, wheelRadius: .4,
    maxSpeed: 30 / 3.6, reverseSpeed: 3.1, acceleration: 3.1, brake: 8, steer: .48, hp: 320, ammo: 360, rate: 6.5, damage: 28,
    range: 160, bulletSpeed: 180, turretY: 2.08, turretZ: -.35, muzzle: 1.12, step: .32, drop: .52, slope: .42 }),
  apc: Object.freeze({ label: '輪式裝甲運輸車', length: 5.9, width: 2.35, height: 2.45, wheelbase: 3.5, track: 2.01, wheelRadius: .48,
    maxSpeed: 23 / 3.6, reverseSpeed: 2.5, acceleration: 2.1, brake: 6.5, steer: .43, hp: 520, ammo: 600, rate: 8, damage: 32,
    range: 180, bulletSpeed: 190, turretY: 2.43, turretZ: -.35, muzzle: 1.24, step: .34, drop: .52, slope: .38 }),
});

const profileOf = type => {
  const p = typeof type === 'string' ? VEHICLE_TYPES[type] : type;
  if (!p || !finite(p.length) || !finite(p.width)) throw new RangeError('Unknown ground vehicle type');
  return p;
};

// OBB 與 Solid 的四條平面分離軸。oblique map props 保留其真正方向。
function obstacleBox(b) {
  if (b.obb) return { x: b.obb.cx, z: b.obb.cz, hx: b.obb.hx, hz: b.obb.hz, yaw: b.obb.ry };
  return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, hx: (b.x1 - b.x0) / 2, hz: (b.z1 - b.z0) / 2, yaw: 0 };
}
function axes(yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); return [[c, -s], [s, c]]; }
function radius(box, axis, basis) {
  return box.hx * Math.abs(axis[0] * basis[0][0] + axis[1] * basis[0][1]) + box.hz * Math.abs(axis[0] * basis[1][0] + axis[1] * basis[1][1]);
}
function overlaps(pose, p, b, pad = 0) {
  const a = { hx: p.width / 2 + pad, hz: p.length / 2 + pad }, q = obstacleBox(b), aa = axes(pose.yaw), bb = axes(q.yaw);
  for (const axis of [...aa, ...bb]) {
    const d = Math.abs((pose.x - q.x) * axis[0] + (pose.z - q.z) * axis[1]);
    if (d >= radius(a, axis, aa) + radius(q, axis, bb) - 1e-7) return false;
  }
  return true;
}
function blocks(solid, b, pose, p) {
  if (b.dead || b.noMove) return false;
  // Follow the four-wheel support plane at the contacted part of an uphill chassis.
  const x = clamp(pose.x, b.x0, b.x1), z = clamp(pose.z, b.z0, b.z1), c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const lx = clamp((x - pose.x) * c - (z - pose.z) * s, -p.width / 2, p.width / 2), lz = clamp((x - pose.x) * s + (z - pose.z) * c, -p.length / 2, p.length / 2);
  const base = pose.y - Math.sin(pose.pitch || 0) * lz + Math.sin(pose.roll || 0) * lx;
  const top = b.ramp ? solid.top(b, x, z) : b.y1;
  return top > base + p.step + .035 && b.y0 < base + p.height - .08;
}

function supportAt(solid, pose, p, previous, groundAt) {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), ys = [];
  let front = 0, rear = 0, left = 0, right = 0;
  for (const z of [-p.wheelbase / 2, p.wheelbase / 2]) for (const x of [-p.track / 2, p.track / 2]) {
    const wx = pose.x + x * c + z * s, wz = pose.z - x * s + z * c;
    const expected = previous.y - Math.sin(previous.pitch || 0) * z + Math.sin(previous.roll || 0) * x;
    const y = groundAt ? groundAt(wx, wz, expected + p.step + .08) : solid.floorAt(wx, wz, expected + p.step + .08);
    if (!finite(y)) return { ok: false, reason: 'ground' };
    if (y - expected > p.step + .08) return { ok: false, reason: 'step' };
    if (expected - y > p.drop) return { ok: false, reason: 'drop' };
    ys.push(y); if (z > 0) front += y; else rear += y; if (x > 0) right += y; else left += y;
  }
  const pitch = -Math.atan2((front - rear) / 2, p.wheelbase), roll = Math.atan2((right - left) / 2, p.track);
  if (Math.abs(pitch) > p.slope || Math.abs(roll) > .29) return { ok: false, reason: 'slope' };
  // Opposite wheels should still lie close to one plane rather than straddle separate storeys.
  if (Math.abs(ys[0] + ys[3] - ys[1] - ys[2]) > .5) return { ok: false, reason: 'ground' };
  return { ok: true, y: ys.reduce((a, b) => a + b, 0) / 4, pitch, roll };
}

// Translation sweep on the OBB separation intervals; thin walls cannot be skipped by a long dt.
function sweepBox(from, to, p, b, angularPad) {
  const a = { hx: p.width / 2 + angularPad + SKIN, hz: p.length / 2 + angularPad + SKIN }, q = obstacleBox(b);
  const aa = axes(from.yaw), bb = axes(q.yaw), vx = to.x - from.x, vz = to.z - from.z;
  let enter = 0, leave = 1, normal = null, startsInside = true;
  for (const axis of [...aa, ...bb]) {
    const R = radius(a, axis, aa) + radius(q, axis, bb), d = (from.x - q.x) * axis[0] + (from.z - q.z) * axis[1], v = vx * axis[0] + vz * axis[1];
    if (Math.abs(d) >= R - 1e-6) startsInside = false;
    if (Math.abs(v) < 1e-10) { if (Math.abs(d) >= R) return null; continue; }
    let lo = (-R - d) / v, hi = (R - d) / v;
    if (lo > hi) [lo, hi] = [hi, lo];
    if (lo > enter) { enter = lo; normal = { x: -Math.sign(v) * axis[0], z: -Math.sign(v) * axis[1] }; }
    leave = Math.min(leave, hi); if (enter > leave || leave < 0 || enter > 1) return null;
  }
  // The conservative angular skin can touch a wall. Moving away remains available to reverse out.
  if (startsInside && !overlaps(from, p, b) && !overlaps(to, p, b)) return null;
  if (startsInside && overlaps(from, p, b) && !overlaps(to, p, b)) return null;
  return { t: Math.max(0, enter), normal, b };
}

// Public route validator and controller use the same swept footprint/support contract.
// Returns the last safe pose on failure; poses are metre coordinates {x,y,z,yaw,pitch?,roll?}.
export function sweepVehiclePose(solid, from, to, type = 'patrol', { groundAt = null, clearance = 0 } = {}) {
  const original = profileOf(type), p = clearance ? { ...original, width: original.width + clearance * 2, length: original.length + clearance * 2 } : original;
  if (!solid || !validPos(from) || !validPos(to) || !finite(from.yaw) || !finite(to.yaw)) return { ok: false, pose: { ...from }, reason: 'invalid', hit: null };
  const turn = wrap(to.yaw - from.yaw), distance = Math.hypot(to.x - from.x, to.z - from.z);
  const n = Math.max(1, Math.ceil(Math.abs(turn) / .018), Math.ceil(distance / .18));
  if (n > 4096) return { ok: false, pose: { ...from }, reason: 'invalid', hit: null };
  let current = { ...from };
  for (let i = 1; i <= n; i++) {
    const t = i / n, next = { x: from.x + (to.x - from.x) * t, y: current.y, z: from.z + (to.z - from.z) * t, yaw: wrap(from.yaw + turn * t) };
    const support = supportAt(solid, next, p, current, groundAt);
    if (!support.ok) return { ok: false, pose: current, reason: support.reason, hit: null };
    Object.assign(next, { y: support.y, pitch: support.pitch, roll: support.roll });
    const angularPad = Math.hypot(p.width / 2, p.length / 2) * Math.abs(wrap(next.yaw - current.yaw));
    const mx = (current.x + next.x) / 2, mz = (current.z + next.z) / 2;
    const radius = Math.hypot(p.width / 2, p.length / 2) + Math.hypot(next.x - current.x, next.z - current.z) / 2 + angularPad + SKIN;
    let first = null;
    for (const b of solid.near(mx, mz, radius, NEAR)) {
      if (!blocks(solid, b, current, p) && !blocks(solid, b, next, p)) continue;
      const hit = sweepBox(current, next, p, b, angularPad);
      if (hit && (!first || hit.t < first.t)) first = hit;
      // A turn can hit without centre translation; retain the exact rotated end test as well.
      if (!hit && overlaps(next, p, b, SKIN)) first = { t: 0, normal: null, b };
    }
    if (first) {
      const tSafe = Math.max(0, first.t - .002);
      const safe = { ...current, x: current.x + (next.x - current.x) * tSafe, z: current.z + (next.z - current.z) * tSafe, yaw: wrap(current.yaw + wrap(next.yaw - current.yaw) * tSafe) };
      const h = supportAt(solid, safe, p, current, groundAt);
      if (h.ok) Object.assign(safe, { y: h.y, pitch: h.pitch, roll: h.roll });
      return { ok: false, pose: safe, reason: 'collision', hit: first };
    }
    current = next;
  }
  return { ok: true, pose: current, reason: null, hit: null };
}

export function validVehicleSnapshot(s) {
  if (!s || s.version !== 1 || !VEHICLE_TYPES[s.type] || typeof s.id !== 'string' || !s.id.length || s.id.length > 80) return false;
  const p = VEHICLE_TYPES[s.type];
  return Array.isArray(s.pos) && s.pos.length === 3 && s.pos.every(v => finite(v) && Math.abs(v) <= 100000) && finite(s.yaw)
    && finite(s.hp) && s.hp >= 0 && s.hp <= p.hp && Number.isInteger(s.ammo) && s.ammo >= 0 && s.ammo <= p.ammo
    && finite(s.overheat) && s.overheat >= 0 && s.overheat <= 1
    && (s.pitch === undefined || finite(s.pitch) && Math.abs(s.pitch) <= p.slope)
    && (s.roll === undefined || finite(s.roll) && Math.abs(s.roll) <= .29)
    && (s.heatLocked === undefined || typeof s.heatLocked === 'boolean');
}

export class GroundVehicle {
  constructor({ id = 'patrol-1', type = 'patrol', pos = new THREE.Vector3(), yaw = 0, solid, groundAt = null, model = null } = {}) {
    this.profile = profileOf(type); this.id = id; this.type = type; this.solid = solid; this.groundAt = groundAt; this.model = model;
    this.pos = new THREE.Vector3(pos.x ?? pos[0] ?? 0, pos.y ?? pos[1] ?? 0, pos.z ?? pos[2] ?? 0); this.yaw = yaw;
    this.hp = this.profile.hp; this.ammo = this.profile.ammo; this.overheat = 0; this.speed = 0; this.steer = 0;
    this.pitch = 0; this.roll = 0; this.wheelSpin = 0; this.seatMode = null; this.viewYaw = yaw; this.viewPitch = -.08;
    this.cooldown = 0; this.heatLocked = false; this.lastBlock = null; this.visible = true; this._entry = null;
    this._camera = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 64 };
    this._origin = new THREE.Vector3(); this._direction = new THREE.Vector3(); this._target = new THREE.Vector3();
    this._exitProbe = new THREE.Vector3();
    this._bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ'); this._bodyQuaternion = new THREE.Quaternion(); this._inverseBody = new THREE.Quaternion(); this._localDirection = new THREE.Vector3();
    this._initial = this.snapshot(); if (!validVehicleSnapshot(this._initial) || !solid) throw new RangeError('Invalid ground vehicle spawn');
    this._syncModel();
  }
  get destroyed() { return this.hp <= 0; }
  get occupied() { return this.seatMode !== null; }
  get moving() { return Math.abs(this.speed) > .15; }
  _bodyRotation() { return this._bodyQuaternion.setFromEuler(this._bodyEuler.set(this.pitch, this.yaw, this.roll)); }
  _localAim() {
    this._inverseBody.copy(this._bodyRotation()).invert();
    return this._localDirection.set(Math.sin(this.viewYaw) * Math.cos(this.viewPitch), Math.sin(this.viewPitch), Math.cos(this.viewYaw) * Math.cos(this.viewPitch)).applyQuaternion(this._inverseBody);
  }
  get turretYaw() { const d = this._localAim(); return Math.atan2(d.x, d.z); }
  get turretPitch() { const d = this._localAim(); return Math.atan2(d.y, Math.hypot(d.x, d.z)); }
  _limitGunAim() {
    const d = this._localAim(), yaw = clamp(Math.atan2(d.x, d.z), -2.95, 2.95), pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -.3, .62);
    d.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(this._bodyQuaternion);
    this.viewYaw = Math.atan2(d.x, d.z); this.viewPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  }
  _pose() { return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, roll: this.roll }; }
  _syncModel() {
    if (!this.model) return;
    const root = this.model.root || this.model.group; if (root) { root.position.copy(this.pos); root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ'); root.visible = this.visible; }
    this.model.update?.({ steer: this.steer, wheelSpin: this.wheelSpin, turretYaw: this.turretYaw, turretPitch: this.turretPitch, destroyed: this.destroyed });
  }
  canEnter(playerPos) {
    if (this.destroyed || this.occupied || !validPos(playerPos) || this.moving || Math.abs(playerPos.y - this.pos.y) > 2.2) return false;
    const x = playerPos.x - this.pos.x, z = playerPos.z - this.pos.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return Math.hypot(Math.max(0, Math.abs(x * c - z * s) - this.profile.width / 2), Math.max(0, Math.abs(x * s + z * c) - this.profile.length / 2)) <= 1.65;
  }
  enter(playerPos) {
    if (!this.canEnter(playerPos)) return false;
    this._entry = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z); this.seatMode = 'drive'; this.viewYaw = this.yaw; this.viewPitch = -.08; return true;
  }
  setMode(mode) {
    if (!this.occupied || this.destroyed || !['drive', 'gun'].includes(mode)) return false;
    this.seatMode = mode; return true; // gun mode applies the brake; firing waits for standstill.
  }
  _exitCandidate(x, z, ref, reachable = false) {
    const y = this.groundAt ? this.groundAt(x, z, ref + .48) : this.solid.floorAt(x, z, ref + .48);
    if (!finite(y) || Math.abs(y - ref) > .8) return null;
    const q = new THREE.Vector3(x, y, z), bx = x, bz = z;
    this.solid.pushOut(q, .36, y, y + 1.76, .45);
    if (Math.hypot(q.x - bx, q.z - bz) > .04 || this.solid.ceilAt(q.x, q.z, y + .1, .34) < y + 1.76) return null;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = q.x - this.pos.x, dz = q.z - this.pos.z;
    if (Math.abs(dx * c - dz * s) < this.profile.width / 2 + .36 && Math.abs(dx * s + dz * c) < this.profile.length / 2 + .36) return null;
    if (reachable) {
      // Local doors/emergency hatches need a continuous person-sized passage, not a free point across a wall.
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .2)), probe = this._exitProbe;
      for (let i = 1; i <= n; i++) {
        const t = i / n, feet = this.pos.y + (y - this.pos.y) * t;
        probe.set(this.pos.x + dx * t, feet, this.pos.z + dz * t);
        if (this.solid.pushOut(probe, .36, feet, feet + 1.76, .45) || this.solid.ceilAt(probe.x, probe.z, feet + .1, .34) < feet + 1.76) return null;
      }
    }
    return q;
  }
  exit(fallback = null) {
    if (!this.occupied) return null;
    if (this.moving && !this.destroyed) { this.seatMode = 'gun'; return null; }
    const p = this.profile, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const points = [[-p.width / 2 - .7, .3], [p.width / 2 + .7, .3], [0, -p.length / 2 - .75], [0, p.length / 2 + .75]];
    for (let ring = 1; ring <= 3; ring++) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; points.push([Math.sin(a) * (p.width / 2 + .65 + ring), Math.cos(a) * (p.length / 2 + .65 + ring)]); }
    let safe = null;
    for (const [x, z] of points) { safe = this._exitCandidate(this.pos.x + x * c + z * s, this.pos.z - x * s + z * c, this.pos.y, true); if (safe) break; }
    if (!safe && this._entry) safe = this._exitCandidate(this._entry.x, this._entry.z, this._entry.y);
    if (!safe && validPos(fallback)) safe = this._exitCandidate(fallback.x, fallback.z, fallback.y);
    if (!safe) return null;
    this.seatMode = null; this.speed = 0; this.steer = 0; return safe;
  }
  update(dt, input = {}) {
    if (!finite(dt) || dt <= 0) return;
    dt = Math.min(dt, .05); this.cooldown = Math.max(0, this.cooldown - dt); this.overheat = Math.max(0, this.overheat - dt * .2);
    if (this.overheat < .35) this.heatLocked = false;
    if (this.occupied && !this.destroyed) {
      if (finite(input.lookYaw)) this.viewYaw = wrap(input.lookYaw); else this.viewYaw = wrap(this.viewYaw - (finite(input.lookX) ? input.lookX : 0));
      const gun = this.seatMode === 'gun', lo = gun ? -1.2 : -.3, hi = gun ? 1.2 : .62;
      if (finite(input.lookPitch)) this.viewPitch = clamp(input.lookPitch, lo, hi); else this.viewPitch = clamp(this.viewPitch - (finite(input.lookY) ? input.lookY : 0), lo, hi);
    }
    const p = this.profile, drive = this.seatMode === 'drive' && !this.destroyed;
    const yawBefore = this.yaw;
    const rawThrottle = input.throttle ?? input.my, rawSteer = input.steer ?? input.mx;
    const throttle = drive && finite(rawThrottle) ? clamp(rawThrottle, -1, 1) : 0;
    const steering = drive && finite(rawSteer) ? clamp(rawSteer, -1, 1) : 0;
    const brake = input.brake || !drive || (throttle && Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > .15);
    this.steer = approach(this.steer, steering * p.steer, dt * 1.8);
    const target = throttle >= 0 ? throttle * p.maxSpeed : throttle * p.reverseSpeed;
    this.speed = approach(this.speed, brake ? 0 : target, dt * (brake ? p.brake : throttle ? p.acceleration : 2.4));
    if (Math.abs(this.speed) < .015) this.speed = 0;
    this.lastBlock = null;
    const steps = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / steps;
    for (let i = 0; i < steps && this.speed; i++) {
      const from = this._pose(), yaw = wrap(this.yaw - Math.tan(this.steer) * this.speed / p.wheelbase * h);
      const middle = this.yaw + wrap(yaw - this.yaw) / 2, distance = this.speed * h;
      const result = sweepVehiclePose(this.solid, from, { x: this.pos.x + Math.sin(middle) * distance, y: this.pos.y, z: this.pos.z + Math.cos(middle) * distance, yaw }, p, { groundAt: this.groundAt });
      const q = result.pose, travelled = Math.hypot(q.x - this.pos.x, q.z - this.pos.z) * Math.sign(this.speed);
      this.pos.set(q.x, q.y, q.z); this.yaw = q.yaw; this.pitch = q.pitch || 0; this.roll = q.roll || 0; this.wheelSpin = wrap(this.wheelSpin + travelled / p.wheelRadius);
      if (!result.ok) { this.lastBlock = result.reason; this.speed = 0; break; }
    }
    // Driving preserves the user's orbit relative to the body; the gunner keeps a world aim direction.
    if (drive) this.viewYaw = wrap(this.viewYaw + wrap(this.yaw - yawBefore));
    if (this.seatMode === 'gun') this._limitGunAim();
    this._syncModel();
  }
  camera() {
    const p = this.profile, cam = this._camera, gun = this.seatMode === 'gun', y = this.pos.y + p.turretY;
    this._target.set(this.pos.x, y, this.pos.z).addScaledVector(this._direction.set(Math.sin(this.viewYaw) * Math.cos(this.viewPitch), Math.sin(this.viewPitch), Math.cos(this.viewYaw) * Math.cos(this.viewPitch)), gun ? 24 : 5);
    if (gun) {
      cam.position.set(this.pos.x - Math.sin(this.yaw) * .55, y + .35, this.pos.z - Math.cos(this.yaw) * .55);
      this._target.copy(cam.position).addScaledVector(this._direction, 24);
    }
    else {
      cam.position.set(this.pos.x - Math.sin(this.viewYaw) * 7.5, this.pos.y + 3.7 - Math.sin(this.viewPitch) * 4, this.pos.z - Math.cos(this.viewYaw) * 7.5);
      this._origin.set(this.pos.x, this.pos.y + 1.6, this.pos.z); this._direction.copy(cam.position).sub(this._origin); const L = this._direction.length(); this._direction.divideScalar(L);
      const hit = this.solid.ray(this._origin, this._direction, L); if (hit) cam.position.copy(this._origin).addScaledVector(this._direction, Math.max(.35, hit.t - .2));
    }
    cam.target.copy(this._target); cam.fov = gun ? 58 : 64; return cam;
  }
  fire(aimPoint = null) {
    if (this.seatMode !== 'gun' || this.destroyed || this.moving || this.cooldown > 0 || this.ammo <= 0 || this.heatLocked) return null;
    const p = this.profile, dir = new THREE.Vector3(Math.sin(this.viewYaw) * Math.cos(this.viewPitch), Math.sin(this.viewPitch), Math.cos(this.viewYaw) * Math.cos(this.viewPitch));
    const mount = new THREE.Vector3(0, p.turretY, p.turretZ).applyQuaternion(this._bodyRotation()).add(this.pos);
    if (this.solid.ray(mount, dir, p.muzzle + .08)) return null;
    const origin = mount.clone().addScaledVector(dir, p.muzzle);
    // Converge at the crosshair hit rather than firing a parallel ray below the gunner's sight.
    const eye = this.camera().position, aim = validPos(aimPoint) ? aimPoint : eye.clone().addScaledVector(dir, this.solid.ray(eye, dir, p.range)?.t ?? p.range);
    dir.copy(aim).sub(origin); if (dir.lengthSq() < .001) return null; dir.normalize();
    this.ammo--; this.cooldown = 1 / p.rate; this.overheat = Math.min(1, this.overheat + .105); if (this.overheat >= .98) this.heatLocked = true;
    return { origin, direction: dir, damage: p.damage, range: p.range, speed: p.bulletSpeed, lightArmorOnly: true, vehicleId: this.id };
  }
  damage(amount) {
    if (!finite(amount) || amount <= 0 || this.destroyed) return 0;
    const applied = Math.min(this.hp, amount); this.hp -= applied; if (this.destroyed) this.speed = 0; this._syncModel(); return applied;
  }
  snapshot() { return { version: 1, type: this.type, id: this.id, pos: [this.pos.x, this.pos.y, this.pos.z], yaw: wrap(this.yaw), pitch: this.pitch, roll: this.roll, hp: this.hp, ammo: this.ammo, overheat: this.overheat, heatLocked: this.heatLocked }; }
  reset(snapshot = this._initial) {
    if (!validVehicleSnapshot(snapshot) || snapshot.type !== this.type || snapshot.id !== this.id) return false;
    this.pos.fromArray(snapshot.pos); this.yaw = wrap(snapshot.yaw); this.hp = snapshot.hp; this.ammo = snapshot.ammo; this.overheat = snapshot.overheat;
    this.speed = 0; this.steer = 0; this.pitch = snapshot.pitch || 0; this.roll = snapshot.roll || 0; this.wheelSpin = 0; this.seatMode = null; this.viewYaw = this.yaw; this.viewPitch = -.08;
    this.cooldown = 0; this.heatLocked = snapshot.heatLocked ?? this.overheat >= .98; this.lastBlock = null; this._entry = null; this.visible = true; this._syncModel(); return true;
  }
}
