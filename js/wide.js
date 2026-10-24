/* InvestMQuest toolbox — widen page frames on large screens.
   Loaded by navbar.js, or directly by pages without the shared navbar.
   At viewport >= 1280px, every centered frame whose original max-width is >= 1000px
   grows to max(original, min(1700px, 100% - 48px)). Narrower frames (reading columns,
   e.g. .report-container 860px) and every viewport below 1280px keep their original layout. */
(function(){
if (window.__imqWide) return;
window.__imqWide = true;

var MIN_ORIG = 1000, CAP = 1700, BP = 1280;

function run(){
  var tops = {}, css = '', n = 0;
  var all = document.body.querySelectorAll('*');
  for (var i = 0; i < all.length; i++){
    var el = all[i], cs = getComputedStyle(el), mw = cs.maxWidth;
    if (!/px$/.test(mw)) continue;
    var px = parseFloat(mw);
    if (px < MIN_ORIG || px >= CAP) continue;
    if (cs.position === 'fixed' || cs.position === 'absolute') continue;
    if (cs.display.indexOf('inline') === 0 || cs.display === 'none') continue;
    if (cs.marginLeft !== cs.marginRight) continue;          /* only centered frames */
    var nested = el.parentElement && el.parentElement.closest('[data-imq-w],[data-imq-wn]');
    if (nested) { el.setAttribute('data-imq-wn', ''); n++; continue; }
    el.setAttribute('data-imq-w', px);
    tops[px] = true; n++;
  }
  if (!n) return;
  for (var k in tops){
    css += '[data-imq-w="' + k + '"]{max-width:max(' + k + 'px,min(' + CAP + 'px,calc(100% - 48px)))!important}';
  }
  /* frames nested inside a widened frame just follow their parent */
  css += '[data-imq-wn]{max-width:100%!important}';
  var st = document.createElement('style');
  st.id = 'imq-wide-style';
  st.textContent = '@media(min-width:' + BP + 'px){' + css + '}';
  document.head.appendChild(st);
  /* charts sized before widening need a resize pass */
  if (window.innerWidth >= BP){
    window.dispatchEvent(new Event('resize'));
    window.addEventListener('load', function(){ window.dispatchEvent(new Event('resize')); });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();
})();
