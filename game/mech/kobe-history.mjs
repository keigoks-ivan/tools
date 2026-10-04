// Facts use municipal or landmark-operator sources. The playable city is a fictional future layout.
const freeze=o=>{Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(o);};
export const HISTORY_NOTICE='史實卡記錄真實地標；遊戲人物、軍隊與戰鬥為未來架空劇情。道路位置與比例依遊戲重編。';
export const HISTORY_CARDS=freeze([
  {
    id:'port-opening',kind:'history',title:'港口與城市',nameJa:'神戸港',
    text:'兵庫／神戶港於西曆一八六八年一月一日開港，舊曆為慶應三年十二月七日。港口成為人員、貨物與資訊往來的入口，也帶動城市的國際交流。',
    qualifiers:['日期採西曆，並附舊曆對照。','遊戲中的封鎖、撤離車隊與軍事命令均屬架空，並非開港時的歷史事件。'],
    sourceUrls:['https://www.city.kobe.lg.jp/a74134/kurashi/access/harbor/rekishi.html'],sourceLabels:['神戶市｜神戶港的歷史'],
  },
  {
    id:'kitano-district',kind:'history',title:'洋館與和風住宅共存的北野',nameJa:'北野町山本通',
    text:'北野町山本通的歷史街景由洋風與和風住宅共同形成。神戶市於一九七九年十二月指定保存地區，國家於一九八〇年四月十日選定為重要傳統建造物群保存地區。',
    qualifiers:['市級指定與國家選定是不同階段。','遊戲中的洋館棟數、坡度與道路配置不代表真實街區測量。'],
    sourceUrls:['https://www.city.kobe.lg.jp/a21651/kanko/bunka/bunkashisetsu/foreigner/sub5/index.html','https://www.city.kobe.lg.jp/a21651/kanko/bunka/bunkashisetsu/foreigner/sub1.html'],sourceLabels:['神戶市｜保存地區','神戶市｜異人館的歷史'],
  },
  {
    id:'kazamidori',kind:'history',title:'風見雞之館',nameJa:'風見鶏の館／旧トーマス住宅',
    text:'風見雞之館約建於一九〇九年，原為德國貿易商 G. Thomas 的自宅。木造二層建築採紅磚貼面，二樓以淺色填充牆配深色木骨，並有半地下、塔屋與屋頂風向雞。',
    qualifiers:['建築年代依目前神戶市與館方資料，保留「約」。','紅磚外觀不表示整座建築是磚造承重城堡；遊戲外型採簡化參考。'],
    sourceUrls:['https://www.city.kobe.lg.jp/a21651/434799779708.html','https://kobe-kazamidori.com/history/','https://kobe-kazamidori.com/pdf/2026_weathercockhouse_pamphlet.pdf'],sourceLabels:['神戶市｜風見雞之館','館方｜建築與歷史','館方｜官方導覽手冊'],
  },
  {
    id:'moegi',kind:'history',title:'萌黃之館',nameJa:'萌黄の館／小林家住宅（旧シャープ住宅）',
    text:'萌黃之館建於一九〇三年，原為美國駐神戶總領事 Hunter Sharp 的住宅。木造二層外牆採下見板，兩種不同形狀的凸窗與廊台是外觀特色。一九八七至一九八九年的保存修理恢復原有外牆漆色。',
    qualifiers:['保存修理年代與興建年代不同。','現今綠色外牆不是廢墟或軍事設施的設定；遊戲中的接應任務純屬架空。'],
    sourceUrls:['https://www.city.kobe.lg.jp/a21651/kanko/bunka/bunkashisetsu/foreigner/sub3.html','https://www.feel-kobe.jp/tw/attractions/detail_1021.html'],sourceLabels:['神戶市｜萌黃之館','神戶官方觀光｜萌黃之館'],
  },
  {
    id:'uroko',kind:'history',title:'魚鱗之家',nameJa:'うろこの家／旧ハリヤー邸',
    text:'館方介紹，這座住宅建於明治後期，原為提供外國人使用的高級出租住宅，據傳於大正期移築至現址。木造二層的外牆鋪天然粘板岩，魚鱗狀排列的石片、圓筒形塔部與凸窗形成鮮明輪廓。',
    qualifiers:['館方以年代區間與移築傳承敘述，未採未核實的精確興建年。','中文「魚鱗之家」用來說明名稱；附日文館名以供核對。'],
    sourceUrls:['https://kobe-ijinkan.net/uroko/'],sourceLabels:['館方｜うろこの家'],
  },
  {
    id:'tenman',kind:'history',title:'北野天滿神社',nameJa:'北野天満神社',
    text:'據社傳，北野天滿神社的創建由來可追溯至一一八〇年，與平清盛福原遷都時自京都勸請北野天滿宮相關。神社奉祀菅原道真；館方介紹現存本殿與拜殿造營於一七四二年。',
    qualifiers:['一一八〇年是社傳的創建由來，不是現存建築的建造年代。','神戶的北野天滿神社與京都的北野天滿宮是不同地點。'],
    sourceUrls:['https://www.kobe-kitano.net/about/'],sourceLabels:['神社官方｜由緒'],
  },
  {
    id:'railway-industry',kind:'history',title:'鐵路與港口產業',nameJa:'大阪―神戸間の鉄道',
    text:'一八七四年，大阪至神戶的鐵路開業。交通網逐步整備，提高神戶港的重要性，造船、紡織與火柴製造等產業也隨之發展。鐵道、碼頭與工場共同留下近代港口城市的面貌。',
    qualifiers:['這裡介紹的是近代交通與產業的發展，不是軍事載具或遊戲貨運支路的歷史。','遊戲鐵道與工場位置為重編配置，不作真實舊線址標示。'],
    sourceUrls:['https://kobe-rekishiisan.city.kobe.lg.jp/history/kindai/'],sourceLabels:['神戶市文化財課｜近代的歷史'],
  },
  {
    id:'reconstruction',kind:'history',title:'震災之後，重建生活',nameJa:'阪神・淡路大震災と復興',
    text:'一九九五年一月十七日，阪神・淡路大震災發生。神戶的復興涵蓋住宅與生活重建、社區再生和都市基礎設施修復。在震災復興再開發地區，居民透過街區協議會討論並提出構想，參與自己的街區重建。',
    qualifiers:['這是真實地震與復興的記錄，與遊戲未來戰鬥造成的破壞不同。','不把真實受災者、救援行動或紀念場所改寫成遊戲軍事事件。'],
    sourceUrls:['https://www.city.kobe.lg.jp/a57337/bosai/hanshinawaji/data/index.html','https://www.city.kobe.lg.jp/a13150/shise/kekaku/jutakutoshikyoku/redevelop/kobe-kh/susume/index.html'],sourceLabels:['神戶市｜阪神・淡路大震災資料','神戶市｜震災復興再開發'],
  },
]);
const cards=new Map(HISTORY_CARDS.map(c=>[c.id,c]));
export const historyCard=id=>cards.get(id)||null;

