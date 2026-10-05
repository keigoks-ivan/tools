"""Validate the v19 art shell and free home-airport selection through real controls."""
import asyncio, json, os, importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline19-art'));OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('airline_browser',Path(__file__).with_name('browser-v2.py'))
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)

async def no_overflow(page):
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not await page.evaluate('''()=>[...document.querySelectorAll('.modal')].some(e=>e.scrollWidth>e.clientWidth+1)''')

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        proof={'views':[],'freeBaseGames':[]}
        for w,h,dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context=await browser.new_context(viewport={'width':w,'height':h},color_scheme='dark' if dark else 'light',has_touch=w<900)
            page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            label=f'{w}x{h}{"-dark" if dark else ""}'
            await page.goto(URL+'?debug=1');await page.locator('.hero-world img').evaluate('(e)=>e.decode()')
            await no_overflow(page);await page.screenshot(path=str(OUT/f'start-{label}.jpg'),type='jpeg',quality=88)
            await page.locator('#hero-hub-select').click();assert await page.locator('[data-pick-hub]').count()==180
            await page.locator('#hub-region').select_option('oceania');assert await page.locator('[data-pick-hub="SYD"]').count()==1
            await page.locator('#hub-search').fill('zzzzz');assert await page.locator('.hub-empty').count()==1
            await page.locator('#hub-search').fill('Sydney');assert await page.locator('[data-pick-hub]').count()==1
            await page.locator('[data-pick-hub="SYD"]').click();assert await page.locator('.selected-hub-code').inner_text()=='SYD'
            await page.reload();assert await page.locator('.selected-hub-code').inner_text()=='SYD'
            await page.locator('#choose-hub').click();await page.locator('#hub-search').fill('高雄');assert await page.locator('[data-pick-hub]').count()==1
            await page.locator('[data-pick-hub="KHH"]').click();await page.locator('#choose-hub').click()
            await page.locator('#hub-region').select_option('northAmerica');await no_overflow(page)
            await page.screenshot(path=str(OUT/f'airports-{label}.jpg'),type='jpeg',quality=88)
            await page.locator('#hub-search').fill('LAX');await page.locator('[data-pick-hub="LAX"]').click()
            await page.locator('#go-new').click();await helper.answer_events(page)
            assert await page.evaluate('__tq.app.state.hub')=='LAX'
            assert 'LAX' in await page.locator('.network-heading').inner_text()
            assert await page.evaluate('__tq.music.stats().muted')
            await page.locator('#base-launch').click();assert await page.locator('.hub-dialog-title h2').inner_text()=='洛杉磯'
            for facility in ['lounge','tank','depot']:
                await page.locator(f'.modal [data-hub-detail="{facility}"]').click()
                assert await page.locator(f'.modal [data-facility="{facility}"]').count()==1
            await page.locator('.modal [data-facility="depot"]').click()
            assert await page.evaluate('__tq.app.draft.facilities.has("depot")')
            await page.locator('.modal [data-facility="depot"]').click()
            assert not await page.evaluate('__tq.app.draft.facilities.has("depot")')
            await no_overflow(page);await page.screenshot(path=str(OUT/f'hub-{label}.jpg'),type='jpeg',quality=88)
            await page.locator('#hub-close').click()
            await helper.decisions(page);await helper.refresh_panel(page)
            await page.locator('#run').click();await page.locator('#pause').click();await page.wait_for_timeout(850)
            await no_overflow(page);await page.screenshot(path=str(OUT/f'network-{label}.jpg'),type='jpeg',quality=88)
            # The mission summary must not cover zoom controls.
            assert await page.evaluate('''()=>{let a=document.querySelector('.mission-pin').getBoundingClientRect(),b=document.querySelector('.mapctl').getBoundingClientRect();return a.top>=b.bottom||a.left>=b.right||b.left>=a.right;}''')
            resources=await page.evaluate('performance.getEntriesByType("resource").map(e=>({name:e.name,bytes:e.decodedBodySize}))')
            total=sum(x['bytes'] for x in resources);assert total<8_000_000
            assert all(x['name'].startswith(URL.split('/games/')[0]) for x in resources),resources
            await page.reload();await page.locator('[data-continue="year"]').click();assert await page.evaluate('__tq.app.state.hub')=='LAX'
            await page.locator('#skip').click();assert await page.locator('#next').count()==1
            assert await page.evaluate('__tq.app.state.hub')=='LAX'
            await page.locator('#next').click();await helper.answer_events(page)
            await page.locator('#lang-btn').click();await page.locator('#menu-btn').click();await page.locator('[data-m="home"]').click()
            await page.locator('#choose-hub').click();await page.locator('#hub-search').fill('Paris');await page.locator('[data-pick-hub="CDG"]').click()
            await page.locator('#go-new').click();await helper.answer_events(page)
            assert 'Paris' in await page.locator('.network-heading').inner_text()
            assert not errors,errors
            proof['views'].append({'viewport':label,'errors':errors,'firstPlayDecodedBytes':total,'hubReload':'LAX','englishHub':'CDG'})
            await context.close()
        # Full playthroughs from bases outside the original five. Margins may differ by local market.
        for hub,mode in [('LAX','year'),('SYD','decade')]:
            context=await browser.new_context(viewport={'width':1280,'height':800});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            await page.goto(URL+'?debug=1');await page.locator(f'[data-mode="{mode}"]').click();await page.locator('#choose-hub').click();await page.locator('#hub-search').fill(hub);await page.locator(f'[data-pick-hub="{hub}"]').click();await page.locator('#go-new').click();await helper.answer_events(page)
            for _ in range(21):
                if await page.evaluate('__tq.app.state.finished||__tq.app.state.gameOver'):break
                await helper.answer_events(page);await helper.decisions(page);await page.locator('#skip').click()
                assert await page.locator('#next').count()==1
                assert await page.locator('.reason').count()==await page.evaluate('__tq.app.report.routes.length')
                await page.locator('#next').click()
            assert await page.evaluate('__tq.app.state.hub')==hub
            result=await page.evaluate('''()=>{let s=__tq.app.state,r=__tq.B.endReport(s);return {hub:s.hub,mode:s.mode,turns:s.turn,finished:s.finished,bankrupt:!!s.gameOver,margin:r.marginTotal,cash:s.cash};}''')
            assert result['finished'] or result['bankrupt'];assert not errors,errors
            proof['freeBaseGames'].append(result);await context.close()
        await browser.close()
        (OUT/'verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2));print(json.dumps(proof,ensure_ascii=False))

asyncio.run(main())
