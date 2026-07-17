// HUNTR/X：魂門之戰 — M1 手感核心試作
// 範圍：Rumi 移動＋四段連段＋小鬼＋hit-stop／擊退／受擊閃白
'use strict';

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = 960, H = 540;
const MAP = { w: 1920, h: 1080 };

// ---------- 輸入 ----------
const keys = new Set();
let anyKeyPressed = false;
addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  anyKeyPressed = true;
  if (e.code === 'KeyJ' || e.code === 'KeyZ') attackBuffered = true;
});
addEventListener('keyup', e => keys.delete(e.code));
let attackBuffered = false;

// ---------- 全域狀態 ----------
let state = 'title';           // title | play | dead
let hitStop = 0;               // 命中凍結（秒）
let shake = 0;                 // 畫面震動強度
let kills = 0;
let combo = 0, comboTimer = 0;
let maxCombo = 0;
const cam = { x: MAP.w / 2 - W / 2, y: MAP.h / 2 - H / 2 };

// ---------- 玩家（Rumi）----------
const ATK = [
  { dur: 0.20, lunge: 170, range: 74, dmg: 1, kb: 280, arc: 1.9 },
  { dur: 0.20, lunge: 170, range: 74, dmg: 1, kb: 280, arc: 1.9 },
  { dur: 0.24, lunge: 200, range: 80, dmg: 1, kb: 330, arc: 2.2 },
  { dur: 0.34, lunge: 290, range: 100, dmg: 2, kb: 560, arc: 2.7, shake: 7 },
];

const player = {
  x: MAP.w / 2, y: MAP.h / 2,
  vx: 0, vy: 0,
  fx: 0, fy: 1,               // 面向（單位向量）
  r: 14,
  hp: 100, hpMax: 100,
  spd: 230,
  st: 'idle',                  // idle | run | atk | dead
  atkStage: 0, atkT: 0, didHit: false, chainQueued: false,
  hitSet: null,
  invuln: 0,
  runPhase: 0,
  flash: 0,
};

// ---------- 敵人 ----------
const enemies = [];
function spawnGrunt() {
  // 從鏡頭外緣生成
  const side = Math.floor(Math.random() * 4);
  let x, y;
  const m = 60;
  if (side === 0) { x = cam.x - m; y = cam.y + Math.random() * H; }
  else if (side === 1) { x = cam.x + W + m; y = cam.y + Math.random() * H; }
  else if (side === 2) { x = cam.x + Math.random() * W; y = cam.y - m; }
  else { x = cam.x + Math.random() * W; y = cam.y + H + m; }
  x = Math.max(20, Math.min(MAP.w - 20, x));
  y = Math.max(20, Math.min(MAP.h - 20, y));
  enemies.push({
    x, y, vx: 0, vy: 0, r: 12,
    hp: 1,
    spd: 85 + Math.random() * 40,
    st: 'chase',               // chase | windup | strike | recover | die
    t: 0,
    flash: 0,
    dieT: 0,
    wob: Math.random() * 6.28, // 走路搖擺相位
  });
}

// ---------- 特效 ----------
const particles = [];
function burst(x, y, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, s = spd * (0.4 + Math.random() * 0.8);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.45, max: 0.45, color, sz: 2 + Math.random() * 3 });
  }
}
const slashes = [];            // 斬擊弧線特效 {x,y,ang,arc,range,t,dur,stage}

