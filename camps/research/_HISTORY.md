# 往年梯次補查（2026-10-10 第三輪）

先讀同目錄 `_BRIEF.md` 的 batch 格式與欄位定義，本檔只寫這一輪的差異。

## 目標
找出每家機構**過去實際開過的每一週**：開始日、結束日、場地、營別、年齡、時間、價格（含計價方式）。網站會用這些日期推估 2027，並在卡片上寫「2026 年曾開 …」。

優先順序（依用戶需求）：
1. 2026-01～02、2025-01～02（農曆年前後，對應台灣寒假）
2. 2025-06～08、2026-06～08（暑假）
3. 2025-12、2026-12（12 月學校假期）
4. 3～4 月、10 月短假（有就收，不必專找）
5. 新公布的 2027 日期：照收，date_status＝confirmed_target_year

## 方法
1. **Wayback Machine**（主力，不吃搜尋額度）
   - 列出某網域的存檔：
     `curl -s "https://web.archive.org/cdx/search/cdx?url=<網域>/*&from=2024&to=2026&output=json&fl=timestamp,original,statuscode&filter=statuscode:200&collapse=urlkey&limit=2000"`
   - 篩出網址含 camp／holiday／summer／winter／booking／programme／school-holiday 的頁面。
   - 抓原始 HTML：`curl -sL "https://web.archive.org/web/<timestamp>id_/<原網址>"`，用 python 去標籤後找日期。
   - 同一頁挑「該季開營前或開營中」的存檔，例如 2026 暑假梯次挑 2026-04～07 的存檔。
   - 某一頁想看不同時間點：`https://web.archive.org/cdx/search/cdx?url=<完整網址>&output=json&fl=timestamp&filter=statuscode:200`
2. 現行官網、PDF、海報：很多頁面仍掛著上一季資訊。
3. Little Steps Asia、kualalumpurwithkids.com、Mumcentre、Kiddy123、Eventbrite 的當季整理文（聚合站，tier 4），也可用 Wayback 看當時版本。
4. Facebook／Instagram 公開貼文：不用登入看得到才收；要登入就跳過。
5. WebSearch 額度有限，**整輪最多 25 次**；能用 curl／WebFetch 直接抓已知網址就不要搜尋。

## 欄位規則
- 往年梯次：`date_status="confirmed_other_year"`，`year`＝實際年份，`season="other"`。
- `source_url`：取自 Wayback 就填存檔網址（含 timestamp），`sources[]` 另列原網址；`evidence_quote` 貼原文 ≤25 字（含日期那句）。
- 可信度：官方頁面（含官方頁面的 Wayback 存檔）＝high；官方社群貼文＝medium；只有聚合站＝low。
- 原文日期沒寫年份時，只能從存檔時間或同頁其他文字判斷年份，判斷依據寫進 notes；判斷不了就不收。
- **頁面明確寫「這段期間不開營」也要記**：寫進 not_found，notes 寫「官方明寫沒開：…」。這對推估很重要。
- 絕對不可以編造或用印象補值；找不到的欄位填 null。

## ID
- program_id、location_id 一律沿用 `/Users/ivanchang/tools/camps/data/programs.json`、`locations.json` 的既有 ID。真的是新營別或新場地才新建，並同時寫進 batch 的 programs／locations。
- session id：`<program_id>-<場地簡稱>-<YYYYMMDD>`（開始日）。
- 動手前先用 python 讀 `/Users/ivanchang/tools/camps/data/sessions.json`。同 program＋location＋開始日已存在就不要重收；若你找到的結束日或價格不同，寫進 conflicts。

## 輸出
`/Users/ivanchang/tools/camps/research/<batch_id>.json`，格式同 `_BRIEF.md`。寫完用 python 驗證能解析。
`summary` 欄位要逐家列：找到哪些季、各幾週；查過但沒找到的季；明寫沒開的季。
不要改 `data/`，不要做 git 操作。
