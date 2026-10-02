import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomLoadout } from '../3d-next/net/loadout.js';
import { encodeState, decodeState, decodeLobbyState, encodeLobbyState } from '../3d-next/net/protocol.js';
import { cleanSignal, cleanState, cleanPayload } from '../../workers/coop-relay/src/logic.js';

function lobby() {
  const clients = new Map(), messages = [], launches = new Map();
  function add(id, host = 'A') {
    const listeners = new Map();
    const client = { you: id, host, room: 'TEST', members: new Map(), on(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); }, emit(type, ...args) { for (const fn of listeners.get(type) || []) fn(...args); }, send(type, d) { if (type === 's') messages.push({ id, d: decodeLobbyState(cleanState(d)) }); else if (type === 'e' && this.host === id) messages.push({ id, d: cleanPayload(d).loadout }); return true; } };
    const control = new RoomLoadout({ client, onLaunch: options => { if (!launches.has(id)) launches.set(id, []); launches.get(id).push(options); } });
    clients.set(id, { client, control });
    for (const { client: c } of clients.values()) c.members = new Map([...clients.keys()].map(key => [key, { id: key, name: key }]));
    client.emit('welcome');
    for (const [other, { client: c }] of clients) if (other !== id) c.emit('join', { id, name: id });
    return control;
  }
  function flush() { let budget = 1000; while (messages.length) { assert.ok(budget-- > 0, 'lobby signal loop'); const { id, d } = messages.shift(); if (d) for (const [other, { client }] of clients) if (other !== id) client.emit('signal', id, d); } }
  return { add, flush, clients, launches, messages };
}

test('three players choose independent weapons and launch the host chapter only after all are ready', () => {
  const hub = lobby(), a = hub.add('A'), b = hub.add('B'), c = hub.add('C'); hub.flush();
  a.setCharacter('azure'); b.setCharacter('amber'); c.setCharacter('violet'); a.setChapter(3); hub.flush();
  a.prepare(); b.prepare(); hub.flush(); assert.equal(hub.launches.size, 0);
  c.prepare(); hub.flush();
  assert.deepEqual([...hub.launches.values()].map(runs => runs[0]), [{ character: 'azure', chapter: 3 }, { character: 'amber', chapter: 3 }, { character: 'violet', chapter: 3 }]);
  a.publish(); hub.flush(); assert.ok([...hub.launches.values()].every(runs => runs.length === 1), 'repeated run announcements must not reset battles');
});

test('chapter revisions reject readiness from the previous setup and guests cannot choose the chapter or launch', () => {
  const hub = lobby(), a = hub.add('A'), b = hub.add('B'); hub.flush();
  b.prepare(); hub.flush(); const old = b.revision;
  a.setChapter(4);
  hub.clients.get('A').client.emit('signal', 'B', { ready: 1, rv: old, lv: 1, go: Date.now() });
  a.prepare(); hub.flush(); assert.equal(hub.launches.size, 0); assert.equal(a.chapter, 4); assert.equal(b.chapter, 4);
  assert.equal(b.ready, false); assert.equal(b.setChapter(2), false);
  b.prepare(); hub.flush(); assert.equal(hub.launches.size, 2);
});

test('late joiners can pick a character and join the current run without restarting existing players', () => {
  const hub = lobby(), a = hub.add('A'); hub.flush(); a.setChapter(2); a.prepare(); hub.flush();
  a.currentChapter = () => 4;
  const b = hub.add('B'); hub.flush(); assert.equal(b.chapter, 4); assert.equal(hub.launches.has('B'), false);
  b.setCharacter('amber'); b.prepare(); hub.flush();
  assert.deepEqual(hub.launches.get('B'), [{ character: 'amber', chapter: 4 }]); assert.equal(hub.launches.get('A').length, 1);
});

test('new host retains the lobby selection and failed loading can retry the same run', () => {
  const hub = lobby(), a = hub.add('A'), b = hub.add('B'); hub.flush(); a.setChapter(3); hub.flush();
  for (const { client } of hub.clients.values()) { client.host = 'B'; client.emit('host', 'B'); } hub.flush();
  assert.equal(b.isHost, true); assert.equal(b.chapter, 3);
  a.prepare(); b.prepare(); hub.flush(); b.failed(); hub.flush(); b.prepare(); hub.flush();
  assert.equal(hub.launches.get('B').length, 2); assert.equal(hub.launches.get('A').length, 1);
});

