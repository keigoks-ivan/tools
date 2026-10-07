import assert from 'node:assert/strict';
import * as M from '../model.mjs';

// Acquire through the public order API and wait for real delivery before testing a schedule.
export function deliverFor(state, routes) {
  let s = state;
  for (let i=0;i<8;i++) {
    const capacity=M.routeCapacity(s,routes),missing=capacity.missing;
    if (capacity.fits) return s;
    let left = M.fleetLimits(s).ordersLeft;
    const lease = {};
    for (const [type,n] of Object.entries(missing)) {
      const pending = (s.fleetOrders || []).filter(o=>o.type===type).length;
      const count = Math.min(Math.max(0,n-pending),left);
      if (count) { lease[type]=count; left-=count; }
    }
    const hire=Object.fromEntries(Object.entries(M.crewAvailability(s,routes)).map(([type,c])=>[type,Math.max(0,c.missing-c.pending)]));
    const out = M.applyDecisions(s,{fleet:{lease},personnel:{hire}});
    assert.deepEqual(out.errors,[]);
    s = M.simulateTurn(out.state).state;
  }
  throw new Error('Fleet could not be delivered within eight turns');
}
