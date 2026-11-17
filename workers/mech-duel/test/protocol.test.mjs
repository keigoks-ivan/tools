import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { makeResumeToken, makeRoomCode, originAllowed, readPacket, roomCode, selectMech, validResumeToken } from '../src/protocol.mjs';

test('邀請與重連用各自的格式，無法將其中一種代填另一種', () => {
  const rooms = new Set(Array.from({ length: 128 }, makeRoomCode));
  assert.equal(rooms.size, 128);
  for (const room of rooms) {
    assert.equal(roomCode(room), room);
    assert.equal(validResumeToken(room), false);
  }
  const key = makeResumeToken();
  assert.equal(validResumeToken(key), true);
  assert.equal(roomCode(key), null);
  assert.equal(roomCode('../abc'), null);
});

test('白名單使用完整來源網域，開發地址只允許任意連接埠', () => {
  const hosts = 'https://tools.investmquest.com, http://localhost:*,http://127.0.0.1:*';
  assert(originAllowed('https://tools.investmquest.com', hosts));
  assert(originAllowed('http://localhost:8997', hosts));
  assert(originAllowed('http://127.0.0.1:8997', hosts));
  for (const host of [null, 'null', '//localhost:8997', 'http://localhost.evil.invalid:8997', 'http://localhost:8997/a', 'https://tools.investmquest.com.evil.invalid']) {
    assert.equal(originAllowed(host, hosts), false);
  }
});

test('控制訊息接受明確型別與遞增所用的安全整數，拒絕客戶端勝負宣告', () => {
  assert.deepEqual(readPacket('{"t":"ready","value":true,"hp":0}'), { t: 'ready', value: true });
  assert.deepEqual(readPacket('{"t":"input","seq":0,"input":{}}'), { t: 'input', seq: 0, input: {} });
  assert.deepEqual(readPacket('{"t":"rematch"}'), { t: 'rematch' });
  assert.deepEqual(readPacket('{"t":"leave"}'), { t: 'leave' });
  for (const packet of ['{"t":"ready","value":1}', '{"t":"input","seq":-1,"input":{}}', '{"t":"input","seq":1,"input":[]}', '{"t":"matchEnd","winner":0}', new Uint8Array(8), ' '.repeat(769), '{']) {
    assert.equal(readPacket(packet), null);
  }
});


test('外型只接受登錄的機體，準備或交戰後不能切換', () => {
  for(const id of ['cangyan','bailu','tiechao']) assert.deepEqual(readPacket(JSON.stringify({t:'mech',id,hp:99999})),{t:'mech',id});
  for(const id of ['unknown','../model.glb',null,1,{},['bailu']]) assert.equal(readPacket(JSON.stringify({t:'mech',id})),null);
  const record={slots:[{ready:false},{ready:false}],match:null};
  assert(selectMech(record,0,'bailu'));
  assert.equal(record.slots[0].mech,'bailu');
  assert.equal(record.slots[1].mech,undefined);
  record.slots[0].ready=true;
  assert.equal(selectMech(record,0,'tiechao'),false);
  record.slots[0].ready=false;
  for(const phase of ['countdown','fight','roundEnd']) {
    record.match={phase,players:[{hp:9000,ammo:40}],wins:[0,0]};
    const before=structuredClone(record.match);
    assert.equal(selectMech(record,0,'tiechao'),false);
    assert.deepEqual(record.match,before);
  }
  record.match.phase='matchEnd';
  const ended=structuredClone(record.match);
  assert(selectMech(record,0,'tiechao'));
  assert.deepEqual(record.match,ended);
  assert.equal(selectMech(record,9,'cangyan'),false);
});