const css=`.kobe-history{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#10131ce6;color:#e9e7de;font:16px/1.75 system-ui,"Noto Sans TC",sans-serif;padding:clamp(10px,3vw,32px);box-sizing:border-box}.kobe-history[hidden]{display:none}.kobe-history__panel{width:min(900px,100%);max-height:90dvh;overflow:auto;background:#1c232c;border:1px solid #69717b;border-radius:8px;box-shadow:0 14px 60px #0008;padding:clamp(16px,3vw,30px);box-sizing:border-box}.kobe-history__head{display:flex;align-items:center;justify-content:space-between;gap:16px}.kobe-history h2{font-size:24px;margin:0}.kobe-history h3{font-size:23px;margin:20px 0 2px}.kobe-history p{margin:12px 0}.kobe-history__notice{font-size:14px;color:#c4c8ce;border-bottom:1px solid #555d68;padding-bottom:14px}.kobe-history__list{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.kobe-history button{font:inherit;border:1px solid #7c8797;background:#293440;color:#f5f0e5;border-radius:4px;padding:7px 13px;cursor:pointer}.kobe-history button[aria-current=true]{background:#595239;border-color:#d4bf84}.kobe-history button:focus-visible,.kobe-history a:focus-visible{outline:3px solid #e8d394;outline-offset:3px}.kobe-history__ja{font-family:"Noto Sans JP","Noto Sans TC",sans-serif;font-size:15px;color:#bdc9d8}.kobe-history__body{font-size:18px;max-width:65ch}.kobe-history ul{padding-left:22px}.kobe-history__qualifiers{font-size:14px;color:#c5cbd3}.kobe-history a{color:#b9d8fa;text-decoration:underline}.kobe-history__hint{font-size:13px;color:#bcc2ca;margin-bottom:0}.kobe-history__badge{font-size:13px;letter-spacing:.08em;color:#e1c889}`;

