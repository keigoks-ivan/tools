# 營隊資料蒐集 brief（所有研究 agent 共用）

今天是 **2026-10-10**。目標：建一個馬來西亞夏令營／寒假營資料庫，讓家長輸入日期＋孩子年齡＋城市就能查到可報名的梯次。
**資料完整度與可信度第一。寧可 null，不可編造。**

## 鐵則

1. **每個日期、價格、年齡、人數都要有來源**（URL＋存取日＋原文短引文）。找不到就填 `null`，不要用印象或「通常」補值。
2. **年份陷阱**：很多官網掛的是去年的日期。一定要確認頁面上寫的年份。2026-10-10 以前的梯次＝過去的梯次。
   - `confirmed_target_year`：官方來源明寫 2026/27 冬季或 2027 的日期
   - `confirmed_other_year`：日期是真的，但屬於別的年份（例如 2026-01 的梯次）
   - `pattern_estimated`：目標季日期沒公布，但有歷史證據顯示每年都開 → `start_date`/`end_date` 填 null，`estimate_basis` 寫明歷史梯次（日期＋來源）
   - `unknown`：什麼都查不到
   - 頁面沒寫年份 → 不要猜，標 `unknown`，notes 說明「頁面未標年份」
3. **價格口徑分開存**：每日／每週／兩週／每梯次、含稅與否、早鳥條件（限哪個平台、哪天前付款、適用幾週幾人）各自一欄，不要換算成同一個口徑。
4. **來源衝突**：同一欄位不同來源講法不一樣 → 全部保留到 `conflicts[]`，該筆 `confidence: "low"`，不要自己挑。
5. **代理商／聚合站／部落格只是線索**，一定要回官網或官方訂位系統確認。確認不了就照實標 tier 4/5、`confidence: "low"`。
6. 種子資料（`_SEED.md`）是用戶 2026-10-10 親自查過的事實：照收進你的輸出，補上 null 欄位；若你查到和種子矛盾的內容，記進 `conflicts[]`，不要覆寫種子。
7. 頁面是 JS 動態載入、讀不到 → 記進 `not_found[]`（寫明「JS 頁面無法讀取」＋ URL），不要猜內容。
8. 每家機構最多查約 6 個頁面；查不到就進 `not_found[]`，往下一家走。不要為了湊數灌水。
9. 只用 WebSearch／WebFetch。**不要**動 repo 裡任何其他檔案，**不要** git add／commit。

## 證據層級（tier）與 confidence

| tier | 來源 |
|---|---|
| 1 | 官方訂位系統／官方梯次頁 |
| 2 | 官方新聞稿、官方 PDF 簡章 |
| 3 | 營隊官方社群（FB／IG） |
| 4 | 第三方媒體、聚合站（Little Steps、KL With Kids、languagecourse.net、world-camps.org） |
| 5 | 代理商、聯盟連結部落格 |

confidence：`high`＝tier 1–2 且是目標年；`medium`＝tier 3，或 tier 4 但與官方不矛盾；`low`＝只有 tier 4–5、或有矛盾。

## 目標季節（依優先順序）

1. **寒假 2026-11 ~ 2027-02**（最優先；用戶預設查詢區間 2027-01-17 ~ 2027-02-08）
2. 2027 年 3–4 月（復活節／學期假）
3. 2027 年 6–8 月暑假
過去梯次（2024–2026）也要收，標 `confirmed_other_year`，作為 `pattern_estimated` 的證據。

## ID 規則（小寫 kebab-case）

- provider：`camp-beaumont`、`erican`、`gis`
- program：`<provider>-<短名>`，例 `camp-beaumont-active`
- location：`loc-<地點短名>`，例 `loc-alice-smith-primary`、`loc-newtonshow-bangsar`
- session：`<program>-<地點短名>-<YYYYMMDD>`；日期未知用 `-tbd-2027w`（寒假）／`-tbd-2027s`（暑假）

## 輸出格式

寫成**一個 JSON 檔**：`/Users/ivanchang/tools/camps/research/<batch_id>.json`，寫完用 `python3 -c "import json;json.load(open('<path>'))"` 驗證能解析。

```json
{
  "batch_id": "",
  "accessed": "2026-10-10",
  "providers": [],
  "programs": [],
  "locations": [],
  "sessions": [],
  "conflicts": [],
  "not_found": [],
  "leads": [],
  "summary": ""
}
```

### 共用 source 物件
```json
{"url": "", "tier": 1, "accessed": "2026-10-10", "fields": ["age_min","price"], "quote": "原文短引文（≤30 字）"}
```

### provider
```json
{"id":"", "name_en":"", "name_zh":null,
 "type":"international_school_hosted|language_centre|specialty_science|specialty_coding|specialty_art|specialty_sport|overnight_nature|agent_package|school_own_camp|other",
 "country":"MY", "website":"", "contact":{"email":null,"phone":null,"whatsapp":null},
 "accreditation":[], "founded_year":null, "notes":"", "sources":[]}
```

