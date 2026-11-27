import { directions, gameSound, gridInput, language, readSaved, writeSaved } from "../little-arcade.js";
import { levels } from "./levels.js";
import { parseRoom, solvedRoom, stepRoom } from "./room.js";

const get = (id) => document.getElementById(id);
const board = get("board");
const picker = get("level");
const result = get("result");
const progressKey = "hamster-move-progress";
const chapters = [["新家門廊", "Front Porch"], ["甜點廚房", "Kitchen"], ["午後閣樓", "Attic"], ["手作工坊", "Workshop"]];
const tips = [
  ["站到箱子左邊，再往右推。", "Stand to the left of the box, then push right."],
  ["箱子靠牆後，只能沿著牆推。", "Once a box is against a wall, it can only slide along it."],
  ["把角落留給有星星地墊的箱子。", "Push a box into a corner only when the corner has a star mat."],
  ["先留一條路讓栗栗走到箱子另一邊。", "Keep a path open so Lili can get behind each box."]
];

function loadProgress() {
  try {
    const saved = JSON.parse(readSaved(progressKey));
    if (saved && Number.isInteger(saved.level) && levels[saved.level]) {
      return { level: saved.level, trails: saved.trails ?? {}, records: saved.records ?? {} };
    }
  } catch { /* Start on the first room if storage cannot be read. */ }
  return { level: 0, trails: {}, records: {} };
}

const progress = loadProgress();
let say = (zh) => zh;
let audio;
let room, state, trail, history, pieces, mascot;
language((translate) => {
  say = translate;
  document.title = say("倉鼠搬家 · Hamster Move", "Hamster Move · 倉鼠搬家");
  audio?.label();
  if (state) { render(); renderPicker(); }
});
audio = gameSound("hamster-move-sound", (zh, en) => say(zh, en));

function placedCount() {
  return state.crates.filter((crate) => room.mats.has(crate)).length;
}

function persist() {
  progress.trails[progress.level] = trail.join(",");
  writeSaved(progressKey, JSON.stringify(progress));
}

function announce(message) {
  get("announcement").textContent = message;
}

function position(node, cell) {
  node.style.setProperty("--x", cell % room.columns);
  node.style.setProperty("--y", Math.floor(cell / room.columns));
}

function makePiece(className) {
  const node = document.createElement("div");
  node.className = `piece ${className}`;
  node.setAttribute("aria-hidden", "true");
  return node;
}

function buildBoard() {
  board.replaceChildren();
  board.style.setProperty("--cols", room.columns);
  board.style.setProperty("--rows", room.rows);
  const tileNodes = [];
  for (const [cell, tile] of [...room.cells].entries()) {
    if (tile === "-") continue;
    const node = document.createElement("div");
    node.className = tile === "#" ? "tile wall" : "tile floor";
    node.setAttribute("aria-hidden", "true");
    node.classList.toggle("alt", (cell % room.columns + Math.floor(cell / room.columns)) % 2 === 1);
    node.classList.toggle("target", room.mats.has(cell));
    position(node, cell);
    tileNodes.push(node);
  }
  board.append(...tileNodes);
  pieces = state.crates.map(() => {
    const piece = makePiece("crate");
    const shape = document.createElement("span");
    shape.className = "box-shape";
    piece.append(shape);
    return piece;
  });
  mascot = makePiece("hamster-piece");
  const image = new Image();
  image.src = "./assets/lili.webp";
  image.alt = "";
  mascot.append(image);
  board.append(...pieces, mascot);
}

function renderPicker() {
  picker.replaceChildren(...chapters.map(([zh, en], chapter) => {
    const group = document.createElement("optgroup");
    group.label = say(zh, en);
    levels.slice(chapter * 6, chapter * 6 + 6).forEach((level, position) => {
      const index = chapter * 6 + position;
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `${progress.records[index] ? "✓ " : ""}${index + 1} · ${say(level.zh, level.en)}`;
      group.append(option);
    });
    return group;
  }));
  picker.value = progress.level;
}