// The caller uses onOpen/onClose to pause/resume simulation and unlock/relock pointer input.
// No global hotkey is claimed: the game can bind KeyJ or an E-interaction to toggle/open.
export class HistoryReader {
  constructor({document=globalThis.document,parent,onOpen=()=>{},onClose=()=>{},onRead=()=>{}}={}) {
    if(!document?.createElement)throw new TypeError('HistoryReader needs a DOM document');
    this.document=document;this.onOpen=onOpen;this.onClose=onClose;this.onRead=onRead;this.read=new Set();this.selected=HISTORY_CARDS[0].id;this.previousFocus=null;this.disposed=false;
    const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
    if(!document.getElementById('kobe-history-style')) {const s=node('style',null,css);s.id='kobe-history-style';(document.head||document.body).appendChild(s);}
    this.root=node('section','kobe-history');this.root.hidden=true;this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','神戶史實圖鑑');this.root.lang='zh-Hant';
    const panel=node('div','kobe-history__panel'),head=node('div','kobe-history__head');this.root.appendChild(panel);panel.appendChild(head);head.appendChild(node('h2',null,'神戶史實圖鑑'));
    this.closeButton=node('button',null,'返回遊戲');this.closeButton.type='button';this.closeButton.addEventListener('click',()=>this.close());head.appendChild(this.closeButton);
    panel.appendChild(node('p','kobe-history__notice',HISTORY_NOTICE));
    this.list=node('nav','kobe-history__list');this.list.setAttribute('aria-label','選擇史實卡');panel.appendChild(this.list);this.buttons=new Map();
    for(const c of HISTORY_CARDS) {const b=node('button',null,c.title);b.type='button';b.addEventListener('click',()=>this.open(c.id));this.list.appendChild(b);this.buttons.set(c.id,b);}
    this.article=node('article');panel.appendChild(this.article);
    panel.appendChild(node('p','kobe-history__hint','閱讀可隨時中止，不影響任務。官方來源會由你點選後另開分頁。'));
    this.keyHandler=e=>{
      if(!this.isOpen)return;
      if(e.code==='Escape'){e.preventDefault();e.stopPropagation();this.close();}
      if(e.code==='Tab') {
        const links=[this.closeButton,...this.buttons.values(),...this.article.querySelectorAll('a')],i=links.indexOf(document.activeElement);
        if((e.shiftKey&&i<=0)||(!e.shiftKey&&(i<0||i===links.length-1))){e.preventDefault();(e.shiftKey?links.at(-1):links[0]).focus();}
      }
    };
    this.root.addEventListener('keydown',this.keyHandler);(parent||document.body).appendChild(this.root);this._render();
  }
  get isOpen(){return !this.root.hidden&&!this.disposed;}
  _render() {
    const c=historyCard(this.selected),d=this.document;
    this.article.replaceChildren();
    const add=(tag,className,text)=>{const e=d.createElement(tag);if(className)e.className=className;e.textContent=text;this.article.appendChild(e);return e;};
    add('p','kobe-history__badge','史實｜官方來源核對');add('h3',null,c.title);add('p','kobe-history__ja',c.nameJa).lang='ja';add('p','kobe-history__body',c.text);
    const notes=add('ul','kobe-history__qualifiers','');for(const t of c.qualifiers){const li=d.createElement('li');li.textContent=t;notes.appendChild(li);}
    add('p',null,'官方資料');const sources=add('ul',null,'');c.sourceUrls.forEach((url,i)=>{const li=d.createElement('li'),a=d.createElement('a');a.href=url;a.textContent=c.sourceLabels[i];a.target='_blank';a.rel='noopener noreferrer';li.appendChild(a);sources.appendChild(li);});
    this.buttons.forEach((b,id)=>b.setAttribute('aria-current',String(id===c.id)));
  }
  open(id=this.selected) {
    if(this.disposed||!historyCard(id))return false;
    const wasOpen=this.isOpen;if(!wasOpen){this.previousFocus=this.document.activeElement;this.root.hidden=false;this.onOpen();}
    this.selected=id;this._render();if(!this.read.has(id)){this.read.add(id);this.onRead(id);}if(!wasOpen)this.closeButton.focus();return true;
  }
  close() {
    if(!this.isOpen)return false;
    this.root.hidden=true;this.onClose();this.previousFocus?.focus?.();this.previousFocus=null;return true;
  }
  toggle(id){return this.isOpen?(this.close(),false):this.open(id);}
  snapshot(){return {version:1,read:[...this.read],selected:this.selected};}
  restore(s) {
    if(s===undefined||s===null){this.read.clear();this.selected=HISTORY_CARDS[0].id;this._render();return true;}
    if(s.version!==1||!Array.isArray(s.read)||new Set(s.read).size!==s.read.length||s.read.some(id=>!historyCard(id))||!historyCard(s.selected))return false;
    this.read=new Set(s.read);this.selected=s.selected;this._render();return true;
  }
  dispose(){if(this.disposed)return;this.close();this.root.removeEventListener('keydown',this.keyHandler);this.root.remove();this.disposed=true;}
}
