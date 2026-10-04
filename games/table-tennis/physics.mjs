export const TABLE = Object.freeze({ halfWidth: 0.7625, halfLength: 1.37, height: 0.76, net: 0.1525, radius: 0.02 });
export const LEVELS = Object.freeze({
  easy: { speed: 1.65, reaction: 0.25, reach: 0.57, flight: 0.72, error: 0.11 },
  normal: { speed: 2.3, reaction: 0.16, reach: 0.5, flight: 0.61, error: 0.065 },
  hard: { speed: 3.2, reaction: 0.085, reach: 0.47, flight: 0.48, error: 0.026 },
});
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const SURFACE = TABLE.height + TABLE.radius;

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

export function predictReceive(ball, side) {
  const b = { ...ball };
  for (let i = 0; i < 240; i++) {
    const previousY = b.y;
    advanceBall(b, 1 / 120);
    if (previousY > SURFACE && b.y <= SURFACE && Math.abs(b.x) < TABLE.halfWidth && Math.abs(b.z) < TABLE.halfLength) bounce(b);
    if (b.z * side >= 1.18) return b.x;
  }
  return b.x;
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
    this.queuedShot = null;
    this.nextAt = 0;
    this.lastReachWarning = -10;
  }
  start(level = 'easy') {
    this.reset();
    this.level = Object.hasOwn(LEVELS, level) ? level : 'easy';
    this.phase = 'ready';
    this.onEvent({ type: 'ready', server: this.server });
  }
  serve() {
    if (this.phase !== 'ready') return false;
    const side = this.server;
    const x = side === 1 ? this.playerX : this.opponentX;
    this.ball = { x: clamp(x, -0.42, 0.42), y: 1.15, z: side * 1.28,
      vx: (this.random() - 0.5) * 0.35, vy: -0.65, vz: -side * 3.15,
      spin: 0, sideSpin: 0, hitter: side, received: 0, serveStage: 0, isServe: true };
    this.phase = 'rally';
    this.shots = 0;
    this.rallies++;
    this.queuedShot = null;
    this.opponentReactAt = this.clock + LEVELS[this.level].reaction;
    this.onEvent({ type: 'serve', side });
    return true;
  }
  canHit(side) {
    const b = this.ball;
    return this.phase === 'rally' && b && b.hitter === -side && b.received === 1 &&
      b.z * side >= 0.48 && b.z * side <= 1.88 && b.y >= SURFACE - 0.015 && b.y <= 1.6;
  }
  strike({ aim = 0, power = 0.5, spin = 1, assist = true } = {}) {
    if (this.phase === 'ready') return this.serve();
    if (this.phase !== 'rally') return false;
    const shot = { aim: clamp(aim, -1, 1), power: clamp(power, 0, 1), spin: clamp(spin, -1, 1) };
    if (assist && this.ball.hitter === -1) {
      this.queuedShot = { ...shot, until: this.clock + 1.4 };
      this.onEvent({ type: 'queued' });
      return true;
    }
    if (this.canHit(1)) return this.hit(1, shot);
    this.onEvent({ type: 'miss', reason: this.ball.hitter === 1 ? 'wait' : 'timing' });
    return false;
  }
  hit(side, { aim = 0, power = 0.5, spin = 1, sideSpin = 0 } = {}) {
    if (!this.canHit(side)) return false;
    const b = this.ball;
    const x = side === 1 ? this.playerX : this.opponentX;
    const reach = side === 1 ? 0.58 : LEVELS[this.level].reach;
    if (Math.abs(b.x - x) > reach) {
      if (side === 1 && this.clock - this.lastReachWarning > 0.6) {
        this.lastReachWarning = this.clock;
        this.onEvent({ type: 'miss', reason: 'reach' });
      }
      return false;
    }
    const quality = clamp(1 - Math.abs(b.z * side - 1.23) * 0.95 - Math.max(0, Math.abs(b.x - x) - 0.25), 0.1, 1);
    const flight = LEVELS[this.level].flight * (1.13 - power * 0.28);
    const target = { x: aim * 0.59, z: -side * (0.77 + power * 0.29) };
    if (side === -1) {
      target.x += (this.random() - 0.5) * LEVELS[this.level].error;
      if (this.random() < LEVELS[this.level].error * (1 + this.shots * 0.12)) target.x = Math.sign(target.x || 1) * 0.93;
    } else if (quality < 0.36 && power > 0.84) {
      target.z -= side * 0.58;
    }
    const topSpin = spin * (1.2 + power * 1.5);
    Object.assign(b, shotVelocity(b, target, flight, topSpin, sideSpin));
    Object.assign(b, { spin: topSpin, sideSpin, hitter: side, received: 0, isServe: false });
    this.shots++;
    this.best = Math.max(this.best, this.shots);
    if (side === 1) this.totalHits++;
    this.lastSpeed = Math.hypot(b.vx, b.vy, b.vz) * 3.6;
    this.opponentReactAt = this.clock + LEVELS[this.level].reaction;
    this.opponentTarget = clamp(predictReceive(b, -1), -1.1, 1.1);
    this.queuedShot = null;
    this.onEvent({ type: 'hit', side, quality, spin, speed: this.lastSpeed, x: b.x, y: b.y, z: b.z });
    return true;
  }
  point(winner, reason) {
    if (this.phase !== 'rally') return;
    this.score[winner === 1 ? 0 : 1]++;
    this.server = serverFor(this.score);
    const won = Math.max(...this.score) >= 11 && Math.abs(this.score[0] - this.score[1]) >= 2;
    this.phase = won ? 'over' : 'point';
    this.nextAt = this.clock + 1.65;
    this.queuedShot = null;
    this.onEvent({ type: won ? 'over' : 'point', winner, reason, shots: this.shots, score: [...this.score] });
  }
  step(dt, playerTarget = this.playerX) {
    dt = clamp(dt, 0, 0.05);
    this.clock += dt;
    this.playerX += clamp(playerTarget - this.playerX, -3.7 * dt, 3.7 * dt);
    if (this.phase === 'point' && this.clock >= this.nextAt) {
      this.phase = 'ready';
      this.ball = null;
      this.onEvent({ type: 'ready', server: this.server });
    }
    if (this.phase === 'ready' && this.server === -1 && this.clock >= this.nextAt + 0.9) this.serve();
    if (this.phase !== 'rally') return;
    if (this.clock >= this.opponentReactAt) {
      if (this.ball.hitter === 1) this.opponentTarget = clamp(predictReceive(this.ball, -1), -1.12, 1.12);
      else this.opponentTarget = 0;
      const max = LEVELS[this.level].speed * dt;
      this.opponentX += clamp(this.opponentTarget - this.opponentX, -max, max);
    }
    const substeps = Math.ceil(dt / (1 / 240));
    for (let i = 0; i < substeps && this.phase === 'rally'; i++) {
      const b = this.ball;
      const previous = { x: b.x, y: b.y, z: b.z };
      advanceBall(b, dt / substeps);
      if (previous.z * b.z < 0) {
        const t = previous.z / (previous.z - b.z);
        const netY = previous.y + (b.y - previous.y) * t;
        const netX = previous.x + (b.x - previous.x) * t;
        if (netY < SURFACE + TABLE.net && Math.abs(netX) < TABLE.halfWidth + 0.04) {
          if (b.isServe && b.serveStage === 1) {
            this.phase = 'ready'; this.ball = null; this.nextAt = this.clock;
            this.onEvent({ type: 'let', server: this.server });
          } else this.point(-b.hitter, 'net');
          break;
        }
      }
      if (previous.y > SURFACE && b.y <= SURFACE && b.vy < 0) {
        const t = (previous.y - SURFACE) / (previous.y - b.y);
        const bx = previous.x + (b.x - previous.x) * t;
        const bz = previous.z + (b.z - previous.z) * t;
        if (Math.abs(bx) <= TABLE.halfWidth + TABLE.radius && Math.abs(bz) <= TABLE.halfLength + TABLE.radius) {
          const side = bz >= 0 ? 1 : -1;
          if (b.isServe && b.serveStage === 0) {
            if (side !== b.hitter) { this.point(-b.hitter, 'serve'); break; }
            b.serveStage = 1;
          } else {
            if (side === b.hitter) { this.point(-b.hitter, 'short'); break; }
            b.received++;
            if (b.received > 1) { this.point(b.hitter, 'double'); break; }
          }
          b.x = bx; b.z = bz;
          bounce(b);
          this.onEvent({ type: 'bounce', x: bx, z: bz });
        }
      }
      if (this.queuedShot && this.queuedShot.until < this.clock) this.queuedShot = null;
      if (this.queuedShot && this.canHit(1) && b.z >= 1.16) this.hit(1, this.queuedShot);
      if (this.canHit(-1) && b.z <= -1.19) {
        const aim = clamp(-this.playerX * 0.65 + (this.random() - 0.5) * 1.25, -1, 1);
        this.hit(-1, { aim, power: 0.3 + this.random() * 0.5, spin: this.random() > 0.25 ? 1 : -1 });
      }
      if (b.y < 0.08 || Math.abs(b.z) > 2.65 || Math.abs(b.x) > 2.7) this.point(b.received >= 1 ? b.hitter : -b.hitter, b.received >= 1 ? 'missed' : 'out');
    }
  }
}
