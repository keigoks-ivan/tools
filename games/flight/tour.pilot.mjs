// Scripted pilot for the tour flyability tests (not used by the game). Flies through stepFlight at 120 Hz: pure pursuit to the next ring
// (heading error -> bank, the physics autopilot's own 25 degree limit), altitude and speed held by the same feedback loops.
import { stepFlight, getFlightData } from './physics.mjs';
import { START_KT, createTourState, createTourRun, updateTourRun, ringHeightM, bearing } from './tour.mjs';

const KT = 1.943844;

// Aim at a point on the leg line a little short of the ring (35% of the distance still to go), so the approach curves onto the line and the ring
// is crossed along the leg rather than at an angle. Close to the ring the aim point is the ring itself.
export function carrot(a, b, p, share = .15) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, to = Math.hypot(b.x - p.x, b.z - p.z);
  return { x: b.x - ux * to * share, z: b.z - uz * to * share };
}

export function flyTour(tour, { seconds = 600, kt = START_KT } = {}) {
  const s = createTourState(tour), run = createTourRun(tour), ias = kt / KT;
  let maxBank = 0, minAgl = Infinity, data = getFlightData(s);
  updateTourRun(run, s.position);
  for (let i = 0; i < seconds * 120 && !s.crashed && !run.done; i++) {
    const r = tour.rings[run.next], a = run.next ? tour.rings[run.next - 1] : tour.start, p = s.position, aim = carrot(a, r, p);
    // Lateral: the autopilot banks 0.8 deg per degree of heading error, up to 25. Commanding 3x the error makes the turn onto the ring "bang-bang"
    // (full bank until the last few degrees), which is how a person flies it. Vertical: ask for the climb rate that reaches the ring altitude on time.
    const err = ((bearing(p, aim) - data.heading + 540) % 360) - 180, ground = Math.max(60, data.groundSpeed);
    const wanted = (ringHeightM(r) - p.y) / (Math.hypot(r.x - p.x, r.z - p.z) / ground);
    stepFlight(s, { gear: false, flaps: 0, autopilot: { enabled: true, heading: data.heading + Math.max(-60, Math.min(60, err * 3)), altitude: p.y + Math.max(-300, Math.min(300, wanted / .035)), speed: ias } }, 1 / 120, {});
    data = getFlightData(s);
    updateTourRun(run, s.position);
    maxBank = Math.max(maxBank, Math.abs(data.roll));
  }
  return { state: s, data, run, time: s.elapsed, maxBank };
}
