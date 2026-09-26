// 三人連線 relay（workers/coop-relay）的純邏輯：房號、成員與房主轉移、速率限制、代號設定、憑證、Origin。
// Cloudflare 端的整合測試另見 workers/coop-relay/scripts/smoke.mjs（本機 wrangler dev）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_ALPHABET, MAX_PLAYERS, Membership, RateLimiter, cleanState, constantTimeEqual, makeRoomCode, normalizeRoomCode,
  originAllowed, parsePlayerCodes, sanitizeName, throttleState, AUTH_WINDOW_MS,
} from '../../workers/coop-relay/src/logic.js';
import { matchCode, signToken, verifyToken } from '../../workers/coop-relay/src/token.js';

test('room codes are 4 characters from an alphabet without 0/O/1/I and cover every letter evenly', () => {
  assert.equal(ROOM_ALPHABET.length, 32);
  for (const ch of '0O1I') assert.ok(!ROOM_ALPHABET.includes(ch), ch);
  const counts = new Map();
  for (let i = 0; i < 4000; i++) {
    const code = makeRoomCode();
    assert.match(code, /^[2-9A-HJ-NP-Z]{4}$/);
    for (const ch of code) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  assert.equal(counts.size, 32);
  // byte % 32 is unbiased: every byte value maps to exactly 8 values
  assert.equal(makeRoomCode(n => new Uint8Array(n).fill(255)), 'ZZZZ');
  assert.equal(makeRoomCode(n => Uint8Array.from({ length: n }, (_, i) => i * 32)), '2222');
});

test('room code input is normalised and confusable characters are rejected, not guessed', () => {
  assert.equal(normalizeRoomCode(' ab3k '), 'AB3K');
  assert.equal(normalizeRoomCode('AB0K'), null);
  assert.equal(normalizeRoomCode('ABIK'), null);
  assert.equal(normalizeRoomCode('ABC'), null);
  assert.equal(normalizeRoomCode(null), null);
});

test('membership: first joiner hosts, 4th distinct player is rejected, same id rejoins in place', () => {
  const room = new Membership();
  assert.equal(room.join('甲', '甲', 100).ok, true);
  assert.equal(room.join('乙', '乙', 200).ok, true);
  assert.equal(room.join('丙', '丙', 300).ok, true);
  assert.equal(room.host, '甲');
  assert.deepEqual(room.join('丁', '丁', 400), { ok: false, reason: 'full' });
  const again = room.join('乙', '乙二', 500);
  assert.equal(again.ok, true); assert.equal(again.rejoin, true);
  assert.equal(again.member.joinedAt, 200, 'reconnect keeps the original join order');
  assert.equal(room.size, MAX_PLAYERS);
});

test('host migration: oldest remaining player takes over; non-host leaving keeps the host', () => {
  const room = new Membership([{ id: '丙', name: '丙', joinedAt: 30 }, { id: '甲', name: '甲', joinedAt: 10 }, { id: '乙', name: '乙', joinedAt: 20 }]);
  assert.equal(room.host, '甲', 'constructor sorts by join time');
  assert.deepEqual(room.leave('乙'), { removed: true, hostChanged: false, host: '甲' });
  assert.deepEqual(room.leave('甲'), { removed: true, hostChanged: true, host: '丙' });
  assert.deepEqual(room.leave('nobody'), { removed: false, hostChanged: false, host: '丙' });
  assert.deepEqual(room.leave('丙'), { removed: true, hostChanged: true, host: null });
  assert.equal(room.size, 0);
});

test('room cap can only be lowered (smoke test uses 2), never raised above 3', () => {
  assert.equal(new Membership([], 2).cap, 2);
  assert.equal(new Membership([], 9).cap, 3);
  assert.equal(new Membership([], undefined).cap, 3);
  const small = new Membership([], 2);
  small.join('a', 'a', 1); small.join('b', 'b', 2);
  assert.equal(small.join('c', 'c', 3).ok, false);
});

test('rate limiter lets 20 messages per second through and flags sustained abuse', () => {
  const limiter = new RateLimiter();
  let passed = 0;
  for (let i = 0; i < 60; i++) if (limiter.allow(i)) passed++;   // 60 messages inside one second
  assert.equal(passed, 20);
  assert.equal(limiter.allow(1000), true, 'new window');
  // a well-behaved 12 Hz client never drops
  const normal = new RateLimiter();
  for (let t = 0; t < 10000; t += 1000 / 12) assert.equal(normal.allow(t), true);
  // flooding at 100/s for several seconds becomes abusive
  const flood = new RateLimiter();
  for (let t = 0; t < 7000; t += 10) flood.allow(t);
  assert.equal(flood.abusive, true);
  assert.equal(normal.abusive, false);
});

test('state messages keep only whitelisted, finite, bounded fields', () => {
  assert.deepEqual(cleanState({ x: 1.23456, y: 0, z: -2, r: 3, a: 'combo1', at: 0.5, ts: 2, l: 0, c: 99, junk: 'x' }),
    { x: 1.235, y: 0, z: -2, r: 3, c: 99, a: 'combo1', at: 0.5, ts: 2, l: 0 });
  assert.equal(cleanState({ x: NaN, y: 0, z: 0, r: 0 }), null);
  assert.equal(cleanState({ x: 1e9, y: 0, z: 0, r: 0 }), null);
  assert.equal(cleanState({ x: 0, y: 0, z: 0, r: 0, a: '<img onerror>' }).a, undefined);
  assert.equal(cleanState('nope'), null);
});

test('PLAYER_CODES: JSON object with at most 3 entries and unique display names', () => {
  assert.deepEqual(parsePlayerCodes('{"alpha-1":"大哥","bravo-2":"二哥"}'), { ok: true, entries: [['alpha-1', '大哥'], ['bravo-2', '二哥']] });
  assert.equal(parsePlayerCodes('{"a111":"1","b222":"2","c333":"3"}').ok, true);
  const four = parsePlayerCodes('{"a111":"1","b222":"2","c333":"3","d444":"4"}');
  assert.equal(four.ok, false); assert.match(four.error, /at most 3/);
  assert.equal(parsePlayerCodes('').ok, false);
  assert.equal(parsePlayerCodes('[]').ok, false);
  assert.equal(parsePlayerCodes('{}').ok, false);
  assert.equal(parsePlayerCodes('{"abc":"x"}').ok, false, 'codes shorter than 4 characters');
  assert.equal(parsePlayerCodes('{"a111":"同名","b222":"同名"}').ok, false);
  assert.equal(sanitizeName('  <b>小弟</b>\n  '), 'b小弟/b');
  assert.equal(sanitizeName('一二三四五六七八九十十一十二'), '一二三四五六七八九十十一');
});

test('code matching is constant-time over all entries and returns the display name', async () => {
  const entries = [['alpha-1', '大哥'], ['bravo-2', '二哥'], ['charlie-3', '小弟']];
  assert.equal(await matchCode('bravo-2', entries), '二哥');
  assert.equal(await matchCode('bravo-3', entries), null);
  assert.equal(await matchCode('', entries), null);
  assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0])), false);
});

