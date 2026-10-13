import { buildDb, search, toTWD, perWeekEquiv, kidFit, kidsFor, sessionSpan, holidaysIn, defaultQty, taxRate, lineCost, UNIT, runWeeks, weeksQty, weeksIn, mondayOf, addDays, overlaps } from './lib/core.mjs';

const FILES = ['providers', 'programs', 'locations', 'sessions', 'reviews', 'conflicts', 'holidays', 'fx'];
const KL = ['Kuala Lumpur', 'Petaling Jaya', 'Subang Jaya', 'Puchong', 'Shah Alam', 'Selangor-other'];
// city chips per country: [key, label, data cities, hover note]
const COUNTRY_CHIPS = { MY: [
  ['kl', '大吉隆坡', KL, '含 PJ、Subang、Puchong、Shah Alam'],
  ['nsn', '森美蘭', ['Negeri Sembilan']],
  ['png', '檳城', ['Penang']],
  ['jb', '新山', ['Johor Bahru']],
  ['kk', '亞庇', ['Kota Kinabalu']],
  ['lgk', '浮羅交怡', ['Langkawi']],
  ['oth', '其他', ['other', 'Perak', 'Melaka', 'Kuching'], '怡保、紅土坎、彭亨、馬六甲等，以及資料裡其他沒歸類的城市'],
], TH: [
  ['bkk', '曼谷', ['Bangkok'], '含暖武里、北欖府 Bangna 一帶'],
  ['cnx', '清邁', ['Chiang Mai'], '含湄林（Mae Rim）、杭東等清邁府'],
], JP: [
  ['tyo', '東京', ['Tokyo'], '含橫濱、川崎、千葉、埼玉'],
  ['osa', '大阪', ['Osaka']],
  ['kyo', '京都', ['Kyoto']],
  ['kob', '神戶', ['Kobe'], '含蘆屋、西宮等阪神一帶'],
  ['fuk', '福岡', ['Fukuoka']],
  ['oka', '沖繩', ['Okinawa'], '沖繩本島'],
] };
const COUNTRIES = { MY: '馬來西亞', TH: '泰國', JP: '日本' };
const FLAG = { MY: '🇲🇾', TH: '🇹🇭', JP: '🇯🇵' };
// kid colour dot, same colour in the form and the week view
const AV = ['🦊', '🐼', '🐨', '🐰', '🐯', '🦁', '🐸', '🐙', '🦉', '🐧'];
const kidAv = (i) => `<b class="kid-av k${i % AV.length}">${AV[i % AV.length]}</b>`;
// base area per country: its cards sort first and its badge is plain. Thailand and Japan have no single base.
const HOME = { MY: KL, TH: [], JP: [] };
const HOME_ZH = { MY: '大吉隆坡', TH: null, JP: null };
let country = 'MY'; // country of the current search
// same set as SOLID in lib/core.mjs (week view); kept local so a cached old core.mjs can't break the import
const SOLID = new Set(['high', 'medium']);
// card badge and sort order: Klang Valley first, then everywhere else
const CITY_ZH = {
  'Johor Bahru': '新山', 'Kota Kinabalu': '亞庇', Penang: '檳城', Langkawi: '浮羅交怡', 'Negeri Sembilan': '森美蘭',
  Perak: '霹靂', Ipoh: '怡保', Lumut: '紅土坎', Pahang: '彭亨', Melaka: '馬六甲', Kuching: '古晉',
  Bangkok: '曼谷', 'Chiang Mai': '清邁',
  Tokyo: '東京', Osaka: '大阪', Kyoto: '京都', Kobe: '神戶', Fukuoka: '福岡', Okinawa: '沖繩',
};
const cityZh = (c) => (KL.includes(c) ? '大吉隆坡' : CITY_ZH[c] || '其他地區');
const citiesOf = (it) => [...new Set((it.locs || []).map((l) => cityZh(l.city)))];
const awayRank = (it) => (!HOME[country].length || it.locs?.some((l) => HOME[country].includes(l.city)) ? 0 : 1);
const homeFirst = (list) => [...list].sort((a, b) => awayRank(a) - awayRank(b));
const FORMATS = { day: '日營', residential: '住宿營', family_with_parent: '親子同行', parent_optional: '家長可同行' };
const LANG_ZH = { English: '英語', Japanese: '日語', Mandarin: '華語', French: '法語', ko: '韓語', Korean: '韓語', Thai: '泰語' };
// shown only when teaching is not English-only; no English at all gets the orange style
const langBadge = (langs = []) => (!langs.length || (langs.length === 1 && langs[0] === 'English') ? ''
  : `<span class="badge ${langs.includes('English') ? '' : 'lang-x'}">${langs.map((l) => LANG_ZH[l] || esc(l)).join('、')}授課</span>`);
const VENUES = { school: '學校校園', centre: '機構教室', hotel: '飯店', outdoor: '戶外場地', other: '其他場地' };
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
// dates the page accepts: the data runs 2023–2027 and estimates move up to three years on
const DATE_MIN = '2024-01-01';
const DATE_MAX = '2030-12-31';
const MAX_DAYS = 400;
const BIRTH_YEARS = [2006, 2025];
// kids carry a stable id, so picks, the schedule and costs don't depend on list position or on names
let kidSeq = 0;
const newKidId = () => `k${++kidSeq}`;
const freeKidName = (taken) => { for (let n = 1; ; n += 1) if (!taken.includes(`孩子 ${n}`)) return `孩子 ${n}`; };
const DEFAULT_Q = {
  start: '2027-01-17', end: '2027-02-08', country: 'MY', cities: COUNTRY_CHIPS.MY.map((c) => c[0]),
  kids: [{ name: '孩子 1', birth: '2016-05' }, { name: '孩子 2', birth: '2020-05' }],
  filters: {},
};
const STORE = 'camps-query-v2';
const OLD_STORE = 'camps-query-v1'; // defaulted to KL only

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
// source tier, in plain words (1 is the strongest)
const TIER = { 1: '官方訂位頁', 2: '官方簡章', 3: '官方社群', 4: '聚合站或媒體', 5: '代理商或部落格' };
const tierZh = (t) => TIER[t] || `第 ${t} 級`;
// what a source backs up; a key not listed here is shown as written
const FIELD_ZH = {
  price: '價格', age: '年齡', ages: '年齡', age_min: '年齡下限', age_max: '年齡上限', age_rule: '年齡算法', dates: '日期', start_date: '開始日', end_date: '結束日',
  start_dates: '開始日', period: '期間', pattern: '日期規律', schedule: '時程', season: '季節', summer: '暑假', summer_2026: '2026 暑假', summer_programme_2023: '2023 暑期課程',
  winter_camp: '寒假營', 'winter dates': '寒假日期', start_rule: '開課規則', min_duration_weeks: '最短週數', min_weeks: '最短週數', duration: '營期長度',
  hours: '上課時間', address: '地址', location: '地點', locations: '地點', venue: '場地', venues: '場地', campus: '校區', campuses: '校區', branch: '分校',
  branches: '分校', area: '地區', eligibility: '報名資格', grades: '年級', includes: '包含項目', excludes: '不含項目', lunch: '午餐', language: '授課語言',
  name: '名稱', staffing: '師資', staff: '師資', staff_ratio: '師生比', ratio: '師生比', class_size: '班級人數', class_size_max: '每班上限', group_size: '分組人數',
  contact: '聯絡方式', phone: '電話', website: '網站', facilities: '設施', facility: '設施', requirements: '報名要求', booking: '報名', registration: '報名',
  deadline: '截止日', refund: '退費', cancel: '取消規定', policy: '規定', payment: '付款', fees: '費用', cost: '費用', price_range: '價格範圍', discount: '折扣',
  format: '營隊形式', accommodation: '住宿', transport: '交通', pickup: '接送', bus: '校車', airport: '機場接送', distance: '距離', capacity: '名額', status: '狀態',
  existence: '機構是否仍在營運', listing: '刊登內容', program: '課程', programs: '課程', camps: '營隊', lessons: '課堂', activities: '活動', events: '活動', packs: '套裝方案',
  structure: '課程架構', safety: '安全', insurance: '保險', flex: '彈性選週', open_to_external: '外部學生可報', external: '外部學生', public_holiday: '公假', type: '類型',
  identity: '機構身分', provider: '機構', operator: '營運單位', organizer: '主辦單位', process: '流程', notes: '備註', note: '備註',
};
const fieldsZh = (fields) => [...new Set((fields || []).map((f) => FIELD_ZH[f] || f))];
const AUTHOR = { staff: '業者自述', editorial: '聚合站編輯', agent: '代理商刊登' };
// Rolling intakes and the estimate of a program+location share one card, so they share an id.
// Every other row is one session, and sessions can share a start date, so its id carries the session id.
const cardId = (it) => 'c-' + `${it.program.id}--${it.session.location_id || 'x'}${
  it.group === 'estimated' ? '--est' : it.group === 'unknown' || (it.span && !it.span.derived) ? `--${it.session.id}` : ''}`.replace(/[^a-z0-9-]/gi, '-');

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

const validDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;

// what is wrong with the dates, or null. short goes in the summary bar, long in the status line
function dateProblem(q) {
  if (!validDate(q.start) || !validDate(q.end)) return { short: '請填日期', long: '請填開始和結束日期。' };
  if (q.start > q.end) return { short: '日期有誤', long: '結束日不能早於開始日。' };
  if (q.start < DATE_MIN || q.end > DATE_MAX) return { short: '日期有誤', long: `日期請選 ${DATE_MIN.slice(0, 4)} 到 ${DATE_MAX.slice(0, 4)} 年之間。` };
  if (daysBetween(q.start, q.end) > MAX_DAYS) return { short: '日期有誤', long: `日期範圍太長，最多 ${MAX_DAYS} 天（約 13 個月），請縮短。` };
  return null;
}

// a saved query is only trusted field by field; anything of the wrong type falls back to its default
function sanitizeQuery(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const f = r.filters && typeof r.filters === 'object' && !Array.isArray(r.filters) ? r.filters : {};
  const datesOk = !dateProblem(r);
  const country = COUNTRIES[r.country] ? r.country : DEFAULT_Q.country;
  const chipKeys = Object.values(COUNTRY_CHIPS).flat().map((c) => c[0]);
  const list = (v, allowed) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && allowed.includes(x)) : []);
  const kidOk = (k) => {
    const m = k && typeof k.birth === 'string' && k.birth.match(/^(\d{4})-(\d{2})$/);
    return !!m && Number(m[1]) >= BIRTH_YEARS[0] && Number(m[1]) <= BIRTH_YEARS[1] && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  };
  let kids = Array.isArray(r.kids) ? r.kids.filter(kidOk) : null;
  if (!kids || (!kids.length && r.kids.length)) kids = DEFAULT_Q.kids;
  const names = [];
  kids = kids.map((k) => {
    const name = typeof k.name === 'string' && k.name.trim() ? k.name.trim().slice(0, 30) : freeKidName(names);
    names.push(name);
    return { id: newKidId(), name, birth: k.birth };
  });
  const budget = Number(f.budgetTWD);
  return {
    start: datesOk ? r.start : DEFAULT_Q.start,
    end: datesOk ? r.end : DEFAULT_Q.end,
    country,
    cities: Array.isArray(r.cities) ? list(r.cities, chipKeys) : DEFAULT_Q.cities,
    kids,
    kw: typeof r.kw === 'string' ? r.kw : '',
    filters: {
      formats: list(f.formats, Object.keys(FORMATS)),
      categories: list(f.categories, Object.keys(CATEGORIES)),
      budgetTWD: Number.isFinite(budget) && budget > 0 ? budget : null,
      lunch: f.lunch === true, flexible: f.flexible === true, noParent: f.noParent === true,
      languages: list(f.languages, ['Mandarin']),
    },
  };
}

function savedQuery() {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const cur = read(STORE);
  if (cur) return sanitizeQuery(cur);
  // keep an old saved query's kids and dates, but start from all cities
  const old = read(OLD_STORE);
  return sanitizeQuery(old && typeof old === 'object' ? { ...old, cities: undefined } : null);
}

function kidRow(k, i) {
  const [by, bm] = (k.birth || '2018-01').split('-');
  const years = [];
  for (let y = BIRTH_YEARS[1]; y >= BIRTH_YEARS[0]; y--) years.push(`<option ${String(y) === by ? 'selected' : ''}>${y}</option>`);
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(`<option value="${String(m).padStart(2, '0')}" ${m === Number(bm) ? 'selected' : ''}>${m} 月</option>`);
  return `<div class="kid" data-i="${i}" data-id="${esc(k.id)}">
    ${kidAv(i)}<input name="name" value="${esc(k.name)}" aria-label="名字">
    <select name="by" aria-label="出生年">${years.join('')}</select>
    <select name="bm" aria-label="出生月">${months.join('')}</select>
    <span class="age"></span>
    <button type="button" class="ghost small" data-del="${i}" aria-label="移除">移除</button>
  </div>`;
}

function renderForm(q) {
  const f = $('#q');
  f.start.min = DATE_MIN; f.start.max = DATE_MAX; f.end.min = DATE_MIN; f.end.max = DATE_MAX;
  f.start.value = q.start;
  f.end.value = q.end;
  $('#kids').innerHTML = q.kids.map(kidRow).join('');
  const c = COUNTRIES[q.country] ? q.country : 'MY';
  $('#countries').innerHTML = Object.entries(COUNTRIES).map(([k, label]) =>
    `<label class="chip"><input type="radio" name="country" value="${k}" ${k === c ? 'checked' : ''}><span>${FLAG[k]} ${label}</span></label>`).join('');
  const own = q.cities.filter((k) => COUNTRY_CHIPS[c].some((x) => x[0] === k));
  renderCities(c, own.length ? own : null);
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
  $('#presets').innerHTML = presets.map(([l, a, b]) => `<button type="button" class="ghost small preset" data-a="${a}" data-b="${b}">${esc(l)}</button>`).join('');
  $('#tw-hint').textContent = tw.length
    ? tw.map((h) => `台灣 ${h.name_zh}：${h.date_start} 至 ${h.date_end}（教育部行事曆）`).join('；') + '。'
    : '';
}

// picked: chip keys to tick; null ticks every city of the country
function renderCities(c, picked) {
  $('#cities').innerHTML = COUNTRY_CHIPS[c].map(([k, label, , note]) =>
    `<label class="chip" title="${esc(note || '')}"><input type="checkbox" name="city" value="${k}" ${!picked || picked.includes(k) ? 'checked' : ''}><span>${label}</span></label>`).join('');
}

function readForm() {
  const f = $('#q');
  const rows = [...document.querySelectorAll('.kid')];
  const typed = rows.map((el) => el.querySelector('[name=name]').value.trim());
  const taken = typed.filter(Boolean);
  const kids = rows.map((el, i) => {
    const name = typed[i] || freeKidName(taken);
    if (!typed[i]) taken.push(name);
    return { id: el.dataset.id, name, birth: `${el.querySelector('[name=by]').value}-${el.querySelector('[name=bm]').value}` };
  });
  const vals = (n) => [...f.querySelectorAll(`[name=${n}]:checked`)].map((x) => x.value);
  return {
    start: f.start.value, end: f.end.value, kids, country: f.country.value || 'MY', cities: vals('city'), kw: f.kw.value.trim(),
    filters: {
      formats: vals('format'), categories: vals('category'),
      budgetTWD: Number(f.budget.value) > 0 ? Number(f.budget.value) : null,
      lunch: f.lunch.checked, flexible: f.flexible.checked, noParent: f.noParent.checked,
      languages: f.mandarin.checked ? ['Mandarin'] : [],
    },
  };
}

function toSearchQuery(q) {
  // 「其他」also takes any city the chips don't name (Ipoh, Lumut, Pahang…), so new data never drops out
  const chips = COUNTRY_CHIPS[q.country] || COUNTRY_CHIPS.MY;
  const named = new Set(chips.flatMap((c) => c[2]));
  const rest = [...new Set(Object.values(db.locations).filter((l) => (l.country || 'MY') === q.country).map((l) => l.city))].filter((c) => !named.has(c));
  // every city ticked, or none, means the whole country: no city list, so camps with no known location stay in
  const own = q.cities.filter((k) => chips.some((c) => c[0] === k));
  const cities = own.length && own.length < chips.length
    ? own.flatMap((k) => [...(chips.find((c) => c[0] === k)?.[2] || []), ...(k === 'oth' ? rest : [])]) : [];
  return { ...q, cities };
}

