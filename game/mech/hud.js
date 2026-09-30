// 抬頭顯示（HUD）：畫在 #hud 2D 畫布上，戰機式投影——細線、等寬數字、同一套顏色（青＝正常、琥珀＝注意、紅＝警告），
//   每條線、每個字都有一圈深色描邊，亮天空和暗街道上都看得清楚。
//   上：任務列、航向帶、主注意／主警告；左右：對地速度帶、離地高度帶；中：俯仰梯、飛行路徑標、準心、目標指示框（距離＋接近率）、鎖定符號；
//   下：AP／EN、武器存量；另有飛彈鎖定圈、受擊方向、遭遇戰目標點、橫幅、警報
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Vector3(), _L = new THREE.Vector3();
const COL = { cy: '127,243,255', am: '255,184,80', rd: '255,74,74', gr: '130,255,170', dim: '150,175,185', pk: '255,120,210', ink: '4,14,18' };
const rgba = (c, a) => `rgba(${COL[c] || c},${a})`;
const HALO = (a) => `rgba(0,10,14,${a})`;
const MONO = '"B612 Mono", "Roboto Mono", Menlo, Consolas, "Noto Sans TC", monospace';
const SANS = 'Rajdhani, "Noto Sans TC", sans-serif';
const D = Math.PI / 180;
const pad = (n, k = 3) => String(Math.max(0, Math.round(n))).padStart(k, '0');
const wrapD = (a) => ((a % 360) + 540) % 360 - 180;
const PN = { head: 'HEAD', torso: 'TRSO', armL: 'ARM L', armR: 'ARM R', legL: 'LEG L', legR: 'LEG R' };

// 航電等寬字（B612 Mono）：駕駛艙通常已經載了；沒有就自己載
function loadMono() {
  if (document.getElementById('b612')) return;
  const l = document.createElement('link'); l.id = 'b612'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=B612+Mono:wght@400;700&display=swap';
  document.head.appendChild(l);
}

