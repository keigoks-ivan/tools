const WIDTH = 1280;
const HEIGHT = 720;
const BOUNDS = { minX: 90, maxX: 1190, minY: 210, maxY: 625 };
const MAX_ENEMIES = 14;
const MAX_ATTACKERS = 3;
const MAX_EVENTS = 96;
// 無雙模式（僅 3D 版開啟）：每段連斬的時長、打擊時間點與範圍，時間對齊 3D 動作的刀尖速度峰值
export const MUSOU_CHAIN = [
  { duration: 0.48, hits: [0.19], cancel: 0.26, radius: 150, arc: Math.PI * 0.75, damage: 5 },
  { duration: 0.46, hits: [0.18], cancel: 0.24, radius: 150, arc: Math.PI * 0.75, damage: 5 },
  { duration: 0.77, hits: [0.13, 0.31, 0.67], cancel: 0.62, radius: 160, arc: Math.PI * 0.75, damage: 3 },
  { duration: 0.85, hits: [0.19, 0.68], cancel: 0.7, radius: 180, arc: Math.PI * 2, damage: 4 },
  { duration: 1.56, hits: [0.14, 0.31, 0.56, 1.47], cancel: Infinity, radius: 195, arc: Math.PI * 2, damage: 4, finisher: 9 },
];
export const MUSOU_HEAVY = { duration: 0.96, hits: [0.63], cancel: Infinity, radius: 200, arc: Math.PI * 2, damage: 12, finisher: 12 };
export const MUSOU_SPECIAL = { duration: 2.0, hits: [0.22, 0.97, 1.72], radius: 280, damage: 12 };
// 無雙模式出招時的自動轉向：只吸附前方近距離的敵人
export const MUSOU_AIM = { range: 170, arc: 0.6 };
// 敵將／守將防禦（敵人帶 guard 欄位才生效）：正面輕攻擊只吃兩成傷害；重擊、第五段收招、絕招破防。
// 破防硬直結束後 rearm 秒內不能再破防（此時重擊也算一般攻擊），避免重擊連續定身
export const GUARD = { arc: 70 * Math.PI / 180, chip: 0.2, breakSeconds: 1.5, rearm: 3 };
// 快兵閃身（敵人帶 evade 機率才生效）：被輕攻擊時橫跳，跳躍期間不吃輕攻擊
export const SIDESTEP = { distance: 55, seconds: 0.3 };
// 跳躍（jump 選項才生效）：0.8 秒弧線、最高 1.2 公尺，空中可轉向；空中輕攻擊每跳最多兩下，重擊下墜衝擊。
// 主角離地超過 evadeHeight 公尺時，地面橫掃／砸地與小兵爪擊都打不到
export const JUMP = {
  duration: 0.8, height: 1.2, steer: 0.85, evadeHeight: 0.6, landRecover: 0.1, fallSpeed: 6,
  airSlash: { duration: 0.32, hit: 0.1, radius: 150, arc: Math.PI, damage: 5, max: 2, hang: 0.55 },
  plunge: { fall: 0.18, radius: 190, damage: 10, recover: 0.32, push: [26, 18] },
};
// 無雙亂舞（musouFlurry 選項才生效）。所有時間都是「遊戲時間」秒：畫面依 arena.timeScale() 放慢時，
// 呼叫端用 realDt × timeScale 推進 update，動作與計時一起變慢，不會錯位。freeze 是實際秒數的定格，
// 由畫面自行暫停（期間不推進遊戲時間）。體力 ≤ trueHp 比例時改用 true 設定（真・無雙）。
export const MUSOU_FLURRY = {
  standard: {
    duration: 4.2, swingStart: 0.55, swingEnd: 3.3, swings: 10, radius: 220, damage: 4, steer: 80,
    impact: 3.6, finishRadius: 320, finishDamage: 20, damageScale: 1,
    // time-scale keys [gameTime, scale] (linear between keys) and real-time freeze frames
    timeScale: [[0, 1], [3.51, 1], [3.51, 0.3], [3.69, 0.3], [4.2, 1]],
    freezes: [{ at: 0, real: 0.08 }, { at: 3.6, real: 0.05 }],
    leapAt: 3.3,          // 天刃 choreography (3D renderer only): hero leaps from this time to `impact`
    sweeps: [4, 7, 10],   // 1-based swing numbers where the spirit blade sweeps 360° across the arena (horizontal-spin beats)
  },
  true: {
    duration: 5.0, swingStart: 0.55, swingEnd: 4.0, swings: 12, radius: 220, damage: 4, steer: 80,
    impact: 4.4, finishRadius: 400, finishDamage: 20, damageScale: 1.5,
    timeScale: [[0, 1], [4.325, 1], [4.325, 0.15], [4.475, 0.15], [5.0, 1]],
    freezes: [{ at: 0, real: 0.08 }, { at: 4.4, real: 0.08 }],
    leapAt: 4.1,
    sweeps: [4, 7, 10],
  },
  trueHp: 0.3,          // hp / maxHp at or below this → 真・無雙
  swingPush: [8, 6],    // light launch per swing
  finishPush: [30, 22], // big launch at the impact
  energyOnHurt: 3,      // gauge gained per hit taken
};

/*
 * Events added by the opt-in jump / musouFlurry modes (x, y in Arena px, radius in px, times in game seconds):
 *   jump        { x, y, facing, duration, height }            take-off
 *   airSlash    { x, y, facing, index (0|1), radius, arc, height }  at the hit frame
 *   plunge      { x, y, facing, height, duration }            dive starts (duration = fall time)
 *   land        { x, y, facing, plunge, radius, damage }      touch-down; plunge:true = shockwave
 *   airEvade    { x, y, sourceId, height }                    a claw / ground attack passed under the hero
 *   musouStart  { x, y, facing, true, duration, radius, finishRadius, swings: [t…], impact, timeScale: [[t, scale]…],
 *                 freezes: [{ at, real }], stunned: [enemyId…], leapAt, sweeps: [1-based swing numbers…] }
 *                 full timeline at activation (leapAt / sweeps are opt-in: only present when the profile has them)
 *   special     { x, y, radius, flurry: true, true, duration, finishAt }   (kept for older listeners)
 *   swing       { …, kind: 'special', flurry: true, true, index, last, radius, hits, sweep }   every flurry swing
 *               (sweep: true on the swings named in MUSOU_FLURRY.sweeps — the 3D renderer sweeps the spirit blade)
 *   musouFinish { x, y, facing, radius, damage, true }        the blast at `impact`
 *   musouFreeze { x, y, real, at, true }                      hold the frame for `real` seconds (no game time)
 *   musouEnd    { x, y, true }                                control returns
 * Time: everything above is game time. The renderer should step update() with realDt × arena.timeScale()
 * (and hold dt = 0 during a musouFreeze) so animation, FX and gameplay stay in sync.
 */