// ---------- render helpers

function confBadge(c) {
  const [t, cls] = CONF[c] || ['?', ''];
  return `<span class="badge ${cls}">可信度 ${t}</span>`;
}

// what the operator says about venue, groups and staff, and safety; each a list of escaped lines
function venueParts(it) {
  const types = [...new Set(it.locs.map((l) => VENUES[l.venue_type]).filter(Boolean))];
  return [types.join('、'), it.program.facilities && esc(it.program.facilities)].filter(Boolean);
}

function staffParts(p) {
  return [p.staff_ratio && `師生比 ${esc(p.staff_ratio)}`, p.class_size_avg && `平均每班 ${esc(p.class_size_avg)} 人`,
    p.class_size_max && `每班最多 ${esc(p.class_size_max)} 人`, p.staffing && esc(p.staffing)].filter(Boolean);
}

function safetyParts(p) {
  const s = p.safety || {};
  return [s.first_aid && `急救：${esc(s.first_aid)}`, s.insurance === true && '有保險', s.cctv === true && '有監視器',
    s.notes && esc(s.notes)].filter(Boolean);
}

function kidsLine(it) {
  return it.kids.map((k, i) => {
    const mark = { yes: '✓', no: '✗ 不符', maybe: '？生日當月', unknown: '？' }[k.fit];
    return `<span class="kfit ${k.fit}">${AV[i % AV.length]} ${esc(k.name)}（${k.notBorn ? '還沒出生' : `${k.age} 歲`}）${mark}</span>`;
  }).join('');
}

function priceLine(s, nKids) {
  const p = s.price;
  if (!p || p.amount == null) return '未公布';
  const basis = BASIS[p.basis] || '計價方式未註明';
  const twd = toTWD(p.amount, p.currency, db.fx);
  const from = p.from ? ' 起' : ''; // the source only gives the lowest option
  let t = `<b class="p-main">${esc(p.currency)} ${fmtN(p.amount)}${from}／${basis}</b>${twd ? `<span class="p-twd">約 NT$${fmtN(twd)}${from}</span>` : ''}`;
  if (p.tax_included === true) t += '，含稅';
  if (p.tax_included === false) t += '，未含稅';
  if (p.tax_note) t += `<br><small class="quote">${esc(p.tax_note)}</small>`;
  if (nKids > 1) {
    const tot = p.amount * nKids;
    const tt = toTWD(tot, p.currency, db.fx);
    t += `<br>${nKids} 位合計${p.from ? '至少' : ''} ${esc(p.currency)} ${fmtN(tot)}／${basis}${tt ? `（約 NT$${fmtN(tt)}）` : ''}，未計手足優惠`;
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
    const past = it.past.map((p) => (p.end_date ? `${fmtD(p.start_date, true)}～${fmtD(p.end_date)}` : `${fmtD(p.start_date, true)}起，結束日未公布`));
    const basis = it.estimates.map((e) => e.estimate_basis).filter(Boolean);
    return '這一季的日期還沒公布。' + (past.length ? `<br>往年：${past.join('、')}` : '') + (basis.length ? `${past.length ? '<br>' : ''}<small class="quote">推估依據：${esc(basis[0])}</small>` : '') || '日期未公布';
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
    rows.push(`<li><a class="src" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.url)}</a>（${esc(tierZh(src.tier))}${src.fields?.length ? `，${fieldsZh(src.fields).map(esc).join('、')}` : ''}）${src.quote ? `<br><span class="quote">「${esc(src.quote)}」</span>` : ''}</li>`);
  }
  return `<h4>來源</h4><ul>${rows.join('')}</ul>`;
}

function conflictsBlock(it) {
  const list = [it.session.id, it.program.id, it.provider.id].flatMap((i) => db.conflicts[i] || []);
  if (!list.length) return '';
  return `<h4>來源說法不一</h4><ul>${list.map((c) => `<li>${esc(FIELD_ZH[c.field] || c.field)}：${(c.values || []).map((v) =>
    `${esc(v.value)}（<a href="${esc(v.source_url)}" target="_blank" rel="noopener">${esc(tierZh(v.tier))}</a>）`).join(' vs ')}${c.note ? `<br><small class="quote">${esc(c.note)}</small>` : ''}</li>`).join('')}</ul>`;
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
    ${p.facilities ? `<h4>場地設施</h4><p>${esc(p.facilities)}</p>` : ''}
    ${staffParts(p).length ? `<h4>分組與師資</h4><p>${staffParts(p).join('<br>')}</p>` : ''}
    ${safetyParts(p).length ? `<h4>安全</h4><p>${safetyParts(p).join('<br>')}</p>` : ''}
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

// ---------- results: one card per organisation, sessions inside

// traffic light per session: dated and official → green, dated but aggregator/agent only → yellow, undated → gray
const lightOf = (it) => (it.group === 'estimated' ? 'gray' : SOLID.has(it.session.confidence) ? 'green' : 'yellow');
const LIGHT = { green: ['🟢', '官方日期', '可信度高或中'], yellow: ['🟡', '要先問', '只有聚合站或代理商寫'], gray: ['⚪', '照往年推測', '這一季的日期還沒公布，日期和價格是往年的'] };
const LIGHT_RANK = { green: 0, yellow: 1, gray: 2 };
const shownLights = new Set(['green', 'yellow']);
let lightsTouched = false; // once the parent clicks a light, stop choosing the default for them
let useLastYear = true; // week view: place undated camps on last year's week
let sortBy = 'rec';
let lastR = null; // results after the name filter
let lastRAll = null; // results before it, so a week chip can find a row the name filter hides
// one chip / card per provider (branches, intakes, programs); agent packages group on the school they
// sell, because two agents often sell the same school
// agent name without the English note in brackets: 「MEC Academy & Training Centre」
const agentShort = (pv) => (pv.name_zh || pv.name_en || '').replace(/\s*\([^)]*\)\s*$/, '');
const keyOf = (it) => (it.provider.type === 'agent_package' && it.session.location_id ? `loc:${it.session.location_id}` : `prov:${it.provider.id}`);
// per-child weekly price in TWD, for sorting and the big number on cards
// An undated card has no span of its own: its price is spread over the length of the session it shows,
// the same span the budget filter in core uses.
const spanFor = (it) => it.span || sessionSpan(it.session);
const weekTWD = (it) => { const v = perWeekEquiv(it.session.price, spanFor(it)); return v == null ? null : toTWD(v, it.session.price.currency, db.fx); };
const minOf = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.min(...v) : null; };
// sort key: dated cards by their start, undated ones by where they sit on this year's calendar
const startOf = (it) => it.span?.start || it.sortStart || '9999';

function shortDates(it) {
  if (it.group === 'estimated') {
    const p0 = it.session.date_status === 'confirmed_other_year' && it.session.start_date ? it.session : it.past?.find((x) => x.start_date);
    if (!p0) return '日期未公布';
    return `${p0.start_date.slice(0, 4)} 年 ${md(p0.start_date)}${p0.end_date ? `–${md(p0.end_date)}` : ' 起'}`;
  }
  if (it.intakes) return `${it.intakes.length} 個開課日，${md(it.intakes[0].span.start)} 起`;
  return it.span ? `${md(it.span.start)}–${md(it.span.end)}` : '日期未公布';
}

// the full facts of one session, shown when its row opens
function sessionBody(it) {
  const p = it.program;
  const s = it.session;
  const nKids = it.kids.filter((k) => k.fit !== 'no').length;
  const hours = p.hours?.start ? `${esc(p.hours.start)}–${esc(p.hours.end || '?')}${p.hours.days ? `，${esc(p.hours.days)}` : ''}` : '未公布';
  const lunch = p.includes?.lunch === true ? '含午餐' : p.includes?.lunch === false ? '不含午餐' : '午餐未公布';
  return `<div class="badges">${confBadge(s.confidence)}<span class="badge ${it.group === 'estimated' ? 'est' : ''}">${STATUS[s.date_status]}</span>${langBadge(p.language_of_instruction)}</div>
    <dl class="facts">
      <dt>📅 日期</dt><dd>${datesLine(it)}</dd>
      <dt>📍 地點</dt><dd>${locLine(it.locs)}</dd>
      <dt>🧒 年齡</dt><dd>${p.age_min ?? '?'}–${p.age_max ?? '?'} 歲<br>${kidsLine(it)}</dd>
      <dt>⏰ 時間</dt><dd>${hours}，${lunch}</dd>
      <dt>💰 價格</dt><dd class="price">${priceLine(s, nKids)}</dd>
      <dt>⭐ 評價</dt><dd class="rev">${reviewSummary(reviewsOf(it))}</dd>
    </dl>
    ${it.warnings?.length ? `<ul class="warns">${it.warnings.map((w) => `<li class="w-${w.code}">${esc(w.text)}</li>`).join('')}</ul>` : ''}
    ${detailsBlock(it)}`;
}

