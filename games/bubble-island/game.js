"use strict";

const WIDTH = 548;
const HEIGHT = 514;
const SPACING = 48;
const ROW_HEIGHT = Math.sqrt(3) * SPACING / 2;
const RADIUS = 23;
const LEFT = 34;
const RIGHT = WIDTH - LEFT;
const TOP = 35;
const DANGER = 400;
const LAUNCH = { x: WIDTH / 2, y: 449 };
const MAX_ANGLE = Math.PI * 0.407;
const MAX_ROW = Math.ceil((DANGER - TOP) / ROW_HEIGHT);
const PALETTE = [
  { name: "粉紅泡泡", en: "Pink bubble", light: "#ffd1e8", mid: "#f889bd", dark: "#df5898", ink: "#7b3462" },
  { name: "紫色泡泡", en: "Purple bubble", light: "#eee0ff", mid: "#bc92f8", dark: "#925bd5", ink: "#573481" },
  { name: "藍色泡泡", en: "Blue bubble", light: "#d5f5ff", mid: "#8ad7fa", dark: "#4d9edc", ink: "#315d91" },
  { name: "薄荷泡泡", en: "Mint bubble", light: "#d6ffe5", mid: "#83e6b4", dark: "#4db887", ink: "#346b58" },
  { name: "黃色泡泡", en: "Yellow bubble", light: "#fff3bd", mid: "#ffdb76", dark: "#e9a54f", ink: "#8c551d" },
  { name: "蜜桃泡泡", en: "Peach bubble", light: "#ffe4ce", mid: "#ffb58d", dark: "#e88169", ink: "#943f4c" }
];
const TIPS = [
  ["試試讓泡泡反彈！", "Try bouncing off the wall!"],
  ["好厲害，再來一關！", "Nicely done! Keep going!"],
  ["跟我一起拚過最後一關！", "We can clear the last level!"],
  ["泡泡下來了，小心虛線！", "Watch the dotted line!"],
  ["哇！泡泡一起掉下來了！", "Look at those bubbles fall!"]
];
const key = (row, col) => row * 11 + col;
const rowOf = (cell) => Math.floor(cell / 11);
const colOf = (cell) => cell % 11;
const shifted = (row, phase) => (row + phase) % 2;
const cols = (row, phase) => 11 - shifted(row, phase);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function position(cell, phase) {
  const row = rowOf(cell);
  return { x: LEFT + (colOf(cell) + shifted(row, phase) / 2) * SPACING, y: TOP + row * ROW_HEIGHT };
}

function neighbors(cell, phase) {
  const row = rowOf(cell);
  const col = colOf(cell);
  const side = shifted(row, phase) ? 1 : -1;
  return [[row, col - 1], [row, col + 1], [row - 1, col], [row - 1, col + side], [row + 1, col], [row + 1, col + side]]
    .filter(([r, c]) => r >= 0 && r <= MAX_ROW && c >= 0 && c < cols(r, phase))
    .map(([r, c]) => key(r, c));
}

function connected(grid, phase, seeds, keep) {
  const found = new Set(seeds);
  for (const cell of found) {
    for (const neighbor of neighbors(cell, phase)) {
      if (grid.has(neighbor) && keep(neighbor)) found.add(neighbor);
    }
  }
  return found;
}

function trace(angle, grid, phase) {
  const points = [LAUNCH];
  let x = LAUNCH.x;
  let y = LAUNCH.y;
  let dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const collision = SPACING - 2;
  const bubbles = Array.from(grid.keys(), (cell) => ({ cell, ...position(cell, phase) }));

  while (true) {
    const wall = dx < 0 ? LEFT : RIGHT;
    const toWall = dx === 0 ? Infinity : (wall - x) / dx;
    const toRoof = (TOP - y) / dy;
    const bounce = toWall < toRoof;
    let length = Math.min(toWall, toRoof);
    let hit = null;
    for (const bubble of bubbles) {
      const offsetX = bubble.x - x;
      const offsetY = bubble.y - y;
      const along = dx * offsetX + dy * offsetY;
      const gap = offsetX ** 2 + offsetY ** 2 - along ** 2;
      if (along < 0 || gap >= collision ** 2) continue;
      const travel = Math.max(0, along - Math.sqrt(collision ** 2 - gap));
      if (travel <= length) {
        length = travel;
        hit = bubble.cell;
      }
    }
    x += dx * length;
    y += dy * length;
    points.push({ x, y });
    if (hit !== null || !bounce) return { points, hit };
    x = wall;
    dx = -dx;
  }
}

