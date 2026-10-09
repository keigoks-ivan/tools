import { UNIT_BALANCE, UPGRADE_BALANCE, TECH_BALANCE } from './balance.mjs?v=20261009h';
export const CIVILIZATION = { name: '河谷王國', description: '西歐中世紀文明 · 四時代陸戰體系', ages: ['黑暗時代', '封建時代', '城堡時代', '帝王時代', '後帝王時代'] };
const unit = (id, name, role, look, hp, attack, armor, range, speed, food, gold, building, age, extra = {}) => ({ id, name, role, look, hp, attack, armor, range, speed, cooldown: 1.5, food, gold, time: 12, color: '#669db6', image: '', building, age, ...extra });
export const CIV_UNITS = [
  unit('villager', '村民', 'worker', 'worker', 40, 3, 0, 1.1, 2.1, 50, 0, 'town', 0, { hotkey: 'c', time: 10 }),
  unit('swordsman', '民兵', 'melee', 'soldier', 45, 4, 0, 1.1, 2.2, 60, 20, 'barracks', 0, { family: 'infantry', hotkey: 's', upgrades: [{ tech: 'man-at-arms', name: '裝甲步兵', hp: 55, attack: 6, armor: 1 }, { tech: 'longsword', name: '長劍兵', hp: 70, attack: 9, armor: 1 }, { tech: 'twohand', name: '雙手劍兵', hp: 85, attack: 12, armor: 1 }, { tech: 'champion', name: '冠軍劍士', hp: 100, attack: 15, armor: 2 }] }),
  unit('spearman', '長槍兵', 'melee', 'soldier', 45, 3, 0, 1.5, 2.3, 35, 0, 'barracks', 1, { family: 'infantry', hotkey: 'e', bonus: 'cavalry', upgrades: [{ tech: 'pikeman', name: '重裝長槍兵', hp: 60, attack: 5, armor: 1 }, { tech: 'halberdier', name: '戟兵', hp: 70, attack: 6, armor: 2 }] }),
  unit('archer', '弓箭手', 'ranged', 'archer', 35, 4, 0, 4, 2.2, 0, 45, 'archery', 1, { family: 'archer', wood: 25, hotkey: 'a', upgrades: [{ tech: 'crossbow', name: '弩兵', hp: 45, attack: 5, range: 5 }, { tech: 'arbalest', name: '強弩兵', hp: 50, attack: 6, range: 5 }] }),
  unit('skirmisher', '矛兵', 'ranged', 'archer', 30, 2, 2, 4, 2.3, 25, 0, 'archery', 1, { family: 'archer', wood: 35, hotkey: 'e', bonus: 'archer', upgrades: [{ tech: 'elite-skirm', name: '精銳矛兵', hp: 40, attack: 3, armor: 4, range: 5 }] }),
  unit('scout', '斥候騎兵', 'melee', 'knight', 45, 3, 0, 1.2, 3.8, 80, 0, 'stable', 0, { family: 'cavalry', hotkey: 'e', upgrades: [{ tech: 'light-cavalry', name: '輕騎兵', hp: 60, attack: 7, armor: 1 }, { tech: 'hussar', name: '匈牙利輕騎兵', hp: 75, attack: 7, armor: 2 }] }),
  unit('knight', '騎士', 'melee', 'knight', 100, 10, 2, 1.3, 3.4, 60, 75, 'stable', 2, { family: 'cavalry', hotkey: 'n', upgrades: [{ tech: 'cavalier', name: '重裝騎士', hp: 120, attack: 12, armor: 3 }, { tech: 'paladin', name: '遊俠', hp: 160, attack: 14, armor: 4 }] }),
  unit('monk', '僧侶', 'healer', 'mage', 30, 10, 0, 9, 1.8, 0, 100, 'monastery', 2, { hotkey: 't', canConvert: true }),
  unit('ram', '衝撞車', 'melee', 'siege', 175, 6, 8, 1.5, 1.1, 0, 75, 'siege', 2, { family: 'siege', wood: 160, bonus: 'building', hotkey: 'r', upgrades: [{ tech: 'capped-ram', name: '重型衝撞車', hp: 200, attack: 8 }, { tech: 'siege-ram', name: '攻城衝撞車', hp: 270, attack: 12 }] }),
  unit('mangonel', '投石車', 'ranged', 'siege', 50, 30, 0, 7, 1.2, 0, 135, 'siege', 2, { family: 'siege', wood: 160, splash: 1.4, cooldown: 4, hotkey: 'a', upgrades: [{ tech: 'onager', name: '中型投石車', hp: 60, attack: 50, range: 8 }, { tech: 'siege-onager', name: '重型投石車', hp: 70, attack: 75, range: 9 }] }),
  unit('trebuchet', '巨型投石機', 'ranged', 'siege', 150, 120, 3, 12, .8, 0, 200, 'castle', 3, { family: 'siege', wood: 200, bonus: 'building', cooldown: 5, hotkey: 'r', packed: true }),
  unit('longbow', '王國長弓兵', 'ranged', 'archer', 45, 6, 0, 6, 2.1, 0, 40, 'castle', 2, { family: 'archer', wood: 35, hotkey: 't', upgrades: [{ tech: 'elite-longbow', name: '精銳王國長弓兵', hp: 60, attack: 8, range: 8 }] }),
];
const tech = (id, name, building, age, cost, effect, requires = [], time = 15) => ({ id, name, building, age, cost, effect, requires, time });
export const TECHNOLOGIES = [
  tech('feudal', '升至封建時代', 'town', 0, { food: 500 }, { age: 1 }, [], 30),
  tech('castle-age', '升至城堡時代', 'town', 1, { food: 800, gold: 200 }, { age: 2 }, ['feudal'], 40),
  tech('imperial', '升至帝王時代', 'town', 2, { food: 1000, gold: 800 }, { age: 3 }, ['castle-age'], 50),
  tech('loom', '織布', 'town', 0, { gold: 50 }, { workerHp: 15, workerArmor: 1 }),
  tech('wheelbarrow', '獨輪推車', 'town', 1, { food: 175, wood: 50 }, { carry: 1.4, workerSpeed: 1.1 }),
  tech('handcart', '手推車', 'town', 2, { food: 300, wood: 200 }, { carry: 1.5, workerSpeed: 1.1 }, ['wheelbarrow']),
  tech('double-axe', '雙刃斧', 'lumber', 1, { food: 100, wood: 50 }, { gather: 'wood', factor: 1.2 }),
  tech('bowsaw', '弓鋸', 'lumber', 2, { food: 150, wood: 100 }, { gather: 'wood', factor: 1.2 }, ['double-axe']),
  tech('two-saw', '雙人鋸', 'lumber', 3, { food: 300, wood: 200 }, { gather: 'wood', factor: 1.1 }, ['bowsaw']),
  tech('gold-mining', '採金技術', 'mining', 1, { food: 100, wood: 75 }, { gather: 'gold', factor: 1.15 }),
  tech('gold-shaft', '深層採金', 'mining', 2, { food: 200, wood: 150 }, { gather: 'gold', factor: 1.15 }, ['gold-mining']),
  tech('stone-mining', '採石技術', 'mining', 1, { food: 100, wood: 75 }, { gather: 'stone', factor: 1.15 }),
  tech('horse-collar', '馬軛', 'mill', 1, { food: 75, wood: 75 }, { farmFood: 75 }),
  tech('heavy-plow', '重型耕犁', 'mill', 2, { food: 125, wood: 125 }, { farmFood: 125 }, ['horse-collar']),
  tech('crop-rotation', '輪作', 'mill', 3, { food: 250, wood: 250 }, { farmFood: 175 }, ['heavy-plow']),
  ...[['man-at-arms', '裝甲步兵', 'barracks', 1, 100, 40, []], ['longsword', '長劍兵', 'barracks', 2, 200, 65, ['man-at-arms']], ['twohand', '雙手劍兵', 'barracks', 3, 300, 100, ['longsword']], ['champion', '冠軍劍士', 'barracks', 3, 750, 350, ['twohand']], ['pikeman', '重裝長槍兵', 'barracks', 2, 215, 90, []], ['halberdier', '戟兵', 'barracks', 3, 300, 600, ['pikeman']], ['crossbow', '弩兵', 'archery', 2, 125, 75, []], ['arbalest', '強弩兵', 'archery', 3, 350, 300, ['crossbow']], ['elite-skirm', '精銳矛兵', 'archery', 2, 230, 130, []], ['light-cavalry', '輕騎兵', 'stable', 2, 150, 50, []], ['hussar', '匈牙利輕騎兵', 'stable', 3, 500, 600, ['light-cavalry']], ['cavalier', '重裝騎士', 'stable', 3, 300, 300, []], ['paladin', '遊俠', 'stable', 3, 1300, 750, ['cavalier']], ['capped-ram', '重型衝撞車', 'siege', 3, 300, 0, []], ['siege-ram', '攻城衝撞車', 'siege', 3, 1000, 0, ['capped-ram']], ['onager', '中型投石車', 'siege', 3, 800, 500, []], ['siege-onager', '重型投石車', 'siege', 3, 1450, 1000, ['onager']], ['elite-longbow', '精銳長弓兵', 'castle', 3, 850, 850, []]].map(([id, name, b, age, food, gold, req]) => tech(id, name, b, age, { food, gold }, {}, req)),
  ...[1, 2, 3].flatMap(level => [tech(`melee-${level}`, ['鍛造', '鑄鐵', '鼓風爐'][level - 1], 'blacksmith', level, { food: 100 * level, gold: 50 * level }, { meleeAttack: level === 3 ? 2 : 1 }, level > 1 ? [`melee-${level - 1}`] : []), tech(`arrows-${level}`, ['羽箭', '錐箭', '護腕'][level - 1], 'blacksmith', level, { food: 100 * level, gold: 50 * level }, { rangedAttack: 1, rangedRange: 1 }, level > 1 ? [`arrows-${level - 1}`] : []), tech(`armor-${level}`, ['鱗甲', '鎖子甲', '板甲'][level - 1], 'blacksmith', level, { food: 100 * level, gold: 50 * level }, { armor: level === 3 ? 2 : 1 }, level > 1 ? [`armor-${level - 1}`] : [])]),
  tech('bloodlines', '血統', 'stable', 1, { food: 150, gold: 100 }, { cavalryHp: 20 }),
  tech('husbandry', '畜牧', 'stable', 2, { food: 150 }, { cavalrySpeed: 1.1 }),
  tech('ballistics', '彈道學', 'university', 2, { wood: 300, gold: 175 }, { accuracy: true }),
  tech('masonry', '磚石建築', 'university', 2, { food: 150, wood: 175 }, { buildingHp: 1.1 }),
  tech('chemistry', '化學', 'university', 3, { food: 300, gold: 200 }, { rangedAttack: 1 }),
  tech('conscription', '徵兵', 'castle', 3, { food: 150, gold: 150 }, { trainSpeed: 1.33 }),
  tech('faith', '信仰', 'monastery', 3, { food: 750, gold: 1000 }, { conversionResist: true }),
  tech('sanctity', '聖潔', 'monastery', 2, { gold: 120 }, { healerHp: 15 }),
  tech('fervor', '熱情', 'monastery', 2, { gold: 140 }, { healerSpeed: 1.15 }),
];
export const CLASSIC_BUILD_KEYS = { n: 'town', e: 'house', i: 'mill', f: 'farm', z: 'lumber', g: 'mining', b: 'barracks', a: 'archery', l: 'stable', s: 'blacksmith', m: 'market', y: 'monastery', u: 'university', k: 'siege', v: 'castle', t: 'tower', w: 'wall', '/': 'gate', q: 'outpost' };
for (const bp of CIV_UNITS) {
  Object.assign(bp, UNIT_BALANCE[bp.id]);
  for (const upgrade of bp.upgrades || []) Object.assign(upgrade, UPGRADE_BALANCE[upgrade.tech]);
}
for (const [family, names] of [['archer', ['布甲', '皮甲', '環甲']], ['cavalry', ['鱗甲馬鎧', '鎖子甲馬鎧', '板甲馬鎧']]]) for (let level = 1; level <= 3; level++) {
  const id = `${family}-armor-${level}`;
  TECHNOLOGIES.push(tech(id, names[level - 1], 'blacksmith', level, {}, { [`${family}Armor`]: 1, [`${family}PierceArmor`]: level === 3 ? 2 : 1 }, level > 1 ? [`${family}-armor-${level - 1}`] : []));
}
for (const t of TECHNOLOGIES) {
  Object.assign(t, TECH_BALANCE[t.id]);
  if (t.id.startsWith('armor-')) t.effect = { infantryArmor: 1, infantryPierceArmor: t.id === 'armor-3' ? 2 : 1 };
}
TECHNOLOGIES.find(t => t.id === 'loom').effect.workerPierceArmor = 2;
TECHNOLOGIES.find(t => t.id === 'wheelbarrow').effect.carry = 1.25;
TECHNOLOGIES.find(t => t.id === 'handcart').effect.carry = 2;
export const STANCES = { aggressive: '積極進攻', defensive: '防禦姿態', stand: '原地防守', passive: '不還擊' };
export const FORMATIONS = { line: '線形', box: '方陣', spread: '散開', flank: '分隊' };
