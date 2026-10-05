import * as THREE from 'three';
import { createAthlete } from '../athlete.js?v=7';
import { motionDefinition } from '../motion-clips.mjs?v=7';

export function createMotionLab(getLanguage) {
  const $ = id => document.getElementById(id), canvas = $('labCanvas');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101c2a);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30), center = new THREE.Vector3(0, 0.8, 1.85);
  scene.add(new THREE.HemisphereLight(0xc5e0ff, 0x22313e, 1.6));
  const light = new THREE.DirectionalLight(0xffe2c6, 3.0); light.position.set(-3, 5, -2); light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = -3; light.shadow.camera.right = 3; light.shadow.camera.top = 3; light.shadow.camera.bottom = -3; light.shadow.bias = -0.0004; scene.add(light);
  const fill = new THREE.DirectionalLight(0x8cb8ff, 1); fill.position.set(3, 2, 4); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x1a2b3b, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(12, 24, 0x365268, 0x263c4c); grid.position.y = 0.003; scene.add(grid);
  const actor = createAthlete(scene, 1, 0xce6733, 'left', 'lin');
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffefba, transparent: true, opacity: 0.75 })); scene.add(marker);
  let profile = 'lin', kind = 'forehand', angle = 'threequarter', playing = true, visible = true, time = 0, previous = performance.now();
  let lead = 0.24, duration = 0.9, definition, event, contactApplied = false;
  const phaseNames = { ready: ['準備', 'Ready'], windup: ['引拍', 'Windup'], contact: ['擊球', 'Contact'], follow: ['收拍', 'Follow-through'], recover: ['還原', 'Recovery'] };
  const notes = {
    forehand: ['先用腳站穩，髖與胸帶動肩；自由手維持平衡。觸球後完成收拍，再把球拍帶回身體前方。', 'Set the feet, then let hips and chest lead the shoulder. The free arm balances the stroke; finish and bring the paddle back in front.'],
    backhand: ['球在身體前方，肘保留活動空間。前臂往前送，收拍緊湊，避免肩膀與手腕各自亂動。', 'Keep the ball in front with space around the elbow. Send the forearm forward and recover compactly, with coordinated shoulder and wrist.'],
    flick: ['先上步讓球在身體前方，抬肘引拍，前臂加速；橫向收拍後立即退回準備位置。', 'Step into position before raising the elbow. Accelerate the forearm, follow through laterally and recover out of the table.'],
    push: ['先靠近球，拍面承接旋轉，以較短的前臂伸展控制高度；與擰拉的收拍方向不同。', 'Move close, read the spin with the paddle face and use a short forearm extension to control height. The follow-through differs from a flick.'],
    serve: ['自由手持球、拋球、引拍、擊球與還原依序發生。此示範保留遊戲中的簡化發球，實戰還需遵守拋球與可見性規則。', 'Holding, tossing, preparation, contact and recovery occur in order. This shows the game’s simplified service; real service also requires legal toss and visibility.'],
  };
  function labels() {
    const index = getLanguage() === 'zh' ? 0 : 1;
    $('labPlay').textContent = playing ? ['暫停', 'Pause'][index] : ['播放', 'Play'][index];
    $('labNote').textContent = notes[kind][index];
    const phase = time < 0.01 ? 'ready' : Math.abs(time - lead) < 0.012 ? 'contact' : time < lead ? 'windup' : time < lead + definition.followTime + 0.035 ? 'follow' : 'recover'; $('labPhase').textContent = phaseNames[phase][index];
    $('labTime').textContent = `${time.toFixed(2)}s`; $('labTimeline').value = Math.round(time / duration * 1000);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    camera.aspect = rect.width / rect.height;
    const distance = camera.aspect < 1 ? 4.5 : 3.5;
    const direction = angle === 'front' ? new THREE.Vector3(0, 0.27, -1) : angle === 'side' ? new THREE.Vector3(1, 0.23, 0) : new THREE.Vector3(0.75, 0.35, -0.80);
    camera.position.copy(center).add(direction.normalize().multiplyScalar(distance)); camera.lookAt(center); camera.updateProjectionMatrix(); renderer.setSize(rect.width, rect.height, false); draw();
  }
  function step(at, dt) {
    const short = kind === 'flick' || kind === 'push';
    const enter = THREE.MathUtils.smoothstep(at, 0, lead * 0.85), leave = THREE.MathUtils.smoothstep(at, lead + 0.12, duration - 0.07);
    const depth = short ? 1.94 - 0.29 * enter * (1 - leave) : 1.94;
    if (!contactApplied && at >= lead) { actor.contact(lead, event); contactApplied = true; }
    actor.update(at, dt, 0, null, true, null, { rootZ: depth });
  }
  function configure() {
    profile = $('labPlayer').value; kind = $('labStroke').value; actor.setProfile(profile); actor.reset(); actor.root.position.set(0, 0, 1.94);
    const back = ['backhand', 'flick'].includes(kind), short = ['flick', 'push'].includes(kind), serve = kind === 'serve';
    const shotType = serve ? 'serve' : kind === 'forehand' ? 'loop' : kind === 'backhand' ? 'counter' : kind;
    lead = serve ? 0.48 : 0.24; definition = motionDefinition(profile, back ? 'backhand' : 'forehand', shotType, serve); duration = lead + definition.duration + 0.12;
    const handDirection = profile === 'lin' ? -1 : 1;
    event = { profileId: profile, shotType, handedness: back ? 'backhand' : 'forehand', spin: kind === 'push' ? -1 : kind === 'backhand' ? 0.65 : 1, serve, contactDelay: lead,
      x: handDirection * (back ? -0.12 : 0.27), y: short ? 0.96 : serve ? 1.15 : 1.08, z: short ? 1.10 : serve ? 1.28 : 1.54 };
    for (let i = 0; i < 24; i++) actor.update(-0.4 + i / 60, 1 / 60, 0, null, true, null, { rootZ: 1.94 });
    actor.beginSwing(0, event); marker.position.set(event.x, event.y, event.z); contactApplied = false; time = 0; step(0, 0); draw();
  }
  function seek(value) {
    const target = THREE.MathUtils.clamp(value, 0, duration); configure();
    for (let at = 1 / 120; at < target; at += 1 / 120) step(at, 1 / 120);
    step(target, 1 / 120); time = target; draw();
  }
  function draw() { renderer.render(scene, camera); labels(); }
  $('labPlayer').addEventListener('change', configure); $('labStroke').addEventListener('change', configure);
  $('labPlay').addEventListener('click', () => { playing = !playing; labels(); });
  $('labTimeline').addEventListener('input', () => { playing = false; seek(Number($('labTimeline').value) / 1000 * duration); });
  document.querySelectorAll('[data-phase]').forEach(button => button.addEventListener('click', () => {
    playing = false; const times = { ready: 0, windup: lead * 0.52, contact: lead, follow: lead + definition.followTime, recover: duration - 0.03 }; seek(times[button.dataset.phase]);
  }));
  document.querySelectorAll('[data-angle]').forEach(button => button.addEventListener('click', () => {
    angle = button.dataset.angle; document.querySelectorAll('[data-angle]').forEach(node => node.setAttribute('aria-pressed', String(node === button))); resize();
  }));
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(canvas);
  configure(); resize();
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min((now - previous) / 1000, 0.1); previous = now;
    if (!playing || !visible || document.hidden) return;
    const elapsed = dt * Number($('labSpeed').value); time += elapsed;
    if (time >= duration) configure(); else { step(time, elapsed); draw(); }
  }
  requestAnimationFrame(frame);
  return { setLanguage: labels };
}
