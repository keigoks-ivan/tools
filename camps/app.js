import { buildDb, search, toTWD, kidFit, sessionSpan } from './lib/core.mjs';

const FILES = ['providers', 'programs', 'locations', 'sessions', 'reviews', 'conflicts', 'holidays', 'fx'];
const KL = ['Kuala Lumpur', 'Petaling Jaya', 'Subang Jaya', 'Puchong', 'Shah Alam', 'Selangor-other'];
const CITY_CHIPS = [
  ['kl', '大吉隆坡', KL, '含 PJ、Subang、Puchong、Shah Alam'],
  ['nsn', '森美蘭', ['Negeri Sembilan']],
  ['png', '檳城', ['Penang']],
  ['jb', '新山', ['Johor Bahru']],
  ['kk', '亞庇', ['Kota Kinabalu']],
  ['lgk', '浮羅交怡', ['Langkawi']],
  ['oth', '其他', ['other', 'Perak', 'Melaka', 'Kuching']],
];
const FORMATS = { day: '日營', residential: '住宿營', family_with_parent: '親子同行', parent_optional: '家長可同行' };
const CATEGORIES = {
  english: '英語', stem: '科學／STEM', arts: '藝術', sport: '運動', multi_activity: '綜合活動',
  outdoor: '戶外', residential: '住宿', leadership: '領導力', family: '親子', travel: '遊學旅行',
};
const BASIS = { per_week: '每週', per_2weeks: '每兩週', per_day: '每天', per_camp: '每梯', per_session: '每次' };
const STATUS = { confirmed_target_year: '日期已公布', confirmed_other_year: '往年日期', pattern_estimated: '推估', unknown: '查不到日期' };
const CONF = { high: ['高', 'hi'], medium: ['中', 'mid'], low: ['低', 'lo'] };
const INCLUDES = { lunch: '午餐', snacks: '點心', materials: '教材', accommodation: '住宿', airport_transfer: '機場接送', insurance: '保險', tshirt: 'T 恤' };
const PLATFORM = {
  google_maps: 'Google 地圖', facebook: 'Facebook', languagecourse_net: 'languagecourse.net', tripadvisor: 'Tripadvisor',
  little_steps: 'Little Steps', reddit: 'Reddit', lowyat: 'Lowyat 論壇', blog: '部落格', pixnet: 'PIXNET', mobile01: 'Mobile01',
  dcard: 'Dcard', backpackers: '背包客棧', xiaohongshu: '小紅書', zhihu: '知乎', trustpilot: 'Trustpilot', edarabia: 'Edarabia', other: '其他',
};
const THEMES = {
  teachers: '師資', curriculum: '課程內容', kids_experience: '孩子感受', safety_care: '安全與照顧', food: '餐食',
  facilities: '環境設施', admin: '行政溝通', value: '價格與退費', classmates: '同學組成', accommodation: '住宿', transport: '交通', other: '其他',
};
const DEFAULT_Q = {
  start: '2027-01-17', end: '2027-02-08', cities: ['kl'],
  kids: [{ name: '孩子 1', birth: '2016-05' }, { name: '孩子 2', birth: '2020-05' }],
  filters: {},
};
const STORE = 'camps-query-v1';

