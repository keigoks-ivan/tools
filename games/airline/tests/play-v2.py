"""Checks the game-style hub, route feedback and audible/muted Web Audio output."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
URL = os.environ.get('AIRLINE_URL', 'http://127.0.0.1:8765/games/airline/')
OUT = Path(os.environ.get('AIRLINE_OUTPUT', '/tmp/airline-v2-play'))
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        results=[]
        for width,height,dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context=await browser.new_context(viewport={'width':width,'height':height},color_scheme='dark' if dark else 'light',has_touch=width<900)
            page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(URL+'?debug=1');await page.locator('.airport-illustration').evaluate('(img)=>img.decode()')
            before=await page.evaluate('__tq.music.stats()');assert before['muted'] and before['context']=='uncreated',before
            await page.screenshot(path=str(OUT/f'start-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#music-btn').click();await page.wait_for_function('!__tq.music.stats().busy')
            await page.wait_for_timeout(650);sound=await page.evaluate('__tq.music.stats()')
            assert not sound['muted'] and sound['context']=='running' and sound['rms']>0 and len(sound['chords'])==16,sound
            await page.locator('#music-btn').click();await page.wait_for_timeout(300);silent=await page.evaluate('__tq.music.stats()')
            assert silent['muted'] and silent['gain']==0 and silent['rms']==0 and silent['context']=='suspended',silent
            await page.locator('#music-btn').click();await page.wait_for_timeout(300);assert (await page.evaluate('__tq.music.stats()'))['rms']>0
            # Exercise the actual visibility handler without changing the user's app.
            await page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));")
            await page.wait_for_timeout(150);hidden=await page.evaluate('__tq.music.stats()');assert hidden['context']=='suspended' and hidden['rms']==0,hidden
            await page.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));")
            await page.wait_for_timeout(300);assert (await page.evaluate('__tq.music.stats()'))['context']=='running'
            await page.locator('#music-btn').click();await page.wait_for_timeout(250)
            await page.locator('[data-scenario="margin"]').click();await page.locator('#go-new').click()
            # Every destination, including out-of-range cities, must render safely.
            ids=await page.evaluate('Object.keys(__tq.B.CITIES).filter(id=>id!==__tq.app.state.hub)')
            for city in ids:
                await page.locator('#add-route').click();await page.locator('#city-search').fill(city)
                await page.locator(f'[data-destination="{city}"]').click();await page.locator('#back').click()
            await page.locator('#add-route').click();await page.locator('#city-search').fill('HKG');await page.locator('[data-destination="HKG"]').click();await page.locator('#open').click()
            assert await page.locator('.route-toast').count() and await page.locator('.boarding-pass').count()
            await page.locator('#run').click();await page.wait_for_timeout(1400)
            await page.locator('#pause').click();await page.wait_for_timeout(2300)
            await page.screenshot(path=str(OUT/f'network-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#base-launch').click();assert await page.locator('.hub-dialog').count()
            for id in ['lounge','tank','depot']:
                await page.locator(f'.hub-dialog [data-hub-detail="{id}"]').click()
                assert await page.locator(f'.hub-dialog [data-facility="{id}"]').count()
            await page.locator('.hub-dialog [data-facility="depot"]').click()
            assert await page.evaluate('__tq.app.draft.facilities.has("depot")')
            assert await page.locator('.hub-dialog [data-hub-detail="depot"]').evaluate('(el)=>el.classList.contains("queued")')
            await page.screenshot(path=str(OUT/f'base-{width}x{height}{"-dark" if dark else ""}.png'))
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            await page.locator('#hub-close').click();await page.locator('#skip').click()
            assert await page.locator('.milestones').count()
            assert not errors,errors
            results.append({'width':width,'height':height,'dark':dark,'audio':{'before':before,'playing':sound,'muted':silent,'hidden':hidden},'destinations':len(ids),'hub':'passed','errors':errors})
            await context.close()
        await browser.close()
        (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
        print(json.dumps(results,ensure_ascii=False,indent=2))
asyncio.run(main())