/**
 * Small deterministic 2D musou combat simulation. Input axes are held values
 * in [-1, 1]; attack, heavy, dodge and special are one-frame press edges.
 */
export class Arena {
  /**
   * Opt-in options (all off by default; the default Arena is unchanged):
   * - bounds: custom movement rectangle { minX, maxX, minY, maxY } in px (60 px = 1 m).
   * - maxAttackers: how many enemies may wind up / engage at once (default 2 warrior, 3 otherwise).
   * - director: an external level director owns encounters. reset() spawns nothing,
   *   update() runs no waves or boss queue, the boss kill does not win, and the
   *   public spawn / setBounds / stagger / hurtHero / win API drives the fight.
   *   Enemy fields honoured in any mode when present: speed, damage, telegraphTime,
   *   recover, specialScale, ai ('external' = the director moves it; the Arena only
   *   resolves damage), fixed (no knockback, not moved by separation), prop (not
   *   counted as a kill, ignored by separation), intangible (cannot be hit, e.g. airborne), guard (see GUARD),
   *   evade (sidestep chance vs light hits, see SIDESTEP), turnRate (rad/s facing turn),
   *   guardRearm (seconds, overrides GUARD.rearm).
   * - jump: input.jump starts a jump (see JUMP); hero.height (m) is added to the hero.
   * - musouFlurry (with musou): special becomes the long 無雙亂舞 (see MUSOU_FLURRY) and taking
   *   damage fills the gauge.
   */
  constructor({ seed = 1, warriorMode = false, musou = false, director = false, bounds = null, maxAttackers = null, jump = false, musouFlurry = false } = {}) {
    this.seed = seed >>> 0;
    this.warriorMode = warriorMode;
    this.musou = musou;
    this.jumpEnabled = jump;
    this.musouFlurry = musou && musouFlurry;
    this.director = director;
    this.maxAttackersOverride = maxAttackers;
    this.bounds = { ...(bounds || BOUNDS) };
    this.waveGoal = warriorMode ? 10 : 20;
    this.finalWave = warriorMode ? 2 : 3;
    this.reset();
  }

  reset() {
    this.randomState = this.seed;
    this.nextEnemyId = 1;
    this.time = 0;
    this.stepDt = 0;
    this.attack = null;
    this.inputBuffer = null;
    this.enemies = [];
    this.events = [];
    this.hero = {
      x: WIDTH * 0.5, y: 500, hp: 100, maxHp: 100, energy: 0,
      combo: 0, action: 'idle', actionTime: 0, facing: -Math.PI / 2,
      invulnerable: 0, dodgeCooldown: 0,
    };
    if (this.jumpEnabled) {
      this.hero.height = 0;
      this.air = null;
    }
    this.state = 'play';
    this.wave = 1;
    this.waveKills = 0;
    this.kills = 0;
    this.spawnClock = 0;
    this.bossQueued = false;
    this.attackerTokens = 0;
    this.lastLightAt = -Infinity;
    this.attackSerial = 0;
    this.moveInput = { x: 0, y: 0 };
    if (this.director) return this.snapshot();
    this._emit('wave', { wave: 1, x: this.hero.x, y: this.hero.y });
    for (let i = 0; i < (this.warriorMode ? 4 : 5); i++) this._spawn(i === (this.warriorMode ? 3 : 4) ? 'runner' : 'grunt');
    return this.snapshot();
  }

  update(dt, input = {}) {
    if (this.state !== 'play' || !Number.isFinite(dt) || dt <= 0) return this.snapshot();
    // Prevent a suspended tab from resolving several combat phases at once.
    dt = Math.min(dt, 0.1);
    this.stepDt = dt;
    this.time += dt;
    if (this.inputBuffer) {
      this.inputBuffer.remaining -= dt;
      if (this.inputBuffer.remaining <= 0) this.inputBuffer = null;
    }
    this.hero.invulnerable = Math.max(0, this.hero.invulnerable - dt);
    this.hero.dodgeCooldown = Math.max(0, this.hero.dodgeCooldown - dt);
    this._readInput(input);
    this._advanceHero(dt);
    this._advanceEnemies(dt);
    this._removeDefeated();
    if (this.director) return this.snapshot();
    if (this.bossQueued && this.enemies.length === 0 && this.state === 'play') {
      this.bossQueued = false;
      this._spawn('boss');
    }
    if (this.enemies.length < (this.warriorMode ? 8 : MAX_ENEMIES) && !this.bossQueued && this.waveKills < this.waveGoal) {
      this.spawnClock -= dt;
      if (this.spawnClock <= 0) {
        this._spawn(this._nextRole());
        this.spawnClock = this.wave === 1 ? 0.72 : this.wave === 2 ? 0.64 : 0.58;
      }
    }
    return this.snapshot();
  }

  snapshot() {
    return {
      width: WIDTH,
      height: HEIGHT,
      bounds: { ...this.bounds },
      state: this.state,
      wave: this.wave,
      waveKills: this.waveKills,
      waveGoal: this.waveGoal,
      kills: this.kills,
      attackerTokens: this.attackerTokens,
      maxAttackers: this.maxAttackersOverride ?? (this.warriorMode ? 2 : MAX_ATTACKERS),
      hero: { ...this.hero },
      enemies: this.enemies.map(enemy => ({ ...enemy })),
    };
  }

