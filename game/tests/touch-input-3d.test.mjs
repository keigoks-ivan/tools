import assert from 'node:assert/strict';
import test from 'node:test';
import { touchHint, HoldRepeat } from '../3d-next/touch-input.js';

test('march hints drop keyboard keys on touch screens', () => {
  assert.equal(touchHint('輕攻擊：J（攻）連按打出五連斬'), '輕攻擊：「攻」連按打出五連斬');
  assert.equal(touchHint('重擊：K（重）一刀掃開身邊的敵人'), '重擊：「重」一刀掃開身邊的敵人');
  assert.equal(touchHint('閃避：Shift（閃）看到紅圈就閃開'), '閃避：「閃」看到紅圈就閃開');
  assert.equal(touchHint('守住中央魂燈，妖兵會從兩側階梯衝上來'), '守住中央魂燈，妖兵會從兩側階梯衝上來');
  assert.equal(touchHint('敵將「赤角」現身！正面會擋，用重擊破防或繞到背後'), '敵將「赤角」現身！正面會擋，用重擊破防或繞到背後');
});

test('a held touch button repeats its action inside the attack buffer window', () => {
  const hold = new HoldRepeat(0.15);
  assert.deepEqual(hold.tick(0.016), [], 'nothing fires before a press');
  hold.press('attack', 7);
  let fired = 0;
  for (let t = 0; t < 1; t += 1 / 60) fired += hold.tick(1 / 60).length;
  assert.ok(fired >= 5 && fired <= 7, `one second of holding fires ${fired} times`);
  hold.release(7);
  assert.deepEqual(hold.tick(1), [], 'release stops the repeat');
});

test('hold repeat tracks each finger and fires an action once per frame', () => {
  const hold = new HoldRepeat(0.15);
  hold.press('attack', 1);
  hold.press('attack', 2);
  assert.deepEqual(hold.tick(0.2), ['attack']);
  hold.release(1);
  assert.deepEqual(hold.tick(0.2), ['attack'], 'the other finger still holds');
  hold.clear();
  assert.deepEqual(hold.tick(0.2), [], 'clear (blur, rotation, pause) drops every hold');
  hold.press('attack', 3);
  assert.deepEqual(hold.tick(5), ['attack'], 'a long stall fires once, not a burst');
  assert.deepEqual(hold.tick(0.01), []);
  assert.deepEqual(hold.tick(-1), [], 'negative dt is ignored');
});
