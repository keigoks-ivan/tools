# -*- coding: utf-8 -*-
"""Acceptance for the spatial airport, game dock and its reachable controls."""
import asyncio,json,os,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline20-world'));OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('core',Path(__file__).with_name('browser-v2.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
async def clean_layout(page):
 assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'Horizontal overflow'
 assert not await page.evaluate('''()=>[...document.querySelectorAll('.modal,#panel:not([hidden])')].some(e=>e.scrollWidth>e.clientWidth+1)'''),'Control panel overflow'
async def shot(page,name):
 await page.wait_for_timeout(500);await page.screenshot(path=str(OUT/f'{name}.jpg'),quality=88)
async def main():
 result={'viewports':[]}
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for label,w,h,dark in [('desktop',1280,800,False),('phone',390,844,False),('landscape',844,390,False),('dark',1280,800,True)]:
   context=await browser.new_context(viewport={'width':w,'height':h},color_scheme='dark' if dark else 'light',has_touch=w<900)
   page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(URL+'?debug=1');await page.wait_for_function('!__tq.app.map.stats().loading');await shot(page,f'title-{label}');await clean_layout(page)
   assert await page.evaluate('__tq.music.stats().muted')
   # Any airport is a valid home; using LAX checks the world is not tied to five curated hubs.
   await page.locator('#choose-hub').click();assert await page.locator('[data-pick-hub]').count()==180
   await page.locator('#hub-search').fill('洛杉磯');await page.locator('[data-pick-hub="LAX"]').click();assert 'LAX' in await page.locator('#choose-hub').inner_text()
   await page.locator('#go-new').click();await core.answer_events(page);await page.wait_for_function('!__tq.app.map.stats().loading');await clean_layout(page)
   assert await page.evaluate('__tq.app.view==="airport" && !__tq.app.panelOpen && __tq.app.state.hub==="LAX"')
   assert not await page.locator('#panel').is_visible();assert await page.locator('[data-world]').count()==6
   for id in ['terminal','depot','lounge','tank','tower','fleet']:
    b=await page.locator(f'[data-world="{id}"]').bounding_box();assert b and b['x']>=0 and b['x']+b['width']<=w+1,(label,id,b)
   # The scene supports real camera interaction, and reset returns the whole airport.
   old=await page.evaluate('__tq.app.map.stats().angle');await page.mouse.move(w*.65,h*.65);await page.mouse.down();await page.mouse.move(w*.75,h*.65,steps=6);await page.mouse.up()
   assert abs(await page.evaluate('__tq.app.map.stats().angle')-old)>.1
   await page.locator('#zfit').click();await page.locator('#zin').click();assert await page.evaluate('__tq.app.map.stats().zoom')>1;await page.locator('#zfit').click()
   # Aircraft inspection displays numeric range and capacity, not just a decorative plane.
   await page.locator('[data-world="fleet"]').click();assert '6,000' in await page.locator('.plane-dialog').inner_text();assert '168' in await page.locator('.plane-dialog').inner_text();await clean_layout(page);await shot(page,f'plane-{label}');await page.locator('#plane-close').click()
   await page.locator('[data-world="depot"]').click();await page.locator('[data-facility="depot"]').click();assert await page.evaluate('__tq.app.draft.facilities.has("depot")');await shot(page,f'build-{label}');await clean_layout(page)
   await page.locator('[data-facility="depot"]').click();assert not await page.evaluate('__tq.app.draft.facilities.has("depot")');await page.locator('#facility-done').click();assert not await page.locator('#panel').is_visible()
   # A tap on the terminal switches to the full-screen globe and destination picker.
   if w==1280:
    b=await page.locator('[data-world="terminal"]').bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']+7
    assert await page.evaluate('p=>document.elementFromPoint(p.x,p.y)?.classList.contains("airport-canvas")',{'x':x,'y':y});await page.mouse.click(x,y)
   else:await page.locator('[data-world="terminal"]').tap()
   assert await page.evaluate('__tq.app.view')=='network';await page.locator('#city-search').fill('TPE');await page.locator('[data-destination="TPE"]').click()
   assert await page.locator('[data-type="MQ-350"]').count()==1;assert '14,000' in await page.locator('[data-type="MQ-350"]').inner_text();assert '320' in await page.locator('[data-type="MQ-350"]').inner_text();await clean_layout(page);await shot(page,f'route-{label}')
   await page.locator('#open').click();await page.locator('#drawer-close').click();await page.wait_for_timeout(800);await shot(page,f'network-{label}')
   await page.locator('[data-dock="airport"]').click();await page.wait_for_function('!__tq.app.map.stats().loading')
   await page.locator('#world-run').click();await page.wait_for_timeout(1800);await page.locator('#pause').click();assert await page.evaluate('!!__tq.app.active && !__tq.app.clock.running')
   frozen=await page.evaluate('JSON.stringify(__tq.app.active.report)');before=await page.evaluate('__tq.app.clock.elapsed');frames=await page.evaluate('__tq.app.map.stats().frames');await page.wait_for_timeout(600)
   assert abs(await page.evaluate('__tq.app.clock.elapsed')-before)<.05;assert await page.evaluate('__tq.app.map.stats().frames')<=frames+1
   await page.locator('#pause').click();await page.locator('[data-speed="4"]').click();await page.wait_for_timeout(1800);await shot(page,f'airport-{label}');await page.locator('#pause').click()
   await page.locator('[data-dock="routes"]').click();await page.locator('[data-route="TPE"]').click();await page.locator('[data-fare="high"]').click();await page.locator('#done').click()
   assert frozen==await page.evaluate('JSON.stringify(__tq.app.active.report)')
   await page.reload();await page.locator('[data-continue="year"]').click();assert frozen==await page.evaluate('JSON.stringify(__tq.app.active.report)');assert await page.evaluate('!__tq.app.clock.running && __tq.app.draft.routes.get("TPE").fare==="high"')
   # Audible chord playback, mute and reopening all use the real WebAudio context.
   await page.locator('#music-btn').click();await page.wait_for_function('!__tq.music.stats().busy');await page.wait_for_timeout(650);audio=await page.evaluate('__tq.music.stats()');assert audio['rms']>0 and len(audio['chords'])==16
   await page.locator('#music-btn').click();await page.wait_for_timeout(350);silent=await page.evaluate('__tq.music.stats()');assert silent['muted'] and silent['rms']==0 and silent['gain']==0 and silent['context']=='suspended'
   await page.locator('#skip').click();assert await page.locator('.reason').count()==1;await clean_layout(page);await page.locator('#next').click();await core.answer_events(page)
   await page.locator('#lang-btn').click();await page.locator('[data-dock="fleet"]').click();assert 'MAX RANGE' in await page.locator('#panel').inner_text();await clean_layout(page)
   assert not errors,errors
   result['viewports'].append({'viewport':label,'errors':errors,'defaultMute':True,'chords':len(audio['chords']),'audibleRms':audio['rms'],'mutedRms':silent['rms'],'worldStats':await page.evaluate('__tq.app.map.stats()')})
   print('Passed '+label,flush=True);await context.close()
  # Reduced motion and lost WebGL both retain accessible operational controls.
  context=await browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=await context.new_page();await page.goto(URL+'?debug=1');await page.locator('#go-new').click();await core.answer_events(page);await page.wait_for_function('!__tq.app.map.stats().loading');assert await page.evaluate('__tq.app.map.stats().reducedMotion');frames=await page.evaluate('__tq.app.map.stats().frames');await page.wait_for_timeout(500);assert await page.evaluate('__tq.app.map.stats().frames')<=frames+1
  await page.locator('.airport-canvas').dispatch_event('webglcontextlost');assert await page.locator('.airport-fallback').count();await page.locator('[data-world="tank"]').click();assert await page.locator('[data-facility="tank"]').is_visible();await clean_layout(page);result['reducedMotionAndContextLoss']='passed';await context.close()
  # Cold first-play budget, real moving airport and maximum-network performance.
  context=await browser.new_context(viewport={'width':1280,'height':800});page=await context.new_page();await page.goto(URL+'?debug=1');await page.locator('#go-new').click();await core.answer_events(page);await core.decisions(page);await page.locator('#world-run').click();await page.wait_for_timeout(1000)
  async def cadence():
   return await page.evaluate('''()=>new Promise(resolve=>{const times=[];let last=0;function frame(t){if(last)times.push(t-last);last=t;if(times.length<90)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);resolve({mean:times.reduce((a,b)=>a+b)/times.length,p95:times[Math.floor(times.length*.95)]});}}requestAnimationFrame(frame);})''')
  result['airportPerformance']={'frameMs':await cadence(),'renderer':await page.evaluate('__tq.app.map.stats()')}
  await page.locator('#pause').click();await page.locator('[data-dock="network"]').click();await page.wait_for_timeout(1800)
  await page.evaluate('''()=>{const a=__tq.app;a.active=null;a.draft.routes=new Map(Object.values(__tq.B.CITIES).filter(c=>c.id!==a.state.hub).map(c=>{const o=__tq.B.routeOptions(a.state,c.id);return{city:c.id,type:o.eligibleTypes.at(-1),weekly:7,fare:'mid'};}).filter(r=>r.type).map(r=>[r.city,r]));}''');await core.refresh_panel(page);await page.locator('#drawer-close').click();await page.wait_for_timeout(500)
  result['networkPerformance']={'frameMs':await page.evaluate('''()=>new Promise(resolve=>{const times=[];let last=0;function frame(t){__tq.app.map.setTime({elapsed:t/1000,speed:1});if(last)times.push(t-last);last=t;if(times.length<90)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);resolve({mean:times.reduce((a,b)=>a+b)/times.length,p95:times[Math.floor(times.length*.95)]});}}requestAnimationFrame(frame);})'''),'renderer':await page.evaluate('__tq.app.map.stats()')}
  result['resources']=await page.evaluate('''()=>({bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.decodedBodySize,0),external:performance.getEntriesByType('resource').filter(r=>!r.name.startsWith(location.origin)).map(r=>r.name)})''');assert result['resources']['bytes']<8*1024*1024 and not result['resources']['external'];await context.close();await browser.close()
 (OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':asyncio.run(main())
