import * as THREE from 'three';
import { createFlightState, stepFlight, getFlightData, profileOf, PROFILES, RUNWAY } from './physics.mjs';
import { AIRPORT, apAltitudeLocal, apFloorFt } from './airport.mjs';
import { createAircraft, createCockpit } from './aircraft.js';
import { createLightAircraft, createLightCockpit } from './aircraft.light.js';
import { createWorld } from './world.js';
import { createGeoScenery } from './geoscenery.js';
import { createInstruments } from './instruments.js';
import { nextStep, ilsCue, autoConfig, approachActive, approachBoxes } from './novice.mjs';
import { TOURS, RING, tourById, tourLengthM, createTourState, createTourRun, updateTourRun, nextRingCue, ringNormal, ringHeightM, nearestLandmark, parseTourBest, recordTourBest, formatTime } from './tour.mjs';
import * as challengeMod from './challenge.mjs';
import * as tourMod from './tour.mjs';
import { LEVELS, createLevelState, windAt, grade, bestStars, isUnlocked, recordResult, parseProgress, starText } from './challenge.mjs';

const $ = id => document.getElementById(id);
// WP2 helpers (levelsFor / toursFor); until they exist the jet lists are used for both aircraft.
const levelsFor = id => (challengeMod.levelsFor ? challengeMod.levelsFor(id) : LEVELS);
const toursFor = id => (tourMod.toursFor ? tourMod.toursFor(id) : TOURS);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const KT = 1.943844, FT = 3.28084, BEARING = AIRPORT.runway.bearing, ELEVATION = AIRPORT.runway.elevationM;
// Anisotropic filtering on four large textures is very slow on CPU rasterisers (SwiftShader, llvmpipe); real GPUs get the full 4x.
function softwareRenderer() {
  try {
    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
    return !!info && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
  } catch { return false; }
}
const airportName = () => tr(AIRPORT.city.zh, AIRPORT.city.en);
const compactLayout = matchMedia('(max-height:500px) and (orientation:landscape)');
// Desktop-class devices get the 4096 px imagery; phones and tablets stay at 3072 px to protect GPU memory.
const highRes = matchMedia('(pointer: fine)').matches && (navigator.deviceMemory ?? 8) >= 8;
const heading = v => ((v % 360) + 360) % 360;
const simulator = $('simulator');
const dialogs = [$('flight-dialog'), $('help-dialog'), $('result-dialog')];
let locale = 'zh';
try { locale = localStorage.getItem('lang') === 'en' ? 'en' : 'zh'; } catch {}
const tr = (zh, en) => locale === 'zh' ? zh : en;
let state = createFlightState(), data = getFlightData(state);
let commands = { throttle: 0, flaps: 1, gear: true, trim: .15, spoilers: false };
const profileNow = () => profileOf(state), uiNow = () => profileNow().ui;
let chosenAircraft = 'jet', modelAircraft = null; // chosenAircraft = the start-dialog picker; the flying aircraft is state.aircraft
let active = false, paused = false, panelHidden = false, view = 0, weather = 'clear';
let renderer, scenery, scene, camera, plane, cockpit, world, terrainReady = false;
let sceneTime = 0, lastTime = 0, accumulator = 0, lastUI = 0, toastTimer;
let routeIndex = 0, departed = false, resultShown = false, brakeLatch = false;
let level = null; // landing challenge (challenge.mjs): the active level, and best stars per level (kept per aircraft)
const progressKey = id => id === 'light' ? 'flightChallenge.light' : 'flightChallenge';
const progressBy = { jet: {}, light: {} };
for (const id of Object.keys(progressBy)) { try { progressBy[id] = parseProgress(localStorage.getItem(progressKey(id))); } catch {} }
let tour = null, tourRun = null, tourBest = {}, tourRings = null, tourLoading = false, tourLoadToken = 0, tourSceneryId = null, tourCaptionId = ''; // sightseeing tour (tour.mjs)
try { tourBest = parseTourBest(localStorage.getItem('flightTourBest')); } catch {}
let novice = false, autoMem = {}, notice = {}, ilsLast = null, glowing = '', approachBoxGroup = null; // novice mode (novice.mjs)
let lookYaw = 0, lookPitch = 0, looking = false, lastPointer = { x: 0, y: 0 };
let mouse = { x: 0, y: 0, inside: false }, touch = { x: 0, y: 0, active: false }, touchBrake = false;
let axes = { pitch: 0, roll: 0, yaw: 0 }, lastGamepadButtons = [], gamepadNotice = false;
const held = new Set();
const routeFor = id => [...((id === 'light' && AIRPORT.lightCircuit?.waypoints) || AIRPORT.waypoints), { x: 0, z: RUNWAY.touchdownTarget }];
let route = routeFor('jet');
const instruments = createInstruments($('pfd'), $('nd'));
const cameraPosition = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
const q = new THREE.Quaternion(), lookQ = new THREE.Quaternion();
const audio = { context: null, gain: null, oscillator: null, filter: null, enabled: false };
const brandName = () => tr('天青航空', 'SKYGLAZE');

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
function localize() {
  document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-zh][data-en]').forEach(el => { el.textContent = el.dataset[locale]; });
  $('lang-button').textContent = locale === 'zh' ? 'EN' : '中文';
  updateSceneryText(); renderLevels(); renderTours(); brandText(); updateUI();
}
function setPause(value) {
  paused = value; held.clear(); axes = { pitch: 0, roll: 0, yaw: 0 }; accumulator = 0;
  $('pause-banner').hidden = !active || !paused || dialogs.some(d => d.open);
  $('pause-button').setAttribute('aria-pressed', String(paused));
  $('pause-label').textContent = paused ? tr('繼續', 'Resume') : tr('暫停', 'Pause');
  updateAudio();
}
function showDialog(dialog) {
  dialog.dataset.resume = active && !paused ? 'true' : 'false';
  setPause(true);
  if (!dialog.open) dialog.showModal();
  $('pause-banner').hidden = true;
}
function closeDialog(dialog) {
  const resume = dialog.dataset.resume === 'true';
  dialog.close(); if (resume && !dialogs.some(d => d.open)) setPause(false);
}
function setView(next = (view + 1) % 3) {
  view = next; lookYaw = 0; lookPitch = 0;
  if (plane) plane.group.visible = !active || view !== 0;
  if (cockpit) cockpit.visible = active && view === 0;
  $('view-label').textContent = [tr('座艙', 'Cockpit'), tr('機尾', 'Chase'), tr('機翼', 'Wing')][view];
}
function setPanel(hidden) {
  // On a short landscape screen "hidden" keeps only the throttle, gear, flaps and brake as a small overlay.
  // Novice mode always uses the compact overlay (no instrument panel), so the instrument panel counts as hidden.
  panelHidden = hidden || novice; const compact = panelHidden && (novice || compactLayout.matches);
  $('cockpit-panel').hidden = !active || (panelHidden && !compact);
  $('restore-panel').hidden = !active || !panelHidden || novice;
  simulator.classList.toggle('panel-hidden', panelHidden); simulator.classList.toggle('panel-compact', compact);
  if (renderer) resizeView();
}
function resizeView() {
  const height = Math.max(160, innerHeight - (active && !panelHidden ? $('cockpit-panel').offsetHeight : 0));
  $('flight-view').style.bottom = `${innerHeight - height}px`;
  renderer.setSize(innerWidth, height); camera.aspect = innerWidth / height; camera.updateProjectionMatrix();
}
function configureQuality() {
  const quality = $('quality').value;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 1.8 : quality === 'low' ? 1 : 1.4));
  renderer.shadowMap.enabled = quality === 'high';
  resizeView();
}
// ---- Landing challenge (logic lives in challenge.mjs) ----
function saveProgress(id) { try { localStorage.setItem(progressKey(id), JSON.stringify(progressBy[id])); } catch {} }
const levelOf = (id, aircraft) => levelsFor(aircraft).find(l => l.id === Number(id)) || null;
function renderLevels() {
  const list = $('level-list'), keep = document.querySelector('input[name=level]:checked')?.value;
  list.textContent = '';
  const progress = progressBy[chosenAircraft], levels = levelsFor(chosenAircraft);
  const first = levels.find(l => isUnlocked(progress, l.id) && !bestStars(progress, l.id)) || levels.find(l => isUnlocked(progress, l.id));
  for (const l of levels) {
    const open = isUnlocked(progress, l.id), card = document.createElement('label'), input = document.createElement('input');
    card.className = `level-card${open ? '' : ' locked'}`; input.type = 'radio'; input.name = 'level'; input.value = l.id; input.disabled = !open;
    input.checked = keep ? String(l.id) === keep && open : l === first;
    const text = document.createElement('span'), name = document.createElement('strong'), desc = document.createElement('small'), no = document.createElement('b'), stars = document.createElement('span');
    text.className = 'level-text'; name.textContent = tr(l.zh, l.en); desc.textContent = tr(l.descZh, l.descEn); text.append(name, desc);
    no.className = 'level-no'; no.textContent = l.id; stars.className = 'level-stars';
    stars.textContent = open ? starText(bestStars(progress, l.id)) : tr('🔒 鎖定', '🔒 Locked'); stars.title = open ? tr('最佳星數', 'Best stars') : tr(`先在第 ${l.id - 1} 關拿到 1 顆星`, `Earn 1 star on level ${l.id - 1} first`);
    card.append(input, no, text, stars); list.append(card);
  }
}
// ---- Sightseeing tours (logic lives in tour.mjs) ----
function saveTourBest() { try { localStorage.setItem('flightTourBest', JSON.stringify(tourBest)); } catch {} }
function renderTours() {
  const list = $('tour-list'), keep = document.querySelector('input[name=tour]:checked')?.value;
  list.textContent = '';
  const tours = toursFor(chosenAircraft), kept = tours.some(t => t.id === keep) ? keep : null; // a selection from the other aircraft's list does not carry over
  for (const t of tours) {
    const card = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span'), name = document.createElement('strong'), desc = document.createElement('small'), meta = document.createElement('small'), no = document.createElement('b'), best = document.createElement('span');
    card.className = 'level-card'; input.type = 'radio'; input.name = 'tour'; input.value = t.id; input.checked = kept ? kept === t.id : t === tours[0];
    text.className = 'level-text'; name.textContent = tr(t.zh, t.en); desc.textContent = tr(t.descZh, t.descEn);
    const km = tourLengthM(t) / 1000, minutes = Math.round(km * 1000 / (PROFILES[t.aircraft || chosenAircraft].tour.startKt / KT) / 60);
    meta.textContent = tr(`全長約 ${Math.round(km)} 公里，約 ${minutes} 分鐘。晴天，${t.id === 'alps' || t.id === 'valley' ? '空氣穩定的早晨最適合' : '能見度好的日子最適合'}。`, `About ${Math.round(km)} km, around ${minutes} min. Clear weather${t.id === 'alps' || t.id === 'valley' ? ': best on a calm morning.' : ': best on a day of good visibility.'}`);
    text.append(name, desc, meta);
    no.className = 'level-no'; no.textContent = String(tours.indexOf(t) + 1).padStart(2, '0'); best.className = 'level-stars';
    best.textContent = tourBest[t.id] ? `${tr('最佳', 'Best')} ${formatTime(tourBest[t.id])}` : tr('尚無紀錄', 'No time yet');
    card.append(input, no, text, best); list.append(card);
  }
}
function updateScenarioUI() {
  const value = document.querySelector('input[name=scenario]:checked').value, challenge = value === 'challenge', touring = value === 'tour';
  $('challenge-picker').hidden = !challenge; $('tour-picker').hidden = !touring; $('weather').disabled = challenge || touring; // the level sets the weather; tours are clear weather
  $('weather').title = challenge ? tr('降落挑戰的天候由關卡決定。', 'Landing challenge levels set their own weather.') : touring ? tr('觀光航線一律晴天。', 'Sightseeing tours are always clear weather.') : '';
}
// Rings: unlit tori across the sky, perpendicular to the incoming leg. The next one is bright, the following two dim, passed ones are hidden.
const RING_LOOK = [[0xffb020, 1, .12], [0xffd27a, .45, 0], [0xffd27a, .22, 0]];
function createTourRings(def) {
  const group = new THREE.Group(), torus = new THREE.TorusGeometry(RING.radius, RING.tube, 10, 56), disc = new THREE.CircleGeometry(RING.radius, 40), z = new THREE.Vector3(0, 0, 1);
  group.visible = false;
  def.rings.forEach((r, i) => {
    const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
    const holder = new THREE.Group(), n = ringNormal(def, i), band = new THREE.Mesh(torus, flat(0xffb020, 1)), fill = new THREE.Mesh(disc, flat(0xffb020, .12));
    band.renderOrder = fill.renderOrder = 6; band.frustumCulled = fill.frustumCulled = false; holder.add(band, fill);
    holder.position.set(r.x, ringHeightM(r), r.z); holder.quaternion.setFromUnitVectors(z, new THREE.Vector3(n.x, n.y, n.z));
    holder.userData = { band, fill }; group.add(holder);
  });
  scene.add(group); return group;
}
function disposeTourRings() {
  if (!tourRings) return;
  scene.remove(tourRings); const geos = new Set(); tourRings.traverse(o => { if (o.isMesh) { geos.add(o.geometry); o.material.dispose(); } }); geos.forEach(g => g.dispose()); tourRings = null;
}
function updateTourRings() {
  if (!tourRings) return;
  const show = !!tourRun && active && !tourRun.done; tourRings.visible = show; if (!show) return;
  tourRings.children.forEach((holder, i) => {
    const k = i - tourRun.next, look = RING_LOOK[k]; holder.visible = !!look; if (!look) return;
    const { band, fill } = holder.userData, d = holder.position.distanceTo(camera.position);
    band.material.color.setHex(look[0]); band.material.opacity = look[1]; fill.material.opacity = look[2]; fill.visible = look[2] > 0;
    holder.scale.setScalar(clamp(d / 3500, 1, 3)); // visual only: far rings are drawn larger so they can be seen from far away; the hit radius never changes
  });
}
// High-resolution scenery for the tour (geoscenery.js, optional): the sim waits while it loads; a failure or a 20 s timeout starts the tour on the base scenery.
function applyTourScenery(id) {
  if (typeof scenery?.setTour !== 'function' || id === tourSceneryId) return;
  const token = ++tourLoadToken; tourSceneryId = id;
  if (!id) { tourLoading = false; $('tour-loading').hidden = true; try { scenery.setTour(null); } catch (error) { console.warn(error); } return; }
  tourLoading = true; $('tour-loading').hidden = false;
  const timeout = new Promise(resolve => setTimeout(resolve, 20000));
  Promise.race([Promise.resolve().then(() => scenery.setTour(id)), timeout]).catch(error => console.warn('tour scenery', error)).finally(() => { if (token === tourLoadToken) { tourLoading = false; $('tour-loading').hidden = true; } });
}
function updateTour() {
  if (!tour || !tourRun || resultShown) return;
  for (const e of updateTourRun(tourRun, state.position)) toast(e.type === 'hit' ? `✓ ${tr('通過', 'Ring')} ${e.index + 1} / ${tour.rings.length}` : `✗ ${tr(`錯過第 ${e.index + 1} 圈`, `Missed ring ${e.index + 1}`)}`);
  if (tourRun.done) showResult();
}
function continueFlying() { // after the tour: free flight where you are; the normal approach logic takes over again
  $('result-dialog').close(); disposeTourRings(); delete state.tour; tour = null; tourRun = null; resultShown = false; $('tour-caption').hidden = true; $('tour-hud').hidden = true;
  setPause(false); updateUI();
}
function startFlight() {
  let scenario = document.querySelector('input[name=scenario]:checked').value;
  const chosenTour = scenario === 'tour' ? tourById(document.querySelector('input[name=tour]:checked')?.value) : null;
  if (scenario === 'tour' && !chosenTour) { toast(tr('先選一條航線。', 'Pick a route first.')); return; }
  const chosen = scenario === 'challenge' ? levelOf(document.querySelector('input[name=level]:checked')?.value, chosenAircraft) : null;
  if (scenario === 'challenge' && (!chosen || !isUnlocked(progressBy[chosenAircraft], chosen.id))) { toast(tr('先選一個已解鎖的關卡。', 'Pick an unlocked level first.')); return; }
  dialogs.forEach(d => { if (d.open) d.close(); });
  level = chosen; if (level) scenario = 'approach'; // a level is an approach that starts airborne
  tour = chosenTour; tourRun = tour ? createTourRun(tour) : null; if (tour) scenario = 'cruise'; // a tour is free flight that starts airborne, trimmed, over its first leg
  disposeTourRings(); if (tour) tourRings = createTourRings(tour); tourCaptionId = ''; $('tour-caption').hidden = true; $('tour-hud').hidden = !tour;
  state = tour ? createTourState(tour) : level ? createLevelState(level) : createFlightState(scenario, chosenAircraft); data = getFlightData(state);
  applyAircraft(state.aircraft || 'jet'); // the 3D model, gauges, route and AP ranges follow the aircraft actually flying
  commands = { throttle: state.throttle, flaps: state.flaps, gear: state.gear, trim: state.trim, spoilers: false };
  weather = tour ? 'clear' : level ? level.weather : $('weather').value; brakeLatch = false; touchBrake = false;
  active = true; departed = scenario !== 'runway'; resultShown = false; routeIndex = scenario === 'runway' ? 0 : route.length - 1;
  novice = document.querySelector('input[name=mode]:checked').value === 'novice'; autoMem = {}; notice = {}; ilsLast = null; setGlow(null);
  simulator.classList.toggle('novice', novice); simulator.classList.toggle('coarse', coarsePointer);
  for (const id of ['novice-hint', 'novice-strip']) $(id).hidden = !novice;
  setPause(false); setView(0); setPanel(novice || compactLayout.matches && coarsePointer); configureQuality();
  $('mission-panel').hidden = false; $('control-cue').hidden = false;
  $('touch-controls').hidden = !matchMedia('(pointer: coarse)').matches;
  $('throttle').value = Math.round(commands.throttle * 100);
  const apSpeed = uiNow().apSpeed; // the default keeps the turn radius inside the circuit legs
  $('ap-speed').value = scenario === 'runway' ? apSpeed.def : clamp(Math.round(state.autopilot.speed * KT), apSpeed.min, apSpeed.max);
  $('ap-altitude').value = scenario === 'runway' ? profileNow().novice.circuitAltFt : Math.round((state.autopilot.altitude + ELEVATION) * FT / 100) * 100;
  $('ap-heading').value = tour ? Math.round(heading(data.heading + BEARING)) % 360 : Math.round(BEARING);
  toast(tour ? tr('飛過發亮的圈，越快飛完越好。↓ 拉起、↑ 壓低機頭。', 'Fly through the glowing rings, as fast as you can. ↓ pitches up, ↑ down.') : tr('↓ 拉起、↑ 壓低機頭。短按操縱，放開會回中。', '↓ pitches up, ↑ down. Use short inputs; release to center.'));
  applyTourScenery(tour ? tour.scenery : null);
  updateUI(); updateCamera(1);
}
const startLabel = $('start-button').firstElementChild, startText = { zh: startLabel.dataset.zh, en: startLabel.dataset.en };
let sceneryState = null;
// ---- Aircraft choice: everything aircraft-specific reads the profile (profiles.mjs ui section); this swaps what is shown ----
function setModel(id) {
  if (modelAircraft === id) return;
  if (plane) { scene.remove(plane.group); plane.dispose?.(); }
  if (cockpit) { camera.remove(cockpit); cockpit.dispose?.(); }
  plane = id === 'light' ? createLightAircraft(THREE) : createAircraft(THREE); scene.add(plane.group);
  cockpit = id === 'light' ? createLightCockpit(THREE) : createCockpit(THREE, { headingOffset: BEARING, altitudeOffset: ELEVATION, runwayIdent: AIRPORT.runway.ident }); camera.add(cockpit);
  plane.group.visible = !active || view !== 0; cockpit.visible = active && view === 0; modelAircraft = id;
}
function rebuildApproachBoxes(id) {
  if (approachBoxGroup) {
    scene.remove(approachBoxGroup); const geos = new Set();
    approachBoxGroup.traverse(o => { if (o.isMesh) { geos.add(o.geometry); o.material.dispose(); } }); geos.forEach(g => g.dispose());
  }
  approachBoxGroup = createApproachBoxes(id);
}
function brandText() {
  const ui = PROFILES[modelAircraft || 'jet'].ui;
  $('footer-airport').textContent = `${brandName()} · ${AIRPORT.icao} ${AIRPORT.runway.ident}`;
  $('brand-model').textContent = ui.label + (ui.flightLabel !== ui.label ? ` · ${ui.flightLabel}` : '');
}
function applyAircraft(id) {
  const P = PROFILES[id] || PROFILES.jet, ui = P.ui, light = id === 'light';
  if (id !== modelAircraft && renderer) { setModel(id); route = routeFor(id); rebuildApproachBoxes(id); }
  simulator.dataset.aircraft = id;
  document.querySelectorAll('.jet-only').forEach(el => { el.hidden = light; });
  document.querySelectorAll('.light-only').forEach(el => { el.hidden = !light; });
  const rpm = ui.engineGauge === 'rpm';
  $('engine-type').textContent = rpm ? '1 × PISTON' : 'TWINJET'; $('engine-caption').textContent = rpm ? 'RPM' : 'N1 %';
  $('fuel-unit').textContent = ui.fuelUnit.toUpperCase();
  $('ap-speed').min = ui.apSpeed.min; $('ap-speed').max = ui.apSpeed.max;
  if (!active) { $('ap-speed').value = ui.apSpeed.def; $('ap-altitude').value = P.novice.circuitAltFt; }
  brandText();
}
function chooseAircraft(id) {
  chosenAircraft = id === 'light' ? 'light' : 'jet';
  try { localStorage.setItem('flightAircraft', chosenAircraft); } catch {}
  if (!active) { state = createFlightState('runway', chosenAircraft); data = getFlightData(state); commands = { throttle: 0, flaps: state.flaps, gear: state.gear, trim: state.trim, spoilers: false }; applyAircraft(chosenAircraft); updateCamera(1); }
  renderLevels(); renderTours(); updateUI();
}
function updateSceneryText() {
  const status = sceneryState; if (!status) return;
  startLabel.dataset.zh = terrainReady ? startText.zh : '載入地形中…'; startLabel.dataset.en = terrainReady ? startText.en : 'Loading terrain…';
  startLabel.textContent = startLabel.dataset[locale];
  $('scenery-status').textContent = status.outsideCoverage ? tr(`已離開地景範圍 · 請返回${airportName()}`, `Outside scenery coverage · return to ${airportName()}`)
    : status.phase === 'ready' ? tr('空照影像 · 真實地形', 'Aerial imagery · real terrain')
    : status.phase === 'fallback' ? tr('地景檔案無法載入 · 使用平地', 'Scenery files unavailable · flat ground')
    : status.phase === 'imagery' ? `${tr('載入影像', 'Loading imagery')} ${status.layers} / ${status.totalLayers}` : tr('載入地形…', 'Loading terrain…');
  $('scenery-status').dataset.ready = String(status.phase === 'ready');
}
function onSceneryStatus(status) {
  sceneryState = status; world.setGeographic(status.terrain);
  // Takeoff is only possible once the elevation grid has loaded (or failed), so the first rollout never sees a late terrain.
  terrainReady = status.terrainSettled; $('start-button').disabled = !terrainReady; updateSceneryText();
}
function toggleAP() {
  if (!active || dialogs.some(d => d.open)) return;
  if (state.onGround || data.agl < 30) { toast(tr('離地 100 呎後可接通自動駕駛。', 'Autopilot is available above 100 ft.')); return; }
  if (novice && !state.autopilot.enabled) { // the AP settings are hidden in novice mode: hold what the aircraft is doing now
    $('ap-speed').value = clamp(Math.round(data.indicatedAirspeed * KT / 5) * 5, uiNow().apSpeed.min, uiNow().apSpeed.max); $('ap-heading').value = Math.round(heading(data.heading + BEARING)) % 360;
    $('ap-altitude').value = Math.max(apFloorFt(), Math.round((data.altitude + ELEVATION) * FT / 100) * 100);
  }
  state.autopilot.enabled = !state.autopilot.enabled;
  if (!state.autopilot.enabled) commands.throttle = state.throttle;
  toast(state.autopilot.enabled && novice ? tr('自動駕駛：保持現在的速度、方向和高度。', 'Autopilot holds your current speed, heading and altitude.') : state.autopilot.enabled ? tr('自動駕駛：保持選定空速、航向與高度。', 'Autopilot holds selected speed, heading and altitude.') : tr('自動駕駛解除。', 'Autopilot disconnected.'));
  updateUI();
}
function gear() {
  if (profileNow().fixedGear) { toast(tr('雲雀是固定式起落架，不用收放。', 'The Lark has fixed landing gear; nothing to retract.')); return; }
  if (state.onGround && commands.gear) { toast(tr('機輪接地時，起落架保持放下。', 'Landing gear stays down while on the ground.')); return; }
  commands.gear = !commands.gear; updateUI();
}
function flaps(retract = false) { commands.flaps = clamp(commands.flaps + (retract ? -1 : 1), 0, 3); updateUI(); }
function spoilers() {
  if (!profileNow().hasSpoilers) { toast(tr('雲雀沒有擾流板。', 'The Lark has no spoilers.')); return; }
  commands.spoilers = !commands.spoilers; updateUI();
}
function inputFrame(dt) {
  let pitch = Number(held.has('ArrowDown')) - Number(held.has('ArrowUp'));
  let roll = Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'));
  let yaw = Number(held.has('KeyE')) - Number(held.has('KeyQ'));
  let brake = held.has('Space') || brakeLatch || touchBrake ? 1 : 0;
  let thrust = Number(held.has('KeyW') || held.has('Equal')) - Number(held.has('KeyS') || held.has('Minus'));
  const mode = $('control-mode').value;
  if (mode === 'mouse' && mouse.inside && !looking) { pitch += mouse.y * .65; roll += mouse.x * .7; }
  if (touch.active) { pitch += touch.y * .65; roll += touch.x * .7; }
  if (mode === 'gamepad') {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (pad) {
      const deadzone = v => Math.abs(v || 0) < .12 ? 0 : (v - Math.sign(v) * .12) / .88;
      pitch += deadzone(pad.axes[1]); roll += deadzone(pad.axes[0]);
      lookYaw = clamp(lookYaw - deadzone(pad.axes[2]) * dt, -1.4, 1.4);
      lookPitch = clamp(lookPitch - deadzone(pad.axes[3]) * dt, -.7, .7);
      thrust += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
      brake = Math.max(brake, pad.buttons[2]?.value || 0);
      [[0, () => { commands.flaps = (commands.flaps + 1) % 4; updateUI(); }], [1, gear], [3, () => setView()]].forEach(([index, action]) => {
        if (pad.buttons[index]?.pressed && !lastGamepadButtons[index]) action();
      });
      lastGamepadButtons = pad.buttons.map(b => b.pressed); gamepadNotice = false;
    } else if (!gamepadNotice) {
      toast(tr('按手把任一按鈕以連接；鍵盤仍可操縱。', 'Press a gamepad button to connect. Keyboard controls remain available.')); gamepadNotice = true;
    }
  }
  commands.throttle = clamp(commands.throttle + thrust * dt * .28, 0, 1);
  commands.trim = clamp(commands.trim + (Number(held.has('Home')) - Number(held.has('End'))) * dt * .1, -1, 1);
  const blend = 1 - Math.exp(-dt * 7);
  axes.pitch += (clamp(pitch, -1, 1) - axes.pitch) * blend;
  axes.roll += (clamp(roll, -1, 1) - axes.roll) * blend;
  axes.yaw += (clamp(yaw, -1, 1) - axes.yaw) * blend;
  if (state.autopilot.enabled && Math.max(Math.abs(pitch), Math.abs(roll), Math.abs(yaw)) > .2) {
    state.autopilot.enabled = false; commands.throttle = state.throttle;
    toast(tr('手動操縱，自動駕駛解除。', 'Manual input: autopilot disconnected.'));
  }
  return { ...commands, ...axes, brake, autopilot: {
    enabled: state.autopilot.enabled,
    heading: heading((Number($('ap-heading').value) || 0) - BEARING),
    speed: clamp(Number($('ap-speed').value) || uiNow().apSpeed.def, uiNow().apSpeed.min, uiNow().apSpeed.max) / KT,
    altitude: apAltitudeLocal(Number($('ap-altitude').value) || profileNow().novice.circuitAltFt),
  } };
}
function updateCamera(dt) {
  const debugCamera = window.__flight && window.__flightCamera; // browser tests only (?debug)
  if (debugCamera) {
    camera.position.set(debugCamera.x, debugCamera.y, debugCamera.z); camera.up.set(debugCamera.upx || 0, debugCamera.upy ?? 1, debugCamera.upz || 0);
    camera.lookAt(debugCamera.tx, debugCamera.ty, debugCamera.tz); if (debugCamera.fov) { camera.fov = debugCamera.fov; camera.updateProjectionMatrix(); }
    if (cockpit) cockpit.visible = false; if (plane) plane.group.visible = !!debugCamera.plane; return;
  }
  const cam = uiNow().cameras;
  q.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
  plane.group.position.set(state.position.x, state.position.y, state.position.z); plane.group.quaternion.copy(q);
  if (active && view === 0) {
    camera.position.copy(new THREE.Vector3(...cam.cockpit).applyQuaternion(q)).add(plane.group.position);
    lookQ.setFromEuler(new THREE.Euler(lookPitch, lookYaw, 0, 'YXZ')); camera.quaternion.copy(q).multiply(lookQ);
  } else if (active && view === 2) {
    cameraPosition.set(...cam.wing.pos).applyQuaternion(q).add(plane.group.position);
    camera.position.copy(cameraPosition); cameraTarget.set(...cam.wing.look).applyQuaternion(q).add(plane.group.position);
    camera.lookAt(cameraTarget);
  } else {
    const h = data.heading * Math.PI / 180;
    const ch = cam.chase;
    cameraPosition.set(active ? Math.sin(h) * -ch.back + Math.cos(h) * ch.side : cam.attract[0], active ? ch.up : cam.attract[1], active ? Math.cos(h) * ch.back + Math.sin(h) * ch.side : cam.attract[2]).add(plane.group.position);
    camera.position.lerp(cameraPosition, active ? 1 - Math.exp(-dt * 4) : .08);
    cameraTarget.copy(plane.group.position); cameraTarget.y += active ? ch.lookAhead : 1;
    camera.lookAt(cameraTarget);
  }
}
function tourStep() { // the same line novice mode shows as its hint (nextStep with a tour branch), also used in the mission card
  const cue = nextRingCue(tourRun, state, data);
  return { cue, step: cue ? nextStep(state, data, commands, { touch: coarsePointer, tour: { diff: cue.diff, altFt: cue.altFt }, notice: {} }) : null };
}
function mission() {
  const speed = data.indicatedAirspeed * KT;
  if (tour && tourRun) {
    const n = tour.rings.length, done = tourRun.hits + tourRun.misses, { cue, step } = tourStep();
    if (!cue) return [tr('航線完成', 'Tour complete'), tr('每個圈都飛過了。', 'All rings flown.'), n, 1];
    const km = (cue.distanceM / 1000).toFixed(1);
    return [tr(`下一個圈 ${cue.index + 1} / ${n}`, `Next ring ${cue.index + 1} / ${n}`), `${tr(step.zh, step.en)}${tr('　· 還有', ' · ')} ${km} ${tr('公里', 'km')}`, cue.index + 1, done / n];
  }
  const P = profileNow(), light = P.id === 'light', rotate = Math.round(P.rotateSpeed * KT);
  if (state.scenario === 'runway' && !departed) {
    if (!state.onGround && data.agl > 120) departed = true;
    if (state.onGround && speed < 20) return [tr('準備起飛', 'Ready for departure'), light
      ? tr('襟翼 1（10°），油門推至 100%。↑ 壓低、↓ 拉起。起飛與進場都用 14 跑道，是簡化設定；雲雀滑跑約 300 米就能離地。', 'Flaps 1 (10°). Power 100%. ↑ nose down, ↓ nose up. Takeoff and landing both use runway 14, a simplification; the Lark lifts off in about 300 m.')
      : tr('襟翼 1，油門推至 100%。↑ 壓低、↓ 拉起。起飛與進場都用 14 跑道，是簡化設定；實際多用 28 或 16 起飛。', 'Flaps 1. Thrust 100%. ↑ nose down, ↓ nose up. Takeoff and landing both use runway 14, a simplification; real departures mostly use 28 or 16.'), 1, .1];
    if (state.onGround && speed < P.rotateSpeed * KT) return [tr('起飛滑跑', 'Takeoff roll'), tr(`保持跑道中線；空速 ${rotate} 節開始短按 ↓ 抬頭。`, `Hold the centerline. At ${rotate} kt, briefly press ↓ to rotate.`), 2, .27];
    return [tr('建立爬升', 'Establish the climb'), light
      ? tr('機頭朝東南，遠方是阿爾卑斯山。空速保持約 75 節爬升，每分鐘約 600 呎。離地 300 呎以上、空速到 70 節後收襟翼，再按 A 接自動駕駛。', 'Nose toward the southeast, with the Alps ahead. Climb at about 75 kt, roughly 600 ft/min. Above 300 ft and 70 kt, retract the flaps, then press A for autopilot.')
      : tr('機頭朝東南，遠方是阿爾卑斯山。保持約 10° 仰角，正爬升後收起落架，180 節前開始收襟翼，再按 A 接自動駕駛。', 'Nose toward the southeast, with the Alps ahead. Hold about 10° pitch, retract gear in a positive climb, start retracting flaps before 180 kt, then press A for autopilot.'), 3, .45];
  }
  if (state.touchdown && state.onGround) return [tr('落地滑跑', 'Landing roll'), light
    ? tr('油門收至 0%，按住空白鍵煞車到停穩。', 'Idle power. Hold Space to brake to a stop.')
    : tr('油門收至 0%，B 展開擾流板，按住空白鍵煞車。', 'Idle thrust, B deploys spoilers. Hold Space to brake to a stop.'), 4, .95];
  const aligned = data.agl < 800 && data.distanceToThreshold > -300 && data.distanceToThreshold < 13000 && Math.abs(state.position.x) < 1500 && Math.min(data.heading, 360 - data.heading) < 35;
  if (state.scenario === 'approach' || aligned && (state.scenario !== 'runway' || routeIndex >= 3)) {
    if (data.agl < P.novice.flareAglM) return [tr('拉平與接地', 'Flare and touchdown'), light
      ? tr('離地約 20 呎輕拉拉平，油門收到怠速，主輪輕輕接地，勿長按拉起。', 'At about 20 ft, ease the nose up to flare, close the power to idle and touch down gently. Avoid sustained pull.')
      : tr('約 40 呎開始輕拉，保持 4–6° 仰角，油門收回，勿長按拉起。', 'At about 40 ft, gently flare to 4–6° pitch and idle thrust. Avoid sustained pull.'), 4, .86];
    return [tr('穩定進場', 'Stabilized approach'), light
      ? tr('約 65 節、襟翼 3（30°），固定式起落架不用操作。保持 ILS 14 菱形置中，沿西北方的下滑道降到跑道。', 'About 65 kt, flaps 3 (30°); the gear is fixed. Keep the ILS 14 diamonds centered and follow the glidepath in from the northwest.')
      : tr('約 145 節、襟翼 3、起落架 DOWN。保持 ILS 14 菱形置中，沿西北方的下滑道降到跑道。', 'About 145 kt, flaps 3, gear DOWN. Keep the ILS 14 diamonds centered and follow the glidepath in from the northwest.'), 4, .7];
  }
  if (state.scenario === 'runway') {
    const point = route[routeIndex];
    if (point && Math.hypot(point.x - state.position.x, point.z - state.position.z) < (light ? 900 : 1300) && routeIndex < route.length - 1) routeIndex++;
    return [tr('機場航線', 'Airport circuit'), light
      ? tr('依導航顯示左轉繞場，保持約 2,900 呎（海拔）。右手邊是蘇黎世市區；轉進五邊前降到約 2,300 呎，空速收到 65 節左右。', 'Follow the route in a left-hand circuit at about 2,900 ft MSL. Zurich city is on your right. Descend to about 2,300 ft and slow to about 65 kt before turning onto final.')
      : tr('依導航顯示左轉繞場，保持約 4,500 呎（海拔）。右手邊是蘇黎世市區；轉進五邊前降到約 3,000 呎。', 'Follow the route in a left-hand circuit at about 4,500 ft MSL. Zurich city is on your right. Descend to about 3,000 ft before turning onto final.'), 3, .55 + routeIndex * .06];
  }
  return [tr('自由巡航', 'Free flight'), light
    ? tr('探索蘇黎世機場、湖泊與山谷。雲雀飛得慢，可以貼著山谷看；用 AP 保持空速、航向與高度，或從西北方飛回 14 跑道落地。', 'Explore Zurich airport, the lakes and the valleys. The Lark is slow enough to follow a valley floor. Use AP to hold speed, heading and altitude, or return to runway 14 from the northwest.')
    : tr('探索蘇黎世機場、湖泊與阿爾卑斯山。可用 AP 保持空速、航向與高度，或從西北方飛回 14 跑道落地。', 'Explore Zurich airport, the lakes and the Alps. Use AP to hold speed, heading and altitude, or return to runway 14 from the northwest.'), 3, .5];
}
function updateUI() {
  if (!data) return;
  const [stage, instruction, number, missionProgress] = mission(), P = profileNow(), ui = P.ui;
  // In a challenge the card names the level and its goal; the flare and landing-roll instructions still take over near the ground.
  const landing = level && (state.touchdown || data.agl < 25);
  const touring = !!(tour && tourRun);
  $('mission-eyebrow').textContent = touring ? `${tr('觀光航線', 'SIGHTSEEING TOUR')} · ${tr(tour.tagZh, tour.tagEn.toUpperCase())}` : level ? `${tr('降落挑戰', 'LANDING CHALLENGE')} · ${tr(`第 ${level.id} 關`, `LEVEL ${level.id}`)}` : `${AIRPORT.city.en.toUpperCase()} · ${AIRPORT.icao} · RWY ${AIRPORT.runway.ident}`;
  $('mission-stage').textContent = level && !landing ? tr(level.zh, level.en) : stage; $('mission-instruction').textContent = level && !landing ? tr(level.descZh, level.descEn) : instruction;
  $('mission-number').textContent = touring ? formatTime(state.elapsed) : `0${number} / 04`; $('mission-progress').style.width = `${missionProgress * 100}%`;
  const wind = Math.round(data.windSpeed * KT), gust = level?.wind.gust ? ` G${Math.round(level.wind.cross + level.wind.gust)}` : ''; // peak of the gust cycle, METAR style (G23)
  $('wind-label').textContent = touring ? `${tr('圈', 'RINGS')} ${tourRun.hits} / ${tour.rings.length}${tourRun.misses ? ` · ${tr('錯過', 'MISSED')} ${tourRun.misses}` : ''}` : wind ? `${tr('風', 'WIND')} ${Math.round(heading(data.windDirection + BEARING))}° · ${wind}${gust} KT` : tr('無風 · 0 KT', 'CALM · 0 KT');
  $('distance-label').textContent = touring ? `${tr('最佳', 'BEST')} ${tourBest[tour.id] ? formatTime(tourBest[tour.id]) : '—'}` : data.onGround ? `RWY ${Math.round(data.runwayRemaining).toLocaleString()} M` : `${Math.max(0, data.distanceToThreshold / 1852).toFixed(1)} NM · ${AIRPORT.runway.ident}`;
  $('control-label').textContent = touch.active || coarsePointer && $('control-mode').value === 'keyboard' ? tr('觸控操縱', 'Touch control') : { keyboard: tr('鍵盤操縱', 'Keyboard'), mouse: tr('滑鼠操縱', 'Mouse'), gamepad: tr('手把操縱', 'Gamepad') }[$('control-mode').value];
  $('control-values').textContent = `PITCH ${Math.round(axes.pitch * 100)} · ROLL ${Math.round(axes.roll * 100)}`;
  $('ap-button').setAttribute('aria-pressed', String(state.autopilot.enabled));
  $('ap-status').textContent = state.autopilot.enabled ? 'SPD · HDG · ALT' : 'MANUAL FLIGHT';
  $('fma-label').textContent = state.autopilot.enabled ? 'AP · ALT / HDG' : data.onGround ? 'GROUND' : 'MANUAL';
  if (ui.engineGauge === 'rpm') { // one piston engine: RPM on the first dial, scale 0 to the redline
    $('n1-value-left').textContent = Math.round(data.engineRpm || 0).toLocaleString('en-US'); $('n1-left').style.transform = `rotate(${-65 + clamp((data.engineRpm || 0) / ui.rpm.max, 0, 1) * 130}deg)`;
  } else {
    const n1 = data.engineN1.toFixed(1);
    for (const side of ['left', 'right']) { $(`n1-value-${side}`).textContent = n1; $(`n1-${side}`).style.transform = `rotate(${-65 + data.engineN1 * 1.3}deg)`; }
  }
  $('fuel-value').textContent = Math.round(data.fuel).toLocaleString(); $('g-value').textContent = data.gLoad.toFixed(2);
  $('trim-value').textContent = `${commands.trim >= 0 ? '+' : ''}${commands.trim.toFixed(2)}`;
  const throttle = Math.round((state.autopilot.enabled ? state.throttle : commands.throttle) * 100);
  $('throttle-value').textContent = `${throttle}%`;
  if (document.activeElement !== $('throttle')) $('throttle').value = throttle;
  $('gear-button').setAttribute('aria-pressed', String(commands.gear));
  $('gear-value').textContent = Math.abs(data.gearPosition - Number(commands.gear)) > .03 ? 'TRANSIT' : commands.gear ? 'DOWN' : 'UP';
  $('flaps-value').textContent = ui.flapLabels[commands.flaps] ?? String(commands.flaps);
  $('spoilers-value').textContent = commands.spoilers ? 'EXT' : 'RET'; $('spoilers-button').setAttribute('aria-pressed', String(commands.spoilers));
  $('brake-value').textContent = state.brake > .1 || brakeLatch ? 'ON' : 'OFF';
  $('brake-button').setAttribute('aria-pressed', String(state.brake > .1 || brakeLatch));
  $('flight-phase').textContent = stage; $('flight-clock').textContent = `${String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`;
  let warning = '', critical = false;
  const warn = ui.warnings;
  if (data.stallWarning) { warning = 'STALL · LOWER NOSE'; critical = true; }
  else if (data.overspeedWarning) warning = warn.overspeedText;
  else if (data.gearWarning) warning = 'LANDING GEAR';
  else if (!state.onGround && data.agl < warn.sinkAgl && data.verticalSpeed < warn.sinkVs) { warning = 'SINK RATE'; critical = true; }
  else if (!state.onGround && data.agl < warn.bankAgl && Math.abs(data.roll) > warn.bankDeg) warning = 'BANK ANGLE';
  $('annunciation').hidden = !active || !warning || resultShown; $('annunciation').textContent = warning;
  $('annunciation').classList.toggle('critical', critical); $('engine-note').textContent = warning || 'NORMAL';
  $('pause-label').textContent = paused ? tr('繼續', 'Resume') : tr('暫停', 'Pause');
  $('sound-label').textContent = audio.enabled ? tr('聲音開', 'Sound on') : tr('靜音', 'Muted');
  $('view-label').textContent = [tr('座艙', 'Cockpit'), tr('機尾', 'Chase'), tr('機翼', 'Wing')][view];
  if (simulator.classList.contains('panel-compact')) {
    const signed = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
    // LOC: + means right of the course; GS: + means above the glidepath.
    const ils = data.ilsValid ? ` · LOC ${signed(data.localizerDeviation)}°${data.gsValid ? ` GS ${signed(data.glideslopeDeviation)}°` : ''}` : '';
    $('compact-readout').textContent = `IAS ${Math.round(data.indicatedAirspeed * KT)} · ALT ${Math.round((data.altitude + ELEVATION) * FT).toLocaleString()} · V/S ${Math.round(data.verticalSpeed * 196.85)} · HDG ${String(Math.round(heading(data.heading + BEARING)) % 360).padStart(3, '0')}${ils}`;
  }
  simulator.dataset.airspeed = (data.indicatedAirspeed * KT).toFixed(1); simulator.dataset.altitude = ((data.altitude + ELEVATION) * FT).toFixed(0);
  simulator.dataset.heading = heading(data.heading + BEARING).toFixed(1); simulator.dataset.pitch = data.pitch.toFixed(1);
  simulator.dataset.roll = data.roll.toFixed(1); simulator.dataset.onGround = String(state.onGround); simulator.dataset.phase = stage;
  simulator.dataset.agl = (data.agl * FT).toFixed(1); simulator.dataset.verticalSpeed = (data.verticalSpeed * 196.85).toFixed(0); simulator.dataset.elapsed = state.elapsed.toFixed(1);
  $('flight-summary').textContent = `${tr('空速', 'Airspeed')} ${Math.round(data.indicatedAirspeed * KT)} KT, ${tr('高度', 'Altitude')} ${Math.round((data.altitude + ELEVATION) * FT)} FT, ${tr('航向', 'Heading')} ${Math.round(heading(data.heading + BEARING))}°`;
  if (novice) updateNovice();
  if (touring) updateTourHud();
  if (active && !resultShown && (state.crashed || state.touchdown && state.onGround && data.groundSpeed < 2.5 && state.elapsed - state.touchdown.elapsed > 3)) showResult();
}
function updateTourHud() {
  const n = tour.rings.length, landmark = resultShown || tourRun.done ? null : nearestLandmark(tour, state.position);
  $('th-time').textContent = formatTime(state.elapsed); $('th-rings').textContent = `${tourRun.hits} / ${n}`;
  const box = $('tour-caption'); box.hidden = !landmark;
  if (landmark) { box.dataset.id = landmark.id; $('tc-name').textContent = tr(landmark.zh, landmark.en); $('tc-fact').textContent = tr(landmark.factZh, landmark.factEn); }
}
// ---- Novice mode (logic lives in novice.mjs) ----
const GLOW_TARGETS = { throttle: '#throttle', gear: '#gear-button', flaps: '#flaps-button', brake: '#brake-button, #touch-brake' };
function setGlow(id) {
  if (id === glowing) return; glowing = id;
  for (const [key, selector] of Object.entries(GLOW_TARGETS)) document.querySelectorAll(selector).forEach(el => el.classList.toggle('glow', key === id));
}
function updateNovice() {
  const show = active && !resultShown, cue = approachActive(state, data, routeIndex) ? ilsCue(data, ilsLast) : null; ilsLast = cue; // arrows only on the approach
  const age = a => a ? { age: state.elapsed - a.at, to: a.to } : null;
  const ringCue = tour && tourRun ? nextRingCue(tourRun, state, data) : null;
  const step = nextStep(state, data, commands, { touch: coarsePointer, routeIndex, route, circuitAltFt: profileNow().novice.circuitAltFt, tour: ringCue && { diff: ringCue.diff, altFt: ringCue.altFt }, notice: { gear: age(notice.gear), flaps: age(notice.flaps) } });
  $('novice-hint').hidden = !show || step.id === 'none'; $('novice-strip').hidden = !active;
  $('novice-hint').dataset.step = step.id; $('novice-hint-text').textContent = tr(step.zh, step.en); setGlow(show ? step.glow : null);
  const vs = Math.round(data.verticalSpeed * 196.85 / 10) * 10;
  $('ns-speed').textContent = Math.round(data.indicatedAirspeed * KT);
  $('ns-alt').textContent = Math.round((data.altitude + ELEVATION) * FT).toLocaleString('en-US');
  $('ns-vs').textContent = Math.abs(vs) < 100 ? tr('平飛', 'Level') : `${vs > 0 ? tr('上升', 'Up') : tr('下降', 'Down')} ${Math.abs(vs).toLocaleString('en-US')}`;
  $('ns-vs').dataset.dir = Math.abs(vs) < 100 ? 'level' : vs > 0 ? 'up' : 'down';
  $('ns-hdg').textContent = String(Math.round(heading(data.heading + BEARING)) % 360).padStart(3, '0');
  $('ns-ils').hidden = !cue;
  if (cue) {
    const mark = { left: '←', right: '→', ok: '✓', low: '↓', high: '↑' };
    for (const [id, part] of [['ns-ils-h', cue.h], ['ns-ils-v', cue.v]]) {
      const el = $(id); el.hidden = !part; if (!part) continue;
      el.textContent = `${mark[part.state]} ${tr(part.zh, part.en)}`; el.dataset.state = part.state; el.dataset.far = String(!!part.far);
    }
  }
  $('ap-novice-button').setAttribute('aria-pressed', String(state.autopilot.enabled)); $('ap-novice-value').textContent = state.autopilot.enabled ? 'ON' : 'OFF';
}
// Gear and flaps look after themselves in novice mode; the hint shows what moved and the button glows for a moment.
function runAutoConfig() {
  const change = autoConfig(state, data, commands, autoMem, routeIndex);
  if (change.gear !== undefined) { commands.gear = change.gear; notice.gear = { at: state.elapsed, to: change.gear }; }
  if (change.flaps !== undefined) { commands.flaps = change.flaps; notice.flaps = { at: state.elapsed, to: change.flaps }; }
}
// Frames along the ILS glidepath (positions from approachBoxes(), the same geometry physics.mjs uses for the deviations).
// Each frame is four flat bars of real width (a 1 px line vanishes at distance); bars thicken with distance. Unlit, no fog, no depth write.
function createApproachBoxes(aircraft = 'jet') {
  const group = new THREE.Group(), bar = new THREE.PlaneGeometry(1, 1);
  const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
  group.visible = false;
  for (const b of approachBoxes(aircraft)) {
    // Own materials per frame so each one can fade independently as the aircraft approaches it (see updateApproachBoxes).
    const frame = new THREE.Group(), t = 2.5 + 2.5 * b.fade, hw = b.w / 2, hh = b.h / 2, yellow = flat(0xffe14d, .95), dark = flat(0x08141c, .6);
    // [centre x, centre y, width, height] of the four bars; the dark outline is 1.2 m larger on every side and sits just behind.
    for (const [x, y, w, h] of [[0, hh, b.w + t, t], [0, -hh, b.w + t, t], [-hw, 0, t, b.h + t], [hw, 0, t, b.h + t]]) {
      for (const [material, grow, depth, order] of [[dark, 2.4, -.1, 4], [yellow, 0, 0, 5]]) {
        const mesh = new THREE.Mesh(bar, material); mesh.position.set(x, y, depth); mesh.scale.set(w + grow, h + grow, 1); mesh.renderOrder = order; mesh.frustumCulled = false; frame.add(mesh);
      }
    }
    frame.position.set(b.x, b.y, b.z); frame.userData = { z: b.z, yellow, dark }; group.add(frame);
  }
  scene.add(group); return group;
}
function updateApproachBoxes() {
  if (!approachBoxGroup) return;
  const show = novice && active && !state.crashed && approachActive(state, data, routeIndex); approachBoxGroup.visible = show;
  // Full opacity beyond 600 m ahead, fading linearly to nothing at 120 m, so the player flies "through" each frame instead of seeing it vanish.
  if (show) for (const frame of approachBoxGroup.children) {
    const { z, yellow, dark } = frame.userData, alpha = clamp((state.position.z - z - 120) / 480, 0, 1);
    frame.visible = alpha > 0; yellow.opacity = .95 * alpha; dark.opacity = .6 * alpha;
  }
}
function drawInstruments() {
  instruments.draw(state, data, { airport: AIRPORT, headingOffset: BEARING, altitudeOffset: ELEVATION, ap: state.autopilot, gearHeight: profileNow().gearHeight, powerLabel: profileNow().id === 'light' ? 'POWER' : 'THRUST', rpmMax: profileNow().ui.rpm?.max, route: state.scenario === 'runway' ? route : [], target: state.scenario === 'runway' ? route[routeIndex] : tour && tourRun && !tourRun.done ? { x: tour.rings[tourRun.next].x, z: tour.rings[tourRun.next].z, name: `RING ${tourRun.next + 1}` } : { x: 0, z: RUNWAY.nearThreshold, name: `RWY ${AIRPORT.runway.ident}` }, runway: RUNWAY, locale });
}
function showResult() {
  resultShown = true; setPause(true);
  const t = state.touchdown;
  $('result-dialog').classList.toggle('challenge', !!level); $('result-challenge').hidden = !level; $('next-level-button').hidden = true;
  $('result-eyebrow').textContent = level ? `${tr('降落挑戰', 'LANDING CHALLENGE')} · ${tr(`第 ${level.id} 關 ${level.zh}`, `LEVEL ${level.id} ${level.en}`)}` : `${uiNow().flightLabel} · DEBRIEF`;
  const retry = $('retry-button'); retry.dataset.zh = level ? '再試一次' : '再飛一次'; retry.dataset.en = level ? 'Try again' : 'Fly again'; retry.textContent = retry.dataset[locale];
  const menu = $('result-menu-button'); menu.dataset.zh = tour ? '選擇航線' : '選擇航班'; menu.dataset.en = tour ? 'Choose route' : 'Choose flight'; menu.textContent = menu.dataset[locale]; $('tour-continue-button').hidden = true;
  if (level) { showLevelResult(); return; }
  if (tour && tourRun?.done && !state.crashed) { showTourResult(); return; }
  const reasons = {
    'gear-up': ['起落架未放下', 'Landing gear was retracted'], 'off-runway': ['未在跑道內接地', 'Touchdown outside the runway'],
    'hard-landing': ['接地下降率過大', 'Excessive touchdown sink rate'], 'wing-strike': ['接地傾角過大', 'Excessive bank at touchdown'],
    'tail-strike': ['接地俯仰角過大', 'Unsafe pitch at touchdown'], 'side-load': ['未與跑道方向對齊', 'Misaligned at touchdown'],
    'runway-overrun': ['衝出跑道', 'Runway overrun'], 'ground-impact': ['撞地', 'Ground impact'],
  };
  let score = 0;
  if (!state.crashed && t) score = Math.round(clamp(100 - Math.max(0, t.sinkRate - 1) * 12 - Math.abs(t.lateralOffset) * 1.2 - Math.abs(t.roll) * 2 - Math.max(0, Math.abs(t.speed * KT - uiNow().score.refKt) - uiNow().score.tolKt) * .6 - Math.min(25, Math.abs(t.position.z - RUNWAY.touchdownTarget) / 50), 0, 100));
  const offRunway = !state.crashed && !data.onRunway;
  $('result-title').textContent = state.crashed ? tr('航班中止', 'Flight ended') : offRunway ? tr('停在跑道外', 'Stopped off the runway') : score >= 85 ? tr('平穩落地', 'Smooth landing') : tr('完成落地', 'Landing complete');
  $('result-description').textContent = state.crashed ? (reasons[state.crashReason] || ['重試並保持穩定進場。', 'Try again with a stabilized approach.'])[locale === 'zh' ? 0 : 1] : offRunway ? tr('飛機停在跑道外，未在跑道內停穩。評分仍依下降率、中線偏移、空速與接地位置計算。', 'The aircraft stopped off the runway. Your score still reflects sink rate, alignment, speed and touchdown position.') : tr(`已在蘇黎世 ${AIRPORT.runway.ident} 跑道安全停穩。評分包含下降率、中線偏移、空速與接地位置。`, `Stopped safely on Zurich runway ${AIRPORT.runway.ident}. Your score reflects sink rate, alignment, speed and touchdown position.`);
  $('result-score').textContent = state.crashed ? '—' : `${score} / 100`;
  $('result-sink').textContent = t ? `${Math.round(t.sinkRate * 196.85)} FT/MIN` : '—';
  $('result-offset').textContent = t ? `${Math.abs(t.lateralOffset).toFixed(1)} M` : '—';
  $('result-speed').textContent = t ? `${Math.round(t.speed * KT)} KT` : '—';
  $('result-dialog').showModal(); $('pause-banner').hidden = true;
}
function showTourResult() {
  const n = tour.rings.length, all = tourRun.hits === n, seconds = state.elapsed, before = tourBest[tour.id];
  tourBest = recordTourBest(tourBest, tour.id, seconds); saveTourBest();
  const record = !before || seconds < before;
  $('result-dialog').classList.add('challenge'); $('result-challenge').hidden = false; $('next-level-button').hidden = true; $('tour-continue-button').hidden = false;
  $('result-eyebrow').textContent = `${tr('觀光航線', 'SIGHTSEEING TOUR')} · ${tr(tour.zh, tour.en)}`;
  $('result-title').textContent = all ? tr('全部通過', 'Every ring') : tr('航線完成', 'Tour complete');
  $('result-description').textContent = all ? tr('每個圈都穿過了。', 'You flew through every ring.') : tr(`穿過 ${tourRun.hits} 個圈，錯過 ${tourRun.misses} 個。想拿星星，每個圈都要穿過。`, `${tourRun.hits} rings flown through, ${tourRun.misses} missed. Hit every ring for the star.`);
  $('result-stars').textContent = all ? '★' : '☆'; $('result-stars').setAttribute('aria-label', all ? tr('全部通過，得一顆星', 'All rings hit: one star') : tr('尚未全部通過', 'Not every ring hit'));
  const list = $('result-checks'); list.textContent = '';
  for (const [zh, en, value, ok] of [['用時', 'Time', formatTime(seconds), null], ['穿過的圈', 'Rings hit', `${tourRun.hits} / ${n}`, all]]) {
    const li = document.createElement('li'), text = document.createElement('span'), mark = document.createElement('b');
    if (ok !== null) li.dataset.ok = String(ok); text.textContent = `${tr(zh, en)}　${value}`; mark.textContent = ok === null ? '' : ok ? '✓' : '✗'; li.append(text, mark); list.append(li);
  }
  $('result-best').textContent = `${tr('最佳時間', 'Best time')} ${formatTime(tourBest[tour.id])}${record ? tr('　· 新紀錄', '  · New record') : ''}`;
  renderTours(); $('result-dialog').showModal(); $('pause-banner').hidden = true;
}
function showLevelResult() {
  const g = grade(state, data), crashReasons = { 'gear-up': ['起落架未放下', 'Landing gear was retracted'], 'off-runway': ['未在跑道內接地', 'Touchdown outside the runway'], 'hard-landing': ['接地下降率過大', 'Excessive touchdown sink rate'], 'wing-strike': ['接地傾角過大', 'Excessive bank at touchdown'], 'tail-strike': ['接地俯仰角過大', 'Unsafe pitch at touchdown'], 'side-load': ['未與跑道方向對齊', 'Misaligned at touchdown'], 'runway-overrun': ['衝出跑道', 'Runway overrun'], 'ground-impact': ['撞地', 'Ground impact'] };
  const ac = state.aircraft || 'jet', before = bestStars(progressBy[ac], level.id), off = !state.crashed && !data.onRunway;
  progressBy[ac] = recordResult(progressBy[ac], level.id, g.stars); saveProgress(ac);
  $('result-title').textContent = state.crashed ? tr('航班中止', 'Flight ended') : off ? tr('停在跑道外', 'Stopped off the runway') : g.pass ? tr(`第 ${level.id} 關過關`, `Level ${level.id} cleared`) : tr('還差一點', 'Not quite');
  $('result-description').textContent = state.crashed ? (crashReasons[state.crashReason] || ['再試一次，保持穩定進場。', 'Try again with a stabilized approach.'])[locale === 'zh' ? 0 : 1] : off ? tr('飛機停在跑道外，這一關不算過。', 'The aircraft stopped off the runway, so the level is not cleared.')
    : g.stars === 3 ? tr('三項都達標，完美落地。', 'All three checks passed. A perfect landing.') : g.pass ? tr('三項都達標才有三顆星。看看哪一項差一點。', 'All three checks earn three stars. See which one fell short.') : tr('三項都沒達標。再試一次。', 'No check passed. Try again.');
  $('result-stars').textContent = starText(g.stars); $('result-stars').setAttribute('aria-label', tr(`${g.stars} 顆星，共 3 顆`, `${g.stars} of 3 stars`));
  const list = $('result-checks'); list.textContent = '';
  for (const c of g.checks) {
    const li = document.createElement('li'), text = document.createElement('span'), mark = document.createElement('b');
    li.dataset.ok = String(c.ok); text.textContent = tr(c.zh, c.en); mark.textContent = c.ok ? '✓' : '✗'; li.append(text, mark); list.append(li);
  }
  const next = levelOf(level.id + 1, ac), best = bestStars(progressBy[ac], level.id);
  $('next-level-button').hidden = !(g.pass && next);
  $('result-best').textContent = `${tr('最佳成績', 'Best')} ${starText(best)}${g.pass && next && !before && best ? tr(`　· 第 ${next.id} 關已解鎖`, `  · Level ${next.id} unlocked`) : ''}`;
  renderLevels(); $('result-dialog').showModal(); $('pause-banner').hidden = true;
}
async function toggleSound() {
  if (!audio.context) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) { toast(tr('此瀏覽器不支援音效。', 'Audio is unavailable in this browser.')); return; }
    audio.context = new Context(); audio.gain = audio.context.createGain(); audio.gain.gain.value = 0;
    audio.filter = audio.context.createBiquadFilter(); audio.filter.type = 'lowpass'; audio.filter.frequency.value = 400;
    audio.oscillator = audio.context.createOscillator(); audio.oscillator.type = 'sawtooth'; audio.oscillator.frequency.value = 45;
    audio.oscillator.connect(audio.filter); audio.filter.connect(audio.gain); audio.gain.connect(audio.context.destination); audio.oscillator.start();
  }
  audio.enabled = !audio.enabled;
  if (audio.enabled) await audio.context.resume();
  updateAudio(); $('sound-button').setAttribute('aria-pressed', String(audio.enabled)); updateUI();
}
function updateAudio() {
  if (!audio.context) return;
  const audible = audio.enabled && active && !paused && !state.crashed;
  const sound = uiNow().sound;
  if (audio.oscillator.type !== sound.type) audio.oscillator.type = sound.type;
  audio.gain.gain.setTargetAtTime(audible ? .014 + state.engine * .03 : 0, audio.context.currentTime, .12);
  audio.oscillator.frequency.setTargetAtTime(sound.base + state.engine * sound.gain, audio.context.currentTime, .1);
  audio.filter.frequency.setTargetAtTime(sound.filterBase + state.engine * sound.filterGain, audio.context.currentTime, .1);
}
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(.1, (now - lastTime) / 1000 || 0); lastTime = now; sceneTime += dt;
  if (active && !paused && !state.crashed && terrainReady && !tourLoading) {
    if (novice) runAutoConfig();
    const input = inputFrame(dt); accumulator += dt;
    const wind = weather === 'crosswind' ? { x: 7.72, y: 0, z: 0 } : weather === 'overcast' ? { x: 1.7, y: 0, z: 2 } : { x: 0, y: 0, z: 0 };
    while (accumulator >= 1 / 120) {
      stepFlight(state, input, 1 / 120, { wind: level ? windAt(level, state.elapsed) : wind, groundElevation: scenery?.groundHeight(state.position.x, state.position.z) || 0 });
      accumulator -= 1 / 120;
    }
    data = getFlightData(state); updateTour();
  }
  updateApproachBoxes(); updateTourRings(); world.update(sceneTime, state, weather); scenery?.update(sceneTime, state);
  plane.update({ ...state, rollInput: axes.roll, pitchInput: axes.pitch, yawInput: axes.yaw, dt }, data);
  if (cockpit?.visible) cockpit.update?.({ ...state, rollInput: axes.roll, pitchInput: axes.pitch, yawInput: axes.yaw, dt, lookYaw, lookPitch }, data);
  updateCamera(dt); renderer.render(scene, camera);
  if (active && !panelHidden) drawInstruments();
  if (now - lastUI > 100) { lastUI = now; updateUI(); updateAudio(); }
}