function snap(path, grid, phase) {
  const end = path.points.at(-1);
  const candidates = path.hit === null
    ? Array.from({ length: cols(0, phase) }, (_, col) => key(0, col))
    : neighbors(path.hit, phase);
  let chosen = null;
  let closest = Infinity;
  for (const cell of candidates) {
    if (grid.has(cell)) continue;
    const distance = distanceSquared(end, position(cell, phase));
    if (distance < closest) {
      chosen = cell;
      closest = distance;
    }
  }
  return chosen;
}

const ui = Object.fromEntries(
  ["board", "score", "best", "next", "next-name", "swap", "restart", "stage-badge", "stage-name", "misses",
    "feedback", "result", "result-title", "result-text", "result-action", "announcement", "mascot-text",
    "language", "sound", "help", "instructions"].map((id) => [id, document.getElementById(id)])
);
const ctx = ui.board.getContext("2d");
const nextCtx = ui.next.getContext("2d");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const format = new Intl.NumberFormat("zh-TW");
const colorKey = "bubble-island-best";
const soundKey = "bubble-island-muted";
const progressKey = "bubble-island-progress";
const translations = [
  ["data-en", null],
  ["data-en-label", "aria-label"],
  ["data-en-alt", "alt"]
].flatMap(([data, attribute]) => Array.from(document.querySelectorAll(`[${data}]`), (element) => ({
  element, attribute, zh: attribute ? element.getAttribute(attribute) : element.textContent, en: element.getAttribute(data)
})));

function readPreference(name) {
  try { return localStorage.getItem(name); } catch { return null; }
}

function savePreference(name, value) {
  try { localStorage.setItem(name, value); } catch { /* The game also works without storage. */ }
}

function readProgress() {
  try {
    const [index, score] = JSON.parse(readPreference(progressKey)) ?? [];
    if (Number.isInteger(index) && index >= 0 && index <= LEVELS.length &&
      Number.isSafeInteger(score) && score >= 0) return [index, score];
  } catch { /* Invalid progress starts a new game. */ }
  return [0, 0];
}

function saveProgress(index, score) {
  savePreference(progressKey, JSON.stringify([index, score]));
}

let best = Math.max(0, Number.parseInt(readPreference(colorKey), 10) || 0);
let muted = readPreference(soundKey) === "true";
let english = readPreference("lang") === "en";
let audio;
let state;
let sprites = [];
let backdrop;
let dirty = true;
let previousTime;
let activePointer = null;

function t(zh, en) { return english ? en : zh; }

function updateLanguage() {
  document.documentElement.lang = t("zh-Hant", "en");
  document.title = t("小龍泡泡島 · Bubble Island", "Bubble Island · 小龍泡泡島");
  ui.language.textContent = t("EN", "中文");
  ui.language.setAttribute("aria-label", t("Switch to English", "切換成中文"));
  for (const { element, attribute, zh, en } of translations) {
    if (attribute) element.setAttribute(attribute, t(zh, en));
    else element.textContent = t(zh, en);
  }
  updateSound();
  if (!state) return;
  updateStage();
  updateHud();
  if (!ui.result.hidden) showResult(false);
}

function sound(notes) {
  if (muted) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audio ??= new Audio();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    notes.forEach(([frequency, offset, volume]) => {
      const time = audio.currentTime + offset;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, time + .1);
      gain.gain.setValueAtTime(.001, time);
      gain.gain.linearRampToValueAtTime(volume, time + .014);
      gain.gain.exponentialRampToValueAtTime(.001, time + .16);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(time);
      oscillator.stop(time + .17);
    });
  } catch { /* Sound availability does not affect gameplay. */ }
}