// ---------- 地面預繪（夜市街景）----------
const ground = document.createElement('canvas');
ground.width = MAP.w; ground.height = MAP.h;
(function drawGround() {
  const g = ground.getContext('2d');
  g.fillStyle = '#12122a';
  g.fillRect(0, 0, MAP.w, MAP.h);
  // 斜角磁磚
  g.strokeStyle = 'rgba(90,90,160,0.18)';
  g.lineWidth = 1;
  for (let i = -MAP.h; i < MAP.w; i += 48) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + MAP.h * 0.6, MAP.h); g.stroke();
    g.beginPath(); g.moveTo(i + MAP.h * 0.6, 0); g.lineTo(i, MAP.h); g.stroke();
  }
  // 霓虹攤位（裝飾，M1 不做碰撞）
  const stalls = [
    { x: 300, y: 200, w: 180, h: 70, c: '#ff4fa3' }, { x: 1500, y: 240, w: 160, h: 70, c: '#4fd8ff' },
    { x: 260, y: 800, w: 170, h: 70, c: '#ffd84f' }, { x: 1480, y: 830, w: 190, h: 70, c: '#a04fff' },
    { x: 880, y: 130, w: 200, h: 60, c: '#4fff9e' }, { x: 900, y: 920, w: 180, h: 60, c: '#ff6a4f' },
  ];
  for (const s of stalls) {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(s.x + 6, s.y + 10, s.w, s.h);
    g.fillStyle = '#1c1c38';
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = s.c;
    g.fillRect(s.x, s.y, s.w, 14);
    g.shadowColor = s.c; g.shadowBlur = 22;
    g.fillRect(s.x, s.y, s.w, 14);
    g.shadowBlur = 0;
  }
  // 邊界光牆提示
  g.strokeStyle = 'rgba(160,79,255,0.5)';
  g.lineWidth = 4;
  g.strokeRect(8, 8, MAP.w - 16, MAP.h - 16);
})();

// ---------- 更新 ----------
function resetGame() {
  player.x = MAP.w / 2; player.y = MAP.h / 2;
  player.hp = player.hpMax; player.st = 'idle'; player.invuln = 0;
  player.atkStage = 0; player.atkT = 0;
  enemies.length = 0; particles.length = 0; slashes.length = 0;
  kills = 0; combo = 0; maxCombo = 0;
  for (let i = 0; i < 8; i++) spawnGrunt();
}

function updatePlayer(dt) {
  const p = player;
  if (p.st === 'dead') return;
  p.invuln = Math.max(0, p.invuln - dt);
  p.flash = Math.max(0, p.flash - dt);

  // 移動輸入
  let mx = 0, my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  const ml = Math.hypot(mx, my);
  if (ml > 0) { mx /= ml; my /= ml; }

  if (p.st === 'atk') {
    const a = ATK[p.atkStage];
    p.atkT += dt;
    // 突進速度衰減
    const lungeV = a.lunge * Math.max(0, 1 - p.atkT / (a.dur * 0.7));
    p.x += p.fx * lungeV * dt;
    p.y += p.fy * lungeV * dt;
    // 命中判定（單次）
    if (!p.didHit && p.atkT >= a.dur * 0.3) {
      p.didHit = true;
      let hitCount = 0;
      for (const e of enemies) {
        if (e.st === 'die') continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > a.range + e.r) continue;
        const dot = (dx * p.fx + dy * p.fy) / (d || 1);
        if (d > 24 && dot < Math.cos(a.arc / 2)) continue;   // 弧形範圍外
        // 命中！
        hitCount++;
        e.hp -= a.dmg;
        e.flash = 0.12;
        const kd = d || 1;
        e.vx += (dx / kd) * a.kb; e.vy += (dy / kd) * a.kb;
        burst(e.x, e.y, '#e8d8ff', 5, 140);
        combo++; comboTimer = 2.2;
        if (combo > maxCombo) maxCombo = combo;
        if (e.hp <= 0 && e.st !== 'die') {
          e.st = 'die'; e.dieT = 0.38;
          kills++;
          burst(e.x, e.y, '#a04fff', 14, 220);
        }
      }
      if (hitCount > 0) {
        hitStop = Math.min(0.09, 0.03 + hitCount * 0.008 + (p.atkStage === 3 ? 0.03 : 0));
        shake = Math.max(shake, (a.shake || 2) + hitCount * 0.4);
      }
      slashes.push({ x: p.x, y: p.y, ang: Math.atan2(p.fy, p.fx), arc: a.arc, range: a.range, t: 0, dur: 0.16, stage: p.atkStage });
    }
    // 連段銜接
    if (attackBuffered && p.atkT > a.dur * 0.45) { p.chainQueued = true; attackBuffered = false; }
    if (p.atkT >= a.dur) {
      if (p.chainQueued && p.atkStage < 3) {
        p.atkStage++;
        p.atkT = 0; p.didHit = false; p.chainQueued = false;
        if (ml > 0) { p.fx = mx; p.fy = my; }   // 連段中可轉向
      } else {
        p.st = 'idle'; p.atkStage = 0; p.chainQueued = false;
      }
    }
  } else {
    // idle / run
    if (ml > 0) {
      p.x += mx * p.spd * dt;
      p.y += my * p.spd * dt;
      p.fx = mx; p.fy = my;
      p.st = 'run';
      p.runPhase += dt * 11;
    } else {
      p.st = 'idle';
    }
    if (attackBuffered) {
      attackBuffered = false;
      p.st = 'atk'; p.atkStage = 0; p.atkT = 0; p.didHit = false; p.chainQueued = false;
    }
  }

  p.x = Math.max(24, Math.min(MAP.w - 24, p.x));
  p.y = Math.max(24, Math.min(MAP.h - 24, p.y));
}

