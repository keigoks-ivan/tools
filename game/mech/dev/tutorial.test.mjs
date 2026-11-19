import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { MechTutorial } from '../tutorial.mjs';
import { Encounter, parse } from '../encounter.js';
import { STAGE_DATA } from '../stages.js';

test('the tutorial waits for movement, both target hits and shield activation in order', () => {
  const ended = [];
  const combat = {
    player: { pos: new Vector3() }, world: { height: () => 0 }, audio: { ui() {} },
    stats: { time: 4, shots: 0 }, shield: { active: false, cooldown: 0 }, rifle: { mag: 40, ammo: 40 },
    msl: { cd: 1, locks: [] }, od: { gauge: 0 }, enemies: [], missiles: [], events: [], notes: [],
    fx: { missileEnd(handle) { ended.push(handle); } },
    spawn() { const tank = { dead: false }; this.enemies.push(tank); return tank; },
    vehicles: { dispose() {} }, stopShield() { this.shield.active = false; },
  };
  const tutorial = new MechTutorial(combat, [18, 54, 97].map(z => ({ x: 0, z })));
  tutorial.update(1);
  assert.equal(tutorial.step, 'move');
  combat.player.pos.z = 18;
  tutorial.update(1);
  assert.equal(tutorial.step, 'rifle');
  assert(tutorial.target.training);
  tutorial.target.dead = true; combat.rifle.ammo--;
  tutorial.update(1);
  assert.equal(tutorial.step, 'missile');
  assert(!tutorial.target.dead);
  combat.missiles.push({ h: 5 }); combat.events.push({});
  tutorial.target.dead = true;
  tutorial.update(1);
  assert.equal(tutorial.step, 'shield');
  assert.deepEqual(ended, [5]);
  assert.equal(combat.events.length, 0);
  assert.equal(tutorial.update(1), false);
  combat.shield.active = true; combat.stats.time += 20; combat.stats.shots++;
  tutorial.update(1);
  assert.equal(tutorial.step, 'done');
  assert.equal(tutorial.update(1.5), true);
  tutorial.finish();
  assert.deepEqual(combat.stats, { time: 4, shots: 0 });
  assert.equal(combat.enemies.length, 0);
  assert.equal(combat.rifle.ammo, 40);
  assert(!combat.shield.active);
});

test('later stages and checkpoint restarts start directly on the normal route', () => {
  const make = (i, cp) => {
    const def = STAGE_DATA[i];
    return new Encounter({ def, stats: {}, cp }, parse(def.route, i + 1), cp?.sec);
  };
  assert(make(0, null).wantsTutorial);
  assert(!make(0, { sec: 4 }).wantsTutorial);
  for (let i = 1; i < STAGE_DATA.length; i++) assert(!make(i, null).wantsTutorial);
});
