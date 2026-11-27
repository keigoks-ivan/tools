"use strict";

const W = 800;
const H = 480;
const GRAVITY = 1320;
const SPEED = 240;
const JUMP = 560;
const MAX_HEARTS = 3;
const COLORS = [
  { pale: "#ffd6e3", base: "#e98fae", edge: "#9d537b", ink: "#74385c" },
  { pale: "#ffe7a8", base: "#f4bd63", edge: "#a97237", ink: "#754820" },
  { pale: "#d4dcff", base: "#9ea7eb", edge: "#665ca3", ink: "#4f447d" }
];
const PLATFORM_COLORS = [
  ["#c5f5bf", "#ace4a2", "#75bd8d", "#58aa89", "#407c65", "#eaffeb30"],
  ["#f3dcff", "#dbbdf0", "#b18bc9", "#9675b6", "#795b9c", "#ffe0ff42"],
  ["#ffedbd", "#fdd394", "#e8a975", "#cc865f", "#945f47", "#ffe0b957"],
  ["#d5f1ff", "#b3dcfd", "#85b1e1", "#659bce", "#4f75a7", "#9db9ff47"]
];
const get = (id) => document.getElementById(id);
const canvas = get("screen");
const ctx = canvas.getContext("2d");
const overlay = get("overlay");
const action = get("action");
const help = get("instructions");
const mutedKey = "bubble-valley-muted";
const bestKey = "bubble-valley-best";
const progressKey = "bubble-valley-progress";
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const formatter = new Intl.NumberFormat("zh-TW");
const translatedElements = [
  ["data-en", null],
  ["data-en-label", "aria-label"]
].flatMap(([data, attribute]) => Array.from(document.querySelectorAll(`[${data}]`), (node) => ({
  node, attribute, zh: attribute ? node.getAttribute(attribute) : node.textContent, en: node.getAttribute(data)
})));

function read(name) {
  try { return localStorage.getItem(name); } catch { return null; }
}
function store(name, value) {
  try { localStorage.setItem(name, value); } catch { /* Preferences also work for the current visit. */ }
}

function readProgress() {
  try {
    const [index, score, hearts] = JSON.parse(read(progressKey)) ?? [];
    if (Number.isInteger(index) && index >= 0 && index <= STAGES.length &&
      Number.isSafeInteger(score) && score >= 0 && Number.isInteger(hearts) && hearts > 0 &&
      hearts <= MAX_HEARTS) return [index, score, hearts];
  } catch { /* Invalid progress starts a new game. */ }
  return [0, 0, MAX_HEARTS];
}

function saveProgress(index, score, hearts = MAX_HEARTS) {
  store(progressKey, JSON.stringify([index, score, hearts]));
}

const keys = new Set();
const touches = new Map();
const pads = ["left", "right", "jump", "puff"].map(get);
const sprite = new Image();
sprite.src = "./assets/zuzu.webp";
let scenery;
let game;
let previousTime;
let audio;
let english = read("lang") === "en";
let muted = read(mutedKey) === "true";
let best = Math.max(0, Number.parseInt(read(bestKey), 10) || 0);
const t = (zh, en) => english ? en : zh;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

function chime(pitches, volume = .035) {
  if (muted) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ??= new Audio();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    pitches.forEach((pitch, i) => {
      const start = audio.currentTime + i * .065;
      const wave = audio.createOscillator();
      const gain = audio.createGain();
      wave.type = "sine";
      wave.frequency.setValueAtTime(pitch, start);
      wave.frequency.exponentialRampToValueAtTime(pitch * 1.13, start + .08);
      gain.gain.setValueAtTime(.001, start);
      gain.gain.linearRampToValueAtTime(volume, start + .012);
      gain.gain.exponentialRampToValueAtTime(.001, start + .13);
      wave.connect(gain).connect(audio.destination);
      wave.start(start);
      wave.stop(start + .14);
    });
  } catch { /* The game runs without audio. */ }
}

function announce(message) {
  get("announcement").textContent = message;
}

function setLanguage() {
  document.documentElement.lang = t("zh-Hant", "en");
  document.title = t("泡泡跳跳谷 · Bubble Valley", "Bubble Valley · 泡泡跳跳谷");
  for (const { node, attribute, zh, en } of translatedElements) {
    if (attribute) node.setAttribute(attribute, t(zh, en));
    else node.textContent = t(zh, en);
  }
  get("language").textContent = t("EN", "中文");
  get("language").setAttribute("aria-label", t("Switch to English", "切換成中文"));
  updateSound();
  if (game) {
    updateHud();
    updateOverlay();
  }
}

