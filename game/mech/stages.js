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
  // ================================================================ 第 3 關
  // 西區：從西邊切進來，繞河濱公園一圈拆掉三個砲兵觀測所，最後在公園中間守住臨時醫院
  { name: '救援', en: 'RESCUE', tip: '打掉樓頂的觀測所：琥珀色框的大樓，打到整棟倒下', music: 2, tier: 2,
    brief: ['包圍網打開了，可是西區的河濱公園還困著上千名難民。', '公園裡的臨時醫院一直挨砲擊，砲彈由高樓頂上的觀測所導引。', '先打掉觀測所，再守住醫院，讓難民車隊從西河大橋撤出。'],
    start: [[OP, '零號，這裡是白鷺。醫院每三分鐘挨一輪砲。'], [OP, '觀測所會用琥珀色框標出來，整棟打倒才算數。']],
    end: [[ALLY, '最後一輛車過橋了。蒼焰，這次欠你一次。'], [OP, '難民全數撤出。零號，回來補給。']],
    route:
    { cp: [4, 8], arena: 130, fin: 90, par: 600, over: 2,
      pts: [[-690, 240], [-600, 240], [-600, 120], [-600, 0], [-600, -120], [-480, -120], [-360, -120], [-240, -120], [-240, 0], [-240, 120], [-360, 120], [-360, 0], [-420, 0]],
      secs: [
        { at: 1, amb: 'tank@out*2 tank@side heli@rise', amb2: 'tank@out*2 grunt@drop', tip: '直升機低空繞圈：鎖定它，用飛彈打',
          lines: [[OP, '路口有戰車守著，清掉再往前。']] },
        { at: 2, pre: 'tank@far*2', amb: 'grunt@drop tank@side*2', amb2: 'grunt@roof tank@out*2',
          go: [[OP, '前面街上停著兩台戰車，先從遠處打掉。']] },
        { at: 3, targets: [{ x: -661, z: -61, name: '砲兵觀測所' }], amb: 'grunt@roof tank@out*2 heli@rise', amb2: 'tank@side*2 grunt@drop', tip: '打倒琥珀色框的大樓：樓倒了、敵人清光才算過',
          go: [[OP, '第一個觀測所就在前方路口，框起來那棟。']], lines: [[EN, '觀測所遭到攻擊！附近部隊回防！']],
          clear: [[OP, '觀測所倒了。醫院回報，砲彈打偏了。']] },
        { at: 4, amb: 'tank@side tank@out*2 grunt@drop', amb2: 'heli@rise*2 tank@out' },
        { at: 5, targets: [{ x: -522, z: -157, name: '砲兵觀測所' }], amb: 'grunt@roof grunt@drop tank@out', amb2: 'heli@rise tank@side*2',
          go: [[OP, '路旁那片樹林就是河濱公園，醫院在裡面。'], [OP, '第二個觀測所在下一個路口。']],
          clear: [[OP, '第二個觀測所摧毀，剩最後一個。']] },
        { at: 6, pre: 'tank@far*2', amb: 'tank@side*2 grunt@drop heli@rise', amb2: 'grunt@roof tank@out*2',
          lines: [[ALLY, '這裡是醫院，砲彈又落下來了！']] },
        { at: 7, targets: [{ x: -320, z: -60, name: '砲兵觀測塔' }], amb: 'grunt@side tank@out*2 grunt@roof', amb2: 'heli@rise tank@side*2', amb3: 'grunt@drop*2 tank@out', tip: '高樓比較耐打：對準同一棟連續射擊',
          go: [[OP, '最後一個在前方的高樓頂上，比較耐打。']], lines: [[EN, '觀測塔告急！把那台藍色的擋下來！']],
          clear: [[OP, '觀測所全毀，砲擊停了。'], [ALLY, '醫院安靜了。車隊開始上人。']] },
        { at: 8, amb: 'tank@out*2 tank@side grunt@drop', amb2: 'grunt@roof heli@rise tank@out*2',
          lines: [[EN, '砲兵失去觀測。地面部隊，直接攻進醫院。'], [OP, '他們改派地面部隊了。擋在醫院前面。']] },
        { at: 9, amb: 'heli@rise*2 grunt@side tank@out', amb2: 'tank@out*2 grunt@drop grunt@roof',
          go: [[OP, '掉頭繞回公園，沿路清掉追兵。']] },
        { at: 10, amb: 'grunt@drop*2 tank@side*2', amb2: 'heli@rise tank@out*2 grunt@roof',
          go: [[ALLY, '車隊裝好了。蒼焰，公園交給你守。']],
          clear: [[OP, '車隊一出發，敵人就會圍過來。']] },
        { at: 12, hold: 75, gap: 15, amb: 'tank@ring*3 grunt@drop*2', amb2: 'heli@rise*2 tank@ring*2 grunt@drop', amb3: 'grunt@drop*2 tank@ring*2 heli@rise', tip: '守住醫院：計時結束前，敵人會從四面八方來',
          lines: [[ALLY, '車隊出發！一分多鐘才過得了橋。'], [EN, '難民車隊在移動。全部隊，追！']] },
      ] } },
  // ================================================================ 第 4 關
  // 西南角切進來往北：長直路上的遠程自走砲、重裝機首次登場，打掉射控雷達、彈藥庫，最後在北邊打倒砲兵指揮所
  { name: '重砲', en: 'HEAVY GUNS', tip: '新敵人：重裝機——響飛彈警報就點 SHIFT 閃', music: 3, tier: 3,
    brief: ['難民撤出去了。獵犬軍團的重砲群轉向北區，開始砲擊聯邦防線。', '重砲群由新型重裝機護衛。重裝機停在遠處，一次射出整排飛彈。', '沿路找出重砲群，打掉它的彈藥庫和指揮所。'],
    start: [[OP, '重砲群一直在換陣地，我們只抓到大概位置。'], [OP, '聽到飛彈警報就點 SHIFT 側閃。']],
    end: [[OP, '指揮所倒了，重砲群散了。北區的砲擊全停。'], [EN, '……黑犬隊長，重砲群被那台藍色機體打掉了。'], [DOG, '蒼焰嗎。下一次，我親自上。']],
    route:
    { cp: [4, 8], arena: 110, fin: 90, par: 680, over: 2,
      pts: [[-690, -240], [-600, -240], [-480, -240], [-480, -120], [-480, 0], [-480, 120], [-480, 240], [-480, 360], [-360, 360], [-240, 360], [-240, 480], [-120, 480], [0, 480]],
      secs: [
        { at: 1, amb: 'tank@out*2 tank@side grunt@drop', amb2: 'heli@rise tank@out*2', amb3: 'grunt@drop tank@out',
          lines: [[OP, '接觸。這一帶是重砲群的外圍警戒。']] },
        { at: 2, pre: 'tank@far*2', amb: 'grunt@drop tank@side*2', amb2: 'tank@out*2 grunt@roof', amb3: 'heli@rise*2',
          go: [[OP, '轉角停著兩台戰車，先從遠處打掉。']] },
        { at: 3, pre: 'tank@far*2', amb: 'grunt@roof tank@side*2 grunt@drop', amb2: 'tank@out*2 heli@rise', amb3: 'heli@rise grunt@drop',
          go: [[ALLY, '北邊的砲擊一直沒停，我們動不了。']] },
        { at: 4, amb: 'heavy@drop tank@out*2', amb2: 'grunt@drop tank@side*2', amb3: 'tank@out*2 heli@rise', tip: '重裝機：飛彈警報一響就點 SHIFT 閃開',
          lines: [[OP, '重裝機降落！警報一響就點 SHIFT。']],
          clear: [[OP, '重裝機動作慢。繞著它打，別站著對射。']] },
        { at: 5, amb: 'heavy@roof tank@side*2 heli@rise', amb2: 'grunt@drop tank@out*2', amb3: 'grunt@roof tank@out',
          lines: [[EN, '前哨遭遇蒼焰。重裝機就位，拖住它。']] },
        { at: 6, targets: [{ x: -541, z: 299, name: '射控雷達站' }], amb: 'grunt@roof heavy@drop tank@out', amb2: 'tank@side*2 heli@rise*2', amb3: 'grunt@drop tank@out', tip: '打倒射控雷達站，重砲就打不準',
          go: [[OP, '找到了。重砲群的射控雷達站就在前方路口。']],
          clear: [[OP, '雷達站倒了。重砲的彈著點開始散掉。']] },
        { at: 7, amb: 'tank@side*2 grunt@drop heavy@drop', amb2: 'grunt@roof tank@out*2', amb3: 'heli@rise tank@side',
          go: [[EN, '射控雷達失聯！自走砲改用直接瞄準！']] },
        { at: 8, pre: 'tank@far*3', amb: 'heavy@roof tank@side grunt@drop', amb2: 'tank@out*2 heli@rise grunt@drop', amb3: 'heavy@drop grunt@roof', tip: '街尾的自走砲會先開火：拉開距離，一台一台打',
          go: [[OP, '街尾那一排就是自走砲，從遠處先打掉。']],
          clear: [[ALLY, '砲擊少了一半！小子，繼續。']] },
        { at: 9, amb: 'grunt@side heavy@drop tank@out*2', amb2: 'heli@rise*2 tank@side grunt@roof', amb3: 'grunt@drop*2',
          lines: [[EN, '自走砲隊全滅！指揮所，請求增援！']] },
        { at: 10, targets: [{ x: -180, z: 419, name: '彈藥庫' }], amb: 'heavy@drop grunt@roof tank@side*2', amb2: 'tank@out*2 grunt@drop heli@rise', amb3: 'grunt@roof heli@rise', tip: '彈藥庫很耐打：按 E 用光波砲一次打穿',
          go: [[OP, '前面那棟大樓是重砲群的彈藥庫，整棟打倒。']],
          clear: [[OP, '彈藥庫倒了。重砲群只剩指揮所。']] },
        { at: 11, pre: 'tank@far*2', amb: 'heavy@roof grunt@drop tank@side', amb2: 'heavy@drop tank@out*2', amb3: 'grunt@drop*2 tank@out',
          go: [[EN, '指揮所前方佈防！重裝機全部上前！']] },
        { at: 12, targets: [{ x: 83, z: 420, name: '砲兵指揮所' }, { x: 39, z: 421, name: '通訊塔' }], amb: 'tank@ring*3 heavy@drop grunt@drop', amb2: 'heavy@drop tank@ring*2 heli@rise', amb3: 'grunt@drop*2 tank@ring*2 heli@rise', tip: '最後一區：打倒指揮所和通訊塔，敵人清光就過關',
          go: [[OP, '指揮所就在前面。連通訊塔一起打倒。']], lines: [[EN, '指揮所遭到攻擊！全員回防！']] },
      ] } },
  // ================================================================ 第 5 關
  // 北邊繞一大圈到北區公園：黑犬隊的王牌機首次登場；中途黑犬試探（剩三成撤退），公園裡再打一次（又撤退，活到第 9 關）
  { name: '黑犬', en: 'BLACK DOG', tip: '新敵人：王牌機——槍口發光就閃，靠近會拔劍', music: 4, tier: 4,
    brief: ['重砲群散了以後，獵犬軍團的通訊裡一直出現同一個代號：黑犬。', '他在第七機庫被你打到彈射逃生，這次開著新的王牌機回來。', '黑犬把第三裝甲連圍在北區公園，公開呼叫蒼焰過去。', '王牌機的槍口一發光就要閃。貼得太近，他會拔劍。'],
    start: [[DOG, '蒼焰的駕駛，聽得到吧？'], [DOG, '第三裝甲連被我圍在北區公園。想救就過來。'], [OP, '是陷阱。……可是我們沒有別人能派。']],
    end: [[ALLY, '蒼焰……第三裝甲連全員都還在。謝了。'], [OP, '黑犬撤回巢穴了。下一次，他會拼上全力。']],
    route:
    { cp: [4, 8], arena: 100, fin: 110, par: 700, over: 2,
      pts: [[-120, 700], [-120, 600], [-240, 600], [-360, 600], [-360, 480], [-360, 360], [-360, 240], [-480, 240], [-600, 240], [-600, 360], [-600, 480], [-480, 480], [-540, 420]],
      secs: [
        { at: 1, amb: 'tank@out*2 tank@side heli@rise', amb2: 'grunt@drop tank@out*2', amb3: 'heli@rise tank@side',
          go: [[ME, '我去。沿路打過去。']], lines: [[OP, '黑犬的外圍部隊。別在這裡耗太久。']] },
        { at: 2, pre: 'tank@far*2', amb: 'grunt@roof tank@side*2 heli@rise', amb2: 'heavy@drop tank@out*2', amb3: 'grunt@drop tank@out' },
        { at: 3, amb: 'ace@drop tank@out*2', amb2: 'grunt@drop tank@side*2', amb3: 'tank@out*2 grunt@roof', tip: '王牌機：槍口發光就閃，貼近時他會拔劍',
          lines: [[EN, '黑犬隊二號機接敵。蒼焰，陪我玩玩。'], [OP, '王牌機！槍口一亮就閃。']],
          clear: [[OP, '二號機擊毀。黑犬本人還沒露面。']] },
        { at: 4, amb: 'heavy@roof grunt@drop tank@side*2', amb2: 'tank@out*2 heli@rise*2', amb3: 'grunt@drop*2' },
        { at: 5, amb: 'grunt@drop*2', amb2: 'tank@out*2 heli@rise', tip: '黑犬會貼近拔劍：看到近戰警告就點 SHIFT 閃',
          boss: { kind: 'ace', name: '黑犬', ap: 1.5, where: 'roof', flee: 0.3,
            half: [[DOG, '反應變快了。在機庫時可沒這麼靈活。']],
            fled: [[DOG, '……嘖，新機還沒調好。公園見，蒼焰。'], [OP, '黑犬脫離了。別追，先去公園。']] },
          lines: [[DOG, '又見面了。讓我看看你長進了多少。'], [OP, '是黑犬！他比二號機快得多。']] },
        { at: 6, amb: 'tank@side*2 grunt@drop heavy@drop', amb2: 'grunt@roof tank@out*2 heli@rise', amb3: 'tank@out*2 grunt@drop',
          go: [[ALLY, '彈藥剩兩成，我們撐不了多久。']] },
        { at: 7, pre: 'tank@far*2', amb: 'ace@drop grunt@roof tank@side', amb2: 'tank@out*2 heli@rise grunt@drop',
          lines: [[EN, '三號機接敵。隊長，這台交給我。']] },
        { at: 8, amb: 'heavy@drop grunt@side tank@out*2', amb2: 'heli@rise*2 tank@side grunt@drop', amb3: 'grunt@drop*2 tank@out',
          clear: [[OP, '公園就在前面，第三裝甲連在裡面。']] },
        { at: 9, amb: 'grunt@roof ace@drop tank@out*2', amb2: 'tank@out*2 heavy@drop', amb3: 'heli@rise*2 grunt@drop',
          go: [[ALLY, '看到你了，蒼焰！公園四周都是他們的人。']] },
        { at: 10, amb: 'heli@rise*2 grunt@drop tank@out*2', amb2: 'grunt@roof tank@out*2 heavy@drop', amb3: 'grunt@drop*2 tank@out' },
        { at: 11, amb: 'grunt@drop*2 heavy@drop heli@rise', amb2: 'ace@drop grunt@roof', tip: '公園入口：清掉守衛就能進去',
          lines: [[OP, '零號，黑犬就在公園裡。專心閃。']] },
        { at: 12, amb: 'tank@ring*2', amb2: 'grunt@drop*2 heli@rise', amb3: 'ace@drop tank@ring*2', tip: '黑犬全力出擊：保持移動，覺醒（Q）留給他',
          boss: { kind: 'ace', name: '黑犬', ap: 2.4, where: 'drop', flee: 0.2,
            half: [[DOG, '這才像話！再來！']], low: [[DOG, '可惡……機體跟不上我的反應。']],
            fled: [[DOG, '蒼焰，勝負留到巢穴再分。'], [EN, '黑犬隊長脫離！全軍後撤！']] },
          lines: [[EN, '全部隊退開。黑犬隊長親自出擊。'], [DOG, '來吧，蒼焰。這次我不會留手。']] },
      ] } },
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
