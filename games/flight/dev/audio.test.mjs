import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightAudio, flightAudioFrame, createAudioEventTracker } from '../audio.js';

// Native Chrome OfflineAudioContext verification (2026-10-05): dev/audio-preview.html rendered
// nine stereo sound fields at 44,100 Hz for 3 s without creating live audio or playing speakers.
// Largest peak: 0.3789516985 (light exterior); jet cockpit/exterior takeoff RMS: −26.6872/−20.2448 dBFS;
// light cockpit/exterior RMS: −22.6570/−18.2679 dBFS. All samples were finite, paused peak was
// exactly 0, and a pause at 1 s had tail peak 0 after 2 s. The helper checks these invariants again;
// these reference loudness figures document that run rather than locking DSP to one browser build.

const state = id => ({ aircraft: id, engine: 0.65, fuel: 80, elapsed: 0, onGround: false, gearPosition: 1, flapPosition: 0, touchdown: null });
const data = { indicatedAirspeed: 100, groundSpeed: 0, agl: 300, roll: 0 };
const options = { active: true, paused: false, view: 0 };

test('audio is opt-in and never constructs a live AudioContext during creation, update or disable', async () => {
  const original = globalThis.AudioContext;
  let contexts = 0;
  globalThis.AudioContext = class { constructor() { contexts++; throw new Error('gesture-only constructor'); } };
  try {
    const audio = createFlightAudio();
    audio.update(state('jet'), data, options);
    assert.equal(audio.enabled, false); assert.equal(contexts, 0);
    await audio.setEnabled(false); assert.equal(contexts, 0);
    await assert.rejects(audio.setEnabled(true), /gesture-only constructor/);
    assert.equal(contexts, 1); assert.equal(audio.enabled, false);
    audio.dispose(); audio.dispose();
    assert.equal(await audio.setEnabled(true), false);
  } finally { if (original === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = original; }
});

test('engine signatures derive jet fan rotation and two-blade, four-cylinder piston firing from telemetry', () => {
  const jet = flightAudioFrame(state('jet'), { ...data, engineN1: 72 }, options);
  const light = flightAudioFrame(state('light'), { ...data, engineRpm: 2400 }, options);
  assert.equal(jet.id, 'jet'); assert.equal(light.id, 'light');
  assert.ok(jet.fanHz > 350 && jet.fanHz < 450);
  assert.equal(light.firingHz, 80); assert.equal(light.propHz, 80);
  assert.ok(flightAudioFrame({ ...state('jet'), engine: 1 }, { ...data, engineN1: 100 }, options).fanHz > jet.fanHz);
  const stopped = flightAudioFrame({ ...state('light'), fuel: 0 }, data, options);
  assert.equal(stopped.running, false); assert.equal(stopped.rpm, 0);
});

test('cockpit isolates engines, external view opens spectrum, airspeed drives wind and ground speed drives wheels', () => {
  const s = state('jet');
  const inside = flightAudioFrame(s, data, options);
  const outside = flightAudioFrame(s, data, { ...options, view: 1 });
  assert.ok(inside.engineLevel < outside.engineLevel * 0.5);
  assert.ok(inside.cabinCutoff < outside.cabinCutoff * 0.2);
  assert.ok(outside.windGain > inside.windGain * 2);
  assert.equal(inside.wheelGain, 0);
  const taxi = flightAudioFrame({ ...s, onGround: true }, { ...data, groundSpeed: 15 }, options);
  const roll = flightAudioFrame({ ...s, onGround: true }, { ...data, groundSpeed: 70 }, options);
  assert.ok(roll.wheelGain > taxi.wheelGain * 4);
  assert.ok(flightAudioFrame(s, { ...data, indicatedAirspeed: 140 }, options).windGain > inside.windGain);
});

test('pause, menus and crashed flights gate all sound without changing the user sound preference', () => {
  const s = state('jet');
  assert.equal(flightAudioFrame(s, data, options).audible, true);
  assert.equal(flightAudioFrame(s, data, { ...options, paused: true }).audible, false);
  assert.equal(flightAudioFrame(s, data, { ...options, active: false }).audible, false);
  assert.equal(flightAudioFrame({ ...s, crashed: true }, data, options).audible, false);
});

test('servos follow actual transit and touchdown/gear lock are one-shot events, including when reset or muted', () => {
  const tracker = createAudioEventTracker(), s = state('jet');
  const frame = flightAudioFrame(s, data, options);
  assert.deepEqual(tracker.update(s, frame, 0).events, []);
  s.gearPosition = 0.8; s.flapPosition = 0.2; s.elapsed = 1;
  const moving = tracker.update(s, frame, 1);
  assert.equal(moving.gearMoving, true); assert.equal(moving.flapsMoving, true);
  s.gearPosition = 0; s.elapsed = 2;
  assert.equal(tracker.update(s, frame, 2).events[0].type, 'gear-lock');
  assert.equal(tracker.update(s, frame, 2.1).events.length, 0);
  s.touchdown = { sinkRate: 1.2, speed: 70 }; s.elapsed = 3;
  assert.equal(tracker.update(s, frame, 3).events[0].type, 'touchdown');
  assert.equal(tracker.update(s, frame, 3.1).events.length, 0);
  s.touchdown = { sinkRate: 2, speed: 70 }; s.elapsed = 4;
  assert.equal(tracker.update(s, { ...frame, audible: false }, 4).events.length, 0);
  assert.equal(tracker.update(s, frame, 4.1).events.length, 0);
  const replay = state('jet'); replay.touchdown = { sinkRate: 1, speed: 50 };
  assert.equal(tracker.update(replay, frame, 5).events.length, 0);
});

test('warnings are prioritized, optional and rate limited rather than fired on every animation frame', () => {
  const s = state('jet'), tracker = createAudioEventTracker();
  const warning = flightAudioFrame(s, { ...data, stallWarning: true, overspeedWarning: true }, options);
  assert.equal(warning.warning, 'stall');
  assert.equal(tracker.update(s, warning, 0).events.length, 0);
  assert.equal(tracker.update(s, warning, 1).events[0].type, 'stall');
  assert.equal(tracker.update(s, warning, 2).events.length, 0);
  assert.equal(tracker.update(s, warning, 4.3).events[0].type, 'stall');
  assert.equal(flightAudioFrame(s, { ...data, stallWarning: true }, { ...options, warnings: false }).warning, '');
  assert.equal(flightAudioFrame(s, { ...data, agl: 50, roll: 40 }, options).warning, 'bank');
  assert.equal(flightAudioFrame(state('light'), { ...data, agl: 50, roll: 40 }, options).warning, '');
});

test('invalid telemetry is sanitized so generated gain and frequency parameters remain finite', () => {
  const frame = flightAudioFrame({ engine: NaN, aircraft: 'jet', fuel: 30 }, { indicatedAirspeed: Infinity, engineN1: NaN, groundSpeed: NaN }, options);
  for (const value of Object.values(frame)) if (typeof value === 'number') assert.equal(Number.isFinite(value), true);
});
