export const TABLE = Object.freeze({ halfWidth: 0.7625, halfLength: 1.37, height: 0.76, net: 0.1525, radius: 0.02 });
export const LEVELS = Object.freeze({
  easy: { speed: 1.65, reaction: 0.25, reach: 0.52, flight: 0.53, error: 0.11 },
  normal: { speed: 2.3, reaction: 0.16, reach: 0.5, flight: 0.47, error: 0.065 },
  hard: { speed: 3.2, reaction: 0.085, reach: 0.47, flight: 0.42, error: 0.026 },
});
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const SURFACE = TABLE.height + TABLE.radius;
const FIXED_STEP = 1 / 240;
const CONTACT_Z = 1.54;
const CONTACT_NEAR = 1.42;
const CONTACT_FAR = 1.78;
const SWING_DURATION = 0.40;
const WINDUP = 0.12;
const SERVE_PREPARATION = 0.48;
const SERVE_RECOVERY = 0.30;

export function serverFor(score, firstServer = 1) {
  const total = score[0] + score[1];
  const turns = total < 20 ? Math.floor(total / 2) : 10 + total - 20;
  return turns % 2 ? -firstServer : firstServer;
}

export function advanceBall(ball, dt) {
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  const drag = 0.028 * speed;
  ball.vx += (-drag * ball.vx + ball.sideSpin * Math.abs(ball.vz) * 0.24) * dt;
  ball.vy += (-9.81 - ball.spin * Math.abs(ball.vz) * 0.48 - drag * ball.vy) * dt;
  ball.vz -= drag * ball.vz * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.spin *= Math.exp(-0.22 * dt);
  ball.sideSpin *= Math.exp(-0.22 * dt);
}

function bounce(ball) {
  ball.y = SURFACE;
  ball.vy = -ball.vy * 0.83;
  ball.vz *= ball.spin < 0 ? 0.81 : 0.97;
  ball.vz *= 1 + Math.max(0, ball.spin) * 0.035;
  ball.vx += ball.sideSpin * 0.08;
  ball.spin *= 0.65;
}

// Solve the launch against the same drag and spin model used during a rally.
export function shotVelocity(origin, target, flight, spin = 0, sideSpin = 0) {
  const v = { vx: (target.x - origin.x) / flight, vz: (target.z - origin.z) / flight,
    vy: (SURFACE - origin.y + 4.905 * flight * flight) / flight };
  for (let iteration = 0; iteration < 5; iteration++) {
    const b = { ...origin, ...v, spin, sideSpin };
    const steps = Math.ceil(flight / (1 / 240));
    for (let i = 0; i < steps; i++) advanceBall(b, flight / steps);
    v.vx += (target.x - b.x) / flight;
    v.vy += (SURFACE - b.y) / flight;
    v.vz += (target.z - b.z) / flight;
  }
  return v;
}

export function predictContact(ball, side, depth = CONTACT_Z, policy = 'long') {
  if (!ball || ball.hitter !== -side || ball.vz * side <= 0) return null;
  const b = { spin: 0, sideSpin: 0, received: 0, ...ball };
  const minimumHeight = policy === 'short' ? SURFACE + 0.025 : SURFACE;
  const far = policy === 'short' ? TABLE.halfLength + TABLE.radius : CONTACT_FAR;
  const result = (time, legal) => ({ x: b.x, y: b.y, z: b.z, time, legal });
  if (b.z * side >= depth && b.received === 1 && b.y >= minimumHeight) return result(0, b.z * side <= far && b.y <= 1.75);
  for (let i = 1; i <= 480; i++) {
    const previous = { x: b.x, y: b.y, z: b.z };
    advanceBall(b, FIXED_STEP);
    if (previous.z * b.z < 0) {
      const fraction = previous.z / (previous.z - b.z);
      const y = previous.y + (b.y - previous.y) * fraction;
      const x = previous.x + (b.x - previous.x) * fraction;
      if (y < SURFACE + TABLE.net && Math.abs(x) < TABLE.halfWidth + 0.04) return result(i * FIXED_STEP, false);
    }
    if (previous.y > SURFACE && b.y <= SURFACE && b.vy < 0) {
      const fraction = (previous.y - SURFACE) / (previous.y - b.y);
      const x = previous.x + (b.x - previous.x) * fraction;
      const z = previous.z + (b.z - previous.z) * fraction;
      if (Math.abs(x) <= TABLE.halfWidth + TABLE.radius && Math.abs(z) <= TABLE.halfLength + TABLE.radius) {
        const bounceSide = z >= 0 ? 1 : -1;
        if (b.isServe && b.serveStage === 0) {
          if (bounceSide !== b.hitter) return result(i * FIXED_STEP, false);
          b.serveStage = 1;
        } else {
          if (bounceSide === b.hitter || b.received >= 1) return result(i * FIXED_STEP, false);
          b.received++;
        }
        b.x = x; b.z = z;
        bounce(b);
      }
    }
    if (b.z * side >= depth && (b.received === 1 || policy !== 'short')) {
      if (policy === 'short' && b.y < minimumHeight && b.vy > 0) continue;
      return result(i * FIXED_STEP, b.received === 1 && b.z * side <= far && b.y >= minimumHeight && b.y <= 1.75);
    }
    if (b.y < 0.08 || Math.abs(b.z) > 2.65 || Math.abs(b.x) > 2.7) return result(i * FIXED_STEP, false);
  }
  return result(2, false);
}

