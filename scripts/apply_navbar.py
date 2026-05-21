#!/usr/bin/env python3
"""Replace the existing navbar block on every page with <div id="nav-root"></div>
and ensure /js/navbar.js is loaded. Also strips the <div class="mobile-menu">...</div>
block (its markup is now rebuilt by navbar.js).

Safe to re-run — idempotent.
"""
import os, re, sys, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

TARGETS = []
# Root-level pages
for f in [
    'index.html','kl.html','penang.html','supply.html','demand.html',
    'valuation.html','risk.html','report.html',
    'reits.html','markets.html','sectors.html','screener.html','screener-tw.html',
    'home.html',
]:
    p = os.path.join(ROOT, f)
    if os.path.exists(p):
        TARGETS.append(p)

# Market sub-directories
for m in ['au','tw','jp','nz','uk','us','th','vn','kr','ca','ie']:
    TARGETS.extend(sorted(glob.glob(os.path.join(ROOT, m, '*.html'))))

# DD reports
TARGETS.extend(sorted(glob.glob(os.path.join(ROOT, 'docs', 'dd', '*.html'))))

PLACEHOLDER = '<div id="nav-root"></div>'
SCRIPT_TAG = '<script src="/js/navbar.js" defer></script>'

OPEN_TAGS = ('<header', '<nav', '<div', '<section', '<main', '<article', '<aside')

def find_matching_close(html, start_idx, open_tag_name):
    """Given html and index AFTER the opening tag, walk forward counting nested
    same-tag-name opens/closes and return index AFTER the matching closing tag.
    Depth starts at 1 because the opening tag has already been consumed."""
    i = start_idx
    depth = 1
    n = len(html)
    open_re  = re.compile(r'<' + open_tag_name + r'(\s|>)', re.IGNORECASE)
    close_re = re.compile(r'</' + open_tag_name + r'\s*>', re.IGNORECASE)
    while i < n:
        m_open = open_re.search(html, i)
        m_close = close_re.search(html, i)
        if not m_close:
            return -1
        if m_open and m_open.start() < m_close.start():
            depth += 1
            i = m_open.end()
        else:
            depth -= 1
            i = m_close.end()
            if depth == 0:
                return i
    return -1

def find_matching_div_close(html, start_idx):
    """Walk from index AFTER '<div ...>' forward, returning index after the
    matching </div>. Depth starts at 1 because the opening div is already past."""
    i = start_idx
    n = len(html)
    depth = 1
    open_re  = re.compile(r'<div(\s|>)', re.IGNORECASE)
    close_re = re.compile(r'</div\s*>', re.IGNORECASE)
    while i < n:
        m_open = open_re.search(html, i)
        m_close = close_re.search(html, i)
        if not m_close:
            return -1
        if m_open and m_open.start() < m_close.start():
            depth += 1
            i = m_open.end()
        else:
            depth -= 1
            i = m_close.end()
            if depth == 0:
                return i
    return -1

def replace_navbar(html):
    """Replace the first <header class="navbar">...</header> OR
    <nav class="navbar">...</nav> with the placeholder. Returns
    (new_html, changed:bool)."""
    # Already placeholder?
    if PLACEHOLDER in html:
        return html, False
    changed = False

    # Try <header class="navbar">
    m = re.search(r'<header[^>]*class="[^"]*\bnavbar\b[^"]*"[^>]*>', html, re.IGNORECASE)
    tag = 'header'
    if not m:
        m = re.search(r'<nav[^>]*class="[^"]*\bnavbar\b[^"]*"[^>]*>', html, re.IGNORECASE)
        tag = 'nav'
    if m:
        end = find_matching_close(html, m.end(), tag)
        if end == -1:
            return html, False
        html = html[:m.start()] + PLACEHOLDER + html[end:]
        changed = True
    return html, changed

def remove_mobile_menu(html):
    """Strip <div class="mobile-menu">...</div> block."""
    m = re.search(r'<div[^>]*class="[^"]*\bmobile-menu\b[^"]*"[^>]*>', html, re.IGNORECASE)
    if not m:
        return html, False
    end = find_matching_div_close(html, m.end())
    if end == -1:
        return html, False
    # also eat surrounding whitespace on its own line
    start = m.start()
    # backtrack through whitespace on the line
    ws_start = start
    while ws_start > 0 and html[ws_start-1] in ' \t':
        ws_start -= 1
    if ws_start > 0 and html[ws_start-1] == '\n':
        start = ws_start - 1
    # eat trailing newline
    while end < len(html) and html[end] in ' \t':
        end += 1
    if end < len(html) and html[end] == '\n':
        end += 1
    return html[:start] + html[end:], True

def ensure_script(html):
    """Append <script src="/js/navbar.js" defer></script> before </body>
    if not already present."""
    if 'js/navbar.js' in html:
        return html, False
    m = re.search(r'</body>', html, re.IGNORECASE)
    if not m:
        return html + '\n' + SCRIPT_TAG + '\n', True
    return html[:m.start()] + SCRIPT_TAG + '\n' + html[m.start():], True

def process(path):
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()
    html = original
    html, c1 = replace_navbar(html)
    html, c2 = remove_mobile_menu(html)
    html, c3 = ensure_script(html)
    if html == original:
        return 'skip'
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    flags = ''.join(['N' if c1 else '-', 'M' if c2 else '-', 'S' if c3 else '-'])
    return flags

def main():
    dry_run = '--dry-run' in sys.argv
    stats = {'changed':0,'skip':0,'nav_replaced':0,'mm_removed':0,'script_added':0}
    for p in TARGETS:
        rel = os.path.relpath(p, ROOT)
        with open(p, 'r', encoding='utf-8') as f:
            original = f.read()
        html = original
        html, c1 = replace_navbar(html)
        html, c2 = remove_mobile_menu(html)
        html, c3 = ensure_script(html)
        if c1: stats['nav_replaced']+=1
        if c2: stats['mm_removed']+=1
        if c3: stats['script_added']+=1
        if html != original:
            stats['changed'] += 1
            flags = ('N' if c1 else '-') + ('M' if c2 else '-') + ('S' if c3 else '-')
            if not dry_run:
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(html)
            print('[%s] %s' % (flags, rel))
        else:
            stats['skip'] += 1
    print('---')
    print('total targets: %d' % len(TARGETS))
    print('changed: %d  skipped: %d' % (stats['changed'], stats['skip']))
    print('nav_replaced: %d  mobile_menu_removed: %d  script_added: %d' % (
        stats['nav_replaced'], stats['mm_removed'], stats['script_added']))
    if dry_run:
        print('(dry run — no files written)')

if __name__ == '__main__':
    main()
