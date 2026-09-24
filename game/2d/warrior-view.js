const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A chase-camera projection over the existing deterministic combat plane.
// The hero stays in the foreground while fighters ahead get smaller and
// converge toward the gate. World coordinates and hit tests do not change.
export function projectWarriorPoint(point, hero) {
  const distance = point.y - hero.y;
  const scale = clamp(0.68 + distance * 0.0011, 0.34, 0.98);
  return {
    x: 640 + (point.x - hero.x) * scale / 0.68 * 0.76,
    y: 600 + distance * 0.64,
    scale,
  };
}

export function warriorBackgroundCrop(hero, width, height) {
  const zoom = clamp(1.08 + (500 - hero.y) * 0.00075, 1, 1.33);
  const cropWidth = width / zoom, cropHeight = height / zoom;
  const x = clamp(width / 2 + (hero.x - 640) * 0.12 - cropWidth / 2, 0, width - cropWidth);
  const y = clamp(height * 0.234 - cropHeight * 0.22, 0, height - cropHeight);
  return { x, y, width: cropWidth, height: cropHeight };
}