### program
```json
{"id":"", "provider_id":"", "name":"", "category":[], "language_of_instruction":[],
 "age_min":null, "age_max":null, "age_rule":"at_start_date|in_calendar_year|null",
 "format":"day|residential|family_with_parent|parent_optional",
 "hours":{"start":null,"end":null,"days":null},
 "class_size_max":null, "class_size_avg":null, "staff_ratio":null,
 "includes":{"lunch":null,"snacks":null,"materials":null,"accommodation":null,"airport_transfer":null,"insurance":null,"tshirt":null},
 "excludes":[], "requirements":[],
 "booking":{"url":null,"deadline":null,"payment_terms":null,"refund_policy":null,"flex_ticket":null,"sibling_discount":null},
 "location_ids":[], "safety":{"first_aid":null,"cctv":null,"insurance":null,"notes":null},
 "notes":"", "sources":[]}
```

### location
```json
{"id":"", "name":"", "address":null, "city":"", "state":"", "country":"MY",
 "lat":null, "lng":null, "venue_type":"school|centre|hotel|outdoor|other", "transport_notes":null, "sources":[]}
```
`city` 用這些值之一：`Kuala Lumpur`、`Petaling Jaya`、`Subang Jaya`、`Puchong`、`Shah Alam`、`Selangor-other`、`Penang`、`Johor Bahru`、`Kota Kinabalu`、`Negeri Sembilan`、`Perak`、`Melaka`、`Langkawi`、`Kuching`、`other`。lat/lng 除非官方頁面給，否則 null。

### session
```json
{"id":"", "program_id":"", "location_id":"", "start_date":null, "end_date":null,
 "weekday_pattern":"Mon-Fri", "date_status":"confirmed_target_year|confirmed_other_year|pattern_estimated|unknown",
 "year":null, "season":"winter_2026_27|spring_2027|summer_2027|other",
 "price":{"amount":null,"currency":"MYR","basis":"per_week|per_day|per_session|per_2weeks|per_camp|null",
          "tax_included":null,"tax_note":null,"source_url":null,
          "early_bird":{"amount":null,"deadline":null,"condition":null}},
 "min_duration_weeks":null, "flexible_start":null, "spots_status":null,
 "source_url":"", "verified_at":"2026-10-10", "evidence_quote":"",
 "confidence":"high|medium|low", "estimate_basis":null, "notes":""}
```
`source_url` 與 `verified_at` **必填**（即使 date_status 是 unknown，也填你查證「查不到」的那一頁）。

### conflicts / not_found / leads
```json
{"entity_id":"", "field":"", "values":[{"value":"", "source_url":"", "tier":4}], "note":""}
{"name":"", "what_missing":"", "tried_urls":[]}
{"name":"", "url":"", "kind":"new_provider|hosted_brand_camp|other", "note":"", "evidence_quote":""}
```
`hosted_brand_camp`：學校頁面上看到外部品牌（Camp Beaumont、Arrowhead 等）在該校辦營 → 記在 leads（附日期與引文），由品牌 batch 負責建 session。

## 文字

`notes`、`summary` 用繁體中文、全形標點；機構名、營隊名保留英文原名。寫 notes 前先讀 `~/.claude/skills/zh-analyst-prose/SKILL.md` 的 AI 痕跡清單：白話、短句、先講結論。

## 分工表（避免重複；不屬於你的機構不要建 session，看到線索記 leads）

| batch_id | 負責範圍 |
|---|---|
| `intl-kl` | 吉隆坡／雪蘭莪／森美蘭國際學校自辦營 |
| `intl-other` | 檳城、柔佛、沙巴、砂拉越、霹靂等地國際學校自辦營 |
| `brands-1` | Camp Beaumont、Arrowhead Skills、Kensington Camps、Embassy Camps、Mad About Education |
| `brands-2` | Newtonshow、Fun4Kids、Sport4Kids、STEM Academy、KLIK，以及其他綜合型營隊品牌 |
| `specialty` | 專項：科學、程式、藝術、運動（足球／網球／高爾夫／游泳等）、戶外自然 |
| `lang-kl` | 吉隆坡英語語言中心兒童班／冬令營 |
| `lang-other` | 檳城與沙巴語言中心（含 GEC）、台灣代理商在賣的馬來西亞行程、華語營／雙語營 |
| `leads-sweep` | 從聚合站與親子社群找出上面都沒列到的機構 |
| `holidays` | 公眾假期與學校行事曆（另有格式，見該 agent 指示） |

## 回報給主線程

