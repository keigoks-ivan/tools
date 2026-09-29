// 介面（2D canvas）：準心、命中標記、彈量、生命／護盾、受擊方向、目標標記、無線電字幕、狙擊鏡、互動提示
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const CY = '#7ff3ff', AM = '#ffb347', RD = '#ff4a4a';

export class HUD {
  constructor(canvas, camera) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.cam = camera;
    this.hit = 0; this.head = 0; this.kill = 0;
    this.dmg = [];          // 受擊方向 {a, t}
    this.sub = null;        // 字幕 {who, text, t, T}
    this.subQ = [];
    this.banner = null;     // 章節標題
    this.prompt = null;
    this.obj = null;        // 目標 {p: Vector3, text}
    this.notes = [];
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() { const d = Math.min(devicePixelRatio, 2); this.c.width = innerWidth * d; this.c.height = innerHeight * d; this.d = d; }
  say(who, text, t = 3.5) { this.subQ.push({ who, text, t, T: t }); }
  title(big, small, t = 4) { this.banner = { big, small, t, T: t }; }
  note(text, color = CY) { this.notes.push({ text, t: 2, color }); if (this.notes.length > 4) this.notes.shift(); }
  hurt(angle) { this.dmg.push({ a: angle, t: 1.2 }); }
  marker(kind) { if (kind === 'kill') this.kill = 0.5; else if (kind === 'head') this.head = 0.35; this.hit = 0.25; }

