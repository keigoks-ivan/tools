import { clone, generateMap, tileType, setTile, enrichMapResources } from './core.mjs?v=20261009j';
import { CIV_UNITS } from './civilization.mjs?v=20261009j';
import { LEGACY_UNIT_STATS } from './balance.mjs?v=20261009j';

const WALKABLE = new Set(['grass', 'road', 'sand']);
const INITIAL_RESOURCES = [[-5, 0, 'forest'], [-5, 1, 'forest'], [-5, 2, 'forest'], [0, 6, 'food'], [1, 6, 'food'], [6, 0, 'gold'], [6, 1, 'stone']];

export function upgradeDefaultUnits(project) {
  let changed = false;
  if(!project.rules.enemyPopulationVersion){if(project.rules.enemyPopulation===200)project.rules.enemyPopulation=300;project.rules.enemyPopulationVersion=1;changed=true;}
  if(!project.rules.playerEconomyVersion){for(const r of ['wood','food','gold','stone'])project.rules.playerStartingResources[r]=Math.max(200000,project.rules.playerStartingResources[r]);project.rules.playerEconomyVersion=1;changed=true;}
  if(!project.rules.aiEconomyVersion){project.rules.starting=Math.max(20000,project.rules.starting);project.rules.aiEconomyVersion=1;changed=true;}
  for (const u of project.units) {
    const old = LEGACY_UNIT_STATS[u.id], current = CIV_UNITS.find(bp => bp.id === u.id);
    if (old && current && Object.entries(old).every(([key, value]) => u[key] === value)) {
      const { name, color, image, customColor } = u, upgrades = u.upgrades;
      Object.assign(u, clone(current), { name, color, image, customColor });
      if (upgrades?.length === 0) u.upgrades = [];
      changed = true;
    }
  }
  return changed;
}

export function preserveCustomStats(original, draft) {
  if (original && ['name','hp','attack','armor','pierceArmor','range','speed','cooldown','time','food','wood','gold'].some(key => draft[key] !== (original[key] ?? (key === 'pierceArmor' ? original.armor : 0)))) draft.upgrades = [];
  if (original && draft.color !== original.color) draft.customColor = true;
  return draft;
}

export function setEnemyCount(project, count) {
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error('敵人數量可選 1–3 個。');
  const map = clone(project.map);
  if (map.spawns.length > count + 1) map.spawns.length = count + 1;
  const n = map.size, near = Math.round(n * .22), far = Math.round(n * .78);
  const targets = [{x:far,y:near},{x:far,y:far},{x:near,y:near},{x:near,y:far}];
  while (map.spawns.length < count + 1) {
    const target = targets.find(p => map.spawns.every(s => Math.hypot(p.x-s.x,p.y-s.y) >= 12));
    if (!target) throw new Error('這張地圖沒有足夠空間放置更多敵人，請先放大地圖。');
    map.spawns.push(target);
    for (let dy=-12;dy<=12;dy++) for (let dx=-12;dx<=12;dx++) {
      const x=target.x+dx,y=target.y+dy;
      if (x>=1&&y>=1&&x<n-1&&y<n-1&&Math.hypot(dx,dy)<13) setTile(map,x,y,'grass');
    }
    // Connect an added kingdom to an existing kingdom without breaking water crossings.
    const other=map.spawns.slice(0,-1).sort((a,b)=>Math.hypot(a.x-target.x,a.y-target.y)-Math.hypot(b.x-target.x,b.y-target.y))[0];
    const steps=Math.max(Math.abs(other.x-target.x),Math.abs(other.y-target.y));
    for(let i=0;i<=steps;i++) for(let offset=-1;offset<=1;offset++) {
      const x=Math.round(target.x+(other.x-target.x)*i/(steps||1)),y=Math.round(target.y+(other.y-target.y)*i/(steps||1))+offset;
      if(x>=1&&y>=1&&x<n-1&&y<n-1&&tileType(map,x,y)!=='water') setTile(map,x,y,'road');
    }
    enrichMapResources(map);
  }
  if (['雙河谷地','三王國河谷','四王國河谷'].includes(map.name)) map.name=['雙河谷地','三王國河谷','四王國河谷'][count-1];
  map.enemyCount = count;
  return map;
}

export function upgradeLegacyMap(project) {
  const map = project?.map, n = map?.size;
  if (!Number.isInteger(n) || n <= 128 || n > 2048 || map.tiles !== null || !Number.isInteger(map.seed) || !['river', 'grass'].includes(map.template) || map.revision !== 21 || map.spawnLayoutVersion >= 2 || map.spawnPlacement === 'custom' || !Array.isArray(map.spawns) || map.spawns.length !== 3 || !map.patches || Array.isArray(map.patches)) return false;
  const c = Math.floor(n / 2), d = Math.min(90, Math.floor(n / 5));
  const spawns = [{ x: c - d, y: c + d }, { x: c + d, y: c - d }, { x: c + d + 20, y: c + d + 10 }];
  if (!spawns.every((s, i) => map.spawns[i]?.x === s.x && map.spawns[i]?.y === s.y)) return false;
  const patches = Object.fromEntries(spawns.flatMap(s => INITIAL_RESOURCES.map(([dx, dy, type]) => [(s.y + dy) * n + s.x + dx, type])));
  if (Object.keys(map.patches).length !== 21 || !Object.entries(patches).every(([i, type]) => Object.hasOwn(map.patches, i) && map.patches[i] === type)) return false;
  const generated = generateMap(n, map.seed), additions = Object.fromEntries(Object.entries(generated.patches).filter(([i]) => !Object.hasOwn(map.patches, i)));
  map.spawns = generated.spawns.map((s, i) => ({ ...map.spawns[i], ...s }));
  Object.assign(map.patches, additions);
  map.revision += Object.keys(additions).length + 1;
  map.spawnLayoutVersion = 2;
  return true;
}

export function spreadStartingPositions(project) {
  const map = project?.map, n = map?.size, count = map?.spawns?.length;
  if (!Number.isInteger(n) || n < 20 || n > 2048 || !Array.isArray(map.spawns) || count < 2 || count > 4) throw new Error('地圖需要 2–4 個王國與有效的地圖大小。');
  const near = Math.round(n * .22), far = Math.round(n * .78), targets = [{ x: near, y: far }, { x: far, y: near }, { x: far, y: far }, { x: near, y: near }];
  const positions = [], radius = Math.max(4, Math.min(96, Math.floor(n * .12)));
  const valid = (x, y) => x >= 1 && y >= 1 && x < n - 2 && y < n - 2 && WALKABLE.has(tileType(map, x, y)) && positions.every(s => Math.hypot(s.x - x, s.y - y) >= 12);
  for (const target of targets.slice(0, count)) {
    let point = null;
    for (let r = 0; r <= radius && !point; r++) for (let dy = -r; dy <= r && !point; dy++) for (let dx = -r; dx <= r; dx++) {
      if (r && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = target.x + dx, y = target.y + dy;
      if (valid(x, y)) { point = { x, y }; break; }
    }
    if (!point) throw new Error('出生點附近找不到足夠空地。請先畫出草地、道路或沙地，再分散王國出生點。');
    positions.push(point);
  }
  const next = clone(map);
  next.spawns = positions.map((s, i) => ({ ...next.spawns[i], ...s }));
  next.revision = (next.revision || 0) + 1;
  next.spawnLayoutVersion = 2;
  next.spawnPlacement = 'custom';
  return next;
}
