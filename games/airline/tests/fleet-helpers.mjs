import assert from 'node:assert/strict';
import * as M from '../model.mjs';

// Acquire through the public order API and wait for real delivery before testing a schedule.
export function deliverFor(state, routes) {
  let s = state;
  for (let i=0;i<8;i++) {
    const missing = M.routeCapacity(s,routes).missing;
    if (!Object.keys(missing).length) return s;
    let left = M.fleetLimits(s).ordersLeft;
    const lease = {};
    for (const [type,n] of Object.entries(missing)) {
      const pending = (s.fleetOrders || []).filter(o=>o.type===type).length;
      const count = Math.min(Math.max(0,n-pending),left);
      if (count) { lease[type]=count; left-=count; }
    }
    const out = M.applyDecisions(s,{fleet:{lease}});
    assert.deepEqual(out.errors,[]);
    s = M.simulateTurn(out.state).state;
  }
  throw new Error('Fleet could not be delivered within eight turns');
}
