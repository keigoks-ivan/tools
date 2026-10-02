/**
 * 隊友角色的 3D 呈現：沿用本機主角已經轉好卡通材質的模型（SkeletonUtils.clone，幾何與貼圖共用），
 * 每位隊友一組上色材質、一個 AnimationMixer、頭上名牌，以及個人色的刀光與殘影（peer-fx.js）。位置由 SnapshotBuffer 插值，永遠比實際晚約 100 ms；
 * 本機主角不經過這裡。
 */
import { SnapshotBuffer } from './interp.js';
import { SLOT_COLORS, playerColor } from './colors.js';
import { GHOST_ANIMS, TRAIL_ANIM, makeGhosts, makePeerTrail } from './peer-fx.js?v=20261002d';
import { heroFor } from '../heroes.js?v=20261002j';
import { createHeroSpecialFx } from '../hero-special-fx.js?v=20261002j';
import { createArrowFx } from '../hero-bow.js?v=20261002j';

/** 依座位輪用的色調（名單外的名字才用到；Matt／Myles／Mike 固定配色見 colors.js） */
export const TEAM_TINTS = SLOT_COLORS;
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
 * @param {{ THREE, scene, template: import('three').Object3D, clips: import('three').AnimationClip[], cloneSkinned: Function, quality?: 'mobile'|'desktop' }} ctx
 */
