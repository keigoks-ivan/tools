'use strict';
/* 球團存檔與 MLB 基礎資料分開；實戰和兩種模擬共用同一個名單／能力供應器。 */
const FR_POS={P:'投手',C:'捕手','1B':'一壘','2B':'二壘','3B':'三壘',SS:'游擊',LF:'左外野',CF:'中外野',RF:'右外野',DH:'指定打擊'};
const frMoney=n=>n.toFixed(1)+' M';
const frIDs=T=>[...new Set(T.lineup.map(l=>l.id).concat(T.bench,T.rotation,T.bullpen))];
const frIsPitcher=id=>!!PLAYERS[id]?.p&&(PLAYERS[id].pos==='P'||PLAYERS[id].p.gs>=5||PLAYERS[id].p.bf>=100);
function frBase(kind,id){ const prev=LEAGUE_CTX; LEAGUE_CTX=null; try{ return kind==='bat'?bat(id):pit(id); }finally{ LEAGUE_CTX=prev; } }
function frRating(id){
  const P=PLAYERS[id], b=P.h?frBase('bat',id):null, p=frIsPitcher(id)?frBase('pit',id):null;
  return Math.round(Math.max(b?b.meet*.42+b.power*.43+b.speed*.15:0,p?p.control*.45+p.stamina*.2+(p.kmh-105)*.35:0));
}
const frSalary=id=>Math.round((.5+Math.pow(Math.max(0,frRating(id)-25),2)/340)*10)/10;
const frCanPlay=(id,pos)=>!!PLAYERS[id]?.h&&(pos==='DH'||PLAYERS[id].pos===pos||['LF','CF','RF'].includes(pos)&&['LF','CF','RF'].includes(PLAYERS[id].pos));
const FRANCHISE={
  KEY:'pawa_franchise_v1',st:null,revision:0,cache:{},saveOK:true,
  load(){
    const s=ssStore.get(this.KEY,null);
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    const valid=s&&s.v===1&&seasonSaveValid(s.season)&&Number.isFinite(s.cash)&&Number.isFinite(s.fans)&&Number.isFinite(s.income)&&Number.isFinite(s.expenses)&&Number.isInteger(s.year)
      &&object(s.dev)&&Object.entries(s.dev).every(([id,d])=>PLAYERS[id]&&object(d)&&Object.entries(d).every(([k,n])=>FR_SKILLS[k]&&Number.isInteger(n)&&n>=0&&n<=12))
      &&object(s.trained)&&Object.values(s.trained).every(n=>Number.isInteger(n)&&n>=0)
      &&Array.isArray(s.ledger)&&s.ledger.every(l=>l&&Number.isFinite(l.amount)&&typeof l.label==='string')&&Array.isArray(s.news)&&s.news.every(n=>typeof n==='string')
      &&Array.isArray(s.history)&&s.history.every(h=>h&&TEAM(h.champ)&&Number.isInteger(h.year)&&Number.isFinite(h.w)&&Number.isFinite(h.l))
      &&['stadium','training'].every(k=>Number.isInteger(s.facilities?.[k])&&s.facilities[k]>=0&&s.facilities[k]<=3)
      &&TEAMS.every(t=>{ const c=s.clubs?.[t.abbr]; return c&&Array.isArray(c.lineup)&&c.lineup.length===9&&c.lineup.every(l=>l&&PLAYERS[l.id]&&FR_POS[l.pos])&&['bench','rotation','bullpen'].every(k=>Array.isArray(c[k])&&c[k].every(id=>PLAYERS[id]))&&c.rotation.length&&c.bullpen.length; });
    this.st=null; this.season.st=null; this.loadError=!!s&&!valid;
    if(valid){
      this.st=s; this.season.st=s.season; this.invalidate();
    }
    return this.st;
  },
  save(){ if(this.st){ this.st.season=this.season.st; this.saveOK=ssStore.set(this.KEY,this.st); } return this.saveOK; },
  clear(){ this.st=null; this.season.st=null; this.invalidate(); try{ localStorage.removeItem(this.KEY); }catch(e){} },
  start(user,games){
    this.loadError=false;
    const clubs={}; for(const t of TEAMS) clubs[t.abbr]={lineup:t.lineup.map(l=>({...l})),bench:t.bench.filter(id=>!t.lineup.some(l=>l.id===id)),rotation:t.rotation.slice(),bullpen:t.bullpen.filter(id=>!t.rotation.includes(id))};
    this.st={v:1,year:2026,season:null,clubs,dev:{},trained:{},cash:0,fans:50,facilities:{stadium:0,training:0},ledger:[],news:[],history:[],income:0,expenses:0};
    this.season.start(user,games,this.st.year); this.st.cash=Math.round(this.payroll()*.65+30); this.invalidate();
    this.news('接任 '+TEAM(user).zh+' 總經理。新球季開始。'); this.save(); return this.st;
  },
  team(abbr){ return {...TEAM(abbr),...this.st.clubs[abbr]}; },
  invalidate(){ this.revision++; this.cache={}; },
  payroll(){ const user=this.season.st?.user; return user?frIDs(this.team(user)).reduce((n,id)=>n+frSalary(id),0):0; },
  news(text){ this.st.news.unshift(text); this.st.news=this.st.news.slice(0,50); },
  ledger(label,amount){ this.st.cash=Math.round((this.st.cash+amount)*100)/100; if(amount>=0) this.st.income+=amount; else this.st.expenses-=amount;
    this.st.ledger.unshift({year:this.st.year,day:this.season.st.day,label,amount}); this.st.ledger=this.st.ledger.slice(0,100); },
  settle(g,won,meta){
    const s=this.st,S=this.season.st,scale=162/S.games,home=g.home.abbr===S.user,regular=meta.phase==='regular';
    if(regular){ this.ledger('本場薪資',-this.payroll()/S.games); this.ledger('贊助收入',(this.payroll()*.5+30)/S.games); }
    this.ledger(home?'主場營運':'客場差旅',-(home?.13:.10)*scale);
    if(home) this.ledger('門票與商品',(.6+s.fans*.008+s.facilities.stadium*.09)*scale*(regular?1:1.35));
    if(won) this.ledger('勝場獎金',.08*scale);
    s.fans=clamp(s.fans+(won?.8:-.5),15,100);
    this.news((won?'勝利｜':'敗戰｜')+g.away.T.zh+' '+g.away.runs+'：'+g.home.runs+' '+g.home.T.zh);
    if(S.phase==='done'&&!s.history.some(h=>h.year===s.year)){
      const champ=S.po.champ===S.user,qualified=S.po.seeds.AL.concat(S.po.seeds.NL).includes(S.user),r=S.rec[S.user];
      const bonus=champ?15:qualified?5:0; if(bonus) this.ledger(champ?'冠軍獎金':'季後賽獎金',bonus);
      s.history.push({year:s.year,w:r.w,l:r.l,champ:S.po.champ,cash:s.cash,qualified});
      this.news(champ?'世界冠軍！球團獲得 15.0 M 獎金。':'球季結束。可保留名單與養成進入下一季。');
    }
  },
  nextYear(){
    if(this.season.st.phase!=='done') return '必須先完成本季。';
    const {user,games}=this.season.st; this.st.year++; this.st.income=0; this.st.expenses=0; this.st.trained={};
    this.season.start(user,games,this.st.year); this.ledger('年度球團注資',40); this.news(this.st.year+' 球季開幕，收到 40.0 M 球團注資。'); this.save(); return '';
  },
  deadline(){ const S=this.season.st; return S.phase==='playoffs'||S.phase==='regular'&&S.day>=Math.floor(S.games*.7); },
  role(T,id){ if(T.rotation.includes(id)) return 'rotation'; if(T.bullpen.includes(id)) return 'bullpen'; return 'hitter'; },
  tradable(T,id){ return !(T.lineup.some(l=>l.id===id)&&(T.rotation.includes(id)||T.bullpen.includes(id))); },
  moveLineup(index,delta){
    const T=this.st.clubs[this.season.st.user],j=index+delta; if(index<0||index>=9||j<0||j>=9) return;
    [T.lineup[index],T.lineup[j]]=[T.lineup[j],T.lineup[index]]; this.save();
  },
  promote(id,index){
    const T=this.st.clubs[this.season.st.user],slot=T.lineup[index];
    if(!slot||!T.bench.includes(id)||!frCanPlay(id,slot.pos)) return '球員無法擔任這個守位。';
    const old=slot.id; slot.id=id; T.bench=T.bench.filter(x=>x!==id); if(!T.bench.includes(old)&&!T.lineup.some(l=>l.id===old)) T.bench.push(old);
    this.news(nameOf(id)+' 進入先發，'+nameOf(old)+' 回到板凳。'); this.save(); return '';
  },
  movePitcher(group,index,delta){
    if(!['rotation','bullpen'].includes(group)) return;
    const list=this.st.clubs[this.season.st.user][group],j=index+delta; if(index<0||index>=list.length||j<0||j>=list.length) return;
    [list[index],list[j]]=[list[j],list[index]]; this.save();
  },
  quote(offer,target,abbr){
    if(this.deadline()) return {error:'交易截止日已過。球季結束後重新開放。'};
    const u=this.season.st.user,A=this.team(u),B=TEAM(abbr)&&this.team(abbr);
    if(!B||abbr===u||!frIDs(A).includes(offer)||!frIDs(B).includes(target)||!this.tradable(A,offer)||!this.tradable(B,target)) return {error:'這筆交易的人選已改變。'};
    const role=this.role(A,offer); if(role!==this.role(B,target)) return {error:'請交換相同類型的球員。'};
    if(role==='hitter'){
      const a=A.lineup.find(l=>l.id===offer),b=B.lineup.find(l=>l.id===target);
      if(a&&!frCanPlay(target,a.pos)||b&&!frCanPlay(offer,b.pos)) return {error:'交易後必須保留原本的守位。'};
    }
    const fee=Math.round((.6+Math.max(0,frSalary(target)-frSalary(offer))*1.8)*10)/10;
    return {fee,payroll:frSalary(target)-frSalary(offer),offer,target,abbr};
  },
  trade(offer,target,abbr){
    const q=this.quote(offer,target,abbr); if(q.error) return q.error; if(this.st.cash<q.fee) return '可用資金不足。';
    const u=this.season.st.user,replace=(T,from,to)=>{ T.lineup.forEach(l=>{if(l.id===from) l.id=to;}); for(const k of ['bench','rotation','bullpen']) T[k]=T[k].map(id=>id===from?to:id); };
    replace(this.st.clubs[u],offer,target); replace(this.st.clubs[abbr],target,offer);
    this.ledger('交易補償金：'+nameOf(target),-q.fee); this.news('與'+TEAM(abbr).zh+'交換 '+nameOf(offer)+' → '+nameOf(target)+'。'); this.invalidate(); this.save(); return '';
  },
  training(id,skill){
    const S=this.season.st,s=this.st,P=PLAYERS[id],T=this.team(S.user);
    if(S.phase!=='regular') return {error:'訓練在例行賽期間開放。'};
    if(!frIDs(T).includes(id)||!P) return {error:'球員已不在名單內。'};
    const hitter=T.lineup.some(l=>l.id===id)||T.bench.includes(id),pitcher=T.rotation.includes(id)||T.bullpen.includes(id);
    if(!(hitter&&P.h&&['meet','power','speed'].includes(skill)||pitcher&&P.p&&['control','stamina','velo'].includes(skill))) return {error:'這位球員沒有這項訓練。'};
    const d=s.dev[id]||{},level=d[skill]||0,at=s.trained[id];
    if(level>=12) return {error:'這項養成已達上限 +12。'};
    const ceiling=skill==='velo'?12:Math.min(12,100-frBase(pitcher&&['control','stamina'].includes(skill)?'pit':'bat',id)[skill]);
    if(level>=ceiling) return {error:'這項能力已達 100，無須再付費訓練。'};
    if(at!=null&&S.day-at<7) return {error:'同一球員每 7 場可訓練一次；再打 '+(7-S.day+at)+' 場。'};
    const cost=Math.round(1.2*(1+level*.12)/(1+s.facilities.training*.12)*10)/10, gain=Math.min(s.facilities.training===3?3:2,ceiling-level);
    return {cost,gain};
  },
  train(id,skill){
    const q=this.training(id,skill); if(q.error) return q.error; if(this.st.cash<q.cost) return '可用資金不足。';
    const d=this.st.dev[id]||(this.st.dev[id]={}); d[skill]=(d[skill]||0)+q.gain; this.st.trained[id]=this.season.st.day;
    this.ledger('球員訓練：'+nameOf(id),-q.cost); this.news(nameOf(id)+' 完成'+FR_SKILLS[skill]+'訓練，養成 +'+q.gain+'。'); this.invalidate(); this.save(); return '';
  },
  upgrade(kind){
    if(!['stadium','training'].includes(kind)) return '沒有這項設施。';
    const n=this.st.facilities[kind]; if(n>=3) return '設施已達最高等級。'; const cost=(kind==='stadium'?8:6)*(n+1);
    if(this.st.cash<cost) return '可用資金不足。'; this.st.facilities[kind]++;
    this.ledger(kind==='stadium'?'球場設施升級':'訓練中心升級',-cost); this.news((kind==='stadium'?'球場設施':'訓練中心')+' 升至 Lv.'+(n+1)+'。'); this.save(); return '';
  },
  batter(r){
    const d=this.st.dev[r.id]; if(!d) return r; const key='b'+r.id; if(this.cache[key]) return this.cache[key];
    const m=d.meet||0,p=d.power||0,v=d.speed||0;
    return this.cache[key]={...r,meet:clamp(r.meet+m,1,100),power:clamp(r.power+p,1,100),speed:clamp(r.speed+v,1,100),whiff:Math.max(5,r.whiff-m*.25),avgEV:r.avgEV+p*.08,maxEV:r.maxEV+p*.10,sprint:r.sprint+v*.10,hp1b:Math.max(3.5,r.hp1b-v*.012)};
  },
  pitcher(r){
    const d=this.st.dev[r.id]; if(!d) return r; const key='p'+r.id; if(this.cache[key]) return this.cache[key];
    const c=d.control||0,s=d.stamina||0,v=(d.velo||0)*.15,stamina=clamp(r.stamina+s,1,100);
    return this.cache[key]={...r,control:clamp(r.control+c,1,100),stamina,limit:Math.round((r.starter?55:18)+stamina*(r.starter?.6:.4)),kmh:Math.round(r.kmh+v*1.609),maxMph:r.maxMph+v,pitches:r.pitches.map(p=>({...p,mph:p.mph+v}))};
  },
  quickBatter(r){ const d=this.st.dev[r.id]||{}; return {...r,k:r.k*(1-(d.meet||0)*.006),babip:clamp(r.babip+(d.meet||0)*.001,0,1),hr:r.hr*(1+(d.power||0)*.012)}; },
  quickPitcher(r){ const d=this.st.dev[r.id]||{}; return {...r,bb:r.bb*(1-(d.control||0)*.012),k:r.k*(1+(d.velo||0)*.008)}; }
};
const FR_SKILLS={meet:'打擊',power:'力量',speed:'跑速',control:'控球',stamina:'體力',velo:'球速'};
FRANCHISE.context={team:a=>FRANCHISE.team(a),batter:r=>FRANCHISE.batter(r),pitcher:r=>FRANCHISE.pitcher(r),quickBatter:r=>FRANCHISE.quickBatter(r),quickPitcher:r=>FRANCHISE.quickPitcher(r)};
FRANCHISE.season=Object.assign(Object.create(SEASON),{
  st:null,context(){ return FRANCHISE.context; },team(a){ return FRANCHISE.team(a); },save(){ return FRANCHISE.save(); },
  onResult(g,won,meta){ FRANCHISE.settle(g,won,meta); }
});
