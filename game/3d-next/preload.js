/**
 * 預載與進度（boot.js、battle.js 共用；純邏輯部分由 game/tests/preload-3d.test.mjs 驗證）
 *
 * 標題畫面一畫出來就在背景下載開戰要用的檔案（角色、鬼兵、場景貼圖、特效貼圖、JS 模組），
 * 下載完的內容留在記憶體，createBattle 直接拿來用，不會再下載一次。音樂與音效排在這些之後才抓，
 * 不擋開戰；解碼仍在按下開始（解鎖音訊）之後由 audio.js 做。
 *
 * 進度條按位元組加權：檔案用實際下載量，JS 模組整包算一項，解析／建場景／編 shader 這些步驟
 * 用「預估毫秒 × 下載速度」換成等值位元組，並依經過時間給部分進度，所以不會卡在 99%。
 */

export const STAGE = {
  hero: '角色模型', oni: '鬼兵', scene: '夜市場景', fx: '特效', engine: '3D 引擎', audio: '音樂', build: '準備戰場',
};

/** 步驟換算用的頻寬（位元組／毫秒），約等於 9 Mbps 的行動網路。 */
export const BYTES_PER_MS = 1100;

const VERSIONS = {
  hero: '20260925d', rumi: '20260924b', oni: '20260925b', march: '20260925b', fx: '20260925a',
};

/**
 * 開戰要用的檔案與步驟（順序＝進度標籤的先後）。bytes 是解壓後的大小，只用來加權；
 * game/tests/preload-3d.test.mjs 會比對磁碟上的實際大小。
 * @param {{ hero?: 'vroid'|'rumi', march?: boolean, base?: string }} options base = game/ 目錄的網址
 */
export function assetPlan({ hero = 'vroid', march = true, base = new URL('../', import.meta.url).href } = {}) {
  const vroid = hero !== 'rumi';
  const url = (path, v) => `${base}${path}${v ? `?v=${v}` : ''}`;
  const plan = [];
  const file = (id, stage, path, v, bytes, as, extra = {}) => plan.push({ id, stage, kind: 'file', url: url(path, v), bytes, as, blocking: true, ...extra });
  const step = (id, stage, ms) => plan.push({ id, stage, kind: 'step', ms, bytes: Math.round(ms * BYTES_PER_MS), blocking: true });
  if (vroid) {
    file('hero', 'hero', 'assets/heroes/swordswoman-v4.glb', VERSIONS.hero, 2946496, 'buffer');
    step('hero-parse', 'hero', 200);
    file('oni', 'oni', 'assets/enemies/oni-v2.glb', VERSIONS.oni, 1144008, 'buffer', { optional: true });
    step('oni-parse', 'oni', 100);
  } else {
    file('hero', 'hero', 'assets/heroes/rumi-v2.glb', VERSIONS.rumi, 1800536, 'buffer');
    step('hero-parse', 'hero', 200);
  }
  if (vroid && march) {
    file('march-atlas', 'scene', 'assets/march/atlas.json', VERSIONS.march, 2063, 'json');
    file('march-props', 'scene', 'assets/march/march-props.webp', VERSIONS.march, 396774, 'blob');
    file('march-stone', 'scene', 'assets/march/march-stone.webp', VERSIONS.march, 258568, 'blob');
    file('march-sky', 'scene', 'assets/march/march-sky.webp', VERSIONS.march, 95296, 'blob');
    step('world', 'scene', 450);
  }
  if (vroid) {
    file('fx-particles', 'fx', 'assets/fx/fx-particles.png', VERSIONS.fx, 57073, 'blob');
    file('fx-strips', 'fx', 'assets/fx/fx-strips.png', VERSIONS.fx, 167526, 'blob');
  }
  // three.js＋GLTFLoader＋遊戲模組（battle.js 的整個 import 圖），解壓後約 1.9 MB
  // 模組看不到下載進度：依時間給部分進度，預估時間＝獨占頻寬時的兩倍（其他檔案同時在下載）
  const engineBytes = vroid ? 1875202 : 1600000;
  plan.push({ id: 'engine', stage: 'engine', kind: 'engine', bytes: engineBytes, ms: Math.round(engineBytes * 2 / BYTES_PER_MS), blocking: true });
  step('battle', 'build', 150);
  step('start', 'build', 600);
  if (vroid) {
    // 不擋開戰：等上面的檔案都下載完才抓。檔名、大小與內容雜湊（?v=）從 manifest.json 讀，跟 audio.js 用同一個網址
    plan.push({ id: 'audio', stage: 'audio', kind: 'audio-manifest', url: url('assets/audio/march/manifest.json'), tracks: ['sfx', 'market'], blocking: false });
  }
  return plan;
}

/**
 * 加權進度。只計 blocking 項目；檔案用 set(id, 0..1)，步驟與模組 begin(id) 後依時間給部分進度
 * （最多到該步的 90%），complete(id) 才算滿。未全部完成前 value() 不會到 1。
 */