function updateSound() {
  ui.sound.setAttribute("aria-pressed", String(!muted));
  ui.sound.setAttribute("aria-label", muted ? t("開啟音效", "Turn sound on") : t("關閉音效", "Turn sound off"));
}

function announce(message) {
  ui.announcement.textContent = message;
}

function startLevel(index, score = 0) {
  const level = LEVELS[index];
  const grid = new Map();
  level.rows.forEach((row, r) => Array.from(row).forEach((color, col) => {
    if (color !== ".") grid.set(key(r, col), Number(color));
  }));
  state = {
    index, level, grid, score, startingScore: score, phase: 0, misses: 0, current: level.first, next: level.next,
    angle: -.08, projectile: null, particles: [], mode: "playing", resultDelay: 0, recentColors: [],
    tip: index === LEVELS.length - 1 ? 2 : Math.min(index, 1)
  };
  activePointer = null;
  ui.result.hidden = true;
  ui.feedback.classList.remove("celebrate");
  ui.feedback.textContent = "";
  updateStage();
  updateHud();
  announce(t(`第 ${index + 1} 關，${level.name}`, `Level ${index + 1}, ${level.en}`));
  dirty = true;
}

function updateStage() {
  const number = state.index + 1;
  const progress = `${number} / ${LEVELS.length}`;
  ui["stage-badge"].textContent = t(`第 ${progress} 關`, `Lv. ${progress}`);
  ui["stage-name"].textContent = t(state.level.name, state.level.en);
  ui["mascot-text"].textContent = t(...TIPS[state.tip]);
}

function updateHud() {
  if (state.score > best) {
    best = state.score;
    savePreference(colorKey, String(best));
  }
  ui.score.textContent = format.format(state.score);
  ui.best.textContent = format.format(best);
  const color = PALETTE[state.next];
  ui["next-name"].textContent = t(color.name, color.en);
  ui.swap.disabled = Boolean(state.projectile) || state.mode !== "playing";
  ui.swap.setAttribute("aria-label", t(`交換泡泡，下一顆是${color.name}`, `Swap bubble. Up next: ${color.en}`));
  const remaining = state.level.shots - state.misses;
  ui.misses.classList.toggle("last", remaining === 1);
  ui.misses.setAttribute("aria-label", t(`再打空 ${remaining} 球後下降一排`, `${remaining} ${remaining === 1 ? "miss" : "misses"} until a new row drops`));
  ui.misses.replaceChildren(...Array.from({ length: state.level.shots }, (_, i) => {
    const dot = document.createElement("i");
    dot.classList.toggle("used", i >= remaining);
    return dot;
  }));
  drawNext();
}

function presentColors() {
  return [...new Set(state.grid.values())];
}

function chooseColor(colors) {
  const last = state.recentColors.slice(-2);
  const alternatives = colors.filter((color) => !last.includes(color));
  const choices = alternatives.length ? alternatives : colors;
  const color = choices[Math.floor(Math.random() * choices.length)];
  state.recentColors = [...last, color];
  return color;
}

function addRow() {
  state.phase = 1 - state.phase;
  state.grid = new Map(Array.from(state.grid, ([cell, color]) => [cell + 11, color]));
  const colors = presentColors();
  let color = chooseColor(colors);
  for (let col = 0; col < cols(0, state.phase); col++) {
    if (col > 0 && (col % 2 === 0 || Math.random() < .2)) color = chooseColor(colors);
    state.grid.set(key(0, col), color);
  }
  state.tip = 3;
  updateStage();
  cheer(t("泡泡下降一排", "New row!"));
}

function cheer(message) {
  ui.feedback.textContent = message;
  ui.feedback.classList.remove("celebrate");
  void ui.feedback.offsetWidth;
  ui.feedback.classList.add("celebrate");
}