export function createTeammates({ THREE, scene, template, clips, cloneSkinned, quality = 'desktop', createEquipment = null, groundAt = () => 0 }) {
  // Capture the unmodified body before local equipment changes its geometry,
  // head scale or materials. Each peer then owns an independent character kit.
  if (createEquipment) template = cloneSkinned(template);
  const templateMaterials = new Map();
  if (createEquipment) template.traverse(mesh => { if (!mesh.isMesh) return; const copy = m => { if (!templateMaterials.has(m)) { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; templateMaterials.set(m, c); } return templateMaterials.get(m); }; mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material); });
  const baseY = template.position.y;
  const peers = new Map();
  const tintColor = new THREE.Color();

  function add(id, name, slot) {
    if (peers.has(id)) return peers.get(id);
    const tint = playerColor(name, slot);
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
        if (!material) return material;
        if (!createEquipment && !material.isMeshToonMaterial) return material;
        if (!owned.has(material)) {
          const copy = material.clone();
          copy.onBeforeCompile = material.onBeforeCompile; copy.customProgramCacheKey = material.customProgramCacheKey;
          if (!createEquipment && copy.isMeshToonMaterial) { copy.color.lerp(tintColor, 0.35); copy.emissive?.copy(tintColor).multiplyScalar(0.08); }
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
    const sword = model.getObjectByName('Hero_sword') || model.getObjectByName('rumi_sword');
    const equipment = createEquipment?.(model);
    const trail = makePeerTrail({ THREE, scene, sword, color: tint, segments: quality === 'mobile' ? 9 : 12 });
    const ghosts = !equipment && quality !== 'mobile' ? makeGhosts({ THREE, scene, template, cloneSkinned, color: tint }) : null;
    const specialFx = equipment ? createHeroSpecialFx(THREE, scene, groundAt, { capacity: 48 }) : null;
    const bones = [];
    model.traverse(object => { if (object.isBone) bones.push(object); });
    const peer = { id, name, tint, root, model, mixer, actions, label, owned, trail, ghosts, specialFx, equipment, arrowFx:null, arrowClip:'', arrowTime:-1, arrowIndex:0, ready: !equipment, character: null, musouAt: -1, swing: 0, finished: false, previous: new THREE.Vector3(), bones, buffer: new SnapshotBuffer(), current: null, currentName: '', lastTime: 0 };
    equipment?.ready?.then(() => { peer.ready = true; }).catch(error => console.error('teammate art failed', error));
    peers.set(id, peer);
    play(peer, 'idle', true, 1, 0);
    return peer;
  }

  function play(peer, name, loop, scale, time) {
    const next = peer.actions.get(name) || peer.actions.get('idle');
    if (!next) return;
    const blend = name.startsWith('azure') ? 0.14 : 0.08;
    if (peer.current && peer.current !== next) peer.current.fadeOut(blend);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(scale || 1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.time = Math.max(0, Math.min(time || 0, next.getClip().duration));
    if (peer.current !== next || !name.startsWith('azure')) next.fadeIn(peer.current ? blend : 0);
    next.play();
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
    peer.trail.dispose();
    peer.ghosts?.dispose();
    peer.specialFx?.dispose(); peer.arrowFx?.dispose(); peer.equipment?.dispose();
    peers.delete(id);
  }

  function push(id, snap, now) { peers.get(id)?.buffer.push(snap, now); }

  function update(dt, now) {
    for (const peer of peers.values()) {
      const s = peer.buffer.sample(now);
      peer.specialFx?.update(dt);
      if (!s || !peer.ready || now - peer.buffer.receivedAt > STALE_MS) { peer.root.visible = false; peer.trail.clear(); peer.arrowFx?.reset(); peer.ghosts?.clear(); continue; }
      const profile = heroFor(s.character);
      if (peer.equipment && peer.character !== profile.id) {
        peer.equipment.apply(profile); peer.character = profile.id; peer.specialFx.setStyle(profile.id);
        peer.arrowFx?.reset(); peer.arrowClip=''; peer.arrowTime=-1; peer.arrowIndex=0;
        if(profile.id==='jade' && !peer.arrowFx)peer.arrowFx=createArrowFx(THREE,scene,groundAt,{capacity:quality==='mobile'?32:48});
        peer.ghosts?.dispose(); peer.ghosts = quality === 'mobile' ? null : makeGhosts({ THREE, scene, template: peer.model, cloneSkinned, color: profile.tint, count: 2 });
      }
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
      peer.equipment?.update();
      if(profile.id==='jade' && peer.arrowFx) {
        if(peer.arrowClip!==anim || s.time<peer.arrowTime-.05) {peer.arrowClip=anim;peer.arrowIndex=0;}
        const shot=[...profile.chain,...profile.charges,profile.heavy,profile.counter,profile.air].find(move=>move?.clip===anim);
        while(shot && peer.arrowIndex<shot.hits.length && s.time>=shot.hits[peer.arrowIndex]) {
          const at=shot.hits[peer.arrowIndex++];if(s.time-at>.20)continue;
          const p=shot.projectile,count=p.arrows || 1;
          for(let i=0;i<count;i++) {
            const facing=Math.PI/2-s.yaw+(i-(count-1)/2)*(p.spread || 0);
            const event={type:'arrow',x:640+s.x*60+Math.cos(facing)*20,y:500+s.z*60+Math.sin(facing)*20,facing,height:s.lift || 0,speed:p.speed,range:shot.radius-20,pierce:p.pierce || 1,fxTier:(shot.fxTier||1)+(shot.clip==='jadeBurst'&&peer.arrowIndex===shot.hits.length?1:0)};
            peer.arrowFx.onEvent(event);peer.specialFx.onEvent(event,peer.root.position);
          }
        }
        peer.arrowTime=s.time;
      }
      peer.arrowFx?.update(dt);
      const slashing = TRAIL_ANIM.test(anim);
      if (slashing) peer.root.updateMatrixWorld(true);
      peer.trail.update(slashing);
      peer.ghosts?.update(dt, GHOST_ANIMS.has(anim) || s.musou >= 0, peer);
      if (peer.specialFx) {
        const at = s.musou ?? -1, p = profile.flurry.standard;
        const pos = new THREE.Vector3(s.x, groundAt(s.x, s.z), s.z);
        if (at >= 0 && (peer.musouAt < 0 || at < peer.musouAt - 0.1)) {
          peer.swing = 0; peer.finished = false;
          peer.specialFx.onEvent({ type: 'musouStart', finishRadius: p.finishRadius, facing:Math.PI/2-s.yaw }, pos);
        }
        const swingAt = index => p.swingStart + (p.swingEnd - p.swingStart) * index / Math.max(1, p.swings - 1);
        while (at >= 0 && peer.swing < p.swings && at >= swingAt(peer.swing)) {
          const index = peer.swing++;
          peer.specialFx.onEvent({ type: 'swing', flurry: true, index, facing: Math.PI / 2 - s.yaw, radius: p.swingRadii?.[index] || p.radius, from: { x: 640 + peer.previous.x * 60, y: 500 + peer.previous.z * 60 } }, pos);
        }
        if (!peer.finished && (at >= p.impact || at < 0 && peer.musouAt >= 0)) { peer.finished = true; peer.specialFx.onEvent({ type: 'musouFinish', radius: p.finishRadius, facing:Math.PI/2-s.yaw }, pos); }
        peer.musouAt = at; peer.previous.copy(pos);
      }
    }
  }

  function dispose() { for (const id of [...peers.keys()]) remove(id); for (const m of templateMaterials.values()) m.dispose(); }

  return { add, remove, push, update, dispose, peers };
}
