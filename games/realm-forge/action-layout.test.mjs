import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutActions } from './action-layout.mjs';

const cell = action => `${action.column}:${action.row}`;

test('mixed villagers and monks keep the building shortcut and expose conversion in its own cell', () => {
  const input = [
    { id:'stop', key:'g' }, { id:'build-menu', key:'q' },
    { id:'military-menu', key:'w' }, { id:'convert', key:'Q' },
    { id:'heal', key:'w' }, { id:'repair', key:'e' }
  ];
  const snapshot = JSON.stringify(input), actions = layoutActions(input);
  assert.equal(actions.find(a=>a.id==='build-menu').key,'q');
  assert.equal(actions.find(a=>a.id==='convert').key,'');
  assert.equal(actions.find(a=>a.id==='heal').key,'');
  assert.equal(actions.find(a=>a.key.toLowerCase()==='q').id,'build-menu');
  assert.equal(new Set(actions.map(cell)).size,actions.length);
  assert.ok(actions.every(a=>a.id&&a.column>=1&&a.row>=1));
  assert.equal(JSON.stringify(input),snapshot);
  assert.notEqual(actions[0],input[0]);
});

test('unkeyed hero training reserves every later shortcut before taking a cell', () => {
  const actions = layoutActions([
    {id:'train:hero'}, {id:'train:longbow',key:'q'},
    {id:'train:trebuchet',key:'w'}, {id:'rally',key:'t'},
    {id:'research:conscription',key:'c'}
  ]);
  assert.deepEqual(actions.map(cell),['3:1','1:1','2:1','5:1','3:3']);
  assert.equal(actions[0].key,'');
});

test('monks and packed siege keep conversion Q while packing remains clickable', () => {
  const actions = layoutActions([{id:'convert',key:'q'},{id:'pack',key:'q'}]);
  assert.equal(actions[0].key,'q');assert.equal(actions[1].key,'');
  assert.notEqual(cell(actions[0]),cell(actions[1]));
  assert.equal(actions[1].id,'pack');
});

test('a disabled declared shortcut keeps its slot and does not silently change action', () => {
  const actions = layoutActions([{id:'build-menu',key:'q',disabled:true},{id:'convert',key:'q',disabled:false}]);
  assert.equal(actions[0].key,'q');assert.equal(actions[0].disabled,true);
  assert.equal(actions[1].key,'');assert.equal(actions[1].disabled,false);
});

test('more than fifteen actions extend to another row without overlapping existing shortcuts', () => {
  const keys='qwertasdfgzxcvb', input=[...keys].map(key=>({id:key,key}));
  input.unshift({id:'hero-one'},{id:'hero-two'},{id:'town-bell',key:'B'});
  const actions=layoutActions(input);
  assert.equal(new Set(actions.map(cell)).size,input.length);
  assert.deepEqual(actions.slice(0,3).map(cell),['1:4','2:4','5:3']);
  assert.equal(actions.find(a=>a.id==='b').key,'');
  assert.equal(actions.find(a=>a.id==='town-bell').key,'B');
});

test('an empty panel has no cells and non-grid shortcuts remain available', () => {
  assert.deepEqual(layoutActions([]),[]);
  const actions=layoutActions([{id:'bell',key:'h'},{id:'stop',key:'g'}]);
  assert.equal(actions[0].key,'h');assert.equal(cell(actions[0]),'1:1');
  assert.equal(cell(actions[1]),'5:2');
});

test('a refreshed action panel discards stale cell positions when its shortcuts change', () => {
  const first=layoutActions([{id:'build',key:'q'},{id:'convert',key:'q'}]);
  const changed=first.map(a=>a.id==='convert'?{...a,key:'w'}:a);
  const next=layoutActions(changed);
  assert.deepEqual(next.map(cell),['1:1','2:1']);
  assert.equal(new Set(next.map(cell)).size,next.length);
});
