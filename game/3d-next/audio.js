/**
 * 紫刃 3D 試作音效／配樂模組（?hero=vroid；預設 Rumi 頁面不載入、維持靜音）。
 *
 * All audio is original and synthesised offline by game/scripts/audio/make_audio.py
 * (see its docstring to regenerate). Files live in game/assets/audio/march/:
 *   manifest.json  loop points, loudness, sprite table
 *   market / plaza / boss .mp3   seamless loops (pre-roll + post-roll around loopStart/loopEnd)
 *   victory / defeat .mp3        one-shot stings
 *   sfx.mp3                      mono sprite of every effect (+ a 2 kHz calibration burst)
 *
 * Usage (battle.js / boot.js):
 *   const audio = createAudio({ baseUrl: '../assets/audio/march/' });
 *   startButton.onclick = () => { audio.unlock(); ... };      // inside the user gesture (iOS/Android)
 *   for (const event of drainedEvents) audio.onEvent(event);  // every combat / march event
 *   audio.update(realDt, dt / realDt, arena.hero);            // per frame (slow-mo, listener)
 *   audio.setPaused(true|false); audio.setMuted(bool); audio.setVolume({ music, sfx });
 *
 * Pure helpers (mapEvent, VoiceLimiter, smoothLoopSeam, findMarker, SOUNDS, musicForSegment)
 * are exported for node tests; nothing touches Web Audio until createAudio() / unlock().
 *
 * Event → sound (mapEvent):
 *   swing        kind attack → swing_light (combo ≥4 & last → swing_heavy); heavy → swing_heavy;
 *                special+flurry → swing_musou (pitch rises with index); special → swing_heavy
 *   slash        only with createAudio({ slashWhoosh: true }) for non-musou Arenas (vroid always emits swing)
 *   airSlash     swing_light +2 st        plunge → swing_heavy +3 st      jump → jump
 *   land         plunge → plunge boom; else land (soft)
 *   hit          by target role: breakable → hit_prop, lantern → hit_lantern;
 *                by source: attack → hit_light, heavy → hit_heavy, special → hit_heavy (quieter);
 *                armored adds a dull guard clank
 *   guard → guard (擋)   guardBreak → guard_break (破)   sidestep/airEvade → sidestep   dodge → dodge
 *   kill         grunts → soul_burst (+ sometimes a dying oni grunt); officer/boss → hit_finisher;
 *                breakable / lantern → nothing (their own *Broken event plays)
 *   enemyAttack  boss → boss_grunt; officer → oni shout; grunts → oni (35 %)
 *   telegraph    officer / boss only → telegraph glint   groundTelegraph → telegraph (soft)
 *   hurt → hurt   knockback (heavy) → launch
 *   special (non-flurry) / musouStart → musou_start (真・無雙: variant 1) + music duck
 *   musouFinish  → musou_finish (variant 1 when true) + deep music duck; musouEnd releases it
 *   pickup       bun (護身符) → pickup_charm, bigBun (靈燈) → pickup_lamp, wine (魂晶) → pickup_crystal
 *   heal (not right after a pickup) → heal      drop → drop
 *   breakableBroken  jar → break_jar, crate / barrel → break_wood
 *   lanternBroken → lantern_break   lanternSpawn → summon (soft)   summon → summon
 *   officer → officer_appear   officerDown / bossDown → officer_down (+ hit_finisher on boss) + duck
 *   bossIntro → boss_intro, boss_roar (+0.7 s), boss music    roar → boss_roar
 *   bossSlam / bossSweep / bossJump → boss_slam / boss_sweep / boss_jump
 *   gateOpen → gate_open   gateClose → gate_close
 *   lampHit → lamp_hit   lampBroken → lamp_break   lampSecured → lamp_secured   lampRestored → lamp_secured (soft)
 *   group → distant oni growl (50 %)
 *   segment      index 0 → market, 1–2 → plaza, 3 → boss (music)
 *   wave (single stage)  1 → market, 2 → plaza, 'boss' → boss
 *   clear / win → victory sting    fail / dead → defeat sting
 *   UI: audio.ui() → ui_click
 */

export const STORAGE_KEY = 'huntrx-3d-audio-v1';
export const DEFAULT_SETTINGS = { muted: false, music: 0.55, sfx: 0.9 };
// 音效整體再壓低約 6 dB（使用者回饋音效太大聲）；乘在音量設定之上，已存過設定的玩家也會生效
export const SFX_TRIM = 0.5;

/** Per-sound playback rules. max = simultaneous voices, gap = min seconds between starts,
 *  gain = base linear gain, pitch = random ± semitones, vol = random ± dB, prio (higher survives
 *  the global voice cap), steal = replace the oldest voice instead of dropping the new one. */
