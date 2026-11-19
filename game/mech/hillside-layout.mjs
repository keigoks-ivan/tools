// 山麓的虛構疏散道路。每一橫列都是可以失守、奪回的兩個實體陣地。
export const HILL_LINES = [
  {name:'山腳巴士場', posts:[[-406,68,'巴士總站'],[-389,-78,'候車廊']], reserves:['tank grunt tank','grunt brawler grunt']},
  {name:'坡道住宅區', posts:[[-240,118,'坡道口'],[-210,-70,'診所庭院']], reserves:['grunt heavy tank','brawler grunt brawler']},
  {name:'山溪引道', posts:[[-58,95,'公路橋頭'],[-25,-93,'步道橋頭']], reserves:['heavy tank grunt','grunt brawler heavy']},
  {name:'配水池台地', posts:[[133,62,'配水場南門'],[157,-134,'北側水塔']], reserves:['tank heavy tank','brawler grunt heavy']},
  {name:'林道轉運場', posts:[[323,101,'林道下口'],[355,-101,'纜車舊站']], reserves:['heavy tank grunt','grunt brawler brawler']},
  {name:'疏散隧道', posts:[[506,77,'隧道引道'],[542,-75,'換氣井']], reserves:['heavy grunt tank','brawler heavy grunt']},
];
export const HILL_GARRISON=['tank grunt heavy','grunt brawler grunt'];
export const HILL_RAID=['brawler grunt brawler tank','grunt tank heavy'];
export const HILL_RELIEF=['heavy grunt brawler','grunt tank'];
export const HILL_EXIT=[627,10];
export const HILL_ROUTE = {
  cp:[1,2,3,4,5], arena:145, fin:50, par:560, over:2,
  pts:[[-579,6],...HILL_LINES.flatMap(l=>l.posts.map(([x,z])=>[x,z])),HILL_EXIT],
  secs:HILL_LINES.map((line,i)=>({at:2+i*2,
    amb:HILL_GARRISON.join(' ').replaceAll('brawler','brawler@side'),
    amb2:line.reserves.join(' '),amb3:[...HILL_RAID,...HILL_RELIEF].join(' ')})),
};
