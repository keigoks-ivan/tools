// Headless isolated contexts: never touch the player's tabs or browser storage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { INDUSTRIES, industryKey } from '../industry-catalog.js';
import { decodeVenture } from '../venture-saves.js';
import { decodeSave, encodeSave } from '../saves.js';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8129';
const browser = await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const read = page => page.evaluate(()=>JSON.parse(JSON.stringify(window.__venture?.world||window.__game.world)));
try {
  for(const width of (process.env.TYCOON_WIDTHS||'1440,390').split(',').map(Number)) {
    const context=await browser.newContext({viewport:{width,height:940},...(width===390?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),errors=[];
    let cityTemplate=null;
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
    for(const [id,p] of Object.entries(INDUSTRIES).filter(([id])=>!process.env.TYCOON_IDS||process.env.TYCOON_IDS.split(',').includes(id))) {
      const key=industryKey(p.mode,id);
      // All city campaigns use the same seeded rival city; warm it once per viewport.
      if(p.mode==='stores'&&cityTemplate){const seed=structuredClone(cityTemplate);seed.campaignBusiness=id;seed.campaignInitialCash={tea:2000000,cafe:3000000,bento:2000000,bakery:3000000,convenience:3000000,salon:2000000,restaurant:8000000,supermarket:14000000,fitness:20000000}[id];seed.companies.player.cash=seed.campaignInitialCash;seed.companies.player.name=p.name+'品牌';await page.evaluate(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw:encodeSave(seed,{})});}
      await page.goto(`${base}/games/tycoon/?mode=${p.mode}&business=${id}&scenario=1`);await page.waitForFunction(()=>window.__ready&&(window.__venture||window.__game),null,{timeout:120000});
      if(p.mode==='stores'&&!cityTemplate)cityTemplate=await read(page);
      if(p.mode==='stores')await page.evaluate(id=>{const g=window.__game,w=g.world,lot=w.lots.filter(l=>!l.shopId&&l.zone==='住宅').sort((a,b)=>a.rent-b.rent)[0];const r=g.sim.openShop(w,lot.id,{businessId:id,ownerWorks:true});if(!r.ok)throw new Error(r.reason);w.shops.find(s=>s.id===r.shopId).openAtT=w.t;g.selectLot(lot.id,'industry');g.save();},id);
      const board=page.locator(`[data-industry=${id}]`).first();await board.waitFor({state:'visible'});assert.equal(await board.locator('fieldset').count(),2);assert.equal(await board.locator('.industry-resources article').count(),3);assert.equal(await board.locator('[data-industry-kind=policy]').count(),4);
      const before=await read(page);await board.locator('.industry-effects summary').click();assert.deepEqual(await read(page),before,'explanation must be pure');
      await board.locator(`[data-axis=${p.axes[0].id}][data-value=${p.axes[0].options[1].id}]`).click();let w=await read(page),active=p.mode==='stores'?w.shops.find(s=>s.owner==='player'):w;assert.equal(active.industry.policies[p.axes[0].id],p.axes[0].options[1].id);assert.equal(await board.locator(`[data-axis=${p.axes[0].id}][data-value=${p.axes[0].options[1].id}]`).getAttribute('aria-pressed'),'true','visible selection follows actual policy');
      await board.locator('[data-industry-kind=invest]').click();w=await read(page);active=p.mode==='stores'?w.shops.find(s=>s.owner==='player'):w;assert.ok(active.industry.work);assert.equal(active.industry.stats.investments,0);assert.equal(await board.locator('[data-industry-kind=invest]').isDisabled(),true,'visible work prevents duplicate payment');assert.ok(!(await board.textContent()).includes('這是保留的舊版進度'));
      const days=Number(process.env.TYCOON_DAYS||7);if(p.mode==='stores')await page.evaluate(days=>window.__game.ff(days*24),days);else await page.evaluate(days=>window.__venture.advance(days),days);
      const current=await read(page),currentIndustry=(p.mode==='stores'?current.shops.find(s=>s.owner==='player'):current).industry;assert.ok((await board.locator('.industry-investment').textContent()).includes(`${currentIndustry.work.elapsed}／${p.investment.days}`),'visible progress follows simulated days');for(const r of p.resources)assert.ok((await board.locator('.industry-resources').textContent()).includes((currentIndustry.resources[r.id]*100).toFixed(1)+'%'),'visible resource follows actual state');const raw=await page.evaluate(key=>localStorage.getItem(key),key);assert.ok(raw,`save missing ${key}`);const decoded=p.mode==='stores'?decodeSave(raw).world:decodeVenture(raw,p.mode).world;assert.equal(decoded.t??decoded.day,current.t??current.day,`save did not advance: ${key}`);assert.deepEqual(decoded,current);
      if(p.mode==='stores')await page.evaluate(()=>window.__game.openReport());else await page.locator(p.mode==='enterprise'?'[data-view=report]':'[data-tab=report]').first().click();assert.deepEqual(await read(page),current,'report must not advance time or change decisions');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal page overflow');
      await page.reload();await page.waitForFunction(()=>window.__ready&&(window.__venture||window.__game),null,{timeout:120000});const resumed=await read(page);assert.equal(resumed.t??resumed.day,current.t??current.day,JSON.stringify(await page.evaluate(key=>({key,primary:localStorage.getItem(key)?.length,backup:localStorage.getItem(key+'.backup')?.length,total:Object.values(localStorage).reduce((n,x)=>n+x.length,0),notice:document.querySelector('#save-status')?.textContent,toasts:[...document.querySelectorAll('.toast')].map(x=>x.textContent)}),key)));assert.deepEqual(resumed,current,'reload resumes same industry');
      assert.equal(await page.evaluate(()=>window.__venture?.state.speed||window.__game?.state.speed||0),0);
      if(p.mode==='stores'){await page.waitForTimeout(200);const frames=await page.evaluate(()=>window.__city.frames());await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__city.frames()),frames,'paused city stops rendering');}
      if(p.mode!=='stores'){assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.evaluate(()=>window.__venture.state.ticking),false);await page.locator('.industry-stage img').evaluate(e=>e.decode());}
      if((width===1440&&['tea','electronics','marketplace','ai'].includes(id))||(width===390&&['fitness','ai'].includes(id))){if(p.mode==='stores')await page.evaluate(()=>{const g=window.__game,s=g.world.shops.find(s=>s.owner==='player');g.selectLot(s.lotId,'industry');});await page.screenshot({path:`/private/tmp/tycoon-industry-${width}-${id}.png`,fullPage:p.mode!=='stores'});}
      assert.deepEqual(errors,[]);console.log(`SAVED ${key}: ${raw.length} characters; total ${await page.evaluate(()=>Object.values(localStorage).reduce((n,x)=>n+x.length,0))}`);console.log(`PASS ${width} ${id}: industry choices, delayed investment, actual ${days} days, integrated report and independent reload`);
    }
    const saved=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>/^tycoon\.(stores|manufacturing|technology|enterprise)\.[^.]+\.save\.v1$/.test(key)).map(([key,raw])=>({key,bytes:raw.length})));assert.equal(saved.length,process.env.TYCOON_IDS?process.env.TYCOON_IDS.split(',').length:21);console.log(`PASS ${width}: all 21 independent slots coexist; ${saved.reduce((n,x)=>n+x.bytes,0)} characters`);
    await page.goto(`${base}/games/tycoon/`);await page.waitForFunction(()=>window.__ready);assert.equal(await page.locator('.owner-business-card').count(),21);await page.locator('[data-industry-filter=technology]').click();assert.equal(await page.locator('.owner-business-card:visible').count(),3);await page.locator('[data-industry-filter=all]').click();assert.equal(await page.locator('.owner-business-card:visible').count(),21);await context.close();
  }
} finally { await browser.close(); }
