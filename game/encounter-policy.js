export const MAX_ACTIVE_ENEMIES = 18;
export const MAX_COMMON_ENEMIES = 15;
export const MAX_ELITES = 2;
export const MAX_OFFICERS = 3;

const ELITE_KINDS = new Set(['elite', 'brute', 'sentinel', 'shade']);

export function countActiveEnemies(enemies) {
  let count = 0;
  for (const enemy of enemies) if (enemy.st !== 'dead') count++;
  return count;
}

export function canSpawnEnemy(enemies, kindName, role = 'regular') {
  let active = 0, common = 0, special = 0, officers = 0, roamingElites = 0;
  for (const enemy of enemies) {
    if (enemy.st === 'dead') continue;
    active++;
    if (enemy.officer || enemy.spawnRole === 'officer') officers++;
    else if (enemy.kindName.startsWith('boss') || ELITE_KINDS.has(enemy.kindName)) {
      special++;
      if (!enemy.obj && !enemy.kindName.startsWith('boss')) roamingElites++;
    } else common++;
  }
  if (active >= MAX_ACTIVE_ENEMIES) return false;

  if (role === 'officer') return officers < MAX_OFFICERS;
  if (role === 'boss') return true;
  if (ELITE_KINDS.has(kindName)) return special < MAX_ELITES && roamingElites < MAX_ELITES;
  return common < MAX_COMMON_ENEMIES;
}

export function encounterStepReady(steps, index) {
  for (let i = 0; i < index; i++) if (steps[i].state !== 'done') return false;
  return true;
}

export function hordeKindAt(progress, index) {
  const waves = progress < 0.34
    ? ['minion', 'minion', 'runner', 'minion']
    : progress < 0.67
      ? ['minion', 'runner', 'elite', 'minion']
      : ['runner', 'minion', 'elite', 'minion'];
  return waves[index % waves.length];
}

export function attackTelegraphMaxRadius(hitRange, hitAt = 0.45, duration = 0.7) {
  return Math.max(0, (hitRange - 1) / (hitAt / duration));
}
