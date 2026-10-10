# 泰國：曼谷、清邁（2026-10-10）

用戶要把網站擴到泰國，只做曼谷和清邁兩地。家庭從台灣來，在當地住一段時間，孩子白天上營隊或插班。

先讀：
- `/Users/ivanchang/tools/camps/research/_BRIEF.md`：格式、鐵則、tier、review 物件、上課地點規則，全部照做。下面寫的泰國規則優先於 brief 裡馬來西亞的寫法。
- `~/.claude/skills/zh-analyst-prose/SKILL.md` 第一節：寫 notes 和 summary 前讀。

## 用戶的實際查詢（最優先）

2027-01-17～02-08，兩個孩子：2016-05 生（約 10 歲）、2020-05 生（約 6 歲）。

泰國國際學校 1～2 月在上課（耶誕假約到 1 月初，2 月中左右有期中假），一般假期營不多。這段期間要特別找這幾類：
1. 1 月中到 2 月上旬有開的營，或「每週可報名」的營。
2. 國際學校、雙語學校的短期插班（visiting student、trial、short-term enrolment）。
3. 語言學校給外國孩子的冬季課程。
4. 台灣、中國、韓國、日本代理商賣的曼谷或清邁寒假遊學、插班團。
5. 週末營、課後營（每週固定上課、可以只報幾週的也收）。

其他季節照 brief 的優先順序：2026-11～2027-02 其他週、2027 年 3～4 月、2027 年 6～8 月；過去梯次每家最多收 2 季，當往年證據。

## 泰國的格式規則（覆蓋 brief）

- provider：`"country":"TH"`，ID 一律以 `-th` 結尾，例 `british-council-th`、`traidhos-th`。
- 已在資料庫的代理商 `hsinfei`、`studymap`、`uhakpeople`：有賣泰國方案的話，program 掛在既有 provider 下，不要重建 provider。
- location：ID 一律以 `loc-th-` 開頭，`"country":"TH"`。
  - `city` 只有兩個值：`Bangkok`（含暖武里、北欖府 Bangna 一帶等曼谷都會區）、`Chiang Mai`（含 Mae Rim、Hang Dong、San Sai、Saraphi 等清邁府）。
  - `state` 填府名：`Bangkok`、`Nonthaburi`、`Samut Prakan`、`Chiang Mai`。
  - 其他城市（普吉、華欣、芭達雅等）不建檔，記 leads 一行。
- price：`currency` 用 `THB`（代理商用 TWD、KRW、USD 標價就照原幣）。泰國 VAT 7%，頁面有寫含不含稅才填 `tax_included`。
- 起價（from、starting from、「起」）要填 `price.from: true`。
- program 的 `staffing`、`facilities` 照 brief 填：只寫官方說的，沒寫就 null。
- 泰國公假已經在 `research/holidays.json`，不用查。

## 收錄門檻

- 對外開放報名的兒童假期營、假期班、短期插班（4～17 歲），有固定梯次或可以按週報名。
- 只有單日工作坊的不收，記 leads 一行。
- 官網或官方社群至少要能證明有辦。只出現在聚合站或代理商頁的照樣收，但 confidence 填 low，notes 寫「只見於 X」。
- 已停辦、網站失效、最後一次活動在 2023 年以前：記 not_found 並寫原因。

## 工具

- 以 WebSearch、WebFetch 為主。**WebSearch 每個 agent 最多 35 次**（全部 agent 共用一個額度，用完就停，不要繞過）。WebFetch 讀官網不限，但每家機構最多約 6 頁。
- Wayback：只在官網現在沒有梯次、要找去年證據時用。每次間隔 6 秒以上，最多 10 次。
- 不用 Chrome。遇到 Cloudflare、JS 頁面、Facebook、Instagram 讀不到，記 not_found 附 URL，主線程之後補。
- 不改 repo 其他檔案，不做任何 git 操作。

## 分工表（不屬於你的機構只記 leads，不建檔）

| batch_id | 範圍 | 已知線索（先查，再自己搜尋補） |
|---|---|---|
| `th-bkk-schools` | 曼谷國際學校、雙語學校：自辦假期營、短期插班 | ISB、NIST、Bangkok Patana、Shrewsbury、Harrow、KIS、Brighton College、Wellington College（官網有 2027 年 4/5～9 營）、Rugby School Thailand（曼谷校區）、St Andrews（Sukhumvit、Dusit）、Bangkok Prep、Ruamrudee、Concordian、Berkeley、Ascot、Verso、Wells、Thai-Chinese International School、Denla British School、Bromsgrove（曼谷校區） |
| `th-bkk-camps` | 曼谷非學校的營：運動、戶外、STEM、程式、藝術、戲劇、音樂、語言（含 British Council 兒童課）、綜合營品牌 | 自己搜尋：Bangkok kids holiday camp、school holiday camp Bangkok 2026、football／swimming／tennis camp Bangkok、coding camp Bangkok、British Council Bangkok holiday course |
| `th-cnx` | 清邁所有類型：國際學校自辦營與插班、戶外營、語言學校、運動營 | Traidhos Three-Generation（threegeneration.org：2027 年 1/18～22 Winter English Adventure、1/25～29 Winter English Survival，6～12 歲）、Prem Tinsulanonda International School、Chiang Mai International School（CMIS）、Lanna International School、Nakornpayap International School（NIS）、Grace International School、American Pacific International School、Panyaden International School、Unity Concord、Thailand Climbing 冬季攀岩營 |
| `th-study-tour` | 台、中、韓、日代理商賣的曼谷、清邁寒假遊學、親子遊學、插班團；給外國孩子的語言學校冬季課程。順手收這些方案的家長心得當 review | 搜尋：「清邁 遊學 寒假 2027」「清邁 插班 國際學校 親子」「曼谷 冬令營 遊學」「清迈 冬令营 2027」「치앙마이 영어캠프 겨울」「방콕 영어캠프」「チェンマイ 親子留学」；既有代理商 hsinfei、studymap、uhakpeople 有沒有泰國方案 |
| `th-aggregators` | 聚合站、媒體清單上列過的曼谷和清邁營隊，全部列出，對照上面各組名單，補研究真的沒人負責的 | BKK Kids、Bangkok Mums、Time Out Bangkok、Expique、Little Steps（若有曼谷）、Chiang Mai Mums、CityNews Chiang Mai、Chiang Mai Buzz、Edarabia／International Schools Database 的 Thailand 營隊頁 |

代理商賣的插班營：program 建在代理商名下，學校建成 location，價格照代理商寫的口徑。學校自己官網的插班方案歸學校那一組。

插班或短期就讀的 program，category 加 `short_term_enrolment`，notes 第一句寫「這是到學校跟班上課，不是假期營。」

## 輸出

寫到 `research/<batch_id>.json`，格式照 brief：providers、programs、locations、sessions、program_location_links、reviews、conflicts、not_found、leads、summary。寫完用 python 驗證 JSON 可以解析。

## 回報（繁體中文，15 行內）

- 新收幾家，每家一行：名稱、類型、城市、2027 年 1～2 月有沒有開（日期，或「每週可報」，或「查不到」）、年齡、價格口徑。
- 查過不收的機構和原因。
- 讀不到、要用 Chrome 補的網址。
