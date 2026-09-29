"""固定時間步進，逐段確認正式關卡推進與結尾跳轉，不改遊戲流程。"""
import json,pathlib
from playwright.sync_api import sync_playwright
repo=next(p for p in [pathlib.Path.cwd(), *pathlib.Path(__file__).resolve().parents] if (p / 'game/mech').is_dir());out=repo/'game/mech/zero/dev/shots-codex';errors=[];checks=[]
(out/'verified-after').mkdir(parents=True,exist_ok=True)
init='''window.__raf=[];window.requestAnimationFrame=(fn)=>{__raf.push(fn);return __raf.length};window.cancelAnimationFrame=()=>{};window.__step=(n=1)=>{for(let i=0;i<n;i++){const q=__raf.splice(0);for(const f of q)f(performance.now())}};'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']);pg=b.new_page(viewport={'width':1920,'height':1080});pg.add_init_script(init)
 pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 pg.goto('http://localhost:8951/game/mech/zero/?ch=1&god&mute',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__G?.playing',timeout=120000)
 pg.evaluate("async()=>{window.T=await import('three');T.Clock.prototype.getDelta=()=>1/60;__step(2)}")
 def tp(x,z,y=0):pg.evaluate('p=>{__G.player.pos.set(...p);__G.player.vel.set(0,0,0);__step(3)}',[x,y,z])
 def fight(id,x,z,count):
  tp(x,z)
  alive=pg.evaluate('__G.enemies.filter(e=>!e.dead).length');assert alive==count,(id,alive,count,pg.evaluate('__G.objText'))
  pg.evaluate("()=>{for(const e of __G.enemies)if(!e.dead)e.damage(9999,new T.Vector3(0,0,-1),'head',__G.player.pos);__step(2)}")
  checks.append({'encounter':id,'enemies':alive,'next':pg.evaluate('__G.objText')});print(id,'passed',flush=True)
 fight('B',-91.5,-84,2);fight('C',-90,-58,6)
 tp(-55,-42);assert 'CHAPTER 2' in pg.evaluate('__G.chapterTag');checks.append({'chapter':2})
 fight('D',-43,-42,7);fight('E',28,-22,8)
 tp(28,22);assert 'CHAPTER 3' in pg.evaluate('__G.chapterTag');checks.append({'chapter':3})
 fight('F',28,27,6);fight('G1',32,55,8);fight('G2',40,70,6)
 tp(40,97.8,12.4);pg.evaluate('__step(165)');prompt=pg.evaluate('__G.hud.prompt');assert prompt and 'E' in prompt,prompt
 pg.screenshot(path=str(out/'verified-after/hatch-open.png'))
 pg.keyboard.down('e');pg.evaluate('__step(1)');pg.keyboard.up('e')
 for i in range(7):pg.evaluate('__step(60)')
 pg.wait_for_url('**/game/mech/?zero=1',timeout=30000);pg.wait_for_function('window.__game',timeout=120000,polling=100);pg.evaluate("async()=>{const T=await import('three');T.Clock.prototype.getDelta=()=>1/60;__step(3)}")
 checks.append({'handoff':pg.url});assert not errors,errors
 result={'passed':True,'encounters':7,'chapterTransitions':2,'checks':checks,'errors':errors};(out/'regression.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));b.close()
