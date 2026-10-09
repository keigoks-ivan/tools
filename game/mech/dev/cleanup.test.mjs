import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { cleanupTargets } from '../zero/cleanup.mjs';
import { Patrols } from '../zero/patrol.js';
import { HUD } from '../zero/hud.js';
import { Contacts } from '../zero/recon.js';
import { Reinforcements } from '../reinforcements.mjs';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const enemy = (id, x = 0, y = 0, z = 0) => ({ id, pos: V(x, y, z), type: 'trooper', dead: false });
const encounter = (list, E = {}) => ({ list, E, spotted: false });
const player = (y = 0) => ({ pos: V(0, y, 0) });

test('cleanup locates one or two live required enemies immediately and drops dead targets', () => {
  for (let n = 0; n <= 4; n++) {
    const list = Array.from({ length: n }, (_, i) => enemy(i + 1, i * 7, 0, 20));
    list.push({ ...enemy(90), dead: true });
    const targets = cleanupTargets([encounter(list)], player());
    assert.equal(targets.length, n > 0 && n <= 2 ? n : 0);
    for (const t of targets) { assert(t.exact); assert.equal(t.label, '最後殘敵'); }
  }
  const list = [enemy(1), enemy(2), enemy(3)], a = encounter(list);
  list[2].dead = true;
  assert.deepEqual(cleanupTargets([a], player()).map(t => t.id), [1, 2]);
  list[0].dead = true;
  assert.deepEqual(cleanupTargets([a], player()).map(t => t.id), [2]);
  list[1].dead = true;
  assert.equal(cleanupTargets([a], player()).length, 0);
  assert.equal(cleanupTargets([], player()).length, 0);
});

test('optional patrols and undiscovered stealth remain hidden while required alarm survivors become locatable', () => {
  const required = encounter([enemy(1)]);
  const optional = encounter([enemy(2)], { operation: { bypass: true } });
  const stealth = encounter([enemy(3)], { stealth: { alarm: true } });
  assert.deepEqual(cleanupTargets([optional, stealth, required], player()).map(t => t.id), [1]);
  stealth.spotted = true; optional.spotted = true;
  assert.deepEqual(cleanupTargets([optional, stealth, required], player()).map(t => t.id), [3, 1]);
  required.list[0].dead = true;
  assert.deepEqual(cleanupTargets([optional, stealth, required], player()).map(t => t.id), [3]);
});

test('vertical markers use the current player floor, preserve exact boundaries, and use the drone height', () => {
  for (const [dy, label] of [[1.5, '最後殘敵'], [-1.5, '最後殘敵'], [1.51, '殘敵・高處 +2 m'], [-1.51, '殘敵・下方 -2 m'], [7, '殘敵・高處 +7 m'], [-6, '殘敵・下方 -6 m']]) {
    const e = enemy(1, 8, 10 + dy, 24), t = cleanupTargets([encounter([e])], player(10))[0];
    assert.equal(t.label, label); assert(Math.abs(t.altitude - dy) < 1e-9); assert.equal(t.h, 1.9);
    assert.deepEqual(t.p.toArray(), e.pos.toArray());
  }
  const drone = { ...enemy(2, 10, 5, 20), type: 'drone' };
  assert.equal(cleanupTargets([encounter([drone])], player())[0].h, .35);
  assert.equal(cleanupTargets([encounter([drone])], player(10))[0].label, '殘敵・下方 -5 m');
});

test('queued reinforcements never create phantom contacts or lose pending arrival state', () => {
  const q = new Reinforcements(), a = encounter([enemy(1), enemy(2)]);
  q.add([{ id: 3, x: 40, y: 4, z: 20 }], 0, 7); a.reinforcements = q;
  assert.deepEqual(cleanupTargets([a], player()).map(t => t.id), [1, 2]);
  assert.equal(q.pending.length, 1); assert.equal(q.tick(5, 2, d => enemy(d.id, d.x, d.y, d.z)), null);
  a.list.push(q.tick(7, 2, d => enemy(d.id, d.x, d.y, d.z)));
  assert.equal(cleanupTargets([a], player()).length, 0);
  a.list[0].dead = true;
  assert.deepEqual(cleanupTargets([a], player()).map(t => t.id), [2, 3]);
  assert.equal(q.pending.length, 0); assert.equal(a.list[2].pos.y, 4);
});

