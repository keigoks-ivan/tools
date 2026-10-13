import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlaps, weeksIn, sessionSpan, ageAt, kidFit, perWeekEquiv, toTWD, mondayOf, addYears,
  defaultQty, taxRate, taxRateOf, lineCost, runWeeks, weeksQty, holidaysIn,
  buildDb, search, kidFitRange, weekShiftSpan, mergeKids,
} from '../lib/core.mjs';

test('date overlap is inclusive at both ends', () => {
  assert.equal(overlaps('2027-01-18', '2027-01-22', '2027-01-22', '2027-01-30'), true);
  assert.equal(overlaps('2027-01-18', '2027-01-22', '2027-01-23', '2027-01-30'), false);
  assert.equal(overlaps('2026-11-23', '2027-01-29', '2027-01-17', '2027-02-08'), true);
});

test('weeks: a Sunday start skips the week before; Monday end keeps its week', () => {
  const w = weeksIn('2027-01-17', '2027-02-08');
  assert.deepEqual(w.map((x) => x.mon), ['2027-01-18', '2027-01-25', '2027-02-01', '2027-02-08']);
  assert.equal(mondayOf('2027-02-02'), '2027-02-01');
});

test('start-only session spans its minimum stay to a Friday', () => {
  assert.deepEqual(sessionSpan({ start_date: '2027-01-18', end_date: null, min_duration_weeks: 2 }),
    { start: '2027-01-18', end: '2027-01-29', derived: true });
  // Tuesday intake (after a Monday holiday) still ends on Friday
  assert.equal(sessionSpan({ start_date: '2027-02-02', end_date: null, min_duration_weeks: 2 }).end, '2027-02-12');
  assert.equal(sessionSpan({ start_date: '2027-01-18', end_date: null, min_duration_weeks: null }).end, '2027-01-22');
  assert.equal(sessionSpan({ start_date: null }), null);
});

test('age at session start date from birth year-month', () => {
  assert.deepEqual(ageAt('2020-03', '2027-01-18'), { age: 6, borderline: false });
  assert.deepEqual(ageAt('2020-01', '2027-02-08'), { age: 7, borderline: false });
  // same month: day unknown, take the younger age
  assert.deepEqual(ageAt('2020-01', '2027-01-18'), { age: 6, borderline: true });
  assert.deepEqual(ageAt('2020-12', '2027-01-18', 'in_calendar_year'), { age: 7, borderline: false });
});

test('kid fit uses the start date and flags birthday-month edge cases', () => {
  const p = { age_min: 7, age_max: 12, age_rule: null };
  assert.equal(kidFit(p, '2020-03', '2027-01-18').fit, 'no');
  assert.equal(kidFit(p, '2020-03', '2027-07-05').fit, 'yes');
  assert.equal(kidFit(p, '2020-01', '2027-01-18').fit, 'maybe');
  assert.equal(kidFit({ age_min: null, age_max: null }, '2020-03', '2027-01-18').fit, 'unknown');
  assert.equal(kidFit({ age_min: 4, age_max: null }, '2016-05', '2027-01-18').fit, 'yes');
});

test('price: weekly equivalent per basis and TWD conversion', () => {
  const span2w = { start: '2027-07-12', end: '2027-07-26' };
  assert.equal(perWeekEquiv({ amount: 600, basis: 'per_week' }), 600);
  assert.equal(perWeekEquiv({ amount: 3000, basis: 'per_2weeks' }), 1500);
  assert.equal(perWeekEquiv({ amount: 120, basis: 'per_day' }), 600);
  assert.equal(perWeekEquiv({ amount: 10500, basis: 'per_camp' }, span2w), 3500); // 15 days -> 3 weeks
  assert.equal(perWeekEquiv({ amount: 10500, basis: 'per_camp' }, null), null);
  assert.equal(perWeekEquiv({ amount: null, basis: 'per_week' }), null);
  const fx = { rates: { MYR: 7.5, USD: 32, TWD: 1 } };
  assert.equal(toTWD(600, 'MYR', fx), 4500);
  assert.equal(toTWD(600, 'SGD', fx), null);
  assert.equal(addYears('2026-01-19', 1), '2027-01-19');
});

