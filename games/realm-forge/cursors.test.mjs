import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject } from './core.mjs';
import { CURSOR_KINDS, cursorSvg, cursorCss, contextCursor } from './cursors.mjs';

function setup() {
  const p = defaultProject(); p.rules.ai = 'off'; const w = new World(p);
  const worker = w.units.find(u => u.team === 0 && u.blueprint.role === 'worker');
  const enemy = w.spawn('swordsman', 1, { x: worker.x + 3, y: worker.y }), soldier = w.spawn('swordsman', 0, { x: worker.x + 1, y: worker.y + 1 });
  const house = w.buildings.find(b => b.team === 0 && b.type === 'town');
  return { w, worker, enemy, soldier, house };
}

test('every cursor kind has a well-formed svg and a css rule with a hotspot', () => {
  const css = cursorCss();
  for (const kind of CURSOR_KINDS) {
    const svg = cursorSvg(kind);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="32" height="32" viewBox="0 0 32 32">.*<\/svg>$/);
    assert.equal((svg.match(/<path/g) || []).length + (svg.match(/<circle/g) || []).length, (svg.match(/\/>/g) || []).length);
    assert.ok(css.includes(`#map[data-command-cursor="${kind}"]{cursor:url("data:image/svg+xml,`));
  }
  assert.ok(css.split('\n').every(rule => /\) 2 2,auto\}$/.test(rule)));
  assert.equal(cursorSvg('nope'), '');
});

test('villager over a resource gathers, soldier over the same resource does not', () => {
  const { w, worker, soldier } = setup();
  assert.equal(contextCursor(w, { units: [worker], resource: 'forest' }), 'gather');
  assert.equal(contextCursor(w, { units: [worker], resource: 'gold' }), 'gather');
  assert.equal(contextCursor(w, { units: [soldier], resource: 'forest' }), '');
  assert.equal(contextCursor(w, { units: [], resource: 'forest' }), '');
  assert.equal(contextCursor(w, { units: [worker], resource: 'water' }), '');
});

test('enemies show the sword for fighters and nothing for unarmed workers', () => {
  const { w, worker, enemy, soldier } = setup();
  assert.equal(contextCursor(w, { units: [soldier], target: enemy }), 'attack');
  assert.equal(contextCursor(w, { units: [worker, soldier], target: enemy }), 'attack');
});

test('own damaged building shows repair, unfinished shows build, Alt on a garrison building shows garrison', () => {
  const { w, worker, house } = setup();
  assert.equal(contextCursor(w, { units: [worker], target: house }), '');
  house.hp = house.maxHp - 50;
  assert.equal(contextCursor(w, { units: [worker], target: house }), 'repair');
  assert.equal(contextCursor(w, { units: [worker], target: house, alt: true }), 'garrison');
  house.garrisoned = new Array(500).fill(1);
  assert.equal(contextCursor(w, { units: [worker], target: house, alt: true }), 'repair');
  house.garrisoned = []; house.progress = .4;
  assert.equal(contextCursor(w, { units: [worker], target: house }), 'build');
});

test('placement and explicit order modes override hover targets', () => {
  const { w, worker, enemy } = setup();
  assert.equal(contextCursor(w, { units: [], placement: 'house' }), 'build');
  assert.equal(contextCursor(w, { units: [worker], orderMode: 'repair', target: enemy }), 'repair');
  assert.equal(contextCursor(w, { units: [worker], attackMove: true }), 'attack');
  assert.equal(contextCursor(w, { units: [worker], orderMode: 'patrol' }), '');
});