export function predictReceive(ball, side) {
  return predictContact(ball, side)?.x ?? ball?.x ?? 0;
}

export function predictIncoming(ball, side) {
  if (!ball || ball.hitter !== -side) return null;
  const b = { spin: 0, sideSpin: 0, received: 0, ...ball };
  let first = b.received === 1 ? { x: b.lastBounce?.x ?? b.x, depth: b.lastBounce ? b.lastBounce.z * side : Math.min(b.z * side, 1.2) } : null;
  let height = b.y, contactHeight = null, contactX = null, receiveSpin = b.received === 1 ? b.spin : null;
  const result = length => ({ x: contactX ?? first?.x ?? b.x, height: contactHeight ?? height,
    spin: receiveSpin ?? ball.spin, speed: Math.hypot(ball.vx, ball.vy, ball.vz), length,
    bounceDepth: first?.depth ?? 0.8, isServe: Boolean(ball.isServe) });
  for (let i = 0; i < 480; i++) {
    const previous = { x: b.x, y: b.y, z: b.z };
    advanceBall(b, FIXED_STEP);
    if (previous.z * b.z < 0) {
      const fraction = previous.z / (previous.z - b.z);
      const x = previous.x + (b.x - previous.x) * fraction;
      if (previous.y + (b.y - previous.y) * fraction < SURFACE + TABLE.net && Math.abs(x) < TABLE.halfWidth + 0.04) return result('invalid');
    }
    if (previous.y > SURFACE && b.y <= SURFACE && b.vy < 0) {
      const fraction = (previous.y - SURFACE) / (previous.y - b.y);
      const x = previous.x + (b.x - previous.x) * fraction;
      const z = previous.z + (b.z - previous.z) * fraction;
      if (Math.abs(x) > TABLE.halfWidth + TABLE.radius || Math.abs(z) > TABLE.halfLength + TABLE.radius) return result(first && z * side <= 1.70 ? 'half-long' : 'long');
      const bounceSide = z >= 0 ? 1 : -1;
      if (b.isServe && b.serveStage === 0 && bounceSide === b.hitter) b.serveStage = 1;
      else if (bounceSide !== side) return result('invalid');
      else if (first) return result('short');
      else { first = { x, depth: z * side }; b.received = 1; height = SURFACE; }
      b.x = x; b.z = z; bounce(b);
      if (first && receiveSpin === null) receiveSpin = b.spin;
    }
    if (first) {
      height = Math.max(height, b.y);
      if (contactHeight === null && b.z * side >= CONTACT_Z) { contactHeight = b.y; contactX = b.x; }
    }
    if (b.y < 0.08 || b.z * side > 2.65) return result('long');
  }
  return result('long');
}

