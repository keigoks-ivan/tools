import assert from 'node:assert/strict';
import test from 'node:test';
import { ARENA } from '../duel/arena-layout.mjs';
import { LIMITS, STEP, advancePilot, createMatch, sanitizeInput, snapshotMatch, tickMatch } from '../duel/rules.mjs';

const records = seconds => Math.round(seconds / STEP);
const forward = { mz: 1 };
const faceEast = { yaw: Math.PI / 2 };
const faceWest = { yaw: -Math.PI / 2 };
const span = (match, seconds, input) => {
  for (let i = 0; i < records(seconds); i++) tickMatch(match, input);
};
const fighting = () => {
  const match = createMatch();
  span(match, LIMITS.countdownSeconds);
  return match;
};
const openLane = (match, left = -40, right = 40) => {
  Object.assign(match.players[0], { x: left, y: 0, z: 0, ...faceEast });
  Object.assign(match.players[1], { x: right, y: 0, z: 0, ...faceWest });
};

test('countdown freezes controls; packets carry bounded axes and actions only', () => {
  const match = createMatch();
  assert.deepEqual(sanitizeInput({mx: 15, mz: -.5, yaw: Infinity, pitch: -9, boost: true, fire: 'true', missile: 1, hp: 0}), {
    mx: 1, mz: -.5, yaw: null, pitch: -1.38, ascend: false, descend: false,
    boost: true, fire: false, missile: false, missileCancel: false,
  });
  span(match, LIMITS.countdownSeconds, [{...forward, fire: true, boost: true, ascend: true}]);
  const state = snapshotMatch(match);
  assert.equal(state.phase, 'fight');
  assert.equal(state.clock, LIMITS.roundSeconds);
  assert.equal(state.players[0].x, ARENA.spawn[0].x);
  assert.equal(state.players[0].y, 0);
  assert.equal(state.players[0].ammo, LIMITS.magazine);
  assert.equal(state.players[0].en, LIMITS.energy);
});

test('ground movement slides against cover, flight clears it and lands on the actual roof', () => {
  const match = fighting();
  span(match, 6, [forward]);
  const p = match.players[0], stack = ARENA.cover[0];
  assert(p.x <= stack.x - stack.width / 2 - 4.2);
  assert(p.x > ARENA.spawn[0].x + 30);
  assert.equal(p.y, 0);
  span(match, 1.3, [{...forward, ascend: true}]);
  assert(p.flying && p.y > stack.height && p.x > stack.x - 12);
  const altitude = p.y;
  span(match, .6, []);
  assert.equal(p.y, altitude);
  span(match, 1.3, [{descend: true}]);
  assert.equal(p.y, stack.height);
  assert.equal(p.flying, false);
  assert.equal(p.vy, 0);
});

test('prediction movement follows authoritative movement and finite energy forces landing', () => {
  const match = fighting();
  const pilot = match.players[0];
  const replica = {...pilot};
  const input = {mx: .4, mz: .18, yaw: .35, pitch: .35, ascend: true, boost: true};
  for (let i = 0; i < records(2); i++) {
    advancePilot(replica, input);
    tickMatch(match, [input]);
  }
  assert.deepEqual(replica, pilot);
  assert(pilot.y > 25 && pilot.en < 60);
  span(match, 2, [input]);
  assert.equal(pilot.en, 0);
  assert.equal(pilot.overheat, true);
  assert.equal(pilot.flying, false);
  assert(pilot.vy < 0);
  span(match, 5);
  assert.equal(pilot.y, 0);
  assert(pilot.en > 18 && !pilot.overheat);
});

test('rifle honors scenery, ammo, automatic reload and simultaneous player damage', () => {
  const match = fighting();
  tickMatch(match, [{...faceEast, fire: true}]);
  const [a, b] = match.players;
  assert.equal(b.hp, LIMITS.hp);
  assert.equal(a.ammo, LIMITS.magazine - 1);
  assert.equal(match.events[0].hit, null);
  assert(match.events[0].to[0] < -100, 'container stack stops the trace');
  openLane(match);
  span(match, .3);
  tickMatch(match, [{fire: true}, {fire: true}]);
  assert.equal(a.hp, LIMITS.hp - 430);
  assert.equal(b.hp, LIMITS.hp - 430);
  assert.deepEqual(match.events.slice(-2).map(e => e.hit), [1, 0]);

  Object.assign(a, {ammo: 1, rifleCooldown: 0});
  tickMatch(match, [{...faceWest, fire: true}]);
  assert.equal(a.ammo, 0);
  assert.equal(a.reload, LIMITS.reload);
  span(match, LIMITS.reload - .1, [{...faceWest, fire: true}]);
  assert.equal(a.ammo, 0);
  span(match, .1);
  assert.equal(a.ammo, LIMITS.magazine);
  assert.equal(a.reload, 0);
  assert.equal(b.hp, LIMITS.hp - 430);
});