let db;
let raw;
let lastCards = new Map();
const compare = new Set();

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const WD = '日一二三四五六';
function fmtD(s, year = false) {
  if (!s) return '?';
  const [y, m, d] = s.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${year ? y + '/' : ''}${m}/${d}（${wd}）`;
}
const hostOf = (u) => u?.match(/^https?:\/\/(?:www\.)?([^/]+)/)?.[1];
const platName = (r) => (r.platform === 'other' ? hostOf(r.url) || '其他' : r.platform === 'blog' && hostOf(r.url) ? `部落格 ${hostOf(r.url)}` : PLATFORM[r.platform] || r.platform);
const AUTHOR = { staff: '業者自述', editorial: '聚合站編輯', agent: '代理商刊登' };
const cardId = (it) => 'c-' + `${it.program.id}--${it.session.location_id || 'x'}`.replace(/[^a-z0-9-]/gi, '-');

// ---------- load

async function load() {
  const parts = await Promise.all(FILES.map((f) => fetch(`data/${f}.json`).then((r) => {
    if (!r.ok) throw new Error(`${f}.json ${r.status}`);
    return r.json();
  })));
  raw = Object.fromEntries(FILES.map((f, i) => [f, parts[i]]));
  db = buildDb(raw);
}

// ---------- form

function savedQuery() {
  try { return { ...DEFAULT_Q, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return DEFAULT_Q; }
}

function kidRow(k, i) {
  const [by, bm] = (k.birth || '2018-01').split('-');
  const years = [];
  for (let y = 2025; y >= 2006; y--) years.push(`<option ${String(y) === by ? 'selected' : ''}>${y}</option>`);
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(`<option value="${String(m).padStart(2, '0')}" ${m === Number(bm) ? 'selected' : ''}>${m} 月</option>`);
  return `<div class="kid" data-i="${i}">
    <input name="name" value="${esc(k.name)}" aria-label="名字">
    <select name="by" aria-label="出生年">${years.join('')}</select>
    <select name="bm" aria-label="出生月">${months.join('')}</select>
    <span class="age"></span>
    <button type="button" class="ghost small" data-del="${i}" aria-label="移除">移除</button>
  </div>`;
}

function renderForm(q) {
  const f = $('#q');
  f.start.value = q.start;
  f.end.value = q.end;
  $('#kids').innerHTML = q.kids.map(kidRow).join('');
  $('#cities').innerHTML = CITY_CHIPS.map(([k, label, , note]) =>
    `<label class="chip" title="${esc(note || '')}"><input type="checkbox" name="city" value="${k}" ${q.cities.includes(k) ? 'checked' : ''}><span>${label}</span></label>`).join('');
  $('#formats').innerHTML = Object.entries(FORMATS).map(([k, v]) =>
    `<label class="chip"><input type="checkbox" name="format" value="${k}" ${q.filters.formats?.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('');
  $('#categories').innerHTML = Object.entries(CATEGORIES).map(([k, v]) =>
    `<label class="chip"><input type="checkbox" name="category" value="${k}" ${q.filters.categories?.includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('');
  f.budget.value = q.filters.budgetTWD || '';
  f.kw.value = q.kw || '';
  for (const k of ['lunch', 'flexible', 'noParent']) f[k].checked = !!q.filters[k];
  f.mandarin.checked = !!q.filters.languages?.includes('Mandarin');

  // presets from holiday data
  const tw = db.holidays.filter((h) => h.country === 'TW' && h.kind === 'school_break' && h.date_end > h.date_start);
  const presets = [['原本預設', '2027-01-17', '2027-02-08'],
    ...tw.map((h) => [`台灣${h.name_zh.replace(/\d+/, '')}`, h.date_start, h.date_end]),
    ['2027 暑假 7–8 月', '2027-07-01', '2027-08-31']];
  $('#presets').innerHTML = presets.map(([l, a, b]) => `<button type="button" class="ghost small" data-a="${a}" data-b="${b}">${esc(l)}</button>`).join('');
  $('#tw-hint').textContent = tw.length
    ? tw.map((h) => `台灣 ${h.name_zh}：${h.date_start} 至 ${h.date_end}（教育部行事曆）`).join('；') + '。'
    : '';
}

function readForm() {
  const f = $('#q');
  const kids = [...document.querySelectorAll('.kid')].map((el, i) => ({
    name: el.querySelector('[name=name]').value.trim() || `孩子 ${i + 1}`,
    birth: `${el.querySelector('[name=by]').value}-${el.querySelector('[name=bm]').value}`,
  }));
  const vals = (n) => [...f.querySelectorAll(`[name=${n}]:checked`)].map((x) => x.value);
  return {
    start: f.start.value, end: f.end.value, kids, cities: vals('city'), kw: f.kw.value.trim(),
    filters: {
      formats: vals('format'), categories: vals('category'),
      budgetTWD: Number(f.budget.value) || null,
      lunch: f.lunch.checked, flexible: f.flexible.checked, noParent: f.noParent.checked,
      languages: f.mandarin.checked ? ['Mandarin'] : [],
    },
  };
}

function toSearchQuery(q) {
  const cities = q.cities.flatMap((k) => CITY_CHIPS.find((c) => c[0] === k)?.[2] || []);
  return { ...q, cities };
}

// ---------- render helpers

function confBadge(c) {
  const [t, cls] = CONF[c] || ['?', ''];
  return `<span class="badge ${cls}">可信度 ${t}</span>`;
}

function kidsLine(it) {
  return it.kids.map((k) => {
    const mark = { yes: '✓', no: '✗ 不符', maybe: '？生日當月', unknown: '？' }[k.fit];
    return `<span class="kfit ${k.fit}">${esc(k.name)}（${k.age} 歲）${mark}</span>`;
  }).join('');
}

function priceLine(s, nKids) {
  const p = s.price;
  if (!p || p.amount == null) return '未公布';
  const basis = BASIS[p.basis] || '計價方式未註明';
  const twd = toTWD(p.amount, p.currency, db.fx);
  let t = `${esc(p.currency)} ${fmtN(p.amount)}／${basis}${twd ? `（約 NT$${fmtN(twd)}）` : ''}`;
  if (p.tax_included === true) t += '，含稅';
  if (p.tax_included === false) t += '，未含稅';
  if (p.tax_note) t += `<br><small class="quote">${esc(p.tax_note)}</small>`;
  if (nKids > 1) {
    const tot = p.amount * nKids;
    const tt = toTWD(tot, p.currency, db.fx);
    t += `<br>${nKids} 位合計 ${esc(p.currency)} ${fmtN(tot)}／${basis}${tt ? `（約 NT$${fmtN(tt)}）` : ''}，未計手足優惠`;
  }
  const eb = p.early_bird;
  if (eb?.amount != null) t += `<br>早鳥 ${esc(p.currency)} ${fmtN(eb.amount)}${eb.deadline ? `，${esc(eb.deadline)} 前` : ''}`;
  return t;
}

function locLine(locs) {
  if (!locs.length) return '地點未公布';
  const shown = locs.slice(0, 3).map((l) => {
    const qstr = encodeURIComponent([l.name, l.address].filter(Boolean).join(' '));
    return `${esc(l.name)}${l.address ? `<br><small class="quote">${esc(l.address)}</small>` : ''} <a href="https://www.google.com/maps/search/?api=1&query=${qstr}" target="_blank" rel="noopener">地圖</a>`;
  });
  return shown.join('<br>') + (locs.length > 3 ? `<br><small>等 ${locs.length} 處</small>` : '');
}

function reviewsOf(it) {
  const ids = [it.provider.id, it.program.id, ...it.locs.map((l) => l.id)];
  const seen = new Set();
  const out = [];
  for (const id of ids) for (const r of db.reviews[id] || []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function reviewSummary(revs) {
  const scored = revs.filter((r) => r.rating != null);
  const textOnly = revs.length - scored.length;
  if (!scored.length) return textOnly ? `沒有評分，有 ${textOnly} 筆文字評價，見詳細資料` : '沒找到評價';
  return scored.map((r) => {
    const small = r.count != null && r.count < 10;
    const tags = [r.about_kids_program === false && '非兒童營', r.scope_note].filter(Boolean);
    return `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(platName(r))}</a> ${r.rating}／${r.scale || 5}` +
      `${r.count != null ? `（${fmtN(r.count)} 則${small ? '，<span class="small-n">樣本小</span>' : ''}）` : ''}` +
      `${tags.length ? `<small class="small-n">（${tags.map(esc).join('；')}）</small>` : ''}`;
  }).join('<br>') + (textOnly ? `<br><small>另有 ${textOnly} 筆文字評價，見詳細資料</small>` : '');
}

function reviewThemes(revs) {
  const by = {};
  for (const r of revs) {
    for (const [list, tone] of [[r.highlights_pos, 'pos'], [r.highlights_neg, 'neg']]) {
      for (const h of list || []) {
        if (!h?.text) continue;
        const th = THEMES[h.theme] ? h.theme : 'other';
        (by[th] ||= { pos: [], neg: [] })[tone].push({ ...h, plat: platName(r), scope: r.scope_note });
      }
    }
  }
  const keys = Object.keys(THEMES).filter((k) => by[k]);
  if (!keys.length) return '';
  const li = (h, tone) => `<li>${tone === 'pos' ? '＋' : '－'} ${esc(h.text)}` +
    `${h.quote ? ` <span class="quote">「${esc(h.quote)}」</span>` : ''}` +
    ` <small>（<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.plat)}</a>${h.date ? `，${esc(h.date)}` : ''}${AUTHOR[h.author_type] ? `，${AUTHOR[h.author_type]}` : ''}${h.about_kids_program === false ? '，非兒童營' : ''}${h.scope ? `，${esc(h.scope)}` : ''}）</small></li>`;
  return '<h4>評價整理（依主題，各平台分開列，不平均）</h4>' + keys.map((k) =>
    `<div><b>${THEMES[k]}</b><ul>${by[k].pos.map((h) => li(h, 'pos')).join('')}${by[k].neg.map((h) => li(h, 'neg')).join('')}</ul></div>`).join('');
}

function datesLine(it) {
  const s = it.session;
  if (it.group === 'estimated') {
    const past = it.past.map((p) => `${fmtD(p.start_date, true)}～${fmtD(p.end_date)}`);
    const basis = it.estimates.map((e) => e.estimate_basis).filter(Boolean);
    return (past.length ? `往年：${past.join('、')}` : '') + (basis.length ? `${past.length ? '<br>' : ''}<small class="quote">推估依據：${esc(basis[0])}</small>` : '') || '日期未公布';
  }
  if (it.group === 'unknown') return '日期未公布';
  if (it.intakes) {
    const w = s.min_duration_weeks || 1;
    return `開課日（每次最少 ${w} 週）：<div class="intakes">${it.intakes.map((x) =>
      `<span class="${x.group === 'full' ? 'in' : ''}">${fmtD(x.span.start)}</span>`).join('')}</div>`;
  }
  const sp = it.span;
  return `${fmtD(sp.start, true)}～${fmtD(sp.end, sp.end.slice(0, 4) !== sp.start.slice(0, 4))}${s.weekday_pattern ? `，${esc(s.weekday_pattern)}` : ''}`;
}

function sourcesBlock(it) {
  const s = it.session;
  const rows = [`<li><a class="src" href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.source_url)}</a>（梯次來源，查證 ${esc(s.verified_at)}）${s.evidence_quote ? `<br><span class="quote">「${esc(s.evidence_quote)}」</span>` : ''}</li>`];
  for (const src of [...(it.program.sources || []), ...(it.provider.sources || [])].slice(0, 6)) {
    if (!src.url || src.url === s.source_url) continue;
    rows.push(`<li><a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.url)}</a>（第 ${esc(src.tier)} 級${src.fields?.length ? `，${esc(src.fields.join('、'))}` : ''}）${src.quote ? `<br><span class="quote">「${esc(src.quote)}」</span>` : ''}</li>`);
  }
  return `<h4>來源</h4><ul>${rows.join('')}</ul>`;
}

function conflictsBlock(it) {
  const list = [it.session.id, it.program.id, it.provider.id].flatMap((i) => db.conflicts[i] || []);
  if (!list.length) return '';
  return `<h4>來源說法不一</h4><ul>${list.map((c) => `<li>${esc(c.field)}：${(c.values || []).map((v) =>
    `${esc(v.value)}（<a href="${esc(v.source_url)}" target="_blank" rel="noopener">第 ${esc(v.tier)} 級</a>）`).join(' vs ')}${c.note ? `<br><small class="quote">${esc(c.note)}</small>` : ''}</li>`).join('')}</ul>`;
}

function detailsBlock(it) {
  const p = it.program;
  const inc = Object.entries(p.includes || {}).filter(([, v]) => v === true).map(([k]) => INCLUDES[k] || k);
  const notInc = Object.entries(p.includes || {}).filter(([, v]) => v === false).map(([k]) => INCLUDES[k] || k);
  const b = p.booking || {};
  const bookRows = [['報名網址', b.url && `<a href="${esc(b.url)}" target="_blank" rel="noopener">連結</a>`], ['截止', esc(b.deadline)],
    ['付款', esc(b.payment_terms)], ['退費', esc(b.refund_policy)], ['改期', esc(b.flex_ticket)], ['手足優惠', esc(b.sibling_discount)]]
    .filter(([, v]) => v);
  const revs = reviewsOf(it);
  return `<details class="more"><summary>詳細資料</summary>
    ${reviewThemes(revs)}
    ${revs.length ? `<h4>評價來源</h4><ul class="rev">${revs.map((r) => `<li>${esc(platName(r))}${r.rating != null ? ` ${r.rating}／${r.scale || 5}` : ''}${r.count != null ? `（${fmtN(r.count)} 則）` : ''}：<a class="src" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>${r.notes ? `<br><small class="quote">${esc(r.notes)}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${p.notes || it.session.notes ? `<h4>說明</h4><p>${esc(p.notes)} ${esc(it.session.notes)}</p>` : ''}
    ${inc.length || notInc.length || p.excludes?.length ? `<h4>包含／不含</h4><p>${inc.length ? `含：${inc.join('、')}` : ''}${notInc.length || p.excludes?.length ? `<br>不含：${[...notInc, ...(p.excludes || [])].map(esc).join('、')}` : ''}</p>` : ''}
    ${p.requirements?.length ? `<h4>要求</h4><ul>${p.requirements.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${p.staff_ratio || p.class_size_max ? `<h4>師生比與班級</h4><p>${esc(p.staff_ratio || '')}${p.class_size_max ? ` 每班最多 ${esc(p.class_size_max)} 人` : ''}</p>` : ''}
    ${p.safety?.notes ? `<h4>安全</h4><p>${esc(p.safety.notes)}</p>` : ''}
    ${bookRows.length ? `<h4>報名</h4><ul>${bookRows.map(([k, v]) => `<li>${k}：${v}</li>`).join('')}</ul>` : ''}
    ${conflictsBlock(it)}
    ${sourcesBlock(it)}
    <h4>梯次編號</h4><p class="sid">${esc(it.session.id)}</p>
  </details>`;
}

function venueNote(it) {
  const loc = it.locs[0]?.name;
  if (!loc) return '';
  const word = it.provider.name_en.split(/\s+/)[0].toLowerCase();
  return loc.toLowerCase().includes(word) ? '' : `<br>場地：${esc(loc)}${it.locs.length > 1 ? ` 等 ${it.locs.length} 處` : ''}`;
}

const haystack = (it) => [it.provider.name_en, it.provider.name_zh, it.program.name, ...(it.locs || []).map((l) => l.name)]
  .filter(Boolean).join(' ').toLowerCase();

function card(it) {
  const p = it.program;
  const s = it.session;
  const id = cardId(it);
  lastCards.set(id, it);
  const nKids = it.kids.filter((k) => k.fit !== 'no').length;
  const hours = p.hours?.start ? `${esc(p.hours.start)}–${esc(p.hours.end || '?')}${p.hours.days ? `，${esc(p.hours.days)}` : ''}` : '未公布';
  const lunch = p.includes?.lunch === true ? '含午餐' : p.includes?.lunch === false ? '不含午餐' : '午餐未公布';
  const age = `${p.age_min ?? '?'}–${p.age_max ?? '?'} 歲`;
  return `<article class="card ${it.group}" id="${id}">
    <div class="card-h"><div><h3>${esc(p.name)}</h3><div class="prov">${esc(it.provider.name_en)}${it.provider.name_zh ? `・${esc(it.provider.name_zh)}` : ''}${venueNote(it)}</div></div>
      ${it.group === 'unknown' ? '' : `<label class="cmp-box"><input type="checkbox" data-cmp="${id}" ${compare.has(id) ? 'checked' : ''}>比較</label>`}</div>
    <div class="badges">${confBadge(s.confidence)}<span class="badge ${it.group === 'estimated' ? 'est' : ''}">${STATUS[s.date_status]}</span>
      <span class="badge">${FORMATS[p.format] || esc(p.format)}</span>${p.category.slice(0, 3).map((c) => `<span class="badge">${CATEGORIES[c] || esc(c)}</span>`).join('')}</div>
    <dl class="facts">
      <dt>日期</dt><dd>${datesLine(it)}</dd>
      <dt>地點</dt><dd>${locLine(it.locs)}</dd>
      <dt>年齡</dt><dd>${age}<br>${kidsLine(it)}</dd>
      <dt>時間</dt><dd>${hours}，${lunch}</dd>
      <dt>價格</dt><dd>${priceLine(s, nKids)}</dd>
      <dt>評價</dt><dd class="rev">${reviewSummary(reviewsOf(it))}</dd>
    </dl>
    ${it.warnings?.length ? `<ul class="warns">${it.warnings.map((w) => `<li class="w-${w.code}">${esc(w.text)}</li>`).join('')}</ul>` : ''}
    ${detailsBlock(it)}
  </article>`;
}

function weekTable(r) {
  const short = (t) => t.replace(/\s*\(.*\)|（.*）/g, '').trim();
  // same provider twice in a cell -> add the program or location to tell them apart
  const labels = (list) => {
    const n = {};
    for (const it of list) n[it.provider.id] = (n[it.provider.id] || 0) + 1;
    return list.map((it) => {
      let t = short(it.provider.name_en);
      if (n[it.provider.id] > 1) {
        const twin = list.find((x) => x !== it && x.provider.id === it.provider.id);
        const loc = short(it.locs[0]?.name || '');
        if (twin.program.id !== it.program.id) t += '・' + short(it.program.name);
        else if (loc.toLowerCase().startsWith(t.split(' ')[0].toLowerCase())) t = loc;
        else t += '・' + loc;
      }
      return [it, esc(t.slice(0, 48))];
    });
  };
  const chips = (list, weak) => labels(list).map(([it, t]) => `<a class="opt ${weak ? 'weak' : ''}" href="#${cardId(it)}">${t}</a>`).join('');
  const uniq = (list) => [...new Map(list.map((x) => [cardId(x), x])).values()];
  const head = `<tr><th>週</th>${r.weeks[0]?.perKid.map((k) => `<th>${esc(k.kid.name)}</th>`).join('') || ''}</tr>`;
  const rows = r.weeks.map((w) => `<tr><td class="wk">${fmtD(w.mon)}～${fmtD(w.fri)}${w.holidays.map((h) =>
    `<span class="hol">${fmtD(h.date_start)} ${esc(h.name_zh || h.name_en)}${h.status === 'estimated' ? '（推算）' : ''}</span>`).join('')}</td>${w.perKid.map((k) => {
    const solid = uniq(k.solid);
    const weak = uniq(k.weak);
    return `<td data-k="${esc(k.kid.name)}">${k.gap ? '<span class="gap">空窗</span> ' : ''}${chips(solid, false)}${chips(weak, true)}</td>`;
  }).join('')}</tr>`).join('');
  return `<h2>週視圖</h2><p class="group-note">實心＝官方或中可信度以上的梯次；虛線＝只有聚合站或代理商來源，不算填補空窗。橘字是馬來西亞平日公假。</p>
    <table class="weeks"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function render(q) {
  const sq = toSearchQuery(q);
  if (!sq.kids.length || !sq.start || !sq.end || sq.start > sq.end) {
    $('#status').textContent = '請填日期（開始不能晚於結束）並至少加一位孩子。';
    return;
  }
  const r = search(db, sq);
  lastCards = new Map();
  const gapWeeks = r.weeks.filter((w) => w.perKid.some((k) => k.gap)).length;
  $('#status').innerHTML = '';
  const kw = (q.kw || '').toLowerCase();
  if (kw) {
    for (const g of ['full', 'partial', 'estimated', 'unknown']) r[g] = r[g].filter((it) => haystack(it).includes(kw));
    const n = r.full.length + r.partial.length + r.estimated.length + r.unknown.length;
    $('#status').innerHTML = `名稱篩選「${esc(q.kw)}」：結果只列名稱或上課場地含這個字的梯次，上方統計和週視圖仍是全部。` +
      (n ? '' : `<br>${elsewhere(kw, sq)}`);
  }
  $('#summary').innerHTML = `<div class="summary">
    <div class="stat"><b>${r.full.length}</b><small>已確認、完全在區間內</small></div>
    <div class="stat"><b>${r.partial.length}</b><small>已確認、部分在區間內</small></div>
    <div class="stat"><b>${r.estimated.length}</b><small>推測或需詢問</small></div>
    <div class="stat ${gapWeeks ? 'bad' : ''}"><b>${gapWeeks}</b><small>有孩子空窗的週數</small></div></div>`;
  $('#weeks').innerHTML = r.weeks.length ? weekTable(r) : '';
  const section = (title, note, items) => `<h2>${title}（${items.length}）</h2><p class="group-note">${note}</p>
    <div class="cards">${items.map(card).join('') || '<p class="group-note">沒有符合的梯次。</p>'}</div>`;
  $('#results').innerHTML =
    section('① 已確認，日期完全在區間內', '2027（或 2026/27 冬季）日期已公布，整個梯次落在你選的日期內。', r.full) +
    section('② 已確認，部分在區間內', '日期已公布，但有一段在你選的日期外；可只報區間內的週次，或跟其他梯次接起來。', r.partial) +
    section('③ 日期未公布，依往年推測', '這些營往年在這段時間開過，但 2027 日期還沒公布。卡片上的日期是往年的，報名前要問機構。', r.estimated) +
    (r.unknown.length ? `<details class="more"><summary>還有 ${r.unknown.length} 筆這段期間查不到日期（點開）</summary><ul>${r.unknown.map((x) =>
      `<li>${esc(x.provider.name_en)}：${esc(x.program.name)}${x.locs?.[0] ? `（${esc(x.locs[0].name)}）` : ''}　<a href="${esc(x.session.source_url)}" target="_blank" rel="noopener">查證頁</a></li>`).join('')}</ul></details>` : '');
  updateTray();
}

// where a name shows up when it has nothing in the chosen dates / cities
function elsewhere(kw, sq) {
  const hits = new Map();
  for (const s of raw.sessions) {
    const program = db.programs[s.program_id];
    if (!program) continue;
    const it = { provider: db.providers[program.provider_id] || {}, program, locs: s.location_id && db.locations[s.location_id] ? [db.locations[s.location_id]] : [] };
    if (!haystack(it).includes(kw)) continue;
    const key = `${it.provider.name_en}：${program.name}${it.locs[0] ? `（${it.locs[0].name}，${it.locs[0].city}）` : ''}`;
    const when = s.start_date ? `${s.start_date.slice(0, 7)}${s.date_status === 'confirmed_target_year' ? '' : '（往年）'}` : `${{ summer_2027: '2027 暑假', winter_2026_27: '2026/27 寒假', spring_2027: '2027 春假' }[s.season] || ''}${STATUS[s.date_status]}`;
    if (!hits.has(key)) hits.set(key, new Set());
    hits.get(key).add(when);
  }
  if (!hits.size) return '資料裡沒有這個名稱。';
  return `這段日期或城市沒有符合的梯次。資料裡有：<ul>${[...hits].slice(0, 8).map(([k, w]) => `<li>${esc(k)}：${[...w].map(esc).join('、')}</li>`).join('')}</ul>`;
}

// ---------- compare

function updateTray() {
  for (const id of [...compare]) if (!lastCards.has(id)) compare.delete(id);
  $('#tray').hidden = compare.size === 0;
  $('#tray-n').textContent = `已選 ${compare.size}／4`;
  $('#tray-open').disabled = compare.size < 2;
}

function openCompare() {
  const items = [...compare].map((id) => lastCards.get(id)).filter(Boolean);
  const rows = [
    ['機構', (it) => esc(it.provider.name_en)],
    ['營隊', (it) => esc(it.program.name)],
    ['狀態', (it) => `${STATUS[it.session.date_status]}，可信度 ${CONF[it.session.confidence]?.[0] || '?'}`],
    ['日期', datesLine],
    ['地點', (it) => it.locs.map((l) => esc(l.name)).join('<br>') || '未公布'],
    ['年齡', (it) => `${it.program.age_min ?? '?'}–${it.program.age_max ?? '?'} 歲<br>${kidsLine(it)}`],
    ['形式', (it) => FORMATS[it.program.format] || esc(it.program.format)],
    ['時間', (it) => (it.program.hours?.start ? `${esc(it.program.hours.start)}–${esc(it.program.hours.end || '?')}` : '未公布')],
    ['午餐', (it) => ({ true: '含', false: '不含' }[it.program.includes?.lunch] || '未公布')],
    ['價格', (it) => priceLine(it.session, it.kids.filter((k) => k.fit !== 'no').length)],
    ['評價', (it) => reviewSummary(reviewsOf(it))],
    ['警示', (it) => (it.warnings || []).map((w) => esc(w.text)).join('<br>')],
  ];
  $('#cmp-body').innerHTML = `<div class="cmp-scroll"><table class="cmp">${rows.map(([k, fn]) =>
    `<tr><th>${k}</th>${items.map((it) => `<td>${fn(it)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  $('#cmp').showModal();
}

// ---------- wiring

function refreshAges() {
  const f = $('#q');
  for (const el of document.querySelectorAll('.kid')) {
    const birth = `${el.querySelector('[name=by]').value}-${el.querySelector('[name=bm]').value}`;
    const { age } = kidFit({ age_min: null, age_max: null }, birth, f.start.value || '2027-01-17');
    el.querySelector('.age').textContent = `開始日時約 ${age} 歲`;
  }
}

function run() {
  const q = readForm();
  localStorage.setItem(STORE, JSON.stringify(q));
  refreshAges();
  render(q);
}

function footer() {
  const latest = raw.sessions.reduce((m, s) => (s.verified_at > m ? s.verified_at : m), '');
  const fx = db.fx;
  $('#foot').innerHTML = `資料查證到 ${esc(latest)}。匯率：1 MYR ≈ ${fx.rates.MYR} TWD、1 USD ≈ ${fx.rates.USD} TWD（${esc(fx.source)}，${esc(fx.asof.MYR)}）。<br>
    可信度：高＝官方訂位頁或簡章且是 2027 的日期；中＝營隊官方社群，或聚合站資料與官方不矛盾；低＝只有聚合站或代理商來源，或來源互相矛盾。<br>
    發現資料有誤，把卡片「詳細資料」裡的梯次編號告訴維護者即可。`;
}

async function main() {
  try {
    await load();
  } catch (e) {
    $('#status').textContent = `資料載入失敗：${e.message}`;
    return;
  }
  renderForm(savedQuery());
  footer();
  const f = $('#q');
  f.addEventListener('change', run);
  f.addEventListener('input', (e) => { if (['budget', 'name', 'kw'].includes(e.target.name)) run(); });
  f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('#add-kid').addEventListener('click', () => {
    const q = readForm();
    q.kids.push({ name: `孩子 ${q.kids.length + 1}`, birth: '2018-01' });
    $('#kids').innerHTML = q.kids.map(kidRow).join('');
    run();
  });
  $('#kids').addEventListener('click', (e) => {
    const i = e.target.dataset?.del;
    if (i == null) return;
    const q = readForm();
    q.kids.splice(Number(i), 1);
    $('#kids').innerHTML = q.kids.map(kidRow).join('');
    run();
  });
  $('#presets').addEventListener('click', (e) => {
    if (!e.target.dataset.a) return;
    f.start.value = e.target.dataset.a;
    f.end.value = e.target.dataset.b;
    run();
  });
  $('#results').addEventListener('change', (e) => {
    const id = e.target.dataset?.cmp;
    if (!id) return;
    if (e.target.checked) {
      if (compare.size >= 4) { e.target.checked = false; return; }
      compare.add(id);
    } else compare.delete(id);
    updateTray();
  });
  $('#tray-open').addEventListener('click', openCompare);
  $('#tray-clear').addEventListener('click', () => { compare.clear(); run(); });
  run();
}

main();

export { sessionSpan };
