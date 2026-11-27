export function readSaved(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeSaved(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Play continues with in-memory state. */ }
}

export function language(onChange) {
  const button = document.querySelector("#language");
  const text = [...document.querySelectorAll("[data-en]")].map((node) => [node, node.textContent, node.dataset.en]);
  const attributes = [["data-en-label", "aria-label"], ["data-en-alt", "alt"]].flatMap(([data, attribute]) =>
    [...document.querySelectorAll(`[${data}]`)].map((node) =>
      [node, attribute, node.getAttribute(attribute), node.getAttribute(data)]));
  let english = readSaved("lang") === "en";
  const say = (zh, en) => english ? en : zh;
  function render() {
    document.documentElement.lang = say("zh-Hant", "en");
    button.textContent = say("EN", "中文");
    button.setAttribute("aria-label", say("Switch to English", "切換成中文"));
    for (const [node, zh, en] of text) node.textContent = say(zh, en);
    for (const [node, attribute, zh, en] of attributes) node.setAttribute(attribute, say(zh, en));
    onChange(say);
  }
  button.addEventListener("click", () => {
    english = !english;
    writeSaved("lang", say("zh", "en"));
    render();
  });
  render();
  return say;
}

export const directions = {
  up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0]
};

const keys = {
  ArrowUp: "up", KeyW: "up", ArrowLeft: "left", KeyA: "left",
  ArrowDown: "down", KeyS: "down", ArrowRight: "right", KeyD: "right"
};

export function gridInput(board, move, { undo, tap } = {}) {
  const focusBoard = () => board.focus({ preventScroll: true });
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      move(button.dataset.move);
      focusBoard();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]") || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest?.("button, a, input, select, textarea, [contenteditable]")) return;
    const direction = keys[event.code];
    if (direction) {
      event.preventDefault();
      move(direction);
    } else if (event.code === "KeyZ" && undo) {
      event.preventDefault();
      undo();
    }
  });

  let pointer;
  board.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    board.setPointerCapture(event.pointerId);
    focusBoard();
  });
  board.addEventListener("pointerup", (event) => {
    if (pointer?.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = undefined;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
      tap?.(event);
    } else if (Math.abs(dx) > Math.abs(dy)) {
      move(dx < 0 ? "left" : "right");
    } else {
      move(dy < 0 ? "up" : "down");
    }
  });
  board.addEventListener("lostpointercapture", () => { pointer = undefined; });
  board.addEventListener("pointercancel", () => { pointer = undefined; });
  return focusBoard;
}

export function gameSound(key, say) {
  const button = document.querySelector("#sound");
  let muted = readSaved(key) !== "on";
  let audio;
  let output;
  function label() {
    button.setAttribute("aria-pressed", String(!muted));
    button.setAttribute("aria-label", muted ? say("開啟音效", "Turn sound on") : say("關閉音效", "Turn sound off"));
  }
  function play(notes) {
    if (muted) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!audio) {
        audio = new Audio();
        output = audio.createGain();
        output.connect(audio.destination);
      }
      if (audio.state === "suspended") audio.resume().catch(() => {});
      notes.forEach((frequency, index) => {
        const now = audio.currentTime + index * .075;
        const wave = audio.createOscillator();
        const envelope = audio.createGain();
        wave.frequency.setValueAtTime(frequency, now);
        envelope.gain.setValueAtTime(.001, now);
        envelope.gain.linearRampToValueAtTime(.045, now + .016);
        envelope.gain.exponentialRampToValueAtTime(.001, now + .14);
        wave.connect(envelope).connect(output);
        wave.start(now);
        wave.stop(now + .15);
      });
    } catch { /* Sound is optional. */ }
  }
  button.addEventListener("click", () => {
    muted = !muted;
    writeSaved(key, muted ? "off" : "on");
    if (output) output.gain.value = muted ? 0 : 1;
    label();
    play([525, 660]);
  });
  label();
  return { play, label };
}
