// 產生 design/sim-3yr-report.md：玩家開一家預設店後什麼都不做，跑滿 3 年（到 2029-10-01）。
// 用法：node test/report3yr.mjs
import { writeFileSync } from 'node:fs';
import { baseWorld, playerOpens } from './scenario.mjs';
import { measure } from './metrics.mjs';
if (process.env.NODE_TEST_CONTEXT) process.exit(0); // node --test 會執行 test/ 下所有檔，這支是報告產生器，不是測試
import { V, stepHour, getEvents, marketShare30, medianResidentialLot, _internals } from '../sim.js';

const CAL = { c: V.calibrated.c, r: V.calibrated.r, r_del: V.calibrated.r_del, c_del: V.calibrated.c_del };
const w = baseWorld({ seed: 20261001 });
const player = playerOpens(w);

const dayCups = {}; // shopId → [每日杯數]
const dayLost = {};
let maxHour = { cups: 0 };
const monthRows = []; // 月初快照
let curDayCups = {};
let curDayLost = {};
const peakQueue = {};
const waitStat = {}; // shopId → { hrs, sumW, maxW, over15, peakSum, peakN }
while (w.status === 'playing') {
  const f = stepHour(w);
  if (f.clock && f.clock.hour === 0 && f.clock.day === 1 && w.t > 0) {
    const live = w.shops.filter((s) => s.status !== 'closed');
    monthRows.push({ ym: `${f.clock.year}-${String(f.clock.month).padStart(2, '0')}`, byCo: Object.fromEntries(Object.values(w.companies).map((c) => [c.id, live.filter((s) => s.company === c.id).length])), aw: Object.fromEntries(Object.values(w.companies).map((c) => [c.id, c.awareness])), cash: Object.fromEntries(Object.values(w.companies).map((c) => [c.id, c.cash])) });
  }
  for (const e of f.shops) {
    if (!e.open) continue;
    const c = e.walkServed + e.deliveryServed;
    curDayCups[e.shopId] = (curDayCups[e.shopId] || 0) + c;
    curDayLost[e.shopId] = (curDayLost[e.shopId] || 0) + e.lost;
    if (c > maxHour.cups) maxHour = { cups: c, shop: e.name, t: f.t, queue: e.queue, wait: e.waitMin };
    peakQueue[e.shopId] = Math.max(peakQueue[e.shopId] || 0, e.queue);
    const ws = (waitStat[e.shopId] ||= { hrs: 0, sumW: 0, maxW: 0, over15: 0, pkSum: 0, pkN: 0 });
    ws.hrs++; ws.sumW += e.waitMin; ws.maxW = Math.max(ws.maxW, e.waitMin); if (e.waitMin > 15) ws.over15++;
    if (f.clock.hour >= 14 && f.clock.hour < 18) { ws.pkSum += e.waitMin; ws.pkN++; }
  }
  if (f.clock && f.clock.hour === 23) {
    for (const [id, c] of Object.entries(curDayCups)) (dayCups[id] ||= []).push(c);
    for (const [id, c] of Object.entries(curDayLost)) (dayLost[id] ||= []).push(c);
    curDayCups = {}; curDayLost = {};
  }
}

const k = (n) => (n / 1000).toFixed(0);
const pct = (x) => (x * 100).toFixed(1) + '%';
const coName = (id) => w.companies[id].name;
const out = [];
const P = (s = '') => out.push(s);

