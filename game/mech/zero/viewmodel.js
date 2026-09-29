// 第一人稱武器：駕駛員的手臂（真人模型）＋長槍／手槍。舉槍、狙擊鏡、後座、晃動、換彈、跑步姿勢、換槍
//   視角場景（vScene）是鏡頭座標：鏡頭在原點看 −Z，右＝+X
import * as THREE from 'three';
import { Arms } from './human.js';
import { makeRifle, makePistol } from './guns.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const ease = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// 武器數值：dmg＝軀幹、head＝頭、limb＝四肢；rof＝最短射擊間隔；spread＝腰射散布（弧度）
export const WEAPONS = {
  rifle: { name: 'XLR-7 長槍', mag: 8, rof: 0.42, reload: 2.2, dmg: 125, head: 400, limb: 80, spread: 0.022, adsSpread: 0.0, fov: 20, kick: 0.05, auto: false, range: 300 },
  pistol: { name: 'XP-2 手槍', mag: 14, rof: 0.13, reload: 1.35, dmg: 38, head: 95, limb: 28, spread: 0.02, adsSpread: 0.004, fov: 54, kick: 0.018, auto: true, autoRof: 0.19, range: 120 },
};

export class ViewModel {
  constructor(kit, vScene, audio, fx) {
    this.vScene = vScene; this.audio = audio; this.fx = fx;
    this.arms = new Arms(kit);
    vScene.add(this.arms.root);
    this.g = { rifle: makeRifle(), pistol: makePistol() };
    this.holder = new THREE.Group(); vScene.add(this.holder);
    for (const k in this.g) { const m = this.g[k]; m.visible = k === 'rifle'; this.holder.add(m); m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); }
    this.cur = 'rifle';
    this.ammo = { rifle: WEAPONS.rifle.mag, pistol: WEAPONS.pistol.mag };
    this.cd = 0; this.reloadT = -1; this.swapT = -1; this.swapTo = null;
    this.ads = 0; this.adsWant = false; this.scoped = false;
    this.heat = 0;           // 長槍線圈發熱（發光）
    this.kick = new THREE.Vector3(); this.kickV = new THREE.Vector3();   // 後座（位置）
    this.rot = new THREE.Vector3(); this.rotV = new THREE.Vector3();     // 後座（角度）
    this.sway = new THREE.Vector2(); this.bobT = 0; this.t = 0;
    this.sprintK = 0; this.landK = 0;
    this.breath = 1; this.holding = false;    // 屏息：最多 3 秒
    this.lastTrigger = false;
    this.inspectT = -1;
    // 視角場景的燈：太陽（方向每幀跟著鏡頭轉）＋天光
    this.sun = new THREE.DirectionalLight(0xffc89a, 1.6); this.sun.position.set(1, 1, 1);
    this.hemi = new THREE.HemisphereLight(0x8fa6c8, 0x3a3028, 0.6);
    vScene.add(this.sun, this.hemi);
    this.shade = 1;
  }
  get W() { return WEAPONS[this.cur]; }
  get model() { return this.g[this.cur]; }
  get busy() { return this.reloadT >= 0 || this.swapT >= 0; }

  swap(to) {
    if (!to) to = this.cur === 'rifle' ? 'pistol' : 'rifle';
    if (to === this.cur || this.swapT >= 0) return;
    this.reloadT = -1; this.swapT = 0; this.swapTo = to;
    this.audio.swap();
  }
  reload() {
    if (this.reloadT >= 0 || this.swapT >= 0 || this.ammo[this.cur] >= this.W.mag) return;
    this.reloadT = 0; this.rstep = 0;
    this.audio.reload(this.cur, 'out');
  }

  // c：{fire, ads, reload, swap, swapTo, hold}；p：玩家；回傳這幀開的槍（或 null）
  update(dt, c, p, look) {
    this.t += dt;
    const W = this.W;
    let shot = null;
    // ---- 換槍
    if (c.swapTo) this.swap(c.swapTo); else if (c.swap) this.swap();
    if (this.swapT >= 0) {
      this.swapT += dt;
      if (this.swapT >= 0.24 && this.swapTo) { this.g[this.cur].visible = false; this.cur = this.swapTo; this.swapTo = null; this.g[this.cur].visible = true; this.audio.swap(); }
      if (this.swapT >= 0.58) this.swapT = -1;
    }
    // ---- 換彈
    if (c.reload) this.reload();
    if (this.reloadT >= 0) this._reloadStep(dt);
    // ---- 舉槍
    this.adsWant = c.ads && !this.busy && p.sprintK < 0.5;
    this.ads = clamp(this.ads + (this.adsWant ? dt / 0.2 : -dt / 0.16), 0, 1);
    const wasScoped = this.scoped;
    this.scoped = this.cur === 'rifle' && this.ads > 0.92;
    if (this.scoped !== wasScoped) this.audio.scope(this.scoped);
    // 屏息（只有狙擊鏡裡有用）
    this.holding = this.scoped && c.hold && this.breath > 0;
    if (this.holding) { if (!this._held) { this._held = true; this.audio.holdBreath(); } this.breath = Math.max(0, this.breath - dt / 3); }
    else { this._held = false; this.breath = Math.min(1, this.breath + dt / (this.breath <= 0 ? 5 : 2.5)); }
    // ---- 開槍
    this.cd -= dt;
    const trig = c.fire, press = trig && !this.lastTrigger;
    this.lastTrigger = trig;
    const wantFire = press || (W.auto && trig && this.cd < -(W.autoRof - W.rof));
    if (wantFire && !this.busy && this.cd <= 0 && p.sprintK < 0.35) {
      if (this.ammo[this.cur] <= 0) { if (press) { this.audio.dry(); this.reload(); } }
      else {
        this.ammo[this.cur]--; this.cd = W.rof;
        const spread = lerp(W.spread * (1 + p.moveK * 0.8 + (p.grounded ? 0 : 1.5)) * (1 - p.crouchK * 0.3), W.adsSpread, this.ads);
        shot = { weapon: this.cur, spread, W };
        if (this.cur === 'rifle') {
          this.audio.rifle(this.ads > 0.5);
          this.kickV.z += 2.4; this.kickV.y += 0.4; this.rotV.x += 4.5 + Math.random(); this.rotV.z += (Math.random() - 0.5) * 3; this.rotV.y += (Math.random() - 0.5) * 1.5;
          this.heat = Math.min(1.6, this.heat + 0.75);
        } else {
          this.audio.pistol();
          this.kickV.z += 1.1; this.kickV.y += 0.25; this.rotV.x += 3.2 + Math.random(); this.rotV.z += (Math.random() - 0.5) * 2;
          this.heat = Math.min(1.2, this.heat + 0.25);
        }
        this.flashT = 0.05;
        if (this.ammo[this.cur] === 0) setTimeout(() => this.ammo[this.cur] === 0 && this.reloadT < 0 && this.reload(), 250);
      }
    }
    this.heat = Math.max(0, this.heat - dt * (this.cur === 'rifle' ? 0.9 : 1.6));
    // ---- 彈簧（後座回正）
    const spring = (x, v, k, d) => { v.addScaledVector(x, -k * dt); v.multiplyScalar(Math.exp(-d * dt)); x.addScaledVector(v, dt); };
    spring(this.kick, this.kickV, 180, 16);
    spring(this.rot, this.rotV, 160, 13);
    // ---- 晃動：滑鼠轉動的延遲感＋走路擺動＋呼吸
    const adsK = 1 - this.ads * 0.85;
    this.sway.x = lerp(this.sway.x, clamp(-look.x * 1.6, -0.12, 0.12), 1 - Math.exp(-dt * 10));
    this.sway.y = lerp(this.sway.y, clamp(look.y * 1.6, -0.1, 0.1), 1 - Math.exp(-dt * 10));
    const sp = p.grounded ? p.moveK : 0;
    this.bobT += dt * (5.2 + p.sprintK * 3.3) * Math.min(1, sp);
    this.sprintK = lerp(this.sprintK, p.sprintK, 1 - Math.exp(-dt * 8));
    this.landK *= Math.exp(-dt * 7);
    this.flashT = (this.flashT || 0) - dt;
    this._pose(dt, sp, adsK);
    // 彈量燈、線圈發光
    const M = this.model, ud = M.userData;
    const n = this.ammo[this.cur];
    ud.ammoBar.forEach((b, i) => {
      const on = i < Math.round(n / W.mag * ud.ammoBar.length);
      b.material.color.copy(ud.glowBase).multiplyScalar(on ? 1 : 0.05);
      ud.ammoInstances.setColorAt(i, b.material.color);
    });
    ud.ammoInstances.instanceColor.needsUpdate = true;
    ud.glow.color.copy(ud.glowBase).multiplyScalar(0.55 + this.heat * 1.2 + (this.flashT > 0 ? 2 : 0));
    return shot;
  }

  _reloadStep(dt) {
    const W = this.W, t0 = this.reloadT, t1 = (this.reloadT += dt), T = W.reload, cur = this.cur;
    const at = (x) => t0 < x * T && t1 >= x * T;
    if (at(0.42)) this.audio.reload(cur, 'in');
    if (at(0.62)) this.audio.reload(cur, 'charge');
    if (at(0.84)) { this.audio.reload(cur, 'ready'); this.ammo[cur] = W.mag; }
    if (t1 >= T) { this.reloadT = -1; this.ammo[cur] = W.mag; }
  }

  // 槍的位置（鏡頭座標）
  _pose(dt, sp, adsK) {
    const M = this.model, ud = M.userData, rifle = this.cur === 'rifle';
    // 腰射位置、舉槍位置
    const hip = rifle ? new THREE.Vector3(0.17, -0.205, 0.15) : new THREE.Vector3(0.17, -0.19, -0.4);
    const ads = rifle ? new THREE.Vector3(0, -ud.scopeY, 0.08) : new THREE.Vector3(0, -ud.sightY, -0.36);
    const pos = hip.clone().lerp(ads, ease(this.ads));
    const rot = new THREE.Euler(0, Math.PI, 0, 'YXZ');
    // 腰射時槍口稍微往內
    rot.y += (1 - this.ads) * (rifle ? 0.04 : 0.06);
    // 走路擺動（8 字形）
    const b = this.bobT, bk = Math.min(1, sp) * adsK;
    pos.x += Math.sin(b) * 0.012 * bk; pos.y += -Math.abs(Math.cos(b)) * 0.014 * bk;
    rot.z += Math.sin(b) * 0.018 * bk;
    // 呼吸
    const br = 1 - (this.holding ? 0.9 : 0);
    pos.y += Math.sin(this.t * 1.6) * 0.0035 * adsK * br; pos.x += Math.sin(this.t * 0.8) * 0.002 * adsK * br;
    // 滑鼠延遲
    pos.x += this.sway.x * 0.06 * adsK; pos.y += this.sway.y * 0.05 * adsK;
    rot.y += this.sway.x * 0.35 * adsK; rot.x += this.sway.y * 0.3 * adsK;
    // 跑步：槍斜抱、往下
    const sk = this.sprintK;
    if (sk > 0.001) {
      pos.x += (rifle ? -0.02 : 0.02) * sk; pos.y += -0.06 * sk; pos.z += 0.04 * sk;
      rot.y += (rifle ? 0.75 : 0.5) * sk; rot.x += -0.3 * sk; rot.z += (rifle ? 0.35 : -0.2) * sk;
      pos.x += Math.sin(b) * 0.03 * sk; pos.y += -Math.abs(Math.cos(b)) * 0.03 * sk;
    }
    // 落地
    pos.y -= this.landK * 0.045; rot.x -= this.landK * 0.07; pos.z += this.landK * 0.018;
    // 後座
    pos.z += this.kick.z * 0.04 * (1 - this.ads * 0.5); pos.y += this.kick.y * 0.01;
    rot.x += this.rot.x * 0.02; rot.z += this.rot.z * 0.02; rot.y += this.rot.y * 0.02;
    // 換槍：放下再舉起
    if (this.swapT >= 0) { const u = this.swapT < 0.24 ? ease(this.swapT / 0.24) : 1 - ease((this.swapT - 0.24) / 0.34); pos.y -= 0.35 * u; rot.x -= 0.9 * u; }
    // 換彈：槍往左下翻轉
    let magOff = 0, lh = null;
    if (this.reloadT >= 0) {
      const u = this.reloadT / this.W.reload;
      const tilt = u < 0.12 ? ease(u / 0.12) : u < 0.8 ? 1 : 1 - ease((u - 0.8) / 0.2);
      pos.x -= 0.04 * tilt; pos.y += 0.085 * tilt; pos.z -= 0.12 * tilt;
      rot.z += (rifle ? 0.45 : 0.35) * tilt; rot.x -= 0.12 * tilt; rot.y += 0.12 * tilt;
      // 拔出與插入使用同一條軌跡，左手直接跟隨彈匣，避免重複位移。
      if (u < 0.12) magOff = 0;
      else if (u < 0.27) magOff = ease((u - 0.12) / 0.15) * 0.32;
      else if (u < 0.32) magOff = 0.32;
      else if (u < 0.42) magOff = 0.32 * (1 - ease((u - 0.32) / 0.1));
      else magOff = 0;
      // 左手路線（槍座標）：去彈匣 → 往下離開 → 拿新的回來 → 插入後拍一下 → 回護木
      lh = u;
    }
    // 開槍時發熱抖動
    if (this.heat > 1) pos.x += (Math.random() - 0.5) * 0.001 * this.heat;
    // 若在陰影中，視角場景的太陽變暗
    const H = this.holder;
    H.position.lerp(pos, 1); H.rotation.copy(rot);
    for (const k in this.g) { this.g[k].position.set(0, 0, 0); this.g[k].rotation.set(0, 0, 0); }
    ud.mag.position.copy(ud.magHome); ud.mag.visible = true;
    ud.mag.position.y -= magOff;
    if (lh !== null) ud.mag.visible = !(lh > 0.27 && lh < 0.32);
    H.updateMatrixWorld(true);
    this._hands(lh, magOff);
    // 狙擊鏡裡：手和槍都不畫
    const vis = !this.scoped;
    H.visible = vis; this.arms.root.visible = vis;
  }

  _hands(lh, magOff) {
    const M = this.model, ud = M.userData, G = this.arms.grip, rifle = this.cur === 'rifle';
    const wq = M.getWorldQuaternion(_q);
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(wq), U = new THREE.Vector3(0, 1, 0).applyQuaternion(wq), L = new THREE.Vector3(1, 0, 0).applyQuaternion(wq);
    M.localToWorld(G.R.copy(ud.gripR));
    G.RD.copy(F).addScaledVector(U, rifle ? -0.45 : -0.55).normalize();
    G.RS.copy(U).negate().addScaledVector(F, 0.35).normalize();
    G.curlR = 1;
    // 左手
    let lp = ud.gripL.clone();
    const R = L.clone().negate();
    let LD = rifle ? R.clone().addScaledVector(F, 0.45).addScaledVector(U, 0.2) : R.clone().multiplyScalar(0.6).addScaledVector(F, 0.2).addScaledVector(U, -0.6);
    let LS = rifle ? F.clone().negate() : F.clone().negate().addScaledVector(U, -0.3);
    let curlL = rifle ? 0.92 : 0.85;
    if (lh !== null) {
      const u = lh;
      const magP = ud.mag.position.clone().add(new THREE.Vector3(0.052, -0.07, -0.012));
      const charge = rifle ? new THREE.Vector3(0.05, 0.045, 0.56) : new THREE.Vector3(0.026, 0.035, -0.015);
      const home = ud.magHome.clone().add(new THREE.Vector3(0.052, -0.07, -0.012));
      let target;
      if (u < 0.12) target = lp.clone().lerp(home, ease(u / 0.12));
      else if (u < 0.44) target = magP;
      else if (u < 0.58) target = home.clone().lerp(charge, ease((u - 0.44) / 0.14));
      else if (u < 0.66) { target = charge.clone(); target.z -= Math.sin((u - 0.58) / 0.08 * Math.PI) * 0.035; }
      else target = charge.clone().lerp(lp, ease(clamp((u - 0.66) / 0.2, 0, 1)));
      lp = target;
      if (u > 0.08 && u < 0.5) { LD = U.clone().multiplyScalar(0.4).addScaledVector(F, 0.6).addScaledVector(L, 0.2); LS = L.clone().negate(); curlL = 0.85; }
    }
    M.localToWorld(G.L.copy(lp));
    G.LD.copy(LD).normalize(); G.LS.copy(LS).normalize(); G.curlL = curlL;
    this.arms.update();
  }

  // 世界座標的槍口（光束起點）：視角場景的點 → 鏡頭座標 → 世界
  muzzleWorld(camera, out = new THREE.Vector3()) {
    const M = this.model;
    M.localToWorld(out.copy(M.userData.muzzle));
    if (this.scoped) out.set(0.0, -0.08, -0.4);
    return out.applyMatrix4(camera.matrixWorld);
  }

  // 視角場景的燈跟著世界的太陽方向（鏡頭座標），在陰影裡就變暗
  light(camera, sunDir, envRot, inShade, dt) {
    this.shade = lerp(this.shade, inShade ? 0.25 : 1, 1 - Math.exp(-dt * 6));
    _q.copy(camera.quaternion).invert();
    this.sun.position.copy(sunDir).applyQuaternion(_q);
    this.sun.intensity = 1.6 * this.shade;
    this.hemi.intensity = 0.15 + 0.2 * this.shade;
    this.vScene.environmentIntensity = 0.25 + 0.3 * this.shade;
    if (this.vScene.environmentRotation) { _e.setFromQuaternion(_q); this.vScene.environmentRotation.copy(_e); }
  }
  land(k) { this.landK = Math.min(1.2, this.landK + k); }
  refill() { this.ammo.rifle = WEAPONS.rifle.mag; this.ammo.pistol = WEAPONS.pistol.mag; this.reloadT = -1; this.swapT = -1; }
}
