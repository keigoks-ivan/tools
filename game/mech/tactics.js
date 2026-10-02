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
// 包抄方向避開同伴的進攻線；僅使用已看見或通報的目標位置。
export function squadFlank(pos, target, allies, self, side, distance, angle = 0.65) {
  const a = flankPoint(pos, target, side, distance, angle), b = flankPoint(pos, target, -side, distance, angle);
  const spacing = Math.max(2, distance * 0.45);
  const crowd = p => allies.reduce((n, e) => e === self || e.dead || e.gone || e.vehicle ? n : n + Math.max(0, 1 - Math.hypot(e.pos.x - p.x, e.pos.z - p.z) / spacing), 0);
  return crowd(b) + 0.25 < crowd(a) ? b : a;
}
export function coveringFire(allies, self) {
  return allies.some(e => e !== self && !e.dead && !e.gone && !e.vehicle && e.role !== 'flank' && (e.los || e.sees) && (e.s?.reloadT ?? -1) < 0 && (e.burst > 0 || e.charge > 0 || e.volley > 0 || e.warn > 0.5));
}
export function shareContact(allies, self, range, notify) {
  if (self.dead || self.gone || !(self.los || self.sees)) return;
  for (const e of allies) {
    if (e === self || e.dead || e.gone || e.vehicle || !e.lastSeen || Math.hypot(e.pos.x - self.pos.x, e.pos.z - self.pos.z) > range) continue;
    if (notify) notify(e, self.lastSeen); else e.lastSeen.copy(self.lastSeen);
  }
}
// 同時最多兩名側翼，每側一名；其餘留在射擊線上。
export function flankAvailable(allies, self, side) {
  let n = 0;
  for (const e of allies) if (e !== self && !e.dead && !e.gone && e.pushT > 0) {
    if (e.pushSide === side) return false;
    n++;
  }
  return n < 2;
}
// 移動線段與擴張後的碰撞盒，避免尋路在兩個採樣點之間穿過薄牆。
export function segmentBox(ax, az, bx, bz, box, pad = 0) {
  let lo = 0, hi = 1;
  for (const [a, d, min, max] of [[ax, bx - ax, box.x0 - pad, box.x1 + pad], [az, bz - az, box.z0 - pad, box.z1 + pad]]) {
    if (Math.abs(d) < 1e-9) { if (a < min || a > max) return false; }
    else { const p = (min - a) / d, q = (max - a) / d; lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q)); if (lo > hi) return false; }
  }
  return true;
}
// 局部 A*：最多展開 160 個格點；只有走不通才搜尋，路徑由各敵人短暫快取。
export function planRoute(pos, goal, clear, step, limit = 160) {
  const start = { x: 0, z: 0, g: 0, h: Math.hypot(goal.x - pos.x, goal.z - pos.z), parent: null };
  const open = [start], nodes = new Map([['0,0', start]]); let best = start, visited = 0;
  while (open.length && visited < limit) {
    let i = 0; for (let j = 1; j < open.length; j++) if (open[j].g + open[j].h < open[i].g + open[i].h) i = j;
    const n = open.splice(i, 1)[0]; if (n.closed) continue; n.closed = true; visited++;
    const x = pos.x + n.x * step, z = pos.z + n.z * step;
    if (n.h < best.h) best = n;
    if (n.h < step * 1.5 && clear(x, z, goal.x, goal.z)) { best = { x: (goal.x - pos.x) / step, z: (goal.z - pos.z) / step, parent: n }; break; }
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = n.x + dx, nz = n.z + dz; if (Math.abs(nx) > 14 || Math.abs(nz) > 14) continue;
      const key = nx + ',' + nz, old = nodes.get(key), g = n.g + Math.hypot(dx, dz) * step;
      if (old && (old.closed || old.g <= g)) continue;
      const tx = pos.x + nx * step, tz = pos.z + nz * step; if (!clear(x, z, tx, tz)) continue;
      if (old) old.closed = true;
      const node = { x: nx, z: nz, g, h: Math.hypot(goal.x - tx, goal.z - tz), parent: n };
      nodes.set(key, node); open.push(node);
    }
  }
  const points = []; for (let n = best; n.parent; n = n.parent) points.push({ x: pos.x + n.x * step, z: pos.z + n.z * step });
  return { points: points.reverse(), visited };
}
export function routeDirection(state, pos, goal, clear, now, step) {
  const distance = Math.hypot(goal.x - pos.x, goal.z - pos.z);
  if (distance < 0.05) return { x: 0, z: 0 };
  const ahead = Math.min(1, step * 10 / distance), gx = pos.x + (goal.x - pos.x) * ahead, gz = pos.z + (goal.z - pos.z) * ahead;
  if (clear(pos.x, pos.z, gx, gz)) { state.points = []; return { x: (gx - pos.x) / (distance * ahead), z: (gz - pos.z) / (distance * ahead) }; }
  const moved = state.last ? Math.hypot(pos.x - state.last.x, pos.z - state.last.z) : step;
  state.stuck = moved < step * 0.08 ? (state.stuck || 0) + Math.max(0, now - (state.lastT ?? now)) : 0;
  state.last = { x: pos.x, z: pos.z }; state.lastT = now;
  if (state.points?.length && Math.hypot(goal.x - state.gx, goal.z - state.gz) > step * 3) state.points = [];
  if (now >= (state.nextPlan || 0) && (!state.points?.length || state.stuck > 1 || Math.hypot(goal.x - state.gx, goal.z - state.gz) > step * 3 || now >= state.expires)) {
    const route = planRoute(pos, goal, clear, step); state.points = route.points; state.visited = route.visited;
    state.gx = goal.x; state.gz = goal.z; state.stuck = 0; state.nextPlan = now + 2; state.expires = now + 5;
  }
  while (state.points?.length && Math.hypot(state.points[0].x - pos.x, state.points[0].z - pos.z) < step * 0.35) state.points.shift();
  const next = state.points?.[0];
  if (!next || !clear(pos.x, pos.z, next.x, next.z)) { state.points = []; return null; }
  const d = Math.hypot(next.x - pos.x, next.z - pos.z);
  return { x: (next.x - pos.x) / d, z: (next.z - pos.z) / d };
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
