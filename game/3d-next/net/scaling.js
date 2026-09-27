/**
 * 連線人數加成：所有倍率集中在這裡（game/tests/coop-sync.test.mjs 驗證）。
 *
 * - count：整段關卡「總共」出多少敵人（市集擊倒目標、各段出兵間隔、守將召喚數），不是同時在場的數量；
 *   同時在場仍受 march.js ENEMY_CAP（桌機 16／手機 10）限制，人多只是打得更久、更密。
 * - hp：每隻敵人（含敵將與守將）生成當下的血量倍率；道具（木箱、妖燈）不加。
 * 單人（或連線但只剩自己）＝ ×1，完全等於單人版數值。
 */
export const COOP_SCALE = {
  1: { count: 1.0, hp: 1.0 },
  2: { count: 1.3, hp: 1.4 },
  3: { count: 1.6, hp: 1.8 },
};

export function scaleFor(players) {
  const n = Math.max(1, Math.min(3, Math.floor(players) || 1));
  return COOP_SCALE[n];
}

/** 生成時的血量：無條件進位，最少 1 */
export function scaledHp(hp, players) {
  return Math.max(1, Math.ceil(hp * scaleFor(players).hp));
}

/**
 * march.js TUNING 裡跟「出兵總量」有關的欄位 → 加成後的值（純函式，不改傳入物件）。
 * 次數類乘上 count，間隔類除以 count。
 */
export function scaledCounts(base, players) {
  const c = scaleFor(players).count;
  return {
    market: { goal: Math.round(base.market.goal * c), groupEvery: base.market.groupEvery / c },
    plaza: { groupEvery: base.plaza.groupEvery / c },
    stairs: { waveEvery: base.stairs.waveEvery / c, topGroupEvery: base.stairs.topGroupEvery / c },
    boss: { summon: Math.round(base.boss.summon * c), resummon: { every: base.boss.resummon.every, count: Math.round(base.boss.resummon.count * c) } },
  };
}

/**
 * 補給加成（兩人以上才生效；只剩自己時還原成單人數值）：
 * - 木箱／酒甕／木桶打破必掉東西，而且偏向補血
 * - 小兵被擊倒有機率掉護符（+15 血）
 * - 補給放久一點才消失（隊友有時間走過來撿）
 * - 過段落與擊破敵將的回血加多
 */
export const COOP_SUPPLY = {
  tables: { crate: [['bun', 0.65], ['bigBun', 0.25], ['wine', 0.1]], jar: [['bun', 0.45], ['wine', 0.35], ['bigBun', 0.2]], barrel: [['bigBun', 0.6], ['bun', 0.4]] },
  killDropChance: { 2: 0.06, 3: 0.08 },
  pickupLife: 25,
  segmentHeal: 25,
  officerHeal: 35,
};

/** 記下 TUNING 原始值（只記一次），之後每次人數變動都從原始值重算，不會越乘越大 */
export function snapshotCounts(tuning) {
  return scaledCounts(tuning, 1);
}

/** 記下補給相關的 TUNING 原始值（只記一次），人數回到 1 時照原樣還原 */
export function snapshotSupply(tuning) {
  return {
    tables: structuredClone(tuning.breakables.tables),
    killDrop: tuning.killDrop ?? null,
    pickupLife: tuning.pickupLife,
    segmentHeal: tuning.segmentHeal,
    officerHeal: tuning.officerHeal,
  };
}

/** 把補給加成寫進 TUNING（兩人以上）；一人時還原 snapshotSupply 的值 */
export function applySupplyScale(tuning, base, players) {
  const n = Math.max(1, Math.min(3, Math.floor(players) || 1));
  if (n === 1) {
    tuning.breakables.tables = structuredClone(base.tables);
    tuning.killDrop = base.killDrop;
    tuning.pickupLife = base.pickupLife;
    tuning.segmentHeal = base.segmentHeal;
    tuning.officerHeal = base.officerHeal;
    return;
  }
  tuning.breakables.tables = structuredClone(COOP_SUPPLY.tables);
  tuning.killDrop = { kind: 'bun', chance: COOP_SUPPLY.killDropChance[n] };
  tuning.pickupLife = COOP_SUPPLY.pickupLife;
  tuning.segmentHeal = COOP_SUPPLY.segmentHeal;
  tuning.officerHeal = COOP_SUPPLY.officerHeal;
}

/**
 * 把加成寫進 march.js 的 TUNING（三人版頁面只有一個 MarchDirector；單人頁從不呼叫）。
 * @param {object} tuning  march.js 匯出的 TUNING
 * @param {object} baseline snapshotCounts(tuning) 的結果
 */
export function applyCountScale(tuning, baseline, players) {
  const s = scaledCounts(baseline, players);
  tuning.market.goal = s.market.goal;
  tuning.market.groupEvery = s.market.groupEvery;
  tuning.plaza.groupEvery = s.plaza.groupEvery;
  tuning.stairs.waveEvery = s.stairs.waveEvery;
  tuning.stairs.topGroupEvery = s.stairs.topGroupEvery;
  tuning.boss.summon = s.boss.summon;
  tuning.boss.resummon.count = s.boss.resummon.count;
  return s;
}
