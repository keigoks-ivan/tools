// The story routes compress the distances between landmarks into playable sectors.
export const creekX=z=>24*Math.sin(z/135)+12*Math.sin(z/67);
const creekDepth=(x,z)=>5*Math.max(0,Math.min(1,(31-Math.abs(x-creekX(z)))/14));

export const INLAND_STAGES=[
  {
    name:'溪床裡的底片',en:'THE SILENT BANK',fieldLabel:'北投・溫泉溪谷',battlefield:'taipei',music:2,score:'ridgeline',tier:3,
    tip:'沿溪岸移動，橋頭可以換岸。拿到底片就能脫離追兵。',
    brief:['關渡的空船上只有一張濕透的照片。背面寫著北投，正面是領航員抱著一捲底片走過溪橋。','阿澄終於認出拍照的人。「是我。我把那天的事剪掉了。」底片上還留著沒有剪過的水位紀錄。'],
    start:[['領航員','我放在溪對面，水位尺下面。人可以改口，那根尺不會。']],
    end:[['阿澄','這一格……船上還有七個人。我當年照著空船的名冊報了平安。'],['白隼','松菸的避難站留過紙本。我帶你去找他們的名字。']],
    route:{district:'beitou',riverBed:creekDepth,cp:[2,4,6],arena:96,fin:52,par:480,pts:[[-72,-535],[-68,-390],[-63,-242],[78,-242],[84,-75],[74,63],[-76,63],[-89,218],[-78,362],[79,362],[90,501]],secs:[
      {at:1,amb:'grunt@out tank@far',tip:'從下游沿林蔭步道上行'},
      {at:2,amb:'brawler@side grunt@out',amb2:'heli@rise',tip:'穿過舊浴場前庭，奪回第一座橋的入口'},
      {at:3,amb:'heavy@out grunt@side',pickup:{name:'水位記錄器',x:76,z:-218},tip:'過橋讀取水位，找出收藏底片的位置',clear:[['領航員','看照片的倒影。第二座橋的下游才有刻度，不是上游。']]},
      {at:5,amb:'tank@out heli@far',amb2:'ace@drop',tip:'貼東岸上行，穿過水尺旁的火線'},
      {at:6,amb:'heavy@out brawler@side',breakContact:true,pickup:{name:'防水底片筒',portable:true,x:-64,z:78},tip:'取回橋頭的底片筒，立刻向上游撤離'},
      {at:8,amb:'grunt@side*2 heli@rise',amb2:'ace@out tank@far',tip:'利用溪彎甩開追兵，抵達第三座橋'},
      {at:10,amb:'heavy@out heli@rise',amb2:'ace@drop brawler@side',tip:'突破谷口，帶底片離開北投'},
    ]},
  },{
    name:'七個空格',en:'THE PAPER REGISTER',fieldLabel:'松菸・舊製菸廠',battlefield:'taipei',music:3,score:'supply',tier:4,
    tip:'庫房間的封存車還在移動。沿地面雙軌追上車側就能取件。',
    brief:['松菸避難站關閉時，志工把紙本簽名留在一台封存車上。今天凌晨，車子又開始沿廠區來回搬運。','當年接過名冊的志工還在。他答應交出紙本，只要求阿澄親口念出漏報的名字。'],
    start:[['志工','我在鍋爐房看著你。先來拿索引卡，沒有編號，五座倉庫夠你找上一夜。']],
    end:[['阿澄','七個簽名，筆跡都不一樣。我唸完了。'],['志工','你聽見我身後那三下敲擊嗎？每天這個時間，擎天崗就有人回答。']],
    route:{district:'songyan',cp:[2,4,6],arena:91,fin:48,par:500,pts:[[-495,-118],[-326,-118],[-165,-118],[-165,65],[-18,65],[154,65],[154,-124],[327,-124],[327,82],[488,82]],secs:[
      {at:1,amb:'tank@far grunt@side',amb2:'brawler@out',tip:'沿卸貨側廊進入園區'},
      {at:2,amb:'grunt@out*2 heli@rise',pickup:{name:'庫房索引卡',portable:true,x:-184,z:-113},tip:'到鍋爐房外取索引卡，查出封存車編號'},
      {at:3,amb:'heavy@out brawler@side',amb2:'tank@far grunt@drop',tip:'穿過園區庭院，從側門繞到倉庫後方'},
      {at:4,amb:'ace@out grunt@side',tip:'沿池岸轉進裝卸線，注意綠色車燈',clear:[['志工','推車反光帶是白的，車燈是綠的。靠近就拿得到，別朝車開火。']]},
      {at:5,amb:'heavy@drop heli@far',amb2:'brawler@side',breakContact:true,pickup:{name:'移動封存車',x:112,z:74,travel:48,verb:'已取件'},tip:'沿雙軌攔截封存車，取回紙本名冊'},
      {at:7,amb:'grunt@out*2 ace@side',amb2:'heavy@out heli@rise',tip:'從廠房背面脫離，帶名冊到核對桌'},
      {at:9,amb:'heavy@drop grunt@side',amb2:'ace@out heli@far',pickup:{name:'簽名核對桌',x:466,z:86},tip:'接上桌面的讀卡機，核實七個簽名'},
    ]},
  },{
    name:'風裡的停頓',en:'BEFORE THE THIRD KNOCK',fieldLabel:'擎天崗・草原稜線',battlefield:'taipei',music:4,score:'ridgeline',tier:5,
    tip:'草原缺少高掩體。利用反斜面換位，起飛才能接上空中的收訊頭。',
    brief:['山上的救援站接收了七名乘客，卻不肯打開通話頻道。每一次呼叫，山谷都會傳回一模一樣的回答。','一個孩子在麥克風上敲了三下。第三下之前，她停了很久。白隼決定帶著那段空白上山。'],
    start:[['阿澄','他們沒有忘記我們。是他們先學會了，怎麼在這種聲音裡活下來。']],
    end:[['山上女孩','我怕，所以最後一下敲慢了。可以幫我問，我爸到岸了嗎？'],['領航員','我就在河邊。白隼，帶她的聲音去信義，這次讓我來答。']],
    route:{district:'grassland',cp:[2,4,6],arena:130,fin:58,par:520,pts:[[-395,-420],[-325,-288],[-153,-308],[-84,-124],[106,-75],[190,58],[65,168],[217,295],[350,418]],secs:[
      {at:1,amb:'heli@far grunt@side',tip:'沿牧柵爬上第一道草坡'},
      {at:2,amb:'tank@out heli@rise*2',pickup:{name:'古道接收機',x:-140,z:-308},tip:'在古道城門旁收下第一段敲擊'},
      {at:3,amb:'heavy@out grunt@drop',amb2:'ace@side',tip:'切入鞍部，利用稜線擋開遠距火力'},
      {at:4,amb:'heli@rise*2 ace@drop',pickup:{name:'測風桅收訊頭',x:112,z:-61,alt:36},tip:'爬升接近桅頂，補回訊號中間的靜默'},
      {at:5,amb:'brawler@out*2 heli@far',amb2:'heavy@drop',tip:'越過牧場石牆，轉進背風坡'},
      {at:7,amb:'heli@far*2 grunt@side',amb2:'ace@drop heli@rise',pickup:{name:'山站錄音帶',portable:true,x:208,z:280},tip:'降落在山站，接過孩子親手錄的第三聲'},
      {at:8,amb:'heli@rise*2 heavy@out',amb2:'ace@drop heli@far*2',tip:'打通稜線離場航道，帶著原聲返回信義'},
    ]},
  },
];