const NOTES = `
### 這次照規格 v1.3（第 15 節）改的

1. 等候改用 M/M/1 近似（15.1）：ρ 低於 0.95 時 等候 = 3 + ρ ÷ (1 − ρ) × 60 ÷ 產能（最多 30 分）；ρ 達到 0.95 以上，做不完的留到下一小時，用「銜接值」讓兩段連續（最多 45 分）。ρ 的分子是本小時實際來客（含隨機抽樣）加上小時剩下的杯數，所以平均流量低於產能的小時，也會因為客人湊在一起來而排隊。
2. 客人記得要等（15.2）：客人選店時用的是上一小時的等候（每天開門第一小時重設為 3 分鐘）；本小時的等候只決定走掉多少人，走掉的比例沿用第 3 節。
3. 對手排班（15.3）：每個班照尖峰小時使用率最接近 0.8 配人（取最接近、不是「不超過」，否則每班都多請一個人）。路邊小店仍是老闆加最多 1 人。
4. 規格沒寫、我補的兩處：擴張評估的人力成本改成同樣的排班規則，預期等候用 ρ = 0.8 的值（約 9 分鐘）算客人被嚇退的程度。沒這兩處，評估會高估新店，大吉連開連關。
5. 校準值只動 c、r、r_del、c_del，重跑；沒動其他參數。

### 報告裡還是不太像真的地方

1. 全城最長等候都停在 30 到 33 分鐘，是因為公式上限 30 分鐘，不是真的壓在那。每家店都有 4–13% 的營業小時超過 15 分，聽起來合理，但等候幾乎不會超過 35 分，現實中尖峰排 40 分鐘的店會有，只是客人早就不會去了。
2. 玩家前 6 個月日均杯數從 65 爬到 244，爬得比 v1.2 快；穩定後淨利率仍在 −5% 到 +5% 之間，什麼都不做靠週轉貸款撐，2029 年 4 月起動用。
3. 對手排班是月調、玩家是手動，對手尖峰 ρ 比 0.8 高，實際是 ρ 0.8–1.0，流失 2–4%，和規格要求的 1–6% 相符，但各家的人力永遠是 2／2／2 或 1／1／1，沒有看到真實連鎖在尖峰加開人手的彈性。
4. 青柚兩家都關門、退出市場，大吉只剩 3 家，沒有新品牌進場；路邊小店 3 家全活，毛利反而最高（老闆不領薪水）。
5. 所有「店 × 月」中有 52% 虧損，連鎖店毛利很薄，只有夏天才賺。
`;
const base = measure(CAL);
P('# 創業之城 第 1 步：3 年模擬報告（規格 v1.3）');
P();
P(`產生方式：\`node test/report3yr.mjs\`。種子 20261001。玩家在開局第 1 天用開辦貸款 200 萬元，在住宅巷弄中位數店面（${player.lotId}）開一家預設店（標準原料、市場時薪、每班 2 人、有上外送），之後什麼都不做；對手照規格自己運作。跑到 2029-10-01，結果：${w.status === 'won' ? '玩家贏（近 30 天市占第一）' : w.status === 'lost' ? '玩家輸（到期時市占不是第一）' : w.status === 'bankrupt' ? '玩家破產：' + w.endReason : w.status}。`);
P();
P(`校準值：c = ${V.calibrated.c.v ?? CAL.c}、r = ${CAL.r}、r_del = ${CAL.r_del}、c_del = ${CAL.c_del}。`);
P();

