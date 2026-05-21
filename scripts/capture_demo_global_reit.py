"""Capture screenshots for /demo/global-reit/ walkthrough.

Usage:
  python3 -m http.server 8766 &              # serve repo locally (already running)
  python3 scripts/capture_demo_global_reit.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8766"
OUT = Path(__file__).resolve().parent.parent / "demo/global-reit/img"
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

        # ── 01: Home with "yield" persona active ──
        print("[01] /home — yield persona active")
        await page.goto(f"{BASE}/home.html", wait_until="networkidle")
        # Try to activate yield persona
        await page.evaluate("typeof setPersona === 'function' && setPersona('yield')")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "01-home-overview.png", viewport_h=1100)

        # ── 02: /reits.html — comparison table, sorted by Spread ──
        print("[02] /reits — REIT comparison table")
        await page.goto(f"{BASE}/reits.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        # Try to sort by Spread column (3rd column header, index 2)
        try:
            await page.evaluate("""
              const ths = document.querySelectorAll('.compare-tbl thead th');
              if (ths.length > 2) ths[2].click();
            """)
            await page.wait_for_timeout(400)
        except Exception as e:
            print(f"    (sort click: {e})")
        await shot(page, "02-reits-table.png", viewport_h=1200)

        # ── 03: /reits.html — scroll to knowledge section ──
        print("[03] /reits — knowledge cards + buy-to-sell checklist")
        # Stay on /reits.html, scroll to knowledge section
        await page.evaluate("""
          const el = document.querySelector('.cards-grid');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(600)
        await shot(page, "03-reits-knowledge.png", viewport_h=1300)

        # ── 04: /reit-vs-direct — Foreign + TW + 10yr + Cash ──
        print("[04] /reit-vs-direct Foreign / TW / 10yr (7-market table)")
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
        # Re-click TW chip to ensure it sticks after the render cycle
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "04-reit-vs-direct-tw.png", viewport_h=1300)

        # ── 05: /carry-heatmap — sorted by 5yr change ──
        print("[05] /carry-heatmap — sorted by 5yr change")
        await page.goto(f"{BASE}/carry-heatmap.html", wait_until="networkidle")
        await page.wait_for_timeout(1000)  # let SVG render
        # Click the "5yr change" sort button
        try:
            await page.click('button[data-sort="change"]', timeout=3000)
            await page.wait_for_timeout(800)
        except Exception as e:
            print(f"    (sort change: {e})")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "05-carry-heatmap.png", viewport_h=1200)

        # ── 06: /pipeline-cliff ──
        print("[06] /pipeline-cliff — DANGER/WATCH/EASING buckets")
        await page.goto(f"{BASE}/pipeline-cliff.html", wait_until="networkidle")
        await page.wait_for_timeout(1000)  # let SVG render
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "06-pipeline-cliff.png", viewport_h=1300)

        # ── 07: /dashboard ──
        print("[07] /dashboard — global market coverage")
        await page.goto(f"{BASE}/dashboard.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "07-dashboard.png", viewport_h=1100)

        # ── 08: /playbook ──
        print("[08] /playbook — strategy framework")
        await page.goto(f"{BASE}/playbook.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "08-playbook.png", viewport_h=1200)

        # ── 09: /reit-vs-direct again — Foreign + TW — $100K endpoint bars visible ──
        print("[09] /reit-vs-direct — Foreign + TW — $100K endpoint bar chart")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Apply same hoisting workaround
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
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(300)
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        # Scroll to show endpoint bars section
        await page.evaluate("""
          const el = document.querySelector('.endpoint-card');
          if (el) el.scrollIntoView({block:'start'});
        """)
        await page.wait_for_timeout(400)
        await shot(page, "09-reit-vs-direct-cross.png", viewport_h=1300)

        # ── 10: Cost Calculator — JP / Foreigner / 10y ──
        print("[10] /tools/cost-calculator JP / Foreigner / 10y")
        await page.goto(f"{BASE}/tools/cost-calculator.html", wait_until="networkidle")
        try:
            await page.click('#marketPills button[data-mkt="jp"]', timeout=3000)
        except Exception:
            # Try alternate market pill selectors
            try:
                await page.click('button[data-mkt="jp"]', timeout=2000)
            except Exception as e:
                print(f"    (JP pill: {e})")
        try:
            await page.click('#pillsResident button[data-val="foreigner"]', timeout=3000)
        except Exception as e:
            print(f"    (foreigner pill: {e})")
        # Set a representative price
        try:
            await page.fill('#priceInput', '40000000')
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
        await shot(page, "10-cost-calc-jp.png", viewport_h=1300)

        # ── 11: /reit-vs-direct — Foreign + TW — foreign tax drag detail section ──
        print("[11] /reit-vs-direct — foreign WHT drag per-market detail cards")
        await page.goto(f"{BASE}/reit-vs-direct.html", wait_until="networkidle")
        # Apply hoisting workaround again
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
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(300)
        try:
            await page.click('#residencyToggle button[data-r="foreign"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        try:
            await page.click('#periodToggle button[data-p="10"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(400)
        try:
            await page.click('#homeChips button[data-h="TW"]', timeout=2000)
        except Exception:
            pass
        await page.wait_for_timeout(800)
        # Scroll to foreign detail section
        await page.evaluate("""
          const el = document.querySelector('#foreignDetail, .foreign-detail');
          if (el) {
            el.style.display = 'block';  // make sure it's visible
            el.scrollIntoView({block:'start'});
          }
        """)
        await page.wait_for_timeout(400)
        await shot(page, "11-reit-vs-direct-shortlist.png", viewport_h=1300)

        # ── 12: /methodology ──
        print("[12] /methodology — source table")
        await page.goto(f"{BASE}/methodology.html", wait_until="networkidle")
        await page.evaluate("window.scrollTo(0, 0)")
        await shot(page, "12-methodology.png", viewport_h=1300)

        await browser.close()
        print(f"\nDone. Screenshots in {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
