#!/usr/bin/env node
/**
 * 端對端冒煙測試：本機啟動 `wrangler dev`（Durable Object 在本機跑，不需帳號、不部署），
 * 用 Node 內建 WebSocket 連三個玩家，驗證代號驗證、節流、開房、加入、轉發、房主轉移、滿房後被拒、重連取代，
 * 以及第二階段的戰場訊息（e 只收房主、4096 上限）、命中申報（h 只給房主）、交棒（y），最後關掉伺服器。
 *
 *   cd workers/coop-relay && npm install && node scripts/smoke.mjs
 *
 * 假代號與暫存資料都放在系統暫存目錄，跑完刪除，不會在 repo 留下檔案。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = Number(process.env.SMOKE_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'http://localhost:8931';
const CODES = { 'smoke-alpha': '甲', 'smoke-bravo': '乙', 'smoke-charlie': '丙', 'smoke-delta': '丁' };

const temp = mkdtempSync(join(tmpdir(), 'coop-smoke-'));
const envFile = join(temp, 'smoke.env');
writeFileSync(envFile, `PLAYER_CODES=${JSON.stringify(CODES)}\nTOKEN_SECRET=smoke-secret-0123456789abcdef\n`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

const server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--env-file', envFile,
  '--persist-to', join(temp, 'state'), '--show-interactive-dev-session=false'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = '';
server.stdout.on('data', chunk => { log += chunk; });
server.stderr.on('data', chunk => { log += chunk; });

function stop() {
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  rmSync(temp, { recursive: true, force: true });
}

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch {}
    await sleep(500);
  }
  throw new Error(`wrangler dev did not start\n${log}`);
}

async function auth(code, origin = ORIGIN) {
  const response = await fetch(`${BASE}/auth`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ code }) });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** 連線並收集訊息；closed 會在關閉時帶 {code, reason} resolve */
