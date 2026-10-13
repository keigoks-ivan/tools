// Play-mode zoom is a handful of fixed levels. 100% is the renderer zoom at which a villager is about 40px tall at 1080p.
export const ZOOM_BASE = 1.1;
export const ZOOM_LEVELS = [.5, .75, 1, 1.25, 1.5];
export const ZOOM_STEPS = ZOOM_LEVELS.map(level => +(level * ZOOM_BASE).toFixed(4));
export const zoomPercent = zoom => Math.round(zoom / ZOOM_BASE * 100);

// dir > 0 zooms in, dir < 0 zooms out; a zoom between two levels moves to the next level in that direction.
export function steppedZoom(zoom, dir) {
  const eps = 1e-4;
  if (dir > 0) return ZOOM_STEPS.find(s => s > zoom + eps) ?? ZOOM_STEPS.at(-1);
  if (dir < 0) return [...ZOOM_STEPS].reverse().find(s => s < zoom - eps) ?? ZOOM_STEPS[0];
  return zoom;
}

// One wheel notch is one level; trackpad streams accumulate and then wait out a short cooldown so inertia cannot skip levels.
export function createWheelStepper({ threshold = 40, cooldown = 110, idle = 260 } = {}) {
  let acc = 0, last = -Infinity, seen = -Infinity;
  return (pixels, now) => {
    if (now - seen > idle || Math.sign(pixels) !== Math.sign(acc)) acc = 0;
    seen = now; acc += pixels;
    if (Math.abs(acc) < threshold) return 0;
    const dir = acc < 0 ? 1 : -1; acc = 0;
    if (now - last < cooldown) return 0;
    last = now; return dir;
  };
}

// Scroll when the pointer touches the browser window edge, including the HUD strips around the canvas.
export function edgeScrollDirection(pos, viewport, band = 3) {
  if (!pos) return { dx: 0, dy: 0 };
  return {
    dx: Number(pos.x <= band) - Number(pos.x >= viewport.width - 1 - band),
    dy: Number(pos.y <= band) - Number(pos.y >= viewport.height - 1 - band),
  };
}
