// 支線只讀常駐駐軍，不改主線順序，也不靠附近模型是否載入判定清場。
export class FieldOps {
  constructor(G, outposts) { this.G = G; this.outposts = outposts; this.claimed = new Set(); this.selected = null; }
  reset(saved) { this.claimed = new Set((Array.isArray(saved?.claimed) ? saved.claimed : []).filter(id => this.outposts.some(o => o.id === id))); this.selected = null; }
  snapshot() { return { claimed: [...this.claimed] }; }
  secured(o) { const rs = this.G.patrols.group(o); return rs.length === o.enemies.length && rs.length > 0 && rs.every(r => r.dead); }
  position(o) { return this.G.fieldItems[o.id]; }
  waypoint() { const o = this.outposts.find(o => o.id === this.selected); return o ? { p: this.position(o), name: o.name } : null; }
  status(o) { return this.claimed.has(o.id) ? '補給已領取' : this.secured(o) ? '已清除 · 可領補給' : '敵軍駐守'; }
  update(input) {
    const G = this.G;
    if (G.scout.active || G.player.dead || G.hud.prompt) return;
    for (const o of this.outposts) {
      if (this.claimed.has(o.id) || !this.secured(o)) continue;
      const p = this.position(o);
      if (G.player.pos.distanceTo(p) > 2.3 || !G.solid.sees(G.playerEye, p)) continue;
      G.hud.prompt = `按 E 領取 ${o.name}補給`;
      if (!input.pressed('KeyE') && !input.pressed('Tlock')) return;
      this.claimed.add(o.id); G.player.hp = Math.min(100, G.player.hp + 35); G.nadeN = Math.min(5, G.nadeN + 2); G.vm.refill();
      if (!G.scout.destroyed) { G.scout.hp = 45; G.scout.ammo = 30; G.scout.battery = 45; }
      G.hud.prompt = null; G.hud.note('哨站補給：生命＋35、手榴彈＋2、彈匣補滿', '#b7efad');
      if (this.selected === o.id) this.selected = null;
      G.onFieldClaim?.(); return;
    }
  }
}