寫完檔後，只回傳 10 行內摘要：provider／program／session 數、各 date_status 筆數、最重要的 3 個缺口、矛盾數。**不要**把 JSON 貼回來。

## 追加（2026-10-10）：評價與上課地點

### review 物件（放在輸出的 `reviews[]`）
```json
{"id":"rev-<provider>-<platform>", "entity_type":"provider|location|program", "entity_id":"",
 "platform":"google_maps|facebook|languagecourse_net|tripadvisor|little_steps|reddit|lowyat|blog|other",
 "rating":null, "scale":5, "count":null, "about_kids_program":null,
 "url":"", "accessed":"2026-10-10", "evidence_quote":"",
 "highlights_pos":[{"text":"","url":""}], "highlights_neg":[{"text":"","url":""}],
 "confidence":"high|medium|low", "notes":""}
```
- 分數與則數必須是頁面上直接讀到的；只在搜尋摘要看到 → `confidence: "low"`，notes 寫「搜尋摘要」。
- 不同平台的分數**不要平均、不要合併**，各平台一筆。
- 則數少於 10 則，notes 寫明樣本小。
- 評價是針對成人課程還是兒童營，分清楚（`about_kids_program`）；分不出就 null。
- highlights 只放有原文支撐的具體內容（例：「老師多為外籍」「午餐份量少」），每條附 URL；不要自己歸納「整體口碑良好」這類話。

### 上課地點
- location 要有完整地址、city、state；能從官方頁或 Google Maps 連結讀到座標才填 lat/lng。
- 每個 program 實際在哪些地點上課，要有來源（`program_location_links[]`：`{"program_id":"","location_id":"","source_url":"","quote":""}`）。官方沒說哪個校區辦營 → 不要猜，記 not_found。

## 追加（2026-10-10 第二輪）：網路評價蒐集與主題整理

用戶要求「評價來源多一點，並整理好」。Google Maps 已由 Chrome agent 負責，**你不要查 Google Maps**。

### 要找的平台（能讀到幾個就收幾個，每個平台一筆 review 物件）
- `facebook`（粉專的評分與推薦數、家長社群貼文）、`tripadvisor`、`reddit`（r/malaysia、r/kualalumpur、r/expats）、`lowyat`（forum.lowyat.net）
- 親子媒體與部落格：`little_steps`（有家長留言或編輯實測才算）、`blog`（KL 媽媽部落格、theAsianparent、Expatriate Lifestyle 等）
- 中文家長與遊學心得（對用戶最重要，用戶是台灣家長）：`pixnet`、`mobile01`、`dcard`、`backpackers`（背包客棧）、`blog`（其他中文部落格）、`xiaohongshu`／`zhihu`（簡體，能讀到才收）
  - 搜尋例：「Erican 遊學 心得」「EMS 吉隆坡 遊學 評價」「吉隆坡 冬令營 心得 小孩」「馬來西亞 遊學 親子 心得 2025」「沙巴 GEC 遊學 心得」「新山 遊學 Raffles 心得」
- 其他：`trustpilot`、`edarabia`（國際學校評分，about_kids_program 填 false）、`languagecourse_net`（已有的不重查）
- 搜尋摘要裡看到但點不進去的 → 不要收分數，記 not_found

### review 物件加欄位
沿用上面的 review 物件，`highlights_pos`／`highlights_neg` 每條改成：
```json
{"text":"繁中短述（≤40 字，白話）", "quote":"原文短引（≤25 字）", "url":"", "date":"YYYY-MM 或 null",
 "theme":"teachers|curriculum|kids_experience|safety_care|food|facilities|admin|value|classmates|accommodation|transport|other",
 "author_type":"parent|student|editorial|staff|unknown", "about_kids_program":true}
```
主題中文：師資、課程內容、孩子感受、安全與照顧、餐食、環境設施、行政溝通、價格與退費、同學組成（國籍比例，例如「班上多是中國／韓國學生」）、住宿、交通、其他。

### 規則
- 每條 highlight 都要是那個網址上真的有的內容；沒有原文支撐不要寫。不要寫「整體口碑良好」這類歸納句。
- 標出日期；2020 年以前的內容 notes 註明「舊資料」。
- 分清楚是不是兒童營／兒童班的評價（成人課程、學校本身的評價 → about_kids_program=false）。
- 業者自己貼的見證（官網 testimonial）`author_type: "staff"`，confidence low。
- 代理商頁面上的「學員心得」author_type 用 `unknown`，notes 註明是代理商刊登。
- 每家機構最多查約 5 個頁面。
- 先用 python 讀 `/Users/ivanchang/tools/camps/data/reviews.json`，已有的同機構同平台不要重收；你找到更新或更完整的，照收並在 notes 寫「更新既有」。

### 輸出
`{"batch_id":"", "accessed":"2026-10-10", "reviews":[], "not_found":[], "summary":""}`
