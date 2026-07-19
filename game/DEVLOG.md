# HUNTR/X：魂門之戰 — 開發交接文件

> 最後更新：2026-07-18（第二輪：選角/新招/地圖縮小/寫實背景）。給下一個 Claude session 的完整脈絡。
> 上線網址：https://tools.investmquest.com/game/（repo push main 即自動部署）
> 本機測試：`python3 -m http.server 8931`（repo 根目錄）→ http://localhost:8931/game/
> **改 main.js 後必須 bump index.html 裡的 `main.js?v=xxx` 版本參數（防快取）**

## 現況（全部已實裝並上線）

- **引擎**：Three.js r166（vendored 於 game/lib/），純前端零依賴，Canvas→WebGL
- **主角**：Mixamo「Maria W/Prop」真人比例女劍士（assets/maria.glb，17MB，13 個動作內嵌，
  瀏覽器內轉檔管線在 tmp-convert/convert.html，可為之後的 Mira/Zoey 重用）
- **戰鬥**：輕連段×4（可循環）＋重攻擊＋連段終結技、Q 切換近戰/魂力彈（遠程劍氣）、
  跳躍＋下墜斬、翻滾 i-frame、連段傷害遞增（50 hits 封頂 +25%，2026-07-18 因太強下修）、
  無雙大絕（E，集氣 100 發動 4 秒亂舞＋八方劍氣＋終結大爆發）
- **關卡**：4 關開放戰場（124×124、街區有碰撞）。每關 4 目標（殲滅/據點制壓/敵將討伐
  混排）任意順序攻略＋敵襲事件，全清後 Boss 現身。過關升級（HP+30、攻擊+12%/關）
- **四個世界**（world1-4 Group 切換）：霓虹城區／魂界黑曜荒原／天界雲海聖域／虛空星境，
  各自天空貼圖（skyTex1-4）、配樂（MUSIC[0-3]）、Boss（KINDS.boss~boss4）
- **鏡頭**：真三式貼背旋轉鏡頭（camYaw 跟隨 player.yaw）＋建築遮擋自動淡化
  （updateOcclusion + blockersReg）＋鏡頭建築碰撞
- **音訊**：Web Audio 全合成（零音檔）——4 首 BGM（主旋律+鼓過門+延遲）＋11 種 SFX，M 靜音
- **手機**：虛擬搖桿（鏡頭相對移動）＋攻/重/跳/滾/換/絕 六鍵、效能降級、轉橫提示
- **UI**：HP/無雙量表/武器指示、方形小地圖（目標狀態/敵將/Boss/玩家朝向）、
  敵將頭頂名牌血條、劇情對話框（開場/Boss 叫陣/結局）、S~C 評價結算
- **美術素材**：Gemini 生成天空/標題畫（assets/gen/）＋KayKit CC0（骷髏敵人、城市道具）

## 架構速覽（main.js 單檔 ~2700 行）

- `STAGES[]`：關卡定義（objectives[{type,pos,need/officers,fast,ambush}], bossKind/bossPos）
- `OBSTACLES[]`＋`collideCircle()`：共用碰撞佈局，四世界各自「裝飾」同一組街區
- `blockersReg[]`＋`updateOcclusion()`：鏡頭遮擋淡化（每街區材質清單）
- `updateLevel()`：目標啟動（接近 26m）/增援/完成/巡遊敵/Boss phase
- `KINDS`：minion/runner/elite/boss1-4 敵種參數；`spawnEnemy(kind, x, z)`
- `AU`＋`MUSIC[]`＋`S.*`：音訊；`scheduleMusic()` 依 stageIdx 選曲
- `applyStageTint(i)`：世界可見性＋天空＋霧＋燈光切換
- Debug hooks（console）：`__dbg() __P __E __lvl __stage(i) __warp(k完成前k目標) __switch() __occ() __key(code) __cap()`

## 2026-07-18 第二輪更新（已上線）