// the "add to estimate" toggle: a label around the checkbox, so the tray and picks work off the checkbox's change event
const addToggle = (id, extra = '') => `<label class="add-est${extra}"><input type="checkbox" data-cmp="${id}" ${picked.has(id) ? 'checked' : ''}><span class="a-off">＋ 加入試算</span><span class="a-on">✓ 已加入試算</span></label>`;

function sessionRow(it, open) {
  const id = cardId(it);
  lastCards.set(id, it);
  const l = lightOf(it);
  const w = weekTWD(it);
  // a card that mixes programs or agents says which one each row is
  const sub = [it.programs > 1 && esc(it.program.name), it.mixedAgents && `代理：${esc(agentShort(it.provider))}`].filter(Boolean).join('・');
  const place = it.locs[0] ? `${esc(it.locs[0].name)}${citiesOf(it)[0] && !HOME[country].includes(it.locs[0].city) ? `・${esc(citiesOf(it)[0])}` : ''}` : '地點未公布';
  return `<div class="srow l-${l}" id="${id}" data-start="${startOf(it)}"><details ${open ? 'open' : ''}><summary>
      <i class="dot d-${l}" title="${LIGHT[l][1]}"></i><span class="s-d">${shortDates(it)}</span>
      <span class="s-p"><span>${place}</span>${sub ? `<small>${sub}</small>` : ''}</span><span class="s-w">${w != null ? `NT$${fmtN(w)}${l === 'gray' && it.session.year ? `<small class="py">${it.session.year} 年價</small>` : ''}` : ''}</span></summary>
      <div class="s-body">${it.group === 'unknown' ? '' : addToggle(id)}${sessionBody(it)}</div></details></div>`;
}

function orgCard(items) {
  const it0 = items[0];
  const p = it0.program;
  const agent = it0.provider.type === 'agent_package';
  const progNames = [...new Set(items.map((x) => x.program.name))];
  const agentNames = [...new Set(items.filter((x) => x.provider.type === 'agent_package').map((x) => agentShort(x.provider)))];
  for (const x of items) { x.programs = progNames.length; x.mixedAgents = agentNames.length > 1; }
  const title = agent ? it0.locs[0]?.name || it0.program.name : `${it0.provider.name_en}${it0.provider.name_zh ? `・${it0.provider.name_zh}` : ''}`;
  const sub = agent ? `<div class="prov">${esc(it0.program.name)}<br>代理：${agentNames.map(esc).join('、')}</div>` : '';
  const prices = items.map(weekTWD);
  const low = minOf(prices);
  const varies = low != null && (prices.some((x) => x !== low) || items.some((x) => x.session.price?.from));
  const KF = {
    yes: ['✓', '所有梯次都符合'], no: ['✗', '所有梯次都不符'], part: ['部分', '部分梯次符合，部分不符'],
    maybe: ['△', '孩子生日在開營當月，年齡差一歲可能不符'], unknown: ['?', '年齡限制未公布'],
  };
  const kidFitAll = it0.kids.map((k, i) => {
    const kf = items.map((x) => x.kids[i]).filter(Boolean);
    const set = new Set(kf.map((x) => x.fit));
    const v = set.size === 1 ? [...set][0] : set.has('no') ? 'part' : set.has('unknown') ? 'unknown' : 'maybe';
    const ages = kf.map((x) => x.age);
    const lo = Math.min(...ages);
    const hi = Math.max(...ages);
    const ageT = kf.every((x) => x.notBorn) ? '還沒出生' : lo === hi ? `${lo} 歲` : `${lo}–${hi} 歲`;
    return `<span class="kf ${v}" title="${esc(k.name)}（${ageT}）：${KF[v][1]}">${kidAv(i)}${KF[v][0]}</span>`;
  }).join('');
  const best = lightOf(it0);
  const allGray = items.every((x) => lightOf(x) === 'gray');
  const nWarn = new Set(items.flatMap((x) => (x.warnings || []).map((w) => w.text))).size;
  // outside home: the city; at home: the venue. A city we have no name for falls back to the venue too.
  const places = [...new Set(items.map((x) => {
    const city = citiesOf(x)[0];
    const away = city && !HOME[country].includes(x.locs?.[0]?.city);
    return away && city !== '其他地區' ? city : x.locs?.[0]?.name || city || '';
  }).filter(Boolean))];
  const where = places.length > 1 ? `${places.length} 個地點` : places[0] || '地點未公布';
  const when = items.length === 1 ? shortDates(it0) : `${shortDates(items[0]).replace(/^\d{4} 年 /, '')} 等 ${items.length} 梯`;
  const priceTxt = low != null ? `每週 NT$${fmtN(low)}${varies ? ' 起' : ''}${allGray ? '（往年價）' : ''}` : '價格未公布';
  const tags = [p.includes?.lunch === true ? '<span class="tag">🍱 午餐</span>' : '', langBadge(p.language_of_instruction)].filter(Boolean).slice(0, 2).join('');
  const one = items.length === 1;
  const warn = nWarn ? ' <span class="o2-warn" title="展開後有注意事項">⚠</span>' : '';
  return `<article class="card org2 b-${best}">
    <div class="o2-head"><div class="o2-ttl"><h3>${esc(title)}</h3>${sub}</div><span class="o2-kids">${kidFitAll}</span></div>
    <div class="o2-line">${esc(when)}・${esc(where)}・<b>${priceTxt}</b></div>
    ${tags ? `<div class="o2-tags">${tags}</div>` : ''}
    <details class="o2-more${one ? ' one' : ''}" data-org="${esc(keyOf(it0))}"><summary><span class="o2-ar">▸</span> ${one ? '看細節' : `看 ${items.length} 個梯次`}${warn}</summary>
      <div class="sessions">${items.map((x) => sessionRow(x, one)).join('')}</div></details>
  </article>`;
}

