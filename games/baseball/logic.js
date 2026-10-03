'use strict';
/* =========================================================
   比賽規則與判定（純計算，不碰畫面；node 也能跑）
   球員數據：assets/teams.js（tools/fetch_teams.py 產生）
   ========================================================= */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const r0=v=>Math.round(clamp(v,1,100));
function rnd(a,b){return a+Math.random()*(b-a)}
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function grade(v){return v>=90?'S':v>=80?'A':v>=70?'B':v>=60?'C':v>=50?'D':v>=40?'E':v>=20?'F':'G'}
const GCOL={S:'var(--gS)',A:'var(--gA)',B:'var(--gB)',C:'var(--gC)',D:'var(--gD)',E:'var(--gE)',F:'var(--gF)',G:'var(--gG)'};
const gtag=v=>{const g=grade(v);return `<span class="g" style="background:${GCOL[g]}">${g}</span>`};

/* ---------- 聯盟平均（樣本少的球員往這裡拉） ---------- */
const LG={avg:.245,obp:.315,slg:.400,kp:.225,bbp:.085,maxEV:108,avgEV:88.5,sprint:27,hp1b:4.45,zsw:67,osw:29,whiff:25,
          bb9:3.3,k9:8.6,era:4.1};
const reg=(v,n,lg,k)=>v==null?lg:(v*n+lg*k)/(n+k);

/* ---------- 能力值（公式公開） ---------- */
const RCACHE={};
function bat(pid){
  if(RCACHE['b'+pid]) return RCACHE['b'+pid];
  const P=PLAYERS[pid]||{}, h=P.h||{pa:0}, n=h.pa||0;
  const avg=reg(h.avg,n,LG.avg,200), slg=reg(h.slg,n,LG.slg,200), kp=reg(n?h.k/n:null,n,LG.kp,150);
  const maxEV=h.maxEV||LG.maxEV-2, sprint=h.sprint||LG.sprint-0.5;
  const r={id:pid, P, h, n,
    meet:r0(50+(avg-.250)*300+(0.22-kp)*80),
    power:r0(30+(slg-avg)*150+(maxEV-108)*2),
    speed:r0(20+(sprint-23)*10),
    traj:(slg-avg)>.2?3:(slg-avg)>.13?2:1,
    avgEV:reg(h.avgEV,n,LG.avgEV,150), maxEV,
    zsw:reg(h.zsw,n,LG.zsw,150), osw:reg(h.osw,n,LG.osw,150), whiff:reg(h.whiff,n,LG.whiff,150),
    sprint, hp1b:h.hp1b||(LG.hp1b-(sprint-LG.sprint)*0.12),
    szTop:P.szTop||3.4, szBot:P.szBot||1.6, bats:P.bats||'R'};
  return RCACHE['b'+pid]=r;
}
const DEFAULT_PITCHES=[{t:'FF',name:'四縫線速球',mph:93.5,use:.55,whiff:.2,px:-0.6,pz:1.3},{t:'SL',name:'滑球',mph:85,use:.3,whiff:.33,px:0.4,pz:0.1},{t:'CH',name:'變速球',mph:85,use:.15,whiff:.3,px:-1.1,pz:0.5}];
function pit(pid){
  if(RCACHE['p'+pid]) return RCACHE['p'+pid];
  const P=PLAYERS[pid]||{}, s=P.p||{bf:0}, bf=s.bf||0, outs=s.outs||0, ip=outs/3;
  const bb9=reg(ip?s.bb/ip*9:null,ip,LG.bb9,25), k9=reg(ip?s.k/ip*9:null,ip,LG.k9,25);
  let pitches=(s.pitches&&s.pitches.length?s.pitches:DEFAULT_PITCHES).filter(p=>p.use>=0.02);
  const hand=P.throws||'R';
  if(!(s.pitches&&s.pitches.length) && hand==='L') pitches=pitches.map(p=>({...p,px:-p.px}));
  const fb=pitches.find(p=>['FF','SI'].includes(p.t))||pitches[0];
  const levels=Object.fromEntries(pitches.map(p=>[p.t,clamp(Math.round(p.whiff*12+Math.hypot(p.px-fb.px,p.pz-fb.pz)*0.8),1,7)]));
  const maxMph=Math.max(...pitches.map(p=>p.mph))+2.2;
  const perStart=s.gs?ip/s.gs:0;
  const starter=(s.gs||0)>=5;
  const stamina=r0(starter?40+perStart*5:25+Math.min(ip,70)*0.25);
  const r={id:pid,P,s,hand,pitches,levels,
    kmh:Math.round(maxMph*1.609), control:r0(55+(3.3-bb9)*15), stamina, k9, bb9, starter,
    limit:starter?Math.round(55+stamina*0.6):Math.round(18+stamina*0.4),
    brk:pitches.filter(p=>p!==fb).map(p=>({t:p.t,name:p.name,lv:levels[p.t],px:p.px,pz:p.pz}))};
  return RCACHE['p'+pid]=r;
}
const nameOf=pid=>{const P=PLAYERS[pid]; return P?(P.zh||P.last||P.full):'?';};