  drainEvents() {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  // ---- Director API (meant for `director: true`; harmless otherwise) ----

  /** Spawns an enemy at (x, y) px; `options` overrides any enemy field (hp also sets maxHp). */
  spawn(role, x, y, options = {}) {
    const enemy = this._spawn(role, { x, y, ...options });
    return enemy;
  }

  /** Replaces the movement rectangle for the hero and every enemy. */
  setBounds(bounds) {
    this.bounds = { ...bounds };
  }

  /** Holds an Arena-driven enemy in hit stun for `seconds`; later hits cannot shorten it. */
  stagger(enemy, seconds) {
    if (!enemy || enemy.action === 'dead' || enemy.ai === 'external') return false;
    enemy.action = 'hit';
    enemy.actionTime = 0;
    enemy.hitStun = Math.max(enemy.hitStun || 0, seconds);
    enemy.staggerUntil = this.time + seconds;
    enemy.engaged = false;
    enemy.attackResolved = true;
    return true;
  }

  /** Damages the hero from a scripted attack; respects invulnerability. Returns true on a hit. */
  hurtHero(damage, source = {}) {
    if (this.state !== 'play' || this.hero.invulnerable > 0) return false;
    // source.ground: a ground-level attack (sweep, slam) that a jumping hero clears.
    if (source.ground && this._heroEvades()) {
      this._emit('airEvade', { x: this.hero.x, y: this.hero.y, sourceId: source.id ?? 0, height: this.hero.height });
      return false;
    }
    this._hurtHero({ id: source.id ?? 0, role: source.role ?? 'scripted', facing: source.facing ?? 0, damage });
    return true;
  }

  win() {
    this._win();
  }

  _readInput(input) {
    const hero = this.hero;
    const dx = clamp(Number(input.x) || 0, -1, 1);
    const dy = clamp(Number(input.y) || 0, -1, 1);
    const length = Math.hypot(dx, dy);
    const moveX = length > 1 ? dx / length : dx;
    const moveY = length > 1 ? dy / length : dy;
    this.moveInput = { x: moveX, y: moveY };
    if (length > 0.01 && (!this.warriorMode || hero.action !== 'attack' && hero.action !== 'heavy')) hero.facing = Math.atan2(moveY, moveX);
    if (this.jumpEnabled && (hero.action === 'jump' || hero.action === 'airSlash' || hero.action === 'plunge')) {
      this._readAirInput(input, moveX, moveY);
      return;
    }

    if (pressed(input.special)) {
      this.inputBuffer = null;
      if (hero.energy >= 100) this._startSpecial();
      return;
    }
    if (pressed(input.dodge)) {
      this.inputBuffer = null;
      if (hero.action !== 'dead' && hero.action !== 'win' && hero.dodgeCooldown <= 0) this._startDodge(moveX, moveY);
      return;
    }
    if (this.jumpEnabled && pressed(input.jump) && (hero.action === 'idle' || hero.action === 'run')) {
      this.inputBuffer = null;
      this._startJump();
      return;
    }
    if (pressed(input.heavy) || pressed(input.attack)) {
      this.inputBuffer = { kind: pressed(input.heavy) ? 'heavy' : 'attack', remaining: 0.18 };
    }
    if (this.inputBuffer && this._canConsumeAttack(this.inputBuffer.kind)) {
      const kind = this.inputBuffer.kind;
      this.inputBuffer = null;
      const branch = kind === 'heavy' && hero.action === 'attack';
      this._startAttack(kind, branch);
      return;
    }
    if (hero.action === 'idle' || hero.action === 'run') {
      hero.action = length > 0.01 ? 'run' : 'idle';
      if (length > 0.01) {
        hero.x = clamp(hero.x + moveX * 295 * this._stepDt, this.bounds.minX, this.bounds.maxX);
        hero.y = clamp(hero.y + moveY * 235 * this._stepDt, this.bounds.minY, this.bounds.maxY);
      }
    }
  }

  // Set for the duration of update so input movement uses the same dt as actions.
  get _stepDt() { return this.stepDt || 0; }

  _canConsumeAttack(kind) {
    const hero = this.hero;
    if (hero.action === 'idle' || hero.action === 'run') return true;
    if (hero.action !== 'attack') return false;
    if (this.musou) return hero.actionTime >= (this.attack?.cancel ?? Infinity);
    if (this.warriorMode) return hero.actionTime >= 0.15 && hero.actionTime <= 0.3;
    return kind === 'heavy'
      ? hero.actionTime >= 0.16 && hero.actionTime <= 0.34
      : hero.actionTime >= 0.2 && hero.actionTime <= 0.37;
  }

  _startAttack(kind, branch = false) {
    const hero = this.hero;
    const now = this.time || 0;
    if (this.warriorMode) {
      const freeAim = Math.hypot(this.moveInput.x, this.moveInput.y) < 0.1;
      const nearest = this.enemies.filter(enemy => enemy.action !== 'dead' && !enemy.intangible)
        .map(enemy => ({ enemy, distance: distance(hero, enemy) }))
        .filter(candidate => this.musou
          ? candidate.distance <= MUSOU_AIM.range && Math.abs(angleDifference(hero.facing, Math.atan2(candidate.enemy.y - hero.y, candidate.enemy.x - hero.x))) < MUSOU_AIM.arc
          : candidate.distance <= 230 && (freeAim ||
          Math.abs(angleDifference(hero.facing, Math.atan2(candidate.enemy.y - hero.y, candidate.enemy.x - hero.x))) < 1.2))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest) hero.facing = Math.atan2(nearest.enemy.y - hero.y, nearest.enemy.x - hero.x);
    }
    if (this.musou) {
      if (kind === 'attack') {
        hero.combo = hero.action === 'attack' && hero.combo < MUSOU_CHAIN.length ? hero.combo + 1 : 1;
        this.lastLightAt = now;
      }
      const move = kind === 'attack' ? MUSOU_CHAIN[hero.combo - 1] : MUSOU_HEAVY;
      hero.action = kind;
      hero.actionTime = 0;
      this.attackSerial++;
      this.attack = { kind, ...move, hitIndex: 0, serial: this.attackSerial, branch, musou: true };
      this._emit('slash', { x: hero.x, y: hero.y, facing: hero.facing, kind, combo: hero.combo, branch });
      return;
    }
    if (kind === 'attack') {
      hero.combo = now - this.lastLightAt <= 0.8 ? Math.min(3, hero.combo + 1) : 1;
      this.lastLightAt = now;
    }
    hero.action = kind;
    hero.actionTime = 0;
    this.attackSerial++;
    this.attack = {
      kind,
      duration: kind === 'attack' ? (this.warriorMode ? 0.36 : 0.42) : (this.warriorMode ? 0.58 : 0.7),
      activeStart: kind === 'attack' ? (this.warriorMode ? 0.075 : 0.11) : (this.warriorMode ? 0.22 : 0.27),
      activeEnd: kind === 'attack' ? (this.warriorMode ? 0.19 : 0.24) : (this.warriorMode ? 0.42 : 0.48),
      radius: kind === 'attack' ? 145 + Math.min(hero.combo, 3) * 8 : branch ? 215 : 190,
      arc: kind === 'attack' ? Math.PI * 0.78 : Math.PI * 0.94,
      damage: kind === 'attack' ? (this.warriorMode ? hero.combo === 3 ? 7 : 5 : hero.combo === 3 ? 4 : 3) : branch ? 10 : 8,
      serial: this.attackSerial,
      hitDone: false,
      branch,
    };
    this._emit('slash', { x: hero.x, y: hero.y, facing: hero.facing, kind, combo: hero.combo, branch });
  }

