// 開發用：透過真實遊戲模組與既有除錯介面做固定步進，所有載入均帶 mute。
const frame = document.querySelector('#game'), report = document.querySelector('#report'), state = document.querySelector('#state');
let win, result = [], errors = [], post, renderer;
const assert = (ok, message) => { if (!ok) throw Error(message); result.push(message); report.textContent = JSON.stringify({ checks: result, errors }, null, 2); };
const wait = async (f) => { for (let i = 0; i < 600; i++) { if (f()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('載入逾時'); };
async function load(path, query = '') {
  result = []; errors = []; state.textContent = '載入中';
  document.querySelector('#captures').replaceChildren();
  const html = await (await fetch(path)).text();
  const control = `<base href="${path}"><script>window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));window.__raf=[];window.requestAnimationFrame=fn=>(__raf.push(fn),__raf.length);window.__step=(n=1)=>{for(let i=0;i<n;i++){const q=__raf.splice(0);for(const f of q)f(performance.now())}};<\/script>`;
  // srcdoc has its own queryless URL, so replace the main module with an explicit wrapper setting the desired query via parent-provided URLSearchParams.
  const setup = `<script>const NativeParams=URLSearchParams;window.URLSearchParams=class extends NativeParams{constructor(v){super(v===location.search?'${query}':v)}};<\/script>`;
  frame.srcdoc = html.replace('<head>', '<head>' + control + setup);
  win = frame.contentWindow;
  await new Promise(r => frame.onload = r);
  await wait(() => win.__game || win.__G || win.__mechs);
  // Each iframe gets its own module instance; use the iframe's module graph.
  const script = win.document.createElement('script'); script.type = 'module';
  script.textContent = `import * as T from 'three'; T.Clock.prototype.getDelta=()=>1/60; window.__T=T;`;
  win.document.head.append(script); await wait(() => win.__T);
  win.__step(2); frame.focus();
  errors = win.__qaErrors;
}
async function save(name = 'capture') {
  if (!post) return;
  post.render(1);
  const data = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a'); a.href = data; a.download = name + '.png'; a.textContent = '下載 ' + name;
  document.querySelector('#captures').append(a);
  // Preview PNG includes only the game canvas, captured immediately after rendering.
  const img = document.createElement('img'); img.src = data; img.style.width = '180px'; a.append(img);
}
async function mech() {
  await load('/game/mech/index.html', '?mute&nobrief&fps=0');
  const G = win.__game; post = G.post; renderer = post.renderer;
  for (let n = 1; n <= 10; n++) {
    G.launch(n); G.run(4); G.fake = { my: 1, mx: 0.3, fire: true, boost: false }; G.run(0.5); G.fake = null;
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
  G.launch(1); G.run(3.5); G.input.keys.add('KeyW');
  win.dispatchEvent(new win.Event('blur'));
  assert(G.state === 'paused' && G.input.keys.size === 0, '失焦自動暫停、清除持續移動');
  win.document.querySelector('#resume').click(); G.tick(1 / 60);
  assert(G.state === 'play', '暫停後恢復戰鬥');
  await save('mech-battle');
  report.textContent = JSON.stringify({ checks: result, sizes, memory: renderer.info.memory, errors }, null, 2);
  state.textContent = errors.length ? '有錯誤' : '本篇通過';
}
async function zero() {
  await load('/game/mech/zero/index.html', '?mute&god&ch=1&all&fps=0');
  const G = win.__G; renderer = win.__renderer;
  // Wrapper around the real render call allows in-memory captures without preserving every frame's framebuffer.
  post = null;
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
  const W = win.__world, b = W.blds.find(b => b.seg.length === 3);
  assert(!!b, '店面招牌納入可破壞建築');
  const sign = b.seg[2], original = sign.a.array.slice(sign.s * 3, sign.s * 3 + sign.o.length);
  const hit = W.hitBuilding(new win.__T.Vector3(b.x0, b.H / 2, b.cz), 100, new win.__T.Vector3(-1, 0, 0));
  assert(hit === b, '真實命中介面可摧毀建築');
  for (let i = 0; i < Math.ceil((b.dur + 1) * 60); i++) W.update(1 / 60);
  assert(sign.a.array[sign.s * 3 + 1] < -20, '建築倒塌時招牌一同移除');
  W.resetBuildings(); assert(original.every((v,i) => sign.a.array[sign.s * 3 + i] === v), '重開關卡完整復原招牌');
  state.textContent = '街景通過';
}
for (const [id, fn] of [['mech', mech], ['zero', zero], ['art', art], ['hero', hero], ['city', city], ['save', save]]) document.querySelector('#' + id).onclick = () => fn().catch(e => { state.textContent = '失敗'; report.textContent += '\n' + e.stack; });