/* =========================================================
   遊戲常數
   ========================================================= */
const DIFF = {
  easy:  {slow:1.95, win:0.14, cur:1.25, label:'簡單'},
  normal:{slow:1.55, win:0.105,cur:1.0,  label:'普通'},
  hard:  {slow:1.25, win:0.085,cur:0.85, label:'困難'}
};
let diff = DIFF.normal;
const PLATE_HALF = 0.708, BALL_R = 0.121;
const K_DRAG=0.0016, LIFT=0.0003, FENCE_H=8;
const fenceDist = phi => 400 - 70*Math.pow(Math.min(Math.abs(phi),45)/45,1.5);
const standDist = phi => { const a=Math.abs(phi); return a<=45 ? fenceDist(phi)+4 : Math.max(60, 334 - (a-45)/105*274); };
const BASES = { first:{x:63.6,z:-63.6}, second:{x:0,z:-127.3}, third:{x:-63.6,z:-63.6}, home:{x:0,z:0} };
const BASE_LIST=[BASES.home,BASES.first,BASES.second,BASES.third];
const POS = [
  {k:'P', n:'投手',   x:0,   z:-58,  sp:19, inf:true},
  {k:'C', n:'捕手',   x:0,   z:3.2,  sp:17, inf:true},
  {k:'1B',n:'一壘手', x:66,  z:-80,  sp:21, inf:true},
  {k:'2B',n:'二壘手', x:34,  z:-128, sp:23, inf:true},
  {k:'SS',n:'游擊手', x:-36, z:-128, sp:23, inf:true},
  {k:'3B',n:'三壘手', x:-68, z:-82,  sp:21, inf:true},
  {k:'LF',n:'左外野手',x:-150,z:-255, sp:26, inf:false},
  {k:'CF',n:'中外野手',x:0,   z:-315, sp:27, inf:false},
  {k:'RF',n:'右外野手',x:150, z:-255, sp:26, inf:false},
];
const isStrikeFor=(b,x,y)=>Math.abs(x)<=PLATE_HALF+BALL_R && y>=b.szBot-BALL_R && y<=b.szTop+BALL_R;
const batSide=(b,p)=>b.bats==='S'?(p.hand==='R'?'L':'R'):b.bats;     // 左右開弓：站投手的反邊
const FASTBALLS=['FF','SI','FC'], BREAKING=['SL','ST','SV','CU','KC'], OFFSPEED=['CH','FS','FO','SC','KN'];

/* =========================================================
   投球
   ========================================================= */
