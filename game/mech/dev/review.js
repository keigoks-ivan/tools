import { SHOP_LABELS, SHOP_SUBTITLES, PORT_LABELS, JAPANESE_FONT } from '../urban.js?v=4';
// 開發用：透過真實遊戲模組與既有除錯介面做固定步進，所有載入均帶 mute。
const frame = document.querySelector('#game'), report = document.querySelector('#report'), state = document.querySelector('#state');
let win, result = [], errors = [], post, renderer;
const assert = (ok, message) => { if (!ok) throw Error(message); result.push(message); report.textContent = JSON.stringify({ checks: result, errors }, null, 2); };
const wait = async (f) => { for (let i = 0; i < 600; i++) { if (f()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('載入逾時'); };
async function load(path, query = '') {
  result = []; errors = []; state.textContent = '載入中';
  document.querySelector('#captures').replaceChildren();
  let html = await (await fetch(path, { cache: 'no-store' })).text();
  // 每次檢查使用同一組新版本模組，避免 iframe 重載仍沿用已驗收的舊美術。
  const revision = Date.now();
  const baseMatch = html.match(/<base href="([^"]+)">/);
  const entryBase = new URL(baseMatch ? baseMatch[1] : path, new URL(path, location.href)).href;
  html = html.replace(/<base href="[^"]+">/, '');
  html = html.replace(/(<script type="importmap">)([\s\S]*?)(<\/script>)/, (_, a, json, b) => {
    const map = JSON.parse(json);
    for (const file of ['urban.js', 'anim.js', 'env.js', 'streetfront.js', 'stages.js', 'battlefields.js', 'fieldart.js', 'encounter.js', 'post.js', 'roofline.js', 'mechs.js', 'combat.js', 'cockpit.js', 'zero/kit.js', 'zero/map.js', 'zero/guns.js', 'zero/viewmodel.js', 'zero/main.js', 'zero/hud.js', 'zero/sfx.js', 'zero/mech6.js', 'lastline/map.js', 'lastline/script.js', 'lastline/mission.js', 'lastline/convoy.js', 'lastline/escort.mjs', 'lastline/operations.mjs', 'lastline/foot-ops.js', 'input.js', 'tactics.js', 'reinforcements.mjs', 'zero/ai.js', 'zero/script.js', 'zero/patrol.js', 'zero/recon.js']) {
      const url = new URL('/game/mech/' + file, location.href).href;
      for (const key of Object.keys(map.imports)) if (new URL(key, entryBase).href === url) delete map.imports[key];
      map.imports[url] = url + '?qa=' + revision;
    }
    return a + JSON.stringify(map) + b;
  });
  const control = `<base href="${entryBase}"><script>window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));addEventListener('unhandledrejection',e=>__qaErrors.push(String(e.reason?.stack||e.reason)));window.__raf=[];window.requestAnimationFrame=fn=>(__raf.push(fn),__raf.length);window.__step=(n=1)=>{for(let i=0;i<n;i++){const q=__raf.splice(0);for(const f of q)f(performance.now())}};<\/script>`;
  // srcdoc has its own queryless URL, so replace the main module with an explicit wrapper setting the desired query via parent-provided URLSearchParams.
  const setup = `<script>const NativeParams=URLSearchParams;window.URLSearchParams=class extends NativeParams{constructor(v){super(v===location.search?'${query}':v)}};<\/script>`;
  frame.srcdoc = html.replace('<head>', '<head>' + control + setup);
  win = frame.contentWindow;
  await new Promise(r => frame.onload = r);
  await wait(() => win.__game || win.__G || win.__mechs);
  // Each iframe gets its own module instance; use the iframe's module graph.
  const script = win.document.createElement('script'); script.type = 'module';
  script.textContent = `import * as T from 'three'; import {SEE} from '/game/mech/mechs.js'; T.Clock.prototype.getDelta=()=>1/60; window.__T=T; window.__see=SEE;`;
  win.document.head.append(script); await wait(() => win.__T);
  if (win.__G) await wait(() => win.__flow && win.__flow.chapter > 0);
  const world=win.__game?.world||win.__world||win.__G?.world;
  if(world) {
    await wait(()=>world.A.surfaceReady.value===1 && world.fieldFoliageReady && world.cityFacadeReady);
    assert(world.A.surfaceAtlas.value.image.width===1024 && (world.cityEnabled === false || [2,3,4].every(i=>world.A.fac[i][0].image.width===512 && world.A.fac[i][0].name.startsWith('city-'))),'共用建材 1024；城市立面 512，港區不建立住宅城市');
    if(win.__G && win.__flow.chapter < (win.__S.FIRST_MECH||6)) assert(world.cityTreeMeshes.every(m=>!m.visible),'步兵模式不因枝葉延遲載入而打開遠處樹林');
  }
  win.__step(2); frame.focus();
  errors = win.__qaErrors;
}
async function save(name = 'capture', clean = false) {
  if (!post) return;
  post.render(1);
  const cv = win.document.createElement('canvas'); cv.width = renderer.domElement.width; cv.height = renderer.domElement.height;
  const cx = cv.getContext('2d'); cx.drawImage(renderer.domElement, 0, 0);
  if (!clean) for (const c of win.document.querySelectorAll('canvas[id^="hud"]')) cx.drawImage(c, 0, 0, cv.width, cv.height);
  const data = cv.toDataURL('image/png');
  const a = document.createElement('a'); a.href = data; a.download = name + '.png'; a.textContent = '下載 ' + name;
  document.querySelector('#captures').append(a);
  // Preview PNG includes only the game canvas, captured immediately after rendering.
  const img = document.createElement('img'); img.src = data; img.style.width = '180px'; a.append(img);
}
async function mech() {
  await load('/game/mech/index.html', '?mute&nobrief&fps=0');
  const G = win.__game; post = G.post; renderer = post.renderer;
  for (let n = 1; n <= 10; n++) {
    G.launch(n); assert(G.combat.rifle.mag === 40 && G.combat.rifle.ammo === 40, `第 ${n} 關機槍裝填 40 發`); G.run(4); G.fake = { my: 1, mx: 0.3, fire: true, boost: false }; G.run(0.5); G.fake = null;
    assert(G.combat.stage === n && !G.player.pos.toArray().some(v => !Number.isFinite(v)), `本篇第 ${n} 關啟動、移動與射擊`);
    assert(G.combat.enemies.every(e => e.pos.toArray().every(Number.isFinite)), `第 ${n} 關敵人座標正常`);
    G.toTitle();
  }
  const sizes = [];
  for (const q of [0, 2, 1, 0, 1]) {
    win.document.querySelector(`[data-q="${q}"]`).click();
    const s = renderer.getDrawingBufferSize(new win.__T.Vector2());
    const rt = post.composer.renderTarget1;
    assert(rt.width === s.x && rt.height === s.y, `畫質 ${q}：後製 ${rt.width}×${rt.height} 與畫布一致`);
    sizes.push({ q, width: rt.width, height: rt.height, samples: rt.samples });
    G.tick(1 / 60);
  }
  G.launch(1); G.run(3.5);
  const C = G.combat;
  let continuous = true;
  for (let i = 0; i < 39; i++) { C.rifle.cd = 0; C.fireRifle(); continuous &&= C.rifle.reload < 0; }
  assert(continuous && C.rifle.ammo === 1, '連射 39 發仍未換彈');
  C.rifle.cd = 0; C.fireRifle(); assert(C.rifle.ammo === 0 && C.rifle.reload >= 0, '第 40 發後才自動換彈');
  G.run(2.1); assert(C.rifle.ammo === 40 && C.rifle.reload < 0, '換彈恢復 40 發');
  G.input.keys.add('KeyW');
  win.dispatchEvent(new win.Event('blur'));
  assert(G.state === 'paused' && G.input.keys.size === 0, '失焦自動暫停、清除持續移動');
  win.document.querySelector('#resume').click(); G.tick(1 / 60);
  assert(G.state === 'play', '暫停後恢復戰鬥');
  await save('mech-battle');
  report.textContent = JSON.stringify({ checks: result, sizes, memory: renderer.info.memory, errors }, null, 2);
  state.textContent = errors.length ? '有錯誤' : '本篇通過';
}

async function enemyMotion() {
  await load('/game/mech/index.html', '?mute&nobrief&all&fps=0');
  const G=win.__game,T=win.__T; post=G.post; renderer=post.renderer;
  G.launch(8); if(G.state==='paused')win.document.querySelector('#resume').click();
  const C=G.combat,W=G.world, foes=[];
  const base=C.enc.E.pts[0];
  for(const [i,kind] of ['grunt','ace','heavy'].entries()) {
    const x=base.x+(i-1)*24,z=base.z+55;
    const e=C.spawn(kind,i,3,{x,z,tx:x,tz:z+30,ground:true});
    e.vel.set(0,0,0);e.boostT=0;e.face=e.m.legYaw=0;e.dropping=false;e.grounded=true;
    foes.push(e);
  }
  C.hurt=()=>{};
  for(let i=0;i<900;i++)C.updateEnemies(1/60);
  for(const e of foes) {
    assert(e.m.stepCount>2, `${e.kind} 實際 AI 移動並觸發腳步`);
    assert(e.pos.toArray().every(Number.isFinite), `${e.kind} AI 位置正常`);
  }
  G.cockpit.root.visible=false; G.hero.root.visible=false; post.cockpit.enabled=false;
  const steps=[];
  for(const [i,e] of foes.entries()) {
    e.pos.set(base.x+(i-1)*24,W.height(base.x+(i-1)*24,base.z+55),base.z+55);e.m.legYaw=0;
    const st={vel:new T.Vector3(0,0,8),grounded:true,boost:0,torsoYaw:0,aim:new T.Vector3(e.pos.x,12,e.pos.z+200),groundAt:e.groundAt,brace:0};
    const before=e.m.stepCount;
    for(let n=0;n<240;n++) {e.pos.addScaledVector(st.vel,1/60);e.m.animate(1/60,st);}
    steps.push({kind:e.kind,steps:e.m.stepCount-before});
    assert(e.m.motion.g>.9, `${e.kind} 步態完整進入行走`);
    for(const b of Object.values(e.m.bones)) if(b?.quaternion)assertSilent(b.quaternion.toArray().every(Number.isFinite),'骨架旋轉無效');
  }
  const center=foes[1].pos;
  G.camera.position.set(center.x+25,center.y+16,center.z+33);G.camera.lookAt(center.x+10,center.y+11,center.z);G.camera.updateMatrixWorld();
  await save('enemy-weighted-walk');
  const heavy=foes[2],grunt=foes[0],ace=foes[1];
  const muzzle=e=>{e.m.muzzle.updateWorldMatrix(true,false);return e.m.muzzle.getWorldPosition(new T.Vector3());};
  C.bullet(grunt,muzzle(grunt),G.player.pos.clone().add(new T.Vector3(0,10,0)),200);
  assert(grunt.m.recoil===.5,'一般機開槍觸發後座力');
  C.shell(heavy,muzzle(heavy),G.player.pos.clone().add(new T.Vector3(0,10,0)),210,800);
  assert(heavy.m.recoil===1.2,'重裝砲擊觸發較強後座力');
  for(const e of foes) {
    const st={vel:new T.Vector3(),grounded:true,boost:0,torsoYaw:0,aim:new T.Vector3(e.pos.x,12,e.pos.z+200),groundAt:e.groundAt,brace:1};
    for(let n=0;n<30;n++){if(n%6===0)e.m.recoil=e.kind==='heavy'?1.2:.5;e.m.animate(1/60,st);}
    assert(e.m.motion.brace>.9,`${e.kind} 射擊支撐姿態`);
  }
  ace.m.swing=.88;ace.m.animate(1/60,{vel:new T.Vector3(),grounded:true,boost:0,torsoYaw:0,aim:null,groundAt:ace.groundAt});
  assert(ace.m.bones.torso.rotation.y<-.05,'王牌機揮砍先扭腰蓄力');
  await save('enemy-combat-brace');
  ace.m.swing=.45;ace.m.animate(1/60,{vel:new T.Vector3(),grounded:true,boost:0,torsoYaw:0,aim:null,groundAt:ace.groundAt});
  assert(ace.m.bones.torso.rotation.y>.25,'王牌機揮砍帶動軀幹');
  // 骨架更新本身不增加渲染資源，射擊特效另由既有粒子池管理。
  const settle=()=>{for(let i=0;i<600;i++)for(const e of foes)e.m.animate(1/60,{vel:new T.Vector3(),grounded:true,boost:0,torsoYaw:0,aim:null,groundAt:e.groundAt}); post.render(1);};
  settle(); const before={...renderer.info.memory}; settle();
  assert(renderer.info.memory.geometries===before.geometries && renderer.info.memory.textures===before.textures,'重複骨架動作沒有新增 GPU 幾何或貼圖');
  assert(errors.length===0,'敵機靜音戰鬥與動畫沒有執行錯誤');
  report.textContent=JSON.stringify({checks:result,steps,steadyBefore:before,steadyAfter:renderer.info.memory,errors},null,2);state.textContent='敵機動作通過';
}

async function battlefields() {
  localStorage.setItem('mech.view','1');
  await load('/game/mech/index.html', '?mute&nobrief&all&fps=0');
  const G = win.__game, T = win.__T, W = G.world; post = G.post; renderer = post.renderer;
  const budgets = [];
  for (const n of [4,5,6,7,8,9]) {
    G.launch(n); if(G.state==='paused') win.document.querySelector('#resume').click(); G.run(4); if(W.fieldTrees)await wait(()=>W.fieldFoliageReady); const C = G.combat, E = C.enc;
    assertSilent(W.fieldTreeMaterial.map?.image.width===512,'枝葉贴圖未載入或超過 512 像素 GPU 預算');
    W.fieldGroup.traverse(o=>{ if(o.isMesh) for(const [key,a] of Object.entries(o.geometry.attributes)) assertSilent(a.count===o.geometry.attributes.position.count,'場地頂點屬性不足：'+key); });
    const terrain=W.terrainMesh.geometry, pos=terrain.attributes.position, grid=W.terrain;
    assertSilent(pos.count===(grid.seg+1)**2,'地形頂點數被增加');
    for(let i=0;i<pos.count;i+=71)assertSilent(Math.abs(W.height(pos.getX(i),pos.getZ(i))-pos.getY(i))<.002,'地形碰撞與渲染高度不一致');
    for(let i=0;i<80;i++) {
      const gx=35+(i*17)%80,gz=30+(i*29)%90,a=gz*(grid.seg+1)+gx,b=a+grid.seg+1,d=a+1;
      const x=(pos.getX(a)+pos.getX(b)+pos.getX(d))/3,z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(d))/3;
      assertSilent(Math.abs(W.height(x,z)-(pos.getY(a)+pos.getY(b)+pos.getY(d))/3)<.002,'地形三角形內插與碰撞不一致');
    }
    const mask=W.fieldGroundTexture.image,md=mask.getContext('2d').getImageData(0,0,512,512).data;
    const maskAt=(x,z,c)=>md[(Math.min(511,Math.max(0,Math.floor((1400-z)/2800*512)))*512+Math.min(511,Math.max(0,Math.floor((x+1400)/2800*512))))*4+c];
    const origin=C.def.route.pts[0];
    assertSilent(maskAt(...origin,0)>100 && maskAt(W.blds[0].cx,W.blds[0].cz,1)>100 && md.some((v,i)=>i%4===2&&v>50),'道路、整地與接地遮蔽未寫入場地貼圖');
    assertSilent(W.fieldEnvMap.image.width<=384 && W.fieldEnvMap.image.height<=512,'反射圖超過低解析共用預算');
    assertSilent(W.skyDome.material.uniforms.sunDir.value.distanceTo(W.lightDir)<.001 && W.scene.environment===W.fieldEnvMap,'戶外日照、天空与反射不同步');
    assertSilent(W.fieldGroundTexture.image.width===512 && W.scene.environmentIntensity===.43,'戶外接地貼圖或光照配置未啟用');
    assert(W.battlefield === C.def.battlefield && W.cityObjects.every(o=>!o.visible), `第 ${n} 關切換到 ${C.def.fieldLabel}，城市完整隱藏`);
    for (const sec of C.def.route.secs) for (const target of sec.targets || []) {
      assert(W.blds.some(b=>Math.hypot(b.cx-target.x,b.cz-target.z)<1), `第 ${n} 關任務目標 ${target.name} 已建立`);
    }
    for (const p of C.def.route.pts) {
      const v = new T.Vector3(p[0], W.height(...p), p[1]), before = v.clone(); W.collide(v,3.4,v.y);
      assertSilent(v.distanceTo(before)<0.01, '起點或路線碰撞封死：'+n+' / '+p);
    }
    G.cockpit.root.visible = false; G.hero.root.visible = false; post.cockpit.enabled = false;
    const p = E.E.pts[Math.floor(E.E.pts.length/2)];
    G.camera.position.set(p.x+170,44,p.z+220); G.camera.lookAt(p.x,12,p.z); G.camera.updateMatrixWorld();
    if(W.battlefield==='airfield') { G.camera.position.set(-160,65,320); G.camera.lookAt(-420,0,-450); G.camera.updateMatrixWorld(); }
    W.followShadow(G.camera.position);W.sun.shadow.needsUpdate=true;
    await save('field-'+W.battlefield);
    if(W.battlefield==='airfield'||W.battlefield==='depot'||W.battlefield==='forest') {
      const S=W.blds.find(b=>W.battlefield==='forest'||b.w>40)||W.blds[0];
      G.camera.position.set(S.cx+70,S.gy+26,S.cz+95);G.camera.lookAt(S.cx,S.gy+10,S.cz);G.camera.updateMatrixWorld();
      W.followShadow(G.camera.position);W.sun.shadow.needsUpdate=true;
      await save('field-'+W.battlefield+'-detail');
    }
    let triangles = 0, meshes = 0; W.scene.traverseVisible(o=>{ if(o.isMesh){ meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1); } });
    assert(triangles < 1400000, `第 ${n} 關 ${Math.round(triangles)} 三角形，低於城市預算`);
    budgets.push({n,profile:W.battlefield,triangles:Math.round(triangles),meshes,textures:renderer.info.memory.textures});
    G.hero.root.visible = true; post.cockpit.enabled = true;
    let steps = 0;
    while (G.state !== 'result' && steps++ < 6000) {
      if(G.state==='paused') win.document.querySelector('#resume').click();
      const sec = E.cur;
      if(sec) { const p=E.E.pts[sec.at]; G.player.pos.set(p.x,W.height(p.x,p.z),p.z); G.player.vel.set(0,0,0); }
      G.player.ap = G.player.apMax;
      for(const e of C.enemies) if(!e.dead) C.damageEnemy(e,100000,1000,e.pos.clone(),new T.Vector3(0,1,0),true);
      for(const t of E.tg) if(t.b.st===0) W._dmg(t.b,1000,new T.Vector3(t.b.cx,3,t.b.z1),new T.Vector3(0,0,1),true);
      G.tick(.2);
      if(steps%120===0) await new Promise(r=>setTimeout(r,0));
    }
    assert(E.state === 'done' && G.state === 'result', `第 ${n} 關實際清除全部伏兵、守點與目標，自然完成 ` + JSON.stringify({state:G.state,phase:C.phase,sec:E.sec,enc:E.state,prog:E.prog,s:E.cur?.s,enemies:C.enemies.length,queue:E.queue.length,events:C.events.length,dead:C.dead}));
    const retry = win.document.querySelector('#again'); retry.click(); G.run(2);
    assert(W.blds.every(b=>b.st===0 && b.hp===b.hpMax), `第 ${n} 關重玩復原建築`);
    const R=C.enc.R;
    assert(R.boxes.every(b=>W.nearBoxes((b.x0+b.x1)/2,(b.z0+b.z1)/2,2,[]).includes(b)), `第 ${n} 關重玩路障碰撞仍登記`);
    G.toTitle();
    assertSilent(W.scene.environment===W.envMap && W.lightDir.distanceTo(W.cityLightDir)<.001 && W.scene.environmentIntensity===.55 && W.sun.shadow.camera.right===260 && !W.terrainMesh.castShadow,'城市光影配置未復原');
    assertSilent(!W.terrain.detailed && W.terrainMesh.geometry.attributes.position.getX(1)===-5000+W.terrain.cell,'城市地形座標沒有復原');
    assert(W.battlefield==='city' && W.cityObjects.every(o=>o.visible || o===W.beacon), '回標題恢復原城市與碰撞');
    await new Promise(r=>setTimeout(r,0));
  }
  const counts=[], residentTextures=renderer.info.memory.textures;
  for(const n of [4,5,6,7,8,9,4,5,6,7,8,9]) { G.launch(n); G.run(4); post.render(1); counts.push(renderer.info.memory.geometries); G.toTitle(); await new Promise(r=>setTimeout(r,0)); }
  assert(counts.slice(6).every((v,i)=>v===counts[i]), '第二輪切換六種場地沒有累積 GPU 幾何');
  assert(renderer.info.memory.textures===residentTextures, '第二輪換場未累積貼圖');
  assert(errors.length===0, '場地切換與完整通關沒有執行錯誤');
  report.textContent=JSON.stringify({checks:result,budgets,counts,errors},null,2); state.textContent='六種場地通過';
}

