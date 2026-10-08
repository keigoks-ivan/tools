import * as THREE from 'three';
import { TRACK, TRACKS } from './track.mjs?v=city-drive-11';
import { VEHICLES } from './vehicles.mjs?v=city-drive-11';
import { readLapRecord, writeLapRecord } from './records.mjs?v=city-drive-11';
import { createDrivingState, resetDriving, stepDriving } from './physics.mjs?v=city-drive-11';
import { createCar } from './car.js?v=city-drive-11';
import { createWorld } from './world.js?v=city-drive-11';
import { installTouchControls } from './touch-controls.mjs?v=city-drive-11';
import { createTiltSteering } from './tilt-steering.mjs?v=city-drive-11';
import { createRacingAudio } from './audio.mjs?v=city-drive-11';
import { createCockpit } from './cockpit.js?v=city-drive-11';
import { getSeasons, getSeason, defaultSeason } from './seasons.mjs?v=city-drive-11';
import { roadPose } from './road-pose.mjs?v=city-drive-11';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const mobile = matchMedia('(pointer: coarse), (max-height:540px) and (max-width:1100px)').matches || innerWidth < 760;
let track = TRACKS.taipei || TRACK, vehicle = VEHICLES.porsche911gt3rs || VEHICLES.ferrari458;
let seasonId = '', season = defaultSeason(track), drivingVehicle = vehicle;
const state = createDrivingState(track);
const held = new Set(), touches = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
const paints = { ivory: '#d9d6c6', graphite: '#465051', red: '#c93324' };
let renderer, world, camera, cockpit, car, ghost, touchControls, tilt;
let active = false, paused = false, ready = false, view = 0, elapsed = 0, last = 0, accumulator = 0, lastHUD = 0;
let sound = true, musicVolume = .55, effectsVolume = .8, audio, toastTimer, lastPadButtons = [], averageFrame = 16, quality = 'medium';
let lapSamples = [], bestGhost = [], ghostCursor = 0, lastSample = 0, bestStored = null, paint = 'red';
const cameraPosition = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
const forward = new THREE.Vector3(), right = new THREE.Vector3(), desiredPosition = new THREE.Vector3(), desiredTarget = new THREE.Vector3();
try {
  const settings = JSON.parse(localStorage.getItem('apex.settings.v1') || '{}');
  if (TRACKS[settings.track]) track = TRACKS[settings.track];
  if (VEHICLES[settings.vehicle]) vehicle = VEHICLES[settings.vehicle];
  if (typeof settings.season === 'string') seasonId = settings.season;
  if (paints[settings.paint]) paint = settings.paint;
  if (['auto', 'high', 'medium', 'low'].includes(settings.quality)) $('quality').value = settings.quality;
  if (typeof settings.assist === 'boolean') $('assist').checked = settings.assist;
  if (typeof settings.sound === 'boolean') sound = settings.sound;
  if (Number.isFinite(settings.musicVolume)) musicVolume = clamp(settings.musicVolume, 0, 1);
  if (Number.isFinite(settings.effectsVolume)) effectsVolume = clamp(settings.effectsVolume, 0, 1);
} catch {}
season = getSeason(track, seasonId); drivingVehicle = { ...vehicle, grip: vehicle.grip * season.grip };
resetDriving(state, track); loadRecord();
function recordTrackId() { return season.id === defaultSeason(track).id ? track.id : `${track.id}.${season.id}`; }
function loadRecord() {
  bestStored = null; bestGhost = []; ghostCursor = 0;
  try { const saved = readLapRecord(localStorage, recordTrackId(), vehicle.id); bestStored = saved.best; bestGhost = saved.ghost; } catch {}
  state.bestLap = bestStored;
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const ms = Math.floor(seconds * 1000), minutes = Math.floor(ms / 60000);
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
function toast(text) {
  clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
}
function clearInput() {
  held.clear(); touches.steer = touches.throttle = touches.brake = touches.handbrake = 0;
  touchControls?.clear();
  tilt?.recalibrate();
  $('tilt-wheel').style.transform = 'rotate(0deg)';
}
function saveSettings() {
  try { localStorage.setItem('apex.settings.v1', JSON.stringify({ paint, quality: $('quality').value, assist: $('assist').checked, track: track.id, vehicle: vehicle.id, season: season.id, sound, musicVolume, effectsVolume })); } catch {}
}
function updateSelectionUI() {
  $('track-select').value = track.id; $('car-select').value = vehicle.id;
  $('season-select').replaceChildren(...getSeasons(track).map(item => {
    const option = document.createElement('option'); option.value = item.id;
    option.textContent = `${item.label} · ${item.temperature}°C`; return option;
  }));
  $('season-select').value = season.id; $('season-description').textContent = season.description;
  $('track-name').textContent = track.name; $('track-label').textContent = track.label;
  $('track-description').textContent = `${(track.length / 1000).toFixed(2)} km · ${track.description}`;
  $('car-name').textContent = vehicle.name; $('car-description').textContent = vehicle.description;
  $('session-label').textContent = `${track.name} · ${season.label} · TIME ATTACK`;
  $('scene-track-name').textContent = track.name; $('scene-track-label').textContent = `${track.label} / ${season.label} / 計時練習`;
  $('map-label').textContent = `${track.name} / ${track.label}`;
  $('track-map').setAttribute('aria-label', `${track.label}地圖與車輛位置`);
  renderer?.domElement.setAttribute('aria-label', `${track.label}即時 3D 畫面`);
}
function prepareSelectionUI() {
  for (const [id, items] of [['track-select', TRACKS], ['car-select', VEHICLES]]) {
    $(id).replaceChildren(...Object.values(items).map(item => {
      const option = document.createElement('option'); option.value = item.id;
      option.textContent = item.label ? `${item.name} · ${item.label}` : item.name;
      return option;
    }));
  }
  updateSelectionUI();
  const credits = $('vehicle-credits');
  const production = document.createElement('div'); production.className = 'credit-item';
  const heading = document.createElement('h3'); heading.textContent = '市售跑車與城市賽道';
  const text = document.createElement('p');
  text.textContent = '新增跑車依車廠尺寸與外形資料製作原創 3D 模型；操控參數為遊戲調校。城市依真實地標與街景特色製作，路線為競速改編布局。本遊戲為獨立作品。';
  const sources = document.createElement('p');
  for (const [href, label] of [['./assets/PRODUCTION-CARS.md', '車款資料來源'], ['./assets/CITY-SOURCES.md', '城市與實景參考'], ['./assets/CITY-PHOTO-SOURCES.md', '當地實景照片與授權'], ['./assets/COCKPIT-REFERENCES.md', '駕駛艙參考'], ['./assets/SEASONS.md', '季節資料來源']]) {
    const link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `${label} ↗`;
    sources.append(link, '　');
  }
  production.append(heading, text, sources); credits.replaceChildren(production);
}
function setSelectionLoading(loading) {
  ready = !loading; $('track-select').disabled = $('car-select').disabled = $('season-select').disabled = $('start-button').disabled = loading;
  $('loading').hidden = !loading; $('start-label').textContent = loading ? '正在準備…' : active ? '繼續駕駛' : '開始駕駛';
}
function clearGhost() {
  if (!ghost) return;
  world.scene.remove(ghost);
  const materials = new Set(); ghost.traverse(node => { if (node.isMesh) materials.add(node.material); });
  materials.forEach(material => material.dispose()); ghost = null;
}
async function changeSelection() {
  if (!ready) return;
  const nextTrack = TRACKS[$('track-select').value], nextVehicle = VEHICLES[$('car-select').value];
  const nextSeason = getSeason(nextTrack, $('season-select').value);
  if (!nextTrack || !nextVehicle || (nextTrack === track && nextVehicle === vehicle && nextSeason === season)) return;
  setPaused(true); setSelectionLoading(true);
  $('loading-label').textContent = `正在準備 ${nextTrack.label} · ${nextVehicle.name}…`;
  const results = await Promise.allSettled([
    nextTrack === track && nextSeason === season ? world : createWorld(renderer, { mobile, track: nextTrack, season: nextSeason }),
    nextVehicle === vehicle ? car : createCar({ renderer, mobile, vehicle: nextVehicle.id }),
  ]);
  if (results.some(result => result.status === 'rejected')) {
    if (results[0].status === 'fulfilled' && results[0].value !== world) results[0].value.dispose();
    if (results[1].status === 'fulfilled' && results[1].value !== car) results[1].value.dispose();
    results.filter(result => result.status === 'rejected').forEach(result => console.error('Selection could not load:', result.reason));
    updateSelectionUI(); setSelectionLoading(false); toast('賽道或車輛載入失敗，請再選一次。'); return;
  }
  const previousWorld = world, previousCar = car;
  clearGhost(); previousWorld.scene.remove(previousCar.group);
  world = results[0].value; car = results[1].value; track = nextTrack; vehicle = nextVehicle;
  season = nextSeason; drivingVehicle = { ...vehicle, grip: vehicle.grip * season.grip };
  world.scene.add(car.group, camera); car.setPaint(paints[paint]); cockpit?.setPaint(paints[paint]);
  if (previousWorld !== world) previousWorld.dispose();
  if (previousCar !== car) previousCar.dispose();
  active = false; resetDriving(state, track); state.rpm = vehicle.idle; loadRecord(); createGhost();
  lapSamples = []; lastSample = 0; clearInput(); view = 0; accumulator = 0; last = 0;
  $('camera-button').setAttribute('aria-label', '切換鏡頭（C）');
  $('menu').hidden = false; $('hud').hidden = $('touch-controls').hidden = true; document.body.classList.remove('is-driving');
  updateSelectionUI(); configureQuality(); updateCamera(1, true); world.update(state, elapsed, camera, vehicle); updateHUD();
  setPaused(false); setSelectionLoading(false); saveSettings();
  toast(`${track.label} · ${season.label} · ${vehicle.name} 已準備好。`);
}
function softwareRenderer() {
  try { const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info'); return !!extension && /swiftshader|llvmpipe|software/i.test(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)); } catch { return false; }
}
function configureQuality() {
  const software = softwareRenderer(), automatic = $('quality').value === 'auto';
  const limited = mobile || renderer.capabilities.maxTextureSize < 8192 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  quality = automatic ? (software ? 'low' : limited ? 'medium' : 'high') : $('quality').value;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, software && automatic ? .85 : quality === 'high' ? 1.65 : quality === 'medium' ? 1.2 : .8));
  renderer.shadowMap.enabled = quality !== 'low'; world?.setQuality(quality); resize(); saveSettings();
  $('render-device').textContent = `${software ? '軟體繪圖' : 'GPU · WebGL 2'} · ${automatic ? '自動畫質' : { high: '高畫質', medium: '標準畫質', low: '效能優先' }[quality]}`;
}
function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
function setPaused(next) {
  paused = !!next; clearInput(); accumulator = 0;
  $('pause-overlay').hidden = !active || !paused || !$('menu').hidden || [...document.querySelectorAll('dialog')].some(d => d.open);
  $('pause-button').setAttribute('aria-pressed', String(paused));
  updateAudio();
}
function showMenu() {
  if (!ready) return;
  setPaused(true); $('menu').hidden = false; $('hud').hidden = true; $('touch-controls').hidden = true;
  document.body.classList.remove('is-driving'); $('pause-overlay').hidden = true;
  $('start-label').textContent = active ? '繼續駕駛' : '開始駕駛';
}
function startDriving(restart = false) {
  if (!ready) return;
  unlockAudio();
  if (!active || restart) {
    resetDriving(state, track); state.rpm = vehicle.idle; state.bestLap = bestStored; lapSamples = [[0, state.x, state.y, state.z, state.heading, state.s]]; lastSample = 0; ghostCursor = 0;
  }
  active = true; $('menu').hidden = true; $('hud').hidden = false; $('touch-controls').hidden = false;
  document.body.classList.add('is-driving'); setPaused(false);
  [...document.querySelectorAll('dialog')].forEach(d => { if (d.open) d.close(); });
  cameraPosition.copy(desiredPosition); updateCamera(1, true); $('start-button').blur();
  toast(tilt?.enabled ? '傾斜手機轉向；手煞車甩尾，停下後持續按煞車可倒車。' : mobile ? '按手煞車甩尾；停下後持續按煞車可倒車。' : 'Space 手煞車甩尾；停下後持續按 S／↓ 可倒車。');
}
function resetOnTrack() {
  if (!active) return;
  const best = state.bestLap, previousLap = state.lap;
  resetDriving(state, track); state.rpm = vehicle.idle; state.bestLap = best; state.lap = previousLap; state.invalidLap = true;
  lapSamples = [[0, state.x, state.y, state.z, state.heading, state.s]]; lastSample = 0; ghostCursor = 0; clearInput(); updateCamera(1, true);
  toast('已回到起點；這一圈不計入最佳圈速。');
}
function cycleCamera() {
  view = (view + 1) % 4;
  $('camera-button').setAttribute('aria-label', ['追車視角', '引擎蓋視角', '高位追車視角', '駕駛艙視角'][view]);
  toast(['追車視角', '引擎蓋視角', '高位追車視角', '駕駛艙視角'][view]); updateCamera(1, true);
}
function openDialog(id) {
  if (active) setPaused(true); $(id).showModal(); $('pause-overlay').hidden = true;
}
function closeDialog(id) {
  $(id).close(); if (active && $('menu').hidden) setPaused(false);
}
function updateCamera(dt, snap = false) {
  if (!camera || !car) return;
  const grade = roadPose(state.heading, state.roadHeading, state.roadSlope).grade;
  forward.set(Math.sin(state.heading), (view === 1 || view === 3) ? grade : 0, Math.cos(state.heading)); right.set(forward.z, 0, -forward.x);
  const menuOpen = !$('menu').hidden;
  if (menuOpen) {
    const phase = Math.sin(elapsed * .13) * .08;
    const city = !['costa', 'alpine', 'canyon', 'grandprix'].includes(track.id);
    const outsideVista = ['sydney', 'goldcoast', 'vancouver', 'nice'].includes(track.id);
    desiredPosition.set(state.x, state.y + (city ? 2.3 : 1.9), state.z).addScaledVector(right, (city && !outsideVista ? -5.9 : 5.9) + phase).addScaledVector(forward, -6.8);
    desiredTarget.set(state.x, state.y + .65, state.z).addScaledVector(right, 2.0).addScaledVector(forward, .7);
    if (innerWidth < 620 && innerHeight > innerWidth) { desiredPosition.set(state.x, state.y + 2.6, state.z).addScaledVector(right, 5.4).addScaledVector(forward, -7.7); desiredTarget.set(state.x, state.y - .5, state.z); }
  } else if (view === 3) {
    desiredPosition.set(state.x, state.y + car.dimensions.height * .75 + .05, state.z).addScaledVector(forward, .1);
    desiredTarget.copy(desiredPosition).addScaledVector(forward, 60); desiredTarget.y -= .5;
  } else if (view === 1) {
    desiredPosition.set(state.x, state.y + Math.max(1.25, car.dimensions.height * .88), state.z).addScaledVector(forward, car.dimensions.length * .29);
    desiredTarget.copy(desiredPosition).addScaledVector(forward, 60); desiredTarget.y -= .6;
  } else if (view === 2) {
    desiredPosition.set(state.x, state.y + 10, state.z).addScaledVector(forward, -15);
    desiredTarget.set(state.x, state.y + 1, state.z).addScaledVector(forward, 10);
  } else {
    desiredPosition.set(state.x, state.y + 2.6, state.z).addScaledVector(forward, -8.2 - state.speed * .017);
    desiredTarget.set(state.x, state.y + .85, state.z).addScaledVector(forward, 13 + state.speed * .09);
  }
  const smoothing = snap ? 1 : 1 - Math.exp(-dt * (view === 1 ? 18 : 8));
  cameraPosition.lerp(desiredPosition, smoothing); cameraTarget.lerp(desiredTarget, smoothing);
  camera.position.copy(cameraPosition); camera.lookAt(cameraTarget);
  const fov = menuOpen ? (!['costa', 'alpine', 'canyon', 'grandprix'].includes(track.id) ? 53 : 45) : view === 3 ? 72 : (view === 1 ? 67 : 58 + Math.min(7, state.speed * .14));
  camera.fov = THREE.MathUtils.lerp(camera.fov, fov, snap ? 1 : Math.min(1, dt * 4)); camera.updateProjectionMatrix();
}
function inputState(dt) {
  let steer = Number(held.has('KeyD') || held.has('ArrowRight')) - Number(held.has('KeyA') || held.has('ArrowLeft'));
  let throttle = Number(held.has('KeyW') || held.has('ArrowUp')), brake = Number(held.has('KeyS') || held.has('ArrowDown')), handbrake = Number(held.has('Space'));
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    if (Math.abs(pad.axes[0]) > .08) steer = pad.axes[0];
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0); brake = Math.max(brake, pad.buttons[6]?.value || 0); handbrake = Math.max(handbrake, pad.buttons[1]?.value || 0);
    if (pad.buttons[3]?.pressed && !lastPadButtons[3]) cycleCamera();
    if (pad.buttons[9]?.pressed && !lastPadButtons[9] && active && $('menu').hidden && ![...document.querySelectorAll('dialog')].some(d => d.open)) setPaused(!paused);
    lastPadButtons = pad.buttons.map(b => b.pressed);
  }
  const tiltInput = active && !paused ? (tilt?.sample(dt) || 0) : 0;
  $('tilt-wheel').style.transform = `rotate(${tiltInput * 45}deg)`;
  // Positive yaw turns toward +X; viewed along +Z, the driver's right is -X.
  return { steer: -(touches.steer || steer || tiltInput), throttle: Math.max(throttle, touches.throttle), brake: Math.max(brake, touches.brake), handbrake: Math.max(handbrake, touches.handbrake), stability: $('assist').checked };
}
function drawMap() {
  const canvas = $('track-map'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const scale = Math.min((w - 30) / (maxX - minX), (h - 22) / (maxZ - minZ));
  const px = x => w / 2 + (x - (maxX + minX) / 2) * scale, py = z => h / 2 - (z - (maxZ + minZ) / 2) * scale;
  ctx.clearRect(0, 0, w, h); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [width, color] of [[5, 'rgba(14,20,18,.5)'], [2, 'rgba(238,236,218,.66)']]) {
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.beginPath(); track.samples.forEach((p, i) => { if (i === 0) ctx.moveTo(px(p.x), py(p.z)); else ctx.lineTo(px(p.x), py(p.z)); }); ctx.closePath(); ctx.stroke();
  }
  const start = track.spawn; ctx.fillStyle = '#e6d7b2'; ctx.fillRect(px(start.x) - 4, py(start.z) - 1, 8, 2);
  ctx.fillStyle = '#f0bc64'; ctx.beginPath(); ctx.arc(px(state.x), py(state.z), 4, 0, Math.PI * 2); ctx.fill();
}
function ghostAt(time) {
  if (bestGhost.length < 2 || time > bestStored) return null;
  while (ghostCursor < bestGhost.length - 2 && bestGhost[ghostCursor + 1][0] < time) ghostCursor++;
  const a = bestGhost[ghostCursor], b = bestGhost[ghostCursor + 1], t = clamp((time - a[0]) / Math.max(.001, b[0] - a[0]), 0, 1);
  const dh = Math.atan2(Math.sin(b[4] - a[4]), Math.cos(b[4] - a[4]));
  return { x: THREE.MathUtils.lerp(a[1], b[1], t), y: THREE.MathUtils.lerp(a[2], b[2], t), z: THREE.MathUtils.lerp(a[3], b[3], t), heading: a[4] + dh * t, s: THREE.MathUtils.lerp(a[5], b[5], t) };
}
function createGhost() {
  if (ghost || !bestGhost.length) return;
  ghost = car.group.clone(true); ghost.name = 'Personal best ghost';
  const material = new THREE.MeshBasicMaterial({ color: '#b7e4df', transparent: true, opacity: .13, depthWrite: false });
  ghost.traverse(node => { if (node.isMesh) { node.material = material; node.castShadow = false; node.receiveShadow = false; if (node.geometry.type === 'PlaneGeometry') node.visible = false; } });
  ghost.visible = false; world.scene.add(ghost);
}
function lapComplete() {
  if (state.lastLapValid && state.bestLap !== null && (bestStored === null || state.bestLap < bestStored)) {
    bestStored = state.bestLap; bestGhost = lapSamples; createGhost();
    try { writeLapRecord(localStorage, recordTrackId(), vehicle.id, bestStored, bestGhost); } catch {}
  }
  $('result-time').textContent = formatTime(state.lastLap); $('result-best').textContent = formatTime(bestStored);
  $('result-status').textContent = state.lastLapValid ? (state.lastLap === bestStored ? '新的個人最佳圈速' : '有效圈速') : '本圈有超出賽道，不列入最佳圈速';
  lapSamples = [[0, state.x, state.y, state.z, state.heading, state.s]]; lastSample = 0; ghostCursor = 0; openDialog('result-dialog');
}
function updateHUD() {
  $('speed-value').textContent = Math.round(state.speed * 3.6); $('gear-value').textContent = state.reverse ? 'R' : state.gear;
  $('rpm-bar').style.width = `${clamp(state.rpm / vehicle.redline, 0, 1) * 100}%`;
  $('lap-value').textContent = String(state.lap).padStart(2, '0'); $('lap-time').textContent = formatTime(state.lapTime); $('best-time').textContent = formatTime(bestStored);
  $('grip-value').textContent = state.collision > .1 ? '護欄接觸' : state.reverse ? '倒車 · 油門切回前進' : state.handbrake > .15 && state.speed > 3 ? '手煞車 · 甩尾' : state.offTrack ? '路肩 · 低抓地' : state.slip > .65 ? '側滑 · 反打方向' : season.snow ? '薄雪 · 低抓地' : season.wet >= .2 ? '濕地 · 注意煞車' : '正常';
  $('grip-value').style.color = state.offTrack || state.slip > .65 ? '#f3bd72' : '';
  const previous = bestGhost.find(p => p[5] >= state.s);
  const delta = previous ? state.lapTime - previous[0] : null;
  $('delta-value').textContent = state.invalidLap ? '本圈無效' : delta !== null ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}` : '首圈練習';
  $('delta-value').style.color = state.invalidLap ? '#f3bd72' : delta < 0 ? '#a8d5b6' : '';
  drawMap();
}
function updateAudio() {
  audio?.update({ state, vehicle, driving: active && !paused && $('menu').hidden && !document.hidden });
}
function updateAudioUI() {
  $('sound-button').setAttribute('aria-pressed', String(sound));
  $('audio-enabled').checked = sound;
  $('music-volume').value = Math.round(musicVolume * 100);
  $('effects-volume').value = Math.round(effectsVolume * 100);
  $('music-level').textContent = `${Math.round(musicVolume * 100)}%`;
  $('effects-level').textContent = `${Math.round(effectsVolume * 100)}%`;
  audio?.setMix({ enabled: sound, musicVolume, effectsVolume });
  updateAudio();
}
async function unlockAudio() {
  if (!sound) return;
  try {
    if (!audio) audio = createRacingAudio();
    if (!audio) { toast('此瀏覽器無法播放聲音。'); return; }
    audio.setMix({ enabled: sound, musicVolume, effectsVolume });
    const unlocked = await audio.unlock();
    if (!unlocked) toast('聲音尚未啟動，可按右上角聲音按鈕重試。');
    updateAudio();
  } catch (error) {
    console.warn('Audio could not start:', error);
    toast('聲音尚未啟動，可按右上角聲音按鈕重試。');
  }
}
function toggleSound() {
  sound = !sound; updateAudioUI(); saveSettings();
  if (sound) unlockAudio();
  toast(sound ? '引擎音效與熱血配樂已開啟' : '聲音已關閉');
}
const tiltMessages = {
  off: '橫握手機，左右傾斜轉向', requesting: '請允許感測器，保持手機正中',
  waiting: '保持正中，稍微移動手機', ready: '左右傾斜手機，按住油門',
  flat: '螢幕稍微朝向自己，再左右傾斜', calibrating: '保持正中，等待回正',
  stale: '暫無感測器資料，可切回按鈕', denied: '感測器未獲允許，可用按鈕操作',
  unavailable: '未收到感測器資料，可在 Safari／Chrome 開啟重試',
};
function updateTiltUI(status = tilt?.status || 'off') {
  const enabled = !!tilt?.enabled, pending = !!tilt?.pending;
  $('tilt-enable').textContent = pending ? '正在啟用…' : enabled ? '改用觸控按鈕' : '啟用手機方向盤';
  $('tilt-toggle').textContent = pending ? '正在啟用…' : enabled ? '改用觸控按鈕' : '手機方向盤';
  for (const id of ['tilt-enable', 'tilt-toggle']) { $(id).disabled = pending; $(id).setAttribute('aria-pressed', String(enabled)); }
  $('tilt-setup-status').textContent = tiltMessages[status]; $('tilt-status').textContent = tiltMessages[status];
  $('tilt-panel').hidden = !enabled; $('steer-pad').hidden = enabled;
  document.body.classList.toggle('tilt-enabled', enabled);
  document.querySelector('.menu-controls.touch-copy').textContent = enabled ? '左右傾斜手機轉向 · 按住油門或煞車' : '先啟用手機方向盤 · 或按住左／右轉向';
}
async function toggleTilt() {
  if (tilt.pending) return;
  if (tilt.enabled) { tilt.disable(); clearInput(); toast('已切換為觸控轉向。'); return; }
  const wasDriving = active && !paused;
  if (wasDriving) setPaused(true);
  const enabled = await tilt.enable();
  if (wasDriving && active && $('menu').hidden && !document.hidden && ![...document.querySelectorAll('dialog')].some(d => d.open)) setPaused(false);
  toast(enabled ? '手機方向盤已啟用；目前握姿為回正位置。' : tiltMessages[tilt.status]);
}
function installControls() {
  $('track-select').addEventListener('change', changeSelection); $('car-select').addEventListener('change', changeSelection);
  $('season-select').addEventListener('change', changeSelection);
  tilt = createTiltSteering({ onStatus: updateTiltUI }); updateTiltUI();
  $('tilt-enable').addEventListener('click', toggleTilt); $('tilt-toggle').addEventListener('click', toggleTilt);
  $('tilt-calibrate').addEventListener('click', () => { clearInput(); toast('已回正；保持這個握姿直行，左右傾斜轉向。'); });
  $('start-button').addEventListener('click', () => startDriving());
  $('menu-button').addEventListener('click', showMenu); $('brand-button')?.addEventListener('click', showMenu);
  $('camera-button').addEventListener('click', cycleCamera); $('pause-button').addEventListener('click', () => { if (active && $('menu').hidden) setPaused(!paused); });
  $('resume-button').addEventListener('click', () => { unlockAudio(); setPaused(false); }); $('sound-button').addEventListener('click', toggleSound);
  updateAudioUI();
  $('audio-settings-button').addEventListener('click', () => openDialog('audio-dialog'));
  $('close-audio').addEventListener('click', () => { unlockAudio(); closeDialog('audio-dialog'); });
  $('audio-enabled').addEventListener('change', () => { sound = $('audio-enabled').checked; updateAudioUI(); saveSettings(); if (sound) unlockAudio(); });
  for (const id of ['music-volume', 'effects-volume']) $(id).addEventListener('input', () => {
    musicVolume = Number($('music-volume').value) / 100; effectsVolume = Number($('effects-volume').value) / 100;
    updateAudioUI(); saveSettings();
  });
  $('help-button').addEventListener('click', () => openDialog('help-dialog')); $('close-help').addEventListener('click', () => closeDialog('help-dialog'));
  $('credits-button').addEventListener('click', () => openDialog('credits-dialog')); $('close-credits')?.addEventListener('click', () => closeDialog('credits-dialog'));
  $('result-close').addEventListener('click', () => closeDialog('result-dialog')); $('restart-button').addEventListener('click', () => { closeDialog('result-dialog'); startDriving(true); });
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', () => { if (active && $('menu').hidden) setPaused(false); });
  $('quality').addEventListener('change', configureQuality); $('assist').addEventListener('change', () => { saveSettings(); toast($('assist').checked ? '循跡與穩定輔助已開啟' : '輔助已關閉；出彎時留意後輪抓地。'); });
  for (const button of document.querySelectorAll('[data-paint]')) button.addEventListener('click', () => {
    paint = button.dataset.paint; car?.setPaint(paints[paint]); cockpit?.setPaint(paints[paint]); saveSettings();
    document.querySelectorAll('[data-paint]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  });
  addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target.matches('input, select, textarea') || [...document.querySelectorAll('dialog')].some(d => d.open)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { event.preventDefault(); if (active && !paused) held.add(event.code); }
    if (event.repeat) return;
    if (event.code === 'KeyR') resetOnTrack(); else if (event.code === 'KeyC') cycleCamera(); else if (event.code === 'KeyP' && active && $('menu').hidden) setPaused(!paused); else if (event.code === 'KeyM') toggleSound(); else if (event.code === 'Escape' && active) showMenu();
  });
  addEventListener('keyup', event => held.delete(event.code));
  addEventListener('blur', () => { clearInput(); if (active && $('menu').hidden) setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (active && $('menu').hidden) setPaused(true); } });
  touchControls = installTouchControls({ left: $('steer-left'), right: $('steer-right'), throttle: $('throttle-button'), brake: $('brake-button'), handbrake: $('handbrake-button') }, {
    canDrive: () => active && !paused,
    onChange: input => Object.assign(touches, input),
  });
  $('game').addEventListener('touchstart', event => {
    if (active && $('menu').hidden && !event.target.closest('button, input, select, dialog')) event.preventDefault();
  }, { passive: false });
  $('game').addEventListener('touchend', event => {
    if (active && $('menu').hidden && !event.target.closest('button, input, select, dialog')) event.preventDefault();
  }, { passive: false });
  $('game').addEventListener('dblclick', event => event.preventDefault());
  addEventListener('resize', resize);
}
function frame(now) {
  if (!ready) { last = now; return; }
  const driving = active && !paused && $('menu').hidden;
  if (!driving && last && now - last < 1000 / 30) return;
  const dt = Math.min(.08, last ? (now - last) / 1000 : .016); last = now; elapsed += dt;
  if (driving) averageFrame = averageFrame * .98 + dt * 1000 * .02;
  if (driving && $('quality').value === 'auto' && elapsed > 7 && averageFrame > 42 && renderer.getPixelRatio() > 1) {
    renderer.setPixelRatio(1); resize();
    $('render-device').textContent = `${softwareRenderer() ? '軟體繪圖' : 'GPU · WebGL 2'} · 已調整解析度`;
  }
  const input = inputState(dt);
  if (active && !paused) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      const lap = state.lap, lapTime = state.lapTime; stepDriving(state, input, 1 / 120, track, drivingVehicle); accumulator -= 1 / 120;
      if (state.lap > lap) {
        lapSamples.push([state.lastLap, state.x, state.y, state.z, state.heading, track.length]);
        lapComplete(); break;
      }
      if (state.lapTime < lapTime) { lapSamples = [[0, state.x, state.y, state.z, state.heading, state.s]]; lastSample = 0; ghostCursor = 0; }
      if (state.lapTime - lastSample >= .15 || !lapSamples.length) {
        lapSamples.push([state.lapTime, state.x, state.y, state.z, state.heading, state.s].map(v => Math.round(v * 1000) / 1000)); lastSample = state.lapTime;
        if (lapSamples.length > 8000) lapSamples.shift();
      }
    }
  }
  const pose = roadPose(state.heading, state.roadHeading, state.roadSlope);
  car.group.position.set(state.x, state.y + .06, state.z); car.group.rotation.set(pose.pitch, state.heading, pose.roll, 'YXZ'); car.update({ ...state, steerAngle: state.steeringAngle }, paused || !active ? 0 : dt);
  cockpit.group.visible = view === 3 && active && $('menu').hidden;
  car.group.visible = !cockpit.group.visible;
  cockpit.update(state, vehicle, track, paused || !active ? 0 : dt);
  if (ghost) {
    const p = ghostAt(state.lapTime); ghost.visible = !!p && active && $('menu').hidden && Math.hypot(p.x - state.x, p.z - state.z) > 3;
    if (p) {
      const road = track.sample(p.s), slope = (track.sample(p.s + 2).y - track.sample(p.s - 2).y) / 4, pose = roadPose(p.heading, road.heading, slope);
      ghost.position.set(p.x, p.y + .08, p.z); ghost.rotation.set(pose.pitch, p.heading, pose.roll, 'YXZ');
    }
  }
  updateCamera(dt); world.update(state, elapsed, camera, vehicle); updateAudio();
  if (now - lastHUD > 80) { updateHUD(); lastHUD = now; }
  renderer.render(world.scene, camera);
}
async function boot() {
  prepareSelectionUI();
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .92; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', '海岸環線即時 3D 畫面'); $('view').appendChild(renderer.domElement);
    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .05, 4200);
    cockpit = createCockpit({ mobile }); camera.add(cockpit.group);
    $('loading-label').textContent = `正在準備${track.label}…`; world = await createWorld(renderer, { mobile, track, season }); configureQuality();
    $('loading-label').textContent = `正在載入 ${vehicle.name}…`;
    try { car = await createCar({ renderer, mobile, vehicle: vehicle.id }); }
    catch (error) {
      if (vehicle.id === 'porsche911gt3rs') throw error;
      console.warn('Vehicle asset unavailable, using Porsche 911 GT3 RS:', error);
      vehicle = VEHICLES.porsche911gt3rs; loadRecord(); car = await createCar({ renderer, mobile, vehicle: vehicle.id });
      drivingVehicle = { ...vehicle, grip: vehicle.grip * season.grip };
      toast('車輛模型未完成載入，已改用 Porsche 911 GT3 RS；也可以重新選車。');
    }
    car.setPaint(paints[paint]); cockpit.setPaint(paints[paint]); world.scene.add(car.group, camera);
    createGhost(); car.group.position.set(state.x, state.y + .06, state.z); car.group.rotation.y = state.heading;
    updateCamera(1, true); world.update(state, 0, camera, vehicle); renderer.render(world.scene, camera);
    document.querySelectorAll('[data-paint]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.paint === paint)));
    installControls(); setSelectionLoading(false); state.rpm = vehicle.idle; updateSelectionUI(); updateHUD(); saveSettings();
    renderer.setAnimationLoop(frame);
  } catch (error) {
    console.error('APEX could not start:', error); $('loading-label').textContent = '3D 畫面載入失敗，請重新載入或使用支援 WebGL 2 的瀏覽器。';
    $('start-button').disabled = false; $('start-label').textContent = '重新載入'; $('start-button').onclick = () => location.reload();
  }
}
boot();
