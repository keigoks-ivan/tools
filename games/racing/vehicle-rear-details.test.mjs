import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from './vendor/three.module.js';
import {REAR_DETAIL_PROFILES,addVehicleRearDetails} from './vehicle-rear-details.js';

globalThis.document={createElement(){return {width:0,height:0,getContext(){return new Proxy({}, {get(target,key){return target[key]||(()=>{});},set(target,key,value){target[key]=value;return true;}});}};}};

for(const mobile of [true,false])for(const vehicle of Object.keys(REAR_DETAIL_PROFILES))test(`${vehicle}/${mobile?'mobile':'desktop'}: rear details stay attached and share one small atlas`,()=>{
  const chassis=new THREE.Group(),materials=new Set(),textures=new Set(),baseY=.46;
  let queries=0;
  const surface=(x,y)=>-2.34+.22*x*x+.04*(y-.7)**2;
  const result=addVehicleRearDetails({vehicle,mobile,baseY,chassis,black:new THREE.MeshStandardMaterial(),mesh(geometry,mat,parent,name){const node=new THREE.Mesh(geometry,mat);node.name=name;parent.add(node);return node;},material(name,Type,options){const mat=new Type(options);mat.name=name;materials.add(mat);return mat;},registerTexture(texture){textures.add(texture);},fasciaPoint(x,y){queries++;return [x,y-baseY,surface(x,y)];}});
  assert.equal(queries,35);assert.equal(result.fitQueries,35);assert.equal(textures.size,1);assert.equal(materials.size,1);
  assert.equal(result.texturePixels,mobile?32768:131072);assert.ok(result.triangles<300);
  for(const node of chassis.children){
    const position=node.geometry.attributes.position,uv=node.geometry.attributes.uv;
    assert.equal(position.count,uv.count);assert.equal(node.castShadow,false);
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),y=position.getY(i)+baseY,z=position.getZ(i),gap=surface(x,y)-z;
      assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));assert.ok(gap>.003&&gap<.025,`${node.name} gap ${gap}`);
      assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1&&uv.getY(i)>=0&&uv.getY(i)<=1);
    }
  }
  let disposed=0;for(const texture of textures){texture.addEventListener('dispose',()=>disposed++);texture.dispose();}assert.equal(disposed,1);
  for(const node of chassis.children)node.geometry.dispose();for(const mat of materials)mat.dispose();
});

test('X3 keeps its bespoke plate recess and creates no duplicate resources',()=>{
  const result=addVehicleRearDetails({vehicle:'bmwX3'});assert.equal(result.meshes,0);assert.equal(result.texturePixels,0);
});
