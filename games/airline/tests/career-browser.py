"""Exercise dispatch choices, settlement rewards and persistent passport in isolated Chrome."""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline-v18-career'));OUT.mkdir(parents=True,exist_ok=True)

async def answer_events(page):
    for _ in range(5):
        opts=page.locator('[data-opt]')
        if not await opts.count():break
        await opts.first.click()

async def no_overflow(page):
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'Page overflow'
    assert not await page.evaluate('''()=>[...document.querySelectorAll('.modal')].some(e=>e.scrollWidth>e.clientWidth+1)'''),'Dialog overflow'

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        results=[]
        for width,height,dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context=await browser.new_context(viewport={'width':width,'height':height},color_scheme='dark' if dark else 'light',has_touch=width<900)
            page=await context.new_page();errors=[];console=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:console.append(m.text) if m.type=='error' and 'favicon' not in m.text and '404' not in m.text else None)
            label=f'{width}x{height}{"-dark" if dark else ""}'
            await page.goto(URL+'?debug=1');await page.locator('#configure-game').click();await page.locator('[data-scenario="margin"]').click();await page.locator('#setup-close').click();await page.locator('#go-new').click();await answer_events(page)
            assert await page.evaluate('__tq.music.stats().muted')
            await page.locator('#music-btn').click();await page.wait_for_function('!__tq.music.stats().busy');await page.wait_for_timeout(650)
            sound=await page.evaluate('__tq.music.stats()');assert not sound['muted'] and sound['rms']>0 and len(sound['chords'])==16
            await page.locator('#music-btn').click();await page.wait_for_timeout(300)
            silent=await page.evaluate('__tq.music.stats()');assert silent['muted'] and silent['rms']==0 and silent['gain']==0 and silent['context']=='suspended'
            await page.locator('#mission-pin').click()
            assert await page.locator('[data-mission-accept]').count()==3
            await no_overflow(page);await page.screenshot(path=str(OUT/f'dispatch-{label}.jpg'),type='jpeg',quality=86)
            # Inspect the rival radar and use its city link to enter a real route editor.
            await page.locator('[data-rival-board]').click();assert await page.locator('[data-rival-city]').count()>0
            await no_overflow(page);await page.screenshot(path=str(OUT/f'rivals-{label}.jpg'),type='jpeg',quality=86)
            await page.locator('[data-rival-city]').first.click();assert await page.locator('#your-seats').count()
            await page.locator('#back').click();await page.locator('#mission-pin').click()
            city=await page.locator('.dispatch-card.explore .dispatch-route>b').first.inner_text()
            await page.locator('.dispatch-card.explore [data-mission-accept]').first.click()
            assert await page.evaluate('c=>__tq.app.state.career.active.city===c',city)
            assert await page.locator('.mission-route-note').count();assert await page.locator('#open').count()
            assert await page.evaluate('Object.keys(__tq.app.state.career.stamps).length')==0
            await page.locator('#open').click();await no_overflow(page)
            await page.locator('[data-tab="missions"]').click();assert await page.locator('.dispatch-card.accepted').count()
            await page.locator('[data-passport]').click();assert await page.locator('.passport-album').count()==7
            assert await page.locator('.city-stamp.collected').count()==0
            await page.locator('[data-career-close]').click()
            await page.locator('#run').click();await page.locator('#pause').click()
            assert await page.locator('#mission-delivery').is_visible()
            assert '運送示意' in await page.locator('#mission-delivery').inner_text()
            frozen=await page.evaluate('JSON.stringify(__tq.app.active.report)')
            await page.locator('#mission-pin').click();assert await page.locator('.modal [data-mission-abandon]').is_disabled()
            await page.locator('[data-career-close]').click()
            await page.reload();await page.locator('[data-continue="year"]').click()
            assert await page.evaluate('!!__tq.app.active && !__tq.app.clock.running && !!__tq.app.state.career.active')
            assert frozen==await page.evaluate('JSON.stringify(__tq.app.active.report)')
            await page.locator('#skip').click();assert await page.locator('#next').count()
            assert await page.evaluate('c=>!!__tq.app.state.career.stamps[c]',city)
            assert await page.evaluate('c=>!!JSON.parse(localStorage.getItem("tq-airline-passport")).stamps[c]',city)
            await no_overflow(page);await page.wait_for_timeout(550);await page.screenshot(path=str(OUT/f'rewards-{label}.jpg'),type='jpeg',quality=86)
            for _ in range(2):
                if await page.evaluate('!__tq.app.state.career.active'):break
                await page.locator('#next').click();await answer_events(page);await page.locator('#skip').click()
            assert await page.evaluate('__tq.app.state.career.completed.length')==1
            assert await page.evaluate('__tq.app.report.career.mission.success')
            xp=await page.evaluate('__tq.app.state.career.xp')
            await page.wait_for_timeout(550);await page.screenshot(path=str(OUT/f'mission-complete-{label}.jpg'),type='jpeg',quality=86)
            await page.locator('[data-passport]').click()
            await page.locator('.passport-album').filter(has=page.locator(f'.city-stamp b:text-is("{city}")')).locator('summary').click()
            assert await page.locator('.city-stamp.collected').count()>=1
            await no_overflow(page);await page.screenshot(path=str(OUT/f'passport-{label}.jpg'),type='jpeg',quality=86)
            await page.locator('[data-career-close]').click();await page.locator('#next').click();await answer_events(page)
            await page.locator('#lang-btn').click();await page.locator('#mission-pin').click()
            assert 'Choose your next adventure' in await page.locator('.dispatch-heading').inner_text()
            await no_overflow(page);await page.locator('[data-career-close]').click()
            # New games reset airline XP but retain the lifetime city collection.
            await page.locator('#menu-btn').click();await page.locator('[data-m="home"]').click()
            await page.locator('#go-new').click();await answer_events(page)
            assert await page.evaluate('__tq.app.state.career.xp')==0
            await page.locator('#mission-pin').click();await page.locator('[data-passport]').click()
            assert await page.locator('.city-stamp.collected').count()>=1
            assert await page.locator('.city-stamp.this-game').count()==0
            assert await page.evaluate('__tq.music.stats().muted')
            perf=await page.evaluate('''()=>({bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.decodedBodySize,0),external:performance.getEntriesByType('resource').filter(r=>!r.name.startsWith(location.origin)).map(r=>r.name)})''')
            assert perf['bytes']<8*1024*1024 and not perf['external'],perf
            assert not errors and not console,{'errors':errors,'console':console}
            results.append({'viewport':label,'missionCity':city,'xp':xp,'passed':True,'music':{'chords':len(sound['chords']),'audibleRms':sound['rms'],'mutedRms':silent['rms']},**perf})
            await context.close()
        await browser.close();(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
asyncio.run(main())
