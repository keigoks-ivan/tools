import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlaps, weeksIn, sessionSpan, ageAt, kidFit, perWeekEquiv, toTWD, mondayOf, addYears,
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
