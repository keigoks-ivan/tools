"""創業之城 第 1 步自動試玩（headless chromium）。
用法：python3 test/playtest.py [--shots]    先在 /Users/ivanchang/tools 開 http.server。
流程：新遊戲 → 點空店面 → 借青創貸款 → 開店 → 改價格和排班 → 快轉 → 營業畫面 → 報表 → 事件卡 → 數字來源 → 重新整理確認存檔 → 手機版。
全程 console 不能有錯誤。"""
import sys, os, json, time, subprocess, socket
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'design', 'step1-play')
ROOT = '/Users/ivanchang/tools'
os.makedirs(OUT, exist_ok=True)

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

port = free_port()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = f'http://127.0.0.1:{port}/games/tycoon/index.html'
errors, results = [], []

def check(name, ok, info=''):
    results.append((name, ok, info))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))

def hook(page):
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    def on_console(m):
        if m.type == 'error': errors.append('console.error: ' + m.text)
    page.on('console', on_console)

def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name), timeout=180000)

def js(page, expr): return page.evaluate(expr)

def click_lot(page, lot_id):
    pos = js(page, f"""() => {{ const l = window.__city.getMapData().lots.find(x => x.id === '{lot_id}'); const p = window.__city.project(l.x, 0.6, l.z); return [p.x, p.y]; }}""")
    page.mouse.move(pos[0], pos[1]); page.mouse.move(pos[0] + 1, pos[1] + 1); page.mouse.down(); page.mouse.up()
    page.wait_for_timeout(500)
    return pos

