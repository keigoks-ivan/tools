// 玩家機體的移動：走路、衝刺滑行、快速閃避、跳躍／上升、落地、撞建築、踩車
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export const P = {
  walk: 14, boost: 46, qb: 62, jump: 21, hoverAcc: 38, hoverMax: 17, g: 32, r: 3.4,
  en: 100, regen: 40, regenAir: 16, delay: 0.45,
  cBoost: 11, cBoostAir: 15, cHover: 17, cQB: 16, cJump: 6,
};

export class Player {
  // hooks：{ land(s), qb(dir), jump(), stomp(o), enOut(), hover(on) }
  constructor(mech, world, hooks = {}) {
    this.m = mech; this.world = world; this.hooks = hooks;
    this.pos = mech.root.position;
    this.vel = new THREE.Vector3();
    this.yaw = mech.legYaw; this.pitch = 0;
    this.grounded = true; this.airT = 0;
    this.en = P.en; this.enIdle = 0; this.overheat = 0;
    this.qbCd = 0; this.qbT = 0; this.qbDir = new THREE.Vector3();
    this.boosting = 0; this.hovering = 0; this.thrust = 0;
    this.dashT = 0; this.dashV = new THREE.Vector3();
    this.odT = 0;            // 覺醒剩餘秒數（>0 時 EN 不消耗）
    this.lockMove = 0;       // 重落地硬直
    this.speed = 0;
  }

  useEN(n) {
    if (this.odT > 0) return true;
    if (this.overheat > 0 || this.en <= 0) return false;
    this.en -= n; this.enIdle = 0;
    if (this.en <= 0) { this.en = 0; this.overheat = 1.6; if (this.hooks.enOut) this.hooks.enOut(); }
    return true;
  }

  // 光劍突進：強制往某方向衝 t 秒
  dash(dir, speed, t) { this.dashV.copy(dir).setY(0).normalize().multiplyScalar(speed); this.dashT = t; this.vel.y = Math.max(this.vel.y, dir.y * speed * 0.5); }

  update(dt, inp) {
    const H = this.hooks, w = this.world;
    // ---- 視角
    this.yaw -= inp.lookX;
    this.pitch = clamp(this.pitch - inp.lookY, -0.62, 0.72);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = _v.set(sy, 0, cy), right = _w.set(-cy, 0, sy);
    // ---- 想去的方向
    const wish = new THREE.Vector3().addScaledVector(fwd, inp.my).addScaledVector(right, inp.mx);
    const hasIn = wish.lengthSq() > 0.01;
    this.qbCd -= dt; this.qbT -= dt; this.overheat -= dt; this.enIdle += dt; this.lockMove -= dt; this.dashT -= dt;
    if (this.odT > 0) this.odT -= dt;

    // ---- 快速閃避（點一下 Shift）
    if (inp.qb && this.qbCd <= 0 && this.lockMove <= 0 && this.useEN(P.cQB)) {
      this.qbDir.copy(hasIn ? wish : fwd).normalize();
      this.vel.x = this.qbDir.x * P.qb; this.vel.z = this.qbDir.z * P.qb;
      if (!this.grounded) this.vel.y = Math.max(this.vel.y, 1.5);
      this.qbCd = 0.42; this.qbT = 0.2;
      if (H.qb) H.qb(this.qbDir);
    }
    // ---- 衝刺滑行（按住 Shift）
    const cost = this.grounded ? P.cBoost : P.cBoostAir;
    this.boosting = inp.boost && this.lockMove <= 0 && this.overheat <= 0 && this.useEN(cost * dt) ? 1 : 0;
    const vmax = this.boosting ? P.boost : P.walk;
    const target = new THREE.Vector3();
    if (hasIn) target.copy(wish).normalize().multiplyScalar(vmax * Math.min(1, wish.length()));
    else if (this.boosting) target.copy(fwd).multiplyScalar(vmax);
    if (this.lockMove > 0) target.set(0, 0, 0);
    // 加速度：地面反應快、空中慢；超速（閃避後）慢慢收
    const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z), sp = hv.length();
    let rate = this.grounded ? (hasIn || this.boosting ? (this.boosting ? 60 : 30) : 36) : (this.boosting ? 40 : 12);
    if (sp > vmax + 2) rate = this.grounded ? 42 : 20;
    if (this.qbT > 0) rate = 0;
    const dv = target.sub(hv);
    const L = dv.length(), mx = rate * dt;
    if (L > mx) dv.multiplyScalar(mx / L);
    this.vel.x += dv.x; this.vel.z += dv.z;
    if (this.dashT > 0) { this.vel.x = this.dashV.x; this.vel.z = this.dashV.z; }

