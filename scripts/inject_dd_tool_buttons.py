#!/usr/bin/env python3
"""inject_dd_tool_buttons.py

Injects two "open in tool" buttons into each Project-type DD report.
- Skips entries where type == "Summary"
- Idempotent: skips files that already contain the dd-tool-buttons div
- Writes back only when a change is made

Usage:
    python3 scripts/inject_dd_tool_buttons.py
"""

import json, re, os, sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DD_DIR    = os.path.join(REPO_ROOT, "docs", "dd")
INDEX     = os.path.join(DD_DIR, "dd_index.json")

BUTTON_TEMPLATE = """\
<div class="dd-tool-buttons" style="display:flex;gap:8px;margin:12px 0 4px;flex-wrap:wrap">
  <a href="/tools/stress-test.html?market=my{PRICE_PARAM}{YIELD_PARAM}&from={SLUG}"
     class="dd-tool-btn"
     style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:linear-gradient(135deg,#0f1e33 0%,#1e3a5f 100%);color:#fff;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;border:0.5px solid rgba(59,130,246,.3);transition:transform .15s,box-shadow .15s">
    <span>&#9889;</span><span>Stress Test &#27492;&#26696;</span>
  </a>
  <a href="/tools/buy-vs-rent.html?city=my&from={SLUG}"
     class="dd-tool-btn"
     style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:linear-gradient(135deg,#0f1e33 0%,#1e3a5f 100%);color:#fff;border-radius:4px;font-size:12px;font-weight:600;text-decoration:none;border:0.5px solid rgba(59,130,246,.3);transition:transform .15s,box-shadow .15s">
    <span>&#128257;</span><span>&#23565;&#29031; 12 &#24066;&#22330;</span>
  </a>
</div>"""


def parse_price(raw):
    """'RM 2.0M' -> '2000000', 'RM 1.1M' -> '1100000', 'RM 0.9M' -> '900000',
       'RM 1.16M' -> '1160000', 'RM 3.94M' -> '3940000', '—' -> None"""
    if not raw or raw.strip() == "—":
        return None
    # Match patterns like "RM 2.0M", "RM 1.16M", "RM 0.9M"
    m = re.search(r'[\d.]+', raw.replace(',', ''))
    if not m:
        return None
    num = float(m.group())
    if 'M' in raw.upper():
        return str(int(round(num * 1_000_000)))
    if 'K' in raw.upper():
        return str(int(round(num * 1_000)))
    return str(int(round(num)))


def parse_yield(raw):
    """'6.44%' -> '6.44', '4.5%' -> '4.5', '—' -> None"""
    if not raw or raw.strip() == "—":
        return None
    m = re.search(r'[\d.]+', raw)
    if not m:
        return None
    return m.group()


def slug_from_file(filename):
    """'RE_28MontKiara_20260412.html' -> '28MontKiara'"""
    # Strip RE_ prefix and _YYYYMMDD.html suffix
    name = filename
    if name.startswith("RE_"):
        name = name[3:]
    # Remove trailing _YYYYMMDD.html  (8 digits date)
    name = re.sub(r'_\d{8}\.html$', '', name)
    return name


def main():
    with open(INDEX, "r", encoding="utf-8") as f:
        entries = json.load(f)

    injected = 0
    skipped_summary = 0
    skipped_already = 0
    skipped_no_h1 = 0
    failed = 0

    for entry in entries:
        if entry.get("type") == "Summary":
            print(f"  ⏭  skipped (Summary): {entry['file']}")
            skipped_summary += 1
            continue

        filename = entry["file"]
        filepath = os.path.join(DD_DIR, filename)

        if not os.path.isfile(filepath):
            print(f"  ⚠️  file not found: {filepath}")
            failed += 1
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            html = f.read()

        # Idempotency check
        if "dd-tool-buttons" in html:
            print(f"  ⏭  skipped (already has): {filename}")
            skipped_already += 1
            continue

        # Build slug, price param, yield param
        slug = slug_from_file(filename)
        price_str = parse_price(entry.get("totalPrice", "—"))
        yield_str = parse_yield(entry.get("yield", "—"))

        price_param = f"&price={price_str}" if price_str else ""
        yield_param = f"&yield={yield_str}" if yield_str else ""

        buttons = BUTTON_TEMPLATE.replace("{SLUG}", slug) \
                                  .replace("{PRICE_PARAM}", price_param) \
                                  .replace("{YIELD_PARAM}", yield_param)

        # Inject after the first </h1>
        # Fallback: some DD files use <h2> inside .topbox instead of <h1>
        new_html, count = re.subn(r'(</h1>)', r'\1\n' + buttons, html, count=1)
        if count == 0:
            # Try </h2> fallback (older template style with .topbox)
            new_html, count = re.subn(r'(</h2>)', r'\1\n' + buttons, html, count=1)
        if count == 0:
            print(f"  ⚠️  skipped (no h1 found): {filename}")
            skipped_no_h1 += 1
            continue

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_html)

        print(f"  ✅ injected: {filename}  (price={price_str or 'n/a'}, yield={yield_str or 'n/a'}, slug={slug})")
        injected += 1

    print()
    print(f"Done — injected: {injected} | skipped (already has): {skipped_already} | "
          f"skipped (Summary): {skipped_summary} | no h1: {skipped_no_h1} | failed: {failed}")


if __name__ == "__main__":
    main()
