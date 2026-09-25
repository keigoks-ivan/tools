// Audition page for audio.js: every music cue (incl. a loop-seam check), every SFX variant, and scripted
// event scenes that run through the real mapEvent → voice limiter → ducking path.
//   ?selftest=1  (headless check) unlock without a click, play everything once, write results into #log
import { createAudio, SOUNDS, MUSIC_TRACKS } from './audio.js?v=20260925d';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const audio = createAudio({ baseUrl: '../assets/audio/march/' });
window.__audio = audio;
const LABELS = {
  market: '入口市集', plaza: '廣場／階梯', boss: '魂門守將', victory: '勝利', defeat: '敗北',
  swing_light: '輕斬揮空', swing_heavy: '重斬', swing_musou: '無雙亂舞連斬', hit_light: '輕擊命中', hit_heavy: '重擊命中',
  hit_finisher: '終結重擊', hit_prop: '打木箱', hit_lantern: '打妖燈', guard: '擋', guard_break: '破', oni: '鬼兵聲',
  boss_roar: '守將咆哮', boss_grunt: '守將出招', soul_burst: '擊倒・魂散', launch: '擊飛', land: '落地', jump: '跳躍',
  plunge: '下墜衝擊', pickup_charm: '護身符', pickup_lamp: '靈燈', pickup_crystal: '魂晶', musou_start: '無雙發動（1＝真）',
  musou_finish: '無雙終結爆發（1＝真）', officer_down: '敵將擊破', officer_appear: '敵將登場', gate_open: '結界開啟',
  gate_close: '結界封閉', lantern_break: '妖燈破壞', lamp_hit: '魂燈受擊', lamp_break: '魂燈破壞', lamp_secured: '魂燈守住',
  ui_click: 'UI', hurt: '受傷', dodge: '閃避', sidestep: '鬼兵閃身', boss_slam: '守將砸地', boss_sweep: '守將橫掃',
  boss_jump: '守將躍起', boss_intro: '守將現身', telegraph: '出招警示', summon: '召喚', break_wood: '木箱破', break_jar: '酒甕破',
  drop: '掉落', heal: '回復',
};

let manifest = null;
let slow = false;
const log = line => { $('log').textContent += line + '\n'; };
const wait = ms => new Promise(r => setTimeout(r, ms));

function renderStatus() {
  const s = audio.state();
  const m = audio.meter();
  $('status').textContent = (m ? `out ${m.rms.toFixed(1)} dB · ` : '') + `context ${s.contextState} · track ${s.track ?? '—'} · sfx ${s.sfxReady ? 'ready' : '…'} · voices ${s.voices}` +
    ` · muted ${s.muted} · music ${s.music.toFixed(2)} · sfx ${s.sfx.toFixed(2)}`;
  $('mute').setAttribute('aria-pressed', String(s.muted));
  $('mute').textContent = s.muted ? '已靜音' : '靜音';
}
audio.subscribe(renderStatus);
setInterval(renderStatus, 500);

$('vmusic').value = audio.state().music;
$('vsfx').value = audio.state().sfx;
$('vmusic').addEventListener('input', e => audio.setVolume({ music: Number(e.target.value) }));
$('vsfx').addEventListener('input', e => audio.setVolume({ sfx: Number(e.target.value) }));
$('unlock').addEventListener('click', () => { audio.unlock(); audio.ui(); });
$('mute').addEventListener('click', () => { audio.unlock(); audio.toggleMuted(); });
$('slow').addEventListener('click', () => { slow = !slow; $('slow').setAttribute('aria-pressed', String(slow)); });
$('pause').addEventListener('click', e => { const on = e.target.getAttribute('aria-pressed') !== 'true'; e.target.setAttribute('aria-pressed', String(on)); audio.setPaused(on); });

let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  audio.update(dt, slow ? 0.2 : 1, { x: 640, y: 500 });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function button(text, onClick, parent) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = text;
  b.addEventListener('click', () => { audio.unlock(); onClick(); });
  parent.append(b);
  return b;
}

/** Plays a loop from `offset` (s into the file) using the same buffer path as the game — for the seam check. */
async function playSeam(name) {
  audio.unlock();
  const ctx = audio.context;
  const entry = manifest.music[name];
  const res = await fetch('../assets/audio/march/' + entry.file);
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  const { smoothLoopSeam } = await import('./audio.js?v=20260925d');
  const ch = []; for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
  smoothLoopSeam(ch, buf.sampleRate, entry.loopStart, entry.loopEnd);
  audio.stopMusic(0.3);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.loopStart = entry.loopStart; src.loopEnd = entry.loopEnd;
  src.connect(ctx.destination);
  src.start(ctx.currentTime + 0.05, entry.loopEnd - 4);
  setTimeout(() => { try { src.stop(); } catch { /* ended */ } }, 9000);
  log(`seam ${name}: playing ${entry.loopEnd - 4}s → wrap at ${entry.loopEnd}s → ${entry.loopStart}s (stops after 9 s)`);
}

