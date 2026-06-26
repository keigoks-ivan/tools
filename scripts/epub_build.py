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

def _is_light_color(val):
    """color 值是否「淺色」（淺底書頁上會看不見）。"""
    v = val.strip().lower()
    r = g = b = None
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) >= 6:
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    elif v.startswith("rgb"):
        nums = re.findall(r"[\d.]+", v)
        if len(nums) >= 3:
            r, g, b = float(nums[0]), float(nums[1]), float(nums[2])
    elif v in ("white", "ivory", "snow", "floralwhite", "cornsilk", "beige", "linen"):
        return True
    if r is None:
        return False
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6

# 行內樣式要丟掉的屬性：深色底/卡片裝飾，不符合「像書一樣」的淺底版面
_DROP_STYLE = {"background", "background-color", "background-image",
               "box-shadow", "border-radius"}

def clean_inline_style(style):
    """清掉行內樣式的深色底/卡片裝飾與淺色字（淺底看不見），保留深色強調等其餘宣告。"""
    out = []
    for decl in style.split(";"):
        if ":" not in decl:
            continue
        prop, val = decl.split(":", 1)
        p = prop.strip().lower()
        if p in _DROP_STYLE:
            continue
        if p == "color" and _is_light_color(val):
            continue
        out.append(prop.strip() + ":" + val.strip())
    return ";".join(out)

from html.parser import HTMLParser

VOID = {"br", "hr", "img", "wbr", "col", "source", "input", "meta",
        "link", "area", "base", "embed", "param", "track"}
# 這些區塊起始標籤會隱式關閉一個未閉合的 <p>（HTML5 規則）
P_CLOSERS = {"address", "article", "aside", "blockquote", "details", "div",
             "dl", "fieldset", "figcaption", "figure", "footer", "form",
             "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr",
             "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul"}

_FONT_CMAP = None
def font_cmap():
    """嵌入 master 字型的 cmap 涵蓋集（用來判斷哪些字會變 tofu）。"""
    global _FONT_CMAP
    if _FONT_CMAP is None:
        try:
            from fontTools.ttLib import TTFont
            f = TTFont(FONT_REGULAR)
            s = set()
            for t in f["cmap"].tables:
                s |= set(t.cmap.keys())
            _FONT_CMAP = s
        except Exception:
            _FONT_CMAP = set()
    return _FONT_CMAP

def strip_tofu(text):
    """移除字型沒有、且屬於符號/emoji/格式類的字元（會在 e-ink 變亂碼）。
    保留：字型有的字、所有字母/數字/標點/空白（含韓文等需 fallback 的真實文字）。"""
    cmap = font_cmap()
    if not cmap:
        return text
    out = []
    for c in text:
        if c.isspace() or ord(c) in cmap:
            out.append(c); continue
        cat = unicodedata.category(c)
        if cat and cat[0] in ("S", "C"):   # 符號 / 控制·格式（emoji、dingbat、ZWJ、VS16…）
            continue
        out.append(c)
    return "".join(out)

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
            if k == "style":       # 清掉深色底/卡片裝飾/淺色字，維持淺底書頁
                v = clean_inline_style(v or "")
                if not v:
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
        self.out.append(_esc_text(strip_tofu(data)))
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
    # emoji 場景分隔 → 乾淨的排版分隔（e-ink 上不會變亂碼）
    s = re.sub(r'<div class="div-orn"[^>]*>.*?</div>',
               '<p class="scene">·　·　·</p>', s, flags=re.S)
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

