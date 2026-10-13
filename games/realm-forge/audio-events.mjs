// Pure world observer: diffs successive world states into sound events.
// It only reads the world, so core.mjs stays headless and untouched by audio.
const WORK_SOUND = { wood: 'chop', gold: 'mine', stone: 'mine', food: 'farm', build: 'hammer', repair: 'hammer' };
const WORK_STRIKE = 0.5; // workPhase (0..1.05) at which the tool contacts the target

export function unitClass(blueprint) {
  if (!blueprint) return 'infantry';
  if (blueprint.hero) return 'hero';
  if (blueprint.role === 'worker') return 'villager';
  if (blueprint.role === 'healer') return 'monk';
  if (blueprint.family === 'siege' || blueprint.look === 'siege') return 'siege';
  if (blueprint.look === 'knight' || blueprint.family === 'cavalry') return 'cavalry';
  if (blueprint.look === 'archer' || blueprint.role === 'ranged') return 'archer';
  if (blueprint.role === 'trader') return 'villager';
  return 'infantry';
}

export function createObserver() {
  let world = null, lastTime = 0;
  let seenEffects = new WeakSet(), seenCorpses = new WeakSet();
  let units = new Set(), buildings = new Map(), phases = new Map();
  let researched = 0, age = 0, alertStamp;

  function prime(w) {
    world = w; lastTime = w.time;
    seenEffects = new WeakSet(w.effects); seenCorpses = new WeakSet(w.corpses);
    units = new Set(w.units.map(u => u.id));
    buildings = new Map(w.buildings.map(b => [b.id, { progress: b.progress, type: b.type, x: b.x, y: b.y, team: b.team }]));
    phases = new Map();
    researched = w.researched?.[0]?.size ?? 0; age = w.ages?.[0] ?? 0; alertStamp = w.lastAlert;
  }
  const seeEffects = list => { const fresh = []; for (const e of list) if (!seenEffects.has(e)) { seenEffects.add(e); fresh.push(e); } return fresh; };

  return function observe(w) {
    if (w !== world || w.time < lastTime) { prime(w); return []; }
    lastTime = w.time;
    const out = [], visible = p => w.isVisible({ x: p.x, y: p.y });
    const emit = (kind, p, extra = {}) => out.push({ kind, x: p.x, y: p.y, ...extra });

    for (const e of seeEffects(w.effects)) {
      const src = { x: e.x, y: e.y }, dst = { x: e.tx ?? e.x, y: e.ty ?? e.y };
      if (!visible(src) && !visible(dst)) continue;
      const team = e.team;
      if (e.type === 'hit') emit('sword', dst, { team });
      else if (e.type === 'arrow') { emit('arrow-shoot', src, { team }); emit('arrow-hit', dst, { team, delay: .2 }); }
      else if (e.type === 'rock') { emit('rock-shoot', src, { team }); emit('rock-land', dst, { team, delay: .32 }); }
      else if (e.type === 'heal') emit('heal', dst, { team: 0 });
    }

    for (const c of w.corpses) if (!seenCorpses.has(c)) {
      seenCorpses.add(c);
      if (!c.garrison && visible(c)) emit('death', c, { team: c.team, unit: unitClass(c.blueprint) });
    }

    const nextUnits = new Set();
    for (const u of w.units) {
      nextUnits.add(u.id);
      if (!units.has(u.id) && u.team === 0 && !u.garrison) emit('trained', u, { team: 0, unit: unitClass(u.blueprint), ui: true });
      const kind = u.working && !u.garrison && u.hp > 0 ? WORK_SOUND[u.working] : null;
      if (!kind) { phases.delete(u.id); continue; }
      const phase = u.workPhase || 0, last = phases.get(u.id);
      phases.set(u.id, phase);
      if (last !== undefined && last < WORK_STRIKE && phase >= WORK_STRIKE && visible(u)) emit(kind, u, { team: u.team, id: u.id });
    }
    units = nextUnits;
    if (phases.size > nextUnits.size) for (const id of phases.keys()) if (!nextUnits.has(id)) phases.delete(id);

    const nextBuildings = new Map();
    for (const b of w.buildings) {
      const prev = buildings.get(b.id);
      nextBuildings.set(b.id, { progress: b.progress, type: b.type, x: b.x, y: b.y, team: b.team });
      if (prev && prev.progress < 1 && b.progress >= 1 && (b.team === 0 || visible(b))) emit('building-complete', b, { team: b.team, building: b.type, ui: b.team === 0 });
    }
    for (const [id, prev] of buildings) if (!nextBuildings.has(id) && prev.progress >= 1 && (prev.team === 0 || visible(prev))) emit('building-collapse', prev, { team: prev.team, building: prev.type });
    buildings = nextBuildings;

    const nextAge = w.ages?.[0] ?? 0, nextResearched = w.researched?.[0]?.size ?? 0;
    if (nextAge > age) emit('age-up', { x: 0, y: 0 }, { team: 0, ui: true });
    else if (nextResearched > researched) emit('tech', { x: 0, y: 0 }, { team: 0, ui: true });
    age = nextAge; researched = nextResearched;

    if (w.lastAlert !== alertStamp) {
      alertStamp = w.lastAlert;
      const spot = w.events?.find(e => e.x !== undefined && e.time === w.lastAlert) || w.events?.find(e => e.x !== undefined) || { x: 0, y: 0 };
      emit('alert', spot, { team: 0, ui: true });
    }
    return out;
  };
}
