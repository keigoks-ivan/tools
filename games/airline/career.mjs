// Optional dispatch goals and collections. XP never changes cash, demand or costs.
import { CITIES, CITY_REGIONS, AIRCRAFT, MODES, CONST } from './data.mjs?v=19';

export const TIERS = [
  { xp: 0, zh: '新生航空', en: 'Newcomer airline', icon: '✈' },
  { xp: 200, zh: '城市穿梭', en: 'City hopper', icon: '✦' },
  { xp: 500, zh: '區域明星', en: 'Regional star', icon: '★' },
  { xp: 900, zh: '跨洲航網', en: 'Continental network', icon: '♛' },
  { xp: 1400, zh: '世界航空', en: 'World airline', icon: '♜' },
];
export const ALBUM_GOAL = 3;
export function tierProgress(xp = 0) {
  const index = TIERS.reduce((i, t, n) => xp >= t.xp ? n : i, 0), tier = TIERS[index], next = TIERS[index + 1];
  return { index, tier, next, progress: next ? Math.max(0, Math.min(1, (xp - tier.xp) / (next.xp - tier.xp))) : 1 };
}
export function albums(stamps = {}) {
  return Object.entries(CITY_REGIONS).map(([id, region]) => {
    const cities = Object.keys(stamps).filter(c => CITIES[c]?.region === id).sort();
    return { id, ...region, cities, complete: cities.length >= ALBUM_GOAL };
  });
}
export function readCareer(state) {
  const c = state.career, m = c?.active;
  const validMission = !m || (['explore','rival','network','efficiency','recovery'].includes(m.kind) && typeof m.id === 'string' && Number.isInteger(m.deadline) && Number.isFinite(m.pax) && Number.isFinite(m.xp)
    && (['explore','rival'].includes(m.kind) ? !!CITIES[m.city] && !!AIRCRAFT[m.plan?.type] && Number.isFinite(m.kind === 'explore' ? m.targetPax : m.targetSeats) : m.kind === 'recovery' ? Number.isFinite(m.targetLoss) : Number.isInteger(m.targetRoutes)));
  if (c?.v === 1 && Number.isFinite(c.xp) && c.xp >= 0 && c.stamps && typeof c.stamps === 'object' && !Array.isArray(c.stamps) && Array.isArray(c.completed) && Number.isInteger(c.settledTurn) && c.settledTurn >= 0 && c.settledTurn <= state.turn && Number.isInteger(c.streak) && Number.isInteger(c.bestStreak) && validMission) return c;
  // Legacy games keep their already flown cities, without inventing old mission wins.
  const stamps = Object.fromEntries(Object.entries(state.routeStats || {}).filter(([city, r]) => CITIES[city] && r.turns > 0).map(([city]) => [city, { turn: 0 }]));
  return { v: 1, xp: Object.keys(stamps).length * 35 + (state.history || []).filter(h => h.pax > 0).length * 10,
    stamps, completed: [], active: null, streak: 0, bestStreak: 0, settledTurn: state.turn || 0 };
}
const choose = (items, state, salt = 0) => items.length ? items[(Math.abs(state.seed || 1) + state.turn * 7 + salt) % Math.min(8, items.length)] : null;

