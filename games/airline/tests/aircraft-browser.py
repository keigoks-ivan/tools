"""Readable capacity/range cards, long-haul matching and the cozy UI."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
URL = os.environ.get('AIRLINE_URL', 'http://127.0.0.1:8766/games/airline/')
OUT = Path(os.environ.get('AIRLINE_OUTPUT', '/tmp/airline-aircraft'))
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    results=[]
    async with async_playwright() as p:
        angle=os.environ.get('AIRLINE_ANGLE','swiftshader')
        browser=await p.chromium.launch(channel='chrome',headless=True,args=[f'--use-angle={angle}','--enable-unsafe-swiftshader'])
        for width,height,dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context=await browser.new_context(viewport={'width':width,'height':height},color_scheme='dark' if dark else 'light',has_touch=width<900)
            page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(URL+'?debug=1')
            await page.wait_for_function('!__tq.app.map.stats().loading')
            assert await page.evaluate('__tq.music.stats().muted')
            await page.screenshot(path=str(OUT/f'start-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#go-new').click();await page.wait_for_timeout(1000)
            await page.wait_for_function('!__tq.app.map.stats().loading');await page.locator('[data-dock="routes"]').click()
            await page.screenshot(path=str(OUT/f'network-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#aircraft-guide').click()
            assert await page.locator('[data-guide-aircraft]').count()==6
            for type in ['MQ-72','MQ-190','MQ-320','MQ-321','MQ-350','MQ-400']:
                card=page.locator(f'[data-guide-aircraft="{type}"]')
                expected=await page.evaluate('type=>{const a=__tq.B.AIRCRAFT[type];return {range:a.rangeKm.toLocaleString("en-US"),seats:String(a.seats.fsc)}}',type)
                text=await card.locator('.aircraft-stats').inner_text()
                assert expected['range'] in text and expected['seats'] in text,(type,text)
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            await page.screenshot(path=str(OUT/f'guide-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#guide-close').click()
            await page.locator('#add-route').click();await page.locator('#city-search').fill('LAX')
            await page.locator('[data-destination="LAX"]').click()
            assert await page.locator('[data-type]').count()==1
            assert await page.locator('[data-type="MQ-350"]').count()
            assert '14,000' in await page.locator('[data-type="MQ-350"] .aircraft-stats').inner_text()
            assert '320' in await page.locator('[data-type="MQ-350"] .aircraft-stats').inner_text()
            assert await page.locator('#pscroll .range-comparison.fits').count()==1
            await page.locator('#aircraft-guide').click()
            assert await page.locator('[data-guide-aircraft="MQ-320"] .too-far').count()==1
            assert await page.locator('[data-guide-aircraft="MQ-350"] .fits').count()==1
            await page.screenshot(path=str(OUT/f'long-haul-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#guide-close').click();await page.locator('#back').click()
            await page.locator('[data-tab="fleet"]').click()
            assert await page.locator('.fleet-card .aircraft-stats').count()==3
            await page.locator('#menu-btn').click();await page.locator('[data-m="home"]').click()
            await page.locator('#configure-game').click();await page.locator('[data-mode="decade"]').click();await page.locator('#setup-close').click();await page.locator('#go-new').click()
            await page.locator('[data-opt="lcc"]').click();await page.locator('[data-dock="routes"]').click();await page.locator('#aircraft-guide').click()
            assert '186' in await page.locator('[data-guide-aircraft="MQ-320"] .aircraft-stats').inner_text()
            assert '370' in await page.locator('[data-guide-aircraft="MQ-350"] .aircraft-stats').inner_text()
            await page.locator('#guide-close').click();await page.locator('#lang-btn').click();await page.locator('[data-dock="routes"]').click()
            await page.locator('#aircraft-guide').click()
            assert 'MAX RANGE' in await page.locator('.modal').inner_text()
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            assert not errors,errors
            results.append({'width':width,'height':height,'dark':dark,'aircraft':6,'longHaul':'passed','lccSeats':'passed','defaultMute':True,'errors':errors})
            print(f'Passed {width}x{height}, dark={dark}',flush=True)
            await context.close()
        await browser.close()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))

asyncio.run(main())
