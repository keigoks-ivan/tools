/**
 * 房主端的裁判規則（純函式，game/tests/coop-sync.test.mjs 驗證）：
 *   - 仇恨分配：敵人分散追不同玩家，不會全部追房主
 *   - 命中申報驗證：隊友打中後送 [敵人 id, 原始傷害, 招式來源, 招式編號]，房主寬鬆檢查後才真的扣血
 */

/** 命中來源碼（申報封包用數字省字數）；stun＝無雙起手把範圍內的敵人定住，數值是秒數 */
export const SOURCES = ['attack', 'heavy', 'special', 'stun'];

/**
 * 寬鬆上限：只擋明顯不可能的申報，不追求精確（三位熟人對戰，重點是別讓壞封包把關卡弄壞）。
 * - maxDamage：真・月影終結 34×1.5，加上合體倍率仍低於 80
 * - range：最大招式半徑 450 px（蒼龍終結），加上約 0.3 秒延遲期間雙方移動的餘裕
 * - perSecond：無雙亂舞 12 刀 × 16 隻 ÷ 3.5 秒 ≈ 55 下／秒，留兩倍多
 */
export const CLAIM_LIMITS = { maxDamage: 80, maxStun: 6, range: 700, perSecond: 150, maxEntries: 32 };

/**
 * @param {Array} entry  [enemyId, amount, sourceCode, attackSerial]
 * @param {object|undefined} enemy  房主這邊的敵人（找不到就是已經死了或不存在）
 * @param {{x:number,y:number}|null} claimer  申報者位置（px）
 * @returns {{ ok: true, source: string, amount: number } | { ok: false, reason: string }}
 */
export function validateClaimEntry(entry, enemy, claimer, limits = CLAIM_LIMITS) {
  if (!Array.isArray(entry) || entry.length < 3) return { ok: false, reason: 'shape' };
  const [, amount, code] = entry;
  const source = SOURCES[code];
  if (!source) return { ok: false, reason: 'source' };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'amount' };
  if (amount > (source === 'stun' ? limits.maxStun : limits.maxDamage)) return { ok: false, reason: 'amount' };
  if (!enemy || enemy.action === 'dead' || !(enemy.hp > 0)) return { ok: false, reason: 'gone' };
  if (enemy.intangible && source !== 'stun') return { ok: false, reason: 'intangible' };
  if (source === 'stun' && enemy.prop) return { ok: false, reason: 'prop' };
  if (claimer && Math.hypot(enemy.x - claimer.x, enemy.y - claimer.y) > limits.range) return { ok: false, reason: 'range' };
  return { ok: true, source, amount };
}

/** 每位隊友一個：一秒內最多接受 perSecond 筆命中 */
export class ClaimMeter {
  constructor(perSecond = CLAIM_LIMITS.perSecond) { this.perSecond = perSecond; this.windowStart = -Infinity; this.count = 0; }
  allow(now) {
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.count = 0; }
    if (this.count >= this.perSecond) return false;
    this.count++;
    return true;
  }
}

/**
 * 仇恨分配參數（px）。成本＝距離 ＋ loadPenalty × 已經追這位玩家的敵人權重 − 目前目標的黏著獎勵。
 * 敵將／守將權重 3：守將在追 A，小兵就比較會去找 B。
 */
export const TARGETING = { loadPenalty: 140, sticky: 160, retargetEvery: 0.5, heavyWeight: 3 };

const weightOf = enemy => (enemy.role === 'boss' || enemy.role === 'officer' ? TARGETING.heavyWeight : 1);

/**
 * @param {object[]} enemies  Arena 敵人（道具與死亡的會略過）
 * @param {{id:string,x:number,y:number,alive?:boolean}[]} players
 * @param {Map<number,string>} previous  上一輪的分配（黏著用）
 * @returns {Map<number,string>} enemyId → playerId
 */
export function assignTargets(enemies, players, previous = new Map(), options = TARGETING) {
  const out = new Map();
  const alive = players.filter(p => p.alive !== false);
  if (!alive.length) return out;
  const load = new Map(alive.map(p => [p.id, 0]));
  const nearest = e => Math.min(...alive.map(p => Math.hypot(p.x - e.x, p.y - e.y)));
  // 離玩家近的先挑（近身那隻最該追身邊的人），同距離照 id，結果可重現
  const list = enemies.filter(e => e.action !== 'dead' && !e.prop)
    .map(e => ({ e, d: nearest(e) }))
    .sort((a, b) => a.d - b.d || a.e.id - b.e.id);
  for (const { e } of list) {
    let best = null, bestCost = Infinity;
    for (const p of alive) {
      // penalty：倒地的玩家多算一段距離（第三階段），敵人優先追站著的人
      let cost = Math.hypot(p.x - e.x, p.y - e.y) + options.loadPenalty * load.get(p.id) + (p.penalty || 0);
      if (previous.get(e.id) === p.id) cost -= options.sticky;
      if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && best && p.id < best.id)) { best = p; bestCost = cost; }
    }
    out.set(e.id, best.id);
    load.set(best.id, load.get(best.id) + weightOf(e));
  }
  return out;
}