    // ---- 跳躍、上升、重力
    if (inp.jump && this.grounded && this.lockMove <= 0 && this.useEN(P.cJump)) {
      this.vel.y = P.jump; this.grounded = false; this.airT = 0;
      if (H.jump) H.jump();
    }
    const hov = !this.grounded && inp.hover && this.airT > 0.12 && this.overheat <= 0 && this.useEN(P.cHover * dt);
    if (hov && !this.hovering && H.hover) H.hover(true);
    this.hovering = hov ? 1 : 0;
    if (!this.grounded) {
      this.airT += dt;
      this.vel.y -= P.g * dt;
      if (hov) this.vel.y = Math.min(P.hoverMax, this.vel.y + P.hoverAcc * dt);
      else if (this.boosting) this.vel.y = damp(this.vel.y, Math.max(this.vel.y, -4), 4, dt);   // 空中衝刺時幾乎不掉
      if (this.dashT > 0) this.vel.y = Math.max(this.vel.y, -2);
      this.vel.y = Math.max(this.vel.y, -60);
    }
    this.thrust = damp(this.thrust, Math.max(this.boosting, this.hovering, this.qbT > 0 ? 1 : 0, this.dashT > 0 ? 1 : 0), 12, dt);

    // ---- 移動＋碰撞
    const p = this.pos;
    const ox = p.x, oz = p.z;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt; p.y += this.vel.y * dt;
    const hit = w.collide(p, P.r, p.y);
    if (hit) {   // 撞牆：把往牆裡的速度扣掉
      const nx = p.x - (ox + this.vel.x * dt), nz = p.z - (oz + this.vel.z * dt), nl = Math.hypot(nx, nz);
      if (nl > 1e-4) { const d = (this.vel.x * nx + this.vel.z * nz) / nl; if (d < 0) { this.vel.x -= d * nx / nl; this.vel.z -= d * nz / nl; } }
    }
    const lim = 700;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    const ground = w.support(p.x, p.z, P.r, p.y);
    if (this.grounded) {
      if (ground < p.y - 1.6) { this.grounded = false; this.airT = 0.2; }   // 從屋頂走出去
      else { p.y = damp(p.y, ground, 25, dt); this.vel.y = 0; }
    } else if (p.y <= ground && this.vel.y <= 0) {
      const s = clamp(-this.vel.y / 26, 0, 1.6);
      p.y = ground; this.grounded = true;
      if (s > 0.9) this.lockMove = 0.28;
      this.vel.y = 0;
      if (H.land) H.land(s);
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- 踩扁路上的車、推倒樹和路燈
    if (this.grounded && this.speed > 2) w.stomp(p.x, p.z, this.boosting ? 6 : 4.2, this.vel.x, this.vel.z, H.stomp);
    else if (!this.grounded && p.y - ground < 3) w.stomp(p.x, p.z, 5, this.vel.x, this.vel.z, H.stomp);

    // ---- EN 回充
    if (this.enIdle > P.delay && this.overheat <= 0) this.en = Math.min(P.en, this.en + (this.grounded ? P.regen : P.regenAir) * dt);
    if (this.odT > 0) this.en = P.en;
  }

  // 給動作系統的狀態
  animState(aim) {
    return {
      vel: this.vel, grounded: this.grounded, boost: this.grounded ? Math.max(this.boosting, this.qbT > 0 ? 1 : 0) : 0,
      torsoYaw: this.yaw, pitch: this.pitch, thrust: this.thrust, aim, lean: this.dashT > 0 ? 0.25 : 0,
    };
  }
}