async function zero() {
  await load('/game/mech/zero/index.html', '?mute&god&ch=1&all&fps=0');
  const G = win.__G; renderer = win.__renderer;
  // Wrapper around the real render call allows in-memory captures without preserving every frame's framebuffer.
  post = null;
  post={render:()=>win.__step(1)};await save('zero-street');post=null;
  for (let n = 1; n <= 6; n++) {
    if (n > 1) { win.document.querySelector('#quit').click(); win.document.querySelector(`[data-c="${n}"]`).click(); }
    if (n === 6) {
      await wait(() => win.__m6); win.__step(10);
      assert(!!win.__m6, '前傳第 6 章機體系統載入');
      for (const q of [0, 2, 1]) { win.document.querySelector(`[data-q="${q}"]`).click(); win.__step(2); }
      assert(errors.length === 0, '第 6 章三段畫質渲染沒有錯誤'); break;
    }
    win.__botCtl = { my: 1, sprint: true }; win.__step(20); win.__botCtl = {};
    assert(win.__flow.chapter === n && G.player.pos.toArray().every(Number.isFinite), `前傳第 ${n} 章載入與移動`);
    const fire = new win.KeyboardEvent('keydown', { code: 'KeyG' }); win.dispatchEvent(fire); win.__step(30); win.dispatchEvent(new win.KeyboardEvent('keyup', { code: 'KeyG' }));
    assert(G.grenades.length > 0, `第 ${n} 章手榴彈投擲`);
    for (const q of [0, 2, 1]) { win.document.querySelector(`[data-q="${q}"]`).click(); win.__step(1); }
    assert(errors.length === 0, `第 ${n} 章三段畫質渲染沒有錯誤`);
  }
  report.textContent = JSON.stringify({ checks: result, memory: renderer.info.memory, errors }, null, 2);
  state.textContent = errors.length ? '有錯誤' : '前傳通過';
}
async function art() {
  await load('/game/mech/index.html', '?mute&show=all&od=51&oy=0.1&fps=0');
  post = win.__post; renderer = win.__renderer;
  const metrics = win.__mechs.map(m => ({ type: m.schemeKey, triangles: m.meshes.reduce((s,o) => s + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 0), draws: m.meshes.length }));
  for (const m of metrics) assert(m.draws <= 30 && m.triangles <= (m.type === 'hero' ? 80000 : 50000), `${m.type}：${m.triangles} 三角形、${m.draws} 網格`);
  await save('mechs-city');
  const mod = win.document.createElement('script'); mod.type = 'module';
  mod.textContent = `import {HumanKit,Soldier} from './zero/human.js'; window.__humans={HumanKit,Soldier};`;
  win.document.head.append(mod); await wait(() => win.__humans);
  const { HumanKit, Soldier } = win.__humans, T = win.__T;
  const kit = await HumanKit.load(new URL('../zero/assets/soldier.glb', import.meta.url).href);
  const floor = new T.Mesh(new T.PlaneGeometry(18, 12).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x383b3f, roughness: 0.85 }));
  const scene = new T.Scene(); scene.environment = win.__world.envMap; scene.environmentIntensity = 0.75;
  scene.add(floor, new T.HemisphereLight(0xd5e6ff, 0x43362c, 1.2));
  const sun = new T.DirectionalLight(0xffe0bc, 3.2); sun.position.set(-4, 7, 4); scene.add(sun);
  const looks = ['pilot', 'trooper', 'sniper', 'officer', 'heavy'];
  for (let i = 0; i < looks.length; i++) {
    const s = new Soldier(kit, looks[i]); s.pos.set((i - 2) * 1.3, 0, 0); scene.add(s.root);
    for (let j = 0; j < 30; j++) s.update(1 / 60);
    assert(s.meshes.every(o => o.skeleton.bones.every(b => b.position.toArray().every(Number.isFinite))), `${looks[i]} 骨架姿勢正常`);
  }
  const cam = new T.PerspectiveCamera(38, renderer.domElement.width / renderer.domElement.height, 0.05, 50); cam.position.set(0, 1.8, 8.5); cam.lookAt(0, 0.9, 0);
  post.world.scene = scene; post.world.camera = cam; post.gtao.enabled = false; post.cockpit.enabled = false;
  post.render(0); await save('soldiers');
  report.textContent = JSON.stringify({ checks: result, mechs: metrics, errors }, null, 2); state.textContent = '美術通過';
}
async function hero() {
  await load('/game/mech/index.html', '?mute&show=hero&od=23&oh=10&oy=0.3&op=0.06&fps=0');
  post = win.__post; renderer = win.__renderer;
  const m = win.__mechs[0];
  const triangles = m.meshes.reduce((s,o) => s + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 0);
  assert(triangles <= 80000 && m.meshes.length <= 30, `主角機 ${triangles} 三角形、${m.meshes.length} 網格`);
  for (let mode = 1; mode <= 8; mode++) { win.__show.setMode(mode); win.__step(30); assert(m.meshes.every(o => o.geometry.attributes.position.array.every(Number.isFinite)), `機體動作 ${mode} 座標正常`); }
  m.root.position.set(0, 0, 20); m.face = m.legYaw = 0; win.__show.setMode(1); win.__step(30);
  await save('hero');
  Object.assign(win.__show.orbit, { h: 17.65, dist: 5.5, pitch: 0.04, yaw: 0.3 }); win.__step(1);
  await save('hero-head'); state.textContent = '主角機通過';
}
async function city() {
  await load('/game/mech/index.html', '?mute&free&x=120&y=8&z=145&yaw=0.3&pitch=0&fps=0');
  post = win.__post; renderer = win.__renderer;
  // 同一座城市的兩種尺度，保留實際遊戲光線。
  win.__step(2); await save('city-street');
  win.__cam.set(0, 90, 250, 0, -0.14); win.__step(2); await save('city-skyline');
  const W = win.__world;
  assert(W.cityTreeMeshes.length===3 && W.cityTreeMeshes.every(m=>m.customDepthMaterial===W.fieldTreeDepth),'城市三種枝葉剪影共用材質與陰影剪影');
  const street = W.blds.filter(b=>b.cx < -120 && b.cz < 480 && b.H < 45);
  assert(street.length > 30 && street.filter(b=>Math.min(b.w,b.d)<25).length > street.length*.7, '舊城多數街屋短邊小於 25 公尺，避免寬扁巨型住宅');
  assert(new Set(street.map(b=>b.H)).size >= 4, '連棟街屋具備至少四種實際樓高');
  assert(W.scene.children.some(o => o.geometry?.attributes.surface?.array.some(v => v === 4)), '新版玻璃、石材與金屬頂點材質已載入');
  win.__cam.set(-120, 3, -145, Math.PI / 2, 0); win.__step(2); await save('city-oldtown');
  const japanese = W.blds.find(b => b.x0 > 120 && b.z0 > -240 && b.z0 < 120 && b.H < 30 && b.seg.length === 3);
  assert(!!japanese, '日式街區保留在混合城市中的指定區域');
  win.__cam.set(japanese.cx + 4, 2.8, japanese.z1 + 12, Math.atan2(4, 12), .08); win.__step(2); await save('city-japanese');
  const house = street.find(b=>b.w<25 && b.d<50 && b.cx < -240);
  assert(!!house, '舊城街屋深度控制在 50 公尺內');
  win.__cam.set(house.cx+12, 4, house.z1+26, Math.atan2(12,26), .12); win.__step(2); await save('city-rowhouses');
  let alleys = 0;
  for (const a of W.blds) for (const b of W.blds) {
    if (a === b) continue;
    for (const axis of ['x','z']) {
      const cross = axis === 'x' ? 'z' : 'x', wall = a[axis+'1'], gap = b[axis+'0'] - wall;
      const lo = Math.max(a[cross+'0'],b[cross+'0']), hi = Math.min(a[cross+'1'],b[cross+'1']);
      if (gap <= 0 || gap >= 4 || hi - lo < 3) continue;
      alleys++;
      const ax = axis === 'x' ? 0 : 2, other = cross === 'x' ? 0 : 2;
      for (const [building,edge,sign] of [[a,wall,1],[b,b[axis+'0'],-1]]) {
        const roof = building.seg[1].o;
        for (let i = 0; i < roof.length; i += 3) {
          if (roof[i+1] < .7 || roof[i+1] >= Math.min(a.H,b.H)-.4 || roof[i+other] < lo || roof[i+other] > hi) continue;
          assertSilent((roof[i+ax]-edge)*sign <= .45, '窄樓縫出現超過貼牆線腳的陽台／梯架');
        }
      }
    }
  }
  assert(alleys > 20, `檢查 ${alleys} 處窄樓縫，沒有相向伸出的陽台、梯架或店棚`);
  const b = W.blds.find(b => b.seg.length === 3);
  assert(!!b, '店面招牌納入可破壞建築');
  const sign = b.seg[2], original = sign.a.array.slice(sign.s * 3, sign.s * 3 + sign.o.length);
  const hit = W.hitBuilding(new win.__T.Vector3(b.x0, b.H / 2, b.cz), 100, new win.__T.Vector3(-1, 0, 0));
  assert(hit === b, '真實命中介面可摧毀建築');
  for (let i = 0; i < Math.ceil((b.dur + 1) * 60); i++) W.update(1 / 60);
  assert(sign.a.array[sign.s * 3 + 1] < -20, '建築倒塌時招牌一同移除');
  W.resetBuildings(); assert(original.every((v,i) => sign.a.array[sign.s * 3 + i] === v), '重開關卡完整復原招牌');
  const geometries = new Set(); W.scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
  const triangles = [...geometries].reduce((n,g) => n + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);
  let meshes = 0; W.scene.traverse(o => { if (o.isMesh) meshes++; });
  assert(triangles < 1400000, '城市幾何維持 140 萬三角形以下');
  report.textContent = JSON.stringify({ checks: result, triangles, meshes, memory: renderer.info.memory, errors }, null, 2);
  state.textContent = '街景通過';
}
async function mountains() {
  await load('/game/mech/index.html', '?mute&free&x=0&y=140&z=650&yaw=0&pitch=-0.025&fps=0');
  post = win.__post; renderer = win.__renderer;
  const W = win.__world;
  for (const [name, view] of [
    ['mountains-city', [0, 140, 650, 0, -0.025]],
    ['mountains-east', [600, 90, 120, -Math.PI / 2, -0.035]],
    ['mountains-slopes', [-1350, 110, 1200, Math.PI / 4, -0.03]],
  ]) { win.__cam.set(...view); win.__step(2); await save(name); }
  const terrain = W.terrainMesh.geometry, T = win.__T;
  const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
  for (const seg of [160, 72]) {
    const field = new W.terrain.constructor(10000, seg), g = field.geometry(), far = field.backdropGeometry();
    const mesh = new T.Mesh(g, new T.MeshBasicMaterial()); mesh.updateMatrixWorld();
    for (const [x, z] of [[0,0], [700,700], [-700,-700], [350,-610], [-2800,3150], [1731,-3267]]) {
      ray.set(new T.Vector3(x, 3000, z), down);
      const hit = ray.intersectObject(mesh)[0];
      assert(hit && Math.abs(hit.point.y - field.height(x,z)) < 0.001, `${seg} 格地形：${x},${z} 實際網格與碰撞高度一致`);
    }
    const fp = far.attributes.position;
    let seam = true, winding = true;
    for (let i = 0; i <= seg * 4; i++) seam &&= Math.abs(fp.getY(i) - field.height(fp.getX(i), fp.getZ(i))) < 0.001;
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < far.index.count; i += 3) {
      a.fromBufferAttribute(fp, far.index.getX(i)); b.fromBufferAttribute(fp, far.index.getX(i+1)); c.fromBufferAttribute(fp, far.index.getX(i+2));
      winding &&= b.sub(a).cross(c.sub(a)).y > 0;
    }
    assert(seam && winding && fp.array.every(Number.isFinite), `${seg} 格遠山接縫、三角形方向與頂點正常`);
    assert(far.index.count / 3 === seg * 96, `${seg} 格遠山維持固定三角形預算`);
    g.dispose(); far.dispose(); mesh.material.dispose();
  }
  assert(W.mountainMesh.material === W.terrainMesh.material && !W.mountainMesh.castShadow && W.mountainMesh.userData.noAO, '遠山共用材質，不投影子、不計 AO');
  assert(terrain.attributes.position.array.every(Number.isFinite) && terrain.attributes.normal.array.every(Number.isFinite), '山景頂點與法線沒有無效數值');
  const geometries = new Set(); W.scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
  const triangles = [...geometries].reduce((n,g) => n + (g.index ? g.index.count : g.attributes.position.count) / 3, 0);
  assert(triangles < 1400000, '山景與城市合計低於 140 萬三角形');
  report.textContent = JSON.stringify({ checks: result, triangles, memory: renderer.info.memory, errors }, null, 2);
  state.textContent = errors.length ? '有錯誤' : '山景通過';
}
async function tactics() {
  await load('/game/mech/index.html', '?mute&nobrief&fps=0');
  const G = win.__game, T = win.__T; G.launch(5); G.run(3.5); G.player.pos.set(0, 0, 600); G.tick(1 / 60);
  const C = G.combat; post = C.post; renderer = post.renderer;
  const ace = C.spawn('ace', 0, 1, { x: 0, z: 480, ground: true, tx: 0, tz: 600 });
  const grunt = C.spawn('grunt', 0, 1, { x: -120, z: 600, ground: true });
  assert(grunt.pos.toArray().every(Number.isFinite)&&grunt.vel.toArray().every(Number.isFinite),'未指定方向的地面增援保持有效速度與座標');
  const heavy = C.spawn('heavy', 0, 1, { x: 120, z: 600, ground: true, tx: 0, tz: 600 });
  ace.qbCd = 0; C.enemyQB(ace, 1);
  assert(Math.hypot(ace.vel.x, ace.vel.z) > 59, '王牌側閃有實際速度');
  for (let i = 0; i < 120; i++) { C.stats.time += 0.1; C.updateEnemies(0.1); G.fx.update(0.1); G.world.update(0.1); }
  assert([ace, grunt, heavy].every(e => e.pos.toArray().every(Number.isFinite)), '三種敵機的避障、包抄與射擊座標正常');
  assert(Math.abs(ace.pos.x) > 5, '側翼機離開原本正面射線');
  assert(ace.role === 'flank' && heavy.role === 'support', '側翼與支援機體各有分工');
  await save('tactical-battle');
  // 直接進入實際守點段，驗證時間事件、預警隊列與在場上限。
  G.toTitle(); G.launch(2); G.run(3.5);
  const D = G.combat, E = D.enc;
  for (const e of D.enemies) e.m.root.removeFromParent(); D.enemies.length = 0;
  E.sec = E.N - 1; E.mine = []; E.prog = E.cur.s; E.state = 'move'; E.queue.length = 0;
  const p = E.E.pts[E.cur.at]; G.player.pos.set(p.x, 0, p.z); G.tick(1 / 60);
  for (let i = 0; i < 260; i++) { D.stats.time += 0.1; E.update(0.1); D.updateEnemies(0.1); G.fx.update(0.1); }
  assert(E.beatSeen.has(0), '撤離中途的側翼突破事件觸發');
  assert(D.alive.length <= 9, '劇情增援沿用九個單位上限');
  assert(D.subQ.some(s => s.text.includes('側街')), '側翼事件實際進入通訊字幕');
  post = D.post; renderer = post.renderer;
  G.tick(1 / 60); await save('evacuation-pressure');
  report.textContent = JSON.stringify({ checks: result, enemies: D.alive.length, errors }, null, 2); state.textContent = errors.length ? '有錯誤' : '戰術與劇情通過';
}
async function prequelMechCampaign() {
  await load('/game/mech/zero/index.html','?mute&ch=6&all&fps=0');await wait(()=>win.__m6);
  const M=win.__m6,T=win.__T,W=win.__world,S=win.__S;renderer=win.__renderer;
  const render=renderer.render.bind(renderer);renderer.render=()=>{};M.combat.hurt=()=>{};M.fight(0);
  let i=0,peak=0;
  while(!M.ending&&i++<6000) {
    const C=M.combat,w=S.MECH6.waves[Math.min(C.group,S.MECH6.waves.length-1)],p=M.gate?.W.go||w.go||[82,66];
    M.player.pos.set(p[0],W.height(p[0],p[1]),p[1]);M.player.vel.set(0,0,0);
    for(const e of C.enemies)if(!e.dead)C.damageEnemy(e,100000,1000,e.pos.clone(),new T.Vector3(0,1,0),true);
    M.tick(.05);peak=Math.max(peak,C.alive.length);
    assertSilent(peak<=9&&C.enemies.every(e=>e.pos.toArray().every(Number.isFinite)),'前傳機甲座標與在場上限');
    if(i%120===0)await new Promise(r=>setTimeout(r,0));
  }
  renderer.render=render;
  assert(M.combat.group===8&&!!M.ending,'前傳機甲八波增援與黑犬撤退、追擊、決戰完整通關');
  assert(M.fled&&M.flyers.length===0,'黑犬實際撤退，追擊戰結束後退場');
  assert(errors.length===0,'前傳機甲增援沒有執行錯誤');
  report.textContent=JSON.stringify({checks:result,peak,steps:i,errors},null,2);state.textContent='前傳機甲全流程通過';
}
async function campaignMain() {
  await load('/game/mech/index.html','?mute&nobrief&all&fps=0');
  const G=win.__game,T=win.__T,W=G.world,steps=[];renderer=G.post.renderer;
  const render=renderer.render.bind(renderer);renderer.render=()=>{};
  for(let n=1;n<=10;n++) {
    G.launch(n);const C=G.combat,E=C.enc;C.hurt=()=>{};
    let i=0,peak=0;
    while(G.state!=='result'&&i++<6000) {
      if(G.state==='paused')win.document.querySelector('#resume').click();
      if(E.cur){const p=E.E.pts[E.cur.at];G.player.pos.set(p.x,W.height(p.x,p.z),p.z);G.player.vel.set(0,0,0);}
      for(const e of C.enemies)if(!e.dead)C.damageEnemy(e,100000,1000,e.pos.clone(),new T.Vector3(0,1,0),true);
      for(const t of E.tg)if(t.b.st===0)W._dmg(t.b,1000,new T.Vector3(t.b.cx,3,t.b.z1),new T.Vector3(0,0,1),true);
      G.tick(.2);peak=Math.max(peak,C.alive.length);
      assertSilent(peak<=9&&C.enemies.every(e=>e.pos.toArray().every(Number.isFinite)),'本篇增援上限與座標');
      if(i%120===0)await new Promise(r=>setTimeout(r,0));
    }
    assert(E.state==='done'&&G.state==='result',`第 ${n} 關全部伏兵、增援、守點、目標與頭目自然通關`);steps.push({stage:n,steps:i,peak});G.toTitle();
  }
  renderer.render=render;G.tick(1/60);assert(errors.length===0,'本篇十關全流程沒有執行錯誤');
  report.textContent=JSON.stringify({checks:result,steps,errors},null,2);state.textContent='本篇全流程通過';
}
async function enemyPressure() {
  await load('/game/mech/zero/index.html', '?mute&god&ch=1&all&fps=0');
  const G=win.__G,T=win.__T,B=win.__S.ENCOUNTERS.find(e=>e.id==='B');
  const base=B.enemies[0];
  B.response={delay:.3,enemies:Array.from({length:12},()=>({...base,alert:true}))};
  G.player.reset(new T.Vector3(-92,0,-84),0);T.Clock.prototype.getDelta=()=>.05;
  renderer=win.__renderer;post={render:()=>win.__step(1)};
  const render=renderer.render.bind(renderer);renderer.render=()=>{};
  let peak=0;
  const step=n=>{for(let i=0;i<n;i++){win.__scene.updateMatrixWorld(true);win.__step(1);peak=Math.max(peak,G.enemies.filter(e=>!e.dead).length);assertSilent(peak<=24,'常駐模型與增援超出上限');assertSilent(G.enemies.every(e=>e.pos.toArray().every(Number.isFinite)),'步兵座標');}};
  step(400); assert(peak>0&&peak<=24,'常駐駐軍加十二名增援，模型數量有上限');
  assert(!win.__flow.done.includes('B'),'場外增援尚未進場時不會提早過關');
  let defeated=0;
  for(let n=0;n<1500&&!win.__flow.done.includes('B');n++){for(const e of G.enemies)if(!e.dead){e.damage(10000,new T.Vector3(0,0,-1),'head',G.player.pos);if(!e.resident||e.resident.E===B)defeated++;}step(1);}
  assert(defeated===14&&win.__flow.done.includes('B'),'兩名駐軍與十二名增援逐批進場、擊倒後正常清關');
  assert(G.enemies.filter(e=>e.dead).length<=16,'長戰鬥會清除舊屍體與骨架資源');
  renderer.render=render;
  await load('/game/mech/index.html','?mute&nobrief&all&fps=0');
  const M=win.__game;M.launch(5);M.run(3.5);const C=M.combat;C.hurt=()=>{};
  C.enc=null;C.enemies.forEach(e=>e.m.root.removeFromParent());C.enemies.length=0;C.events.length=0;
  M.player.pos.set(0,0,600);M.player.vel.set(0,0,0);
  for(let i=0;i<18;i++)C.events.push({spawn:true,t:0,fn:()=>C.spawn(i%4===0?'heavy':i%3===0?'ace':'grunt',0,1,{x:(i%3-1)*120,z:480,ground:true})});
  let mechPeak=0,push=false;
  const r=M.post.renderer.render.bind(M.post.renderer);M.post.renderer.render=()=>{};
  const before=performance.now();
  for(let i=0;i<900;i++){C.stats.time+=.05;C.updateEvents(.05);C.updateEnemies(.05);M.world.update(.05);M.fx.update(.05);mechPeak=Math.max(mechPeak,C.alive.length);push ||= C.enemies.some(e=>e.pushT>0);assertSilent(C.alive.length<=9&&C.enemies.every(e=>e.pos.toArray().every(Number.isFinite)&&e.vel.toArray().every(Number.isFinite)),'機甲壓力測試位置與上限');}
  assert(mechPeak===9&&C.events.length===9,'十八台增援滿員後，九台在場、九台等待');assert(push,'支援壓制確實觸發機甲側翼推進');
  let count=0;
  for(let i=0;i<500&&C.events.length;i++){for(const e of C.enemies)if(!e.dead){e.dead=true;e.gone=true;e.m.root.removeFromParent();count++;}C.updateEvents(.05);}
  count+=C.alive.length;assert(count===18&&C.events.length===0,'機甲空出名額後，全部十八台進場且沒有丟失增援');
  M.post.renderer.render=r;M.tick(1/60);
  assert(errors.length===0,'增援壓力測試沒有執行錯誤');
  report.textContent=JSON.stringify({checks:result,peak,mechPeak,cpuMsPerStep:(performance.now()-before)/900,errors},null,2);state.textContent='敵人增援壓力通過';
}
async function infantry() {
  await load('/game/mech/zero/index.html', '?mute&god&ch=1&all&fps=0');
  const G = win.__G, T = win.__T, script = win.document.createElement('script'); script.type = 'module';
  script.textContent = `import {Trooper} from './ai.js'; window.__Trooper=Trooper;`; win.document.head.append(script); await wait(() => win.__Trooper);
  const e = new win.__Trooper(G, { type: 'officer', x: -92, z: -74, alert: true }); G.enemies.push(e);
  e.phase = 'hide'; e.phaseT = 2; e.cover = e.pos.clone().add(new T.Vector3(0, 0, -1)); e.coverT = 10; e.burst = 4;
  const start = e.pos.clone();
  for (let i = 0; i < 8; i++) { G.t += 0.1; e.update(0.1); }
  assert(e.pos.distanceTo(start) > 0.15 && e.burst === 0, '步兵退回掩體並釋放射擊名額');
  G.player.pos.set(-92, 0, -84); G.playerEye.set(-92, 1.6, -84);
  e.sees = true; e.losT = 1; e.lastSeen.copy(G.player.pos); e.pushCd = 0; G.vm.reloadT = 0;
  e.update(0.1);
  assert(e.pushCd > 0 && e.phase === 'move', '指揮官看見玩家換彈時推進'); G.vm.reloadT = -1;
  for (let i = 0; i < 200; i++) { G.t += 0.05; for (const o of G.enemies) o.update(0.05); G.fx.update(0.05); }
  assert(G.enemies.every(o => o.pos.toArray().every(Number.isFinite)), '步兵持續戰鬥與局部避障沒有無效座標');
  // 在短遭遇中重用正式守點對白，驗證任務插播時鐘與去重。
  const B = win.__S.ENCOUNTERS.find(o => o.id === 'B'), beat = win.__S.ENCOUNTERS.find(o => o.id === 'C3').beats[0];
  B.beats = [{ ...beat, t: 0.1 }];
  const said = [], say = G.hud.say.bind(G.hud); G.hud.say = (...args) => { said.push(args[1]); say(...args); };
  win.__step(30);
  assert(win.__flow.active.includes('B') && said.filter(t => t === beat.lines[0][1]).length === 1, '前傳任務的戰鬥插播確實觸發一次');
  win.__step(1);
  report.textContent = JSON.stringify({ checks: result, errors }, null, 2); state.textContent = errors.length ? '有錯誤' : '步兵戰術通過';
}
async function weapons() {
  await load('/game/mech/zero/index.html', '?mute&god&ch=1&all&fps=0');
  const G = win.__G; renderer = win.__renderer; post = { render: () => win.__step(1) };
  const metrics = [];
  for (const kind of ['rifle', 'pistol', 'smg']) {
    win.document.querySelector('#resume').click(); frame.focus();
    let triangles = 0, meshes = 0;
    G.vm.g[kind].traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
    metrics.push({ kind, triangles, meshes });
    assert(triangles < 20000 && meshes <= 18, `${kind}：${triangles} 三角形、${meshes} 網格`);
    const code = { rifle: 'Digit1', pistol: 'Digit2', smg: 'Digit3' }[kind];
    win.dispatchEvent(new win.KeyboardEvent('keydown', { code })); win.__step(50); win.dispatchEvent(new win.KeyboardEvent('keyup', { code }));
    assert(G.vm.cur === kind, `${kind} 切換成功`);
    G.vm.g[kind].traverse(o=>{if(o.geometry)for(const k of ['position','normal'])assertSilent(Array.from(o.geometry.attributes[k].array).every(Number.isFinite),`${kind} 幾何座標正常`);});
    for(const q of [0,1,2]) { win.document.querySelector('#resume').click(); win.document.querySelector(`[data-q="${q}"]`).click(); win.__step(20); assert(errors.length===0,`${kind} 畫質 ${q} 材質正常`); }
    if (kind === 'smg') {
      const checkAim=()=>{
        const T=win.__T,M=G.vm.model,eye=M.worldToLocal(new T.Vector3()),dir=M.worldToLocal(new T.Vector3(0,0,-1)).sub(eye);
        const p=eye.addScaledVector(dir,(M.userData.sightZ-eye.z)/dir.z);
        assert(G.vm.ads>.99&&!G.vm.scoped&&Math.abs(p.x)<.023&&Math.abs(p.y-M.userData.sightY)<.02,'衝鋒槍瞄點射線穿過開放瞄具，沒有被槍身遮住');
      };
      win.__botCtl={ads:true};win.__step(120);checkAim();await save('zero-smg-ads');
      for(const q of [0,1,2]) { win.document.querySelector('#resume').click();win.document.querySelector(`[data-q="${q}"]`).click();win.__step(60);checkAim(); }
      win.__botCtl={};
    }
    const before = G.vm.ammo[kind];
    win.__botCtl = { ads: true }; win.dispatchEvent(new win.KeyboardEvent('keydown', { code: 'Tfire' })); win.__step(30); win.dispatchEvent(new win.KeyboardEvent('keyup', { code: 'Tfire' })); win.__botCtl = {}; win.__step(1);
    assert(G.vm.ammo[kind] < before, `${kind} 實際射擊消耗彈藥`);
    assert(G.vm.holder.position.toArray().every(Number.isFinite), `${kind} 舉槍與後座座標正常`);
    G.vm.reload(); win.__step(160);
    assert(G.vm.ammo[kind] === G.vm.W.mag && G.vm.reloadT < 0, `${kind} 換彈完成`);
    await save('zero-' + kind);
  }
  const geometries = new Set(); win.__scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
  report.textContent = JSON.stringify({ checks: result, metrics, geometries: geometries.size, memory: renderer.info.memory, errors }, null, 2);
  state.textContent = errors.length ? '有錯誤' : '前傳武器通過';
}

