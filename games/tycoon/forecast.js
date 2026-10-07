// 只投影既有決策的現金收付，不前進遊戲、抽事件或預知對手行動。
import { businessOf, freshBusiness, retailBusiness, assetMonthly } from './businesses.js';
import { strategyEffects, managerOf, MANAGERS } from './strategy.js';

export function projectCash({ world, plans, dateOf, computePnL, newMTD, monthlyFixed, V, EXP, endDay }, stress = false) {
  const co = structuredClone(world.companies.player), shops = plans.map((p) => ({ ...p, shop: structuredClone(p.shop), alive: true }));
  for (const p of shops) p.shop.mtd.rentUnits ??= p.shop.rent * p.shop.mtd.rentDays;
  const exp = co.expansion, first = Math.floor(world.t / 24), firstHour = world.t % 24;
  const startDate = dateOf(first), endMonth = startDate.y * 12 + startDate.m - 1 + 6;
  const keyOf = (d) => `${d.y}-${String(d.m).padStart(2, '0')}`;
  const rows = []; let row, lowCash = co.cash, lowDate = startDate.key, firstDeficit = co.cash < 0 ? startDate.key : null;
  let adUnits = co.adDayUnits, facilityUnits = co.cm.facilityDayUnits || 0, chainUnits = co.cm.chainDayUnits || 0;
  let earlyInterest = co.cm.earlyInterest || 0;
  const wages = { ...world.wages };
  const check = (di) => { if (co.cash < lowCash) { lowCash = co.cash; lowDate = di.key; } if (co.cash < 0 && !firstDeficit) firstDeficit = di.key; row.lowCash = Math.min(row.lowCash, co.cash); };
  const pay = (amount, column, di) => { co.cash -= amount; row[column] += amount; check(di); };
  const facilityReady = (key, t) => { const f = exp?.facilities[key]; return f && (f.status === 'ready' || f.status === 'building' && f.completeAtT <= t); };
  const warehouse = exp?.facilities.warehouse;
  const useInventory = (s, nominal, di, warehouseEligible, goods = nominal) => {
    const inv = Math.min(s.inv, nominal); s.inv -= inv; let rest = nominal - inv, saving = 0;
    if (warehouseEligible && facilityReady('warehouse', di.idx * 24) && warehouse.stockValue > 0) {
      const used = Math.min(Math.max(0, goods - inv), warehouse.stockValue), cost = Math.round(warehouse.stockCost * used / warehouse.stockValue);
      warehouse.stockValue -= used; warehouse.stockCost -= cost; rest -= used; saving = used - cost;
    }
    pay(rest, 'purchases', di); return nominal - saving;
  };
  const settle = (p, di, payDate = di) => {
    const s = p.shop, m = s.mtd, pnl = computePnL(world, s, di.dim);
    const tax = pnl.bizTax, other = pnl.waste - (m.prepaidWaste || 0) + pnl.wage + pnl.rent + pnl.util + pnl.maintenance + pnl.pos + pnl.cardFee + pnl.strategyCost + pnl.managerCost;
    pay(other, 'operatingPayments', payDate); pay(tax, 'tax', payDate); co.yearProfit += pnl.profit; s.mtd = newMTD();
  };
  const finishMonth = (di, payDate = di) => {
    for (const p of shops.filter((p) => p.alive)) settle(p, di, payDate);
    const brand = Math.floor(adUnits * 10000 / di.dim) + Math.floor(facilityUnits / di.dim) + Math.floor(chainUnits / di.dim);
    pay(brand, 'operatingPayments', payDate); co.yearProfit -= brand; adUnits = facilityUnits = chainUnits = 0;
    let interest = earlyInterest; earlyInterest = 0;
    for (const l of co.loans.filter((l) => l.left > 0 && l.balance > 0)) {
      const int = Math.round(l.balance * V.loan.rate / 12), principal = Math.min(l.balance, l.left === 1 ? l.balance : l.payment - int);
      l.balance -= principal; l.left--; interest += int; pay(principal, 'principal', payDate);
    }
    pay(interest, 'interest', payDate); co.yearProfit -= interest;
    if (di.m === 12) {
      const profit = co.yearProfit; let tax = 0;
      if (profit > 0) { const used = Math.min(co.nol, profit); co.nol -= used; tax = Math.floor((profit - used) * V.tax.incomeTaxPct / 100); }
      else co.nol += -profit;
      pay(tax, 'tax', payDate); co.yearProfit = 0; for (const key of Object.keys(wages)) wages[key] = Math.round(wages[key] * V.labor.annualRaise);
    }
  };
  for (let idx = first; idx < endDay; idx++) {
    const di = dateOf(idx); if (di.y * 12 + di.m - 1 >= endMonth) break;
    if (!row || row.ym !== keyOf(di)) { row = { ym: keyOf(di), partial: idx === first && (di.d > 1 || firstHour > 0), startCash: co.cash, receipts: 0, purchases: 0, operatingPayments: 0, tax: 0, interest: 0, principal: 0, deposits: 0, recoveries: 0, endCash: co.cash, lowCash: co.cash }; rows.push(row); }
    const begun = idx === first && world.day?.idx === idx;
    // 快進可停在月初 00:00；模擬會在下一小時先付上月帳，再開始新月份。
    if (idx === first && firstHour === 0 && di.d === 1 && idx > 0 && world.day?.idx === idx - 1) finishMonth(dateOf(idx - 1), di);
    const hours = idx === first ? Math.max(0, V.time.closeHour - Math.max(V.time.openHour, firstHour)) : V.time.closeHour - V.time.openHour;
    const fraction = hours / (V.time.closeHour - V.time.openHour), t = idx * 24;
    if (!begun) {
      adUnits += co.adWan;
      for (const key of Object.keys(EXP.facilities)) if (facilityReady(key, t)) facilityUnits += EXP.facilities[key][exp.facilities[key].active ? 'monthly' : 'standby'];
      if (warehouse) {
        for (const o of warehouse.orders.filter((o) => o.arriveT <= t)) { warehouse.stockValue += o.value; warehouse.stockCost += o.cost; }
        warehouse.orders = warehouse.orders.filter((o) => o.arriveT > t);
        const supply = warehouse.stockValue + warehouse.orders.reduce((a, o) => a + o.value, 0);
        if (facilityReady('warehouse', t) && warehouse.auto && supply < warehouse.target / 2) {
          const value = Math.max(0, Math.min(Math.floor((warehouse.target - supply) / 10000), Math.floor(co.cash / (10000 * (1 - EXP.facilities.warehouse.discount))))) * 10000;
          if (value) { const cost = Math.round(value * (1 - EXP.facilities.warehouse.discount)); pay(cost, 'purchases', di); warehouse.orders.push({ value, cost, arriveT: t + EXP.facilities.warehouse.leadDays * 24 }); }
        }
      }
    }
    let factoryLeft = begun ? exp?.factoryLeft || 0 : facilityReady('factory', t) && exp.facilities.factory.active && exp.batchUntilT <= t ? EXP.facilities.factory.cupsDaily : 0;
    for (const p of shops.filter((p) => p.alive)) {
      const s = p.shop, biz = businessOf(s.businessId);
      if (s.lease && t >= s.lease.endT) {
        const plan = s.lease.plan;
        if (plan?.key === 'C') {
          settle(p, di);
          const stockRefund = retailBusiness(s.businessId) ? Math.floor(s.inv * 0.5) : 0;
          co.yearProfit -= retailBusiness(s.businessId) ? s.inv - stockRefund : 0;
          const recovery = s.deposit + Math.round((biz.equipment + (s.assetInvestment || 0)) * V.startup.equipmentRecovery) + stockRefund;
          co.cash += recovery; row.recoveries += recovery; p.alive = false; continue;
        }
        const offer = plan || p.renewal;
        // 已簽方案的押金在遊戲中已付，只計尚未決定方案的未來差額。
        if (!plan && offer) pay(offer.deposit - s.deposit, 'deposits', di);
        if (offer) { s.rent = offer.rent; s.deposit = offer.deposit; }
        s.lease.endT += (plan?.termDays || 365) * 24; s.lease.plan = null;
      }
      const m = s.mtd, open = s.status === 'open' || t >= s.openAtT;
      if (!begun && idx !== Math.floor(s.createdT / 24)) { m.rentUnits = (m.rentUnits ?? s.rent * m.rentDays) + s.rent; m.rentDays++; }
      if (!open) continue;
      if (!begun || s.status !== 'open') {
        m.openDays++; m.tradingDays++; m.maintenanceMilli = (m.maintenanceMilli || 0) + assetMonthly(s) * 1000;
        m.strategyDayUnits = (m.strategyDayUnits || 0) + strategyEffects(s).monthly; m.managerDayUnits = (m.managerDayUnits || 0) + MANAGERS[managerOf(s).tier].monthly;
      }
      const manager = managerOf(s), reserve = manager.tier !== 'none' && manager.purchasing ? manager.reserveMonths * (shops.filter((x) => x.alive).reduce((a, x) => a + monthlyFixed(world, x.shop), 0) + Math.max(0, shops.filter((x) => x.alive && (x.shop.status === 'open' || t >= x.shop.openAtT)).length - 1) * EXP.chain.managementPerShop + co.adWan * 10000 + co.loans.reduce((a, l) => a + l.payment, 0) + Object.keys(EXP.facilities).reduce((a, k) => a + (facilityReady(k, t) ? EXP.facilities[k][exp.facilities[k].active ? 'monthly' : 'standby'] : 0), 0)) : 0;
      const ramp = p.samples >= 7 ? 1 : Math.min(1, 0.6 + Math.max(0, (t - s.openAtT) / 24) / 150);
      const season = s.businessId === 'tea' ? V.demand.seasonMult[di.m - 1] / (p.samples >= 7 ? V.demand.seasonMult[startDate.m - 1] : 1) : 1;
      const factor = fraction * ramp * season * (stress ? 0.8 : 1) * (begun && s.closedToday ? 0 : 1);
      let walk = p.walk * factor, del = s.delivery ? p.del * factor : 0, qty = walk + del;
      const unit = p.unit * (stress ? 1.1 : 1), packaging = biz.packaging * (stress ? 1.1 : 1);
      if (!begun && retailBusiness(s.businessId) && s.operations.autoStock) { const buy = Math.max(0, Math.min(s.operations.stockTarget - s.inv, co.cash - reserve)); s.inv += buy; pay(buy, 'purchases', di); }
      let preparedValue = 0, preparedQty = 0;
      if (freshBusiness(s.businessId)) {
        if (begun && s.stock.day === idx) { preparedQty = s.stock.qty; preparedValue = s.stock.value; }
        else if (hours > 0) {
          preparedQty = Math.min(s.operations.prep, Math.floor((Math.max(0, co.cash - reserve) + s.inv) / unit));
          const covered = Math.min(preparedQty, factoryLeft); factoryLeft -= covered;
          preparedValue = useInventory(s, Math.round(unit * (preparedQty - EXP.facilities.factory.saving * covered)), di, true);
        }
        qty = Math.min(qty, preparedQty);
      } else if (retailBusiness(s.businessId)) qty = Math.min(qty, s.inv / (unit + packaging));
      qty = Math.min(qty, p.capacity * fraction);
      const share = walk + del > 0 ? walk / (walk + del) : 1; walk = qty * share; del = qty - walk;
      const promo = s.promo.daysLeft > Math.max(0, idx - first) ? s.promo.num / s.promo.den : 1;
      const markdown = freshBusiness(s.businessId) ? 1 - s.operations.markdown / 100 * 0.3 : 1;
      const revenue = walk * p.price * promo * markdown, gmv = del * p.plat * markdown;
      const commission = gmv * (V.delivery.commission + (co.platformBoost ? V.delivery.boostCommissionAdd : 0)) / 100;
      co.cash += revenue + gmv - commission; row.receipts += revenue + gmv - commission;
      let cogs, waste;
      if (freshBusiness(s.businessId)) {
        cogs = preparedQty ? preparedValue * qty / preparedQty : 0; waste = preparedValue - cogs;
        useInventory(s, qty * packaging, di, false); m.prepaidWaste += waste;
      } else {
        const covered = biz.factory ? Math.min(qty, factoryLeft) : 0; factoryLeft -= covered;
        const nominal = unit * (qty - EXP.facilities.factory.saving * covered);
        const actual = useInventory(s, nominal + qty * packaging, di, biz.warehouse, nominal);
        cogs = actual - qty * packaging; waste = cogs * p.wasteRate;
      }
      m.walk += walk; m.del += del; m.storeRev += revenue; m.gmv += gmv; m.commission += commission; m.cogs += cogs; m.pack += qty * packaging; m.wasteMilli += waste * 1000;
      m.wageMilli += p.dailyWage * wages[s.wageLevel] / world.wages[s.wageLevel] * fraction * 1000; check(di);
    }
    if (!begun) chainUnits += Math.max(0, shops.filter((p) => p.alive && (p.shop.status === 'open' || t >= p.shop.openAtT)).length - 1) * EXP.chain.managementPerShop;
    const last = di.d === di.dim || idx + 1 >= endDay;
    if (last) finishMonth(di);
    row.endCash = co.cash;
  }
  return { scenario: stress ? 'stress' : 'base', rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]))), lowCash: Math.round(lowCash), lowDate, firstDeficit, endCash: Math.round(co.cash) };
}
