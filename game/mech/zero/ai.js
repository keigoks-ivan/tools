// 敵人：獵犬軍團步兵（步兵／指揮官／重裝兵／狙擊兵）＋偵察無人機
//   步兵：巡邏 → 察覺（警戒條）→ 找掩護 → 蹲著 → 探頭瞄準（紅色瞄準光）→ 點放 → 換位置；太近就邊退邊打
//   狙擊兵：守在高處，瞄準時拉出一條紅色雷射線（玩家看得到），充能 1.1 秒後開槍
//   聰明的地方：掩護點會避開同伴的方向（分散包抄）、偏好在玩家準心外側；被玩家用瞄準鏡對準會提早縮回；
//   玩家躲太久就有人摸過去找（往最後看到的位置），步兵／指揮官會丟手榴彈把人逼出來
import * as THREE from 'three';
import { Soldier, wrap, lerpAngle, damp } from './human.js';
import { makeEnemyRifle } from './guns.js';

const clamp = THREE.MathUtils.clamp, rr = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

// hp、移動速度、點放幾發、每發間隔、傷害、光彈速度、準度（越小越準）、體型
export const TYPES = {
  trooper: { hp: 150, walk: 1.6, run: 4.6, burst: [3, 5], gap: 0.2, dmg: 9, speed: 60, acc: 0.045, scale: 1, look: 'trooper', gun: 'carbine', score: 100, nades: 0.4 },
  officer: { hp: 250, walk: 1.6, run: 4.8, burst: [3, 6], gap: 0.15, dmg: 10, speed: 66, acc: 0.036, scale: 1.02, look: 'officer', gun: 'carbine', score: 250, nades: 2 },
  heavy: { hp: 650, walk: 1.2, run: 2.8, burst: [7, 12], gap: 0.1, dmg: 8, speed: 55, acc: 0.06, scale: 1.12, look: 'heavy', gun: 'heavy', armor: 0.6, score: 400 },
  sniper: { hp: 110, walk: 1.3, run: 3.8, burst: [1, 1], gap: 1, dmg: 50, speed: 150, acc: 0.005, scale: 1, look: 'sniper', gun: 'sniper', score: 300 },
};

const MAG = { trooper: 18, officer: 24, heavy: 40, sniper: 4 };

