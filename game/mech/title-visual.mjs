// 標題保留機體右側展示空間；進入遊戲立即還原投影，不影響瞄準。
export function frameTitle(camera, visible) {
  const width = innerWidth, height = innerHeight;
  const offset = visible && width >= 920 ? -Math.round(width * .21) : 0;
  const previous = camera.userData.titleFrame;
  if (visible && !previous) camera.userData.playFov = camera.fov;
  const fov = visible ? (width >= 920 ? 50 : 60) : camera.userData.playFov;
  if (visible) {
    if (previous?.width !== width || previous?.height !== height || previous?.offset !== offset || camera.fov !== fov) {
      camera.fov = fov; camera.setViewOffset(width, height, offset, 0, width, height);
      camera.userData.titleFrame = { width, height, offset };
    }
  } else if (previous) {
    camera.fov = fov; camera.clearViewOffset(); delete camera.userData.titleFrame;
  }
}

// 機庫內的維修工作燈只在標題顯示，戰鬥時不增加燈光運算。
export async function createHangarTitleLighting(scene, point) {
  const THREE = await import('three');
  const group = new THREE.Group(), target = new THREE.Object3D();
  target.position.copy(point).add(new THREE.Vector3(0, 10, 0)); scene.add(target);
  const key = new THREE.SpotLight(0xffdfb4, 1200, 42, .64, .72, 2);
  key.position.copy(point).add(new THREE.Vector3(12, 19, -9)); key.target = target;
  const rim = new THREE.SpotLight(0xa9d8ee, 900, 36, .68, .8, 2);
  rim.position.copy(point).add(new THREE.Vector3(-9, 17, 1)); rim.target = target;
  group.add(key, rim); scene.add(group); group.visible = false;
  return { set(visible) { group.visible = visible; } };
}