export class Match {
  constructor({ random = Math.random, onEvent = () => {} } = {}) {
    this.random = random;
    this.onEvent = onEvent;
    this.level = 'easy';
    this.reset();
  }
  reset() {
    this.score = [0, 0];
    this.server = 1;
    this.phase = 'idle';
    this.ball = null;
    this.playerX = 0;
    this.opponentX = 0;
    this.opponentTarget = 0;
    this.clock = 0;
    this.shots = 0;
    this.best = 0;
    this.totalHits = 0;
    this.rallies = 0;
    this.lastSpeed = 0;
    this.playerSwing = null;
    this.opponentSwing = null;
    this.pendingServe = null;
    this.practice = false;
    this.playerHand = 'right';
    this.opponentHand = 'right';
    this.playerProfile = null;
    this.opponentProfile = null;
    this.autoPlayer = false;
    this.playerReactAt = 0;
    this.previousShots = [];
    this._planCache = null;
    this._accumulator = 0;
    this._ticks = 0;
    this._contactForecast = null;
    this.nextAt = 0;
    this.lastReachWarning = -10;
  }
  start(level = 'easy', { practice = false, playerHand = 'right', opponentHand = 'right', playerProfile = null, opponentProfile = null, autoPlayer = false } = {}) {
    this.reset();
    this.level = Object.hasOwn(LEVELS, level) ? level : 'easy';
    this.practice = practice;
    this.playerProfile = getPlayerProfile(playerProfile)?.id ?? null;
    this.opponentProfile = getPlayerProfile(opponentProfile)?.id ?? null;
    this.playerHand = getPlayerProfile(this.playerProfile)?.hand ?? (playerHand === 'left' ? 'left' : 'right');
    this.opponentHand = getPlayerProfile(this.opponentProfile)?.hand ?? (opponentHand === 'left' ? 'left' : 'right');
    this.autoPlayer = Boolean(autoPlayer);
    this.phase = 'ready';
    this.autoServeAt = this.clock + 0.65;
    this.onEvent({ type: 'ready', server: this.server });
  }
  serve() {
    if (this.phase !== 'ready') return false;
    const prepared = this.pendingServe;
    const side = prepared?.side ?? this.server;
    const x = side === 1 ? this.playerX : this.opponentX;
    const profile = side === 1 ? this.playerProfile : this.opponentProfile;
    const shortServe = profile === 'lin' && this.rallies % 3 !== 2;
    this.ball = { x: prepared?.target.x ?? clamp(x, -0.42, 0.42), y: 1.15, z: side * 1.28,
      vx: (this.random() - 0.5) * 0.35, vy: -0.65, vz: -side * (shortServe ? 2.50 : 3.15),
      spin: 0, sideSpin: 0, hitter: side, received: 0, serveStage: 0, isServe: true };
    this.phase = 'rally';
    this.shots = 0;
    this.rallies++;
    if (!prepared || side !== 1) this.playerSwing = null;
    if (!prepared || side !== -1) this.opponentSwing = null;
    if (prepared) (side === 1 ? this.playerSwing : this.opponentSwing).hit = true;
    this.pendingServe = null;
    this.opponentReactAt = this.clock + LEVELS[this.level].reaction;
    this.playerReactAt = this.opponentReactAt;
    this._contactForecast = null;
    this._planCache = null;
    this.previousShots = [];
    this.contact(-side);
    this.onEvent({ type: 'serve', side, x: this.ball.x, y: this.ball.y, z: this.ball.z, spin: 0, handedness: 'forehand' });
    return true;
  }
  prepareServe() {
    if (this.phase !== 'ready' || this.pendingServe) return false;
    const side = this.server;
    const target = { x: clamp(side === 1 ? this.playerX : this.opponentX, -0.42, 0.42), y: 1.15, z: side * 1.28 };
    const contactDelay = SERVE_PREPARATION;
    const duration = contactDelay + SERVE_RECOVERY;
    const key = side === 1 ? 'playerSwing' : 'opponentSwing';
    const profileId = side === 1 ? this.playerProfile : this.opponentProfile;
    const stance = profileId ? { ...this.stance(side), bodyX: side === 1 ? this.playerX : this.opponentX, rootZ: 1.90 } : undefined;
    this.pendingServe = { side, startedAt: this.clock, at: this.clock + contactDelay, target };
    this[key] = { startedAt: this.clock, activeAt: this.clock + contactDelay,
      activeUntil: this.clock + contactDelay, until: this.clock + duration,
      contactDelay, handedness: 'forehand', target, shot: { power: 0.3, spin: 0 }, serve: true, hit: false, profileId, stance, shotType: 'serve' };
    this.onEvent({ type: 'swing', side, handedness: 'forehand', ...target, power: 0.3, spin: 0,
      duration, contactDelay, contactTime: this.pendingServe.at, serve: true, profileId, shotType: 'serve', stance });
    return true;
  }
  canHit(side) {
    const b = this.ball;
    const swing = side === 1 ? this.playerSwing : this.opponentSwing;
    const short = (swing?.contactPolicy ?? this.planShot(side)?.contactPolicy) === 'short';
    return this.phase === 'rally' && b && b.hitter === -side && b.received === 1 &&
      b.z * side >= (short ? 0.90 : CONTACT_NEAR) && b.z * side <= (short ? TABLE.halfLength + TABLE.radius : CONTACT_FAR) &&
      b.y >= (short ? SURFACE + 0.025 : SURFACE - 0.015) && b.y <= 1.75;
  }
  planShot(side = 1, controls) {
    const profileId = side === 1 ? this.playerProfile : this.opponentProfile;
    if (!profileId || this.phase !== 'rally' || !this.ball || this.ball.hitter !== -side) return null;
    if (!this._planCache || this._planCache.ball !== this.ball || this._planCache.side !== side) {
      const incoming = predictIncoming(this.ball, side);
      const context = { side, incoming, position: side === 1 ? this.playerX : this.opponentX,
        opponentPosition: side === 1 ? this.opponentX : this.playerX,
        handedness: side === 1 ? this.playerHand : this.opponentHand,
        rallyPhase: this.ball.isServe ? 'receive' : this.shots === 1 ? 'third-ball' : 'rally',
        previousShots: this.previousShots, shotIndex: this.shots, practice: this.practice };
      const initial = chooseShot(profileId, context);
      const contact = predictContact(this.ball, side, initial.contactDepth, initial.contactPolicy);
      if (contact?.legal) context.incoming = { ...incoming, x: contact.x, height: contact.y };
      this._planCache = { ball: this.ball, side, context, plan: chooseShot(profileId, context) };
    }
    return controls ? chooseShot(profileId, { ...this._planCache.context, controls }) : this._planCache.plan;
  }
  stance(side = 1) {
    const swing = side === 1 ? this.playerSwing : this.opponentSwing;
    if (swing?.stance && this.clock < swing.until) return swing.stance;
    const plan = this.planShot(side);
    if (plan) return plan.stance;
    const profile = getPlayerProfile(side === 1 ? this.playerProfile : this.opponentProfile);
    const hand = side === 1 ? this.playerHand : this.opponentHand;
    const recoveryX = profile ? side * (hand === 'left' ? -1 : 1) * (profile.id === 'harimoto' ? 0.10 : 0.035) : 0;
    return { bodyX: recoveryX, offsetX: 0, rootZ: profile?.bodyDepth ?? 1.94, recoveryX, readyBias: profile?.readyBias ?? 'neutral' };
  }
  contact(side = 1) {
    const ball = this.ball;
    if (this.phase !== 'rally' || !ball || ball.hitter !== -side || ball.vz * side <= 0) return null;
    // A launch and each bounce define the trajectory; only its remaining time changes between them.
    const cache = this._contactForecast;
    const swing = side === 1 ? this.playerSwing : this.opponentSwing;
    const plan = this.planShot(side);
    const depth = swing?.contactDepth ?? plan?.contactDepth ?? CONTACT_Z;
    const policy = swing?.contactPolicy ?? plan?.contactPolicy ?? 'long';
    if (cache?.ball === ball && cache.side === side && cache.depth === depth && cache.policy === policy && cache.received === ball.received && cache.serveStage === ball.serveStage && ball.z * side < depth) {
      return { ...cache.prediction, time: Math.max(0, cache.at - this.clock) };
    }
    const prediction = predictContact(ball, side, depth, policy);
    this._contactForecast = { ball, side, depth, policy, received: ball.received, serveStage: ball.serveStage, prediction, at: this.clock + prediction.time };
    return prediction;
  }
  get inputReady() { return (this.phase === 'ready' && !this.pendingServe) || (this.phase === 'rally' && !this.playerSwing); }
  get timingReady() {
    const contact = this.contact(1);
    return this.inputReady && contact?.legal && contact.time >= 0.065 && contact.time <= 0.33;
  }
  strike({ aim = 0, power = 0.5, spin = 1, assist = true, ...details } = {}) {
    if (this.phase === 'ready') return this.prepareServe();
    if (this.phase !== 'rally' || this.playerSwing) return false;
    const shot = { ...this.planShot(1, { aim, power, spin }), ...details, aim: clamp(aim, -1, 1), power: clamp(power, 0, 1), spin: clamp(spin, -1, 1) };
    return this.beginSwing(1, shot, assist);
  }
  beginSwing(side, shot, assist = false) {
    const key = side === 1 ? 'playerSwing' : 'opponentSwing';
    if (this[key] || this.phase !== 'rally') return false;
    const contact = this.contact(side);
    const bodyX = side === 1 ? this.playerX : this.opponentX;
    const handDirection = (side === 1 ? this.playerHand : this.opponentHand) === 'left' ? -1 : 1;
    const target = contact?.legal ? contact : { x: bodyX + side * handDirection * 0.28, y: 1.05, z: side * CONTACT_Z };
    const contactDelay = contact?.legal ? clamp(contact.time, WINDUP, assist ? 0.33 : 0.24) : 0.18;
    const inferred = (target.x - bodyX) * side * handDirection >= 0 ? 'forehand' : 'backhand';
    const handedness = assist ? shot.handedness ?? inferred : inferred;
    this[key] = { startedAt: this.clock, activeAt: this.clock + WINDUP,
      activeUntil: this.clock + (assist ? 0.34 : 0.25), until: this.clock + SWING_DURATION,
      contactDelay, handedness, target: { x: target.x, y: target.y, z: target.z }, shot, assist, hit: false,
      profileId: shot.profileId, shotType: shot.type, decisionReason: shot.reason, stance: shot.stance,
      contactDepth: shot.contactDepth ?? CONTACT_Z, contactPolicy: shot.contactPolicy ?? 'long' };
    this.onEvent({ type: 'swing', side, handedness, x: target.x, y: target.y, z: target.z,
      spin: shot.spin, power: shot.power, duration: SWING_DURATION, contactDelay, contactTime: this.clock + contactDelay,
      profileId: shot.profileId, shotType: shot.type, decisionReason: shot.reason, stance: shot.stance, contactDepth: shot.contactDepth ?? CONTACT_Z, contactPolicy: shot.contactPolicy ?? 'long' });
    return true;
  }
  hit(side, { aim = 0, power = 0.5, spin = 1, sideSpin = 0, landingDepth } = {}) {
    const swing = side === 1 ? this.playerSwing : this.opponentSwing;
    if (!swing || swing.hit || this.clock < swing.activeAt || this.clock > swing.activeUntil || !this.canHit(side)) return false;
    const b = this.ball;
    const x = side === 1 ? this.playerX : this.opponentX;
    const reach = side === 1 && !(this.autoPlayer && !this.practice) ? 0.52 : LEVELS[this.level].reach;
    const contactX = x;
    if (Math.abs(b.x - contactX) > reach) {
      if (side === 1 && this.clock - this.lastReachWarning > 0.6) {
        this.lastReachWarning = this.clock;
        this.onEvent({ type: 'miss', reason: 'reach' });
      }
      return false;
    }
    const quality = clamp(1 - Math.abs(b.z * side - swing.contactDepth) * 0.95 - Math.max(0, Math.abs(b.x - contactX) - 0.25), 0.1, 1);
    const flight = (this.practice ? 0.51 : LEVELS[this.level].flight) * (1.08 - power * 0.24);
    const target = { x: aim * 0.59, z: -side * (Number.isFinite(landingDepth) ? clamp(landingDepth, 0.35, 1.12) : 0.77 + power * 0.29) };
    if ((side === -1 || this.autoPlayer) && !this.practice) {
      target.x += (this.random() - 0.5) * LEVELS[this.level].error;
      if (this.random() < LEVELS[this.level].error * (1 + this.shots * 0.12)) target.x = Math.sign(target.x || 1) * 0.93;
    } else if (quality < 0.36 && power > 0.84) {
      target.z -= side * 0.58;
    }
    const topSpin = spin * (1.2 + power * 1.5);
    Object.assign(b, shotVelocity(b, target, flight, topSpin, sideSpin));
    Object.assign(b, { spin: topSpin, sideSpin, hitter: side, received: 0, isServe: false });
    this._contactForecast = null;
    this.previousShots.push({ side, type: swing.shotType ?? 'drive', aim, spin, power });
    if (this.previousShots.length > 12) this.previousShots.shift();
    this._planCache = null;
    this.shots++;
    const receive = this.contact(-side);
    this.best = Math.max(this.best, this.shots);
    if (side === 1) this.totalHits++;
    this.lastSpeed = Math.hypot(b.vx, b.vy, b.vz) * 3.6;
    this.opponentReactAt = this.clock + LEVELS[this.level].reaction;
    this.playerReactAt = this.opponentReactAt;
    this.opponentTarget = side === 1 ? clamp(receive?.x ?? 0, -1.1, 1.1) : 0;
    swing.hit = true;
    this.onEvent({ type: 'hit', side, quality, spin, power, handedness: swing.handedness, speed: this.lastSpeed, x: b.x, y: b.y, z: b.z,
      profileId: swing.profileId, shotType: swing.shotType, decisionReason: swing.decisionReason, stance: swing.stance, contactDepth: swing.contactDepth, contactPolicy: swing.contactPolicy });
    return true;
  }
  point(winner, reason) {
    if (this.phase !== 'rally') return;
    this.score[winner === 1 ? 0 : 1]++;
    this.server = serverFor(this.score);
    const won = !this.practice && Math.max(...this.score) >= 11 && Math.abs(this.score[0] - this.score[1]) >= 2;
    this.phase = won ? 'over' : 'point';
    this.nextAt = this.clock + (this.practice ? 1.05 : 1.65);
    this.onEvent({ type: won ? 'over' : 'point', winner, reason, shots: this.shots, score: [...this.score] });
  }
  step(dt, playerTarget = this.playerX) {
    this._accumulator += clamp(dt, 0, 0.1);
    while (this._accumulator + 1e-10 >= FIXED_STEP) {
      this._accumulator -= FIXED_STEP;
      this._ticks++;
      this.clock = this._ticks * FIXED_STEP;
      this.advance(FIXED_STEP, playerTarget);
    }
  }
  advance(dt, playerTarget) {
    if (this.autoPlayer) playerTarget = this.stance(1).bodyX;
    const competitiveAI = this.autoPlayer && !this.practice;
    const playerSpeed = competitiveAI ? LEVELS[this.level].speed : 3.7;
    if (!competitiveAI || this.clock >= this.playerReactAt) this.playerX += clamp(playerTarget - this.playerX, -playerSpeed * dt, playerSpeed * dt);
    for (const [key, side] of [['playerSwing', 1], ['opponentSwing', -1]]) {
      const swing = this[key];
      if (swing && this.clock >= swing.until) {
        if (!swing.hit && side === 1 && this.phase === 'rally') this.onEvent({ type: 'miss', reason: this.ball.hitter === 1 ? 'wait' : 'timing' });
        this[key] = null;
      }
    }
    if (this.phase === 'point' && this.clock >= this.nextAt) {
      this.phase = 'ready';
      this.ball = null;
      this.autoServeAt = this.clock + Math.max(this.practice ? 0.35 : 0.9, SERVE_PREPARATION);
      this.onEvent({ type: 'ready', server: this.server });
    }
    if (this.phase === 'ready' && !this.pendingServe && (this.server === -1 || this.practice || this.autoPlayer) && this.clock >= this.autoServeAt - SERVE_PREPARATION) this.prepareServe();
    if (this.pendingServe && this.clock >= this.pendingServe.at) this.serve();
    if (this.phase !== 'rally') return;
    const opponentContact = this.contact(-1);
    const opponentPlan = this.planShot(-1);
    if (this.clock >= this.opponentReactAt) {
      if (this.ball.hitter === 1) {
        const contactX = opponentContact?.x ?? this.ball.x;
        const forehandDirection = this.opponentHand === 'left' ? 1 : -1;
        this.opponentTarget = opponentPlan?.stance.bodyX ?? clamp(contactX - forehandDirection * (contactX * forehandDirection >= 0 ? 0.20 : -0.16), -1.12, 1.12);
      }
      else this.opponentTarget = this.stance(-1).bodyX;
      const max = LEVELS[this.level].speed * dt;
      this.opponentX += clamp(this.opponentTarget - this.opponentX, -max, max);
    }
    if (!this.opponentSwing && opponentContact?.legal && opponentContact.time <= (opponentPlan?.contactDelay ?? 0.16) && this.clock >= this.opponentReactAt) {
      const aim = this.practice ? (this.shots % 4 < 2 ? 0.52 : -0.52) : clamp(-this.playerX * 0.65 + (this.random() - 0.5) * 1.25, -1, 1);
      this.beginSwing(-1, opponentPlan ?? { aim, power: this.practice ? 0.3 : 0.3 + this.random() * 0.5, spin: this.practice || this.random() > 0.25 ? 1 : -1 }, true);
    }
    const playerContact = this.autoPlayer ? this.contact(1) : null;
    const playerPlan = this.autoPlayer ? this.planShot(1) : null;
    if (playerPlan && !this.playerSwing && playerContact?.legal && playerContact.time <= playerPlan.contactDelay && (!competitiveAI || this.clock >= this.playerReactAt)) this.beginSwing(1, playerPlan, true);
    {
      const b = this.ball;
      const previous = { x: b.x, y: b.y, z: b.z };
      advanceBall(b, dt);
      if (previous.z * b.z < 0) {
        const t = previous.z / (previous.z - b.z);
        const netY = previous.y + (b.y - previous.y) * t;
        const netX = previous.x + (b.x - previous.x) * t;
        if (netY < SURFACE + TABLE.net && Math.abs(netX) < TABLE.halfWidth + 0.04) {
          if (b.isServe && b.serveStage === 1) {
            this.phase = 'ready'; this.ball = null; this.nextAt = this.clock;
            this.autoServeAt = this.clock + 0.65;
            this.onEvent({ type: 'let', server: this.server });
          } else this.point(-b.hitter, 'net');
          return;
        }
      }
      if (previous.y > SURFACE && b.y <= SURFACE && b.vy < 0) {
        const t = (previous.y - SURFACE) / (previous.y - b.y);
        const bx = previous.x + (b.x - previous.x) * t;
        const bz = previous.z + (b.z - previous.z) * t;
        if (Math.abs(bx) <= TABLE.halfWidth + TABLE.radius && Math.abs(bz) <= TABLE.halfLength + TABLE.radius) {
          const side = bz >= 0 ? 1 : -1;
          if (b.isServe && b.serveStage === 0) {
            if (side !== b.hitter) { this.point(-b.hitter, 'serve'); return; }
            b.serveStage = 1;
          } else {
            if (side === b.hitter) { this.point(-b.hitter, 'short'); return; }
            b.received++;
            if (b.received > 1) { this.point(b.hitter, 'double'); return; }
          }
          b.x = bx; b.z = bz;
          bounce(b);
          b.lastBounce = { x: bx, z: bz };
          this._contactForecast = null;
          this.contact(-b.hitter);
          this.onEvent({ type: 'bounce', x: bx, z: bz });
        }
      }
      for (const side of [1, -1]) {
        const swing = side === 1 ? this.playerSwing : this.opponentSwing;
        if (swing && this.canHit(side) && b.z * side >= swing.contactDepth) this.hit(side, swing.shot);
      }
      if (b.y < 0.08 || Math.abs(b.z) > 2.65 || Math.abs(b.x) > 2.7) this.point(b.received >= 1 ? b.hitter : -b.hitter, b.received >= 1 ? 'missed' : 'out');
    }
  }
}
import { chooseShot, getPlayerProfile } from './player-profiles.mjs';
