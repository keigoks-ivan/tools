/**
 * 第三階段：隊伍規則的純邏輯（不碰 Three.js、不碰網路；game/tests/coop-team.test.mjs 直接驗證）。
 *
 * - 倒地與救援：血量歸零的玩家「倒地」而不是陣亡；隊友站在旁邊不動約 3 秒就能把他救起（房主計時、房主裁定）
 * - 全滅：所有人都倒地才算輸
 * - 合體大招：兩位以上玩家在 1.5 秒內先後放無雙 → 傷害與範圍加成
 * - 補給：房主裁定誰撿到（先申報先得，距離要合理）
 * - 交出房主：只交給看得到畫面的隊友，而且要「持續不行」一段時間才交，避免房主身分來回跳
 *
 * 所有可調數字都集中在這個檔案最上面。
 */

/** 倒地與救援（距離單位是 Arena px，60 px ＝ 1 公尺） */
export const TEAM = {
  reviveRadius: 90,          // 救援者與倒地者的距離上限（1.5 公尺）
  reviveSeconds: 3,          // 站著不動多久算救起
  reviveHp: 0.5,             // 救起後的血量比例
  reviveInvulnerable: 2,     // 救起後幾秒無敵（免得一起身就又倒）
  stillPx: 18,               // 「不動」＝離開定點不超過這個距離
  stillSettle: 0.25,         // 停下來多久之後才開始算（走路經過不算）
  reviveDecay: 2,            // 救援被打斷時進度倒退的速度（倍數）
  downedTargetPenalty: 420,  // 敵人挑目標時，倒地的人要多算這麼多距離（優先追站著的人）
  recentReviveMs: 1500,      // 剛救起的人：這段時間內不理會舊的「倒地」狀態封包
};

/** 合體大招 */
export const COMBO = {
  windowMs: 1500,            // 兩人放無雙的時間差上限
  damage: 1.25,              // 傷害倍率（乘在 damageScale 上；真・天刃終結 20×1.5×1.25＝37.5，仍在命中申報上限 40 內）
  radius: 1.2,               // 亂舞與終結範圍倍率
};

/** 交出房主 */
export const HANDOFF = {
  stallMs: 1500,             // 房主的模擬停住多久算「停住」
  graceMs: 2000,             // 房主「不行」（切到背景或停住）要持續這麼久才交棒
  visibleStableMs: 1500,     // 接手的人要持續看得到畫面這麼久
  cooldownMs: 6000,          // 兩次交棒之間至少隔這麼久
  minTenureMs: 5000,         // 剛成為房主的人，這段時間內不交出去
};

/** 角色狀態封包的 st 欄位（位元） */
export const STATUS = { hidden: 1, downed: 2 };

export function statusBits({ hidden = false, downed = false } = {}) {
  return (hidden ? STATUS.hidden : 0) | (downed ? STATUS.downed : 0);
}
export function readStatus(st) {
  const bits = Number.isInteger(st) ? st : 0;
  return { hidden: !!(bits & STATUS.hidden), downed: !!(bits & STATUS.downed) };
}

// ---------------------------------------------------------------- 救援

/**
 * 房主端的救援計時。每一格餵所有玩家 { id, x, y, downed, present }，回傳目前的救援進度與這一格救起的人。
 * present＝在房裡且狀態新鮮（沒在場的人不能救人）。
 */
export class ReviveTracker {
  constructor(options = TEAM) {
    this.o = options;
    this.clock = 0;
    this.anchors = new Map();    // 玩家 id → { x, y, since }：最後一次停下來的位置與時間
    this.progress = new Map();   // 倒地者 id → { seconds, by }
  }
  reset() { this.clock = 0; this.anchors.clear(); this.progress.clear(); }

  /** 這位玩家是否「站定」：離定點不超過 stillPx，且已經停了 stillSettle 秒 */
  _still(p) {
    let anchor = this.anchors.get(p.id);
    if (!anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > this.o.stillPx) {
      this.anchors.set(p.id, anchor = { x: p.x, y: p.y, since: this.clock });
    }
    return this.clock - anchor.since >= this.o.stillSettle;
  }

  /**
   * @param {number} dt 秒
   * @param {Array<{id:string,x:number,y:number,downed:boolean,present?:boolean}>} players
   * @returns {{ progress: Array<[string, number, string|null]>, revived: string[] }} progress：[倒地者, 0–100, 救援者]
   */
  update(dt, players) {
    this.clock += dt;
    const here = players.filter(p => p.present !== false && Number.isFinite(p.x) && Number.isFinite(p.y));
    const still = new Map(here.map(p => [p.id, this._still(p)]));
    for (const id of this.anchors.keys()) if (!still.has(id)) this.anchors.delete(id);
    const revived = [];
    const downed = here.filter(p => p.downed);
    for (const id of this.progress.keys()) if (!downed.some(p => p.id === id)) this.progress.delete(id);
    for (const d of downed) {
      // 最近的、站定的、沒倒地的隊友
      let by = null, best = Infinity;
      for (const p of here) {
        if (p.downed || p.id === d.id || !still.get(p.id)) continue;
        const dist = Math.hypot(p.x - d.x, p.y - d.y);
        if (dist <= this.o.reviveRadius && dist < best) { best = dist; by = p.id; }
      }
      const entry = this.progress.get(d.id) || { seconds: 0, by: null };
      if (by) { entry.seconds += dt; entry.by = by; }
      else { entry.seconds = Math.max(0, entry.seconds - dt * this.o.reviveDecay); entry.by = null; }
      if (entry.seconds >= this.o.reviveSeconds) { revived.push(d.id); this.progress.delete(d.id); continue; }
      this.progress.set(d.id, entry);
    }
    const progress = [];
    for (const [id, entry] of this.progress) if (entry.seconds > 0) progress.push([id, Math.min(99, Math.round(entry.seconds / this.o.reviveSeconds * 100)), entry.by]);
    return { progress, revived };
  }
}

