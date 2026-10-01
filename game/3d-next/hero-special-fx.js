// A bounded pool for character-specific ultimate effects. All geometry/materials
// are allocated once; reset hides every item before a chapter or character switch.
export function createHeroSpecialFx(T, scene, groundAt, { capacity = 64 } = {}) {
  const ring = new T.TorusGeometry(1, 0.018, 4, 48);
  const shard = new T.OctahedronGeometry(1);
  const arc = new T.TorusGeometry(1, 0.022, 4, 32, Math.PI * 1.55);
  const beam = new T.BoxGeometry(1, 1, 1);
  const items = Array.from({ length: capacity }, () => {
    const material = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    const mesh = new T.Mesh(ring, material); mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh);
    return { mesh, age: 0, life: 0, growth: 0, spin: 0, vy: 0, gravity: 0, base: new T.Vector3() };
  });
  let index = 0, style = 'violet';
  const colors = { violet: 0xd9adff, azure: 0x9befff, amber: 0xffcf72 };
  function emit(geometry, pos, scale, life, options = {}) {
    const item = items[index++ % items.length];
    Object.assign(item, { age: 0, life, growth: 0, spin: 0, vy: 0, gravity: 0 }, options);
    item.base.set(...scale); item.mesh.geometry = geometry; item.mesh.position.copy(pos);
    item.mesh.rotation.set(...(options.rotation || [0, 0, 0])); item.mesh.scale.copy(item.base);
    item.mesh.material.color.setHex(options.color || colors[style]); item.mesh.material.opacity = 0.85; item.mesh.visible = true;
  }
  function pulse(pos, radius, finish = false) {
    emit(ring, pos.clone().add(new T.Vector3(0, 0.07, 0)), [radius * 0.45, radius * 0.45, 1], finish ? 0.85 : 0.55, { rotation: [Math.PI / 2, 0, 0], growth: 1.4 });
    if (style === 'azure') {
      for (let i = 0; i < (finish ? 16 : 10); i++) {
        const a = i * Math.PI * 2 / (finish ? 16 : 10);
        const p = pos.clone().add(new T.Vector3(Math.cos(a) * radius * 0.62, 0.1, Math.sin(a) * radius * 0.62));
        emit(shard, p, [0.12, finish ? 0.65 : 0.38, 0.13], 0.75, { vy: finish ? 3 : 2, gravity: 7, spin: i % 2 ? 2 : -2, color: i % 3 ? 0x657e9c : colors.azure });
        emit(beam, pos.clone().add(new T.Vector3(Math.cos(a) * radius * 0.4, 0.04, Math.sin(a) * radius * 0.4)), [0.022, 0.012, radius * 0.6], 0.55, { rotation: [0, Math.PI / 2 - a, 0], growth: 0.25 });
      }
    }
  }
  return {
    setStyle(id) { style = id; this.reset(); },
    onEvent(event, pos) {
      if (event.type === 'musouStart' && style !== 'violet') {
        pulse(pos, event.finishRadius / 60 * 0.5);
        emit(ring, pos.clone().add(new T.Vector3(0, 0.08, 0)), [1.2, 1.2, 1], 0.9, { rotation: [Math.PI / 2, 0, 0], spin: 1.4, growth: 0.5 });
      }
      if (event.type === 'swing' && event.flurry && style === 'azure') pulse(pos, event.radius / 60);
      if (event.type === 'swing' && event.flurry && style === 'amber') {
        if (event.from) {
          const from = new T.Vector3((event.from.x - 640) / 60, pos.y + 0.85, (event.from.y - 500) / 60);
          const end = pos.clone().add(new T.Vector3(0, 0.85, 0));
          const direction = end.clone().sub(from), length = direction.length();
          if (length > 0.01) {
            emit(beam, from.lerp(end, 0.5), [0.08, 0.12, length], 0.27);
            items[(index - 1) % items.length].mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), direction.normalize());
          }
        }
        for (let i = 0; i < 2; i++) emit(arc, pos.clone().add(new T.Vector3(0, 0.8, 0)), [1.15, 1.15, 1], 0.26, { rotation: [Math.PI / 2 + (i ? -0.35 : 0.35), event.facing, event.index * 0.7 + i * Math.PI], spin: i ? -3 : 3, growth: 0.4 });
      }
      if (event.type === 'musouFinish' && style !== 'violet') {
        pulse(pos, event.radius / 60, true);
        if (style === 'amber') {
          for (let i = 0; i < 8; i++) emit(arc, pos.clone().add(new T.Vector3(0, 0.3 + i * 0.14, 0)), [2.0, 2.0, 1], 0.6, { rotation: [Math.PI / 2 + i * 0.12, 0, i * Math.PI / 4], growth: 0.65, spin: 2 });
        }
      }
    },
    update(dt) {
      for (const item of items) {
        if (!item.mesh.visible) continue;
        item.age += dt;
        if (item.age >= item.life) { item.mesh.visible = false; continue; }
        const p = item.age / item.life;
        item.mesh.material.opacity = 0.85 * Math.pow(1 - p, 1.4);
        item.mesh.scale.copy(item.base).multiplyScalar(1 + item.growth * p);
        item.mesh.rotation.z += item.spin * dt;
        item.vy -= item.gravity * dt; item.mesh.position.y += item.vy * dt;
        item.mesh.position.y = Math.max(groundAt(item.mesh.position.x, item.mesh.position.z) + 0.025, item.mesh.position.y);
      }
    },
    reset() { for (const item of items) item.mesh.visible = false; },
    dispose() { for (const item of items) { scene.remove(item.mesh); item.mesh.material.dispose(); } for (const g of [ring, shard, arc, beam]) g.dispose(); },
    stats() { return { active: items.filter(item => item.mesh.visible).length, capacity: items.length }; },
  };
}