async function reconControls() {
  const checks=[];
  for(const path of ['zero','lastline']) {
    await load('/game/mech/'+path+'/index.html','?mute&god&ch=1&all&fps=0');
    const G=win.__G,T=win.__T,S=G.scout;renderer=win.__renderer;post={render:()=>win.__step(1)};
    T.Clock.prototype.getDelta=()=>.05;const step=n=>{win.__scene.updateMatrixWorld(true);win.__step(n);};
    const key=(code,n=1)=>{win.dispatchEvent(new win.KeyboardEvent('keydown',{code}));step(n);win.dispatchEvent(new win.KeyboardEvent('keyup',{code}));step(1);};
    step(30);const shoot=G.bolt;G.bolt=()=>{};G.bolts.length=0;const body=G.player.pos.clone(),ammo=G.vm.ammo[G.vm.cur];key('KeyN');assert(S.active,path+' N 透過正式控制放飛 '+JSON.stringify({p:G.player.pos.toArray(),busy:G.vm.busy,notes:G.hud.notes,pause:win.document.querySelector('#pause').style.display}));
    assert(!G.vm.holder.visible&&!G.vm.arms.root.visible,path+' 無人機畫面不被主角武器擋住');
    key('Space',10);const before=S.pos.clone();key('KeyW',12);
    assert(S.pos.distanceTo(before)>1&&G.player.pos.distanceTo(body)<.01,path+' 飛行控制與原地主角分離');
    key('M0',5);assert(G.vm.ammo[G.vm.cur]===ammo,path+' 操控時不會誤射主角武器');
    step(10);assert(G.contacts.items.size>0,path+' 偵察視線發現敵人並登記雷達');
    assert(S.active,path+' 截圖前仍在實際操控');G.hud.banner=null;G.hud.sub=null;G.hud.subQ.length=0;
    await save(path+'-scout-radar');G.bolt=shoot;
    const eye=G.playerEye.clone();G.bolt(eye.clone().add(new T.Vector3(0,0,.7)),new T.Vector3(0,0,-1),60,9,null);step(1);
    assert(!S.active&&S.reason.includes('主角遭到攻擊'),path+' 主角中彈的同一幀終止操控');
    assert(G.vm.holder.visible&&G.vm.arms.root.visible,path+' 同一幀恢復主角武器');
    assert(G.hud.cam.position.distanceTo(G.playerEye)<.01,path+' 同一幀鏡頭已回到主角眼睛');
    assert(S.cooldown>0,path+' 遭攻擊後有短暫重新放飛間隔');
    G.bolt=()=>{};G.bolts.length=0;step(60);key('KeyN');assert(S.active,path+' 冷卻後能重新放飛');key('KeyN');assert(!S.active,path+' N 手動返回');
    key('KeyN');assert(!S.active,path+' 返回後不會立刻連續放飛');
    G.bolt=shoot;assert(errors.length===0,path+' 雷達、操控、受擊切回沒有執行錯誤');checks.push(...result);
  }
  report.textContent=JSON.stringify({checks,errors},null,2);state.textContent='雷達與無人機通過';
}
async function patrolWorld() {
  const metrics=[];
  for(const [path,name] of [['zero','前傳'],['lastline','失落防線']]) {
    await load('/game/mech/'+path+'/index.html','?mute&god&ch=1&all&fps=0');
    const G=win.__G,T=win.__T,P=G.patrols,S=win.__S;
    renderer=win.__renderer;post={render:()=>win.__step(1)};
    assert(win.__flow.active.length===0,name+' 未進入任務觸發區');
    const r=P.group(S.ENCOUNTERS[0]).find(r=>r.actor&&r.def.patrol);
    assert(!!r,name+' 任務觸發前已看得到駐守巡邏兵');
    await save(path+'-resident-before-objective');
    const start=r.pos.clone();const render=renderer.render.bind(renderer);renderer.render=()=>{};
    T.Clock.prototype.getDelta=()=>.05;const step=n=>{win.__scene.updateMatrixWorld(true);win.__step(n);};
    step(100);assert(r.pos.distanceTo(start)>.5,name+' 哨兵沿路線巡邏');
    assert(win.__flow.active.length===0,name+' 巡邏不依賴任務啟動');
    const before=performance.now();step(600);const cpu=(performance.now()-before)/600;
    assert(G.enemies.filter(e=>!e.dead).length<=24,name+' 駐守人物模型受上限約束');
    assert(P.records.length>G.enemies.length,name+' 遠處部隊保存邏輯狀態，不建立全部骨架');
    r.actor.damage(30,new T.Vector3(0,0,-1),'body',G.player.pos);const hp=r.actor.hp;
    G.player.reset(new T.Vector3(path==='zero'?115:300,0,path==='zero'?115:300),0);step(20);
    assert(!r.actor,name+' 離開後回收遠處骨架');
    G.player.reset(start,0);step(20);assert(r.actor&&r.actor.hp===hp,name+' 回訪保留血量與警戒');
    r.actor.damage(10000,new T.Vector3(0,0,-1),'head',G.player.pos);step(1);
    const saved=P.snapshot();for(const e of G.enemies)e.dispose();G.enemies.length=0;
    P.reset(new Set(win.__flow.done),JSON.parse(JSON.stringify(saved)));P.update(0,true);
    assert(P.records.find(x=>x.key===r.key).dead,name+' 序列化與重載不會復活已擊倒的駐軍');
    metrics.push({game:name,logical:P.records.length,models:G.enemies.length,cpuMsPerStep:cpu});
    renderer.render=render;step(1);await save(path+'-persistent-patrol');
    assert(errors.length===0,name+' 巡邏與回收沒有執行錯誤');
  }
  report.textContent=JSON.stringify({checks:result,metrics,errors},null,2);state.textContent='常駐巡邏通過';
}
async function prequelFoot() {
  await load('/game/mech/zero/index.html','?mute&god&ch=1&all&fps=0');
  const G=win.__G,T=win.__T,S=win.__S,map=win.__map;
  renderer=win.__renderer;const render=renderer.render.bind(renderer);renderer.render=()=>{};
  T.Clock.prototype.getDelta=()=>.05;const step=n=>{win.__scene.updateMatrixWorld(true);win.__step(n);};
  const key=code=>{win.dispatchEvent(new win.KeyboardEvent('keydown',{code}));step(1);win.dispatchEvent(new win.KeyboardEvent('keyup',{code}));step(1);};
  const kill=()=>{for(const e of G.enemies)if(!e.dead)e.damage(10000,new T.Vector3(0,0,-1),'head',G.player.pos);};
  let peak=0;
  for(let ch=1;ch<=5;ch++) {
    if(ch>1){win.document.querySelector('#quit').click();win.document.querySelector('[data-c="'+ch+'"]').click();step(1);}
    for(const E of S.ENCOUNTERS.filter(e=>e.ch===ch)) {
      if(E.after)step(Math.ceil(((E.wait||0)+.2)/.05));
      else {const p=G.hud.obj?.route?.at(-1);assert(!!p,E.id+' 前傳路徑');G.player.reset(new T.Vector3(p.x,p.y-1.2,p.z),0);step(4);}
      assert(win.__flow.active.includes(E.id)||win.__flow.done.includes(E.id),E.id+' 前傳任務觸發');
      const operator=G.player.pos.clone();
      for(const r of G.patrols.group(E))if(!r.dead&&!r.actor){G.player.reset(r.pos.clone(),0);step(12);kill();}
      G.player.reset(operator,0);
      for(const id of E.targets||[]) {const o=map.targets[id]?.obj;if(o?.alive)G.destruct.hit(o,10000,o.pos,new T.Vector3(0,1,0));}
      for(const P of E.pickups||[]){const it=map.items[P.id];G.player.reset(it.p.clone(),0);step(1);key('KeyE');}
      if(E.pickup){G.player.reset(map.marks[E.pickup.at].clone(),0);step(1);key('KeyE');}
      let n=0;
      while(!win.__flow.done.includes(E.id)&&n++<2400){kill();step(1);peak=Math.max(peak,G.enemies.filter(e=>!e.dead).length);}
      assert(win.__flow.done.includes(E.id),E.id+' 前傳駐軍／增援／守點正常完成');
      assert(G.enemies.every(e=>e.pos.toArray().every(Number.isFinite)),E.id+' 所有人物座標正常');
    }
  }
  assert(peak<=24,'前傳全五章人物模型數有上限');assert(errors.length===0,'前傳完整步兵流程沒有執行錯誤');
  renderer.render=render;report.textContent=JSON.stringify({checks:result,peak,errors},null,2);state.textContent='前傳步兵全流程通過';
}
async function campaignFoot() {
  await load('/game/mech/lastline/index.html', '?mute&god&ch=1&all&fps=0');
  let G = win.__G, T = win.__T, map = win.__map, S = win.__S;
  renderer = win.__renderer; post = { render: () => win.__step(1) };
  assert(S.CHAPTERS.length === 7 && S.FIRST_MECH === 4, '獨立七章，三章步兵／四章機甲');
  assert(S.ENCOUNTERS.every(e => e.ch <= 3), '步兵路線全部屬於前三章');
  assert(S.LAYOUT === map.layout && !win.__world.cityEnabled && !win.__world.blds.length, '港區獨立地圖，沒有背後的舊住宅城市');
  assert(map.triangles < 120000 && map.meshes.length <= 12, `港區靜態結構 ${map.triangles} 三角形／${map.meshes.length} 合併網格`);
  win.__step(60); assert(G.vm.cur === 'smg', '續作預設衝鋒槍、三武器可切換');
  await save('lastline-infantry');
  let render = renderer.render.bind(renderer); renderer.render = () => {};
  T.Clock.prototype.getDelta = () => .05;
  const step = n => { win.__scene.updateMatrixWorld(true); win.__step(n); };
  const key = code => { win.dispatchEvent(new win.KeyboardEvent('keydown', { code })); step(1); win.dispatchEvent(new win.KeyboardEvent('keyup', { code })); step(1); };
  let current;
  const kill = () => { for (const e of G.enemies) if (!e.dead && (!e.resident || e.resident.E === current || e.pos.distanceTo(G.player.pos)<30&&(!e.resident.E.operation?.bypass||current.operation?.kind==='escort'))) e.damage(10000, new T.Vector3(0, 0, -1), 'head', G.player.pos); };
  for (const E of S.ENCOUNTERS) {
    current = E;
    assert(win.__flow.chapter === E.ch, `${E.id} 進入正確章節 ${E.ch}`);
    if (!E.after && !win.__flow.active.includes(E.id)) {
      const p = G.hud.obj?.route?.at(-1); assert(!!p, `${E.id} 有實際路徑指示`);
      G.player.reset(new T.Vector3(p.x, p.y - 1.2, p.z), 0); step(4);
    } else step(Math.ceil(((E.wait || 0) + .2) / .05));
    assert(win.__flow.active.includes(E.id)||win.__flow.done.includes(E.id), `${E.id} 實際觸發區啟動`);
    const bypassFoes=E.operation?.bypass?G.enemies.filter(e=>!e.dead):[];
    if(!E.operation?.bypass)kill();
    if (E.targets) for (const id of E.targets) { const obj = map.targets[id]?.obj; assert(!!obj, `${id} 可破壞目標存在`); G.destruct.hit(obj, 10000, obj.pos, new T.Vector3(0, 1, 0)); }
    for (const pickup of E.pickups || []) {
      const it = map.items[pickup.id]; assert(!!it, `${pickup.id} 情報／互動道具存在`);
      G.player.reset(it.p.clone(), 0); step(1); key('KeyE');
    }
    if (E.pickup) { const at = map.marks[E.pickup.at]; G.player.reset(at.clone(), 0); step(1); key('KeyE'); }
    if (E.hold) for (let i = 0; i < Math.ceil((E.hold.t + 1) / .05); i++) { kill(); step(1); }
    if(E.operation) {
      const op=win.__flow.operations.find(a=>a.id===E.id)?.operation;assert(!!op,E.id+' 現場任務存在');
      const task=op.task;
      if(task.kind==='escort')assert(op.crew.length===2&&op.crew.every(s=>s.root.parent===G.scene),E.id+' 兩名救援工程兵實際出現');
      let steps=0;
      if(task.kind==='console')win.dispatchEvent(new win.KeyboardEvent('keydown',{code:'KeyE'}));
      while(!task.done&&steps++<3000){
        const p=task.point;G.player.reset(new T.Vector3(p[0],p.y||0,p[1]),0);
        if(!E.operation.bypass)kill();step(1);
      }
      win.dispatchEvent(new win.KeyboardEvent('keyup',{code:'KeyE'}));
      assert(task.done,E.id+' 到場操作／分區防守／實際護送完成');
      if(task.kind==='escort')assert(op.crew.every(s=>Math.hypot(s.pos.x-task.pos[0],s.pos.z-task.pos[1])<1.2),E.id+' 人物抵達護送終點');

    }
    if(!E.operation?.bypass) {
      for(let n=0;n<1200&&!win.__flow.done.includes(E.id);n++){kill();step(1);assertSilent(G.enemies.filter(e=>!e.dead).length<=24,'駐守模型與增援上限');}
    }
    step(4);
    if(E.operation?.bypass)assert(bypassFoes.some(e=>!e.dead)&&bypassFoes.some(e=>G.enemies.includes(e)),E.id+' 巡邏隊繼續存在，不必清光也能離開');
    assert(win.__flow.done.includes(E.id), `${E.id} 擊倒／目標／互動／守點完成` + (win.__flow.done.includes(E.id)?'':JSON.stringify({sub:G.objSub,player:G.player.pos.toArray(),residents:G.patrols.group(E).map(r=>({key:r.key,dead:r.dead,state:r.state,pos:r.pos.toArray(),loaded:!!r.actor})),alive:G.enemies.filter(e=>!e.dead).map(e=>({group:e.resident?.E.id,state:e.state,pos:e.pos.toArray()}))})));
    if(E.id==='B5'){G.player.reset(new T.Vector3(-180,0,-134),0);step(3);renderer.render=render;await save('lastline-rescue');renderer.render=()=>{};frame.focus();}
    if (E.id === 'C7' || E.id === 'D3') {
      const p = E.mark; G.player.reset(new T.Vector3(p.x, 0, p.z), 0); step(4);
      assert(win.__flow.chapter === E.ch + 1, `自然銜接第 ${E.ch + 1} 章`);
    }
  }
  assert(G.hud.obj?.route?.length === S.HATCH_ROUTE.length, '機庫完成後出現完整登機路線');
  // 用正式人物移動爬樓梯，不能只把玩家傳送到登機平台。
  G.player.reset(new T.Vector3(S.HATCH_ROUTE[0][0], 0, S.HATCH_ROUTE[0][1]), 0);
  for (const [x, z, y = 0] of S.HATCH_ROUTE.slice(1)) {
    let n = 0;
    while (Math.hypot(G.player.pos.x - x, G.player.pos.z - z) > .16 && n++ < 1600) {
      G.player.yaw = Math.atan2(x - G.player.pos.x, z - G.player.pos.z);
      G.player.update(1 / 60, { mx: 0, my: 1, lookX: 0, lookY: 0 });
    }
    assert(n < 1600 && Math.abs(G.player.pos.y - y) < .2, `實際步行登機路線 ${x},${z},${y}`);
  }
  const saved = JSON.parse(win.localStorage.getItem('lastline.checkpoint'));
  assert(saved.foot.done.includes('G2') && saved.chapter === 3, '步兵檢查點保存完成遭遇與章節');
  const footChecks = result;
  await load('/game/mech/lastline/index.html', '?mute&god&all&fps=0'); result = footChecks;
  win.document.querySelector('#campaignResume').click(); win.__step(2);
  assert(win.__flow.chapter === 3 && win.__flow.done.includes('G2'), '重新載入後保留步兵進度，不必重打一整章');
  G = win.__G; T = win.__T; map = win.__map; S = win.__S; renderer = win.__renderer;
  render = renderer.render.bind(renderer); renderer.render = () => {}; T.Clock.prototype.getDelta = () => .05;
  assert(G.hud.obj?.route?.length === S.HATCH_ROUTE.length, '續玩恢復登機路線與互動');
  // 沿實際胸前平台觸發艙門，再用正式互動進入機甲。
  const hp = win.__hero.bones.torso.localToWorld(win.__hero.cockpitLocal.clone());
  G.player.reset(new T.Vector3(hp.x, map.marks.hatch.y, map.marks.hatch.z), 0); step(58);
  assert(G.hud.prompt?.includes('駕駛艙'), '艙門開啟與胸前平台互動'); key('KeyE'); step(130);
  renderer.render = render; await wait(() => win.__m6); win.__step(3);
  assert(win.__flow.chapter === 4 && win.__m6.mission, '步兵結尾實際交接續作車隊章');
  assert(errors.length === 0, '完整步兵遭遇到機甲交接沒有執行錯誤');
  report.textContent = JSON.stringify({ checks: result, errors }, null, 2); state.textContent = '步兵全流程通過';
}
async function campaignMech(chapter = 4, choice = 'rescue') {
  await load('/game/mech/lastline/index.html', `?mute&ch=${chapter}&all&fps=0`);
  await wait(() => win.__m6); win.__step(200);
  const M = win.__m6, T = win.__T, mission = M.mission;
  renderer = win.__renderer; post = { render: () => win.__step(1) };
  assert(!!mission && mission.truck.triangles < 4000, `兩輛車共享 ${mission.truck.triangles} 三角形／6 個網格，無新貼圖光源`);
  assert(M.combat.rifle.mag === 40, '機甲沿用 40 發彈匣');
  assert(M.combat.enemies.filter(e=>!e.dead).length <= 7, '車隊章同時單位預算受限');
  for (const q of [0, 2, 1]) { win.document.querySelector(`[data-q="${q}"]`).click(); win.__step(2); assert(errors.length === 0, `第 ${chapter} 章畫質 ${q} 渲染正常`); }
  await save(`lastline-convoy-${chapter}`);
  if(chapter===6){
    const warning=win.__scene.getObjectByName('lastline-salvo-warning'),op=mission.operation;
    M.player.pos.set(op.point[0],0,op.point[1]);const hp=M.player.ap;
    for(let i=0;i<320;i++)mission.tick(.05);
    if(choice==='artillery')assert(!warning.visible&&M.player.ap===hp,'壓制砲陣分支取消遠程落點砲擊');
    else {
      assert(M.player.ap<hp,'砲擊落點具有實際傷害');
      for(let i=0;i<300&&!warning.visible;i++)mission.tick(.05);
      assert(warning.visible,'下一發先出現紅色地面預警');M.player.pos.x+=30;const dodgeHp=M.player.ap;
      for(let i=0;i<120;i++)mission.tick(.05);
      assert(M.player.ap===dodgeHp,'離開預警落點可避開砲擊傷害');
    }
  }
  const memory = { ...renderer.info.memory }, render = renderer.render.bind(renderer); renderer.render = () => {};
  // 戰鬥傷害命中、敵機退場與正式波次控制皆執行；自動檢查隔離玩家受傷。
  M.combat.hurt = () => {};
  const step = n => { win.__scene.updateMatrixWorld(true); for (let i = 0; i < n; i++) M.tick(.05); };
  const kill = () => { for (const e of M.combat.enemies) if (!e.dead) M.combat.damageEnemy(e, 100000, 1000, e.pos.clone(), new T.Vector3(0, 1, 0), true); };
  let chosen = false;
  let ops=0;
  for (let i = 0; i < 6000 && !M.ending; i++) {
    M.player.ap = M.player.apMax;
    if (!mission.panel.hidden && mission.panel.querySelector('[data-choice]')) { mission.panel.querySelector(`[data-choice="${choice}"]`).click(); chosen = true; }
    const task=mission.operation,p=task&&!task.done?task.point:mission.convoy.pos;
    M.player.pos.set(p[0]-(task&&!task.done?0:18),0,p[1]);M.player.vel.set(0,0,0);
    if(task&&!task.done) {win.dispatchEvent(new win.KeyboardEvent('keydown',{code:'KeyB'}));ops++;}
    else win.dispatchEvent(new win.KeyboardEvent('keyup',{code:'KeyB'}));
    kill(); step(1);
    assertSilent(M.combat.enemies.filter(e=>!e.dead&&!e.gone).length<=7,'機甲同時活動敵人最多七個');
    assertSilent(M.player.pos.toArray().every(Number.isFinite) && mission.truck.trucks.every(r => r.position.toArray().every(Number.isFinite)), '車隊與護衛位置');
    if (!mission.panel.hidden && mission.panel.querySelector('[data-retry]')) throw Error('自動流程意外失敗：' + mission.panel.textContent);
  }
  assert(!!M.ending, `第 ${chapter} 章所有戰鬥與車隊路段通關`);
  assert(mission.convoy.index === mission.convoy.route.length - 1, '車隊實際抵達終點，無跳過運送');
  assert(ops>0,'機甲通關必須完成現場任務，清敵不能直接跳過');
  if (chapter === 4) {
    assert(chosen && mission.convoy.choice === choice, `分支選擇 ${choice} 正確保存`);
  }
  if(chapter<7){
    step(550);await wait(()=>win.__m6&&win.__flow.chapter===chapter+1);
    assert(win.__m6.mission.convoy.choice===choice,'自然銜接下一章，保留選擇與車隊狀態');
  }
  renderer.render = render; M.tick(.05);
  if (chapter === 7) {
    step(170); renderer.render = render; M.tick(.05);
    assert(mission.evacGate.beam.rotation.z > 1.5 && mission.truck.trucks[1].position.z < -405, '閘門打開，兩輛車實際通過救援站');
    await save('lastline-evacuation');
    renderer.render = () => {}; step(380); renderer.render = render;
    assert(!mission.panel.hidden && mission.panel.textContent.includes('全篇完'), '自然進入完整結局、統計、重玩與大廳入口');
    assert(mission.panel.textContent.includes(choice === 'rescue' ? '誰也沒有被留下' : '沉默的砲台'), '結局對應已保存的救援選擇');
  }
  report.textContent = JSON.stringify({ checks: result, memory, choice: mission.convoy.choice, hp: mission.convoy.hp, errors }, null, 2);
  state.textContent = '機甲全流程通過';
}
async function campaignEdges() {
  await load('/game/mech/lastline/index.html', '?mute&ch=4&all&fps=0'); await wait(() => win.__m6); win.__step(200);
  let M = win.__m6, mission = M.mission;
  let saved = JSON.parse(win.localStorage.getItem('lastline.checkpoint'));
  const enemy = M.combat.enemies.find(e => !e.vehicle); enemy.pos.set(mission.convoy.pos[0] + 60, 0, mission.convoy.pos[1]);
  const hp = mission.convoy.hp;
  for (let i = 0; i < 220; i++) mission.tick(.05);
  assert(mission.convoy.hp < hp, '遠程標定後的實際射線命中車隊');
  const damaged = mission.convoy.hp;
  enemy.dead = true;
  for (const e of M.combat.enemies) e.dead = true;
  for (let i = 0; i < 220; i++) { for (const e of M.combat.enemies) e.dead = true; mission.tick(.05); }
  assert(mission.convoy.hp === damaged, '預警期間擊倒標定敵人，取消射擊');
  const op=mission.operation,at=op.point;M.player.pos.set(at[0],0,at[1]);
  win.dispatchEvent(new win.KeyboardEvent('keydown',{code:'KeyB'}));for(let i=0;i<90;i++)mission.tick(.05);
  win.dispatchEvent(new win.KeyboardEvent('keyup',{code:'KeyB'}));
  assert(op.done,'按住 B 接通設施，檢查點保留完成站');
  saved=JSON.parse(win.localStorage.getItem('lastline.checkpoint'));
  const before = mission.convoy.snapshot(); win.dispatchEvent(new win.Event('blur')); win.__step(100);
  assert(JSON.stringify(mission.convoy.snapshot()) === JSON.stringify(before), '失焦暫停不推進車隊與計時');
  win.document.querySelector('#resume').click();
  mission.convoy.damage(1000); mission.tick(.05);
  assert(!mission.panel.hidden && mission.panel.textContent.includes('失去行動能力'), '車隊耗盡耐久顯示失敗與重試');
  mission.panel.querySelector('[data-retry]').click(); win.__step(4);
  assert(mission.convoy.hp === saved.convoy.hp && M.wave === saved.wave, '重試恢復安全路口、耐久與波次');
  assert(mission.operation.done,'戰敗重試保留已接通的控制站');
  M.player.qbT = 0; M.combat.hurt(100000, M.player.pos.clone());
  for (let i = 0; i < 70; i++) M.tick(.05);
  assert(!mission.panel.hidden && mission.panel.textContent.includes('蒼焰失去戰力'), '玩家戰敗也使用相同檢查點重試');
  mission.panel.querySelector('[data-retry]').click(); win.__step(4);
  const edgeChecks = result;
  await load('/game/mech/lastline/index.html', '?mute&all&fps=0'); result = edgeChecks;
  assert(!win.document.querySelector('#campaignResume').hidden, '重載標題保留檢查點入口');
  win.document.querySelector('#campaignResume').click(); await wait(() => win.__m6); win.__step(200);
  M = win.__m6; mission = M.mission;
  assert(win.__flow.chapter === 4 && M.wave === saved.wave && mission.convoy.hp === saved.convoy.hp, '重載後從檢查點啟動正確章節');
  assert(mission.operation.done,'重載檢查點保留完成的現場作業');
  assert(errors.length === 0, '存檔／暫停／兩種戰敗沒有執行錯誤');
  report.textContent = JSON.stringify({ checks: result, errors }, null, 2); state.textContent = '續作邊界檢查通過';
}
const assertSilent = (ok, text) => { if (!ok) throw Error(text); };

