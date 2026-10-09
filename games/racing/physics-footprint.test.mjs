import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from './track.mjs';
import { VEHICLES } from './vehicles.mjs';
import { createDrivingState, stepDriving } from './physics.mjs';

const cityTracks = Object.values(TRACKS).filter(track => !['costa', 'alpine', 'canyon', 'grandprix'].includes(track.id));
const phases = [.03, .16, .31, .44, .57, .70, .83, .96];

for (const track of cityTracks) {
  test(`${track.id}: all vehicle corners remain inside curved guardrails at each approach angle`, () => {
    const sharpest = track.samples.reduce((best, point) => Math.abs(point.curvature) > Math.abs(best.curvature) ? point : best);
    const distances = [...phases.map(phase => phase * track.length), sharpest.s];
    for (const vehicle of Object.values(VEHICLES)) {
      const halfLength = (vehicle.dimensions?.length || 4.53) / 2;
      const halfWidth = (vehicle.dimensions?.width || 1.94) / 2;
      for (const distance of distances) for (const side of [-1, 1]) for (let angle = 0; angle <= 6; angle++) {
        const point = track.sample(distance), state = createDrivingState(track);
        const offset = side * (track.wallOffset - halfWidth + .12);
        Object.assign(state, {
          x: point.x + point.nx * offset, z: point.z + point.nz * offset,
          y: point.y, s: point.s, heading: point.heading + side * angle * Math.PI / 12,
          _lastS: point.s,
        });
        state.vx = Math.sin(state.heading) * 8; state.vz = Math.cos(state.heading) * 8; state.speed = 8;
        state._lastX = state.x; state._lastZ = state.z;
        stepDriving(state, {}, 1 / 120, track, vehicle);
        const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
        // Each corner is projected independently onto the actual sampled road;
        // the assertion does not reuse the centre's collision-radius formula.
        for (const longitudinal of [-halfLength, halfLength]) for (const lateral of [-halfWidth, halfWidth]) {
          const x = state.x + sin * longitudinal + cos * lateral;
          const z = state.z + cos * longitudinal - sin * lateral;
          const corner = track.nearest(x, z, state.s);
          const excess = Math.abs(corner.offset) - track.wallOffset;
          assert.ok(excess <= .001, `${vehicle.id}, ${distance.toFixed(2)} m, side ${side}, angle ${angle * 15}°: corner exceeds rail by ${excess.toFixed(4)} m`);
        }
      }
    }
  });
}
