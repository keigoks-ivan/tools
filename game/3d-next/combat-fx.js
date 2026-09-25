/**
 * combat-fx.js — pooled combat spectacle for the 3D musou prototype (battle.js / fx-preview.js).
 *
 * API
 *   const fx = createCombatFx({ THREE, scene, camera, renderer, hero, heroModel, sword, hud, quality, groundAt,
 *                               hudFade: [elements to dim during musou], gauge: [musou gauge elements] });
 *   await fx.ready                              // optional: textures loaded (effects before that draw nothing)
 *   fx.onEvent(event, worldPos, targetRoot)     // every Arena / MarchDirector event; worldPos = ground point under
 *                                               // event.x/y (Vector3-like), targetRoot = the enemy actor root if any
 *   fx.trackAirborne(id, x, groundY, z, height) // per frame for each airborne enemy (landing dust)
 *   fx.update(realDt, gameDt, { heroAction, energy })   // once per frame, after the hero mixer + updateMatrixWorld
 *   fx.timeScale()                              // presentation time scale: hit-stop, slow motion, freezes (0..1)
 *   fx.cameraPre(camera, heroChest) / fx.cameraPost(camera)   // wrap renderer.render (restores the camera exactly)
 *   fx.cameraOffset()                           // raw values, if the caller prefers to apply them itself
 *   fx.setCombo(n) / fx.setKills(n)             // mirror external counters (MarchDirector.combo, level kills)
 *   fx.prewarm(sampleEnemyRoot), fx.reset(), fx.dispose(), fx.stats()
 *
 * TIME (the module owns presentation time)
 *   realDt = wall clock, capped (battle.js: min(0.05, ...)).   dt = realDt * fx.timeScale().
 *   Use dt for EVERYTHING that is gameplay or animation: arena/march.update, hero mixer, enemy actors (actor.update),
 *   the airborne launch physics (updateImpact), world.update. Use realDt for the follow camera (syncCamera), HUD
 *   timers and fx.update's first argument. fx.update(realDt, dt) gets both. Hit-stop is part of timeScale(): battle.js
 *   must stop applying its own `hitstopUntil` (forward the 'hitstop' events instead). timeScale() can be exactly 0 for a
 *   few frames (musou activation 0.08 s, finisher impact 0.05 s); Arena.update(0) is a no-op, mixer.update(0) holds.
 *
 * EVENT -> EFFECT (replaces the battle.js effect of the same event when combat-fx is active)
 *   slash                 move context (combo step, heavy) -> afterimages on combo 4/5 + charge, sword glow
 *   swing attack/heavy    textured slash arc on the real sword-tip plane (+ wind arcs; full-circle ring on combo 4/5);
 *                         combo-5 last hit / charge: crater decal + dust ring + debris, slow-mo 0.2-0.3x, FOV punch,
 *                         speed lines, white flash, haptics            (replaces crescent/flash/burst/shake)
 *   hit                   impact star + flare + cut line (drawn on top), streak sparks, violet soul shards,
 *                         enemy white/violet flash (material swap), damage number, combo counter pulse (replaces flash/burst)
 *   guard / guardBreak    blue sparks / gold burst + 破 stamp + short slow-mo     (replaces burst, flash, popText 破)
 *   kill                  soul burst (shards, wisp, embers); 4+ kills within 0.2 s -> group ring + pillar; 50/100/..人斬 banner
 *   kill officer|boss,    0.2x for 0.8 s, camera pushes toward the falling officer, pillar + ring,
 *   officerDown           banner 「敵將 〈name〉 擊破！」 (name from event.name or the earlier 'officer' / 'bossIntro' event)
 *   special | musouStart  activation freeze 0.08 s, HUD dims (hudFade), push-in 15 %, vignette, glow flash, rune circle,
 *                         fresnel rim glow (not a shell) + flames, title 「天刃亂舞」 / 「真・無雙」 (event.true); long form
 *                         when the event has `timeline: { windup, finish, end }` (game seconds from the start) or is
 *                         'musouStart'. Long form ("天刃") drives 4 hard camera cuts (CUT1/CUT2/leap/CUT3, see below)
 *                         and a giant spirit blade that grows from the sword; enemies between the camera and the
 *                         hero (or just very close to it) dither-fade (alphaHash) for the whole musou so the cuts
 *                         stay readable.
 *   swing kind special    flurry: rings, wind arcs, shards, light shafts; hit-stop on the first connecting hit of each
 *                         swing (data-driven schedule, starts longer and shortens swing to swing); slow orbiting
 *                         3/4-high-angle CUT 2, no shake. Short 3-hit special: third swing = finisher. Long form:
 *                         swings named in `event.sweeps` (MUSOU_FLURRY.sweeps, default 1-based [4,7,10]) sweep the
 *                         spirit blade 360° around the arena; enemies inside the sweep are launched (battle.js).
 *                         `event.leapAt` (opt-in) cuts to a low medium shot for the leap into the finisher.
 *   musouFinish           CUT 3 (behind/below the hero, tilted down -- never up, so the arena's finite sky backdrop
 *                         never shows its edge): vertical cleave, 0.05 s freeze, framebuffer captured once and shown
 *                         as a sliding screen-split for ~0.25 s, short sharp flash (≤0.08 s, partial opacity, not a
 *                         whiteout), a small shaped pillar, a fake-distortion ground shockwave ring, lead-in 0.3x
 *                         (0.15x 真) before the impact; eases from the close cleave framing to a medium shot ~0.3-0.8 s
 *                         after impact so the launched enemies falling around her stay in frame; ends with a big
 *                         "NN KO" counter (right of centre) + 撃/斬/破/天 grade stamp. 真: spirit blade wrapped in a
 *                         scrolling-noise purple flame shader (same mesh also carries a ground/body flame ring around
 *                         her feet), 2 afterimage ghosts, 0.4 s portrait cut-in card, magenta grade.
 *   jump / airSlash       dust ring + afterimage / slash arc on the sword plane
 *   plunge / land         dive streaks + afterimages + speed lines / after a plunge (or event.radius): crater + shock ring
 *                         + 0.3x hit-stop; plain landing: dust puff
 *   dodge, sidestep, knockback, hurt, bossSlam, bossSweep, roar: dust / afterimage / red crater / red arcs / red rings
 *   hitstop               becomes a timeScale() track (0.06x for duration*2 s, like battle.js did)
 *   telegraph, wave, hint, gate / lamp events: not handled — keep battle.js's own warnings and toasts.
 *
 * Draw budget (all FX together, at peak): 2 particle draws (depth-tested world pool + on-top hit overlay) + 1 strip/decal
 * draw + ghosts (desktop 3 / mobile 1) + 1 aura rim = 7 desktop, 5 mobile; 0 when idle. During the 天刃 long-form musou
 * finale only, up to 4 more: 1 spirit blade (dissolve/noise shader) + 1 真・無雙 flame shroud (scrolling-noise shader,
 * only during 真) + 1 screen-split quad (~0.25 s after the cleave) + 1 shockwave ring (~0.4 s after the cleave) = 11
 * desktop / 9 mobile at the absolute peak; every one of the four is a single pooled mesh created at createCombatFx and
 * only toggled visible/repositioned, never recreated. Nothing allocates materials or geometry after createCombatFx
 * (the enemy flash clones each distinct enemy material once, on its first hit; the occlusion dither clones each
 * enemy's meshes once, the first time that enemy needs to fade; the screen-split FramebufferTexture is allocated once
 * and only reallocated on an actual canvas resize; prewarm() precompiles all of the above up front). Per-event
 * allocations are small JS objects only. HUD flair is DOM/CSS driven from update().
 *
 * Coordinates: world metres, y up, same as battle.js. Arena facing f maps to world direction (cos f, 0, sin f).
 * Texture layout constants below must match game/scripts/fx/build_fx_textures.py.
 */

const FX_BASE = new URL('../assets/fx/', import.meta.url).href;
const FX_VERSION = '20260925a';

export const PARTICLE_CELLS = {
  glow: 0, flare: 1, streak: 2, shard: 3, dust: 4, dust2: 5, ring: 6, ember: 7,
  cut: 8, flame: 9, twinkle: 10, rock: 11, impact: 12, disc: 13, noiseRing: 14, flame2: 15,
};
export const STRIP_ROWS = { slash: 0, heavy: 1, ring: 2, trail: 3, dust: 4, wind: 5, pillar: 6, slash2: 7 };
export const DECAL_CELLS = { crack: 0, scorch: 1, rune: 2, burst: 3 };

export const QUALITY = {
  desktop: {
    particles: 480, overlayParticles: 240, stripSlots: 22, stripCols: 48, ghosts: 3, aura: true, particleScale: 1,
    damageNumbers: 14, trailSubdiv: 4, ghostHair: true, haptics: false, titleGrain: true, fbmOctaves: 4,
  },
  mobile: {
    particles: 210, overlayParticles: 110, stripSlots: 14, stripCols: 40, ghosts: 1, aura: true, particleScale: 0.55,
    damageNumbers: 8, trailSubdiv: 3, ghostHair: false, haptics: true, titleGrain: true, fbmOctaves: 2,
  },
};

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit-tested in game/tests/combat-fx.test.mjs)
// ---------------------------------------------------------------------------------------------

/** Combo counter colour tiers: 0 <10, 1 10+, 2 30+, 3 50+, 4 100+. */
export const COMBO_TIERS = [0, 10, 30, 50, 100];
export function comboTier(count) {
  let tier = 0;
  for (let i = 0; i < COMBO_TIERS.length; i++) if (count >= COMBO_TIERS[i]) tier = i;
  return tier;
}

export const KO_MILESTONES = [50, 100, 150, 200, 300, 500, 1000];
/** Highest milestone crossed when the kill count goes from `before` to `after` (0 if none). */
export function crossedMilestone(before, after, list = KO_MILESTONES) {
  let hit = 0;
  for (const m of list) if (before < m && after >= m) hit = m;
  return hit;
}

/** 天刃 finale grade stamp: single-character rank from the KOs landed during that one musou. */
export const KO_GRADE_STEPS = [[0, '撃'], [6, '斬'], [12, '破'], [20, '天']];
export function koGrade(count, steps = KO_GRADE_STEPS) {
  let grade = steps[0][1];
  for (const [min, label] of steps) { if (count >= min) grade = label; else break; }
  return grade;
}

/** Data-driven hit-stop schedule for the 10-12 flurry swings: starts longer, shortens toward the last swing. */
export function swingHitstop(index, total = 10, { first = 0.052, last = 0.03 } = {}) {
  const n = Math.max(1, total | 0);
  const p = n > 1 ? Math.min(1, Math.max(0, index / (n - 1))) : 0;
  return first + (last - first) * p;
}

/** Visual weight of a hit event: 1 light, 1.7 heavy / finisher, 2 special; armoured hits are dampened. */
export function hitWeight(event) {
  const base = event.source === 'special' ? 2 : event.source === 'heavy' ? 1.7 : 1;
  return event.armored ? base * 0.7 : base;
}

/** Hits landing in the same frame share the budget: the n-th simultaneous hit is drawn smaller. */
export function crowdFactor(nth) {
  return 1 / (1 + 0.28 * Math.max(0, nth));
}

/**
 * Presentation time scale, in REAL seconds. Each play() adds a track: segments [[seconds, scale], ...] held in order,
 * then a smoothstep ramp back to 1 over `ramp`. The game runs at the minimum of all live tracks (a freeze always wins).
 * Minor requests (not `force`) are refused for `cooldown` s after the previous minor one ended, so a crowd of kills
 * cannot chain into permanent slow motion. Hit-stop tracks (`tag: 'hitstop'`) never touch the cooldown.
 * trigger(hold, scale, opts) is the one-segment shorthand.
 */
export class TimeScale {
  constructor(maxTracks = 8) { this.maxTracks = maxTracks; this.tracks = []; this.reset(); }
  reset() { this.now = 0; this.tracks.length = 0; this.cooldownUntil = -1; }
  advance(realDt) {
    this.now += Math.max(0, realDt);
    for (let i = this.tracks.length - 1; i >= 0; i--) if (this.now >= this.tracks[i].end) this.tracks.splice(i, 1);
  }
  active() { return this.tracks.length > 0; }
  play(segments, { ramp = 0.12, force = false, cooldown = 0.45, tag = '' } = {}) {
    const minor = !force && tag !== 'hitstop';
    if (minor && this.now < this.cooldownUntil && !this.tracks.some(t => t.minor)) return false;
    let hold = 0;
    for (const [seconds] of segments) hold += seconds;
    const track = { start: this.now, segments, hold, ramp, end: this.now + hold + ramp, tag, minor };
    if (this.tracks.length >= this.maxTracks) this.tracks.shift();
    this.tracks.push(track);
    if (tag !== 'hitstop') this.cooldownUntil = Math.max(this.cooldownUntil, track.end + cooldown);
    return true;
  }
  trigger(hold, scale, { ease = 0.12, ...opts } = {}) { return this.play([[hold, scale]], { ramp: ease, ...opts }); }
  /** Ends every track with this tag now (e.g. the finisher lead-in when the impact arrives). */
  cancel(tag) { this.tracks = this.tracks.filter(t => t.tag !== tag); }
  has(tag) { return this.tracks.some(t => t.tag === tag); }
  value() {
    let v = 1;
    for (const t of this.tracks) {
      let tau = this.now - t.start, scale = 1, last = 1;
      if (tau < t.hold) {
        for (const [seconds, s] of t.segments) { if (tau < seconds) { scale = s; break; } tau -= seconds; }
      } else {
        last = t.segments.length ? t.segments[t.segments.length - 1][1] : 1;
        const k = t.ramp > 0 ? Math.min(1, (tau - t.hold) / t.ramp) : 1;
        scale = last + (1 - last) * k * k * (3 - 2 * k);
      }
      v = Math.min(v, scale);
    }
    return v;
  }
}
/** @deprecated name kept for callers of the first version */
export const SlowMotion = TimeScale;

/** Hit counter with a time window (same rule as MarchDirector: 2.5 s between hits). */
export class ComboCounter {
  constructor(window = 2.5) { this.window = window; this.reset(); }
  reset() { this.count = 0; this.last = -Infinity; this.max = 0; }
  hit(now) {
    if (now - this.last > this.window) this.count = 0;
    this.count++;
    this.last = now;
    this.max = Math.max(this.max, this.count);
    return this.count;
  }
  /** Returns true when the combo just expired. */
  tick(now) {
    if (this.count > 0 && now - this.last > this.window) { this.count = 0; return true; }
    return false;
  }
  remaining(now) { return this.count > 0 ? Math.max(0, 1 - (now - this.last) / this.window) : 0; }
}

/** Fixed-capacity ring index (oldest slot is reused first). */
export class RingIndex {
  constructor(capacity) { this.capacity = Math.max(1, capacity | 0); this.head = 0; this.wrapped = false; }
  next() {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.head === 0) this.wrapped = true;
    return i;
  }
}

/** Particle counts for one hit, before the quality scale and crowd factor. */
export const HIT_RECIPE = {
  light: { sparks: 7, shards: 3 },
  heavy: { sparks: 12, shards: 6 },
  special: { sparks: 12, shards: 8 },
  guard: { sparks: 8, shards: 0 },
};
export function scaledCount(n, scale) { return n <= 0 ? 0 : Math.max(1, Math.round(n * scale)); }

/** Hero actions that draw the blade trail and can leave afterimages (Arena + planned jump moves). */
export const ATTACK_ACTIONS = new Set(['attack', 'heavy', 'special', 'airSlash', 'airAttack', 'jumpAttack', 'plunge']);

const smooth01 = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const easeOut = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** Deterministic PRNG so the preview can reproduce screenshot frames. */
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Shaders. Colours are authored in display space (no colour-space conversion, no tone mapping) and may be
// > 1: additive over-drive clips the centre of a violet glow to white, which is the cheap "bloom" here.
// Blend: ONE, ONE_MINUS_SRC_ALPHA with alpha = a * blend, so blend 0 = additive, blend 1 = normal alpha.
// ---------------------------------------------------------------------------------------------

const PARTICLE_VERTEX = /* glsl */`
uniform float uTime;
attribute vec4 aP; attribute vec4 aV; attribute vec4 aS; attribute vec4 aC; attribute vec4 aM; attribute vec4 aX;
varying vec2 vUv; varying vec4 vColor; varying float vBlend;
void main() {
  float age = uTime - aP.w;
  float t = age / aV.w;
  if (t < 0.0 || t >= 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vColor = vec4(0.0); vUv = vec2(0.0); vBlend = 0.0; return; }
  float drag = aS.w;
  float decay = exp(-drag * age);
  float dk = drag > 0.001 ? (1.0 - decay) / drag : age;
  vec3 pos = aP.xyz + aV.xyz * dk;
  pos.y -= 0.5 * aM.w * age * age;
  vec3 vel = aV.xyz * decay;
  vel.y -= aM.w * age;
  float grow = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(aS.x, aS.y, grow);
  vec2 c = position.xy;
  float rot = aM.y + aM.z * age;
  float cs = cos(rot), sn = sin(rot);
  vec4 mv;
  if (aX.w > 1.5) {
    vec2 q = vec2(c.x * cs - c.y * aX.z * sn, c.x * sn + c.y * aX.z * cs) * size;
    mv = viewMatrix * vec4(pos + vec3(q.x, 0.0, q.y), 1.0);
  } else if (aX.w > 0.5) {
    mv = viewMatrix * vec4(pos, 1.0);
    vec2 d = (viewMatrix * vec4(vel, 0.0)).xy;
    float sp = length(d);
    d = sp > 1e-5 ? d / sp : vec2(0.0, 1.0);
    float len = size * aX.z + aS.z * length(vel);
    mv.xy += vec2(-d.y, d.x) * c.x * size + d * c.y * len;
  } else {
    mv = viewMatrix * vec4(pos, 1.0);
    mv.xy += vec2(c.x * cs - c.y * aX.z * sn, c.x * sn + c.y * aX.z * cs) * size;
  }
  // additive light is pulled toward the camera so hit flashes are not swallowed by the body they hit
  if (aX.x < 0.5) mv.xyz -= normalize(mv.xyz) * min(0.6, -mv.z * 0.25);
  gl_Position = projectionMatrix * mv;
  float cell = aM.x;
  float col = mod(cell, 4.0), row = floor(cell / 4.0);
  vUv = vec2((col + uv.x) * 0.25, 1.0 - (row + 1.0 - uv.y) * 0.25);
  float fadeIn = aX.y > 0.0 ? clamp(t / aX.y, 0.0, 1.0) : 1.0;
  float fadeOut = 1.0 - smoothstep(0.35, 1.0, t);
  vColor = vec4(aC.rgb, aC.a * fadeIn * fadeOut);
  vBlend = aX.x;
}`;

const FX_FRAGMENT = /* glsl */`
uniform sampler2D map;
varying vec2 vUv; varying vec4 vColor; varying float vBlend;
void main() {
  vec4 tex = texture2D(map, vUv);
  float a = tex.a * vColor.a;
  gl_FragColor = vec4(tex.rgb * vColor.rgb * a, min(1.0, a) * vBlend);
}`;

const STRIP_VERTEX = /* glsl */`
attribute vec4 color; attribute float aBlend;
varying vec2 vUv; varying vec4 vColor; varying float vBlend;
void main() {
  vUv = uv; vColor = color; vBlend = aBlend;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const ECHO_VERTEX = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform float uInflate;
varying vec3 vN; varying vec3 vView; varying float vY;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  transformed += normalize(objectNormal) * uInflate;
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vView = normalize(-mvPosition.xyz);
  vY = transformed.y;
}`;

const ECHO_FRAGMENT = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uFlicker; uniform float uBase; uniform float uPower;
varying vec3 vN; varying vec3 vView; varying float vY;
void main() {
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vView)));
  float band = 1.0 + uFlicker * (0.5 * sin(vY * 23.0 - uTime * 17.0) + 0.35 * sin(vY * 57.0 + uTime * 29.0));
  vec3 c = uColor * (uBase + pow(rim, uPower) * 1.5) * band * uOpacity;
  gl_FragColor = vec4(c, 0.0);
}`;

// ---------------------------------------------------------------------------------------------
// 天刃 (musou-v2) shaders: a noise helper shared by the flame shroud and the spirit blade, the spirit blade itself
// (dissolve-in tapered cross of two strips), the scrolling purple flame shroud (真・無雙 only), the post-cleave
// screen split (reads one captured framebuffer snapshot) and the ground shockwave (fake distortion, no refraction
// pass). Each is exactly one Mesh / one Material, created once in createCombatFx and only repositioned or hidden.
// ---------------------------------------------------------------------------------------------

// fbm octave count is baked in at compile time (once per material, via QUALITY.<tier>.fbmOctaves) rather than a
// uniform/loop-bound variable, since mobile GPUs pay per-octave cost every pixel on two fairly large, always-visible
// meshes during the musou finale; desktop keeps the full 4 octaves, mobile drops to 2 (fbm2 is still 2 calls in
// FLAME_FRAGMENT, so this halves that shader's noise cost on mobile without changing its overall look).
function noiseGLSL(octaves = 4) {
  return /* glsl */`
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm2(vec2 p) { float v = 0.0, a = 0.55; for (int i = 0; i < ${octaves | 0}; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.55; } return v; }`;
}

const BLADE_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function bladeFragment(octaves) {
  return /* glsl */`${noiseGLSL(octaves)}