def build_ncx(slug, book_title, toc):
    """產生 EPUB2 NCX —— Kobo 側載書的「目錄」選單靠它，閱讀中可隨時跳章。
    有「部」則做兩層（部為可收合的父節點，章在其下）；否則平鋪。"""
    play = [0]
    def label_of(num, t):
        return (num + " " + t).strip() if num else t
    def leaf(label, src):
        play[0] += 1; pid = play[0]
        return (f'<navPoint id="np{pid}" playOrder="{pid}">'
                f'<navLabel><text>{html.escape(label)}</text></navLabel>'
                f'<content src="text/{src}"/></navPoint>')
    pts = [leaf("封面・序", "title.xhtml"), leaf("目錄", "toc.xhtml")]
    i, n = 0, len(toc)
    while i < n:
        e = toc[i]
        if e[0] == "part":
            name = e[1]; i += 1
            play[0] += 1; pid = play[0]      # 父節點先取號
            first_src, kids = None, []
            while i < n and toc[i][0] == "act":
                _, cid, num, t = toc[i]
                if first_src is None:
                    first_src = cid + ".xhtml"
                play[0] += 1; kpid = play[0]
                kids.append(f'<navPoint id="np{kpid}" playOrder="{kpid}">'
                            f'<navLabel><text>{html.escape(label_of(num, t))}</text></navLabel>'
                            f'<content src="text/{cid}.xhtml"/></navPoint>')
                i += 1
            pts.append(f'<navPoint id="np{pid}" playOrder="{pid}">'
                       f'<navLabel><text>{html.escape(name)}</text></navLabel>'
                       f'<content src="text/{first_src or "toc.xhtml"}"/>'
                       + "".join(kids) + "</navPoint>")
        else:
            _, cid, num, t = e
            pts.append(leaf(label_of(num, t), cid + ".xhtml"))
            i += 1
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh-Hant">\n'
        '<head>\n'
        f'<meta name="dtb:uid" content="urn:investmquest:history:{slug}"/>\n'
        '<meta name="dtb:depth" content="2"/>\n'
        '<meta name="dtb:totalPageCount" content="0"/>\n'
        '<meta name="dtb:maxPageNumber" content="0"/>\n'
        '</head>\n'
        f'<docTitle><text>{html.escape(book_title)}</text></docTitle>\n'
        '<navMap>\n' + "\n".join(pts) + '\n</navMap>\n</ncx>\n'
    )

def toc_page(toc, book_title):
    """書內的目錄頁：列出各部與各章，連到對應章節檔。"""
    rows = []
    for e in toc:
        if e[0] == "part":
            rows.append(f'<p class="toc-part">{html.escape(e[1])}</p>')
        else:
            _, cid, num, t = e
            n = f'<span class="toc-num">{html.escape(num)}</span>' if num else ""
            rows.append(f'<p class="toc-item">{n}<a href="{cid}.xhtml">{html.escape(t)}</a></p>')
    inner = ('<section class="toc">\n'
             '<h1>目錄<span class="en">Contents</span></h1>\n'
             + "\n".join(rows) + "\n</section>\n")
    return page(book_title, "", inner)

def act_page(a, vars_, title):
    cls = "act finale" if a.get("finale") else "act"
    num = clean_fragment(a["num"], vars_)
    ttl = clean_fragment(a["title"], vars_)
    sub = clean_fragment(a["sub"], vars_)
    prose = clean_fragment(a["prose"], vars_)
    # 原本的 emoji 裝飾（⛩🌊⚓✦…）改成乾淨的金線分隔，e-ink 不再亂碼
    inner = (
        f'<section class="{cls}">\n<div class="act-head">\n'
        f'<p class="act-num">{num}</p>\n<h2 class="act-title">{ttl}</h2>\n'
        + (f'<p class="act-sub">{sub}</p>\n' if sub else "")
        + '<div class="act-rule"></div>\n'
        + '</div>\n' + prose + '\n</section>\n'
    )
    return inner

# ---------- CSS ----------

