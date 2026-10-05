// 創業之城：引擎測試台（?view=sandbox）。把 city.js 的 API 全部點一遍，另有「自動示範」。
const NAMES = ['半糖日常', '大吉茶行', '青柚手作', '雲港茶事', '八方雲茶', '茶湯會', '森茶研究所', '一杯入魂', '喝一口', '小滿茶室', '白鷺茶舖', '蜜桃烏龍'];
const COLORS = ['#1f9d5c', '#c2413a', '#2f6fd0', '#d98a1f', '#8a4fc2', '#14919b', '#d45d8a', '#5a6b2a'];
const $ = (s, el = document) => el.querySelector(s);

export function initSandbox(city) {
  const map = city.getMapData();
  const lots = map.lots, bld = map.buildings;
  const lotOf = Object.fromEntries(lots.map(l => [l.id, l]));
  let sel = null, selB = null, demo = false, shopCount = 0;
  const origins = bld.filter(b => ['住宅', '辦公', '學校', '捷運站'].includes(b.type));
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const occ = () => city.getMapData().lots.filter(l => l.state !== '空');

  const el = document.createElement('aside'); el.id = 'sb'; el.className = 'panel';
  el.innerHTML = `
  <h2>引擎測試台</h2><div class="sub">點場景裡的店面或建築來選取。左鍵拖曳平移・滾輪縮放・Q/E 或右鍵拖曳旋轉。</div>
  <div class="info" id="sb-sel">尚未選取（點一間店面）</div>
  <section><h3>開店 setShop</h3>
    <div class="row"><input type="text" id="sb-name" value="半糖日常"><input type="color" id="sb-color" value="#1f9d5c">
      <select id="sb-owner"><option value="player">玩家</option><option value="rival">對手</option></select></div>
    <div class="row"><button id="sb-open">開店／換店名</button><button id="sb-close">關店（招租）</button><button id="sb-rand">隨機開 6 家</button></div></section>
  <section><h3>小人 spawnWalker</h3>
    <div class="row"><button id="sb-w1">1 個走去選中店</button><button id="sb-w10">10 個</button><button id="sb-w50">50 個</button><button id="sb-w300">300 個壓力測試</button></div></section>
  <section><h3>排隊 setQueue</h3>
    <div class="row"><button data-q="-1">−1</button><button data-q="1">+1</button><button data-q="5">5</button><button data-q="12">12</button><button data-q="17">17（+5）</button><button data-q="0">清空</button></div></section>
  <section><h3>外送 spawnScooter</h3>
    <div class="row"><button id="sb-sc">從選中店送到隨機建築</button></div></section>
  <section><h3>時間 setClock <span class="num" id="sb-h">17.7</span> 時</h3>
    <div class="row"><input type="range" id="sb-clock" min="0" max="24" step="0.1" value="17.7"></div>
    <div class="row"><button data-h="7">早晨</button><button data-h="12">中午</button><button data-h="17.7">傍晚</button><button data-h="22">夜晚</button></div></section>
  <section><h3>天氣 setWeather</h3>
    <div class="row"><button data-w="sunny">晴</button><button data-w="cloudy">陰</button><button data-w="rain">雨</button></div></section>
  <section><h3>畫質／查詢</h3>
    <div class="row"><button data-qual="high">高畫質</button><button data-qual="low">低畫質</button><button id="sb-dist">隨機兩點步行距離</button></div></section>
  <section><button class="big" id="sb-demo">▶ 自動示範（24 小時）</button></section>
  <section><h3>記錄</h3><div id="sb-log"></div></section>`;
  document.body.appendChild(el);
  const log = (t) => { const l = $('#sb-log'); l.textContent = (t + '\n' + l.textContent).slice(0, 900); };
  const showSel = () => {
    const l = sel && lotOf[sel]; const cur = city.getMapData().lots.find(x => x.id === sel);
    $('#sb-sel').innerHTML = cur ? `<b>${cur.id}</b>・${cur.zone}・${cur.state}${cur.name ? '・' + cur.name : ''}<br>門口 (${cur.x.toFixed(1)}, ${cur.z.toFixed(1)})` : selB ? `<b>${selB.id}</b>・${selB.type}・${selB.floors} 層` : '尚未選取（點一間店面）';
  };
  city.onPick(({ type, id }) => {
    if (type === 'lot') { sel = id; selB = null; const l = city.getMapData().lots.find(x => x.id === id); if (l.name) { $('#sb-name').value = l.name; } log(`onPick → lot ${id}`); }
    else { selB = bld.find(b => b.id === id); sel = null; log(`onPick → building ${id}（${selB.type}）`); }
    showSel();
  });
  const need = () => { if (!sel) { log('請先點選一間店面'); return false; } return true; };
  const open = (id, o = {}) => { city.setShop(id, { owner: o.owner || $('#sb-owner').value, name: o.name || $('#sb-name').value, color: o.color || $('#sb-color').value }); };
  const label = (id) => { const l = city.getMapData().lots.find(x => x.id === id); if (l.state === '空') city.setLabel(id, { title: '招租', sub: l.zone, tone: 'gray' }); else city.setLabel(id, { title: l.name, sub: l.zone, tone: l.state === '玩家' ? 'green' : 'red' }); };
  $('#sb-open').onclick = () => { if (!need()) return; open(sel); label(sel); showSel(); log(`setShop ${sel}`); };
  $('#sb-close').onclick = () => { if (!need()) return; city.setShop(sel, null); label(sel); showSel(); log(`setShop ${sel} null`); };
  const openRandom = (n) => { const emp = city.getMapData().lots.filter(l => l.state === '空'); for (let i = 0; i < n && emp.length; i++) { const l = emp.splice(Math.floor(Math.random() * emp.length), 1)[0]; open(l.id, { owner: 'rival', name: rnd(NAMES), color: rnd(COLORS) }); } };
  $('#sb-rand').onclick = () => { openRandom(6); log('隨機開 6 家'); };
  const walkers = (n, to) => { for (let i = 0; i < n; i++) { const t = to || rnd(occ().length ? occ() : lots).id; const o = rnd(origins); city.spawnWalker([o.x, o.z], t, {}); } };
  $('#sb-w1').onclick = () => { if (need()) walkers(1, sel); };
  $('#sb-w10').onclick = () => { if (need()) walkers(10, sel); };
  $('#sb-w50').onclick = () => { if (need()) walkers(50, sel); };
  $('#sb-w300').onclick = () => { if (!occ().length) openRandom(8); for (let i = 0; i < 300; i++) setTimeout(() => walkers(1), i * 40); log('300 個小人（分散出發）'); };
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { if (!need()) return; const cur = lotOf[sel].q || 0, v = +b.dataset.q; const n = b.dataset.q === '0' ? 0 : (v === -1 || v === 1) ? Math.max(0, cur + v) : v; lotOf[sel].q = n; city.setQueue(sel, n); log(`setQueue ${sel} ${n}`); });
  $('#sb-sc').onclick = () => { if (!need()) return; const b = rnd(origins); city.spawnScooter(sel, [b.x, b.z], { color: $('#sb-color').value }); log(`spawnScooter ${sel} → ${b.id}`); };
  const clk = $('#sb-clock'); const setH = (h) => { city.setClock(h); clk.value = h; $('#sb-h').textContent = (+h).toFixed(1); };
  clk.oninput = () => setH(+clk.value);
  el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => setH(+b.dataset.h));
  el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { city.setWeather(b.dataset.w); log('setWeather ' + b.dataset.w); });
  el.querySelectorAll('[data-qual]').forEach(b => b.onclick = () => { city.setQuality(b.dataset.qual); log('畫質 ' + b.dataset.qual); });
  $('#sb-dist').onclick = () => { const a = rnd(origins), t = rnd(lots); log(`${a.id} → ${t.id}：步行 ${city.walkDistanceToLot([a.x, a.z], t.id).toFixed(1)} 格`); };

  // ---- 自動示範：24 小時隨機人流 ----
  let acc = 0, last = performance.now(), qs = {};
  const HOURS_PER_SEC = 24 / 100;
  const demand = (h) => 0.35 + 3.2 * Math.exp(-((h - 12.5) ** 2) / 7) + 2.4 * Math.exp(-((h - 18.3) ** 2) / 5) + 1.2 * Math.exp(-((h - 8) ** 2) / 3);
  function tick() {
    const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000); last = now;
    if (demo) {
      let h = city.getClock() + dt * HOURS_PER_SEC; setH(h % 24);
      const hh = h % 24, rate = demand(hh) * (1.2 + shopCount * 0.25);
      acc += rate * dt; const shopsNow = occ();
      while (acc >= 1 && shopsNow.length) { acc -= 1; const t = rnd(shopsNow); const o = rnd(origins); city.spawnWalker([o.x, o.z], t.id, {}); }
      for (const s of shopsNow) { // 隊伍長度隨人流起伏
        const want = Math.max(0, Math.round(demand(hh) * (0.4 + Math.random() * 1.6) * (s.state === '玩家' ? 1.3 : 1) - 0.8));
        const cur = qs[s.id] ?? 0; const nx = cur + Math.sign(want - cur) * (Math.random() < dt * 1.5 ? 1 : 0);
        if (nx !== cur) { qs[s.id] = nx; city.setQueue(s.id, nx); }
      }
      if (shopsNow.length && Math.random() < dt * (hh > 11 && hh < 21 ? 0.5 : 0.12)) { const s = rnd(shopsNow), b = rnd(origins); city.spawnScooter(s.id, [b.x, b.z], { color: s.color }); }
    }
    requestAnimationFrame(tick);
  }
  $('#sb-demo').onclick = () => {
    demo = !demo; $('#sb-demo').textContent = demo ? '■ 停止示範' : '▶ 自動示範（24 小時）'; $('#sb-demo').classList.toggle('on', demo);
    if (demo) { if (occ().length < 6) openRandom(8 - occ().length); occ().forEach(l => label(l.id)); shopCount = occ().length; setH(5.5); city.setWeather('sunny'); log('示範開始：100 秒跑完 24 小時'); }
  };
  // 預設先開幾家
  open(lots.find(l => l.id === city.defaultLots.player).id, { owner: 'player', name: '半糖日常', color: '#1f9d5c' });
  open(city.defaultLots.rivalA, { owner: 'rival', name: '大吉茶行', color: '#c2413a' });
  open(city.defaultLots.rivalB, { owner: 'rival', name: '青柚手作', color: '#c2413a' });
  openRandom(3); shopCount = occ().length;
  occ().forEach(l => label(l.id));
  window.__sandbox = { setH, openRandom, walkers, label, occ, origins, lots, startDemo: () => $('#sb-demo').click() };
  requestAnimationFrame(tick);
}
