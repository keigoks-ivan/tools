import { buildDb, search, toTWD, kidFit, sessionSpan, holidaysIn, defaultQty, taxRate, lineCost, UNIT, runWeeks, weeksQty, weeksIn, mondayOf, addDays } from './lib/core.mjs';

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
  outdoor: '戶外', residential: '住宿', leadership: '領導力', family: '親子', travel: '遊學旅行', short_term_enrolment: '學校插班', other_language: '其他語言',
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
// cards the parent ticked: id -> { it, kids: Set of kid indexes, weeks: Map monday -> days, qty, amount }. Kept across searches.
const picked = new Map();

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
// one card per program+location, plus the start date for single dated sessions (several weeks of one camp)
const cardId = (it) => 'c-' + `${it.program.id}--${it.session.location_id || 'x'}${it.span && !it.span.derived ? `--${it.span.start}` : ''}${it.group === 'unknown' ? '--tbd' : ''}`.replace(/[^a-z0-9-]/gi, '-');

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
      ${it.group === 'unknown' ? '' : `<label class="cmp-box"><input type="checkbox" data-cmp="${id}" ${picked.has(id) ? 'checked' : ''}>選取</label>`}</div>
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
  $('#results').innerHTML = '<p class="pick-hint">勾卡片右上角的「選取」，可以估算費用，或並排比較 2–4 個。</p>' +
    section('① 已確認，日期完全在區間內', '2027（或 2026/27 冬季）日期已公布，整個梯次落在你選的日期內。', r.full) +
    section('② 已確認，部分在區間內', '日期已公布，但有一段在你選的日期外；可只報區間內的週次，或跟其他梯次接起來。', r.partial) +
    section('③ 日期未公布，依往年推測', '這些營往年在這段時間開過，但 2027 日期還沒公布。卡片上的日期是往年的，報名前要問機構。', r.estimated) +
    (r.unknown.length ? `<details class="more"><summary>還有 ${r.unknown.length} 筆這段期間查不到日期（點開）</summary><ul>${r.unknown.map((x) => {
      const id = cardId(x);
      lastCards.set(id, x);
      const pr = x.session.price;
      return `<li>${esc(x.provider.name_en)}：${esc(x.program.name)}${x.locs?.[0] ? `（${esc(x.locs[0].name)}）` : ''}${pr?.amount != null ? `，${money(pr.currency, pr.amount)}／${BASIS[pr.basis] || '?'}` : ''}　<a href="${esc(x.session.source_url)}" target="_blank" rel="noopener">查證頁</a><label class="cmp-box"><input type="checkbox" data-cmp="${id}" ${picked.has(id) ? 'checked' : ''}>選取</label></li>`;
    }).join('')}</ul></details>` : '');
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

// ---------- picked cards: compare and cost estimate

function updateTray() {
  // cards from an earlier search stay picked; refresh the ones shown again
  for (const [id, p] of picked) if (lastCards.has(id)) p.it = lastCards.get(id);
  const n = picked.size;
  $('#tray').hidden = n === 0;
  $('#tray-n').textContent = `已選 ${n} 個`;
  $('#tray-open').disabled = n < 2 || n > 4;
  $('#tray-open').title = n > 4 ? '並排比較最多 4 個' : '';
}

