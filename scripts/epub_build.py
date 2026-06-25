#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
epub_build.py — 把 /history/<slug>.html 史詩長文轉成 Kobo 可讀的 reflowable EPUB3。

設計目標：閱讀體驗「不下降」，而且在 e-ink 上更好——
  - reflowable：Kobo 字級滑桿可自由縮放（全部用 em 相對單位）
  - 真章節導覽：每個 act 變成一個 EPUB 章節，part-div 變成「部」分隔頁
  - 保留羊皮紙底色、金色章名 kicker、首字下沉 drop cap、序章/終章樣式
  - 去掉只在網頁有意義的東西：固定 navbar、JS 浮動 TOC、進度條、動畫、scroll hint

用法：
  python3 scripts/epub_build.py japan-epic            # 單篇 → dist/epub/japan-epic.epub
  python3 scripts/epub_build.py --all                 # 全部 history/*.html
  python3 scripts/epub_build.py japan-epic --font path/to/NotoSerifTC.ttf   # 內嵌字型(subset)

純標準庫 + (可選) fonttools 做字型 subset。無第三方相依。
"""
import os, re, sys, html, zipfile, argparse, unicodedata
import html.entities as _he

_KEEP_ENT = {"amp", "lt", "gt", "quot", "apos"}

def norm_entities(s):
    """把具名 HTML entity（&mdash; &nbsp; …）轉成實際字元，
    只保留 XML 五個預定義 entity；數字 entity (&#160;) 原樣留著。XHTML 嚴格合規。"""
    def repl(m):
        name = m.group(1)
        if name in _KEEP_ENT:
            return m.group(0)
        ch = _he.html5.get(name + ";") or _he.html5.get(name)
        return ch if ch else m.group(0)
    return re.sub(r"&([a-zA-Z][a-zA-Z0-9]*);", repl, s)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST = os.path.join(ROOT, "history")
OUT  = os.path.join(ROOT, "dist", "epub")

# ---------- 小工具 ----------

def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()

def first(pattern, text, flags=re.S, group=1, default=""):
    m = re.search(pattern, text, flags)
    return m.group(group) if m else default

def parse_root_vars(htmltext):
    """從 :root{ --x:#hex; } 取出該檔的色票，供 var(--x) 替換。"""
    block = first(r":root\s*\{(.*?)\}", htmltext)
    vars_ = {}
    for name, val in re.findall(r"--([a-z0-9-]+)\s*:\s*([^;]+);", block):
        vars_[name.strip()] = val.strip()
    return vars_

def resolve_vars(s, vars_):
    """把內容裡的 var(--x[, fallback]) 換成實際色值（EPUB/e-ink 保險）。"""
    def repl(m):
        key = m.group(1).strip()
        fb  = (m.group(2) or "").strip()
        return vars_.get(key, fb or "#1a1410")
    return re.sub(r"var\(\s*--([a-z0-9-]+)\s*(?:,([^)]*))?\)", repl, s)

from html.parser import HTMLParser

VOID = {"br", "hr", "img", "wbr", "col", "source", "input", "meta",
        "link", "area", "base", "embed", "param", "track"}
# 這些區塊起始標籤會隱式關閉一個未閉合的 <p>（HTML5 規則）
P_CLOSERS = {"address", "article", "aside", "blockquote", "details", "div",
             "dl", "fieldset", "figcaption", "figure", "footer", "form",
             "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr",
             "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul"}

def _esc_text(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def _esc_attr(v):
    return v.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")

class _XHTMLNorm(HTMLParser):
    """把寬鬆 HTML 片段正規化成嚴格 XHTML：自動補關 <p>/<li>、void 自閉合、
    跳脫 &<> 、丟掉 id。convert_charrefs=True → 具名/數字 entity 在 data 端已是實字元。"""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.stack = []
    def _attrs(self, attrs):
        s = ""
        for k, v in attrs:
            if k == "id":          # 章內 id 在 EPUB 不需要
                continue
            val = v if v is not None else k
            s += ' %s="%s"' % (k, _esc_attr(val))
        return s
    def _autoclose(self, tag):
        if self.stack and self.stack[-1] == "p" and tag in P_CLOSERS:
            self.out.append("</p>"); self.stack.pop()
        elif self.stack and self.stack[-1] == "li" and tag == "li":
            self.out.append("</li>"); self.stack.pop()
    def handle_starttag(self, tag, attrs):
        self._autoclose(tag)
        if tag in VOID:
            self.out.append("<%s%s/>" % (tag, self._attrs(attrs)))
        else:
            self.out.append("<%s%s>" % (tag, self._attrs(attrs)))
            self.stack.append(tag)
    def handle_startendtag(self, tag, attrs):
        self._autoclose(tag)
        self.out.append("<%s%s/>" % (tag, self._attrs(attrs)))
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in self.stack:      # 補關中間未閉合者（如 </div> 前漏關的 <p>）
            while self.stack:
                t = self.stack.pop()
                self.out.append("</%s>" % t)
                if t == tag:
                    break
    def handle_data(self, data):
        self.out.append(_esc_text(data))
    def result(self):
        while self.stack:
            self.out.append("</%s>" % self.stack.pop())
        return "".join(self.out)

def normalize_xhtml(s):
    p = _XHTMLNorm()
    p.feed(s)
    p.close()
    return p.result()

def clean_fragment(s, vars_):
    s = norm_entities(s)
    s = resolve_vars(s, vars_)
    # 去掉只在網頁有意義的回目錄連結
    s = re.sub(r'<a[^>]*class="back-toc"[^>]*>.*?</a>', "", s, flags=re.S)
    return normalize_xhtml(s).strip()

def slugify_id(i):
    return "ch%03d" % i

def strip_block(s, marker):
    """以 div 平衡方式移除 s 中第一個 marker(如 <div class="act-head") 整塊，回傳剩餘。"""
    i = s.find(marker)
    if i < 0:
        return s
    depth = 0
    for m in re.finditer(r"<div\b|</div\s*>", s[i:]):
        if m.group().startswith("</"):
            depth -= 1
            if depth == 0:
                return s[:i] + s[i + m.end():]
        else:
            depth += 1
    return s

# ---------- 解析一篇 ----------

def parse_doc(htmltext):
    vars_ = parse_root_vars(htmltext)
    title = html.unescape(first(r"<title>(.*?)</title>", htmltext)).strip()

    body = first(r"<body[^>]*>(.*)</body>", htmltext)

    # hero（屬性順序不拘）
    hero = first(r'<header\b[^>]*\bclass="hero"[^>]*>(.*?)</header>', body)
    kicker = first(r'<span class="kicker">(.*?)</span>', hero)
    h1     = first(r"<h1[^>]*>(.*?)</h1>", hero)
    sub    = first(r'<p class="sub">(.*?)</p>', hero)

    # lede
    lede = first(r'<section\b[^>]*\bclass="lede[^"]*"[^>]*>(.*?)</section>', body)

    parts_acts = []
    # part-div：只抽已知子元素，避開巢狀 div 平衡問題（屬性順序不拘）
    for m in re.finditer(
        r'<div\b[^>]*\bclass="part-div[^"]*"[^>]*>(.*?)</div>\s*</div>', body, flags=re.S):
        seg = m.group(1)
        parts_acts.append(("part", m.start(), {
            "pn": first(r'<span class="pn">(.*?)</span>', seg),
            "pt": first(r'<div class="pt">(.*?)</div>', seg),
            "pe": first(r'<div class="pe">(.*?)</div>', seg),
        }))
    # act / finale：section 不巢狀，非貪婪到第一個 </section>（屬性順序不拘）
    for m in re.finditer(r'<section\b[^>]*\bclass="((?:act|finale)[^"]*)"[^>]*>(.*?)</section>', body, flags=re.S):
        cls = m.group(1)
        inner = m.group(2)
        is_finale = "finale" in cls
        # 移除 act-head 整塊（平衡匹配），保留其餘全部（含 .prose、finale 的 .wrap/.investor）
        # 這樣不論 act-head 是否被 .wrap 包住，剩餘 HTML 都保持 div 平衡
        body_block = strip_block(inner, '<div class="act-head"').strip()
        parts_acts.append(("act", m.start(), {
            "num":   first(r'<span class="act-num">(.*?)</span>', inner),
            "title": first(r'<h2 class="act-title"[^>]*>(.*?)</h2>', inner),
            "sub":   first(r'<p class="act-sub">(.*?)</p>', inner),
            "orn":   first(r'<div class="ornament">(.*?)</div>', inner),
            "prose": body_block,
            "finale": is_finale,
        }))

    parts_acts.sort(key=lambda x: x[1])
    return {
        "vars": vars_, "title": title, "kicker": kicker, "h1": h1, "sub": sub,
        "lede": lede, "seq": parts_acts,
    }

# ---------- 產生 XHTML ----------

XHTML_HEAD = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<!DOCTYPE html>\n'
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-Hant" lang="zh-Hant">\n'
    '<head>\n<meta charset="utf-8"/>\n<title>{t}</title>\n'
    '<link rel="stylesheet" type="text/css" href="../style.css"/>\n</head>\n'
    '<body class="{bc}">\n'
)
XHTML_TAIL = "</body>\n</html>\n"

def page(title, bodyclass, inner):
    return XHTML_HEAD.format(t=html.escape(title), bc=bodyclass) + inner + XHTML_TAIL

def title_page(doc):
    k  = clean_fragment(doc["kicker"], doc["vars"])
    h1 = clean_fragment(doc["h1"], doc["vars"])
    sb = clean_fragment(doc["sub"], doc["vars"])
    lede = clean_fragment(doc["lede"], doc["vars"])
    inner = (
        '<section class="titlepage">\n'
        f'<p class="kicker">{k}</p>\n'
        f'<h1>{h1}</h1>\n'
        f'<p class="sub">{sb}</p>\n'
        '<div class="rule"></div>\n'
        '</section>\n'
        f'<section class="lede">\n{lede}\n</section>\n'
    )
    return page(doc["title"], "titlepage-body", inner)

def part_page(p):
    inner = (
        '<section class="partdiv">\n'
        f'<p class="pn">{clean_fragment(p["pn"], {})}</p>\n'
        f'<h2 class="pt">{clean_fragment(p["pt"], {})}</h2>\n'
        f'<p class="pe">{clean_fragment(p["pe"], {})}</p>\n'
        '</section>\n'
    )
    return inner  # part 與下一章合併在同一檔頂端

def act_page(a, vars_, title):
    cls = "act finale" if a.get("finale") else "act"
    num = clean_fragment(a["num"], vars_)
    ttl = clean_fragment(a["title"], vars_)
    sub = clean_fragment(a["sub"], vars_)
    orn = clean_fragment(a["orn"], vars_)
    prose = clean_fragment(a["prose"], vars_)
    inner = (
        f'<section class="{cls}">\n<div class="act-head">\n'
        f'<p class="act-num">{num}</p>\n<h2 class="act-title">{ttl}</h2>\n'
        + (f'<p class="act-sub">{sub}</p>\n' if sub else "")
        + (f'<p class="ornament">{orn}</p>\n' if orn else "")
        + '</div>\n' + prose + '\n</section>\n'
    )
    return inner

# ---------- CSS ----------

def build_css(vars_):
    v = lambda k, d: vars_.get(k, d)
    return f""":root{{
  --ink:{v('ink','#1a1410')}; --parchment:{v('parchment','#f4ecdc')};
  --sea:{v('sea','#1e3a4c')}; --sea-deep:{v('sea-deep','#0f2330')};
  --gold:{v('gold','#b08d34')}; --gold-bright:{v('gold-bright','#d4af5a')};
  --rust:{v('rust','#8c3a21')}; --crimson:{v('crimson','#7a2418')};
  --faint:{v('faint','#6b5d48')}; --line:{v('line','#c9b893')};
}}
@page{{ margin:0; }}
html,body{{ margin:0; padding:0; background:var(--parchment); color:var(--ink); }}
body{{
  font-family:"Noto Serif TC","Noto Serif CJK TC",serif;
  font-size:.85em;            /* 預設略小：Kobo 開啟時的基準字級，仍可用滑桿放大 */
  line-height:1.85; text-align:justify;
  padding:1.2em 1.1em 2.4em;
}}
/* 全部用 em → Kobo 字級滑桿可整體縮放 */
p{{ margin:0 0 1em; text-indent:0; }}
strong{{ font-weight:700; color:var(--crimson); }}
em{{ font-style:italic; }}

/* 標題頁 */
.titlepage-body{{ background:var(--sea-deep); color:var(--parchment); }}
.titlepage{{ text-align:center; padding:3em 0 1.5em; }}
.titlepage .kicker{{ font-size:.72em; letter-spacing:.32em; color:var(--gold-bright);
  text-transform:uppercase; margin-bottom:1.6em; }}
.titlepage h1{{ font-size:2.3em; font-weight:900; line-height:1.22; margin:0; }}
.titlepage h1 .em{{ color:var(--gold-bright); }}
.titlepage .sub{{ font-size:1em; font-style:italic; color:#d9cbb0;
  margin-top:1.4em; line-height:1.7; text-align:center; }}
.titlepage .rule{{ width:5em; height:2px; background:var(--gold-bright);
  margin:1.8em auto 0; }}
.titlepage-body .lede{{ color:#e6dcc6; margin-top:2.4em; }}
.titlepage-body .lede p{{ font-style:italic; }}

/* 序言 lede（在標題頁底） */
.lede .drop{{ float:left; font-size:3.1em; line-height:.8; padding:.05em .12em 0 0;
  color:var(--gold-bright); font-weight:700; }}

/* 「部」分隔 */
.partdiv{{ text-align:center; padding:2.6em 0 1.4em; border-bottom:1px solid var(--line);
  margin-bottom:1.6em; }}
.partdiv .pn{{ font-size:.78em; letter-spacing:.3em; color:var(--gold);
  text-transform:uppercase; margin:0 0 .4em; }}
.partdiv .pt{{ font-size:1.7em; font-weight:900; color:var(--sea-deep); margin:0; }}
.partdiv .pe{{ font-size:.86em; font-style:italic; color:var(--faint); margin:.5em 0 0; }}

/* 章 act */
.act-head{{ text-align:center; margin:0 0 2em; }}
.act-num{{ font-size:.74em; letter-spacing:.28em; color:var(--gold);
  text-transform:uppercase; margin:0 0 .6em; }}
.act-title{{ font-size:1.55em; font-weight:900; color:var(--sea-deep);
  line-height:1.3; margin:0; }}
.act-sub{{ font-size:.9em; font-style:italic; color:var(--faint); margin:.6em 0 0; }}
.ornament{{ color:var(--gold); letter-spacing:.4em; margin:.9em 0 0; }}
.prose h3{{ font-size:1.12em; font-weight:700; color:var(--rust);
  margin:1.8em 0 .6em; line-height:1.4; }}
.prose blockquote{{ margin:1.4em 1.2em; padding-left:1em;
  border-left:3px solid var(--gold); color:var(--faint); font-style:italic; }}

/* 數據卡 / 評論框 / 引文（finance & finale 區塊） */
.stats{{ margin:1.6em 0; }}
.stat{{ border:1px solid var(--line); border-radius:.4em; padding:.7em .9em;
  margin:.5em 0; text-align:center; }}
.stat .num{{ font-size:1.5em; font-weight:900; color:var(--rust); line-height:1.2; }}
.stat .lbl{{ font-size:.82em; color:var(--faint); margin-top:.3em; }}
.investor,.principle{{ border:1px solid var(--gold); border-left:4px solid var(--gold);
  border-radius:.3em; background:rgba(176,141,52,.07); padding:1em 1.1em; margin:1.8em 0; }}
.investor .tag,.principle .tag{{ display:block; font-size:.72em; letter-spacing:.16em;
  text-transform:uppercase; color:var(--gold); margin-bottom:.6em; font-weight:700; }}
.pull{{ border-top:1px solid var(--gold); border-bottom:1px solid var(--gold);
  padding:1em .4em; margin:1.8em 0; text-align:center; }}
.pull p{{ font-size:1.12em; font-style:italic; color:var(--sea-deep); margin:0; }}
.wrap{{ margin:0; }}

/* 終章 */
.finale .act-title{{ color:var(--crimson); }}
.div-orn{{ text-align:center; color:var(--gold); letter-spacing:.5em; margin:2em 0; }}
"""

# ---------- 字型 subset（可選） ----------

def subset_font(font_path, text, dest):
    """把 master TTF subset 成只含 text 用到的字元，存到 dest。回傳 dest 或 None。"""
    try:
        from fontTools import subset
    except Exception:
        return None
    chars = sorted(set(text))
    opt = subset.Options()
    opt.flavor = "woff2"          # woff2 壓縮，EPUB 內最省空間
    opt.layout_features = ["locl", "ccmp"]   # CJK 閱讀必要的最小集合
    opt.name_IDs = []            # 不需保留名稱表
    opt.notdef_outline = True
    opt.recalc_bounds = True
    opt.drop_tables = ["GPOS", "GDEF", "DSIG"]
    opt.hinting = False
    font = subset.load_font(font_path, opt)
    s = subset.Subsetter(options=opt)
    s.populate(unicodes=[ord(c) for c in chars])
    s.subset(font)
    subset.save_font(font, dest, opt)
    return dest

# master 字型（由 NotoSerifTC 變體實例化而來）
FONT_REGULAR = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Regular.ttf")
FONT_BOLD    = os.path.join(ROOT, "dist", "fonts", "NotoSerifTC-Bold.ttf")

# ---------- 打包 EPUB ----------

CONTAINER = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
    '  <rootfiles>\n'
    '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n'
    '  </rootfiles>\n</container>\n'
)

