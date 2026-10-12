'use strict';
const frEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FRUI={
  tab:'overview',busy:false,message:'',confirmReset:false,marketPage:0,
  button(a,v,label,disabled=false,cls='ss-btn'){ return `<button class="${cls}" data-f="${a}" data-v="${v}" ${disabled?'disabled':''}>${label}</button>`; },
  teamGrid(){ const team=this.newTeam||'DET'; return `<div class="ss-grid">${TEAMS.slice().sort((a,b)=>a.zh.localeCompare(b.zh,'zh-Hant')).map(t=>`<button data-f="pick" data-v="${t.abbr}" class="${t.abbr===team?'on':''}" style="--tc:${t.colors[0]}">${t.abbr}<small>${t.zh}</small></button>`).join('')}</div>`; },
  html(){
    const s=FRANCHISE.st;
    if(!s) return `<div class="ss-pane fr-pane"><div class="fr-hero"><div><span class="fr-eyebrow">FRANCHISE MODE</span><h2>打造你的冠軍球團</h2><p>從第一張打序，到下一座冠軍獎盃。</p></div><span class="fr-emblem">GM</span></div><div class="fr-features"><div><b>掌握陣容</b><span>打序、板凳、先發輪值與牛棚</span></div><div><b>經營球團</b><span>薪資、主場收入、交易與設施</span></div><div><b>培養主力</b><span>訓練成果帶入每一場實際比賽</span></div></div><div class="ss-h2">選擇球團</div>${this.teamGrid()}<div class="ss-row"><span>每季場數</span>${[10,30,162].map(n=>this.button('games',n,n+' 場',false,'ss-seg'+(n===(this.newGames||30)?' on':''))).join('')}</div><p class="ss-sub">季賽、球團經營各有獨立存檔。經營模式可跨季延續名單、資金與養成。金額使用遊戲球團幣；賽程由遊戲產生。</p>${this.button('start','', '接任總經理　▶',false,'go ss-go')}</div>`;
    LEAGUE_CTX=FRANCHISE.context;
    const S=FRANCHISE.season,st=S.st,T=S.team(st.user),r=st.rec[st.user];
    const nav=[['overview','球團總覽'],['roster','陣容編成'],['market','交易市場'],['training','球員養成'],['finance','財務設施'],['league','賽程・成績']];
    let h=`<div class="ss-pane fr-pane"><div class="fr-hero" style="--club:${T.colors[0]}"><div><span class="fr-eyebrow">${s.year} · FRANCHISE MODE</span><h2>${T.zh}<small>總經理辦公室</small></h2><p>${r.w} 勝 ${r.l} 敗　${st.phase==='regular'?`例行賽 ${st.day}／${st.games}`:st.phase==='playoffs'?'季後賽爭冠':'休賽季'}</p></div><span class="fr-emblem">${T.abbr}</span></div><nav class="fr-nav" aria-label="球團經營">${nav.map(([k,n])=>this.button('tab',k,n,false,this.tab===k?'on':'')).join('')}</nav>`;
    if(!FRANCHISE.saveOK) h+='<div class="fr-notice" role="alert">瀏覽器無法保存進度；關閉頁面後可能遺失目前球團。</div>';
    if(this.message) h+=`<div class="fr-notice" role="status">${frEsc(this.message)}</div>`;
    if(this.busy) h+='<div class="fr-progress" id="frProgress" role="status">正在模擬比賽……</div>';
    h+=this.tab==='roster'?this.roster():this.tab==='market'?this.market():this.tab==='training'?this.training():this.tab==='finance'?this.finance():this.tab==='league'?this.league():this.overview();
    return h+`<div class="fr-footer"><span>自動保存於此瀏覽器・${s.year} 球季</span>${this.button('reset','',this.confirmReset?'再按一次刪除這個球團':'重開球團',false,'ss-mini')}</div></div>`;
  },
  overview(){
    const F=FRANCHISE,s=F.st,S=F.season,st=S.st,r=st.rec[st.user],payroll=F.payroll(),next=S.userGame();
    let h=`<div class="fr-kpis"><div><span>可用資金</span><b class="${s.cash<0?'fr-red':''}">${frMoney(s.cash)}</b><small>百萬球團幣</small></div><div><span>年度薪資</span><b>${frMoney(payroll)}</b><small>每場按季賽場數攤提</small></div><div><span>球迷支持</span><b>${Math.round(s.fans)}<em>／100</em></b><small>勝場與主場收入互相影響</small></div><div><span>本季戰績</span><b>${r.w}<em>–</em>${r.l}</b><small>${r.gp?(r.w/r.gp*100).toFixed(1):'0.0'}% 勝率</small></div></div>`;
    if(s.cash<0) h+='<div class="fr-notice">球團目前虧損，仍可繼續比賽；交易與付費訓練需先有足夠資金。休賽季可獲得年度注資。</div>';
    if(st.phase==='done') h+=`<div class="ss-champ">${SSUI.chip(st.po.champ)} ${TEAM(st.po.champ).zh} 奪得世界大賽冠軍</div><div class="fr-card"><h3>下一季，繼續打造球團</h3><p>保留陣容、養成、設施與資金。排名和本季成績歸零，收到 40.0 M 年度注資。</p>${this.button('nextYear','', '進入 '+(s.year+1)+' 球季',false,'go ss-go')}</div>`;
    else if(next){ const opponent=next.away===st.user?next.home:next.away,userSP=next.away===st.user?next.spA:next.spH,oppSP=next.away===st.user?next.spH:next.spA;
      h+=`<div class="fr-next"><div><span class="fr-eyebrow">NEXT GAME</span><h3>${next.label}</h3><div class="fr-match">${SSUI.chip(st.user)}<strong>${TEAM(st.user).zh}</strong><em>VS</em>${SSUI.chip(opponent)}<strong>${TEAM(opponent).zh}</strong></div><p>${next.home===st.user?'主場':'客場'}・${frEsc(TEAM(next.home).venue)}</p><div class="fr-sp"><div><span>我方先發</span><b>${frEsc(nameOf(userSP))}</b><small>${pit(userSP).kmh} km/h · 控球 ${grade(pit(userSP).control)}</small></div><div><span>對手先發</span><b>${frEsc(nameOf(oppSP))}</b><small>${pit(oppSP).hand==='L'?'左投':'右投'} · ${pit(oppSP).kmh} km/h</small></div></div></div><div class="fr-play">${this.button('play','','親自出賽　▶',false,'go ss-go')}${this.button('sim1','','模擬這場')}${st.phase==='regular'?this.button('sim7','','模擬 7 場')+this.button('simall','','模擬到季末'):''}</div></div>`;
    }
    h+=`<div class="fr-two"><div class="fr-card"><h3>總經理待辦</h3><div class="fr-todo"><b>${F.deadline()?'交易窗口已關閉':'交易窗口開放中'}</b><span>${st.phase==='regular'?`第 ${Math.floor(st.games*.7)} 場完成後截止；季後重新開放`:st.phase==='playoffs'?'季後賽交易已停止，季末重新開放':'休賽季可交易與升級設施'}</span>${this.button('tab','market','查看交易市場')}</div><div class="fr-todo"><b>輪值與養成</b><span>可調整打序、替換先發，並安排每 7 場一次的個人訓練。</span>${this.button('tab','roster','編成陣容')}${this.button('tab','training','安排訓練')}</div></div><div class="fr-card"><h3>球團動態</h3><div class="fr-news">${s.news.slice(0,7).map(n=>`<p>${frEsc(n)}</p>`).join('')}</div></div></div>`;
    return h;
  },
  skills(id){
    const P=PLAYERS[id],d=FRANCHISE.st.dev[id]||{}; let h='';
    if(P.h){ const b=bat(id); h+=`打 ${grade(b.meet)}・力 ${grade(b.power)}・速 ${grade(b.speed)}`; }
    if(frIsPitcher(id)){ const p=pit(id); h+=`${h?' ／ ':''}${p.kmh} km/h・控 ${grade(p.control)}・體 ${grade(p.stamina)}`; }
    const n=Object.values(d).reduce((a,b)=>a+b,0); return h+(n?` <span class="fr-boost">養成 +${n}</span>`:'');
  },
  playerName(id){ return `<b>${frEsc(nameOf(id))}</b><small>${frEsc(PLAYERS[id].full)} · ${FR_POS[PLAYERS[id].pos]||PLAYERS[id].pos}</small>`; },
  roster(){
    const S=FRANCHISE.season,T=S.team(S.st.user);
    let h=`<div class="ss-h2">先發打序</div><p class="ss-sub">上下移動調整打序；球員守位跟著保留。板凳球員可換進符合的守位；手機可左右滑動表格。</p><div class="fr-table"><table class="ss-tb fr-roster"><thead><tr><th>打序</th><th>球員</th><th>能力</th><th>編成</th></tr></thead><tbody>${T.lineup.map((l,i)=>`<tr><td><strong>${i+1}</strong><small>${FR_POS[l.pos]||l.pos}</small></td><td>${this.playerName(l.id)}</td><td>${this.skills(l.id)}</td><td><div class="fr-order">${this.button('order',i+':-1','↑',i===0,'fr-arrow')}${this.button('order',i+':1','↓',i===8,'fr-arrow')}</div></td></tr>`).join('')}</tbody></table></div>`;
    h+=`<div class="ss-h2">板凳</div><div class="fr-player-grid">${T.bench.filter(id=>PLAYERS[id]?.h).map(id=>{ const slots=T.lineup.map((l,i)=>({l,i})).filter(({l})=>frCanPlay(id,l.pos)); return `<div class="fr-player">${this.playerName(id)}<p>${this.skills(id)}</p><div class="fr-inline"><select aria-label="${frEsc(nameOf(id))}替換守位" data-fc="bench:${id}">${slots.map(({l,i})=>`<option value="${i}" ${this.benchSlots?.[id]===i?'selected':''}>第 ${i+1} 棒・${FR_POS[l.pos]||l.pos}</option>`).join('')}</select>${this.button('promote',id,'換入先發',!slots.length)}</div></div>`; }).join('')}</div>`;
    for(const group of ['rotation','bullpen']){ const list=T[group]; h+=`<div class="ss-h2">${group==='rotation'?'先發輪值':'牛棚順序'}</div><p class="ss-sub">${group==='rotation'?'輪值依順序循環；標記的是下場先發。':'第一位為終結者；其他人依體力與局勢上場。'}</p><div class="fr-table"><table class="ss-tb fr-roster"><tr><th>順序</th><th>投手</th><th>能力</th><th>編成</th></tr>${list.map((id,i)=>`<tr class="${group==='rotation'&&id===S.nextSP(T.abbr)?'me':''}"><td>${i+1}${group==='rotation'&&id===S.nextSP(T.abbr)?'<small>下場先發</small>':''}</td><td>${this.playerName(id)}</td><td>${this.skills(id)}</td><td><div class="fr-order">${this.button('pitchOrder',group+':'+i+':-1','↑',i===0,'fr-arrow')}${this.button('pitchOrder',group+':'+i+':1','↓',i===list.length-1,'fr-arrow')}</div></td></tr>`).join('')}</table></div>`; }
    return h;
  },
  market(){
    const F=FRANCHISE,S=F.season,T=S.team(S.st.user),offers=frIDs(T).filter(id=>F.tradable(T,id));
    if(!offers.includes(this.offer)) this.offer=T.bench.find(id=>offers.includes(id))||offers[0];
    const offer=this.offer;
    let h=`<div class="ss-h2">交易市場</div><p class="ss-sub">交換同類型球員並支付補償金。年薪依遊戲初始能力估值，所有交易與金額只用於本模式。二刀流球員暫不開放交易。</p>`;
    if(F.deadline()) return h+'<div class="fr-notice">交易截止日已過，球季結束後重新開放。</div>';
    h+=`<div class="fr-budget">可用資金 <b>${frMoney(F.st.cash)}</b>　年度薪資 ${frMoney(F.payroll())}</div>`;
    h+=`<div class="fr-filters"><label>送出的球員<select data-fc="offer">${offers.map(id=>`<option value="${id}" ${id===offer?'selected':''}>${frEsc(nameOf(id))} · ${F.role(T,id)==='rotation'?'先發投手':F.role(T,id)==='bullpen'?'牛棚':FR_POS[PLAYERS[id].pos]||PLAYERS[id].pos} · ${frMoney(frSalary(id))}</option>`).join('')}</select></label><label>交易球團<select data-fc="marketTeam"><option value="">所有球團</option>${TEAMS.filter(t=>t.abbr!==T.abbr).map(t=>`<option value="${t.abbr}" ${this.marketTeam===t.abbr?'selected':''}>${t.zh} ${t.abbr}</option>`).join('')}</select></label></div><div class="fr-offer">我方送出：${this.playerName(offer)}<p>${this.skills(offer)}　年薪 ${frMoney(frSalary(offer))}</p></div>`;
    if(this.pending){ const q=F.quote(offer,this.pending.id,this.pending.abbr); if(q.error) this.pending=null; else h+=`<div class="fr-confirm" role="region" aria-label="交易確認"><h3>確認這筆交易</h3><p>${frEsc(nameOf(offer))} ＋ ${frMoney(q.fee)} 補償金 → ${frEsc(nameOf(q.target))}</p><p>交易後可用資金 ${frMoney(F.st.cash-q.fee)}；年度薪資 ${frMoney(F.payroll()+q.payroll)}。</p>${this.button('trade','','確認交易',F.st.cash<q.fee)}${this.button('cancelTrade','','取消')}</div>`; }
    const pool=TEAMS.filter(t=>t.abbr!==T.abbr&&(!this.marketTeam||t.abbr===this.marketTeam)).flatMap(t=>frIDs(F.team(t.abbr)).map(id=>({id,abbr:t.abbr,q:F.quote(offer,id,t.abbr)}))).filter(x=>!x.q.error).sort((a,b)=>frRating(b.id)-frRating(a.id)||a.id-b.id);
    const pages=Math.max(1,Math.ceil(pool.length/8)); this.marketPage=clamp(this.marketPage,0,pages-1);
    h+=`<div class="fr-player-grid">${pool.slice(this.marketPage*8,this.marketPage*8+8).map(({id,abbr,q})=>`<div class="fr-player"><div class="fr-player-top">${SSUI.chip(abbr)}<span>估值 ${frRating(id)}</span></div>${this.playerName(id)}<p>${this.skills(id)}</p><div class="fr-price"><span>年薪 ${frMoney(frSalary(id))}</span><b>補償金 ${frMoney(q.fee)}</b></div>${this.button('quote',abbr+':'+id,'檢視交易',F.st.cash<q.fee)}</div>`).join('')||'<p class="ss-sub">沒有符合守位與球員類型的人選。請換一位我方球員。</p>'}</div><div class="fr-pages">${this.button('marketPage',this.marketPage-1,'上一頁',this.marketPage===0,'ss-seg')}<small>${this.marketPage+1}／${pages}</small>${this.button('marketPage',this.marketPage+1,'下一頁',this.marketPage===pages-1,'ss-seg')}</div>`;
    return h;
  },
  training(){
    const F=FRANCHISE,S=F.season,T=S.team(S.st.user),ids=frIDs(T); if(!ids.includes(this.trainee)) this.trainee=ids[0];
    const id=this.trainee,P=PLAYERS[id],dev=F.st.dev[id]||{};
    let h=`<div class="ss-h2">球員養成</div><p class="ss-sub">每位球員每 7 場可訓練一次；單項養成上限 +12。提升會持續到往後的球季，並反映在實際比賽與模擬中。球速養成每 +1 代表 +0.15 mph。</p><label class="fr-select-label">選擇球員<select data-fc="trainee">${ids.map(x=>`<option value="${x}" ${x===id?'selected':''}>${frEsc(nameOf(x))} · ${FR_POS[PLAYERS[x].pos]||PLAYERS[x].pos}</option>`).join('')}</select></label><div class="fr-offer">${this.playerName(id)}<p>${this.skills(id)}</p></div><div class="fr-training-grid">`;
    const hitter=T.lineup.some(l=>l.id===id)||T.bench.includes(id),pitcher=T.rotation.includes(id)||T.bullpen.includes(id);
    const skills=(hitter&&P.h?['meet','power','speed']:[]).concat(pitcher&&P.p?['control','stamina','velo']:[]);
    for(const k of skills){ const q=F.training(id,k),raw=frBase(['control','stamina','velo'].includes(k)?'pit':'bat',id),profile=['control','stamina','velo'].includes(k)?pit(id):bat(id),val=k==='velo'?profile.kmh:profile[k],base=k==='velo'?raw.kmh:raw[k];
      h+=`<div class="fr-training"><span>${FR_SKILLS[k]}</span><strong>${val}<small>${k==='velo'?'km/h':'／100'}</small></strong><p>初始 ${base} · 養成 +${dev[k]||0}</p><div class="fr-meter"><i style="width:${(dev[k]||0)/12*100}%"></i></div>${this.button('train',k,q.error?'目前不可訓練':`訓練 +${q.gain} · ${frMoney(q.cost)}`,!!q.error||F.st.cash<q.cost)}<small>${q.error?frEsc(q.error):'訓練完成後立即生效'}</small></div>`;
    }
    return h+'</div>';
  },
  finance(){
    const F=FRANCHISE,s=F.st,st=F.season.st;
    let h=`<div class="ss-h2">球團財務</div><p class="ss-sub">M 為百萬球團幣；薪資、交易金與收入都是遊戲設定。短球季按 162 場比例折算收支。球員訓練不改變原始合約年薪。</p><div class="fr-kpis"><div><span>可用資金</span><b class="${s.cash<0?'fr-red':''}">${frMoney(s.cash)}</b></div><div><span>本季收入</span><b>${frMoney(s.income)}</b></div><div><span>本季支出</span><b>${frMoney(s.expenses)}</b></div><div><span>剩餘例行賽薪資</span><b>${frMoney(F.payroll()*Math.max(0,st.games-st.day)/st.games)}</b></div></div><div class="fr-two">`;
    for(const k of ['stadium','training']){ const n=s.facilities[k],cost=(k==='stadium'?8:6)*(n+1); h+=`<div class="fr-card"><span class="fr-eyebrow">${k==='stadium'?'BALLPARK':'DEVELOPMENT'}</span><h3>${k==='stadium'?'球場營運設施':'訓練中心'} <small>Lv.${n}／3</small></h3><p>${k==='stadium'?'每級增加主場門票與商品收入；升級效果從下一場開始。':'每級降低個人訓練費用；Lv.3 的單次養成提升至 +3。'}</p>${this.button('upgrade',k,n===3?'已達最高等級':'升級 · '+frMoney(cost),n===3||s.cash<cost)}</div>`; }
    h+=`</div><div class="ss-h2">收支明細</div><div class="fr-table"><table class="ss-tb"><tr><th>時間</th><th>項目</th><th>金額</th></tr>${s.ledger.slice(0,30).map(l=>`<tr><td>${l.year}・第 ${l.day} 場</td><td>${frEsc(l.label)}</td><td class="${l.amount<0?'fr-red':'fr-green'}">${l.amount>=0?'+':''}${frMoney(l.amount)}</td></tr>`).join('')||'<tr><td colspan="3">出賽或安排球團工作後，這裡會列出收支。</td></tr>'}</table></div>`;
    return h;
  },
  league(){
    const S=FRANCHISE.season,st=S.st,s=FRANCHISE.st,T=S.team(st.user),post=this.statView==='po',stats=post?S.playoffStats():st.stats;
    let h=st.po?SSUI.bracketHTML(S):''; h+=SSUI.scheduleHTML(S)+`<div class="ss-cols"><div>${SSUI.standHTML(S)}</div><div>${SSUI.leadersHTML(S)}</div></div>`;
    h+=`<div class="fr-pages">${this.button('statsView','reg','例行賽成績',false,'ss-seg'+(!post?' on':''))}${st.po?this.button('statsView','po','季後賽成績',false,'ss-seg'+(post?' on':'')):''}</div><div class="ss-h2">我方${post?'季後賽':'例行賽'}打擊成績</div><div class="fr-table"><table class="ss-tb"><tr><th>球員</th><th>打數</th><th>安打</th><th>全壘打</th><th>打點</th><th>打擊率</th></tr>${T.lineup.map(l=>l.id).concat(T.bench).filter(id=>stats[id]?.pa).map(id=>{ const p=stats[id];return `<tr><td>${frEsc(nameOf(id))}</td><td>${p.ab}</td><td>${p.h}</td><td>${p.hr}</td><td>${p.rbi}</td><td>${fmtAvg(p.h,p.ab)}</td></tr>`; }).join('')||'<tr><td colspan="6">球季尚未開打。</td></tr>'}</table></div>`;
    h+=`<div class="ss-h2">我方${post?'季後賽':'例行賽'}投球成績</div><div class="fr-table"><table class="ss-tb"><tr><th>球員</th><th>局數</th><th>勝</th><th>敗</th><th>三振</th><th>防禦率</th></tr>${T.rotation.concat(T.bullpen).filter(id=>stats[id]?.bf).map(id=>{ const p=stats[id];return `<tr><td>${frEsc(nameOf(id))}</td><td>${Math.floor(p.outs/3)}.${p.outs%3}</td><td>${p.w}</td><td>${p.l}</td><td>${p.pk}</td><td>${fmtEra(p.er,p.outs)}</td></tr>`; }).join('')||'<tr><td colspan="6">球季尚未開打。</td></tr>'}</table></div>`;
    if(s.history.length) h+=`<div class="ss-h2">球團歷史</div><div class="fr-table"><table class="ss-tb"><tr><th>球季</th><th>戰績</th><th>季後賽</th><th>冠軍</th></tr>${s.history.slice().reverse().map(r=>`<tr><td>${r.year}</td><td>${r.w}–${r.l}</td><td>${r.qualified?'晉級':'未晉級'}</td><td>${TEAM(r.champ).zh}</td></tr>`).join('')}</table></div>`;
    return h;
  },
  change(k,v){
    if(this.busy) return;
    if(k.startsWith('bench:')){ this.benchSlots=this.benchSlots||{}; this.benchSlots[+k.split(':')[1]]=+v; return; }
    if(k==='offer'){ this.offer=+v; this.pending=null; this.marketPage=0; }
    if(k==='marketTeam'){ this.marketTeam=v; this.pending=null; this.marketPage=0; }
    if(k==='trainee') this.trainee=+v;
    SSUI.render();
  },
  async act(a,v){
    if(this.busy) return; this.message=''; const F=FRANCHISE,S=F.season;
    if(a==='pick') this.newTeam=v;
    else if(a==='games') this.newGames=+v;
    else if(a==='start'){ F.start(this.newTeam||'DET',this.newGames||30); this.tab='overview'; this.schedulePage=null; }
    else if(a==='tab'){ this.tab=v; this.pending=null; document.querySelector('#intro .tcard').scrollTop=0; }
    else if(a==='schedule') this.schedulePage=+v;
    else if(a==='statsView') this.statView=v;
    else if(a==='marketPage') this.marketPage=+v;
    else if(a==='quote'){ const [abbr,id]=v.split(':'); this.pending={abbr,id:+id}; }
    else if(a==='cancelTrade') this.pending=null;
    else if(a==='trade'){ if(this.pending){ this.message=F.trade(this.offer,this.pending.id,this.pending.abbr)||'交易完成，名單已更新。'; this.pending=null; this.offer=null; } }
    else if(a==='order'){ const [i,d]=v.split(':').map(Number); F.moveLineup(i,d); }
    else if(a==='pitchOrder'){ const [k,i,d]=v.split(':'); F.movePitcher(k,+i,+d); }
    else if(a==='promote'){ const id=+v,T=S.team(S.st.user),slots=T.lineup.map((l,i)=>({l,i})).filter(({l})=>frCanPlay(id,l.pos)); this.message=F.promote(id,this.benchSlots?.[id]??slots[0]?.i)||'先發名單已更新。'; }
    else if(a==='train') this.message=F.train(this.trainee,v)||'訓練完成，下場比賽立即使用養成後能力。';
    else if(a==='upgrade') this.message=F.upgrade(v)||'設施升級完成。';
    else if(a==='nextYear'){ this.message=F.nextYear(); this.schedulePage=null; this.tab='overview'; }
    else if(a==='reset'){
      if(!this.confirmReset){ this.confirmReset=true; SSUI.render(); setTimeout(()=>{ this.confirmReset=false; if(SSUI.tab==='franchise') SSUI.render(); },4000); return; }
      F.clear(); LEAGUE_CTX=null; this.confirmReset=false; this.offer=null; this.trainee=null; this.tab='overview';
    } else if(a==='play'){
      const u=S.userGame(); if(!u) return; document.getElementById('intro').classList.add('hide'); startGame(u.away,u.home,S.st.user,u.spA,u.spH,{campaign:S,franchise:true}); return;
    } else if(['sim1','sim7','simall'].includes(a)){
      this.busy=true; SSUI.render();
      try{ await new Promise(r=>setTimeout(r,30));
        if(a==='sim1') S.simUserGame();
        else await S.simDays(a==='sim7'?7:S.st.games-S.st.day,(i,n)=>{ const p=document.getElementById('frProgress'); if(p) p.textContent=`正在模擬……${i}／${n} 場`; });
      }catch(e){ this.message=e.message; }finally{ this.busy=false; LEAGUE_CTX=F.context; }
    }
    SSUI.render();
    if(a==='quote') document.querySelector('.fr-confirm')?.scrollIntoView({block:'center',behavior:'smooth'});
    if(a==='start'||a==='nextYear') document.querySelector('#intro .tcard').scrollTop=0;
  }
};
