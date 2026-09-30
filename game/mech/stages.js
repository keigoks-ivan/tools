// 鋼鐵黃昏：全部關卡的資料（劇情＋路線＋任務），一關一個物件，順序＝第幾關
//   combat.js 讀這裡組出 STAGES；route（沿街推進的遭遇戰）由 encounter.js 的 parse() 解析
//
// ---- 一關的欄位
//   name／en：關名；tip：開場橫幅的小字；music：配樂 1～6（6＝最終曲）；tier：難度 1～6（combat.js 的 TIER，同時出手台數、傷害…）
//   brief：出擊前的簡報卡（幾行字）；start：開機完成後的無線電對白；end：過關後、結算前的對白
//   對白一行＝[說話的人, 內容, NOW?]：NOW＝戰鬥喊話，插隊馬上播（沒寫就排隊）
//   route：遭遇戰（沿街推進，見下面）；沒有 route 的關用 groups（舊式：在你周圍一批批空降）
//
// ---- route 的欄位（沿著固定路線推進，每到一個路口就有伏兵）
// 伏兵寫法：'種類@出現方式*數量'，用空白隔開
//   far＝一開始就停在遠處（狙擊目標）、out＝從前方街上開過來、side＝從封死的支路衝出來、drop＝從天而降到前方街上、
//   roof＝降落在前方樓頂、rise＝直升機從樓後面升起、ring＝（終點區）從四周的街上包過來
//   at＝這一區的錨點（路線第幾個頂點）；pre＝走過來就看得到的遠處目標；amb＝伏擊；amb2、amb3＝打到剩一兩台時的增援（第二、三波）
//   cp＝打到第幾區記一個檢查點；arena＝終點周圍多少公尺不封路；fin＝終點區提早多少公尺觸發；par＝評價用標準時間（秒）；over＝上一波還剩幾台就叫下一波
//   cp 可以是一個數字或陣列（例如 [3, 6]）：清完第幾區記檢查點
//
// ---- 每一區（secs）另外可以加：
//   go：這一區變成下一個目標時講的話；lines：開打（伏兵出現）時講的話；clear：這一區清完時講的話
//   hold：守住幾秒（期間 amb、amb2、amb3 輪流來，gap 秒或剩 over 台就叫下一波；時間到、敵人清光才算過）
//   boss：{ kind: 'ace'|'heavy'|'grunt', name: '黑犬', ap: 血量倍率, where: 'drop'|'roof'|…, flee: 0.3（剩三成就撤退，不會被打死）,
//           half: [...]（剩一半時的對白）, low: [...]（剩兩成半）, fled: [...]（撤退時） } ——跟第一波一起出現，畫面上方有血條
//   targets：[{ x, z, name: '砲兵指揮所' }] 要打爛的城市大樓（找 (x,z) 附近 40 m 內最近的一棟）；這一區要樓都倒了、敵人清光才算過
//
// ---- 城市：路口在 120 m 格線上（x、z＝0、±120、±240…，戰車能開到 ±600），市中心 |x|,|z|<120 是廣場／公園／廢墟

export const OP = '白鷺（指揮所）', ME = '零號', EN = '獵犬軍團通訊', DOG = '黑犬（獵犬軍團）', WOLF = '灰狼（獵犬軍團司令）', ALLY = '第三裝甲連', NOW = true;

