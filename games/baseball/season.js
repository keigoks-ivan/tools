'use strict';
/* =========================================================
   球季模式、紀錄、成就（存在 localStorage，讀寫失敗也照樣能玩）
   - 玩家隊伍的比賽：用完整引擎（親自打或「模擬這場」）
   - 其他球隊的比賽：快速模擬 quickPA（不算物理，用真實數據的機率），速度快約 20 倍
   ========================================================= */
const SS_DIV={AL東區:['NYY','BOS','TOR','TB','BAL'],AL中區:['CLE','MIN','KC','DET','CWS'],AL西區:['HOU','SEA','TEX','LAA','ATH'],
  NL東區:['ATL','PHI','NYM','MIA','WSH'],NL中區:['MIL','CHC','STL','CIN','PIT'],NL西區:['LAD','SD','SF','AZ','COL']};
const SS_LEAGUE=abbr=>Object.keys(SS_DIV).find(d=>SS_DIV[d].includes(abbr)).slice(0,2);
const ssStore={
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); return true; }catch(e){ return false; } }
};

/* ---------- 快速模擬：一個打席 ---------- */
// log5：打者與投手各自的機率，相對聯盟平均合成（Bill James 公式）
const log5=(b,p,lg)=>{ const x=b*p/lg, y=(1-b)*(1-p)/(1-lg); return x/(x+y); };
const QLG={k:.225,bb:.085,hr:.030,babip:.291};
const QCACHE={};
function qBat(id){
  if(QCACHE['b'+id]) return leagueProfile('quickBatter',{id,...QCACHE['b'+id]});
  const h=(PLAYERS[id]||{}).h||{pa:0}, n=h.pa||0, R=(v,lg)=>reg(v,n,lg,150);
  const ab=Math.max(1,n-(h.bb||0)), H=(h.avg||0)*ab, TB=(h.slg||0)*ab, hr=h.hr||0;
  const xb=Math.max(0,TB-H-3*hr), bip=Math.max(1,ab-(h.k||0)-hr);
  const r={k:R(n?h.k/n:null,QLG.k), bb:R(n?h.bb/n:null,QLG.bb), hr:R(n?hr/n:null,QLG.hr),
    babip:R(n?Math.max(0,H-hr)/bip:null,QLG.babip), xbr:n?clamp(xb/Math.max(1,H-hr)/1.15,0.05,0.5):0.2};
  QCACHE['b'+id]=r; return leagueProfile('quickBatter',{id,...r});
}
function qPit(id){
  if(QCACHE['p'+id]) return leagueProfile('quickPitcher',{id,...QCACHE['p'+id]});
  const s=(PLAYERS[id]||{}).p||{bf:0}, n=s.bf||0, R=(v,lg)=>reg(v,n,lg,150), era=parseFloat(s.era)||LG.era;
  const r={k:R(n?s.k/n:null,QLG.k), bb:R(n?s.bb/n:null,QLG.bb), hr:R(n?s.hr/n:null,QLG.hr),
    babip:QLG.babip*clamp(Math.pow(reg(era,(s.outs||0)/3,LG.era,40)/LG.era,0.35),0.85,1.15)};
  QCACHE['p'+id]=r; return leagueProfile('quickPitcher',{id,...r});
}
function quickPA(g){
  const b=qBat(curBatter(g)), p=qPit(curPitcher(g)), f=fielding(g);
  f.pc[f.pitcher]=(f.pc[f.pitcher]||0)+Math.round(3.4+Math.random()*1.4);
  const k=log5(b.k,p.k,QLG.k)*0.93, bb=log5(b.bb,p.bb,QLG.bb), hr=log5(b.hr,p.hr,QLG.hr)*1.2, r=Math.random();   // 0.93、1.2：對齊完整引擎的聯盟平均
  if(r<k) return {kind:'K',text:'三振'};
  if(r<k+bb) return {kind:'BB',text:'四壞球保送'};
  if(r<k+bb+hr) return {kind:'HR',text:'全壘打',dist:380+Math.random()*60};
  const phi=rnd(-40,40);
  if(Math.random()<log5(b.babip,p.babip,QLG.babip)*1.05){
    const x=Math.random();
    if(x<b.xbr*0.12) return {kind:'3B',text:'三壘安打',phi};
    if(x<b.xbr) return {kind:'2B',text:'二壘安打',phi};
    return {kind:'1B',text:'安打',phi,ground:Math.random()<0.45};
  }
  if(Math.random()<0.46) return {kind:'OUT',text:'滾地球出局',ground:true,t:rnd(1.2,2.6),fielder:{k:['SS','2B','3B','1B'][(Math.random()*4)|0],inf:true}};
  return {kind:'OUT',text:'飛球出局',air:true,dist:rnd(120,390),phi};
}
// 快速模擬一場（含電腦戰術）。回傳比賽物件（pbp 可累計個人成績）
function quickGame(away,home,spA,spH,campaign){
  const g=newGame(away,home,null,spA,spH,campaign?.context()); g.campaign=campaign; g.postseason=campaign?.st.phase==='playoffs'; restPen(g);
  let guard=0;
  while(!g.over && guard++<400){
    maybeChangePitcher(g);
    const bt=batting(g), c=cpuOffense(g);
    if(c&&c.type==='steal'){ if(doSteal(g,c.from)) continue; }
    if(c&&c.type==='bunt'){ const r=buntPlay(g,c.kind); applyResult(g,r.res,r.pre); continue; }
    const d=cpuDefense(g); if(d&&d.type==='ibb'){ applyResult(g,{kind:'BB',text:'故意四壞',ibb:true}); continue; }
    if(d&&d.type==='def') CUR_CTX.def=d.def;
    applyResult(g,quickPA(g));
  }
  return g;
}
// 完整引擎模擬一場（玩家隊伍「模擬這場」用）
function fullSimGame(away,home,spA,spH,campaign){
  const g=newGame(away,home,null,spA,spH,campaign?.context()); g.campaign=campaign; g.postseason=campaign?.st.phase==='playoffs'; restPen(g); let guard=0;
  while(!g.over && guard++<400){ maybeChangePitcher(g); const r=simTacticPA(g,null); if(r.tactic==='steal') continue; applyResult(g,r.res,r.pre); }
  return g;
}

