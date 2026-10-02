// Chapter objective props that replace the demon lanterns: void rifts (虛空封魂) and the city
// gate (赤月圍城). Driven by march.view() every frame; geometry and materials are built once,
// each frame only moves meshes and writes a few uniforms.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toWorld } from './march.js?v=20261002y';

const RIFT_VERTEX = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
// A swirling tear: dark violet core, cyan rim, noise-driven spiral arms; fades out as it closes.
const RIFT_FRAGMENT = `uniform float time, open, hurt; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  void main(){
    vec2 p=(vUv-0.5)*vec2(2.0,2.0); float r=length(p*vec2(1.0,0.55)); float a=atan(p.y,p.x);
    float swirl=noise(vec2(a*2.0+r*6.0-time*1.6,r*5.0-time*0.7))*0.6+noise(vec2(a*5.0-time*2.3,r*9.0))*0.4;
    float edge=smoothstep(1.0,0.55,r)*open;
    float rim=smoothstep(0.62,0.95,r)*smoothstep(1.05,0.9,r);
    vec3 core=mix(vec3(0.03,0.0,0.08),vec3(0.35,0.08,0.6),swirl*smoothstep(0.9,0.1,r));
    vec3 col=core+vec3(0.25,1.3,1.5)*rim*(0.7+swirl*0.8)+vec3(1.4,0.5,1.6)*hurt*rim;
    gl_FragColor=vec4(col,edge*(0.55+0.45*smoothstep(0.95,0.2,r)));
    #include <colorspace_fragment>
  }`;