function choosePitch(pr,balls,strikes){
  const best=pr.pitches.reduce((a,b)=>b.whiff>a.whiff?b:a);
  const w=pr.pitches.map(p=>{
    let x=p.use;
    if(balls===3 && FASTBALLS.includes(p.t)) x*=2.2;
    if(balls>=2 && strikes<2 && !FASTBALLS.includes(p.t)) x*=0.6;
    if(strikes===2 && p===best) x*=1.7;
    return x;});
  let s=w.reduce((a,b)=>a+b), r=Math.random()*s;
  for(let i=0;i<w.length;i++){ if((r-=w[i])<=0) return pr.pitches[i]; }
  return pr.pitches[0];
}
function aimFor(p,pr,br,balls,strikes){
  const top=br.szTop, bot=br.szBot, side=batSide(br,pr)==='R'?-1:1;   // 打者站的那一側（x 正負）
  const same = (side===-1)===(pr.hand==='R');
  let x,y;
  if(FASTBALLS.includes(p.t)){ x=rnd(-0.65,0.65); y=rnd(bot+0.6,top+0.15); if(strikes===2&&balls<3) y=rnd(top-0.1,top+0.6); }
  else if(BREAKING.includes(p.t)){ x=(same?-side:side)*rnd(0.3,1.05); y=rnd(bot-0.5,bot+0.7); }
  else { x=-side*rnd(0.1,0.9); y=rnd(bot-0.7,bot+0.3); }
  if(balls===3){ x*=0.5; y=(y+(top+bot)/2)/2; }
  return {x,y};
}
// 遊戲用的球路輪廓：水平／垂直幅度，以及累積變化的時間曲線。
const PITCH_SHAPES={
  FF:{x:1.0,y:.9,ex:2,ey:2}, SI:{x:2.6,y:1.55,ex:2.6,ey:2.8}, FC:{x:2.2,y:1.1,ex:3.1,ey:2.6},
  SL:{x:3.1,y:1.8,ex:3.3,ey:3}, ST:{x:4,y:1.25,ex:2.5,ey:2.4}, SV:{x:2.8,y:2.1,ex:2.8,ey:2.7},
  CU:{x:1.9,y:2.45,ex:2.1,ey:2.45}, KC:{x:1.4,y:2.8,ex:2.1,ey:3.1}, CS:{x:1.5,y:2.6,ex:2,ey:2.3},
  CH:{x:2.8,y:2,ex:2.7,ey:3}, FS:{x:1.3,y:2.6,ex:2,ey:4.2}, FO:{x:1.4,y:2.8,ex:2.2,ey:4},
  SC:{x:3,y:2.1,ex:2.5,ey:2.9}, KN:{x:1.1,y:1.1,ex:2,ey:2,flutter:.5}
};
// 依投手該球種的變化等級、真實位移與球速調整輪廓，疲勞會削弱變化。
function buildPitch(p,pr,aim,fat=0,noise=true){
  const sig = 0.25 + (100-pr.control)*0.0072 + fat*0.25;
  const end = noise?{x:aim.x+gauss()*sig, y:aim.y+gauss()*sig}:{...aim};
  const mph = p.mph + (noise?gauss()*0.9:0) - fat*2.5;
  const tReal = 53.9/(mph*1.467*0.93);
  const drop = 0.5*32.2*tReal*tReal;
  const level=pr.levels?.[p.t]||pr.brk?.find(b=>b.t===p.t)?.lv||clamp(Math.round(p.whiff*12),1,7);
  const shape=PITCH_SHAPES[p.t]||{x:1.8,y:1.8,ex:2.5,ey:2.5}, strength=(.6+level*.14)*(1-clamp(fat,0,1)*.18);
  const B = {x:clamp(p.px*shape.x*strength,-7,7), y:clamp((-drop+p.pz)*shape.y*strength,-12,5)};
  const motion={ex:shape.ex,ey:shape.ey,flutter:(shape.flutter||0)*strength,phase:noise?rnd(0,Math.PI*2):(+pr.id||0)%97*.37};
  const T = 0.40*(98/mph)*diff.slow;
  return {p, mph, kmh:Math.round(mph*1.609), end, B, T,level,motion};
}
function makePitch(pr,br,balls,strikes,fat){ const p=choosePitch(pr,balls,strikes); return buildPitch(p,pr,aimFor(p,pr,br,balls,strikes),fat); }
function pitchPos(P,u,rel){
  const m=P.motion||{ex:2,ey:2,flutter:0,phase:0}, t=Math.max(0,u), envelope=Math.sin(Math.PI*clamp(t,0,1));
  const flutter=m.flutter*envelope;
  return {x:rel.x+(P.end.x-rel.x)*t+P.B.x*(Math.pow(t,m.ex)-t)+flutter*Math.sin(t*19+m.phase),
    y:rel.y+(P.end.y-rel.y)*t+P.B.y*(Math.pow(t,m.ey)-t)+flutter*.65*Math.sin(t*27+m.phase*1.7), z:rel.z*(1-t)};
}

