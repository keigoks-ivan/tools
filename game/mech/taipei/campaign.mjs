import {INLAND_STAGES} from './inland.mjs';
import {riverDepth} from './rivers.mjs';

// Local mission layouts compress the distances between the real landscape references.
export const TAIPEI_STAGES = [
  {
    name:'雨棚下的聲音', en:'AFTER THE RAIN', fieldLabel:'大稻埕・街屋', battlefield:'taipei', music:1, score:'ridgeline', tier:2,
    tip:'沿騎樓找藍色雨棚。掠翼在移動時更容易打斷敵機。',
    brief:['雨停了，茶行的呼叫器卻還在響。維修員阿澄聽出那是她哥哥，三天前失聯的河運領航員。','「別讓那艘船自己回去。」訊號斷了。白隼要帶回錄音匣，查清楚他在哪裡。'],
    start:[['阿澄','他把備份藏在進貨的茶箱裡。我記得那間店，後街，藍色雨棚。'],['白隼','我從南街進去。先別回覆呼叫。']],
    end:[['領航員・錄音','我沒叫你來。船上的東西學會了我的聲音。'],['阿澄','可我剛剛……還跟它說了碼頭在哪裡。']],
    route:{district:'arcade',cp:[2,4,6],arena:85,fin:42,par:460,pts:[[0,-395],[0,-275],[120,-275],[120,-155],[120,-55],[0,-55],[0,90],[120,90],[120,278],[0,278],[0,391]],secs:[
      {at:1,amb:'grunt@out',amb2:'tank@out grunt@side',tip:'沿街往北，以掠翼側移試射'},
      {at:2,amb:'grunt@side tank@far',amb2:'brawler@out grunt@drop',tip:'穿過轉角市集，從兩排攤棚間突破',clear:[['阿澄','聽到捲門了。往北走，牆上藍色的是老闆今天撐的雨棚。']]},
      {at:4,amb:'brawler@side grunt@out',breakContact:true,pickup:{portable:true,x:110,z:-83,name:'錄音匣'},tip:'接近藍棚前的茶箱，取匣後可以直接脫離',clear:[['白隼','拿到了。它在箱上留了定位訊號，我們有人跟。']]},
      {at:5,amb:'grunt@out grunt@side',amb2:'heavy@drop',tip:'引開追兵，穿過茶街回到主街'},
      {at:6,amb:'tank@far brawler@side',amb2:'ace@out grunt@side',tip:'突破北段路口，把錄音送進河運網路',clear:[['領航員・錄音','我聽見對岸回我了。它比我早說了一個字。']]},
      {at:8,amb:'heli@rise grunt@side',amb2:'heavy@out brawler@side',pickup:{x:111,z:269,name:'轉播箱'},tip:'到堤內轉播箱，解開錄音裡第二層呼號'},
      {at:10,amb:'heavy@out grunt@side',amb2:'ace@drop heli@far',tip:'清出北街出口，把河運呼號帶往關渡'},
    ]},
  },
  {
    name:'逆流的回聲',en:'UPSTREAM',fieldLabel:'關渡・雙河匯流',battlefield:'taipei',music:3,score:'supply',tier:3,
    tip:'按住羽標瞄準，放開就發射。敵機聚集時，用白夜羽陣連鎖放電。',
    brief:['從大稻埕沿淡水河抵達關渡，基隆河在這裡匯入。兩艘領航艇正以相同呼號請求放行。','有人準備讓兩艘船一起離岸。阿澄只有兩部河岸接收器，可以分辨哪一艘載著她哥哥。'],
    start:[['阿澄','關渡大橋，三個紅色鋼拱。船都還在橋的上游。先去聽第一部接收器。']],
    end:[['領航員','這次真的是我。你小時候把我的船漆成紅色，你還記得嗎？'],['阿澄','紅頂船靠岸了。空船的船頭有張照片，看得見北投溪的水位尺。']],
    route:{district:'river',riverBed:riverDepth,cp:[2,4,6],arena:100,fin:48,par:480,pts:[[-524,8],[-360,8],[-240,8],[-80,8],[-80,62],[100,62],[220,62],[320,80],[390,80],[390,8],[571,8],[571,62]],secs:[
      {at:1,amb:'tank@out grunt@side',amb2:'heli@rise',tip:'沿堤內前往上游接收站'},
      {at:2,amb:'heli@far tank@out',pickup:{x:-246,z:14,name:'上游接收器'},tip:'接上第一部接收器，記下訊號背景',clear:[['阿澄','兩艘都在說話。只有一道訊號底下有機械運轉的低鳴。']]},
      {at:4,amb:'grunt@out heli@far',amb2:'heavy@out grunt@side',tip:'從倉庫街轉入堤外，自行車道通往浮碼頭'},
      {at:5,amb:'heli@rise*2 tank@out',amb2:'ace@drop',tip:'沿堤岸追上干擾機，鎖定干擾機後放開羽標齊射'},
      {at:6,amb:'heli@far*2 grunt@drop',pickup:{x:222,z:57,name:'下游接收器'},tip:'比對第二次收訊，辨認要放行的船',clear:[['阿澄','紅頂的船上有引擎聲。接近它那座放行台，我就鬆纜。']]},
      {at:7,amb:'heavy@out heli@far',pickup:{name:'領航艇放行台',x:287,z:89,decoyX:354,decoyZ:89,releaseFerry:true,verb:'已放行'},tip:'從兩座放行台中選擇紅頂領航艇',clear:[['領航員','我離岸了。橋那邊有東西從水面升起，當心！']]},
      {at:11,amb:'heavy@out heli@rise',amb2:'ace@drop grunt@side',tip:'穿過引道內側，截住追船的敵機'},
    ]},
  },
  ...INLAND_STAGES,
  {
    name:'最後一盞回話的燈',en:'THE LAST LIGHT',fieldLabel:'信義・空橋',battlefield:'taipei',music:5,score:'stronghold',tier:6,
    tip:'按 T 或「飛行」起飛，再按上升。複聲能模仿呼號，羽標可以辨認本機。',
    brief:['信義的疏散廣播開始用山上女孩的聲音喊救命。北投的底片留下登船時間，松菸名冊留下七個名字，擎天崗的錄音留下三下敲擊。','阿澄要白隼把三份紀錄送上空橋。她會在屋頂用燈重打那段停頓，讓河邊的父親第一次接通女兒。'],
    start:[['阿澄','101 旁的空橋還有電。你把底片和名冊送上去，我拿著山上的錄音去屋頂。']],
    end:[['領航員','小禾？我靠岸了。妳敲慢的那一下，我有聽到。'],['山上女孩','爸，你又把船漆紅了嗎？'],['阿澄','七個人，都回話了。這一次我等每一個人說完，再在名字旁邊打勾。']],
    route:{district:'skyline',cp:[2,4,6],arena:140,fin:54,par:520,pts:[[0,-399],[0,-264],[0,-142],[0,-65],[130,-65],[130,50],[130,110],[0,110],[0,278],[130,278],[130,362],[130,407]],secs:[
      {at:1,amb:'grunt@roof heli@far',amb2:'brawler@side',tip:'沿百貨外街接近第一座空橋'},
      {at:2,amb:'heavy@out grunt@roof',amb2:'heli@rise',tip:'從橋下切入或飛越屋頂，突破封鎖'},
      {at:4,amb:'heavy@out heli@far',pickup:{x:145,z:-22,alt:30,mount:'bridge',name:'空橋天線'},tip:'起飛接上空橋天線，上傳底片時間和七人名冊',clear:[['白隼','底片時間對上了。七個席位有七個名字，廣播卻多了一個聲音。']]},
      {at:6,amb:'ace@drop grunt@side',amb2:'heli@rise*2',tip:'沿空橋追蹤延遲的訊號，穿過兩棟百貨之間'},
      {at:8,amb:'grunt@roof*2 heli@rise',amb2:'brawler@side heavy@out',tip:'從廣場上空或側巷突破交錯火線'},
      {at:9,amb:'ace@out heli@far',pickup:{x:157,z:250,name:'屋頂燈號',alt:36.4,mount:'roof',pulse:true,decoyX:128,decoyZ:249,signalHint:'找兩短一停的屋頂燈',wrongLine:'三下等距，是複製的。往有停頓的燈飛。'},tip:'飛到屋頂分辨兩盞閃燈。跟著女孩的節奏，兩短、一停、再一下',clear:[['阿澄','我關燈了。廣場上還在重播的，是複聲。它倒下之後，把廣播放回河岸頻道。']]},
      {at:11,amb:'grunt@side heli@far',pickup:{name:'河岸廣播總機',x:124,z:393,afterBoss:true,verb:'已切回河岸'},tip:'擊破複聲，再降落到廣場切回河岸廣播',boss:{kind:'ace',name:'複聲',ap:2.55,where:'drop',halfWave:'heli@far*2',half:[['複聲','我在對街屋頂，手上這盞燈……'],['阿澄','它開始重播了。等干擾停下再打，或用羽標拆穿它。']],low:[['阿澄','假的訊號斷了。白隼，就是現在。']],down:[['領航員','這裡是河岸。我還沒聽見她。白隼，請接通廣場的總機。']]}},
    ]},
  },
];