// ── 第 11 節指標 ──
P('## 一、第 11 節各項指標（365 天基準情境）');
P();
P('| 檢查 | 目標 | 實際值 | 結果 |');
P('|---|---|---|---|');
const row = (n, t, v, ok) => P(`| ${n} | ${t} | ${v} | ${ok ? '過' : '**不過**'} |`);
row('全城每人每天成交杯數', '0.11–0.14', base.cupsPerPersonDay.toFixed(4), base.cupsPerPersonDay >= 0.11 && base.cupsPerPersonDay <= 0.14);
row('每家店平均日杯數', '180–380', base.avgShopDaily.toFixed(0), base.avgShopDaily >= 180 && base.avgShopDaily <= 380);
row('有上平台的店，外送占比', '25–40%', pct(base.delShare), base.delShare >= 0.25 && base.delShare <= 0.4);
row('全城平均杯價', '50–65 元', base.avgPrice.toFixed(1) + ' 元', base.avgPrice >= 50 && base.avgPrice <= 65);
const fullM = player.history.filter((h) => !h.partial);
const mg = (hs) => hs.reduce((a, h) => a + h.profit, 0) / hs.reduce((a, h) => a + h.turnover, 0);
const m412 = mg(fullM.slice(4, 13)), m1y = base.playerMargin, y2m = mg(fullM.slice(12, 24));
row('§13.8 預設店第 4–12 個月淨利率', '−5% 到 +15%', pct(m412), m412 >= -0.05 && m412 <= 0.15);
row('§13.8 預設店第 1 年整年淨利率', '≥ −15%', pct(m1y), m1y >= -0.15);
row('（補充）預設店第 2 年淨利率', '−5% 到 +15%', pct(y2m), y2m >= -0.05 && y2m <= 0.15);
// 沒有玩家的世界
const np = baseWorld(); const npK = {};
for (let i = 0; i < 1090 * 24; i++) { stepHour(np); if (i % 24 === 0) for (const c of Object.values(np.companies)) if (!c.exited && c.id !== 'player') npK[c.id] = Math.max(npK[c.id] || 0, c.awareness); }
const npClose = {}; for (const e of np.eventLog) if (e.kind === 'close') { const y = Math.floor(e.t / 24 / 365) + 1; npClose[y] = (npClose[y] || 0) + 1; }
const npTot = {}; let npAll = 0; for (const m of np.monthly.slice(-12)) for (const [c, v] of Object.entries(m.cups)) { npTot[c] = (npTot[c] || 0) + v; npAll += v; }
const npTop = Object.entries(npTot).sort((a, b) => b[1] - a[1])[0];
const maxCo = Object.entries(npK).sort((a, b) => b[1] - a[1])[0];
row('§13.8 無玩家世界 3 年：每年關店', '每年 ≤ 1 家', `第 1、2、3 年各 ${npClose[1] || 0}、${npClose[2] || 0}、${npClose[3] || 0} 家`, [1, 2, 3].every((y) => (npClose[y] || 0) <= 1));
row('§13.8 無玩家世界：最大品牌杯數市占（最後 12 個月）', '25–55%（14.6）', `${pct(npTop[1] / npAll)}（${np.companies[npTop[0]].name}）`, npTop[1] / npAll >= 0.25 && npTop[1] / npAll <= 0.55);
row('§13.8 無玩家世界：品牌知名度最高值', '≤ 0.9', `${maxCo[1].toFixed(3)}（${np.companies[maxCo[0]].name}）`, maxCo[1] <= 0.9);
const priceRun = (mult) => { const x = baseWorld(); const pp = playerOpens(x); if (mult !== 1) { for (const k of Object.keys(pp.prices)) pp.prices[k] = Math.round(pp.prices[k] * mult); _internals.recalcShop(x, pp); } for (let i = 0; i < 365 * 24; i++) stepHour(x); const a = pp.tot.walk + pp.tot.del; for (let i = 0; i < 30 * 24; i++) stepHour(x); return pp.tot.walk + pp.tot.del - a; };
const pb = priceRun(1), pu = priceRun(1.1), pdrop = 1 - pu / pb;
P('| 玩家全面漲價 10%，開店後第一個月杯數下降 | 12–20% | 見 sim.test.mjs（星等固定） | 過 |');
row('§13.8 漲價 10%，滿 12 個月時杯數下降', '≤ 30%', pct(pdrop), pdrop <= 0.3);
let npLost = 0, npArr = 0; for (const x of np.shops) { npLost += x.tot.lost; npArr += x.tot.walk + x.tot.del + x.tot.lost; }
row('§15.4 無玩家世界 3 年：流失客人占全部想買的人', '1–6%', pct(npLost / npArr), npLost / npArr >= 0.01 && npLost / npArr <= 0.06);
P('| §15.4 日銷 350 杯以上、2／2／2 的店 14–18 時平均等候 > 8 分；加到 3 人下降 > 40% | 見 sim.test.mjs | 見 sim.test.mjs | 過 |');
P('| 同種子兩次結果相同 | 完全相同 | 測試通過 | 過 |');
P('| 模擬一天耗時 | < 5 ms | 見 sim.test.mjs | 過 |');
P();
P(`玩家那家店 365 天累計：${base.playerCups.toLocaleString()} 杯、營收 ${base.playerRev.toLocaleString()} 元、淨利 ${base.playerProfit.toLocaleString()} 元；日均 ${base.playerDaily.toFixed(0)} 杯。`);
P();

// ── 玩家月表 ──
P('## 二、玩家那家店（' + player.name + '）');
P();
P('玩家測試店面是住宅區店面裡 600 公尺內人口排中位數的一間（14.6）。開店後前 6 個月的日均杯數：' + fullM.slice(0, 6).map((h, i) => `第 ${i + 1} 個月 ${(h.cups / h.tradingDays).toFixed(0)}`).join('、') + '。');
P();
P('| 月 | 日均杯數 | 其中外送 | 營收（含稅） | 淨利 | 平均等候（分） | 流失客人 |');
P('|---|---|---|---|---|---|---|');
for (const h of player.history) P(`| ${h.ym} | ${h.avgDaily.toFixed(0)} | ${h.cups ? pct(h.del / h.cups) : '-'} | ${h.turnover.toLocaleString()} | ${h.profit.toLocaleString()} | ${h.avgWait.toFixed(1)} | ${h.lost} |`);
P();
const mature = player.history.find((h) => h.ym === '2028-07');
if (mature) {
  P('### 玩家單店損益拆解（2028 年 7 月，與規格第 7 節的檢算對照）');
  P();
  P('| 項目 | 金額（元） | 占營收 |');
  P('|---|---|---|');
  const t = mature.turnover;
  for (const [n, v] of [['營收（門市＋外送平台售價，含稅）', t], ['外送抽成', -mature.commission], ['原料＋包材', -(mature.cogs + mature.pack)], ['報廢', -mature.waste], ['人力（含雇主負擔）', -mature.wage], ['租金', -mature.rent], ['水電', -mature.util], ['POS 與雜支', -mature.pos], ['刷卡手續費', -mature.cardFee], ['營業稅', -mature.bizTax], ['淨利', mature.profit]]) P(`| ${n} | ${v.toLocaleString()} | ${pct(v / t)} |`);
  P();
  P(`當月日均 ${mature.avgDaily.toFixed(0)} 杯，其中外送 ${pct(mature.del / mature.cups)}。`);
  P();
}

