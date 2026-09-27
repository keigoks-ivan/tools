// 戰鬥：敵機 AI、玩家武器（光束步槍、多重鎖定飛彈、光劍、覺醒）、子彈與飛彈、傷害與失衡、擊毀碎片、波次
import * as THREE from 'three';
import { Mech } from './mechs.js';

const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const V3 = () => new THREE.Vector3();
const _a = V3(), _b = V3(), _c = V3(), _d = V3(), _n = V3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// 敵機種類：耐久、走速、衝刺速、喜歡的距離、失衡上限
const KIND = {
  grunt: { style: 'grunt', scheme: 'grunt', ap: 2400, walk: 12, boost: 38, pref: [130, 260], stag: 100, range: 520, score: 100 },
  ace: { style: 'grunt', scheme: 'ace', ap: 5200, walk: 16, boost: 58, pref: [55, 150], stag: 170, range: 420, score: 400 },
  heavy: { style: 'heavy', scheme: 'heavy', ap: 6800, walk: 8, boost: 26, pref: [230, 420], stag: 240, range: 760, score: 300 },
};
// 關卡：由簡到難，每一關只多一件新東西（先學打雜兵 → 學飛彈 → 飛彈重裝 → 王牌 → 混編 → 決戰）
//   每關都是滿血出發；groups＝敵機分批，打完一批才來下一批增援；tip＝開場字幕順便教一句
export const STAGES = [
  { name: '初陣', en: 'FIRST SORTIE', tip: '左鍵射擊，Tab 換目標', groups: [['grunt', 'grunt'], ['grunt']] },
  { name: '包圍網', en: 'ENCIRCLED', tip: '右鍵按住鎖定多台，放開一次射飛彈', groups: [['grunt', 'grunt', 'grunt'], ['grunt', 'grunt']] },
  { name: '重砲', en: 'HEAVY GUNS', tip: '新敵人：重裝機——響飛彈警報就點 SHIFT 閃', groups: [['grunt', 'heavy', 'grunt'], ['grunt']] },
  { name: '王牌', en: 'THE ACE', tip: '新敵人：王牌機——槍口發光就閃，靠近會拔劍', groups: [['grunt', 'ace', 'grunt'], ['grunt', 'grunt']] },
  { name: '鋼鐵洪流', en: 'IRON TIDE', tip: '混編部隊：邊跑邊打，別站著不動', groups: [['ace', 'heavy', 'grunt', 'grunt', 'heavy'], ['grunt', 'grunt']] },
  { name: '黃昏決戰', en: 'LAST LIGHT', tip: '最終關：王牌、重裝全部出動', groups: [['ace', 'heavy', 'grunt', 'ace', 'heavy', 'grunt']] },
];
// 每關的難度：
//   atk＝同一時間最多幾台敵機出手（其他台只移動找位置）——前面一次只挨一台打，後面四面八方
//   fire＝攻擊間隔倍率（大＝打得慢）、aim＝散布倍率（大＝打不準）、dmg＝打到你的傷害倍率
//   ap＝敵機耐打倍率、alt＝雜兵開不開火箭砲
const TIER = [
  { atk: 1, fire: 1.7, aim: 1.7, dmg: 0.5, ap: 0.7, alt: false },
  { atk: 1, fire: 1.4, aim: 1.4, dmg: 0.65, ap: 0.85, alt: false },
  { atk: 2, fire: 1.2, aim: 1.2, dmg: 0.8, ap: 1, alt: true },
  { atk: 2, fire: 1.1, aim: 1.1, dmg: 0.9, ap: 1, alt: true },
  { atk: 3, fire: 1.0, aim: 1.0, dmg: 1.0, ap: 1, alt: true },
  { atk: 4, fire: 0.92, aim: 0.95, dmg: 1.05, ap: 1.1, alt: true },
];
// 玩家武器
const W = {
  rifle: { dmg: 430, stag: 24, mag: 12, rof: 0.27, reload: 2.0 },
  msl: { n: 6, dmg: 330, stag: 34, cd: 7, lockStep: 0.09, cone: 0.6, range: 900 },
  saber: { dmg: 1500, stag: 90, cd: 2.4, reach: 170 },
};
// 鎖定輔助：自動鎖定的錐角、準心吸附的錐角與力道、Tab 換目標時鏡頭轉過去的速度
const LOCK = { auto: 0.62, assistCone: 0.38, assist: 4.5, snap: 13, snapT: 0.4 };
const PINK = new THREE.Color(1, 0.35, 0.8), ORANGE = new THREE.Color(1, 0.55, 0.2), SABER = new THREE.Color(3, 0.5, 1.8);

const ENEMY_SABER = new THREE.Color(3, 0.6, 0.2);
// 光劍刀身兩端（世界座標）；沒有光劍模型的機體用左手往前算
function blade(m) {
  const h = m.bones.handL;
  h.updateWorldMatrix(true, false);
  return [h.localToWorld(new THREE.Vector3(0, -0.9, 1.9)), h.localToWorld(new THREE.Vector3(0, -0.9, 12.1))];
}

// 射線（原點 o、單位方向 d）對直立膠囊：回傳命中距離或 -1
function rayCapsule(o, d, cap, maxT) {
  const hx = d.x, hz = d.z, h2 = hx * hx + hz * hz;
  let t = h2 > 1e-6 ? ((cap.x - o.x) * hx + (cap.z - o.z) * hz) / h2 : 0;
  t = clamp(t, 0, maxT);
  const px = o.x + hx * t - cap.x, pz = o.z + hz * t - cap.z, dh = Math.hypot(px, pz);
  if (dh > cap.r) return -1;
  const y = o.y + d.y * t;
  if (y < cap.y0 - cap.r || y > cap.y1 + cap.r) return -1;
  const back = h2 > 1e-6 ? Math.sqrt(cap.r * cap.r - dh * dh) / Math.sqrt(h2) : 0;
  return Math.max(0, t - back);
}

// ---------------------------------------------------------------- 敵機
class Enemy {
  constructor(kind, id) {
    this.kind = kind; this.K = KIND[kind]; this.id = id;
    this.m = new Mech(this.K.style, this.K.scheme);
    this.pos = this.m.root.position;
    this.vel = V3();
    this.ap = this.K.ap; this.apMax = this.K.ap;
    this.stag = 0; this.stagT = 0; this.lastHit = 9;
    this.face = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = rand(1.5, 3.5);
    this.boostT = 0; this.qbT = 0; this.qbCd = rand(1, 3); this.qbV = V3();
    this.grounded = false; this.dropping = true;
    this.fireCd = rand(2.0, 3.5); this.altCd = rand(5, 9);
    this.burst = 0; this.burstT = 0; this.charge = 0; this.volley = 0; this.volleyT = 0; this.lunge = 0;
    this.los = false; this.losT = Math.random() * 0.3;
    this.dead = false; this.dying = 0;
    this.thrust = 0; this.hover = 0;
    this.locks = 0;           // 被玩家飛彈鎖了幾發
    this.warn = 0;            // 準備開火的警示（HUD 用）0..1
    this.aim = V3();
    this.jumpCd = rand(3, 8);
  }
  get scale() { return this.m.scale; }
  chest(out) { return out.set(this.pos.x, this.pos.y + 10.5 * this.scale, this.pos.z); }
  alive() { return !this.dead; }
}