export class Trooper {
  constructor(G, def) {
    this.G = G; this.def = def;
    const T = (this.T = TYPES[def.type || 'trooper']);
    this.type = def.type || 'trooper';
    this.s = new Soldier(G.kit, T.look, { weapon: makeEnemyRifle(T.gun), scale: T.scale, world: G.solid });
    G.scene.add(this.s.root); G.scene.add(this.s.weapon);
    this.pos = this.s.pos; this.pos.set(def.x, def.y || 0, def.z);
    this.pos.y = G.solid.floorAt(def.x, def.z, (def.y || 0) + 0.5);
    this.s.yaw = this.s.aimYaw = this.s.bodyYaw = def.yaw ?? 0;
    this.hp = T.hp; this.dead = false;
    this.state = def.alert ? 'combat' : (def.patrol ? 'patrol' : 'idle');
    this.aware = def.alert ? 1 : 0;
    this.patrol = def.patrol || null; this.pi = 0; this.wait = rr(0.5, 2);
    this.goal = null; this.cover = null; this.coverT = 0; this.phase = 'move'; this.phaseT = 0;
    this.burst = 0; this.shotT = 0; this.aimT = 0; this.aimK = 0;
    this.mag = MAG[this.type] || 20; this.ammo = this.mag; this.stagger = 0;
    this.lastSeen = new THREE.Vector3(); this.seeT = 0; this.sees = false; this.losT = rr(0, 0.2);
    this.stuckT = 0; this.last = this.pos.clone();
    this.post = !!def.post;          // 守點：不離開
    this.id = G.nextId++;
    this.stepPh = 0;
    this.hitFlash = 0;
    if (this.type === 'sniper') { this.laser = new THREE.Mesh(LASER_GEO, laserMat()); this.laser.visible = false; G.scene.add(this.laser); }
    this.lastSpeak = -99;
    // 手榴彈（nades 小於 1＝有這個機率帶一顆）、多久沒看到玩家、被瞄準多久
    this.nades = T.nades ? (T.nades >= 1 ? T.nades : (Math.random() < T.nades ? 1 : 0)) : 0;
    this.notSeen = 0; this.hunt = false; this.aimedT = 0; this.duckAt = rr(0.3, 0.7);
  }
  get alive() { return !this.dead; }
  // 命中判定：跟著骨架的 16 段膠囊（頭、軀幹、肩、手臂、手、腿、腳），粗細照模型頂點量過，蓋住畫面上看得到的身體
  //   （原本只有頭、胸、腰三顆球＋大腿小腿中段，手臂、肩膀、膝蓋、腳打到都不算，看起來打中的只有七成算數）
  //   子彈先擦過手臂、後面 0.45 m 內接著打進軀幹或頭：算打到後面最先碰到的那個（瞄胸口不會因為舉槍的手擋在前面就只算打手）
  hitTest(o, d, maxT) {
    if (this.dead) return null;
    const s = this.s, sc = s.root.scale.x, B = s.B;
    _u.copy(this.pos); _u.y += 0.9 * sc;
    const tb = raySphere(o, d, _u, 1.35 * sc); if (tb < 0 || tb >= maxT) return null;   // 先用整個人的外接球篩：大部分敵人不在這條線上
    s.root.updateMatrixWorld(true);
    let first = null; const hs = [];
    for (const [a, b, ka, kb, r, part] of HITCAPS) {
      const A = B[a], Bb = B[b]; if (!A || !Bb) continue;
      const p = _v.setFromMatrixPosition(A.matrixWorld), q = _w.setFromMatrixPosition(Bb.matrixWorld);
      if (ka !== 0 || kb !== 1) { const qx = q.x - p.x, qy = q.y - p.y, qz = q.z - p.z; q.set(p.x + qx * kb, p.y + qy * kb, p.z + qz * kb); p.x += qx * ka; p.y += qy * ka; p.z += qz * ka; }
      const t = rayCapsule(o, d, p, q, r * sc);
      if (t < 0 || t >= maxT) continue;
      hs.push(t, part);
      if (!first || t < first.t) { first = { t, part }; this.legHit = /Leg|Foot/.test(a); }   // 打腿倒下的動作不同
    }
    if (first && first.part === 'limb') { let bt = 0.45 * sc; for (let i = 0; i < hs.length; i += 2) if (hs[i + 1] !== 'limb' && hs[i] - first.t < bt) { bt = hs[i] - first.t; first.part = hs[i + 1]; } }
    return first;
  }
  damage(dmg, dir, part, from) {
    if (this.dead) return false;
    const T = this.T, armored = !!(T.armor && part !== 'head');
    if (armored) dmg *= T.armor;
    this.hp -= dmg;
    this.s.impact(dir, clamp(dmg / 80, 0.3, 1.4), part === 'head');
    // 中彈：整個人亮一下（重裝兵裝甲擋下時是冷白色），頭上的血條亮 2.6 秒（hud.js）
    if (this.s.flash) this.s.flash(armored);
    this.hp0 = this.hp0 || T.hp; this.barT = 2.6;
    // 被打到會踉蹌退半步（重裝兵比較穩）
    if (dmg > 25) { this.stagger = this.type === 'heavy' ? 0.15 : 0.35; this.stagV = dir.clone().setY(0).normalize().multiplyScalar(this.type === 'heavy' ? 1 : 2.4); }
    this.hitFlash = 0.15;
    this.alert(from, 1);
    if (this.hp <= 0) {
      this.dead = true;
      this.s.die(dir, clamp(dmg / 120, 0.7, 1.6), part === 'head' ? 'head' : part === 'limb' && this.legHit ? 'legs' : 'chest', this.G.solid);
      if (this.laser) this.laser.visible = false;
      this.G.audio.bodyFall(this.pos);
      return true;
    }
    // 被打中：蹲回掩護或換位置
    if (this.phase === 'peek' && Math.random() < 0.5) { this.phase = 'hide'; this.phaseT = rr(0.8, 1.6); }
    return false;
  }
  alert(p, k = 1) {
    if (this.dead) return;
    this.aware = Math.min(1, this.aware + k);
    if (p) this.lastSeen.copy(p);
    if (this.aware >= 1 && this.state !== 'combat') {
      this.state = 'combat'; this.phase = 'move'; this.cover = null; this.coverT = 0;
      if (this.G.t - this.lastSpeak > 3) { this.lastSpeak = this.G.t; this.G.audio.radio('enemy', this.pos); }
      // 叫醒附近的同伴
      for (const e of this.G.enemies) if (e !== this && !e.dead && e.pos.distanceTo(this.pos) < 28) e.alert(p, 0.8);
    }
  }