// 牛棚休息：球季中前一天投過的中繼，今天不排（先放進 usedPen）
function restPen(g){
  const st=g.campaign?.st; if(!st||!st.lastP) return;
  for(const t of [g.away,g.home]){ const day=st.pitchGames?.[t.abbr]??st.day; t.usedPen=t.T.bullpen.filter(id=>st.lastP[id]===day-1); }
}
/* ---------- 成績累計 ---------- */
const STAT0=()=>({g:0,pa:0,ab:0,h:0,d:0,t:0,hr:0,rbi:0,bb:0,k:0,sb:0,cs:0,bf:0,outs:0,er:0,pk:0,pbb:0,ph:0,phr:0,w:0,l:0,gp:0});
function addGameStats(stats,g){
  const S=id=>stats[id]||(stats[id]=STAT0()), seenB=new Set(), seenP=new Set();
  for(const e of g.pbp){
    if(e.steal){ const s=S(e.batter); if(e.kind==='SB') s.sb++; else s.cs++; const p=S(e.pitcher); p.outs+=e.outs||0; continue; }
    const s=S(e.batter), p=S(e.pitcher), k=e.kind; seenB.add(e.batter); seenP.add(e.pitcher);
    s.pa++; p.bf++; s.rbi+=e.rbi||0; p.er+=e.runs||0; p.outs+=e.outs||0;
    if(k==='BB'){ s.bb++; p.pbb++; continue; }
    if(k==='OUT' && /犧牲/.test(e.text)) continue;
    s.ab++;
    if(k==='K'){ s.k++; p.pk++; }
    if(['1B','2B','3B','HR'].includes(k)){ s.h++; p.ph++; if(k==='2B') s.d++; if(k==='3B') s.t++; if(k==='HR'){ s.hr++; p.phr++; } }
  }
  seenB.forEach(id=>S(id).g++); seenP.forEach(id=>S(id).gp++);
  if(g.wp && g.lp){ S(g.wp).w++; S(g.lp).l++; }
}
const fmtAvg=(h,ab)=>ab?(h/ab).toFixed(3).replace(/^0/,''):'.000';
const fmtEra=(er,outs)=>outs?(er*27/outs).toFixed(2):'-.--';
function campaignStats(g,id){
  const S=g.campaign,st=S?.st; if(!st) return null;
  const source=g.postseason&&st.format===12?st.poStats:st.stats, base=source?.[id]||STAT0();
  if(g.campaignRecorded) return base;
  const current={}; addGameStats(current,g); const p=current[id]||STAT0();
  return Object.fromEntries(Object.keys(base).map(k=>[k,base[k]+(p[k]||0)]));
}

// 遊戲賽程：輪轉配對、三連戰、第二循環主客互換；存檔後不重抽。
function seasonCalendar(games,year=2026){
  const clubs=TEAMS.map(t=>t.abbr).sort(), ring=clubs.slice();
  const shift=(year-2026)%29; for(let n=0;n<shift;n++) ring.splice(1,0,ring.pop());
  const rounds=[];
  for(let r=0;r<29;r++){
    const pairs=[];
    for(let i=0;i<15;i++){ const a=ring[i],b=ring[29-i]; pairs.push((i===0?r:i)%2?[a,b]:[b,a]); }
    rounds.push(pairs); ring.splice(1,0,ring.pop());
  }
  return Array.from({length:games},(_,d)=>{ const series=Math.floor(d/3), reverse=Math.floor(series/29)%2;
    return rounds[series%29].map(p=>reverse?[p[1],p[0]]:p.slice()); });
}
function seriesMatch(s,format){
  const n=s.wins[0]+s.wins[1]; let high=n%2===0;
  if(format===12) high=s.round===0|| (s.bestOf===7?[0,1,5,6]:s.bestOf===5?[0,1,4]:[0,2]).includes(n);
  return {away:s.teams[high?1:0],home:s.teams[high?0:1]};
}

/* =========================================================
   球季
   ========================================================= */