test('estimate: whole-session quantity per price basis', () => {
  const wk = { start: '2026-12-14', end: '2026-12-18' };
  const short = { start: '2026-12-21', end: '2026-12-24' };
  assert.equal(defaultQty({ basis: 'per_day' }, wk), 5);
  assert.equal(defaultQty({ basis: 'per_day' }, short), 4);
  assert.equal(defaultQty({ basis: 'per_day' }, wk, 1), 4); // a weekday holiday inside the week
  assert.equal(defaultQty({ basis: 'per_week' }, { start: '2027-01-18', end: '2027-01-29' }), 2);
  assert.equal(defaultQty({ basis: 'per_2weeks' }, { start: '2027-01-18', end: '2027-02-12' }), 2);
  assert.equal(defaultQty({ basis: 'per_camp' }, null), 1);
  assert.equal(defaultQty({ basis: 'per_week' }, null), null);
  assert.equal(defaultQty({ basis: null }, wk), null);
});

test('estimate: tax only when excluded, rate read from the note', () => {
  assert.equal(taxRate({ tax_included: false, tax_note: '每日 MYR 191.40，另加 8% Sales Tax' }), 0.08);
  assert.equal(taxRate({ tax_included: false, tax_note: 'Prices from RM 1,595 + 8% SST per child' }), 0.08);
  assert.equal(taxRate({ tax_included: false, tax_note: 'RM1,400 + SST；頁面標 Sale! 但無折扣價' }), null);
  assert.equal(taxRate({ tax_included: false, tax_note: '原價 RM4,999，頁面標 20% 折扣價' }), null);
  assert.equal(taxRate({ tax_included: null, tax_note: '頁面註明 6% SST 另計' }), 0);
  assert.equal(taxRate({ tax_included: true, tax_note: '含 6% SST' }), 0);
  const c = lineCost({ amount: 319, tax_included: false, tax_note: '另加 8% 銷售稅' }, 5, 2);
  assert.equal(c.base, 3190);
  assert.equal(Math.round(c.tax * 100) / 100, 255.2);
  assert.equal(lineCost({ amount: null }, 5, 2), null);
});

test('picked weeks: run clipped to the search dates, units per basis', () => {
  // Newtonshow runs 11/23–1/29; the search is 1/17–2/8, so only two weeks are on offer
  const long = runWeeks({ start: '2026-11-23', end: '2027-01-29' }, '2027-01-17', '2027-02-08');
  assert.deepEqual(long.map((w) => w.mon), ['2027-01-18', '2027-01-25']);
  // a short week keeps its real days
  const short = runWeeks({ start: '2026-12-21', end: '2026-12-24' }, '2026-12-14', '2027-01-08');
  assert.deepEqual(short, [{ mon: '2026-12-21', start: '2026-12-21', end: '2026-12-24' }]);
  assert.equal(weeksQty({ basis: 'per_day' }, short), 4);
  assert.equal(weeksQty({ basis: 'per_day' }, [...short, ...long], 1), 13);
  assert.equal(weeksQty({ basis: 'per_week' }, long), 2);
  assert.equal(weeksQty({ basis: 'per_2weeks' }, [...long, ...short]), 1.5);
  assert.equal(weeksQty({ basis: 'per_camp' }, long), 1);
  assert.equal(weeksQty({ basis: 'per_week' }, []), 0);
  assert.equal(weeksQty({ basis: null }, long), null);
  assert.deepEqual(runWeeks(null, '2027-01-17', '2027-02-08'), []);
});

