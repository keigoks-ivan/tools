/**
 * 隊友角色的 3D 呈現：沿用本機主角已經轉好卡通材質的模型（SkeletonUtils.clone，幾何與貼圖共用），
 * 每位隊友一組上色材質、一個 AnimationMixer 與頭上名牌。位置由 SnapshotBuffer 插值，永遠比實際晚約 100 ms；
 * 本機主角不經過這裡。
 */
import { SnapshotBuffer } from './interp.js';

/** 三個隊友槽的色調（第一階段不同英雄也共用同一個模型，用顏色區分） */
export const TEAM_TINTS = [0x7fd6ff, 0xffc36b, 0x8dff9e];
const STALE_MS = 10000;   // 10 秒沒收到封包就先藏起來，恢復後再出現

function makeLabel(THREE, text, tint) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const g = canvas.getContext('2d');
  g.font = '600 30px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const width = Math.min(248, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(9,15,27,.72)';
  g.beginPath(); g.roundRect?.(128 - width / 2, 10, width, 44, 10); g.fill();
  g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
  g.fillText(text, 128, 33);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.1, 0.275, 1);
  sprite.renderOrder = 20;
  return { sprite, dispose() { texture.dispose(); material.dispose(); } };
}

/**
 * @param {{ THREE, scene, template: import('three').Object3D, clips: import('three').AnimationClip[], cloneSkinned: Function }} ctx
 */
export function createTeammates({ THREE, scene, template, clips, cloneSkinned }) {
  const baseY = template.position.y;
  const peers = new Map();
  const tintColor = new THREE.Color();

  function add(id, name, slot) {
    if (peers.has(id)) return peers.get(id);
    const tint = TEAM_TINTS[slot % TEAM_TINTS.length];
    const root = new THREE.Group();
    root.name = `teammate:${id}`;
    const model = cloneSkinned(template);
    model.position.y = baseY;
    // 上色：只換卡通材質（描邊等 MeshBasicMaterial 保持共用），貼圖與 gradientMap 仍共用
    const owned = new Map();
    tintColor.setHex(tint);
    model.traverse(object => {
      if (!object.isMesh) return;
      const swap = material => {
        if (!material?.isMeshToonMaterial) return material;
        if (!owned.has(material)) {
          const copy = material.clone();
          copy.color.lerp(tintColor, 0.35);
          copy.emissive?.copy(tintColor).multiplyScalar(0.08);
          owned.set(material, copy);
        }
        return owned.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(swap) : swap(object.material);
      object.frustumCulled = false;
    });
    root.add(model);
    const label = makeLabel(THREE, name, tint);
    label.sprite.position.y = 2.12;
    root.add(label.sprite);
    root.visible = false;
    scene.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
    const peer = { id, name, root, model, mixer, actions, label, owned, buffer: new SnapshotBuffer(), current: null, currentName: '', lastTime: 0 };
    peers.set(id, peer);
    play(peer, 'idle', true, 1, 0);
    return peer;
  }

  function play(peer, name, loop, scale, time) {
    const next = peer.actions.get(name) || peer.actions.get('idle');
    if (!next) return;
    if (peer.current && peer.current !== next) peer.current.fadeOut(0.08);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(scale || 1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.time = Math.max(0, Math.min(time || 0, next.getClip().duration));
    next.fadeIn(peer.current ? 0.08 : 0).play();
    peer.current = next;
    peer.currentName = name;
  }

  function remove(id) {
    const peer = peers.get(id);
    if (!peer) return;
    scene.remove(peer.root);
    peer.mixer.stopAllAction();
    peer.mixer.uncacheRoot(peer.model);
    for (const material of peer.owned.values()) material.dispose();
    peer.label.dispose();
    peers.delete(id);
  }

  function push(id, snap, now) { peers.get(id)?.buffer.push(snap, now); }

  function update(dt, now) {
    for (const peer of peers.values()) {
      const s = peer.buffer.sample(now);
      if (!s || now - peer.buffer.receivedAt > STALE_MS) { peer.root.visible = false; continue; }
      peer.root.visible = true;
      peer.root.position.set(s.x, s.y, s.z);
      peer.root.rotation.y = s.yaw;
      peer.model.position.y = baseY + (s.lift || 0);
      // 動作：換片段，或同一片段從頭再播（連段第二下）時重新開始；封包停住時跑步改成站立，不在原地跑
      const anim = s.frozen && s.anim === 'run' ? 'idle' : s.anim;
      if (anim !== peer.currentName || (!s.loop && s.time + 0.05 < peer.lastTime)) play(peer, anim, s.loop, s.scale, s.time);
      else if (!s.loop && Math.abs(peer.current.time - s.time) > 0.25) peer.current.time = s.time;
      peer.lastTime = s.time;
      peer.mixer.update(dt);
    }
  }

  function dispose() { for (const id of [...peers.keys()]) remove(id); }

  return { add, remove, push, update, dispose, peers };
}
