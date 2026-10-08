// Extreme settings use isolated, funded saved companies; player tabs and saves are untouched.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createEnterprise, enterpriseAction, stepEnterprise } from '../enterprise.js';
import { createOwnerVenture, stepOwnerVenture } from '../owner-management.js';
import { technologyAction } from '../technology.js';
import { company, spend } from '../venture-core.js';
import { encodeVenture, decodeVenture, routeKey } from '../venture-saves.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://127.0.0.1:8129',browser=await chromium.launch({headless:true});
const clean=w=>{const next=structuredClone(w);delete next.learning;return next;};
const world=page=>page.evaluate(()=>JSON.parse(JSON.stringify(window.__venture.world)));
try {
  for(const width of [1440,390])for(const [mode,id,price] of [['enterprise','ecommerce',5000],['enterprise','hotel',15000],['technology','saas',1999],['technology','marketplace',20],['technology','content',6]]) {
    const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true,...(width===390?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),errors=[];
    const w=mode==='enterprise'?createEnterprise(id,42):createOwnerVenture(mode,id,42);w.co=company(20000000);w.quality=.95;w.reputation=.95;w.manager.maxFixed=3000000;w.manager.budget=3000000;
    if(mode==='enterprise'){w.capacity=id==='hotel'?80:160;w.staff=id==='hotel'?14:8;if(id==='ecommerce'){w.stock={qty:5000,value:1650000};spend(w,1650000,'purchases');}else{w.co.assets=1800000;spend(w,1800000,'capex');}}
    else{w.retention=.9;w.techDebt=0;w.users=id==='content'?35000:5000;w.paying=id==='saas'?1200:0;w.cloudTier=3;}
    const key=routeKey(mode,id),raw=encodeVenture(w);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    try {
      await page.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);},{key,raw});await page.goto(`${base}/games/tycoon/?mode=${mode}&business=${id}`);await page.waitForFunction(()=>window.__ready&&window.__venture);assert.deepEqual(await world(page),w);
      if(mode==='enterprise')await page.locator('[data-view=settings]').first().click();const form=page.locator(mode==='enterprise'?'[data-form=settings]':'[data-form=technology]');const original=await world(page),stored=await page.evaluate(key=>localStorage.getItem(key),key);await form.locator('[name=price]').fill(String(price));await form.locator('[name=marketing]').fill('500000');assert.deepEqual(await world(page),original);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),stored,'preview cannot change real settings or saves');await form.locator('button[type=submit]').click();const changed=await world(page);assert.equal(changed.price,price);assert.equal(changed.marketing,500000);assert.equal(changed.learning.length,1);
      const expected=structuredClone(changed);for(let i=0;i<90;i++)(mode==='enterprise'?stepEnterprise:stepOwnerVenture)(expected);await page.evaluate(()=>window.__venture.advance(90));assert.deepEqual(clean(await world(page)),clean(expected),'real browser days must match the tested engine, including costs, team decisions and paused events');assert.equal((await world(page)).day,90);
      await page.locator(mode==='enterprise'?'[data-view=report]':'[data-tab=report]').first().click();const report=await page.locator('.business-coach').innerText();assert.ok(report.includes(mode==='enterprise'?'一萬元行銷加碼':'邊際每位新客成本'));assert.ok(report.includes(mode==='enterprise'?'售價／估計客戶價值':id==='saas'?'月費／估計客戶價值':id==='content'?'廣告密度後的瀏覽因子':'抽成後的交易因子'));assert.ok(!report.includes('NaN')&&!report.includes('Infinity'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const after=await world(page);assert.deepEqual(decodeVenture(await page.evaluate(key=>localStorage.getItem(key),key),mode).world,after);if(mode==='enterprise'){const event=page.waitForEvent('download');await page.locator('[data-action=analysis]').click();const html=await readFile(await(await event).path(),'utf8');assert.ok(html.includes('一萬元行銷加碼'));assert.ok(html.includes('售價／估計客戶價值'));}
      await page.screenshot({path:`/private/tmp/tycoon-difficulty-${id}-${width}.png`});await page.reload();await page.waitForFunction(()=>window.__ready&&window.__venture);assert.deepEqual(await world(page),after);assert.equal(await page.evaluate(()=>window.__venture.state.ticking),false);assert.deepEqual(errors,[]);console.log(`PASS ${width} ${id}: extreme pure draft, actual 90-day accounting, new risk analysis, export and exact saved resume`);
    }finally {await context.close();}
  }
}finally {await browser.close();}
