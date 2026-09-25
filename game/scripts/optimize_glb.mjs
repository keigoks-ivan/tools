// Pure-Node GLB post-processor. No THREE.js dependency (numeric/binary work only).
// Applies only transforms that GLTFLoader.js (vendored, r166) decodes natively:
//  1. Drop animation channels that are constant AND equal to the target node's rest value.
//  2. Per-track keyframe decimation (lerp/slerp reconstruction within tolerance), skipped for
//     a configurable set of "protected" clips (subclip-sensitive).
//  3. Rotation (quaternion) outputs -> normalized SHORT (int16).
//  4. Morph POSITION/NORMAL deltas: left as-is if already sparse-encoded (verified optimal);
//     otherwise sparse-encoded when smaller.
//  5. Indices -> UNSIGNED_SHORT when max index < 65535 (left as-is if already so).
//  6. TEXCOORD_0 -> UNSIGNED_SHORT normalized when all values in [0,1] (per-accessor check).
//     WEIGHTS_0 -> UNSIGNED_SHORT normalized, re-quantized to sum to 65535 per vertex.
//  7. NORMAL -> SHORT normalized (int16, stride 8, via KHR_mesh_quantization).
//  8. Everything else (images, materials, skins, node hierarchy, names, morph target names)
//     is byte-identical, only relocated into consolidated "one bufferView per purpose" buffers.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// glTF constants
// ---------------------------------------------------------------------------
const COMPONENT = {
  5120: { Ctor: Int8Array, size: 1, signed: true },
  5121: { Ctor: Uint8Array, size: 1, signed: false },
  5122: { Ctor: Int16Array, size: 2, signed: true },
  5123: { Ctor: Uint16Array, size: 2, signed: false },
  5125: { Ctor: Uint32Array, size: 4, signed: false },
  5126: { Ctor: Float32Array, size: 4, signed: true },
};
const TYPESIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const NORM_DIVISOR = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

// ---------------------------------------------------------------------------
// GLB read/write
// ---------------------------------------------------------------------------
function readGLB(path) {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB: ' + path);
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    o += 8 + len;
  }
  if (!json) throw new Error('no JSON chunk in ' + path);
  return { json, bin: bin || Buffer.alloc(0) };
}

function writeGLB(json, bin) {
  let jsonStr = JSON.stringify(json);
  let jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]); // spaces
  const binPad = (4 - (bin.length % 4)) % 4;
  const binBuf = binPad ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : bin;
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  const binChunkOff = 20 + jsonBuf.length;
  out.writeUInt32LE(binBuf.length, binChunkOff);
  out.writeUInt32LE(0x004e4942, binChunkOff + 4);
  binBuf.copy(out, binChunkOff + 8);
  return out;
}

// ---------------------------------------------------------------------------
// Output builder: accumulates data into named "purposes", each becomes exactly
// one bufferView in the final file. Accessor bufferView fields are marker
// objects resolved once all purposes are known.
// ---------------------------------------------------------------------------
function MARK(name) { return { __purpose: name }; }