try:
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
        page = ctx.new_page(); page.set_default_timeout(150000); hook(page)
        page.goto(URL, wait_until='commit', timeout=90000)
        page.wait_for_function('window.__ready === true', timeout=120000)
        page.wait_for_timeout(1500)
        shot(page, '01-start.png')
        check('開局：有新手提示、暫停中', js(page, "document.querySelector('#tut') && !document.querySelector('#tut').hidden && window.__game.state.speed === 0"))
        home = js(page, 'window.__city.getView()')
        page.click('[data-camera=left]')
        check('地圖向左旋轉且保留位置', js(page, 'window.__city.getView().yaw') > home['yaw'] and js(page, 'window.__city.getView().x') == home['x'])
        page.click('[data-camera=right]')
        check('地圖向右旋轉', abs(js(page, 'window.__city.getView().yaw') - home['yaw']) < 0.000001)
        page.click('[data-camera=home]')

        # 點空店面
        lot = js(page, "() => { const g = window.__game; return g.sim.medianResidentialLot(g.world); }")
        pos = click_lot(page, lot)
        st = js(page, 'window.__game.state')
        if st['panel'] != 'lot':  # 射線沒打到，退而求其次
            print('  (點擊沒打到店面，改用 selectLot)', pos)
            js(page, f"window.__game.selectLot('{lot}')")
        check('點空店面 → 出現店面面板', js(page, 'window.__game.state.panel') == 'lot', f"lot={lot}")
        page.wait_for_timeout(1200)
        shot(page, '02-lot.png')

        # 現金不夠 → 借貸款
        cost = js(page, f"() => window.__game.sim.getLotInfo(window.__game.world, '{lot}').openCost")
        cash0 = js(page, 'window.__game.world.companies.player.cash')
        check('現金不夠開店（要先借錢）', cash0 < cost, f'現金 {cash0}，開店 {cost}')
        page.click('#dock [data-dk=loan]')
        page.wait_for_selector('#side [data-act="loan:start"]')
        page.click('#side [data-act="loan:start"]')
        page.wait_for_timeout(300)
        cash1 = js(page, 'window.__game.world.companies.player.cash')
        check('借青創貸款 200 萬', cash1 - cash0 == 2000000, f'現金 {cash0} → {cash1}')

        # 開店
        js(page, f"window.__game.selectLot('{lot}')")
        page.wait_for_selector('#side [data-act=rent]')
        page.click('#side [data-act=rent]')
        page.wait_for_timeout(500)
        shops = js(page, "window.__game.sim.getShops(window.__game.world, 'player')")
        check('租下開店', len(shops) == 1 and shops[0]['status'] == 'renovating', shops[0]['name'] if shops else '')
        check('第一家店預設老闆自己顧店', shops[0]['ownerWorks'])

        # 改價格、排班
        page.click('#side [data-act="tab:menu"]')
        price0 = shops[0]['prices']['珍珠奶茶']
        page.eval_on_selector('[data-price="珍珠奶茶"]', "(el) => { el.value = String(+el.value + 5); el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }")
        page.click('#side [data-act="tab:staff"]')
        page.click('#side [data-act="ownerWork"]')
        check('既有店可改為全聘員工', not js(page, "window.__game.sim.getShops(window.__game.world, 'player')[0].ownerWorks"))
        page.click('#side [data-act="ownerWork"]')
        page.click('#side [data-act="staff:2:1"]')
        shop = js(page, "window.__game.sim.getShops(window.__game.world, 'player')[0]")
        check('改價格：珍珠奶茶 +5 元', shop['prices']['珍珠奶茶'] == price0 + 5, f"{price0} → {shop['prices']['珍珠奶茶']}")
        check('改排班：晚班 +1 人', shop['staff'][2] == shops[0]['staff'][2] + 1, str(shop['staff']))
        page.click('#side [data-act="tab:menu"]')
        page.wait_for_timeout(300)
        shot(page, '03-shop.png')

        # 快轉到開張後、營業時段，再用真實時間跑一下
        def clear_events():
            while js(page, "window.__game.sim.getEvents(window.__game.world).pending.filter(e => e.choices.length).length"):
                page.click('#event .choice.primary'); page.wait_for_timeout(150)
        while js(page, "window.__game.world.t") < 24 * 90:
            js(page, "window.__game.ff(24 * 90 - window.__game.world.t)"); clear_events()
        js(page, "() => { const g = window.__game; while (g.world.t % 24 !== 12) g.ff(1); }"); clear_events()
        shop = js(page, "window.__game.sim.getShops(window.__game.world, 'player')[0]")
        check('快轉 90 天後店已開張', shop['status'] == 'open', shop['status'])
        page.click('#side [data-act="tab:today"]')
        js(page, "() => { const g = window.__game; const sh = g.sim.getShops(g.world, 'player')[0]; g.sim.setStaffing(g.world, sh.id, [1, 1, 1]); }")  # 人手少一點，才看得到排隊
        js(page, "() => { const v = window.__city.getView(); window.__city.setView({dist: v.dist * 1.7}); }")
        js(page, "window.__game.setSpeed(1)")
        got = False
        for _ in range(14):
            page.wait_for_timeout(1000)
            c = js(page, "window.__city.stats()")
            if c['walkers'] >= 6: got = True
            if c['walkers'] >= 10 and c['queued'] >= 1: break
        c = js(page, "window.__city.stats()")
        check('營業中畫面有小人', got, f"walkers={c['walkers']} queued={c['queued']} scooters={c['scooters']}")
        shot(page, '04-busy.png')
        js(page, "window.__game.setSpeed(0)")
        js(page, "() => { const g = window.__game; const sh = g.sim.getShops(g.world, 'player')[0]; g.sim.setStaffing(g.world, sh.id, [2, 2, 3]); }")

        # 快轉到 60 天，途中遇到第一張事件卡就停下來截圖並處理
        ev_done = False
        t_target = 24 * 61
        while js(page, 'window.__game.world.t') < t_target and js(page, "window.__game.world.status") == 'playing':
            js(page, f"window.__game.ff({t_target} - window.__game.world.t, {{stopOnEvent: true}})")
            pend = js(page, "window.__game.sim.getEvents(window.__game.world).pending.filter(e => e.choices.length).length")
            if pend:
                page.wait_for_timeout(500)
                if not ev_done:
                    shot(page, '06-event.png')
                    title = page.inner_text('#event h3')
                    check('事件卡自動暫停並出現選項', js(page, "window.__game.state.speed") == 0 and page.is_visible('#event .choice'), title)
                    page.click('#event .choice.primary')
                    ev_done = True
                else:
                    page.click('#event .choice.primary')
                page.wait_for_timeout(200)
        if not ev_done:
            for _ in range(40):  # 60 天內沒有選擇型事件：再往後找一張來截圖
                js(page, "window.__game.ff(24 * 10, {stopOnEvent: true})")
                if js(page, "window.__game.sim.getEvents(window.__game.world).pending.filter(e => e.choices.length).length"): break
            page.wait_for_timeout(500)
            shot(page, '06-event.png')
            check('事件卡自動暫停並出現選項（60 天內沒有，往後找）', page.is_visible('#event .choice'), page.inner_text('#event h3') if page.is_visible('#event h3') else '')
            page.click('#event .choice.primary')
        day = js(page, 'window.__game.world.t / 24')
        k = js(page, "window.__game.sim.getKpi(window.__game.world)")
        check('快轉 60 天完成', day >= 60 and k['status'] == 'playing', f"第 {day:.0f} 天，現金 {k['cash']}，市占 {k['marketShare']:.3f}")

        # 報表
        page.click('#dock [data-dk=report]')
        page.wait_for_selector('#report .tile')
        page.wait_for_timeout(500)
        shot(page, '05-report.png')
        page.click('#report [data-rt=pl]')
        check('損益明細含成本、淨利與利息', all(t in page.inner_text('#report') for t in ['總成本', '淨利', '貸款利息', '原料報廢']))
        page.click('#report [data-rt=an]')
        check('分析顯示門店及含品牌費用損平杯數', all(t in page.inner_text('#report') for t in ['門店損益兩平', '含品牌費用損益兩平', '杯／天']))
        for tab in ['pl', 'an', 'ch', 'pr', 'rv', 'all']:
            page.click(f'#report [data-rt={tab}]'); page.wait_for_timeout(150)
        check('報表六個分頁可切換', page.is_visible('#report .tile'))
        page.click('#report [data-act=mclose]')

        # 數字來源
        page.click('#dock [data-dk=sources]')
        page.wait_for_selector('#sources .sc-row')
        page.wait_for_timeout(300)
        n_rows = js(page, "document.querySelectorAll('#sources .sc-row').length")
        links = js(page, "[...document.querySelectorAll('#sources a')].filter(a => a.href.startsWith('http')).length")
        check('數字來源頁：列出參數與可點網址', n_rows > 200 and links > 20, f'{n_rows} 列，{links} 個連結')
        shot(page, '07-sources.png')
        page.click('#sources [data-sf=有來源]'); page.wait_for_timeout(100)
        page.click('#sources [data-act=mclose]')

        # 重新整理 → 存檔還在
        t_before = js(page, 'window.__game.world.t'); cash_before = js(page, 'window.__game.world.companies.player.cash')
        page.reload(wait_until='commit'); page.wait_for_function('window.__ready === true', timeout=120000)
        t_after = js(page, 'window.__game.world.t'); n_shop = js(page, "window.__game.sim.getShops(window.__game.world, 'player').length")
        check('重新整理後存檔還在', n_shop == 1 and abs(t_after - t_before) <= 24, f'時間 {t_before} → {t_after}，店 {n_shop}')

        # 手機
        state = ctx.storage_state()
        page.close(); ctx.close()  # 主頁面還在 1 fps 的軟體繪製，會跟手機頁搶 CPU
        m = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, storage_state=state)
        mp = m.new_page(); mp.set_default_timeout(240000); hook(mp)
        mp.goto(URL + '?q=low', wait_until='commit', timeout=90000); mp.wait_for_function('window.__game !== undefined', timeout=300000); mp.wait_for_timeout(3000)
        js(mp, f"window.__game.selectLot('{lot}')"); mp.wait_for_timeout(2000)
        shot(mp, '08-phone.png')
        shot(mp, '_phone-report.png') if False else None
        mp.click('#dock [data-dk=report]', timeout=120000); mp.wait_for_timeout(1500)
        shot(mp, '_phone-report.png')
        mp.click('#report [data-rt=pl]')
        check('手機損益金額完整顯示', js(mp, "document.querySelector('#report .finance-detail tbody td:nth-child(2)').getBoundingClientRect().right <= innerWidth"))
        mp.click('#report [data-act=mclose]', timeout=120000)
        mp.click('#dock [data-dk=sources]', timeout=120000); mp.wait_for_timeout(1500)
        shot(mp, '_phone-sources.png')
        m.close(); br.close()
finally:
    srv.terminate()

check('console 沒有錯誤', not errors, '; '.join(errors[:5]))
fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} 通過')
sys.exit(1 if fails else 0)