  draw(dt, G) {
    const x = this.x, d = this.d, W = this.c.width / d, H = this.c.height / d;
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, W, H);
    if (!G || !G.playing) { this._subs(dt, W, H); this._banner(dt, W, H); return; }
    const vm = G.vm, P = G.player, cx = W / 2, cy = H / 2;
    // ---- 狙擊鏡
    if (vm.scoped) this._scope(W, H, G);
    // ---- 準心（依散布張開）
    else if (!P.dead) {
      const W0 = vm.W, spread = THREE.MathUtils.lerp(W0.spread * (1 + P.moveK * 0.8 + (P.grounded ? 0 : 1.5)), W0.adsSpread, vm.ads);
      const px = spread / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * (H / 2) + 4 + vm.kick.z * 2;
      const a = 1 - vm.ads * 0.85 - P.sprintK;
      if (a > 0.05) {
        x.globalAlpha = clamp(a, 0, 1);
        x.strokeStyle = 'rgba(230,250,255,0.9)'; x.lineWidth = 1.5; x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 3;
        x.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.moveTo(cx + dx * px, cy + dy * px); x.lineTo(cx + dx * (px + 8), cy + dy * (px + 8)); }
        x.stroke();
        x.fillStyle = 'rgba(230,250,255,0.9)'; x.fillRect(cx - 1, cy - 1, 2, 2);
        x.shadowBlur = 0; x.globalAlpha = 1;
      }
      // 手槍舉槍時：小點
      if (vm.cur === 'pistol' && vm.ads > 0.5) { x.fillStyle = 'rgba(127,243,255,0.9)'; x.fillRect(cx - 1.5, cy - 1.5, 3, 3); }
    }
    // ---- 命中標記
    if (this.hit > 0) {
      const k = this.hit / 0.25, r = 10 + (1 - k) * 4;
      x.strokeStyle = this.kill > 0 ? RD : this.head > 0 ? AM : '#fff'; x.lineWidth = this.kill > 0 ? 3 : 2; x.globalAlpha = k;
      x.beginPath();
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { x.moveTo(cx + sx * r, cy + sy * r); x.lineTo(cx + sx * (r + 7), cy + sy * (r + 7)); }
      x.stroke(); x.globalAlpha = 1;
      this.hit -= dt; this.head -= dt; this.kill -= dt;
    }
    // ---- 受擊方向（螢幕中央周圍的紅弧）
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const o = this.dmg[i]; o.t -= dt; if (o.t <= 0) { this.dmg.splice(i, 1); continue; }
      const a = o.a - Math.PI / 2;
      x.strokeStyle = `rgba(255,60,50,${clamp(o.t, 0, 1) * 0.85})`; x.lineWidth = 6;
      x.beginPath(); x.arc(cx, cy, Math.min(W, H) * 0.18, a - 0.35, a + 0.35); x.stroke();
    }
    // ---- 目標標記
    if (this.obj && !vm.scoped) this._objective(W, H, G);
    // ---- 左下：生命＋護盾
    const bx = 34, by = H - 60, bw = Math.min(260, W * 0.3);
    x.font = '600 12px Rajdhani, sans-serif'; x.fillStyle = '#9fb4bb'; x.textBaseline = 'alphabetic';
    x.fillText('SHIELD', bx, by - 26); x.fillText('VITAL', bx, by + 2);
    this._bar(bx + 52, by - 36, bw, 8, P.shield / 60, CY, 'rgba(127,243,255,0.15)');
    this._bar(bx + 52, by - 8, bw, 12, P.hp / 100, P.hp < 35 ? RD : '#e8f3f6', 'rgba(255,255,255,0.12)');
    // ---- 右下：武器與彈量
    const n = vm.ammo[vm.cur], mag = vm.W.mag;
    const rx = W - 34;
    x.textAlign = 'right';
    x.font = '700 46px Rajdhani, sans-serif'; x.fillStyle = n === 0 ? RD : n <= mag * 0.25 ? AM : '#eef6f8';
    x.fillText(String(n), rx - 70, H - 38);
    x.font = '600 20px Rajdhani, sans-serif'; x.fillStyle = '#8aa3ab'; x.fillText('/ ∞', rx, H - 40);
    x.font = '600 13px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = CY;
    x.fillText(vm.reloadT >= 0 ? 'RELOADING…' : vm.W.name, rx, H - 88);
    // 彈匣格
    for (let i = 0; i < mag; i++) { x.fillStyle = i < n ? 'rgba(127,243,255,0.9)' : 'rgba(127,243,255,0.15)'; const w = Math.min(10, 180 / mag - 2); x.fillRect(rx - (mag - i) * (w + 2), H - 30, w, 5); }
    if (vm.reloadT >= 0) { const k = vm.reloadT / vm.W.reload; x.fillStyle = 'rgba(255,179,71,0.9)'; x.fillRect(rx - 180, H - 22, 180 * k, 2); }
    // 另一把
    x.font = '600 11px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = '#5d7178';
    x.fillText((vm.cur === 'rifle' ? '[2] XP-2 手槍' : '[1] XLR-7 長槍'), rx, H - 106);
    x.textAlign = 'left';
    // ---- 互動提示
    if (this.prompt) {
      x.textAlign = 'center'; x.font = '600 16px Rajdhani, "Noto Sans TC", sans-serif';
      const t = this.prompt; const tw = x.measureText(t).width + 36;
      x.fillStyle = 'rgba(5,12,16,0.65)'; x.fillRect(cx - tw / 2, cy + 60, tw, 30);
      x.strokeStyle = 'rgba(127,243,255,0.6)'; x.strokeRect(cx - tw / 2, cy + 60, tw, 30);
      x.fillStyle = '#e8f3f6'; x.fillText(t, cx, cy + 80); x.textAlign = 'left';
    }
    // ---- 提示訊息（右上）
    let ny = 40;
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const o = this.notes[i]; o.t -= dt; if (o.t <= 0) { this.notes.splice(i, 1); continue; }
      x.globalAlpha = clamp(o.t * 2, 0, 1); x.textAlign = 'right'; x.font = '600 14px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = o.color;
      x.fillText(o.text, W - 34, ny); ny += 20; x.globalAlpha = 1; x.textAlign = 'left';
    }
    // ---- 左上：章節與目標文字
    if (G.objText) {
      x.font = '600 12px Rajdhani, sans-serif'; x.fillStyle = AM; x.fillText(G.chapterTag || '', 34, 40);
      x.font = '500 15px "Noto Sans TC", sans-serif'; x.fillStyle = '#e8f3f6'; x.fillText(G.objText, 34, 62);
    }
    this._subs(dt, W, H);
    this._banner(dt, W, H);
  }

  _bar(x0, y0, w, h, k, col, bg) {
    const x = this.x;
    x.fillStyle = bg; x.fillRect(x0, y0, w, h);
    x.fillStyle = col; x.fillRect(x0, y0, w * clamp(k, 0, 1), h);
  }

  // 目標標記：實心菱形（會輕輕閃）＋剩下幾公尺；跑到畫面外或背後時，貼在畫面邊緣、用箭頭指出方向
  _objective(W, H, G) {
    const x = this.x, p = this.obj.p.clone();
    const v = p.clone().project(this.cam);
    const behind = v.z > 1;
    let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    if (behind) { sx = W - sx; sy = H - sy; }
    const m = 56, cx = W / 2, cy = H / 2;
    const off = behind || sx < m || sx > W - m || sy < m || sy > H - m;
    if (off) {
      // 從畫面中心往目標方向，貼到邊框上
      let dx = sx - cx, dy = sy - cy; if (behind && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
    }
    const dist = this.obj.left ?? G.player.pos.distanceTo(p);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
    x.save(); x.translate(sx, sy);
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 6;
    if (off) {
      const a = Math.atan2(sy - cy, sx - cx);
      x.save(); x.rotate(a); x.fillStyle = AM; x.globalAlpha = 0.85 + 0.15 * pulse;
      x.beginPath(); x.moveTo(30, 0); x.lineTo(14, -13); x.lineTo(14, 13); x.closePath(); x.fill(); x.restore();
    }
    const r = 12 + pulse * 2;
    x.globalAlpha = 0.95; x.fillStyle = 'rgba(255,179,71,0.9)'; x.strokeStyle = '#1b1206'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -r); x.lineTo(r, 0); x.lineTo(0, r); x.lineTo(-r, 0); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#1b1206'; x.beginPath(); x.arc(0, 0, 3.2, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 4; x.font = '700 15px Rajdhani, sans-serif'; x.fillStyle = AM; x.textAlign = 'center';
    x.fillText(`${dist.toFixed(0)} m`, 0, r + 18);
    x.restore(); x.globalAlpha = 1;
  }

  _scope(W, H, G) {
    const x = this.x, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    // 鏡外全黑、鏡緣暗角
    x.fillStyle = '#000';
    x.beginPath(); x.rect(0, 0, W, H); x.arc(cx, cy, R, 0, Math.PI * 2, true); x.fill();
    const g = x.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    // 十字＋刻度
    x.strokeStyle = 'rgba(10,14,16,0.95)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx - 14, cy); x.moveTo(cx + 14, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy + 14); x.lineTo(cx, cy + R); x.moveTo(cx, cy - R); x.lineTo(cx, cy - 14); x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx - R * 0.55, cy); x.moveTo(cx + R * 0.55, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy + R * 0.55); x.lineTo(cx, cy + R); x.stroke();
    x.lineWidth = 1.5;
    for (let i = 1; i <= 5; i++) { const o = i * R * 0.08; x.beginPath(); x.moveTo(cx - 5, cy + o); x.lineTo(cx + 5, cy + o); x.moveTo(cx + o, cy - 4); x.lineTo(cx + o, cy + 4); x.moveTo(cx - o, cy - 4); x.lineTo(cx - o, cy + 4); x.stroke(); }
    // 中心紅點
    x.fillStyle = 'rgba(255,60,40,0.95)'; x.beginPath(); x.arc(cx, cy, 2.2, 0, 7); x.fill();
    // 測距、屏息條
    x.font = '600 13px Rajdhani, sans-serif'; x.fillStyle = 'rgba(255,179,71,0.9)'; x.textAlign = 'left';
    x.fillText(`RNG ${G.scopeRange ? G.scopeRange.toFixed(1) : '---'} m`, cx + R * 0.2, cy + R * 0.25);
    x.fillText(`x${(70 / G.vm.W.fov).toFixed(1)}`, cx + R * 0.2, cy + R * 0.25 + 18);
    const b = G.vm.breath;
    x.fillStyle = 'rgba(127,243,255,0.2)'; x.fillRect(cx - 60, cy + R * 0.72, 120, 4);
    x.fillStyle = G.vm.holding ? CY : 'rgba(127,243,255,0.6)'; x.fillRect(cx - 60, cy + R * 0.72, 120 * b, 4);
    x.textAlign = 'center'; x.fillStyle = 'rgba(200,230,240,0.6)'; x.font = '500 11px "Noto Sans TC", sans-serif';
    x.fillText(G.vm.holding ? '屏息中' : 'SHIFT 屏息', cx, cy + R * 0.72 + 18);
    x.textAlign = 'left';
  }

  _subs(dt, W, H) {
    const x = this.x;
    if (!this.sub && this.subQ.length) this.sub = this.subQ.shift();
    const s = this.sub; if (!s) return;
    s.t -= dt; if (s.t <= 0) { this.sub = null; return; }
    const a = clamp(Math.min(s.t, s.T - s.t) * 4, 0, 1);
    x.globalAlpha = a; x.textAlign = 'center';
    x.font = '500 17px "Noto Sans TC", sans-serif';
    const line = s.text, who = s.who;
    const tw = x.measureText(line).width;
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(W / 2 - tw / 2 - 16, H - 150, tw + 32, 50);
    x.font = '600 12px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = who.startsWith('獵犬') ? RD : AM; x.fillText(who, W / 2, H - 132);
    x.font = '500 17px "Noto Sans TC", sans-serif'; x.fillStyle = '#eef6f8'; x.fillText(line, W / 2, H - 110);
    x.globalAlpha = 1; x.textAlign = 'left';
  }

  _banner(dt, W, H) {
    const b = this.banner; if (!b) return;
    b.t -= dt; if (b.t <= 0) { this.banner = null; return; }
    const a = clamp(Math.min(b.t, b.T - b.t) * 2, 0, 1), x = this.x;
    x.globalAlpha = a; x.textAlign = 'center';
    x.font = '700 38px Rajdhani, "Noto Sans TC", sans-serif'; x.fillStyle = '#eef6f8'; x.shadowColor = 'rgba(127,243,255,0.5)'; x.shadowBlur = 18;
    x.fillText(b.big, W / 2, H * 0.3);
    x.shadowBlur = 0;
    x.font = '500 16px "Noto Sans TC", sans-serif'; x.fillStyle = AM; x.fillText(b.small, W / 2, H * 0.3 + 32);
    x.globalAlpha = 1; x.textAlign = 'left';
  }
}