for (const [id, fn] of [['reconControls', reconControls], ['prequelFoot', prequelFoot], ['patrolWorld', patrolWorld], ['japaneseSigns', japaneseSigns], ['harborArt', harborArt], ['campaignFoot', campaignFoot], ['campaign4', () => campaignMech(4)], ['campaign5', () => campaignMech(5)], ['campaign6', () => campaignMech(6)], ['campaign7', () => campaignMech(7)], ['campaign6Artillery', async()=>{localStorage.setItem('lastline.choice',JSON.stringify('artillery'));await campaignMech(6,'artillery');}], ['campaignArtillery', async () => { localStorage.setItem('lastline.choice', JSON.stringify('artillery')); await campaignMech(7, 'artillery'); }], ['campaignEdges', campaignEdges], ['mech', mech], ['fields', battlefields], ['enemyMotion', enemyMotion], ['zero', zero], ['tactics', tactics], ['prequelMechCampaign', prequelMechCampaign], ['campaignMain', campaignMain], ['enemyPressure', enemyPressure], ['infantry', infantry], ['art', art], ['hero', hero], ['city', city], ['mountains', mountains], ['weapons', weapons], ['save', save]]) document.querySelector('#' + id).onclick = () => fn().catch(e => { state.textContent = '失敗'; report.textContent += '\n' + e.stack; });

