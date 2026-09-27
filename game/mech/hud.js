// 抬頭顯示（HUD）：畫在 #hud 2D 畫布上，像頭盔護目鏡投影
//   準心、敵機框（距離／耐久／失衡）、鎖定、飛彈鎖定圈、命中記號、受擊方向、AP／EN、武器、波次、橫幅、警報
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const COL = { cy: '127,243,255', am: '255,184,80', rd: '255,74,74', gr: '130,255,170', dim: '150,175,185', pk: '255,120,210' };
const rgba = (c, a) => `rgba(${COL[c] || c},${a})`;

export class HUD {
  constructor(canvas, camera) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.cam = camera;
    this.w = 0; this.h = 0; this.s = 1; this.t = 0;
    this.lockAnim = new Map();
    this.fov0 = camera.fov;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const d = Math.min(2, devicePixelRatio);
    this.c.width = innerWidth * d; this.c.height = innerHeight * d;
    this.w = innerWidth; this.h = innerHeight; this.d = d;
    this.s = clamp(Math.min(this.w / 1400, this.h / 820), 0.6, 1.4);
  }
  // 駕駛艙窗戶的 tan 空間（z＝-1 平面）→ 螢幕；用開機時的視角，不跟衝刺縮放跑
  tp(x, y) {
    const th = Math.tan(THREE.MathUtils.degToRad(this.fov0 / 2)), ta = th * this.w / this.h;
    return [this.w / 2 + x / ta * this.w / 2, this.h / 2 - y / th * this.h / 2];
  }
  clear() { this.x.setTransform(1, 0, 0, 1, 0, 0); this.x.clearRect(0, 0, this.c.width, this.c.height); }

  // 世界座標 → 螢幕；回傳 {x,y,front}
  proj(p, out = {}) {
    _v.copy(p).project(this.cam);
    const front = _w.copy(p).sub(this.cam.position).dot(this.cam.getWorldDirection(new THREE.Vector3())) > 0;
    out.x = (_v.x * 0.5 + 0.5) * this.w; out.y = (-_v.y * 0.5 + 0.5) * this.h; out.front = front;
    return out;
  }

  text(str, x, y, size, color, a = 1, align = 'left', weight = 600) {
    const X = this.x;
    X.font = `${weight} ${Math.round(size * this.s)}px Rajdhani, "Noto Sans TC", sans-serif`;
    X.textAlign = align; X.textBaseline = 'middle';
    X.fillStyle = rgba(color, a);
    X.fillText(str, x, y);
  }

  // g：遊戲狀態（main.js 組好）
  draw(dt, g) {
    this.t += dt;
    this.clear();
    const X = this.x, s = this.s, W = this.w, H = this.h;
    X.setTransform(this.d, 0, 0, this.d, 0, 0);
    X.lineCap = 'round'; X.lineJoin = 'round';
    const boot = g.boot;
    if (boot < 0.8) { this.drawBoot(g); return; }
    const on = clamp((boot - 0.8) / 0.2, 0, 1);
    X.globalAlpha = on;
    const C = g.combat, P = g.player;
    if (!C) return;
    X.shadowColor = rgba('cy', 0.6); X.shadowBlur = 6;

    // ---- 受傷：畫面邊緣紅光
    if (C.damageFx > 0.01) {
      const gr = X.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(255,40,30,0)'); gr.addColorStop(1, `rgba(255,40,30,${0.35 * C.damageFx})`);
      X.fillStyle = gr; X.fillRect(0, 0, W, H);
    }

    // ---- 準心位置＝瞄準方向投影
    const aimP = this.proj(_v.copy(C.eye).addScaledVector(C.aimDir, 400), {});
    const ax = aimP.x, ay = aimP.y;

    // ---- 敵機框
    const tgt = C.fireTarget();
    for (const e of C.enemies) {
      if (e.dead || e.gone) continue;
      const c = e.chest(new THREE.Vector3());
      const p = this.proj(c, {});
      const dist = c.distanceTo(P.pos);
      const onScr = p.front && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20;
      if (!onScr) { this.edgeArrow(p, e, dist, W, H, e === C.lockTarget); continue; }
      const top = this.proj(_w.copy(c).setY(c.y + 9 * e.scale), {});
      const hh = Math.max(14 * s, Math.abs(p.y - top.y));
      const hw = hh * 0.7;
      const locked = e === C.lockTarget, soft = e === tgt;
      const warn = e.warn > 0 || e.lunge > 0;
      const col = warn && Math.sin(this.t * 30) > 0 ? 'rd' : e.stagT > 0 ? 'am' : locked ? 'am' : 'rd';
      X.strokeStyle = rgba(col, soft ? 1 : 0.75); X.lineWidth = soft ? 2 : 1.3;
      const k = Math.min(hw, hh) * 0.35;
      // 四個角
      X.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x0 = p.x + sx * hw, y0 = p.y + sy * hh;
        X.moveTo(x0 - sx * k, y0); X.lineTo(x0, y0); X.lineTo(x0, y0 - sy * k);
      }
      X.stroke();
      if (locked) {   // 硬鎖定：外圈菱形旋轉
        const r = hh * 1.35 + 6;
        X.save(); X.translate(p.x, p.y); X.rotate(this.t * 1.5);
        X.beginPath(); X.moveTo(0, -r); X.lineTo(r, 0); X.lineTo(0, r); X.lineTo(-r, 0); X.closePath();
        X.strokeStyle = rgba('am', 0.9); X.lineWidth = 1.5; X.stroke(); X.restore();
      }
      // 耐久條＋距離
      const bw = Math.max(hw * 2, 60 * s);
      const by = p.y + hh + 8 * s;
      X.fillStyle = rgba('rd', 0.25); X.fillRect(p.x - bw / 2, by, bw, 3 * s);
      X.fillStyle = rgba(e.stagT > 0 ? 'am' : 'rd', 0.95); X.fillRect(p.x - bw / 2, by, bw * e.ap / e.apMax, 3 * s);
      if (e.stagT <= 0 && e.stag > 0) { X.fillStyle = rgba('am', 0.8); X.fillRect(p.x - bw / 2, by + 5 * s, bw * e.stag / e.K.stag, 2 * s); }
      this.text(`${Math.round(dist)}m`, p.x + hw + 6 * s, p.y - hh + 6 * s, 13, col, 0.9);
      this.text(e.kind === 'ace' ? 'ACE' : e.kind === 'heavy' ? 'HVY' : 'GNT', p.x + hw + 6 * s, p.y - hh + 20 * s, 11, col, 0.7);
      if (e.stagT > 0) this.text('STAGGER', p.x, p.y - hh - 10 * s, 13, 'am', 0.6 + 0.4 * Math.sin(this.t * 14), 'center', 700);
      if (warn) this.text(e.kind === 'heavy' ? 'MISSILE' : e.lunge > 0 ? 'MELEE' : 'CHARGE', p.x, p.y + hh + 22 * s, 13, 'rd', 1, 'center', 700);
      // 飛彈鎖定數
      const nl = C.msl.locks.filter((x) => x === e).length;
      if (nl) {
        for (let i = 0; i < nl; i++) {
          const a = (i / 6) * Math.PI * 2 + this.t * 2, r = hh + 12 * s;
          const mx = p.x + Math.cos(a) * r, my = p.y + Math.sin(a) * r;
          X.beginPath(); X.moveTo(mx, my - 5 * s); X.lineTo(mx + 5 * s, my); X.lineTo(mx, my + 5 * s); X.lineTo(mx - 5 * s, my); X.closePath();
          X.fillStyle = rgba('am', 0.95); X.fill();
        }
      }
    }

    // ---- 敵方飛彈
    for (const M of C.missiles) {
      if (M.own !== 'enemy') continue;
      const p = this.proj(M.pos, {});
      if (!p.front) continue;
      X.strokeStyle = rgba('rd', 0.9); X.lineWidth = 1.2;
      X.beginPath(); X.arc(p.x, p.y, 7 * s, 0, Math.PI * 2); X.stroke();
    }

    // ---- 飛彈鎖定圈（按住右鍵時）
    if (C.msl.locking) {
      const r = Math.tan(0.42) / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * H / 2;
      X.strokeStyle = rgba('am', 0.55); X.lineWidth = 1; X.setLineDash([6, 8]);
      X.beginPath(); X.arc(ax, ay, r, 0, Math.PI * 2); X.stroke(); X.setLineDash([]);
      this.text(`LOCK ${C.msl.locks.length}/${C.msl.max}`, ax, ay + r + 16 * s, 14, 'am', 1, 'center', 700);
    }

    // ---- 準心
    this.reticle(ax, ay, C, g);

    // ---- 受擊方向
    for (const d of C.dmgDirs) {
      const a = d.ang, r = Math.min(W, H) * 0.2;
      const al = clamp(d.t / 1.2, 0, 1);
      X.strokeStyle = rgba('rd', 0.9 * al); X.lineWidth = (4 + 6 * Math.min(1, d.s)) * s;
      X.beginPath(); X.arc(W / 2, H / 2, r, -Math.PI / 2 - a - 0.3, -Math.PI / 2 - a + 0.3); X.stroke();
    }

    // ---- 窗戶上緣中央：波次、敵數、分數、時間
    const tY = this.tp(0, 0.43)[1];
    this.text(C.wave ? `WAVE ${C.wave}/${g.waves}` : 'STANDBY', W / 2 - 14 * s, tY, 20, 'cy', 1, 'right', 700);
    const alive = C.enemies.filter((e) => !e.dead).length + C.events.filter((ev) => ev.spawn).length;
    this.text(`HOSTILES ${alive}`, W / 2 + 14 * s, tY, 20, alive ? 'rd' : 'dim', 1, 'left', 700);
    const mm = Math.floor(C.stats.time / 60), ss = Math.floor(C.stats.time % 60);
    this.text(`SCORE ${C.stats.score.toLocaleString()}   ${mm}:${String(ss).padStart(2, '0')}`, W / 2, tY + 20 * s, 13, 'cy', 0.75, 'center');
    const chainOn = C.stats.chain > 1 && C.stats.time - C.stats.lastKill < 8;
    if (chainOn) this.text(`CHAIN ×${C.stats.chain}`, W / 2, tY + 38 * s, 16, 'am', 1, 'center', 700);

    // ---- 下方中央：AP、EN、武器狀態
    const cx = W / 2, y0 = H - 104 * s, bw = 380 * s, x0 = cx - bw / 2;
    const apR = P.ap / P.apMax;
    const apC = apR < 0.3 ? 'rd' : apR < 0.55 ? 'am' : 'cy';
    this.text(`${Math.round(P.speed * 3.6)} km/h`, x0, y0 - 6 * s, 13, 'cy', 0.7);
    this.text(`AP ${Math.ceil(P.ap)}`, x0 + bw, y0 - 8 * s, 22, apC, apR < 0.3 ? 0.6 + 0.4 * Math.sin(this.t * 10) : 1, 'right', 700);
    this.bar(x0, y0 + 8 * s, bw, 6 * s, apR, apC);
    const enC = P.overheat > 0 ? 'rd' : P.odT > 0 ? 'pk' : 'cy';
    this.bar(x0, y0 + 19 * s, bw, 3 * s, P.en / 100, enC);
    if (P.overheat > 0) this.text('EN OVERHEAT', cx, y0 + 30 * s, 12, 'rd', 1, 'center', 700);
    const R = C.rifle, M = C.msl, SB = C.saber, OD = C.od, cw = bw / 4, wy = y0 + 46 * s;
    const chip = (i, label, val, v, col, hot) => {
      const x = x0 + i * cw + 3 * s, w = cw - 6 * s;
      this.text(label, x, wy, 11, hot ? col : 'dim', 0.9);
      this.text(val, x + w, wy, 13, col, hot ? 1 : 0.7, 'right', 700);
      this.bar(x, wy + 9 * s, w, 2 * s, v, col);
    };
    chip(0, 'RIFLE', R.reload >= 0 ? 'RELOAD' : `${R.ammo}/${R.mag}`, R.reload >= 0 ? R.reload : R.ammo / R.mag, R.reload >= 0 || R.ammo <= 3 ? 'am' : 'cy', true);
    chip(1, 'MSL', M.cd >= 1 ? 'READY' : `${Math.ceil((1 - M.cd) * 7)}s`, M.cd, M.cd >= 1 ? 'gr' : 'dim', M.cd >= 1);
    chip(2, 'SABER F', SB.cd >= 1 ? 'READY' : '', SB.cd, SB.cd >= 1 ? 'pk' : 'dim', SB.cd >= 1);
    chip(3, 'OD Q', OD.active ? 'ACTIVE' : OD.gauge >= 1 ? 'READY' : `${Math.floor(OD.gauge * 100)}%`, OD.gauge, 'pk', OD.gauge >= 1 || OD.active);

    // ---- 警報
    if (C.incoming > 0) {
      const a = 0.55 + 0.45 * Math.sin(this.t * 22);
      this.text('▲ MISSILE ALERT ▲', W / 2, H * 0.24, 22, 'rd', a, 'center', 700);
      this.text('點 SHIFT 閃避', W / 2, H * 0.24 + 22 * s, 14, 'rd', 0.85, 'center', 700);
    } else if (C.lockAlert > 0.3) this.text('LOCKED ON', W / 2, H * 0.24, 18, 'rd', 0.5 + 0.5 * Math.sin(this.t * 14), 'center', 700);
    if (apR < 0.3 && !C.dead) this.text('DANGER  AP LOW', W / 2, y0 - 30 * s, 16, 'rd', 0.5 + 0.5 * Math.sin(this.t * 9), 'center', 700);

    // ---- 小提示（準心右下）
    C.notes.forEach((n, i) => this.text(n.text, ax + 46 * s, ay + (30 + i * 18) * s, 15, n.color, clamp(n.t / 0.4, 0, 1), 'left', 700));

    // ---- 橫幅
    if (C.banner) {
      const B = C.banner, age = B.T - B.t;
      const a = clamp(age / 0.25, 0, 1) * clamp(B.t / 0.5, 0, 1);
      const y = H * 0.33;
      X.fillStyle = rgba(B.color, 0.08 * a); X.fillRect(0, y - 34 * s, W, 68 * s);
      X.fillStyle = rgba(B.color, 0.6 * a); X.fillRect(W / 2 - 260 * s * a, y - 34 * s, 520 * s * a, 1.5); X.fillRect(W / 2 - 260 * s * a, y + 33 * s, 520 * s * a, 1.5);
      this.text(B.text, W / 2, y - 6 * s, 40, B.color, a, 'center', 700);
      if (B.sub) this.text(B.sub, W / 2, y + 22 * s, 15, B.color, 0.8 * a, 'center', 600);
    }
    X.globalAlpha = 1; X.shadowBlur = 0;
  }

  reticle(x, y, C, g) {
    const X = this.x, s = this.s;
    const tgt = C.fireTarget();
    const col = tgt ? 'am' : 'cy';
    X.strokeStyle = rgba(col, 0.95); X.lineWidth = 1.6;
    const r = (tgt ? 16 : 22) * s, gap = 7 * s;
    X.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { X.moveTo(x + dx * gap, y + dy * gap); X.lineTo(x + dx * r, y + dy * r); }
    X.stroke();
    X.beginPath(); X.arc(x, y, 1.6 * s, 0, Math.PI * 2); X.fillStyle = rgba(col, 1); X.fill();
    // 彈匣弧（右）、飛彈冷卻弧（左）
    const R = C.rifle, rr = 34 * s;
    const ammoR = R.reload >= 0 ? R.reload : R.ammo / R.mag;
    X.lineWidth = 3 * s;
    X.strokeStyle = rgba(R.reload >= 0 ? 'am' : 'cy', 0.2); X.beginPath(); X.arc(x, y, rr, -0.7, 0.7); X.stroke();
    X.strokeStyle = rgba(R.reload >= 0 ? 'am' : 'cy', 0.85); X.beginPath(); X.arc(x, y, rr, 0.7 - 1.4 * ammoR, 0.7); X.stroke();
    X.strokeStyle = rgba('cy', 0.2); X.beginPath(); X.arc(x, y, rr, Math.PI - 0.7, Math.PI + 0.7); X.stroke();
    X.strokeStyle = rgba(C.msl.cd >= 1 ? 'gr' : 'dim', 0.85); X.beginPath(); X.arc(x, y, rr, Math.PI + 0.7 - 1.4 * C.msl.cd, Math.PI + 0.7); X.stroke();
    // 命中記號
    if (C.hitMark > 0) {
      const k = C.hitMark, a = 10 * s + (1 - k) * 6 * s, b = a + 9 * s;
      X.strokeStyle = C.killMark > 0.5 ? rgba('rd', k) : `rgba(255,255,255,${k})`; X.lineWidth = 2.2 * s;
      X.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { X.moveTo(x + dx * a, y + dy * a); X.lineTo(x + dx * b, y + dy * b); }
      X.stroke();
    }
    if (C.critMark > 0) this.text('CRITICAL', x, y - 46 * s, 20, 'am', C.critMark, 'center', 700);
    if (C.killMark > 0) this.text('DESTROYED', x, y + 52 * s, 18, 'rd', C.killMark, 'center', 700);
  }

  bar(x, y, w, h, v, col) {
    const X = this.x;
    X.fillStyle = rgba(col, 0.18); X.fillRect(x, y, w, h);
    X.fillStyle = rgba(col, 0.95); X.fillRect(x, y, w * clamp(v, 0, 1), h);
  }

  edgeArrow(p, e, dist, W, H, locked = false) {
    const X = this.x, s = this.s;
    let dx = p.x - W / 2, dy = p.y - H / 2;
    if (!p.front) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
    const a = Math.atan2(dy, dx);
    const m = 60 * s;
    const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-3), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-3));
    const x = W / 2 + Math.cos(a) * k, y = H / 2 + Math.sin(a) * k;
    const warn = e.warn > 0 || e.lunge > 0;
    X.save(); X.translate(x, y); X.rotate(a);
    const k2 = locked ? 1.6 : 1;
    X.beginPath(); X.moveTo(12 * s * k2, 0); X.lineTo(-6 * s * k2, -8 * s * k2); X.lineTo(-6 * s * k2, 8 * s * k2); X.closePath();
    X.fillStyle = rgba(locked ? 'am' : 'rd', warn ? 0.6 + 0.4 * Math.sin(this.t * 25) : 0.8); X.fill();
    X.restore();
    this.text(locked ? `LOCK ${Math.round(dist)}m` : `${Math.round(dist)}`, x - Math.cos(a) * 26 * s, y - Math.sin(a) * 26 * s, locked ? 13 : 11, locked ? 'am' : 'rd', 0.9, 'center', 700);
  }

  partsBox(x, y, parts) {
    const X = this.x, s = this.s;
    const c = (v) => (v > 0.66 ? 'cy' : v > 0.33 ? 'am' : 'rd');
    const R = (k, rx, ry, rw, rh) => { X.fillStyle = rgba(c(parts[k]), 0.25 + 0.5 * (1 - parts[k])); X.strokeStyle = rgba(c(parts[k]), 0.9); X.lineWidth = 1; X.fillRect(x + rx * s, y + ry * s, rw * s, rh * s); X.strokeRect(x + rx * s, y + ry * s, rw * s, rh * s); };
    R('head', 26, 0, 12, 10); R('torso', 20, 13, 24, 30); R('armL', 47, 14, 9, 28); R('armR', 8, 14, 9, 28); R('legL', 34, 46, 10, 36); R('legR', 20, 46, 10, 36);
    this.text('FRAME', x + 70 * s, y + 8 * s, 12, 'cy', 0.6);
  }

  drawBoot(g) {
    const X = this.x, W = this.w, H = this.h, b = g.boot;
    const lines = ['XG-01 AZURE FLAME', 'OS  IRON DUSK  COMBAT SYSTEM  v7.2', 'REACTOR ........ ONLINE', 'FRAME ........... OK', 'FCS ............. OK', 'THRUSTERS ....... OK', 'VISOR SHUTTER ... OPEN'];
    const n = Math.floor(clamp(b / 0.7, 0, 1) * lines.length);
    for (let i = 0; i < n; i++) this.text(lines[i], W * 0.5 - 170 * this.s, H * 0.35 + i * 22 * this.s, 15, i === 0 ? 'am' : 'cy', 0.9);
  }
}
