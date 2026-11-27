import { directions, gameSound, gridInput, language, readSaved, writeSaved } from "../little-arcade.js";
import { bottom, eachObject, height, levelCount, makeCourse, nestAt, surfaceAt, tile, width } from "./course.js";
import { makePainter } from "./scenery.js";

const get = (id) => document.getElementById(id);
const board = get("board");
const result = get("result");
const action = get("action");
const picker = get("level");
const help = get("instructions");
const progressKey = "duck-crossing-progress";
const hearts = 3;
const hopTime = .145;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const chapters = [["蒲公英溪畔", "Dandelion Creek"], ["荷葉小港", "Lily Harbor"], ["金楓渡口", "Maple Ferry"], ["星光河灣", "Starlight Bend"]];
const tips = [
  ["在草地等浮木漂過來，再跳上去。", "Wait on the grass for a log to float by."],
  ["荷葉開始閃，就要準備跳走。", "Hop away when a lily pad starts to flash."],
  ["推車一過就跳，先到草地歇一下。", "Hop after a cart passes, then wait on the grass."],
  ["鳥巢要留給還在路上的小鴨。", "Head for a nest that is still empty."]
];

function loadProgress() {
  try {
    const saved = JSON.parse(readSaved(progressKey));
    if (saved && Number.isInteger(saved.level) && saved.level >= 0 && saved.level < levelCount) {
      const finished = Array.isArray(saved.finished) ? saved.finished.filter((index) =>
        Number.isInteger(index) && index >= 0 && index < levelCount) : [];
      return { level: saved.level, finished: new Set(finished) };
    }
  } catch { /* Start at the first creek if saved data is invalid. */ }
  return { level: 0, finished: new Set() };
}

const progress = loadProgress();
let game;
let say = (zh) => zh;
let audio;
let lastTime;
language((translate) => {
  say = translate;
  document.title = say("小鴨過溪 · Duck Crossing", "Duck Crossing · 小鴨過溪");
  audio?.label();
  if (game) { updateHud(); renderPicker(); }
});
audio = gameSound("duck-crossing-sound", (zh, en) => say(zh, en));
const paint = makePainter(board, reduced);

function persist(level = game.course.index) {
  progress.level = level;
  writeSaved(progressKey, JSON.stringify({ level, finished: [...progress.finished] }));
}

function announce(message) {
  get("announcement").textContent = message;
}

function updateHud() {
  const { course, home, lives, mode } = game;
  get("round").textContent = `${course.index + 1} / ${levelCount}`;
  get("course-name").textContent = say(course.zh, course.en);
  get("home-count").textContent = get("compact-home").textContent = `${home.size} / ${course.nests.length}`;
  get("solved").textContent = say(`已通過 ${progress.finished.size} / ${levelCount} 關`, `${progress.finished.size} / ${levelCount} stages cleared`);
  for (const id of ["hearts", "compact-hearts"]) {
    const counter = get(id);
    counter.setAttribute("aria-label", say(`剩下 ${lives} 顆愛心`, `${lives} lives left`));
    counter.replaceChildren(...Array.from({ length: hearts }, (_, i) => {
      const span = document.createElement("span");
      span.textContent = "♥";
      span.classList.toggle("spent", i >= lives);
      return span;
    }));
  }
  get("tip").textContent = say(...tips[Math.floor(course.index / 6)]);
  for (const button of document.querySelectorAll("[data-move]")) button.disabled = mode !== "playing";
  result.hidden = mode === "playing";
  if (mode === "ready") {
    get("result-title").textContent = say("準備過溪", "Ready to cross?");
    get("result-detail").textContent = say("到對岸後，跳進還空著的鳥巢。", "Hop into an empty nest on the far bank.");
    action.textContent = say("開始玩", "Start game");
  } else if (mode === "lost") {
    get("result-title").textContent = say("小鴨休息一下", "Time for a rest");
    get("result-detail").textContent = say("愛心用完了。再試一次，把大家帶回家。", "You’re out of hearts. Try again to bring everyone home.");
    action.textContent = say("重試本關", "Retry stage");
  } else if (mode === "clear") {
    const allHome = progress.finished.size === levelCount;
    get("result-title").textContent = allHome ? say("所有小鴨都回家了！", "All ducklings are home!") : say("小鴨們都到家了！", "Ducklings delivered!");
    get("result-detail").textContent = say(`已通過 ${progress.finished.size} / ${levelCount} 關。`, `${progress.finished.size} of ${levelCount} stages cleared.`);
    action.textContent = course.index < levelCount - 1 ? say("下一關", "Next stage") : say("重玩本關", "Play again");
  }
}

