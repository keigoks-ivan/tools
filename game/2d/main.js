import { Arena } from './combat.js?v=20260924h';
import { FramePacer } from '../frame-pacing.js';
import { installGameGestures } from './touch-gestures.js';
import { depthScaleAt, FollowCamera } from './depth-view.js';
import { projectWarriorPoint, warriorBackgroundCrop } from './warrior-view.js';
import { warriorFrameAt } from './warrior-animation.js';

const $ = id => document.getElementById(id);
const canvas = $('battle');
const ctx = canvas.getContext('2d', { alpha: false });
const art = $('artCanvas');
const artCtx = art.getContext('2d');
const warriorView = new URLSearchParams(location.search).get('view') === 'warrior';
const arena = new Arena({ seed: 17, warriorMode: warriorView });
const pacer = new FramePacer(60);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.dataset.view = warriorView ? 'warrior' : 'arena';
const camera = new FollowCamera({ enabled: !reducedMotion });
installGameGestures($('game'));
const distanceHaze = ctx.createLinearGradient(0, 160, 0, 430);
distanceHaze.addColorStop(0, 'rgba(160,166,199,.12)');
distanceHaze.addColorStop(1, 'rgba(160,166,199,0)');
const keys = new Set();
const edges = {};
const joystick = { x: 0, y: 0, pointer: null };
const effects = [];
const images = {};
const imagePromises = {};
let assetsPromise, heroFrames, actionFrames, enemyFrames, mode = 'title', paused = false, rotated = false;
let frameId = 0, lastTime = 0, clock = 0, hudAt = 0, hitStop = 0, shake = 0;
let view = { scale: 1, x: 0, y: 0, dpr: 1 }, artAction = 'idle', artClock = 0, artWasPaused = false;
let toastUntil = 0, fpsFrames = 0, fpsAt = 0, framesDrawn = 0;
const debug = new URLSearchParams(location.search).has('debug');
const diagnostics = document.createElement('output');
if (debug) { diagnostics.id = 'diagnostics'; document.body.append(diagnostics); }

// Atlas frames are sampled once at load, never scanned during gameplay.
function atlas(image, columns, rows, rowEdges) {
  const scratch = document.createElement('canvas');
  scratch.width = image.width; scratch.height = image.height;
  const context = scratch.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const frames = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = Math.floor(col * image.width / columns);
      const y = rowEdges ? rowEdges[row] : Math.floor(row * image.height / rows);
      const right = Math.floor((col + 1) * image.width / columns);
      const bottom = rowEdges ? rowEdges[row + 1] : Math.floor((row + 1) * image.height / rows);
      let foot = y;
      for (let py = bottom - 1; py >= y; py--) {
        let solid = 0;
        for (let px = x; px < right; px++) if (pixels[(py * image.width + px) * 4 + 3] > 120) solid++;
        if (solid > 3) { foot = py; break; }
      }
      frames.push({ x, y, w: right - x, h: bottom - y, ax: (right - x) / 2, ay: foot - y });
    }
  }
  scratch.width = scratch.height = 1;
  return frames;
}