const SEASON={
  KEY:'pawa_season_v1', st:null,
  load(){ this.st=ssStore.get(this.KEY,null); if(this.st&&(!TEAM(this.st.user)||!this.st.rec||!this.st.stats)) this.st=null; return this.st; },
  save(){ if(this.st) this.saveOK=ssStore.set(this.KEY,this.st); return this.saveOK; },
  context(){ return null; },
  team(abbr){ return TEAM(abbr); },
  playoffStats(){ return this.st.format===12?(this.st.poStats||(this.st.poStats={})):this.st.stats; },
  clear(){ this.st=null; try{ localStorage.removeItem(this.KEY); }catch(e){} },
  start(user,games,year=2026){
    const rec={}; TEAMS.forEach(t=>rec[t.abbr]={w:0,l:0,rs:0,ra:0,gp:0});
    this.st={v:2,user,games,year,format:12,calendar:seasonCalendar(games,year),results:[],pitchGames:{},day:0,rec,stats:{},poStats:{},log:[],phase:'regular',po:null,rot:{},userWins:0,userGames:0,streak:0};
    this.save(); return this.st;
  },
  // 舊存檔沿用原本每天的配對，新球季讀取已保存的三連戰。
  pairings(day){
    if(this.st.calendar) return this.st.calendar[day]||[];
    const ab=TEAMS.map(t=>t.abbr); let s=(day+1)*2654435761%4294967296;
    const rnd2=()=>((s=(s*1664525+1013904223)%4294967296)/4294967296);
    for(let i=ab.length-1;i>0;i--){ const j=Math.floor(rnd2()*(i+1)); [ab[i],ab[j]]=[ab[j],ab[i]]; }
    const out=[]; for(let i=0;i<ab.length;i+=2) out.push(rnd2()<0.5?[ab[i],ab[i+1]]:[ab[i+1],ab[i]]);
    return out;
  },
  nextSP(abbr){ const T=this.team(abbr), i=this.st.rot[abbr]||0; return T.rotation[i%T.rotation.length]; },
  bumpRot(abbr){ this.st.rot[abbr]=(this.st.rot[abbr]||0)+1; },
  userGame(){
    const st=this.st; if(!st) return null;
    if(st.phase==='regular'){ if(st.day>=st.games) return null; const p=this.pairings(st.day).find(x=>x.includes(st.user)); return {away:p[0],home:p[1],spA:this.nextSP(p[0]),spH:this.nextSP(p[1]),label:`例行賽第 ${st.day+1} 場`}; }
    if(st.phase==='playoffs'){ const s=this.curSeries(); if(!s||!s.teams.includes(st.user)) return null;
      const n=s.wins[0]+s.wins[1], {away,home}=seriesMatch(s,st.format);
      return {away,home,spA:this.nextSP(away),spH:this.nextSP(home),label:`${s.name}　第 ${n+1} 戰（${s.bestOf} 戰 ${Math.ceil(s.bestOf/2)} 勝）`}; }
    return null;
  },
  record(g,away,home){
    const st=this.st, a=g.away.runs, h=g.home.runs, ra=st.rec[away], rh=st.rec[home];
    this.markPitchers(g);
    ra.rs+=a; ra.ra+=h; rh.rs+=h; rh.ra+=a; ra.gp++; rh.gp++;
    if(a>h){ ra.w++; rh.l++; } else { rh.w++; ra.l++; }
    addGameStats(st.stats,g); this.bumpRot(away); this.bumpRot(home);
  },
  markPitchers(g){
    const st=this.st; st.lastP=st.lastP||{}; st.pitchGames=st.pitchGames||{};
    for(const t of [g.away,g.home]){ const n=st.pitchGames[t.abbr]??st.rec[t.abbr].gp;
      for(const e of g.pbp) if(e.team!==t.abbr) st.lastP[e.pitcher]=n;
      st.pitchGames[t.abbr]=n+1;
    }
  },
  // 玩家隊伍的比賽結束（親自打或模擬）：記錄、模擬同一天其他比賽、推進
  finishUserGame(g,played){
    if(g.campaignRecorded||!g.over) return null;
    g.campaignRecorded=true;
    const st=this.st, away=g.away.abbr, home=g.home.abbr, won=(g.away.runs>g.home.runs)===(away===st.user);
    const phase=st.phase, day=st.day, label=this.userGame()?.label||'季後賽';
    st.results=st.results||[]; st.results.push({day,phase,label,away,home,a:g.away.runs,h:g.home.runs,played});
    if(st.phase==='regular'){
      this.record(g,away,home);
      for(const [a2,h2] of this.pairings(st.day)){ if(a2===away&&h2===home) continue; const q=quickGame(a2,h2,this.nextSP(a2),this.nextSP(h2),this); this.record(q,a2,h2); }
      st.day++;
    } else if(st.phase==='playoffs'){ addGameStats(this.playoffStats(),g); this.markPitchers(g); this.bumpRot(away); this.bumpRot(home); this.seriesResult(g.away.runs>g.home.runs?away:home); }
    st.userGames++; if(won){ st.userWins++; st.streak=Math.max(1,st.streak+1); } else st.streak=Math.min(-1,st.streak-1);
    st.log.unshift(`${phase==='regular'?'例行賽':'季後賽'}｜${TEAM(away).zh} ${g.away.runs}：${g.home.runs} ${TEAM(home).zh}${played?'':'（模擬）'}`);
    st.log=st.log.slice(0,40);
    if(st.phase==='regular' && st.day>=st.games) this.startPlayoffs();
    if(this.onResult) this.onResult(g,won,{day,phase});
    this.save(); ACH.onSeasonGame(won,this);
    return won;
  },
  simUserGame(){ const u=this.userGame(); if(!u) return null; const g=fullSimGame(u.away,u.home,u.spA,u.spH,this); if(!g.over) throw new Error('比賽尚未結束，沒有更新球季。請重新模擬這場。'); this.finishUserGame(g,false); return g; },
  // 模擬好幾天（非同步，避免卡住畫面）
  async simDays(n,onProgress){
    for(let i=0;i<n && this.st.phase==='regular' && this.userGame();i++){ this.simUserGame(); if(onProgress) onProgress(i+1,n); await new Promise(r=>setTimeout(r,0)); }
  },
  standings(){
    const st=this.st, out={};
    for(const [d,teams] of Object.entries(SS_DIV)){
      const rows=teams.map(a=>({a,...st.rec[a]})).sort((x,y)=>(y.w-y.l)-(x.w-x.l)||y.w-x.w);
      const lead=rows[0]; rows.forEach(r=>r.gb=((lead.w-r.w)+(r.l-lead.l))/2); out[d]=rows;
    }
    return out;
  },
  /* ---------- 季後賽：每聯盟戰績前三名，第一種子輪空 ---------- */
  startPlayoffs(){
    const st=this.st, seeds={};
    if(st.format===12){
      const rank=(a,b)=>{ const x=st.rec[a],y=st.rec[b]; return y.w-x.w||(y.rs-y.ra)-(x.rs-x.ra)||a.localeCompare(b); };
      for(const L of ['AL','NL']){
        const winners=Object.entries(SS_DIV).filter(([d])=>d.startsWith(L)).map(([,t])=>t.slice().sort(rank)[0]).sort(rank);
        const wild=TEAMS.map(t=>t.abbr).filter(a=>SS_LEAGUE(a)===L&&!winners.includes(a)).sort(rank).slice(0,3);
        seeds[L]=winners.concat(wild);
      }
      const bo=st.games>=162?[3,5,7,7]:st.games>=30?[3,3,5,5]:[1,1,3,3];
      st.phase='playoffs'; st.po={seeds,bo,round:0,series:[],done:[],champ:null};
      for(const L of ['AL','NL']) for(const [i,j,slot] of [[2,5,1],[3,4,0]]) st.po.series.push({name:`${L==='AL'?'美':'國'}聯外卡戰`,teams:[seeds[L][i],seeds[L][j]],wins:[0,0],bestOf:bo[0],L,slot,round:0});
      ACH.check('playoffs',seeds.AL.concat(seeds.NL).includes(st.user)); this.advancePlayoffs(); return;
    }
    for(const L of ['AL','NL']){
      seeds[L]=TEAMS.map(t=>t.abbr).filter(a=>SS_LEAGUE(a)===L).sort((x,y)=>{const a=st.rec[x],b=st.rec[y]; return (b.w/(b.w+b.l||1))-(a.w/(a.w+a.l||1))||b.rs-b.ra-(a.rs-a.ra);}).slice(0,3);
    }
    const bo=st.games>=162?[5,7,7]:st.games>=30?[3,5,5]:[1,3,3];
    st.phase='playoffs';
    st.po={seeds,bo,round:0,series:[
      {name:'美聯外卡戰',teams:[seeds.AL[1],seeds.AL[2]],wins:[0,0],bestOf:bo[0],L:'AL'},
      {name:'國聯外卡戰',teams:[seeds.NL[1],seeds.NL[2]],wins:[0,0],bestOf:bo[0],L:'NL'}],done:[],champ:null};
    ACH.check('playoffs',seeds.AL.concat(seeds.NL).includes(st.user));
    this.advancePlayoffs();
  },
  curSeries(){ const po=this.st.po; if(!po) return null; return po.series.find(s=>!s.winner&&s.teams.includes(this.st.user))||po.series.find(s=>!s.winner); },
  seriesResult(winner){
    const s=this.curSeries(); if(!s) return; s.wins[s.teams.indexOf(winner)]++;
    if(Math.max(...s.wins)>=Math.ceil(s.bestOf/2)) s.winner=s.teams[s.wins[0]>s.wins[1]?0:1];
    this.advancePlayoffs();
  },
  // 把不含玩家的系列賽快速打完，必要時排下一輪
  advancePlayoffs(){
    const st=this.st, po=st.po; let guard=0;
    while(guard++<50){
      const open=po.series.filter(s=>!s.winner);
      const cpu=open.find(s=>!s.teams.includes(st.user));
      if(cpu){ while(!cpu.winner){ const {away,home}=seriesMatch(cpu,st.format);
          const q=quickGame(away,home,this.nextSP(away),this.nextSP(home),this); addGameStats(this.playoffStats(),q); this.markPitchers(q); this.bumpRot(away); this.bumpRot(home);
          const w=q.away.runs>q.home.runs?away:home; cpu.wins[cpu.teams.indexOf(w)]++; if(Math.max(...cpu.wins)>=Math.ceil(cpu.bestOf/2)) cpu.winner=cpu.teams[cpu.wins[0]>cpu.wins[1]?0:1]; }
        continue; }
      if(open.length) return;   // 剩玩家的系列賽，等玩家打
      if(st.format===12){
        if(po.round===3){ po.champ=po.series[0].winner; po.done.push(...po.series); po.series=[]; st.phase='done'; ACH.check('champ',po.champ===st.user); return; }
        const old=po.series; po.done.push(...old); po.round++;
        const make=(name,teams,L,slot)=>({name,teams,wins:[0,0],bestOf:po.bo[po.round],L,slot,round:po.round});
        const higher=(teams,L)=>teams.slice().sort((a,b)=>po.seeds[L].indexOf(a)-po.seeds[L].indexOf(b));
        if(po.round===1) po.series=['AL','NL'].flatMap(L=>[0,1].map(slot=>make(`${L==='AL'?'美':'國'}聯分區賽`,[po.seeds[L][slot],old.find(s=>s.L===L&&s.slot===slot).winner],L,slot)));
        else if(po.round===2) po.series=['AL','NL'].map(L=>make(`${L==='AL'?'美':'國'}聯冠軍賽`,higher(old.filter(s=>s.L===L).map(s=>s.winner),L),L,0));
        else { const teams=old.map(s=>s.winner).sort((a,b)=>st.rec[b].w-st.rec[a].w||(st.rec[b].rs-st.rec[b].ra)-(st.rec[a].rs-st.rec[a].ra)); po.series=[make('世界大賽',teams,'WS',0)]; }
        continue;
      }
      // 這一輪全部結束 → 排下一輪
      const W=L=>po.series.find(s=>s.L===L).winner;
      if(po.round===2){ po.champ=po.series[0].winner; po.done.push(...po.series); po.series=[]; st.phase='done'; ACH.check('champ',po.champ===st.user); return; }
      po.done.push(...po.series);
      if(po.round===0){ po.round=1; po.series=['AL','NL'].map(L=>({name:L==='AL'?'美聯冠軍賽':'國聯冠軍賽',teams:[po.seeds[L][0],W(L)],wins:[0,0],bestOf:po.bo[1],L})); continue; }
      if(po.round===1){ po.round=2; po.series=[{name:'世界大賽',teams:[W('AL'),W('NL')],wins:[0,0],bestOf:po.bo[2],L:'WS'}]; continue; }
    }
  },
  leaders(){
    const st=this.st, tg=Math.max(1,Math.max(...Object.values(st.rec).map(r=>r.gp))), list=Object.entries(st.stats);
    const nm=id=>`${nameOf(id)}<small>${(TEAMS.map(t=>this.team(t.abbr)).find(t=>t.lineup.some(l=>l.id==id)||t.rotation.includes(+id)||t.bullpen.includes(+id)||t.bench.includes(+id))||{}).abbr||''}</small>`;
    const top=(f,fmt,filter,asc)=>list.filter(([id,s])=>filter(s)).sort((a,b)=>asc?f(a[1])-f(b[1]):f(b[1])-f(a[1])).slice(0,5).map(([id,s])=>({n:nm(id),v:fmt(s)}));
    const qPA=s=>s.pa>=Math.max(15,tg*3.1), qIP=s=>s.outs>=Math.max(15,tg*3);   // 規定打席 3.1／場、規定投球局數 1／場（大聯盟規定）
    return {
      '打擊率':top(s=>s.h/s.ab,s=>fmtAvg(s.h,s.ab),qPA), '全壘打':top(s=>s.hr,s=>s.hr,s=>s.hr>0), '打點':top(s=>s.rbi,s=>s.rbi,s=>s.rbi>0), '盜壘':top(s=>s.sb,s=>s.sb,s=>s.sb>0),
      '防禦率':top(s=>s.er*27/s.outs,s=>fmtEra(s.er,s.outs),qIP,true), '三振':top(s=>s.pk,s=>s.pk,s=>s.pk>0), '勝投':top(s=>s.w,s=>s.w,s=>s.w>0)};
  }
};

