import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS } from './track.mjs';
import { URBAN_PROFILES, getUrbanJunctions, urbanJunctionAt, addCityUrbanDetails } from './world-city-urban-details.js';
import { cityDistrictAt } from './world-city-districts.mjs';
import { cityGroundLevel } from './world-cities.js';

const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})}, {get:(o,k)=>o[k]||(()=>{})});
globalThis.document={createElement:()=>({getContext:()=>context})};

test('side streets open on straight occupied districts and wrap over the finish line',()=>{
  for(const city of Object.keys(URBAN_PROFILES)) {
    const track=TRACKS[city];
    for(const j of getUrbanJunctions(track)) {
      assert.ok(Math.abs(j.center.curvature)<=.005);
      for(const side of j.sides)assert.ok(cityDistrictAt(track,j.s,side).density>.4);
      assert.equal(urbanJunctionAt(track,j.s+track.length),j);
      assert.equal(urbanJunctionAt(track,j.s-track.length),j);
      assert.equal(urbanJunctionAt(track,j.s+j.width),null);
    }
  }
  assert.deepEqual(getUrbanJunctions(TRACKS.taipei),[],'Taipei retains its own authored intersections');
  assert.deepEqual(getUrbanJunctions(TRACKS.costa),[]);
});

test('street life clears driving, buildings, landmark reservations and open water',()=>{
  for(const city of Object.keys(URBAN_PROFILES)) {
    const scene=new THREE.Scene(),track=TRACKS[city],m=new THREE.MeshStandardMaterial();
    const p=track.sample(32),buildings=[{x:p.x+p.nx*(track.wallOffset+3.7),z:p.z+p.nz*(track.wallOffset+3.7),w:10,d:10,yaw:0}];
    const reserved=[{x:track.spawn.x,z:track.spawn.z,radius:40}];
    const result=addCityUrbanDetails({scene,track,mobile:true,groundHeight:()=>4.65,materials:{concrete:m,shoulder:m},buildings,reserved,cityGroundLevel});
    assert.ok(result.group.userData.props.length>10);
    for(const prop of result.group.userData.props){
      assert.ok(track.nearest(prop.x,prop.z).distance>=track.wallOffset+1);
      assert.equal(cityGroundLevel(city,prop.x,prop.z),4.65);
      assert.ok(Math.hypot(prop.x-reserved[0].x,prop.z-reserved[0].z)>=40+prop.radius);
      assert.ok(Math.abs(prop.x-buildings[0].x)>=5+prop.radius||Math.abs(prop.z-buildings[0].z)>=5+prop.radius);
    }
    assert.ok(result.group.userData.wearCount>15);
    for(const mesh of result.group.children){
      const geo=mesh.geometry;
      for(const attribute of Object.values(geo.attributes))assert.ok(attribute.array.every(Number.isFinite));
      if(mesh.material.userData.ground&&!mesh.material.transparent&&mesh.material.metalness===0) {
        const n=geo.attributes.normal;
        for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>0,'both road sides have upward-facing ground');
      }
    }
    result.setQuality('low');assert.ok(result.group.children.every(mesh=>!mesh.castShadow));
    result.setQuality('high');assert.ok(result.group.children.some(mesh=>mesh.castShadow));
    result.group.children.forEach(mesh=>{mesh.geometry.dispose();mesh.material.dispose();mesh.material.map?.dispose();});m.dispose();
  }
});
