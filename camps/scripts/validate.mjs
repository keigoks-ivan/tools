// Data integrity check for camps/data. Exit 1 on any error.
// Usage: node scripts/validate.mjs
import { readFileSync } from 'node:fs';

const L = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const [providers, programs, locations, sessions, reviews, conflicts, fx] =
  ['providers', 'programs', 'locations', 'sessions', 'reviews', 'conflicts', 'fx'].map(L);

const errors = [];
const warns = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warns.push(`${id}: ${msg}`);

const ENUM = {
  date_status: ['confirmed_target_year', 'confirmed_other_year', 'pattern_estimated', 'unknown'],
  confidence: ['high', 'medium', 'low'],
  season: ['winter_2026_27', 'spring_2027', 'summer_2027', 'other'],
  basis: ['per_week', 'per_2weeks', 'per_day', 'per_camp', 'per_session'],
  format: ['day', 'residential', 'family_with_parent', 'parent_optional'],
  category: ['english', 'sport', 'stem', 'arts', 'multi_activity', 'outdoor', 'residential', 'leadership', 'family', 'travel', 'short_term_enrolment', 'other_language'],
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^(https?:\/\/|seed:\/\/)/;

const ids = (list, kind) => {
  const m = new Map();
  for (const x of list) {
    if (m.has(x.id)) err(x.id, `duplicate ${kind} id`);
    m.set(x.id, x);
  }
  return m;
};
const P = ids(providers, 'provider');
const G = ids(programs, 'program');
const Lc = ids(locations, 'location');
const S = ids(sessions, 'session');

for (const g of programs) {
  if (!P.has(g.provider_id)) err(g.id, `unknown provider ${g.provider_id}`);
  if (!ENUM.format.includes(g.format)) err(g.id, `format ${g.format}`);
  for (const c of g.category || []) if (!ENUM.category.includes(c)) err(g.id, `category ${c}`);
  for (const l of g.location_ids || []) if (!Lc.has(l)) err(g.id, `unknown location ${l}`);
  if (g.age_min != null && g.age_max != null && g.age_min > g.age_max) err(g.id, `age_min > age_max`);
  if (!(g.sources || []).length) warn(g.id, 'program has no sources');
  for (const k of ['staffing', 'facilities']) if (g[k] != null && typeof g[k] !== 'string') err(g.id, `${k} ${g[k]}`);
}

for (const s of sessions) {
  if (!G.has(s.program_id)) err(s.id, `unknown program ${s.program_id}`);
  if (s.location_id && !Lc.has(s.location_id)) err(s.id, `unknown location ${s.location_id}`);
  for (const k of ['date_status', 'confidence', 'season']) if (!ENUM[k].includes(s[k])) err(s.id, `${k} ${s[k]}`);
  if (!URL_RE.test(s.source_url || '')) err(s.id, 'missing source_url');
  if (!ISO.test(s.verified_at || '')) err(s.id, `verified_at ${s.verified_at}`);
  for (const k of ['start_date', 'end_date']) if (s[k] != null && !ISO.test(s[k])) err(s.id, `${k} ${s[k]}`);
  if (s.start_date && s.end_date && s.end_date < s.start_date) err(s.id, 'end_date before start_date');
  if (s.date_status.startsWith('confirmed') && !s.start_date) err(s.id, `${s.date_status} without start_date`);
  if (s.date_status === 'pattern_estimated' && !s.estimate_basis) warn(s.id, 'estimate without estimate_basis');
  const pr = s.price;
  if (pr?.amount != null) {
    if (!ENUM.basis.includes(pr.basis)) err(s.id, `price amount without valid basis (${pr.basis})`);
    if (!fx.rates[pr.currency]) err(s.id, `currency ${pr.currency} has no fx rate`);
    if (!(pr.amount > 0)) err(s.id, `price amount ${pr.amount}`);
    if (pr.from != null && typeof pr.from !== 'boolean') err(s.id, `price.from ${pr.from}`);
  }
}

const entityIds = new Set([...P.keys(), ...G.keys(), ...Lc.keys(), ...S.keys()]);
for (const r of reviews) {
  if (!entityIds.has(r.entity_id)) err(r.id, `review for unknown entity ${r.entity_id}`);
  if (!URL_RE.test(r.url || '')) err(r.id, 'review without url');
  if (r.rating != null && r.rating > (r.scale || 5)) err(r.id, `rating ${r.rating} above scale`);
  for (const h of [...(r.highlights_pos || []), ...(r.highlights_neg || [])]) {
    if (!h.url) err(r.id, `highlight without url: ${String(h.text).slice(0, 30)}`);
  }
}
for (const c of conflicts) if (!entityIds.has(c.entity_id)) err(c.entity_id, 'conflict for unknown entity');

console.log(`providers ${providers.length} · programs ${programs.length} · locations ${locations.length} · sessions ${sessions.length} · reviews ${reviews.length}`);
if (warns.length) console.log(`\n${warns.length} warnings\n  ` + warns.join('\n  '));
if (errors.length) {
  console.error(`\n${errors.length} errors\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log('\nOK');
