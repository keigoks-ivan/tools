const DEFAULT_FPS = 60;
const DEFAULT_EARLY_TOLERANCE_MS = 1;
const TIMESTAMP_EPSILON_MS = 1e-6;

/** Caps draw submissions while keeping deadlines on a stable time grid. */
export class FramePacer {
  constructor(fps = DEFAULT_FPS, earlyToleranceMs = DEFAULT_EARLY_TOLERANCE_MS) {
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('fps must be positive');
    if (!Number.isFinite(earlyToleranceMs) || earlyToleranceMs < 0) {
      throw new RangeError('earlyToleranceMs must be non-negative');
    }
    this.interval = 1000 / fps;
    this.earlyToleranceMs = earlyToleranceMs;
    this.nextFrameAt = null;
  }

  reset() {
    this.nextFrameAt = null;
  }

  shouldRender(timestamp) {
    if (!Number.isFinite(timestamp)) return false;
    if (this.nextFrameAt === null) {
      this.nextFrameAt = timestamp + this.interval;
      return true;
    }

    const earliest = this.nextFrameAt - this.earlyToleranceMs;
    if (timestamp + TIMESTAMP_EPSILON_MS < earliest) return false;

    // Advance from the scheduled deadline, not the callback timestamp. If a
    // callback arrives late, skip missed slots instead of shifting the cadence
    // or trying to catch up with multiple renders.
    const lateBy = Math.max(0, timestamp - this.nextFrameAt);
    const missedSlots = Math.floor((lateBy + TIMESTAMP_EPSILON_MS) / this.interval) + 1;
    this.nextFrameAt += missedSlots * this.interval;
    return true;
  }
}
