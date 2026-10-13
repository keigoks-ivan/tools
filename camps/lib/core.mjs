// Camp finder core logic. Pure functions shared by the page (app.js) and the
// Node tests. Dates are ISO 'YYYY-MM-DD' strings throughout; string comparison
// orders them correctly, so only arithmetic goes through Date (UTC).

export const SEASON_SPAN = {
  winter_2026_27: ['2026-11-01', '2027-02-28'],
  spring_2027: ['2027-03-01', '2027-04-30'],
  summer_2027: ['2027-06-01', '2027-08-31'],
};

export const STATE_REGION = {
  'Kuala Lumpur': 'MY-KUL', Selangor: 'MY-SGR', Penang: 'MY-PNG', Sabah: 'MY-SBH',
  Johor: 'MY-JHR', Putrajaya: 'MY-PJY', 'Negeri Sembilan': 'MY-NSN', Labuan: 'MY-LBN', Kedah: 'MY-KDH',
};

// city filter values -> state holiday region
export const CITY_REGION = {
  'Kuala Lumpur': 'MY-KUL', 'Petaling Jaya': 'MY-SGR', 'Subang Jaya': 'MY-SGR', Puchong: 'MY-SGR',
  'Shah Alam': 'MY-SGR', 'Selangor-other': 'MY-SGR', Penang: 'MY-PNG', 'Johor Bahru': 'MY-JHR',
  'Kota Kinabalu': 'MY-SBH', 'Negeri Sembilan': 'MY-NSN',
};

const SOLID = new Set(['high', 'medium']);

export const COUNTRY_ZH = { MY: '馬來西亞', TH: '泰國', JP: '日本' };
const countriesOf = (locs) => new Set(locs.map((l) => l.country || 'MY'));

// ---------- dates