function updateSound() {
  get("sound").setAttribute("aria-pressed", String(!muted));
  get("sound").setAttribute("aria-label", muted ? t("開啟音效", "Turn sound on") : t("關閉音效", "Turn sound off"));
}

function startLevel(index, score = 0, hearts = MAX_HEARTS, mode = "playing") {
  const level = STAGES[index];
  const ground = { x: 0, y: FLOOR, width: W };
  const platforms = [...level.shelves.map(([x, y, width]) => ({ x, y, width })), ground];
  const jellies = mode === "clear" ? [] : level.jellies;
  game = {
    index, level, score, startingScore: score, hearts, mode, platforms, ground, time: 0, prompt: null,
    jellySpeed: 58 + Math.min(index, 2) * 11 + Math.max(0, index - 2) * 2,
    player: { x: 73, y: FLOOR, vx: 0, vy: 0, dir: 1, on: ground, cooldown: 0, immune: 0, jumpBuffer: 0 },
    enemies: jellies.map(([x, y, kind], i) => ({
      x, y, kind, vy: 0, dir: i % 2 ? 1 : -1, on: platforms.find((p) => p.y === y && x >= p.x && x <= p.x + p.width),
      step: i * 1.1 + .7, trap: 0, angry: false
    })),
    bubbles: [], stars: [], combo: 0, comboTime: 0
  };
  clearInputs();
  makeScenery();
  updateHud();
  updateOverlay();
  draw();
  if (mode === "playing") {
    canvas.focus({ preventScroll: true });
    announce(t(`第 ${index + 1} 關，${level.zh}`, `Level ${index + 1}, ${level.en}`));
  }
}

function updateHud() {
  if (game.score > best) {
    best = game.score;
    store(bestKey, String(best));
  }
  const progress = `${game.index + 1} / ${STAGES.length}`;
  get("level-number").textContent = t(`第 ${progress} 關`, `Lv. ${progress}`);
  get("level-name").textContent = t(game.level.zh, game.level.en);
  get("score").textContent = formatter.format(game.score);
  get("remaining").textContent = String(game.enemies.length);
  get("best").textContent = formatter.format(best);
  get("hearts").setAttribute("aria-label", t(`剩下 ${game.hearts} 顆心`, `${game.hearts} hearts left`));
  Array.from(get("hearts").children).forEach((heart, i) => heart.classList.toggle("spent", i >= game.hearts));
  pads.forEach((button) => { button.disabled = game.mode !== "playing"; });
}

function updateOverlay() {
  overlay.hidden = game.mode === "playing";
  if (overlay.hidden) return;
  let title, detail, label;
  if (game.mode === "ready") {
    title = game.index > 0 ? t("接著玩吧！", "Ready to continue?") : t("準備好了嗎？", "Ready to play?");
    detail = t("先吹泡泡把果凍包起來，再靠過去戳破它。", "Catch a jelly in a bubble, then run into it to pop it.");
    label = game.index > 0 ? t(`繼續第 ${game.index + 1} 關`, `Continue level ${game.index + 1}`) : t("開始玩", "Start game");
  } else if (game.mode === "lost") {
    title = t("咻咻需要休息一下", "Zuzu needs a breather");
    detail = t(`目前總分 ${formatter.format(game.score)}。補滿愛心，再挑戰這一關吧！`, `You scored ${formatter.format(game.score)}. Try this level again with full hearts!`);
    label = t("重試本關", "Retry level");
  } else {
    const final = game.index === STAGES.length - 1;
    title = final ? t("果凍全部抓回來了！", "You caught every jelly!") : t("這關的果凍抓完了！", "Level cleared!");
    detail = t(`目前總分 ${game.score}。`, `Your score is ${game.score}.`);
    label = final ? t("再玩一次", "Play again") : t("下一關", "Next level");
  }
  get("overlay-title").textContent = title;
  get("overlay-text").textContent = detail;
  action.textContent = label;
}

function finish(mode) {
  game.mode = mode;
  if (mode === "clear") {
    saveProgress(game.index + 1, game.score, Math.min(MAX_HEARTS, game.hearts + 1));
  }
  clearInputs();
  updateHud();
  updateOverlay();
  action.focus({ preventScroll: true });
  announce(get("overlay-title").textContent);
  chime(mode === "clear" ? [554, 659, 830, 1108] : [375, 294], .055);
}

