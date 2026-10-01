import {palette} from './data.js?v=12';
import {checkWish,wishNames,colorNames} from './goals.js?v=12';
import {wishes} from './looks.js?v=12';
const paths={cut:'<circle cx="8" cy="17" r="4"/><circle cx="20" cy="17" r="4"/><path d="m10 14 11-12M18 14 7 2"/>',grow:'<path d="M10 5h8v4l3 4v10H7V13l3-4zM10 2h8M14 19v-7m0 4-4-3m4 1 4-3"/>',color:'<rect x="8" y="9" width="12" height="15" rx="3"/><path d="M11 9V5h8m-4 0V2h5m3 5 3-1m-3 5 3 1"/>',comb:'<path d="M4 7h21v6H4zM5 13v10m4-10v10m4-10v10m4-10v10m4-10v10m4-10v10"/>',decorate:'<path d="M14 13C0-2 0 27 14 17c14 10 14-19 0-4Z"/><circle cx="14" cy="15" r="3"/>',guests:'<circle cx="10" cy="8" r="5"/><path d="M1 23v-3a9 9 0 0 1 18 0v3m2-18a5 5 0 0 1 0 10m1 3a6 6 0 0 1 5 6"/>',wishes:'<path d="m14 2 4 8 9 1-6 7 1 9-8-4-8 4 1-9-6-7 9-1Z"/>',camera:'<rect x="2" y="7" width="25" height="18" rx="4"/><path d="m8 7 2-5h9l2 5"/><circle cx="14" cy="16" r="6"/>',album:'<rect x="5" y="2" width="21" height="24" rx="3"/><path d="M2 7v19m7-4 5-7 5 5 3-3"/><circle cx="12" cy="9" r="2"/>',ties:'<circle cx="14" cy="13" r="8"/><path d="M8 7C-2-2-1 23 6 26m14-19c10-9 9 16 2 19M10 15h0m8 0h0m-7 3q3 3 6 0"/>',undo:'<path d="m10 4-7 7 7 7M4 11h12a9 9 0 0 1 0 18"/>',reset:'<path d="M25 11a11 11 0 1 0-1 10M25 3v9h-9"/>',help:'<circle cx="14" cy="14" r="12"/><path d="M10 9a4 4 0 0 1 8 0c0 4-4 3-4 7m0 5h0"/>'};
const svg=kind=>`<svg viewBox="0 0 30 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[kind]||paths.wishes}</svg>`;
const toolLabels={cut:'剪頭髮',grow:'長頭髮',color:'染髮',comb:'梳頭髮',decorate:'髮飾'};
const hints={cut:'點一下剪短，拖過髮絲剪出形狀',grow:'按住髮尾，讓頭髮慢慢長回來',color:'選顏色，再塗在想染的髮絲上',comb:'順著髮絲拖動，梳出喜歡的形狀',decorate:'點一下放髮飾，拖曳移動或轉動'};
export class StudioUI{
 constructor(api){this.api=api;this.free=false;this.last=0;this.panelKey='';this.completed=new Set();
  this.root=document.createElement('div');this.root.className='studio';this.root.innerHTML=`<header class="brand"><div class="brand-mark">✿</div><div><span class="eyebrow">LITTLE SALON</span><h1>小小美髮師</h1></div><button class="help quiet" aria-label="玩法說明">${svg('help')}</button></header><nav class="top-actions" aria-label="作品與造型"></nav><section class="order" aria-label="客人的造型願望"><div class="order-copy"><span class="eyebrow">TODAY’S LITTLE WISH</span><strong class="wish-name"></strong></div><div class="goals"></div><button class="free-toggle">自由玩</button></section><div class="tray"></div><div class="tools" role="group" aria-label="美髮工具"></div><div class="swatches" role="group" aria-label="髮色"></div><div class="stage-footer"><button class="undo small" aria-label="撤銷">${svg('undo')}</button><div class="tool-hint" role="status"></div><button class="reset small" aria-label="重新開始">${svg('reset')}</button></div><button class="dye-all">整頭染色</button><div class="panel-controls"></div><div class="toast" role="status"></div><dialog class="help-dialog"><span class="eyebrow">WELCOME TO YOUR SALON</span><h2>今天，換個新造型！</h2><p>先選客人和靈感，在頭髮上點一下或拖曳，就能剪、染、梳出自己的作品。</p><ol><li>✂ 剪短了？用生髮水長回來，或按撤銷。</li><li>🎨 選色塊局部染色，也能一鍵整頭染。</li><li>🎀 綁髮、加髮飾，完成客人的小願望。</li><li>📷 拍照存進作品集，下次還能繼續編輯。</li></ol><p class="help-note">沒有倒數，也沒有失敗。願望只是靈感，喜歡就可以拍照！作品存在這台裝置。</p><button class="help-close primary">開始造型</button></dialog>`;
  document.getElementById('game').append(this.root);
  const nav=this.root.querySelector('nav');for(const [kind,label] of [['guests','客人'],['wishes','靈感'],['ties','綁髮'],['decorate','髮飾'],['album','作品集'],['camera','拍照']]){const b=document.createElement('button');b.innerHTML=svg(kind)+`<span>${label}</span>`;b.dataset.action=kind;b.onclick=()=>{api.stop();kind==='camera'?api.replay.snap():api.replay.open(kind==='decorate'?'accessories':kind)};nav.append(b)}
  for(const kind of Object.keys(toolLabels)){const b=document.createElement('button');b.className='tool';b.dataset.tool=kind;b.innerHTML=svg(kind)+`<span>${toolLabels[kind]}</span>`;b.onclick=()=>api.select(kind);this.root.querySelector('.tools').append(b)}
  palette.forEach((color,i)=>{const b=document.createElement('button');b.className='swatch';b.style.setProperty('--color',`rgb(${color.join(',')})`);b.setAttribute('aria-label',colorNames[i]);b.onclick=()=>api.color(i);this.root.querySelector('.swatches').append(b)});
  this.root.querySelector('.undo').onclick=()=>api.undo();this.root.querySelector('.reset').onclick=()=>api.replay.open('reset');
  this.root.querySelector('.free-toggle').onclick=()=>{this.free=!this.free;this.last=0};this.root.querySelector('.dye-all').onclick=()=>api.dyeAll();
  const dialog=this.root.querySelector('dialog');this.root.querySelector('.help').onclick=()=>{api.stop();dialog.showModal()};this.root.querySelector('.help-close').onclick=()=>dialog.close();
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){api.stop();api.replay.mode=null}else if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!dialog.open){e.preventDefault();api.undo()}});
 }
 resize(l){this.layout=l;const s=this.root.style;s.setProperty('--stage-width',l.stage.w+'px');
  const dock=this.root.querySelector('.tray');Object.assign(dock.style,{left:l.dock.x+'px',top:l.dock.y+'px',width:l.dock.w+'px',height:l.dock.h+'px'});
  [...this.root.querySelectorAll('.tool')].forEach((b,i)=>{const p=l.buttons[i];Object.assign(b.style,{left:p.x-p.r+'px',top:p.y-p.r+'px',width:p.r*2+'px',height:p.r*2+'px'})});
  [...this.root.querySelectorAll('.swatch')].forEach((b,i)=>{const p=l.colors[i];Object.assign(b.style,{left:p.x-p.r+'px',top:p.y-p.r+'px',width:p.r*2+'px',height:p.r*2+'px'})});
  this.root.querySelector('.stage-footer').style.top=(l.stage.h-44)+'px';
  const dye=this.root.querySelector('.dye-all');Object.assign(dye.style,{top:(l.stage.h-76)+'px',left:(l.stage.w/2-52)+'px'});
 }
 notify(message){const t=this.root.querySelector('.toast');t.textContent=message;t.classList.add('show');clearTimeout(this.timer);this.timer=setTimeout(()=>t.classList.remove('show'),2800)}
 draw(now){const a=this.api,mode=a.replay.mode;if(now-this.last<180&&mode===this.lastMode)return;this.last=now;this.lastMode=mode;
  this.root.classList.toggle('modal-open',!!mode);const selected=a.selected();
  for(const b of this.root.querySelectorAll('[data-tool]')){const active=b.dataset.tool===selected;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active)}
  [...this.root.querySelectorAll('.swatch')].forEach((b,i)=>{const active=a.colorIndex()===i;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active)});
  this.root.querySelector('.undo').disabled=!a.canUndo();this.root.querySelector('.tool-hint').textContent=hints[selected];this.root.querySelector('.dye-all').hidden=selected!=='color'||!!mode;
  const w=wishes[a.wish()],g=checkWish(a.hair(),a.items(),w),n=Object.values(g).filter(Boolean).length;
  this.root.querySelector('.wish-name').textContent=this.free?'自由創作時間':`${wishNames[a.wish()]} ${n===3?'✦ 完成！':''}`;
  this.root.querySelector('.free-toggle').textContent=this.free?'接願望':'自由玩';
  const completion=a.guest()+':'+a.wish();if(!this.free&&n===3&&!this.completed.has(completion)){this.completed.add(completion);a.celebrate();this.notify('小願望完成！拍張照，收藏你的新造型。')}
  const accessoryNames={bow:'蝴蝶結',pearls:'珍珠',flower:'花朵',star:'星星',moon:'月亮',butterfly:'蝴蝶'};
  const entries=[['colors',w.colors.length>2?'彩虹色':w.colors.map(i=>colorNames[i].replace(/玫瑰|蜜桃|陽光|薄荷|天空|薰衣草/g,'')).join('＋')],['length',w.length<.6?'短髮':w.length<.85?'中長髮':'長髮'],['accessory',accessoryNames[w.accessory]]];
  const goalKey=JSON.stringify([this.free,entries,g]);if(goalKey!==this.goalKey){this.goalKey=goalKey;this.root.querySelector('.goals').innerHTML=this.free?'<span class="free-note">跟著靈感走，喜歡就拍照收藏。</span>':entries.map(([key,label])=>`<span class="goal ${g[key]?'done':''}">${g[key]?'✓':'○'} ${label}</span>`).join('')}
  const key=JSON.stringify([mode,a.replay.hits.map(h=>[h.x,h.y,h.w,h.h,h.label])]);if(key!==this.panelKey){this.panelKey=key;const controls=this.root.querySelector('.panel-controls');controls.replaceChildren();if(mode)for(const h of a.replay.hits){const b=document.createElement('button');b.className='panel-hit';b.setAttribute('aria-label',h.label||'選擇');Object.assign(b.style,{left:h.x+'px',top:h.y+'px',width:h.w+'px',height:h.h+'px'});b.onclick=()=>{if(!a.replay.busy)h.run()};controls.append(b)}}
  if(a.problem()&&!this.warned){this.warned=true;this.notify('這次無法保存到裝置。仍可玩，也可下載照片。')}
 }
}
