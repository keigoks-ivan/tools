"""Expanded-airport discovery and route workflow in isolated Chrome."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ.get('AIRLINE_URL', 'http://127.0.0.1:8766/games/airline/')
OUT = Path(os.environ.get('AIRLINE_OUTPUT', '/tmp/airline-cities'))
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for width, height, dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context = await browser.new_context(viewport={'width':width,'height':height}, color_scheme='dark' if dark else 'light', has_touch=width<900)
            page = await context.new_page(); errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto(URL+'?debug=1'); await page.locator('#go-new').click()
            assert '180' in await page.locator('#add-route').inner_text()
            await page.locator('#add-route').click()
            assert await page.locator('[data-destination]').count() == 179
            counts = {}
            for region in await page.evaluate('Object.keys(__tq.B.CITY_REGIONS)'):
                await page.locator('#city-region').select_option(region)
                ids = await page.locator('[data-destination]').evaluate_all('(els)=>els.map(e=>e.dataset.destination)')
                assert ids and await page.evaluate('({ids,region})=>ids.every(id=>__tq.B.CITIES[id].region===region)', {'ids':ids,'region':region})
                counts[region] = len(ids)
            await page.locator('#city-region').select_option('all')
            await page.locator('#city-search').fill('  khh  ')
            assert await page.locator('[data-destination]').count() == 1
            await page.locator('#city-search').fill('Kaohsiung')
            assert await page.locator('[data-destination="KHH"]').count() == 1
            await page.locator('#city-search').fill('高雄')
            assert await page.locator('[data-destination="KHH"]').count() == 1
            await page.locator('#city-search').fill('no-such-airport')
            assert await page.locator('.destination-empty').count() == 1
            await page.locator('#city-search').fill('')
            await page.locator('#city-reachable').check()
            reachable = await page.locator('[data-destination]').count()
            assert 0 < reachable < 179
            assert await page.evaluate('''()=>[...document.querySelectorAll('[data-destination]')].every(e=>__tq.B.routeOptions(__tq.app.state,e.dataset.destination).eligibleTypes.length)''')
            await page.locator('#city-reachable').uncheck()
            await page.locator('#city-region').select_option('africa')
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
            await page.screenshot(path=str(OUT/f'catalog-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#city-region').select_option('all')
            # Every new airport must render safely in the desktop route editor, including unreachable ones.
            if width == 1280 and not dark:
                ids = await page.evaluate('Object.keys(__tq.B.CITIES).slice(32)')
                for city in ids:
                    await page.locator('#city-search').fill(city)
                    await page.locator(f'[data-destination="{city}"]').click()
                    assert await page.locator('#back').count()
                    await page.locator('#back').click(); await page.locator('#add-route').click()
            await page.locator('#city-search').fill('KHH')
            await page.locator('[data-destination="KHH"]').click()
            await page.locator('[data-type="MQ-72"]').click(); await page.locator('#open').click()
            assert await page.locator('[data-route="KHH"]').count()
            await page.locator('#run').click(); await page.locator('#pause').click()
            await page.reload(); await page.locator('[data-continue="year"]').click()
            assert await page.evaluate('__tq.app.active.start.routes.some(r=>r.city==="KHH"&&r.type==="MQ-72")')
            await page.locator('#skip').click()
            assert await page.evaluate('__tq.app.report.routes.some(r=>r.city==="KHH"&&r.pax>0)')
            await page.locator('#next').click(); await page.locator('#lang-btn').click()
            await page.locator('#add-route').click()
            assert '180 airports' in await page.locator('.modal').inner_text()
            await page.locator('#city-region').select_option('southAmerica')
            assert 'South America' in await page.locator('[data-destination]').first.inner_text()
            assert not errors, errors
            results.append({'width':width,'height':height,'dark':dark,'regions':counts,'reachable':reachable,'routeAndSave':'passed','errors':errors})
            await context.close()
        await browser.close()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))

asyncio.run(main())
