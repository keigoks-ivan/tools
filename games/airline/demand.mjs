// Historical flight-leg traffic and a fitted proxy for pairs without observations.
// Annual totals include both directions; missing observations never mean zero demand.
import { OBSERVED_MARKETS, DEMAND_FIT } from './demand-data.mjs?v=19';

export const DEMAND_SOURCES = {
  'tw-caa': { zh: '台灣民航局', en: 'Taiwan CAA', url: 'https://www.caa.gov.tw/article.aspx?a=1746&lang=1' },
  'us-bts': { zh: '美國 BTS', en: 'US BTS', url: 'https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FJE' },
  'uk-caa': { zh: '英國 CAA', en: 'UK CAA', url: 'https://www.caa.co.uk/data-and-analysis/uk-aviation-market/airports/uk-airport-data/uk-airport-data-2025/annual-2025/' },
  eurostat: { zh: '歐盟 Eurostat', en: 'Eurostat', url: 'https://ec.europa.eu/eurostat/cache/metadata/EN/avia_pa_esms.htm' }
};
const cache = new Map();
export function marketProfile(a, b, distance) {
  const key = [a.id, b.id].sort().join('-');
  if (cache.has(key)) return cache.get(key);
  const observed = OBSERVED_MARKETS[key];
  const region = [a.region, b.region].sort().join('-');
  const gravity = 8000 * Math.sqrt(a.pop * b.pop) * (0.7 + 0.3 * (a.tourism + b.tourism)) / (distance / 1000 + 0.5) ** 0.8;
  const effect = DEMAND_FIT.intercept + DEMAND_FIT.distanceSlope * Math.log(distance / 1000 + 0.5)
    + (DEMAND_FIT.airports[a.id] || 0) + (DEMAND_FIT.airports[b.id] || 0) + (DEMAND_FIT.regions[region] || 0);
  const weeklyPax = observed ? observed[0] / 52 : gravity * Math.exp(effect);
  const weeklySeats = observed?.[1] ? observed[1] / 52 : weeklyPax / 0.82;
  const profile = Object.freeze({
    key, kind: observed ? 'observed' : 'estimated', weeklyPax, weeklySeats,
    annualPax: observed?.[0] ?? null, annualSeats: observed?.[1] ?? null,
    year: observed?.[2] ?? null, source: observed?.[3] ?? null,
    historicalLF: observed?.[1] ? observed[0] / observed[1] : null,
    capacityEstimated: !observed?.[1],
    sparse: !(DEMAND_FIT.coverage[a.id] >= 5 && DEMAND_FIT.coverage[b.id] >= 5),
    // Validation error on operating routes, not a confidence interval for a new service.
    estimateFactor: observed ? null : 2.81
  });
  cache.set(key, profile);
  return profile;
}