export const SOUNDS = {
  swing_light: { max: 3, gap: 0.03, gain: 0.7, pitch: 1.2, vol: 1.5, prio: 1, steal: true },
  swing_heavy: { max: 2, gap: 0.05, gain: 0.8, pitch: 0.8, vol: 1, prio: 2, steal: true },
  swing_musou: { max: 3, gap: 0.03, gain: 0.6, pitch: 0.8, vol: 1.5, prio: 1, steal: true },
  hit_light: { max: 4, gap: 0.025, gain: 0.8, pitch: 1.5, vol: 2, prio: 2, steal: true },
  hit_heavy: { max: 3, gap: 0.03, gain: 0.85, pitch: 1.2, vol: 1.5, prio: 2, steal: true },
  hit_finisher: { max: 2, gap: 0.08, gain: 0.95, pitch: 0.8, vol: 1, prio: 3, steal: true },
  hit_prop: { max: 2, gap: 0.05, gain: 0.8, pitch: 1.5, vol: 1.5, prio: 1 },
  hit_lantern: { max: 2, gap: 0.05, gain: 0.8, pitch: 1.2, vol: 1.5, prio: 1 },
  guard: { max: 2, gap: 0.06, gain: 0.75, pitch: 0.8, vol: 1.5, prio: 2, steal: true },
  guard_break: { max: 1, gap: 0.2, gain: 0.95, pitch: 0.5, vol: 1, prio: 3 },
  oni: { max: 2, gap: 0.25, gain: 0.55, pitch: 2.0, vol: 2, prio: 0 },
  boss_roar: { max: 1, gap: 1.0, gain: 1.0, pitch: 0.4, vol: 0.5, prio: 3 },
  boss_grunt: { max: 1, gap: 0.4, gain: 0.8, pitch: 1.0, vol: 1, prio: 2 },
  soul_burst: { max: 4, gap: 0.04, gain: 0.6, pitch: 1.5, vol: 2, prio: 1, steal: true },
  launch: { max: 2, gap: 0.06, gain: 0.55, pitch: 1.5, vol: 1.5, prio: 0 },
  land: { max: 2, gap: 0.1, gain: 0.5, pitch: 1.0, vol: 1.5, prio: 1 },
  jump: { max: 1, gap: 0.1, gain: 0.55, pitch: 1.0, vol: 1, prio: 1 },
  plunge: { max: 1, gap: 0.3, gain: 0.95, pitch: 0.5, vol: 0.5, prio: 3 },
  pickup_charm: { max: 2, gap: 0.05, gain: 0.7, pitch: 0, vol: 0.5, prio: 2 },
  pickup_lamp: { max: 2, gap: 0.05, gain: 0.75, pitch: 0, vol: 0.5, prio: 2 },
  pickup_crystal: { max: 2, gap: 0.05, gain: 0.75, pitch: 0, vol: 0.5, prio: 2 },
  musou_start: { max: 1, gap: 0.5, gain: 1.0, pitch: 0, vol: 0, prio: 3 },
  musou_finish: { max: 1, gap: 0.5, gain: 1.0, pitch: 0, vol: 0, prio: 3 },
  officer_down: { max: 1, gap: 0.5, gain: 1.0, pitch: 0, vol: 0, prio: 3 },
  officer_appear: { max: 1, gap: 0.5, gain: 0.85, pitch: 0.3, vol: 0.5, prio: 2 },
  gate_open: { max: 1, gap: 0.5, gain: 0.85, pitch: 0, vol: 0, prio: 3 },
  gate_close: { max: 1, gap: 0.5, gain: 0.8, pitch: 0, vol: 0, prio: 2 },
  lantern_break: { max: 2, gap: 0.1, gain: 0.9, pitch: 0.8, vol: 1, prio: 3 },
  lamp_hit: { max: 2, gap: 0.15, gain: 0.7, pitch: 0.6, vol: 1, prio: 2 },
  lamp_break: { max: 1, gap: 0.5, gain: 1.0, pitch: 0, vol: 0, prio: 3 },
  lamp_secured: { max: 1, gap: 0.5, gain: 0.9, pitch: 0, vol: 0, prio: 3 },
  ui_click: { max: 2, gap: 0.03, gain: 0.8, pitch: 0.5, vol: 1, prio: 3 },
  hurt: { max: 2, gap: 0.08, gain: 0.85, pitch: 1.0, vol: 1, prio: 3, steal: true },
  dodge: { max: 2, gap: 0.08, gain: 0.6, pitch: 1.0, vol: 1, prio: 1 },
  sidestep: { max: 2, gap: 0.08, gain: 0.45, pitch: 1.5, vol: 1.5, prio: 0 },
  boss_slam: { max: 1, gap: 0.3, gain: 1.0, pitch: 0.4, vol: 0.5, prio: 3 },
  boss_sweep: { max: 1, gap: 0.3, gain: 0.9, pitch: 0.5, vol: 0.5, prio: 3 },
  boss_jump: { max: 1, gap: 0.3, gain: 0.8, pitch: 0.5, vol: 0.5, prio: 2 },
  boss_intro: { max: 1, gap: 2.0, gain: 1.0, pitch: 0, vol: 0, prio: 3 },
  telegraph: { max: 2, gap: 0.1, gain: 0.5, pitch: 0.6, vol: 1, prio: 2 },
  summon: { max: 1, gap: 0.5, gain: 0.7, pitch: 0.5, vol: 1, prio: 2 },
  break_wood: { max: 2, gap: 0.05, gain: 0.85, pitch: 1.2, vol: 1, prio: 2 },
  break_jar: { max: 2, gap: 0.05, gain: 0.85, pitch: 1.2, vol: 1, prio: 2 },
  drop: { max: 2, gap: 0.05, gain: 0.6, pitch: 1.5, vol: 1, prio: 1 },
  heal: { max: 1, gap: 0.3, gain: 0.7, pitch: 0, vol: 0, prio: 2 },
};

