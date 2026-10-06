// node --test games/tycoon/test/sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseWorld, playerOpens, runDays, FIXTURE } from './scenario.mjs';
import { measure } from './metrics.mjs';
import {
  V, createWorld, stepHour, openShop, closeShop, takeLoan, setPrices, setStaffing, setSocialAd, hireInfluencer, startOpeningPromo, respondEvent,
  calcBusinessTax, annuityPayment, serialize, deserialize, getKpi, getLots, getLotInfo, getRivalInfo, getReport, getEvents, getShopToday, getShopHistory,
  medianResidentialLot, marketShare30, _internals,
} from '../sim.js';

const { settleMonth, settleShop, dateOf, recalcShop } = _internals;
const CAL = { c: V.calibrated.c, r: V.calibrated.r, r_del: V.calibrated.r_del, c_del: V.calibrated.c_del };
let _base;
const base = () => (_base ||= measure(CAL));

// ───────────── 第 11 節的表格，每一列一個測試 ─────────────
test('校準值已由 calibrate.mjs 寫進 params.js（不是預設的未校準佔位）', async () => {
  const { P } = await import('../params.js');
  for (const k of ['c', 'r', 'r_del', 'c_del']) { assert.equal(P.calibrated[k].src, '推算'); assert.doesNotMatch(P.calibrated[k].note, /尚未校準/); }
  assert.ok(CAL.r > 0 && CAL.r_del > 0);
});

test('§11 全城每人每天成交杯數 0.11–0.14', () => {
  const m = base();
  assert.ok(m.cupsPerPersonDay >= 0.11 && m.cupsPerPersonDay <= 0.14, String(m.cupsPerPersonDay));
});

test('§11 每家店平均日杯數 180–380', () => {
  const m = base();
  assert.ok(m.avgShopDaily >= 180 && m.avgShopDaily <= 380, String(m.avgShopDaily));
});

test('§11 有上平台的店，外送占比 25–40%', () => {
  const m = base();
  assert.ok(m.delShare >= 0.25 && m.delShare <= 0.4, String(m.delShare));
});

test('§11 全城平均杯價 50–65 元', () => {
  const m = base();
  assert.ok(m.avgPrice >= 50 && m.avgPrice <= 65, String(m.avgPrice));
});

// 規格 v1.1（13.8）：淨利率拆成兩條。依據是 S9 說新店「三個月內定生死」，前幾個月本來就難。
let _y;
const year = () => (_y ||= (() => { const w = baseWorld(); const p = playerOpens(w); runDays(w, 24 * 30 + 40); return p.history.filter((h) => !h.partial); })());
const margin = (hs) => hs.reduce((a, h) => a + h.profit, 0) / hs.reduce((a, h) => a + h.turnover, 0);
test('§13.8 預設住宅巷弄店第 4–12 個月淨利率 −5% 到 +15%', () => {
  const m = margin(year().slice(4, 13));
  assert.ok(m >= -0.05 && m <= 0.15, `淨利率 ${(m * 100).toFixed(1)}%`);
});
test('§13.8 預設住宅巷弄店第 1 年整年（含開幕爬坡）淨利率 ≥ −15%', () => {
  const m = base().playerMargin;
  assert.ok(m >= -0.15, `淨利率 ${(m * 100).toFixed(1)}%`);
});
test('補充：預設店第 2 年（開店後第 13–24 個月）淨利率 −5% 到 +15%', () => {
  const y2 = year().slice(12, 24);
  assert.equal(y2.length, 12);
  const m = margin(y2);
  assert.ok(m >= -0.05 && m <= 0.15, `第 2 年淨利率 ${(100 * m).toFixed(1)}%`);
});

// ── 沒有玩家的世界跑 3 年（13.8）──
let _np;
const noPlayer = () => (_np ||= (() => {
  const w = baseWorld(); const maxK = {};
  for (let i = 0; i < 1090 * 24; i++) { stepHour(w); if (i % 24 === 0) for (const c of Object.values(w.companies)) if (!c.exited && c.id !== 'player') maxK[c.id] = Math.max(maxK[c.id] || 0, c.awareness); }
  return { w, maxK };
})());
test('§13.8 沒有玩家的世界跑 3 年：對手和路邊小店每年關店不超過 1 家', () => {
  const { w } = noPlayer();
  const per = {};
  for (const e of w.eventLog) if (e.kind === 'close') { const y = Math.floor(e.t / 24 / 365); per[y] = (per[y] || 0) + 1; }
  for (const y of [0, 1, 2]) assert.ok((per[y] || 0) <= 1, JSON.stringify(per));
});
test('§13.8 沒有玩家的世界：最大品牌的杯數市占 25–55%（看最後 12 個月）', () => {
  const { w } = noPlayer();
  const last = w.monthly.slice(-12);
  const tot = {}; let all = 0;
  for (const m of last) for (const [k, v] of Object.entries(m.cups)) { tot[k] = (tot[k] || 0) + v; all += v; }
  const top = Math.max(...Object.values(tot)) / all;
  assert.ok(top >= 0.25 && top <= 0.55, `最大品牌 ${(top * 100).toFixed(1)}%`);
});
test('§13.8 沒有玩家的世界：每個品牌的知名度都不超過 0.9', () => {
  const { maxK } = noPlayer();
  for (const [k, v] of Object.entries(maxK)) assert.ok(v <= 0.9, `${k} ${v.toFixed(3)}`);
});