function endRound(mode) {
  state.mode = mode;
  state.resultDelay = reducedMotion.matches ? 0 : 470;
  if (mode === "clear") {
    state.score += state.level.bonus;
    saveProgress(state.index + 1, state.score);
    sound([[540, 0, .07], [680, .08, .07], [810, .16, .07], [1080, .24, .06]]);
  } else {
    sound([[420, 0, .06], [320, .12, .06]]);
  }
  updateHud();
}

function showResult(focus = true) {
  const won = state.mode === "clear";
  const last = state.index === LEVELS.length - 1;
  const total = format.format(state.score);
  ui["result-title"].textContent = won
    ? (last ? t("泡泡島全通關！", "All levels cleared!") : t("泡泡消光了！", "Bubbles cleared!"))
    : t("碰到警戒線了", "The bubbles reached the line");
  ui["result-text"].textContent = won
    ? t(`拿到 ${state.level.bonus} 分通關獎勵，目前總分 ${total}。`, `${state.level.bonus} bonus points! Your total is ${total}.`)
    : t(`目前總分 ${total}。可以從本關起點再試一次。`, `You scored ${total}. Try this level again.`);
  ui["result-action"].textContent = won
    ? (last ? t("再玩一次", "Play again") : t("下一關", "Next level"))
    : t("重試本關", "Retry level");
  ui.result.hidden = false;
  if (focus) {
    ui["result-action"].focus({ preventScroll: true });
    announce(`${ui["result-title"].textContent} ${ui["result-text"].textContent}`);
  }
}

function resolveShot(projectile) {
  const cell = snap(projectile, state.grid, state.phase);
  state.projectile = null;
  if (cell === null) {
    endRound("lost");
    return;
  }
  state.grid.set(cell, projectile.color);
  const matches = connected(state.grid, state.phase, [cell], (neighbor) => state.grid.get(neighbor) === projectile.color);
  if (matches.size >= 3) {
    for (const match of matches) removeBubble(match);
    const anchored = connected(state.grid, state.phase, [...state.grid.keys()].filter((bubble) => rowOf(bubble) === 0), () => true);
    let dropped = 0;
    for (const bubble of state.grid.keys()) {
      if (anchored.has(bubble)) continue;
      removeBubble(bubble, true);
      dropped++;
    }
    const points = matches.size * 10 + dropped * 20;
    state.score += points;
    cheer(dropped ? t(`連鎖掉落！ +${points}`, `Chain drop! +${points}`) : `+${points}`);
    announce(t(
      `消掉 ${matches.size} 顆${dropped ? `，連鎖掉落 ${dropped} 顆` : ""}，加 ${points} 分`,
      `${matches.size} popped${dropped ? `, ${dropped} fell` : ""}. Plus ${points} points.`
    ));
    if (dropped) {
      state.tip = 4;
      updateStage();
    }
    sound([[650, 0, .055], [870, .05, .06], ...(dropped ? [[1110, .1, .055]] : [])]);
  } else {
    state.misses++;
    if (state.misses >= state.level.shots) {
      state.misses = 0;
      addRow();
      announce(t("泡泡下降一排", "A new row has dropped"));
      sound([[260, 0, .04], [200, .08, .03]]);
    } else {
      sound([[290, 0, .025]]);
    }
  }

  if (state.grid.size === 0) {
    endRound("clear");
  } else if ([...state.grid.keys()].some((bubble) => position(bubble, state.phase).y + RADIUS >= DANGER)) {
    endRound("lost");
  } else {
    const colors = presentColors();
    state.current = colors.includes(state.next) ? state.next : chooseColor(colors);
    state.next = chooseColor(colors);
    updateHud();
  }
}

function removeBubble(cell, dropped = false) {
  const color = state.grid.get(cell);
  state.grid.delete(cell);
  if (reducedMotion.matches) return;
  const { x, y } = position(cell, state.phase);
  if (dropped) {
    state.particles.push({ x, y, color, dx: (Math.random() - .5) * 65, dy: -25, life: .7, ttl: .7, bubble: true });
  }
  for (let i = 0; i < (dropped ? 2 : 6); i++) {
    const angle = i * Math.PI / 3 + Math.random() * .6;
    const speed = 38 + Math.random() * 94;
    const time = .29 + Math.random() * .32;
    state.particles.push({ x, y, color, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed - 38, life: time, ttl: time, bubble: false });
  }
}