export function toDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function iso(d) {
  return d.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function addYears(s, n) {
  return String(Number(s.slice(0, 4)) + n) + s.slice(4);
}

export function mondayOf(s) {
  return addDays(s, -((toDate(s).getUTCDay() + 6) % 7));
}

export function overlaps(a0, a1, b0, b1) {
  return a0 <= b1 && a1 >= b0;
}

// Mon–Fri weeks touching [start, end]
export function weeksIn(start, end) {
  const out = [];
  if (!start || !end || start > end) return out;
  for (let m = mondayOf(start); m <= end; m = addDays(m, 7)) {
    const fri = addDays(m, 4);
    if (fri >= start) out.push({ mon: m, fri });
  }
  return out;
}

// Dated span of a session. Start-only sessions (rolling weekly intakes) run for
// their minimum stay: Friday of the min_duration_weeks-th week. Marked derived.
export function sessionSpan(s) {
  if (!s.start_date) return null;
  if (s.end_date) return { start: s.start_date, end: s.end_date, derived: false };
  const w = s.min_duration_weeks || 1;
  return { start: s.start_date, end: addDays(mondayOf(s.start_date), 7 * (w - 1) + 4), derived: true };
}

// ---------- age

// birth is 'YYYY-MM'. Day of birth is unknown, so the age in whole months is either
// M or M-1 (M = month difference); we take the younger and flag it as borderline
// when that changes the answer. Limits are compared in months, so 1.5 and 2.5 work.
export function monthsDiff(birth, dateStr) {
  const [by, bm] = birth.split('-').map(Number);
  const [y, m] = dateStr.split('-').map(Number);
  return (y - by) * 12 + (m - bm);
}

export function ageAt(birth, dateStr, rule = 'at_start_date') {
  const [by, bm] = birth.split('-').map(Number);
  const [y, m] = dateStr.split('-').map(Number);
  if (rule === 'in_calendar_year') return { age: y - by, borderline: false };
  const passed = m > bm ? 0 : 1;
  return { age: y - by - passed, borderline: m === bm };
}

// age in months as [youngest, oldest] the child can be on that date
function monthRange(birth, dateStr, rule) {
  if (rule === 'in_calendar_year') {
    const a = Number(dateStr.slice(0, 4)) - Number(birth.slice(0, 4));
    return [a * 12, a * 12];
  }
  const M = monthsDiff(birth, dateStr);
  return [M - 1, M];
}

export function kidFit(program, birth, dateStr) {
  const rule = program.age_rule || 'at_start_date';
  const M = rule === 'in_calendar_year' ? monthRange(birth, dateStr, rule)[1] : monthsDiff(birth, dateStr);
  const { age } = ageAt(birth, dateStr, rule);
  // the date is before the birth month: the child is not born yet
  if (M < 0) return { age: 0, fit: 'no', notBorn: true };
  const shownAge = Math.max(0, age);
  const lo = program.age_min;
  const hi = program.age_max;
  if (lo == null && hi == null) return { age: shownAge, fit: 'unknown' };
  // hi is a whole year ("up to 12") = until the 13th birthday; a fractional hi counts through that month
  const inRange = (mo) => (lo == null || mo >= lo * 12) && (hi == null || mo < (Number.isInteger(hi) ? (hi + 1) * 12 : hi * 12 + 1));
  const [young, old] = monthRange(birth, dateStr, rule);
  const a = inRange(young);
  const b = inRange(old);
  if (a !== b) return { age: shownAge, fit: 'maybe' };
  return { age: shownAge, fit: a ? 'yes' : 'no' };
}

// Fit over a stretch of dates when the exact start is unknown: the kid counts as
// "maybe" if the answer differs between the first and last day.
export function kidFitRange(program, birth, from, to) {
  const a = kidFit(program, birth, from);
  if (!to || to <= from) return a;
  const b = kidFit(program, birth, to);
  return a.fit === b.fit ? a : { ...a, fit: 'maybe' };
}

const FIT_RANK = { yes: 3, maybe: 2, unknown: 1, no: 0 };
export function betterFit(a, b) {
  return (FIT_RANK[b.fit] ?? 0) > (FIT_RANK[a.fit] ?? 0) ? b : a;
}

// ---------- price

export function weeksOf(span) {
  const days = (toDate(span.end) - toDate(span.start)) / 864e5 + 1;
  return Math.max(1, Math.ceil(days / 7));
}

// Per-child weekly equivalent, used only for the budget filter. The card always
// shows the original basis.
export function perWeekEquiv(price, span) {
  if (!price || price.amount == null || !price.basis) return null;
  const a = price.amount;
  switch (price.basis) {
    case 'per_week': return a;
    case 'per_2weeks': return a / 2;
    case 'per_day': return a * 5;
    case 'per_camp':
    case 'per_session':
      return span ? a / weeksOf(span) : null;
    default: return null;
  }
}

export function toTWD(amount, currency, fx) {
  const r = fx?.rates?.[currency];
  return r == null || amount == null ? null : Math.round(amount * r);
}

// ---------- cost estimate

export const UNIT = { per_day: '天', per_week: '週', per_2weeks: '期（兩週）', per_camp: '梯', per_session: '梯' };

function weekdaysIn(start, end) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (!isWeekend(d)) n += 1;
  return n;
}

// Price units for signing up to the whole session. Day rates count Mon–Fri
// minus weekday holidays inside the span. null when the session has no dates.
export function defaultQty(price, span, holidayDays = 0) {
  switch (price?.basis) {
    case 'per_camp':
    case 'per_session': return 1;
    case 'per_day': return span ? Math.max(1, weekdaysIn(span.start, span.end) - holidayDays) : null;
    case 'per_week': return span ? weeksOf(span) : null;
    case 'per_2weeks': return span ? Math.ceil(weeksOf(span) / 2) : null;
    default: return null;
  }
}

// Tax is added only when the operator says the price excludes it. The rate comes
// from the note ("+ 8% SST"); null means excluded but no rate given.
// Mon–Fri weeks of a run that fall in [from, to], each clipped to the run.
export function runWeeks(run, from, to) {
  if (!run) return [];
  return weeksIn(from, to)
    .map((w) => ({ mon: w.mon, start: w.mon > run.start ? w.mon : run.start, end: w.fri < run.end ? w.fri : run.end }))
    .filter((w) => w.start <= w.end && weekdaysIn(w.start, w.end) > 0);
}

// Price units for attending only the picked weeks. holidayDays: weekday holidays inside them.
export function weeksQty(price, weeks, holidayDays = 0) {
  if (!weeks.length) return 0;
  switch (price?.basis) {
    case 'per_camp': case 'per_session': return 1;
    case 'per_day': return Math.max(0, weeks.reduce((n, w) => n + weekdaysIn(w.start, w.end), 0) - holidayDays);
    case 'per_week': return weeks.length;
    case 'per_2weeks': return weeks.length / 2;
    default: return null;
  }
}