function land(body, dt, inset = 10) {
  const oldY = body.y;
  body.y += body.vy * dt;
  body.on = null;
  if (body.vy >= 0) {
    for (const p of game.platforms) {
      if (oldY > p.y + .01 || body.y < p.y || body.x + inset < p.x || body.x - inset > p.x + p.width) continue;
      if (!body.on || p.y < body.on.y) body.on = p;
    }
    if (body.on) {
      body.y = body.on.y;
      body.vy = 0;
    }
  }
  if (body.y < 35) {
    body.y = 35;
    body.vy = Math.max(0, body.vy);
  }
}

function hold(name) {
  return keys.has(name) || [...touches.values()].includes(name);
}

function clearInputs() {
  keys.clear();
  touches.clear();
  for (const button of pads) button.classList.remove("is-held");
  if (game) {
    game.player.jumpBuffer = 0;
    game.puffQueued = false;
  }
}

function puff() {
  const p = game.player;
  p.cooldown = .28;
  game.bubbles.push({ x: p.x + p.dir * 22, y: p.y - 25, vx: p.dir * 380, time: 0, r: 12 });
  chime([482]);
}

function updatePlayer(dt) {
  const p = game.player;
  const dx = Number(hold("right")) - Number(hold("left"));
  p.vx = dx * SPEED;
  if (dx) p.dir = dx;
  p.x = clamp(p.x + p.vx * dt, 18, W - 18);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.immune = Math.max(0, p.immune - dt);
  if ((hold("puff") || game.puffQueued) && p.cooldown === 0) {
    puff();
    game.puffQueued = false;
  }
  if (p.jumpBuffer > 0 && p.on) {
    p.vy = -JUMP;
    p.on = null;
    p.jumpBuffer = 0;
    chime([350, 493], .024);
  }
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.vy += GRAVITY * dt;
  land(p, dt);
}

function moveJelly(jelly, dt) {
  if (jelly.trap > 0) {
    jelly.trap -= dt;
    jelly.y = Math.max(68, jelly.y - dt * 19);
    jelly.x = clamp(jelly.x + Math.sin(game.time * 4 + jelly.kind) * 10 * dt, 22, W - 22);
    if (jelly.trap <= 0) {
      jelly.trap = 0;
      jelly.angry = true;
      jelly.on = null;
      jelly.vy = 12;
    }
    return;
  }
  const p = jelly.on;
  if (p && (jelly.x < p.x + 16 || jelly.x > p.x + p.width - 16)) {
    jelly.dir = jelly.x < p.x + 16 ? 1 : -1;
  }
  if (jelly.x < 18 || jelly.x > W - 18) jelly.dir = jelly.x < 18 ? 1 : -1;
  const speed = game.jellySpeed + jelly.kind * 9 + (jelly.angry ? 36 : 0);
  jelly.x = clamp(jelly.x + speed * jelly.dir * dt, 14, W - 14);
  jelly.step -= dt;
  if (jelly.step <= 0 && p && (jelly.kind !== 0 || jelly.angry)) {
    jelly.step = 1.65 + jelly.kind * .37;
    jelly.vy = -215 - jelly.kind * 22;
  }
  jelly.vy += GRAVITY * dt;
  land(jelly, dt, 8);
}

function advanceBubbles(dt) {
  for (const bubble of game.bubbles) {
    bubble.time += dt;
    bubble.r = Math.min(20, 12 + bubble.time * 19);
    if (bubble.time < .56) {
      bubble.x += bubble.vx * dt;
      if (bubble.x - bubble.r < 0 || bubble.x + bubble.r > W) {
        bubble.x = clamp(bubble.x, bubble.r, W - bubble.r);
        bubble.time = .56;
      }
    } else {
      bubble.x = clamp(bubble.x + Math.sin(bubble.time * 6) * 20 * dt, 18, W - 18);
      bubble.y -= dt * 68;
    }
    if (bubble.time > 3.3 || bubble.y < 15) bubble.done = true;
    if (bubble.done) continue;
    const jelly = game.enemies.find((enemy) => !enemy.trap &&
      Math.hypot(enemy.x - bubble.x, enemy.y - 16 - bubble.y) < bubble.r + 14);
    if (jelly) {
      jelly.trap = 7;
      bubble.done = true;
      burst(jelly.x, jelly.y - 16, "#f3ffff", 5);
      chime([540, 715]);
      announce(t("果凍被包在泡泡裡了", "A jelly is trapped in a bubble"));
    }
  }
  game.bubbles = game.bubbles.filter((bubble) => !bubble.done);
}

