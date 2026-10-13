// Realm Forge sound: every effect is synthesised with Web Audio (no sample files,
// so there is nothing to license). Policy lives in audio-mixer.mjs, the world
// diffing in audio-events.mjs; this file only knows how to make noise.
import { createMixer } from './audio-mixer.mjs?v=20261009l';
import { unitClass } from './audio-events.mjs?v=20261009l';

export const AUDIO_STORAGE = 'realm-forge-audio-v1';
export const DEFAULT_SETTINGS = { volume: .7, muted: false, ambient: true };
const TAU = Math.PI * 2, MIN = .0001;

export function makeNoise(ctx, seconds = 1.5) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let s = 22695477; for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  return buf;
}

// ---- small building blocks ------------------------------------------------
function envelope(R, t, a, peak, d, dest = R.out) {
  const g = R.ctx.createGain(); g.gain.setValueAtTime(MIN, t);
  g.gain.linearRampToValueAtTime(Math.max(MIN * 2, peak), t + a); g.gain.exponentialRampToValueAtTime(MIN, t + a + d);
  g.connect(dest); return g;
}
function tone(R, type, f0, f1, t, a, peak, d, dest) {
  const o = R.ctx.createOscillator(), g = envelope(R, t, a, peak, d, dest); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  o.connect(g); o.start(t); o.stop(t + a + d + .05); return o;
}
function hiss(R, t, a, peak, d, filter, f0, f1, q = 1, dest) {
  const src = R.ctx.createBufferSource(), f = R.ctx.createBiquadFilter(), g = envelope(R, t, a, peak, d, dest);
  src.buffer = R.noise; f.type = filter; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  src.connect(f); f.connect(g); src.start(t, (t * 7.3) % 1); src.stop(t + a + d + .05);
}
const note = (R, f, t, peak, d, type = 'sine', partial = 2.76) => {
  tone(R, type, f, f, t, .006, peak, d); tone(R, 'sine', f * partial, f * partial, t, .004, peak * .3, d * .5);
};