test('holidays: each location gets its own country, weekends dropped', () => {
  const db = { holidays: [
    { country: 'MY', kind: 'public', date_start: '2027-02-08', date_end: '2027-02-08', name_zh: '農曆新年' },
    { country: 'TH', kind: 'public', date_start: '2027-01-01', date_end: '2027-01-01', name_zh: '元旦' },
    { country: 'TH', kind: 'replacement', date_start: '2027-02-22', date_end: '2027-02-22', name_zh: '萬佛節(補假)' },
    { country: 'TH', kind: 'public', date_start: '2027-01-02', date_end: '2027-01-02', name_zh: '週六' },
    { country: 'TW', kind: 'school_break', date_start: '2027-01-20', date_end: '2027-02-10', name_zh: '寒假' },
    { country: 'JP', kind: 'public', date_start: '2027-02-11', date_end: '2027-02-11', name_zh: '建国記念の日' },
  ] };
  const bkk = [{ country: 'TH', city: 'Bangkok', state: 'Bangkok' }];
  const kl = [{ country: 'MY', city: 'Kuala Lumpur', state: 'Kuala Lumpur' }];
  const names = (hs) => hs.map((h) => h.name_zh);
  assert.deepEqual(names(holidaysIn(db, '2026-12-28', '2027-02-26', bkk)), ['元旦', '萬佛節(補假)']);
  assert.deepEqual(names(holidaysIn(db, '2026-12-28', '2027-02-26', kl)), ['農曆新年']);
  assert.deepEqual(names(holidaysIn(db, '2027-02-08', '2027-02-12', [{ country: 'JP', city: 'Tokyo', state: 'Tokyo' }])), ['建国記念の日']);
  // a location saved before the country field existed counts as Malaysia
  assert.deepEqual(names(holidaysIn(db, '2027-02-08', '2027-02-12', [{ city: 'Penang', state: 'Penang' }])), ['農曆新年']);
});

// ---------- age in months

const prog = (age_min, age_max, age_rule) => ({ age_min, age_max, age_rule });

test('fractional age limits are compared in months', () => {
  // 2y10m (born 2024-01, on 2026-11-15) fits 2.5–18; 2y4m does not; 1y9m fits 1.5–6; 1y3m does not
  assert.equal(kidFit(prog(2.5, 18), '2024-01', '2026-11-15').fit, 'yes');
  assert.equal(kidFit(prog(2.5, 18), '2024-07', '2026-11-15').fit, 'no');
  assert.equal(kidFit(prog(1.5, 6), '2025-01', '2026-10-05').fit, 'yes');
  assert.equal(kidFit(prog(1.5, 6), '2025-07', '2026-10-05').fit, 'no');
  // exactly 30 months: the day of birth decides, so it is a maybe
  assert.equal(kidFit(prog(2.5, 18), '2024-05', '2026-11-15').fit, 'maybe');
  // shown age stays whole years
  assert.equal(kidFit(prog(2.5, 18), '2024-01', '2026-11-15').age, 2);
});

test('integer age limits behave as before, including the birth-month maybe', () => {
  assert.equal(kidFit(prog(3, 12), '2020-03', '2027-01-18').fit, 'yes'); // 6
  assert.equal(kidFit(prog(7, 12), '2020-03', '2027-01-18').fit, 'no');
  assert.equal(kidFit(prog(7, 12), '2020-01', '2027-01-18').fit, 'maybe'); // turns 7 this month
  assert.equal(kidFit(prog(3, 12), '2014-01', '2027-01-18').fit, 'maybe'); // may turn 13 this month
  assert.equal(kidFit(prog(3, 12), '2014-02', '2027-01-18').fit, 'yes');
  assert.equal(kidFit(prog(3, 12), '2013-12', '2027-01-18').fit, 'no');
  assert.equal(kidFit(prog(null, null), '2020-03', '2027-01-18').fit, 'unknown');
  assert.equal(kidFit(prog(3, 6, 'in_calendar_year'), '2020-12', '2027-01-18').fit, 'no'); // 7 by calendar year
});

test('a kid who is not born yet fits nothing', () => {
  const r = kidFit(prog(null, null), '2025-01', '2024-06-03');
  assert.equal(r.fit, 'no');
  assert.equal(r.notBorn, true);
  assert.equal(kidFit(prog(0, 6), '2025-01', '2024-06-03').fit, 'no');
});

test('a range of dates is a maybe when the fit changes inside it', () => {
  // born 2021-02: age 5 in January, 6 from February; the program takes 6 and up
  assert.equal(kidFitRange(prog(6, 12), '2021-02', '2027-01-17', '2027-01-31').fit, 'no');
  assert.equal(kidFitRange(prog(6, 12), '2021-02', '2027-01-17', '2027-02-08').fit, 'maybe');
  assert.equal(kidFitRange(prog(6, 12), '2021-01', '2027-02-01', '2027-02-08').fit, 'yes');
});

// ---------- tax rate

