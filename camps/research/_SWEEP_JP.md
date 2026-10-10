# 日本：東京、大阪、京都、神戶、福岡、沖繩（2026-10-10）

用戶要把網站擴到日本，只做上面六地。家庭從台灣來，在當地住一段時間，孩子白天上營隊、課程或插班。孩子不會日語。

先讀：
- `/Users/ivanchang/tools/camps/research/_BRIEF.md`：格式、鐵則、tier、review 物件、上課地點規則，全部照做。下面寫的日本規則優先於 brief 裡馬來西亞的寫法。
- `~/.claude/skills/zh-analyst-prose/SKILL.md` 第一節：寫 notes 和 summary 前讀。

## 用戶的實際查詢（最優先）

2027-01-17～02-08，兩個孩子：2016-05 生（約 10 歲，日本學制小 4）、2020-05 生（約 6 歲，日本學制幼稚園大班「年長」）。

日本學校的冬休み大約 12/25～1/7，國際學校的寒假大約 12 月中到 1 月初。1/17～2/8 日本學校和國際學校都在上課，一般的冬令營這時已經結束。這段期間要特別找這幾類：
1. 1 月中到 2 月上旬有開的營或課，或「每週可報名」「可以只上幾週」的課程。
2. 英語學童（英語で預かる学童保育）、國際幼兒園（6 歲可上）的短期利用、スポット利用、一時利用、冬期短期入会。
3. 國際學校、私立學校的短期插班（visiting student、trial、short-term enrolment），以及公立或私立小學的「体験入学」。
4. 給外國孩子的日語課（兒童班、親子班、junior course）。
5. 台灣、中國、香港、韓國代理商賣的這六地寒假遊學、親子遊學、體驗入學團。
6. 週末營、課後營（每週固定上課、可以只報幾週的也收）。

其他季節照 brief 的優先順序：2026-11～2027-02 其他週（含 12/25～1/7 的冬休み營）、2027 年 3～4 月（春休み）、2027 年 6～8 月；過去梯次每家最多收 2 季，當往年證據。

## 日本的格式規則（覆蓋 brief）

- provider：`"country":"JP"`，ID 一律以 `-jp` 結尾，例 `asij-jp`、`yokohama-international-school-jp`。
- 已在資料庫的代理商 `hsinfei`、`studymap`、`uhakpeople`：有賣日本方案的話，program 掛在既有 provider 下，不要重建 provider。
- location：ID 一律以 `loc-jp-` 開頭，`"country":"JP"`。
  - `city` 只有六個值：
    - `Tokyo`：東京都，加上神奈川縣（橫濱、川崎）、千葉縣、埼玉縣。
    - `Osaka`：大阪府。
    - `Kyoto`：京都府。
    - `Kobe`：兵庫縣阪神一帶（神戶、蘆屋、西宮、尼崎）。
    - `Fukuoka`：福岡縣。
    - `Okinawa`：沖繩本島。
  - `state` 填都道府縣英文：`Tokyo`、`Kanagawa`、`Chiba`、`Saitama`、`Osaka`、`Kyoto`、`Hyogo`、`Fukuoka`、`Okinawa`。
  - 其他地方（北海道、長野、名古屋、廣島、石垣、宮古等）不建檔，記 leads 一行。滑雪營不在這次範圍。
- `language_of_instruction` 必填：`["English"]`、`["Japanese"]`、`["English","Japanese"]`、`["Mandarin"]`。只用日語上課的 program，notes 第一句寫「日語授課。」頁面沒寫上課語言就看頁面語言和師資判斷，並在 notes 寫「頁面沒寫上課語言，依 X 判斷」。
- price：`currency` 用 `JPY`（代理商用 TWD、CNY、HKD、KRW、USD 標價就照原幣）。日本消費稅 10%：頁面寫「税込」填 `tax_included: true`；寫「税別」「税抜」填 `false`，`tax_note` 寫「税別，另加 10% 消費稅」。沒寫就填 null。
  - `tax_note` 只寫稅。入会金、年会費、教材費、保險費、交通費等其他費用寫在 session 的 `notes`，寫金額，不要寫「%」。
- 起價（from、starting from、「〜」「から」「起」）要填 `price.from: true`。
- 英語學童、國際幼兒園多半按月或按日收費：照原口徑填 `basis`（per_day、per_week、per_session）；按月收費用 `per_camp` 並在 notes 寫「月費，一個月」。
- program 的 `staffing`、`facilities` 照 brief 填：只寫官方說的，沒寫就 null。
- 日本公假已經在 `research/holidays.json`，不用查。

## 收錄門檻

- 對外開放報名的兒童假期營、假期班、短期插班、可短期利用的學童或幼兒園（4～17 歲），有固定梯次或可以按週、按日報名。
- 只收在籍學生、或要簽一年以上合約的不收，記 leads 一行並寫原因。
- 只有單日工作坊的不收，記 leads 一行。
- 官網或官方社群至少要能證明有辦。只出現在聚合站或代理商頁的照樣收，但 confidence 填 low，notes 寫「只見於 X」。
- 已停辦、網站失效、最後一次活動在 2023 年以前：記 not_found 並寫原因。

## 工具