function loadImage(name, url) {
  if (imagePromises[name]) return imagePromises[name];
  imagePromises[name] = new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      image.onload = image.onerror = null; image.src = '';
      reject(new Error('下載等候較久，請再按一次重試。'));
    }, 45000);
    image.onload = () => { clearTimeout(timeout); images[name] = image; resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('圖片載入失敗，請再試一次。')); };
    image.src = url;
  }).catch(error => { delete imagePromises[name]; throw error; });
  return imagePromises[name];
}
function loadHero() {
  const requests = [loadImage('hero', warriorView ? './assets/rumi-rear-v2.webp' : './assets/rumi-actions-v2.webp')];
  if (warriorView) requests.push(loadImage('heroAction', './assets/rumi-rear-actions-v2.webp'));
  return Promise.all(requests).then(() => {
    if (warriorView) {
      heroFrames ||= [0, 1, 2, 3].map(index => ({
        x: index % 2 * 1024, y: Math.floor(index / 2) * 768,
        w: 1024, h: 768, ax: 512, ay: 700,
      }));
      actionFrames ||= [0, 1, 2, 3].map(index => ({
        x: index % 2 * 768, y: Math.floor(index / 2) * 640,
        w: 768, h: 640, ax: 384, ay: 590,
      }));
      return;
    }
    // The painted sheet uses uneven gutters; explicit crops preserve whole
    // blades and align pelvis/ground anchors instead of assuming a grid.
    heroFrames ||= [
      [0, 0, 416, 439, 220, 430], [438, 0, 360, 439, 185, 419], [856, 0, 398, 439, 220, 419],
      [0, 440, 416, 396, 220, 384], [417, 440, 476, 396, 213, 384], [897, 440, 357, 396, 180, 384],
      [0, 838, 416, 416, 220, 369], [422, 838, 414, 416, 210, 367], [851, 838, 403, 416, 221, 365],
    ].map(([x, y, w, h, ax, ay]) => ({ x, y, w, h, ax, ay }));
  });
}
async function loadAssets() {
  if (!assetsPromise) {
    let completed = 0, active = true;
    const track = promise => promise.then(() => {
      if (active) $('loadstatus').textContent = `正在準備夜市戰鬥… ${++completed} / 3`;
    });
    assetsPromise = Promise.all([
      track(loadHero()),
      track(loadImage('enemies', warriorView ? './assets/enemies-actions-v2.webp' : './assets/enemies-actions-v1.webp')),
      track(loadImage('arena', warriorView ? './assets/night-market-chase-v2.webp' : './assets/night-market-v1.webp')),
    ]).then(() => {
      enemyFrames = atlas(images.enemies, 4, 4, [0, 312, 610, 934, images.enemies.height]);
    }).catch(error => { assetsPromise = null; throw error; }).finally(() => { active = false; });
  }
  return assetsPromise;
}

