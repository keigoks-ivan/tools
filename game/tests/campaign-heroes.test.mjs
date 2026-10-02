import assert from 'node:assert/strict';
import test from 'node:test';
import { Arena, MUSOU_CHAIN } from '../2d/combat.js?v=20261002b';
import { HEROES, heroFor } from '../3d-next/heroes.js?v=20261002b';
import { Campaign, CHAPTERS, chapterTuning } from '../3d-next/campaign.js?v=20261002b';
import { MarchDirector, TUNING } from '../3d-next/march.js?v=20261002b';

const advance = (arena, seconds, input = {}) => {
  for (let t = 0; t < seconds; t += 1 / 60) arena.update(1 / 60, input);
};
const makeArena = heroProfile => new Arena({ musou: true, warriorMode: true, musouFlurry: true, director: true, heroProfile });

test('character choice changes real health, movement, attack reach and damage; reset retains it', () => {
  const travel = {};
  for (const hero of Object.values(HEROES)) {
    const arena = makeArena(hero);
    assert.equal(arena.hero.maxHp, hero.maxHp);
    const start = arena.hero.x;
    advance(arena, 0.5, { x: 1 }); travel[hero.id] = arena.hero.x - start;
    arena.hero.action = 'idle'; arena.hero.facing = 0;
    const target = arena.spawn('grunt', arena.hero.x + 190, arena.hero.y, { hp: 100, fixed: true, ai: 'external' });
    arena._startAttack('attack');
    advance(arena, hero.chain[0].hits[0] + 0.02);
    assert.equal(target.hp, hero.id === 'azure' ? 88 : 100, `${hero.id}: expected reach / damage`);
    arena.hero.hp = 1; arena.reset(); assert.equal(arena.hero.hp, hero.maxHp);
  }
  assert.ok(travel.azure < travel.violet && travel.violet < travel.amber);
  assert.equal(makeArena(null).attack, null);
  const legacy = makeArena(null); legacy._startAttack('attack');
  assert.equal(legacy.attack.duration, MUSOU_CHAIN[0].duration);
  assert.equal(heroFor('invalid'), HEROES.violet);
});

test('every combo and heavy branch is playable and uses a real animation clip', () => {
  const clips = new Set(['combo1', 'combo2', 'combo3', 'combo4', 'combo5', 'slash2', 'slash3', 'slash4', 'heavy', 'heavyfin', 'azureSweep', 'azureRise', 'azureSlam', 'azureGuard', 'jadeShot', 'jadeDouble', 'jadeFan', 'jadeBurst', 'jadeSpread', 'jadePierce', 'jadeGuard']);
  for (const hero of Object.values(HEROES)) {
    const arena = makeArena(hero);
    for (let i = 0; i < hero.chain.length; i++) {
      arena._startAttack('attack');
      assert.equal(arena.hero.combo, i + 1);
      assert.equal(arena.attack.radius, hero.chain[i].radius);
      assert.ok(clips.has(arena.attack.clip || `combo${i + 1}`));
      if (hero.charges[i]) {
        arena._startAttack('heavy', true);
        assert.equal(arena.attack.name, hero.charges[i].name);
        assert.ok(clips.has(arena.attack.clip));
        arena.hero.action = 'attack'; arena.hero.combo = i + 1;
      }
    }
    arena._startAttack('attack'); assert.equal(arena.hero.combo, 1);
    arena._startAttack('heavy'); assert.equal(arena.attack.radius, hero.heavy.radius);
    arena.hero.action = 'idle'; arena.dodgeEndAt = arena.time;
    arena._startAttack('attack'); assert.equal(arena.attack.name, hero.counter.name);
  }
});

test('each character special completes once, with distinct choreography, including low HP', () => {
  const counts = new Set();
  for (const hero of Object.values(HEROES)) for (const low of [false, true]) {
    const arena = makeArena(hero);
    if (low) arena.hero.hp = hero.maxHp * 0.2;
    arena.hero.energy = 100;
    arena._startSpecial();
    const profile = hero.flurry[low ? 'true' : 'standard'];
    assert.equal(arena.attack.profile.radius, profile.radius);
    advance(arena, profile.duration + 0.1);
    const events = arena.drainEvents();
    assert.equal(events.filter(e => e.type === 'swing' && e.flurry).length, profile.swings);
    assert.equal(events.filter(e => e.type === 'musouFinish').length, 1);
    assert.equal(events.filter(e => e.type === 'musouEnd').length, 1);
    assert.equal(arena.hero.energy, 0);
    assert.equal(arena.hero.action, 'idle');
    if (!low) counts.add(`${profile.swings}:${profile.duration}:${profile.radius}`);
  }
  assert.equal(counts.size, Object.keys(HEROES).length);
});