export const MUSIC_TRACKS = ['market', 'plaza', 'boss', 'victory', 'defeat'];
const STINGS = new Set(['victory', 'defeat']);
const SPATIAL = new Set(['hit', 'kill', 'guard', 'guardBreak', 'sidestep', 'enemyAttack', 'telegraph', 'breakableBroken',
  'lanternBroken', 'lampHit', 'lampBroken', 'group', 'bossSlam', 'bossSweep', 'bossJump', 'knockback', 'summon', 'officer', 'drop']);

/** Music cue for a march segment index (0 入口市集, 1 夜市廣場, 2 魂門階梯, 3 魂門頂端). */
export function musicForSegment(index) {
  return index <= 0 ? 'market' : index >= 3 ? 'boss' : 'plaza';
}

export function createEventState({ slashWhoosh = false } = {}) {
  return { roles: new Map(), lastPickupAt: -Infinity, sawSwing: false, slashWhoosh, now: 0 };
}

const cue = (id, extra) => ({ id, gain: 1, rate: 1, delay: 0, ...extra });
const semis = st => Math.pow(2, st / 12);

/**
 * Pure event → action mapping. Returns { cues: [{ id, gain, rate, delay, variant? }], music?, duck?, spatial }
 * and updates `state` (enemy roles from spawn events, pickup timing, swing-mode detection).
 * rand() → [0, 1) is injected so tests are deterministic.
 */