function updateEnemies(dt) {
  const p = player;
  for (const e of enemies) {
    e.flash = Math.max(0, e.flash - dt);
    // 擊退速度衰減
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.vx *= Math.pow(0.0008, dt); e.vy *= Math.pow(0.0008, dt);

    if (e.st === 'die') {
      e.dieT -= dt;
      continue;
    }
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.st === 'chase') {
      if (d < 34 && p.st !== 'dead') { e.st = 'windup'; e.t = 0.45; }
      else {
        e.wob += dt * 8;
        const sway = Math.sin(e.wob) * 0.35;
        const ux = dx / d, uy = dy / d;
        e.x += (ux + -uy * sway) * e.spd * dt;
        e.y += (uy + ux * sway) * e.spd * dt;
      }
    } else if (e.st === 'windup') {
      e.t -= dt;
      if (e.t <= 0) {
        e.st = 'strike'; e.t = 0.12;
        if (d < 52 && p.invuln <= 0 && p.st !== 'dead') {
          p.hp -= 8;
          p.invuln = 0.8; p.flash = 0.15;
          const kd = d;
          p.vx = 0; p.vy = 0;
          p.x += (-dx / kd) * 26; p.y += (-dy / kd) * 26;
          shake = Math.max(shake, 5);
          burst(p.x, p.y, '#ff5a5a', 8, 180);
          combo = 0;
          if (p.hp <= 0) { p.hp = 0; p.st = 'dead'; state = 'dead'; burst(p.x, p.y, '#ffffff', 24, 260); }
        }
      }
    } else if (e.st === 'strike') {
      e.t -= dt;
      if (e.t <= 0) { e.st = 'recover'; e.t = 0.5; }
    } else if (e.st === 'recover') {
      e.t -= dt;
      if (e.t <= 0) e.st = 'chase';
    }
    e.x = Math.max(20, Math.min(MAP.w - 20, e.x));
    e.y = Math.max(20, Math.min(MAP.h - 20, e.y));
  }
  // 屍體清除
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].st === 'die' && enemies[i].dieT <= 0) enemies.splice(i, 1);
  }
  // 敵人彼此推開（避免疊成一坨）
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.st === 'die') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.st === 'die') continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
  }
  // 補怪：維持場上數量，隨擊殺數緩慢上升
  const target = Math.min(10 + Math.floor(kills / 12) * 2, 40);
  const alive = enemies.filter(e => e.st !== 'die').length;
  if (alive < target && Math.random() < 0.15) spawnGrunt();
}

function updateFx(dt) {
  comboTimer -= dt;
  if (comboTimer <= 0) combo = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { particles.splice(i, 1); continue; }
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vy += 300 * dt;
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    slashes[i].t += dt;
    if (slashes[i].t >= slashes[i].dur) slashes.splice(i, 1);
  }
  shake = Math.max(0, shake - dt * 28);
}

