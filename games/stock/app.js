(()=>{
'use strict';
const CONTEXT=60,PLAY=60,SLOTS=122;
const $=id=>document.getElementById(id);
const UP='#ff7d8b',DOWN='#51d6af';
let catalog=null,cache={},G=null,frac=0.5,timer=null;

const money=(v,cur)=>(cur==='TWD'?'NT$':'US$')+Math.round(v).toLocaleString('en-US');
const pct=v=>(v>=0?'+':'')+(v*100).toFixed(2)+'%';
const px=v=>v>=100?v.toFixed(1):v.toFixed(2);
const tint=(el,v)=>{el.classList.toggle('up',v>0);el.classList.toggle('down',v<0);};

async function loadJSON(p){const r=await fetch(p);if(!r.ok)throw Error(p+' '+r.status);return r.json();}
async function loadStock(sym){return cache[sym]||(cache[sym]=await loadJSON('data/'+sym+'.json'));}

function movingAverage(c,p){
  const out=new Array(c.length).fill(null);let s=0;
  for(let i=0;i<c.length;i++){s+=c[i];if(i>=p)s-=c[i-p];if(i>=p-1)out[i]=s/p;}
  return out;
}

async function newGame(){
  const q=new URLSearchParams(location.search).get('sym');
  const pool=catalog.filter(e=>e.starts.length);
  const pick=(q&&pool.find(e=>e.symbol===q))||pool[Math.floor(Math.random()*pool.length)];
  const data=await loadStock(pick.symbol);
  const total=pick.starts.reduce((s,[a,b])=>s+b-a+1,0);
  let r=Math.floor(Math.random()*total),t0=pick.starts[0][0];
  for(const [a,b] of pick.starts){const n=b-a+1;if(r<n){t0=a+r;break;}r-=n;}
  const cash0=pick.currency==='TWD'?1000000:100000;
  const k=data.r[t0]/data.c[t0],sc=arr=>arr.map(v=>v*k);
  G={meta:pick,d:{...data,o:sc(data.o),h:sc(data.h),l:sc(data.l),c:sc(data.c)},t0,day:1,cash0,cash:cash0,shares:0,trades:[],marks:[],ma20:null,ma60:null,ended:false};
  G.ma20=movingAverage(G.d.c,20);G.ma60=movingAverage(G.d.c,60);
  stopAuto();
  $('start').hidden=true;$('result').hidden=true;$('game').hidden=false;
  $('stockName').textContent=pick.name;$('stockSym').textContent=pick.symbol;
  render();
}

const idx=()=>G.t0+G.day-1;
const price=()=>G.d.c[idx()];
const equity=()=>G.cash+G.shares*price();

function render(){
  const p=price(),eq=equity(),cur=G.meta.currency;
  $('dayText').textContent=`第 ${G.day}／${PLAY} 天`;
  $('hCash').textContent=money(G.cash,cur);
  $('hShares').textContent=G.shares.toLocaleString('en-US');
  $('hEquity').textContent=money(eq,cur);
  const ret=eq/G.cash0-1;$('hRet').textContent=pct(ret);tint($('hRet'),Math.abs(ret)<5e-5?0:ret);
  $('hPrice').textContent=px(p);
  const canBuy=Math.floor(G.cash*frac/p)>=1,canSell=G.shares>=1;
  $('buyBtn').disabled=!canBuy;$('sellBtn').disabled=!canSell;
  const bq=Math.floor(G.cash*frac/p),sq=sellQty();
  $('hint').textContent=(canBuy?`買進約 ${bq.toLocaleString('en-US')} 股`:'現金不足一股')+'　／　'+(canSell?`賣出 ${sq.toLocaleString('en-US')} 股`:'沒有持股');
  $('nextBtn').textContent=G.day>=PLAY?'結算 ▶':'下一天 ▶';
  drawChart();
}

function sellQty(){return frac>=1?G.shares:Math.max(1,Math.floor(G.shares*frac));}

function buy(){
  if(G.ended)return;const p=price(),q=Math.floor(G.cash*frac/p);if(q<1)return;
  G.cash-=q*p;G.shares+=q;G.trades.push({i:idx(),side:1,q,p});render();
}
function sell(){
  if(G.ended||G.shares<1)return;const p=price(),q=Math.min(G.shares,sellQty());
  G.cash+=q*p;G.shares-=q;G.trades.push({i:idx(),side:-1,q,p});render();
}
function next(){
  if(G.ended)return;
  if(G.day>=PLAY){finish();return;}
  G.day++;render();
}
function stopAuto(){if(timer){clearInterval(timer);timer=null;}const b=$('autoBtn');b.setAttribute('aria-pressed','false');b.textContent='自動播放';}
function toggleAuto(){
  if(timer){stopAuto();return;}
  const b=$('autoBtn');b.setAttribute('aria-pressed','true');b.textContent='暫停播放';
  timer=setInterval(()=>{if(G.day>=PLAY){stopAuto();return;}next();},1000);
}

function finish(){
  stopAuto();G.ended=true;
  const cur=G.meta.currency,d=G.d,i0=G.t0,i1=idx();
  const you=equity()/G.cash0-1,hold=d.c[i1]/d.c[i0]-1;
  $('game').hidden=true;$('result').hidden=false;
  $('rName').textContent=`${G.meta.name}（${G.meta.symbol}）`;
  $('rRange').textContent=`真實日期：${d.d[i0]} 至 ${d.d[i1]}（${G.day} 個交易日）`;
  $('rYou').textContent=pct(you);$('rHold').textContent=pct(hold);
  tint($('rYou'),you);tint($('rHold'),hold);
  const diff=you-hold;
  $('rVerdict').textContent=Math.abs(diff)<5e-5?'跟放著不動打平。':diff>0?`你比放著不動多賺 ${(diff*100).toFixed(2)} 個百分點。`:`放著不動比你多賺 ${(-diff*100).toFixed(2)} 個百分點。`;
  $('rTrades').textContent=G.trades.length;
  $('rEquity').textContent=`${money(equity(),cur)}（起始 ${money(G.cash0,cur)}）`;
  try{
    const best=parseFloat(localStorage.getItem('stockStarterBest'));
    if(!(best>=you))localStorage.setItem('stockStarterBest',String(you));
  }catch(e){}
  window.scrollTo(0,0);
}

function showBest(){
  try{const b=parseFloat(localStorage.getItem('stockStarterBest'));
    $('best').textContent=Number.isFinite(b)?`你的最佳報酬率：${pct(b)}`:'';}catch(e){}
}

/* ---- chart (adapted from 盤感 LAB drawChart) ---- */
let hover=null;
function layout(){
  const c=$('chart'),r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=r.width,h=r.height;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
  return {c,w,h,dpr,left:4,right:w-46,top:22,bottom:h-6};
}
function drawChart(){
  if(!G)return;
  const L=layout(),ctx=L.c.getContext('2d');
  if(!L.w||!L.h)return;
  ctx.setTransform(L.dpr,0,0,L.dpr,0,0);ctx.clearRect(0,0,L.w,L.h);
  const d=G.d,hi=idx(),lo=Math.max(0,G.t0-CONTEXT),n=hi-lo+1;
  const slot=(L.right-L.left)/SLOTS,cw=Math.max(1,slot*0.68);
  const volH=(L.bottom-L.top)*0.17,pBottom=L.bottom-volH-6;
  let pmin=Infinity,pmax=-Infinity,vmax=0;
  for(let i=lo;i<=hi;i++){pmin=Math.min(pmin,d.l[i]);pmax=Math.max(pmax,d.h[i]);vmax=Math.max(vmax,d.v[i]);}
  const pad=(pmax-pmin)*0.06||pmax*0.01;pmin-=pad;pmax+=pad*1.6;
  const X=i=>L.left+(i-lo+0.5)*slot,Y=v=>L.top+(pmax-v)/(pmax-pmin)*(pBottom-L.top);
  ctx.font='11px ui-monospace,Menlo,monospace';ctx.textBaseline='middle';
  for(let k=0;k<=4;k++){
    const v=pmax-(pmax-pmin)*k/4,y=Y(v);
    ctx.strokeStyle='#242c37';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L.left,y);ctx.lineTo(L.right,y);ctx.stroke();
    ctx.fillStyle='#929dab';ctx.textAlign='left';ctx.fillText(px(v),L.right+4,y);
  }
  // 進行起點分隔線
  const ps=G.t0-lo;
  if(ps>0){ctx.strokeStyle='#556373';ctx.setLineDash([2,5]);ctx.beginPath();const x=L.left+ps*slot;ctx.moveTo(x,L.top);ctx.lineTo(x,L.bottom);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#6d7a8a';ctx.textAlign='right';ctx.fillText('背景',x-4,L.top+6);ctx.textAlign='left';ctx.fillText('開局',x+4,L.top+6);}
  for(let i=lo;i<=hi;i++){
    const x=X(i),col=d.c[i]>=d.o[i]?UP:DOWN;
    ctx.fillStyle=col;ctx.strokeStyle=col;ctx.lineWidth=1;
    ctx.globalAlpha=0.35;const vh=d.v[i]/vmax*volH;ctx.fillRect(x-cw/2,L.bottom-vh,cw,vh);ctx.globalAlpha=1;
    ctx.beginPath();ctx.moveTo(x,Y(d.h[i]));ctx.lineTo(x,Y(d.l[i]));ctx.stroke();
    const yo=Y(d.o[i]),yc=Y(d.c[i]);ctx.fillRect(x-cw/2,Math.min(yo,yc),cw,Math.max(1,Math.abs(yo-yc)));
  }
  for(const [arr,col] of [[G.ma20,'#f1c66e'],[G.ma60,'#72b7ff']]){
    ctx.strokeStyle=col;ctx.lineWidth=1.4;ctx.beginPath();let on=false;
    for(let i=lo;i<=hi;i++){const v=arr[i];if(v==null){on=false;continue;}const x=X(i),y=Y(v);on?ctx.lineTo(x,y):ctx.moveTo(x,y);on=true;}
    ctx.stroke();
  }
  // 最新價線
  const last=d.c[hi],yl=Y(last);
  ctx.strokeStyle='#adbd96';ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(L.left,yl);ctx.lineTo(L.right,yl);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#d4f779';ctx.fillRect(L.right+1,yl-8,L.w-L.right-1,16);ctx.fillStyle='#14180a';ctx.textAlign='left';ctx.fillText(px(last),L.right+4,yl);
  // B / S 標記（同日多筆只畫一個）
  const seen=new Set();
  ctx.textAlign='center';ctx.font='bold 11px ui-monospace,Menlo,monospace';
  for(const t of G.trades){
    if(t.i<lo||t.i>hi)continue;const key=t.i+':'+t.side;if(seen.has(key))continue;seen.add(key);
    const x=X(t.i),y=Y(t.p),dir=t.side===1?1:-1,col=t.side===1?'#ffb3bc':'#8aefce';
    ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,y+dir*3);ctx.lineTo(x-6,y+dir*13);ctx.lineTo(x+6,y+dir*13);ctx.closePath();ctx.fill();
    const ly=y+dir*22;ctx.fillStyle='#101319';ctx.fillRect(x-8,ly-8,16,16);ctx.fillStyle=col;ctx.fillText(t.side===1?'B':'S',x,ly);
  }
  // 游標
  if(hover!=null&&hover>=lo&&hover<=hi){
    const x=X(hover);ctx.strokeStyle='#7d8a99';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,L.top);ctx.lineTo(x,L.bottom);ctx.stroke();ctx.setLineDash([]);
  }
  tip();
}
function tip(){
  const el=$('tip');
  if(hover==null||!G){el.textContent='';return;}
  const d=G.d,i=hover,rel=i-G.t0+1;
  el.textContent=`${rel>=1?'第 '+rel+' 天':'背景 '+rel}　開 ${px(d.o[i])}　高 ${px(d.h[i])}　低 ${px(d.l[i])}　收 ${px(d.c[i])}`;
}
function pointer(e){
  if(!G||$('game').hidden)return;
  const r=$('chart').getBoundingClientRect(),L=layout(),slot=(L.right-L.left)/SLOTS,lo=Math.max(0,G.t0-CONTEXT);
  const i=lo+Math.floor((e.clientX-r.left-L.left)/slot);
  hover=(i>=lo&&i<=idx())?i:null;drawChart();
}

/* ---- wiring ---- */
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{
  frac=parseFloat(b.dataset.f);
  document.querySelectorAll('.chip').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});
  if(G)render();
}));
$('buyBtn').addEventListener('click',buy);
$('sellBtn').addEventListener('click',sell);
$('nextBtn').addEventListener('click',()=>{stopAuto();next();});
$('autoBtn').addEventListener('click',toggleAuto);
$('endBtn').addEventListener('click',()=>{if(G&&!G.ended)finish();});
$('startBtn').addEventListener('click',()=>newGame().catch(fail));
$('againBtn').addEventListener('click',()=>newGame().catch(fail));
$('chart').addEventListener('pointermove',pointer);
$('chart').addEventListener('pointerdown',pointer);
$('chart').addEventListener('pointerleave',()=>{hover=null;if(G)drawChart();});
window.addEventListener('resize',()=>{if(G&&!$('game').hidden)drawChart();});
function fail(e){console.error(e);$('best').textContent='資料載入失敗，請重新整理。';}

loadJSON('data/catalog.json').then(c=>{catalog=c;$('startBtn').disabled=false;}).catch(fail);
$('startBtn').disabled=true;
showBest();
window.__stock={get g(){return G;}}; // 僅供測試讀取
})();
