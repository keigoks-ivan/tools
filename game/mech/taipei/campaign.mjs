import {INLAND_STAGES} from './inland.mjs';
import {riverDepth} from './rivers.mjs';

// Local mission layouts compress the distances between the real landscape references.
export const TAIPEI_STAGES = [
  {
    name:'雨棚下的聲音', en:'AFTER THE RAIN', fieldLabel:'大稻埕・街屋', battlefield:'taipei', music:1, score:'ridgeline', tier:2,
    tip:'沿騎樓找藍色雨棚。掠翼在移動時更容易打斷敵機。',
    brief:['雨停了，茶行的呼叫器卻還在響。維修員阿澄聽出那是她哥哥，三天前失聯的河運領航員。','「別讓那艘船自己回去。」訊號斷了。白隼要讓茶街的電台重新發聲，查清楚他在哪裡。'],
    start:[['阿澄','後街那家茶行還在播他的留言。藍色雨棚前有人架了一座干擾台。'],['白隼','我從南街進去。先別回覆呼叫。']],
    end:[['領航員・錄音','我沒叫你來。船上的東西學會了我的聲音。'],['阿澄','可我剛剛……還跟它說了碼頭在哪裡。']],
    route:{district:'arcade',cp:[2,4,6],arena:85,fin:42,par:460,pts:[[0,-395],[0,-275],[120,-275],[120,-155],[120,-55],[0,-55],[0,90],[120,90],[120,278],[0,278],[0,391]],secs:[
      {at:1,amb:'grunt@out',amb2:'tank@out grunt@side',tip:'沿街往北，以掠翼側移試射'},
      {at:2,amb:'grunt@side tank@far',amb2:'brawler@out grunt@drop',tip:'穿過轉角市集，從兩排攤棚間突破',clear:[['阿澄','聽到捲門了。往北走，牆上藍色的是老闆今天撐的雨棚。']]},
      {at:4,amb:'brawler@side grunt@out',strike:true,targets:[{x:115,z:-83,name:'茶街干擾台'}],tip:'擊毀藍棚前的干擾台，讓茶行的留言播出去',clear:[['白隼','聽見船笛了。有人循著廣播追過來，我帶他們走。']]},
      {at:5,amb:'grunt@out grunt@side',amb2:'heavy@drop',tip:'引開追兵，穿過茶街回到主街'},
      {at:6,amb:'tank@far brawler@side',amb2:'ace@out grunt@side',tip:'突破北段路口，把錄音送進河運網路',clear:[['領航員・錄音','我聽見對岸回我了。它比我早說了一個字。']]},
      {at:8,amb:'heli@rise grunt@side',amb2:'heavy@out brawler@side',strike:true,boss:{kind:'heli',where:'rise',name:'竊頻機',ap:8},tip:'擊落竊頻機，讓堤內電台播出完整呼號'},
      {at:10,amb:'heavy@out grunt@side',amb2:'ace@drop heli@far',tip:'清出北街出口，把河運呼號帶往關渡'},
    ]},
  },
  {
    name:'逆流的回聲',en:'UPSTREAM',fieldLabel:'關渡・雙河匯流',battlefield:'taipei',music:3,score:'supply',tier:3,
    tip:'按住羽標瞄準，放開就發射。敵機聚集時，用白夜羽陣連鎖放電。',
    brief:['從大稻埕沿淡水河抵達關渡，基隆河在這裡匯入。兩艘領航艇正以相同呼號請求放行。','有人準備讓兩艘船一起離岸。阿澄只有兩部河岸接收器，可以分辨哪一艘載著她哥哥。'],
    start:[['阿澄','關渡大橋，三個紅色鋼拱。船都還在橋的上游。上游的干擾機正壓著第一部接收器。']],
    end:[['領航員','這次真的是我。你小時候把我的船漆成紅色，你還記得嗎？'],['阿澄','紅頂船靠岸了。空船的船頭有張照片，看得見北投溪的水位尺。']],
    route:{district:'river',riverBed:riverDepth,cp:[2,4,6],arena:100,fin:48,par:480,pts:[[-524,8],[-360,8],[-240,8],[-80,8],[-80,62],[100,62],[220,62],[320,80],[390,80],[390,8],[571,8],[571,62]],secs:[
      {at:1,amb:'tank@out grunt@side',amb2:'heli@rise',tip:'沿堤內前往上游接收站'},
      {at:2,amb:'tank@out grunt@side',strike:true,boss:{kind:'heli',where:'far',name:'上游干擾機',ap:9},tip:'擊落上游干擾機，讓岸站聽清船上的引擎聲',clear:[['阿澄','兩艘都在說話。只有一道訊號底下有機械運轉的低鳴。']]},
      {at:4,amb:'grunt@out heli@far',amb2:'heavy@out grunt@side',tip:'從倉庫街轉入堤外，自行車道通往浮碼頭'},
      {at:5,amb:'heli@rise*2 tank@out',amb2:'ace@drop',tip:'沿堤岸追上干擾機，鎖定干擾機後放開羽標齊射'},
      {at:6,amb:'heli@far*2 grunt@drop',strike:true,targets:[{name:'下游偽訊號塔',x:229,z:72}],tip:'摧毀下游偽訊號塔，讓阿澄比對兩艘船的呼號',clear:[['阿澄','紅頂的船上有引擎聲。有輛封港車瞄著它。車一倒，我就鬆纜。']]},
      {at:7,amb:'heavy@out heli@far',strike:true,releaseFerry:true,boss:{name:'封港指揮車',kind:'tank',where:'out',ap:12},tip:'擊毀封港指揮車，讓紅頂領航艇離岸',clear:[['領航員','我離岸了。橋那邊有東西從水面升起，當心！']]},
      {at:11,amb:'heavy@out heli@rise',amb2:'ace@drop grunt@side',tip:'穿過引道內側，截住追船的敵機'},
    ]},
  },
  ...INLAND_STAGES,
  {
    name:'最後一盞回話的燈',en:'THE LAST LIGHT',fieldLabel:'信義・空橋',battlefield:'taipei',music:5,score:'stronghold',tier:6,
    tip:'按 T 或「飛行」起飛，再按上升。複聲能模仿呼號，羽標可以辨認本機。',
    brief:['信義所有街口同時傳來小禾的聲音。阿澄聽到第三下敲擊，發現每一路都沒有停頓。真正的小禾還留在山上，等河邊的父親回答。','白隼要從西側街廓打進商圈，斷開複聲的地面轉播和空中備援。101 是辨認方位的地標，準星請對準標記的敵方設備。'],
    start:[['阿澄','先切掉西街的擴音台。我得聽見屋裡的人說話，才能帶他們出去。']],
    end:[['領航員','小禾？我靠岸了。妳敲慢的那一下，我有聽到。'],['山上女孩','爸，你又把船漆紅了嗎？'],['阿澄','七個人，都回話了。這一次我等每一個人說完，再在名字旁邊打勾。']],
    route:{district:'skyline',cp:[2,4,6,8,10,12],arena:140,fin:54,par:1020,
      pts:[[-120,-441],[-120,-306],[-120,-176],[-120,-65],[0,-65],[0,-185],[0,-232],[130,-232],[130,-108],[130,-65],[250,-65],[250,70],[250,110],[130,110],[130,192],[130,278],[0,278],[0,110],[-120,110],[-120,241],[-120,278],[0,278],[0,405],[0,454],[130,454],[130,385]],
      secs:[
        {at:1,amb:'grunt@out tank@far',amb2:'heli@rise grunt@side',tip:'從西側林蔭大道進入封鎖區'},
        {at:2,amb:'grunt@roof*2 heli@far',strike:true,targets:[{x:-111,z:-187,name:'西街擴音台'}],tip:'擊毀西街擴音台，打開疏散廣播',clear:[['居民','我們聽得到！樓上還有人，把樓梯口留給我們。']]},
        {at:4,amb:'heavy@out brawler@side',amb2:'ace@drop tank@far',tip:'從西街轉進百貨外街，突破裝甲封鎖'},
        {at:6,amb:'heli@rise grunt@roof',amb2:'heavy@out ace@side',tip:'逆向穿過第一座空橋，切進百貨間的步行街'},
        {at:7,amb:'brawler@side heli@far',strike:true,boss:{kind:'ace',where:'drop',name:'頻段搬運機',ap:1.45},tip:'攔截頻段搬運機，阻止它把假廣播送往東街',clear:[['阿澄','它送走的是空頻道。真的備援站已經開機了，往東看！']]},
        {at:9,amb:'grunt@roof*2 tank@out',amb2:'heavy@out heli@rise',tip:'沿空橋推進，在東側十字路口擊退第二梯隊'},
        {at:10,amb:'heavy@out heli@far',strike:true,targets:[{x:240,z:-86,name:'東街北側中繼台'},{x:241,z:-42,name:'東街南側中繼台'}],tip:'從不同射角拆掉兩座中繼台，斷開地面迴路'},
        {at:12,amb:'heli@rise*2',amb2:'ace@drop heli@far*2',tip:'沿東側外街迎擊空中增援，爭取返航高度',clear:[['山上女孩','阿姨，我剛才只敲了兩下。第三下怎麼自己響了？']]},
        {at:14,amb:'grunt@out heli@rise',strike:true,boss:{kind:'heli',where:'far',name:'空中重播機',ap:18},tip:'起飛追擊空中重播機，切斷多出來的第三聲'},
        {at:16,amb:'ace@out grunt@roof',amb2:'heavy@drop brawler@side',tip:'回到廣場西口，突破機甲交叉火線'},
        {at:18,amb:'heavy@out tank@far',amb2:'heli@rise*2 ace@drop',tip:'穿越市府街廓，從反方向打進重播車隊'},
        {at:20,amb:'ace@side heli@far',strike:true,boss:{kind:'tank',where:'out',name:'假呼號主機車',ap:18},tip:'擊毀主機車，讓七名乘客逐一回話',clear:[['阿澄','我關掉市府的燈了。你看，還有一處在閃。複聲藏在那裡。']]},
        {at:23,amb:'heavy@out grunt@roof',amb2:'ace@side heli@rise',amb3:'brawler@drop*2',tip:'從捷運站口突破近衛隊，沿 101 街廓繞到廣場'},
        {at:25,amb:'grunt@side heli@far',tip:'擊破廣場上的複聲，讓河岸收到最後的回話',boss:{kind:'ace',name:'複聲',echo:true,ap:2.75,where:'drop',halfWave:'heli@far*2',half:[['複聲','爸，我靠岸了。你靠岸了。我……'],['阿澄','聲音疊在一起了。等干擾停下，或用羽標標出本機。']],lowWave:'brawler@side',low:[['阿澄','河邊聽得到山上的風了。最後一層，就在你面前。']],down:[['白隼','複聲已停機。河岸頻道，現在交給你們。']]}},
      ]},
  },
];