/* ---------- 電腦打者：用該打者的揮棒率、追打率、揮空率、擊球初速 ---------- */
function batterDecide(P,br,pr,balls,strikes){
  const e=P.end, inZ=isStrikeFor(br,e.x,e.y);
  const ox=Math.max(0,Math.abs(e.x)-PLATE_HALF), oy=Math.max(0,br.szBot-e.y,e.y-br.szTop), off=Math.hypot(ox,oy);
  let ps = inZ ? br.zsw/100 : 0.62*(br.osw/29)*Math.exp(-off*1.8);
  if(strikes===2) ps = inZ?Math.max(ps,0.88):ps*1.5;
  if(balls===3 && strikes<2) ps*=0.55;
  if(balls+strikes===0) ps*=0.8;
  ps=clamp(ps,0,0.97);
  if(Math.random()>ps) return {swing:false};
  let pw = 0.5*P.p.whiff + 0.5*br.whiff/100;
  pw *= inZ?1.0:1.8;
  pw *= 1 + (pr.k9-LG.k9)*0.03;
  if(Math.random()<pw) return {swing:true, whiff:true};
  if(Math.random()<0.36) return {swing:true, foul:true};
  const side=batSide(br,pr)==='R'?-1:1, pull=side;     // 右打拉向左外野（負）
  const ev = clamp(br.avgEV + gauss()*11 - (inZ?0:6), 45, br.maxEV+1);
  const la = 12 + (e.y-2.3)*9 + (br.power-60)*0.12 + gauss()*24;
  const spray = pull*(8 + (e.x*side)*16) + gauss()*20;
  return {swing:true, bb:{ev,la,spray}};
}

/* ---------- 玩家打擊：游標與時機 ---------- */
function cursorSize(br,mode){
  const base = (0.40 + br.meet*0.0045)*diff.cur, k = mode==='power'?0.68:1;
  return {rx:base*k, ry:base*k*0.78};
}
function contact(br,side,ball,cur,dt,mode){
  const {rx,ry}=cursorSize(br,mode);
  const dx=ball.x-cur.x, dy=ball.y-cur.y, dn=Math.hypot(dx/rx,dy/ry);
  if(Math.abs(dt)>diff.win || dn>1.08) return null;
  const tim = dt/diff.win;                       // -1 太早 … +1 太晚
  let q = 1 - 0.55*Math.pow(dn,1.5) - 0.35*tim*tim;
  const maxEV = (98 + br.power*0.22)*(mode==='power'?1.04:0.97);
  let ev = 64 + (maxEV-64)*clamp(q,0,1) + gauss()*3;
  let la = 10 + (dy/ry)*42 + (br.traj-2)*4 + gauss()*5;
  let spray = -side*tim*44 + (dx/rx)*8 + gauss()*6;  // 太晚 → 推向反方向
  if(dn>0.9 && Math.random()<0.55){ spray = (Math.random()<.5?-1:1)*rnd(70,140); la = rnd(-5,60); ev*=0.7; }
  return {ev:clamp(ev,30,118), la:clamp(la,-60,80), spray, q, dn, tim};
}

/* =========================================================
   擊球飛行＋守備判定
   ========================================================= */
