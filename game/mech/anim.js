// 機體動作：腳用 IK（反向運動學＝給腳掌目標點、反算髖膝角度）真的踩在地上不滑；
// 重型機械的節奏：落腳時骨盆下沉＋機身震一下、重心左右移到支撐腳、加減速時上身慣性前傾後仰（會回彈）、
// 軀幹扭轉像伺服馬達（快、略過頭再停）、頭部「掃描—停住—再掃描」的機器人式轉頭、單眼沿滑軌快速跳動。
// 美術（外型）在 mechs.js；這個檔只管動。
import * as THREE from 'three';

const TAU = Math.PI * 2;
const LEGS = [['R', 0, -1], ['L', 0.5, 1]];
const GAITS = {
  grunt: { support: 0.68, stride: 3.6, max: 7.2, lift: 0.38, sway: 0.42, weight: 1, stance: 1.16, bend: 0.15 },
  ace: { support: 0.62, stride: 3.4, max: 7.2, lift: 0.48, sway: 0.3, weight: 0.8, stance: 1.12, bend: 0.2 },
  heavy: { support: 0.72, stride: 4.2, max: 7.8, lift: 0.28, sway: 0.5, weight: 1.35, stance: 1.24, bend: 0.25 },
};
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), _footQ = new THREE.Quaternion(), _parentQ = new THREE.Quaternion();
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function lerpAngle(a, b, t) { return a + wrap(b - a) * t; }
export function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }

// 彈簧（w＝快慢、z＝阻尼；z<1 會稍微過頭再回來，機械感的來源）
class Spring {
  constructor(w, z, x = 0) { this.w = w; this.z = z; this.x = x; this.v = 0; }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

// 兩段腿 IK：在髖部座標求大腿、小腿角度（膝蓋往前彎）
function legIK(out, Lt, Ls, a0, b0, dx, dy, dz) {
  const roll = Math.atan2(dx, -dy);
  const dv = Math.hypot(dx, dy);
  const d = clamp(Math.hypot(dv, dz), 0.2, (Lt + Ls) * 0.999);
  const phi = Math.atan2(dz, dv);
  const al = Math.acos(clamp((Lt * Lt + d * d - Ls * Ls) / (2 * Lt * d), -1, 1));
  const ga = Math.acos(clamp((Ls * Ls + d * d - Lt * Lt) / (2 * Ls * d), -1, 1));
  const hip = a0 - (phi + al);
  const knee = -hip + b0 - (phi - ga);
  out.hip = hip; out.knee = knee; out.roll = roll;
  return out;
}

export class MechMotion {
  constructor(m) {
    this.m = m;
    this.gait = m.stance ? null : GAITS[m.schemeKey] || GAITS.grunt;
    this.brace = 0;
    const b = m.bones, L = m.L;
    const th = b.kneeR.position, sh = b.ankleR.position;
    this.Lt = Math.hypot(th.y, th.z); this.Ls = Math.hypot(sh.y, sh.z);
    this.a0 = Math.atan2(th.z, -th.y); this.b0 = Math.atan2(sh.z, -sh.y);
    this.legLen = this.Lt + this.Ls;
    this.ankleY = L.pelvis + b.hipR.position.y + th.y + sh.y;   // 靜止時腳踝離地高度
    this.ankleZ = b.hipR.position.z + th.z + sh.z;
    this.toe = m.footToe || 2.3; this.heel = m.footHeel || 1.7;  // 腳踝到腳尖／腳跟距離（踮腳時抬高用）
    this.cyc = 0; this.g = 0; this.dir = 1;
    this.st = { R: true, L: true };
    this.feet = Object.fromEntries(['R', 'L'].map((n) => [n, { anchor: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), yaw: 0, fromYaw: 0, toYaw: 0, ready: false, stance: true, sampleT: 0, neutral: new THREE.Vector3(), neutralW: new THREE.Vector3() }]));
    this.rootPrev = null;
    this.t = Math.random() * 10;
    this.shock = 0;
    this.fPrev = 0; this.sPrev = 0; this.accF = 0; this.accS = 0;
    this.yawPrev = null;
    this.dip = new Spring(11, 0.42);
    this.lean = new Spring(6.5, 0.32); this.roll = new Spring(6.5, 0.34);
    this.twist = new Spring(15, 0.5);
    this.armLX = new Spring(8, 0.36); this.armLZ = new Spring(8, 0.4);
    this.headY = new Spring(16, 0.6); this.headX = new Spring(16, 0.6);
    this.eyeS = new Spring(26, 0.55);
    this.rec = new Spring(34, 0.35);
    if (this.gait) {
      this.dip.z = 0.85; this.lean.z = this.roll.z = 0.82; this.twist.z = 0.9;
      this.armLX.z = this.armLZ.z = this.headY.z = this.headX.z = this.rec.z = 0.85;
    }
    this.look = { y: 0, x: 0, eye: 0, next: 0.5, eyeNext: 0.2 };
    this.ik = { hip: 0, knee: 0, roll: 0 };
    m.footfall = 0; m.stepCount = 0; m.servo = 0;
  }