function burst(x, y, color, count = 9) {
  if (reduced.matches) return;
  for (let i = 0; i < count; i++) {
    const angle = i / count * Math.PI * 2;
    const speed = 48 + Math.random() * 105;
    game.stars.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl: .42 + Math.random() * .35, color });
  }
}

function collide() {
  const p = game.player;
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const jelly = game.enemies[i];
    const x = p.x - jelly.x;
    const y = p.y - 23 - (jelly.y - 16);
    const reach = jelly.trap ? 37 : 29;
    if (Math.hypot(x, y) >= reach) continue;
    if (jelly.trap > 6.88) continue;
    if (jelly.trap) {
      game.enemies.splice(i, 1);
      game.combo = game.comboTime > 0 ? game.combo + 1 : 1;
      game.comboTime = 2.2;
      const points = 100 + (game.combo - 1) * 50;
      game.score += points;
      game.prompt = { x: jelly.x, y: jelly.y - 37, text: `+${points}`, until: game.time + .75 };
      burst(jelly.x, jelly.y - 16, COLORS[jelly.kind].base);
      chime([680, 870, 1120], .045);
      updateHud();
      announce(t(`抓到果凍，加 ${points} 分`, `Jelly caught. Plus ${points} points.`));
      if (!game.enemies.length) {
        finish("clear");
        return;
      }
    } else if (p.immune <= 0) {
      game.hearts--;
      updateHud();
      if (game.hearts === 0) {
        finish("lost");
        return;
      }
      burst(p.x, p.y - 20, "#f980a0");
      p.x = 73;
      p.y = FLOOR;
      p.vy = 0;
      p.on = game.ground;
      p.immune = 1.5;
      chime([310, 230], .04);
      announce(t(`失去一顆心，還剩 ${game.hearts} 顆`, `Lost a heart. ${game.hearts} left.`));
      return;
    }
  }
}

function update(dt) {
  game.time += dt;
  game.comboTime -= dt;
  updatePlayer(dt);
  for (const jelly of game.enemies) moveJelly(jelly, dt);
  advanceBubbles(dt);
  collide();
  for (const star of game.stars) {
    star.x += star.vx * dt;
    star.y += star.vy * dt;
    star.vy += 180 * dt;
    star.ttl -= dt;
  }
  game.stars = game.stars.filter((star) => star.ttl > 0);
}

function oval(target, x, y, rx, ry, fill) {
  target.beginPath();
  target.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  target.fillStyle = fill;
  target.fill();
}

function sparkle(target, x, y, size, fill) {
  target.beginPath();
  target.moveTo(x, y - size);
  target.quadraticCurveTo(x + size * .22, y - size * .22, x + size, y);
  target.quadraticCurveTo(x + size * .22, y + size * .22, x, y + size);
  target.quadraticCurveTo(x - size * .22, y + size * .22, x - size, y);
  target.quadraticCurveTo(x - size * .22, y - size * .22, x, y - size);
  target.fillStyle = fill;
  target.fill();
}