export function mapEvent(event, state, rand = Math.random) {
  const out = { cues: [], music: null, duck: null, spatial: SPATIAL.has(event.type) };
  const add = (id, extra) => out.cues.push(cue(id, extra));
  const role = event.role ?? state.roles.get(event.enemyId);
  switch (event.type) {
    case 'spawn':
      if (event.enemyId !== undefined) state.roles.set(event.enemyId, event.role);
      break;
    case 'swing':
      state.sawSwing = true;
      if (event.kind === 'special' && event.flurry) add('swing_musou', { rate: semis(Math.min(6, (event.index || 0) * 0.5)), gain: event.true ? 1 : 0.9 });
      else if (event.kind === 'special' || event.kind === 'heavy') add('swing_heavy');
      else if ((event.combo || 1) >= 4 && event.last) add('swing_heavy', { gain: 0.85, rate: semis(1) });
      else add('swing_light');
      break;
    case 'slash':   // musou-mode Arenas (every vroid run) emit swing at the hit frame instead
      if (state.slashWhoosh && !state.sawSwing) add(event.kind === 'heavy' ? 'swing_heavy' : 'swing_light');
      break;
    case 'airSlash': add('swing_light', { rate: semis(2) }); break;
    case 'plunge': add('swing_heavy', { rate: semis(3), gain: 0.8 }); break;
    case 'jump': add('jump'); break;
    case 'land': add(event.plunge ? 'plunge' : 'land'); break;
    case 'hit': {
      if (role === 'breakable') { add('hit_prop'); break; }
      if (role === 'lantern') { add('hit_lantern'); break; }
      if (event.source === 'heavy') add('hit_heavy');
      else if (event.source === 'special') add('hit_heavy', { gain: 0.7, rate: semis(1) });
      else add('hit_light', role === 'boss' || role === 'officer' ? { rate: semis(-1) } : undefined);
      if (event.armored) add('guard', { gain: 0.35, rate: semis(-4) });
      break;
    }
    case 'guard': add('guard'); break;
    case 'guardBreak': add('guard_break'); break;
    case 'sidestep': add('sidestep'); break;
    case 'airEvade': add('sidestep', { gain: 0.6, rate: semis(2) }); break;
    case 'dodge': add('dodge'); break;
    case 'hurt': add('hurt'); break;
    case 'knockback': if (event.source === 'heavy') add('launch'); break;
    case 'kill':
      if (event.enemyId !== undefined) state.roles.delete(event.enemyId);
      if (role === 'breakable' || role === 'lantern') break;
      if (role === 'boss' || role === 'officer') { add('hit_finisher'); add('soul_burst', { rate: semis(-5), delay: 0.05 }); break; }
      add('soul_burst');
      if (rand() < 0.3) add('oni', { variant: 2, gain: 0.6, delay: 0.02 });
      break;
    case 'enemyAttack':
      if (role === 'boss') add('boss_grunt');
      else if (role === 'officer') add('oni', { variant: 0, gain: 0.9, rate: semis(-2) });
      else if (rand() < 0.35) add('oni', { gain: 0.55 });
      break;
    case 'telegraph':
      if (role === 'boss' || role === 'officer') add('telegraph', role === 'boss' ? { rate: semis(-3) } : undefined);
      break;
    case 'groundTelegraph': add('telegraph', { gain: 0.6, rate: semis(-5) }); break;
    case 'special':
      if (!event.flurry) { add('musou_start', { variant: 0 }); out.duck = { level: 0.45, attack: 0.2, hold: 2.2 }; }
      break;
    case 'musouStart':
      add('musou_start', { variant: event.true ? 1 : 0 });
      out.duck = { level: 0.45, attack: 0.25, hold: (event.duration || 4.2) + 1.5 };
      break;
    case 'musouFinish':
      add('musou_finish', { variant: event.true ? 1 : 0 });
      out.duck = { level: 0.2, attack: 0.03, hold: 1.6, release: 2.5 };
      break;
    case 'musouEnd': out.duck = { level: 1, attack: 1.2 }; break;
    case 'pickup':
      state.lastPickupAt = state.now;
      add(event.kind === 'bigBun' ? 'pickup_lamp' : event.kind === 'wine' ? 'pickup_crystal' : 'pickup_charm');
      break;
    case 'heal': if (state.now - state.lastPickupAt > 0.1) add('heal'); break;
    case 'drop': add('drop'); break;
    case 'breakableBroken': add(event.breakType === 'jar' ? 'break_jar' : 'break_wood'); break;
    case 'lanternBroken': add('lantern_break'); break;
    case 'lanternSpawn': add('summon', { gain: 0.5, rate: semis(3) }); break;
    case 'summon': add('summon'); break;
    case 'group': if (rand() < 0.5) add('oni', { variant: 1, gain: 0.4, rate: semis(-1) }); break;
    case 'officer': add('officer_appear'); break;
    case 'officerDown':
      add('officer_down');
      out.duck = { level: 0.4, attack: 0.05, hold: 1.4, release: 1.5 };
      break;
    case 'bossDown':
      add('officer_down'); add('hit_finisher', { rate: semis(-3) });
      out.duck = { level: 0.3, attack: 0.05, hold: 1.8, release: 1.5 };
      break;
    case 'bossIntro':
      add('boss_intro'); add('boss_roar', { delay: 0.7 });
      out.music = { play: 'boss' };
      out.duck = { level: 0.5, attack: 0.1, hold: 2.4, release: 2.0 };
      break;
    case 'roar': add('boss_roar'); break;
    case 'bossSlam': add('boss_slam'); break;
    case 'bossSweep': add('boss_sweep'); break;
    case 'bossJump': add('boss_jump'); break;
    case 'gateOpen': add('gate_open'); break;
    case 'gateClose': add('gate_close'); break;
    case 'lampHit': add('lamp_hit'); break;
    case 'lampBroken': add('lamp_break'); break;
    case 'lampSecured': add('lamp_secured'); break;
    case 'lampRestored': add('lamp_secured', { gain: 0.6, rate: semis(2) }); break;
    case 'segment': out.music = { play: musicForSegment(event.index ?? 0) }; break;
    case 'wave': out.music = { play: event.wave === 'boss' ? 'boss' : event.wave >= 2 ? 'plaza' : 'market' }; break;
    case 'clear': case 'win': out.music = { play: 'victory' }; break;
    case 'fail': case 'dead': out.music = { play: 'defeat' }; break;
    default: break;
  }
  return out;
}

/**
 * Voice limiting: at most `max` simultaneous voices per sound, `gap` seconds between starts, and a
 * global cap where lower-priority sounds give way. request() → { ok, steal } where steal is the
 * voice handle to stop (oldest of the same sound) when the rule allows stealing.
 */
export class VoiceLimiter {
  constructor(rules = SOUNDS, globalMax = 24) {
    this.rules = rules;
    this.globalMax = globalMax;
    this.active = [];      // { id, end, start, handle, prio }
    this.lastStart = new Map();
  }

  prune(now) {
    if (this.active.some(v => v.end <= now)) this.active = this.active.filter(v => v.end > now);
  }

  count(id) {
    let n = 0;
    for (const v of this.active) if (v.id === id) n++;
    return n;
  }