/* =========================================================
   個人紀錄（你親自操作的打席）與成就
   ========================================================= */
const ME={
  KEY:'pawa_me_v1', d:null,
  get(){ return this.d||(this.d=ssStore.get(this.KEY,{bat:{pa:0,ab:0,h:0,hr:0,rbi:0,bb:0,k:0},pit:{bf:0,outs:0,k:0,bb:0,h:0,hr:0,r:0},games:0,wins:0,tactics:0,cutins:0,beaten:[]})); },
  save(){ ssStore.set(this.KEY,this.d); },
  pa(res,pre,userBat,pitchedByUser){
    const d=this.get(), k=res.kind, hit=['1B','2B','3B','HR'].includes(k), runs=pre?pre.runs:0;
    if(userBat){ const b=d.bat; b.pa++; if(k!=='BB'&&!res.sac) b.ab++; if(hit) b.h++; if(k==='HR') b.hr++; if(k==='BB') b.bb++; if(k==='K') b.k++; b.rbi+=runs; }
    if(pitchedByUser){ const p=d.pit; p.bf++; if(k==='K'){ p.k++; p.outs++; } else if(k==='OUT') p.outs+=Math.max(1,pre?pre.outs:1); if(k==='BB') p.bb++; if(hit) p.h++; if(k==='HR') p.hr++; p.r+=runs; }
    this.save();
  }
};
const ACH_LIST=[
  ['firstGame','首次出賽','打完第一場比賽'],['firstWin','初勝','贏得第一場比賽'],['firstHR','第一支全壘打','你打擊時擊出全壘打'],
  ['grandSlam','滿貫砲','你打擊時擊出滿貫全壘打'],['walkoff','再見英雄','你打擊時擊出再見安打'],['k10','三振秀','單場你投出 10 次三振'],
  ['shutout','完封','你守備的整場比賽對手沒得分'],['threeHits','猛打賞','單場你親自打出 3 支安打'],['streak3','三連勝','連贏 3 場'],
  ['streak5','五連勝','連贏 5 場'],['comeback','大逆轉','落後 4 分以上逆轉勝'],['extraWin','延長賽勝利','打到延長並獲勝'],
  ['steal','盜壘成功','用戰術選單下令盜壘並成功'],['sacBunt','犧牲觸擊','用戰術選單下令犧牲觸擊並成功'],['tactician','戰術大師','單場用 3 次戰術'],
  ['season10','完成球季','打完一整個球季的例行賽'],['playoffs','季後賽門票','球隊打進季後賽'],['champ','世界冠軍','贏得世界大賽'],
  ['cutin10','能力發動','看到 10 次特殊能力或關鍵時刻特寫'],['tenTeams','征服十隊','擊敗 10 支不同的球隊']
];
const ACH={
  KEY:'pawa_ach_v1', d:null, game:null,
  get(){ return this.d||(this.d=ssStore.get(this.KEY,{})); },
  unlock(k){
    const d=this.get(); if(d[k]) return; d[k]=new Date().toISOString().slice(0,10); ssStore.set(this.KEY,d);
    const a=ACH_LIST.find(x=>x[0]===k); if(!a) return;
    const msg=`成就解鎖：${a[1]}`;
    if(typeof FX!=='undefined'&&FX.banner) FX.banner(msg,'#ffd23a'); else ssToast(msg);
  },
  check(k,cond){ if(cond) this.unlock(k); },
  newGame(g){ this.game={uK:0,uH:0,tactics:0,maxDeficit:0}; },
  onPA(g,res,pre,userBat,pitchedByUser,bases){
    const s=this.game||(this.newGame(g),this.game), k=res.kind;
    if(userBat){ if(k==='HR'){ this.unlock('firstHR'); if(bases&&bases.filter(Boolean).length===3) this.unlock('grandSlam'); }
      if(['1B','2B','3B','HR'].includes(k) && ++s.uH>=3) this.unlock('threeHits');
      if(g.over && g.half==='bottom' && g.home.abbr===g.user) this.unlock('walkoff'); }
    if(pitchedByUser && k==='K' && ++s.uK>=10) this.unlock('k10');
    const u=g.away.abbr===g.user?g.away:g.home, o=u===g.away?g.home:g.away; s.maxDeficit=Math.max(s.maxDeficit,o.runs-u.runs);
  },
  onTactic(kind,ok){ const s=this.game||(this.game={uK:0,uH:0,tactics:0,maxDeficit:0}); const me=ME.get(); me.tactics++; ME.save();
    if(++s.tactics>=3) this.unlock('tactician'); if(kind==='steal'&&ok) this.unlock('steal'); if(kind==='sac'&&ok) this.unlock('sacBunt'); },
  onCutin(){ const me=ME.get(); me.cutins=(me.cutins||0)+1; ME.save(); if(me.cutins>=10) this.unlock('cutin10'); },
  onGameEnd(g){
    if(!g.user) return; const s=this.game||{maxDeficit:0}, u=g.away.abbr===g.user?g.away:g.home, o=u===g.away?g.home:g.away, won=u.runs>o.runs;
    const me=ME.get(); me.games++; if(won){ me.wins++; if(!me.beaten.includes(o.abbr)) me.beaten.push(o.abbr); } ME.save();
    this.unlock('firstGame'); if(won) this.unlock('firstWin');
    if(won && o.runs===0 && g.inning>=9) this.unlock('shutout');
    if(won && s.maxDeficit>=4) this.unlock('comeback');
    if(won && g.inning>9) this.unlock('extraWin');
    if(me.beaten.length>=10) this.unlock('tenTeams');
    this.game=null;
  },
  onSeasonGame(won,S){ const st=S.st; if(st.streak>=3) this.unlock('streak3'); if(st.streak>=5) this.unlock('streak5'); if(st.day>=st.games) this.unlock('season10'); }
};
function ssToast(msg){
  if(typeof document==='undefined') return;
  const el=document.createElement('div'); el.className='ss-toast'; el.textContent=msg; document.body.appendChild(el);
  setTimeout(()=>el.classList.add('show'),20); setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),400); },2600);
}
if(typeof module!=='undefined') module.exports={SEASON,quickGame,fullSimGame,addGameStats,ACH,ME};