// ---------------------------------------------------------------- 戰鬥管理
export class Combat {
  constructor(o) {
    Object.assign(this, o);   // scene, world, camera, player, hero, fx, audio, cockpit, post
    this.enemies = []; this.missiles = []; this.debris = []; this.events = [];
    this.stage = clamp(o.stage || 1, 1, STAGES.length);   // 第幾關
    this.group = 0; this.phase = 'idle'; this.phaseT = 0; this.nextId = 1;   // group＝已出動幾批敵機
    this.stats = { shots: 0, hits: 0, kills: 0, dmgTaken: 0, time: 0, chain: 0, maxChain: 0, lastKill: -99, score: 0 };
    this.rifle = { ammo: W.rifle.mag, mag: W.rifle.mag, reload: -1, cd: 0 };
    this.msl = { cd: 1, locks: [], lockT: 0, locking: false, max: W.msl.n };
    this.saber = { cd: 1, phase: null, t: 0, target: null, hit: false };
    this.od = { gauge: 0, active: false };
    this.lockTarget = null; this.soft = null;
    this.hitstop = 0; this.slowmo = 0; this.timeScale = 1;
    this.parts = { head: 1, torso: 1, armL: 1, armR: 1, legL: 1, legR: 1 };
    this.dmgDirs = [];
    this.hitMark = 0; this.critMark = 0; this.killMark = 0;
    this.banner = null; this.notes = [];
    this.incoming = 0; this.lockAlert = 0;
    this.aimPoint = V3(); this.aimDir = V3(0, 0, 1); this.eye = V3();
    this.damageFx = 0;
    this.dead = false;
    this.onEnd = o.onEnd || (() => {});
  }

  get alive() { return this.enemies.filter((e) => !e.dead); }

  start() { this.phase = 'intro'; this.phaseT = 1.2; this.group = 0; }
  get def() { return STAGES[this.stage - 1]; }
  get tier() { return TIER[clamp(this.stage - 1, 0, TIER.length - 1)]; }
  // 同時出手的台數有上限：輪不到的先移動、晚一點再打
  canAttack(e) {
    let n = 0;
    for (const o of this.enemies) if (o !== e && !o.dead && (o.burst > 0 || o.charge > 0 || o.volley > 0 || o.lunge > 0)) n++;
    return n < this.tier.atk;
  }

  say(text, sub = '', t = 2.4, color = 'cy') { this.banner = { text, sub, t, T: t, color }; }
  note(text, color = 'cy') { this.notes.push({ text, t: 1.6, color }); if (this.notes.length > 4) this.notes.shift(); }

  // ---------------------------------------------------------------- 出動敵機（第一批＝開場，之後＝增援）
  spawnGroup() {
    const D = this.def, list = D.groups[this.group++], first = this.group === 1;
    if (first) this.say(`STAGE ${this.stage}　${D.name}`, D.tip, 4, this.stage === STAGES.length ? 'am' : 'cy');
    else this.say('REINFORCEMENTS', `敵方增援 ×${list.length}`, 2.6, 'am');
    this.audio.ui('wave');
    const t0 = first ? 1.2 : 2.2;
    list.forEach((k, i) => this.events.push({ spawn: true, t: t0 + i * 0.7, fn: () => this.spawn(k, i, list.length) }));
  }
  spawn(kind, i, n) {
    const p = this.player.pos, w = this.world;
    const e = new Enemy(kind, this.nextId++);
    const T = this.tier;
    e.ap = e.apMax = Math.round(e.K.ap * T.ap);
    e.fireCd *= T.fire; e.altCd *= T.fire;
    let x = 0, z = 0, fx = 0, fz = 0, found = false;
    const pc = _b.set(p.x, p.y + 12, p.z);
    for (let tries = 0; tries < 80 && !found; tries++) {
      const a = this.player.yaw + (i / Math.max(1, n - 1) - 0.5) * 1.6 + rand(-0.4, 0.4) + (tries > 40 ? rand(-2.2, 2.2) : 0);
      const d = rand(240, 400);
      x = clamp(p.x + Math.sin(a) * d, -680, 680); z = clamp(p.z + Math.cos(a) * d, -680, 680);
      const h = w.height(x, z);
      if (w.support(x, z, 5, h + 0.5) > h + 0.5) continue;
      const t = _a.set(x, h, z);
      if (w.collide(t, 5, h)) continue;
      if (!fx && !fz) { fx = x; fz = z; }
      // 落地後要看得到玩家（落地點在空地上、視線不被大樓擋）
      if (w.raycast(_c.set(x, h + 12, z), pc, null) < 0) found = true;
    }
    if (!found && (fx || fz)) { x = fx; z = fz; }
    e.pos.set(x, w.height(x, z) + 150 + i * 10, z);
    e.vel.set(0, -80, 0);
    e.face = Math.atan2(p.x - x, p.z - z);
    e.m.legYaw = e.face;
    this.scene.add(e.m.root);
    this.enemies.push(e);
  }

  // ---------------------------------------------------------------- 每幀
  update(dt, inp, rdt) {
    const S = this.stats;
    if (this.phase !== 'done') S.time += dt;
    this.hitstop -= rdt; this.slowmo -= rdt;
    this.timeScale = this.hitstop > 0 ? 0.08 : this.slowmo > 0 ? 0.3 : 1;
    for (let i = this.events.length - 1; i >= 0; i--) { const ev = this.events[i]; ev.t -= dt; if (ev.t <= 0) { this.events.splice(i, 1); ev.fn(); } }
    if (this.banner) { this.banner.t -= rdt; if (this.banner.t <= 0) this.banner = null; }
    for (const nt of this.notes) nt.t -= rdt;
    this.notes = this.notes.filter((nt) => nt.t > 0);
    this.hitMark = Math.max(0, this.hitMark - rdt * 5); this.critMark = Math.max(0, this.critMark - rdt * 2.5); this.killMark = Math.max(0, this.killMark - rdt * 1.6);
    this.damageFx = Math.max(0, this.damageFx - rdt * 3);
    for (const d of this.dmgDirs) d.t -= rdt;
    this.dmgDirs = this.dmgDirs.filter((d) => d.t > 0);

    // 關卡流程：開場 → 一批批打完 → 過關
    this.phaseT -= dt;
    if (this.phase === 'intro' && this.phaseT <= 0) { this.phase = 'fight'; this.spawnGroup(); }
    else if (this.phase === 'fight' && this.enemies.length === 0 && this.events.length === 0) {
      if (this.group < this.def.groups.length) this.spawnGroup();
      else {
        const last = this.stage === STAGES.length;
        this.phase = 'done'; this.slowmo = 1.4;
        this.say(last ? 'ALL CLEAR' : 'STAGE CLEAR', last ? '全部過關' : `第 ${this.stage} 關完成`, 4, 'am');
        this.audio.ui('clear');
        this.events.push({ t: 1.2, fn: () => this.onEnd(true) });
      }
    }

    this.updateAim();
    if (!this.dead && this.phase !== 'done' && inp) this.playerWeapons(dt, inp);
    this.updateEnemies(dt);
    this.updateMissiles(dt);
    this.updateDebris(dt);
    this.enemies = this.enemies.filter((e) => !e.gone);
    this.updateAlerts(dt);
  }

