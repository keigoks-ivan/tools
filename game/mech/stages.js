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
  { name: '補給線', en: 'SUPPLY LINE', tip: '琥珀色框的大樓是目標——整棟打垮才算數', music: 3, tier: 4,
    brief: ['黑犬撤走了，但獵犬軍團的油料和彈藥還源源不絕。', '補給從東南郊外進城，沿著南郊公路設了油庫和倉庫。', '零號單機深入，把標示的油庫、倉庫全部打垮。', '偵察報告：敵方戰鬥機已經進駐補給站。'],
    start: [[OP, '這次是單機深入，沒有援軍。'], [OP, '目標我會標在畫面上，打到整棟倒下為止。'], [ME, '收到，出發。']],
    end: [[OP, '補給總站瓦解。牠們的油撐不了幾天。'], [EN, '全軍注意：司令部下令，拂曉發動總攻。'], [OP, '聽到了嗎？牠們要孤注一擲了。']],
    route:
    // 南郊公路（z＝-600）一路往東 → 北上 x＝480 → 東 → 南下 x＝600 → 東南角公園的補給總站
    { cp: [4, 8], arena: 175, fin: 60, par: 520, over: 2,
      pts: [[-120, -660], [-120, -600], [0, -600], [120, -600], [240, -600], [360, -600], [480, -600], [480, -480], [480, -360], [480, -240], [600, -240], [600, -360], [600, -480], [540, -540]],
      secs: [
        { at: 2, pre: 'tank@far*2', amb: 'tank@out*2 tank@side grunt@drop', amb2: 'tank@out*2 heli@rise', tip: '路口停著的戰車先打——牠們還沒發現你',
          lines: [[EN, '南路哨站遭到攻擊！是那台藍色機體！']], clear: [[OP, '哨站清除。牠們應該已經發出警報了。']] },
        { at: 3, amb: 'grunt@side grunt@drop tank@out*2', amb2: 'grunt@roof tank@side*2 heli@rise',
          lines: [[EN, '守備隊出動！在公路上攔住牠！']] },
        { at: 4, amb: 'tank@side*2 grunt@drop tank@out', amb2: 'grunt@roof tank@out*2 heli@rise', amb3: 'tank@side*2 grunt@drop', tip: '打垮兩座油庫——大樓倒了才算',
          targets: [{ x: 155, z: -661, name: '油庫' }, { x: 197, z: -660, name: '油庫' }],
          go: [[OP, '公路旁那兩棟低矮建築是油庫。']], lines: [[EN, '牠衝著油庫來了！全力攔截！']], clear: [[OP, '兩座油庫都燒起來了。前線的戰車要斷油了。']] },
        { at: 5, amb: 'jet@out tank@out*2 tank@side', amb2: 'jet@out*2 grunt@drop', amb3: 'tank@out*2 heli@rise', tip: '新敵人：戰鬥機——掠過後會繞回來，用飛彈鎖定',
          lines: [[OP, '雷達上有高速目標！是戰鬥機，小心掃射！']] },
        { at: 6, amb: 'grunt@side tank@side heli@rise tank@out*2', amb2: 'grunt@drop*2 tank@out*2', tip: '打垮兩座彈藥倉庫',
          targets: [{ x: 395, z: -660, name: '彈藥倉庫' }, { x: 438, z: -660, name: '彈藥倉庫' }],
          go: [[OP, '下一個路口旁是彈藥倉庫。兩棟都要倒。']], lines: [[EN, '別讓牠靠近彈藥庫！']], clear: [[OP, '彈藥倉庫炸掉了。牠們的砲彈至少少一半。']] },
        { at: 7, pre: 'tank@far*2', amb: 'heavy@drop tank@side*2 grunt@roof', amb2: 'grunt@drop tank@out*3', amb3: 'heli@rise*2 tank@side', tip: '重裝機的飛彈會追人——響警報就點 SHIFT 閃',
          lines: [[EN, '重裝隊，把牠壓在路口！']] },
        { at: 8, amb: 'heli@rise*2 tank@out*2 grunt@drop', amb2: 'jet@out*2 tank@side*2', amb3: 'grunt@roof tank@out*2',
          lines: [[EN, '空中支援到了，前後夾擊！']] },
        { at: 9, pre: 'tank@far*3', amb: 'tank@out*3 tank@side grunt@drop', amb2: 'tank@side*2 heli@rise tank@out*2', tip: '車隊排成一列——按住鎖定，一次清光',
          go: [[OP, '前面有一支補給車隊。一台都別放過。']], lines: [[EN, '車隊被盯上了！護衛隊，迎擊！']] },
        { at: 10, amb: 'tank@side*2 grunt@drop heli@rise', amb2: 'heavy@drop tank@out*2', amb3: 'grunt@roof jet@out tank@side', tip: '三棟補給倉庫全部打垮',
          targets: [{ x: 640, z: -279, name: '補給倉庫' }, { x: 683, z: -280, name: '補給倉庫' }, { x: 641, z: -321, name: '補給倉庫' }],
          go: [[OP, '路口東側那排矮房是補給倉庫，共三棟。']], lines: [[EN, '倉庫區告急！補給總站，請求增援！']], clear: [[OP, '倉庫全毀。補給總站在南邊的公園。']] },
        { at: 11, amb: 'grunt@side*2 tank@out*2 heli@rise', amb2: 'jet@out tank@side*2 grunt@drop',
          lines: [[EN, '所有部隊，回防總站！']] },
        { at: 12, amb: 'grunt@drop*2 tank@out*2 jet@out', amb2: 'grunt@roof heli@rise tank@out*2',
          lines: [[EN, '頂住！總站不能丟！']], clear: [[OP, '總站就在前面。最後一段。']] },
        { at: 13, amb: 'tank@ring*4 grunt@drop*2 heli@rise', amb2: 'heavy@drop grunt@drop tank@ring*3 jet@out', amb3: 'grunt@drop*2 heli@rise*2 tank@ring*2', tip: '補給總站：守軍全部擊毀就過關',
          lines: [[EN, '總站所有單位，出擊！']] },
      ] } },
  // ================================================================ 第 7 關
  { name: '鋼鐵洪流', en: 'IRON TIDE', tip: '邊打邊退，到防線再守——守點區要撐到倒數結束', music: 5, tier: 5,
    brief: ['補給被切斷後，獵犬軍團把剩下的戰車全部押上。', '裝甲大軍從東郊沿大道壓向市中心，帶頭的是重裝大隊長「鐵獒」。', '零號和第三裝甲連守在東郊前哨。先邊打邊退，退到大道防線。', '守住防線，再反攻奪回前哨。'],
    start: [[ALLY, '地平線上全是戰車，數不完。'], [OP, '零號，別硬拚。掩護裝甲連撤到防線。']],
    end: [[ALLY, '前哨拿回來了。開戰以來頭一次。'], [OP, '敵方裝甲兵力折損過半。辛苦了，零號。'], [WOLF, '……有意思。']],
    route:
    // 東郊前哨（東緣空地）→ 沿北側的街往西撤（z＝120）→ 第一道防線 → 大道防線（240,0）→ 沿大道反攻、繞南側 → 奪回前哨
    { cp: [3, 5, 8], arena: 175, fin: 60, par: 560, over: 2,
      pts: [[660, 60], [600, 120], [480, 120], [360, 120], [240, 120], [240, 0], [360, 0], [480, 0], [480, -120], [600, -120], [600, 0], [660, 60]],
      secs: [
        { at: 1, amb: 'tank@out*3 heli@rise grunt@drop', amb2: 'tank@out*3 grunt@drop', tip: '邊打邊退——別停在同一個地方',
          clear: [[OP, '大道已經被截斷。走北側的街撤。']] },
        { at: 2, amb: 'tank@side*2 grunt@side heavy@drop', amb2: 'tank@out*3 grunt@roof',
          lines: [[ALLY, '該死，前面也有！牠們繞過來了！']] },
        { at: 3, hold: 45, gap: 15, amb: 'tank@side*3 grunt@drop heli@rise', amb2: 'heavy@drop tank@side*2 tank@out', amb3: 'tank@side*3 grunt@drop jet@out', tip: '守住 45 秒——敵人會一波接一波從支路湧出',
          go: [[OP, '裝甲連在前面路口架好了砲。守住四十五秒。']], lines: [[ALLY, '砲口朝外！撐到大道那邊準備好！']], clear: [[ALLY, '時間夠了！全連撤到大道防線！']] },
        { at: 4, amb: 'grunt@drop*2 tank@side*2 heli@rise', amb2: 'tank@out*3 grunt@roof',
          lines: [[EN, '聯邦部隊在撤退。咬住牠們！']] },
        { at: 5, hold: 60, gap: 15, amb: 'tank@out*4 grunt@drop', amb2: 'tank@out*3 heavy@drop heli@rise', amb3: 'tank@side*2 tank@out*2 grunt@drop jet@out', tip: '守住 60 秒——大道上的戰車會一直衝過來',
          go: [[OP, '大道路口是最後一道防線。再退就是市中心。']], lines: [[ALLY, '全連就位。一步都不准退！'], [WOLF, '推平它。']], clear: [[OP, '防線守住了……等等，有大型重裝機接近。']] },
        { at: 6, amb: 'tank@out*2 grunt@drop', amb2: 'grunt@drop tank@out*2 heli@rise', tip: '敵方指揮官：重裝機火力很強——拿大樓擋飛彈',
          boss: { kind: 'heavy', name: '鐵獒', ap: 3, where: 'drop',
            half: [['鐵獒（獵犬軍團）', '有兩下子。全隊，火力集中！']], low: [[OP, '牠的裝甲快撐不住了，壓上去！']] },
          lines: [['鐵獒（獵犬軍團）', '就是你趕跑了黑犬？讓我看看。']], clear: [[ALLY, '鐵獒倒了！全連，反攻！']] },
        { at: 7, pre: 'tank@far*3', amb: 'tank@out*2 grunt@side heli@rise', amb2: 'grunt@roof tank@out*3',
          lines: [[EN, '指揮官陣亡！前鋒，誰來接手指揮？']], clear: [[OP, '大道被殘骸堵住了。從南側繞過去。']] },
        { at: 8, amb: 'tank@side*2 grunt@drop jet@out', amb2: 'heavy@drop tank@out*2' },
        { at: 9, amb: 'grunt@side*2 tank@out*2 heli@rise', amb2: 'tank@side*2 grunt@drop jet@out',
          lines: [[ALLY, '前哨就在前面。推回去！']] },
        { at: 10, amb: 'grunt@drop*2 tank@out*2 heli@rise', amb2: 'tank@out*3 jet@out',
          clear: [[OP, '前哨還有殘敵。清乾淨，就拿回來了。']] },
        { at: 11, amb: 'tank@ring*4 heavy@drop grunt@drop', amb2: 'grunt@drop*2 heli@rise tank@ring*3', amb3: 'heavy@drop jet@out tank@ring*3 grunt@drop', tip: '奪回前哨——清光殘敵就過關',
          lines: [[EN, '後路被切斷了！死守前哨！']] },
      ] } },
  // ================================================================ 第 8 關
  { name: '制空權', en: 'AIR SUPREMACY', tip: '直升機從樓後升起、戰機低空掠過——飛彈一次鎖多台', music: 4, tier: 5,
    brief: ['聯邦空軍整備完成，但城南的防空網讓飛機一架也進不來。', '防空砲架在大樓頂上，由雷達站統一指揮。', '沿路打垮防空陣地和雷達，替最後的總攻打開空中走廊。', '牠們會把能飛的全部派上來。'],
    start: [[OP, '防空網不倒，空軍就飛不進來。'], [OP, '砲架在樓頂。整棟打垮，砲就一起倒。']],
    end: [[OP, '防空網瓦解。空軍，路開了。'], ['聯邦空軍', '鷹群進入首都空域。謝了，蒼焰。'], [DOG, '藍色的，我在巢穴等你。']],
    route:
    // 中央廣場南緣出發 → 沿 x＝0 往南 → 蛇行穿過城南的塔樓區 → 塔樓區中間的空地（防空指揮所）
    { cp: [4, 8], arena: 175, fin: 60, par: 550, over: 2,
      pts: [[60, -60], [0, -120], [0, -240], [0, -360], [0, -480], [120, -480], [240, -480], [240, -360], [120, -360], [120, -240], [120, -120], [240, -120], [300, -180]],
      secs: [
        { at: 1, amb: 'heli@rise*2 tank@out*2', amb2: 'heli@rise tank@side*2 grunt@drop', tip: '直升機從樓後面升起——一露頭就打' },
        { at: 2, amb: 'heli@rise*2 tank@side grunt@roof', amb2: 'jet@out tank@out*2 heli@rise', amb3: 'grunt@drop heli@rise*2', tip: '打垮兩座防空陣地',
          targets: [{ x: 37, z: -205, name: '防空陣地' }, { x: -41, z: -300, name: '防空陣地' }],
          go: [[OP, '前面路口兩側的樓頂有防空砲。']], lines: [[EN, '防空陣地遭到攻擊！']], clear: [[OP, '兩座防空砲沉默了。']] },
        { at: 3, amb: 'jet@out*2 tank@out*2', amb2: 'jet@out heli@rise*2 grunt@drop', tip: '戰機掠過後會繞一大圈——等牠回頭時鎖定',
          lines: [[EN, '戰鬥機隊，攔截那台機體！']] },
        { at: 4, amb: 'heavy@drop heli@rise tank@side*2', amb2: 'grunt@roof*2 tank@out*2', amb3: 'heli@rise*2 tank@side',
          lines: [[EN, '重裝隊到位。把牠壓在地面上！']] },
        { at: 5, amb: 'heli@rise*2 grunt@side tank@out', amb2: 'jet@out*2 tank@side*2', amb3: 'heli@rise*2 grunt@roof', tip: '再兩座防空陣地',
          targets: [{ x: 162, z: -420, name: '防空陣地' }, { x: 62, z: -541, name: '防空陣地' }],
          go: [[OP, '再兩座防空砲。空軍已經在跑道上待命。']], lines: [[EN, '南區砲陣地被盯上了！直升機掩護！']], clear: [[OP, '南區的防空砲清空了。']] },
        { at: 6, amb: 'heli@rise*3 tank@out*2', amb2: 'heli@rise*2 jet@out grunt@drop', amb3: 'heli@rise*2 tank@side*2', tip: '直升機群——按住鎖定多台，一次清掉',
          lines: [[EN, '所有直升機，圍住牠！']] },
        { at: 7, amb: 'grunt@side*2 tank@out*2 heli@rise', amb2: 'heavy@drop tank@out*2 jet@out', amb3: 'heli@rise*2 tank@side*2' },
        { at: 8, amb: 'heli@rise*3 grunt@drop', amb2: 'jet@out*2 heli@rise tank@out*2', amb3: 'heli@rise*2 grunt@roof tank@side', tip: '雷達站又高又硬——用光波砲一口氣打垮',
          targets: [{ x: 82, z: -324, name: '雷達站' }],
          go: [[OP, '那棟最高的塔樓是雷達站，防空網靠它指揮。']], lines: [[EN, '雷達站告急！所有單位回防！']], clear: [[OP, '雷達站倒了。防空網瞎了一半。']] },
        { at: 9, amb: 'jet@out*2 heli@rise*2', amb2: 'heli@rise*2 tank@side*2 grunt@drop', amb3: 'jet@out*2 grunt@roof',
          lines: [[EN, '剩下的戰機全部起飛！擊落那台藍色的！']] },
        { at: 10, amb: 'grunt@side*2 tank@side heli@rise*2', amb2: 'heavy@drop tank@out*2', amb3: 'jet@out*2 grunt@roof',
          lines: [[EN, '指揮所外圍的部隊，頂住！']] },
        { at: 11, amb: 'heavy@drop tank@out*2 heli@rise', amb2: 'grunt@drop*2 tank@out*2 jet@out',
          clear: [[OP, '最後是主雷達和防空指揮所。']] },
        { at: 12, amb: 'heli@rise*2 tank@ring*3 grunt@drop', amb2: 'jet@out*2 heli@rise*2 tank@ring*2', amb3: 'heavy@drop heli@rise*2 tank@ring*2 jet@out', tip: '最後一區：打垮主雷達和防空指揮所，清光守軍',
          targets: [{ x: 277, z: -280, name: '主雷達' }, { x: 204, z: -200, name: '防空指揮所' }],
          lines: [[EN, '防空指揮所死守！一架都不准放進來！']] },
      ] } },
  // ================================================================ 第 9 關（暫放）
  { name: '獵犬巢穴', en: 'THE DEN', tip: '', music: 5, tier: 6,
    groups: [['tank', 'tank', 'tank', 'tank', 'heli', 'heli'], ['jet', 'jet', 'tank', 'tank', 'tank', 'tank', 'heli'], ['ace', 'heavy', 'grunt', 'ace', 'heavy', 'grunt', 'heli', 'tank', 'tank']] },
  // ================================================================ 第 10 關（暫放）
  { name: '黃昏決戰', en: 'LAST LIGHT', tip: '最終關：王牌、重裝、戰車、直升機、戰機全部出動', music: 6, tier: 6,
    groups: [['tank', 'tank', 'tank', 'tank', 'heli', 'heli'], ['jet', 'jet', 'tank', 'tank', 'tank', 'tank', 'heli'], ['ace', 'heavy', 'grunt', 'ace', 'heavy', 'grunt', 'heli', 'tank', 'tank']] },
];