function render() {
  const index = progress.level;
  const level = levels[index];
  const record = progress.records[index];
  const done = solvedRoom(room, state);
  const last = index === levels.length - 1;
  get("round").textContent = `${index + 1} / ${levels.length}`;
  get("room-name").textContent = say(level.zh, level.en);
  get("steps").textContent = trail.length;
  get("pushes").textContent = state.pushes;
  get("record").textContent = record
    ? say(`最佳 ${record.moves} 步 · 最少推 ${level.goalPushes} 次`, `Best ${record.moves} steps · ${level.goalPushes} pushes possible`)
    : say(`最少推 ${level.goalPushes} 次就能完成`, `Solvable in ${level.goalPushes} pushes`);
  const cleared = Object.keys(progress.records).length;
  get("solved").textContent = say(`已搬完 ${cleared} / ${levels.length} 間`, `${cleared} / ${levels.length} rooms unpacked`);
  get("tip").textContent = say(...tips[index === 0 ? 0 : (index - 1) % 3 + 1]);
  get("undo").disabled = !history.length;
  get("resolved-next").hidden = !(done && result.hidden && !last);
  for (const button of document.querySelectorAll("[data-move]")) button.disabled = done;
  for (const [i, crate] of state.crates.entries()) {
    position(pieces[i], crate);
    pieces[i].classList.toggle("placed", room.mats.has(crate));
  }
  position(mascot, state.player);
  mascot.classList.toggle("facing-left", state.face === "left");

  get("result-title").textContent = cleared === levels.length
    ? say("全部房間都搬好了！", "All rooms unpacked!") : say("搬好了！", "All unpacked!");
  get("result-detail").textContent = say(`走了 ${trail.length} 步，推了 ${state.pushes} 次箱子。`, `${trail.length} steps and ${state.pushes} pushes.`);
  get("next").hidden = last;
}

function openLevel(index, resume = true) {
  progress.level = index;
  room = parseRoom(levels[index].rows);
  state = room.start;
  trail = [];
  history = [];
  const saved = progress.trails[index];
  if (resume && typeof saved === "string" && saved) {
    for (const move of saved.split(",")) {
      if (solvedRoom(room, state)) break;
      const next = stepRoom(room, state, move);
      if (!next) break;
      history.push(state);
      trail.push(move);
      state = next;
    }
  }
  result.hidden = true;
  buildBoard();
  render();
  renderPicker();
  persist();
  announce(say(`第 ${index + 1} 關，${levels[index].zh}`, `Room ${index + 1}, ${levels[index].en}`));
}

function move(direction) {
  if (!result.hidden || solvedRoom(room, state)) return;
  const next = stepRoom(room, state, direction);
  if (!next) {
    board.classList.remove("bump");
    void board.offsetWidth;
    board.classList.add("bump");
    return;
  }
  const previousPlaced = placedCount();
  const pushed = next.pushes !== state.pushes;
  history.push(state);
  state = next;
  trail.push(direction);
  if (solvedRoom(room, state)) {
    const record = progress.records[progress.level];
    if (!record || trail.length < record.moves) progress.records[progress.level] = { moves: trail.length };
    renderPicker();
    result.hidden = false;
    audio.play([523, 659, 784, 1047]);
    announce(say("紙箱全部放好了！", "Every box is in place!"));
  } else if (pushed) {
    const placed = placedCount();
    audio.play(placed > previousPlaced ? [660, 796] : [396]);
    announce(say(`已放好 ${placed} / ${state.crates.length} 個箱子`, `${placed} of ${state.crates.length} boxes placed`));
  }
  render();
  persist();
  if (!result.hidden) (get("next").hidden ? get("review") : get("next")).focus({ preventScroll: true });
}

function undo() {
  if (!history.length) return;
  state = history.pop();
  trail.pop();
  result.hidden = true;
  render();
  persist();
  announce(say("已撤銷一步", "Move undone"));
}

const focus = gridInput(board, move, {
  undo,
  tap(event) {
    const rect = board.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * room.columns / rect.width) - (state.player % room.columns);
    const y = Math.floor((event.clientY - rect.top) * room.rows / rect.height) - Math.floor(state.player / room.columns);
    const adjacent = Object.entries(directions).find(([, [dx, dy]]) => dx === x && dy === y);
    if (adjacent) move(adjacent[0]);
  }
});

picker.addEventListener("change", () => {
  openLevel(Number(picker.value));
  focus();
});
get("undo").addEventListener("click", () => { undo(); focus(); });
get("restart").addEventListener("click", () => { openLevel(progress.level, false); focus(); });
get("help").addEventListener("click", () => get("instructions").showModal());
get("review").addEventListener("click", () => { result.hidden = true; render(); focus(); });
for (const id of ["next", "resolved-next"]) {
  get(id).addEventListener("click", () => { openLevel(progress.level + 1); focus(); });
}

openLevel(progress.level);
