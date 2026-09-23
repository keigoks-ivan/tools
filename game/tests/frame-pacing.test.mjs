import test from 'node:test';
import assert from 'node:assert/strict';
import { FramePacer } from '../frame-pacing.js';

function renderedTimes(timestamps, pacer = new FramePacer()) {
  return timestamps.filter(timestamp => pacer.shouldRender(timestamp));
}

function regularTimes(hz, seconds) {
  const interval = 1000 / hz;
  return Array.from({ length: Math.floor(hz * seconds) + 1 }, (_, i) => i * interval);
}

test('60 Hz input is not spuriously dropped and submissions remain capped at 60 fps', () => {
  const rendered = renderedTimes(regularTimes(60, 10));
  assert.ok(rendered.length >= 599 && rendered.length <= 601);
  assert.ok(rendered.every((time, i) => i === 0 || time - rendered[i - 1] >= 1000 / 60 - 1e-6));
});

test('120 Hz input renders every other callback on average, never above 60 fps', () => {
  const rendered = renderedTimes(regularTimes(120, 10));
  assert.ok(rendered.length >= 599 && rendered.length <= 601);
  assert.ok(rendered.every((time, i) => i === 0 || time - rendered[i - 1] >= 1000 / 60 - 1e-6));
});

test('60 Hz timestamp jitter causes at most isolated skips instead of phase-reset stalls', () => {
  const interval = 1000 / 60;
  const offsets = [0, -0.8, 0.8, 0.1, -0.8, 0.8];
  const timestamps = Array.from({ length: 601 }, (_, i) => i === 0 ? 0 : i * interval + offsets[i % offsets.length]);
  const rendered = renderedTimes(timestamps);
  const averageFps = (rendered.length - 1) * 1000 / (rendered.at(-1) - rendered[0]);
  assert.ok(averageFps > 59 && averageFps <= 60.01, `unexpected average rate ${averageFps}`);
});

test('120 Hz RAF jitter and occasional missed callbacks do not reset the pacing phase', () => {
  const timestamps = [0];
  let time = 0;
  for (let i = 1; i <= 1200; i++) {
    // Alternating cadence jitter around 120 Hz; every 73rd callback is late.
    time += i % 2 ? 7.8 : 8.9;
    if (i % 73 === 0) time += 8.4;
    timestamps.push(time);
  }
  const rendered = renderedTimes(timestamps);
  const elapsedMs = rendered.at(-1) - rendered[0];
  const fps = (rendered.length - 1) * 1000 / elapsedMs;
  assert.ok(fps > 59 && fps <= 60.01, `unexpected capped rate ${fps}`);
});

test('a late RAF skips missed slots without issuing catch-up renders, and reset resumes immediately', () => {
  const pacer = new FramePacer();
  assert.equal(pacer.shouldRender(100), true);
  assert.equal(pacer.shouldRender(115), false);
  assert.equal(pacer.shouldRender(200), true);
  assert.equal(pacer.shouldRender(201), false);
  pacer.reset();
  assert.equal(pacer.shouldRender(5000), true);
});

test('invalid pacing configurations are rejected', () => {
  assert.throws(() => new FramePacer(0), RangeError);
  assert.throws(() => new FramePacer(60, -1), RangeError);
  assert.equal(new FramePacer().shouldRender(Number.NaN), false);
});
