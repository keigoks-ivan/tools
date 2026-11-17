import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { makeResumeToken, makeRoomCode, originAllowed, readPacket, roomCode, validResumeToken } from '../src/protocol.mjs';

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
