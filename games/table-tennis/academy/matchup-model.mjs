// Exploratory head-to-head model. These estimates are not validated forecasts.
const DAY = 86400000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function verifiedMatches(pairing) {
  const seen = new Set();
  return (pairing.matches || []).filter(match => {
    if (![pairing.a, pairing.b].includes(match.winner) || !Number.isFinite(Date.parse(match.date))) return false;
    const key = `${match.date}|${match.event}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}
export function historicalRecord(pairing) {
  if (pairing.recordScope === 'careerOfficial' && pairing.officialSummary) {
    const { winsA, winsB } = pairing.officialSummary;
    if (Number.isInteger(winsA) && Number.isInteger(winsB) && winsA >= 0 && winsB >= 0) return { winsA, winsB, n: winsA + winsB, complete: true };
  }
  const matches = verifiedMatches(pairing), winsA = matches.filter(match => match.winner === pairing.a).length;
  return { winsA, winsB: matches.length - winsA, n: matches.length, complete: false };
}
function logGamma(z) {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z--; let x = 0.9999999999998099;
  for (let i = 0; i < coefficients.length; i++) x += coefficients[i] / (z + i + 1);
  const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betaFraction(a, b, x) {
  const tiny = 1e-30, protect = value => Math.abs(value) < tiny ? tiny : value;
  let c = 1, d = 1 / protect(1 - (a + b) * x / (a + 1)), h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
    d = 1 / protect(1 + aa * d); c = protect(1 + aa / c); h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
    d = 1 / protect(1 + aa * d); c = protect(1 + aa / c); const change = d * c; h *= change;
    if (Math.abs(change - 1) < 1e-12) break;
  }
  return h;
}
export function betaCdf(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  const value = x < (a + 1) / (a + b + 2) ? factor * betaFraction(a, b, x) / a : 1 - factor * betaFraction(b, a, 1 - x) / b;
  return clamp(value, 0, 1);
}
function betaQuantile(q, a, b) {
  let low = 0, high = 1;
  for (let i = 0; i < 60; i++) { const middle = (low + high) / 2; if (betaCdf(middle, a, b) < q) low = middle; else high = middle; }
  return (low + high) / 2;
}
export function estimatePair(pairing, asOf, halfLifeDays = 730) {
  const now = Date.parse(asOf), halfLife = Number(halfLifeDays);
  if (!Number.isFinite(now) || !(halfLife > 0)) throw new RangeError('Valid date and positive half-life required');
  const matches = verifiedMatches(pairing).filter(match => Date.parse(match.date) <= now);
  if (!matches.length) return null;
  let weightedWinsA = 0, weightedWinsB = 0;
  for (const match of matches) {
    const age = Math.max(0, (now - Date.parse(match.date)) / DAY), weight = Math.pow(0.5, age / halfLife);
    if (match.winner === pairing.a) weightedWinsA += weight; else weightedWinsB += weight;
  }
  const alpha = 1 + weightedWinsA, beta = 1 + weightedWinsB;
  return { n: matches.length, effectiveN: weightedWinsA + weightedWinsB, alpha, beta, probability: alpha / (alpha + beta), low: betaQuantile(0.05, alpha, beta), high: betaQuantile(0.95, alpha, beta), first: matches[0].date, last: matches.at(-1).date, halfLifeDays: halfLife };
}
export function recentRecord(pairing, asOf, years = 2) {
  const end = Date.parse(asOf), start = end - years * 365.25 * DAY;
  const matches = verifiedMatches(pairing).filter(match => Date.parse(match.date) >= start && Date.parse(match.date) <= end);
  const winsA = matches.filter(match => match.winner === pairing.a).length;
  return { n: matches.length, winsA, winsB: matches.length - winsA };
}