  request(id, now, duration, handle = null) {
    const rule = this.rules[id] || { max: 2, gap: 0.03, prio: 1 };
    this.prune(now);
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < rule.gap) return { ok: false, reason: 'gap' };
    let steal = null;
    if (this.count(id) >= rule.max) {
      if (!rule.steal) return { ok: false, reason: 'max' };
      steal = this.active.filter(v => v.id === id).sort((a, b) => a.start - b.start)[0];
    }
    if (!steal && this.active.length >= this.globalMax) {
      const prio = rule.prio ?? 1;
      const victim = this.active.filter(v => v.prio < prio).sort((a, b) => a.prio - b.prio || a.start - b.start)[0];
      if (!victim) return { ok: false, reason: 'global' };
      steal = victim;
    }
    if (steal) this.active.splice(this.active.indexOf(steal), 1);
    this.active.push({ id, start: now, end: now + duration, handle, prio: rule.prio ?? 1 });
    this.lastStart.set(id, now);
    return { ok: true, steal: steal ? steal.handle : null };
  }

  release(handle) {
    const i = this.active.findIndex(v => v.handle === handle);
    if (i >= 0) this.active.splice(i, 1);
  }

  clear() { this.active.length = 0; this.lastStart.clear(); }
}

/**
 * Cross-fades the last `fade` seconds before loopEnd into the audio just before loopStart (the file
 * carries an identical pre-roll), so the wrap loopEnd → loopStart is continuous even after lossy
 * encoding. channels: Float32Array[] (AudioBuffer.getChannelData). Mutates in place.
 */
export function smoothLoopSeam(channels, sampleRate, loopStart, loopEnd, fade = 0.02) {
  const a = Math.round(loopStart * sampleRate), b = Math.round(loopEnd * sampleRate);
  const n = Math.min(Math.round(fade * sampleRate), a);
  if (n <= 0 || b <= a) return 0;
  for (const ch of channels) {
    if (b > ch.length) continue;
    for (let i = 0; i < n; i++) {
      const w = (i + 1) / n;
      ch[b - n + i] = ch[b - n + i] * (1 - w) + ch[a - n + i] * w;
    }
  }
  return n;
}

/** Finds the calibration burst: returns its measured centre time (s) searching [0, window). */
export function findMarker(samples, sampleRate, window = 0.16) {
  const end = Math.min(samples.length, Math.round(window * sampleRate));
  let best = 0, at = -1;
  for (let i = 0; i < end; i++) { const v = Math.abs(samples[i]); if (v > best) { best = v; at = i; } }
  return best > 0.2 ? at / sampleRate : null;
}

/** Absolute sprite position (s) of a variant, given the manifest entry and the measured marker. */
export function spriteOffset(sfxManifest, measuredCentre) {
  const nominal = sfxManifest.marker + (sfxManifest.markerLen ?? 0.012) / 2;
  const shift = measuredCentre == null || Math.abs(measuredCentre - nominal) > 0.1 ? 0 : measuredCentre - nominal;
  return sfxManifest.marker + shift;
}

export function loadSettings(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v = JSON.parse(raw);
    const clamp = x => Math.min(1, Math.max(0, Number(x)));
    return {
      muted: Boolean(v.muted),
      music: Number.isFinite(Number(v.music)) ? clamp(v.music) : DEFAULT_SETTINGS.music,
      sfx: Number.isFinite(Number(v.sfx)) ? clamp(v.sfx) : DEFAULT_SETTINGS.sfx,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage, settings) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode / blocked storage */ }
}

/** Sustained slow-motion detector: hit-stops and freeze frames (< holdSec) do not trigger it. */
export class SlowMo {
  constructor(holdSec = 0.15) { this.hold = holdSec; this.below = 0; this.value = 1; }
  update(realDt, timeScale) {
    const s = Number.isFinite(timeScale) ? timeScale : 1;
    this.below = s < 0.9 ? this.below + realDt : 0;
    const target = this.below >= this.hold ? Math.max(0.1, s) : 1;
    const k = 1 - Math.exp(-realDt / (target < this.value ? 0.06 : 0.25));
    this.value += (target - this.value) * k;
    return this.value;
  }
}

// ======================================================================== Web Audio runtime

