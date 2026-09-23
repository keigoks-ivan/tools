// Paint one repeatable midnight plaza paving tile onto a Canvas2D context.
// All variation is deterministic and baked into the single canvas texture.
export function paintStreetSurface(ctx, size = 512) {
  if (!ctx || !Number.isFinite(size) || size <= 0) {
    throw new TypeError('paintStreetSurface expects a Canvas2D context and a positive finite size');
  }

  const UNIT = 512;
  const scale = size / UNIT;
  let seed = 0x51e0a1;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };

  ctx.save();
  try {
    ctx.scale(scale, scale);
    ctx.fillStyle = '#10182a';
    ctx.fillRect(0, 0, UNIT, UNIT);

    // Eight horizontal courses meet cleanly at the tile edges. Joint widths
    // stay consistent there so the 512px texture repeats without a hard edge.
    const rowHeight = UNIT / 8;
    const stoneTones = ['#172238', '#19253b', '#1b263b', '#1a2439', '#1d2940'];
    const coolEdge = 'rgba(91, 137, 180, 0.20)';
    const warmEdge = 'rgba(202, 147, 116, 0.13)';

    for (let row = 0; row < 8; row++) {
      const y = row * rowHeight;
      const count = row % 3 === 1 ? 6 : 5;
      const weights = Array.from({ length: count }, () => 0.82 + random() * 0.36);
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
      let x = 0;

      for (let col = 0; col < count; col++) {
        const width = col === count - 1 ? UNIT - x : UNIT * weights[col] / weightTotal;
        const inset = 2.5 + random() * 1.0;
        const left = x + inset;
        const top = y + 2.2 + random() * 0.8;
        const stoneWidth = width - inset * 2;
        const stoneHeight = rowHeight - 4.4 - random() * 0.8;

        ctx.fillStyle = stoneTones[Math.floor(random() * stoneTones.length)];
        ctx.fillRect(left, top, stoneWidth, stoneHeight);

        // A quiet, broken top edge catches cool city light; the opposite edge
        // carries a faint warm reflection from nearby shop windows.
        ctx.fillStyle = coolEdge;
        ctx.fillRect(left + 2, top + 1, Math.max(0, stoneWidth - 6), 0.8);
        ctx.fillStyle = warmEdge;
        ctx.fillRect(left + 3, top + stoneHeight - 1.2, Math.max(0, stoneWidth - 9), 0.65);

        // Small worn flecks and hairline scuffs keep the paving tactile without
        // turning the surface into a noisy speckle field.
        const markCount = 1 + Math.floor(random() * 3);
        for (let mark = 0; mark < markCount; mark++) {
          const markX = left + 8 + random() * Math.max(1, stoneWidth - 24);
          const markY = top + 8 + random() * Math.max(1, stoneHeight - 17);
          const markWidth = 2 + random() * 7;
          ctx.fillStyle = random() < 0.56
            ? 'rgba(112, 146, 173, 0.12)'
            : 'rgba(201, 157, 129, 0.09)';
          ctx.fillRect(markX, markY, markWidth, 0.7);
        }

        x += width;
      }
    }
  } finally {
    ctx.restore();
  }
}
