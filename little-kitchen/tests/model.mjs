import assert from 'node:assert/strict';
import {fresh,restore,recipes,current,nextAction,advance} from '../model.js';
const s=fresh();
for(let meal=0;meal<12;meal++){
  assert.equal(s.phase,'order');assert.equal(s.recipe,meal%6);
  const r=current(s);assert.equal(r.items.length,2);assert.equal(r.steps.length,2);
  assert(!advance(s,'serve'));
  let taps=0;
  for(const action of ['accept','buy','buy','prepare','prepare','serve']){
    assert.equal(action,nextAction(s));assert(advance(s,action));taps++;
    assert.deepEqual(restore(JSON.stringify(s)),s,'every intermediate phase must resume');
  }
  assert.equal(taps,6);assert.equal(s.phase,'thanks');assert.equal(s.served,meal+1);
  assert(!advance(s,'serve'),'repeated serving must not count twice');
  assert(advance(s,'continue'));assert.equal(s.customer,(meal+1)%4);
}
assert.deepEqual(restore('bad'),fresh());
assert.deepEqual(restore('{"version":99}'),fresh());
const malformed=restore('{"version":2,"phase":"market","ingredient":9,"recipe":-1,"step":5}');
assert.equal(malformed.ingredient,0);assert.equal(malformed.recipe,0);assert.equal(malformed.step,0);
const legacy=restore(null,JSON.stringify({version:1,served:7,customer:3,recipe:4,sound:false}));
assert.equal(legacy.phase,'order');assert.equal(legacy.served,7);assert.equal(legacy.customer,3);assert.equal(legacy.recipe,4);assert.equal(legacy.sound,false);
console.log('PASS: all six meals require exactly six taps; 12 consecutive guests; resume every phase; reject out-of-order actions and duplicate rewards; corrupt-save recovery; v1 migration.');
