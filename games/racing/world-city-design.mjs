// Art direction for adapted city circuits. Compact streets retain room for
// the closed-course barriers; waterfront parks keep their original open side.
export const CITY_DESIGN_PROFILES = Object.freeze(Object.fromEntries(Object.entries({
  taipei:       { setbackScale: 1,    minSetback: 3.8, treeOffset: 2.3, trees: 0,    tower: false },
  kualalumpur:  { setbackScale: .65,  minSetback: 4.4, treeOffset: 2.6, trees: .48,  tower: true },
  kobe:         { setbackScale: .72,  minSetback: 4.3, treeOffset: 2.3, trees: .30,  tower: false },
  london:       { setbackScale: .64,  minSetback: 4.2, treeOffset: 2.0, trees: .42,  tower: false },
  sydney:       { setbackScale: .70,  minSetback: 4.4, treeOffset: 2.4, trees: .40,  tower: true },
  goldcoast:    { setbackScale: .72,  minSetback: 4.6, treeOffset: 2.5, trees: .52,  tower: true },
  melbourne:    { setbackScale: .66,  minSetback: 4.2, treeOffset: 2.0, trees: .38,  tower: true },
  paris:        { setbackScale: .65,  minSetback: 4.2, treeOffset: 2.0, trees: .58,  tower: false },
  prague:       { setbackScale: .62,  minSetback: 4.0, treeOffset: 1.9, trees: .27,  tower: false },
  newcastle:    { setbackScale: .64,  minSetback: 4.2, treeOffset: 2.0, trees: .28,  tower: false },
  bangkok:      { setbackScale: .67,  minSetback: 4.2, treeOffset: 2.2, trees: .48,  tower: true },
  sanfrancisco: { setbackScale: .64,  minSetback: 4.3, treeOffset: 1.9, trees: .30,  tower: false },
  newyork:      { setbackScale: .57,  minSetback: 4.0, treeOffset: 2.0, trees: .12,  tower: true },
  vancouver:    { setbackScale: .69,  minSetback: 4.6, treeOffset: 2.6, trees: .56,  tower: true },
  hanoi:        { setbackScale: .68,  minSetback: 4.0, treeOffset: 1.9, trees: .58,  tower: false },
  lisbon:       { setbackScale: .65,  minSetback: 4.0, treeOffset: 1.8, trees: .27,  tower: false },
  marseille:    { setbackScale: .66,  minSetback: 4.2, treeOffset: 2.1, trees: .35,  tower: false },
  nice:         { setbackScale: .68,  minSetback: 4.4, treeOffset: 2.4, trees: .54,  tower: false },
  warwick:      { setbackScale: .80,  minSetback: 4.8, treeOffset: 2.4, trees: .45,  tower: false },
}).map(([city, design]) => [city, Object.freeze(design)])));

export function designDistrict(city, district) {
  const design = CITY_DESIGN_PROFILES[city];
  if (!design || !district.density || city === 'taipei') return district;
  const setback = Math.max(design.minSetback, district.setback * design.setbackScale);
  return {
    ...district, setback,
    // A planted tower forecourt shrinks with its building setback, while open
    // parks, beaches and river corridors retain their full landscape width.
    groundWidth: district.groundWidth * setback / Math.max(1, district.setback),
    trees: Math.max(district.trees, design.trees),
  };
}