- **地圖縮小 25%**：MAP_HALF 62→47（活動區 94×94），STAGES 目標/街區/裝飾/遠景全座標 ×0.75 連動，
  目標啟動半徑 26→20、增援/巡遊生成半徑同步縮
- **鏡頭拉近**：距離 8→6.5、高度 3.9→3.4（真三感、角色更大）
- **選角系統**：`CHARS{rumi,mira,zoey}`＋`buildHero()`；title→charsel overlay（index.html）→start。
  Mira（重刃：dmg×1.28/hp×1.18/spd5.9 藍）Zoey（疾風：dmg×0.82/hp×0.88/spd7.5 金）。
  目前用 Maria 模型＋tint 靈氣代身；`assets/mira.glb`/`zoey.glb` 若存在（tmp-convert 產出）自動採用（`tryLoad`）
- **新招式**：K 長按 0.5s 蓄力震地斬（CHARGE_ATK，光柱+三重衝擊波+閃白）；跑動中輕點 K＝衝刺斬（DASH_ATK，dash:19）；
  遠程重擊＝三連新月（RHEAVY fan:3）、遠程蓄力＝五連貫穿新月（RCHARGE fan:5）；
  完美閃避（翻滾 i-frame 內吃到判定）→ 子彈時間 1.6s（witchT，敵人 dt×0.22）+無雙氣+8
- **主角細緻化**：四階 toon 漸層（gradTex4）；劍身能量刃光（sword mesh 複製+法線外擴 additive）；
  揮劍軌跡帶（`setupSwordFx` 綁定姿勢算劍根/劍尖→掛 marker 於 mixamorigRightHand，`updateTrail` 帶狀淡出）；
  氣滿金環光環（heroAura）；攻擊特效色全部走 curChar.fx
- **劍氣新月化**：crescentTex（雙層新月）+ sprite rotation 對齊行進方向（螢幕空間）
- **背景寫實化**：窗戶貼圖 128×256（樓層帶/窗框/窗簾/污漬/AO 漸層）；world1 樓體改組合式
  （裙樓+退縮塔身×2+女兒牆+屋頂水塔/空調/天線紅燈+霓虹頂緣+斑馬線+直招支柱）；遠景樓加退縮層/尖塔；
  world2 岩石多峰傾斜不等比+熔岩光斑+黑曜碎晶+遠景火山；world3 金拱門×3+天光光柱（w3anim.shafts）；
  world4 能量巨環×3（w4anim.rings）+地表水晶簇
- flickers 支援 base 色（紅色警示燈不會閃成白色）

## 2026-07-18 第三輪更新（四關玩法/地圖/武器/招式全差異化，已上線）

- **四關玩法各不同**：
  1. 千人斬（type:'horde'）：單目標斬 1000，貼玩家高密度刷（cap 40/mobile 24），每百人斬里程碑
     爆氣+25、難度隨 kills 連續升級（HP×2.2/速度+1.5/攻擊+80% at 滿千，e.dmgMul per-spawn）；野生敵擊殺也計入
  2. 魂燈防衛（type:'defend'）：makeLamp 魂燈（HP120），敵人 AI 鎖定魂燈（玩家距離>5.5 時，e.lampTgt），
     守 40/45s；燈滅→重置重點燃
  3. 時限試煉（type:'trial'）：tlimit 秒內殺滿 need，超時 kills 歸零重來
  4. 封印裂口（type:'rift'）：makeRift 可破壞水晶（meleeSweep/updateBolts/musou 都接 damageRifts），
     裂口持續湧守衛
  - 目標 3D 物件登記在 level.props，loadStage 清理
- **四關地圖佈局獨立**：OBSTACLES_BY_STAGE[4]＋blockersRegBy[4]，loadStage 切換 active 指標
  （碰撞/遮擋/小地圖全跟隨）。一關＝外圈 6 街區大廣場；二關＝散落樹叢；三關＝對稱聖域；四關＝六角浮島環
