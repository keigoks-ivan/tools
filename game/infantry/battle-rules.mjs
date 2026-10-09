// Physical capture and resupply rules, shared by the frame loop and balance tests.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const living = enemy => !enemy.dead && !enemy.friendly;

export function captureThreat(enemies, target, { pending = 0, hurtT = Infinity, visible = () => false } = {}) {
  if (pending > 0 || hurtT < 2.5) return true;
  return enemies.some(enemy => {
    if (!living(enemy)) return false;
    const range = distance(enemy.pos, target);
    return (range < 15 && Math.abs((enemy.pos.y || 0) - (target.y || 0)) < 3) || (range < 26 && visible(enemy));
  });
}

export function resupplyBlocked(player, enemies, visible = () => true) {
  return player.dead || player.hurtT < 2.5 || enemies.some(enemy => living(enemy) && distance(enemy.pos, player.pos) < 14 && visible(enemy));
}

export function resupplyVitals(vitals, rules, field = false) {
  const heal = field ? rules.fieldHeal : rules.supplyHeal;
  const shield = field ? rules.fieldShield : rules.supplyShield;
  return {
    hp: Math.min(100, vitals.hp + heal),
    shield: Math.min(60, vitals.shield + shield),
    nades: Math.min(3, vitals.nades + 1),
  };
}
