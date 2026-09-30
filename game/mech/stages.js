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
  // ================================================================ 第 9 關
  // 城北官署區（獵犬軍團司令部）：從東邊沿 z=360、z=480 往西打，倒通訊塔、守點接線、拆碉堡，最後在司令部後面的閱兵場（空地）跟黑犬單挑
  { name: '獵犬巢穴', en: 'THE DEN', tip: '琥珀色框的大樓是目標——打倒它、清光敵人，這一區才算過', music: 5, tier: 6,
    brief: ['防空陣地拆掉了，聯邦的飛機終於能飛進首都。', '獵犬軍團的司令部設在城北官署區，外圍有碉堡，中間有一座通訊塔。', '先打倒通訊塔，切斷司令部和各部隊的聯絡，再攻進去。', '黑犬撤回了司令部。這一次，他後面沒有路了。'],
    start: [[OP, '零號，這裡是白鷺。今天的目標是獵犬的司令部。'], [ALLY, '第三裝甲連跟在後面。機體歸你，戰車歸我們。']],
    end: [[ME, '……我記住了。'], [OP, '黑犬確認擊墜。司令部拿下了。'], [WOLF, '（公開頻道）這裡是灰狼。全軍撤回國會廣場。'], [OP, '最後一仗在廣場。零號，先回來補給。']],
    route:
    { cp: [4, 8, 11], arena: 175, fin: 60, par: 660, over: 2,
      pts: [[600, 230], [600, 360], [480, 360], [360, 360], [240, 360], [240, 480], [120, 480], [0, 480], [-120, 480], [-240, 480], [-240, 600], [-120, 600], [-60, 660]],
      secs: [
        { at: 1, pre: 'tank@far*2', amb: 'tank@side*2 tank@out grunt@drop', amb2: 'tank@out*2 heli@rise', tip: '北區第一道防線——轉角的戰車先打',
          lines: [[EN, '聯邦機體進入北區！第一防線，開火！', NOW]] },
        { at: 2, amb: 'grunt@side tank@side tank@out*2 grunt@roof', amb2: 'tank@out*2 heli@rise grunt@drop', amb3: 'grunt@drop tank@out*2',
          go: [[OP, '官署區就在西邊。沿著大街往裡打。']] },
        { at: 3, amb: 'heli@rise jet@rise*2 grunt@side tank@out', amb2: 'grunt@drop tank@out*2 heli@rise', tip: '戰機掠過頭頂——右鍵鎖定，飛彈追得上',
          go: [[OP, '他們把剩下的戰機都派出來了。']], lines: [[EN, '航空隊起飛！別讓它靠近司令部！', NOW]] },
        { at: 4, pre: 'tank@far', amb: 'heavy@roof grunt@side tank@side tank@out', amb2: 'grunt@drop*2 tank@out', tip: '樓頂的重裝機射程最遠——先把它打下來',
          go: [[OP, '往北轉。通訊塔在官署區中間。']] },
        { at: 5, amb: 'ace@drop grunt@side tank@out*2', amb2: 'grunt@roof heli@rise tank@side', tip: '王牌機靠近會拔劍——看到警告就閃',
          lines: [[EN, '司令部親衛隊出動！擋住它！', NOW]], clear: [[ALLY, '親衛隊也不過如此！小子，繼續走！']] },
        { at: 6, targets: [{ x: 83, z: 420, name: '通訊塔' }], amb: 'grunt@roof tank@side*2 heavy@drop', amb2: 'grunt@drop tank@out*2 heli@rise', amb3: 'grunt@drop heli@rise*2', tip: '通訊塔很硬——邊閃邊集中火力',
          go: [[OP, '那座高塔就是司令部的通訊塔。'], [OP, '打倒它，獵犬的部隊就收不到命令。']],
          clear: [[EN, '（雜訊）……司令部……請回答……'], [OP, '通訊塔倒了。現在他們各打各的。']] },
        { at: 7, amb: 'tank@side*2 tank@out*2 grunt@drop heli@rise', amb2: 'tank@out*2 grunt@roof grunt@drop', amb3: 'tank@out*2 heli@rise', tip: '敵軍斷了聯絡——一台一台點掉',
          go: [[ALLY, '他們亂了！第三裝甲連，跟著蒼焰推進！']] },
        { at: 8, pre: 'tank@far*2', amb: 'heavy@roof ace@side grunt@drop tank@out', amb2: 'grunt@drop*2 heli@rise*2',
          go: [[OP, '南邊那棟大樓就是司令部。']], lines: [[EN, '守住司令部！一步都不准退！', NOW]] },
        { at: 9, hold: 40, gap: 16, amb: 'heavy@drop grunt@drop tank@side*2', amb2: 'grunt@roof tank@out*2 heli@rise', amb3: 'heavy@roof grunt@drop tank@side', tip: '守住 40 秒——第三裝甲連在接司令部的線路',
          go: [[OP, '塔倒了以後，司令部只剩地下電纜能用。'], [OP, '第三裝甲連要接上去。守住這個路口。']],
          lines: [[EN, '有人在碰司令部的線路！阻止他們！', NOW]],
          clear: [[ALLY, '接上了！他們講什麼我們都聽得到。'], [OP, '黑犬在司令部後面的閱兵場。']] },
        { at: 10, targets: [{ x: -204, z: 562, name: '一號碉堡' }, { x: -278, z: 556, name: '二號碉堡' }], amb: 'grunt@roof grunt@side tank@side tank@out', amb2: 'heli@rise*2 grunt@drop tank@out', amb3: 'grunt@roof heli@rise tank@out',
          go: [[OP, '閱兵場入口有兩座碉堡，都打掉。']], clear: [[ME, '碉堡清掉了。']] },
        { at: 11, amb: 'ace@drop*2 grunt@roof', amb2: 'grunt@drop tank@ring*2', tip: '黑犬小隊：兩台王牌——別讓它們同時貼上來',
          go: [[DOG, '（公開頻道）蒼焰，我在閱兵場等你。'], [DOG, '先過我小隊這一關。']], lines: [[EN, '黑犬小隊，迎擊！', NOW]],
          clear: [[OP, '他在等你。……機體撐得住嗎？'], [ME, '撐得住。']] },
        { at: 12, amb: 'grunt@drop*2', tip: '最後一戰：槍口發光就閃，靠近會拔劍',
          boss: { kind: 'ace', name: '黑犬', ap: 3, where: 'drop',
            half: [[DOG, '哈！上次你連站都站不穩。']], low: [[DOG, '……好。這才像話。再來！']] },
          lines: [[DOG, '這次我不走了。你也別想走。', NOW], [ME, '我沒打算走。', NOW]],
          clear: [[DOG, '……隼選對人了。'], [DOG, '零號。上次我說記住你了……這次換你記住我。']] },
      ] } },
  // ================================================================ 第 10 關
  // 黃昏：從東北角沿 x=600、480、360、240 一路往西南打，從東邊進國會廣場（市中心空地）；中途兩次守點，最後跟灰狼的超重型機決戰
  { name: '黃昏決戰', en: 'LAST LIGHT', tip: '最終關：王牌、重裝、戰車、直升機、戰機全部出動', music: 6, tier: 6,
    brief: ['司令部失守，灰狼帶著剩下的部隊退進首都中心的國會廣場。', '他本人坐進一台超重型機體，親自守在廣場上。', '聯邦主力正從東邊渡河。在他們趕到之前，蒼焰要先打開通往廣場的路。', '黃昏出擊。這是最後一仗。'],
    start: [[OP, '零號，太陽快下山了。'], [OP, '天黑以前拿下廣場，這場仗就結束了。']],
    end: [[OP, '各地回報，獵犬軍團放下武器了。'], [ALLY, '聽到了嗎！首都拿回來了！'], [OP, '（隔天清晨）零號，醒了嗎？看東邊。'], [ME, '……天亮了。'],
      [ME, '隼，你說得對。蒼焰很聽話。'], [OP, '蒼焰的駕駛員，今天的任務只有一個：好好睡一覺。']],
    route:
    { cp: [4, 8, 10], arena: 175, fin: 60, par: 720, over: 2,
      pts: [[600, 700], [600, 600], [600, 480], [480, 480], [480, 360], [480, 240], [360, 240], [360, 120], [240, 120], [240, 0], [120, 0], [0, 0]],
      secs: [
        { at: 1, pre: 'tank@far*2', amb: 'tank@side*2 grunt@drop heli@rise', amb2: 'tank@out*2 grunt@roof', tip: '往國會廣場推進——沿路都是灰狼的部隊',
          lines: [[EN, '蒼焰出現在東北！全員迎擊！', NOW]] },
        { at: 2, amb: 'grunt@side heli@rise*2 tank@out*2', amb2: 'jet@rise*2 grunt@drop tank@side',
          go: [[OP, '廣場在西南，大約一公里。']] },
        { at: 3, pre: 'tank@far', amb: 'ace@drop grunt@side tank@out tank@side', amb2: 'grunt@roof heli@rise tank@out*2', tip: '灰狼的親衛隊——槍口發光就閃',
          go: [[OP, '前面是灰狼的親衛隊，全是王牌機。']], lines: [[EN, '親衛隊，攔下蒼焰！', NOW]] },
        { at: 4, amb: 'heavy@roof grunt@drop tank@side*2 heli@rise', amb2: 'ace@drop tank@out*2', tip: '樓頂的重裝機——先打高處',
          clear: [[OP, '第三裝甲連被擋在河邊了。']] },
        { at: 5, hold: 45, gap: 16, amb: 'grunt@drop tank@side*2 heli@rise', amb2: 'tank@out*2 grunt@roof jet@rise', amb3: 'heavy@drop tank@side tank@out', tip: '守住 45 秒——第三裝甲連正在過河',
          go: [[OP, '他們要四十五秒才過得來。'], [OP, '守住這個路口，別讓敵人繞到河邊。']],
          lines: [[EN, '聯邦的戰車要過河了！全力阻止！', NOW]],
          clear: [[ALLY, '久等了！第三裝甲連，到！'], [ALLY, '小子，剩下的路一起打。']] },
        { at: 6, amb: 'grunt@side grunt@roof tank@out*2 heli@rise', amb2: 'ace@drop jet@rise tank@side',
          go: [[ALLY, '戰車交給我們，你專心打機體！']] },
        { at: 7, pre: 'tank@far*2', amb: 'heavy@drop heavy@roof tank@side grunt@side', amb2: 'grunt@drop*2 heli@rise*2', tip: '兩台重裝機——躲到樓後面再換位置',
          go: [[OP, '天快黑了。廣場就在西邊。']] },
        { at: 8, amb: 'jet@rise*2 heli@rise*2 tank@out*2 grunt@drop', amb2: 'ace@drop grunt@roof tank@side', tip: '戰機低空掃射——右鍵按住一次鎖光',
          lines: [[EN, '航空隊最後一次出擊！全機升空！', NOW]] },
        { at: 9, amb: 'ace@drop*2 grunt@side tank@out', amb2: 'heavy@roof grunt@drop tank@out*2',
          go: [[WOLF, '（公開頻道）蒼焰。黑犬是我帶出來的。'], [WOLF, '他輸給了你。我不會。']] },
        { at: 10, hold: 50, gap: 16, amb: 'grunt@drop*2 tank@ring*2 heli@rise', amb2: 'ace@drop tank@ring*2 jet@rise', amb3: 'heavy@drop grunt@drop tank@ring*2', tip: '守住 50 秒——聯邦主力正在進城',
          go: [[OP, '聯邦主力還要五十秒才到廣場。'], [OP, '零號，撐住。這是最後一次守點。']],
          lines: [[EN, '全軍反擊！別讓它進廣場！', NOW]],
          clear: [[OP, '主力部隊進城了！廣場四周都是我們的人。']] },
        { at: 11, amb: 'tank@ring*3', amb2: 'ace@drop grunt@drop heli@rise', amb3: 'grunt@drop jet@rise*2', tip: '灰狼：超重型機——閃開砲擊，貼近再打',
          boss: { kind: 'heavy', name: '灰狼', ap: 4.5, where: 'drop',
            half: [[WOLF, '裝甲剩一半。還在計算之內。']], low: [[WOLF, '……原來如此。黑犬，我懂了。']] },
          lines: [[WOLF, '這座廣場是獵犬軍團最後的陣地。', NOW], [WOLF, '到此為止，蒼焰。', NOW]],
          clear: [[WOLF, '……獵犬軍團全軍，停止抵抗。'], [WOLF, '這是我最後一道命令。']] },
      ] } },
];