  update(dt) {
    const G = this.G, s = this.s, T = this.T, P = G.player;
    this.hitFlash -= dt;
    if (this.dead) { s.update(dt); return; }
    const eye = G.playerEye;
    const dist = this.pos.distanceTo(P.pos);
    // ---- 看得到玩家嗎（每 0.2 秒測一次視線）
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.2;
      const head = s.headPos(new THREE.Vector3());
      const fwd = new THREE.Vector3(Math.sin(s.aimYaw), 0, Math.cos(s.aimYaw));
      const to = _v.subVectors(eye, head); const L = to.length(); to.divideScalar(L);
      const cone = this.state === 'combat' ? -1 : 0.05;
      const range = this.state === 'combat' ? 110 : 60;
      this.sees = L < range && to.dot(fwd) > cone && G.solid.sees(head, eye) && !P.dead;
      if (this.sees) { this.lastSeen.copy(P.pos); this.seeT += 0.2; } else this.seeT = 0;
    }
    // ---- 察覺：看得到就累積（越近越快；蹲著、在暗處慢一點）
    if (this.state !== 'combat') {
      if (this.sees) this.aware += dt * (2.3 / Math.max(1, dist / 7)) * (P.crouchK > 0.5 ? 0.55 : 1) * (P.sprint ? 1.5 : 1);
      else this.aware = Math.max(0, this.aware - dt * 0.06);
      if (this.aware >= 1) this.alert(P.pos, 1);
    }
    const mv = new THREE.Vector3();
    let speed = 0, face = s.yaw, mode = 'patrol';
    if (this.state === 'patrol' || this.state === 'idle') {
      if (this.patrol) {
        const tp = this.patrol[this.pi];
        _v.set(tp[0] - this.pos.x, 0, tp[1] - this.pos.z);
        if (_v.length() < 0.6) { this.wait -= dt; if (this.wait <= 0) { this.pi = (this.pi + 1) % this.patrol.length; this.wait = rr(1.5, 4); } }
        else { mv.copy(_v).normalize(); speed = T.walk; face = Math.atan2(_v.x, _v.z); }
      } else {
        // 站崗：偶爾左右看
        face = (this.def.yaw ?? 0) + Math.sin(G.t * 0.3 + this.id) * 0.6;
      }
      if (this.aware > 0.3) { face = Math.atan2(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z); speed = 0; }
      s.aimYaw = lerpAngle(s.aimYaw, face, 1 - Math.exp(-dt * 3));
      s.aimPitch = damp(s.aimPitch, 0, 3, dt);
      mode = 'patrol';
    } else {
      // ---- 戰鬥
      const toP = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      this.coverT -= dt; this.phaseT -= dt;
      const sniper = this.type === 'sniper';
      // 多久沒看到玩家：躲太久就派人摸過去（往最後看到的位置找掩護）、丟手榴彈
      if (this.sees) { this.notSeen = 0; this.hunt = false; } else this.notSeen += dt;
      if (!this.post && !sniper && !this.hunt && this.notSeen > 5 && this.type !== 'heavy') { this.hunt = true; this.cover = null; this.coverT = 0; }
      if (this.nades > 0 && !this.sees && this.notSeen > 3 && G.throwGrenade && G.t - (G.lastNade ?? -99) > 8) {
        const dL = this.pos.distanceTo(this.lastSeen);
        if (dL > 7 && dL < 24) { this.nades--; G.lastNade = G.t; G.throwGrenade(s.headPos(new THREE.Vector3()).add(_w.set(0, 0.3, 0)), this.lastSeen.clone(), this); this.phase = 'hide'; this.phaseT = rr(0.8, 1.4); }
      }
      if (!this.post && (!this.cover || this.coverT <= 0 || (this.phase !== 'move' && dist < 5))) {
        this.cover = this.findCover(this.hunt); this.coverT = this.hunt ? rr(4, 7) : rr(6, 11); this.phase = 'move';
      }
      if (this.post && !this.cover) { this.cover = this.pos.clone(); this.phase = 'hide'; this.phaseT = rr(0.5, 1.5); }
      if (this.phase === 'move') {
        _v.set(this.cover.x - this.pos.x, 0, this.cover.z - this.pos.z);
        const L = _v.length();
        if (L < 0.5) { this.phase = 'hide'; this.phaseT = rr(0.3, 0.9); }
        else {
          mv.copy(_v).divideScalar(L);
          speed = L > 3 ? T.run : T.walk * 1.4;
          // 移動中看得到玩家：邊走邊打（不跑時）
          mode = speed > T.walk * 2 ? 'run' : 'aim';
        }
        face = toP;
      } else if (this.phase === 'hide') {
        s.crouchT = this.cover && this.cover.crouch ? 1 : 0;
        mode = 'patrol';
        face = toP;
        if (this.cover && this.cover.side) { mv.copy(this.cover.side).multiplyScalar(-1); }   // 靠牆那側
        if (this.phaseT <= 0) { this.phase = 'peek'; this.phaseT = rr(2.6, 4.4); this.burst = 0; this.aimT = 0; this.aimedT = 0; this.duckAt = rr(0.3, 0.7); }
      } else if (this.phase === 'peek') {
        s.crouchT = this.cover && this.cover.crouch && this.cover.peekCrouch ? 1 : 0;
        mode = 'aim'; face = toP;
        if (this.cover && this.cover.peek) { _v.set(this.cover.peek.x - this.pos.x, 0, this.cover.peek.z - this.pos.z); if (_v.length() > 0.2) { mv.copy(_v).normalize(); speed = 1.6; } }
        if (this.phaseT <= 0 || (this.burst <= 0 && this.aimT > 3)) { this.phase = 'hide'; this.phaseT = rr(0.7, 1.8); if (Math.random() < 0.3) this.coverT = 0; }
        // 被玩家用瞄準鏡對準（準心 3 度以內）一下子就縮回去，有時直接換位置
        if (this.sees && G.ads > 0.6 && G.aimDir && !this.post) {
          const to = s.chestPos(_u).sub(G.playerEye).normalize();
          if (to.dot(G.aimDir) > 0.9986) this.aimedT += dt; else this.aimedT = Math.max(0, this.aimedT - dt);
          if (this.aimedT > this.duckAt && this.burst <= 0) { this.phase = 'hide'; this.phaseT = rr(0.7, 1.3); this.aimedT = 0; if (Math.random() < 0.35) this.coverT = 0; }
        }
      }
      // 守點的（樓頂狙擊手、貨櫃牆上的兵）被打得踉蹌後走回原位：不然一路被推到樓頂裡面，看不到也打不到，這段就清不完
      if (this.post && this.stagger <= 0) { _v.set(this.def.x - this.pos.x, 0, this.def.z - this.pos.z); if (_v.length() > 0.3) { mv.copy(_v).normalize(); speed = T.walk; } }
      // 太近：退後＋側移，邊打
      if (dist < 4.5 && !this.post) {
        mv.set(this.pos.x - P.pos.x, 0, this.pos.z - P.pos.z).normalize().add(_v.set(Math.cos(G.t + this.id), 0, Math.sin(G.t + this.id)).multiplyScalar(0.6)).normalize();
        speed = T.walk * 1.6; mode = 'aim'; s.crouchT = 0; this.phase = 'peek'; this.phaseT = Math.max(this.phaseT, 0.5);
      }
      // 瞄準：看得到（或剛看不到）時對準玩家身體
      const aimTgt = this.sees ? eye.clone().add(_w.set(0, -0.35, 0)) : this.lastSeen.clone().add(_w.set(0, 1.2, 0));
      const mz = s.chestPos(new THREE.Vector3());
      const dy = aimTgt.y - mz.y, dh = Math.hypot(aimTgt.x - mz.x, aimTgt.z - mz.z);
      s.aimYaw = lerpAngle(s.aimYaw, Math.atan2(aimTgt.x - mz.x, aimTgt.z - mz.z), 1 - Math.exp(-dt * (mode === 'aim' ? 10 : 5)));
      s.aimPitch = damp(s.aimPitch, Math.atan2(dy, dh), 6, dt);
      // 開槍
      if (mode === 'aim' && this.sees) {
        this.aimT += dt;
        const ready = sniper ? 1.1 : rr(0.22, 0.4);
        if (this.burst <= 0 && this.aimT > ready && G.canShoot(this) && s.reloadT < 0 && this.stagger <= 0) { this.burst = Math.min(this.ammo, Math.round(rr(T.burst[0], T.burst[1] + 0.99))); this.shotT = 0; }
        if (this.burst > 0) {
          this.shotT -= dt;
          if (this.shotT <= 0) {
            this.fire(aimTgt); this.burst--; this.ammo--; this.shotT = T.gap * rr(0.8, 1.3);
            if (this.burst <= 0) { this.aimT = sniper ? -0.6 : rr(-0.8, -0.2); }
            // 彈匣打空：蹲回掩護換彈
            if (this.ammo <= 0) { this.burst = 0; s.reloadT = 0; this.ammo = this.mag; if (this.phase === 'peek') { this.phase = 'hide'; this.phaseT = 1.8; } G.audio.reload && Math.random() < 0.5 && this.pos.distanceTo(P.pos) < 18 && G.audio.radio('enemy', this.pos); }
          }
        }
      } else if (!this.sees) this.aimT = Math.max(0, this.aimT - dt * 2);
      if (sniper) this._laser(mode === 'aim' && this.sees && this.burst <= 0, aimTgt);
    }
    if (mode !== 'aim' && this.phase !== 'hide') s.crouchT = 0;
    // ---- 移動＋碰撞＋同伴分開
    for (const e of G.enemies) {
      if (e === this || e.dead || !e.pos) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.8 && d2 > 1e-6) { const d = Math.sqrt(d2); mv.x += dx / d * 0.8; mv.z += dz / d * 0.8; }
    }
    const want = mv.multiplyScalar(speed);
    if (this.stagger > 0) { this.stagger -= dt; want.copy(this.stagV); }
    // 從高掩體側邊探頭時身體側傾
    s.lean = 0;
    if (this.phase === 'peek' && this.cover && this.cover.peek) { const side = (this.cover.peek.x - this.cover.x) * Math.cos(s.bodyYaw) - (this.cover.peek.z - this.cover.z) * Math.sin(s.bodyYaw); s.lean = side > 0 ? -1 : 1; }
    s.vel.x = damp(s.vel.x, want.x, 8, dt); s.vel.z = damp(s.vel.z, want.z, 8, dt);
    this.pos.x += s.vel.x * dt; this.pos.z += s.vel.z * dt;
    G.solid.pushOut(this.pos, 0.32, this.pos.y, this.pos.y + 1.7, 0.45);
    this.pos.y = G.solid.floorAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.1);
    // 卡住：換目標
    if (speed > 0.5) { this.stuckT += dt; if (this.stuckT > 1) { if (this.pos.distanceTo(this.last) < 0.3) { this.cover = null; this.coverT = 0; if (this.patrol) this.pi = (this.pi + 1) % this.patrol.length; } this.stuckT = 0; this.last.copy(this.pos); } }
    s.yaw = face; s.mode = mode;
    // 腳步聲
    const sp = Math.hypot(s.vel.x, s.vel.z);
    if (sp > 0.6) { this.stepPh += dt * sp / 1.5; if (this.stepPh > 1) { this.stepPh -= 1; if (dist < 25) G.audio.trooperStep(this.pos); } }
    // 遠的少做程序層
    s.update(dt, dist > 45);
  }

  fire(tgt) {
    const G = this.G, s = this.s, T = this.T;
    const m = s.muzzle(new THREE.Vector3());
    const dist = m.distanceTo(tgt);
    // 準度：距離、玩家移動、蹲、難度
    const P = G.player;
    let spread = T.acc * (1 + P.moveK * 0.6) * (P.crouchK > 0.5 ? 0.85 : 1) * G.diff.acc;
    if (this.type !== 'sniper') spread *= clamp(dist / 12, 0.6, 1.6);
    // 預判：稍微領先玩家移動
    const lead = dist / T.speed * 0.85;
    const t = tgt.clone().addScaledVector(P.vel, lead);
    const d = t.sub(m).normalize();
    d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 1.4; d.z += (Math.random() - 0.5) * spread * 2;
    d.normalize();
    G.bolt(m, d, T.speed, T.dmg * G.diff.dmg, this);
    s.recoil = 1;
    const kind = this.type === 'sniper' ? 'sniper' : this.type === 'heavy' ? 'heavy' : 'rifle';
    G.audio.enemyShot(m, kind);
    G.fx.muzzle(m, d, [3.2, 0.5, 0.25], this.type === 'sniper');
  }

  _laser(on, tgt) {
    const L = this.laser;
    if (!on) { L.visible = false; this.glint = false; return; }
    const m = this.s.muzzle(new THREE.Vector3());
    const d = _v.subVectors(tgt, m); const len = d.length(); d.normalize();
    const hit = this.G.solid.ray(m, d, len);
    const l = hit ? hit.t : len;
    L.visible = true;
    L.position.copy(m).addScaledVector(d, l / 2);
    L.quaternion.setFromUnitVectors(_w.set(0, 1, 0), d);
    L.scale.set(1, l, 1);
    L.material.opacity = 0.35 + 0.35 * Math.min(1, this.aimT / 1.4);
    if (!this.glint) { this.glint = true; this.G.audio.sniperGlint(m); }
  }

  // 找掩護：附近矮牆／貨櫃／車子背對玩家那一側；看不到（蹲著）又能探頭
  // hunt＝去找躲起來的玩家：以最後看到的位置為準、要近一點、要能看到那裡（不偷看玩家真正的位置）
  findCover(hunt = false) {
    const G = this.G, S = G.solid, P = G.player, eye = hunt ? this.lastSeen.clone().add(new THREE.Vector3(0, 1.5, 0)) : G.playerEye;
    const PP = hunt ? this.lastSeen : P.pos;
    // 同伴在玩家哪個方向（包抄：不要擠在同一邊）
    const mates = [];
    for (const e of G.enemies) if (e !== this && !e.dead && e.state === 'combat' && e.pos) mates.push(Math.atan2(e.pos.x - PP.x, e.pos.z - PP.z));
    const aimA = G.aimDir ? Math.atan2(G.aimDir.x, G.aimDir.z) : null;
    const R = 16, cands = [];
    const boxes = S.near(this.pos.x, this.pos.z, R, []);
    for (const b of boxes) {
      const h = b.y1 - b.y0, fx = b.x1 - b.x0, fz = b.z1 - b.z0;
      if (b.ramp || b.y0 > this.pos.y + 0.3 || h < 0.75 || fx > 14 || fz > 14 || b.y1 < this.pos.y + 0.7) continue;
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const away = _v.set(cx - PP.x, 0, cz - PP.z).normalize();
      // 四個面中背對玩家的點
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (nx * away.x + nz * away.z < 0.3) continue;
        const along = rr(-0.35, 0.35);
        const px = nx !== 0 ? (nx > 0 ? b.x1 + 0.55 : b.x0 - 0.55) : cx + along * fx;
        const pz = nz !== 0 ? (nz > 0 ? b.z1 + 0.55 : b.z0 - 0.55) : cz + along * fz;
        const p = new THREE.Vector3(px, S.floorAt(px, pz, this.pos.y + 0.5), pz);
        if (Math.abs(p.y - this.pos.y) > 0.6) continue;
        if (S.pushOut(p.clone(), 0.3, p.y, p.y + 1.6, 0.45)) continue;
        const low = b.y1 - p.y < 1.7;
        const hidden = !S.sees(eye, _w.set(p.x, p.y + (low ? 0.95 : 1.5), p.z));
        let peek = null, peekOK = false;
        if (low) peekOK = S.sees(eye, _w.set(p.x, p.y + 1.5, p.z));
        else {
          // 高的：往旁邊跨一步探頭
          const side = new THREE.Vector3(-nz, 0, nx);
          for (const sg of [1, -1]) {
            const q = p.clone().addScaledVector(side, sg * ((nx !== 0 ? fz : fx) / 2 + 0.2));
            if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 5) continue;
            if (S.sees(eye, _w.set(q.x, q.y + 1.5, q.z))) { peek = q; peekOK = true; break; }
          }
        }
        const dp = p.distanceTo(PP), dm = p.distanceTo(this.pos);
        if (dp < 5) continue;
        let sc = (hidden ? 3 : 0) + (peekOK ? 2 : 0) - dm * 0.12 - Math.abs(dp - (this.type === 'sniper' ? 30 : hunt ? 8 : 14)) * (hunt ? 0.12 : 0.05) + Math.random() * 0.6;
        const ang = Math.atan2(p.x - PP.x, p.z - PP.z);
        for (const m of mates) { const d = Math.abs(wrap(ang - m)); if (d < 0.6) sc -= (0.6 - d) * 2.5; }
        if (aimA !== null && Math.abs(wrap(ang - aimA)) > 1.0) sc += 0.8;   // 不在玩家準心前面
        for (const e of G.enemies) if (e !== this && !e.dead && e.cover && e.cover.distanceTo(p) < 1.6) sc -= 4;
        cands.push({ p, sc, crouch: low, peekCrouch: false, peek, side: null });
      }
    }
    cands.sort((a, b) => b.sc - a.sc);
    if (cands.length && cands[0].sc > 1) { const c = cands[0]; const v = c.p; v.crouch = c.crouch; v.peek = c.peek; v.peekCrouch = c.peekCrouch; return v; }
    // 沒掩護：往側邊找個位置
    const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + rr(-1, 1);
    const d = clamp(this.pos.distanceTo(P.pos), 8, 18);
    const v = new THREE.Vector3(P.pos.x + Math.sin(a) * d, this.pos.y, P.pos.z + Math.cos(a) * d);
    S.pushOut(v, 0.4, v.y, v.y + 1.7, 0.45);
    v.crouch = false;
    return v;
  }

  dispose() {
    const G = this.G;
    G.scene.remove(this.s.root); G.scene.remove(this.s.weapon);
    if (this.laser) G.scene.remove(this.laser);
  }
}

