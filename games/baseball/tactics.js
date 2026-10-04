'use strict';
/* =========================================================
   戰術選單（按 T）＋電腦教練在比賽中的戰術＋關鍵時刻特寫
   規則在 logic.js（stealProb、doSteal、buntPlay、applyDefense、cpuOffense、cpuDefense）
   ========================================================= */
const abTags=list=>(list||[]).map(a=>`<span class="ss-ab ss-ab-${a.c}" title="${a.d}">${a.name}</span>`).join('');
const TACTICS={
  el:null, prev:null, cutPA:-1, busy:false,
  ensure(){
    if(this.el) return this.el;
    const el=document.createElement('div'); el.className='ss-tac hide'; el.id='ssTac'; document.body.appendChild(el);
    el.setAttribute('role','dialog'); el.setAttribute('aria-label','戰術選單');
    el.addEventListener('click',e=>{ if(e.target.closest('.ss-close')){ this.close(); return; } const b=e.target.closest('[data-t]'); if(b) this.choose(b.dataset.t,b.dataset.v); });
    this.el=el; return el;
  },
  canOpen(){ return typeof GM!=='undefined' && GM && !GM.over && ['aim','ready'].includes(G.state) && !this.busy; },
  userSide(){ return batting(GM).abbr===GM.user?'off':fielding(GM).abbr===GM.user?'def':null; },
  isOpen(){ return !!this.el&&!this.el.classList.contains('hide'); },
  toggle(){ if(this.isOpen()) this.close(); else this.open(); },
  open(){
    if(!this.canOpen() || !this.userSide()) return;
    this.prev=G.state; G.state='tactic'; this.render('main'); this.el.classList.remove('hide');
  },
  close(resume=true){
    if(this.el) this.el.classList.add('hide');
    if(this.prev!==null && resume){ G.state=this.prev; G.waitUntil=G.t+0.8; }
    this.prev=null;
    if(resume&&this.el?.contains(document.activeElement)) document.activeElement.blur();
  },
  pause(){ this.prev=this.prev??G.state; G.state='tactic'; },
  // 選單內容
  render(view){
    const g=GM, side=this.userSide(), b=g.bases, o=g.outs, el=this.ensure();
    const row=(t,v,label,sub,dis)=>`<button class="ss-tr${dis?' dis':''}"${dis?' disabled':''} data-t="${dis?'':t}" data-v="${v??''}"><b>${label}</b><span>${sub||''}</span></button>`;
    let h='<button type="button" class="ss-close" aria-label="關閉戰術選單">✕</button>';
    if(view==='main'&&side==='off'){
      const pct=(id,to)=>Math.round(stealProb(id,to)*100);
      h+=`<div class="ss-th">進攻戰術<small>${batting(g).T.zh}</small></div>`;
      h+=row('ph','', '代打', '從板凳換人上來打');
      h+=row('steal',1,'盜二壘', b[0]&&!b[1]?`${nameOf(b[0])}・成功率約 ${pct(b[0],2)}%`:'一壘有人、二壘空著才能盜', !(b[0]&&!b[1]));
      h+=row('steal',2,'盜三壘', b[1]&&!b[2]?`${nameOf(b[1])}・成功率約 ${pct(b[1],3)}%`:'二壘有人、三壘空著才能盜', !(b[1]&&!b[2]));
      h+=row('bunt','sac','犧牲觸擊','打者出局，換跑者推進一個壘', !((b[0]||b[1])&&o<2));
      h+=row('bunt','drag','突襲觸擊','打者求安打，跑得越快越容易');
      h+=row('hitrun','','打帶跑','跑者起跑、打者求碰到球；不容易雙殺', !(b[0]&&!b[1]&&o<2));
    } else if(view==='main'&&side==='def'){
      const d=CUR_CTX.def||{};
      h+=`<div class="ss-th">防守戰術<small>${fielding(g).T.zh}</small></div>`;
      h+=row('pc','','換投手','從牛棚叫人上來');
      h+=row('ibb','','故意四壞','直接保送這位打者');
      h+=row('def','infieldIn',`前進守備${d.infieldIn?'（使用中）':''}`,'三壘跑者比較難靠滾地球回來，但內野較容易被穿過');
      h+=row('def','shift',`拉打布陣${d.shift?'（使用中）':''}`,'針對拉打型強打，往拉打方向補人');
    } else if(view==='ph'){
      const t=batting(g), used=new Set(t.lineup.map(l=>l.id).concat(g.usedBench||[]));
      const pr=pit(curPitcher(g)), vs=pr.hand==='L'?'vl':'vr';
      h+=`<div class="ss-th">代打人選<small>投手${pr.hand==='L'?'左投':'右投'}</small></div>`;
      const list=t.T.bench.filter(id=>!used.has(id)&&PLAYERS[id]?.h);
      if(!list.length) h+='<div class="ss-none">板凳上沒有可用的打者。</div>';
      for(const id of list){ const br=bat(id), s=PLAYERS[id].h[vs];
        h+=`<button class="ss-tr" data-t="phgo" data-v="${id}"><b>${nameOf(id)}<small>${{R:'右打',L:'左打',S:'兩打'}[br.bats]||''}</small></b><span>打擊 ${grade(br.meet)}　力量 ${grade(br.power)}　${s?`對${pr.hand==='L'?'左':'右'}投 OPS ${s[2].toFixed(3).replace(/^0/,'')}`:''}</span><span class="ss-abl">${abTags(br.ab)}</span></button>`; }
      h+=row('main','', '返回', '');
    } else if(view==='pc'){
      const f=fielding(g), st=typeof SEASON!=='undefined'&&g.season?SEASON.st:null;
      h+=`<div class="ss-th">牛棚<small>現任 ${nameOf(f.pitcher)}・${f.pc[f.pitcher]||0} 球</small></div>`;
      const list=f.T.bullpen.concat(f.T.rotation).filter(id=>id!==f.pitcher && !f.usedPen.includes(id) && !(f.T.rotation.includes(id)&&id!==f.T.rotation[0]&&false));
      for(const id of f.T.bullpen.filter(id=>id!==f.pitcher)){
        const pr=pit(id), tired=f.usedPen.includes(id), rest=st&&st.lastP&&st.lastP[id]===st.day-1;
        h+=`<button class="ss-tr${tired?' dis':''}" data-t="${tired?'':'pcgo'}" data-v="${id}"><b>${nameOf(id)}<small>${pr.hand==='L'?'左投':'右投'}${rest?'・昨天有投':''}${tired?'・已退場':''}</small></b><span>${pr.kmh} km/h　控球 ${grade(pr.control)}　體力 ${grade(pr.stamina)}　防禦率 ${PLAYERS[id]?.p?.era||'-.--'}</span><span class="ss-abl">${abTags(pr.ab)}</span></button>`;
      }
      h+=row('main','', '返回', '');
    }
    h+=`<div class="ss-tf">按 T 或 Esc 關閉</div>`;
    el.innerHTML=h;
  },
  choose(t,v){
    const g=GM;
    if(t==='main'||t==='ph'||t==='pc'){ this.render(t); return; }
    if(t==='phgo'){ this.pinchHit(+v); return; }
    if(t==='pcgo'){ this.changePitcher(+v); return; }
    if(t==='steal'){ this.close(false); this.steal(+v,true); return; }
    if(t==='bunt'){ this.close(false); this.bunt(v,true); return; }
    if(t==='hitrun'){ CUR_CTX.hitRun=true; say('打帶跑！跑者準備起跑。'); ACH.onTactic('hitrun',true); this.close(); return; }
    if(t==='ibb'){ this.close(false); this.ibb(true); return; }
    if(t==='def'){ CUR_CTX.def=CUR_CTX.def||{}; CUR_CTX.def[v]=!CUR_CTX.def[v]; CUR_CTX.keepDef=true; say(`${v==='infieldIn'?'前進守備':'拉打布陣'}${CUR_CTX.def[v]?'：開始':'：解除'}。`); ACH.onTactic('def',true); this.render('main'); return; }
  },
  pinchHit(id){
    const g=GM, t=batting(g), slot=t.idx%9, old=t.lineup[slot];
    g.usedBench=(g.usedBench||[]).concat(id); t.lineup[slot]={id,pos:old.pos};
    this.close(); setBatter(id); setPanels(); setCtx(g); flashBanner(id,false,2200);
    say(`代打：${nameOf(id)}換下${nameOf(old.id)}。`); ACH.onTactic('ph',true);
  },
  changePitcher(id){
    const f=fielding(GM); f.usedPen.push(id); f.pitcher=id;
    this.close(); setPitcher(id); setCtx(GM); setPanels(); if(typeof buildMenu==='function') buildMenu(); flashBanner(id,true,2200);
    say(`換投：${nameOf(id)}上場。`); ACH.onTactic('pc',true);
  },
  // 盜壘：結算、簡單跑動畫，然後回到打席或換局
  steal(from,byUser){
    const g=GM, id=g.bases[from-1]; if(!id) return;
    this.busy=true; this.pause();
    const r=doSteal(g,from), c=C.runners&&C.runners[id];
    say(r.text+'！'); if(byUser) ACH.onTactic('steal',r.ok);
    const t0=performance.now(), dur=1300;
    const step=()=>{
      const u=Math.min(1,(performance.now()-t0)/dur);
      if(c&&typeof pathAt==='function'){ const q=pathAt(from+(r.ok?u:u*0.9)); c.root.position.x=q.x; c.root.position.z=q.z; c.root.rotation.y=q.dir; if(typeof runPose==='function') runPose(c,u*3,u<1); }
      if(u<1){ requestAnimationFrame(step); return; }
      if(typeof showCall==='function') showCall(r.ok?'盜壘成功':'阻殺',r.ok?'':'blue');
      setTimeout(()=>{ this.busy=false; this.afterTactic(); },900);
    };
    requestAnimationFrame(step);
  },
  bunt(kind,byUser){
    const g=GM; this.pause(); const r=buntPlay(g,kind);
    say(kind==='sac'?'犧牲觸擊……':'突襲觸擊……');
    if(byUser) ACH.onTactic(kind==='sac'?'sac':'drag',!!(r.res.sac||r.res.kind==='1B'));
    setTimeout(()=>{ if(r.res.kind==='1B'&&typeof startBuntPlay==='function') startBuntPlay(r.res,r.pre); else finishPA(r.res,r.pre); },700);
  },
  ibb(byUser){ this.pause(); say('故意四壞，直接保送。'); if(byUser) ACH.onTactic('ibb',true); setTimeout(()=>finishPA({kind:'BB',text:'故意四壞',ibb:true}),700); },
  // 盜壘後：換局就照換局流程，否則回到同一個打席
  afterTactic(){
    const g=GM; this.prev=null;
    setScore(); if(typeof setRunners==='function') setRunners();
    if(g.over){ endGame(); return; }
    if(g.halfChanged){ g.halfChanged=false; showLineScore(()=>{ setDefense(); setupPA(false); }); return; }
    G.state=G.mode==='pitch'?'aim':'ready'; G.waitUntil=G.t+1.0;
  },
  /* ---------- 每個打席開始時（setupPA 尾端呼叫） ---------- */
  beforePA(first){
    if(typeof GM==='undefined'||!GM||GM.over) return;
    this.close(false);
    const g=GM, idx=batting(g).idx+(g.half==='top'?0:1000)+g.inning*10000;
    if(!first) this.cutin(idx);
    const bt=batting(g), fd=fielding(g);
    if(bt.abbr!==g.user){ const c=cpuOffense(g);
      if(c&&c.type==='steal'&&!first){ this.pause(); setTimeout(()=>{ say(`對手下令盜壘：${nameOf(g.bases[c.from-1])}起跑！`); this.steal(c.from,false); },1100); return; }
      if(c&&c.type==='bunt'&&!first){ this.pause(); setTimeout(()=>{ say(`對手${c.kind==='sac'?'犧牲觸擊':'突襲觸擊'}！`); this.bunt(c.kind,false); },1100); return; }
      if(c&&c.type==='hitrun'){ CUR_CTX.hitRun=true; setTimeout(()=>say('對手下達打帶跑。'),900); } }
    if(fd.abbr!==g.user){ const d=cpuDefense(g);
      if(d&&d.type==='ibb'&&!first){ this.pause(); setTimeout(()=>{ say(`對手選擇故意四壞，保送${nameOf(curBatter(g))}。`); this.ibb(false); },1100); return; }
      if(d&&d.type==='def'){ CUR_CTX.def=d.def; CUR_CTX.keepDef=false; setTimeout(()=>say(`對手採取${[d.def.infieldIn&&'前進守備',d.def.shift&&'拉打布陣'].filter(Boolean).join('、')}。`),1000); } }
  },
  // 關鍵時刻與能力發動的特寫（每個打席最多一次）
  cutin(idx,pitchMoment){
    if(this.cutPA===idx || this.skipping) return; const g=GM, bid=curBatter(g), br=bat(bid), pid=curPitcher(g), pr=pit(pid);
    const t=batting(g), f=fielding(g), diff=t.runs-f.runs, risp=!!(g.bases[1]||g.bases[2]);
    let c=null;
    // 決勝球特寫：投手有奪三振類能力，而且（得點圈有人或打者是強打），同一位投手每場最多 2 次
    g.cutPit=g.cutPit||{};
    if(pitchMoment){ const a=pr.ab.find(x=>['pk_g','pk_b','velo_g'].includes(x.k)); if(a && (g.cutPit[pid]||0)<2 && (risp||br.power>=70)){ g.cutPit[pid]=(g.cutPit[pid]||0)+1; c={kind:'pitch',pid,name:nameOf(pid),subtitle:`${a.name}發動・兩好球`,teamColor:f.T.colors[0]}; } }
    else {
      const a=risp?br.ab.find(x=>['risp_g','risp_b'].includes(x.k)):pr.hand==='L'?br.ab.find(x=>x.k==='vsl_b'):null;
      if(a) c={kind:'ability',pid:bid,name:nameOf(bid),subtitle:`${a.name}發動`,teamColor:t.T.colors[0]};
      else if(g.outs===2&&risp) c={kind:'bat',pid:bid,name:nameOf(bid),subtitle:'兩出局，得點圈有人',teamColor:t.T.colors[0]};
      else if(g.inning>=9&&diff<=0&&diff>=-1) c={kind:'bat',pid:bid,name:nameOf(bid),subtitle:diff===0?'這一棒可以超前':'這一棒可以追平',teamColor:t.T.colors[0]};
    }
    if(!c) return; this.cutPA=idx;
    if(typeof FX!=='undefined'&&FX.cutin){
      // 打席開始的特寫：特寫播完才讓電腦投手開始投（決勝球那種是投球動作中，不擋）
      if(!pitchMoment && G.state==='ready'){ const w=G.waitUntil; G.waitUntil=G.t+99; Promise.resolve(FX.cutin(c)).then(()=>{ if(G.state==='ready') G.waitUntil=G.t+0.5; }); }
      else FX.cutin({...c,ms:900});
    } else if(typeof ssToast==='function') ssToast(`${c.name}｜${c.subtitle}`);
    ACH.onCutin();
  },
  onWindup(){ if(typeof GM==='undefined'||!GM) return; if(GM.strikes===2){ const g=GM; this.cutin(batting(g).idx+(g.half==='top'?0:1000)+g.inning*10000+0.5,true); } }
};
if(typeof document!=='undefined'){
  addEventListener('keydown',e=>{
    if(e.target&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
    if(e.repeat) return;
    if(e.key==='t'||e.key==='T'){ TACTICS.toggle(); }
    else if(e.key==='Escape' && TACTICS.isOpen()) TACTICS.close();
  });
}