// 量「價格彈性」本身：開店後第一個月（知名度只在月底更新，這段期間不變），並把評價數墊到很大讓星等不動。
// 理由：規格的滿意度公式也會因為貴而扣星，星等再回頭影響客人，整年累積下來玩家杯數會掉 40% 左右，
// 那是另一件事（見 sim-3yr-report.md），第 11 節這一列對應的是第 3 節的價格彈性。
test('§11 玩家全面漲價 10%，玩家杯數下降 12–20%', () => {
  const run = (mult) => {
    const w = baseWorld({ cal: CAL }); const p = playerOpens(w);
    p.revCnt = 1e6; p.revSum = 4e6; // 星等固定在 4.0
    if (mult !== 1) { for (const k of Object.keys(p.prices)) p.prices[k] = Math.round(p.prices[k] * mult); recalcShop(w, p); }
    for (let i = 0; i < 30 * 24; i++) stepHour(w);
    const a = p.tot.walk + p.tot.del;
    for (let i = 0; i < 30 * 24; i++) stepHour(w);
    return { cups: p.tot.walk + p.tot.del - a, avg: p.avgPrice };
  };
  const b = run(1), u = run(1.1);
  const drop = 1 - u.cups / b.cups;
  assert.ok(u.avg / b.avg > 1.09 && u.avg / b.avg < 1.11);
  assert.ok(drop >= 0.12 && drop <= 0.2, `下降 ${(drop * 100).toFixed(1)}%（${b.cups} → ${u.cups}）`);
});

test('§13.8 漲價 10%：滿 12 個月時，杯數下降不超過 30%（含星等與知名度回饋）', () => {
  const run = (mult) => {
    const w = baseWorld(); const p = playerOpens(w);
    if (mult !== 1) { for (const k of Object.keys(p.prices)) p.prices[k] = Math.round(p.prices[k] * mult); recalcShop(w, p); }
    runDays(w, 12 * 30 + 5);
    const a = p.tot.walk + p.tot.del;
    runDays(w, 30);
    return p.tot.walk + p.tot.del - a;
  };
  const b = run(1), u = run(1.1);
  const drop = 1 - u / b;
  assert.ok(drop <= 0.3, `開店滿 12 個月後那一個月，杯數下降 ${(drop * 100).toFixed(1)}%（${b} → ${u}）`);
});

test('§11 同種子跑兩次結果完全相同', () => {
  const run = () => { const w = baseWorld(); playerOpens(w); runDays(w, 120); return serialize(w); };
  assert.equal(run(), run());
});

test('§11 模擬一天的耗時 < 5 ms', () => {
  const w = baseWorld(); playerOpens(w); runDays(w, 40); // 暖機
  const t0 = performance.now();
  runDays(w, 60);
  const ms = (performance.now() - t0) / 60;
  assert.ok(ms < V.perf.maxMsPerDay, `${ms.toFixed(2)} ms／天`);
});

// ───────────── 其他 ─────────────
test('日期：開局 2026-10-01 是週四；2027-01-01 在第 92 天', () => {
  assert.equal(dateOf(0).dow, 4);
  assert.equal(dateOf(92).key, '2027-01-01');
  assert.equal(dateOf(92).holiday, true);
});

test('開店扣錢正確：裝潢＋設備＋首批原料＋押金', () => {
  const w = baseWorld();
  takeLoan(w, 'start', 2000000);
  const lot = w.lots.find((l) => l.id === medianResidentialLot(w));
  const before = w.companies.player.cash;
  const r = openShop(w, lot.id, { name: 'A' });
  assert.ok(r.ok);
  const expected = V.startup.renovation + V.startup.equipment + V.startup.firstStock + lot.deposit;
  assert.equal(before - w.companies.player.cash, expected);
  assert.equal(r.cost, expected);
  assert.equal(lot.deposit, lot.rent * 2);
  // 店面被占用，不能重複租
  assert.equal(openShop(w, lot.id).ok, false);
});

