"""Official/estimated labels, capacity feedback, muted start and mobile route panels."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8766/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline-demand/browser'));OUT.mkdir(parents=True,exist_ok=True)

async def main():
    results=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        for w,h,dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context=await browser.new_context(viewport={'width':w,'height':h},color_scheme='dark' if dark else 'light',has_touch=w<900)
            page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(URL+'?debug=1');await page.locator('#go-new').click()
            assert await page.evaluate('__tq.music.stats().muted')
            for city,kind in [('LAX','observed'),('KHH','estimated')]:
                await page.locator('#add-route').click();await page.locator('#city-search').fill(city)
                await page.locator(f'[data-destination="{city}"]').click()
                note=page.locator(f'[data-market-kind="{kind}"]');assert await note.count()==1
                if city=='LAX':
                    text=await note.inner_text();assert '995,840' in text and '2025' in text and '73%' in text,text
                    before=int((await page.locator('#your-seats').inner_text()).replace(',',''))
                    await page.locator('#wp').click()
                    after=int((await page.locator('#your-seats').inner_text()).replace(',',''));assert after==before+640,after
                    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    await note.scroll_into_view_if_needed()
                    await page.screenshot(path=str(OUT/f'lax-{w}x{h}{"-dark" if dark else ""}.png'))
                else:
                    assert '估算' in await note.inner_text()
                assert '目前沒有對手' not in await page.locator('#pscroll').inner_text()
                await page.locator('#back').click()
            await page.locator('#menu-btn').click();await page.locator('[data-m="src"]').click()
            assert await page.locator('a[download]').count()==1
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            assert not errors,errors
            results.append({'width':w,'height':h,'dark':dark,'sources':'passed','capacity':'passed','muted':True,'errors':errors})
            print(f'Passed {w}x{h}, dark={dark}',flush=True)
            await asyncio.wait_for(context.close(),timeout=10)
        await asyncio.wait_for(browser.close(),timeout=10)
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))

asyncio.run(main())
