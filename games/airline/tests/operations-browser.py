"""Delivery lead times, care decisions and construction in disposable browser profiles."""
import asyncio,importlib.util,json,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('fleet',Path(__file__).with_name('fleet-browser.py'))
fleet=importlib.util.module_from_spec(spec);spec.loader.exec_module(fleet)
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline24-operations'));OUT.mkdir(parents=True,exist_ok=True)
async def frequency(page,n):
    for _ in range(28):
        current=int(await page.locator('#wv').inner_text())
        if current==n:return
        await page.locator('#wp' if current<n else '#wm').click()
    raise AssertionError('Frequency did not reach target')
async def check(browser,name,w,h,lang):
    context=await browser.new_context(viewport={'width':w,'height':h},color_scheme='dark' if name=='dark' else 'light')
    page=await context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and '404' not in m.text else None)
    await page.goto(URL+'?v=24&debug=1');await page.locator('#go-new').click();await fleet.core.answer_events(page)
    if lang=='en':await page.locator('#lang-btn').click()
    await fleet.destination(page,'NRT');await page.locator('[data-type="MQ-320"]').click();await frequency(page,23);await page.locator('#open').click()
    await page.locator('#hud-fleet').click()
    care=page.locator('[data-care-type="MQ-320"]')
    await care.locator('[data-policy=care]').click()
    assert await page.locator('#fleetmsg').inner_text(),'Care must explain the required schedule slack'
    assert await care.locator('[data-policy=balanced]').get_attribute('aria-pressed')=='true'
    await page.locator('[data-dock=routes]').click();await page.locator('[data-route=NRT]').click();await frequency(page,20)
    await page.locator('#back').click();await page.locator('#hud-fleet').click()
    await care.locator('[data-policy=care]').click();assert await care.locator('[data-policy=care]').get_attribute('aria-pressed')=='true'
    assert await page.evaluate('__tq.app.draft.maintenance["MQ-320"]==="care"')
    # Demonstrate persistent aircraft condition without advancing unrelated event periods.
    await page.evaluate('__tq.app.state.fleetCondition["MQ-320"]=70')
    await page.locator('[data-lease="MQ-350"]').click();await page.locator('[data-express="MQ-320"]').click()
    assert await page.evaluate('__tq.app.state.fleetOrders.map(o=>o.readyTurn).join(",")==="3,1"')
    assert await page.locator('[data-lease="MQ-320"]').is_disabled()
    await care.scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{name}-fleet.png'))
    await page.reload();await page.locator('[data-continue=year]').click();await fleet.core.answer_events(page)
    assert await page.evaluate('__tq.app.draft.maintenance["MQ-320"]==="care"')
    assert await page.evaluate('__tq.app.state.fleetCondition["MQ-320"]===70')
    await page.locator('[data-dock=hub]').click();await page.locator('[data-facility=depot]').click()
    await fleet.core.answer_events(page);await page.locator('#skip').click();await fleet.core.answer_events(page)
    if not await page.locator('#next').count():await page.locator('#skip').click()
    await page.locator('#delivery-confirm').click()
    await page.locator('.operations-report').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{name}-care-report.png'))
    await page.locator('#next').click();await fleet.core.answer_events(page)
    assert await page.evaluate('__tq.app.state.fleet.length===3&&__tq.app.state.fleetOrders.length===1')
    assert await page.evaluate('__tq.app.report.operations[0].cancel>.05&&__tq.app.report.routes[0].technicalCancel>.05')
    assert await page.evaluate('__tq.app.report.routes[0].reasonKey==="maintenance"')
    assert await page.evaluate('__tq.app.state.facilityOrders[0].readyTurn===3&&!__tq.app.state.facilities.depot')
    await page.locator('[data-dock=hub]').click();assert await page.locator('[data-facility=depot]').is_disabled()
    await page.screenshot(path=str(OUT/f'{name}-construction.png'))
    await fleet.turn(page);assert await page.evaluate('__tq.app.state.fleet.length===3&&__tq.app.state.fleetOrders[0].readyTurn===3')
    await fleet.core.answer_events(page);await page.locator('#skip').click();await fleet.core.answer_events(page)
    if not await page.locator('#next').count():await page.locator('#skip').click()
    await page.locator('#delivery-confirm').click()
    assert await page.evaluate('__tq.app.state.fleet.length===4&&__tq.app.state.fleetOrders.length===0')
    assert await page.evaluate('!!__tq.app.state.facilities.depot&&__tq.B.fleetLimits(__tq.app.state).maxFleet===10')
    assert await page.evaluate('__tq.app.report.facilityCompletions[0]==="depot"&&__tq.app.report.company.facilityRunning===0')
    assert await page.locator('.operations-report [data-operation-type]').count()>0
    assert await page.locator('.construction-complete').count()==1
    assert await page.locator('.result-route-planner').count()==1
    report=await page.evaluate('JSON.stringify(__tq.app.report)')
    await page.locator('[data-result-fare]').select_option('high')
    assert report==await page.evaluate('JSON.stringify(__tq.app.report)')
    await page.locator('.operations-report').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{name}-report.png'))
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert await page.evaluate('__tq.music.stats().muted')
    assert not errors,errors
    result={'layout':name,'errors':errors,'fleet':await page.evaluate('__tq.app.state.fleet.length'),'muted':True}
    await context.close();return result
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
        results=[]
        for args in [('desktop',1280,800,'zh'),('phone',390,844,'zh'),('landscape',844,390,'en'),('dark',1280,800,'en')]:results.append(await check(browser,*args))
        await browser.close()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
if __name__=='__main__':asyncio.run(main())
