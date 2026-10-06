import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from './physics.mjs';
import { TacticalRun, launchTrainingFeed, readBest, saveBest } from './tactics.mjs';

function simulate(id, profile = 'lin', dt = 1 / 60, wrong = false, automated = false) {
  const run = new TacticalRun(id), hits = [], landings = [];
  const match = new Match({ random: () => .5, onEvent(e) {
    if (e.type === 'swing') run.captureSwing(e, match.ball, automated);
    const counted = run.event(e, match.ball, automated);
    if (e.type === 'hit' && e.side === 1) hits.push(e);
    if (counted) landings.push(e);
  } });
  match.start('easy', { practice: true, playerProfile: profile, opponentProfile: profile === 'lin' ? 'harimoto' : 'lin' });
  launchTrainingFeed(match, id);
  for (let age = 0; age < 78 && run.status === 'running'; age += dt) {
    if (match.phase === 'ready') launchTrainingFeed(match, id, match.rallies);
    for (let remaining = dt; remaining > .000001 && run.status === 'running'; remaining -= 1 / 120) {
      const step = Math.min(remaining, 1 / 120), contact = match.contact(1);
      if (contact?.legal && contact.time <= .23 && contact.time >= .12 && match.inputReady) {
        const aim = id === 'switch' ? (run.progress < 2 ? -.75 : .75) : 0;
        match.strike({ aim, spin: wrong ? 0 : id === 'short' ? -1 : 1, power: id === 'short' ? .4 : .55, landingDepth: id === 'short' ? .55 : 1.04 });
      }
      if (id === 'lift' && match.opponentSwing && !match.opponentSwing.hit) Object.assign(match.opponentSwing.shot, { spin: -.8, power: .35, landingDepth: .95 });
      const previous = match.ball ? { ...match.ball } : null;
      match.step(step, match.stance(1).bodyX); run.observeBall(previous, match.ball); run.tick(step);
    }
  }
  return { run, match, hits, landings };
}

test('all four tasks can be achieved with legal physical shots, either profile and low render rates', () => {
  for (const profile of ['lin', 'harimoto']) for (const id of ['rhythm', 'switch', 'short', 'lift']) for (const dt of [1 / 60, 1 / 30, 1 / 15]) {
    const { run, hits, landings } = simulate(id, profile, dt);
    assert.equal(run.status, 'success', `${profile}/${id}/${dt}: ${JSON.stringify(run.snapshot())}`);
    assert.ok(hits.length >= run.mission.goal); assert.ok(landings.length >= run.mission.goal);
    assert.ok(run.elapsed < run.mission.time); assert.ok(landings.every(e => e.z < 0));
    if (id === 'short') assert.ok(landings.every(e => -e.z <= .70));
    if (id === 'switch') assert.deepEqual(landings.slice(-3).map(e => Math.sign(e.x)), [-1, -1, 1]);
  }
});

test('wrong spin and automatic demonstrations cannot pass spin challenges', () => {
  for (const id of ['short', 'lift']) {
    assert.notEqual(simulate(id, 'lin', 1 / 60, true).run.status, 'success');
    assert.equal(simulate(id, 'lin', 1 / 60, false, true).run.progress, 0);
  }
});

test('only a player hit followed by the legal first receiving bounce counts', () => {
  const run = new TacticalRun('rhythm'), swing = { type: 'swing', side: 1, spin: 1 };
  for (const ball of [{ hitter: -1, received: 1 }, { hitter: 1, received: 0 }, { hitter: 1, received: 2 }, { hitter: 1, received: 1, isServe: true }]) {
    run.captureSwing(swing, { spin: 1 }); run.event({ type: 'hit', side: 1 }, ball); run.event({ type: 'bounce', x: .3, z: -.8 }, ball);
    assert.equal(run.progress, 0);
  }
  run.reset(); run.event({ type: 'bounce', x: .3, z: -.8 }, { hitter: 1, received: 1 }); assert.equal(run.progress, 0);
});

test('retry clears the pending shot, lane, progress and faults; failure is finite without input', () => {
  const run = new TacticalRun('switch'); run.captureSwing({ side: 1, spin: 1 }, { spin: -.8 }); run.progress = 2; run.lane = -1; run.faults = 2;
  run.reset(); assert.equal(run.pending, null); assert.equal(run.progress, 0); assert.equal(run.lane, 0); assert.equal(run.faults, 0);
  for (let i = 0; i < 3; i++) run.event({ type: 'point', winner: -1 }); assert.equal(run.status, 'failed');
  run.reset(); run.tick(66); assert.equal(run.status, 'failed'); assert.equal(run.message, 'time');
});

test('training feed starts before the legal bounce and best records tolerate unavailable storage', () => {
  const match = new Match(); match.start(); launchTrainingFeed(match, 'lift'); assert.equal(match.ball.received, 0); assert.ok(match.ball.spin < -.35); assert.equal(match.canHit(1), false);
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readBest(storage, 'rally'), null); assert.equal(saveBest(storage, 'rally', 6), 6); assert.equal(saveBest(storage, 'rally', 4), 6);
  assert.equal(saveBest(storage, 'mission:short', 15, true), 15); assert.equal(saveBest(storage, 'mission:short', 18, true), 15); assert.equal(saveBest(storage, 'mission:short', 12, true), 12);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }; assert.equal(readBest(blocked, 'rally'), null); assert.equal(saveBest(blocked, 'rally', 7), 7);
});
