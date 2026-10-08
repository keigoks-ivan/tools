import test from 'node:test';
import assert from 'node:assert/strict';
import { createRacingAudio, racingAudioFrame, racingSoundProfile } from './audio.mjs';

class Parameter {
  constructor(value = 0) { this.value = value; this.events = []; }
  setTargetAtTime(value, time, rate) { assert.ok(Number.isFinite(value)); this.value = value; this.events.push({ value, time, rate }); }
  setValueAtTime(value, time) { this.value = value; this.events.push({ value, time }); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ value, time }); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ value, time }); }
  cancelScheduledValues() { this.events = []; }
}
class Node {
  constructor(kind) {
    this.kind = kind; this.connections = []; this.disconnected = false; this.started = false; this.stopped = false;
    for (const key of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[key] = new Parameter();
  }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; this.connections = []; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  setPeriodicWave(wave) { this.wave = wave; }
}
class Context {
  constructor() { this.sampleRate = 16000; this.currentTime = 0; this.state = 'suspended'; this.nodes = []; this.destination = new Node('destination'); this.resumes = 0; this.suspends = 0; this.closes = 0; }
  make(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain() { return this.make('gain'); }
  createBiquadFilter() { return this.make('filter'); }
  createOscillator() { return this.make('oscillator'); }
  createBufferSource() { return this.make('buffer'); }
  createDynamicsCompressor() { return this.make('compressor'); }
  createMediaElementSource() { return this.make('media'); }
  createPeriodicWave(real, imaginary) { return { real, imaginary }; }
  createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspends++; this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
}
class Music {
  constructor() { this.paused = true; this.src = ''; this.plays = 0; this.pauses = 0; this.listeners = new Map(); }
  setAttribute() {}
  removeAttribute() { this.src = ''; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  removeEventListener(name) { this.listeners.delete(name); }
  play() { this.plays++; this.paused = false; return this.failure ? Promise.reject(this.failure) : Promise.resolve(); }
  pause() { this.paused = true; this.pauses++; }
  load() {}
}
const frame = overrides => ({ rpm: 4000, speed: 25, throttle: .6, gear: 2, slip: 0, collision: 0, ...overrides });
const car = { id: 'test-car', cylinders: 8, engineType: 'v8', induction: 'naturally aspirated', idle: 900, redline: 8500 };
const fixture = () => {
  const context = new Context(), music = new Music(), document = { hidden: false };
  const audio = createRacingAudio({ context, musicElement: music, document });
  const gains = context.nodes.filter(node => node.kind === 'gain');
  return { context, music, document, audio, effects: gains[1], musicGain: gains[2] };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('explicit manufacturer engine layout takes precedence over name heuristics', () => {
  const profile = racingSoundProfile({ name: 'Porsche example', cylinders: 12, engineType: 'v12', induction: 'naturally aspirated' });
  assert.equal(profile.firing, 6); assert.equal(profile.flat, false); assert.equal(profile.turbo, false);
  assert.equal(racingSoundProfile({ cylinders: 6, engineType: 'inline6', induction: 'twin turbo' }).turbo, true);
  assert.equal(racingSoundProfile({ cylinders: 6, engineType: 'flat6' }).flat, true);
});

test('sound control values stay finite and bounded for bad or reset simulation data', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, -1000, 1e10]) {
    const result = racingAudioFrame({ rpm: value, speed: value, throttle: value, brake: value, slip: value, collision: value }, car);
    for (const [key, number] of Object.entries(result)) if (key !== 'profile') assert.ok(Number.isFinite(number), key);
    assert.ok(result.firingHz >= 25 && result.firingHz <= 1000);
    assert.ok(result.tyreGain >= 0 && result.tyreGain <= .24);
  }
});

test('engine pitch follows RPM, grip loss produces tyre sound and high speed produces wind', () => {
  const idle = racingAudioFrame(frame({ rpm: 1000, speed: 0, throttle: 0 }), car);
  const fast = racingAudioFrame(frame({ rpm: 6000, speed: 70, throttle: 1, slip: .8 }), car);
  assert.equal(fast.firingHz, idle.firingHz * 6);
  assert.ok(fast.engineGain > idle.engineGain && fast.tyreGain > .1 && fast.windGain > .08);
  assert.equal(idle.tyreGain, 0); assert.equal(idle.windGain, 0);
  assert.ok(racingAudioFrame(frame({ offTrack: true }), car).roadGain > racingAudioFrame(frame(), car).roadGain * 4);
});

test('reverse pedal loads the engine and independent handbrake slip changes tyre sound', () => {
  const coasting = racingAudioFrame(frame({ throttle: 0, brake: 1 }), car);
  const reverse = racingAudioFrame(frame({ throttle: 0, brake: 1, reverse: true }), car);
  assert.ok(reverse.engineGain > coasting.engineGain && reverse.intakeGain > coasting.intakeGain);
  const sliding = frame({ throttle: 0, slip: .8, handbrake: 1 });
  assert.ok(racingAudioFrame(sliding, car).tyreGain > racingAudioFrame({ ...sliding, handbrake: 0 }, car).tyreGain);
  assert.equal(racingAudioFrame({ ...sliding, speed: 0 }, car).tyreGain, 0);
});

test('gesture unlock requests media playback before waiting for AudioContext resume', async () => {
  const f = fixture(); let resume;
  f.context.resume = () => new Promise(resolve => { resume = resolve; });
  const pending = f.audio.unlock();
  assert.equal(f.music.plays, 1);
  f.context.state = 'running'; resume(); assert.equal(await pending, true);
  f.audio.dispose();
});

test('menu, mute and background are silent and preserve independent mix preferences', async () => {
  const f = fixture(); await f.audio.unlock(); await flush();
  f.audio.setMix({ effectsVolume: .8, musicVolume: .3 });
  f.audio.update({ state: frame(), vehicle: car, driving: true }); await flush();
  assert.equal(f.music.paused, false); assert.ok(f.effects.gain.value > f.musicGain.gain.value);
  f.audio.update({ state: frame(), vehicle: car, driving: false });
  assert.equal(f.music.paused, true); assert.equal(f.effects.gain.value, 0); assert.equal(f.musicGain.gain.value, 0);
  f.audio.update({ state: frame(), vehicle: car, driving: true });
  f.audio.setMix({ enabled: false }); assert.equal(f.music.paused, true); assert.equal(f.effects.gain.value, 0);
  f.audio.setMix({ enabled: true }); f.document.hidden = true;
  f.audio.update({ state: frame(), vehicle: car, driving: true });
  assert.equal(f.music.paused, true); assert.equal(f.musicGain.gain.value, 0);
  assert.deepEqual(f.audio.mix, { enabled: true, musicVolume: .3, effectsVolume: .8 });
  f.audio.dispose();
});

test('music can be disabled while effects run and effects can be disabled while music runs', async () => {
  const f = fixture(); await f.audio.unlock(); await flush();
  f.audio.setMix({ musicVolume: 0, effectsVolume: 1 }); f.audio.update({ state: frame(), vehicle: car, driving: true });
  assert.equal(f.music.paused, true); assert.equal(f.musicGain.gain.value, 0); assert.equal(f.effects.gain.value, .8);
  f.audio.setMix({ musicVolume: .7, effectsVolume: 0 }); await flush();
  assert.equal(f.music.paused, false); assert.equal(f.effects.gain.value, 0); assert.ok(f.musicGain.gain.value > .5);
  f.audio.dispose();
});

test('steady frames allocate no new nodes; impacts and shifts have bounded polyphony', async () => {
  const f = fixture(); await f.audio.unlock(); f.audio.update({ state: frame(), vehicle: car, driving: true });
  const steadyCount = f.context.nodes.length;
  for (let i = 0; i < 240; i++) { f.context.currentTime += 1 / 60; f.audio.update({ state: frame(), vehicle: car, driving: true }); }
  assert.equal(f.context.nodes.length, steadyCount);
  for (let i = 0; i < 40; i++) {
    f.context.currentTime += .2;
    f.audio.update({ state: frame({ gear: 1 + i % 2, collision: i % 2 }), vehicle: car, driving: true });
  }
  assert.ok(f.context.nodes.length <= steadyCount + 8 * 5, 'at most eight transient voices');
  const before = f.context.nodes.length;
  f.audio.update({ state: frame({ gear: 6 }), vehicle: { ...car, id: 'second-car' }, driving: true });
  assert.equal(f.context.nodes.length, before, 'switching car does not cause a false gear-change sound');
  f.audio.dispose();
});

test('failed media autoplay does not retry every frame and a new gesture can retry', async () => {
  const f = fixture(); f.music.failure = Object.assign(new Error('gesture required'), { name: 'NotAllowedError' });
  await f.audio.unlock(); await flush(); assert.equal(f.audio.musicStatus, 'blocked');
  for (let i = 0; i < 20; i++) f.audio.update({ state: frame(), vehicle: car, driving: true });
  assert.equal(f.music.plays, 1);
  f.music.failure = null; f.music.paused = true; await f.audio.unlock(); await flush();
  assert.equal(f.music.plays, 2); assert.equal(f.audio.musicStatus, 'playing');
  f.audio.dispose();
});

test('suspend silences immediately; dispose stops sources and releases every node only once', async () => {
  const f = fixture(); await f.audio.unlock(); f.audio.update({ state: frame(), vehicle: car, driving: true });
  await f.audio.suspend(); assert.equal(f.context.state, 'suspended'); assert.equal(f.music.paused, true);
  assert.equal(f.effects.gain.value, 0); assert.equal(f.musicGain.gain.value, 0);
  f.audio.dispose(); f.audio.dispose();
  assert.ok(f.context.nodes.every(node => node.disconnected));
  assert.ok(f.context.nodes.filter(node => node.started).every(node => node.stopped));
  assert.equal(f.music.listeners.size, 0); assert.equal(f.context.closes, 0, 'an injected context belongs to its caller');
  const nodes = f.context.nodes.length;
  f.audio.update({ state: frame(), vehicle: car, driving: true }); assert.equal(f.context.nodes.length, nodes);
});
