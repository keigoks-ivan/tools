// Index generated triangle lists using exact attributes. UV seams, hard normals
// and skin weights remain separate; triangle order and every value stay intact.
export function indexGeometry(geometry) {
  if (geometry.index || Object.keys(geometry.morphAttributes).length) return geometry;
  const attributes = Object.entries(geometry.attributes);
  if (!geometry.attributes.position || attributes.some(([, a]) => a.isInterleavedBufferAttribute)) return geometry;
  const vertices = [], indices = [], seen = new Map();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    let key = '';
    for (const [, attribute] of attributes) {
      const start = i * attribute.itemSize;
      for (let k = 0; k < attribute.itemSize; k++) {
        const value = attribute.array[start + k];
        key += `${Object.is(value, -0) ? '-0' : value},`;
      }
    }
    let index = seen.get(key);
    if (index === undefined) { index = vertices.length; seen.set(key, index); vertices.push(i); }
    indices.push(index);
  }
  const bytesPerVertex = attributes.reduce((sum, [, a]) => sum + a.array.BYTES_PER_ELEMENT * a.itemSize, 0);
  const indexBytes = vertices.length > 65535 ? 4 : 2;
  if (vertices.length * bytesPerVertex + indices.length * indexBytes >= geometry.attributes.position.count * bytesPerVertex) return geometry;
  const result = new geometry.constructor();
  for (const [name, attribute] of attributes) {
    const array = new attribute.array.constructor(vertices.length * attribute.itemSize);
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i] * attribute.itemSize;
      array.set(attribute.array.subarray(start, start + attribute.itemSize), i * attribute.itemSize);
    }
    const copy = new attribute.constructor(array, attribute.itemSize, attribute.normalized);
    copy.setUsage(attribute.usage); copy.gpuType = attribute.gpuType;
    result.setAttribute(name, copy);
  }
  result.setIndex(indices);
  for (const group of geometry.groups) result.addGroup(group.start, group.count, group.materialIndex);
  result.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
  result.boundingBox = geometry.boundingBox?.clone() || null;
  result.boundingSphere = geometry.boundingSphere?.clone() || null;
  result.name = geometry.name; result.userData = { ...geometry.userData };
  return result;
}