def build_css(vars_):
    v = lambda k, d: vars_.get(k, d)
    ink=v('ink','#1a1410'); parch=v('parchment','#f4ecdc')
    seaD=v('sea-deep','#0f2330'); gold=v('gold','#b08d34')
    goldB=v('gold-bright','#d4af5a'); rust=v('rust','#8c3a21')
    crim=v('crimson','#7a2418'); faint=v('faint','#6b5d48'); line=v('line','#c9b893')
    box="#ece2ca"   # 評論框淡底（實色，避免 rgba 在舊版 Kobo 引擎失效）
    # 注意：直接內嵌十六進位色，不用 CSS 變數——Kobo 的 EPUB 引擎不支援 var()
    return f"""@page{{ margin:0; }}
html,body{{ margin:0; padding:0; background:{parch}; color:{ink}; }}
body{{
  font-family:"Noto Serif TC","Noto Serif CJK TC",serif;
  font-size:.85em;            /* 預設略小：Kobo 開啟基準字級，仍可用滑桿放大 */
  line-height:1.85; text-align:justify;
  padding:1.3em 1.15em 2.6em;
}}
/* 全部用 em → Kobo 字級滑桿可整體縮放 */
p{{ margin:0 0 1.05em; }}
/* 內文首行縮排 2 個字（中文書習慣）；即使 Kobo 把段距設成 0，縮排仍能清楚分段 */
.prose p{{ text-indent:2em; margin:0 0 .9em; }}
.prose .pull p, .prose .stat .lbl, .prose .stat .num{{ text-indent:0; }}
strong{{ font-weight:700; color:{crim}; }}
em{{ font-style:italic; }}

/* 標題頁（淺底書頁，與其餘頁面一致） */
.titlepage{{ text-align:center; padding:3.2em 0 1.6em; }}
.titlepage .kicker{{ font-size:.7em; letter-spacing:.34em; color:{gold};
  text-transform:uppercase; margin:0 0 1.8em; }}
.titlepage h1{{ font-size:2.2em; font-weight:900; line-height:1.25; margin:0; color:{seaD}; }}
.titlepage h1 .em{{ color:{rust}; }}
.titlepage .sub{{ font-size:1em; font-style:italic; color:{faint};
  margin:1.5em 0 0; line-height:1.7; }}
.titlepage .rule{{ width:4.5em; height:2px; background:{gold}; margin:2em auto 0; }}
.lede{{ margin-top:2.6em; }}
.lede p{{ font-style:italic; }}
.lede .drop{{ float:left; font-size:3em; line-height:.8; padding:.04em .14em 0 0;
  color:{rust}; font-weight:700; }}

/* 目錄頁 */
.toc{{ padding:1em 0 .5em; }}
.toc h1{{ text-align:center; font-size:1.5em; font-weight:900; color:{seaD};
  letter-spacing:.18em; margin:.8em 0 1.6em; }}
.toc h1 .en{{ display:block; font-size:.42em; font-style:italic; font-weight:400;
  letter-spacing:.2em; color:{faint}; margin-top:.5em; text-transform:uppercase; }}
.toc-part{{ font-size:.8em; font-weight:700; color:{gold}; letter-spacing:.16em;
  text-transform:uppercase; margin:1.6em 0 .6em; padding-bottom:.35em;
  border-bottom:1px solid {line}; }}
.toc-item{{ margin:.55em 0; line-height:1.5; }}
.toc-item a{{ color:{ink}; text-decoration:none; }}
.toc-num{{ color:{gold}; font-size:.85em; margin-right:.5em; }}

/* 「部」分隔頁 */
.partdiv{{ text-align:center; padding:2.8em 0 1.6em; margin:0 0 1.8em;
  border-bottom:1px solid {line}; }}
.partdiv .pn{{ font-size:.76em; letter-spacing:.32em; color:{gold};
  text-transform:uppercase; margin:0 0 .5em; }}
.partdiv .pt{{ font-size:1.65em; font-weight:900; color:{seaD}; margin:0; line-height:1.3; }}
.partdiv .pe{{ font-size:.85em; font-style:italic; color:{faint}; margin:.6em 0 0; }}

/* 章首 */
.act-head{{ text-align:center; margin:.5em 0 2.2em; }}
.act-num{{ font-size:.72em; letter-spacing:.3em; color:{gold};
  text-transform:uppercase; margin:0 0 .7em; }}
.act-title{{ font-size:1.5em; font-weight:900; color:{seaD}; line-height:1.32; margin:0; }}
.act-sub{{ font-size:.88em; font-style:italic; color:{faint}; margin:.7em 0 0; }}
.act-rule{{ width:3.2em; height:2px; background:{gold}; margin:1.3em auto 0; }}

/* 內文小標 */
.prose h3{{ font-size:1.1em; font-weight:700; color:{rust};
  margin:2em 0 .7em; line-height:1.45; }}
.prose blockquote{{ margin:1.5em 1.1em; padding-left:.9em;
  border-left:3px solid {gold}; color:{faint}; font-style:italic; }}

/* 場景分隔（取代原本的 emoji 裝飾） */
.scene{{ text-align:center; color:{gold}; letter-spacing:.5em;
  margin:1.8em 0; font-size:.95em; }}

/* 數據卡 */
.stats{{ margin:1.8em 0; }}
.stat{{ border:1px solid {line}; padding:.8em 1em; margin:.6em 0; text-align:center; }}
.stat .num{{ font-size:1.45em; font-weight:900; color:{rust}; line-height:1.2; }}
.stat .lbl{{ font-size:.82em; color:{faint}; margin-top:.35em; }}

/* 評論框 / 原則框 */
.investor,.principle{{ border:1px solid {gold}; border-left:4px solid {gold};
  background:{box}; padding:1.1em 1.15em; margin:2em 0; }}
.investor .tag,.principle .tag{{ display:block; font-size:.7em; letter-spacing:.18em;
  text-transform:uppercase; color:{gold}; margin:0 0 .7em; font-weight:700; }}

/* 引文 */
.pull{{ border-top:1px solid {gold}; border-bottom:1px solid {gold};
  padding:1.1em .5em; margin:2em 0; text-align:center; }}
.pull p{{ font-size:1.1em; font-style:italic; color:{seaD}; margin:0; line-height:1.6; }}
.wrap{{ margin:0; }}

/* 終章 */
.finale .act-title{{ color:{crim}; }}
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

def build_epub(slug, embed=False, verbose=True, reuse_fonts=False):
    src = os.path.join(HIST, slug + ".html")
    doc = parse_doc(read(src))
    vars_ = doc["vars"]

    # 章節組裝：part-div 併入下一個 act 檔頂端
    def plain(s):
        return html.unescape(re.sub("<[^>]+>", "", s or "")).strip()
    chapters = []   # (id, filename, title, xhtml)
    toc = []        # ('part', name) | ('act', cid, num, title)
    pending_part = None
    pending_part_name = None
    idx = 0
    for kind, _pos, data in doc["seq"]:
        if kind == "part":
            pending_part = part_page(data)
            pending_part_name = plain(data.get("pt"))
            continue
        idx += 1
        inner = (pending_part or "") + act_page(data, vars_, doc["title"])
        cid = slugify_id(idx)
        ch_title = plain(data["title"])
        # 章序：取 act-num 中「·」前的中文段（序章 / 第一章…）
        num = plain(data["num"]).split("·")[0].strip()
        if pending_part_name:
            toc.append(("part", pending_part_name))
        toc.append(("act", cid, num, ch_title))
        pending_part = None
        pending_part_name = None
        chapters.append((cid, cid + ".xhtml", ch_title,
                         page(doc["title"], "", inner)))

    if not chapters:
        raise ValueError("無 act 章節（互動/資料頁，非敘事長文），略過")

    # 標題頁 + 目錄頁
    title_xhtml = title_page(doc)
    toc_xhtml = toc_page(toc, doc["title"])

    # 封面圖（Pillow 畫；失敗則無封面，不影響其餘）。風格：裝飾藝術 deco
    cover_bytes = None
    try:
        import cover_styles
        cover_bytes = cover_styles.cover_for(slug, vars_, doc["h1"], doc["kicker"], doc["sub"])
    except Exception:
        cover_bytes = None
    cover_xhtml = (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-Hant" lang="zh-Hant">\n'
        '<head><meta charset="utf-8"/><title>封面</title>\n'
        '<style>html,body{margin:0;padding:0;text-align:center}'
        'img{max-width:100%;max-height:100%}</style></head>\n'
        '<body><div><img src="../images/cover.jpg" alt="封面"/></div></body>\n</html>\n'
    ) if cover_bytes else None

    css = build_css(vars_)

    # 收集全文字元供 subset
    alltext = doc["title"] + doc["h1"] + doc["sub"] + doc["lede"] + \
        toc_xhtml + "".join(c[3] for c in chapters)

    manifest, spine, navlis = [], [], []
    manifest.append('<item id="css" href="style.css" media-type="text/css"/>')
    manifest.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    manifest.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
    if cover_bytes:
        manifest.append('<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>')
        manifest.append('<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>')
        spine.append('<itemref idref="cover"/>')
    manifest.append('<item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>')
    manifest.append('<item id="toc" href="text/toc.xhtml" media-type="application/xhtml+xml"/>')
    spine.append('<itemref idref="title"/>')
    spine.append('<itemref idref="toc"/>')
    navlis.append('<li><a href="text/title.xhtml">封面・序</a></li>')
    navlis.append('<li><a href="text/toc.xhtml">目錄</a></li>')
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
        # reuse_fonts：沿用既有 epub 內的 subset woff2（只改內容/CSS 時免重新 subset）
        existing = None
        if reuse_fonts:
            ep = os.path.join(OUT, slug + ".epub")
            if os.path.exists(ep):
                existing = zipfile.ZipFile(ep)
        for nm, w, master, href in weights:
            if existing is not None:
                data = existing.read("OEBPS/fonts/" + href)
            else:
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
        if existing is not None:
            existing.close()

    opf = f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-Hant">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:investmquest:history:{slug}</dc:identifier>
    <dc:title>{html.escape(doc['title'])}</dc:title>
    <dc:language>zh-Hant</dc:language>
    <dc:publisher>investmquest.com</dc:publisher>
    <meta property="dcterms:modified">2026-06-25T00:00:00Z</meta>
    {'<meta name="cover" content="cover-img"/>' if cover_bytes else ''}
  </metadata>
  <manifest>
    {chr(10).join('    ' + m for m in manifest).strip()}
  </manifest>
  <spine toc="ncx">
    {chr(10).join('    ' + s for s in spine).strip()}
  </spine>
</package>
"""

    ncx = build_ncx(slug, doc["title"], toc)

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
        zi("OEBPS/toc.ncx", ncx)
        zi("OEBPS/nav.xhtml", nav)
        zi("OEBPS/style.css", css_full)
        if cover_bytes:
            z.writestr("OEBPS/images/cover.jpg", cover_bytes, compress_type=zipfile.ZIP_STORED)
            zi("OEBPS/text/cover.xhtml", cover_xhtml)
        zi("OEBPS/text/title.xhtml", title_xhtml)
        zi("OEBPS/text/toc.xhtml", toc_xhtml)
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
    ap.add_argument("--reuse-fonts", action="store_true",
                    help="沿用既有 epub 的 subset 字型（只改內容/CSS 時快速重建）")
    args = ap.parse_args()

    if args.all:
        slugs = sorted(os.path.splitext(f)[0] for f in os.listdir(HIST)
                       if f.endswith(".html") and f != "index.html")
        ok = 0
        for s in slugs:
            try:
                build_epub(s, args.embed, reuse_fonts=args.reuse_fonts); ok += 1
            except Exception as e:
                print(f"✗ {s}: {e}")
        print(f"\n完成 {ok}/{len(slugs)}")
    elif args.slug:
        build_epub(args.slug, args.embed, reuse_fonts=args.reuse_fonts)
    else:
        ap.print_help()

if __name__ == "__main__":
    main()