test('現金不夠開店：回傳失敗與原因，不扣錢', () => {
  const w = baseWorld();
  const lot = medianResidentialLot(w);
  const before = w.companies.player.cash; // 120 萬 < 155 萬
  const r = openShop(w, lot);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'cash');
  assert.match(r.reason, /現金不夠/);
  assert.equal(w.companies.player.cash, before);
});

test('押金關店退回；設備回收 20%；裝潢歸零', () => {
  const w = baseWorld();
  takeLoan(w, 'start', 2000000);
  const r = openShop(w, medianResidentialLot(w));
  const s = w.shops.find((x) => x.id === r.shopId);
  const afterOpen = w.companies.player.cash;
  const c = closeShop(w, s.id);
  assert.ok(c.ok);
  assert.equal(c.refund, s.deposit);
  const dayRent = Math.floor((s.rent * 1) / 31); // 簽約當天的租金
  assert.equal(w.companies.player.cash - afterOpen, s.deposit + V.startup.equipment * V.startup.equipmentRecovery - dayRent);
  assert.equal(s.status, 'closed');
  assert.equal(w.lots.find((l) => l.id === s.lotId).shopId, null);
  assert.equal(closeShop(w, s.id).ok, false);
});

test('貸款攤還：每月本金＋利息＝月付額，本金加總＝貸款額，60 期還清', () => {
  const w = baseWorld({ noRivals: true });
  const r = takeLoan(w, 'start', 1000000);
  assert.ok(r.ok);
  assert.equal(r.payment, annuityPayment(1000000));
  const cash0 = w.companies.player.cash;
  const co = w.companies.player;
  let principalSum = 0, interestSum = 0, prevBal = 1000000;
  for (let i = 0; i < V.loan.termMonths; i++) {
    const loan = co.loans[0];
    const interest = Math.round((loan.balance * V.loan.rate) / 12);
    settleMonth(w, dateOf(i * 31 % 28)); // 只用到當月天數
    const paidPrincipal = i === V.loan.termMonths - 1 ? prevBal : prevBal - (co.loans[0] ? co.loans[0].balance : 0);
    if (i === 0) assert.equal(paidPrincipal, annuityPayment(1000000) - interest);
    principalSum += paidPrincipal; interestSum += interest;
    prevBal = co.loans[0] ? co.loans[0].balance : 0;
  }
  assert.equal(co.loans.length, 0);
  assert.equal(principalSum, 1000000);
  assert.equal(cash0 - co.cash, principalSum + interestSum);
  // 整數：利息總額與年金公式相近（每期四捨五入誤差在幾十元內）
  const approx = annuityPayment(1000000) * 60 - 1000000;
  assert.ok(Math.abs(interestSum - approx) < 100);
});

test('貸款額度：開辦 200 萬、週轉 400 萬，超過就失敗；金額要是萬元整數倍', () => {
  const w = baseWorld({ noRivals: true });
  assert.ok(takeLoan(w, 'start', 2000000).ok);
  assert.equal(takeLoan(w, 'start', 10000).code, 'quota');
  assert.ok(takeLoan(w, 'working', 4000000).ok);
  assert.equal(takeLoan(w, 'working', 10000).code, 'quota');
  assert.equal(takeLoan(w, 'working', 12345).code, 'amount');
});

test('1 月 1 日三級時薪都調漲 3.2%', () => {
  const w = baseWorld({ noRivals: true });
  assert.deepEqual(w.wages, { basic: 196, market: 215, high: 240 });
  for (let i = 0; i < 92 * 24; i++) stepHour(w); // 走到 2026-12-31 23 點
  assert.deepEqual(w.wages, { basic: 196, market: 215, high: 240 });
  stepHour(w); // 2027-01-01 00:00
  assert.deepEqual(w.wages, { basic: Math.round(196 * 1.032), market: Math.round(215 * 1.032), high: Math.round(240 * 1.032) });
  assert.deepEqual(w.wages, { basic: 202, market: 222, high: 248 });
});