test('tokens are HMAC-signed, carry the name, expire and reject tampering or another secret', async () => {
  const secret = 'test-secret-0123456789abcdef';
  const now = 1_800_000_000;
  const token = await signToken('二哥', secret, { nowSec: now });
  assert.deepEqual(await verifyToken(token, secret, { nowSec: now + 60 }), { name: '二哥', exp: now + 30 * 86400 });
  assert.equal(await verifyToken(token, secret, { nowSec: now + 31 * 86400 }), null, 'expired');
  assert.equal(await verifyToken(token, 'another-secret-0123456789', { nowSec: now }), null, 'rotated secret revokes');
  const [body, sig] = token.split('.');
  const forgedBody = Buffer.from(JSON.stringify({ v: 1, n: '大哥', e: now + 999999 })).toString('base64url');
  assert.equal(await verifyToken(`${forgedBody}.${sig}`, secret, { nowSec: now }), null, 'payload swap');
  assert.equal(await verifyToken(`${body}.${sig.slice(0, -2)}AA`, secret, { nowSec: now }), null, 'signature edit');
  assert.equal(await verifyToken('garbage', secret), null);
  await assert.rejects(signToken('x', 'short'));
});

test('Origin allowlist: exact hosts, port wildcards and subdomain wildcards only', () => {
  const rules = 'https://tools.investmquest.com,http://localhost:*,https://*.tools-abc.pages.dev';
  assert.equal(originAllowed('https://tools.investmquest.com', rules), true);
  assert.equal(originAllowed('http://tools.investmquest.com', rules), false);
  assert.equal(originAllowed('https://tools.investmquest.com.evil.com', rules), false);
  assert.equal(originAllowed('http://localhost:8931', rules), true);
  assert.equal(originAllowed('http://localhost', rules), true);
  assert.equal(originAllowed('https://feature-x.tools-abc.pages.dev', rules), true);
  assert.equal(originAllowed('https://tools-abc.pages.dev.evil.com', rules), false);
  assert.equal(originAllowed('https://evil.pages.dev', rules), false);
  assert.equal(originAllowed(null, rules), false);
  assert.equal(originAllowed('null', rules), false);
});

test('auth throttle blocks the 6th attempt after 5 wrong codes within 10 minutes, then releases', () => {
  const t0 = 1_000_000;
  const hits = [t0, t0 + 1000, t0 + 2000, t0 + 3000];
  assert.equal(throttleState(hits, t0 + 4000).blocked, false);
  const five = [...hits, t0 + 4000];
  const state = throttleState(five, t0 + 5000);
  assert.equal(state.blocked, true);
  assert.equal(state.retryAfterMs, AUTH_WINDOW_MS - 5000);
  assert.equal(throttleState(five, t0 + AUTH_WINDOW_MS + 1).blocked, false, 'oldest attempt aged out');
  assert.equal(throttleState(undefined, t0).blocked, false);
});