function connect(room, token, origin = ORIGIN) {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws?room=${room}&token=${encodeURIComponent(token)}`, { headers: { Origin: origin } });
  const client = { ws, messages: [], closed: null };
  client.closed = new Promise(resolve => ws.addEventListener('close', event => resolve({ code: event.code, reason: event.reason })));
  ws.addEventListener('message', event => client.messages.push(JSON.parse(event.data)));
  ws.addEventListener('error', () => {});
  client.next = async (predicate, ms = 4000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const index = client.messages.findIndex(predicate);
      if (index >= 0) return client.messages.splice(index, 1)[0];
      await sleep(20);
    }
    return null;
  };
  return client;
}

try {
  await waitReady();
  console.log(`wrangler dev ready on ${BASE}`);

  // --- 代號驗證 ---
  const bad = await auth('not-a-code');
  check(bad.status === 401 && bad.body?.error === '代號不正確。', 'wrong code → 401 generic message');
  const badOrigin = await fetch(`${BASE}/auth`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' });
  check(badOrigin.status === 403, 'foreign Origin → 403');
  const tokens = {};
  for (const [code, name] of Object.entries(CODES)) {
    const ok = await auth(code);
    check(ok.status === 200 && ok.body?.name === name && typeof ok.body?.token === 'string', `code for ${name} → token`);
    tokens[name] = ok.body?.token;
  }

  // --- 無效憑證 ---
  const forged = connect('NEW', `${tokens['甲']}x`);
  check((await forged.closed).code === 4001, 'tampered token → close 4001');

  // --- 開房與加入 ---
  const a = connect('NEW', tokens['甲']);
  const welcomeA = await a.next(m => m.t === 'welcome');
  const room = welcomeA?.room;
  check(/^[2-9A-HJ-NP-Z]{4}$/.test(room || ''), `create room → code ${room}`);
  check(welcomeA?.host === '甲' && welcomeA?.you === '甲', 'creator is host');

  const b = connect(room.toLowerCase(), tokens['乙']);   // 小寫房號也可以
  const welcomeB = await b.next(m => m.t === 'welcome');
  check(welcomeB?.members?.length === 2 && welcomeB.host === '甲', 'second player joins, sees host 甲');
  check(!!(await a.next(m => m.t === 'join' && m.member.id === '乙')), 'host told about join');
  const c = connect(room, tokens['丙']);
  check(!!(await c.next(m => m.t === 'welcome' && m.members.length === 3)), 'third player joins');
  const fourth = connect(room, tokens['丁']);
  check(!!(await fourth.next(m => m.t === 'welcome' && m.members.length === 4)), 'fourth player joins under the production cap');
  fourth.ws.close();
  check(!!(await a.next(m => m.t === 'leave' && m.id === '丁')), 'fourth player leaves cleanly');

  // --- 狀態轉發（只轉白名單欄位、不回送給自己） ---
  a.ws.send(JSON.stringify({ t: 's', d: { x: 1.5, y: 0, z: -2, r: 0.3, a: 'azure_run_myb', at: 0.2, ts: 1, l: 1, c: 1234, evil: 'x'.repeat(10) } }));
  const relayed = await b.next(m => m.t === 's');
  check(relayed?.p === '甲' && relayed.d.x === 1.5 && relayed.d.a === 'azure_run_myb' && relayed.d.evil === undefined, 'state relayed to others with sender id, extra fields stripped');
  check(!!(await c.next(m => m.t === 's' && m.p === '甲')), 'state reaches third player');
  await sleep(200);
  check(!a.messages.some(m => m.t === 's'), 'sender does not get its own state back');

  for (const animation of ['azureIdle', 'azureRun', 'azureSweep', 'azureRise', 'azureSlam', 'azureGuard', 'azureUlt', 'amberUlt']) {
    const character = animation.startsWith('amber') ? 'amber' : 'azure';
    const name = `${character}_${animation}_m2cr`;
    a.ws.send(JSON.stringify({ t: 's', d: { x: 0, y: 0, z: 0, r: 0, a: name, at: 0.4, ts: 1, l: 0, c: 2345 } }));
    const motion = await b.next(m => m.t === 's' && m.d?.a === name);
    check(motion?.d.at === 0.4 && motion.d.l === 0, `${animation} and ultimate clock pass the unchanged relay allowlist`);
  }
  a.ws.send(JSON.stringify({ t: 's', d: { x: 0, y: 0, z: 0, r: 0, a: 'loadout_azure_1', c: 12345 } }));
  const choice = await b.next(m => m.t === 's');
  check(choice?.d.a === 'loadout_azure_1' && choice.d.c === 12345, 'selected character, readiness and revision pass the deployed state allowlist');
  a.ws.send(JSON.stringify({ t: 'e', d: { loadout: { ch: 'azure', lv: 4, ready: 1, rv: 12345, go: 12345 } } }));
  const loadout = await b.next(m => m.t === 'e');
  check(loadout?.d.loadout.ch === 'azure' && loadout.d.loadout.lv === 4 && loadout.d.loadout.rv === 12345 && loadout.d.loadout.go === 12345, 'current host chapter and run reach guests through the existing authoritative envelope');
  for (const p of [a, b, c]) p.messages.length = 0;

  // --- 速率限制：一口氣送 60 則，其他人最多收到 40 則 ---
  b.messages.length = 0;
  for (let i = 0; i < 60; i++) c.ws.send(JSON.stringify({ t: 's', d: { x: i, y: 0, z: 0, r: 0, c: i } }));
  await sleep(700);
  const burst = b.messages.filter(m => m.t === 's' && m.p === '丙').length;
  check(burst > 0 && burst <= 40, `rate limit: ${burst}/60 burst messages relayed (≤40)`);
  const big = JSON.stringify({ t: 's', d: { x: 0, y: 0, z: 0, r: 0, a: 'x'.repeat(600) } });
  await sleep(1100);
  b.messages.length = 0;
  c.ws.send(big);
  await sleep(300);
  check(!b.messages.some(m => m.t === 's'), 'oversized message dropped');

  // --- 第二階段：房主權威的敵人同步 ---
  await sleep(1100);
  for (const p of [a, b, c]) p.messages.length = 0;
  const enemies = Array.from({ length: 18 }, (_, i) => [100 + i, i % 3, 640 + i * 10, 500 - i * 7, -157, 1, 12.5, 13, 1, 0, 0]);
  const world = { c: 123456, q: '甲:1', f: 1, n: enemies, lv: [0, 0, 0, 0, 3, 3, 9], v: [{ type: 'hint', text: '<b>小心</b>', seconds: 4 }, { type: 'kill', enemyId: 99, x: 1, y: 2, deep: { no: 1 } }], dm: [['乙', 9, 1, 101, 20]] };
  const worldText = JSON.stringify({ t: 'e', d: world });
  check(worldText.length > 512 && worldText.length <= 4096, `world message is ${worldText.length} bytes (over the old 512 cap, under 4096)`);
  a.ws.send(worldText);
  const gotB = await b.next(m => m.t === 'e');
  check(gotB?.p === '甲' && gotB.d.n?.length === 18 && gotB.d.dm?.[0]?.[0] === '乙', 'host world message relayed to guests with sender id');
  check(gotB?.d.v?.[0]?.text === 'b小心/b' && gotB?.d.v?.[1]?.deep?.no === 1, 'world payload sanitized (angle brackets stripped), structure kept');
  check(!!(await c.next(m => m.t === 'e' && m.p === '甲')), 'world message reaches third player');
  await sleep(200);
  check(!a.messages.some(m => m.t === 'e'), 'host does not get its own world back');
  b.ws.send(JSON.stringify({ t: 'e', d: world }));
  await sleep(300);
  check(!a.messages.some(m => m.t === 'e') && !c.messages.some(m => m.t === 'e'), 'world message from a non-host is dropped');
  a.ws.send(JSON.stringify({ t: 'e', d: { ...world, pad: 'x'.repeat(4200) } }));
  await sleep(300);
  check(!b.messages.some(m => m.t === 'e'), 'world message over 4096 dropped');
  b.ws.send(JSON.stringify({ t: 'h', d: { x: 700, y: 480, h: [[101, 12, 1, 7], ['bad', 1, 0]], p: 3 } }));
  const claim = await a.next(m => m.t === 'h');
  check(claim?.p === '乙' && claim.d.h.length === 1 && claim.d.h[0][0] === 101 && claim.d.p === 3, 'hit claim delivered to the host (malformed entries stripped)');
  await sleep(200);
  check(!c.messages.some(m => m.t === 'h'), 'hit claim not broadcast to other guests');
  a.ws.send(JSON.stringify({ t: 'h', d: { h: [[101, 12, 1, 7]] } }));
  await sleep(200);
  check(!b.messages.some(m => m.t === 'h') && !c.messages.some(m => m.t === 'h'), 'host claims go nowhere');
  b.ws.send(JSON.stringify({ t: 'y', d: { to: '丙' } }));
  await sleep(300);
  check(!a.messages.some(m => m.t === 'host'), 'a non-host cannot hand off');
  a.ws.send(JSON.stringify({ t: 'y', d: { to: '丙' } }));
  const handed = await b.next(m => m.t === 'host');
  check(handed?.id === '丙', 'host hands off → everyone told the new host (丙)');
  check(!!(await a.next(m => m.t === 'host' && m.id === '丙')), 'old host told too');
  c.ws.send(JSON.stringify({ t: 'e', d: { c: 1, q: '丙:1', f: 1 } }));
  check((await a.next(m => m.t === 'e'))?.p === '丙', 'new host world messages are relayed');
  a.ws.send(JSON.stringify({ t: 'e', d: { c: 2, q: '甲:1', f: 1 } }));
  await sleep(300);
  check(!b.messages.some(m => m.t === 'e' && m.p === '甲'), 'old host world messages are now dropped');
  c.ws.send(JSON.stringify({ t: 'y', d: { to: '甲' } }));   // 交回去，後面的房主轉移測試照原本順序
  check((await b.next(m => m.t === 'host'))?.id === '甲', 'hand back to 甲');
  await sleep(1100);

  // --- 第三階段：倒地／切背景狀態位元（st）與重來申報（r） ---
  for (const p of [a, b, c]) p.messages.length = 0;
  b.ws.send(JSON.stringify({ t: 's', d: { x: 1, y: 0, z: 0, r: 0, a: 'death', c: 5, st: 2 } }));
  check((await a.next(m => m.t === 's' && m.p === '乙'))?.d.st === 2, 'downed status bit (st) relayed');
  b.ws.send(JSON.stringify({ t: 's', d: { x: 1, y: 0, z: 0, r: 0, c: 6, st: 99 } }));
  const badSt = await a.next(m => m.t === 's' && m.p === '乙' && m.d.c === 6);
  check(badSt && badSt.d.st === undefined, 'invalid st stripped');
  b.ws.send(JSON.stringify({ t: 'h', d: { r: 1 } }));
  check((await a.next(m => m.t === 'h' && m.p === '乙'))?.d.r === 1, 'retry-only claim {r:1} reaches the host');
  c.ws.send(JSON.stringify({ t: 'h', d: { p: 4, r: 1 } }));
  const pr = await a.next(m => m.t === 'h' && m.p === '丙');
  check(pr?.d.p === 4 && pr.d.r === 1, 'claim with pickup + retry reaches the host');
  await sleep(200);
  check(!b.messages.some(m => m.t === 'h') && !c.messages.some(m => m.t === 'h'), 'retry claims not broadcast to guests');
  await sleep(1100);

  // --- 同一個人重連（換裝置／網路切換）：取代舊連線，不算第 4 人 ---
  const cAgain = connect(room, tokens['丙']);
  check(!!(await cAgain.next(m => m.t === 'welcome' && m.members.length === 3)), 'same player reconnecting takes over (still 3 members)');
  check((await c.closed).code === 4005, 'old connection closed with 4005 replaced');
  await sleep(200);
  check(!a.messages.some(m => m.t === 'leave'), 'takeover does not broadcast a leave');

  // --- 房主轉移 ---
  a.ws.close(1000, 'bye');
  const leave = await b.next(m => m.t === 'leave' && m.id === '甲');
  check(leave?.host === '乙', 'host leaves → oldest remaining (乙) becomes host');
  check(!!(await cAgain.next(m => m.t === 'host' && m.id === '乙')), 'everyone told about new host');

  // --- 不存在的房號 ---
  const ghost = connect('ZZZZ', tokens['甲']);
  const ghostClose = await ghost.closed;
  check(ghostClose.code === 4004, `unknown room → close 4004 (${ghostClose.code})`);

  b.ws.close(); cAgain.ws.close();
  await sleep(300);

  // --- 節流：同一 IP 錯 5 次之後，連正確代號也暫時擋下 ---
  for (let i = 0; i < 4; i++) await auth(`wrong-${i}`);   // 前面已錯 1 次，共 5 次
  const blocked = await auth('smoke-alpha');
  check(blocked.status === 429, `after 5 wrong codes the IP is throttled (${blocked.status})`);
} catch (error) {
  console.error(error);
  failures++;
} finally {
  stop();
}

/** 另起一台 relay 跑一小段檢查（不同設定） */
async function withServer(port, env, run) {
  const dir = mkdtempSync(join(tmpdir(), 'coop-smoke-'));
  const file = join(dir, 'smoke.env');
  writeFileSync(file, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  const child = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--env-file', file, '--persist-to', join(dir, 'state'), '--show-interactive-dev-session=false'],
    { cwd: root, stdio: 'ignore', detached: true });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`${base}/health`)).ok; } catch {} if (!up) await sleep(500); }
    if (!up) throw new Error(`wrangler dev on ${port} did not start`);
    await run(base);
  } catch (error) { console.error(error); failures++; }
  finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}
const authAt = async (base, code) => {
  const response = await fetch(`${base}/auth`, { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify({ code }) });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const connectAt = (base, room, token) => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room}&token=${encodeURIComponent(token)}`, { headers: { Origin: ORIGIN } });
  const client = { ws, messages: [] };
  client.closed = new Promise(resolve => ws.addEventListener('close', event => resolve({ code: event.code, reason: event.reason })));
  client.welcome = new Promise(resolve => ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.t === 'welcome') resolve(m); }));
  ws.addEventListener('error', () => {});
  return client;
};