const SCENES = {
  '五連斬＋命中': async () => {
    for (let combo = 1; combo <= 5; combo++) {
      const hits = [[0.19], [0.18], [0.13, 0.31, 0.67], [0.19, 0.68], [0.14, 0.31, 0.56, 1.47]][combo - 1];
      let t0 = 0;
      for (let i = 0; i < hits.length; i++) {
        await wait((hits[i] - t0) * 1000); t0 = hits[i];
        const last = i === hits.length - 1;
        audio.onEvent({ type: 'swing', kind: 'attack', combo, index: i, last });
        audio.onEvent({ type: 'hit', source: last && combo === 5 ? 'heavy' : 'attack', enemyId: 1, x: 700, y: 480 });
      }
      await wait(250);
    }
    audio.onEvent({ type: 'kill', role: 'grunt', enemyId: 1, x: 700, y: 480 });
  },
  '群毆：同一幀 12 命中': async () => {
    for (let i = 0; i < 12; i++) audio.onEvent({ type: 'hit', source: 'special', enemyId: 100 + i, x: 400 + i * 50, y: 450 });
    await wait(80);
    for (let i = 0; i < 12; i++) audio.onEvent({ type: 'kill', role: 'grunt', enemyId: 100 + i, x: 400 + i * 50, y: 450 });
  },
  '無雙亂舞（標準）': () => flurry(false),
  '真・無雙亂舞': () => flurry(true),
  '擋 → 破 → 敵將擊破': async () => {
    audio.onEvent({ type: 'officer', x: 640, y: 380 });
    await wait(900);
    for (let i = 0; i < 3; i++) { audio.onEvent({ type: 'swing', kind: 'attack', combo: i + 1, index: 0, last: true }); audio.onEvent({ type: 'guard', x: 640, y: 420 }); await wait(420); }
    audio.onEvent({ type: 'swing', kind: 'heavy', combo: 1, index: 0, last: true });
    audio.onEvent({ type: 'guardBreak', x: 640, y: 420 }); audio.onEvent({ type: 'hit', source: 'heavy', x: 640, y: 420 });
    await wait(700);
    audio.onEvent({ type: 'kill', role: 'officer', x: 640, y: 420 }); audio.onEvent({ type: 'officerDown', x: 640, y: 420 });
  },
  '跳躍・空中斬・下墜': async () => {
    audio.onEvent({ type: 'jump' }); await wait(200);
    audio.onEvent({ type: 'airSlash', index: 0 }); await wait(250);
    audio.onEvent({ type: 'airSlash', index: 1 }); await wait(150);
    audio.onEvent({ type: 'plunge' }); await wait(180);
    audio.onEvent({ type: 'land', plunge: true });
  },
  '守將登場＋攻勢': async () => {
    audio.onEvent({ type: 'segment', index: 3 });
    audio.onEvent({ type: 'bossIntro', x: 640, y: 300 }); await wait(3200);
    audio.onEvent({ type: 'telegraph', role: 'boss', x: 640, y: 350 }); await wait(700);
    audio.onEvent({ type: 'enemyAttack', role: 'boss', x: 640, y: 350 }); audio.onEvent({ type: 'bossSweep', x: 640, y: 350 }); await wait(1200);
    audio.onEvent({ type: 'bossJump', x: 640, y: 350 }); await wait(900);
    audio.onEvent({ type: 'bossSlam', x: 640, y: 450 }); await wait(1400);
    audio.onEvent({ type: 'bossPhase' }); audio.onEvent({ type: 'roar', x: 640, y: 350 });
  },
  '妖燈與魂燈': async () => {
    for (let i = 0; i < 3; i++) { audio.onEvent({ type: 'hit', role: 'lantern', x: 500, y: 400 }); await wait(300); }
    audio.onEvent({ type: 'lanternBroken', x: 500, y: 400 }); await wait(1400);
    audio.onEvent({ type: 'lampHit', x: 640, y: 380 }); await wait(700);
    audio.onEvent({ type: 'lampHit', x: 640, y: 380 }); await wait(900);
    audio.onEvent({ type: 'lampBroken', x: 640, y: 380 }); await wait(2200);
    audio.onEvent({ type: 'lampSecured', x: 640, y: 380 }); await wait(2000);
    audio.onEvent({ type: 'gateOpen', x: 640, y: 200 });
  },
  '拾取三種': async () => {
    for (const kind of ['bun', 'bigBun', 'wine']) { audio.onEvent({ type: 'pickup', kind }); await wait(1300); }
  },
  '勝利': () => audio.onEvent({ type: 'clear' }),
  '敗北': () => audio.onEvent({ type: 'fail' }),
};