// ---- voices (formant synthesis, short "ack" phrases) -------------------------
const VOWELS = { ah: [800, 1200], oh: [500, 900], eh: [550, 1800], ee: [300, 2300], oo: [320, 800], ay: [450, 2000] };
const PHRASES = {
  villager: { f: 205, select: [['eh', 'oh'], ['oh'], ['ee', 'eh']], command: [['eh', 'ah'], ['oh', 'eh'], ['ee', 'oh']] },
  infantry: { f: 112, select: [['ah'], ['oh'], ['ay']], command: [['oh', 'ah'], ['ay', 'oh'], ['ah', 'ah']] },
  archer: { f: 150, select: [['ee', 'ah'], ['eh'], ['ay']], command: [['ee', 'oh'], ['ay', 'ah'], ['eh', 'oh']] },
  monk: { f: 135, select: [['oo', 'oh'], ['oh', 'ah'], ['oo', 'ah']], command: [['oh', 'oo', 'ah'], ['oo', 'ah'], ['oh', 'ah']], slow: true },
  hero: { f: 98, select: [['ah', 'oh'], ['oh'], ['ay', 'ah']], command: [['ah', 'oh'], ['oh', 'ah'], ['ay', 'oh']] },
};
function speak(R, t, o) {
  const spec = PHRASES[o.unitClass] || PHRASES.infantry, set = spec[o.kind === 'command' ? 'command' : 'select'], seq = set[o.variant % set.length];
  const base = spec.f * (o.pitch || 1) * [.94, 1, 1.07][o.variant % 3], len = spec.slow ? .24 : .15;
  seq.forEach((v, i) => {
    const s = t + i * (len * .92), [f1, f2] = VOWELS[v], src = R.ctx.createOscillator(), g = envelope(R, s, spec.slow ? .05 : .015, 2.8, len, R.out);
    src.type = 'sawtooth'; src.frequency.setValueAtTime(base * (i ? .9 : 1.08), s); src.frequency.exponentialRampToValueAtTime(base * (i === seq.length - 1 ? .84 : 1), s + len);
    if (spec.slow) { const lfo = R.ctx.createOscillator(), depth = R.ctx.createGain(); lfo.frequency.value = 5.5; depth.gain.value = base * .012; lfo.connect(depth); depth.connect(src.frequency); lfo.start(s); lfo.stop(s + len + .1); }
    for (const [f, q, w] of [[f1, 7, .5], [f2, 9, .28]]) { const bp = R.ctx.createBiquadFilter(), mix = R.ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; mix.gain.value = w; src.connect(bp); bp.connect(mix); mix.connect(g); }
    src.start(s); src.stop(s + len + .08);
    if (!spec.slow) hiss(R, s, .004, .1, .05, 'bandpass', 2200, 2200, 1.2);
  });
}
function neigh(R, t, o) {
  const k = o.kind === 'command' ? .75 : 1, p = (o.pitch || 1) * [.92, 1, 1.1][o.variant % 3], src = R.ctx.createOscillator(), g = envelope(R, t, .03, .5, .42 * k);
  src.type = 'sawtooth'; src.frequency.setValueAtTime(380 * p, t); src.frequency.exponentialRampToValueAtTime(760 * p, t + .12);
  src.frequency.exponentialRampToValueAtTime(330 * p, t + .45 * k);
  const lfo = R.ctx.createOscillator(), depth = R.ctx.createGain(); lfo.frequency.value = 24; depth.gain.value = 26; lfo.connect(depth); depth.connect(src.frequency);
  for (const f of [1100, 2500]) { const bp = R.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4; src.connect(bp); bp.connect(g); }
  src.start(t); src.stop(t + .6); lfo.start(t); lfo.stop(t + .6);
  hiss(R, t, .01, .12, .14, 'bandpass', 1500, 900, 1.5);
}
function creak(R, t, o) {
  const p = o.pitch || 1; tone(R, 'sawtooth', 62 * p, 98 * p, t, .02, .22, .28); hiss(R, t, .02, .18, .26, 'bandpass', 380, 640, 3); tone(R, 'square', 150 * p, 90 * p, t + .02, .01, .05, .12);
}
function horn(R, t, f, len, peak, dest) {
  const lp = R.ctx.createBiquadFilter(), g = envelope(R, t, Math.min(.12, len * .3), peak, len, dest); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(f * 2, t); lp.frequency.linearRampToValueAtTime(f * 5, t + len * .5); lp.connect(g);
  for (const d of [-4, 4]) { const o = R.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; o.connect(lp); o.start(t); o.stop(t + len + .2); }
}

