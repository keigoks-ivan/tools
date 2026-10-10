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

// birth is 'YYYY-MM'. Day of birth is unknown, so when the session starts in the
// birth month we take the younger age and flag it as borderline.
export function ageAt(birth, dateStr, rule = 'at_start_date') {
  const [by, bm] = birth.split('-').map(Number);
  const [y, m] = dateStr.split('-').map(Number);
  if (rule === 'in_calendar_year') return { age: y - by, borderline: false };
  const passed = m > bm ? 0 : 1;
  return { age: y - by - passed, borderline: m === bm };
}

export function kidFit(program, birth, dateStr) {
  const { age, borderline } = ageAt(birth, dateStr, program.age_rule || 'at_start_date');
  const lo = program.age_min;
  const hi = program.age_max;
  if (lo == null && hi == null) return { age, fit: 'unknown' };
  const inRange = (a) => (lo == null || a >= lo) && (hi == null || a <= hi);
  const fit = inRange(age);
  if (borderline && inRange(age + 1) !== fit) return { age, fit: 'maybe' };
  return { age, fit: fit ? 'yes' : 'no' };
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

// MY holidays that close a Mon–Fri camp: federal, plus state holidays for the
// given regions. Weekend days are dropped; one entry per date.
export function weekdayHolidays(db, start, end, regions) {
  const seen = new Set();
  return db.holidays.filter((h) => {
    if (h.country !== 'MY' || !['public', 'replacement', 'state'].includes(h.kind)) return false;
    if (h.region && !regions.has(h.region)) return false;
    if (!overlaps(h.date_start, h.date_end, start, end)) return false;
    if (isWeekend(h.date_start) || seen.has(h.date_start)) return false;
    seen.add(h.date_start);
    return true;
  });
}

export function holidaysIn(db, start, end, locs) {
  return weekdayHolidays(db, start, end, new Set(locs.map((l) => STATE_REGION[l.state]).filter(Boolean)));
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
      w.push({ code: 'holiday', text: `遇到馬來西亞公假，可能停課：${list.join('、')}` });
    }
  }
  if (kids.some((k) => k.fit === 'unknown')) w.push({ code: 'age_unknown', text: '年齡限制未公布' });
  if (kids.some((k) => k.fit === 'maybe')) w.push({ code: 'age_maybe', text: '孩子生日在開營當月，年齡差一歲可能不符' });
  if (ids.some((i) => db.conflicts[i]?.length)) w.push({ code: 'conflict', text: '不同來源說法不一，見詳細資料' });
  return w;
}

function kidsFor(program, kids, dateStr) {
  return kids.map((k) => ({ ...kidFit(program, k.birth, dateStr), name: k.name }));
}

function inCities(locs, cities) {
  if (!cities?.length) return true;
  return locs.some((l) => cities.includes(l.city));
}

function seasonOf(dateStr) {
  for (const [k, [a, b]] of Object.entries(SEASON_SPAN)) if (dateStr >= a && dateStr <= b) return k;
  return null;
}

// q = {start, end, kids:[{name, birth:'YYYY-MM'}], cities:[...], filters:{...}}
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
    if (!inCities(locs, q.cities)) continue;
    const kids = kidsFor(program, q.kids, span.start);
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
  for (const s of db.sessions) {
    if (s.date_status !== 'confirmed_other_year' && s.date_status !== 'pattern_estimated') continue;
    let season = s.season;
    let shifted = null;
    if (s.date_status === 'confirmed_other_year') {
      const span = sessionSpan(s);
      if (!span) continue;
      for (const dy of [1, 2]) {
        const a = addYears(span.start, dy);
        const b = addYears(span.end, dy);
        if (overlaps(a, b, q.start, q.end)) { shifted = { start: a, end: b }; break; }
      }
      if (!shifted) continue;
      season = seasonOf(shifted.start);
    } else if (!rangeSeasons.has(season)) continue;
    if (confirmedKeys.has(`${s.program_id}|${s.location_id}|${season}`)) continue;
    const { program, provider, locs } = base(s);
    if (!inCities(locs, q.cities)) continue;
    const ageDate = shifted ? (shifted.start > q.start ? shifted.start : q.start) : q.start;
    const kids = kidsFor(program, q.kids, ageDate);
    if (!kids.some((k) => k.fit !== 'no')) continue;
    if (!passesFilters(db, s, program, sessionSpan(s), q.filters, q.kids.length)) continue;
    const key = `${s.program_id}|${s.location_id}`;
    if (!estimated.has(key)) {
      estimated.set(key, { session: s, program, provider, locs, kids, past: [], estimates: [], group: 'estimated', warnings: [] });
    }
    const e = estimated.get(key);
    if (s.date_status === 'confirmed_other_year') e.past.push(s);
    else e.estimates.push(s);
  }
  for (const e of estimated.values()) {
    e.past.sort((a, b) => a.start_date.localeCompare(b.start_date));
    // the card shows the most informative session: a past dated one, else the estimate
    e.session = e.past[0] || e.estimates[0];
    e.warnings = warningsFor(db, e.session, e.program, null, e.locs, e.kids);
    if (!e.past.length) e.warnings.unshift({ code: 'estimated', text: '日期未公布，依往年推估' });
  }

  // pass 3: nothing known, but the season overlaps
  const shown = new Set([...full, ...partial, ...estimated.values()].map((x) => x.program.id));
  for (const s of db.sessions) {
    if (s.date_status !== 'unknown' || !rangeSeasons.has(s.season) || shown.has(s.program_id)) continue;
    const { program, provider, locs } = base(s);
    if (!inCities(locs, q.cities)) continue;
    const kids = kidsFor(program, q.kids, q.start);
    if (!kids.some((k) => k.fit !== 'no')) continue;
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
    const card = { ...head, intakes: list, group: anyFull ? 'full' : 'partial',
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
    const holidays = weekdayHolidays(db, mon, fri, regions);
    return { mon, fri, perKid, holidays };
  });
}