function simulateBall(p0,bb){
  const v=bb.ev*1.467, la=bb.la*Math.PI/180, sp=bb.spray*Math.PI/180;
  const vel={x:v*Math.cos(la)*Math.sin(sp), y:v*Math.sin(la), z:-v*Math.cos(la)*Math.cos(sp)};
  const p={...p0};
  const pts=[]; const dt=1/120; let t=0, bounced=false, fb=null, hr=false, grd=false, stands=false, wall=false, rolling=false;
  const backspin = bb.la>4;
  while(t<11){
    const s=Math.hypot(vel.x,vel.y,vel.z), vh=Math.hypot(vel.x,vel.z);
    if(rolling){
      const f=13*dt;
      if(vh<=f){vel.x=vel.z=0}else{vel.x-=f*vel.x/vh; vel.z-=f*vel.z/vh}
    }else{
      vel.x+=-K_DRAG*s*vel.x*dt;
      vel.y+=(-32.2-K_DRAG*s*vel.y+(backspin&&!bounced?LIFT*s*vh:0))*dt;
      vel.z+=-K_DRAG*s*vel.z*dt;
    }
    p.x+=vel.x*dt; p.y+=vel.y*dt; p.z+=vel.z*dt; t+=dt;
    if(!rolling && p.y<=0){
      p.y=0;
      if(!fb) fb={x:p.x,z:p.z,t};
      bounced=true;
      if(Math.abs(vel.y)>7){ vel.y=-vel.y*0.42; vel.x*=0.72; vel.z*=0.72; }
      else { vel.y=0; rolling=true; }
    }
    const d=Math.hypot(p.x,p.z), phi=Math.atan2(p.x,-p.z)*180/Math.PI;
    if(Math.abs(phi)<=45 && d>=fenceDist(phi) && p.z<0){
      if(p.y>FENCE_H){ if(bounced) grd=true; else hr=true; pts.push({t,x:p.x,y:p.y,z:p.z,b:bounced}); break; }
      const nx=p.x/d, nz=p.z/d, dot=vel.x*nx+vel.z*nz;
      if(dot>0){ vel.x-=1.5*dot*nx; vel.z-=1.5*dot*nz; vel.x*=0.6; vel.z*=0.6; wall=true; }
    }
    if(Math.abs(phi)>45 && d>=standDist(phi)){ stands=true; pts.push({t,x:p.x,y:p.y,z:p.z,b:bounced}); break; }
    if(p.z>4 && d>60){ stands=true; pts.push({t,x:p.x,y:p.y,z:p.z,b:bounced}); break; }
    pts.push({t,x:p.x,y:p.y,z:p.z,b:bounced});
  }
  return {pts,fb,hr,grd,stands,wall};
}
const isFairAt=(x,z)=>Math.abs(Math.atan2(x,-z)*180/Math.PI)<=45 && z<=0.5;
const dirOf=(x,z)=>{const phi=Math.atan2(x,-z)*180/Math.PI; return phi<-15?'左外野':phi>15?'右外野':'中外野';};
function resolvePlay(sim,bb,br){
  const out={kind:'',text:'',fielder:null,idx:-1,throwTo:null,bases:0,air:false};
  if(sim.hr){ out.kind='HR'; out.text='全壘打'; out.bases=4; out.dist=Math.hypot(sim.pts.at(-1).x,sim.pts.at(-1).z); return out; }
  let best=null;
  for(const f of POS){
    const react = f.inf?0.28:0.42;
    for(let i=0;i<sim.pts.length;i+=2){
      const q=sim.pts[i]; if(q.y>7.5) continue;
      if(!q.b && q.y>0.2 && f.k==='C' && Math.hypot(q.x,q.z)>90) continue;
      const reach = q.b?(f.inf?1.65:3.2):1.65;
      const need = react + Math.max(0,Math.hypot(q.x-f.x,q.z-f.z)-reach)/(f.inf&&q.b?f.sp*0.72:f.sp*0.9);
      if(need<=q.t){ if(!best||q.t<best.t) best={f,i,t:q.t,q}; break; }
    }
  }
  const lastPt=sim.pts[sim.pts.length-1];
  let fair;
  if(sim.grd) fair=true;
  else if(sim.fb && Math.hypot(sim.fb.x,sim.fb.z)>=90) fair=isFairAt(sim.fb.x,sim.fb.z);
  else if(best && !best.q.b) fair=isFairAt(best.q.x,best.q.z);
  else {
    let ref=best?best.q:lastPt; const lim=best?best.i:sim.pts.length-1;
    for(let i=0;i<=lim;i++){ const q=sim.pts[i]; if(q.b && Math.hypot(q.x,q.z)>=90){ ref=q; break; } }
    fair=isFairAt(ref.x,ref.z);
  }
  if(sim.stands && (!best || best.q.b)){ out.kind='FOUL'; out.text='界外球'; return out; }
  if(sim.grd){ out.kind='2B'; out.text='場地規則二壘安打'; out.bases=2; out.fielder=best&&best.f; return out; }
  if(!best){ out.kind='FOUL'; out.text='界外球'; return out; }
  out.fielder=best.f; out.idx=best.i; out.t=best.t; out.dist=Math.hypot(best.q.x,best.q.z); out.phi=Math.atan2(best.q.x,-best.q.z)*180/Math.PI;
  if(!best.q.b){
    out.kind='OUT'; out.air=true; out.foul=!fair;
    out.text = (fair?'':'界外') + (bb.la>50?'高飛球':bb.la>=22?'飛球':'平飛球') + '被'+best.f.n+'接殺';
    return out;
  }
  if(!fair){ out.kind='FOUL'; out.text='界外球'; return out; }
  const q=best.q, dn=dirOf(q.x,q.z);
  if(best.f.inf){
    const thr = Math.hypot(q.x-BASES.first.x,q.z-BASES.first.z)/115 + 0.6;
    out.ground=true; out.throwTo='first'; out.throwT=thr;
    if(best.t+thr < br.hp1b){ out.kind='OUT'; out.text=best.f.n+'滾地球，傳一壘出局'; return out; }
    out.kind='1B'; out.text='內野安打'; out.bases=1; return out;
  }
  const to2 = Math.hypot(q.x-BASES.second.x,q.z-BASES.second.z)/120+0.8;
  const to3 = Math.hypot(q.x-BASES.third.x,q.z-BASES.third.z)/120+0.9;
  const run2 = br.hp1b + 90/br.sprint + 0.6, run3 = run2 + 90/br.sprint + 0.5;
  if(best.t+to3 > run3+0.3){ out.kind='3B'; out.text=dn+'三壘安打'; out.bases=3; out.throwTo='third'; out.throwT=to3; }
  else if(best.t+to2 > run2+0.3){ out.kind='2B'; out.text=dn+'二壘安打'; out.bases=2; out.throwTo='second'; out.throwT=to2; }
  else { out.kind='1B'; out.text=dn+'安打'; out.bases=1; out.throwTo='second'; out.throwT=to2; }
  return out;
}