function openCompare() {
  const items = [...picked.values()].map((p) => p.it);
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

// Dates the estimate is based on: this year's span, else the latest past run.
function estSpan(it) {
  if (it.span) return { span: it.span, past: false };
  const s = it.past?.length ? it.past[0] : it.session;
  const span = sessionSpan(s);
  return { span, past: !!span };
}

const PER_WHOLE = new Set(['per_camp', 'per_session']);
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const searchWin = () => { const q = readForm(); return { start: q.start, end: q.end }; };

// Weeks a parent can tick: the camp's weeks inside the search dates. A whole-camp
// price fixes the weeks; cards without 2027 dates offer every week of the search.
function weekOpts(it, win) {
  if (it.intakes) {
    const end = it.intakes.reduce((m, x) => (x.span.end > m ? x.span.end : m), it.span.end);
    return { kind: 'rolling', opts: runWeeks({ start: it.intakes[0].span.start, end }, win.start, win.end) };
  }
  if (it.span) {
    if (PER_WHOLE.has(it.session.price?.basis)) return { kind: 'fixed', opts: runWeeks(it.span, it.span.start, it.span.end) };
    return { kind: 'dated', opts: runWeeks(it.span, win.start, win.end) };
  }
  return { kind: 'undated', opts: weeksIn(win.start, win.end).map((w) => ({ mon: w.mon, start: w.mon, end: w.fri })) };
}

function autoQty(p) {
  const ws = [...p.weeks.values()];
  if (!ws.length && p.kind === 'undated') return { qty: p.qty0, qtyGuess: p.qtyGuess0 };
  const q = weeksQty(p.it.session.price, ws, ws.reduce((n, w) => n + holidaysIn(db, w.start, w.end, p.it.locs).length, 0));
  return { qty: q ?? 1, qtyGuess: q == null };
}

function pickDefaults(it) {
  const { kind, opts } = weekOpts(it, searchWin());
  const chosen = kind === 'undated' ? []
    : kind === 'rolling' ? opts.filter((w) => w.mon >= mondayOf(it.span.start) && w.mon <= it.span.end) : opts;
  const { span } = estSpan(it);
  const q0 = defaultQty(it.session.price, span, span ? holidaysIn(db, span.start, span.end, it.locs).length : 0);
  const p = {
    it, kind, weeks: new Map(chosen.map((w) => [w.mon, w])), amount: it.session.price?.amount ?? null,
    kids: new Set(it.kids.map((k, i) => (k.fit === 'no' ? -1 : i)).filter((i) => i >= 0)),
    qty0: q0 ?? 1, qtyGuess0: q0 == null,
  };
  return Object.assign(p, autoQty(p));
}

const money = (cur, n) => `${esc(cur)} ${fmtN(n)}`;
const shortName = (it) => it.provider.name_en.replace(/\s*\(.*?\)/g, '');

function estLine(id) {
  const p = picked.get(id);
  const pr = p.it.session.price;
  if (pr?.amount == null) return { id, html: '價格未公布，沒算進總額', c: null };
  if (!p.kids.size) return { id, html: '沒有勾孩子，沒算進總額', c: null };
  if (!p.weeks.size && p.kind !== 'undated') return { id, html: '沒有勾週次，沒算進總額', c: null };
  const price = { ...pr, amount: p.amount };
  const c = lineCost(price, p.qty, p.kids.size);
  if (!c) return { id, html: '單價或數量是空的，沒算進總額', c: null };
  const twd = toTWD(c.total, pr.currency, db.fx);
  let html = `${money(pr.currency, p.amount)}／${BASIS[pr.basis] || '?'} × ${p.qty} ${UNIT[pr.basis] || '單位'} × ${p.kids.size} 位`;
  if (c.tax) html += ` ＝ ${money(pr.currency, c.base)}，加 ${Math.round(taxRate(pr) * 100)}% 稅 ${money(pr.currency, c.tax)}`;
  html += ` ＝ <b>${money(pr.currency, c.total)}</b>${twd ? `（約 NT$${fmtN(twd)}）` : ''}`;
  if (p.amount !== pr.amount) html += `<br><small>單價是你改的，業者公布的是 ${money(pr.currency, pr.amount)}</small>`;
  const min = p.it.session.min_duration_weeks;
  if (p.kind === 'rolling' && min > 1 && p.weeks.size < min) html += `<br><small class="warn-txt">這個營最少要報 ${min} 週</small>`;
  return { id, html, c, twd, cur: pr.currency };
}

function estNotes(p) {
  const { it } = p;
  const s = it.session;
  const pr = s.price || {};
  const notes = [];
  if (pr.amount != null && s.date_status === 'confirmed_other_year') notes.push(`這是 ${s.year} 年的價格，2027 可能調整`);
  if (pr.amount != null && s.date_status === 'pattern_estimated') notes.push('價格取自往年，2027 可能調整');
  if (p.kind === 'undated') notes.push(`2027 日期未公布：勾你打算去的週，數量照週次算；不勾就先算 ${p.qty0} ${UNIT[pr.basis] || '單位'}${p.qtyGuess0 ? '' : '（往年一梯）'}`);
  if (p.kind === 'fixed') notes.push('整梯計價，週次不能拆');
  if (p.qtyGuess && p.kind !== 'undated' && pr.amount != null) notes.push(`算不出${UNIT[pr.basis] || '數量'}數，先填 1，請自己改`);
  if (taxRate(pr) === null) notes.push('業者寫另外加稅，但沒寫稅率，沒算進去');
  if (pr.tax_included == null && pr.amount != null) notes.push('沒寫是否含稅');
  if (it.program.includes?.lunch === false) notes.push('不含午餐');
  if (pr.early_bird?.amount != null) notes.push(`有早鳥價 ${money(pr.currency, pr.early_bird.amount)}，沒套用（條件見卡片）`);
  if (pr.tax_note) notes.push(`價格附註：${esc(pr.tax_note.length > 90 ? `${pr.tax_note.slice(0, 90)}…` : pr.tax_note)}`);
  return notes;
}

function weekChips(p) {
  const { opts } = weekOpts(p.it, searchWin());
  const all = new Map(opts.map((w) => [w.mon, w]));
  for (const w of p.weeks.values()) if (!all.has(w.mon)) all.set(w.mon, w);
  if (!all.size) return '<span class="muted">這個梯次不在你選的日期內</span>';
  return [...all.values()].sort((a, b) => a.mon.localeCompare(b.mon)).map((w) => {
    const days = weekdaysOf(w);
    return `<label class="chip sm"><input type="checkbox" data-w="${w.mon}" data-ws="${w.start}" data-we="${w.end}" ${p.weeks.has(w.mon) ? 'checked' : ''} ${p.kind === 'fixed' ? 'disabled' : ''}><span>${md(w.start)}～${md(w.end)}${days < 5 ? `（${days} 天）` : ''}</span></label>`;
  }).join('');
}

function weekdaysOf(w) {
  let n = 0;
  for (let d = w.start; d <= w.end; d = addDays(d, 1)) if (![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) n += 1;
  return n;
}

function openEstimate() {
  const items = [...picked.entries()];
  $('#cmp-body').innerHTML = `<h2 class="est-title">費用估算（大概金額）</h2>
    <p class="hint">每個營勾孩子和要去的週次，下方的排程表會顯示每週每個孩子在哪裡，同一週排了兩個營會標紅。數量照週次自動算，單價和數量都可以改。只在業者寫明稅率時加稅。</p>
    ${items.map(([id, p]) => {
      const { it } = p;
      const { span, past } = estSpan(it);
      const pr = it.session.price || {};
      const when = it.intakes ? `每週可開課，最少 ${it.session.min_duration_weeks || 1} 週`
        : span ? `${past ? '往年 ' : ''}${fmtD(span.start, true)}～${fmtD(span.end)}` : '日期未公布';
      const step = pr.basis === 'per_2weeks' ? 0.5 : 1;
      return `<section class="est-item" data-id="${id}">
        <div class="est-h"><b>${esc(it.program.name)}</b><span class="prov">${esc(it.provider.name_en)}${it.locs[0] ? `・${esc(it.locs[0].name)}` : ''}</span>
          <button type="button" class="ghost est-del" data-del="${id}" aria-label="移除">移除</button></div>
        <div class="est-meta">${when}・${STATUS[it.session.date_status]}</div>
        <div class="est-ctl"><span class="lbl">孩子</span><span class="chips">${it.kids.map((k, i) => `<label class="chip sm"><input type="checkbox" data-k="${i}" ${p.kids.has(i) ? 'checked' : ''} ${k.fit === 'no' ? 'disabled' : ''}><span>${esc(k.name)}（${k.age} 歲）${k.fit === 'no' ? ' 年齡不符' : ''}</span></label>`).join('')}</span></div>
        <div class="est-ctl"><span class="lbl">週次</span><span class="chips">${weekChips(p)}</span></div>
        ${pr.amount != null && UNIT[pr.basis] ? `<div class="est-ctl"><label class="qty">單價 <input type="number" min="0" step="1" value="${p.amount}" data-a> ${esc(pr.currency)}／${BASIS[pr.basis]}</label>
          <label class="qty">數量 <input type="number" min="0" step="${step}" value="${p.qty}" data-q> ${UNIT[pr.basis]}</label></div>` : ''}
        <div class="est-calc"></div>
        ${(() => { const n = estNotes(p); return n.length ? `<ul class="est-notes">${n.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''; })()}
      </section>`;
    }).join('')}
    <div id="est-plan"></div>
    <div id="est-total" class="est-total"></div>`;
  updateEstimate();
  if (!$('#cmp').open) $('#cmp').showModal();
}

// Week-by-kid schedule of the picked camps, and clashes (same kid, same days).
function planOf(kidNames) {
  const win = searchWin();
  const rows = new Map(weeksIn(win.start, win.end).map((w) => [w.mon, []]));
  for (const p of picked.values()) for (const m of p.weeks.keys()) if (!rows.has(m)) rows.set(m, []);
  const clashes = [];
  const table = [...rows.keys()].sort().map((mon) => {
    const cells = kidNames.map((name) => {
      const here = [...picked.values()].filter((p) => p.weeks.has(mon) && [...p.kids].some((i) => p.it.kids[i]?.name === name));
      let clash = false;
      for (let a = 0; a < here.length; a += 1) {
        for (let b = a + 1; b < here.length; b += 1) {
          const A = here[a].weeks.get(mon);
          const B = here[b].weeks.get(mon);
          if (A.start <= B.end && B.start <= A.end) {
            clash = true;
            clashes.push(`${esc(name)}：${md(mon)} 那週 ${esc(shortName(here[a].it))} 和 ${esc(shortName(here[b].it))} 撞期`);
          }
        }
      }
      return { here, clash };
    });
    return { mon, cells };
  });
  return { table, clashes };
}

function planHtml(kidNames, table) {
  if (!table.some((r) => r.cells.some((c) => c.here.length))) return '';
  // the venue name alone when it already carries the brand (Newtonshow Bangsar), else brand plus venue
  const label = (p) => {
    const brand = shortName(p.it);
    const loc = p.it.locs[0]?.name || '';
    const own = loc && loc.split(' ')[0] === brand.split(' ')[0];
    return `<span class="plan-opt" title="${esc(p.it.provider.name_en)}・${esc(p.it.program.name)}">${esc(own ? loc : brand)}${loc && !own ? `<small>${esc(loc)}</small>` : ''}${p.kind === 'undated' ? '<small>日期未定</small>' : ''}</span>`;
  };
  return `<h3 class="est-sub">排程</h3><div class="cmp-scroll"><table class="weeks plan"><thead><tr><th>週</th>${kidNames.map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>
    ${table.map((r) => `<tr><td class="wk">${md(r.mon)}～${md(addDays(r.mon, 4))}</td>${r.cells.map((c) => `<td class="${c.clash ? 'clash' : ''}">${c.here.length ? c.here.map(label).join('') : '<span class="gap">空</span>'}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}

function updateEstimate() {
  const lines = [...picked.keys()].map(estLine);
  for (const l of lines) {
    const el = $(`.est-item[data-id="${l.id}"] .est-calc`);
    if (el) el.innerHTML = l.html;
  }
  const byCur = {};
  let twd = 0;
  const perKid = new Map();
  const kidNames = readForm().kids.map((k) => k.name);
  for (const p of picked.values()) for (const i of p.kids) { const n = p.it.kids[i]?.name; if (n && !kidNames.includes(n)) kidNames.push(n); }
  for (const l of lines.filter((x) => x.c)) {
    byCur[l.cur] = (byCur[l.cur] || 0) + l.c.total;
    twd += l.twd || 0;
    const p = picked.get(l.id);
    for (const i of p.kids) {
      const name = p.it.kids[i]?.name ?? `孩子 ${i + 1}`;
      perKid.set(name, (perKid.get(name) || 0) + (l.twd || 0) / p.kids.size);
    }
  }
  const missing = lines.filter((x) => !x.c).map((x) => { const { it } = picked.get(x.id); return `${esc(it.provider.name_en)} ${esc(it.program.name)}${it.locs[0] ? `（${esc(it.locs[0].name)}）` : ''}`; });
  const { table, clashes } = planOf(kidNames);
  $('#est-plan').innerHTML = planHtml(kidNames, table);
  const warns = [...clashes];
  if (missing.length) warns.push(`${missing.length} 項沒算進總額（價格未公布、沒勾孩子或沒勾週次）：${missing.join('、')}`);
  const fx = db.fx;
  $('#est-total').innerHTML = `<div class="est-sum"><span>合計約</span><b>NT$${fmtN(twd)}</b></div>
    <div class="est-cur">${Object.entries(byCur).map(([c, n]) => money(c, n)).join(' ＋ ') || '—'}</div>
    ${kidNames.length > 1 ? `<div class="est-kids">${kidNames.filter((k) => perKid.has(k)).map((k) => `${esc(k)} 約 NT$${fmtN(perKid.get(k))}`).join('｜')}</div>` : ''}
    ${warns.length ? `<ul class="warns">${warns.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
    <p class="hint">不含機票、家長住宿、當地交通、報名費、手足優惠和早鳥折扣；日營不含住宿。匯率 ${(Object.keys(byCur).length ? Object.keys(byCur) : ['MYR']).map((c) => `1 ${c} ≈ ${fx.rates[c] ?? '?'} TWD`).join('、')}（${esc(fx.asof.MYR)}）。</p>`;
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
  $('#foot').innerHTML = `資料查證到 ${esc(latest)}。匯率：${Object.keys(fx.rates).filter((c) => c !== 'TWD').map((c) => `1 ${c} ≈ ${fx.rates[c]} TWD`).join('、')}（${esc(fx.source)}，${esc(fx.asof.MYR)}）。<br>
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
    if (e.target.checked) picked.set(id, pickDefaults(lastCards.get(id)));
    else picked.delete(id);
    updateTray();
  });
  $('#tray-open').addEventListener('click', openCompare);
  $('#tray-est').addEventListener('click', openEstimate);
  $('#tray-clear').addEventListener('click', () => { picked.clear(); run(); });
  $('#cmp-body').addEventListener('input', (e) => {
    const sec = e.target.closest('.est-item');
    if (!sec) return;
    const p = picked.get(sec.dataset.id);
    if (e.target.dataset.k != null) {
      const i = Number(e.target.dataset.k);
      if (e.target.checked) p.kids.add(i); else p.kids.delete(i);
    }
    if (e.target.dataset.w != null) {
      const { w: mon, ws: start, we: end } = e.target.dataset;
      if (e.target.checked) p.weeks.set(mon, { mon, start, end }); else p.weeks.delete(mon);
      Object.assign(p, autoQty(p));
      const q = sec.querySelector('[data-q]');
      if (q) q.value = p.qty;
    }
    if (e.target.dataset.q != null) {
      const v = Number(e.target.value);
      if (v >= 0) { p.qty = v; p.qtyGuess = false; }
    }
    if (e.target.dataset.a != null) {
      const v = Number(e.target.value);
      if (e.target.value !== '' && v >= 0) p.amount = v;
    }
    updateEstimate();
  });
  $('#cmp-body').addEventListener('click', (e) => {
    const id = e.target.dataset?.del;
    if (!id) return;
    picked.delete(id);
    const box = document.querySelector(`[data-cmp="${id}"]`);
    if (box) box.checked = false;
    updateTray();
    if (picked.size) openEstimate(); else $('#cmp').close();
  });
  run();
}

main();

export { sessionSpan };