function renderPicker() {
  picker.replaceChildren(...chapters.map(([zh, en], group) => {
    const node = document.createElement("optgroup");
    node.label = say(zh, en);
    for (let n = group * 6; n < group * 6 + 6; n++) {
      const course = makeCourse(n);
      const option = document.createElement("option");
      option.value = n;
      option.textContent = `${progress.finished.has(n) ? "✓ " : ""}${n + 1} · ${say(course.zh, course.en)}`;
      node.append(option);
    }
    return node;
  }));
  picker.value = game.course.index;
}

function resetPlayer() {
  game.player = { x: width / 2, row: bottom, face: "left" };
  game.flight = null;
  game.queued = null;
}

function openStage(index, mode = "ready") {
  game = { course: makeCourse(index), lives: hearts, home: new Set(), time: 0, flash: 0, mode };
  resetPlayer();
  updateHud();
  renderPicker();
  persist();
  paint(game);
  announce(say(`第 ${index + 1} 關，${game.course.zh}`, `Stage ${index + 1}, ${game.course.en}`));
}

function start() {
  game.mode = "playing";
  updateHud();
  focus();
  audio.play([492, 660]);
}

function fail(reason) {
  if (game.mode !== "playing") return;
  game.lives--;
  game.flash = .35;
  if (!game.lives) {
    game.mode = "lost";
  } else {
    resetPlayer();
  }
  updateHud();
  announce(reason);
  audio.play([366, 265]);
  if (!game.lives) action.focus({ preventScroll: true });
}

function rescue(col) {
  game.home.add(col);
  announce(say(`已有 ${game.home.size} 隻小鴨回家`, `${game.home.size} ducklings home`));
  audio.play([523, 660, 784]);
  if (game.home.size === game.course.nests.length) {
    game.mode = "clear";
    progress.finished.add(game.course.index);
    persist(Math.min(levelCount - 1, game.course.index + 1));
    updateHud();
    renderPicker();
    action.focus({ preventScroll: true });
  } else {
    resetPlayer();
    updateHud();
  }
}

function move(direction) {
  if (game.mode !== "playing" || help.open) return;
  if (game.flight) {
    game.queued = direction;
    return;
  }
  const { player } = game;
  const [dx, dy] = directions[direction];
  const x = player.x + dx * tile;
  const row = player.row + dy;
  if (x < 15 || x > width - 15 || row < 0 || row > bottom) return;
  const nest = row === 0 ? nestAt(game.course, x, game.home) : undefined;
  if (row === 0 && nest === undefined) {
    announce(say("到對岸要跳進空著的鳥巢", "Hop into an empty nest on the far bank"));
    return;
  }
  if (dx) player.face = direction;
  game.flight = { fromX: player.x, fromRow: player.row, x: row === 0 ? (nest + .5) * tile : x, row, nest, elapsed: 0, duration: hopTime };
}

function checkFooting(dt) {
  const { player, course } = game;
  const lane = course.lanes[player.row];
  const surface = surfaceAt(lane, player.x, game.time);
  if (!surface.safe) {
    fail(lane.type === "cart" ? say("撞到推車了，少一顆愛心。", "A cart bumped you. One heart lost.") : say("掉到水裡了，少一顆愛心。", "You landed in the creek. One heart lost."));
    return;
  }
  player.x += dt * surface.drift;
  if (player.x < 11 || player.x > width - 11) fail(say("浮木漂太遠了，少一顆愛心。", "You drifted too far. One heart lost."));
}

function tick(dt) {
  game.time += dt;
  game.flash = Math.max(0, game.flash - dt);
  const flight = game.flight;
  if (!flight) {
    checkFooting(dt);
    return;
  }
  flight.elapsed += dt;
  if (flight.elapsed < hopTime) return;
  const { player } = game;
  player.x = flight.x;
  player.row = flight.row;
  game.flight = null;
  if (flight.nest !== undefined) {
    rescue(flight.nest);
    return;
  }
  const queued = game.queued;
  const before = game.lives;
  game.queued = null;
  checkFooting(0);
  if (queued && before === game.lives) move(queued);
}

function frame(time) {
  const dt = Math.min(.035, (time - (lastTime ?? time)) / 1000);
  lastTime = time;
  if (game.mode === "playing" && !help.open) {
    tick(dt);
    paint(game);
  }
  requestAnimationFrame(frame);
}

const focus = gridInput(board, move);
picker.addEventListener("change", () => openStage(Number(picker.value)));
action.addEventListener("click", () => {
  const index = game.course.index;
  if (game.mode === "ready") start();
  else {
    const next = game.mode === "clear" && index < levelCount - 1 ? index + 1 : index;
    openStage(next, "playing");
    focus();
  }
});
get("restart").addEventListener("click", () => { openStage(game.course.index, "playing"); focus(); });
get("help").addEventListener("click", () => { game.queued = null; help.showModal(); });
openStage(progress.level);
paint.onSpriteLoad(() => paint(game));
new ResizeObserver(() => paint(game, true)).observe(board);
requestAnimationFrame(frame);