/* =========================================================
   跑壘：結果 → 壘上跑者、出局、得分
   bases=[一壘,二壘,三壘]（球員 id 或 null）
   回傳 {bases, outs, runs, scorers, moves:[{id,from,to}], extra}
   ========================================================= */
function advance(bases,outs,res,batterId){
  const b=[...bases], moves=[], scorers=[]; let o=outs, note='';
  const spd=id=>id?bat(id).sprint:27;
  const mv=(id,from,to)=>{ moves.push({id,from,to}); if(to>=4) scorers.push(id); };
  const k=res.kind;
  if(k==='HR'){ for(let i=2;i>=0;i--) if(b[i]) mv(b[i],i+1,4); mv(batterId,0,4); return fin([null,null,null],o); }
  if(k==='3B'){ for(let i=2;i>=0;i--) if(b[i]) mv(b[i],i+1,4); mv(batterId,0,3); return fin([null,null,batterId],o); }
  if(k==='2B'){
    const nb=[null,batterId,null];
    if(b[2]) mv(b[2],3,4); if(b[1]) mv(b[1],2,4);
    if(b[0]){ if(Math.random()<0.42+(spd(b[0])-27)*0.08) mv(b[0],1,4); else { mv(b[0],1,3); nb[2]=b[0]; } }
    mv(batterId,0,2); return fin(nb,o);
  }
  if(k==='1B'){
    const nb=[batterId,null,null], inf=res.ground;
    if(b[2]) mv(b[2],3,4);
    if(b[1]){ if(!inf && Math.random()<0.68+(spd(b[1])-27)*0.08) mv(b[1],2,4); else { mv(b[1],2,3); nb[2]=b[1]; } }
    if(b[0]){ const to3 = !inf && !nb[2] && (res.phi||0)>10 && Math.random()<0.35+(spd(b[0])-27)*0.06;
      if(to3){ mv(b[0],1,3); nb[2]=b[0]; } else { mv(b[0],1,2); nb[1]=b[0]; } }
    mv(batterId,0,1); return fin(nb,o);
  }
  if(k==='BB'){
    const nb=[...b];
    if(b[0]){ if(b[1]){ if(b[2]) mv(b[2],3,4); nb[2]=b[1]; mv(b[1],2,3); } nb[1]=b[0]; mv(b[0],1,2); }
    nb[0]=batterId; mv(batterId,0,1); return fin(nb,o);
  }
  if(k==='K'){ return fin(b,o+1); }
  if(k==='OUT' && res.air){
    o++;
    if(o<3 && !res.foul){
      const d=res.dist||0;
      if(b[2] && d>=200 && Math.random()<(d>=240?0.9:0.5)){ mv(b[2],3,4); b[2]=null; note='高飛犧牲打'; }
      if(b[1] && !b[2] && d>=280 && (res.phi||0)>-10 && Math.random()<0.55){ mv(b[1],2,3); b[2]=b[1]; b[1]=null; }
    }
    return fin(b,o);
  }
  if(k==='OUT'){   // 內野滾地球
    if(b[0] && outs<2 && (res.t||9)<1.9 && Math.random()<0.48-(bat(batterId).sprint-27)*0.06){
      o+=2; note='雙殺打'; const nb=[null,null,null];
      if(o<3){ if(b[2]) mv(b[2],3,4); if(b[1]){ mv(b[1],2,3); nb[2]=b[1]; } }
      return fin(nb,o);
    }
    o++;
    const nb=[null,b[1],b[2]];
    if(b[0]){ // 封殺前導跑者，打者上一壘
      if(b[1]){ if(b[2] && o<3){ mv(b[2],3,4); } nb[2]=b[1]; mv(b[1],2,3); }
      nb[1]=b[0]; mv(b[0],1,2);
    } else if(o<3){
      if(b[2] && Math.random()<0.5){ mv(b[2],3,4); nb[2]=null; }
      if(b[1] && !nb[2] && (res.fielder&&['1B','2B'].includes(res.fielder.k)) && Math.random()<0.6){ mv(b[1],2,3); nb[2]=b[1]; nb[1]=null; }
    }
    return fin(nb,o);
  }
  return fin(b,o);
  function fin(nb,no){
    const runs = no>=3 ? 0 : scorers.length;
    return {bases:no>=3?[null,null,null]:nb, outs:Math.min(no,3), runs, scorers:no>=3?[]:scorers, moves, note};
  }
}

