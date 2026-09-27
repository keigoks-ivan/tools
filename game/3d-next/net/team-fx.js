/**
 * 第三階段的隊伍畫面效果（只有三人頁會載入）。刻意做得很省，老手機也跑得動：
 * - 倒地標記：倒地者腳下一圈紅色脈動環（隊友與自己都看得到）
 * - 救援進度環：倒地者腳下的金色弧，跟著房主算的進度長（倒地者與救援者都看得到）
 * - 隊友放無雙：隊友腳下一圈擴散環（精簡版，不跑 combat-fx 的粒子，也不動 combat-fx.js）
 * - 合體大招：每位參與者腳下一圈大金環＋一道光柱
 * 全部是預先建立、重複使用的少量網格（最多 3 個標記、3 個進度弧、4 個脈衝），不在每一格配置記憶體；
 * 進度弧的幾何只在進度跨過 5% 時重建。
 */
const MARKER_COLOR = 0xff4a5a;
const PROGRESS_COLOR = 0xffd166;
const PEER_MUSOU_COLOR = 0x9ad8ff;
const COMBO_COLOR = 0xffc53d;
const MAX_MARKERS = 3;
const MAX_PULSES = 4;

/**
 * @param {{ THREE, scene, quality?: 'mobile'|'desktop' }} ctx
 */
export function createTeamFx({ THREE, scene, quality = 'desktop' }) {
  const group = new THREE.Group();
  group.name = 'coop:team-fx';
  scene.add(group);
  const additive = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flat = mesh => { mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 5; mesh.visible = false; group.add(mesh); return mesh; };

  const markerGeometry = new THREE.RingGeometry(0.55, 0.68, 32);
  const pulseGeometry = new THREE.RingGeometry(0.9, 1, 40);
  const beamGeometry = new THREE.CylinderGeometry(0.35, 0.5, 6, 12, 1, true);
  const owned = [markerGeometry, pulseGeometry, beamGeometry];

  const markers = Array.from({ length: MAX_MARKERS }, () => ({
    ring: flat(new THREE.Mesh(markerGeometry, additive(MARKER_COLOR))),
    arc: flat(new THREE.Mesh(new THREE.BufferGeometry(), additive(PROGRESS_COLOR))),
    bucket: -1,
  }));
  const pulses = Array.from({ length: MAX_PULSES }, () => {
    const ring = flat(new THREE.Mesh(pulseGeometry, additive(PEER_MUSOU_COLOR)));
    const beam = new THREE.Mesh(beamGeometry, additive(COMBO_COLOR));
    beam.visible = false;
    group.add(beam);
    return { ring, beam, age: Infinity, life: 1, size: 1, id: null };
  });
  let clock = 0;

  function setArc(marker, pct) {
    const bucket = Math.max(0, Math.min(20, Math.floor(pct / 5)));
    if (bucket === marker.bucket) return;
    marker.bucket = bucket;
    marker.arc.geometry.dispose();
    marker.arc.geometry = bucket > 0 ? new THREE.RingGeometry(0.72, 0.9, Math.max(4, bucket * 2), 1, Math.PI / 2, -Math.PI * 2 * bucket / 20) : new THREE.BufferGeometry();
  }

  function pulse(id, kind) {
    const slot = pulses.reduce((a, b) => (b.age > a.age ? b : a));
    slot.id = id; slot.age = 0;
    slot.kind = kind;
    const combo = kind === 'combo';
    slot.life = combo ? 0.9 : 0.6;
    slot.size = combo ? 5.3 : 3.7;   // 合體：加成後的終結範圍約 5.3 公尺；隊友無雙：亂舞範圍 3.7 公尺
    slot.ring.material.color.setHex(combo ? COMBO_COLOR : PEER_MUSOU_COLOR);
    slot.beam.visible = false;
  }

  return {
    /** enemy-sync 的 onFx 事件 */
    onFx(event) {
      if (event.type === 'peerMusou') pulse(event.id, 'peer');
      else if (event.type === 'combo') for (const id of event.ids || []) pulse(id, 'combo');
      else if (event.type === 'revived') pulse(event.id, 'peer');
    },
    /**
     * 每一格：positionOf(id) → {x,y,z}|null（世界座標，y＝腳底）；downed＝倒地者 id 陣列；progress＝Map(id → {pct})
     */
    update(dt, { positionOf, downed = [], progress = new Map() }) {
      clock += dt;
      let used = 0;
      for (const id of downed) {
        const at = positionOf(id);
        if (!at || used >= MAX_MARKERS) continue;
        const marker = markers[used++];
        const beat = 0.75 + 0.25 * Math.sin(clock * 6);
        marker.ring.visible = true;
        marker.ring.position.set(at.x, at.y + 0.04, at.z);
        marker.ring.scale.setScalar(beat + 0.25);
        marker.ring.material.opacity = 0.45 + 0.4 * beat;
        const pct = progress.get(id)?.pct || 0;
        setArc(marker, pct);
        marker.arc.visible = pct > 0;
        marker.arc.position.set(at.x, at.y + 0.05, at.z);
      }
      for (let i = used; i < MAX_MARKERS; i++) { markers[i].ring.visible = false; markers[i].arc.visible = false; }
      for (const slot of pulses) {
        if (slot.age >= slot.life) { slot.ring.visible = false; slot.beam.visible = false; continue; }
        slot.age += dt;
        const at = slot.id ? positionOf(slot.id) : null;
        const k = Math.min(1, slot.age / slot.life);
        if (!at || k >= 1) { slot.ring.visible = false; slot.beam.visible = false; continue; }
        slot.ring.visible = true;
        slot.ring.position.set(at.x, at.y + 0.06, at.z);
        slot.ring.scale.setScalar(0.3 + slot.size * Math.sqrt(k));
        slot.ring.material.opacity = 0.85 * (1 - k);
        // 光柱只在合體大招出現；手機版省略
        const beam = slot.kind === 'combo' && quality !== 'mobile';
        slot.beam.visible = beam;
        if (beam) {
          slot.beam.position.set(at.x, at.y + 3, at.z);
          slot.beam.scale.set(1 + k, 1, 1 + k);
          slot.beam.material.opacity = 0.6 * (1 - k);
        }
      }
    },
    dispose() {
      scene.remove(group);
      for (const geometry of owned) geometry.dispose();
      for (const marker of markers) { marker.arc.geometry.dispose(); marker.ring.material.dispose(); marker.arc.material.dispose(); }
      for (const slot of pulses) { slot.ring.material.dispose(); slot.beam.material.dispose(); }
    },
  };
}
