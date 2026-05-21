"""Capture screenshots for /demo/jp-rental/ walkthrough.

Usage:
  python3 -m http.server 8765 &           # serve repo locally
  python3 scripts/capture_demo.py          # captures to demo/jp-rental/img/
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8765"
OUT = Path(__file__).resolve().parent.parent / "demo/jp-rental/img"
OUT.mkdir(parents=True, exist_ok=True)


async def shot(page, fname, viewport_h=900):
    """Set viewport height then screenshot the visible region."""
    await page.set_viewport_size({"width": 1440, "height": viewport_h})
    await page.wait_for_timeout(800)  # let charts/transitions settle
    await page.screenshot(path=str(OUT / fname), full_page=False)
    print(f"  ✓ {fname}")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()

        # ── 01: Home, click "I want yield" persona ──
        print("[01] /home — yield persona active")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("typeof setPersona === 'function' && setPersona('income')")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-persona.png", viewport_h=1100)

        # ── 02: Home, scroll to world map ──
        print("[02] /home — world map")
        await page.evaluate("""
          const el = document.querySelector('.map-wrap, [class*="map"]');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "02-home-map.png", viewport_h=900)

        # ── 03: /jp/report long-form market thesis ──
        print("[03] /jp/report long-form")
        await page.goto(f"{BASE}/jp/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-jp-report.png", viewport_h=1300)

        # ── 04: /jp/ dashboard top ──
        print("[04] /jp/ dashboard")
        await page.goto(f"{BASE}/jp/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-jp-dashboard.png", viewport_h=1300)

        # ── 04: /jp/macro cycle ──
        print("[05] /jp/macro cycle")
        await page.goto(f"{BASE}/jp/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-jp-macro.png", viewport_h=1100)

        # ── 05: /jp/ city comparison charts ──
        print("[06] /jp/ city comparison charts")
        await page.goto(f"{BASE}/jp/", wait_until="networkidle")
        await page.evaluate("""
          // scroll to first chart that mentions city comparison or yield by city
          const headings = Array.from(document.querySelectorAll('h3, .chart-card h3'));
          const target = headings.find(h => /city.*comparison|yield by city|城市.*比較|城市.*yield/i.test(h.textContent));
          if (target) target.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(700)
        await shot(page, "06-jp-city-compare.png", viewport_h=900)

        # ── 06: /jp/tokyo KEY METRICS + Three Zones ──
        print("[07] /jp/tokyo three zones")
        await page.goto(f"{BASE}/jp/tokyo.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-jp-tokyo.png", viewport_h=1300)

        # ── 07: Cost Calculator with JP + Foreigner + 10y ──
        print("[08] /tools/cost-calculator JP / Foreigner / 10y")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # click JP market pill
        try:
            await page.click('#marketPills button[data-mkt="jp"]', timeout=3000)
        except Exception:
            print("    (no JP pill, using default)")
        # click Foreigner
        try:
            await page.click('#pillsResident button[data-val="foreigner"]', timeout=3000)
        except Exception:
            print("    (no foreigner pill)")
        # 10y is already default active per HTML
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-cost-calc.png", viewport_h=1300)

        # ── 08: Pipeline Cliff ──
        print("[09] /pipeline-cliff")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-pipeline-cliff.png", viewport_h=1100)

        # ── 09: REIT vs Direct — Foreign + TW + 10yr + All Cash ──
        print("[10] /reit-vs-direct Foreign / TW / 10yr / Cash")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # NOTE: page has a pre-existing bug — setting residency='foreign' AND
        # homeCountry!='generic' crashes render() because var homeLabel is
        # declared mid-function (hoisted but undefined when first accessed).
        # Workaround: monkey-patch render() to inject homeLabel before it runs.
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
            // Also catch any leftover errors so the screenshot can proceed
            window.addEventListener('error', function(e){ e.preventDefault(); return true; }, true);
          })();
        """)
        await page.wait_for_timeout(200)
        # try clicks instead of setHomeCountry (which won't see our monkeypatch
        # because the function uses a closure-scoped homeLabel inside render).
        # If render still crashes, our error handler suppresses it.
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception as e:
            print(f"    (TW chip click: {e})")
        await page.wait_for_timeout(300)
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception as e:
            print(f"    (foreign toggle click: {e})")
        await page.wait_for_timeout(400)
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception as e:
            print(f"    (period 10 click: {e})")
        await page.wait_for_timeout(400)
        # Re-click TW after switching to foreign in case the foreign-mode render
        # rebuilt the chips and lost the active state
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-reit-vs-direct.png", viewport_h=1300)

        # ── 10: Carry Heatmap ──
        print("[11] /carry-heatmap")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-carry-heatmap.png", viewport_h=1300)

        # ── 11: /jp/risk Risk Radar + Risk Factor cards ──
        print("[12] /jp/risk")
        await page.goto(f"{BASE}/jp/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-jp-risk.png", viewport_h=1200)

        await browser.close()
        print(f"\nDone. Screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
