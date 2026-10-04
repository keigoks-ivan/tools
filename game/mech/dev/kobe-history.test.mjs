import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_CARDS, HISTORY_NOTICE, historyCard, HistoryReader } from '../kobe-history.mjs';

class Node {
  constructor(tag,doc){this.tagName=tag;this.doc=doc;this.children=[];this.attrs={};this.events=new Map();this.hidden=false;this.textContent='';}
  appendChild(n){n.parent=this;this.children.push(n);return n;}
  replaceChildren(...nodes){this.children=[];nodes.forEach(n=>this.appendChild(n));}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,f){this.events.set(k,f);}
  removeEventListener(k,f){if(this.events.get(k)===f)this.events.delete(k);}
  querySelectorAll(tag){return this.children.flatMap(n=>[...(n.tagName===tag?[n]:[]),...n.querySelectorAll(tag)]);}
  focus(){this.doc.activeElement=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
const documentMock=()=>{
  const d={createElement(tag){return new Node(tag,this);},getElementById(id){const find=n=>n.id===id?n:n.children.map(find).find(Boolean);return find(this.head)||find(this.body)||null;}};
  d.head=d.createElement('head');d.body=d.createElement('body');d.activeElement=d.body;return d;
};

test('八張史實卡皆有正式日文名稱、必要限定與官方可追溯來源，架空戰事明示',()=>{
  assert.equal(HISTORY_CARDS.length,8);assert.equal(new Set(HISTORY_CARDS.map(c=>c.id)).size,8);
  for(const c of HISTORY_CARDS) {
    assert.equal(c.kind,'history');assert(c.nameJa);assert(c.qualifiers.length);assert(c.sourceUrls.length);assert.equal(c.sourceUrls.length,c.sourceLabels.length);
    c.sourceUrls.forEach(url=>{const u=new URL(url);assert.equal(u.protocol,'https:');assert(['www.city.kobe.lg.jp','kobe-rekishiisan.city.kobe.lg.jp','kobe-kazamidori.com','www.feel-kobe.jp','kobe-ijinkan.net','www.kobe-kitano.net'].includes(u.hostname));});
    assert.equal(historyCard(c.id),c);assert(Object.isFrozen(c));assert(Object.isFrozen(c.sourceUrls));
  }
  assert(HISTORY_NOTICE.includes('未來架空'));assert(HISTORY_NOTICE.includes('重編'));
  assert(historyCard('kazamidori').text.includes('約建於一九〇九'));assert(historyCard('kazamidori').text.includes('木造'));
  assert(historyCard('moegi').text.includes('一九〇三'));assert(historyCard('uroko').text.includes('據傳'));assert(!historyCard('uroko').text.includes('一九〇五'));
  assert(historyCard('tenman').text.startsWith('據社傳'));assert(historyCard('tenman').qualifiers.some(t=>t.includes('不是現存')));assert.equal(historyCard('unknown'),null);
  assert(historyCard('railway-industry').text.includes('一八七四'));assert(historyCard('reconstruction').text.includes('一九九五年一月十七日'));assert(historyCard('reconstruction').qualifiers.some(t=>t.includes('未來戰鬥')));
});

test('史實閱讀保持繁體、清楚的來源連結與獨立暫停接口，沒有自行綁遊戲鍵',()=>{
  const d=documentMock(),calls=[],r=new HistoryReader({document:d,onOpen:()=>calls.push('pause'),onClose:()=>calls.push('resume'),onRead:id=>calls.push(id)});
  assert(!r.isOpen);assert.equal(r.root.lang,'zh-Hant');assert.equal(r.root.attrs['aria-modal'],'true');assert(r.keyHandler);
  assert(!r.open('bad'));assert.deepEqual(calls,[]);assert(r.open('kazamidori'));assert(r.isOpen);assert.equal(d.activeElement,r.closeButton);
  assert.deepEqual(calls,['pause','kazamidori']);const anchors=r.article.querySelectorAll('a');assert.equal(anchors.length,3);
  for(const a of anchors){assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');assert(a.href.startsWith('https:'));}
  r.open('moegi');r.open('moegi');assert.deepEqual(calls,['pause','kazamidori','moegi']);assert.equal(r.buttons.get('moegi').attrs['aria-current'],'true');
  assert.equal(r.toggle(),false);assert(!r.isOpen);assert.equal(calls.at(-1),'resume');assert.equal(d.activeElement,d.body);
  const next=new HistoryReader({document:d});assert.equal(d.head.children.filter(n=>n.id==='kobe-history-style').length,1);next.dispose();r.dispose();assert.equal(d.body.children.length,0);assert(!r.open());
});

test('讀取紀錄可序列化，舊存檔安全預設，非法卡名及版本不呼叫外部效果',()=>{
  const d=documentMock(),calls=[],r=new HistoryReader({document:d,onOpen:()=>calls.push('pause'),onRead:id=>calls.push(id)});r.open('uroko');r.close();
  const s=JSON.parse(JSON.stringify(r.snapshot())),next=new HistoryReader({document:d,onOpen:()=>calls.push('bad'),onRead:()=>calls.push('bad')});assert(next.restore(s));assert.deepEqual(next.snapshot(),s);assert(!next.isOpen);
  const n=calls.length;for(const bad of [{...s,version:99},{...s,read:['unverified']},{...s,selected:'bad'},{...s,read:['uroko','uroko']}]){assert(!next.restore(bad));assert.deepEqual(next.snapshot(),s);}assert.equal(calls.length,n);
  assert(next.restore(undefined));assert.deepEqual(next.snapshot(),{version:1,read:[],selected:'port-opening'});next.dispose();r.dispose();
});

test('對話框 Escape 返回、Tab 焦點留在閱讀框，重複關閉不重複恢復遊戲',()=>{
  const d=documentMock(),calls=[],r=new HistoryReader({document:d,onClose:()=>calls.push('resume')});r.open('tenman');
  const last=r.article.querySelectorAll('a').at(-1);last.focus();let prevented=0,stopped=0;
  r.keyHandler({code:'Tab',preventDefault(){prevented++;}});assert.equal(d.activeElement,r.closeButton);assert.equal(prevented,1);
  r.keyHandler({code:'Tab',shiftKey:true,preventDefault(){prevented++;}});assert.equal(d.activeElement,last);
  r.keyHandler({code:'Escape',preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert(!r.isOpen);assert.equal(stopped,1);assert.deepEqual(calls,['resume']);assert(!r.close());r.dispose();assert.deepEqual(calls,['resume']);
});