test('營業稅：剛好 200,000 元走 5/105，199,999 元走 1%（整數比較）', () => {
  assert.equal(calcBusinessTax(199999, 60000), 1999);
  assert.equal(calcBusinessTax(200000, 60000), Math.floor((140000 * 5) / 105));
  assert.equal(calcBusinessTax(200000, 60000), 6666);
  assert.equal(calcBusinessTax(199999, 0), 1999);
  assert.equal(calcBusinessTax(200000, 300000), 0); // 進項大於銷項，不退稅
  // 經過月結流程
  // 進項＝原料 60,000＋報廢 4%（2,400）；20 萬元時 (200,000 − 62,400) × 5/105 = 6,552
  for (const [turnover, expect] of [[199999, 1999], [200000, 6552]]) {
    const w = baseWorld({ noRivals: true });
    takeLoan(w, 'start', 2000000);
    const rr = openShop(w, medianResidentialLot(w)); assert.ok(rr.ok);
    const s = w.shops.find((x) => x.id === rr.shopId);
    s.status = 'open';
    s.mtd.storeRev = turnover; s.mtd.cogs = 60000; s.mtd.wasteMilli = 60000 * 40; s.mtd.walk = 3000;
    const cash0 = w.companies.player.cash;
    settleShop(w, s, 31, false);
    assert.equal(s.lastPnL.bizTax, expect, String(turnover));
    assert.ok(Number.isInteger(s.lastPnL.profit));
    assert.equal(cash0 - w.companies.player.cash, s.lastPnL.waste + s.lastPnL.wage + s.lastPnL.rent + s.lastPnL.util + s.lastPnL.pos + s.lastPnL.cardFee + s.lastPnL.bizTax);
  }
});

test('營利事業所得稅：年結對全年稅前淨利課 20%，先扣以前年度虧損', () => {
  const w = baseWorld({ noRivals: true });
  const co = w.companies.player;
  co.yearProfit = -500000; _internals.yearEnd(w, dateOf(92));
  assert.equal(co.nol, 500000); assert.equal(co.lastIncomeTax, 0);
  const cash = co.cash;
  co.yearProfit = 1000000; _internals.yearEnd(w, dateOf(92 + 365));
  assert.equal(co.lastIncomeTax, 100000); // (100 萬 − 50 萬) × 20%
  assert.equal(cash - co.cash, 100000);
  assert.equal(co.nol, 0);
});

test('破產判定：月結現金為負先動用週轉額度，用完還是負才結束', () => {
  let w = baseWorld({ noRivals: true });
  w.companies.player.cash = -300000;
  settleMonth(w, dateOf(0));
  assert.equal(w.status, 'playing');
  assert.equal(w.companies.player.cash, 0);
  assert.equal(w.companies.player.loans[0].kind, 'working');
  assert.equal(w.companies.player.loans[0].principal, 300000);

  w = baseWorld({ noRivals: true });
  w.companies.player.cash = -4500000;
  settleMonth(w, dateOf(0));
  assert.equal(w.status, 'bankrupt');
  assert.ok(w.companies.player.cash < 0);
  // 結束後不再推進
  const t = w.t; stepHour(w);
  assert.equal(w.t, t);
});