function renderResults() {
  const r = lastR;
  if (!r) return;
  // rows the parent opened stay open when the list is drawn again
  const openRows = new Set([...document.querySelectorAll('#results .srow')].filter((el) => el.querySelector('details').open).map((el) => el.id));
  const openOrgs = new Set([...document.querySelectorAll('#results .o2-more')].filter((d) => d.open).map((d) => d.dataset.org));
  const unknownOpen = !!$('#results .unknown-list')?.open;
  const pool = [...r.full, ...r.partial, ...r.estimated];
  const n = { green: 0, yellow: 0, gray: 0 };
  for (const it of pool) n[lightOf(it)]++;
  const orgs = new Map();
  for (const it of pool) {
    if (!shownLights.has(lightOf(it))) continue;
    const k = keyOf(it);
    if (!orgs.has(k)) orgs.set(k, []);
    orgs.get(k).push(it);
  }
  const list = [...orgs.values()].map((items) => items.sort((a, b) => LIGHT_RANK[lightOf(a)] - LIGHT_RANK[lightOf(b)] || awayRank(a) - awayRank(b) || startOf(a).localeCompare(startOf(b))));
  const price = (items) => minOf(items.map(weekTWD)) ?? 1e12;
  // a card sorts by the earliest start among all its rows
  const first = (items) => items.map(startOf).reduce((m, x) => (x < m ? x : m));
  const cmp = {
    rec: (a, b) => LIGHT_RANK[lightOf(a[0])] - LIGHT_RANK[lightOf(b[0])] || Math.min(...a.map(awayRank)) - Math.min(...b.map(awayRank)) || price(a) - price(b),
    price: (a, b) => price(a) - price(b),
    date: (a, b) => first(a).localeCompare(first(b)),
  }[sortBy];
  list.sort(cmp);
  lastCards = new Map();
  const grayOn = shownLights.has('gray');
  $('#bar').innerHTML = `<div class="show2"><span class="lbl">顯示</span>
      <button type="button" class="opt2 ${grayOn ? '' : 'on'}" data-show="dated" aria-pressed="${!grayOn}">有日期的 <b>${n.green + n.yellow}</b></button>
      <button type="button" class="opt2 ${grayOn ? 'on' : ''}" data-show="all" aria-pressed="${grayOn}">加上照往年推測的 <b>+${n.gray}</b></button></div>
    <div class="sort2"><span class="lbl">排序</span>${[['rec', '推薦'], ['price', '最便宜'], ['date', '最早']].map(([k, v]) =>
    `<button type="button" class="${k === sortBy ? 'on' : ''}" data-sort="${k}" aria-pressed="${k === sortBy}">${v}</button>`).join('')}</div>
    <div class="legend2"><i class="dot d-green"></i>官方日期 <i class="dot d-yellow"></i>要先問 <i class="dot d-gray"></i>照往年推測</div>`;
  const hidden = Object.keys(n).filter((k) => !shownLights.has(k)).reduce((t, k) => t + n[k], 0);
  const empty = hidden ? '有日期的梯次裡沒有符合的，點上面「加上照往年推測的」看日期還沒公布的。' : '沒有符合的梯次。可以放寬條件：換日期、多選幾個城市，或取消進階篩選和名稱。';
  $('#results').innerHTML = `${list.length ? '<p class="kf-legend">孩子：✓ 符合，✗ 不符，部分 ＝ 只有部分梯次符合，△ ＝ 生日在開營當月，? ＝ 年齡未公布。</p>' : ''}
    <div class="cards">${list.map(orgCard).join('') || `<p class="group-note">${empty}</p>`}</div>` +
    (r.unknown.length ? `<details class="more unknown-list" ${unknownOpen ? 'open' : ''}><summary>還有 ${r.unknown.length} 筆這段期間查不到日期（點開）</summary><ul>${homeFirst(r.unknown).map((x) => {
      const id = cardId(x);
      lastCards.set(id, x);
      const pr = x.session.price;
      return `<li>${esc(x.provider.name_en)}：${esc(x.program.name)}${x.locs?.[0] ? `（${esc(x.locs[0].name)}，${esc(cityZh(x.locs[0].city))}）` : ''}${pr?.amount != null ? `，${money(pr.currency, pr.amount)}${pr.from ? ' 起' : ''}／${BASIS[pr.basis] || '?'}` : ''}　<a href="${esc(x.session.source_url)}" target="_blank" rel="noopener">查證頁</a>${addToggle(id, ' sm')}</li>`;
    }).join('')}</ul></details>` : '');
  for (const d of document.querySelectorAll('#results .o2-more')) if (openOrgs.has(d.dataset.org)) d.open = true;
  for (const id of openRows) { const d = document.getElementById(id)?.querySelector('details'); if (d) d.open = true; }
  updateTray();
}

const itemsOf = (r) => [...r.full, ...r.partial, ...r.estimated];