  _startDodge(dx, dy) {
    const hero = this.hero;
    if (hero.action === 'dead' || hero.action === 'win') return;
    const direction = Math.hypot(dx, dy) > 0.01 ? Math.atan2(dy, dx) : hero.facing;
    hero.facing = direction;
    hero.action = 'dodge';
    hero.actionTime = 0;
    hero.invulnerable = 0.42;
    hero.dodgeCooldown = 0.58;
    this.attack = null;
    hero.x = clamp(hero.x + Math.cos(direction) * 76, this.bounds.minX, this.bounds.maxX);
    hero.y = clamp(hero.y + Math.sin(direction) * 56, this.bounds.minY, this.bounds.maxY);
    this._emit('dodge', { x: hero.x, y: hero.y, facing: direction });
  }

  // ---- Jump (opt-in) ----
  _heroEvades() {
    return this.jumpEnabled && this.hero.height > JUMP.evadeHeight;
  }

  _startJump() {
    const hero = this.hero;
    hero.action = 'jump';
    hero.actionTime = 0;
    this.attack = null;
    this.air = { t: 0, slashes: 0, plungeFrom: 0, recover: JUMP.landRecover };
    this._emit('jump', { x: hero.x, y: hero.y, facing: hero.facing, duration: JUMP.duration, height: JUMP.height });
  }

  _readAirInput(input, moveX, moveY) {
    const hero = this.hero, dt = this._stepDt;
    if (hero.action === 'plunge') return;   // straight down, no steering
    hero.x = clamp(hero.x + moveX * 295 * JUMP.steer * dt, this.bounds.minX, this.bounds.maxX);
    hero.y = clamp(hero.y + moveY * 235 * JUMP.steer * dt, this.bounds.minY, this.bounds.maxY);
    // No dodge or musou in the air; heavy dives, light slashes (limited per jump).
    if (pressed(input.heavy)) {
      hero.action = 'plunge';
      hero.actionTime = 0;
      this.air.plungeFrom = hero.height;
      this._emit('plunge', { x: hero.x, y: hero.y, facing: hero.facing, height: hero.height, duration: JUMP.plunge.fall });
    } else if (pressed(input.attack) && hero.action === 'jump' && this.air.slashes < JUMP.airSlash.max) {
      this.air.slashes++;
      hero.action = 'airSlash';
      hero.actionTime = 0;
      this.air.slashDone = false;
    }
  }

  /** Advances jump / air slash / plunge / landing; returns true when it owned the hero this step. */
  _advanceAir(dt) {
    const hero = this.hero, air = this.air;
    if (hero.action === 'jump' || hero.action === 'airSlash') {
      // Air slashes hang the hero briefly by slowing the arc clock.
      air.t += dt * (hero.action === 'airSlash' ? JUMP.airSlash.hang : 1);
      const k = Math.min(1, air.t / JUMP.duration);
      hero.height = JUMP.height * 4 * k * (1 - k);
      if (hero.action === 'airSlash') {
        const slash = JUMP.airSlash, before = hero.actionTime;
        hero.actionTime += dt;
        if (!air.slashDone && before <= slash.hit && hero.actionTime >= slash.hit) {
          air.slashDone = true;
          this._emit('airSlash', { x: hero.x, y: hero.y, facing: hero.facing, index: air.slashes - 1, radius: slash.radius, arc: slash.arc, height: hero.height });
          for (const enemy of this.enemies) {
            if (enemy.action === 'dead' || distance(hero, enemy) > slash.radius) continue;
            if (Math.abs(angleDifference(hero.facing, Math.atan2(enemy.y - hero.y, enemy.x - hero.x))) > slash.arc * 0.5) continue;
            this._damageEnemy(enemy, slash.damage, 'attack');
          }
        }
        if (hero.actionTime >= slash.duration) hero.action = 'jump';
      }
      if (hero.action === 'jump') hero.actionTime = air.t;
      if (k >= 1) this._land(false);
      return true;
    }
    if (hero.action === 'plunge') {
      const p = JUMP.plunge;
      hero.actionTime += dt;
      hero.height = Math.max(0, air.plungeFrom * (1 - hero.actionTime / p.fall));
      if (hero.actionTime >= p.fall) {
        for (const enemy of this.enemies) {
          if (enemy.action === 'dead' || distance(hero, enemy) > p.radius) continue;
          this._damageEnemy(enemy, p.damage, 'heavy', p.push);
        }
        this._land(true);
      }
      return true;
    }
    if (hero.action === 'land') {
      hero.actionTime += dt;
      if (hero.actionTime >= air.recover) { hero.action = 'idle'; hero.actionTime = 0; }
      return true;
    }
    if (hero.height > 0) hero.height = Math.max(0, hero.height - JUMP.fallSpeed * dt);   // knocked out of the air
    return false;
  }

  _land(plunge) {
    const hero = this.hero;
    hero.height = 0;
    hero.action = 'land';
    hero.actionTime = 0;
    this.air.recover = plunge ? JUMP.plunge.recover : JUMP.landRecover;
    this._emit('land', { x: hero.x, y: hero.y, facing: hero.facing, plunge, radius: plunge ? JUMP.plunge.radius : 0, damage: plunge ? JUMP.plunge.damage : 0 });
  }

