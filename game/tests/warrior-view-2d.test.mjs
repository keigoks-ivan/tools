import assert from 'node:assert/strict';
import test from 'node:test';
import { projectWarriorPoint, warriorBackgroundCrop } from '../2d/warrior-view.js';

test('chase projection holds the hero in the foreground and shrinks fighters ahead', () => {
  const hero = { x: 640, y: 500 };
  const self = projectWarriorPoint(hero, hero);
  const ahead = projectWarriorPoint({ x: 840, y: 230 }, hero);
  const beside = projectWarriorPoint({ x: 840, y: 500 }, hero);
  const behind = projectWarriorPoint({ x: 840, y: 625 }, hero);
  assert.deepEqual(self, { x: 640, y: 600, scale: 0.68 });
  assert.ok(ahead.y < self.y && behind.y > self.y);
  assert.ok(ahead.scale < self.scale && behind.scale > self.scale);
  assert.ok(ahead.x - 640 < beside.x - 640 && beside.x - 640 < behind.x - 640);
});

test('chase background crop stays inside the painting at arena extremes', () => {
  for (const x of [90, 640, 1190]) for (const y of [210, 500, 625]) {
    const crop = warriorBackgroundCrop({ x, y }, 1672, 941);
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(crop.x + crop.width <= 1672 + 1e-9);
    assert.ok(crop.y + crop.height <= 941 + 1e-9);
    assert.ok(Math.abs(crop.width / crop.height - 1672 / 941) < 1e-9);
  }
});
