/**
 * Environment art for the 夜市大街行軍關 (night-market march level). Replaces the graybox
 * march-world.js with the same public surface, built from march.js LAYOUT at runtime.
 *
 * Two entry points:
 *   const world = await createMarchArt(THREE, scene, LAYOUT);   // resolves when assets + meshes are ready
 *   const world = createMarchWorld(THREE, scene);               // sync drop-in for march-world.js;
 *                                                               // art streams in, await world.ready
 * Surface (identical to march-world.js, plus breakables / stats / ready):
 *   world.update(view, dt, seconds)     view = march.view(); update(dt, view) is accepted too
 *   world.heightAt(x, z)                floor height = march.js heightAt (collision unchanged)
 *   world.constrainCamera(cam, hero)    barriers as before + keeps the camera out of facades
 *   world.breakables.break(i) / reset() / sync(view.breakables) / isBroken(i)   LAYOUT.breakables art
 *   world.stats()                       triangles, texture bytes, build timings
 *   world.group, world.dispose()
 *
 * Look: everything static is unlit (MeshBasicMaterial / small ShaderMaterials) with lighting baked
 * at load: per-vertex colours for walls and props, a typed-array floor lightmap for the ground
 * (light pools, contact shadows) and an emitter map the floor shader samples along the view ray
 * for fake wet reflections. No real-time lights, no shadows, no post. Static geometry is merged
 * per material per segment (4 chunks x 4 materials) so frustum culling drops what is behind.
 *
 * Assets (lazy, only fetched by this module): ../assets/march/march-props.webp (2048² atlas),
 * march-stone.webp (1024², flagstone + ashlar), march-sky.webp (2048x512), atlas.json.
 * Painted by game/scripts/march-art/paint_atlas.py.
 */
import { LAYOUT, heightAt as layoutHeightAt, toWorld } from './march.js';

const VERSION = '20260925a';
const TAU = Math.PI * 2;

// Floor lightmap covers this world rectangle (metres) at LM_PPM pixels per metre.
const LM = { minX: -32, maxX: 32, minZ: -116, maxZ: 20, ppm: 8, scale: 3 };

// Ambient / moon for the vertex bake (linear multipliers on the painted albedo).
const AMB_SKY = [0.46, 0.48, 0.78];
const AMB_GROUND = [0.2, 0.18, 0.28];
const MOON = { dir: normalize3([-0.45, 0.8, 0.4]), color: [0.32, 0.3, 0.46] };

const WARM = [1.0, 0.62, 0.3];
const AMBER = [1.0, 0.72, 0.4];
const MAGENTA = [1.0, 0.3, 0.72];
const TEAL = [0.28, 0.9, 0.88];
const VIOLET = [0.62, 0.34, 1.0];

