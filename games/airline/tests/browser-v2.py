"""Isolated browser acceptance checks. Serve the repository before running.
AIRLINE_URL=http://127.0.0.1:8765/games/airline/ python3 games/airline/tests/browser-v2.py
Screenshots and measurements go to /tmp/airline-v2-checks by default.
"""
import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
URL = os.environ.get('AIRLINE_URL', 'http://127.0.0.1:8765/games/airline/')
OUT = Path(os.environ.get('AIRLINE_OUTPUT', '/tmp/airline-v2-checks'))
OUT.mkdir(parents=True, exist_ok=True)

async def decisions(page, kind='sensible'):
    return await page.evaluate('''async kind => {
        if(!window.testBots){const b=await import('./bots.mjs');window.testBots={sensible:b.sensibleBot(),naive:b.naiveBot()};}
        const a=__tq.app,s=a.state,d=testBots[kind](s,a.report);
        const ordered=__tq.B.applyDecisions(s,{routes:d.routes||s.routes,fleet:d.fleet||{},eventChoices:d.eventChoices,businessModel:d.businessModel});
        if(ordered.errors.length)throw new Error(JSON.stringify(ordered.errors));
        a.state=ordered.state;
        a.draft.routes=new Map((d.routes||s.routes).map(r=>[r.city,r]));
        a.draft.eventChoices={...a.draft.eventChoices,...(d.eventChoices||{})};
        if(d.hedge!==undefined)a.draft.hedge=d.hedge;
        if(d.businessModel)a.draft.businessModel=d.businessModel;
        return {turn:s.turn,routes:a.draft.routes.size};
    }''', kind)

async def answer_events(page):
    for _ in range(4):
        opts=page.locator('[data-opt]')
        if await opts.count(): await opts.first.click()
        else: break

async def refresh_panel(page):
    await page.locator('[data-dock="fleet"]').click()
    await page.locator('[data-dock="routes"]').click()