function fire() {
  if (state.projectile || state.mode !== "playing" || ui.instructions.open) return;
  const path = trace(state.angle, state.grid, state.phase);
  state.projectile = { ...path, color: state.current, segment: 1, traveled: 0, x: LAUNCH.x, y: LAUNCH.y };
  ui.feedback.classList.remove("celebrate");
  ui.feedback.textContent = "";
  ui.swap.disabled = true;
  sound([[430, 0, .028]]);
  dirty = true;
}

function swapBubbles() {
  if (state.projectile || state.mode !== "playing" || ui.instructions.open) return;
  [state.current, state.next] = [state.next, state.current];
  updateHud();
  const color = PALETTE[state.current];
  announce(t(`準備發射${color.name}`, `${color.en} ready to shoot`));
  sound([[520, 0, .03], [700, .06, .023]]);
  dirty = true;
}

function advanceShot(step) {
  const projectile = state.projectile;
  let travel = step * 1180;
  while (travel > 0) {
    const from = projectile.points[projectile.segment - 1];
    const to = projectile.points[projectile.segment];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const remaining = length - projectile.traveled;
    if (travel >= remaining) {
      travel -= remaining;
      projectile.x = to.x;
      projectile.y = to.y;
      projectile.segment++;
      projectile.traveled = 0;
      if (projectile.segment === projectile.points.length) {
        resolveShot(projectile);
        return;
      }
    } else {
      projectile.traveled += travel;
      const progress = projectile.traveled / length;
      projectile.x = from.x + (to.x - from.x) * progress;
      projectile.y = from.y + (to.y - from.y) * progress;
      return;
    }
  }
}

function ellipse(target, x, y, rx, ry, fill, tilt = 0) {
  target.beginPath();
  target.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
  target.fillStyle = fill;
  target.fill();
}

function star(target, x, y, size, color) {
  const inside = size * .28;
  target.beginPath();
  target.moveTo(x, y - size);
  target.quadraticCurveTo(x + inside, y - inside, x + size, y);
  target.quadraticCurveTo(x + inside, y + inside, x, y + size);
  target.quadraticCurveTo(x - inside, y + inside, x - size, y);
  target.quadraticCurveTo(x - inside, y - inside, x, y - size);
  target.fillStyle = color;
  target.fill();
}

function drawBubble(target, color) {
  ellipse(target, 0, 4, 22, 22, "#623a7f2d");
  const fill = target.createRadialGradient(-8, -12, 3, 1, 2, RADIUS + 5);
  fill.addColorStop(0, color.light);
  fill.addColorStop(.55, color.mid);
  fill.addColorStop(1, color.dark);
  ellipse(target, 0, 0, RADIUS - .65, RADIUS - .65, fill);
  target.strokeStyle = color.dark;
  target.lineWidth = 1.25;
  target.stroke();
  ellipse(target, -8.6, -12.8, 6.8, 3.2, "#ffffffbc", -.57);
  ellipse(target, 1, -16, 2.2, 1.4, "#ffffff9c", -.2);
  target.beginPath();
  target.arc(0, 0, 19.1, .26, 1.37);
  target.strokeStyle = "#ffffff52";
  target.lineWidth = 1.6;
  target.lineCap = "round";
  target.stroke();
  for (const side of [-1, 1]) {
    const x = 6.1 * side;
    if (color === PALETTE[1] || color === PALETTE[5]) {
      target.beginPath();
      target.arc(x, 2.5, 2.2, Math.PI, 0);
      target.lineWidth = 1.65;
      target.strokeStyle = color.ink;
      target.stroke();
    } else if (color === PALETTE[4]) {
      star(target, x, 1.2, 3, color.ink);
    } else {
      ellipse(target, x, 1.2, 1.85, 2.5, color.ink);
      ellipse(target, x - .45, .55, .53, .58, "#fff9");
    }
    ellipse(target, side * 10.4, 6.5, 2.8, 1.65, "#f57fa599");
  }
  target.beginPath();
  target.moveTo(-2.4, 5.8);
  target.quadraticCurveTo(0, 9.35, 2.4, 5.8);
  target.lineWidth = 1.45;
  target.strokeStyle = color.ink;
  target.stroke();
}

