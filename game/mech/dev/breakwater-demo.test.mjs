import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { fieldKit } from '../demo/field-kit.mjs';
import { MechCompanion } from '../mech-companion.mjs';
import { CHAPTERS, SAVE_KEY, ENCOUNTERS, HATCH_ROUTE, makeSortie, applyRoute, sections, readSortieCheckpoint } from '../demo/script.mjs';
import { ENCOUNTERS as harbor, HATCH_ROUTE as gantry } from '../lastline/script.js';

test('the demo fits the existing physical switch, gantry and affordable wave budget', () => {
  assert.equal(CHAPTERS.length, 2);
  assert.equal(CHAPTERS[1].mech, true);
  assert.ok(!['mech','zero','lastline'].includes(SAVE_KEY));
  assert.equal(ENCOUNTERS[0].pickups[0].id, 'fuse');
  const point = ENCOUNTERS[1].operation.points[0];
  assert.deepEqual([...point], [...harbor.find(e=>e.id==='G3').operation.points[0]]);
  assert.deepEqual(HATCH_ROUTE.slice(-gantry.length), gantry);
  for (const route of ['sky','pier']) {
    const config = makeSortie(); applyRoute(config,route);
    assert.equal(config.waves.length, 6);
    assert.equal(config.waves.length, sections.length);
    assert.ok(config.waves.every(w=>w.list.length > 0 && w.list.length <= 3));
    assert.ok(config.waves.at(-1).boss.airborne);
  }
});

test('replaying a different route changes the encounter, the altitude gate and final air cover independently', () => {
  const air = makeSortie(), pier = makeSortie();
  assert.equal(applyRoute(air,'invalid'),false);
  assert.equal(applyRoute(air,'sky'),true);
  assert.equal(applyRoute(pier,'pier'),true);
  assert.notDeepEqual(air.waves[1].go, pier.waves[1].go);
  assert.ok(air.waves[1].altitude > 0);
  assert.equal(pier.waves[1].altitude,undefined);
  assert.deepEqual(air.waves[1].list.map(e=>e[0]),['heli','heli']);
  assert.deepEqual(pier.waves[1].list.map(e=>e[0]),['tank','heavy']);
  assert.deepEqual(air.waves[2].list.map(e=>e[0]),['jet','heli']);
  assert.deepEqual(pier.waves[2].list.map(e=>e[0]),['grunt','tank']);
  assert.deepEqual(air.waves.at(-1).list.map(e=>e[0]),['ace']);
  assert.deepEqual(pier.waves.at(-1).list.map(e=>e[0]),['ace','heli']);
  assert.deepEqual(makeSortie().waves[1].list,[]);
});

test('released checkpoints keep their original encounters; new saves keep earned field objectives',()=>{
  for (const route of ['sky','pier']) {
    assert.equal(sections[readSortieCheckpoint({chapter:2,wave:2,route}).wave],'commander');
    const cp={chapter:2,section:'crossing',wave:2,route,corner:1,recovered:true};
    const resumed=readSortieCheckpoint(cp);
    assert.equal(sections[resumed.wave],'crossing');
    assert.equal(resumed.corner,route==='pier'?1:0);
    assert.equal(resumed.recovered,route==='sky');
  }
  const invalid=readSortieCheckpoint({chapter:2,section:'ambush',route:'other',module:'shield'});
  assert.equal(invalid.wave,0); assert.equal(invalid.module,null);
  const cp={chapter:2,section:'supply',route:'sky',module:'magazine'};
  assert.equal(readSortieCheckpoint(cp).module,'magazine');
  assert.equal(readSortieCheckpoint({...cp,section:'launch'}).module,null);
  assert.equal(readSortieCheckpoint({...cp,module:'toString'}).module,null);
});

test('only the rescued wingman may help against the commander and the pilot finishes the duel', () => {
  const boss = { ap: 100, apMax: 100, bossName: '夜鷺' };
  const ally = Object.assign(Object.create(MechCompanion.prototype), { combat: { boss }, order: {} });
  assert.equal(ally.canSupport(boss), false);
  ally.order.supportBoss = true;
  assert.equal(ally.canSupport(boss), true);
  boss.ap = 25;
  assert.equal(ally.canSupport(boss), false);
});

test('mission pickups have visible geometry, share a material per prop and release it on retry',()=>{
  const scene=new Scene();
  for (const kind of ['recorder','magazine','shield']) {
    const prop=fieldKit(scene,kind), meshes=prop.root.children;
    assert.equal(meshes.length,kind==='recorder'?2:1);
    assert.ok(meshes.every(m=>m.material===meshes[0].material && m.geometry.attributes.color.count>0));
    assert.ok(meshes.reduce((count,m)=>count+m.geometry.attributes.position.count/3,0)<1000);
    let releases=0;
    for (const m of meshes) m.geometry.addEventListener('dispose',()=>releases++);
    meshes[0].material.addEventListener('dispose',()=>releases++);
    prop.dispose();
    assert.equal(releases,meshes.length+1);
    assert.equal(scene.children.length,0);
  }
});