test('chapter settings are independent, preserve co-op defaults, and each boss can clear', () => {
  const before = JSON.stringify(TUNING);
  for (let index = 0; index < CHAPTERS.length; index++) {
    const tuning = chapterTuning(index);
    const march = new MarchDirector({ tuning, heroProfile: HEROES.azure });
    assert.equal(march.hud().objective, `擊倒妖兵 0／${tuning.market.goal}`);
    march.skipTo(3);
    const boss = march.arena.enemies.find(e => e.kind === 'boss');
    assert.equal(boss.name, CHAPTERS[index].boss);
    assert.equal(boss.maxHp, tuning.boss.hp);
    march.arena._damageEnemy(boss, 9999, 'heavy'); march.update(1 / 60, {});
    assert.equal(march.state, 'clear'); assert.equal(march.arena.state, 'win');
    assert.equal(march.result.maxHp, 125);
    march.reset(); assert.equal(march.state, 'play'); assert.equal(march.arena.hero.hp, 125);
    tuning.boss.hp = 1;
    assert.notEqual(chapterTuning(index).boss.hp, 1);
  }
  assert.equal(JSON.stringify(TUNING), before);
  const campaign = new Campaign();
  for (let i = 0; i < CHAPTERS.length; i++) {
    assert.equal(campaign.index, i); campaign.complete({ kills: i + 1 });
    assert.equal(campaign.next(), i < CHAPTERS.length - 1);
  }
  assert.equal(campaign.results.length, CHAPTERS.length); assert.equal(campaign.hasNext, false);
  campaign.restart(); assert.equal(campaign.index, 0); assert.equal(campaign.results.length, 0);
});

test('all character / chapter combinations finish through every segment without exceeding the enemy budget', async () => {
  const { runMarchBot } = await import('../3d-next/march-bot.js');
  for (const hero of Object.values(HEROES)) for (let index = 0; index < CHAPTERS.length; index++) {
    const march = new MarchDirector({ seed: 17, tuning: chapterTuning(index), heroProfile: hero });
    let peak = 0;
    const result = runMarchBot(march, { onFrame: m => { peak = Math.max(peak, m.alive()); } });
    assert.equal(result.state, 'clear', `${hero.id} chapter ${index + 1}: ${result.state} in segment ${march.segmentIndex}`);
    assert.deepEqual(result.trace.map(entry => entry.segment), [1, 2, 3]);
    assert.ok(peak <= march.cap);
    assert.ok(result.time < 900);
  }
});

test('mobile enemy budget still permits each new chapter to finish', async () => {
  const { runMarchBot } = await import('../3d-next/march-bot.js');
  for (const hero of Object.values(HEROES)) for (let index = 0; index < CHAPTERS.length; index++) {
    const march = new MarchDirector({ seed: 17, mobile: true, tuning: chapterTuning(index), heroProfile: hero });
    const result = runMarchBot(march, { onFrame: m => assert.ok(m.alive() <= m.cap) });
    assert.equal(result.state, 'clear', `${hero.id} mobile chapter ${index + 1}`);
  }
});