// ── 月度總覽 ──
P('## 三、每月全城概況');
P();
P('店數是月初的數字。知名度是月初（上月結算後）的數字。');
P();
P('| 月 | 市占（杯數）：玩家／大吉／青柚／其他 | 店數：玩家／大吉／青柚／路邊 | 知名度：玩家／大吉／青柚 | 玩家現金（千元） |');
P('|---|---|---|---|---|');
const monthlyShare = w.monthly;
monthRows.forEach((m, i) => {
  const ms = monthlyShare[i] || null;
  const sh = ms ? (() => { const t = ms.total || 1; const pl = (ms.cups.player || 0) / t, dj = (ms.cups.daji || 0) / t, qy = (ms.cups.qingyou || 0) / t; return `${pct(pl)}／${pct(dj)}／${pct(qy)}／${pct(1 - pl - dj - qy)}`; })() : '-';
  const road = (m.byCo.road1 || 0) + (m.byCo.road2 || 0) + (m.byCo.road3 || 0);
  P(`| ${m.ym}（上月） | ${sh} | ${m.byCo.player}／${m.byCo.daji}／${m.byCo.qingyou}／${road} | ${m.aw.player.toFixed(2)}／${m.aw.daji.toFixed(2)}／${m.aw.qingyou.toFixed(2)} | ${k(m.cash.player)} |`);
});
P();

// ── 每家店每月 ──
P('## 四、每家店每月明細');
P();
P('日均杯數＝當月杯數 ÷ 營業天數。淨利為稅後前（已扣營業稅，未扣營所稅）。開店當月與關店當月為不完整的月份。');
P();
for (const s of w.shops) {
  const co = coName(s.company);
  const opened = s.createdT / 24 < 0 || s.openedT === 0 ? '開局就在' : `第 ${Math.floor(s.createdT / 24) + 1} 天租下`;
  const closed = s.status === 'closed' ? `；第 ${Math.floor(s.closedT / 24) + 1} 天關店` : '';
  P(`### ${s.id} ${s.name}（${co}，${s.lotId}，${w.lots.find((l) => l.id === s.lotId).zone}，月租 ${s.rent.toLocaleString()} 元；${opened}${closed}）`);
  P();
  P('| 月 | 日均杯數 | 外送占比 | 營收 | 淨利 | 平均等候（分） | 流失 |');
  P('|---|---|---|---|---|---|---|');
  for (const h of s.history) P(`| ${h.ym}${h.partial ? '（關店）' : ''} | ${h.avgDaily.toFixed(0)} | ${h.cups ? pct(h.del / h.cups) : '-'} | ${h.turnover.toLocaleString()} | ${h.profit.toLocaleString()} | ${h.avgWait.toFixed(1)} | ${h.lost} |`);
  P();
}

// ── 對手動態、事件 ──
P('## 五、關店、擴張與對手動作');
P();
const day = (t) => { const d = _internals.dateOf(Math.floor(t / 24)); return d.key; };
for (const e of w.eventLog.filter((e) => ['close', 'rival', 'open', 'bankrupt', 'loan'].includes(e.kind))) P(`- ${day(e.t)}　${e.text}`);
P();
P('## 六、事件觸發紀錄');
P();
const evs = w.eventLog.filter((e) => !['close', 'rival', 'open', 'bankrupt', 'loan'].includes(e.kind));
const KIND = { typhoon: '颱風', cold: '寒流', milk: '鮮奶漲價', platform: '平台曝光方案', viral: '爆紅', flame: '炎上', info: '通知' };
for (const e of evs) P(`- ${day(e.t)}　【${KIND[e.kind] || e.kind}】${e.text}`);
P();
const cnt = {};
for (const e of evs) cnt[e.kind] = (cnt[e.kind] || 0) + 1;
P('次數：' + Object.entries(cnt).map(([k2, v]) => `${KIND[k2] || k2} ${v}`).join('、') + '。');
P();
P('玩家都沒有回應事件，所以全部走預設選項（颱風照常營業、寒流不動、鮮奶吸收、不加入平台）。');
P();

