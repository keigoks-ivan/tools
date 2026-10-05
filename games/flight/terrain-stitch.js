// Clip the visible coarse mesh around a finer terrain rectangle. Every join edge
// includes the finer mesh's own samples, so skirts never become artificial cliffs.
export function createTerrainStitch({ box, divisions, pointAt, project, height, positions, extra, indices, originX = 0, originZ = 0 }) {
  const planes = box ? [['mx', box.minX, 1], ['mx', box.maxX, -1], ['my', box.minY, 1], ['my', box.maxY, -1]] : [];
  const epsilon = 1e-7;
  const inside = point => planes.every(([axis, edge, sign]) => (point[axis] - edge) * sign >= -epsilon);
  function append(point, lowering = 0) {
    const local = project(point), index = positions.length / 3 + extra.length / 3;
    extra.push(local.x - originX, height(local.x, local.z) - lowering, local.z - originZ); return index;
  }
  function split(polygon, axis, edge, sign) {
    const outer = [], inner = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = (a[axis] - edge) * sign, db = (b[axis] - edge) * sign;
      if (da >= -epsilon) inner.push(a);
      if (da <= epsilon) outer.push(a);
      if ((da > epsilon && db < -epsilon) || (da < -epsilon && db > epsilon)) {
        const t = da / (da - db), intersection = { mx: a.mx + (b.mx - a.mx) * t, my: a.my + (b.my - a.my) * t };
        intersection[axis] = edge; outer.push(intersection); inner.push(intersection);
      }
    }
    return { outer, inner };
  }
  function addPolygon(polygon) {
    if (polygon.length < 3) return;
    const first = polygon[0];
    const area = polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]; return sum + (a.mx - first.mx) * (b.my - first.my) - (b.mx - first.mx) * (a.my - first.my); }, 0);
    if (Math.abs(area) < epsilon) return;
    const boundary = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length]; boundary.push(a);
      const plane = planes.find(([axis, edge]) => Math.abs(a[axis] - edge) < epsilon && Math.abs(b[axis] - edge) < epsilon);
      if (!plane) continue;
      const [fixed, edge] = plane, axis = fixed === 'mx' ? 'my' : 'mx';
      const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]), samples = [];
      const minimum = axis === 'mx' ? box.minX : box.minY, maximum = axis === 'mx' ? box.maxX : box.maxY;
      const step = (maximum - minimum) / divisions;
      const from = Math.max(0, Math.ceil((low - minimum) / step)), to = Math.min(divisions, Math.floor((high - minimum) / step));
      for (let j = from; j <= to; j++) {
        const value = axis === 'mx' ? box.minX + (box.maxX - box.minX) * j / divisions : box.maxY - (box.maxY - box.minY) * (divisions - j) / divisions;
        if (value > low + epsilon && value < high - epsilon) samples.push({ [fixed]: edge, [axis]: value });
      }
      if (a[axis] > b[axis]) samples.reverse(); boundary.push(...samples);
    }
    // A centre fan retains collinear boundary samples; an ear-cut would remove them.
    const center = { mx: polygon.reduce((sum, p) => sum + p.mx, 0) / polygon.length, my: polygon.reduce((sum, p) => sum + p.my, 0) / polygon.length };
    const centerIndex = append(center), rim = boundary.map(point => point.index ?? append(point));
    for (let i = 0; i < rim.length; i++) indices.push(centerIndex, rim[i], rim[(i + 1) % rim.length]);
  }
  function triangle(a, b, c) {
    if (!box) { indices.push(a, b, c); return; }
    const polygon = [pointAt(a), pointAt(b), pointAt(c)];
    if (planes.some(([axis, edge, sign]) => polygon.every(point => (point[axis] - edge) * sign < -epsilon))) { indices.push(a, b, c); return; }
    if (polygon.every(inside)) return;
    let remaining = polygon;
    for (const [axis, edge, sign] of planes) {
      if (remaining.length < 3) break;
      const parts = split(remaining, axis, edge, sign); addPolygon(parts.outer); remaining = parts.inner;
    }
  }
  function skirt(a, b, depth) {
    const start = pointAt(a), end = pointAt(b), segments = [];
    let entry = 0, exit = 1, intersects = !!box;
    for (const [axis, edge, sign] of planes) {
      const distance = (start[axis] - edge) * sign, direction = (end[axis] - start[axis]) * sign;
      if (Math.abs(direction) < epsilon) { if (distance < -epsilon) { intersects = false; break; } continue; }
      const crossing = -distance / direction;
      if (direction > 0) entry = Math.max(entry, crossing); else exit = Math.min(exit, crossing);
      if (entry > exit) { intersects = false; break; }
    }
    const at = t => t <= epsilon ? start : t >= 1 - epsilon ? end : { mx: start.mx + (end.mx - start.mx) * t, my: start.my + (end.my - start.my) * t };
    if (!intersects) segments.push([start, end]);
    else { if (entry > epsilon) segments.push([start, at(entry)]); if (exit < 1 - epsilon) segments.push([at(exit), end]); }
    for (const [p, q] of segments) {
      const topA = p.index ?? append(p), topB = q.index ?? append(q), bottomA = append(p, depth), bottomB = append(q, depth);
      indices.push(topA, bottomA, topB, topB, bottomA, bottomB);
    }
  }
  return { triangle, skirt };
}
