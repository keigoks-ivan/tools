"""Capture screenshots for /demo/exit/ walkthrough — Sell-Side (Mrs. Chung / 鍾女士).

Usage:
  python3 -m http.server 8766 &           # serve repo locally (port 8766)
  python3 scripts/capture_demo_exit.py    # captures to demo/exit/img/

All 12 stops mirror the sell-side walkthrough:
  01  /home           yield persona active
  02  /home           world map section (Tokyo dot)
  03  /jp/report      long-form market thesis
  04  /jp/            dashboard KPI grids (sell-side KPIs)
  05  /jp/macro       BOJ rate path + cycle bar
  06  /jp/tokyo       ward-level pricing comps
  07  /carry-heatmap  sorted by 5yr change — carry compression signal
  08  /pipeline-cliff forward supply bars
  09  /tools/cost-calc JP / Foreigner / 10y — Exit Costs section
  10  /jp/risk        risk radar + risk factor cards
  11  /reit-vs-direct Foreign + TW + 10yr + All Cash — redeployment
  12  /methodology    JP data sources row
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/exit/img"
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
        print("[02] /home — world map (Tokyo dot visible)")
        await page.evaluate("""
          const el = document.querySelector('.map-wrap, [class*="map"]');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "02-home-map.png", viewport_h=900)

        # ── 03: /jp/report long-form market thesis ──
        print("[03] /jp/report — long-form market thesis")
        await page.goto(f"{BASE}/jp/report.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-jp-report.png", viewport_h=1300)

        # ── 04: /jp/ dashboard top — three KPI grids ──
        print("[04] /jp/ — dashboard KPI grids (sell-side read)")
        await page.goto(f"{BASE}/jp/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-jp-dashboard.png", viewport_h=1300)

        # ── 05: /jp/macro — BOJ rate path + cycle bar ──
        print("[05] /jp/macro — BOJ cycle + rate path")
        await page.goto(f"{BASE}/jp/macro.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-jp-macro.png", viewport_h=1100)

        # ── 06: /jp/tokyo — ward-level pricing comps ──
        print("[06] /jp/tokyo — KEY METRICS + Three Zones (exit pricing comps)")
        await page.goto(f"{BASE}/jp/tokyo.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-jp-tokyo.png", viewport_h=1300)

        # ── 07: Carry Heatmap — sort by 5yr change (sell signal) ──
        print("[07] /carry-heatmap — sorted by 5yr change (carry compression sell signal)")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        # Try to click sort button for "5yr change" if it exists
        try:
            await page.click('[data-sort="change"], button:has-text("5yr"), [data-sort="5yr"]', timeout=3000)
            await page.wait_for_timeout(600)
        except Exception as e:
            print(f"    (5yr sort click: {e} — using default sort)")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-carry-heatmap.png", viewport_h=1300)

        # ── 08: Pipeline Cliff — forward supply bars ──
        print("[08] /pipeline-cliff — forward supply (sell-before-wave signal)")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-pipeline-cliff.png", viewport_h=1100)

        # ── 09: Cost Calculator — JP / Foreigner / 10y (exit costs focus) ──
        print("[09] /tools/cost-calculator — JP / Foreigner / 10y — Exit Costs section")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        # Click JP market pill
        try:
            await page.click('#marketPills button[data-mkt="jp"]', timeout=3000)
        except Exception:
            print("    (no JP pill, using default)")
        # Click Foreigner residency
        try:
            await page.click('#pillsResident button[data-val="foreigner"]', timeout=3000)
        except Exception:
            print("    (no foreigner pill)")
        # 10y is default; click it anyway to be safe
        try:
            await page.click('#pillsHorizon button[data-val="10"], #horizonPills button[data-val="10"]', timeout=2000)
        except Exception:
            pass  # 10y is likely default
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-cost-calc.png", viewport_h=1300)

        # ── 10: /jp/risk — Risk Radar + Risk Factor cards ──
        print("[10] /jp/risk — Risk Radar + risk factor cards (what compresses exit value?)")
        await page.goto(f"{BASE}/jp/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-jp-risk.png", viewport_h=1200)

        # ── 11: REIT vs Direct — redeployment: Foreign + TW + 10yr + All Cash ──
        print("[11] /reit-vs-direct — Foreign / TW / 10yr / All Cash (redeployment options)")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # NOTE: same hoisting-bug workaround as jp-rental capture script.
        # The page has a render() function where homeLabel is declared mid-function
        # (hoisted but undefined when first referenced in foreign mode).
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
            window.addEventListener('error', function(e){ e.preventDefault(); return true; }, true);
          })();
        """)
        await page.wait_for_timeout(200)
        # Click TW chip first
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception as e:
            print(f"    (TW chip click: {e})")
        await page.wait_for_timeout(300)
        # Switch to Foreign
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception as e:
            print(f"    (foreign toggle click: {e})")
        await page.wait_for_timeout(400)
        # Set 10yr period
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception as e:
            print(f"    (period 10 click: {e})")
        await page.wait_for_timeout(400)
        # Re-click TW after foreign mode re-renders chips
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-reit-vs-direct.png", viewport_h=1300)

        # ── 12: /methodology — JP data sources row ──
        print("[12] /methodology — JP data sources (verify numbers behind exit analysis)")
        await page.goto(f"{BASE}/methodology.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-methodology.png", viewport_h=1300)

        await browser.close()
        print(f"\nDone. Screenshots saved to: {OUT}")
        print("12 files total — verify each is >50KB (a 404 page is ~23 bytes).")


if __name__ == "__main__":
    asyncio.run(main())
