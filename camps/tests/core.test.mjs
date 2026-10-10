import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlaps, weeksIn, sessionSpan, ageAt, kidFit, perWeekEquiv, toTWD, mondayOf, addYears,
  defaultQty, taxRate, lineCost, runWeeks, weeksQty, holidaysIn,
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
