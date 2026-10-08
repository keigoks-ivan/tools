import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, createManufacturing, manufacturingAction as ma, productionPlan, stepManufacturing as ms, manufacturingValid } from '../manufacturing.js';
import { MODELS, PROJECTS, createTechnology, technologyAction as ta, technologyMetrics, stepTechnology as ts, technologyValid } from '../technology.js';
import { END_DAY, dateOf, financeAction, cashIdentity, report, profit, payable, expense, spend, receive } from '../venture-core.js';
import { routeKey, encodeVenture, decodeVenture, loadVenture, storeVenture, MAX_BYTES } from '../venture-saves.js';

const clone = w => decodeVenture(encodeVenture(w),w.mode).world;
const run = (w,days) => { const step = w.mode==='manufacturing'?ms:ts; for(let i=0;i<days;i++) if(!step(w)) break; };
const store = () => ({ data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);} });
const equalCash = (w) => { assert.ok(Math.abs(cashIdentity(w.co.ledger,w.co.cash))<.001); for(const r of w.co.history) assert.ok(Math.abs(cashIdentity(r,r.cashEnd))<.001); };
function order(w,qty=100) {
  const id='test-'+w.seq++, price=PRODUCTS[w.productId].price, quote=qty*price, deposit=Math.round(quote*.25);
  const o={id,client:'測試採購',qty,due:w.day+20,price,term:30,expires:w.day+7,depositRate:.25,quote,deposit,produced:0,cost:0};
  w.orders.push(o);receive(w,deposit);return o;
}
const techSettings = (w,changes={}) => ({engineers:w.engineers,support:w.support,marketing:w.marketing,price:w.price,cloudTier:w.cloudTier,focus:w.focus,...changes});

