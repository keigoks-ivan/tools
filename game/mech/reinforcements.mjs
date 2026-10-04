// 有限增援共用時鐘；滿員時保留待命隊列，空出名額才逐一進場。
// 開場按 1、2、3 台逐批進場；支援縱隊等主力最後一台進場六秒後才接近。
export function waveArrivalTime(wave, index, opening = false) {
  const count = wave.list.length;
  if (!opening) return index < count ? 1.4 + index * .7 : 7 + (index - count) * 1.2;
  if (index >= count) return waveArrivalTime(wave, count - 1, true) + 6 + (index - count) * 1.2;
  let batch = 1, offset = index;
  while (offset >= batch) { offset -= batch; batch++; }
  return batch * (batch + 1) * 2 + offset * 1.4;
}
export class Reinforcements {
  constructor(cap = 8, gap = 0.7) { this.cap = cap; this.gap = gap; this.pending = []; this.next = 0; }
  add(defs, now, delay = 0) {
    for (const def of defs) this.pending.push({ def, at: now + delay });
    this.pending.sort((a, b) => a.at - b.at);
  }
  tick(now, alive, spawn) {
    if (!this.pending.length || this.pending[0].at > now || now < this.next || alive >= this.cap) return null;
    const e = spawn(this.pending[0].def);
    if (!e) { this.next = now + this.gap; return null; }
    this.pending.shift(); this.next = now + this.gap; return e;
  }
}
