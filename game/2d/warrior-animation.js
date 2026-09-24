// Frame IDs 0–3 are the original rear poses; 4–7 are the action sheet.
export function warriorFrameAt(action, time, clock = 0, combo = 1) {
  if (action === 'run') return Math.floor(clock * 9) % 2 ? 1 : 0;
  if (action === 'dodge') return 1;
  if (action === 'attack') {
    if (combo === 3) {
      if (time < 0.075) return 3;
      if (time < 0.19) return 6;
      return 7;
    }
    if (time < 0.075) return 4; // draw back
    if (time < 0.17) return 5;  // blade crosses the target
    if (time < 0.26) return 2;  // follow through
    return 7;                   // return to guard
  }
  if (action === 'heavy' || action === 'special') {
    if (time < 0.22) return 3;  // high windup
    if (time < 0.4) return 6;   // downward impact
    return 7;
  }
  return 0;
}