- **第二關換主題**（太暗→明亮）：黑曜血月 → 黃泉花海・魂燈渡口。暮金天空+巨大金月、彼岸花田地表、
  紅葉巨木、石燈籠、漂浮魂燈火、花瓣、紫山遠景；光照全亮暖化；MUSIC[1] 改 C–G–Am–F 溫暖大調
- **三人武器不同**：Rumi＝原長劍+能量刃光；Mira＝程序生成破魔大劍（buildWeaponMesh 'great' 1.3x）；
  Zoey＝疾風短刃（'short' 0.68x）。原劍以 geometry 比對隱藏（含描邊），武器掛右手骨骼、綁定姿勢對齊刃軸
- **三人招式組不同**（MOVES{rumi,mira,zoey}，curMoves()）：Rumi 四段連段；Mira 三段重連段（段段震波）+
  跳壓地裂(slam)+破城衝撞；Zoey 六段疾風連段+突刺+穿風突進(dash26)+散射新月(fan)。攻速 atkTs、範圍 rangeMul 分化
- STAGES[0] 千人斬敘事、s1-s4 開場對白同步更新

## 2026-07-18 第四輪更新（已上線）

- 連段加成下修 50hits+25%；Tab 鎖定武將（toggleLock/updateLock，鏡頭+攻擊自動朝向，手機「鎖」鍵）
- **長髮**：setupHair 程序生成掛 mixamorigHead（比例尺＝頭高，方向由世界向量轉頭骨局部），
  Rumi 長辮紫／Mira 及腰長直髮藍／Zoey 雙馬尾粉，金色髮繩，先掛髮再 addOutline 一起吃描邊
- **主題曲**：MUSIC[0] 改獵魔女團風原創戰歌（主歌低音蓄力→副歌高音爆發；原曲旋律有版權不可直搬）
- **音樂和聲化**：主旋律自動配和聲（當拍和弦內挑主音下方最高和弦音）、pad 加高八度亮澤＋
  低八度根音/五度鋪底、hat16 曲加 16 分閃爍琶音——不再單音
- 髮鏈無擺動物理（跟頭骨剛體動），之後可加 verlet 擺動

## 2026-07-19 第五輪更新（已上線）

- 大絕減亮（閃白 0.35/0.5、斬痕隔次、震波縮小）；鼓組減重（kick 0.28、snare/hat 減半）；
  副歌拉高至 E6＋三聲部和聲；敵人全面縮小（minion 0.8/runner 0.72/boss −10%）＋每關色調融合（STAGE_ENEMY_TINT）
- **新敵種**（KayKit 冒險者 GLB，通用動畫集，無 Spawn_Ground → Idle 出場 fallback）：
  brute 蠻力鬼（Barbarian 雙手斧，慢硬重劈，S2+）／sentinel 叛天騎士（Knight 劍盾，高擊退抗性，S3）／
  shade 影刺（Rogue 雙匕首，極快低血高傷，S4）；spawnKindFor(o) 統一各關雜兵池
- **Boss 換模**：boss2＝巨型蠻力鬼、boss3＝巨型叛天騎士、boss4＝巨型影刺；召喚吟唱缺 Spellcast_Summon
  時 fallback Spellcast_Raise
- 武將模型隨關卡換（OFFICER_KINDS），血量 14+關數×4；千人斬中後段混入 brute/shade
- debug 新增 window.__spawn(kind, x, z)

## 2026-07-19 第六輪更新：音訊全面重製（已上線）

- **BGM 改真實音樂素材**（assets/audio/，授權見 LICENSE-audio.txt，標題畫面有 CC-BY 掛名）：
  標題＝Retro Synthwave（Tomasz Kucza CC-BY4）／一關＝Heroic Demise 史詩管弦（Matthew Pablo CC-BY3）／
  二關＝太鼓和風戰鼓（jobro CC-BY3）／三關＝史詩管弦搖滾（Cleyton Kauffman CC0）／
  四關＝交響金屬 loop（nene CC0，zip 檔名標反、opening 才是 loop，已轉 m4a）
