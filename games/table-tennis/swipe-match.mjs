export const COURT = Object.freeze({ halfWidth: .7625, halfLength: 1.37, ballRadius: .033, paddleRadius: .155 });
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const WALL_STEP = 1 / 240, PLAYER_SPEED = 5.5, MOVE_THRESHOLD = .2, MOVE_MEMORY = .18, GESTURE_WINDOW = .075;
const SLOW_SCALE = .30, SLOW_SECONDS = 1, SIDE_LIMIT = 1.24, GOAL_LIMIT = 2.03;
const LEVELS = Object.freeze({
  easy: { speed: 1.25, acceleration: 7, reaction: .24, sample: .16 },
  normal: { speed: 1.75, acceleration: 9, reaction: .18, sample: .13 },
  hard: { speed: 2.25, acceleration: 11, reaction: .13, sample: .10 },
});

// Both circles move during the interval. A distant target is never a collision path.
export function sweptCircleContact(ballFrom, ballTo, paddleFrom, paddleTo, radius) {
  const x = ballFrom.x - paddleFrom.x, z = ballFrom.z - paddleFrom.z;
  const dx = ballTo.x - ballFrom.x - (paddleTo.x - paddleFrom.x);
  const dz = ballTo.z - ballFrom.z - (paddleTo.z - paddleFrom.z);
  const c = x * x + z * z - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-16) return null;
  const b = 2 * (x * dx + z * dz), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

const paddle = (z) => ({ x: 0, z, vx: 0, vz: 0, radius: COURT.paddleRadius });
const copyPoint = point => ({ x: point.x, z: point.z });
const moveToward = (from, target, distance) => {
  const dx = target.x - from.x, dz = target.z - from.z, length = Math.hypot(dx, dz);
  const scale = length > distance && length > 0 ? distance / length : 1;
  return { x: from.x + dx * scale, z: from.z + dz * scale };
};

// This is a planar arcade model: physical paddle contact, without a table-bounce
// solver or predetermined landing point. Spin means lateral curve in this mode.
export class SwipeMatch {
  constructor({ onEvent = () => {}, random = Math.random } = {}) {
    this.onEvent = onEvent;
    this.random = random;
    this.reset();
  }

  reset() {
    this.phase = 'idle'; this.mode = 'practice'; this.level = 'easy';
    this.score = [0, 0]; this.ball = null;
    this.player = paddle(1.18); this.opponent = paddle(-1.25);
    this.clock = 0; this.gameClock = 0; this.wallClock = 0;
    this.timeScale = 1; this.slowRemaining = 0; this.slowUsed = false; this.legId = 0;
    this.shots = 0; this.best = 0; this.playerHits = 0; this.lastShot = null; this.nextAt = 0;
    this.lastPlayerMove = -100; this.gestureVelocity = { vx: 0, vz: 0 };
    this._target = copyPoint(this.player); this._slowActive = false;
    this._aiTarget = copyPoint(this.opponent); this._aiReactAt = 0; this._aiSampleAt = 0; this._aiRecoverAt = 0;
    this._returnIndex = 0;
  }

  start({ mode = 'practice', level = 'easy' } = {}) {
    this.reset();
    this.mode = mode === 'match' ? 'match' : 'practice';
    this.level = Object.hasOwn(LEVELS, level) ? level : 'easy';
    this._ready();
  }

  _emit(type, details = {}) { this.onEvent({ type, ...details }); }

  _ready() {
    this.phase = 'ready'; this.ball = null; this.shots = 0;
    this.player = paddle(1.18); this.opponent = paddle(-1.25);
    this._aiTarget = copyPoint(this.opponent); this.cancelInput(); this._endSlow();
    this.nextAt = this.wallClock + .70;
    this._emit('ready');
  }

  setPaddleTarget(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this._target = { x: clamp(x, -1.02, 1.02), z: clamp(z, .62, 1.78) };
  }