uniform float uTime; uniform float uReveal; uniform float uOpacity; uniform vec3 uColor; uniform vec3 uEdge;
varying vec2 vUv;
void main() {
  float len = vUv.y;
  if (len > uReveal) discard;
  float e = abs(vUv.x - 0.5) * 2.0;                          // 0 at the spine .. 1 at the geometric silhouette edge
  // soft additive falloff that reaches exactly 0 at the true edge -- no hard rectangular border.
  float silhouette = pow(clamp(1.0 - e, 0.0, 1.0), 0.8);
  // thin bright white-hot core line running the length of the blade, offset toward one side (the cutting edge)
  float coreLine = exp(-pow((vUv.x - 0.22) * 11.0, 2.0));
  float scroll = fbm2(vec2(vUv.x * 2.4, len * 5.5 - uTime * 3.4));
  float flicker = 0.85 + 0.15 * sin(uTime * 12.0 + len * 8.0);
  float energy = (0.75 + scroll * 0.5) * flicker;
  float grow = smoothstep(uReveal - 0.12, uReveal, len);     // bright dissolve-in sweep along the length
  vec3 col = mix(uEdge, uColor, e) * silhouette * energy + coreLine * vec3(2.7, 2.5, 2.9) * energy + grow * vec3(2.6, 2.2, 2.9);
  float alpha = clamp(silhouette * (0.5 + energy * 0.4) + coreLine * 1.15 + grow, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(col * alpha, alpha);
}`;
}

const FLAME_VERTEX = /* glsl */`
attribute float aBlade;
uniform mat4 uBladeMatrix;
varying vec2 vUv;
void main() {
  vUv = uv;
  // aBlade > 0.5: the blade-wrap quads follow the spirit blade's own matrix (fed in each frame); otherwise the
  // ground/body flame ring follows this mesh's own (hero-anchored) transform. One draw call either way.
  vec4 worldPos = aBlade > 0.5 ? uBladeMatrix * vec4(position, 1.0) : modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

function flameFragment(octaves) {
  return /* glsl */`${noiseGLSL(octaves)}
uniform float uTime; uniform float uOpacity; uniform float uSeed; uniform vec3 uHot; uniform vec3 uCore; uniform vec3 uEdge;
varying vec2 vUv;
void main() {
  float flow = uTime * 1.6 + uSeed;
  vec2 p = vec2(vUv.x * 3.0, vUv.y * 4.2 - flow);
  float n = fbm2(p) * 0.65 + fbm2(p * 2.3 + 11.0) * 0.35;
  // base-weighted taper: full width right at the ground, tapering to a flickering point toward the tip -- reads as
  // a licking flame tongue rather than a symmetric drop/petal (the tip position itself flickers over time).
  float tipFlicker = 0.85 + 0.15 * sin(uTime * 7.0 + uSeed * 6.283 + vUv.x * 4.0);
  float taper = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.14 * tipFlicker, vUv.y);
  float edge = pow(clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0), 1.3);
  float body = n * edge * taper;
  float core = smoothstep(0.35, 0.85, body);
  vec3 col = mix(uEdge, uCore, smoothstep(0.12, 0.6, body));
  col = mix(col, uHot, core * core);
  float alpha = clamp(body * 1.5, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(col * alpha, alpha);
}`;
}

const SPLIT_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SPLIT_FRAGMENT = /* glsl */`
uniform sampler2D uTex; uniform float uSep; uniform float uAlpha; uniform float uSeed; uniform float uAngle;
varying vec2 vUv;
float shash(float x) { return fract(sin(x * 91.345 + 4.7) * 43758.5453); }
void main() {
  float lineX = 0.5 + (vUv.y - 0.5) * uAngle;
  float jag = (shash(floor(vUv.y * 44.0) + uSeed) - 0.5) * 0.032 + (shash(floor(vUv.y * 130.0) + uSeed + 7.0) - 0.5) * 0.01;
  float lx = lineX + jag;
  float side = vUv.x < lx ? -1.0 : 1.0;
  vec2 uv = clamp(vec2(vUv.x - side * uSep, vUv.y), 0.001, 0.999);
  vec3 col = texture2D(uTex, uv).rgb;
  float d = abs(vUv.x - lx);
  float seam = smoothstep(0.02, 0.0, d) + smoothstep(0.05, 0.0, d) * 0.5;
  col += seam * vec3(3.2, 2.8, 3.8);
  gl_FragColor = vec4(col, uAlpha);
}`;

const SHOCK_VERTEX = /* glsl */`
varying vec2 vLocal;
void main() { vLocal = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, 0.0, position.y, 1.0); }`;

const SHOCK_FRAGMENT = /* glsl */`
uniform float uRadius; uniform float uWidth; uniform float uOpacity; uniform vec3 uColor;
varying vec2 vLocal;
void main() {
  float r = length(vLocal);
  float bright = smoothstep(uRadius - 0.02, uRadius, r) * (1.0 - smoothstep(uRadius, uRadius + 0.05, r));
  float trail = smoothstep(uRadius - uWidth, uRadius - 0.03, r) * (1.0 - smoothstep(uRadius - 0.03, uRadius, r));
  vec3 col = uColor * bright * 3.2 - trail * vec3(0.16, 0.14, 0.2);
  float alpha = clamp(bright * uOpacity + trail * uOpacity * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(max(col, 0.0), alpha);
}`;

// ---------------------------------------------------------------------------------------------
// GPU-simulated particle field: one InstancedBufferGeometry, one draw call. Positions integrate in the vertex
// shader (drag + gravity), so the CPU only writes a slot when a particle is born.
// ---------------------------------------------------------------------------------------------

/** Emission presets (static objects, never allocated per event). */
const STYLE = {
  glow: { overlay: true, cell: PARTICLE_CELLS.glow, align: 0, blend: 0, drag: 0, gravity: 0, stretch: 0, aspect: 1, fadeIn: 0, spin: 0 },
  flare: { overlay: true, cell: PARTICLE_CELLS.flare, align: 0, blend: 0, drag: 0, gravity: 0, stretch: 0, aspect: 1, fadeIn: 0, spin: 0 },
  impact: { overlay: true, cell: PARTICLE_CELLS.impact, align: 0, blend: 0, drag: 0, gravity: 0, stretch: 0, aspect: 1, fadeIn: 0, spin: 0 },
  spark: { overlay: true, cell: PARTICLE_CELLS.streak, align: 1, blend: 0, drag: 4.5, gravity: 9, stretch: 0.07, aspect: 1.5, fadeIn: 0, spin: 0 },
  shard: { cell: PARTICLE_CELLS.shard, align: 1, blend: 0, drag: 2.4, gravity: 5, stretch: 0.03, aspect: 2.4, fadeIn: 0, spin: 0 },
  cut: { overlay: true, cell: PARTICLE_CELLS.cut, align: 1, blend: 0, drag: 0, gravity: 0, stretch: 0, aspect: 12, fadeIn: 0, spin: 0 },
  ring: { overlay: true, cell: PARTICLE_CELLS.ring, align: 0, blend: 0, drag: 0, gravity: 0, stretch: 0, aspect: 1, fadeIn: 0, spin: 0 },
  ember: { cell: PARTICLE_CELLS.ember, align: 0, blend: 0, drag: 1.6, gravity: -0.8, stretch: 0, aspect: 1, fadeIn: 0.1, spin: 0 },
  wisp: { cell: PARTICLE_CELLS.streak, align: 1, blend: 0, drag: 1.2, gravity: -2, stretch: 0.08, aspect: 2, fadeIn: 0.05, spin: 0 },
  flame: { cell: PARTICLE_CELLS.flame, align: 0, blend: 0, drag: 1.2, gravity: -4.5, stretch: 0, aspect: 1.8, fadeIn: 0.2, spin: 0 },
  dust: { cell: PARTICLE_CELLS.dust, align: 0, blend: 1, drag: 3.2, gravity: -0.35, stretch: 0, aspect: 1, fadeIn: 0.12, spin: 0.6 },
  rock: { cell: PARTICLE_CELLS.rock, align: 0, blend: 1, drag: 0.4, gravity: 17, stretch: 0, aspect: 1, fadeIn: 0, spin: 9 },
  twinkle: { cell: PARTICLE_CELLS.twinkle, align: 0, blend: 0, drag: 2, gravity: 0, stretch: 0, aspect: 1, fadeIn: 0, spin: 2 },
  groundRing: { cell: PARTICLE_CELLS.noiseRing, align: 2, blend: 0, drag: 0, gravity: 0, stretch: 0, aspect: 1, fadeIn: 0, spin: 0.5 },
};

function createParticleField(THREE, capacity, texture, { depthTest = true, renderOrder = 12, name = 'combat-fx-particles' } = {}) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const names = ['aP', 'aV', 'aS', 'aC', 'aM', 'aX'];
  const arrays = {};
  const attributes = [];
  for (const name of names) {
    arrays[name] = new Float32Array(capacity * 4);
    const attribute = new THREE.InstancedBufferAttribute(arrays[name], 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
    attributes.push(attribute);
  }
  const { aP, aV, aS, aC, aM, aX } = arrays;
  for (let i = 0; i < capacity; i++) { aP[i * 4 + 3] = -1e6; aV[i * 4 + 3] = 1; }
  geometry.instanceCount = capacity;
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, uTime: { value: 0 } },
    vertexShader: PARTICLE_VERTEX, fragmentShader: FX_FRAGMENT,
    transparent: true, depthWrite: false, depthTest, toneMapped: false, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.name = name;
  mesh.visible = false;
  const ring = new RingIndex(capacity);
  let time = 0, lo = Infinity, hi = -1, full = false, lastDeath = -1;

  /** Spawn one particle. `rot` defaults to 0; colours may exceed 1. */
  function emit(style, x, y, z, vx, vy, vz, life, size0, size1, r, g, b, a, rot = 0, spin = style.spin) {
    const i = ring.next();
    if (i < lo) { if (hi >= 0) full = true; lo = i; }
    if (i > hi) hi = i;
    const o = i * 4;
    aP[o] = x; aP[o + 1] = y; aP[o + 2] = z; aP[o + 3] = time;
    aV[o] = vx; aV[o + 1] = vy; aV[o + 2] = vz; aV[o + 3] = Math.max(0.01, life);
    aS[o] = size0; aS[o + 1] = size1; aS[o + 2] = style.stretch; aS[o + 3] = style.drag;
    aC[o] = r; aC[o + 1] = g; aC[o + 2] = b; aC[o + 3] = a;
    aM[o] = style.cell; aM[o + 1] = rot; aM[o + 2] = spin; aM[o + 3] = style.gravity;
    aX[o] = style.blend; aX[o + 1] = style.fadeIn; aX[o + 2] = style.aspect; aX[o + 3] = style.align;
    lastDeath = Math.max(lastDeath, time + life);
  }
  function update(dt) {
    time += dt;
    material.uniforms.uTime.value = time;
    mesh.visible = time < lastDeath;          // no draw call at all while nothing is alive
    if (hi < 0) return;
    for (const attribute of attributes) {
      attribute.clearUpdateRanges();
      if (!full) attribute.addUpdateRange(lo * 4, (hi - lo + 1) * 4);
      attribute.needsUpdate = true;
    }
    lo = Infinity; hi = -1; full = false;
  }
  function alive() {
    let n = 0;
    for (let i = 0; i < capacity; i++) { const age = time - aP[i * 4 + 3]; if (age >= 0 && age < aV[i * 4 + 3]) n++; }
    return n;
  }
  function clear() {
    for (let i = 0; i < capacity; i++) aP[i * 4 + 3] = -1e6;
    lo = 0; hi = capacity - 1; full = true; lastDeath = -1; mesh.visible = false;
  }
  return { mesh, emit, update, alive, clear, get time() { return time; }, capacity, dispose() { geometry.dispose(); material.dispose(); } };
}

// ---------------------------------------------------------------------------------------------
// Strip batch: every ribbon-like effect (slash arcs, shock rings, light pillars, blade trail, ground decals) is
// rebuilt on the CPU each frame into one dynamic buffer -> one draw call. Each slot is a strip of `cols` columns
// (2 vertices per column); unused columns collapse onto the last one.
// ---------------------------------------------------------------------------------------------

function createStripBatch(THREE, slots, cols, texture) {
  const perSlot = cols * 2;
  const count = slots * perSlot;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const color = new Float32Array(count * 4);
  const blend = new Float32Array(count);
  const index = [];
  for (let s = 0; s < slots; s++) for (let c = 0; c < cols - 1; c++) {
    const a = s * perSlot + c * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  const attrs = [
    new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(color, 4).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(blend, 1).setUsage(THREE.DynamicDrawUsage),
  ];
  geometry.setAttribute('position', attrs[0]);
  geometry.setAttribute('uv', attrs[1]);
  geometry.setAttribute('color', attrs[2]);
  geometry.setAttribute('aBlend', attrs[3]);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: STRIP_VERTEX, fragmentShader: FX_FRAGMENT,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.name = 'combat-fx-strips';
  let used = 0, column = 0;
  const batch = {
    mesh, slots, cols,
    begin() { used = 0; },
    /** Opens the next slot; returns false when the batch is full. */
    open() { if (used >= slots) return false; column = 0; return true; },
    /** Adds one column: inner (a) and outer (b) vertex. */
    put(ax, ay, az, bx, by, bz, u0, v0, u1, v1, r, g, b, alpha, mode) {
      if (column >= cols) return;
      const base = used * perSlot + column * 2;
      position[base * 3] = ax; position[base * 3 + 1] = ay; position[base * 3 + 2] = az;
      position[base * 3 + 3] = bx; position[base * 3 + 4] = by; position[base * 3 + 5] = bz;
      uv[base * 2] = u0; uv[base * 2 + 1] = v0; uv[base * 2 + 2] = u1; uv[base * 2 + 3] = v1;
      for (let k = 0; k < 2; k++) {
        const o = (base + k) * 4;
        color[o] = r; color[o + 1] = g; color[o + 2] = b; color[o + 3] = alpha;
        blend[base + k] = mode;
      }
      column++;
    },
    close() {
      if (column === 0) return;
      const start = used * perSlot;
      const last = start + (column - 1) * 2;
      for (let c = column; c < cols; c++) {
        const base = start + c * 2;
        position.copyWithin(base * 3, last * 3, last * 3 + 6);
        uv.copyWithin(base * 2, last * 2, last * 2 + 4);
        color.copyWithin(base * 4, last * 4, last * 4 + 8);
        color[base * 4 + 3] = 0; color[base * 4 + 7] = 0;
        blend[base] = blend[last]; blend[base + 1] = blend[last + 1];
      }
      used++;
    },
    end() {
      geometry.setDrawRange(0, used * (cols - 1) * 6);
      mesh.visible = used > 0;
      if (!used) return;
      for (const attribute of attrs) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, used * perSlot * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    },
    get used() { return used; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
  return batch;
}

// Atlas mapping for fx-strips.png (512 x 1024, flipY): strips in the top half, decals in the bottom half.
const STRIP_ROW_V = 64 / 1024;
function stripV(row, v) { return 1 - (row + 1 - (0.04 + v * 0.92)) * STRIP_ROW_V; }
function stripU(u) { return 0.004 + u * 0.992; }
function decalU(cell, u) { return ((cell % 2) + u) * 0.5; }
function decalV(cell, v) { return 1 - (512 + (Math.floor(cell / 2) + 1 - v) * 256) / 1024; }

// ---------------------------------------------------------------------------------------------
// Hero echoes: afterimage ghosts and a live aura shell. All hero skinned meshes (minus ink-outline shells and
// blended eye/brow layers) are merged once into a single skinned geometry with baked bind matrices, so each ghost
// is exactly one draw call. A ghost owns a Skeleton whose update() only runs when it is re-posed.
// ---------------------------------------------------------------------------------------------

function mergeHeroGeometry(THREE, heroModel, { hair = true } = {}) {
  const meshes = [];
  heroModel.updateMatrixWorld(true);
  heroModel.traverse(object => {
    if (!object.isSkinnedMesh || !object.skeleton) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (!material || material.side === THREE.BackSide) return;       // ink outline shells
    if (material.transparent && material.alphaTest === 0) return;     // blended eye layers
    if (!hair && /hair|braid/i.test(object.name + (object.parent?.name || ''))) return;
    if (!object.geometry.attributes.skinIndex) return;
    meshes.push(object);
  });
  if (!meshes.length) return null;
  const bones = [], inverses = [], keys = new Map();
  const boneIndex = (bone, inverse) => {
    const key = bone.uuid + ':' + inverse.elements.map(v => v.toFixed(5)).join(',');
    if (!keys.has(key)) { keys.set(key, bones.length); bones.push(bone); inverses.push(inverse.clone()); }
    return keys.get(key);
  };
  let vertexCount = 0, indexCount = 0;
  for (const mesh of meshes) {
    vertexCount += mesh.geometry.attributes.position.count;
    indexCount += mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    normalMatrix.getNormalMatrix(mesh.bindMatrix);
    const remap = mesh.skeleton.bones.map((bone, i) => boneIndex(bone, mesh.skeleton.boneInverses[i]));
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
      position.set([v.x, v.y, v.z], (vo + i) * 3);
      if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize(); normal.set([n.x, n.y, n.z], (vo + i) * 3); }
      for (let k = 0; k < 4; k++) {
        skinIndex[(vo + i) * 4 + k] = remap[si.getComponent(i, k)] ?? 0;
        skinWeight[(vo + i) * 4 + k] = sw.getComponent(i, k);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < pos.count; i++) index[io + i] = vo + i;
    vo += pos.count; io += g.index ? g.index.count : pos.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return { geometry, bones, inverses, vertexCount };
}

function createEchoes(THREE, scene, heroModel, settings) {
  const merged = heroModel ? mergeHeroGeometry(THREE, heroModel, { hair: settings.ghostHair }) : null;
  if (!merged) return { ghosts: [], aura: null, snapshot() {}, update() {}, dispose() {}, vertexCount: 0 };
  const identity = new THREE.Matrix4();
  const makeMaterial = (color, inflate, flicker, base, power) => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(...color) }, uOpacity: { value: 0 }, uTime: { value: 0 }, uFlicker: { value: flicker },
      uInflate: { value: inflate }, uBase: { value: base }, uPower: { value: power },
    },
    vertexShader: ECHO_VERTEX, fragmentShader: ECHO_FRAGMENT,
    transparent: true, depthWrite: false, toneMapped: false, fog: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const makeMesh = (material, frozen) => {
    const skeleton = new THREE.Skeleton(merged.bones, merged.inverses);
    skeleton.computeBoneTexture();
    const mesh = new THREE.SkinnedMesh(merged.geometry, material);
    mesh.bindMode = 'detached';
    mesh.bind(skeleton, identity);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    if (frozen) {
      const pose = skeleton.update.bind(skeleton);
      skeleton.update = () => {};
      mesh.userData.pose = pose;
    }
    scene.add(mesh);
    return mesh;
  };
  const ghosts = [];
  for (let i = 0; i < settings.ghosts; i++) {
    const mesh = makeMesh(makeMaterial([0.62, 0.34, 1.0], 0.004, 0, 0.18, 2.2), true);
    mesh.renderOrder = 9;
    ghosts.push({ mesh, age: 1, life: 0.24, strength: 0 });
  }
  // Fresnel rim only (uBase 0): a thin glowing outline, not a filled shell, so the costume/blade stay readable.
  const aura = settings.aura ? makeMesh(makeMaterial([0.78, 0.4, 1.0], 0.016, 1, 0.0, 5.2), false) : null;
  if (aura) aura.renderOrder = 10;
  const ring = new RingIndex(Math.max(1, ghosts.length));
  return {
    ghosts, aura, vertexCount: merged.vertexCount,
    snapshot(strength = 1, life = 0.24) {
      if (!ghosts.length) return;
      const ghost = ghosts[ring.next()];
      ghost.mesh.userData.pose();
      ghost.age = 0; ghost.life = life; ghost.strength = strength;
      ghost.mesh.visible = true;
    },
    update(dt, time, auraLevel) {
      for (const ghost of ghosts) {
        if (!ghost.mesh.visible) continue;
        ghost.age += dt;
        const t = ghost.age / ghost.life;
        if (t >= 1) { ghost.mesh.visible = false; continue; }
        ghost.mesh.material.uniforms.uOpacity.value = ghost.strength * 0.85 * (1 - t) * (1 - t);
      }
      if (aura) {
        aura.visible = auraLevel > 0.01;
        aura.material.uniforms.uOpacity.value = auraLevel;
        aura.material.uniforms.uTime.value = time;
      }
    },
    hide() { for (const ghost of ghosts) ghost.mesh.visible = false; if (aura) aura.visible = false; },
    dispose() {
      for (const mesh of [...ghosts.map(g => g.mesh), aura].filter(Boolean)) {
        mesh.removeFromParent(); mesh.material.dispose(); mesh.skeleton.dispose();
      }
      merged.geometry.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Blade trail: samples the real sword (two skinned vertices at the ends of its longest axis) every frame,
// then writes a Catmull-Rom-smoothed ribbon into the strip batch. Samples expire by (game) time.
// ---------------------------------------------------------------------------------------------

function createBladeSampler(THREE, sword, capacity = 40) {
  if (!sword?.isSkinnedMesh) return null;
  const attribute = sword.geometry.attributes.position;
  sword.geometry.computeBoundingBox();
  const span = sword.geometry.boundingBox.getSize(new THREE.Vector3());
  const axis = span.x > span.y && span.x > span.z ? 0 : span.y > span.z ? 1 : 2;
  let near = 0, far = 0;
  for (let i = 1; i < attribute.count; i++) {
    if (attribute.getComponent(i, axis) < attribute.getComponent(near, axis)) near = i;
    if (attribute.getComponent(i, axis) > attribute.getComponent(far, axis)) far = i;
  }
  // Which end is the tip? The hilt sits near the hand bone; the tip is the far end from it.
  const data = new Float32Array(capacity * 7);   // root xyz, tip xyz, time
  let count = 0, start = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), hand = new THREE.Vector3();
  let flip = null;
  const at = i => ((start + i) % capacity) * 7;
  return {
    get count() { return count; },
    sample(time) {
      sword.skeleton.update();
      sword.getVertexPosition(near, a); sword.localToWorld(a);
      sword.getVertexPosition(far, b); sword.localToWorld(b);
      if (flip === null) {
        const parentBone = sword.skeleton.bones.find(bone => /hand/i.test(bone.name)) || sword.skeleton.bones[0];
        parentBone.getWorldPosition(hand);
        flip = a.distanceToSquared(hand) > b.distanceToSquared(hand);
      }
      const hilt = flip ? b : a, tip = flip ? a : b;
      const rx = hilt.x + (tip.x - hilt.x) * 0.32, ry = hilt.y + (tip.y - hilt.y) * 0.32, rz = hilt.z + (tip.z - hilt.z) * 0.32;
      const tx = hilt.x + (tip.x - hilt.x) * 1.08, ty = hilt.y + (tip.y - hilt.y) * 1.08, tz = hilt.z + (tip.z - hilt.z) * 1.08;
      if (count) {
        const o = at(count - 1);
        if ((data[o + 3] - tx) ** 2 + (data[o + 4] - ty) ** 2 + (data[o + 5] - tz) ** 2 > 1.8 * 1.8) count = 0;   // teleport
      }
      if (count === capacity) { start = (start + 1) % capacity; count--; }
      const o = at(count);
      data[o] = rx; data[o + 1] = ry; data[o + 2] = rz; data[o + 3] = tx; data[o + 4] = ty; data[o + 5] = tz; data[o + 6] = time;
      count++;
    },
    expire(time, life) {
      while (count && time - data[at(0) + 6] > life) { start = (start + 1) % capacity; count--; }
    },
    clear() { count = 0; },
    /** Tip position `back` samples ago into `out` (0 = latest). */
    tip(back, out) {
      if (!count) return null;
      const o = at(Math.max(0, count - 1 - back));
      return out.set(data[o + 3], data[o + 4], data[o + 5]);
    },
    get(i) { return at(i); },
    data,
  };
}

// Catmull-Rom on one scalar.
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// ---------------------------------------------------------------------------------------------
// 天刃 (musou-v2): the giant spirit blade, the 真・無雙 flame shroud that wraps it, the post-cleave screen split
// and the ground shockwave. Every one of these is exactly one Mesh created once here (hidden by default) and only
// repositioned / re-toggled per frame by the musou state machine further down; see the draw-budget comment above.
// ---------------------------------------------------------------------------------------------

/** Tapered cross of two strips (hilt at local y=0 to tip at y=1), width normalized to 1 at the hilt so the caller
 * can size the actual blade with a single scale.x/z (see BLADE_WIDTH). Reads from most camera angles. The taper
 * curves to a point (katana-like) rather than a straight wedge, and the spine drifts slightly sideways along its
 * length for a subtle curved-blade silhouette. */
function buildSpiritBladeGeometry(THREE, segments = 14) {
  const position = [], uv = [], index = [];
  const addStrip = swapAxis => {
    const base = position.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const width = Math.max(0.015, Math.pow(1 - t, 0.7)) * 0.5;
      const curve = Math.sin(t * Math.PI * 0.55) * 0.1;
      if (swapAxis) position.push(0, t, curve - width, 0, t, curve + width); else position.push(curve - width, t, 0, curve + width, t, 0);
      uv.push(0, t, 1, t);
    }
    for (let i = 0; i < segments; i++) { const a = base + i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  addStrip(false); addStrip(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}
// Real-world size of the spirit blade: ~6-7 m long (mesh.scale.y), ~0.72 m wide at the hilt (mesh.scale.x/z).
const BLADE_WIDTH = 0.72;

function createSpiritBlade(THREE, octaves = 4) {
  const geometry = buildSpiritBladeGeometry(THREE);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uReveal: { value: 0 }, uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(1.5, 0.9, 2.0) }, uEdge: { value: new THREE.Color(0.5, 0.15, 0.9) },
    },
    vertexShader: BLADE_VERTEX, fragmentShader: bladeFragment(octaves),
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 16;
  mesh.name = 'combat-fx-spirit-blade';
  return { mesh, material, dispose() { geometry.dispose(); material.dispose(); } };
}

/**
 * (8) One mesh/material carries BOTH the blade-wrap flame (3 crossed quads, aBlade=1, sized to match the spirit
 * blade's own BLADE_WIDTH/length so it reads as "the blade is on fire") AND a ground/body flame ring around her
 * feet (aBlade=0, a handful of quads in a ring) -- so the ambient 真・無雙 fire is this same shader (flow-upward,
 * hot core -> purple -> transparent edge) instead of the old atlas "petal" particles, with zero extra draw calls.
 */
function buildFlameGeometry(THREE) {
  const position = [], uv = [], index = [], aBlade = [];
  const quad = (blade, p0, p1, p2, p3) => {
    const base = position.length / 3;
    for (const p of [p0, p1, p2, p3]) position.push(...p);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    aBlade.push(blade, blade, blade, blade);
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  };
  // blade wrap: 3 crossed quads. uBladeMatrix is the spirit blade's own matrixWorld, which already bakes in its
  // scale (BLADE_WIDTH on x/z, length 6-7 on y) -- so these vertices must be authored in the SAME normalized 0..1
  // local space the blade's own geometry uses (hilt at y=0, tip at y=1), not in real metres, or the length gets
  // applied twice (round-4 bug: bh=6.2 here x a scale.y of 6-7 produced a ~40 m tall quad -- read as a giant flat
  // translucent sheet across the frame). bw is deliberately > the blade's own ~0.5 half-width so the flame reads
  // as a halo wrapping slightly outside the blade surface; bh slightly overshoots 1.0 so it licks past the tip.
  const bw = 0.85, bh = 1.05;
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI, cs = Math.cos(angle) * bw, sn = Math.sin(angle) * bw;
    quad(1, [-cs, 0, -sn], [cs, 0, sn], [-cs, bh, -sn], [cs, bh, sn]);
  }
  // ground/body ring: 5 flame cards around the feet, flush with this mesh's own hero-anchored transform.
  const N = 5, ringR = 0.4, cardW = 0.46, cardH = 1.5;
  for (let k = 0; k < N; k++) {
    const angle = (k / N) * Math.PI * 2, cs = Math.cos(angle), sn = Math.sin(angle), tx = -sn * cardW * 0.5, tz = cs * cardW * 0.5;
    const cx = cs * ringR, cz = sn * ringR;
    quad(0, [cx - tx, 0, cz - tz], [cx + tx, 0, cz + tz], [cx - tx, cardH, cz - tz], [cx + tx, cardH, cz + tz]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aBlade', new THREE.Float32BufferAttribute(aBlade, 1));
  geometry.setIndex(index);
  return geometry;
}

function createFlameShroud(THREE, octaves = 4) {
  const geometry = buildFlameGeometry(THREE);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 }, uSeed: { value: 0 }, uBladeMatrix: { value: new THREE.Matrix4() },
      uHot: { value: new THREE.Color(2.4, 1.6, 2.8) }, uCore: { value: new THREE.Color(1.7, 0.35, 1.9) }, uEdge: { value: new THREE.Color(0.35, 0.05, 0.55) },
    },
    vertexShader: FLAME_VERTEX, fragmentShader: flameFragment(octaves),
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 15;
  mesh.name = 'combat-fx-flame-shroud';
  return { mesh, material, dispose() { geometry.dispose(); material.dispose(); } };
}

/** Full-NDC quad: samples one captured framebuffer snapshot, split along a jagged diagonal line, sliding apart. */
function createSplitOverlay(THREE) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null }, uSep: { value: 0 }, uAlpha: { value: 0 }, uSeed: { value: 0 }, uAngle: { value: 0.3 } },
    vertexShader: SPLIT_VERTEX, fragmentShader: SPLIT_FRAGMENT,
    transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 40;
  mesh.name = 'combat-fx-split';
  return {
    mesh, material, texture: null, texW: 0, texH: 0,
    dispose() { geometry.dispose(); material.dispose(); this.texture?.dispose(); },
  };
}

