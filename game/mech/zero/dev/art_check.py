import json,sys,pathlib,subprocess,statistics
from playwright.sync_api import sync_playwright
phase=sys.argv[1] if len(sys.argv)>1 else 'after'
repo=next(p for p in [pathlib.Path.cwd(), *pathlib.Path(__file__).resolve().parents] if (p / 'game/mech').is_dir());out=repo/'game/mech/zero/dev/shots-codex'/('verified-'+phase);out.mkdir(parents=True,exist_ok=True)
errors=[]; metrics={}
controlled='''window.__raf=[];window.requestAnimationFrame=(fn)=>{__raf.push(fn);return __raf.length};window.cancelAnimationFrame=()=>{};window.__step=(n=1)=>{for(let i=0;i<n;i++){const q=__raf.splice(0);for(const f of q)f(performance.now());}};Math.random=(()=>{let s=917;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}})();'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'])
 pg=b.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1)
 pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 if phase=='before':
  for file in ['human.js','ai.js','viewmodel.js','guns.js','props.js','map.js','kit.js']:
   content=subprocess.check_output(['git','show','1281e6f:game/mech/zero/'+file],cwd=repo).decode()
   pg.route('**/zero/'+file,lambda route,request,body=content:route.fulfill(status=200,content_type='application/javascript',body=body))
  content=subprocess.check_output(['git','show','1281e6f:game/mech/mechs.js'],cwd=repo).decode()
  pg.route('**/mech/mechs.js',lambda route,request,body=content:route.fulfill(status=200,content_type='application/javascript',body=body))
 pg.add_init_script(controlled)
 pg.goto('http://localhost:8951/game/mech/zero/?ch=1&god&mute',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__G?.playing',timeout=120000)
 pg.evaluate("async()=>{const T=await import('three');window.T=T;T.Clock.prototype.getDelta=()=>1/60;__step(60)}")
 for name,pos,yaw,pitch in [('alley',[-91.5,0,-84],0,0),('square',[-84,0,-53],0.65,0),('hangar',[40,0,78],0,0.3),('hatch',[40,12.4,97.8],0,0)]:
  pg.evaluate('([p,y,a])=>{__G.player.pos.set(...p);__G.player.vel.set(0,0,0);__G.player.yaw=y;__G.player.pitch=a;__step(30)}',[pos,yaw,pitch])
  pg.screenshot(path=str(out/(name+'.png')))
  if name!='hatch':metrics[name]=pg.evaluate('''()=>{const r=__renderer,old=r.info.autoReset;r.info.autoReset=false;__step(1);r.info.reset();__step(1);const result={...r.info.render};r.info.autoReset=old;return result;}''')
 metrics['handsByPose']={}
 pg.evaluate("()=>{__G.player.pos.set(-91.5,0,-84);__G.player.yaw=0;__G.player.pitch=0;__step(1);__G.vm._savedPose=__G.vm._pose;__G.vm._pose=function(){};}")
 for kind in ['rifle','pistol']:
  for state,u in [('hip',-1),('ads',-1),('reload-out',0.22),('reload-in',0.40),('reload-charge',0.61),('sprint',-1),('land',-1)]:
   pg.evaluate('''([kind,state,u])=>{const v=__G.vm;v.cur=kind;for(const k in v.g)v.g[k].visible=k===kind;v.ads=state==='ads'?(kind==='rifle'?0.82:1):0;v.scoped=false;v.sprintK=state==='sprint'?1:0;v.landK=state==='land'?0.8:0;v.reloadT=u<0?-1:u*v.W.reload;v._savedPose(0,0,1);v.reloadT=-1;__step(1);}''',[kind,state,u]);pg.screenshot(path=str(out/(kind+'-'+state+'.png')));metrics['handsByPose'][kind+'-'+state]=pg.evaluate("()=>{const v=__G.vm;return ['Left','Right'].map(side=>v.arms.B[side+'Hand'].getWorldPosition(new T.Vector3()).distanceTo(v.arms.grip[side==='Left'?'L':'R']))}")
 metrics['handError']=pg.evaluate('''()=>{const v=__G.vm;v.cur='rifle';v.ads=v.sprintK=v.landK=0;v._savedPose(0,0,1);return ['Left','Right'].map(side=>({side,meters:v.arms.B[side+'Hand'].getWorldPosition(new T.Vector3()).distanceTo(v.arms.grip[side==='Left'?'L':'R'])}))}''')
 pg.evaluate('''async()=>{const {Soldier}=await import('./human.js'),{makeEnemyRifle}=await import('./guns.js');window.art={T,Soldier,makeEnemyRifle};const c=document.createElement('canvas');c.style='position:fixed;inset:0;z-index:99999;width:100%;height:100%';document.body.append(c);art.r=new T.WebGLRenderer({canvas:c,antialias:true});art.r.setSize(1920,1080);art.r.toneMapping=T.ACESFilmicToneMapping;art.scene=new T.Scene();art.scene.background=new T.Color(0x363e45);art.scene.environment=__scene.environment;art.scene.add(new T.HemisphereLight(0xc1d5e3,0x42382a,2));const sun=new T.DirectionalLight(0xffe0be,3);sun.position.set(2,4,3);art.scene.add(sun);art.cam=new T.PerspectiveCamera(36,1920/1080,0.01,100);art.cam.position.set(2,1.65,3.3);art.cam.lookAt(0,0.95,0);const ground=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0x555b60,roughness:0.9}));ground.rotation.x=-Math.PI/2;art.scene.add(ground);}''')
 metrics['soldiers']={}
 for state in ['stand','crouch','crouch-walk','back','strafe','turn','aim','reload','hit-chest','hit-head','death','death-settled']:
  metrics['soldiers'][state]=pg.evaluate('''state=>{const a=art;if(a.s)a.scene.remove(a.s.root,a.s.weapon);a.s=new a.Soldier(__G.kit,'trooper',{weapon:a.makeEnemyRifle()});a.scene.add(a.s.root,a.s.weapon);a.s.mode=state==='stand'?'patrol':'aim';a.s.crouchT=state.startsWith('crouch')?1:0;if(state==='back')a.s.vel.z=-1.5;if(state==='strafe')a.s.vel.x=1.5;if(state==='crouch-walk')a.s.vel.z=0.66;for(let i=0;i<60;i++)a.s.update(1/60);if(state==='turn'){a.s.aimYaw=1.5;for(let i=0;i<15;i++)a.s.update(1/60)}if(state==='reload'){a.s.reloadT=0.65;a.s.update(0)}if(state.startsWith('hit')){a.s.impact(new T.Vector3(0,0,-1),1,state==='hit-head');for(let i=0;i<8;i++)a.s.update(1/60)}if(state.startsWith('death')){a.s.die(new T.Vector3(0,0,-1),1,'chest',null);for(let i=0;i<(state==='death'?45:240);i++)a.s.update(1/60)}a.r.render(a.scene,a.cam);let finite=true;a.s.root.traverse(o=>{if(o.matrixWorld.elements.some(x=>!Number.isFinite(x)))finite=false});return {finite,feet:['Left','Right'].map(side=>a.s.B[side+'Foot'].getWorldPosition(new T.Vector3()).toArray()),rag:!!a.s.rag}}''',state)
  pg.screenshot(path=str(out/('soldier-'+state+'.png')))
 metrics['clips']=pg.evaluate('Object.keys(__G.kit.clips)')
 # 坡面、受擊與布娃娃盒內修正。
 metrics['motionCheck']=pg.evaluate('''async()=>{const {Solid}=await import('./kit.js');let checks=[];for(const rate of [30,60,120]){const w=new Solid();w.add({x0:-1,x1:1,z0:-1,z1:1,y0:0,y1:0.6,ramp:{axis:'z',dir:1}});const s=new art.Soldier(__G.kit,'trooper',{world:w});s.pos.y=0.3;for(let i=0;i<rate;i++)s.update(1/rate);checks.push({rate,finite:Object.values(s.B).every(b=>b.quaternion.toArray().every(Number.isFinite))});s.die(new T.Vector3(0.5,0,-1),1,'head',w);for(let i=0;i<rate*3;i++)s.update(1/rate);checks.push({rate,ragFinite:!!s.rag&&Array.from(s.rag.p).every(Number.isFinite)});}return checks}''')
 pg.goto('http://localhost:8951/game/mech/?show=all&od=55&oy=0.001&op=0.1&mute',wait_until='networkidle',timeout=120000);pg.wait_for_function('window.__mechs',timeout=120000)
 pg.evaluate("async()=>{const T=await import('three');T.Clock.prototype.getDelta=()=>1/60;document.querySelector('#title').style.display='none';__step(60)}")
 metrics['mechs']=pg.evaluate('''()=>__mechs.map(m=>{let triangles=0,draws=0;m.root.traverseVisible(o=>{if(o.isMesh){triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;draws++}});return {scheme:m.schemeKey,triangles,draws,cockpit:m.cockpitLocal?.toArray()}})''')
 for label,yaw in [('front',0),('side',1.35),('back',3.14)]:
  pg.evaluate('y=>{__show.orbit.yaw=y;__show.orbit.dist=55;__step(1)}',yaw);pg.screenshot(path=str(out/('mechs-'+label+'.png')))
 for index,scheme in enumerate(['hero','grunt','ace','heavy']):
  pg.evaluate('i=>{__mechs.forEach((m,j)=>{m.root.visible=i===j;if(i===j){m.root.position.set(0,0,20);m.home=0}});__show.orbit.dist=30;__show.orbit.h=10;__show.setMode(1)}',index)
  for label,yaw in [('front',0),('side',1.57),('back',3.14)]:
   pg.evaluate('y=>{__show.orbit.yaw=y;__step(1)}',yaw);pg.screenshot(path=str(out/(scheme+'-'+label+'.png')))
  if scheme=='hero':
   pg.evaluate('()=>{__show.orbit.yaw=0.55;__show.orbit.dist=9;__show.orbit.h=2;__step(1)}');pg.screenshot(path=str(out/'hero-feet.png'))
 pg.evaluate('()=>{__mechs.forEach((m,i)=>{m.root.visible=true;m.root.position.set((i-1.5)*16,0,20);m.home=m.root.position.x});__show.orbit.dist=55;__show.orbit.h=10;}')
 for mode in [2,3,4]:pg.keyboard.press(str(mode));pg.evaluate('__step(30)');pg.screenshot(path=str(out/('mechs-motion-'+str(mode)+'.png')))
 assert not errors, errors
 if phase == 'after':
  assert all(v['finite'] for v in metrics['soldiers'].values())
  assert all(all(v < 0.02 for v in e) for e in metrics['handsByPose'].values()), metrics['handsByPose']
  assert all(v.get('finite', v.get('ragFinite')) for v in metrics['motionCheck'])
  assert abs(metrics['soldiers']['crouch']['feet'][0][1] - metrics['soldiers']['crouch']['feet'][1][1]) < 0.015
  assert metrics['soldiers']['strafe']['feet'][0][0] > metrics['soldiers']['strafe']['feet'][1][0]
  assert all(m['draws'] <= 30 and m['triangles'] <= (80000 if m['scheme']=='hero' else 50000) for m in metrics['mechs'])
 metrics['errors']=errors;(out/'metrics.json').write_text(json.dumps(metrics,indent=2));print(json.dumps(metrics,indent=2));b.close()
