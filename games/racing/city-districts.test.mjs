import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from './track.mjs';
import { CITY_DISTRICT_PLANS, cityDistrictAt, cityDistrictForPoint } from './world-city-districts.mjs';

test('all nineteen routes have complete independent district plans with strong layout changes', () => {
  assert.equal(Object.keys(CITY_DISTRICT_PLANS).length, 19);
  const signatures = [];
  for (const [city, districts] of Object.entries(CITY_DISTRICT_PLANS)) {
    assert.equal(districts[0].from, 0); assert.equal(districts.at(-1).to, 1);
    assert.ok(districts.length >= 4);
    const layouts = new Set();
    for (const [index, district] of districts.entries()) {
      assert.ok(district.to > district.from);
      if (index) assert.equal(district.from, districts[index - 1].to);
      for (const side of [district.outer, district.inner]) {
        assert.ok(side.density >= 0 && side.density <= 1);
        assert.ok(side.spacing >= 12 && side.setback >= 0);
        assert.ok(side.heights.every(Number.isFinite) && side.heights[1] >= side.heights[0]);
        if (side.density === 0) assert.ok(side.groundWidth > 0 && side.ground);
        layouts.add(`${side.frontage}:${side.density === 0 ? 'open' : 'built'}`);
      }
    }
    assert.ok(layouts.size >= 2 && [...layouts].some(layout => layout.endsWith(':open')) && [...layouts].some(layout => layout.endsWith(':built')), `${city}: open landscape and occupied streets differ`);
    signatures.push(districts.map(d => `${d.from}:${d.outer.frontage}:${d.outer.density}:${d.inner.frontage}:${d.inner.density}`).join('|'));
  }
  assert.equal(new Set(signatures).size, 19, 'different cities do not share one renamed perimeter plan');
});

test('district lookup wraps laps and preserves asymmetric waterfront sides', () => {
  for (const [city, districts] of Object.entries(CITY_DISTRICT_PLANS)) {
    const track = TRACKS[city];
    for (const district of districts) for (const side of [-1, 1]) {
      const s = (district.from + district.to) / 2 * track.length, expected = side < 0 ? district.outer : district.inner;
      assert.equal(cityDistrictAt(track, s, side), expected);
      assert.equal(cityDistrictAt(track, s + track.length * 2, side), expected);
      assert.equal(cityDistrictAt(track, s - track.length, side), expected);
      const p = track.sample(s), offset = track.wallOffset + 20;
      assert.equal(cityDistrictForPoint(track, p.x + p.nx * side * offset, p.z + p.nz * side * offset).district, expected.district);
    }
  }
  assert.equal(cityDistrictAt(TRACKS.costa, 10), null);
  assert.equal(cityDistrictAt(TRACKS.taipei, NaN), null);
});

test('actual river, sea and lake approaches keep a building-free near side', () => {
  for (const [city, fraction, side] of [
    ['kobe', .85, -1], ['london', .58, -1], ['sydney', .12, -1],
    ['goldcoast', .12, -1], ['melbourne', .85, -1], ['paris', .86, -1],
    ['prague', .86, -1], ['newcastle', .35, -1], ['bangkok', .86, -1],
    ['sanfrancisco', .32, -1], ['newyork', .35, -1], ['vancouver', .13, -1],
    ['hanoi', .14, 1], ['hanoi', .57, 1], ['hanoi', .79, 1],
    ['lisbon', .83, -1], ['marseille', .82, -1], ['nice', .14, -1], ['warwick', .8, -1],
  ]) {
    const track = TRACKS[city], district = cityDistrictAt(track, track.length * fraction, side);
    assert.equal(district.density, 0, `${city}: near water view stays open`);
    assert.equal(district.skylineDensity, 0, `${city}: a generic second building row cannot refill the shore view`);
    const p = track.sample(fraction * track.length);
    let reachesWater = false;
    for (let offset = track.wallOffset + 8; offset < 200; offset += 4) {
      const x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
      if (city === 'london' ? x > 101 && x < 357 : city === 'hanoi' ? (x / 145) ** 2 + (z / 185) ** 2 < 1 :
        ['sydney', 'vancouver'].includes(city) ? x < -390 || z > 390 : city === 'goldcoast' ? x < -415 : city === 'nice' ? x < -405 :
        ['newcastle', 'sanfrancisco', 'newyork'].includes(city) ? z > 390 : city === 'warwick' ? z < -355 && z > -490 :
        city === 'paris' ? z < -390 && z > -550 : city === 'prague' ? z < -390 && z > -650 : city === 'melbourne' ? z < -380 && z > -505 :
        city === 'bangkok' ? z < -385 && z > -630 : city === 'lisbon' ? z < -385 : z < -390) reachesWater = true;
    }
    assert.ok(reachesWater, `${city}: the open side faces an existing water body`);
  }
});
