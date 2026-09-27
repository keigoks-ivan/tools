/**
 * 隊友快照插值（純數學，game/tests/coop-net.test.mjs 驗證）
 *
 * 每則快照帶「送出端的毫秒時鐘」t。收到時估計兩邊時鐘差 offset（取觀測到的最小值，慢慢往上放鬆，
 * 吸收網路延遲抖動），畫面上顯示的是「送出端 delay 毫秒前」的位置：前後兩筆快照之間線性插值，
 * 所以 12 Hz 的封包也能畫得平順。封包斷掉時沿最後速度外插最多 maxExtrapolate 毫秒，之後停住。
 * 自己的角色不經過這裡，永遠即時。
 */

export const INTERP_DELAY_MS = 100;
export const MAX_EXTRAPOLATE_MS = 250;

const lerp = (a, b, t) => a + (b - a) * t;
/** 角度走最短方向插值 */
export function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export class SnapshotBuffer {
  constructor({ delay = INTERP_DELAY_MS, maxExtrapolate = MAX_EXTRAPOLATE_MS, capacity = 32, interval = 1000 / 12 } = {}) {
    this.delay = delay; this.maxExtrapolate = maxExtrapolate; this.capacity = capacity;
    this.interval = interval; this.holdGap = interval * 2.2;
    this.snaps = [];
    this.offset = null;        // 本機時鐘 − 送出端時鐘（含單程延遲）
    this.receivedAt = -Infinity;
  }
  clear() { this.snaps.length = 0; this.offset = null; }

  /** @param {{t:number,x:number,y:number,z:number,yaw:number}} snap @param {number} now 本機毫秒 */
  push(snap, now) {
    let last = this.snaps.at(-1);
    // 對方重新整理頁面：時鐘從 0 重來，整個重置
    if (last && snap.t < last.t - 1000) { this.clear(); last = undefined; }
    else if (last && snap.t <= last.t) return false;   // 重複或亂序，丟掉
    // 對方站著不動時只送 2 Hz 保持連線：開始移動的第一筆與上一筆隔很久，先補一筆「原地」快照在它前一個間隔，
    // 否則插值會把整段空檔攤平，看起來像瞬移半步。只在上一筆本來就靜止時補（移動中掉封包不補）。
    if (last && snap.t - last.t > this.holdGap) {
      const prev = this.snaps.at(-2);
      const still = !prev || (prev.x === last.x && prev.y === last.y && prev.z === last.z);
      if (still) this.snaps.push({ ...last, t: snap.t - this.interval });
    }
    const sample = now - snap.t;
    if (this.offset === null || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.02;   // 網路變慢時慢慢跟上（約 4 秒）
    this.snaps.push(snap);
    while (this.snaps.length > this.capacity) this.snaps.shift();
    this.receivedAt = now;
    return true;
  }

  /**
   * @param {number} now 本機毫秒
   * @returns {null | {x,y,z,yaw,lift,anim,time,scale,loop, extrapolated:number, frozen:boolean}}
   */
  sample(now) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const renderT = now - this.offset - this.delay;
    if (renderT <= snaps[0].t) return { ...snaps[0], extrapolated: 0, frozen: false };
    for (let i = snaps.length - 1; i > 0; i--) {
      const a = snaps[i - 1], b = snaps[i];
      if (renderT >= a.t && renderT < b.t) {
        const k = (renderT - a.t) / (b.t - a.t);
        return {
          ...a,
          x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k),
          yaw: lerpAngle(a.yaw, b.yaw, k), lift: lerp(a.lift || 0, b.lift || 0, k),
          extrapolated: 0, frozen: false,
        };
      }
    }
    // 超過最新一筆：沿最後速度外插（兩筆間隔太久就不外插，免得亂飛），上限之後停住
    const last = snaps.at(-1), prev = snaps.at(-2);
    const ahead = renderT - last.t;
    const used = Math.min(ahead, this.maxExtrapolate);
    let vx = 0, vy = 0, vz = 0;
    if (prev && last.t - prev.t > 0 && last.t - prev.t <= 400) {
      const span = last.t - prev.t;
      vx = (last.x - prev.x) / span; vy = (last.y - prev.y) / span; vz = (last.z - prev.z) / span;
    }
    return { ...last, x: last.x + vx * used, y: last.y + vy * used, z: last.z + vz * used, extrapolated: used, frozen: ahead > this.maxExtrapolate };
  }
}
