import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, createManufacturing, contractPolicy, manufacturingDeliveries, manufacturingQueue, manufacturingSchedule, manufacturingOrderPreview, manufacturingAction as action, stepManufacturing as step, manufacturingValid } from '../manufacturing.js';
import { random, receive, spend, report, cashIdentity } from '../venture-core.js';
import { encodeVenture, decodeVenture } from '../venture-saves.js';

const copy = w => decodeVenture(encodeVenture(w), 'manufacturing').world;
const supply = (w, count) => w.offers.find(o => o.profile === 'supply' && o.batchCount === count);
function checks(w) {
  assert.ok(manufacturingValid(w)); assert.ok(Math.abs(cashIdentity(w.co.ledger, w.co.cash)) < .001);
  for (const row of w.co.history) assert.ok(Math.abs(cashIdentity(row, row.cashEnd)) < .001);
  assert.deepEqual(copy(w), w);
}
function run(w, days) {
  for (let i = 0; i < days; i++) { if (w.event) action(w, 'event', { choice: 'accept' }); assert.equal(step(w), true); checks(w); }
}
function oldOrder(w) {
  const o = { id: 'slot-' + w.seq++, client: '原有客戶', qty: 100, due: 200, price: 28, term: 30, expires: 7, depositRate: .25, quote: 2800, deposit: 700, produced: 0, cost: 0 };
  receive(w, o.deposit); w.orders.push(o);
}

for (const id of Object.keys(PRODUCTS)) test(`${id} 開局保留三種短單，加上每月更新的三種供貨期`, () => {
  const w = createManufacturing(id, 41), same = createManufacturing(id, 41);
  assert.deepEqual(w, same); assert.deepEqual(w.offers.slice(0,3).map(o => o.profile), ['bulk','rush','precision']);
  assert.deepEqual(w.offers.slice(3).map(o => [o.batchCount,o.due,o.expires]), [[1,30,30],[2,60,30],[3,90,30]]);
  assert.equal(contractPolicy(w, supply(w,3)).cancelAfter, 10); assert.equal(contractPolicy(w, supply(w,3)).depositRate, .15);
  assert.equal(contractPolicy(w, supply(w,3)).term, 45); checks(w);
  const oldIds = w.offers.filter(o => o.profile === 'supply').map(o => o.id); run(w, 29);
  assert.deepEqual(w.offers.filter(o => o.profile === 'supply').map(o => o.id), oldIds); run(w, 1);
  assert.deepEqual(w.offers.filter(o => o.profile === 'supply').map(o => [o.batchCount,o.due,o.expires]), [[1,60,60],[2,90,60],[3,120,60]]);
  assert.ok(w.offers.filter(o => o.profile === 'supply').every(o => !oldIds.includes(o.id)));
  run(w, 40); assert.ok(w.offers.length <= 12); assert.ok(w.offers.filter(o => o.profile === 'supply').length <= 6); assert.ok(w.offers.filter(o => o.profile !== 'supply').length <= 6);
});

test('分批純 helper 平分整數總量，鎖價與逐批訂金保守恆，不改狀態與種子', () => {
  const w = createManufacturing(); w.day = 9; const offer = { ...supply(w,3), qty: 1001, price: 29 }, before = JSON.stringify(w);
  const deliveries = manufacturingDeliveries(w, offer, { factor: .9 });
  assert.deepEqual(deliveries.map(o => o.qty), [334,334,333]); assert.deepEqual(deliveries.map(o => o.due), [30,60,90]); assert.deepEqual(deliveries.map(o => o.releaseDay), [9,30,60]);
  assert.deepEqual(deliveries.map(o => o.batchIndex), [1,2,3]); assert.ok(deliveries.every(o => o.contractId === offer.id && o.price === 26));
  assert.equal(deliveries.reduce((n,o) => n + o.qty,0), offer.qty); assert.equal(deliveries.reduce((n,o) => n + o.quote,0), offer.qty*26);
  assert.equal(JSON.stringify(w), before); assert.deepEqual(manufacturingDeliveries(w, offer, {factor:.9}), deliveries);
  assert.equal(manufacturingDeliveries(w, w.offers[0])[0], w.offers[0]);
});