function makeScenery() {
  scenery = document.createElement("canvas");
  scenery.width = canvas.width;
  scenery.height = canvas.height;
  const layer = scenery.getContext("2d");
  layer.scale(scenery.width / W, scenery.height / H);
  const [highlight, top, base, shadow, edge, wash] = PLATFORM_COLORS[Math.floor(game.index / 6)];
  layer.fillStyle = wash;
  layer.fillRect(0, 0, W, H);
  const clip = [[36, 117, 7], [701, 112, 9], [423, 126, 5], [330, 73, 4], [535, 60, 5], [755, 216, 5], [66, 207, 4]];
  for (const [x, y, size] of clip) sparkle(layer, x, y, size, "#fffbe5");
  for (const { x, y, width } of game.platforms) {
    const isFloor = y === FLOOR;
    const height = isFloor ? 43 : 17;
    const inset = isFloor ? -3 : 0;
    const platform = layer.createLinearGradient(0, y, 0, y + height);
    platform.addColorStop(0, highlight);
    platform.addColorStop(.24, top);
    platform.addColorStop(.55, base);
    platform.addColorStop(1, shadow);
    layer.beginPath();
    layer.roundRect(x + inset, y, width - inset * 2, height, isFloor ? 7 : 10);
    layer.fillStyle = platform;
    layer.fill();
    layer.lineWidth = 1.9;
    layer.strokeStyle = edge;
    layer.stroke();
    layer.beginPath();
    layer.roundRect(x + 5, y + 2.7, width - 10, 3.2, 3);
    layer.fillStyle = "#f4ffeeb8";
    layer.fill();
    for (let col = 26; col < width - 15; col += 35) {
      const flowerY = y + (isFloor ? 15 + col % 12 : 10);
      oval(layer, x + col, flowerY, 2.3, 2.1, "#d0f1b6");
      if (isFloor && col % 3 === 0) sparkle(layer, x + col + 6, flowerY + 7, 4.3, "#f9e0a0");
    }
  }
}

function drawBubble(x, y, r, trapped) {
  const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  ring.addColorStop(0, "#fffdf5");
  ring.addColorStop(.45, trapped ? "#4db6ad" : "#7cbfc0");
  ring.addColorStop(.78, "#91bfed");
  ring.addColorStop(1, "#e9aedb");
  oval(ctx, x, y, r, r, trapped ? "#a4fff42d" : "#ddfff069");
  ctx.lineWidth = trapped ? 2.8 : 2;
  ctx.strokeStyle = ring;
  ctx.stroke();
  oval(ctx, x - r * .33, y - r * .58, r * .22, r * .087, "#ffffffe8");
  sparkle(ctx, x + r * .57, y - r * .47, r * .17, "#fff9e7");
}

function drawJelly(jelly) {
  const { x, kind, dir } = jelly;
  const y = jelly.y - 16;
  const palette = COLORS[kind];
  if (jelly.on && !jelly.trap) oval(ctx, x, jelly.y + 1, 16, 4, "#35675256");
  ctx.save();
  ctx.translate(x, y);
  const wiggle = jelly.trap ? Math.sin(game.time * 10 + x) * 1.9 : Math.sin(game.time * 12 + x) * 1.3;
  const gradient = ctx.createLinearGradient(0, -18, 0, 16);
  gradient.addColorStop(0, palette.pale);
  gradient.addColorStop(1, palette.base);
  ctx.beginPath();
  ctx.moveTo(-17, 8);
  ctx.bezierCurveTo(-21, -12, -11 + wiggle, -18, 0, -17 - wiggle);
  ctx.bezierCurveTo(11 + wiggle, -18, 20, -10, 17, 9);
  ctx.bezierCurveTo(16, 15, 7, 16, 0, 14);
  ctx.bezierCurveTo(-7, 16, -17, 15, -17, 8);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  oval(ctx, -6, -10, 4, 1.8, "#ffffff9c");
  for (const side of [-1, 1]) {
    const eyeX = side * 5.1 + dir * 1.9;
    oval(ctx, eyeX, .5, 1.7, 2.35, palette.ink);
    oval(ctx, eyeX + side * 3.4, 4.65, 2.6, 1.4, "#ef619e6e");
    if (jelly.angry) {
      ctx.beginPath();
      ctx.moveTo(eyeX - side * 2.5, -3);
      ctx.lineTo(eyeX + side * 2, -5.1);
      ctx.strokeStyle = palette.ink;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(dir * 1.9, 4.2, 2.4, 0, Math.PI);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();
  if (jelly.trap) {
    drawBubble(x, y, 23 + Math.sin(game.time * 4 + x) * 1.4, true);
    if (jelly.trap < 2) {
      ctx.beginPath();
      ctx.arc(x, y, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * jelly.trap);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#a2577e";
      ctx.stroke();
    }
  }
}

function drawPlayer() {
  const p = game.player;
  if (p.on) oval(ctx, p.x, p.y + 1, 21, 4.6, "#2c624641");
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.dir, 1);
  const bob = p.on && p.vx && !reduced.matches ? Math.sin(game.time * 26) * 2.3 : 0;
  if (p.immune > 0) ctx.globalAlpha = reduced.matches ? .67 : (Math.floor(game.time * 13) % 2 ? .4 : 1);
  if (sprite.complete && sprite.naturalWidth) {
    ctx.drawImage(sprite, -28, -53 + bob, 56, 55.3);
  } else {
    oval(ctx, 0, -19 + bob, 20, 19, "#70cda6");
    oval(ctx, 7, -26 + bob, 10, 12, "#a2e2b6");
    oval(ctx, 12, -26 + bob, 2.3, 3, "#266252");
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(scenery, 0, 0, W, H);
  for (const bubble of game.bubbles) drawBubble(bubble.x, bubble.y, bubble.r, false);
  for (const jelly of game.enemies) drawJelly(jelly);
  drawPlayer();
  for (const star of game.stars) {
    ctx.globalAlpha = Math.min(1, star.ttl * 3);
    sparkle(ctx, star.x, star.y, 3 + star.ttl * 6, star.color);
  }
  ctx.globalAlpha = 1;
  if (game.prompt && game.prompt.until > game.time) {
    const x = clamp(game.prompt.x, 34, W - 34);
    const y = Math.max(28, game.prompt.y - (game.time + .75 - game.prompt.until) * 30);
    ctx.font = "900 23px system-ui";
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fffbee";
    ctx.strokeText(game.prompt.text, x, y);
    ctx.fillStyle = "#216552";
    ctx.fillText(game.prompt.text, x, y);
  }
}

function resize() {
  const scale = clamp(canvas.getBoundingClientRect().width * (devicePixelRatio || 1) / W, .6, 2.25);
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  if (game) {
    makeScenery();
    draw();
  }
}

function loop(now) {
  const dt = Math.min(.032, (now - (previousTime ?? now)) / 1000);
  previousTime = now;
  if (game.mode === "playing" && !help.open) {
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);
}

const bindings = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump", KeyX: "puff"
};
document.addEventListener("keydown", (event) => {
  if (game.mode !== "playing" || help.open || event.metaKey || event.altKey || event.ctrlKey) return;
  const name = bindings[event.code];
  if (!name || (event.target instanceof Element && event.target.closest("button,a"))) return;
  event.preventDefault();
  keys.add(name);
  if (!event.repeat && name === "jump") game.player.jumpBuffer = .12;
  if (!event.repeat && name === "puff") game.puffQueued = true;
});
document.addEventListener("keyup", (event) => keys.delete(bindings[event.code]));
window.addEventListener("blur", clearInputs);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearInputs();
});