// Candidates have legal schedules and public forecasts supplied by model.careerBoard.
export function missionOffers(state, candidates) {
  const career = readCareer(state), turns = Math.min(3, MODES[state.mode].turns - state.turn);
  if (career.active || state.finished || state.gameOver || turns <= 0) return [];
  const make = (kind, extra) => ({ id: `${state.turn}:${kind}:${extra.city || 'hub'}`, kind, offeredTurn: state.turn, turns, ...extra });
  const viable = candidates.filter(c => c.profit > 0 && c.pax > 0);
  const undiscovered = viable.filter(c => !career.stamps[c.city]);
  const offers = [], explorer = choose(undiscovered, state);
  if (explorer) offers.push(make('explore', { city: explorer.city, plan: explorer.plan, targetPax: Math.max(100, Math.floor(explorer.pax * .65 / 100) * 100), xp: 160 }));
  const competitors = viable.filter(c => c.rivalSeats > 0 && c.rivalPlan);
  const rival = choose(competitors, state, 3);
  if (rival) offers.push(make('rival', { city: rival.city, plan: rival.rivalPlan, targetSeats: Math.ceil(rival.rivalSeats * .7), xp: 180 }));
  const last = state.history?.at(-1);
  if (last?.profit < 0) {
    offers.push(make('recovery', { targetLoss: Math.ceil(Math.max(-last.profit * .5, CONST.overhead.base * MODES[state.mode].monthsPerTurn)), xp: 140 }));
  } else if (state.routes.length >= 3 && state.turn % 2 === 1) {
    offers.push(make('network', { targetRoutes: Math.min(5, state.routes.length + 1), targetRegions: 2, targetTransfer: .05, xp: 220 }));
  } else offers.push(make('efficiency', { targetRoutes: Math.min(3, Math.max(1, state.routes.length)), xp: 140 }));
  // A second destination keeps the board useful when no rival market is viable.
  if (offers.length < 3) {
    const second = choose(undiscovered.filter(c => c.city !== explorer?.city), state, 5);
    if (second) offers.push(make('explore', { city: second.city, plan: second.plan, targetPax: Math.max(100, Math.floor(second.pax * .65 / 100) * 100), xp: 160 }));
  }
  return offers.slice(0, 3);
}

export function missionChecks(mission, state, report) {
  const co = report?.company, rows = report?.routes || [], r = rows.find(x => x.city === mission.city);
  if (mission.kind === 'explore') return [mission.pax >= mission.targetPax, mission.profitable === true];
  if (mission.kind === 'rival') {
    const seats = r ? r.weekly * 2 * AIRCRAFT[r.type].seats[co.model] : 0;
    return [seats >= mission.targetSeats, !!r && r.profit > 0];
  }
  if (mission.kind === 'network') return [rows.length >= mission.targetRoutes, new Set(rows.map(x => CITIES[x.city].region)).size >= mission.targetRegions, !!co && co.transferPax / Math.max(1, co.pax) >= mission.targetTransfer, !!co && co.profit > 0];
  if (mission.kind === 'recovery') return [!!co && co.profit >= -mission.targetLoss, !!co && co.cash > 0, !!co && co.idleAircraft === 0];
  return [rows.filter(x => x.profit > 0).length >= mission.targetRoutes, !!co && rows.length > 0 && co.idleAircraft === 0, !!co && co.profit > 0];
}

export function settleCareer(state, report) {
  const career = JSON.parse(JSON.stringify(readCareer(state))), before = tierProgress(career.xp).index;
  if (career.settledTurn >= state.turn) return { career, result: null };
  const co = report.company, newStamps = [], oldAlbums = new Set(albums(career.stamps).filter(a => a.complete).map(a => a.id));
  let xp = co.pax > 0 ? 10 + Math.min(25, report.routes.filter(r => r.profit > 0).length * 5) : 0;
  for (const r of report.routes) if (r.pax > 0 && !career.stamps[r.city]) {
    career.stamps[r.city] = { turn: state.turn }; newStamps.push(r.city); xp += 35;
  }
  const newAlbums = albums(career.stamps).filter(a => a.complete && !oldAlbums.has(a.id)).map(a => a.id);
  xp += newAlbums.length * 100;
  career.streak = co.profit > 0 ? career.streak + 1 : 0;
  career.bestStreak = Math.max(career.bestStreak || 0, career.streak);
  let mission = null;
  if (career.active) {
    const m = career.active, row = report.routes.find(r => r.city === m.city);
    m.pax += row?.pax || 0; m.profitable ||= !!row && row.profit > 0;
    m.checks = missionChecks(m, state, report);
    const success = !state.gameOver && m.checks.every(Boolean);
    if (success || state.turn >= m.deadline || state.finished || state.gameOver) {
      mission = { ...m, success };
      if (success) { xp += m.xp; career.completed.push({ id: m.id, kind: m.kind, city: m.city, turn: state.turn, xp: m.xp }); }
      career.active = null;
    }
  }
  career.xp += xp; career.settledTurn = state.turn;
  const result = { xp, newStamps, newAlbums, mission, levelUp: tierProgress(career.xp).index > before, streak: career.streak };
  return { career, result };
}
