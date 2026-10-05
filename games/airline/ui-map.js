// World map: pan / zoom SVG. Plate carree, baked Natural Earth 110m land. Markers live in screen px (scaled by 1/k).
import { CITIES } from './backend.mjs';
import { LAND_PATH, MAP_W, MAP_H, project } from './landmap.mjs';
import { pick, tr } from './ui-util.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, parent) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; };

export function createMap(box, { hubId, onCityClick }) {
  const hub = CITIES[hubId] || Object.values(CITIES)[0];
  const svg = el('svg', { role: 'group', 'aria-label': tr('世界地圖', 'World map') });
  box.appendChild(svg);
  const world = el('g', {}, svg);
  for (const dx of [-3600, 0, 3600, 7200]) { const p = el('path', { d: LAND_PATH, class: 'land', transform: `translate(${dx} 0)` }, world); p.setAttribute('aria-hidden', 'true'); }
  const arcLayer = el('g', {}, svg), cityLayer = el('g', {}, svg);

  // city positions relative to hub (wrap longitude so Pacific routes stay short)
  const pos = {};
  for (const [id, c] of Object.entries(CITIES)) {
    let lon = c.lon + 360 * Math.round((hub.lon - c.lon) / 360);
    pos[id] = project(lon, c.lat);
  }
  const hubPos = project(hub.lon, hub.lat);
  const view = { cx: hubPos[0], cy: hubPos[1], k: 1 };
  let W = 400, H = 400, current = { routes: [], rivals: [], selected: null }, moved = false;

  const cityEls = {};
  for (const [id, c] of Object.entries(CITIES)) {
    const g = el('g', { class: 'city', tabindex: 0, role: 'button', 'data-city': id }, cityLayer);
    const isHub = id === hubId || (c.lat === hub.lat && c.lon === hub.lon);
    if (isHub) g.classList.add('hub');
    const r = isHub ? 8 : 4 + Math.min(4.5, Math.sqrt(c.pop) * 0.75);
    el('circle', { class: 'hit', r: 16 }, g);
    el('circle', { class: 'ring', r: r + 5 }, g);
    el('circle', { class: 'dot', r }, g);
    const t = el('text', { x: r + 5, y: 4 }, g);
    t.textContent = pick(c);
    g.addEventListener('click', () => { if (!moved) onCityClick(id); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCityClick(id); } });
    cityEls[id] = { g, t, pop: c.pop, isHub, r, label: t.textContent };
  }

  const kMin = () => Math.max(W / (3000), H / MAP_H * 0.6);   // widest: ~300 deg wide
  const kMax = () => W / 200;                                  // closest: ~20 deg wide
  function clamp() {
    view.k = Math.min(kMax(), Math.max(kMin(), view.k));
    const vw = W / view.k, vh = H / view.k;
    view.cx = Math.min(5600 - vw / 2, Math.max(-2000 + vw / 2, view.cx));
    view.cy = vh >= MAP_H ? MAP_H / 2 : Math.min(MAP_H - vh / 2, Math.max(vh / 2, view.cy));
  }
  function apply() {
    clamp();
    const vw = W / view.k, vh = H / view.k;
    svg.setAttribute('viewBox', `${view.cx - vw / 2} ${view.cy - vh / 2} ${vw} ${vh}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const [id, o] of Object.entries(cityEls)) {
      const [x, y] = pos[id];
      o.g.setAttribute('transform', `translate(${x} ${y}) scale(${1 / view.k})`);
    }
    layoutLabels();
  }
  // Label collision avoidance: greedy by priority; try right, then left, then above/below; hide what still collides.
  function layoutLabels() {
    const FS = 11.5, vw = W / view.k, vh = H / view.k, x0 = view.cx - vw / 2, y0 = view.cy - vh / 2;
    const wOf = (s) => { let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 255 ? FS : FS * 0.58; return w + 4; };
    const items = Object.entries(cityEls).map(([id, o]) => {
      const must = o.isHub || o.g.classList.contains('on') || o.g.classList.contains('sel') || o.g.classList.contains('riv');
      const sx = (pos[id][0] - x0) * view.k, sy = (pos[id][1] - y0) * view.k;
      return { id, o, must, sx, sy, vis: sx > -40 && sx < W + 40 && sy > -20 && sy < H + 20 };
    });
    const rank = (i) => (i.o.isHub ? 4e3 : i.o.g.classList.contains('sel') ? 3e3 : i.must ? 2e3 : 0) + i.o.pop;
    items.sort((a, b) => rank(b) - rank(a));
    const placedLabels = [];
    for (const i of items) {
      const o = i.o, show = i.must || o.pop >= 12 || (view.k > W / 1100 && o.pop >= 4) || view.k > W / 520;
      if (!show || !i.vis) { o.t.style.display = 'none'; continue; }
      const w = wOf(o.label), h = FS + 3, gap = o.r + 4;
      const cands = [['start', gap, 4, i.sx + gap, i.sy - h / 2], ['end', -gap, 4, i.sx - gap - w, i.sy - h / 2], ['middle', 0, -gap - 2, i.sx - w / 2, i.sy - gap - h], ['middle', 0, gap + FS, i.sx - w / 2, i.sy + gap]];
      let pick_ = null;
      for (const c of cands) { const b = { x: c[3], y: c[4], w, h }; if (!placedLabels.some((p) => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y) && !dotHit(b, i)) { pick_ = [c, b]; break; } }
      if (!pick_ && i.must) pick_ = [cands[0], { x: cands[0][3], y: cands[0][4], w, h }];
      if (!pick_) { o.t.style.display = 'none'; continue; }
      const [c, b] = pick_; placedLabels.push(b);
      o.t.style.display = ''; o.t.setAttribute('text-anchor', c[0]); o.t.setAttribute('x', c[1]); o.t.setAttribute('y', c[2]);
    }
    function hit1(b, p) { return b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y; }
    function dotHit(b, self) { return items.some((j) => j !== self && j.vis && hit1(b, { x: j.sx - j.o.r, y: j.sy - j.o.r, w: 2 * j.o.r, h: 2 * j.o.r })); }
  }
  function fit() {
    const wDeg = W < 600 ? 90 : 120;
    view.k = W / (wDeg * 10);
    view.cx = hubPos[0] + (W < 600 ? 160 : 260); view.cy = hubPos[1] + 60;
    apply();
  }
  function arcPath(id) {
    const [x1, y1] = hubPos, [x2, y2] = pos[id];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(260, len * 0.22);
    const nx = -dy / len, ny = dx / len, s = ny > 0 ? -1 : 1; // always bow upward
    return `M${x1} ${y1} Q${mx + nx * bend * s} ${my + ny * bend * s} ${x2} ${y2}`;
  }
  function update(next) {
    current = { ...current, ...next };
    arcLayer.replaceChildren();
    for (const id of current.rivals || []) if (pos[id]) { const a = el('path', { d: arcPath(id), class: 'arc rival', 'stroke-width': 2 }, arcLayer); a.setAttribute('aria-hidden', 'true'); }
    for (const r of current.routes || []) if (pos[r.city]) { const a = el('path', { d: arcPath(r.city), class: 'arc', 'stroke-width': Math.min(9, 2 + r.weekly * 0.45) }, arcLayer); a.setAttribute('aria-hidden', 'true'); }
    const mine = new Set((current.routes || []).map((r) => r.city)), riv = new Set(current.rivals || []);
    for (const [id, o] of Object.entries(cityEls)) {
      o.g.classList.toggle('on', mine.has(id));
      o.g.classList.toggle('riv', riv.has(id));
      o.g.classList.toggle('sel', current.selected === id);
      const c = CITIES[id], rt = (current.routes || []).find((r) => r.city === id);
      o.g.setAttribute('aria-label', `${pick(c)}${rt ? tr(`，已開航，每週 ${rt.weekly} 班`, `, route open, ${rt.weekly}/wk`) : ''}${riv.has(id) ? tr('，對手有航線', ', rival present') : ''}`);
    }
    apply();
  }

  // ---- gestures ----
  const ptrs = new Map(); let last = null;
  const toUnits = (px, py) => { const r = svg.getBoundingClientRect(); return [view.cx + (px - r.left - r.width / 2) / view.k, view.cy + (py - r.top - r.height / 2) / view.k]; };
  function zoomAt(factor, px, py) {
    const [ux, uy] = toUnits(px, py), k0 = view.k;
    view.k = Math.min(kMax(), Math.max(kMin(), view.k * factor));
    const r = svg.getBoundingClientRect();
    view.cx = ux - (px - r.left - r.width / 2) / view.k; view.cy = uy - (py - r.top - r.height / 2) / view.k;
    if (k0 !== view.k) apply(); else apply();
  }
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    moved = false; last = ptrs.size === 2 ? pinchInfo() : null;
  });
  svg.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1) {
      if (!moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) return;
      if (!moved) { moved = true; try { svg.setPointerCapture(e.pointerId); } catch {} svg.classList.add('drag'); }
      view.cx -= dx / view.k; view.cy -= dy / view.k; p.x = e.clientX; p.y = e.clientY; apply();
    } else if (ptrs.size === 2) {
      moved = true; p.x = e.clientX; p.y = e.clientY;
      const now = pinchInfo();
      if (last && last.d > 0) { zoomAt(now.d / last.d, now.x, now.y); view.cx -= (now.x - last.x) / view.k; view.cy -= (now.y - last.y) / view.k; apply(); }
      last = now;
    }
  });
  const end = (e) => { ptrs.delete(e.pointerId); last = null; svg.classList.remove('drag'); setTimeout(() => { if (!ptrs.size) moved = false; }, 0); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  function pinchInfo() { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; }
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });

  const ro = new ResizeObserver(() => { const r = box.getBoundingClientRect(); if (!r.width) return; const first = W === 400 && H === 400; W = r.width; H = r.height; if (first || !view.k) fit(); else apply(); });
  ro.observe(box);
  const r0 = box.getBoundingClientRect(); if (r0.width) { W = r0.width; H = r0.height; }
  fit();

  return {
    update,
    zoomBy: (f) => zoomAt(f, W / 2 + box.getBoundingClientRect().left, H / 2 + box.getBoundingClientRect().top),
    recenter: fit,
    focus(id) { if (!pos[id]) return; view.cx = (hubPos[0] + pos[id][0]) / 2; view.cy = (hubPos[1] + pos[id][1]) / 2; apply(); },
    destroy() { ro.disconnect(); svg.remove(); },
  };
}
