// Soft collision: every unit has a body, overlapping bodies are pushed apart a little each tick.
// Neighbours come from a uniform grid (cell = 1 tile), so a tick is O(n) for any army size.
// Bodies are tile-scale (a tile is 1.0), so a 1.2-tile formation slot never overlaps its neighbour.
export function unitRadius(bp) {
  const look = bp.look;
  const r = look === 'siege' || bp.family === 'siege' ? .5 : look === 'cart' ? .4 : look === 'knight' || look === 'beast' || bp.family === 'cavalry' ? .36 : bp.role === 'worker' ? .22 : .26;
  return bp.hero && r < .38 ? .38 : r;
}
// How easily a unit gives way: idle bodies yield fully, marching ones steer around, units at work hold their post.
const TRIES = [[1, 1], [1, 0], [0, 1], [.5, .5]], YIELD_IDLE = 1, YIELD_MOVING = .15, YIELD_HOLD = .35, MAX_PUSH = .3;

// Direction an idle body moves when a marcher with heading (hx, hy) bumps it from direction (nx, ny): mostly sideways.
function sidestep(hx, hy, nx, ny, id) {
  let side = -hy * nx + hx * ny; const sign = Math.abs(side) > .05 ? Math.sign(side) : id % 2 ? 1 : -1;
  const x = -hy * sign + nx * .4, y = hx * sign + ny * .4, l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
export function separateUnits(w, dt, goalDistance) {
  const size = w.map.size, units = w.units, total = units.length; if (total < 2) return;
  let g = w.crowd;
  if (!g || g.size !== size) g = w.crowd = { size, head: new Int32Array(size * size).fill(-1), cap: 0 };
  if (g.cap < total) {
    g.cap = total + 256;
    Object.assign(g, { list: new Array(g.cap), next: new Int32Array(g.cap), cell: new Int32Array(g.cap), px: new Float64Array(g.cap), py: new Float64Array(g.cap), rad: new Float64Array(g.cap), hx: new Float64Array(g.cap), hy: new Float64Array(g.cap), give: new Float64Array(g.cap), ax: new Float64Array(g.cap), ay: new Float64Array(g.cap) });
  }
  const { head, next, cell, px, py, rad, hx, hy, give, ax, ay, list } = g, holds = w.holds, tick = w.tickNo;
  let m = 0;
  for (let i = 0; i < total; i++) {
    const u = units[i]; if (u.hp <= 0 || u.garrison) continue;
    const x = u.x < 0 ? 0 : u.x >= size ? size - 1 : u.x, y = u.y < 0 ? 0 : u.y >= size ? size - 1 : u.y, c = Math.floor(y) * size + Math.floor(x), r = u.radius ?? (u.radius = unitRadius(u.blueprint));
    // Heading of a marching unit (zero for everyone else): idle bodies are shoved sideways out of its path.
    const f = u.moving && u.facing, fl = f && typeof f === 'object' ? Math.hypot(f.x, f.y) : 0;
    hx[m] = fl > 1e-5 ? f.x / fl : 0; hy[m] = fl > 1e-5 ? f.y / fl : 0;
    list[m] = u; px[m] = u.x; py[m] = u.y; rad[m] = r; ax[m] = 0; ay[m] = 0; cell[m] = c;
    give[m] = (u.holdAt === tick ? YIELD_HOLD : u.moving ? YIELD_MOVING : YIELD_IDLE) * Math.min(1, .3 / r);
    next[m] = head[c]; head[c] = m; m++;
  }
  let touched = false;
  // A marcher is never shoved backwards by a body that stands still: it slides round it (always to its left,
  // so two head-on marchers pass each other instead of deadlocking) while the idle one gives ground.
  const shove = (k, other, vx, vy) => {
    const fx = hx[k], fy = hy[k];
    if ((fx || fy) && !(hx[other] || hy[other])) { const back = vx * fx + vy * fy; if (back < 0) { vx += (-back) * fx + back * fy * .6; vy += (-back) * fy - back * fx * .6; } }
    ax[k] += vx; ay[k] += vy;
  };
  const pair = (i, j) => {
    const dx = px[j] - px[i], rs = rad[i] + rad[j]; if (dx >= rs || dx <= -rs) return;
    const dy = py[j] - py[i]; if (dy >= rs || dy <= -rs) return;
    const d2 = dx * dx + dy * dy; if (d2 >= rs * rs) return;
    let nx, ny, d = Math.sqrt(d2);
    if (d < 1e-4) { const a = ((list[i].id * 2654435761 + list[j].id * 40503) >>> 0) % 6283 / 1000; nx = Math.cos(a); ny = Math.sin(a); d = 0; }
    else { nx = dx / d; ny = dy / d; }
    const overlap = rs - d, si = give[i] / (give[i] + give[j]), sj = 1 - si;
    let jx = nx, jy = ny, ix = nx, iy = ny;
    // Only one of the pair is marching: the other steps aside across its heading rather than along it.
    if (hx[i] || hy[i]) { if (!(hx[j] || hy[j])) [jx, jy] = sidestep(hx[i], hy[i], nx, ny, list[j].id); }
    else if (hx[j] || hy[j]) [ix, iy] = sidestep(hx[j], hy[j], -nx, -ny, list[i].id);
    shove(i, j, -ix * overlap * si, -iy * overlap * si); shove(j, i, jx * overlap * sj, jy * overlap * sj); touched = true;
  };
  for (let i = 0; i < m; i++) {
    const c = cell[i], cx = c % size;
    for (let j = next[i]; j >= 0; j = next[j]) pair(i, j);
    if (cx + 1 < size) for (let j = head[c + 1]; j >= 0; j = next[j]) pair(i, j);
    if (c + size < size * size) {
      for (let j = head[c + size]; j >= 0; j = next[j]) pair(i, j);
      if (cx > 0) for (let j = head[c + size - 1]; j >= 0; j = next[j]) pair(i, j);
      if (cx + 1 < size) for (let j = head[c + size + 1]; j >= 0; j = next[j]) pair(i, j);
    }
  }
  for (let i = 0; i < m; i++) head[cell[i]] = -1;
  if (!touched) return;
  const k = Math.min(.7, dt * 14), limit = size - 1;
  for (let i = 0; i < m; i++) {
    let mx = ax[i] * k, my = ay[i] * k; if (!mx && !my) continue;
    if (list[i].moving) list[i].crowdAt = tick;
    const mag = Math.hypot(mx, my); if (mag > MAX_PUSH) { mx *= MAX_PUSH / mag; my *= MAX_PUSH / mag; }
    const u = list[i], ox = px[i], oy = py[i], hold = list[i].holdAt === tick ? holds.get(list[i].id) : undefined, reach = hold ? Math.max(hold.radius, goalDistance(u, hold.goal)) : 0;
    // Try the whole shove, then each axis alone (a slide along a wall or around a post), then half of it.
    for (const [sx, sy] of TRIES) {
      const nx = Math.min(limit, Math.max(0, ox + mx * sx)), ny = Math.min(limit, Math.max(0, oy + my * sy));
      if (nx === ox && ny === oy) continue;
      const rx = Math.round(nx), ry = Math.round(ny), qx = Math.round(ox), qy = Math.round(oy);
      if ((rx !== qx || ry !== qy) && (w.blocked(rx, ry) || rx !== qx && ry !== qy && (w.blocked(rx, qy) || w.blocked(qx, ry)))) continue;
      if (hold && goalDistance({ x: nx, y: ny }, hold.goal) > reach) continue;
      u.x = nx; u.y = ny; break;
    }
  }
}
