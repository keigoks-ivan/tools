// Six-sided blade sections have a raised back/ridge and a genuinely thin edge.
// Surface normals and studio reflections describe thickness instead of stacked plates.
export function forgedBlade(T, kind) {
  const sections = 32, profile = [[-1, -0.65], [-0.45, -1], [0.68, -0.36], [1, 0], [0.68, 0.36], [-0.45, 1], [-1, 0.65], [-1, 0]];
  const faces = { steel: [], edge: [] }, uv = { steel: [], edge: [] };
  function row(t) {
    let y, x, width, thickness;
    if (kind === 'glaive') {
      y = 0.81 + t * 0.73;
      x = 0.012 + Math.sin(t * Math.PI * 0.88) * 0.132;
      width = (0.022 + Math.sin(t * Math.PI) * 0.066) * Math.max(0.035, 1 - Math.pow(t, 7));
      thickness = 0.007 * (1 - t * 0.75);
    } else if (kind === 'dagger') {
      y = 0.13 + t * 0.37; x = 0.008 + Math.sin(t * Math.PI) * 0.013;
      width = 0.031 * (0.75 + Math.sin(t * Math.PI) * 0.25) * Math.max(0.03, 1 - Math.pow(t, 3)); thickness = 0.005 * (1 - t * 0.65);
    } else {
      y = 0.125 + t * 0.76; x = 0.025 * t * t;
      width = 0.0175 * (1 - 0.15 * t) * Math.max(0.03, 1 - Math.pow(t, 15)); thickness = 0.0043 * (1 - t * 0.6);
    }
    return profile.map(([u, v]) => [x + u * width, y, v * thickness]);
  }
  for (let i = 0; i < sections; i++) {
    const a = row(i / sections), b = row((i + 1) / sections);
    for (let j = 0; j < profile.length; j++) {
      const k = (j + 1) % profile.length, name = j === 2 || j === 3 ? 'edge' : 'steel';
      faces[name].push(...a[j], ...b[j], ...a[k], ...a[k], ...b[j], ...b[k]);
      uv[name].push(j / profile.length, i / sections, j / profile.length, (i + 1) / sections, k / profile.length, i / sections, k / profile.length, i / sections, j / profile.length, (i + 1) / sections, k / profile.length, (i + 1) / sections);
    }
  }
  for (const t of [0, 1]) {
    const points = row(t);
    for (let j = 1; j < points.length - 1; j++) {
      const triangle = t ? [points[0], points[j + 1], points[j]] : [points[0], points[j], points[j + 1]];
      faces.steel.push(...triangle.flat()); uv.steel.push(0, t, j / profile.length, t, (j + 1) / profile.length, t);
    }
  }
  return Object.entries(faces).map(([name, positions]) => {
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uv[name], 2)); geometry.computeVertexNormals();
    return { geometry, edge: name === 'edge' };
  });
}