test('長約預覽將全部批次合併真正排程，逐批限制造料与合約截止日', () => {
  const w = createManufacturing(), offer = { ...supply(w,3), qty: 300 }, before = JSON.stringify(w), preview = manufacturingOrderPreview(w,offer,{factor:1.1});
  assert.equal(JSON.stringify(w), before); assert.equal(preview.deliveries.length, 3);
  assert.deepEqual(preview.deliveries.map(o => o.releaseDay), [0,30,60]); assert.deepEqual(preview.deliveries.map(o => o.finishDay), [3,30,60]);
  assert.equal(preview.finishDay, 60); assert.equal(preview.quote, offer.qty*Math.round(offer.price*1.1));
  for (const key of ['quote','deposit','requiredMaterial','materialCost','estimatedContribution','estimatedLateFee','cancellationFee']) assert.equal(preview[key],preview.deliveries.reduce((n,o)=>n+o[key],0));
  assert.equal(preview.materialGap, preview.deliveries.at(-1).materialGap);
  assert.deepEqual(manufacturingQueue(w,{offer}).map(o=>o.id), manufacturingDeliveries(w,offer).map(o=>o.id));
  assert.deepEqual(manufacturingOrderPreview(w,offer,{factor:1.1}),preview);
  w.maintenanceUntil = 50; const risky = manufacturingOrderPreview(w,offer); assert.equal(risky.finishDay,null); assert.equal(risky.deliveries[0].finishDay,null);
});

for (const id of Object.keys(PRODUCTS)) for (const count of [1,2,3]) test(`${id} ${count*30} 日合約只議價一次，按月放行並分批認列收入与尾款`, () => {
  const w = createManufacturing(id,4), offer = supply(w,count), preview = manufacturingOrderPreview(w,offer,{factor:.9}), cash = w.co.cash;
  w.rng = 0; const expectedRng = {rng:0}; random(expectedRng);
  assert.ok(action(w,'bid',{id:offer.id,factor:.9}).ok); assert.equal(w.rng,expectedRng.rng); assert.equal(w.orders.length,count); assert.equal(w.co.cash,cash+preview.deposit);
  assert.equal(w.orders.reduce((n,o)=>n+o.quote,0),preview.quote); assert.equal(w.orders.reduce((n,o)=>n+o.deposit,0),preview.deposit);
  const batches = [...w.orders], materialQty = PRODUCTS[id].lot*12, materialValue = materialQty*PRODUCTS[id].material;
  spend(w,materialValue,'purchases'); w.stock={qty:materialQty,value:materialValue,defects:.008}; checks(w);
  const saved = copy(w), delivered=[];
  for (let day=0; day<140; day++) {
    if (w.event) { action(w,'event',{choice:'accept'}); action(saved,'event',{choice:'accept'}); }
    const beforeOrders = [...w.orders], now = w.day; step(w); step(saved); assert.deepEqual(w,saved);
    for (const o of beforeOrders) if (!w.orders.some(x=>x.id===o.id)) {
      assert.ok(now>=o.releaseDay); assert.ok(now<=o.due+10); assert.equal(o.produced,o.qty);
      const receivable=w.receivables.at(-1); assert.equal(receivable.amount,o.quote-o.deposit); assert.equal(receivable.due,now+45); delivered.push(o);
    }
    for (const o of batches) if (now<o.releaseDay) assert.equal(o.produced,0,'future monthly batch must not consume production early');
    checks(w);
  }
  assert.equal(delivered.length,count); assert.equal(w.stats.delivered,count); assert.equal(w.orders.length,0); assert.equal(w.receivables.length,0);
  assert.equal(report(w).totals.revenue,preview.quote); assert.equal(w.co.history.reduce((n,row)=>n+row.receipts,0)+w.co.ledger.receipts,preview.quote);
  assert.ok(Math.abs(w.stock.value+report(w).totals.cogs-materialValue)<.001); checks(w);
});