  cancelInput() {
    this._target = copyPoint(this.player);
    this.player.vx = 0; this.player.vz = 0;
    this.lastPlayerMove = -100; this.gestureVelocity = { vx: 0, vz: 0 };
  }

  serve() {
    if (this.phase !== 'ready') return false;
    const x = this.opponent.x, vx = clamp((this.random() - .5) * .55, -.275, .275);
    this.opponent.vx = 0; this.opponent.vz = 0;
    this._aiTarget = copyPoint(this.opponent);
    this.ball = { x, z: this.opponent.z + COURT.paddleRadius + COURT.ballRadius + .012, vx, vz: 3.15, spin: 0, hitter: -1 };
    this.phase = 'rally'; this.nextAt = 0; this.shots = 0; this._incomingLeg();
    this._aiRecoverAt = this.gameClock + .12;
    this._emit('serve', { side: -1, ...this.ball });
    return true;
  }

  _incomingLeg() {
    this.legId++; this.slowUsed = false; this.slowRemaining = SLOW_SECONDS;
    this._slowActive = false; this.timeScale = 1;
  }

  _endSlow() { this._slowActive = false; this.slowRemaining = 0; this.timeScale = 1; }

  step(wallDt) {
    if (!Number.isFinite(wallDt) || wallDt <= 0 || this.phase === 'idle' || this.phase === 'over') return;
    // Substeps bound curve error and motion sweeps, including at 15 Hz rendering.
    let remaining = Math.min(wallDt, 2);
    while (remaining > 1e-9 && this.phase !== 'over') {
      const elapsed = Math.min(WALL_STEP, remaining);
      this._tick(elapsed); remaining -= elapsed;
    }
  }

  _movePlayer(wallDt) {
    const before = copyPoint(this.player), after = moveToward(before, this._target, PLAYER_SPEED * wallDt);
    this.player.x = after.x; this.player.z = after.z;
    this.player.vx = (after.x - before.x) / wallDt; this.player.vz = (after.z - before.z) / wallDt;
    // Pointer updates are discrete. Average the actual wall-time trajectory so
    // catch-up bursts do not turn a slowly dragged paddle into a fast stroke.
    const weight = 1 - Math.exp(-wallDt / GESTURE_WINDOW);
    this.gestureVelocity.vx += (this.player.vx - this.gestureVelocity.vx) * weight;
    this.gestureVelocity.vz += (this.player.vz - this.gestureVelocity.vz) * weight;
    if (Math.hypot(this.player.vx, this.player.vz) > MOVE_THRESHOLD) {
      this.lastPlayerMove = this.wallClock;
    }
    return before;
  }

  _moveAI(gameDt) {
    const before = copyPoint(this.opponent), config = LEVELS[this.level];
    if (this.ball?.hitter === 1 && this.ball.vz < 0 && this.gameClock >= this._aiReactAt && this.gameClock >= this._aiSampleAt) {
      // A sampled, stale intercept controls the actual paddle, never the ball.
      const flight = Math.max(0, (-1.18 - this.ball.z) / this.ball.vz);
      const expectedX = this.ball.x + this.ball.vx * flight + .5 * this.ball.spin * .60 * flight * flight;
      const offset = this._returnIndex % 3 === 0 ? -.055 : this._returnIndex % 3 === 1 ? .055 : 0;
      this._aiTarget = { x: clamp(expectedX + offset, -1.02, 1.02), z: -1.18 };
      this._aiSampleAt = this.gameClock + config.sample;
    } else if (this.ball?.hitter === -1 && this.gameClock >= this._aiRecoverAt) {
      this._aiTarget = { x: 0, z: -1.25 };
    }
    const target = moveToward(before, this._aiTarget, config.speed * gameDt);
    let wantedX = gameDt > 0 ? (target.x - before.x) / gameDt : 0;
    let wantedZ = gameDt > 0 ? (target.z - before.z) / gameDt : 0;
    const dvx = wantedX - this.opponent.vx, dvz = wantedZ - this.opponent.vz, change = Math.hypot(dvx, dvz);
    const ratio = change > 0 ? Math.min(1, config.acceleration * gameDt / change) : 0;
    wantedX = this.opponent.vx + dvx * ratio; wantedZ = this.opponent.vz + dvz * ratio;
    this.opponent.x = clamp(before.x + wantedX * gameDt, -1.02, 1.02);
    this.opponent.z = clamp(before.z + wantedZ * gameDt, -1.78, -.62);
    this.opponent.vx = gameDt > 0 ? (this.opponent.x - before.x) / gameDt : 0;
    this.opponent.vz = gameDt > 0 ? (this.opponent.z - before.z) / gameDt : 0;
    return before;
  }

