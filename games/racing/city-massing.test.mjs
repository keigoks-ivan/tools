import test from 'node:test';
import assert from 'node:assert/strict';
import { streetMassing } from './world-city-massing.mjs';
import { CITY_DISTRICT_PLANS, cityDistrictAt } from './world-city-districts.mjs';
import { TRACKS } from './track.mjs';

test('street plots retain district scales and identical composition across quality settings', () => {
  for (const city of Object.keys(CITY_DISTRICT_PLANS)) {
    const track = TRACKS[city];
    for (let s = 22, index = 0; s < track.length; s += 31, index++) for (const side of [-1, 1]) {
      const district = cityDistrictAt(track, s, side); if (!district.density) continue;
      const lot = streetMassing(city, district, s, side, index);
      assert.ok(lot.height >= district.heights[0] && lot.height <= district.heights[1]);
      assert.ok(lot.setback >= 0 && lot.setback <= 5);
      assert.deepEqual(streetMassing(city, district, s, side, index), lot);
    }
  }
});

test('the Taipei approach mixes low apartments, setbacks and glazed offices instead of a repeating wall', () => {
  const track = TRACKS.taipei, lots = [];
  for (let s = 22, i = 0; s < track.length * .22; s += 24, i++) {
    lots.push(streetMassing('taipei', cityDistrictAt(track, s, -1), s, -1, i));
  }
  assert.ok(new Set(lots.map(lot => lot.height)).size >= 6);
  assert.ok(Math.max(...lots.map(lot => lot.height)) - Math.min(...lots.map(lot => lot.height)) >= 20);
  assert.ok(lots.some(lot => lot.facade >= 4) && lots.some(lot => lot.facade < 4));
  assert.ok(lots.some(lot => lot.upperSetback));
  assert.ok(track.width / 4 >= 3.2, 'four lanes leave sufficient width for the production cars');
});
