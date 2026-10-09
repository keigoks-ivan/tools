// 駕駛員：第一人稱移動（走／跑／蹲／跳、上樓梯、撞牆滑開）、生命＋個人護盾
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
export const P = {
  r: 0.34, stand: 1.62, crouch: 1.05, head: 0.14,
  walk: 4.3, run: 6.9, crouchV: 2.3, adsV: 2.6,
  acc: 42, air: 9, fric: 12, g: 19, jump: 5.8, step: 0.48,
  hp: 100, shield: 60, regen: 4.2, shieldRate: 30,
};

export class Pilot {
  constructor(solid, recovery = {}) {
    this.solid = solid;
    this.setRecovery(recovery);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.crouchK = 0; this.eyeH = P.stand;
    this.grounded = true; this.airT = 0;
    this.sprint = false; this.sprintK = 0;
    this.hp = P.hp; this.shield = P.shield; this.hurtT = 99; this.dead = false;
    this.stepPh = 0; this.onStep = null; this.onLand = null;
    this.moveK = 0;    // 移動速度 0..1（給晃動、準心擴散）
    this.stam = 0;     // 喘（衝刺累積）
    this.frozen = false;
  }
  // Each game can tune recovery without changing the series movement or defaults.
  setRecovery(profile = {}) {
    const value = (key, fallback) => Number.isFinite(profile[key]) && profile[key] >= 0 ? profile[key] : fallback;
    this.recovery = { shieldDelay: value('shieldDelay', P.regen), shieldRate: value('shieldRate', P.shieldRate), healthFloor: Math.min(P.hp, value('healthFloor', 40)), healthRate: value('healthRate', 6) };
  }
  reset(p, yaw) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.hp = P.hp; this.shield = P.shield; this.dead = false; this.hurtT = 99; this.crouchK = 0; this.eyeH = P.stand;
    this.pos.y = this.solid.floorAt(p.x, p.z, p.y + 1);
  }
  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  fwd(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }

  // c：{mx,my,lookX,lookY,jump,sprint,crouch,ads}
  update(dt, c) {
    if (this.frozen) return;
    this.yaw -= c.lookX; this.pitch = clamp(this.pitch - c.lookY, -1.45, 1.45);
    const S = this.solid, p = this.pos;
    // 蹲（頭頂有東西就站不起來）
    let want = c.crouch ? 1 : 0;
    if (!want && this.crouchK > 0.05 && S.ceilAt(p.x, p.z, p.y + 0.5, P.r * 0.8) < p.y + P.stand + 0.1) want = 1;
    this.crouchK += clamp(want - this.crouchK, -dt * 6, dt * 6);
    this.eyeH = THREE.MathUtils.lerp(P.stand, P.crouch, this.crouchK);
    // 目標速度
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);   // 右手在 −X（面向 +Z）
    const wish = new THREE.Vector3().addScaledVector(fwd, c.my).addScaledVector(right, c.mx);
    const wl = wish.length(); if (wl > 1) wish.divideScalar(wl);
    this.sprint = c.sprint && c.my > 0.3 && !c.ads && this.crouchK < 0.3;
    this.sprintK += clamp((this.sprint ? 1 : 0) - this.sprintK, -dt * 5, dt * 5);
    let vmax = this.sprint ? P.run : P.walk;
    if (c.ads) vmax = Math.min(vmax, P.adsV);
    vmax = THREE.MathUtils.lerp(vmax, P.crouchV, this.crouchK);
    if (c.slow) vmax *= c.slow;
    const tgt = wish.multiplyScalar(vmax);
    const h = new THREE.Vector3(this.vel.x, 0, this.vel.z);
    const k = this.grounded ? P.acc : P.air;
    const dv = tgt.sub(h), dl = dv.length(), mx = k * dt;
    if (dl > mx) dv.multiplyScalar(mx / dl);
    this.vel.x += dv.x; this.vel.z += dv.z;
    // 跳
    if (c.jump && this.grounded && this.crouchK < 0.5) { this.vel.y = P.jump; this.grounded = false; this.onJump && this.onJump(); }
    this.vel.y -= P.g * dt;
    // 移動（分兩步，避免穿牆）
    const n = Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.2) || 1;
    for (let i = 0; i < n; i++) {
      p.x += this.vel.x * dt / n; p.z += this.vel.z * dt / n;
      const bx = p.x, bz = p.z;
      S.pushOut(p, P.r, p.y, p.y + this.eyeH + P.head, P.step);
      // 撞牆：把速度裡朝牆的分量拿掉（沿牆滑）
      const px = p.x - bx, pz = p.z - bz, pl = Math.hypot(px, pz);
      if (pl > 1e-5) { const nx = px / pl, nz = pz / pl, vn = this.vel.x * nx + this.vel.z * nz; if (vn < 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; } }
    }
    p.y += this.vel.y * dt;
    // 地面／樓梯／頂到天花板
    const floor = S.floorAt(p.x, p.z, p.y + P.step, P.r * 0.6);
    const ceil = S.ceilAt(p.x, p.z, p.y + 0.4, P.r * 0.6);
    if (p.y + this.eyeH + P.head > ceil && this.vel.y > 0) { this.vel.y = 0; p.y = ceil - this.eyeH - P.head; }
    const was = this.grounded;
    if (p.y <= floor + 0.001 || (was && this.vel.y <= 0 && p.y - floor < 0.3)) {
      if (!was && this.airT > 0.25 && this.onLand) this.onLand(clamp(-this.vel.y / 12, 0, 1.5));
      p.y = floor; if (this.vel.y < 0) this.vel.y = 0; this.grounded = true; this.airT = 0;
    } else { this.grounded = false; this.airT += dt; }
    // 摩擦（沒按方向鍵時）
    if (this.grounded && wl < 0.1) { const f = Math.exp(-P.fric * dt); this.vel.x *= f; this.vel.z *= f; }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.moveK = clamp(sp / P.walk, 0, 1.6);
    // 腳步
    if (this.grounded && sp > 0.8) {
      this.stepPh += dt * sp / (this.sprint ? 1.9 : 1.45);
      if (this.stepPh >= 1) { this.stepPh -= 1; this.onStep && this.onStep(clamp(sp / P.run, 0, 1)); }
    }
    this.stam = clamp(this.stam + (this.sprint ? dt * 0.12 : -dt * 0.18), 0, 1);
    // 護盾回充
    this.hurtT += dt;
    if (this.hurtT > this.recovery.shieldDelay && !this.dead) {
      if (this.shield < P.shield) { if (this.shield <= 0 && this.onRecharge) this.onRecharge(); this.shield = Math.min(P.shield, this.shield + this.recovery.shieldRate * dt); }
      if (this.hp < this.recovery.healthFloor) this.hp = Math.min(this.recovery.healthFloor, this.hp + this.recovery.healthRate * dt);
    }
  }

  damage(d) {
    if (this.dead) return 0;
    this.hurtT = 0;
    const hadShield = this.shield > 0;
    const s = Math.min(this.shield, d); this.shield -= s; d -= s;
    if (hadShield && this.shield <= 0 && this.onShieldBreak) this.onShieldBreak();
    this.hp -= d;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return d;
  }
}
