"""Staff readiness, fixed payroll, lease commitments and reconciled cash in isolated profiles."""
import asyncio,importlib.util,json,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('fleet',Path(__file__).with_name('fleet-browser.py'))
fleet=importlib.util.module_from_spec(spec);spec.loader.exec_module(fleet)
URL=os.environ.get('AIRLINE_URL','http://127.0.0.1:8788/games/airline/')
OUT=Path(os.environ.get('AIRLINE_OUTPUT','/tmp/airline25-management-browser'));OUT.mkdir(parents=True,exist_ok=True)
async def check(browser,name,w,h,lang):
    context=await browser.new_context(viewport={'width':w,'height':h},color_scheme='dark' if name=='dark' else 'light')
    page=await context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto(URL+'?v=25&debug=1');await page.locator('#go-new').click();await fleet.core.answer_events(page)
    if lang=='en':await page.locator('#lang-btn').click()
    await page.locator('#hud-fleet').click()
    assert await page.locator('[data-crew-type="MQ-320"] [data-crew-ready]').inner_text()=='2'
    assert await page.locator('[data-cash-runway]').inner_text()
    cash=await page.evaluate('__tq.app.state.cash')
    upfront=await page.evaluate('__tq.B.aircraftQuote(__tq.app.state,"MQ-350","lease",true).upfront')
    fee=await page.evaluate('__tq.B.crewQuote(__tq.app.state,"MQ-350").fee')
    await page.locator('[data-express="MQ-350"]').click();await page.locator('[data-hire="MQ-350"]').click()
    assert abs(await page.evaluate('__tq.app.state.cash')-(cash-upfront-fee))<.01
    assert await page.evaluate('__tq.app.state.fleetOrders[0].readyTurn===1&&__tq.app.state.crewOrders[0].readyTurn===2')
    # Cancelling a separate recruitment refunds half its fee, keeping the long-haul plan intact.
    cash=await page.evaluate('__tq.app.state.cash');atr=await page.evaluate('__tq.B.crewQuote(__tq.app.state,"MQ-72").fee')
    await page.locator('[data-hire="MQ-72"]').click();await page.locator('[data-crew-type="MQ-72"] [data-cancel-crew]').click()
    assert abs(await page.evaluate('__tq.app.state.cash')-(cash-atr/2))<.01
    await page.reload();await page.locator('[data-continue=year]').click();await fleet.core.answer_events(page)
    await page.locator('#hud-fleet').click();card=page.locator('[data-crew-type="MQ-350"]')
    assert await card.locator('[data-crew-pending]').inner_text()=='1'
    await card.scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{name}-staffing.png'))
    await fleet.turn(page)
    assert await page.evaluate('__tq.app.state.fleet.length===3&&(__tq.app.state.crews["MQ-350"]||0)===0')
    await fleet.destination(page,'LAX');await page.locator('[data-type="MQ-350"]').click()
    while int(await page.locator('#wv').inner_text())>1:await page.locator('#wm').click()
    assert await page.locator('#open').is_disabled()
    assert ('合格機組不足' if lang=='zh' else 'qualified rosters') in await page.locator('#route-capacity').inner_text()
    await page.screenshot(path=str(OUT/f'{name}-crew-lock.png'))
    await page.locator('#route-fleet').click();await page.locator('#world-run').click();await fleet.core.answer_events(page)
    if not await page.evaluate('!!__tq.app.active'):await page.locator('#world-run').click()
    await page.locator('#hud-fleet').click();assert await page.locator('[data-hire="MQ-350"]').is_disabled()
    frozen=await page.evaluate('JSON.stringify(__tq.app.active.report)')
    await page.locator('#skip').click();await fleet.core.answer_events(page)
    if not await page.locator('#next').count():await page.locator('#skip').click()
    assert await page.locator('[data-crew-complete="MQ-350"]').count()==1
    assert frozen==await page.evaluate('JSON.stringify(__tq.app.report)')
    assert await page.evaluate('(()=>{const f=__tq.app.report.company.cashFlow;return Math.abs(f.opening+f.aircraft+f.staff+f.fuel+f.financing+f.operating+f.debtPayments+f.leaseDeferral-f.closing)<.01})()')
    await page.locator('.cash-flow-report').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'{name}-cash-flow.png'))
    await page.locator('#next').click();await fleet.core.answer_events(page)
    await fleet.destination(page,'LAX');await page.locator('[data-type="MQ-350"]').click()
    while int(await page.locator('#wv').inner_text())>1:await page.locator('#wm').click()
    assert await page.locator('#open').is_enabled();await page.locator('#open').click()
    await page.locator('#hud-fleet').click();assert await page.locator('[data-release-crew="MQ-350"]').is_disabled()
    await page.locator('[data-fleet-model="MQ-350"] .lease-contracts summary').click()
    assert 'TQ-' in await page.locator('[data-fleet-model="MQ-350"] .lease-contracts').inner_text()
    await fleet.turn(page)
    assert await page.evaluate('__tq.app.report.routes.some(r=>r.city==="LAX"&&r.pax>0)')
    assert await page.evaluate('__tq.app.report.company.fixedPayroll>0')
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert await page.evaluate('__tq.music.stats().muted') and not errors,errors
    result={'layout':name,'qualified350':await page.evaluate('__tq.app.state.crews["MQ-350"]'),'errors':errors,'muted':True}
    await context.close();return result
async def model_choice(browser):
    context=await browser.new_context(viewport={'width':1280,'height':800});page=await context.new_page()
    await page.goto(URL+'?v=25&debug=1');await page.locator('#configure-game').click()
    await page.locator('[data-mode=decade]').click();await page.locator('#setup-start').click();await fleet.core.answer_events(page)
    await page.locator('#hud-fleet').click();await page.locator('[data-bm=lcc]').click()
    cash=await page.evaluate('__tq.app.state.cash')
    fee=await page.evaluate('__tq.B.crewQuote({...__tq.app.state,model:"lcc"},"MQ-350").fee')
    await page.locator('[data-hire="MQ-350"]').click()
    assert await page.evaluate('__tq.app.state.model==="lcc"')
    assert abs(await page.evaluate('__tq.app.state.cash')-(cash-fee))<.01
    assert await page.evaluate('__tq.music.stats().muted')
    await context.close();return {'businessModel':'lcc','quotedTrainingFee':fee,'correctCharge':True}
async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(channel='chrome',headless=True,args=['--use-angle=metal'])
        results=[]
        for args in [('desktop',1280,800,'zh'),('phone',390,844,'zh'),('landscape',844,390,'en'),('dark',1280,800,'en')]:results.append(await check(browser,*args))
        results.append(await model_choice(browser))
        await browser.close()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
if __name__=='__main__':asyncio.run(main())
