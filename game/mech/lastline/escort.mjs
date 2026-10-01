// 與畫面無關的車隊狀態：只接受模擬時間，暫停時不呼叫 step。
export class Escort {
  constructor(route, hp = 100) {
    if (!Array.isArray(route) || route.length < 2 || route.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw Error('Invalid evacuation route');
    this.route = route.map(p => [...p]); this.pos = [...route[0]]; this.index = 0;
    this.lengths = [0];
    for (let i = 1; i < route.length; i++) {
      const d = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
      if (d < 0.01) throw Error('Invalid evacuation segment');
      this.lengths.push(this.lengths[i - 1] + d);
    }
    this.hp = Math.min(100, Math.max(1, Number.isFinite(hp) ? hp : 100)); this.choice = null; this.time = 0;
  }
  step(dt, clear, player, blocked = false) {
    if (!Number.isFinite(dt) || dt <= 0 || this.hp <= 0 || blocked) return;
    dt = Math.min(dt, 0.1); this.time += dt;
    if (!clear || this.index === this.route.length - 1 || Math.hypot(player[0] - this.pos[0], player[1] - this.pos[1]) > 110) return;
    const next = this.route[this.index + 1], dx = next[0] - this.pos[0], dz = next[1] - this.pos[1], d = Math.hypot(dx, dz), move = dt * 10;
    if (d <= move) { this.pos = [...next]; this.index++; } else { this.pos[0] += dx / d * move; this.pos[1] += dz / d * move; }
  }
  damage(n) { if (Number.isFinite(n) && n > 0) this.hp = Math.max(0, this.hp - n); return this.hp === 0; }
  // 用路線里程定位後車；路口前後六公尺逐漸轉向，讀檔也能還原正確隊形。
  pose(behind = 0, extension = 0) {
    const p = this.route[this.index], distance = this.lengths[this.index] + Math.hypot(this.pos[0] - p[0], this.pos[1] - p[1]) + extension - behind;
    const sample = d => {
      let i = 0;
      while (i < this.route.length - 2 && d > this.lengths[i + 1]) i++;
      const a = this.route[i], b = this.route[i + 1], t = (d - this.lengths[i]) / (this.lengths[i + 1] - this.lengths[i]);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const pos = sample(distance), a = sample(distance - 6), b = sample(distance + 6);
    return { pos, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  choose(choice) { if (this.choice || !['rescue', 'artillery'].includes(choice)) return false; this.choice = choice; if (choice === 'rescue') this.hp = Math.min(100, this.hp + 18); return true; }
  ready(wave, player, radius = 90) { const p = this.route[wave]; return !!p && this.hp > 0 && this.index >= wave && Math.hypot(player[0] - p[0], player[1] - p[1]) < radius; }
  snapshot() { return { pos: [...this.pos], index: this.index, hp: this.hp, choice: this.choice, time: this.time }; }
  restore(s) {
    if (!s || !Number.isInteger(s.index) || s.index < 0 || s.index >= this.route.length || !Array.isArray(s.pos) || s.pos.length !== 2 || !s.pos.every(Number.isFinite) || !Number.isFinite(s.hp) || s.hp <= 0 || s.hp > 100 || (s.choice !== null && !['rescue', 'artillery'].includes(s.choice))) return false;
    const a = this.route[s.index], b = this.route[Math.min(s.index + 1, this.route.length - 1)];
    if (s.pos.some((n, i) => n < Math.min(a[i], b[i]) - 0.01 || n > Math.max(a[i], b[i]) + 0.01)) return false;
    Object.assign(this, { pos: [...s.pos], index: s.index, hp: s.hp, choice: s.choice, time: Number.isFinite(s.time) ? Math.max(0, s.time) : 0 }); return true;
  }
}
export function ending(choice, hp) {
  return choice === 'rescue' ? { title: '誰也沒有被留下', text: '橋頭小隊與車隊一起撤出。倖存者把清除命令公諸於世；白鷺離開指揮部，留下自己的通訊頻道。蒼焰在城門外停下，第一次沒有收到下一份命令。' }
    : { title: '沉默的砲台', text: `你摧毀了追擊砲陣，車隊穿過撤離閘門${hp >= 70 ? '，車身上的白色標記仍清楚可見' : '，帶著彈痕與受傷的人'}。橋頭小隊自行撤離後失去聯絡。證據抵達城外，指揮部再也無法宣稱北區已經空無一人。` };
}
