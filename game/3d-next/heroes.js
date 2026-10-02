import { MUSOU_CHAIN, MUSOU_CHARGE, MUSOU_HEAVY, MUSOU_COUNTER, MUSOU_FLURRY } from '../2d/combat.js?v=20261002j';

const full = Math.PI * 2;
const flurry = changes => ({
  standard: { ...MUSOU_FLURRY.standard, ...changes },
  true: { ...MUSOU_FLURRY.true, ...changes, damageScale: 1.5 },
});

// Profiles are opt-in: legacy entries retain the original Arena defaults.
export const HEROES = {
  violet: {
    id: 'violet', name: '紫刃', mark: '紫', weapon: '靈力長刀', color: '#b994ff', tint: 0xc4a3ff,
    style: '均衡連斬', description: '五段連斬，重擊接昇龍、疾風突與地裂斬。', special: '月影一閃',
    maxHp: 100, speed: 1, chain: MUSOU_CHAIN, charges: MUSOU_CHARGE, heavy: MUSOU_HEAVY, counter: MUSOU_COUNTER,
    flurry: flurry({ duration: 3.15, swingStart: 0.55, swingEnd: 1.65, swings: 3, radius: 220, damage: 7, steer: 30,
      impact: 2.65, finishRadius: 360, finishDamage: 34, leapAt: null, sweeps: [],
      timeScale: [[0, 1], [2.48, 1], [2.48, 0.25], [2.78, 0.25], [3.15, 1]], freezes: [{ at: 0, real: 0.08 }, { at: 2.65, real: 0.09 }] }),
  },
  azure: {
    id: 'azure', name: '蒼鋒', mark: '蒼', weapon: '蒼龍大劍', color: '#82cfff', tint: 0x82cfff,
    style: '大劍橫掃', description: '橫掃、挑斬、重劈三連段，雙手大劍壓制敵群。', special: '蒼龍裂陣',
    // Ultimate presentation in combat-fx: title, colour grade and whether the giant spirit blade appears.
    musouTheme: { title: '蒼龍裂陣', trueTitle: '真・蒼龍裂陣', sub: 'AZURE DRAGON SUNDER', trueSub: 'TRUE AZURE DRAGON SUNDER',
      tint: [0.55, 1.45, 2.4], trueTint: [0.4, 1.7, 2.7], crack: [1.2, 2.2, 3.0], wisp: [0.7, 1.6, 2.4], spiritBlade: true,
      css: { band: 'linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(210,245,255,.3) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(4,4,8,0),rgba(8,40,86,.62) 14%,rgba(40,150,230,.62) 52%,rgba(8,40,86,.62) 88%,rgba(4,4,8,0))', 'true-band': 'linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(230,255,255,.38) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(4,4,8,0),rgba(4,60,96,.62) 14%,rgba(60,210,255,.66) 52%,rgba(4,60,96,.62) 88%,rgba(4,4,8,0))', glow: 'rgba(96,200,255,.95)', 'true-glow': 'rgba(150,240,255,.98)', sub: '#cfefff' } },
    maxHp: 125, speed: 0.86,
    chain: [
      { clip: 'azureSweep', duration: 0.7, hits: [0.28], cancel: 0.43, radius: 235, arc: Math.PI * 1.3, damage: 12, dash: 80 },
      { clip: 'azureRise', duration: 0.76, hits: [0.3], cancel: 0.49, radius: 250, arc: Math.PI * 1.3, damage: 14, dash: 80 },
      { clip: 'azureSlam', duration: 1.12, hits: [0.68], cancel: Infinity, radius: 290, arc: full, damage: 22, finisher: 22, dash: 55 },
    ],
    charges: [
      { name: '破陣斬', clip: 'azureRise', duration: 0.86, hits: [0.43], cancel: Infinity, radius: 230, arc: Math.PI, damage: 15, finisher: 15, dash: 190 },
      { name: '崩山震', clip: 'azureSlam', duration: 1.08, hits: [0.63], cancel: Infinity, radius: 290, arc: full, damage: 20, finisher: 20, dash: 40 },
    ],
    heavy: { name: '裂地重斬', clip: 'azureSlam', duration: 1.15, hits: [0.67], cancel: Infinity, radius: 265, arc: full, damage: 18, finisher: 18, dash: 60 },
    counter: { ...MUSOU_COUNTER, name: '鐵壁回斬', clip: 'azureGuard', duration: 0.68, hits: [0.24], cancel: 0.4, radius: 220, damage: 11, dash: 80 },
    flurry: flurry({ duration: 3.6, swingStart: 0.9, swingEnd: 2.4, swings: 3, radius: 420, damage: 10, steer: 0,
      swingRadii: [230, 320, 420], swingDamage: [9, 12, 15], impact: 3.05, finishRadius: 450, finishDamage: 27, leapAt: null, sweeps: [],
      timeScale: [[0, 1], [2.92, 1], [2.92, 0.35], [3.22, 0.35], [3.6, 1]], freezes: [{ at: 0, real: 0.08 }, { at: 3.05, real: 0.09 }] }),
  },
  amber: {
    id: 'amber', name: '金燕', mark: '燕', weapon: '疾風雙刃', color: '#ffd37a', tint: 0xffd37a,
    style: '疾速突進', description: '六段快斬，單擊較輕、移動較快；重擊穿過敵陣。', special: '金燕八閃',
    // Ultimate presentation in combat-fx: title, colour grade and whether the giant spirit blade appears.
    musouTheme: { title: '金燕八閃', trueTitle: '真・金燕八閃', sub: 'GOLDEN SWALLOW EIGHT FLASHES', trueSub: 'TRUE GOLDEN SWALLOW EIGHT FLASHES',
      tint: [2.3, 1.5, 0.5], trueTint: [2.6, 1.15, 0.35], crack: [3.0, 2.0, 0.9], wisp: [2.2, 1.6, 0.6], spiritBlade: false,
      css: { band: 'linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(255,240,200,.3) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(4,4,8,0),rgba(92,46,6,.62) 14%,rgba(230,150,40,.62) 52%,rgba(92,46,6,.62) 88%,rgba(4,4,8,0))', 'true-band': 'linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(255,225,190,.38) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(4,4,8,0),rgba(110,30,4,.62) 14%,rgba(255,110,30,.66) 52%,rgba(110,30,4,.62) 88%,rgba(4,4,8,0))', glow: 'rgba(255,190,70,.95)', 'true-glow': 'rgba(255,130,40,.98)', sub: '#ffefc8' } },
    maxHp: 85, speed: 1.18,
    chain: Array.from({ length: 6 }, (_, i) => ({
      clip: `amberCut${i + 1}`,
      duration: i === 5 ? 0.56 : 0.32, hits: i === 5 ? [0.12, 0.34] : [0.12], cancel: i === 5 ? Infinity : 0.21,
      radius: i === 5 ? 170 : 140, arc: i === 5 ? full : Math.PI * 0.7, damage: 4, ...(i === 5 ? { finisher: 7 } : {}), dash: 270,
    })),
    charges: Array.from({ length: 5 }, (_, i) => ({
      name: i % 2 ? '穿風突' : '燕返斬', clip: i % 2 ? 'amberStab' : 'amberFlip', duration: 0.5,
      hits: [0.1, 0.23, 0.37], cancel: Infinity, radius: i % 2 ? 125 : 170,
      arc: i % 2 ? Math.PI * 0.6 : full, damage: 3, finisher: 7, dash: i % 2 ? 850 : 120,
    })),
    heavy: { name: '穿風雙突', clip: 'amberHeavy', duration: 0.52, hits: [0.13, 0.33], cancel: Infinity, radius: 140, arc: Math.PI * 0.65, damage: 6, finisher: 8, dash: 660 },
    counter: { ...MUSOU_COUNTER, name: '閃身燕返', clip: 'amberCounter', duration: 0.34, hits: [0.1], cancel: 0.22, radius: 155, damage: 6, dash: 300 },
    flurry: flurry({ duration: 2.8, swingStart: 0.38, swingEnd: 2.05, swings: 8, radius: 180, damage: 5, steer: 0,
      dashDistance: 65, impact: 2.35, finishRadius: 330, finishDamage: 22, leapAt: null, sweeps: [],
      timeScale: [[0, 1], [2.25, 1], [2.25, 0.3], [2.48, 0.3], [2.8, 1]], freezes: [{ at: 0, real: 0.06 }, { at: 2.35, real: 0.07 }] }),
  },
  jade: {
    id: 'jade', name: '翠翎', mark: '翎', weapon: '翡翠長弓', color: '#91e5b6', tint: 0x91e5b6,
    style: '四段羽箭連技', description: '快射、雙連射、扇形三箭接三連貫矢；重擊可接破甲、散射與羽箭終結。', special: '翠羽天雨',
    // Ultimate presentation in combat-fx: title, colour grade and whether the giant spirit blade appears.
    musouTheme: { title: '翠羽天雨', trueTitle: '真・翠羽天雨', sub: 'JADE FEATHER SKYFALL', trueSub: 'TRUE JADE FEATHER SKYFALL',
      tint: [0.6, 2.2, 1.2], trueTint: [0.45, 2.5, 1.5], crack: [1.4, 2.8, 1.8], wisp: [0.8, 2.2, 1.3], spiritBlade: false,
      css: { band: 'linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(220,255,230,.3) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(4,4,8,0),rgba(6,70,40,.62) 14%,rgba(60,200,120,.62) 52%,rgba(6,70,40,.62) 88%,rgba(4,4,8,0))', 'true-band': 'linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(235,255,240,.38) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(4,4,8,0),rgba(4,86,60,.62) 14%,rgba(90,240,170,.66) 52%,rgba(4,86,60,.62) 88%,rgba(4,4,8,0))', glow: 'rgba(120,240,170,.95)', 'true-glow': 'rgba(170,255,210,.98)', sub: '#dcffe8' } },
    maxHp: 90, speed: 1.16, aimRange: 560, aimArc: Math.PI + .01,
    air: { clip: 'jadeAir', duration: .5, hit: .22, hits: [.22], radius: 480, damage: 8, projectile: { speed: 1100, width: 10 } },
    chain: [
      { name: '點羽快射', clip: 'jadeShot', duration: .50, hits: [.24], cancel: .42, moveCancel: .42, fxTier: 1, radius: 520, damage: 12, dash: 0, projectile: { speed: 1500, width: 12, pierce: 2 } },
      { name: '穿花雙矢', clip: 'jadeDouble', duration: .84, hits: [.24,.59], cancel: .70, moveCancel: .70, fxTier: 2, radius: 520, damage: 8, dash: 0, projectile: { speed: 1500, width: 12 } },
      { name: '展翎三箭', clip: 'jadeFan', duration: .72, hits: [.36], cancel: .60, moveCancel: .60, fxTier: 3, radius: 480, damage: 12, finisher: 14, dash: 0, projectile: { speed: 1400, width: 12, arrows: 3, spread: .22, pierce: 2 } },
      { name: '翠羽貫心', clip: 'jadeBurst', duration: 1.08, hits: [.24,.57,.90], cancel: Infinity, moveCancel: 1.01, fxTier: 4, radius: 560, damage: 8, finisher: 14, dash: 0, projectile: { speed: 1800, width: 12, pierce: 3 } },
    ],
    charges: [
      { name: '破甲貫矢', clip: 'jadePierce', duration: 1.1, hits: [.64], cancel: Infinity, moveCancel: .75, fxTier: 4, radius: 560, damage: 24, finisher: 24, dash: 0, projectile: { speed: 1800, width: 14, pierce: 3 } },
      { name: '翠羽散射', clip: 'jadeSpread', duration: .72, hits: [.36], cancel: Infinity, moveCancel: .47, fxTier: 3, radius: 480, damage: 12, finisher: 12, dash: 0, projectile: { speed: 1100, width: 12, arrows: 5, spread: .15 } },
      { name: '翠羽貫心', clip: 'jadeBurst', duration: 1.08, hits: [.24,.57,.90], cancel: Infinity, moveCancel: 1.01, fxTier: 4, radius: 560, damage: 8, finisher: 14, dash: 0, projectile: { speed: 1800, width: 12, pierce: 3 } },
    ],
    heavy: { name: '破甲貫矢', clip: 'jadePierce', duration: 1.1, hits: [.64], cancel: Infinity, moveCancel: .75, fxTier: 4, radius: 560, damage: 24, finisher: 24, dash: 0, projectile: { speed: 1800, width: 14, pierce: 3 } },
    counter: { ...MUSOU_COUNTER, name: '退步返矢', clip: 'jadeGuard', duration: .48, hits: [.22], cancel: .33, moveCancel: .33, radius: 500, damage: 11, dash: -110, projectile: { speed: 1200, width: 12 } },
    flurry: flurry({ duration: 3.6, swingStart: .95, swingEnd: 2.2, swings: 6, radius: 420, damage: 5, steer: 0,
      impact: 2.9, finishRadius: 460, finishDamage: 24, leapAt: null, sweeps: [],
      timeScale: [[0,1],[2.8,1],[2.8,.4],[3.05,.4],[3.6,1]], freezes: [{ at:0, real:.07 },{ at:2.9, real:.08 }] }),
  },
};

export const heroFor = id => HEROES[id] || HEROES.violet;