const LASER_GEO = new THREE.CylinderGeometry(0.004, 0.004, 1, 5, 1, true).translate(0, 0, 0);
let _lm = null;
function laserMat() { return (_lm = _lm || new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); }

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc; if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : (cc < 0 ? 0 : -1);
}
// 射線打膠囊（線段 a→b、半徑 r，d 是單位向量）：回傳進入的距離，沒打到 −1
export function rayCapsule(o, d, a, b, r) {
  const bx = b.x - a.x, by = b.y - a.y, bz = b.z - a.z, ox = o.x - a.x, oy = o.y - a.y, oz = o.z - a.z;
  const bb = bx * bx + by * by + bz * bz, bd = bx * d.x + by * d.y + bz * d.z, bo = bx * ox + by * oy + bz * oz;
  const A = bb - bd * bd;
  if (A > 1e-9) {
    const B = bb * (d.x * ox + d.y * oy + d.z * oz) - bo * bd, C = bb * (ox * ox + oy * oy + oz * oz) - bo * bo - r * r * bb, h = B * B - A * C;
    if (h < 0) return -1;
    const t = (-B - Math.sqrt(h)) / A, y = bo + t * bd;
    if (y > 0 && y < bb) return t >= 0 ? t : -1;   // 打在圓柱段
  }
  // 兩端的球
  const t0 = raySphere(o, d, a, r), t1 = raySphere(o, d, b, r);
  return t0 < 0 ? t1 : t1 < 0 ? t0 : Math.min(t0, t1);
}
// 士兵的命中膠囊：[骨頭 a, 骨頭 b, 從 a 往 b 的起點比例, 終點比例, 半徑（公尺，×體型）, 部位]
const HITCAPS = [
  ['Head', 'HeadTop_End', 0.3, 0.6, 0.125, 'head'],
  ['Hips', 'Spine2', 0, 1, 0.18, 'body'], ['LeftArm', 'RightArm', 0, 1, 0.1, 'body'],
  ...['Left', 'Right'].flatMap((s) => [
    [s + 'Arm', s + 'ForeArm', 0, 1, 0.09, 'limb'], [s + 'ForeArm', s + 'Hand', 0, 1, 0.075, 'limb'], [s + 'Hand', s + 'HandMiddle1', 0, 1.6, 0.065, 'limb'],
    [s + 'UpLeg', s + 'Leg', 0, 1, 0.135, 'limb'], [s + 'Leg', s + 'Foot', 0, 1, 0.095, 'limb'], [s + 'Foot', s + 'Toe_End', 0, 1, 0.065, 'limb'],
  ]),
];

