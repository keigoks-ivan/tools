const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The painted floor already supplies perspective. Preserve its ground
// coordinates and the combat simulation; scale only upright actor artwork.
export function depthScaleAt(y) {
  return 0.74 + clamp((y - 210) / 415, 0, 1) * 0.43;
}

export class FollowCamera {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.zoom = 1.1;
    this.reset();
  }

  reset() { this.x = 0; this.y = 0; }

  update(dt, hero) {
    if (!this.enabled) { this.reset(); return; }
    if (!Number.isFinite(dt) || dt <= 0) return;
    const blend = 1 - Math.exp(-4 * Math.min(dt, 0.1));
    const targetX = clamp((hero.x - 640) * 0.14, -50, 50);
    const targetY = clamp((hero.y - 440) * 0.12, -24, 24);
    this.x += (targetX - this.x) * blend;
    this.y += (targetY - this.y) * blend;
  }

  apply(context) {
    context.translate(640, 360);
    context.scale(this.zoom, this.zoom);
    context.translate(-640 - this.x, -360 - this.y);
  }
}