- 播放機制：initAudio 非同步 fetch+decode 全部曲目，playBgm(key) 交叉淡入淡出（0.8s）換歌，
  loadStage 自動切關卡曲；合成 BGM 引擎保留為載入失敗 fallback（scheduleMusic 開頭 gate）
- **母帶鏈**：master → DynamicsCompressor → destination；生成脈衝殘響 Convolver，SFX 送 0.2 wet
- **SFX 全部重做成多層合成**：slash＝揮風+刃鳴+金屬滑音、hit＝重擊+click+拳肉(+重擊餘震)、
  kill＝滑落+悶響+碎裂、hurt＝失諧雙鋸齒、roar＝雙層咆哮+次低頻、boom＝次低頻下墜+爆點+碎屑、
  勝利/據點/拾取改 FM 鐘（bell()）
- debug：window.__au() 看 BGM 狀態

## 2026-07-19 第七輪更新（已上線）

- 大絕開場慢動作：musouSlowT 1.1s 全場 dt×0.25＋鏡頭 6.5→5.1 推近（updateCamera camDist）
- **主角全身裝備組**（setupOutfit，程序生成掛骨骼、吃描邊）：肩甲/護腕+發光紋/護脛
  （limbGuard：骨骼→子關節向量自動對齊長度方向）＋腰帶/腰扣/側裙甲（Hips）＋
  胸前發光徽章/背後雙飄帶+尾光點（Spine2）；三人配色 outfit/metal 欄位
  （Rumi 黑紫×金、Mira 深藍×銀、Zoey 棕×金）
- 想整個換主角模型：Mixamo 下載需 Adobe 登入（人工），tmp-convert 管線備妥，
  拿到 FBX 丟 assets/{mira,zoey,新主角}.glb 即自動採用

## 2026-07-19 第八輪更新：畫質細緻化＋效能治理（已上線）

- **去顆粒**：EffectComposer 換 MSAA 渲染目標（桌機 4x/手機 2x，後處理下 renderer antialias 本來無效）；
  pixelRatio 桌機 1.5→2 全解析度；Canvas 貼圖全部 2x 重繪（窗戶/招牌/店面/柏油）＋全場景貼圖開
  anisotropy（MAX_ANISO）；bloom 0.72→0.62、threshold 0.6
- **效能治理**（用戶反映 Chrome 變慢）：BGM 改惰性解碼——只抓壓縮檔（34MB），播放時才 decode、
  換關釋放上一首 PCM（原本全解碼常駐 ~250MB RAM）；自適應畫質 perfTick——平均幀 >24ms 自動降
  pixelRatio 一階（2→1.75→…→1.15），順的機器維持最高畫質
- 注意：decodeAudioData 會 detach ArrayBuffer，解碼一律用 raw.slice(0) 複本

## 已知待辦/可改進

1. 開放地圖敵量/密度、蓄力/衝刺斬傷害數值需實玩回饋再平衡
2. Boss 現身時機、勝利/死亡流程未在縮小版地圖完整實玩驗證
3. Mira/Zoey 專屬模型：Mixamo 選角→tmp-convert 轉檔→丟 assets/mira.glb、zoey.glb 即自動生效（管線就緒）
4. 音量平衡未實聽調整；BGM 好聽度看用戶回饋
5. 手機實機未測（觸控/效能；蓄力=長按重鍵已支援）
6. 揮劍軌跡帶的劍尖偵測用 bounding box 長軸推斷，若視覺歪斜需微調 setupSwordFx 的 lerp 參數

## 部署習慣

- commit 訊息用 feat:/fix:/balance: 前綴（見 repo CLAUDE.md）
- 只 add game/ 下的檔案（repo 有其他 session 在動 _build/ 等目錄,勿碰）
- push 後 1-2 分鐘 Cloudflare Pages 生效
