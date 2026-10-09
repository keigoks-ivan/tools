export function sunlightProfile({ city = false, alpine = false, canyon = false, cloudy = false } = {}) {
  const skyFile = cloudy || alpine ? 'environment.hdr' : city || canyon ? 'environment-desert.hdr' : 'environment-coast.hdr';
  return {
    skyFile,
    skyRotation: -1.8,
    // Overcast skies use a weak directional fill; the clear skies have a photographed sun.
    sunOffset: alpine ? { x: -82, y: 95, z: 58 }
      : skyFile === 'environment-desert.hdr' ? { x: -93, y: 41, z: 81 }
        : { x: -26, y: 125, z: 22 },
  };
}

// Preserve the photographed HDR sun directions; move only the shadow window.
export function shadowFrame(position, direction, { extent = 56, resolution = 1024, distance = 1200, lookAhead = 14 } = {}) {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const z = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
  const horizontal = Math.hypot(z.x, z.z);
  const right = horizontal > 1e-6 ? { x: z.z / horizontal, y: 0, z: -z.x / horizontal } : { x: 1, y: 0, z: 0 };
  const up = { x: z.y * right.z, y: z.z * right.x - z.x * right.z, z: -z.y * right.x };
  const center = { x: position.x + Math.sin(position.heading || 0) * lookAhead, y: position.y, z: position.z + Math.cos(position.heading || 0) * lookAhead };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const texel = extent * 2 / resolution;
  const rx = Math.round(dot(center, right) / texel) * texel;
  const uy = Math.round(dot(center, up) / texel) * texel;
  const depth = dot(center, z);
  const target = { x: right.x * rx + up.x * uy + z.x * depth, y: right.y * rx + up.y * uy + z.y * depth, z: right.z * rx + up.z * uy + z.z * depth };
  return { target, light: { x: target.x + z.x * distance, y: target.y + z.y * distance, z: target.z + z.z * distance }, right, up, texel };
}
