const cycle = phase => ((phase % 1) + 1) % 1;
export const gaitBob = (look, phase) => -Math.abs(Math.sin(cycle(phase) * Math.PI * 2)) * (look === 'knight' ? 1.25 : .65);

// The step follows distance travelled, so paused or blocked units do not walk
// in place, and changing game speed does not make their feet slide faster.
export function gaitPose(look, phase, direction = 0) {
  const mounted = look === 'knight', robe = look === 'mage';
  const p = cycle(phase), stride = Math.sin(p * Math.PI * 2);
  const rear = direction >= 2, reach = mounted ? .19 : robe ? .075 : .2;
  const count = mounted ? 4 : 2;
  return {
    cut: mounted ? .64 : robe ? .75 : .62,
    bob: gaitBob(look, p),
    limbs: Array.from({ length: count }, (_, i) => {
      // Horses use diagonal pairs; infantry alternates its two planted feet.
      const step = mounted ? Math.sin(p * Math.PI * 2 + [0, Math.PI, Math.PI, 0][i]) : stride * (i ? 1 : -1);
      return { swing: step * reach * (rear ? -.8 : 1), lift: Math.max(0, step) * (mounted ? 2.1 : robe ? .9 : 1.8) };
    })
  };
}

const frames = new WeakMap();
export function drawWalkingSprite(c, art, width, height, phase, look, direction) {
  if (!art?.naturalWidth || art.complete === false) return false;
  const frame = Math.floor(cycle(phase) * 8), key = `${look}:${direction}:${width.toFixed(2)}:${height.toFixed(2)}:${frame}`;
  let variants = frames.get(art);
  if (!variants) { variants = new Map(); frames.set(art, variants); }
  let canvas = variants.get(key);
  if (!canvas) {
    const pad = 6, ratio = 2, pose = gaitPose(look, frame / 8, direction);
    canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width + pad * 2) * ratio;
    canvas.height = Math.ceil(height + pad * 2) * ratio;
    const g = canvas.getContext('2d'); g.scale(ratio, ratio); g.translate(canvas.width / ratio / 2, height + pad);
    const iw = art.naturalWidth, ih = art.naturalHeight, top = ih * pose.cut;
    const legHeight = height * (1 - pose.cut), band = width / pose.limbs.length;
    for (let i = 0; i < pose.limbs.length; i++) {
      const limb = pose.limbs[i], x = -width / 2 + band * i, pivot = x + band / 2;
      g.save(); g.translate(pivot, -legHeight); g.transform(1, 0, limb.swing, 1, 0, -limb.lift);
      g.drawImage(art, iw * i / pose.limbs.length, top, iw / pose.limbs.length, ih - top, -band / 2, 0, band, legHeight);
      g.restore();
    }
    // Paint the hips over the leg joints; the torso remains intact.
    g.drawImage(art, 0, 0, iw, top, -width / 2, -height, width, height * pose.cut + .8);
    variants.set(key, canvas);
    // User portraits can have many sizes in the editor. Bound each source cache.
    if (variants.size > 64) variants.delete(variants.keys().next().value);
  }
  c.drawImage(canvas, -canvas.width / 4, 1 - height - 6, canvas.width / 2, canvas.height / 2);
  return true;
}
