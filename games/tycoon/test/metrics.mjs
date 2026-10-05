// 第 11 節的量測：跑 365 天，回傳各項指標。calibrate 與 sim.test 共用。
import { baseWorld, playerOpens, runDays } from './scenario.mjs';
import { V } from '../sim.js';

export function measure(cal, { days = 365, seed = 20261001, mutate } = {}) {
  const w = baseWorld({ seed, cal });
  const p = playerOpens(w);
  if (mutate) mutate(w, p);
  runDays(w, days);
  return summarize(w, p, days);
}

export function summarize(w, p, days) {
  const popAll = w.bld.reduce((s, b) => s + b.pop, 0);
  const st = w.stats;
  const cups = st.cupsWalk + st.cupsDel;
  const shops = w.shops;
  // 每家店的營業天數（有賣的天數）
  let shopDays = 0, shopCups = 0;
  for (const s of shops) { const d = s.days.length >= 130 ? null : s.days.length; shopDays += d == null ? 0 : d; shopCups += s.tot.walk + s.tot.del; }
  // 用 history 的 tradingDays 比較準
  let tDays = 0;
  for (const s of shops) for (const h of s.history) tDays += h.tradingDays;
  for (const s of shops) tDays += s.mtd.tradingDays;
  const delShops = shops.filter((s) => s.delivery);
  const delCups = delShops.reduce((a, s) => a + s.tot.del, 0);
  const delAll = delShops.reduce((a, s) => a + s.tot.walk + s.tot.del, 0);
  const pHist = p.history.filter((h) => !h.partial);
  const pRev = pHist.reduce((a, h) => a + h.turnover, 0), pProfit = pHist.reduce((a, h) => a + h.profit, 0);
  return {
    cupsPerPersonDay: cups / (popAll * days),
    walkCapture: st.arrWalk / st.wantWalk,
    delCapture: st.ordDel / st.wantDel,
    delShare: delAll ? delCups / delAll : 0,
    avgShopDaily: cups / tDays,
    avgPrice: st.menuRev / cups,
    playerCups: p.tot.walk + p.tot.del,
    playerDaily: (p.tot.walk + p.tot.del) / Math.max(1, p.history.reduce((a, h) => a + h.tradingDays, 0) + p.mtd.tradingDays),
    playerMargin: pRev ? pProfit / pRev : 0,
    playerProfit: pProfit, playerRev: pRev,
    shopCount: shops.filter((s) => s.status !== 'closed').length,
    cash: w.companies.player.cash, status: w.status,
  };
}
