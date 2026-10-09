import { CIV_UNITS, TECHNOLOGIES } from './civilization.mjs?v=20261009g';
import { BUILDING_BALANCE } from './balance.mjs?v=20261009g';
import { createRouteSearch } from './navigation.mjs?v=20261009g';
export const clone = value => JSON.parse(JSON.stringify(value));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const RICH_RESOURCE_AMOUNTS = { wood: 5000, food: 10000, gold: 20000, stone: 20000 };
export const RESOURCE = { forest: 'wood', food: 'food', gold: 'gold', stone: 'stone' };
export const TILE_NAMES = { grass: '草地', water: '水域', forest: '森林', food: '食物', gold: '金礦', stone: '石礦', sand: '沙地', road: '道路' };
export const BUILDINGS = {
  town: { name: '城鎮中心', hp: 2400, cost: { wood: 275, stone: 100 }, time: 100, pop: 5 },
  house: { name: '住宅', hp: 550, cost: { wood: 25 }, time: 25, pop: 5 },
  barracks: { name: '兵營', hp: 850, cost: { wood: 120 }, time: 12, pop: 0 },
  tower: { name: '箭塔', hp: 800, cost: { wood: 80, stone: 100 }, time: 14, pop: 0, attack: 15, range: 6, age: 1 },
  archery: { name: '射箭場', hp: 1400, cost: { wood: 175 }, time: 14, pop: 0, age: 1 },
  stable: { name: '馬廄', hp: 1400, cost: { wood: 175 }, time: 14, pop: 0, age: 1 },
  siege: { name: '攻城器製造所', hp: 1800, cost: { wood: 200 }, time: 18, pop: 0, age: 2 },
  monastery: { name: '修道院', hp: 1400, cost: { wood: 175 }, time: 16, pop: 0, age: 2 },
  castle: { name: '城堡', hp: 4800, cost: { stone: 650 }, time: 38, pop: 20, age: 2, attack: 22, range: 8, garrison: 20 },
  blacksmith: { name: '兵工廠', hp: 1600, cost: { wood: 150 }, time: 14, pop: 0, age: 1 },
  university: { name: '學院', hp: 1800, cost: { wood: 200 }, time: 16, pop: 0, age: 2 },
  market: { name: '市集', hp: 1800, cost: { wood: 175 }, time: 14, pop: 0, age: 1 },
  mill: { name: '磨坊', hp: 800, cost: { wood: 100 }, time: 10, pop: 0, dropoff: ['food'] },
  lumber: { name: '伐木場', hp: 800, cost: { wood: 100 }, time: 10, pop: 0, dropoff: ['wood'] },
  mining: { name: '採礦營地', hp: 800, cost: { wood: 100 }, time: 10, pop: 0, dropoff: ['gold', 'stone'] },
  farm: { name: '農田', hp: 300, cost: { wood: 60 }, time: 6, pop: 0 },
  wall: { name: '石牆', hp: 1800, cost: { stone: 5 }, time: 5, pop: 0, age: 1 },
  gate: { name: '城門', hp: 2400, cost: { stone: 30 }, time: 10, pop: 0, age: 1 },
  outpost: { name: '哨站', hp: 500, cost: { wood: 25, stone: 5 }, time: 8, pop: 0 },
};
BUILDINGS.town.dropoff = ['food', 'wood', 'gold', 'stone']; BUILDINGS.town.garrison = 15; BUILDINGS.tower.garrison = 5;
for (const [id, stats] of Object.entries(BUILDING_BALANCE)) Object.assign(BUILDINGS[id], stats);
BUILDINGS.farm.requires = 'mill'; BUILDINGS.archery.requires = 'barracks'; BUILDINGS.stable.requires = 'barracks'; BUILDINGS.siege.requires = 'blacksmith'; BUILDINGS.market.requires = 'mill';
Object.assign(BUILDINGS.town, {attack:5,range:6}); Object.assign(BUILDINGS.tower,{attack:5,range:8}); Object.assign(BUILDINGS.castle,{attack:11,range:8});
for (const [type, spec] of Object.entries(BUILDINGS)) spec.footprint = ['town', 'castle', 'university', 'market'].includes(type) ? [4, 4] : ['barracks', 'stable', 'archery', 'siege', 'monastery', 'blacksmith', 'farm'].includes(type) ? [3, 3] : ['house', 'mill', 'lumber', 'mining'].includes(type) ? [2, 2] : type === 'gate' ? [3, 1] : [1, 1];
export function buildingBounds(type, inputX, inputY) {
  const [width, height] = BUILDINGS[type].footprint, x = Math.round(inputX) - (width % 2 ? 0 : .5), y = Math.round(inputY) - (height % 2 ? 0 : .5), minX = x - (width - 1) / 2, minY = y - (height - 1) / 2;
  return { x, y, minX, maxX: minX + width - 1, minY, maxY: minY + height - 1, width, height };
}
export function buildingDistance(point, building) {
  const bounds = buildingBounds(building.type, building.x, building.y);
  return Math.hypot(Math.max(bounds.minX - .5 - point.x, 0, point.x - bounds.maxX - .5), Math.max(bounds.minY - .5 - point.y, 0, point.y - bounds.maxY - .5));
}
export const DEFAULT_UNITS = [
  { id: 'villager', name: '村民', role: 'worker', look: 'worker', color: '#e8c58e', hp: 65, attack: 4, armor: 0, range: 1.1, speed: 2.1, cooldown: 1.4, food: 50, gold: 0, time: 5, image: '' },
  { id: 'swordsman', name: '劍士', role: 'melee', look: 'soldier', color: '#7cc5d1', hp: 140, attack: 14, armor: 2, range: 1.2, speed: 2.3, cooldown: 1.1, food: 60, gold: 20, time: 6, image: '' },
  { id: 'archer', name: '弓箭手', role: 'ranged', look: 'archer', color: '#9fbc78', hp: 80, attack: 11, armor: 0, range: 5, speed: 2.1, cooldown: 1.5, food: 45, gold: 30, time: 7, image: '' },
  { id: 'knight', name: '騎士', role: 'melee', look: 'knight', color: '#d6b575', hp: 240, attack: 21, armor: 4, range: 1.3, speed: 3.4, cooldown: 1.3, food: 100, gold: 60, time: 10, image: '' },
];
const noise = (x, y, seed) => { const n = Math.sin(x * 127.1 + y * 311.7 + seed * 73) * 43758.5453; return n - Math.floor(n); };
export function tileType(map, x, y) {
  x = Math.floor(x); y = Math.floor(y); const n = map.size; if (x < 0 || y < 0 || x >= n || y >= n) return 'water';
  const i = y * n + x; if (map.tiles) return map.tiles[i]; if (map.patches && Object.hasOwn(map.patches, i)) return map.patches[i];
  if (map.template === 'grass') return 'grass';
  const river = Math.round(n / 2 + Math.sin(y / 45) * 14), crossing = y % 100 < 10;
  if (Math.abs(x - river) < 3) return crossing ? 'road' : 'water';
  for (const s of map.spawns) if (Math.hypot(x - s.x, y - s.y) < 13) return 'grass';
  const v = noise(Math.floor(x / 3), Math.floor(y / 3), map.seed);
  return v < .20 ? 'forest' : v > .97 ? 'stone' : v > .93 ? 'gold' : v > .89 ? 'food' : 'grass';
}
export function setTile(map, x, y, type) { const i = y * map.size + x; if (map.tiles) map.tiles[i] = type; else (map.patches ||= {})[i] = type; map.revision = (map.revision || 0) + 1; }
export function generateMap(size = 128, seed = 7) {
  if (size > 128) {
    const near = Math.round(size * .22), far = Math.round(size * .78);
    const map = { size, seed, name: '無盡河谷', tiles: null, patches: {}, template: 'river', spawns: [{ x: near, y: far }, { x: far, y: near }, { x: far, y: far }] };
    for (const s of map.spawns) for (const [dx, dy, t] of [[-5, 0, 'forest'], [-5, 1, 'forest'], [-5, 2, 'forest'], [0, 6, 'food'], [1, 6, 'food'], [6, 0, 'gold'], [6, 1, 'stone']]) setTile(map, s.x + dx, s.y + dy, t);
    enrichMapResources(map); return map;
  }
  const near = Math.round(size * .22), far = Math.round(size * .78);
  const map = { size, seed, name: '雙河谷地', tiles: [], spawns: [{ x: near, y: far }, { x: far, y: near }] };
  if (size >= 64) { map.spawns.push({ x: far, y: far }); map.name = '三王國河谷'; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = noise(Math.floor(x / 2), Math.floor(y / 2), seed);
    const river = Math.round(size / 2 + Math.sin(y / 5) * 2);
    const crossing = Math.abs(y - size * 0.3) < 2 || Math.abs(y - size * 0.7) < 2;
    let t = n < 0.2 ? 'forest' : n > 0.95 ? 'stone' : n > 0.91 ? 'gold' : n > 0.87 ? 'food' : 'grass';
    if (Math.abs(x - river) < 1.5) t = crossing ? 'road' : 'water';
    for (const s of map.spawns) if (Math.hypot(x - s.x, y - s.y) < 13) t = 'grass';
    map.tiles.push(t);
  }
  for (const s of map.spawns) {
    for (const [dx, dy, t] of [[-5, 0, 'forest'], [-5, 1, 'forest'], [0, 6, 'food'], [1, 6, 'food'], [6, 0, 'gold'], [6, 1, 'stone']]) {
      const x = clamp(s.x + dx, 0, size - 1), y = clamp(s.y + dy, 0, size - 1);
      map.tiles[y * size + x] = t;
    }
  }
  enrichMapResources(map);
  // Keep both river crossings connected to the starting clearings, independent of the seed.
  const left= Math.round(size/2)-6, right=Math.round(size/2)+6, top=Math.round(size*.3), bottom=Math.round(size*.7);
  const road=(a,b)=>{
    const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    for(let i=0;i<=steps;i++) for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const x=Math.round(a.x+(b.x-a.x)*i/(steps||1))+dx,y=Math.round(a.y+(b.y-a.y)*i/(steps||1))+dy;
      if(x>=0&&y>=0&&x<size&&y<size) setTile(map,x,y,'road');
    }
  };
  road(map.spawns[0],{x:left,y:bottom});road(map.spawns[1],{x:right,y:top});
  if(map.spawns[2]) road(map.spawns[2],{x:right,y:bottom});
  road({x:left,y:top},{x:left,y:bottom});road({x:right,y:top},{x:right,y:bottom});
  for(const y of [top,bottom]) road({x:left,y},{x:right,y});
  return map;
}
export function enrichMapResources(map) {
  map.resourceAmounts = clone(RICH_RESOURCE_AMOUNTS);
  // Every kingdom gets the same reserves, with gaps between deposits and its town.
  for (const spawn of map.spawns) for (const [dx, dy, type] of [[-8,0,'forest'],[0,8,'food'],[8,0,'gold'],[0,-8,'stone']]) {
    for (let y=-1;y<=1;y++) for (let x=-1;x<=1;x++) {
      const tx=clamp(spawn.x+dx+x,1,map.size-2),ty=clamp(spawn.y+dy+y,1,map.size-2);
      if (Math.hypot(tx-spawn.x,ty-spawn.y)>=5 && tileType(map,tx,ty)!=='water') setTile(map,tx,ty,type);
    }
  }
  return map;
}
export function defaultProject() {
  return { version: 1, name: '我的王國', map: generateMap(), units: clone(CIV_UNITS), rules: { population: 500, enemyPopulation: 200, starting: 2000, playerStartingResources: { wood: 2000, food: 2000, gold: 2000, stone: 2000 }, ai: 'normal', aiAlliance: true, startingBase: 'town', fog: true, speed: 1, startAge: 4, victory: 'conquest', hotkeys: 'definitive' } };
}
export function validateProject(value) {
  if (!value || value.version !== 1) throw new Error('這不是支援的王國工坊檔案。');
  const p = clone(value), n = p.map?.size;
  if (!Number.isInteger(n) || n < 20 || n > 2048 || (p.map.tiles && p.map.tiles.length !== n * n)) throw new Error('地圖大小必須介於 20–2048 格，並包含完整地形。');
  if (p.map.tiles ? !p.map.tiles.every(t => Object.hasOwn(TILE_NAMES, t)) : !['river', 'grass'].includes(p.map.template) || !Number.isInteger(p.map.seed) || !p.map.patches || Object.entries(p.map.patches).some(([i, t]) => !Number.isInteger(Number(i)) || Number(i) < 0 || Number(i) >= n * n || !Object.hasOwn(TILE_NAMES, t))) throw new Error('地圖有不支援的地形。');
  if (!Array.isArray(p.map.spawns) || p.map.spawns.length < 2 || p.map.spawns.length > 4) throw new Error('地圖必須有 2–4 個出生點。');
  for (const s of p.map.spawns) if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || s.x < 1 || s.y < 1 || s.x >= n - 2 || s.y >= n - 2 || !['grass', 'road', 'sand'].includes(tileType(p.map, s.x, s.y))) throw new Error('出生點必須在地圖內可行走的空地。');
  for (let a = 0; a < p.map.spawns.length; a++) for (let b = a + 1; b < p.map.spawns.length; b++) if (Math.hypot(p.map.spawns[a].x - p.map.spawns[b].x, p.map.spawns[a].y - p.map.spawns[b].y) < 12) throw new Error('出生點至少需要相距 12 格。');
  if (!Array.isArray(p.units) || p.units.length < 1 || p.units.length > 40 || !p.units.some(u => u.role === 'worker' && !u.hero)) throw new Error('需要至少一種普通村民，兵種最多 40 種。');
  const ids = new Set();
  for (const u of p.units) {
    if (typeof u.id !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(u.id) || ids.has(u.id)) throw new Error('兵種代碼不正確或重複。');
    ids.add(u.id);
    if (!['worker', 'melee', 'ranged', 'healer'].includes(u.role)) throw new Error('兵種角色不支援。');
    if (!['worker', 'soldier', 'archer', 'knight', 'mage', 'beast', 'siege'].includes(u.look)) throw new Error('兵種外觀不支援。');
    if (u.building && !['town', 'barracks', 'archery', 'stable', 'siege', 'monastery', 'castle'].includes(u.building) || u.age !== undefined && (!Number.isInteger(u.age) || u.age < 0 || u.age > 3) || u.wood !== undefined && (!Number.isFinite(u.wood) || u.wood < 0 || u.wood > 1000)) throw new Error('兵種生產設定不正確。');
    if (u.upgrades && (!Array.isArray(u.upgrades) || u.upgrades.length > 10 || u.upgrades.some(v => !TECHNOLOGIES.some(t => t.id === v.tech) || Object.keys(v).some(k => !['tech', 'name', 'hp', 'attack', 'armor', 'pierceArmor', 'range', 'minRange', 'speed', 'cooldown', 'time', 'food', 'gold', 'wood', 'attackType', 'buildingBonus', 'cavalryBonus', 'archerBonus'].includes(k)) || ['hp', 'attack', 'armor', 'pierceArmor', 'range'].some(k => v[k] !== undefined && (!Number.isFinite(v[k]) || v[k] < -5 || v[k] > 10000))))) throw new Error('兵種科技升級設定不正確。');
    for (const [key, lo, hi] of [['hp', 10, 10000], ['attack', 0, 500], ['armor', -5, 100], ['range', .5, 20], ['speed', 0.5, 6], ['cooldown', 0.2, 15], ['food', 0, 1000], ['gold', 0, 1000], ['time', 1, 120]]) {
      if (!Number.isFinite(u[key]) || u[key] < lo || u[key] > hi) throw new Error(`「${u.name}」的 ${key} 超出範圍。`);
    }
    if (u.pierceArmor !== undefined && (!Number.isFinite(u.pierceArmor) || u.pierceArmor < 0 || u.pierceArmor > 250)) throw new Error('遠程護甲必須介於 0–250。');
    if (u.regen !== undefined && (!Number.isFinite(u.regen) || u.regen < 0 || u.regen > 100)) throw new Error(`「${u.name}」的每秒回血必須介於 0–100。`); u.regen = u.regen ?? (u.hero ? 1 : 0);
    if (typeof u.name !== 'string' || !u.name.trim() || u.name.length > 24 || !/^#[a-f\d]{6}$/i.test(u.color)) throw new Error('兵種名稱或顏色不正確。');
    if (typeof u.image !== 'string' || (u.image && (!/^data:image\/(png|webp|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(u.image) || u.image.length > 400000))) throw new Error('兵種圖片必須是小型 PNG、JPEG 或 WebP 圖片。');
  }
  if (p.map.heroPlacements !== undefined) {
    if (!Array.isArray(p.map.heroPlacements) || p.map.heroPlacements.length > p.units.length) throw new Error('英雄出生位置格式不正確。');
    const placed = new Set(), positions = new Set(); for (const point of p.map.heroPlacements) {
      if (!point || !p.units.some(u => u.id === point.unitId && u.hero === true)) throw new Error('英雄出生位置必須對應現有的玩家英雄。');
      if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= n || point.y >= n) throw new Error('英雄出生位置必須是地圖內的整數格。');
      if (placed.has(point.unitId) || positions.has(point.y * n + point.x)) throw new Error('英雄出生位置不能重複或重疊。'); placed.add(point.unitId); positions.add(point.y * n + point.x);
    }
  }
  if (!p.rules || !Number.isInteger(p.rules.population) || p.rules.population < 50 || p.rules.population > 2000 || !Number.isFinite(p.rules.starting) || p.rules.starting < 0 || p.rules.starting > 10000 || !['off', 'calm', 'normal', 'hard'].includes(p.rules.ai) || p.rules.aiAlliance !== undefined && typeof p.rules.aiAlliance !== 'boolean' || p.rules.startingBase !== undefined && !['town', 'full'].includes(p.rules.startingBase)) throw new Error('對戰規則不正確。');
  if (p.rules.enemyPopulation !== undefined && (!Number.isInteger(p.rules.enemyPopulation) || p.rules.enemyPopulation < 50 || p.rules.enemyPopulation > 2000)) throw new Error('每個敵人的人口上限必須介於 50–2,000。');
  p.rules.enemyPopulation ??= 200;
  p.rules.fog = Boolean(p.rules.fog); p.rules.speed = clamp(Number(p.rules.speed) || 1, 0.5, 2);
  p.rules.aiAlliance = true;
  p.rules.startingBase = p.rules.startingBase ?? 'town';
  p.rules.startAge = Number.isInteger(p.rules.startAge) ? clamp(p.rules.startAge, 0, 4) : 4;
  p.rules.victory = p.rules.victory ?? 'conquest';
  p.rules.hotkeys = p.rules.hotkeys ?? 'definitive';
  p.rules.playerStartingResources ??= Object.fromEntries(['wood','food','gold','stone'].map(r=>[r,p.rules.starting]));
  p.map.resourceAmounts ??= clone(RICH_RESOURCE_AMOUNTS);
  for (const r of ['wood','food','gold','stone']) {
    if (!Number.isInteger(p.rules.playerStartingResources[r]) || p.rules.playerStartingResources[r] < 0 || p.rules.playerStartingResources[r] > 1000000) throw new Error('我方起始資源必須是 0–1,000,000 的整數。');
    if (!Number.isInteger(p.map.resourceAmounts[r]) || p.map.resourceAmounts[r] < 1 || p.map.resourceAmounts[r] > 1000000) throw new Error('地圖每格資源量必須是 1–1,000,000 的整數。');
  }
  if (!['conquest', 'town'].includes(p.rules.victory) || !['definitive', 'classic'].includes(p.rules.hotkeys)) throw new Error('勝利條件或快捷鍵設定不正確。');
  p.name = String(p.name || '我的王國').slice(0, 40); p.map.name = String(p.map.name || '自製地圖').slice(0, 40);
  return p;
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const goalDistance = (point, goal) => {
  if (point.kind === 'building') { const bounds = buildingBounds(point.type, point.x, point.y); point = { x: clamp(goal.x, bounds.minX - .5, bounds.maxX + .5), y: clamp(goal.y, bounds.minY - .5, bounds.maxY + .5) }; }
  return goal.kind === 'building' ? buildingDistance(point, goal) : distance(point, goal);
};
const routeDistance = (p, points) => {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1); best = Math.min(best, distance(p, { x: a.x + dx * t, y: a.y + dy * t })); }
  return best;
};
export function findPath(start, goal, size, blocked, radius = 0) {
  // Most gathering trips and open-ground orders need no search or grid allocation.
  const direct = [], ax = clamp(Math.round(start.x),0,size-1), ay = clamp(Math.round(start.y),0,size-1), dx = Math.round(goal.x)-ax, dy = Math.round(goal.y)-ay, steps = Math.max(Math.abs(dx),Math.abs(dy));
  let previous = {x:ax,y:ay};
  if (goalDistance(previous,goal)<=radius+.01) return direct;
  for(let i=1;i<=steps;i++) {
    const point={x:Math.round(ax+dx*i/steps),y:Math.round(ay+dy*i/steps)};
    if(point.x<0||point.y<0||point.x>=size||point.y>=size||blocked(point.x,point.y)||point.x!==previous.x&&point.y!==previous.y&&(blocked(point.x,previous.y)||blocked(previous.x,point.y)))break;
    direct.push(point);if(goalDistance(point,goal)<=radius+.01)return direct;previous=point;
  }
  if (size > 128) {
    const dx = goal.x - start.x, dy = goal.y - start.y, d = Math.hypot(dx, dy), fraction = Math.min(1, 45 / Math.max(1, d));
    let target = { x: Math.round(start.x + dx * fraction), y: Math.round(start.y + dy * fraction) };
    if (fraction < 1 && blocked(target.x, target.y)) {
      outer: for (let r = 1; r < 12; r++) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (!blocked(target.x + x, target.y + y)) { target = { x: target.x + x, y: target.y + y }; break outer; }
    }
    const ox = Math.max(0, Math.floor(Math.min(start.x, target.x) - 55)), oy = Math.max(0, Math.floor(Math.min(start.y, target.y) - 55));
    const localSize = Math.min(160, Math.max(Math.ceil(Math.max(start.x, target.x) - ox + 56), Math.ceil(Math.max(start.y, target.y) - oy + 56)));
    const localGoal = fraction < 1 ? { x: target.x - ox, y: target.y - oy } : { ...goal, x: goal.x - ox, y: goal.y - oy };
    const path = findPath({ x: start.x - ox, y: start.y - oy }, localGoal, Math.min(localSize, 128), (x, y) => x + ox >= size || y + oy >= size || blocked(x + ox, y + oy), fraction < 1 ? 1.5 : radius);
    return path?.map(p => ({ x: p.x + ox, y: p.y + oy })) || null;
  }
  const sx = clamp(Math.round(start.x), 0, size - 1), sy = clamp(Math.round(start.y), 0, size - 1);
  const gx = clamp(Math.round(goal.x), 0, size - 1), gy = clamp(Math.round(goal.y), 0, size - 1);
  const initial = sy * size + sx, total = size * size;
  const prev = new Int32Array(total).fill(-1), score = new Float32Array(total).fill(Infinity);
  const done = new Uint8Array(total), heap = [];
  const destination = goal.kind === 'building' ? goal : { x: gx, y: gy }, heuristic = (x, y) => Math.max(0, goalDistance({ x, y }, destination) - radius);
  const push = node => { heap.push(node); let i = heap.length - 1; while (i) { const parent = (i - 1) >> 1; if (heap[parent].f <= node.f) break; heap[i] = heap[parent]; i = parent; } heap[i] = node; };
  const pop = () => { const first = heap[0], last = heap.pop(); if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (heap[c].f >= last.f) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return first; };
  score[initial] = 0; push({ id: initial, f: heuristic(sx, sy) }); let end = -1;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (heap.length) {
    const { id } = pop(); if (done[id]) continue; done[id] = 1;
    const x = id % size, y = Math.floor(id / size);
    if (goalDistance({ x, y }, destination) <= radius + 0.01) { end = id; break; }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy, ni = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || done[ni] || blocked(nx, ny)) continue;
      if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
      const cost = score[id] + (dx && dy ? 1.4142 : 1);
      if (cost >= score[ni]) continue;
      score[ni] = cost; prev[ni] = id; push({ id: ni, f: cost + heuristic(nx, ny) });
    }
  }
  if (end < 0) return null;
  const path = []; while (end !== initial) { path.push({ x: end % size, y: Math.floor(end / size) }); end = prev[end]; }
  return path.reverse();
}
export class World {
  constructor(project) {
    this.project = validateProject(project); this.map = clone(this.project.map); this.units = []; this.buildings = []; this.nextId = 1; this.time = 0; this.events = []; this.effects = []; this.corpses = []; this.result = null; this.deploymentErrors = [];
    this.teams = this.map.spawns.length; this.ages = Array(this.teams).fill(Math.min(3, this.project.rules.startAge));
    this.researched = Array.from({ length: this.teams }, () => new Set(this.project.rules.startAge === 4 ? TECHNOLOGIES.map(t => t.id) : ['feudal', 'castle-age', 'imperial'].slice(0, this.ages[0])));
    this.stocks = Array.from({ length: this.teams }, (_, team) => team === 0 ? clone(this.project.rules.playerStartingResources) : Object.fromEntries(['wood','food','gold','stone'].map(r=>[r,this.project.rules.starting])));
    this.amounts = {};
    this.visible = new Uint8Array(this.map.size ** 2); this.explored = new Uint8Array(this.map.size ** 2); this.blockedCells = new Set(); this.occupiedCells = new Map(); this.spatial = new Map(); this.entities = new Map(); this.aiTimer = 0; this.visionTimer = 0; this.pathBudget = 0;
    for (let team = 0; team < this.teams; team++) {
      const townSite = this.nearestBuildingSite('town', this.map.spawns[team], true); if (!townSite) { this.deploymentErrors.push(`${team === 0 ? '我方' : 'AI ' + team}出生點附近需要可放置 4×4 市鎮中心與可行走出口的空地。`); continue; } const s = townSite, town = this.addBuilding('town', team, s.x, s.y, true);
      const layoutScale = 2, deploymentPoint = (type, dx, dy) => this.nearestBuildingSite(type, { x: s.x + Math.round(dx * layoutScale), y: s.y + Math.round(dy * layoutScale) }, true, 1);
      if (this.project.rules.startingBase === 'full') { const b = deploymentPoint('barracks', 2, -1); if (b) this.addBuilding('barracks', team, b.x, b.y, true); }
      const worker = this.project.units.find(u => u.role === 'worker' && !u.hero), soldiers = this.project.units.filter(u => u.role !== 'worker' && !u.hero && (u.age || 0) <= this.ages[team]);
      for (let i = 0; i < 3; i++) this.spawn(worker.id, team, this.nearestOpen({ x: s.x - 1 + i, y: s.y + 1 }));
      const scout = soldiers.find(u => u.id === 'scout') || soldiers[0]; if (scout) this.spawn(scout.id, team, this.nearestOpen({ x: s.x - 4, y: s.y - 4 }));
      if (this.project.rules.startingBase === 'full') {
        const house = deploymentPoint('house', -2, -1); if (house) this.addBuilding('house', team, house.x, house.y, true);
        if (this.ages[team] >= 1) for (const [type, dx, dy] of [['stable', 4, 1], ['archery', 0, -6], ['lumber', -3, 0], ['mill', 0, 4], ['mining', 4, -2], ['house', -4, 4], ['house', -6, 4]]) { const p = deploymentPoint(type, dx, dy); if (p) this.addBuilding(type, team, p.x, p.y, true); }
        if (this.ages[team] >= 2) for (const [type, dx, dy] of [['blacksmith', 3, -5], ['siege', 6, 3], ['monastery', -6, -3], ['castle', 6, -6], ['market', -4, 6], ['university', 6, 6]]) { const p = deploymentPoint(type, dx, dy); if (p) this.addBuilding(type, team, p.x, p.y, true); }
        for (let i = 0; i < 3 && this.ages[team] >= 1; i++) { const p = deploymentPoint('farm', -2 + i * 3, 5); if (p) this.addBuilding('farm', team, p.x, p.y, true); }
      }
      const exit = this.buildingExit(town); if (!exit) this.deploymentErrors.push(`${team === 0 ? '我方' : 'AI ' + team}市鎮中心需要至少一格可行走的出口。`);
      else for (const u of this.units.filter(u => u.team === team)) if (!findPath(u, town, this.map.size, (x, y) => this.blocked(x, y), 1.6)) Object.assign(u, exit);
    }
    const playerTown = this.buildings.find(b => b.team === 0 && b.type === 'town'); for (const hero of this.project.units.filter(u => u.hero)) {
      const placement = this.map.heroPlacements?.find(p => p.unitId === hero.id);
      if (placement) { if (this.canPlaceHero(hero.id, placement.x, placement.y)) this.spawn(hero.id, 0, placement); else this.deploymentErrors.push(`英雄「${hero.name}」的出生位置（${placement.x}, ${placement.y}）被地形、建築或其他英雄占用，請重新放到空地。`); }
      else if (playerTown) { const u = this.spawn(hero.id, 0, { x: playerTown.x, y: playerTown.y + 3 }), exit = this.buildingExit(playerTown); if (u && exit && !findPath(u, playerTown, this.map.size, (x, y) => this.blocked(x, y), 1.6)) Object.assign(u, exit); }
    }
    if (project.rules.ai !== 'off') for (const u of this.units.filter(u => u.team > 0 && u.blueprint.role === 'worker')) { const r = this.closestResource(u, ['food', 'wood', 'gold', 'stone'][u.id % 4]); if (r) this.command([u.id], { type: 'gather', ...r }); }
    this.updateSpatial(); this.updateVision(); this.note(this.deploymentErrors[0] || '王國已部署。選村民，右鍵資源開始採集。', this.map.spawns[0]);
  }
  note(text, point = null) { this.events.unshift({ text, time: this.time, ...(point ? { x: point.x, y: point.y } : {}) }); this.events.length = Math.min(8, this.events.length); }
  isAlly(teamA, teamB) { return teamA === teamB || this.project.rules.aiAlliance && teamA > 0 && teamB > 0; }
  saveState() {
    const state={version:1,project:clone(this.project),researched:this.researched.map(set=>[...set]),explored:[]};
    for (const key of ['map','units','buildings','stocks','amounts','ages','time','nextId','events','effects','corpses','aiTimer','result']) state[key]=clone(this[key]);
    for (let i=0;i<this.explored.length;i++) if (this.explored[i]) state.explored.push(i);
    return state;
  }
  static fromState(data) {
    if (data?.version!==1 || !Array.isArray(data.units) || !Array.isArray(data.buildings) || data.units.length>8000 || data.buildings.length>20000 || !Number.isFinite(data.time) || data.time<0) throw new Error('戰役存檔格式不正確。');
    const project=validateProject(data.project), map=validateProject({...project,map:data.map}).map, teams=map.spawns.length;
    if (!Array.isArray(data.stocks)||data.stocks.length!==teams||!Array.isArray(data.researched)||data.researched.length!==teams||!Array.isArray(data.ages)||data.ages.length!==teams) throw new Error('戰役勢力資料不正確。');
    const ids=new Set();
    for (const e of [...data.units,...data.buildings]) {
      if (!['unit','building'].includes(e.kind)||!Number.isInteger(e.id)||e.id<1||ids.has(e.id)||!Number.isInteger(e.team)||e.team<0||e.team>=teams||!Number.isFinite(e.hp)||!Number.isFinite(e.x)||!Number.isFinite(e.y)||e.x<0||e.y<0||e.x>=map.size||e.y>=map.size||e.kind==='building'&&!BUILDINGS[e.type]||e.kind==='unit'&&!project.units.some(u=>u.id===e.blueprint?.id)) throw new Error('戰役單位資料不正確。'); ids.add(e.id);
    }
    const world=new World(project); world.map=map; world.modCache=null;
    for (const key of ['units','buildings','stocks','amounts','ages','time','events','effects','corpses','aiTimer','result']) world[key]=clone(data[key]);
    world.researched=data.researched.map(values=>new Set(values)); world.nextId=Math.max(data.nextId||1,...[...ids].map(id=>id+1));
    world.entities=new Map([...world.units,...world.buildings].map(e=>[e.id,e])); world.blockedCells.clear(); world.occupiedCells.clear();
    for (const b of world.buildings) { const bounds=buildingBounds(b.type,b.x,b.y); for (let y=bounds.minY;y<=bounds.maxY;y++) for (let x=bounds.minX;x<=bounds.maxX;x++) {const key=y*map.size+x;world.occupiedCells.set(key,b.id);if (!['farm','gate'].includes(b.type))world.blockedCells.add(key);} }
    world.explored.fill(data.fullExploration?1:0); for (const i of data.explored||[]) if (Number.isInteger(i)&&i>=0&&i<world.explored.length)world.explored[i]=1;
    world.visible.fill(0);world.fullVision=false;world.visionCells=new Set();world.updateVision();world.deploymentErrors=[];return world;
  }
  isEnemy(teamA, teamB) { return !this.isAlly(teamA, teamB); }
  tile(x, y) { return tileType(this.map, Math.round(x), Math.round(y)); }
  amountAt(x, y) { const i = y * this.map.size + x; return this.amounts[i] ?? (RESOURCE[this.tile(x, y)] ? this.map.resourceAmounts[RESOURCE[this.tile(x, y)]] : 0); }
  age(team) { return this.ages[team]; }
  modifiers(team) { if (this.modCache?.[team]) return this.modCache[team]; const mods = { carry: 1, workerSpeed: 1, cavalrySpeed: 1, healerSpeed: 1, trainSpeed: 1, buildingHp: 1, gather: { wood: 1, food: 1, gold: 1, stone: 1 } }; for (const t of TECHNOLOGIES) if (this.researched[team].has(t.id)) for (const [key, value] of Object.entries(t.effect)) { if (key === 'gather') mods.gather[value] *= t.effect.factor; else if (['carry', 'workerSpeed', 'cavalrySpeed', 'healerSpeed', 'trainSpeed', 'buildingHp'].includes(key)) mods[key] *= value; else if (typeof value === 'boolean') mods[key] = value; else if (typeof value === 'number' && !['age', 'factor'].includes(key)) mods[key] = (mods[key] || 0) + value; } (this.modCache ||= {})[team] = mods; return mods; }
  effectiveBlueprint(id, team) {
    const original = this.project.units.find(u => u.id === id); if (!original) return null; const bp = clone(original); if (bp.hero) return bp;
    for (const upgrade of bp.upgrades || []) if (this.researched[team].has(upgrade.tech)) Object.assign(bp, upgrade);
    const m = this.modifiers(team); bp.pierceArmor ??= bp.armor;
    if (bp.role === 'worker') { bp.hp += m.workerHp || 0; bp.armor += m.workerArmor || 0; bp.pierceArmor += m.workerPierceArmor || 0; bp.speed *= m.workerSpeed; }
    else if (['infantry', 'cavalry'].includes(bp.family) || !bp.family && bp.role === 'melee') bp.attack += m.meleeAttack || 0;
    else if (bp.family === 'archer' || !bp.family && bp.role === 'ranged') { bp.attack += m.rangedAttack || 0; bp.range += m.rangedRange || 0; }
    if (['infantry', 'archer', 'cavalry'].includes(bp.family)) { bp.armor += m[`${bp.family}Armor`] || 0; bp.pierceArmor += m[`${bp.family}PierceArmor`] || 0; }
    if (bp.family === 'cavalry') { bp.hp += m.cavalryHp || 0; bp.speed *= m.cavalrySpeed; }
    if (bp.role === 'healer') { bp.hp += m.healerHp || 0; bp.speed *= m.healerSpeed; } return bp;
  }
  availableUnits(team, type) { return this.project.units.filter(u => (u.hero ? type === 'castle' && team === 0 : (u.building || (u.role === 'worker' ? 'town' : 'barracks')) === type) && (u.age || 0) <= this.ages[team]).map(u => this.effectiveBlueprint(u.id, team)); }
  ageRequirements(team, techId) {
    const types = new Set(this.buildings.filter(b=>b.team===team&&b.hp>0&&b.progress===1).map(b=>b.type));
    const options = {feudal:['mill','lumber','mining','barracks'],'castle-age':['archery','stable','blacksmith','market'],imperial:['siege','monastery','university']}[techId];
    return !options || techId==='imperial'&&types.has('castle') || options.filter(type=>types.has(type)).length>=2;
  }
  availableTech(team, type) { return TECHNOLOGIES.filter(t => t.building === type && t.age <= this.ages[team] && !this.researched[team].has(t.id) && t.requires.every(id => this.researched[team].has(id)) && !this.buildings.some(b => b.team === team && b.research?.id === t.id)); }
  research(buildingId, techId) { const b = this.entity(buildingId), tech = TECHNOLOGIES.find(t => t.id === techId); if (!b || b.kind !== 'building' || b.progress < 1 || b.research || !this.availableTech(b.team, b.type).some(t => t.id === techId)) return '目前無法研發這項科技。'; if (!this.ageRequirements(b.team,techId)) return '升級時代需要先完成兩種當前時代建築；帝王時代也可使用一座城堡。'; if (!this.canPay(b.team, tech.cost)) return '研發資源不足。'; this.pay(b.team, tech.cost); b.research = { id: techId, left: tech.time, time: tech.time }; return null; }
  cancelResearch(buildingId) {
    const b = this.entity(buildingId), tech = TECHNOLOGIES.find(t => t.id === b?.research?.id);
    if (!b || !tech) return '目前沒有正在研發的科技。';
    for (const [resource, amount] of Object.entries(tech.cost)) this.stocks[b.team][resource] += amount;
    b.research = null; return null;
  }
  completeResearch(team, id) { const tech = TECHNOLOGIES.find(t => t.id === id); this.researched[team].add(id); if (this.modCache) delete this.modCache[team]; if (tech.effect.age !== undefined) this.ages[team] = tech.effect.age; for (const u of this.units) if (u.team === team) { const ratio = u.hp / u.maxHp; u.blueprint = this.effectiveBlueprint(u.blueprint.id, team); u.maxHp = u.blueprint.hp; u.hp = Math.max(1, ratio * u.maxHp); } if (tech.effect.buildingHp) for (const b of this.buildings) if (b.team === team) { const ratio = b.hp / b.maxHp; b.maxHp = Math.round(BUILDINGS[b.type].hp * this.modifiers(team).buildingHp); b.hp = ratio * b.maxHp; } if (team === 0) this.note(`${tech.name}研發完成。`); }
  blocked(x, y) { x = Math.round(x); y = Math.round(y); return !['grass', 'sand', 'road'].includes(this.tile(x, y)) || this.blockedCells.has(y * this.map.size + x); }
  canPlaceHero(unitId, x, y) { const n = this.map.size; return this.project.units.some(u => u.id === unitId && u.hero === true) && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < n && y < n && !this.blocked(x, y) && !this.occupiedCells.has(y * n + x) && !(this.map.heroPlacements || []).some(p => p.unitId !== unitId && p.x === x && p.y === y); }
  canPlaceBuilding(type, x, y) {
    if (!BUILDINGS[type] || !Number.isFinite(x) || !Number.isFinite(y)) return false; const bounds = buildingBounds(type, x, y), n = this.map.size;
    if (bounds.minX < 0 || bounds.minY < 0 || bounds.maxX >= n || bounds.maxY >= n) return false;
    for (let by = bounds.minY; by <= bounds.maxY; by++) for (let bx = bounds.minX; bx <= bounds.maxX; bx++) if (!['grass', 'sand', 'road'].includes(this.tile(bx, by)) || this.occupiedCells.has(by * n + bx)) return false;
    return true;
  }
  nearestBuildingSite(type, point, requireExit = false, clearance = 0) {
    const n = this.map.size; for (let r = 0; r < Math.min(n, 64); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue; const x = Math.round(point.x) + dx, y = Math.round(point.y) + dy;
      if (this.canPlaceBuilding(type, x, y)) {
        const bounds = buildingBounds(type, x, y), site = { x: bounds.x, y: bounds.y };
        let open = true;
        for (let by = bounds.minY - clearance; by <= bounds.maxY + clearance && open; by++) for (let bx = bounds.minX - clearance; bx <= bounds.maxX + clearance; bx++) if (this.blocked(bx, by) || this.occupiedCells.has(by * n + bx)) { open = false; break; }
        if (open && (!requireExit || this.buildingExit({ type, ...site }))) return site;
      }
    }
    return null;
  }
  nearestOpen(p) {
    const n = this.map.size; for (let r = 0; r < n; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = clamp(Math.round(p.x) + dx, 0, n - 1), y = clamp(Math.round(p.y) + dy, 0, n - 1);
      if (!this.blocked(x, y)) return { x, y };
    }
    return null;
  }
  addBuilding(type, team, x, y, complete = false) {
    if (!this.canPlaceBuilding(type, x, y)) return null; const bounds = buildingBounds(type, x, y); x = bounds.x; y = bounds.y;
    const spec = BUILDINGS[type], hp = Math.round(spec.hp * this.modifiers(team).buildingHp), b = { id: this.nextId++, kind: 'building', type, team, x, y, hp: complete ? hp : 40, maxHp: hp, progress: complete ? 1 : 0, queue: [], rally: null, cooldown: 0 };
    b.garrisoned = []; if (type === 'farm') b.foodRemaining = 175 + (this.modifiers(team).farmFood || 0);
    this.buildings.push(b); this.entities.set(b.id, b);
    for (let by = bounds.minY; by <= bounds.maxY; by++) for (let bx = bounds.minX; bx <= bounds.maxX; bx++) { const key = by * this.map.size + bx; this.occupiedCells.set(key, b.id); if (type !== 'farm' && type !== 'gate') this.blockedCells.add(key); }
    if (type !== 'farm' && type !== 'gate') for (const u of this.units) if (!u.garrison && this.blocked(u.x, u.y)) { const p = this.nearestOpen(u); if (p) Object.assign(u, p); u.path = []; u.pathGoal = null; u.repath = 0; }
    return b;
  }
  buildingExit(building) {
    const bounds = buildingBounds(building.type, building.x, building.y), preferred = { x: bounds.maxX + 1, y: bounds.maxY + 1 }; if (!this.blocked(preferred.x, preferred.y)) return preferred;
    for (let y = bounds.minY - 1; y <= bounds.maxY + 1; y++) for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x++) if ((x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) && !this.blocked(x, y)) return { x, y };
    return null;
  }
  spawn(id, team, p) {
    const blueprint = this.effectiveBlueprint(id, team); if (!blueprint || !p || blueprint.hero && team !== 0) return null;
    p = this.nearestOpen(p); if (!p) return null;
    const u = { id: this.nextId++, kind: 'unit', team, blueprint, x: p.x, y: p.y, hp: blueprint.hp, maxHp: blueprint.hp, order: null, queued: [], path: [], repath: 0, cooldown: 0, autoTimer: (this.nextId % 10) / 10, carried: 0, carrying: null, work: 0, stance: 'aggressive', attackAnimation: 0, hitAnimation: 0, packed: Boolean(blueprint.packed) };
    this.units.push(u); this.entities.set(u.id, u); return u;
  }
  population(team) { return this.units.filter(u => u.team === team && u.hp > 0).length; }
  capacity(team) { return Math.min(team === 0 ? this.project.rules.population : this.project.rules.enemyPopulation ?? 200, this.buildings.reduce((a, b) => a + (b.team === team && b.hp > 0 && b.progress === 1 ? BUILDINGS[b.type].pop : 0), 0)); }
  entity(id) { const e = this.entities.get(id); return e && e.hp > 0 ? e : null; }
  canPay(team, cost) { return Object.entries(cost).every(([k, v]) => this.stocks[team][k] >= v); }
  pay(team, cost) { for (const [k, v] of Object.entries(cost)) this.stocks[team][k] -= v; }
  train(buildingId, unitId) {
    const b = this.entity(buildingId), bp = b && this.effectiveBlueprint(unitId, b.team);
    if (!b || b.kind !== 'building' || b.progress < 1 || !bp || !this.availableUnits(b.team, b.type).some(u => u.id === unitId)) return '這棟建築無法訓練這個兵種。';
    if (bp.hero && (this.units.some(u => u.team === b.team && u.blueprint.id === bp.id) || this.buildings.some(x => x.team === b.team && x.queue.some(q => q.unitId === bp.id)))) return '這位英雄已在戰場或訓練中。';
    if (b.queue.length >= 30) return '訓練佇列已滿。';
    const cost = { food: bp.food, gold: bp.gold, wood: bp.wood || 0 }; if (!this.canPay(b.team, cost)) return '生產資源不足。';
    this.pay(b.team, cost); b.queue.push({ unitId, left: bp.time, time: bp.time, cost: clone(cost) }); return null;
  }
  cancelTrain(buildingId, index) { const b = this.entity(buildingId); const q = b?.queue?.splice(index, 1)[0]; if (q) { const u = this.project.units.find(u => u.id === q.unitId), cost=q.cost||{food:u.food,gold:u.gold,wood:u.wood||0}; for(const [resource,amount] of Object.entries(cost)) this.stocks[b.team][resource]+=amount; } }
  build(workerIds, type, x, y, queued = false) {
    const worker = this.units.find(u => workerIds.includes(u.id) && u.blueprint.role === 'worker' && u.hp > 0 && !u.garrison);
    if (!worker) return '請先選取村民。';
    const spec = BUILDINGS[type]; if (!this.canPlaceBuilding(type, x, y)) return '建築的完整占地需要放在空地。';
    const bounds = buildingBounds(type, x, y); x = bounds.x; y = bounds.y;
    if ((spec.age || 0) > this.ages[worker.team]) return '需要先升至下一個時代。';
    if (!this.buildRequirements(worker.team,type)) return `需要先完成${BUILDINGS[spec.requires].name}。`;
    if (!this.canPay(worker.team, spec.cost)) return '建造資源不足。';
    const target = { kind: 'building', type, x, y }; if (!['farm', 'gate'].includes(type) && !this.buildingExit(target) || !findPath(worker, target, this.map.size, (a, b) => this.blocked(a, b) || !['farm', 'gate'].includes(type) && a >= bounds.minX && a <= bounds.maxX && b >= bounds.minY && b <= bounds.maxY, 1.5)) return '村民無法到達這裡。';
    this.pay(worker.team, spec.cost); const b = this.addBuilding(type, worker.team, x, y);
    this.command(workerIds.filter(id => this.entity(id)?.blueprint?.role === 'worker'), { type: 'build', target: b.id }, queued); return null;
  }
  buildWall(workerIds, start, end, queued = false) {
    const steps=Math.max(Math.abs(end.x-start.x),Math.abs(end.y-start.y));
    let count=0;
    for (let i=0;i<=Math.min(steps,40);i++) {
      const x=Math.round(start.x+(end.x-start.x)*i/(steps||1)), y=Math.round(start.y+(end.y-start.y)*i/(steps||1));
      const error=this.build(workerIds,'wall',x,y,queued||count>0);
      if (error) return {count,error}; count++;
    }
    return {count,error:steps>40?'一次最多排程 41 段城牆。':null};
  }
  buildRequirements(team, type) { const prerequisite=BUILDINGS[type]?.requires;return !prerequisite || this.buildings.some(b=>b.team===team&&b.type===prerequisite&&b.hp>0&&b.progress===1); }
  command(ids, order, queued = false) {
    if (order && ['move', 'attackMove', 'patrol'].includes(order.type) && this.blocked(order.x, order.y)) { const p = this.nearestOpen(order); if (!p) return; order = { ...order, ...p }; }
    for (const id of ids) { const u = this.entity(id); if (!u || u.kind !== 'unit' || u.garrison) continue;
      if (queued && u.order?.type === 'patrol' && order?.type === 'patrol') { if (u.order.points.length < 40) u.order.points.push({ x: order.x, y: order.y }); }
      else if (queued && order && u.order) { if (u.queued.length < 40) u.queued.push(clone(order)); }
      else { u.order = clone(order); u.queued = []; this.resetOrder(u); }
    }
  }
  resetOrder(u) {
    this.routeSearches?.delete(u.id);
    u.waitingDropoff = false;
    u.path = []; u.pathGoal = null; u.repath = 0; u.work = 0; u.autoTarget = null; u.combatOrigin = null; u.combatReturning = false; u.autoTimer = 0; u.failed = false;
    if (u.order?.type === 'patrol' && !u.order.points) { u.order.origin = { x: u.x, y: u.y }; u.order.points = [clone(u.order.origin), { x: u.order.x, y: u.order.y }]; u.order.pointIndex = 1; u.order.direction = 1; }
  }
  finish(u) { u.order = u.queued.shift() || null; this.resetOrder(u); }
  nearestDropoff(u, type = u.carrying, exclude = null) {
    const sites = this.buildings.filter(b => b.team === u.team && b.progress === 1 && b.hp > 0 && BUILDINGS[b.type].dropoff?.includes(type) && b.id !== exclude).sort((a, b) => goalDistance(u, a) - goalDistance(u, b));
    return sites.find(b => findPath(u, b, this.map.size, (x, y) => this.blocked(x, y), 1.6)) || null;
  }
  deliver(u, resume = null, exclude = null) {
    const site = this.nearestDropoff(u, u.carrying, exclude);
    if (!site) {u.waitingDropoff = true;return false;}
    u.order = { type: 'deliver', target: site.id, resume: clone(resume) }; this.resetOrder(u); return true;
  }
  deleteEntity(id) {
    const e = this.entity(id); if (!e) return;
    if (e.kind === 'building' && e.progress < 1) for (const [resource, amount] of Object.entries(BUILDINGS[e.type].cost)) this.stocks[e.team][resource] += amount * Math.max(0, 1 - e.progress);
    e.hp = 0;
  }
  pack(u, packed) {
    if (!u.blueprint.packed || u.packed === packed) return;
    u.packFrom = u.packed; u.packed = packed; u.packLeft = u.blueprint.packTime || 5; u.path = []; u.pathGoal = null;
  }
  reformFormation(ids, formation) {
    const units = ids.map(id => this.entity(id)).filter(u => u?.kind === 'unit' && !u.garrison);
    if (units.length < 2) return;
    const moving = units.filter(u => ['move', 'attackMove'].includes(u.order?.type));
    const point = moving.length ? { x: moving.reduce((s, u) => s + u.order.x, 0) / moving.length, y: moving.reduce((s, u) => s + u.order.y, 0) / moving.length } : { x: units.reduce((s, u) => s + u.x, 0) / units.length, y: units.reduce((s, u) => s + u.y, 0) / units.length };
    const orders = new Map(units.map(u => [u.id, { current: clone(u.order), queue: clone(u.queued) }]));
    this.moveFormation(ids, point, formation, false, moving.some(u => u.order.type === 'attackMove'));
    for (const u of units) {
      const previous = orders.get(u.id); u.formation = formation;
      if (previous.current && !['move', 'attackMove'].includes(previous.current.type)) { u.order = previous.current; this.resetOrder(u); }
      u.queued = previous.queue;
    }
  }
  farmWorker(farm, exceptId = null) {
    return this.units.find(u => u.id !== exceptId && u.hp > 0 && !u.garrison && u.team === farm.team && (u.order?.type === 'gather' && u.order.target === farm.id || u.order?.type === 'deliver' && u.order.resume?.target === farm.id));
  }
  depositCarried(u) {
    if (u.carried && ['wood','food','gold','stone'].includes(u.carrying)) this.stocks[u.team][u.carrying] += u.carried;
    u.carried = 0; u.carrying = null;
  }
  finishConstruction(u, building) {
    if (building?.progress === 1 && (BUILDINGS[building.type].dropoff || building.type === 'farm')) this.depositCarried(u);
    // A single villager stays on each farm while the rest of the group continues its farm queue.
    const next = u.queued[0], nextBuilding = next?.type === 'build' && this.entity(next.target);
    if (building?.type === 'farm' && building.progress === 1 && !this.farmWorker(building, u.id) && (!next || nextBuilding?.type === 'farm')) {
      u.order = { type: 'gather', target: building.id }; this.resetOrder(u); return;
    }
    this.finish(u);
    if (u.order || !building || building.progress !== 1) return;
    const candidates = this.buildings.filter(b => b.team === u.team && b.hp > 0 && b.progress < 1 && buildingDistance(u, b) <= 8).sort((a, b) => buildingDistance(u, a) - buildingDistance(u, b));
    for (const b of candidates) {
      if (!findPath(u, b, this.map.size, (x, y) => this.blocked(x, y), 1.6)) continue;
      u.order = { type: 'build', target: b.id }; this.resetOrder(u); return;
    }
    const freeFarm = this.buildings.filter(b => b.type === 'farm' && b.team === u.team && b.hp > 0 && b.progress === 1 && buildingDistance(u, b) <= 8 && !this.farmWorker(b, u.id)).sort((a, b) => buildingDistance(u, a) - buildingDistance(u, b)).find(b => findPath(u, b, this.map.size, (x, y) => this.blocked(x, y), .7));
    if (freeFarm && building.type === 'farm') { u.order = { type: 'gather', target: freeFarm.id }; this.resetOrder(u); return; }
    for (const type of BUILDINGS[building.type].dropoff || []) {
      if (building.type === 'town') break;
      const resource = this.closestResource(u, type);
      if (resource) { u.order = { type: 'gather', ...resource }; this.resetOrder(u); return; }
    }
  }
  moveFormation(ids, point, formation = 'line', queued = false, attackMove = false) {
    const units = ids.map(id => this.entity(id)).filter(u => u?.kind === 'unit' && !u.garrison); if (!units.length) return;
    if (units.length === 1) { const p = this.nearestOpen(point); if (p) this.command(ids, { type: attackMove ? 'attackMove' : 'move', ...p }, queued); return; }
    const position = u => queued ? [u.order, ...u.queued].findLast(o => o && ['move', 'attackMove'].includes(o.type)) || u : u;
    const center = { x: units.reduce((v, u) => v + position(u).x, 0) / units.length, y: units.reduce((v, u) => v + position(u).y, 0) / units.length }, d = Math.max(.001, distance(center, point)), forward = { x: (point.x - center.x) / d, y: (point.y - center.y) / d }, side = { x: -forward.y, y: forward.x };
    if (d === .001) { forward.x = 0; forward.y = -1; side.x = 1; side.y = 0; }
    const priority = u => u.blueprint.role === 'melee' ? 0 : u.blueprint.role === 'ranged' ? 1 : 2;
    const width = Math.min(units.length, Math.ceil(Math.sqrt(units.length) * (formation === 'line' || formation === 'spread' ? 2 : 1))), spacing = formation === 'spread' ? 2 : 1.2, slots = [], reserved = new Set(), speed = Math.min(...units.map(u => u.blueprint.speed)), rowCounts = [];
    for (const count of formation === 'box' ? [units.length] : [0, 1, 2].map(rank => units.filter(u => priority(u) === rank).length)) for (let remaining = count; remaining > 0; remaining -= width) rowCounts.push(Math.min(width, remaining));
    for (let row = 0; row < rowCounts.length; row++) for (let i = 0; i < rowCounts[row]; i++) { const count = rowCounts[row], flank = formation === 'flank' ? (i < count / 2 ? -2 : 2) : 0, across = (i - (count - 1) / 2) * spacing + flank, depth = ((rowCounts.length - 1) / 2 - row) * spacing; slots.push({ x: point.x + side.x * across + forward.x * depth, y: point.y + side.y * across + forward.y * depth, depth }); }
    units.sort((a, b) => priority(a) - priority(b) || b.blueprint.armor - a.blueprint.armor || b.maxHp - a.maxHp);
    if (formation === 'box') slots.sort((a, b) => distance(b, point) - distance(a, point));
    for (const u of units) {
      const front = formation === 'box' ? slots[0] : slots.reduce((a, b) => a.depth > b.depth ? a : b), candidates = formation === 'box' ? slots.filter(s => Math.abs(distance(s, point) - distance(front, point)) < .1) : slots.filter(s => Math.abs(s.depth - front.depth) < .1), slot = candidates.sort((a, b) => distance(position(u), a) - distance(position(u), b))[0];
      slots.splice(slots.indexOf(slot), 1); let destination = null;
      for (let r = 0; r < Math.ceil(Math.sqrt(units.length)) + 8 && !destination; r++) for (let dy = -r; dy <= r && !destination; dy++) for (let dx = -r; dx <= r; dx++) { if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue; const x = clamp(Math.round(slot.x) + dx, 0, this.map.size - 1), y = clamp(Math.round(slot.y) + dy, 0, this.map.size - 1), key = y * this.map.size + x; if (!this.blocked(x, y) && !reserved.has(key)) { destination = { x, y }; reserved.add(key); break; } }
      if (destination) this.command([u.id], { type: attackMove ? 'attackMove' : 'move', ...destination, speed }, queued);
    }
  }
  closestResource(u, type = null) {
    let best = null, d = Infinity, n = this.map.size;
    const r = Math.min(n, 55); for (let y = Math.max(0, Math.round(u.y) - r); y <= Math.min(n - 1, Math.round(u.y) + r); y++) for (let x = Math.max(0, Math.round(u.x) - r); x <= Math.min(n - 1, Math.round(u.x) + r); x++) if (this.amountAt(x, y) > 0 && (!type || RESOURCE[this.tile(x, y)] === type)) { const p = { x, y }, dd = distance(u, p); if (dd < d) { d = dd; best = p; } }
    return best;
  }
  updateSpatial() {
    this.spatial.clear(); for (const e of [...this.units, ...this.buildings]) if (e.hp > 0 && !e.garrison) {
      const bounds = e.kind === 'building' ? buildingBounds(e.type, e.x, e.y) : { minX: e.x, maxX: e.x, minY: e.y, maxY: e.y };
      for (let y = Math.floor(bounds.minY / 4); y <= Math.floor(bounds.maxY / 4); y++) for (let x = Math.floor(bounds.minX / 4); x <= Math.floor(bounds.maxX / 4); x++) { const key = `${x},${y}`; if (!this.spatial.has(key)) this.spatial.set(key, []); this.spatial.get(key).push(e); }
    }
  }
  nearby(p, range, team, friendly = false, allowed = null) {
    let best = null, d = range; const bounds = p.kind === 'building' ? buildingBounds(p.type, p.x, p.y) : { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y }, margin = range + (p.kind === 'building' ? .5 : 0);
    for (let y = Math.floor((bounds.minY - margin) / 4); y <= Math.floor((bounds.maxY + margin) / 4); y++) for (let x = Math.floor((bounds.minX - margin) / 4); x <= Math.floor((bounds.maxX + margin) / 4); x++) {
      for (const e of this.spatial.get(`${x},${y}`) || []) if (e.hp > 0 && (friendly ? this.isAlly(e.team, team) && e.hp < e.maxHp && e.kind === 'unit' : this.isEnemy(e.team, team)) && (!allowed || allowed(e))) { const dd = goalDistance(p, e); if (dd < d) { best = e; d = dd; } }
    }
    return best;
  }
  setFog(enabled) { this.project.rules.fog = Boolean(enabled); this.updateVision(); }
  updateVision() {
    const n = this.map.size;
    if (this.project.rules.fog && this.fullVision) { this.visible.fill(0); this.fullVision=false; }
    if (!this.fullVision) for (const i of this.visionCells || []) this.visible[i]=0;
    this.visionCells=new Set();
    for (const e of [...this.units, ...this.buildings]) if (e.team === 0 && e.hp > 0 && !e.garrison) { const r = e.kind === 'building' ? 7 : 5, x0 = Math.round(e.x), y0 = Math.round(e.y); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < n && y < n && dx * dx + dy * dy <= r * r) { const i=y*n+x; this.visible[i]=1; this.explored[i]=1; this.visionCells.add(i); } } }
    if (!this.project.rules.fog && !this.fullVision) { this.visible.fill(1); this.fullVision=true; }
  }
  isVisible(e) { return e.team === 0 || Boolean(this.visible[clamp(Math.round(e.y), 0, this.map.size - 1) * this.map.size + clamp(Math.round(e.x), 0, this.map.size - 1)]); }
  walk(u, goal, radius, dt) {
    if (goalDistance(u, goal) <= radius + 0.03) return true;
    if (u.pathGoal && (distance(u.pathGoal, goal) > (distance(u,goal)>64?8:.75) || u.pathGoal.radius !== radius)) { u.path = []; u.repath = 0; this.routeSearches?.delete(u.id); }
    u.repath -= dt;
    if (!u.path.length && u.repath <= 0 && this.pathBudget > 0 && performance.now() < this.pathDeadline) {
      this.pathBudget--;
      this.routeSearches ||= new Map();
      let search = this.routeSearches.get(u.id), path;
      if (search) path = search.step();
      else {
        path = findPath(u, goal, this.map.size, (x,y) => this.blocked(x,y), radius);
        if (!path && this.map.size > 128 && this.routeSearches.size < 8) {
          search = createRouteSearch(u, goal, this.map.size, (x,y) => this.blocked(x,y), goalDistance, radius);
          this.routeSearches.set(u.id, search); path = search.step();
        }
      }
      if (search?.finished) this.routeSearches.delete(u.id);
      if (path !== undefined) { const initial={x:Math.round(u.x),y:Math.round(u.y)}; u.path=path?.length===0&&!this.blocked(initial.x,initial.y)?[initial]:path||[];u.repath=path?0:1.5;u.failed=!path; }
      u.pathGoal = {x:goal.x,y:goal.y,radius};
    }
    if (!u.path.length) return false;
    const p = u.path[0]; if (this.blocked(p.x, p.y)) { u.path = []; u.repath = 0; return false; }
    const dd = distance(u, p), step = (goal === u.order && u.order.speed || u.blueprint.speed) * dt;
    if (dd <= step) { u.x = p.x; u.y = p.y; u.path.shift(); } else { u.x += (p.x - u.x) * step / dd; u.y += (p.y - u.y) * step / dd; }
    return false;
  }
  autoAllowed(u, target) {
    if (u.blueprint.role === 'healer' ? !this.isAlly(u.team, target.team) : !this.isEnemy(u.team, target.team)) return false;
    if (u.stance === 'stand' && goalDistance(u, target) > u.blueprint.range) return false;
    if (u.stance === 'defensive' && goalDistance(u.combatOrigin || u, target) > 3 + u.blueprint.range) return false;
    if (u.order?.type === 'guard') { const protectedUnit = this.entity(u.order.target); if (!protectedUnit || !this.isAlly(protectedUnit.team, u.team) || distance(protectedUnit, target) > 5 + u.blueprint.range) return false; }
    if (u.order?.type === 'patrol' && routeDistance(target, u.order.points) > 6) return false;
    return true;
  }
  strike(e, target, attack, range, cooldown) {
    if (e.cooldown > 0 || !this.isEnemy(e.team, target.team)) return;
    if (e.blueprint?.role === 'ranged' && e.blueprint.family !== 'siege' && target.path?.length && !this.modifiers(e.team).accuracy && ((e.shots = (e.shots || 0) + 1) % 3 === 0)) { e.cooldown = cooldown; e.attackAnimation = .55; e.facing = { x: target.x - e.x, y: target.y - e.y }; this.effects.push({ type: 'arrow', x: e.x, y: e.y, tx: target.x + .8, ty: target.y, age: 0, team: e.team }); return; }
    const bp = e.blueprint, damage = this.damage(e, target, attack) * (e.kind === 'building' ? this.projectileCount(e) : 1);
    target.hp -= damage; target.hitAnimation = .25; e.cooldown = cooldown; e.attackAnimation = .55;
    e.facing = { x: target.x - e.x, y: target.y - e.y };
    if (target.team === 0 && this.time - (this.lastAlert ?? -10) > 10) { this.lastAlert = this.time; this.note('我方遭到攻擊。Home 可移到戰鬥位置。', target); }
    if (bp?.splash) for (const u of this.units) if (!u.garrison && u.hp > 0 && u.id !== e.id && u.id !== target.id && distance(u, target) < bp.splash) { u.hp -= this.damage(e, u, attack) * (1 - distance(u, target) / bp.splash); u.hitAnimation = .25; }
    this.effects.push({ type: bp?.family === 'siege' && range > 2 ? 'rock' : range > 2 ? 'arrow' : 'hit', x: e.x, y: e.y, tx: target.x, ty: target.y, age: 0, team: e.team });
  }
  projectileCount(b) { return Math.min(b.type==='castle'?10:b.type==='town'?10:5,(b.type==='castle'?5:1)+Math.floor((b.garrisoned?.length||0)/2)); }
  damage(attacker, target, attack = attacker.blueprint?.attack || 0) {
    const bp = attacker.blueprint, defense = target.blueprint || BUILDINGS[target.type], pierce = (bp?.attackType || (bp?.role === 'ranged' && bp.family !== 'siege' ? 'pierce' : 'melee')) === 'pierce' || attacker.kind === 'building';
    const armor = pierce && target.blueprint?.packed && (target.packLeft > 0 ? target.packFrom : target.packed) ? 150 : pierce ? defense?.pierceArmor ?? defense?.armor ?? 0 : defense?.armor ?? 0;
    let damage = Math.max(1, attack - armor);
    if (target.kind === 'building') damage += bp?.buildingBonus ?? (bp?.bonus === 'building' ? 45 : 0);
    if (target.blueprint?.family === 'cavalry') damage += bp?.cavalryBonus ?? (bp?.bonus === 'cavalry' ? 25 : 0);
    if (target.blueprint?.family === 'archer') damage += bp?.archerBonus ?? (bp?.bonus === 'archer' ? 8 : 0);
    return damage;
  }
  attackReady(u, target, dt) {
    const bp = u.blueprint, d = goalDistance(u, target);
    if (d < (bp.minRange || 0)) {
      if (u.stance !== 'stand') { const length = distance(u, target) || 1, retreat = this.nearestOpen({ x: u.x + (u.x - target.x || 1) / length * (bp.minRange + 1), y: u.y + (u.y - target.y) / length * (bp.minRange + 1) }); if (retreat) this.walk(u, retreat, .2, dt); }
      return false;
    }
    if (d > bp.range) {
      if (u.stance === 'stand' && u.autoTarget) return false;
      if (bp.packed && !u.packed) { this.pack(u, true); return false; }
      return this.walk(u, target, bp.range, dt);
    }
    if (bp.packed && u.packed) { this.pack(u, false); return false; }
    return !(u.packLeft > 0);
  }
  tick(dt) {
    if (this.result) return; this.time += dt; this.pathBudget = this.map.size > 128 ? 4 : 12; this.pathDeadline=performance.now()+3; this.updateSpatial();
    for (const u of this.units) if (u.hp > 0 && u.blueprint.hero) u.hp = Math.min(u.maxHp, u.hp + u.blueprint.regen * dt);
    for (const b of this.buildings) if (b.hp > 0) {
      b.cooldown = Math.max(0, b.cooldown - dt);
      if (b.research) { b.research.left -= dt; if (b.research.left <= 0) { this.completeResearch(b.team, b.research.id); b.research = null; } }
      if (!b.research && b.progress === 1 && b.queue.length && this.population(b.team) < this.capacity(b.team)) {
        const q = b.queue[0]; q.left = Math.max(0, q.left - dt * (this.project.units.find(u => u.id === q.unitId)?.role === "worker" ? 1 : this.modifiers(b.team).trainSpeed));
        if (q.left <= 0) { const exit = this.buildingExit(b); if (exit) { const u = this.spawn(q.unitId, b.team, exit); b.queue.shift(); if (u && b.rally) this.command([u.id], b.rally); } }
      }
      const spec = BUILDINGS[b.type], m=this.modifiers(b.team), attack = b.type==='town'&&!b.garrisoned.length?0:(spec.attack||0)+(spec.attack?(m.rangedAttack||0):0),range=(spec.range||6)+(b.type==='town'?0:m.rangedRange||0); if (b.progress === 1 && attack) { const target = this.nearby(b, range, b.team); if (target) this.strike(b, target, attack, range, 2); }
    }
    for (const u of this.units) if (u.hp > 0 && !u.garrison) {
      u.cooldown = Math.max(0, u.cooldown - dt); u.attackAnimation = Math.max(0, u.attackAnimation - dt); u.hitAnimation = Math.max(0, u.hitAnimation - dt); u.autoTimer -= dt;
      const bp = u.blueprint;
      if (bp.canConvert) u.faith = Math.min(100, (u.faith ?? 100) + dt * 100 / 62);
      if (u.packLeft > 0) { u.packLeft = Math.max(0, u.packLeft - dt); continue; }
      const eligible = !u.order || ['attackMove', 'patrol', 'guard'].includes(u.order.type);
      if (u.combatReturning) { if (this.walk(u, u.combatOrigin, .2, dt)) { u.combatReturning = false; u.combatOrigin = null; u.path = []; u.pathGoal = null; u.autoTimer = 0; } else continue; }
      const previous = this.entity(u.autoTarget);
      if (eligible && u.autoTarget && (!previous || !this.autoAllowed(u, previous) || bp.role === 'healer' && previous.hp >= previous.maxHp)) {
        u.autoTarget = null; u.path = []; u.pathGoal = null; u.repath = 0;
        if (u.stance === 'defensive' && u.combatOrigin && distance(u, u.combatOrigin) > .2) { u.combatReturning = true; continue; }
        u.combatOrigin = null;
      }
      if (u.autoTimer <= 0) {
        u.autoTimer = 0.6;
        if (eligible && u.stance !== 'passive' && !u.autoTarget) {
          const t = bp.role === 'healer' ? this.nearby(u, 6, u.team, true, target => this.autoAllowed(u, target)) : bp.role !== 'worker' ? this.nearby(u, u.stance === 'stand' ? bp.range : 6, u.team, false, target => this.autoAllowed(u, target)) : null;
          if (t) { u.autoTarget = t.id; u.combatOrigin ||= { x: u.x, y: u.y }; }
        }
      }
      let o = u.order, auto = this.entity(u.autoTarget);
      if (eligible && auto && auto.hp > 0 && u.stance !== 'passive') {
        if (bp.role === 'healer' && this.isAlly(auto.team, u.team)) { if (this.walk(u, auto, bp.range, dt) && u.cooldown <= 0) { auto.hp = Math.min(auto.maxHp, auto.hp + bp.attack); u.cooldown = bp.cooldown; u.attackAnimation = .55; this.effects.push({ type: 'heal', x: auto.x, y: auto.y, age: 0 }); } }
        else if (this.attackReady(u, auto, dt)) this.strike(u, auto, bp.attack, bp.range, bp.cooldown);
        if (!(u.stance === 'stand' && o?.type === 'patrol')) continue;
      }
      if (!o) continue;
      if (o.type === 'autoScout') {
        if (!o.goal || goalDistance(u,o.goal)<.4 || u.failed) {
          const radius=18+(u.scoutStep||0)%5*8; u.scoutStep=(u.scoutStep||0)+1;
          let goal=null;
          for (let i=0;i<16;i++) { const angle=(u.scoutStep+i)*2.39996, p={x:clamp(Math.round(u.x+Math.cos(angle)*radius),1,this.map.size-2),y:clamp(Math.round(u.y+Math.sin(angle)*radius),1,this.map.size-2)}; if (!this.blocked(p.x,p.y)&&(!this.explored[p.y*this.map.size+p.x]||i===15)) { goal=p; break; } }
          o.goal=goal; u.path=[]; u.pathGoal=null; u.repath=0; u.failed=false;
        }
        if (o.goal) this.walk(u,o.goal,.3,dt);
      } else if (o.type === 'attackGround' && (bp.attackGround || bp.splash)) {
        if (this.attackReady(u, o, dt) && u.cooldown <= 0) {
          for (const target of [...this.units, ...this.buildings]) if (!target.garrison && target.id !== u.id && target.hp > 0 && goalDistance(target, o) <= (bp.splash || .3)) { target.hp -= this.damage(u, target); target.hitAnimation = .25; }
          u.cooldown = bp.cooldown; u.attackAnimation = .55; this.effects.push({type:'rock',x:u.x,y:u.y,tx:o.x,ty:o.y,age:0,team:u.team});
        }
      } else if (o.type === 'move' || o.type === 'attackMove') { if (bp.packed && !u.packed) { this.pack(u, true); continue; } if (this.walk(u, o, 0.2, dt)) this.finish(u); }
      else if (o.type === 'attack') {
        const target = this.entity(o.target); if (!target || target.garrison || !this.isEnemy(u.team, target.team)) this.finish(u); else if (this.attackReady(u, target, dt)) this.strike(u, target, bp.attack, bp.range, bp.cooldown);
      } else if (o.type === 'gather' && bp.role === 'worker') {
        const farm = o.target ? this.entity(o.target) : null;
        if (o.target && !farm) { if (u.carried && this.deliver(u)) continue; this.finish(u); continue; }
        const point = farm || o, i = point.y * this.map.size + point.x, type = farm?.type === 'farm' ? 'food' : RESOURCE[this.tile(o.x, o.y)], remaining = farm ? farm.foodRemaining : this.amountAt(o.x, o.y);
        if (farm && (farm.team !== u.team || this.farmWorker(farm, u.id)?.id < u.id)) { this.finish(u); continue; }
        const capacity = 10 * this.modifiers(u.team).carry;
        if (u.carried >= capacity - .001 && (!type || u.carrying === type)) { u.work += dt; if (u.work >= 1) { u.work = 0; this.deliver(u, o); } continue; }
        if (!type || remaining <= 0) {
          if (u.carried && this.deliver(u, o)) continue;
          if (farm && this.canPay(u.team, { wood: 60 })) { this.pay(u.team, { wood: 60 }); farm.foodRemaining = 175 + (this.modifiers(u.team).farmFood || 0); }
          else { const next = this.closestResource(u, u.carrying); if (next && !u.queued.length) { u.order = { type: 'gather', ...next }; this.resetOrder(u); } else this.finish(u); } continue;
        }
        if (this.walk(u, point, farm ? .7 : 1.5, dt)) {
          if (u.carrying && u.carrying !== type) u.carried = 0;
          const rate = farm ? .32 : {wood:.39,food:.33,gold:.38,stone:.36}[type], take = Math.min(capacity - u.carried, remaining, rate * dt * this.modifiers(u.team).gather[type]);
          if (farm) farm.foodRemaining -= take; else this.amounts[i] = remaining - take;
          u.carried += take; u.carrying = type; u.attackAnimation = .55;
          if (u.carried >= capacity - .001 || remaining - take <= .001) this.deliver(u, o);
          if (!farm && remaining - take <= .001) setTile(this.map, point.x, point.y, 'grass');
        }
      } else if (o.type === 'deliver') {
        const b = this.entity(o.target);
        if (!b || b.team !== u.team || b.progress < 1 || !BUILDINGS[b.type].dropoff?.includes(u.carrying) || u.failed) {
          if (!this.deliver(u, o.resume, o.target)) { u.order = o.resume || {type:'waitDropoff',resume:null}; this.resetOrder(u); }
        } else if (this.walk(u, b, 1.6, dt)) { this.depositCarried(u); if (o.resume) { u.order = o.resume; this.resetOrder(u); } else this.finish(u); }
      } else if (o.type === 'waitDropoff') { u.work += dt; if (u.work >= 1) { u.work = 0; this.deliver(u, o.resume); } }
      else if (o.type === 'build' && bp.role === 'worker') { const b = this.entity(o.target); if (!b || b.team !== u.team) this.finish(u); else if (b.progress === 1) this.finishConstruction(u, b); else if (this.walk(u, b, 1.6, dt)) { const before = b.progress; b.progress = Math.min(1, b.progress + dt / BUILDINGS[b.type].time); b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * (b.maxHp - 40)); u.attackAnimation = .55; if (b.progress === 1) { if (b.team === 0) this.note(`${BUILDINGS[b.type].name}完工。`, b); this.finishConstruction(u, b); } } }
      else if (o.type === 'heal' && bp.role === 'healer') { const t = this.entity(o.target); if (!t || !this.isAlly(t.team, u.team)) this.finish(u); else if (this.walk(u, t, bp.range, dt) && u.cooldown <= 0) { t.hp = Math.min(t.maxHp, t.hp + bp.attack); u.cooldown = bp.cooldown; u.attackAnimation = .55; this.effects.push({ type: 'heal', x: t.x, y: t.y, age: 0 }); } }
      else if (o.type === 'patrol') { if (this.walk(u, o, .3, dt)) { const last = o.points.length - 1; if (o.pointIndex === last && distance(o.points[0], o.points[last]) < .3) o.pointIndex = 1; else { if (o.pointIndex === last) o.direction = -1; if (o.pointIndex === 0) o.direction = 1; o.pointIndex += o.direction; } Object.assign(o, o.points[o.pointIndex]); u.path = []; u.pathGoal = null; u.repath = 0; } }
      else if (o.type === 'follow' || o.type === 'guard') { const t = this.entity(o.target); if (!t || o.type === 'guard' && !this.isAlly(t.team, u.team) || t.id === u.id) this.finish(u); else this.walk(u, t, o.type === 'follow' ? 5 : 2.5, dt); }
      else if (o.type === 'repair' && bp.role === 'worker') { const b = this.entity(o.target); if (!b || b.team !== u.team || b.hp >= b.maxHp) this.finish(u); else if (this.walk(u, b, 1.5, dt) && this.stocks[u.team].wood > 0) { b.hp = Math.min(b.maxHp, b.hp + dt * 35); this.stocks[u.team].wood = Math.max(0, this.stocks[u.team].wood - dt * 2); u.attackAnimation = .55; } }
      else if (o.type === 'garrison') { const b = this.entity(o.target); if (!b || b.team !== u.team || !BUILDINGS[b.type].garrison || b.garrisoned.length >= BUILDINGS[b.type].garrison) this.finish(u); else if (this.walk(u, b, 1.5, dt)) { if (BUILDINGS[b.type].dropoff?.includes(u.carrying)) this.depositCarried(u); b.garrisoned.push(u.id); u.garrison = b.id; u.x = b.x; u.y = b.y; this.finish(u); } }
      else if (o.type === 'convert' && bp.canConvert) { const t = this.entity(o.target); if (!t || !this.isEnemy(t.team, u.team) || t.kind !== 'unit' || t.blueprint.hero) this.finish(u); else if (!t.garrison && (u.faith ?? 100) >= 99.99 && this.walk(u, t, bp.range, dt)) { u.work += dt; u.attackAnimation = .55; if (u.work > (this.researched[t.team].has('faith') ? 12 : 6)) { t.team = u.team; this.command([t.id], null); u.faith = 0; this.finish(u); } } }
    }
    this.aiTimer += dt;
    if (this.project.rules.ai !== 'off' && this.aiTimer > (this.project.rules.ai === 'hard' ? 6 : 10) / (this.teams-1)) { this.aiTimer = 0; this.aiNextTeam=1+(this.aiNextTeam||0)%(this.teams-1); this.updateAI(this.aiNextTeam); }
    if (this.routeSearches) for (const id of this.routeSearches.keys()) if (!this.entity(id)) this.routeSearches.delete(id);
    for (const e of this.effects) e.age += dt; this.effects = this.effects.filter(e => e.age < 0.5).slice(-200);
    for (const u of this.units) if (u.hp <= 0 && !u.garrison) this.corpses.push({ ...u, age: 0 });
    for (const corpse of this.corpses) corpse.age += dt; this.corpses = this.corpses.filter(c => c.age < 2).slice(-120);
    const dead = this.buildings.filter(b => b.hp <= 0); for (const b of dead) { const bounds = buildingBounds(b.type, b.x, b.y); for (let y = bounds.minY; y <= bounds.maxY; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) { const key = y * this.map.size + x; this.blockedCells.delete(key); this.occupiedCells.delete(key); } for (const id of b.garrisoned) { const u = this.entity(id); if (u) { u.garrison = null; const p = this.buildingExit(b) || this.nearestOpen(b); Object.assign(u, p); } } }
    const alive = team => this.project.rules.victory === 'town' ? this.buildings.some(b => b.team === team && b.type === 'town' && b.hp > 0) : this.units.some(u => u.team === team && u.hp > 0) || this.buildings.some(b => b.team === team && b.hp > 0 && !['tower', 'wall', 'gate', 'outpost', 'farm'].includes(b.type));
    if (!alive(0)) this.result = 'defeat';
    else if (!Array.from({ length: this.teams }, (_, team) => team).some(team => this.isEnemy(0, team) && alive(team))) this.result = 'victory';
    for (const e of [...this.units, ...this.buildings]) if (e.hp <= 0) this.entities.delete(e.id);
    this.units = this.units.filter(u => u.hp > 0); this.buildings = this.buildings.filter(b => b.hp > 0);
    this.visionTimer += dt; if (this.visionTimer > 0.35) { this.visionTimer = 0; this.updateVision(); }
  }
  ungarrison(id) { const b = this.entity(id); if (!b || b.kind !== 'building') return; const exit = this.buildingExit(b); if (!exit) return; for (const uid of b.garrisoned) { const u = this.entity(uid); if (u) { u.garrison = null; Object.assign(u, exit); if (b.rally) this.command([u.id], b.rally); } } b.garrisoned = []; }
  townBell(team) {
    const workers = this.units.filter(u=>u.team===team&&u.hp>0&&u.blueprint.role==='worker');
    if (workers.some(u=>u.bellSheltered)) {
      for(const b of this.buildings.filter(b=>b.team===team))this.ungarrison(b.id);
      for(const u of workers.filter(u=>u.bellSheltered)) { this.command([u.id],u.bellResume);u.queued=u.bellQueued||[];delete u.bellResume;delete u.bellQueued;delete u.bellSheltered; }
    } else {
      const buildings = this.buildings.filter(b=>b.team===team&&BUILDINGS[b.type].garrison&&b.progress===1), reserved=new Map(buildings.map(b=>[b.id,b.garrisoned.length+workers.filter(u=>u.order?.type==='garrison'&&u.order.target===b.id).length]));
      for(const u of workers.filter(u=>!u.garrison)) {
        const b=buildings.filter(b=>reserved.get(b.id)<BUILDINGS[b.type].garrison).sort((a,b)=>goalDistance(u,a)-goalDistance(u,b))[0];
        if(b) {u.bellResume=clone(u.order);u.bellQueued=clone(u.queued);u.bellSheltered=true;reserved.set(b.id,reserved.get(b.id)+1);this.command([u.id],{type:'garrison',target:b.id});}
      }
    }
  }
  trade(team, resource, buy) { const price = buy ? 130 : 70; if (buy) { if (this.stocks[team].gold < price) return '黃金不足。'; this.stocks[team].gold -= price; this.stocks[team][resource] += 100; } else { if (this.stocks[team][resource] < 100) return '資源不足。'; this.stocks[team][resource] -= 100; this.stocks[team].gold += price; } return null; }
  updateAI(team) {
    const army = this.units.filter(u => u.team === team && u.hp > 0 && !u.garrison && u.blueprint.role !== 'worker'), workers = this.units.filter(u => u.team === team && u.hp > 0 && !u.garrison && u.blueprint.role === 'worker');
    const town = this.buildings.find(b => b.team === team && b.type === 'town' && b.hp > 0), origin = town || workers[0] || this.buildings.find(b => b.team === team);
    const cap = this.project.rules.enemyPopulation ?? 200, workerLimit = Math.min(24, Math.floor(cap / 3)), armyLimit = Math.max(0, cap - workerLimit);
    if (town && workers.length < workerLimit && town.queue.length < 2) this.train(town.id, this.project.units.find(u => u.role === 'worker' && !u.hero).id);
    for (const type of ['barracks', team === 1 ? 'archery' : 'stable', 'siege']) { const b = this.buildings.find(b => b.team === team && b.type === type && b.progress === 1); const soldiers = this.availableUnits(team, type); if (b && b.queue.length < 2 && soldiers.length && army.length < armyLimit) this.train(b.id, soldiers[Math.floor(this.time / 10) % soldiers.length].id); }
    for (const u of workers) if (!u.order || u.failed) { const resource = ['food', 'wood', 'gold', 'stone'][u.id % 4], r = this.closestResource(u, resource); if (r) this.command([u.id], { type: 'gather', ...r }); else if (resource === 'food') { const farm = this.buildings.find(b => b.team === team && b.type === 'farm' && !this.farmWorker(b)); if (farm) this.command([u.id], { type: 'gather', target: farm.id }); } }
    let worker = workers.find(u => u.order?.type !== 'build');
    if (worker && origin && !town && !this.buildings.some(b => b.team === team && b.type === 'town')) { const p = this.nearestBuildingSite('town', origin, true, 1); if (p && !this.build([worker.id], 'town', p.x, p.y)) worker = null; }
    if (worker && origin && this.capacity(team) < cap && this.capacity(team) - this.population(team) < 8 && !this.buildings.some(b => b.team === team && b.type === 'house' && b.progress < 1)) { const p = this.nearestBuildingSite('house', { x: origin.x + 9 + Math.floor(this.time / 40) % 7, y: origin.y + 3 }, true, 1); if (p && !this.build([worker.id], 'house', p.x, p.y)) worker = null; }
    if (worker && origin) for (const type of ['barracks', 'lumber', 'mill', 'mining', 'archery', 'stable', 'blacksmith', 'market', 'siege', 'monastery', 'castle', 'university']) if ((BUILDINGS[type].age || 0) <= this.ages[team] && !this.buildings.some(b => b.team === team && b.type === type)) { const p = this.nearestBuildingSite(type, { x: origin.x - 10 + Math.floor(this.time / 15) % 20, y: origin.y - 9 }, true, 1); if (p) this.build([worker.id], type, p.x, p.y); break; }
    for (const b of this.buildings.filter(b => b.team === team && b.progress === 1 && !b.research)) { const t = this.availableTech(team, b.type).find(t => this.canPay(team, t.cost)&&this.ageRequirements(team,t.id)); if (t) this.research(b.id, t.id); }
    if (this.project.rules.ai !== 'calm' && this.time > (this.project.rules.ai === 'hard' ? 40 : 70) + team * 10 && (army.length >= 8 || !town || this.time > 180)) {
      const targets = [...this.buildings, ...this.units].filter(e => e.hp > 0 && !e.garrison && this.isEnemy(team, e.team));
      const focus = origin || army[0], target = focus && targets.sort((a,b)=>(a.type==='town'?-1000:0)+goalDistance(focus,a)-((b.type==='town'?-1000:0)+goalDistance(focus,b)))[0];
      if (target) for (const u of army) if (!u.order || u.failed || !this.entity(u.order.target) && u.order.type === 'attack') this.command([u.id], {type:'attack',target:target.id});
    }
  }
}
