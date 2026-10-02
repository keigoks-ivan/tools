// 有限增援共用時鐘；滿員時保留待命隊列，空出名額才逐一進場。
export class Reinforcements {
  constructor(cap = 8, gap = 0.7) { this.cap = cap; this.gap = gap; this.pending = []; this.next = 0; }
  add(defs, now, delay = 0) {
    for (const def of defs) this.pending.push({ def, at: now + delay });
    this.pending.sort((a, b) => a.at - b.at);
  }
  tick(now, alive, spawn) {
    if (!this.pending.length || this.pending[0].at > now || now < this.next || alive >= this.cap) return null;
    const e = spawn(this.pending.shift().def); this.next = now + this.gap; return e;
  }
}