def build_epub(slug, embed=False, verbose=True):
    src = os.path.join(HIST, slug + ".html")
    doc = parse_doc(read(src))
    vars_ = doc["vars"]

    # 章節組裝：part-div 併入下一個 act 檔頂端
    chapters = []   # (id, filename, title, xhtml)
    pending_part = None
    idx = 0
    for kind, _pos, data in doc["seq"]:
        if kind == "part":
            pending_part = part_page(data)
            continue
        idx += 1
        inner = (pending_part or "") + act_page(data, vars_, doc["title"])
        pending_part = None
        cid = slugify_id(idx)
        chapters.append((cid, cid + ".xhtml",
                         html.unescape(re.sub("<[^>]+>", "", data["title"])).strip(),
                         page(doc["title"], "", inner)))

    if not chapters:
        raise ValueError("無 act 章節（互動/資料頁，非敘事長文），略過")

    # 標題頁
    title_xhtml = title_page(doc)

    css = build_css(vars_)

    # 收集全文字元供 subset
    alltext = doc["title"] + doc["h1"] + doc["sub"] + doc["lede"] + \
        "".join(c[3] for c in chapters)

    manifest, spine, navlis = [], [], []
    manifest.append('<item id="css" href="style.css" media-type="text/css"/>')
    manifest.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
    manifest.append('<item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>')
    spine.append('<itemref idref="title"/>')
    navlis.append('<li><a href="text/title.xhtml">封面・序</a></li>')
    for cid, fn, ttl, _x in chapters:
        manifest.append(f'<item id="{cid}" href="text/{fn}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="{cid}"/>')
        navlis.append(f'<li><a href="text/{fn}">{html.escape(ttl)}</a></li>')

    font_face = ""
    embedded = []   # (manifest_id, href, bytes)
    if embed:
        os.makedirs(OUT, exist_ok=True)
        weights = [("Regular", 400, FONT_REGULAR, "serif-regular.woff2"),
                   ("Bold",    700, FONT_BOLD,    "serif-bold.woff2")]
        for nm, w, master, href in weights:
            if not os.path.exists(master):
                raise FileNotFoundError(f"缺 master 字型 {master}（先實例化 NotoSerifTC）")
            tmp = os.path.join(OUT, f"_sub_{nm}.woff2")
            subset_font(master, alltext, tmp)
            with open(tmp, "rb") as f:
                data = f.read()
            os.remove(tmp)
            fid = "font" + nm.lower()
            embedded.append((fid, "fonts/" + href, data))
            manifest.append(f'<item id="{fid}" href="fonts/{href}" media-type="font/woff2"/>')
            font_face += (
                '@font-face{font-family:"Noto Serif TC";'
                f'font-weight:{w};font-style:normal;'
                'font-display:swap;src:url("fonts/' + href + '") format("woff2");}\n')

    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-Hant">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:investmquest:history:{slug}</dc:identifier>
    <dc:title>{html.escape(doc['title'])}</dc:title>
    <dc:language>zh-Hant</dc:language>
    <dc:publisher>investmquest.com</dc:publisher>
    <meta property="dcterms:modified">2026-06-25T00:00:00Z</meta>
  </metadata>
  <manifest>
    {chr(10).join('    ' + m for m in manifest).strip()}
  </manifest>
  <spine>
    {chr(10).join('    ' + s for s in spine).strip()}
  </spine>