/** Flat ground ring, fake-distortion look (bright leading edge + dark trailing band), no refraction pass. */
function createShockwave(THREE, half = 9) {
  const geometry = new THREE.PlaneGeometry(half * 2, half * 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { uRadius: { value: 0 }, uWidth: { value: 1 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1.6, 1.0, 2.2) } },
    vertexShader: SHOCK_VERTEX, fragmentShader: SHOCK_FRAGMENT,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 8;
  mesh.name = 'combat-fx-shockwave';
  return { mesh, material, dispose() { geometry.dispose(); material.dispose(); } };
}

// ---------------------------------------------------------------------------------------------
// DOM HUD flair
// ---------------------------------------------------------------------------------------------

const CJK_SERIF = '"Hiragino Mincho ProN","Hiragino Mincho Pro","Songti TC","STSong","Noto Serif TC","Noto Serif CJK TC","Source Han Serif TC","PMingLiU",serif';

function hudCss(base) {
  return `
.cfx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;contain:strict;font-family:-apple-system,"PingFang TC","Noto Sans TC",sans-serif}
.cfx>*{position:absolute;display:none;will-change:transform,opacity}
.cfx-shade{inset:0;background:radial-gradient(ellipse 72% 68% at 50% 54%,rgba(24,6,48,0) 34%,rgba(10,2,24,.94) 100%),rgba(12,3,28,.5)}
.cfx-hurt{inset:0;background:radial-gradient(ellipse 70% 66% at 50% 50%,rgba(120,0,20,0) 55%,rgba(170,10,40,.6) 100%)}
.cfx-flash{inset:0;background:radial-gradient(circle at 50% 52%,rgba(255,255,255,.95),rgba(226,196,255,.6) 45%,rgba(140,80,255,.25) 100%)}
.cfx-lines{left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax 0 0 -80vmax;background:#f1e6ff;-webkit-mask:url(${base}fx-speedlines.webp?v=${FX_VERSION}) center/100% 100% no-repeat;mask:url(${base}fx-speedlines.webp?v=${FX_VERSION}) center/100% 100% no-repeat}
.cfx-combo{right:4.2%;top:29%;text-align:right;transform-origin:100% 60%;line-height:1}
.cfx-combo .n{display:inline-block;font:italic 900 68px/1 Georgia,"Times New Roman",serif;letter-spacing:-.03em;padding:0 .08em;color:transparent;-webkit-background-clip:text;background-clip:text;background-image:linear-gradient(180deg,#fff 0%,#efe6ff 50%,#a78be6 100%);-webkit-text-stroke:1.6px rgba(16,6,30,.92);filter:drop-shadow(0 3px 0 rgba(8,2,18,.9)) drop-shadow(0 0 12px rgba(150,90,255,.55))}
.cfx-combo .h{display:block;margin-top:-4px;font:italic 800 17px/1 Georgia,serif;letter-spacing:.32em;color:#e3d6ff;text-shadow:0 2px 0 #12061f,0 0 10px rgba(150,90,255,.6)}
.cfx-combo .bar{display:block;margin:7px 0 0 auto;width:132px;height:4px;background:rgba(255,255,255,.14);border-radius:2px;overflow:hidden}
.cfx-combo .bar i{display:block;height:100%;background:linear-gradient(90deg,#8d5bff,#f2e8ff);transform-origin:100% 50%}
.cfx-combo.t1 .n{background-image:linear-gradient(180deg,#fffbe6 0%,#ffe27a 48%,#ff9f1a 100%);filter:drop-shadow(0 3px 0 rgba(30,10,0,.9)) drop-shadow(0 0 14px rgba(255,190,60,.6))}
.cfx-combo.t1 .h{color:#ffe7a0}
.cfx-combo.t2 .n{background-image:linear-gradient(180deg,#fff2dc 0%,#ff9a48 45%,#ff2f2a 100%);filter:drop-shadow(0 3px 0 rgba(40,0,0,.9)) drop-shadow(0 0 16px rgba(255,90,40,.7))}
.cfx-combo.t2 .h{color:#ffb28a}
.cfx-combo.t3 .n{background-image:linear-gradient(180deg,#fff0ff 0%,#ff79e8 42%,#9b34ff 100%);filter:drop-shadow(0 3px 0 rgba(30,0,40,.9)) drop-shadow(0 0 18px rgba(230,80,255,.75))}
.cfx-combo.t3 .h{color:#ffb6f4}
.cfx-combo.t4 .n{background-image:linear-gradient(180deg,#ffffff 0%,#9ff6ff 26%,#ff9cf4 52%,#fff49a 78%,#ffffff 100%);filter:drop-shadow(0 3px 0 rgba(20,0,30,.9)) drop-shadow(0 0 20px rgba(255,255,255,.8))}
.cfx-combo.t4 .h{color:#fff}
.cfx-dmg{left:0;top:0;font:italic 800 19px/1 Georgia,"Times New Roman",serif;color:#f4ecff;-webkit-text-stroke:1px #1c0b2e;text-shadow:0 2px 0 #12061f;white-space:nowrap}
.cfx-dmg.h{font-size:30px;color:#ffd66b;text-shadow:0 2px 0 #2a0d00,0 0 10px rgba(255,170,40,.7)}
.cfx-dmg.s{font-size:34px;color:#ffa6f2;text-shadow:0 2px 0 #24002a,0 0 12px rgba(255,90,230,.75)}
.cfx-dmg.musou{font-size:38px}
.cfx-dmg.musou.h{font-size:60px}
.cfx-dmg.musou.s{font-size:68px}
.cfx-ko{left:56%;right:4%;top:30%;text-align:center;transform-origin:50% 50%}
.cfx-ko b{display:inline-block;font:900 128px/1 Georgia,"Times New Roman",serif;color:#fff8ff;-webkit-text-stroke:3px #1a0824;text-shadow:0 4px 0 #0c0316,0 0 30px rgba(200,120,255,.9)}
.cfx-ko span{display:block;margin-top:-8px;font:italic 800 24px/1 Georgia,serif;letter-spacing:.55em;color:#e6d4ff;text-shadow:0 0 12px rgba(160,90,255,.8)}
.cfx-ko i{position:absolute;left:50%;top:100%;display:block;margin-top:10px;transform:translateX(-50%);font:900 84px/1 ${CJK_SERIF};color:#ffe37e;-webkit-text-stroke:3px #4a0d1c;text-shadow:0 0 24px rgba(255,150,60,.9);opacity:0}
.cfx-stamp{left:0;top:0;width:128px;height:128px;margin:-64px 0 0 -64px}
.cfx-stamp i{position:absolute;inset:8px;border:8px solid #ff3d2e;border-radius:50%;box-shadow:0 0 20px rgba(255,60,30,.65),inset 0 0 14px rgba(255,60,30,.5);-webkit-mask:url(${base}fx-grain.png?v=${FX_VERSION}) center/180% 100%;mask:url(${base}fx-grain.png?v=${FX_VERSION}) center/180% 100%}
.cfx-stamp b{position:absolute;inset:0;display:grid;place-items:center;font:900 88px/1 ${CJK_SERIF};color:#ffe37e;-webkit-text-stroke:3px #5c0904;text-shadow:0 0 18px rgba(255,120,40,.85),5px 5px 0 #260300}
.cfx-banner{left:0;top:17%;width:min(640px,72vw);height:118px}
.cfx-banner .band{position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,6,52,.96),rgba(118,40,214,.92) 58%,rgba(214,150,255,.75));-webkit-mask:url(${base}fx-brush.png?v=${FX_VERSION}) 0 0/100% 100% no-repeat;mask:url(${base}fx-brush.png?v=${FX_VERSION}) 0 0/100% 100% no-repeat}
.cfx-banner b{position:absolute;left:8%;top:50%;transform:translateY(-54%);font:900 66px/1 ${CJK_SERIF};color:#fff6e2;letter-spacing:.03em;-webkit-text-stroke:2px #1a0830;text-shadow:0 0 16px rgba(255,210,130,.75),4px 5px 0 #12051f;white-space:nowrap}
.cfx-banner small{position:absolute;left:9%;bottom:8px;font:italic 700 12px/1 Georgia,serif;letter-spacing:.34em;color:#f0dcff;text-shadow:0 1px 0 #000}
.cfx-grade{inset:0;background:radial-gradient(ellipse 78% 72% at 50% 54%,rgba(60,0,70,0) 42%,rgba(70,0,90,.45) 78%,rgba(40,0,55,.8) 100%)}
.cfx-cutin{left:0;right:0;top:0;height:19%;min-height:100px;overflow:hidden}
.cfx-cutin .card{position:absolute;inset:0 -6%;transform:skewY(-4deg);background:linear-gradient(90deg,#12031e 0%,#3a0a52 40%,#12031e 100%);border-top:3px solid #f0d8ff;border-bottom:3px solid #f0d8ff;box-shadow:0 0 24px rgba(210,120,255,.8)}
.cfx-cutin .eyes{position:absolute;inset:0;background:url(${base}fx-cutin.webp?v=${FX_VERSION}) center/auto 118% no-repeat}
.cfx-cutin .lines{position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,0) 0 22px,rgba(240,220,255,.16) 22px 24px,rgba(255,255,255,0) 24px 57px)}
.cfx-gauge-full{animation:cfx-gauge .9s ease-in-out infinite}
@keyframes cfx-gauge{0%,100%{box-shadow:0 0 6px 1px rgba(190,120,255,.55);filter:brightness(1.05)}50%{box-shadow:0 0 16px 4px rgba(225,165,255,.95);filter:brightness(1.55)}}
.cfx-title{left:0;right:0;top:12%;height:200px}
.cfx-title .band{position:absolute;left:4%;right:4%;top:34%;bottom:34%;opacity:.8;background:linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(236,210,255,.3) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(8,2,18,0),rgba(46,10,92,.62) 14%,rgba(128,48,230,.62) 52%,rgba(46,10,92,.58) 88%,rgba(8,2,18,0));-webkit-mask:url(${base}fx-brush.png?v=${FX_VERSION}) 0 0/100% 100% no-repeat;mask:url(${base}fx-brush.png?v=${FX_VERSION}) 0 0/100% 100% no-repeat;transform-origin:0 50%}
.cfx-title .txt{position:absolute;left:0;right:0;top:50%;display:flex;justify-content:center;gap:.04em;transform:translateY(-56%) skewX(-7deg)}
.cfx-title .txt span{display:inline-block;font:900 clamp(64px,11.5vw,156px)/1 ${CJK_SERIF};color:#fbf5ff;-webkit-text-stroke:2.5px #14061f;text-shadow:0 0 22px rgba(176,96,255,.95),0 0 4px rgba(255,255,255,.8),6px 7px 0 #0c0317}
.cfx-title.grain .txt span{-webkit-mask:url(${base}fx-grain.png?v=${FX_VERSION}) center/100% 100%;mask:url(${base}fx-grain.png?v=${FX_VERSION}) center/100% 100%}
.cfx-title .txt span.dot{font-size:.5em;align-self:center;margin:0 -.1em}
.cfx-title.true .band{background:linear-gradient(180deg,rgba(255,255,255,0) 30%,rgba(255,200,240,.35) 50%,rgba(255,255,255,0) 70%),linear-gradient(90deg,rgba(8,2,18,0),rgba(70,6,60,.62) 14%,rgba(190,30,170,.62) 52%,rgba(70,6,60,.58) 88%,rgba(8,2,18,0))}
.cfx-title.true .txt span{text-shadow:0 0 26px rgba(255,80,220,.95),0 0 4px rgba(255,255,255,.8),6px 7px 0 #1a0214}
.cfx-title .sub{position:absolute;left:0;right:0;bottom:-6px;text-align:center;font:italic 700 13px/1 Georgia,serif;letter-spacing:.6em;color:#dccbff;text-shadow:0 1px 0 #000,0 0 10px rgba(160,100,255,.8)}
@media (max-width:900px),(pointer:coarse){
 .cfx-combo{right:22%;top:24%}.cfx-combo .n{font-size:46px}.cfx-combo .h{font-size:13px}.cfx-combo .bar{width:92px}
 .cfx-banner{height:84px}.cfx-banner b{font-size:44px}.cfx-title{height:150px}.cfx-stamp{transform:scale(.75)}
 .cfx-dmg{font-size:15px}.cfx-dmg.h{font-size:23px}.cfx-dmg.s{font-size:26px}
 .cfx-dmg.musou{font-size:30px}.cfx-dmg.musou.h{font-size:46px}.cfx-dmg.musou.s{font-size:52px}
 .cfx-ko{left:50%;right:3%}.cfx-ko b{font-size:78px}.cfx-ko span{font-size:16px}.cfx-ko i{font-size:56px}
}
/* 手機橫向：連擊數移到右側按鈕上方，擊破橫幅與標題放在狀態卡下方，橫幅字級跟著螢幕寬縮小 */
@media (max-height:500px) and (orientation:landscape){
 .cfx-combo{right:calc(14px + var(--safe-right,0px));top:calc(112px + var(--safe-top,0px))}
 .cfx-banner{top:calc(96px + var(--safe-top,0px))}.cfx-banner b{font-size:clamp(28px,5.2vw,44px)}
 .cfx-title{top:calc(60px + var(--safe-top,0px))}
}`;
}

function createHud(container, settings, style = {}) {
  const doc = container?.ownerDocument;
  if (!doc) return null;
  if (!doc.getElementById('combat-fx-style')) {
    const tag = doc.createElement('style');
    tag.id = 'combat-fx-style';
    tag.textContent = hudCss(FX_BASE);
    doc.head.append(tag);
  }
  const layer = doc.createElement('div');
  layer.className = 'cfx';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="cfx-grade"></div><div class="cfx-shade"></div><div class="cfx-hurt"></div><div class="cfx-lines"></div><div class="cfx-flash"></div>'
    + '<div class="cfx-cutin"><div class="card"><div class="eyes"></div><div class="lines"></div></div></div>'
    + '<div class="cfx-combo"><span class="n">0</span><span class="h">HITS</span><span class="bar"><i></i></span></div>'
    + '<div class="cfx-banner"><div class="band"></div><b></b><small></small></div>'
    + `<div class="cfx-title${settings.titleGrain ? ' grain' : ''}"><div class="band"></div><div class="txt"></div><div class="sub"></div></div>`
    + '<div class="cfx-ko"><b>0</b><span>KO</span><i></i></div>';
  container.append(layer);
  const q = sel => layer.querySelector(sel);
  const el = {
    layer, grade: q('.cfx-grade'), cutin: q('.cfx-cutin'), cutinCard: q('.cfx-cutin .card'), shade: q('.cfx-shade'), hurt: q('.cfx-hurt'), lines: q('.cfx-lines'), flash: q('.cfx-flash'),
    combo: q('.cfx-combo'), comboNum: q('.cfx-combo .n'), comboBar: q('.cfx-combo .bar i'),
    banner: q('.cfx-banner'), bannerText: q('.cfx-banner b'), bannerSub: q('.cfx-banner small'),
    title: q('.cfx-title'), titleBand: q('.cfx-title .band'), titleText: q('.cfx-title .txt'), titleChars: [], titleSub: q('.cfx-title .sub'),
    ko: q('.cfx-ko'), koNum: q('.cfx-ko b'), koGrade: q('.cfx-ko i'),
  };
  const damage = [];
  for (let i = 0; i < settings.damageNumbers; i++) {
    const node = doc.createElement('div');
    node.className = 'cfx-dmg';
    layer.append(node);
    damage.push({ node, age: 1, life: 0.7, x: 0, y: 0, z: 0, kind: '', shown: false, punchy: false });
  }
  const stamps = [];
  for (let i = 0; i < 2; i++) {
    const node = doc.createElement('div');
    node.className = 'cfx-stamp';
    node.innerHTML = '<i></i><b>破</b>';
    layer.append(node);
    stamps.push({ node, age: 1, life: 0.9, x: 0, y: 0, z: 0, rot: 0, shown: false });
  }
  if (style.comboRight) el.combo.style.right = style.comboRight;
  if (style.comboTop) el.combo.style.top = style.comboTop;
  return { el, damage, stamps, damageRing: new RingIndex(damage.length), stampRing: new RingIndex(stamps.length) };
}

function show(node, visible) {
  const value = visible ? 'block' : 'none';
  if (node.style.display !== value) node.style.display = value;
}

// ---------------------------------------------------------------------------------------------
// createCombatFx
// ---------------------------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {object} o.THREE           three module namespace
 * @param {object} o.scene
 * @param {object} o.camera
 * @param {object} [o.renderer]      used for prewarming shaders and the canvas size (damage numbers)
 * @param {object} o.hero            hero root Group (position = feet, rotation.y = yaw)
 * @param {object} [o.heroModel]     gltf scene of the heroine (skinned meshes for ghosts / aura)
 * @param {object} [o.sword]         the sword SkinnedMesh ('Hero_sword')
 * @param {Element} [o.hud]          DOM container for the HUD flair (null = no HUD)
 * @param {'desktop'|'mobile'|object} [o.quality]
 * @param {(x:number,z:number)=>number} [o.groundAt]
 * @param {number} [o.seed]
 * @param {object} [o.textures]      { particles, strips } THREE textures (tests / custom loading)
 * @param {object} [o.textureUrls]   { 'fx-particles.png': url, 'fx-strips.png': url } preloaded object URLs
 */
