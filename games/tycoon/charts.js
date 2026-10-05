// 圖表：inline SVG，無外部函式庫。配色依 dataviz skill（深色面、固定色序、2px 間隙、4px 圓角資料端）
const SURFACE = '#1c1a2e';
const GRID = 'rgba(255,255,255,.08)';
const fmt1 = (n) => n.toFixed(1);
const tip = () => document.getElementById('tip');

function showTip(e, html) {
  const t = tip(); t.innerHTML = html; t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = e.clientX + 16, y = e.clientY - h - 10;
  if (x + w > innerWidth - 8) x = e.clientX - w - 16;
  if (y < 8) y = e.clientY + 16;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
const hideTip = () => tip().classList.remove('on');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rowHtml = (color, name, val) => `<div class="r"><i style="background:${color}"></i><span>${esc(name)}</span><b class="num">${val}</b></div>`;

// 只圓上端的長條（底部切齊基線）
function topRound(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function stacked(el, { months, channels, yMax = 60, yTicks = [0, 20, 40, 60] }) {
  const W = 700, H = 250, L = 40, Rr = 8, T = 20, B = 26;
  const iw = W - L - Rr, ih = H - T - B;
  const band = iw / months.length, bw = 24;
  const y = (v) => T + ih - (v / yMax) * ih;
  let g = '';
  for (const t of yTicks) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" class="num">${t}</text>`;
  months.forEach((m, i) => {
    const cx = L + band * i + band / 2;
    g += `<text x="${cx}" y="${H - 7}" text-anchor="middle">${m}月</text>`;
    let acc = 0; const parts = [];
    channels.forEach((c, k) => {
      const v = c.data[i]; if (v <= 0) return;
      const y1 = y(acc + v), y0 = y(acc);
      const top = channels.slice(k + 1).every(cc => cc.data[i] <= 0);
      const gap = acc === 0 ? 0 : 2;
      const hh = Math.max(1, y0 - y1 - gap);
      parts.push(top ? `<path d="${topRound(cx - bw / 2, y1, bw, hh, 4)}" fill="${c.color}"/>` : `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${hh}" fill="${c.color}"/>`);
      acc += v;
    });
    const total = channels.reduce((s, c) => s + c.data[i], 0);
    g += `<g class="bar" data-i="${i}">${parts.join('')}<rect x="${cx - band / 2}" y="${T}" width="${band}" height="${ih + 4}" fill="transparent"/></g>`;
    if (i === months.length - 1) g += `<text x="${cx}" y="${y(total) - 8}" text-anchor="middle" class="val num">${fmt1(total)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="12 個月營收，依通路堆疊，單位萬元">${g}</svg>`;
  el.querySelectorAll('.bar').forEach(b => {
    const i = +b.dataset.i;
    b.addEventListener('pointermove', (e) => {
      const total = channels.reduce((s, c) => s + c.data[i], 0);
      showTip(e, `<div class="t">${months[i]} 月・營收（萬）</div>` + channels.slice().reverse().map(c => rowHtml(c.color, c.name, fmt1(c.data[i]))).join('') + `<div class="r" style="border-top:1px solid var(--line-soft);margin-top:3px;padding-top:3px"><span>合計</span><b class="num">${fmt1(total)}</b></div>`);
      b.style.opacity = 1; el.querySelectorAll('.bar').forEach(o => { if (o !== b) o.style.opacity = .55; });
    });
    b.addEventListener('pointerleave', () => { hideTip(); el.querySelectorAll('.bar').forEach(o => o.style.opacity = 1); });
  });
}

export function lines(el, { months, series, yMin = 10, yMax = 40, yTicks = [10, 20, 30, 40] }) {
  const W = 470, H = 250, L = 38, Rr = 92, T = 20, B = 26;
  const iw = W - L - Rr, ih = H - T - B;
  const x = (i) => L + (iw * i) / (months.length - 1);
  const y = (v) => T + ih - ((v - yMin) / (yMax - yMin)) * ih;
  let g = '';
  for (const t of yTicks) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(t)}" y2="${y(t)}" stroke="${GRID}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" class="num">${t}%</text>`;
  months.forEach((m, i) => { if ((months.length - 1 - i) % 2 === 0) g += `<text x="${x(i)}" y="${H - 7}" text-anchor="middle">${m}月</text>`; });
  g += '<g id="xh" style="display:none"><line y1="' + T + '" y2="' + (T + ih) + '" stroke="rgba(255,255,255,.28)"/></g>';
  series.forEach(s => {
    const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('');
    if (s.me) g += `<path d="${d}L${x(months.length - 1)},${y(yMin)}L${x(0)},${y(yMin)}Z" fill="${s.color}" opacity=".12"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // 末端圓點（2px 面色環）與直接標籤，標籤避開彼此
  const ends = series.map(s => ({ s, yy: y(s.data[s.data.length - 1]) })).sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 34) ends[k].yy = ends[k - 1].yy + 34;
  ends.forEach(({ s, yy }) => {
    const ex = x(months.length - 1), ey = y(s.data[s.data.length - 1]);
    g += `<circle cx="${ex}" cy="${ey}" r="4.5" fill="${s.color}" stroke="${SURFACE}" stroke-width="2"/>`;
    if (Math.abs(yy - ey) > 2) g += `<path d="M${ex + 4},${ey}L${ex + 9},${yy + 3}" stroke="${s.color}" stroke-width="1" fill="none" opacity=".7"/>`;
    g += `<text x="${ex + 12}" y="${yy - 2}" class="lab">${esc(s.name)}</text><text x="${ex + 12}" y="${yy + 13}" class="val num">${fmt1(s.data[s.data.length - 1])}%</text>`;
  });
  g += `<rect id="hit" x="${L}" y="${T}" width="${iw}" height="${ih}" fill="transparent"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="市占率 12 個月走勢">${g}</svg>`;
  const svg = el.querySelector('svg'), hit = el.querySelector('#hit'), xh = el.querySelector('#xh');
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(months.length - 1, Math.round(((px - L) / iw) * (months.length - 1))));
    xh.style.display = ''; xh.querySelector('line').setAttribute('x1', x(i)); xh.querySelector('line').setAttribute('x2', x(i));
    showTip(e, `<div class="t">${months[i]} 月・市占率</div>` + series.map(s => rowHtml(s.color, s.name, fmt1(s.data[i]) + '%')).join(''));
  });
  hit.addEventListener('pointerleave', () => { hideTip(); xh.style.display = 'none'; });
}

export function spark(data, color, w = 84, h = 28) {
  const min = Math.min(...data), max = Math.max(...data), p = 3;
  const pts = data.map((v, i) => [p + (i * (w - 2 * p)) / (data.length - 1), p + (h - 2 * p) * (1 - (v - min) / (max - min || 1))]);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
  const e = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}L${e[0]},${h}L${pts[0][0]},${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${e[0]}" cy="${e[1]}" r="3.5" fill="${color}" stroke="${SURFACE}" stroke-width="2"/></svg>`;
}