/* =========================================================
   畫面：選隊畫面上方的分頁（單場比賽／球季模式／紀錄／成就）
   ========================================================= */
const SSUI={
  inited:false, tab:'single', simming:false, confirmReset:false,
  init(){
    if(this.inited||typeof document==='undefined') return; this.inited=true;
    SEASON.load();
    if(typeof FRANCHISE!=='undefined') FRANCHISE.load();
    const card=document.querySelector('#intro .tcard'), logo=card.querySelector('.logo');
    const tabs=document.createElement('div'); tabs.className='ss-tabs'; tabs.id='ssTabs';
    tabs.innerHTML=[['single','單場比賽'],['season','季賽模式'],['franchise','球團經營'],['records','紀錄'],['ach','成就']].map(([k,n])=>`<button data-k="${k}">${n}</button>`).join('');
    logo.after(tabs);
    const root=document.createElement('div'); root.id='ssRoot'; root.className='ss-root'; tabs.after(root);
    tabs.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) this.show(b.dataset.k); });
    root.addEventListener('click',e=>{ const f=e.target.closest('[data-f]'); if(f){ FRUI.act(f.dataset.f,f.dataset.v); return; } const b=e.target.closest('[data-a]'); if(b) this.act(b.dataset.a,b.dataset.v); });
    root.addEventListener('change',e=>{ if(e.target.dataset.fc) FRUI.change(e.target.dataset.fc,e.target.value); });
    const last=ssStore.get('pawa_menu_mode',null);
    this.show(last==='franchise'&&FRANCHISE.st?'franchise':SEASON.st&&SEASON.st.phase!=='done'?'season':'single');
  },
  show(k){
    if(this.simming||typeof FRUI!=='undefined'&&FRUI.busy) return;
    LEAGUE_CTX=k==='franchise'&&FRANCHISE.st?FRANCHISE.context:null;
    ssStore.set('pawa_menu_mode',k);
    this.tab=k; const card=document.querySelector('#intro .tcard');
    card.classList.toggle('ss-mode',k!=='single');
    document.querySelectorAll('#ssTabs button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
    this.render();
    card.scrollTop=0;
  },
  render(){
    const root=document.getElementById('ssRoot'); if(!root) return;
    if(this.tab==='single'){ root.innerHTML=''; return; }
    root.innerHTML=this.tab==='franchise'?FRUI.html():this.tab==='season'?this.seasonHTML():this.tab==='records'?this.recordsHTML():this.achHTML();
    const busy=this.simming||typeof FRUI!=='undefined'&&FRUI.busy; root.setAttribute('aria-busy',String(busy));
    if(busy) root.querySelectorAll('button,select').forEach(e=>e.disabled=true);
  },
  chip(a){ const T=TEAM(a); return `<span class="ss-chip" style="background:${T.colors[0]};color:${T.colors[1]==='#000000'?'#fff':T.colors[1]}">${a}</span>`; },
  seasonHTML(){
    const st=SEASON.st;
    if(!st){
      const sel=this.newTeam||'DET', n=this.newGames||30;
      return `<div class="ss-pane"><div class="ss-h">開一個新球季</div>
        <div class="ss-sub">從 30 隊選一隊，親自比賽或交給電腦模擬。新球季採三連戰賽程，各聯盟三支分區冠軍與三支外卡晉級季後賽。</div>
        <div class="ss-grid">${TEAMS.slice().sort((a,b)=>a.zh.localeCompare(b.zh,'zh-Hant')).map(t=>`<button data-a="pick" data-v="${t.abbr}" class="${t.abbr===sel?'on':''}" style="--tc:${t.colors[0]}">${t.abbr}<small>${t.zh}</small></button>`).join('')}</div>
        <div class="ss-row"><span>場數</span>${[10,30,162].map(x=>`<button data-a="games" data-v="${x}" class="ss-seg${x===n?' on':''}">${x} 場</button>`).join('')}</div>
        <button class="go ss-go" data-a="start">開始球季</button></div>`;
    }
    const u=st.user, r=st.rec[u], next=SEASON.userGame();
    let h=`<div class="ss-pane"><div class="ss-top">${this.chip(u)}<b>${TEAM(u).zh}</b><span class="ss-wl">${r.w} 勝 ${r.l} 敗</span>
      <span class="ss-ph">${st.phase==='regular'?`例行賽 ${st.day}／${st.games} 場`:st.phase==='playoffs'?'季後賽':'球季結束'}</span>
      <button class="ss-mini" data-a="reset">${this.confirmReset?'再按一次確認放棄':'放棄球季'}</button></div>`;
    if(SEASON.saveOK===false) h+='<div class="fr-notice">瀏覽器無法保存進度；目前仍可遊玩，關閉頁面後可能遺失。</div>';
    if(this.error) h+=`<div class="fr-notice" role="alert">${this.error}</div>`;
    if(st.phase==='done'){ const c=st.po.champ; h+=`<div class="ss-champ">${this.chip(c)}<b>${TEAM(c).zh}</b> 贏得世界大賽${c===u?'，你是冠軍！':''}</div><button class="go ss-go" data-a="restart">開新球季</button>`; }
    else if(next){
      const sp=(id)=>`${nameOf(id)}<small>${pit(id).hand==='L'?'左投':'右投'}・防禦率 ${PLAYERS[id]?.p?.era||'-.--'}</small>${abTags(pit(id).ab)}`;
      h+=`<div class="ss-next"><div class="ss-nl">${next.label}</div>
        <div class="ss-mu"><div>${this.chip(next.away)}<b>${TEAM(next.away).zh}</b><div class="ss-sp">${sp(next.spA)}</div></div><em>@</em><div>${this.chip(next.home)}<b>${TEAM(next.home).zh}</b><div class="ss-sp">${sp(next.spH)}</div></div></div>
        <div class="ss-btns"><button class="go ss-go" data-a="play">開打</button><button class="ss-btn" data-a="sim1">模擬這場</button>
        ${st.phase==='regular'?`<button class="ss-btn" data-a="sim7">模擬 7 場</button><button class="ss-btn" data-a="simall">模擬到季末</button>`:''}</div>
        ${this.simming?'<div class="ss-prog" id="ssProg">模擬中……</div>':''}</div>`;
    } else if(st.phase==='playoffs'){ h+=`<div class="ss-next"><div class="ss-nl">你的球隊這一輪沒有比賽（或已被淘汰）。</div><button class="ss-btn" data-a="poall">模擬到季後賽結束</button></div>`; }
    if(st.po) h+=this.bracketHTML();
    h+=this.scheduleHTML(SEASON);
    h+=`<div class="ss-cols"><div>${this.standHTML()}</div><div>${this.leadersHTML()}<div class="ss-log"><div class="ss-h2">最近比賽</div>${st.log.slice(0,8).map(x=>`<div>${x}</div>`).join('')||'<div>還沒有比賽。</div>'}</div></div></div></div>`;
    return h;
  },
  standHTML(campaign=SEASON){
    const S=campaign.standings(), u=campaign.st.user;
    return `<div class="ss-h2">排名</div>`+Object.entries(S).map(([d,rows])=>`<table class="ss-tb"><tr><th>${d}</th><th>勝</th><th>敗</th><th>勝率</th><th>勝差</th></tr>${rows.map(r=>`<tr class="${r.a===u?'me':''}"><td>${this.chip(r.a)} ${TEAM(r.a).zh}</td><td>${r.w}</td><td>${r.l}</td><td>${(r.w+r.l?r.w/(r.w+r.l):0).toFixed(3).replace(/^0/,'')}</td><td>${r.gb?r.gb.toFixed(1):'—'}</td></tr>`).join('')}</table>`).join('');
  },
  leadersHTML(campaign=SEASON){
    const L=campaign.leaders();
    return `<div class="ss-h2">例行賽個人排行</div><div class="ss-lead">${Object.entries(L).map(([k,v])=>`<div class="ss-lb"><div class="ss-lt">${k}</div>${v.map((x,i)=>`<div><span>${i+1}</span>${x.n}<b>${x.v}</b></div>`).join('')||'<div>—</div>'}</div>`).join('')}</div>`;
  },
  bracketHTML(campaign=SEASON){
    const po=campaign.st.po, all=po.done.concat(po.series);
    return `<div class="ss-h2">季後賽</div><div class="ss-br">${all.map(s=>`<div class="ss-sr${s.winner?' fin':''}"><div class="ss-sn">${s.name}<small>${s.bestOf} 戰 ${Math.ceil(s.bestOf/2)} 勝</small></div>${s.teams.map((t,i)=>`<div class="${s.winner===t?'w':''}">${this.chip(t)} ${TEAM(t).zh}<b>${s.wins[i]}</b></div>`).join('')}</div>`).join('')}</div>`;
  },
  scheduleHTML(campaign=SEASON){
    const st=campaign.st, start=Math.min(Math.max(0,st.day-3),Math.max(0,st.games-10));
    const page=campaign===SEASON?(this.schedulePage??Math.floor(start/10)):FRUI.schedulePage??Math.floor(start/10);
    const from=clamp(page*10,0,Math.floor((st.games-1)/10)*10), prefix=campaign===SEASON?'data-a="schedule"':'data-f="schedule"';
    const results=st.results||[];
    return `<div class="ss-h2">賽程與結果 <small>第 ${from+1}–${Math.min(from+10,st.games)} 場</small></div><div class="fr-table"><table class="ss-tb"><tr><th>場次</th><th>對手</th><th>主客場</th><th>結果</th></tr>${Array.from({length:Math.min(10,st.games-from)},(_,i)=>{ const d=from+i,p=campaign.pairings(d).find(x=>x.includes(st.user)),r=results.find(x=>x.phase==='regular'&&x.day===d); if(!p) return ''; const home=p[1]===st.user,opp=p[home?0:1],won=r&&(r.a>r.h)===(r.away===st.user); return `<tr class="${d===st.day?'me':''}"><td>${d+1}${d===st.day?'・下一場':''}</td><td>${this.chip(opp)} ${TEAM(opp).zh}</td><td>${home?'主場':'客場'}</td><td>${r?`${won?'勝':'敗'} ${home?r.h:r.a}：${home?r.a:r.h}`:d<st.day?'已完成':'待賽'}</td></tr>`; }).join('')}</table></div><div class="fr-pages"><button class="ss-seg" ${prefix} data-v="${page-1}" ${from===0?'disabled':''}>上一頁</button><button class="ss-seg" ${prefix} data-v="${page+1}" ${from+10>=st.games?'disabled':''}>下一頁</button><small>${st.calendar?'遊戲產生的三連戰賽程':'沿用舊存檔賽程'}・同戰績以淨得分排序</small></div>`;
  },
  recordsHTML(){
    const d=ME.get(), b=d.bat, p=d.pit;
    let h=`<div class="ss-pane"><div class="ss-h">你的紀錄<small>只算你親自操作的打席</small></div>
      <div class="ss-cards"><div class="ss-card"><div class="ss-ct">打擊</div><div class="ss-big">${fmtAvg(b.h,b.ab)}</div><div>${b.pa} 打席　${b.h} 安打　${b.hr} 全壘打　${b.rbi} 打點</div><div>${b.bb} 保送　${b.k} 三振</div></div>
      <div class="ss-card"><div class="ss-ct">投球</div><div class="ss-big">${fmtEra(p.r,p.outs)}</div><div>${(p.outs/3|0)}.${p.outs%3} 局　${p.k} 三振　${p.bb} 保送</div><div>被安打 ${p.h}　被全壘打 ${p.hr}</div></div>
      <div class="ss-card"><div class="ss-ct">比賽</div><div class="ss-big">${d.wins}–${d.games-d.wins}</div><div>${d.games} 場　擊敗過 ${d.beaten.length} 支球隊</div><div>用過 ${d.tactics||0} 次戰術</div></div></div>`;
    const st=SEASON.st;
    if(st){ const T=TEAM(st.user), ids=T.lineup.map(l=>l.id).concat(T.bench), ps=T.rotation.concat(T.bullpen), S=st.stats;
      h+=`<div class="ss-h2">${T.zh}本季成績</div><table class="ss-tb ss-wide"><tr><th>打者</th><th>出賽</th><th>打數</th><th>安打</th><th>全壘打</th><th>打點</th><th>盜壘</th><th>打擊率</th></tr>${ids.filter(id=>S[id]&&S[id].pa).map(id=>{const s=S[id];return `<tr><td>${nameOf(id)}</td><td>${s.g}</td><td>${s.ab}</td><td>${s.h}</td><td>${s.hr}</td><td>${s.rbi}</td><td>${s.sb}</td><td>${fmtAvg(s.h,s.ab)}</td></tr>`;}).join('')}</table>
      <table class="ss-tb ss-wide"><tr><th>投手</th><th>出賽</th><th>局數</th><th>勝</th><th>敗</th><th>三振</th><th>保送</th><th>防禦率</th></tr>${ps.filter(id=>S[id]&&S[id].bf).map(id=>{const s=S[id];return `<tr><td>${nameOf(id)}</td><td>${s.gp}</td><td>${(s.outs/3|0)}.${s.outs%3}</td><td>${s.w}</td><td>${s.l}</td><td>${s.pk}</td><td>${s.pbb}</td><td>${fmtEra(s.er,s.outs)}</td></tr>`;}).join('')}</table>`;
      h+=this.leadersHTML(); }
    else h+=`<div class="ss-sub">開始球季之後，這裡會列出球隊和全聯盟的成績排行。</div>`;
    return h+'</div>';
  },
  achHTML(){
    const d=ACH.get(), n=ACH_LIST.filter(a=>d[a[0]]).length;
    return `<div class="ss-pane"><div class="ss-h">成就<small>${n}／${ACH_LIST.length}</small></div><div class="ss-ach">${ACH_LIST.map(([k,name,desc])=>`<div class="${d[k]?'on':''}"><b>${d[k]?'★':'☆'} ${name}</b><span>${desc}</span>${d[k]?`<em>${d[k]}</em>`:''}</div>`).join('')}</div></div>`;
  },
  async act(a,v){
    if(this.simming) return;
    const st=SEASON.st;
    this.error='';
    if(a==='schedule'){ this.schedulePage=+v; return this.render(); }
    if(a==='pick'){ this.newTeam=v; return this.render(); }
    if(a==='games'){ this.newGames=+v; return this.render(); }
    if(a==='start'){ this.schedulePage=null; SEASON.start(this.newTeam||'DET',this.newGames||30); this.render(); document.querySelector('#intro .tcard').scrollTop=0; return; }
    if(a==='restart'){ SEASON.clear(); return this.render(); }
    if(a==='reset'){ if(!this.confirmReset){ this.confirmReset=true; this.render(); setTimeout(()=>{ this.confirmReset=false; this.render(); },3000); return; } this.confirmReset=false; SEASON.clear(); return this.render(); }
    if(a==='play'){ const u=SEASON.userGame(); if(!u) return; document.getElementById('intro').classList.add('hide'); startGame(u.away,u.home,st.user,u.spA,u.spH,{season:true}); return; }
    if(['sim1','sim7','simall','poall'].includes(a)){
      this.simming=true; this.render();
      try{ await new Promise(r=>setTimeout(r,30));
        if(a==='sim1') SEASON.simUserGame();
        else if(a==='poall'){ while(SEASON.st.phase==='playoffs'&&SEASON.userGame()){ SEASON.simUserGame(); await new Promise(r=>setTimeout(r,0)); } }
        else await SEASON.simDays(a==='sim7'?7:st.games-st.day,(i,nn)=>{ const el=document.getElementById('ssProg'); if(el) el.textContent=`模擬中……${i}／${nn}`; });
      }catch(e){ this.error=e.message; }finally{ this.simming=false; LEAGUE_CTX=null; this.render(); } return;
    }
  }
};
