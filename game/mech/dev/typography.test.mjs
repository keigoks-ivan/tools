import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutText } from '../typography.mjs';

test('radio captions wrap Chinese and keep a short English callsign together', () => {
  const ctx = { font:'18px sans-serif', measureText:s => ({ width:[...s].length * 10 }) };
  const cache = {};
  const result = layoutText(ctx, cache, 'radio', '聽見了 FALCON\n穿過高架橋。', 70);
  assert.deepEqual(result.lines, ['聽見了', 'FALCON', '穿過高架橋。']);
  assert.equal(result.widest, 60);
  assert.equal(layoutText(ctx, cache, 'radio', result.text, 70), result);
  assert.notEqual(layoutText(ctx, cache, 'radio', result.text, 110), result);
});

test('an unbroken callsign fits a narrow HUD and reflows after changing the font', () => {
  const ctx = { font:'18px sans-serif', measureText:s => ({ width:[...s].length * 10 }) };
  const cache = {};
  const result = layoutText(ctx, cache, 'objective', 'AFTERIMAGE', 35);
  assert.deepEqual(result.lines, ['AFT', 'ERI', 'MAG', 'E']);
  ctx.font = '22px sans-serif';
  assert.notEqual(layoutText(ctx, cache, 'objective', result.text, 35), result);
});
