// Headless 1v1: one AI (team 1) against an idle human base. Usage: node ai-sim.mjs [level] [minutes] [seed]
import { World, newProject } from './core.mjs';
const [level = 'standard', minutes = '20', seed = '7'] = process.argv.slice(2);
export function simulate({ level = 'standard', minutes = 20, seed = 7, report = [5, 10, 15, 20], log = () => {} } = {}) {
  const p = newProject(1, seed); p.rules.ai = level;
  const w = new World(p), rows = [];
  // The idle human town cannot fall, so the AI keeps its objective for the whole run.
  for (const b of w.buildings) if (b.team === 0) { b.hp = b.maxHp = 1e7; }
  const count = (team, f) => w.units.filter(u => u.team === team && u.hp > 0 && f(u)).length;
  const ages = ['黑暗', '封建', '城堡', '帝王'];
  for (let t = 0; t < minutes * 600; t++) {
    w.tick(.1);
    if ((t + 1) % 600 === 0 && report.includes((t + 1) / 600)) {
      const s = w.aiStats?.[1] || {};
      rows.push({ min: (t + 1) / 600, workers: count(1, u => u.blueprint.role === 'worker'), army: count(1, u => !['worker', 'trader'].includes(u.blueprint.role)), age: ages[w.age(1)], feudalAt: s.ageUpAt?.[0] ?? null, castleAt: s.ageUpAt?.[1] ?? null, firstAttackAt: s.firstAttackAt ?? null, foundEnemyAt: s.foundEnemyAt ?? null, pop: w.population(1), cap: w.capacity(1), stock: Object.fromEntries(Object.entries(w.stocks[1]).map(([k, v]) => [k, Math.round(v)])), explored: Math.round(w.aiExploredCount / w.map.size ** 2 * 100), buildings: w.buildings.filter(b => b.team === 1 && b.progress === 1).map(b => b.type).sort().join(',') });
      log(rows.at(-1));
    }
  }
  return rows;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`level=${level} minutes=${minutes} seed=${seed}`);
  simulate({ level, minutes: Number(minutes), seed: Number(seed), log: r => console.log(JSON.stringify(r)) });
}
