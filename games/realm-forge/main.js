import { World, BUILDINGS, TILE_NAMES, DEFAULT_UNITS, clone, clamp, defaultProject, validateProject, generateMap, findPath, tileType, setTile } from './core.mjs';
import { CIVILIZATION, TECHNOLOGIES, CLASSIC_BUILD_KEYS, STANCES, FORMATIONS } from './civilization.mjs';
import { Renderer, COLORS, SYMBOLS, drawUnit } from './renderer.js';
import { artReady } from './art.mjs';
import { upgradeLegacyMap, spreadStartingPositions } from './project-upgrades.mjs';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const STORAGE = 'realm-forge-project-v1';
let project = defaultProject(), storageError = '', mapUpgraded = false;
try { const saved = localStorage.getItem(STORAGE); if (saved) { project = validateProject(JSON.parse(saved)); mapUpgraded = upgradeLegacyMap(project); } } catch { storageError = '儲存檔無法讀取，已載入預設王國。'; }
let world = new World(project), editId = project.units[0].id, uploadedImage = null;
const ui = { mode: 'map', started: false, paused: true, selected: new Set(), placement: null, attackMove: false, orderMode: null, formation: 'line', buildMenu: false, buildPage: 'economy', brush: 'grass', brushSize: 1, spawnBrush: null, groups: {}, dirty: false };
const renderer = new Renderer($('map'), $('minimap')); renderer.project = project; renderer.fit(project.map);
let pointer = null, pointerPos = null, keys = new Set(), undo = [], lastTick = performance.now(), lastHud = 0, toastTimer = 0, frameTime = 0, fps = 60, groupPressed = { key: '', time: 0 }, actions = [];
let draftsDirty = false, paintLast = null;
const unitDrafts = new Map();
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3200); }
function timeLabel(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function markDirty() { ui.dirty = true; $('save-status').textContent = '尚未儲存'; }
function previewReset() { world = new World(project); ui.started = false; ui.paused = true; ui.selected.clear(); ui.groups = {}; ui.placement = null; ui.attackMove = false; ui.orderMode = null; ui.buildMenu = false; $('result').hidden = true; renderer.project = project; updateHud(true); if (world.deploymentErrors?.length) toast(world.deploymentErrors[0]); }
function commitProject() {
  try { localStorage.setItem(STORAGE, JSON.stringify(validateProject(project))); ui.dirty = false; $('save-status').textContent = '已儲存在本機'; toast('地圖、兵種與規則已儲存在這個瀏覽器。'); }
  catch (e) { toast(`無法儲存：${e.message}。請使用匯出備份。`); }
}
function startBattle() {
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
  if (ui.mode === 'units' && mode !== 'units' && draftsDirty) toast('尚未套用的兵種編輯已保留在表單，離開後請記得套用。');
  ui.mode = mode; ui.paused = true; ui.placement = null; ui.attackMove = false; ui.orderMode = null; ui.buildMenu = false;
  document.body.dataset.mode = mode;
  $('sidebar').hidden = mode === 'play';
  (mode === 'play' ? $('hud-minimap') : $('canvas-wrap')).append(document.querySelector('.minimap-wrap'));
  pointerPos = null;
  for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.mode === mode);
  const copy = { play: ['親自指揮你的王國。', `經典世紀二操控 · ${CIVILIZATION.ages[project.rules.startAge]} · ${opponentLabel()}`], map: ['先打造世界，再踏上戰場。', `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格世界。設計地景、資源與出生點，完成後直接開戰。`], units: ['創造你自己的英雄。', '自由設定攻擊、防禦、生命與外觀，帶著英雄進入你的地圖。'] };
  $('page-title').textContent = copy[mode][0]; $('page-description').textContent = copy[mode][1];
  $('canvas-tip').innerHTML = mode === 'map' ? '<kbd>左鍵拖曳</kbd> 畫地形 <span>·</span> <kbd>中鍵</kbd> 移動畫面' : '<kbd>左鍵</kbd> 選取 <span>·</span> <kbd>右鍵</kbd> 下指令 <span>·</span> <kbd>滾輪</kbd> 縮放';
  if (mode === 'map') { renderer.project = project; renderer.zoom = .9; renderer.center(project.map.spawns[0]); }
  renderSidebar(); renderer.resize();
  if (mode === 'play') { if (!ui.started) renderer.center(world.buildings.find(b=>b.team===0&&b.type==='town') || project.map.spawns[0]); $('map').focus({preventScroll:true}); }
  updateHud(true);
}
function selectedEntities() { return [...ui.selected].map(id => world.entity(id)).filter(Boolean); }
function opponentLabel() { const count = project.map.spawns.length - 1; return project.rules.aiAlliance && count > 1 ? `${count} 個 AI 結盟對抗我方` : `對抗 ${count} 個 AI 王國`; }
function ownEntities() { return selectedEntities().filter(e => e.team === 0); }
function select(ids, append = false, toggle = true) { if (!append) ui.selected.clear(); for (const id of ids) { if (append && toggle && ui.selected.has(id)) ui.selected.delete(id); else ui.selected.add(id); } ui.buildMenu = false; updateHud(true); }
function renderSidebar() {
  if (ui.mode === 'play') {
    $('sidebar').innerHTML = '';
  } else if (ui.mode === 'map') {
    $('sidebar').innerHTML = `<div class="panel-head"><div class="eyebrow">DESIGN BEFORE YOU CONQUER</div><h2>超大世界設計</h2><p>${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格 · 自然地景與真實資源。</p></div><div class="panel-section"><label>地圖名稱<input id="map-title" maxlength="40" value="${escape(project.map.name)}"></label><div class="section-label">地形與可採集資源</div><div class="brush-grid">${Object.entries(TILE_NAMES).map(([key, name]) => `<button class="brush ${ui.brush === key && ui.spawnBrush === null ? 'active' : ''}" data-brush="${key}"><i style="background:${COLORS[key]}"></i>${name}</button>`).join('')}</div><label>筆刷大小<select id="brush-size"><option value="1">1 格 · 精細</option><option value="2">3 × 3</option><option value="3">5 × 5</option><option value="6">11 × 11</option><option value="11">21 × 21</option></select></label></div><div class="panel-section"><div class="section-label">三個王國出生點</div><div class="spawn-buttons">${project.map.spawns.map((_,i)=>`<button data-spawn="${i}" class="${ui.spawnBrush===i?'active':''}">⚑ ${i===0?'我方':'AI '+i+(project.rules.aiAlliance?' · 聯盟':'')}</button>`).join('')}</div><p class="muted">選擇王國，再點空地移動出生點。預設三方分布在地圖不同區域，兩個 AI 結盟對抗我方；聯盟可在對戰設定調整。</p><div class="row"><button data-action="view-spawn">查看我方 ⌖</button><button data-action="spread-spawns">分散出生點</button></div></div><div class="panel-section"><div class="section-label">地圖模板</div><label>世界格數<select id="map-size">${[64,128,256,512,1280,1536,2048].map(n=>`<option value="${n}" ${n===project.map.size?'selected':''}>${n.toLocaleString()} × ${n.toLocaleString()} ${n===1280?'· 預設超大世界':''}</option>`).join('')}</select></label><div class="row"><button data-action="random-map">自然河谷</button><button data-action="blank-map">草原背景</button></div><div class="form-actions"><button data-action="undo" ${undo.length?'':'disabled'}>↶ 復原筆刷</button><button data-action="hero-workshop">創造英雄 ♞</button></div><button data-action="test-map" class="primary wide" style="margin-top:12px">完成地圖，開始對戰 ▶</button></div>`;
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
  $('unit-form-wrap').innerHTML = `<form class="unit-form" id="unit-form"><div class="unit-preview"><canvas id="unit-preview" width="200" height="200"></canvas><div><strong id="unit-preview-name">${escape(u.name)}</strong><small>實際戰場外觀</small></div></div><label class="checkbox-label"><input name="hero" type="checkbox" ${u.hero ? 'checked' : ''}> 英雄人物 · 開局登場，可在城堡復活</label><label>名稱<input name="name" value="${escape(u.name)}" maxlength="24" required></label><div class="row"><label>角色<select name="role">${[['worker', '村民 · 採集建造'], ['melee', '近戰戰士'], ['ranged', '遠程戰士'], ['healer', '治療者']].map(([id, label]) => `<option value="${id}" ${id === u.role ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>外觀<select name="look">${[['worker', '村民'], ['soldier', '劍士'], ['archer', '弓箭手'], ['knight', '騎兵'], ['mage', '法師'], ['beast', '野獸'], ['siege', '攻城器']].map(([id, label]) => `<option value="${id}" ${id === u.look ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>生產建築<select name="building">${Object.entries(BUILDINGS).filter(([id])=>['town','barracks','archery','stable','siege','monastery','castle'].includes(id)).map(([id,b])=>`<option value="${id}" ${id===(u.building || (u.role==='worker'?'town':'barracks'))?'selected':''}>${b.name}</option>`).join('')}</select></label><label class="checkbox-label"><input name="civilizationUpgrade" type="checkbox" ${u.upgrades?.length?'checked':''}> 使用文明兵線升級數值</label><p class="muted">調整生命、攻擊、防禦或射程後，會優先使用你的自訂數值。</p><div class="row"><label>角色顏色<input name="color" type="color" value="${u.color}"></label><label>角色圖片<input id="unit-image" type="file" accept="image/png,image/jpeg,image/webp" style="font-size:8px;padding:8px 3px"></label></div><button type="button" data-action="clear-image" class="small-button">使用內建外觀</button><div class="row">${[['wood', '木材成本', 0, 1000, 1], ['hp', '生命值', 10, 10000, 1], ['attack', '攻擊／治療量', 0, 500, 1], ['armor', '防禦力（護甲）', 0, 100, 1], ['range', '攻擊／治療距離', 1, 12, .1], ['speed', '移動速度', .5, 6, .1], ['cooldown', '攻擊間隔（秒）', .2, 5, .1], ['food', '食物成本', 0, 1000, 1], ['gold', '黃金成本', 0, 1000, 1], ['time', '訓練時間（秒）', 1, 60, 1]].map(([id, name, min, max, step]) => `<label>${name}<input name="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${u[id] ?? 0}" required></label>`).join('')}</div><div class="form-actions"><button class="primary" type="submit">套用兵種 ↗</button>${u.id ? '<button type="button" data-action="duplicate-unit">複製</button><button type="button" data-action="delete-unit" class="danger">刪除</button>' : ''}</div><p class="muted">圖片會縮為 160 像素。套用後重新部署，自製兵種就能訓練；你的英雄只屬於你；其他自製兵種由雙方共享。</p></form>`;
  drawPreview(u);
}
function readUnitForm() {
  const f = $('unit-form'); if (!f) return null; const original = project.units.find(u=>u.id===editId), data = { ...clone(unitDrafts.get(editId) || original || {}), ...Object.fromEntries(new FormData(f).entries()) }; data.hero = f.elements.hero.checked; delete data.civilizationUpgrade; data.upgrades = f.elements.civilizationUpgrade.checked ? clone(original?.upgrades || data.upgrades || []) : []; if (data.role === 'worker') data.building = 'town'; if (data.hero) { data.building = 'castle'; data.age = 0; data.upgrades = []; data.family = 'hero'; }
  for (const k of ['hp', 'attack', 'armor', 'range', 'speed', 'cooldown', 'food', 'gold', 'wood', 'time']) data[k] = Number(data[k]);
  data.id = editId || `unit_${Date.now().toString(36)}`; data.image = uploadedImage || ''; data.name = data.name.trim(); return data;
}
function drawPreview(u) {
  if (!$('unit-preview')) return; const c = $('unit-preview').getContext('2d'); c.clearRect(0, 0, 200, 200); drawUnit(c, { blueprint: u, team: 0, id: 0, hp: u.hp, maxHp: u.hp, path: [] }, 100, 165, 3, 0, true); $('unit-preview-name').textContent = u.name;
  if (u.image) { const img = new Image(); img.onload = () => { if ($('unit-preview')) { const ctx = $('unit-preview').getContext('2d'); ctx.clearRect(0, 0, 200, 200); drawUnit(ctx, { blueprint: u, team: 0, id: 0, hp: u.hp, maxHp: u.hp, path: [] }, 100, 165, 3, 0, true); } }; img.src = u.image; }
}
function saveUnit() {
  const u = readUnitForm(), next = clone(project), i = next.units.findIndex(bp => bp.id === editId);
  if (i >= 0) next.units[i] = u; else next.units.push(u);
  try { project = validateProject(next); unitDrafts.delete(editId); editId = u.id; markDirty(); previewReset(); renderUnitsPanel(); toast(`「${u.name}」已套用，下一場可以訓練。`); } catch (e) { toast(e.message); }
}
function updateHud(force = false) {
  if (ui.mode === 'map') $('page-description').textContent = `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格世界。設計地景、資源與出生點，完成後直接開戰。`;
  else if (ui.mode === 'play') $('page-description').textContent = `經典世紀二操控 · ${CIVILIZATION.ages[project.rules.startAge]} · ${opponentLabel()}`;
  for (const k of ['wood', 'food', 'gold', 'stone']) $(`res-${k}`).textContent = Math.floor(world.stocks[0][k]).toLocaleString();
  $('population').textContent = `${world.population(0)} / ${world.capacity(0)}`; $('pop-limit').textContent = `上限 ${project.rules.population.toLocaleString()}`;
  $('age-name').textContent = project.rules.startAge === 4 ? '後帝王時代' : CIVILIZATION.ages[world.age(0)];
  $('idle-count').textContent = world.units.filter(u=>u.team===0&&!u.garrison&&!u.order&&u.blueprint.role==='worker').length;
  $('game-time').textContent = timeLabel(world.time); $('game-state').textContent = !ui.started ? '準備中' : ui.paused ? '暫停' : '對戰中'; $('live-dot').classList.toggle('live', ui.started && !ui.paused);
  $('start').innerHTML = ui.mode !== 'play' ? '完成地圖，開始對戰 <span>▶</span>' : !ui.started ? '開始對戰 <span>▶</span>' : ui.paused ? '繼續對戰 <span>▶</span>' : '暫停 <span>Ⅱ</span>';
  $('battle-toggle').textContent = !ui.started ? '開始 ▶' : ui.paused ? '繼續 ▶' : '暫停 Ⅱ';
  $('map').dataset.tool = ui.placement ? 'build' : ui.orderMode || ui.attackMove ? 'target' : ui.mode;
  $('mode-badge').innerHTML = `<i></i> ${ui.mode === 'map' ? '地圖編輯模式' : ui.mode === 'units' ? '兵種工坊 · 部署預覽' : ui.placement ? `放置${BUILDINGS[ui.placement].name} · Esc 取消` : ui.orderMode ? `${ui.orderMode} · 點目標指定指令` : ui.attackMove ? '攻擊移動 · 點地面指定目標' : ui.started ? (ui.paused ? '對戰已暫停' : '即時戰略對戰') : '部署預覽'}`;
  $('map-name').textContent = project.map.name; $('map-caption').textContent = `${project.map.size.toLocaleString()} × ${project.map.size.toLocaleString()} 格 · ${project.map.spawns.length} 個王國 · ${project.rules.aiAlliance?'AI 結盟 · ':''}${CIVILIZATION.ages[project.rules.startAge]}`;
  for (const id of ui.selected) if (!world.entity(id)) ui.selected.delete(id);
  renderSelection();
  if ($('events')) $('events').innerHTML = world.events.slice(0, 4).map(e => `<div class="event"><time>${timeLabel(e.time)}</time><span>${escape(e.text)}</span></div>`).join('');
  if ($('group-buttons')) for (const b of $('group-buttons').children) b.classList.toggle('populated', (ui.groups[b.dataset.group] || []).some(id => world.entity(id)));
  if (world.result && $('result').hidden) { ui.paused = true; $('result').hidden = false; $('result-title').textContent = world.result === 'victory' ? '勝利' : '戰敗'; $('result-description').textContent = world.result === 'victory' ? '敵方城鎮中心已被摧毀。這片土地，屬於你的王國。' : '你的城鎮中心已被摧毀。調整策略，再打一場。'; }
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
  actions = []; const list = selectedEntities(), own = list.filter(e => e.team === 0), e = list[0];
  const name = list.length > 1 ? `${list.length} 個單位` : e ? e.kind === 'building' ? BUILDINGS[e.type].name : e.blueprint.name : ui.mode === 'map' ? '地圖筆刷' : '等待你的指揮';
  const subtitle = list.length > 1 ? '右鍵下指令 · Ctrl＋數字編組' : e ? `${e.team === 0 ? '我方' : 'AI '+e.team} · ${Math.ceil(e.hp)} / ${e.maxHp} 生命${e.carried ? ` · 搬運 ${e.carried}` : ''}${e.blueprint ? ` · 攻 ${e.blueprint.attack} 防 ${e.blueprint.armor}` : ''}` : ui.mode === 'map' ? `目前：${ui.spawnBrush === null ? TILE_NAMES[ui.brush] : ui.spawnBrush === 0 ? '我方出生點' : 'AI 出生點'}` : '左鍵點選單位或建築';
  const symbol = e ? SYMBOLS[e.kind === 'building' ? e.type : e.blueprint.look] || '⌂' : ui.mode === 'map' ? '▧' : '♜';
  const portrait = e && portraitSource(e);
  $('selection-info').innerHTML = `<div class="portrait">${portrait ? `<img src="${escape(portrait)}" alt="">` : symbol}</div><div class="selection-copy"><strong>${escape(name)}</strong><small>${escape(subtitle)}</small>${e && list.length === 1 ? `<div class="health-meter"><i style="width:${clamp(e.hp / e.maxHp * 100, 0, 100)}%"></i></div>` : ''}${e?.blueprint && list.length === 1 ? `<div class="unit-stats"><span>⚔ ${e.blueprint.attack}</span><span>◈ ${e.blueprint.armor}</span><span>射程 ${Number(e.blueprint.range.toFixed(2))}</span><span>速度 ${Number(e.blueprint.speed.toFixed(2))}</span></div>` : ''}</div>${list.length>1?`<div class="unit-selection">${list.slice(0,24).map(u=>{const src=portraitSource(u);return `<button data-select="${u.id}" title="${escape(u.kind==='building'?BUILDINGS[u.type].name:u.blueprint.name)} · ${Math.ceil(u.hp)}/${u.maxHp}">${src?`<img src="${escape(src)}" alt="">`:SYMBOLS[u.blueprint?.look]||'♟'}<i style="width:${clamp(u.hp/u.maxHp*100,0,100)}%"></i></button>`;}).join('')}${list.length>24?`<span>＋${list.length-24}</span>`:''}</div>`:''}`;
  if (ui.mode === 'map') { $('command-actions').innerHTML = '<span class="muted">左鍵畫地形 · Ctrl＋Z 復原 · 中鍵拖曳視角</span>'; return; }
  const buildings = own.filter(e=>e.kind==='building');
  if (buildings.length && buildings.length===own.length) {
    const b = buildings[0];
    if (b.progress === 1) {
      actions = world.availableUnits(0,b.type).map(u=>({ id:`train:${u.id}`, label:u.name, symbol:SYMBOLS[u.look], image:portraitSource({kind:'unit',team:0,blueprint:u}), key:u.hotkey || '', cost:costLabel({food:u.food,gold:u.gold,wood:u.wood||0}), disabled:!world.canPay(0,{food:u.food,gold:u.gold,wood:u.wood||0}) || u.hero && world.units.some(e=>e.team===0&&e.blueprint.id===u.id) }));
      actions.push(...world.availableTech(0,b.type).map(t=>({id:`research:${t.id}`,label:t.name,symbol:'⌘',cost:costLabel(t.cost),disabled:Boolean(b.research)||!world.canPay(0,t.cost)})));
      if (b.type==='town') actions.push({id:'town-bell',label:'城鎮警鐘',symbol:'♧',cost:'召回／恢復工作'});
      if (BUILDINGS[b.type].garrison) actions.push({id:'ungarrison',label:'撤出駐軍',symbol:'↗',cost:`${b.garrisoned.length} 人`,disabled:!b.garrisoned.length});
      if (b.type==='market') for (const r of ['food','wood','stone']) for (const buy of [true,false]) actions.push({id:`trade:${r}:${buy?'buy':'sell'}`,label:`${buy?'買':'賣'}${{food:'食物',wood:'木材',stone:'石頭'}[r]}`,symbol:buy?'＋':'－',cost:buy?'130金 → 100':'100 → 70金'});
    }
    if (b.research) $('selection-info').innerHTML += `<div class="queue"><span>⌘ ${escape(TECHNOLOGIES.find(t=>t.id===b.research.id).name)}<small>${Math.ceil(b.research.left)} 秒</small></span></div>`;
    if (b.queue.length) $('selection-info').innerHTML += `<div class="queue">${b.queue.slice(0,5).map((q,i)=>`<button data-cancel="${i}" title="取消訓練並退還資源">${escape(world.effectiveBlueprint(q.unitId,0).name)}<small>${i===0?Math.max(0,Math.ceil(q.left))+'s':'排隊'}</small></button>`).join('')}${b.queue.length>5?`<small>＋${b.queue.length-5}</small>`:''}</div>`;
  } else if (own.some(e=>e.kind==='unit')) {
    const workers=own.some(e=>e.blueprint?.role==='worker');
    if (workers && ui.buildMenu) {
      actions=Object.entries(BUILDINGS).filter(([id,b])=>(b.age||0)<=world.age(0)&&ECONOMIC_BUILDINGS.has(id)===(ui.buildPage==='economy')).map(([id,b])=>({id:`build:${id}`,label:b.name,symbol:SYMBOLS[id]||'⌂',image:portraitSource({kind:'building',type:id,team:0}),key:Object.keys(CLASSIC_BUILD_KEYS).find(k=>CLASSIC_BUILD_KEYS[k]===id)?.toUpperCase(),cost:costLabel(b.cost),disabled:!world.canPay(0,b.cost)}));
      actions.push({id:ui.buildPage==='economy'?'military-menu':'build-menu',label:ui.buildPage==='economy'?'軍事建築':'經濟建築',symbol:'⇄'},{id:'build-back',label:'返回',symbol:'↩',key:'Esc'});
    }
    else {
      actions=[{id:'stop',label:'停止',symbol:'■',key:'S'},{id:'patrol',label:'巡邏',symbol:'⇄',key:'Z'},{id:'guard',label:'守衛',symbol:'♜',key:'X'},{id:'follow',label:'跟隨',symbol:'↝',key:'C'},{id:'attack-move',label:'攻擊移動',symbol:'⚔'},{id:'garrison',label:'進駐',symbol:'↙',cost:'Alt＋右鍵'}];
      if (workers) actions.push({id:'build-menu',label:'經濟建築',symbol:'⌂',key:'B'},{id:'military-menu',label:'軍事建築',symbol:'⚑',key:'V'},{id:'repair',label:'修理',symbol:'⚒',cost:'右鍵損壞建築'});
      if (own.some(e=>e.blueprint?.canConvert)) actions.push({id:'convert',label:'招降',symbol:'✧',cost:'右鍵敵軍'});
      if (own.some(e=>e.blueprint?.packed)) actions.push({id:'pack',label:'打包／展開',symbol:'⇅'});
      for (const [id,label] of Object.entries(FORMATIONS)) actions.push({id:`formation:${id}`,label,symbol:'⁙',key:{line:'Q',box:'W',spread:'E',flank:'R'}[id],active:ui.formation===id});
      for (const [id,label] of Object.entries(STANCES)) actions.push({id:`stance:${id}`,label,symbol:{aggressive:'⚔',defensive:'◇',stand:'▣',passive:'○'}[id],key:{aggressive:'A',defensive:'D',stand:'G',passive:'N'}[id],active:own.filter(e=>e.kind==='unit').every(e=>e.stance===id)});
    }
  }
  $('command-actions').innerHTML = actions.length ? actions.map(a=>`<button class="action ${a.active || ui.placement && a.id===`build:${ui.placement}`?'active':''}" data-command="${escape(a.id)}" ${a.disabled?'disabled':''} title="${escape(a.label)}${a.key?' · '+a.key:''}${a.cost?' · '+escape(a.cost):''}"><kbd>${escape(a.key||'')}</kbd><span class="symbol">${a.image?`<img src="${escape(a.image)}" alt="">`:a.symbol}</span><span class="label">${escape(a.label)}</span><span class="cost">${escape(a.cost||'')}</span></button>`).join('') : '<span class="muted">選村民採集與建造，選建築訓練兵種。</span>';
}
function runAction(id, shift = false) {
  const own=ownEntities(), units=own.filter(e=>e.kind==='unit'), buildings=own.filter(e=>e.kind==='building');
  if (id.startsWith('train:')) {
    const bp=id.slice(6), candidates=buildings.filter(b=>world.availableUnits(0,b.type).some(u=>u.id===bp));
    for (let i=0;i<(shift?5:1)&&candidates.length;i++) { const b=candidates.slice().sort((a,b)=>a.queue.length-b.queue.length)[0], err=world.train(b.id,bp); if (err) { toast(err); break; } }
  } else if (id.startsWith('research:')) { const b=buildings.find(b=>world.availableTech(0,b.type).some(t=>t.id===id.slice(9))); if (b) { const err=world.research(b.id,id.slice(9)); if (err) toast(err); } }
  else if (id.startsWith('build:')) { ui.placement=id.slice(6); ui.attackMove=false; ui.orderMode=null; toast(`左鍵放置${BUILDINGS[ui.placement].name}；Shift 可連續放置。`); }
  else if (id==='build-menu'||id==='military-menu') { ui.buildMenu=true; ui.buildPage=id==='build-menu'?'economy':'military'; ui.placement=null; ui.orderMode=null; }
  else if (id==='build-back') { ui.buildMenu=false; ui.placement=null; }
  else if (id==='stop') { world.command(units.map(e=>e.id),null); for (const u of units) u.autoTarget=null; ui.orderMode=null; }
  else if (id==='attack-move') { ui.attackMove=true; ui.placement=null; ui.orderMode=null; toast('左鍵點地面，部隊會沿途迎擊。'); }
  else if (['patrol','guard','follow','repair','garrison','convert'].includes(id)) { ui.orderMode=id; ui.attackMove=false; ui.placement=null; toast(`${{patrol:'巡邏：點地面',guard:'守衛：點我方單位',follow:'跟隨：點單位',repair:'修理：點我方建築',garrison:'進駐：點城鎮中心、箭塔或城堡',convert:'招降：點敵方單位'}[id]}。`); }
  else if (id.startsWith('stance:')) { for (const u of units) { u.stance=id.slice(7); u.autoTarget=null; u.combatOrigin=null; u.combatReturning=false; u.path=[]; u.pathGoal=null; u.repath=0; } }
  else if (id.startsWith('formation:')) ui.formation=id.slice(10);
  else if (id==='pack') for (const u of units.filter(u=>u.blueprint.packed)) { u.packed=!u.packed; u.path=[]; world.command([u.id],null); }
  else if (id==='ungarrison') for (const b of buildings) world.ungarrison(b.id);
  else if (id==='town-bell') world.townBell(0);
  else if (id.startsWith('trade:')) { const [,resource,way]=id.split(':'); const err=world.trade(0,resource,way==='buy'); if (err) toast(err); }
  updateHud(true); $('map').focus({preventScroll:true});
}
function issueAt(pos, shift = false, attackMove = false, forceGarrison = false) {
  let p=renderer.tileAt(pos.x,pos.y); const n=project.map.size; if (p.x<0||p.y<0||p.x>=n||p.y>=n) return;
  const target=renderer.hit(pos.x,pos.y,world,ui.started&&project.rules.fog), own=ownEntities(), units=own.filter(e=>e.kind==='unit'&&!e.garrison);
  if (!own.length) return;
  const mode=forceGarrison?'garrison':ui.orderMode;
  const resource=!target&&!mode&&!attackMove?renderer.resourceHit(pos.x,pos.y,world,ui.started&&project.rules.fog):null;
  if (resource) p={x:resource.x,y:resource.y};
  if (own.every(e=>e.kind==='building')) { for (const b of own) b.rally=target?.team>0?{type:'attack',target:target.id}:target?.type==='farm'?{type:'gather',target:target.id}:['forest','food','gold','stone'].includes(world.tile(p.x,p.y))?{type:'gather',...p}:{type:'move',...p}; toast('集結點已設定。'); }
  else if (mode) {
    if (mode==='patrol') world.command(units.map(e=>e.id),{type:'patrol',...p},shift);
    else if (target) world.command(units.filter(u=>mode==='repair'?u.blueprint.role==='worker':mode==='convert'?u.blueprint.canConvert:true).map(e=>e.id),{type:mode,target:target.id},shift);
    else { toast('請點選有效目標。'); return; }
  } else if (target?.team>0&&!attackMove) {
    for (const u of units) world.command([u.id],{type:u.blueprint.canConvert&&target.kind==='unit'?'convert':'attack',target:target.id},shift);
  } else if (target?.team===0&&target.kind==='building'&&units.some(u=>u.blueprint.role==='worker')&&!attackMove) {
    const type=target.progress<1?'build':target.type==='farm'?'gather':target.hp<target.maxHp?'repair':null;
    if (type) world.command(units.filter(e=>e.blueprint.role==='worker').map(e=>e.id),{type,target:target.id},shift);
    else moveFormation(units,p,shift,false);
  } else if (target?.team===0&&target.kind==='unit'&&units.some(u=>u.blueprint.role==='healer')&&!attackMove) world.command(units.filter(u=>u.blueprint.role==='healer').map(u=>u.id),{type:'heal',target:target.id},shift);
  else if (['forest','food','gold','stone'].includes(world.tile(p.x,p.y))&&units.some(e=>e.blueprint.role==='worker')&&!attackMove) world.command(units.filter(e=>e.blueprint.role==='worker').map(e=>e.id),{type:'gather',...p},shift);
  else moveFormation(units,p,shift,attackMove);
  renderer.marker={...p,attack:attackMove||target?.team>0,time:frameTime}; updateHud(true);
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
  ui.paused=true;
  $('tech-content').innerHTML=`<p>${CIVILIZATION.name} · ${project.rules.startAge===4?'後帝王全科技':CIVILIZATION.ages[world.age(0)]} · ${world.researched[0].size} / ${TECHNOLOGIES.length} 已研發</p>`+Object.entries(BUILDINGS).filter(([id])=>TECHNOLOGIES.some(t=>t.building===id)||world.availableUnits(0,id).length).map(([id,b])=>`<section class="tech-section"><h3>${b.name}</h3><div class="tech-units">${world.availableUnits(0,id).map(u=>escape(u.name)).join(' · ')}</div><div class="tech-list">${TECHNOLOGIES.filter(t=>t.building===id).map(t=>`<span class="${world.researched[0].has(t.id)?'done':'locked'}">${world.researched[0].has(t.id)?'✓':'◇'} ${t.name}<small>${CIVILIZATION.ages[t.age]} · ${costLabel(t.cost)}</small></span>`).join('')}</div></section>`).join('');
  $('tech-tree').showModal(); updateHud(true);
}
function recallGroup(key, append = false) {
  const ids = (ui.groups[key] || []).filter(id => world.entity(id)); if (!ids.length) { toast(`編隊 ${key} 尚未設定。選部隊後按 Ctrl＋${key}。`); return; }
  if (!append) ui.selected.clear(); ids.forEach(id => ui.selected.add(id));
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
  const n = Number($('map-size').value); pushUndo(); project.map = generateMap(n, Math.floor(Math.random() * 10000));
  if (blank) { if (project.map.tiles) project.map.tiles.fill('grass'); else project.map.template='grass'; project.map.name = '廣闊草原'; }
  markDirty(); previewReset(); renderer.project=project; renderer.zoom=.9; renderer.center(project.map.spawns[0]); renderSidebar();
}
function position(e) { const r = $('map').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
$('map').addEventListener('contextmenu', e => e.preventDefault());
$('map').addEventListener('pointerdown', e => {
  $('map').focus({ preventScroll: true }); const pos = position(e); pointerPos = pos;
  if (e.button === 1 && ui.mode === 'play') { centerEvent(); e.preventDefault(); return; }
  if (e.button === 1 || e.button === 0 && e.altKey) { pointer = { type: 'pan', start: pos, pan: { ...renderer.pan }, id: e.pointerId }; e.preventDefault(); }
  else if (e.button === 2) { if (ui.mode === 'play') { if (ui.placement || ui.attackMove || ui.orderMode) { ui.placement = null; ui.attackMove = false; ui.orderMode = null; updateHud(true); } else issueAt(pos, e.shiftKey, false, e.altKey); } }
  else if (e.button === 0) {
    if (ui.mode === 'map') { pushUndo(); pointer = { type: 'paint', id: e.pointerId }; paintLast = renderer.tileAt(pos.x, pos.y); paint(paintLast); }
    else if (ui.mode === 'play' && ui.placement) { const p = renderer.tileAt(pos.x, pos.y), err = world.build(ownEntities().map(e => e.id), ui.placement, p.x, p.y, e.shiftKey); if (err) toast(err); else { if (!e.shiftKey) ui.placement = null; if (!ui.started) toast('地基已放置，開始對戰後村民會動工。'); } updateHud(true); }
    else if (ui.mode === 'play' && ui.attackMove) { issueAt(pos, e.shiftKey, true); ui.attackMove = false; updateHud(true); }
    else if (ui.mode === 'play' && ui.orderMode) { issueAt(pos, e.shiftKey); if (!e.shiftKey) ui.orderMode = null; updateHud(true); }
    else pointer = { type: 'select', start: pos, end: pos, shift: e.shiftKey, id: e.pointerId };
  }
  if (pointer) $('map').setPointerCapture(e.pointerId);
});
$('map').addEventListener('pointermove', e => {
  const pos = position(e); pointerPos = pos; renderer.hover = renderer.tileAt(pos.x, pos.y);
  if (pointer?.type === 'pan') renderer.pan = { x: pointer.pan.x + pos.x - pointer.start.x, y: pointer.pan.y + pos.y - pointer.start.y };
  else if (pointer?.type === 'paint') { const p = renderer.tileAt(pos.x, pos.y), len = Math.max(Math.abs(p.x - paintLast.x), Math.abs(p.y - paintLast.y)); if (ui.spawnBrush === null) { for (let i = 1; i <= len; i++) paint({ x: Math.round(paintLast.x + (p.x - paintLast.x) * i / len), y: Math.round(paintLast.y + (p.y - paintLast.y) * i / len) }); } paintLast = p; }
  else if (pointer?.type === 'select') { pointer.end = pos; if (Math.hypot(pos.x - pointer.start.x, pos.y - pointer.start.y) > 5) renderer.drag = { start: pointer.start, end: pos }; }
});
$('map').addEventListener('pointerup', e => {
  const pos = position(e);
  if (pointer?.type === 'select') {
    if (renderer.drag) { const a = pointer.start, ids = world.units.filter(u => { const p = renderer.screen(u.x, u.y); return u.team === 0 && !u.garrison && p.x >= Math.min(a.x, pos.x) && p.x <= Math.max(a.x, pos.x) && p.y - 10 * renderer.zoom >= Math.min(a.y, pos.y) && p.y - 10 * renderer.zoom <= Math.max(a.y, pos.y); }).map(u => u.id); select(ids, pointer.shift, false); }
    else { const hit = renderer.hit(pos.x, pos.y, world, ui.started && project.rules.fog); select(hit ? [hit.id] : [], pointer.shift); }
  } else if (pointer?.type === 'paint') { previewReset(); renderSidebar(); }
  pointer = null; renderer.drag = null;
});
$('map').addEventListener('pointercancel', () => { pointer = null; renderer.drag = null; });
$('map').addEventListener('pointerleave', () => { pointerPos = null; renderer.hover = null; });
$('map').addEventListener('dblclick', e => {
  if (ui.mode !== 'play') return; const pos = position(e), hit = renderer.hit(pos.x, pos.y, world, ui.started && project.rules.fog); if (!hit || hit.team !== 0) return;
  const pool = hit.kind === 'unit' ? world.units : world.buildings;
  const ids = pool.filter(u => { const p = renderer.screen(u.x, u.y); return u.team === 0 && !u.garrison && (hit.kind === 'unit' ? u.blueprint.id === hit.blueprint.id : u.type === hit.type) && p.x >= 0 && p.x <= renderer.width && p.y >= 0 && p.y <= renderer.height; }).map(u => u.id); select(ids, e.shiftKey);
});
function zoom(factor, pos = { x: renderer.width / 2, y: renderer.height / 2 }) { const before = renderer.world(pos.x, pos.y); renderer.zoom = clamp(renderer.zoom * factor, .005, 3); const after = renderer.screen(before.x, before.y); renderer.pan.x += pos.x - after.x; renderer.pan.y += pos.y - after.y; }
$('map').addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, position(e)); }, { passive: false });
$('minimap').addEventListener('contextmenu',e=>e.preventDefault());
$('minimap').addEventListener('pointerdown', e => {
  const r = $('minimap').getBoundingClientRect(), p = renderer.minimapPoint((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
  if (e.button===2&&ui.mode==='play') {
    e.preventDefault(); const own=ownEntities(), units=own.filter(u=>u.kind==='unit'&&!u.garrison);
    for (const b of own.filter(u=>u.kind==='building')) b.rally={type:'move',...p};
    if (units.length) moveFormation(units,p,e.shiftKey,false);
    renderer.marker={...p,attack:false,time:frameTime}; updateHud(true);
  } else if (e.button===0) renderer.center(p);
});
$('zoom-out').onclick = () => zoom(.8); $('zoom-in').onclick = () => zoom(1.25); $('fit').onclick = () => renderer.fit(project.map);
document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchMode(b.dataset.mode));
$('start').onclick = startBattle; $('reset-battle').onclick = () => { previewReset(); toast('已重新部署，準備開始新戰役。'); }; $('play-again').onclick = () => { previewReset(); startBattle(); };
$('battle-toggle').onclick = startBattle;
$('idle-workers').onclick = () => { cycleIdle(); $('map').focus({preventScroll:true}); };
$('group-buttons').onclick = e => { const b=e.target.closest('[data-group]'); if (b) { recallGroup(b.dataset.group,e.shiftKey); $('map').focus({preventScroll:true}); } };
$('save').onclick = commitProject;
$('export').onclick = () => { try { const p = validateProject(project), blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${p.name.replace(/[\\/:*?"<>|]/g, '_')}.realm.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已匯出地圖、兵種與規則。'); } catch (e) { toast(e.message); } };
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 12000000) throw new Error('檔案超過 12 MB。'); const next = validateProject(JSON.parse(await file.text())); project = next; editId = project.units[0].id; undo = []; markDirty(); previewReset(); renderer.fit(project.map); renderSidebar(); toast('王國已匯入，可以編輯或開始對戰。'); } catch (err) { toast(`無法匯入：${err.message}`); } e.target.value = ''; };
$('help-button').onclick = () => { ui.paused = true; $('help').showModal(); updateHud(true); };
function openRules() { ui.paused = true; const f = $('rules-form'); for (const k of ['population', 'starting', 'ai', 'speed', 'startAge', 'startingBase']) f.elements[k].value = project.rules[k]; f.elements.fog.checked = project.rules.fog; f.elements.aiAlliance.checked = project.rules.aiAlliance; $('rules').showModal(); updateHud(true); }
$('rules-button').onclick = openRules;
$('tech-button').onclick = openTechTree;
$('battle-rules').onclick = openRules;
$('battle-tech').onclick = openTechTree;
document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('rules-form').onsubmit = e => { e.preventDefault(); const f = e.target; const next = clone(project); next.rules = { ...project.rules, population: Number(f.elements.population.value), starting: Number(f.elements.starting.value), ai: f.elements.ai.value, aiAlliance: f.elements.aiAlliance.checked, fog: f.elements.fog.checked, speed: Number(f.elements.speed.value), startAge:Number(f.elements.startAge.value), startingBase:f.elements.startingBase.value }; try { project = validateProject(next); markDirty(); previewReset(); switchMode(ui.mode); $('rules').close(); toast(`對戰設定已套用，人口上限 ${project.rules.population.toLocaleString()}。`); } catch (err) { toast(err.message); } };
$('command-actions').addEventListener('click', e => { const b = e.target.closest('[data-command]'); if (b && !b.disabled) runAction(b.dataset.command, e.shiftKey); });
$('selection-info').addEventListener('click', e => { const unit=e.target.closest('[data-select]'); if (unit) { if (e.shiftKey) ui.selected.delete(Number(unit.dataset.select)); else select([Number(unit.dataset.select)]); updateHud(true); $('map').focus({preventScroll:true}); return; } const b = e.target.closest('[data-cancel]'); const entity = ownEntities()[0]; if (b && entity) { world.cancelTrain(entity.id, Number(b.dataset.cancel)); updateHud(true); } });
$('sidebar').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.brush) { ui.brush = b.dataset.brush; ui.spawnBrush = null; renderSidebar(); updateHud(true); }
  else if (b.dataset.spawn !== undefined) { ui.spawnBrush = Number(b.dataset.spawn); renderSidebar(); }
  else if (b.dataset.group) recallGroup(b.dataset.group, e.shiftKey);
  else if (b.dataset.unit) { editId = b.dataset.unit; renderUnitsPanel(); }
  else if (b.dataset.action === 'random-map') changeMap(false);
  else if (b.dataset.action === 'blank-map') changeMap(true);
  else if (b.dataset.action === 'undo') { if (undo.length) { const size = project.map.size; project.map = undo.pop(); markDirty(); previewReset(); if (size !== project.map.size) renderer.fit(project.map); renderSidebar(); } }
  else if (b.dataset.action === 'view-spawn') { renderer.zoom=.9; renderer.center(project.map.spawns[0]); }
  else if (b.dataset.action === 'spread-spawns') { try { const map = spreadStartingPositions(project); pushUndo(); project.map = map; markDirty(); previewReset(); renderer.project=project; renderer.zoom=.9; renderer.center(project.map.spawns[0]); renderSidebar(); toast('各勢力的出生點已分散，原有地景保留。'); } catch (err) { toast(err.message); } }
  else if (b.dataset.action === 'hero-workshop') switchMode('units');
  else if (b.dataset.action === 'test-map') { previewReset(); startBattle(); }
  else if (b.dataset.action === 'new-unit' || b.dataset.action==='new-hero') { if (project.units.length >= 40) { toast('兵種最多 40 種。'); return; } editId = ''; ui.newHero=b.dataset.action==='new-hero'; unitDrafts.delete(''); renderUnitsPanel(); }
  else if (b.dataset.action === 'duplicate-unit') { const u = clone(project.units.find(u => u.id === editId)); if (u && project.units.length < 40) { u.id = `unit_${Date.now().toString(36)}`; u.name = `${u.name.slice(0, 20)}副本`; project.units.push(u); editId = u.id; markDirty(); previewReset(); renderUnitsPanel(); } }
  else if (b.dataset.action === 'delete-unit') { const u = project.units.find(u => u.id === editId); if (u.role === 'worker' && !u.hero && project.units.filter(u => u.role === 'worker' && !u.hero).length === 1) { toast('需要保留至少一種普通村民。'); return; } project.units = project.units.filter(u => u.id !== editId); editId = project.units[0].id; markDirty(); previewReset(); renderUnitsPanel(); }
  else if (b.dataset.action === 'clear-image') { uploadedImage = ''; draftsDirty = true; unitDrafts.set(editId, readUnitForm()); drawPreview(readUnitForm()); }
});
$('sidebar').addEventListener('input', e => {
  if (e.target.id === 'map-title') { project.map.name = e.target.value || '自製地圖'; markDirty(); updateHud(true); }
  if (e.target.id === 'brush-size') ui.brushSize = Number(e.target.value);
  if (e.target.closest('#unit-form') && e.target.id !== 'unit-image') { if (['hp','attack','armor','range'].includes(e.target.name)) $('unit-form').elements.civilizationUpgrade.checked = false; draftsDirty = true; const draft = readUnitForm(); if (e.target.name === 'color') draft.customColor = true; unitDrafts.set(editId, draft); drawPreview(draft); }
});
$('sidebar').addEventListener('submit', e => { if (e.target.id === 'unit-form') { e.preventDefault(); saveUnit(); } });
$('sidebar').addEventListener('change', async e => {
  if (e.target.id !== 'unit-image') return; const file = e.target.files[0]; if (!file) return;
  try { if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8000000) throw new Error('請選擇 8 MB 以內的 PNG、JPEG 或 WebP。'); const bitmap = await createImageBitmap(file); const c = document.createElement('canvas'); const ratio = Math.min(160 / bitmap.width, 160 / bitmap.height, 1); c.width = Math.max(1, Math.round(bitmap.width * ratio)); c.height = Math.max(1, Math.round(bitmap.height * ratio)); c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height); bitmap.close(); uploadedImage = c.toDataURL('image/png'); draftsDirty = true; unitDrafts.set(editId, readUnitForm()); drawPreview(readUnitForm()); toast('角色圖片已載入，按「套用兵種」完成。'); } catch (err) { toast(err.message); }
});
window.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')||document.querySelector('dialog[open]')) return;
  const k=e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright'].includes(k)) { e.preventDefault(); keys.add(k); return; }
  if (k==='escape') { ui.placement=null; ui.attackMove=false; ui.orderMode=null; ui.buildMenu=false; updateHud(true); return; }
  if (k==='f2') { e.preventDefault(); openTechTree(); return; }
  if (ui.mode==='map'&&k==='z'&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); $('sidebar').querySelector('[data-action="undo"]')?.click(); return; }
  if (ui.mode!=='play') return;
  if (/^[1-9]$/.test(k)) { e.preventDefault(); if (e.ctrlKey) { const ids=ownEntities().map(e=>e.id); ui.groups[k]=e.shiftKey?[...new Set([...(ui.groups[k]||[]),...ids])]:ids; toast(`編隊 ${k}：${ui.groups[k].length} 個單位。`); updateHud(true); } else recallGroup(k,e.shiftKey); return; }
  if (e.ctrlKey) { const type={b:'barracks',a:'archery',l:'stable',k:'siege',v:'castle',y:'monastery',m:'market',s:'blacksmith',u:'university',i:'mill',z:'lumber',g:'mining'}[k]; if (type) { e.preventDefault(); cycleBuilding(type); } return; }
  const own=ownEntities(), workers=own.some(u=>u.blueprint?.role==='worker');
  if (ui.buildMenu&&workers&&CLASSIC_BUILD_KEYS[k]) { e.preventDefault(); const id=CLASSIC_BUILD_KEYS[k], b=BUILDINGS[id]; if ((b.age||0)<=world.age(0)&&world.canPay(0,b.cost)) { ui.buildPage=ECONOMIC_BUILDINGS.has(id)?'economy':'military'; runAction(`build:${id}`); } return; }
  const production=own.length&&own.every(e=>e.kind==='building')?actions.find(a=>a.id.startsWith('train:')&&a.key===k):null;
  if (production) { e.preventDefault(); if (!production.disabled) runAction(production.id,e.shiftKey); return; }
  if (k==='h') { e.preventDefault(); cycleBuilding('town'); }
  else if (k==='.'||k===',') { e.preventDefault(); cycleIdle(k==='.'); }
  else if (k===' '||k==='spacebar') { e.preventDefault(); centerSelection(); }
  else if (k==='home') { e.preventDefault(); centerEvent(); }
  else if (k==='pause'||k==='f3') { e.preventDefault(); if (ui.started) { ui.paused=!ui.paused; updateHud(true); } }
  else if (k==='f11') { e.preventDefault(); $('game-time').hidden=!$('game-time').hidden; }
  else if (k==='f4') { e.preventDefault(); ui.showScore=!ui.showScore; updateScore(); }
  else if (k==='delete') { e.preventDefault(); for (const entity of own) entity.hp=0; ui.selected.clear(); updateHud(true); }
  else if (k==='s') { e.preventDefault(); runAction('stop'); }
  else if ((k==='b'||k==='v')&&workers) { e.preventDefault(); if (!ui.buildMenu) runAction(k==='b'?'build-menu':'military-menu'); }
  else if (['z','x','c'].includes(k)&&own.some(e=>e.kind==='unit')) { e.preventDefault(); runAction({z:'patrol',x:'guard',c:'follow'}[k]); }
  else if (['q','w','e','r'].includes(k)&&own.some(e=>e.kind==='unit')) { e.preventDefault(); runAction(`formation:${{q:'line',w:'box',e:'spread',r:'flank'}[k]}`); }
  else if (['a','d','g','n'].includes(k)&&own.some(e=>e.kind==='unit')) { e.preventDefault(); runAction(`stance:${{a:'aggressive',d:'defensive',g:'stand',n:'passive'}[k]}`); }
});
function updateScore() { let panel=$('score-panel'); if (!panel) { panel=document.createElement('div'); panel.id='score-panel'; panel.className='score-panel'; $('canvas-wrap').append(panel); } panel.hidden=!ui.showScore; if (ui.showScore) panel.innerHTML=Array.from({length:world.teams},(_,i)=>`<div style="color:${['#78b9dc','#e69e8d','#dfcb81'][i]||'#fff'}">${i===0?'我方王國':'AI 王國 '+i+(project.rules.aiAlliance&&world.teams>2?' · 敵方聯盟':'')} <b>${Math.round(world.population(i)*20+world.buildings.filter(b=>b.team===i).length*50+world.researched[i].size*15)}</b></div>`).join(''); }
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); pointerPos = null; if (ui.started) { ui.paused = true; updateHud(true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && ui.started) { ui.paused = true; updateHud(true); } });
new ResizeObserver(() => renderer.resize()).observe($('canvas-wrap'));
function frame(now) {
  const dt = Math.min((now - lastTick) / 1000, .1); lastTick = now; frameTime = now / 1000; fps = fps * .95 + (dt > 0 ? 1 / dt : 60) * .05;
  if (ui.started && !ui.paused && ui.mode === 'play') world.tick(dt * project.rules.speed);
  const step = 450 * dt; if (!document.querySelector('dialog[open]') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
    if (keys.has('arrowleft') || pointerPos && pointerPos.x < 12 && !pointer) renderer.pan.x += step;
    if (keys.has('arrowright') || pointerPos && pointerPos.x > renderer.width - 12 && !pointer) renderer.pan.x -= step;
    if (keys.has('arrowup') || pointerPos && pointerPos.y < 12 && !pointer) renderer.pan.y += step;
    if (keys.has('arrowdown') || pointerPos && pointerPos.y > renderer.height - 12 && !pointer) renderer.pan.y -= step;
  }
  renderer.render(project, world, ui, frameTime);
  if (now - lastHud > 250) { lastHud = now; updateHud(); if (ui.showScore) updateScore(); $('performance').textContent = `${Math.round(fps)} FPS · 人口上限 ${project.rules.population.toLocaleString()} · 單人對戰`; }
  requestAnimationFrame(frame);
}
artReady.then(() => { if ($('unit-form')) drawPreview(readUnitForm()); });
switchMode('map'); updateHud(true); requestAnimationFrame(frame); if (storageError) toast(storageError); else if (world.deploymentErrors?.length) toast(world.deploymentErrors[0]); else if (mapUpgraded) { markDirty(); toast('舊預設地圖的三方出生點已分散；英雄與地景保留。請儲存新版設定。'); }
