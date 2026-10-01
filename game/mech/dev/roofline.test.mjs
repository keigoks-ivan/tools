import test from 'node:test';
import assert from 'node:assert/strict';
import { roofline } from '../roofline.js';

test('four city crown styles stay within 180 triangles per building and produce finite faces', () => {
  for (const kind of ['old','industrial','tower','east']) for (const offset of [0,1,2]) {
    let triangles = 0; const heights = new Set();
    roofline(-80, 0, -30 + offset, 30 + offset, 24, kind, (a,b,c,d) => {
      for (const p of [a,b,c,d]) { assert(p.every(Number.isFinite)); heights.add(p[1]); }
      const u = b.map((n,i) => n-a[i]), v = c.map((n,i) => n-a[i]);
      assert(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]) > 0.001);
      triangles += 2;
    }, (x0,x1,y0,y1,z0,z1) => {
      assert([x0,x1,y0,y1,z0,z1].every(Number.isFinite)); assert(x1>x0 && y1>y0 && z1>z0); triangles += 12;
    });
    assert(triangles > 10 && triangles <= 180, kind + ': ' + triangles); assert(heights.size >= 2);
  }
});
