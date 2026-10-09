import { World, BUILDINGS, TILE_NAMES, RESOURCE, DEFAULT_UNITS, clone, clamp, defaultProject, validateProject, generateMap, enrichMapResources, findPath, tileType, setTile, buildingBounds, heroPlacementKey, buildingPlacementKey } from './core.mjs?v=20261009l';
import { CIVILIZATION, TECHNOLOGIES, STANCES, FORMATIONS } from './civilization.mjs?v=20261009l';
import { Renderer, COLORS, SYMBOLS, drawUnit, wheelZoomFactor } from './renderer.js?v=20261009l';
import { artReady } from './art.mjs?v=20261009l';
import { upgradeLegacyMap, upgradeDefaultUnits, setEnemyCount, spreadStartingPositions } from './project-upgrades.mjs?v=20261009l';
import { buildKeys, productionKey, menuKey, orderHint, technologyKey, commandKey, eventKey, GO_TO_BUILDINGS } from './controls.mjs?v=20261009l';
import { actionReason, actionDescription, buildReason, placementFeedback, productionStatus, selectionGroups, combatOrderHint, heroPlacementFeedback, mapBuildingPlacementFeedback, editorWallLine } from './ui-model.mjs?v=20261009l';
import { leftDragMode, crossedDragThreshold } from './interaction.mjs?v=20261009l';
import { applyContextCommand, selectionAfterClick, readControlPreferences, applySelectionStance } from './player-interaction.mjs?v=20261009l';
import { layoutActions } from './action-layout.mjs?v=20261009l';
const $ = id => document.getElementById(id);
const markupCache = new Map();
function html(id, markup) { if (markupCache.get(id)!==markup) { $(id).innerHTML=markup; markupCache.set(id,markup); } }
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const STORAGE = 'realm-forge-project-v1';
const BATTLE_STORAGE='realm-forge-battle-v1';
const CONTROL_STORAGE='realm-forge-input-v1';
let controlPreferences=readControlPreferences(null);
try {controlPreferences=readControlPreferences(localStorage.getItem(CONTROL_STORAGE));}catch {}
let project = validateProject(defaultProject()), storageError = '', mapUpgraded = false;
try { const saved = localStorage.getItem(STORAGE); if (saved) { project = validateProject(JSON.parse(saved)); mapUpgraded = upgradeLegacyMap(project); } } catch { storageError = '儲存檔無法讀取，已載入預設王國。'; }
mapUpgraded = upgradeDefaultUnits(project) || mapUpgraded;
project.rules.hotkeys = 'definitive';
let world = new World(project), editId = project.units[0].id, uploadedImage = null;
const ui = { mode: 'map', started: false, paused: true, selected: new Set(), placement: null, attackMove: false, orderMode: null, formation: 'line', buildMenu: false, buildPage: 'economy', extendedTooltips:true, leftDragPan:controlPreferences.leftDragPan, brush: 'grass', brushSize: 1, spawnBrush: null, heroBrush: null, heroSelected: null, heroPlacementSelected:null, heroMoveKey:null, heroBatchSize:1, mapBuildingBrush:null, mapBuildingTeam:0, mapBuildingSelected:null, mapBuildingMoveKey:null, groups: {}, dirty: false };
const renderer = new Renderer($('map'), $('minimap')); renderer.project = project; renderer.fit(project.map);
let lastRender=0, simulationLag=0;
let pointer = null, minimapPointer = null, pointerPos = null, keys = new Set(), undo = [], lastTick = performance.now(), lastHud = 0, toastTimer = 0, frameTime = 0, fps = 60, groupPressed = { key: '', time: 0 }, actions = [];
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
function previewReset() { renderer.restoreView(); world = new World(project); ui.mapBuildingTeam=Math.min(ui.mapBuildingTeam,project.map.spawns.length-1);ui.started = false; ui.paused = true; ui.selected.clear(); ui.groups = {}; ui.placement = null; ui.heroBrush = null; ui.heroSelected = null; ui.heroPlacementSelected=null;ui.heroMoveKey=null;ui.mapBuildingBrush=null;ui.mapBuildingSelected=null;ui.mapBuildingMoveKey=null; ui.attackMove = false; ui.orderMode = null; ui.buildMenu = false; $('result').hidden = true; renderer.project = project; updateHud(true); if (world.deploymentErrors?.length) toast(world.deploymentErrors[0]); }
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
  ui.mode = mode; ui.paused = true; ui.placement = null; ui.heroBrush = null; ui.heroSelected = null; ui.heroPlacementSelected=null;ui.heroMoveKey=null;ui.mapBuildingBrush=null;ui.mapBuildingSelected=null;ui.mapBuildingMoveKey=null; ui.attackMove = false; ui.orderMode = null; ui.buildMenu = false;
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
function select(ids, append = false, toggle = true) { ui.selected=selectionAfterClick(world,ui.selected,ids,{append,toggle}); ui.buildMenu = false; ui.placement=null; ui.orderMode=null; ui.attackMove=false; $('selection-info').parentElement.scrollTop=0; updateHud(true); }
function pruneHeroPlacements(map, units = project.units) { const ids = new Set(units.filter(u=>u.hero).map(u=>u.id)); map.heroPlacements = (map.heroPlacements || []).filter(p=>ids.has(p.unitId)); }
function clearEditorTools(clearSelection=true) {
  ui.spawnBrush=null;ui.heroBrush=null;ui.heroMoveKey=null;ui.mapBuildingBrush=null;ui.mapBuildingMoveKey=null;
  if(clearSelection){ui.heroSelected=null;ui.heroPlacementSelected=null;ui.mapBuildingSelected=null;ui.selected.clear();}
}
function rebuildMapPreview(state={}) {
  const scroll=$('sidebar').scrollTop;previewReset();Object.assign(ui,state);renderSidebar();$('sidebar').scrollTop=scroll;updateHud(true);
}
function newPlacementId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function renderHeroPanel() {
  const heroes=project.units.filter(u=>u.hero),active=heroes.find(u=>u.id===ui.heroBrush),selected=(project.map.heroPlacements||[]).find(p=>heroPlacementKey(p)===ui.heroPlacementSelected);
  return `<div class="panel-section"><div class="section-label">我方英雄 <button data-action="hero-workshop" class="small-button">創造英雄 ♞</button></div><p class="muted">同一英雄可放置多名；總人數受我方人口上限限制。未預放的英雄會在市鎮旁出現一名。</p><label>一次放置<select id="hero-batch-size">${[1,5,10,20,50].map(n=>`<option value="${n}" ${n===ui.heroBatchSize?'selected':''}>${n} 名英雄</option>`).join('')}</select></label>${active?`<p class="muted">${ui.heroMoveKey?'正在移動這一名':'連續放置'}「${escape(active.name)}」：點空地${ui.heroMoveKey?'移動此份':`放入 ${ui.heroBatchSize} 名`}，Esc 或右鍵取消。</p><button data-action="cancel-editor">取消放置 · Esc</button>`:''}<div class="unit-list">${heroes.map(u=>{const count=(project.map.heroPlacements||[]).filter(p=>p.unitId===u.id).length;return `<button class="unit-card ${ui.heroSelected===u.id||ui.heroBrush===u.id?'active':''}" data-hero-view="${u.id}"><span class="unit-symbol" style="color:${u.color}">${SYMBOLS[u.look]}</span><span><strong>★ ${escape(u.name)}</strong><small>${count?`已預放 ${count} 名`:'市鎮旁自動登場 1 名'} · 回血 ${u.regen??1}/秒</small></span><b>›</b></button>`;}).join('')}</div>${ui.heroSelected?`<div class="form-actions"><button class="primary" data-hero-place="${escape(ui.heroSelected)}">放更多英雄</button><button data-action="reset-hero">清除全部預放</button></div>`:''}${selected?`<div class="editor-selection"><strong>這一名英雄 · ${selected.x}, ${selected.y}</strong><div class="form-actions"><button data-action="move-hero">移動這一名</button><button data-action="delete-hero-placement" class="danger">刪除這一名</button></div></div>`:''}</div>`;
}
function beginHeroPlacement(id,moveKey=null) {
  const hero=project.units.find(u=>u.id===id&&u.hero);if(!hero){toast('請先建立並套用一位英雄。');return;}
  if(ui.mode!=='map'||ui.started){previewReset();switchMode('map');}
  clearEditorTools();ui.heroBrush=id;ui.heroSelected=id;ui.heroMoveKey=moveKey;ui.heroPlacementSelected=moveKey;
  if(moveKey){const p=(project.map.heroPlacements||[]).find(p=>heroPlacementKey(p)===moveKey);if(p)renderer.center(p);}
  renderSidebar();$('sidebar').scrollTop=0;updateHud(true);$('map').focus({preventScroll:true});toast(moveKey?`點空地移動這一名「${hero.name}」。`:`每次點空地放入 ${ui.heroBatchSize} 名「${hero.name}」，可連續放置；Esc 或右鍵取消。`);
}
function placeHero(point) {
  const id=ui.heroBrush;if(!id)return;
  const moveKey=ui.heroMoveKey,requested=moveKey?1:ui.heroBatchSize,feedback=heroPlacementFeedback(world,id,point,requested,moveKey);
  if(!feedback.positions.length){toast(feedback.reason);return;}
  pushUndo();let selectedKey;
  if(moveKey){const old=(project.map.heroPlacements||[]).find(p=>heroPlacementKey(p)===moveKey);if(!old)return;const moved={...old,id:old.id||newPlacementId('hero'),...feedback.positions[0]};project.map.heroPlacements=project.map.heroPlacements.map(p=>heroPlacementKey(p)===moveKey?moved:p);selectedKey=heroPlacementKey(moved);}
  else{const placements=feedback.positions.map(p=>({id:newPlacementId('hero'),unitId:id,...p}));project.map.heroPlacements=[...(project.map.heroPlacements||[]),...placements];selectedKey=heroPlacementKey(placements[0]);}
  project.map.revision=(project.map.revision||0)+1;markDirty();rebuildMapPreview({heroBrush:moveKey?null:id,heroSelected:id,heroPlacementSelected:selectedKey,heroMoveKey:null});
  toast(moveKey?'這一名英雄的位置已更新。':`已放入 ${feedback.positions.length} 名英雄${feedback.positions.length<requested?`，${feedback.reason}`:'；可繼續點空地放置。'}`);
}
function resetHeroPlacement() {
  const id=ui.heroSelected;if(!(project.map.heroPlacements||[]).some(p=>p.unitId===id)){toast('這位英雄目前在市鎮旁自動登場。');return;}
  pushUndo();project.map.heroPlacements=project.map.heroPlacements.filter(p=>p.unitId!==id);project.map.revision=(project.map.revision||0)+1;markDirty();rebuildMapPreview({heroSelected:id});toast('已清除這種英雄的全部預放；開局回到市鎮旁一名。');
}
function deleteHeroPlacement() {
  const key=ui.heroPlacementSelected,selected=(project.map.heroPlacements||[]).find(p=>heroPlacementKey(p)===key);if(!selected)return;
  pushUndo();project.map.heroPlacements=project.map.heroPlacements.filter(p=>heroPlacementKey(p)!==key);project.map.revision=(project.map.revision||0)+1;markDirty();rebuildMapPreview({heroSelected:selected.unitId});toast('已刪除這一名預放英雄；其他份數保留。');
}
function renderMapBuildingPanel() {
  const placed=project.map.buildingPlacements||[],selected=placed.find(p=>buildingPlacementKey(p)===ui.mapBuildingSelected),priority=['wall','gate','castle','tower'];
  const entries=[...priority,...Object.keys(BUILDINGS).filter(id=>!priority.includes(id))];
  return `<div class="panel-section"><div class="section-label">預放建築 · ${placed.length.toLocaleString()} / 5,000</div><p class="muted">預放建築不消耗資源、不受時代限制，開局即完成。城牆可左鍵拖曳連續放置；其他建築點空地反覆放置。</p><label>建築所屬王國<select id="map-building-team">${project.map.spawns.map((_,i)=>`<option value="${i}" ${i===ui.mapBuildingTeam?'selected':''}>${i===0?'我方':'AI '+i+(project.rules.aiAlliance?' · 敵方聯盟':'')}</option>`).join('')}</select></label><div class="editor-building-grid">${entries.map(id=>`<button data-map-build="${id}" class="${ui.mapBuildingBrush===id?'active':''}" title="預放${BUILDINGS[id].name}"><span>${SYMBOLS[id]||'⌂'}</span>${BUILDINGS[id].name}</button>`).join('')}</div>${ui.mapBuildingBrush?`<p class="muted">${ui.mapBuildingMoveKey?'移動':'連續放置'}${BUILDINGS[ui.mapBuildingBrush].name} · ${ui.mapBuildingTeam?'AI '+ui.mapBuildingTeam:'我方'}</p><button data-action="cancel-editor">取消放置 · Esc</button>`:''}${selected?`<div class="editor-selection"><strong>${BUILDINGS[selected.type].name} · ${selected.team?'AI '+selected.team:'我方'} · ${selected.x}, ${selected.y}</strong><div class="form-actions"><button data-action="move-map-building">移動此建築</button><button data-action="delete-map-building" class="danger">刪除此建築</button></div></div>`:''}</div>`;
}
function beginMapBuildingPlacement(type,moveKey=null) {
  if(!BUILDINGS[type])return;if(ui.mode!=='map'||ui.started){previewReset();switchMode('map');}
  const selected=(project.map.buildingPlacements||[]).find(p=>buildingPlacementKey(p)===moveKey);clearEditorTools();ui.mapBuildingBrush=type;ui.mapBuildingMoveKey=moveKey;ui.mapBuildingSelected=moveKey;
  if(selected){ui.mapBuildingTeam=selected.team;renderer.center(selected);}renderSidebar();updateHud(true);$('map').focus({preventScroll:true});toast(moveKey?'點空地移動這棟預放建築。':type==='wall'?'左鍵拖曳空地連續預放城牆；Esc 或右鍵取消。':`點空地連續預放${BUILDINGS[type].name}；Esc 或右鍵取消。`);
}
function placeMapBuilding(point) {
  const type=ui.mapBuildingBrush,key=ui.mapBuildingMoveKey;if(!type)return;
  const feedback=mapBuildingPlacementFeedback(world,type,point,key);if(!feedback.valid){toast(feedback.reason);return;}
  if(!key&&(project.map.buildingPlacements||[]).length>=5000){toast('預放建築最多 5,000 棟；請先刪除部分建築。');return;}
  pushUndo();let placement;
  if(key){const old=project.map.buildingPlacements.find(p=>buildingPlacementKey(p)===key);if(!old)return;placement={...old,id:old.id||newPlacementId('building'),...point};project.map.buildingPlacements=project.map.buildingPlacements.map(p=>buildingPlacementKey(p)===key?placement:p);}
  else{placement={id:newPlacementId('building'),type,team:ui.mapBuildingTeam,...point};project.map.buildingPlacements=[...(project.map.buildingPlacements||[]),placement];}
  project.map.revision=(project.map.revision||0)+1;markDirty();rebuildMapPreview({mapBuildingBrush:key?null:type,mapBuildingTeam:placement.team,mapBuildingSelected:buildingPlacementKey(placement),mapBuildingMoveKey:null});toast(key?'預放建築的位置已更新。':`已預放${BUILDINGS[type].name}；可繼續點空地放置。`);
}
function appendMapWall(point) {
  const stroke=pointer;if(stroke?.type!=='mapWall')return;const cell=`${point.x}:${point.y}`;if(stroke.visited.has(cell))return;stroke.visited.add(cell);
  if((project.map.buildingPlacements||[]).length>=5000){stroke.limit=true;return;}
  if(!world.canPlaceMapBuilding('wall',point.x,point.y)){stroke.skipped++;return;}
  if(!stroke.changed)pushUndo();const b=world.addBuilding('wall',ui.mapBuildingTeam,point.x,point.y,true);if(!b){stroke.skipped++;return;}
  const p={id:newPlacementId('building'),type:'wall',team:ui.mapBuildingTeam,...point};b.buildingPlacementKey=buildingPlacementKey(p);
  (project.map.buildingPlacements||=[]).push(p);(world.map.buildingPlacements||=[]).push(clone(p));stroke.changed=true;stroke.count++;ui.mapBuildingSelected=buildingPlacementKey(p);project.map.revision=(project.map.revision||0)+1;markDirty();
}
function finishMapWall() {
  const stroke=pointer;if(stroke?.type!=='mapWall')return;
  if(stroke.changed)rebuildMapPreview({mapBuildingBrush:'wall',mapBuildingTeam:ui.mapBuildingTeam,mapBuildingSelected:ui.mapBuildingSelected});
  toast(stroke.count?`已預放 ${stroke.count} 段城牆${stroke.limit?'；已達 5,000 棟上限':stroke.skipped?`；跳過 ${stroke.skipped} 格占地衝突`:''}。`:stroke.limit?'預放建築已達 5,000 棟上限。':'沒有可放置城牆的空地。');
}
function deleteMapBuilding() {
  const key=ui.mapBuildingSelected;if(!(project.map.buildingPlacements||[]).some(p=>buildingPlacementKey(p)===key))return;
  pushUndo();project.map.buildingPlacements=project.map.buildingPlacements.filter(p=>buildingPlacementKey(p)!==key);project.map.revision=(project.map.revision||0)+1;markDirty();rebuildMapPreview();toast('已刪除這棟預放建築。');
}
function cancelEditorPlacement() {
  if(pointer?.type==='mapWall')finishMapWall();pointer=null;renderer.drag=null;clearEditorTools(false);renderSidebar();updateHud(true);toast('已取消預放工具。');
}
function openHeroEditor(id) { editId = id || project.units.find(u=>u.hero)?.id || project.units[0].id; switchMode('units'); $('unit-form-wrap').scrollIntoView({block:'nearest'}); }
function newUnit(hero) { if (project.units.length >= 40) { toast('兵種最多 40 種。'); return; } editId = ''; ui.newHero = hero; unitDrafts.delete(''); if (ui.mode !== 'units') switchMode('units'); else renderUnitsPanel(); $('unit-form-wrap').scrollIntoView({block:'nearest'}); }
function cancelHeroPlacement() { cancelEditorPlacement(); }
function renderSidebar() {
  if (ui.mode === 'play') {
    $('sidebar').innerHTML = '';
  } else if (ui.mode === 'map') {
    $('sidebar').innerHTML = `<div class="panel-head"><div class="eyebrow">DESIGN BEFORE YOU CONQUER</div><h2>地圖與資源設計</h2><p>${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格 · 自然地景與真實資源。</p></div><div class="panel-section"><div class="section-label">AI 對手</div><label>對手數量<select id="map-enemy-count" aria-label="AI 對手數量">${[1,2,3].map(n=>`<option value="${n}" ${n===project.map.spawns.length-1?'selected':''}>${n} 個 AI 對手${n>1?' · 全部結盟':''}</option>`).join('')}</select></label><p class="muted">敵方全部結盟對抗我方。更改人數會保留既有地圖；減少對手會移除離開王國的預放建築，可按復原恢復。</p><button data-action="map-rules" class="wide">調整人口、時代與 AI 難度</button></div>${renderHeroPanel()}${renderMapBuildingPanel()}<div class="panel-section"><div class="section-label">我的起始資源</div><p class="muted">只調整我方。敵方各項起始資源為 ${project.rules.starting.toLocaleString()}，不受這裡的設定影響。</p><div class="row">${Object.entries({wood:"木材",food:"食物",gold:"黃金",stone:"石頭"}).map(([r,label])=>`<label>${label}<input aria-label="我的起始${label}" data-player-resource="${r}" type="number" min="0" max="1000000" step="1" required value="${project.rules.playerStartingResources[r]}"></label>`).join("")}</div></div><div class="panel-section"><div class="section-label">地圖資源存量 · 雙方共享</div><p class="muted">每格：木材 ${project.map.resourceAmounts.wood.toLocaleString()}、食物 ${project.map.resourceAmounts.food.toLocaleString()}、黃金／石頭各 ${project.map.resourceAmounts.gold.toLocaleString()}。敵方可正常採集。新河谷已為各出生點配置四種資源。</p><button data-action="enrich-resources" class="wide">為所有出生點補上大量資源</button></div><div class="panel-section"><label>地圖名稱<input id="map-title" maxlength="40" value="${escape(project.map.name)}"></label><div class="section-label">地形與可採集資源</div><div class="brush-grid">${Object.entries(TILE_NAMES).map(([key, name]) => `<button class="brush ${ui.brush === key && ui.spawnBrush === null && !ui.heroBrush && !ui.mapBuildingBrush ? 'active' : ''}" data-brush="${key}"><i style="background:${COLORS[key]}"></i>${name}</button>`).join('')}</div><label>筆刷大小<select id="brush-size"><option value="1">1 格 · 精細</option><option value="2">3 × 3</option><option value="3">5 × 5</option><option value="6">11 × 11</option><option value="11">21 × 21</option></select></label></div><div class="panel-section"><div class="section-label">${project.map.spawns.length} 個王國出生點</div><div class="spawn-buttons">${project.map.spawns.map((_,i)=>`<button data-spawn="${i}" class="${ui.spawnBrush===i?'active':''}">⚑ ${i===0?'我方':'AI '+i+(project.rules.aiAlliance?' · 聯盟':'')}</button>`).join('')}</div><p class="muted">選擇王國，再點空地移動出生點。上方可直接調整 1–3 個 AI 對手。</p><div class="row"><button data-action="view-spawn">查看我方 ⌖</button><button data-action="spread-spawns">分散出生點</button></div></div><div class="panel-section"><div class="section-label">地圖模板</div><label>世界格數<select id="map-size">${[64,128,256,512,1280,1536,2048].map(n=>`<option value="${n}" ${n===project.map.size?'selected':''}>${n.toLocaleString()} × ${n.toLocaleString()} ${n===128?'· 預設小地圖':n===1280?'· 超大世界':''}</option>`).join('')}</select></label><button data-action="compact-map" class="wide">建立 128 × 128 小河谷</button><div class="row"><button data-action="random-map">自然河谷</button><button data-action="blank-map">草原背景</button></div><div class="form-actions"><button data-action="undo" ${undo.length?'':'disabled'}>↶ 復原筆刷</button><button data-action="hero-workshop">創造英雄 ♞</button></div><button data-action="test-map" class="primary wide" style="margin-top:12px">完成地圖，開始對戰 ▶</button></div>`;
    $('brush-size').value = ui.brushSize;
  } else renderUnitsPanel();
}
function renderUnitsPanel() {
  $('sidebar').innerHTML = `<div class="panel-head"><div class="eyebrow">FORGE YOUR ARMY</div><h2>英雄與兵種工坊</h2><p>自訂你的英雄能力，或上傳角色圖。</p></div><div class="panel-section"><div class="section-label">你的兵種 <button data-action="new-hero" class="small-button">★ 創造英雄</button><button data-action="new-unit" class="small-button">＋ 兵種</button></div><div class="unit-list">${project.units.map(u => `<button class="unit-card ${u.id === editId ? 'active' : ''}" data-unit="${u.id}">${u.image ? `<img src="${escape(u.image)}" alt="">` : `<span class="unit-symbol" style="color:${u.color}">${SYMBOLS[u.look]}</span>`}<span><strong>${escape(u.name)}</strong><small>${u.hero ? '★ 英雄' : u.role === 'worker' ? '村民' : u.role === 'trader' ? '商隊' : u.role === 'healer' ? '治療' : u.role === 'ranged' ? '遠程' : '近戰'} · 生命 ${u.hp} · ${u.role === 'trader'?'市集貿易':`${u.role === 'healer' ? '治療' : '攻擊'} ${u.attack}`}</small></span><b>›</b></button>`).join('')}</div></div><div id="unit-form-wrap"></div>`;
  renderUnitForm();
}
function renderUnitForm() {
  let u = unitDrafts.get(editId) || project.units.find(u => u.id === editId); if (!u) u = { ...clone(DEFAULT_UNITS[1]), id: '', name: ui.newHero ? '我的英雄' : '我的新兵種', image: '', hero: Boolean(ui.newHero), building: ui.newHero ? 'castle' : 'barracks', hp: ui.newHero ? 1200 : 140, attack: ui.newHero ? 60 : 14, armor: ui.newHero ? 12 : 2 };
  uploadedImage = u.image; draftsDirty = unitDrafts.has(editId);
  $('unit-form-wrap').innerHTML = `<form class="unit-form" id="unit-form"><div class="unit-preview"><canvas id="unit-preview" width="200" height="200"></canvas><div><strong id="unit-preview-name">${escape(u.name)}</strong><small>實際戰場外觀</small></div></div><label class="checkbox-label"><input name="hero" type="checkbox" ${u.hero ? 'checked' : ''}> 英雄人物 · 只屬於我方，可在城堡復活</label><div id="hero-tools" ${u.hero?'':'hidden'}><button type="button" data-action="place-hero" class="primary wide">套用並放到地圖 ♞</button><p class="muted">設定好英雄後，點地圖選擇開局位置。同一英雄可以批量預放與連續放置；敵方 AI 沒有英雄。</p><label>每秒回血<input name="regen" type="number" min="0" max="100" step="0.1" value="${u.regen??(u.hero?1:0)}" required ${u.hero?'':'disabled'}><small>每秒恢復的生命值；0 表示不回血，最多回到生命上限。</small></label></div><label>名稱<input name="name" value="${escape(u.name)}" maxlength="24" required></label><div class="row"><label>角色<select name="role">${[['worker', '村民 · 採集建造'], ['trader', '商隊 · 市集貿易'], ['melee', '近戰戰士'], ['ranged', '遠程戰士'], ['healer', '治療者']].map(([id, label]) => `<option value="${id}" ${id === u.role ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>外觀<select name="look">${[['worker', '村民'], ['cart', '貿易商隊'], ['soldier', '劍士'], ['archer', '弓箭手'], ['knight', '騎兵'], ['mage', '法師'], ['beast', '野獸'], ['siege', '攻城器']].map(([id, label]) => `<option value="${id}" ${id === u.look ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>生產建築<select name="building">${Object.entries(BUILDINGS).filter(([id])=>['town','market','barracks','archery','stable','siege','monastery','castle'].includes(id)).map(([id,b])=>`<option value="${id}" ${id===(u.building || (u.role==='worker'?'town':'barracks'))?'selected':''}>${b.name}</option>`).join('')}</select></label><label class="checkbox-label"><input name="civilizationUpgrade" type="checkbox" ${u.upgrades?.length?'checked':''}> 使用文明兵線升級數值</label><p class="muted">調整生命、攻擊、防禦或射程後，會優先使用你的自訂數值。</p><div class="row"><label>角色顏色<input name="color" type="color" value="${u.color}"></label><label>角色圖片<input id="unit-image" type="file" accept="image/png,image/jpeg,image/webp" style="font-size:8px;padding:8px 3px"></label></div><button type="button" data-action="clear-image" class="small-button">使用內建外觀</button><div class="row">${[['wood', '木材成本', 0, 1000, 1], ['hp', '生命值', 10, 10000, 1], ['attack', '攻擊／治療量', 0, 500, 1], ['armor', '近戰護甲', -5, 100, 1], ['pierceArmor', '遠程護甲', 0, 250, 1], ['range', '攻擊／治療距離', .5, u.hero?100:20, .05], ['speed', '移動速度', .5, 6, .01], ['cooldown', '攻擊間隔（秒）', .2, 15, .05], ['food', '食物成本', 0, 1000, 1], ['gold', '黃金成本', 0, 1000, 1], ['time', '訓練時間（秒）', 1, 120, 1]].map(([id, name, min, max, step]) => `<label>${name}<input name="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${u[id] ?? 0}" required>${id==='range'?`<small id="unit-range-hint">${u.hero?'英雄攻擊／治療距離最大 100 格。':'一般兵種攻擊／治療距離最大 20 格。'}</small>`:''}</label>`).join('')}</div><div class="form-actions"><button class="primary" type="submit">套用兵種 ↗</button>${project.units.some(bp=>bp.id===editId) ? '<button type="button" data-action="duplicate-unit">複製</button><button type="button" data-action="delete-unit" class="danger">刪除</button>' : ''}</div><p class="muted">圖片會縮為 160 像素。套用後重新部署，自製兵種就能訓練；你的英雄只屬於你；其他自製兵種由雙方共享。</p></form>`;
  drawPreview(u);
}
function readUnitForm() {
  const f = $('unit-form'); if (!f) return null; const original = project.units.find(u=>u.id===editId), data = { ...clone(unitDrafts.get(editId) || original || {}), ...Object.fromEntries(new FormData(f).entries()) }; data.hero = f.elements.hero.checked; delete data.civilizationUpgrade; data.upgrades = f.elements.civilizationUpgrade.checked ? clone(original?.upgrades || data.upgrades || []) : []; if (data.role === 'worker') data.building = 'town'; if (data.role === 'trader') data.building = 'market'; if (data.hero) { data.building = 'castle'; data.age = 0; data.upgrades = []; data.family = 'hero'; }
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
  const idle=world.units.filter(u=>u.team===0&&world.isIdle(u));
  $('idle-count').textContent = idle.filter(u=>u.blueprint.role==='worker').length;
  $('idle-army-count').textContent = idle.filter(u=>world.isMilitary(u)).length;
  document.querySelector('.population').classList.toggle('blocked',world.population(0)>=world.capacity(0));
  const revealed=!project.rules.fog;
  $('fog-toggle').textContent=revealed?'☀ 全開':'◐ 迷霧';
  $('fog-toggle').setAttribute('aria-pressed',String(revealed));
  $('fog-toggle').setAttribute('aria-label',revealed?'切換為戰爭迷霧':'切換為全圖可見');
  $('fog-toggle').title=`目前：${revealed?'全圖可見':'戰爭迷霧'} · F6 切換`;
  $('fog-toggle').classList.toggle('active',revealed);
  $('game-time').textContent = timeLabel(world.time); $('game-state').textContent = !ui.started ? '準備中' : ui.paused ? '暫停' : '對戰中'; $('live-dot').classList.toggle('live', ui.started && !ui.paused);
  $('start').innerHTML = ui.mode !== 'play' ? '完成地圖，開始對戰 <span>▶</span>' : !ui.started ? '開始對戰 <span>▶</span>' : ui.paused ? '繼續對戰 <span>▶</span>' : '暫停 <span>Ⅱ</span>';
  $('battle-toggle').textContent = !ui.started ? '開始 ▶' : ui.paused ? '繼續 ▶' : '暫停 Ⅱ';
  $('map').dataset.tool = ui.heroBrush ? 'target' : ui.mapBuildingBrush ? 'build' : ui.placement ? 'build' : ui.orderMode || ui.attackMove ? 'target' : ui.mode;
  if (ui.mode==='map') $('canvas-tip').innerHTML = ui.heroBrush ? `<kbd>左鍵</kbd> ${ui.heroMoveKey?'移動這一名英雄':`批量放置 ${ui.heroBatchSize} 名英雄`} <span>·</span> <kbd>右鍵／Esc</kbd> 取消` : ui.mapBuildingBrush ? `<kbd>${ui.mapBuildingBrush==='wall'&&!ui.mapBuildingMoveKey?'左鍵拖曳':'左鍵'}</kbd> ${ui.mapBuildingMoveKey?'移動建築':'連續預放'+BUILDINGS[ui.mapBuildingBrush].name} <span>·</span> <kbd>右鍵／Esc</kbd> 取消` : '<kbd>左鍵拖曳</kbd> 畫地形 <span>·</span> <kbd>中鍵</kbd> 移動畫面';
  $('mode-badge').innerHTML = `<i></i> ${ui.mode === 'map' ? ui.heroBrush ? `${ui.heroMoveKey?'移動英雄':'批量放置英雄'} · Esc 取消` : ui.mapBuildingBrush ? `${ui.mapBuildingMoveKey?'移動':'預放'}${BUILDINGS[ui.mapBuildingBrush].name} · Esc 取消` : '地圖編輯模式' : ui.mode === 'units' ? '兵種工坊 · 部署預覽' : ui.placement ? `放置${BUILDINGS[ui.placement].name} · Esc 取消` : ui.orderMode ? `${ORDER_NAMES[ui.orderMode]} · 左鍵指定目標` : ui.attackMove ? '攻擊移動 · 點地面指定目標' : ui.started ? (ui.paused ? '對戰已暫停' : '即時戰略對戰') : '部署預覽'}`;
  $('map-name').textContent = project.map.name; $('map-caption').textContent = `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格 · ${project.map.spawns.length} 個王國 · ${project.rules.aiAlliance?'AI 結盟 · ':''}${CIVILIZATION.ages[project.rules.startAge]}`;
  for (const id of ui.selected) { const e=world.entity(id); if (!e||ui.started&&project.rules.fog&&e.team!==0&&!world.isVisible(e)) ui.selected.delete(id); }
  renderSelection(); updateProduction(); updateTargeting(); refreshActionTooltip(); updatePointerHint();
  if ($('events')) html('events', world.events.slice(0, 4).map(e => `<div class="event"><time>${timeLabel(e.time)}</time><span>${escape(e.text)}</span></div>`).join(''));
  if ($('group-buttons')) for (const b of $('group-buttons').children) b.classList.toggle('populated', (ui.groups[b.dataset.group] || []).some(id => world.entity(id)));
  if (ui.mode === 'play' && world.result && $('result').hidden) { ui.paused = true; $('result').hidden = false; $('result-title').textContent = world.result === 'victory' ? '勝利' : '戰敗'; $('result-description').textContent = world.result === 'victory' ? '敵方部隊與主要建築已消滅。這片土地，屬於你的王國。' : '我方部隊與主要建築已被消滅。調整策略，再打一場。'; }

}
const RESOURCE_LABELS = { wood: '木', food: '食', gold: '金', stone: '石' };
function updatePointerHint() {
  const own=ownEntities(),target=pointerPos&&!pointer&&minimapPointer===null&&ui.mode==='play'&&!ui.placement&&!ui.orderMode&&!ui.attackMove&&own.length?renderer.commandHit(pointerPos.x,pointerPos.y,world,ui.started&&project.rules.fog,ui.selected):null;
  const enemy=target&&world.isEnemy(0,target.team)?target:null,units=own.filter(e=>e.kind==='unit'&&!e.garrison);
  const canAttack=Boolean(enemy&&units.some(u=>!['trader','healer'].includes(u.blueprint.role)&&u.blueprint.attack>0&&!world.commandReason(u,{type:'attack',target:enemy.id})));
  const canConvert=Boolean(enemy&&units.some(u=>u.blueprint.canConvert&&!world.commandReason(u,{type:'convert',target:enemy.id})));
  const traders=units.some(u=>u.blueprint.role==='trader'),tradeTarget=traders&&target?.kind==='building'&&target.type==='market'&&target.team!==0&&target.progress===1;
  const canHeal=Boolean(target&&!enemy&&target.hp<target.maxHp&&units.some(u=>u.blueprint.role==='healer'&&!world.commandReason(u,{type:'heal',target:target.id})));
  renderer.hoverTarget=enemy?.id||null;
  renderer.hoverAttack=canAttack;
  $('map').dataset.commandTarget=canAttack?'attack':'';
  $('map').dataset.commandCursor=canAttack?'attack':canConvert?'convert':tradeTarget?'trade':canHeal?'heal':'';
  const description=canAttack?tradeTarget?'⚔ 右鍵：部隊攻擊／商隊貿易':'⚔ 右鍵攻擊':canConvert?'✧ 右鍵招降':tradeTarget?'⇄ 右鍵開始貿易':canHeal?'✚ 右鍵治療':enemy&&!units.length?'⚑ 右鍵設定集結點':null;
  $('target-hint').hidden=!description;
  if(description)$('target-hint').textContent=`${description} · ${target.team?'AI '+target.team:'我方'} ${target.kind==='building'?BUILDINGS[target.type].name:target.blueprint.name}`;
}
const ORDER_NAMES={patrol:'巡邏',guard:'守衛',follow:'跟隨',repair:'修理',garrison:'進駐',convert:'招降',rally:'集結點','attack-ground':'攻擊地面',heal:'治療'};
const ECONOMIC_BUILDINGS = new Set(['town','house','mill','farm','lumber','mining','market','blacksmith','monastery','university']);
const costLabel = cost => Object.entries(cost).filter(([,v])=>v).map(([k,v])=>`${v}${RESOURCE_LABELS[k]}`).join(' ');
function toggleFog() {
  project.rules.fog=!project.rules.fog; world.setFog(project.rules.fog);
  renderer.terrainKey=null; renderer.miniTime=-Infinity;
  // Hidden enemies must not stay selected or expose their production in the HUD.
  for (const id of ui.selected) { const e=world.entity(id); if (project.rules.fog&&e&&e.team!==0&&!world.isVisible(e)) ui.selected.delete(id); }
  markDirty(); updateHud(true); $('map').focus({preventScroll:true});
  toast(project.rules.fog?'已開啟戰爭迷霧；未探索的區域重新遮住。':'全圖可見；戰役繼續進行。');
}
let hoveredAction=null;
function refreshActionTooltip() {
  const action=actions.find(a=>a.id===hoveredAction);
  $('action-tooltip').hidden=!action||!ui.extendedTooltips||ui.mode!=='play';
  if (!action) return;
  const reason=actionReason(world,action,ownEntities());
  html('action-tooltip',`<strong>${escape(action.label)} ${action.key?`<kbd>${escape(action.key.toUpperCase())}</kbd>`:''}</strong>${action.cost?`<div class="tooltip-cost">${escape(action.cost)}</div>`:''}<p>${escape(actionDescription(world,action))}</p>${reason?`<div class="unavailable-reason">${escape(reason)}</div>`:''}`);
}
function updateTargeting() {
  const targeting=ui.mode==='play'&&(ui.placement||ui.orderMode||ui.attackMove);
  $('targeting-banner').hidden=!targeting;
  if (!targeting) { ui.placementStatus=null; return; }
  ui.placementStatus=ui.placement?placementFeedback(world,ui.placement,renderer.hover):null;
  $('targeting-text').textContent=ui.placement?`${BUILDINGS[ui.placement].name} · ${ui.placementStatus.reason}`:`${ui.attackMove?'攻擊移動':ORDER_NAMES[ui.orderMode]} · 左鍵指定目標 · Shift 排程`;
  $('targeting-banner').classList.toggle('invalid',Boolean(ui.placementStatus&&!ui.placementStatus.valid));
}
function productionJobs(buildings,queueLimit=30,jobLimit=60) {
  const jobs=[];
  for(const b of buildings) {
    if(b.progress<1) jobs.push({b,kind:'build',name:BUILDINGS[b.type].name});
    else {
      if(b.research) jobs.push({b,kind:'research',item:b.research,name:TECHNOLOGIES.find(t=>t.id===b.research.id).name});
      for(let index=0;index<Math.min(b.queue.length,queueLimit)&&jobs.length<jobLimit;index++) { const q=b.queue[index];jobs.push({b,kind:'train',item:q,index,name:world.effectiveBlueprint(q.unitId,0).name}); }
    }
    if(jobs.length>=jobLimit) break;
  }
  return jobs.slice(0,jobLimit);
}
function renderProduction(id,jobs,cancel,total=jobs.length) {
  html(id,jobs.map((job,i)=>`<button class="production-item" data-production="${i}" ${cancel&&job.kind!=='build'?`data-building="${job.b.id}" ${job.kind==='research'?'data-cancel-research':`data-cancel="${job.index}"`}`:`data-focus-building="${job.b.id}"`} title="${escape(BUILDINGS[job.b.type].name)} · ${cancel&&job.kind!=='build'?'點擊取消並退還資源':'點擊查看建築'}"><strong>${escape(job.name)}${job.kind==='train'&&job.index?` <em>排隊 ${job.index+1}</em>`:''}</strong><small data-production-label></small><span class="production-meter"><i></i></span></button>`).join('')+(total>jobs.length?`<span class="production-more">另有 ${total-jobs.length} 項${cancel?' · 單選建築可查看完整佇列':''}</span>`:''));
  for (const [i,job] of jobs.entries()) {
    const card=$(id).querySelector(`[data-production="${i}"]`);
    const status=job.kind==='build'?{percent:Math.round(job.b.progress*100),blocked:false,label:`建造 ${Math.round(job.b.progress*100)}%`}:job.kind==='train'&&job.index?{percent:0,blocked:false,label:'等待前面的訓練完成'}:productionStatus(world,job.b,job.item,job.kind==='research');
    card.querySelector('[data-production-label]').textContent=status.label;
    card.querySelector('.production-meter i').style.width=`${status.percent}%`;
    card.classList.toggle('blocked',status.blocked);
  }
}
function updateProduction() {
  if(ui.mode!=='play') { $('production-strip').hidden=true; html('selection-queue','');return; }
  const active=world.buildings.filter(b=>b.team===0&&b.hp>0&&(b.progress<1||b.research||b.queue.length));
  const total=active.reduce((n,b)=>n+(b.progress<1?1:Number(Boolean(b.research))+Number(b.queue.length>0)),0);
  $('production-strip').hidden=!total;
  renderProduction('production-strip',productionJobs(active,1,6),false,total);
  const selected=ownEntities().filter(e=>e.kind==='building'),queued=selected.reduce((n,b)=>n+(b.progress<1?1:Number(Boolean(b.research))+b.queue.length),0);
  renderProduction('selection-queue',productionJobs(selected,selected.length>2?3:30,selected.length>2?30:60),true,queued);
}
function portraitSource(e) {
  if (e.kind === 'building') return `assets/sprites/${e.type}${['farm','wall'].includes(e.type)?'':'-'+e.team%3}.webp`;
  const bp = e.blueprint; if (bp.image) return bp.image;
  let look = bp.look === 'mage' ? 'monk' : bp.look;
  if (look === 'siege') { look = ['ram','mangonel','trebuchet'].includes(bp.engine || bp.id) ? bp.engine || bp.id : 'mangonel'; if (look === 'trebuchet' && e.packed) look = 'trebuchet-packed'; }
  return ['worker','soldier','archer','knight','monk','ram','mangonel','trebuchet','trebuchet-packed'].includes(look) ? `assets/sprites/${look}-0-${e.team%3}.webp` : '';
}
function renderSelection() {
  actions=[]; if(!ui.buildMenu||ui.mode!=='play') html('command-utilities',''); $('command-heading').textContent='單位指令';
  const selectedBuilding=ui.mode==='map'&&(project.map.buildingPlacements||[]).find(p=>buildingPlacementKey(p)===ui.mapBuildingSelected);
  if(selectedBuilding){
    const spec=BUILDINGS[selectedBuilding.type];
    html('selection-info',`<div class="portrait">${SYMBOLS[selectedBuilding.type]||'⌂'}</div><div class="selection-copy"><strong>${spec.name}</strong><small>預放建築 · ${selectedBuilding.team?'AI '+selectedBuilding.team:'我方'} · ${selectedBuilding.x}, ${selectedBuilding.y}</small><div class="unit-stats"><span>開局已完成</span><span>不消耗起始資源</span></div></div>`);
    html('command-actions','<button data-command="map-building:move">移動此建築</button><button data-command="map-building:delete">刪除此建築</button>');return;
  }
  const hero = ui.mode==='map' && project.units.find(u=>u.id===ui.heroSelected&&u.hero);
  if (hero) {
    const p = (project.map.heroPlacements||[]).find(p=>heroPlacementKey(p)===ui.heroPlacementSelected), portrait = portraitSource({kind:'unit',team:0,blueprint:hero});
    html('selection-info', `<div class="portrait">${portrait?`<img src="${escape(portrait)}" alt="">`:SYMBOLS[hero.look]}</div><div class="selection-copy"><strong>★ ${escape(hero.name)}</strong><small>我方英雄 · ${p?`開局位置 ${p.x}, ${p.y}`:'市鎮旁自動登場'}</small><div class="unit-stats"><span>生命 ${hero.hp}</span><span>⚔ ${hero.attack}</span><span>◈ ${hero.armor}</span><span>回血 ${hero.regen??1}/秒</span></div></div>`);
    html('command-actions',`<button data-command="hero:append">放更多英雄</button>${p?'<button data-command="hero:move">移動這一名</button><button data-command="hero:delete">刪除這一名</button>':''}<button data-command="hero:edit">編輯這種英雄</button><button data-command="hero:reset">清除全部預放</button>`); return;
  }
  actions = []; const list = selectedEntities(), own = list.filter(e => e.team === 0 && !e.garrison), e = list[0];
  const groups=selectionGroups(list);
  const attacking=own.filter(u=>u.kind==='unit'&&(u.order?.type==='attack'||u.autoTarget&&world.isEnemy(u.team,world.entity(u.autoTarget)?.team)));
  const name = list.length > 1 ? groups.length===1?`${groups[0].name} × ${list.length}`:`已選取 ${list.length} 個單位／建築` : e ? e.kind === 'building' ? BUILDINGS[e.type].name : e.blueprint.name : ui.mode === 'map' ? '地圖筆刷' : '等待你的指揮';
  const subtitle = list.length > 1 ? attacking.length?`${attacking.length} 名部隊 · ${combatOrderHint(world,attacking[0])}${ui.paused?' · 已暫停':''}`:'點類別篩選 · Shift 點類別／頭像移除 · Ctrl＋數字編組' : e ? `${e.team === 0 ? '我方' : 'AI '+e.team} · ${Math.ceil(e.hp-1e-6)} / ${Math.round(e.maxHp)} 生命${e.blueprint ? ` · ${combatOrderHint(world,e)}${ui.paused ? ' · 已暫停' : ''}` : ''}` : ui.mode === 'map' ? `目前：${ui.spawnBrush === null ? TILE_NAMES[ui.brush] : ui.spawnBrush === 0 ? '我方出生點' : 'AI 出生點'}` : '先左鍵選取村民或士兵，再右鍵下指令';
  const symbol = e ? SYMBOLS[e.kind === 'building' ? e.type : e.blueprint.look] || '⌂' : ui.mode === 'map' ? '▧' : '♜';
  const portrait = e && portraitSource(e);
  html('selection-info', `<div class="portrait">${portrait ? `<img src="${escape(portrait)}" alt="">` : symbol}</div><div class="selection-copy"><strong>${escape(name)}</strong><small>${escape(subtitle)}</small>${e && list.length === 1 ? `<div class="health-meter"><i style="width:${clamp(e.hp / e.maxHp * 100, 0, 100)}%"></i></div>` : ''}${e?.blueprint && list.length === 1 ? `<div class="unit-stats">${e.blueprint.role==='trader'?`<span>本趟收入 ${e.order?.cargo||0} 金</span><span>往返市集貿易</span>`:`<span>⚔ ${e.blueprint.attack}</span><span title="近戰／遠程護甲">護甲 ${e.blueprint.armor} / ${e.blueprint.pierceArmor??e.blueprint.armor}</span><span>射程 ${Number(e.blueprint.range.toFixed(2))}</span>`}<span>速度 ${Number(e.blueprint.speed.toFixed(2))}</span>${e.blueprint.hero?`<span>回血 ${e.blueprint.regen??1}/秒</span>`:''}</div>` : ''}</div>${list.length>1?`<div class="selection-groups">${groups.map(g=>`<button data-select-group="${escape(g.key)}" title="只選取${escape(g.name)}；Shift 點擊移除此類別">${escape(g.name)} <b>${g.ids.length}</b></button>`).join('')}</div><div class="unit-selection">${list.slice(0,24).map(u=>{const src=portraitSource(u);return `<button data-select="${u.id}" title="${escape(u.kind==='building'?BUILDINGS[u.type].name:u.blueprint.name)} · ${Math.ceil(u.hp)}/${u.maxHp}">${src?`<img src="${escape(src)}" alt="">`:SYMBOLS[u.blueprint?.look]||'♟'}<i style="width:${clamp(u.hp/u.maxHp*100,0,100)}%"></i></button>`;}).join('')}${list.length>24?`<span>＋${list.length-24}</span>`:''}</div>`:''}`);
  if (ui.mode === 'map') { html('command-actions','<span class="muted">左鍵畫地形 · Ctrl＋Z 復原 · 中鍵拖曳視角</span>'); return; }
  const buildings = own.filter(e=>e.kind==='building');
  if (buildings.length && buildings.length===own.length) {
    const b = buildings[0]; $('command-heading').textContent=`${BUILDINGS[b.type].name}${buildings.length>1?' × '+buildings.length:''} · 生產與科技`;
    if (b.progress === 1) {
      actions = world.availableUnits(0,b.type).map(u=>({ id:`train:${u.id}`, label:u.name, symbol:SYMBOLS[u.look], image:portraitSource({kind:'unit',team:0,blueprint:u}), key:productionKey(project.rules.hotkeys,u), cost:costLabel({food:u.food,gold:u.gold,wood:u.wood||0}), disabled:!world.canPay(0,{food:u.food,gold:u.gold,wood:u.wood||0}) }));
      actions.push(...world.availableTech(0,b.type).map(t=>({id:`research:${t.id}`,label:t.name,symbol:'⌘',key:technologyKey(project.rules.hotkeys,t.id),cost:costLabel(t.cost),disabled:!own.some(e=>e.kind==='building'&&e.progress===1&&!e.research&&e.type===b.type)||!world.canPay(0,t.cost)||!world.ageRequirements(0,t.id)})));
      if (b.type==='town') actions.push({id:'town-bell',label:'城鎮警鐘',symbol:'♧',key:commandKey(project.rules.hotkeys,'town-bell'),cost:'召回／恢復工作'});
      if (BUILDINGS[b.type].garrison) actions.push({id:'ungarrison',label:'撤出駐軍',symbol:'↗',key:commandKey(project.rules.hotkeys,'ungarrison'),cost:`${b.garrisoned.length} 人`,disabled:!b.garrisoned.length});
      if (b.type==='market') for (const r of ['food','wood','stone']) for (const buy of [true,false]) actions.push({id:`trade:${r}:${buy?'buy':'sell'}`,label:`${buy?'買':'賣'}${{food:'食物',wood:'木材',stone:'石頭'}[r]}`,symbol:buy?'＋':'－',key:({wood:buy?'x':'s',food:buy?'c':'d',stone:buy?'v':'f'})[r],cost:buy?'130金 → 100':'100 → 70金'});
    }
    if (b.progress===1&&world.availableUnits(0,b.type).length) actions.push({id:'rally',label:'設定集結點',symbol:'⚑',key:'t'});
  } else if (own.some(e=>e.kind==='unit')) {
    const workers=own.some(e=>e.blueprint?.role==='worker'),traders=own.filter(e=>e.blueprint?.role==='trader'),onlyTraders=own.filter(e=>e.kind==='unit').every(e=>e.blueprint?.role==='trader');
    if (workers && ui.buildMenu) {
      const layout=buildKeys(project.rules.hotkeys,ui.buildPage);
      actions=Object.entries(BUILDINGS).filter(([id,b])=>ECONOMIC_BUILDINGS.has(id)===(ui.buildPage==='economy')).map(([id,b])=>({id:`build:${id}`,label:b.name,symbol:SYMBOLS[id]||'⌂',image:portraitSource({kind:'building',type:id,team:0}),key:Object.keys(layout).find(k=>layout[k]===id)?.toUpperCase(),cost:costLabel(b.cost)+(b.requires?' · 需'+BUILDINGS[b.requires].name:''),disabled:!world.canPay(0,b.cost)||!world.buildRequirements(0,id)}));
      $('command-heading').textContent=ui.buildPage==='economy'?'經濟建築':'軍事建築';
      html('command-utilities',`<button data-command="${ui.buildPage==='economy'?'military-menu':'build-menu'}">${ui.buildPage==='economy'?'軍事 →':'經濟 →'}</button><button data-command="build-back">返回 · Esc</button>`);
    }
    else {
      actions=(onlyTraders?['stop','follow']:['stop','patrol','guard','follow','attack-move','garrison']).map(id=>({id,label:({stop:'停止',patrol:'巡邏',guard:'守衛',follow:'跟隨','attack-move':'攻擊移動',garrison:'進駐'})[id],symbol:({stop:'■',patrol:'⇄',guard:'♜',follow:'↝','attack-move':'⚔',garrison:'↙'})[id],key:commandKey(project.rules.hotkeys,id)}));
      if(traders.length)actions.push({id:'start-trade',label:'開始貿易',symbol:'⇄',key:onlyTraders?'q':'',cost:'右鍵其他勢力市集'});
      if (workers) { actions=actions.filter(a=>!['patrol','guard','follow'].includes(a.id)); actions.push({id:'build-menu',label:'經濟建築',symbol:'⌂',key:menuKey(project.rules.hotkeys)},{id:'military-menu',label:'軍事建築',symbol:'⚑',key:menuKey(project.rules.hotkeys,true)},{id:'repair',label:'修理',symbol:'⚒',key:'e'},{id:'dropoff',label:'放下資源',symbol:'↥',key:'a'},{id:'shelter',label:'尋找庇護',symbol:'⌂',key:'f'}); }
      if (own.some(e=>e.blueprint?.id==='scout') && own.filter(e=>e.kind==='unit').every(e=>e.blueprint?.id==='scout') && own.every(e=>world.isIdle(e))) { actions=actions.filter(a=>a.id!=='stop'); actions.push({id:'auto-scout',label:'自動偵察',symbol:'⌖',key:'g'}); }
      if (own.some(e=>e.blueprint?.attackGround||e.blueprint?.splash)) { actions=actions.filter(a=>a.id!=='garrison'); actions.push({id:'attack-ground',label:'攻擊地面',symbol:'⊕',key:'t'}); }
      if (own.some(e=>e.blueprint?.canConvert)) { actions=actions.filter(a=>!['patrol','guard','follow'].includes(a.id)); actions.push({id:'convert',label:'招降',symbol:'✧',key:'q',cost:'右鍵敵軍'},{id:'heal',label:'治療',symbol:'✚',key:'w'}); }
      if (own.some(e=>e.blueprint?.packed)) { const packed=own.find(e=>e.blueprint?.packed).packed; actions=actions.filter(a=>a.id!== (packed?'patrol':'guard')); actions.push({id:'pack',label:packed?'展開投石機':'打包投石機',symbol:'⇅',key:packed?'q':'w'}); }
      if(!onlyTraders)for (const [id,label] of Object.entries(FORMATIONS)) actions.push({id:`formation:${id}`,label,symbol:'⁙',key:commandKey(project.rules.hotkeys,`formation:${id}`),active:ui.formation===id});
      if (!workers&&!onlyTraders) for (const [id,label] of Object.entries(STANCES)) actions.push({id:`stance:${id}`,label,symbol:{aggressive:'⚔',defensive:'◇',stand:'▣',passive:'○'}[id],key:commandKey(project.rules.hotkeys,`stance:${id}`),active:own.filter(e=>world.isMilitary(e)).every(e=>e.stance===id)});
    }
  }
  for (const a of actions) { a.reason=actionReason(world,a,own); a.disabled=Boolean(a.reason); }
  actions=layoutActions(actions);
  html('command-actions',actions.length ? actions.map(a=>`<button class="action ${a.disabled?'unavailable':''} ${a.active || ui.placement && a.id===`build:${ui.placement}`||ui.orderMode===a.id||ui.attackMove&&a.id==='attack-move'?'active':''}" style="grid-column:${a.column};grid-row:${a.row}" data-command="${escape(a.id)}" aria-disabled="${a.disabled}" aria-describedby="action-tooltip" title="${escape(a.label)}${a.key?' · '+a.key:''}${a.cost?' · '+escape(a.cost):''}"><kbd>${escape((a.key||'').toUpperCase())}</kbd><span class="symbol">${a.image?`<img src="${escape(a.image)}" alt="">`:a.symbol}</span><span class="label">${escape(a.label)}</span><span class="cost">${escape(a.cost||'')}</span></button>`).join('') : `<span class="muted">${e?.garrison?'駐軍中。選取所在建築，按 G 撤出。':'左鍵選取村民採集、建造；選取城鎮中心後按 Q 訓練村民。'}</span>`);

}
function runAction(id, shift = false) {
  const action=actions.find(a=>a.id===id);
  if (action) { const reason=actionReason(world,action,ownEntities()); if (reason) { toast(reason); return; } }
  if (ui.mode==='map' && id.startsWith('hero:')) { if(id==='hero:append')beginHeroPlacement(ui.heroSelected);else if (id==='hero:move') beginHeroPlacement(ui.heroSelected,ui.heroPlacementSelected); else if(id==='hero:delete')deleteHeroPlacement();else if (id==='hero:reset') resetHeroPlacement(); else if (id==='hero:edit') openHeroEditor(ui.heroSelected); return; }
  if(ui.mode==='map'&&id.startsWith('map-building:')){if(id==='map-building:delete')deleteMapBuilding();else{const p=(project.map.buildingPlacements||[]).find(p=>buildingPlacementKey(p)===ui.mapBuildingSelected);if(p)beginMapBuildingPlacement(p.type,ui.mapBuildingSelected);}return;}
  const own=ownEntities(), units=own.filter(e=>e.kind==='unit'), buildings=own.filter(e=>e.kind==='building');
  if (id.startsWith('train:')) {
    const bp=id.slice(6), candidates=buildings.filter(b=>b.progress===1&&b.queue.length<30&&world.availableUnits(0,b.type).some(u=>u.id===bp));
    for (let i=0;i<(shift?5:1)&&candidates.length;i++) { const b=candidates.slice().sort((a,b)=>a.queue.length-b.queue.length)[0], err=world.train(b.id,bp); if (err) { toast(err); break; } }
  } else if (id.startsWith('research:')) { const b=buildings.find(b=>b.progress===1&&!b.research&&world.availableTech(0,b.type).some(t=>t.id===id.slice(9))); if (b) { const err=world.research(b.id,id.slice(9)); if (err) toast(err); } }
  else if (id.startsWith('build:')) { ui.placement=id.slice(6); ui.attackMove=false; ui.orderMode=null; toast(ui.placement==='wall'?'左鍵拖曳放置一整段城牆；Shift 可接續排程。':`左鍵放置${BUILDINGS[ui.placement].name}；Shift 可連續放置。`); }
  else if (id==='build-menu'||id==='military-menu') { ui.buildMenu=true; ui.buildPage=id==='build-menu'?'economy':'military'; ui.placement=null; ui.orderMode=null; }
  else if (id==='build-back') { ui.buildMenu=false; ui.placement=null; }
  else if (id==='dropoff') { let sent=0,error='沒有可到達且收取這種資源的卸貨建築。';for(const u of units.filter(u=>u.carried)){const b=world.nearestDropoff(u);if(b){const reason=world.command([u.id],{type:'deliver',target:b.id},shift);if(reason)error=reason;else sent++;}}if(!sent)toast(error); }
  else if (id==='shelter') { const error=world.seekShelter(units.map(u=>u.id),shift);if(error)toast(error); }
  else if (id==='auto-scout') world.command(units.filter(u=>u.blueprint.id==='scout').map(u=>u.id),{type:'autoScout'});
  else if (id==='stop') { world.command(units.map(e=>e.id),null); cancelTargeting(); }
  else if(id==='start-trade') { let sent=0,error='沒有可開始貿易的商隊。';for(const u of units.filter(u=>u.blueprint.role==='trader')){const reason=world.startTrade(u,null,shift);if(reason)error=reason;else sent++;}if(!sent)toast(error); }
  else if (id==='attack-move') { ui.attackMove=true; ui.placement=null; ui.orderMode=null; toast('左鍵點地面，部隊會沿途迎擊。'); }
  else if (['patrol','guard','follow','repair','garrison','convert','rally','attack-ground','heal'].includes(id)) { ui.orderMode=id; ui.attackMove=false; ui.placement=null; toast(`${{patrol:'巡邏：點地面',guard:'守衛：點我方單位',follow:'跟隨：點單位',repair:'修理：點我方建築',garrison:'進駐：點城鎮中心、箭塔或城堡',convert:'招降：點敵方單位',rally:'集結點：點地面或資源', 'attack-ground':'攻擊地面：點目標位置',heal:'治療：點我方單位'}[id]}。`); }
  else if (id.startsWith('stance:')) { applySelectionStance(world,units,id.slice(7));toast(`部隊姿態：${STANCES[id.slice(7)]}。`); }
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
  $('map').classList.remove('camera-dragging');
  updatePointerHint();
  if (painted) { previewReset(); renderSidebar(); }
}
function issueAt(pos, shift = false, attackMove = false, forceGarrison = false, forceMove = false) {
  let p=renderer.tileAt(pos.x,pos.y);
  const target=forceMove?null:ui.orderMode||forceGarrison?renderer.hit(pos.x,pos.y,world,ui.started&&project.rules.fog):renderer.commandHit(pos.x,pos.y,world,ui.started&&project.rules.fog,ui.selected);
  const resource=!forceMove&&!target&&(!ui.orderMode||ui.orderMode==='rally')&&!forceGarrison&&!attackMove?renderer.resourceHit(pos.x,pos.y,world,ui.started&&project.rules.fog):null;
  if (resource) p={x:resource.x,y:resource.y};
  return issueCommand(p,target,shift,attackMove,forceGarrison,forceMove);
}
function issueCommand(p, target, shift = false, attackMove = false, forceGarrison = false, forceMove = false) {
  const result=applyContextCommand(world,ownEntities(),{...p,target},{shift,attackMove,forceGarrison,forceMove,mode:ui.orderMode,formation:ui.formation});
  if(!result.sent){toast(result.errors[0]||'沒有可執行這項指令的單位。');updateHud(true);return false;}
  renderer.marker={x:Math.round(p.x),y:Math.round(p.y),attack:result.attack,time:frameTime};
  updateHud(true);
  const waiting=!ui.started?'；按「開始」後執行':ui.paused?'；目前暫停，按 F3 繼續':'';
  toast(`${shift?'已加入排程 · ':''}${result.summary}${waiting}${result.errors.length?' · '+result.errors.join(' '):''}`);
  return true;
}
function centerSelection() { const es=selectedEntities(); if (es.length) renderer.center({x:es.reduce((v,e)=>v+e.x,0)/es.length,y:es.reduce((v,e)=>v+e.y,0)/es.length}); }
let eventCursor=0;
function centerEvent() { const events=world.events.filter(e=>e.x!==undefined); if (events.length) renderer.center(events[eventCursor++%events.length]); else renderer.center(project.map.spawns[0]); }
function cycleBuilding(type) { const bs=world.buildings.filter(b=>b.team===0&&b.type===type); if (bs.length) { const i=bs.findIndex(b=>ui.selected.has(b.id)), b=bs[(i+1)%bs.length]; select([b.id]); renderer.center(b); } }
function cycleIdle(worker = true) { const idle=world.units.filter(u=>u.team===0&&world.isIdle(u)&&(worker?u.blueprint.role==='worker':world.isMilitary(u))); if (idle.length) { const i=idle.findIndex(u=>ui.selected.has(u.id)), u=idle[(i+1)%idle.length]; select([u.id]); renderer.center(u); } else toast('目前沒有閒置單位。'); }
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
  else if (e.button === 2 || e.button === 0 && e.ctrlKey && /Mac/.test(navigator.platform)) { e.preventDefault(); if (ui.mode === 'map' && (ui.heroBrush||ui.mapBuildingBrush)) cancelEditorPlacement(); else if (ui.mode === 'play') { if (ui.placement || ui.attackMove || ui.orderMode) { cancelTargeting(); updateHud(true); toast('已取消放置或指定目標；再次右鍵可下指令。'); } else issueAt(pos, e.shiftKey, false, e.altKey, e.button===2&&e.ctrlKey); } }
  else if (e.button === 0) {
    if (ui.mode === 'map') {
      if (ui.heroBrush) placeHero(renderer.tileAt(pos.x,pos.y));
      else if(ui.mapBuildingBrush==='wall'&&!ui.mapBuildingMoveKey){const point=renderer.tileAt(pos.x,pos.y);pointer={type:'mapWall',last:point,visited:new Set(),count:0,skipped:0,changed:false,id:e.pointerId};appendMapWall(point);}
      else if(ui.mapBuildingBrush)placeMapBuilding(renderer.tileAt(pos.x,pos.y));
      else {
        const hero=ui.spawnBrush===null&&renderer.heroHit(pos.x,pos.y,world),building=!hero&&ui.spawnBrush===null&&renderer.buildingHit(pos.x,pos.y,world);
        if(hero){clearEditorTools();ui.heroSelected=hero.unitId;ui.heroPlacementSelected=hero.heroPlacementKey||null;renderSidebar();updateHud(true);}
        else if(building?.buildingPlacementKey){clearEditorTools();ui.mapBuildingSelected=building.buildingPlacementKey;ui.mapBuildingTeam=building.team;renderSidebar();updateHud(true);}
        else {ui.heroSelected=null;ui.heroPlacementSelected=null;ui.mapBuildingSelected=null;pushUndo();pointer={type:'paint',id:e.pointerId};paintLast=renderer.tileAt(pos.x,pos.y);paint(paintLast);}
      }
    }
    else if (ui.mode === 'play' && ui.placement==='wall') { pointer={type:'wall',start:renderer.tileAt(pos.x,pos.y),shift:e.shiftKey,id:e.pointerId}; }
    else if (ui.mode === 'play' && ui.placement) { const p = renderer.tileAt(pos.x, pos.y), err = world.build(ownEntities().map(e => e.id), ui.placement, p.x, p.y, e.shiftKey); if (err) toast(err); else { if (!e.shiftKey) { ui.placement = null; ui.buildMenu=false; } if (!ui.started) toast('地基已放置，開始對戰後村民會動工。'); } updateHud(true); }
    else if (ui.mode === 'play' && ui.attackMove) { if(issueAt(pos,e.shiftKey,true)) ui.attackMove=false; updateHud(true); }
    else if (ui.mode === 'play' && ui.orderMode) { if(issueAt(pos,e.shiftKey)&&!e.shiftKey) ui.orderMode=null; updateHud(true); }
    else {
      const type=leftDragMode({mode:ui.mode,enabled:ui.leftDragPan,shift:e.shiftKey,ctrl:e.ctrlKey,alt:e.altKey,hit:renderer.hit(pos.x,pos.y,world,ui.started&&project.rules.fog)});
      pointer = { type, start: pos, end: pos, shift: e.shiftKey, unitsOnly:e.altKey, militaryOnly:e.ctrlKey, id: e.pointerId };
    }
  }
  if (pointer) $('map').setPointerCapture(e.pointerId);
  updatePointerHint();
});
$('map').addEventListener('pointermove', e => {
  const pos = position(e); pointerPos = pos; renderer.hover = renderer.tileAt(pos.x, pos.y);
  if(pointer?.type==='panPending'&&crossedDragThreshold(pointer.start,pos)) {
    renderer.restoreView(); pointer.type='pan'; pointer.pan={...renderer.pan}; renderer.drag=null;
    $('map').classList.add('camera-dragging'); updatePointerHint();
  }
  if (pointer?.type === 'pan') {renderer.pan = { x: pointer.pan.x + pos.x - pointer.start.x, y: pointer.pan.y + pos.y - pointer.start.y }; renderer.constrainView();}
  else if(pointer?.type==='mapWall'){const point=renderer.tileAt(pos.x,pos.y);for(const cell of editorWallLine(pointer.last,point))appendMapWall(cell);pointer.last=point;}
  else if (pointer?.type === 'paint') { const p = renderer.tileAt(pos.x, pos.y), len = Math.max(Math.abs(p.x - paintLast.x), Math.abs(p.y - paintLast.y)); if (ui.spawnBrush === null) { for (let i = 1; i <= len; i++) paint({ x: Math.round(paintLast.x + (p.x - paintLast.x) * i / len), y: Math.round(paintLast.y + (p.y - paintLast.y) * i / len) }); } paintLast = p; }
  else if (pointer?.type === 'select') { pointer.end = pos; if (crossedDragThreshold(pointer.start,pos)) renderer.drag = { start: pointer.start, end: pos }; }
  if(!pointer&&performance.now()-(renderer.hintTime||0)>70){renderer.hintTime=performance.now();updatePointerHint();}
});
$('map').addEventListener('pointerup', e => {
  if(!pointer||pointer.id!==e.pointerId)return;
  const pos = position(e);
  if(pointer?.type==='mapWall'){const point=renderer.tileAt(pos.x,pos.y);for(const cell of editorWallLine(pointer.last,point))appendMapWall(cell);finishMapWall();}
  else if (pointer?.type === 'wall') { const result=world.buildWall(ownEntities().map(u=>u.id),pointer.start,renderer.tileAt(pos.x,pos.y),pointer.shift); if (result.error) toast(result.error); if (!pointer.shift) { ui.placement=null; ui.buildMenu=false; } updateHud(true); }
  else if (pointer?.type === 'select'||pointer?.type==='panPending') {
    if (renderer.drag) {
      const a=pointer.start, inside=(x,y)=>x>=Math.min(a.x,pos.x)&&x<=Math.max(a.x,pos.x)&&y>=Math.min(a.y,pos.y)&&y<=Math.max(a.y,pos.y);
      let ids=world.units.filter(u=>{ const p=renderer.screen(u.x,u.y); return u.team===0&&!u.garrison&&(!pointer.militaryOnly||world.isMilitary(u))&&(!pointer.unitsOnly||u.blueprint.role==='worker')&&inside(p.x,p.y-10*renderer.zoom); }).map(u=>u.id);
      if (!ids.length&&!pointer.militaryOnly&&!pointer.unitsOnly) ids=world.buildings.filter(b=>{ const p=renderer.screen(b.x,b.y); return b.team===0&&b.hp>0&&inside(p.x,p.y); }).map(b=>b.id);
      select(ids,pointer.shift,false);
    }
    else { const hit = renderer.hit(pos.x, pos.y, world, ui.started && project.rules.fog, pointer.unitsOnly); select(hit ? [hit.id] : [], pointer.shift); }
  } else if (pointer?.type === 'paint') { previewReset(); renderSidebar(); }
  pointer = null; renderer.drag = null; $('map').classList.remove('camera-dragging'); updatePointerHint();
});
$('map').addEventListener('pointercancel', () => { if(pointer?.type==='mapWall')finishMapWall(); pointer = null; pointerPos=null; renderer.hover=null; renderer.drag = null; $('map').classList.remove('camera-dragging'); updatePointerHint(); });
$('map').addEventListener('pointerleave', () => { pointerPos = null; renderer.hover = null; updatePointerHint(); });
$('map').addEventListener('dblclick', e => {
  if (ui.mode==='map' && !ui.heroBrush && !ui.mapBuildingBrush && ui.spawnBrush===null) { const pos=position(e), hero=renderer.heroHit(pos.x,pos.y,world); if (hero) openHeroEditor(hero.unitId); return; }
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
  const drag=$('drag-view');drag.hidden=ui.mode!=='play';drag.setAttribute('aria-pressed',String(ui.leftDragPan));drag.classList.toggle('active',ui.leftDragPan);
  drag.title=ui.leftDragPan?'已開啟：左鍵拖曳空地移動視角；Shift＋左鍵拖曳框選。點此關閉。':'已關閉：左鍵拖曳框選。點此開啟空地拖曳視角。';
  $('map').setAttribute('aria-label',ui.mode==='map'?'地圖編輯。左鍵拖曳畫地形，中鍵拖曳移動畫面。':ui.mode==='play'?`等角戰場。左鍵選取，${ui.leftDragPan?'左鍵拖曳空地移動畫面，Shift 加左鍵拖曳框選':'左鍵拖曳框選'}。右鍵移動、採集或攻擊。方向鍵移動畫面。`:'兵種部署預覽。左鍵選取，方向鍵移動畫面。');
  if(ui.mode==='play')$('canvas-tip').innerHTML=ui.leftDragPan?'<kbd>左鍵拖空地</kbd> 移動畫面 <span>·</span> <kbd>Shift＋拖曳</kbd> 框選 <span>·</span> <kbd>右鍵</kbd> 下指令':'<kbd>左鍵拖曳</kbd> 框選 <span>·</span> <kbd>右鍵</kbd> 下指令 <span>·</span> <kbd>滾輪</kbd> 縮放';
}
function zoom(factor) { renderer.zoomBy(factor, ui.mode === 'play' ? .55 : .15, ui.mode === 'play' ? 1.8 : 2.5); pointerPos = null; updateCameraControls(); }
function resetCamera() {
  const base = world.buildings.find(b=>b.team===0&&b.type==='town'&&b.hp>0) || project.map.spawns[0];
  renderer.overviewView = null; renderer.zoom = ui.mode === 'play' ? 1.1 : .9; renderer.center(base);
  keys.clear(); pointerPos = null; updateCameraControls(); $('map').focus({preventScroll:true});
}
$('map').addEventListener('wheel', e => { e.preventDefault(); if (e.deltaY) zoom(wheelZoomFactor(e.deltaY,e.deltaMode,renderer.height)); }, { passive: false });
$('minimap').addEventListener('contextmenu',e=>e.preventDefault());
function minimapPosition(e) {
  const r=$('minimap').getBoundingClientRect();return renderer.minimapPoint((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
}
$('minimap').addEventListener('pointerdown', e => {
  const p=minimapPosition(e);
  const right=e.button===2||e.button===0&&e.ctrlKey&&/Mac/.test(navigator.platform);
  if (ui.mode==='play'&&(right||e.button===0&&(ui.attackMove||ui.orderMode))) {
    e.preventDefault(); $('map').focus({preventScroll:true});
    if (right&&(ui.placement||ui.attackMove||ui.orderMode)) { cancelTargeting(); updateHud(true); return; }
    const forceMove=right&&e.button===2&&e.ctrlKey;
    const target=forceMove?null:world.units.filter(u=>!u.garrison&&world.isVisible(u)&&Math.hypot(u.x-p.x,u.y-p.y)<.8).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]||world.buildings.find(b=>{ const a=buildingBounds(b.type,b.x,b.y);return b.hp>0&&world.isVisible(b)&&p.x>=a.minX-.5&&p.x<=a.maxX+.5&&p.y>=a.minY-.5&&p.y<=a.maxY+.5; });
    const applied=issueCommand(p,target,e.shiftKey,ui.attackMove,right&&e.altKey,forceMove);
    if (applied&&!e.shiftKey) { ui.attackMove=false;ui.orderMode=null; } updateHud(true);
  } else if (e.button===0) {
    e.preventDefault();minimapPointer=e.pointerId;$('minimap').setPointerCapture(e.pointerId);
    renderer.center(p);pointerPos=null;updateCameraControls();updatePointerHint();
  }
});
$('minimap').addEventListener('pointermove',e=>{
  if(minimapPointer!==e.pointerId)return;
  e.preventDefault();renderer.center(minimapPosition(e));pointerPos=null;updateCameraControls();
});
$('minimap').addEventListener('pointerup',e=>{if(minimapPointer===e.pointerId){minimapPointer=null;if($('minimap').hasPointerCapture(e.pointerId))$('minimap').releasePointerCapture(e.pointerId);$('map').focus({preventScroll:true});}});
$('minimap').addEventListener('pointercancel',()=>{minimapPointer=null;});
$('zoom-out').onclick = () => zoom(1/1.1); $('zoom-in').onclick = () => zoom(1.1);
$('fit').onclick = () => { if (!renderer.restoreView()) renderer.fit(project.map); keys.clear(); pointerPos = null; updateCameraControls(); };
$('reset-view').onclick = resetCamera;
$('drag-view').onclick=()=>{ui.leftDragPan=!ui.leftDragPan;try{localStorage.setItem(CONTROL_STORAGE,JSON.stringify({leftDragPan:ui.leftDragPan}));}catch{}updateCameraControls();$('map').focus({preventScroll:true});toast(ui.leftDragPan?'已開啟空地左拖移動視角；Shift 拖曳或從單位開始拖曳可框選。':'已切換一般左鍵框選；可用方向鍵、邊緣或小地圖移動視角。');};
$('fullscreen-button').onclick = toggleFullscreen;
document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchMode(b.dataset.mode));
$('start').onclick = startBattle; $('reset-battle').onclick = () => { previewReset(); toast('已重新部署，準備開始新戰役。'); }; $('play-again').onclick = () => { previewReset(); startBattle(); };
$('battle-toggle').onclick = startBattle;
$('idle-workers').onclick = () => { cycleIdle(); $('map').focus({preventScroll:true}); };
$('idle-army').onclick = () => { cycleIdle(false); $('map').focus({preventScroll:true}); };
$('fog-toggle').onclick=toggleFog;
$('cancel-targeting').onclick=()=>{cancelTargeting();updateHud(true);$('map').focus({preventScroll:true});};
$('group-buttons').onclick = e => { const b=e.target.closest('[data-group]'); if (b) { recallGroup(b.dataset.group,e.shiftKey); $('map').focus({preventScroll:true}); } };
$('save').onclick = ()=>ui.mode==='play'&&ui.started?saveBattle():commitProject();
$('load-battle').onclick=loadBattle;try {$('load-battle').disabled=!localStorage.getItem(BATTLE_STORAGE);}catch {}
$('export').onclick = () => { if (!validResourceInputs()) return; try { const p = validateProject(project), blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${p.name.replace(/[\\/:*?"<>|]/g, '_')}.realm.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已匯出地圖、兵種與規則。'); } catch (e) { toast(e.message); } };
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 12000000) throw new Error('檔案超過 12 MB。'); const next = validateProject(JSON.parse(await file.text())); next.rules.hotkeys='definitive'; upgradeDefaultUnits(next); project = next; editId = project.units[0].id; undo = []; unitDrafts.clear(); draftsDirty = false; ui.newHero = false; markDirty(); previewReset(); renderer.fit(project.map); renderSidebar(); toast('王國已匯入，可以編輯或開始對戰。'); } catch (err) { toast(`無法匯入：${err.message}`); } e.target.value = ''; };
function pauseDialog(id) { const d=$(id); d.dataset.resume=String(ui.started&&!ui.paused); ui.paused=true; d.showModal(); updateHud(true); }
$('help-button').onclick = () => pauseDialog('help');
function openRules() { const resume=ui.started&&!ui.paused; const f = $('rules-form'); f.elements.enemyCount.value=project.map.spawns.length-1; for (const k of ['population', 'enemyPopulation', 'starting', 'ai', 'speed', 'startAge', 'startingBase']) f.elements[k].value = project.rules[k]; f.elements.fog.checked = project.rules.fog; f.elements.freePlayerPopulation.checked = project.rules.freePlayerPopulation; $('rules').dataset.resume=String(resume); ui.paused=true; $('rules').showModal(); updateHud(true); }
$('rules-button').onclick = openRules;
$('tech-button').onclick = openTechTree;
$('battle-rules').onclick = openRules;
$('battle-tech').onclick = openTechTree;
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{ if (d.dataset.resume==='true'&&ui.started&&ui.mode==='play') ui.paused=false; delete d.dataset.resume; updateHud(true); }));
document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('rules-form').onsubmit = e => { e.preventDefault(); const f = e.target; const next = clone(project); next.rules = { ...project.rules, population: Number(f.elements.population.value), freePlayerPopulation:f.elements.freePlayerPopulation.checked, starting: Number(f.elements.starting.value), ai: f.elements.ai.value, aiAlliance: true, enemyPopulation:Number(f.elements.enemyPopulation.value), fog: f.elements.fog.checked, speed: Number(f.elements.speed.value), startAge:Number(f.elements.startAge.value), startingBase:f.elements.startingBase.value }; try { next.map=setEnemyCount(next,Number(f.elements.enemyCount.value)); project = validateProject(next); markDirty(); previewReset(); switchMode(ui.mode); $('rules').close(); toast(`對戰設定已套用，人口上限 ${project.rules.population.toLocaleString()}。`); } catch (err) { toast(err.message); } };
document.querySelector('.command-pane').addEventListener('click',e=>{ const b=e.target.closest('[data-command]'); if(b) runAction(b.dataset.command,e.shiftKey); });
document.querySelector('.command-pane').addEventListener('pointerover',e=>{ const b=e.target.closest('[data-command]'); if(b) { hoveredAction=b.dataset.command; refreshActionTooltip(); } });
document.querySelector('.command-pane').addEventListener('pointerleave',()=>{hoveredAction=null;refreshActionTooltip();});
document.querySelector('.command-pane').addEventListener('focusin',e=>{ const b=e.target.closest('[data-command]'); hoveredAction=b?.dataset.command;refreshActionTooltip(); });
document.querySelector('.command-pane').addEventListener('focusout',()=>{hoveredAction=null;refreshActionTooltip();});
$('selection-info').addEventListener('click',e=>{
  const group=e.target.closest('[data-select-group]');
  if(group) { const g=selectionGroups(selectedEntities()).find(g=>g.key===group.dataset.selectGroup); if(g) select(e.shiftKey?[...ui.selected].filter(id=>!g.ids.includes(id)):g.ids); $('map').focus({preventScroll:true});return; }
  const unit=e.target.closest('[data-select]');
  if(unit) { if(e.shiftKey) ui.selected.delete(Number(unit.dataset.select)); else select([Number(unit.dataset.select)]);updateHud(true);$('map').focus({preventScroll:true}); }
});
function productionClick(e) {
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.focusBuilding) { const entity=world.entity(Number(b.dataset.focusBuilding)); if(entity) { select([entity.id]);renderer.center(entity); } }
  else if(b.dataset.building) { const id=Number(b.dataset.building); if(b.hasAttribute('data-cancel-research')) world.cancelResearch(id);else world.cancelTrain(id,Number(b.dataset.cancel));updateHud(true);toast('已取消，資源已退還。'); }
  $('map').focus({preventScroll:true});
}
$('selection-queue').onclick=productionClick;
$('production-strip').onclick=productionClick;
$('sidebar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.brush) { clearEditorTools();ui.brush = b.dataset.brush;renderSidebar();updateHud(true); }
  else if (b.dataset.spawn !== undefined) { clearEditorTools();ui.spawnBrush = Number(b.dataset.spawn);renderSidebar();updateHud(true); }
  else if(b.dataset.mapBuild)beginMapBuildingPlacement(b.dataset.mapBuild);
  else if (b.dataset.heroPlace) beginHeroPlacement(b.dataset.heroPlace);
  else if (b.dataset.heroView) { clearEditorTools();ui.heroSelected=b.dataset.heroView;renderer.restoreView();renderer.zoom=Math.max(renderer.zoom,.9);renderer.center(project.map.heroPlacements?.find(p=>p.unitId===ui.heroSelected)||project.map.spawns[0]);renderSidebar();updateHud(true); }
  else if (b.dataset.group) recallGroup(b.dataset.group, e.shiftKey);
  else if (b.dataset.action === 'map-rules') openRules();
  else if (b.dataset.unit) { editId = b.dataset.unit; renderUnitsPanel(); }
  else if (b.dataset.action === 'enrich-resources') { pushUndo(); enrichMapResources(project.map); markDirty(); previewReset(); renderSidebar(); toast('各王國出生點都已補上大量森林、食物、金礦與石礦。'); }
  else if (b.dataset.action === 'compact-map') { $('map-size').value=128; changeMap(false); toast('已建立 128 × 128 小河谷；可按復原恢復原地圖。'); }
  else if (b.dataset.action === 'random-map') changeMap(false);
  else if (b.dataset.action === 'blank-map') changeMap(true);
  else if (b.dataset.action === 'undo') { if (undo.length) { const size = project.map.size; project.map = undo.pop(); pruneHeroPlacements(project.map); markDirty(); previewReset(); if (size !== project.map.size) renderer.fit(project.map); renderSidebar(); } }
  else if (b.dataset.action === 'view-spawn') { renderer.restoreView(); renderer.zoom=.9; renderer.center(project.map.spawns[0]); }
  else if (b.dataset.action === 'spread-spawns') { try { const map = spreadStartingPositions(project); pushUndo(); project.map = map; markDirty(); previewReset(); renderer.project=project; renderer.zoom=.9; renderer.center(project.map.spawns[0]); renderSidebar(); toast('各勢力的出生點已分散，原有地景保留。'); } catch (err) { toast(err.message); } }
  else if (b.dataset.action === 'hero-workshop') newUnit(true);
  else if (b.dataset.action === 'place-hero') { const u=saveUnit(); if (u?.hero) beginHeroPlacement(u.id); }
  else if (b.dataset.action === 'cancel-hero'||b.dataset.action==='cancel-editor') cancelEditorPlacement();
  else if(b.dataset.action==='move-hero')beginHeroPlacement(ui.heroSelected,ui.heroPlacementSelected);
  else if(b.dataset.action==='delete-hero-placement')deleteHeroPlacement();
  else if(b.dataset.action==='move-map-building'){const p=(project.map.buildingPlacements||[]).find(p=>buildingPlacementKey(p)===ui.mapBuildingSelected);if(p)beginMapBuildingPlacement(p.type,ui.mapBuildingSelected);}
  else if(b.dataset.action==='delete-map-building')deleteMapBuilding();
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
  if (e.target.closest('#unit-form') && e.target.id !== 'unit-image') {
    const form=$('unit-form');
    if (['hp','attack','armor','range'].includes(e.target.name)) form.elements.civilizationUpgrade.checked = false;
    draftsDirty = true; const draft = readUnitForm();
    if (e.target.name === 'color') draft.customColor = true;
    if ($('hero-tools')) { $('hero-tools').hidden = !draft.hero; form.elements.regen.disabled = !draft.hero; }
    form.elements.range.max=draft.hero?'100':'20';
    $('unit-range-hint').textContent=draft.hero?'英雄攻擊／治療距離最大 100 格。':'一般兵種攻擊／治療距離最大 20 格；超過時請調整數值後套用。';
    unitDrafts.set(editId, draft); drawPreview(draft);
  }
});
$('sidebar').addEventListener('submit', e => { if (e.target.id === 'unit-form') { e.preventDefault(); saveUnit(); } });
$('sidebar').addEventListener('change', async e => {
  if(e.target.id==='map-enemy-count') {
    if(!validResourceInputs()){e.target.value=project.map.spawns.length-1;return;}
    const count=Number(e.target.value);if(count===project.map.spawns.length-1)return;
    try {const next=clone(project);next.rules.aiAlliance=true;next.map=setEnemyCount(next,count);const validated=validateProject(next);pushUndo();project=validated;clearEditorTools();markDirty();rebuildMapPreview();toast(`已設定 ${count} 個 AI 對手${count>1?'，敵方全部結盟':''}；原地圖已保留。`);}
    catch(err){toast(err.message);renderSidebar();}
    return;
  }
  if(e.target.id==='hero-batch-size'){ui.heroBatchSize=Number(e.target.value);renderSidebar();updateHud(true);return;}
  if(e.target.id==='map-building-team'){const team=Number(e.target.value);if(ui.mapBuildingMoveKey)clearEditorTools(false);ui.mapBuildingTeam=team;renderSidebar();updateHud(true);return;}
  if (e.target.id !== 'unit-image') return; const file = e.target.files[0], form = $('unit-form'), currentEditId = editId; if (!file) return;
  try { if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8000000) throw new Error('請選擇 8 MB 以內的 PNG、JPEG 或 WebP。'); const bitmap = await createImageBitmap(file); if ($('unit-form') !== form || editId !== currentEditId) { bitmap.close(); return; } const c = document.createElement('canvas'); const ratio = Math.min(160 / bitmap.width, 160 / bitmap.height, 1); c.width = Math.max(1, Math.round(bitmap.width * ratio)); c.height = Math.max(1, Math.round(bitmap.height * ratio)); c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height); bitmap.close(); uploadedImage = c.toDataURL('image/png'); draftsDirty = true; unitDrafts.set(editId, readUnitForm()); drawPreview(readUnitForm()); toast('角色圖片已載入，按「套用兵種」完成。'); } catch (err) { toast(err.message); }
});
window.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')||document.querySelector('dialog[open]')) return;
  const k=eventKey(e);
  if (e.altKey && k==='enter') { e.preventDefault(); if (!e.repeat) toggleFullscreen(); return; }
  if (['arrowup','arrowdown','arrowleft','arrowright'].includes(k)) { e.preventDefault(); keys.add(k); return; }
  if (k==='escape') { if (fullscreenFallback) { fullscreenFallback=false; syncFullscreen(); } if (ui.mode==='map' && (ui.heroBrush||ui.mapBuildingBrush)) cancelEditorPlacement(); cancelTargeting(); updateHud(true); return; }
  if (k==='f1') { e.preventDefault(); ui.extendedTooltips=!ui.extendedTooltips; updateHud(true); toast(`詳細提示已${ui.extendedTooltips?'開啟':'關閉'}。`); return; }
  if (k==='f2') { e.preventDefault(); saveBattle(); return; }
  if (k==='f6') { e.preventDefault(); if (!e.repeat) toggleFog(); return; }
  if (k==='f5') { e.preventDefault(); openTechTree(); return; }
  if (ui.mode==='map'&&k==='z'&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); $('sidebar').querySelector('[data-action="undo"]')?.click(); return; }
  if(ui.mode==='map'&&k==='delete'){e.preventDefault();if(ui.heroPlacementSelected)deleteHeroPlacement();else if(ui.mapBuildingSelected)deleteMapBuilding();return;}
  if (ui.mode!=='play') return;
  const own=ownEntities(), workers=own.some(u=>u.blueprint?.role==='worker');
  if (/^[0-9]$/.test(k)) {
    e.preventDefault(); const group=e.altKey?`alt-${k}`:k;
    if (e.ctrlKey&&!e.shiftKey) { ui.groups[group]=own.map(e=>e.id); toast(`編隊 ${e.altKey?Number(k||10)+10:Number(k||10)}：${ui.groups[group].length} 個單位。`); updateHud(true); }
    else { recallGroup(group,e.shiftKey&&!e.ctrlKey); if (e.ctrlKey&&e.shiftKey) centerSelection(); }
    return;
  }
  if (e.shiftKey&&(k==='.'||k===',')) { e.preventDefault(); select(world.units.filter(u=>u.team===0&&!u.garrison&&(k==='.'?u.blueprint.role==='worker'&&world.isIdle(u):world.isMilitary(u))).map(u=>u.id)); return; }
  if (e.altKey&&k===',') { e.preventDefault(); select(world.units.filter(u=>{ const p=renderer.screen(u.x,u.y); return u.team===0&&!u.garrison&&world.isMilitary(u)&&p.x>=0&&p.y>=0&&p.x<=renderer.width&&p.y<=renderer.height; }).map(u=>u.id)); return; }
  if (k==='f9'||k==='f10') { e.preventDefault(); openRules(); return; }
  if (k==='+'||k==='-') { e.preventDefault(); project.rules.speed=clamp(project.rules.speed+(k==='+'?.5:-.5),.5,2); toast(`遊戲速度 ${project.rules.speed} 倍。`); return; }

  if (e.ctrlKey) {
    const type=GO_TO_BUILDINGS[k];
    if (type) { e.preventDefault(); if (e.shiftKey) select(world.buildings.filter(b=>b.team===0&&b.type===type).map(b=>b.id)); else cycleBuilding(type); }
    else if (k==='.'||k===',') { e.preventDefault(); select(world.units.filter(u=>u.team===0&&world.isIdle(u)&&(k===','?world.isMilitary(u):u.blueprint.role==='worker')).map(u=>u.id)); }
    else if (k==='m'&&e.shiftKey) { e.preventDefault(); select(world.units.filter(u=>u.team===0&&!u.garrison&&world.isMilitary(u)).map(u=>u.id)); }
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
  if (ui.buildMenu&&workers&&layout[k]) { e.preventDefault(); const id=layout[k], b=BUILDINGS[id]; if (!b) return; const reason=buildReason(world,id); if (reason) toast(reason); else runAction(`build:${id}`); return; }
  const action=actions.find(a=>a.key?.toLowerCase()===k);
  if (action) { e.preventDefault(); if (!action.disabled) runAction(action.id,e.shiftKey); else toast(action.reason||'目前無法執行這項指令。'); }

});
function updateScore() { let panel=$('score-panel'); if (!panel) { panel=document.createElement('div'); panel.id='score-panel'; panel.className='score-panel'; $('canvas-wrap').append(panel); } panel.hidden=!ui.showScore; if (ui.showScore) panel.innerHTML=Array.from({length:world.teams},(_,i)=>`<div style="color:${['#78b9dc','#e69e8d','#dfcb81','#d9a5ed'][i]||'#fff'}">${i===0?'我方王國':'AI 王國 '+i+(project.rules.aiAlliance&&world.teams>2?' · 敵方聯盟':'')} <b>${Math.round(world.population(i)*20+world.buildings.filter(b=>b.team===i).length*50+world.researched[i].size*15)}</b></div>`).join(''); }
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); pointerPos = null; if(pointer?.type==='mapWall')finishMapWall(); pointer=null;minimapPointer=null;renderer.drag=null;$('map').classList.remove('camera-dragging');updatePointerHint();if (ui.started) { ui.paused = true; updateHud(true); } });
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
