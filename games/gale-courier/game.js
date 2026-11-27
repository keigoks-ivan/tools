const stage = document.querySelector("#stage");
const canvas = document.querySelector("#scene");
const context = canvas.getContext("2d", { alpha: false });
const startButton = document.querySelector("#start");
const pauseButton = document.querySelector("#pause");
const soundButton = document.querySelector("#sound");
const musicButton = document.querySelector("#music");
const languageButton = document.querySelector("#language");
const restartButton = document.querySelector("#restart");
const mapButton = document.querySelector("#map-open");
const courseMap = document.querySelector("#course-map");
const mapGrid = document.querySelector("#map-grid");
const chapter = document.querySelector("#chapter");
const title = document.querySelector("#title");
const lede = document.querySelector("#lede");
const message = document.querySelector("#game-message");
const seedsLabel = document.querySelector("#seeds");
const healthLabel = document.querySelector("#health");
const hearts = healthLabel.querySelectorAll(".heart");
const progress = document.querySelector("#route-progress");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const staticCopy = Array.from(document.querySelectorAll("[data-en]"), element =>
  [element, element.textContent, element.dataset.en]);
const staticLabels = Array.from(document.querySelectorAll("[data-en-label]"), element =>
  [element, element.getAttribute("aria-label"), element.dataset.enLabel]);

let run = createRun();
let state = "title";
let width = PLAYFIELD.height;
let camera = 0;
let particles = [];
let previousTime = 0;
let accumulator = 0;
let gameTime = 0;
let messageTimer;
let displayedHealth;
let displayedSeeds;
let displayedProgress;
let displayedCheckpoint;
let routePosts = [];

const keyboard = new Set();
const pointers = new Map();
let jumpPressed = false;
let audioContext;
let score;
let soundEnabled = getSetting("windspire_mute") !== "1";
let musicEnabled = getSetting("gale_music_mute") !== "1";
let locale = getSetting("lang") === "en" ? 1 : 0;
const best = readCampaign();
const tr = (zh, en) => locale ? en : zh;
const courseNumber = index => String(index + 1).padStart(2, "0");
const difficulty = [
  ["入門", "Easy"], ["進階", "Moderate"], ["挑戰", "Challenging"], ["高難", "Expert"],
];

function getSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function setSetting(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function readCampaign() {
  let record;
  try { record = JSON.parse(getSetting("gale_campaign")); } catch {}
  return COURSES.map((course, index) => {
    const seeds = record?.[index];
    return Number.isInteger(seeds) && seeds >= 0 && seeds <= course.seeds.length ? seeds : -1;
  });
}

function suggestedCourse() {
  const incomplete = best.indexOf(-1);
  return incomplete < 0 ? 0 : incomplete;
}

function resizeScene() {
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  if (!displayWidth || !displayHeight) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(displayWidth * ratio);
  canvas.height = Math.round(displayHeight * ratio);
  width = PLAYFIELD.height * displayWidth / displayHeight;
  context.setTransform(canvas.width / width, 0, 0, canvas.height / PLAYFIELD.height, 0, 0);
}
new ResizeObserver(resizeScene).observe(stage);
resizeScene();

function updateAudioButtons() {
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? tr("音效已開啟", "Sound on") : tr("音效已關閉", "Sound off"));
  musicButton.setAttribute("aria-pressed", String(musicEnabled));
  musicButton.setAttribute("aria-label", musicEnabled ? tr("配樂已開啟", "Music on") : tr("配樂已關閉", "Music off"));
}

function unlockAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if ((!soundEnabled && !musicEnabled) || !Audio) return;
  audioContext ??= new Audio();
  score ??= new CourierScore(audioContext);
  if (audioContext.state !== "running") audioContext.resume().catch(() => {});
}

function syncMusic() {
  if (state === "playing" && musicEnabled) score?.play(run.course.theme);
  else score?.stop();
}

const sounds = {
  start: [[330, 392, 0, .12], [494, 580, .09, .23]],
  jump: [[240, 430, 0, .13]],
  spring: [[295, 590, 0, .18], [720, 880, .055, .13]],
  seed: [[670, 890, 0, .11], [990, 1260, .08, .16]],
  stomp: [[160, 86, 0, .18]],
  hurt: [[270, 100, 0, .25]],
  checkpoint: [[392, 392, 0, .22], [494, 494, .11, .25], [659, 659, .24, .37]],
  win: [[392, 392, 0, .3], [494, 494, .12, .3], [587, 587, .24, .35], [784, 784, .39, .65]],
};