  // 外部撞擊／著地（0..1+）
  impact(s) { this.dip.v -= 5 * s; this.shock = Math.max(this.shock, Math.min(1.5, s)); }

  update(dt, st) {
    const m = this.m, b = m.bones, L = m.L, k = m.scale;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    m.footfall = 0; m.servo = 0;

    // ---- 腳的朝向：往移動方向；往後退時朝軀幹方向倒退走
    const sp = Math.hypot(st.vel.x, st.vel.z);
    if (sp > 1.5 && st.grounded && st.boost < 0.5) {
      let hd = Math.atan2(st.vel.x, st.vel.z);
      let diff = wrap(hd - st.torsoYaw);
      if (Math.abs(diff) > 1.9) hd = wrap(hd + Math.PI);
      diff = wrap(hd - st.torsoYaw);
      if (Math.abs(diff) > 1.2) hd = st.torsoYaw + Math.sign(diff) * 1.2;
      m.legYaw = lerpAngle(m.legYaw, hd, 1 - Math.exp(-dt * 5));
    } else {
      m.legYaw = lerpAngle(m.legYaw, st.torsoYaw, 1 - Math.exp(-dt * (st.boost > 0.5 ? 6 : 2.2)));
    }
    const yawRate = this.yawPrev === null ? 0 : wrap(m.legYaw - this.yawPrev) / Math.max(dt, 1e-4);
    this.yawPrev = m.legYaw;
    m.root.rotation.y = m.legYaw;
    const sL = Math.sin(m.legYaw), cL = Math.cos(m.legYaw);
    const fwd = (st.vel.x * sL + st.vel.z * cL) / k;
    const side = (st.vel.x * cL - st.vel.z * sL) / k;
    this.accF = damp(this.accF, (fwd - this.fPrev) / Math.max(dt, 1e-4), 10, dt);
    this.accS = damp(this.accS, (side - this.sPrev) / Math.max(dt, 1e-4), 10, dt);
    this.fPrev = fwd; this.sPrev = side;

    m.pose.boost = damp(m.pose.boost, st.grounded && st.boost > 0.5 ? 1 : 0, 8, dt);
    m.pose.air = damp(m.pose.air, st.grounded ? 0 : 1, 6, dt);
    const Bst = m.pose.boost, Air = m.pose.air;
    this.flight=damp(this.flight||0,st.flight||0,6,dt);
    const Flight=this.flight, flightSpeed=Flight*smooth(8,75,sp);
    const walkW = (1 - Bst) * (1 - Air);
    const P = this.gait, HR = !!m.stance;   // 主角機：衝刺／飛行用英雄機的誇張姿勢（前傾、雙腳往後拖、盾在前）

    // ---- 步態：週期 cyc（0..1），右腳 0 起步、左腳差半拍；支撐期依機種調整（兩腳同時著地的片刻＝沉重感）
    const af = Math.hypot(fwd, side);
    const vg = af + Math.abs(yawRate) * 3.2;                // 原地轉身也要踏步
    let settle = false, reachCrouch = 0;
    // 站姿：主角機靜止時兩腳張開、左腳在前、膝蓋微彎朝外（走起來收回一般步態）；toe＝腳尖外八
    const Sn = m.stance, idle = 1 - this.g;
    const sw = Sn ? lerp(Sn.w, 1.1, this.g) : lerp(P.stance, 1.04, this.g), toe = Sn ? Sn.toe * idle : 0.08 * idle, fw = Sn ? Sn.fwd * idle : 0.55 * idle;
    const fz = (n) => (n === 'L' ? fw : -fw * 0.5);
    for (const n of ['R', 'L']) {
      const foot = this.feet[n]; if (!foot.ready) continue;
      const dx = (foot.anchor.x - m.root.position.x) / k, dz = (foot.anchor.z - m.root.position.z) / k;
      const x = dx * cL - dz * sL - b['hip' + n].position.x, z = dx * sL + dz * cL - this.ankleZ;
      const d2 = x * x + z * z, xs = x + b['hip' + n].position.x * (1 - sw), zs = z - fz(n);
      if (af < 0.6 && Math.abs(yawRate) < 0.2 && xs * xs + zs * zs > 0.18) settle = true;
      if (foot.stance) reachCrouch = Math.max(reachCrouch, this.legLen - Math.sqrt(Math.max(4, this.legLen * this.legLen - d2)) + 0.35);
    }
    const gT = walkW * Math.max(smooth(0.6, 2.6, vg), settle ? 0.45 : 0);
    this.g = damp(this.g, gT, gT > this.g ? 5 : 3.5, dt);
    const g = this.g;
    const D = P ? P.support : 0.64;
    const S = P ? clamp(P.stride + af * 0.34, P.stride, P.max) : clamp(2.4 + af * 0.3, 2.4, 6.6);             // 步幅
    if (af > 0.4) this.dir = fwd < 0 ? -1 : 1;
    else if (Math.abs(yawRate) > 0.1) this.dir = 1;
    if (g > 0.02 || (!this.feet.R.stance || !this.feet.L.stance)) this.cyc += dt * Math.max(vg, 2.4) * D / S;
    this.cyc -= Math.floor(this.cyc);
    for (const [n, off] of [['R', 0], ['L', 0.5]]) {
      const f = this.feet[n];
      if (f.ready && !f.stance && (this.cyc + off) % 1 < D) {
        const dx = (f.to.x - m.root.position.x) / k, dz = (f.to.z - m.root.position.z) / k;
        const x = dx * cL - dz * sL - b['hip' + n].position.x, z = dx * sL + dz * cL - this.ankleZ;
        reachCrouch = Math.max(reachCrouch, this.legLen - Math.sqrt(Math.max(4, this.legLen * this.legLen - x * x - z * z)) + 0.35);
      }
    }
    this.supportDrop = Math.max(Math.min(1.8, reachCrouch), damp(this.supportDrop || 0, Math.min(1.8, reachCrouch), 8, dt));
    const crouch = Math.max(0.3 + (Sn ? Sn.bend : P.bend) * idle + this.brace * 0.12 * idle + g * Math.min(0.75, af * 0.045), this.supportDrop * walkW);    // 跑越快蹲越低
    const H = (P ? P.lift + Math.min(0.65, af * 0.035) : 0.55 + Math.min(1.2, af * 0.075)) * g;          // 抬腳高度

    // ---- 骨盆：落腳下沉、支撐期升起；重心移到支撐腳；隨步伐扭腰
    const pc = this.cyc * TAU;
    const bob = -(P ? 0.07 : 0.13) * g * Math.cos(2 * (pc - 0.15));
    const sway = -(P ? P.sway : 0.34) * g * Math.sin(pc - 0.45);
    m.landV += (-m.land * 90 - m.landV * 14) * dt;
    m.land = Math.max(-0.1, m.land + m.landV * dt);
    const dip = this.dip.step(0, dt);
    b.pelvis.position.set(sway, L.pelvis - crouch + bob + dip - Bst * (HR ? -0.9 : 0.8) - m.land * 1.3, 0);
    b.pelvis.rotation.set(0.05 * g * Math.min(1, af / 12) + (HR ? Bst * 0.3 + Air * 0.12 : 0), 0.045 * g * Math.sin(pc - 3.39) * this.dir, -sway * 0.06);
    b.pelvis.updateMatrix();
    _inv.copy(b.pelvis.matrix).invert();

    // ---- 雙腳：支撐腳固定世界位置，擺動腳預測半個支撐期後的落點。
    m.root.updateMatrixWorld(true);
    const teleported = this.rootPrev && this.rootPrev.distanceTo(m.root.position) > Math.max(8 * k, sp * dt * 3);
    if (!this.rootPrev) this.rootPrev = new THREE.Vector3();
    this.rootPrev.copy(m.root.position);
    const shake = Bst > 0.05 ? Math.sin(this.t * 61) * 0.015 * Bst : 0;
    for (const [n, off, sx] of LEGS) {
      const hp = b['hip' + n], foot = this.feet[n], u = (this.cyc + off) % 1;
      const neutral = foot.neutral.set(hp.position.x * sw, this.ankleY, this.ankleZ + fz(n));
      const neutralW = m.root.localToWorld(foot.neutralW.copy(neutral));
      const reset = !foot.ready || teleported || walkW < 0.25;
      if (reset) {
        if (P && st.grounded && st.groundAt && walkW > 0.6) neutralW.y = this.contactHeight(st, neutralW, k);
        foot.anchor.copy(neutralW); foot.from.copy(neutralW); foot.to.copy(neutralW);
        foot.yaw = foot.fromYaw = foot.toYaw = m.legYaw + sx * toe;
        foot.stance = true; foot.ready = true;
      }
      const inSt = u < D || (g < 0.015 && foot.stance);
      if (!inSt && foot.stance) {
        foot.from.copy(foot.anchor); foot.fromYaw = foot.yaw;
        const lead = Math.min(1.1, S / Math.max(vg, 2.4) * ((1 - D) / D + 0.5));
        const turn = clamp(yawRate * lead, -0.35, 0.35);
        foot.to.copy(neutral).applyAxisAngle(UP, turn); m.root.localToWorld(foot.to);
        foot.to.addScaledVector(st.vel, lead * walkW);
        foot.to.y = P && st.grounded && st.groundAt ? this.contactHeight(st, foot.to, k) : neutralW.y;
        foot.toYaw = m.legYaw + turn + sx * toe;
      }
      if (inSt && !foot.stance) {
        foot.anchor.copy(foot.to); foot.yaw = foot.toYaw;
        if (g > 0.25 && walkW > 0.6) {
          m.footfall = n === 'R' ? 1 : -1; m.stepCount++;
          const weight = (0.35 + Math.min(1, af / 16) * 0.55) * (P ? P.weight : 1);
          this.dip.v -= 1.65 * weight; this.shock = Math.max(this.shock, weight);
        }
      }
      foot.stance = inSt; this.st[n] = inSt;
      let pitch = 0, footYaw = foot.yaw;
      if (inSt) {
        // 固定支撐腳的水平落點；低頻更新地面高度，避免坡地或樓體倒塌後懸空。
        foot.sampleT -= dt;
        if (P && st.grounded && st.groundAt && foot.sampleT <= 0) {
          foot.anchor.y = this.contactHeight(st, foot.anchor, k); foot.sampleT = 0.15;
        }
        _v.copy(foot.anchor);
      }
      else {
        const w = (u - D) / (1 - D), e = w * w * w * (w * (w * 6 - 15) + 10);
        if (af < 0.6 && w < 0.85) {
          // 急停時收回水平落點，保留已採樣的地面高度。
          const y = foot.to.y; foot.to.lerp(neutralW, 1 - Math.exp(-dt * 10)); if (P) foot.to.y = y;
        }
        _v.lerpVectors(foot.from, foot.to, e);
        _v.y += H * k * Math.pow(Math.sin(Math.PI * w), 2);
        pitch = Math.sin(TAU * w) * 0.18 * g * this.dir;
        _v.y += k * ((pitch < 0 ? this.toe : this.heel) * Math.abs(Math.sin(pitch)) + this.ankleY * (Math.cos(pitch) - 1));
        footYaw = lerpAngle(foot.fromYaw, foot.toYaw, e);
      }
      // 腿長限制只處理急停或強制位移，正常支撐期不把腳拖回身體。
      m.root.worldToLocal(_v); _v.applyMatrix4(_inv);
      legIK(this.ik, this.Lt, this.Ls, this.a0, this.b0, _v.x - hp.position.x, _v.y - hp.position.y, _v.z - hp.position.z);
      let hipA = this.ik.hip, kneeA = this.ik.knee, roll = this.ik.roll;
      let ank = -(b.pelvis.rotation.x + hipA + kneeA) - pitch;
      // 衝刺滑行（一前一後、腳尖朝下）／空中（收腿）
      const r = n === 'R';
      // 主角機衝刺：身體往前壓、兩腳往後拖、腳尖朝下（貼地飛行）；空中：一腳收、一腳往後，像在飛
      const bh = HR ? (r ? 0.15 : 0.5) : r ? -0.38 : 0.28, bk = HR ? (r ? 0.75 : 1.25) : r ? 0.55 : 0.95, ba = HR ? (r ? 0.45 : 0.6) : r ? 0.05 : 0.35;
      const ah = HR ? (r ? -0.45 : 0.2) : r ? -0.6 : -0.12, ak = HR ? (r ? 1.0 : 1.1) : r ? 1.1 : 0.55, aa = HR ? (r ? 0.35 : 0.5) : r ? 0.2 : 0.4;
      const bw = Bst * (1 - Air), aw = Air;
      hipA = lerp(lerp(hipA, bh, bw), ah+flightSpeed*.45, aw) + shake;
      kneeA = lerp(lerp(kneeA, bk, bw), ak+flightSpeed*.25, aw) - shake;
      ank = lerp(lerp(ank, ba, bw), aa, aw);
      roll = lerp(roll, -sx * (HR ? 0.08 : 0.05), bw) * (1 - aw) + (-sx * (HR ? 0.16 : 0.1)) * aw;
      hipA -= m.land * 0.4; kneeA += m.land * 0.85; ank -= m.land * 0.45;
      hp.rotation.set(hipA, Sn ? sx * Sn.knee * idle * walkW : 0, roll, 'ZXY');
      b['knee' + n].rotation.x = kneeA;
      const ankle = b['ankle' + n];
      ankle.rotation.set(ank, 0, -roll - b.pelvis.rotation.z);
      if (walkW > 0.001) {
        hp.updateMatrixWorld(true);
        _footQ.setFromEuler(new THREE.Euler(-pitch, footYaw, 0, 'YXZ'));
        ankle.parent.getWorldQuaternion(_parentQ).invert();
        _footQ.premultiply(_parentQ);
        ankle.quaternion.slerp(_footQ, walkW);
      }
    }

    // ---- 軀幹：伺服扭轉（略過頭）＋加減速慣性（會回彈）＋落腳震動
    this.shock *= Math.exp(-dt * 8);
    m.recoil = Math.max(0, m.recoil - dt * 6);
    const rc = this.rec.step(m.recoil, dt);
    this.brace = damp(this.brace, P && st.aim ? clamp((st.brace || 0) + rc, 0, 1) : 0, 9, dt);
    const tw = wrap(st.torsoYaw - m.legYaw) - b.pelvis.rotation.y;
    const twist = this.twist.step(this.twist.x + wrap(tw - this.twist.x), dt);
    if (Math.abs(this.twist.v) > 2.5) m.servo = Math.min(1, Math.abs(this.twist.v) / 6);
    const leanT = clamp(this.accF * 0.02, -0.3, 0.3) + Bst * (HR ? 0.45 : 0.2) + Air * (HR ? 0.15 : 0.05) + flightSpeed*.4 + 0.04 * g * Math.min(1, af / 12) + (st.lean || 0) + (m.stance ? m.stance.chest * (1 - g) : 0);
    const rollT = clamp(-this.accS * 0.012, -0.2, 0.2) - Flight*clamp(yawRate*.16,-.32,.32) - (Bst > 0.3 ? side * 0.006 : 0) + sway * 0.05;
    const quake = this.shock * (P ? 0.006 : 0.02);
    b.torso.rotation.y = twist;
    b.torso.rotation.x = this.lean.step(leanT + (P ? this.brace * 0.06 - rc * 0.09 : 0), dt) + Math.sin(this.t * 47) * quake;
    b.torso.rotation.z = this.roll.step(rollT, dt) - b.pelvis.rotation.z * 0.8 + Math.sin(this.t * 39) * quake * 0.7;
    if (P) {
      b.torso.rotation.y -= 0.055 * g * Math.sin(pc) * this.dir;
      b.torso.rotation.z -= sway * 0.06;
    }
    if (HR) {
      // 走路時上身跟著步伐反向扭一點；站著時慢慢呼吸（機體不會完全僵住）
      b.torso.rotation.y += -0.07 * g * Math.sin(pc) * this.dir;
      b.torso.rotation.x += 0.012 * Math.sin(this.t * 1.7) * (1 - g) * walkW;
    }
    // 翼板：衝刺、飛行、推進時展開（往外放平、翼尖往前），平常收合
    if (m.wings) {
      this.wingO = damp(this.wingO || 0, Math.max(Bst, Air, m.thrust > 0.3 ? 1 : 0), 5, dt);
      const wo = this.wingO;
      for (const w of m.wings) { w.g.rotation.z = -w.sx * (.5*wo+.35*Flight); w.g.rotation.y = -w.sx * (.22*wo+.1*flightSpeed); w.g.rotation.x = .15*wo-.22*flightSpeed; }
    }

    // ---- 推進器
    m.thrust = damp(m.thrust, st.thrust || 0, 14, dt);
    const fl = 0.85 + Math.random() * 0.3;
    for (const f of m.flames) {
      const len = f.len * m.thrust * fl;
      f.g.visible = len > 0.05;
      f.g.scale.y = Math.max(0.01, len);
    }

    m.root.updateMatrixWorld(true);

    // ---- 頭：有目標就盯住；沒有就「轉—停—轉」掃描
    const lk = this.look;
    if (st.aim) {
      const lp = b.torso.worldToLocal(_v.copy(st.aim)).sub(b.head.position);
      lk.y = clamp(Math.atan2(lp.x, lp.z), -0.9, 0.9);
      lk.x = clamp(-Math.atan2(lp.y, Math.hypot(lp.x, lp.z)), -0.35, 0.3);
    } else if (this.t > lk.next) {
      lk.y = (Math.random() * 2 - 1) * 0.65; lk.x = (Math.random() - 0.4) * 0.3;
      lk.next = this.t + 0.8 + Math.random() * 2.4;
      m.servo = Math.max(m.servo, 0.5);
    }
    b.head.rotation.y = this.headY.step(lk.y, dt);
    b.head.rotation.x = this.headX.step(lk.x, dt);
    if (m.eye) {
      if (this.t > lk.eyeNext) { lk.eye = (Math.random() * 2 - 1) * 0.35; lk.eyeNext = this.t + 0.25 + Math.random() * 1.1; }
      const ea = clamp(this.eyeS.step(st.aim ? 0 : lk.eye, dt), -1.1, 1.1);
      const er = m.eyeRail || { r: 1.44, y: 1.05, sz: 1.08 };
      m.eye.position.set(Math.sin(ea) * er.r, er.y, Math.cos(ea) * er.r * er.sz);
    }

    // ---- 手臂
    this.aimArm(st.aim, st.pitch || 0, rc, dt, g);
    if (m.swing > 0) this.saberPose();
    else this.freeArm(dt, g, pc, Bst, Air);
  }

