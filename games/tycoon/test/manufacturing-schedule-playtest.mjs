// Start a web server at the repo root, then run this with Node and Playwright.
// PLAYWRIGHT_MODULE may point to a Playwright installation outside this repo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PRODUCTS, createManufacturing, productionPlan, manufacturingQueue, manufacturingSchedule, manufacturingOrderPreview, manufacturingAction, stepManufacturing } from '../manufacturing.js';
import { dateOf, receive, spend, cashIdentity } from '../venture-core.js';
import { encodeVenture, decodeVenture, routeKey } from '../venture-saves.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8129';
const browser = await chromium.launch({ headless: true });
const clone = w => JSON.parse(JSON.stringify(w));
const world = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__venture.world)));
const engineState = w => { const copy=clone(w); delete copy.learning; return copy; };
const immutable = page => page.evaluate(() => ({ world:JSON.stringify(window.__venture.world), storage:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])) }));
const money=n=>(n<0?'−':'')+'$'+(Math.abs(n)>=10000?(Math.abs(n)/10000).toLocaleString('zh-TW',{maximumFractionDigits:1})+' 萬':Math.round(Math.abs(n)).toLocaleString('zh-TW'));
function fixture(productId) {
  const w=createManufacturing(productId,1), p=PRODUCTS[productId];
  delete w.scheduleMode; // A valid save from before automatic scheduling existed.
  w.qc='strict'; w.offers=[];
  const capacity=productionPlan(w).capacity;
  function add(id,qty,due,precision=false) {
    const quote=qty*p.price, deposit=Math.round(quote*.25);
    const o={id,client:id==='long'?'長交期客戶':'眼前急交客戶',qty,due,price:p.price,term:30,expires:7,depositRate:.25,quote,deposit,produced:0,cost:0,attempted:0,scrapped:0,...(precision?{profile:'precision'}:{})};
    receive(w,deposit); w.orders.push(o);
  }
  add('long',capacity*5,20); add('urgent',Math.max(1,Math.floor(capacity*.25)),0,true);
  const qty=capacity*10, value=qty*p.material; spend(w,value,'purchases'); w.stock={qty,value,defects:0};
  w.rng=1;
  assert.equal(decodeVenture(encodeVenture(w),'manufacturing').world.orders[0].id,'long');
  return w;
}
async function sameEngine(page,expected,label) {
  assert.deepEqual(engineState(await world(page)),engineState(expected),label);
  const actual=await world(page);
  assert.ok(Math.abs(cashIdentity(actual.co.ledger,actual.co.cash))<.001,'schedule changes and production must preserve the cash identity');
}
async function displayedQueue(page,expected) {
  assert.deepEqual(await page.locator('#factory-orders [data-order]').evaluateAll(cards=>cards.map(c=>c.dataset.order)),manufacturingQueue(expected).map(o=>o.id),'visible order cards must follow the actual effective queue');
  const forecasts=manufacturingSchedule(expected);
  for(const o of expected.orders) {
    const card=page.locator(`#factory-orders [data-order="${o.id}"]`), forecast=forecasts.find(s=>s.id===o.id);
    assert.equal(await card.count(),1);
    if(forecast.finishDay!==null) assert.ok((await card.innerText()).includes(dateOf(forecast.finishDay).key),'order card ETA must use the same effective queue and inspection date');
  }
}
async function saved(page,expected) {
  const raw=await page.evaluate(key=>localStorage.getItem(key),routeKey('manufacturing'));
  assert.deepEqual(engineState(decodeVenture(raw,'manufacturing').world),engineState(expected));
}
async function reload(page,expected) {
  const before=await world(page); await page.reload(); await page.waitForFunction(()=>window.__ready && window.__venture);
  assert.deepEqual(await world(page),before,'refresh must retain mode, actual raw order list, progress, ledger and RNG');
  await sameEngine(page,expected,'reloaded schedule world must match the saved engine'); await displayedQueue(page,expected);
}
async function clickMode(page,expected,mode) {
  assert.equal(manufacturingAction(expected,'scheduling',{mode}).ok,true);
  await page.locator(`[data-action=scheduling][data-mode=${mode}]`).click();
  await sameEngine(page,expected,`${mode} selector must match the actual engine transition`); await displayedQueue(page,expected); await saved(page,expected);
}
async function day(page,expected) {
  assert.equal(stepManufacturing(expected),true);
  await page.locator('.venture-time [data-action=day]').click();
  await sameEngine(page,expected,'one UI day must honor the selected schedule and exact accounting'); await displayedQueue(page,expected);
}
async function supplyCase(productId,size) {
  const expected=createManufacturing(productId,1), offer=expected.offers.find(o=>o.profile==='supply' && o.batchCount===3);
  expected.qc='strict'; expected.rng=1;
  const qty=Math.ceil(offer.qty*1.2), value=qty*PRODUCTS[productId].material;
  spend(expected,value,'purchases'); expected.stock={qty,value,defects:0};
  decodeVenture(encodeVenture(expected),'manufacturing');
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},...(size.name==='mobile'?{isMobile:true,hasTouch:true}:{})});
  await context.addInitScript(({key,raw})=>{if(['http:','https:'].includes(location.protocol) && !localStorage.getItem(key))localStorage.setItem(key,raw);},{key:routeKey('manufacturing'),raw:encodeVenture(expected)});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  try {
    await page.goto(`${base}/games/tycoon/?mode=manufacturing&business=${productId}`);
    await page.waitForFunction(()=>window.__ready && window.__venture);
    await sameEngine(page,expected,'monthly supply fixture must load intact');
    const card=page.locator(`[data-offer="${offer.id}"]`);
    assert.equal(await card.isVisible(),true,'monthly supply board must be the default when supply inquiries exist');
    const beforeBoard=await immutable(page);
    await page.locator('[data-action=contract-board][data-board=spot]').click();assert.equal(await card.isVisible(),false);
    await page.locator('[data-action=contract-board][data-board=supply]').click();assert.equal(await card.isVisible(),true);
    assert.deepEqual(await immutable(page),beforeBoard,'switching contract boards must never bid, save, consume RNG or advance');
    await card.locator('summary').click();
    const beforePreview=await immutable(page), input=card.locator('[name=quote]');
    for(const factor of [1.1,.9]) {
      await input.focus();await input.selectOption(String(factor));
      assert.equal(await page.evaluate(()=>document.activeElement.name),'quote');
      const snapshot=JSON.stringify(expected), preview=manufacturingOrderPreview(expected,offer,{factor});
      assert.equal(JSON.stringify(expected),snapshot,'aggregate supply preview must be pure in the engine');
      assert.equal(preview.deliveries.length,3);
      const rows=card.locator('[data-contract-preview] .venture-deliveries > div');assert.equal(await rows.count(),3);
      for(let i=0;i<3;i++) {
        const d=preview.deliveries[i], text=await rows.nth(i).innerText();
        assert.ok(text.includes(dateOf(d.releaseDay).key));assert.ok(text.includes(dateOf(d.due).key));
        assert.ok(text.includes(d.qty.toLocaleString('zh-TW')));
        if(d.finishDay!==null) assert.ok(text.includes(dateOf(d.finishDay).key));
      }
      assert.ok((await card.locator('.venture-deliveries').innerText()).includes(`總訂金 ${money(preview.deposit)}`));
      assert.deepEqual(await immutable(page),beforePreview,'changing a whole-contract quote must remain a pure focused preview');
    }
    const previous=clone(expected), preview=manufacturingOrderPreview(expected,offer,{factor:.9});
    assert.equal(manufacturingAction(expected,'bid',{id:offer.id,factor:.9}).ok,true);
    assert.equal(expected.orders.length,3);assert.equal(expected.rng,(Math.imul(previous.rng,1664525)+1013904223)>>>0,'one long-contract bid must draw the RNG only once');
    await card.locator('[data-action=bid][data-factor="0.9"]').click();
    await sameEngine(page,expected,'one UI long-contract bid must create exactly three priced batches and one total deposit receipt');
    assert.equal(expected.co.cash-previous.co.cash,preview.deposit);assert.equal(expected.co.ledger.revenue,0);
    assert.equal(expected.orders.reduce((n,o)=>n+o.quote,0),preview.quote);assert.equal(expected.orders.reduce((n,o)=>n+o.qty,0),offer.qty);
    await displayedQueue(page,expected);await saved(page,expected);await reload(page,expected);
    for(const o of expected.orders) {
      const text=await page.locator(`[data-order="${o.id}"]`).innerText();assert.match(text,new RegExp(`第\\s*${o.batchIndex}[／/]${o.batchCount}\\s*批`));
      if(o.releaseDay>expected.day) assert.ok(text.includes(dateOf(o.releaseDay).key+' 開放投料'));
    }
    await day(page,expected);
    assert.ok(expected.orders.find(o=>o.batchIndex===1).produced>0);
    assert.equal(expected.orders.find(o=>o.batchIndex===2).produced,0);assert.equal(expected.orders.find(o=>o.batchIndex===3).produced,0);
    const count=30-expected.day;for(let i=0;i<count;i++)assert.equal(stepManufacturing(expected),true);
    assert.equal(await page.evaluate(n=>window.__venture.advance(n),count),count);
    await sameEngine(page,expected,'monthly cash settlement and future batch gates must match exact engine days');
    assert.equal(expected.day,30);assert.equal(expected.orders.find(o=>o.batchIndex===2).produced,0,'day 29 production cannot consume day 30 batch materials');
    assert.equal(expected.orders.find(o=>o.batchIndex===3).produced,0);assert.equal(expected.stats.delivered,1);
    await saved(page,expected);await reload(page,expected);await day(page,expected);
    assert.ok(expected.orders.find(o=>o.batchIndex===2).produced>0,'the second batch must start on its release day');
    assert.equal(expected.orders.find(o=>o.batchIndex===3).produced,0,'the third batch must keep waiting until day 60');
    await saved(page,expected);await reload(page,expected);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
    console.log(`PASS ${size.name} ${productId} 90-day supply: pure batch previews, one bid/deposit draw, saved contracts, monthly accounting and release gates`);
  } catch(error){console.error(`FAIL ${size.name} ${productId} 90-day supply`,errors);throw error;}
  finally{await context.close();}
}
try {
  for(const size of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]) {
    for(const productId of Object.keys(PRODUCTS)) {
      const expected=fixture(productId), context=await browser.newContext({viewport:{width:size.width,height:size.height},...(size.name==='mobile'?{isMobile:true,hasTouch:true}:{})});
      await context.addInitScript(({key,raw})=>{if(['http:','https:'].includes(location.protocol) && !localStorage.getItem(key))localStorage.setItem(key,raw);},{key:routeKey('manufacturing'),raw:encodeVenture(expected)});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      try {
        await page.goto(`${base}/games/tycoon/?mode=manufacturing&business=${productId}`);
        await page.waitForFunction(()=>window.__ready && window.__venture);
        assert.equal((await world(page)).scheduleMode,undefined,'loading an old save must not invent or mutate an optional saved field');
        await sameEngine(page,expected,'old save must load unchanged'); await displayedQueue(page,expected);
        assert.deepEqual(manufacturingQueue(expected).map(o=>o.id),['urgent','long']);
        assert.equal(await page.locator('[data-action=scheduling][data-mode=due]').count(),1);
        assert.equal(await page.locator('[data-action=scheduling][data-mode=manual]').count(),1);
        const untouched=await immutable(page), target=page.locator('#factory-orders [data-order=long] [data-action=priority]');
        assert.equal(await target.isDisabled(),false,'a later displayed order must allow an intentional manual insertion');
        assert.equal(await page.locator('#factory-orders [data-order=urgent] [data-action=priority]').isDisabled(),true);
        const workflow=page.locator('.venture-workflow [data-workflow=production]'), ancestors=workflow.locator('xpath=ancestor::details');
        for(let i=0;i<await ancestors.count();i++) if(await ancestors.nth(i).getAttribute('open')===null) await ancestors.nth(i).locator('summary').first().click();
        await workflow.click();
        assert.deepEqual(await immutable(page),untouched,'looking at production cannot rewrite old save order, RNG or time');
        assert.equal(manufacturingAction(expected,'priority',{id:'long'}).ok,true);
        await target.click();
        assert.equal((await world(page)).scheduleMode,'manual'); await sameEngine(page,expected,'inserting a later order must explicitly switch to manual');
        await displayedQueue(page,expected); await saved(page,expected); await reload(page,expected);
        await day(page,expected);
        assert.ok(expected.orders.find(o=>o.id==='long').produced>0);
        assert.equal(expected.orders.find(o=>o.id==='urgent').produced,0,'manual long order must take the day before the urgent one');
        const cash=expected.co.cash, rng=expected.rng, gameDay=expected.day;
        await clickMode(page,expected,'due');
        assert.equal(expected.co.cash,cash); assert.equal(expected.rng,rng); assert.equal(expected.day,gameDay);
        await reload(page,expected); await day(page,expected);
        assert.equal(expected.orders.find(o=>o.id==='urgent').produced,expected.orders.find(o=>o.id==='urgent').qty);
        assert.equal(expected.orders.find(o=>o.id==='urgent').inspectionReady,expected.day,'precision completion must reserve a separate next-day inspection');
        assert.equal(expected.stats.delivered,0,'production completion alone must not recognize precision delivery');
        await day(page,expected);
        assert.equal(expected.stats.delivered,1); assert.equal(expected.orders.some(o=>o.id==='urgent'),false);
        assert.equal(expected.receivables.length,1); assert.ok(expected.co.ledger.revenue>0);
        await clickMode(page,expected,'manual'); await reload(page,expected); await clickMode(page,expected,'due');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.equal(await page.locator('.venture-scene .route-scene-image').count(),1);
        assert.deepEqual(errors,[]);
        console.log(`PASS ${size.name} ${productId}: legacy default deadline order, manual insertion, actual production and inspection, saved modes and reload`);
      } catch(error) {console.error(`FAIL ${size.name} ${productId}`,errors);throw error;}
      finally {await context.close();}
      await supplyCase(productId,size);
    }
  }
} finally {await browser.close();}
