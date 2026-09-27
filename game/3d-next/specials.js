// 特殊敵人（單人與連線都會出現；連線人多時出得更快、同時更多隻）：
// 弓箭手 archer、盾兵 shield、自爆兵 bomber、召喚師 summoner。
// march.js（生成與 AI）與 net/world.js（隊友重建傀儡、換房主接手）共用這裡的數值，確保兩邊一模一樣。
// 距離單位：公尺（m），用到時乘上 PX_PER_M。血量與傷害是單人基準，生成時再依人數加成。

export const SPECIAL_ROLES = ['archer', 'shield', 'bomber', 'summoner'];

/** 各段（市集／廣場／階梯／鬼門頂）會出哪幾種 */
export const SPECIAL_MIX = [
  ['archer', 'shield', 'bomber'],
  ['archer', 'shield', 'bomber', 'summoner'],
  ['archer', 'bomber', 'shield', 'summoner'],
  ['archer', 'summoner', 'bomber'],
];

export const SPECIAL_UNITS = {
  // 保持 6～9 m 距離；瞄準 1 秒（地上紅線），放箭瞬間紅線上的人中箭
  archer: { hp: 10, speed: 75, keep: [6, 9], aim: 1.0, length: 12, width: 0.9, damage: 10, cooldown: 2.6, flinch: 0.35 },
  // 交給 Arena 近戰 AI：正面輕攻擊只吃兩成，重擊破防或繞背
  shield: { hp: 26, speed: 60, range: 80, damage: 11, telegraphTime: 0.8, recover: 1.6, turnRate: 2.4, guardRearm: 2 },
  // 衝到 1.6 m 內點火，0.9 秒後炸開半徑 2.4 m；點火前被砍倒就不會炸
  bomber: { hp: 6, speed: 150, trigger: 1.6, fuse: 0.9, radius: 2.4, damage: 18 },
  // 躲在 8 m 外，每 7 秒念咒 1.2 秒叫出兩隻小兵
  summoner: { hp: 18, speed: 60, keep: 8, every: 7, cast: 1.2, count: 2, flinch: 0.35 },
};

/** 玩家見到每種特殊敵人時的第一句提示 */
export const SPECIAL_HINTS = {
  archer: '弓箭手！地上紅線亮起就往旁邊閃',
  shield: '盾兵！正面會擋，用重擊破防或繞到背後',
  bomber: '自爆兵！紅圈亮起快閃開，或先把它砍倒',
  summoner: '召喚師！躲在後面叫小兵，先衝過去解決它',
};

/** 生成欄位（不含位置）；march.js 生成與 world.js recipeFor 都用這個 */
export function specialOptions(role) {
  const s = SPECIAL_UNITS[role];
  if (role === 'shield') {
    return { kind: 'shield', special: true, hp: s.hp, speed: s.speed, range: s.range, damage: s.damage, telegraphTime: s.telegraphTime, recover: s.recover, guard: true, guardRearm: s.guardRearm, turnRate: s.turnRate, cooldown: 1 };
  }
  return { kind: role, special: true, hp: s.hp, damage: s.damage, ai: 'external', action: 'chase', mode: 'move', modeTime: 0, range: 0, cooldown: role === 'summoner' ? 3 : role === 'archer' ? 1.5 : 0.3 };
}

/** 點 (px, py) 是否在從 from 朝 facing 射出、長 length 寬 width 的直線範圍內（像素）；pad＝身體半徑 */
export function inLine(px, py, from, facing, length, width, pad = 20) {
  const dx = px - from.x, dy = py - from.y;
  const along = dx * Math.cos(facing) + dy * Math.sin(facing);
  const side = Math.abs(-dx * Math.sin(facing) + dy * Math.cos(facing));
  return along >= -pad && along <= length + pad && side <= width / 2 + pad;
}
