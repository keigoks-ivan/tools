import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, Mission } from './scenarios.mjs';
import { STORIES, StorySession, chapterEntries, mergeStoryProgress, unlockedStory, omittedStory, endingFor, speakerName } from './story.mjs';

function bilingualFields(value,result=[]){
  if(!value||typeof value!=='object')return result;
  if(Object.hasOwn(value,'zh')||Object.hasOwn(value,'en'))result.push(value);
  else for(const child of Object.values(value))bilingualFields(child,result);
  return result;
}
const cjk=text=>(text.match(/\p{Script=Han}/gu)||[]).length;

test('all seven campaigns have substantial, distinct bilingual stories and dialogue for the real mission phases',()=>{
  assert.deepEqual(Object.keys(STORIES).sort(),SCENARIOS.map(s=>s.id).sort());
  const titles=new Set();let total=0;
  for(const scenario of SCENARIOS){
    const story=STORIES[scenario.id],fields=bilingualFields(story),size=fields.reduce((sum,p)=>sum+cjk(p.zh),0);
    assert(size>=3500,`${scenario.id}: long campaign, not a renamed short briefing`);total+=size;
    for(const field of fields)for(const language of ['zh','en'])assert(typeof field[language]==='string'&&field[language].trim().length>0,scenario.id+'/'+language);
    titles.add(story.title.zh);assert(story.background.length>=3);
    for(const chapter of story.background){assert(chapter.paragraphs.length>=2);for(const p of chapter.paragraphs)assert(cjk(p.zh)>=90);}
    assert.equal(new Set(story.cast.map(person=>person.id)).size,story.cast.length);
    for(const id of ['lin','shen','chen'])assert(story.cast.some(person=>person.id===id));
    assert.equal(story.cast.find(p=>p.id==='lin').name.zh,'林岳');
    assert.equal(story.cast.find(p=>p.id==='shen').name.zh,'沈禾');
    assert.equal(story.cast.find(p=>p.id==='chen').name.zh,'陳隼');
    assert.equal(story.operationNotes.length,3);assert.equal(story.cleanup.length,2);assert(story.afterword.length>=2);
    for(const mode of ['defend','assault']){
      const branch=story[mode],entries=chapterEntries(scenario.id,mode);
      assert.equal(branch.stages.length,mode==='defend'?4:3);assert.equal(branch.regroup.length,mode==='defend'?3:2);
      assert(branch.brief.length>=2);assert.equal(branch.deploy.length,2);
      for(const ending of ['win','costly','loss']){assert(branch[ending].length>=2);assert(branch[ending].every(p=>cjk(p.zh)>=90),scenario.id+'/'+mode+'/'+ending);}
      for(const entry of entries)for(const line of entry.lines||[]){
        assert(line.speaker==='command'||story.cast.some(p=>p.id===line.speaker),scenario.id+'/'+entry.id+'/'+line.speaker);
        assert(cjk(line.text.zh)>=20&&line.text.zh.length<=65,'live radio stays compact');
        assert(speakerName(story,line.speaker,'en').length>0);
      }
    }
  }
  assert.equal(titles.size,7);assert(total>=28000);
});

// Advance real Mission state with a cleared battlefield. Story receives the
// same events as main.js; stage numbers must match the objectives actually held.
for(const {id:scene} of SCENARIOS)for(const mode of ['defend','assault']){
  test(`${scene}/${mode}: full mission unlocks every stage and regroup, without another battlefield prerequisite`,()=>{
    const mission=new Mission({scene,mode}),session=new StorySession(scene,mode),received=[];
    session.recordMission('deploy',mission);
    for(let frame=0;frame<10000&&mission.status==='playing';frame++){
      const events=mission.update(.1,{alive:0,near:true,contested:false,interact:true});
      for(const event of events){
        if(event==='spawn')mission.spawned();
        else if(event==='won')session.finish(mission,{alliesAlive:3});
        else {const entry=session.recordMission(event,mission);if(entry)received.push(entry.id);}
      }
    }
    assert.equal(mission.status,'won');assert(session.finished);
    const expected=mode==='defend'?['stage1','regroup1','stage2','regroup2','stage3','regroup3','stage4']:['stage1','regroup1','stage2','regroup2','stage3'];
    assert.deepEqual(received,expected);assert(session.seen.has('deploy'));assert(session.seen.has('win'));
    const saved=mergeStoryProgress({},session),unlocks=unlockedStory(saved,scene,mode);
    for(const id of ['deploy',...expected,'win'])assert(unlocks.has(id));
    assert.equal(unlockedStory(saved,scene,mode==='defend'?'assault':'defend').size,0,'branches have independent records');
  });
}

test('a new mission phase replaces stale captions while preserving the whole earlier dialogue in the journal',()=>{
  const session=new StorySession('city','assault');
  session.record('objective',1);const first=session.update(.05);assert.equal(first.key,'stage1.0');
  assert(session.seen.has('stage1'));
  assert.equal(session.record('objective',1),null,'duplicate events do not restart the caption');
  session.record('objective',2);assert.equal(session.update(.05).key,'stage2.0');
  assert(!session.queue.some(line=>line.key.startsWith('stage1.')));
  session.record('resupply',1);assert.equal(session.update(.05).key,'regroup1.0');
  assert(!session.queue.some(line=>line.key.startsWith('stage1.')));
  assert.equal(chapterEntries('city','assault').find(entry=>entry.id==='stage1').lines.length,3);
});