// ---- effects ---------------------------------------------------------------
export const RECIPES = {
  voice(R, t, o) {
    const u = o.unitClass;
    if (u === 'cavalry') neigh(R, t, o); else if (u === 'siege') creak(R, t, o); else speak(R, t, o);
  },
  chop(R, t, o) { const p = o.pitch; tone(R, 'sine', 170 * p, 70 * p, t, .002, .5, .09); hiss(R, t, .001, .35, .06, 'bandpass', 1300 * p, 800, 1.4); hiss(R, t + .01, .002, .1, .12, 'highpass', 3500, 3500); },
  mine(R, t, o) { const p = o.pitch; tone(R, 'triangle', 2300 * p, 2250 * p, t, .001, .18, .13); tone(R, 'sine', 3470 * p, 3400 * p, t, .001, .1, .09); hiss(R, t, .001, .3, .05, 'highpass', 2200, 2200); tone(R, 'sine', 120 * p, 70, t, .002, .3, .08); },
  hammer(R, t, o) { const p = o.pitch; tone(R, 'triangle', 760 * p, 520 * p, t, .001, .35, .07); hiss(R, t, .001, .3, .03, 'bandpass', 2600, 2600, 1); tone(R, 'sine', 140, 80, t, .002, .25, .06); },
  farm(R, t, o) { hiss(R, t, .06, .9, .2, 'bandpass', 500 * o.pitch, 2200, 0.8); },
  sword(R, t, o) { const p = o.pitch; hiss(R, t, .001, .38, .1, 'highpass', 2800, 2800); tone(R, 'triangle', 1850 * p, 1800 * p, t, .001, .14, .18); tone(R, 'sine', 2750 * p, 2700 * p, t, .001, .08, .14); tone(R, 'sine', 160, 90, t, .002, .25, .07); },
  death(R, t, o) {
    const p = o.pitch, horse = o.unit === 'cavalry';
    if (horse) neigh(R, t, { kind: 'command', variant: 0, pitch: p });
    else { const src = R.ctx.createOscillator(), g = envelope(R, t, .01, .4, .3); src.type = 'sawtooth'; src.frequency.setValueAtTime(280 * p, t); src.frequency.exponentialRampToValueAtTime(110 * p, t + .3); for (const f of [750, 1250]) { const bp = R.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; src.connect(bp); bp.connect(g); } src.start(t); src.stop(t + .4); }
    tone(R, 'sine', 120, 45, t + .22, .004, .4, .2); hiss(R, t + .22, .003, .12, .1, 'lowpass', 600, 300);
  },
  'arrow-shoot'(R, t, o) { hiss(R, t, .01, .7, .12, 'bandpass', 1400 * o.pitch, 4200, 2.5); tone(R, 'triangle', 190, 140, t, .002, .12, .05); },
  'arrow-hit'(R, t, o) { tone(R, 'sine', 200 * o.pitch, 80, t, .002, .4, .09); hiss(R, t, .001, .2, .05, 'bandpass', 1800, 1800, 1); },
  'rock-shoot'(R, t, o) { const p = o.pitch; tone(R, 'sawtooth', 95 * p, 45, t, .005, .3, .3); hiss(R, t + .02, .05, .3, .3, 'bandpass', 500, 2200, 1.2); tone(R, 'square', 220, 140, t, .002, .08, .06); },
  'rock-land'(R, t, o) { tone(R, 'sine', 85 * o.pitch, 30, t, .004, .8, .5); hiss(R, t, .003, .5, .35, 'lowpass', 900, 150, 0.8); hiss(R, t + .08, .01, .12, .25, 'bandpass', 1500, 600, 1); },
  heal(R, t) { tone(R, 'sine', 700, 1500, t, .02, .22, .35); tone(R, 'sine', 1050, 2250, t + .05, .02, .1, .3); },
  'building-complete'(R, t) { note(R, 523.25, t, .35, .55, 'triangle'); note(R, 783.99, t + .13, .35, .7, 'triangle'); },
  'building-collapse'(R, t) { hiss(R, t, .02, .55, 1.0, 'lowpass', 900, 90, 0.7); tone(R, 'sine', 70, 28, t, .01, .7, .9); for (let i = 0; i < 4; i++) hiss(R, t + .1 + i * .13, .002, .15, .08, 'bandpass', 700 + i * 400, 500, 2); },
  trained(R, t) { note(R, 880, t, .4, .55, 'sine'); },
  tech(R, t) { [523.25, 659.25, 783.99].forEach((f, i) => note(R, f, t + i * .12, .3, .6, 'sine')); },
  'age-up'(R, t) {
    [[196, 0, .5], [261.63, .45, .5], [329.63, .9, .5], [392, 1.35, 1.0]].forEach(([f, at, len]) => horn(R, t + at, f, len, .34));
    horn(R, t + 1.35, 261.63, 1.0, .2);
  },
  alert(R, t) { horn(R, t, 164.81, .42, .45); horn(R, t + .5, 164.81, .42, .45); horn(R, t + .5, 246.94, .42, .2); },
};

// Renders one recipe into an (offline) context; shared by the live player and the self-test.
export function renderRecipe(ctx, noise, dest, name, t, opts = {}) {
  const R = { ctx, noise, out: dest };
  RECIPES[name](R, t, { pitch: 1, variant: 0, kind: 'select', unitClass: 'infantry', ...opts });
}

