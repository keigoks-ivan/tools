"""Capture screenshots for /demo/uni-town/ walkthrough.

Usage:
  # Verify server is running:
  curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8766/demo/
  # Then run:
  python3 scripts/capture_demo_uni_town.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/uni-town/img"
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

        # ── 02: Home, scroll to world map (US/UK/AU visible) ──
        print("[02] /home — world map (US/UK/AU clusters)")
        # Stay on /home from previous step
        await page.evaluate("""
          const el = document.querySelector('.map-wrap, [class*="map"]');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "02-home-map-us-uk-au.png", viewport_h=900)

        # ── 03: /us/ dashboard ──
        print("[03] /us/ dashboard (12-city overview)")
        await page.goto(f"{BASE}/us/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-us-dashboard.png", viewport_h=1300)

        # ── 04: /us/boston deep dive ──
        print("[04] /us/boston — deep dive with KPIs and TOC")
        await page.goto(f"{BASE}/us/boston.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "04-us-boston.png", viewport_h=1300)

        # ── 05: /us/macro cycle bar ──
        print("[05] /us/macro — cycle bar with NOW marker")
        await page.goto(f"{BASE}/us/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-us-macro.png", viewport_h=1100)

        # ── 06: /pipeline-cliff — Boston mid-term supply ──
        print("[06] /pipeline-cliff — short-hold exit timing check")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "06-pipeline-cliff.png", viewport_h=1100)

        # ── 07: Cost Calculator US / Foreigner / 5y / US$800K ──
        print("[07] /tools/cost-calculator US / Foreigner / 5y / US$800K")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Select US market
        try:
            await page.click('[data-mkt="us"]', timeout=3000)
        except Exception:
            print("    (no US pill — trying setMarket)")
            try:
                await page.evaluate("typeof setMarket === 'function' && setMarket('us')")
            except Exception as e:
                print(f"    (setMarket: {e})")
        # Set Foreigner status
        try:
            await page.click('#pillsResident button[data-val="foreigner"]', timeout=3000)
        except Exception:
            print("    (no foreigner pill — checking default)")
        # Set horizon to 5y (minimum available)
        try:
            await page.click('button[data-val="5"]', timeout=3000)
        except Exception:
            print("    (no 5y pill found)")
        # Set price to 800000
        try:
            await page.fill('#priceInput', '800000')
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
        await shot(page, "07-cost-calc-us-foreigner-5y.png", viewport_h=1300)

        # ── 08: REIT vs Direct — Foreign + TW + 5yr ──
        print("[08] /reit-vs-direct Foreign / TW / 5yr")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        await page.wait_for_timeout(600)
        # Set Residency = Foreign
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception as e:
            print(f"    (foreign toggle: {e})")
        await page.wait_for_timeout(400)
        # Set period = 5yr (closest to 4y)
        try:
            await page.click('#periodToggle button[data-p="5"]', timeout=2000)
        except Exception:
            print("    (5yr period pill not found)")
        await page.wait_for_timeout(400)
        # Set home country = TW (hoisting bug workaround: try both click and evaluate)
        try:
            await page.click('[data-h="TW"]', timeout=2000)
        except Exception:
            try:
                await page.evaluate("typeof setHomeCountry === 'function' && setHomeCountry('TW')")
            except Exception as e:
                print(f"    (setHomeCountry TW: {e})")
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-reit-vs-direct-foreign-tw.png", viewport_h=1300)

        # ── 09: Carry Heatmap ──
        print("[09] /carry-heatmap — US rows visible")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "09-carry-heatmap.png", viewport_h=1100)

        # ── 10: Buy vs Rent ──
        print("[10] /tools/buy-vs-rent — short-hold break-even")
        await page.goto(f"{BASE}/tools/buy-vs-rent.html", wait_until="networkidle")
        # Set horizon = 5y (closest to 4y)
        try:
            await page.click('#pillsHorizon button[data-val="5"]', timeout=2000)
        except Exception:
            print("    (no 5y horizon pill)")
        await page.wait_for_timeout(600)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-buy-vs-rent.png", viewport_h=1300)

        # ── 11: /us/risk ──
        print("[11] /us/risk — foreign buyer regulatory + climate risk matrix")
        await page.goto(f"{BASE}/us/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-us-risk.png", viewport_h=1300)

        # ── 12: /methodology — US data sources row ──
        print("[12] /methodology — US data sources row")
        await page.goto(f"{BASE}/methodology.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-methodology.png", viewport_h=1100)

        await browser.close()
        print(f"\nDone. Screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
