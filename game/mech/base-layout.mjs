// 巷道和開敞機庫門共用的座標。從海堤朝內陸望，機庫區在碼頭右方。
export const BASE_GATE=[247,183];
export const BASE_EXIT=[226,630];
export const BASE_OPS = [
  {id:'gate', name:'基地南門', point:BASE_GATE, entries:[[199,222],[288,220]], hint:'穿過港區聯絡道，打開基地南門', waves:['tank grunt tank grunt','brawler tank grunt heavy','heavy grunt tank grunt']},
  {id:'apron', name:'機體整備坪', point:[242,288], entries:[[190,335],[300,338]], hint:'清出整備坪，取得通往兩翼的道路', waves:['grunt brawler grunt tank','tank heavy tank grunt','brawler grunt heavy grunt']},
  {id:'power', name:'西翼供電所', point:[76,376], entries:[[49,424],[121,423]], hint:'佔領配電控制室，切斷機庫的裝甲修復電源', waves:['heavy grunt tank grunt','brawler brawler grunt heavy','grunt tank heavy grunt']},
  {id:'motor', name:'東翼車輛庫', point:[366,379], bay:{door:[366,400],inside:[366,419],width:50,height:16}, entries:[[318,433],[399,433]], hint:'奪取調度亭，截斷守軍的戰車支援', waves:['tank tank grunt heavy','tank grunt tank brawler','heavy tank grunt tank']},
  {id:'transfer', name:'北區轉運廊', point:[242,452], entries:[[162,491],[309,491]], hint:'兩翼已接通，沿轉運廊攻入第二道圍牆', waves:['brawler grunt brawler tank','heavy grunt tank grunt','brawler heavy tank grunt']},
  {id:'docks', name:'西北機甲塢', point:[91,530], bay:{door:[91,554],inside:[91,577],width:59,height:24}, entries:[[48,573],[146,571]], hint:'進入整備機庫，擊退塢內的機甲梯隊', waves:['heavy grunt heavy grunt','grunt brawler tank grunt','tank heavy brawler grunt']},
  {id:'launch', name:'東北出擊場', point:[352,541], bay:{door:[359,563],inside:[359,583],width:51,height:21}, entries:[[389,586],[300,582]], hint:'從連通道切進出擊場，截下最後的出擊梯隊', waves:['brawler brawler grunt heavy','tank heavy tank grunt','heavy grunt brawler grunt']},
  {id:'hq', name:'基地指揮庭', point:BASE_EXIT, entries:[[173,650],[279,652]], hint:'擊破基地司令機與近衛，接管指揮塔', waves:['heavy tank grunt grunt','brawler heavy grunt brawler','tank heavy grunt grunt']},
];
