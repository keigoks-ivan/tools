(function () {
  'use strict';
  var KEY = 'invest-theme';
  var root = document.documentElement;

  function stored() { try { var v = localStorage.getItem(KEY); return (v === 'dark' || v === 'light') ? v : null; } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function systemTheme() {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  }
  function current() { return root.getAttribute('data-theme') || systemTheme(); }

  var s0 = stored();
  if (s0) root.setAttribute('data-theme', s0);

  function syncButtons() {
    var cur = current();
    var bs = document.querySelectorAll('.theme button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-set') === cur ? 'true' : 'false');
    }
  }

  function buildHeader() {
    var host = document.getElementById('site-header');
    if (!host) return;
    var base = document.body.getAttribute('data-root') || '';
    var here = document.body.getAttribute('data-nav') || '';
    var act = { tool: 'tool', questions: 'questions', q: 'questions', evidence: 'questions', route: 'route', allocate: 'route', product: 'route' }[here] || '';
    function link(key, href, label) {
      return '<a href="' + base + href + '"' + (act === key ? ' aria-current="page"' : '') + '>' + label + '</a>';
    }
    host.innerHTML =
      '<header class="hdr">' +
      '<a class="brand" href="' + base + 'index.html">[品牌名稱]</a>' +
      '<div class="hdr-r">' +
      '<nav class="nav" aria-label="主選單">' +
      link('tool', 'tool.html', '回測工具') +
      link('questions', 'questions.html', '常見問題') +
      link('route', 'index.html#route', '新手路線') +
      link('about', 'index.html#about', '關於數字') +
      '</nav>' +
      '<div class="theme" role="group" aria-label="主題">' +
      '<button type="button" data-set="dark" aria-pressed="false">深色</button>' +
      '<button type="button" data-set="light" aria-pressed="false">淺色</button>' +
      '</div></div></header>' +
      '<p class="trial">試作版：數字是初算，稅務內容還沒經專業人士確認。</p>';
    var bs = host.querySelectorAll('.theme button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].addEventListener('click', function (e) {
        var v = e.currentTarget.getAttribute('data-set');
        root.setAttribute('data-theme', v);
        store(v);
        syncButtons();
      });
    }
    syncButtons();
  }

  try {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () { syncButtons(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  } catch (e) {}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildHeader);
  else buildHeader();

  /* 共用：四條線的資料與 path 產生（照樣板 renderVals） */
  var S = {
    p100: [99,111,113,115,112,123,120,122,126,128,135,132,140,149,150,160,162,157,142,138,126,99,88,102,118,125,132,117,130,144,152,152,131,147,165,160,171,170,188,193,204,225,229,241,243,255,258,258,242,258,262,268,278,289,307,316,330,352,349,361,389,336,382,398,405,441,355,427,466,522,555,602,605,672,641,538,511,550,591,642,621,694,766,799,845,866,829,919,993,1020,975,1123,1150,1145],
    p80: [99,109,111,112,111,119,117,119,122,124,129,127,134,141,142,149,152,149,139,136,126,106,97,110,124,130,136,124,136,147,154,155,139,153,168,165,174,174,188,191,200,216,220,230,232,242,245,245,233,246,250,256,264,271,284,292,302,319,316,325,344,308,343,357,364,390,332,388,416,457,477,510,513,558,531,458,436,464,495,528,512,566,612,634,670,679,660,719,769,787,759,851,862,862],
    p60: [100,107,109,109,109,115,114,116,118,120,123,122,128,133,134,139,143,141,135,132,125,113,105,116,128,133,138,131,141,149,154,156,145,156,168,167,174,174,185,186,192,204,208,216,218,226,229,227,220,229,234,239,245,248,257,264,272,283,280,286,299,276,302,313,320,337,302,343,362,389,398,421,423,450,428,379,361,380,402,421,408,448,474,486,514,515,508,544,575,587,572,624,624,627],
    p40: [100,105,107,106,107,112,110,113,114,116,117,116,122,126,127,130,133,134,131,128,124,119,113,121,131,134,139,135,143,148,152,154,149,157,165,165,171,171,178,177,182,189,193,199,200,206,209,207,204,209,214,219,223,222,228,233,238,246,243,246,253,242,260,268,274,284,268,294,306,322,323,338,338,353,335,304,290,302,317,326,315,343,355,362,382,378,378,398,416,423,416,442,437,441]
  };
  var lo = Math.log(50), span = Math.log(1300) - lo;
  function yOf(v) { return 370 - (Math.log(v) - lo) / span * 360; }
  function paths() {
    var out = {};
    Object.keys(S).forEach(function (k) {
      var a = S[k], n = a.length - 1;
      out[k] = a.map(function (v, i) {
        var x = (i / n * 900).toFixed(1), y = yOf(v).toFixed(1);
        return (i ? 'L' : 'M') + x + ' ' + y;
      }).join(' ');
    });
    return out;
  }
  function applyPaths(svg) {
    var p = paths();
    Object.keys(p).forEach(function (k) {
      var el = svg.querySelector('[data-path="' + k + '"]');
      if (el) el.setAttribute('d', p[k]);
    });
  }

  window.INVEST = { series: S, paths: paths, applyPaths: applyPaths };
})();
