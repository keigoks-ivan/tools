import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeys, productionKey, menuKey, orderHint } from './controls.mjs';
import { CIV_UNITS } from './civilization.mjs';

test('Definitive grid uses Q Q for houses, Q A for farms, H Q for villagers', () => {
  assert.equal(menuKey('definitive'), 'q');
  assert.equal(buildKeys('definitive', 'economy').q, 'house');
  assert.equal(buildKeys('definitive', 'economy').a, 'farm');
  assert.equal(productionKey('definitive', CIV_UNITS.find(u => u.id === 'villager')), 'q');
});
test('classic profile retains B E houses and H C villagers', () => {
  assert.equal(menuKey('classic'), 'b');
  assert.equal(buildKeys('classic', 'economy').e, 'house');
  assert.equal(productionKey('classic', CIV_UNITS.find(u => u.id === 'villager')), 'c');
});
test('Definitive archer and skirmisher production matches the official grid', () => {
  assert.equal(productionKey('definitive', CIV_UNITS.find(u => u.id === 'archer')), 'q');
  assert.equal(productionKey('definitive', CIV_UNITS.find(u => u.id === 'skirmisher')), 'w');
});
test('market Q trains a trade cart and trade orders show the returning gold cargo',()=>{
  assert.equal(productionKey('definitive',CIV_UNITS.find(u=>u.id==='trade-cart')),'q');
  assert.equal(orderHint({order:{type:'trade',leg:'outbound',cargo:0},queued:[]}),'前往貿易市集');
  assert.equal(orderHint({order:{type:'trade',leg:'return',cargo:34},queued:[]}),'運送 34 黃金 · 返回我方市集');
});
test('order feedback distinguishes idle, queued and unreachable commands', () => {
  assert.equal(orderHint({ order: null, queued: [] }), '閒置');
  assert.equal(orderHint({ order: { type: 'build' }, queued: [{}, {}] }), '建造 · 等待 2 道指令');
  assert.equal(orderHint({ failed: true }), '無法到達目標');
  assert.equal(orderHint({ garrison: 1, order: null }), '駐軍中');
});

test('modified punctuation and numbers retain the underlying command key',async()=>{
  const {eventKey}=await import('./controls.mjs');
  assert.equal(eventKey({code:'Period',key:'>'}),'.');
  assert.equal(eventKey({code:'Comma',key:'<'}),',');
  assert.equal(eventKey({code:'Digit1',key:'!'}),'1');
  assert.equal(eventKey({code:'KeyQ',key:'Q'}),'q');
});
