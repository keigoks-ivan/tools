/**
 * 隊伍畫面效果（只有三人頁會載入）。刻意做得很省，老手機也跑得動：
 * - 身分光圈：每位玩家（含自己）腳下一圈淡淡的代表色光圈，混戰時一眼認得誰是誰
 * - 倒地：腳下紅色脈動環＋繞圈的紅色弧＋一道往上淡出的紅色信號柱（遠遠就找得到人）
 * - 救援進度環：倒地者腳下的金色弧，跟著房主算的進度長（倒地者與救援者都看得到）
 * - 救起：被救起的人冒出一道代表色光柱＋兩圈擴散環＋往上飄的光點（手機版少一點光點）
 * - 隊友放無雙：隊友腳下一圈代表色擴散環（精簡版，不跑 combat-fx 的粒子，也不動 combat-fx.js）
 * - 合體大招：每位參與者腳下一圈大金環＋一道光柱
 * 全部是預先建立、重複使用的少量網格，不在每一格配置記憶體；進度弧的幾何只在進度跨過 5% 時重建。
 */
const MARKER_COLOR = 0xff4a5a;
const PROGRESS_COLOR = 0xffd166;
const PEER_MUSOU_COLOR = 0x9ad8ff;
const COMBO_COLOR = 0xffc53d;
const MAX_PLAYERS = 3;
const MAX_PULSES = 4;
const REVIVE_LIFE = 1.4;
const BEACON_HEIGHT = 5;
const PILLAR_HEIGHT = 9;

/** 開口圓柱，頂點色由下往上從亮到全黑（疊加混色下黑＝透明），做成往上淡出的光柱 */
function fadingColumn(THREE, radiusTop, radiusBottom, height, radial) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial, 4, true);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / height + 0.5;   // 0＝底、1＝頂
    const v = Math.pow(1 - t, 1.6);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * @param {{ THREE, scene, quality?: 'mobile'|'desktop', colorOf?: (id: string) => number }} ctx
 */