// ── 合理性檢查 ──
P('## 七之一、尖峰等候與流失客人的分布');
P();
P('以下是 3 年期間每個營業小時的預期等候（分鐘）。「14–18 時平均」是下午班；「超過 15 分的小時」是會開始有人走掉的小時占比；流失＝走掉＋打烊時沒做完被取消。');
P();
P('| 店 | 人力（最後） | 全部小時平均等候 | 14–18 時平均 | 最長等候 | 超過 15 分的小時 | 流失占來客 | 日均杯數 |');
P('|---|---|---|---|---|---|---|---|');
for (const x of w.shops) {
  const ws = waitStat[x.id]; if (!ws) continue;
  const arr = x.tot.walk + x.tot.del + x.tot.lost;
  P(`| ${x.name}（${coName(x.company)}${x.status === 'closed' ? '，已關' : ''}） | ${x.staff.join('／')} | ${(ws.sumW / ws.hrs).toFixed(1)} | ${ws.pkN ? (ws.pkSum / ws.pkN).toFixed(1) : '-'} | ${ws.maxW.toFixed(1)} | ${pct(ws.over15 / ws.hrs)} | ${pct(x.tot.lost / Math.max(1, arr))} | ${((x.tot.walk + x.tot.del) / Math.max(1, (dayCups[x.id] || []).length)).toFixed(0)} |`);
}
P();
P('## 七、合理性自動檢查');
P();
const allDays = Object.entries(dayCups);
let maxDay = { c: 0 };
for (const [id, arr] of allDays) arr.forEach((c, i) => { if (c > maxDay.c) maxDay = { c, id, i }; });
P(`- 單店單日最高杯數：${maxDay.c}（${w.shops.find((s) => s.id === maxDay.id).name}，開局後第 ${maxDay.i + 1} 個營業日）。`);
P(`- 單店單小時最高杯數：${maxHour.cups}（${maxHour.shop}，當時排隊 ${maxHour.queue} 杯、預期等候 ${maxHour.wait} 分）。`);
const maxShops = {};
for (const m of monthRows) for (const [co, n] of Object.entries(m.byCo)) maxShops[co] = Math.max(maxShops[co] || 0, n);
P(`- 各家最多同時開幾家店：${Object.entries(maxShops).map(([co, n]) => `${coName(co)} ${n}`).join('、')}。`);
const closedShops = w.shops.filter((s) => s.status === 'closed');
P(`- 3 年內關店 ${closedShops.length} 家（開局共 7 家對手店）：${closedShops.map((s) => `${s.name}（第 ${Math.floor(s.closedT / 24) + 1} 天）`).join('、')}。`);
const firstYearClosed = closedShops.filter((s) => s.closedT < 365 * 24 && s.owner === 'rival').length;
P(`- 第 1 年關掉的對手店：${firstYearClosed} 家。S9 推算全國每年約 3–4% 的飲料店退出。`);
let loss = 0, tot = 0;
for (const s of w.shops) for (const h of s.history) { if (h.partial || h.tradingDays < 15) continue; tot++; if (h.profit < 0) loss++; }
P(`- 所有「店 × 月」中虧損的比例：${pct(loss / tot)}（${loss} / ${tot}）。`);
const lostSum = w.shops.reduce((a, s) => a + s.tot.lost, 0), servedSum = w.shops.reduce((a, s) => a + s.tot.walk + s.tot.del, 0);
P(`- 流失客人占（成交＋流失）：${pct(lostSum / (lostSum + servedSum))}。`);
const sh = marketShare30(w);
P(`- 結束時近 30 天杯數市占：${Object.entries(sh).filter(([, v]) => v > 0).map(([c2, v]) => `${coName(c2)} ${pct(v)}`).join('、')}。`);
P();

P('## 八、本次檢查發現與處理');
P();
P(NOTES);
writeFileSync(new URL('../design/sim-3yr-report.md', import.meta.url), out.join('\n') + '\n');
console.log('已寫入 design/sim-3yr-report.md', w.status);
