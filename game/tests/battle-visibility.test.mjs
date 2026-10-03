import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../3d-next/battle.js', import.meta.url), 'utf8');
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  let end = source.indexOf('{', start), depth = 1;
  for (end++; depth; end++) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
function battle({ coop = true, paused = false } = {}) {
  const overlay = { hidden: !paused }, audioStates = [];
  const context = vm.createContext({
    coop: coop ? {} : null, paused, running: true, raf: 42, lastAt: 100,
    document: { hidden: false, addEventListener(type, handler) { assert.equal(type, 'visibilitychange'); context.changed = handler; } },
    $: () => overlay, audio: { setPaused: value => audioStates.push(value) },
    clearInput() {}, cancelAnimationFrame() {}, requestAnimationFrame: () => 42, frame() {}, pacer: { reset() {} }, isPortrait: () => false,
  });
  for (const name of ['stopFrames', 'resumeFrames', 'pause']) vm.runInContext(functionSource(name), context);
  const start = source.indexOf("document.addEventListener('visibilitychange',");
  const end = source.indexOf("canvas.addEventListener('webglcontextlost'", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  return { context, overlay, audioStates, visibility(hidden) { context.document.hidden = hidden; context.changed(); } };
}

test('co-op returns from a background tab without latching the entire room simulation paused', () => {
  const b = battle();
  b.visibility(true); assert.equal(b.context.raf, 0, 'hidden tabs should stop rendering');
  b.visibility(false);
  assert.equal(b.context.paused, false, 'background transition permanently paused the host');
  assert.equal(b.context.raf, 42, 'visible host did not resume simulation frames');
  assert.equal(b.overlay.hidden, true);
  assert.deepEqual(b.audioStates, [true, false]);
});

test('manual co-op pause and single-player background pause still require explicit resume', () => {
  for (const options of [{ coop: true, paused: true }, { coop: false }]) {
    const b = battle(options); b.visibility(true); b.visibility(false);
    assert.equal(b.context.paused, true); assert.equal(b.context.raf, 0); assert.equal(b.overlay.hidden, false);
  }
});
