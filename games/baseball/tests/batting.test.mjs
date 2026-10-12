import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
function runtime(){
  let seed=41; const math=Object.create(Math); math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const storage=new Map(),box={Math:math,setTimeout,console,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  box.window=box; const ctx=vm.createContext(box);
  for(const file of ['assets/teams.js','logic.js','season.js','franchise.js']) vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),ctx,{filename:file});
  return {run:code=>vm.runInContext(code,ctx),json:code=>JSON.parse(vm.runInContext('JSON.stringify('+code+')',ctx))};
}
const batter="const br={meet:50,power:55,traj:2,has:()=>false},center={x:0,y:2};";
test('ordinary swings accept both sides of the complete 145ms timing window',()=>{
  const r=runtime(); r.run(batter+'BATTING.assist=false;');
  assert.ok(r.run("contact(br,1,center,center,-.144,'meet')"));
  assert.ok(r.run("contact(br,1,center,center,.144,'meet')"));
  for(const dt of [-.146,.146]) assert.equal(r.run(`contact(br,1,center,center,${dt},'meet')`),null);
  assert.ok(Math.abs(r.run('cursorSize(br,"meet").rx')-(.4+50*.0045)*1.15)<1e-12);
  assert.ok(Math.abs(r.run('cursorSize(br,"power").rx/cursorSize(br,"meet").rx')-.68)<1e-12);
});
test('difficulty levels keep their order with the new batting tolerance',()=>{
  const r=runtime(),windows=['easy','normal','hard'].map(k=>r.run(`diff=DIFF.${k}; battingWindow()`));
  assert.ok(windows[0]>windows[1]&&windows[1]>windows[2]); assert.ok(Math.abs(windows[1]-.145)<1e-12);
});
test('aim assistance rescues a close edge miss without turning it into perfect contact',()=>{
  const r=runtime(); r.run(batter+"const size=cursorSize(br,'meet'),edge={x:size.rx*1.20,y:2}; BATTING.assist=false;");
  assert.equal(r.run("contact(br,1,edge,center,0,'meet')"),null);
  r.run("BATTING.assist=true; const hit=contact(br,1,edge,center,0,'meet');");
  assert.equal(r.run('hit.aim.assisted'),true); assert.ok(r.run('hit.dn>.9&&hit.dn<=1.08&&hit.q<.5'));
  assert.equal(r.run("contact(br,1,{x:size.rx*1.25,y:2},center,0,'meet')"),null);
  assert.equal(r.run("contact(br,1,edge,center,.2,'meet')"),null);
});
test('aim assistance leaves centered input alone and bounds diagonal correction',()=>{
  const r=runtime(); r.run(batter+"const size=cursorSize(br,'meet'),input={...center},a=assistAim(center,input,size.rx,size.ry); const d=1.2/Math.sqrt(2),b=assistAim({x:size.rx*d,y:2+size.ry*d},input,size.rx,size.ry);");
  assert.equal(r.run('a.assisted'),false); assert.deepEqual(r.json('input'),{x:0,y:2});
  assert.ok(Math.abs(r.run('Math.hypot(b.x/size.rx,(b.y-2)/size.ry)')-.16)<1e-12);
});
test('difficulty and the disabled assist setting survive save and campaign changes',()=>{
  const r=runtime(); r.run("diff=DIFF.easy; BATTING.assist=false; ssStore.set(BATTING.KEY,BATTING.settings()); SEASON.start('DET',10); FRANCHISE.start('LAD',30); diff=DIFF.normal; BATTING.assist=true; BATTING.load(ssStore.get(BATTING.KEY,null));");
  assert.deepEqual(r.json('BATTING.settings()'),{v:1,difficulty:'easy',assist:false});
  r.run("BATTING.load({v:1,difficulty:'toString',assist:'false'});"); assert.deepEqual(r.json('BATTING.settings()'),{v:1,difficulty:'normal',assist:true});
});
test('actual windup slows only the human batting pitch and keeps pitch shape and velocity',()=>{
  const r=runtime(),source=fs.readFileSync(new URL('game.js',root),'utf8');
  r.run("const G={mode:'bat',abN:0},GM=newGame('DET','LAD','DET'),FX={resetTrail(){}},$=()=>({classList:{remove(){}}}); function setPanels(){}; function say(){}; const pick=a=>a[0]; const P=buildPitch(pit(curPitcher(GM)).pitches[0],pit(curPitcher(GM)),{x:0,y:2},0,false),duration=P.T;");
  r.run(source.slice(source.indexOf('function startWindup(P){'),source.indexOf('\nconst PLAYER_SWING_RATE')));
  r.run('startWindup(P);'); assert.ok(Math.abs(r.run('G.pitch.T/duration')-1.10)<1e-12);
  assert.equal(r.run('P.T'),r.run('duration')); assert.equal(r.run('G.pitch.mph'),r.run('P.mph')); assert.deepEqual(r.json('G.pitch.B'),r.json('P.B'));
  assert.ok(r.run('battingDeadline(G.pitch)>G.pitch.T*1.065'));
  assert.ok(Math.abs(r.run('battingDeadline(G.pitch)-G.pitch.T')-.145)<1e-12);
  r.run("G.mode='pitch'; startWindup(P);"); assert.equal(r.run('G.pitch.T'),r.run('duration'));
});
test('the aim-assist toggle does not alter full engine simulation results',()=>{
  const a=runtime(),b=runtime(); b.run('BATTING.assist=false;');
  const play="SEASON.start('DET',10); const u=SEASON.userGame(),g=fullSimGame(u.away,u.home,u.spA,u.spH,SEASON);";
  a.run(play); b.run(play); assert.deepEqual(a.json('g.pbp'),b.json('g.pbp'));
});
test('actual swing feedback uses the same tolerance as contact detection',()=>{
  const r=runtime(),source=fs.readFileSync(new URL('feel.js',root),'utf8');
  r.run("const messages=[],rawPlay=()=>{}; function pop(label){messages.push(label);}");
  r.run(source.slice(source.indexOf('  function onSwing('),source.indexOf('  // 擦邊好球')));
  r.run("onSwing(null,.12,'meet',{x:0,y:2}); onSwing({q:.5,dn:.6,spray:0},.055,'meet',{x:0,y:2}); onSwing(null,.16,'meet',{x:0,y:2});");
  assert.deepEqual(r.json('messages'),['沒碰到','剛好！','太晚了']);
});
