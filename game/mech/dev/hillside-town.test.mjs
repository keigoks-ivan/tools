import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldHeight, routeDistance } from '../battlefields.js';
import { KOBE_RELIEF } from '../kobe-relief.mjs';
import { BATTLE_ROADS, LOCAL_LINKS, RESIDENTIAL_LANES, townLots } from '../hillside-town.mjs';

test('residential parcels leave space for the convoy, their neighbours and their own access lanes',()=>{
  const lots=townLots();
  assert.deepEqual(townLots(),lots);
  assert(lots.length>=100&&lots.length<=220);
  for(const [i,lot] of lots.entries()){
    const {x,z,w,d}=lot;
    for(const road of BATTLE_ROADS)assert(routeDistance(x,z,road)>Math.hypot(w,d)/2+18);
    for(const road of [...LOCAL_LINKS,...RESIDENTIAL_LANES]){
      for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2])assert(routeDistance(x+dx,z+dz,road)>2.6);
    }
    for(const other of lots.slice(0,i)){
      assert(Math.abs(other.x-x)>=(other.w+w)/2+2.2||Math.abs(other.z-z)>=(other.d+d)/2+2.2);
    }
  }
});

test('the hillside keeps a shallow residential approach, joins the elevation survey, and meets the world boundary',()=>{
  const relief=new Uint16Array(KOBE_RELIEF.size**2).fill(265);
  const at=(x,z,data=relief)=>fieldHeight(x,z,'hillside',{relief:data},31);
  for(const x of [-500,-250,0,250]){
    assert.equal(at(x,0),at(x,104));
    for(let z=-160;z>=-408;z-=8)assert(Math.abs(at(x,z)-at(x,z-8))<1.2);
    assert.equal(at(x,-1400),265);
    assert.equal(at(x,-5000),31);
    assert(Number.isFinite(at(x,-1400,null)));
  }
});
