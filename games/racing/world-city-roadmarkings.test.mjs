import assert from 'node:assert/strict';
import test from 'node:test';
import {register} from 'node:module';
import * as THREE from './vendor/three.module.js';
import {TRACKS} from './track.mjs';
register('data:text/javascript,'+encodeURIComponent(`let three;export function initialize(data){three=data.three;}export function resolve(specifier,context,next){return next(specifier==='three'?three:specifier,context);}`),{parentURL:import.meta.url,data:{three:new URL('./vendor/three.module.js',import.meta.url).href}});
const {CITY_ROAD_PROFILES,addCityRoadMarkings}=await import('./world-city-roadmarkings.js');

for(const id of Object.keys(CITY_ROAD_PROFILES))test(`${id}: regional paint follows road surface without a new texture`,()=>{
  const track=TRACKS[id],white={name:'white'},yellow={name:'yellow'},parts=[];
  const result=addCityRoadMarkings({track,white,yellow,setFrame(){},bake(geometry,mat){parts.push({geometry,mat});}});
  if(id==='taipei'){assert.equal(parts.length,0);assert.equal(result.triangles,0);return;}
  assert.ok(parts.length>0);assert.ok(result.triangles<18000);
  let bytes=0,yellowCentre=0,yellowEdge=0;
  for(const {geometry,mat} of parts){
    for(const value of Object.values(geometry.attributes))bytes+=value.array.byteLength;bytes+=geometry.index.array.byteLength;
    const p=geometry.attributes.position,n=geometry.attributes.normal;assert.equal(p.count,n.count);
    for(let i=0;i<p.count;i++){
      const near=track.nearest(p.getX(i),p.getZ(i));assert.ok(Number.isFinite(p.getY(i)));assert.ok(Math.abs(p.getY(i)-near.y-.064)<.065,`${id} road grade`);
      if(mat===yellow){if(near.distance<.5)yellowCentre++;if(near.distance>track.width*.35)yellowEdge++;}
    }
    assert.ok(Array.from(n.array).every(Number.isFinite));geometry.dispose();
  }
  assert.ok(bytes<1200000,'street paint geometry stays within a small selected-track allocation');
  if(CITY_ROAD_PROFILES[id].centre.includes('yellow'))assert.ok(yellowCentre>0);
  if(CITY_ROAD_PROFILES[id].edge==='double-yellow'){assert.ok(yellowEdge>0);assert.equal(yellowCentre,0,'UK yellow kerb paint must not become an American yellow centre line');}
});