async function flurry(isTrue) {
  const dur = isTrue ? 5.0 : 4.2, swings = isTrue ? 12 : 10, impact = isTrue ? 4.4 : 3.6;
  audio.onEvent({ type: 'musouStart', true: isTrue, duration: dur });
  const t0 = performance.now();
  for (let i = 0; i < swings; i++) {
    const at = 0.55 + i * ((isTrue ? 4.0 : 3.3) - 0.55) / (swings - 1);
    await wait(Math.max(0, at * 1000 - (performance.now() - t0)));
    audio.onEvent({ type: 'swing', kind: 'special', flurry: true, true: isTrue, index: i, last: i === swings - 1 });
    for (let k = 0; k < 4; k++) audio.onEvent({ type: 'hit', source: 'special', x: 560 + k * 60, y: 460 });
  }
  slow = true;
  await wait(Math.max(0, impact * 1000 - (performance.now() - t0)));
  audio.onEvent({ type: 'musouFinish', true: isTrue });
  for (let k = 0; k < 6; k++) audio.onEvent({ type: 'kill', role: 'grunt', x: 500 + k * 60, y: 460 });
  await wait(700); slow = false;
  await wait(Math.max(0, dur * 1000 - (performance.now() - t0)));
  audio.onEvent({ type: 'musouEnd', true: isTrue });
}

async function init() {
  manifest = await (await fetch('../assets/audio/march/manifest.json', { cache: 'no-cache' })).json();
  for (const name of MUSIC_TRACKS) {
    const e = manifest.music[name];
    button(`${LABELS[name]} ${e.loop ? `${(e.loopEnd - e.loopStart).toFixed(1)}s` : `${e.duration}s`}`, () => audio.playMusic(name, { fadeIn: 0.3 }), $('music'));
    if (e.loop) button(`${LABELS[name]}・接縫`, () => playSeam(name), $('music'));
  }
  button('停止音樂', () => audio.stopMusic(0.6), $('music'));
  for (const [name, fn] of Object.entries(SCENES)) button(name, fn, $('scenes'));
  for (const [id, variants] of Object.entries(manifest.sfx.sounds)) {
    const card = document.createElement('div');
    card.className = 'snd';
    card.innerHTML = `<b>${LABELS[id] || id} <small>${id} · max ${SOUNDS[id]?.max}</small></b><div class="row"></div>`;
    variants.forEach(([, dur], v) => button(`${v + 1} · ${dur.toFixed(2)}s`, () => audio.play(id, { variant: v }), card.querySelector('.row')));
    $('sfx').append(card);
  }
  if (params.get('selftest') === '1') selftest();
}

/** Headless check (Chrome with --autoplay-policy=no-user-gesture-required): exercises every path. */
async function selftest() {
  const ok = await audio.unlock();
  log(`unlock sfxReady=${ok} ctx=${audio.state().contextState}`);
  let played = 0, failed = [];
  for (const [id, variants] of Object.entries(manifest.sfx.sounds)) {
    for (let v = 0; v < variants.length; v++) { if (audio.play(id, { variant: v })) played++; else failed.push(`${id}#${v}`); await wait(35); }
  }
  log(`sfx played ${played} blocked ${failed.length} ${failed.slice(0, 8).join(' ')}`);
  const level = async (ms = 1200) => {
    let rms = -120, peak = -120;
    for (let t = 0; t < ms; t += 50) { const m = audio.meter(); if (m) { rms = Math.max(rms, m.rms); peak = Math.max(peak, m.peak); } await wait(50); }
    return `max RMS ${rms.toFixed(1)} dBFS, peak ${peak.toFixed(1)} dBFS`;
  };
  await wait(1500);
  log(`silence after sfx: ${await level(300)}`);
  for (const name of MUSIC_TRACKS) {
    audio.playMusic(name, { fadeIn: 0.1 });
    for (let i = 0; i < 60 && audio.state().track !== name; i++) await wait(100);
    log(`music ${name}: ${audio.state().track === name ? 'playing' : 'NOT PLAYING'} · ${await level(1500)}`);
  }
  audio.stopMusic(0.05); await wait(400);
  for (const id of ['hit_light', 'hit_heavy', 'musou_finish', 'ui_click']) {
    await wait(700);
    audio.play(id);
    log(`sfx ${id}: ${await level(400)}`);
  }
  audio.setMuted(true); log(`muted → ctx ${audio.state().contextState}`);
  audio.setMuted(false); await wait(300); log(`unmuted → ctx ${audio.state().contextState} track ${audio.state().track}`);
  log('SELFTEST DONE');
}

init().catch(error => log('init failed: ' + error));
