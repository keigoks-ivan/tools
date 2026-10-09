import * as THREE from 'three';

// A single static street probe gives glass and paint the surrounding buildings
// and trees. Capture only when changing cities; driving adds no probe draws.
export function createCityReflections(renderer, scene, track, { mobile = false } = {}) {
  const target = new THREE.WebGLCubeRenderTarget(mobile ? 128 : 256, { type: THREE.HalfFloatType });
  const probe = new THREE.CubeCamera(.8, 1600, target);
  const p = track.sample(24);
  probe.position.set(p.x, p.y + 4.5, p.z);
  const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.enabled;
  let filtered;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    // Keep the same probe on initial load and subsequent selections; the
    // moving shadow window belongs to the driving view, not this static atlas.
    renderer.shadowMap.enabled = false;
    probe.update(renderer, scene);
    filtered = pmrem.fromCubemap(target.texture);
    scene.traverse(node => {
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!mat?.userData.urbanGlazing) continue;
        mat.envMap = filtered.texture; mat.envMapIntensity = .9; mat.needsUpdate = true;
      }
    });
  } finally {
    renderer.setRenderTarget(previous);
    renderer.shadowMap.enabled = shadows;
    target.dispose(); pmrem.dispose();
  }
  let disposed = false;
  return { texture: filtered.texture, dispose() { if (disposed) return; disposed = true; filtered.dispose(); } };
}