const oldShop = (w, s) => { s.openedT = -400 * 24; };
const lossMonth = (s) => { s.mtd.rentDays = 30; s.mtd.openDays = 30; s.mtd.tradingDays = 30; };
test('§13.6 對手連續 6 個月虧損，而且品牌現金撐不過 3 個月固定成本，才關店', () => {
  const w = baseWorld();
  const s = w.shops.find((x) => x.company === 'daji');
  const lot = w.lots.find((l) => l.id === s.lotId);
  oldShop(w, s);
  w.companies.daji.cash = 1500000; // 每月虧一家店的租金，6 個月後剩約 90 萬，低於 3 個月固定成本
  for (let i = 1; i <= 5; i++) { lossMonth(s); settleMonth(w, dateOf(0)); assert.equal(s.status, 'open'); assert.equal(s.lossStreak, i); }
  lossMonth(s); settleMonth(w, dateOf(0));
  assert.equal(s.status, 'closed');
  assert.equal(lot.shopId, null);
  assert.equal(getLots(w).find((l) => l.id === lot.id).state, '空');
  assert.ok(w.eventLog.some((e) => e.kind === 'close' && /連續 6 個月虧損/.test(e.text)));
});
test('§13.6 現金夠撐 3 個月固定成本就不關店', () => {
  const w = baseWorld();
  const s = w.shops.find((x) => x.company === 'daji');
  oldShop(w, s); w.companies.daji.cash = 50000000;
  for (let i = 1; i <= 8; i++) { lossMonth(s); settleMonth(w, dateOf(0)); }
  assert.equal(s.status, 'open');
  assert.ok(s.lossStreak >= 6);
});
test('§13.6 開幕前 6 個月不判斷關店；賺錢的月份重置連續虧損', () => {
  const w = baseWorld();
  const s = w.shops.find((x) => x.company === 'qingyou');
  w.companies.qingyou.cash = 1000000;
  s.openedT = -100 * 24; // 開了約 3 個月
  for (let i = 0; i < 8; i++) { lossMonth(s); settleMonth(w, dateOf(0)); }
  assert.equal(s.status, 'open'); assert.equal(s.lossStreak, 0);
  oldShop(w, s);
  lossMonth(s); settleMonth(w, dateOf(0)); assert.equal(s.lossStreak, 1);
  Object.assign(s.mtd, { rentDays: 30, openDays: 30, tradingDays: 30, storeRev: 3000000, walk: 40000 }); settleMonth(w, dateOf(0));
  assert.equal(s.lossStreak, 0);
});
test('§13.6 品牌最後一家店關掉，品牌退出；玩家的店不適用', () => {
  const w = baseWorld();
  const s = w.shops.find((x) => x.company === 'road1');
  oldShop(w, s); w.companies.road1.cash = 300000;
  for (let i = 0; i < 6; i++) { lossMonth(s); settleMonth(w, dateOf(0)); }
  assert.equal(s.status, 'closed');
  assert.equal(w.companies.road1.exited, true);
  const w2 = baseWorld({ noRivals: true }); takeLoan(w2, 'start', 2000000);
  const r = openShop(w2, medianResidentialLot(w2)); const ps = w2.shops.find((x) => x.id === r.shopId);
  ps.status = 'open'; ps.openedT = -400 * 24; w2.companies.player.cash = 5000000;
  for (let i = 0; i < 8; i++) { lossMonth(ps); settleMonth(w2, dateOf(0)); }
  assert.equal(ps.status, 'open');
});
test('§13.5 路邊小店：老闆自己顧店不支薪、舊租約 7 折、有上外送', () => {
  const w = baseWorld();
  const s = w.shops.find((x) => x.company === 'road1');
  const lot = w.lots.find((l) => l.id === s.lotId);
  assert.equal(s.ownerWorks, true);
  assert.equal(s.rent, Math.round(lot.rent * 0.7));
  assert.equal(s.delivery, true);
  assert.ok(s.staff.every((n) => n >= 0 && n <= 1));
  s.staff = [0, 0, 0]; // 只有老闆：不請人，薪水為 0
  for (let i = 0; i < 24 * 5; i++) stepHour(w);
  assert.equal(s.mtd.wageMilli, 0);
  assert.ok(s.mtd.walk + s.mtd.del > 0);
});
test('§14.2 品牌名氣：每月 Δ = 0.02 × min(1, 品牌客人數 ÷ 地圖總人口) × (1 − 名氣)，再遺忘 3%；開局值大吉 0.60、青柚 0.30、玩家與路邊小店 0', () => {
  const w = baseWorld({ noRivals: true });
  const co = w.companies.player; co.cm.cups = 3000;
  assert.equal(co.awareness, 0);
  settleMonth(w, dateOf(0));
  const d = 0.02 * (3000 / w.popAll);
  assert.ok(Math.abs(co.awareness - d * 0.97) < 1e-12, String(co.awareness));
  const w2 = baseWorld();
  assert.equal(w2.companies.daji.awareness, 0.6); assert.equal(w2.companies.qingyou.awareness, 0.3); assert.equal(w2.companies.road1.awareness, 0);
});
test('§14.1 熟悉度：開幕當天 0；每天 F += (1−F)×[0.03×exp(−d÷350) + 0.5×買的人數÷人口]，再 −0.5%', () => {
  const w = baseWorld({ noRivals: true });
  const s = playerOpens(w);
  assert.ok(s.F.every((x) => x === 0));
  const D = _internals.derived(w), li = D.lotIdx[s.lotId];
  const b = w.bld.findIndex((_, i) => w.dM[i * D.nl + li] < 100);
  assert.ok(b >= 0);
  s.status = 'open'; s.openedT = w.t;
  s.buyB[b] = 0.2 * w.bld[b].pop;
  _internals.updateFamiliarity(w, s);
  const pass = 0.03 * Math.exp(-w.dM[b * D.nl + li] / 350);
  const exp = (pass + 0.5 * 0.2) * 0.995;
  assert.ok(Math.abs(s.F[b] - exp) < 1e-12, `${s.F[b]} vs ${exp}`);
  assert.equal(s.buyB[b], 0);
  // 第二天沒人買：只剩路過與遺忘
  _internals.updateFamiliarity(w, s);
  const f2 = (exp + (1 - exp) * pass) * 0.995;
  assert.ok(Math.abs(s.F[b] - f2) < 1e-12);
});
test('§14.1 路過看到的穩態：店門口約 8 成半；路過係數 0.025→0.03、距離衰減 250→350 m（依 14.7 調過）', () => {
  const F = V.familiarity;
  assert.equal(F.decayM, 350); assert.equal(F.pass, 0.03);
  assert.ok(Math.abs(F.pass / (F.pass + F.forget) - 0.857) < 0.01);
  assert.ok(Math.abs((F.pass * Math.exp(-250 / F.decayM)) / (F.pass * Math.exp(-250 / F.decayM) + F.forget) - 0.74) < 0.01);
});
test('§14.1 序列化要包含各店的 F', () => {
  const w = baseWorld();
  const w2 = deserialize(serialize(w));
  assert.deepEqual(w2.shops[0].F, w.shops[0].F);
  assert.ok(w2.shops[0].F.some((x) => x > 0));
});
test('§14.4 開局先暖機 365 天：既有對手店的熟悉度穩定、玩家（開幕前）為 0，且暖機不動帳', () => {
  const w = baseWorld();
  const R = w.shops.filter((s) => s.owner === 'rival');
  assert.ok(R.length >= 5);
  for (const s of R) assert.ok(s.Fbar > 0.05, `${s.name} ${s.Fbar}`);
  assert.equal(w.t, 0);
  assert.equal(w.companies.daji.cash, 6000000);
  assert.equal(w.eventLog.length, 0);
  const w2 = baseWorld();
  assert.deepEqual(w2.shops.map((s) => s.F), w.shops.map((s) => s.F));
});
test('§14.5 大吉在這張地圖最多 4 家', () => {
  assert.equal(V.rivals.daji.maxShops, 4);
  const { w } = noPlayer();
  assert.ok(w.shops.filter((s) => s.company === 'daji').length <= 4);
});
test('§14.6 玩家測試店面是住宅區店面裡 600 m 內人口排中位數的那一間', () => {
  const w = baseWorld({ noRivals: true });
  const nl = w.lots.length;
  const rows = w.lots.map((l, i) => ({ id: l.id, z: l.zone, p: w.bld.reduce((a, b, bi) => a + (w.dM[bi * nl + i] <= 600 ? b.pop : 0), 0) })).filter((x) => x.z === '住宅').sort((a, b) => a.p - b.p);
  assert.equal(medianResidentialLot(w), rows[Math.floor((rows.length - 1) / 2)].id);
});
test('§13.3 距離係數 −0.50／100 m、選擇範圍 600 m', () => {
  const w = baseWorld({ noRivals: true });
  const D = _internals.derived(w);
  for (let i = 0; i < D.aM.length; i += 13) {
    const d = w.dM[i];
    if (d > 600) assert.equal(D.aM[i], 0); else assert.ok(Math.abs(D.aM[i] - Math.exp((-0.5 * d) / 100)) < 1e-12);
  }
});