$('start-button').addEventListener('click', startFlight);
$('retry-button').addEventListener('click', startFlight);
$('next-level-button').addEventListener('click', () => { const next = level && levelOf(level.id + 1, state.aircraft || 'jet'); const input = next && document.querySelector(`input[name=level][value="${next.id}"]`); if (input && !input.disabled) { input.checked = true; startFlight(); } });
document.querySelectorAll('input[name=scenario]').forEach(r => r.addEventListener('change', updateScenarioUI));
document.querySelectorAll('input[name=aircraft]').forEach(r => r.addEventListener('change', () => { if (r.checked) chooseAircraft(r.value); }));
$('tour-continue-button').addEventListener('click', continueFlying);
$('result-menu-button').addEventListener('click', () => { $('result-dialog').close(); showDialog($('flight-dialog')); });
$('menu-button').addEventListener('click', () => showDialog($('flight-dialog')));
$('help-button').addEventListener('click', () => showDialog($('help-dialog')));
$('close-help').addEventListener('click', () => closeDialog($('help-dialog')));
dialogs.forEach(dialog => dialog.addEventListener('cancel', event => {
  event.preventDefault();
  if (dialog.id === 'result-dialog' || !active && dialog.id === 'flight-dialog') return;
  closeDialog(dialog);
}));
$('pause-button').addEventListener('click', () => { if (active && !dialogs.some(d => d.open)) setPause(!paused); });
$('view-button').addEventListener('click', () => { if (active) setView(); });
$('sound-button').addEventListener('click', toggleSound);
$('lang-button').addEventListener('click', () => { locale = locale === 'zh' ? 'en' : 'zh'; try { localStorage.setItem('lang', locale); } catch {} localize(); });
$('panel-button').addEventListener('click', () => setPanel(true));
$('ap-altitude').addEventListener('change', e => { e.target.value = Math.round(apAltitudeLocal(Number(e.target.value)) * FT / 100 + ELEVATION * FT / 100) * 100; });
compactLayout.addEventListener('change', () => { if (active) setPanel(compactLayout.matches && coarsePointer ? true : panelHidden); });
$('restore-panel').addEventListener('click', () => setPanel(false));
$('ap-button').addEventListener('click', toggleAP);
$('ap-novice-button').addEventListener('click', toggleAP);
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { try { localStorage.setItem('flightMode', r.value); } catch {} }));
try { const saved = localStorage.getItem('flightMode'); if (saved === 'novice' || saved === 'advanced') document.querySelector(`input[name=mode][value=${saved}]`).checked = true; } catch {}
$('gear-button').addEventListener('click', gear);
$('flaps-button').addEventListener('click', e => {
  if (e.shiftKey) flaps(true);
  else { commands.flaps = (commands.flaps + 1) % 4; updateUI(); }
});
$('spoilers-button').addEventListener('click', spoilers);
$('brake-button').addEventListener('click', () => { brakeLatch = !brakeLatch; updateUI(); });
$('throttle').addEventListener('input', e => { commands.throttle = Number(e.target.value) / 100; });
$('control-mode').addEventListener('change', () => { mouse.inside = false; gamepadNotice = false; });
document.addEventListener('keydown', event => {
  if (event.target.matches('input[type=number],input[type=radio],select,textarea') && event.code !== 'Escape') return;
  if (dialogs.some(d => d.open)) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Home', 'End'].includes(event.code)) event.preventDefault();
  if (!active) return;
  if (!event.repeat) {
    const actions = { KeyP: () => setPause(!paused), KeyC: () => setView(), KeyM: toggleSound, KeyH: () => showDialog($('help-dialog')), KeyG: gear, KeyF: () => flaps(event.shiftKey), KeyB: spoilers, KeyA: toggleAP };
    if (actions[event.code]) { actions[event.code](); return; }
  }
  if (!paused) held.add(event.code);
});
document.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => { held.clear(); mouse.inside = false; if (active && !paused) setPause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && active) setPause(true); });
$('flight-view').addEventListener('contextmenu', e => e.preventDefault());
$('flight-view').addEventListener('pointerdown', e => {
  if (e.button === 2) { looking = true; lastPointer = { x: e.clientX, y: e.clientY }; e.target.setPointerCapture(e.pointerId); }
  document.activeElement?.blur();
});
$('flight-view').addEventListener('pointermove', e => {
  if (looking) {
    lookYaw = clamp(lookYaw - (e.clientX - lastPointer.x) * .004, -1.4, 1.4);
    lookPitch = clamp(lookPitch - (e.clientY - lastPointer.y) * .004, -.7, .7);
    lastPointer = { x: e.clientX, y: e.clientY }; return;
  }
  const visibleHeight = innerHeight - (panelHidden ? 0 : $('cockpit-panel').offsetHeight);
  mouse = { x: clamp((e.clientX / innerWidth - .5) * 2, -1, 1), y: clamp((e.clientY - 54) / Math.max(1, visibleHeight - 54) * 2 - 1, -1, 1), inside: true };
  $('mouse-reticle').style.left = `${e.clientX}px`; $('mouse-reticle').style.top = `${e.clientY}px`;
  $('mouse-reticle').hidden = !active || $('control-mode').value !== 'mouse';
});
$('flight-view').addEventListener('pointerup', () => { looking = false; });
$('flight-view').addEventListener('pointerleave', () => { if (!looking) { mouse.inside = false; $('mouse-reticle').hidden = true; } });
$('flight-view').addEventListener('wheel', e => { e.preventDefault(); camera.fov = clamp(camera.fov + e.deltaY * .025, 42, 90); camera.updateProjectionMatrix(); }, { passive: false });
const yoke = $('touch-yoke');
function touchMove(e) {
  const rect = yoke.getBoundingClientRect();
  touch = { x: clamp((e.clientX - rect.left - rect.width / 2) / (rect.width * .4), -1, 1), y: clamp((e.clientY - rect.top - rect.height / 2) / (rect.height * .4), -1, 1), active: true };
  $('touch-stick').style.transform = `translate(${touch.x * (novice ? 38 : 27)}px,${touch.y * (novice ? 38 : 27)}px)`;
}
yoke.addEventListener('pointerdown', e => { yoke.setPointerCapture(e.pointerId); touchMove(e); });
yoke.addEventListener('pointermove', e => { if (touch.active) touchMove(e); });
for (const name of ['pointerup', 'pointercancel']) {
  yoke.addEventListener(name, () => { touch.active = false; $('touch-stick').style.transform = ''; });
  $('touch-brake').addEventListener(name, () => { touchBrake = false; });
}
$('touch-brake').addEventListener('pointerdown', e => { e.target.setPointerCapture(e.pointerId); touchBrake = true; });
window.addEventListener('resize', () => { if (renderer) configureQuality(); });