function updateCam(dt) {
  const tx = player.x - W / 2, ty = player.y - H / 2;
  const k = 1 - Math.pow(0.001, dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.x = Math.max(0, Math.min(MAP.w - W, cam.x));
  cam.y = Math.max(0, Math.min(MAP.h - H, cam.y));
}

// ---------- 繪製 ----------
function drawShadow(x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4, r, r * 0.4, 0, 0, 6.28);
  ctx.fill();
}

function drawRumi() {
  const p = player;
  const x = p.x, y = p.y;
  const bob = p.st === 'run' ? Math.sin(p.runPhase) * 2 : 0;
  drawShadow(x, y + 10, 13);
  ctx.save();
  ctx.translate(x, y + bob);
  const left = p.fx < -0.3;
  if (left) ctx.scale(-1, 1);

  // 受擊白閃／無敵閃爍
  const blink = p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;

  // 腿
  const lp = p.st === 'run' ? Math.sin(p.runPhase) * 4 : 0;
  ctx.fillStyle = '#22223a';
  ctx.fillRect(-6, 2 + lp * 0.4, 5, 10 - lp * 0.4);
  ctx.fillRect(2, 2 - lp * 0.4, 5, 10 + lp * 0.4);
  // 身體（黑外套＋紫飾線）
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#2b2b4a';
  ctx.fillRect(-8, -12, 16, 16);
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#a04fff';
  ctx.fillRect(-8, -12, 16, 3);
  // 頭
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#ffd9c0';
  ctx.beginPath(); ctx.arc(0, -20, 8, 0, 6.28); ctx.fill();
  // 紫髮＋長辮
  ctx.fillStyle = p.flash > 0 ? '#ffffff' : '#8f5cff';
  ctx.beginPath(); ctx.arc(0, -23, 8, Math.PI, 0); ctx.fill();
  ctx.fillRect(-8, -23, 16, 4);
  const braidSway = Math.sin(p.runPhase * 0.7) * 3;
  ctx.fillRect(-12 + braidSway * 0.3, -20, 4, 26 + braidSway);
  ctx.globalAlpha = 1;
  ctx.restore();

  // 劍（攻擊時畫在身體外，跟著面向）
  if (p.st === 'atk') {
    const a = ATK[p.atkStage];
    const prog = Math.min(1, p.atkT / a.dur);
    const base = Math.atan2(p.fy, p.fx);
    const swing = base - a.arc / 2 + a.arc * Math.min(1, prog * 1.6);
    ctx.save();
    ctx.translate(x, y - 8);
    ctx.rotate(swing);
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(10, -2, a.range - 18, 4);
    ctx.fillStyle = '#a04fff';
    ctx.fillRect(6, -3, 6, 6);
    ctx.restore();
  }
}

