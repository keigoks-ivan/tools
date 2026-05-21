"""Capture screenshots for /demo/au-pr/ walkthrough.

Usage:
  # Verify server is running:
  curl -s -o /dev/null -w "%{http_code}\\n" http://localhost:8766/demo/
  # Then run:
  python3 scripts/capture_demo_au_pr.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/au-pr/img"
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

        # ── 02: Home, scroll to world map (AU visible) ──
        print("[02] /home — world map (AU visible)")
        # Stay on /home from previous step
        await page.evaluate("""
          const el = document.querySelector('.map-wrap, [class*="map"]');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "02-home-map-au.png", viewport_h=900)

        # ── 03: /au/report long-form ──
        print("[03] /au/report long-form")
        await page.goto(f"{BASE}/au/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-au-report.png", viewport_h=1300)

        # ── 04: /au/ dashboard ──
        print("[04] /au/ dashboard")
        await page.goto(f"{BASE}/au/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-au-dashboard.png", viewport_h=1400)

        # ── 05: /au/macro cycle bar ──
        print("[05] /au/macro cycle bar")
        await page.goto(f"{BASE}/au/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-au-macro.png", viewport_h=1100)

        # ── 06: City triage — Brisbane deep dive KPIs ──
        print("[06] /au/brisbane — city triage shot (Brisbane chosen)")
        await page.goto(f"{BASE}/au/brisbane.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-au-city-triage.png", viewport_h=1300)

        # ── 07: /au/brisbane full deep dive ──
        print("[07] /au/brisbane — full deep dive scroll")
        # Already on brisbane; scroll a bit to show more sections
        await page.evaluate("window.scrollTo(0, 400)")
        await page.wait_for_timeout(400)
        await shot(page, "07-au-brisbane.png", viewport_h=1300)

        # ── 08: /pipeline-cliff with Brisbane row ──
        print("[08] /pipeline-cliff")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "08-pipeline-cliff-brisbane.png", viewport_h=1100)

        # ── 09: Cost Calculator with AU + Resident + 10y + A$1.8M ──
        print("[09] /tools/cost-calculator AU / Resident / 10y / A$1.8M")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Select AU market
        try:
            await page.click('[data-mkt="au"]', timeout=3000)
        except Exception:
            print("    (no AU pill — trying setMarket)")
            try:
                await page.evaluate("typeof setMarket === 'function' && setMarket('au')")
            except Exception as e:
                print(f"    (setMarket: {e})")
        # Set Resident (PR = resident)
        try:
            await page.click('#pillsResident button[data-val="resident"]', timeout=3000)
        except Exception:
            print("    (no resident pill — checking default)")
        # Set price to 1,800,000
        try:
            await page.fill('#priceInput', '1800000')
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
        await shot(page, "09-cost-calc-au-resident.png", viewport_h=1300)

        # ── 10: REIT vs Direct — Local mode / 10yr ──
        print("[10] /reit-vs-direct Local / 10yr (AU row visible)")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Local mode is simpler — no hoisting bug since homeLabel is only needed in Foreign mode
        await page.wait_for_timeout(400)
        # Set Residency = Local
        try:
            await page.click('#residencyToggle button[data-r="local"]', timeout=2000)
        except Exception as e:
            print(f"    (local toggle: {e})")
        await page.wait_for_timeout(300)
        # Set period = 10yr
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception:
            print("    (10yr period pill not found)")
        await page.wait_for_timeout(600)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-reit-vs-direct-au-local.png", viewport_h=1300)

        # ── 11: Carry Heatmap — AU rows visible ──
        print("[11] /carry-heatmap AU rows")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "11-carry-heatmap-au.png", viewport_h=1100)

        # ── 12: /au/risk ──
        print("[12] /au/risk")
        await page.goto(f"{BASE}/au/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-au-risk.png", viewport_h=1300)

        await browser.close()
        print(f"\nDone. Screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