  _startSpecial() {
    const hero = this.hero;
    hero.energy = 0;
    hero.action = 'special';
    hero.actionTime = 0;
    if (this.musouFlurry) {
      const isTrue = hero.hp <= hero.maxHp * MUSOU_FLURRY.trueHp;
      const F = isTrue ? MUSOU_FLURRY.true : MUSOU_FLURRY.standard;
      const every = F.swings > 1 ? (F.swingEnd - F.swingStart) / (F.swings - 1) : 0;
      const swingTimes = Array.from({ length: F.swings }, (_, i) => F.swingStart + i * every);
      hero.invulnerable = F.duration + 0.1;
      this.attack = { kind: 'special', flurry: true, true: isTrue, profile: F, swingTimes, swingIndex: 0, finished: false, musou: true };
      // Activation: everything inside the musou radius is held in hit stun for the whole move.
      // Arena-driven enemies are staggered; director-driven ones get stunUntil (the director honours it).
      const stunned = [];
      for (const enemy of this.enemies) {
        if (enemy.action === 'dead' || enemy.prop || distance(hero, enemy) > F.finishRadius) continue;
        if (enemy.ai === 'external') enemy.stunUntil = this.time + F.duration;
        else this.stagger(enemy, F.duration);
        stunned.push(enemy.id);
      }
      const info = { x: hero.x, y: hero.y, facing: hero.facing, true: isTrue, duration: F.duration, radius: F.radius, finishRadius: F.finishRadius,
        swings: swingTimes, impact: F.impact, timeScale: F.timeScale, freezes: F.freezes, stunned,
        ...(Number.isFinite(F.leapAt) ? { leapAt: F.leapAt } : null), ...(Array.isArray(F.sweeps) ? { sweeps: F.sweeps } : null) };
      this._emit('special', { x: hero.x, y: hero.y, radius: F.radius, flurry: true, true: isTrue, duration: F.duration, finishAt: F.impact });
      this._emit('musouStart', info);
      this._emit('musouFreeze', { x: hero.x, y: hero.y, real: F.freezes[0].real, at: 0, true: isTrue });
      return;
    }
    if (this.musou) {
      hero.invulnerable = MUSOU_SPECIAL.duration + 0.1;
      this.attack = { kind: 'special', ...MUSOU_SPECIAL, hitIndex: 0, musou: true };
      this._emit('special', { x: hero.x, y: hero.y, radius: MUSOU_SPECIAL.radius });
      return;
    }
    hero.invulnerable = 0.68;
    this.attack = null;
    this._emit('special', { x: hero.x, y: hero.y, radius: 265 });
    for (const enemy of this.enemies) {
      if (enemy.action === 'dead' || distance(hero, enemy) > 265) continue;
      this._damageEnemy(enemy, 24, 'special');
    }
  }

  _advanceHero(dt) {
    const hero = this.hero;
    if (this.jumpEnabled && this._advanceAir(dt)) return;
    if (this.attack?.flurry && hero.action === 'special') {
      this._advanceFlurry(dt);
      return;
    }
    if (this.musou && this.attack?.musou && ['attack', 'heavy', 'special'].includes(hero.action)) {
      this._advanceMusou(dt);
      return;
    }
    if (hero.action === 'attack' || hero.action === 'heavy') {
      const attack = this.attack;
      const before = hero.actionTime;
      hero.actionTime += dt;
      if (this.warriorMode && attack && before < attack.activeEnd) {
        const moving = Math.hypot(this.moveInput.x, this.moveInput.y) > 0.1;
        const speed = moving ? 100 : attack.kind === 'attack' ? 90 : 70;
        const dx = moving ? this.moveInput.x : Math.cos(hero.facing);
        const dy = moving ? this.moveInput.y : Math.sin(hero.facing);
        hero.x = clamp(hero.x + dx * speed * dt, this.bounds.minX, this.bounds.maxX);
        hero.y = clamp(hero.y + dy * speed * dt * 0.8, this.bounds.minY, this.bounds.maxY);
      }
      if (attack && !attack.hitDone && before <= attack.activeEnd && hero.actionTime >= attack.activeStart) {
        attack.hitDone = true;
        this._resolveSlash(attack);
      }
      if (hero.actionTime >= attack.duration) {
        hero.action = 'idle';
        hero.actionTime = 0;
        this.attack = null;
      }
      return;
    }
    if (hero.action === 'dodge' || hero.action === 'special' || hero.action === 'hurt') {
      hero.actionTime += dt;
      const duration = hero.action === 'dodge' ? 0.42 : hero.action === 'special' ? 0.68 : 0.26;
      if (hero.actionTime >= duration) {
        hero.action = 'idle';
        hero.actionTime = 0;
      }
    }
  }