export class LoadProgress {
  constructor(plan, { now = () => globalThis.performance?.now() ?? Date.now() } = {}) {
    this.now = now;
    this.items = plan.filter(item => item.blocking !== false).map(item => ({ id: item.id, stage: item.stage, kind: item.kind, ms: item.ms || 0, weight: Math.max(1, item.bytes || 0), fraction: 0, done: false, startedAt: null }));
    this.byId = new Map(this.items.map(item => [item.id, item]));
    this.total = this.items.reduce((sum, item) => sum + item.weight, 0);
    this.shown = 0;
  }
  has(id) { return this.byId.has(id); }
  begin(id) { const item = this.byId.get(id); if (item && item.startedAt === null && !item.done) item.startedAt = this.now(); }
  set(id, fraction) {
    const item = this.byId.get(id);
    if (!item || item.done || !(fraction >= 0)) return;
    item.fraction = Math.max(item.fraction, Math.min(0.99, fraction));
  }
  complete(id) { const item = this.byId.get(id); if (item && !item.done) { item.done = true; item.fraction = 1; item.doneAt = this.now(); } }
  /** A failed download / step starts over (its bytes will be fetched again on retry). */
  reset(id) { const item = this.byId.get(id); if (item) { item.done = false; item.fraction = 0; item.startedAt = null; } }
  itemFraction(item, t = this.now()) {
    if (item.done) return 1;
    let f = item.fraction;
    if (item.kind !== 'file' && item.startedAt !== null && item.ms > 0) f = Math.max(f, 0.9 * (1 - Math.exp(-(t - item.startedAt) / item.ms)));
    return f;
  }
  /** 0..1 weighted by bytes; stays below 1 until every blocking item is complete. */
  value(t = this.now()) {
    if (this.done) return 1;
    let sum = 0;
    for (const item of this.items) sum += item.weight * this.itemFraction(item, t);
    return Math.min(0.99, sum / this.total);
  }
  /** Monotonic value for display (a reset after a failure never moves the bar backwards mid-load). */
  display(t = this.now()) { this.shown = Math.max(this.shown, this.value(t)); return this.done ? 1 : this.shown; }
  /** Stage label of the first unfinished item in plan order. */
  stage() { const item = this.items.find(entry => !entry.done); return STAGE[item ? item.stage : 'build']; }
  get done() { return this.items.every(item => item.done); }
  /** True when every blocking file / module has arrived (only CPU steps remain). */
  get downloaded() { return this.items.every(item => item.done || item.kind === 'step'); }
}

/** Reads a fetch Response into an ArrayBuffer, reporting 0..1 against the decoded size. */
export async function readWithProgress(response, expectedBytes, onFraction = () => {}) {
  const encoding = response.headers?.get?.('content-encoding');
  const length = Number(response.headers?.get?.('content-length')) || 0;
  // gzip／br：Content-Length 是壓縮後的大小，讀到的是解壓後的位元組，改用已知的解壓大小
  const total = (!encoding || encoding === 'identity') && length ? length : expectedBytes || length || 1;
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    onFraction(1);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onFraction(loaded / total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  onFraction(1);
  return out.buffer;
}

const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };

/**
 * Background loader shared by boot.js and createBattle.
 *   start()                 begin every blocking download (idempotent); audio (manifest.json + tracks) follows once they settle
 *   file(id)                Promise of the item: ArrayBuffer ('buffer'), object URL ('blob'), parsed JSON ('json')
 *   gltf(id)                file(id) parsed with the engine's parseGltf (a fresh parse on every call)
 *   engine()                the loadEngine() promise (battle.js module after its lazy imports)
 *   step(id, fn)            runs fn as a progress step (time-credited while it runs)
 *   fetchAudio(url, init)   fetch() for audio.js: prefetched mp3s come from memory, the rest from the network
 *   progress                LoadProgress
 * A failed item is forgotten, so the next call (the retry button) downloads it again.
 */