test('tax rate: every tax_note written in the data', () => {
  const ex = (note) => taxRate({ tax_included: false, tax_note: note });
  assert.equal(ex('税別，另加 10% 消費稅'), 0.1);
  assert.equal(ex('Price excludes 7% VAT'), 0.07);
  assert.equal(ex('頁面註明 8% Malaysia Service Tax 另計'), 0.08);
  assert.equal(ex('價格未公布；官網註明另加 8% Service Tax。'), 0.08);
  assert.equal(ex('另加 8% 銷售稅'), 0.08);
  assert.equal(ex('每日 MYR 191.40，另加 8% Sales Tax'), 0.08);
  assert.equal(ex('Prices from RM 1,595 + 8% SST per child；4 天的週也標同價，以訂位頁為準。'), 0.08);
  assert.equal(ex('機場接送（新加坡樟宜機場）RM500＋8% SST，另計。'), 0.08);
  assert.equal(ex('學校價 1 週 2,200、2 週 2,700、3 週 3,000、4 週 3,600（聚合站價 2,090／2,565／2,850／3,420）；頁面註明 6% SST 另計；計價器 school fee MYR 150。計價器估價，需學校確認'), 0.06);
  // no rate written: unknown, not zero
  assert.equal(ex('另加 SST'), null);
  assert.equal(ex('RM1,400 + SST；頁面標 Sale! 但無折扣價'), null);
  assert.equal(ex('税別，頁面寫 (+ tax)，沒寫稅率'), null);
  assert.equal(ex('税別，另加消費稅'), null);
  assert.equal(ex(null), null);
  // a discount percentage is not tax, and the tax word may come first
  assert.equal(ex('原價 RM4,999，頁面標 20% 折扣價'), null);
  assert.equal(ex('原價 20% 折扣價 + 8% SST'), 0.08);
  assert.equal(ex('VAT 7%'), 0.07);
  assert.equal(ex('SST (8%)'), 0.08);
  assert.equal(taxRateOf('含稅 6%'), 0.06);
});

// ---------- search: country, undated list, kids across sessions

const mini = () => buildDb({
  providers: [{ id: 'pa', name_en: 'A', type: 'operator', country: 'MY' }, { id: 'pb', name_en: 'B', type: 'operator', country: 'JP' },
    { id: 'pc', name_en: 'C', type: 'operator', country: 'TH' }],
  programs: [
    { id: 'a', provider_id: 'pa', name: 'A camp', category: ['english'], language_of_instruction: ['English'], age_min: 5, age_max: 12, format: 'day', location_ids: ['la'], includes: { lunch: true } },
    { id: 'b', provider_id: 'pb', name: 'B camp', category: ['english'], language_of_instruction: ['English'], age_min: 5, age_max: 12, format: 'day', location_ids: ['lb'], includes: { lunch: true } },
    { id: 'n', provider_id: 'pb', name: 'No place JP', category: ['arts'], language_of_instruction: ['English'], age_min: 5, age_max: 12, format: 'day', location_ids: [] },
    { id: 'm', provider_id: 'pa', name: 'No place MY', category: ['arts'], language_of_instruction: ['English'], age_min: 5, age_max: 12, format: 'day', location_ids: [], includes: { lunch: false } },
    { id: 'u', provider_id: 'pa', name: 'Undated lunch', category: ['english'], language_of_instruction: ['English'], age_min: 5, age_max: 12, format: 'day', location_ids: ['la'], includes: { lunch: true } },
    { id: 'v', provider_id: 'pa', name: 'Undated no lunch', category: ['english'], language_of_instruction: ['English'], age_min: 5, age_max: 12, format: 'day', location_ids: ['la'], includes: { lunch: false } },
  ],
  locations: [{ id: 'la', name: 'LA', city: 'Kuala Lumpur', state: 'Kuala Lumpur', country: 'MY' }, { id: 'lb', name: 'LB', city: 'Tokyo', state: 'Tokyo', country: 'JP' }],
  sessions: [
    { id: 's-a', program_id: 'a', location_id: 'la', start_date: '2027-01-18', end_date: '2027-01-22', date_status: 'confirmed_target_year', season: 'winter_2026_27', confidence: 'high', price: { amount: 500, currency: 'MYR', basis: 'per_week', tax_included: true } },
    { id: 's-b', program_id: 'b', location_id: 'lb', start_date: '2027-01-18', end_date: '2027-01-22', date_status: 'confirmed_target_year', season: 'winter_2026_27', confidence: 'high', price: { amount: 5000, currency: 'JPY', basis: 'per_week' } },
    { id: 's-n', program_id: 'n', location_id: null, date_status: 'unknown', season: 'winter_2026_27', confidence: 'low', price: null },
    { id: 's-m', program_id: 'm', location_id: null, date_status: 'unknown', season: 'winter_2026_27', confidence: 'low', price: null },
    { id: 's-u', program_id: 'u', location_id: 'la', date_status: 'unknown', season: 'winter_2026_27', confidence: 'low', price: null },
    { id: 's-v', program_id: 'v', location_id: 'la', date_status: 'unknown', season: 'winter_2026_27', confidence: 'low', price: null },
  ],
  reviews: [], conflicts: [], holidays: [], fx: { rates: { MYR: 7, JPY: 0.2, TWD: 1 } },
});
const kid = (id, birth) => ({ id, name: id, birth });
const base = { start: '2027-01-17', end: '2027-02-08', kids: [kid('k1', '2020-05')], cities: [], filters: {} };

