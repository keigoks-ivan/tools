"""Capture screenshots for /demo/first-home/ walkthrough.

Persona: Ms. Wang, 28y, Hsinchu TSMC engineer, first-time domestic buyer,
         NT$5M down payment (NT$3M own + NT$2M parents gift), 70-80% LTV target.

Usage:
  # Verify server is running:
  curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8766/demo/
  # Then run:
  python3 scripts/capture_demo_first_home.py

Verified URL paths (no /tools/ prefix for carry-heatmap, reit-vs-direct, pipeline-cliff):
  /home.html                      ✓
  /tw/report.html                 ✓
  /tw/ (index.html)               ✓
  /tw/macro.html                  ✓
  /tw/hsinchu.html                ✓
  /tw/taoyuan.html                ✓
  /tw/taipei.html                 ✓
  /tw/valuation.html              ✓
  /tools/cost-calculator.html     ✓  (TW pill: data-mkt="tw", Resident toggle available)
  /tools/stress-test.html         ✓  (TW market preset: data-val="tw", Down Payment slider)
  /tw/risk.html                   ✓
  /methodology.html               ✓
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/first-home/img"
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

        # ── 02: Home, scroll to world map (TW cities visible) ──
        print("[02] /home — world map with TW cities visible")
        # Stay on /home from previous step; scroll to map section
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
        print("[03] /tw/report — Taiwan long-form report")
        await page.goto(f"{BASE}/tw/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-tw-report.png", viewport_h=1300)

        # ── 04: /tw/ dashboard ──
        print("[04] /tw/ — Taiwan dashboard")
        await page.goto(f"{BASE}/tw/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-tw-dashboard.png", viewport_h=1400)

        # ── 05: /tw/macro CBC rate cycle ──
        print("[05] /tw/macro — CBC rate cycle and mortgage credit growth")
        await page.goto(f"{BASE}/tw/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-tw-macro.png", viewport_h=1100)

        # ── 06: City triage — Hsinchu (representative of three-city comparison) ──
        print("[06] /tw/hsinchu — city triage (Hsinchu shown as primary triage city)")
        await page.goto(f"{BASE}/tw/hsinchu.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-tw-city-triage.png", viewport_h=1300)

        # ── 07: /tw/hsinchu scroll to KEY ZONES + chart section ──
        print("[07] /tw/hsinchu — KEY ZONES and Price Trend deep dive")
        # Already on hsinchu; scroll to show KEY ZONES
        await page.evaluate("window.scrollTo(0, 350)")
        await page.wait_for_timeout(400)
        await shot(page, "07-tw-hsinchu.png", viewport_h=1300)

        # ── 08: /tw/valuation ──
        print("[08] /tw/valuation — PIR, Mortgage Burden Rate, Yield vs CBC")
        await page.goto(f"{BASE}/tw/valuation.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-tw-valuation.png", viewport_h=1200)

        # ── 09: Cost Calculator — TW / Resident / 10y / NT$18M ──
        print("[09] /tools/cost-calculator TW / Resident / 10y / NT$18M")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Select TW market
        try:
            await page.click('[data-mkt="tw"]', timeout=3000)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (TW pill click failed: {e})")
        # Resident is default — confirm active
        try:
            await page.click('#pillsResident button[data-val="resident"]', timeout=2000)
        except Exception:
            print("    (resident pill: using default)")
        # Set price to NT$18,000,000
        try:
            await page.fill('#priceInput', '18000000')
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
            # Try alternative selector patterns
            try:
                await page.click('.pill-opt[data-val="10"]', timeout=2000)
            except Exception:
                print("    (10y horizon pill: not found, using default)")
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-cost-calc-tw-resident.png", viewport_h=1300)

        # ── 10: Stress Test — TW preset, 25% down (~75% LTV), NT$18M ──
        print("[10] /tools/stress-test TW / 25% down / NT$18M / Rate+100bp visible")
        await page.goto(f"{BASE}/tools/stress-test.html", wait_until="networkidle")
        # Select TW market preset
        try:
            await page.click('[data-val="tw"]', timeout=3000)
            await page.wait_for_timeout(500)
        except Exception as e:
            print(f"    (TW preset pill: {e})")
            try:
                # Try the market pill row
                await page.click('.market-pill[data-val="tw"]', timeout=2000)
            except Exception as e2:
                print(f"    (market-pill tw: {e2})")
        # Set property price
        try:
            await page.fill('#inPrice', '18000000')
            await page.evaluate("document.getElementById('inPrice').dispatchEvent(new Event('input',{bubbles:true}))")
        except Exception as e:
            print(f"    (price #inPrice: {e})")
        # Set down payment slider to 25%
        try:
            await page.evaluate("""
              const slider = document.getElementById('inDown');
              if (slider) {
                slider.value = 25;
                slider.dispatchEvent(new Event('input', {bubbles:true}));
              }
            """)
        except Exception as e:
            print(f"    (down slider: {e})")
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-stress-test-tw.png", viewport_h=1300)

        # ── 11: /tw/risk ──
        print("[11] /tw/risk — CBC credit controls, Risk Radar, Policy Timeline")
        await page.goto(f"{BASE}/tw/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-tw-risk.png", viewport_h=1300)

        # ── 12: /methodology ──
        print("[12] /methodology — TW data sources")
        await page.goto(f"{BASE}/methodology.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-methodology.png", viewport_h=1100)

        await browser.close()
        print(f"\nDone. 12 screenshots written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
