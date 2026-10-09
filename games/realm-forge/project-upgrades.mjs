import { clone, generateMap, tileType } from './core.mjs';

const WALKABLE = new Set(['grass', 'road', 'sand']);
const INITIAL_RESOURCES = [[-5, 0, 'forest'], [-5, 1, 'forest'], [-5, 2, 'forest'], [0, 6, 'food'], [1, 6, 'food'], [6, 0, 'gold'], [6, 1, 'stone']];

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
