"""Capture screenshots for /demo/inheritance/ walkthrough.

Persona: Mr. Chou — 42, Kaohsiung government employee, NT$ 30M inheritance,
zero real estate experience. Meta-tutorial teaching site literacy, not buying.

Usage:
  python3 -m http.server 8766 &              # serve repo locally (already running)
  python3 scripts/capture_demo_inheritance.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/inheritance/img"
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

        # ── 01: /home.html — hero + persona cards + scatter + world map ──
        print("[01] /home — hero, persona cards, scatter chart, world map")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        # Click yield persona so map and scatter are in an informative state
        try:
            await page.evaluate("typeof setPersona === 'function' && setPersona('yield')")
        except Exception as e:
            print(f"    (setPersona: {e})")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-overview.png", viewport_h=1200)

        # ── 02: /home.html — navbar with Tools dropdown open ──
        print("[02] /home — navbar anatomy, Tools dropdown open")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(600)
        # Open the Tools dropdown by clicking it
        try:
            # Try common navbar dropdown triggers
            await page.evaluate("""
              // Try to find and click the Tools dropdown trigger
              var links = Array.from(document.querySelectorAll('nav a, .nav-link, .dropdown-toggle, [data-toggle], button'));
              var toolsBtn = links.find(function(el){
                return el.textContent && el.textContent.trim().toLowerCase().includes('tools');
              });
              if (toolsBtn) toolsBtn.click();
            """)
            await page.wait_for_timeout(500)
        except Exception as e:
            print(f"    (tools dropdown click: {e})")
        await shot(page, "02-navbar-anatomy.png", viewport_h=900)

        # ── 03: /methodology.html — source table + formula section ──
        print("[03] /methodology — formulas and source table")
        await page.goto(f"{BASE}/methodology.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "03-methodology.png", viewport_h=1200)

        # ── 04: /reits.html — scroll to knowledge/fundamentals section ──
        print("[04] /reits — REIT Investment Fundamentals knowledge cards")
        await page.goto(f"{BASE}/reits.html", wait_until="networkidle")
        # Scroll to the fundamentals section
        await page.evaluate("""
          // Find the REIT fundamentals section
          var els = Array.from(document.querySelectorAll('.section-title, h2, h3'));
          var target = els.find(function(el){
            return el.textContent && (
              el.textContent.toLowerCase().includes('fundamental') ||
              el.textContent.toLowerCase().includes('investment') ||
              el.textContent.toLowerCase().includes('基本知識')
            );
          });
          if (target) {
            target.scrollIntoView({block: 'start', behavior: 'instant'});
          } else {
            // Fallback: scroll past the comparison table
            window.scrollBy(0, 900);
          }
        """)
        await page.wait_for_timeout(600)
        await shot(page, "04-reits-knowledge.png", viewport_h=1300)

        # ── 05: /playbook.html — investment fundamentals section ──
        print("[05] /playbook — carry/PTI/pipeline tables, case studies")
        await page.goto(f"{BASE}/playbook.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-playbook.png", viewport_h=1200)

        # ── 06: /tw/valuation.html — KPI cards: P/R, PIR, yield, spread ──
        print("[06] /tw/valuation — KPI cards row (P/R 75x, PIR, yield, spread)")
        await page.goto(f"{BASE}/tw/valuation.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-tw-valuation.png", viewport_h=1100)

        # ── 07: /dashboard.html — 84-city table sorted by yield ──
        print("[07] /dashboard — 84-city table, sorted by yield")
        await page.goto(f"{BASE}/dashboard.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(800)
        # Sort by yield column
        try:
            await page.evaluate("""
              // Try to click the Yield column header
              var ths = Array.from(document.querySelectorAll('th'));
              var yieldTh = ths.find(function(th){
                return th.textContent && th.textContent.trim().toLowerCase() === 'yield';
              });
              if (yieldTh) {
                yieldTh.click();
              } else {
                // Try onclick with sortBy
                if (typeof sortBy === 'function') sortBy('yield');
              }
            """)
            await page.wait_for_timeout(600)
        except Exception as e:
            print(f"    (sort yield: {e})")
        # Scroll to show the city table
        await page.evaluate("""
          var tbl = document.querySelector('.ct-filters, table');
          if (tbl) tbl.scrollIntoView({block: 'start', behavior: 'instant'});
        """)
        await page.wait_for_timeout(400)
        await shot(page, "07-dashboard.png", viewport_h=1200)

        # ── 08: /home.html — world map in Carry mode ──
        print("[08] /home — world map toggled to Carry mode")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        # Switch map to Carry
        try:
            await page.evaluate("""
              var btns = Array.from(document.querySelectorAll('.map-toggle button, button[data-m]'));
              var carryBtn = btns.find(function(b){
                return b.dataset && b.dataset.m === 'carry';
              });
              if (carryBtn) {
                carryBtn.click();
              } else {
                // Try calling setMetric or similar
                if (typeof setMetric === 'function') setMetric('carry');
              }
            """)
            await page.wait_for_timeout(800)
        except Exception as e:
            print(f"    (carry toggle: {e})")
        # Scroll to map section
        await page.evaluate("""
          var mapSection = document.querySelector('.map-toggle, #world-map, svg');
          if (mapSection) mapSection.scrollIntoView({block: 'center', behavior: 'instant'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "08-home-map-carry.png", viewport_h=1100)

        # ── 09: /reit-vs-direct.html — Local mode (TW default) ──
        print("[09] /reit-vs-direct — Local mode, comparison table + endpoint bars")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Stay in Local mode (default) — don't touch residency toggle
        # Ensure 10yr period
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (period 10yr: {e})")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "09-reit-vs-direct-local.png", viewport_h=1300)

        # ── 10: /tw/index.html — market dashboard, all three KPI rows ──
        print("[10] /tw/index — TW market dashboard, all KPI rows")
        await page.goto(f"{BASE}/tw/index.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "10-tw-dashboard.png", viewport_h=1300)

        # ── 11: /tw/risk.html — six risk KPI cards ──
        print("[11] /tw/risk — six risk KPI cards")
        await page.goto(f"{BASE}/tw/risk.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "11-tw-risk.png", viewport_h=1100)

        # ── 12: /home.html — same home page, now seen through literate eyes ──
        print("[12] /home — final return to home, persona card in yield mode")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        try:
            await page.evaluate("typeof setPersona === 'function' && setPersona('yield')")
        except Exception:
            pass
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-home-final.png", viewport_h=1100)

        await browser.close()
        print("\nAll 12 screenshots captured.")
        print(f"Output: {OUT}")

        # Sanity-check file sizes
        print("\nFile sizes:")
        for f in sorted(OUT.glob("*.png")):
            size_kb = f.stat().st_size // 1024
            status = "OK" if size_kb > 30 else "WARN (small)"
            print(f"  {f.name}: {size_kb} KB  [{status}]")


if __name__ == "__main__":
    asyncio.run(main())