  /** Suggested render time scale (1 outside the musou). Multiply real dt by it before update(). */
  timeScale() {
    const attack = this.attack;
    if (!attack?.flurry || this.hero.action !== 'special') return 1;
    const keys = attack.profile.timeScale, t = this.hero.actionTime;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (t < keys[i][0]) continue;
      const next = keys[i + 1];
      if (!next || next[0] === keys[i][0]) return keys[i][1];
      return keys[i][1] + (next[1] - keys[i][1]) * (t - keys[i][0]) / (next[0] - keys[i][0]);
    }
    return 1;
  }

  _advanceFlurry(dt) {
    const hero = this.hero, attack = this.attack, F = attack.profile;
    hero.actionTime += dt;
    if (hero.actionTime < F.impact) {
      const moving = Math.hypot(this.moveInput.x, this.moveInput.y) > 0.1;
      if (moving) {
        hero.facing = Math.atan2(this.moveInput.y, this.moveInput.x);
        hero.x = clamp(hero.x + this.moveInput.x * F.steer * dt, this.bounds.minX, this.bounds.maxX);
        hero.y = clamp(hero.y + this.moveInput.y * F.steer * 0.8 * dt, this.bounds.minY, this.bounds.maxY);
      }
    }
    while (attack.swingIndex < attack.swingTimes.length && hero.actionTime >= attack.swingTimes[attack.swingIndex]) {
      const index = attack.swingIndex++;
      let hits = 0;
      for (const enemy of this.enemies) {
        if (enemy.action === 'dead' || distance(hero, enemy) > F.radius) continue;
        this._damageEnemy(enemy, F.damage * F.damageScale, 'special', MUSOU_FLURRY.swingPush);
        hits++;
      }
      const sweep = Array.isArray(F.sweeps) && F.sweeps.includes(index + 1);
      this._emit('swing', { x: hero.x, y: hero.y, facing: hero.facing, kind: 'special', combo: hero.combo, index, last: index === attack.swingTimes.length - 1, radius: F.radius, flurry: true, true: attack.true, hits, sweep });
    }
    if (!attack.finished && hero.actionTime >= F.impact) {
      attack.finished = true;
      const freeze = F.freezes.find(item => item.at === F.impact);
      this._emit('musouFinish', { x: hero.x, y: hero.y, facing: hero.facing, radius: F.finishRadius, damage: F.finishDamage * F.damageScale, true: attack.true });
      if (freeze) this._emit('musouFreeze', { x: hero.x, y: hero.y, real: freeze.real, at: F.impact, true: attack.true });
      for (const enemy of this.enemies) {
        if (enemy.action === 'dead' || distance(hero, enemy) > F.finishRadius) continue;
        this._damageEnemy(enemy, F.finishDamage * F.damageScale, 'special', MUSOU_FLURRY.finishPush);
      }
    }
    if (hero.actionTime >= F.duration) {
      hero.action = 'idle';
      hero.actionTime = 0;
      this.attack = null;
      this._emit('musouEnd', { x: hero.x, y: hero.y, true: attack.true });
    }
  }

  _advanceMusou(dt) {
    const hero = this.hero;
    const attack = this.attack;
    const before = hero.actionTime;
    hero.actionTime += dt;
    // 出招時往前衝，移動搖桿可以帶著連段轉向
    if (attack.kind !== 'special' && before < attack.duration * 0.6) {
      const moving = Math.hypot(this.moveInput.x, this.moveInput.y) > 0.1;
      if (moving) hero.facing = Math.atan2(this.moveInput.y, this.moveInput.x);
      const speed = attack.kind === 'heavy' ? 210 : 150;
      hero.x = clamp(hero.x + Math.cos(hero.facing) * speed * dt, this.bounds.minX, this.bounds.maxX);
      hero.y = clamp(hero.y + Math.sin(hero.facing) * speed * dt * 0.8, this.bounds.minY, this.bounds.maxY);
    }
    while (attack.hitIndex < attack.hits.length && hero.actionTime >= attack.hits[attack.hitIndex]) {
      const index = attack.hitIndex++;
      const last = attack.hitIndex === attack.hits.length;
      const damage = last && attack.finisher ? attack.finisher : attack.damage;
      const source = attack.kind === 'special' ? 'special' : last && attack.finisher ? 'heavy' : attack.kind;
      this._emit('swing', { x: hero.x, y: hero.y, facing: hero.facing, kind: attack.kind, combo: hero.combo, index, last, radius: attack.radius });
      for (const enemy of this.enemies) {
        if (enemy.action === 'dead') continue;
        const d = distance(hero, enemy);
        const angle = Math.atan2(enemy.y - hero.y, enemy.x - hero.x);
        const arc = attack.arc ?? Math.PI * 2;
        if (d > attack.radius || (arc < Math.PI * 2 && Math.abs(angleDifference(hero.facing, angle)) > arc * 0.5)) continue;
        this._damageEnemy(enemy, damage, source);
      }
    }
    if (hero.actionTime >= attack.duration) {
      hero.action = 'idle';
      hero.actionTime = 0;
      this.attack = null;
    }
  }

  _resolveSlash(attack) {
    const hero = this.hero;
    for (const enemy of this.enemies) {
      if (enemy.action === 'dead') continue;
      const dx = enemy.x - hero.x;
      const dy = enemy.y - hero.y;
      const d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      if (d > attack.radius || Math.abs(angleDifference(hero.facing, angle)) > attack.arc * 0.5) continue;
      this._damageEnemy(enemy, attack.damage, attack.kind);
    }
  }

  _damageEnemy(enemy, damage, source, pushOverride = null) {
    if (enemy.action === 'dead' || enemy.intangible) return;
    if (enemy.evade !== undefined && source === 'attack' && enemy.action !== 'hit' && enemy.ai !== 'external'
      && ((enemy.evadeUntil ?? -Infinity) > this.time || this._rand() < enemy.evade)) {
      this._sidestep(enemy);
      return;
    }
    // Guard: frontal light hits are blocked for chip damage; heavy, finisher and special break it.
    let guarded = false, armored = false, breaksGuard = false;
    if (enemy.guard && !((enemy.guardBrokenUntil ?? -Infinity) > this.time)) {
      if (source === 'attack' || (enemy.guardRearmUntil ?? -Infinity) > this.time) {
        const toHero = Math.atan2(this.hero.y - enemy.y, this.hero.x - enemy.x);
        guarded = Math.abs(angleDifference(enemy.facing, toHero)) <= GUARD.arc;
        // Super armour: a light hit from behind lands in full but does not interrupt a wind-up or strike.
        armored = !guarded && (enemy.action === 'telegraph' || enemy.action === 'attack');
      } else breaksGuard = true;
    }
    if (source === 'special' && enemy.specialScale !== undefined) damage = Math.ceil(damage * enemy.specialScale);
    if (guarded) damage *= GUARD.chip;
    enemy.hp = Math.max(0, enemy.hp - damage);
    if (guarded && enemy.hp > 0) {
      this._emit('guard', { x: enemy.x, y: enemy.y, enemyId: enemy.id, damage, source, hp: enemy.hp });
      this._emit('hitstop', { x: enemy.x, y: enemy.y, duration: 0.02 });
      this._gainEnergy(1);
      return;
    }
    if (breaksGuard && enemy.hp > 0) {
      enemy.guardBrokenUntil = this.time + GUARD.breakSeconds;
      enemy.guardRearmUntil = enemy.guardBrokenUntil + (enemy.guardRearm ?? GUARD.rearm);
      if (enemy.ai !== 'external') enemy.staggerUntil = enemy.guardBrokenUntil;
      this._emit('guardBreak', { x: enemy.x, y: enemy.y, enemyId: enemy.id, duration: GUARD.breakSeconds, source });
    }
    // External (director-driven) enemies keep their scripted action and position until they die.
    const reacts = enemy.hp === 0 || enemy.ai !== 'external' && !armored;
    if (reacts) {
      enemy.action = enemy.hp === 0 ? 'dead' : 'hit';
      if (this.warriorMode) { enemy.engaged = false; enemy.cooldown = Math.max(enemy.cooldown, 0.8); }
      enemy.actionTime = 0;
      enemy.hitStun = enemy.hp === 0 ? 0 : Math.max(0.22, (enemy.staggerUntil ?? 0) - this.time);
    }
    const push = !reacts || enemy.fixed ? [0, 0] : pushOverride ?? (source === 'special' ? [22, 16] : source === 'heavy' ? [18, 12] : [4, 3]);
    const dx = enemy.x - this.hero.x;
    const dy = enemy.y - this.hero.y;
    const d = Math.hypot(dx, dy) || 1;
    const knockbackX = dx / d * push[0];
    const knockbackY = dy / d * push[1];
    enemy.x = clamp(enemy.x + knockbackX, this.bounds.minX, this.bounds.maxX);
    enemy.y = clamp(enemy.y + knockbackY, this.bounds.minY, this.bounds.maxY);
    if (push[0] > 4) {
      this._emit('knockback', { x: enemy.x, y: enemy.y, enemyId: enemy.id, source, dx: knockbackX, dy: knockbackY });
    }
    this._emit('hit', { x: enemy.x, y: enemy.y, enemyId: enemy.id, damage, source, hp: enemy.hp, ...(armored ? { armored: true } : null) });
    this._emit('hitstop', { x: enemy.x, y: enemy.y, duration: source === 'special' ? 0.06 : 0.035 });
    if (!this.attack?.flurry) this._gainEnergy(enemy.role === 'boss' ? 5 : 2);   // the musou flurry does not refill itself
    if (enemy.hp === 0) {
      this._emit('kill', { x: enemy.x, y: enemy.y, enemyId: enemy.id, role: enemy.role, facing: enemy.facing });
      if (this.director) { if (!enemy.prop) this.kills++; }
      else if (enemy.role !== 'boss') this._countWaveKill();
      else this._win();
    }
  }

  _sidestep(enemy) {
    if ((enemy.evadeUntil ?? -Infinity) > this.time) return;
    const away = Math.atan2(enemy.y - this.hero.y, enemy.x - this.hero.x) + (this._rand() < 0.5 ? 1 : -1) * Math.PI / 2;
    const dx = Math.cos(away) * SIDESTEP.distance, dy = Math.sin(away) * SIDESTEP.distance;
    enemy.x = clamp(enemy.x + dx, this.bounds.minX, this.bounds.maxX);
    enemy.y = clamp(enemy.y + dy, this.bounds.minY, this.bounds.maxY);
    enemy.evadeUntil = this.time + SIDESTEP.seconds;
    enemy.facing = Math.atan2(this.hero.y - enemy.y, this.hero.x - enemy.x);
    this._emit('sidestep', { x: enemy.x, y: enemy.y, enemyId: enemy.id, dx, dy, duration: SIDESTEP.seconds });
  }

  _countWaveKill() {
    this.kills++;
    if (this.waveKills >= this.waveGoal) return;
    this.waveKills++;
    if (this.waveKills < this.waveGoal) return;
    if (this.wave < this.finalWave) {
      this.wave++;
      this.waveKills = 0;
      const heal = Math.min(8, this.hero.maxHp - this.hero.hp);
      this.hero.hp += heal;
      this.spawnClock = 0.5;
      this._emit('wave', { wave: this.wave, x: this.hero.x, y: this.hero.y, heal });
      if (heal > 0) this._emit('heal', { x: this.hero.x, y: this.hero.y, amount: heal });
    } else {
      this.bossQueued = true;
      this.spawnClock = Infinity;
      this._emit('wave', { wave: 'boss', x: this.hero.x, y: this.hero.y });
    }
  }

  _advanceEnemies(dt) {
    const hero = this.hero;
    // Reserve slots for every attacker already telegraphing or swinging before
    // allowing any earlier-array chase enemy to claim a new slot.
    const maxAttackers = this.maxAttackersOverride ?? (this.warriorMode ? 2 : MAX_ATTACKERS);
    let tokens = this.enemies.reduce((count, enemy) =>
      count + (enemy.action === 'telegraph' || enemy.action === 'attack' || this.warriorMode && enemy.engaged ? 1 : 0), 0);
    for (const enemy of this.enemies) {
      if (enemy.action === 'dead' || enemy.ai === 'external') continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      enemy.actionTime += dt;
      if (enemy.action === 'hit') {
        enemy.hitStun -= dt;
        if (enemy.hitStun <= 0) { enemy.action = 'chase'; enemy.actionTime = 0; }
        continue;
      }
      const dx = hero.x - enemy.x;
      const dy = hero.y - enemy.y;
      const distanceToHero = Math.hypot(dx, dy) || 1;
      if (enemy.turnRate === undefined) enemy.facing = Math.atan2(dy, dx);
      else if (enemy.action !== 'telegraph' && enemy.action !== 'attack') {
        // Opt-in slow turn (officers): facing locks while winding up so the hero can flank.
        const turn = angleDifference(enemy.facing, Math.atan2(dy, dx));
        enemy.facing += clamp(turn, -enemy.turnRate * dt, enemy.turnRate * dt);
      }
      if (enemy.action === 'telegraph') {
        enemy.telegraph = Math.max(0, enemy.telegraph - dt);
        if (enemy.telegraph === 0) {
          enemy.action = 'attack';
          enemy.actionTime = 0;
          enemy.attackResolved = false;
          this._emit('enemyAttack', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, role: enemy.role });
        }
      } else if (enemy.action === 'attack') {
        if (!enemy.attackResolved) {
          enemy.attackResolved = true;
          const inFront = enemy.turnRate === undefined || Math.abs(angleDifference(enemy.facing, Math.atan2(dy, dx))) < Math.PI / 2;
          if (distanceToHero <= enemy.range + 20 && hero.invulnerable <= 0 && inFront) {
            if (this._heroEvades()) this._emit('airEvade', { x: hero.x, y: hero.y, sourceId: enemy.id, height: hero.height });
            else this._hurtHero(enemy);
          }
        }
        if (enemy.actionTime >= 0.25) {
          enemy.action = 'chase';
          enemy.actionTime = 0;
          enemy.engaged = false;
          enemy.cooldown = enemy.recover ?? (enemy.role === 'boss' ? 1.35 : enemy.role === 'elite' ? 1.7 : 2.0);
        }
      } else {
        const speed = enemy.speed ?? (enemy.role === 'runner' ? 108 : enemy.role === 'elite' ? 65 : enemy.role === 'boss' ? 48 : 78);
        if (this.warriorMode && !enemy.engaged && enemy.cooldown <= 0 && tokens < maxAttackers) {
          enemy.engaged = true;
          tokens++;
        }
        if (this.warriorMode && !enemy.engaged) {
          const slot = (enemy.id - 1) % 8;
          const angle = -Math.PI + (slot + 0.5) * Math.PI / 8;
          const targetX = clamp(hero.x + Math.cos(angle) * 260, this.bounds.minX, this.bounds.maxX);
          const targetY = clamp(hero.y + Math.sin(angle) * 190, this.bounds.minY, this.bounds.maxY);
          const toX = targetX - enemy.x, toY = targetY - enemy.y;
          const toSlot = Math.hypot(toX, toY) || 1;
          if (toSlot > 8) {
            enemy.x = clamp(enemy.x + toX / toSlot * speed * dt, this.bounds.minX, this.bounds.maxX);
            enemy.y = clamp(enemy.y + toY / toSlot * speed * 0.78 * dt, this.bounds.minY, this.bounds.maxY);
          }
        } else if (distanceToHero > enemy.range * 0.78) {
          enemy.x = clamp(enemy.x + (dx / distanceToHero) * speed * dt, this.bounds.minX, this.bounds.maxX);
          enemy.y = clamp(enemy.y + (dy / distanceToHero) * speed * 0.78 * dt, this.bounds.minY, this.bounds.maxY);
        } else if (enemy.cooldown <= 0 && (this.warriorMode ? enemy.engaged : tokens < maxAttackers)) {
          enemy.action = 'telegraph';
          enemy.actionTime = 0;
          enemy.telegraph = enemy.telegraphTime ?? (enemy.role === 'boss' ? 0.9 : enemy.role === 'elite' ? 0.82 : 0.72);
          enemy.attackResolved = false;
          if (!this.warriorMode) tokens++;
          this._emit('telegraph', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, duration: enemy.telegraph, role: enemy.role });
        }
      }
    }
    this.attackerTokens = this.enemies.reduce((count, enemy) =>
      count + (enemy.action === 'telegraph' || enemy.action === 'attack' || this.warriorMode && enemy.engaged ? 1 : 0), 0);
    this._separateEnemies();
  }

  _hurtHero(enemy) {
    const hero = this.hero;
    const damage = enemy.damage ?? (enemy.role === 'boss' ? 18 : enemy.role === 'elite' ? 12 : enemy.role === 'runner' ? 7 : 9);
    hero.hp = Math.max(0, hero.hp - damage);
    if (this.musouFlurry) this._gainEnergy(MUSOU_FLURRY.energyOnHurt);
    hero.invulnerable = 0.72;
    hero.action = hero.hp === 0 ? 'dead' : 'hurt';
    hero.actionTime = 0;
    this._emit('hurt', { x: hero.x, y: hero.y, damage, sourceId: enemy.id, hp: hero.hp, facing: enemy.facing });
    if (hero.hp === 0) {
      this.state = 'dead';
      this._emit('dead', { x: hero.x, y: hero.y });
    }
  }

  _win() {
    if (this.state !== 'play') return;
    this.state = 'win';
    this.hero.action = 'win';
    this.hero.actionTime = 0;
    this._emit('win', { x: this.hero.x, y: this.hero.y, kills: this.kills });
  }

  _removeDefeated() {
    this.enemies = this.enemies.filter(enemy => enemy.action !== 'dead');
  }

  _separateEnemies() {
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.action === 'dead') continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.action === 'dead') continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const min = this.warriorMode ? a.role === 'boss' || b.role === 'boss' ? 170 : 145
          : a.role === 'boss' || b.role === 'boss' ? 76 : 34;
        if (d >= min || a.fixed && b.fixed || a.prop || b.prop) continue;   // props (director mode) never push
        // A fixed enemy (prop) never moves; the other one takes the whole push.
        const pushA = a.fixed ? 0 : b.fixed ? min - d : (min - d) * 0.5;
        const pushB = b.fixed ? 0 : a.fixed ? min - d : (min - d) * 0.5;
        if (pushA) {
          a.x = clamp(a.x - dx / d * pushA, this.bounds.minX, this.bounds.maxX);
          a.y = clamp(a.y - dy / d * pushA, this.bounds.minY, this.bounds.maxY);
        }
        if (pushB) {
          b.x = clamp(b.x + dx / d * pushB, this.bounds.minX, this.bounds.maxX);
          b.y = clamp(b.y + dy / d * pushB, this.bounds.minY, this.bounds.maxY);
        }
      }
    }
  }

  _spawn(role, overrides = null) {
    // The director enforces its own on-screen budget.
    if (!this.director && this.enemies.length >= (this.warriorMode ? 8 : MAX_ENEMIES)) return null;
    const id = this.nextEnemyId++;
    const boss = role === 'boss';
    let x, y;
    if (overrides) {
      x = overrides.x;
      y = overrides.y;
    } else if (boss) {
      x = WIDTH * 0.5;
      y = this.bounds.minY + 35;
    } else if (this.warriorMode) {
      x = 260 + this._rand() * 760;
      y = this.bounds.minY + 15 + this._rand() * 100;
    } else {
      const side = Math.floor(this._rand() * 4);
      x = side < 2 ? this.bounds.minX + 12 : this.bounds.maxX - 12;
      y = this.bounds.minY + 20 + this._rand() * (this.bounds.maxY - this.bounds.minY - 40);
    }
    const hp = role === 'boss' ? (this.warriorMode ? 65 : 180) : role === 'elite' ? 11 : role === 'runner' ? 4 : 5;
    const enemy = {
      id, role, x, y, hp, maxHp: hp,
      action: 'chase', actionTime: 0, facing: Math.PI / 2,
      telegraph: 0, cooldown: role === 'boss' ? 0.6 : 0.3 + this._rand() * 0.8,
      range: role === 'boss' ? 108 : role === 'elite' ? 82 : role === 'runner' ? 64 : 74,
      attackResolved: false, hitStun: 0,
      engaged: false,
    };
    if (overrides) {
      Object.assign(enemy, overrides, { id, role });
      if (overrides.hp !== undefined && overrides.maxHp === undefined) enemy.maxHp = overrides.hp;
    }
    this.enemies.push(enemy);
    this._emit('spawn', { x, y, enemyId: id, role });
    return enemy;
  }

  _nextRole() {
    if (this.wave >= 3) return this._rand() < 0.18 ? 'elite' : this._rand() < 0.38 ? 'runner' : 'grunt';
    if (this.wave === 2) return this._rand() < 0.16 ? 'elite' : this._rand() < 0.34 ? 'runner' : 'grunt';
    return this._rand() < 0.1 ? 'elite' : this._rand() < 0.28 ? 'runner' : 'grunt';
  }

  _gainEnergy(amount) {
    this.hero.energy = Math.min(100, this.hero.energy + amount);
  }

  _emit(type, values = {}) {
    if (this.events.length === MAX_EVENTS) this.events.shift();
    this.events.push({ type, ...values });
  }

  _rand() {
    let t = this.randomState += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function pressed(value) { return value === true; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function angleDifference(a, b) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