test('weapon variants keep the authored skeleton and restore the original geometry when reselected', async () => {
  const { readFile } = await import('node:fs/promises');
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { createHeroEquipment } = await import('../3d-next/hero-equipment.js');
  globalThis.ProgressEvent = class { constructor(type, init) { Object.assign(this, { type }, init); } };
  const bytes = await readFile(new URL('../assets/heroes/swordswoman-v4.glb', import.meta.url));
  const size = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + size).toString());
  const stripTextures = value => {
    for (const key of Object.keys(value)) {
      if (/texture$/i.test(key)) delete value[key];
      else if (value[key] && typeof value[key] === 'object') stripTextures(value[key]);
    }
  };
  for (const material of json.materials) stripTextures(material);
  json.images = []; json.textures = [];
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + size).toString('base64')}`;
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  const { createGreatswordClips, createArcherClips } = await import('../3d-next/hero-motion.js');
  gltf.animations.push(...createGreatswordClips(THREE, gltf.scene, gltf.animations), ...createArcherClips(THREE, gltf.scene, gltf.animations));
  const sword = gltf.scene.getObjectByName('Hero_sword');
  const source = sword.geometry;
  const originals = source.attributes.position.array.slice();
  const equipment = createHeroEquipment(THREE, gltf.scene, sword);
  const skeleton = sword.skeleton;

  const mixer = new THREE.AnimationMixer(gltf.scene);
  for (const hero of Object.values(HEROES)) {
    equipment.apply(hero);
    assert.equal(sword.skeleton, skeleton);
    assert.deepEqual(sword.geometry.attributes.skinIndex.array, source.attributes.skinIndex.array);
    assert.deepEqual(sword.geometry.attributes.skinWeight.array, source.attributes.skinWeight.array);
    const leftBlade = gltf.scene.getObjectByName('amber_J_Bip_L_Hand_weapon');
    assert.equal(!!leftBlade?.visible, hero.id === 'amber');
    for (const move of [...hero.chain, ...hero.charges, hero.heavy, hero.counter]) {
      const clip = move.clip || (move === hero.heavy ? 'charge' : `combo${hero.chain.indexOf(move) + 1}`);
      assert.ok(gltf.animations.some(animation => animation.name === clip), `${hero.id}: missing ${clip}`);
    }
    for (const clip of gltf.animations) {
      mixer.stopAllAction(); mixer.clipAction(clip).reset().play(); mixer.update(clip.duration * 0.5);
      equipment.update();
      gltf.scene.updateMatrixWorld(true); skeleton.update();
      const point = new THREE.Vector3();
      for (let vertex = 0; vertex < sword.geometry.attributes.position.count; vertex++) {
        sword.getVertexPosition(vertex, point);
        assert.ok(point.toArray().every(Number.isFinite), `${hero.id}/${clip.name}: invalid animated weapon`);
        sword.localToWorld(point);
        const hand = gltf.scene.getObjectByName('J_Bip_R_Hand').getWorldPosition(new THREE.Vector3());
        assert.ok(point.distanceTo(hand) < 2.5, `${hero.id}/${clip.name}: weapon escaped its rig`);
      }
      const head = gltf.scene.getObjectByName('J_Bip_C_Head').getWorldPosition(new THREE.Vector3());
      gltf.scene.getObjectByName(`${hero.id}_atelier_hair`).traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 257) {
          mesh.getVertexPosition(vertex, point); mesh.localToWorld(point);
          assert.ok(point.toArray().every(Number.isFinite), `${hero.id}/${clip.name}: invalid animated hair`);
          assert.ok(point.distanceTo(head) < 1, `${hero.id}/${clip.name}: hair escaped the head`);
        }
      });
      const weapon = gltf.scene.getObjectByName(`${hero.id}_J_Bip_${hero.id === 'jade' ? 'L' : 'R'}_Hand_weapon`);
      assert.ok(new THREE.Box3().setFromObject(weapon).getSize(new THREE.Vector3()).length() < 3, `${hero.id}/${clip.name}: invalid weapon bounds`);
    }
  }
  equipment.apply(HEROES.violet);
  // Battle FX replaces the invisible sampling sword's material after equipment
  // setup. Reselecting a hero must tolerate that externally owned material.
  sword.material = sword.material.clone();
  assert.doesNotThrow(() => equipment.apply(HEROES.azure));
  equipment.apply(HEROES.violet);
  const restored = sword.geometry.attributes.position.array;
  for (let i = 0; i < originals.length; i++) assert.ok(Math.abs(restored[i] - originals[i]) < 1e-6);
  assert.deepEqual(source.attributes.position.array, originals, 'source asset geometry was changed');
});


test('a dual-blade dash can still hit an enemy pinned to the same map corner', () => {
  const arena = makeArena(HEROES.amber);
  arena.hero.x = arena.bounds.minX; arena.hero.y = arena.bounds.minY; arena.hero.facing = Math.PI;
  const enemy = arena.spawn('grunt', arena.hero.x, arena.hero.y, { hp: 100, ai: 'external', fixed: true });
  arena._startAttack('heavy'); advance(arena, 0.4);
  assert.ok(enemy.hp < 100, 'overlapping enemies must not become immune to directional dash attacks');
});