function playSound(event) {
  if (!soundEnabled || audioContext?.state !== "running" || !sounds[event]) return;
  for (const [pitch, endPitch, delay, duration] of sounds[event]) {
    const time = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = event === "hurt" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(pitch, time);
    oscillator.frequency.exponentialRampToValueAtTime(endPitch, time + duration);
    gain.gain.setValueAtTime(.001, time);
    gain.gain.exponentialRampToValueAtTime(.09, time + .025);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }
}

function updateHud() {
  if (displayedHealth !== run.lives) {
    displayedHealth = run.lives;
    healthLabel.setAttribute("aria-label", tr(`生命 ${run.lives} / 3`, `Health ${run.lives} / 3`));
    hearts.forEach((heart, i) => heart.classList.toggle("empty", i >= run.lives));
  }
  if (displayedSeeds !== run.count) {
    displayedSeeds = run.count;
    seedsLabel.textContent = String(run.count).padStart(2, "0");
    seedsLabel.setAttribute("aria-label", tr(`風種 ${run.count}`, `Wind seeds ${run.count}`));
  }
  const percent = Math.floor(run.progress * 100);
  if (displayedProgress !== percent) {
    displayedProgress = percent;
    progress.style.setProperty("--progress", `${percent}%`);
    progress.setAttribute("aria-valuenow", percent);
  }
  if (displayedCheckpoint !== run.checkpoint) {
    displayedCheckpoint = run.checkpoint;
    routePosts.forEach((post, index) => post.classList.toggle("reached", index < run.checkpoint));
  }
}

function updateCourseLabels() {
  document.querySelector("#route-label").textContent = `${courseNumber(run.courseIndex)} / ${COURSES.length}`;
  document.querySelector("#place").textContent = run.course.name[locale];
  stage.style.setProperty("--course-light", terrain[run.course.background][4]);
  for (const post of routePosts) post.remove();
  const length = run.course.goal - PLAYFIELD.spawn;
  routePosts = run.course.checkpoints.map(x => {
    const marker = document.createElement("span");
    marker.className = "route-post";
    marker.setAttribute("aria-hidden", "true");
    marker.style.setProperty("--post", `${100 * (x - PLAYFIELD.spawn) / length}%`);
    return marker;
  });
  progress.append(...routePosts);
  displayedCheckpoint = undefined;
}

function toast(text) {
  clearTimeout(messageTimer);
  message.textContent = text;
  if (text) messageTimer = setTimeout(() => { message.textContent = ""; }, 2800);
}

function clearInput() {
  keyboard.clear();
  pointers.clear();
  jumpPressed = false;
}

function renderOverlay() {
  const paused = state === "paused";
  const canContinue = state === "lost" && run.checkpoint > 0;
  pauseButton.disabled = state !== "playing" && !paused;
  pauseButton.setAttribute("aria-label", paused ? tr("繼續遊戲", "Resume game") : tr("暫停遊戲", "Pause game"));
  pauseButton.querySelector(".action-label").textContent = paused ? tr("繼續", "Resume") : tr("暫停", "Pause");
  if (state === "playing") return;
  const finalCourse = run.courseIndex === COURSES.length - 1;
  const collected = tr(`已收集 ${run.count} / ${run.seeds.length} 顆風種。`, `Collected ${run.count} / ${run.seeds.length} wind seeds.`);
  const current = run.course.name[locale];
  const titleStart = suggestedCourse() ? tr("繼續郵路", "Continue") : tr("開始遊戲", "Start game");
  const copy = {
    title: [tr("最後一封信", "The last letter"), "", tr("跑過十段郵路，把最後一封信送到風塔。", "Cross ten courses to deliver the last letter to the Windspire."), titleStart],
    paused: [current, tr("遊戲暫停", "Game paused"), run.course.hint[locale], tr("繼續遊戲", "Resume")],
    lost: [current, tr("郵路中斷", "Delivery interrupted"), collected,
      canContinue ? tr("從郵站繼續", "Continue from checkpoint") : tr("再試一次", "Try again")],
    won: [current, finalCourse ? tr("信已送達", "Letter delivered") : tr("順利抵達", "Course cleared"), collected,
      finalCourse ? tr("查看郵路", "Open route map") : tr("下一關", "Next course")],
  }[state];
  chapter.textContent = `✦  ${copy[0]}`;
  if (state !== "title") {
    title.removeAttribute("lang");
    title.textContent = copy[1];
  }
  lede.textContent = copy[2];
  document.querySelector("#start-label").textContent = copy[3];
  mapButton.hidden = state === "won" && finalCourse;
  restartButton.hidden = !paused && !canContinue;
}