export function createPreloader({ plan, loadEngine, fetchImpl = globalThis.fetch?.bind(globalThis), now } = {}) {
  const progress = new LoadProgress(plan, now ? { now } : undefined);
  const items = new Map(plan.map(item => [item.id, item]));
  const jobs = new Map();
  const audioJobs = new Map();   // absolute URL (with ?v=hash) -> Promise<ArrayBuffer>
  let started = false, audioGate = null, engineJob = null, manifestJob = null, audioPrefetch = null;

  async function download(item) {
    progress.begin(item.id);
    const response = await fetchImpl(item.url, item.blocking === false ? { priority: 'low' } : undefined);
    if (!response.ok) throw new Error(`${item.url} ${response.status}`);
    const buffer = await readWithProgress(response, item.bytes, fraction => progress.set(item.id, fraction));
    if (item.as === 'json') return JSON.parse(new TextDecoder().decode(buffer));
    if (item.as === 'blob') {
      const ext = item.url.replace(/\?.*$/, '').split('.').pop();
      return URL.createObjectURL(new Blob([buffer], { type: MIME[ext] || 'application/octet-stream' }));
    }
    return buffer;
  }
  function file(id) {
    const item = items.get(id);
    if (!item) return Promise.reject(new Error(`preload: unknown item ${id}`));
    if (!jobs.has(id)) {
      const job = download(item).then(result => { progress.complete(id); return result; }, error => {
        jobs.delete(id); progress.reset(id); throw error;
      });
      jobs.set(id, job);
    }
    return jobs.get(id);
  }
  function engine() {
    if (!engineJob) {
      progress.begin('engine');
      engineJob = Promise.resolve().then(loadEngine).then(result => { progress.complete('engine'); return result; }, error => {
        engineJob = null; progress.reset('engine'); throw error;
      });
    }
    return engineJob;
  }
  async function step(id, fn) {
    progress.begin(id);
    try {
      const result = await fn();
      progress.complete(id);
      return result;
    } catch (error) { progress.reset(id); throw error; }
  }
  function gltf(id) {
    return Promise.all([file(id), engine()]).then(([buffer, module]) => step(`${id}-parse`, () => module.parseGltf(buffer)));
  }
  function blockingFiles() { return plan.filter(item => item.blocking !== false && item.kind === 'file'); }
  /** Resolves once every blocking download has settled (ok or failed); audio waits for this. */
  function whenCriticalSettled() {
    if (!audioGate) audioGate = Promise.allSettled([...blockingFiles().map(item => file(item.id)), engine()]).then(() => {});
    return audioGate;
  }
  function start() {
    if (started) return api;
    started = true;
    for (const item of blockingFiles()) file(item.id).catch(() => {});
    engine().catch(() => {});
    prefetchAudio().catch(() => {});
    return api;
  }
  // ---- audio: manifest.json names the files and their content hashes; mp3s wait for the blocking downloads ----
  const audioPlan = plan.find(item => item.kind === 'audio-manifest');
  const absolute = url => new URL(String(url), globalThis.location?.href || audioPlan?.url || 'http://localhost/').href;
  const withoutQuery = url => url.replace(/[?#].*$/, '');
  function audioManifest() {
    if (!manifestJob) {
      manifestJob = Promise.resolve().then(() => fetchImpl(audioPlan.url, { cache: 'no-cache' }))
        .then(response => { if (!response.ok) throw new Error(`audio manifest ${response.status}`); return response.json(); })
        .catch(error => { manifestJob = null; throw error; });
    }
    return manifestJob;
  }
  /** The prefetched track URLs exactly as audio.js builds them: base + file + ?v=hash. */
  function audioEntries(manifest) {
    return (audioPlan?.tracks || []).map(key => (key === 'sfx' ? manifest?.sfx : manifest?.music?.[key]))
      .filter(entry => entry?.file)
      .map(entry => ({ url: new URL(entry.file + (entry.hash ? `?v=${entry.hash}` : ''), audioPlan.url).href, bytes: entry.bytes || 0 }));
  }
  function prefetchAudio() {
    if (!audioPlan) return Promise.resolve();
    if (!audioPrefetch) {
      audioPrefetch = whenCriticalSettled().then(audioManifest).then(manifest => {
        for (const entry of audioEntries(manifest)) {
          if (audioJobs.has(entry.url)) continue;
          const job = download({ id: entry.url, url: entry.url, bytes: entry.bytes, as: 'buffer', blocking: false });
          job.catch(() => audioJobs.delete(entry.url));
          audioJobs.set(entry.url, job);
        }
      }).catch(error => { audioPrefetch = null; throw error; });
    }
    return audioPrefetch;
  }
  /** fetch() for audio.js: the manifest and the prefetched mp3s come from memory, everything else from the network. */
  async function fetchAudio(url, init) {
    const target = absolute(url);
    if (!audioPlan || !withoutQuery(target).startsWith(withoutQuery(audioPlan.url).replace(/[^/]*$/, ''))) return fetchImpl(url, init);
    try {
      if (withoutQuery(target) === withoutQuery(audioPlan.url)) return new Response(JSON.stringify(await audioManifest()), { headers: { 'content-type': 'application/json' } });
      await prefetchAudio();
      const job = audioJobs.get(target);
      if (!job) return fetchImpl(url, init);   // not prefetched (other tracks) or a stale ?v=
      const buffer = await job;
      audioJobs.delete(target);   // audio.js keeps the decoded copy; a later re-fetch goes to the network
      return new Response(buffer.slice(0));
    } catch { return fetchImpl(url, init); }
  }
  /** Drop downloaded bytes once the battle is built (the GLBs are parsed, textures created). */
  function release() {
    for (const [id, job] of jobs) {
      const item = items.get(id);
      if (item.as === 'blob') job.then(u => setTimeout(() => URL.revokeObjectURL(u), 10000), () => {});
      jobs.delete(id);
    }
  }
  /** Count items as done without loading them (e.g. the optional oni fell back to the procedural one). */
  function skip(...ids) { for (const id of ids) progress.complete(id); }
  const api = { plan, progress, start, file, gltf, engine, step, skip, fetchAudio, whenCriticalSettled, release, has: id => items.has(id) };
  return api;
}
