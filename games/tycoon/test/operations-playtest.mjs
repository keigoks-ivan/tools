// Start a web server at the repo root, then run this with Node and Playwright.
// PLAYWRIGHT_MODULE may point to a Playwright installation outside this repo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { manufacturingAction, manufacturingOrderPreview, stepManufacturing } from '../manufacturing.js';
import { technologyAction, technologyMetrics, technologyProjectPlan, stepTechnology } from '../technology.js';
import { manufacturingDraft, technologyDraft, manufacturingProcurement } from '../venture-planner.js';
import { ventureCoach } from '../venture-coach.js';
import { decodeVenture, routeKey } from '../venture-saves.js';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8129';
const browser = await chromium.launch({ headless: true });
const routes = [
  ['manufacturing', 'packaging'], ['manufacturing', 'apparel'], ['manufacturing', 'electronics'],
  ['technology', 'saas'], ['technology', 'marketplace'], ['technology', 'content'],
];
const money = n => (n < 0 ? '−' : '') + '$' + (Math.abs(n) >= 10000 ? (Math.abs(n) / 10000).toLocaleString('zh-TW', { maximumFractionDigits: 1 }) + ' 萬' : Math.round(Math.abs(n)).toLocaleString('zh-TW'));
const unitMoney = n => '$' + n.toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const percent = n => (n * 100).toFixed(1) + '%';
const number = n => Math.round(n).toLocaleString('zh-TW');
const clone = w => JSON.parse(JSON.stringify(w));
const engineState = w => { const copy = clone(w); delete copy.learning; return copy; };
const world = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__venture.world)));
const immutableState = page => page.evaluate(() => ({ world: JSON.stringify(window.__venture.world), storage: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])) }));
const state = page => page.evaluate(() => window.__venture.state);
async function pure(page, before, label) { assert.deepEqual(await immutableState(page), before, label); }
async function sameEngine(page, expected, label) { assert.deepEqual(engineState(await world(page)), engineState(expected), label); }
async function previewRows(page, selector) {
  return page.locator(selector).evaluate(e => Object.fromEntries([...e.querySelectorAll('dt')].map(dt => [dt.textContent, [...dt.nextElementSibling.children].map(c => c.textContent).filter(Boolean).join('|') || dt.nextElementSibling.textContent])));
}
async function reveal(page,selector) {
  const target=page.locator(selector), panel=await target.evaluate(e=>e.closest('[data-operation-panel]')?.dataset.operationPanel);
  if(panel && await target.evaluate(e=>e.closest('[data-operation-panel]').hidden)) await page.locator(`[data-action=operation-panel][data-panel=${panel.split(/\s+/)[0]}]`).click();
  const board=await target.evaluate(e=>e.closest('[data-offer-board]')?.dataset.offerBoard);
  if(board && await target.evaluate(e=>e.closest('[data-offer-board]').hidden)) await page.locator(`[data-action=contract-board][data-board=${board}]`).click();
  const details=target.locator('xpath=ancestor-or-self::details');
  for(let i=0;i<await details.count();i++) if(await details.nth(i).getAttribute('open')===null) await details.nth(i).locator('summary').first().click();
}
async function panelVisibility(page,mode) {
  const buttons=page.locator('[data-action=operation-panel]');
  assert.equal(await buttons.count(),3);
  assert.deepEqual(await buttons.evaluateAll(items=>items.map(e=>e.dataset.panel)),mode==='manufacturing'?['orders','production','cash']:['growth','product','cash']);
  if(mode==='manufacturing') {
    assert.equal(await page.locator('#factory-orders').isVisible(),true);
    assert.equal(await page.locator('[data-form=manufacturing]').isVisible(),false,'inactive production form must remain visually inaccessible');
    await page.locator('[data-action=operation-panel][data-panel=production]').click();
    assert.equal(await page.locator('[data-form=manufacturing]').isVisible(),true);
    assert.equal(await page.locator('#factory-orders').isVisible(),false);
    await page.locator('[data-action=operation-panel][data-panel=orders]').click();
  } else {
    assert.equal(await page.locator('[data-form=technology]').isVisible(),true);
    assert.equal(await page.locator('[data-form=technology] [name=price]').isVisible(),true);
    assert.equal(await page.locator('[data-form=technology] [name=cloudTier]').isVisible(),false,'capacity control must be clustered in the product panel');
    assert.equal(await page.locator('#product-projects').isVisible(),false,'inactive project workboard must remain visually inaccessible');
    await page.locator('[data-action=operation-panel][data-panel=product]').click();
    assert.equal(await page.locator('#product-projects').isVisible(),true);
    assert.equal(await page.locator('[data-form=technology]').isVisible(),true,'one draft form must stay shared by the growth and product panels');
    assert.equal(await page.locator('[data-form=technology] [name=price]').isVisible(),false);
    assert.equal(await page.locator('[data-form=technology] [name=cloudTier]').isVisible(),true);
    await page.locator('[data-action=operation-panel][data-panel=growth]').click();
  }
}
async function visibleTarget(page, selector, field) {
  assert.equal(await page.locator(selector).evaluate(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), true, `${selector} must be visible after its navigation button`);
  assert.equal(await page.locator(selector).evaluate(e=>!e.closest('[data-operation-panel]')?.hidden),true,'workflow must reveal the panel holding its destination');
  if (field) assert.equal(await page.evaluate(() => document.activeElement.name), field, 'navigation must focus the named control');
}
async function navigation(page, mode) {
  const before = await immutableState(page), buttons = page.locator('.venture-workflow [data-workflow]');
  assert.equal(await buttons.count(), 4);
  const expected = mode === 'manufacturing' ? ['orders','materials','production','cash'] : ['customers','product','growth','service'];
  assert.deepEqual(await buttons.evaluateAll(items => items.map(e => e.dataset.workflow)), expected);
  for (let i = 0; i < 4; i++) {
    await reveal(page,`.venture-workflow [data-workflow=${expected[i]}]`);
    const b = buttons.nth(i), destination = await b.evaluate(e => ({ target: e.dataset.target, field: e.dataset.field }));
    await b.click(); await visibleTarget(page, destination.target, destination.field);
    await pure(page, before, 'workflow navigation cannot spend, draw RNG, save or advance');
  }
  const w = await world(page), issue = ventureCoach(w).bottleneck.id;
  const targets = mode === 'manufacturing' ? { orders: '#factory-opportunities', materials: '[data-form=purchase]', delivery: '#factory-orders', staffing: '[data-form=manufacturing]', quality: '#production-choices' } : { reliability: '[data-form=technology]', support: '[data-form=technology]', liquidity: '#strategy-choices', retention: '#product-projects', value: '#product-projects', acquisition: '[data-form=technology]' };
  const objective = page.locator('.venture-objective button'), destination = await objective.evaluate(e => ({ target: e.dataset.target, field: e.dataset.field }));
  assert.equal(destination.target, targets[issue] || (mode === 'manufacturing' ? '#factory-opportunities' : '[data-form=technology]'));
  await objective.click(); await visibleTarget(page, destination.target, destination.field);
  await pure(page, before, 'objective navigation must preserve the simulation and save');
}
async function fillDraft(page, mode, business) {
  await reveal(page,`[data-form=${mode}]`);
  const w = await world(page), before = await immutableState(page), form = page.locator(`[data-form=${mode}]`);
  const data = mode === 'manufacturing' ? { workers: 4, shift: 'overtime', qc: 'strict', supplier: 'express' } : { price: business === 'saas' ? 599 : business === 'marketplace' ? 9 : 3, marketing: 22000, engineers: 2, support: 2, cloudTier: 1, focus: 'growth' };
  for (const [key, value] of Object.entries(data)) {
    await reveal(page,`[data-form=${mode}] [name=${key}]`);
    const control = form.locator(`[name=${key}]`);
    if (await control.evaluate(e => e.tagName === 'SELECT')) { await control.focus(); await control.selectOption(String(value)); }
    else await control.fill(String(value));
    assert.equal(await page.evaluate(() => document.activeElement.name), key, 'live preview must keep the edited field focused');
    assert.equal(await control.inputValue(), String(value), 'live preview must keep the current draft');
    await pure(page, before, 'editing a draft cannot alter world, RNG, day or any localStorage key');
  }
  for(const [key,value] of Object.entries(data)) assert.equal(await form.locator(`[name=${key}]`).inputValue(),String(value),'switching variable clusters must preserve every unsubmitted draft field');
  await page.waitForTimeout(350);
  await pure(page, before, 'a paused draft must remain unchanged after a timer interval');
  const plan = mode === 'manufacturing' ? manufacturingDraft(w,data) : technologyDraft(w,data);
  assert.equal(plan.ok, true); assert.equal(plan.canApply, true);
  const rows = await previewRows(page, `[data-form=${mode}] [data-settings-preview]`);
  assert.equal(rows['套用時立即付現'], money(plan.hiring));
  assert.equal(rows['付招募費後現金'], money(plan.cashAfterHiring));
  if (mode === 'manufacturing') {
    assert.equal(rows['日良品能力'], `${number(plan.before.goodCapacity)} 件|${number(plan.after.goodCapacity)} 件`);
    assert.equal(rows['目前庫存料瑕疵'], `${percent(plan.before.defects)}|${percent(plan.after.defects)}`);
    assert.equal(rows['新到料估計瑕疵'], `${percent(plan.before.newMaterialDefects)}|${percent(plan.after.newMaterialDefects)}`);
    assert.equal(rows['固定月成本'], `${money(plan.before.fixedMonthly)}|${money(plan.after.fixedMonthly)}`);
    assert.equal(rows['新採購料價／份'], `${unitMoney(plan.before.newMaterialUnitCost)}|${unitMoney(plan.after.newMaterialUnitCost)}`);
  } else {
    assert.equal(rows['同客數月收入'], `${money(plan.before.monthlyRevenue)}|${money(plan.after.monthlyRevenue)}`);
    assert.equal(rows['同客數月總成本'], `${money(plan.before.monthlyCost)}|${money(plan.after.monthlyCost)}`);
    assert.equal(rows['同客數稅前結果'], `${money(plan.before.monthlyResult)}|${money(plan.after.monthlyResult)}`);
    assert.equal(rows['估計月流失'], `${percent(plan.before.churn)}|${percent(plan.after.churn)}`);
    assert.equal(rows['研發速度（每人）'], `${percent(1-plan.before.maintenanceShare*.7)}|${percent(1-plan.after.maintenanceShare*.7)}`);
    if (business==='saas') assert.equal(rows['新客付費轉換'],`${percent(plan.before.conversion)}|${percent(plan.after.conversion)}`);
    else if (business==='marketplace') assert.equal(rows['同客數月成交'],`${number(plan.before.transactionsMonthly)}|${number(plan.after.transactionsMonthly)}`);
    else assert.equal(rows['同客數月瀏覽'],`${number(plan.before.visitsMonthly)}|${number(plan.after.visitsMonthly)}`);
  }
  const expected = clone(w), action = mode === 'manufacturing' ? manufacturingAction : technologyAction;
  const settings = mode === 'manufacturing' ? { ...data, productionMode: w.productionMode || 'balanced' } : data;
  assert.equal(action(expected,'settings',settings).ok, true);
  await form.locator('button[type=submit]').click();
  await sameEngine(page,expected,'settings submission must match actual engine hiring costs and fields');
  const actual = await world(page);
  assert.equal(actual.co.cash,w.co.cash-plan.hiring); assert.equal(actual.day,w.day); assert.equal(actual.rng,w.rng);
  assert.equal(actual.co.ledger.research,w.co.ledger.research+plan.hiring);
  assert.equal(actual.co.ledger.payments,w.co.ledger.payments+plan.hiring);
  assert.ok(actual.learning?.length > 0,'applying a real decision must retain its observation baseline');
}
async function factory(page) {
  // Fix only this isolated browser's RNG so the UI low-price bid certainly wins.
  await page.evaluate(() => { window.__venture.world.rng=1; });
  let w = await world(page); const offer = w.offers[0], beforeQuote = await immutableState(page), quote = page.locator(`[data-offer="${offer.id}"] [name=quote]`);
  await reveal(page,`[data-offer="${offer.id}"] [name=quote]`);
  await quote.focus(); await quote.selectOption('0.9');
  assert.equal(await page.evaluate(() => document.activeElement.name),'quote');
  await pure(page,beforeQuote,'quote preview cannot consume a bid or change the game');
  const preview = manufacturingOrderPreview(w,offer,{factor:.9}), cells = await previewRows(page,`[data-offer="${offer.id}"] [data-contract-preview]`);
  assert.equal(cells['得標機會估計'],percent(preview.acceptanceChance));
  const expected = clone(w); assert.equal(manufacturingAction(expected,'bid',{id:offer.id,factor:.9}).ok,true);
  assert.equal(expected.orders.length,1,'seeded low-price bid must win in the engine');
  await page.locator(`[data-offer="${offer.id}"] [data-action=bid][data-factor="0.9"]`).click();
  await sameEngine(page,expected,'UI bid must create the exact priced order and deposit');
  w=await world(page); assert.equal(w.co.ledger.revenue,0,'an unfulfilled deposit is not revenue');
  const supply=manufacturingProcurement(w), beforeFill=await immutableState(page);
  await reveal(page,'[data-action=fill-materials]');
  await page.locator('[data-action=fill-materials]').click();
  await pure(page,beforeFill,'fill-materials must only prefill; it must never buy or save');
  assert.equal(await page.locator('[data-form=purchase] [name=qty]').inputValue(),String(supply.recommendedQty));
  assert.equal(await page.evaluate(() => document.activeElement.name),'qty');
  const purchaseRows=await previewRows(page,'[data-form=purchase] [data-purchase-preview]');
  assert.equal(purchaseRows['立即付現'],money(supply.recommendedCost));
  assert.equal(purchaseRows['到貨日期'],`${supply.arrivalDate}（${supply.leadDays} 天）`);
  const purchased=clone(w); assert.equal(manufacturingAction(purchased,'purchase',{qty:supply.recommendedQty}).ok,true);
  await page.locator('[data-form=purchase] button[type=submit]').click();
  await sameEngine(page,purchased,'real purchase must create a paid shipment with exact qty, value and date');
  assert.equal(purchased.shipments[0].value,supply.recommendedCost);
  assert.equal(purchased.co.cash,w.co.cash-supply.recommendedCost);
  assert.equal(purchased.co.ledger.cogs,w.co.ledger.cogs,'buying inventory must not immediately expense the entire purchase');
  const observed=clone(purchased); for(let i=0;i<7;i++) assert.equal(stepManufacturing(observed),true);
  await reveal(page,'#venture-observation');
  await page.locator('#venture-observation [data-action=week]').click();
  await sameEngine(page,observed,'seven UI observation days must match shipment arrival and production accounting');
  assert.equal(observed.shipments.length,0,'express materials must have arrived during the observation');
  assert.ok(observed.stats.produced>0); assert.ok(observed.co.daily.length>=7);
  assert.ok(Math.abs(supply.recommendedCost-observed.stock.value-observed.orders.reduce((n,o)=>n+o.cost,0)-observed.co.ledger.cogs)<.01,'paid raw materials must reconcile to inventory, WIP and recognized costs');
  assert.ok((await world(page)).learning.some(r=>r.completed?.days===7));
}
async function technology(page,business) {
  const strategy={saas:'teams',marketplace:'niche',content:'search'}[business];
  await reveal(page,`[data-action=strategy][data-strategy=${strategy}]`);
  let w=await world(page), expected=clone(w);
  assert.equal(technologyAction(expected,'strategy',{id:strategy}).ok,true);
  await page.locator(`[data-action=strategy][data-strategy=${strategy}]`).click();
  await sameEngine(page,expected,'strategy card must apply only the real strategy effects');
  const metrics=technologyMetrics(expected,{includeBreakEven:false});
  const strategyText=await page.locator(`[data-action=strategy][data-strategy=${strategy}]`).innerText();
  assert.ok(strategyText.includes(money(metrics.acquisitionCost))); assert.ok(strategyText.includes(number(metrics.market)));
  w=await world(page); const id={saas:'activation',marketplace:'matching',content:'evergreen'}[business];
  await reveal(page,`[data-project=${id}] [name=release]`);
  const card=page.locator(`[data-project=${id}]`), before=await immutableState(page);
  for(const release of ['rush','pilot']) {
    await card.locator('[name=release]').focus(); await card.locator('[name=release]').selectOption(release);
    assert.equal(await page.evaluate(() => document.activeElement.name),'release');
    await pure(page,before,'changing release preview cannot spend money, start research or advance');
    const plan=technologyProjectPlan(w,id,release), rows=await previewRows(page,`[data-project=${id}] [data-project-preview]`);
    assert.equal(rows['工具與發布費'],money(plan.fee)); assert.equal(rows['工程工作量'],`${number(plan.days)} 人日`);
    assert.equal(rows['依目前團隊估計'],`${number(plan.estimatedDays)} 天`);
    assert.equal(rows['技術債變動'],`${plan.debt>=0?'+':''}${(plan.debt*100).toFixed(1)} 點`);
  }
  const plan=technologyProjectPlan(w,id,'pilot'); expected=clone(w);
  assert.equal(technologyAction(expected,'project',{id,release:'pilot'}).ok,true);
  await card.locator('[data-action=project]').click();
  await sameEngine(page,expected,'starting a chosen release must pay exactly its quoted fee and save its release');
  assert.equal((await world(page)).co.cash,w.co.cash-plan.fee);
  assert.equal(await page.locator('.venture-project.active').count(),1);
  await reveal(page,'[data-form=technology] [name=focus]');
  const running=await world(page), beforeFocus=await immutableState(page), focus=page.locator('[data-form=technology] [name=focus]');
  await focus.focus(); await focus.selectOption('stability');
  const draft=technologyDraft(running,{focus:'stability'}), draftRows=await previewRows(page,'[data-form=technology] [data-settings-preview]');
  assert.equal(draftRows['目前迭代約剩'],`${number(draft.before.projectDays)} 天|${number(draft.after.projectDays)} 天`);
  assert.ok(draft.after.projectDays>draft.before.projectDays,'more maintenance must extend actual remaining research ETA');
  assert.equal(await page.evaluate(()=>document.activeElement.name),'focus');
  await pure(page,beforeFocus,'active-project ETA preview must not alter project progress or saved release');
  await focus.selectOption('growth');
  const observed=clone(expected); for(let i=0;i<7;i++) assert.equal(stepTechnology(observed),true);
  await reveal(page,'#venture-observation');
  await page.locator('#venture-observation [data-action=week]').click();
  await sameEngine(page,observed,'seven UI days must use the real strategy and release development schedule');
  assert.ok((await world(page)).learning.some(r=>r.completed?.days===7));
  // Continue through real UI observation buttons, then verify the sector capability is earned.
  while(observed.project) {
    for(let i=0;i<7;i++) assert.equal(stepTechnology(observed),true);
    await reveal(page,'#venture-observation');
    await page.locator('#venture-observation [data-action=week]').click();
    await sameEngine(page,observed,'later observation must apply completed capability on the actual engine day');
  }
  assert.ok(observed.capabilities.includes(id));
  assert.equal(await page.locator(`[data-project=${id}] [data-action=project]`).isDisabled(),true);
}
async function reportAndResume(page,mode) {
  const before=await immutableState(page);
  await page.locator('.venture-nav [data-tab=report]').click();
  await pure(page,before,'opening integrated reports cannot change simulation or autosave');
  assert.ok((await page.locator('.venture-report').innerText()).includes('七日觀察完成'));
  assert.equal(await page.locator('.venture-report table tbody tr').count(),1);
  assert.ok((await page.locator('#venture-month-details').innerText()).includes('現金流對帳'));
  const saved=await page.evaluate(key=>localStorage.getItem(key),routeKey(mode));
  assert.deepEqual(decodeVenture(saved,mode).world,await world(page),'autosave must contain all actual decisions and observations');
  const previous=await world(page); await page.reload(); await page.waitForFunction(()=>window.__ready);
  assert.deepEqual(await world(page),previous,'refresh must resume the same world, financial history, RNG and earned capabilities');
}
async function clockControls(page,mode) {
  const expected=await world(page); assert.equal((mode==='manufacturing'?stepManufacturing:stepTechnology)(expected),true);
  await page.locator('.venture-time [data-action=day]').click();
  await sameEngine(page,expected,'one-day control must advance exactly one complete engine day');
  await reveal(page,`[data-form=${mode}] [name=${mode==='technology'?'price':'workers'}]`);
  const before=await immutableState(page);
  // Dispatch the speed click and input focus in one task, before a timer can fire.
  await page.evaluate(mode=>{
    document.querySelector('.venture-time [data-action=speed][data-value="8"]').click();
    document.querySelector(`[data-form=${mode}] input`).focus();
  },mode);
  assert.equal((await state(page)).speed,0); assert.equal((await state(page)).ticking,false);
  await page.waitForTimeout(350);
  await pure(page,before,'focusing an operating control must stop the accelerated clock without changing world or save');
}
async function unknownContractForecast(page) {
  // Only this isolated context gets large test inquiries; existing accounting stays intact.
  await page.evaluate(()=>{
    const w=window.__venture.world;
    w.offers=[
      {id:'qa-impossible',client:'QA 急件',profile:'rush',qty:1000000,price:2000,due:w.day+1,term:15,expires:w.day+7,depositRate:.35},
      {id:'qa-horizon',client:'QA 長期單',profile:'bulk',qty:1000000,price:2000,due:w.day+250,term:45,expires:w.day+7,depositRate:.15},
    ];
    window.__venture.action('settings',{workers:w.workers,shift:w.shift,qc:w.qc,supplier:w.supplier,productionMode:w.productionMode});
  });
  const w=await world(page);
  for(const offer of w.offers) {
    const p=manufacturingOrderPreview(w,offer); assert.equal(p.finishDay,null);
    assert.ok(p.estimatedContribution>0,'fixture must expose the old misleading positive contribution');
    const rows=await previewRows(page,`[data-offer="${offer.id}"] [data-contract-preview]`);
    assert.equal(rows['履約成功時估計貢獻'],'交貨未確定，暫不判定');
    assert.match(rows['補足原料後預估驗收'],/排程範圍內未估到完成/);
    assert.doesNotMatch(rows['補足原料後預估驗收'],/無法在取消期限前完成/);
  }
  assert.ok(w.offers.find(o=>o.id==='qa-horizon').due>w.day+90,'long inquiry must go beyond the forecast horizon');
  // Add a zero-deposit legacy long order; no cash or ledger entry needs inventing.
  await page.evaluate(()=>{
    const w=window.__venture.world;
    w.orders.push({id:'qa-long-active',client:'QA 長期在製',qty:1000000,price:28,due:w.day+250,term:30,expires:w.day+7,depositRate:.25,quote:28000000,deposit:0,produced:0,cost:0});
    window.__venture.action('settings',{workers:w.workers,shift:w.shift,qc:w.qc,supplier:w.supplier,productionMode:w.productionMode});
  });
  const text=await page.locator('#factory-orders').innerText();
  assert.match(text,/90 日排程內未估到完成/); assert.doesNotMatch(text,/無法在取消期限前完成/);
}
async function presentation(page,requests,errors,business) {
  const image=page.locator('.venture-scene .route-scene-image');
  assert.equal(await image.count(),1,'operations screen must use a single static scene asset');
  await image.evaluate(e=>e.decode());
  assert.equal(await image.evaluate(e=>e.complete && e.naturalWidth>0),true);
  const scenes=requests.filter(url=>/assets\/worlds\/.+\.webp/.test(url) && !url.includes('operations-manager'));
  assert.ok(scenes.length>=1); assert.ok(scenes.every(url=>url.includes(business)),'the scene must match the selected business');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'operations must not cause horizontal page overflow');
  assert.deepEqual(errors,[],'operations must not emit runtime, console or HTTP errors');
}
try {
  for(const size of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]) {
    for(const [mode,business] of routes) {
      const context=await browser.newContext({viewport:{width:size.width,height:size.height},...(size.name==='mobile'?{isMobile:true,hasTouch:true}:{})});
      const page=await context.newPage(), errors=[], requests=[];
      page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      page.on('request',r=>requests.push(r.url()));
      try {
        await page.goto(`${base}/games/tycoon/?mode=${mode}&business=${business}`);
        await page.waitForFunction(()=>window.__ready && window.__venture);
        assert.equal((await world(page))[mode==='manufacturing'?'productId':'modelId'],business);
        assert.equal((await state(page)).speed,0); assert.equal((await state(page)).ticking,false);
        assert.equal((await world(page)).manager.enabled,true,'new games delegate daily operations by default');
        await page.locator('.owner-authority summary').click();
        await page.locator('[data-action=management][data-enabled=false]').click();
        assert.equal((await world(page)).manager.enabled,false);
        const beforePanels=await immutableState(page); await panelVisibility(page,mode); await pure(page,beforePanels,'switching compact panels must preserve world, RNG, day and save');
        await navigation(page,mode); await fillDraft(page,mode,business);
        if(mode==='manufacturing') await factory(page); else await technology(page,business);
        await clockControls(page,mode); await reportAndResume(page,mode);
        if(mode==='manufacturing') await unknownContractForecast(page);
        await presentation(page,requests,errors,business);
        console.log(`PASS ${size.name} ${business}: workflow, focused pure draft, engine costs, operational decisions, seven-day report and save resume`);
      } catch(error) { console.error(`FAIL ${size.name} ${business}`,errors); throw error; }
      finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