try {
  // Logarithmic depth keeps runway markings, terrain and 80 km mountains from z-fighting despite the 0.15 m near plane.
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; $('flight-view').append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', `${AIRPORT.city.en} flight simulation`);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .15, 200000);
  scene.add(camera); world = createWorld(THREE, scene, { airport: AIRPORT });
  try { if (localStorage.getItem('flightAircraft') === 'light') { chosenAircraft = 'light'; document.querySelector('input[name=aircraft][value=light]').checked = true; } } catch {}
  state = createFlightState('runway', chosenAircraft); data = getFlightData(state); setModel(chosenAircraft); route = routeFor(chosenAircraft); rebuildApproachBoxes(chosenAircraft);
  configureQuality(); camera.position.set(55, 29, state.position.z + 66); updateCamera(1);
  $('mission-eyebrow').textContent = `${AIRPORT.city.en.toUpperCase()} · ${AIRPORT.icao} · RWY ${AIRPORT.runway.ident}`;
  $('nav-ils').textContent = AIRPORT.ils.ident; applyAircraft(chosenAircraft);
  $('ap-altitude').min = apFloorFt(); $('ap-altitude').value = profileNow().novice.circuitAltFt; $('ap-heading').value = Math.round(BEARING);
  scenery = createGeoScenery(THREE, scene, { airport: AIRPORT, renderer, maxAnisotropy: softwareRenderer() ? 1 : renderer.capabilities.getMaxAnisotropy(), highRes, attributionTarget: $('scenery-credit'), onStatus: onSceneryStatus });
  // ?debug exposes the live objects to browser tests (teleporting, camera placement); it changes nothing in normal play.
  if (new URLSearchParams(location.search).has('debug')) window.__flight = { THREE, get state() { return state; }, set state(v) { state = v; }, get data() { return data; }, set data(v) { data = v; }, camera, scene, renderer, scenery, world, get commands() { return commands; }, setView, setPanel, get route() { return route; }, get aircraft() { return chosenAircraft; }, get plane() { return plane; }, get cockpit() { return cockpit; }, applyAircraft, chooseAircraft, get novice() { return novice; }, get notice() { return notice; }, get level() { return level; }, get tour() { return tour; }, get tourRun() { return tourRun; }, get tourRings() { return tourRings; }, get tourLoading() { return tourLoading; }, get tourBest() { return tourBest; }, tours: TOURS, get progress() { return progressBy[chosenAircraft]; }, set progress(v) { progressBy[chosenAircraft] = v; renderLevels(); }, showResult };
  $('loading').hidden = true; $('start-button').disabled = true; updateScenarioUI(); localize(); requestAnimationFrame(animate);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); setPause(true); toast(tr('顯示卡連線中斷，請重新載入頁面。', 'Graphics context lost. Reload the page.')); });
} catch (error) {
  console.error(error); $('loading').textContent = tr('無法啟動 3D 畫面。請使用支援 WebGL 的瀏覽器。', 'Unable to start 3D. Please use a WebGL-capable browser.');
}
