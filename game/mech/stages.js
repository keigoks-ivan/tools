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
  //   沿大街往東推進（教學關：射擊、Tab、懸浮、閃避、飛彈、光劍、光波砲、覺醒一區教一樣），拆掉獵犬的中繼站，到東區公園和第三裝甲連會合
  { name: '初陣', en: 'FIRST SORTIE', tip: '跟著藍色光柱沿街推進——左鍵射擊，Tab 換目標，戰車一發就爆', music: 1, tier: 1,
    brief: ['昨晚，零號在第七機庫啟動了試驗機「蒼焰」，把獵犬軍團趕出了基地。',
      '首都東區，第三裝甲連困在大街盡頭的公園，彈藥只剩兩成。',
      '獵犬在沿路的大樓架了中繼站，替砲兵報他們的位置。',
      '沿大街往東推進，拆掉中繼站，和裝甲連會合。'],
    start: [[OP, '零號，聽得到嗎？這是你第一次在城裡開蒼焰。'], [OP, '裝甲連在東區大街盡頭。跟著光柱走。'], [ME, '收到。出發。']],
    end: [[ALLY, '原來蒼焰是一台機體……我們得救了。'], [ALLY, '第三裝甲連連長。駕駛員，報上名字。'], [ME, '零號。'], [OP, '裝甲連，跟著蒼焰撤出東區。']],
    route:
    { cp: [4, 8], arena: 130, fin: 60, par: 520, over: 1,
      pts: [[-600, -660], [-600, -480], [-360, -480], [-360, -360], [-240, -360], [-120, -360], [-120, -240], [0, -240], [120, -240], [240, -240], [360, -240], [480, -240], [480, -360], [480, -480], [540, -480]],
      secs: [
        { at: 1, pre: 'tank@far*2', amb: 'tank@out*2 tank@side', amb2: 'tank@out*2', tip: '轉角後面有戰車——左鍵射擊，先開火的贏',
          lines: [[OP, '前方路口，獵犬的戰車。先開火。']] },
        { at: 2, amb: 'tank@side grunt@drop*2 tank@out', amb2: 'tank@out*2 grunt@drop', amb3: 'grunt@drop tank@side', tip: '敵機從天而降——Tab 換目標，落地前就打',
          go: [[ALLY, '……這裡是第三裝甲連……有人聽得到嗎……'], [OP, '聽得到。撐住，我們過去。']],
          lines: [[OP, '上空有機體降落，是獵犬的量產機。']] },
        { at: 3, amb: 'grunt@roof tank@out tank@side', amb2: 'grunt@roof tank@out*2', tip: '樓頂也會有敵機——往上看，空白鍵按住能懸浮',
          lines: [[OP, '樓頂有一台。抬頭。']], clear: [[OP, '這一帶清掉了。你學得很快。']] },
        { at: 4, amb: 'tank@side*2 tank@out grunt@drop', amb2: 'tank@out*2 grunt@side', tip: '看到砲彈飛過來，點一下 Shift 閃開',
          go: [[OP, '下個路口很窄，支路裡可能藏了戰車。']], lines: [[OP, '支路有戰車！']], clear: [[ME, '蒼焰還撐得住。']] },
        { at: 5, pre: 'tank@far*3', amb: 'tank@out*2 grunt@drop', amb2: 'tank@out*3', amb3: 'grunt@roof tank@out*2', tip: '遠處那排戰車——右鍵按住鎖定多台，放開一起射',
          go: [[OP, '前面停了一排戰車。用飛彈。']] },
        { at: 6, amb: 'heli@rise tank@side tank@out', amb2: 'heli@rise tank@out*2 grunt@drop', tip: '直升機從樓後面升起——飛彈追得上它',
          go: [[ALLY, '砲彈又落在我們頭上！他們看得見我們！'], [OP, '有人在替砲兵報位置。我在找。']],
          lines: [[OP, '直升機，從樓後面上來了。']] },
        { at: 7, amb: 'grunt@side*2 tank@out', amb2: 'grunt@drop tank@out*2', tip: '敵機貼近了——按 F 光劍突擊',
          lines: [[OP, '機體從支路貼過來了。']], clear: [[OP, '找到了。前面兩棟樓，中繼站和觀測所。']] },
        { at: 8, amb: 'tank@out grunt@roof tank@side', amb2: 'tank@out*2 grunt@drop', tip: '按 E 發射光波砲——一道光能打穿兩棟樓',
          targets: [{ x: 204, z: -200, name: '中繼站' }, { x: 161, z: -158, name: '觀測所' }],
          go: [[OP, '拆掉這兩棟樓，砲兵就看不見了。']], lines: [[EN, '中繼站遭到攻擊！附近的車過去支援！']],
          clear: [[ALLY, '……砲擊停了！是你們幹的？'], [OP, '是蒼焰。裝甲連，報位置。']] },
        { at: 10, amb: 'tank@side grunt@drop tank@side grunt@roof tank@out', amb2: 'tank@out*3 grunt@drop', amb3: 'heli@rise tank@side*2', tip: '支路衝出來的最近——先打牠',
          go: [[ALLY, '東區公園，還有四輛能動。快點來。']], lines: [[EN, '聯邦的新型機往公園去了。攔住它。']] },
        { at: 11, pre: 'tank@far*2', amb: 'grunt@drop tank@side*2', amb2: 'heli@rise tank@out*2 grunt@drop', tip: 'Shift 按住衝刺——拉近距離再打',
          lines: [[ALLY, '轉角那幾輛在朝公園開砲！先解決它們！']], clear: [[ALLY, '打得好！那幾輛一直在轟我們。']] },
        { at: 12, amb: 'heli@rise tank@out*2 grunt@drop tank@side', amb2: 'grunt@roof tank@out*2 heli@rise', amb3: 'grunt@drop tank@side*2', tip: 'OD 槽滿了按 Q 覺醒——十秒內全面變強',
          go: [[OP, '公園就在前面。獵犬的兵力全往那裡去了。']], lines: [[ALLY, '他們又衝上來了！撐不了多久！']], clear: [[ME, '快到了。再撐一下。']] },
        { at: 14, amb: 'tank@ring*4 grunt@drop*2', amb2: 'grunt@roof tank@ring*3 grunt@drop heli@rise', amb3: 'grunt@drop*2 tank@ring*3', tip: '最後一區：四面八方都有，清光就過關',
          lines: [[ALLY, '看到你了！全車開火，跟著那台機體打！']] },
      ] } },
  // ================================================================ 第 2 關
  //   帶著車隊往西突圍：拆干擾站讓撤離直升機進得來、打倒包圍網的指揮機（小頭目），最後守住中央廣場到直升機載完市民
  { name: '包圍網', en: 'ENCIRCLED', tip: '打穿包圍網，守住中央廣場——右鍵按住一次鎖多台', music: 2, tier: 2,
    brief: ['會合之後不到一小時，獵犬軍團封住了東區所有出口。',
      '兩千多名市民跟著裝甲連的車隊，困在包圍圈裡。',
      '聯邦派出撤離直升機，降落點是中央廣場。',
      '打穿包圍網，守住廣場，直到最後一架直升機起飛。'],
    start: [[OP, '包圍網在收緊。零號，你打頭陣。'], [ALLY, '裝甲連殿後，市民的車夾在中間。走吧。']],
    end: [[OP, '最後一架起飛了。市民全部撤出。'], [ALLY, '小子，開得不錯。這條命算你救的。'], [ME, '城裡還有人沒撤出來。'], [OP, '我知道。明天繼續。']],
    route:
    { cp: [4, 7, 11], arena: 175, fin: 70, par: 620, over: 2,
      pts: [[660, 600], [480, 600], [360, 600], [360, 480], [240, 480], [120, 480], [120, 360], [0, 360], [-120, 360], [-240, 360], [-240, 240], [-360, 240], [-360, 120], [-240, 120], [-240, 0], [-120, 0], [0, 0]],
      secs: [
        { at: 1, pre: 'tank@far*3', amb: 'heli@rise tank@side tank@out', amb2: 'tank@out*3', tip: '前面三台排成一列——右鍵按住一次鎖光',
          lines: [[ALLY, '前面路口有戰車擋路！']], clear: [[OP, '路開了。車隊，跟上。']] },
        { at: 2, amb: 'tank@out*2 tank@side grunt@drop', amb2: 'grunt@drop tank@side tank@out*2',
          lines: [[EN, '聯邦車隊往西走了。各隊跟上去。']] },
        { at: 3, amb: 'grunt@side heli@rise tank@out*2', amb2: 'heli@rise tank@out*2 grunt@roof', tip: '直升機從樓後面升起來',
          lines: [[OP, '直升機。先打掉，別讓它盯上車隊。']], clear: [[ALLY, '車隊沒事。繼續走。']] },
        { at: 4, amb: 'tank@side*2 grunt@drop grunt@roof', amb2: 'heli@rise tank@out*2', amb3: 'grunt@drop*2 tank@side',
          lines: [[ALLY, '後面也有！他們從兩邊夾過來了！']] },
        { at: 6, pre: 'tank@far*2', amb: 'grunt@side grunt@roof tank@out*2', amb2: 'tank@out*3 heli@rise', tip: '遠處有戰車守著轉角',
          go: [[OP, '撤離直升機的頻道一直有雜訊。']], clear: [[OP, '找到了。有人在干擾，訊號從前面兩棟樓出來。']] },
        { at: 7, amb: 'grunt@roof tank@side tank@out', amb2: 'heli@rise grunt@drop tank@out*2', tip: '樓頂架著干擾站——光波砲（E）一次拆一棟',
          targets: [{ x: 83, z: 420, name: '干擾站' }, { x: -40, z: 324, name: '干擾站' }],
          go: [[OP, '拆掉干擾站，直升機才進得來。']], lines: [[EN, '干擾站遭到攻擊！快派人過去！']],
          clear: [[OP, '頻道通了。撤離直升機，降落點中央廣場。']] },
        { at: 8, pre: 'tank@far', amb: 'heli@rise*2 tank@side*2 grunt@drop', amb2: 'grunt@roof tank@out*3',
          lines: [[EN, '聯邦要從廣場撤人。把路堵死。']] },
        { at: 10, amb: 'tank@side*2 grunt@drop tank@out', amb2: 'tank@out*2 grunt@roof', tip: '頭上有血條的是指揮機——集中打它',
          boss: { kind: 'grunt', name: '包圍網指揮機', ap: 2.5, where: 'drop',
            half: [[EN, '指揮機受損！各車靠過來掩護！']], low: [[OP, '它快倒了。別讓它跑回去。']] },
          go: [[OP, '前面路口有一台指揮機，包圍網聽它調度。']], lines: [[EN, '聯邦的新型機？全隊，把它圍住。']],
          clear: [[ALLY, '指揮機倒了！包圍網開了個缺口！']] },
        { at: 12, amb: 'tank@out*3 grunt@roof grunt@drop', amb2: 'tank@side*2 grunt@drop heli@rise',
          go: [[OP, '趁他們亂，從缺口穿出去。']], lines: [[EN, '指揮機失聯！各隊自行攔截！']] },
        { at: 14, amb: 'tank@out*4 grunt@drop', amb2: 'tank@side*2 heli@rise grunt@roof', amb3: 'heli@rise*2 tank@out*2', tip: '車隊從前面衝過來——用飛彈',
          lines: [[ALLY, '戰車隊從正面衝過來了！']], clear: [[OP, '廣場就在前面。直升機兩分鐘後到。']] },
        { at: 15, amb: 'grunt@drop*2 heli@rise tank@out', amb2: 'tank@out*2 grunt@roof heli@rise',
          lines: [[EN, '全軍往中央廣場集合！']], clear: [[ALLY, '車隊進廣場了！市民在下車！']] },
        { at: 16, hold: 75, gap: 18, amb: 'tank@ring*4 grunt@drop*2 heli@rise', amb2: 'grunt@drop*2 heli@rise*2 tank@ring*2', amb3: 'grunt@roof grunt@drop*2 heli@rise tank@ring*3', tip: '守住廣場——直升機載完市民才會撤',
          go: [[OP, '直升機到了。守住廣場，直到最後一架起飛。']], lines: [[OP, '第一架降落。別讓獵犬靠近廣場。']] },
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