/* =========================================================
   一場比賽
   ========================================================= */
const TEAM=abbr=>TEAMS.find(t=>t.abbr===abbr);
function newGame(awayAbbr,homeAbbr,userAbbr,spAway,spHome){
  const mk=(abbr,sp)=>{ const T=TEAM(abbr); return {abbr,T,lineup:T.lineup.map(l=>({...l})),idx:0,pitcher:sp||T.rotation[0],
    usedPen:[],line:[],runs:0,hits:0,pc:{},inningRuns:0}; };
  return {away:mk(awayAbbr,spAway),home:mk(homeAbbr,spHome),user:userAbbr,inning:1,half:'top',outs:0,bases:[null,null,null],
          balls:0,strikes:0,over:false,log:[],pbp:[]};
}
const batting=g=>g.half==='top'?g.away:g.home, fielding=g=>g.half==='top'?g.home:g.away;
const curBatter=g=>{const t=batting(g); return t.lineup[t.idx%9].id;};
const curPitcher=g=>fielding(g).pitcher;
function fatigue(g){ const t=fielding(g), pr=pit(t.pitcher), pc=t.pc[t.pitcher]||0; return clamp((pc-pr.limit*0.75)/(pr.limit*0.5),0,1); }
// 打席結束後套用結果；回傳說明文字
function applyResult(g,res,pre){
  const t=batting(g), f=fielding(g), bid=curBatter(g);
  const a=pre||advance(g.bases,g.outs,res,bid);
  g.bases=a.bases; g.outs=a.outs; t.runs+=a.runs; t.inningRuns+=a.runs;
  t.line[g.inning-1]=(t.line[g.inning-1]||0)+a.runs;
  if(['1B','2B','3B','HR'].includes(res.kind)) t.hits++;
  t.idx++; g.balls=0; g.strikes=0;
  let text=res.text+(a.note?'（'+a.note+'）':'')+(a.runs?`，得 ${a.runs} 分`:'');
  g.pbp.push({inning:g.inning,half:g.half,batter:bid,pitcher:f.pitcher,text,kind:res.kind,runs:a.runs});
  g.lastAdvance=a;
  // 再見安打
  if(g.half==='bottom' && g.inning>=9 && g.home.runs>g.away.runs){ g.over=true; text+='　再見勝！'; return text; }
  if(g.outs>=3) endHalf(g);
  return text;
}
function endHalf(g){
  const t=batting(g); t.line[g.inning-1]=t.line[g.inning-1]||0; t.inningRuns=0;
  g.outs=0; g.bases=[null,null,null];
  if(g.half==='top'){
    if(g.inning>=9 && g.home.runs>g.away.runs){ g.over=true; return; }
    g.half='bottom';
  } else {
    if(g.inning>=9 && g.home.runs!==g.away.runs){ g.over=true; return; }
    g.inning++; g.half='top';
  }
  fielding(g).inningRuns=0; batting(g).inningRuns=0;
  if(g.inning>=10){ const bt=batting(g); g.bases[1]=bt.lineup[(bt.idx+8)%9].id; }   // 延長賽二壘自動跑者
  g.halfChanged=true;
}
// 電腦教練：要不要換投
function maybeChangePitcher(g){
  const f=fielding(g), pr=pit(f.pitcher), pc=f.pc[f.pitcher]||0;
  const tired = pc>=pr.limit || (f.inningRuns>=4 && pc>35) || (pc>=pr.limit*0.85 && g.bases.filter(Boolean).length>=2);
  if(!tired) return null;
  const lead=(g.half==='top'?g.home.runs-g.away.runs:g.away.runs-g.home.runs);
  const avail=f.T.bullpen.filter(id=>!f.usedPen.includes(id) && id!==f.pitcher);
  if(!avail.length) return null;
  let next = (g.inning>=9 && lead>0 && lead<=3) ? avail[0] : (avail.length>1?avail[1]:avail[0]);
  if(g.inning<9 && next===f.T.bullpen[0] && avail.length>1) next=avail.find(i=>i!==f.T.bullpen[0]);
  f.usedPen.push(next); const old=f.pitcher; f.pitcher=next;
  return {old,next};
}
// 電腦對電腦跑完一個打席（跳過用）
function simPA(g){
  const br=bat(curBatter(g)), f=fielding(g), pr=pit(f.pitcher); let b=g.balls,k=g.strikes, n=0;
  while(true){
    const P=makePitch(pr,br,b,k,fatigue(g)), d=batterDecide(P,br,pr,b,k); n++; f.pc[f.pitcher]=(f.pc[f.pitcher]||0)+1;
    if(!d.swing){ if(isStrikeFor(br,P.end.x,P.end.y)) k++; else b++; }
    else if(d.whiff) k++;
    else if(d.foul){ if(k<2) k++; }
    else { const sim=simulateBall({x:P.end.x,y:P.end.y,z:0},d.bb), o=resolvePlay(sim,d.bb,br);
      if(o.kind==='FOUL'){ if(k<2) k++; continue; } return {res:o,P,n}; }
    if(k>=3) return {res:{kind:'K',text:'三振'},P,n};
    if(b>=4) return {res:{kind:'BB',text:'四壞球保送'},P,n};
  }
}