  contactHeight(st, p, k) {
    const y = st.groundAt(p.x, p.z);
    // 深落差交給移動／落地系統處理，IK 只適應兩公尺以內的腳下起伏。
    return (Number.isFinite(y) && Math.abs(y - this.m.root.position.y) <= 2 * k ? y : this.m.root.position.y) + this.ankleY * k;
  }

  // 右手持槍：有目標就前臂指向目標；沒有就槍口朝下的警戒姿勢
  aimArm(aim, pitch, rc, dt, g = 0) {
    const b = this.m.bones, sh = b.shoulderR, el = b.elbowR;
    let yaw, px, ex;
    if (aim) {
      const lp = b.torso.worldToLocal(_v.copy(aim)).sub(sh.position);
      yaw = clamp(Math.atan2(lp.x, lp.z) + 0.04, -1.0, 0.7);
      const pit = clamp(Math.atan2(lp.y + 1.5, Math.hypot(lp.x, lp.z)), -0.9, 1.0);
      px = -0.95 - pit; ex = -0.62;
    } else {
      yaw = 0.25; px = -0.45 - pitch * 0.5; ex = -0.95;
    }
    sh.rotation.y = damp(sh.rotation.y, yaw, 14, dt);
    sh.rotation.x = this.gait ? damp(sh.rotation.x, px + rc * 0.22, 14, dt) : damp(sh.rotation.x, px, 14, dt) + rc * 0.22;
    sh.rotation.z = damp(sh.rotation.z, !aim && this.m.stance ? lerp(this.m.stance.armR, 0.08, g) : 0.08, 10, dt);
    el.rotation.x = this.gait ? damp(el.rotation.x, ex - rc * 0.35, 14, dt) : damp(el.rotation.x, ex, 14, dt) - rc * 0.35;
  }
  // 左手：跟著步伐反向擺，帶一點慣性延遲
  freeArm(dt, g, pc, Bst, Air) {
    const m = this.m, b = m.bones, sh = b.shoulderL, el = b.elbowL;
    const swing = -Math.sin(pc) * (this.gait ? 0.13 : 0.22) * g * this.dir * (1 - this.brace * 0.75);
    sh.rotation.y = damp(sh.rotation.y, 0.1, 8, dt);
    const HR = !!m.stance;   // 主角機：衝刺時盾舉在身前；空中雙臂稍微張開保持平衡
    sh.rotation.x = this.armLX.step(-0.12 + swing - Bst * (HR ? 1.0 : 0.35) - Air * (HR ? 0.45 : 0.2) - this.brace * 0.65, dt);
    sh.rotation.z = this.armLZ.step((HR ? m.stance.armL : -0.1) + (HR ? Air * 0.3 - Bst * 0.15 : -Air * 0.18 - Bst * 0.08), dt);
    el.rotation.x = damp(el.rotation.x, -0.45 - g * 0.15 - Air * 0.4 - (HR ? Bst * 0.55 : 0) - this.brace * 0.55, 8, dt);
    if (m.saber) m.saber.visible = false;
  }
  saberPose() {
    const m = this.m, b = m.bones, sh = b.shoulderL, el = b.elbowL;
    const t = 1 - m.swing;
    const wind = t < 0.3 ? t / 0.3 : 1;
    const cut = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.25);
    const e = cut * cut * (3 - 2 * cut);
    sh.rotation.y = lerp(-0.2 - wind * 0.7, 0.9, e);
    sh.rotation.x = lerp(-0.4 - wind * 1.5, -1.3, e);
    sh.rotation.z = lerp(-0.3, 0.2, e);
    el.rotation.x = lerp(-1.1, -0.35, e);
    // 整個上身參與揮砍——蓄力時左肩往前、往右扭，砍下去時往左扭、往前壓
    const power = m.stance ? 1 : 0.75;
    b.torso.rotation.y += lerp(-0.45 * wind, 0.55, e) * power; b.torso.rotation.x += (0.08 * wind + 0.18 * e) * power;
    this.armLX.x = sh.rotation.x; this.armLX.v = 0;
    if (m.saber) m.saber.visible = true;
  }
}