/** 全滅：房裡每一位都倒地（至少一人）。沒收到狀態的人算還站著 */
export function teamWiped(players) {
  return players.length > 0 && players.every(p => p.downed === true);
}

// ---------------------------------------------------------------- 合體大招

/**
 * 記錄每位玩家最近一次放無雙的時間（毫秒）。note() 回傳和這一次落在同一個視窗內的其他玩家。
 */
export class ComboWindow {
  constructor(windowMs = COMBO.windowMs) { this.windowMs = windowMs; this.last = new Map(); }
  note(id, t) {
    this.last.set(id, t);
    return this.partners(id, t);
  }
  partners(id, t = this.last.get(id)) {
    if (t === undefined) return [];
    const out = [];
    for (const [other, at] of this.last) if (other !== id && Math.abs(at - t) <= this.windowMs) out.push(other);
    return out.sort();
  }
  reset() { this.last.clear(); }
}

/** 無雙設定的加成版（複製一份，不改到 MUSOU_FLURRY 常數本身） */
export function comboProfile(profile, combo = COMBO) {
  return {
    ...profile,
    damageScale: (profile.damageScale ?? 1) * combo.damage,
    radius: profile.radius * combo.radius,
    finishRadius: profile.finishRadius * combo.radius,
    combo: true,
  };
}

// ---------------------------------------------------------------- 補給

export const PICKUP_REACH = 80 + 60;   // 撿取距離 80 px ＋ 延遲造成的位置誤差

/**
 * 房主裁定：這位玩家能不能拿走這個補給。補給已經被拿走（不在清單上）、太遠、或申報者倒地 → 不給。
 * @returns {number} 補給在清單中的位置，-1＝不給
 */
export function grantPickup(pickups, pickupId, claimant, reach = PICKUP_REACH) {
  if (!claimant || claimant.downed || !Number.isFinite(claimant.x) || !Number.isFinite(claimant.y)) return -1;
  const index = pickups.findIndex(p => p.id === pickupId);
  if (index < 0) return -1;
  const p = pickups[index];
  return Math.hypot(p.x - claimant.x, p.y - claimant.y) <= reach ? index : -1;
}

// ---------------------------------------------------------------- 交出房主

/**
 * 房主端的交棒判斷（帶遲滯）。每次 hostTick 呼叫 decide()：
 *   self：{ hidden, stalled } 房主自己的狀況
 *   candidates：[{ id, visible, downed, present }] 其他成員
 * 回傳要交給誰（或 null＝繼續當房主）。
 * - 房主「不行」要持續 graceMs 才交；恢復正常就重新計時
 * - 接手者必須持續 visibleStableMs 看得到畫面；站著的人優先，沒有站著的才交給倒地但看得到畫面的人
 *   （倒地的人仍能跑模擬與計時救援；交給看不到畫面的人才會讓整個房間卡住）
 * - 沒有合格人選：不交，等到有人回來再交
 */
export class HandoffPolicy {
  constructor(options = HANDOFF) {
    this.o = options;
    this.badSince = null;
    this.visibleSince = new Map();
    this.hostSince = -Infinity;
    this.lastYieldAt = -Infinity;
  }
  /** 成為房主（開局、換手接手）時呼叫 */
  becameHost(t) { this.hostSince = t; this.badSince = null; }
  yielded(t) { this.lastYieldAt = t; this.badSince = null; }

  decide(t, self, candidates) {
    for (const c of candidates) {
      if (c.present !== false && c.visible) { if (!this.visibleSince.has(c.id)) this.visibleSince.set(c.id, t); }
      else this.visibleSince.delete(c.id);
    }
    for (const id of this.visibleSince.keys()) if (!candidates.some(c => c.id === id)) this.visibleSince.delete(id);
    const bad = !!(self.hidden || self.stalled);
    if (!bad) { this.badSince = null; return null; }
    this.badSince ??= t;
    if (t - this.badSince < this.o.graceMs) return null;
    if (t - this.hostSince < this.o.minTenureMs || t - this.lastYieldAt < this.o.cooldownMs) return null;
    const ready = candidates.filter(c => this.visibleSince.has(c.id) && t - this.visibleSince.get(c.id) >= this.o.visibleStableMs);
    if (!ready.length) return null;
    ready.sort((a, b) => (a.downed === b.downed ? (a.id < b.id ? -1 : 1) : a.downed ? 1 : -1));
    return ready[0].id;
  }
}