test('immediate assault objectives do not swallow deployment or regroup dialogue',()=>{
  const session=new StorySession('pass','assault');session.record('deploy');session.record('objective',1);
  assert.equal(session.update(.01).key,'deploy.0');assert.equal(session.queue[0].key,'deploy.1');
  const shown=[];let last='';
  for(let i=0;i<600;i++){const key=session.update(.1)?.key;if(key&&key!==last){shown.push(key);last=key;}}
  assert.deepEqual(shown,['deploy.0','deploy.1','stage1.0','stage1.1','stage1.2']);
  session.record('resupply',1);session.update(.01);const remaining=session.remaining;
  session.record('objective',2);assert.equal(session.current.key,'regroup1.0');assert.equal(session.remaining,remaining);
  assert.deepEqual(session.queue.map(line=>line.key),['regroup1.1','stage2.0','stage2.1','stage2.2']);
});

test('radio timing is bounded and independent of mission time; finishing clears captions and rejects later events',()=>{
  const session=new StorySession('forest','defend');session.record('wave',1);const first=session.update(.05);
  const remaining=session.remaining;session.update(-20);assert.equal(session.remaining,remaining);
  session.update(Number.NaN);assert.equal(session.remaining,remaining);
  session.update(100);assert(Math.abs(session.remaining-(remaining-.1))<.0001,'resuming never skips a whole caption from wall-clock time');
  assert.equal(session.current,first);
  const ending=session.finish({status:'lost',mode:'defend',integrity:0},{alliesAlive:3});
  assert.equal(ending.id,'loss');assert.equal(session.update(.1),null);assert.equal(session.queue.length,0);
  assert.equal(session.record('wave',2),null);
});

test('endings reflect actual victory, casualties and defense integrity, including costly victories with three survivors',()=>{
  for(const scene of SCENARIOS)for(const mode of ['defend','assault']){
    const mission=new Mission({scene:scene.id,mode});
    assert.equal(endingFor(mission,{alliesAlive:3}),'loss');mission.status='won';
    assert.equal(endingFor(mission,{alliesAlive:3}),'win');
    for(const alliesAlive of [0,1,2])assert.equal(endingFor(mission,{alliesAlive}),'costly');
    mission.integrity=74;assert.equal(endingFor(mission,{alliesAlive:3}),mode==='defend'?'costly':'win');
    mission.integrity=75;assert.equal(endingFor(mission,{alliesAlive:3}),'win');
    mission.status='lost';assert.equal(endingFor(mission,{alliesAlive:3}),'loss');
  }
});

test('saved journal unlocks survive replay, merge without mutation, and filter malformed or impossible stage IDs',()=>{
  const original={'pass.defend':['deploy','stage1','regroup9','unknown','stage1'],'rail.assault':['loss']},snapshot=JSON.stringify(original);
  const run=new StorySession('pass','defend');run.record('wave',2);run.finish({status:'won',mode:'defend',integrity:40},{alliesAlive:3});
  const merged=mergeStoryProgress(original,run);
  assert.deepEqual(merged['pass.defend'],['deploy','stage1','stage2','costly']);assert.deepEqual(merged['rail.assault'],['loss']);
  assert.equal(JSON.stringify(original),snapshot);
  const replay=new StorySession('pass','defend');replay.record('deploy');
  const afterReplay=mergeStoryProgress(merged,replay);assert(unlockedStory(afterReplay,'pass','defend').has('costly'));
  for(const raw of [null,3,'bad',[],{'pass.defend':'stage1'}])assert.doesNotThrow(()=>mergeStoryProgress(raw,replay));
  assert.deepEqual([...unlockedStory({'pass.assault':['stage4','regroup3','stage1','loss']},'pass','assault')],['stage1','loss']);
  assert.equal(run.record('wave',999),null);
  assert.equal(new StorySession('pass','assault').recordMission('objective',new Mission({scene:'city',mode:'assault'})),null);
});

test('fallen squadmates cannot transmit later dialogue, while their earlier received messages remain archived',()=>{
  const mission=new Mission({scene:'dam',mode:'defend'}),session=new StorySession('dam','defend');
  const alive=new Set(['command','local','lin','shen','chen']);session.recordMission('deploy',mission,alive);
  session.update(.01,'zh',alive);assert.equal(session.current.speaker,'lin');
  alive.delete('lin');const remaining=session.update(.01,'zh',alive);assert.equal(remaining.speaker,'local');
  assert(!session.omitted.deploy.length,'messages received before the casualty stay in the journal');
  mission.wave=2;session.recordMission('wave',mission,alive);
  assert(session.omitted.stage2.includes('lin'));assert(session.queue.every(line=>line.speaker!=='lin'));
  const saved=mergeStoryProgress({},session);assert(omittedStory(saved,'dam','defend','stage2').has('lin'));
  assert.equal(omittedStory(saved,'dam','assault','stage2').size,0);
  const replay=new StorySession('dam','defend');alive.add('lin');replay.recordMission('wave',mission,alive);
  const refreshed=mergeStoryProgress(saved,replay);assert.equal(omittedStory(refreshed,'dam','defend','stage2').size,0,'a later deployment can restore a complete transmission');
  assert(!Object.hasOwn(refreshed,'dam.defend.omitted'));
});
