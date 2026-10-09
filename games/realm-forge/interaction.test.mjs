import test from 'node:test';
import assert from 'node:assert/strict';
import { leftDragMode, crossedDragThreshold } from './interaction.mjs';

test('only an unmodified left drag beginning on empty playfield can move the camera',()=>{
  const empty={mode:'play',enabled:true};
  assert.equal(leftDragMode(empty),'panPending');
  for(const modifier of ['shift','ctrl','alt'])assert.equal(leftDragMode({...empty,[modifier]:true}),'select');
  for(const kind of ['unit','building'])assert.equal(leftDragMode({...empty,hit:{kind}}),'select');
  assert.equal(leftDragMode({...empty,enabled:false}),'select');
});

test('map painting and active targeting keep their left drag interaction',()=>{
  assert.equal(leftDragMode({mode:'map',enabled:true}),'select');
  assert.equal(leftDragMode({mode:'units',enabled:true}),'select');
  assert.equal(leftDragMode({mode:'play',enabled:true,targeting:true}),'select');
});

test('a small click movement does not turn into a camera drag or selection box',()=>{
  const start={x:100,y:100};
  assert.equal(crossedDragThreshold(start,{x:103,y:104}),false);
  assert.equal(crossedDragThreshold(start,{x:100,y:100}),false);
  assert.equal(crossedDragThreshold(start,{x:106,y:100}),true);
  assert.equal(crossedDragThreshold(start,{x:96,y:96}),true);
});