// A percentage counts as the tax rate when a tax word sits right next to it:
// after it ("8% Malaysia Service Tax", "10% 消費稅") or before it ("VAT 7%").
// The window stops at the next digit or punctuation, so "20% 折扣價 + 8% SST"
// reads 8%, and a discount percentage is never taken for tax.
const TAX_WORD = /VAT|GST|SST|\btax\b|[稅税]/i;
export function taxRateOf(note) {
  const text = String(note || '');
  const re = /(\d+(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(text))) {
    const stop = /[\d,，、；;。:：]/;
    const after = text.slice(m.index + m[0].length).split(stop)[0].slice(0, 22);
    const before = text.slice(0, m.index).replace(/[\s(（]+$/, '').split(stop).pop().slice(-12);
    if (TAX_WORD.test(after) || TAX_WORD.test(before)) return Number(m[1]) / 100;
  }
  return null;
}

export function taxRate(price) {
  if (price?.tax_included !== false) return 0;
  return taxRateOf(price.tax_note);
}

export function lineCost(price, qty, nKids) {
  if (price?.amount == null || !qty || !nKids) return null;
  const base = price.amount * qty * nKids;
  const rate = taxRate(price);
  const tax = rate ? base * rate : 0;
  return { base, tax, total: base + tax, taxUnknown: rate === null };
}

// ---------- db

export function buildDb(raw) {
  const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
  const groupBy = (rows, key) => {
    const m = {};
    for (const r of rows) (m[r[key]] ||= []).push(r);
    return m;
  };
  return {
    providers: byId(raw.providers),
    programs: byId(raw.programs),
    locations: byId(raw.locations),
    sessions: raw.sessions,
    reviews: groupBy(raw.reviews, 'entity_id'),
    conflicts: groupBy(raw.conflicts, 'entity_id'),
    holidays: raw.holidays.holidays || raw.holidays,
    fx: raw.fx,
  };
}

export function sessionLocations(db, s) {
  const ids = s.location_id ? [s.location_id] : db.programs[s.program_id].location_ids || [];
  return ids.map((i) => db.locations[i]).filter(Boolean);
}

function isWeekend(s) {
  const d = toDate(s).getUTCDay();
  return d === 0 || d === 6;
}

// Holidays that close a Mon–Fri camp in the given countries: national, plus
// state holidays for the given regions. Weekend days are dropped; one entry per date.
export function weekdayHolidays(db, start, end, regions, countries = new Set(['MY'])) {
  const seen = new Set();
  return db.holidays.filter((h) => {
    if (!countries.has(h.country) || !['public', 'replacement', 'state'].includes(h.kind)) return false;
    if (h.region && !regions.has(h.region)) return false;
    if (!overlaps(h.date_start, h.date_end, start, end)) return false;
    if (isWeekend(h.date_start) || seen.has(h.date_start)) return false;
    seen.add(h.date_start);
    return true;
  });
}

export function holidaysIn(db, start, end, locs) {
  return weekdayHolidays(db, start, end, new Set(locs.map((l) => STATE_REGION[l.state]).filter(Boolean)), countriesOf(locs));
}

// ---------- search

function passesFilters(db, s, program, span, f, kidCount) {
  if (!f) return true;
  if (f.formats?.length && !f.formats.includes(program.format)) return false;
  if (f.categories?.length && !program.category.some((c) => f.categories.includes(c))) return false;
  if (f.lunch && program.includes?.lunch !== true) return false;
  if (f.flexible && s.flexible_start !== true) return false;
  if (f.languages?.length && !program.language_of_instruction.some((l) => f.languages.includes(l))) return false;
  if (f.noParent && program.format === 'family_with_parent') return false;
  if (f.budgetTWD) {
    const w = perWeekEquiv(s.price, span);
    const twd = w == null ? null : toTWD(w, s.price.currency, db.fx);
    if (twd != null && twd > f.budgetTWD) return false;
  }
  return true;
}

function warningsFor(db, s, program, span, locs, kids) {
  const w = [];
  const ids = [s.id, s.program_id, program.provider_id];
  if (s.date_status === 'confirmed_other_year') w.push({ code: 'other_year', text: `日期是 ${s.year || s.start_date?.slice(0, 4)} 年的，2027 未公布` });
  if (s.confidence === 'low') w.push({ code: 'low_conf', text: '只有聚合站或代理商來源，報名前向機構確認' });
  if (s.min_duration_weeks > 1) w.push({ code: 'min_weeks', text: `最少報 ${s.min_duration_weeks} 週` });
  if (program.format === 'family_with_parent') w.push({ code: 'parent', text: '需家長陪同' });
  if (s.price?.early_bird?.condition) w.push({ code: 'early_bird', text: `早鳥條件：${s.price.early_bird.condition}` });
  if (span && s.date_status === 'confirmed_target_year') {
    const hs = holidaysIn(db, span.start, span.end, locs);
    if (hs.length) {
      const list = hs.map((h) => `${h.date_start.slice(5).replace('-', '/')} ${h.name_zh || h.name_en}${h.status === 'estimated' ? '（推算）' : ''}`);
      const where = [...countriesOf(locs)].map((c) => COUNTRY_ZH[c] || c).join('、');
      w.push({ code: 'holiday', text: `遇到${where}公假，可能停課：${list.join('、')}` });
    }
  }
  if (kids.some((k) => k.fit === 'unknown')) w.push({ code: 'age_unknown', text: '年齡限制未公布' });
  if (kids.some((k) => k.fit === 'maybe')) w.push({ code: 'age_maybe', text: '孩子生日在開營當月，年齡差一歲可能不符' });
  if (ids.some((i) => db.conflicts[i]?.length)) w.push({ code: 'conflict', text: '不同來源說法不一，見詳細資料' });
  return w;
}

export function kidsFor(program, kids, dateStr, endStr) {
  return kids.map((k) => ({ ...kidFitRange(program, k.birth, dateStr, endStr), name: k.name, id: k.id }));
}

// Per kid, the best fit across several lists of per-kid fits (yes > maybe > unknown > no).
export function mergeKids(lists) {
  return lists[0].map((k, i) => lists.reduce((best, l) => betterFit(best, l[i]), k));
}

// Where a session may be shown: location country (and city when the parent picked some).
// An empty city list means the whole country. A session with no location at all is kept
// only when the provider's country matches and no city was picked, because its city can't be checked.
function inScope(locs, provider, q) {
  const country = q.country;
  const cities = q.cities;
  if (locs.length) {
    return locs.some((l) => (!country || (l.country || 'MY') === country) && (!cities?.length || cities.includes(l.city)));
  }
  if (cities?.length) return false;
  return !country || (provider?.country || 'MY') === country;
}

function seasonOf(dateStr) {
  for (const [k, [a, b]] of Object.entries(SEASON_SPAN)) if (dateStr >= a && dateStr <= b) return k;
  return null;
}

// A past span moved `dy` years on, by whole weeks so the weekday stays. Of the two whole-week
// shifts around the calendar-year date, the one closest to it that overlaps the range wins.
export function weekShiftSpan(span, dy, q) {
  const D = Math.round((toDate(addYears(span.start, dy)) - toDate(span.start)) / 864e5);
  const hits = [...new Set([Math.floor(D / 7), Math.ceil(D / 7)])].map((n) => n * 7)
    .map((days) => ({ days, start: addDays(span.start, days), end: addDays(span.end, days) }))
    .filter((c) => overlaps(c.start, c.end, q.start, q.end))
    .sort((x, y) => Math.abs(x.days - D) - Math.abs(y.days - D) || x.days - y.days);
  return hits[0] || null;
}

// q = {start, end, country, kids:[{id, name, birth:'YYYY-MM'}], cities:[...], filters:{...}}
// country limits results to that country; an empty cities list means the whole country.
export function search(db, q) {
  const full = [];
  const partial = [];
  const estimated = new Map();
  const unknown = [];
  const confirmedKeys = new Set();
  const rangeSeasons = new Set(Object.entries(SEASON_SPAN).filter(([, [a, b]]) => overlaps(a, b, q.start, q.end)).map(([k]) => k));

  const base = (s) => {
    const program = db.programs[s.program_id];
    const provider = db.providers[program.provider_id];
    const locs = sessionLocations(db, s);
    return { program, provider, locs };
  };

  // pass 1: target-year dated sessions
  for (const s of db.sessions) {
    if (s.date_status !== 'confirmed_target_year' || !s.start_date) continue;
    const { program, provider, locs } = base(s);
    const span = sessionSpan(s);
    confirmedKeys.add(`${s.program_id}|${s.location_id}|${s.season}`);
    if (!overlaps(span.start, span.end, q.start, q.end)) continue;
    if (!inScope(locs, provider, q)) continue;
    // a rolling start that opened before the chosen dates: the child joins on the first chosen day
    const kids = kidsFor(program, q.kids, s.flexible_start && span.start < q.start ? q.start : span.start);
    if (!kids.some((k) => k.fit !== 'no')) continue;
    if (!passesFilters(db, s, program, span, q.filters, q.kids.length)) continue;
    const item = { session: s, program, provider, locs, span, kids, warnings: warningsFor(db, s, program, span, locs, kids) };
    if (span.start >= q.start && span.end <= q.end) full.push({ ...item, group: 'full' });
    else {
      item.warnings.unshift({ code: 'partial', text: '梯次有一段在你選的日期之外' });
      partial.push({ ...item, group: 'partial' });
    }
  }

  // pass 2: other-year and estimated sessions -> one card per program+location
  const shiftedOf = (s) => {
    const span = sessionSpan(s);
    if (!span) return null;
    for (const dy of [1, 2, 3]) {
      const a = addYears(span.start, dy);
      const b = addYears(span.end, dy);
      if (overlaps(a, b, q.start, q.end)) return { start: a, end: b, dy };
    }
    return null;
  };
  const pastDy = new Map();
  // past dates outside the chosen dates, by program+location+season, shown on an estimate that has nothing else
  const pastOut = new Map();
  for (const s of db.sessions) {
    if (s.date_status !== 'confirmed_other_year' && s.date_status !== 'pattern_estimated') continue;
    const key = `${s.program_id}|${s.location_id}`;
    let season = s.season;
    let shifted = null;
    if (s.date_status === 'confirmed_other_year') {
      shifted = shiftedOf(s);
      if (!shifted) {
        const span = sessionSpan(s);
        for (const dy of span ? [1, 2, 3] : []) {
          const k = `${key}|${seasonOf(addYears(span.start, dy))}`;
          pastOut.set(k, [...(pastOut.get(k) || []), s]);
        }
        continue;
      }
      season = seasonOf(shifted.start);
    } else if (!rangeSeasons.has(season)) continue;
    if (confirmedKeys.has(`${s.program_id}|${s.location_id}|${season}`)) continue;
    const { program, provider, locs } = base(s);
    if (!inScope(locs, provider, q)) continue;
    // no exact start: the kid counts as "maybe" when the fit differs between the first and last possible day
    const kids = shifted
      ? kidsFor(program, q.kids, shifted.start > q.start ? shifted.start : q.start, shifted.end < q.end ? shifted.end : q.end)
      : kidsFor(program, q.kids, q.start, q.end);
    if (!kids.some((k) => k.fit !== 'no')) continue;
    if (!passesFilters(db, s, program, sessionSpan(s), q.filters, q.kids.length)) continue;
    if (!estimated.has(key)) {
      estimated.set(key, { session: s, program, provider, locs, kids, past: [], estimates: [], group: 'estimated', warnings: [] });
    }
    const e = estimated.get(key);
    // per kid, the best fit over all the card's sessions, so the mark doesn't depend on the other kids searched
    e.kids = mergeKids([e.kids, kids]);
    if (s.date_status === 'confirmed_other_year') {
      e.past.push(s);
      pastDy.set(s.id, shifted.dy);
    } else e.estimates.push(s);
  }
  const qYear = Number(q.start.slice(0, 4));
  for (const [key, e] of estimated) {
    const outside = !e.past.length && [...new Set(e.estimates.flatMap((x) => pastOut.get(`${key}|${x.season}`) || []))]
      .filter((p) => passesFilters(db, p, e.program, sessionSpan(p), q.filters, q.kids.length));
    if (outside?.length) e.past = outside;
    e.past.sort((a, b) => a.start_date.localeCompare(b.start_date));
    // most recent past year first; inside a year, the earliest session
    const recent = [...e.past].sort((a, b) => b.start_date.slice(0, 4).localeCompare(a.start_date.slice(0, 4)) || a.start_date.localeCompare(b.start_date));
    e.placed = null;
    if (!outside?.length) {
      for (const p of recent) {
        const sp = sessionSpan(p);
        for (const dy of sp ? [1, 2, 3] : []) {
          const hit = weekShiftSpan(sp, dy, q);
          if (hit) { e.placed = { start: hit.start, end: hit.end, year: p.start_date.slice(0, 4), session: p }; break; }
        }
        if (e.placed) break;
      }
    }
    // the card shows the session its week-view chip is placed from, else the most recent past one, else the estimate
    e.session = e.placed?.session || recent[0] || e.estimates[0];
    // where this card sits on this year's calendar, for sorting by date
    const sp = sessionSpan(e.session);
    e.sortStart = e.placed?.start
      || (sp ? addYears(sp.start, pastDy.get(e.session.id) ?? Math.max(0, qYear - Number(sp.start.slice(0, 4))))
        : SEASON_SPAN[e.session.season]?.[0] || '9999');
    e.warnings = warningsFor(db, e.session, e.program, null, e.locs, e.kids);
    if (outside?.length) e.warnings.unshift({ code: 'past_outside', text: '往年同一季的日期不在你選的日期內' });
    else if (!e.past.length) e.warnings.unshift({ code: 'estimated', text: '日期未公布，依往年推估' });
  }

  // pass 3: nothing known, but the season overlaps
  const shown = new Set([...full, ...partial, ...estimated.values()].map((x) => x.program.id));
  for (const s of db.sessions) {
    if (s.date_status !== 'unknown' || !rangeSeasons.has(s.season) || shown.has(s.program_id)) continue;
    const { program, provider, locs } = base(s);
    if (!inScope(locs, provider, q)) continue;
    const kids = kidsFor(program, q.kids, q.start, q.end);
    if (!kids.some((k) => k.fit !== 'no')) continue;
    if (!passesFilters(db, s, program, null, q.filters, q.kids.length)) continue;
    unknown.push({ session: s, program, provider, locs, kids, group: 'unknown' });
  }

  const est = [...estimated.values()].sort((a, b) => a.provider.name_en.localeCompare(b.provider.name_en));

  const items = [...full, ...partial];
  return { ...cardsOf(items), estimated: est, unknown, weeks: weekView(db, q, items) };
}

// Rolling intakes (start date only, e.g. language schools starting every Monday)
// collapse into one card per program+location listing the intake dates. The card
// is "full" if any intake fits entirely inside the range.
function cardsOf(items) {
  const full = [];
  const partial = [];
  const rolling = new Map();
  for (const it of items) {
    if (!it.span.derived) {
      (it.group === 'full' ? full : partial).push(it);
      continue;
    }
    const key = `${it.program.id}|${it.session.location_id}`;
    if (!rolling.has(key)) rolling.set(key, []);
    rolling.get(key).push(it);
  }
  for (const list of rolling.values()) {
    list.sort((a, b) => a.span.start.localeCompare(b.span.start));
    const anyFull = list.some((x) => x.group === 'full');
    const head = list.find((x) => x.group === 'full') || list[0];
    // per kid, the best fit over every intake
    const card = { ...head, intakes: list, group: anyFull ? 'full' : 'partial', kids: mergeKids(list.map((x) => x.kids)),
      warnings: head.warnings.filter((w) => w.code !== 'partial') };
    (anyFull ? full : partial).push(card);
  }
  const byStart = (a, b) => a.span.start.localeCompare(b.span.start) || a.provider.name_en.localeCompare(b.provider.name_en);
  return { full: full.sort(byStart), partial: partial.sort(byStart) };
}

// For each Mon–Fri week and each kid: solid options (high/medium confidence),
// weak options (low), and whether the week is a gap (no solid option).
export function weekView(db, q, items) {
  const regions = new Set((q.cities || []).map((c) => CITY_REGION[c]).filter(Boolean));
  return weeksIn(q.start, q.end).map(({ mon, fri }) => {
    const perKid = q.kids.map((kid, i) => {
      const solid = [];
      const weak = [];
      for (const it of items) {
        if (!overlaps(it.span.start, it.span.end, mon, fri)) continue;
        if (it.kids[i].fit === 'no') continue;
        (SOLID.has(it.session.confidence) ? solid : weak).push(it);
      }
      return { kid, solid, weak, gap: solid.length === 0 };
    });
    const holidays = weekdayHolidays(db, mon, fri, regions, new Set([q.country || 'MY']));
    return { mon, fri, perKid, holidays };
  });
}
