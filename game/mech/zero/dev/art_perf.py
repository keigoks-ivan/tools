import json,statistics,pathlib,subprocess
from playwright.sync_api import sync_playwright
repo=next(p for p in [pathlib.Path.cwd(), *pathlib.Path(__file__).resolve().parents] if (p / 'game/mech').is_dir());report={}
with sync_playwright() as p:
 for phase in ['before','after']:
  b=p.chromium.launch(headless=True,args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']);pg=b.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1)
  if phase=='before':
   for file in ['human.js','ai.js','viewmodel.js','guns.js','props.js','map.js','kit.js']:
    content=subprocess.check_output(['git','show','1281e6f:game/mech/zero/'+file],cwd=repo).decode();pg.route('**/zero/'+file,lambda route,request,body=content:route.fulfill(status=200,content_type='application/javascript',body=body))
   content=subprocess.check_output(['git','show','1281e6f:game/mech/mechs.js'],cwd=repo).decode();pg.route('**/mech/mechs.js',lambda route,request,body=content:route.fulfill(status=200,content_type='application/javascript',body=body))
  pg.goto('http://localhost:8951/game/mech/zero/?ch=1&god&mute',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__G?.playing',polling=100)
  pg.evaluate('()=>{__G.player.frozen=true;__G.enemies.forEach(e=>e.update=()=>{});}');report[phase]={}
  for name,pos,yaw,pitch in [('alley',[-91.5,0,-84],0,0),('square',[-84,0,-53],0.65,0),('hangar',[40,0,78],0,0.3)]:
   pg.evaluate('([p,y,a])=>{__G.player.pos.set(...p);__G.player.yaw=y;__G.player.pitch=a;__G.enemies.forEach(e=>e.update=()=>{});}',[pos,yaw,pitch]);pg.wait_for_timeout(300)
   result=pg.evaluate('''async()=>{let times=[],previous;for(let i=0;i<100;i++){const t=await new Promise(requestAnimationFrame);if(previous!==undefined)times.push(t-previous);previous=t}const gl=__renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return {times,gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown'}}''');ts=result['times'][10:];report[phase][name]={'medianFrameMs':statistics.median(ts),'p95FrameMs':sorted(ts)[int(len(ts)*.95)],'gpu':result['gpu']}
  b.close()
print(json.dumps(report,indent=2));(repo/'game/mech/zero/dev/shots-codex/performance.json').write_text(json.dumps(report,indent=2))
