"""No-WebGL flight traffic follows real playback, pause, reload and reduced motion.
Serve the repository, then run this with AIRLINE_URL pointing to games/airline/.
"""
import asyncio, importlib.util, json, os
from pathlib import Path
from playwright.async_api import async_playwright

URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline-map-flights'));OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('core',Path(__file__).with_name('browser-v2.py'))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)

async def pose(page):
 return await page.locator('.map-flight').evaluate_all('els=>els.map(e=>{const m=e.getScreenCTM();return [m.e,m.f]})')

def moved(a,b):
 return len(a)==len(b) and any(abs(x-u)+abs(y-v)>1 for (x,y),(u,v) in zip(a,b))

async def start(page):
 await page.goto(URL+'?v=22.2&debug=1');await page.locator('#go-new').click();await core.answer_events(page)
 await core.decisions(page);await core.refresh_panel(page);await page.locator('#drawer-close').click()
 await page.locator('[data-dock="network"]').click();await page.locator('.city').first.wait_for(state='attached')
 assert not await page.locator('.map-flight').count(),'Planning must not dispatch flights'
 await page.locator('#world-run').click();await page.locator('.map-flight').first.wait_for(state='attached')

async def main():
 proof=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle='+os.environ.get('AIRLINE_ANGLE','metal')])
  for name,w,h,reduced in [('desktop',1280,800,False),('phone',390,844,False),('reduced',390,844,True)]:
   c=await browser.new_context(viewport={'width':w,'height':h},has_touch=w<900,reduced_motion='reduce' if reduced else 'no-preference')
   await c.route('**/ui-globe.js*',lambda route:route.abort())
   page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await start(page);await page.wait_for_timeout(150)
   before=await pose(page);await page.wait_for_timeout(650);after=await pose(page)
   assert before and len(before)<=(16 if w<600 else 32)
   assert (before==after) if reduced else moved(before,after)
   report=await page.evaluate('JSON.stringify(__tq.app.active.report)')
   await page.locator('#pause').click();await page.wait_for_timeout(100)
   paused=await pose(page);elapsed=await page.evaluate('__tq.app.clock.elapsed')
   await page.wait_for_timeout(400);assert paused==await pose(page)
   await page.reload();await page.locator('[data-continue="year"]').click();await core.answer_events(page)
   await page.locator('[data-dock="network"]').click();await page.locator('.map-flight').first.wait_for(state='attached')
   await page.wait_for_timeout(150)
   assert paused==await pose(page),'Reload must restore the paused flight positions'
   assert abs(elapsed-await page.evaluate('__tq.app.clock.elapsed'))<.01
   await page.locator('#zin').click();await page.locator('#zfit').click()
   await page.locator('[data-speed="4"]').click();await page.locator('#pause').click()
   await page.wait_for_timeout(650);assert await page.evaluate('__tq.app.clock.elapsed')>elapsed+1.5
   await page.locator('#pause').click();await page.wait_for_timeout(100)
   assert report==await page.evaluate('JSON.stringify(__tq.app.active.report)'),'Animation must not alter economics'
   assert await page.evaluate('__tq.music.stats().muted')
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.screenshot(path=str(OUT/f'flights-{name}.jpg'),quality=90)
   await page.locator('.city[data-city="BKK"]').press('Enter');await page.locator('.route-code-heading').wait_for(state='visible')
   assert await page.evaluate('__tq.app.city')=='BKK';await page.locator('#drawer-close').click()
   await page.locator('[data-dock="airport"]').click();assert not await page.locator('.map-flight').count()
   await page.locator('[data-dock="network"]').click();await page.locator('.map-flight').first.wait_for(state='attached')
   await page.locator('#skip').click();assert await page.locator('#next').count()
   assert not errors,errors
   proof.append({'layout':name,'planes':len(before),'moves':not reduced,'pauseAndReload':True,'speed4':True,'unchangedReport':True,'cityKeyboard':True,'viewSwitchAndSettlement':True,'muted':True,'errors':errors})
   await c.close()
  await browser.close()
 (OUT/'proof.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))

if __name__=='__main__':asyncio.run(main())