class OutBuilder {
  constructor() {
    this.purposes = new Map(); // name -> {parts:[], length, target, byteStride}
    this.accessors = [];
    this.dedupe = new Map();
  }
  _purpose(name, target, byteStride) {
    let p = this.purposes.get(name);
    if (!p) { p = { parts: [], length: 0, target, byteStride }; this.purposes.set(name, p); }
    else {
      if (p.target !== target) throw new Error('purpose target mismatch: ' + name);
      if (p.byteStride !== byteStride) throw new Error('purpose byteStride mismatch: ' + name);
    }
    return p;
  }
  push(name, buf, align, target, byteStride) {
    const p = this._purpose(name, target, byteStride);
    const pad = (align - (p.length % align)) % align;
    if (pad) { p.parts.push(Buffer.alloc(pad)); p.length += pad; }
    const offset = p.length;
    p.parts.push(buf);
    p.length += buf.length;
    return offset;
  }
  addAccessor(def) { this.accessors.push(def); return this.accessors.length - 1; }
  dedupPush(cacheKey, name, buf, align, target, byteStride, defTemplate) {
    const hash = createHash('sha1').update(buf).digest('hex') + ':' + cacheKey;
    if (this.dedupe.has(hash)) return this.dedupe.get(hash);
    const off = this.push(name, buf, align, target, byteStride);
    const def = { ...defTemplate, bufferView: MARK(name) };
    if (off) def.byteOffset = off;
    const idx = this.addAccessor(def);
    this.dedupe.set(hash, idx);
    return idx;
  }
  // Finalize: build final bin buffer, resolve bufferView markers, return {bin, bufferViews}
  finalize(json) {
    const bufferViews = [];
    const purposeIndex = new Map();
    const parts = [];
    let cursor = 0;
    const names = [...this.purposes.keys()].sort();
    for (const name of names) {
      const p = this.purposes.get(name);
      const pad = (4 - (cursor % 4)) % 4;
      if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
      const byteOffset = cursor;
      const buf = Buffer.concat(p.parts);
      parts.push(buf);
      cursor += buf.length;
      const bv = { buffer: 0, byteOffset, byteLength: buf.length };
      if (p.byteStride) bv.byteStride = p.byteStride;
      if (p.target) bv.target = p.target;
      bufferViews.push(bv);
      purposeIndex.set(name, bufferViews.length - 1);
    }
    const resolve = (obj) => {
      if (obj && typeof obj === 'object' && obj.__purpose) return purposeIndex.get(obj.__purpose);
      return obj;
    };
    for (const a of this.accessors) {
      if (a.bufferView !== undefined) a.bufferView = resolve(a.bufferView);
      if (a.sparse) {
        a.sparse.indices.bufferView = resolve(a.sparse.indices.bufferView);
        a.sparse.values.bufferView = resolve(a.sparse.values.bufferView);
        if (!a.sparse.indices.byteOffset) delete a.sparse.indices.byteOffset;
        if (!a.sparse.values.byteOffset) delete a.sparse.values.byteOffset;
      }
      if (!a.byteOffset) delete a.byteOffset;
    }
    for (const img of json.images || []) {
      if (img.bufferView !== undefined) img.bufferView = resolve(img.bufferView);
    }
    return { bin: Buffer.concat(parts), bufferViews };
  }
}

// ---------------------------------------------------------------------------
// Accessor decode (to Float32 physical values) / raw byte access
// ---------------------------------------------------------------------------
function decodeAccessor(json, bin, idx) {
  const a = json.accessors[idx];
  if (a.sparse) throw new Error('decodeAccessor: unexpected sparse accessor ' + idx);
  const itemSize = TYPESIZE[a.type];
  const comp = COMPONENT[a.componentType];
  const bv = json.bufferViews[a.bufferView];
  const byteOffset = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const itemBytes = comp.size * itemSize;
  const stride = bv.byteStride || itemBytes;
  const out = new Float32Array(a.count * itemSize);
  const norm = !!a.normalized;
  const div = NORM_DIVISOR[a.componentType];
  if (comp.Ctor === Float32Array && stride === itemBytes) {
    out.set(new Float32Array(bin.buffer, bin.byteOffset + byteOffset, a.count * itemSize));
  } else {
    const dv = new DataView(bin.buffer, bin.byteOffset);
    const readerName = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < itemSize; c++) {
        const off = byteOffset + i * stride + c * comp.size;
        let v = comp.size === 1 ? dv[readerName](off) : dv[readerName](off, true);
        if (norm) v /= div;
        out[i * itemSize + c] = v;
      }
    }
  }
  return { values: out, itemSize, count: a.count };
}

function rawBytes(json, bin, bvIdx, extraOffset, length) {
  const bv = json.bufferViews[bvIdx];
  const start = (bv.byteOffset || 0) + (extraOffset || 0);
  return bin.subarray(start, start + length);
}

