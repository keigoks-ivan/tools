"""Edit next-turn routes from a settled report using disposable browser profiles.
AIRLINE_URL=http://127.0.0.1:8788/games/airline/ python3 games/airline/tests/report-planning-browser.py
"""
import asyncio, importlib.util, json, os
from pathlib import Path
from playwright.async_api import async_playwright

spec=importlib.util.spec_from_file_location('fleet',Path(__file__).with_name('fleet-browser.py'))
fleet=importlib.util.module_from_spec(spec);spec.loader.exec_module(fleet)
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline23-2-report-checks'));OUT.mkdir(parents=True,exist_ok=True)

async def frequency(page,n):
    while int(await page.locator('#wv').inner_text())!=n:
        await page.locator('#wp' if int(await page.locator('#wv').inner_text())<n else '#wm').click()

async def snapshot(page):
    return await page.evaluate('JSON.stringify({report:__tq.app.report,state:__tq.app.state})')

async def check(browser,name,width,height,locale):
    context=await browser.new_context(viewport={'width':width,'height':height},color_scheme='dark' if name=='dark' else 'light')
    page=await context.new_page();errors=[];console=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console.append(m.text) if m.type=='error' and '404' not in m.text else None)
    await page.goto(URL+'?v=23.2&debug=1');await page.locator('#configure-game').click()
    await page.locator('[data-mode=decade]').click();await page.locator('#setup-start').click();await fleet.core.answer_events(page)
    if locale=='en':await page.locator('#lang-btn').click()
    await page.locator('#hud-fleet').click()
    assert await page.locator('[data-fleet-model="MQ-320"]').count()==1
    assert await page.locator('[data-fleet-model="MQ-320"] [data-fleet-count]').inner_text()==('2\n現有架數' if locale=='zh' else '2\nin fleet')
    await page.wait_for_timeout(220);await page.screenshot(path=str(OUT/f'{name}-fleet.png'))
    for city,n in [('HKG',7),('NRT',3)]:
        await fleet.destination(page,city);await page.locator('[data-type="MQ-320"]').click();await frequency(page,n);await page.locator('#open').click()
    await page.locator('#hud-fleet').click();await page.locator('[data-express="MQ-350"]').click();await page.locator('[data-express="MQ-350"]').click()
    card=page.locator('[data-fleet-model="MQ-350"]')
    assert await card.locator('[data-cancel-order]').count()==2
    assert await card.locator('[data-fleet-count]').inner_text()==('0\n現有架數' if locale=='zh' else '0\nin fleet')
    await page.locator('#skip').click();await fleet.core.answer_events(page)
    if not await page.locator('#next').count():await page.locator('#skip').click()
    assert await page.locator('.aircraft-delivery-dialog [data-delivered-type]').count()==1
    assert '2' in await page.locator('.aircraft-delivery-dialog h2').inner_text()
    await page.locator('#delivery-confirm').click();before=await snapshot(page)
    box=page.locator('[data-result-city=HKG]')
    assert await page.locator('.result-route-planner').count()==2
    assert await box.locator('[data-result-type] option[value="MQ-72"]').evaluate('e=>e.disabled'),await box.locator('[data-result-type]').inner_html()
    assert await box.locator('[data-result-type] option[value="MQ-350"]').is_enabled(),'Delivered type must be selectable'
    await box.locator('[data-result-type]').select_option('MQ-190')
    await box.locator('[data-result-fare]').select_option('high')
    await box.locator('[data-result-delta="1"]').click()
    expected=await page.evaluate('({...__tq.app.draft.routes.get("HKG")})')
    assert expected=={'city':'HKG','type':'MQ-190','weekly':8,'fare':'high'},expected
    assert await snapshot(page)==before,'Changes cannot rewrite settled accounts or fleet'
    assert await page.evaluate('__tq.B.routeCapacity(__tq.app.state,[...__tq.app.draft.routes.values()]).fits')
    # Removing and restoring a route keeps its edited configuration.
    await box.locator('[data-result-toggle]').click();assert not await page.evaluate('__tq.app.draft.routes.has("HKG")')
    await box.locator('[data-result-toggle]').click();assert expected==await page.evaluate('({...__tq.app.draft.routes.get("HKG")})')
    await box.locator('[data-result-type]').select_option('MQ-350');await box.locator('[data-result-type]').select_option('MQ-190')
    assert expected==await page.evaluate('({...__tq.app.draft.routes.get("HKG")})')
    # The increase button stops at route or fleet capacity; decreasing remains possible.
    for _ in range(30):
        if await box.locator('[data-result-delta="1"]').is_disabled():break
        await box.locator('[data-result-delta="1"]').click()
    else:raise AssertionError('Frequency was not bounded')
    assert await page.evaluate('__tq.B.routeCapacity(__tq.app.state,[...__tq.app.draft.routes.values()]).fits')
    await box.locator('[data-result-delta="-1"]').click()
    expected=await page.evaluate('({...__tq.app.draft.routes.get("HKG")})')
    # Another route uses the same aircraft pool. Switching to a smaller fleet
    # reduces frequency to fit and explains the reduction to the player.
    nrt=page.locator('[data-result-city=NRT]')
    while int(await nrt.locator('output').inner_text())<10:await nrt.locator('[data-result-delta="1"]').click()
    await nrt.locator('[data-result-type]').select_option('MQ-190')
    assert int(await nrt.locator('output').inner_text())<10
    assert await nrt.locator('[data-result-delta="1"]').is_disabled()
    assert await nrt.locator('.result-plan-message').inner_text()
    assert await page.evaluate('__tq.B.routeCapacity(__tq.app.state,[...__tq.app.draft.routes.values()]).fits')
    await nrt.locator('[data-result-type]').select_option('MQ-320')
    await page.locator('#lang-btn').click();assert expected==await page.evaluate('({...__tq.app.draft.routes.get("HKG")})')
    assert await page.locator('#delivery-confirm').count()==0,'Rendering the same report cannot repeat delivery popup'
    await page.locator('#lang-btn').click();assert await snapshot(page)==before
    await box.scroll_into_view_if_needed();await box.locator('..').screenshot(path=str(OUT/f'{name}-report-edit.png'))
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.reload();await page.locator('[data-continue=decade]').click();await fleet.core.answer_events(page)
    assert expected==await page.evaluate('({...__tq.app.draft.routes.get("HKG")})'),'Report edits must survive reload'
    await page.locator('#skip').click();await fleet.core.answer_events(page)
    if not await page.locator('#next').count():await page.locator('#skip').click()
    actual=await page.evaluate('(()=>{const r=__tq.app.report.routes.find(r=>r.city==="HKG");return {city:r.city,type:r.type,weekly:r.weekly,fare:r.fare};})()')
    assert actual==expected,(actual,expected)
    assert await page.locator('#delivery-confirm').count()==0
    assert await page.evaluate('__tq.music.stats().muted') and not errors and not console,(errors,console)
    await context.close();return {'layout':name,'applied':actual,'errors':errors,'console':console}

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
        results=[]
        for args in [('desktop',1280,800,'zh'),('phone',390,844,'zh'),('landscape',844,390,'en'),('dark',1280,800,'en')]:
            results.append(await check(browser,*args))
        await browser.close()
    print(json.dumps(results,ensure_ascii=False,indent=2));(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

if __name__=='__main__':asyncio.run(main())
