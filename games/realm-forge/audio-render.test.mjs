// Renders every synthesised effect with OfflineAudioContext inside headless Chrome
// (muted, nothing is played) and checks each one is audible but never clips.
// Skipped when no Chrome is installed; set CHROME=/path/to/chrome to override.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const chrome = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function renderInChrome() {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-audio-'));
  const proc = spawn(chrome, ['--headless=new', '--mute-audio', '--disable-gpu', '--no-first-run', `--user-data-dir=${dir}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  try {
    let port; for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} }
    assert.ok(port, 'Chrome did not expose a debugging port');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = m => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
    const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/audio-selftest.html` });
    for (let i = 0; i < 300; i++) {
      await sleep(100);
      const r = await send('Runtime.evaluate', { expression: "document.title==='done'?document.getElementById('out').textContent:null", returnByValue: true });
      if (r.result?.result?.value) { ws.close(); return r.result.result.value; }
    }
    throw new Error('selftest page never finished');
  } finally {
    const exited = new Promise(r => proc.once('exit', r)); proc.kill(); await Promise.race([exited, sleep(3000)]); server.close();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
}

test('every synthesised effect and every recorded sample renders audible, finite and below clipping', { skip: !chrome && 'Chrome not found', timeout: 60000 }, async () => {
  const text = await renderInChrome();
  assert.ok(text.startsWith('RESULT '), text);
  const { results, samples } = JSON.parse(text.slice(7));
  assert.ok(results.length >= 40);
  const labels = new Set(results.map(r => r.label.split(':')[0]));
  for (const name of ['voice', 'chop', 'mine', 'hammer', 'farm', 'sword', 'death', 'arrow-shoot', 'arrow-hit', 'rock-shoot', 'rock-land', 'heal', 'building-complete', 'building-collapse', 'trained', 'tech', 'age-up', 'alert']) assert.ok(labels.has(name), `missing ${name}`);
  for (const r of results) {
    assert.equal(r.nan, false, `${r.label} has NaN/Infinity`);
    assert.ok(r.peak > .1, `${r.label} too quiet (peak ${r.peak})`);
    assert.ok(r.rms > .002, `${r.label} near silent (rms ${r.rms})`);
    assert.ok(r.peak < .95, `${r.label} clips (peak ${r.peak})`);
    assert.ok(r.tail < 2.9, `${r.label} rings past the render window (${r.tail}s)`);
  }
  assert.ok(samples.length >= 60);
  for (const r of samples) {
    assert.equal(r.status, 200, `${r.id} did not load`);
    assert.equal(r.nan, false, `${r.id} has NaN`);
    assert.ok(r.duration > .05 && r.duration < 3.5, `${r.id} duration ${r.duration}`);
    assert.ok(r.peak > .1, `${r.id} too quiet (peak ${r.peak})`);
    assert.ok(r.rms > .004, `${r.id} near silent (rms ${r.rms})`);
    assert.ok(r.peak < .98, `${r.id} clips at loudest random pitch and gain (peak ${r.peak})`);
  }
});