for(const id of Object.keys(PRODUCTS)) test(`製造 ${id}：完整交貨、尾款、月結與續玩一致`,()=>{
  const w=createManufacturing(id),p=PRODUCTS[id],o=order(w,p.capacity*2), initial=w.co.cash;
  assert.ok(ma(w,'purchase',{qty:p.capacity*3}).ok); assert.equal(w.co.ledger.revenue,0); assert.ok(w.co.cash<initial); run(w,5);
  const saved=clone(w);run(w,65);run(saved,65);assert.deepEqual(saved,w);assert.equal(w.stats.delivered,1);assert.equal(w.receivables.length,0);assert.equal(report(w).totals.revenue,o.quote);assert.equal(w.stats.produced,o.qty);assert.ok(manufacturingValid(w));equalCash(w);
});
for(const id of Object.keys(MODELS)) test(`科技 ${id}：各自收入、成長、月結與存檔一致`,()=>{
  const w=createTechnology(id);assert.ok(ta(w,'project',{id:'retention'}).ok);run(w,40);const saved=clone(w);run(w,45);run(saved,45);assert.deepEqual(w,saved);assert.ok(technologyValid(w));assert.ok(report(w).totals.revenue>0);equalCash(w);
  if(id==='saas') { assert.ok(w.paying>0);assert.equal(w.stats.gmv,0);assert.equal(w.stats.visits,0); }
  if(id==='marketplace') { assert.equal(w.paying,0);assert.ok(Math.abs(report(w).totals.revenue-w.stats.gmv*.08)<.001); }
  if(id==='content') { assert.equal(w.paying,0);assert.ok(Math.abs(report(w).totals.revenue-w.stats.visits*w.price*MODELS[id].adCPM/1000)<.001); }
});
test('製造：採購資產、訂金責任與借款都不灌入營收／費用',()=>{
  const w=createManufacturing(),net=profit(w.co.ledger);order(w);ma(w,'purchase',{qty:1000});financeAction(w,'borrow',100000);
  assert.equal(w.co.ledger.revenue,0);assert.equal(profit(w.co.ledger),net);assert.equal(w.co.ledger.cogs,0);assert.equal(w.co.ledger.purchases,10000);assert.equal(w.co.debt,100000);equalCash(w);
});
test('製造：良品／瑕疵／原料與在製成本守恆，不超額生產',()=>{
  const w=createManufacturing(),o=order(w,200);ma(w,'purchase',{qty:500});run(w,5);
  assert.equal(w.stats.produced,200);assert.equal(w.stock.qty+w.stats.produced+w.stats.defects,500);
  assert.ok(Math.abs(w.stock.value+w.co.ledger.cogs-5000)<1e-6);assert.equal(w.co.ledger.revenue,o.quote);assert.ok(w.co.ledger.cogs>2000);
});
test('製造：無訂單不耗原料，無原料不虛構生產',()=>{
  const w=createManufacturing();ma(w,'purchase',{qty:500});run(w,5);assert.equal(w.stock.qty,500);assert.equal(w.stats.produced,0);assert.equal(w.co.ledger.cogs,0);
  const empty=createManufacturing();order(empty);run(empty,5);assert.equal(empty.stats.produced,0);assert.equal(empty.co.ledger.revenue,0);
});
test('製造：取消退訂金、違約金、在製損失只算一次',()=>{
  const w=createManufacturing(),o=order(w,500);ma(w,'purchase',{qty:200});run(w,4);const cash=w.co.cash,wip=o.cost,cogs=w.co.ledger.cogs;
  assert.ok(o.produced>0);assert.ok(ma(w,'cancel',{id:o.id}).ok);assert.equal(w.co.cash,cash-o.deposit-Math.round(o.quote*.1));assert.ok(Math.abs(w.co.ledger.cogs-cogs-wip)<1e-6);assert.equal(w.orders.length,0);assert.equal(ma(w,'cancel',{id:o.id}).ok,false);equalCash(w);
});
test('製造：逾期七天後先取消，不能先完成已取消契約',()=>{
  const w=createManufacturing(),o=order(w,100);o.due=0;ma(w,'purchase',{qty:500});w.shipments[0].arrival=8;run(w,9);
  assert.equal(w.orders.length,0);assert.equal(w.stats.delivered,0);assert.equal(w.stats.late,1);assert.equal(w.co.ledger.revenue,0);assert.equal(w.stock.qty,500);equalCash(w);
});
test('製造：排序改變先供料的訂單，不免費增加產能',()=>{
  const w=createManufacturing(),a=order(w,500),b=order(w,500);ma(w,'purchase',{qty:200});ma(w,'priority',{id:b.id});run(w,4);assert.ok(b.produced>0);assert.equal(a.produced,0);assert.ok(w.today.produced<=productionPlan(w).capacity);
});
test('製造：班制、品質、人力、供應商與維修都有取捨',()=>{
  const w=createManufacturing(),base=productionPlan(w);
  ma(w,'settings',{workers:3,shift:'overtime',qc:'standard',supplier:'economy'});assert.ok(productionPlan(w).capacity>base.capacity);assert.ok(productionPlan(w).defects>base.defects);assert.ok(productionPlan(w).fixed>base.fixed);
  const normal=productionPlan(w);ma(w,'settings',{workers:3,shift:'overtime',qc:'strict',supplier:'express'});assert.ok(productionPlan(w).capacity<normal.capacity);assert.ok(productionPlan(w).defects<normal.defects);
  ma(w,'purchase',{qty:100});assert.equal(w.shipments[0].arrival,1);assert.equal(w.shipments[0].value,1220);
  w.wear=.8;const before=w.co.cash;ma(w,'maintain');assert.equal(productionPlan(w).capacity,0);assert.ok(w.wear<.8);assert.equal(w.co.cash,before-8400);run(w,2);assert.ok(productionPlan(w).capacity>0);
});
test('製造：擴線先付款、施工完成才增產，人力不足仍受限',()=>{
  const w=createManufacturing(),old=productionPlan(w).capacity,cash=w.co.cash;assert.ok(ma(w,'expand').ok);assert.equal(w.lines,1);assert.equal(w.co.cash,cash-PRODUCTS.packaging.equipment);assert.equal(ma(w,'expand').ok,false);run(w,15);assert.equal(w.lines,2);assert.equal(productionPlan(w).capacity<=old,true);
  const before=w.co.cash;ma(w,'settings',{workers:6,shift:'normal',qc:'standard',supplier:'stable'});assert.equal(w.co.cash,before-24000);assert.ok(productionPlan(w).capacity>old);equalCash(w);
});
test('科技：價格提高收入單位但降低付費轉換、提高流失',()=>{
  const w=createTechnology(),before=technologyMetrics(w);ta(w,'settings',techSettings(w,{price:999}));const m=technologyMetrics(w);assert.ok(m.conversion<before.conversion);assert.ok(m.churn>before.churn);assert.ok(m.monthlyUnit>before.monthlyUnit);
});
test('科技：容量、客服與技術債共同影響可用率與留存',()=>{
  const w=createTechnology();w.users=3000;w.paying=500;w.techDebt=.8;const before=technologyMetrics(w);
  ta(w,'settings',techSettings(w,{cloudTier:3,support:3}));const after=technologyMetrics(w);assert.ok(after.uptime>before.uptime);assert.ok(after.churn<before.churn);assert.ok(after.fixed>before.fixed);
  const normal=clone(w);ta(w,'settings',techSettings(w,{focus:'stability'}));run(w,20);run(normal,20);assert.ok(w.techDebt<normal.techDebt);
});
test('科技：成長模式較快上線但留下技術債，專案不能疊加',()=>{
  const growth=createTechnology(),stable=clone(growth);ta(growth,'settings',techSettings(growth,{focus:'growth'}));ta(stable,'settings',techSettings(stable,{focus:'stability'}));ta(growth,'project',{id:'value'});ta(stable,'project',{id:'value'});assert.equal(ta(growth,'project',{id:'retention'}).ok,false);run(growth,42);run(stable,42);assert.equal(growth.project,null);assert.ok(stable.project);assert.ok(growth.techDebt>stable.techDebt);assert.ok(growth.quality>stable.quality);
});
test('科技：不同業態使用不同容量與客服規模，內容廣告增加也提高流失',()=>{
  const a=createTechnology('saas'),b=createTechnology('marketplace'),c=createTechnology('content');assert.ok(technologyMetrics(b).capacity>technologyMetrics(a).capacity);assert.ok(technologyMetrics(c).capacity>technologyMetrics(b).capacity);
  const before=technologyMetrics(c);ta(c,'settings',techSettings(c,{price:6}));assert.ok(technologyMetrics(c).churn>before.churn);assert.ok(technologyMetrics(c).monthlyUnit<before.monthlyUnit);
});
test('科技：有限市場與競爭令邊際獲客更貴，極限設定仍可存檔',()=>{
  for(const id of Object.keys(MODELS)) {
    const w=createTechnology(id),before=technologyMetrics(w).acquisitionCost;w.users=MODELS[id].market;w.paying=id==='saas'?w.users:0;assert.ok(technologyMetrics(w).acquisitionCost>before);ta(w,'settings',techSettings(w,{marketing:500000,cloudTier:5,engineers:12,support:20}));ts(w);assert.ok(w.users<=MODELS[id].market);assert.ok(w.paying<=w.users);assert.ok(technologyValid(w));clone(w);equalCash(w);
  }
});
test('借款與還款有額度、可救負現金；不改營收或淨利',()=>{
  const w=createTechnology(),net=profit(w.co.ledger),before=w.co.cash;
  assert.equal(financeAction(w,'borrow',w.co.capital*1.5+1).ok,false);assert.equal(financeAction(w,'borrow',1000).ok,false);assert.ok(financeAction(w,'borrow',100000).ok);assert.equal(w.co.cash,before+100000);assert.ok(financeAction(w,'repay',40000).ok);assert.equal(w.co.debt,60000);assert.equal(profit(w.co.ledger),net);equalCash(w);
  assert.equal(financeAction(w,'repay',60001).ok,false);spend(w,w.co.cash+10000);assert.ok(financeAction(w,'borrow',100000).ok);assert.ok(w.co.cash>0);
});
test('薪資月結與即付招募／專案費不重付，稅虧損與本金分開',()=>{
  const w=createTechnology();ta(w,'project',{id:'value'});ta(w,'settings',techSettings(w,{engineers:2}));const paid=w.co.ledger.paidCosts;assert.equal(paid,110000);run(w,31);assert.equal(w.co.history.length,1);const r=w.co.history[0];assert.ok(Math.abs(r.payments-(r.payroll+r.rent+r.cloud+r.marketing+r.research+r.repair+r.penalty+r.tax))<.001);assert.equal(r.tax,0);assert.ok(w.co.taxLoss>0);equalCash(w);
  const f=createManufacturing();financeAction(f,'borrow',240000);run(f,31);assert.equal(f.co.history[0].interest,1600);assert.equal(f.co.history[0].principal,10000);assert.equal(f.co.debt,230000);equalCash(f);
});
test('季事件暫停，付費降低衝擊；既有原料成本不被改價',()=>{
  const m=createManufacturing();ma(m,'purchase',{qty:1000});run(m,90);assert.ok(m.event);const before=JSON.stringify(m);assert.equal(ms(m),false);assert.equal(JSON.stringify(m),before);const value=m.stock.value;assert.ok(ma(m,'event',{choice:'buffer'}).ok);assert.equal(m.stock.value,value);assert.equal(productionPlan(m).materialCost,10.5);assert.ok(ms(m));
  const t=createTechnology();run(t,90);const old=technologyMetrics(t);assert.equal(ts(t),false);ta(t,'event',{choice:'accept'});assert.ok(technologyMetrics(t).acquisitionCost>old.acquisitionCost);assert.ok(technologyMetrics(t).uptime<old.uptime);assert.ok(ts(t));
});
test('無效操作原子拒絕，結案不可再營業',()=>{
  for(const [w,act,items] of [[createManufacturing(),ma,[['purchase',{qty:NaN}],['bid',{id:'none',factor:1}],['settings',{workers:0,shift:'normal',qc:'standard',supplier:'stable'}]]],[createTechnology(),ta,[['settings',{price:NaN}],['project',{id:'unknown'}]]]]) {
    for(const [a,d] of items) {const before=JSON.stringify(w);assert.equal(act(w,a,d).ok,false);assert.equal(JSON.stringify(w),before);}
    w.status='finished';const before=JSON.stringify(w);assert.equal(act(w,'event',{choice:'accept'}).ok,false);assert.equal(financeAction(w,'borrow',100000).ok,false);run(w,10);assert.equal(JSON.stringify(w),before);
  }
});
test('負現金不立即清除進度，七天破產；三年含閏日精確月結',()=>{
  const w=createManufacturing();spend(w,w.co.cash+1000);run(w,6);assert.equal(w.status,'playing');run(w,1);assert.equal(w.status,'bankrupt');assert.equal(w.day,7);assert.ok(manufacturingValid(w));
  const end=createManufacturing();end.day=END_DAY-1;end.co.ledger.month=dateOf(end.day).month;ms(end);assert.equal(end.status,'finished');assert.equal(end.day,1096);assert.equal(dateOf(end.day).key,'2029-10-01');assert.equal(end.co.history.length,1);equalCash(end);
});
test('三個存檔槽、備份、JSON 匯入路線彼此隔離，損壞資料不會默默覆蓋',()=>{
  const storage=store(),m=createManufacturing(),t=createTechnology();storage.setItem('tycoon.save.v1','保留舊門店');assert.ok(storeVenture(storage,m).ok);assert.ok(storeVenture(storage,t).ok);run(m,5);assert.ok(storeVenture(storage,m).ok);assert.equal(loadVenture(storage,'manufacturing').world.day,5);assert.equal(loadVenture(storage,'technology').world.day,0);assert.equal(storage.getItem('tycoon.save.v1'),'保留舊門店');assert.throws(()=>decodeVenture(encodeVenture(m),'technology'));
  storage.setItem(routeKey('manufacturing'),'broken');const recovered=loadVenture(storage,'manufacturing');assert.ok(recovered.ok);assert.ok(recovered.recovered);assert.equal(recovered.world.day,0);assert.equal(storage.getItem(routeKey('manufacturing')),'broken');storage.data.delete(routeKey('manufacturing')+'.backup');assert.equal(loadVenture(storage,'manufacturing').found,true);assert.equal(storage.getItem(routeKey('manufacturing')),'broken');
  storage.data.delete(routeKey('manufacturing'));storage.setItem(routeKey('manufacturing')+'.backup','broken-backup');assert.equal(loadVenture(storage,'manufacturing').found,true);assert.equal(loadVenture(storage,'manufacturing').raw,'broken-backup');
});
test('未知版本、結構損壞、原型、非有限數與錯誤現金对帳一律拒絕',()=>{
  for(const w of [createManufacturing(),createTechnology()]) {
    const raw=encodeVenture(w);assert.throws(()=>decodeVenture(raw.replace('"version":1','"version":99'),w.mode));assert.throws(()=>decodeVenture('x'.repeat(MAX_BYTES+1),w.mode));assert.throws(()=>decodeVenture(raw.replace('"v":1','"v":1,"__proto__":{}'),w.mode));
    for(const mutate of [x=>x.co.cash++,x=>x.day=-1,x=>x.rng=NaN,x=>x.stats={},x=>x.co.log=[{day:0,text:null}],x=>x.mode='stores',x=>x.today={}]) {const o=JSON.parse(raw);mutate(o.world);assert.throws(()=>decodeVenture(JSON.stringify(o),w.mode));}
  }
});
test('配額用盡、禁止儲存與備份不足都明確回報，保留舊進度',()=>{
  const storage=store(),w=createTechnology();storeVenture(storage,w);const old=storage.getItem(routeKey(w.mode));storage.setItem=()=>{throw new Error('quota');};run(w,1);assert.equal(storeVenture(storage,w).ok,false);assert.equal(storage.getItem(routeKey(w.mode)),old);
  const backup=store();storeVenture(backup,w);const setter=backup.setItem;backup.setItem=function(k,v){if(k.endsWith('.backup'))throw new Error('quota');setter.call(this,k,v);};run(w,1);assert.ok(storeVenture(backup,w).ok);assert.equal(loadVenture(backup,w.mode).world.day,w.day);
  assert.equal(loadVenture({getItem(){throw new Error('denied');}},w.mode).found,true);
});
test('所有六種題目經歷一年事件、月結、還款與升級均有限、可恢復',()=>{
  for(const [create,act,step,ids,valid] of [[createManufacturing,ma,ms,Object.keys(PRODUCTS),manufacturingValid],[createTechnology,ta,ts,Object.keys(MODELS),technologyValid]]) {
    for(const id of ids) {
      const w=create(id);financeAction(w,'borrow',Math.floor(w.co.capital));
      for(let i=0;i<365&&w.status==='playing';i++) {if(w.event)act(w,'event',{choice:'accept'});step(w);assert.ok(valid(w),`${id} day ${w.day}`);}
      assert.ok(valid(w));assert.deepEqual(clone(w),w);equalCash(w);
    }
  }
});
test('六種業態完整三年包含閏日，36 次月結與最後結案可恢復',()=>{
  for(const [create,act,step,ids,valid] of [[createManufacturing,ma,ms,Object.keys(PRODUCTS),manufacturingValid],[createTechnology,ta,ts,Object.keys(MODELS),technologyValid]]) {
    for(const id of ids) {
      const w=create(id);receive(w,100000000,'borrowing');w.co.debt+=100000000;
      for(let i=0;i<END_DAY;i++) {if(w.event)act(w,'event',{choice:'accept'});assert.ok(step(w));}
      assert.equal(w.status,'finished');assert.equal(w.day,END_DAY);assert.equal(w.co.history.length,36);assert.equal(report(w).rows.length,36);assert.ok(valid(w),id);assert.deepEqual(clone(w),w);equalCash(w);
    }
  }
});
