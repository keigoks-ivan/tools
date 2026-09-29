"""破壞碰撞、主遊戲第 3 關及連續步態畫面的本機驗證。"""
from pathlib import Path
import json, subprocess, sys
from playwright.sync_api import sync_playwright
repo=next(p for p in [Path.cwd(), *Path(__file__).resolve().parents] if (p/'game/mech').is_dir()); phase=sys.argv[1] if len(sys.argv)>1 else 'after'
out=repo/'game/mech/zero/dev/shots-codex'/('round2-'+phase);out.mkdir(parents=True,exist_ok=True)
control="""window.__raf=[];window.requestAnimationFrame=f=>{__raf.push(f);return __raf.length};window.cancelAnimationFrame=()=>{};window.__step=(n=1)=>{for(let i=0;i<n;i++){const q=__raf.splice(0);for(const f of q)f(performance.now())}};Math.random=(()=>{let n=917;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}})();"""
errors=[]; result={}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'])
 pg=browser.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1);pg.add_init_script(control)
 pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 if phase=='before':
  for path in ['anim.js','mechs.js','post.js','cockpit.js']:
   text=subprocess.check_output(['git','show','2c976d8:game/mech/'+path],cwd=repo).decode();pg.route('**/mech/'+path,lambda r,req,body=text:r.fulfill(status=200,content_type='application/javascript',body=body))
 pg.goto('http://localhost:8951/game/mech/?all&mute&fps=0',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__game',polling=100,timeout=120000)
 pg.evaluate("async()=>{window.T=await import('three');T.Clock.prototype.getDelta=()=>1/60;__game.input.lock=()=>{};__game.launch(3);__game.fake={mx:0,my:0,lookX:0,lookY:0};__game.run(6)}")
 pg.screenshot(path=str(out/'cockpit-stage3.png'))
 result['stage3']=pg.evaluate("()=>({state:__game.state,stage:__game.combat.stage,finite:__game.hero.bones.ankleR.matrixWorld.elements.every(Number.isFinite),render:{...__game.post.renderer.info.render}})")
 assert result['stage3']['state']=='play' and result['stage3']['stage']==3
 pg.evaluate("()=>{__game.player.pitch=-0.45;__game.run(.5)}");pg.screenshot(path=str(out/'cockpit-console.png'))
 pg.goto('http://localhost:8951/game/mech/?show=hero&oy=1.0&od=29&oh=8.6&mode=2&mute',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__mechs',polling=100,timeout=120000)
 pg.evaluate("async()=>{const T=await import('three');T.Clock.prototype.getDelta=()=>1/60;document.querySelector('#title').style.display='none';__step(90)}")
 seq=out/'walk';seq.mkdir(exist_ok=True)
 pg.set_viewport_size({'width':1280,'height':720})
 for i in range(48):pg.evaluate('__step(5)');pg.screenshot(path=str(seq/f'{i:03}.png'))
 if phase=='after':
  pg.set_viewport_size({'width':1920,'height':1080})
  pg.goto('http://localhost:8951/game/mech/zero/?ch=1&god&mute',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__G?.playing',polling=100,timeout=120000)
  pg.evaluate("async()=>{window.T=await import('three');T.Clock.prototype.getDelta=()=>1/60;__step(60)}")
  result['surfaces']=pg.evaluate("()=>({glass:__G.destruct.surfaces.filter(o=>o.surface.kind==='glass').length,walls:__G.destruct.surfaces.filter(o=>o.surface.kind==='wall').length})")
  pg.evaluate("()=>{__G.player.frozen=true;window.glass=__G.destruct.surfaces.find(o=>o.surface.kind==='glass'&&o.pos.z>-60&&o.pos.z<0&&o.surface.bounds.z1-o.surface.bounds.z0<.1);__G.player.pos.set(glass.pos.x,0,glass.pos.z+3);__G.player.yaw=Math.PI;__G.player.pitch=0;__step(2)}")
  pg.screenshot(path=str(out/'glass-before.png'))
  result['glass']=pg.evaluate("()=>{const p=glass.pos.clone(),o=p.clone().add(new T.Vector3(0,0,1)),d=new T.Vector3(0,0,-1),before=__G.solid.ray(o,d,2);__G.destruct.hit(glass,30,p,d);const after=__G.solid.ray(o,d,2);__step(6);return {hitBefore:before?.b===glass.box,removed:!glass.alive&&glass.box.dead,clearAfter:after?.b!==glass.box,shards:__G.destruct.debris.list.filter(d=>d.mat==='glass').length}}")
  pg.screenshot(path=str(out/'glass-after.png'))
  result['wall']=pg.evaluate("()=>{window.wall=__G.destruct.surfaces.find(o=>o.surface.kind==='wall'&&o.pos.z>-60&&o.pos.z<0&&o.box&&o.surface.bounds.z1-o.surface.bounds.z0<.35&&o.surface.bounds.x1-o.surface.bounds.x0>2&&o.surface.bounds.y1>2.5);const p=wall.pos.clone();p.y=1.55;window.wallPoint=p;__G.player.pos.set(p.x,0,p.z+3);__G.player.yaw=Math.PI;__G.player.pitch=0;__step(2);return {position:p.toArray(),before:__G.solid.ray(p.clone().add(new T.Vector3(0,0,-1)),new T.Vector3(0,0,1),2)?.b===wall.box}}")
  pg.screenshot(path=str(out/'wall-before.png'))
  result['wall'].update(pg.evaluate("()=>{const p=wallPoint,dir=new T.Vector3(0,0,1);__G.destruct.hit(wall,110,p,dir);const center=__G.solid.ray(p.clone().add(new T.Vector3(0,0,-1)),dir,2),edge=__G.solid.ray(p.clone().add(new T.Vector3(.75,0,-1)),dir,2);__step(70);return {holeClear:!center,edgeBlocked:!!edge,parts:wall.parts.length,pairedSurfaces:__G.destruct.surfaces.filter(o=>o.changed).length,batches:__G.destruct.surfaceBatches.size}}"))
  pg.screenshot(path=str(out/'wall-after.png'))
  result['deaths']=pg.evaluate('''async()=>{const {Soldier}=await import('./human.js');const cases=[['head',-1,'DeathA'],['chest',1,'DeathB'],['chest',-1,'Death']];return cases.map(([part,z,expected])=>{const s=new Soldier(__G.kit,'trooper');s.update(1/60);s.die(new T.Vector3(0,0,z),1,part,__G.solid);const selected=s.death.clip;for(let i=0;i<180;i++)s.update(1/60);return {expected,selected,rag:!!s.rag,finite:Array.from(s.rag.p).every(Number.isFinite)}})}''')
  assert all(d['selected']==d['expected'] and d['rag'] and d['finite'] for d in result['deaths']),result['deaths']
  (out/'features.json').write_text(json.dumps(result,indent=2))
  assert all(result['glass'][x] for x in ['hitBefore','removed','clearAfter']) and result['glass']['shards']>0,result
  assert result['wall']['before'] and result['wall']['holeClear'] and result['wall']['edgeBlocked'] and result['wall']['pairedSurfaces']>=2,result
 result['errors']=errors;(out/'features.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));assert not errors,errors
 browser.close()