// jump from the week view to a session row: turn its light on and clear a name filter if either hides it, open it, scroll to it
function openSession(id) {
  let el = document.getElementById(id);
  if (!el && lastRAll) {
    const it = itemsOf(lastRAll).find((x) => cardId(x) === id);
    if (it) {
      lightsTouched = true;
      shownLights.add(lightOf(it));
      const f = $('#q');
      if (f.kw.value.trim() && !itemsOf(lastR).some((x) => cardId(x) === id)) {
        f.kw.value = '';
        run({ force: true });
      } else renderResults();
      el = document.getElementById(id);
    }
  }
  if (!el) return;
  const more = el.closest('.o2-more');
  if (more) more.open = true;
  el.querySelector('details').open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// per week and kid: undated camps that ran in this week last time (placed in core, see weekShiftSpan)
function lastYearWeeks(r, estAll) {
  const placed = estAll.filter((it) => it.placed).map((it) => ({ it, ly: it.placed }));
  return r.weeks.map((w) => w.perKid.map((k, i) => placed
    .filter(({ it, ly }) => overlaps(ly.start, ly.end, w.mon, w.fri) && it.kids[i]?.fit !== 'no')
    .map(({ it }) => it)));
}

// one chip per provider (branches, intakes, programs); agent packages group on the school they sell
function mergeChips(list, skip = new Set()) {
  const g = new Map();
  for (const it of new Map(list.map((x) => [cardId(x), x])).values()) {
    const k = keyOf(it);
    if (skip.has(k)) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(it);
  }
  const price = ([, xs]) => minOf(xs.map(weekTWD)) ?? 1e12;
  return [...g].sort((a, b) => Math.min(...a[1].map(awayRank)) - Math.min(...b[1].map(awayRank)) || price(a) - price(b));
}

// What each week-by-kid cell shows. The headline counts gaps from these same lists, so it can't disagree with the table.
function weekCells(r, ly) {
  return r.weeks.map((w, wi) => w.perKid.map((k, i) => {
    const solid = mergeChips(k.solid);
    const weak = mergeChips(k.weak, new Set(solid.map(([key]) => key)));
    const last = useLastYear ? mergeChips(ly[wi][i], new Set([...solid, ...weak].map(([key]) => key))) : [];
    return { solid, weak, last, gap: k.gap };
  }));
}

function weekTable(r, cells) {
  const short = (t) => t.replace(/\s*\(.*\)|（.*）/g, '').trim();
  // long names end on a whole word, without a dangling "for" or "of"
  const clip = (t) => (t.length <= 30 ? t : `${t.slice(0, t.lastIndexOf(' ', 30)).replace(/\s+(for|of|and|the|&|at|in)$/i, '')}…`);
  const chip = ([k, items], weak) => {
    const it = items[0];
    let t = clip(short(k.startsWith('loc:') ? it.locs[0]?.name || it.provider.name_en : it.provider.name_en));
    const cities = [...new Set(items.flatMap(citiesOf))];
    if (cities.length === 1 && cities[0] !== HOME_ZH[country]) t += `・${cities[0]}`;
    if (items.length > 1) t += ` ×${items.length}`;
    const w = minOf(items.map(weekTWD));
    const tip = items.map((x) => `${x.provider.name_en}：${x.program.name}（${x.locs[0]?.name || '地點未公布'}，${citiesOf(x).join('、') || '城市未知'}）`).join('\n');
    const kind = weak === 'ly' ? 'ly' : weak ? 'weak' : '';
    const sub = kind === 'ly' ? `照 ${it.placed.year} 年${w != null ? `・NT$${fmtN(w)}` : ''}` : w != null ? `NT$${fmtN(w)}/週` : '';
    return `<a class="opt ${kind}" href="#${cardId(it)}" data-go="${cardId(it)}" title="${esc(tip)}"><span>${esc(t)}</span>${sub ? `<small>${sub}</small>` : ''}</a>`;
  };
  const LY_MAX = 3;
  const head = `<tr><th>週</th>${r.weeks[0]?.perKid.map((k, i) => `<th>${kidAv(i)} ${esc(k.kid.name)}</th>`).join('') || ''}</tr>`;
  const rows = r.weeks.map((w, wi) => `<tr><td class="wk"><b>${fmtD(w.mon)}</b><span class="wk-to">～${fmtD(w.fri)}</span>${w.holidays.map((h) =>
    `<span class="hol">📌 ${fmtD(h.date_start)} ${esc(h.name_zh || h.name_en)}${h.status === 'estimated' ? '（推算）' : ''}</span>`).join('')}</td>${w.perKid.map((k, i) => {
    const { solid, weak, last } = cells[wi][i];
    const more = weak.length ? `<details class="weakmore"><summary>${k.gap ? '' : '另有 '}${weak.length} 個要先問</summary>${weak.map((g) => chip(g, true)).join('')}</details>` : '';
    const lyHtml = last.length ? last.slice(0, LY_MAX).map((g) => chip(g, 'ly')).join('') +
      (last.length > LY_MAX ? `<details class="weakmore"><summary>再 ${last.length - LY_MAX} 個照往年排</summary>${last.slice(LY_MAX).map((g) => chip(g, 'ly')).join('')}</details>` : '') : '';
    const cls = !k.gap ? 'is-ok' : last.length ? 'is-ly' : 'is-gap';
    const flag = !k.gap ? '' : last.length ? `<span class="gap ly">${w.mon.slice(0, 4)} 未公布</span>` : '<span class="gap">空窗</span>';
    return `<td data-k="${esc(k.kid.name)}" data-kid="${esc(k.kid.id)}" class="${cls}">${flag}${solid.map((g) => chip(g, false)).join('')}${lyHtml}${more}</td>`;
  }).join('')}</tr>`).join('');
  const anyLy = cells.some((wk) => wk.some((c) => c.last.length));
  return `<h2 class="sec-h" id="sec-weeks"><span class="sec-ic">🗓️</span>週視圖<small>每週每位孩子能報哪些營，標籤上是每週每人價格，點標籤跳到那一梯</small></h2>
    <div class="legend"><span><span class="lg ok"></span>有官方日期的營</span>${useLastYear ? '<span><span class="lg ly"></span>還沒公布日期，照往年同一週先排</span>' : ''}<span><span class="lg gap"></span>空窗：這週沒有官方日期的營${useLastYear ? '，往年也沒有' : ''}（「要先問」的不算）</span><span>📌 ${COUNTRIES[country]}平日公假</span></div>
    ${anyLy || !useLastYear ? `<label class="ly-switch"><input type="checkbox" id="use-ly" ${useLastYear ? 'checked' : ''}>日期還沒公布的營，先照往年同一週排進來（灰色虛線標籤，往年日期換到今年同一個星期幾）</label>` : ''}
    <div class="weeks-scroll"><table class="weeks"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    <p class="group-note">同一機構的分校和梯次、代理商賣的同一所學校，合併成一個標籤，×2 表示有兩個選項，價格取最低的。${country === 'MY' ? '外地的標籤' : '標籤'}後面加城市。</p>`;
}

const yr = (d) => d.slice(0, 4);
// 「2027 年 1/17–2/8」, or both years when the range crosses one
function rangeLabel(a, b) {
  return yr(a) === yr(b) ? `${yr(a)} 年 ${md(a)}–${md(b)}` : `${yr(a)} 年 ${md(a)}–${yr(b)} 年 ${md(b)}`;
}
const yearsLabel = (a, b) => (yr(a) === yr(b) ? `${yr(a)} 年` : `${yr(a)}–${yr(b)} 年`);

function filterCount(q) {
  const f = q.filters || {};
  return [q.kw, f.formats?.length, f.categories?.length, f.budgetTWD, f.lunch, f.flexible, f.noParent, f.languages?.length].filter(Boolean).length;
}

function qSummary(q, problem) {
  const n = q.kids.length;
  const total = COUNTRY_CHIPS[q.country]?.length;
  const cityN = !q.cities.length || q.cities.length === total ? '全部城市' : `${q.cities.length} 個城市`;
  const nf = filterCount(q);
  return `<b>${problem ? problem.short : rangeLabel(q.start, q.end)}</b>・${n ? `${n} 位孩子` : '還沒加孩子'}・${FLAG[q.country]} ${COUNTRIES[q.country]}（${cityN}）${nf ? `・已篩選 ${nf} 項` : ''}`;
}

// nothing to search: say why and drop the old results instead of leaving them on screen
function showProblem(msg) {
  lastR = null;
  lastRAll = null;
  lastCards = new Map();
  $('#summary').innerHTML = '';
  $('#weeks').innerHTML = '';
  $('#bar').innerHTML = '';
  $('#results').innerHTML = '';
  $('#sec-camps').hidden = true;
  $('#status').textContent = msg;
  updateTray();
}

function render(q, problem) {
  country = COUNTRIES[q.country] ? q.country : 'MY';
  $('#qsum-t').innerHTML = qSummary(q, problem);
  if (problem || !q.kids.length) {
    showProblem(problem ? problem.long : '請至少加一位孩子。');
    return;
  }
  $('#sec-camps').hidden = false;
  const sq = toSearchQuery(q);
  const r = search(db, sq);
  const estAll = r.estimated; // before the name filter, like the week view
  lastRAll = { full: r.full, partial: r.partial, estimated: r.estimated, unknown: r.unknown };
  const ly = lastYearWeeks(r, estAll);
  const cells = weekCells(r, ly);
  const gapWeeks = cells.filter((row) => row.some((c) => c.gap && !c.last.length)).length;
  const lyWeeks = cells.filter((row) => row.some((c) => c.gap && c.last.length)).length;
  $('#status').innerHTML = '';
  const kw = (q.kw || '').toLowerCase();
  if (kw) {
    for (const g of ['full', 'partial', 'estimated', 'unknown']) r[g] = r[g].filter((it) => haystack(it).includes(kw));
    const n = r.full.length + r.partial.length + r.estimated.length + r.unknown.length;
    $('#status').innerHTML = `名稱篩選「${esc(q.kw)}」：結果只列名稱或上課場地含這個字的梯次，週視圖仍是全部。` +
      (n ? '' : `<br>${elsewhere(kw, sq)}`);
  }
  const all = [...r.full, ...r.partial, ...r.estimated];
  const nOrg = new Set(all.map(keyOf)).size;
  const nGray = all.filter((x) => lightOf(x) === 'gray').length;
  const nDated = all.length - nGray;
  // mostly undated (summer before the camps publish): show the estimates by default and say so up top
  const mostlyPast = nGray > nDated;
  if (!lightsTouched) { if (mostlyPast) shownLights.add('gray'); else shownLights.delete('gray'); }
  const isPast = q.end < new Date().toISOString().slice(0, 10);
  const [flag, flagCls] = !r.weeks.length ? ['這段期間只有週末，沒有平日可排', 'mid']
    : isPast ? ['🕘 這段期間已經過去，沒有可查的資料', 'mid']
      : !(lastRAll.full.length + lastRAll.partial.length + lastRAll.estimated.length) ? ['這段期間查不到梯次，無法判斷空窗', 'mid']
        : gapWeeks ? [`⚠️ ${gapWeeks} 週有孩子空窗`, 'bad'] : lyWeeks ? [`🗓️ ${lyWeeks} 週只有往年日期可排`, 'mid'] : ['🎉 每週都有官方日期的營', 'ok'];
  const years = yearsLabel(q.start, q.end);
  $('#summary').innerHTML = `<div class="headline"><div><h2>${rangeLabel(q.start, q.end)}，${FLAG[country]} ${COUNTRIES[country]}找到 <em>${all.length}</em> 個梯次</h2>
    <p>來自 ${nOrg} 個機構。🟢 ${all.filter((x) => lightOf(x) === 'green').length} 個有官方日期、🟡 ${all.filter((x) => lightOf(x) === 'yellow').length} 個要先問、⚪ ${nGray} 個照往年推測。</p></div>
    <a class="gapflag ${flagCls}" href="#sec-weeks">${flag}</a></div>
    ${mostlyPast ? `<div class="past-note"><b>這段期間的營隊，大多還沒公布 ${years}的日期。</b>
      <p>${all.length} 個梯次裡，${nDated} 個有 ${years}的日期，${nGray} 個還沒有。還沒有的先照往年的日期排，週視圖用灰色虛線標出，價格也是往年的。</p>
      <p>報名前要再向機構確認日期和價格。資料查證到 ${esc(latestVerified())}。</p></div>` : ''}`;
  $('#weeks').innerHTML = r.weeks.length ? weekTable(r, cells) : '';
  lastR = r;
  renderResults();
  maybeTour();
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

// Revalidate the picks against the kids and dates on the form now. A card shown again is refreshed from
// the new results; one that is not (another country, other dates) gets its kids re-fitted. Kids who no
// longer fit, or who were removed, drop out of the pick.
function refreshPicks() {
  if (!picked.size) return;
  const q = readForm();
  const win = dateProblem(q) ? null : { start: q.start, end: q.end };
  for (const [id, p] of picked) {
    if (lastCards.has(id)) p.it = lastCards.get(id);
    else if (win) {
      const it = p.it;
      it.kids = it.span && !it.intakes ? kidsFor(it.program, q.kids, it.span.start) : kidsFor(it.program, q.kids, it.span?.start || win.start, it.span?.end || win.end);
    }
    p.kids = new Set([...p.kids].filter((kid) => p.it.kids.some((k) => k.id === kid && k.fit !== 'no')));
  }
}

function updateTray() {
  refreshPicks();
  const n = picked.size;
  const stale = [...picked.keys()].filter((id) => !lastCards.has(id)).length;
  $('#tray').hidden = n === 0;
  $('#tray-n').textContent = `已選 ${n} 個${stale ? `（${stale} 個不在目前結果）` : ''}`;
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
    ['場地', (it) => venueParts(it).join('<br>') || '未公布'],
    ['年齡', (it) => `${it.program.age_min ?? '?'}–${it.program.age_max ?? '?'} 歲<br>${kidsLine(it)}`],
    ['形式', (it) => FORMATS[it.program.format] || esc(it.program.format)],
    ['上課語言', (it) => (it.program.language_of_instruction || []).map((l) => LANG_ZH[l] || esc(l)).join('、') || '未公布'],
    ['時間', (it) => (it.program.hours?.start ? `${esc(it.program.hours.start)}–${esc(it.program.hours.end || '?')}` : '未公布')],
    ['午餐', (it) => ({ true: '含', false: '不含' }[it.program.includes?.lunch] || '未公布')],
    ['分組與師資', (it) => staffParts(it.program).join('<br>') || '未公布'],
    ['安全', (it) => safetyParts(it.program).join('<br>') || '未公布'],
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
  const span = sessionSpan(it.session);
  return { span, past: !!span };
}

const PER_WHOLE = new Set(['per_camp', 'per_session']);
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
// the dates on the form; empty when they can't be searched (no weeks come out of empty dates)
const searchWin = () => { const q = readForm(); return dateProblem(q) ? { start: '', end: '' } : { start: q.start, end: q.end }; };

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
    kids: new Set(it.kids.filter((k) => k.fit !== 'no').map((k) => k.id)),
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
  const atLeast = pr.from && p.amount === pr.amount; // a from-price the parent hasn't replaced
  let html = `${atLeast ? '起價 ' : ''}${money(pr.currency, p.amount)}／${BASIS[pr.basis] || '?'} × ${p.qty} ${UNIT[pr.basis] || '單位'} × ${p.kids.size} 位`;
  if (c.tax) html += ` ＝ ${money(pr.currency, c.base)}，加 ${Math.round(taxRate(pr) * 100)}% 稅 ${money(pr.currency, c.tax)}`;
  html += ` ＝ <b>${atLeast ? '至少 ' : ''}${money(pr.currency, c.total)}</b>${twd ? `（約 NT$${fmtN(twd)}）` : ''}`;
  if (p.amount !== pr.amount) html += `<br><small>單價是你改的，業者公布的是 ${money(pr.currency, pr.amount)}</small>`;
  const min = p.it.session.min_duration_weeks;
  if (p.kind === 'rolling' && min > 1 && p.weeks.size < min) html += `<br><small class="warn-txt">這個營最少要報 ${min} 週</small>`;
  return { id, html, c, twd, cur: pr.currency, atLeast };
}

function estNotes(p) {
  const { it } = p;
  const s = it.session;
  const pr = s.price || {};
  const notes = [];
  if (pr.amount != null && pr.from) notes.push('業者只寫起價（from），實際價格可能更高；問到實價可以直接改單價');
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
        <div class="est-h"><b>${esc(it.program.name)}</b><span class="prov">${esc(it.provider.name_en)}${it.locs[0] ? `・${esc(it.locs[0].name)}` : ''}${lastCards.has(id) ? '' : '（不在目前結果）'}</span>
          <button type="button" class="ghost est-del" data-del="${id}" aria-label="移除">移除</button></div>
        <div class="est-meta">${when}・${STATUS[it.session.date_status]}</div>
        <div class="est-ctl"><span class="lbl">孩子</span><span class="chips">${it.kids.map((k) => `<label class="chip sm"><input type="checkbox" data-k="${esc(k.id)}" ${p.kids.has(k.id) ? 'checked' : ''} ${k.fit === 'no' ? 'disabled' : ''}><span>${esc(k.name)}（${k.notBorn ? '還沒出生' : `${k.age} 歲`}）${k.fit === 'no' ? ' 年齡不符' : ''}</span></label>`).join('')}</span></div>
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
function planOf(kidList) {
  const win = searchWin();
  const rows = new Map(weeksIn(win.start, win.end).map((w) => [w.mon, []]));
  for (const p of picked.values()) for (const m of p.weeks.keys()) if (!rows.has(m)) rows.set(m, []);
  const clashes = [];
  const table = [...rows.keys()].sort().map((mon) => {
    const cells = kidList.map(({ id: kidId, name }) => {
      const here = [...picked.values()].filter((p) => p.weeks.has(mon) && p.kids.has(kidId));
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

function planHtml(kidList, table) {
  if (!table.some((r) => r.cells.some((c) => c.here.length))) return '';
  // the venue name alone when it already carries the brand (Newtonshow Bangsar), else brand plus venue
  const label = (p) => {
    const brand = shortName(p.it);
    const loc = p.it.locs[0]?.name || '';
    const own = loc && loc.split(' ')[0] === brand.split(' ')[0];
    return `<span class="plan-opt" title="${esc(p.it.provider.name_en)}・${esc(p.it.program.name)}">${esc(own ? loc : brand)}${loc && !own ? `<small>${esc(loc)}</small>` : ''}${p.kind === 'undated' ? '<small>日期未定</small>' : ''}</span>`;
  };
  return `<h3 class="est-sub">排程</h3><div class="cmp-scroll"><table class="weeks plan"><thead><tr><th>週</th>${kidList.map((k) => `<th>${esc(k.name)}</th>`).join('')}</tr></thead><tbody>
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
  const kidList = readForm().kids;
  for (const l of lines.filter((x) => x.c)) {
    byCur[l.cur] = (byCur[l.cur] || 0) + l.c.total;
    twd += l.twd || 0;
    const p = picked.get(l.id);
    for (const kid of p.kids) perKid.set(kid, (perKid.get(kid) || 0) + (l.twd || 0) / p.kids.size);
  }
  const missing = lines.filter((x) => !x.c).map((x) => { const { it } = picked.get(x.id); return `${esc(it.provider.name_en)} ${esc(it.program.name)}${it.locs[0] ? `（${esc(it.locs[0].name)}）` : ''}`; });
  const { table, clashes } = planOf(kidList);
  $('#est-plan').innerHTML = planHtml(kidList, table);
  const warns = [...clashes];
  if (missing.length) warns.push(`${missing.length} 項沒算進總額（價格未公布、沒勾孩子或沒勾週次）：${missing.join('、')}`);
  const low = lines.filter((x) => x.c && x.atLeast).map((x) => esc(shortName(picked.get(x.id).it)));
  if (low.length) warns.push(`${low.length} 項用的是業者寫的起價，實際可能更高，所以合計是最低金額：${[...new Set(low)].join('、')}`);
  const fx = db.fx;
  $('#est-total').innerHTML = `<div class="est-sum"><span>合計${low.length ? '至少' : ''}約</span><b>NT$${fmtN(twd)}</b></div>
    <div class="est-cur">${Object.entries(byCur).map(([c, n]) => money(c, n)).join(' ＋ ') || '—'}</div>
    ${kidList.length > 1 ? `<div class="est-kids">${kidList.filter((k) => perKid.has(k.id)).map((k) => `${esc(k.name)} 約 NT$${fmtN(perKid.get(k.id))}`).join('｜')}</div>` : ''}
    ${warns.length ? `<ul class="warns">${warns.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
    <p class="hint">不含機票、家長住宿、當地交通、報名費、手足優惠和早鳥折扣；日營不含住宿。匯率 ${(Object.keys(byCur).length ? Object.keys(byCur) : ['MYR']).map((c) => `1 ${c} ≈ ${fx.rates[c] ?? '?'} TWD`).join('、')}（${esc(fx.asof.MYR)}）。</p>`;
}

// ---------- wiring

function refreshAges() {
  const f = $('#q');
  for (const el of document.querySelectorAll('.kid')) {
    const birth = `${el.querySelector('[name=by]').value}-${el.querySelector('[name=bm]').value}`;
    if (!validDate(f.start.value)) { el.querySelector('.age').textContent = ''; continue; }
    const { age, notBorn } = kidFit({ age_min: null, age_max: null }, birth, f.start.value);
    el.querySelector('.age').textContent = notBorn ? '開始日時還沒出生' : `開始日時約 ${age} 歲`;
  }
}

function markPreset() {
  const f = $('#q');
  for (const b of document.querySelectorAll('#presets .preset')) b.classList.toggle('on', b.dataset.a === f.start.value && b.dataset.b === f.end.value);
}

let lastKey = null; // the query last drawn
let lastScope = null; // dates and country of that query
// force: draw again even though the form is unchanged (a view switch, clearing the picks)
function run({ force = false } = {}) {
  const q = readForm();
  markPreset();
  refreshAges();
  // blur fires a change event after the input event already ran; drawing twice would swallow the click that caused the blur
  const key = JSON.stringify(q);
  if (!force && key === lastKey) return;
  lastKey = key;
  // a new season or country: pick the default lights again
  const scope = `${q.start}|${q.end}|${q.country}`;
  if (scope !== lastScope) { lightsTouched = false; lastScope = scope; }
  const problem = dateProblem(q);
  if (!problem && q.kids.length) localStorage.setItem(STORE, JSON.stringify(q));
  render(q, problem);
}

const latestVerified = () => raw.sessions.reduce((m, s) => (s.verified_at > m ? s.verified_at : m), '');

function footer() {
  const latest = latestVerified();
  const fx = db.fx;
  $('#foot').innerHTML = `資料查證到 ${esc(latest)}。匯率：${Object.keys(fx.rates).filter((c) => c !== 'TWD').map((c) => `1 ${c} ≈ ${fx.rates[c]} TWD`).join('、')}（${esc(fx.source)}，${esc(fx.asof.MYR)}）。<br>
    可信度：高＝官方訂位頁或簡章且是 2027 的日期；中＝營隊官方社群，或聚合站資料與官方不矛盾；低＝只有聚合站或代理商來源，或來源互相矛盾。<br>
    發現資料有誤，把卡片「詳細資料」裡的梯次編號告訴維護者即可。`;
}

// ---------- first-visit tour

const TOUR_KEY = 'camps-tour-v1';
const TOUR = [
  [() => (getComputedStyle($('#qsum')).display !== 'none' && $('#side').classList.contains('collapsed') ? '#qsum' : '#side'), '① 先填條件', '填日期、每個孩子的出生年月，再選城市。改了會馬上重新找。'],
  [() => '#weeks', '② 看每週有沒有營', '每一格是那一週、那個孩子能去的營。實色＝有日期，灰色虛線＝照往年推測，紅色斜線＝這週沒有營。點格子裡的營會跳到它的卡片。'],
  [() => '#results .card', '③ 一家機構一張卡', '左邊色條是日期可不可靠：綠＝官方公布，黃＝只有代理商或聚合站寫，要先問，灰＝今年還沒公布，照往年推測。'],
  [() => '#results .srow', '④ 點開梯次，加入試算', '展開後看地址、時間、價格明細和來源。按「加入試算」算總費用，選 2–4 個可以並排比較。'],
];
let tourEnd = null; // set while a tour is open; calling it closes the tour
let tourAutoDone = false;

const tourDone = () => { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* private mode: it will show again */ } };

function startTour() {
  if (tourEnd) tourEnd();
  const steps = TOUR.map(([sel, h, t]) => ({ el: $(sel()), h, t })).filter((s) => s.el && (s.el.getBoundingClientRect().height > 0 || s.el.closest('.o2-more'))); // a row inside a closed wrapper has no height yet
  if (!steps.length) return;
  const dim = document.createElement('div');
  dim.className = 'tour-dim';
  const pop = document.createElement('div');
  pop.className = 'tour-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', '使用說明');
  document.body.append(dim, pop);
  let i = 0;
  let lifted = null;

  const clear = () => { lifted?.classList.remove('tour-on', 'tour-lift'); lifted = null; };
  const place = () => {
    if (!lifted) return;
    const r = lifted.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const gap = 12;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    let top;
    let left = clamp(r.left, gap, vw - w - gap);
    if (r.bottom + gap + h <= vh) top = r.bottom + gap;
    else if (r.top - gap - h >= 0) top = r.top - gap - h;
    else if (r.right + gap + w <= vw) { left = r.right + gap; top = clamp(r.top, gap, vh - h - gap); }
    else top = vh - h - gap; // the target fills the screen: sit over its lower part
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  };
  const show = () => {
    clear();
    const { el, h, t } = steps[i];
    if (el.classList.contains('srow')) { // the add-to-estimate button sits in the opened row
      const more = el.closest('.o2-more');
      if (more) more.open = true;
      el.querySelector('details').open = true;
    }
    el.classList.add('tour-on');
    if (getComputedStyle(el).position === 'static') el.classList.add('tour-lift');
    lifted = el;
    el.scrollIntoView({ block: el.getBoundingClientRect().height < innerHeight * 0.7 ? 'center' : 'start', behavior: 'instant' });
    const last = i === steps.length - 1;
    pop.innerHTML = `<small>${i + 1} / ${steps.length}</small><h4>${h}</h4><p>${t}</p><div class="tour-btns"><button type="button" class="t-skip">跳過</button><button type="button" class="t-next">${last ? '開始用' : '下一步'}</button></div>`;
    pop.querySelector('.t-skip').onclick = end;
    pop.querySelector('.t-next').onclick = () => { if (last) end(); else { i += 1; show(); } };
    place();
    pop.querySelector('.t-next').focus({ preventScroll: true });
  };
  let raf = 0;
  const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); end(); } };
  function end() {
    clear();
    cancelAnimationFrame(raf);
    dim.remove();
    pop.remove();
    removeEventListener('resize', onMove);
    removeEventListener('scroll', onMove);
    document.removeEventListener('keydown', onKey);
    tourEnd = null;
    tourDone();
  }
  tourEnd = end;
  addEventListener('resize', onMove);
  addEventListener('scroll', onMove, { passive: true });
  document.addEventListener('keydown', onKey);
  show();
}

// once, after the first results are drawn
function maybeTour() {
  if (tourAutoDone) return;
  tourAutoDone = true;
  let seen = false;
  try { seen = !!localStorage.getItem(TOUR_KEY); } catch { seen = true; }
  if (!seen) setTimeout(startTour, 400);
}

async function main() {
  try {
    await load();
  } catch (e) {
    $('#status').textContent = `資料載入失敗：${e.message}`;
    return;
  }
  renderForm(savedQuery());
  markPreset();
  footer();
  const f = $('#q');
  // runs before the form's change handler, so the new country's cities are ticked when run() reads the form
  $('#countries').addEventListener('change', () => renderCities(f.country.value, null));
  f.addEventListener('change', run);
  f.addEventListener('input', (e) => { if (['budget', 'name', 'kw'].includes(e.target.name)) run(); });
  f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('#add-kid').addEventListener('click', () => {
    const q = readForm();
    q.kids.push({ id: newKidId(), name: freeKidName(q.kids.map((k) => k.name)), birth: '2018-01' });
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
  $('#bar').addEventListener('click', (e) => {
    const st = e.target.closest('[data-sort]');
    if (st) { sortBy = st.dataset.sort; renderResults(); return; }
    const b = e.target.closest('[data-show]');
    if (!b) return;
    lightsTouched = true;
    shownLights.add('green');
    shownLights.add('yellow');
    if (b.dataset.show === 'all') shownLights.add('gray'); else shownLights.delete('gray');
    renderResults();
  });
  $('#weeks').addEventListener('change', (e) => {
    if (e.target.id !== 'use-ly') return;
    useLastYear = e.target.checked;
    run({ force: true });
  });
  $('#weeks').addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (!a) return;
    e.preventDefault();
    openSession(a.dataset.go);
  });
  $('#help').addEventListener('click', startTour);
  $('#qsum').addEventListener('click', () => {
    const side = $('#side');
    side.classList.toggle('collapsed');
    $('#qsum').setAttribute('aria-expanded', String(!side.classList.contains('collapsed')));
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
  $('#tray-clear').addEventListener('click', () => { picked.clear(); run({ force: true }); });
  $('#cmp-body').addEventListener('input', (e) => {
    const sec = e.target.closest('.est-item');
    if (!sec) return;
    const p = picked.get(sec.dataset.id);
    if (e.target.dataset.k != null) {
      const kid = e.target.dataset.k;
      if (e.target.checked) p.kids.add(kid); else p.kids.delete(kid);
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
