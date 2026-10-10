import { storyFor, chapterEntries, unlockedStory, omittedStory, speakerName } from './story.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels={
  background:['戰前卷宗','Background'],brief:['作戰任務','Orders'],cast:['小隊與當地人','People'],radio:['前線通訊','Radio journal'],ending:['戰後回聲','Epilogues'],
};
const paragraph=(entry,language)=>`<p>${escape(entry[language])}</p>`;
export class StoryBook {
  constructor(root,{onClose,onLanguage}){
    this.root=root;this.active='background';this.focusBefore=null;
    root.querySelector('#storyClose').onclick=onClose;
    root.querySelector('#storyLanguage').onclick=onLanguage;
    const tabs=root.querySelector('#storyTabs');
    const selectTab=id=>{this.active=id;this.render();tabs.querySelector(`[data-story-tab="${id}"]`).focus();};
    tabs.onclick=event=>{const tab=event.target.closest('[data-story-tab]');if(tab)selectTab(tab.dataset.storyTab);};
    tabs.onkeydown=event=>{
      const current=event.target.closest('[data-story-tab]');if(!current)return;
      const ids=Object.keys(labels),index=ids.indexOf(current.dataset.storyTab);
      const next={ArrowRight:(index+1)%ids.length,ArrowLeft:(index+ids.length-1)%ids.length,Home:0,End:ids.length-1}[event.key];
      if(next!==undefined){event.preventDefault();selectTab(ids[next]);}
    };
    root.querySelector('#storyMode').onchange=event=>{this.options.mode=event.target.value;this.render();};
    root.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const items=[...root.querySelectorAll('button,select,a[href],[tabindex="0"]')].filter(item=>!item.hidden&&!item.disabled&&item.tabIndex>=0),first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
  }
  open(options){
    this.focusBefore=document.activeElement;this.options={...options};this.active=options.tab||'background';
    this.inertBefore=[...this.root.parentElement.children].filter(node=>node!==this.root&&node.tagName!=='SCRIPT').map(node=>[node,node.inert]);
    for(const [node] of this.inertBefore)node.inert=true;
    this.root.hidden=false;this.render();this.root.querySelector('#storyClose').focus({preventScroll:true});
  }
  close(){
    this.root.hidden=true;for(const [node,inert] of this.inertBefore||[])node.inert=inert;
    const focus=this.focusBefore?.isConnected?this.focusBefore:this.focusBefore?.dataset.scene?document.querySelector(`[data-scene="${this.focusBefore.dataset.scene}"]`):null;
    focus?.focus?.({preventScroll:true});
  }
  setLanguage(language){this.options.language=language;this.render();}
  render(){
    const {scene,mode,language,variant=0,progress={},session}=this.options,story=storyFor(scene),branch=story[mode],word=(zh,en)=>language==='zh'?zh:en;
    const unlocked=unlockedStory(progress,scene,mode);
    if(session?.scene===scene&&session.mode===mode)for(const id of session.seen)unlocked.add(id);
    this.root.querySelector('#storyTitle').textContent=story.title[language];
    this.root.querySelector('#storyMeta').textContent=`${story.timeLabel[language]} / ${story.location[language]}`;
    this.root.querySelector('#storyDeck').textContent=story.deck[language];
    this.root.querySelector('#storyImage').src=`./assets/briefing/${scene}.webp?v=2`;
    this.root.querySelector('#storyClose').textContent=word('返回・ESC','Back · ESC');
    this.root.querySelector('#storyLanguage').textContent=word('EN','中文');
    this.root.querySelector('#storyModeLabel').textContent=word('作戰分支','Operation');
    this.root.querySelector('#storyMode').value=mode;
    this.root.querySelector('#storyMode').options[0].textContent=word('守衛戰','Hold the Line');
    this.root.querySelector('#storyMode').options[1].textContent=word('衝鋒戰','Breakthrough');
    this.root.querySelector('#storyTabs').innerHTML=Object.entries(labels).map(([id,label])=>`<button id="storyTab-${id}" data-story-tab="${id}" role="tab" tabindex="${this.active===id?0:-1}" aria-selected="${this.active===id}" aria-controls="storyBody">${label[language==='zh'?0:1]}</button>`).join('');
    const entries=chapterEntries(scene,mode),body=this.root.querySelector('#storyBody');
    body.setAttribute('aria-labelledby',`storyTab-${this.active}`);
    const radioEntry=entry=>{
      const missing=session?.scene===scene&&session.mode===mode&&session.seen.has(entry.id)?new Set(session.omitted[entry.id]||[]):omittedStory(progress,scene,mode,entry.id);
      const lines=entry.lines.filter(line=>!missing.has(line.speaker));
      const received=lines.map(line=>`<blockquote><cite>${escape(speakerName(story,line.speaker,language))}</cite><p>${escape(line.text[language])}</p></blockquote>`).join('');
      const interrupted=missing.size?`<p class="story-silence">${word('部分小隊頻道未再收到回覆，檔案保留已確認的通訊。','Some squad channels no longer answered. The journal preserves the confirmed transmissions.')}</p>`:'';
      return `<section class="story-chapter ${unlocked.has(entry.id)?'':'story-locked'}"><h3>${escape(entry.title[language])}</h3>${unlocked.has(entry.id)?received+interrupted:`<p>${word('尚未收到這段通訊・隨作戰推進解鎖','Transmission not yet received · unlocked during the operation')}</p>`}</section>`;
    };
    if(this.active==='background'){
      body.innerHTML=story.background.map((chapter,index)=>`<section class="story-chapter"><span class="eyebrow">0${index+1} / FIELD DOSSIER</span><h3>${escape(chapter.title[language])}</h3>${chapter.paragraphs.map(p=>paragraph(p,language)).join('')}</section>`).join('');
    }else if(this.active==='brief'){
      body.innerHTML=`<section class="story-chapter"><span class="eyebrow">${mode==='defend'?'HOLD THE LINE':'BREAKTHROUGH'}</span><h3>${word('這場作戰為何而戰','What this operation is for')}</h3>${branch.brief.map(p=>paragraph(p,language)).join('')}<div class="story-stakes"><h4>${word('必須守住的事物','What is at stake')}</h4><ul>${story.stakes.map(p=>`<li>${escape(p[language])}</li>`).join('')}</ul></div><h4>${word('本次作戰方案','This operation plan')}</h4>${paragraph(story.operationNotes[variant],language)}</section>`;
    }else if(this.active==='cast'){
      body.innerHTML=story.cast.map(person=>`<section class="story-person"><span>${escape(person.role[language])}</span><h3>${escape(person.name[language])}</h3>${paragraph(person.detail,language)}</section>`).join('');
    }else if(this.active==='radio'){
      body.innerHTML=`<p class="story-help">${word('部署、波次與據點推進時，通訊會自動記入。戰中按 J 暫停回看；未讀完的通訊也會完整保留。','Radio entries are recorded as you deploy and advance. Press J during battle to pause and review; interrupted captions remain here in full.')}</p>`+entries.filter(entry=>entry.lines).map(radioEntry).join('');
    }else{
      body.innerHTML=entries.filter(entry=>entry.paragraphs).map(entry=>`<section class="story-chapter ${unlocked.has(entry.id)?'':'story-locked'}"><span class="eyebrow">${entry.id.toUpperCase()}</span><h3>${escape(entry.title[language])}</h3>${unlocked.has(entry.id)?entry.paragraphs.map(p=>paragraph(p,language)).join(''):`<p>${word('這個結局尚未發生・完成作戰後留在檔案中','This ending has not occurred · recorded after an operation')}</p>`}</section>`).join('')+`<section class="story-chapter"><h3>${word('留給下一班人的話','For the next watch')}</h3>${story.afterword.map(p=>paragraph(p,language)).join('')}</section>`;
    }
    body.scrollTop=0;
    this.root.querySelector('#storyProgress').textContent=word(`通訊與結局 ${unlocked.size}/${entries.length}・紀錄跨部署保留`,`TRANSMISSIONS & ENDINGS ${unlocked.size}/${entries.length} · Saved across deployments`);
  }
}