function drawGrunt(e) {
  const x = e.x, y = e.y;
  if (e.st === 'die') {
    const k = e.dieT / 0.38;
    ctx.globalAlpha = k;
    ctx.fillStyle = '#5b2a8c';
    ctx.beginPath(); ctx.arc(x, y - 8 * k, 11 * k, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  drawShadow(x, y + 6, 10);
  const wobble = Math.sin(e.wob * 1.5) * 1.5;
  const windup = e.st === 'windup';
  // 身體
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : (windup ? '#7c2450' : '#3a1f5e');
  ctx.beginPath();
  ctx.ellipse(x, y - 6 + wobble * 0.3, 11, 13, 0, 0, 6.28);
  ctx.fill();
  // 角
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#241040';
  ctx.beginPath(); ctx.moveTo(x - 7, y - 16); ctx.lineTo(x - 10, y - 24); ctx.lineTo(x - 3, y - 18); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 7, y - 16); ctx.lineTo(x + 10, y - 24); ctx.lineTo(x + 3, y - 18); ctx.fill();
  // 眼睛（蓄力時變紅）
  ctx.fillStyle = windup ? '#ff3a3a' : '#ffd84f';
  ctx.beginPath(); ctx.arc(x - 4, y - 8, 2.2, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, y - 8, 2.2, 0, 6.28); ctx.fill();
  // 蓄力警示圈
  if (windup) {
    ctx.strokeStyle = `rgba(255,58,58,${0.4 + 0.5 * Math.sin(e.t * 25)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 4, 20, 0, 6.28); ctx.stroke();
  }
}

function drawSlash(s) {
  const k = s.t / s.dur;
  ctx.save();
  ctx.translate(s.x, s.y - 8);
  ctx.rotate(s.ang);
  ctx.globalAlpha = 1 - k;
  const grad = ctx.createRadialGradient(0, 0, s.range * 0.3, 0, 0, s.range);
  grad.addColorStop(0, 'rgba(232,216,255,0)');
  grad.addColorStop(0.7, s.stage === 3 ? 'rgba(190,120,255,0.9)' : 'rgba(232,216,255,0.8)');
  grad.addColorStop(1, 'rgba(160,79,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, s.range * (0.8 + k * 0.3), -s.arc / 2, s.arc / 2);
  ctx.arc(0, 0, s.range * 0.35, s.arc / 2, -s.arc / 2, true);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // HP 條
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(20, 18, 224, 22);
  ctx.fillStyle = '#3a3a55';
  ctx.fillRect(22, 20, 220, 18);
  const hpk = player.hp / player.hpMax;
  ctx.fillStyle = hpk > 0.35 ? '#ff4fa3' : '#ff3a3a';
  ctx.fillRect(22, 20, 220 * hpk, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RUMI', 26, 34);
  // 擊殺數
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(`擊殺 ${kills}`, W - 24, 42);
  // 連段
  if (combo >= 3) {
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = combo >= 30 ? '#ffd84f' : '#e8d8ff';
    ctx.fillText(`${combo} HITS`, W - 24, 92);
  }
  // 操作提示
  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('WASD／方向鍵 移動 · J 或 Z 攻擊（連按出四段連段）', W / 2, H - 14);
}

function drawOverlay() {
  ctx.fillStyle = 'rgba(7,7,18,0.75)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  if (state === 'title') {
    ctx.fillStyle = '#a04fff';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText('HUNTR/X：魂門之戰', W / 2, H / 2 - 60);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('M1 手感試作 — Rumi', W / 2, H / 2 - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '16px sans-serif';
    ctx.fillText('WASD 移動 · J 攻擊（連按四段） · 按任意鍵開始', W / 2, H / 2 + 40);
  } else if (state === 'dead') {
    ctx.fillStyle = '#ff3a3a';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText('妳倒下了', W / 2, H / 2 - 40);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText(`擊殺 ${kills} · 最大連段 ${maxCombo}`, W / 2, H / 2 + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '16px sans-serif';
    ctx.fillText('按 R 再來一次', W / 2, H / 2 + 52);
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const sx = (Math.random() * 2 - 1) * shake;
  const sy = (Math.random() * 2 - 1) * shake;
  ctx.translate(-Math.round(cam.x + sx), -Math.round(cam.y + sy));

  ctx.drawImage(ground, 0, 0);

  // y 排序繪製（偽 2.5D）
  const drawList = [...enemies.map(e => ({ y: e.y, fn: () => drawGrunt(e) })), { y: player.y, fn: drawRumi }];
  drawList.sort((a, b) => a.y - b.y);
  for (const d of drawList) d.fn();

  for (const s of slashes) drawSlash(s);
  for (const pt of particles) {
    ctx.globalAlpha = pt.life / pt.max;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.sz / 2, pt.y - pt.sz / 2, pt.sz, pt.sz);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHUD();
  if (state !== 'play') drawOverlay();
}

// ---------- 主迴圈 ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'title') {
    if (anyKeyPressed) { anyKeyPressed = false; attackBuffered = false; resetGame(); state = 'play'; }
    render();
    return;
  }
  if (state === 'dead') {
    if (keys.has('KeyR')) { resetGame(); state = 'play'; }
    updateFx(dt);
    render();
    return;
  }

  // hit-stop：凍結世界但照常渲染
  if (hitStop > 0) {
    hitStop -= dt;
    render();
    return;
  }

  updatePlayer(dt);
  updateEnemies(dt);
  updateFx(dt);
  updateCam(dt);
  render();
}
requestAnimationFrame(loop);