test('訂價：只能在參考價 −15 到 +25 元、每格 5 元', () => {
  const w = baseWorld({ noRivals: true });
  takeLoan(w, 'start', 2000000);
  const id = openShop(w, medianResidentialLot(w)).shopId;
  assert.ok(setPrices(w, id, { 奶茶: 60 }).ok);
  assert.equal(setPrices(w, id, { 奶茶: 58 }).code, 'price');
  assert.equal(setPrices(w, id, { 奶茶: 85 }).code, 'price');
  assert.equal(setPrices(w, id, { 奶茶: 35 }).code, 'price');
  assert.equal(setPrices(w, id, { 紅豆湯: 35 }).code, 'item');
  assert.equal(setStaffing(w, id, [2, 7, 2]).code, 'staff');
  assert.ok(setStaffing(w, id, [1, 3, 6]).ok);
  assert.equal(setSocialAd(w, 11).code, 'ad');
  assert.ok(setSocialAd(w, 5).ok);
});

test('營業與裝修：裝修 28 天後開張，客人只在 10–22 點成交', () => {
  const w = baseWorld({ noRivals: true });
  takeLoan(w, 'start', 2000000);
  const rr = openShop(w, medianResidentialLot(w)); assert.ok(rr.ok);
  const s = w.shops.find((x) => x.id === rr.shopId);
  let firstOpenT = null;
  for (let i = 0; i < 40 * 24; i++) {
    const f = stepHour(w);
    const e = f.shops.find((x) => x.shopId === s.id);
    if (e.open && firstOpenT == null) firstOpenT = f.t;
    if (e.walkServed + e.deliveryServed > 0) assert.ok(f.clock.hour >= 10 && f.clock.hour < 22);
  }
  assert.ok(firstOpenT >= 28 * 24 && firstOpenT < 29 * 24 + 24);
  assert.ok(s.tot.walk + s.tot.del > 0);
});