function clearInput() {
  keys.clear(); Object.keys(edges).forEach(key => delete edges[key]);
  joystick.x = joystick.y = 0; joystick.pointer = null;
  $('knob').style.transform = '';
}
function resize() {
  clearInput();
  const width = canvas.clientWidth, height = canvas.clientHeight;
  view.dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * view.dpr); canvas.height = Math.round(height * view.dpr);
  view.scale = Math.min(width / 1280, height / 720);
  view.x = (width - 1280 * view.scale) / 2; view.y = (height - 720 * view.scale) / 2;
  rotated = innerWidth < innerHeight;
  $('rotateOverlay').hidden = !rotated || mode !== 'play';
  if (mode === 'art') { resizeArt(); drawArt(); }
  drawBattle(); syncLoop();
}
function resizeArt() {
  const rect = art.getBoundingClientRect();
  art.width = Math.round(rect.width * view.dpr); art.height = Math.round(rect.height * view.dpr);
}
function isRunning() { return mode === 'play' && !paused && !rotated && !document.hidden && arena.state === 'play'; }
function syncLoop() {
  const animate = !document.hidden && (isRunning() || mode === 'art' && artAction !== 'idle');
  if (!animate && frameId) { cancelAnimationFrame(frameId); frameId = 0; }
  if (animate && !frameId) { lastTime = 0; fpsAt = performance.now(); fpsFrames = 0; pacer.reset(); frameId = requestAnimationFrame(tick); }
}
function tick(timestamp) {
  frameId = 0;
  if (!pacer.shouldRender(timestamp)) { frameId = requestAnimationFrame(tick); return; }
  const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 1 / 60;
  lastTime = timestamp;
  if (mode === 'art') artClock += dt;
  else clock += dt;
  const renderStart = performance.now();
  if (mode === 'art') drawArt();
  else if (isRunning()) {
    if (hitStop > 0) hitStop -= dt;
    else {
      const x = joystick.x + (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const y = joystick.y + (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      arena.update(dt, { x, y, ...edges });
      Object.keys(edges).forEach(key => delete edges[key]);
      consumeEvents();
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].age += dt;
      if (effects[i].age >= effects[i].life) effects.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 28);
    camera.update(dt, arena.hero);
    drawBattle();
    if (clock >= hudAt) { updateHud(); hudAt = clock + 0.1; }
    if (arena.state !== 'play') finish();
  }
  framesDrawn++; fpsFrames++;
  if (debug && timestamp - fpsAt >= 1000) {
    diagnostics.textContent = `${Math.round(fpsFrames * 1000 / Math.max(1, timestamp - fpsAt))} fps · frame ${(performance.now() - renderStart).toFixed(1)} ms · enemies ${arena.enemies.length} · ${arena.hero.action} · position ${Math.round(arena.hero.x)},${Math.round(arena.hero.y)} · frames ${framesDrawn}`;
    fpsAt = timestamp; fpsFrames = 0;
  }
  if (!document.hidden && (isRunning() || mode === 'art' && artAction !== 'idle')) frameId = requestAnimationFrame(tick);
}

function effect(type, values, life) {
  if (effects.length >= 72) effects.shift();
  effects.push({ ...values, type, age: 0, life });
}
function announce(text, seconds = 2) { $('toast').textContent = text; toastUntil = clock + seconds; }
function consumeEvents() {
  for (const event of arena.drainEvents()) {
    if (event.type === 'slash') effect('slash', event, event.kind === 'heavy' ? 0.65 : 0.4);
    if (event.type === 'hit') {
      effect('number', event, 0.65);
      effect('spark', event, 0.28);
      hitStop = Math.max(hitStop, event.source === 'heavy' ? 0.045 : 0.022);
      shake = reducedMotion ? 0 : Math.max(shake, event.source === 'heavy' ? 3 : 1.2);
    }
    if (event.type === 'kill') { effect('soul', event, 0.6); if (warriorView) effect('defeat', event, 0.28); }
    if (event.type === 'special') { effect('nova', event, 0.65); shake = reducedMotion ? 0 : 5; announce('魂刃解放', 1); }
    if (event.type === 'dodge') effect('dash', event, 0.3);
    if (event.type === 'hurt') { effect('hurt', event, 0.3); shake = reducedMotion ? 0 : 3; }
    if (event.type === 'heal') announce('波次完成　／　恢復少量體力', 1.5);
    if (event.type === 'wave') announce(event.wave === 'boss' ? '鬼門守將現身' : `第 ${event.wave} 波　／　${event.wave === 1 ? '夜市突圍' : '敵勢增強'}`, 2.5);
  }
}
function heroFrame(action, time, animationClock = clock, combo = 1) {
  if (warriorView) return warriorFrameAt(action, time, animationClock, combo);
  if (action === 'run' || action === 'dodge') return 1 + Math.floor(animationClock * 9) % 2;
  if (action === 'attack') return time < 0.11 ? 3 : time < 0.25 ? 4 : 5;
  if (action === 'heavy' || action === 'special') return time < 0.27 ? 6 : time < 0.49 ? 7 : 8;
  return 0;
}
function heroSprite(context, action, time, x, y, size, flip, opacity = 1, animationClock = clock, combo = 1) {
  const index = heroFrame(action, time, animationClock, combo);
  const heading = warriorView && action === 'attack' && combo === 2 ? !flip : flip;
  if (warriorView && index >= 4) sprite(context, images.heroAction, actionFrames, index - 4, x, y, size * 1.12, heading, opacity);
  else sprite(context, images.hero, heroFrames, index, x, y, size, heading, opacity);
}
function sprite(context, image, frames, index, x, y, scale, flip, opacity = 1) {
  const frame = frames[index];
  context.save(); context.translate(x, y); context.scale(flip ? -scale : scale, scale); context.globalAlpha *= opacity;
  context.drawImage(image, frame.x, frame.y, frame.w, frame.h, -frame.ax, -frame.ay, frame.w, frame.h);
  context.restore();
}
function ellipse(x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function drawBattle() {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#080c16'; ctx.fillRect(0, 0, canvas.width / view.dpr, canvas.height / view.dpr);
  if (!images.arena || !heroFrames || !enemyFrames) return;
  ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1280, 720); ctx.clip();
  if (shake > 0) ctx.translate(Math.sin(clock * 110) * shake, Math.cos(clock * 90) * shake * 0.6);
  if (warriorView) {
    const crop = warriorBackgroundCrop(arena.hero, images.arena.width, images.arena.height);
    ctx.drawImage(images.arena, crop.x, crop.y, crop.width, crop.height, 0, 0, 1280, 720);
  } else {
    ctx.drawImage(images.arena, 0, 0, 1280, 720);
    ctx.fillStyle = distanceHaze; ctx.fillRect(0, 160, 1280, 270);
  }
  ctx.save(); if (!warriorView) camera.apply(ctx);
  const actors = [...arena.enemies].sort((a, b) => a.y - b.y);
  actors.push({ ...arena.hero, role: 'hero', id: 0 });
  for (const enemy of arena.enemies) {
    if (enemy.action === 'telegraph' || enemy.action === 'attack') {
      ctx.save();
      if (warriorView) {
        const point = projectWarriorPoint(enemy, arena.hero);
        ctx.translate(point.x, point.y); ctx.scale(point.scale / 0.68 * 0.76, 0.64); ctx.translate(-enemy.x, -enemy.y);
      }
      const progress = enemy.action === 'attack' ? 1 : Math.min(1, enemy.actionTime / (enemy.actionTime + enemy.telegraph));
      ellipse(enemy.x, enemy.y, enemy.range + 20, (enemy.range + 20) * 0.56, `rgba(255,105,95,${0.04 + progress * 0.14})`);
      ctx.strokeStyle = `rgba(255,166,108,${0.4 + progress * 0.6})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y, (enemy.range + 20) * progress, (enemy.range + 20) * 0.56 * progress, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  for (const actor of actors) {
    const hero = actor.role === 'hero', elite = actor.role === 'elite' || actor.role === 'boss';
    const point = warriorView ? projectWarriorPoint(actor, arena.hero) : { x: actor.x, y: actor.y, scale: depthScaleAt(actor.y) };
    ctx.save(); ctx.translate(point.x, point.y); ctx.scale(point.scale, point.scale); ctx.translate(-actor.x, -actor.y);
    const size = warriorView ? hero ? 0.78 : actor.role === 'boss' ? 1.65 : elite ? 1.4 : 1.25 : hero ? 0.48 : actor.role === 'boss' ? 0.76 : elite ? 0.53 : 0.43;
    ellipse(actor.x - 10, actor.y + 3, warriorView ? hero ? 98 : 52 : hero ? 42 : elite ? 48 : 34, warriorView ? 17 : 12, 'rgba(4,5,12,.13)');
    ellipse(actor.x, actor.y - 1, warriorView ? hero ? 75 : 42 : hero ? 30 : elite ? 36 : 25, warriorView ? 14 : 9, 'rgba(4,5,12,.45)');
    if (hero) {
      ellipse(actor.x, actor.y, warriorView ? 80 : 35, warriorView ? 14 : 10, 'rgba(178,145,255,.14)');
      ctx.strokeStyle = '#c9b1f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(actor.x, actor.y, warriorView ? 80 : 35, warriorView ? 14 : 10, 0, 0, Math.PI * 2); ctx.stroke();
      // Facing is a combat angle; the painted atlas has two mirrored headings.
      heroSprite(ctx, actor.action, actor.actionTime, actor.x, actor.y - (warriorView && actor.action === 'run' ? Math.sin(clock * 18) * 4 : 0), size, Math.cos(actor.facing) < -0.05, actor.invulnerable > 0 && Math.floor(clock * 15) % 2 ? 0.7 : 1, clock, actor.combo);
      if (!warriorView) { ctx.save(); ctx.translate(actor.x, actor.y); ctx.rotate(actor.facing); ctx.fillStyle = '#e7cef9'; ctx.beginPath(); ctx.moveTo(44, 0); ctx.lineTo(35, -4); ctx.lineTo(35, 4); ctx.fill(); ctx.restore(); }
    } else {
      let index = elite ? 8 : 0;
      if (actor.action === 'chase') index += 2 + Math.floor(clock * 7 + actor.id) % 2;
      else if (actor.action === 'telegraph') index += 4;
      else if (actor.action === 'attack') index += 5 + Math.min(2, Math.floor(actor.actionTime * 12));
      if (warriorView && actor.action === 'hit') { ctx.translate(actor.x, actor.y); ctx.rotate(Math.sin(actor.actionTime * 22) * 0.075); ctx.translate(-actor.x, -actor.y); }
      sprite(ctx, images.enemies, enemyFrames, index, actor.x, actor.y, size, Math.cos(actor.facing) > 0, actor.action === 'hit' ? warriorView ? 0.85 : 0.72 : 1);
      if (elite || actor.hp < actor.maxHp) {
        const width = actor.role === 'boss' ? 100 : 44;
        const top = actor.y - (warriorView ? actor.role === 'boss' ? 340 : elite ? 310 : 280 : elite ? 175 : 138);
        ctx.fillStyle = '#181521'; ctx.fillRect(actor.x - width / 2, top, width, 4);
        ctx.fillStyle = elite ? '#e6b985' : '#c09eb9'; ctx.fillRect(actor.x - width / 2, top, width * actor.hp / actor.maxHp, 4);
        if (elite) { ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0d9b7'; ctx.fillText(actor.role === 'boss' ? '鬼門守將' : '妖將', actor.x, top - 7); }
      }
    }
    ctx.restore();
  }
  if (warriorView) for (const enemy of arena.enemies) {
    if (enemy.action !== 'telegraph') continue;
    const point = projectWarriorPoint(enemy, arena.hero);
    const markerY = point.y - (enemy.role === 'boss' ? 350 : enemy.role === 'elite' ? 320 : 290) * point.scale;
    const duration = enemy.role === 'boss' ? 0.9 : enemy.role === 'elite' ? 0.82 : 0.72;
    const urgency = 1 - enemy.telegraph / duration;
    ctx.save(); ctx.translate(point.x, markerY);
    ctx.fillStyle = `rgba(175,42,59,${0.62 + urgency * 0.28})`;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(12, 0); ctx.lineTo(0, 14); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff0d7'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * urgency); ctx.stroke();
    ctx.fillStyle = '#fff2e8'; ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('!', 0, 5);
    ctx.restore();
  }
  for (const fx of effects) {
    if (warriorView) {
      const point = projectWarriorPoint(fx, arena.hero);
      ctx.save(); ctx.translate(point.x, point.y); ctx.scale(point.scale, point.scale); ctx.translate(-fx.x, -fx.y);
      drawEffect(fx); ctx.restore();
    } else drawEffect(fx);
  }
  ctx.restore();
  ctx.restore();
}
function drawEffect(fx) {
  const p = fx.age / fx.life;
  ctx.save(); ctx.translate(fx.x, fx.y); ctx.globalAlpha = Math.max(0, 1 - p);
  if (fx.type === 'slash') {
    if (warriorView) {
      const finisher = fx.kind === 'attack' && fx.combo === 3;
      const heavy = fx.kind === 'heavy' || finisher;
      const start = finisher ? 0.07 : heavy ? 0.21 : 0.07;
      const end = finisher ? 0.27 : heavy ? 0.43 : 0.27;
      if (fx.age < start || fx.age > end) { ctx.restore(); return; }
      const phase = (fx.age - start) / (end - start);
      ctx.translate(0, -340); ctx.scale((Math.cos(fx.facing) < 0 ? -1 : 1) * (fx.kind === 'attack' && fx.combo === 2 ? -1 : 1), 1);
      ctx.globalAlpha *= Math.min(1, (1 - phase) * 2.2);
      ctx.lineCap = 'round'; ctx.setLineDash([370, 370]); ctx.lineDashOffset = 370 * (1 - phase);
      ctx.beginPath();
      if (heavy) { ctx.moveTo(60, -180); ctx.quadraticCurveTo(205, -55, 155, 215); }
      else { ctx.moveTo(35, -105); ctx.quadraticCurveTo(220, -115, 240, 65); }
      ctx.strokeStyle = heavy ? '#c7a2ff' : '#a99cf5'; ctx.lineWidth = heavy ? 19 : 14; ctx.stroke();
      ctx.strokeStyle = '#fff5de'; ctx.lineWidth = heavy ? 5 : 4; ctx.stroke();
      ctx.restore(); return;
    }
    const heavy = fx.kind === 'heavy', delay = heavy ? 0.27 : 0.11;
    if (fx.age < delay) { ctx.restore(); return; }
    const q = (fx.age - delay) / (fx.life - delay), radius = heavy ? (fx.branch ? 215 : 190) : 145 + Math.min(fx.combo, 3) * 8;
    ctx.translate(0, -28); ctx.scale(1, 0.58); ctx.rotate(fx.facing);
    ctx.strokeStyle = heavy ? '#dec8ff' : '#c7b5f8'; ctx.lineWidth = (heavy ? 20 : 12) * (1 - q) + 1;
    ctx.beginPath(); ctx.arc(0, 0, radius * (0.8 + q * 0.2), -1.15 + q * 0.7, 0.8 + q * 0.6); ctx.stroke();
    ctx.strokeStyle = '#fff4e2'; ctx.lineWidth = 2; ctx.stroke();
  } else if (fx.type === 'defeat') {
    ctx.translate(0, p * 16); ctx.rotate((Math.cos(fx.facing) < 0 ? -1 : 1) * p * 0.8);
    const index = fx.role === 'boss' || fx.role === 'elite' ? 8 : 0;
    const size = warriorView ? fx.role === 'boss' ? 1.65 : fx.role === 'elite' ? 1.4 : 1.25 : fx.role === 'boss' ? 0.76 : fx.role === 'elite' ? 0.53 : 0.43;
    sprite(ctx, images.enemies, enemyFrames, index, 0, 0, size, Math.cos(fx.facing) > 0);
  } else if (fx.type === 'number') {
    ctx.font = `${fx.damage >= 8 ? 'bold 24' : '18'}px Georgia`; ctx.textAlign = 'center'; ctx.fillStyle = fx.damage >= 8 ? '#f7deb4' : '#fff5e8';
    ctx.fillText(fx.damage, 0, -90 - p * 45);
  } else if (fx.type === 'spark') {
    ctx.translate(0, -55); ctx.strokeStyle = '#fce3bb'; ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; ctx.beginPath(); ctx.moveTo(Math.cos(a) * p * 20, Math.sin(a) * p * 20); ctx.lineTo(Math.cos(a) * (10 + p * 45), Math.sin(a) * (10 + p * 45)); ctx.stroke(); }
  } else if (fx.type === 'nova') {
    ctx.strokeStyle = '#dec3ff'; ctx.lineWidth = 15 * (1 - p) + 2; ctx.beginPath(); ctx.ellipse(0, -10, fx.radius * p, fx.radius * p * 0.58, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (fx.type === 'soul') {
    ctx.fillStyle = '#c4a6f0';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.sin(i * 3) * p * 25, -35 - p * (60 + i * 6), 3 * (1 - p), 0, Math.PI * 2); ctx.fill(); }
  } else if (fx.type === 'dash') {
    ctx.rotate(fx.facing); ctx.strokeStyle = '#bdabd7'; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-20, i * 12); ctx.lineTo(-90 - p * 35, i * 12); ctx.stroke(); }
  } else if (fx.type === 'hurt') { ctx.strokeStyle = '#f29191'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -50, 40 + p * 20, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function updateHud() {
  const hero = arena.hero;
  $('hpFill').style.width = `${hero.hp}%`; $('hpText').textContent = Math.ceil(hero.hp);
  $('energyFill').style.width = `${hero.energy}%`;
  $('waveText').textContent = arena.bossQueued || arena.enemies.some(e => e.role === 'boss') ? '鬼門守將' : `第 ${arena.wave} 波 · ${Math.min(arena.waveKills, arena.waveGoal)} / ${arena.waveGoal}`;
  $('killText').textContent = String(arena.kills).padStart(2, '0');
  $('comboText').textContent = hero.combo > 1 && hero.action === 'attack' ? `${hero.combo} 連斬` : '';
  if (clock > toastUntil) $('toast').textContent = '';
  document.querySelector('[data-action="special"]').classList.toggle('ready', hero.energy >= 100);
}
async function start() {
  if ($('start').disabled) return;
  $('start').disabled = titleArtButton.disabled = true; $('loadstatus').textContent = '正在準備角色與夜市場景…';
  try {
    await loadAssets(); arena.reset(); camera.reset(); effects.length = 0; hitStop = shake = clock = hudAt = 0; clearInput();
    mode = 'play'; paused = false; $('title').hidden = true; $('result').hidden = true; $('pauseOverlay').hidden = true;
    document.body.dataset.mode = mode; $('loadstatus').textContent = ''; consumeEvents(); updateHud(); resize();
  } catch (error) { $('loadstatus').textContent = error.message; }
  finally { $('start').disabled = titleArtButton.disabled = false; }
}
function pause(value = !paused) {
  if (mode !== 'play' || arena.state !== 'play') return;
  paused = value; clearInput(); $('pauseOverlay').hidden = !paused; syncLoop();
}
function finish() {
  clearInput(); $('resultTitle').textContent = arena.state === 'win' ? '夜市重歸寧靜' : '重新集結';
  $('resultText').textContent = `擊倒 ${arena.kills} 名敵人。${arena.state === 'win' ? '你已完成這次單場戰鬥試作。' : '看到紅圈先閃避；普攻接重擊可以打退一群敵人。'}`;
  $('result').hidden = false; updateHud(); syncLoop();
}
function drawArt() {
  const w = art.width / view.dpr, h = art.height / view.dpr;
  artCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); artCtx.clearRect(0, 0, w, h);
  const chained = artAction === 'attack';
  const t = artClock % (chained ? 1.35 : artAction === 'attack' ? 0.8 : 1.2);
  const combo = chained ? Math.floor(t / 0.45) + 1 : 1;
  const phase = chained ? t % 0.45 : t;
  const action = artAction === 'attack' && phase > (chained ? 0.36 : 0.42) || artAction === 'heavy' && phase > 0.7 ? 'idle' : artAction;
  const size = warriorView ? Math.min(w / 1024 * 0.9, h / 768 * 0.9) : Math.min(w / 476 * 0.88, h / 439 * 0.88);
  heroSprite(artCtx, action, phase, w / 2, h * 0.94, size, false, 1, artClock, combo);
}
async function openArt() {
  if ($('start').disabled) return;
  $('start').disabled = titleArtButton.disabled = true;
  $('loadstatus').textContent = '正在準備角色動作…';
  try {
    await loadHero(); artWasPaused = paused; clearInput(); mode = 'art'; $('artOverlay').hidden = false;
    $('rotateOverlay').hidden = true; resizeArt(); drawArt(); syncLoop();
    $('loadstatus').textContent = '準備就緒';
  } catch (error) { $('loadstatus').textContent = error.message; }
  finally { $('start').disabled = titleArtButton.disabled = false; }
}
function closeArt() {
  mode = $('title').hidden ? 'play' : 'title'; paused = artWasPaused; $('artOverlay').hidden = true; resize();
}
$('start').addEventListener('click', start); $('retry').addEventListener('click', start);
$('pauseBtn').addEventListener('click', () => pause()); $('resume').addEventListener('click', () => pause(false));
$('artToggle').addEventListener('click', openArt); $('artClose').addEventListener('click', closeArt);
const artControls = document.createElement('div'); artControls.className = 'art-actions';
for (const [action, label] of [['idle', '站姿'], ['run', '奔跑'], ['attack', '連斬'], ['heavy', '重擊']]) {
  const button = document.createElement('button'); button.textContent = label; button.type = 'button'; button.dataset.preview = action;
  button.addEventListener('click', () => { artAction = action; artClock = 0; drawArt(); syncLoop(); }); artControls.append(button);
}
$('artOverlay').insertBefore(artControls, $('artOverlay').lastElementChild);
const titleArtButton = document.createElement('button'); titleArtButton.type = 'button'; titleArtButton.className = 'title-art-button'; titleArtButton.textContent = '先看角色與動作';
titleArtButton.addEventListener('click', () => openArt().catch(() => { $('loadstatus').textContent = '角色載入失敗，請再試一次。'; }));
$('loadstatus').before(titleArtButton);
const pauseArtButton = document.createElement('button'); pauseArtButton.type = 'button'; pauseArtButton.className = 'title-art-button'; pauseArtButton.textContent = '角色與動作近看';
pauseArtButton.addEventListener('click', openArt); $('resume').after(pauseArtButton);
const cameraButton = document.createElement('button'); cameraButton.type = 'button'; cameraButton.className = 'title-art-button';
function updateCameraButton() { cameraButton.textContent = `鏡頭跟隨：${camera.enabled ? '開' : '關'}`; cameraButton.setAttribute('aria-pressed', String(camera.enabled)); }
cameraButton.addEventListener('click', () => { camera.enabled = !camera.enabled; camera.reset(); updateCameraButton(); drawBattle(); });
updateCameraButton(); if (!warriorView) pauseArtButton.after(cameraButton);
const actionKeys = { j: 'attack', k: 'heavy', shift: 'dodge', e: 'special' };
addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (key === 'escape' && mode === 'art') { closeArt(); return; }
  if (key === 'p' && !event.repeat) { pause(); return; }
  if (!isRunning()) return;
  keys.add(key); if (actionKeys[key] && !event.repeat) edges[actionKeys[key]] = true;
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
const stick = $('stick');
function moveStick(event) {
  if (event.pointerId !== joystick.pointer) return;
  const rect = stick.getBoundingClientRect(), radius = rect.width * 0.34;
  const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1;
  joystick.x = dx * scale / radius; joystick.y = dy * scale / radius;
  $('knob').style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
}
stick.addEventListener('pointerdown', event => { if (!isRunning() || joystick.pointer !== null) return; event.preventDefault(); joystick.pointer = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); });
stick.addEventListener('pointermove', moveStick);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, event => { if (event.pointerId === joystick.pointer) { joystick.pointer = null; joystick.x = joystick.y = 0; $('knob').style.transform = ''; } });
for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('pointerdown', event => {
  if (!isRunning()) return; event.preventDefault(); button.setPointerCapture(event.pointerId); edges[button.dataset.action] = true;
  if (button.dataset.action === 'special' && arena.hero.energy < 100) announce('靈力未滿，擊中敵人可以蓄力', 1);
});
addEventListener('resize', resize);
addEventListener('blur', () => { clearInput(); pause(true); });
document.addEventListener('visibilitychange', () => { clearInput(); if (document.hidden) pause(true); syncLoop(); });
if (warriorView) {
  $('game').setAttribute('aria-label', '紫刃夜行 第三人稱戰鬥視角試作');
  document.querySelector('.title-subtitle').textContent = '第三人稱戰鬥視角試作';
  document.querySelector('.title-copy').textContent = '從紫刃身後進入夜市，迎戰鬼門前的敵群。';
  $('start').querySelector('span').textContent = '進入鬼門街區';
  document.title = '紫刃夜行｜第三人稱試作';
}
document.body.dataset.mode = mode; $('rotateOverlay').hidden = true; resize();
