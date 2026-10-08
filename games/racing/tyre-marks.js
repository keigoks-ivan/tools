import * as THREE from './vendor/three.module.js';

// A fixed-size ring stores actual rear-wheel paths; no particles or per-frame allocation.
export function createTyreMarks({ scene, track, mobile = false, wet = 0, resourcesOwnedByWorld = false }) {
  const capacity = mobile ? 384 : 768, vertices = capacity * 6;
  const positions = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2), birth = new Float32Array(vertices), strength = new Float32Array(vertices);
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', positions, 3], ['uv', uv, 2], ['birth', birth, 1], ['strength', strength, 1]]) geometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    name: 'rear-tyre-rubber', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    uniforms: { elapsed: { value: 0 }, wetness: { value: wet } },
    vertexShader: `attribute float birth;attribute float strength;varying vec2 markUv;varying float markBirth;varying float markStrength;
      void main(){markUv=uv;markBirth=birth;markStrength=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float elapsed;uniform float wetness;varying vec2 markUv;varying float markBirth;varying float markStrength;
      void main(){float edge=smoothstep(0.,.17,markUv.x)*(1.-smoothstep(.83,1.,markUv.x));float age=max(0.,elapsed-markBirth);
      float opacity=edge*markStrength*.30*(1.-wetness*.65)*(1.-smoothstep(35.,65.,age));if(opacity<.002)discard;gl_FragColor=vec4(.018,.021,.020,opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Rear tyre rubber paths'; mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  let cursor = 0, used = 0, previous = null, disposed = false, lastElapsed = -1;
  function contact(state, vehicle, side) {
    const width = (vehicle.dimensions?.width || 1.9) * .41, axle = vehicle.rearAxle || 1.2;
    const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
    const x = state.x - sin * axle + cos * width * side, z = state.z - cos * axle - sin * width * side;
    const road = track.nearest(x, z, state.s);
    return { x, y: road.y + .043, z };
  }
  function segment(a, b, now, slip) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < .04 || length > 4) return;
    const nx = -dz / length * .11, nz = dx / length * .11;
    const points = [[a.x - nx, a.y, a.z - nz], [b.x - nx, b.y, b.z - nz], [a.x + nx, a.y, a.z + nz], [a.x + nx, a.y, a.z + nz], [b.x - nx, b.y, b.z - nz], [b.x + nx, b.y, b.z + nz]];
    const coords = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]], offset = cursor * 6;
    for (let i = 0; i < 6; i++) { positions.set(points[i], (offset + i) * 3); uv.set(coords[i], (offset + i) * 2); birth[offset + i] = now; strength[offset + i] = slip; }
    for (const [name, size] of [['position', 3], ['uv', 2], ['birth', 1], ['strength', 1]]) { geometry.attributes[name].addUpdateRange(offset * size, 6 * size); geometry.attributes[name].needsUpdate = true; }
    cursor = (cursor + 1) % capacity; used = Math.min(capacity, used + 1); geometry.setDrawRange(0, used * 6);
  }
  return { group: mesh, update(state, vehicle = {}) {
    const now = state.elapsed || 0; material.uniforms.elapsed.value = now;
    if (now < lastElapsed) { previous = null; cursor = used = 0; geometry.setDrawRange(0, 0); }
    lastElapsed = now;
    if (state.offTrack || state.speed < 4 || state.slip < .55 || state.reverse) { previous = null; return; }
    if (previous && Math.hypot(state.x - previous.x, state.z - previous.z) < .55) return;
    const left = contact(state, vehicle, -1), right = contact(state, vehicle, 1);
    if (previous) { segment(previous.left, left, now, state.slip); segment(previous.right, right, now, state.slip); }
    previous = { left, right, x: state.x, z: state.z };
  }, dispose() {
    if (disposed) return; disposed = true; scene.remove(mesh);
    if (!resourcesOwnedByWorld) { geometry.dispose(); material.dispose(); }
  } };
}