function surface(width, height, ratio) {
  const layer = document.createElement("canvas");
  layer.width = Math.round(width * ratio);
  layer.height = Math.round(height * ratio);
  const target = layer.getContext("2d");
  target.scale(layer.width / width, layer.height / height);
  return { layer, target };
}

function makeSprites(ratio) {
  sprites = PALETTE.map((color) => {
    const { layer, target } = surface(54, 54, ratio);
    target.translate(27, 26);
    drawBubble(target, color);
    return layer;
  });
}

function bubble(target, x, y, color, size = 54) {
  target.drawImage(sprites[color], x - size / 2, y - size * 26 / 54, size, size);
}

function drawNext() {
  if (!sprites.length) return;
  nextCtx.clearRect(0, 0, 96, 96);
  bubble(nextCtx, 48, 46, state.next, 92);
}

function makeBackdrop(ratio) {
  const { layer, target } = surface(WIDTH, HEIGHT, ratio);
  const mist = target.createLinearGradient(0, 0, 0, HEIGHT);
  mist.addColorStop(0, "#fff5fc");
  mist.addColorStop(.52, "#f5ebff");
  mist.addColorStop(1, "#e9dbfd");
  target.fillStyle = mist;
  target.fillRect(0, 0, WIDTH, HEIGHT);

  const light = target.createRadialGradient(WIDTH / 2, 170, 12, WIDTH / 2, 175, 310);
  light.addColorStop(0, "#fffcffb8");
  light.addColorStop(1, "#fffcff00");
  target.fillStyle = light;
  target.fillRect(0, 0, WIDTH, HEIGHT);

  for (const [x, y, size] of [[75, 172, 5], [154, 263, 7], [444, 188, 6], [491, 275, 5], [42, 312, 5], [476, 350, 7], [99, 414, 5], [378, 298, 4], [222, 334, 4]]) {
    star(target, x, y, size, "#be93e93c");
  }
  for (const [x, y, size] of [[48, 204, 1.8], [91, 277, 1.9], [203, 287, 1.6], [339, 238, 1.75], [432, 285, 1.5], [513, 342, 1.7], [136, 362, 1.4], [399, 387, 1.8], [255, 297, 1.45]]) {
    ellipse(target, x, y, size, size, "#a982d546");
  }

  for (const mirror of [false, true]) {
    target.save();
    if (mirror) {
      target.translate(WIDTH, 0);
      target.scale(-1, 1);
    }
    target.beginPath();
    target.moveTo(0, HEIGHT);
    target.lineTo(0, 451);
    target.bezierCurveTo(25, 436, 43, 450, 48, 466);
    target.bezierCurveTo(71, 447, 97, 462, 102, 482);
    target.bezierCurveTo(124, 467, 151, 480, 157, 496);
    target.quadraticCurveTo(181, 494, 193, HEIGHT);
    target.closePath();
    target.fillStyle = "#fffaffb0";
    target.fill();
    target.restore();
  }

  target.fillStyle = "#dcc8fa8c";
  target.beginPath();
  target.moveTo(0, 0);
  target.lineTo(WIDTH, 0);
  target.lineTo(WIDTH, 8);
  for (let x = WIDTH; x > 0; x -= 18) target.quadraticCurveTo(x - 9, 17, x - 18, 8);
  target.closePath();
  target.fill();
  backdrop = layer;
}

