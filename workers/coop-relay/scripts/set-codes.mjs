// 互動式設定 PLAYER_CODES：逐人問代號（不顯示）與名字，組成 JSON、檢查、再交給 wrangler secret put。
// 用法（在 workers/coop-relay 內）：node scripts/set-codes.mjs
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { MAX_CODES, parsePlayerCodes } from '../src/logic.js';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = text => { if (!muted) write(text); else if (text.includes('\n')) write('\n'); };
const lines = [], waiting = [];
rl.on('line', line => { muted = false; const next = waiting.shift(); next ? next(line.trim()) : lines.push(line.trim()); });
const ask = (q, hidden = false) => {
  process.stdout.write(q);
  if (lines.length) return Promise.resolve(lines.shift());
  muted = hidden;
  return new Promise(resolve => waiting.push(resolve));
};

const count = Number(await ask(`幾個人？（1～${MAX_CODES}，直接 Enter＝${MAX_CODES}）：`)) || MAX_CODES;
const codes = {};
for (let i = 1; i <= count; i++) {
  const name = await ask(`第 ${i} 人的名字（遊戲裡顯示）：`);
  const code = await ask(`第 ${i} 人的代號（打字不會顯示）：`, true);
  codes[code] = name;
}
rl.close();

const json = JSON.stringify(codes);
const check = parsePlayerCodes(json);
if (!check.ok) { console.log(`沒有上傳。錯：${check.error}`); process.exit(1); }
if (check.entries.length !== count) { console.log('沒有上傳。錯：有兩個人的代號一樣'); process.exit(1); }
console.log(`檢查 OK（${count} 人：${check.entries.map(([, n]) => n).join('、')}），上傳中…`);

const child = spawn('npx', ['wrangler', 'secret', 'put', 'PLAYER_CODES'], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.end(json);
child.on('exit', code => console.log(code === 0 ? '完成。' : '上傳失敗，請把上面的錯誤訊息告訴 Claude。'));
