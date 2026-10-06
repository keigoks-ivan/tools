"""Acceptance for the detailed airport art and settled facility visibility."""
import asyncio,json,importlib.util,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline21-art'));OUT.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('core',Path(__file__).with_name('browser-v2.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')+'?debug=1'
async def ready(page):await page.wait_for_function('!__tq.app.map.stats().loading');await page.wait_for_timeout(350)
async def shot(page,name):await page.screenshot(path=str(OUT/(name+'.jpg')),quality=90)
async def fps(page):return await page.evaluate('''()=>new Promise(resolve=>{let last=0;const times=[];function frame(t){if(last)times.push(t-last);last=t;if(times.length<90)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);resolve({mean:times.reduce((a,b)=>a+b)/times.length,p95:times[Math.floor(times.length*.95)]});}}requestAnimationFrame(frame);})''')
async def main():
 angle=os.environ.get('AIRLINE_ANGLE','swiftshader');proof={'renderer':'Chrome / '+angle,'viewports':[]}
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle='+angle,'--enable-unsafe-swiftshader'])
  for name,w,h,dark in [('desktop',1280,800,False),('phone',390,844,False),('landscape',844,390,False),('dark',1280,800,True)]:
   context=await browser.new_context(viewport={'width':w,'height':h},has_touch=w<900,color_scheme='dark' if dark else 'light');page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(URL);await ready(page);await shot(page,'title-'+name);await page.locator('#go-new').click();await core.answer_events(page);await ready(page);await shot(page,'empty-'+name)
   assert await page.evaluate('__tq.music.stats().muted');assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   # State changes are made through actual facility controls and operating start.
   for id in ['depot','lounge','tank']:
    await page.locator('[data-world="'+id+'"]').click();await page.locator('[data-facility="'+id+'"]').click();await page.locator('#facility-done').click()
   assert await page.locator('.world-hotspot.queued').count()==3;await ready(page);await shot(page,'construction-'+name)
   await core.decisions(page);await core.refresh_panel(page);await page.locator('#world-run').click();await ready(page);await page.wait_for_timeout(1200)
   assert await page.locator('.world-hotspot.built').count()==3;assert await page.evaluate('Object.values(__tq.app.state.facilities).every(Boolean)')
   performance={'frameMs':await fps(page),'stats':await page.evaluate('__tq.app.map.stats()')};await page.locator('#pause').click();await shot(page,'built-'+name)
   if name=='desktop':
    await page.locator('#zin').click();await page.locator('#zin').click();await ready(page);await shot(page,'closeup-desktop');await page.locator('#zfit').click()
   await page.locator('[data-world="lounge"]').click();assert await page.locator('[data-facility="lounge"]').is_disabled();await page.locator('#facility-done').click()
   await page.locator('#skip').click();assert await page.locator('#next').count();await page.locator('#next').click();await core.answer_events(page);await ready(page);assert await page.locator('.world-hotspot.built').count()==3
   await page.locator('#menu-btn').click();await page.locator('[data-m="home"]').click();await ready(page);await page.locator('[data-continue="year"]').click();await core.answer_events(page);await ready(page);assert await page.locator('.world-hotspot.built').count()==3
   for _ in range(3):
    await page.locator('[data-dock="network"]').click();await ready(page);await page.locator('[data-dock="airport"]').click();await ready(page)
   assert not errors,errors;assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   resources=await page.evaluate('''()=>({bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.decodedBodySize,0),external:performance.getEntriesByType('resource').filter(r=>!r.name.startsWith(location.origin)).map(r=>r.name)})''');assert resources['bytes']<8*1024*1024 and not resources['external']
   proof['viewports'].append({'name':name,'errors':errors,'performance':performance,'resources':resources});print('Passed '+name,flush=True);await context.close()
  await browser.close()
 (OUT/'proof.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))
if __name__=='__main__':asyncio.run(main())