test('relay preserves selected character and ultimate timing while dropping malformed metadata', () => {
  for (const character of ['violet', 'azure', 'amber', 'jade']) {
    const encoded = JSON.parse(encodeState({ x: 1, y: 2, z: 3, yaw: 0, character, musou: 1.2346 }, 300));
    const snap = decodeState(cleanState(encoded.d)); assert.equal(snap.character, character); assert.equal(snap.musou, 1.235);
  }
  const bad = cleanState({ x: 0, y: 0, z: 0, r: 0, ch: '<bad>', ms: Infinity }); assert.equal(bad.ch, undefined); assert.equal(bad.ms, undefined);
  assert.deepEqual(decodeLobbyState(cleanState(encodeLobbyState('azure', true, 42))), { ch: 'azure', ready: 1, rv: 42 });
  assert.deepEqual(cleanPayload({ loadout: { ch: 'azure', lv: 4, ready: 1, rv: 42, go: 42 } }).loadout, { ch: 'azure', lv: 4, ready: 1, rv: 42, go: 42 });
  assert.equal(cleanSignal({ ch: 'invalid', lv: 5, ready: 2, rv: -1, go: Infinity }), null);
});


test('all animated hero states and lobby variants pass the unchanged production relay allowlist', () => {
  const clips = ['idle', 'run', 'combo1', 'combo2', 'combo3', 'combo4', 'combo5', 'charge', 'heavyfin', 'musou', 'musouFlurry', 'jump', 'dead'];
  for (const character of ['violet', 'azure', 'amber', 'jade']) for (const anim of clips) for (const musou of [-1, 0, 1.235, 10]) {
    const packet = JSON.parse(encodeState({ character, anim, musou, x: 0, y: 0, z: 0, yaw: 0, time: 0.4 }, 42));
    assert.ok(/^[\w-]{1,24}$/.test(packet.d.a), packet.d.a);
    const result = decodeState(cleanState(packet.d));
    assert.equal(result.character, character); assert.equal(result.anim, anim); assert.equal(result.musou, musou); assert.equal(result.time, 0.4);
    assert.equal(result.ch, undefined); assert.equal(result.ms, undefined);
  }
  assert.equal(decodeLobbyState({ a: 'loadout_invalid_1', c: 42 }), null);
  assert.equal(decodeLobbyState({ a: 'loadout_azure_1', c: -1 }), null);
});


test('client routes lobby envelopes separately from gameplay and rejects configuration from a guest', async () => {
  const { CoopClient } = await import('../3d-next/net/client.js');
  const client = new CoopClient({ relay: 'http://localhost:8788', storage: null, now: () => 42 });
  client.you = 'B'; client.host = 'A'; client.members = new Map(['A', 'B', 'C'].map(id => [id, { id, name: id }]));
  const signals = [], states = [], worlds = [];
  client.on('signal', (id, d) => signals.push({ id, d })); client.on('state', (id, d) => states.push({ id, d })); client.on('world', d => worlds.push(d));
  const configuration = { ch: 'azure', ready: 1, rv: 42, lv: 4, go: 42 };
  client.handle(JSON.stringify({ t: 'e', p: 'C', d: { loadout: configuration } })); assert.equal(signals.length, 0);
  client.handle(JSON.stringify({ t: 'e', p: 'A', d: cleanPayload({ loadout: configuration }) }));
  client.handle(JSON.stringify({ t: 's', p: 'A', d: cleanState(encodeLobbyState('azure', true, 42)) }));
  assert.equal(signals.length, 2); assert.equal(states.length, 0); assert.equal(worlds.length, 0);
  const packet = JSON.parse(encodeState({ character: 'azure', anim: 'combo3', x: 0, y: 0, z: 0, yaw: 0 }, 42));
  client.handle(JSON.stringify({ ...packet, p: 'A', d: cleanState(packet.d) }));
  assert.equal(states[0].d.character, 'azure'); assert.equal(states[0].d.anim, 'combo3');
  client.handle(JSON.stringify({ t: 'e', p: 'A', d: { q: 'A:1', cp: 4, n: [] } })); assert.equal(worlds.length, 1);
});

test('four players can independently choose the new archer and share the host chapter',()=>{
  const hub=lobby(),a=hub.add('A'),b=hub.add('B'),c=hub.add('C'),d=hub.add('D');hub.flush();
  a.setCharacter('jade');b.setCharacter('azure');c.setCharacter('amber');d.setCharacter('violet');a.setChapter(4);hub.flush();
  for(const control of [a,b,c,d])control.prepare();hub.flush();
  assert.deepEqual([...hub.launches.values()].map(runs=>runs[0]),[{character:'jade',chapter:4},{character:'azure',chapter:4},{character:'amber',chapter:4},{character:'violet',chapter:4}]);
});

test('every player may choose the same hero; each launches with it and sees teammates on that hero', () => {
  const hub = lobby(), players = ['A', 'B', 'C', 'D'].map(id => hub.add(id)); hub.flush();
  for (const player of players) assert.equal(player.setCharacter('azure'), true);
  hub.flush();
  for (const player of players) for (const other of ['A', 'B', 'C', 'D']) assert.equal(player.choice(other).character, 'azure');
  for (const player of players) player.prepare();
  hub.flush();
  assert.deepEqual([...hub.launches.values()].map(runs => runs[0].character), ['azure', 'azure', 'azure', 'azure']);
});