export function createTeamFx({ THREE, scene, quality = 'desktop', colorOf = () => PEER_MUSOU_COLOR }) {
  const mobile = quality === 'mobile';
  const group = new THREE.Group();
  group.name = 'coop:team-fx';
  scene.add(group);
  const additive = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, ...extra });
  const flat = mesh => { mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 5; mesh.visible = false; group.add(mesh); return mesh; };
  const upright = mesh => { mesh.renderOrder = 5; mesh.visible = false; group.add(mesh); return mesh; };

  const identityGeometry = new THREE.RingGeometry(0.46, 0.6, 40);
  const markerGeometry = new THREE.RingGeometry(0.55, 0.68, 32);
  const spinnerGeometry = new THREE.RingGeometry(0.98, 1.08, 32, 1, 0, Math.PI * 1.4);
  const pulseGeometry = new THREE.RingGeometry(0.9, 1, 40);
  const beamGeometry = new THREE.CylinderGeometry(0.35, 0.5, 6, 12, 1, true);
  const beaconGeometry = fadingColumn(THREE, 0.16, 0.26, BEACON_HEIGHT, 10);
  const pillarGeometry = fadingColumn(THREE, 0.55, 0.85, PILLAR_HEIGHT, mobile ? 12 : 20);
  const owned = [identityGeometry, markerGeometry, spinnerGeometry, pulseGeometry, beamGeometry, beaconGeometry, pillarGeometry];

  const identities = Array.from({ length: MAX_PLAYERS }, () => flat(new THREE.Mesh(identityGeometry, additive(0xffffff, { opacity: 0.5 }))));
  const markers = Array.from({ length: MAX_PLAYERS }, () => ({
    ring: flat(new THREE.Mesh(markerGeometry, additive(MARKER_COLOR))),
    spinner: flat(new THREE.Mesh(spinnerGeometry, additive(MARKER_COLOR))),
    beacon: upright(new THREE.Mesh(beaconGeometry, additive(MARKER_COLOR, { vertexColors: true }))),
    arc: flat(new THREE.Mesh(new THREE.BufferGeometry(), additive(PROGRESS_COLOR))),
    bucket: -1,
  }));
  const pulses = Array.from({ length: MAX_PULSES }, () => {
    const ring = flat(new THREE.Mesh(pulseGeometry, additive(PEER_MUSOU_COLOR)));
    const beam = upright(new THREE.Mesh(beamGeometry, additive(COMBO_COLOR)));
    return { ring, beam, age: Infinity, life: 1, size: 1, id: null };
  });

  // 救起：光柱＋內外兩圈＋往上飄的光點
  const SPARKS = mobile ? 12 : 28;
  const revives = Array.from({ length: MAX_PLAYERS }, () => {
    const pillar = upright(new THREE.Mesh(pillarGeometry, additive(0xffffff, { vertexColors: true })));
    const inner = flat(new THREE.Mesh(pulseGeometry, additive(0xffffff)));
    const outer = flat(new THREE.Mesh(pulseGeometry, additive(0xffffff)));
    const positions = new Float32Array(SPARKS * 3);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const sparkMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: mobile ? 0.22 : 0.16, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
    sparks.frustumCulled = false;
    upright(sparks);
    const seeds = Array.from({ length: SPARKS }, (_, i) => ({ angle: (i / SPARKS) * Math.PI * 2 + i * 0.37, radius: 0.25 + ((i * 7) % 10) / 14, speed: 2.2 + ((i * 13) % 10) / 3.5, delay: ((i * 5) % 10) / 30 }));
    return { pillar, inner, outer, sparks, sparkGeometry, positions, seeds, age: Infinity, id: null };
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
    slot.ring.material.color.setHex(combo ? COMBO_COLOR : colorOf(id));
    slot.beam.visible = false;
  }

  function revive(id) {
    const slot = revives.reduce((a, b) => (b.age > a.age ? b : a));
    slot.id = id; slot.age = 0;
    const color = colorOf(id);
    for (const mesh of [slot.pillar, slot.inner, slot.outer, slot.sparks]) mesh.material.color.setHex(color);
  }

  function hideRevive(slot) { slot.pillar.visible = slot.inner.visible = slot.outer.visible = slot.sparks.visible = false; }

  return {
    /** enemy-sync 的 onFx 事件 */
    onFx(event) {
      if (event.type === 'peerMusou') pulse(event.id, 'peer');
      else if (event.type === 'combo') for (const id of event.ids || []) pulse(id, 'combo');
      else if (event.type === 'revived') revive(event.id);
    },
    /**
     * 每一格：positionOf(id) → {x,y,z}|null（世界座標，y＝腳底）；players＝在場玩家 id（含自己）；
     * downed＝倒地者 id 陣列；progress＝Map(id → {pct})
     */
    update(dt, { positionOf, players = [], downed = [], progress = new Map() }) {
      clock += dt;
      const down = new Set(downed);
      let shown = 0;
      for (const id of players) {
        if (shown >= MAX_PLAYERS || down.has(id)) continue;
        const at = positionOf(id);
        if (!at) continue;
        const ring = identities[shown++];
        ring.visible = true;
        ring.position.set(at.x, at.y + 0.03, at.z);
        ring.material.color.setHex(colorOf(id));
        ring.material.opacity = 0.42 + 0.08 * Math.sin(clock * 2.4 + shown);
      }
      for (let i = shown; i < MAX_PLAYERS; i++) identities[i].visible = false;

      let used = 0;
      for (const id of downed) {
        const at = positionOf(id);
        if (!at || used >= MAX_PLAYERS) continue;
        const marker = markers[used++];
        const beat = 0.75 + 0.25 * Math.sin(clock * 6);
        marker.ring.visible = true;
        marker.ring.position.set(at.x, at.y + 0.04, at.z);
        marker.ring.scale.setScalar(beat + 0.25);
        marker.ring.material.opacity = 0.45 + 0.4 * beat;
        marker.spinner.visible = true;
        marker.spinner.position.set(at.x, at.y + 0.045, at.z);
        marker.spinner.rotation.z = clock * 2.2;
        marker.spinner.material.opacity = 0.35 + 0.25 * beat;
        marker.beacon.visible = true;
        marker.beacon.position.set(at.x, at.y + BEACON_HEIGHT / 2, at.z);
        marker.beacon.material.opacity = 0.35 + 0.35 * beat;
        const pct = progress.get(id)?.pct || 0;
        setArc(marker, pct);
        marker.arc.visible = pct > 0;
        marker.arc.position.set(at.x, at.y + 0.05, at.z);
      }
      for (let i = used; i < MAX_PLAYERS; i++) { const m = markers[i]; m.ring.visible = m.spinner.visible = m.beacon.visible = m.arc.visible = false; }

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
        const beam = slot.kind === 'combo' && !mobile;
        slot.beam.visible = beam;
        if (beam) {
          slot.beam.position.set(at.x, at.y + 3, at.z);
          slot.beam.scale.set(1 + k, 1, 1 + k);
          slot.beam.material.opacity = 0.6 * (1 - k);
        }
      }

      for (const slot of revives) {
        if (slot.age >= REVIVE_LIFE) { hideRevive(slot); continue; }
        slot.age += dt;
        const at = slot.id ? positionOf(slot.id) : null;
        const k = slot.age / REVIVE_LIFE;
        if (!at || k >= 1) { hideRevive(slot); continue; }
        // 光柱：0.18 秒內從地面衝上來，接著變粗、慢慢淡掉
        const rise = Math.min(1, slot.age / 0.18);
        const fade = 1 - Math.max(0, (k - 0.25) / 0.75);
        slot.pillar.visible = true;
        slot.pillar.scale.set(0.6 + 0.7 * k, rise, 0.6 + 0.7 * k);
        slot.pillar.position.set(at.x, at.y + PILLAR_HEIGHT * rise / 2, at.z);
        slot.pillar.material.opacity = 0.95 * fade * fade;
        slot.inner.visible = true;
        slot.inner.position.set(at.x, at.y + 0.07, at.z);
        slot.inner.scale.setScalar(0.4 + 2.2 * Math.sqrt(k));
        slot.inner.material.opacity = 0.9 * (1 - k);
        const k2 = Math.min(1, k * 1.6);
        slot.outer.visible = k2 < 1;
        slot.outer.position.set(at.x, at.y + 0.08, at.z);
        slot.outer.scale.setScalar(0.6 + 5 * Math.sqrt(k2));
        slot.outer.material.opacity = 0.7 * (1 - k2);
        slot.sparks.visible = true;
        for (let i = 0; i < slot.seeds.length; i++) {
          const s = slot.seeds[i];
          const t = Math.max(0, slot.age - s.delay);
          const angle = s.angle + t * 1.8;
          const radius = s.radius * (1 + t * 0.6);
          slot.positions[i * 3] = at.x + Math.cos(angle) * radius;
          slot.positions[i * 3 + 1] = at.y + 0.2 + t * s.speed;
          slot.positions[i * 3 + 2] = at.z + Math.sin(angle) * radius;
        }
        slot.sparkGeometry.attributes.position.needsUpdate = true;
        slot.sparks.material.opacity = fade;
      }
    },
    dispose() {
      scene.remove(group);
      for (const geometry of owned) geometry.dispose();
      for (const ring of identities) ring.material.dispose();
      for (const marker of markers) { marker.arc.geometry.dispose(); for (const mesh of [marker.ring, marker.spinner, marker.beacon, marker.arc]) mesh.material.dispose(); }
      for (const slot of pulses) { slot.ring.material.dispose(); slot.beam.material.dispose(); }
      for (const slot of revives) { slot.sparkGeometry.dispose(); for (const mesh of [slot.pillar, slot.inner, slot.outer, slot.sparks]) mesh.material.dispose(); }
    },
  };
}
