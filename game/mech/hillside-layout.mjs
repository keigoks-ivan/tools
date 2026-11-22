// 山麓疏散道路。每段各有公路、山側兩個攔截點，車隊在後線待命。
export const HILL_LINES = [
  {name:'山腳巴士場', posts:[[-406,68,'巴士總站'],[-389,-78,'候車廊']], reserves:['tank grunt tank','grunt brawler grunt']},
  {name:'坡道住宅區', posts:[[-240,118,'坡道口'],[-210,-70,'診所庭院']], reserves:['grunt heavy tank','brawler grunt brawler']},
  {name:'山溪引道', posts:[[-58,95,'公路橋頭'],[-25,-93,'步道橋頭']], reserves:['heavy tank grunt','grunt brawler heavy']},
  {name:'配水池台地', posts:[[133,62,'配水場南門'],[157,-134,'北側水塔']], reserves:['tank heavy tank','brawler grunt heavy']},
  {name:'林道轉運場', posts:[[323,101,'林道下口'],[355,-101,'纜車舊站']], reserves:['heavy tank grunt','grunt brawler brawler']},
  {name:'疏散隧道', posts:[[506,77,'隧道引道'],[542,-75,'換氣井']], reserves:['heavy grunt tank','brawler heavy grunt']},
];
// 商店街在兩條疏散道路之間，東口進街、十字路口分往兩翼。
export const HILL_ALLEY=[[-337,0],[-222,0],[-119,0]];
// 住宅街沿商店街與兩翼排列。相鄰兩跨共用外觀，各自保有可破壞的外牆、樓板和碰撞。
export const HILL_LOTS=[
  // 中心 x、z、寬、深、樓層、立面樣式
  [-291,174,31,21,4,3],[-229,179,34,22,3,2],[-173,167,29,21,4,4],
  [-262,-121,31,20,4,4],[-191,-130,43,23,5,3],[-150,-142,25,16,3,2],
  [-314,33,31,25,4,2],[-276,48,23,19,5,3],[-193,34,26,24,4,4],[-143,34,31,27,6,3],
  [-308,-29,38,24,5,3],[-258,-26,27,20,3,4],[-185,-30,24,21,5,3],[-138,-27,28,22,4,2],
];
export const HILL_VANGUARD=['tank grunt heavy','grunt brawler grunt'];
export const HILL_RAID=['brawler grunt brawler tank','grunt tank heavy'];
export const HILL_RELIEF=['heavy grunt brawler','grunt tank'];
export const HILL_EXIT=[627,10];
// 兩翼各有前沿、後撤掩體，兩翼之間再設一處可停靠的轉角。
export const HILL_COVER = HILL_LINES.flatMap(({posts},sector)=>{
  const walls=posts.flatMap(([x,z],i)=>{
    const side=i?-1:1;
    return [
      {x:x-18,z:z-side*(sector===0&&!i?25:19),w:9,d:19,h:18,type:(sector+i)%3},
      {x:x-64,z:z+side*(sector===3&&!i?32:21),w:13,d:16,h:20,type:(sector+i+1)%3},
    ];
  });
  walls.push({x:(posts[0][0]+posts[1][0])/2-32,z:(posts[0][1]+posts[1][1])/2,w:12,d:24,h:19,type:2});
  return walls;
});
export const HILL_ROUTE = {
  cp:[1,2,3,4,5], arena:145, fin:50, par:560, over:2,
  pts:[[-579,6],...HILL_LINES.flatMap(l=>l.posts.map(([x,z])=>[x,z])),HILL_EXIT],
  secs:HILL_LINES.map((line,i)=>({at:2+i*2,
    amb:HILL_VANGUARD.join(' ').replaceAll('brawler','brawler@side'),
    amb2:line.reserves.join(' '),amb3:[...HILL_RAID,...HILL_RELIEF].join(' ')})),
};