// ---------------------------------------------------------------- 無人機
let DRONE = null;
function droneParts() {
  if (DRONE) return DRONE;
  const body = new THREE.MeshStandardMaterial({ color: 0x3e4533, roughness: 0.55, metalness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.25) });
  const g = {
    hull: new THREE.SphereGeometry(0.28, 20, 14).scale(1, 0.55, 1.25),
    ring: new THREE.TorusGeometry(0.22, 0.035, 8, 24).rotateX(Math.PI / 2),
    arm: new THREE.BoxGeometry(0.9, 0.04, 0.08),
    rotor: new THREE.CylinderGeometry(0.2, 0.2, 0.01, 18),
    eye: new THREE.SphereGeometry(0.06, 12, 8),
    gun: new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8).rotateX(Math.PI / 2),
    fin: new THREE.BoxGeometry(0.02, 0.14, 0.2),
  };
  const rotorM = new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.35, roughness: 0.4, depthWrite: false });
  return (DRONE = { body, dark, eye, rotorM, g });
}

export class Drone {
  constructor(G, def) {
    this.G = G; this.def = def; this.type = 'drone';
    const D = droneParts();
    const root = (this.root = new THREE.Group());
    const hull = new THREE.Mesh(D.g.hull, D.body); root.add(hull);
    const eye = new THREE.Mesh(D.g.eye, D.eye); eye.position.set(0, -0.04, 0.32); root.add(eye);
    const gun = new THREE.Mesh(D.g.gun, D.dark); gun.position.set(0, -0.14, 0.2); root.add(gun);
    const fin = new THREE.Mesh(D.g.fin, D.dark); fin.position.set(0, 0.1, -0.3); root.add(fin);
    this.rotors = [];
    for (const a of [0.785, 2.356, 3.927, 5.498]) {
      const arm = new THREE.Mesh(D.g.arm, D.dark); arm.rotation.y = a; arm.position.y = 0.02; root.add(arm);
      const x = Math.cos(a) * 0.42, z = -Math.sin(a) * 0.42;
      const ring = new THREE.Mesh(D.g.ring, D.body); ring.position.set(x, 0.03, z); root.add(ring);
      const r = new THREE.Mesh(D.g.rotor, D.rotorM); r.position.set(x, 0.03, z); root.add(r); this.rotors.push(r);
    }
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(root);
    this.pos = root.position; this.pos.set(def.x, def.y || 4, def.z);
    this.vel = new THREE.Vector3();
    this.hp = 90; this.dead = false; this.id = G.nextId++;
    this.yaw = def.yaw ?? 0; this.tilt = 0; this.t = rr(0, 10);
    this.state = def.alert ? 'combat' : 'patrol'; this.aware = def.alert ? 1 : 0; this.sees = false; this.losT = 0;
    this.shotT = rr(1, 2); this.burst = 0; this.home = this.pos.clone(); this.goal = this.pos.clone(); this.goalT = 0;
    this.fallV = 0;
  }
  get alive() { return !this.dead; }
  hitTest(o, d, maxT) { if (this.dead) return null; const t = raySphere(o, d, this.pos, 0.55); return t >= 0 && t < maxT ? { t, part: 'body' } : null; }
  damage(dmg, dir) {
    if (this.dead) return false;
    this.hp -= dmg; this.vel.addScaledVector(dir, 3); this.alert(this.G.player.pos, 1);
    this.hp0 = this.hp0 || 90; this.barT = 2.6;   // 血條（hud.js）
    this.G.fx.spray(this.pos, dir.clone().negate(), 8);
    if (this.hp <= 0) { this.dead = true; this.fallV = 1; this.spin = rr(-6, 6); this.G.audio.droneStop(this.id); return true; }
    return false;
  }
  alert(p, k = 1) { this.aware = Math.min(1, this.aware + k); if (this.aware >= 1) this.state = 'combat'; }
  update(dt) {
    const G = this.G, P = G.player;
    this.t += dt;
    for (const r of this.rotors) r.rotation.y += dt * (this.dead ? 8 : 60);
    if (this.dead) {
      // 冒煙墜落，撞地爆炸
      if (this.gone) return;
      this.vel.y -= 9.8 * dt; this.pos.addScaledVector(this.vel, dt);
      this.root.rotation.y += this.spin * dt; this.root.rotation.z += dt * 2;
      if (Math.random() < 0.5) G.fx.puff(this.pos, [0.15, 0.14, 0.13], 0.5);
      const fl = G.solid.floorAt(this.pos.x, this.pos.z, this.pos.y + 0.2);
      if (this.pos.y < fl + 0.25 || G.solid.pushOut(this.pos.clone(), 0.3, this.pos.y - 0.2, this.pos.y + 0.2)) {
        if (G.destruct) G.destruct.explode(this.pos.clone(), 0.7); else { G.fx.explode(this.pos, 0.8); G.audio.explosion(this.pos, 0.6); G.splash(this.pos, 3, 30); }
        this.gone = true; this.root.visible = false;
      }
      return;
    }
    const eye = G.playerEye;
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.25; this.sees = this.pos.distanceTo(eye) < 50 && G.solid.sees(this.pos, eye) && !P.dead; }
    if (this.state !== 'combat' && this.sees) { this.aware += dt * 1.2; if (this.aware >= 1) { this.state = 'combat'; G.audio.radio('enemy', this.pos); } }
    // 移動：巡邏繞圈；戰鬥時在玩家前上方 8～14 m 的圈上側飛
    this.goalT -= dt;
    if (this.goalT <= 0) {
      this.goalT = rr(1.5, 3);
      if (this.state === 'combat') {
        const a = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z) + rr(-0.9, 0.9), d = rr(8, 14);
        this.goal.set(P.pos.x + Math.sin(a) * d, P.pos.y + rr(3.5, 6), P.pos.z + Math.cos(a) * d);
      } else this.goal.set(this.home.x + rr(-6, 6), this.home.y + rr(-0.5, 0.5), this.home.z + rr(-6, 6));
      // 不要飛進牆
      const hit = G.solid.ray(this.pos, _v.subVectors(this.goal, this.pos).normalize(), this.pos.distanceTo(this.goal));
      if (hit) this.goal.copy(this.pos).addScaledVector(_v, Math.max(0, hit.t - 1.2));
    }
    _v.subVectors(this.goal, this.pos);
    const acc = _v.clampLength(0, 1).multiplyScalar(this.state === 'combat' ? 9 : 4);
    acc.y += Math.sin(this.t * 2.3) * 0.6;
    this.vel.addScaledVector(acc, dt).multiplyScalar(Math.exp(-1.8 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const hp = this.pos.clone(); if (G.solid.pushOut(hp, 0.6, this.pos.y - 0.3, this.pos.y + 0.3, 0)) { this.pos.x = hp.x; this.pos.z = hp.z; this.vel.multiplyScalar(0.3); }
    const want = this.state === 'combat' ? Math.atan2(eye.x - this.pos.x, eye.z - this.pos.z) : Math.atan2(this.vel.x, this.vel.z) || this.yaw;
    this.yaw = lerpAngle(this.yaw, want, 1 - Math.exp(-dt * 4));
    this.root.rotation.set(0, 0, 0); this.root.rotation.order = 'YXZ';
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = clamp(this.vel.length() * 0.06, 0, 0.35);
    this.root.rotation.z = Math.sin(this.t * 1.7) * 0.05;
    G.audio.droneLoop(this.id, this.pos, 0.6 + 0.4 * Math.min(1, this.vel.length() / 4));
    // 開槍
    if (this.state === 'combat' && this.sees) {
      this.shotT -= dt;
      if (this.shotT <= 0 && G.canShoot(this)) {
        const m = this.root.localToWorld(new THREE.Vector3(0, -0.14, 0.4));
        const d = eye.clone().add(_w.set(0, -0.3, 0)).addScaledVector(P.vel, 0.15).sub(m).normalize();
        const sp = 0.05 * G.diff.acc;
        d.x += rr(-sp, sp); d.y += rr(-sp, sp); d.z += rr(-sp, sp); d.normalize();
        G.bolt(m, d, 45, 6 * G.diff.dmg, this);
        G.audio.enemyShot(m, 'drone'); G.fx.muzzle(m, d, [3.2, 0.5, 0.25]);
        this.burst++;
        this.shotT = this.burst % 3 === 0 ? rr(1.1, 2) : 0.14;
      }
    }
  }
  dispose() { this.G.scene.remove(this.root); this.G.audio.droneStop(this.id); }
}