// 地圖只在開啟／選擇時畫 2D 平面，不增加場景相機或每幀 GPU 工作。
export class FieldMap {
  constructor(G, bounds, close) {
    this.G = G; this.bounds = bounds; this.onClose = close;
    const style = document.createElement('style');
    style.textContent = `#fieldMap[hidden]{display:none}#fieldMap{position:fixed;inset:0;z-index:120;background:#08141aee;color:#e4eef2;padding:20px;box-sizing:border-box;font:15px "Noto Sans TC",sans-serif;overflow:auto}#fieldMap header{display:flex;align-items:center;justify-content:space-between;gap:12px}#fieldMap h2{margin:0;font-size:24px}#fieldMap .fieldBody{display:flex;gap:22px;max-width:1220px;margin:16px auto}#fieldMap canvas{width:min(65vw,800px);height:auto;align-self:flex-start;border:1px solid #344b58}#fieldMap aside{flex:1;min-width:230px}#fieldMap button{display:block;background:#172a35;color:#e4eef2;border:1px solid #476373;border-radius:5px;padding:12px;text-align:left;font:inherit;cursor:pointer}#fieldMap aside button{width:100%;margin:10px 0}#fieldMap button[aria-pressed=true]{border-color:#ceadff;background:#302541}#fieldMap small{display:block;color:#adbac5;margin-top:5px}#fieldMap p{line-height:1.7;color:#b6c5ce}@media(max-width:700px){#fieldMap{padding:12px}#fieldMap .fieldBody{flex-direction:column}#fieldMap canvas{width:100%}#fieldMap h2{font-size:18px}}`;
    document.head.append(style);
    this.el = document.createElement('section'); this.el.id = 'fieldMap'; this.el.hidden = true; this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', '戰術地圖');
    this.el.innerHTML = '<header><h2>戰術地圖 · 作戰暫停</h2><button type="button" data-close>返回遊戲（M／Esc）</button></header><div class="fieldBody"><canvas width="800" height="680" aria-label="戰區平面圖"></canvas><aside><div data-sites></div><p>自由選擇接近方向，先偵察再開火。補給哨站可按任意順序攻略，主線仍由金色標記引導。</p><p>哨站清除後靠近補給罐按 E：回復生命、補充手榴彈與彈匣。無人機若遭擊落，仍需等待整備。</p><p>紅點：已目擊敵人<br>黃點：最後目擊位置<br>紫色：補給哨站／選定路標<br>青色：主角<br>北方在上；方格間距 25 公尺。</p><small>地圖僅顯示已發現的敵人。路標表示方向，請自行尋找巷道、出入口與樓梯。</small></aside></div>';
    document.body.append(this.el); this.cv = this.el.querySelector('canvas');
    this.el.querySelector('[data-close]').onclick = () => this.onClose();
    addEventListener('keydown', e => { if (!this.el.hidden && !e.repeat && ['KeyM', 'Escape'].includes(e.code)) { e.preventDefault(); this.onClose(); } });
  }
  close() { this.el.hidden = true; }
  open() { this.el.hidden = false; this.refresh(); this.el.querySelector('[data-close]').focus(); }
  refresh() {
    const G = this.G, F = G.field, sites = this.el.querySelector('[data-sites]'); sites.replaceChildren();
    const button = (id, title, sub) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.site = id || 'main'; b.setAttribute('aria-pressed', String(F.selected === id)); b.textContent = title;
      const s = document.createElement('small'); s.textContent = sub; b.append(s);
      b.onclick = () => { F.selected = id; this.refresh(); this.el.querySelector(`[data-site="${id || 'main'}"]`).focus(); }; sites.append(b);
    };
    button(null, '追蹤主線', G.objText || '前往主線目標');
    for (const o of F.outposts) button(o.id, o.name, F.status(o));
    this.draw();
  }
  draw() {
    const G = this.G, F = G.field, x = this.cv.getContext('2d'), [x0, x1, z0, z1] = this.bounds, pad = 36;
    const k = Math.min((800 - 2 * pad) / (x1 - x0), (680 - 2 * pad) / (z1 - z0)), ox = (800 - (x1 - x0) * k) / 2, oz = (680 - (z1 - z0) * k) / 2;
    const point = p => [ox + (p.x - x0) * k, oz + (p.z - z0) * k];
    x.fillStyle = '#0c1d27'; x.fillRect(0, 0, 800, 680); x.strokeStyle = '#1e3442'; x.lineWidth = 1;
    for (let w = Math.ceil(x0 / 25) * 25; w <= x1; w += 25) { x.beginPath(); x.moveTo(point({ x: w, z: z0 })[0], oz); x.lineTo(point({ x: w, z: z0 })[0], oz + (z1 - z0) * k); x.stroke(); }
    for (let w = Math.ceil(z0 / 25) * 25; w <= z1; w += 25) { x.beginPath(); x.moveTo(ox, point({ x: x0, z: w })[1]); x.lineTo(ox + (x1 - x0) * k, point({ x: x0, z: w })[1]); x.stroke(); }
    x.save(); x.beginPath(); x.rect(ox, oz, (x1 - x0) * k, (z1 - z0) * k); x.clip(); x.fillStyle = '#445462';
    for (const b of G.solid.list) if (!b.dead && !b.noMove && b.y0 < 3 && b.y1 > 1.5) { const p = point({ x: b.x0, z: b.z0 }); x.fillRect(p[0], p[1], (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); }
    for (const c of G.contacts.items.values()) { const p = point(c.p); x.fillStyle = c.fresh ? '#ff7264' : '#ffd477'; x.beginPath(); x.arc(...p, 3, 0, Math.PI * 2); x.fill(); }
    const mark = (p, col, label, selected = false, labelY = 5) => { const [a,b] = point(p); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = selected ? 3 : 1; x.beginPath(); x.moveTo(a,b-7); x.lineTo(a+7,b); x.lineTo(a,b+7); x.lineTo(a-7,b); x.closePath(); x.stroke(); x.font = '14px "Noto Sans TC",sans-serif'; x.fillStyle = '#e9eef2'; const w = x.measureText(label).width, left = a + 11 + w > ox + (x1 - x0) * k ? a - 11 - w : a + 11; x.fillText(label, Math.max(ox + 3, left), b+labelY); };
    if (G.hud.obj) mark(G.hud.obj.p, '#ffd477', '主線', !F.selected, 24);
    for (const o of F.outposts) mark(F.position(o), F.claimed.has(o.id) ? '#8799a5' : F.secured(o) ? '#b7efad' : '#ceadff', o.name, F.selected === o.id);
    x.save(); x.translate(...point(G.player.pos)); x.rotate(Math.PI - G.player.yaw); x.fillStyle = '#82f1ff'; x.beginPath(); x.moveTo(0,-9); x.lineTo(6,7); x.lineTo(0,4); x.lineTo(-6,7); x.closePath(); x.fill(); x.restore();
    if (G.scout.active) mark(G.scout.pos, '#82f1ff', '無人機'); x.restore();
    x.fillStyle = '#c8dce7'; x.font = '16px "Noto Sans TC",sans-serif'; x.fillText('↑ 北', 20, 26); x.font = '13px "Noto Sans TC",sans-serif'; x.fillText('M 返回遊戲 · 地圖上沒有尚未發現的敵人', 20, 664);
  }
}