async function harborArt() {
  await load('/game/mech/lastline/index.html', '?mute&god&ch=1&all&fps=0');
  renderer = win.__renderer; post = { render: () => win.__step(1) };
  win.__G.player.reset(new win.__T.Vector3(-180, 0, -193), 0); win.__step(3);
  const map=win.__map, shelves=win.__solid.list.filter(b=>b.x1<100 && b.y1>2.8 && b.y1<3.2 && b.x1-b.x0<2 && b.z1-b.z0<1);
  assert(shelves.length===12,'十二座掃描貨架為三公尺高，海關、冷藏站和修船棚沒有穿出屋頂的大貨架');
  assert(map.triangles<120000 && map.meshes.length<=9,'港區合併幾何維持十二萬三角形，至多九個材質網格');
  await save('lastline-customs', true);
  const footChecks=[...result];
  await load('/game/mech/lastline/index.html', '?mute&ch=4&all&fps=0'); await wait(() => win.__m6); win.__step(200);
  result.unshift(...footChecks);
  const M = win.__m6, C = M.combat, camera = C.camera, world = win.__world;
  renderer = win.__renderer; post = { render: () => C.post.render(1) };
  M.player.pos.set(610, 0, 90); M.player.yaw = -.6; M.player.vel.set(0, 0, 0); M.hero.legYaw = M.player.yaw; M.hero.motion.yawPrev = null; M.tick(.016);
  win.__see.a.value = 0; win.__see.c.value.w = win.__see.t.value.w = 0;
  win.__scene.updateMatrixWorld(true);
  camera.position.set(601, 12, 111); camera.lookAt(615, 10, 86); world.followShadow(camera.position);
  await save('lastline-harbor', true);
  camera.position.set(550, 36, -300); camera.lookAt(650, 14, -450); world.followShadow(camera.position);
  await save('lastline-breakwater', true);
  assert(errors.length === 0, '海關、港區與防波堤實際畫面沒有渲染錯誤');
  report.textContent = JSON.stringify({ checks: result, staticTriangles:map.triangles, staticMeshes:map.meshes.length, memory: renderer.info.memory, errors }, null, 2); state.textContent = '北濱港美術通過';
}