export function createCombatFx(o) {
  const THREE = o.THREE;
  const { scene, camera, renderer, hero, heroModel } = o;
  const qualityName = typeof o.quality === 'string' ? o.quality : 'desktop';
  const q = { ...QUALITY[qualityName] || QUALITY.desktop, ...(typeof o.quality === 'object' ? o.quality : null) };
  const groundAt = o.groundAt || (() => 0);
  // 'fx' (default): timeScale() is the single applier of hit-stop / slow motion / freezes. It follows authored timing
  // when the events carry it (musouStart.timeScale keys, musouFreeze, officerDown.slowMo, hitstop) and fills in its own
  // beats otherwise. 'game': the caller keeps its own time scaling; timeScale() always returns 1 (visuals still sync).
  const timing = o.timing === 'game' ? 'game' : 'fx';
  const rand = mulberry(o.seed ?? 0x5eed);
  const rnd = (a, b) => a + (b - a) * rand();

  // ---- textures ----
  const owned = [], loading = [];
  const loadTexture = name => {
    let texture;
    if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
      const url = o.textureUrls?.[name] || `${FX_BASE}${name}?v=${FX_VERSION}`;   // textureUrls：預載好的 object URL
      loading.push(new Promise(resolve => { texture = new THREE.TextureLoader().load(url, resolve, undefined, resolve); }));
    } else { texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); texture.needsUpdate = true; }
    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 2;
    owned.push(texture);
    return texture;
  };
  const particleTexture = o.textures?.particles || loadTexture('fx-particles.png');
  const stripTexture = o.textures?.strips || loadTexture('fx-strips.png');

  // Two pools, one draw each: world particles are depth-tested (dust, debris, shards, flames); hit flashes and
  // sparks draw on top of everything so the heroine's own body never hides the impact from the follow camera.
  const worldParticles = createParticleField(THREE, q.particles, particleTexture);
  const overlayParticles = createParticleField(THREE, q.overlayParticles, particleTexture, { depthTest: false, renderOrder: 14, name: 'combat-fx-hit-overlay' });
  const particles = {
    emit(style, ...args) { (style.overlay ? overlayParticles : worldParticles).emit(style, ...args); },
    update(dt) { worldParticles.update(dt); overlayParticles.update(dt); },
    alive() { return worldParticles.alive() + overlayParticles.alive(); },
    clear() { worldParticles.clear(); overlayParticles.clear(); },
    capacity: q.particles + q.overlayParticles,
    meshes: [worldParticles.mesh, overlayParticles.mesh],
    get draws() { return (worldParticles.mesh.visible ? 1 : 0) + (overlayParticles.mesh.visible ? 1 : 0); },
    dispose() { worldParticles.dispose(); overlayParticles.dispose(); },
  };
  const strips = createStripBatch(THREE, q.stripSlots, q.stripCols, stripTexture);
  scene.add(...particles.meshes, strips.mesh);
  // 天刃 (musou-v2): 4 pooled meshes, only ever toggled visible / repositioned during the long-form musou finale.
  const spiritBlade = createSpiritBlade(THREE, q.fbmOctaves);
  const flameShroud = createFlameShroud(THREE, q.fbmOctaves);
  const splitOverlay = createSplitOverlay(THREE);
  const shockwave = createShockwave(THREE);
  scene.add(spiritBlade.mesh, flameShroud.mesh, splitOverlay.mesh, shockwave.mesh);
  const echoes = createEchoes(THREE, scene, o.heroModel, q);
  const blade = createBladeSampler(THREE, o.sword);
  const hud = o.hud ? createHud(o.hud, q, o.hudStyle) : null;
  // Cache the HUD size (reading clientWidth every frame after style writes would force a layout).
  const hudSize = { w: 1, h: 1 };
  let hudObserver = null;
  if (hud) {
    const measure = () => { hudSize.w = hud.el.layer.clientWidth || 1; hudSize.h = hud.el.layer.clientHeight || 1; };
    measure();
    if (typeof ResizeObserver === 'function') { hudObserver = new ResizeObserver(measure); hudObserver.observe(hud.el.layer); }
  }

  // Sword glow: one private clone of the sword material (allocated once), emissive driven per frame.
  let swordMaterial = null, swordOriginal = null;
  if (o.sword?.material && !Array.isArray(o.sword.material) && o.sword.material.emissive) {
    swordOriginal = o.sword.material;
    swordMaterial = swordOriginal.clone();
    o.sword.material = swordMaterial;
  }

  // ---- state ----
  const slow = new TimeScale();
  const combo = new ComboCounter(o.comboWindow ?? 2.5);
  let frameIndex = 0, realTime = 0, gameTime = 0, kills = o.kills ?? 0, hitsThisFrame = 0;
  let heroAction = 'idle';
  const move = { kind: '', combo: 0, startedAt: -10, echo: false, echoEvery: 0.06, lastEcho: -10 };
  const cam = {
    punch: 0, punchT: 1, punchDur: 0.4, punchAmp: 0, trauma: 0, roll: 0, rollT: 1, dolly: 0, dollyT: 1,
    // cinematic rig (eased toward goals every frame): orbit around the pivot, dolly factor, lift, look-at blend
    orbit: 0, dolly: 1, lift: 0, look: 0, goal: { orbit: 0, dolly: 1, lift: 0, look: 0, rate: 8 },
    pivot: new THREE.Vector3(), pivotOnHero: true, calm: false,
    saved: new THREE.Vector3(), savedQ: new THREE.Quaternion(), savedFov: 0, applied: false,
  };
  const officerCam = { t: 9, dur: 0.8, point: new THREE.Vector3() };
  const names = new Map();              // enemyId -> officer / boss name (from 'officer' / 'bossIntro' events)
  const bannered = new Set();           // enemyIds whose 擊破 banner already showed
  const hudFade = { value: 1, target: 1, applied: 1, targets: [].concat(o.hudFade || []).filter(Boolean) };
  const gauge = { full: false, targets: [].concat(o.gauge || []).filter(Boolean) };
  const overlay = { lines: 0, linesT: 1, linesDur: 0.4, flash: 0, flashT: 1, flashDur: 0.14, shade: 0, hurt: 0 };
  const musou = {
    active: false, t: 0, swings: 0, endAt: 0, center: new THREE.Vector3(),
    // 天刃 (long-form only): facing/total swings from the activation event, camera-cut bookkeeping, KO tally + reveal.
    facing: undefined, totalSwings: 10, leapAt: null, cut: null, cutT: 0, cutSeed: 0, orbitBase: 0,
    sessionKills: 0, koT: 9, koShown: -1, koGradeSet: false,
  };
  // Spirit blade / flame-shroud state machine: 'hidden' -> 'growing' -> 'held' (<-> 'sweeping') -> 'cleaving' -> 'fading'.
  const spirit = { phase: 'hidden', t: 0, reveal: 0, angle: 0, sweepDur: 0.34, seed: 0 };
  const cutUp = new THREE.Vector3(0, 1, 0), cutDown = new THREE.Vector3(0, -1, 0);
  const cutTmp = new THREE.Vector3(), cutTmp2 = new THREE.Vector3(), cutQuat = new THREE.Quaternion();
  const heroBody = new THREE.Vector3();
  const splitState = { pending: false, active: false, t: 0, dur: 0.25 };
  const shockState = { active: false, t: 0, dur: 0.55, x: 0, y: 0, z: 0, maxR: 4 };
  const hudState = { comboShown: -1, tier: -1, pulse: 0, pulseAmp: 0, fade: 0, bannerT: 9, stampPulse: 0, titleT: 9, hue: 0 };
  // Shared canonical "true original" material per mesh (round 7 fix): hit-flash and enemy-occlusion both swap
  // mesh.material, and previously each cached whatever it first read as "the original" independently -- if a hit
  // landed the same frame an enemy entered occlusion, occlusion could capture the HOT flash clone as its "original",
  // and the enemy stayed lit forever after the musou. ownedMaterials marks every clone either system creates;
  // trueOriginalOf() only refreshes its cache from mesh.material when the mesh is NOT currently wearing one of our
  // own clones, so whichever system reads it first (or after an external change, e.g. battle.js's officer tint)
  // always gets the same real original, however the two systems interleave within a frame.
  const trueOriginal = new WeakMap();
  const ownedMaterials = new WeakSet();
  function trueOriginalOf(mesh) {
    const current = mesh.material;
    if (!ownedMaterials.has(current)) trueOriginal.set(mesh, current);
    return trueOriginal.get(mesh) ?? current;
  }
  const flashes = [];                 // active enemy flash records
  const flashByRoot = new WeakMap();
  const flashCache = new Map();       // source material -> { hot, warm }
  const airborne = new Map();         // id -> { h, x, y, z, seen, vy }
  const killTimes = [];               // recent kill stamps for group bursts
  const items = [];                   // strip effects
  const itemPool = [];
  let lastSwing = { normal: new THREE.Vector3(0, 1, 0), at: -10 };
  let hapticAt = -10;

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), fwd = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3(), chest = new THREE.Vector3();
  const quat = new THREE.Quaternion(), look = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  const ps = q.particleScale;
  const count = n => scaledCount(n, ps);

  // ---- helpers ----
  function heroForward(out, facing) {
    if (Number.isFinite(facing)) return out.set(Math.cos(facing), 0, Math.sin(facing));
    return out.set(Math.sin(hero.rotation.y), 0, Math.cos(hero.rotation.y));
  }
  function heroChest(out) { return out.set(hero.position.x, hero.position.y + 1.02, hero.position.z); }
  function haptic(pattern) {
    if (!q.haptics || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    if (realTime - hapticAt < 0.09) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    hapticAt = realTime;
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
  function addTrauma(amount) { if (!cam.calm) cam.trauma = Math.min(1, cam.trauma + amount); }
  function fovPunch(amount, duration = 0.4) {
    if (cam.punchT < 1 && Math.abs(cam.punchAmp) > Math.abs(amount)) return;
    cam.punchAmp = amount; cam.punchT = 0; cam.punchDur = duration;
  }
  function speedLines(duration = 0.4, strength = 1) { overlay.lines = strength; overlay.linesT = 0; overlay.linesDur = duration; }
  function screenFlash(strength = 0.35, duration = 0.14) { overlay.flash = Math.max(overlay.flash * (1 - overlay.flashT), strength); overlay.flashT = 0; overlay.flashDur = duration; }

  function item(type) {
    if (items.length >= q.stripSlots - 1) {                 // keep one slot for the blade trail
      let oldest = 0;
      for (let i = 1; i < items.length; i++) if (items[i].age / items[i].life > items[oldest].age / items[oldest].life) oldest = i;
      itemPool.push(items.splice(oldest, 1)[0]);
    }
    const it = itemPool.pop() || { c: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };
    it.type = type; it.age = 0; it.life = 0.3; it.row = 0; it.r = 1; it.g = 1; it.bl = 1; it.alpha = 1; it.mode = 0;
    it.r0 = 1; it.r1 = 1; it.w = 0.3; it.angle = 0; it.sweep = Math.PI; it.spin = 0; it.reveal = 0.06; it.hold = 0.3; it.height = 0; it.fadeFrom = 0.55;
    it.follow = false; it.musou = false;
    items.push(it);
    return it;
  }
  function setColor(it, r, g, b, a = 1) { it.r = r; it.g = g; it.bl = b; it.alpha = a; return it; }

  /** Slash arc in the plane (e1, e2) around c. */
  function slashArc(c, u, v, radius, { width = 0.3, angle = -0.4, sweep = 2.4, life = 0.26, row = STRIP_ROWS.slash, color = [1.25, 1.05, 1.5], alpha = 1, grow = 0.18, spin = 0.8 } = {}) {
    const it = item('arc');
    it.c.copy(c); it.a.copy(u); it.b.copy(v);
    it.r0 = radius; it.r1 = radius * (1 + grow); it.w = width; it.angle = angle; it.sweep = sweep; it.life = life; it.row = row; it.spin = spin;
    setColor(it, color[0], color[1], color[2], alpha);
    return it;
  }
  function groundRing(x, y, z, r0, r1, { life = 0.4, width = 0.5, row = STRIP_ROWS.ring, color = [1.1, 0.8, 1.6], alpha = 1, mode = 0, musou = false } = {}) {
    const it = item('ring');
    it.c.set(x, y, z); it.r0 = r0; it.r1 = r1; it.life = life; it.w = width; it.row = row; it.mode = mode; it.musou = musou;
    return setColor(it, color[0], color[1], color[2], alpha);
  }
  function pillar(x, y, z, r0, r1, height, { life = 0.35, color = [1.0, 0.7, 1.6], alpha = 1, musou = false } = {}) {
    const it = item('cyl');
    it.c.set(x, y, z); it.r0 = r0; it.r1 = r1; it.height = height; it.life = life; it.row = STRIP_ROWS.pillar; it.musou = musou;
    return setColor(it, color[0], color[1], color[2], alpha);
  }
  function decal(x, y, z, cell, size0, size1, { life = 1.4, angle = 0, color = [1, 1, 1], alpha = 1, mode = 0, fadeFrom = 0.55, spin = 0, musou = false } = {}) {
    const it = item('quad');
    it.c.set(x, y, z); it.row = cell; it.r0 = size0; it.r1 = size1; it.life = life; it.angle = angle; it.mode = mode; it.fadeFrom = fadeFrom; it.spin = spin; it.musou = musou;
    return setColor(it, color[0], color[1], color[2], alpha);
  }

  // ---- enemy impact flash (material swap, pooled per source material) ----
  function flashMaterials(source) {
    let entry = flashCache.get(source);
    if (entry) return entry;
    const clone = (setup) => {
      const m = source.clone();
      if (source.onBeforeCompile) m.onBeforeCompile = source.onBeforeCompile;
      if (Object.prototype.hasOwnProperty.call(source, 'customProgramCacheKey')) m.customProgramCacheKey = source.customProgramCacheKey;
      setup(m);
      ownedMaterials.add(m);
      return m;
    };
    if (source.side === THREE.BackSide) {
      entry = {
        hot: clone(m => m.color?.setRGB(1.0, 0.92, 1.0)),
        warm: clone(m => m.color?.setRGB(0.72, 0.38, 1.0)),
      };
    } else {
      entry = {
        hot: clone(m => { m.color?.setRGB(5.5, 5.0, 6.5); if (m.emissive) m.emissiveIntensity = (source.emissiveIntensity || 1) * 2.5; }),
        warm: clone(m => { m.color?.setRGB(2.1, 1.6, 2.9); }),
      };
    }
    flashCache.set(source, entry);
    return entry;
  }
  function flashEnemy(root, weight) {
    if (!root) return;
    let rec = flashByRoot.get(root);
    if (!rec) {
      rec = { root, meshes: [], t: 0, hot: 0.05, total: 0.14, stage: 0, active: false };
      // seed trueOriginal right away, in case this is the very first time either system has ever touched this
      // root -- at this exact point object.material is still whatever it genuinely was (this traversal itself
      // hasn't swapped anything yet), so it's always safe to cache here regardless of who touches the root next.
      root.traverse(object => { if (object.isMesh && object.material && !Array.isArray(object.material)) { rec.meshes.push(object); trueOriginalOf(object); } });
      flashByRoot.set(root, rec);
    }
    if (!rec.active) { rec.active = true; flashes.push(rec); }
    rec.t = 0; rec.hot = weight < 0.8 ? 0 : 0.035 + 0.025 * weight; rec.total = 0.1 + 0.06 * weight; rec.stage = -1;
  }
  /** Applies whichever material mesh k of a flash record should currently show, honouring trueOriginalOf() so a
   * flash starting the same frame an enemy enters occlusion (or vice versa) never captures the other effect's clone
   * as "the original". */
  function applyFlashMaterial(rec, k) {
    const mesh = rec.meshes[k];
    const original = trueOriginalOf(mesh);
    mesh.material = rec.stage === 0 ? original : flashMaterials(original)[rec.stage === 1 ? 'hot' : 'warm'];
  }
  function updateFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const rec = flashes[i];
      rec.t += dt;
      const stage = rec.t < rec.hot ? 1 : rec.t < rec.total ? 2 : 0;
      if (stage !== rec.stage) {
        rec.stage = stage;
        for (let k = 0; k < rec.meshes.length; k++) applyFlashMaterial(rec, k);
      }
      if (stage === 0) { rec.active = false; flashes.splice(i, 1); }
    }
  }
  function releaseFlashes() {
    for (const rec of flashes) { rec.stage = 0; for (let k = 0; k < rec.meshes.length; k++) applyFlashMaterial(rec, k); rec.active = false; }
    flashes.length = 0;
  }

  // ---- enemy occlusion (dither-fade enemies between the camera and the hero during the musou cuts) ----
  // Clones are cached per SOURCE material (like flashCache), not per enemy: most enemies of a role already share one
  // material instance, so this both cuts clone count and lets dispose() free them all instead of leaking one set per
  // enemy forever (occlusionByRoot is a WeakMap, but occlusionActive -- needed for restore-on-fade-out -- used to
  // hold a strong ref to every root that ever mid-faded, which kept them un-GC-able if battle.js deleted the enemy
  // before its fade finished). prewarm() precompiles the alphaHash program on a sample enemy so the first real fade
  // has no hitch. If an enemy is both occluded and mid hit-flash, the flash wins the material for its brief window
  // (see applyOcclusion) rather than the two fighting over mesh.material every frame.
  const occlusionCache = new Map();   // source material -> dither clone (shared by every mesh using that material)
  const occlusionByRoot = new WeakMap();
  const occlusionActive = new Set();
  function occludeMaterial(source) {
    let clone = occlusionCache.get(source);
    if (clone) return clone;
    clone = source.clone();
    clone.transparent = true;
    clone.alphaHash = true;
    clone.alphaTest = 0;
    clone.depthWrite = true;
    clone.opacity = 1;
    if (source.onBeforeCompile) clone.onBeforeCompile = source.onBeforeCompile;
    ownedMaterials.add(clone);
    occlusionCache.set(source, clone);
    return clone;
  }
  function ensureOcclusion(root) {
    let rec = occlusionByRoot.get(root);
    if (rec) return rec;
    rec = { root, meshes: [], clones: [], alpha: 0 };
    root.traverse(object => {
      if (!object.isMesh || !object.material || Array.isArray(object.material)) return;
      rec.meshes.push(object); rec.clones.push(occludeMaterial(trueOriginalOf(object)));
    });
    occlusionByRoot.set(root, rec);
    return rec;
  }
  function applyOcclusion(rec) {
    if (flashByRoot.get(rec.root)?.active) return;   // let an active hit-flash keep the material this frame
    for (let i = 0; i < rec.meshes.length; i++) {
      const clone = rec.clones[i];
      clone.opacity = 1 - rec.alpha * 0.82;   // dither down toward ~18% density, never fully invisible (readable silhouette)
      if (rec.meshes[i].material !== clone) rec.meshes[i].material = clone;
    }
  }
  function restoreOcclusion(rec) {
    for (let i = 0; i < rec.meshes.length; i++) {
      const original = trueOriginalOf(rec.meshes[i]);
      if (rec.meshes[i].material !== original) rec.meshes[i].material = original;
    }
  }
  const occCam = new THREE.Vector3(), occDir = new THREE.Vector3(), occAt = new THREE.Vector3(), occTo = new THREE.Vector3();
  const occHeroChest = new THREE.Vector3(), occHeroNdc = new THREE.Vector3(), occAtNdc = new THREE.Vector3();
  const occLiveRoots = new Set();
  const OCC_HERO_RADIUS = 0.55, OCC_ENEMY_RADIUS = 0.55, OCC_NEAR_CAM = 2.5;
  function updateOcclusion(dt, enemiesMap) {
    // sweep stale recs first: battle.js deletes a killed rigged enemy from the map immediately, which could
    // previously leave its rec (and clones) stuck in occlusionActive -- and un-GC-able -- forever mid-fade.
    if (occlusionActive.size) {
      occLiveRoots.clear();
      if (enemiesMap) for (const actor of enemiesMap.values()) if (actor?.root) occLiveRoots.add(actor.root);
      for (const rec of occlusionActive) {
        if (!occLiveRoots.has(rec.root)) { restoreOcclusion(rec); occlusionActive.delete(rec); occlusionByRoot.delete(rec.root); }
      }
    }
    if (!enemiesMap || !enemiesMap.size) return;
    camera.getWorldPosition(occCam);
    camera.getWorldDirection(occDir);
    heroChest(occHeroChest);
    occTo.subVectors(occHeroChest, occCam);
    const heroDist = Math.max(0.001, occTo.length());
    const heroForwardDist = occTo.dot(occDir);
    const vFov = THREE.MathUtils.degToRad(camera.fov || 50) / 2;
    const hFov = Math.atan(Math.tan(vFov) * (camera.aspect || 16 / 9));
    // only fade an enemy that actually blocks the hero, not the whole ring around/behind her (round-4 fix: the
    // previous view-frustum-cone + absolute-distance test faded almost every enemy in shot, killing the "enemies
    // launched everywhere" payoff). "Blocks" = its own projected screen-space footprint (a small NDC box built from
    // an assumed body radius, projected the same way the hero's is) overlaps the hero's (expanded ~15%) AND it is
    // nearer the camera than she is -- or it is simply right on top of the camera regardless of angle.
    let heroOnScreen = false, heroRx = 0, heroRy = 0;
    if (heroForwardDist > 0.05) {
      occHeroNdc.copy(occHeroChest).project(camera);
      heroRx = (OCC_HERO_RADIUS / heroForwardDist) / Math.tan(hFov) * 1.15;
      heroRy = (OCC_HERO_RADIUS / heroForwardDist) / Math.tan(vFov) * 1.15;
      heroOnScreen = true;
    }
    for (const actor of enemiesMap.values()) {
      const root = actor?.root;
      if (!root) continue;
      let target = 0;
      if (musou.active) {
        root.getWorldPosition(occAt); occAt.y += 1.0;   // approximate chest height, like heroChest()
        occTo.subVectors(occAt, occCam);
        const dist = occTo.length();
        const forwardDist = occTo.dot(occDir);
        if (dist < OCC_NEAR_CAM) target = 1;
        else if (heroOnScreen && forwardDist > 0.05 && dist < heroDist - 0.05) {
          occAtNdc.copy(occAt).project(camera);
          const ex = (OCC_ENEMY_RADIUS / forwardDist) / Math.tan(hFov);
          const ey = (OCC_ENEMY_RADIUS / forwardDist) / Math.tan(vFov);
          if (Math.abs(occAtNdc.x - occHeroNdc.x) < heroRx + ex && Math.abs(occAtNdc.y - occHeroNdc.y) < heroRy + ey) target = 1;
        }
      }
      let rec = occlusionByRoot.get(root);
      if (!rec) { if (target < 0.01) continue; rec = ensureOcclusion(root); }
      const wasVisible = rec.alpha > 0.015;
      rec.alpha += (target - rec.alpha) * Math.min(1, dt * (target > rec.alpha ? 7 : 3));
      const visible = rec.alpha > 0.015;
      if (visible !== wasVisible) { if (visible) occlusionActive.add(rec); else { occlusionActive.delete(rec); restoreOcclusion(rec); } }
      if (visible) applyOcclusion(rec);
    }
  }
  function releaseOcclusion() {
    for (const rec of occlusionActive) { restoreOcclusion(rec); rec.alpha = 0; }
    occlusionActive.clear();
  }

  // ---- hit / kill / slam recipes ----
  function hitCentre(target, ground, out) {
    if (target) {
      target.getWorldPosition(out);
      const model = target.children[0] || target;
      model.getWorldScale(tmp3);
      const height = target.userData?.height ? target.userData.height * 0.52 : 1.05 * tmp3.y;
      out.y += height;
      return out;
    }
    return out.set(ground.x, (ground.y ?? 0) + 1.05, ground.z);
  }
  function hitDirection(at, out) {
    out.set(at.x - hero.position.x, 0, at.z - hero.position.z);
    if (out.lengthSq() < 1e-4) heroForward(out);
    return out.normalize();
  }

  function sparkBurst(at, dir, tangent, n, speed, color, sizeScale = 1) {
    for (let i = 0; i < n; i++) {
      const side = rnd(-1, 1), lift = rnd(-0.1, 0.75), s = speed * rnd(0.55, 1.15);
      const vx = (dir.x * 0.75 + tangent.x * side * 0.9) * s, vz = (dir.z * 0.75 + tangent.z * side * 0.9) * s;
      const vy = (dir.y * 0.75 + tangent.y * side * 0.9 + lift) * s;
      particles.emit(STYLE.spark, at.x, at.y, at.z, vx, vy, vz, rnd(0.2, 0.36), 0.1 * sizeScale, 0.03 * sizeScale, color[0], color[1], color[2], 1);
    }
  }
  function shardBurst(at, dir, n, speed, color, sizeScale = 1, upward = 0.4) {
    for (let i = 0; i < n; i++) {
      const s = speed * rnd(0.5, 1.1);
      const a = rnd(-0.9, 0.9);
      const cs = Math.cos(a), sn = Math.sin(a);
      const dx = dir.x * cs - dir.z * sn, dz = dir.x * sn + dir.z * cs;
      particles.emit(STYLE.shard, at.x + rnd(-0.1, 0.1), at.y + rnd(-0.2, 0.25), at.z + rnd(-0.1, 0.1),
        dx * s, (rnd(0.1, 0.9) + upward) * s * 0.7, dz * s, rnd(0.4, 0.65), 0.19 * sizeScale * rnd(0.7, 1.3), 0.06 * sizeScale,
        color[0], color[1], color[2], 1);
    }
  }

  function onHit(event, pos, target) {
    const nth = hitsThisFrame++;
    const w = hitWeight(event) * crowdFactor(nth);
    const at = hitCentre(target, pos, tmp);
    const dir = hitDirection(at, tmp2);
    const recent = gameTime - lastSwing.at < 0.25;
    const tangent = tmp3.crossVectors(recent ? lastSwing.normal : up, dir);
    if (tangent.lengthSq() < 1e-4) tangent.set(-dir.z, 0, dir.x);
    tangent.normalize();
    const special = event.source === 'special', heavy = event.source === 'heavy';
    const armored = !!event.armored;
    const hot = armored ? [1.1, 1.5, 2.4] : heavy ? [2.4, 1.9, 1.5] : [2.3, 1.9, 2.7];
    const violet = armored ? [0.5, 0.8, 1.8] : [0.95, 0.42, 1.9];
    // bright cores (only the first few hits of a frame get the full flare, the rest share it)
    const ws = Math.min(w, 1.5);
    if (nth < 3) {
      particles.emit(STYLE.impact, at.x, at.y, at.z, 0, 0, 0, 0.085 + 0.03 * w, 0.75 * ws, 1.45 * ws, hot[0], hot[1], hot[2], 1, rnd(0, 6.28), 0);
      particles.emit(STYLE.flare, at.x, at.y, at.z, 0, 0, 0, 0.12 + 0.03 * w, 1.0 * ws, 1.9 * ws, hot[0], hot[1], hot[2], 1, rnd(-0.25, 0.25), 0);
      particles.emit(STYLE.cut, at.x, at.y, at.z, tangent.x * 0.02, tangent.y * 0.02, tangent.z * 0.02, 0.11, 0.2 * w, 0.05 * w, 2.4, 2.2, 2.6, 1);
    }
    particles.emit(STYLE.glow, at.x, at.y, at.z, 0, 0, 0, 0.16 + 0.04 * w, 0.55 * ws, 1.25 * ws, violet[0] * 0.8, violet[1] * 0.8, violet[2] * 0.8, nth < 3 ? 0.85 : 0.35);
    if ((heavy || special) && nth < 2) particles.emit(STYLE.ring, at.x, at.y, at.z, 0, 0, 0, 0.13, 0.3 * w, 1.5 * w, violet[0], violet[1], violet[2], 0.7);
    const recipe = HIT_RECIPE[special ? 'special' : heavy ? 'heavy' : 'light'];
    const crowd = crowdFactor(nth);
    sparkBurst(at, dir, tangent, count(recipe.sparks * crowd + 0.5), heavy || special ? 13 : 10, hot, 1 + 0.25 * (w - 1));
    if (!armored) shardBurst(at, dir, count(recipe.shards * crowd + 0.5), heavy || special ? 7 : 5, violet, 1 + 0.3 * (w - 1));
    flashEnemy(target, nth < 4 ? w : 0.6);
    if (hud && nth < (heavy || special ? 4 : 2)) damageNumber(at, event.damage, special ? 's' : heavy ? 'h' : '');
    const n = combo.hit(gameTime);
    hudState.pulse = 0; hudState.pulseAmp = heavy || special ? 0.42 : 0.26;
    if (comboTier(n) > comboTier(n - 1)) { hudState.pulseAmp = 0.8; screenFlash(0.12, 0.12); }
    if (heavy || special) { addTrauma(0.22); haptic(18); } else addTrauma(0.07);
  }

  function onGuard(event, pos, target) {
    const at = hitCentre(target, pos, tmp);
    const dir = hitDirection(at, tmp2);
    const tangent = tmp3.set(-dir.z, 0, dir.x);
    at.addScaledVector(dir, -0.35);
    particles.emit(STYLE.flare, at.x, at.y, at.z, 0, 0, 0, 0.1, 0.9, 1.6, 1.1, 1.6, 2.6, 1, rnd(-0.2, 0.2), 0);
    particles.emit(STYLE.ring, at.x, at.y, at.z, 0, 0, 0, 0.16, 0.3, 1.4, 0.6, 0.9, 1.8, 0.8);
    dir.multiplyScalar(-1);
    sparkBurst(at, dir, tangent, count(HIT_RECIPE.guard.sparks), 9, [1.2, 1.7, 2.6]);
    addTrauma(0.05);
  }

  function onGuardBreak(event, pos, target) {
    const at = hitCentre(target, pos, tmp);
    const dir = hitDirection(at, tmp2);
    particles.emit(STYLE.impact, at.x, at.y, at.z, 0, 0, 0, 0.14, 1.4, 2.6, 2.6, 2.0, 0.9, 1, rnd(0, 6.28), 0);
    particles.emit(STYLE.flare, at.x, at.y, at.z, 0, 0, 0, 0.2, 2.2, 4.2, 2.6, 2.0, 0.9, 1, 0, 0);
    particles.emit(STYLE.ring, at.x, at.y, at.z, 0, 0, 0, 0.22, 0.6, 3.2, 2.2, 1.5, 0.5, 0.9);
    particles.emit(STYLE.glow, at.x, at.y, at.z, 0, 0, 0, 0.35, 1.5, 3.2, 1.8, 1.1, 0.35, 0.9);
    shardBurst(at, dir, count(16), 9, [2.2, 1.5, 0.45], 1.4, 0.6);
    sparkBurst(at, dir, tmp3.set(-dir.z, 0, dir.x), count(14), 14, [2.6, 2.0, 1.0], 1.3);
    groundRing(pos.x, groundAt(pos.x, pos.z) + 0.04, pos.z, 0.3, 3.0, { life: 0.4, color: [2.0, 1.4, 0.5], width: 0.45 });
    flashEnemy(target, 2);
    slow.trigger(0.26, 0.2, { ease: 0.12 });
    fovPunch(-5, 0.38);
    speedLines(0.32, 0.8);
    addTrauma(0.35);
    haptic([22, 30, 40]);
    if (hud) stamp(at);
  }

  function onKill(event, pos, target) {
    const boss = event.role === 'boss', officer = event.role === 'officer' || event.role === 'elite' && false;
    const big = boss || event.role === 'officer';
    const at = hitCentre(target, pos, tmp);
    at.y -= 0.15;
    const w = big ? 2.2 : 1;
    const nKill = killTimes.length;
    particles.emit(STYLE.glow, at.x, at.y, at.z, 0, 0, 0, 0.32 * w, 1.0 * w, 2.4 * w, 1.1, 0.5, 2.0, 0.9);
    for (let i = 0; i < count(big ? 26 : nKill > 3 ? 5 : 9); i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(2, 6) * (big ? 1.6 : 1);
      particles.emit(STYLE.shard, at.x, at.y, at.z, Math.cos(a) * s, rnd(2, 7) * (big ? 1.4 : 1), Math.sin(a) * s,
        rnd(0.45, 0.8), 0.15 * rnd(0.8, 1.3) * (big ? 1.4 : 1), 0.05, 0.9, 0.4, 2.0, 1);
    }
    for (let i = 0; i < count(big ? 3 : 1); i++) {
      particles.emit(STYLE.wisp, at.x + rnd(-0.2, 0.2), at.y, at.z + rnd(-0.2, 0.2), rnd(-0.4, 0.4), rnd(6, 9), rnd(-0.4, 0.4), rnd(0.5, 0.7), 0.26 * w, 0.1, 1.1, 0.6, 2.2, 1);
    }
    for (let i = 0; i < count(big ? 14 : 4); i++) {
      particles.emit(STYLE.ember, at.x + rnd(-0.4, 0.4), at.y + rnd(-0.4, 0.4), at.z + rnd(-0.4, 0.4), rnd(-0.8, 0.8), rnd(0.8, 2.6), rnd(-0.8, 0.8),
        rnd(0.8, 1.4), 0.12 * rnd(0.7, 1.4), 0.05, 1.3, 0.7, 2.2, 1);
    }
    killTimes.push({ t: realTime, x: at.x, z: at.z });
    const before = kills;
    kills++;
    if (musou.active) musou.sessionKills++;   // tally for the "NN KO" counter shown at the end of this musou
    const milestone = crossedMilestone(before, kills);
    if (milestone && hud) banner(`${milestone}人斬`, `KILL COUNT ${milestone}`);
    if (big) officerDown(event, pos, at, milestone);
  }
  /** Officer / boss killing blow (any source): 0.2x for ~0.8 s, push toward the falling officer, 擊破 banner. */
  function officerDown(event, pos, at, milestone = 0) {
    if (bannered.has(event.enemyId ?? -1) && event.enemyId !== undefined) return;
    if (event.enemyId !== undefined) bannered.add(event.enemyId);
    const y = groundAt(pos.x, pos.z) + 0.05;
    pillar(pos.x, y, pos.z, 0.5, 1.6, 5.5, { life: 0.55, color: [1.4, 0.8, 2.2] });
    groundRing(pos.x, y, pos.z, 0.4, 5.5, { life: 0.55, width: 0.7 });
    particles.emit(STYLE.impact, at.x, at.y + 0.2, at.z, 0, 0, 0, 0.16, 1.8, 3.6, 2.4, 2.0, 2.8, 1, rnd(0, 6.28), 0);
    particles.emit(STYLE.flare, at.x, at.y + 0.3, at.z, 0, 0, 0, 0.3, 2.5, 5, 2.4, 2.0, 2.8, 0.9, 0, 0);
    if (!musou.active) {
      const slowMo = event.slowMo || { scale: 0.2, seconds: 0.8 };
      if (!slow.has('officer')) slow.play([[slowMo.seconds, slowMo.scale]], { ramp: 0.15, force: true, tag: 'officer' });
      officerCam.t = 0; officerCam.dur = slowMo.seconds; officerCam.point.copy(at);
      fovPunch(-6, 0.9);
    }
    speedLines(0.6, 1);
    screenFlash(0.35, 0.14);
    addTrauma(0.45);
    haptic([30, 40, 70]);
    const name = event.name || names.get(event.enemyId) || '';
    if (hud && !milestone) banner(event.banner || (name ? `敵將 ${name} 擊破！` : '敵將擊破！'), event.role === 'boss' ? 'GATE WARDEN DOWN' : 'OFFICER DOWN');
  }

  function groupBurstCheck() {
    // kills in the last 0.2 s: 4+ at once -> one combined burst at their centroid
    while (killTimes.length && realTime - killTimes[0].t > 0.2) killTimes.shift();
    if (killTimes.length < 4 || killTimes.handled) return;
    let x = 0, z = 0;
    for (const k of killTimes) { x += k.x; z += k.z; }
    x /= killTimes.length; z /= killTimes.length;
    const y = groundAt(x, z) + 0.05;
    groundRing(x, y, z, 0.6, 4.2, { life: 0.5, width: 0.6, color: [1.2, 0.7, 2.0] });
    pillar(x, y, z, 0.4, 2.2, 3.5, { life: 0.4 });
    for (let i = 0; i < count(18); i++) particles.emit(STYLE.ember, x + rnd(-2, 2), y + rnd(0.2, 1.8), z + rnd(-2, 2), rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(0.8, 1.4), 0.14, 0.05, 1.4, 0.7, 2.4, 1);
    addTrauma(0.2);
    killTimes.length = 0;
  }

  // (round 9) `musou`: only musouFinisher's call sets this true. Its crack/scorch/burst decals and dust/colour
  // rings are otherwise identical to the plunge/heavy/bossSlam callers of this same function -- the difference is
  // purely which time base they age on (see writeItems), so those other callers' timing is untouched.
  function slam(x, z, { radius = 3, palette = 'violet', crack = true, debris = 10, musou = false } = {}) {
    const y = groundAt(x, z);
    const tint = palette === 'red' ? [2.2, 0.7, 0.35] : [1.3, 0.7, 2.2];
    if (crack) {
      const angle = rnd(0, Math.PI * 2);
      decal(x, y + 0.03, z, DECAL_CELLS.scorch, radius * 1.1, radius * 1.2, { life: 1.8, angle, color: [0.01, 0.0, 0.03], alpha: 0.9, mode: 1, fadeFrom: 0.6, musou });
      decal(x, y + 0.045, z, DECAL_CELLS.crack, radius * 1.15, radius * 1.25, { life: 1.6, angle, color: palette === 'red' ? [2.6, 1.0, 0.5] : [1.9, 1.3, 3.0], alpha: 1, mode: 0, fadeFrom: 0.35, musou });
    }
    decal(x, y + 0.06, z, DECAL_CELLS.burst, radius * 0.5, radius * 1.3, { life: 0.22, angle: rnd(0, 6.28), color: tint, alpha: 1, fadeFrom: 0.2, musou });
    groundRing(x, y + 0.08, z, 0.3, radius * 1.35, { life: 0.36, width: 0.55, color: tint, musou });
    groundRing(x, y + 0.05, z, 0.4, radius * 1.15, { life: 0.7, width: 1.1, row: STRIP_ROWS.dust, color: [0.5, 0.47, 0.6], alpha: 0.7, mode: 1, musou });
    particles.emit(STYLE.impact, x, y + 0.35, z, 0, 0, 0, 0.12, 1.4, 2.8, tint[0] * 1.2, tint[1] * 1.3, tint[2] * 1.1, 1, rnd(0, 6.28), 0);
    particles.emit(STYLE.flare, x, y + 0.4, z, 0, 0, 0, 0.14, 1.6, 3.0, 2.2, 1.9, 2.6, 0.8, 0, 0);
    for (let i = 0; i < count(debris); i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(1.5, 4.5);
      particles.emit(STYLE.rock, x + Math.cos(a) * 0.4, y + 0.1, z + Math.sin(a) * 0.4, Math.cos(a) * s, rnd(4, 8), Math.sin(a) * s,
        rnd(0.55, 0.8), rnd(0.07, 0.15), 0.07, 0.36, 0.33, 0.44, 1, rnd(0, 6.28));
    }
    for (let i = 0; i < count(12); i++) {
      const a = i / 12 * Math.PI * 2 + rnd(-0.2, 0.2), r = radius * rnd(0.35, 0.6), s = rnd(1.5, 3.2);
      particles.emit(STYLE.dust, x + Math.cos(a) * r, y + 0.25, z + Math.sin(a) * r, Math.cos(a) * s, rnd(0.2, 0.9), Math.sin(a) * s,
        rnd(0.7, 1.0), rnd(0.5, 0.8), rnd(1.4, 2.0), 0.46, 0.43, 0.56, 0.6, rnd(0, 6.28));
    }
  }

  function landingDust(x, z, strength) {
    const y = groundAt(x, z);
    const n = count(strength > 0.6 ? 7 : 4);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(0.8, 2.2) * (0.6 + strength);
      particles.emit(STYLE.dust, x + Math.cos(a) * 0.2, y + 0.15, z + Math.sin(a) * 0.2, Math.cos(a) * s, rnd(0.1, 0.5), Math.sin(a) * s,
        rnd(0.5, 0.8), 0.3 + 0.2 * strength, 0.9 + 0.6 * strength, 0.44, 0.41, 0.54, 0.5, rnd(0, 6.28));
    }
    if (strength > 0.6) groundRing(x, y + 0.04, z, 0.2, 1.4, { life: 0.45, width: 0.5, row: STRIP_ROWS.dust, color: [0.5, 0.47, 0.6], alpha: 0.55, mode: 1 });
  }

  // ---- swings ----
  const SWING_TILT = [0.05, -0.42, 0.38, 0.5, -0.2];
  const su = new THREE.Vector3(), sv = new THREE.Vector3(), sn = new THREE.Vector3(), camDir = new THREE.Vector3();
  /**
   * Swing plane from the real sword tip path (older tip -> latest tip around the chest). The plane is then turned
   * part-way toward the camera so a vertical swing is never seen edge-on (readability beats accuracy here).
   * Writes su (arc start direction), sv (in-plane direction of travel), sn (normal); returns the tip radius or 0.
   */
  function fitSwingPlane(c) {
    if (!blade || blade.count < 3) return 0;
    const now = blade.tip(0, tmp2);
    const old = blade.tip(Math.min(blade.count - 1, 5), tmp3);
    su.subVectors(old, c); sv.subVectors(now, c);
    const radius = sv.length();
    sn.crossVectors(su, sv);
    if (sn.lengthSq() < 1e-5 || su.lengthSq() < 0.04 || radius < 0.2) return 0;
    sn.normalize();
    camera.getWorldDirection(camDir);
    const facing = sn.dot(camDir);
    sn.addScaledVector(camDir, (facing >= 0 ? 1 : -1) * 0.4).normalize();
    su.addScaledVector(sn, -su.dot(sn)).normalize();
    sv.crossVectors(sn, su).normalize();
    return radius;
  }
  function onSwing(event, pos) {
    const f = heroForward(fwd, event.facing);
    heroChest(chest);
    const radius = (event.radius || 180) / 60;
    const comboStep = event.combo || 1;
    lastSwing.at = gameTime;
    if (event.kind === 'special') { musouSwing(event, pos, radius); return; }
    const finisher = event.kind === 'attack' && event.last && comboStep >= 5;
    const heavy = event.kind === 'heavy';
    const big = heavy || finisher;
    const c = tmp.copy(chest).addScaledVector(f, 0.15);
    let sweep, startAngle, r;
    const tipRadius = fitSwingPlane(c);
    if (tipRadius) {
      sweep = big ? 3.4 : 2.9; startAngle = -0.6;
      r = Math.max(tipRadius * 1.35, radius * 0.85);
      lastSwing.normal.copy(sn);
    } else {
      const tilt = (SWING_TILT[comboStep - 1] || 0) * (event.index % 2 ? -1 : 1);
      su.copy(f); sv.set(-f.z, 0, f.x);
      sn.crossVectors(su, sv);
      sv.applyAxisAngle(su, tilt); sn.applyAxisAngle(su, tilt);
      if (event.index % 2) sv.multiplyScalar(-1);
      lastSwing.normal.copy(sn);
      sweep = 2.6; startAngle = -1.3; r = radius * 0.7;
    }
    const scale = finisher ? 1.45 : heavy ? 1.35 : comboStep >= 4 ? 1.12 : 1;
    const heat = 1 + comboTier(combo.count) * 0.12;
    slashArc(c, su, sv, r * scale, {
      width: big ? 0.48 : 0.38, angle: startAngle, sweep, life: big ? 0.4 : 0.26,
      row: big ? STRIP_ROWS.heavy : event.index % 2 ? STRIP_ROWS.slash2 : STRIP_ROWS.slash,
      color: big ? [1.6 * heat, 1.3 * heat, 1.45 * heat] : [1.3 * heat, 1.08 * heat, 1.55 * heat], grow: 0.22,
    });
    if (big || comboStep >= 3) {
      slashArc(c, su, sv, r * scale * 0.8, { width: 0.22, angle: startAngle + 0.3, sweep: sweep * 0.8, life: 0.3, row: STRIP_ROWS.wind, color: [1.4, 1.2, 1.8], grow: 0.35 });
    }
    // spin moves (combo 4 / 5 are full-circle) -> horizontal wind ring around her
    if (comboStep >= 4 && event.kind === 'attack') {
      const ring = slashArc(tmp2.set(hero.position.x, hero.position.y + 0.75 + 0.2 * (event.index % 2), hero.position.z),
        tmp3.set(1, 0, 0), e1.set(0, 0, event.index % 2 ? -1 : 1), radius * 0.75, { width: 0.22, angle: rnd(0, 6.28), sweep: 4.4, life: 0.3, row: STRIP_ROWS.wind, color: [1.2, 1.0, 1.7], grow: 0.3 });
      ring.spin = event.index % 2 ? -5 : 5;
    }
    if (big) {
      const x = hero.position.x + f.x * 1.3, z = hero.position.z + f.z * 1.3;
      slam(x, z, { radius: heavy ? 2.4 : 2.8, debris: heavy ? 8 : 12 });
      slow.trigger(finisher ? 0.3 : 0.22, finisher ? 0.2 : 0.3, { ease: 0.14 });
      fovPunch(finisher ? -8 : -5, finisher ? 0.5 : 0.4);
      speedLines(finisher ? 0.5 : 0.32, 1);
      screenFlash(finisher ? 0.3 : 0.18, 0.14);
      addTrauma(finisher ? 0.55 : 0.4);
      haptic(finisher ? [25, 30, 50] : [30]);
    } else addTrauma(0.05);
  }

  // ---- musou special ----
  // Presentation of the beat sheet (see header). Two special shapes are supported:
  //  * long special: 'musouStart' (or 'special' carrying timeline / duration), ~10-12 'swing' kind 'special', then
  //    'musouFinish' at the impact. Wind-up 0.08 s freeze + push-in + title; flurry at 1.0x with a 0.04 s hit-stop per
  //    connecting swing and a slow camera drift (no shake); finisher lead-in 0.3x (0.15x 真), impact freeze 0.05 s,
  //    white flash, blast, push-in, ramp back.
  //  * the current 3-hit special ('special' without timeline): same wind-up, the third swing is the finisher.
  const MUSOU_TINT = { normal: [1.3, 0.7, 2.2], true: [1.9, 0.45, 1.9] };
  const MUSOU_TIMELINE = { normal: { windup: 0.55, finish: 3.6, end: 4.2 }, true: { windup: 0.55, finish: 4.3, end: 5.0 } };
  function readTimeline(event, isTrue) {
    const base = MUSOU_TIMELINE[isTrue ? 'true' : 'normal'];
    const t = event.timeline || {};
    const num = (...keys) => { for (const k of keys) if (Number.isFinite(t[k] ?? event[k])) return t[k] ?? event[k]; return undefined; };
    const end = num('end', 'duration') ?? base.end;
    const firstSwing = Array.isArray(event.swings) && Number.isFinite(event.swings[0]) ? event.swings[0] : undefined;
    return { windup: num('windup', 'flurryStart', 'swingStart') ?? firstSwing ?? base.windup, finish: num('finish', 'finishAt', 'impact') ?? Math.max(0.6, end - 0.6), end };
  }
  /** Piecewise-linear [[gameTime, scale], ...] (Arena MUSOU_FLURRY.timeScale format); equal times make a step. */
  function curveAt(keys, t) {
    if (!keys?.length) return 1;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t < t1) { const [t0, v0] = keys[i - 1]; return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v1; }
    }
    return keys[keys.length - 1][1];
  }
  function startMusou(pos, event = {}) {
    const isTrue = !!event.true;
    const longForm = event.type === 'musouStart' || !!event.timeline || Number.isFinite(event.duration);
    const authored = Array.isArray(event.timeScale) || Array.isArray(event.freezes) || !!event.flurry;
    if (musou.active && musou.t < 0.2) {
      musou.isTrue = musou.isTrue || isTrue;
      if (longForm || event.flurry) { musou.longForm = true; musou.timeline = readTimeline(event, musou.isTrue); }
      if (Array.isArray(event.timeScale)) musou.curve = event.timeScale;
      // Arena 先送 'special' 再送 'musouStart'：躍起時間與揮刀數只在後者，這裡要補進來
      if (Number.isFinite(event.leapAt)) musou.leapAt = event.leapAt;
      if (Array.isArray(event.swings)) musou.totalSwings = event.swings.length;
      if (authored && !musou.authored) { musou.authored = true; slow.cancel('musou'); }
      return;
    }
    Object.assign(musou, {
      active: true, t: 0, g: 0, swings: 0, endAt: Infinity, isTrue, finished: false, longForm: longForm || !!event.flurry, leadIn: false, impactT: -1, cutinT: 9,
      authored, curve: Array.isArray(event.timeScale) ? event.timeScale : null, hitstopSwing: -1,
      facing: Number.isFinite(event.facing) ? event.facing : undefined,
      totalSwings: Array.isArray(event.swings) ? event.swings.length : 10,
      leapAt: Number.isFinite(event.leapAt) ? event.leapAt : null,
      cut: null, cutT: 0, sessionKills: 0, koT: 9, koShown: -1, koGradeSet: false,
    });
    musou.timeline = readTimeline(event, isTrue);
    musou.center.copy(hero.position);
    spirit.phase = 'hidden'; spirit.t = 0; spirit.reveal = 0; spirit.angle = 0;
    spiritBlade.mesh.visible = false; flameShroud.mesh.visible = false;
    splitState.pending = false; splitState.active = false; splitOverlay.mesh.visible = false;
    shockState.active = false; shockwave.mesh.visible = false;
    // activation: hard freeze (unless the game authors it and sends 'musouFreeze')
    if (!authored) slow.play([[0.08, 0]], { ramp: 0.04, force: true, tag: 'musou' });
    screenFlash(isTrue ? 0.4 : 0.3, 0.16);
    haptic([60, 40, 60]);
    hudState.titleT = -0.08;
    hudFade.target = 0.12;
    trailState.auraPulse = 1;
    if (hud) setTitle(isTrue);
    const tint = MUSOU_TINT[isTrue ? 'true' : 'normal'];
    const y = groundAt(hero.position.x, hero.position.z) + 0.035;
    const rune = decal(hero.position.x, y, hero.position.z, DECAL_CELLS.rune, 0.5, isTrue ? 5.6 : 4.9, { life: 99, color: tint, alpha: 0.95, fadeFrom: 0.99, spin: isTrue ? -1.4 : 0.9 });
    rune.follow = true; rune.reveal = 0.3; rune.musou = true;
    for (let i = 0; i < count(isTrue ? 28 : 18); i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.2, 0.8);
      particles.emit(STYLE.flame, hero.position.x + Math.cos(a) * r, y + rnd(0, 0.6), hero.position.z + Math.sin(a) * r, 0, rnd(0.4, 1.6), 0,
        rnd(0.4, 0.75), rnd(0.35, isTrue ? 0.8 : 0.6), 0.15, tint[0] * 0.85, tint[1] * 0.75, tint[2], 1, rnd(-0.3, 0.3));
    }
  }
  function endMusou() {
    musou.active = false;
    cam.calm = false;
    hudFade.target = 1;
    for (const it of items) if (it.musou) { it.follow = false; it.life = it.age + 0.45; it.fadeFrom = 0; }
  }
  function musouSwing(event, pos, radius) {
    if (!musou.active) startMusou(pos, event);
    const x = hero.position.x, z = hero.position.z, y = groundAt(x, z);
    musou.swings++;
    musou.swingAt = realTime;
    // the third swing of the short special is its finisher; the long special waits for 'musouFinish'
    if (!musou.longForm && event.last && (event.index ?? 0) <= 2) { musouFinisher({ radius: (event.radius || 280) * 1.1, true: musou.isTrue }); return; }
    const tint = MUSOU_TINT[musou.isTrue ? 'true' : 'normal'];
    const flurry = musou.longForm || musou.swings > 3;
    const k = flurry ? 0.75 : 1;
    // 天刃: the swings named in event.sweeps sweep the spirit blade 360° around the arena (combat-fx side of the
    // effect; battle.js launches the enemies inside the radius using the same event since the sim stays 2D).
    if (musou.longForm && event.sweep) {
      spirit.phase = 'sweeping'; spirit.t = 0; spirit.angle = 0; spirit.sweepDur = 0.34;
      // (round 4) this ring used to sit safely outside CUT2's old, much farther-back camera; now that CUT2/leap sit
      // only ~3 m from the hero (item 3, round 3), a 6+ m elevated ring at chest height was being viewed from
      // beside/inside it -- a large, nearly edge-on flat annulus reads as a big hazy sheet with a hard straight
      // edge cutting across the frame. Sized down (and narrower) so it stays clear of the closer cameras.
      const sweepRadius = Math.max(radius * 1.1, 3.2);
      const sw = slashArc(tmp2.set(x, y + 1.1, z), tmp3.set(1, 0, 0), e1.set(0, 0, 1), sweepRadius,
        { width: 0.32, angle: 0, sweep: 6.5, life: 0.5, row: STRIP_ROWS.wind, color: [tint[0] * 1.35, tint[1] * 1.5, tint[2] * 1.25], grow: 0.06 });
      sw.reveal = spirit.sweepDur; sw.spin = 0;
      addTrauma(0.3);
    }
    groundRing(x, y + 0.06, z, 0.4, radius * (flurry ? 0.7 : 1.05), { life: 0.42, width: 0.7, color: [tint[0] * 1.15, tint[1] * 1.3, tint[2] * 1.1] });
    if (!flurry || musou.swings % 2) groundRing(x, y + 0.05, z, 0.3, radius * 0.7 * k, { life: 0.6, width: 1.2, row: STRIP_ROWS.dust, color: [0.5, 0.45, 0.62], alpha: 0.5, mode: 1 });
    for (let i = 0; i < count(flurry ? 5 : 8); i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(1.0, 2.6) * k;
      particles.emit(STYLE.wisp, x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, Math.cos(a) * 0.6, rnd(10, 16), Math.sin(a) * 0.6,
        rnd(0.25, 0.4), rnd(0.05, 0.09), 0.02, 1.2, 0.75, 2.2, 1);
    }
    const arcs = flurry ? 2 : 3;
    for (let i = 0; i < arcs; i++) {
      const it = slashArc(tmp2.set(x, y + 0.5 + i * 0.45 + rnd(-0.15, 0.15), z), tmp3.set(1, 0, 0), e1.set(0, 0, 1), radius * (0.5 + 0.12 * i) * (flurry ? 0.85 : 1),
        { width: 0.26, angle: rnd(0, 6.28), sweep: 4.8, life: 0.4, row: i === 1 ? STRIP_ROWS.slash : STRIP_ROWS.wind, color: [tint[0], tint[1] * 1.45, tint[2] * 0.85], grow: 0.35 });
      it.spin = ((musou.swings + i) % 2 ? -1 : 1) * 6;
    }
    particles.emit(STYLE.flare, x, y + 1.1, z, 0, 0, 0, 0.12, 1.2, 2.6 * k, 2.2, 1.8, 2.8, 0.6, 0, 0);
    for (let i = 0; i < count(flurry ? 12 : 22); i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(5, 11);
      particles.emit(STYLE.shard, x + Math.cos(a) * 0.6, y + rnd(0.5, 1.6), z + Math.sin(a) * 0.6, Math.cos(a) * sp, rnd(0.5, 4), Math.sin(a) * sp,
        rnd(0.4, 0.65), rnd(0.12, 0.22), 0.05, tint[0] * 0.8, tint[1] * 0.65, tint[2] * 0.95, 1);
    }
    if (!flurry) { addTrauma(0.4); fovPunch(-4, 0.3); screenFlash(0.15, 0.14); speedLines(0.25, 0.55); }
    else if (musou.swings % 3 === 0) speedLines(0.22, 0.45);
    haptic(flurry ? 12 : 30);
  }
  /** The biggest moment: freeze-frame, white radial flash, crater, two shock fronts, pillar, debris, push-in. */
  function musouFinisher(event) {
    const isTrue = !!event.true || musou.isTrue;
    if (!musou.active) startMusou(hero.position, event);
    const x = hero.position.x, z = hero.position.z, y = groundAt(x, z);
    const radius = (event.radius || (isTrue ? 400 : 320)) / 60;
    const tint = MUSOU_TINT[isTrue ? 'true' : 'normal'];
    musou.finished = true; musou.impactT = musou.t;
    slow.cancel('leadin');
    if (!musou.authored) {
      if (isTrue) slow.play([[0.05, 0], [0.5, 0.15]], { ramp: 0.3, force: true, tag: 'musou' });
      else slow.play([[0.05, 0], [0.3, 0.3]], { ramp: 0.3, force: true, tag: 'musou' });
    }
    // (round 9) musou:true on every finisher-spawned decal/ring below: they age on real time instead of the
    // slow-mo-biased fxDt (see writeItems), so a "1.6s life" actually takes ~1.6 real seconds instead of ballooning
    // to several seconds while the finisher's own slow-mo is active -- that mismatch was why the ground crack/dust
    // stayed on screen far longer than musouEnd + 1.5s ("something white stays" bug report, part 2).
    slam(x, z, { radius: radius * 0.4, debris: 18, palette: 'violet', musou: true });
    groundRing(x, y + 0.09, z, 0.5, radius * 1.1, { life: 0.6, width: 1.1, color: [tint[0] * 1.3, tint[1] * 1.5, tint[2] * 1.2], musou: true });
    groundRing(x, y + 0.07, z, 0.3, radius * 0.75, { life: 0.8, width: 0.6, color: [2.2, 2.0, 2.6], alpha: 0.8, musou: true });
    groundRing(x, y + 0.05, z, 0.5, radius * 0.95, { life: 0.9, width: 1.8, row: STRIP_ROWS.dust, color: [0.5, 0.45, 0.62], alpha: 0.7, mode: 1, musou: true });
    // (f) smaller, shaped pillar instead of a screen-tall column
    pillar(x, y, z, 0.12, 0.34, 2.6, { life: 0.28, color: [tint[0] * 1.15, tint[1] * 1.35, tint[2] * 1.05], alpha: 0.55, musou: true });
    for (let i = 0; i < count(16); i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(1.0, radius * 0.8);
      particles.emit(STYLE.wisp, x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, 0, rnd(12, 20), 0, rnd(0.3, 0.5), rnd(0.06, 0.1), 0.02, 1.3, 0.8, 2.3, 1);
    }
    for (let i = 0; i < count(44); i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(7, 15);
      particles.emit(STYLE.shard, x + Math.cos(a) * 0.6, y + rnd(0.4, 1.8), z + Math.sin(a) * 0.6, Math.cos(a) * sp, rnd(1, 6), Math.sin(a) * sp,
        rnd(0.5, 0.8), rnd(0.15, 0.28), 0.06, tint[0] * 0.8, tint[1] * 0.7, tint[2], 1);
    }
    // (真・無雙 no longer bursts atlas "flame" (petal-shaped) particles here -- the flameShroud shader mesh already
    // covers her ambient fire, and this burst's long life used to sit on screen for seconds under the finisher's
    // slow-mo, reading as stray pink teardrops in the 07/08 shots.)
    // lifetimes are game time: under the 0.3x / 0.15x finisher they already last 0.3-0.6 s on screen
    // (round 7) these two bursts' fixed world-space size read as a near-total screen whiteout at the close leap/
    // cut3 camera framing; scale size (and, with a floor, alpha) by camera distance so they keep roughly the same
    // on-screen coverage regardless of how close the finale's cuts have gotten. 7 m ~= the far camera distance
    // these sizes were originally tuned against.
    camera.getWorldPosition(tmp3);
    const burstScale = THREE.MathUtils.clamp(tmp3.distanceTo(tmp.set(x, y + 1.0, z)) / 10, 0.3, 1);
    particles.emit(STYLE.impact, x, y + 1.0, z, 0, 0, 0, 0.09, 1.6 * burstScale, 3.2 * burstScale, 2.4, 2.0, 2.8, Math.max(0.45, burstScale), rnd(0, 6.28), 0);
    particles.emit(STYLE.flare, x, y + 1.1, z, 0, 0, 0, 0.1, 1.8 * burstScale, 3.6 * burstScale, 2.2, 1.9, 2.8, 0.7 * Math.max(0.45, burstScale), 0, 0);
    cam.calm = false;
    fovPunch(-10, 0.6);
    speedLines(0.65, 1);
    // (f) short sharp flash instead of a whole-screen whiteout: high but brief, ≤ 0.08 s
    screenFlash(0.55, 0.07);
    addTrauma(0.7);
    haptic([40, 30, 90]);
    musou.endAt = musou.t + (isTrue ? 1.0 : 0.75);
    if (musou.longForm) {
      // 天刃 CUT 3: the vertical cleave freeze -> one framebuffer capture (done in cameraPost) -> sliding screen
      // split -> fade, plus a fake-distortion ground shockwave; both are pooled meshes, only toggled here.
      splitState.pending = true; splitState.t = 0;
      shockState.active = true; shockState.t = 0; shockState.x = x; shockState.y = y + 0.03; shockState.z = z;
      shockState.maxR = Math.max(3.5, radius * 1.2);
    }
  }
  function updateMusou(realDt, gameDt) {
    const g = cam.goal;
    if (!musou.active) {
      Object.assign(g, { orbit: 0, dolly: 1, lift: 0, look: 0, rate: 5 });
      overlay.shade = Math.max(0, overlay.shade - realDt * 2.2);
      // (round 8) updateSpirit() must still run here: it's the only place that force-hides the spirit blade/flame
      // shroud once musou stops being active. Without this call, whatever visible/opacity state they happened to
      // be in at the exact instant musou.active flipped false (see the re-grow bug fixed below -- it could be
      // mid-'cleaving' again, fully visible) froze forever, since this early return used to skip updateSpirit()
      // entirely from here on.
      updateSpirit(realDt, gameDt);
      return;
    }
    musou.t += realDt; musou.g += gameDt;
    const t = musou.t, tl = musou.timeline;
    const windup = musou.longForm ? tl.windup : 0.5;
    // wind-up: push in ~15 %, vignette ~20 %, glow; flurry: slow ~12 deg drift, no shake; after the impact: fast push-in
    if (musou.impactT >= 0) {
      const s = t - musou.impactT;
      Object.assign(g, s < 0.35 ? { dolly: 0.8, look: 0.9, rate: 18 } : { dolly: 1, look: 0, orbit: 0, lift: 0, rate: 4 });
      cam.calm = false;
    } else if (musou.g < windup) {
      Object.assign(g, { orbit: 0, dolly: 0.85, lift: 0.1, look: 0.75, rate: 9 });
    } else {
      const span = Math.max(0.5, (musou.longForm ? tl.finish : 2.0) - windup);
      const p = Math.min(1, (musou.g - windup) / span);
      Object.assign(g, { orbit: 0.22 * p, dolly: 0.88, lift: 0.1, look: 0.7, rate: 4 });
      cam.calm = musou.longForm;
      cam.trauma = cam.calm ? 0 : cam.trauma;
      // finisher lead-in: slow to 0.3x (0.15x 真) so ~0.3 s (0.5 s) of real time passes before the blast
      const lead = musou.isTrue ? 0.075 : 0.09;
      if (musou.longForm && !musou.authored && !musou.leadIn && musou.g >= tl.finish - lead) {
        musou.leadIn = true;
        slow.play([[0.8, musou.isTrue ? 0.15 : 0.3]], { ramp: 0.1, force: true, tag: 'leadin' });
        speedLines(0.8, 0.7);
      }
    }
    let shade = t < 0.1 ? t / 0.1 * 0.34 : musou.impactT >= 0 ? Math.max(0, 0.34 - (t - musou.impactT) * 0.6) : 0.34;
    // leap wind-down (3.3-3.6 s / 4.1-4.4 s): darken further while the world is at 0.3x and she leaps
    if (musou.longForm && musou.impactT < 0 && Number.isFinite(musou.leapAt) && musou.g >= musou.leapAt) {
      const leapP = Math.min(1, (musou.g - musou.leapAt) / Math.max(0.05, tl.finish - musou.leapAt));
      shade = Math.max(shade, 0.34 + 0.3 * leapP);
    }
    overlay.shade = shade;
    // hard camera cuts (天刃 long form only): CUT 1 low-angle title/blade-grow, CUT 2 high wide orbit (+leap),
    // CUT 3 behind/below for the cleave. cameraPre() reads musou.cut every frame; short-form musou never sets it.
    if (musou.longForm) {
      const cut = musou.impactT >= 0 ? 'cut3'
        : (Number.isFinite(musou.leapAt) && musou.g >= musou.leapAt) ? 'leap'
        : musou.g >= tl.windup ? 'cut2' : musou.t >= 0.08 ? 'cut1' : null;
      if (cut !== musou.cut) {
        musou.cut = cut; musou.cutT = 0; musou.cutSeed = rand();
        if (cut) fovPunch(cut === 'cut2' ? -3 : cut === 'leap' ? 4 : 6, 0.2);
        // (round 4) portrait cut-in moved from right-after-the-blast (where it covered her face during the cleave
        // frame) to the start of the leap: it plays out during the leap's own slow-mo, well clear of the cleave.
        if (cut === 'leap' && musou.isTrue && hud) musou.cutinT = -0.12;
      }
      else musou.cutT += realDt;
    } else musou.cut = null;
    if (heroAction !== 'special' && t > 0.8 && !Number.isFinite(musou.endAt) && !musou.longForm) musou.endAt = t + 0.3;
    if (musou.longForm && musou.g > tl.end + 0.4 && !Number.isFinite(musou.endAt)) musou.endAt = t;   // safety
    if (t > musou.endAt) { endMusou(); updateSpirit(realDt, gameDt); return; }
    // (8) normal musou only: a few atlas-particle flames licking up around her. 真・無雙's feet/body fire is the
    // flameShroud shader mesh instead (updateSpirit), so it never looks like the old "petal" particles.
    if (!musou.isTrue) {
      const tint = MUSOU_TINT.normal;
      if (rand() < realDt * 50) {
        const a = rnd(0, Math.PI * 2), r = rnd(0.15, 0.6), y = hero.position.y;
        particles.emit(STYLE.flame, hero.position.x + Math.cos(a) * r, y + rnd(0, 1.3), hero.position.z + Math.sin(a) * r, 0, rnd(1.2, 2.6), 0,
          rnd(0.25, 0.45), rnd(0.16, 0.32), 0.06, tint[0] * 0.8, tint[1] * 0.7, tint[2] * 0.95, 0.9, rnd(-0.25, 0.25));
      }
    }
    updateSpirit(realDt, gameDt);
  }
  /** Spirit blade + 真・無雙 flame shroud transform/reveal per phase (see the `spirit` state comment above). */
  function updateSpirit(realDt, gameDt) {
    if (!musou.active || !musou.longForm) {
      if (spirit.phase !== 'hidden') { spirit.phase = 'hidden'; spirit.reveal = 0; spiritBlade.mesh.visible = false; flameShroud.mesh.visible = false; }
      return;
    }
    const t = musou.g, isTrue = musou.isTrue;
    // (round 8) musou.impactT < 0 guards this: without it, once the blade finished a full cleave -> fade -> hidden
    // cycle *while still inside the post-impact recovery window* (musou.active hadn't flipped false yet), this
    // condition saw phase 'hidden' and musou.t >= 0.08 (always true by then) and restarted growing -- which the
    // impactT >= 0 block below immediately forced back into 'cleaving', over and over, until musou.active finally
    // went false mid-cycle with the meshes visible again -- frozen there forever by the bug fixed above.
    if (spirit.phase === 'hidden' && musou.impactT < 0 && musou.t >= 0.08) { spirit.phase = 'growing'; spirit.t = 0; spirit.seed = rand() * 100; }
    else if (spirit.phase === 'growing') {
      spirit.t += gameDt; spirit.reveal = Math.min(1, spirit.t / 0.4);
      if (spirit.reveal >= 1) spirit.phase = 'held';
    } else if (spirit.phase === 'sweeping') {
      spirit.t += realDt; spirit.angle += realDt * (Math.PI * 2 / spirit.sweepDur);
      if (spirit.t >= spirit.sweepDur) spirit.phase = 'held';
    }
    if (musou.impactT >= 0) {
      if (spirit.phase !== 'cleaving' && spirit.phase !== 'fading') { spirit.phase = 'cleaving'; spirit.t = 0; }
      if (spirit.phase === 'cleaving') { spirit.t += realDt; if (spirit.t > 0.28) { spirit.phase = 'fading'; spirit.t = 0; } }
      if (spirit.phase === 'fading') {
        spirit.t += realDt; spirit.reveal = Math.max(0, 1 - spirit.t / 0.5);
        if (spirit.reveal <= 0.01) { spirit.phase = 'hidden'; spiritBlade.mesh.visible = false; flameShroud.mesh.visible = false; return; }
      }
    }
    if (spirit.phase === 'hidden') return;
    const f = heroForward(fwd, musou.facing);
    const length = spirit.phase === 'sweeping' ? 7 : 6;
    if (spirit.phase === 'sweeping') {
      cutTmp.set(hero.position.x, hero.position.y + 1.1, hero.position.z);
      cutTmp2.set(Math.cos(spirit.angle), 0, Math.sin(spirit.angle));
      cutQuat.setFromUnitVectors(cutUp, cutTmp2);
    } else if (spirit.phase === 'cleaving' || spirit.phase === 'fading') {
      const p = Math.min(1, spirit.t / 0.28);
      cutTmp.set(hero.position.x, hero.position.y + 1.4 + 6.5 * (1 - easeOut(p)), hero.position.z);
      cutQuat.setFromUnitVectors(cutUp, cutDown);
    } else {
      cutTmp.set(hero.position.x + f.x * 0.18, hero.position.y + 1.1, hero.position.z + f.z * 0.18);
      cutTmp2.set(f.x * 0.32, 0.94, f.z * 0.32).normalize();
      cutQuat.setFromUnitVectors(cutUp, cutTmp2);
    }
    spiritBlade.mesh.visible = true;
    spiritBlade.mesh.position.copy(cutTmp);
    spiritBlade.mesh.quaternion.copy(cutQuat);
    spiritBlade.mesh.scale.set(BLADE_WIDTH, length, BLADE_WIDTH);
    spiritBlade.mesh.updateMatrixWorld(true);
    spiritBlade.material.uniforms.uTime.value = realTime;
    spiritBlade.material.uniforms.uReveal.value = spirit.reveal;
    spiritBlade.material.uniforms.uOpacity.value = 1;   // was never set before -- the blade was fully transparent
    const tint = MUSOU_TINT[isTrue ? 'true' : 'normal'];
    spiritBlade.material.uniforms.uColor.value.setRGB(tint[0] * 0.85, tint[1] * 0.7, tint[2]);
    if (isTrue) {
      // (8) same mesh/material as the blade wrap: the geometry also carries a ground/body flame ring (aBlade=0,
      // transformed by the mesh's own hero-anchored matrix) alongside the blade-wrap quads (aBlade=1, transformed
      // by uBladeMatrix, fed from the spirit blade's own matrix above) -- one draw call for both.
      flameShroud.mesh.visible = true;
      flameShroud.mesh.position.set(hero.position.x, hero.position.y, hero.position.z);
      flameShroud.mesh.quaternion.identity();
      flameShroud.mesh.scale.set(1, 1, 1);
      flameShroud.material.uniforms.uBladeMatrix.value.copy(spiritBlade.mesh.matrixWorld);
      flameShroud.material.uniforms.uTime.value = realTime;
      flameShroud.material.uniforms.uSeed.value = spirit.seed;
      flameShroud.material.uniforms.uOpacity.value = spirit.reveal * 0.9;
    } else if (flameShroud.mesh.visible) flameShroud.mesh.visible = false;
  }
  /** Post-cleave screen split (framebuffer already captured in cameraPost) and the ground shockwave ring. */
  function updateSplitShock(realDt) {
    if (splitState.active) {
      // canvas resized mid-split (e.g. an orientation change) -- the framebuffer was captured at the old
      // size/aspect, so it would render as a stretched/misaligned mess at the new one; end the effect right away
      // instead of showing that for the rest of its (brief) duration.
      const cw = renderer?.domElement?.width || 0, ch = renderer?.domElement?.height || 0;
      const resized = (cw && cw !== splitOverlay.texW) || (ch && ch !== splitOverlay.texH);
      splitState.t += realDt;
      const p = splitState.t / splitState.dur;
      if (resized || p >= 1 || !splitOverlay.texture) { splitState.active = false; splitOverlay.mesh.visible = false; }
      else {
        splitOverlay.mesh.visible = true;
        splitOverlay.material.uniforms.uSep.value = 0.035 + 0.11 * easeOut(Math.min(1, p / 0.6));
        splitOverlay.material.uniforms.uAlpha.value = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
      }
    }
    if (shockState.active) {
      shockState.t += realDt;
      const p = shockState.t / shockState.dur;
      if (p >= 1) { shockState.active = false; shockwave.mesh.visible = false; }
      else {
        shockwave.mesh.visible = true;
        shockwave.mesh.position.set(shockState.x, shockState.y, shockState.z);
        shockwave.material.uniforms.uRadius.value = shockState.maxR * easeOut(p);
        shockwave.material.uniforms.uWidth.value = Math.max(0.4, shockState.maxR * 0.35 * (1 - p * 0.6));
        shockwave.material.uniforms.uOpacity.value = 1 - smooth01((p - 0.55) / 0.45);
      }
    }
  }
  function updateOfficerCam(realDt) {
    if (officerCam.t >= officerCam.dur + 0.15) return;
    officerCam.t += realDt;
    if (musou.active) return;
    const g = cam.goal;
    if (officerCam.t < officerCam.dur) Object.assign(g, { dolly: 0.8, look: 0.65, orbit: 0, lift: 0, rate: 10 });
    else Object.assign(g, { dolly: 1, look: 0, orbit: 0, lift: 0, rate: 12 });
    cam.pivotOnHero = officerCam.t >= officerCam.dur;
    if (!cam.pivotOnHero) cam.pivot.copy(officerCam.point);
  }

  // ---- jump / air moves ----
  function onJump() {
    landingDust(hero.position.x, hero.position.z, 0.35);
    groundRing(hero.position.x, groundAt(hero.position.x, hero.position.z) + 0.05, hero.position.z, 0.2, 1.3, { life: 0.35, width: 0.4, row: STRIP_ROWS.wind, color: [1.0, 0.9, 1.4], alpha: 0.8 });
    echoes.snapshot(0.6, 0.22);
  }
  function onAirSlash(event) {
    const f = heroForward(fwd, event.facing);
    heroChest(chest);
    const c = tmp.copy(chest).addScaledVector(f, 0.2);
    const radius = (event.radius || 150) / 60;
    const tipRadius = fitSwingPlane(c);
    if (!tipRadius) { su.copy(f); sv.set(0, -1, 0); sn.crossVectors(su, sv); }
    lastSwing.normal.copy(sn); lastSwing.at = gameTime;
    slashArc(c, su, sv, Math.max(tipRadius * 1.35, radius * 0.8), { width: 0.4, angle: -0.6, sweep: 3.0, life: 0.28, row: STRIP_ROWS.slash, color: [1.35, 1.1, 1.6], grow: 0.25 });
    slashArc(c, su, sv, Math.max(tipRadius * 1.1, radius * 0.65), { width: 0.2, angle: -0.3, sweep: 2.4, life: 0.26, row: STRIP_ROWS.wind, color: [1.3, 1.1, 1.8], grow: 0.35 });
    addTrauma(0.08);
  }
  function onPlunge() {
    move.kind = 'plunge'; move.startedAt = gameTime; move.echo = true; move.lastEcho = -10;
    speedLines(0.35, 0.8);
    fovPunch(-3, 0.35);
    addTrauma(0.1);
  }
  function onLand(event) {
    const plunged = event.radius > 0 || event.plunge || move.kind === 'plunge' && gameTime - move.startedAt < 2.5;
    if (!plunged) { landingDust(hero.position.x, hero.position.z, 0.45); return; }
    move.kind = ''; move.echo = false;
    const radius = (event.radius || 190) / 60;
    slam(hero.position.x, hero.position.z, { radius: radius * 0.85, debris: 12 });
    groundRing(hero.position.x, groundAt(hero.position.x, hero.position.z) + 0.09, hero.position.z, 0.4, radius * 1.1, { life: 0.45, width: 0.7, color: [1.4, 0.9, 2.3] });
    slow.trigger(0.2, 0.3, { ease: 0.12 });
    fovPunch(-6, 0.45);
    speedLines(0.3, 0.8);
    screenFlash(0.2, 0.12);
    addTrauma(0.5);
    haptic([30, 20, 40]);
  }
  function plungeStreaks() {
    // while diving: bright streaks left behind above her so the fall reads as fast
    const x = hero.position.x, y = hero.position.y, z = hero.position.z;
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.2, 0.7);
      particles.emit(STYLE.wisp, x + Math.cos(a) * r, y + rnd(0.6, 1.8), z + Math.sin(a) * r, 0, 9, 0, 0.14, 0.05, 0.02, 1.2, 0.9, 2.0, 0.9);
    }
  }

  // ---- HUD ----
  function damageNumber(at, value, kind) {
    if (!hud || !Number.isFinite(value)) return;
    const d = hud.damage[hud.damageRing.next()];
    d.x = at.x + rnd(-0.25, 0.25); d.y = at.y + 0.5 + rnd(0, 0.3); d.z = at.z + rnd(-0.25, 0.25);
    d.age = 0; d.life = kind ? 0.85 : 0.6; d.kind = kind;
    // (c) ~2x bigger during musou, and heavy/special ones get a punchier pop + a brief shake
    const musouTag = musou.active ? ' musou' : '';
    d.punchy = musou.active && (kind === 'h' || kind === 's');
    d.node.className = `cfx-dmg${kind ? ` ${kind}` : ''}${musouTag}`;
    d.node.textContent = String(Math.max(1, Math.round(value)));
    show(d.node, true);
  }
  function stamp(at) {
    const s = hud.stamps[hud.stampRing.next()];
    s.x = at.x; s.y = at.y + 0.9; s.z = at.z; s.age = 0; s.rot = rnd(-16, -6);
    show(s.node, true);
  }
  function setTitle(isTrue) {
    const el = hud.el;
    const text = isTrue ? '真・無雙' : '天刃亂舞';
    if (el.titleText.dataset.text !== text) {
      el.titleText.dataset.text = text;
      el.titleText.innerHTML = [...text].map(ch => `<span${ch === '・' ? ' class="dot"' : ''}>${ch}</span>`).join('');
      el.titleChars = [...el.titleText.children];
    }
    el.title.classList.toggle('true', isTrue);
    el.titleSub.textContent = isTrue ? 'TRUE HEAVEN BLADE RAMPAGE' : 'HEAVEN BLADE RAMPAGE';
  }
  function banner(text, sub) {
    hud.el.bannerText.textContent = text;
    hud.el.bannerSub.textContent = sub;
    hudState.bannerT = 0;
  }
  const projected = new THREE.Vector3();
  function toScreen(x, y, z, width, height) {
    projected.set(x, y, z).project(camera);
    return projected.z < 1 ? { x: (projected.x * 0.5 + 0.5) * width, y: (0.5 - projected.y * 0.5) * height } : null;
  }
  function updateHud(realDt) {
    if (!hud) return;
    const el = hud.el;
    const width = hudSize.w, height = hudSize.h;
    // combo counter
    const n = combo.count;
    const visible = n >= 2;
    hudState.fade = visible ? Math.min(1, hudState.fade + realDt * 12) : Math.max(0, hudState.fade - realDt * 3);
    show(el.combo, hudState.fade > 0);
    if (hudState.fade > 0) {
      if (visible && n !== hudState.comboShown) { el.comboNum.textContent = String(n); hudState.comboShown = n; }
      const tier = comboTier(hudState.comboShown);
      if (tier !== hudState.tier) { el.combo.className = `cfx-combo t${tier}`; hudState.tier = tier; }
      hudState.pulse += realDt;
      const p = Math.max(0, 1 - hudState.pulse / 0.16);
      const scale = 1 + hudState.pulseAmp * p * p;
      el.combo.style.transform = `translateX(${(1 - hudState.fade) * 40}px) scale(${scale.toFixed(3)}) rotate(${(-3 * p).toFixed(2)}deg)`;
      el.combo.style.opacity = hudState.fade.toFixed(3);
      el.comboBar.style.transform = `scaleX(${combo.remaining(gameTime).toFixed(3)})`;
      if (tier === 4) { hudState.hue = (hudState.hue + realDt * 240) % 360; el.comboNum.style.filter = `hue-rotate(${hudState.hue.toFixed(0)}deg) drop-shadow(0 0 18px rgba(255,255,255,.8))`; }
      else if (el.comboNum.style.filter) el.comboNum.style.filter = '';
    }
    // damage numbers
    for (const d of hud.damage) {
      if (d.age >= d.life) { if (d.node.style.display !== 'none') show(d.node, false); continue; }
      d.age += realDt;
      const t = d.age / d.life;
      const s = toScreen(d.x, d.y + t * 0.55, d.z, width, height);
      if (!s) { show(d.node, false); continue; }
      const pop = d.age < 0.08 ? (d.punchy ? 2.1 : 1.7) - d.age / 0.08 * (d.punchy ? 1.0 : 0.7) : 1;
      const shakeAmp = d.punchy ? Math.max(0, 1 - d.age / 0.14) * 3.2 : 0;
      const jitterX = shakeAmp ? Math.sin(realTime * 90 + d.x * 17) * shakeAmp : 0;
      d.node.style.transform = `translate3d(${(s.x + jitterX).toFixed(1)}px,${s.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(3)})`;
      d.node.style.opacity = (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3).toFixed(3);
    }
    // 破 stamps
    for (const s of hud.stamps) {
      if (s.age >= s.life) { if (s.node.style.display !== 'none') show(s.node, false); continue; }
      s.age += realDt;
      const p = toScreen(s.x, s.y, s.z, width, height);
      if (!p) continue;
      const slam = s.age < 0.09 ? 2.8 - s.age / 0.09 * 1.8 : 1 + Math.max(0, 0.08 - (s.age - 0.09)) * 1.5;
      const x = Math.min(width - 70, Math.max(70, p.x)), y = Math.min(height - 70, Math.max(70, p.y));
      s.node.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${slam.toFixed(3)}) rotate(${s.rot.toFixed(1)}deg)`;
      s.node.style.opacity = (s.age < 0.05 ? s.age / 0.05 : s.age > s.life - 0.25 ? (s.life - s.age) / 0.25 : 1).toFixed(3);
    }
    // KO / officer banner
    if (hudState.bannerT < 2) {
      hudState.bannerT += realDt;
      const t = hudState.bannerT;
      const inT = easeOut(t / 0.22), out = t > 1.6 ? (t - 1.6) / 0.35 : 0;
      show(el.banner, out < 1);
      el.banner.style.transform = `translateX(${((1 - inT) * -110 + out * -30).toFixed(1)}%)`;
      el.banner.style.opacity = (1 - out).toFixed(3);
    } else show(el.banner, false);
    // musou title
    if (hudState.titleT < 1.2) {
      hudState.titleT += realDt;
      const t = hudState.titleT;
      const out = t > 0.72 ? Math.min(1, (t - 0.72) / 0.2) : 0;
      show(el.title, out < 1);
      el.titleBand.style.transform = `scaleX(${easeOut((t - 0.04) / 0.16).toFixed(3)})`;
      el.title.style.opacity = (1 - out).toFixed(3);
      el.title.style.transform = `translateY(${(-out * 16).toFixed(1)}px)`;
      el.titleChars.forEach((span, i) => {
        const local = t - 0.1 - i * 0.06;
        const k = Math.min(1, Math.max(0, local / 0.1));
        span.style.opacity = k.toFixed(3);
        span.style.transform = `scale(${(2.4 - 1.4 * easeOut(k)).toFixed(3)}) translateY(${((1 - k) * -10).toFixed(1)}px)`;
      });
      el.titleSub.style.opacity = Math.min(1, Math.max(0, (t - 0.4) / 0.2)).toFixed(3);
    } else show(el.title, false);
    // 真・無雙 colour grade and the 0.4 s portrait cut-in card
    const grade = musou.active && musou.isTrue ? Math.min(1, musou.t / 0.2) * (musou.impactT >= 0 ? Math.max(0, 1 - (musou.t - musou.impactT) / 0.9) : 1) : 0;
    show(el.grade, grade > 0.01);
    if (grade > 0.01) el.grade.style.opacity = grade.toFixed(3);
    // (mix-blend-mode cannot reach the WebGL canvas through the HUD's stacking context, so the contrast/saturation
    // part of the 真 grade is a CSS filter on the canvas itself, only while it is active)
    const canvasEl = renderer?.domElement;
    if (canvasEl?.style && Math.abs(grade - (hudState.gradeApplied ?? 0)) > 0.02) {
      hudState.gradeApplied = grade;
      canvasEl.style.filter = grade > 0.02 ? `contrast(${(1 + 0.2 * grade).toFixed(3)}) saturate(${(1 + 0.4 * grade).toFixed(3)})` : '';
    }
    if (musou.cutinT < 0.4) {
      musou.cutinT += realDt;
      const c = musou.cutinT;
      show(el.cutin, c >= 0 && c < 0.4);
      if (c >= 0) {
        const x = c < 0.08 ? (1 - c / 0.08) * 110 : c > 0.32 ? -(c - 0.32) / 0.08 * 110 : 0;
        el.cutinCard.style.transform = `translateX(${x.toFixed(1)}%) skewY(-4deg)`;
      }
    } else if (el.cutin.style.display !== 'none') show(el.cutin, false);
    // (d) big centred "NN KO" counter + 撃/斬/破/天 grade stamp, shown from the impact to the end of the musou
    if (musou.active && musou.impactT >= 0) {
      const s = musou.t - musou.impactT;
      const revealDelay = 0.1, countDur = 0.28, holdFor = 0.62;   // fits inside musouFinisher's 0.75 s (真 1.0 s) recovery window
      show(el.ko, s < holdFor);
      if (s < holdFor) {
        const p = Math.min(1, Math.max(0, (s - revealDelay) / countDur));
        const shown = Math.round(easeOut(p) * musou.sessionKills);
        if (shown !== musou.koShown) { musou.koShown = shown; el.koNum.textContent = String(shown); }
        const inT = Math.min(1, Math.max(0, (s - revealDelay) / 0.08));
        el.ko.style.opacity = inT.toFixed(3);
        el.ko.style.transform = `translate(0,0) scale(${(1 + Math.max(0, 1 - (s - revealDelay) / 0.16) * 0.35).toFixed(3)})`;
        const gradeT = s - (revealDelay + countDur);
        if (gradeT > 0) {
          if (!musou.koGradeSet) { musou.koGradeSet = true; el.koGrade.textContent = koGrade(musou.sessionKills); }
          const gp = Math.min(1, gradeT / 0.18);
          el.koGrade.style.opacity = gp.toFixed(3);
          el.koGrade.style.transform = `translateX(-50%) scale(${(1.6 - 0.6 * easeOut(gp)).toFixed(3)})`;
        } else el.koGrade.style.opacity = 0;
      }
    } else { show(el.ko, false); musou.koShown = -1; musou.koGradeSet = false; }
    // full-screen overlays
    overlay.linesT += realDt / overlay.linesDur;
    const lines = overlay.linesT < 1 ? overlay.lines * (overlay.linesT < 0.15 ? overlay.linesT / 0.15 : 1 - smooth01((overlay.linesT - 0.4) / 0.6)) : 0;
    show(el.lines, lines > 0.01);
    if (lines > 0.01) {
      el.lines.style.opacity = (lines * 0.8).toFixed(3);
      el.lines.style.transform = `rotate(${(rand() * 360).toFixed(0)}deg) scale(${(1 + rand() * 0.06).toFixed(3)})`;
    }
    overlay.flashT += realDt / overlay.flashDur;
    const flash = overlay.flashT < 1 ? overlay.flash * (1 - overlay.flashT) : 0;
    show(el.flash, flash > 0.01);
    if (flash > 0.01) el.flash.style.opacity = flash.toFixed(3);
    show(el.shade, overlay.shade > 0.01);
    if (overlay.shade > 0.01) el.shade.style.opacity = overlay.shade.toFixed(3);
    overlay.hurt = Math.max(0, overlay.hurt - realDt * 2.5);
    show(el.hurt, overlay.hurt > 0.01);
    if (overlay.hurt > 0.01) el.hurt.style.opacity = overlay.hurt.toFixed(3);
  }

  // ---- strip items -> batch ----
  function writeItems(dt, realDt) {
    strips.begin();
    // trail first so it survives a full batch
    if (blade && trailState.visible) writeTrail();
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      // (round 9) musou-flagged items (the finisher's crack/scorch/burst/rings/pillar, and the rune circle) age on
      // real time, not `dt` (which is floored at 20% during the finisher's own slow-mo) -- otherwise a nominal
      // "1.6s life" decal can take several real seconds to actually disappear.
      it.age += it.musou ? realDt : dt;
      if (it.age >= it.life) { itemPool.push(it); items.splice(i, 1); }
    }
    for (const it of items) {
      if (!strips.open()) break;
      const t = it.age / it.life;
      const fade = 1 - smooth01((t - it.fadeFrom) / (1 - it.fadeFrom));
      const alpha = it.alpha * fade;
      if (it.type === 'arc') {
        const head = Math.min(1, it.age / it.reveal);
        const tail = smooth01((t - 0.3) / 0.7) * 0.95;
        const r = it.r0 + (it.r1 - it.r0) * easeOut(t);
        const spin = it.spin * it.age;
        const cols = strips.cols;
        for (let j = 0; j < cols; j++) {
          const s = j / (cols - 1);
          const u = tail + (head - tail) * s;
          const ang = it.angle + spin + it.sweep * u;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          const dx = it.a.x * cs + it.b.x * sn, dy = it.a.y * cs + it.b.y * sn, dz = it.a.z * cs + it.b.z * sn;
          const w = it.w * r * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.92 + 0.04)), 0.55) * (0.45 + 0.55 * s);
          const ri = r - w;
          strips.put(it.c.x + dx * ri, it.c.y + dy * ri, it.c.z + dz * ri, it.c.x + dx * r, it.c.y + dy * r, it.c.z + dz * r,
            stripU(s), stripV(it.row, 0), stripU(s), stripV(it.row, 1), it.r, it.g, it.bl, alpha, it.mode);
        }
      } else if (it.type === 'ring' || it.type === 'cyl') {
        const r = it.r0 + (it.r1 - it.r0) * easeOut(t);
        const cols = strips.cols;
        for (let j = 0; j < cols; j++) {
          const s = j / (cols - 1);
          const ang = s * Math.PI * 2;
          const cs = Math.cos(ang), sn = Math.sin(ang);
          if (it.type === 'ring') {
            const ri = Math.max(0, r - it.w * (1 - t * 0.5));
            strips.put(it.c.x + cs * ri, it.c.y, it.c.z + sn * ri, it.c.x + cs * r, it.c.y, it.c.z + sn * r,
              stripU(s), stripV(it.row, 0), stripU(s), stripV(it.row, 1), it.r, it.g, it.bl, alpha, it.mode);
          } else {
            const h = it.height * (0.6 + 0.4 * easeOut(t / 0.4));
            strips.put(it.c.x + cs * r, it.c.y, it.c.z + sn * r, it.c.x + cs * r * 1.18, it.c.y + h, it.c.z + sn * r * 1.18,
              stripU(s), stripV(it.row, 0), stripU(s), stripV(it.row, 1), it.r, it.g, it.bl, alpha, it.mode);
          }
        }
      } else if (it.type === 'quad') {
        if (it.follow) { it.c.x = hero.position.x; it.c.z = hero.position.z; }
        const size = it.r0 + (it.r1 - it.r0) * easeOut(it.reveal ? it.age / it.reveal : t);
        const ang = it.angle + it.spin * it.age;
        const cs = Math.cos(ang) * size * 0.5, sn = Math.sin(ang) * size * 0.5;
        // corners: (-1,-1) (1,-1) / (-1,1) (1,1) in local (u, v)
        const cx = it.c.x, cy = it.c.y, cz = it.c.z;
        strips.put(cx - cs + sn, cy, cz - sn - cs, cx - cs - sn, cy, cz - sn + cs,
          decalU(it.row, 0), decalV(it.row, 0), decalU(it.row, 0), decalV(it.row, 1), it.r, it.g, it.bl, alpha, it.mode);
        strips.put(cx + cs + sn, cy, cz + sn - cs, cx + cs - sn, cy, cz + sn + cs,
          decalU(it.row, 1), decalV(it.row, 0), decalU(it.row, 1), decalV(it.row, 1), it.r, it.g, it.bl, alpha, it.mode);
      }
      strips.close();
    }
    strips.end();
  }

  // ---- blade trail ----
  const trailState = { visible: false, life: 0.15, heat: 1 };
  function writeTrail() {
    const n = blade.count;
    if (n < 2 || !strips.open()) return;
    const d = blade.data;
    const cols = strips.cols;
    const segments = n - 1;
    const sub = Math.max(1, Math.min(q.trailSubdiv, Math.floor((cols - 1) / segments)));
    const total = Math.min(cols, segments * sub + 1);
    const firstSeg = Math.max(0, segments - Math.floor((total - 1) / sub));
    const now = gameTime;
    const heat = trailState.heat;
    const pick = (i, k) => d[blade.get(Math.max(0, Math.min(n - 1, i))) + k];
    for (let j = 0; j < total; j++) {
      const global = firstSeg * sub + j;
      const seg = Math.min(segments - 1, Math.floor(global / sub));
      const f = global / sub - seg;
      const i1 = seg, i2 = seg + 1;
      const v = [0, 0, 0, 0, 0, 0];
      for (let k = 0; k < 6; k++) v[k] = cr(pick(i1 - 1, k), pick(i1, k), pick(i2, k), pick(i2 + 1, k), f);
      const time = pick(i1, 6) + (pick(i2, 6) - pick(i1, 6)) * f;
      const ageU = 1 - Math.min(1, (now - time) / trailState.life);   // 1 = newest
      strips.put(v[0], v[1], v[2], v[3], v[4], v[5], stripU(ageU), stripV(STRIP_ROWS.trail, 0), stripU(ageU), stripV(STRIP_ROWS.trail, 1),
        1.15 * heat, 1.0 * heat, 1.35 * heat, 1, 0);
    }
    strips.close();
  }

  // ---- per-frame tip glow / sword emissive ----
  const swordGlow = new THREE.Color();
  function updateBlade(gameDt, attacking) {
    if (!blade) return;
    const tier = comboTier(combo.count);
    const heavyMove = move.kind === 'heavy' || move.kind === 'special' || move.combo >= 4;
    trailState.life = move.kind === 'special' ? 0.24 : heavyMove ? 0.2 : 0.15;
    trailState.heat = 1 + tier * 0.14 + (heavyMove ? 0.15 : 0);
    if (attacking) blade.sample(gameTime);
    blade.expire(gameTime, trailState.life);
    trailState.visible = blade.count >= 2;
    if (attacking && blade.count && tier >= 1 && gameDt > 0) {
      const tip = blade.tip(0, tmp);
      particles.emit(STYLE.glow, tip.x, tip.y, tip.z, 0, 0, 0, 0.09, 0.35 + tier * 0.1, 0.2, 1.0, 0.55, 1.9, 0.8);
      if (tier >= 3 && rand() < 0.5) particles.emit(STYLE.ember, tip.x, tip.y, tip.z, rnd(-0.6, 0.6), rnd(0, 1), rnd(-0.6, 0.6), 0.5, 0.1, 0.03, 1.4, 0.7, 2.2, 1);
    }
    if (swordMaterial) {
      const base = [0, 0.35, 0.7, 1.1, 1.6][tier];
      const target = base + (attacking ? 0.35 : 0) + (musou.active ? 1.2 : 0);
      swordMaterial.userData.glow = (swordMaterial.userData.glow || 0) + (target - (swordMaterial.userData.glow || 0)) * Math.min(1, gameDt * 10 + 0.02);
      const g = swordMaterial.userData.glow;
      swordMaterial.emissive.copy(swordGlow.setRGB(0.45 * g, 0.18 * g, 1.0 * g));
    }
  }

  // ---- public API ----
  function onEvent(event, worldPos, target) {
    if (!event) return;
    const pos = worldPos || hero.position;
    switch (event.type) {
      case 'slash':
        move.kind = event.kind; move.combo = event.combo || 1; move.startedAt = gameTime;
        move.echo = event.kind === 'heavy' || (event.combo || 1) >= 4;
        if (move.echo) move.lastEcho = -10;
        break;
      case 'swing': onSwing(event, pos); break;
      case 'hit': onHit(event, pos, target); break;
      case 'guard': onGuard(event, pos, target); break;
      case 'guardBreak': onGuardBreak(event, pos, target); break;
      case 'kill': onKill(event, pos, target); break;
      case 'special':
        move.kind = 'special'; move.combo = 0; move.startedAt = gameTime; move.echo = true;
        startMusou(pos, event);
        break;
      case 'musouStart': move.kind = 'special'; move.combo = 0; move.startedAt = gameTime; move.echo = true; startMusou(pos, event); break;
      case 'musouFinish': musouFinisher(event); break;
      case 'hitstop': {
        // Hit-stop is presentation time: battle.js drops its own hitstopUntil and multiplies dt by timeScale().
        // During the musou flurry only the first connecting hit of each swing stops the world; the 天刃 schedule
        // is data-driven (swingHitstop): it starts longer and shortens toward the last swing (accelerating rhythm).
        if (musou.active && musou.longForm && !musou.finished) {
          if (musou.hitstopSwing !== musou.swings) {
            musou.hitstopSwing = musou.swings;
            slow.play([[swingHitstop(musou.swings - 1, musou.totalSwings), 0.05]], { ramp: 0, tag: 'hitstop' });
          }
        } else if (!musou.active) slow.play([[(event.duration || 0.035) * 2, 0.06]], { ramp: 0, tag: 'hitstop' });
        break;
      }
      case 'musouFreeze': slow.play([[event.real || 0.05, 0]], { ramp: 0, force: true, tag: 'freeze' }); break;
      case 'musouEnd': if (musou.active) musou.endAt = Math.min(musou.endAt, musou.t + 0.35); break;
      case 'officer': case 'bossIntro': if (event.enemyId !== undefined && event.name) names.set(event.enemyId, event.name); break;
      case 'bossDown':
      case 'officerDown': {
        if (event.enemyId !== undefined && event.name) names.set(event.enemyId, event.name);
        const at = hitCentre(target, pos, tmp);
        officerDown({ role: event.type === 'bossDown' ? 'boss' : 'officer', ...event }, pos, at);
        break;
      }
      case 'jump': onJump(event); break;
      case 'airSlash': onAirSlash(event); break;
      case 'plunge': onPlunge(event); break;
      case 'land': onLand(event); break;
      case 'dodge':
        move.kind = 'dodge'; move.startedAt = gameTime;
        echoes.snapshot(0.8, 0.3);
        landingDust(hero.position.x, hero.position.z, 0.3);
        break;
      case 'sidestep': landingDust(pos.x, pos.z, 0.2); break;
      case 'knockback':
        if (event.source !== 'attack') particles.emit(STYLE.dust, pos.x, groundAt(pos.x, pos.z) + 0.2, pos.z, 0, 0.3, 0, 0.6, 0.4, 1.2, 0.44, 0.41, 0.54, 0.45, rnd(0, 6.28));
        break;
      case 'hurt':
        combo.reset(); hudState.comboShown = -1;
        overlay.hurt = 0.9; addTrauma(0.3); haptic(40);
        break;
      case 'bossSlam': slam(pos.x, pos.z, { radius: (event.radius || 180) / 60 * 0.8, palette: 'red', debris: 14 }); addTrauma(0.6); haptic([40, 30, 40]); break;
      case 'bossSweep': {
        const y = groundAt(pos.x, pos.z) + 0.9, r = (event.radius || 216) / 60;
        const it = slashArc(tmp.set(pos.x, y, pos.z), tmp2.set(1, 0, 0), tmp3.set(0, 0, 1), r * 0.8, { width: 0.3, angle: rnd(0, 6.28), sweep: 5.2, life: 0.4, row: STRIP_ROWS.heavy, color: [2.2, 0.7, 0.5], grow: 0.2 });
        it.spin = 6; addTrauma(0.35);
        break;
      }
      case 'roar': {
        const y = groundAt(pos.x, pos.z) + 0.05;
        groundRing(pos.x, y, pos.z, 0.5, 7, { life: 0.8, width: 0.9, color: [2.0, 0.5, 0.5] });
        groundRing(pos.x, y, pos.z, 0.3, 5, { life: 1.0, width: 0.5, color: [1.6, 0.4, 0.5] });
        addTrauma(0.55); fovPunch(4, 0.8);
        break;
      }
      default: break;
    }
  }

  function trackAirborne(id, x, groundY, z, height) {
    let rec = airborne.get(id);
    if (!rec) { rec = { h: 0, x, z, seen: frameIndex, vy: 0 }; airborne.set(id, rec); }
    const dh = height - rec.h;
    rec.vy = dh;
    if (rec.h > 0.18 && height <= 0.02) landingDust(x, z, Math.min(1, rec.h * 0.8 + 0.3));
    rec.h = height; rec.x = x; rec.z = z; rec.seen = frameIndex;
  }
  function sweepAirborne() {
    for (const [id, rec] of airborne) {
      if (rec.seen === frameIndex) continue;
      if (rec.h > 0.18) landingDust(rec.x, rec.z, 0.6);
      airborne.delete(id);
    }
  }

  function update(realDt, gameDt, state = {}) {
    realDt = Math.max(0, Math.min(0.1, realDt || 0));
    gameDt = Math.max(0, Math.min(0.1, gameDt ?? realDt));
    realTime += realDt;
    gameTime += gameDt;
    hitsThisFrame = 0;
    if (state.heroAction) heroAction = state.heroAction;
    slow.advance(realDt);
    const fxDt = Math.max(gameDt, realDt * 0.2);
    if (combo.tick(gameTime)) hudState.comboShown = -1;
    updateMusou(realDt, gameDt);
    updateOfficerCam(realDt);
    {
      const g = cam.goal, k = Math.min(1, realDt * g.rate);
      cam.orbit += (g.orbit - cam.orbit) * k; cam.dolly += (g.dolly - cam.dolly) * k;
      cam.lift += (g.lift - cam.lift) * k; cam.look += (g.look - cam.look) * k;
      if (musou.active || officerCam.t >= officerCam.dur) cam.pivotOnHero = true;
    }
    hudFade.value += (hudFade.target - hudFade.value) * Math.min(1, realDt * (hudFade.target < hudFade.value ? 8 : 4));
    if (hudFade.targets.length && Math.abs(hudFade.value - hudFade.applied) > 0.01) {
      hudFade.applied = hudFade.value;
      for (const node of hudFade.targets) node.style.opacity = hudFade.value > 0.99 ? '' : hudFade.value.toFixed(2);
    }
    if (Number.isFinite(state.energy) || state.gaugeFull !== undefined) {
      const full = state.gaugeFull ?? state.energy >= 100;
      if (full !== gauge.full) { gauge.full = full; for (const node of gauge.targets) node.classList.toggle('cfx-gauge-full', full); }
    }
    const attacking = state.attacking ?? ATTACK_ACTIONS.has(heroAction);
    updateBlade(gameDt, attacking);
    if ((heroAction === 'plunge' || move.kind === 'plunge' && gameTime - move.startedAt < 1.2) && gameDt > 0) plungeStreaks();
    // afterimages during combo 4 / 5, charge and musou
    if (move.echo && attacking && gameTime - move.lastEcho >= (musou.active ? 0.05 : 0.065)) {
      move.lastEcho = gameTime;
      echoes.snapshot(musou.active ? 1 : 0.8, musou.active ? 0.3 : 0.24);
    }
    if (!attacking && move.kind !== 'dodge') move.echo = false;
    const auraTarget = musou.active ? (musou.isTrue ? 0.85 : 0.62) : 0;
    trailState.aura = (trailState.aura || 0) + (auraTarget - (trailState.aura || 0)) * Math.min(1, realDt * 8);
    trailState.auraPulse = Math.max(0, (trailState.auraPulse || 0) - realDt * 3);   // glow flash at activation
    echoes.update(fxDt, realTime, trailState.aura + trailState.auraPulse * 1.5);
    updateFlashes(realDt);
    updateOcclusion(realDt, state.enemies);
    updateSplitShock(realDt);
    sweepAirborne();
    groupBurstCheck();
    writeItems(fxDt, realDt);
    particles.update(fxDt);
    // camera envelopes (real time)
    cam.punchT = Math.min(1, cam.punchT + realDt / cam.punchDur);
    cam.trauma = Math.max(0, cam.trauma - realDt * 1.9);
    updateHud(realDt);
    frameIndex++;
  }

  function cameraOffset() {
    const pt = cam.punchT;
    const fov = pt < 1 ? cam.punchAmp * (pt < 0.12 ? pt / 0.12 : 1 - smooth01((pt - 0.12) / 0.88)) : 0;
    const shake = cam.trauma * cam.trauma;
    const t = realTime;
    return {
      fov,
      shake,
      shakeX: shake * 0.16 * (Math.sin(t * 71) * 0.6 + Math.sin(t * 113 + 1.3) * 0.4),
      shakeY: shake * 0.12 * (Math.sin(t * 83 + 2.1) * 0.6 + Math.sin(t * 131 + 0.7) * 0.4),
      roll: shake * 0.03 * Math.sin(t * 47 + 0.4) + (fov < 0 ? fov * 0.002 : 0),
      orbit: cam.orbit, dolly: cam.dolly, lift: cam.lift, look: cam.look,
      pivot: cam.pivotOnHero ? null : cam.pivot,
    };
  }

  const pivot = new THREE.Vector3();
  /** Hard camera cuts for the 天刃 long-form finale (CUT 1/2/LEAP/3); replaces the eased offset rig while active. */
  function applyCameraCut(c, cut) {
    const f = heroForward(fwd, musou.facing);
    const hp = hero.position, gy = groundAt(hp.x, hp.z);
    // battle.js applies its procedural leap lift (up to ~1.5 m) to heroModel.position.y, a child of the hero group --
    // hp.y (the group's own position) never sees it. Reading heroModel's actual world Y (no per-frame allocation:
    // heroBody is a preallocated scratch vector) and folding the delta into both the camera height and the look-at
    // target keeps her full body (and some headroom) in frame through the whole leap instead of just at ground pose.
    const lift = heroModel ? heroModel.getWorldPosition(heroBody).y - hp.y : 0;
    if (cut === 'cut1') {           // low-angle close front shot, looking up at her face/blade
      cutTmp.set(hp.x + f.x * 2.0, gy + 0.55, hp.z + f.z * 2.0);
      cutTmp2.set(hp.x - f.x * 0.25, hp.y + 1.55, hp.z - f.z * 0.25);
    } else if (cut === 'cut2') {    // 3/4 high angle, close enough the hero reads at ~25-28% of frame height.
      // Round 4: the round-3 tuning (radius:3/height:2.2, ~36°) was close enough to graze a level prop/backdrop
      // that's invisible in fx-preview's own scene but present in the real march level -- it read as a big flat
      // hard-edged translucent sheet in-game. Confirmed by bisection on real in-game shots (clean at the original
      // radius:6/height:4.4, reproduces by radius:3.2/height:2.35, clean again here) that this is a MINIMUM-DISTANCE
      // threshold, not an angle/direction one (tested steeper pitch, near-top-down, a lateral approach, and a much
      // farther pull-back -- all either kept the exact same artifact or removed it only by going back out to ~7 m,
      // which regresses hero size). This is the closest distance that reliably stayed clean across bisection.
      const ang = musou.cutSeed * Math.PI * 2 + musou.g * 0.35;
      cutTmp.set(hp.x + Math.cos(ang) * 3.75, gy + 2.75, hp.z + Math.sin(ang) * 3.75);
      cutTmp2.set(hp.x, hp.y + 0.85, hp.z);
    } else if (cut === 'leap') {    // pulled back and up, tilted DOWN (never up) so no camera geometry choice can
      // expose the arena backdrop's edge (a finite sky card; some hero facings showed a visible seam when this
      // looked up, even slightly). Round 5: both the camera height and the look-at target track `lift` (see above)
      // so she doesn't rise out of frame as she leaps.
      cutTmp.set(hp.x - f.x * 2.6, gy + 2.8 + lift, hp.z - f.z * 2.6);
      cutTmp2.set(hp.x, hp.y + 0.7 + lift, hp.z);
    } else {                        // behind/below at the same safe downward pitch, pulled back further still;
      // eases back even more so the launched enemies falling around her stay in frame (07/08). Distance/height are
      // both scaled down ~2.6x from the previous tuning (uniformly, so the pitch ratio -- and the anti-backdrop-edge
      // guarantee -- is unchanged) so the cleave now reads at ~35% of frame height in the real march level. Round 5:
      // also tracks `lift`, in case any residual leap lift hasn't settled back to baseline right at the cut3 handoff.
      const s = Math.max(0, musou.t - musou.impactT);
      const p = smooth01((s - 0.3) / 0.5);
      const dist = 2.0 + 1.0 * p, height = 2.15 + 0.69 * p, lookY = 0.7 - 0.1 * p;
      cutTmp.set(hp.x - f.x * dist, gy + height + lift, hp.z - f.z * dist);
      cutTmp2.set(hp.x, hp.y + lookY + lift, hp.z);
    }
    c.position.copy(cutTmp);
    look.lookAt(c.position, cutTmp2, up);
    c.quaternion.setFromRotationMatrix(look);
    const off = cameraOffset();
    if (Math.abs(off.fov) > 0.01) { c.fov = cam.savedFov + off.fov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
  }
  function cameraPre(cameraArg = camera, focus = null) {
    const c = cameraArg;
    cam.saved.copy(c.position); cam.savedQ.copy(c.quaternion); cam.savedFov = c.fov; cam.applied = true;
    if (musou.active && musou.longForm && musou.cut) { applyCameraCut(c, musou.cut); return; }
    const off = cameraOffset();
    if (Math.abs(off.orbit) > 1e-4 || Math.abs(off.dolly - 1) > 1e-4 || Math.abs(off.lift) > 1e-4 || off.look > 1e-4) {
      const f = off.pivot || focus || heroChest(pivot);
      tmp.subVectors(c.position, f).applyAxisAngle(up, off.orbit).multiplyScalar(off.dolly);
      tmp.y += off.lift;
      c.position.copy(f).add(tmp);
      look.lookAt(c.position, f, up);
      quat.setFromRotationMatrix(look);
      c.quaternion.copy(cam.savedQ).slerp(quat, Math.min(1, off.look));
    }
    if (off.shake > 0.0001) {
      tmp.set(off.shakeX, off.shakeY, 0).applyQuaternion(c.quaternion);
      c.position.add(tmp);
      c.rotateZ(off.roll);
    } else if (off.roll) c.rotateZ(off.roll);
    if (Math.abs(off.fov) > 0.01) { c.fov = cam.savedFov + off.fov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
  }
  function cameraPost(cameraArg = camera) {
    if (!cam.applied) return;
    const c = cameraArg;
    c.position.copy(cam.saved); c.quaternion.copy(cam.savedQ);
    if (c.fov !== cam.savedFov) { c.fov = cam.savedFov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
    cam.applied = false;
    // the cleave's screen split needs one frame of the framebuffer *after* it has just been rendered; cameraPost
    // runs right after renderer.render() in battle.js, so this is the earliest safe moment to copy it.
    if (splitState.pending) captureSplit();
  }
  function ensureSplitTexture() {
    const w = renderer?.domElement?.width || 0, h = renderer?.domElement?.height || 0;
    if (!w || !h) return;
    if (splitOverlay.texW === w && splitOverlay.texH === h && splitOverlay.texture) return;
    splitOverlay.texture?.dispose();
    splitOverlay.texture = new THREE.FramebufferTexture(w, h, THREE.RGBAFormat);
    splitOverlay.texW = w; splitOverlay.texH = h;
    splitOverlay.material.uniforms.uTex.value = splitOverlay.texture;
  }
  function captureSplit() {
    splitState.pending = false;
    if (!renderer?.copyFramebufferToTexture) return;
    ensureSplitTexture();
    if (!splitOverlay.texture) return;
    try { renderer.copyFramebufferToTexture(splitOverlay.texture); } catch { return; }
    splitOverlay.material.uniforms.uSeed.value = rand() * 100;
    splitOverlay.material.uniforms.uAngle.value = 0.2 + rand() * 0.2;
    splitState.active = true; splitState.t = 0;
  }

  function reset() {
    particles.clear();
    items.length = 0;
    blade?.clear();
    echoes.hide();
    releaseFlashes();
    releaseOcclusion();
    airborne.clear();
    killTimes.length = 0;
    combo.reset();
    slow.reset();
    musou.active = false; musou.cut = null;
    cam.trauma = 0; cam.punchT = 1; cam.orbit = 0; cam.dolly = 1; cam.lift = 0; cam.look = 0; cam.calm = false; cam.pivotOnHero = true;
    Object.assign(cam.goal, { orbit: 0, dolly: 1, lift: 0, look: 0 });
    officerCam.t = 9; names.clear(); bannered.clear(); hudFade.target = 1;
    overlay.lines = overlay.flash = overlay.shade = overlay.hurt = 0;
    hudState.comboShown = -1; hudState.fade = 0; hudState.bannerT = 9; hudState.titleT = 9;
    if (renderer?.domElement?.style && hudState.gradeApplied) { renderer.domElement.style.filter = ''; hudState.gradeApplied = 0; }
    musou.cutinT = 9;
    spirit.phase = 'hidden'; spirit.reveal = 0; spiritBlade.mesh.visible = false; flameShroud.mesh.visible = false;
    splitState.pending = false; splitState.active = false; splitOverlay.mesh.visible = false;
    shockState.active = false; shockwave.mesh.visible = false;
    endMusou();
    if (hud) { for (const d of hud.damage) d.age = d.life; for (const s of hud.stamps) s.age = s.life; updateHud(0); }
  }

  /** Compile every FX program up front (avoids a hitch on the first hit), including the occlusion dither variant. */
  function prewarm(sampleEnemy = null) {
    if (!renderer?.compile) return;
    const hidden = [];
    for (const mesh of [...particles.meshes, strips.mesh, spiritBlade.mesh, flameShroud.mesh, splitOverlay.mesh, shockwave.mesh]) {
      if (!mesh.visible) { mesh.visible = true; hidden.push(mesh); }
    }
    for (const ghost of echoes.ghosts) { if (!ghost.mesh.visible) { ghost.mesh.visible = true; hidden.push(ghost.mesh); } }
    if (echoes.aura && !echoes.aura.visible) { echoes.aura.visible = true; hidden.push(echoes.aura); }
    ensureSplitTexture();
    const variants = sampleEnemy ? [material => flashMaterials(material).hot, material => occludeMaterial(material)] : [null];
    for (const pick of variants) {
      const swaps = [];
      if (pick) sampleEnemy.traverse(object => {
        if (!object.isMesh || !object.material || Array.isArray(object.material)) return;
        swaps.push([object, object.material]);
        object.material = pick(object.material);
      });
      try { renderer.compile(scene, camera); } catch { /* ignore */ }
      for (const [object, material] of swaps) object.material = material;
    }
    for (const mesh of hidden) mesh.visible = false;
  }

  function dispose() {
    if (renderer?.domElement?.style && hudState.gradeApplied) renderer.domElement.style.filter = '';
    releaseFlashes();
    releaseOcclusion();
    scene.remove(...particles.meshes, strips.mesh, spiritBlade.mesh, flameShroud.mesh, splitOverlay.mesh, shockwave.mesh);
    particles.dispose(); strips.dispose(); echoes.dispose();
    spiritBlade.dispose(); flameShroud.dispose(); splitOverlay.dispose(); shockwave.dispose();
    for (const texture of owned) texture.dispose();
    for (const entry of flashCache.values()) { entry.hot.dispose(); entry.warm.dispose(); }
    flashCache.clear();
    for (const clone of occlusionCache.values()) clone.dispose();
    occlusionCache.clear();
    if (swordOriginal && o.sword) { o.sword.material = swordOriginal; swordMaterial.dispose(); }
    hudObserver?.disconnect();
    hud?.el.layer.remove();
  }

  function stats() {
    const cinematicDraws = (spiritBlade.mesh.visible ? 1 : 0) + (flameShroud.mesh.visible ? 1 : 0) + (splitOverlay.mesh.visible ? 1 : 0) + (shockwave.mesh.visible ? 1 : 0);
    return {
      particlesAlive: particles.alive(), particleCap: particles.capacity,
      stripSlotsUsed: strips.used, stripSlots: q.stripSlots,
      ghostsVisible: echoes.ghosts.filter(g => g.mesh.visible).length + (echoes.aura?.visible ? 1 : 0),
      drawCalls: particles.draws + (strips.mesh.visible ? 1 : 0) + echoes.ghosts.filter(g => g.mesh.visible).length + (echoes.aura?.visible ? 1 : 0) + cinematicDraws,
      cinematicDraws,
      echoVertices: echoes.vertexCount, combo: combo.count, maxCombo: combo.max, kills, timeScale: slow.value(), quality: qualityName,
    };
  }

  return {
    /** Resolves once the FX textures have loaded (or failed); effects before that draw nothing. */
    ready: Promise.all(loading),
    onEvent, update, trackAirborne,
    timeScale: () => timing === 'game' ? 1 : Math.min(slow.value(), musou.active && musou.curve ? curveAt(musou.curve, musou.g) : 1),
    cameraOffset, cameraPre, cameraPost,
    reset, prewarm, dispose, stats,
    setKills(n) { kills = n | 0; },
    /** Mirror an external hit counter (e.g. MarchDirector.combo) instead of the built-in one. */
    setCombo(n) {
      const value = Math.max(0, n | 0);
      if (value > combo.count) { hudState.pulse = 0; hudState.pulseAmp = comboTier(value) > comboTier(combo.count) ? 0.8 : 0.26; }
      combo.count = value; combo.max = Math.max(combo.max, value); if (value) combo.last = gameTime;
    },
    get combo() { return combo.count; },
    /** Diagnostics for the musou-v2 screenshot driver: precise long-form phase (spirit.phase can only be read here,
     * not inferred from game time, since sweep beats are a short real-time window inside the swing timeline). */
    debugMusou: () => ({ active: musou.active, longForm: musou.longForm, isTrue: musou.isTrue, cut: musou.cut, spiritPhase: spirit.phase, leapAt: musou.leapAt, g: musou.g, t: musou.t }),
    /** Diagnostics for the occlusion leak/dispose tests: how many recs are mid-fade right now, and how many
     * distinct dither clones exist (shared per source material, so this shouldn't grow with enemy count). */
    debugOcclusion: () => ({ activeCount: occlusionActive.size, cacheSize: occlusionCache.size }),
    /** Diagnostics for the "something white lingers after the musou" bug report: every cinematic mesh's
     * visible/opacity, the strip-item list (decals/crater/crack/rings included), particle count, and the relevant
     * state machines, so a screenshot can be correlated with exactly what's still drawing. */
    debugAftermath: () => ({
      spiritBlade: { visible: spiritBlade.mesh.visible, opacity: spiritBlade.material.uniforms.uOpacity.value, reveal: spiritBlade.material.uniforms.uReveal.value },
      flameShroud: { visible: flameShroud.mesh.visible, opacity: flameShroud.material.uniforms.uOpacity.value },
      splitOverlay: { visible: splitOverlay.mesh.visible, alpha: splitOverlay.material.uniforms.uAlpha.value, sep: splitOverlay.material.uniforms.uSep.value },
      shockwave: { visible: shockwave.mesh.visible, opacity: shockwave.material.uniforms.uOpacity.value, radius: shockwave.material.uniforms.uRadius.value },
      aura: echoes.aura ? echoes.aura.visible : null,
      ghostsVisible: echoes.ghosts.filter(g => g.mesh.visible).length,
      stripSlotsUsed: strips.used,
      items: items.map(it => ({ type: it.type, row: it.row, life: +it.life.toFixed(3), age: +it.age.toFixed(3), fadeFrom: it.fadeFrom, alpha: it.alpha, musou: it.musou, follow: it.follow })),
      particlesAlive: particles.alive(),
      spiritPhase: spirit.phase,
      splitState: { ...splitState },
      shockState: { ...shockState },
      musou: { active: musou.active, t: +musou.t.toFixed(3), endAt: Number.isFinite(musou.endAt) ? +musou.endAt.toFixed(3) : musou.endAt, longForm: musou.longForm, isTrue: musou.isTrue },
      drawCalls: (particles.draws + (strips.mesh.visible ? 1 : 0) + echoes.ghosts.filter(g => g.mesh.visible).length + (echoes.aura?.visible ? 1 : 0)
        + (spiritBlade.mesh.visible ? 1 : 0) + (flameShroud.mesh.visible ? 1 : 0) + (splitOverlay.mesh.visible ? 1 : 0) + (shockwave.mesh.visible ? 1 : 0)),
    }),
    objects: [...particles.meshes, strips.mesh, ...echoes.ghosts.map(g => g.mesh), echoes.aura, spiritBlade.mesh, flameShroud.mesh, splitOverlay.mesh, shockwave.mesh].filter(Boolean),
    quality: q,
  };
}
