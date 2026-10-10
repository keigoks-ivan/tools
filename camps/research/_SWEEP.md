# 第三輪：補齊還沒收的營隊（2026-10-10）

用戶要求「認真找好所有的資源」。前兩輪已收 46 家機構，這一輪找還沒收的。

先讀：
- `/Users/ivanchang/tools/camps/research/_BRIEF.md`：格式、鐵則、tier、ID 規則、review 物件、上課地點規則，全部照做。
- `~/.claude/skills/zh-analyst-prose/SKILL.md` 第一節：寫 notes 和 summary 前讀。

## 開工前

用 python 讀 `data/providers.json`、`programs.json`、`locations.json`、`sessions.json`，列出既有機構名稱與 ID。
- 已在資料庫的機構：不要重建 provider／program／session。查到新梯次或新校區，記進 leads（kind 填 other，附日期、引文、URL）。
- 新機構的 ID 不能跟既有 ID 撞。
- 下面「分工表」列給別組的機構，你看到也只記 leads，不建檔。

## 優先順序

1. 用戶的實際查詢：2027-01-17～02-08，孩子 6 歲和 10 歲，住吉隆坡。這段期間有開、或「每週隨時可報名」的營最優先，日期、年齡、價格、時間、地點都要查清楚。
2. 2026-11～2027-02 的其他週。
3. 2027 年春假、暑假。
4. 過去梯次（2025、2026）只當往年證據，每家最多收 2 季。

## 收錄門檻

- 對外開放報名的兒童假期營或假期班（4～17 歲），有固定梯次，或可以按週報名。
- 只有單日工作坊（一天幾小時）的不收，記 leads 一行就好。
- 官網或官方社群至少要能證明「有辦兒童假期營」。只出現在聚合站、官網查不到的照樣收，但 confidence 填 low，notes 寫「只見於 X」。
- 已結束營業、網站失效、最後一次活動在 2023 年以前：不收，記 not_found 並寫原因。

## 工具

- 以 WebSearch、WebFetch 為主。WebSearch 每個 agent 最多 40 次。
- Wayback：另外兩個 agent 正在大量查 Wayback，IP 容易被限流。只在必要時用，例如官網現在沒有梯次、要找去年的證據。每次間隔 6 秒以上，最多 15 次。
- 不用 Chrome。遇到 Cloudflare 或 JS 頁面讀不到，記進 not_found 並附 URL，主線程之後會用 Chrome 補。
- Facebook、Instagram 讀不到就算了，同樣記 not_found。
- 每家機構最多查約 6 頁，查不到就換下一家。

## 輸出

- 寫到 `research/<batch_id>.json`，格式照 _BRIEF.md，包含 providers、programs、locations、sessions、program_location_links、reviews、conflicts、not_found、leads、summary。
- reviews：只收查資料時順手看到的平台評分，不另外花頁數找，也不查 Google Maps。
- 寫完驗證 JSON 可以解析。
- 不改 repo 其他檔案，也不做任何 git 操作。

## 分工表

正在跑的 agent（只補往年梯次）：
- `hist-brands`：newtonshow、arrowhead-skills、kensington-camps、crafty-whizz、kidocode、julia-gabriel、larasplace、mouratoglou、laliga、athletes-peak-academy、mad-about-education、wwsc、micfront、edwethink、ignite-learning、klik
- `hist-schools-lang`：iskl、bskl、igbis、epsom、sunway、king-henry-viii、ucsi、adcote-matrix、kis-sabah、tenby-penang、uplands、straits、raffles-american-school，以及資料庫已有的語言中心

這一輪：

| batch_id | 範圍 | 已知線索（先查這些，再自己搜尋補） |
|---|---|---|
| `sweep-intl-kl` | 吉隆坡、雪蘭莪、布城、森美蘭的國際學校：自辦假期營，以及學校官方的短期插班（trial／short-term／visiting student） | Mont'Kiara International School、EtonHouse Malaysia、Garden International School、Alice Smith（自辦的部分）、Tenby Setia Eco Park、Tenby Tropicana Aman、Sri KDU、Nexus Putrajaya、Taylor's International School（Puchong、KL）、Australian International School Malaysia、HELP International School、Fairview、Sayfol、ELC、Cempaka、Sri Emas、Tzu Chi International School KL、Rafflesia、Kingsgate、The International School @ ParkCity、Dwi Emas、Global Indian International School KL |
| `sweep-outside` | 吉隆坡以外的所有類型：檳城、新山、怡保、馬六甲、沙巴、砂拉越、蘭卡威、彭亨（雲頂、Janda Baik、金馬崙）、波德申 | Paragon（新山）、Learnoliday 和它頁面上的新山學校、Marlborough College Malaysia 自辦營、Austin Heights、Imperial International School Ipoh、Tenby Ipoh、Seri Botani、Bell Language Centre Penang、Outward Bound Malaysia（Lumut、Sabah）、新山的韓國學生英語營、Dalat、St. Christopher's Penang、Radiant Retreats（Janda Baik）、Peninsula International School Australia（PISA） |
| `sweep-sport-outdoor` | 巴生谷的運動與戶外營 | Sports 4 Kids（Dwi Emas）、Active Learning Academy（IGBIS）、Move For Life、Red Rescue Lifesaving、Aeronaut Anchors Aweigh Sailing、MBA Badminton Puchong、Bristol Academy KL，再搜尋游泳、足球、網球、高爾夫、體操、攀岩（Camp5）、溜冰、騎馬、武術、綜合運動、戶外冒險 |
| `sweep-enrich` | 巴生谷的 STEM、程式、機器人、藝術、戲劇、音樂、烹飪、禮儀、創業、外語（非英語）營 | Engineering For Kids、Mad Science Malaysia、STEM Academy Malaysia、Computer Academy NOVA、Good Times DIY、Molly Manners、Beaconhouse Young Entrepreneur、CR8 Kepong、ITrainKids、California KL、Global Enrichment Programme（GEP）、SuperCamp Malaysia、Alliance Française KL、British Council KL |
| `sweep-study-tour` | 賣給外國家庭的 1～2 月方案：台灣、日本、韓國、中國代理商的馬來西亞寒假遊學／插班營；資料庫沒有的語言中心與大學語言中心的兒童冬令營 | Kistudy、Tabiniko、Quantum Scholars ESL Winter Camp、新飛的新產品（新飛本身已在庫）、ELS、大學語言中心（Taylor's、Sunway、HELP、UCSI、INTI）的 junior winter program、INTI Little Explorers |
| `sweep-aggregators` | 把聚合站上列過的營隊全部列出，對照資料庫與上面各組名單，補研究真的沒人負責的 | Little Steps KL（年底、農曆年、三月假期、暑假清單）、KL with Kids、Edarabia、Expatriate Lifestyle、ExpatGo、Kiddy123、theAsianparent MY、The Smart Local MY、Time Out KL、Mamaclub |

代理商賣的插班營：program 建在代理商名下，學校建成 location，價格照代理商寫的口徑。學校自己官網的插班方案歸 `sweep-intl-kl`。

插班或短期就讀的 program，category 加 `short_term_enrolment`，notes 第一句寫「這是到學校跟班上課，不是假期營」。

## 回報（繁體中文，15 行內）

- 新收幾家，每家一行：名稱、類型、地點、2027 年 1～2 月有沒有開（日期，或「每週可報」，或「查不到」）、年齡、價格口徑。
- 查過但不收的機構和原因。
- 讀不到、要用 Chrome 補的網址。
