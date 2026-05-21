"""Capture screenshots for /demo/wait-or-rent/ walkthrough.

Usage:
  python3 -m http.server 8766 &              # serve repo locally (already running)
  python3 scripts/capture_demo_wait_or_rent.py

Persona: Mr. Chang (張先生), 35y Taipei software engineer, NT$5M saved,
deciding whether to buy a Taipei apartment now or keep renting + invest in REITs.
Walkthrough outcome: "don't buy now" — honest assessment, not selling.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/wait-or-rent/img"
OUT.mkdir(parents=True, exist_ok=True)


async def shot(page, fname, viewport_h=900):
    await page.set_viewport_size({"width": 1440, "height": viewport_h})
    await page.wait_for_timeout(800)
    await page.screenshot(path=str(OUT / fname), full_page=False)
    sz = (OUT / fname).stat().st_size
    status = "OK" if sz > 50_000 else f"SMALL ({sz:,}b — check for 404)"
    print(f"  ✓ {fname}  [{status}]")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()

        # ── 01: Home — "I want yield" persona active ──────────────────────────
        print("[01] /home — I want yield persona active")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("typeof setPersona === 'function' && setPersona('yield')")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-yield.png", viewport_h=1100)

        # ── 02: Home — world scatter / map section ────────────────────────────
        print("[02] /home — world scatter map (Taipei context)")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("typeof setPersona === 'function' && setPersona('yield')")
        await page.wait_for_timeout(600)
        # Scroll to the world map / scatter section
        await page.evaluate("""
          const el = document.querySelector('#mapSection') ||
                     document.querySelector('.world-map') ||
                     document.querySelector('.scatter-section') ||
                     document.querySelector('[id*="chart"]');
          if (el) el.scrollIntoView({block:'start'});
          else window.scrollTo(0, 600);
        """)
        await page.wait_for_timeout(800)
        await shot(page, "02-home-scatter.png", viewport_h=1000)

        # ── 03: /tw/ — Taiwan dashboard ───────────────────────────────────────
        print("[03] /tw/ — Taiwan market dashboard")
        await page.goto(f"{BASE}/tw/", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "03-tw-dashboard.png", viewport_h=1100)

        # ── 04: /tw/valuation.html — P/R ratio, PIR, yield spread ────────────
        print("[04] /tw/valuation — P/R ratio and valuation extremes (CRITICAL)")
        await page.goto(f"{BASE}/tw/valuation.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(1000)  # let charts render
        await shot(page, "04-tw-valuation.png", viewport_h=1200)

        # ── 05: /tw/taipei.html — city deep dive ──────────────────────────────
        print("[05] /tw/taipei — Taipei city deep dive")
        await page.goto(f"{BASE}/tw/taipei.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(1000)
        await shot(page, "05-taipei-deepdive.png", viewport_h=1200)

        # ── 06: /carry-heatmap.html — Taipei carry history ───────────────────
        print("[06] /carry-heatmap — Taipei negative carry (sorted by current carry)")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.wait_for_timeout(1200)  # let SVG render
        # Sort by current carry (default) to keep Taipei visible
        try:
            await page.click('button[data-sort="current"]', timeout=3000)
            await page.wait_for_timeout(800)
        except Exception as e:
            print(f"    (sort current: {e})")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-carry-heatmap.png", viewport_h=1300)

        # ── 07: /pipeline-cliff.html — supply calendar, Taipei note ──────────
        print("[07] /pipeline-cliff — supply wave, Taipei supply-constrained note")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.wait_for_timeout(1200)  # let SVG render
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-pipeline-cliff.png", viewport_h=1300)

        # ── 08: /tools/buy-vs-rent.html — THE CENTERPIECE ─────────────────────
        print("[08] /tools/buy-vs-rent — Taipei row, 5yr horizon, 20% down, 5% alt return")
        await page.goto(f"{BASE}/tools/buy-vs-rent.html", wait_until="networkidle")
        await page.wait_for_timeout(800)

        # Set: Holding Horizon = 5y
        try:
            await page.click('#pillsHorizon button[data-val="5"]', timeout=3000)
            await page.wait_for_timeout(300)
        except Exception as e:
            print(f"    (horizon 5y: {e})")

        # Set: Down Payment = 20% (already default — click to confirm)
        try:
            await page.click('#pillsDown button[data-val="20"]', timeout=2000)
            await page.wait_for_timeout(200)
        except Exception as e:
            print(f"    (down 20%: {e})")

        # Set: Alt Return = 5% (already default — confirm)
        try:
            await page.click('#pillsAlt button[data-val="5"]', timeout=2000)
            await page.wait_for_timeout(200)
        except Exception as e:
            print(f"    (alt 5%: {e})")

        # Make sure transaction tax and local rate are checked
        try:
            tax_checked = await page.evaluate("document.getElementById('bvrTax')?.checked")
            if not tax_checked:
                await page.click('#bvrTax', timeout=2000)
        except Exception as e:
            print(f"    (tax toggle: {e})")

        await page.wait_for_timeout(600)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-buy-vs-rent.png", viewport_h=1400)

        # ── 09: /reits.html — REIT table sorted by yield ─────────────────────
        print("[09] /reits — REIT comparison table sorted by yield")
        await page.goto(f"{BASE}/reits.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        # Sort by Yield column
        try:
            await page.evaluate("""
              const ths = document.querySelectorAll('.compare-tbl thead th');
              // Find yield column by text
              for (let th of ths) {
                if (th.textContent.toLowerCase().includes('yield')) {
                  th.click(); break;
                }
              }
            """)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (yield sort: {e})")
        await shot(page, "09-reits-table.png", viewport_h=1200)

        # ── 10: /reit-vs-direct.html — Local mode, TW home, 10yr ─────────────
        print("[10] /reit-vs-direct — Local mode, TW home country, 10yr period")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")

        # Patch render() hoisting bug (same pattern as global-reit capture)
        await page.evaluate("""
          (function(){
            if (typeof render !== 'function') return;
            var orig = render;
            window.render = function(){
              try {
                window.homeLabel = (window.HOME_COUNTRIES||[]).filter(function(h){return h.k===window.homeCountry;})[0]
                  || (window.HOME_COUNTRIES||[{k:'generic',en:'Generic',zh:'一般',flag:'🌐'}])[0];
              } catch(e){}
              return orig.apply(this, arguments);
            };
            window.addEventListener('error', function(e){ e.preventDefault(); return true; }, true);
          })();
        """)
        await page.wait_for_timeout(200)

        # Ensure Local mode is selected (it's the default)
        try:
            await page.click('#residencyToggle button[data-r="local"]', timeout=2000)
        except Exception as e:
            print(f"    (local toggle: {e})")
        await page.wait_for_timeout(300)

        # Set home country to TW
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception as e:
            print(f"    (TW chip: {e})")
        await page.wait_for_timeout(300)

        # Set period to 10yr
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception as e:
            print(f"    (10yr period: {e})")
        await page.wait_for_timeout(400)

        # Re-click TW to confirm after render cycle
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-reit-vs-direct.png", viewport_h=1300)

        # ── 11: /playbook.html — strategy framework ───────────────────────────
        print("[11] /playbook — carry interpretation, pre-buy checklist")
        await page.goto(f"{BASE}/playbook.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        await shot(page, "11-playbook.png", viewport_h=1200)

        # ── 12: /tw/risk.html — delivery wave, credit controls ────────────────
        print("[12] /tw/risk — delivery wave KPI, credit controls watchlist")
        await page.goto(f"{BASE}/tw/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(1000)
        await shot(page, "12-tw-risk.png", viewport_h=1200)

        await browser.close()
        print("\nAll 12 screenshots captured.")
        print(f"Output: {OUT}")

        # Quick size sanity check
        print("\n── Size check ──")
        for f in sorted(OUT.glob("*.png")):
            sz = f.stat().st_size
            flag = "" if sz > 50_000 else "  ← SUSPICIOUSLY SMALL"
            print(f"  {f.name}: {sz:,} bytes{flag}")


if __name__ == "__main__":
    asyncio.run(main())