function normalize3(v) { const l = Math.hypot(...v); return v.map(x => x / l); }
function mulberry(seed) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export async function createMarchArt(THREE, scene, layout = LAYOUT, options = {}) {
  const heightAt = options.heightAt || layoutHeightAt;
  const base = options.baseUrl || new URL('../assets/march/', import.meta.url).href;
  const rand = mulberry(20260925);
  const R = (a, b) => a + (b - a) * rand();
  const pick = list => list[Math.floor(rand() * list.length)];

  // ------------------------------------------------------------------ textures
  const loader = new THREE.TextureLoader();
  // options.source(file)：預載好的內容（圖檔為 object URL、atlas.json 為物件，可為 Promise）；沒有就照舊從網路抓
  const preloaded = file => Promise.resolve(options.source?.(file) ?? null);
  const loadTexture = (file, srgb = true) => preloaded(file).then(url => loader.loadAsync(url || `${base}${file}?v=${VERSION}`)).then(texture => {
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = options.anisotropy ?? 4;
    return texture;
  });
  const timing = { start: performance.now() };
  const [atlasInfo, propsTexture, stoneTexture, skyTexture] = await Promise.all([
    preloaded('atlas.json').then(json => json || fetch(`${base}atlas.json?v=${VERSION}`).then(response => response.json())),
    loadTexture('march-props.webp'), loadTexture('march-stone.webp'), loadTexture('march-sky.webp'),
  ]);
  timing.fetched = performance.now();
  skyTexture.wrapS = THREE.MirroredRepeatWrapping;
  skyTexture.anisotropy = 1;
  const textures = [propsTexture, stoneTexture, skyTexture];
  const ATLAS = atlasInfo.size[0];
  /** UV rect of a named atlas region; optional sub-rect in region fractions (top-left origin). */
  function region(name, fx0 = 0, fy0 = 0, fx1 = 1, fy1 = 1) {
    const rect = atlasInfo.rects[name];
    if (!rect) throw new Error(`march-art: missing atlas region ${name}`);
    const [x, y, w, h] = rect;
    const inset = 1.5;
    const px0 = x + w * fx0 + inset, px1 = x + w * fx1 - inset;
    const py0 = y + h * fy0 + inset, py1 = y + h * fy1 - inset;
    return { u0: px0 / ATLAS, u1: px1 / ATLAS, v0: 1 - py1 / ATLAS, v1: 1 - py0 / ATLAS };
  }
  const facade = k => region('facades', (k % 2) / 2, Math.floor(k / 2) / 4, (k % 2) / 2 + 0.5, Math.floor(k / 2) / 4 + 0.25);

  // ------------------------------------------------------------------ geometry builders
  class Builder {
    constructor(kind) { this.kind = kind; this.pos = []; this.nrm = []; this.uv = []; this.tint = []; this.fx = []; this.corner = []; this.index = []; }
    get count() { return this.pos.length / 3; }
    vertex(x, y, z, nx, ny, nz, u, v, tint, emit, ao, corner) {
      this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.uv.push(u, v);
      this.tint.push(tint[0], tint[1], tint[2]); this.fx.push(emit, ao);
      if (corner) this.corner.push(corner[0], corner[1], corner[2]);
      return this.count - 1;
    }
  }
  // chunks 0-3 = segments (compact bounds, frustum-culled); chunk 4 = the wide ground + far city blocks
  const chunks = [0, 1, 2, 3, 4].map(() => ({ stone: new Builder('stone'), props: new Builder('props'), cutout: new Builder('cutout'), glow: new Builder('glow') }));
  const FAR = 'far';
  const chunkOf = z => z === FAR ? 4 : z > -31 ? 0 : z > -53 ? 1 : z > -85 ? 2 : 3;
  const B = (kind, z) => chunks[chunkOf(z)][kind];

  const tmpV = new THREE.Vector3(), tmpN = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  const WHITE = [1, 1, 1];
  /** Frame: translation + yaw (+ optional pitch / roll). */
  function F(x, y, z, ry = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    m.setPosition(x, y, z);
    return m;
  }
  const child = (m, x, y, z, ry = 0, rx = 0, rz = 0) => m.clone().multiply(F(x, y, z, ry, rx, rz));
  /** Adds a quad (corners bl, br, tr, tl in local space) mapped to `uv` region. */
  function quad(b, m, c, uv, o = {}) {
    normalMatrix.getNormalMatrix(m);
    const e1 = new THREE.Vector3().subVectors(new THREE.Vector3(...c[1]), new THREE.Vector3(...c[0]));
    const e2 = new THREE.Vector3().subVectors(new THREE.Vector3(...c[3]), new THREE.Vector3(...c[0]));
    tmpN.crossVectors(e1, e2).normalize().applyMatrix3(normalMatrix).normalize();
    const n = [tmpN.x, tmpN.y, tmpN.z];
    const uvs = o.uvs || [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    const ao = Array.isArray(o.ao) ? o.ao : [o.ao ?? 1, o.ao ?? 1, o.ao ?? 1, o.ao ?? 1];
    const i0 = b.count;
    for (let k = 0; k < 4; k++) {
      tmpV.set(...c[k]).applyMatrix4(m);
      b.vertex(tmpV.x, tmpV.y, tmpV.z, n[0], n[1], n[2], uvs[k][0], uvs[k][1], o.tint || WHITE, o.emit ?? 0, ao[k]);
    }
    b.index.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    if (o.double) quad(b, m, [c[1], c[0], c[3], c[2]], uv, { ...o, double: false, uvs: [uvs[1], uvs[0], uvs[3], uvs[2]] });
  }
  /** Quad (or triangle when two corners repeat) flipped as needed so its normal faces `want`. */
  function quadUp(b, m, c, want, uv = {}, o = {}) {
    const p = c.map(v => new THREE.Vector3(...v));
    const n = new THREE.Vector3();
    for (let k = 0; k < 4 && n.lengthSq() < 1e-10; k++) n.crossVectors(p[(k + 1) % 4].clone().sub(p[k]), p[(k + 3) % 4].clone().sub(p[k]));
    const flip = n.x * want[0] + n.y * want[1] + n.z * want[2] < 0;
    const cc = flip ? [c[1], c[0], c[3], c[2]] : c;
    // degenerate first edge breaks quad()'s normal; rotate corners so a real edge comes first
    let start = 0;
    for (let k = 0; k < 4; k++) {
      const a = new THREE.Vector3(...cc[k]), bb = new THREE.Vector3(...cc[(k + 1) % 4]), d = new THREE.Vector3(...cc[(k + 3) % 4]);
      if (a.distanceTo(bb) > 1e-6 && a.distanceTo(d) > 1e-6) { start = k; break; }
    }
    quad(b, m, [0, 1, 2, 3].map(k => cc[(k + start) % 4]), uv, o);
  }
  /**
   * Box with its bottom centre at the frame origin: w (x) × h (y) × d (z). `faces` picks a UV
   * region per face (px nx py ny pz nz; null skips the face). `cells` = metres per repeated
   * region along [u, v] so atlas textures can tile. `ao` darkens the bottom vertices of the sides.
   */
  function box(b, m, w, h, d, o = {}) {
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const faceList = {
      pz: [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], w, h],
      nz: [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], w, h],
      px: [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], d, h],
      nx: [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], d, h],
      py: [[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], w, d],
      ny: [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], w, d],
    };
    for (const [face, [a, bb, c, dd, fw, fh]] of Object.entries(faceList)) {
      const uv = o.faces ? o.faces[face] : o.uv;
      if (uv === null || uv === undefined) continue;
      const side = face !== 'py' && face !== 'ny';
      const aoLow = side ? (o.ao ?? 1) : 1;
      const tint = o.tints?.[face] || o.tint;
      const cells = o.cells && side ? o.cells : o.topCells && !side ? o.topCells : null;
      if (!cells) { quad(b, m, [a, bb, c, dd], uv, { tint, emit: o.emit, ao: [aoLow, aoLow, 1, 1] }); continue; }
      const nu = Math.max(1, Math.round(fw / cells[0])), nv = Math.max(1, Math.round(fh / cells[1]));
      const lerpP = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const b0 = lerpP(a, bb, i / nu), b1 = lerpP(a, bb, (i + 1) / nu);
        const t0 = lerpP(dd, c, i / nu), t1 = lerpP(dd, c, (i + 1) / nu);
        const p00 = lerpP(b0, t0, j / nv), p10 = lerpP(b1, t1, j / nv), p11 = lerpP(b1, t1, (j + 1) / nv), p01 = lerpP(b0, t0, (j + 1) / nv);
        const ao0 = j === 0 ? aoLow : 1;
        quad(b, m, [p00, p10, p11, p01], uv, { tint, emit: o.emit, ao: [ao0, ao0, 1, 1] });
      }
    }
  }
  /** Surface of revolution around local y. profile = [[radius, y], ...] bottom → top. */
  function lathe(b, m, profile, segments, uv, o = {}) {
    normalMatrix.getNormalMatrix(m);
    const lengths = [0];
    for (let i = 1; i < profile.length; i++) lengths.push(lengths[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
    const total = lengths[lengths.length - 1] || 1;
    const i0 = b.count;
    const phase = o.phase ?? 0;
    for (let s = 0; s <= segments; s++) {
      const a = s / segments * TAU + phase, ca = Math.cos(a), sa = Math.sin(a);
      const uFrac = s / segments;
      for (let i = 0; i < profile.length; i++) {
        const [r, y] = profile[i];
        const prev = profile[Math.max(0, i - 1)], next = profile[Math.min(profile.length - 1, i + 1)];
        const dr = next[0] - prev[0], dy = next[1] - prev[1];
        let nx = dy, ny = -dr; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        tmpV.set(r * ca, y, r * sa).applyMatrix4(m);
        tmpN.set(nx * ca, ny, nx * sa).applyMatrix3(normalMatrix).normalize();
        const t = o.vByY ? (y - profile[0][1]) / (profile[profile.length - 1][1] - profile[0][1] || 1) : lengths[i] / total;
        const u = uv.u0 + (uv.u1 - uv.u0) * uFrac, v = uv.v0 + (uv.v1 - uv.v0) * t;
        const ao = o.ao ? (o.ao + (1 - o.ao) * Math.min(1, (y - profile[0][1]) / (o.aoHeight || 0.8))) : 1;
        b.vertex(tmpV.x, tmpV.y, tmpV.z, tmpN.x, tmpN.y, tmpN.z, u, v, o.tint || WHITE, o.emit ?? 0, ao);
      }
    }
    const n = profile.length;
    for (let s = 0; s < segments; s++) for (let i = 0; i < n - 1; i++) {
      const a = i0 + s * n + i, c = i0 + (s + 1) * n + i;
      b.index.push(a, c + 1, c, a, a + 1, c + 1);
    }
  }
  /** Camera-facing glow sprite (additive). size = width in metres; tint may exceed 1. */
  function glow(x, y, z, size, tint, o = {}) {
    const b = B('glow', o.far ? FAR : z);
    const uv = o.uv || region('glow');
    const h = size / 2, hv = (o.height ?? size) / 2, phase = o.flicker === false ? -1 : rand() * 6.28;
    const i0 = b.count;
    const corners = [[-h, -hv, uv.u0, uv.v0], [h, -hv, uv.u1, uv.v0], [h, hv, uv.u1, uv.v1], [-h, hv, uv.u0, uv.v1]];
    for (const [cx, cy, u, v] of corners) b.vertex(x, y, z, 0, 0, 1, u, v, tint, 1, 1, [cx, cy, phase]);
    b.index.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  /** Flat additive decal (world-space quad) in the glow batch. */
  function decal(m, c, uv, tint, uvs) {
    const b = B('glow', new THREE.Vector3().setFromMatrixPosition(m).z);
    const i0 = b.count;
    const list = uvs || [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    for (let k = 0; k < 4; k++) {
      tmpV.set(...c[k]).applyMatrix4(m);
      b.vertex(tmpV.x, tmpV.y, tmpV.z, 0, 1, 0, list[k][0], list[k][1], tint, 1, 1, [0, 0, -1]);
    }
    b.index.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  // ------------------------------------------------------------------ lights (baked) + floor paint lists
  const lights = [];     // { x, y, z, c, i, r, floor, refl }
  const shadows = [];    // floor contact shadows { x, z, rx, rz, a, rot, soft }
  function light(x, y, z, c, i, r, o = {}) { lights.push({ x, y, z, c, i, r, floor: o.floor ?? 1, refl: o.refl ?? 0.6, pool: o.pool ?? 1 }); }
  function shadow(x, z, rx, rz, a = 0.5, rot = 0, soft = 0.6) { shadows.push({ x, z, rx, rz, a, rot, soft }); }

  // ------------------------------------------------------------------ reusable props
  const PAPER = ['lantern0', 'lantern1', 'lantern2', 'lantern3'];
  const LANTERN_GLOW = [[1.3, 0.55, 0.3], [1.3, 0.8, 0.4], [1.2, 1.0, 0.75], [1.2, 0.5, 0.9]];
  function paperLantern(x, y, z, radius = 0.26, kind = Math.floor(rand() * 4), o = {}) {
    const b = B('props', z);
    const h = radius * 2.1;
    const prof = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([0.25 * radius + Math.sin(t * Math.PI) * radius * 0.8, -h / 2 + t * h]); }
    lathe(b, F(x, y, z, rand() * TAU), prof, 8, region(PAPER[kind]), { emit: 1, tint: [1.05, 1.05, 1.05], vByY: true });
    box(b, F(x, y + h / 2, z), radius * 0.6, 0.06, radius * 0.6, { uv: region('sw_black') });
    box(b, F(x, y - h / 2 - 0.06, z), radius * 0.5, 0.06, radius * 0.5, { uv: region('sw_black') });
    if (o.tassel !== false) box(b, F(x, y - h / 2 - 0.26, z), 0.03, 0.2, 0.03, { uv: region('sw_black'), tint: [3, 0.4, 0.3] });
    const gc = LANTERN_GLOW[kind];
    glow(x, y, z, radius * (o.glowScale ?? 6), gc.map(v => v * 0.55));
    if (o.light !== false) light(x, y, z, gc.map(v => v / 1.3), o.intensity ?? 0.9, o.radius ?? 5.5, { refl: o.refl ?? 0.7 });
  }
  function cable(p0, p1, sag, z, o = {}) {
    // Catenary-ish ribbon from p0 to p1 (world) sagging `sag` metres; returns points for hanging things.
    const b = B('props', z);
    const n = 10, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t]);
    }
    const uv = region('sw_cable');
    const th = o.thickness ?? 0.035;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[i + 1];
      quad(b, new THREE.Matrix4(), [[a[0], a[1] - th, a[2]], [c[0], c[1] - th, c[2]], [c[0], c[1] + th, c[2]], [a[0], a[1] + th, a[2]]], uv, { emit: 1, tint: [1, 1, 1], double: true });
    }
    return t => { const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i; return pts[i].map((v, j) => v + (pts[i + 1][j] - v) * k); };
  }
  function lanternString(x0, x1, z, yEnd, sag, count, o = {}) {
    const at = cable([x0, yEnd, z], [x1, yEnd, z + (o.dz || 0)], sag, z);
    for (let i = 1; i <= count; i++) {
      const p = at(i / (count + 1));
      box(B('props', z), F(p[0], p[1] - 0.2, p[2]), 0.02, 0.2, 0.02, { uv: region('sw_cable') });
      paperLantern(p[0], p[1] - 0.42, p[2], o.radius ?? 0.22, o.kind ?? Math.floor(rand() * 4), { light: i % 2 === 1, intensity: 0.9, radius: 8.5, glowScale: 5.5, refl: 0.45 });
    }
  }
  /** Hanok roof: ridge along local x, slopes down to ±z, upturned eave corners. */
  function roof(m, halfLen, halfDepth, rise, o = {}) {
    const b = B('props', new THREE.Vector3().setFromMatrixPosition(m).z);
    const tileUv = region('roof');
    const nu = Math.max(2, Math.round(halfLen * 2 / (o.cellU ?? 2.2))), nv = 3;
    const curl = o.curl ?? 0.45;
    const P = (u, v, side) => {  // u -1..1 along the ridge, v 0 ridge .. 1 eave
      const x = u * (halfLen + v * (o.flare ?? 0.35));
      const y = rise * (1 - Math.pow(v, 0.75)) + curl * Math.pow(Math.abs(u), 4) * v * v;
      return [x, y, side * v * halfDepth];
    };
    for (const side of [1, -1]) {
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const u0 = -1 + 2 * i / nu, u1 = -1 + 2 * (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
        const c = [P(u0, v1, side), P(u1, v1, side), P(u1, v0, side), P(u0, v0, side)];
        quad(b, m, side > 0 ? c : [c[1], c[0], c[3], c[2]], tileUv, { ao: [0.85, 0.85, 1, 1] });
      }
      // eave fascia: round tile ends + painted rafters under the edge
      const eaveUv = region('eave');
      for (let i = 0; i < nu * 2; i++) {
        const u0 = -1 + i / nu, u1 = -1 + (i + 1) / nu;
        const a = P(u0, 1, side), c = P(u1, 1, side);
        const q = [[a[0], a[1] - 0.34, a[2]], [c[0], c[1] - 0.34, c[2]], [c[0], c[1] + 0.02, c[2]], [a[0], a[1] + 0.02, a[2]]];
        quad(b, m, side > 0 ? q : [q[1], q[0], q[3], q[2]], eaveUv, { tint: [1.1, 1.1, 1.15] });
      }
      // underside (dark soffit)
      const s0 = P(-1, 1, side), s1 = P(1, 1, side), s2 = [halfLen * 0.9, rise * 0.25, side * 0.2], s3 = [-halfLen * 0.9, rise * 0.25, side * 0.2];
      const q = [[s0[0], s0[1] - 0.34, s0[2]], [s1[0], s1[1] - 0.34, s1[2]], s2, s3];
      quad(b, m, side > 0 ? [q[1], q[0], q[3], q[2]] : q, region('wood'), { tint: [0.5, 0.42, 0.45], ao: 0.7 });
    }
    // gable ends
    for (const end of [-1, 1]) {
      const e = end * halfLen * 0.92;
      const tri = [[e, rise * 0.15, -halfDepth * 0.55], [e, rise * 0.15, halfDepth * 0.55], [e, rise * 0.95, 0], [e, rise * 0.95, 0]];
      quad(b, m, end < 0 ? tri : [tri[1], tri[0], tri[3], tri[2]], region('wood'), { tint: [0.55, 0.45, 0.5] });
    }
    // ridge beam with raised ends
    box(b, child(m, 0, rise - 0.05, 0), halfLen * 2 + 0.2, 0.32, 0.36, { uv: region('roof', 0, 0, 1, 0.25), tint: [0.8, 0.8, 0.9] });
    for (const end of [-1, 1]) box(b, child(m, end * (halfLen + 0.05), rise + 0.12, 0, 0, 0, -end * 0.5), 0.22, 0.5, 0.3, { uv: region('sw_black'), tint: [2.2, 2.2, 2.6] });
  }
  function stoneLantern(x, z, y = heightAt(x, z), scale = 1) {
    const b = B('props', z), s = scale;
    const st = region('stone');
    const dim = [0.62, 0.62, 0.72];
    lathe(b, F(x, y, z, Math.PI / 8), [[0.42 * s, 0], [0.42 * s, 0.22 * s], [0.3 * s, 0.3 * s], [0.13 * s, 0.34 * s]], 8, st, { ao: 0.5, aoHeight: 0.3, tint: dim });
    lathe(b, F(x, y + 0.34 * s, z, Math.PI / 8), [[0.13 * s, 0], [0.11 * s, 0.75 * s]], 8, st, { tint: dim });
    lathe(b, F(x, y + 1.09 * s, z, Math.PI / 8), [[0.12 * s, 0], [0.34 * s, 0.1 * s], [0.34 * s, 0.16 * s]], 8, st, { tint: dim });
    // light chamber: glowing paper panes inside a stone frame
    box(b, F(x, y + 1.25 * s, z), 0.36 * s, 0.42 * s, 0.36 * s, { uv: region('sw_paper'), emit: 1, tint: [1.25, 0.8, 0.45] });
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(b, F(x + dx * 0.17 * s, y + 1.25 * s, z + dz * 0.17 * s), 0.08 * s, 0.42 * s, 0.08 * s, { uv: st, tint: dim });
    // flared roof cap with upturned eaves, then a lotus-bud finial
    lathe(b, F(x, y + 1.66 * s, z, Math.PI / 4), [[0.2 * s, -0.02 * s], [0.46 * s, 0.02 * s], [0.44 * s, 0.07 * s], [0.3 * s, 0.13 * s], [0.12 * s, 0.24 * s], [0.07 * s, 0.3 * s]], 4, st, { tint: [0.45, 0.45, 0.55] });
    lathe(b, F(x, y + 1.96 * s, z), [[0.07 * s, 0], [0.1 * s, 0.07 * s], [0.0, 0.2 * s]], 6, st, { tint: dim });
    glow(x, y + 1.25 * s, z, 1.5 * s, [0.9, 0.5, 0.22]);
    light(x, y + 1.25 * s, z, AMBER, 0.9, 5.5 * s, { refl: 0.5 });
    shadow(x, z, 0.6 * s, 0.6 * s, 0.55);
  }
  function blossomTree(x, z, o = {}) {
    const y = o.y ?? heightAt(x, z);
    const s = o.scale ?? 1;
    const b = B('props', z), cut = B('cutout', z);
    const lean = R(-0.12, 0.12), leanZ = R(-0.12, 0.12);
    lathe(b, F(x, y, z, 0, leanZ, lean), [[0.3 * s, 0], [0.22 * s, 0.4 * s], [0.17 * s, 1.6 * s], [0.13 * s, 2.6 * s]], 7, region('bark'), { ao: 0.45, aoHeight: 0.6 });
    const top = new THREE.Vector3(0, 2.6 * s, 0).applyMatrix4(F(0, 0, 0, 0, leanZ, lean)).add(new THREE.Vector3(x, y, z));
    const crown = [];
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + R(-0.4, 0.4), len = R(1.2, 1.9) * s, rise = R(0.5, 1.1) * s;
      const m = F(top.x, top.y - 0.3 * s, top.z, -a, 0, 0).multiply(F(0, 0, 0, 0, 0, -Math.atan2(len, rise)));
      lathe(b, m, [[0.1 * s, 0], [0.04 * s, Math.hypot(len, rise)]], 5, region('bark'));
      crown.push(new THREE.Vector3(top.x + Math.cos(a) * len, top.y - 0.3 * s + rise, top.z + Math.sin(a) * len));
    }
    crown.push(new THREE.Vector3(top.x, top.y + 0.9 * s, top.z));
    const cards = o.cards ?? 20;
    for (let k = 0; k < cards; k++) {
      const c = crown[k % crown.length];
      const px = c.x + R(-0.9, 0.9) * s, py = c.y + R(-0.5, 0.7) * s, pz = c.z + R(-0.9, 0.9) * s;
      const size = R(1.3, 2.1) * s;
      const m = F(px, py, pz, R(0, TAU), R(-0.5, 0.5), R(-0.3, 0.3));
      const h = size / 2;
      const shade = 0.75 + 0.35 * ((py - y) / (4.5 * s));
      quad(cut, m, [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]], region(k % 2 ? 'blossom0' : 'blossom1'), { double: true, emit: 0.35, tint: [shade, shade * 0.92, shade] });
    }
    shadow(x, z, 2.4 * s, 2.4 * s, 0.35, 0, 0.9);
    // fallen petals around the trunk (flat, cutout)
    for (let k = 0; k < 3; k++) {
      const px = x + R(-1.6, 1.6) * s, pz = z + R(-1.6, 1.6) * s, sz = R(1.2, 2);
      quad(cut, F(px, heightAt(px, pz) + 0.012, pz, R(0, TAU)), [[-sz / 2, 0, sz / 2], [sz / 2, 0, sz / 2], [sz / 2, 0, -sz / 2], [-sz / 2, 0, -sz / 2]], region('petals'), { emit: 0.4, tint: [0.9, 0.8, 0.9] });
    }
  }
  function neonSign(m, index, height = 2.4) {
    const b = B('props', new THREE.Vector3().setFromMatrixPosition(m).z);
    const uv = region(`sign${index}`);
    // Slim sign box; both broad faces carry the sign, edges dark.
    box(b, m, 0.14, height, 0.62, { faces: { px: uv, nx: uv, py: region('sw_black'), pz: region('sw_metal'), nz: region('sw_metal') }, emit: 1 });
    // bracket arms
    box(b, child(m, 0, height * 0.85, -0.45), 0.05, 0.05, 0.4, { uv: region('sw_metal') });
    box(b, child(m, 0, height * 0.15, -0.45), 0.05, 0.05, 0.4, { uv: region('sw_metal') });
    const colors = [MAGENTA, TEAL, AMBER, VIOLET, [1, 0.4, 0.45], [0.35, 0.8, 1]];
    const p = new THREE.Vector3(0, height / 2, 0).applyMatrix4(m);
    const c = colors[index];
    glow(p.x, p.y, p.z, 1.8, c.map(v => v * 0.28), { height: height * 1.3, flicker: false });
    light(p.x, p.y, p.z, c, 0.7, 6, { refl: 0.8 });
  }
  function banner(m, index, length = 3.2, width = 0.8) {
    const cut = B('cutout', new THREE.Vector3().setFromMatrixPosition(m).z);
    quad(cut, m, [[-width / 2, -length, 0], [width / 2, -length, 0], [width / 2, 0, 0], [-width / 2, 0, 0]], region(`banner${index}`), { double: true, emit: 0.25, tint: [1.1, 1.0, 1.2] });
  }

  // ------------------------------------------------------------------ building kit
  const FRONT = 10.2;   // market facades |x|
  /**
   * Shop house. Frame origin = facade bottom centre, local +z points out of the facade (to the street).
   * style: 'modern' (upper floors + parapet + rooftop sign) | 'hanok' (lattice upper floor + tiled roof).
   */
  function building(m, width, o = {}) {
    const z = new THREE.Vector3().setFromMatrixPosition(m).z;
    const b = B('props', z), st = B('stone', z);
    const style = o.style || 'modern';
    const depth = o.depth ?? 6;
    const shopH = 3.6;
    const floors = o.floors ?? (style === 'hanok' ? 1 : 2);
    const upperH = floors * 2.4;
    const top = shopH + 0.25 + upperH;
    const dark = region('stone');
    // plinth + body (sides/back dark) — body in props so walls get the vertex bake
    box(st, child(m, 0, 0, -depth / 2 + 0.15), width + 0.1, 0.16, depth + 0.3, { uv: {}, faces: { pz: {}, px: {}, nx: {}, py: {} } });
    box(b, child(m, 0, 0, -depth / 2), width, top, depth, { faces: { px: dark, nx: dark, nz: dark, pz: null, py: null }, tint: [0.42, 0.42, 0.55], ao: 0.5, cells: [2.4, 2.4] });
    // storefront
    quad(b, child(m, 0, 0.16, 0.01), [[-width / 2 + 0.28, 0, 0], [width / 2 - 0.28, 0, 0], [width / 2 - 0.28, shopH - 0.1, 0], [-width / 2 + 0.28, shopH - 0.1, 0]], facade(o.facade ?? 0), { emit: 0.92, tint: [1.02, 1.0, 1.0] });
    // pilasters
    for (const s of [-1, 1]) box(b, child(m, s * (width / 2 - 0.12), 0, 0.05), 0.3, shopH + 0.25, 0.3, { uv: dark, tint: [0.35, 0.34, 0.45], ao: 0.45 });
    // fascia beam between shop and upper floors
    box(b, child(m, 0, shopH, 0.08), width, 0.3, 0.32, { faces: { pz: style === 'hanok' ? region('dancheong') : region('wood'), py: dark, ny: dark }, tint: style === 'hanok' ? [0.85, 0.85, 0.85] : [0.5, 0.45, 0.5], cells: style === 'hanok' ? [2.4, 0.3] : null });
    // upper floors
    const upperUv = style === 'hanok' ? region('upper_hanok', 0, 0.5, 1, 1) : region('upper_modern');
    for (let f = 0; f < floors; f += style === 'hanok' ? 1 : 2) {
      const h = style === 'hanok' ? 2.4 : Math.min(4.8, (floors - f) * 2.4);
      const uv = style === 'hanok' ? upperUv : h < 4 ? region('upper_modern', 0, 0.5, 1, 1) : upperUv;
      quad(b, child(m, 0, shopH + 0.3 + f * 2.4, 0.005), [[-width / 2, 0, 0], [width / 2, 0, 0], [width / 2, h, 0], [-width / 2, h, 0]], uv, { emit: 0.72, tint: [1, 1, 1.05] });
    }
    // shop eave / awning
    if (style === 'hanok' || o.eave) {
      roof(child(m, 0, shopH + 0.05, 0.55), width / 2 + 0.2, 0.75, 0.35, { curl: 0.15, flare: 0.1, cellU: 2.2 });
    } else {
      const aw = o.awning === 'tarp' ? region('tarp') : region('awning');
      const aq = [[-width / 2 + 0.1, shopH - 0.35, 1.3], [width / 2 - 0.1, shopH - 0.35, 1.3], [width / 2 - 0.1, shopH + 0.05, 0.02], [-width / 2 + 0.1, shopH + 0.05, 0.02]];
      quad(b, m, aq, aw, { double: true, emit: 0.35 });
      quad(b, m, [[-width / 2 + 0.1, shopH - 0.62, 1.3], [width / 2 - 0.1, shopH - 0.62, 1.3], [width / 2 - 0.1, shopH - 0.35, 1.3], [-width / 2 + 0.1, shopH - 0.35, 1.3]], region(o.awning === 'tarp' ? 'tarp' : 'awning', 0, 0.8, 1, 1), { double: true, emit: 0.4 });
    }
    // roof
    if (style === 'hanok') {
      roof(child(m, 0, top - 0.1, -depth / 2 + 0.2), width / 2 + 0.55, depth / 2 + 1.0, 1.7, { curl: 0.5 });
    } else {
      box(b, child(m, 0, top, -depth / 2), width + 0.12, 0.35, depth + 0.12, { faces: { pz: dark, px: dark, nx: dark, nz: dark, py: region('sw_black') }, tint: [0.5, 0.5, 0.62] });
      if (o.billboard !== undefined) {
        const bm = child(m, 0, top + 0.35, -1.2);
        box(b, child(bm, -width * 0.3, 0, 0), 0.08, 1.2, 0.08, { uv: region('sw_metal') });
        box(b, child(bm, width * 0.3, 0, 0), 0.08, 1.2, 0.08, { uv: region('sw_metal') });
        quad(b, bm, [[-width * 0.36, 0.7, 0.05], [width * 0.36, 0.7, 0.05], [width * 0.36, 0.7 + width * 0.18, 0.05], [-width * 0.36, 0.7 + width * 0.18, 0.05]], region(`board${o.billboard}`), { emit: 1.05 });
        const p = new THREE.Vector3(0, 1.3, 0.4).applyMatrix4(bm);
        glow(p.x, p.y, p.z, width * 0.9, [0.35, 0.25, 0.18], { height: 1.4, flicker: false });
      } else if (rand() < 0.6) {
        lathe(b, child(m, R(-1, 1), top + 0.35, -depth * 0.6), [[0.55, 0], [0.55, 1.1], [0.2, 1.35], [0, 1.4]], 8, region('sw_metal'), { tint: [1.2, 1.2, 1.4] });
      }
    }
    // hanging lanterns under the eave
    const lanternCount = o.lanterns ?? (width > 5 ? 2 : 1);
    for (let i = 0; i < lanternCount; i++) {
      const lx = (i + 0.5) / lanternCount * (width - 1.4) - (width - 1.4) / 2;
      const p = new THREE.Vector3(lx, shopH - 0.55, 0.85).applyMatrix4(m);
      paperLantern(p.x, p.y, p.z, 0.2, Math.floor(rand() * 4), { light: i === 0, intensity: 0.8, radius: 5 });
    }
    if (o.sign !== undefined) neonSign(child(m, (width / 2 - 0.35) * (o.signSide ?? 1), shopH + 0.6, 0.75), o.sign, o.signHeight ?? 2.6);
    // window light spilling on the street
    const p = new THREE.Vector3(0, 1.4, 1.6).applyMatrix4(m);
    light(p.x, p.y, p.z, [1, 0.72, 0.45], 0.55, 6.5, { refl: 0.35 });
    const foot = new THREE.Vector3(0, 0, -depth / 2).applyMatrix4(m);
    shadow(new THREE.Vector3(0, 0, 0.35).applyMatrix4(m).x, new THREE.Vector3(0, 0, 0.35).applyMatrix4(m).z, width * 0.55, 0.45, 0.5, -Math.atan2(m.elements[8], m.elements[10]), 0.6);
    return { top, foot };
  }
  /** Pojangmacha: street cart under an orange tarp tent. Frame origin = cart front edge, +z to the street. */
  function stall(m, o = {}) {
    const z = new THREE.Vector3().setFromMatrixPosition(m).z;
    const b = B('props', z);
    const wood = region('wood'), metal = region('sw_metal'), tarp = region('tarp');
    const hw = o.halfWidth ?? 1.35;
    box(b, child(m, 0, 0, -0.5), hw * 2 - 0.3, 0.95, 1.0, { uv: wood, tint: [0.9, 0.75, 0.7], ao: 0.4, faces: { pz: wood, px: wood, nx: wood, nz: wood, py: null } });
    box(b, child(m, 0, 0.95, -0.45), hw * 2 - 0.1, 0.07, 1.2, { uv: region('sw_metal'), tint: [1.4, 1.3, 1.3] });
    // counter wares: pots, trays
    for (let i = 0; i < 3; i++) {
      const px = -hw + 0.6 + i * (hw * 2 - 1.2) / 2;
      if (i === 1) box(b, child(m, px, 1.02, -0.45), 0.7, 0.08, 0.45, { uv: region('sw_white'), tint: [0.9, 0.25, 0.18], emit: 0.4 });
      else lathe(b, child(m, px, 1.02, -0.5), [[0.26, 0], [0.28, 0.22], [0.26, 0.24]], 8, metal, { tint: [1.6, 1.5, 1.5] });
    }
    // poles + tarp tent
    const front = 0.35, back = -1.5, yF = 2.95, yB = 3.25;   // valance stays above the gameplay camera
    for (const s of [-1, 1]) for (const [pz, py] of [[front, yF], [back, yB]]) box(b, child(m, s * hw, 0, pz), 0.05, py, 0.05, { uv: metal });
    const tt = o.tarpTint || [1, 1, 1];
    quad(b, m, [[-hw - 0.1, yF, front + 0.1], [hw + 0.1, yF, front + 0.1], [hw + 0.1, yB, back - 0.05], [-hw - 0.1, yB, back - 0.05]], tarp, { double: true, emit: 0.28, tint: tt.map(v => v * 0.85) });
    quad(b, m, [[-hw - 0.1, yF - 0.4, front + 0.1], [hw + 0.1, yF - 0.4, front + 0.1], [hw + 0.1, yF, front + 0.1], [-hw - 0.1, yF, front + 0.1]], region('tarp', 0, 0.7, 1, 1), { double: true, emit: 0.35, tint: tt.map(v => v * 0.8) });
    quad(b, m, [[-hw, 0.95, back], [hw, 0.95, back], [hw, yB, back], [-hw, yB, back]], tarp, { double: true, emit: 0.35, tint: tt.map(v => v * 0.85) });
    for (const s of [-1, 1]) quad(b, m, [[s * hw, yF - 0.6, front], [s * hw, yB - 0.6, back], [s * hw, yB, back], [s * hw, yF, front]], tarp, { double: true, emit: 0.4, tint: tt });
    // menu board on the valance
    quad(b, m, [[-0.75, yF - 0.38, front + 0.13], [0.75, yF - 0.38, front + 0.13], [0.75, yF - 0.02, front + 0.13], [-0.75, yF - 0.02, front + 0.13]], region(`board${o.board ?? 1}`), { emit: 1 });
    // bulbs
    for (const s of [-0.6, 0.6]) {
      const p = new THREE.Vector3(s * hw, yF - 0.55, 0.0).applyMatrix4(m);
      glow(p.x, p.y, p.z, 1.1, [1.1, 0.6, 0.25]);
    }
    const p = new THREE.Vector3(0, 1.9, -0.2).applyMatrix4(m);
    light(p.x, p.y, p.z, [1, 0.6, 0.28], 1.25, 5.5, { refl: 0.9 });
    // stools + crates at the sides (never in front)
    for (const s of [-1, 1]) {
      if (rand() < 0.7) box(b, child(m, s * (hw + 0.45), 0, -0.6, R(0, 1)), 0.34, 0.45, 0.34, { uv: region('sw_white'), tint: pick([[0.9, 0.15, 0.15], [0.15, 0.35, 0.9], [0.95, 0.5, 0.1]]), ao: 0.5 });
      if (rand() < 0.6) box(b, child(m, s * (hw + 0.5), 0, -1.3, R(-0.3, 0.3)), 0.6, 0.45, 0.45, { uv: region('crate'), ao: 0.5 });
    }
    const c = new THREE.Vector3(0, 0, -0.5).applyMatrix4(m);
    shadow(c.x, c.z, hw + 0.5, 1.1, 0.6, -Math.atan2(m.elements[8], m.elements[10]), 0.5);
  }

  // ================================================================== 1. MARKET STREET
  const market = layout.segments[0];
  const marketMinZ = market.minZ, southEnd = market.maxZ + 16;
  // ground: one broad floor slab per chunk (lightmap does the lighting)
  function floorRect(x0, x1, z0, z1, y = 0) {   // z0 > z1
    const b = B('stone', (z0 + z1) / 2);
    const cellZ = 12;
    for (let z = z0; z > z1 + 1e-6; z -= cellZ) {
      const za = z, zb = Math.max(z1, z - cellZ);
      quad(B('stone', FAR), new THREE.Matrix4(), [[x0, y, za], [x1, y, za], [x1, y, zb], [x0, y, zb]], {}, {});
    }
    return b;
  }
  floorRect(-75, 75, southEnd, marketMinZ - 1);
  // gutter + raised sidewalk
  for (const side of [-1, 1]) {
    box(B('stone', -5), F(side * 8.95, 0, (southEnd + marketMinZ) / 2 - 0.5), 2.5, 0.14, southEnd - marketMinZ + 1, { uv: {}, faces: { py: {}, px: side < 0 ? {} : null, nx: side > 0 ? {} : null } });
    box(B('props', -5), F(side * 7.72, 0, (southEnd + marketMinZ) / 2 - 0.5), 0.1, 0.16, southEnd - marketMinZ + 1, { uv: region('stone'), tint: [0.8, 0.8, 0.9] });
  }
  // shop houses both sides
  const styles = ['modern', 'hanok', 'modern', 'hanok', 'modern', 'modern', 'hanok', 'modern'];
  for (const side of [-1, 1]) {
    let z = southEnd - 1;
    let i = side > 0 ? 1 : 0;
    while (z > marketMinZ + 1) {
      const width = Math.min(z - (marketMinZ + 0.5), R(5.2, 6.6));
      if (width < 3.5) break;
      const style = styles[i % styles.length];
      const m = F(side * (FRONT + (i % 3 === 1 ? 0.35 : 0)), 0, z - width / 2, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      building(m, width, {
        style, facade: (i * 3 + (side > 0 ? 1 : 0)) % 8, floors: style === 'hanok' ? 1 : 2 + (i % 2),
        sign: i % 2 === 0 ? (i / 2 + (side > 0 ? 3 : 0)) % 6 : undefined, signSide: i % 4 === 0 ? 1 : -1,
        billboard: style === 'modern' && i % 3 === 2 ? i % 3 === 2 ? (i % 2 ? 0 : 2) : undefined : undefined,
        awning: i % 2 ? 'tarp' : 'stripe',
      });
      z -= width + 0.05;
      i++;
    }
  }
  // pojangmacha stalls in front of the shops (outside the combat lane |x| ≤ 7)
  for (const side of [-1, 1]) {
    for (const z of side < 0 ? [-2.5, -11.5, -20.5] : [-6.5, -15.5, -24.5]) {
      stall(F(side * 7.85, 0.14, z, side < 0 ? Math.PI / 2 : -Math.PI / 2), { board: side < 0 ? 1 : 0, tarpTint: pick([[1, 1, 1], [1, 0.62, 0.62], [0.95, 0.85, 0.8]]) });
    }
  }
  // standing paper lanterns on posts along the curb (warm pools at the lane edges)
  for (const side of [-1, 1]) {
    for (const z of side < 0 ? [-7, -16, -25.5] : [-2.2, -11, -20]) {
      const x = side * 7.5;
      box(B('props', z), F(x, 0.14, z), 0.1, 1.55, 0.1, { uv: region('wood'), ao: 0.5, tint: [0.6, 0.5, 0.5] });
      box(B('props', z), F(x, 0.14, z), 0.34, 0.12, 0.34, { uv: region('stone'), ao: 0.5 });
      paperLantern(x, 1.95, z, 0.24, side < 0 ? 1 : 0, { tassel: false, intensity: 1.1, radius: 6, refl: 1.0, glowScale: 5 });
    }
  }
  // cloth banners hung from the upper floors (cutout, both faces)
  for (const side of [-1, 1]) {
    for (const z of side < 0 ? [-4.5, -18.8] : [-9.8, -23.5]) {
      const x = side * (FRONT - 0.15);
      box(B('props', z), F(x - side * 0.45, 7.35, z), 0.9, 0.05, 0.05, { uv: region('sw_gold') });
      banner(F(x - side * 0.45, 7.3, z, Math.PI / 2), (side > 0 ? 1 : 0) + (z < -15 ? 1 : 0), 2.8, 0.75);
    }
  }
  // faint engraved medallion in the street (as in the concept board) and scattered petals at the lane edges
  {
    const mz = -14.5, rad = 4.6, uv = region('medallion');
    for (let q = 0; q < 4; q++) {
      const sx = q % 2 ? -1 : 1, sz = q < 2 ? 1 : -1;
      const c = [[0, 0.012, 0], [sx * rad, 0.012, 0], [sx * rad, 0.012, sz * rad], [0, 0.012, sz * rad]];
      decal(F(0, 0, mz), c, uv, [0.03, 0.016, 0.06], [[uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0], [uv.u0, uv.v0]]);
    }
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1, px = side * R(4.8, 7.1), pz = R(-28, 1), sz = R(1.0, 1.8);
      quad(B('cutout', pz), F(px, 0.01, pz, R(0, TAU)), [[-sz / 2, 0, sz / 2], [sz / 2, 0, sz / 2], [sz / 2, 0, -sz / 2], [-sz / 2, 0, -sz / 2]], region('petals'), { emit: 0.35, tint: [0.85, 0.75, 0.85] });
    }
  }
  // lantern strings across the street
  for (let z = 1; z > marketMinZ + 1; z -= 5.5) lanternString(-FRONT + 0.2, FRONT - 0.2, z, 5.1, 0.75, 7, { dz: R(-1.2, 1.2) });
  // entrance arch behind the start (seen when turning back)
  {
    const zA = market.maxZ + 4.5;
    for (const s of [-1, 1]) {
      box(B('props', zA), F(s * 7.6, 0.14, zA), 0.5, 5.4, 0.5, { uv: region('lacquer'), ao: 0.5 });
      box(B('props', zA), F(s * 7.6, 0.14, zA), 0.8, 0.5, 0.8, { uv: region('stone'), ao: 0.5 });
    }
    box(B('props', zA), F(0, 5.3, zA), 16.4, 0.5, 0.6, { faces: { pz: region('dancheong'), nz: region('dancheong'), py: region('wood'), ny: region('wood') }, cells: [3.2, 0.5] });
    roof(F(0, 5.8, zA), 8.6, 1.2, 0.8, { curl: 0.35 });
    quad(B('props', zA), F(0, 4.0, zA - 0.32, Math.PI), [[-1.6, 0, 0], [1.6, 0, 0], [1.6, 0.8, 0], [-1.6, 0.8, 0]], region('board0'), { emit: 1, double: true });
    for (const s of [-1, 1]) paperLantern(s * 5.5, 4.4, zA, 0.34, 0, { intensity: 1.0, radius: 7 });
  }
  // closing buildings far south (behind the arch)
  for (const x of [-7.5, 0, 7.5]) building(F(x, 0, southEnd + 0.5, Math.PI), 7.4, { style: x ? 'modern' : 'hanok', facade: x < 0 ? 5 : x > 0 ? 2 : 7, floors: 2, lanterns: 2 });
  // breakables stand-ins are dynamic (see below); a few static crates / jars at the sidewalk edge
  for (const [x, z] of [[-8.2, 3.5], [8.3, -1.2], [-8.4, -16.2], [8.4, -20.6], [-8.3, -26.2]]) {
    box(B('props', z), F(x, 0.14, z, R(-0.3, 0.3)), 0.62, 0.5, 0.5, { uv: region('crate'), ao: 0.5 });
    if (rand() < 0.6) box(B('props', z), F(x + R(-0.1, 0.1), 0.64, z, R(-0.4, 0.4)), 0.5, 0.42, 0.42, { uv: region('crate'), ao: 0.7 });
    shadow(x, z, 0.6, 0.5, 0.5);
  }
  // blossom trees framing the plaza mouth
  blossomTree(-8.9, -28.4, { y: 0.14 });
  blossomTree(8.9, -28.6, { y: 0.14, scale: 1.1 });

  // ================================================================== 2. PLAZA
  const plaza = layout.segments[1];
  const P = { x: plaza.cx, z: plaza.cz, r: plaza.r };
  floorRect(-75, 75, marketMinZ - 1, plaza.minZ - 2.5);
  // medallion (additive rune ring) around the fountain
  {
    const f = layout.fountain;
    const rad = f.r + 4.2;
    const uv = region('medallion');
    for (let q = 0; q < 4; q++) {
      const sx = q % 2 ? -1 : 1, sz = q < 2 ? 1 : -1;
      const c = [[0, 0.015, 0], [sx * rad, 0.015, 0], [sx * rad, 0.015, sz * rad], [0, 0.015, sz * rad]];
      const uvs = [[uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0], [uv.u0, uv.v0]];
      const flip = sx * sz < 0;
      decal(F(f.x, 0, f.z), flip ? [c[1], c[0], c[3], c[2]] : c, uv, [0.026, 0.011, 0.05], flip ? [uvs[1], uvs[0], uvs[3], uvs[2]] : uvs);
    }
  }
  // low ring wall / planters with the market and stairs openings
  {
    const ringR = P.r + 0.9;
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
      const x = P.x + Math.cos(am) * ringR, z = P.z + Math.sin(am) * ringR;
      if (z > P.z && Math.abs(x) < 7.4) continue;                 // market mouth
      if (z < plaza.minZ + 3 && Math.abs(x) < 9.2) continue;      // stairs mouth
      const len = ringR * (a1 - a0) + 0.02;
      box(B('stone', z), F(x, 0, z, -am + Math.PI / 2), len, 0.5, 0.6, { uv: {}, faces: { pz: {}, nz: {}, py: {} } });
      if (i % 4 === 0) {
        const px = P.x + Math.cos(am) * (ringR + 0.9), pz = P.z + Math.sin(am) * (ringR + 0.9);
        // planter box with shrubs (blossom cards tinted green-dark would read odd; keep flowers)
        box(B('props', pz), F(px, 0, pz, -am), 1.1, 0.55, 1.1, { uv: region('wood'), ao: 0.5 });
      }
    }
  }
  // fountain: octagonal basin, water, two-tier column with a glowing finial
  const fountainParts = (() => {
    const f = layout.fountain;
    const b = B('props', f.z), st = region('stone');
    lathe(b, F(f.x, 0, f.z, Math.PI / 8), [[f.r + 0.1, 0], [f.r + 0.12, 0.1], [f.r, 0.18], [f.r, 0.52], [f.r + 0.14, 0.58], [f.r + 0.14, 0.7], [f.r - 0.3, 0.7], [f.r - 0.3, 0.45]], 8, st, { ao: 0.45, aoHeight: 0.4, tint: [0.95, 0.95, 1.05] });
    lathe(b, F(f.x, 0.4, f.z, Math.PI / 8), [[0.5, 0], [0.42, 0.6], [0.3, 1.1], [0.35, 1.3]], 8, st);
    lathe(b, F(f.x, 1.65, f.z, Math.PI / 8), [[0.3, 0], [1.3, 0.18], [1.4, 0.3], [1.2, 0.34], [0.3, 0.3]], 8, st, { tint: [1, 1, 1.1] });
    lathe(b, F(f.x, 1.95, f.z, Math.PI / 8), [[0.28, 0], [0.22, 0.6], [0.16, 0.8]], 8, st);
    lathe(b, F(f.x, 2.7, f.z, Math.PI / 8), [[0.16, 0], [0.7, 0.12], [0.75, 0.2], [0.6, 0.24], [0.16, 0.2]], 8, st, { tint: [1, 1, 1.1] });
    lathe(b, F(f.x, 2.9, f.z), [[0.12, 0], [0.24, 0.18], [0.18, 0.4], [0, 0.55]], 8, region('sw_white'), { emit: 1, tint: [0.5, 1.2, 1.3] });
    // carved relief band around the basin
    const band = region('balustrade', 0.08, 0.17, 0.92, 0.82);
    for (let i = 0; i < 8; i++) {
      const a0 = (i + 0.5) / 8 * TAU, a1 = (i + 1.5) / 8 * TAU;
      const rr = f.r + 0.005;
      const p0 = [Math.cos(a0) * rr, Math.sin(a0) * rr], p1 = [Math.cos(a1) * rr, Math.sin(a1) * rr];
      quad(b, F(f.x, 0, f.z), [[p1[0], 0.2, p1[1]], [p0[0], 0.2, p0[1]], [p0[0], 0.5, p0[1]], [p1[0], 0.5, p1[1]]], band, { tint: [0.8, 0.8, 0.95], ao: [0.7, 0.7, 1, 1] });
    }
    // falling water: additive streak sheets from the bowls
    const sheet = (r, y0, y1, k) => {
      for (let i = 0; i < 12; i++) {
        const a0 = i / 12 * TAU, a1 = (i + 1) / 12 * TAU;
        const c = [[Math.cos(a1) * r, y0, Math.sin(a1) * r], [Math.cos(a0) * r, y0, Math.sin(a0) * r], [Math.cos(a0) * r, y1, Math.sin(a0) * r], [Math.cos(a1) * r, y1, Math.sin(a1) * r]];
        decal(F(f.x, 0, f.z), c, region('streaks'), [0.1 * k, 0.32 * k, 0.36 * k]);
      }
    };
    sheet(1.36, 0.55, 1.92, 1);
    sheet(0.72, 1.95, 2.9, 0.8);
    glow(f.x, 3.2, f.z, 2.6, [0.12, 0.45, 0.5]);
    light(f.x, 2.2, f.z, TEAL, 1.0, 9, { refl: 0.8 });
    shadow(f.x, f.z, f.r + 0.9, f.r + 0.9, 0.5, 0, 0.5);
    return f;
  })();
  // stalls and shop houses around the plaza
  {
    const ring = [];
    for (let a = -30; a <= 34; a += 16) ring.push(a);
    for (let a = 146; a <= 210; a += 16) ring.push(a);
    ring.forEach((deg, i) => {
      const a = deg * Math.PI / 180;
      const r = 19.5 + (i % 2) * 0.6;
      const x = P.x + Math.cos(a) * r, z = P.z - Math.sin(a) * r;
      const yaw = Math.atan2(P.x - x, P.z - z);     // local +z → centre
      building(F(x, 0, z, yaw), 5.8, { style: i % 3 === 1 ? 'modern' : 'hanok', facade: (i * 5 + 2) % 8, floors: i % 3 === 1 ? 2 : 1, sign: i % 3 === 1 ? (i + 1) % 6 : undefined, eave: i % 3 === 1, lanterns: 2 });
      if (i % 2 === 0) {
        const sr = 15.4;
        const a2 = a + (i % 4 === 0 ? 0.12 : -0.12);
        const sx = P.x + Math.cos(a2) * sr, sz = P.z - Math.sin(a2) * sr;
        stall(F(sx, 0, sz, Math.atan2(P.x - sx, P.z - sz)), { board: i % 3 === 0 ? 1 : 0, halfWidth: 1.2 });
      } else {
        const tr = 16.2, tx = P.x + Math.cos(a) * tr, tz = P.z - Math.sin(a) * tr;
        blossomTree(tx, tz, { scale: 1.05 });
      }
    });
    // lantern strings across the plaza (high, over the ring)
    lanternString(-17, 17, -36.5, 5.8, 1.0, 11, { dz: -3 });
    lanternString(-17, 17, -45.5, 5.8, 1.0, 11, { dz: 2.5 });
    // stone lanterns at the two mouths
    for (const s of [-1, 1]) { stoneLantern(s * 8.2, -30.6); stoneLantern(s * 9.6, plaza.minZ + 0.2); }
  }

  // ================================================================== 3. STAIRS
  const stairs = layout.segments[2];
  const S = layout.stairs;
  const HALF = 8.6;
  floorRect(-75, 75, plaza.minZ - 2.5, -86);
  {
    const stairKind = 'stone';
    // flights (steps) — tread height follows heightAt at the step centre
    for (const ramp of S.ramps) {
      const n = Math.max(1, Math.round((ramp.h1 - ramp.h0) / 0.15));
      const dz = (ramp.z0 - ramp.z1) / n;
      for (let k = 0; k < n; k++) {
        const zc = ramp.z0 - (k + 0.5) * dz;
        const top = heightAt(0, zc);
        const halfW = ramp.z1 <= -84 ? 8.6 : HALF;
        box(B(stairKind, zc), F(0, 0, zc), halfW * 2, top, dz + 0.002, { uv: {}, faces: { pz: {}, py: {}, px: {}, nx: {} } });
        // nosing highlight strip (props: catches light, reads as a step edge)
        box(B('props', zc), F(0, top - 0.035, zc + dz / 2 - 0.02), halfW * 2 - 0.05, 0.04, 0.05, { uv: region('stone'), tint: [1.25, 1.25, 1.4] });
      }
    }
    // carved centre slabs (dapdo) on the tall flights: they follow the linear ramp exactly
    for (const ramp of S.ramps) {
      if (ramp.h1 - ramp.h0 < 1) continue;
      const hw = 1.25;
      const m = new THREE.Matrix4();
      const y0 = ramp.h0 + 0.03, y1 = ramp.h1 + 0.03;
      for (const half of [0, 1]) {
        const uv = region('dapdo', half * 0.5, 0, half * 0.5 + 0.5, 1);
        const xa = half ? 0 : -hw, xb = half ? hw : 0;
        // panel long axis (u) runs up the slope, v across
        quad(B('props', ramp.z0), m, [[xa, y0, ramp.z0], [xb, y0, ramp.z0], [xb, y1, ramp.z1], [xa, y1, ramp.z1]], uv,
          { tint: [0.9, 0.88, 1.0], uvs: [[uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0]] });
      }
      for (const sx of [-1, 1]) {   // sloped curbs either side of the slab
        const xa = sx * hw, xb = sx * (hw + 0.3), top = 0.16;
        const pb = B('props', ramp.z0), st = region('stone'), tint = [0.62, 0.62, 0.74];
        quadUp(pb, m, [[xa, y0 + top, ramp.z0], [xb, y0 + top, ramp.z0], [xb, y1 + top, ramp.z1], [xa, y1 + top, ramp.z1]], [0, 1, 0], st, { tint });
        for (const x of [xa, xb]) quadUp(pb, m, [[x, ramp.h0 - 0.2, ramp.z0], [x, ramp.h1 - 0.2, ramp.z1], [x, y1 + top, ramp.z1], [x, y0 + top, ramp.z0]], [x === xa ? -sx : sx, 0, 0], st, { tint, ao: [0.6, 0.6, 1, 1] });
        quadUp(pb, m, [[xa, 0, ramp.z0], [xb, 0, ramp.z0], [xb, y0 + top, ramp.z0], [xa, y0 + top, ramp.z0]], [0, 0, 1], st, { tint });
      }
    }
    // tiers (flat terraces)
    for (const tier of S.tiers) {
      const zc = (tier.minZ + tier.maxZ) / 2, len = tier.maxZ - tier.minZ;
      box(B(stairKind, zc), F(0, 0, zc), HALF * 2, tier.height, len + 0.002, { uv: {}, faces: { py: {}, px: {}, nx: {} } });
    }
    // side stairs (enemy entries) dropping outward on the middle tier
    const ss = S.sideStairs;
    const n = Math.round((heightAt(0, (ss.minZ + ss.maxZ) / 2)) / 0.15);
    const dx = (ss.toX - ss.fromX) / n;
    for (const side of [-1, 1]) {
      for (let k = 0; k < n; k++) {
        const xc = side * (ss.fromX + (k + 0.5) * dx);
        const top = heightAt(xc, (ss.minZ + ss.maxZ) / 2);
        box(B(stairKind, -67), F(xc, 0, (ss.minZ + ss.maxZ) / 2), dx + 0.002, top, ss.maxZ - ss.minZ, { uv: {}, faces: { py: {}, pz: {}, nz: {}, [side > 0 ? 'px' : 'nx']: {} } });
      }
      // cheek walls along the side stairs
      for (const zw of [ss.maxZ + 0.2, ss.minZ - 0.2]) {
        const x0 = side * ss.fromX, x1 = side * ss.toX;
        const m = new THREE.Matrix4();
        const h0 = heightAt(x0, (ss.minZ + ss.maxZ) / 2) + 0.55, h1 = 0.5;
        const q = [[x0, 0, zw], [x1, 0, zw], [x1, h1, zw], [x0, h0, zw]];
        for (const face of [q, [q[1], q[0], q[3], q[2]]]) quad(B(stairKind, -67), m, face, {}, {});
        quadUp(B(stairKind, -67), m, [[x0, h0, zw - 0.2], [x1, h1, zw - 0.2], [x1, h1, zw + 0.2], [x0, h0, zw + 0.2]], [0, 1, 0]);
      }
      stoneLantern(side * (ss.toX + 0.8), ss.maxZ + 0.9, 0, 1.0);
      stoneLantern(side * (ss.toX + 0.8), ss.minZ - 0.9, 0, 1.0);
    }
    // balustrades along both edges (gaps at the side stairs)
    const rail = (side, z0, z1) => {
      const len = z0 - z1;
      const posts = Math.max(1, Math.round(len / 2));
      const x = side * 8.4;
      const b = B('props', (z0 + z1) / 2);
      for (let i = 0; i <= posts; i++) {
        const z = z0 - i / posts * len, y = heightAt(side * 7.9, z);
        box(b, F(x, y, z), 0.26, 1.0, 0.26, { uv: region('stone'), ao: 0.55, tint: [0.95, 0.95, 1.05] });
        if (i % 2 === 1) {   // small lantern cap on every other post: warm rhythm along the procession
          box(b, F(x, y + 1.0, z), 0.2, 0.26, 0.2, { uv: region('sw_paper'), emit: 1, tint: [1.2, 0.75, 0.4] });
          lathe(b, F(x, y + 1.26, z, Math.PI / 4), [[0.2, 0], [0.08, 0.14], [0, 0.18]], 4, region('stone'), { tint: [0.5, 0.5, 0.6] });
          glow(x, y + 1.13, z, 0.9, [0.8, 0.45, 0.2]);
          light(x - side * 0.3, y + 1.1, z, AMBER, 0.55, 4, { refl: 0.35 });
        } else lathe(b, F(x, y + 1.0, z), [[0.15, 0], [0.18, 0.08], [0.1, 0.2], [0, 0.3]], 6, region('stone'), { tint: [1.05, 1.05, 1.15] });
        if (i === posts) break;
        const zn = z0 - (i + 1) / posts * len, yn = heightAt(side * 7.9, zn);
        const zm = (z + zn) / 2;
        // top rail and carved panel (both faces)
        const m = new THREE.Matrix4();
        const qTop = [[x - 0.07, y + 0.86, z - 0.13], [x - 0.07, yn + 0.86, zn + 0.13], [x - 0.07, yn + 0.96, zn + 0.13], [x - 0.07, y + 0.96, z - 0.13]];
        for (const s2 of [-1, 1]) {
          const q = qTop.map(p => [x + s2 * 0.07, p[1], p[2]]);
          quad(b, m, s2 > 0 ? [q[1], q[0], q[3], q[2]] : q, region('stone'), { tint: [1.05, 1.05, 1.15] });
          const pq = [[x, y + 0.12, z - 0.13], [x, yn + 0.12, zn + 0.13], [x, yn + 0.84, zn + 0.13], [x, y + 0.84, z - 0.13]].map(p => [x + s2 * 0.04, p[1], p[2]]);
          quad(b, m, s2 > 0 ? [pq[1], pq[0], pq[3], pq[2]] : pq, region('balustrade'), { ao: [0.6, 0.6, 1, 1] });
        }
        quad(b, m, [[x - 0.07, y + 0.96, z - 0.13], [x + 0.07, y + 0.96, z - 0.13], [x + 0.07, yn + 0.96, zn + 0.13], [x - 0.07, yn + 0.96, zn + 0.13]].reverse(), region('stone'), { tint: [1.2, 1.2, 1.3] });
        void zm;
      }
    };
    for (const side of [-1, 1]) {
      rail(side, stairs.maxZ - 1.2, ss.maxZ - 0.1);
      rail(side, ss.minZ + 0.1, stairs.minZ + 0.2);
    }
    // stone lanterns at tier corners (outside the lane) and banner poles lining the procession
    for (const side of [-1, 1]) {
      for (const z of [-55.5, -75.5, -81]) stoneLantern(side * 9.35, z, heightAt(side * 7.9, z), 0.95);
      for (const z of [-57.5, -77.5]) {
        const x = side * 9.4, y = 0;
        box(B('props', z), F(x, y, z), 0.16, 8.2, 0.16, { uv: region('lacquer'), ao: 0.5 });
        box(B('props', z), F(x - side * 0.5, y + 7.9, z), 1.2, 0.08, 0.08, { uv: region('sw_gold'), tint: [1.2, 1.2, 1.2] });
        banner(F(x - side * 0.5, y + 7.85, z, side * Math.PI / 2), (z === -57.5 ? 0 : 1) + (side > 0 ? 1 : 0), 4.6, 0.95);
        glow(x - side * 0.5, y + 6, z, 1.6, [0.25, 0.12, 0.4], { flicker: false });
      }
    }
    // soul-lamp pedestal (flame is dynamic)
    const lamp = layout.lamp, ly = heightAt(lamp.x, lamp.z);
    lathe(B('props', lamp.z), F(lamp.x, ly, lamp.z, Math.PI / 8), [[lamp.r + 0.25, 0], [lamp.r + 0.25, 0.14], [lamp.r, 0.22], [lamp.r * 0.72, 0.5], [lamp.r * 0.72, 0.62], [lamp.r * 0.95, 0.72], [lamp.r * 0.95, 0.8], [lamp.r * 0.5, 0.84]], 8, region('stone'), { ao: 0.5, aoHeight: 0.3, tint: [1, 1, 1.1] });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      box(B('props', lamp.z), F(lamp.x + Math.cos(a) * lamp.r * 0.74, ly + 0.28, lamp.z + Math.sin(a) * lamp.r * 0.74, -a), 0.04, 0.26, 0.2, { uv: region('sw_white'), emit: 1, tint: [0.3, 1.1, 1.0] });
    }
    shadow(lamp.x, lamp.z, lamp.r + 0.6, lamp.r + 0.6, 0.55);
    // courtyard houses flanking the stairs (ground level, facing the stairs)
    for (const side of [-1, 1]) {
      let z = -54;
      let i = 0;
      while (z > -86) {
        const width = R(6, 7.2);
        const x = side * (17.5 + (i % 2) * 0.8);
        building(F(x, 0, z - width / 2, side < 0 ? Math.PI / 2 : -Math.PI / 2), width, { style: i % 3 === 2 ? 'modern' : 'hanok', facade: (i * 3 + (side > 0 ? 4 : 1)) % 8, floors: 1, lanterns: 2, sign: i % 3 === 2 ? (i + 2) % 6 : undefined });
        z -= width + 0.4;
        i++;
      }
      blossomTree(side * 13.8, -58.5, { scale: 1.15 });
      blossomTree(side * 14.2, -77.5, { scale: 1.2 });
      blossomTree(side * 13.4, -84.5, { scale: 1.0 });
    }
  }

  // ================================================================== 4. TOP PLATFORM + SOUL GATE
  const topSeg = layout.segments[3];
  const TOPY = S.topHeight;
  floorRect(-75, 75, -86, -165);
  {
    const T = { x: topSeg.cx, z: topSeg.cz, r: topSeg.r + 0.6 };
    const b = B('stone', T.z);
    const n = 48;
    // platform disc (clipped to z ≤ -84 so it never covers the last flight) + retaining wall
    const clipZ = S.ramps[S.ramps.length - 1].z1;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      pts.push([T.x + Math.cos(a) * T.r, Math.min(clipZ, T.z + Math.sin(a) * T.r)]);
    }
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[i + 1];
      quadUp(b, m, [[T.x, TOPY, T.z], [p[0], TOPY, p[1]], [q[0], TOPY, q[1]], [q[0], TOPY, q[1]]], [0, 1, 0]);
      const mx = (p[0] + q[0]) / 2 - T.x, mz = (p[1] + q[1]) / 2 - T.z;
      if (p[1] < clipZ - 0.01 || q[1] < clipZ - 0.01) quadUp(b, m, [[p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], TOPY, q[1]], [p[0], TOPY, p[1]]], [mx, 0, mz]);
    }
    // landing between the last flight and the disc (fills the corner notches)
    box(b, F(0, 0, clipZ - 2), HALF * 2, TOPY, 4, { uv: {}, faces: { py: {}, px: {}, nx: {} } });
    // gate foundation behind the platform
    const gz = layout.soulGate.z;
    box(b, F(0, 0, gz - 1.2), 17, TOPY + 0.01, 5.5, { uv: {}, faces: { py: {}, px: {}, nx: {}, nz: {} } });
    // engraved seal on the platform (additive)
    const uv = region('medallion'), rad = T.r - 2.2;
    for (let q = 0; q < 4; q++) {
      const sx = q % 2 ? -1 : 1, sz = q < 2 ? 1 : -1;
      const c = [[0, TOPY + 0.015, 0], [sx * rad, TOPY + 0.015, 0], [sx * rad, TOPY + 0.015, sz * rad], [0, TOPY + 0.015, sz * rad]];
      const uvs = [[uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0], [uv.u0, uv.v0]];
      const flip = sx * sz < 0;
      decal(F(T.x, 0, T.z), flip ? [c[1], c[0], c[3], c[2]] : c, uv, [0.02, 0.008, 0.04], flip ? [uvs[1], uvs[0], uvs[3], uvs[2]] : uvs);
    }
    // balustrade ring (opening toward the stairs)
    const pb = B('props', T.z);
    const posts = 36;
    for (let i = 0; i < posts; i++) {
      const a = i / posts * TAU, a2 = (i + 1) / posts * TAU;
      const x = T.x + Math.cos(a) * (T.r - 0.25), z = T.z + Math.sin(a) * (T.r - 0.25);
      const x2 = T.x + Math.cos(a2) * (T.r - 0.25), z2 = T.z + Math.sin(a2) * (T.r - 0.25);
      if (z > clipZ - 3.2 || z2 > clipZ - 3.2) continue;
      if (z < gz + 1.6 && Math.abs(x) < 7.5) continue;
      box(pb, F(x, TOPY, z, -a), 0.26, 1.0, 0.26, { uv: region('stone'), ao: 0.55 });
      lathe(pb, F(x, TOPY + 1.0, z), [[0.15, 0], [0.18, 0.08], [0.1, 0.2], [0, 0.3]], 6, region('stone'));
      if (z2 < gz + 1.6 && Math.abs(x2) < 7.5) continue;
      const mx = (x + x2) / 2, mz = (z + z2) / 2, len = Math.hypot(x2 - x, z2 - z) - 0.26;
      const yaw = Math.atan2(x2 - x, z2 - z) - Math.PI / 2;
      box(pb, F(mx, TOPY + 0.86, mz, yaw), len, 0.1, 0.14, { uv: region('stone'), tint: [1.1, 1.1, 1.2] });
      quad(pb, F(mx, TOPY, mz, yaw), [[-len / 2, 0.12, 0.04], [len / 2, 0.12, 0.04], [len / 2, 0.84, 0.04], [-len / 2, 0.84, 0.04]], region('balustrade'), { double: true, ao: [0.6, 0.6, 1, 1] });
    }
    // braziers (stone lanterns) around the arena edge
    for (const deg of [35, 145, 215, 325]) {
      const a = deg * Math.PI / 180;
      stoneLantern(T.x + Math.cos(a) * (T.r + 0.9), T.z + Math.sin(a) * (T.r + 0.9), TOPY, 1.2);
    }
    for (const s of [-1, 1]) stoneLantern(s * 7.2, clipZ - 1.3, TOPY, 1.0);

    // ---- the soul gate (three bays, red lacquer, dancheong, tiled roofs) ----
    const G = layout.soulGate;
    const gb = B('props', gz);
    const inner = G.halfWidth, outer = G.halfWidth + 3.3;
    const lintel = G.height - 0.9;
    for (const s of [-1, 1]) {
      // main pillars
      box(gb, F(s * inner, TOPY, gz), 1.5, 1.1, 1.5, { uv: region('stone'), ao: 0.5, tint: [0.8, 0.8, 0.9] });
      lathe(gb, F(s * inner, TOPY + 1.1, gz), [[0.52, 0], [0.48, lintel - TOPY - 1.1]], 12, region('lacquer'), { uRepeat: 3, vByY: true, tint: [1.05, 0.95, 0.95] });
      // side bay pillars
      box(gb, F(s * outer, TOPY, gz), 1.1, 0.8, 1.1, { uv: region('stone'), ao: 0.5, tint: [0.8, 0.8, 0.9] });
      lathe(gb, F(s * outer, TOPY + 0.8, gz), [[0.36, 0], [0.33, 5.6]], 10, region('lacquer'), { uRepeat: 2, vByY: true });
      // side bay beams + roof
      box(gb, F(s * (inner + outer) / 2, TOPY + 6.2, gz), outer - inner + 0.9, 0.55, 0.7, { faces: { pz: region('dancheong'), nz: region('dancheong'), py: region('wood'), ny: region('wood') }, cells: [1.8, 0.55] });
      roof(F(s * (inner + outer) / 2 + s * 0.3, TOPY + 6.9, gz), (outer - inner) / 2 + 1.1, 2.0, 1.1, { curl: 0.55 });
      // banners in the side bays
      banner(F(s * (inner + outer) / 2, TOPY + 5.9, gz + 0.3), s < 0 ? 0 : 2, 4.6, 1.5);
      glow(s * (inner + outer) / 2, TOPY + 3.5, gz + 0.8, 3.5, [0.2, 0.1, 0.35], { flicker: false, height: 5 });
      // guardian stone lanterns at the foot
      stoneLantern(s * (outer + 1.6), gz + 1.6, TOPY, 1.35);
    }
    // main lintels + plaque
    box(gb, F(0, lintel, gz), inner * 2 + 1.6, 0.8, 0.95, { faces: { pz: region('dancheong'), nz: region('dancheong'), py: region('wood'), ny: region('wood'), px: region('wood'), nx: region('wood') }, cells: [2.4, 0.8] });
    box(gb, F(0, lintel - 0.55, gz), inner * 2, 0.4, 0.7, { faces: { pz: region('dancheong'), nz: region('dancheong'), ny: region('wood') }, cells: [2.4, 0.4], tint: [0.9, 0.9, 0.9] });
    roof(F(0, lintel + 0.8, gz), inner + 2.6, 2.6, 1.8, { curl: 0.8, flare: 0.5 });
    quad(gb, F(0, lintel - 0.05, gz + 0.5), [[-1.1, 0, 0], [1.1, 0, 0], [1.1, 1.05, 0], [-1.1, 1.05, 0]], region('plaque'), { emit: 0.9 });
    // carved stone ring framing the portal (torus built from quads) + gold inner lip
    const ring = (radius, tube, segs, sides, uv, tint, emit = 0) => {
      const m = F(0, G.portalY, gz);
      for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
        const P2 = (a, b2) => [(radius + tube * Math.cos(b2)) * Math.cos(a), (radius + tube * Math.cos(b2)) * Math.sin(a), tube * Math.sin(b2)];
        const a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU, b0 = j / sides * TAU, b1 = (j + 1) / sides * TAU;
        quad(gb, m, [P2(a0, b0), P2(a1, b0), P2(a1, b1), P2(a0, b1)].reverse(), uv, { tint, emit });
      }
    };
    ring(G.portalRadius + 0.22, 0.26, 32, 6, region('stone'), [0.55, 0.52, 0.66]);
    ring(G.portalRadius + 0.02, 0.07, 32, 4, region('sw_gold'), [1.1, 1.0, 0.9], 0.6);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      box(gb, F(Math.cos(a) * (G.portalRadius + 0.24), G.portalY + Math.sin(a) * (G.portalRadius + 0.24), gz + 0.05, 0, 0, a), 0.34, 0.34, 0.62, { uv: region('sw_gold'), tint: [0.9, 0.75, 0.55] });
    }
    // portal pedestal steps
    box(B('stone', gz), F(0, TOPY, gz + 0.2), 7.2, 0.25, 2.2, { faces: { py: {}, pz: {}, px: {}, nx: {} } });
    // violet trim lines on the pillars facing the platform
    for (const s of [-1, 1]) glow(s * inner, (TOPY + lintel) / 2, gz + 0.9, 1.1, [0.25, 0.1, 0.45], { height: lintel - TOPY, flicker: false });
    light(0, G.portalY, gz + 1.5, VIOLET, 2.4, 22, { refl: 1.2, pool: 1.3 });
    for (const s of [-1, 1]) blossomTree(s * 13, gz - 1.5, { scale: 1.35, y: 0 });
  }

  // ================================================================== distant city blocks (skyline depth)
  {
    const blocks = [];
    for (let i = 0; i < 46; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 16 - (i / 46) * 150 + R(-3, 3);
      const x = side * R(58, 80);
      blocks.push([x, z]);
    }
    for (let i = 0; i < 8; i++) blocks.push([(i % 2 ? 1 : -1) * R(55, 85), R(-175, -150)]);
    for (let i = 0; i < 6; i++) blocks.push([R(-40, 40), R(58, 70)]);
    for (const [x, z] of blocks) {
      const w = R(10, 18), d = R(10, 18), h = R(10, 30);
      const b = B('props', FAR);
      box(b, F(x, 0, z, R(-0.2, 0.2)), w, h, d, { uv: region('tower'), cells: [6, 12], emit: 0.75, tint: [1.1, 1.05, 1.2], faces: { pz: region('tower'), nz: region('tower'), px: region('tower'), nx: region('tower'), py: region('sw_black') } });
      if (rand() < 0.25) glow(x, h + 0.8, z, 2.2, [1.2, 0.25, 0.3], { flicker: false, far: true });
    }
  }

  timing.geometry = performance.now();
  // ================================================================== bake lighting + build meshes
  const root = new THREE.Group();
  root.name = 'march-art';
  scene.add(root);
  const geometries = [], materials = [];
  const lightGrid = new Map();
  const CELL = 8;
  for (const L of lights) {
    const x0 = Math.floor((L.x - L.r) / CELL), x1 = Math.floor((L.x + L.r) / CELL);
    const z0 = Math.floor((L.z - L.r) / CELL), z1 = Math.floor((L.z + L.r) / CELL);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const key = gx * 1000 + gz;
      if (!lightGrid.has(key)) lightGrid.set(key, []);
      lightGrid.get(key).push(L);
    }
  }
  function lightAt(px, py, pz, nx, ny, nz, out) {
    const t = ny * 0.5 + 0.5;
    let r = AMB_GROUND[0] + (AMB_SKY[0] - AMB_GROUND[0]) * t, g = AMB_GROUND[1] + (AMB_SKY[1] - AMB_GROUND[1]) * t, b = AMB_GROUND[2] + (AMB_SKY[2] - AMB_GROUND[2]) * t;
    const moon = Math.max(0, nx * MOON.dir[0] + ny * MOON.dir[1] + nz * MOON.dir[2]);
    r += MOON.color[0] * moon; g += MOON.color[1] * moon; b += MOON.color[2] * moon;
    const list = lightGrid.get(Math.floor(px / CELL) * 1000 + Math.floor(pz / CELL));
    if (list) for (const L of list) {
      const dx = L.x - px, dy = L.y - py, dz = L.z - pz, d = Math.hypot(dx, dy, dz);
      if (d >= L.r) continue;
      const att = (1 - d / L.r) ** 2 * L.i;
      const ndl = d > 1e-4 ? (nx * dx + ny * dy + nz * dz) / d : 1;
      const k = att * Math.max(0, ndl * 0.65 + 0.35);
      r += L.c[0] * k; g += L.c[1] * k; b += L.c[2] * k;
    }
    out[0] = r; out[1] = g; out[2] = b;
  }
  const lightTmp = [0, 0, 0];
  let triangles = 0;
  const staticMeshes = [];
  function buildMesh(builder, material, name) {
    if (!builder.count) return null;
    const count = builder.count;
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const emit = builder.fx[i * 2], ao = builder.fx[i * 2 + 1];
      const nx = builder.nrm[i * 3], ny = builder.nrm[i * 3 + 1], nz = builder.nrm[i * 3 + 2];
      if (builder.kind === 'glow' || (builder.kind === 'stone' && ny > 0.7)) { lightTmp[0] = lightTmp[1] = lightTmp[2] = 1; }
      else lightAt(builder.pos[i * 3], builder.pos[i * 3 + 1], builder.pos[i * 3 + 2], nx, ny, nz, lightTmp);
      for (let c = 0; c < 3; c++) {
        const lit = builder.kind === 'glow' ? 1 : emit + (1 - emit) * lightTmp[c] * ao;
        color[i * 3 + c] = builder.tint[i * 3 + c] * (builder.kind === 'stone' && ny > 0.7 ? ao : lit);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.pos, 3));
    if (builder.kind === 'stone') geometry.setAttribute('normal', new THREE.Float32BufferAttribute(builder.nrm, 3));
    else geometry.setAttribute('uv', new THREE.Float32BufferAttribute(builder.uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    if (builder.kind === 'glow') geometry.setAttribute('corner', new THREE.Float32BufferAttribute(builder.corner, 3));
    geometry.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(builder.index, 1) : new THREE.Uint16BufferAttribute(builder.index, 1));
    geometry.computeBoundingSphere();
    if (builder.kind === 'glow') geometry.boundingSphere.radius += 3;
    geometries.push(geometry);
    triangles += builder.index.length / 3;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    if (builder.kind === 'glow') mesh.renderOrder = 5;
    root.add(mesh);
    staticMeshes.push(mesh);
    return mesh;
  }

  // ---- floor lightmap + emitter map (typed arrays: fast, no canvas read-back) ----
  const lmW = Math.round((LM.maxX - LM.minX) * LM.ppm), lmH = Math.round((LM.maxZ - LM.minZ) * LM.ppm);
  const EM_DIV = 2;   // emitter map at half resolution
  const emW = Math.round(lmW / EM_DIV), emH = Math.round(lmH / EM_DIV);
  const lmF = new Float32Array(lmW * lmH * 3), emF = new Float32Array(emW * emH * 3);
  for (let i = 0; i < lmW * lmH; i++) { lmF[i * 3] = 0.4; lmF[i * 3 + 1] = 0.42; lmF[i * 3 + 2] = 0.66; }
  const toLx = x => (x - LM.minX) * LM.ppm, toLz = z => (z - LM.minZ) * LM.ppm;
  /** Adds an elliptical falloff (radii in px, rotation rot) to a float RGB buffer. */
  function splat(buf, w, h, cx, cz, rx, rz, rot, color, profile) {
    const ext = Math.max(rx, rz);
    const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(w - 1, Math.ceil(cx + ext));
    const z0 = Math.max(0, Math.floor(cz - ext)), z1 = Math.min(h - 1, Math.ceil(cz + ext));
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      const lx = (dx * c + dz * sn) / rx, lz = (-dx * sn + dz * c) / rz;
      const t = Math.sqrt(lx * lx + lz * lz);
      if (t >= 1) continue;
      const f = profile(t), i = (z * w + x) * 3;
      buf[i] += color[0] * f; buf[i + 1] += color[1] * f; buf[i + 2] += color[2] * f;
    }
  }
  const poolProfile = t => (1 - t) * (1 - t);
  const emitProfile = t => t < 0.5 ? 1 - t * 1.5 : 0.25 * (1 - (t - 0.5) * 2);
  for (const L of lights) {
    const h = Math.max(0.3, L.y);
    const k = Math.max(0, 1 - h / (L.r * 1.05)) ** 1.5 * L.i * 1.35 * L.floor;
    const rr = L.r * 0.95 * L.pool * LM.ppm;
    if (k > 0.01) splat(lmF, lmW, lmH, toLx(L.x), toLz(L.z), rr, rr, 0, L.c.map(v => v * k), poolProfile);
    if (L.refl > 0) {
      const e = L.refl * Math.min(1.4, L.i) * 150 / 255;
      splat(emF, emW, emH, toLx(L.x) / EM_DIV, toLz(L.z) / EM_DIV, 0.42 * LM.ppm / EM_DIV, 1.9 * LM.ppm / EM_DIV, 0, L.c.map(v => v * e), emitProfile);
    }
  }
  for (const sh of shadows) {   // contact shadows multiply the light
    const cx = toLx(sh.x), cz = toLz(sh.z), rx = sh.rx * LM.ppm * (1 + sh.soft), rz = sh.rz * LM.ppm * (1 + sh.soft);
    const ext = Math.max(rx, rz);
    const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(lmW - 1, Math.ceil(cx + ext));
    const z0 = Math.max(0, Math.floor(cz - ext)), z1 = Math.min(lmH - 1, Math.ceil(cz + ext));
    const c = Math.cos(sh.rot), sn = Math.sin(sh.rot);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      const q = Math.hypot((dx * c + dz * sn) / (sh.rx * LM.ppm), (-dx * sn + dz * c) / (sh.rz * LM.ppm));
      if (q >= 1 + sh.soft) continue;
      const m = q < 1 ? 1 - sh.a : 1 - sh.a * (1 - (q - 1) / sh.soft);
      const i = (z * lmW + x) * 3;
      lmF[i] *= m; lmF[i + 1] *= m; lmF[i + 2] *= m;
    }
  }
  const lmBytes = new Uint8Array(lmW * lmH * 4), emBytes = new Uint8Array(emW * emH * 4);
  for (let i = 0; i < lmW * lmH; i++) {
    for (let c = 0; c < 3; c++) lmBytes[i * 4 + c] = Math.min(255, Math.round(lmF[i * 3 + c] / LM.scale * 255));
    lmBytes[i * 4 + 3] = 255;
  }
  for (let i = 0; i < emW * emH; i++) {
    for (let c = 0; c < 3; c++) emBytes[i * 4 + c] = Math.min(255, Math.round(emF[i * 3 + c] * 255));
    emBytes[i * 4 + 3] = 255;
  }
  const lightMap = new THREE.DataTexture(lmBytes, lmW, lmH, THREE.RGBAFormat);
  lightMap.magFilter = THREE.LinearFilter;
  lightMap.minFilter = THREE.LinearFilter;
  lightMap.generateMipmaps = false;
  lightMap.needsUpdate = true;
  textures.push(lightMap);
  const emitMap = new THREE.DataTexture(emBytes, emW, emH, THREE.RGBAFormat);
  emitMap.magFilter = THREE.LinearFilter;
  emitMap.minFilter = THREE.LinearMipmapLinearFilter;   // mips = cheap blur for glossy streaks
  emitMap.generateMipmaps = true;
  emitMap.needsUpdate = true;
  textures.push(emitMap);

  timing.lightmap = performance.now();
  // ---- materials ----
  const fogUniforms = THREE.UniformsLib.fog;
  const stoneMaterial = new THREE.ShaderMaterial({
    name: 'march-stone',
    fog: true,
    uniforms: THREE.UniformsUtils.merge([fogUniforms, {
      map: { value: null }, lightMap: { value: null }, emitMap: { value: null },
      lmRect: { value: new THREE.Vector4(LM.minX, LM.minZ, 1 / (LM.maxX - LM.minX), 1 / (LM.maxZ - LM.minZ)) },
      lmScale: { value: LM.scale }, wetness: { value: options.wetness ?? 1 }, reflGain: { value: options.reflGain ?? 1.7 },
    }]),
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz; vNormal = normal; vColor = color;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform sampler2D lightMap; uniform sampler2D emitMap; uniform vec4 lmRect; uniform float lmScale; uniform float wetness; uniform float reflGain;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor;
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vNormal); vec3 an = abs(n);
        bool up = n.y > 0.7;
        vec2 tuv = up ? vec2(vWorld.x, -vWorld.z) : (an.x > an.z ? vec2(-vWorld.z * sign(n.x), vWorld.y) : vec2(vWorld.x * sign(n.z), vWorld.y));
        tuv /= vec2(4.0, 2.0);
        vec2 f = fract(tuv);
        vec2 auv = up ? vec2(f.x, 0.5 + f.y * 0.5) : vec2(f.x, f.y * 0.5);
        vec4 tex = textureGrad(map, auv, dFdx(tuv) * vec2(1.0, 0.5), dFdy(tuv) * vec2(1.0, 0.5));
        vec3 albedo = tex.rgb;
        vec3 col;
        if (up) {
          vec2 lmuv = (vWorld.xz - lmRect.xy) * lmRect.zw;
          vec3 light = texture2D(lightMap, lmuv).rgb * lmScale * vColor;
          vec3 toFrag = vWorld - cameraPosition;
          float dist = length(toFrag.xz);
          vec2 dir = toFrag.xz / max(dist, 1e-3);
          float eye = max(cameraPosition.y - vWorld.y, 0.6);
          // mirror of a light at height h shows up dist * h / eye beyond the shaded point
          float reach = dist / eye;
          vec3 refl = vec3(0.0);
          // taps spread along the ray: glossy streaks rather than mirror dots
          // taps spread along the ray (slightly blurrier mips further out): glossy streaks
          float lodBase = clamp(log2(max(reach, 0.25)) * 0.6, 0.0, 1.6);
          for (int k = 0; k < 5; k++) {
            float t = 1.25 + float(k) * 0.38;
            refl += textureLod(emitMap, (vWorld.xz + dir * reach * t - lmRect.xy) * lmRect.zw, lodBase + float(k) * 0.12).rgb * (1.1 - float(k) * 0.12);
          }
          float wet = tex.a * wetness;
          float cosV = clamp(eye / max(length(toFrag), 1e-3), 0.0, 1.0);
          float fres = pow(1.0 - cosV, 4.0);
          float macro = texture2D(map, vec2(fract(vWorld.x * 0.037), 0.5 + 0.5 * fract(vWorld.z * 0.053))).a;
          refl *= reflGain;
          col = albedo * light * (0.82 + 0.35 * macro) + refl * (0.4 + refl * 0.6) * wet * (0.35 + 0.9 * fres) + wet * fres * vec3(0.03, 0.028, 0.07);
        } else {
          col = albedo * vColor * (0.85 + 0.3 * tex.a);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  stoneMaterial.uniforms.map.value = stoneTexture;
  stoneMaterial.uniforms.lightMap.value = lightMap;
  stoneMaterial.uniforms.emitMap.value = emitMap;
  stoneTexture.wrapS = stoneTexture.wrapT = THREE.RepeatWrapping;
  const propsMaterial = new THREE.MeshBasicMaterial({ name: 'march-props', map: propsTexture, vertexColors: true, toneMapped: false });
  const cutoutMaterial = new THREE.MeshBasicMaterial({ name: 'march-cutout', map: propsTexture, vertexColors: true, toneMapped: false, alphaTest: 0.5, side: THREE.DoubleSide });
  const glowMaterial = new THREE.ShaderMaterial({
    name: 'march-glow',
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([fogUniforms, { map: { value: null }, time: { value: 0 } }]),
    vertexShader: /* glsl */`
      attribute vec3 color; attribute vec3 corner;
      varying vec2 vUv; varying vec3 vColor;
      uniform float time;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        float flicker = corner.z < 0.0 ? 1.0 : 0.92 + 0.08 * sin(time * 3.1 + corner.z * 7.0) * sin(time * 1.7 + corner.z);
        vColor = color * flicker;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        mvPosition.xy += corner.xy;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec3 vColor;
      #include <fog_pars_fragment>
      void main() {
        vec3 col = texture2D(map, vUv).rgb * vColor;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          col *= 1.0 - fogFactor;
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  glowMaterial.uniforms.map.value = propsTexture;
  materials.push(stoneMaterial, propsMaterial, cutoutMaterial, glowMaterial);
  chunks.forEach((chunk, i) => {
    buildMesh(chunk.stone, stoneMaterial, `march-stone-${i}`);
    buildMesh(chunk.props, propsMaterial, `march-props-${i}`);
    buildMesh(chunk.cutout, cutoutMaterial, `march-cutout-${i}`);
    buildMesh(chunk.glow, glowMaterial, `march-glow-${i}`);
  });

  timing.meshes = performance.now();
  // ================================================================== sky (camera-centred, unfogged)
  const skyMaterial = new THREE.ShaderMaterial({
    name: 'march-sky', depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false,
    uniforms: { map: { value: skyTexture }, glowMap: { value: propsTexture } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float elev = asin(clamp(d.y, -1.0, 1.0));
        float az = atan(d.x, -d.z);
        float u = az / 3.14159265 * 1.0 + 0.5;          // mirrored repeat: two copies around the horizon
        float lo = -0.035, hi = 0.36;
        float v = (elev - lo) / (hi - lo);
        vec3 band = texture2D(map, vec2(u, clamp(v, 0.002, 0.998))).rgb;
        vec3 zenith = vec3(0.012, 0.012, 0.035);
        vec3 top = texture2D(map, vec2(u, 0.995)).rgb;
        vec3 col = v > 1.0 ? mix(top, zenith, smoothstep(0.0, 0.8, v - 1.0)) : band;
        col = v < 0.0 ? mix(band, vec3(0.02, 0.02, 0.05), smoothstep(0.0, 0.3, -v)) : col;
        // moon
        vec3 moonDir = normalize(vec3(0.35, 0.42, -0.84));
        float m = dot(d, moonDir);
        col += vec3(0.9, 0.88, 1.0) * smoothstep(0.99955, 0.9997, m) + vec3(0.12, 0.1, 0.2) * pow(max(m, 0.0), 200.0);
        gl_FragColor = vec4(col * vec3(0.72, 0.7, 0.8), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), skyMaterial);
  sky.name = 'march-sky';
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.onBeforeRender = (renderer, scene2, camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  geometries.push(sky.geometry); materials.push(skyMaterial);
  root.add(sky);

  // ================================================================== portal (animated)
  const portalMaterial = new THREE.ShaderMaterial({
    name: 'march-portal', transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    uniforms: { map: { value: propsTexture }, time: { value: 0 }, swirl: { value: rectVec(region('swirl')) }, runes: { value: rectVec(region('runes')) }, power: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float time; uniform vec4 swirl; uniform vec4 runes; uniform float power;
      varying vec2 vUv;
      vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.08) discard;
        vec2 q1 = rot(p, time * 0.35) * 0.5 + 0.5, q2 = rot(p * 0.75, -time * 0.55) * 0.5 + 0.5;
        float s1 = texture2D(map, mix(swirl.xy, swirl.zw, clamp(q1, 0.02, 0.98))).r * step(r, 0.98);
        float s2 = texture2D(map, mix(swirl.xy, swirl.zw, clamp(q2, 0.02, 0.98))).r * step(r, 0.98);
        float core = 1.0 - smoothstep(0.9, 0.97, r);
        vec3 col = mix(vec3(0.05, 0.015, 0.12), vec3(0.14, 0.04, 0.3), smoothstep(1.0, 0.0, r)) * core;
        col += vec3(0.45, 0.2, 0.95) * (s1 * 0.5 + s2 * 0.3) * core;
        float ring = exp(-pow((r - 0.95) / 0.022, 2.0)) * 1.3 + exp(-pow((r - 0.95) / 0.09, 2.0)) * 0.35;
        col += vec3(0.7, 0.45, 1.0) * ring;
        // vertical rune chain
        if (abs(p.x) < 0.09 && abs(p.y) < 0.85) {
          float v = fract(p.y * 0.6 + 0.5 + time * 0.03);
          vec2 ruv = vec2(mix(runes.x, runes.z, v), mix(runes.y, runes.w, p.x / 0.18 + 0.5));
          col += vec3(0.85, 0.7, 1.0) * texture2D(map, ruv).r * (1.0 - abs(p.y) / 0.85);
        }
        gl_FragColor = vec4(col * power, core);
        #include <colorspace_fragment>
      }`,
  });
  const G = layout.soulGate;
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(G.portalRadius * 2.16, G.portalRadius * 2.16), portalMaterial);
  portal.position.set(0, G.portalY, G.z + 0.15);
  portal.name = 'soul-gate-portal';
  portal.renderOrder = 6;
  geometries.push(portal.geometry); materials.push(portalMaterial);
  root.add(portal);

  // ================================================================== fountain water (animated)
  const waterMaterial = new THREE.ShaderMaterial({
    name: 'march-water', fog: true,
    uniforms: THREE.UniformsUtils.merge([fogUniforms, { time: { value: 0 } }]),
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p);
        float rip = sin(r * 26.0 - time * 3.0) * 0.5 + 0.5;
        float rip2 = sin((p.x + p.y) * 17.0 + time * 1.7) * sin((p.x - p.y) * 13.0 - time * 1.3);
        vec3 deep = vec3(0.01, 0.05, 0.09), glow = vec3(0.12, 0.55, 0.6);
        vec3 col = mix(deep, glow, 0.25 + 0.2 * rip * (1.0 - r) + 0.12 * rip2);
        col += vec3(0.5, 0.35, 0.9) * pow(rip, 12.0) * 0.25;
        col += vec3(0.2, 0.9, 1.0) * smoothstep(0.35, 0.0, r) * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(fountainParts.r - 0.3, 32), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(fountainParts.x, 0.5, fountainParts.z);
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), waterMaterial);
  bowlWater.rotation.x = -Math.PI / 2;
  bowlWater.position.set(fountainParts.x, 1.93, fountainParts.z);
  geometries.push(water.geometry, bowlWater.geometry); materials.push(waterMaterial);
  root.add(water, bowlWater);

  // ================================================================== dynamic: barriers, demon lanterns, soul lamp, pickups, telegraphs, breakables
  const barrierGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geometries.push(barrierGeometry);
  const barrierBase = new THREE.ShaderMaterial({
    name: 'march-barrier', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([fogUniforms, { map: { value: null }, runes: { value: rectVec(region('runes')) }, time: { value: 0 }, fade: { value: 1 }, width: { value: 14 } }]),
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec4 runes; uniform float time; uniform float fade; uniform float width;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        float x = vUv.x * width, y = vUv.y;
        vec2 g = vec2(x * 1.6, y * 5.0 + time * 0.25);
        vec2 cell = abs(fract(g) - 0.5);
        float grid = smoothstep(0.46, 0.5, max(cell.x, cell.y)) * 0.35;
        float band = fract(y * 1.0 - time * 0.18);
        vec2 ruv = vec2(mix(runes.x, runes.z, fract(x / 4.0 + time * 0.05)), mix(runes.y, runes.w, clamp((y - 0.3) / 0.3, 0.0, 1.0)));
        float rune = (y > 0.3 && y < 0.6) ? texture2D(map, ruv).r : 0.0;
        float edge = pow(1.0 - y, 3.0) * 1.2 + smoothstep(0.02, 0.0, y) * 2.0;
        float sweep = smoothstep(0.0, 0.08, band) * smoothstep(0.2, 0.08, band) * 0.35;
        float a = (0.01 + grid * 0.05 + rune * 0.4 + edge * 0.4 + sweep * 0.2) * (1.0 - smoothstep(0.45, 1.0, y) * 0.9);
        vec3 col = vec3(0.5, 0.22, 1.0) * a * fade;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          col *= 1.0 - fogFactor;
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const barriers = layout.gates.map(gate => {
    const material = barrierBase.clone();
    material.uniforms.map.value = propsTexture;
    material.uniforms.width.value = gate.halfWidth * 2 + 1;
    materials.push(material);
    const mesh = new THREE.Mesh(barrierGeometry, material);
    mesh.position.set(0, heightAt(0, gate.z + 0.5), gate.z);
    mesh.scale.set(gate.halfWidth * 2 + 1, 3.6, 1);
    mesh.userData.open = 0;
    mesh.renderOrder = 7;
    root.add(mesh);
    return mesh;
  });
  materials.push(barrierBase);

  // Demon lanterns: iron post (static-ish) + oni-face paper lantern + glow sprite per lantern.
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  geometries.push(spriteGeometry);
  const makeSpriteMaterial = (uv, color) => {
    const material = new THREE.SpriteMaterial({ map: propsTexture.clone(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false });
    material.map.repeat.set(uv.u1 - uv.u0, uv.v1 - uv.v0);
    material.map.offset.set(uv.u0, uv.v0);
    material.map.needsUpdate = true;
    textures.push(material.map);
    materials.push(material);
    return material;
  };
  const demonGeometry = (() => {
    const b = new Builder('props');
    const prof = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([0.18 + Math.sin(t * Math.PI) * 0.42, -0.55 + t * 1.1]); }
    lathe(b, new THREE.Matrix4(), prof, 12, region('demon_lantern'), { vByY: true, emit: 1 });
    box(b, F(0, 0.55, 0), 0.34, 0.1, 0.34, { uv: region('sw_black'), emit: 1 });
    box(b, F(0, -0.65, 0), 0.3, 0.1, 0.3, { uv: region('sw_black'), emit: 1 });
    box(b, F(0, -1.0, 0), 0.05, 0.35, 0.05, { uv: region('sw_white'), emit: 1, tint: [1, 0.25, 0.2] });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(b.tint, 3));
    geometry.setIndex(b.index);
    geometries.push(geometry);
    return geometry;
  })();
  const lanternPosts = new Builder('props');
  const demonLanterns = layout.lanterns.map((at, i) => {
    const y = heightAt(at.x, at.z);
    // post with a hook arm (baked into its own tiny mesh so it can hide with the lantern)
    box(lanternPosts, F(at.x, y, at.z), 0.16, 3.3, 0.16, { uv: region('sw_metal'), ao: 0.5, tint: [0.9, 0.9, 1] });
    box(lanternPosts, F(at.x, y, at.z), 0.5, 0.3, 0.5, { uv: region('stone'), ao: 0.5 });
    box(lanternPosts, F(at.x, y + 3.2, at.z), 0.1, 0.1, 0.9, { uv: region('sw_metal') });
    const material = new THREE.MeshBasicMaterial({ map: propsTexture, vertexColors: true, toneMapped: false });
    materials.push(material);
    const body = new THREE.Mesh(demonGeometry, material);
    body.position.set(at.x, y + 2.3, at.z + 0.4);
    const halo = new THREE.Sprite(makeSpriteMaterial(region('glow'), new THREE.Color(1.0, 0.25, 0.18)));
    halo.scale.set(3.2, 3.2, 1);
    halo.position.copy(body.position);
    halo.renderOrder = 5;
    root.add(body, halo);
    shadow(at.x, at.z, 0.9, 0.9, 0.5);
    return { body, halo, material, base: body.position.clone(), y };
  });
  const lanternPostMesh = (() => {
    const color = new Float32Array(lanternPosts.count * 3);
    for (let i = 0; i < lanternPosts.count; i++) {
      lightAt(lanternPosts.pos[i * 3], lanternPosts.pos[i * 3 + 1], lanternPosts.pos[i * 3 + 2], lanternPosts.nrm[i * 3], lanternPosts.nrm[i * 3 + 1], lanternPosts.nrm[i * 3 + 2], lightTmp);
      for (let c = 0; c < 3; c++) color[i * 3 + c] = lanternPosts.tint[i * 3 + c] * (lightTmp[c] + 0.4) * lanternPosts.fx[i * 2 + 1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(lanternPosts.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(lanternPosts.uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setIndex(lanternPosts.index);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, propsMaterial);
    root.add(mesh);
    return mesh;
  })();

  // Soul lamp flame: flame sprite + halo.
  const lampAt = layout.lamp, lampY = heightAt(lampAt.x, lampAt.z);
  const flame = new THREE.Sprite(makeSpriteMaterial(region('flame'), new THREE.Color(0.4, 1.4, 1.3)));
  flame.position.set(lampAt.x, lampY + 1.55, lampAt.z);
  flame.scale.set(1.3, 1.9, 1);
  flame.renderOrder = 6;
  const lampHalo = new THREE.Sprite(makeSpriteMaterial(region('glow'), new THREE.Color(0.2, 0.8, 0.75)));
  lampHalo.position.set(lampAt.x, lampY + 1.3, lampAt.z);
  lampHalo.scale.set(4.5, 4.5, 1);
  lampHalo.renderOrder = 5;
  root.add(flame, lampHalo);

  // Pickups: 護身符 talisman (bun, +15 hp), 靈燈 spirit lantern (bigBun, +30 hp), 魂晶 soul crystal (wine, +25 energy).
  const pickupFx = createPickups();

  // Ground telegraphs (same shapes as the graybox; soft ring texture for the edge).
  const ringGeometry = new THREE.RingGeometry(0.93, 1, 48), discGeometry = new THREE.CircleGeometry(1, 48);
  const laneGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  geometries.push(ringGeometry, discGeometry, laneGeometry);
  const decals = new Map();
  const dangerFill = { color: 0xff3b30, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false };
  // 紅圈用完就 dispose，全部消失時 three 會連 shader 一起刪掉，下一次跳砸再重編，手機會在該閃避的瞬間卡一下；
  // 留一個看不見的同款材質：開場 prewarm 編好後 shader 一直在
  const decalWarm = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial({ ...dangerFill, opacity: 0 }));
  decalWarm.visible = false;
  materials.push(decalWarm.material);
  root.add(decalWarm);
  function decalFor(hazard) {
    let entry = decals.get(hazard.id);
    if (entry) return entry;
    const group = new THREE.Group();
    const edgeMaterial = new THREE.MeshBasicMaterial({ ...dangerFill, opacity: 0.9 });
    const fillMaterial = new THREE.MeshBasicMaterial({ ...dangerFill, opacity: 0.35 });
    const circle = hazard.shape === 'circle';
    const edge = new THREE.Mesh(circle ? ringGeometry : laneGeometry, edgeMaterial);
    const fillMesh = new THREE.Mesh(circle ? discGeometry : laneGeometry, fillMaterial);
    edge.rotation.x = fillMesh.rotation.x = -Math.PI / 2;
    edge.renderOrder = fillMesh.renderOrder = 8;
    group.add(edge, fillMesh);
    root.add(group);
    entry = { group, edge, fill: fillMesh, edgeMaterial, fillMaterial };
    decals.set(hazard.id, entry);
    return entry;
  }

  // Breakables (crate / jar / barrel), one InstancedMesh per type + pooled debris shards.
  const breakables = createBreakables();

  function createBreakables() {
    const list = layout.breakables || [];
    const types = {
      crate: () => { const b = new Builder('props'); box(b, F(0, 0, 0), 0.72, 0.62, 0.62, { uv: region('crate'), ao: 0.55 }); box(b, F(0.03, 0.62, 0, 0.3), 0.55, 0.42, 0.5, { uv: region('crate'), ao: 0.8 }); return b; },
      jar: () => { const b = new Builder('props'); lathe(b, new THREE.Matrix4(), [[0.2, 0], [0.34, 0.2], [0.4, 0.45], [0.33, 0.72], [0.2, 0.82], [0.22, 0.9]], 12, region('jar'), { ao: 0.55, aoHeight: 0.3, vByY: true }); lathe(b, F(0, 0.9, 0), [[0.24, 0], [0.12, 0.08], [0, 0.1]], 8, region('sw_paper'), { tint: [0.9, 0.3, 0.25] }); return b; },
      barrel: () => { const b = new Builder('props'); lathe(b, new THREE.Matrix4(), [[0.34, 0], [0.4, 0.45], [0.34, 0.9]], 12, region('barrel'), { ao: 0.55, aoHeight: 0.3, vByY: true, uRepeat: 2 }); lathe(b, F(0, 0.9, 0), [[0.34, 0], [0, 0.01]], 12, region('wood')); return b; },
    };
    const byType = {};
    for (const [type, make] of Object.entries(types)) {
      const items = list.map((item, index) => ({ ...item, index })).filter(item => item.type === type);
      if (!items.length) continue;
      const b = make();
      const color = new Float32Array(b.count * 3);
      for (let i = 0; i < b.count; i++) {
        const ny = b.nrm[i * 3 + 1];
        const l = 0.55 + 0.35 * (ny * 0.5 + 0.5);
        for (let c = 0; c < 3; c++) color[i * 3 + c] = b.tint[i * 3 + c] * b.fx[i * 2 + 1] * (l + (c === 0 ? 0.25 : c === 1 ? 0.14 : 0.05));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      geometry.setIndex(b.index);
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      const mesh = new THREE.InstancedMesh(geometry, propsMaterial, items.length);
      mesh.name = `march-breakable-${type}`;
      const m = new THREE.Matrix4();
      items.forEach((item, k) => {
        m.compose(new THREE.Vector3(item.x, heightAt(item.x, item.z), item.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (item.index * 1.7) % TAU, 0)), new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(k, m);
        item.slot = k;
        shadow(item.x, item.z, 0.6, 0.6, 0.45);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
      byType[type] = { mesh, items };
    }
    // debris: shards that pop out and settle, then shrink away
    const SHARDS = 48;
    const shardGeometry = new THREE.BoxGeometry(0.16, 0.05, 0.12);
    geometries.push(shardGeometry);
    const shardMaterial = new THREE.MeshBasicMaterial({ map: propsTexture, toneMapped: false });
    const wood = region('crate');
    const uvAttr = shardGeometry.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, wood.u0 + (wood.u1 - wood.u0) * (0.3 + uvAttr.getX(i) * 0.2), wood.v0 + (wood.v1 - wood.v0) * (0.3 + uvAttr.getY(i) * 0.2));
    materials.push(shardMaterial);
    const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, SHARDS);
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shards.frustumCulled = false;
    shards.count = 0;
    root.add(shards);
    const live = [];
    const broken = new Set();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const shardColor = { crate: new THREE.Color(0.75, 0.55, 0.4), barrel: new THREE.Color(0.6, 0.45, 0.35), jar: new THREE.Color(0.55, 0.32, 0.22) };
    const api = {
      /** Breaks LAYOUT.breakables[index]: hides it and throws shards. */
      break(index) {
        if (broken.has(index)) return;
        const item = list[index];
        if (!item) return;
        broken.add(index);
        const entry = byType[item.type];
        const slot = entry?.items.find(it => it.index === index)?.slot;
        if (entry && slot !== undefined) { entry.mesh.setMatrixAt(slot, hidden); entry.mesh.instanceMatrix.needsUpdate = true; }
        const y = heightAt(item.x, item.z);
        for (let i = 0; i < 9 && live.length < SHARDS; i++) {
          const a = Math.random() * TAU, s = 1.2 + Math.random() * 2.4;
          live.push({ p: new THREE.Vector3(item.x, y + 0.4 + Math.random() * 0.3, item.z), v: new THREE.Vector3(Math.cos(a) * s, 2.5 + Math.random() * 2.5, Math.sin(a) * s), r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0), w: (Math.random() - 0.5) * 16, age: 0, floor: y, color: shardColor[item.type] });
        }
      },
      isBroken: index => broken.has(index),
      /** Puts one breakable back (director reset / skipTo). */
      restore(index) {
        if (!broken.delete(index)) return;
        const item = list[index], entry = byType[item.type];
        const slot = entry?.items.find(it => it.index === index)?.slot;
        if (slot === undefined) return;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(item.x, heightAt(item.x, item.z), item.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (index * 1.7) % TAU, 0)), new THREE.Vector3(1, 1, 1));
        entry.mesh.setMatrixAt(slot, m);
        entry.mesh.instanceMatrix.needsUpdate = true;
      },
      /** Restores every breakable (level reset). */
      reset() {
        broken.clear(); live.length = 0; shards.count = 0;
        const m = new THREE.Matrix4();
        for (const { mesh, items } of Object.values(byType)) {
          items.forEach(item => { m.compose(new THREE.Vector3(item.x, heightAt(item.x, item.z), item.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (item.index * 1.7) % TAU, 0)), new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(item.slot, m); });
          mesh.instanceMatrix.needsUpdate = true;
        }
      },
      /** Syncs with a list of { index, broken } (e.g. view.breakables) — optional. */
      sync(states) {
        if (!states) return;
        for (const state of states) {
          const index = state.index ?? state.id;
          if (state.broken && !broken.has(index)) api.break(index);
          else if (!state.broken && broken.has(index)) api.restore(index);
        }
      },
      update(dt) {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        let n = 0;
        for (let i = live.length - 1; i >= 0; i--) {
          const shard = live[i];
          shard.age += dt;
          if (shard.age > 2.2) { live.splice(i, 1); continue; }
          if (shard.p.y > shard.floor + 0.03 || shard.v.y > 0) {
            shard.v.y -= 14 * dt;
            shard.p.addScaledVector(shard.v, dt);
            shard.r.x += shard.w * dt; shard.r.z += shard.w * 0.7 * dt;
            if (shard.p.y < shard.floor + 0.03) { shard.p.y = shard.floor + 0.03; shard.v.set(shard.v.x * 0.3, 0, shard.v.z * 0.3); shard.r.x = 0; }
          } else shard.p.addScaledVector(shard.v, dt * 0.2);
        }
        for (const shard of live) {
          const k = shard.age > 1.6 ? Math.max(0, 1 - (shard.age - 1.6) / 0.6) : 1;
          m.compose(shard.p, q.setFromEuler(shard.r), s.setScalar(k));
          shards.setMatrixAt(n, m);
          shards.setColorAt(n, shard.color);
          n++;
        }
        shards.count = n;
        shards.instanceMatrix.needsUpdate = true;
        if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
      },
      dispose() {},
    };
    return api;
  }

  // ================================================================== pickups (pooled: 3 instanced meshes + 1 sprite batch)
  function createPickups() {
    const MAX = 24, QUADS = 256;
    const KIND = {
      bun: { mesh: 'talisman', glow: [1.0, 0.72, 0.25], ring: [0.55, 0.4, 0.12], spark: [1.2, 0.9, 0.4] },
      bigBun: { mesh: 'lantern', glow: [1.2, 0.55, 0.2], ring: [0.6, 0.28, 0.08], spark: [1.3, 0.7, 0.3] },
      wine: { mesh: 'crystal', glow: [0.6, 0.3, 1.2], ring: [0.32, 0.14, 0.6], spark: [0.85, 0.6, 1.4] },
    };
    const toGeometry = (b, lit = 1) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      const color = new Float32Array(b.count * 3);
      for (let i = 0; i < b.count; i++) for (let c = 0; c < 3; c++) color[i * 3 + c] = b.tint[i * 3 + c] * (b.fx[i * 2] > 0 ? 1 : lit * b.fx[i * 2 + 1]);
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
      geometry.setIndex(b.index);
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      return geometry;
    };
    // 護身符: yellow paper card, both faces (back mirrored), gently curled
    const talismanB = new Builder('props');
    {
      const uv = region('talisman'), w = 0.17, h = 0.34, n = 4;
      for (let i = 0; i < n; i++) {
        const x0 = -w + 2 * w * i / n, x1 = -w + 2 * w * (i + 1) / n;
        const z0 = -Math.pow(x0 / w, 2) * 0.03, z1 = -Math.pow(x1 / w, 2) * 0.03;
        const u0 = uv.u0 + (uv.u1 - uv.u0) * i / n, u1 = uv.u0 + (uv.u1 - uv.u0) * (i + 1) / n;
        const c = [[x0, -h, z0], [x1, -h, z1], [x1, h, z1], [x0, h, z0]];
        quad(talismanB, new THREE.Matrix4(), c, uv, { emit: 1, tint: [1.15, 1.08, 1.0], uvs: [[u0, uv.v0], [u1, uv.v0], [u1, uv.v1], [u0, uv.v1]], double: true });
      }
    }
    // 靈燈: small paper lantern with caps, gold knob and a red tassel
    const lanternB = new Builder('props');
    {
      const prof = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([0.07 + Math.sin(t * Math.PI) * 0.15, -0.2 + t * 0.4]); }
      lathe(lanternB, new THREE.Matrix4(), prof, 10, region('spirit_lantern'), { emit: 1, tint: [1.2, 1.12, 1.05], vByY: true });
      box(lanternB, F(0, 0.2, 0), 0.13, 0.04, 0.13, { uv: region('sw_black'), emit: 1 });
      box(lanternB, F(0, -0.24, 0), 0.12, 0.04, 0.12, { uv: region('sw_black'), emit: 1 });
      box(lanternB, F(0, 0.24, 0), 0.015, 0.14, 0.015, { uv: region('sw_black'), emit: 1 });
      lathe(lanternB, F(0, -0.29, 0), [[0.035, 0], [0.03, 0.05], [0, 0.06]], 6, region('sw_gold'), { emit: 1 });
      box(lanternB, F(0, -0.43, 0), 0.04, 0.13, 0.04, { uv: region('sw_white'), emit: 1, tint: [0.75, 0.08, 0.07] });
    }
    // 魂晶: faceted hexagonal bipyramid, facet shading baked into vertex colours
    const crystalB = new Builder('props');
    {
      const uv = region('sw_white'), top = [0, 0.3, 0], bot = [0, -0.2, 0], ring = [];
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, r = i % 2 ? 0.12 : 0.145; ring.push([Math.cos(a) * r, 0.03 + (i % 2 ? 0.03 : -0.02), Math.sin(a) * r]); }
      const light = normalize3([-0.4, 0.8, 0.45]);
      for (let i = 0; i < 6; i++) {
        const a = ring[i], b2 = ring[(i + 1) % 6];
        for (const [apex, upper] of [[top, true], [bot, false]]) {
          const tri = upper ? [a, apex, b2] : [a, b2, apex];
          const e1 = tri[1].map((v, k) => v - tri[0][k]), e2 = tri[2].map((v, k) => v - tri[0][k]);
          const n = normalize3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
          const lit = 0.55 + 0.6 * Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
          const i0 = crystalB.count;
          tri.forEach((p, k) => {
            // the girdle glows from inside, the tips fall off to deep violet; facet light on top
            const apex = k === (upper ? 1 : 2);
            const tint = apex
              ? (upper ? [0.07 * lit, 0.012 * lit, 0.34 * lit] : [0.03 * lit, 0.004 * lit, 0.16 * lit])
              : [0.34 + 0.14 * lit, 0.1 + 0.06 * lit, 0.78 + 0.2 * lit];
            crystalB.vertex(p[0], p[1], p[2], n[0], n[1], n[2], (uv.u0 + uv.u1) / 2, (uv.v0 + uv.v1) / 2, tint, 1, 1);
          });
          crystalB.index.push(i0, i0 + 1, i0 + 2);
        }
      }
    }
    const material = new THREE.MeshBasicMaterial({ name: 'march-pickup', map: propsTexture, vertexColors: true, toneMapped: false });
    materials.push(material);
    const meshes = {};
    for (const [name, b] of [['talisman', talismanB], ['lantern', lanternB], ['crystal', crystalB]]) {
      const mesh = new THREE.InstancedMesh(toGeometry(b), material, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.name = `march-pickup-${name}`;
      mesh.renderOrder = 4;
      root.add(mesh);
      meshes[name] = mesh;
    }
    // additive sprite batch: halos, ground rings, rising motes, collect sparkles (glow shader, 1 draw)
    const pos = new Float32Array(QUADS * 12), cor = new Float32Array(QUADS * 12), uvs = new Float32Array(QUADS * 8), colors = new Float32Array(QUADS * 12);
    const index = new Uint16Array(QUADS * 6);
    for (let q = 0; q < QUADS; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    const spriteGeometry2 = new THREE.BufferGeometry();
    const attr = (array, size) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    spriteGeometry2.setAttribute('position', attr(pos, 3));
    spriteGeometry2.setAttribute('corner', attr(cor, 3));
    spriteGeometry2.setAttribute('uv', attr(uvs, 2));
    spriteGeometry2.setAttribute('color', attr(colors, 3));
    spriteGeometry2.setIndex(new THREE.BufferAttribute(index, 1));
    geometries.push(spriteGeometry2);
    const sprites = new THREE.Mesh(spriteGeometry2, glowMaterial);
    sprites.frustumCulled = false;
    sprites.renderOrder = 6;
    root.add(sprites);
    const UV = { glow: region('glow'), ring: region('ring'), spark: region('spark') };
    let nq = 0;
    function billboard(x, y, z, size, tint, uv = UV.glow) {
      if (nq >= QUADS) return;
      const h = size / 2, q = nq++;
      const c = [[-h, -h], [h, -h], [h, h], [-h, h]], t = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
      for (let k = 0; k < 4; k++) {
        pos.set([x, y, z], (q * 4 + k) * 3); cor.set([c[k][0], c[k][1], -1], (q * 4 + k) * 3);
        uvs.set(t[k], (q * 4 + k) * 2); colors.set(tint, (q * 4 + k) * 3);
      }
    }
    function flat(x, y, z, size, tint, uv = UV.ring) {
      if (nq >= QUADS) return;
      const h = size / 2, q = nq++;
      const c = [[-h, -h], [h, -h], [h, h], [-h, h]], t = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
      for (let k = 0; k < 4; k++) {
        pos.set([x + c[k][0], y, z + c[k][1]], (q * 4 + k) * 3); cor.set([0, 0, -1], (q * 4 + k) * 3);
        uvs.set(t[k], (q * 4 + k) * 2); colors.set(tint, (q * 4 + k) * 3);
      }
    }
    const live = new Map();     // id -> { kind, x, z, born, until, state, t, seed }
    const sparks = [];          // collect bursts { p, v, age, life, color }
    const hinted = new Map();   // id -> 'collect' | 'expire' (from onEvent)
    let time = 0;
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3(), c4 = new THREE.Color();
    function finish(entry, how) {
      entry.state = how; entry.t = 0;
      if (how !== 'collect') return;
      const look = KIND[entry.kind] || KIND.bun;
      const y = heightAt(entry.x, entry.z) + 0.62;
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + Math.random() * 0.5;
        sparks.push({ p: new THREE.Vector3(entry.x, y, entry.z), v: new THREE.Vector3(Math.cos(a) * 2.4, 1.0 + Math.random() * 1.6, Math.sin(a) * 2.4), age: 0, life: 0.5 + Math.random() * 0.15, color: look.spark });
      }
    }
    return {
      onEvent(event) {
        if (event?.pickupId === undefined) return;
        if (event.type === 'pickup') hinted.set(event.pickupId, 'collect');
        else if (event.type === 'pickupLost') hinted.set(event.pickupId, 'expire');
      },
      update(view, dt) {
        time += dt;
        const seen = new Set();
        if (view) for (const pickup of view.pickups || []) {
          seen.add(pickup.id);
          const p = toWorld(pickup.x, pickup.y);
          let entry = live.get(pickup.id);
          if (!entry) { entry = { kind: KIND[pickup.kind] ? pickup.kind : 'bun', x: p.x, z: p.z, born: time, state: 'live', t: 0, seed: (pickup.id * 1.618) % 1 * TAU }; live.set(pickup.id, entry); }
          entry.x = p.x; entry.z = p.z;
          entry.left = pickup.until !== undefined && view.time !== undefined ? pickup.until - view.time : Infinity;
        }
        for (const [id, entry] of live) {
          if (entry.state === 'live' && view && !seen.has(id)) {
            const hint = hinted.get(id);
            const near = Math.hypot(heroSeen.x - entry.x, heroSeen.z - entry.z) < 2.2 && entry.left > 0.15;
            finish(entry, hint || (near ? 'collect' : 'expire'));
            hinted.delete(id);
          }
          if (entry.state !== 'live') { entry.t += dt; if (entry.t > 0.35) live.delete(id); }
        }
        // instanced items
        const counts = { talisman: 0, lantern: 0, crystal: 0 };
        nq = 0;
        for (const entry of live.values()) {
          const look = KIND[entry.kind];
          const name = look.mesh, mesh = meshes[name];
          const floor = heightAt(entry.x, entry.z);
          const age = time - entry.born, ph = entry.seed;
          let scale = Math.min(1, age / 0.25) * (1 + 0.15 * Math.max(0, 1 - age / 0.25));
          let y = floor + (name === 'talisman' ? 0.64 : name === 'lantern' ? 0.66 : 0.6) + Math.sin(time * 2.2 + ph) * (name === 'lantern' ? 0.07 : 0.05);
          let x = entry.x, z = entry.z;
          let bright = 1;
          if (entry.state === 'collect') {
            const k = Math.min(1, entry.t / 0.3);
            scale *= 1 - k; x += (heroSeen.x - x) * k * 0.8; z += (heroSeen.z - z) * k * 0.8; y += k * 0.5; bright = 1 + k;
          } else if (entry.state === 'expire') {
            scale *= Math.max(0, 1 - entry.t / 0.3);
          } else if (entry.left < 3 && Math.sin(time * 18) < 0) {
            bright = 0.25;   // last 3 s: blink
          }
          if (name === 'talisman') e4.set(Math.sin(time * 1.7 + ph) * 0.08, time * 1.1 + ph, Math.sin(time * 2.3 + ph) * 0.12, 'YXZ');
          else if (name === 'lantern') e4.set(0, time * 0.5 + ph, Math.sin(time * 1.6 + ph) * 0.1, 'YXZ');
          else { e4.set(0, time * 0.9 + ph, 0, 'YXZ'); scale *= 1 + Math.sin(time * 4 + ph) * 0.04; }
          m4.compose(p4.set(x, y, z), q4.setFromEuler(e4), s4.setScalar(Math.max(0.0001, scale)));
          const i = counts[name]++;
          if (i >= MAX) continue;
          mesh.setMatrixAt(i, m4);
          const pulse = name === 'crystal' ? 1.05 + Math.sin(time * 4 + ph) * 0.3 : 1;
          mesh.setColorAt(i, c4.setRGB(bright * pulse, bright * pulse, bright * pulse));
          // halo, ground ring, motes
          const g = look.glow, rg = look.ring, fade = scale * (bright < 1 ? 0.3 : 1);
          const pulseG = 0.85 + 0.15 * Math.sin(time * 3 + ph);
          billboard(x, y, z, (name === 'crystal' ? 1.3 : 1.45) * (0.9 + 0.1 * pulse), g.map(v => v * 0.85 * fade * pulseG * (name === 'crystal' ? pulse : 1)));
          const ringSize = 1.15 * (0.95 + 0.08 * Math.sin(time * 2.5 + ph));
          flat(x, floor + 0.025, z, ringSize, rg.map(v => v * fade));
          flat(x, floor + 0.02, z, 1.9, rg.map(v => v * 0.35 * fade), UV.glow);
          const motes = name === 'crystal' ? 2 : name === 'talisman' ? 2 : 1;
          for (let k = 0; k < motes; k++) {
            const cyc = (time * 0.6 + k / motes + ph) % 1;
            if (name === 'crystal') {
              const a = time * 2.2 + k * Math.PI + ph;
              billboard(x + Math.cos(a) * 0.32, y + Math.sin(time * 3 + k) * 0.1, z + Math.sin(a) * 0.32, 0.16, look.spark.map(v => v * 0.8 * fade), UV.spark);
            } else {
              const drift = Math.sin(cyc * 6 + k * 2 + ph) * 0.12;
              billboard(x + drift, y - 0.2 + cyc * 1.1, z + drift * 0.5, 0.12 * (1 - cyc * 0.5), look.spark.map(v => v * Math.sin(cyc * Math.PI) * 0.9 * fade), UV.spark);
            }
          }
        }
        for (const [name, mesh] of Object.entries(meshes)) {
          mesh.count = Math.min(MAX, counts[name]);
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        // collect sparkles fly toward the hero's chest
        for (let i = sparks.length - 1; i >= 0; i--) {
          const sp = sparks[i];
          sp.age += dt;
          if (sp.age > sp.life) { sparks.splice(i, 1); continue; }
          // burst outward first, then home in on the hero's chest
          if (sp.age > sp.life * 0.35) {
            const target = p4.set(heroSeen.x, heroSeen.y + 1.0, heroSeen.z);
            sp.v.lerp(target.sub(sp.p).multiplyScalar(7), Math.min(1, dt * 9));
          } else sp.v.multiplyScalar(1 - dt * 2);
          sp.p.addScaledVector(sp.v, dt);
          const k = 1 - sp.age / sp.life;
          billboard(sp.p.x, sp.p.y, sp.p.z, 0.34 * (0.5 + k), sp.color.map(v => v * k * 1.4), UV.spark);
        }
        spriteGeometry2.setDrawRange(0, nq * 6);
        for (const name of ['position', 'corner', 'uv', 'color']) spriteGeometry2.attributes[name].needsUpdate = true;
        sprites.visible = nq > 0;
      },
    };
  }

  // ================================================================== update / camera
  let gateState = layout.gates.map(() => false);
  const CAMERA_LIMITS = options.cameraLimits ?? true;
  const heroSeen = new THREE.Vector3(0, 0, 0);
  function constrainCamera(position, heroPosition) {
    heroSeen.copy(heroPosition);
    layout.gates.forEach((gate, i) => {
      if (gateState[i]) return;
      if (heroPosition.z < gate.z && position.z > gate.z - 0.35) position.z = gate.z - 0.35;
      else if (heroPosition.z > gate.z && position.z < gate.z + 0.35) position.z = gate.z + 0.35;
    });
    if (CAMERA_LIMITS) {
      // keep the camera in front of the shop houses / stalls (it would otherwise clip into facades)
      if (position.z > layout.segments[0].minZ - 1) position.x = Math.max(-9.0, Math.min(9.0, position.x));
      else if (position.z > layout.segments[1].minZ) {
        const dx = position.x - P.x, dz = position.z - P.z, d = Math.hypot(dx, dz), max = P.r + 2.2;
        if (d > max) { position.x = P.x + dx / d * max; position.z = P.z + dz / d * max; }
      } else if (position.z > layout.segments[2].minZ) position.x = Math.max(-14.5, Math.min(14.5, position.x));
    }
    position.y = Math.max(position.y, heightAt(position.x, position.z) + 0.6);
    return position;
  }

  let clock = 0;
  function update(view, dt = 0, time) {
    if (typeof view === 'number') { const t = view; view = dt; dt = t; }   // also accepts update(dt, view)
    clock = time ?? clock + dt;
    glowMaterial.uniforms.time.value = clock;
    portalMaterial.uniforms.time.value = clock;
    waterMaterial.uniforms.time.value = clock;
    if (!view) { breakables.update(dt); pickupFx.update(null, dt); return; }
    gateState = view.gates.map(gate => gate.open);
    for (let i = 0; i < barriers.length; i++) {
      const mesh = barriers[i];
      const target = view.gates[i]?.open ? 1 : 0;
      mesh.userData.open += (target - mesh.userData.open) * Math.min(1, dt * 3);
      mesh.visible = mesh.userData.open < 0.985;
      mesh.scale.y = 3.6 * (1 - mesh.userData.open * 0.85);
      mesh.material.uniforms.time.value = clock;
      mesh.material.uniforms.fade.value = (1 - mesh.userData.open) * (1 + Math.sin(clock * 3 + i) * 0.12);
    }
    // soul gate portal brightens once the last barrier opens
    portalMaterial.uniforms.power.value = 0.8 + (view.segment >= 3 ? 0.5 : 0) + Math.sin(clock * 1.3) * 0.08;
    view.lanterns.forEach((state, i) => {
      const lantern = demonLanterns[i];
      if (!lantern) return;
      if (state.broken) {
        lantern.body.position.set(lantern.base.x + 0.45, lantern.y + 0.45, lantern.base.z);
        lantern.body.rotation.set(0.3, 0, 1.25);
        lantern.material.color.setRGB(0.25, 0.2, 0.25);
        lantern.halo.visible = false;
      } else {
        const ratio = state.hp / state.maxHp;
        const hurt = ratio < 1 ? Math.sin(clock * 14) * 0.2 : 0;
        lantern.body.position.set(lantern.base.x, lantern.base.y + Math.sin(clock * 2 + i) * 0.05, lantern.base.z);
        lantern.body.rotation.set(0, clock * 0.3 + i, Math.sin(clock * 1.4 + i) * 0.06);
        const k = 0.6 + ratio * 0.5 + hurt;
        lantern.material.color.setRGB(k, k * (0.75 + ratio * 0.25), k * (0.75 + ratio * 0.25));
        lantern.halo.visible = true;
        lantern.halo.position.copy(lantern.body.position);
        lantern.halo.material.opacity = 0.5 + ratio * 0.5 + hurt;
      }
      lantern.body.visible = view.segment <= 2;
      lantern.halo.visible = lantern.halo.visible && view.segment <= 1;
    });
    lanternPostMesh.visible = view.segment <= 2;
    const lamp = view.lamp;
    if (lamp.down) {
      flame.material.color.setRGB(0.15, 0.1, 0.25);
      flame.scale.set(0.5, 0.5, 1);
      lampHalo.material.color.setRGB(0.05, 0.03, 0.1);
    } else {
      const ratio = lamp.hp / lamp.maxHp;
      const color = lamp.secured ? new THREE.Color(1.4, 1.1, 0.5) : new THREE.Color(1.5, 0.35, 0.3).lerp(new THREE.Color(0.4, 1.4, 1.3), ratio);
      flame.material.color.copy(color);
      const pulse = 1 + Math.sin(clock * 9) * 0.05 + Math.sin(clock * 23) * 0.03;
      flame.scale.set(1.2 * pulse, 1.9 * (2 - pulse), 1);
      lampHalo.material.color.copy(color).multiplyScalar(0.55);
    }
    pickupFx.update(view, dt);
    // telegraphs
    const live = new Set();
    for (const hazard of view.hazards) {
      live.add(hazard.id);
      const entry = decalFor(hazard);
      const p = toWorld(hazard.x, hazard.y);
      entry.group.position.set(p.x, heightAt(p.x, p.z) + 0.05, p.z);
      const k = hazard.progress;
      if (hazard.shape === 'circle') {
        const r = hazard.radius / 60;
        entry.edge.scale.setScalar(r);
        entry.fill.scale.setScalar(Math.max(0.01, r * k));
      } else {
        const length = hazard.length / 60, width = hazard.width / 60;
        entry.group.rotation.y = Math.atan2(-Math.cos(hazard.facing), -Math.sin(hazard.facing));
        entry.edge.scale.set(width, length, 1);
        entry.fill.scale.set(width, Math.max(0.01, length * k), 1);
        entry.edgeMaterial.opacity = 0.5;
      }
      entry.fillMaterial.opacity = 0.25 + 0.45 * k;
    }
    for (const [id, entry] of decals) if (!live.has(id)) {
      root.remove(entry.group);
      entry.edgeMaterial.dispose(); entry.fillMaterial.dispose();
      decals.delete(id);
    }
    breakables.sync(view.breakables);
    breakables.update(dt);
  }

  function stats() {
    let textureBytes = 0;
    const seen = new Set();
    for (const texture of textures) {
      const image = texture.image;
      if (!image || seen.has(image)) continue;
      seen.add(image);
      const bytes = (image.width || 0) * (image.height || 0) * 4;
      textureBytes += texture.generateMipmaps === false || texture.isDataTexture ? bytes : Math.round(bytes * 4 / 3);
    }
    const ms = (a, b) => Math.round(timing[b] - timing[a]);
    return { timingMs: { fetch: ms('start', 'fetched'), geometry: ms('fetched', 'geometry'), lightmap: ms('geometry', 'lightmap'), bakeAndMerge: ms('lightmap', 'meshes') }, staticMeshes: staticMeshes.length, staticTriangles: triangles, lights: lights.length, lightmap: [lmW, lmH], textureBytes, textures: seen.size };
  }

  return {
    group: root,
    heightAt,
    update,
    constrainCamera,
    breakables,
    /** Optional: forward director events ('pickup' / 'pickupLost') for exact collect vs expire animations. */
    onPickupEvent: event => pickupFx.onEvent(event),
    stats,
    dispose() {
      scene.remove(root);
      for (const entry of decals.values()) { entry.edgeMaterial.dispose(); entry.fillMaterial.dispose(); }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };

  function rectVec(uv) { return new THREE.Vector4(uv.u0, uv.v0, uv.u1, uv.v1); }
}

/**
 * Synchronous drop-in for march-world.js createMarchWorld(THREE, scene): heightAt / constrainCamera
 * work immediately, update() is buffered until the art has loaded. `ready` resolves to the art.
 */
export function createMarchWorld(THREE, scene, layout = LAYOUT, options = {}) {
  let art = null, disposed = false, lastView = null;
  const heightAt = options.heightAt || layoutHeightAt;
  const pending = [];
  const breakables = {
    break: index => art ? art.breakables.break(index) : pending.push(index),
    reset: () => { pending.length = 0; art?.breakables.reset(); },
    sync: states => art?.breakables.sync(states),
    isBroken: index => art ? art.breakables.isBroken(index) : pending.includes(index),
    update: dt => art?.breakables.update(dt),
  };
  const facade = {
    group: null,
    heightAt,
    ready: createMarchArt(THREE, scene, layout, options).then(result => {
      if (disposed) { result.dispose(); return null; }
      art = result;
      facade.group = art.group;
      for (const index of pending.splice(0)) art.breakables.break(index);
      if (lastView) art.update(lastView, 0);
      return art;
    }),
    update(view, dt, time) {
      if (typeof view === 'number') { const t = view; view = dt; dt = t; }
      lastView = view;
      art?.update(view, dt, time);
    },
    constrainCamera(position, heroPosition) {
      if (art) return art.constrainCamera(position, heroPosition);
      position.y = Math.max(position.y, heightAt(position.x, position.z) + 0.6);
      return position;
    },
    breakables,
    onPickupEvent: event => art?.onPickupEvent(event),
    stats: () => art?.stats() ?? null,
    dispose() { disposed = true; art?.dispose(); },
  };
  return facade;
}