// ---------------------------------------------------------------------------
// Quantization helpers
// ---------------------------------------------------------------------------
function quantizeSigned16(values, n) {
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, values[i]));
    out[i] = Math.round(v * 32767);
  }
  return out;
}
function quantizeUnorm16(values, n) {
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, values[i]));
    out[i] = Math.round(v * 65535);
  }
  return out;
}
function quantizeWeightsSum65535(values, count) {
  const out = new Uint16Array(count * 4);
  for (let i = 0; i < count; i++) {
    const w = [values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3]];
    const sum = w[0] + w[1] + w[2] + w[3];
    let q;
    if (sum <= 0) { q = [65535, 0, 0, 0]; }
    else {
      const raw = w.map((x) => (x / sum) * 65535);
      const floors = raw.map(Math.floor);
      let rem = 65535 - floors.reduce((a, b) => a + b, 0);
      const order = [0, 1, 2, 3].map((j) => ({ j, frac: raw[j] - floors[j] })).sort((a, b) => b.frac - a.frac);
      q = floors.slice();
      for (let k = 0; k < rem; k++) q[order[k % 4].j]++;
    }
    for (let c = 0; c < 4; c++) out[i * 4 + c] = q[c];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Quaternion slerp — ported verbatim from three.module.js Quaternion.slerpFlat
// so keyframe-reduction decisions match runtime interpolation exactly.
// ---------------------------------------------------------------------------
function slerpFlat(qa, qb, t) {
  let x0 = qa[0], y0 = qa[1], z0 = qa[2], w0 = qa[3];
  const x1 = qb[0], y1 = qb[1], z1 = qb[2], w1 = qb[3];
  if (t === 0) return [x0, y0, z0, w0];
  if (t === 1) return [x1, y1, z1, w1];
  if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
    let s = 1 - t;
    const cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
    const dir = cos >= 0 ? 1 : -1;
    const sqrSin = 1 - cos * cos;
    if (sqrSin > Number.EPSILON) {
      const sin = Math.sqrt(sqrSin);
      const len = Math.atan2(sin, cos * dir);
      s = Math.sin(s * len) / sin;
      t = Math.sin(t * len) / sin;
    }
    const tDir = t * dir;
    x0 = x0 * s + x1 * tDir; y0 = y0 * s + y1 * tDir; z0 = z0 * s + z1 * tDir; w0 = w0 * s + w1 * tDir;
    if (s === 1 - t) {
      const f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
      x0 *= f; y0 *= f; z0 *= f; w0 *= f;
    }
  }
  return [x0, y0, z0, w0];
}
function quatAngleError(a, b) {
  // Normalize both inputs first: source float32 quaternions (and slerp outputs) are not always
  // *exactly* unit-length, and acos() is numerically unstable near 1 — without normalizing,
  // two bit-identical quaternions can report a spurious ~1e-3 rad "error" from float rounding
  // alone, which both masks real error and creates a noise floor no tolerance can get under.
  const na = 1 / Math.hypot(a[0], a[1], a[2], a[3]);
  const nb = 1 / Math.hypot(b[0], b[1], b[2], b[3]);
  let d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) * na * nb;
  d = Math.min(1, Math.abs(d));
  return 2 * Math.acos(d);
}
function lerpVec(a, b, t, n) { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = a[i] + (b[i] - a[i]) * t; return out; }
function vecNormError(a, b, n) { let s = 0; for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }

