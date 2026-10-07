// Stationary carrier recovery practice. The origin is the angled landing area;
// deck = local y 0, sea = -20 m, -Z is the landing heading. No ship motion/heave yet.
export const CARRIER = Object.freeze({
  length: 260, width: 24, nearThreshold: 130, farThreshold: -130,
  touchdownTarget: 95, elevation: 0, fieldElevation: 20, heading: 0,
  bearing: 0, glideslope: 3.5, seaHeight: -20,
  shipYaw: 9 * Math.PI / 180,
  deckOutline: Object.freeze([[-29,155],[27,155],[37,104],[37,-125],[22,-170],[-23,-170],[-38,-95],[-39,84]].map(Object.freeze)),
  wires: Object.freeze([112, 98, 84, 70]), hookAftM: 5.5, arrestDeceleration: 28,
});
export function onCarrierDeck(position) {
  const c = Math.cos(CARRIER.shipYaw), s = Math.sin(CARRIER.shipYaw);
  const x = position.x * c - position.z * s, z = position.x * s + position.z * c;
  let inside = false;
  for (let i = 0, j = CARRIER.deckOutline.length - 1; i < CARRIER.deckOutline.length; j = i++) {
    const [xi, zi] = CARRIER.deckOutline[i], [xj, zj] = CARRIER.deckOutline[j];
    if ((zi > z) !== (zj > z) && x < (xj-xi) * (z-zi) / (zj-zi) + xi) inside = !inside;
  }
  return inside;
}
export function crossedArrestingWire(state, previousHookZ, hookZ, heading) {
  if (!state.onGround || state.crashed || !(state.hookPosition >= .95) || !(state.gearPosition >= .95) || Math.abs(state.position.x) > 10 || Math.abs(heading) > 12 || hookZ >= previousHookZ) return null;
  const index = CARRIER.wires.findIndex(z => previousHookZ >= z && hookZ < z);
  return index < 0 ? null : index + 1;
}