- 以 WebSearch、WebFetch 為主。**WebSearch 每個 agent 最多 35 次**（全部 agent 共用一個額度，用完就停，不要繞過）。WebFetch 讀官網不限，但每家機構最多約 6 頁。
- 日文、中文、韓文關鍵字都要搜，日本本地的營多半只有日文頁。例：「冬休み 英語キャンプ 小学生 2027」「英語学童 短期 冬」「スポット利用 英語学童 東京」「インターナショナルスクール ウィンターキャンプ」「体験入学 外国籍 短期 小学校」「インターナショナルプリスクール 短期」。
- Wayback：只在官網現在沒有梯次、要找去年證據時用。每次間隔 6 秒以上，最多 10 次。
- 不用 Chrome。遇到 Cloudflare、JS 頁面、Facebook、Instagram、LINE 讀不到，記 not_found 附 URL，主線程之後補。
- 不改 repo 其他檔案，不做任何 git 操作。

## 分工表（不屬於你的機構只記 leads，不建檔）

| batch_id | 範圍 | 已知線索（先查，再自己搜尋補） |
|---|---|---|
| `jp-tokyo-schools` | 東京圈國際學校、私立學校：自辦假期營、短期插班、体験入学 | ASIJ、British School in Tokyo、Nishimachi、Seisen、St. Mary's、International School of the Sacred Heart、K. International、Aoba-Japan、Tokyo International School、GIIS Tokyo、Yokohama International School、Saint Maur、Horizon Japan、Columbia International School、Rugby School Japan（柏）、Malvern College Tokyo、Tokyo West International School、New International School of Japan、Laurus International School of Science、Canadian International School Tokyo |
| `jp-tokyo-camps` | 東京圈非學校的營與課：英語營、英語學童與國際幼兒園的短期利用、英會話教室的冬期課程、運動、STEM、程式、藝術、戶外 | 自己搜尋：Tokyo kids winter camp、English camp Tokyo、英語学童 短期 東京、Kids Duo 短期、冬休み 英語キャンプ 東京、Tokyo YMCA camp、football／swimming camp Tokyo、coding camp Tokyo |
| `jp-kansai` | 大阪、京都、神戶所有類型（學校、營、英語學童、英會話） | Canadian Academy、Osaka International School、Kansai International Academy、Kyoto International School、Marist Brothers International School、St. Michael's International School、Osaka YMCA International School、Doshisha International School Kyoto、Osaka YMCA camp |
| `jp-fukuoka` | 福岡所有類型（學校、營、英語學童、英會話） | Fukuoka International School、福岡 YMCA、Fukuoka Now 列的營；自己搜尋「福岡 英語学童 短期」「福岡 冬休み 英語キャンプ」 |
| `jp-okinawa` | 沖繩本島所有類型（學校、營、英語學童、英會話） | Okinawa International School、Okinawa Christian School International、AmerAsian School in Okinawa、Okinawa YMCA；自己搜尋「沖縄 英語学童 短期」「沖縄 冬休み 英語キャンプ」「Okinawa kids camp」 |
| `jp-study-tour` | 台、中、港、韓代理商賣的六地寒假遊學、親子遊學、體驗入學、插班團；語言學校給外國孩子的日語兒童班、親子班。順手收這些方案的家長心得當 review | 搜尋：「日本 遊學 寒假 2027 兒童」「沖繩 親子遊學 寒假」「福岡 小學 體驗入學」「東京 冬令營 2027」「日本 國際學校 短期插班」「日本 冬令营 2027 小学生」「冲绳 游学 冬令营」「일본 영어캠프 겨울」「오키나와 영어캠프」「후쿠오카 초등 어학연수」；語言學校：GenkiJACS、ISI、Kai、赤門會等有沒有兒童或親子班；既有代理商 hsinfei、studymap、uhakpeople 有沒有日本方案 |
| `jp-aggregators` | 聚合站、媒體清單上列過的六地營隊，全部列出，對照上面各組名單，補研究真的沒人負責的 | Tokyo Weekender、Savvy Tokyo、Metropolis、Tokyo Cheapo、Kansai Scene、Fukuoka Now、Okinawa Hai!、International Schools Database 的 Japan 頁；日文營隊站（キャンプ情報サイト、子どもキャンプ一覽、英語キャンプ一覽） |

代理商賣的插班營：program 建在代理商名下，學校建成 location，價格照代理商寫的口徑。學校自己官網的插班方案歸學校那一組。英會話教室和英語學童如果在多個城市有分店，歸 `jp-tokyo-camps`，其他城市的分店建成 location。

插班或短期就讀的 program，category 加 `short_term_enrolment`，notes 第一句寫「這是到學校跟班上課，不是假期營。」英語學童、國際幼兒園的短期利用也加 `short_term_enrolment`，notes 第一句寫「這是課後托育或幼兒園的短期利用，不是假期營。」

## 輸出

寫到 `research/<batch_id>.json`，格式照 brief：providers、programs、locations、sessions、program_location_links、reviews、conflicts、not_found、leads、summary。寫完用 python 驗證 JSON 可以解析，並檢查每個 location 的 `city` 都是上面六個值之一。

## 回報（繁體中文，15 行內）

- 新收幾家，每家一行：名稱、類型、城市、上課語言、2027 年 1～2 月有沒有開（日期，或「每週可報」，或「查不到」）、年齡、價格口徑。
- 查過不收的機構和原因。
- 讀不到、要用 Chrome 補的網址。