/* =========================================================
   自我測試（?selftest）：電腦對電腦整場
   ========================================================= */
if(typeof location!=='undefined' && location.search.includes('selftest')){
  const N=+(new URLSearchParams(location.search).get('games')||200), agg={R:0,H:0,K:0,BB:0,HR:0,PA:0,games:N,extra:0};
  for(let i=0;i<N;i++){
    const g=newGame('DET','LAD','DET');
    while(!g.over){ maybeChangePitcher(g); const r=simPA(g); agg.PA++; if(r.res.kind==='K')agg.K++; if(r.res.kind==='BB')agg.BB++; if(r.res.kind==='HR')agg.HR++; applyResult(g,r.res); }
    agg.R+=g.away.runs+g.home.runs; agg.H+=g.away.hits+g.home.hits; if(g.inning>9) agg.extra++;
  }
  const res={runsPerTeamGame:(agg.R/N/2).toFixed(2),hitsPerTeamGame:(agg.H/N/2).toFixed(2),Kpct:(agg.K/agg.PA).toFixed(3),BBpct:(agg.BB/agg.PA).toFixed(3),HRperPA:(agg.HR/agg.PA).toFixed(3),extraInnPct:(agg.extra/N).toFixed(2)};
  if(typeof window!=='undefined') window.__SELFTEST=res;
  if(typeof document!=='undefined' && document.title!==undefined) document.title='SELFTEST '+JSON.stringify(res);
}
if(typeof module!=='undefined') module.exports={bat,pit,newGame,simPA,applyResult,maybeChangePitcher,advance,curBatter,curPitcher,batting,fielding};
