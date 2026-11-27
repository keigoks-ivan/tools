export const HEIGHT=138, DECK=27;
function course(district,name,en,fieldLabel,brief,start,end,pts,opposition,par,score){
  const secs=opposition.map((amb,i)=>({at:i+1,amb}));
  return {battlefield:'simulation',name,en,fieldLabel,brief,tip:brief[1],start:[['演習管制',start]],end:[['演習管制',end]],
    route:{district,pts,secs,cp:[],fin:45,arena:90,par},tier:3,music:4,score};
}
export const SIM_STAGES=[
  course('fold','倒懸城','INVERTED CITY','重力演習',
    ['第一次看見哨機從樓頂墜落的人，都以為它要摔壞了。直到那台機甲在頭頂的街道站起來，把炮口轉向地面。','消滅哨機後，起飛穿過亮起的重力環。最後的「倒影」擁有兩具輪流開火的機身，可以選擇先癱瘓哪一具。'],
    '別只盯著街角。看那台哨機往哪裡落。','雙城脫離同步。你先打斷的那具機身，決定了另一具最後採用的攻勢。',
    [[0,-295],[0,-140],[0,-96],[0,95],[0,195],[0,310]],['grunt@out','grunt@out','ace@out heavy@out','grunt@out','ace@out heavy@out'],365,'encircled'),
  course('echo','殘響迴廊','THE SECOND PASS','殘影演習',
    ['兩支友軍分隊被隔在迴廊兩翼。控制席必須同時有人，第一次進去的只有你。','任選一側，打通支廊並踏上救援台。系統會倒帶，上一輪的你會重走原路、重放射擊。第二輪請走另一側。'],
    '你怎麼開火，紀錄就怎麼留下。走到你要替下一輪守住的位置。','兩組友軍的識別燈都亮了。回看紀錄，第一個來幫你的人就是你自己。',
    [[0,-215],[0,-20],[0,65],[0,185],[0,272]],['grunt@out*2','grunt@out*2','ace@out heavy@out','heavy@out'],340,'supply'),
  course('rail','裂軌列車','SPLIT RAIL','高速接舷',
    ['三列磁浮裝甲車穿進暴雨。每逢岔道，三條軌道會短暫靠攏，隨後整列車都會錯開。','在車頂交火，跳躍或飛行換車。錯過並行窗口可以等下一次，最後的頭目會跳上你所在的列車。'],
    '先站穩。你腳下是中央列車的最後三節，前面還有兩列。','三列車同時穿出雨牆。最後一個從車頂回來的是你。',
    [[0,-175],[0,-60],[-44,0],[-44,130],[44,180],[0,225]],['grunt@out*2','grunt@out','ace@out*2','heavy@out*2','heavy@out ace@out'],390,'stronghold')
];
