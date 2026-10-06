"""Visual acceptance: local art decoding, game windows, contrast and all layouts."""
import asyncio, json, importlib.util, os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline22-premium'));OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')+'?debug=1'
spec=importlib.util.spec_from_file_location('core',Path(__file__).with_name('browser-v2.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
async def ready(page):
 await page.wait_for_function('!__tq.app.map.stats().loading');await page.wait_for_timeout(250)
async def shot(page,name):
 await page.wait_for_timeout(250)
 assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
 assert not await page.evaluate('''()=>[...document.querySelectorAll('.modal,#panel:not([hidden])')].some(e=>e.scrollWidth>e.clientWidth+1)''')
 await page.screenshot(path=str(OUT/(name+'.jpg')),quality=90)
async def main():
 proof=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle='+os.environ.get('AIRLINE_ANGLE','metal'),'--enable-unsafe-swiftshader'])
  for name,w,h,dark in [('desktop',1280,800,False),('phone',390,844,False),('landscape',844,390,False),('dark',1280,800,True)]:
   c=await browser.new_context(viewport={'width':w,'height':h},has_touch=w<900,color_scheme='dark' if dark else 'light');page=await c.new_page();errors=[];bad=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:bad.append(r.url) if r.status>=400 else None)
   await page.goto(URL);await ready(page);await shot(page,'title-'+name)
   await page.locator('#configure-game').click();await page.locator('[data-scenario="margin"]').click();await shot(page,'challenges-'+name);await page.locator('#setup-close').click()
   await page.locator('#choose-hub').click();assert await page.locator('[data-pick-hub]').count()==180;await shot(page,'hubs-'+name);await page.locator('#hub-picker-close').click()
   await page.locator('#passport-home').click();assert await page.locator('.passport-album .regional-art').count()==7;assert await page.locator('.passport-album .regional-art').evaluate_all('els=>els.every(e=>getComputedStyle(e).backgroundImage.includes("cities.webp"))');await shot(page,'passport-'+name);await page.locator('[data-career-close]').click()
   await page.locator('#go-new').click();await core.answer_events(page);await ready(page)
   await page.locator('[data-world="fleet"]').click();assert await page.locator('.plane-dialog .art-atlas').count()==1;await shot(page,'plane-'+name);await page.locator('#plane-close').click()
   await page.locator('[data-dock="missions"]').click();await shot(page,'missions-'+name);await page.locator('[data-rival-board]').click();await shot(page,'rivals-'+name);await page.locator('[data-career-close]').click()
   await page.locator('[data-dock="fleet"]').click();await shot(page,'fleet-'+name);await page.locator('#aircraft-guide').click();assert await page.locator('[data-guide-aircraft] .art-atlas').count()==6;await shot(page,'guide-'+name);await page.locator('#guide-close').click();await page.locator('#drawer-close').click()
   await page.locator('[data-world="lounge"]').click();await shot(page,'facility-'+name);await page.locator('#facility-done').click()
   await page.locator('[data-dock="network"]').click();await ready(page);await shot(page,'network-'+name);await page.locator('#world-search').click();await page.locator('#city-search').fill('LAX');await page.locator('[data-destination="LAX"]').click();await shot(page,'longhaul-'+name);await page.locator('#open').click();await page.locator('#drawer-close').click()
   await page.locator('#skip').click();await ready(page);await shot(page,'settlement-'+name)
   contrast=await page.evaluate('''()=>{
    const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number),lum=v=>v.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
    return [['.rhead h1','.rhead'],['.career-profile>div>b','.career-profile']].map(([text,box])=>{
     const fg=lum(rgb(getComputedStyle(document.querySelector(text)).color)),style=getComputedStyle(document.querySelector(box)),bg=(style.backgroundImage.match(/rgb\\([^)]+\\)/g)||[style.backgroundColor]).map(s=>lum(rgb(s)));
     return {text,ratio:Math.min(...bg.map(b=>(Math.max(fg,b)+.05)/(Math.min(fg,b)+.05)))};
    });}''')
   assert all(x['ratio']>=4.5 for x in contrast),contrast
   decoded=await page.evaluate('''async()=>{const paths=['coast','aircraft','facilities','cities'];return await Promise.all(paths.map(name=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve({name,width:im.naturalWidth,height:im.naturalHeight});im.onerror=()=>resolve({name,width:0,height:0});im.src='./art/v4/'+name+'.webp?v=22';})));}''')
   assert all(x['width']>0 and x['height']>0 for x in decoded),decoded
   assert await page.evaluate('__tq.music.stats().muted');assert not errors and not bad,(errors,bad)
   proof.append({'layout':name,'decodedArt':decoded,'contrast':contrast,'errors':errors,'httpErrors':bad});print('Passed '+name,flush=True);await c.close()
  await browser.close()
 (OUT/'proof.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))
if __name__=='__main__':asyncio.run(main())
