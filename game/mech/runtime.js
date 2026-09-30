// 共用繪製預算：限制像素與刷新率，畫質切換不會改變遊戲速度。
import { FramePacer } from '../frame-pacing.js';
export function qualityLevel(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(2, Math.round(n))) : 1;
}
export function pixelRatio(width, height, dpr, quality) {
  const q = qualityLevel(quality);
  const pixels = [1280 * 720, 1920 * 1080, 2560 * 1440][q];
  return Math.min(Math.max(0.5, dpr || 1), [0.75, 1, 1.5][q], Math.sqrt(pixels / Math.max(1, width * height)));
}
export class FrameGate {
  constructor() { this.pacer = null; this.fps = null; }
  ready(now, fps = 60) {
    if (!(fps > 0)) return true;
    if (!this.pacer || this.fps !== fps) { this.pacer = new FramePacer(fps); this.fps = fps; }
    return this.pacer.shouldRender(now);
  }
}
