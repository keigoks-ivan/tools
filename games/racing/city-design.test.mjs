import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from './track.mjs';
import { CITY_DESIGN_PROFILES, designDistrict } from './world-city-design.mjs';
import { CITY_DISTRICT_PLANS, cityDistrictAt } from './world-city-districts.mjs';
import { CITY_ROAD_PROFILES } from './world-city-roadmarkings.js';
import { streetMassing } from './world-city-massing.mjs';

test('every city has a revised driving corridor with full-size lanes and clear barriers', () => {
  assert.deepEqual(Object.keys(CITY_DESIGN_PROFILES), Object.keys(CITY_DISTRICT_PLANS));
  for (const city of Object.keys(CITY_DESIGN_PROFILES)) {
    const track = TRACKS[city];
    assert.ok(track.layoutVersion >= 2, `${city}: revised geometry has separate lap records`);
    assert.ok(track.width / (CITY_ROAD_PROFILES[city].lanes * 2) >= 3.15, `${city}: lane width supports the cars`);
    assert.ok(track.wallOffset - track.width / 2 > 3);
    assert.ok(CITY_DESIGN_PROFILES[city].treeOffset >= 1.8 && CITY_DESIGN_PROFILES[city].treeOffset <= 2.6);
  }
});

test('compact forecourts preserve planted buffers and never shrink open waterfronts', () => {
  const open = { density: 0, setback: 0, groundWidth: 130, frontage: 'quay', trees: .7 };
  const court = { density: .8, setback: 24, groundWidth: 21, frontage: 'tower', trees: .3 };
  for (const city of Object.keys(CITY_DESIGN_PROFILES)) {
    assert.equal(designDistrict(city, open), open, `${city}: original water view remains open`);
    const designed = designDistrict(city, court);
    assert.ok(designed.setback >= CITY_DESIGN_PROFILES[city].minSetback);
    assert.ok(Math.abs(designed.groundWidth / designed.setback - court.groundWidth / court.setback) < 1e-12);
    if (city !== 'taipei') assert.ok(designed.setback < court.setback);
  }
});

test('tower districts mix original towers with lower podiums and narrower upper floors', () => {
  for (const city of Object.keys(CITY_DESIGN_PROFILES).filter(city => CITY_DESIGN_PROFILES[city].tower)) {
    const track = TRACKS[city], towers = [];
    for (let s = 24, i = 0; s < track.length; s += 27, i++) for (const side of [-1, 1]) {
      const district = cityDistrictAt(track, s, side);
      if (district.frontage !== 'tower') continue;
      const mass = streetMassing(city, district, s, side, i);
      towers.push(mass);
      if (!mass.podiumHeight) continue;
      assert.ok(mass.podiumHeight > 3.9 && mass.podiumHeight <= mass.height * .25);
      assert.ok(mass.towerInset >= .70 && mass.towerInset <= .87);
      assert.ok(mass.towerDepth >= .76 && mass.towerDepth <= .89);
    }
    assert.ok(towers.some(mass => mass.podiumHeight > 0), `${city}: pedestrian-scale podiums are generated`);
    assert.ok(towers.some(mass => mass.podiumHeight === 0), `${city}: the whole district does not repeat one tower silhouette`);
  }
});