function drawAim() {
  const path = trace(state.angle, state.grid, state.phase);
  const target = snap(path, state.grid, state.phase);
  const color = PALETTE[state.current];
  let interval = 36;
  for (let i = 1; i < path.points.length; i++) {
    const start = path.points[i - 1];
    const end = path.points[i];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    for (let t = interval; t < length; t += 15) {
      const progress = t / length;
      ellipse(ctx, start.x + (end.x - start.x) * progress, start.y + (end.y - start.y) * progress, 3.05, 3.05, color.dark + "a0");
    }
    interval = (interval - length) % 15;
    if (interval <= 0) interval += 15;
  }
  if (target !== null) {
    const { x, y } = position(target, state.phase);
    ellipse(ctx, x, y, RADIUS - 2.5, RADIUS - 2.5, color.light + "66");
    ctx.strokeStyle = color.dark + "af";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawLauncher() {
  ellipse(ctx, LAUNCH.x, LAUNCH.y + 35, 60, 12, "#8a60b943");
  ellipse(ctx, LAUNCH.x, LAUNCH.y + 28, 55, 13.5, "#9b6ac8");
  const base = ctx.createLinearGradient(0, LAUNCH.y + 13, 0, LAUNCH.y + 37);
  base.addColorStop(0, "#f0ddff");
  base.addColorStop(.65, "#c8a1f0");
  base.addColorStop(1, "#b58cde");
  ellipse(ctx, LAUNCH.x, LAUNCH.y + 23, 55, 12, base);
  ellipse(ctx, LAUNCH.x, LAUNCH.y + 20, 37, 10, "#9a6ac872");
  for (const side of [-1, 1]) {
    ellipse(ctx, LAUNCH.x + side * 36, LAUNCH.y + 21, 16, 4.4, "#f3e5ffb3", side * -.13);
    star(ctx, LAUNCH.x + side * 40, LAUNCH.y + 10, 5.2, "#fff2ac");
  }
  if (!state.projectile && state.mode === "playing") bubble(ctx, LAUNCH.x, LAUNCH.y, state.current, 57);
}

function drawBoard() {
  ctx.drawImage(backdrop, 0, 0, WIDTH, HEIGHT);
  const nearDanger = [...state.grid.keys()].some((cell) => position(cell, state.phase).y + RADIUS >= DANGER - ROW_HEIGHT);
  ctx.strokeStyle = nearDanger ? "#ca517fba" : "#a785ca78";
  ctx.lineWidth = nearDanger ? 1.7 : 1.15;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(19, DANGER);
  ctx.lineTo(WIDTH - 19, DANGER);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!state.projectile && state.mode === "playing") drawAim();
  for (const [cell, color] of state.grid) {
    const { x, y } = position(cell, state.phase);
    bubble(ctx, x, y, color);
  }
  drawLauncher();
  if (state.projectile) bubble(ctx, state.projectile.x, state.projectile.y, state.projectile.color);
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.min(1, particle.life / particle.ttl * 1.65);
    if (particle.bubble) bubble(ctx, particle.x, particle.y, particle.color);
    else star(ctx, particle.x, particle.y, 1.6 + 3.5 * particle.life / particle.ttl, PALETTE[particle.color].dark);
  }
  ctx.globalAlpha = 1;
}

function resize() {
  const width = ui.board.getBoundingClientRect().width;
  const ratio = clamp(width * (window.devicePixelRatio || 1) / WIDTH, .65, 2.5);
  const pixelWidth = Math.round(WIDTH * ratio);
  const pixelHeight = Math.round(HEIGHT * ratio);
  if (backdrop && ui.board.width === pixelWidth && ui.board.height === pixelHeight) return;
  ui.board.width = pixelWidth;
  ui.board.height = pixelHeight;
  ctx.setTransform(pixelWidth / WIDTH, 0, 0, pixelHeight / HEIGHT, 0, 0);
  makeSprites(Math.max(1.5, ratio));
  makeBackdrop(ratio);
  drawNext();
  dirty = true;
}