test('rifle can hit across altitudes when the pilot really aims at the target', () => {
  const match = fighting();
  openLane(match);
  const opponent = match.players[1];
  Object.assign(opponent, {y: 65, flying: true});
  tickMatch(match, [{fire: true}]);
  assert.equal(opponent.hp, LIMITS.hp);
  span(match, .3);
  tickMatch(match, [{fire: true, pitch: Math.atan2(65, 80)}]);
  assert.equal(opponent.hp, LIMITS.hp - 430);
});

test('missile requires sight and deliberate release; blur or missing input cancels a lock', () => {
  const match = fighting();
  span(match, .8, [{missile: true}]);
  const pilot = match.players[0];
  assert.equal(pilot.lock, 0, 'spawn cover hides the opponent');
  openLane(match);
  span(match, .25, [{missile: true}]);
  assert(pilot.lock > 0 && pilot.lock < 1);
  tickMatch(match, [{}]);
  assert.equal(match.projectiles.length, 0);
  span(match, .6, [{missile: true}]);
  assert.equal(pilot.lock, 1);
  tickMatch(match);
  assert.equal(match.projectiles.length, 0);
  assert.equal(pilot.lock, 0);
  span(match, .6, [{missile: true}]);
  tickMatch(match, [{missileCancel: true}]);
  assert.equal(match.projectiles.length, 0);
  assert.equal(pilot.lock, 0);
  span(match, .6, [{missile: true}]);
  tickMatch(match, [{}]);
  assert.equal(match.projectiles.length, 1);
  assert.equal(pilot.missileCooldown, LIMITS.missileCooldown);
  assert.equal(match.events.at(-1).type, 'launch');
  span(match, .6);
  assert.equal(match.projectiles.length, 0);
  assert.equal(match.players[1].hp, LIMITS.hp - 1750);
  assert.equal(match.events.at(-1).hit, 1);
});

test('cover destroys a live guided missile when the defender breaks behind a stack', () => {
  const match = fighting();
  openLane(match);
  span(match, .6, [{missile: true}]);
  tickMatch(match, [{}]);
  const defender = match.players[1];
  defender.x = 155;
  span(match, .9);
  assert.equal(defender.hp, LIMITS.hp);
  assert.equal(match.projectiles.length, 0);
  assert.deepEqual(match.events.at(-1)?.type, 'impact');
  assert.equal(match.events.at(-1)?.hit, null);
});

test('relay activates at the end of a round and requires a low, uncontested hold', () => {
  const match = fighting();
  match.phaseTicks = records(LIMITS.relaySeconds) + 2;
  const [a, b] = match.players;
  Object.assign(a, {x: 11, z: 0, y: 25, flying: true});
  tickMatch(match);
  assert.equal(match.objective.open, false);
  span(match, .4);
  assert.equal(match.objective.open, true);
  assert.equal(match.objective.progress, 0);
  Object.assign(a, {y: 0, flying: false});
  b.x = -11;
  span(match, .5);
  assert.equal(match.objective.progress, 0);
  b.x = -38;
  span(match, 3.5);
  assert.equal(match.objective.owner, 0);
  assert(match.objective.progress > .8 && match.objective.progress < 1);
  span(match, .5);
  assert.equal(match.phase, 'roundEnd');
  assert.equal(match.reason, 'capture');
  assert.deepEqual(match.wins, [1, 0]);
});

test('best of three resets the arena between rounds; equal simultaneous kills draw', () => {
  const match = fighting();
  openLane(match);
  match.players[1].hp = 10;
  tickMatch(match, [{fire: true}]);
  assert.equal(match.phase, 'roundEnd');
  assert.equal(match.winner, 0);
  span(match, LIMITS.intermissionSeconds);
  assert.equal(match.phase, 'countdown');
  assert.equal(match.round, 2);
  assert.equal(match.players[1].hp, LIMITS.hp);
  assert.equal(match.players[0].x, ARENA.spawn[0].x);
  span(match, LIMITS.countdownSeconds);
  match.phaseTicks = 1;
  match.players[1].hp = LIMITS.hp - 1;
  tickMatch(match);
  assert.deepEqual(match.wins, [2, 0]);
  assert.equal(match.phase, 'matchEnd');
  assert.equal(match.winner, 0);
  assert.equal(match.reason, 'time');

  const tied = fighting();
  openLane(tied);
  for (const p of tied.players) p.hp = 50;
  tickMatch(tied, [{fire: true}, {fire: true}]);
  assert.equal(tied.winner, null);
  assert.deepEqual(tied.wins, [0, 0]);
  assert.deepEqual(tied.players.map(p => p.hp), [0, 0]);
});

test('the simulation can resume from a serializable snapshot of server state', () => {
  const match = fighting();
  openLane(match);
  span(match, .6, [{missile: true}]);
  tickMatch(match, [{}]);
  const resumed = JSON.parse(JSON.stringify(match));
  for (const m of [match, resumed]) span(m, 2, [{mx: 1, fire: true}]);
  assert.deepEqual(snapshotMatch(match), snapshotMatch(resumed));
  assert(snapshotMatch(match).events.length <= 24);
});