function applyLanguage() {
  document.documentElement.lang = tr("zh-Hant", "en");
  for (const [element, zh, en] of staticCopy) element.textContent = tr(zh, en);
  for (const [element, zh, en] of staticLabels) element.setAttribute("aria-label", tr(zh, en));
  languageButton.textContent = tr("EN", "中文");
  languageButton.setAttribute("aria-label", tr("Switch language to English", "切換至中文"));
  updateAudioButtons();
  updateCourseLabels();
  displayedHealth = displayedSeeds = undefined;
  updateHud();
  renderOverlay();
}

function setState(next) {
  state = next;
  stage.dataset.state = state;
  clearInput();
  syncMusic();
  renderOverlay();
  if (state === "playing") {
    if ([startButton, restartButton, mapButton].includes(document.activeElement)) document.activeElement.blur();
  } else {
    toast("");
    startButton.focus({ preventScroll: true });
  }
}

function openMap() {
  const completed = best.filter(value => value >= 0).length;
  document.querySelector("#map-progress").textContent = tr(`已完成 ${completed} / ${COURSES.length} 關`, `${completed} / ${COURSES.length} courses cleared`);
  const buttons = COURSES.map((course, index) => {
    const button = document.createElement("button");
    button.className = "course-option";
    button.type = "button";
    button.style.setProperty("--course-art", `url(${course.background}.webp)`);
    if (state !== "title" && index === run.courseIndex) button.setAttribute("aria-current", "true");
    const number = document.createElement("span");
    number.className = "course-number";
    const tier = index < 2 ? 0 : index < 4 ? 1 : index < 7 ? 2 : 3;
    number.textContent = `${courseNumber(index)} · ${difficulty[tier][locale]}`;
    const name = document.createElement("strong");
    name.textContent = course.name[locale];
    const result = document.createElement("span");
    result.className = "course-result";
    result.textContent = best[index] < 0
      ? tr("待送信", "Undelivered")
      : tr(`已完成・${best[index]} / ${course.seeds.length} 風種`, `Cleared · ${best[index]} / ${course.seeds.length} seeds`);
    button.append(number, name, result);
    button.addEventListener("click", () => {
      courseMap.close();
      startCourse(index);
    });
    return button;
  });
  mapGrid.replaceChildren(...buttons);
  courseMap.showModal();
}

function startRun() {
  if (state === "paused") {
    unlockAudio();
    setState("playing");
    return;
  }
  if (state === "won" && run.courseIndex === COURSES.length - 1) {
    openMap();
    return;
  }
  if (state === "lost" && run.checkpoint) {
    unlockAudio();
    respawnAtPost(run);
    run.lives = 3;
    run.phase = "playing";
    particles = [];
    camera = courseCamera();
    setState("playing");
    updateHud();
    return;
  }
  const index = state === "title" ? suggestedCourse() : run.courseIndex + Number(state === "won");
  startCourse(index);
}

function startCourse(index) {
  unlockAudio();
  run = createRun(index);
  particles = [];
  camera = 0;
  gameTime = 0;
  setState("playing");
  toast(run.course.hint[locale]);
  updateCourseLabels();
  updateHud();
  playSound("start");
}

function togglePause() {
  if (state === "playing") setState("paused");
  else if (state === "paused") startRun();
}

const keyInputs = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump",
};

function inputActive(name) {
  return [...keyboard].some(code => keyInputs[code] === name) || [...pointers.values()].includes(name);
}

