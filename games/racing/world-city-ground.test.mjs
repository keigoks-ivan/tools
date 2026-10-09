import test from 'node:test';
import assert from 'node:assert/strict';
import { clipGroundTriangle } from './world-city-ground.mjs';
import { createTerrainHeightSampler } from './world-terrain.mjs';

const heights = [0, 1, 0, 2, 5, 1, 0, 2, 0];
const terrain = {
  parameters: { widthSegments: 2, heightSegments: 2 },
  attributes: { position: {
    getX: index => index % 3, getZ: index => Math.floor(index / 3), getY: index => heights[index],
  } },
};
const rendered = createTerrainHeightSampler(terrain);
const points = [[.12, .16], [1.89, .32], [.27, 1.91]];
const area = ([a, b, c]) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;

test('ground clipping preserves the authored footprint across terrain cells and non-coplanar diagonals', () => {
  const triangles = clipGroundTriangle(points, rendered.grid);
  assert.ok(triangles.length > 8);
  assert.ok(Math.abs(triangles.reduce((sum, triangle) => sum + area(triangle), 0) - area(points)) < 1e-10);
  const centre = points.reduce((sum, p) => [sum[0] + p[0] / 3, sum[1] + p[1] / 3], [0, 0]);
  assert.ok(Math.abs(points.reduce((sum, p) => sum + rendered(...p) / 3, 0) - rendered(...centre)) > .5, 'the unsplit face actually crosses a raised terrain ridge');
  for (const triangle of triangles) {
    const midpoint = triangle.reduce((sum, p) => [sum[0] + p[0] / 3, sum[1] + p[1] / 3], [0, 0]);
    const planeHeight = triangle.reduce((sum, p) => sum + rendered(...p) / 3, 0);
    assert.ok(Math.abs(planeHeight - rendered(...midpoint)) < 1e-10, 'every clipped face follows one rendered terrain plane');
  }
});

test('raised ground faces remain above rendered terrain throughout their interiors', () => {
  for (const triangle of clipGroundTriangle(points, rendered.grid)) {
    const ys = triangle.map(p => Math.max(1.3, rendered(...p)) + .045);
    for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10 - a; b++) {
      const weights = [a / 10, b / 10, 1 - (a + b) / 10];
      const x = triangle.reduce((sum, p, i) => sum + p[0] * weights[i], 0);
      const z = triangle.reduce((sum, p, i) => sum + p[1] * weights[i], 0);
      const y = ys.reduce((sum, height, i) => sum + height * weights[i], 0);
      assert.ok(y >= rendered(x, z) + .045 - 1e-10, 'neither a crest nor a diagonal buries the ground patch');
    }
  }
});

test('ground clipping retains direct-build and out-of-grid fallbacks', () => {
  assert.deepEqual(clipGroundTriangle(points), [points]);
  const outside = [[-1, 0], [.5, 0], [0, .5]];
  assert.deepEqual(clipGroundTriangle(outside, rendered.grid), [outside]);
});