</package>
"""

    nav = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" '
        'xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-Hant" lang="zh-Hant">\n'
        '<head><meta charset="utf-8"/><title>目錄</title></head>\n<body>\n'
        '<nav epub:type="toc" id="toc"><h1>目錄</h1>\n<ol>\n'
        + "\n".join("  " + li for li in navlis)
        + '\n</ol></nav>\n</body>\n</html>\n'
    )

    css_full = (font_face + css) if font_face else css

    os.makedirs(OUT, exist_ok=True)
    dest = os.path.join(OUT, slug + ".epub")
    with zipfile.ZipFile(dest, "w") as z:
        # mimetype 必須第一個且 stored
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        zi = lambda name, data: z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
        zi("META-INF/container.xml", CONTAINER)
        zi("OEBPS/content.opf", opf)
        zi("OEBPS/nav.xhtml", nav)
        zi("OEBPS/style.css", css_full)
        zi("OEBPS/text/title.xhtml", title_xhtml)
        for cid, fn, ttl, x in chapters:
            zi("OEBPS/text/" + fn, x)
        for _fid, href, data in embedded:
            z.writestr("OEBPS/" + href, data, compress_type=zipfile.ZIP_STORED)
    if verbose:
        kb = os.path.getsize(dest) // 1024
        print(f"✓ {slug}: {len(chapters)} 章, {kb} KB → {dest}")
    return dest

# ---------- CLI ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?", help="history slug (不含 .html)")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--embed", action="store_true", help="內嵌 subset Noto Serif TC（兩種字重）")
    args = ap.parse_args()

    if args.all:
        slugs = sorted(os.path.splitext(f)[0] for f in os.listdir(HIST)
                       if f.endswith(".html") and f != "index.html")
        ok = 0
        for s in slugs:
            try:
                build_epub(s, args.embed); ok += 1
            except Exception as e:
                print(f"✗ {s}: {e}")
        print(f"\n完成 {ok}/{len(slugs)}")
    elif args.slug:
        build_epub(args.slug, args.embed)
    else:
        ap.print_help()

if __name__ == "__main__":
    main()