function frame(time) {
  const step = Math.min(.04, (time - (previousTime ?? time)) / 1000);
  previousTime = time;
  if (!ui.instructions.open) {
    if (state.projectile) {
      advanceShot(step);
      dirty = true;
    }
    if (state.particles.length) {
      for (const particle of state.particles) {
        particle.x += particle.dx * step;
        particle.y += particle.dy * step;
        particle.dy += step * (particle.bubble ? 700 : 170);
        particle.life -= step;
      }
      state.particles = state.particles.filter((particle) => particle.life > 0);
      dirty = true;
    }
    if (state.mode !== "playing" && ui.result.hidden) {
      state.resultDelay -= step * 1000;
      if (state.resultDelay <= 0) showResult();
    }
  }
  if (dirty) {
    drawBoard();
    dirty = false;
  }
  requestAnimationFrame(frame);
}

function aimPointer(event) {
  const rect = ui.board.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width * WIDTH;
  const y = (event.clientY - rect.top) / rect.height * HEIGHT;
  if (y >= LAUNCH.y + 4) return false;
  state.angle = clamp(Math.atan2(x - LAUNCH.x, Math.max(1, LAUNCH.y - y)), -MAX_ANGLE, MAX_ANGLE);
  dirty = true;
  return true;
}

ui.board.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || state.mode !== "playing" || !aimPointer(event)) return;
  activePointer = event.pointerId;
  ui.board.setPointerCapture(event.pointerId);
  ui.board.focus({ preventScroll: true });
});
ui.board.addEventListener("pointermove", (event) => {
  if (state.mode === "playing" && (event.pointerType === "mouse" || activePointer === event.pointerId)) aimPointer(event);
});
ui.board.addEventListener("pointerup", (event) => {
  if (activePointer !== event.pointerId) return;
  activePointer = null;
  if (aimPointer(event)) fire();
});
ui.board.addEventListener("lostpointercapture", () => { activePointer = null; });
ui.board.addEventListener("pointercancel", () => { activePointer = null; });

document.addEventListener("keydown", (event) => {
  if (ui.instructions.open || state.mode !== "playing" || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select, [contenteditable]")) return;
  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
    case "ArrowRight":
    case "KeyD": {
      const left = event.code === "ArrowLeft" || event.code === "KeyA";
      state.angle = clamp(state.angle + (left ? -1 : 1) * .055, -MAX_ANGLE, MAX_ANGLE);
      dirty = true;
      break;
    }
    case "Space":
      if (!event.repeat) fire();
      break;
    case "KeyX":
      if (!event.repeat) swapBubbles();
      break;
    default:
      return;
  }
  event.preventDefault();
});

ui.swap.addEventListener("click", () => {
  swapBubbles();
  ui.board.focus({ preventScroll: true });
});
ui.restart.addEventListener("click", () => {
  saveProgress(0, 0);
  startLevel(0);
  ui.board.focus({ preventScroll: true });
});
ui["result-action"].addEventListener("click", () => {
  if (state.mode === "lost") {
    startLevel(state.index, state.startingScore);
  } else if (state.index < LEVELS.length - 1) {
    startLevel(state.index + 1, state.score);
  } else {
    saveProgress(0, 0);
    startLevel(0);
  }
  ui.board.focus({ preventScroll: true });
});
ui.help.addEventListener("click", () => ui.instructions.showModal());
ui.language.addEventListener("click", () => {
  english = !english;
  savePreference("lang", t("zh", "en"));
  updateLanguage();
});
ui.sound.addEventListener("click", () => {
  muted = !muted;
  savePreference(soundKey, String(muted));
  updateSound();
  sound([[660, 0, .03]]);
});
ui.feedback.addEventListener("animationend", () => {
  ui.feedback.classList.remove("celebrate");
  ui.feedback.textContent = "";
});

updateLanguage();
const [savedLevel, savedScore] = readProgress();
startLevel(Math.min(savedLevel, LEVELS.length - 1), savedScore);
if (savedLevel === LEVELS.length) {
  state.grid.clear();
  state.mode = "clear";
  updateHud();
  showResult(false);
}
resize();
new ResizeObserver(resize).observe(ui.board);
requestAnimationFrame(frame);