test('resident positions track mutable actors, survive streaming, and clear confirmed deaths without touching AI', () => {
  const G = { enemies: [], nextId: 1, player: player(), playerEye: V(), solid: { floorAt: () => 0, sees: () => false, pushOut: () => false } };
  const spawn = def => {
    const e = { ...enemy(G.nextId++, def.x, def.y || 0, def.z), lastSeen: V(), state: 'idle', s: { yaw: 0, update() {} }, dispose() { this.disposed = true; } };
    G.enemies.push(e); return e;
  };
  const E = { id: 'resident', enemies: [{ x: 10, z: 20 }] }, p = new Patrols(G, [E], spawn);
  p.reset(new Set()); p.update(0, true);
  const record = p.group(E)[0], a = encounter([record]), actor = record.actor;
  assert(actor); actor.pos.set(19, 6, 24); actor.state = 'combat';
  const before = cleanupTargets([a], G.player)[0];
  assert.deepEqual(before.p.toArray(), [19, 6, 24]); assert.equal(before.id, actor.id);
  actor.pos.set(23, 6, 31);
  assert.deepEqual(before.p.toArray(), [19, 6, 24], 'HUD snapshot does not alias the live actor');
  assert.deepEqual(cleanupTargets([a], G.player)[0].p.toArray(), [23, 6, 31]);
  assert.equal(actor.state, 'combat'); assert(!actor.dead);
  G.player.pos.set(200, 0, 200); p.update(.5);
  assert.equal(record.actor, null); assert(actor.disposed);
  assert.deepEqual(cleanupTargets([a], G.player)[0].p.toArray(), [23, 6, 31]);
  record.p.set(27, 6, 35);
  assert.deepEqual(cleanupTargets([a], G.player)[0].p.toArray(), [27, 6, 35]);
  G.player.pos.copy(record.p); p.update(.5);
  assert(record.actor); assert.equal(record.actor.id, before.id);
  record.actor.dead = true;
  assert.equal(cleanupTargets([a], G.player).length, 0);
  p.release(record);
  assert.equal(cleanupTargets([a], G.player).length, 0);
});

