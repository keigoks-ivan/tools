// Pure mixing policy: distance falloff, off-screen culling, per-category
// polyphony limits, spacing and alert/voice cooldowns. No Web Audio in here,
// so it runs (and is tested) under node with an injected clock and player.
export const SOUNDS = {
  chop: { cat: 'work', dur: .16, gain: .5 }, mine: { cat: 'work', dur: .22, gain: .45 },
  hammer: { cat: 'work', dur: .14, gain: .5 }, farm: { cat: 'work', dur: .3, gain: .3 },
  sword: { cat: 'melee', dur: .22, gain: .6 }, death: { cat: 'death', dur: .45, gain: .6 },
  'arrow-shoot': { cat: 'shoot', dur: .16, gain: .4 }, 'arrow-hit': { cat: 'impact', dur: .12, gain: .45 },
  'rock-shoot': { cat: 'siege', dur: .45, gain: .65 }, 'rock-land': { cat: 'siege', dur: .6, gain: .8 },
  heal: { cat: 'heal', dur: .5, gain: .35 },
  'building-complete': { cat: 'ui', dur: .9, gain: .6 }, 'building-collapse': { cat: 'collapse', dur: 1.3, gain: .85 },
  trained: { cat: 'ui', dur: .7, gain: .55 }, tech: { cat: 'ui', dur: 1.2, gain: .6 },
  'age-up': { cat: 'fanfare', dur: 2.4, gain: .7 }, alert: { cat: 'alert', dur: 1.2, gain: .75 },
};
export const CATEGORIES = {
  work: { max: 4, gap: .06 }, melee: { max: 5, gap: .05 }, shoot: { max: 5, gap: .04 }, impact: { max: 5, gap: .04 },
  siege: { max: 3, gap: .12 }, death: { max: 4, gap: .08 }, heal: { max: 2, gap: .2 }, ui: { max: 3, gap: .15 },
  collapse: { max: 2, gap: .3 }, fanfare: { max: 1, gap: 1 }, alert: { max: 1, gap: 1 }, voice: { max: 1, gap: .12 },
};
export const ALERT = { regionRadius: 18, regionCooldown: 20, globalCooldown: 5 };
export const VOICE = { unitCooldown: 1.2, classGap: .22 };

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// listener: {x, y, radius} in tile units; radius = farthest visible tile from the screen centre.
export function spatial(listener, p) {
  const dx = p.x - listener.x, dy = p.y - listener.y, d = Math.hypot(dx, dy), radius = Math.max(1, listener.radius || 20);
  if (d > radius * 1.05) return null;
  const falloff = clamp(radius, 10, 30) * 1.8;
  if (d >= falloff) return null;
  const gain = (1 - d / falloff) ** 1.3;
  if (gain < .06) return null;
  return { gain, pan: clamp((dx - dy) / (radius * 1.4), -1, 1) * .7, distance: d };
}

export function createMixer({ play, now, random = Math.random }) {
  const active = {}, lastAt = {}, alerts = [], unitAt = new Map(), classAt = {}, variants = {};
  let voiceHandle = null, lastAlertAt = -Infinity;
  const live = (cat, t) => (active[cat] = (active[cat] || []).filter(end => end > t));

  function start(name, t, opts) {
    const def = SOUNDS[name], cat = CATEGORIES[def.cat];
    if (t - (lastAt[def.cat] ?? -Infinity) < cat.gap) return false;
    const list = live(def.cat, t);
    if (list.length >= cat.max) return false;
    lastAt[def.cat] = t; list.push(t + (opts.delay || 0) + def.dur);
    play(name, { pitch: 1 + (random() - .5) * .14, pan: 0, ...opts, gain: def.gain * (opts.gain ?? 1) });
    return true;
  }

  function event(ev, listener) {
    const def = SOUNDS[ev.kind]; if (!def) return false;
    const t = now();
    if (ev.kind === 'alert') {
      if (t - lastAlertAt < ALERT.globalCooldown) return false;
      if (alerts.some(a => t - a.t < ALERT.regionCooldown && Math.hypot(a.x - ev.x, a.y - ev.y) < ALERT.regionRadius)) return false;
      if (!start('alert', t, {})) return false;
      lastAlertAt = t; alerts.push({ x: ev.x, y: ev.y, t }); if (alerts.length > 8) alerts.shift();
      return true;
    }
    if (ev.ui) return start(ev.kind, t, { delay: ev.delay });
    const s = listener && spatial(listener, ev);
    if (!s) return false;
    return start(ev.kind, t, { gain: s.gain, pan: s.pan, delay: ev.delay, unit: ev.unit });
  }

  function voice(unitClass, kind, key) {
    const t = now();
    if (key !== undefined && t - (unitAt.get(key) ?? -Infinity) < VOICE.unitCooldown) return false;
    if (t - (classAt[unitClass] ?? -Infinity) < VOICE.classGap) return false;
    if (t - (lastAt.voice ?? -Infinity) < CATEGORIES.voice.gap) return false;
    if (key !== undefined) { unitAt.set(key, t); if (unitAt.size > 200) for (const [k, v] of unitAt) if (t - v > 30) unitAt.delete(k); }
    classAt[unitClass] = t; lastAt.voice = t;
    const id = `${unitClass}:${kind}`, last = variants[id];
    let variant = Math.floor(random() * 3); if (variant === last) variant = (variant + 1) % 3; variants[id] = variant;
    voiceHandle?.stop?.();
    voiceHandle = play('voice', { unitClass, kind, variant, gain: .7, pitch: 1 + (random() - .5) * .08, pan: 0 }) || null;
    return true;
  }

  const reset = () => { for (const k of Object.keys(active)) active[k] = []; alerts.length = 0; unitAt.clear(); lastAlertAt = -Infinity; };
  return { event, voice, reset };
}
