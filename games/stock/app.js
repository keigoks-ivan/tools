(()=>{
'use strict';
const CONTEXT=60,PLAY=60,SLOTS=122;
const $=id=>document.getElementById(id);
const UP='#ff7d8b',DOWN='#51d6af';
let catalog=null,cache={},G=null,frac=0.5,timer=null;

/* 名場面：數字皆由本局資料計算（SPY／QQQ 等為還原股價；價格依開局日重新縮放） */
const SCENES=[
  {sym:'SPY',start:'2018-10-01',label:'美股大盤',title:'2018 年第四季急殺',text:'2018 年底，市場擔心聯準會升息過頭，美股一路下跌。依本局資料計算，SPY 從 10 月 1 日起最大回落 19.2%，低點在 12 月 24 日，兩天後（12 月 26 日）單日反彈 5.05%。'},
  {sym:'SPY',start:'2020-02-03',label:'美股大盤',title:'2020 疫情崩盤',text:'新冠疫情擴散，全球股市在 2020 年 2、3 月急跌。依本局資料計算，SPY 從 2 月 19 日高點到 3 月 23 日低點回落 33.7%，單日最大跌幅 10.94%（3 月 16 日）；低點之後到第 60 天回升 28.2%。'},
  {sym:'TSLA',start:'2020-07-01',label:'美股個股',title:'2020 特斯拉狂飆',text:'2020 年夏天，特斯拉股價連番大漲。依本局資料計算，從第 1 天收盤到 8 月 31 日高點漲了 122.5%；9 月 8 日單日下跌 21.06%，高點到低點回落 33.7%。'},
  {sym:'QQQ',start:'2022-04-01',label:'美股科技股',title:'2022 升息熊市',text:'2022 年聯準會快速升息，科技股承壓。依本局資料計算，QQQ 從 4 月 4 日高點到 6 月 16 日低點回落 26.5%，單日最大跌幅 5.04%（5 月 5 日）。'},
  {sym:'NVDA',start:'2023-04-17',label:'美股個股',title:'2023 輝達 AI 行情',text:'輝達在 2023 年 5 月公布財報，AI 需求成為市場焦點。依本局資料計算，財報隔天（5 月 25 日）單日大漲 24.37%；第 60 天收盤比第 1 天高 62.6%。'},
  {sym:'2317.TW',start:'2024-03-01',label:'台股權值股',title:'2024 鴻海 AI 伺服器行情',text:'2024 年春天，市場對 AI 伺服器的需求升溫，鴻海股價持續走高。依本局資料計算，第 60 天收盤 185.5 元，比第 1 天高 81.9%；單日最大漲幅 9.09%（3 月 15 日）。'},
  {sym:'2330.TW',start:'2024-06-03',label:'台股權值股',title:'2024 台積電 AI 行情與 8 月急殺',text:'台積電在 AI 需求帶動下，7 月 11 日創本局高點，比第 1 天高 28.2%。8 月初全球股市同步急殺，8 月 5 日單日下跌 9.75%，從高點到該日收盤回落 24.5%。'},
  {sym:'2330.TW',start:'2025-03-17',label:'台股權值股',title:'2025 關稅風暴',text:'2025 年 4 月，美國宣布大幅加徵關稅，全球股市急跌後反彈。依本局資料計算，台積電從 3 月 25 日高點到 4 月 9 日低點回落 20.7%，4 月 7 日單日下跌 9.98%；低點之後到第 60 天回升 33.7%。'}
];
const sceneKey='stockStarterScenes';
function wonScenes(){try{const a=JSON.parse(localStorage.getItem(sceneKey));return Array.isArray(a)?a:[];}catch(e){return [];}}
function markWon(n){try{const a=wonScenes();if(!a.includes(n)){a.push(n);localStorage.setItem(sceneKey,JSON.stringify(a));}}catch(e){}}
function showLevels(){
  const won=wonScenes(),box=$('levelList');box.textContent='';
  SCENES.forEach((sc,i)=>{
    const b=document.createElement('button');b.className='lv';
    const t=document.createElement('span');t.textContent='關卡 '+(i+1)+'・'+sc.label;
    const sm=document.createElement('small');sm.textContent='60 個交易日';t.appendChild(sm);b.appendChild(t);
    if(won.includes(i)){const ok=document.createElement('span');ok.className='ok';ok.textContent='✓';ok.setAttribute('aria-label','已打贏放著不動');b.appendChild(ok);}
    b.addEventListener('click',()=>newGame(i).catch(fail));box.appendChild(b);
  });
  $('start').hidden=true;$('result').hidden=true;$('game').hidden=true;$('levels').hidden=false;window.scrollTo(0,0);
}
function showStart(){$('levels').hidden=true;$('result').hidden=true;$('game').hidden=true;$('start').hidden=false;}

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

async function newGame(sceneIdx){
  const sc=Number.isInteger(sceneIdx)?SCENES[sceneIdx]:null;
  const q=new URLSearchParams(location.search).get('sym');
  const pool=catalog.filter(e=>e.starts.length);
  const pick=sc?catalog.find(e=>e.symbol===sc.sym):(q&&pool.find(e=>e.symbol===q))||pool[Math.floor(Math.random()*pool.length)];
  const data=await loadStock(pick.symbol);
  let t0=pick.starts[0][0];
  if(sc){
    t0=data.d.indexOf(sc.start);
    if(t0<0||!pick.starts.some(([a,b])=>t0>=a&&t0<=b))throw Error('scene start invalid '+sc.sym+' '+sc.start);
  }else{
    const total=pick.starts.reduce((s,[a,b])=>s+b-a+1,0);
    let r=Math.floor(Math.random()*total);
    for(const [a,b] of pick.starts){const n=b-a+1;if(r<n){t0=a+r;break;}r-=n;}
  }
  const cash0=pick.currency==='TWD'?1000000:100000;
  const k=data.r[t0]/data.c[t0],scl=arr=>arr.map(v=>v*k);
  G={scene:sceneIdx==null?null:sceneIdx,meta:pick,d:{...data,o:scl(data.o),h:scl(data.h),l:scl(data.l),c:scl(data.c)},t0,day:1,cash0,cash:cash0,shares:0,trades:[],marks:[],ma20:null,ma60:null,ended:false};
  G.ma20=movingAverage(G.d.c,20);G.ma60=movingAverage(G.d.c,60);
  stopAuto();
  $('start').hidden=true;$('levels').hidden=true;$('result').hidden=true;$('game').hidden=false;
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
  const you=equity()/G.cash0-1,opp=opponents(i0,i1),hold=opp[0].ret;
  $('game').hidden=true;$('result').hidden=false;
  $('rName').textContent=`${G.meta.name}（${G.meta.symbol}）`;
  $('rRange').textContent=`真實日期：${d.d[i0]} 至 ${d.d[i1]}（${G.day} 個交易日）`;
  $('rYou').textContent=pct(you);$('rHold').textContent=pct(hold);
  tint($('rYou'),you);tint($('rHold'),hold);
  renderRank(you,opp);
  const sc=G.scene==null?null:SCENES[G.scene];
  $('rScene').hidden=!sc;
  if(sc){$('rSceneTitle').textContent=sc.title;$('rSceneText').textContent=sc.text;
    if(you>hold+5e-5)markWon(G.scene);}
  $('nextLevelBtn').hidden=!(sc&&G.scene<SCENES.length-1);
  $('backLevelsBtn').hidden=!sc;
  $('againBtn').hidden=!!sc;
  $('rTrades').textContent=G.trades.length;
  $('rEquity').textContent=`${money(equity(),cur)}（起始 ${money(G.cash0,cur)}）`;
  try{
    const best=parseFloat(localStorage.getItem('stockStarterBest'));
    if(!(best>=you))localStorage.setItem('stockStarterBest',String(you));
  }catch(e){}
  window.scrollTo(0,0);
}

/* 電腦對手：同一段價格、同一個天數，整股、收盤成交、無手續費 */
function opponents(i0,i1){
  const c=G.d.c,m=G.ma20,cash0=G.cash0,n=i1-i0+1;
  const fin=(cash,sh)=>(cash+sh*c[i1])/cash0-1;
  let q=Math.floor(cash0/c[i0]);
  const hold=fin(cash0-q*c[i0],q);
  let cash=cash0,sh=0;
  for(let i=i0;i<=i1;i++){
    if(c[i]>m[i]&&sh===0){sh=Math.floor(cash/c[i]);cash-=sh*c[i];}
    else if(c[i]<m[i]&&sh>0){cash+=sh*c[i];sh=0;}
  }
  const ma=fin(cash,sh);
  const part=cash0/12;cash=cash0;sh=0;
  for(let day=1;day<=n;day+=5){const p=c[i0+day-1],k=Math.floor(part/p);sh+=k;cash-=k*p;}
  const dca=fin(cash,sh);
  return [
    {key:'hold',name:'買了放著',ret:hold,rule:'第 1 天收盤用全部現金買進，抱到最後一天。'},
    {key:'ma',name:'均線派',ret:ma,rule:'收盤站上 20 日均線就全買，跌破 20 日均線就全賣。'},
    {key:'dca',name:'定期定額',ret:dca,rule:'現金分成 12 份，每 5 個交易日買一份（第 1、6、11…56 天），沒輪到的留現金。'}
  ];
}
function renderRank(you,opp){
  const all=[{key:'me',name:'你',ret:you},...opp].sort((a,b)=>b.ret-a.ret||(a.key==='me'?-1:0));
  const mx=Math.max(...all.map(e=>Math.abs(e.ret)),1e-9),ol=$('rRank');ol.textContent='';
  all.forEach((e,i)=>{
    const li=document.createElement('li');if(e.key==='me')li.className='me';
    const top=document.createElement('div');top.className='top';
    const l=document.createElement('span'),rk=document.createElement('i');rk.textContent=i+1;
    l.appendChild(rk);l.appendChild(document.createTextNode(e.name));
    const v=document.createElement('b');v.textContent=pct(e.ret);tint(v,Math.abs(e.ret)<5e-5?0:e.ret);
    top.appendChild(l);top.appendChild(v);li.appendChild(top);
    const bar=document.createElement('div');bar.className='bar';
    const em=document.createElement('em'),w=Math.abs(e.ret)/mx*50;
    em.className=e.ret>=0?'up':'down';em.style.width=w+'%';em.style[e.ret>=0?'left':'right']='50%';
    bar.appendChild(em);li.appendChild(bar);
    if(e.rule){const r=document.createElement('div');r.className='rule';r.textContent=e.rule;li.appendChild(r);}
    ol.appendChild(li);
  });
  const eq=5e-5,better=opp.filter(o=>o.ret>you+eq),tie=opp.filter(o=>Math.abs(o.ret-you)<=eq),worse=opp.filter(o=>o.ret<you-eq);
  const names=a=>a.map(o=>o.name).join('、').replace(/、([^、]*)$/,'和$1');
  let t=`你排第 ${better.length+1} 名`;
  if(worse.length===opp.length)t='你排第 1 名，贏過全部三位電腦對手。';
  else if(better.length===opp.length)t='你排第 4 名，三位電腦對手都比你賺得多。';
  else{if(worse.length)t+=`，贏過${names(worse)}`;if(tie.length)t+=`${worse.length?'，':'，'}跟${names(tie)}打平`;t+='。';}
  $('rVerdict').textContent=t;
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
$('sceneBtn').addEventListener('click',showLevels);
$('levelsBack').addEventListener('click',showStart);
$('backLevelsBtn').addEventListener('click',showLevels);
$('nextLevelBtn').addEventListener('click',()=>{if(G&&G.scene!=null&&G.scene<SCENES.length-1)newGame(G.scene+1).catch(fail);});
$('chart').addEventListener('pointermove',pointer);
$('chart').addEventListener('pointerdown',pointer);
$('chart').addEventListener('pointerleave',()=>{hover=null;if(G)drawChart();});
window.addEventListener('resize',()=>{if(G&&!$('game').hidden)drawChart();});
function fail(e){console.error(e);$('best').textContent='資料載入失敗，請重新整理。';}

loadJSON('data/catalog.json').then(c=>{catalog=c;$('startBtn').disabled=false;$('sceneBtn').disabled=false;
  const sq=parseInt(new URLSearchParams(location.search).get('scene'),10); // 僅供測試
  if(sq>=1&&sq<=SCENES.length)return newGame(sq-1);
}).catch(fail);
$('startBtn').disabled=true;$('sceneBtn').disabled=true;
showBest();
window.__stock={get g(){return G;}}; // 僅供測試讀取
})();