  _ballEnd(gameDt) {
    const acceleration = this.ball.spin * .60;
    return { x: this.ball.x + this.ball.vx * gameDt + acceleration * gameDt * gameDt * .5, z: this.ball.z + this.ball.vz * gameDt };
  }

  _advanceBall(gameDt) {
    const end = this._ballEnd(gameDt);
    this.ball.x = end.x; this.ball.z = end.z;
    this.ball.vx += this.ball.spin * .60 * gameDt;
    this.ball.spin *= Math.exp(-.35 * gameDt);
  }

  _tick(wallDt) {
    const wallStart = this.wallClock, gameStart = this.gameClock;
    if (this.phase === 'point') {
      this.wallClock += wallDt; this.gameClock += wallDt; this.clock = this.gameClock;
      if (this.wallClock >= this.nextAt) this._ready();
      return;
    }
    const playerBefore = this._movePlayer(wallDt);
    if (this.phase === 'ready') {
      this.wallClock += wallDt; this.gameClock += wallDt; this.clock = this.gameClock;
      if (this.nextAt > 0 && this.wallClock >= this.nextAt) this.serve();
      return;
    }
    if (this.ball.hitter === -1 && this.ball.vz > 0 && this.ball.z >= .30 && !this.slowUsed) {
      this.slowUsed = true; this._slowActive = true;
    }
    if (this._slowActive && this.slowRemaining <= 1e-9) this._endSlow();
    this.timeScale = this._slowActive ? SLOW_SCALE : 1;
    const scaledWall = this._slowActive ? Math.min(wallDt, this.slowRemaining) : wallDt;
    const gameDt = scaledWall * this.timeScale + (wallDt - scaledWall);
    const opponentBefore = this._moveAI(gameDt), ballBefore = copyPoint(this.ball), ballAfter = this._ballEnd(gameDt);
    const side = this.ball.hitter === -1 && this.ball.vz > 0 ? 1 : this.ball.hitter === 1 && this.ball.vz < 0 ? -1 : 0;
    const target = side === 1 ? this.player : this.opponent;
    const targetBefore = side === 1 ? playerBefore : opponentBefore;
    const recentMove = wallStart - this.lastPlayerMove <= MOVE_MEMORY;
    const contact = side && (side === -1 || recentMove) ? sweptCircleContact(ballBefore, ballAfter, targetBefore, target, COURT.ballRadius + target.radius) : null;
    if (contact !== null) {
      const usedWall = wallDt * contact, usedGame = gameDt * contact;
      this._advanceBall(usedGame);
      this.wallClock = wallStart + usedWall; this.gameClock = gameStart + usedGame; this.clock = this.gameClock;
      const contactPaddle = { ...target, x: targetBefore.x + (target.x - targetBefore.x) * contact, z: targetBefore.z + (target.z - targetBefore.z) * contact };
      this._hit(side, contactPaddle);
      // Player impact cancels slow time within this substep, not one frame later.
      const remainingWall = wallDt - usedWall;
      this._advanceBall(remainingWall);
      this.wallClock = wallStart + wallDt; this.gameClock += remainingWall; this.clock = this.gameClock;
    } else {
      this._advanceBall(gameDt);
      this.wallClock = wallStart + wallDt; this.gameClock = gameStart + gameDt; this.clock = this.gameClock;
      if (this._slowActive) {
        this.slowRemaining = Math.max(0, this.slowRemaining - wallDt);
        if (this.slowRemaining <= 1e-9) this._endSlow();
      }
    }
    if (this.ball.x < -SIDE_LIMIT || this.ball.x > SIDE_LIMIT) this._point(-this.ball.hitter, 'out');
    else if (this.ball.z > GOAL_LIMIT) this._point(-1, 'missed');
    else if (this.ball.z < -GOAL_LIMIT) this._point(1, 'missed');
  }

