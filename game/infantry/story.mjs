import { NORTHERN_STORIES } from './stories/northern.mjs';
import { INFRASTRUCTURE_STORIES } from './stories/infrastructure.mjs';
import { REARLINE_STORIES } from './stories/rearline.mjs';

export const STORIES={...NORTHERN_STORIES,...INFRASTRUCTURE_STORIES,...REARLINE_STORIES};
const words=(zh,en)=>({zh,en});
export const STORY_LABELS={
  deploy:words('部署前通訊','Before deployment'),
  cleanup:words('最後的回音','The last echoes'),
  win:words('守住的承諾','A promise kept'),
  costly:words('帶著代價歸來','The cost of returning'),
  loss:words('未完成的回報','An unfinished report'),
};
export function storyFor(id){return STORIES[id]||STORIES.pass;}
export function storyStageTitle(mode,stage){return mode==='defend'?words(`第 ${stage} 波・前線通訊`,`Wave ${stage} · Frontline radio`):words(`第 ${stage} 據點・前線通訊`,`Sector ${stage} · Frontline radio`);}
export function endingFor(mission,telemetry={}){
  if(mission.status!=='won')return 'loss';
  return telemetry.alliesAlive===3&&(mission.mode!=='defend'||mission.integrity>=75)?'win':'costly';
}
export function storyEntry(scene,mode,id){
  const story=storyFor(scene),branch=story[mode==='assault'?'assault':'defend'];
  if(id==='deploy'||id==='cleanup')return {id,title:STORY_LABELS[id],lines:id==='deploy'?branch.deploy:story.cleanup};
  if(['win','costly','loss'].includes(id))return {id,title:STORY_LABELS[id],paragraphs:branch[id]};
  const match=/^(stage|regroup)(\d+)$/.exec(id);if(!match)return null;
  const index=Number(match[2])-1,isStage=match[1]==='stage',lines=(isStage?branch.stages:branch.regroup)[index];
  if(!lines)return null;
  return {id,title:isStage?storyStageTitle(mode,index+1):words(`階段 ${index+1}・整備通訊`,`Phase ${index+1} · Regroup radio`),lines};
}
export function chapterEntries(scene,mode){
  const branch=storyFor(scene)[mode==='assault'?'assault':'defend'];
  const ids=['deploy'];
  for(let i=1;i<=branch.stages.length;i++){ids.push('stage'+i);if(i<=branch.regroup.length)ids.push('regroup'+i);}
  return [...ids,'cleanup','win','costly','loss'].map(id=>storyEntry(scene,mode,id));
}
export function mergeStoryProgress(raw,session){
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},key=`${session.scene}.${session.mode}`;
  const valid=new Set(chapterEntries(session.scene,session.mode).map(entry=>entry.id));
  const old=Array.isArray(source[key])?source[key].filter(id=>valid.has(id)):[];
  const result={...source,[key]:[...new Set([...old,...session.seen])].filter(id=>valid.has(id))};
  const omitted=Object.fromEntries([...valid].map(id=>[id,[...omittedStory(source,session.scene,session.mode,id)]]).filter(([,speakers])=>speakers.length));
  for(const id of session.seen){if(session.omitted[id]?.length)omitted[id]=session.omitted[id];else delete omitted[id];}
  if(Object.keys(omitted).length)result[key+'.omitted']=omitted;else delete result[key+'.omitted'];
  return result;
}
export function omittedStory(raw,scene,mode,id){
  const stored=raw?.[`${scene}.${mode}.omitted`]?.[id];
  return new Set(Array.isArray(stored)?stored.filter(speaker=>['lin','shen','chen'].includes(speaker)):[]);
}
export function unlockedStory(raw,scene,mode){
  const stored=raw?.[`${scene}.${mode}`],valid=new Set(chapterEntries(scene,mode).map(entry=>entry.id));
  return new Set(Array.isArray(stored)?stored.filter(id=>valid.has(id)):[]);
}
export function speakerName(story,id,language='zh'){
  if(id==='command')return language==='zh'?'指揮部':'COMMAND';
  return story.cast.find(person=>person.id===id)?.name[language]||(language==='zh'?'前線通訊':'FRONTLINE');
}

// Narrative follows existing mission events. It never advances or pauses a mission.
// A new phase replaces stale tactical captions. Deployment/regroup messages
// remain useful during the next phase and get time to finish, even in assault.
export class StorySession {
  constructor(scene,mode){this.scene=Object.hasOwn(STORIES,scene)?scene:'pass';this.mode=mode==='assault'?'assault':'defend';this.seen=new Set();this.omitted={};this.queue=[];this.current=null;this.remaining=0;this.finished=false;}
  recordMission(event,mission,available=null){
    if(mission.scene!==this.scene||mission.mode!==this.mode)return null;
    const stage=event==='wave'?mission.wave:event==='objective'?mission.objective+1:event==='resupply'?(this.mode==='defend'?mission.wave:mission.objective):0;
    return this.record(event,stage,available);
  }
  record(event,stage=0,available=null){
    if(this.finished)return null;
    const id=event==='wave'||event==='objective'?`stage${stage}`:event==='resupply'?`regroup${stage}`:event;
    const entry=storyEntry(this.scene,this.mode,id);if(!entry||this.seen.has(id))return null;
    this.seen.add(id);
    const audible=line=>!available||available.has(line.speaker);
    this.omitted[id]=[...new Set((entry.lines||[]).filter(line=>!audible(line)).map(line=>line.speaker))];
    const next=(entry.lines||[]).map((line,index)=>({...line,key:`${id}.${index}`})).filter(audible);
    if(id.startsWith('stage')){
      const context=line=>line&&/^(deploy|regroup\d+)\./.test(line.key);
      this.queue=[...this.queue.filter(context),...next];
      if(!context(this.current)){this.current=null;this.remaining=0;}
    }else {this.queue=next;this.current=null;this.remaining=0;}
    return entry;
  }
  update(dt,language='zh',available=null){
    if(this.finished)return null;
    this.remaining-=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));
    while(this.remaining<=0||(this.current&&available&&!available.has(this.current.speaker))){
      this.current=this.queue.shift()||null;
      if(!this.current){this.remaining=0;break;}
      if(available&&!available.has(this.current.speaker)){this.remaining=0;continue;}
      const text=this.current.text[language]||this.current.text.zh;
      this.remaining=Math.min(11,Math.max(5,language==='en'?text.split(/\s+/).length/3.4+1.5:text.length/7+1.5));
    }
    return this.current;
  }
  finish(mission,telemetry){
    const id=endingFor(mission,telemetry),entry=storyEntry(this.scene,this.mode,id);
    this.seen.add(id);this.finished=true;this.queue=[];this.current=null;this.remaining=0;return entry;
  }
}
