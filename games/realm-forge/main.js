import { World, BUILDINGS, TILE_NAMES, DEFAULT_UNITS, clone, clamp, defaultProject, validateProject, generateMap, enrichMapResources, findPath, tileType, setTile, buildingBounds } from './core.mjs?v=20261009d';
import { CIVILIZATION, TECHNOLOGIES, STANCES, FORMATIONS } from './civilization.mjs?v=20261009d';
import { Renderer, COLORS, SYMBOLS, drawUnit, wheelZoomFactor } from './renderer.js?v=20261009f';
import { artReady } from './art.mjs?v=20261009d';
import { upgradeLegacyMap, upgradeDefaultUnits, setEnemyCount, spreadStartingPositions } from './project-upgrades.mjs?v=20261009d';
import { buildKeys, productionKey, menuKey, orderHint, technologyKey, commandKey, eventKey, GO_TO_BUILDINGS } from './controls.mjs?v=20261009d';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const STORAGE = 'realm-forge-project-v1';
const BATTLE_STORAGE='realm-forge-battle-v1';
let project = validateProject(defaultProject()), storageError = '', mapUpgraded = false;
try { const saved = localStorage.getItem(STORAGE); if (saved) { project = validateProject(JSON.parse(saved)); mapUpgraded = upgradeLegacyMap(project); } } catch { storageError = '儲存檔無法讀取，已載入預設王國。'; }
mapUpgraded = upgradeDefaultUnits(project) || mapUpgraded;
project.rules.hotkeys = 'definitive';
let world = new World(project), editId = project.units[0].id, uploadedImage = null;
const ui = { mode: 'map', started: false, paused: true, selected: new Set(), placement: null, attackMove: false, orderMode: null, formation: 'line', buildMenu: false, buildPage: 'economy', extendedTooltips:true, brush: 'grass', brushSize: 1, spawnBrush: null, heroBrush: null, heroSelected: null, groups: {}, dirty: false };
const renderer = new Renderer($('map'), $('minimap')); renderer.project = project; renderer.fit(project.map);
let lastRender=0, simulationLag=0;
let pointer = null, pointerPos = null, keys = new Set(), undo = [], lastTick = performance.now(), lastHud = 0, toastTimer = 0, frameTime = 0, fps = 60, groupPressed = { key: '', time: 0 }, actions = [];
let draftsDirty = false, paintLast = null;
const unitDrafts = new Map();
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3200); }
function timeLabel(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
let fullscreenFallback = false, fullscreenBusy = false;
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function syncFullscreen() {
  const active = Boolean(fullscreenElement() || fullscreenFallback), button = $('fullscreen-button');
  document.body.classList.toggle('fullscreen-mode', active);
  button.textContent = active ? '⛶ 退出' : '⛶ 全螢幕';
  button.setAttribute('aria-label', active ? '退出全螢幕' : '全螢幕');
  button.setAttribute('aria-pressed', String(active));
  button.title = `${active ? '退出全螢幕 · Esc' : '全螢幕'} · Alt＋Enter`;
  keys.clear(); pointerPos = null; renderer.resize();
  if (!document.querySelector('dialog[open]')) $('map').focus({preventScroll:true});
}
async function toggleFullscreen() {
  if (fullscreenBusy) return;
  fullscreenBusy = true;
  try {
    if (fullscreenElement()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (fullscreenFallback) {
      fullscreenFallback = false;
    } else {
      const root = document.documentElement, request = root.requestFullscreen || root.webkitRequestFullscreen;
      try {
        if (!request) throw new Error('Fullscreen is unavailable');
        await request.call(root, {navigationUI:'hide'});
      } catch {
        fullscreenFallback = true;
        toast('此瀏覽器未開放系統全螢幕，已放大遊戲畫面；按 Esc 可退出。');
      }
    }
  } catch { toast('無法退出全螢幕，請按 Esc。'); }
  finally { fullscreenBusy = false; syncFullscreen(); }
}
for (const name of ['fullscreenchange','webkitfullscreenchange']) document.addEventListener(name, syncFullscreen);
function markDirty() { ui.dirty = true; $('save-status').textContent = '尚未儲存'; }
function previewReset() { renderer.restoreView(); world = new World(project); ui.started = false; ui.paused = true; ui.selected.clear(); ui.groups = {}; ui.placement = null; ui.heroBrush = null; ui.heroSelected = null; ui.attackMove = false; ui.orderMode = null; ui.buildMenu = false; $('result').hidden = true; renderer.project = project; updateHud(true); if (world.deploymentErrors?.length) toast(world.deploymentErrors[0]); }
function validResourceInputs() { const input=[...document.querySelectorAll('[data-player-resource]')].find(el=>!el.checkValidity()); if (input) { input.reportValidity(); toast('我方起始資源請輸入 0–1,000,000 的整數。'); return false; } return true; }
function commitProject() {
  if (!validResourceInputs()) return;
  try { localStorage.setItem(STORAGE, JSON.stringify(validateProject(project))); ui.dirty = false; $('save-status').textContent = '已儲存在本機'; toast('地圖、兵種與規則已儲存在這個瀏覽器。'); }
  catch (e) { toast(`無法儲存：${e.message}。請使用匯出備份。`); }
}
function saveBattle() {
  if (!ui.started) { commitProject(); return; }
  try { const state=world.saveState(); state.selected=[...ui.selected];state.groups=ui.groups; localStorage.setItem(BATTLE_STORAGE,JSON.stringify(state));$('load-battle').disabled=false;toast(`戰役已儲存 · ${timeLabel(world.time)}。可用「讀取戰役」接續進度。`); }
  catch(err) { toast(`戰役無法儲存：${err.message}`); }
}
function loadBattle() {
  try { const state=JSON.parse(localStorage.getItem(BATTLE_STORAGE)); const restored=World.fromState(state);world=restored;project=clone(restored.project);project.rules.hotkeys='definitive';ui.started=true;ui.paused=true;simulationLag=0;ui.groups=state.groups||{};ui.selected=new Set(state.selected||[]);$('result').hidden=true;switchMode('play');renderer.zoom=1.1;renderer.center(ownEntities()[0]||project.map.spawns[0]);toast(world.result ? `已載入 ${timeLabel(world.time)} 的戰役結果。` : `已載入 ${timeLabel(world.time)} 的戰役；按 F3 繼續。`); }
  catch(err) {toast(`戰役無法讀取：${err.message}`);}
}
function startBattle() {
  if (!validResourceInputs()) return;
  if (ui.mode !== 'play') switchMode('play');
  if (!ui.started) {
    try {
      project = validateProject(project);
      const a = project.map.spawns[0];
      world = new World(project); if (world.deploymentErrors?.length) throw new Error(world.deploymentErrors[0]); const town = world.buildings.find(b=>b.team===0&&b.type==='town') || a;
      if (project.map.size <= 128) for (const b of world.buildings.filter(b=>b.type==='town'&&b.team!==0)) if (!findPath(town, b, project.map.size, (x, y) => !['grass', 'sand', 'road'].includes(tileType(project.map, x, y)), 1.5)) throw new Error('出生點之間沒有可行走的通路，請在地圖編輯器開一條道路。');
      ui.selected.clear(); ui.groups = {}; ui.started = true; renderer.center(town); renderer.zoom = Math.max(renderer.zoom, 1.1); renderer.center(town);
    } catch (e) { toast(e.message); return; }
  }
  ui.paused = !ui.paused; $('map').focus({ preventScroll: true }); updateHud(true);
}
function switchMode(mode) {
  if (mode !== 'play') $('result').hidden = true;
  if (ui.mode === 'units' && mode !== 'units' && draftsDirty) toast('尚未套用的兵種編輯已保留在表單，離開後請記得套用。');
  ui.mode = mode; ui.paused = true; ui.placement = null; ui.heroBrush = null; ui.heroSelected = null; ui.attackMove = false; ui.orderMode = null; ui.buildMenu = false;
  document.body.dataset.mode = mode;
  $('sidebar').hidden = mode === 'play';
  (mode === 'play' ? $('hud-minimap') : $('canvas-wrap')).append(document.querySelector('.minimap-wrap'));
  pointerPos = null;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.mode === mode);
  const copy = { play: ['親自指揮你的王國。', `決定版預設操控 · ${CIVILIZATION.ages[project.rules.startAge]} · ${opponentLabel()}`], map: ['先打造世界，再踏上戰場。', `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格世界。設計地景、資源與出生點，完成後直接開戰。`], units: ['創造你自己的英雄。', '自由設定攻擊、防禦、生命與外觀，帶著英雄進入你的地圖。'] };
  $('page-title').textContent = copy[mode][0]; $('page-description').textContent = copy[mode][1];
  $('canvas-tip').innerHTML = mode === 'map' ? '<kbd>左鍵拖曳</kbd> 畫地形 <span>·</span> <kbd>中鍵</kbd> 移動畫面' : '<kbd>左鍵</kbd> 選取 <span>·</span> <kbd>右鍵</kbd> 下指令 <span>·</span> <kbd>滾輪</kbd> 縮放';
  if (mode === 'map') { renderer.restoreView(); renderer.project = project; renderer.zoom = .9; renderer.center(project.map.spawns[0]); }
  renderSidebar(); renderer.resize();
  if (mode === 'play') { if (!ui.started) renderer.center(world.buildings.find(b=>b.team===0&&b.type==='town') || project.map.spawns[0]); $('map').focus({preventScroll:true}); }
  updateHud(true);
}
function selectedEntities() { return [...ui.selected].map(id => world.entity(id)).filter(Boolean); }
function opponentLabel() { const count = project.map.spawns.length - 1; return project.rules.aiAlliance && count > 1 ? `${count} 個 AI 結盟對抗我方` : `對抗 ${count} 個 AI 王國`; }
function ownEntities() { return selectedEntities().filter(e => e.team === 0 && !e.garrison); }
function select(ids, append = false, toggle = true) { if (!append) ui.selected.clear(); for (const id of ids) { if (append && toggle && ui.selected.has(id)) ui.selected.delete(id); else ui.selected.add(id); } ui.buildMenu = false; ui.placement=null; ui.orderMode=null; ui.attackMove=false; updateHud(true); }
function pruneHeroPlacements(map, units = project.units) { const ids = new Set(units.filter(u=>u.hero).map(u=>u.id)); map.heroPlacements = (map.heroPlacements || []).filter(p=>ids.has(p.unitId)); }
function renderHeroPanel() {
  const heroes = project.units.filter(u=>u.hero), active = heroes.find(u=>u.id===ui.heroBrush);
  return `<div class="panel-section"><div class="section-label">我方英雄 <button data-action="hero-workshop" class="small-button">創造英雄 ♞</button></div><p class="muted">AI 沒有英雄。選擇英雄，再按「放到地圖」決定登場位置。</p>${active?`<p class="muted">正在放置「${escape(active.name)}」：點草地、道路或沙地，避開資源、建築預定占地與其他英雄。</p><button data-action="cancel-hero">取消放置 · Esc</button>`:''}<div class="unit-list">${heroes.map(u=>{const p=project.map.heroPlacements?.find(p=>p.unitId===u.id);return `<button class="unit-card ${ui.heroSelected===u.id||ui.heroBrush===u.id?'active':''}" data-hero-view="${u.id}"><span class="unit-symbol" style="color:${u.color}">${SYMBOLS[u.look]}</span><span><strong>★ ${escape(u.name)}</strong><small>${p?`位置 ${p.x}, ${p.y}${world.canPlaceHero(u.id,p.x,p.y)?'':' · 需要調整'}`:'市鎮旁自動登場'} · 回血 ${u.regen??1}/秒</small></span><b>›</b></button>`;}).join('')}</div>${ui.heroSelected?`<div class="form-actions"><button class="primary" data-hero-place="${ui.heroSelected}">放到地圖</button><button data-action="reset-hero">回市鎮旁</button></div>`:''}</div>`;
}
function beginHeroPlacement(id) {
  const hero = project.units.find(u=>u.id===id&&u.hero); if (!hero) { toast('請先建立並套用一位英雄。'); return; }
  previewReset(); switchMode('map'); ui.heroBrush = id; ui.heroSelected = id; ui.spawnBrush = null;
  renderer.center(project.map.heroPlacements?.find(p=>p.unitId===id) || project.map.spawns[0]); renderSidebar(); $('sidebar').scrollTop = 0; updateHud(true); $('map').focus({preventScroll:true}); toast(`點地圖放置「${hero.name}」，Esc 或右鍵取消。`);
}
function placeHero(p) {
  const id = ui.heroBrush; if (!id || !world.canPlaceHero(id,p.x,p.y)) { toast('英雄需要放在空地，避開資源、建築預定占地與其他英雄。'); return; }
  pushUndo(); project.map.heroPlacements = [...(project.map.heroPlacements || []).filter(h=>h.unitId!==id), {unitId:id,...p}]; project.map.revision = (project.map.revision || 0) + 1;
  markDirty(); previewReset(); ui.heroSelected = id; renderSidebar(); $('sidebar').scrollTop = 0; updateHud(true); toast(`英雄已放在 ${p.x}, ${p.y}，開始對戰時從這裡登場。`);
}
function resetHeroPlacement() {
  const id = ui.heroSelected; if (!project.map.heroPlacements?.some(p=>p.unitId===id)) { toast('這位英雄已設定在市鎮旁自動登場。'); return; }
  pushUndo(); project.map.heroPlacements = project.map.heroPlacements.filter(p=>p.unitId!==id); project.map.revision = (project.map.revision || 0) + 1;
  markDirty(); previewReset(); ui.heroSelected = id; renderSidebar(); $('sidebar').scrollTop = 0; updateHud(true); toast('已改回市鎮中心旁自動登場。');
}
function openHeroEditor(id) { editId = id || project.units.find(u=>u.hero)?.id || project.units[0].id; switchMode('units'); $('unit-form-wrap').scrollIntoView({block:'nearest'}); }
function newUnit(hero) { if (project.units.length >= 40) { toast('兵種最多 40 種。'); return; } editId = ''; ui.newHero = hero; unitDrafts.delete(''); if (ui.mode !== 'units') switchMode('units'); else renderUnitsPanel(); $('unit-form-wrap').scrollIntoView({block:'nearest'}); }
function cancelHeroPlacement() { ui.heroBrush = null; ui.heroSelected = null; renderSidebar(); updateHud(true); toast('已取消放置英雄。'); }
function renderSidebar() {
  if (ui.mode === 'play') {
    $('sidebar').innerHTML = '';
  } else if (ui.mode === 'map') {
    $('sidebar').innerHTML = `<div class="panel-head"><div class="eyebrow">DESIGN BEFORE YOU CONQUER</div><h2>超大世界設計</h2><p>${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格 · 自然地景與真實資源。</p></div>${renderHeroPanel()}<div class="panel-section"><div class="section-label">我的起始資源</div><p class="muted">只調整我方。敵方各項起始資源為 ${project.rules.starting.toLocaleString()}，不受這裡的設定影響。</p><div class="row">${Object.entries({wood:"木材",food:"食物",gold:"黃金",stone:"石頭"}).map(([r,label])=>`<label>${label}<input aria-label="我的起始${label}" data-player-resource="${r}" type="number" min="0" max="1000000" step="1" required value="${project.rules.playerStartingResources[r]}"></label>`).join("")}</div></div><div class="panel-section"><div class="section-label">地圖資源存量 · 雙方共享</div><p class="muted">每格：木材 ${project.map.resourceAmounts.wood.toLocaleString()}、食物 ${project.map.resourceAmounts.food.toLocaleString()}、黃金／石頭各 ${project.map.resourceAmounts.gold.toLocaleString()}。敵方可正常採集。新河谷已為各出生點配置四種資源。</p><button data-action="enrich-resources" class="wide">為所有出生點補上大量資源</button></div><div class="panel-section"><label>地圖名稱<input id="map-title" maxlength="40" value="${escape(project.map.name)}"></label><div class="section-label">地形與可採集資源</div><div class="brush-grid">${Object.entries(TILE_NAMES).map(([key, name]) => `<button class="brush ${ui.brush === key && ui.spawnBrush === null && !ui.heroBrush ? 'active' : ''}" data-brush="${key}"><i style="background:${COLORS[key]}"></i>${name}</button>`).join('')}</div><label>筆刷大小<select id="brush-size"><option value="1">1 格 · 精細</option><option value="2">3 × 3</option><option value="3">5 × 5</option><option value="6">11 × 11</option><option value="11">21 × 21</option></select></label></div><div class="panel-section"><div class="section-label">${project.map.spawns.length} 個王國出生點</div><div class="spawn-buttons">${project.map.spawns.map((_,i)=>`<button data-spawn="${i}" class="${ui.spawnBrush===i?'active':''}">⚑ ${i===0?'我方':'AI '+i+(project.rules.aiAlliance?' · 聯盟':'')}</button>`).join('')}</div><p class="muted">選擇王國，再點空地移動出生點。敵人數量可在「對戰設定」選擇 1–3 個，敵方全部結盟。</p><div class="row"><button data-action="view-spawn">查看我方 ⌖</button><button data-action="spread-spawns">分散出生點</button></div></div><div class="panel-section"><div class="section-label">地圖模板</div><label>世界格數<select id="map-size">${[64,128,256,512,1280,1536,2048].map(n=>`<option value="${n}" ${n===project.map.size?'selected':''}>${n.toLocaleString()} × ${n.toLocaleString()} ${n===1280?'· 預設超大世界':''}</option>`).join('')}</select></label><div class="row"><button data-action="random-map">自然河谷</button><button data-action="blank-map">草原背景</button></div><div class="form-actions"><button data-action="undo" ${undo.length?'':'disabled'}>↶ 復原筆刷</button><button data-action="hero-workshop">創造英雄 ♞</button></div><button data-action="test-map" class="primary wide" style="margin-top:12px">完成地圖，開始對戰 ▶</button></div>`;
    $('brush-size').value = ui.brushSize;
  } else renderUnitsPanel();
}
function renderUnitsPanel() {
  $('sidebar').innerHTML = `<div class="panel-head"><div class="eyebrow">FORGE YOUR ARMY</div><h2>英雄與兵種工坊</h2><p>自訂你的英雄能力，或上傳角色圖。</p></div><div class="panel-section"><div class="section-label">你的兵種 <button data-action="new-hero" class="small-button">★ 創造英雄</button><button data-action="new-unit" class="small-button">＋ 兵種</button></div><div class="unit-list">${project.units.map(u => `<button class="unit-card ${u.id === editId ? 'active' : ''}" data-unit="${u.id}">${u.image ? `<img src="${escape(u.image)}" alt="">` : `<span class="unit-symbol" style="color:${u.color}">${SYMBOLS[u.look]}</span>`}<span><strong>${escape(u.name)}</strong><small>${u.hero ? '★ 英雄' : u.role === 'worker' ? '村民' : u.role === 'healer' ? '治療' : u.role === 'ranged' ? '遠程' : '近戰'} · 生命 ${u.hp} · ${u.role === 'healer' ? '治療' : '攻擊'} ${u.attack}</small></span><b>›</b></button>`).join('')}</div></div><div id="unit-form-wrap"></div>`;
  renderUnitForm();
}
function renderUnitForm() {
  let u = unitDrafts.get(editId) || project.units.find(u => u.id === editId); if (!u) u = { ...clone(DEFAULT_UNITS[1]), id: '', name: ui.newHero ? '我的英雄' : '我的新兵種', image: '', hero: Boolean(ui.newHero), building: ui.newHero ? 'castle' : 'barracks', hp: ui.newHero ? 1200 : 140, attack: ui.newHero ? 60 : 14, armor: ui.newHero ? 12 : 2 };
  uploadedImage = u.image; draftsDirty = unitDrafts.has(editId);
  $('unit-form-wrap').innerHTML = `<form class="unit-form" id="unit-form"><div class="unit-preview"><canvas id="unit-preview" width="200" height="200"></canvas><div><strong id="unit-preview-name">${escape(u.name)}</strong><small>實際戰場外觀</small></div></div><label class="checkbox-label"><input name="hero" type="checkbox" ${u.hero ? 'checked' : ''}> 英雄人物 · 只屬於我方，可在城堡復活</label><div id="hero-tools" ${u.hero?'':'hidden'}><button type="button" data-action="place-hero" class="primary wide">套用並放到地圖 ♞</button><p class="muted">設定好英雄後，點地圖選擇開局位置。每位英雄只有一個登場位置，敵方 AI 沒有英雄。</p><label>每秒回血<input name="regen" type="number" min="0" max="100" step="0.1" value="${u.regen??(u.hero?1:0)}" required ${u.hero?'':'disabled'}><small>每秒恢復的生命值；0 表示不回血，最多回到生命上限。</small></label></div><label>名稱<input name="name" value="${escape(u.name)}" maxlength="24" required></label><div class="row"><label>角色<select name="role">${[['worker', '村民 · 採集建造'], ['melee', '近戰戰士'], ['ranged', '遠程戰士'], ['healer', '治療者']].map(([id, label]) => `<option value="${id}" ${id === u.role ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>外觀<select name="look">${[['worker', '村民'], ['soldier', '劍士'], ['archer', '弓箭手'], ['knight', '騎兵'], ['mage', '法師'], ['beast', '野獸'], ['siege', '攻城器']].map(([id, label]) => `<option value="${id}" ${id === u.look ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>生產建築<select name="building">${Object.entries(BUILDINGS).filter(([id])=>['town','barracks','archery','stable','siege','monastery','castle'].includes(id)).map(([id,b])=>`<option value="${id}" ${id===(u.building || (u.role==='worker'?'town':'barracks'))?'selected':''}>${b.name}</option>`).join('')}</select></label><label class="checkbox-label"><input name="civilizationUpgrade" type="checkbox" ${u.upgrades?.length?'checked':''}> 使用文明兵線升級數值</label><p class="muted">調整生命、攻擊、防禦或射程後，會優先使用你的自訂數值。</p><div class="row"><label>角色顏色<input name="color" type="color" value="${u.color}"></label><label>角色圖片<input id="unit-image" type="file" accept="image/png,image/jpeg,image/webp" style="font-size:8px;padding:8px 3px"></label></div><button type="button" data-action="clear-image" class="small-button">使用內建外觀</button><div class="row">${[['wood', '木材成本', 0, 1000, 1], ['hp', '生命值', 10, 10000, 1], ['attack', '攻擊／治療量', 0, 500, 1], ['armor', '近戰護甲', -5, 100, 1], ['pierceArmor', '遠程護甲', 0, 250, 1], ['range', '攻擊／治療距離', .5, 20, .05], ['speed', '移動速度', .5, 6, .01], ['cooldown', '攻擊間隔（秒）', .2, 15, .05], ['food', '食物成本', 0, 1000, 1], ['gold', '黃金成本', 0, 1000, 1], ['time', '訓練時間（秒）', 1, 120, 1]].map(([id, name, min, max, step]) => `<label>${name}<input name="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${u[id] ?? 0}" required></label>`).join('')}</div><div class="form-actions"><button class="primary" type="submit">套用兵種 ↗</button>${project.units.some(bp=>bp.id===editId) ? '<button type="button" data-action="duplicate-unit">複製</button><button type="button" data-action="delete-unit" class="danger">刪除</button>' : ''}</div><p class="muted">圖片會縮為 160 像素。套用後重新部署，自製兵種就能訓練；你的英雄只屬於你；其他自製兵種由雙方共享。</p></form>`;
  drawPreview(u);
}
function readUnitForm() {
  const f = $('unit-form'); if (!f) return null; const original = project.units.find(u=>u.id===editId), data = { ...clone(unitDrafts.get(editId) || original || {}), ...Object.fromEntries(new FormData(f).entries()) }; data.hero = f.elements.hero.checked; delete data.civilizationUpgrade; data.upgrades = f.elements.civilizationUpgrade.checked ? clone(original?.upgrades || data.upgrades || []) : []; if (data.role === 'worker') data.building = 'town'; if (data.hero) { data.building = 'castle'; data.age = 0; data.upgrades = []; data.family = 'hero'; }
  for (const k of ['hp', 'attack', 'armor', 'pierceArmor', 'range', 'speed', 'cooldown', 'food', 'gold', 'wood', 'time', 'regen']) data[k] = Number(data[k]);
  if (!data.hero) data.regen = 0;
  data.id = editId || `unit_${Date.now().toString(36)}`; data.image = uploadedImage || ''; data.name = data.name.trim(); return data;
}
function drawPreview(u) {
  if (!$('unit-preview')) return; const c = $('unit-preview').getContext('2d'); c.clearRect(0, 0, 200, 200); drawUnit(c, { blueprint: u, team: 0, id: 0, hp: u.hp, maxHp: u.hp, path: [] }, 100, 165, 3, 0, true); $('unit-preview-name').textContent = u.name;
  if (u.image) { const img = new Image(); img.onload = () => { if ($('unit-preview')) { const ctx = $('unit-preview').getContext('2d'); ctx.clearRect(0, 0, 200, 200); drawUnit(ctx, { blueprint: u, team: 0, id: 0, hp: u.hp, maxHp: u.hp, path: [] }, 100, 165, 3, 0, true); } }; img.src = u.image; }
}
function saveUnit() {
  if (!$('unit-form')?.reportValidity()) return null;
  const u = readUnitForm(), next = clone(project), i = next.units.findIndex(bp => bp.id === editId);
  if (i >= 0) next.units[i] = u; else next.units.push(u);
  pruneHeroPlacements(next.map,next.units);
  try { project = validateProject(next); for (const map of undo) pruneHeroPlacements(map); unitDrafts.delete(editId); editId = u.id; markDirty(); previewReset(); renderUnitsPanel(); toast(`「${u.name}」已套用${u.hero?'，可以放到地圖。':'，下一場可以訓練。'}`); return project.units.find(bp=>bp.id===u.id); } catch (e) { toast(e.message); return null; }
}
function updateHud(force = false) {
  updateCameraControls();
  if (ui.mode === 'map') $('page-description').textContent = `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格世界。設計地景、資源與出生點，完成後直接開戰。`;
  else if (ui.mode === 'play') $('page-description').textContent = `決定版預設操控 · ${CIVILIZATION.ages[project.rules.startAge]} · ${opponentLabel()}`;
  for (const k of ['wood', 'food', 'gold', 'stone']) $(`res-${k}`).textContent = Math.floor(world.stocks[0][k]).toLocaleString();
  $('population').textContent = `${world.population(0)} / ${world.capacity(0)}`; $('pop-limit').textContent = `上限 ${project.rules.population.toLocaleString()}`;
  $('age-name').textContent = project.rules.startAge === 4 ? '後帝王時代' : CIVILIZATION.ages[world.age(0)];
  $('idle-count').textContent = world.units.filter(u=>u.team===0&&!u.garrison&&!u.order&&u.blueprint.role==='worker').length;
  $('game-time').textContent = timeLabel(world.time); $('game-state').textContent = !ui.started ? '準備中' : ui.paused ? '暫停' : '對戰中'; $('live-dot').classList.toggle('live', ui.started && !ui.paused);
  $('start').innerHTML = ui.mode !== 'play' ? '完成地圖，開始對戰 <span>▶</span>' : !ui.started ? '開始對戰 <span>▶</span>' : ui.paused ? '繼續對戰 <span>▶</span>' : '暫停 <span>Ⅱ</span>';
  $('battle-toggle').textContent = !ui.started ? '開始 ▶' : ui.paused ? '繼續 ▶' : '暫停 Ⅱ';
  $('map').dataset.tool = ui.heroBrush ? 'target' : ui.placement ? 'build' : ui.orderMode || ui.attackMove ? 'target' : ui.mode;
  if (ui.mode==='map') $('canvas-tip').innerHTML = ui.heroBrush ? '<kbd>左鍵</kbd> 放置英雄 <span>·</span> <kbd>右鍵／Esc</kbd> 取消 <span>·</span> <kbd>中鍵</kbd> 移動畫面' : '<kbd>左鍵拖曳</kbd> 畫地形 <span>·</span> <kbd>中鍵</kbd> 移動畫面';
  $('mode-badge').innerHTML = `<i></i> ${ui.mode === 'map' ? ui.heroBrush ? `放置英雄 · Esc 取消` : '地圖編輯模式' : ui.mode === 'units' ? '兵種工坊 · 部署預覽' : ui.placement ? `放置${BUILDINGS[ui.placement].name} · Esc 取消` : ui.orderMode ? `${ui.orderMode} · 點目標指定指令` : ui.attackMove ? '攻擊移動 · 點地面指定目標' : ui.started ? (ui.paused ? '對戰已暫停' : '即時戰略對戰') : '部署預覽'}`;
  $('map-name').textContent = project.map.name; $('map-caption').textContent = `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格 · ${project.map.spawns.length} 個王國 · ${project.rules.aiAlliance?'AI 結盟 · ':''}${CIVILIZATION.ages[project.rules.startAge]}`;
  for (const id of ui.selected) if (!world.entity(id)) ui.selected.delete(id);
  renderSelection();
  if ($('events')) $('events').innerHTML = world.events.slice(0, 4).map(e => `<div class="event"><time>${timeLabel(e.time)}</time><span>${escape(e.text)}</span></div>`).join('');
  if ($('group-buttons')) for (const b of $('group-buttons').children) b.classList.toggle('populated', (ui.groups[b.dataset.group] || []).some(id => world.entity(id)));
  if (ui.mode === 'play' && world.result && $('result').hidden) { ui.paused = true; $('result').hidden = false; $('result-title').textContent = world.result === 'victory' ? '勝利' : '戰敗'; $('result-description').textContent = world.result === 'victory' ? '敵方部隊與主要建築已消滅。這片土地，屬於你的王國。' : '我方部隊與主要建築已被消滅。調整策略，再打一場。'; }
  if (force && ui.mode === 'play') renderSelection();
}
const RESOURCE_LABELS = { wood: '木', food: '食', gold: '金', stone: '石' };
const ECONOMIC_BUILDINGS = new Set(['town','house','mill','farm','lumber','mining','market','blacksmith','monastery','university']);
const costLabel = cost => Object.entries(cost).filter(([,v])=>v).map(([k,v])=>`${v}${RESOURCE_LABELS[k]}`).join(' ');
function portraitSource(e) {
  if (e.kind === 'building') return `assets/sprites/${e.type}${['farm','wall'].includes(e.type)?'':'-'+e.team%3}.webp`;
  const bp = e.blueprint; if (bp.image) return bp.image;
  let look = bp.look === 'mage' ? 'monk' : bp.look;
  if (look === 'siege') { look = ['ram','mangonel','trebuchet'].includes(bp.engine || bp.id) ? bp.engine || bp.id : 'mangonel'; if (look === 'trebuchet' && e.packed) look = 'trebuchet-packed'; }
  return ['worker','soldier','archer','knight','monk','ram','mangonel','trebuchet','trebuchet-packed'].includes(look) ? `assets/sprites/${look}-0-${e.team%3}.webp` : '';
}
function renderSelection() {
  const hero = ui.mode==='map' && project.units.find(u=>u.id===ui.heroSelected&&u.hero);
  if (hero) {
    const p = project.map.heroPlacements?.find(p=>p.unitId===hero.id), portrait = portraitSource({kind:'unit',team:0,blueprint:hero});
    $('selection-info').innerHTML = `<div class="portrait">${portrait?`<img src="${escape(portrait)}" alt="">`:SYMBOLS[hero.look]}</div><div class="selection-copy"><strong>★ ${escape(hero.name)}</strong><small>我方英雄 · ${p?`開局位置 ${p.x}, ${p.y}`:'市鎮旁自動登場'}</small><div class="unit-stats"><span>生命 ${hero.hp}</span><span>⚔ ${hero.attack}</span><span>◈ ${hero.armor}</span><span>回血 ${hero.regen??1}/秒</span></div></div>`;
    $('command-actions').innerHTML = '<button data-command="hero:move">放到地圖／移動</button><button data-command="hero:edit">編輯英雄</button><button data-command="hero:reset">回市鎮旁</button>'; return;
  }
  actions = []; const list = selectedEntities(), own = list.filter(e => e.team === 0 && !e.garrison), e = list[0];
  const name = list.length > 1 ? `${list.length} 個單位` : e ? e.kind === 'building' ? BUILDINGS[e.type].name : e.blueprint.name : ui.mode === 'map' ? '地圖筆刷' : '等待你的指揮';
  const subtitle = list.length > 1 ? '右鍵下指令 · Ctrl＋數字編組' : e ? `${e.team === 0 ? '我方' : 'AI '+e.team} · ${Math.ceil(e.hp-1e-6)} / ${Math.round(e.maxHp)} 生命${e.carried ? ` · 搬運 ${Math.ceil(e.carried)}${RESOURCE_LABELS[e.carrying] || ""}` : ''}${e.blueprint ? ` · ${orderHint(e)}${ui.paused ? ' · 已暫停' : ''}` : ''}` : ui.mode === 'map' ? `目前：${ui.spawnBrush === null ? TILE_NAMES[ui.brush] : ui.spawnBrush === 0 ? '我方出生點' : 'AI 出生點'}` : '先左鍵選取村民或士兵，再右鍵下指令';
  const symbol = e ? SYMBOLS[e.kind === 'building' ? e.type : e.blueprint.look] || '⌂' : ui.mode === 'map' ? '▧' : '♜';
  const portrait = e && portraitSource(e);
  $('selection-info').innerHTML = `<div class="portrait">${portrait ? `<img src="${escape(portrait)}" alt="">` : symbol}</div><div class="selection-copy"><strong>${escape(name)}</strong><small>${escape(subtitle)}</small>${e && list.length === 1 ? `<div class="health-meter"><i style="width:${clamp(e.hp / e.maxHp * 100, 0, 100)}%"></i></div>` : ''}${e?.blueprint && list.length === 1 ? `<div class="unit-stats"><span>⚔ ${e.blueprint.attack}</span><span>◈ ${e.blueprint.armor}</span><span>射程 ${Number(e.blueprint.range.toFixed(2))}</span><span>速度 ${Number(e.blueprint.speed.toFixed(2))}</span>${e.blueprint.hero?`<span>回血 ${e.blueprint.regen??1}/秒</span>`:''}</div>` : ''}</div>${list.length>1?`<div class="unit-selection">${list.slice(0,24).map(u=>{const src=portraitSource(u);return `<button data-select="${u.id}" title="${escape(u.kind==='building'?BUILDINGS[u.type].name:u.blueprint.name)} · ${Math.ceil(u.hp)}/${u.maxHp}">${src?`<img src="${escape(src)}" alt="">`:SYMBOLS[u.blueprint?.look]||'♟'}<i style="width:${clamp(u.hp/u.maxHp*100,0,100)}%"></i></button>`;}).join('')}${list.length>24?`<span>＋${list.length-24}</span>`:''}</div>`:''}`;
  if (ui.mode === 'map') { $('command-actions').innerHTML = '<span class="muted">左鍵畫地形 · Ctrl＋Z 復原 · 中鍵拖曳視角</span>'; return; }
  const buildings = own.filter(e=>e.kind==='building');
  if (buildings.length && buildings.length===own.length) {
    const b = buildings[0];
    if (b.progress === 1) {
      actions = world.availableUnits(0,b.type).map(u=>({ id:`train:${u.id}`, label:u.name, symbol:SYMBOLS[u.look], image:portraitSource({kind:'unit',team:0,blueprint:u}), key:productionKey(project.rules.hotkeys,u), cost:costLabel({food:u.food,gold:u.gold,wood:u.wood||0}), disabled:!world.canPay(0,{food:u.food,gold:u.gold,wood:u.wood||0}) || u.hero && world.units.some(e=>e.team===0&&e.blueprint.id===u.id) }));
      actions.push(...world.availableTech(0,b.type).map(t=>({id:`research:${t.id}`,label:t.name,symbol:'⌘',key:technologyKey(project.rules.hotkeys,t.id),cost:costLabel(t.cost),disabled:!own.some(e=>e.kind==='building'&&e.progress===1&&!e.research&&e.type===b.type)||!world.canPay(0,t.cost)||!world.ageRequirements(0,t.id)})));
      if (b.type==='town') actions.push({id:'town-bell',label:'城鎮警鐘',symbol:'♧',key:commandKey(project.rules.hotkeys,'town-bell'),cost:'召回／恢復工作'});
      if (BUILDINGS[b.type].garrison) actions.push({id:'ungarrison',label:'撤出駐軍',symbol:'↗',key:commandKey(project.rules.hotkeys,'ungarrison'),cost:`${b.garrisoned.length} 人`,disabled:!b.garrisoned.length});
      if (b.type==='market') for (const r of ['food','wood','stone']) for (const buy of [true,false]) actions.push({id:`trade:${r}:${buy?'buy':'sell'}`,label:`${buy?'買':'賣'}${{food:'食物',wood:'木材',stone:'石頭'}[r]}`,symbol:buy?'＋':'－',key:({wood:buy?'x':'s',food:buy?'c':'d',stone:buy?'v':'f'})[r],cost:buy?'130金 → 100':'100 → 70金'});
    }
    if (b.progress===1&&world.availableUnits(0,b.type).length) actions.push({id:'rally',label:'設定集結點',symbol:'⚑',key:'t'});
    if (b.research) $('selection-info').innerHTML += `<div class="queue"><button data-cancel-research title="取消研發並退還資源">⌘ ${escape(TECHNOLOGIES.find(t=>t.id===b.research.id).name)}<small>${Math.ceil(b.research.left)} 秒 · 取消</small></button></div>`;
    if (b.queue.length) $('selection-info').innerHTML += `<div class="queue">${b.queue.slice(0,5).map((q,i)=>`<button data-cancel="${i}" title="取消訓練並退還資源">${escape(world.effectiveBlueprint(q.unitId,0).name)}<small>${i===0?Math.max(0,Math.ceil(q.left))+'s':'排隊'}</small></button>`).join('')}${b.queue.length>5?`<small>＋${b.queue.length-5}</small>`:''}</div>`;
  } else if (own.some(e=>e.kind==='unit')) {
    const workers=own.some(e=>e.blueprint?.role==='worker');
    if (workers && ui.buildMenu) {
      const layout=buildKeys(project.rules.hotkeys,ui.buildPage);
      actions=Object.entries(BUILDINGS).filter(([id,b])=>(b.age||0)<=world.age(0)&&ECONOMIC_BUILDINGS.has(id)===(ui.buildPage==='economy')).map(([id,b])=>({id:`build:${id}`,label:b.name,symbol:SYMBOLS[id]||'⌂',image:portraitSource({kind:'building',type:id,team:0}),key:Object.keys(layout).find(k=>layout[k]===id)?.toUpperCase(),cost:costLabel(b.cost)+(b.requires?' · 需'+BUILDINGS[b.requires].name:''),disabled:!world.canPay(0,b.cost)||!world.buildRequirements(0,id)}));
      actions.push({id:ui.buildPage==='economy'?'military-menu':'build-menu',label:ui.buildPage==='economy'?'軍事建築':'經濟建築',symbol:'⇄'},{id:'build-back',label:'返回',symbol:'↩',key:'Esc'});
    }
    else {
      actions=['stop','patrol','guard','follow','attack-move','garrison'].map(id=>({id,label:({stop:'停止',patrol:'巡邏',guard:'守衛',follow:'跟隨','attack-move':'攻擊移動',garrison:'進駐'})[id],symbol:({stop:'■',patrol:'⇄',guard:'♜',follow:'↝','attack-move':'⚔',garrison:'↙'})[id],key:commandKey(project.rules.hotkeys,id)}));
      if (workers) { actions=actions.filter(a=>!['patrol','guard','follow'].includes(a.id)); actions.push({id:'build-menu',label:'經濟建築',symbol:'⌂',key:menuKey(project.rules.hotkeys)},{id:'military-menu',label:'軍事建築',symbol:'⚑',key:menuKey(project.rules.hotkeys,true)},{id:'repair',label:'修理',symbol:'⚒',key:'e'},{id:'dropoff',label:'放下資源',symbol:'↥',key:'a'},{id:'shelter',label:'尋找庇護',symbol:'⌂',key:'f'}); }
      if (own.some(e=>e.blueprint?.id==='scout') && own.filter(e=>e.kind==='unit').every(e=>e.blueprint?.id==='scout') && own.every(e=>!e.order)) { actions=actions.filter(a=>a.id!=='stop'); actions.push({id:'auto-scout',label:'自動偵察',symbol:'⌖',key:'g'}); }
      if (own.some(e=>e.blueprint?.attackGround||e.blueprint?.splash)) { actions=actions.filter(a=>a.id!=='garrison'); actions.push({id:'attack-ground',label:'攻擊地面',symbol:'⊕',key:'t'}); }
      if (own.some(e=>e.blueprint?.canConvert)) { actions=actions.filter(a=>!['patrol','guard','follow'].includes(a.id)); actions.push({id:'convert',label:'招降',symbol:'✧',key:'q',cost:'右鍵敵軍'},{id:'heal',label:'治療',symbol:'✚',key:'w'}); }
      if (own.some(e=>e.blueprint?.packed)) { const packed=own.find(e=>e.blueprint?.packed).packed; actions=actions.filter(a=>a.id!== (packed?'patrol':'guard')); actions.push({id:'pack',label:packed?'展開投石機':'打包投石機',symbol:'⇅',key:packed?'q':'w'}); }
      for (const [id,label] of Object.entries(FORMATIONS)) actions.push({id:`formation:${id}`,label,symbol:'⁙',key:commandKey(project.rules.hotkeys,`formation:${id}`),active:ui.formation===id});
      if (!workers) for (const [id,label] of Object.entries(STANCES)) actions.push({id:`stance:${id}`,label,symbol:{aggressive:'⚔',defensive:'◇',stand:'▣',passive:'○'}[id],key:commandKey(project.rules.hotkeys,`stance:${id}`),active:own.filter(e=>e.kind==='unit').every(e=>e.stance===id)});
    }
  }
  $('command-actions').innerHTML = actions.length ? actions.map(a=>`<button class="action ${a.active || ui.placement && a.id===`build:${ui.placement}`?'active':''}" style="${a.key&&'qwertasdfgzxcvb'.includes(a.key.toLowerCase())?`grid-column:${'qwertasdfgzxcvb'.indexOf(a.key.toLowerCase())%5+1};grid-row:${Math.floor('qwertasdfgzxcvb'.indexOf(a.key.toLowerCase())/5)+1}`:''}" data-command="${escape(a.id)}" ${a.disabled?'disabled':''} title="${escape(a.label)}${a.key?' · '+a.key:''}${ui.extendedTooltips&&a.cost?' · '+escape(a.cost):''}"><kbd>${escape((a.key||'').toUpperCase())}</kbd><span class="symbol">${a.image?`<img src="${escape(a.image)}" alt="">`:a.symbol}</span><span class="label">${escape(a.label)}</span><span class="cost">${escape(a.cost||'')}</span></button>`).join('') : `<span class="muted">${e?.garrison?'駐軍中。選取所在建築，按 G 撤出。':'選村民採集與建造，選建築訓練兵種。'}</span>`;
}
function runAction(id, shift = false) {
  if (ui.mode==='map' && id.startsWith('hero:')) { if (id==='hero:move') beginHeroPlacement(ui.heroSelected); else if (id==='hero:reset') resetHeroPlacement(); else if (id==='hero:edit') openHeroEditor(ui.heroSelected); return; }
  const own=ownEntities(), units=own.filter(e=>e.kind==='unit'), buildings=own.filter(e=>e.kind==='building');
  if (id.startsWith('train:')) {
    const bp=id.slice(6), candidates=buildings.filter(b=>world.availableUnits(0,b.type).some(u=>u.id===bp));
    for (let i=0;i<(shift?5:1)&&candidates.length;i++) { const b=candidates.slice().sort((a,b)=>a.queue.length-b.queue.length)[0], err=world.train(b.id,bp); if (err) { toast(err); break; } }
  } else if (id.startsWith('research:')) { const b=buildings.find(b=>b.progress===1&&!b.research&&world.availableTech(0,b.type).some(t=>t.id===id.slice(9))); if (b) { const err=world.research(b.id,id.slice(9)); if (err) toast(err); } }
  else if (id.startsWith('build:')) { ui.placement=id.slice(6); ui.attackMove=false; ui.orderMode=null; toast(ui.placement==='wall'?'左鍵拖曳放置一整段城牆；Shift 可接續排程。':`左鍵放置${BUILDINGS[ui.placement].name}；Shift 可連續放置。`); }
  else if (id==='build-menu'||id==='military-menu') { ui.buildMenu=true; ui.buildPage=id==='build-menu'?'economy':'military'; ui.placement=null; ui.orderMode=null; }
  else if (id==='build-back') { ui.buildMenu=false; ui.placement=null; }
  else if (id==='dropoff') { for (const u of units.filter(u=>u.carried)) { const b=world.nearestDropoff(u); if (b) world.command([u.id],{type:'deliver',target:b.id,resume:u.order?.type==='gather'?clone(u.order):null},shift); } }
  else if (id==='shelter') { for (const u of units) { const b=world.buildings.filter(b=>b.team===0&&b.progress===1&&BUILDINGS[b.type].garrison).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0]; if (b) world.command([u.id],{type:'garrison',target:b.id},shift); } }
  else if (id==='auto-scout') world.command(units.filter(u=>u.blueprint.id==='scout').map(u=>u.id),{type:'autoScout'});
  else if (id==='stop') { world.command(units.map(e=>e.id),null); cancelTargeting(); }
  else if (id==='attack-move') { ui.attackMove=true; ui.placement=null; ui.orderMode=null; toast('左鍵點地面，部隊會沿途迎擊。'); }
  else if (['patrol','guard','follow','repair','garrison','convert','rally','attack-ground','heal'].includes(id)) { ui.orderMode=id; ui.attackMove=false; ui.placement=null; toast(`${{patrol:'巡邏：點地面',guard:'守衛：點我方單位',follow:'跟隨：點單位',repair:'修理：點我方建築',garrison:'進駐：點城鎮中心、箭塔或城堡',convert:'招降：點敵方單位',rally:'集結點：點地面或資源', 'attack-ground':'攻擊地面：點目標位置',heal:'治療：點我方單位'}[id]}。`); }
  else if (id.startsWith('stance:')) { for (const u of units) { u.stance=id.slice(7); u.autoTarget=null; u.combatOrigin=null; u.combatReturning=false; u.path=[]; u.pathGoal=null; u.repath=0; } }
  else if (id.startsWith('formation:')) { ui.formation=id.slice(10); world.reformFormation(units.map(u=>u.id),ui.formation); }
  else if (id==='pack') for (const u of units.filter(u=>u.blueprint.packed)) { world.command([u.id],null); world.pack(u,!u.packed); }
  else if (id==='ungarrison') for (const b of buildings) world.ungarrison(b.id);
  else if (id==='town-bell') world.townBell(0);
  else if (id.startsWith('trade:')) { const [,resource,way]=id.split(':'); for(let i=0;i<(shift?5:1);i++) {const err=world.trade(0,resource,way==='buy'); if (err) {toast(err);break;}} }
  updateHud(true); $('map').focus({preventScroll:true});
}
function cancelTargeting() {
  const painted=pointer?.type==='paint';
  if (pointer && $('map').hasPointerCapture(pointer.id)) $('map').releasePointerCapture(pointer.id);
  ui.placement=null; ui.attackMove=false; ui.orderMode=null; ui.buildMenu=false; pointer=null; renderer.drag=null;
  if (painted) { previewReset(); renderSidebar(); }
}
function issueAt(pos, shift = false, attackMove = false, forceGarrison = false, forceMove = false) {
  let p=renderer.tileAt(pos.x,pos.y);
  const target=forceMove?null:renderer.hit(pos.x,pos.y,world,ui.started&&project.rules.fog);
  const resource=!forceMove&&!target&&!ui.orderMode&&!forceGarrison&&!attackMove?renderer.resourceHit(pos.x,pos.y,world,ui.started&&project.rules.fog):null;
  if (resource) p={x:resource.x,y:resource.y};
  issueCommand(p,target,shift,attackMove,forceGarrison,forceMove);
}
function issueCommand(p, target, shift = false, attackMove = false, forceGarrison = false, forceMove = false) {
  p={x:Math.round(p.x),y:Math.round(p.y)};
  const n=project.map.size; if (p.x<0||p.y<0||p.x>=n||p.y>=n) return;
  const own=ownEntities(), units=own.filter(e=>e.kind==='unit'&&!e.garrison);
  if (!own.length) { toast('先左鍵選取自己的村民或士兵，再右鍵下指令；按 . 可選取閒置村民。'); return; }
  const mode=forceGarrison?'garrison':ui.orderMode;
  if (forceMove) { moveFormation(units,p,shift,false); for (const b of own.filter(e=>e.kind==='building')) b.rally={type:'move',...p}; }
  else if (own.every(e=>e.kind==='building')) { for (const b of own) b.rally=target?.team>0?{type:'attack',target:target.id}:target?.type==='farm'?{type:'gather',target:target.id}:['forest','food','gold','stone'].includes(world.tile(p.x,p.y))?{type:'gather',...p}:{type:'move',...p}; toast('集結點已設定。'); }
  else if (mode) {
    if (mode==='attack-ground') world.command(units.filter(u=>u.blueprint.attackGround||u.blueprint.splash).map(u=>u.id),{type:'attackGround',...p},shift);
    else if (mode==='patrol') world.command(units.map(e=>e.id),{type:'patrol',...p},shift);
    else if (target) world.command(units.filter(u=>mode==='repair'?u.blueprint.role==='worker':mode==='convert'?u.blueprint.canConvert:mode==='heal'?u.blueprint.role==='healer':true).map(e=>e.id),{type:mode,target:target.id},shift);
    else { toast('請點選有效目標。'); return; }
  } else if (target?.team>0&&!attackMove) {
    for (const u of units) world.command([u.id],{type:u.blueprint.canConvert&&target.kind==='unit'?'convert':'attack',target:target.id},shift);
  } else if (target?.team===0&&target.kind==='building'&&units.some(u=>u.blueprint.role==='worker')&&!attackMove) {
    const type=target.progress<1?'build':target.type==='farm'?'gather':target.hp<target.maxHp?'repair':null;
    const workers=units.filter(e=>e.blueprint.role==='worker');
    if (type==='gather') {
      const farm=workers.find(u=>!world.farmWorker(target,u.id));
      if (farm) world.command([farm.id],{type:'gather',target:target.id},shift); else { toast('這座農田已有村民耕作。每座農田只供一名村民使用。'); return; }
    } else if (type) world.command(workers.map(e=>e.id),{type,target:target.id},shift);
    else if (workers.some(u=>u.carried&&BUILDINGS[target.type].dropoff?.includes(u.carrying))) {
      for (const u of workers.filter(u=>u.carried&&BUILDINGS[target.type].dropoff?.includes(u.carrying))) world.command([u.id],{type:'deliver',target:target.id},shift);
    }
    else moveFormation(units,p,shift,false);
  } else if (target?.team===0&&target.kind==='unit'&&units.some(u=>u.blueprint.role==='healer')&&!attackMove) world.command(units.filter(u=>u.blueprint.role==='healer').map(u=>u.id),{type:'heal',target:target.id},shift);
  else if (['forest','food','gold','stone'].includes(world.tile(p.x,p.y))&&units.some(e=>e.blueprint.role==='worker')&&!attackMove) world.command(units.filter(e=>e.blueprint.role==='worker').map(e=>e.id),{type:'gather',...p},shift);
  else moveFormation(units,p,shift,attackMove);
  renderer.marker={...p,attack:attackMove||target?.team>0,time:frameTime}; updateHud(true);
  if (!ui.started || ui.paused) toast(!ui.started ? '指令已設定；按「開始」後執行。' : '指令已設定，目前對戰暫停；按 F3 或「繼續」執行。');
}
function moveFormation(units,p,shift,attackMove) {
  world.moveFormation(units.map(u=>u.id),p,ui.formation,shift,attackMove);
}
function centerSelection() { const es=selectedEntities(); if (es.length) renderer.center({x:es.reduce((v,e)=>v+e.x,0)/es.length,y:es.reduce((v,e)=>v+e.y,0)/es.length}); }
let eventCursor=0;
function centerEvent() { const events=world.events.filter(e=>e.x!==undefined); if (events.length) renderer.center(events[eventCursor++%events.length]); else renderer.center(project.map.spawns[0]); }
function cycleBuilding(type) { const bs=world.buildings.filter(b=>b.team===0&&b.type===type); if (bs.length) { const i=bs.findIndex(b=>ui.selected.has(b.id)), b=bs[(i+1)%bs.length]; select([b.id]); renderer.center(b); } }
function cycleIdle(worker = true) { const idle=world.units.filter(u=>u.team===0&&!u.garrison&&!u.order&&(worker?u.blueprint.role==='worker':u.blueprint.role!=='worker')); if (idle.length) { const i=idle.findIndex(u=>ui.selected.has(u.id)), u=idle[(i+1)%idle.length]; select([u.id]); renderer.center(u); } else toast('目前沒有閒置單位。'); }
function openTechTree() {
  $('tech-content').innerHTML=`<p>${CIVILIZATION.name} · ${project.rules.startAge===4?'後帝王全科技':CIVILIZATION.ages[world.age(0)]} · ${world.researched[0].size} / ${TECHNOLOGIES.length} 已研發</p>`+Object.entries(BUILDINGS).filter(([id])=>TECHNOLOGIES.some(t=>t.building===id)||world.availableUnits(0,id).length).map(([id,b])=>`<section class="tech-section"><h3>${b.name}</h3><div class="tech-units">${world.availableUnits(0,id).map(u=>escape(u.name)).join(' · ')}</div><div class="tech-list">${TECHNOLOGIES.filter(t=>t.building===id).map(t=>`<span class="${world.researched[0].has(t.id)?'done':'locked'}">${world.researched[0].has(t.id)?'✓':'◇'} ${t.name}<small>${CIVILIZATION.ages[t.age]} · ${costLabel(t.cost)}</small></span>`).join('')}</div></section>`).join('');
  pauseDialog('tech-tree'); updateHud(true);
}
function recallGroup(key, append = false) {
  const ids = (ui.groups[key] || []).filter(id => world.entity(id)); if (!ids.length) { toast(`編隊 ${key} 尚未設定。選部隊後按 Ctrl＋${key}。`); return; }
  select(ids,append,false);
  if (groupPressed.key === key && performance.now() - groupPressed.time < 450) { const es = ids.map(id => world.entity(id)); renderer.center({ x: es.reduce((a, e) => a + e.x, 0) / es.length, y: es.reduce((a, e) => a + e.y, 0) / es.length }); }
  groupPressed = { key, time: performance.now() }; updateHud(true);
}
function pushUndo() { undo.push(clone(project.map)); if (undo.length > 30) undo.shift(); }
function paint(p) {
  const n = project.map.size; if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return;
  if (ui.spawnBrush !== null) {
    if (p.x < 1 || p.y < 1 || p.x >= n - 2 || p.y >= n - 2 || !['grass', 'sand', 'road'].includes(tileType(project.map, p.x, p.y))) { toast('出生點需要放在地圖內的空地。'); return; }
     if (project.map.spawns.some((s,i)=>i!==ui.spawnBrush && Math.hypot(p.x-s.x,p.y-s.y)<12)) { toast('出生點至少相距 12 格。'); return; } project.map.spawns[ui.spawnBrush] = p; project.map.spawnPlacement = 'custom'; project.map.revision = (project.map.revision || 0) + 1;
  } else {
    const r = ui.brushSize - 1; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = p.x + dx, y = p.y + dy; if (x < 0 || y < 0 || x >= n || y >= n || project.map.spawns.some(s => s.x === x && s.y === y)) continue; setTile(project.map, x, y, ui.brush); }
  }
  markDirty();
}
function changeMap(blank) {
  const n = Number($('map-size').value), enemyCount=project.map.spawns.length-1; pushUndo(); project.map = generateMap(n, Math.floor(Math.random() * 10000)); project.map=setEnemyCount(project,enemyCount);
  if (blank) { if (project.map.tiles) project.map.tiles.fill('grass'); else project.map.template='grass'; project.map.name = '廣闊草原'; }
  markDirty(); previewReset(); renderer.project=project; renderer.zoom=.9; renderer.center(project.map.spawns[0]); renderSidebar();
}
function position(e) { const r = $('map').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
$('map').addEventListener('contextmenu', e => e.preventDefault());
$('map').addEventListener('pointerdown', e => {
  $('map').focus({ preventScroll: true }); const pos = position(e); pointerPos = pos;
  if (e.button === 1 && ui.mode === 'play') { centerEvent(); e.preventDefault(); return; }
  if (e.button === 1 || e.button === 0 && e.altKey && ui.mode!=='play') { renderer.restoreView(); pointer = { type: 'pan', start: pos, pan: { ...renderer.pan }, id: e.pointerId }; e.preventDefault(); }
  else if (e.button === 2 || e.button === 0 && e.ctrlKey && /Mac/.test(navigator.platform)) { e.preventDefault(); if (ui.mode === 'map' && ui.heroBrush) cancelHeroPlacement(); else if (ui.mode === 'play') { if (ui.placement || ui.attackMove || ui.orderMode) { cancelTargeting(); updateHud(true); toast('已取消放置或指定目標；再次右鍵可下指令。'); } else issueAt(pos, e.shiftKey, false, e.altKey, e.button===2&&e.ctrlKey); } }
  else if (e.button === 0) {
    if (ui.mode === 'map') {
      if (ui.heroBrush) placeHero(renderer.tileAt(pos.x,pos.y));
      else { const hero = ui.spawnBrush===null && renderer.heroHit(pos.x,pos.y,world); if (hero) { ui.heroSelected = hero.unitId; ui.selected.clear(); renderSidebar(); updateHud(true); } else { ui.heroSelected = null; pushUndo(); pointer = { type: 'paint', id: e.pointerId }; paintLast = renderer.tileAt(pos.x, pos.y); paint(paintLast); } }
    }
    else if (ui.mode === 'play' && ui.placement==='wall') { pointer={type:'wall',start:renderer.tileAt(pos.x,pos.y),shift:e.shiftKey,id:e.pointerId}; }
    else if (ui.mode === 'play' && ui.placement) { const p = renderer.tileAt(pos.x, pos.y), err = world.build(ownEntities().map(e => e.id), ui.placement, p.x, p.y, e.shiftKey); if (err) toast(err); else { if (!e.shiftKey) { ui.placement = null; ui.buildMenu=false; } if (!ui.started) toast('地基已放置，開始對戰後村民會動工。'); } updateHud(true); }
    else if (ui.mode === 'play' && ui.attackMove) { issueAt(pos, e.shiftKey, true); ui.attackMove = false; updateHud(true); }
    else if (ui.mode === 'play' && ui.orderMode) { issueAt(pos, e.shiftKey); if (!e.shiftKey) ui.orderMode = null; updateHud(true); }
    else pointer = { type: 'select', start: pos, end: pos, shift: e.shiftKey, unitsOnly:e.altKey, militaryOnly:e.ctrlKey, id: e.pointerId };
  }
  if (pointer) $('map').setPointerCapture(e.pointerId);
});
$('map').addEventListener('pointermove', e => {
  const pos = position(e); pointerPos = pos; renderer.hover = renderer.tileAt(pos.x, pos.y);
  if (pointer?.type === 'pan') {renderer.pan = { x: pointer.pan.x + pos.x - pointer.start.x, y: pointer.pan.y + pos.y - pointer.start.y }; renderer.constrainView();}
  else if (pointer?.type === 'paint') { const p = renderer.tileAt(pos.x, pos.y), len = Math.max(Math.abs(p.x - paintLast.x), Math.abs(p.y - paintLast.y)); if (ui.spawnBrush === null) { for (let i = 1; i <= len; i++) paint({ x: Math.round(paintLast.x + (p.x - paintLast.x) * i / len), y: Math.round(paintLast.y + (p.y - paintLast.y) * i / len) }); } paintLast = p; }
  else if (pointer?.type === 'select') { pointer.end = pos; if (Math.hypot(pos.x - pointer.start.x, pos.y - pointer.start.y) > 5) renderer.drag = { start: pointer.start, end: pos }; }
});
$('map').addEventListener('pointerup', e => {
  const pos = position(e);
  if (pointer?.type === 'wall') { const result=world.buildWall(ownEntities().map(u=>u.id),pointer.start,renderer.tileAt(pos.x,pos.y),pointer.shift); if (result.error) toast(result.error); if (!pointer.shift) { ui.placement=null; ui.buildMenu=false; } updateHud(true); }
  else if (pointer?.type === 'select') {
    if (renderer.drag) {
      const a=pointer.start, inside=(x,y)=>x>=Math.min(a.x,pos.x)&&x<=Math.max(a.x,pos.x)&&y>=Math.min(a.y,pos.y)&&y<=Math.max(a.y,pos.y);
      let ids=world.units.filter(u=>{ const p=renderer.screen(u.x,u.y); return u.team===0&&!u.garrison&&(!pointer.militaryOnly||u.blueprint.role!=='worker')&&(!pointer.unitsOnly||u.blueprint.role==='worker')&&inside(p.x,p.y-10*renderer.zoom); }).map(u=>u.id);
      if (!ids.length&&!pointer.militaryOnly&&!pointer.unitsOnly) ids=world.buildings.filter(b=>{ const p=renderer.screen(b.x,b.y); return b.team===0&&b.hp>0&&inside(p.x,p.y); }).map(b=>b.id);
      select(ids,pointer.shift,false);
    }
    else { const hit = renderer.hit(pos.x, pos.y, world, ui.started && project.rules.fog, pointer.unitsOnly); select(hit ? [hit.id] : [], pointer.shift); }
  } else if (pointer?.type === 'paint') { previewReset(); renderSidebar(); }
  pointer = null; renderer.drag = null;
});
$('map').addEventListener('pointercancel', () => { pointer = null; renderer.drag = null; });
$('map').addEventListener('pointerleave', () => { pointerPos = null; renderer.hover = null; });
$('map').addEventListener('dblclick', e => {
  if (ui.mode==='map' && !ui.heroBrush && ui.spawnBrush===null) { const pos=position(e), hero=renderer.heroHit(pos.x,pos.y,world); if (hero) openHeroEditor(hero.unitId); return; }
  if (ui.mode !== 'play') return; const pos = position(e), hit = renderer.hit(pos.x, pos.y, world, ui.started && project.rules.fog); if (!hit || hit.team !== 0) return;
  const pool = hit.kind === 'unit' ? world.units : world.buildings;
  const ids = pool.filter(u => { const p = renderer.screen(u.x, u.y); return u.team === 0 && !u.garrison && (hit.kind === 'unit' ? u.blueprint.id === hit.blueprint.id : u.type === hit.type) && p.x >= 0 && p.x <= renderer.width && p.y >= 0 && p.y <= renderer.height; }).map(u => u.id); select(ids, e.shiftKey, false);
});
function updateCameraControls() {
  const overview = Boolean(renderer.overviewView);
  $('fit').textContent = overview ? '↶ 返回' : '全圖';
  $('fit').title = overview ? '返回查看全圖之前的視角' : '查看整張地圖；再按一次返回';
  $('fit').setAttribute('aria-label', overview ? '返回原本視角' : '查看全圖');
  $('zoom-status').textContent = `${Math.round(renderer.zoom * 100)}%`;
  $('zoom-out').disabled = !overview && renderer.zoom <= (ui.mode === 'play' ? .55 : .15) + .00001;
  $('zoom-in').disabled = !overview && renderer.zoom >= (ui.mode === 'play' ? 1.8 : 2.5) - .00001;
}
function zoom(factor) { renderer.zoomBy(factor, ui.mode === 'play' ? .55 : .15, ui.mode === 'play' ? 1.8 : 2.5); pointerPos = null; updateCameraControls(); }
function resetCamera() {
  const base = world.buildings.find(b=>b.team===0&&b.type==='town'&&b.hp>0) || project.map.spawns[0];
  renderer.overviewView = null; renderer.zoom = ui.mode === 'play' ? 1.1 : .9; renderer.center(base);
  keys.clear(); pointerPos = null; updateCameraControls(); $('map').focus({preventScroll:true});
}
$('map').addEventListener('wheel', e => { e.preventDefault(); if (e.deltaY) zoom(wheelZoomFactor(e.deltaY,e.deltaMode,renderer.height)); }, { passive: false });
$('minimap').addEventListener('contextmenu',e=>e.preventDefault());
$('minimap').addEventListener('pointerdown', e => {
  const r=$('minimap').getBoundingClientRect(), p=renderer.minimapPoint((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
  const right=e.button===2||e.button===0&&e.ctrlKey&&/Mac/.test(navigator.platform);
  if (ui.mode==='play'&&(right||e.button===0&&(ui.attackMove||ui.orderMode))) {
    e.preventDefault(); $('map').focus({preventScroll:true});
    if (right&&(ui.placement||ui.attackMove||ui.orderMode)) { cancelTargeting(); updateHud(true); return; }
    const forceMove=right&&e.button===2&&e.ctrlKey;
    const target=forceMove?null:world.units.filter(u=>!u.garrison&&world.isVisible(u)&&Math.hypot(u.x-p.x,u.y-p.y)<.8).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]||world.buildings.find(b=>{ const a=buildingBounds(b.type,b.x,b.y);return b.hp>0&&world.isVisible(b)&&p.x>=a.minX-.5&&p.x<=a.maxX+.5&&p.y>=a.minY-.5&&p.y<=a.maxY+.5; });
    issueCommand(p,target,e.shiftKey,ui.attackMove,right&&e.altKey,forceMove);
    if (!e.shiftKey) { ui.attackMove=false;ui.orderMode=null; } updateHud(true);
  } else if (e.button===0) renderer.center(p);
});
$('zoom-out').onclick = () => zoom(1/1.1); $('zoom-in').onclick = () => zoom(1.1);
$('fit').onclick = () => { if (!renderer.restoreView()) renderer.fit(project.map); keys.clear(); pointerPos = null; updateCameraControls(); };
$('reset-view').onclick = resetCamera;
$('fullscreen-button').onclick = toggleFullscreen;
document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchMode(b.dataset.mode));
$('start').onclick = startBattle; $('reset-battle').onclick = () => { previewReset(); toast('已重新部署，準備開始新戰役。'); }; $('play-again').onclick = () => { previewReset(); startBattle(); };
$('battle-toggle').onclick = startBattle;
$('idle-workers').onclick = () => { cycleIdle(); $('map').focus({preventScroll:true}); };
$('group-buttons').onclick = e => { const b=e.target.closest('[data-group]'); if (b) { recallGroup(b.dataset.group,e.shiftKey); $('map').focus({preventScroll:true}); } };
$('save').onclick = ()=>ui.mode==='play'&&ui.started?saveBattle():commitProject();
$('load-battle').onclick=loadBattle;try {$('load-battle').disabled=!localStorage.getItem(BATTLE_STORAGE);}catch {}
$('export').onclick = () => { if (!validResourceInputs()) return; try { const p = validateProject(project), blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${p.name.replace(/[\\/:*?"<>|]/g, '_')}.realm.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已匯出地圖、兵種與規則。'); } catch (e) { toast(e.message); } };
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 12000000) throw new Error('檔案超過 12 MB。'); const next = validateProject(JSON.parse(await file.text())); next.rules.hotkeys='definitive'; upgradeDefaultUnits(next); project = next; editId = project.units[0].id; undo = []; unitDrafts.clear(); draftsDirty = false; ui.newHero = false; markDirty(); previewReset(); renderer.fit(project.map); renderSidebar(); toast('王國已匯入，可以編輯或開始對戰。'); } catch (err) { toast(`無法匯入：${err.message}`); } e.target.value = ''; };
function pauseDialog(id) { const d=$(id); d.dataset.resume=String(ui.started&&!ui.paused); ui.paused=true; d.showModal(); updateHud(true); }
$('help-button').onclick = () => pauseDialog('help');
function openRules() { const resume=ui.started&&!ui.paused; const f = $('rules-form'); f.elements.enemyCount.value=project.map.spawns.length-1; for (const k of ['population', 'enemyPopulation', 'starting', 'ai', 'speed', 'startAge', 'startingBase']) f.elements[k].value = project.rules[k]; f.elements.fog.checked = project.rules.fog; $('rules').dataset.resume=String(resume); ui.paused=true; $('rules').showModal(); updateHud(true); }
$('rules-button').onclick = openRules;
$('tech-button').onclick = openTechTree;
$('battle-rules').onclick = openRules;
$('battle-tech').onclick = openTechTree;
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{ if (d.dataset.resume==='true'&&ui.started&&ui.mode==='play') ui.paused=false; delete d.dataset.resume; updateHud(true); }));
document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('rules-form').onsubmit = e => { e.preventDefault(); const f = e.target; const next = clone(project); next.rules = { ...project.rules, population: Number(f.elements.population.value), starting: Number(f.elements.starting.value), ai: f.elements.ai.value, aiAlliance: true, enemyPopulation:Number(f.elements.enemyPopulation.value), fog: f.elements.fog.checked, speed: Number(f.elements.speed.value), startAge:Number(f.elements.startAge.value), startingBase:f.elements.startingBase.value }; try { next.map=setEnemyCount(next,Number(f.elements.enemyCount.value)); project = validateProject(next); markDirty(); previewReset(); switchMode(ui.mode); $('rules').close(); toast(`對戰設定已套用，人口上限 ${project.rules.population.toLocaleString()}。`); } catch (err) { toast(err.message); } };
$('command-actions').addEventListener('click', e => { const b = e.target.closest('[data-command]'); if (b && !b.disabled) runAction(b.dataset.command, e.shiftKey); });
$('selection-info').addEventListener('click', e => { const unit=e.target.closest('[data-select]'); if (unit) { if (e.shiftKey) ui.selected.delete(Number(unit.dataset.select)); else select([Number(unit.dataset.select)]); updateHud(true); $('map').focus({preventScroll:true}); return; } const b = e.target.closest('[data-cancel]'); const entity = ownEntities()[0]; if (e.target.closest('[data-cancel-research]') && entity) { world.cancelResearch(entity.id); updateHud(true); } if (b && entity) { world.cancelTrain(entity.id, Number(b.dataset.cancel)); updateHud(true); } });
$('sidebar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.brush) { ui.brush = b.dataset.brush; ui.spawnBrush = null; ui.heroBrush = null; ui.heroSelected = null; renderSidebar(); updateHud(true); }
  else if (b.dataset.spawn !== undefined) { ui.spawnBrush = Number(b.dataset.spawn); ui.heroBrush = null; ui.heroSelected = null; renderSidebar(); updateHud(true); }
  else if (b.dataset.heroPlace) beginHeroPlacement(b.dataset.heroPlace);
  else if (b.dataset.heroView) { ui.heroSelected = b.dataset.heroView; ui.heroBrush = null; ui.spawnBrush = null; renderer.restoreView(); renderer.zoom=Math.max(renderer.zoom,.9); renderer.center(project.map.heroPlacements?.find(p=>p.unitId===ui.heroSelected) || project.map.spawns[0]); renderSidebar(); updateHud(true); }
  else if (b.dataset.group) recallGroup(b.dataset.group, e.shiftKey);
  else if (b.dataset.unit) { editId = b.dataset.unit; renderUnitsPanel(); }
  else if (b.dataset.action === 'enrich-resources') { pushUndo(); enrichMapResources(project.map); markDirty(); previewReset(); renderSidebar(); toast('各王國出生點都已補上大量森林、食物、金礦與石礦。'); }
  else if (b.dataset.action === 'random-map') changeMap(false);
  else if (b.dataset.action === 'blank-map') changeMap(true);
  else if (b.dataset.action === 'undo') { if (undo.length) { const size = project.map.size; project.map = undo.pop(); pruneHeroPlacements(project.map); markDirty(); previewReset(); if (size !== project.map.size) renderer.fit(project.map); renderSidebar(); } }
  else if (b.dataset.action === 'view-spawn') { renderer.restoreView(); renderer.zoom=.9; renderer.center(project.map.spawns[0]); }
  else if (b.dataset.action === 'spread-spawns') { try { const map = spreadStartingPositions(project); pushUndo(); project.map = map; markDirty(); previewReset(); renderer.project=project; renderer.zoom=.9; renderer.center(project.map.spawns[0]); renderSidebar(); toast('各勢力的出生點已分散，原有地景保留。'); } catch (err) { toast(err.message); } }
  else if (b.dataset.action === 'hero-workshop') newUnit(true);
  else if (b.dataset.action === 'place-hero') { const u=saveUnit(); if (u?.hero) beginHeroPlacement(u.id); }
  else if (b.dataset.action === 'cancel-hero') cancelHeroPlacement();
  else if (b.dataset.action === 'reset-hero') resetHeroPlacement();
  else if (b.dataset.action === 'test-map') { previewReset(); startBattle(); }
  else if (b.dataset.action === 'new-unit' || b.dataset.action==='new-hero') newUnit(b.dataset.action==='new-hero');
  else if (b.dataset.action === 'duplicate-unit') { const original = project.units.find(u => u.id === editId), u = original && clone(original); if (u && project.units.length < 40) { u.id = `unit_${Date.now().toString(36)}`; u.name = `${u.name.slice(0, 20)}副本`; project.units.push(u); editId = u.id; markDirty(); previewReset(); renderUnitsPanel(); } }
  else if (b.dataset.action === 'delete-unit') { const u = project.units.find(u => u.id === editId); if (!u) return; if (u.role === 'worker' && !u.hero && project.units.filter(u => u.role === 'worker' && !u.hero).length === 1) { toast('需要保留至少一種普通村民。'); return; } project.units = project.units.filter(u => u.id !== editId); unitDrafts.delete(editId); pruneHeroPlacements(project.map); for (const map of undo) pruneHeroPlacements(map); editId = project.units[0].id; markDirty(); previewReset(); renderUnitsPanel(); }
  else if (b.dataset.action === 'clear-image') { uploadedImage = ''; draftsDirty = true; unitDrafts.set(editId, readUnitForm()); drawPreview(readUnitForm()); }
});
$('sidebar').addEventListener('input', e => {
  if (e.target.dataset.playerResource) { const value=Number(e.target.value); const valid=e.target.value!==''&&Number.isInteger(value)&&value>=0&&value<=1000000; e.target.setCustomValidity(valid?'':'請輸入 0–1,000,000 的整數。'); if (valid) { project.rules.playerStartingResources[e.target.dataset.playerResource]=value; markDirty(); previewReset(); } }
  if (e.target.id === 'map-title') { project.map.name = e.target.value || '自製地圖'; markDirty(); updateHud(true); }
  if (e.target.id === 'brush-size') ui.brushSize = Number(e.target.value);
  if (e.target.closest('#unit-form') && e.target.id !== 'unit-image') { if (['hp','attack','armor','range'].includes(e.target.name)) $('unit-form').elements.civilizationUpgrade.checked = false; draftsDirty = true; const draft = readUnitForm(); if (e.target.name === 'color') draft.customColor = true; if ($('hero-tools')) { $('hero-tools').hidden = !draft.hero; $('unit-form').elements.regen.disabled = !draft.hero; } unitDrafts.set(editId, draft); drawPreview(draft); }
});
$('sidebar').addEventListener('submit', e => { if (e.target.id === 'unit-form') { e.preventDefault(); saveUnit(); } });
$('sidebar').addEventListener('change', async e => {
  if (e.target.id !== 'unit-image') return; const file = e.target.files[0], form = $('unit-form'), currentEditId = editId; if (!file) return;
  try { if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8000000) throw new Error('請選擇 8 MB 以內的 PNG、JPEG 或 WebP。'); const bitmap = await createImageBitmap(file); if ($('unit-form') !== form || editId !== currentEditId) { bitmap.close(); return; } const c = document.createElement('canvas'); const ratio = Math.min(160 / bitmap.width, 160 / bitmap.height, 1); c.width = Math.max(1, Math.round(bitmap.width * ratio)); c.height = Math.max(1, Math.round(bitmap.height * ratio)); c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height); bitmap.close(); uploadedImage = c.toDataURL('image/png'); draftsDirty = true; unitDrafts.set(editId, readUnitForm()); drawPreview(readUnitForm()); toast('角色圖片已載入，按「套用兵種」完成。'); } catch (err) { toast(err.message); }
});
window.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')||document.querySelector('dialog[open]')) return;
  const k=eventKey(e);
  if (e.altKey && k==='enter') { e.preventDefault(); if (!e.repeat) toggleFullscreen(); return; }
  if (['arrowup','arrowdown','arrowleft','arrowright'].includes(k)) { e.preventDefault(); keys.add(k); return; }
  if (k==='escape') { if (fullscreenFallback) { fullscreenFallback=false; syncFullscreen(); } if (ui.mode==='map' && ui.heroBrush) cancelHeroPlacement(); cancelTargeting(); updateHud(true); return; }
  if (k==='f1') { e.preventDefault(); ui.extendedTooltips=!ui.extendedTooltips; updateHud(true); toast(`詳細提示已${ui.extendedTooltips?'開啟':'關閉'}。`); return; }
  if (k==='f2') { e.preventDefault(); saveBattle(); return; }
  if (k==='f5') { e.preventDefault(); openTechTree(); return; }
  if (ui.mode==='map'&&k==='z'&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); $('sidebar').querySelector('[data-action="undo"]')?.click(); return; }
  if (ui.mode!=='play') return;
  const own=ownEntities(), workers=own.some(u=>u.blueprint?.role==='worker');
  if (/^[0-9]$/.test(k)) {
    e.preventDefault(); const group=e.altKey?`alt-${k}`:k;
    if (e.ctrlKey&&!e.shiftKey) { ui.groups[group]=own.map(e=>e.id); toast(`編隊 ${e.altKey?Number(k||10)+10:Number(k||10)}：${ui.groups[group].length} 個單位。`); updateHud(true); }
    else { recallGroup(group,e.shiftKey&&!e.ctrlKey); if (e.ctrlKey&&e.shiftKey) centerSelection(); }
    return;
  }
  if (e.shiftKey&&(k==='.'||k===',')) { e.preventDefault(); select(world.units.filter(u=>u.team===0&&!u.garrison&&(k==='.'?u.blueprint.role==='worker'&&!u.order:u.blueprint.role!=='worker')).map(u=>u.id)); return; }
  if (e.altKey&&k===',') { e.preventDefault(); select(world.units.filter(u=>{ const p=renderer.screen(u.x,u.y); return u.team===0&&!u.garrison&&u.blueprint.role!=='worker'&&p.x>=0&&p.y>=0&&p.x<=renderer.width&&p.y<=renderer.height; }).map(u=>u.id)); return; }
  if (k==='f9'||k==='f10') { e.preventDefault(); openRules(); return; }
  if (k==='+'||k==='-') { e.preventDefault(); project.rules.speed=clamp(project.rules.speed+(k==='+'?.5:-.5),.5,2); toast(`遊戲速度 ${project.rules.speed} 倍。`); return; }

  if (e.ctrlKey) {
    const type=GO_TO_BUILDINGS[k];
    if (type) { e.preventDefault(); if (e.shiftKey) select(world.buildings.filter(b=>b.team===0&&b.type===type).map(b=>b.id)); else cycleBuilding(type); }
    else if (k==='.'||k===',') { e.preventDefault(); select(world.units.filter(u=>u.team===0&&!u.garrison&&!u.order&&(k===','?u.blueprint.role!=='worker':u.blueprint.role==='worker')).map(u=>u.id)); }
    else if (k==='m'&&e.shiftKey) { e.preventDefault(); select(world.units.filter(u=>u.team===0&&!u.garrison&&u.blueprint.role!=='worker').map(u=>u.id)); }
    else if (k===' '&&e.shiftKey) { e.preventDefault(); select(world.buildings.filter(b=>b.team===0&&['barracks','archery','stable','siege','castle','monastery'].includes(b.type)).map(b=>b.id)); }
    return;
  }
  if (k==='h') { e.preventDefault(); cycleBuilding('town'); return; }
  if (k==='.'||k===',') { e.preventDefault(); cycleIdle(k==='.'); return; }
  if (k===' '||k==='spacebar') { e.preventDefault(); centerSelection(); return; }
  if (k==='home') { e.preventDefault(); centerEvent(); return; }
  if (k==='pause'||k==='f3') { e.preventDefault(); if (ui.started) { ui.paused=!ui.paused; updateHud(true); } return; }
  if (k==='f11') { e.preventDefault(); $('game-time').hidden=!$('game-time').hidden; return; }
  if (k==='f4') { e.preventDefault(); saveBattle(); return; }
  if (e.altKey&&k==='s') { e.preventDefault(); ui.showScore=!ui.showScore; updateScore(); return; }
  if (k==='delete') { e.preventDefault(); for (const entity of (e.shiftKey?own:own.slice(0,1))) world.deleteEntity(entity.id); for (const entity of own.filter(e=>e.hp<=0)) ui.selected.delete(entity.id); updateHud(true); return; }
  const layout=buildKeys(project.rules.hotkeys,ui.buildPage);
  if (ui.buildMenu&&workers&&layout[k]) { e.preventDefault(); const id=layout[k], b=BUILDINGS[id]; if (!b) return; if ((b.age||0)>world.age(0)) toast('需要先升至下一個時代。'); else if (!world.canPay(0,b.cost)) toast('建造資源不足。'); else runAction(`build:${id}`); return; }
  const action=actions.find(a=>a.key?.toLowerCase()===k);
  if (action) { e.preventDefault(); if (!action.disabled) runAction(action.id,e.shiftKey); else toast('資源不足或目前無法執行這項指令。'); }

});
function updateScore() { let panel=$('score-panel'); if (!panel) { panel=document.createElement('div'); panel.id='score-panel'; panel.className='score-panel'; $('canvas-wrap').append(panel); } panel.hidden=!ui.showScore; if (ui.showScore) panel.innerHTML=Array.from({length:world.teams},(_,i)=>`<div style="color:${['#78b9dc','#e69e8d','#dfcb81','#d9a5ed'][i]||'#fff'}">${i===0?'我方王國':'AI 王國 '+i+(project.rules.aiAlliance&&world.teams>2?' · 敵方聯盟':'')} <b>${Math.round(world.population(i)*20+world.buildings.filter(b=>b.team===i).length*50+world.researched[i].size*15)}</b></div>`).join(''); }
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); pointerPos = null; if (ui.started) { ui.paused = true; updateHud(true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && ui.started) { ui.paused = true; updateHud(true); } });
new ResizeObserver(() => renderer.resize()).observe($('canvas-wrap'));
function frame(now) {
  const dt = Math.min((now - lastTick) / 1000, .1); lastTick = now; frameTime = now / 1000;
  if (ui.started && !ui.paused && ui.mode === 'play') { simulationLag=Math.min(.15,simulationLag+dt); let steps=0; while(simulationLag>=.05&&steps++<2) { world.tick(.05*project.rules.speed);simulationLag-=.05; } } else simulationLag=0;
  const step = 450 * dt; if (!document.querySelector('dialog[open]') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
    const dx = Number(keys.has('arrowleft') || Boolean(pointerPos && pointerPos.x < 12 && !pointer)) - Number(keys.has('arrowright') || Boolean(pointerPos && pointerPos.x > renderer.width - 12 && !pointer));
    const dy = Number(keys.has('arrowup') || Boolean(pointerPos && pointerPos.y < 12 && !pointer)) - Number(keys.has('arrowdown') || Boolean(pointerPos && pointerPos.y > renderer.height - 12 && !pointer));
    if (dx || dy) { renderer.restoreView(); renderer.pan.x += dx * step; renderer.pan.y += dy * step; renderer.constrainView(); }
  }
  if (!document.hidden && now-lastRender >= (ui.started&&!ui.paused&&ui.mode==='play' ? world.units.length>600?1000/30:world.units.length>300?1000/45:1000/60 : 50)) { fps=fps*.9+Math.min(240,1000/Math.max(1,now-lastRender))*.1; renderer.render(project, world, ui, frameTime); lastRender=now; }
  if (now - lastHud > 250) { lastHud = now; updateHud(); if (ui.showScore) updateScore(); $('performance').textContent = `${Math.round(fps)} FPS · 場上 ${world.units.length} 人 · ${opponentLabel()}`; }
  requestAnimationFrame(frame);
}
artReady.then(() => { if ($('unit-form')) drawPreview(readUnitForm()); });
switchMode('map'); updateHud(true); requestAnimationFrame(frame); if (storageError) toast(storageError); else if (world.deploymentErrors?.length) toast(world.deploymentErrors[0]); else if (mapUpgraded) { markDirty(); toast('預設兵種與舊地圖設定已更新。請儲存新版設定。'); }