function canvasContext() {
  const state = {
    fills: [], texts: [], path: [],
    beginPath() { this.path = []; },
    arc(...args) { this.path.push(args); },
    fill() { this.fills.push({ path: [...this.path], color: this.fillStyle, alpha: this.globalAlpha }); },
    fillText(text, x, y) { this.texts.push({ text, x, y }); },
    measureText: text => ({ width: text.length * 7 }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(state, { get: (o, k) => k in o ? o[k] : () => {} });
}
function hudFixture(mode = 'foot') {
  const x = canvasContext(), camera = new THREE.PerspectiveCamera(72, 800 / 700, .05, 400);
  camera.position.set(0, 1.6, 0); camera.lookAt(0, 1.6, 20); camera.updateMatrixWorld();
  const G = {
    playing: true, player: { ...player(), yaw: 0, hp: 100, shield: 60, moveK: 0, sprintK: 0, grounded: true, dead: false },
    vm: { scoped: mode === 'scope', cur: 'rifle', W: { fov: 8, mag: 5, spread: 0, adsSpread: 0, reload: 2, name: 'Test' }, ads: 0, kick: V(), ammo: { rifle: 5 }, reloadT: -1, breath: 1, holding: false },
    scout: { active: mode === 'scout', pos: V(0, 3, 0), yaw: 0, battery: 45, ammo: 30, hp: 45, cooldown: 0 },
    ground: { occupied: mode === 'vehicle', draw() {} },
    contacts: new Contacts(), enemies: [], loot: [], nadeN: 3,
  };
  const foes = cleanupTargets([encounter([enemy(7, 12, 6, 20), enemy(8, -8, -3, 22)])], G.player);
  G.cleanupTargets = foes;
  const hud = Object.assign(Object.create(HUD.prototype), { x, cam: camera, c: { width: 800, height: 700 }, d: 1, hit: 0, notes: [], dmg: [], pins: [], foes, subQ: [], sub: null, banner: null, obj: null });
  return { G, hud, x };
}
const redBlips = x => x.fills.filter(f => f.color === '#ff4a4a' && f.path.some(p => p[2] === 4.5));

test('HUD draws precise world markers with floor labels, while radar remains available in scope, scout and vehicle modes', () => {
  for (const mode of ['foot', 'scope', 'scout', 'vehicle']) {
    const { G, hud, x } = hudFixture(mode); hud.draw(1 / 60, G);
    assert.equal(redBlips(x).length, 2, mode);
    assert(x.texts.some(t => t.text === '▲'), `${mode} has high-floor guidance`);
    assert(x.texts.some(t => t.text === '▼'), `${mode} has low-floor guidance`);
    assert(x.texts.some(t => t.text === '殘敵定位 2 名 · 90 m'), mode);
    assert.equal(x.texts.some(t => t.text === '殘敵・高處 +6 m'), mode === 'foot', `${mode} preserves world pin visibility policy`);
  }
});

test('precise radar contacts replace the same enemy last-seen blip and clamp distant enemies to a visible rim', () => {
  const { G, hud, x } = hudFixture();
  G.contacts.items.set(7, { id: 7, p: V(-60, 0, 10), fresh: false });
  G.contacts.items.set(9, { id: 9, p: V(20, 0, 10), fresh: false });
  G.cleanupTargets[0].p.set(300, 6, 120);
  hud._radar(800, 700, G);
  assert.equal(redBlips(x).length, 2);
  const ordinary = x.fills.filter(f => f.path.some(p => p[2] === 3));
  assert.equal(ordinary.length, 0, 'both ordinary stale contacts use hollow circles');
  const arcs = [];
  x.arc = (...a) => { arcs.push(a); x.path.push(a); };
  hud._radar(800, 700, G);
  assert.equal(arcs.filter(a => a[2] === 3).length, 1, 'only unrelated enemy 9 keeps its last-seen blip');
  for (const a of arcs.filter(a => a[2] === 4.5)) assert(Math.hypot(a[0], a[1]) <= 46.5 + 1e-9);
  assert.equal(G.contacts.items.size, 2, 'cleanup does not rewrite normal recon history');
});

test('exact radar blips stay on the correct screen side for every player heading', () => {
  for (const yaw of [0, .7, Math.PI / 2, Math.PI, -2]) {
    const { G, hud, x } = hudFixture(), camera = new THREE.PerspectiveCamera(72, 1, .05, 400);
    camera.rotation.order = 'YXZ'; camera.rotation.set(0, yaw + Math.PI, 0); camera.updateMatrixWorld();
    const right = V().setFromMatrixColumn(camera.matrixWorld, 0), forward = camera.getWorldDirection(V());
    G.player.yaw = yaw; G.cleanupTargets = [{ p: right.multiplyScalar(20).addScaledVector(forward, 10), id: 7, altitude: 0 }];
    hud._radar(800, 700, G);
    const arc = redBlips(x)[0].path.find(p => p[2] === 4.5);
    assert(arc[0] > 0 && arc[1] < 0, `heading ${yaw}: right/front target plots right/above`);
  }
});

test('both campaign entrypoints resolve the updated shared main and HUD with matching cache versions', async () => {
  const resolveEntry = async path => {
    const html = await readFile(new URL(path, import.meta.url), 'utf8');
    const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    const page = new URL(path, import.meta.url), base = new URL(html.match(/<base href="([^"]+)"/)?.[1] || './', page);
    const main = new URL(html.match(/<script type="module" src="([^"]+)"/)[1], base);
    const hud = new URL(imports['./hud.js'], base);
    assert(Number(main.searchParams.get('v')) >= 29); assert(Number(hud.searchParams.get('v')) >= 8);
    assert.equal(new URL(imports['../zero/main.js'], base).href, main.href);
    await readFile(new URL(main.pathname, 'file://'), 'utf8');
    await readFile(new URL(hud.pathname, 'file://'), 'utf8');
    return { main: main.href, hud: hud.href };
  };
  assert.deepEqual(await resolveEntry('../lastline/index.html'), await resolveEntry('../zero/index.html'));
});