test('事件串流：每小時有各店門市成交人數、外送單數、排隊、天氣、時鐘', () => {
  const w = baseWorld(); playerOpens(w);
  let frame;
  for (let i = 0; i < 31 * 24 + 13; i++) frame = stepHour(w);
  assert.equal(frame.clock.hour, 12);
  assert.ok(['sunny', 'cloudy', 'rain'].includes(frame.weather));
  assert.ok(frame.shops.length >= 8);
  const e = frame.shops.find((x) => x.owner === 'rival' && x.open);
  for (const k of ['walkServed', 'deliveryServed', 'walkOrders', 'deliveryOrders', 'queue', 'waitMin', 'lost', 'lotId']) assert.ok(k in e, k);
  assert.equal(e.walkFrom.reduce((a, x) => a + x[1], 0), e.walkOrders);
});

test('存檔：serialize／deserialize 後繼續跑，結果與不存檔一樣', () => {
  const a = baseWorld(); playerOpens(a); runDays(a, 20);
  const b = deserialize(serialize(a));
  runDays(a, 15); runDays(b, 15);
  assert.equal(serialize(a), serialize(b));
});

test('對手公開資訊：日銷是 ±20% 雜訊的估計值，同一天內不變，不影響模擬', () => {
  const w = baseWorld(); playerOpens(w); runDays(w, 40);
  const s = w.shops.find((x) => x.company === 'daji');
  const truth = s.days.slice(-7).reduce((a, d) => a + d.cups, 0) / 7;
  const i1 = getRivalInfo(w, s.id), i2 = getRivalInfo(w, s.id);
  assert.equal(i1.estDailyCups, i2.estDailyCups);
  assert.ok(Math.abs(i1.estDailyCups / truth - 1) <= 0.2 + 0.01);
  assert.ok('prices' in i1 && 'star' in i1 && 'reviews' in i1);
  const snap = serialize(w);
  getRivalInfo(w, s.id); getKpi(w); getReport(w); getEvents(w);
  assert.equal(serialize(w), snap);
  assert.equal(getRivalInfo(w, w.shops.find((x) => x.owner === 'player').id), null);
});

test('空店面資訊：500 m 內人口與附近飲料店數', () => {
  const w = baseWorld();
  for (const l of w.lots) {
    const i = getLotInfo(w, l.id);
    assert.ok(i.pop500 >= 0 && i.pop500 <= 20000);
    assert.ok(i.nearbyShops >= 0);
    assert.equal(i.openCost, V.startup.renovation + V.startup.equipment + V.startup.firstStock + i.deposit);
  }
  assert.equal(getLots(w).filter((l) => l.state === '對手').length, 7);
});

test('網紅、買一送一、廣告：扣款與知名度', () => {
  const w = baseWorld({ noRivals: true });
  const co = w.companies.player;
  const c0 = co.cash, k0 = co.awareness;
  assert.ok(hireInfluencer(w, 1).ok);
  assert.equal(c0 - co.cash, 30000);
  assert.ok(Math.abs(co.awareness - (k0 + 0.03)) < 1e-9);
  co.cash = 1000;
  assert.equal(hireInfluencer(w, 3).code, 'cash');
  takeLoan(w, 'start', 2000000);
  const rr = openShop(w, medianResidentialLot(w)); assert.ok(rr.ok);
  const s = w.shops.find((x) => x.id === rr.shopId);
  assert.ok(startOpeningPromo(w, s.id).ok);
  assert.equal(startOpeningPromo(w, s.id).code, 'used');
});

test('事件：颱風與寒流在 3 年內出現，回應事件生效；寒流選 A 扣 3 萬', () => {
  const w = baseWorld({ seed: 1 }); playerOpens(w);
  const seen = {};
  for (let i = 0; i < 3 * 365 * 24 - 24 && w.status === 'playing'; i++) {
    const f = stepHour(w);
    for (const ne of f.newEvents) {
      seen[ne.kind] = (seen[ne.kind] || 0) + 1;
      if (ne.needsChoice) {
        const ev = w.events.list.find((e) => e.id === ne.id);
        if (ev.kind === 'cold') { const c0 = w.companies.player.cash; const r = respondEvent(w, ev.id, 'A'); assert.ok(r.ok); assert.equal(c0 - w.companies.player.cash, 30000); assert.equal(respondEvent(w, ev.id, 'B').code, 'done'); }
        else if (ev.kind === 'typhoon') assert.ok(respondEvent(w, ev.id, 'B').ok);
        else respondEvent(w, ev.id, 'B');
      }
    }
  }
  assert.ok(seen.typhoon >= 1, JSON.stringify(seen));
  assert.ok(seen.cold >= 1, JSON.stringify(seen));
  assert.ok(seen.info >= 3);
});

