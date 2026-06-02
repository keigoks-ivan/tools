import re,sys
B_BLOCK=r'''<!-- imq-auto-toc -->
<style id="imq-auto-toc-style">
#imq-toc-prog{position:fixed;top:0;left:0;height:3px;z-index:10001;background:linear-gradient(90deg,#a8842f,#8a3a23);width:0}
#imq-auto-toc{position:fixed;top:46px;left:0;z-index:9000;max-height:calc(100vh - 56px);width:314px;overflow-y:auto;
  background:rgba(243,238,226,.98);border-right:1px solid #c6b58e;font-family:'Noto Serif TC',serif;
  padding:18px 14px 44px;transform:translateX(-340px);transition:transform .25s ease;box-shadow:2px 0 20px rgba(22,20,15,.13)}
#imq-auto-toc.open{transform:translateX(0)}
#imq-auto-toc .imq-toc-h{font-family:'Cinzel',serif;font-size:11px;letter-spacing:.2em;color:#8a3a23;font-weight:700;text-transform:uppercase;text-align:center;margin-bottom:14px}
#imq-auto-toc .imq-toc-part{font-family:'Cinzel',serif;font-size:10px;letter-spacing:.12em;color:#a8842f;text-transform:uppercase;margin:14px 0 3px;padding-left:8px;border-left:2px solid #a8842f;line-height:1.5}
#imq-auto-toc a{display:flex;gap:7px;align-items:baseline;color:#16140f;text-decoration:none;font-size:13px;line-height:1.42;padding:5px 8px;border-left:2px solid transparent;border-radius:3px}
#imq-auto-toc a:hover{background:rgba(168,132,47,.1)}
#imq-auto-toc a .imq-toc-n{font-family:'Cinzel',serif;font-size:10.5px;color:#8a3a23;min-width:2.5em;flex-shrink:0;letter-spacing:.02em;white-space:nowrap}
#imq-auto-toc a.on{border-left-color:#8a3a23;background:rgba(168,132,47,.17);font-weight:600}
@media(max-width:1100px){#imq-auto-toc{width:82vw;max-width:330px;transform:translateX(-105%)}}
</style>
<div id="imq-toc-prog"></div>
<nav id="imq-auto-toc" aria-label="Contents"><div class="imq-toc-h">目錄 · Contents</div></nav>
<button id="imq-auto-toc-toggle" title="目錄 Contents" aria-label="Contents">☰</button>
<script>(function(){
function init(){
  var nav=document.getElementById('imq-auto-toc'),btn=document.getElementById('imq-auto-toc-toggle'),prog=document.getElementById('imq-toc-prog');
  var heads=[].slice.call(document.querySelectorAll('h2.act-title, h2.ptitle'));
  if(heads.length<3){heads=[].slice.call(document.querySelectorAll('h2'));}
  if(heads.length<3){if(btn)btn.style.display='none';if(nav)nav.style.display='none';return;}
  var links=[];
  heads.forEach(function(h,i){
    var txt=(h.textContent||'').trim().replace(/\s+/g,' ');
    if(h.classList.contains('ptitle')){
      var p=document.createElement('div');p.className='imq-toc-part';p.textContent=txt;nav.appendChild(p);return;
    }
    var sec=h.closest('section')||h; if(!sec.id) sec.id='imqsec-'+i;
    var head=h.closest('.act-head')||h.parentNode;
    var numEl=head?head.querySelector('.act-num'):null;
    var num=numEl?(numEl.textContent||'').split('·')[0].trim():'';
    var a=document.createElement('a');a.href='#'+sec.id;
    var ns=document.createElement('span');ns.className='imq-toc-n';ns.textContent=num;
    var ts=document.createElement('span');ts.textContent=txt;
    a.appendChild(ns);a.appendChild(ts);
    a.addEventListener('click',function(){if(window.innerWidth<=1100)nav.classList.remove('open');});
    nav.appendChild(a);links.push({a:a,sec:sec});
  });
  btn.addEventListener('click',function(){nav.classList.toggle('open');});
  if(window.innerWidth>1100)nav.classList.add('open');
  var ticking=false;
  function mark(){ticking=false;var y=window.scrollY+110,cur=null;
    links.forEach(function(l){if(l.sec.offsetTop<=y)cur=l;});
    links.forEach(function(l){l.a.classList.toggle('on',l===cur);});
    var de=document.documentElement;if(prog)prog.style.width=(de.scrollTop/((de.scrollHeight-de.clientHeight)||1)*100)+'%';}
  window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(mark);ticking=true;}},{passive:true});
  mark();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();</script>
'''
def transform(slug):
    p=f'history/{slug}.html'; t=open(p,encoding='utf-8').read()
    # --- remove plain #imq-auto-toc block (idempotent) ---
    t=re.sub(r'<!-- imq-auto-toc -->\s*','',t)
    t=re.sub(r'<style id="imq-auto-toc-style">[\s\S]*?</style>\s*','',t)
    t=re.sub(r'<div id="imq-toc-prog">[\s\S]*?</div>\s*','',t)
    t=re.sub(r'<nav id="imq-auto-toc"[\s\S]*?</nav>\s*','',t)
    t=re.sub(r'<button id="imq-auto-toc-toggle"[\s\S]*?</button>\s*','',t)
    t=re.sub(r'<script>(?:(?!</script>)[\s\S])*?imq-auto-toc(?:(?!</script>)[\s\S])*?</script>\s*','',t)
    # --- remove inline .toc TOC ---
    t=re.sub(r'/\* =+ *TABLE OF CONTENTS *=+ \*/[\s\S]*?(?=/\* =)','',t)
    t=re.sub(r'<!--[^>]*(?:目錄|TABLE OF CONTENTS)[^>]*-->\s*','',t,flags=re.I)
    t=re.sub(r'<nav class="toc[\s\S]*?</nav>\s*','',t)
    # --- inject B after <body> ---
    t=re.sub(r'(<body[^>]*>)', lambda m: m.group(1)+'\n'+B_BLOCK, t, count=1)
    open(p,'w',encoding='utf-8').write(t)
    # verify
    navc=t.count('<nav id="imq-auto-toc"'); prog=t.count('id="imq-toc-prog"'); tog=t.count('imq-auto-toc-toggle')
    scr=len(re.findall(r'<script>(?:(?!</script>)[\s\S])*?imq-auto-toc(?:(?!</script>)[\s\S])*?</script>',t))
    inline=len(re.findall(r'<nav class="toc',t)); toccss=t.count('TABLE OF CONTENTS')
    bal=(t.count('<div')==t.count('</div>') and t.count('<section')==t.count('</section>') and t.count('<nav')==t.count('</nav>') and t.count('<style')==t.count('</style>'))
    ok = navc==1 and prog==1 and tog>=1 and scr==1 and inline==0 and toccss==0 and bal
    print(f"  {slug:22} nav:{navc} prog:{prog} script:{scr} inline殘:{inline} TOCcss殘:{toccss} 平衡:{bal} -> {'✅' if ok else '❌'}")
    return ok

slugs=sys.argv[1:]
allok=all(transform(s) for s in slugs)
print("ALLOK" if allok else "SOMEFAIL")