// ---------------------------------------------------------------------------
// Node rest transforms
// ---------------------------------------------------------------------------
function nodeRest(nodeDef, path) {
  if (path === 'translation') return nodeDef.translation ? nodeDef.translation.slice() : [0, 0, 0];
  if (path === 'rotation') return nodeDef.rotation ? nodeDef.rotation.slice() : [0, 0, 0, 1];
  if (path === 'scale') return nodeDef.scale ? nodeDef.scale.slice() : [1, 1, 1];
  return null;
}
function isConstantEqualsRest(path, values, itemSize, count, restV, eps) {
  if (path === 'rotation') {
    for (let i = 0; i < count; i++) {
      let maxdP = 0, maxdN = 0;
      for (let c = 0; c < 4; c++) {
        const v = values[i * 4 + c];
        maxdP = Math.max(maxdP, Math.abs(v - restV[c]));
        maxdN = Math.max(maxdN, Math.abs(v + restV[c]));
      }
      if (maxdP > eps && maxdN > eps) return false;
    }
    return true;
  }
  for (let i = 0; i < count; i++) {
    let maxd = 0;
    for (let c = 0; c < itemSize; c++) maxd = Math.max(maxd, Math.abs(values[i * itemSize + c] - restV[c]));
    if (maxd > eps) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Keyframe decimation (greedy sliding-window line/slerp simplification).
// Always returns index 0 and count-1. Only called for LINEAR tracks, count>2.
// ---------------------------------------------------------------------------
function decimate(times, values, itemSize, count, path, tol) {
  if (count <= 2) return Array.from({ length: count }, (_, i) => i);
  const getVal = (i) => values.subarray(i * itemSize, (i + 1) * itemSize);
  const interp = path === 'rotation'
    ? (i, j, t) => slerpFlat(getVal(i), getVal(j), t)
    : (i, j, t) => lerpVec(getVal(i), getVal(j), t, itemSize);
  const err = path === 'rotation'
    ? (iv, av) => quatAngleError(iv, av)
    : (iv, av) => vecNormError(iv, av, itemSize);
  const keep = [0];
  let base = 0, cand = 1;
  while (cand < count - 1) {
    const next = cand + 1;
    const t0 = times[base], t1 = times[next];
    let ok = true;
    const denom = t1 - t0;
    for (let k = base + 1; k <= cand; k++) {
      const alpha = denom > 0 ? (times[k] - t0) / denom : 0;
      const iv = interp(base, next, alpha);
      if (err(iv, getVal(k)) > tol) { ok = false; break; }
    }
    if (ok) cand = next;
    else { keep.push(cand); base = cand; cand = base + 1; }
  }
  keep.push(count - 1);
  return keep;
}

// ---------------------------------------------------------------------------
// Main per-file processor
// ---------------------------------------------------------------------------
function processFile(inPath, outPath, cfg) {
  const { json, bin } = readGLB(inPath);
  const out = new OutBuilder();
  const stats = { file: inPath, anim: {}, mesh: {}, morph: {}, images: {} };

  // ---- nodes / rest transforms (pass through unchanged) ----
  const nodes = json.nodes;

  // ---- animations ----
  const newAnimations = [];
  let animDroppedChannels = 0, animKeptChannels = 0;
  let origAnimOutputBytes = 0, newAnimOutputBytes = 0, origAnimInputBytes = 0, newAnimInputBytes = 0;
  const seenOutputAccessors = new Set();
  for (const an of json.animations || []) {
    const protectedClip = cfg.protectedClips.has(an.name);
    const newChannels = [];
    const newSamplers = [];
    for (const ch of an.channels) {
      const sampler = an.samplers[ch.sampler];
      const path = ch.target.path;
      const nodeIndex = ch.target.node;
      if (!seenOutputAccessors.has(sampler.output)) {
        seenOutputAccessors.add(sampler.output);
        const oa = json.accessors[sampler.output];
        origAnimOutputBytes += oa.count * TYPESIZE[oa.type] * COMPONENT[oa.componentType].size;
      }
      if (path !== 'translation' && path !== 'rotation' && path !== 'scale') {
        // weights channels: not present in either target file; copy through untouched defensively.
        const inDec = decodeAccessor(json, bin, sampler.input);
        const outDec = decodeAccessor(json, bin, sampler.output);
        const inBuf = Buffer.from(inDec.values.buffer, inDec.values.byteOffset, inDec.values.byteLength);
        const outBuf = Buffer.from(outDec.values.buffer, outDec.values.byteOffset, outDec.values.byteLength);
        const inIdx = out.dedupPush('anim-in', 'anim-input', Buffer.from(inBuf), 4, undefined, undefined,
          { componentType: 5126, type: 'SCALAR', count: inDec.count });
        const outIdx = out.dedupPush('anim-weights', 'anim-weights-output', Buffer.from(outBuf), 4, undefined, undefined,
          { componentType: 5126, type: json.accessors[sampler.output].type, count: outDec.count });
        newSamplers.push({ input: inIdx, output: outIdx, interpolation: sampler.interpolation });
        newChannels.push({ sampler: newSamplers.length - 1, target: ch.target });
        animKeptChannels++;
        continue;
      }
      const inDec = decodeAccessor(json, bin, sampler.input);
      const outDec = decodeAccessor(json, bin, sampler.output);
      const itemSize = outDec.itemSize;
      const restV = nodeRest(nodes[nodeIndex], path);

      if (isConstantEqualsRest(path, outDec.values, itemSize, outDec.count, restV, cfg.restEps)) {
        animDroppedChannels++;
        continue; // three.js AnimationMixer restores rest pose for unanimated properties
      }
      animKeptChannels++;

      let keepIdx;
      const isLinear = (sampler.interpolation || 'LINEAR') === 'LINEAR';
      if (!protectedClip && isLinear && outDec.count > 2) {
        const tol = path === 'translation' ? cfg.tol.translation : path === 'rotation' ? cfg.tol.rotation : cfg.tol.scale;
        keepIdx = decimate(inDec.values, outDec.values, itemSize, outDec.count, path, tol);
      } else {
        keepIdx = Array.from({ length: outDec.count }, (_, i) => i);
      }

      const times = new Float32Array(keepIdx.length);
      const vals = new Float32Array(keepIdx.length * itemSize);
      for (let i = 0; i < keepIdx.length; i++) {
        times[i] = inDec.values[keepIdx[i]];
        for (let c = 0; c < itemSize; c++) vals[i * itemSize + c] = outDec.values[keepIdx[i] * itemSize + c];
      }

      const inBuf = Buffer.from(times.buffer, times.byteOffset, times.byteLength);
      const inIdx = out.dedupPush('anim-in', 'anim-input', Buffer.from(inBuf), 4, undefined, undefined,
        { componentType: 5126, type: 'SCALAR', count: times.length });

      let outIdx;
      if (path === 'rotation') {
        const q16 = quantizeSigned16(vals, vals.length);
        const outBuf = Buffer.from(q16.buffer, q16.byteOffset, q16.byteLength);
        outIdx = out.dedupPush('anim-rot', 'anim-rotation-output', Buffer.from(outBuf), 4, undefined, undefined,
          { componentType: 5122, type: 'VEC4', count: keepIdx.length, normalized: true });
      } else {
        const outBuf = Buffer.from(vals.buffer, vals.byteOffset, vals.byteLength);
        const purpose = path === 'translation' ? 'anim-translation-output' : 'anim-scale-output';
        outIdx = out.dedupPush('anim-' + path, purpose, Buffer.from(outBuf), 4, undefined, undefined,
          { componentType: 5126, type: 'VEC3', count: keepIdx.length });
      }
      newSamplers.push({ input: inIdx, output: outIdx, interpolation: sampler.interpolation });
      newChannels.push({ sampler: newSamplers.length - 1, target: ch.target });
    }
    newAnimations.push({ name: an.name, channels: newChannels, samplers: newSamplers });
  }
  stats.anim = { droppedChannels: animDroppedChannels, keptChannels: animKeptChannels, origOutputBytes: origAnimOutputBytes };

  // ---- meshes: attributes + indices + morph targets ----
  const newMeshes = [];
  let texcoordQuantized = 0, texcoordKeptFloat = 0;
  for (const mesh of json.meshes) {
    const newPrims = [];
    for (const prim of mesh.primitives) {
      const newAttrs = {};
      for (const [key, accIdx] of Object.entries(prim.attributes)) {
        const base = key.replace(/_\d+$/, '');
        if (base === 'POSITION') {
          newAttrs[key] = copyPassthrough(json, bin, out, accIdx, 'mesh-position', 4, 34962);
        } else if (base === 'JOINTS') {
          newAttrs[key] = copyPassthrough(json, bin, out, accIdx, 'mesh-joints', 4, 34962);
        } else if (base === 'NORMAL') {
          newAttrs[key] = transformNormal(json, bin, out, accIdx);
        } else if (base === 'TEXCOORD') {
          const dec = decodeAccessor(json, bin, accIdx);
          let inRange = true;
          for (let i = 0; i < dec.values.length; i++) { if (dec.values[i] < 0 || dec.values[i] > 1) { inRange = false; break; } }
          if (inRange) {
            texcoordQuantized++;
            const q = quantizeUnorm16(dec.values, dec.values.length);
            const buf = Buffer.from(q.buffer, q.byteOffset, q.byteLength);
            const off = out.push('mesh-texcoord-u16', buf, 4, 34962);
            newAttrs[key] = out.addAccessor({ componentType: 5123, type: 'VEC2', count: dec.count, normalized: true, bufferView: MARK('mesh-texcoord-u16'), byteOffset: off });
          } else {
            texcoordKeptFloat++;
            const buf = Buffer.from(dec.values.buffer, dec.values.byteOffset, dec.values.byteLength);
            const off = out.push('mesh-texcoord-f32', buf, 4, 34962);
            newAttrs[key] = out.addAccessor({ componentType: 5126, type: 'VEC2', count: dec.count, bufferView: MARK('mesh-texcoord-f32'), byteOffset: off });
          }
        } else if (base === 'WEIGHTS') {
          const dec = decodeAccessor(json, bin, accIdx);
          const q = quantizeWeightsSum65535(dec.values, dec.count);
          const buf = Buffer.from(q.buffer, q.byteOffset, q.byteLength);
          const off = out.push('mesh-weights-u16', buf, 4, 34962);
          newAttrs[key] = out.addAccessor({ componentType: 5123, type: 'VEC4', count: dec.count, normalized: true, bufferView: MARK('mesh-weights-u16'), byteOffset: off });
        } else {
          throw new Error('unhandled attribute ' + key);
        }
      }
      const newPrim = { attributes: newAttrs };
      if (prim.indices !== undefined) {
        newPrim.indices = copyIndices(json, bin, out, prim.indices);
      }
      if (prim.material !== undefined) newPrim.material = prim.material;
      if (prim.mode !== undefined) newPrim.mode = prim.mode;
      if (prim.targets) {
        newPrim.targets = prim.targets.map((t) => {
          const nt = {};
          for (const [k, accIdx] of Object.entries(t)) nt[k] = copyMorphAccessor(json, bin, out, accIdx);
          return nt;
        });
      }
      if (prim.extensions) newPrim.extensions = prim.extensions;
      newPrims.push(newPrim);
    }
    const newMesh = { name: mesh.name, primitives: newPrims };
    if (mesh.extras) newMesh.extras = mesh.extras;
    if (mesh.weights) newMesh.weights = mesh.weights;
    newMeshes.push(newMesh);
  }
  stats.mesh = { texcoordQuantized, texcoordKeptFloat };

  // ---- skins ----
  const newSkins = (json.skins || []).map((skin) => {
    const ns = { joints: skin.joints };
    if (skin.name) ns.name = skin.name;
    if (skin.skeleton !== undefined) ns.skeleton = skin.skeleton;
    if (skin.inverseBindMatrices !== undefined) {
      ns.inverseBindMatrices = copyPassthrough(json, bin, out, skin.inverseBindMatrices, 'skin-ibm', 4, undefined);
    }
    return ns;
  });

  // ---- images: byte-identical, each gets its own dedicated (relocated) bufferView.
  // (An image's bufferView must span exactly its own bytes, so images cannot share one
  // consolidated bufferView the way same-purpose accessor data can.)
  const newImages = (json.images || []).map((img, i) => {
    const ni = { ...img };
    if (img.bufferView !== undefined) {
      const bv = json.bufferViews[img.bufferView];
      const bytes = rawBytes(json, bin, img.bufferView, 0, bv.byteLength);
      const purposeName = 'image:' + i;
      out.push(purposeName, Buffer.from(bytes), 4, undefined, undefined);
      ni.bufferView = MARK(purposeName);
    }
    return ni;
  });

  // ---- finalize ----
  const { bin: finalBin, bufferViews } = out.finalize({ images: newImages });

  const newJson = {
    asset: json.asset,
    extensionsUsed: json.extensionsUsed ? json.extensionsUsed.slice() : [],
    extensionsRequired: json.extensionsRequired ? json.extensionsRequired.slice() : [],
    scene: json.scene,
    scenes: json.scenes,
    nodes: json.nodes,
    meshes: newMeshes,
    skins: newSkins,
    animations: newAnimations,
    materials: json.materials,
    textures: json.textures,
    samplers: json.samplers,
    images: newImages,
    accessors: out.accessors,
    bufferViews,
    buffers: [{ byteLength: finalBin.length }],
  };
  if (json.extensions) newJson.extensions = json.extensions;
  if (json.extensionsUsed === undefined) delete newJson.extensionsUsed;
  if (!newJson.extensionsUsed.includes('KHR_mesh_quantization')) newJson.extensionsUsed.push('KHR_mesh_quantization');
  if (!newJson.extensionsRequired.includes('KHR_mesh_quantization')) newJson.extensionsRequired.push('KHR_mesh_quantization');
  if (!newJson.images || !newJson.images.length) delete newJson.images;
  if (!newJson.textures || !newJson.textures.length) delete newJson.textures;
  if (!newJson.samplers || !newJson.samplers.length) delete newJson.samplers;

  const glb = writeGLB(newJson, finalBin);
  writeFileSync(outPath, glb);
  return { stats, outBytes: glb.length, inBytes: readFileSync(inPath).length };
}

function copyPassthrough(json, bin, out, accIdx, purposeName, align, target) {
  const a = json.accessors[accIdx];
  const comp = COMPONENT[a.componentType];
  const itemSize = TYPESIZE[a.type];
  const bv = json.bufferViews[a.bufferView];
  const byteLen = a.count * itemSize * comp.size;
  const stride = bv.byteStride || itemSize * comp.size;
  if (stride !== itemSize * comp.size) throw new Error('copyPassthrough: unexpected interleaving on accessor ' + accIdx);
  const bytes = rawBytes(json, bin, a.bufferView, a.byteOffset || 0, byteLen);
  const off = out.push(purposeName, Buffer.from(bytes), align, target);
  const def = { componentType: a.componentType, type: a.type, count: a.count, bufferView: MARK(purposeName) };
  if (off) def.byteOffset = off;
  if (a.normalized) def.normalized = true;
  if (a.min) def.min = a.min;
  if (a.max) def.max = a.max;
  return out.addAccessor(def);
}

function copyIndices(json, bin, out, accIdx) {
  const a = json.accessors[accIdx];
  if (a.componentType !== 5123 && a.componentType !== 5121) {
    // would need downcast from UINT to USHORT; not needed for these two files (already ushort).
    throw new Error('unexpected index componentType ' + a.componentType + ' — implement downcast if this triggers');
  }
  return copyPassthrough(json, bin, out, accIdx, 'mesh-indices', 4, 34963);
}

function transformNormal(json, bin, out, accIdx) {
  const dec = decodeAccessor(json, bin, accIdx);
  const q = quantizeSigned16(dec.values, dec.count * 3);
  const bytes = Buffer.alloc(dec.count * 8);
  for (let i = 0; i < dec.count; i++) {
    bytes.writeInt16LE(q[i * 3 + 0], i * 8 + 0);
    bytes.writeInt16LE(q[i * 3 + 1], i * 8 + 2);
    bytes.writeInt16LE(q[i * 3 + 2], i * 8 + 4);
    bytes.writeInt16LE(0, i * 8 + 6);
  }
  const off = out.push('mesh-normal-i16', bytes, 8, 34962, 8);
  const def = { componentType: 5122, type: 'VEC3', count: dec.count, normalized: true, bufferView: MARK('mesh-normal-i16') };
  if (off) def.byteOffset = off;
  return out.addAccessor(def);
}

function copyMorphAccessor(json, bin, out, accIdx) {
  const a = json.accessors[accIdx];
  const newAcc = { componentType: a.componentType, type: a.type, count: a.count };
  if (a.min) newAcc.min = a.min;
  if (a.max) newAcc.max = a.max;
  if (a.normalized) newAcc.normalized = true;
  if (a.bufferView !== undefined) {
    const comp = COMPONENT[a.componentType];
    const itemSize = TYPESIZE[a.type];
    const byteLen = a.count * itemSize * comp.size;
    const bytes = rawBytes(json, bin, a.bufferView, a.byteOffset || 0, byteLen);
    const off = out.push('morph-base', Buffer.from(bytes), 4);
    newAcc.bufferView = MARK('morph-base');
    if (off) newAcc.byteOffset = off;
  }
  if (a.sparse) {
    const sc = a.sparse.count;
    const idxComp = COMPONENT[a.sparse.indices.componentType];
    const idxBytes = rawBytes(json, bin, a.sparse.indices.bufferView, a.sparse.indices.byteOffset || 0, sc * idxComp.size);
    const valComp = COMPONENT[a.componentType];
    const valItemBytes = TYPESIZE[a.type] * valComp.size;
    const valBytes = rawBytes(json, bin, a.sparse.values.bufferView, a.sparse.values.byteOffset || 0, sc * valItemBytes);
    const idxPurpose = 'morph-sparse-idx-' + a.sparse.indices.componentType;
    const idxOff = out.push(idxPurpose, Buffer.from(idxBytes), idxComp.size);
    const valOff = out.push('morph-sparse-val', Buffer.from(valBytes), 4);
    newAcc.sparse = {
      count: sc,
      indices: { bufferView: MARK(idxPurpose), byteOffset: idxOff, componentType: a.sparse.indices.componentType },
      values: { bufferView: MARK('morph-sparse-val'), byteOffset: valOff },
    };
  }
  return out.addAccessor(newAcc);
}

export { processFile, readGLB, writeGLB };

// ---------------------------------------------------------------------------
// CLI（Blender 匯出後再跑一次，GLB 約小 30～44%，不需要任何解碼器）
//   node game/scripts/optimize_glb.mjs hero  <in.glb> <out.glb>   紫刃：slash1/2/3、heavy、heavyfin 不刪關鍵格（battle.js 用 subclip 切）
//   node game/scripts/optimize_glb.mjs oni   <in.glb> <out.glb>
// 驗收：遊戲尺度下蒙皮頂點位移 < 0.5 mm（2026-09-25 實測最大值：紫刃 0.21 mm、鬼兵 0.32 mm；片長、形態鍵不變）
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind, inPath, outPath] = process.argv.slice(2);
  if (!['hero', 'oni'].includes(kind) || !inPath || !outPath) {
    console.error('usage: node optimize_glb.mjs hero|oni <in.glb> <out.glb>');
    process.exit(1);
  }
  // rotation tolerance 0.0001 rad: 0.0005 rad allowed ~1.4 mm error on long chains (sword tip via shoulder/chest)
  const TOL_ROT = 0.0001, TOL_TRANS_MM = 0.05, TOL_SCALE = 1e-4;
  const HERO_SCALE = 1.0300573968041216; // meters-per-model-unit at the in-game height of 1.78 m
  const cfg = kind === 'hero'
    ? { protectedClips: new Set(['slash1', 'slash2', 'slash3', 'heavy', 'heavyfin']), restEps: 1e-6, tol: { translation: (TOL_TRANS_MM / 1000) / HERO_SCALE, rotation: TOL_ROT, scale: TOL_SCALE } }
    : { protectedClips: new Set(), restEps: 1e-6, tol: { translation: TOL_TRANS_MM / 1000, rotation: TOL_ROT, scale: TOL_SCALE } };
  const r = processFile(inPath, outPath, cfg);
  console.log(inPath, '->', outPath, r.inBytes, '->', r.outBytes, `(${((1 - r.outBytes / r.inBytes) * 100).toFixed(1)}% smaller)`);
  console.log('  anim channels dropped', r.stats.anim.droppedChannels, 'kept', r.stats.anim.keptChannels);
}
