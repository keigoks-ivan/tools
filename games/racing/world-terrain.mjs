// Sample the rendered, rotated PlaneGeometry triangles rather than the
// analytic terrain function between its relatively coarse grid vertices.
export function createTerrainHeightSampler(terrain) {
  const positions = terrain.attributes.position;
  const { widthSegments: columns, heightSegments: rows } = terrain.parameters;
  const stride = columns + 1;
  const minX = positions.getX(0), minZ = positions.getZ(0);
  const cellX = (positions.getX(columns) - minX) / columns;
  const cellZ = (positions.getZ(rows * stride) - minZ) / rows;
  const sample = (x, z) => {
    const gridX = (x - minX) / cellX, gridZ = (z - minZ) / cellZ;
    if (!Number.isFinite(gridX + gridZ) || gridX < 0 || gridZ < 0 || gridX > columns || gridZ > rows) return null;
    const column = Math.min(columns - 1, Math.floor(gridX));
    const row = Math.min(rows - 1, Math.floor(gridZ));
    const u = gridX - column, v = gridZ - row, a = row * stride + column;
    const h00 = positions.getY(a), h10 = positions.getY(a + 1);
    const h01 = positions.getY(a + stride), h11 = positions.getY(a + stride + 1);
    return u + v <= 1
      ? h00 + (h10 - h00) * u + (h01 - h00) * v
      : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  sample.grid = Object.freeze({ minX, minZ, cellX, cellZ, columns, rows });
  return sample;
}