test('颱風選 B：當天全面停業', () => {
  const w = baseWorld(); playerOpens(w);
  let done = false;
  for (let i = 0; i < 2 * 365 * 24 && !done; i++) {
    const f = stepHour(w);
    for (const ne of f.newEvents) if (ne.kind === 'typhoon') respondEvent(w, ne.id, 'B');
    if (w.day.typhoonDay && f.clock.hour === 14) {
      const ps = f.shops.filter((x) => x.owner === 'player' && x.status === 'open');
      if (ps.length) { assert.ok(ps.every((x) => !x.open)); done = true; }
    }
  }
  assert.ok(done, '沒遇到颱風日');
});

test('到期：近 30 天市占第一才算贏，否則輸', () => {
  const w = baseWorld({ noRivals: true });
  w.t = _internals.END_DAY * 24 - 24; // 倒數一天
  w.day = dateOf(_internals.END_DAY - 1);
  w.companies.player.day30 = [100];
  stepHour(w); // 這一步是 END_DAY - 1 的 0 點之後的一小時；再跳到 END_DAY
  w.t = _internals.END_DAY * 24;
  stepHour(w);
  assert.equal(w.status, 'won');
  assert.ok(marketShare30(w).player > 0);
});

test('金額全是整數', () => {
  const w = baseWorld(); playerOpens(w); runDays(w, 70);
  for (const c of Object.values(w.companies)) { assert.ok(Number.isInteger(c.cash), c.id); }
  for (const s of w.shops) for (const h of s.history) for (const k of ['turnover', 'profit', 'wage', 'rent', 'util', 'bizTax', 'commission']) assert.ok(Number.isInteger(h[k]), `${s.id} ${k}`);
});

// ── 規格 15.4：排隊 ──
function crowded(staff) {
  const w = baseWorld({ noRivals: true }); takeLoan(w, 'start', 2000000);
  const r = openShop(w, 'L18'); assert.ok(r.ok);
  const s = w.shops.find((x) => x.id === r.shopId);
  assert.ok(setStaffing(w, s.id, staff).ok);
  s.revCnt = 1e6; s.revSum = 4.3e6; w.companies.player.awareness = 0.6;
  for (const k of Object.keys(s.prices)) s.prices[k] -= 5; recalcShop(w, s); // 全品項降 5 元，讓日銷穩定超過 350 杯
  let cups = 0, wait = 0, n = 0;
  for (let i = 0; i < 70 * 24; i++) {
    s.F.fill(1);
    const f = stepHour(w);
    if (i < 35 * 24) continue;
    for (const e of f.shops) { if (!e.open) continue; cups += e.walkServed + e.deliveryServed; if (f.clock.hour >= 14 && f.clock.hour < 18) { wait += e.waitMin; n++; } }
  }
  return { cups: cups / 35, wait: wait / n };
}
test('§15.1 M/M/1 公式：產能 40、來 34 杯約 11.5 分鐘，來 24 杯約 5.3 分鐘；ρ ≥ 0.95 時接續且最多 45 分鐘', () => {
  const q = _internals.queueWait;
  assert.ok(Math.abs(q(34, 40) - 11.5) < 0.1, String(q(34, 40)));
  assert.ok(Math.abs(q(24, 40) - 5.3) < 0.1, String(q(24, 40)));
  assert.ok(Math.abs(q(0.95 * 40 - 1e-9, 40) - q(0.95 * 40, 40)) < 0.01);
  assert.equal(q(500, 40), 45);
  let prev = 0; for (let x = 0; x <= 80; x += 1) { const v = q(x, 40); assert.ok(v >= prev - 1e-9 && v <= 45); prev = v; }
});
let _c2, _c3;
test('§15.4 日銷 350 杯以上、班表 2／2／2 的店：14–18 時段平均等候 > 8 分鐘', () => {
  _c2 = crowded([2, 2, 2]);
  assert.ok(_c2.cups >= 350, String(_c2.cups));
  assert.ok(_c2.wait > 8, String(_c2.wait));
});
test('§15.4 同一家店 14–18 時段加到 3 人：這個時段的平均等候下降超過 40%', () => {
  _c3 = crowded([2, 3, 2]);
  const drop = 1 - _c3.wait / (_c2 ||= crowded([2, 2, 2])).wait;
  assert.ok(drop > 0.4, `${(drop * 100).toFixed(0)}%（${_c2.wait.toFixed(1)} → ${_c3.wait.toFixed(1)} 分）`);
});
test('§15.4 無玩家世界 3 年：流失客人占全部想買的人 1–6%', () => {
  const { w } = noPlayer();
  let lost = 0, arrived = 0;
  for (const s of w.shops) { lost += s.tot.lost; arrived += s.tot.walk + s.tot.del + s.tot.lost; }
  const x = lost / arrived;
  assert.ok(x >= 0.01 && x <= 0.06, `${(x * 100).toFixed(2)}%`);
});