export function createChapterProps(T, scene, { heightAt, world = null }) {
  const group = new T.Group(); group.name = 'chapter-props'; scene.add(group);
  const owned = [];
  const keep = x => (owned.push(x), x);

  // ---- rifts ----
  const RIFTS = 5, riftGroups = [];
  const tearGeometry = keep(new T.PlaneGeometry(1.5, 2.8));
  const ringGeometry = keep(new T.RingGeometry(0.55, 1.55, 48));
  const glowMaterial = keep(new T.MeshBasicMaterial({ color: 0x5ff6ff, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
  const crystal = keep(new T.MeshStandardMaterial({ color: 0x8ff7ff, emissive: 0x2bc6e0, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.1, flatShading: true }));
  // Faceted shards: stretched, slightly twisted octahedrons.
  const shardGeometry = keep(new T.OctahedronGeometry(0.16, 0)); shardGeometry.scale(0.7, 2.2, 0.7);
  const SHARDS = 7;
  const shards = new T.InstancedMesh(shardGeometry, crystal, RIFTS * SHARDS); shards.frustumCulled = false; group.add(shards);
  const matrix = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), scl = new T.Vector3();
  for (let i = 0; i < RIFTS; i++) {
    const g = new T.Group(); g.visible = false; group.add(g);
    const material = keep(new T.ShaderMaterial({ uniforms: { time: { value: 0 }, open: { value: 1 }, hurt: { value: 0 } }, vertexShader: RIFT_VERTEX, fragmentShader: RIFT_FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide }));
    const tear = new T.Mesh(tearGeometry, material); tear.position.y = 1.75; g.add(tear);
    // A second, crossed sheet keeps the tear readable from the side.
    const cross = new T.Mesh(tearGeometry, material); cross.position.y = 1.75; cross.rotation.y = Math.PI / 2; cross.scale.set(0.45, 1, 1); g.add(cross);
    const ring = new T.Mesh(ringGeometry, glowMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    riftGroups.push({ g, tear, cross, material, closing: 0, wasBroken: false });
  }

  // ---- siege gate ----
  const gate = new T.Group(); gate.visible = false; group.add(gate);
  // Reuse the street's stone and wood textures (no new image files).
  const surface = world?.group?.getObjectByName('march-stone-0')?.material?.uniforms || {};
  const stoneMap = surface.stoneColour?.value || null, stoneNormal = surface.stoneSurface?.value || null, grain = surface.woodGrain?.value || null;
  const stone = keep(new T.MeshStandardMaterial({ color: stoneMap ? 0xb59d92 : 0x6e5d58, map: stoneMap, normalMap: stoneNormal, normalScale: new T.Vector2(0.8, 0.8), roughness: 0.92 }));
  const stoneDark = keep(new T.MeshStandardMaterial({ color: stoneMap ? 0x6b5652 : 0x3b302f, map: stoneMap, normalMap: stoneNormal, roughness: 0.95 }));
  const wood = keep(new T.MeshStandardMaterial({ color: grain ? 0xd8956a : 0x5a3020, map: grain, bumpMap: grain, bumpScale: 0.04, roughness: 0.78 }));
  const banner = keep(new T.MeshStandardMaterial({ color: 0x9c1d1d, roughness: 0.85, side: T.DoubleSide }));
  const iron = keep(new T.MeshStandardMaterial({ color: 0x2d2b2e, roughness: 0.45, metalness: 0.75 }));
  const brass = keep(new T.MeshStandardMaterial({ color: 0xb38343, roughness: 0.35, metalness: 0.8 }));
  const ember = keep(new T.MeshStandardMaterial({ color: 0xffa25a, emissive: 0xff5a1c, emissiveIntensity: 2.2 }));
  // Extruded shapes are non-indexed; convert the rest so they merge into one draw per material.
  const bake = (pieces, material) => { const flat = pieces.map(p => p.index ? p.toNonIndexed() : p); const merged = mergeGeometries(flat); pieces.forEach(p => p.dispose()); flat.forEach(p => p.dispose()); return new T.Mesh(keep(merged), material); };
  const at = (geometry, x, y, z, rx = 0, ry = 0, rz = 0) => geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(1, 1, 1)));
  // Extruded shapes carry metre UVs; scale them to the street's texture density.
  const extrude = (shape, depth, bevel = 0.08, uvScale = 0.35) => { const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18 }); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale); return g; };
  // Turned column base: plinth, torus moulding, tapering shaft and capital.
  const column = () => new T.LatheGeometry([[1.5, 0], [1.5, 0.25], [1.32, 0.38], [1.36, 0.52], [1.16, 0.62], [1.08, 1.2], [1.0, 1.85], [1.12, 1.95], [1.2, 2.1], [1.0, 2.2], [0, 2.2]].map(([x, y]) => new T.Vector2(x, y)), 20);
  const W = 3.3, H = 6.4, SPRING = 4.4;   // half width of the opening, crown height, where the arch starts
  {
    // Stone frame: a thick arch with an arched opening (shape with a hole), on battered plinths.
    const outer = new T.Shape(); outer.moveTo(-W - 1.5, 0); outer.lineTo(-W - 1.5, SPRING + 0.6); outer.absarc(0, SPRING + 0.6, W + 1.5, Math.PI, 0, true); outer.lineTo(W + 1.5, 0); outer.lineTo(-W - 1.5, 0);
    const hole = new T.Path(); hole.moveTo(-W, 0); hole.lineTo(-W, SPRING); hole.absarc(0, SPRING, W, Math.PI, 0, true); hole.lineTo(W, 0); hole.lineTo(-W, 0); outer.holes.push(hole);
    const frame = extrude(outer, 1.2, 0.12); at(frame, 0, 0, -0.6);
    const pieces = [frame];
    // Voussoir joints and a keystone give the arch its masonry rhythm.
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * k / 10, r0 = W + 0.05, r1 = W + 1.45;
      const joint = new T.BoxGeometry(r1 - r0, 0.05, 1.3); at(joint, Math.cos(a) * (r0 + r1) / 2, SPRING + Math.sin(a) * (r0 + r1) / 2, 0, 0, 0, a);
      pieces.push(joint);
    }
    const key = new T.Shape(); key.moveTo(-0.55, 0); key.lineTo(0.55, 0); key.lineTo(0.8, 1.6); key.lineTo(-0.8, 1.6); key.lineTo(-0.55, 0);
    const keystone = extrude(key, 1.4, 0.1); at(keystone, 0, SPRING + W - 0.05, -0.7); pieces.push(keystone);
    for (const side of [-1, 1]) { const base = column(); at(base, side * (W + 0.8), 0, 0); pieces.push(base); }
    gate.add(bake(pieces, stone));
    const trim = [];
    for (const side of [-1, 1]) for (const y of [2.6, 3.6]) { const band = new T.TorusGeometry(0.8, 0.07, 6, 24); at(band, side * (W + 0.8), y, 0.05, Math.PI / 2); trim.push(band); }
    gate.add(bake(trim, stoneDark));
    // A torn red war banner hangs from the arch, rippled and frayed at the hem.
    const cloth = new T.PlaneGeometry(1.3, 2.6, 8, 14), cp = cloth.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), v = (1.3 - y) / 2.6; cp.setZ(i, Math.sin(x * 5 + y * 2) * 0.08 * v); if (y < -1.1) cp.setY(i, y + Math.abs(Math.sin(x * 9)) * 0.25); }
    cloth.computeVertexNormals(); at(cloth, 0, SPRING + W - 1.3, 0.72);
    const pole = new T.CylinderGeometry(0.04, 0.04, 1.6, 8); at(pole, 0, SPRING + W + 0.02, 0.74, 0, 0, Math.PI / 2);
    gate.add(new T.Mesh(keep(cloth), banner), bake([pole], iron));
    // Torches on brackets either side of the gate.
    const torchIron = [], torchFlame = [];
    for (const side of [-1, 1]) {
      const x = side * (W + 1.0);
      const arm = new T.TorusGeometry(0.35, 0.04, 6, 12, Math.PI / 2); at(arm, x, 3.9, 0.85, 0, 0, side > 0 ? 0 : Math.PI / 2); torchIron.push(arm);
      const cup = new T.CylinderGeometry(0.2, 0.1, 0.3, 10); at(cup, x + side * 0.0, 4.25, 1.2); torchIron.push(cup);
      const flame = new T.ConeGeometry(0.17, 0.55, 10); at(flame, x, 4.65, 1.2); torchFlame.push(flame);
    }
    gate.add(bake(torchIron, iron));
    gate.add(bake(torchFlame, ember));
  }
  // Two doors, each hinged at its outer edge: vertical planks with bevels, curved iron straps, studs.
  const doors = [-1, 1].map(side => {
    const hinge = new T.Group(); hinge.position.set(side * W, 0, 0.05); gate.add(hinge);
    const woodPieces = [], ironPieces = [], brassPieces = [];
    const planks = 6, width = W / planks;
    for (let k = 0; k < planks; k++) {
      const x0 = -side * (k + 0.5) * width;
      // Plank top follows the arch so the closed doors fill the opening.
      const xm = side * W + x0, top = SPRING + Math.sqrt(Math.max(0, W * W - xm * xm)) - 0.05;
      const plank = new T.Shape(); plank.moveTo(-width / 2 + 0.02, 0); plank.lineTo(width / 2 - 0.02, 0); plank.lineTo(width / 2 - 0.02, top - 0.12); plank.lineTo(-width / 2 + 0.02, top - 0.12 + (k % 2 ? 0.08 : 0)); plank.lineTo(-width / 2 + 0.02, 0);
      const g = extrude(plank, 0.28, 0.03); at(g, x0, 0, -0.14); woodPieces.push(g);
    }
    for (const y of [1.0, 2.6, 4.2]) {
      const strap = new T.BoxGeometry(W - 0.15, 0.22, 0.08); at(strap, -side * W / 2, y, 0.2); ironPieces.push(strap);
      for (let k = 0; k < 6; k++) { const stud = new T.SphereGeometry(0.075, 8, 6); at(stud, -side * (0.3 + k * (W - 0.5) / 5), y, 0.26); ironPieces.push(stud); }
    }
    const ring = new T.TorusGeometry(0.28, 0.05, 8, 20); at(ring, -side * (W - 0.6), 2.0, 0.32); brassPieces.push(ring);
    // Half of a brass red-moon crest on each leaf, and arrows stuck in the planks from the siege.
    const crest = new T.CylinderGeometry(0.75, 0.75, 0.06, 32, 1, false, side > 0 ? Math.PI : 0, Math.PI); at(crest, -side * W, 3.4, 0.24, Math.PI / 2); brassPieces.push(crest);
    for (let k = 0; k < 4; k++) {
      const x = -side * (0.5 + ((k * 37 + (side > 0 ? 11 : 3)) % 23) / 23 * (W - 1.1)), y = 1.3 + ((k * 53 + (side > 0 ? 7 : 19)) % 31) / 31 * 3.2;
      const shaft = new T.CylinderGeometry(0.015, 0.015, 0.75, 5); at(shaft, x, y, 0.55, Math.PI / 2 - 0.25, 0.2 * side, 0); woodPieces.push(shaft);
      const fletch = new T.ConeGeometry(0.05, 0.16, 3); at(fletch, x - 0.04 * side, y + 0.08, 0.9, Math.PI / 2 - 0.25, 0, 0); woodPieces.push(fletch);
    }
    const boss = new T.CylinderGeometry(0.2, 0.24, 0.12, 16); at(boss, -side * (W - 0.6), 2.3, 0.26, Math.PI / 2); brassPieces.push(boss);
    hinge.add(bake(woodPieces, wood), bake(ironPieces, iron), bake(brassPieces, brass));
    return { hinge, side, fall: 0 };
  });

  let clock = 0, gateShake = 0, lastGateHp = null;
  const place = (object, view) => { const w = toWorld(view.x, view.y); object.position.set(w.x, heightAt(w.x, w.z), w.z); return w; };

  return {
    group,
    update(view, dt) {
      clock += dt;
      // The street textures may finish loading after the props are built.
      if (!stone.map && surface.stoneColour?.value) {
        stone.map = stoneDark.map = surface.stoneColour.value; stone.normalMap = stoneDark.normalMap = surface.stoneSurface?.value || null;
        stone.color.setHex(0xb59d92); stoneDark.color.setHex(0x6b5652); stone.needsUpdate = stoneDark.needsUpdate = true;
      }
      if (!wood.map && surface.woodGrain?.value) { wood.map = wood.bumpMap = surface.woodGrain.value; wood.color.setHex(0xd8956a); wood.needsUpdate = true; }
      const rift = view.objectiveStyle === 'rift';
      let k = 0;
      riftGroups.forEach((r, i) => {
        const state = rift && view.segment <= 1 ? view.lanterns[i] : null;
        r.g.visible = !!state && (!state.broken || r.closing < 1);
        if (!state) return;
        place(r.g, state);
        if (state.broken) r.closing = Math.min(1, r.closing + dt * 2.2); else r.closing = 0;
        const ratio = state.maxHp ? state.hp / state.maxHp : 1;
        r.material.uniforms.time.value = clock + i * 3.7;
        r.material.uniforms.open.value = (0.55 + 0.45 * ratio) * (1 - r.closing);
        r.material.uniforms.hurt.value = ratio < 1 ? 0.5 + 0.5 * Math.sin(clock * 18) : 0;
        const s = (0.75 + 0.25 * ratio) * (1 - r.closing * 0.8);
        r.tear.scale.set(s * (1 + Math.sin(clock * 2 + i) * 0.04), s, 1); r.cross.scale.set(0.45 * s, s, 1);
        r.tear.rotation.y = Math.sin(clock * 0.4 + i) * 0.35;
        for (let j = 0; j < SHARDS; j++, k++) {
          const a = clock * (0.6 + j * 0.07) + j * Math.PI * 2 / SHARDS + i;
          const radius = 1.15 + 0.25 * Math.sin(clock * 1.3 + j) + r.closing * 0.8;
          pos.set(r.g.position.x + Math.cos(a) * radius, r.g.position.y + 1.2 + 0.9 * Math.sin(a * 1.7 + j) + (j % 3) * 0.3, r.g.position.z + Math.sin(a) * radius);
          e.set(Math.sin(a + j) * 0.6, a * 2, Math.cos(a) * 0.4); q.setFromEuler(e);
          scl.setScalar(r.g.visible ? (0.7 + (j % 3) * 0.25) * (1 - r.closing) : 0);
          shards.setMatrixAt(k, matrix.compose(pos, q, scl));
        }
      });
      for (; k < RIFTS * SHARDS; k++) shards.setMatrixAt(k, matrix.makeScale(0, 0, 0));
      shards.instanceMatrix.needsUpdate = true;
      shards.visible = rift;

      const siege = view.siegeGate;
      gate.visible = !!siege && view.segment <= 3;
      if (siege) {
        place(gate, siege);
        const ratio = siege.maxHp ? siege.hp / siege.maxHp : 1;
        if (lastGateHp !== null && siege.hp < lastGateHp) gateShake = 0.25;
        lastGateHp = siege.hp;
        gateShake = Math.max(0, gateShake - dt);
        for (const door of doors) {
          // Doors sag as the gate weakens, then swing in and fall flat once it breaks.
          const target = siege.broken ? 1 : 0;
          door.fall += (target - door.fall) * Math.min(1, dt * 3);
          const jolt = gateShake > 0 ? Math.sin(clock * 70) * 0.03 * gateShake / 0.25 : 0;
          door.hinge.rotation.y = -door.side * (door.fall * 1.25 + (1 - ratio) * 0.05) + jolt;
          door.hinge.rotation.x = -door.fall * 1.35;
          door.hinge.position.y = -door.fall * 0.2;
        }
        ember.emissiveIntensity = 2 + Math.sin(clock * 11) * 0.35 + Math.sin(clock * 27) * 0.2;
      }
    },
    dispose() { scene.remove(group); shards.dispose(); for (const x of owned) x.dispose(); },
  };
}
