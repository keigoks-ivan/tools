// 共用城市屋頂輪廓。只輸出少量面與方塊，由兩套城市寫入既有材質桶。
export function roofline(x0, x1, z0, z1, h, kind, face, box) {
  const w = x1 - x0, d = z1 - z0, key = Math.abs(Math.round(x0 * 3 + z0 * 7));
  if (w < 5 || d < 5) return;
  const stone = [0.66, 0.63, 0.57, 0, 1], metal = [0.22, 0.26, 0.29, 0, 2], tile = [0.43, 0.24, 0.17, 0, 3], glass = [0.10, 0.17, 0.20, 0, 4];
  const panel = (a, b, c, e, col) => face(a, b, c, e, col);
  if (kind === 'old') {
    const count = Math.max(1, Math.min(4, Math.round(w / 16))), span = w / count;
    for (let i = 0; i < count; i++) {
      const lo = x0 + i * span, hi = lo + span, rise = Math.min(6, span * 0.3), y = h + 0.8;
      const profile = (key + i) % 2 ? [[lo, y], [lo + span * 0.16, y + rise * 0.78], [hi - span * 0.16, y + rise * 0.78], [hi, y]]
        : [[lo, y], [(lo + hi) / 2, y + rise], [hi, y]];
      const paint = (key + i) % 3 ? metal : tile;
      for (let j = 1; j < profile.length; j++) {
        const [a, ay] = profile[j - 1], [b, by] = profile[j];
        panel([a, ay, z0], [a, ay, z1], [b, by, z1], [b, by, z0], paint);
      }
      // 山牆封面、頂層窗與煙囪，讓一整塊樓體呈現連棟街屋的比例。
      for (const z of [z0, z1]) {
        for (let j = profile.length - 2; j >= 1; j--) {
          const pts = [[lo, y, z], [profile[j + 1][0], profile[j + 1][1], z], [profile[j][0], profile[j][1], z], [profile[j][0], profile[j][1], z]];
          if (z === z0) [pts[1], pts[2], pts[3]] = [pts[2], pts[1], pts[1]]; panel(...pts, stone);
        }
        const cx = (lo + hi) / 2, top = y + Math.min(1.9, rise * 0.6), out = z === z1 ? 0.025 : -0.025;
        const pts = [[cx - 0.65, y + 0.3, z + out], [cx + 0.65, y + 0.3, z + out], [cx + 0.65, top, z + out], [cx - 0.65, top, z + out]];
        if (z === z0) pts.reverse(); panel(...pts, glass);
      }
      const cx = lo + span * 0.26, cz = z0 + d * 0.3;
      box(cx - 0.45, cx + 0.45, y + rise * 0.4, y + rise + 0.7, cz - 0.6, cz + 0.6, stone);
      box(cx - 0.57, cx + 0.57, y + rise + 0.7, y + rise + 0.88, cz - 0.72, cz + 0.72, metal);
    }
  } else if (kind === 'industrial') {
    const count = Math.min(4, Math.max(2, Math.round(d / 12))), span = d / count, y = h + 0.9;
    for (let i = 0; i < count; i++) {
      const a = z0 + i * span, b = a + span, rise = Math.min(2.4, span * 0.3);
      panel([x0, y, a], [x0, y + rise, b], [x1, y + rise, b], [x1, y, a], metal);
      panel([x0, y + rise, b], [x0, y, b], [x1, y, b], [x1, y + rise, b], glass);
      for (const x of [x0, x1]) {
        const pts = [[x, y, a], [x, y, b], [x, y + rise, b], [x, y + rise, b]];
        if (x === x1) [pts[1], pts[2], pts[3]] = [pts[2], pts[1], pts[1]]; panel(...pts, stone);
      }
    }
  } else {
    const tower = kind === 'tower', rise = tower ? Math.min(14, h * 0.16) : 3.2;
    const y = h + 0.03, ix = w * (tower ? 0.27 : 0.17), iz = d * (tower ? 0.27 : 0.17);
    const ax = x0 + ix, bx = x1 - ix, az = z0 + iz, bz = z1 - iz;
    box(ax, bx, y, y + rise * 0.6, az, bz, tower ? stone : glass);
    box(ax - 0.45, bx + 0.45, y + rise * 0.6, y + rise * 0.6 + 0.22, az - 0.45, bz + 0.45, metal);
    const tx = w * 0.08, tz = d * 0.08, top = y + rise;
    // 四片斜面向內收攏，形成美式退縮冠頂與亞洲住宅的設備層。
    panel([ax, y + rise * 0.6, bz], [bx, y + rise * 0.6, bz], [bx - tx, top, bz - tz], [ax + tx, top, bz - tz], metal);
    panel([bx, y + rise * 0.6, az], [ax, y + rise * 0.6, az], [ax + tx, top, az + tz], [bx - tx, top, az + tz], metal);
    panel([bx, y + rise * 0.6, bz], [bx, y + rise * 0.6, az], [bx - tx, top, az + tz], [bx - tx, top, bz - tz], metal);
    panel([ax, y + rise * 0.6, az], [ax, y + rise * 0.6, bz], [ax + tx, top, bz - tz], [ax + tx, top, az + tz], metal);
    panel([ax + tx, top, bz - tz], [bx - tx, top, bz - tz], [bx - tx, top, az + tz], [ax + tx, top, az + tz], metal);
    if (tower && key % 3 === 0) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      box(cx - 1.1, cx + 1.1, top, top + 2.8, cz - 1.1, cz + 1.1, stone);
      box(cx - 0.18, cx + 0.18, top + 2.8, top + 7, cz - 0.18, cz + 0.18, metal);
    }
  }
}
