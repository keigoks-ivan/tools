// The story routes compress the distances between landmarks into playable sectors.
export const creekX=z=>24*Math.sin(z/135)+12*Math.sin(z/67);
const creekDepth=(x,z)=>5*Math.max(0,Math.min(1,(31-Math.abs(x-creekX(z)))/14));

export const INLAND_STAGES=[
  {
    name:'溪岸上的證人',en:'THE SILENT BANK',fieldLabel:'北投・溫泉溪谷',battlefield:'taipei',music:2,score:'ridgeline',tier:3,
    tip:'沿溪岸移動，橋頭可以換岸。摧毀橋頭的敵方截訊站後就能脫離追兵。',
    brief:['關渡的空船上只有一張濕透的照片。背面寫著北投，正面是領航員領著幾個人走過溪橋。','阿澄終於認出拍照的人。「是我。我把那天的事剪掉了。」水位站當年的影像備份還在，但守橋機切斷了它的傳輸。'],
    start:[['領航員','影像拍到了水位尺。你們看時間，我看那天水漲到哪裡。']],
    end:[['阿澄','這一格……船上還有七個人。我當年照著空船的名冊報了平安。'],['白隼','松菸的避難站留過紙本。我帶你去找他們的名字。']],
    route:{district:'beitou',riverBed:creekDepth,cp:[2,4,6],arena:96,fin:52,par:480,pts:[[-72,-535],[-68,-390],[-63,-242],[78,-242],[84,-75],[74,63],[-76,63],[-89,218],[-78,362],[79,362],[90,501]],secs:[
      {at:1,amb:'grunt@out tank@far',tip:'從下游沿林蔭步道上行'},
      {at:2,amb:'brawler@side grunt@out',amb2:'heli@rise',tip:'穿過舊浴場前庭，奪回第一座橋的入口'},
      {at:3,amb:'heavy@out grunt@side',strike:true,boss:{kind:'heavy',where:'out',name:'東岸守橋機',ap:1.2},tip:'擊毀東岸守橋機，打開水位站的傳輸線',clear:[['領航員','看照片的倒影。第二座橋的下游才有刻度，不是上游。']]},
      {at:5,amb:'tank@out heli@far',amb2:'ace@drop',tip:'貼東岸上行，穿過水尺旁的火線'},
      {at:6,amb:'heavy@out brawler@side',strike:true,targets:[{name:'橋頭截訊站',x:-63,z:81}],tip:'擊毀橋頭截訊站，讓水位影像傳回河岸'},
      {at:8,amb:'grunt@side*2 heli@rise',amb2:'ace@out tank@far',tip:'利用溪彎甩開追兵，抵達第三座橋'},
      {at:10,amb:'heavy@out heli@rise',amb2:'ace@drop brawler@side',tip:'突破谷口，讓北投的影像安全傳出'},
    ]},
  },{
    name:'七個空格',en:'THE PAPER REGISTER',fieldLabel:'松菸・舊製菸廠',battlefield:'taipei',music:3,score:'supply',tier:4,
    tip:'沿卸貨線追擊敵方壓制車。離開庫房轉角，再放開羽標齊射。',
    brief:['松菸避難站保留著當年的紙本簽名。志工翻到那一頁時，倉庫外的壓制車開始播報七個錯誤的名字。','當年接過名冊的志工還在。他會在頻道恢復後逐一讀出簽名，請阿澄跟著讀一次。'],
    start:[['志工','我在鍋爐房看著你。鍋爐房外那座干擾台正壓著我的聲音。你打掉它，我翻名冊。']],
    end:[['阿澄','七個簽名，筆跡都不一樣。我唸完了。'],['志工','你聽見我身後那三下敲擊嗎？每天這個時間，擎天崗就有人回答。']],
    route:{district:'songyan',cp:[2,4,6],arena:91,fin:48,par:500,pts:[[-495,-118],[-326,-118],[-165,-118],[-165,65],[-18,65],[154,65],[154,-124],[327,-124],[327,82],[488,82]],secs:[
      {at:1,amb:'tank@far grunt@side',amb2:'brawler@out',tip:'沿卸貨側廊進入園區'},
      {at:2,amb:'grunt@out*2 heli@rise',strike:true,targets:[{name:'庫房干擾台',x:-187,z:-119}],tip:'擊毀庫房外的干擾台，接通鍋爐房的志工'},
      {at:3,amb:'heavy@out brawler@side',amb2:'tank@far grunt@drop',tip:'穿過園區庭院，從側門繞到倉庫後方'},
      {at:4,amb:'ace@out grunt@side',tip:'沿池岸轉進裝卸線，追查敵方車隊',clear:[['志工','主車離開倉庫了。訊號最強的那輛，就是它。']]},
      {at:5,amb:'heavy@drop heli@far',amb2:'brawler@side',strike:true,boss:{name:'裝卸線壓制車',kind:'tank',where:'out',ap:16},tip:'沿裝卸線攔截並擊毀壓制車'},
      {at:7,amb:'grunt@out*2 ace@side',amb2:'heavy@out heli@rise',tip:'從廠房背面脫離，打通志工的備用頻道'},
      {at:9,amb:'heavy@drop grunt@side',amb2:'ace@out heli@far',targets:[{name:'倉庫重播台',x:469,z:94}],tip:'摧毀重播台並清除追兵，聽志工唸出七個名字'},
    ]},
  },{
    name:'風裡的停頓',en:'BEFORE THE THIRD KNOCK',fieldLabel:'擎天崗・草原稜線',battlefield:'taipei',music:4,score:'ridgeline',tier:5,
    tip:'草原缺少高掩體。利用反斜面換位，再升空攔截重播機。',
    brief:['山上的救援站接收了七名乘客，卻不肯打開通話頻道。每一次呼叫，山谷都會傳回一模一樣的回答。','一個孩子在麥克風上敲了三下。第三下之前，她停了很久。白隼決定帶著那段空白上山。'],
    start:[['阿澄','他們沒有忘記我們。是他們先學會了，怎麼在這種聲音裡活下來。']],
    end:[['山上女孩','我怕，所以最後一下敲慢了。可以幫我問，我爸到岸了嗎？'],['領航員','我就在河邊。白隼，帶她的聲音去信義，這次讓我來答。']],
    route:{district:'grassland',cp:[2,4,6],arena:130,fin:58,par:520,pts:[[-395,-420],[-325,-288],[-153,-308],[-84,-124],[106,-75],[190,58],[65,168],[217,295],[350,418]],secs:[
      {at:1,amb:'heli@far grunt@side',tip:'沿牧柵爬上第一道草坡'},
      {at:2,amb:'tank@out heli@rise*2',strike:true,targets:[{name:'古道截訊站',x:-138,z:-320}],tip:'擊毀古道旁的敵方截訊站，讓第一段敲擊傳下山'},
      {at:3,amb:'heavy@out grunt@drop',amb2:'ace@side',tip:'切入鞍部，利用稜線擋開遠距火力'},
      {at:4,amb:'heli@rise ace@drop',strike:true,boss:{kind:'heli',where:'far',name:'山脊重播機',ap:15},tip:'爬升截擊山脊重播機，讓山站聽清兩聲之間的停頓'},
      {at:5,amb:'brawler@out*2 heli@far',amb2:'heavy@drop',tip:'越過牧場石牆，轉進背風坡'},
      {at:7,amb:'heli@far*2 grunt@side',amb2:'ace@drop heli@rise',strike:true,targets:[{name:'北坡偽訊號塔',x:203,z:282}],tip:'擊毀北坡偽訊號塔，讓孩子直接向河岸呼叫'},
      {at:8,amb:'heli@rise*2 heavy@out',amb2:'ace@drop heli@far*2',tip:'打通稜線離場航道，帶著原聲返回信義'},
    ]},
  },
];