for (const button of pads) {
  const name = button.id;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || game.mode !== "playing") return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, name);
    button.classList.add("is-held");
    if (name === "jump") game.player.jumpBuffer = .12;
    if (name === "puff") game.puffQueued = true;
  });
  button.addEventListener("lostpointercapture", (event) => {
    touches.delete(event.pointerId);
    button.classList.toggle("is-held", [...touches.values()].includes(name));
  });
  button.addEventListener("click", (event) => {
    if (event.detail !== 0 || game.mode !== "playing") return;
    if (name === "puff") game.puffQueued = true;
    if (name === "jump") game.player.jumpBuffer = .12;
  });
}

action.addEventListener("click", () => {
  if (game.mode === "ready") {
    startLevel(game.index, game.score, game.hearts);
  } else if (game.mode === "lost") {
    saveProgress(game.index, game.startingScore);
    startLevel(game.index, game.startingScore);
  } else if (game.index < STAGES.length - 1) {
    startLevel(game.index + 1, game.score, Math.min(MAX_HEARTS, game.hearts + 1));
  } else {
    restartGame();
  }
  chime([509, 650]);
});
function restartGame() {
  saveProgress(0, 0);
  startLevel(0);
}
get("restart").addEventListener("click", restartGame);
get("help").addEventListener("click", () => {
  clearInputs();
  help.showModal();
});
get("sound").addEventListener("click", () => {
  muted = !muted;
  store(mutedKey, String(muted));
  updateSound();
  chime([650]);
});
get("language").addEventListener("click", () => {
  english = !english;
  store("lang", t("zh", "en"));
  setLanguage();
});
sprite.addEventListener("load", () => { if (game) draw(); });

setLanguage();
resize();
const [savedLevel, savedScore, savedHearts] = readProgress();
const completed = savedLevel === STAGES.length;
startLevel(Math.min(savedLevel, STAGES.length - 1), savedScore, savedHearts, completed ? "clear" : "ready");
new ResizeObserver(resize).observe(canvas);
requestAnimationFrame(loop);
