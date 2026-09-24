const WIDTH = 1280;
const HEIGHT = 720;
const BOUNDS = { minX: 90, maxX: 1190, minY: 210, maxY: 625 };
const MAX_ENEMIES = 14;
const MAX_ATTACKERS = 3;
const MAX_EVENTS = 96;

/**
 * Small deterministic 2D musou combat simulation. Input axes are held values
 * in [-1, 1]; attack, heavy, dodge and special are one-frame press edges.
 */
export class Arena {
  constructor({ seed = 1, warriorMode = false } = {}) {
    this.seed = seed >>> 0;
    this.warriorMode = warriorMode;
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
      bounds: { ...BOUNDS },
      state: this.state,
      wave: this.wave,
      waveKills: this.waveKills,
      waveGoal: this.waveGoal,
      kills: this.kills,
      attackerTokens: this.attackerTokens,
      maxAttackers: MAX_ATTACKERS,
      hero: { ...this.hero },
      enemies: this.enemies.map(enemy => ({ ...enemy })),
    };
  }

  drainEvents() {
    const drained = this.events;
    this.events = [];
    return drained;
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
        hero.x = clamp(hero.x + moveX * 295 * this._stepDt, BOUNDS.minX, BOUNDS.maxX);
        hero.y = clamp(hero.y + moveY * 235 * this._stepDt, BOUNDS.minY, BOUNDS.maxY);
      }
    }
  }

  // Set for the duration of update so input movement uses the same dt as actions.
  get _stepDt() { return this.stepDt || 0; }

  _canConsumeAttack(kind) {
    const hero = this.hero;
    if (hero.action === 'idle' || hero.action === 'run') return true;
    if (hero.action !== 'attack') return false;
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
      const nearest = this.enemies.filter(enemy => enemy.action !== 'dead')
        .map(enemy => ({ enemy, distance: distance(hero, enemy) }))
        .filter(candidate => candidate.distance <= 230 && (freeAim ||
          Math.abs(angleDifference(hero.facing, Math.atan2(candidate.enemy.y - hero.y, candidate.enemy.x - hero.x))) < 1.2))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest) hero.facing = Math.atan2(nearest.enemy.y - hero.y, nearest.enemy.x - hero.x);
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
    hero.x = clamp(hero.x + Math.cos(direction) * 76, BOUNDS.minX, BOUNDS.maxX);
    hero.y = clamp(hero.y + Math.sin(direction) * 56, BOUNDS.minY, BOUNDS.maxY);
    this._emit('dodge', { x: hero.x, y: hero.y, facing: direction });
  }

  _startSpecial() {
    const hero = this.hero;
    hero.energy = 0;
    hero.action = 'special';
    hero.actionTime = 0;
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
    if (hero.action === 'attack' || hero.action === 'heavy') {
      const attack = this.attack;
      const before = hero.actionTime;
      hero.actionTime += dt;
      if (this.warriorMode && attack && before < attack.activeEnd) {
        const moving = Math.hypot(this.moveInput.x, this.moveInput.y) > 0.1;
        const speed = moving ? 100 : attack.kind === 'attack' ? 90 : 70;
        const dx = moving ? this.moveInput.x : Math.cos(hero.facing);
        const dy = moving ? this.moveInput.y : Math.sin(hero.facing);
        hero.x = clamp(hero.x + dx * speed * dt, BOUNDS.minX, BOUNDS.maxX);
        hero.y = clamp(hero.y + dy * speed * dt * 0.8, BOUNDS.minY, BOUNDS.maxY);
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

  _damageEnemy(enemy, damage, source) {
    if (enemy.action === 'dead') return;
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.action = enemy.hp === 0 ? 'dead' : 'hit';
    enemy.actionTime = 0;
    enemy.hitStun = enemy.hp === 0 ? 0 : 0.22;
    const push = source === 'special' ? [22, 16] : source === 'heavy' ? [18, 12] : [4, 3];
    const dx = enemy.x - this.hero.x;
    const dy = enemy.y - this.hero.y;
    const d = Math.hypot(dx, dy) || 1;
    const knockbackX = dx / d * push[0];
    const knockbackY = dy / d * push[1];
    enemy.x = clamp(enemy.x + knockbackX, BOUNDS.minX, BOUNDS.maxX);
    enemy.y = clamp(enemy.y + knockbackY, BOUNDS.minY, BOUNDS.maxY);
    if (push[0] > 4) {
      this._emit('knockback', { x: enemy.x, y: enemy.y, enemyId: enemy.id, source, dx: knockbackX, dy: knockbackY });
    }
    this._emit('hit', { x: enemy.x, y: enemy.y, enemyId: enemy.id, damage, source, hp: enemy.hp });
    this._emit('hitstop', { x: enemy.x, y: enemy.y, duration: source === 'special' ? 0.06 : 0.035 });
    this._gainEnergy(enemy.role === 'boss' ? 5 : 2);
    if (enemy.hp === 0) {
      this._emit('kill', { x: enemy.x, y: enemy.y, enemyId: enemy.id, role: enemy.role, facing: enemy.facing });
      if (enemy.role !== 'boss') this._countWaveKill();
      else this._win();
    }
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
    let tokens = this.enemies.reduce((count, enemy) =>
      count + (enemy.action === 'telegraph' || enemy.action === 'attack' ? 1 : 0), 0);
    for (const enemy of this.enemies) {
      if (enemy.action === 'dead') continue;
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
      enemy.facing = Math.atan2(dy, dx);
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
          if (distanceToHero <= enemy.range + 20 && hero.invulnerable <= 0) this._hurtHero(enemy);
        }
        if (enemy.actionTime >= 0.25) {
          enemy.action = 'chase';
          enemy.actionTime = 0;
          enemy.cooldown = enemy.role === 'boss' ? 1.35 : enemy.role === 'elite' ? 1.7 : 2.0;
        }
      } else {
        const speed = enemy.role === 'runner' ? 108 : enemy.role === 'elite' ? 65 : enemy.role === 'boss' ? 48 : 78;
        if (distanceToHero > enemy.range * 0.78) {
          enemy.x = clamp(enemy.x + (dx / distanceToHero) * speed * dt, BOUNDS.minX, BOUNDS.maxX);
          enemy.y = clamp(enemy.y + (dy / distanceToHero) * speed * 0.78 * dt, BOUNDS.minY, BOUNDS.maxY);
        } else if (enemy.cooldown <= 0 && tokens < MAX_ATTACKERS) {
          enemy.action = 'telegraph';
          enemy.actionTime = 0;
          enemy.telegraph = enemy.role === 'boss' ? 0.9 : enemy.role === 'elite' ? 0.82 : 0.72;
          enemy.attackResolved = false;
          tokens++;
          this._emit('telegraph', { x: enemy.x, y: enemy.y, enemyId: enemy.id, facing: enemy.facing, duration: enemy.telegraph, role: enemy.role });
        }
      }
    }
    this.attackerTokens = this.enemies.reduce((count, enemy) =>
      count + (enemy.action === 'telegraph' || enemy.action === 'attack' ? 1 : 0), 0);
    this._separateEnemies();
  }

  _hurtHero(enemy) {
    const hero = this.hero;
    const damage = enemy.role === 'boss' ? 18 : enemy.role === 'elite' ? 12 : enemy.role === 'runner' ? 7 : 9;
    hero.hp = Math.max(0, hero.hp - damage);
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
        if (d >= min) continue;
        const push = (min - d) * 0.5;
        a.x = clamp(a.x - dx / d * push, BOUNDS.minX, BOUNDS.maxX);
        a.y = clamp(a.y - dy / d * push, BOUNDS.minY, BOUNDS.maxY);
        b.x = clamp(b.x + dx / d * push, BOUNDS.minX, BOUNDS.maxX);
        b.y = clamp(b.y + dy / d * push, BOUNDS.minY, BOUNDS.maxY);
      }
    }
  }

  _spawn(role) {
    if (this.enemies.length >= (this.warriorMode ? 8 : MAX_ENEMIES)) return null;
    const id = this.nextEnemyId++;
    const boss = role === 'boss';
    let x, y;
    if (boss) {
      x = WIDTH * 0.5;
      y = BOUNDS.minY + 35;
    } else if (this.warriorMode) {
      x = 260 + this._rand() * 760;
      y = BOUNDS.minY + 15 + this._rand() * 100;
    } else {
      const side = Math.floor(this._rand() * 4);
      x = side < 2 ? BOUNDS.minX + 12 : BOUNDS.maxX - 12;
      y = BOUNDS.minY + 20 + this._rand() * (BOUNDS.maxY - BOUNDS.minY - 40);
    }
    const hp = role === 'boss' ? (this.warriorMode ? 65 : 180) : role === 'elite' ? 11 : role === 'runner' ? 4 : 5;
    const enemy = {
      id, role, x, y, hp, maxHp: hp,
      action: 'chase', actionTime: 0, facing: Math.PI / 2,
      telegraph: 0, cooldown: role === 'boss' ? 0.6 : 0.3 + this._rand() * 0.8,
      range: role === 'boss' ? 108 : role === 'elite' ? 82 : role === 'runner' ? 64 : 74,
      attackResolved: false, hitStun: 0,
    };
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
