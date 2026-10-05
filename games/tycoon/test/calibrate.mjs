// 校準：用二分法找 c、r、r_del、c_del，寫回 params.js。用法：node test/calibrate.mjs [--dry]
// 目標（第 11 節與 params.js 的 calibrationTargets）：
//   c      → 走路範圍內想喝飲料的人，買這些店的比例 = walkCapture（0.5）
//   r      → 全城每人每天成交杯數 = cupsPerPersonPerDay（0.12，含外送）
//   c_del  → 想點外送的人，點到我們這幾家店的比例 = deliveryCapture（0.5）
//   r_del  → 有上平台的對手店，外送占總杯數 = deliveryShare（0.32）
// 四個量互相牽動（等候、走掉、對手擴張），所以輪流二分、重複幾輪到都收斂。
import { readFileSync, writeFileSync } from 'node:fs';
import { P } from '../params.js';
import { measure as measure0 } from './metrics.mjs';

// 對手擴張是離散事件，量測值對校準值並不連續；所以每次量測都記下來，最後取四個目標整體誤差最小的那一組
const visited = [];
const errOf = (m) => Math.max(Math.abs(m.cupsPerPersonDay - 0.12) / 0.12 / 0.1, Math.abs(m.walkCapture - 0.5) / 0.5 / 0.1, Math.abs(m.delShare - 0.32) / 0.32 / 0.1, Math.abs(m.delCapture - 0.5) / 0.5 / 0.1);
function measure(cal) { const m = measure0(cal); visited.push({ cal: { ...cal }, m, e: errOf(m) }); return m; }

const T = {
  cups: P.calibrationTargets.cupsPerPersonPerDay.v,
  walkCap: P.calibrationTargets.walkCapture.v,
  delShare: P.calibrationTargets.deliveryShare.v,
  delCap: P.calibrationTargets.deliveryCapture.v,
};
// 對手擴張是離散事件，量測值會小幅跳動，所以容許誤差不能太緊
const TOL = { cups: 0.001, walkCap: 0.005, delShare: 0.01, delCap: 0.006 };

function bisect(f, lo, hi, target, tol, maxIter = 22) {
  // f 對 x 單調遞增
  let a = lo, b = hi, x = (a + b) / 2, fx;
  for (let i = 0; i < maxIter; i++) {
    x = (a + b) / 2;
    fx = f(x);
    if (Math.abs(fx - target) <= tol) return { x, fx, iter: i + 1 };
    if (fx < target) a = x; else b = x;
  }
  return { x, fx, iter: maxIter };
}

export function calibrate(log = console.log) {
  let cal = { c: 0, r: 0.2, r_del: 0.1, c_del: 0 };
  for (let round = 1; round <= 6; round++) {
    const before = { ...cal };
    let o = bisect((x) => measure({ ...cal, c: x }).walkCapture, -4, 4, T.walkCap, TOL.walkCap); cal.c = o.x; log(`輪 ${round} c=${cal.c.toFixed(4)} walkCapture=${o.fx.toFixed(4)} (${o.iter})`);
    o = bisect((x) => measure({ ...cal, r: x }).cupsPerPersonDay, 0.01, 1.5, T.cups, TOL.cups); cal.r = o.x; log(`輪 ${round} r=${cal.r.toFixed(4)} cups/人/天=${o.fx.toFixed(4)} (${o.iter})`);
    o = bisect((x) => measure({ ...cal, c_del: x }).delCapture, -4, 5, T.delCap, TOL.delCap); cal.c_del = o.x; log(`輪 ${round} c_del=${cal.c_del.toFixed(4)} delCapture=${o.fx.toFixed(4)} (${o.iter})`);
    o = bisect((x) => measure({ ...cal, r_del: x }).delShare, 0.001, 1.5, T.delShare, TOL.delShare); cal.r_del = o.x; log(`輪 ${round} r_del=${cal.r_del.toFixed(4)} delShare=${o.fx.toFixed(4)} (${o.iter})`);
    const m = measure(cal);
    const ok = Math.abs(m.cupsPerPersonDay - T.cups) <= TOL.cups && Math.abs(m.walkCapture - T.walkCap) <= TOL.walkCap && Math.abs(m.delShare - T.delShare) <= TOL.delShare && Math.abs(m.delCapture - T.delCap) <= TOL.delCap;
    log(`輪 ${round} 全部：cups=${m.cupsPerPersonDay.toFixed(4)} walkCap=${m.walkCapture.toFixed(4)} delShare=${m.delShare.toFixed(4)} delCap=${m.delCapture.toFixed(4)} ${ok ? '收斂' : ''}`);
    if (ok) break;
  }
  const best = visited.reduce((a, b) => (b.e < a.e ? b : a));
  log(`取整體誤差最小的一組（最大相對誤差 ${(best.e * 10).toFixed(1)}%）：cups=${best.m.cupsPerPersonDay.toFixed(4)} walkCap=${best.m.walkCapture.toFixed(4)} delShare=${best.m.delShare.toFixed(4)} delCap=${best.m.delCapture.toFixed(4)}`);
  return best.cal;
}

function writeParams(cal) {
  const path = new URL('../params.js', import.meta.url);
  let src = readFileSync(path, 'utf8');
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const notes = {
    c: `校準值：走路範圍內想喝飲料的人，約 ${Math.round(T.walkCap * 100)}% 會買這幾家店的飲料。用二分法在固定種子、對手加一家預設玩家店、跑 365 天的情境下找出來，目標見 calibrationTargets.walkCapture。`,
    r: `校準值：每人每天想喝一杯的機率。用二分法讓全城每人每天成交 ${T.cups} 杯（含外送），目標見 calibrationTargets.cupsPerPersonPerDay。`,
    r_del: `校準值：外送客人池裡每人每天想點外送的機率。用二分法讓有上平台的店外送占總杯數約 ${Math.round(T.delShare * 100)}%，目標見 calibrationTargets.deliveryShare。`,
    c_del: `校準值：想點外送的人，約 ${Math.round(T.delCap * 100)}% 會點到這幾家店。用二分法找出來，目標見 calibrationTargets.deliveryCapture。`,
  };
  for (const k of ['c', 'r', 'r_del', 'c_del']) {
    const re = new RegExp(`^(\\s*)${k}: \\{ v: [^,]+, src: '推算', note: '.*' \\},?$`, 'm');
    if (!re.test(src)) throw new Error('params.js 找不到 ' + k);
    src = src.replace(re, (_, sp) => `${sp}${k}: { v: ${r4(cal[k])}, src: '推算', note: '${notes[k]}' },`);
  }
  writeFileSync(path, src);
}

// node --test 會把 test/ 底下所有檔都當測試檔執行，這裡擋掉，避免測試時意外重跑校準、改寫 params.js
if (process.argv[1] && process.argv[1].endsWith('calibrate.mjs') && !process.env.NODE_TEST_CONTEXT) {
  const cal = calibrate();
  console.log('校準結果', cal);
  if (!process.argv.includes('--dry')) { writeParams(cal); console.log('已寫入 params.js'); }
}
