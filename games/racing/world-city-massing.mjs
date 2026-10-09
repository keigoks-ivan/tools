// Metre-scale plot composition for adapted city circuits. Neighbouring plots
// vary by address and block, rather than repeating a four-building sequence.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function hash(city, block, side, salt = 0) {
  let seed = 2166136261;
  for (const c of city) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  seed = Math.imul(seed ^ block, 2246822519) ^ Math.imul(side, 3266489917) ^ salt;
  seed = Math.imul(seed ^ seed >>> 16, 2246822519);
  return ((seed ^ seed >>> 13) >>> 0) / 4294967296;
}

export function streetMassing(city, district, s, side, index) {
  const address = Math.floor(s / 11), block = Math.floor(s / 95);
  const a = hash(city, address, side), b = hash(city, block, side, 41);
  const tower = district.facades === 'modern' || district.frontage === 'tower';
  const heritage = ['paris', 'london', 'newcastle', 'prague', 'nice', 'marseille', 'lisbon', 'warwick'].includes(city);
  const [low, high] = district.heights;
  const mix = tower ? .13 + a * .84 : heritage ? .12 + a * .73 : a < .48 ? .03 + a * .66 : .44 + a * .56;
  const floor = city === 'taipei' ? 3.5 : tower ? 3.7 : 3.4;
  const height = clamp(4.2 + Math.round((low + (high - low) * mix - 4.2) / floor) * floor, low, high);
  const mixedTaipei = city === 'taipei' && !tower && a > .76 && height > 24;
  const facade = city === 'taipei' ? tower || mixedTaipei ? 4 + (b > .5 ? 1 : 0) : Math.floor(b * 4 + a * 3) % 4 : index + Math.floor(b * 17);
  return {
    height, facade,
    setback: tower ? b * 5 : heritage ? b * 1.7 : b < .4 ? 0 : 1.1 + b * 2.5,
    upperSetback: city === 'taipei' && height > 22 && a > .34 && a < .72,
    inset: .68 + b * .19,
  };
}
