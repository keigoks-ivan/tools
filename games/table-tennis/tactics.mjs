import { TABLE, shotVelocity } from './physics.mjs?v=8';

// These targets assess the simulated ball, not real-player ability or usage rates.
export const MISSIONS = Object.freeze([
  { id: 'rhythm', number: '01', goal: 6, time: 70, title: ['穩住六板', 'Find your rhythm'], description: ['連續六次回球，全部落在對方桌面。先求穩，再求快。', 'Land six consecutive returns on the opposite half. Settle into the rhythm.'], tip: ['建議：上旋・中間・長球', 'Try topspin · centre · long'], target: ['連續合法落桌', 'Consecutive legal returns'] },
  { id: 'switch', number: '02', goal: 3, time: 65, title: ['壓一側，再變線', 'Build. Then switch.'], description: ['連續兩板落在同一側，第三板打向另一側。左右皆可，落點要離中線 22 公分以上。', 'Land two shots on the same side, then switch on the third. Either side works; land at least 22 cm from centre.'], tip: ['建議：先左・再左・最後右', 'Try left · left · right'], target: ['同側 × 2 → 另一側', 'Same side × 2 → opposite'] },
  { id: 'short', number: '03', goal: 3, time: 75, title: ['低短控制', 'Keep it low & short'], description: ['三次下旋回球落在近網區；過網球心高度不超過 1.22 公尺。不是只選短球，球真的要落進去。', 'Land three backspin returns in the short zone, with ball centre at or below 1.22 m over the net. Your actual ball must reach the zone.'], tip: ['建議：下旋・短球・力道 40%', 'Try backspin · short · 40% power'], target: ['下旋・近網落點・低過網', 'Backspin · short zone · low net crossing'] },
  { id: 'lift', number: '04', goal: 3, time: 75, title: ['下旋起板', 'Lift the backspin'], description: ['教練送長下旋。用上旋回擊三次，並讓球合法落在對方桌面。', 'The coach feeds long backspin balls. Return three with topspin and land them legally.'], tip: ['建議：上旋・長球・力道 55%', 'Try topspin · long · 55% power'], target: ['下旋來球 → 上旋合法回擊', 'Incoming backspin → legal topspin return'] },
]);
export const missionById = id => MISSIONS.find(m => m.id === id) ?? MISSIONS[0];

export class TacticalRun {
  constructor(id) { this.mission = missionById(id); this.reset(); }
  reset() { this.status = 'running'; this.progress = 0; this.faults = 0; this.elapsed = 0; this.pending = null; this.lane = 0; this.message = 'start'; this.legalReturns = 0; }
  tick(dt) { if (this.status !== 'running') return; this.elapsed += dt; if (this.elapsed >= this.mission.time) { this.status = 'failed'; this.message = 'time'; } }
  captureSwing(event, incoming, automated = false) {
    if (this.status !== 'running' || event.side !== 1 || event.serve || automated) return;
    this.pending = { spin: event.spin, incomingSpin: incoming?.spin ?? 0, netHeight: null, hit: false };
  }
  observeBall(previous, ball) {
    if (!this.pending?.hit || !previous || !ball || previous.hitter !== 1 || ball.hitter !== 1) return;
    if (previous.z >= 0 && ball.z < 0) {
      const fraction = previous.z / (previous.z - ball.z);
      this.pending.netHeight = previous.y + (ball.y - previous.y) * fraction;
    }
  }
  event(event, ball, automated = false) {
    if (this.status !== 'running') return false;
    if (event.type === 'hit' && event.side === 1 && !automated && this.pending) this.pending.hit = true;
    if (event.type === 'bounce' && this.pending?.hit && ball?.hitter === 1 && ball.received === 1 && !ball.isServe && event.z < 0) {
      const shot = this.pending; this.pending = null; this.legalReturns++;
      const id = this.mission.id;
      if (id === 'rhythm') { this.progress++; this.message = 'good'; }
      else if (id === 'switch') {
        const lane = Math.abs(event.x) >= 0.22 ? Math.sign(event.x) : 0;
        if (!lane) { this.progress = 0; this.lane = 0; this.message = 'wide'; }
        else if (this.progress === 0) { this.lane = lane; this.progress = 1; this.message = 'same'; }
        else if (this.progress === 1) { if (lane === this.lane) { this.progress = 2; this.message = 'switch'; } else { this.lane = lane; this.message = 'same'; } }
        else if (lane !== this.lane) { this.progress = 3; this.message = 'good'; }
        else this.message = 'switch';
      } else if (id === 'short') {
        if (shot.spin <= -0.45 && -event.z >= 0.35 && -event.z <= 0.70 && shot.netHeight !== null && shot.netHeight <= 1.22) { this.progress++; this.message = 'good'; }
        else this.message = shot.spin > -0.45 ? 'backspin' : 'short';
      } else if (id === 'lift') {
        if (shot.incomingSpin < -0.35 && shot.spin >= 0.45) { this.progress++; this.message = 'good'; }
        else this.message = 'topspin';
      }
      if (this.progress >= this.mission.goal) { this.status = 'success'; this.message = 'complete'; }
      return true;
    }
    if (event.type === 'point' || event.type === 'over') {
      this.pending = null;
      if (this.mission.id === 'rhythm' || this.mission.id === 'switch') { this.progress = 0; this.lane = 0; }
      if (event.winner === -1) {
        this.faults++; this.message = 'fault';
        if (this.faults >= 3) { this.status = 'failed'; this.message = 'faults'; }
      }
    }
    return false;
  }
  snapshot() { return { id: this.mission.id, status: this.status, progress: this.progress, goal: this.mission.goal, faults: this.faults, elapsed: this.elapsed, remaining: Math.max(0, this.mission.time - this.elapsed), message: this.message, legalReturns: this.legalReturns }; }
}

// A physical training feed: the receiving bounce is still simulated and required.
export function launchTrainingFeed(match, id, index = 0) {
  if (match.phase === 'rally' || match.phase === 'over') return false;
  const origin = { x: 0, y: 1.06, z: -1.54 }, target = { x: index % 2 ? 0.18 : -0.18, z: 0.88 };
  const spin = id === 'lift' ? -1.6 : 0.7;
  match.ball = { ...origin, ...shotVelocity(origin, target, 0.52, spin), spin, sideSpin: 0, hitter: -1, received: 0, isServe: false };
  match.phase = 'rally'; match.shots = 0; match.rallies++; match.playerSwing = null; match.opponentSwing = null; match.pendingServe = null;
  match.previousShots = []; match._planCache = null; match._contactForecast = null;
  match.opponentReactAt = match.clock; match.playerReactAt = match.clock;
  match.onEvent({ type: 'feed', side: -1, spin, ...origin });
  return true;
}

export function readBest(storage, key) {
  try { const n = Number(storage.getItem(`rally-v8:${key}`)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
}
export function saveBest(storage, key, value, lower = false) {
  const old = readBest(storage, key), best = old === null ? value : lower ? Math.min(old, value) : Math.max(old, value);
  try { storage.setItem(`rally-v8:${key}`, String(best)); } catch { /* Private browsing may not allow storage. */ }
  return best;
}
