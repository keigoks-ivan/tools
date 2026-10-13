import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, visionRadius, START_EXPLORED_RADIUS, BUILDING_VISION } from './core.mjs';
import { Renderer } from './renderer.js';

const count = a => a.reduce((s, v) => s + v, 0);

test('the opening base sees and has explored far more than the old 7-tile town circle', () => {
  const w = new World(defaultProject());
  const town = w.buildings.find(b => b.team === 0 && b.type === 'town');
  assert.equal(visionRadius(town), BUILDING_VISION.town);
  assert.ok(BUILDING_VISION.town >= 12);
  assert.ok(count(w.visible) > 400, `visible ${count(w.visible)}`);
  assert.ok(count(w.explored) > count(w.visible) * 1.5, 'an explored ring surrounds the visible area');
  const s = w.map.spawns[0];
  assert.equal(w.explored[s.y * w.map.size + Math.min(w.map.size - 1, s.x + START_EXPLORED_RADIUS - 1)], 1);
  assert.equal(w.visible[s.y * w.map.size + Math.min(w.map.size - 1, s.x + START_EXPLORED_RADIUS - 1)], 0);
});

test('scouts see further than soldiers, siege the least', () => {
  const w = new World(defaultProject());
  const r = id => visionRadius(w.spawn(id, 0, { x: 60, y: 60 }));
  assert.ok(r('scout') > r('swordsman'));
  assert.ok(r('swordsman') > r('ram'));
});

test('enemy buildings stay as last seen after they leave sight, and vanish once the empty site is seen again', () => {
  const view = Object.assign(Object.create(Renderer.prototype), {});
  const n = 32, world = { map: {}, visible: new Uint8Array(n * n), buildings: [], isVisible(e) { return Boolean(this.visible[Math.round(e.y) * n + Math.round(e.x)]); } };
  world.map.size = n;
  const barracks = { id: 7, kind: 'building', type: 'barracks', team: 1, x: 10, y: 10, hp: 100, maxHp: 100, progress: 1 };
  world.buildings.push(barracks); world.visible[10 * n + 10] = 1;
  assert.equal(view.updateGhosts(world).length, 0, 'visible buildings are drawn normally, not as ghosts');
  world.visible[10 * n + 10] = 0;
  const ghosts = view.updateGhosts(world); assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0].ghost, true); assert.equal(ghosts[0].type, 'barracks');
  barracks.hp = 5;
  assert.equal(view.updateGhosts(world)[0].hp, 100, 'ghost keeps the last seen state');
  world.buildings.length = 0;
  assert.equal(view.updateGhosts(world).length, 1, 'destroyed while unseen: still shown');
  world.visible[10 * n + 10] = 1;
  assert.equal(view.updateGhosts(world).length, 0, 'seen empty: ghost removed');
  world.visible[10 * n + 10] = 0;
  assert.equal(view.updateGhosts(world).length, 0);
});
