import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TREES,TREE_SOURCES,TREE_STATUS} from './tree-data.mjs';
import {NETWORK_SOURCES,NETWORK_RULES} from './network-data.mjs';
import {traceTree,validateTree,treePosition} from './tree-core.mjs';
const data=JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'));
const sas=TREES.find(tree=>tree.id==='sas-chain');

test('all trees have unique nodes, valid directed edges and no cycles',()=>{
  const sources=new Set([...data.sources,...TREE_SOURCES,...NETWORK_SOURCES].map(source=>source.id));
  const rules=new Set([...data.rules,...NETWORK_RULES].map(rule=>rule.id));
  for(const tree of TREES){
    assert.equal(validateTree(tree),true);
    for(const node of tree.nodes){
      assert.ok(TREE_STATUS[node.status]);
      assert.ok(node.x>=0&&node.x+194<=tree.width&&node.y>=0&&node.y+112<=tree.height);
      assert.ok(node.requirements.length&&node.cost&&node.timing&&node.outcome);
      for(const id of node.source_ids||[])assert.ok(sources.has(id));
      for(const id of node.rule_ids||[])assert.ok(rules.has(id));
    }
    for(const edge of tree.edges)assert.ok(TREE_STATUS[edge.status]);
  }
  for(const source of TREE_SOURCES)assert.equal(new URL(source.url).protocol,'https:');
});
test('Visa to SAS highlights the connecting trunk and excludes unrelated branches',()=>{
  const trace=traceTree(sas,'visa','sas');
  assert.equal(trace.connected,true);
  assert.deepEqual([...trace.nodes].sort(),['visa','gha','bw','scandic','sas'].sort());
  assert.ok(!trace.edges.has('bw-choice')&&!trace.nodes.has('mastercard')&&!trace.nodes.has('turkish'));
});
test('picking an unreachable target never invents a bridge',()=>{
  const trace=traceTree(sas,'visa','wyndham');
  assert.equal(trace.connected,false);
  assert.equal(trace.nodes.size,0);
  assert.equal(trace.edges.size,0);
});
test('selecting a path never changes unresolved or country-restricted evidence into approval',()=>{
  const before=JSON.stringify(sas);
  const trace=traceTree(sas,'visa','royal');
  assert.ok(trace.edges.has('sas-rj')&&trace.edges.has('tk-rj'));
  assert.equal(sas.edges.find(edge=>edge.id==='bw-scandic').status,'pending');
  assert.equal(sas.nodes.find(node=>node.id==='royal').status,'excluded');
  assert.equal(sas.nodes.find(node=>node.id==='turkish').status,'historical');
  assert.equal(JSON.stringify(sas),before);
});
test('Choice remains an optional side branch, not a prerequisite to SAS',()=>{
  assert.ok(traceTree(sas,'bw').nodes.has('choice'));
  assert.ok(!traceTree(sas,'choice').nodes.has('sas'));
  assert.ok(!traceTree(sas,'all','sas').nodes.has('choice'));
});
test('Marriott and China Airlines do not merge unrelated membership resources',()=>{
  const marriott=TREES.find(tree=>tree.id==='marriott-sq'),ci=TREES.find(tree=>tree.id==='ci-card');
  assert.equal(traceTree(marriott,'mb-gold','mb-plat-target').connected,false);
  assert.equal(traceTree(ci,'ci-signature','ci-gold').connected,false);
  assert.equal(traceTree(ci,'ci-signature','ci-award').connected,true);
  assert.equal(traceTree(ci,'ci-priority','ci-gold').connected,true);
});
test('invalid edges and cycles fail validation',()=>{
  assert.throws(()=>validateTree({nodes:[{id:'a'}],edges:[{id:'e',from:'a',to:'missing'}]}));
  assert.throws(()=>validateTree({nodes:[{id:'a'},{id:'b'}],edges:[{id:'e1',from:'a',to:'b'},{id:'e2',from:'b',to:'a'}]}));
});
test('zoom and pan stay finite and bounded',()=>{
  assert.equal(treePosition(sas,100).zoom,2.6);
  assert.equal(treePosition(sas,0).zoom,.65);
  const result=treePosition(sas,NaN,{x:Infinity,y:NaN});
  for(const value of Object.values(result))assert.ok(Number.isFinite(value));
});

test('article chain cannot pass Royal Jordanian current source-provenance restrictions',()=>{
  const node=sas.nodes.find(node=>node.id==='royal');
  assert.equal(node.status,'excluded');
  assert.ok(node.requirements.some(text=>text.includes('串接配對')&&text.includes('拒絕')));
  assert.ok(node.source_ids.includes('tree-rj-terms'));
  assert.ok(sas.edges.filter(edge=>edge.to==='royal').every(edge=>edge.status==='excluded'));
});