async function japaneseSigns() {
  const checks = [];
  for (const [name, path, query, size] of [
    ['main', '/game/mech/index.html', '?mute&nobrief&fps=0', [1024, 512]],
    ['prequel', '/game/mech/zero/index.html', '?mute&god&ch=1&all&fps=0', [1024, 512]],
    ['harbor', '/game/mech/lastline/index.html', '?mute&god&ch=1&all&fps=0', [512, 256]],
  ]) {
    await load(path, query); result = checks;
    const labels = name === 'harbor' ? PORT_LABELS : SHOP_LABELS.slice(4).concat(SHOP_SUBTITLES.slice(4));
    const faces = await win.document.fonts.load('700 45px "Noto Sans JP"', labels.join(''));
    assert(faces.length > 0 && win.document.fonts.check('700 45px "Noto Sans JP"', labels.join('')), name + ' 正確日文字型載入，沒有缺字替代');
    let cv;
    (win.__game?.world.scene || win.__scene).traverse(o => {
      const c = o.material?.map?.image;
      if (c?.tagName === 'CANVAS' && c.width === size[0] && c.height === size[1]) cv = c;
    });
    assert(!!cv, name + ' 真實場景共用招牌貼圖存在');
    const cx = cv.getContext('2d'); cx.font = 'bold 45px ' + JAPANESE_FONT;
    assert(labels.every((t, i) => { cx.font = (name === 'harbor' ? [48, 32, 24][i] : i < 4 ? 45 : 20) + 'px ' + JAPANESE_FONT; return cx.measureText(t).width <= (name === 'harbor' ? 496 : 236); }), name + ' 招牌文字留在版面內');
    const data = cv.toDataURL('image/png');
    const a = document.createElement('a'); a.href = data; a.download = 'japanese-' + name + '-signs.png'; a.textContent = '招牌圖集 ' + name;
    const img = document.createElement('img'); img.src = data; img.style.width = '512px'; a.append(img); document.querySelector('#captures').append(a);
    assert(errors.length === 0, name + ' 招牌顯示沒有執行錯誤');
  }
  report.textContent = JSON.stringify({ checks, shops: SHOP_LABELS, subtitles: SHOP_SUBTITLES, port: PORT_LABELS }, null, 2);
  state.textContent = '三款招牌通過';
}