export function createAudio({ baseUrl = '../assets/audio/march/', storage = globalThis.localStorage, fetchImpl = globalThis.fetch?.bind(globalThis),
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, doc = globalThis.document, rand = Math.random,
  slashWhoosh = false } = {}) {
  const settings = loadSettings(storage);
  const state = createEventState({ slashWhoosh });
  const limiter = new VoiceLimiter();
  const slowmo = new SlowMo();
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const listeners = new Set();
  let ctx = null, nodes = null, manifest = null, manifestPromise = null;
  let sprite = null, spriteBase = 0, spritePromise = null;
  const buffers = new Map(), pending = new Map();
  let current = null;          // { name, source, gain }
  let wanted = null, requestId = 0;
  let paused = false, unlocked = false, hero = null;
  let duckUntil = 0, duckRelease = 1.0, preloadTimer = 0;
  const variantIndex = new Map();
  const notify = () => { for (const fn of listeners) { try { fn(api.state()); } catch { /* listener errors stay local */ } } };

  function now() { return ctx ? ctx.currentTime : 0; }

  function build() {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    const music = ctx.createGain(), duck = ctx.createGain(), filter = ctx.createBiquadFilter(), sfx = ctx.createGain();
    filter.type = 'lowpass'; filter.frequency.value = 20000; filter.Q.value = 0.5;
    duck.connect(filter).connect(music).connect(master);
    sfx.connect(master);
    master.gain.value = settings.muted ? 0 : 1;
    music.gain.value = settings.music;
    sfx.gain.value = settings.sfx * SFX_TRIM;
    nodes = { master, comp, music, duck, filter, sfx, lastCutoff: 20000 };
  }

  function loadManifest() {
    if (!fetchImpl) return Promise.resolve(null);
    if (!manifestPromise) {
      manifestPromise = fetchImpl(base + 'manifest.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('audio manifest ' + r.status); return r.json(); })
        .then(m => (manifest = m))
        .catch(error => { console.warn('[audio] manifest unavailable', error); manifestPromise = null; return null; });
    }
    return manifestPromise;
  }

  function decode(arrayBuffer) {
    // Safari < 14.1 only has the callback form
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  }

  function loadSprite() {
    if (!spritePromise) {
      spritePromise = loadManifest().then(m => {
        if (!m?.sfx || !ctx) return null;
        return fetchImpl(base + m.sfx.file + (m.sfx.hash ? `?v=${m.sfx.hash}` : '')).then(r => { if (!r.ok) throw new Error('sfx ' + r.status); return r.arrayBuffer(); })
          .then(decode)
          .then(buffer => {
            sprite = buffer;
            spriteBase = spriteOffset(m.sfx, findMarker(buffer.getChannelData(0), buffer.sampleRate));
            return buffer;
          });
      }).catch(error => { console.warn('[audio] sfx unavailable', error); spritePromise = null; return null; });
    }
    return spritePromise;
  }

  function loadTrack(name) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (pending.has(name)) return pending.get(name);
    const p = loadManifest().then(m => {
      const entry = m?.music?.[name];
      if (!entry || !ctx) return null;
      return fetchImpl(base + entry.file + (entry.hash ? `?v=${entry.hash}` : '')).then(r => { if (!r.ok) throw new Error(name + ' ' + r.status); return r.arrayBuffer(); })
        .then(decode)
        .then(buffer => {
          if (entry.loop) {
            const channels = [];
            for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
            smoothLoopSeam(channels, buffer.sampleRate, entry.loopStart, entry.loopEnd);
          }
          buffers.set(name, buffer);
          return buffer;
        });
    }).catch(error => { console.warn('[audio] music unavailable', name, error); return null; })
      .finally(() => pending.delete(name));
    pending.set(name, p);
    return p;
  }

  /** Keep memory bounded: current, wanted, stings and one preloaded neighbour. */
  function trimBuffers(keep) {
    for (const name of [...buffers.keys()]) if (!keep.has(name) && !STINGS.has(name)) buffers.delete(name);
  }

  function startTrack(name, buffer, fadeIn) {
    const entry = manifest.music[name];
    const t = now();
    if (current) stopCurrent(STINGS.has(name) ? 0.35 : Math.max(0.4, fadeIn));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, t);
    if (fadeIn > 0) gain.gain.exponentialRampToValueAtTime(1, t + fadeIn);
    source.connect(gain).connect(nodes.duck);
    if (entry.loop) {
      source.loop = true;
      source.loopStart = entry.loopStart;
      source.loopEnd = entry.loopEnd;
      source.start(t, entry.loopStart);
    } else {
      source.start(t);
      source.onended = () => { if (current?.source === source) { current = null; notify(); } };
    }
    current = { name, source, gain };
    notify();
    // preload the next cue while this one plays
    clearTimeout(preloadTimer);
    const next = { market: 'plaza', plaza: 'boss', boss: 'victory' }[name];
    if (next) preloadTimer = setTimeout(() => { if (ctx && !settings.muted) loadTrack(next); if (next === 'victory') loadTrack('defeat'); }, 6000);
    trimBuffers(new Set([name, next].filter(Boolean)));
  }

  function stopCurrent(fade = 0.8) {
    if (!current || !ctx) { current = null; return; }
    const { source, gain } = current;
    const t = now();
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, fade));
      source.stop(t + Math.max(0.02, fade) + 0.05);
    } catch { /* already stopped */ }
    current = null;
  }

  function playMusic(name, { fadeIn = 1.2 } = {}) {
    if (!MUSIC_TRACKS.includes(name)) return;
    if (wanted === name && (current?.name === name || pending.has(name))) return;
    wanted = name;
    const id = ++requestId;
    if (!ctx || settings.muted) return;   // started later by unlock() / setMuted(false)
    if (current?.name === name) return;
    loadTrack(name).then(buffer => {
      if (!buffer || id !== requestId || wanted !== name || !ctx || settings.muted) return;
      startTrack(name, buffer, STINGS.has(name) ? 0 : fadeIn);
    });
  }

  function stopMusic(fade = 0.8) { wanted = null; requestId++; stopCurrent(fade); notify(); }

  function duck({ level = 1, attack = 0.2, hold = 0, release = 1.5 }) {
    if (!ctx) return;
    const g = nodes.duck.gain, t = now();
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(level, t, Math.max(0.01, attack / 3));
    duckUntil = hold > 0 ? t + attack + hold : 0;
    duckRelease = release;
  }

  function variantFor(id, count, forced) {
    if (forced !== undefined) return Math.min(count - 1, forced);
    // round-robin with a random start: consecutive plays never repeat the same variant
    const i = ((variantIndex.get(id) ?? Math.floor(rand() * count)) + 1) % count;
    variantIndex.set(id, i);
    return i;
  }

  function playCue(c, spatial, event) {
    const entries = manifest?.sfx?.sounds?.[c.id];
    if (!entries || !sprite || !ctx || settings.muted || paused) return false;
    const rule = SOUNDS[c.id] || {};
    const [start, dur] = entries[variantFor(c.id, entries.length, c.variant)];
    const slow = slowmo.value;
    const rate = c.rate * semis((rand() * 2 - 1) * (rule.pitch || 0)) * (slow < 0.95 ? 0.72 + 0.28 * slow : 1);
    const length = dur / rate;
    const when = now() + (c.delay || 0);
    const handle = {};
    const res = limiter.request(c.id, when, length, handle);
    if (!res.ok) return false;
    if (res.steal?.stop) res.steal.stop();
    let gain = (rule.gain ?? 1) * c.gain * Math.pow(10, ((rand() * 2 - 1) * (rule.vol || 0)) / 20);
    let pan = 0;
    if (spatial && hero && Number.isFinite(event.x) && Number.isFinite(hero.x)) {
      const dx = event.x - hero.x, dy = (event.y ?? hero.y) - (hero.y ?? 0);
      pan = Math.max(-0.7, Math.min(0.7, dx / 520));
      gain *= Math.max(0.45, Math.min(1, 1.15 - Math.hypot(dx, dy) / 900));
    }
    const source = ctx.createBufferSource();
    source.buffer = sprite;
    source.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    source.connect(g);
    tail.connect(nodes.sfx);
    source.start(when, spriteBase + start, dur);
    handle.stop = () => { try { const t = now(); g.gain.setTargetAtTime(0, t, 0.015); source.stop(t + 0.08); } catch { /* ended */ } };
    source.onended = () => { limiter.release(handle); try { source.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); } catch { /* ignore */ } };
    return true;
  }

  function resumeIfAllowed() {
    if (!ctx || settings.muted || (doc && doc.hidden)) return;
    if (ctx.state !== 'running') { const p = ctx.resume(); if (p?.catch) p.catch(() => {}); }
  }

  function onVisibility() {
    if (!ctx) return;
    if (doc.hidden) { const p = ctx.suspend(); if (p?.catch) p.catch(() => {}); } else resumeIfAllowed();
  }

  // iOS can leave the context 'interrupted' (calls, Siri, lock screen); any later gesture revives it
  function onGesture() { if (unlocked && ctx && ctx.state !== 'running') resumeIfAllowed(); }

  const api = {
    /** Call synchronously inside the Start button's click / touchend handler. */
    unlock() {
      if (!AudioContextClass) return Promise.resolve(false);
      if (!ctx) {
        try { ctx = new AudioContextClass({ latencyHint: 'interactive' }); } catch { try { ctx = new AudioContextClass(); } catch { return Promise.resolve(false); } }
        build();
        if (doc) {
          doc.addEventListener('visibilitychange', onVisibility);
          for (const type of ['pointerdown', 'touchend', 'keydown']) doc.addEventListener(type, onGesture, { passive: true });
        }
      }
      unlocked = true;
      if (!settings.muted) {
        resumeIfAllowed();
        // a silent one-sample buffer played inside the gesture fully unlocks older iOS Safari
        try { const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch { /* ignore */ }
      }
      const ready = loadSprite();
      if (wanted && !settings.muted) { const w = wanted; wanted = null; playMusic(w, { fadeIn: 1.5 }); }
      notify();
      return ready.then(Boolean);
    },
    playMusic,
    stopMusic,
    preload(name) { if (ctx) loadTrack(name); },
    onEvent(event) {
      if (!event || !event.type) return;
      state.now = now();
      const res = mapEvent(event, state, rand);
      if (res.music?.play) {
        if (STINGS.has(res.music.play) && (current?.name === res.music.play || wanted === res.music.play)) { /* already playing */ } else playMusic(res.music.play);
      }
      if (res.duck) duck(res.duck);
      for (const c of res.cues) playCue(c, res.spatial, event);
    },
    /** One-shot by id, e.g. api.play('ui_click'). */
    play(id, opts = {}) { return playCue(cue(id, opts), false, {}); },
    ui() { return playCue(cue('ui_click'), false, {}); },
    /** realDt: real seconds; timeScale: game dt / realDt (0 during freezes); listener: {x, y} in Arena px. */
    update(realDt, timeScale = 1, listener = null) {
      if (listener) hero = listener;
      if (!ctx || !nodes) return;
      const s = slowmo.update(Math.max(0, realDt || 0), timeScale);
      const t = now();
      if (duckUntil && t >= duckUntil) {
        duckUntil = 0;
        nodes.duck.gain.cancelScheduledValues(t);
        nodes.duck.gain.setValueAtTime(nodes.duck.gain.value, t);
        nodes.duck.gain.setTargetAtTime(1, t, duckRelease / 3);
      }
      const norm = Math.min(1, Math.max(0, (s - 0.15) / 0.85));
      const cutoff = paused ? 1200 : 700 * Math.pow(20000 / 700, norm);
      if (Math.abs(cutoff - nodes.lastCutoff) / nodes.lastCutoff > 0.02) {
        nodes.lastCutoff = cutoff;
        nodes.filter.frequency.setTargetAtTime(cutoff, t, 0.04);
      }
    },
    setPaused(value) {
      paused = Boolean(value);
      if (!ctx || !nodes) return;
      const t = now();
      nodes.sfx.gain.setTargetAtTime(paused ? 0 : settings.sfx * SFX_TRIM, t, 0.03);
      nodes.filter.frequency.setTargetAtTime(paused ? 1200 : 20000, t, 0.08);
      nodes.lastCutoff = paused ? 1200 : 20000;
      nodes.duck.gain.setTargetAtTime(paused ? 0.5 : 1, t, 0.1);
    },
    setMuted(value) {
      settings.muted = Boolean(value);
      saveSettings(storage, settings);
      if (ctx && nodes) {
        const t = now();
        nodes.master.gain.cancelScheduledValues(t);
        nodes.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.03);
        if (settings.muted) {
          const w = wanted;
          stopCurrent(0.1);
          wanted = w;
          limiter.clear();
          setTimeout(() => { if (settings.muted && ctx) ctx.suspend().catch?.(() => {}); }, 200);
        } else {
          resumeIfAllowed();
          loadSprite();
          if (wanted) { const w = wanted; wanted = null; playMusic(w, { fadeIn: 1.0 }); }
        }
      }
      notify();
    },
    toggleMuted() { api.setMuted(!settings.muted); return settings.muted; },
    setVolume({ music, sfx } = {}) {
      if (Number.isFinite(music)) settings.music = Math.min(1, Math.max(0, music));
      if (Number.isFinite(sfx)) settings.sfx = Math.min(1, Math.max(0, sfx));
      saveSettings(storage, settings);
      if (ctx && nodes) {
        const t = now();
        nodes.music.gain.setTargetAtTime(settings.music, t, 0.05);
        if (!paused) nodes.sfx.gain.setTargetAtTime(settings.sfx * SFX_TRIM, t, 0.05);
      }
      notify();
    },
    /** Reset per-run state (enemy roles, voices) — call from battle start(). */
    reset() { state.roles.clear(); state.lastPickupAt = -Infinity; limiter.clear(); slowmo.value = 1; slowmo.below = 0; if (nodes && ctx) { const t = now(); nodes.duck.gain.cancelScheduledValues(t); nodes.duck.gain.setTargetAtTime(1, t, 0.1); } duckUntil = 0; },
    /** Output level after the master bus (dBFS RMS / peak over ~46 ms) — for the preview page and checks. */
    meter() {
      if (!ctx || !nodes) return null;
      if (!nodes.analyser) {
        nodes.analyser = ctx.createAnalyser();
        nodes.analyser.fftSize = 2048;
        nodes.comp.connect(nodes.analyser);
        nodes.meterBuf = new Float32Array(nodes.analyser.fftSize);
      }
      nodes.analyser.getFloatTimeDomainData(nodes.meterBuf);
      let sum = 0, peak = 0;
      for (const v of nodes.meterBuf) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
      return { rms: 10 * Math.log10(sum / nodes.meterBuf.length + 1e-12), peak: 20 * Math.log10(peak + 1e-12) };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    state() {
      return { muted: settings.muted, music: settings.music, sfx: settings.sfx, unlocked, contextState: ctx?.state ?? 'none',
        track: current?.name ?? null, wanted, sfxReady: Boolean(sprite), voices: limiter.active.length };
    },
    get context() { return ctx; },
    dispose() {
      clearTimeout(preloadTimer);
      if (doc) {
        doc.removeEventListener('visibilitychange', onVisibility);
        for (const type of ['pointerdown', 'touchend', 'keydown']) doc.removeEventListener(type, onGesture);
      }
      stopCurrent(0.05);
      if (ctx) ctx.close().catch?.(() => {});
      ctx = null; nodes = null; sprite = null; buffers.clear();
    },
  };
  loadManifest();   // JSON only; no AudioContext before the gesture
  return api;
}
