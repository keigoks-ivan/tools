import assert from 'node:assert/strict';
import {HairSystem,TIE_MODES} from '../js/hair.js';
import {checkWish} from '../js/goals.js';
import {wishes,guests} from '../js/looks.js';
import {palette} from '../js/data.js';
import {createCut} from '../js/tools/cut.js';
import {SalonMemory} from '../js/memory.js';
const h=new HairSystem();
const tool=createCut({hair:h,H:844,react(){}}),p=h.strands.find(s=>!s.bang).nodes[7];
tool.onDown({x:p.x,y:p.y});tool.onUp();assert.ok(h.cutCount>0,'tap must actually cut hair');
for(const profile of guests)for(const mode of TIE_MODES){h.reset(profile);h.tie(mode);for(let i=0;i<120;i++)h.step(1/60);assert.ok(h.stats().finite,profile.id+' '+mode);const saved=h.snapshot();assert.ok(new HairSystem(profile).restore(saved),profile.id+' '+mode+' restore');h.cut({x:0,y:430},{x:390,y:430});assert.ok(new HairSystem(profile).restore(h.snapshot()),profile.id+' '+mode+' cut and restore');}
h.reset();h.tie('double');const malformed=h.snapshot();malformed.strands.find(s=>s.tie).tie.extra={};assert.equal(h.restore(malformed),false,'malformed hair bands cannot crash render');
h.reset();const invalid=h.snapshot();invalid.strands[0]=null;assert.equal(h.restore(invalid),false);const invalidNode=h.snapshot();invalidNode.strands[0].nodes[0]=null;assert.equal(h.restore(invalidNode),false);
for(const wish of wishes){h.reset();h.cut({x:0,y:128+440*wish.length*.92},{x:390,y:128+440*wish.length*.92});const strands=h.strands.filter(s=>!s.bang);strands.forEach((s,i)=>s.nodes.forEach(p=>p.c=[...palette[wish.colors[i%wish.colors.length]]]));const progress=checkWish(h,[{kind:wish.accessory}],wish);assert.ok(progress.colors);assert.ok(progress.accessory);assert.ok(progress.length,JSON.stringify([wish.id,progress]));const before=checkWish(h,[],wish).length;h.tie('double');assert.equal(checkWish(h,[],wish).length,before,'tying does not change length progress');}
// A blocked IndexedDB must fall back; a late success must close the unused database.
let request,closed=false;globalThis.indexedDB={open(){return request={}}};
const memory=new SalonMemory();await memory.open();assert.equal(memory.persistent,false);assert.equal(memory.problem,true);request.result={close(){closed=true}};request.onsuccess();assert.equal(closed,true);
assert.ok(await memory.add({id:'test',created:1,image:'x',state:{}}));assert.equal(memory.photos.length,1);assert.ok(await memory.remove('test'));assert.equal(memory.photos.length,0);
console.log('PASS: tap cutting, 27 profile/style combinations, malformed bands, six achievable wishes, tie-independent progress, blocked storage fallback, late database cleanup');
