import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../ui.css', import.meta.url), 'utf8');
const allStyles = htmlSource + cssSource;

function inputSetupSource() {
  const start = mainSource.indexOf('const touchMove =');
  const end = mainSource.indexOf('// ---------- HUD ----------', start);
  assert.ok(start >= 0 && end > start, 'input setup block should remain identifiable');
  return mainSource.slice(start, end);
}

function makeTarget() {
  const listeners = new Map();
  return {
    style: {},
    captured: new Set(),
    released: [],
    addEventListener(type, handler) { listeners.set(type, handler); },
    listener(type) { return listeners.get(type); },
    dispatch(type, event = {}) { return listeners.get(type)?.(event); },
    setPointerCapture(id) { this.captured.add(id); },
    releasePointerCapture(id) { this.released.push(id); this.captured.delete(id); },
  };
}

function controlsHarness() {
  const ids = ['stickZone', 'stickBase', 'stickKnob', 'btnA', 'btnB', 'btnJ', 'btnR', 'btnW', 'btnU', 'btnL', 'charsel'];
  const elements = Object.fromEntries(ids.map(id => [id, makeTarget()]));
  elements.stickZone.getBoundingClientRect = () => ({ left: 0, top: 100, width: 300, height: 200 });
  const docListeners = new Map(), windowListeners = new Map();
  const calls = { audioSuspended: 0, audioResumed: 0, framesCancelled: [], framesResumed: 0, switchWeapon: 0, toggleLock: 0 };
  elements.charsel.classList = { contains: () => true, add() {}, remove() {} };
  const document = {
    hidden: false,
    addEventListener(type, fn) { docListeners.set(type, fn); },
    getElementById(id) { return elements[id] ?? null; },
  };
  class Element {
    constructor() { this.closest = () => null; }
  }
  const context = vm.createContext({
    document, Element,
    addEventListener(type, fn) { windowListeners.set(type, fn); },
    cancelAnimationFrame(id) { calls.framesCancelled.push(id); },
    resumeFrames() { calls.framesResumed++; },
    suspendAudio() { calls.audioSuspended++; },
    resumeAudio() { calls.audioResumed++; },
    clearCombatBuffer() {},
    switchWeapon() { calls.switchWeapon++; },
    toggleLock() { calls.toggleLock++; },
    toggleMute() {}, initAudio() {}, playBgm() {}, nextDialog() {},
    buildHero() {}, start() {}, restart() {}, CHARS: {}, hud: { title: { classList: { add() {} } } },
    ready: true, state: 'play', animationFrame: 17, dlg: { active: false },
  });
  vm.runInContext(`${inputSetupSource()}\nthis.inspect = () => ({
    touchMove: { ...touchMove }, keys: [...keys],
    pressed: { atkPressed, heavyPressed, jumpPressed, dodgePressed, musouPressed, heavyHold },
    clearTouchMove,
  });`, context);
  return {
    context, elements, calls,
    docListeners, windowListeners,
    state: () => JSON.parse(JSON.stringify(context.inspect())),
    clearTouchMove() { context.inspect().clearTouchMove(); },
    fireKey(type, code, key = '') { return windowListeners.get(type)({ code, key, preventDefault() {}, target: {} }); },
  };
}

const pointer = (pointerId, clientX, clientY) => ({ pointerId, clientX, clientY });