export const STAGE_DATA = [
  // ================================================================ 第 1 關
  { name: '初陣', en: 'FIRST SORTIE', tip: '跟著藍色光柱沿街推進——左鍵射擊，Tab 換目標，戰車一發就爆', music: 1, tier: 1,
    brief: ['昨晚，零號在第七機庫啟動了試驗機「蒼焰」，把獵犬軍團趕出了基地。', '首都東區還有一支聯邦裝甲部隊被困在大街上。', '沿著大街推進，打通和他們會合的路。'],
    start: [[OP, '零號，聽得到嗎？這是你第一次在城裡開蒼焰。'], [OP, '第三裝甲連在大街盡頭等你。跟著光柱走。']],
    end: [[ALLY, '……那台是聯邦的機體？我們得救了。'], [OP, '做得好，零號。第三裝甲連跟你會合了。']],
    route:
    { cp: 3, arena: 175, fin: 60, par: 330, over: 1,
      pts: [[-600, -660], [-600, -480], [-360, -480], [-360, -360], [-240, -360], [-120, -360], [-120, -240], [0, -240], [120, -240], [180, -300]],
      secs: [
        { at: 1, pre: 'tank@far*2', amb: 'tank@out*2 tank@side', amb2: 'tank@out*2', tip: '轉角後面有戰車——先開火的贏' },
        { at: 2, amb: 'tank@side tank@out grunt@drop tank@side', amb2: 'tank@out*2 grunt@drop', tip: '敵機從天而降——落地前就先鎖定' },
        { at: 3, amb: 'grunt@side tank@out*2 tank@side', amb2: 'grunt@roof tank@out*2', tip: '樓頂也會有敵機——記得往上看' },
        { at: 5, pre: 'tank@far*2', amb: 'grunt@drop tank@side grunt@roof tank@out', amb2: 'tank@out*3 grunt@drop', tip: '遠處停著的戰車，先遠距離打掉' },
        { at: 6, amb: 'tank@out grunt@side tank@out tank@side*2', amb2: 'grunt@drop tank@out*2', amb3: 'grunt@roof tank@side*2' },
        { at: 7, amb: 'tank@side grunt@drop tank@side grunt@roof tank@out', amb2: 'tank@out*3 grunt@drop', tip: '支路衝出來的最近——先打牠' },
        { at: 9, amb: 'tank@ring*4 grunt@drop*2', amb2: 'grunt@roof tank@ring*3 grunt@drop', amb3: 'grunt@drop*2 tank@ring*3', tip: '最後一區：四面八方都有，清光就過關' },
      ] } },
  // ================================================================ 第 2 關
  { name: '包圍網', en: 'ENCIRCLED', tip: '右鍵按住鎖定多台，放開一次射飛彈——車隊一次清光', music: 2, tier: 2,
    route:
    { cp: 4, arena: 175, fin: 140, par: 450, over: 2,
      pts: [[660, 600], [480, 600], [360, 600], [360, 480], [240, 480], [120, 480], [120, 360], [0, 360], [-120, 360], [-120, 240], [-240, 240], [-240, 120], [-120, 120], [0, 0]],
      secs: [
        { at: 1, pre: 'tank@far*3', amb: 'heli@rise tank@side tank@out', amb2: 'tank@out*3', tip: '前面三台排成一列——右鍵按住一次鎖光' },
        { at: 2, amb: 'tank@out*2 tank@side grunt@drop', amb2: 'grunt@drop tank@side tank@out*2' },
        { at: 3, amb: 'grunt@side heli@rise tank@out*2', amb2: 'heli@rise tank@out*2 grunt@roof', tip: '直升機從樓後面升起來' },
        { at: 4, amb: 'tank@side*2 grunt@drop grunt@roof', amb2: 'heli@rise tank@out*2', amb3: 'grunt@drop*2 tank@side' },
        { at: 6, pre: 'tank@far*2', amb: 'grunt@side grunt@roof tank@out*2', amb2: 'tank@out*3 heli@rise', tip: '遠處有戰車守著轉角' },
        { at: 8, pre: 'tank@far', amb: 'heli@rise*2 tank@side*2 grunt@drop', amb2: 'grunt@roof tank@out*3' },
        { at: 9, amb: 'tank@out*4 grunt@roof grunt@drop', amb2: 'tank@side*2 grunt@drop heli@rise', tip: '車隊從前面衝過來——用飛彈' },
        { at: 11, amb: 'grunt@side grunt@drop tank@side heli@rise', amb2: 'tank@out*3 grunt@roof', amb3: 'heli@rise*2 grunt@drop tank@out' },
        { at: 13, amb: 'tank@ring*4 grunt@drop*2 heli@rise', amb2: 'grunt@drop*2 heli@rise*2 tank@ring*2', amb3: 'grunt@roof grunt@drop*2 heli@rise tank@ring*3', tip: '廣場決戰——全部擊毀就過關' },
      ] } },
  // ================================================================ 第 3 關（暫放：舊式空降，之後換成路線）
  { name: '救援', en: 'RESCUE', tip: '', music: 2, tier: 2,
    groups: [['tank', 'tank', 'tank', 'tank', 'heli'], ['grunt', 'heavy', 'grunt', 'tank', 'tank'], ['heli', 'heli', 'tank', 'tank', 'tank'], ['grunt', 'tank', 'tank']] },
  // ================================================================ 第 4 關（暫放）
  { name: '重砲', en: 'HEAVY GUNS', tip: '新敵人：重裝機——響飛彈警報就點 SHIFT 閃', music: 3, tier: 3,
    groups: [['tank', 'tank', 'tank', 'tank', 'heli'], ['grunt', 'heavy', 'grunt', 'tank', 'tank'], ['heli', 'heli', 'tank', 'tank', 'tank'], ['grunt', 'tank', 'tank']] },
  // ================================================================ 第 5 關（暫放）
  { name: '黑犬', en: 'BLACK DOG', tip: '新敵人：王牌機——槍口發光就閃，靠近會拔劍', music: 4, tier: 4,
    groups: [['heli', 'heli', 'tank', 'tank', 'tank'], ['grunt', 'ace', 'grunt', 'tank', 'tank'], ['jet', 'tank', 'tank', 'tank', 'heli'], ['grunt', 'grunt', 'heli', 'heli']] },
  // ================================================================ 第 6 關（暫放）
  { name: '補給線', en: 'SUPPLY LINE', tip: '', music: 3, tier: 4,
    groups: [['heli', 'heli', 'tank', 'tank', 'tank'], ['grunt', 'ace', 'grunt', 'tank', 'tank'], ['jet', 'tank', 'tank', 'tank', 'heli'], ['grunt', 'grunt', 'heli', 'heli']] },
  // ================================================================ 第 7 關（暫放）
  { name: '鋼鐵洪流', en: 'IRON TIDE', tip: '混編部隊：邊跑邊打，別站著不動', music: 5, tier: 5,
    groups: [['tank', 'tank', 'tank', 'tank', 'tank', 'tank', 'heli'], ['ace', 'heavy', 'grunt', 'grunt', 'heavy', 'tank', 'tank'], ['jet', 'jet', 'heli', 'heli', 'tank', 'tank', 'tank'], ['grunt', 'grunt', 'heli', 'tank', 'tank']] },
  // ================================================================ 第 8 關（暫放）
  { name: '制空權', en: 'AIR SUPREMACY', tip: '', music: 4, tier: 5,
    groups: [['tank', 'tank', 'tank', 'tank', 'tank', 'tank', 'heli'], ['ace', 'heavy', 'grunt', 'grunt', 'heavy', 'tank', 'tank'], ['jet', 'jet', 'heli', 'heli', 'tank', 'tank', 'tank'], ['grunt', 'grunt', 'heli', 'tank', 'tank']] },
  // ================================================================ 第 9 關（暫放）
  { name: '獵犬巢穴', en: 'THE DEN', tip: '', music: 5, tier: 6,
    groups: [['tank', 'tank', 'tank', 'tank', 'heli', 'heli'], ['jet', 'jet', 'tank', 'tank', 'tank', 'tank', 'heli'], ['ace', 'heavy', 'grunt', 'ace', 'heavy', 'grunt', 'heli', 'tank', 'tank']] },
  // ================================================================ 第 10 關（暫放）
  { name: '黃昏決戰', en: 'LAST LIGHT', tip: '最終關：王牌、重裝、戰車、直升機、戰機全部出動', music: 6, tier: 6,
    groups: [['tank', 'tank', 'tank', 'tank', 'heli', 'heli'], ['jet', 'jet', 'tank', 'tank', 'tank', 'tank', 'heli'], ['ace', 'heavy', 'grunt', 'ace', 'heavy', 'grunt', 'heli', 'tank', 'tank']] },
];
