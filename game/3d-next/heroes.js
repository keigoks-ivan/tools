import { MUSOU_CHAIN, MUSOU_CHARGE, MUSOU_HEAVY, MUSOU_COUNTER, MUSOU_FLURRY } from '../2d/combat.js?v=20261001a';

const full = Math.PI * 2;
const flurry = changes => ({
  standard: { ...MUSOU_FLURRY.standard, ...changes },
  true: { ...MUSOU_FLURRY.true, ...changes, damageScale: 1.5 },
});

// Profiles are opt-in: the 2.5D and co-op entries retain the original Arena defaults.
export const HEROES = {
  violet: {
    id: 'violet', name: '紫刃', mark: '紫', weapon: '靈力長刀', color: '#b994ff', tint: 0xc4a3ff,
    style: '均衡連斬', description: '五段連斬，重擊接昇龍、疾風突與地裂斬。', special: '天刃亂舞',
    maxHp: 100, speed: 1, chain: MUSOU_CHAIN, charges: MUSOU_CHARGE, heavy: MUSOU_HEAVY, counter: MUSOU_COUNTER,
    flurry: MUSOU_FLURRY,
  },
  azure: {
    id: 'azure', name: '蒼鋒', mark: '蒼', weapon: '破魔大劍', color: '#82cfff', tint: 0x82cfff,
    style: '重斬破防', description: '三段重斬，攻速較慢、範圍較大；重擊震退敵群。', special: '崩山鎮魂',
    maxHp: 125, speed: 0.86,
    chain: [
      { clip: 'combo1', duration: 0.7, hits: [0.28], cancel: 0.43, radius: 195, arc: Math.PI, damage: 9, dash: 80 },
      { clip: 'combo2', duration: 0.76, hits: [0.3], cancel: 0.49, radius: 210, arc: Math.PI * 1.3, damage: 10, dash: 80 },
      { clip: 'heavyfin', duration: 1.12, hits: [0.68], cancel: Infinity, radius: 260, arc: full, damage: 16, finisher: 16, dash: 55 },
    ],
    charges: [
      { name: '破陣斬', clip: 'heavy', duration: 0.86, hits: [0.43], cancel: Infinity, radius: 230, arc: Math.PI, damage: 15, finisher: 15, dash: 190 },
      { name: '崩山震', clip: 'heavyfin', duration: 1.08, hits: [0.63], cancel: Infinity, radius: 290, arc: full, damage: 20, finisher: 20, dash: 40 },
    ],
    heavy: { name: '裂地重斬', clip: 'heavyfin', duration: 1.15, hits: [0.67], cancel: Infinity, radius: 265, arc: full, damage: 18, finisher: 18, dash: 60 },
    counter: { ...MUSOU_COUNTER, name: '鐵壁回斬', duration: 0.68, hits: [0.24], cancel: 0.4, radius: 220, damage: 11, dash: 80 },
    flurry: flurry({ swings: 5, radius: 285, damage: 9, steer: 45, finishRadius: 390, finishDamage: 28, sweeps: [2, 4, 5] }),
  },
  amber: {
    id: 'amber', name: '金燕', mark: '燕', weapon: '疾風雙刃', color: '#ffd37a', tint: 0xffd37a,
    style: '疾速突進', description: '六段快斬，單擊較輕、移動較快；重擊穿過敵陣。', special: '燕返千刃',
    maxHp: 85, speed: 1.18,
    chain: Array.from({ length: 6 }, (_, i) => ({
      clip: ['combo1', 'combo2', 'slash3', 'slash4', 'combo2', 'combo4'][i],
      duration: i === 5 ? 0.56 : 0.32, hits: i === 5 ? [0.12, 0.34] : [0.12], cancel: i === 5 ? Infinity : 0.21,
      radius: i === 5 ? 170 : 140, arc: i === 5 ? full : Math.PI * 0.7, damage: 4, ...(i === 5 ? { finisher: 7 } : {}), dash: 270,
    })),
    charges: Array.from({ length: 5 }, (_, i) => ({
      name: i % 2 ? '穿風突' : '燕返斬', clip: i % 2 ? 'slash4' : 'combo4', duration: 0.5,
      hits: [0.1, 0.23, 0.37], cancel: Infinity, radius: i % 2 ? 125 : 170,
      arc: i % 2 ? Math.PI * 0.6 : full, damage: 3, finisher: 7, dash: i % 2 ? 850 : 120,
    })),
    heavy: { name: '穿風雙突', clip: 'slash4', duration: 0.52, hits: [0.13, 0.33], cancel: Infinity, radius: 140, arc: Math.PI * 0.65, damage: 6, finisher: 8, dash: 660 },
    counter: { ...MUSOU_COUNTER, name: '閃身燕返', duration: 0.34, hits: [0.1], cancel: 0.22, radius: 155, damage: 6, dash: 300 },
    flurry: flurry({ swings: 16, radius: 180, damage: 3, steer: 180, finishRadius: 290, finishDamage: 17, sweeps: [4, 8, 12, 16] }),
  },
};

export const heroFor = id => HEROES[id] || HEROES.violet;
