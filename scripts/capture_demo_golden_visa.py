"""Capture screenshots for /demo/golden-visa/ walkthrough.

Usage:
  python3 -m http.server 8766 &                   # serve repo locally
  python3 scripts/capture_demo_golden_visa.py     # captures to demo/golden-visa/img/

Persona: Mr. & Mrs. Liu (55/53, Taipei) — EU Golden Visa seekers with EUR 1.5M cash.
12 stops: home-passport → home-map → visa-hub → ie-report → ie-dashboard
          ie-macro → ie-dublin → pipeline-cliff → cost-calc-ie
          reit-vs-direct-eu → carry-heatmap → ie-risk

URL sanity-checked before scripting:
  Root URLs (no /tools/ prefix):
    pipeline-cliff.html  ✓
    reit-vs-direct.html  ✓
    carry-heatmap.html   ✓
    visa.html            ✓
  Under /tools/:
    cost-calculator.html ✓  (IE market pill confirmed: data-mkt="ie" exists)
  Under /ie/:
    index.html, report.html, macro.html, dublin.html, cork.html, risk.html ✓

Anti-bug #2 (bilingual): applyLang pattern verbatim from /demo/mm2h/index.html
  (tagName==='SPAN'?'inline':'block') — already in HTML, not relevant here.
Anti-bug #1 (URL existence): all URLs verified above.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/golden-visa/img"
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

        # ── 01: Home with "passport / visa" persona active ──
        print("[01] /home — passport persona active")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("typeof setPersona === 'function' && setPersona('visa')")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-passport.png", viewport_h=1100)

        # ── 02: Home, scroll to world map (EU cluster visible) ──
        print("[02] /home — world map (EU cluster visible)")
        await page.evaluate("""
          const el = document.querySelector('.map-wrap, [class*="map"]');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "02-home-map-eu.png", viewport_h=900)

        # ── 03: /visa.html — Golden Visa comparison hub ──
        print("[03] /visa.html — program comparison hub")
        await page.goto(f"{BASE}/visa.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-visa-hub.png", viewport_h=1300)

        # ── 04: /ie/report.html long-form ──
        print("[04] /ie/report — Ireland long-form market report")
        await page.goto(f"{BASE}/ie/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-ie-report.png", viewport_h=1300)

        # ── 05: /ie/ dashboard ──
        print("[05] /ie/ — Ireland dashboard")
        await page.goto(f"{BASE}/ie/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-ie-dashboard.png", viewport_h=1400)

        # ── 06: /ie/macro.html ECB cycle ──
        print("[06] /ie/macro — Ireland macro × cycle")
        await page.goto(f"{BASE}/ie/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-ie-macro.png", viewport_h=1100)

        # ── 07: /ie/dublin.html city deep-dive ──
        print("[07] /ie/dublin — Dublin deep dive")
        await page.goto(f"{BASE}/ie/dublin.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-ie-dublin.png", viewport_h=1300)

        # ── 08: /pipeline-cliff.html (root, NOT /tools/) ──
        print("[08] /pipeline-cliff — Dublin + Cork in delivery calendar")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        # Try to click on Dublin row to expand detail
        try:
            await page.evaluate("""
              const rows = document.querySelectorAll('[data-city="Dublin"], .city-row, .row-city');
              if (rows.length > 0) rows[0].click();
            """)
        except Exception as e:
            print(f"    (Dublin expand: {e})")
        await page.wait_for_timeout(600)
        await shot(page, "08-pipeline-cliff.png", viewport_h=1200)

        # ── 09: /tools/cost-calculator.html — IE + Foreigner + 10y + 1.5M ──
        print("[09] /tools/cost-calculator IE / Foreigner / 10y / EUR 1.5M")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Set market to IE (confirmed data-mkt="ie" exists)
        try:
            await page.click('#marketPills button[data-mkt="ie"]', timeout=3000)
        except Exception:
            print("    (IE pill not found — clicking via evaluate)")
            await page.evaluate("""
              const btn = document.querySelector('[data-mkt="ie"]');
              if (btn) btn.click();
            """)
        await page.wait_for_timeout(300)
        # Set Foreigner
        try:
            await page.click('#pillsResident button[data-val="foreigner"]', timeout=3000)
        except Exception:
            print("    (no foreigner pill)")
        await page.wait_for_timeout(200)
        # Set price to 1,500,000
        try:
            await page.fill('#priceInput', '1500000')
            await page.evaluate("""
              const el = document.getElementById('priceInput');
              if (el) {
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
              }
            """)
        except Exception as e:
            print(f"    (price input: {e})")
        # Set 10yr horizon if available
        try:
            await page.click('[data-horizon="10"], [data-p="10"], [data-val="10"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-cost-calc-ie.png", viewport_h=1300)

        # ── 10: /reit-vs-direct.html — Foreign + TW + 10yr (EU row) ──
        print("[10] /reit-vs-direct Foreign / TW / 10yr (EU row)")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Same hoisting bug workaround as MM2H / JP scripts
        await page.evaluate("""
          (function(){
            if (typeof render !== 'function') return;
            var orig = render;
            window.render = function(){
              try {
                window.homeLabel = (window.HOME_COUNTRIES||[]).filter(function(h){return h.k===window.homeCountry;})[0] || (window.HOME_COUNTRIES||[{k:'generic',en:'Generic',zh:'Generic',flag:'GEN'}])[0];
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
        # Re-click TW chip to ensure state is set (same pattern as MM2H script)
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-reit-vs-direct-eu.png", viewport_h=1300)

        # ── 11: /carry-heatmap.html (root, NOT /tools/) ──
        print("[11] /carry-heatmap — Dublin + Cork EU cluster")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        # Try to click Dublin row in heatmap
        try:
            await page.evaluate("""
              const cells = Array.from(document.querySelectorAll('.city-label, .hm-label, [data-n]'));
              const dublin = cells.find(c => c.textContent.includes('Dublin') || c.getAttribute('data-n') === 'Dublin');
              if (dublin) dublin.click();
            """)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (Dublin click in heatmap: {e})")
        await shot(page, "11-carry-heatmap.png", viewport_h=1200)

        # ── 12: /ie/risk.html ──
        print("[12] /ie/risk — Ireland risk monitor")
        await page.goto(f"{BASE}/ie/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-ie-risk.png", viewport_h=1300)

        await browser.close()
        print(f"\nDone. Screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
