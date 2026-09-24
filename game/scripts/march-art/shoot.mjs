// Headless Chrome (temporary profile) screenshot driver over CDP. No dependencies (Node ≥ 22).
//   node shoot.mjs <url> <out.png> [--w 1280 --h 720 --wait-js "window.__ready" --eval "js" --delay 500]
// Several shots from one page: --shots '[{"eval":"...","out":"a.png"}, ...]'
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const url = args[0], out = args[1];
const width = Number(opt('w', 1280)), height = Number(opt('h', 720));
const waitJs = opt('wait-js', 'window.__ready === true');
const delay = Number(opt('delay', 400));
const shots = opt('shots') ? JSON.parse(opt('shots')) : [{ eval: opt('eval', ''), out }];
// --intercept '[{"pattern":"*march-world.js*","body":"export ..."}]' serves a replacement module (no file edits)
const intercepts = opt('intercept') ? JSON.parse(opt('intercept')) : [];
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'march-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const logs = [];
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => { const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId; pending.set(msg.id, { resolve, reject }); ws.send(JSON.stringify(msg)); });
}
try {
  let version;
  for (let i = 0; i < 50; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); } }
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
    else if (msg.method === 'Runtime.consoleAPICalled') logs.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
    else if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 600));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  if (intercepts.length) {
    await send('Fetch.enable', { patterns: intercepts.map(i => ({ urlPattern: i.pattern })) }, sessionId);
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.method !== 'Fetch.requestPaused') return;
      const hit = intercepts.find(i => new RegExp(i.pattern.replace(/[.?+^$()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')).test(msg.params.request.url));
      send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body: Buffer.from(hit.body).toString('base64') }, sessionId);
    });
  }
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId)).result?.value;
  for (let i = 0; i < 600; i++) { if (await evaluate(`!!(${waitJs})`)) break; await sleep(250); }
  for (const shot of shots) {
    if (shot.eval) { const v = await evaluate(shot.eval); if (v !== undefined) console.log('eval:', typeof v === 'string' ? v : JSON.stringify(v)); }
    await sleep(shot.delay ?? delay);
    if (shot.out) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      writeFileSync(shot.out, Buffer.from(data, 'base64'));
      console.log('saved', shot.out);
    }
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  if (logs.length) console.log('--- console ---\n' + logs.slice(0, 40).join('\n'));
  try { ws?.close(); } catch {}
  chrome.kill('SIGKILL');
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit();
}
