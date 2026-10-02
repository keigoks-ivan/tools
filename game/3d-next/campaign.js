import { TUNING } from './march.js?v=20261003a';

// Chapters share collision and objective rules; the final two have separate sets.
export const CHAPTERS = [
  { id: 'night', name: '夜市突圍', intro: '擊破妖燈，守住魂燈，封住第一道鬼門。', boss: '鬼門守將',
    background: 0x111327, fog: 0x16182e, moon: 0xdac7ff, rim: 0x7049dd, tint: 0xffffff, tuning: {} },
  { id: 'ember', name: '赤月圍城', intro: '赤月下的盾兵與弓手封鎖街道，先破防再突圍。', boss: '赤月鎮將',
    background: 0x28121a, fog: 0x351a23, moon: 0xffbc91, rim: 0xe75c46, tint: 0xffd2b1, environment: 'ember', segments: ['城外市街', '甕城廣場', '城門坡道', '城樓之上'],
    tuning: {
      // 第 1 段：不用殺滿數量，頂著箭雨衝到街底。第 2 段：站進光圈點燃三座烽火台。第 4 段：魔王戰同時有箭雨。
      market: { goal: 60, runnerShare: 0.15, groupEvery: 5, advance: true },
      plaza: { lanternHp: 360, groupEvery: 5.5, groupSize: 3, beacons: { radius: 2.4, fillSeconds: 10, drain: 0.05 } },
      volleys: { first: 2.5, every: { 0: 3.0, 3: 6.5 }, count: { 0: 2, 3: 1 }, radius: 2.3, telegraph: 1.1, damage: 10 },
      // 第 3 段：打爛城門（城門算道具，多人時血量不加乘），弓手從兩側射。
      stairs: { mode: 'siege', gateName: '赤月城門', gateHp: 640, holdSeconds: 90, lampHp: 50 },
      specials: { first: 8, every: 10, maxAlive: 3, mix: [['shield', 'archer'], ['shield', 'archer'], ['archer', 'archer', 'shield'], ['shield', 'archer']] },
      officers: { market: { name: '赤甲', hp: 100 }, red: { name: '焰角', hp: 105 }, shadow: { name: '燎影', hp: 90 } },
      boss: { name: '赤月鎮將', hp: 390, sweepShare: 0.8, sweepRadius: 4.2, summon: 6 },
    } },
  { id: 'rift', name: '虛空封魂', intro: '召喚師與疾行妖兵湧出裂隙，擊倒裂隙之主完成封印。', boss: '裂隙之主',
    background: 0x0a2029, fog: 0x102b35, moon: 0x9af5ee, rim: 0x417cde, tint: 0xb3e5ef, environment: 'rift', segments: ['裂隙邊緣', '虛空中庭', '浮石階梯', '封印祭壇'],
    tuning: {
      market: { goal: 110, runnerShare: 0.5, groupEvery: 5 },
      // 第 2 段：五道裂隙同時打開，人多可以分頭封。
      plaza: { lanternHp: 230, runnerShare: 0.5, groupSize: 3, groupEvery: 7, style: 'rift', verb: '封住裂隙', intro: '五道裂隙同時打開，全部封住才能前進',
        spots: [{ x: -9.2, z: -37 }, { x: 9.2, z: -37 }, { x: -7.4, z: -47.6 }, { x: 7.4, z: -47.6 }, { x: 0, z: -50.6 }] }, stairs: { holdSeconds: 100, lampHp: 55, runnerShare: 0.5 },
      specials: { first: 8, every: 9, maxAlive: 3, mix: [['summoner', 'bomber'], ['summoner', 'archer'], ['bomber', 'shield'], ['summoner', 'bomber']] },
      officers: { market: { name: '空牙', hp: 110 }, red: { name: '幽角', hp: 110 }, shadow: { name: '裂影', hp: 105, lunges: 4 } },
      boss: { name: '裂隙之主', hp: 450, sweepShare: 0.35, summon: 10, resummon: { every: 14, count: 5 } },
    } },
  { id: 'frost', name: '霜橋追魂', intro: '跨越雪覆魂橋，擊破冰燈，守住橋頭的封魂火。', boss: '霜橋鎮魂使',
    background: 0x0c1f32, fog: 0x29435b, moon: 0xc8eeff, rim: 0x62c5e8, tint: 0xd0e6ff, environment: 'frost', segments: ['霜橋入口', '冰燈廣場', '橋頭封魂', '鎮魂祭臺'],
    tuning: {
      // 第 1 段：鎮魂使先現身就逃，追上去打掉他三分之一的血就再逃一次，前後兩次。
      market: { goal: 60, runnerShare: 0.4, groupEvery: 6, chase: { name: '霜橋鎮魂使', hp: 170, speed: 205, reach: 2.4, windup: 0.5, damage: 13, cooldown: 1.8 } },
      plaza: { lanternHp: 380, runnerShare: 0.4 }, stairs: { holdSeconds: 90, lampHp: 60, runnerShare: 0.35 },
      specials: { first: 10, every: 10, maxAlive: 3, mix: [['shield', 'archer'], ['archer', 'bomber'], ['shield', 'summoner'], ['shield', 'archer']] },
      officers: { market: { name: '雪牙', hp: 110 }, red: { name: '霜甲', hp: 120 }, shadow: { name: '寒影', hp: 110, lunges: 4 } },
      boss: { name: '霜橋鎮魂使', hp: 480, sweepShare: 0.7, sweepRadius: 4.4, summon: 8, resummon: { every: 18, count: 4 } },
    } },
  { id: 'citadel', name: '天闕決戰', intro: '穿過天闕長廊，毀去祭燈，擊敗天闕魔君封閉魂門。', boss: '天闕魔君',
    background: 0x32141c, fog: 0x48202b, moon: 0xffdbb2, rim: 0xff8756, tint: 0xffe0bd, environment: 'citadel', segments: ['天闕長廊', '祭燈中庭', '封魂階道', '魔君大殿'],
    tuning: {
      market: { goal: 115, runnerShare: 0.35, groupEvery: 5 },
      // 第 2 段：妖燈破完，三名敵將同時出場，人多可以各打一名。
      plaza: { lanternHp: 410, groupEvery: 5.5, officers: ['red', 'market', 'shadow'] }, stairs: { holdSeconds: 95, lampHp: 65, runnerShare: 0.4 },
      specials: { first: 8, every: 9, maxAlive: 3, mix: [['shield', 'summoner'], ['bomber', 'archer'], ['shield', 'bomber'], ['summoner', 'archer']] },
      officers: { market: { name: '天衛', hp: 120 }, red: { name: '焰甲', hp: 130 }, shadow: { name: '闕影', hp: 115, lunges: 4 } },
      boss: { name: '天闕魔君', hp: 540, sweepShare: 0.5, sweepRadius: 4.5, summon: 9, resummon: { every: 17, count: 4 } },
    } },
];

function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
  }
  return result;
}

export function chapterTuning(index) {
  const tuning = merge(structuredClone(TUNING), CHAPTERS[index]?.tuning || {});
  if (CHAPTERS[index]?.segments) tuning.segmentNames = [...CHAPTERS[index].segments];
  return tuning;
}

export class Campaign {
  constructor(index = 0) { this.index = Math.max(0, Math.min(CHAPTERS.length - 1, Math.floor(Number(index)) || 0)); this.results = []; }
  get chapter() { return CHAPTERS[this.index]; }
  get hasNext() { return this.index < CHAPTERS.length - 1; }
  complete(result) { this.results[this.index] = { ...result }; }
  next() { if (!this.hasNext) return false; this.index++; return true; }
  restart() { this.index = 0; this.results = []; }
}
