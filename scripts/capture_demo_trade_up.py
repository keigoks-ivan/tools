"""Capture screenshots for /demo/trade-up/ walkthrough.

Persona: Mr. Chen, 45y, Hsinchu TSMC engineer, upgrading from 3-bed Hsinchu
         (held 10y, ~NT$25M) to 4-bed Taipei (~NT$45M target).
         Two-step transaction: sell Hsinchu first, then buy Taipei.

Usage:
  # Verify server is running:
  curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8766/demo/
  # Then run:
  python3 scripts/capture_demo_trade_up.py

Verified URL paths (no /tools/ prefix for root-level pages):
  /home.html                      ✓
  /tw/report.html                 ✓
  /tw/hsinchu.html                ✓
  /tools/cost-calculator.html     ✓  (TW pill: data-mkt="tw", Resident default)
  /tw/valuation.html              ✓
  /tw/taipei.html                 ✓
  /tw/newtaipei.html              ✓
  /tools/cost-calculator.html     ✓  (second use — NT$45M buy-side)
  /tools/stress-test.html         ✓  (TW preset, ~55% down / NT$45M)
  /tw/macro.html                  ✓
  /tw/risk.html                   ✓
  /methodology.html               ✓
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/trade-up/img"
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

        # ── 02: /tw/report long-form ──
        print("[02] /tw/report — TW long-form report (cycle gauge)")
        await page.goto(f"{BASE}/tw/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "02-tw-report.png", viewport_h=1300)

        # ── 03: /tw/hsinchu — sell-side market check ──
        print("[03] /tw/hsinchu — Hsinchu sell-side: KEY METRICS + HSP Investment Trend")
        await page.goto(f"{BASE}/tw/hsinchu.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-tw-hsinchu.png", viewport_h=1300)

        # ── 04: Cost Calculator — Hsinchu EXIT (NT$25M, 10y, TW Resident) ──
        print("[04] /tools/cost-calculator — Hsinchu EXIT: TW / Resident / 10y / ~NT$25M")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Select TW market
        try:
            await page.click('[data-mkt="tw"]', timeout=3000)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (TW pill click failed: {e})")
        # Resident (default — confirm active)
        try:
            await page.click('#pillsResident button[data-val="resident"]', timeout=2000)
        except Exception:
            print("    (resident pill: using default)")
        # Set price to NT$25,000,000 (Hsinchu sell-side)
        try:
            await page.fill('#priceInput', '25000000')
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
        await shot(page, "04-cost-calc-hsinchu-exit.png", viewport_h=1300)

        # ── 05: /tw/valuation — sell-side: is Hsinchu peak-valued? ──
        print("[05] /tw/valuation — PIR by City and Mortgage Burden Rate (sell-side signal)")
        await page.goto(f"{BASE}/tw/valuation.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-tw-valuation.png", viewport_h=1200)

        # ── 06: /tw/taipei — buy-side district price map ──
        print("[06] /tw/taipei — Taipei buy-side: District Price Map + KEY METRICS")
        await page.goto(f"{BASE}/tw/taipei.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-tw-taipei.png", viewport_h=1300)

        # ── 07: /tw/newtaipei — buy-side triage alternative ──
        print("[07] /tw/newtaipei — New Taipei triage: cheaper + MRT")
        await page.goto(f"{BASE}/tw/newtaipei.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-tw-newtaipei.png", viewport_h=1300)

        # ── 08: Cost Calculator — Taipei BUY (NT$45M, 10y, TW Resident) ──
        print("[08] /tools/cost-calculator — Taipei BUY: TW / Resident / 10y / NT$45M")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Select TW market
        try:
            await page.click('[data-mkt="tw"]', timeout=3000)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (TW pill click failed: {e})")
        # Resident
        try:
            await page.click('#pillsResident button[data-val="resident"]', timeout=2000)
        except Exception:
            print("    (resident pill: using default)")
        # Set price to NT$45,000,000 (Taipei buy-side)
        try:
            await page.fill('#priceInput', '45000000')
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
        await shot(page, "08-cost-calc-taipei-buy.png", viewport_h=1300)

        # ── 09: Stress Test — TW / ~55% down (NT$25M mortgage on NT$45M) ──
        print("[09] /tools/stress-test — TW / NT$45M / ~55% down / Rate+100bp")
        await page.goto(f"{BASE}/tools/stress-test.html", wait_until="networkidle")
        # Select TW market preset
        try:
            await page.click('[data-val="tw"]', timeout=3000)
            await page.wait_for_timeout(500)
        except Exception as e:
            print(f"    (TW preset pill: {e})")
            try:
                await page.click('.market-pill[data-val="tw"]', timeout=2000)
            except Exception as e2:
                print(f"    (market-pill tw: {e2})")
        # Set property price to NT$45M
        try:
            await page.fill('#inPrice', '45000000')
            await page.evaluate("document.getElementById('inPrice').dispatchEvent(new Event('input',{bubbles:true}))")
        except Exception as e:
            print(f"    (price #inPrice: {e})")
        # Set down payment slider to ~55% (so mortgage ≈ NT$25M)
        try:
            await page.evaluate("""
              const slider = document.getElementById('inDown');
              if (slider) {
                slider.value = 55;
                slider.dispatchEvent(new Event('input', {bubbles:true}));
              }
            """)
        except Exception as e:
            print(f"    (down slider: {e})")
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-stress-test-taipei.png", viewport_h=1300)

        # ── 10: /tw/macro — CBC rate trajectory ──
        print("[10] /tw/macro — CBC rate cycle for new mortgage context")
        await page.goto(f"{BASE}/tw/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-tw-macro.png", viewport_h=1100)

        # ── 11: /tw/risk — LTV 2nd-home trap + Policy Timeline ──
        print("[11] /tw/risk — 7th Wave Credit Controls + 2nd-home LTV + Policy Timeline")
        await page.goto(f"{BASE}/tw/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-tw-risk.png", viewport_h=1300)

        # ── 12: /methodology — TW data sources ──
        print("[12] /methodology — TW data sources row")
        await page.goto(f"{BASE}/methodology.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-methodology.png", viewport_h=1100)

        await browser.close()
        print(f"\nDone. 12 screenshots written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
