"""Capture screenshots for /demo/mm2h/ walkthrough.

Usage:
  python3 -m http.server 8766 &           # serve repo locally
  python3 scripts/capture_demo_mm2h.py    # captures to demo/mm2h/img/
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/mm2h/img"
OUT.mkdir(parents=True, exist_ok=True)


async def shot(page, fname, viewport_h=900):
    await page.set_viewport_size({"width": 1440, "height": viewport_h})
    await page.wait_for_timeout(800)
    await page.screenshot(path=str(OUT / fname), full_page=False)
    print(f"  ✓ {fname}")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()

        # ── 01: Home with "passport" persona active ──
        print("[01] /home — passport persona active")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("typeof setPersona === 'function' && setPersona('visa')")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-passport.png", viewport_h=1100)

        # ── 02: Home, scroll to world map ──
        print("[02] /home — world map (MY visible)")
        await page.evaluate("""
          const el = document.querySelector('.map-wrap, [class*="map"]');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "02-home-map-my.png", viewport_h=900)

        # ── 03: /my/report long-form ──
        print("[03] /my/report long-form")
        await page.goto(f"{BASE}/my/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-my-report.png", viewport_h=1300)

        # ── 04: /my/ dashboard top ──
        print("[04] /my/ dashboard")
        await page.goto(f"{BASE}/my/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-my-dashboard.png", viewport_h=1400)

        # ── 05: /my/macro cycle ──
        print("[05] /my/macro cycle")
        await page.goto(f"{BASE}/my/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-my-macro.png", viewport_h=1100)

        # ── 06: /my/penang ──
        print("[06] /my/penang KPIs + zones")
        await page.goto(f"{BASE}/my/penang.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-my-penang.png", viewport_h=1300)

        # ── 07: /my/kl deep dive ──
        print("[07] /my/kl deep dive")
        await page.goto(f"{BASE}/my/kl.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-my-kl.png", viewport_h=1300)

        # ── 08: /my/kl-map interactive ──
        print("[08] /my/kl-map interactive")
        await page.goto(f"{BASE}/my/kl-map.html", wait_until="networkidle")
        await page.wait_for_timeout(2000)  # let map tiles load
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-my-kl-map.png", viewport_h=900)

        # ── 09: /docs/dd/DD_KL_RM1M ──
        print("[09] /docs/dd/DD_KL_RM1M master DD")
        await page.goto(f"{BASE}/docs/dd/DD_KL_RM1M_20260331.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-dd-kl-rm1m.png", viewport_h=1300)

        # ── 10: Cost Calculator with MY + Foreigner + 10y + RM2M ──
        print("[10] /tools/cost-calculator MY / Foreigner / 10y / RM 2M")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        try:
            await page.click('#marketPills button[data-mkt="my"]', timeout=3000)
        except Exception:
            print("    (no MY pill)")
        try:
            await page.click('#pillsResident button[data-val="foreigner"]', timeout=3000)
        except Exception:
            print("    (no foreigner pill)")
        # Set price to 2,000,000
        try:
            await page.fill('#priceInput', '2000000')
            # Trigger any input events
            await page.evaluate("""
              const el = document.getElementById('priceInput');
              if (el) {
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
              }
            """)
        except Exception as e:
            print(f"    (price input: {e})")
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-cost-calc-my.png", viewport_h=1300)

        # ── 11: REIT vs Direct — Foreign + TW + 10yr + Cash ──
        print("[11] /reit-vs-direct Foreign / TW / 10yr (MY row visible)")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Same workaround as JP capture: monkey-patch render() to inject homeLabel
        # before pre-existing hoisting bug crashes it
        await page.evaluate("""
          (function(){
            if (typeof render !== 'function') return;
            var orig = render;
            window.render = function(){
              try {
                window.homeLabel = (window.HOME_COUNTRIES||[]).filter(function(h){return h.k===window.homeCountry;})[0] || (window.HOME_COUNTRIES||[{k:'generic',en:'Generic',zh:'一般',flag:'🌐'}])[0];
              } catch(e){}
              return orig.apply(this, arguments);
            };
            window.addEventListener('error', function(e){ e.preventDefault(); return true; }, true);
          })();
        """)
        await page.wait_for_timeout(200)
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception as e:
            print(f"    (TW chip: {e})")
        await page.wait_for_timeout(300)
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception as e:
            print(f"    (foreign toggle: {e})")
        await page.wait_for_timeout(400)
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-reit-vs-direct-my.png", viewport_h=1300)

        # ── 12: /my/risk ──
        print("[12] /my/risk")
        await page.goto(f"{BASE}/my/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-my-risk.png", viewport_h=1300)

        await browser.close()
        print(f"\nDone. Screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