window.addEventListener("keydown", event => {
  if (courseMap.open || event.metaKey || event.altKey || event.ctrlKey) return;
  if (event.code === "Escape" && (state === "playing" || state === "paused")) {
    event.preventDefault();
    if (!event.repeat) togglePause();
    return;
  }
  if (event.code === "Enter" && state !== "playing" &&
      (!(event.target instanceof HTMLButtonElement) || event.target === startButton)) {
    event.preventDefault();
    if (!event.repeat) startRun();
    return;
  }
  const input = keyInputs[event.code];
  if (!input || state !== "playing") return;
  if (event.code === "Space" && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (input === "jump" && !inputActive("jump") && !event.repeat) jumpPressed = true;
  keyboard.add(event.code);
});
window.addEventListener("keyup", event => keyboard.delete(event.code));
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") setState("paused");
});

for (const button of document.querySelectorAll("[data-input]")) {
  button.addEventListener("pointerdown", event => {
    if (state !== "playing") return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (button.dataset.input === "jump" && !inputActive("jump")) jumpPressed = true;
    pointers.set(event.pointerId, button.dataset.input);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, event => pointers.delete(event.pointerId));
  }
}

soundButton.addEventListener("click", event => {
  soundEnabled = !soundEnabled;
  setSetting("windspire_mute", soundEnabled ? "0" : "1");
  unlockAudio();
  updateAudioButtons();
  if (event.detail && state === "playing") soundButton.blur();
});
musicButton.addEventListener("click", event => {
  musicEnabled = !musicEnabled;
  setSetting("gale_music_mute", musicEnabled ? "0" : "1");
  unlockAudio();
  syncMusic();
  updateAudioButtons();
  if (event.detail && state === "playing") musicButton.blur();
});
languageButton.addEventListener("click", event => {
  locale = 1 - locale;
  setSetting("lang", tr("zh", "en"));
  applyLanguage();
  toast("");
  if (event.detail && state === "playing") languageButton.blur();
});
startButton.addEventListener("click", startRun);
pauseButton.addEventListener("click", togglePause);
mapButton.addEventListener("click", openMap);
restartButton.addEventListener("click", () => startCourse(run.courseIndex));
applyLanguage();

function emitParticles(event) {
  const ground = event.type === "land" || event.type === "jump";
  const colors = ground ? ["#dec49a", "#768767"] : ["#ffe4a8", "#ed9b6e", "#abce9a"];
  for (let i = 0; i < (ground ? 5 : 12); i += 1) {
    particles.push({ x: event.x, y: event.y, vx: (Math.random() - .5) * 160,
      vy: -18 - Math.random() * 98, size: 2 + Math.floor(Math.random() * 3),
      life: .23 + Math.random() * .35, color: colors[i % colors.length] });
  }
}

function courseCamera() {
  return clamp(run.player.x - width * .32, 0, Math.max(0, run.course.end - width));
}

function simulateFrame(dt) {
  accumulator += dt;
  const input = { left: inputActive("left"), right: inputActive("right"), jumpHeld: inputActive("jump") };
  while (accumulator >= STEP && run.phase === "playing") {
    input.jumpPressed = jumpPressed;
    advanceRun(run, input);
    jumpPressed = false;
    accumulator -= STEP;
  }
  for (const event of run.events.splice(0)) {
    if (!reducedMotion.matches) emitParticles(event);
    playSound(event.type);
    if (event.type === "checkpoint") {
      toast(tr(`郵站 ${event.number} / ${run.course.checkpoints.length}，生命已補滿`,
        `Checkpoint ${event.number} / ${run.course.checkpoints.length}. Health restored.`));
    }
  }
  for (const mote of particles) {
    mote.x += mote.vx * dt;
    mote.y += mote.vy * dt;
    mote.vy += 210 * dt;
    mote.life -= dt;
  }
  particles = particles.filter(mote => mote.life > 0);
  const ideal = courseCamera();
  camera = Math.abs(camera - ideal) > width * .65 ? ideal : camera + (ideal - camera) * Math.min(1, dt * 8);
  updateHud();
  if (run.phase === "won") {
    best[run.courseIndex] = Math.max(best[run.courseIndex], run.count);
    setSetting("gale_campaign", JSON.stringify(best));
  }
  if (run.phase !== "playing") setState(run.phase);
}

function frame(now) {
  const dt = previousTime ? Math.min((now - previousTime) / 1000, .05) : 0;
  previousTime = now;
  if (state === "playing") {
    gameTime += dt;
    simulateFrame(dt);
    score?.update();
  } else {
    accumulator = 0;
  }
  const artTime = state === "title" && !reducedMotion.matches ? now / 1000 : gameTime;
  renderScene(context, width, run, camera, artTime, particles, state === "title");
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