  // ---------------------------------------------------------------- 瞄準
  updateAim() {
    const pl = this.player;
    const cp = Math.cos(pl.pitch);
    this.aimDir.set(Math.sin(pl.yaw) * cp, Math.sin(pl.pitch), Math.cos(pl.yaw) * cp);
    this.eye.copy(this.camera.position);
    // 軟鎖定：準心附近（約 9°）、看得到的敵人
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.dead || !e.los) continue;
      const c = e.chest(_a).sub(this.eye), d = c.length();
      if (d > 1100) continue;
      const ang = Math.acos(clamp(c.dot(this.aimDir) / d, -1, 1));
      if (ang > 0.22) continue;
      const s = ang + d / 4000;
      if (s < bs) { bs = s; best = e; }
    }
    this.soft = best;
    if (this.lockTarget && (this.lockTarget.dead || this.lockTarget.pos.distanceTo(pl.pos) > 1300)) this.lockTarget = null;
    const t = this.fireTarget();
    if (t) t.chest(this.aimPoint);
    else {
      const far = _b.copy(this.eye).addScaledVector(this.aimDir, 1400);
      const tt = this.world.raycast(this.eye, far, _n);
      this.aimPoint.copy(this.eye).addScaledVector(this.aimDir, tt >= 0 ? Math.max(40, tt * 1400) : 1400);
    }
  }
  // 步槍瞄誰：硬鎖定（在前方 60° 內）優先，其次軟鎖定
  fireTarget() {
    const L = this.lockTarget;
    if (L && !L.dead && L.los) {
      const c = L.chest(_c).sub(this.eye);
      if (c.normalize().dot(this.aimDir) > 0.5) return L;
    }
    return this.soft;
  }

  // ---------------------------------------------------------------- 玩家武器
  playerWeapons(dt, inp) {
    const R = this.rifle, M = this.msl, SB = this.saber, OD = this.od, pl = this.player;
    // 硬鎖定切換
    // Tab：換下一個目標（全方位，依離準心的角度排），鏡頭自動轉過去
    if (inp.hardLock) {
      const list = this.enemies.filter((e) => !e.dead && !e.dropping)
        .map((e) => ({ e, a: this.angTo(e) + (e.los ? 0 : 0.5) })).sort((a, b) => a.a - b.a).map((o) => o.e);
      if (list.length) {
        const i = list.indexOf(this.lockTarget);
        this.lockTarget = i < 0 ? list[0] : list[(i + 1) % list.length];
        this.snapT = LOCK.snapT;
        this.audio.lockTick();
      }
    }
    this.autoLock(dt);
    this.aimAssist(dt);
    // 步槍
    R.cd -= dt;
    if (R.reload >= 0) {
      R.reload += dt / W.rifle.reload;
      if (R.reload >= 1) { R.reload = -1; R.ammo = R.mag; }
    } else if (inp.reload && R.ammo < R.mag) this.startReload();
    if (inp.fire && SB.phase === null) this.fireRifle();
    // 飛彈：按住右鍵掃過敵人上鎖，放開發射
    if (M.cd < 1) M.cd = Math.min(1, M.cd + dt / W.msl.cd);
    if (inp.lockHold && M.cd >= 1) {
      if (!M.locking) { M.locking = true; M.locks = []; M.lockT = 0.05; }
      M.lockT -= dt;
      if (M.lockT <= 0 && M.locks.length < W.msl.n) {
        let best = null, bs = 1e9;
        for (const e of this.enemies) {
          if (e.dead || !e.los || e.dropping) continue;
          const c = e.chest(_a).sub(this.eye), d = c.length();
          if (d > W.msl.range) continue;
          const ang = Math.acos(clamp(c.dot(this.aimDir) / d, -1, 1));
          if (ang > W.msl.cone) continue;
          const s = e.locks * 10 + ang - (e === this.lockTarget ? 0.3 : 0);
          if (s < bs) { bs = s; best = e; }
        }
        if (best) {
          M.locks.push(best); best.locks++; M.lockT = W.msl.lockStep;
          this.audio.lockTick();
          if (M.locks.length === W.msl.n) this.audio.lockMulti(M.locks.length);
        } else M.lockT = 0.05;
      }
    }
    if (M.locking && (!inp.lockHold || inp.lockRelease)) {
      M.locking = false;
      this.launchSalvo(M.locks.slice());
      for (const e of M.locks) e.locks = 0;
      M.locks = [];
    }
    // 光劍
    if (SB.cd < 1 && SB.phase === null) SB.cd = Math.min(1, SB.cd + dt / W.saber.cd);
    if (inp.saber && SB.cd >= 1 && SB.phase === null) this.startSaber();
    this.updateSaber(dt);
    // 覺醒
    if (OD.active) {
      OD.gauge -= dt / 10;
      if (OD.gauge <= 0) { OD.gauge = 0; OD.active = false; pl.odT = 0; this.note('OVERDRIVE END', 'dim'); }
    } else if (inp.od && OD.gauge >= 1) {
      OD.active = true; pl.odT = 10;
      this.audio.overdrive();
      this.say('OVERDRIVE', '覺醒', 1.6, 'rd');
      this.cockpit.kick('qb', 1);
    }
  }

  // 準心方向和敵機胸口的夾角
  angTo(e) {
    const c = e.chest(_a).sub(this.eye), d = c.length();
    return Math.acos(clamp(c.dot(this.aimDir) / Math.max(d, 1e-3), -1, 1));
  }
  // 自動鎖定：沒有目標（或目標躲起來太久）時，挑準心附近看得到的敵機
  autoLock(dt) {
    const L = this.lockTarget;
    if (L && !L.dead) {
      L.hideT = L.los ? 0 : (L.hideT || 0) + dt;
      if (L.hideT < 1.5 || this.snapT > 0) return;
    }
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.dropping || !e.los || e === L) continue;
      const a = this.angTo(e);
      if (a > LOCK.auto) continue;
      const sc = a + e.pos.distanceTo(this.player.pos) / 2500;
      if (sc < bs) { bs = sc; best = e; }
    }
    if (best) { this.lockTarget = best; this.audio.lockTick(); }
    else if (L && L.dead) this.lockTarget = null;
  }
  // 輔助瞄準：鎖定目標在準心附近時，視線被輕輕吸過去；按 Tab 時快速轉向
  aimAssist(dt) {
    const L = this.lockTarget, pl = this.player;
    this.snapT = Math.max(0, (this.snapT || 0) - dt);
    if (!L || L.dead || this.saber.phase === 'dash') return;
    const snap = this.snapT > 0;
    if (!snap && (!L.los || this.angTo(L) > LOCK.assistCone)) return;
    const c = L.chest(_a).sub(this.eye);
    const wy = Math.atan2(c.x, c.z), wp = Math.atan2(c.y, Math.hypot(c.x, c.z));
    const k = 1 - Math.exp(-(snap ? LOCK.snap : LOCK.assist) * dt);
    pl.yaw += wrap(wy - pl.yaw) * k;
    pl.pitch = clamp(pl.pitch + (wp - pl.pitch) * k, -0.62, 0.72);
  }

  startReload() { if (this.rifle.reload < 0) { this.rifle.reload = 0; this.audio.reload(); } }

  fireRifle() {
    const R = this.rifle, pl = this.player, hero = this.hero, w = this.world;
    if (R.reload >= 0 || R.cd > 0) return;
    if (R.ammo <= 0) { this.startReload(); return; }
    R.ammo--; R.cd = this.od.active ? W.rifle.rof * 0.5 : W.rifle.rof;
    this.stats.shots++;
    hero.muzzle.updateWorldMatrix(true, false);
    const from = hero.muzzle.getWorldPosition(V3());
    let to = V3(), hitE = null, kind = 'ground';
    const tgt = this.fireTarget();
    if (tgt) {
      tgt.chest(to);
      to.x += rand(-1.2, 1.2); to.y += rand(-2.5, 2.5); to.z += rand(-1.2, 1.2);
      // 王牌機會閃
      if (tgt.kind === 'ace' && tgt.stagT <= 0 && tgt.qbCd <= 0 && Math.random() < 0.4 && !tgt.dropping) {
        this.enemyQB(tgt, 1);
        const side = _a.set(this.aimDir.z, 0, -this.aimDir.x).normalize().multiplyScalar(tgt.strafe * rand(9, 14));
        to.add(side);
        this.note('EVADED', 'am');
      } else hitE = tgt;
    } else {
      // 沒鎖定：照準心直射
      let best = 1600;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const t = rayCapsule(this.eye, this.aimDir, e.m.capsule(), 1600);
        if (t >= 0 && t < best) { best = t; hitE = e; }
      }
      to.copy(this.eye).addScaledVector(this.aimDir, best);
    }
    // 被建築或地形擋住
    const dir = _d.subVectors(to, from);
    const len = dir.length(); dir.divideScalar(len);
    const ext = _b.copy(to).addScaledVector(dir, hitE ? 0 : 200);
    const tw = w.raycast(from, ext, _n);
    if (tw >= 0) {
      const hitP = V3().lerpVectors(from, ext, tw);
      if (!hitE || hitP.distanceTo(from) < len - 4) { hitE = null; to.copy(hitP); kind = _n.y > 0.7 ? 'ground' : 'building'; }
    } else if (!hitE) to.copy(ext);
    this.fx.beam(from, to, 'player');
    this.fx.muzzle(from, dir, 'beam');
    this.audio.beam();
    hero.recoil = 1;
    this.cockpit.kick('fire', 1);
    this.cockpit.flashAt(PINK, 5, 0.45, -0.25, -1.1);
    if (hitE) {
      const d = from.distanceTo(to), fall = d > 600 ? clamp(1 - (d - 600) / 800, 0.5, 1) : 1;
      this.damageEnemy(hitE, W.rifle.dmg * fall * (this.od.active ? 1.25 : 1), W.rifle.stag, to, dir);
      this.fx.impact(to, _n.copy(dir).negate(), 'beam');
      this.audio.impact(to, 'beam');
    } else if (tw >= 0) {
      this.fx.impact(to, _n, kind);
      this.audio.impact(to, kind);
    }
    if (R.ammo === 0) this.startReload();
  }

  launchSalvo(locks) {
    const hero = this.hero, n = W.msl.n;
    this.msl.cd = 0;
    hero.bones.torso.updateWorldMatrix(true, false);
    for (let i = 0; i < n; i++) {
      const target = locks.length ? locks[i % locks.length] : null;
      this.events.push({
        t: i * 0.07, fn: () => {
          const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
          const p = hero.bones.torso.localToWorld(V3(side * 2.4, 5.2 + row * 0.5, -1.6));
          const f = _a.copy(this.aimDir).setY(0).normalize();
          const r = _b.set(-f.z, 0, f.x);
          const v = V3().copy(f).multiplyScalar(18).addScaledVector(r, -side * rand(8, 16)).add(_c.set(0, rand(18, 26), 0));
          const aim = target ? null : V3().copy(this.eye).addScaledVector(this.aimDir, 700).add(_c.set(rand(-20, 20), rand(-10, 10), rand(-20, 20)));
          this.missiles.push({ own: 'player', pos: p, vel: v, target, aim, t: 0, speed: v.length(), vmax: 200, acc: 260, turn: 5.2, dmg: W.msl.dmg, h: this.fx.missile('player'), life: 6 });
          this.audio.missileLaunch(i);
        },
      });
    }
  }

  startSaber() {
    const SB = this.saber, pl = this.player;
    let tgt = this.fireTarget() || this.lockTarget, bs = 1e9;
    if (!tgt) for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.chest(_a).sub(this.eye), d = c.length();
      if (d > W.saber.reach) continue;
      const ang = Math.acos(clamp(c.dot(this.aimDir) / d, -1, 1));
      if (ang < 0.8 && ang + d / 500 < bs) { bs = ang + d / 500; tgt = e; }
    }
    if (tgt && tgt.pos.distanceTo(pl.pos) > W.saber.reach) tgt = null;
    SB.target = tgt; SB.phase = 'dash'; SB.t = 0; SB.hit = false;
    this.audio.saberOn();
    this.hero.saber.visible = true;
    if (tgt) {
      const d = _a.subVectors(tgt.pos, pl.pos); const dist = d.length();
      d.y = (tgt.pos.y - pl.pos.y) / Math.max(1, dist);
      pl.dash(d.normalize(), 105, clamp((dist - 16) / 105, 0.08, 0.7));
      this.cockpit.kick('qb', 1.2);
    } else pl.dash(_a.copy(this.aimDir), 45, 0.18);
  }
  updateSaber(dt) {
    const SB = this.saber, pl = this.player, hero = this.hero;
    if (SB.phase === null) return;
    SB.t += dt;
    const tgt = SB.target && !SB.target.dead ? SB.target : null;
    if (SB.phase === 'dash') {
      if (tgt) {
        const dir = _a.subVectors(tgt.pos, pl.pos).setY(0);
        pl.yaw = damp(pl.yaw, pl.yaw + wrap(Math.atan2(dir.x, dir.z) - pl.yaw), 10, dt);
      }
      const close = tgt ? tgt.pos.distanceTo(pl.pos) < 26 : true;
      if (pl.dashT <= 0 || close || SB.t > 0.8) { SB.phase = 'swing'; hero.swing = 1; this.audio.saberSwing(); if (tgt) pl.dashT = 0; }
      hero.swing = 0;
      hero.saber.visible = true;
    }
    if (SB.phase === 'swing') {
      hero.swing = Math.max(0, hero.swing - dt / 0.8);
      const p = 1 - hero.swing;
      if (p > 0.25 && p < 0.62) {   // 刀光殘影
        const [a, b] = blade(hero);
        this.fx.saberArc(a, b, SABER);
      }
      if (!SB.hit && p > 0.36) {
        SB.hit = true;
        let hitE = null;
        const cands = tgt ? [tgt] : this.enemies;
        for (const e of cands) {
          if (e.dead) continue;
          const d = _a.subVectors(e.pos, pl.pos); d.y = 0;
          const dist = d.length();
          if (dist > 30 * (0.5 + 0.5 * e.scale)) continue;
          if (d.normalize().dot(_b.set(Math.sin(pl.yaw), 0, Math.cos(pl.yaw))) < 0.2) continue;
          hitE = e; break;
        }
        if (hitE) {
          const crit = hitE.stagT > 0;
          const dmg = W.saber.dmg * (crit ? 2.4 : 1) * (this.od.active ? 1.3 : 1);
          const hp = hitE.chest(V3());
          const dir = _c.subVectors(hitE.pos, pl.pos).setY(0).normalize();
          this.damageEnemy(hitE, dmg, W.saber.stag, hp, dir, crit);
          hitE.vel.addScaledVector(dir, 34); hitE.vel.y += 6; hitE.grounded = false;
          if (!hitE.dead) hitE.stagT = Math.max(hitE.stagT, 0.9);
          this.fx.impact(hp, _n.copy(dir).negate(), 'armor');
          this.fx.impact(hp, _n.copy(dir).negate(), 'beam');
          this.audio.impact(hp, 'armor');
          this.hitstop = Math.max(this.hitstop, crit ? 0.16 : 0.1);
          this.cockpit.kick('hit', crit ? 0.9 : 0.6, 0);
          this.cockpit.flashAt(SABER, 7, -0.3, 0, -1.2);
          if (crit) { this.critMark = 1; this.note('CRITICAL', 'am'); }
        }
      }
      if (hero.swing <= 0) { SB.phase = null; SB.cd = 0; hero.saber.visible = false; this.audio.saberOff(); }
    }
  }

  // ---------------------------------------------------------------- 傷害
  damageEnemy(e, dmg, stag, pos, dir, crit = false) {
    if (e.dead) return;
    if (e.stagT > 0 && !crit) dmg *= 1.4;
    e.ap -= dmg; e.lastHit = 0;
    this.stats.hits++;
    this.stats.score += Math.round(dmg / 10);
    if (!this.od.active) this.od.gauge = Math.min(1, this.od.gauge + dmg / 9000);
    this.hitMark = 1;
    this.audio.hitmarker();
    e.m.impact(clamp(dmg / 900, 0.25, 1.2));
    if (e.stagT <= 0) {
      e.stag += stag;
      if (e.stag >= e.K.stag) {
        e.stag = 0; e.stagT = 2.6;
        e.m.impact(1.4);
        this.note('STAGGER', 'am');
        this.audio.impact(pos, 'armor');
      }
    }
    if (e.ap <= 0) this.kill(e);
  }
  kill(e) {
    e.dead = true; e.dying = e.kind === 'grunt' ? 0.45 : 0.9; e.ap = 0;
    if (this.lockTarget === e) this.lockTarget = null;
    const S = this.stats;
    S.kills++;
    S.chain = S.time - S.lastKill < 8 ? S.chain + 1 : 1;
    S.maxChain = Math.max(S.maxChain, S.chain);
    S.lastKill = S.time;
    S.score += e.K.score * S.chain;
    this.killMark = 1;
    this.hitstop = Math.max(this.hitstop, 0.14);
    this.note(S.chain > 1 ? `DESTROYED  ×${S.chain}` : 'DESTROYED', 'rd');
  }
  boom(e) {
    const c = e.chest(V3()), w = this.world;
    this.fx.explosion(c, 3);
    this.audio.explosion(c, 3);
    this.fx.smokeColumn(_a.set(e.pos.x, w.height(e.pos.x, e.pos.z), e.pos.z), 45);
    const dist = c.distanceTo(this.player.pos);
    const s = clamp(1 - dist / 260, 0, 1);
    if (s > 0) { this.cockpit.kick('hit', s * 0.8, 0); this.cockpit.flashAt(ORANGE, 14 * s, 0, 0.2, -1.4); }
    if (dist < 32) this.hurt(900 * (1 - dist / 32), c, 'blast');
    // 拆成碎片飛出去
    for (const pc of e.m.shatter()) {
      const mesh = pc.mesh;
      if (!mesh.visible) continue;
      mesh.removeFromParent();
      mesh.position.copy(pc.pos); mesh.quaternion.copy(pc.q); mesh.scale.copy(pc.sc);
      this.scene.add(mesh);
      const out = _a.subVectors(pc.pos, c); out.y = Math.max(0, out.y) + 2;
      const v = out.normalize().multiplyScalar(rand(10, 34)).add(_b.set(0, rand(8, 24), 0)).add(_c.copy(e.vel).multiplyScalar(0.5));
      const ax = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      this.debris.push({ mesh, vel: v, ax, av: rand(2, 8), t: 0, burn: Math.random() < 0.4 });
    }
    e.m.root.removeFromParent();
    e.gone = true;
  }

  hurt(dmg, from, kind = 'bullet') {
    dmg *= this.tier.dmg;
    if (this.dead || this.phase === 'done') return;
    const pl = this.player;
    if (this.od.active) dmg *= 0.75;
    pl.ap -= dmg;
    this.stats.dmgTaken += dmg;
    const src = this.stats.src || (this.stats.src = {});
    src[kind] = Math.round((src[kind] || 0) + dmg);
    if (!this.od.active) this.od.gauge = Math.min(1, this.od.gauge + dmg / 14000);
    // 從哪邊打來
    const d = _a.subVectors(from, pl.pos);
    const ang = wrap(Math.atan2(d.x, d.z) - pl.yaw);
    const s = clamp(dmg / 600, 0.15, 1.5);
    this.dmgDirs.push({ ang, t: 1.2, s });
    this.cockpit.kick('hit', s, -Math.sign(ang));
    this.audio.hurt(s, -Math.sin(ang));
    this.damageFx = Math.min(1, this.damageFx + s * 0.6);
    // 部位損傷（看子彈打在哪個高度）
    const keys = ['head', 'torso', 'torso', 'armL', 'armR', 'legL', 'legR'];
    const k = keys[(Math.random() * keys.length) | 0];
    this.parts[k] = Math.max(0, this.parts[k] - dmg / pl.apMax * 3);
    if (pl.ap <= 0) {
      pl.ap = 0; this.dead = true;
      this.say('AP ZERO', '機體失去戰鬥能力', 4, 'rd');
      this.audio.alert('danger');
      this.slowmo = 1.5;
      const c = this.hero.bones.torso.getWorldPosition(V3());
      this.events.push({ t: 0.5, fn: () => { this.fx.explosion(c, 3); this.audio.explosion(c, 3); this.cockpit.kick('hit', 1.5, 0); this.cockpit.flashAt(ORANGE, 30); } });
      this.events.push({ t: 2.2, fn: () => this.onEnd(false) });
    }
  }

  // ---------------------------------------------------------------- 敵機
  updateEnemies(dt) {
    const pl = this.player, w = this.world;
    const pc = this.hero.bones.torso.getWorldPosition(_d);
    const playerChest = V3().copy(pc);
    for (const e of this.enemies) {
      if (e.gone) continue;
      const m = e.m, K = e.K, k = e.scale;
      if (e.dead) {
        e.dying -= dt;
        if (Math.random() < dt * 14) {
          const p = e.chest(V3()).add(_a.set(rand(-4, 4), rand(-6, 5), rand(-4, 4)));
          this.fx.impact(p, _n.set(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize(), 'armor');
          if (Math.random() < 0.3) { this.fx.explosion(p, 1); this.audio.explosion(p, 1); }
        }
        e.vel.x = damp(e.vel.x, 0, 3, dt); e.vel.z = damp(e.vel.z, 0, 3, dt);
        this.moveEnemy(e, dt, true);
        m.animate(dt, { vel: e.vel, grounded: e.grounded, boost: 0, torsoYaw: e.face + Math.sin(e.dying * 20) * 0.1, pitch: 0, thrust: 0, aim: null, lean: 0.2 });
        if (e.dying <= 0) this.boom(e);
        continue;
      }
      e.lastHit += dt; e.losT -= dt; e.qbCd -= dt; e.qbT -= dt; e.boostT -= dt; e.jumpCd -= dt;
      if (e.lastHit > 1.3 && e.stagT <= 0) e.stag = Math.max(0, e.stag - K.stag * 0.12 * dt);
      const toP = _a.subVectors(pl.pos, e.pos); toP.y = 0;
      const dist = toP.length();
      const dirP = toP.divideScalar(Math.max(1, dist));
      // 看得到玩家嗎
      if (e.losT <= 0) {
        e.losT = 0.3;
        const ec = e.chest(_b);
        e.los = w.raycast(ec, playerChest, null) < 0 || w.raycast(_c.set(ec.x, ec.y + 5 * k, ec.z), _n.copy(playerChest).setY(playerChest.y + 4), null) < 0;
      }
      e.noLos = e.los ? 0 : (e.noLos || 0) + dt;
      e.face = e.face + wrap(Math.atan2(dirP.x, dirP.z) - e.face) * (1 - Math.exp(-dt * (e.stagT > 0 ? 0.5 : 4)));

      if (e.dropping) {
        // 從天而降：快落地時噴射減速
        const g = w.support(e.pos.x, e.pos.z, 3.4 * k, e.pos.y);
        const hgt = e.pos.y - g;
        // 自由落下，接近地面時反推煞車（v＝√(2·a·h)）
        e.vel.y = -clamp(Math.sqrt(2 * 55 * Math.max(0, hgt)), 9, 80);
        e.thrust = hgt < 60 ? 1 : 0.15;
        e.pos.addScaledVector(e.vel, dt);
        if (e.pos.y <= g) {
          e.pos.y = g; e.vel.set(0, 0, 0); e.dropping = false; e.grounded = true;
          m.impact(1.2); m.landV = (m.landV || 0) + 7;
          this.fx.dust(_b.set(e.pos.x, g, e.pos.z), 2.4 * k);
          this.audio.enemyStep(e.pos, 1.5);
          const ds = clamp(1 - dist / 200, 0, 1);
          if (ds > 0) this.cockpit.kick('step', ds * 1.5, 0);
        }
        this.audio.enemyBoost(e.id, e.pos, e.thrust);
        m.animate(dt, { vel: e.vel, grounded: false, boost: 0, torsoYaw: e.face, pitch: 0, thrust: e.thrust, aim: null, lean: 0 });
        continue;
      }

      // ---- 移動：保持喜歡的距離、左右繞、偶爾衝刺
      const wish = V3();
      if (e.stagT > 0) {
        e.stagT -= dt;
      } else {
        const [lo, hi] = K.pref;
        const hunt = e.noLos > 1.2;   // 看不到玩家：往前逼近、翻過大樓
        const radial = hunt ? 1 : dist > hi ? 1 : dist < lo ? -0.9 : 0.15 * Math.sin(this.stats.time * 0.7 + e.id);
        if (hunt && e.boostT <= 0 && Math.random() < dt * 0.8) e.boostT = rand(0.8, 1.6);
        if (hunt && e.grounded && (e.bumped || e.noLos > 3.5) && e.jumpCd > -1) {
          e.vel.y = 24; e.grounded = false; e.hover = rand(1.2, 2.2); e.jumpCd = rand(2, 4); e.noLos = 1.3;
        }
        e.strafeT -= dt;
        if (e.strafeT <= 0) {
          e.strafe = Math.random() < 0.7 ? -e.strafe : e.strafe;
          e.strafeT = rand(1.8, 4.5);
          if (Math.random() < (e.kind === 'ace' ? 0.6 : e.kind === 'grunt' ? 0.35 : 0.15)) e.boostT = rand(0.8, 1.8);
        }
        const perp = _b.set(dirP.z, 0, -dirP.x).multiplyScalar(e.strafe);
        wish.copy(dirP).multiplyScalar(radial).addScaledVector(perp, hunt ? 0.35 : 0.85);
        if (wish.lengthSq() > 1) wish.normalize();
        // 王牌近身：光劍突擊
        if (e.kind === 'ace' && dist < 90 && e.fireCd < 0.8 && e.lunge <= 0 && e.los && Math.random() < dt * 1.2 && this.canAttack(e)) {
          e.lunge = 0.9; this.note('WARNING  MELEE', 'rd'); this.audio.alert('lock');
          e.m.swing = 0;
        }
        if (e.jumpCd <= 0 && e.grounded) {
          e.jumpCd = rand(4, 10);
          if (Math.random() < (e.kind === 'ace' ? 0.8 : e.kind === 'grunt' ? 0.35 : 0.1)) { e.vel.y = 20; e.grounded = false; e.hover = e.kind === 'ace' ? rand(0.8, 2) : rand(0, 0.6); }
        }
      }
      const vmax = e.boostT > 0 ? K.boost : K.walk;
      const hv = _b.set(e.vel.x, 0, e.vel.z);
      const tgtV = wish.multiplyScalar(vmax);
      let rate = e.grounded ? 26 : 10;
      if (hv.length() > vmax + 2) rate = e.grounded ? 36 : 14;
      if (e.qbT > 0) rate = 0;
      const dv = tgtV.sub(hv), L = dv.length();
      if (L > rate * dt) dv.multiplyScalar(rate * dt / L);
      e.vel.x += dv.x; e.vel.z += dv.z;
      // 光劍突擊
      if (e.lunge > 0) {
        e.lunge -= dt;
        if (e.lunge > 0.45) { e.vel.x = dirP.x * 95; e.vel.z = dirP.z * 95; e.thrust = 1; }
        else if (!e.lungeHit) {
          e.lungeHit = true; e.m.swing = 1;
          this.audio.saberSwing();
          if (dist < 30 && this.player.qbT <= 0) this.hurt(1100, e.pos, 'saber');
          else this.note('DODGED', 'gr');
        }
        if (e.m.swing > 0) {
          e.m.swing = Math.max(0, e.m.swing - dt / 0.7);
          const p = 1 - e.m.swing;
          if (p > 0.25 && p < 0.6) { const [a, b] = blade(e.m); this.fx.saberArc(a, b, ENEMY_SABER); }
        }
        if (e.lunge <= 0) { e.lungeHit = false; e.m.swing = 0; e.fireCd = rand(1.5, 2.5); }
      }
      this.moveEnemy(e, dt, false);
      const thr = Math.max(e.boostT > 0 ? 1 : 0, e.qbT > 0 ? 1 : 0, e.hover > 0 ? 1 : 0, e.lunge > 0.45 ? 1 : 0);
      e.thrust = damp(e.thrust, thr, 10, dt);
      this.audio.enemyBoost(e.id, e.pos, e.thrust);

      // ---- 開火
      const aim = e.los && dist < K.range + 150 && e.stagT <= 0 ? playerChest : null;
      if (e.stagT <= 0 && e.lunge <= 0) this.enemyFire(e, dt, dist, playerChest);
      m.animate(dt, { vel: e.vel, grounded: e.grounded, boost: e.grounded && (e.boostT > 0 || e.qbT > 0) ? 1 : 0, torsoYaw: e.face, pitch: 0, thrust: e.thrust, aim, lean: e.stagT > 0 ? 0.35 : 0 });
      if (m.footfall) {
        const fp = _b.copy(e.pos);
        this.audio.enemyStep(fp, e.kind === 'heavy' ? 1.3 : 0.9);
        if (e.vel.lengthSq() > 30) this.fx.dust(fp, 0.6 * k);
        const ds = clamp(1 - dist / 90, 0, 1);
        if (ds > 0) this.cockpit.kick('step', ds * 0.8, m.footfall);
      }
      if (e.grounded && e.boostT > 0) this.fx.skid(e.pos, e.vel, 0.6);
    }
    // 互相推開（含玩家）
    const all = this.enemies.filter((e) => !e.gone && !e.dropping);
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      for (let j = i + 1; j <= all.length; j++) {
        const bp = j === all.length ? this.player.pos : all[j].pos;
        const dx = bp.x - a.pos.x, dz = bp.z - a.pos.z, d = Math.hypot(dx, dz), min = 11;
        if (d < min && d > 1e-3 && Math.abs(bp.y - a.pos.y) < 15) {
          const push = (min - d) / d * 0.5;
          a.pos.x -= dx * push; a.pos.z -= dz * push;
          if (j === all.length) { bp.x += dx * push; bp.z += dz * push; }
          else { bp.x += dx * push; bp.z += dz * push; }
        }
      }
    }
  }
  moveEnemy(e, dt, dying) {
    const w = this.world, k = e.scale, r = 3.4 * k;
    if (!e.grounded) {
      e.vel.y -= 30 * dt;
      if (e.hover > 0 && !dying) { e.hover -= dt; e.vel.y = Math.min(12, e.vel.y + 36 * dt); }
    }
    e.pos.addScaledVector(e.vel, dt);
    e.bumped = w.collide(e.pos, r, e.pos.y);
    if (e.bumped && !dying && !(e.noLos > 1.2)) { e.strafe *= -1; e.strafeT = rand(1.5, 3); }
    e.pos.x = clamp(e.pos.x, -700, 700); e.pos.z = clamp(e.pos.z, -700, 700);
    const g = w.support(e.pos.x, e.pos.z, r, e.pos.y);
    if (e.grounded) {
      if (g < e.pos.y - 1.6) e.grounded = false;
      else { e.pos.y = damp(e.pos.y, g, 25, dt); e.vel.y = 0; }
    } else if (e.pos.y <= g && e.vel.y <= 0) {
      const s = clamp(-e.vel.y / 25, 0, 1.5);
      e.pos.y = g; e.vel.y = 0; e.grounded = true; e.hover = 0;
      e.m.impact(s); e.m.landV = (e.m.landV || 0) + s * 6;
      if (s > 0.3) { this.fx.dust(_c.set(e.pos.x, g, e.pos.z), 1.2 * s * k); this.audio.enemyStep(e.pos, s * 1.3); }
    }
    const sp = Math.hypot(e.vel.x, e.vel.z);
    if (e.grounded && sp > 3) w.stomp(e.pos.x, e.pos.z, 4 * k, e.vel.x, e.vel.z, (o) => this.audio.trample(_c.set(o.x, 0, o.z), o.kind));
  }
  enemyQB(e, side) {
    if (e.qbCd > 0) return;
    const toP = _c.subVectors(this.player.pos, e.pos).setY(0).normalize();
    const perp = V3(toP.z, 0, -toP.x).multiplyScalar(e.strafe * side);
    e.vel.x = perp.x * 60; e.vel.z = perp.z * 60;
    e.qbT = 0.22; e.qbCd = rand(1.4, 2.6);
    this.audio.enemyBoost(e.id, e.pos, 1);
    if (e.grounded) this.fx.skid(e.pos, perp, 1);
  }

  enemyFire(e, dt, dist, pc) {
    const K = e.K, T = this.tier;
    e.fireCd -= dt; e.altCd -= dt; e.warn = Math.max(0, e.warn - dt * 2);
    const canSee = e.los && dist < K.range;
    const muz = () => { e.m.muzzle.updateWorldMatrix(true, false); return e.m.muzzle.getWorldPosition(V3()); };
    if (e.kind === 'grunt') {
      // 機槍連射
      if (e.burst > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) { e.burst--; e.burstT = 0.085; this.bullet(e, muz(), pc, dist); }
      } else if (e.fireCd <= 0 && canSee) {
        if (this.canAttack(e)) { e.burst = 9; e.burstT = 0; e.fireCd = rand(2.2, 3.6) * T.fire; } else e.fireCd = rand(0.3, 0.8);
      }
      // 火箭砲（前兩波不開）
      if (e.altCd <= 0 && canSee && dist < 450) {
        e.altCd = rand(7, 11) * T.fire;
        if (T.alt && this.canAttack(e)) this.shell(e, muz(), pc, 170, 650);
      }
    } else if (e.kind === 'ace') {
      // 光束步槍：先蓄 0.45 秒（有警示），這段時間閃避就打不到
      if (e.charge > 0) {
        e.charge -= dt; e.warn = 1;
        if (this.player.qbT > 0) e.dodged = true;
        if (e.charge <= 0) {
          const from = muz(), to = V3().copy(pc);
          const miss = e.dodged || Math.random() < clamp(this.player.speed / 110, 0, 0.5) + (T.aim - 1) * 0.5;
          if (miss) to.add(_a.set(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize().multiplyScalar(rand(10, 18)));
          const ext = V3().subVectors(to, from).normalize().multiplyScalar(miss ? 400 : 0).add(to);
          const tw = this.world.raycast(from, ext, _n);
          const end = tw >= 0 ? V3().lerpVectors(from, ext, tw) : ext;
          this.fx.beam(from, miss ? end : to, 'enemy');
          this.fx.muzzle(from, _a.subVectors(to, from), 'beam');
          this.audio.enemyBeam(from);
          if (!miss) { this.hurt(520, from, 'beam'); this.fx.impact(to, _n.subVectors(from, to).normalize(), 'beam'); }
          else { this.note(e.dodged ? 'DODGED' : 'MISS', 'gr'); if (tw >= 0) this.fx.impact(end, _n, 'building'); }
          e.dodged = false;
        }
      } else if (e.fireCd <= 0 && canSee) {
        if (this.canAttack(e)) { e.charge = 0.5; e.fireCd = rand(1.6, 2.4) * T.fire; e.dodged = false; } else e.fireCd = rand(0.3, 0.8);
      }
    } else {
      // 重裝：飛彈齊射（先響鎖定警報）＋砲擊
      if (e.volley > 0) {
        e.volleyT -= dt; e.warn = 1;
        if (e.volleyT <= 0) {
          e.volley--; e.volleyT = 0.12;
          const p = e.m.bones.torso.localToWorld(V3((e.volley % 2 ? 1 : -1) * 3.2, 6.5, -1));
          const v = V3(rand(-8, 8), rand(26, 34), 0).add(_a.set(Math.sin(e.face), 0, Math.cos(e.face)).multiplyScalar(14));
          this.missiles.push({ own: 'enemy', pos: p, vel: v, target: 'player', t: 0, speed: v.length(), vmax: 115, acc: 90, turn: 1.45, dmg: 300, h: this.fx.missile('enemy'), life: 7.5, from: e.pos.clone() });
          this.audio.missileLaunch3d(p);
        }
      } else if (e.fireCd <= 0 && canSee && dist > 90) {
        if (this.canAttack(e)) { e.volley = 6; e.volleyT = 1.1; e.fireCd = rand(8, 11) * T.fire; this.audio.alert('lock'); } else e.fireCd = rand(0.4, 1);
      }
      if (e.altCd <= 0 && canSee) { e.altCd = rand(3.5, 5.5) * T.fire; if (this.canAttack(e)) this.shell(e, muz(), pc, 210, 800); }
    }
  }
  // 機槍子彈：瞬間判定，有散布，玩家跑得快就比較打不中
  bullet(e, from, pc, dist) {
    const pl = this.player;
    const lead = dist / 900 * rand(0.3, 1.1);
    const to = V3().copy(pc).addScaledVector(pl.vel, lead);
    const spread = 0.022 * dist * this.tier.aim;
    to.x += rand(-spread, spread); to.y += rand(-spread * 0.7, spread * 0.7); to.z += rand(-spread, spread);
    const dir = _a.subVectors(to, from).normalize();
    const cap = this.hero.capsule();
    const t = rayCapsule(from, dir, cap, dist + 60);
    this.fx.muzzle(from, dir, 'mg');
    this.audio.mg(from);
    if (t >= 0) {
      const hp = V3().copy(from).addScaledVector(dir, t);
      if (Math.random() < 0.5) this.fx.tracer(from, hp);
      this.hurt(40, from, 'bullet');
      this.fx.impact(hp, _n.copy(dir).negate(), 'armor');
      this.audio.impact(hp, 'armor');
    } else {
      const end = V3().copy(from).addScaledVector(dir, dist + 300);
      const tw = this.world.raycast(from, end, _n);
      const hp = tw >= 0 ? V3().lerpVectors(from, end, tw) : end;
      if (Math.random() < 0.6) this.fx.tracer(from, hp);
      if (tw >= 0) this.fx.impact(hp, _n, _n.y > 0.7 ? 'ground' : 'building');
      if (Math.random() < 0.35) this.audio.whiz(_b.copy(pc).addScaledVector(dir, 6));
    }
  }
  // 砲彈（直線飛、有提前量，看得到、閃得掉）
  shell(e, from, pc, speed, dmg) {
    const pl = this.player, dist = from.distanceTo(pc);
    const to = V3().copy(pc).addScaledVector(pl.vel, dist / speed * rand(0.6, 1.0));
    const v = to.sub(from).normalize().multiplyScalar(speed);
    this.missiles.push({ own: 'enemy', pos: from.clone(), vel: v, target: null, t: 0, speed, vmax: speed, acc: 0, turn: 0, dmg, h: this.fx.missile('enemy'), life: 5, shell: true, from: e.pos.clone() });
    this.fx.muzzle(from, v, 'cannon');
    this.audio.cannon(from);
  }

  // ---------------------------------------------------------------- 飛彈與砲彈
  updateMissiles(dt) {
    const w = this.world, pl = this.player;
    const pc = this.hero.bones.torso.getWorldPosition(V3());
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const M = this.missiles[i];
      M.t += dt;
      const prev = _a.copy(M.pos);
      // 玩家快速閃避：附近追蹤中的敵方飛彈失去鎖定
      if (M.own === 'enemy' && M.turn > 0 && pl.qbT > 0 && M.pos.distanceTo(pc) < 240) {
        M.turn = 0;
        if (!this.evadeNote || this.stats.time - this.evadeNote > 0.5) { this.note('MISSILE EVADED', 'gr'); this.evadeNote = this.stats.time; }
      }
      let tp = null;
      if (M.target === 'player') tp = pc;
      else if (M.target && !M.target.gone) tp = M.target.chest(_b);
      else if (M.aim) tp = M.aim;
      M.speed = Math.min(M.vmax, M.speed + M.acc * dt);
      const dir = _c.copy(M.vel).normalize();
      if (tp && M.t > 0.28 && M.turn > 0) {
        const want = _d.subVectors(tp, M.pos).normalize();
        const ang = dir.angleTo(want), mx = M.turn * dt;
        if (ang > 1e-4) { const ax = _n.crossVectors(dir, want).normalize(); dir.applyAxisAngle(ax, Math.min(ang, mx)); }
        // 閃過了（已經擦身而過）就不再轉
        if (ang > 1.6 && M.own === 'enemy') M.turn = 0;
      } else if (M.t <= 0.28 && M.own === 'player') M.vel.y -= 0;
      M.vel.copy(dir).multiplyScalar(M.speed);
      if (M.shell) M.vel.y -= 4 * dt;
      M.pos.addScaledVector(M.vel, dt);
      if (M.h) { M.h.pos.copy(M.pos); M.h.dir.copy(dir); }
      // 命中判定
      let hit = null, hitE = null;
      const tw = w.raycast(prev, M.pos, _n);
      if (tw >= 0) hit = V3().lerpVectors(prev, M.pos, tw);
      if (M.own === 'player') {
        for (const e of this.enemies) {
          if (e.dead || e.gone) continue;
          const c = e.chest(_b);
          if (c.distanceTo(M.pos) < 7 * e.scale) { hitE = e; hit = M.pos.clone(); break; }
        }
      } else if (!this.dead) {
        const cap = this.hero.capsule();
        const dx = M.pos.x - cap.x, dz = M.pos.z - cap.z;
        if (Math.hypot(dx, dz) < cap.r + 2 && M.pos.y > cap.y0 - 2 && M.pos.y < cap.y1 + 2) hit = M.pos.clone();
        // 擦身而過：音效
        if (!M.whiz && M.pos.distanceTo(pc) < 25) { M.whiz = true; this.audio.whiz(M.pos); }
      }
      if (!hit && M.t > M.life) hit = M.pos.clone();
      if (hit) {
        this.fx.missileEnd(M.h);
        this.fx.explosion(hit, M.shell ? 1.4 : 1.1);
        this.audio.explosion(hit, M.shell ? 1.5 : 1);
        if (M.own === 'player') {
          if (hitE) this.damageEnemy(hitE, M.dmg * (this.od.active ? 1.25 : 1), W.msl.stag, hit, M.vel.clone().normalize());
          for (const e of this.enemies) if (e !== hitE && !e.dead && e.chest(_b).distanceTo(hit) < 14) this.damageEnemy(e, M.dmg * 0.4, 10, hit, M.vel.clone().normalize());
        } else {
          const d = hit.distanceTo(pc);
          if (d < 14) this.hurt(M.dmg * (1 - d / 22), M.from || hit, M.shell ? 'shell' : 'missile');
          const ds = clamp(1 - d / 120, 0, 1);
          if (ds > 0 && d >= 14) this.cockpit.kick('hit', ds * 0.4, 0);
        }
        this.missiles.splice(i, 1);
      }
    }
  }

  // 警報：敵機飛彈飛過來、重裝機在鎖你、王牌在蓄光束
  updateAlerts(dt) {
    const pc = this.player.pos;
    let inc = 0, lock = 0;
    for (const M of this.missiles) {
      if (M.own !== 'enemy' || M.shell) continue;
      const d = M.pos.distanceTo(pc);
      if (d < 600 && M.turn > 0) { inc++; lock = Math.max(lock, 1); }
    }
    for (const e of this.enemies) if (!e.dead && e.warn > 0) lock = Math.max(lock, e.kind === 'heavy' ? 0.6 : 0.4);
    if (inc > this.incoming) this.audio.alert('missile');
    this.incoming = inc;
    this.lockAlert = damp(this.lockAlert, lock, 12, dt);
    this.audio.setLockAlert(lock);
  }

  // ---------------------------------------------------------------- 碎片
  updateDebris(dt) {
    const w = this.world;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], m = d.mesh;
      d.t += dt;
      if (d.t < 7) {
        d.vel.y -= 30 * dt;
        m.position.addScaledVector(d.vel, dt);
        _q.setFromAxisAngle(d.ax, d.av * dt);
        m.quaternion.premultiply(_q);
        const g = w.height(m.position.x, m.position.z) + 0.6;
        if (m.position.y < g) {
          m.position.y = g;
          if (d.vel.y < -6) { this.audio.debris(m.position); if (Math.random() < 0.5) this.fx.dust(m.position, 0.5); }
          d.vel.y *= -0.28; d.vel.x *= 0.55; d.vel.z *= 0.55; d.av *= 0.5;
        }
        if (d.burn && Math.random() < dt * 8) this.fx.trail(m.position);
      } else {
        m.position.y -= dt * 0.8;
        if (d.t > 11) { m.removeFromParent(); this.debris.splice(i, 1); }
      }
    }
  }

  // 雷達資料
  radar() {
    const out = [];
    for (const e of this.enemies) if (!e.gone) out.push({ x: e.pos.x, z: e.pos.z, kind: e.dead ? 'wreck' : e.kind, locked: e === this.lockTarget || e === this.soft });
    for (const M of this.missiles) if (M.own === 'enemy') out.push({ x: M.pos.x, z: M.pos.z, kind: 'missile' });
    return out;
  }

  // 清場（重新開始用）
  dispose() {
    for (const e of this.enemies) e.m.root.removeFromParent();
    for (const d of this.debris) d.mesh.removeFromParent();
    for (const M of this.missiles) this.fx.missileEnd(M.h);
    this.enemies = []; this.debris = []; this.missiles = [];
  }
}
