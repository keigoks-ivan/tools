import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
function runtime(storage=new Map()){
  let seed=41; const math=Object.create(Math); math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const box={Math:math,setTimeout,console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  box.window=box; const context=vm.createContext(box);
  for(const file of ['assets/teams.js','logic.js','season.js','franchise.js','franchise-ui.js']) vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),context,{filename:file});
  return {storage,run:code=>vm.runInContext(code,context),json:code=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',context))};
}
test('162-game calendar has one fixture per club per day and stable three-game series',()=>{
  const r=runtime(); const calendar=r.json('seasonCalendar(162)');
  for(const fixtures of calendar){ assert.equal(fixtures.length,15); const teams=fixtures.flat(); assert.equal(new Set(teams).size,30); }
  for(let d=0;d<162;d+=3){ assert.deepEqual(calendar[d],calendar[d+1]); assert.deepEqual(calendar[d],calendar[d+2]); }
  assert.deepEqual(calendar,r.json('seasonCalendar(162)')); assert.notDeepEqual(calendar,r.json('seasonCalendar(162,2027)'));
  const homes=new Map(); for(const day of calendar) for(const [,home] of day) homes.set(home,(homes.get(home)||0)+1);
  assert.ok(Math.min(...homes.values())>=70); assert.ok(Math.max(...homes.values())<=92);
  const short=r.json('seasonCalendar(30)'); const shortHomes=new Map(); for(const day of short) for(const [,home] of day) shortHomes.set(home,(shortHomes.get(home)||0)+1);
  assert.ok(Math.min(...shortHomes.values())>=12); assert.ok(Math.max(...shortHomes.values())<=18);
});
test('season and franchise save independently and reload custom rosters',()=>{
  const r=runtime(); r.run("SEASON.start('DET',30); FRANCHISE.start('LAD',10); FRANCHISE.moveLineup(0,1); FRANCHISE.season.simUserGame();");
  assert.equal(r.run('SEASON.st.day'),0); assert.equal(r.run('FRANCHISE.season.st.day'),1);
  const saved=r.json('FRANCHISE.st'),next=runtime(r.storage); next.run('SEASON.load(); FRANCHISE.load();');
  assert.deepEqual(next.json('FRANCHISE.st'),saved); assert.equal(next.run('SEASON.st.user'),'DET'); assert.equal(next.run('FRANCHISE.season.st.user'),'LAD');
});
test('lineup replacements validate defensive position and enter actual games',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',30); const ft=FRANCHISE.team('DET'); const reserve=ft.bench.find(id=>ft.lineup.some(l=>frCanPlay(id,l.pos))); const slot=ft.lineup.findIndex(l=>frCanPlay(reserve,l.pos));");
  const original=r.json('TEAMS'); assert.equal(r.run('FRANCHISE.promote(reserve,slot)'),'');
  assert.equal(r.run("newGame('DET','LAD','DET',null,null,FRANCHISE.context).away.lineup[slot].id===reserve"),true);
  assert.equal(r.run('FRANCHISE.promote(99999,slot)'), '球員無法擔任這個守位。');
  r.run('FRANCHISE.moveLineup(slot,slot===8?-1:1)'); assert.equal(r.run("newGame('DET','LAD','DET',null,null,FRANCHISE.context).away.lineup.some(l=>l.id===reserve)"),true);
  assert.deepEqual(r.json('TEAMS'),original); assert.equal(r.run("newGame('DET','LAD','DET').away.lineup[slot].id===reserve"),false);
});
test('trade updates both clubs, preserves exclusivity and charges once',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',30); const f=FRANCHISE,offer=f.team('DET').bench[0]; const targets=TEAMS.filter(t=>t.abbr!=='DET').flatMap(t=>frIDs(f.team(t.abbr)).map(id=>({id,abbr:t.abbr,q:f.quote(offer,id,t.abbr)}))).filter(x=>!x.q.error&&x.q.fee<f.st.cash); const target=targets[0],before=f.st.cash;");
  assert.equal(r.run('f.trade(offer,target.id,target.abbr)'),'');
  assert.equal(r.run("frIDs(f.team('DET')).includes(target.id)&&!frIDs(f.team('DET')).includes(offer)"),true);
  assert.equal(r.run("frIDs(f.team(target.abbr)).includes(offer)&&!frIDs(f.team(target.abbr)).includes(target.id)"),true);
  assert.ok(Math.abs(r.run('before-f.st.cash-target.q.fee'))<.01);
  assert.equal(r.run("newGame('DET',target.abbr,'DET',null,null,f.context).away.T.bench.includes(target.id)"),true);
  assert.ok(r.run('f.trade(offer,target.id,target.abbr)').length); assert.ok(Math.abs(r.run('before-f.st.cash-target.q.fee'))<.01);
  assert.equal(r.run('new Set(TEAMS.flatMap(t=>frIDs(f.team(t.abbr)))).size===TEAMS.reduce((n,t)=>n+frIDs(f.team(t.abbr)).length,0)'),true);
  r.run('f.season.st.day=21'); assert.match(r.run('f.quote(target.id,offer,target.abbr).error'),/截止/);
});
test('training affects physics, cursor, running and quick profiles without modifying MLB data',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',30); const id=FRANCHISE.team('DET').lineup[0].id,sp=FRANCHISE.team('DET').rotation[0],rawB=frBase('bat',id),rawP=frBase('pit',sp); const baseData=JSON.stringify(PLAYERS);");
  assert.equal(r.run("FRANCHISE.train(id,'meet')"),''); assert.match(r.run("FRANCHISE.train(id,'power')"),/每 7 場/);
  r.run('FRANCHISE.season.st.day=7'); assert.equal(r.run("FRANCHISE.train(id,'speed')"),'');
  r.run('FRANCHISE.season.st.day=14'); assert.equal(r.run("FRANCHISE.train(id,'power')"),'');
  assert.equal(r.run("FRANCHISE.train(sp,'velo')"),'');
  r.run("newGame('DET','LAD','DET',sp,null,FRANCHISE.context)");
  assert.equal(r.run('bat(id).meet'),r.run('rawB.meet+2')); assert.ok(r.run('bat(id).sprint>rawB.sprint&&bat(id).hp1b<rawB.hp1b&&bat(id).power>rawB.power'));
  assert.ok(r.run('pit(sp).pitches[0].mph>rawP.pitches[0].mph'));
  assert.ok(r.run('buildPitch(pit(sp).pitches[0],pit(sp),{x:0,y:2},0,false).mph>rawP.pitches[0].mph'));
  assert.ok(r.run('qBat(id).hr>QCACHE["b"+id].hr'));
  assert.equal(r.run('JSON.stringify(PLAYERS)===baseData'),true);
  r.run("newGame('DET','LAD','DET')"); assert.equal(r.run('bat(id).meet'),r.run('rawB.meet')); assert.equal(r.run('pit(sp).pitches[0].mph'),r.run('rawP.pitches[0].mph'));
});
test('finances and stats settle once for a completed played game',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',10); const S=FRANCHISE.season,u=S.userGame(),g=fullSimGame(u.away,u.home,u.spA,u.spH,S); const initial=FRANCHISE.st.cash; S.finishUserGame(g,true); const cash=FRANCHISE.st.cash,stats=JSON.stringify(S.st.stats); S.finishUserGame(g,true);");
  assert.equal(r.run('S.st.day'),1); assert.equal(r.run('FRANCHISE.st.cash'),r.run('cash')); assert.equal(r.run('JSON.stringify(S.st.stats)===stats'),true);
  assert.equal(r.run('S.st.results.length'),1); assert.ok(r.run('FRANCHISE.st.ledger.length>=3')); assert.ok(r.run('initial!==cash'));
  r.run("const incomplete=newGame(u.away,u.home,'DET');"); assert.equal(r.run('S.finishUserGame(incomplete,true)'),null); assert.equal(r.run('S.st.day'),1);
});
test('bullpen rest advances through postseason rather than locking the last regular-season relievers',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',10); const S=FRANCHISE.season,pen=S.team('DET').bullpen[0]; S.st.day=10; S.st.phase='playoffs'; S.st.rec.DET.gp=10; S.st.pitchGames.DET=10; S.st.lastP={[pen]:9}; const g=newGame('DET','LAD',null,null,null,S.context()); g.campaign=S; restPen(g);");
  assert.equal(r.run('g.away.usedPen.includes(pen)'),true);
  r.run("g.pbp=[{pitcher:S.team('DET').rotation[0],team:'LAD'},{pitcher:S.team('LAD').rotation[0],team:'DET'}]; S.markPitchers(g); const next=newGame('DET','LAD',null,null,null,S.context()); next.campaign=S; restPen(next);");
  assert.equal(r.run('next.away.usedPen.includes(pen)'),false);
});
test('division winners seed ahead of wild cards and 12-team bracket completes all four rounds',()=>{
  const r=runtime(); r.run("SEASON.start('DET',162); for(const t of TEAMS) SEASON.st.rec[t.abbr]={w:70,l:92,rs:600,ra:620,gp:162}; SEASON.st.rec.NYY.w=100; SEASON.st.rec.BOS.w=110; SEASON.st.rec.CLE.w=90; SEASON.st.rec.HOU.w=85; SEASON.st.rec.DET.w=1; SEASON.startPlayoffs();");
  assert.deepEqual(r.json('SEASON.st.po.seeds.AL.slice(0,3)'),['BOS','CLE','HOU']); assert.equal(r.run('SEASON.st.po.seeds.AL[3]'),'NYY');
  assert.equal(r.run('SEASON.st.phase'),'done'); assert.equal(r.run('SEASON.st.po.done.length'),11);
  assert.equal(r.run('new Set(SEASON.st.po.done.map(s=>s.round)).size'),4);
  const counts=r.json('SEASON.st.po.done.map(s=>s.bestOf)'); assert.equal(counts.filter(n=>n===3).length,4); assert.equal(counts.filter(n=>n===5).length,4); assert.equal(counts.filter(n=>n===7).length,3);
  assert.deepEqual(r.json("Array.from({length:5},(_,n)=>seriesMatch({teams:['A','B'],wins:[n,0],bestOf:5,round:1},12).home)"),['A','A','B','B','A']);
});
test('a complete franchise season keeps every result and can continue into another season',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',30); const F=FRANCHISE,S=F.season,id=F.team('DET').lineup[0].id; F.train(id,'meet'); for(let i=0;i<30;i++) S.simUserGame(); let guard=0; while(S.st.phase==='playoffs'&&guard++<30) S.simUserGame();");
  assert.equal(r.run('S.st.phase'),'done'); assert.equal(r.run("S.st.results.filter(g=>g.phase==='regular').length"),30);
  assert.equal(r.run('Object.values(S.st.rec).every(r=>r.gp===30&&r.w+r.l===30)'),true);
  assert.equal(r.run('Object.values(S.st.rec).reduce((n,r)=>n+r.w,0)'),450); assert.equal(r.run('F.st.history.length'),1);
  r.run('const priorCash=F.st.cash,priorRoster=JSON.stringify(F.st.clubs),priorDev=JSON.stringify(F.st.dev);');
  assert.equal(r.run('F.nextYear()'),''); assert.equal(r.run('F.st.year'),2027); assert.equal(r.run('S.st.day'),0); assert.ok(Math.abs(r.run('F.st.cash-priorCash-40'))<.01);
  assert.equal(r.run('JSON.stringify(F.st.clubs)===priorRoster&&JSON.stringify(F.st.dev)===priorDev'),true); assert.equal(r.run('Object.keys(S.st.stats).length'),0);
  assert.ok(r.run('FRUI.html().includes("2027")')); for(const tab of ['roster','market','training','finance','league']) assert.ok(r.run('FRUI.'+tab+'().length')>100);
});
test('old season save retains its original schedule and playoff bracket',()=>{
  const r=runtime(); r.run("SEASON.start('DET',10); const old=SEASON.st; delete old.calendar; delete old.format; delete old.results; old.v=1; SEASON.save(); SEASON.load(); const schedule=JSON.stringify(SEASON.pairings(0));");
  assert.equal(r.run('JSON.stringify(SEASON.pairings(0))===schedule'),true); assert.equal(r.run('SEASON.st.v'),1);
  r.run('for(let i=0;i<10;i++) SEASON.simUserGame(); while(SEASON.st.phase===\'playoffs\') SEASON.simUserGame();');
  assert.equal(r.run('SEASON.st.phase'),'done'); assert.equal(r.run('SEASON.st.po.done.length'),5);
});
test('live campaign stats include the current game exactly once and postseason stats stay separate',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',10); const S=FRANCHISE.season,u=S.userGame(),g=newGame(u.away,u.home,'DET',u.spA,u.spH,S.context()); g.campaign=S; const id=curBatter(g); applyResult(g,{kind:'HR',text:'全壘打'}); const current=campaignStats(g,id);");
  assert.equal(r.run('current.hr'),1); assert.equal(r.run('current.h'),1); assert.equal(r.run('Object.keys(S.st.stats).length'),0);
  r.run('addGameStats(S.st.stats,g); g.campaignRecorded=true;'); assert.equal(r.run('campaignStats(g,id).hr'),1);
  r.run('const before=JSON.stringify(S.st.stats); addGameStats(S.playoffStats(),g);'); assert.equal(r.run('JSON.stringify(S.st.stats)===before'),true);
  assert.equal(r.run('S.st.poStats[id].hr'),1);
});
test('all 30 clubs complete a 162-game season with 2430 decisions and every user result saved',()=>{
  const r=runtime(); r.run("SEASON.start('DET',162); for(let n=0;n<162;n++) SEASON.simUserGame();");
  assert.equal(r.run('SEASON.st.day'),162); assert.equal(r.run('SEASON.st.results.length'),162);
  assert.equal(r.run('Object.values(SEASON.st.rec).every(r=>r.gp===162&&r.w+r.l===162)'),true);
  assert.equal(r.run('Object.values(SEASON.st.rec).reduce((n,r)=>n+r.w,0)'),2430);
  assert.equal(r.run('SEASON.st.results.every(g=>g.a!==g.h)'),true);
  const reload=runtime(r.storage); reload.run('SEASON.load();'); assert.equal(reload.run('SEASON.st.day'),162);
  assert.deepEqual(reload.json('SEASON.st.rec'),r.json('SEASON.st.rec'));
});
test('storage failure is reported while gameplay remains usable',()=>{
  const r=runtime(); r.run("localStorage.setItem=()=>{throw new Error('quota');}; FRANCHISE.start('DET',10); FRANCHISE.season.simUserGame();");
  assert.equal(r.run('FRANCHISE.saveOK'),false); assert.equal(r.run('FRANCHISE.season.st.day'),1);
  assert.ok(r.run('FRUI.html().includes("無法保存")'));
});
test('standings and playoff seeds resolve tied records in the same order',()=>{
  const r=runtime(); r.run("SEASON.start('DET',10); for(const t of TEAMS) SEASON.st.rec[t.abbr]={w:5,l:5,gp:10,rs:40,ra:40}; SEASON.st.rec.MIN.rs=100;");
  const first=r.run('SEASON.standings().AL中區[0].a'); r.run('SEASON.startPlayoffs();');
  assert.equal(first,'MIN'); assert.equal(first,r.run('SEASON.st.po.seeds.AL.find(a=>SS_DIV.AL中區.includes(a))'));
});
test('new short seasons give every club the same home dates without altering saved calendars',()=>{
  const r=runtime();
  for(const year of [2026,2027,2054]) for(const games of [10,30]){
    const calendar=r.json(`seasonCalendar(${games},${year})`),homes=new Map();
    assert.equal(calendar.length,games);
    for(const day of calendar){ assert.equal(new Set(day.flat()).size,30); for(const [,home] of day) homes.set(home,(homes.get(home)||0)+1); }
    assert.ok([...homes.values()].every(n=>n===games/2));
  }
  r.run("SEASON.start('DET',10); const saved=JSON.stringify(SEASON.st.calendar); SEASON.save(); SEASON.load();");
  assert.equal(r.run('JSON.stringify(SEASON.st.calendar)===saved'),true);
});
test('the automatic schedule page includes the next fixture on each page boundary',()=>{
  const r=runtime(); r.run("SEASON.start('DET',30); SEASON.st.day=10;");
  assert.match(r.run('SSUI.scheduleHTML()'),/11・下一場/);
  r.run('SEASON.st.day=20;'); assert.match(r.run('SSUI.scheduleHTML()'),/21・下一場/);
});
test('new-year and new-club views do not retain postseason or another club market filters',async()=>{
  const r=runtime(); r.run("document={querySelector:()=>({scrollTop:0}),getElementById:()=>null}; FRANCHISE.start('DET',10); FRUI.statView='po'; FRANCHISE.season.st.phase='done'; FRANCHISE.nextYear();");
  assert.ok(!r.run("FRUI.league().includes('我方季後賽')"));
  r.run("FRUI.marketTeam='LAD'; FRUI.newTeam='LAD'; FRUI.newGames=10; FRUI.statView='po'; FRUI.benchSlots={123:8};"); await r.run("FRUI.act('start','')");
  assert.equal(r.run('FRUI.marketTeam'),''); assert.equal(r.run('FRUI.statView'),'reg'); assert.equal(r.run('Object.keys(FRUI.benchSlots).length'),0);
});
test('incomplete saves cannot crash menus or overwrite the original data during load',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',10); const broken=JSON.parse(JSON.stringify(FRANCHISE.st)); delete broken.clubs.DET.rotation; localStorage.setItem(FRANCHISE.KEY,JSON.stringify(broken));");
  const original=r.storage.get('pawa_franchise_v1'); assert.doesNotThrow(()=>r.run('FRANCHISE.load()'));
  assert.equal(r.run('FRANCHISE.st'),null); assert.equal(r.storage.get('pawa_franchise_v1'),original); assert.ok(r.run('FRUI.html().includes("存檔")'));
  r.run("SEASON.start('DET',10); const brokenSeason=JSON.parse(JSON.stringify(SEASON.st)); delete brokenSeason.rec.DET; localStorage.setItem(SEASON.KEY,JSON.stringify(brokenSeason));");
  const seasonOriginal=r.storage.get('pawa_season_v1'); assert.doesNotThrow(()=>r.run('SEASON.load()'));
  assert.equal(r.run('SEASON.st'),null); assert.equal(r.storage.get('pawa_season_v1'),seasonOriginal); assert.ok(r.run('SSUI.seasonHTML().includes("存檔格式")'));
  r.run("SEASON.start('DET',10); SEASON.st.stats={123:null}; SEASON.save();"); assert.doesNotThrow(()=>r.run('SEASON.load()')); assert.equal(r.run('SEASON.st'),null);
  r.run("FRANCHISE.start('DET',10); FRANCHISE.st.history=[{year:2026,champ:'missing',w:5,l:5}]; FRANCHISE.save();"); assert.doesNotThrow(()=>r.run('FRANCHISE.load()')); assert.equal(r.run('FRANCHISE.st'),null);
});
test('training cannot charge for stamina already at the ability cap',()=>{
  const r=runtime(); r.run("const club=TEAMS.find(t=>t.rotation.concat(t.bullpen).some(id=>frBase('pit',id).stamina===100)); FRANCHISE.start(club.abbr,162); const capped=FRANCHISE.team(club.abbr).rotation.concat(FRANCHISE.team(club.abbr).bullpen).find(id=>frBase('pit',id).stamina===100),money=FRANCHISE.st.cash;");
  assert.match(r.run("FRANCHISE.train(capped,'stamina')"),/100/); assert.equal(r.run('FRANCHISE.st.cash'),r.run('money')); assert.equal(r.run('FRANCHISE.st.dev[capped]'),undefined);
});
test('reliever stamina training adds less endurance than the same gain for a starter',()=>{
  const r=runtime(); r.run("FRANCHISE.start('DET',162); const T=FRANCHISE.team('DET'),sp=T.rotation.find(id=>frBase('pit',id).starter&&frBase('pit',id).stamina<88),rp=T.bullpen.find(id=>!frBase('pit',id).starter&&frBase('pit',id).stamina<88); const spLimit=frBase('pit',sp).limit,rpLimit=frBase('pit',rp).limit; FRANCHISE.st.facilities.training=3; for(let n=0;n<4;n++){ FRANCHISE.season.st.day=n*7; FRANCHISE.train(sp,'stamina'); FRANCHISE.train(rp,'stamina'); } LEAGUE_CTX=FRANCHISE.context;");
  assert.ok(r.run('pit(rp).limit-rpLimit<pit(sp).limit-spLimit'));
});
test('HUD shows later rotation pitchers as starters when relievers are resting',()=>{
  const r=runtime(),source=fs.readFileSync(new URL('game.js',root),'utf8');
  r.run("const nodes={}; const $=id=>nodes[id]||(nodes[id]={style:{},classList:{toggle(){}},after(){}}); const POS_ZH={}; const dispName=nameOf,gl=grade,fmt3=n=>String(n); const C={}; function setHeatPanel(){}; const GM=newGame('DET','LAD','DET',null,TEAM('LAD').rotation[1]); GM.home.usedPen=[TEAM('LAD').bullpen[0]];");
  r.run(source.slice(source.indexOf('function setPanels(){'),source.indexOf('\nfunction say(',source.indexOf('function setPanels(){')))); r.run('setPanels();');
  assert.equal(r.run("nodes.pRole.textContent"),'對手・先發');
});