test('country guard: another country never leaks in, with or without a city list', () => {
  const db = mini();
  const ids = (r) => [...r.full, ...r.partial, ...r.estimated, ...r.unknown].map((x) => x.session.id).sort();
  assert.deepEqual(ids(search(db, { ...base, country: 'MY' })), ['s-a', 's-m', 's-u', 's-v']);
  assert.deepEqual(ids(search(db, { ...base, country: 'JP' })), ['s-b', 's-n']);
  assert.deepEqual(ids(search(db, { ...base, country: 'TH' })), []);
  // a city list is matched against locations of that country only; a camp with no location can't match a city
  assert.deepEqual(ids(search(db, { ...base, country: 'MY', cities: ['Kuala Lumpur'] })), ['s-a', 's-u', 's-v']);
  assert.deepEqual(ids(search(db, { ...base, country: 'JP', cities: ['Kuala Lumpur'] })), []);
});

test('the undated list obeys the filters', () => {
  const db = mini();
  const names = (r) => r.unknown.map((x) => x.program.id).sort();
  assert.deepEqual(names(search(db, { ...base, country: 'MY' })), ['m', 'u', 'v']);
  assert.deepEqual(names(search(db, { ...base, country: 'MY', filters: { lunch: true } })), ['u']);
  assert.deepEqual(names(search(db, { ...base, country: 'MY', filters: { categories: ['arts'] } })), ['m']);
  assert.deepEqual(names(search(db, { ...base, country: 'MY', filters: { formats: ['residential'] } })), []);
});

test('mergeKids keeps the best fit per kid', () => {
  const a = [{ id: 'k1', fit: 'no', age: 4 }, { id: 'k2', fit: 'unknown', age: 6 }];
  const b = [{ id: 'k1', fit: 'maybe', age: 5 }, { id: 'k2', fit: 'no', age: 6 }];
  const m = mergeKids([a, b]);
  assert.deepEqual(m.map((k) => k.fit), ['maybe', 'unknown']);
});

test('weekShiftSpan keeps the weekday and picks the whole-week shift nearest the calendar date', () => {
  const q = { start: '2027-01-17', end: '2027-02-08' };
  const mon = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const a = weekShiftSpan({ start: '2026-01-19', end: '2026-01-23' }, 1, q);
  assert.equal(a.start, '2027-01-18');
  assert.equal(mon(a.start), 1);
  // 2026-02-09 +364 days = 2027-02-08 (in); a week later it would be out
  assert.equal(weekShiftSpan({ start: '2026-02-09', end: '2026-02-13' }, 1, q).start, '2027-02-08');
  // 364 days lands before the range but 371 reaches it: Mon 2026-01-12–16 +371 = 2027-01-18..22 (364 gives 01-11..15)
  assert.equal(weekShiftSpan({ start: '2026-01-12', end: '2026-01-16' }, 1, { start: '2027-01-17', end: '2027-02-08' }).start, '2027-01-18');
  assert.equal(weekShiftSpan({ start: '2026-01-05', end: '2026-01-09' }, 1, q), null);
  // three years on: nearest whole weeks to the calendar date
  const c = weekShiftSpan({ start: '2024-01-22', end: '2024-01-26' }, 3, q);
  assert.equal(mon(c.start), 1);
  assert.ok(Math.abs(Date.parse(`${c.start}T00:00:00Z`) - Date.parse('2027-01-22T00:00:00Z')) <= 4 * 864e5);
});
