import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

const source=await readFile(new URL('../3d-next/battle.js',import.meta.url),'utf8');
function battleFunction(name,context) {
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);
  let end=source.indexOf('{',start),depth=1;
  for(end++;depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  return vm.runInNewContext(`(${source.slice(start,end)})`,context);
}
function actor() {
  const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
  return {root,rigged:true,grounded:()=>false,update(){},finished:()=>true,dispose(){this.root.removeFromParent();}};
}

test('battle sync never recreates dead actors or their gear from retained death snapshots',()=>{
  const scene=new THREE.Scene(),live=actor(),dead=actor(),corpse=actor();scene.add(live.root,dead.root,corpse.root);
  const enemies=new Map([[1,live],[2,dead]]),corpses=[corpse];let spawned=0;
  const arena={enemies:[{id:1,role:'shield',x:0,y:0,facing:0,action:'chase',actionTime:0},{id:2,role:'archer',x:0,y:0,action:'dead'}]};
  const sync=battleFunction('syncEnemies',{scene,arena,enemies,corpses,airborne:new Map(),makeEnemy:()=>{spawned++;return actor();},toWorldX:x=>x,toWorldZ:z=>z,yawFromFacing:()=>0,turnToward:()=>0,groundAt:()=>0,combatFx:null});
  sync(.016);assert.equal(spawned,0);assert.equal(enemies.size,1);assert.equal(corpses.length,0);assert.equal(dead.root.parent,null);assert.equal(corpse.root.parent,null);assert.equal(scene.children.length,1);
  sync(.016);assert.equal(spawned,0,'dead snapshot respawned its equipment');assert.equal(scene.children[0],live.root);
});

test('result frame clears unfinished corpses before the render loop stops',()=>{
  const scene=new THREE.Scene(),live=actor(),corpse=actor();scene.add(live.root,corpse.root);corpse.finished=()=>false;
  const corpses=[corpse],nodes={resultTitle:{},resultText:{},result:{hidden:true}};let stopped=0,rendered=0;
  const finish=battleFunction('finish',{scene,corpses,updateHud(){},stopFrames(){stopped++;},running:true,renderer:{render(){rendered=scene.children.length;}},camera:{},campaign:null,arena:{state:'win',kills:1},march:null,nextChapterButton:null,restartCampaignButton:null,$:id=>nodes[id],document:{body:{dataset:{}}}});
  finish();assert.equal(stopped,1);assert.equal(corpses.length,0);assert.equal(corpse.root.parent,null);assert.equal(rendered,1,'last result frame still rendered dead gear');assert.equal(nodes.result.hidden,false);
});
