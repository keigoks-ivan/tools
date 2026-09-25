// 手機觸控用的小工具（純函式，battle.js 使用；game/tests/touch-input-3d.test.mjs 直接驗證）

/** 關卡提示寫的是鍵盤操作「J（攻）」；觸控裝置只留按鈕名「攻」。 */
export function touchHint(text) {
  return String(text).replace(/(?:J|K|E|Shift|Space)（([^）]+)）/g, '「$1」');
}

/**
 * Holding a touch button re-fires its action every `interval` real seconds after the first press
 * (the Arena buffers an attack for 0.18 s, so 0.15 s keeps a held 攻 chaining like steady tapping).
 */
export class HoldRepeat {
  constructor(interval = 0.15) {
    this.interval = interval;
    this.held = new Map();   // pointerId -> { action, wait }
  }

  press(action, pointerId) { this.held.set(pointerId, { action, wait: this.interval }); }

  release(pointerId) { this.held.delete(pointerId); }

  clear() { this.held.clear(); }

  /** Advance by `dt` real seconds; returns the actions to fire this frame (each at most once). */
  tick(dt) {
    const fire = [];
    for (const hold of this.held.values()) {
      hold.wait -= Math.max(0, dt || 0);
      if (hold.wait > 0) continue;
      hold.wait = this.interval;
      if (!fire.includes(hold.action)) fire.push(hold.action);
    }
    return fire;
  }
}
