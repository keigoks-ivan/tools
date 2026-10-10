// Spec acceptance case, run against the real merged data in camps/data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDb, search } from '../lib/core.mjs';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const db = buildDb({
  providers: load('providers'), programs: load('programs'), locations: load('locations'),
  sessions: load('sessions'), reviews: load('reviews'), conflicts: load('conflicts'),
  holidays: load('holidays'), fx: load('fx'),
});

const KL = ['Kuala Lumpur', 'Petaling Jaya', 'Subang Jaya', 'Puchong', 'Shah Alam', 'Selangor-other'];
// 6 and 10 years old throughout the window
const q = {
  start: '2027-01-17', end: '2027-02-08', cities: KL,
  kids: [{ name: '老大', birth: '2016-05' }, { name: '老二', birth: '2020-05' }],
};
const r = search(db, q);
const confirmed = [...r.full, ...r.partial];

test('Camp Beaumont has no confirmed session, only estimated / ask', () => {
  assert.equal(confirmed.filter((x) => x.provider.id === 'camp-beaumont').length, 0);
  const est = r.estimated.filter((x) => x.provider.id === 'camp-beaumont');
  assert.ok(est.length > 0, 'Camp Beaumont should appear in the estimated group');
});

test('EMS dates come from 2026 and are labelled confirmed_other_year', () => {
  const ems = r.estimated.filter((x) => x.provider.id === 'ems');
  assert.ok(ems.length > 0, 'EMS should appear');
  assert.ok(ems.some((x) => x.past.length && x.past.every((s) => s.date_status === 'confirmed_other_year' && s.year === 2026)));
  assert.ok(ems.every((x) => x.warnings.some((w) => w.code === 'other_year' || w.code === 'estimated')));
  assert.equal(confirmed.filter((x) => x.provider.id === 'ems').length, 0);
});

test('2/1-2/5 is shown as a gap for both kids', () => {
  const wk = r.weeks.find((w) => w.mon === '2027-02-01');
  assert.ok(wk, 'week of 2/1 present');
  for (const k of wk.perKid) {
    assert.equal(k.gap, true, `${k.kid.name} should have no solid option`);
    assert.ok(k.weak.every((x) => x.session.confidence === 'low'));
  }
  assert.ok(wk.holidays.some((h) => h.date_start === '2027-02-01'), 'FT Day flagged on 2/1');
});

test('every result card carries a source and verified date', () => {
  for (const x of [...confirmed, ...r.estimated]) {
    assert.match(x.session.source_url, /^(https?:|seed:)/);
    assert.ok(x.session.verified_at);
  }
});

test('kids outside the age range are not offered the session', () => {
  for (const x of confirmed) assert.ok(x.kids.some((k) => k.fit !== 'no'));
  const sport = confirmed.find((x) => x.program.id === 'arrowhead-multi-sport');
  if (sport) assert.deepEqual(sport.kids.map((k) => k.fit), ['yes', 'no']);
});