async def full_game(browser, mode, hub, kind):
    context=await browser.new_context(viewport={'width':1280,'height':800})
    page=await context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto(URL+'?debug=1')
    await page.locator('#configure-game').click();await page.locator(f'[data-mode="{mode}"]').click();await page.locator('#setup-close').click()
    await page.locator('#choose-hub').click();await page.locator('#hub-search').fill(hub);await page.locator(f'[data-pick-hub="{hub}"]').click()
    await page.locator('#go-new').click()
    await answer_events(page)
    await page.evaluate('''()=>{const a=__tq.app;a.state=__tq.B.newGame({mode:a.state.mode,hub:a.state.hub,seed:1});a.draft=null;}''')
    # Re-enter with a clean, fixed seed while retaining a real UI workflow.
    await page.locator('#menu-btn').click();await page.locator('[data-m="home"]').click()
    await page.evaluate('''()=>{const s=__tq.app.state;localStorage.setItem('tq-airline-save-'+s.mode,JSON.stringify({v:1,mode:s.mode,hub:s.hub,turn:0,cash:s.cash,state:__tq.B.serialize(s)}));}''')
    await page.reload();await page.locator(f'[data-continue="{mode}"]').click()
    for _ in range(25):
        if await page.evaluate('!!(__tq.app.state.finished||__tq.app.state.gameOver)'): break
        await answer_events(page)
        await decisions(page,kind)
        await page.locator('#skip').click()
        assert await page.locator('#next').count(), await page.evaluate('''()=>({error:'Settlement report missing',turn:__tq.app.state.turn,screen:__tq.app.screen,runmsg:document.querySelector('#runmsg')?.innerText,overlay:document.querySelector('#overlay')?.innerText})''')
        routes=await page.evaluate('__tq.app.report.routes.length')
        assert await page.locator('.reason').count()==routes, 'Per-route explanation missing'
        if not routes:
            assert await page.evaluate('__tq.app.report.company.costTotal>0 && __tq.app.report.company.revenue===0')
            assert '沒有航線收入，租金與固定費用仍要支付。' in await page.locator('.rwrap').inner_text()
        await page.locator('#next').click()
    summary=await page.evaluate('''()=>({mode:__tq.app.state.mode,hub:__tq.app.state.hub,...__tq.B.endReport(__tq.app.state)})''')
    assert not errors, errors
    if kind=='sensible': assert .005<=summary['marginTotal']<=.08 and summary['cash']>0, summary
    else: assert summary['marginTotal']<=-.1 or summary['bankrupt'],summary
    await context.close();return {'mode':mode,'hub':hub,'strategy':kind,'margin':summary['marginTotal'],'cash':summary['cash'],'turns':summary['turnsPlayed'],'bankrupt':summary['bankrupt']}

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        results={'viewports':[], 'games':[]}
        for width,height,dark in [(1280,800,False),(390,844,False),(844,390,False),(1280,800,True)]:
            context=await browser.new_context(viewport={'width':width,'height':height},color_scheme='dark' if dark else 'light',has_touch=width<900,device_scale_factor=1)
            page=await context.new_page();errors=[];console_errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('console',lambda m:console_errors.append(m.text) if m.type=='error' and 'favicon' not in m.text and '404' not in m.text else None)
            await page.goto(URL+'?debug=1');await page.wait_for_timeout(150)
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'Start overflow'
            await page.locator('#configure-game').click();await page.locator('[data-scenario="margin"]').click();await page.locator('#setup-close').click();await page.locator('#go-new').click()
            await answer_events(page)
            # Ordinary touch/click route creation and forecast selection.
            await page.locator('[data-dock="routes"]').click()
            await page.locator('#add-route').click();await page.locator('#city-search').fill('PVG')
            await page.locator('[data-destination="PVG"]').click()
            assert 'Airbus A320neo' in await page.locator('#pscroll').inner_text()
            await page.locator('#open').click()
            await decisions(page);await refresh_panel(page)
            await page.locator('#run').click();await page.wait_for_timeout(1100)
            await page.locator('#pause').click()
            assert not await page.evaluate('__tq.app.clock.running')
            before=await page.evaluate('__tq.app.clock.elapsed')
            await page.wait_for_timeout(500)
            assert abs(await page.evaluate('__tq.app.clock.elapsed')-before)<.05
            # Next-turn route changes cannot change the current frozen economic result.
            current=await page.evaluate('JSON.stringify(__tq.app.active.report)')
            await page.locator('[data-dock="routes"]').click()
            edited_city=await page.locator('[data-route]').first.get_attribute('data-route')
            await page.locator(f'[data-route="{edited_city}"]').first.click()
            await page.locator('[data-fare="high"]').click();await page.locator('#done').click()
            assert current==await page.evaluate('JSON.stringify(__tq.app.active.report)')
            elapsed=await page.evaluate('__tq.app.clock.elapsed')
            await page.reload();await page.locator('[data-continue="year"]').click()
            assert await page.evaluate('!__tq.app.clock.running && !!__tq.app.active')
            assert abs(await page.evaluate('__tq.app.clock.elapsed')-elapsed)<.25
            assert await page.evaluate('city=>__tq.app.draft.routes.get(city).fare',edited_city)=='high'
            await page.locator('#pause').click();await page.locator('[data-speed="4"]').click()
            await page.wait_for_timeout(1200)
            assert await page.evaluate('__tq.app.clock.elapsed')>elapsed+3
            await page.locator('#pause').click()
            await page.wait_for_timeout(1000)
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'Main overflow'
            await page.screenshot(path=str(OUT/f'network-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('[data-dock="hub"]').click();await page.locator('[data-facility="depot"]').click()
            await page.screenshot(path=str(OUT/f'hub-{width}x{height}{"-dark" if dark else ""}.png'))
            await page.locator('#skip').click();assert await page.locator('#next').count()
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'Report overflow'
            await page.locator('#next').click()
            assert await page.evaluate('__tq.app.draft.facilities.has("depot")'), 'Next-turn facility lost'
            assert await page.evaluate('city=>__tq.app.draft.routes.get(city).fare',edited_city)=='high'
            await page.locator('#lang-btn').click()
            assert await page.evaluate('document.documentElement.lang')=='en'
            await page.locator('#menu-btn').click();await page.locator('[data-m="src"]').click()
            assert 'NASA Earth Observatory' in await page.locator('#app').inner_text()
            assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),'Sources overflow'
            assert not errors,errors;assert not console_errors,console_errors
            perf=await page.evaluate('''()=>({bytes:performance.getEntriesByType('resource').reduce((n,e)=>n+e.decodedBodySize,0),external:performance.getEntriesByType('resource').filter(e=>!e.name.startsWith(location.origin)).map(e=>e.name)})''')
            assert perf['bytes']<8*1024*1024 and not perf['external'],perf
            results['viewports'].append({'width':width,'height':height,'dark':dark,**perf,'errors':errors})
            await context.close()
        for mode,hub,kind in [('year','TPE','sensible'),('decade','SIN','sensible'),('year','TPE','naive')]:
            results['games'].append(await full_game(browser,mode,hub,kind))
        # A model decision must agree with the fleet panel, estimates and actual operations.
        context=await browser.new_context();page=await context.new_page();await page.goto(URL+'?debug=1')
        await page.locator('#configure-game').click();await page.locator('[data-mode="decade"]').click();await page.locator('#setup-close').click();await page.locator('#go-new').click();await page.locator('[data-opt="lcc"]').click()
        assert await page.evaluate('__tq.app.draft.businessModel')=='lcc'
        await page.locator('[data-dock="fleet"]').click();await page.locator('[data-bm="fsc"]').click();await page.locator('[data-bm="lcc"]').click()
        assert await page.evaluate('__tq.app.draft.eventChoices["b-model"]')=='lcc'
        await page.locator('[data-tab="routes"]').click();await page.locator('#add-route').click();await page.locator('#city-search').fill('HKG')
        await page.locator('[data-destination="HKG"]').click();await page.locator('#open').click();await page.locator('#run').click()
        assert await page.evaluate('__tq.app.active.start.model')=='lcc'
        results['modelSwitch']='passed';await context.close()
        # Cold first-play bytes and frame time with the largest available network.
        context=await browser.new_context(viewport={'width':1280,'height':800})
        page=await context.new_page();await page.goto(URL+'?debug=1')
        await page.locator('#configure-game').click();await page.locator('[data-mode="decade"]').click();await page.locator('#setup-close').click();await page.locator('#go-new').click();await answer_events(page)
        await page.evaluate('''()=>{const a=__tq.app;a.draft.routes=new Map(Object.values(__tq.B.CITIES).filter(c=>c.id!==a.state.hub).map(c=>{const o=__tq.B.routeOptions(a.state,c.id);return {city:c.id,type:o.eligibleTypes.at(-1),weekly:7,fare:'mid'};}).filter(r=>r.type).map(r=>[r.city,r]));}''')
        await refresh_panel(page);await page.wait_for_timeout(2000)
        frames=await page.evaluate('''()=>new Promise(resolve=>{const times=[];let last=0;function frame(t){__tq.app.map.setTime({elapsed:t/1000,speed:1});if(last)times.push(t-last);last=t;if(times.length<120)requestAnimationFrame(frame);else{times.sort((a,b)=>a-b);__tq.app.map.setTime({elapsed:t/1000,speed:0});resolve({mean:times.reduce((a,b)=>a+b)/times.length,p95:times[Math.floor(times.length*.95)]});}}requestAnimationFrame(frame);})''')
        stats=await page.evaluate('__tq.app.map.stats()');assert not stats.get('fallback') and stats['frames']>10,stats
        results['performance']={'frameMs':frames,'renderer':stats,'decodedBytes':await page.evaluate('performance.getEntriesByType("resource").reduce((n,e)=>n+e.decodedBodySize,0)')}
        await context.close()
        # No-WebGL fallback must retain playable route controls.
        context=await browser.new_context(viewport={'width':390,'height':844})
        await context.add_init_script('''const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:get.call(this,type,...args);};''')
        page=await context.new_page();await page.goto(URL+'?debug=1');await page.locator('#go-new').click();await answer_events(page);await page.wait_for_timeout(1600)
        assert await page.locator('.airport-fallback').count()
        await page.locator('[data-dock="network"]').click();await page.wait_for_timeout(1400);assert await page.locator('.mapbox svg').count()
        await page.locator('[data-dock="routes"]').click();await page.locator('#add-route').click();await page.locator('[data-destination="PVG"]').click();await page.locator('#open').click();await page.locator('#skip').click();assert await page.locator('#next').count()
        results['fallback']='passed';await context.close()
        # Damaged saves are ignored without breaking a new game.
        context=await browser.new_context()
        await context.add_init_script("localStorage.setItem('tq-airline-save-year','broken json');")
        page=await context.new_page();await page.goto(URL);assert await page.locator('#go-new').count();await context.close()
        await browser.close()
        (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
        print(json.dumps(results,ensure_ascii=False,indent=2))
if __name__ == '__main__':
    asyncio.run(main())
