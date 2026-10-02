/**
 * 隊友的個人色特效（只有三人頁會載入）：
 * - 刀光：沿著隊友模型的劍（兩個蒙皮頂點）每一格取樣，拉出一條該玩家代表色的光帶；攻擊動作時才畫
 * - 殘影：閃避、重擊、無雙時每隔一小段時間把當下姿勢凍成一個半透明的代表色分身，很快淡掉
 * 殘影會多畫幾個蒙皮模型，手機版不做；刀光只是一條 12 段的帶子，手機也跑。分身第一次用到才建立。
 */

/** 會畫刀光的動作片段 */
export const TRAIL_ANIM = /^(slash|heavy|air|plunge|musou|special|combo|azure(?:Sweep|Rise|Slam|Guard|Ult)|amber(?:Cut|Stab|Flip|Heavy|Counter|Ult))/;
/** 會留殘影的動作片段 */
export const GHOST_ANIMS = new Set(['roll', 'heavy', 'heavyfin', 'airSlash', 'plunge', 'musou', 'musouLeap', 'musouFlurry', 'musouFinish']);
const GHOST_EVERY = 0.06;   // 秒
const GHOST_LIFE = 0.34;
const GHOST_ALPHA = 0.42;

/** @returns {{ update(active: boolean): void, clear(): void, dispose(): void }} */
export function makePeerTrail({ THREE, scene, sword, color, segments = 12 }) {
  const none = { update() {}, clear() {}, dispose() {} };
  const attribute = sword?.isSkinnedMesh ? sword.geometry?.attributes?.position : null;
  if (!attribute || attribute.count < 2) return none;
  // 劍的最長軸兩端＝劍根與劍尖
  const box = new THREE.Box3().setFromBufferAttribute(attribute);
  const span = box.getSize(new THREE.Vector3());
  const axis = span.x > span.y && span.x > span.z ? 0 : span.y > span.z ? 1 : 2;
  let near = 0, far = 0;
  for (let i = 1; i < attribute.count; i++) {
    const v = attribute.getComponent(i, axis);
    if (v < attribute.getComponent(near, axis)) near = i;
    if (v > attribute.getComponent(far, axis)) far = i;
  }
  const positions = new Float32Array(segments * 2 * 3);
  const colors = new Float32Array(positions.length);
  const indices = [];
  for (let i = 0; i < segments - 1; i++) { const a = i * 2, b = a + 2; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 6;
  scene.add(mesh);
  const tint = new THREE.Color(color);
  const samples = [];   // 每筆 [根 xyz, 尖 xyz]，舊的在前
  const a = new THREE.Vector3(), b = new THREE.Vector3(), root = new THREE.Vector3(), last = new THREE.Vector3();

  return {
    update(active) {
      if (active) {
        sword.skeleton?.update();
        sword.getVertexPosition(near, a);
        sword.getVertexPosition(far, b);
        sword.localToWorld(a);
        sword.localToWorld(b);
        root.copy(a).lerp(b, 0.62);
        // 瞬移（插值跳格、重生）時不要拉出一條橫跨畫面的帶子
        if (samples.length && last.fromArray(samples.at(-1), 3).distanceTo(b) > 1.3) samples.length = 0;
        samples.push([root.x, root.y, root.z, b.x, b.y, b.z]);
      } else if (samples.length) samples.shift();
      while (samples.length > segments) samples.shift();
      mesh.visible = samples.length >= 2;
      if (!mesh.visible) return;
      const newest = samples.at(-1);
      for (let i = 0; i < segments; i++) {
        const sample = samples[i] || newest;
        positions.set(sample, i * 6);
        const k = i < samples.length ? (i + 1) / samples.length : 0;
        const glow = k * k;
        const white = Math.max(0, k - 0.75) * 2.4;   // 最新的一小段偏白，像刀刃反光
        const r = (tint.r + (1 - tint.r) * white) * glow, g = (tint.g + (1 - tint.g) * white) * glow, bl = (tint.b + (1 - tint.b) * white) * glow;
        colors.set([r * 0.35, g * 0.35, bl * 0.35, r, g, bl], i * 6);   // 劍根端暗、劍尖端亮
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
    clear() { samples.length = 0; mesh.visible = false; },
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); },
  };
}

/** @returns {{ update(dt: number, active: boolean, source: { root, model, bones }): void, clear(): void, dispose(): void }} */
export function makeGhosts({ THREE, scene, template, cloneSkinned, color, count = 3 }) {
  let pool = null, timer = 0;

  function build() {
    pool = Array.from({ length: count }, () => {
      const model = cloneSkinned(template);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      model.traverse(object => {
        if (!object.isMesh) return;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        if (list.some(m => m?.side === THREE.BackSide)) { object.visible = false; return; }   // 描邊外殼不畫
        object.material = material;
        object.frustumCulled = false;
        object.renderOrder = 4;
      });
      const bones = [];
      model.traverse(object => { if (object.isBone) bones.push(object); });
      const root = new THREE.Group();
      root.name = 'teammate:ghost';
      root.add(model);
      root.visible = false;
      scene.add(root);
      return { root, model, material, bones, age: Infinity };
    });
  }

  function spawn(source) {
    if (!pool) build();
    const ghost = pool.reduce((x, y) => (y.age > x.age ? y : x));
    ghost.root.position.copy(source.root.position);
    ghost.root.quaternion.copy(source.root.quaternion);
    ghost.model.position.copy(source.model.position);
    const n = Math.min(ghost.bones.length, source.bones.length);
    for (let i = 0; i < n; i++) {
      const from = source.bones[i], to = ghost.bones[i];
      to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale);
    }
    ghost.age = 0;
    ghost.root.visible = true;
  }

  return {
    update(dt, active, source) {
      if (active) {
        timer -= dt;
        if (timer <= 0) { spawn(source); timer = GHOST_EVERY; }
      } else timer = 0;
      if (!pool) return;
      for (const ghost of pool) {
        if (!ghost.root.visible) continue;
        ghost.age += dt;
        const k = ghost.age / GHOST_LIFE;
        if (k >= 1) { ghost.root.visible = false; continue; }
        ghost.material.opacity = GHOST_ALPHA * (1 - k) * (1 - k);
      }
    },
    clear() { if (pool) for (const ghost of pool) { ghost.root.visible = false; ghost.age = Infinity; } },
    dispose() {
      if (!pool) return;
      for (const ghost of pool) { scene.remove(ghost.root); ghost.material.dispose(); }
      pool = null;
    },
  };
}
