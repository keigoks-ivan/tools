// 景觀段落只在街區內且離開交火一段時間後響起，避免邊走邊頻繁換曲。
export class ScenicMusic {
  constructor() { this.reset(); }
  reset() { this.threatHold = 0; this.scenic = false; this.exitTime = 0; }
  update(dt, p, bounds, threat) {
    this.threatHold = threat ? 8 : Math.max(0, this.threatHold - dt);
    if (!bounds || this.threatHold) { this.scenic = false; this.exitTime = 0; return false; }
    const inside = p.x >= bounds.x0 && p.x <= bounds.x1 && p.z >= bounds.z0 && p.z <= bounds.z1 &&
      p.y >= bounds.y0 - 2 && p.y <= bounds.y1 + 70;
    if (inside) { this.scenic = true; this.exitTime = 0; }
    else {
      this.exitTime += dt;
      const nearby = p.x >= bounds.x0 - 3 && p.x <= bounds.x1 + 3 && p.z >= bounds.z0 - 3 && p.z <= bounds.z1 + 3 &&
        p.y >= bounds.y0 - 2 && p.y <= bounds.y1 + 70;
      if (!nearby || this.exitTime >= 1.5) this.scenic = false;
    }
    return this.scenic;
  }
}