export class HUD {
  constructor(canvas, camera) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.cam = camera;
    this.w = 0; this.h = 0; this.s = 1; this.t = 0;
    this.fov0 = camera.fov;
    this.fwd = new THREE.Vector3();
    this.vc = 0; this.vcT = null; this.vcR = 0;   // 鎖定目標的接近率（km/h）
    this._f = null;
    loadMono();
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const d = Math.min(2, devicePixelRatio);
    this.c.width = innerWidth * d; this.c.height = innerHeight * d;
    this.w = innerWidth; this.h = innerHeight; this.d = d;
    this.s = clamp(Math.min(this.w / 1400, this.h / 820), 0.6, 1.4);
    this._f = null;
  }
  // 駕駛艙的 tan 空間（z＝-1 平面）→ 螢幕；用開機時的視角，不跟衝刺縮放跑
  tp(x, y) {
    const th = Math.tan(THREE.MathUtils.degToRad(this.fov0 / 2)), ta = th * this.w / this.h;
    return [this.w / 2 + x / ta * this.w / 2, this.h / 2 - y / th * this.h / 2];
  }
  clear() { this.x.setTransform(1, 0, 0, 1, 0, 0); this.x.clearRect(0, 0, this.c.width, this.c.height); }

  // 世界座標 → 螢幕；回傳 {x,y,front}（p 可以是任何暫存向量）
  proj(p, out = {}) {
    const c = this.cam.position, f = this.fwd;
    out.front = (p.x - c.x) * f.x + (p.y - c.y) * f.y + (p.z - c.z) * f.z > 0;
    _v.copy(p).project(this.cam);
    out.x = (_v.x * 0.5 + 0.5) * this.w; out.y = (-_v.y * 0.5 + 0.5) * this.h;
    return out;
  }

  // 字：先描一圈深色邊，再填色
  text(str, x, y, size, color, a = 1, align = 'left', weight = 400, font = MONO) {
    const X = this.x, fnt = `${weight} ${Math.round(size * this.s)}px ${font}`;
    if (this._f !== fnt) { X.font = fnt; this._f = fnt; }
    X.textAlign = align; X.textBaseline = 'middle';
    X.lineWidth = 3; X.strokeStyle = HALO(0.55 * a); X.strokeText(str, x, y);
    X.fillStyle = rgba(color, a); X.fillText(str, x, y);
  }
  // 描線：先畫一道深色底，再畫彩色細線
  sk(col, a = 0.95, lw = 1.3) {
    const X = this.x;
    X.strokeStyle = HALO(0.45 * a); X.lineWidth = lw + 2; X.stroke();
    X.strokeStyle = rgba(col, a); X.lineWidth = lw; X.stroke();
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
    this.cam.getWorldDirection(this.fwd);
    const f = this.fwd, hdg = ((-Math.atan2(f.x, f.z) / D) % 360 + 360) % 360;

    // ---- 受傷：畫面邊緣紅光
    if (C.damageFx > 0.01) {
      const gr = X.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(255,40,30,0)'); gr.addColorStop(1, `rgba(255,40,30,${0.35 * C.damageFx})`);
      X.fillStyle = gr; X.fillRect(0, 0, W, H);
    }

    // ---- 準心位置＝瞄準方向投影
    const aimP = this.proj(_a.copy(C.eye).addScaledVector(C.aimDir, 400), {});
    const ax = aimP.x, ay = aimP.y;

    // ---- 俯仰梯、飛行路徑標（機體實際往哪移動）
    this.ladder();
    this.fpm(P, ax, ay);

    // ---- 鎖定目標的接近率
    const tgt = C.fireTarget(), LT = C.lockTarget, L = LT && !LT.dead && !LT.gone ? LT : null;
    if (L) {
      const r = L.chest(_c).distanceTo(P.pos);
      if (this.vcT === L) { if (dt > 1e-4) this.vc = damp(this.vc, (this.vcR - r) / dt * 3.6, 5, dt); } else this.vc = 0;
      this.vcT = L; this.vcR = r;
    } else this.vcT = null;

    // ---- 敵機框（細紅角框）／鎖定目標＝目標指示框（琥珀方框＋中點刻線）
    let Lp = null, Lon = false;
    for (const e of C.enemies) {
      if (e.dead || e.gone) continue;
      const c = e.chest(_c), p = this.proj(c, {}), dist = c.distanceTo(P.pos), locked = e === L;
      const onScr = p.front && p.x > 20 && p.x < W - 20 && p.y > 20 && p.y < H - 20;
      if (locked) { Lp = p; Lon = onScr; _L.copy(c); }
      if (!onScr) { this.edgeArrow(p, e, dist, W, H, locked); continue; }
      const top = this.proj(_w.copy(c).setY(c.y + 9 * e.scale), {});
      const hh = Math.max(12 * s, Math.abs(p.y - top.y)), hw = hh * 0.7, soft = e === tgt;
      const warn = e.warn > 0 || e.lunge > 0;
      const col = warn && Math.sin(this.t * 30) > 0 ? 'rd' : e.stagT > 0 || locked ? 'am' : 'rd';
      let bx = hw, by = hh;
      X.beginPath();
      if (locked) {
        bx = by = Math.max(hw, hh) * 1.1 + 4 * s;
        X.rect(p.x - bx, p.y - by, bx * 2, by * 2);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { X.moveTo(p.x + dx * bx, p.y + dy * by); X.lineTo(p.x + dx * (bx + 6 * s), p.y + dy * (by + 6 * s)); }
        this.sk(col, 1, 1.5);
      } else {
        const k = Math.min(hw, hh) * 0.35;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x0 = p.x + sx * hw, y0 = p.y + sy * hh;
          X.moveTo(x0 - sx * k, y0); X.lineTo(x0, y0); X.lineTo(x0, y0 - sy * k);
        }
        this.sk(col, soft ? 1 : 0.75, soft ? 1.6 : 1.1);
      }
      // 耐久條＋失衡條
      const bw = Math.max(bx * 2, 50 * s), yb = p.y + by + 6 * s;
      X.fillStyle = HALO(0.45); X.fillRect(p.x - bw / 2 - 1, yb - 1, bw + 2, 2 * s + 2);
      X.fillStyle = rgba('rd', 0.3); X.fillRect(p.x - bw / 2, yb, bw, 2 * s);
      X.fillStyle = rgba(e.stagT > 0 ? 'am' : 'rd', 0.95); X.fillRect(p.x - bw / 2, yb, bw * clamp(e.ap / e.apMax, 0, 1), 2 * s);
      if (e.stagT <= 0 && e.stag > 0) { X.fillStyle = rgba('am', 0.85); X.fillRect(p.x - bw / 2, yb + 4 * s, bw * clamp(e.stag / e.K.stag, 0, 1), 1.5 * s); }
      // 距離、代號；鎖定目標多一行接近率（VC＋＝越來越近）
      const tx = p.x + bx + (locked ? 11 : 5) * s, ty = p.y - by + 5 * s;
      this.text(`${Math.round(dist)}m`, tx, ty, locked ? 12 : 11, col, 0.95, 'left', 700);
      this.text(e.label || (e.kind === 'ace' ? 'ACE' : e.kind === 'heavy' ? 'HVY' : 'GNT'), tx, ty + 13 * s, 10, col, 0.75);
      if (locked) this.text(`VC ${this.vc >= 0 ? '+' : '-'}${pad(Math.abs(this.vc))}`, tx, ty + 26 * s, 10, 'am', 0.9);
      if (e.stagT > 0) this.text('STAGGER', p.x, p.y - by - (locked ? 16 : 10) * s, 12, 'am', 0.6 + 0.4 * Math.sin(this.t * 14), 'center', 700);
      if (warn) this.text(e.kind === 'heavy' ? 'MISSILE' : e.lunge > 0 ? 'MELEE' : 'CHARGE', p.x, yb + 16 * s, 12, 'rd', 1, 'center', 700);
      // 飛彈鎖定數：框外一圈小菱形
      const nl = C.msl.locks.filter((x) => x === e).length;
      if (nl) {
        X.beginPath();
        for (let i = 0; i < nl; i++) {
          const a = (i / 6) * Math.PI * 2 + this.t * 2, r = Math.max(bx, by) + 12 * s;
          const mx = p.x + Math.cos(a) * r, my = p.y + Math.sin(a) * r, q = 4.5 * s;
          X.moveTo(mx, my - q); X.lineTo(mx + q, my); X.lineTo(mx, my + q); X.lineTo(mx - q, my); X.closePath();
        }
        X.fillStyle = rgba('am', 0.95); X.fill();
        X.strokeStyle = HALO(0.5); X.lineWidth = 1; X.stroke();
      }
    }

    // ---- 敵方飛彈
    X.beginPath();
    let nm = 0;
    for (const M of C.missiles) {
      if (M.own !== 'enemy') continue;
      const p = this.proj(M.pos, {});
      if (!p.front) continue;
      X.moveTo(p.x + 7 * s, p.y); X.arc(p.x, p.y, 7 * s, 0, Math.PI * 2); nm++;
    }
    if (nm) this.sk('rd', 0.95, 1.2);

    // ---- 飛彈鎖定圈（按住右鍵時）
    if (C.msl.locking) {
      const r = Math.tan(0.42) / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * H / 2;
      X.setLineDash([6, 8]); X.beginPath(); X.arc(ax, ay, r, 0, Math.PI * 2); this.sk('am', 0.6, 1); X.setLineDash([]);
      this.text(`LOCK ${C.msl.locks.length}/${C.msl.max}`, ax, ay + r + 14 * s, 12, 'am', 1, 'center', 700);
    }

    // ---- 目標指引線：鎖定目標在畫面外時，從準心指過去＋偏離角
    if (L && Lp && !Lon) {
      let dx = Lp.x - ax, dy = Lp.y - ay;
      if (!Lp.front) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx), ca = Math.cos(a), sa = Math.sin(a);
      X.beginPath(); X.moveTo(ax + ca * 26 * s, ay + sa * 26 * s); X.lineTo(ax + ca * 84 * s, ay + sa * 84 * s); this.sk('am', 0.9, 1.3);
      const ob = Math.acos(clamp(_w.subVectors(_L, this.cam.position).normalize().dot(f), -1, 1)) / D;
      this.text(`${Math.round(ob)}°`, ax + ca * 100 * s, ay + sa * 100 * s, 11, 'am', 0.95, 'center', 700);
    }

    // ---- 準心
    this.reticle(ax, ay, C);

    // ---- 受擊方向
    for (const d of C.dmgDirs) {
      const a = d.ang, r = Math.min(W, H) * 0.2;
      const al = clamp(d.t / 1.2, 0, 1);
      X.strokeStyle = rgba('rd', 0.9 * al); X.lineWidth = (4 + 6 * Math.min(1, d.s)) * s;
      X.beginPath(); X.arc(W / 2, H / 2, r, -Math.PI / 2 - a - 0.3, -Math.PI / 2 - a + 0.3); X.stroke();
    }

    // ---- 上方：第幾關／區域、敵數、分數、時間
    const EN = C.enc, tY = this.tp(0, 0.5)[1];
    this.text(g.label || (EN ? `STAGE ${C.stage}  AREA ${Math.min(EN.sec + 1, EN.N)}/${EN.N}` : `STAGE ${C.stage}/${g.stages}`), W / 2 - 12 * s, tY, 14, 'cy', 1, 'right', 700);
    const alive = C.enemies.filter((e) => !e.dead).length + C.events.filter((ev) => ev.spawn).length + (EN && EN.queue ? EN.queue.length : 0);
    this.text(`HOSTILES ${alive}`, W / 2 + 12 * s, tY, 14, alive ? 'rd' : 'dim', 1, 'left', 700);
    const mm = Math.floor(C.stats.time / 60), ss = Math.floor(C.stats.time % 60);
    this.text(`SCORE ${C.stats.score.toLocaleString()}   ${mm}:${String(ss).padStart(2, '0')}`, W / 2, tY + 17 * s, 11, 'cy', 0.75, 'center');

    // ---- 航向帶：±30°、每 5° 一格、每 10° 標數字（N／E／S／W）；中央框＝目前航向，下方小三角＝機頭
    const hx = W / 2, hy = this.tp(0, 0.4)[1], hw = 150 * s, kp = hw / 30;
    X.save(); X.beginPath(); X.rect(hx - hw - 2, hy - 30 * s, hw * 2 + 4, 44 * s); X.clip();
    X.beginPath(); X.moveTo(hx - hw, hy); X.lineTo(hx + hw, hy);
    const h0 = Math.ceil((hdg - 30) / 5) * 5;
    for (let d = h0; d <= hdg + 30; d += 5) { const x = hx + (d - hdg) * kp; X.moveTo(x, hy); X.lineTo(x, hy - ((d % 10 + 10) % 10 ? 4 : 7) * s); }
    this.sk('cy', 0.8, 1.1);
    for (let d = Math.ceil((hdg - 30) / 10) * 10; d <= hdg + 30; d += 10) {
      const x = hx + (d - hdg) * kp, v = ((d % 360) + 360) % 360;
      if (Math.abs(x - hx) < 30 * s || Math.abs(x - hx) > hw - 12 * s) continue;
      this.text(v % 90 ? pad(v) : 'NESW'[v / 90], x, hy - 15 * s, 10, 'cy', 0.8, 'center', v % 90 ? 400 : 700);
    }
    X.restore();
    X.beginPath(); X.rect(hx - 22 * s, hy - 24 * s, 44 * s, 17 * s); X.fillStyle = HALO(0.55); X.fill(); this.sk('cy', 0.95, 1.2);
    this.text(pad(hdg % 360), hx, hy - 15.5 * s, 12, 'cy', 1, 'center', 700);
    X.beginPath(); X.moveTo(hx, hy + 2 * s); X.lineTo(hx - 4 * s, hy + 8 * s); X.lineTo(hx + 4 * s, hy + 8 * s); X.closePath(); this.sk('cy', 0.95, 1.2);
    // 航向帶上的方位記號：鎖定目標（琥珀直線）、遭遇戰目標點（青色菱形）；超出範圍就貼在帶子兩端
    const brg = (px, pz) => wrapD(-Math.atan2(px - this.cam.position.x, pz - this.cam.position.z) / D - hdg);
    if (L) {
      const rb = brg(_L.x, _L.z), x = hx + clamp(rb, -30, 30) * kp;
      X.beginPath(); X.moveTo(x, hy + 3 * s); X.lineTo(x, hy + 12 * s); this.sk('am', Math.abs(rb) > 30 ? 0.55 : 1, 2);
    }
    if (EN && EN.wp) {
      const rb = brg(EN.wp.x, EN.wp.z), x = hx + clamp(rb, -30, 30) * kp, q = 4 * s;
      X.beginPath(); X.moveTo(x, hy + 3 * s); X.lineTo(x + q, hy + 3 * s + q); X.lineTo(x, hy + 3 * s + q * 2); X.lineTo(x - q, hy + 3 * s + q); X.closePath();
      this.sk('cy', Math.abs(rb) > 30 ? 0.55 : 1, 1.3);
    }
    const chainOn = C.stats.chain > 1 && C.stats.time - C.stats.lastKill < 8;
    if (chainOn) this.text(`CHAIN ×${C.stats.chain}`, W / 2, hy + 24 * s, 13, 'am', 1, 'center', 700);
    if (EN) this.objective(EN, hy + (chainOn ? 42 : 25) * s, W, H);

    // ---- 主注意（琥珀、常亮）／主警告（紅、閃）：亮起時下面列出原因
    const R = C.rifle, apR = P.ap / P.apMax, pc = C.parts || {};
    const caut = [], wrn = [];
    if (C.incoming > 0) wrn.push('MSL LAUNCH');
    if (apR < 0.3 && !C.dead) wrn.push('AP LOW');
    if (C.lockAlert > 0.3) caut.push('RDR LOCK');
    if (P.overheat > 0) caut.push('EN OVHT');
    if (R.reload >= 0) caut.push('RIFLE RLD'); else if (R.ammo <= 3) caut.push('AMMO LOW');
    if (apR >= 0.3 && apR < 0.55) caut.push(`AP ${Math.round(apR * 100)}%`);
    for (const k in PN) if (pc[k] !== undefined && pc[k] < 0.3) { caut.push(`DMG ${PN[k]}`); break; }
    this.master(this.tp(-0.42, 0.4), 'CAUTION', 'am', caut, true);
    this.master(this.tp(0.42, 0.4), 'WARNING', 'rd', wrn, Math.sin(this.t * 10) > -0.2);

    // ---- 左：對地速度帶（km/h）；右：離地高度帶（m）＋升降率
    //   機體後方視角：機體在畫面左半邊，速度帶改放到高度帶右邊，不壓在機體上
    const sd = g.tp ? 1 : -1, [sx0, sy0] = this.tp(g.tp ? 0.58 : -0.4, 0.03), [lx0] = this.tp(0.4, 0.03), th = 78 * s;
    const kmh = (P.speed || 0) * 3.6;
    this.vtape(sx0, sy0, kmh, 1.2 * s, 10, 20, sd, 'cy');
    this.text('GS  KM/H', sx0 + sd * 22 * s, sy0 - th - 11 * s, 10, 'dim', 0.9, 'center');
    const mode = P.boosting ? 'BOOST' : P.hovering ? 'HOVER' : P.grounded === false ? 'AIR' : 'GND';
    this.text(mode, sx0 + sd * 22 * s, sy0 + th + 12 * s, 11, P.boosting || P.hovering ? 'cy' : 'dim', 1, 'center', 700);
    const agl = Math.max(0, P.pos.y - (g.groundY ?? 0)), vs = P.vel ? P.vel.y : 0;
    this.vtape(lx0, sy0, agl, 3 * s, 5, 10, 1, 'cy');
    const vy = sy0 - clamp(vs, -th / (3 * s), th / (3 * s)) * 3 * s;   // 升降率指標：一秒後的高度
    X.beginPath(); X.moveTo(lx0 - 3 * s, vy); X.lineTo(lx0 - 10 * s, vy - 4 * s); X.lineTo(lx0 - 10 * s, vy + 4 * s); X.closePath(); this.sk('cy', 0.9, 1.1);
    this.text('AGL  M', lx0 + 22 * s, sy0 - th - 11 * s, 10, 'dim', 0.9, 'center');
    this.text(`VS ${vs >= 0 ? '+' : '-'}${Math.abs(vs).toFixed(1)}`, lx0 + 22 * s, sy0 + th + 12 * s, 11, Math.abs(vs) > 1 ? 'cy' : 'dim', 1, 'center', 700);

    // ---- 下方中央：AP（裝甲）、EN（能量）、武器存量
    const cx = W / 2, y0 = H - 98 * s, bw = 360 * s, x0 = cx - bw / 2;
    const apC = apR < 0.3 ? 'rd' : apR < 0.55 ? 'am' : 'cy', apA = apR < 0.3 ? 0.6 + 0.4 * Math.sin(this.t * 10) : 1;
    this.text('AP', x0, y0 - 9 * s, 11, 'dim', 0.95);
    this.text(String(Math.ceil(P.ap)), x0 + 24 * s, y0 - 10 * s, 18, apC, apA, 'left', 700);
    this.text(`${Math.round(apR * 100)}%`, x0 + bw, y0 - 9 * s, 12, apC, apA, 'right', 700);
    this.bar(x0, y0 + 2 * s, bw, 4 * s, apR, apC, true);
    const enC = P.overheat > 0 ? 'rd' : P.odT > 0 ? 'pk' : 'cy';
    this.text('EN', x0 - 6 * s, y0 + 11 * s, 9, 'dim', 0.95, 'right');
    this.bar(x0, y0 + 10 * s, bw, 2 * s, P.en / 100, enC);
    if (P.overheat > 0) this.text('EN OVERHEAT', cx, y0 + 22 * s, 11, 'rd', 1, 'center', 700);
    const M = C.msl, SB = C.saber, CN = C.cannon, OD = C.od, cb = 560 * s, cw = cb / 5, wy = y0 + 38 * s;
    const chip = (i, label, val, v, col, hot) => {   // 五格武器：比血條寬一點，字才不會擠在一起
      const x = cx - cb / 2 + i * cw + 4 * s, w = cw - 8 * s;
      this.text(label, x, wy, 10, hot ? col : 'dim', 0.95);
      this.text(val, x + w, wy, 11, col, hot ? 1 : 0.75, 'right', 700);
      this.bar(x, wy + 8 * s, w, 2 * s, v, col);
    };
    chip(0, 'RIFLE', R.reload >= 0 ? 'RELOAD' : `${R.ammo}/${R.mag}`, R.reload >= 0 ? R.reload : R.ammo / R.mag, R.reload >= 0 || R.ammo <= 3 ? 'am' : 'cy', true);
    chip(1, 'MSL', M.cd >= 1 ? 'READY' : `${Math.ceil((1 - M.cd) * 7)}s`, M.cd, M.cd >= 1 ? 'gr' : 'dim', M.cd >= 1);
    chip(2, 'SABER F', SB.cd >= 1 ? 'READY' : '', SB.cd, SB.cd >= 1 ? 'pk' : 'dim', SB.cd >= 1);
    chip(3, 'CANNON E', CN.phase ? (CN.phase === 'charge' ? 'CHARGE' : 'FIRE') : CN.cd >= 1 ? 'READY' : `${Math.ceil((1 - CN.cd) * 20)}s`, CN.phase ? 1 : CN.cd, CN.phase || CN.cd >= 1 ? 'cy' : 'dim', CN.cd >= 1 || !!CN.phase);
    chip(4, 'OD Q', OD.active ? 'ACTIVE' : OD.gauge >= 1 ? 'READY' : `${Math.floor(OD.gauge * 100)}%`, OD.gauge, 'pk', OD.gauge >= 1 || OD.active);

    // ---- 警報
    const ay0 = this.tp(0, 0.27)[1];
    if (C.incoming > 0) {
      const a = 0.55 + 0.45 * Math.sin(this.t * 22);
      this.text('▲ MISSILE ALERT ▲', W / 2, ay0, 18, 'rd', a, 'center', 700);
      this.text('點 SHIFT 閃避', W / 2, ay0 + 20 * s, 15, 'rd', 0.9, 'center', 700, SANS);
    } else if (C.lockAlert > 0.3) this.text('LOCKED ON', W / 2, ay0, 15, 'rd', 0.5 + 0.5 * Math.sin(this.t * 14), 'center', 700);
    if (apR < 0.3 && !C.dead) this.text('DANGER  AP LOW', W / 2, y0 - 30 * s, 14, 'rd', 0.5 + 0.5 * Math.sin(this.t * 9), 'center', 700);

    // ---- 小提示（準心右下）
    C.notes.forEach((n, i) => this.text(n.text, ax + 46 * s, ay + (30 + i * 18) * s, 15, n.color, clamp(n.t / 0.4, 0, 1), 'left', 700, SANS));

    // ---- 橫幅
    if (C.banner) {
      const B = C.banner, age = B.T - B.t;
      const a = clamp(age / 0.25, 0, 1) * clamp(B.t / 0.5, 0, 1);
      const y = H * 0.38;
      X.fillStyle = rgba(B.color, 0.08 * a); X.fillRect(0, y - 34 * s, W, 68 * s);
      X.fillStyle = rgba(B.color, 0.6 * a); X.fillRect(W / 2 - 260 * s * a, y - 34 * s, 520 * s * a, 1.5); X.fillRect(W / 2 - 260 * s * a, y + 33 * s, 520 * s * a, 1.5);
      this.text(B.text, W / 2, y - 6 * s, 40, B.color, a, 'center', 700, SANS);
      if (B.sub) this.text(B.sub, W / 2, y + 22 * s, 15, B.color, 0.8 * a, 'center', 600, SANS);
    }
    X.globalAlpha = 1;
  }

  // 俯仰梯（貼著真實地平線畫，機身側傾時跟著斜）：每 10° 一條，上方實線、下方虛線，兩端小勾指向地平線
  ladder() {
    const X = this.x, s = this.s, f = this.fwd, c = this.cam.position;
    const hz = Math.hypot(f.x, f.z);
    if (hz < 0.05) return;
    const hx = f.x / hz, hzz = f.z / hz, rx = -hzz, rz = hx, pit = Math.asin(clamp(f.y, -1, 1));
    const [l, t] = this.tp(-0.3, 0.3), [r, b] = this.tp(0.3, -0.3);
    X.save(); X.beginPath(); X.rect(l, t, r - l, b - t); X.clip();
    const p = {}, q = {};
    for (let e = -30; e <= 30; e += 10) {
      const er = e * D;
      if (Math.abs(er - pit) > 0.42) continue;
      const ce = Math.cos(er) * 100, se = Math.sin(er) * 100;
      this.proj(_a.set(c.x + hx * ce, c.y + se, c.z + hzz * ce), p);
      this.proj(_a.set(c.x + hx * ce + rx * 5, c.y + se, c.z + hzz * ce + rz * 5), q);
      if (!p.front) continue;
      let ux = q.x - p.x, uy = q.y - p.y;
      const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      const nx = -uy, ny = ux, g0 = (e ? 40 : 48) * s, g1 = (e ? 86 : 150) * s, tip = 6 * s * (e > 0 ? 1 : -1);
      X.beginPath();
      for (const k of [-1, 1]) {
        const x1 = p.x + ux * g1 * k, y1 = p.y + uy * g1 * k;
        X.moveTo(p.x + ux * g0 * k, p.y + uy * g0 * k); X.lineTo(x1, y1);
        if (e) X.lineTo(x1 + nx * tip, y1 + ny * tip);
      }
      X.setLineDash(e < 0 ? [7 * s, 5 * s] : []);
      this.sk('cy', e ? 0.5 : 0.6, 1.1);
      if (e) for (const k of [-1, 1]) this.text(String(Math.abs(e)), p.x + ux * (g1 + 12 * s) * k, p.y + uy * (g1 + 12 * s) * k, 10, 'cy', 0.6, 'center');
    }
    X.setLineDash([]);
    X.restore();
  }
  // 飛行路徑標：小圓＋兩翼＋尾翼，靠近準心時變淡
  fpm(P, ax, ay) {
    const v = P.vel;
    if (!v || v.lengthSq() < 6.25) return;
    const X = this.x, s = this.s, W = this.w, H = this.h;
    const p = this.proj(_a.copy(this.cam.position).addScaledVector(_o.copy(v).normalize(), 200), {});
    if (!p.front || p.x < 40 || p.x > W - 40 || p.y < 40 || p.y > H - 40) return;
    const a = clamp((Math.hypot(p.x - ax, p.y - ay) - 12 * s) / (24 * s), 0.3, 1) * 0.9, r = 5.5 * s;
    X.beginPath(); X.arc(p.x, p.y, r, 0, Math.PI * 2);
    X.moveTo(p.x - r, p.y); X.lineTo(p.x - r - 8 * s, p.y); X.moveTo(p.x + r, p.y); X.lineTo(p.x + r + 8 * s, p.y);
    X.moveTo(p.x, p.y - r); X.lineTo(p.x, p.y - r - 5 * s);
    this.sk('cy', a, 1.3);
  }
  // 直式刻度帶（速度／高度）：dir＝刻度往哪邊長（−1 左、1 右）；指針框顯示目前值
  vtape(x, y, v, k, step, lab, dir, col) {
    const X = this.x, s = this.s, hh = 78 * s, r = hh / k;
    X.save(); X.beginPath(); X.rect(x - 70 * s, y - hh - 2, 140 * s, hh * 2 + 4); X.clip();
    X.beginPath(); X.moveTo(x, y - hh); X.lineTo(x, y + hh);
    for (let t = Math.max(0, Math.ceil((v - r) / step) * step); t <= v + r; t += step) {
      const yy = y - (t - v) * k;
      X.moveTo(x, yy); X.lineTo(x + dir * (t % lab ? 4 : 8) * s, yy);
    }
    this.sk('cy', 0.75, 1.1);
    for (let t = Math.max(0, Math.ceil((v - r) / lab) * lab); t <= v + r; t += lab) {
      const yy = y - (t - v) * k;
      if (Math.abs(yy - y) < 13 * s) continue;
      this.text(String(t), x + dir * 12 * s, yy, 10, 'cy', 0.75, dir < 0 ? 'right' : 'left');
    }
    X.restore();
    const bw = 42 * s, bh = 17 * s, bx = x + dir * 6 * s;
    X.beginPath(); X.moveTo(x + dir * 1.5 * s, y); X.lineTo(bx, y - bh / 2); X.lineTo(bx + dir * bw, y - bh / 2); X.lineTo(bx + dir * bw, y + bh / 2); X.lineTo(bx, y + bh / 2); X.closePath();
    X.fillStyle = HALO(0.6); X.fill(); this.sk(col, 0.95, 1.2);
    this.text(pad(v), bx + dir * bw / 2, y + 0.5, 13, col, 1, 'center', 700);
  }
  // 主注意／主警告框：沒事就不顯示；lit＝實心亮框（深色字），否則空心框
  master([x, y], name, col, list, lit) {
    if (!list.length) return;
    const X = this.x, s = this.s, w = 70 * s, h = 16 * s;
    X.beginPath(); X.rect(x - w / 2, y - h / 2, w, h);
    if (lit) { X.fillStyle = rgba(col, 0.9); X.fill(); X.strokeStyle = HALO(0.5); X.lineWidth = 1; X.stroke(); this.text(name, x, y + 0.5, 11, 'ink', 1, 'center', 700); }
    else { X.fillStyle = HALO(0.5); X.fill(); this.sk(col, 0.95, 1.3); this.text(name, x, y + 0.5, 11, col, 1, 'center', 700); }
    list.slice(0, 3).forEach((t, i) => this.text(t, x, y + h / 2 + (9 + i * 12) * s, 10, col, 0.95, 'center'));
  }

  // 準心：細圓＋四根刻線＋中心點（有目標可打時變琥珀色）；右弧＝彈匣（一格一發）、左弧＝飛彈冷卻
  reticle(x, y, C) {
    const X = this.x, s = this.s, tgt = C.fireTarget(), col = tgt ? 'am' : 'cy', r = 15 * s;
    X.beginPath(); X.arc(x, y, r, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { X.moveTo(x + dx * (r + 2 * s), y + dy * (r + 2 * s)); X.lineTo(x + dx * (r + 8 * s), y + dy * (r + 8 * s)); }
    this.sk(col, 0.95, tgt ? 1.6 : 1.3);
    X.beginPath(); X.arc(x, y, 1.8 * s, 0, Math.PI * 2); X.fillStyle = rgba(col, 1); X.fill();
    const R = C.rifle, rr = 30 * s, rl = R.reload >= 0, ammoR = rl ? R.reload : R.ammo / R.mag, rc = rl ? 'am' : 'cy';
    X.lineCap = 'butt'; X.lineWidth = 2.6 * s;
    if (!rl) X.setLineDash([Math.max(1, 1.4 * rr / R.mag - 1.5), 1.5]);
    X.strokeStyle = rgba(rc, 0.2); X.beginPath(); X.arc(x, y, rr, -0.7, 0.7); X.stroke();
    X.strokeStyle = rgba(rc, 0.9); X.beginPath(); X.arc(x, y, rr, 0.7 - 1.4 * ammoR, 0.7); X.stroke();
    X.setLineDash([]);
    X.strokeStyle = rgba('cy', 0.2); X.beginPath(); X.arc(x, y, rr, Math.PI - 0.7, Math.PI + 0.7); X.stroke();
    X.strokeStyle = rgba(C.msl.cd >= 1 ? 'gr' : 'dim', 0.9); X.beginPath(); X.arc(x, y, rr, Math.PI + 0.7 - 1.4 * C.msl.cd, Math.PI + 0.7); X.stroke();
    X.lineCap = 'round';
    // 命中記號
    if (C.hitMark > 0) {
      const k = C.hitMark, a = 10 * s + (1 - k) * 6 * s, b = a + 9 * s;
      X.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { X.moveTo(x + dx * a, y + dy * a); X.lineTo(x + dx * b, y + dy * b); }
      this.sk(C.killMark > 0.5 ? 'rd' : '255,255,255', k, 2.2 * s);
    }
    if (C.critMark > 0) this.text('CRITICAL', x, y - 46 * s, 16, 'am', C.critMark, 'center', 700);
    if (C.killMark > 0) this.text('DESTROYED', x, y + 52 * s, 15, 'rd', C.killMark, 'center', 700);
  }

  // 橫條：深色底框＋底色＋填色（ticks＝四分刻度）
  bar(x, y, w, h, v, col, ticks = false) {
    const X = this.x;
    X.fillStyle = HALO(0.4); X.fillRect(x - 1, y - 1, w + 2, h + 2);
    X.fillStyle = rgba(col, 0.2); X.fillRect(x, y, w, h);
    X.fillStyle = rgba(col, 0.95); X.fillRect(x, y, w * clamp(v, 0, 1), h);
    if (ticks) { X.fillStyle = HALO(0.7); for (let i = 1; i < 4; i++) X.fillRect(x + w * i / 4 - 0.75, y, 1.5, h); }
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
    const k2 = (locked ? 1.5 : 1) * s;
    X.beginPath(); X.moveTo(12 * k2, 0); X.lineTo(-6 * k2, -7 * k2); X.lineTo(-3 * k2, 0); X.lineTo(-6 * k2, 7 * k2); X.closePath();
    X.fillStyle = rgba(locked ? 'am' : 'rd', warn ? 0.6 + 0.4 * Math.sin(this.t * 25) : 0.85); X.fill();
    X.strokeStyle = HALO(0.5); X.lineWidth = 1; X.stroke();
    X.restore();
    this.text(locked ? `LOCK ${Math.round(dist)}m` : `${Math.round(dist)}`, x - Math.cos(a) * 26 * s, y - Math.sin(a) * 26 * s, locked ? 11 : 10, locked ? 'am' : 'rd', 0.95, 'center', 700);
  }

  // 遭遇戰：前進距離、目標點（菱形／畫面外箭頭）、伏兵警示（紅色 !）
  objective(EN, y, W, H) {
    const X = this.x, s = this.s;
    for (const o of EN.warn || []) {
      const p = this.proj(_o.set(o.x, o.y, o.z), {}), a = 0.55 + 0.45 * Math.sin(this.t * 18);
      if (!(p.front && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 30)) { this.edgeMark(p, 'rd', '!', W, H, a); continue; }
      const r = 13 * s;
      X.beginPath(); X.moveTo(p.x, p.y - r); X.lineTo(p.x + r * 0.95, p.y + r * 0.7); X.lineTo(p.x - r * 0.95, p.y + r * 0.7); X.closePath();
      this.sk('rd', a, 1.8);
      this.text('!', p.x, p.y + 2 * s, 13, 'rd', a, 'center', 700);
    }
    if (!EN.wp) return;
    this.text(`前進 ▶ ${Math.round(EN.dist)}m`, W / 2, y, 15, 'cy', 0.8 + 0.2 * Math.sin(this.t * 4), 'center', 700, SANS);
    const p = this.proj(_o.set(EN.wp.x, EN.wp.y, EN.wp.z), {});
    if (!(p.front && p.x > 30 && p.x < W - 30 && p.y > 30 && p.y < H - 30)) { this.edgeMark(p, 'cy', `${Math.round(EN.dist)}m`, W, H, 0.9); return; }
    const r = 11 * s, b = 1 + 0.12 * Math.sin(this.t * 5);
    X.beginPath(); X.moveTo(p.x, p.y - r * b); X.lineTo(p.x + r * b, p.y); X.lineTo(p.x, p.y + r * b); X.lineTo(p.x - r * b, p.y); X.closePath();
    X.fillStyle = rgba('cy', 0.2); X.fill();
    this.sk('cy', 0.95, 1.6);
    this.text(`${Math.round(EN.dist)}m`, p.x, p.y + r + 11 * s, 11, 'cy', 0.95, 'center', 700);
  }
  edgeMark(p, col, label, W, H, al = 0.85) {
    const X = this.x, s = this.s;
    let dx = p.x - W / 2, dy = p.y - H / 2;
    if (!p.front) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1; }
    const a = Math.atan2(dy, dx), m = 76 * s;
    const k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-3), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-3));
    const x = W / 2 + Math.cos(a) * k, y = H / 2 + Math.sin(a) * k;
    X.save(); X.translate(x, y); X.rotate(a);
    X.beginPath(); X.moveTo(15 * s, 0); X.lineTo(-7 * s, -10 * s); X.lineTo(-2 * s, 0); X.lineTo(-7 * s, 10 * s); X.closePath();
    X.fillStyle = rgba(col, al); X.fill();
    X.strokeStyle = HALO(0.5); X.lineWidth = 1; X.stroke();
    X.restore();
    this.text(label, x - Math.cos(a) * 28 * s, y - Math.sin(a) * 28 * s, 12, col, al, 'center', 700);
  }

  // 開機自我檢測（BIT）：逐行跑出來，狀態字綠色；下方進度條
  drawBoot(g) {
    const X = this.x, W = this.w, H = this.h, b = g.boot, s = this.s;
    const lines = ['XG-01 AZURE FLAME', 'OS  IRON DUSK  COMBAT SYSTEM  v7.2', 'REACTOR ........ ONLINE', 'FRAME ........... OK', 'FCS ............. OK', 'THRUSTERS ....... OK', 'ALL-VIEW ........ ON'];
    const n = Math.floor(clamp(b / 0.7, 0, 1) * lines.length), x0 = W * 0.5 - 170 * s, y0 = H * 0.35;
    for (let i = 0; i < n; i++) {
      const Ln = lines[i], y = y0 + i * 22 * s;
      if (i < 2) { this.text(Ln, x0, y, i ? 12 : 15, i ? 'cy' : 'am', 0.95, 'left', 700); continue; }
      const k = Ln.lastIndexOf(' ') + 1, head = Ln.slice(0, k);
      this.text(head, x0, y, 12, 'cy', 0.85);
      this.text(Ln.slice(k), x0 + X.measureText(head).width, y, 12, 'gr', 1, 'left', 700);
    }
    const py = y0 + lines.length * 22 * s + 6 * s, pw = 340 * s, v = clamp(b / 0.8, 0, 1);
    this.bar(x0, py, pw, 3 * s, v, 'cy');
    this.text(`BIT ${pad(v * 100)}%`, x0 + pw, py + 14 * s, 11, 'dim', 0.95, 'right');
  }
}
