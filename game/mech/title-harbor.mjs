// 主畫面站在港邊碼頭，與戰鬥地圖共用天空、六甲山、港塔和海岸材質。
import * as THREE from 'three';

function harborBackdrop(source) {
  const mesh = source.clone(); mesh.castShadow = false;
  // 遠方街廓只保留鏡頭朝向的港區；頂點和材質仍共用，僅建立較短的索引。
  if (source.name === 'kobe-city-backdrop' || source.name === 'kobe-landmarks') {
    const original = source.geometry, p = original.attributes.position, indices = original.index, keep = [];
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
      const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
      if (x > -1900 && x < 900 && z > -3200 && z < 1200) keep.push(a, b, c);
    }
    mesh.geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(original.attributes)) mesh.geometry.setAttribute(name, attribute);
    mesh.geometry.setIndex(keep); mesh.geometry.boundingSphere = original.boundingSphere;
  }
  return mesh;
}

export function createTitleHarbor(renderer, hero, world, post) {
  const scene = new THREE.Scene();
  scene.fog = world.scene.fog.clone(); scene.environment = world.envMap; scene.environmentIntensity = 1.0;
  const sky = world.skyDome.clone(); sky.onBeforeRender = () => {}; scene.add(sky);
  for (const source of [world.terrainMesh, world.mountainMesh, ...world.kobeBackdrop.meshes,
    ...['kobe-landmarks', 'kobe-bay', 'kobe-seawall'].map(name => world.scene.getObjectByName(name))]) {
    const mesh = harborBackdrop(source);
    if (source.name === 'kobe-bay') mesh.onBeforeRender = source.onBeforeRender;
    scene.add(mesh);
  }
  const quay = new THREE.Vector3(-335, 0, 1090);
  const floor = new THREE.BoxGeometry(72, 3, 82); floor.translate(quay.x, -1.5, quay.z);
  floor.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(floor.attributes.position.count * 3).fill(.66), 3));
  floor.setAttribute('surface', new THREE.Float32BufferAttribute(new Float32Array(floor.attributes.position.count).fill(1), 1));
  const pier = new THREE.Mesh(floor, world.scene.getObjectByName('kobe-seawall').material);
  pier.receiveShadow = true; scene.add(pier);
  const sun = new THREE.DirectionalLight(0xffe2be, 3.4);
  sun.position.copy(quay).addScaledVector(world.lightDir, 150); sun.target.position.copy(quay);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 40, far: 240 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .015; sun.shadow.bias = -.000015; sun.shadow.autoUpdate = false;
  const key = new THREE.DirectionalLight(0xd4e3ef, 3.2);
  key.position.copy(quay).add(new THREE.Vector3(-15, 24, 35)); key.target.position.copy(quay);
  scene.add(sun, sun.target, key, key.target, new THREE.HemisphereLight(0xc8dcec, 0x7a7266, 1.4));
  hero.root.position.copy(quay); hero.legYaw = -.45; scene.add(hero.root);
  const st = { vel: new THREE.Vector3(), grounded: true, boost: 0, torsoYaw: -.45, pitch: 0, thrust: 0, aim: null, lean: 0 };
  const target = quay.clone(); target.y = 9.0;
  let elapsed = 0, frame = 0;
  function render(dt, camera) {
    elapsed += dt; hero.animate(dt, st);
    const b = hero.bones;
    b.shoulderR.rotation.set(-.16, .03, .08); b.elbowR.rotation.x = -.32;
    b.shoulderL.rotation.set(-.35, -.95, -.35); b.elbowL.rotation.x = -.35;
    b.head.rotation.set(-.025, .09, 0); hero.saber.visible = true;
    const orbit = Math.sin(elapsed * .10) * .8;
    camera.position.set(quay.x - 16 + orbit, 10.4, quay.z + 28); camera.lookAt(target);
    sky.position.copy(camera.position);
    sun.shadow.needsUpdate = (++frame % 2) === 0;
    // 沿用現有抗鋸齒與光暈目標，主畫面不重畫 AO 或駕駛艙。
    const playScene = post.world.scene, ao = post.gtao.enabled, cockpit = post.cockpit.enabled;
    post.world.scene = scene; post.gtao.enabled = post.cockpit.enabled = false; post.u.boot.value = 1;
    try { post.render(elapsed); }
    finally { post.world.scene = playScene; post.gtao.enabled = ao; post.cockpit.enabled = cockpit; }
  }
  return { scene, hero, render };
}