// ---- engine ------------------------------------------------------------------
const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
export function loadSettings(storage) {
  try { const saved = JSON.parse(storage?.getItem(AUDIO_STORAGE) || 'null'); if (saved) return { volume: clamp01(saved.volume ?? DEFAULT_SETTINGS.volume), muted: Boolean(saved.muted), ambient: saved.ambient !== false }; } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function createAudio({ storage = null, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, now = () => performance.now() / 1000 } = {}) {
  const settings = loadSettings(storage);
  let ctx = null, master = null, noise = null, ambientGain = null, birdTimer = 3;
  const save = () => { try { storage?.setItem(AUDIO_STORAGE, JSON.stringify(settings)); } catch {} };
  const level = () => (settings.muted ? 0 : settings.volume ** 2);
  const applyLevel = () => { if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, .02); };
  const ready = () => Boolean(ctx && ctx.state === 'running' && level() > 0);

  function start(name, o) {
    const t = ctx.currentTime + (o.delay || 0) + .005, g = ctx.createGain(); g.gain.value = o.gain ?? 1;
    let tail = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan || 0; g.connect(p); tail = p; }
    tail.connect(master);
    renderRecipe(ctx, noise, g, name, t, o);
    return { stop() { try { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime, .015); } catch {} } };
  }
  const mixer = createMixer({ play: (name, o) => (ready() ? start(name, o) : null), now });

  function build() {
    ctx = new AudioContextClass(); noise = makeNoise(ctx);
    const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 10; limiter.attack.value = .003; limiter.release.value = .2;
    master = ctx.createGain(); master.gain.value = level(); master.connect(limiter); limiter.connect(ctx.destination);
    ambientGain = ctx.createGain(); ambientGain.gain.value = 0; ambientGain.connect(master);
    const wind = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), depth = ctx.createGain(), bed = ctx.createGain();
    wind.buffer = noise; wind.loop = true; bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = .7; bed.gain.value = .07;
    lfo.frequency.value = .07; depth.gain.value = .035; lfo.connect(depth); depth.connect(bed.gain);
    wind.connect(bp); bp.connect(bed); bed.connect(ambientGain); wind.start(); lfo.start();
  }
  function chirp() {
    const t = ctx.currentTime + .02, pan = (Math.random() - .5) * 1.4, base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 3);
    const g = ctx.createGain(); g.gain.value = .06; let tail = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; } tail.connect(ambientGain);
    const R = { ctx, noise, out: g };
    for (let i = 0; i < n; i++) tone(R, 'sine', base, base * (1.25 + Math.random() * .4), t + i * .11, .01, .5, .07);
  }

  return {
    settings, mixer,
    // Must run inside a user gesture (pointerdown/keydown); safe to call repeatedly.
    unlock() { try { if (!ctx && AudioContextClass) build(); if (ctx && ctx.state !== 'running') ctx.resume?.(); } catch { /* audio is optional */ } },
    get unlocked() { return Boolean(ctx); },
    setVolume(v) { settings.volume = clamp01(v); save(); applyLevel(); },
    setMuted(m) { settings.muted = Boolean(m); save(); applyLevel(); },
    toggleMuted() { this.setMuted(!settings.muted); return settings.muted; },
    setAmbient(on) { settings.ambient = Boolean(on); save(); },
    handle(events, listener) { if (!ready() || !events.length) return; for (const ev of events) mixer.event(ev, listener); },
    voice(entity, kind = 'select') { if (!ready() || !entity?.blueprint) return false; return mixer.voice(unitClass(entity.blueprint), kind, entity.id); },
    // Ambient bed + birds only while a match is actually running.
    tick(dt, playing) {
      if (!ctx) return;
      const on = settings.ambient && playing && ready();
      ambientGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .6);
      if (!on) return;
      birdTimer -= dt; if (birdTimer <= 0) { birdTimer = 3 + Math.random() * 7; chirp(); }
    },
    suspend() { ctx?.suspend?.(); }, resume() { if (ctx) ctx.resume?.(); },
    reset() { mixer.reset(); },
  };
}
