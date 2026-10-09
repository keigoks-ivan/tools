// Split authored ground faces at the rendered terrain's grid and diagonal.
// Every output triangle then lies on one terrain plane, including its interior.
export function clipGroundTriangle(points, grid) {
  if (!grid) return [points];
  const { minX, minZ, cellX, cellZ, columns, rows } = grid;
  const polygon = points.map(([x, z]) => [(x - minX) / cellX, (z - minZ) / cellZ]);
  if (polygon.some(([x, z]) => x < 0 || z < 0 || x > columns || z > rows)) return [points];
  const minColumn = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[0]))));
  const maxColumn = Math.min(columns - 1, Math.floor(Math.max(...polygon.map(p => p[0]))));
  const minRow = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[1]))));
  const maxRow = Math.min(rows - 1, Math.floor(Math.max(...polygon.map(p => p[1]))));
  const triangles = [];
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  function clip(subject, boundary) {
    let result = subject;
    for (let edge = 0; edge < 3 && result.length; edge++) {
      const a = boundary[edge], b = boundary[(edge + 1) % 3], output = [];
      let previous = result.at(-1), previousDistance = cross(a, b, previous);
      for (const point of result) {
        const distance = cross(a, b, point);
        if ((distance >= -1e-9) !== (previousDistance >= -1e-9)) {
          const t = previousDistance / (previousDistance - distance);
          output.push([previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t]);
        }
        if (distance >= -1e-9) output.push(point);
        previous = point; previousDistance = distance;
      }
      result = output;
    }
    return result;
  }
  for (let row = minRow; row <= maxRow; row++) for (let column = minColumn; column <= maxColumn; column++) {
    const a = [column, row], b = [column + 1, row], c = [column, row + 1], d = [column + 1, row + 1];
    for (const boundary of [[a, b, c], [b, d, c]]) {
      const clipped = clip(polygon, boundary);
      for (let vertex = 1; vertex < clipped.length - 1; vertex++) {
        const face = [clipped[0], clipped[vertex], clipped[vertex + 1]];
        if (Math.abs(cross(...face)) < 1e-10) continue;
        triangles.push(face.map(([x, z]) => [minX + x * cellX, minZ + z * cellZ]));
      }
    }
  }
  return triangles;
}
