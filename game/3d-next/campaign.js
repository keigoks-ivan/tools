import { TUNING } from './march.js?v=20261001a';

// Each chapter reuses the authored street, with its own light, enemy mix and pacing.
export const CHAPTERS = [
  { id: 'night', name: '夜市突圍', intro: '擊破妖燈，守住魂燈，封住第一道鬼門。', boss: '鬼門守將',
    background: 0x111327, fog: 0x16182e, moon: 0xdac7ff, rim: 0x7049dd, tint: 0xffffff, tuning: {} },
  { id: 'ember', name: '赤月圍城', intro: '赤月下的盾兵與弓手封鎖街道，先破防再突圍。', boss: '赤月鎮將',
    background: 0x28121a, fog: 0x351a23, moon: 0xffbc91, rim: 0xe75c46, tint: 0xffd2b1,
    tuning: {
      market: { goal: 100, runnerShare: 0.15, groupEvery: 5.5 },
      plaza: { lanternHp: 360, groupEvery: 5 }, stairs: { holdSeconds: 90, lampHp: 50 },
      specials: { first: 8, every: 10, maxAlive: 3, mix: [['shield', 'archer'], ['shield', 'archer'], ['archer', 'bomber'], ['shield', 'archer']] },
      officers: { market: { name: '赤甲', hp: 100 }, red: { name: '焰角', hp: 105 }, shadow: { name: '燎影', hp: 90 } },
      boss: { name: '赤月鎮將', hp: 390, sweepShare: 0.8, sweepRadius: 4.2, summon: 6 },
    } },
  { id: 'rift', name: '虛空封魂', intro: '召喚師與疾行妖兵湧出裂隙，擊倒裂隙之主完成封印。', boss: '裂隙之主',
    background: 0x0a2029, fog: 0x102b35, moon: 0x9af5ee, rim: 0x417cde, tint: 0xb3e5ef,
    tuning: {
      market: { goal: 110, runnerShare: 0.5, groupEvery: 5 },
      plaza: { lanternHp: 400, runnerShare: 0.5 }, stairs: { holdSeconds: 100, lampHp: 55, runnerShare: 0.5 },
      specials: { first: 8, every: 9, maxAlive: 3, mix: [['summoner', 'bomber'], ['summoner', 'archer'], ['bomber', 'shield'], ['summoner', 'bomber']] },
      officers: { market: { name: '空牙', hp: 110 }, red: { name: '幽角', hp: 110 }, shadow: { name: '裂影', hp: 105, lunges: 4 } },
      boss: { name: '裂隙之主', hp: 450, sweepShare: 0.35, summon: 10, resummon: { every: 14, count: 5 } },
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
  return merge(structuredClone(TUNING), CHAPTERS[index]?.tuning || {});
}

export class Campaign {
  constructor(index = 0) { this.index = Math.max(0, Math.min(CHAPTERS.length - 1, Math.floor(Number(index)) || 0)); this.results = []; }
  get chapter() { return CHAPTERS[this.index]; }
  get hasNext() { return this.index < CHAPTERS.length - 1; }
  complete(result) { this.results[this.index] = { ...result }; }
  next() { if (!this.hasNext) return false; this.index++; return true; }
  restart() { this.index = 0; this.results = []; }
}