  _hit(side, contactPaddle) {
    const movement = side === 1 ? { x: this.gestureVelocity.vx, z: this.gestureVelocity.vz } : { x: contactPaddle.vx, z: contactPaddle.vz };
    const offset = clamp((this.ball.x - contactPaddle.x) / contactPaddle.radius, -1, 1);
    const forward = Math.max(0, -side * movement.z);
    const power = clamp(.18 + forward * .13 + Math.abs(movement.x) * .025, .12, 1);
    const angle = clamp(offset * .24 + movement.x / PLAYER_SPEED * .31, -.55, .55);
    const speed = clamp(2.65 + power * 2.85 + Math.hypot(this.ball.vx, this.ball.vz) * .07, 2.9, 6.2);
    const spin = clamp(movement.x / PLAYER_SPEED * 1.05 + offset * .30, -1.4, 1.4);
    const distance = Math.hypot(this.ball.x - contactPaddle.x, this.ball.z - contactPaddle.z);
    this.ball.vx = Math.sin(angle) * speed; this.ball.vz = -side * Math.cos(angle) * speed;
    this.ball.spin = spin; this.ball.hitter = side;
    this.shots++; this.best = Math.max(this.best, this.shots);
    if (side === 1) {
      this.playerHits++; this._endSlow();
      this._aiReactAt = this.gameClock + LEVELS[this.level].reaction;
      this._aiSampleAt = this._aiReactAt; this._returnIndex++;
    } else { this._incomingLeg(); this._aiRecoverAt = this.gameClock + .16; }
    this.lastShot = { angle, power, spin, side, label: Math.abs(spin) > .35 ? 'curve' : power > .58 ? 'drive' : 'touch' };
    this._emit('hit', {
      side, x: this.ball.x, z: this.ball.z, vx: this.ball.vx, vz: this.ball.vz, spin, power,
      paddleX: contactPaddle.x, paddleZ: contactPaddle.z, paddleVx: contactPaddle.vx, paddleVz: contactPaddle.vz,
      gestureVx: movement.x, gestureVz: movement.z,
      contactDistance: distance, movementAge: Math.max(0, this.wallClock - this.lastPlayerMove), legId: this.legId, swept: true,
    });
  }

  _point(winner, reason) {
    if (this.phase !== 'rally') return;
    this.score[winner === 1 ? 0 : 1]++;
    this._endSlow(); this.cancelInput();
    this.phase = 'point'; this.nextAt = this.wallClock + .72;
    this._emit('point', { winner, reason });
    if (this.mode === 'match' && this.score.some(value => value >= 5)) {
      this.phase = 'over'; this.nextAt = 0;
      this._emit('over', { winner, reason, score: [...this.score] });
    }
  }

  snapshot() {
    return {
      phase: this.phase, mode: this.mode, level: this.level, score: [...this.score],
      ball: this.ball ? { ...this.ball } : null, player: { ...this.player }, opponent: { ...this.opponent },
      clock: this.clock, gameClock: this.gameClock, wallClock: this.wallClock,
      timeScale: this.timeScale, slowRemaining: this.slowRemaining, slowUsed: this.slowUsed, legId: this.legId,
      shots: this.shots, best: this.best, playerHits: this.playerHits,
      lastShot: this.lastShot ? { ...this.lastShot } : null, nextAt: this.nextAt,
      lastPlayerMove: this.lastPlayerMove, movementAge: Math.max(0, this.wallClock - this.lastPlayerMove),
      gestureVelocity: { ...this.gestureVelocity },
      paddleTarget: { ...this._target },
    };
  }
}