test('touch stick captures one pointer, clamps its vector, and ignores other pointers', () => {
  const h = controlsHarness();
  const zone = h.elements.stickZone;
  zone.dispatch('pointerdown', pointer(4, 100, 200));
  assert.equal(zone.captured.has(4), true);
  assert.deepEqual(h.state().touchMove, { active: true, mx: 0, mz: 0 });
  assert.equal(h.elements.stickBase.style.left, '100px');
  assert.equal(h.elements.stickBase.style.top, '100px', 'knob coordinates must be local to the zone below its viewport top');

  zone.dispatch('pointerdown', pointer(5, 155, 255));
  assert.equal(zone.captured.has(5), false, 'a second finger must not steal the captured stick');
  zone.dispatch('pointermove', pointer(5, 155, 255));
  assert.deepEqual(h.state().touchMove, { active: true, mx: 0, mz: 0 }, 'a second finger must not steer the stick');
  zone.dispatch('pointermove', pointer(4, 155, 255));
  const moved = h.state().touchMove;
  assert.ok(Math.abs(moved.mx - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(moved.mz - Math.SQRT1_2) < 1e-12);
  assert.equal(Math.hypot(moved.mx, moved.mz), 1);
  assert.equal(h.elements.stickKnob.style.left, `${100 + 55 / Math.sqrt(2)}px`);

  zone.dispatch('pointerup', pointer(5, 0, 0));
  assert.equal(h.state().touchMove.active, true, 'another pointer ending must not release this stick');
  zone.dispatch('pointerup', pointer(4, 200, 200));
  assert.deepEqual(h.state().touchMove, { active: false, mx: 0, mz: 0 });
  assert.equal(h.elements.stickBase.style.display, 'none');
  assert.equal(h.elements.stickKnob.style.display, 'none');
});

test('touch stick cancel and explicit clear release capture and zero movement', () => {
  const h = controlsHarness();
  const zone = h.elements.stickZone;
  zone.dispatch('pointerdown', pointer(9, 10, 20));
  zone.dispatch('pointermove', pointer(9, 40, 50));
  zone.dispatch('pointercancel', pointer(9, 40, 50));
  assert.deepEqual(h.state().touchMove, { active: false, mx: 0, mz: 0 });
  assert.equal(h.elements.stickKnob.style.display, 'none');

  zone.dispatch('pointerdown', pointer(11, 10, 20));
  h.clearTouchMove();
  assert.deepEqual(h.state().touchMove, { active: false, mx: 0, mz: 0 });
  assert.deepEqual(zone.released, [11]);
  assert.equal(zone.captured.has(11), false);
});

test('lost pointer capture also clears the touch stick', () => {
  const h = controlsHarness();
  const zone = h.elements.stickZone;
  zone.dispatch('pointerdown', pointer(12, 30, 40));
  zone.dispatch('pointermove', pointer(12, 50, 60));
  zone.dispatch('lostpointercapture', pointer(12, 50, 60));
  assert.deepEqual(h.state().touchMove, { active: false, mx: 0, mz: 0 });
  assert.equal(h.elements.stickBase.style.display, 'none');
});

test('mobile action buttons set input edges and heavy hold follows its captured pointer', () => {
  const h = controlsHarness();
  for (const [id, pressed] of [['btnA', 'atkPressed'], ['btnJ', 'jumpPressed'], ['btnR', 'dodgePressed'], ['btnU', 'musouPressed']]) {
    let prevented = false;
    h.elements[id].dispatch('pointerdown', { preventDefault() { prevented = true; } });
    assert.equal(prevented, true, `${id} should suppress browser pointer defaults`);
    assert.equal(h.state().pressed[pressed], true, `${id} should set ${pressed}`);
  }
  h.elements.btnB.dispatch('pointerdown', { pointerId: 20, preventDefault() {} });
  assert.equal(h.state().pressed.heavyPressed, true);
  assert.equal(h.state().pressed.heavyHold, true);
  assert.equal(h.elements.btnB.captured.has(20), true);
  h.elements.btnB.dispatch('pointerdown', { pointerId: 21, preventDefault() {} });
  h.elements.btnB.dispatch('pointerup', { pointerId: 21 });
  assert.equal(h.state().pressed.heavyHold, true, 'another finger must not release heavy charge');
  h.elements.btnB.dispatch('pointerup', { pointerId: 20 });
  assert.equal(h.state().pressed.heavyHold, false);
  assert.equal(h.state().pressed.heavyPressed, true, 'the pressed edge must survive release until the game frame consumes it');
  h.elements.btnB.dispatch('pointerdown', { pointerId: 22, preventDefault() {} });
  h.elements.btnB.dispatch('lostpointercapture', { pointerId: 22 });
  assert.equal(h.state().pressed.heavyHold, false);
});

test('weapon and lock touch actions only fire during play', () => {
  const h = controlsHarness();
  h.elements.btnW.dispatch('pointerdown', { preventDefault() {} });
  h.elements.btnL.dispatch('pointerdown', { preventDefault() {} });
  assert.deepEqual(h.calls, { audioSuspended: 0, audioResumed: 0, framesCancelled: [], framesResumed: 0, switchWeapon: 1, toggleLock: 1 });
  h.context.state = 'loading';
  h.elements.btnW.dispatch('pointerdown', { preventDefault() {} });
  h.elements.btnL.dispatch('pointerdown', { preventDefault() {} });
  assert.equal(h.calls.switchWeapon, 1);
  assert.equal(h.calls.toggleLock, 1);
});

test('keyboard readiness, loading and hidden-tab transitions clear all held input', () => {
  const h = controlsHarness();
  h.fireKey('keydown', 'KeyK');
  h.fireKey('keydown', 'KeyW');
  h.elements.stickZone.dispatch('pointerdown', pointer(3, 50, 60));
  h.elements.stickZone.dispatch('pointermove', pointer(3, 75, 85));
  assert.equal(h.state().pressed.heavyHold, true);
  assert.deepEqual(h.state().keys, ['KeyK', 'KeyW']);

  h.context.document.hidden = true;
  h.docListeners.get('visibilitychange')();
  assert.deepEqual(h.state().pressed, { atkPressed: false, heavyPressed: false, jumpPressed: false, dodgePressed: false, musouPressed: false, heavyHold: false });
  assert.deepEqual(h.state().keys, []);
  assert.deepEqual(h.state().touchMove, { active: false, mx: 0, mz: 0 });
  assert.deepEqual(h.elements.stickZone.released, [3]);
  assert.deepEqual(h.calls.framesCancelled, [17]);
  assert.equal(h.calls.audioSuspended, 1);

  h.context.document.hidden = false;
  h.docListeners.get('visibilitychange')();
  assert.equal(h.calls.framesResumed, 1);
  assert.equal(h.calls.audioResumed, 1);

  h.context.ready = false;
  h.fireKey('keydown', 'KeyJ');
  assert.equal(h.state().pressed.atkPressed, false);
  h.context.ready = true;
  h.context.state = 'loading';
  h.fireKey('keydown', 'KeyJ');
  assert.equal(h.state().pressed.atkPressed, false);
});

test('touch layout keeps the rotate prompt play-only and controls reachable', () => {
  assert.match(htmlSource, /<div id="rotate">/);
  for (const id of ['stickZone', 'btnA', 'btnB', 'btnJ', 'btnR', 'btnW', 'btnU', 'btnL']) {
    assert.match(htmlSource, new RegExp(`id="${id}"`), `${id} must exist in the touch layout`);
  }
  assert.match(htmlSource, /body\.is-touch #touch\s*\{\s*display:block\s*\}/);
  assert.match(allStyles, /body\.is-touch\[data-game-state="play"\] #rotate\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(allStyles, /#stickZone\s*\{[^}]*pointer-events:\s*auto;[^}]*touch-action:\s*none/s);
  assert.match(allStyles, /\.tbtn\s*\{[^}]*pointer-events:\s*auto;[^}]*touch-action:\s*none/s);
  for (const id of ['btnA', 'btnB', 'btnJ', 'btnR', 'btnW', 'btnU', 'btnL']) {
    assert.match(allStyles, new RegExp(`#${id}\\s*\\{[^}]*\\b(?:right|left):\\s*[^;]+;[^}]*\\b(?:bottom|top):\\s*[^;]+;`, 's'), `${id} needs an explicit reachable corner position`);
    assert.match(cssSource, new RegExp(`#${id}\\s*\\{[^}]*env\\(safe-area-inset-right`, 's'), `${id} must clear the device's right safe area`);
  }
  assert.match(cssSource, /@media\s*\(max-height:\s*500px\)\s*and\s*\(orientation:\s*landscape\)/);
  assert.match(cssSource, /@media\s*\(max-height:\s*500px\)\s*and\s*\(max-width:\s*900px\)\s*and\s*\(orientation:\s*landscape\)\s*\{\s*#minimap\s*\{[^}]*width:\s*58px;[^}]*height:\s*58px;/s);
  assert.match(cssSource, /#minimap\s*\{[^}]*top:\s*calc\(60px \+ env\(safe-area-inset-top/);
  assert.match(cssSource, /#minimap\s*\{[^}]*right:\s*calc\(14px \+ env\(safe-area-inset-right/);
});
