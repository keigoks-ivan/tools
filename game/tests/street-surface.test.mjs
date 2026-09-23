import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { paintStreetSurface } from '../street-surface.js';

function recordingCanvas2D() {
  const commands = [];
  const context = {
    fillStyle: '#initial-fill',
    strokeStyle: '#initial-stroke',
    globalAlpha: 0.75,
    lineWidth: 3,
    transform: [1, 0, 0, 1, 0, 0],
    commands,
    save() {
      this.stack ??= [];
      this.stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        globalAlpha: this.globalAlpha,
        lineWidth: this.lineWidth,
        transform: [...this.transform],
      });
      commands.push(['save']);
    },
    restore() {
      const state = this.stack.pop();
      Object.assign(this, state);
      commands.push(['restore']);
    },
    scale(x, y) {
      this.transform[0] *= x;
      this.transform[3] *= y;
      commands.push(['scale', x, y]);
    },
    fillRect(x, y, width, height) {
      commands.push(['fillRect', x, y, width, height, this.fillStyle]);
    },
  };
  return context;
}

function draw() {
  const ctx = recordingCanvas2D();
  paintStreetSurface(ctx);
  return { ctx, commands: ctx.commands };
}

test('street surface is deterministic, bounded, and restores canvas state', async () => {
  const first = draw();
  const second = draw();
  assert.deepEqual(first.commands, second.commands);
  assert.ok(first.commands.length > 100 && first.commands.length < 500);
  assert.ok(first.commands.flat().every((value) => typeof value !== 'number' || Number.isFinite(value)));
  const rects = first.commands.filter(([name]) => name === 'fillRect');
  assert.ok(rects.every(([, x, y, width, height]) =>
    x >= 0 && y >= 0 && width >= 0 && height >= 0 && x + width <= 512 && y + height <= 512));

  assert.deepEqual(first.ctx.transform, [1, 0, 0, 1, 0, 0]);
  assert.equal(first.ctx.fillStyle, '#initial-fill');
  assert.equal(first.ctx.strokeStyle, '#initial-stroke');
  assert.equal(first.ctx.globalAlpha, 0.75);
  assert.equal(first.ctx.lineWidth, 3);
  assert.equal(first.commands[0][0], 'save');
  assert.equal(first.commands.at(-1)[0], 'restore');

  const source = await readFile(new URL('../street-surface.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:window|document)\b/);
});

test('street surface validates size before touching the context', () => {
  const ctx = recordingCanvas2D();
  assert.throws(() => paintStreetSurface(ctx, 0), TypeError);
  assert.equal(ctx.commands.length, 0);
});
