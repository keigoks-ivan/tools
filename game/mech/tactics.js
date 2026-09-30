// 小範圍避障與射界檢查；由遊戲提供碰撞介面，無須建立另一張導航網格。
export function steer(dx, dz, blocked, side = 1) {
  const L = Math.hypot(dx, dz);
  if (L < 1e-6) return { x: 0, z: 0 };
  dx /= L; dz /= L;
  for (const a of [0, side * 0.75, -side * 0.75, side * 1.45, -side * 1.45, side * 2.1, -side * 2.1, Math.PI]) {
    const x = dx * Math.cos(a) + dz * Math.sin(a), z = dz * Math.cos(a) - dx * Math.sin(a);
    if (!blocked(x, z)) return { x, z };
  }
  return { x: 0, z: 0 };
}
export function flankPoint(pos, target, side, distance, angle = 0.65) {
  const dx = pos.x - target.x, dz = pos.z - target.z, a = Math.atan2(dx, dz) + side * angle;
  return { x: target.x + Math.sin(a) * distance, z: target.z + Math.cos(a) * distance };
}
// 不讓同伴堵住槍口；只檢查目標之前的射線，不把遠處的同伴當成遮擋。
export function allyInLane(from, to, allies, self, radius, height) {
  const dx = to.x - from.x, dz = to.z - from.z, L2 = dx * dx + dz * dz;
  if (L2 < 1e-6) return false;
  return allies.some(e => {
    if (e === self || e.dead || e.gone) return false;
    const t = ((e.pos.x - from.x) * dx + (e.pos.z - from.z) * dz) / L2;
    if (t <= 0 || t >= 1) return false;
    const y = from.y + (to.y - from.y) * t, k = e.scale || 1;
    return y >= e.pos.y && y <= e.pos.y + height * k && Math.hypot(from.x + dx * t - e.pos.x, from.z + dz * t - e.pos.z) < radius * k;
  });
}