test('未放行批次跳過供料，已可生產的短單照常製作，手動模式也相同', () => {
  for (const mode of ['due','manual']) {
    const w=createManufacturing(), offer={...supply(w,2),qty:200}; w.offers=[offer]; w.rng=0; action(w,'bid',{id:offer.id,factor:.9}); w.scheduleMode=mode;
    const first=w.orders[0], future=w.orders[1]; first.produced=first.qty; first.attempted=first.qty; first.scrapped=0; first.cost=0;
    oldOrder(w); const spot=w.orders.at(-1); spot.qty=spot.produced+100; spot.due=65;
    spend(w,2000,'purchases'); w.stock={qty:200,value:2000,defects:0}; step(w);
    assert.equal(future.produced,0); assert.equal(spot.produced,100); assert.equal(w.stats.delivered,2); checks(w);
    assert.equal(manufacturingSchedule(w).find(o=>o.id===future.id).finishDay,null);
  }
});

test('一次長約需全部在製名額，拒絕不能耗種子／詢價／訂金；未得標也不拆單', () => {
  const w=createManufacturing(), offer=supply(w,3); for(let i=0;i<10;i++)oldOrder(w);
  const before=JSON.stringify(w); assert.equal(action(w,'bid',{id:offer.id,factor:.9}).ok,false); assert.equal(JSON.stringify(w),before);
  const lose=createManufacturing(); lose.rng=1000; const o=supply(lose,3), cash=lose.co.cash; const result=action(lose,'bid',{id:o.id,factor:1.1});
  assert.equal(result.ok,true); assert.equal(lose.orders.length,0); assert.equal(lose.co.cash,cash); assert.equal(lose.stats.lostBids,1); checks(lose);
});

test('取消一批只退該批訂金與違約，其他月供批次存檔續玩不受影響', () => {
  const w=createManufacturing(), offer=supply(w,3); w.rng=0; action(w,'bid',{id:offer.id,factor:.9});
  const canceled=w.orders[1], cash=w.co.cash; assert.ok(action(w,'cancel',{id:canceled.id}).ok);
  assert.equal(w.co.cash,cash-canceled.deposit-Math.round(canceled.quote*.1)); assert.equal(w.orders.length,2); assert.ok(w.orders.every(o=>o.contractId===offer.id)); checks(w);
  const raw=JSON.stringify(w); assert.equal(action(w,'cancel',{id:canceled.id}).ok,false); assert.equal(JSON.stringify(w),raw);
});

test('長約與分批 metadata 嚴格驗證，舊式十二張短單詢價仍可載入', () => {
  const w=createManufacturing();
  for(const change of [o=>delete o.batchCount,o=>o.batchCount=0,o=>o.batchCount=4,o=>o.batchIndex=1,o=>o.contractId='partial',o=>o.releaseDay=0,o=>o.due++]) {
    const bad=copy(w); change(bad.offers.find(o=>o.profile==='supply')); assert.equal(manufacturingValid(bad),false); assert.throws(()=>copy(bad));
  }
  const accepted=copy(w), offer=supply(accepted,3); accepted.rng=0; action(accepted,'bid',{id:offer.id,factor:.9});
  for(const change of [o=>delete o.contractId,o=>delete o.batchIndex,o=>delete o.releaseDay,o=>o.batchIndex=0,o=>o.batchCount=2,o=>o.releaseDay=29,o=>o.quote++,o=>o.deposit++,o=>o.produced=1]) {
    const bad=copy(accepted); change(bad.orders[2]); assert.equal(manufacturingValid(bad),false); assert.throws(()=>copy(bad));
  }
  const tooMany=copy(w), sample=supply(tooMany,1); tooMany.offers=Array.from({length:7},(_,i)=>({...sample,id:'supply-extra-'+i})); assert.equal(manufacturingValid(tooMany),false);
  const legacy=copy(w); delete legacy.scheduleMode; legacy.offers=Array.from({length:12},(_,i)=>({...legacy.offers[0],id:'old-spot-'+i})); checks(legacy);
});
