"""Manual aircraft ordering acceptance, using disposable browser profiles.
AIRLINE_URL=http://127.0.0.1:8788/games/airline/ python3 games/airline/tests/fleet-browser.py
"""
import asyncio, importlib.util, json, os
from pathlib import Path
from playwright.async_api import async_playwright

spec=importlib.util.spec_from_file_location('core',Path(__file__).with_name('browser-v2.py'))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline23-fleet-checks'));OUT.mkdir(parents=True,exist_ok=True)

async def state(page):
    return await page.evaluate('''()=>{const a=__tq.app,s=a.state;return {cash:s.cash,fleet:s.fleet.length,orders:s.fleetOrders.length,limits:__tq.B.fleetLimits(s),muted:__tq.music.stats().muted};}''')

async def turn(page):
    await core.answer_events(page);await page.locator('#skip').click()
    await core.answer_events(page)
    if not await page.locator('#next').count(): await page.locator('#skip').click()
    assert await page.locator('#next').count()
    deliveries=await page.evaluate('__tq.app.report.deliveries.length')
    if deliveries:
        assert await page.locator('.aircraft-delivery-dialog').count()==1
        assert await page.locator('.aircraft-delivery-dialog [data-delivered-type]').count()>0
        await page.locator('#delivery-confirm').click()
        assert await page.locator('.fleet-delivered').count()==1
    else: assert await page.locator('#delivery-confirm').count()==0
    await page.locator('#next').click();await core.answer_events(page)

async def destination(page,city):
    await page.locator('[data-dock=routes]').click();await page.locator('#add-route').click()
    await page.locator('#city-search').fill(city);await page.locator(f'[data-destination={city}]').click()

async def year(browser,width,locale):
    context=await browser.new_context(viewport={'width':width,'height':844 if width<500 else 800})
    page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto(URL+'?v=23&debug');await page.locator('#go-new').click();await core.answer_events(page)
    if locale=='en':await page.locator('#lang-btn').click()
    await page.locator('[data-dock=fleet]').click();before=await state(page)
    assert before['fleet']==2 and before['muted']
    await page.locator('[data-lease="MQ-350"]').click();ordered=await state(page)
    assert ordered['fleet']==2 and ordered['orders']==1
    assert ordered['cash']==before['cash']-1900000
    await page.locator('[data-lease="MQ-320"]').click();assert (await state(page))['limits']['ordersLeft']==0
    assert await page.locator('[data-lease="MQ-350"]').is_disabled()
    await page.locator('[data-fleet-model="MQ-350"] [data-cancel-order]').click()
    assert (await state(page))['orders']==1 and (await state(page))['limits']['ordersLeft']==0
    assert (await state(page))['cash']==before['cash']-800000-285000
    # Save/reload retains the committed deposit, queue and spent quota.
    await page.reload();await page.locator('[data-continue=year]').click();await core.answer_events(page)
    assert (await state(page))['limits']['ordersLeft']==0
    await destination(page,'LAX');assert await page.locator('#open').is_disabled()
    await page.screenshot(path=str(OUT/f'locked-{width}-{locale}.png'))
    await page.locator('#route-fleet').click()
    await destination(page,'HKG');assert await page.locator('#open').is_enabled()
    await page.locator('#open').click();await page.locator('#world-run').click();await core.answer_events(page)
    if not await page.evaluate('!!__tq.app.active'):await page.locator('#world-run').click()
    frozen=await page.evaluate('JSON.stringify(__tq.app.active.report)')
    await page.locator('[data-dock=fleet]').click();assert await page.locator('[data-lease="MQ-320"]').is_disabled()
    assert frozen==await page.evaluate('JSON.stringify(__tq.app.active.report)')
    await turn(page);assert (await state(page))['fleet']==2 and (await state(page))['orders']==1
    await turn(page);assert (await state(page))['fleet']==3 and (await state(page))['orders']==0
    # Physical capacity, including pending aircraft, is binding even with money left.
    await page.locator('[data-dock=fleet]').click()
    await page.locator('[data-lease="MQ-320"]').click();await page.locator('[data-lease="MQ-320"]').click()
    await turn(page);assert (await state(page))['fleet']==3
    await turn(page);assert (await state(page))['fleet']==5
    await page.locator('[data-dock=fleet]').click();await page.locator('[data-lease="MQ-320"]').click()
    assert (await state(page))['limits']['committed']==6
    assert await page.locator('[data-lease="MQ-350"]').is_disabled()
    await turn(page);await turn(page);await page.locator('[data-dock=fleet]').click()
    assert await page.locator('[data-lease="MQ-320"]').is_disabled()
    await page.screenshot(path=str(OUT/f'capacity-{width}-{locale}.png'))
    await page.locator('[data-dock=hub]').click();await page.locator('[data-facility=depot]').click()
    assert (await state(page))['limits']['maxFleet']==6
    await turn(page);assert (await state(page))['limits']['maxFleet']==6
    await turn(page);assert (await state(page))['limits']['maxFleet']==6
    await turn(page);await page.locator('[data-dock=fleet]').click()
    assert (await state(page))['limits']['maxFleet']==10
    assert await page.locator('[data-lease="MQ-320"]').is_enabled()
    await page.locator('[data-return="MQ-320"]').click();assert (await state(page))['fleet']==5
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not errors,errors;assert (await state(page))['muted']
    result={'width':width,'locale':locale,'state':await state(page),'errors':errors}
    await context.close();return result

async def decade(browser):
    context=await browser.new_context(viewport={'width':1280,'height':800});page=await context.new_page()
    await page.goto(URL+'?v=23&debug');await page.locator('#configure-game').click()
    await page.locator('[data-mode=decade]').click();await page.locator('#setup-start').click();await core.answer_events(page)
    assert (await state(page))['fleet']==3
    await page.locator('[data-dock=fleet]').click();before=await state(page)
    assert await page.locator('[data-express="MQ-320"]').is_disabled(), 'Do not charge for express when standard delivery is equally fast'
    await page.locator('[data-buy="MQ-350"]').click();ordered=await state(page)
    assert ordered['orders']==1 and ordered['fleet']==3 and ordered['cash']==before['cash']-28000000
    await turn(page);assert (await state(page))['fleet']==3
    await turn(page);assert (await state(page))['fleet']==3
    await turn(page);assert (await state(page))['fleet']==4
    assert await page.evaluate('__tq.app.state.fleet.some(a=>a.type==="MQ-350"&&a.kind==="own"&&a.loan>0)')
    await page.locator('[data-dock=fleet]').click();await page.locator('[data-sell="MQ-350"]').click()
    assert (await state(page))['fleet']==3
    await context.close();return 'purchase, delivery, loan and sale passed'

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
        results=[await year(browser,1280,'zh'),await year(browser,390,'en'),await decade(browser)]
        await browser.close();print(json.dumps(results,ensure_ascii=False,indent=2));(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

if __name__=='__main__':asyncio.run(main())