// --- 滿房：房間上限調成 2（ROOM_CAP 只能調小），第 3 個不同的人被拒 → 驗證「滿房後被拒」的同一條程式路徑 ---
await withServer(PORT + 1, { PLAYER_CODES: JSON.stringify(CODES), TOKEN_SECRET: 'smoke-secret-0123456789abcdef', ROOM_CAP: '2' }, async base => {
  const t = {};
  for (const [code, name] of Object.entries(CODES)) t[name] = (await authAt(base, code)).body.token;
  const p1 = connectAt(base, 'NEW', t['甲']);
  const room = (await p1.welcome).room;
  const p2 = connectAt(base, room, t['乙']);
  await p2.welcome;
  const p3 = connectAt(base, room, t['丙']);
  const closed = await p3.closed;
  check(closed.code === 4003 && closed.reason === 'room full', `player over the cap rejected with 4003 "room full" (${closed.code} ${closed.reason})`);
  p1.ws.close(); p2.ws.close();
});

// --- PLAYER_CODES 放 5 組 → 設定錯誤，Worker 拒絕發憑證也拒絕連線 ---
await withServer(PORT + 2, { PLAYER_CODES: JSON.stringify({ ...CODES, 'smoke-delta': '丁', 'smoke-echo': '戊' }), TOKEN_SECRET: 'smoke-secret-0123456789abcdef' }, async base => {
  const response = await authAt(base, 'smoke-alpha');
  check(response.status === 500, `PLAYER_CODES with 5 entries → auth refused (${response.status})`);
  const closed = await connectAt(base, 'NEW', 'x.y').closed;
  check(closed.code === 4010, `PLAYER_CODES with 5 entries → websocket closed 4010 (${closed.code})`);
});

console.log(failures ? `\n${failures} check(s) failed` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
