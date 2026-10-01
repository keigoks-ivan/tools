// 關卡場地：沿用既有任務路線，路線周圍整平，地形與掩體只在換關時建立。
export const BATTLEFIELDS = {
  city: { mode: 0, label: '首都街區', relief: 0, trees: 0, rocks: 0 },
  valley: { mode: 1, label: '山谷砲兵陣地', relief: 220, trees: 220, rocks: 90 },
  forest: { mode: 2, label: '山麓林地', relief: 110, trees: 1200, rocks: 45 },
  depot: { mode: 3, label: '工業補給基地', relief: 35, trees: 0, rocks: 25 },
  badlands: { mode: 4, label: '荒野防線', relief: 130, trees: 0, rocks: 130 },
  airfield: { mode: 5, label: '高原航空基地', relief: 55, trees: 20, rocks: 35 },
  fortress: { mode: 6, label: '山隘要塞', relief: 270, trees: 140, rocks: 105 },
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function routeDistance(x, z, pts) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}
export function fieldHeight(x, z, profile, route, base = 0) {
  const F = BATTLEFIELDS[profile];
  if (!F || !F.mode) return base;
  const r = Math.hypot(x, z);
  if (r > 2400) return base;
  // 近處為可作戰的緩坡，山稜從戰場邊緣抬起；路線與目標旁保留安全走廊。
  let clear = routeDistance(x, z, route.pts);
  if (profile === 'airfield') clear = Math.min(clear, Math.hypot(Math.max(0,Math.abs(x+420)-48),Math.max(0,Math.abs(z)-900)));
  for (const sec of route.secs) for (const t of sec.targets || []) clear = Math.min(clear, Math.hypot(x - t.x, z - t.z));
  for (const t of route.pads || []) clear = Math.min(clear, Math.hypot(x - t.x, z - t.z));
  const ridge = (0.55 + 0.24 * Math.sin(x / 240 + Math.sin(z / 180)) + 0.21 * Math.cos(z / 310 - x / 450));
  const outer = smooth(650, 1250, r), inner = smooth(100, 220, clear);
  const h = F.relief * ridge * (outer + (1 - outer) * 0.24) * inner;
  return h * (1 - smooth(1650, 2400, r)) + base * smooth(1650, 2400, r);
}
export function fieldLayout(profile, route) {
  const targets = route.secs.flatMap(s => s.targets || []).map(t => ({ x: t.x, z: t.z, target: true, name: t.name }));
  const structures = [...targets];
  for (let i = 1; i < route.pts.length; i += 2) {
    const [x, z] = route.pts[i];
    const sx = Math.round(x / 120) * 120 + (i % 4 === 1 ? 60 : -60), sz = Math.round(z / 120) * 120 + 60;
    if (routeDistance(sx, sz, route.pts) < 42 || structures.some(t => Math.hypot(t.x - sx, t.z - sz) < 55)) continue;
    structures.push({ x: sx, z: sz, target: false });
  }
  return { ...BATTLEFIELDS[profile], structures };
}
