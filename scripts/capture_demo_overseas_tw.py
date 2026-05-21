"""Capture screenshots for /demo/overseas-tw/ walkthrough.

Persona: Mr. Huang (黃先生), 48y, Taiwanese Google engineer in Singapore (8 years),
         USD 1.5M (~NT$48M) across SGD/USD/TWD. Plans to return to Taipei in 2yr
         to care for aging parents. Buying a Taipei apartment now as pre-return asset
         parking. Currently SG tax-resident; will become TW tax-resident on return.

12 stops across 5 phases:
  Phase A — TW market context from afar
  Phase B — Macro / FX positioning
  Phase C — Target market selection
  Phase D — Cost + cross-market sanity check
  Phase E — Risks + return logistics

Verified URL paths (root-level tools, no /tools/ prefix for heatmap):
  /home.html                      ✓
  /tw/report.html                 ✓
  /tw/macro.html                  ✓
  /tw/valuation.html              ✓
  /tw/taipei.html                 ✓
  /tw/newtaipei.html              ✓
  /tw/ (index.html)               ✓
  /tools/cost-calculator.html     ✓  (TW pill: data-mkt="tw", Resident toggle available)
  /reit-vs-direct.html            ✓  (root URL — NOT /tools/)
  /carry-heatmap.html             ✓  (root URL — NOT /tools/, sort: data-sort="change")
  /tw/risk.html                   ✓

Anti-bug notes:
  - /reit-vs-direct.html is at ROOT, not /tools/
  - /carry-heatmap.html is at ROOT, not /tools/
  - carry-heatmap sort button: data-sort="change" for 5yr change
  - REIT vs Direct has hoisting bug: monkey-patch render() before clicking chips
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/overseas-tw/img"
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

        # ── 01: Home with "growth" persona active ──
        print("[01] /home — growth persona active")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("typeof setPersona === 'function' && setPersona('growth')")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-growth.png", viewport_h=1100)

        # ── 02: Home, scroll to world map (TW + SG cities visible) ──
        print("[02] /home — world map with TW and SG cities visible")
        # Stay on /home; scroll to map section
        await page.evaluate("""
          const candidates = [
            document.querySelector('.map-wrap'),
            document.querySelector('[class*="map"]'),
            document.querySelector('.scatter-wrap'),
            document.querySelector('.section-h2')
          ];
          const el = candidates.find(c => c !== null);
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(700)
        await shot(page, "02-home-map-tw.png", viewport_h=900)

        # ── 03: /tw/report long-form ──
        print("[03] /tw/report — TW long-form analyst report")
        await page.goto(f"{BASE}/tw/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-tw-report.png", viewport_h=1300)

        # ── 04: /tw/macro — CBC rate cycle ──
        print("[04] /tw/macro — CBC rate cycle and macro KPIs")
        await page.goto(f"{BASE}/tw/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-tw-macro.png", viewport_h=1100)

        # ── 05: /tw/valuation — PIR, affordability metrics ──
        print("[05] /tw/valuation — PIR, Mortgage Burden Rate, Yield vs CBC")
        await page.goto(f"{BASE}/tw/valuation.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-tw-valuation.png", viewport_h=1200)

        # ── 06: /tw/taipei — district price map + KEY ZONES ──
        print("[06] /tw/taipei — District Price Map and KEY ZONES")
        await page.goto(f"{BASE}/tw/taipei.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-tw-taipei.png", viewport_h=1300)

        # ── 07: /tw/newtaipei — KEY ZONES alternative ──
        print("[07] /tw/newtaipei — New Taipei as Taipei alternative")
        await page.goto(f"{BASE}/tw/newtaipei.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-tw-newtaipei.png", viewport_h=1300)

        # ── 08: /tw/ dashboard ──
        print("[08] /tw/ — Taiwan KPI dashboard cross-city sanity check")
        await page.goto(f"{BASE}/tw/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-tw-dashboard.png", viewport_h=1400)

        # ── 09: Cost Calculator — TW / Resident / 10y / NT$30M ──
        print("[09] /tools/cost-calculator TW / Resident / 10y / NT$30,000,000")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Select TW market pill
        try:
            await page.click('[data-mkt="tw"]', timeout=3000)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (TW pill click failed: {e})")
        # Select Resident status
        try:
            await page.click('#pillsResident button[data-val="resident"]', timeout=2000)
            await page.wait_for_timeout(300)
        except Exception:
            try:
                await page.click('button[data-val="resident"]', timeout=2000)
            except Exception:
                print("    (resident pill: using default)")
        # Set price to NT$30,000,000
        try:
            await page.fill('#priceInput', '30000000')
            await page.evaluate("""
              const el = document.getElementById('priceInput');
              if (el) {
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
              }
            """)
        except Exception as e:
            print(f"    (price input: {e})")
        # Set horizon to 10y
        try:
            await page.click('#pillsHorizon button[data-val="10"]', timeout=2000)
        except Exception:
            try:
                await page.click('.pill-opt[data-val="10"]', timeout=2000)
            except Exception:
                print("    (10y horizon pill: not found, using default)")
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-cost-calc-tw-resident.png", viewport_h=1300)

        # ── 10: REIT vs Direct — Foreign + TW chip + 10yr ──
        print("[10] /reit-vs-direct Foreign / TW chip / 10yr")
        # IMPORTANT: root URL, NOT /tools/reit-vs-direct
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Monkey-patch render() to inject homeLabel before hoisting bug fires
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
        # Select TW home country chip
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception as e:
            print(f"    (TW chip: {e})")
        await page.wait_for_timeout(300)
        # Select Foreign residency (he's SG tax-resident now)
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception as e:
            print(f"    (foreign toggle: {e})")
        await page.wait_for_timeout(400)
        # Select 10yr period
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        # Re-click TW chip to ensure it sticks after render cycle
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-reit-vs-direct-tw.png", viewport_h=1300)

        # ── 11: /carry-heatmap — sorted by 5yr change ──
        print("[11] /carry-heatmap — sorted by 5yr change (TW + SG rows)")
        # IMPORTANT: root URL, NOT /tools/carry-heatmap
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.wait_for_timeout(1000)  # let SVG render
        # Click the "5yr change" sort button
        try:
            await page.click('button[data-sort="change"]', timeout=3000)
            await page.wait_for_timeout(800)
        except Exception as e:
            print(f"    (sort change: {e})")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-carry-heatmap.png", viewport_h=1200)

        # ── 12: /tw/risk — Risk Radar, Policy Timeline, 房地合一稅 ──
        print("[12] /tw/risk — Risk Radar, Policy Timeline, CGT rate table")
        await page.goto(f"{BASE}/tw/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-tw-risk.png", viewport_h=1300)

        await browser.close()
        print(f"\nDone. 12 screenshots written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
