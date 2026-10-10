# 日本暑假專查：東京、大阪、京都、神戶、福岡、沖繩（2026-10-10）

網站已經有日本的寒假資料。這一輪只補暑假：2027 年 6 月底到 8 月底，以及當證據用的 2026、2025 年暑假梯次。

先讀：
- `/Users/ivanchang/tools/camps/research/_BRIEF.md`：格式、鐵則、tier、review 物件、上課地點規則，全部照做。
- `/Users/ivanchang/tools/camps/research/_SWEEP_JP.md`：日本的格式規則（ID、city、state、`language_of_instruction`、日圓與消費稅、`tax_note` 只寫稅、起價 `from`、插班的 notes 開頭句）全部照做。只有「用戶的實際查詢」和「分工表」兩節換成本檔的版本。
- `/Users/ivanchang/tools/camps/research/_JP_EXISTING.md`：已經在資料庫的日本機構、方案、地點。
- `~/.claude/skills/zh-analyst-prose/SKILL.md` 第一節：寫 notes 和 summary 前讀。

## 用戶的實際查詢（最優先）

台灣家庭，暑假到日本住一段時間，孩子白天上營隊、課程或插班。台灣暑假大約 2027-07-01～08-31。兩個孩子：2016-05 生（2027 年 7 月 11 歲，日本學制小 5）、2020-05 生（7 歲，小 1）。孩子不會日語。

日本學校的夏休み大約 7/20～8/31，國際學校大約 6 月中到 8 月底。7 月上中旬日本公立小學還在上課，這段可以找「体験入学」。要找的：
1. 2027 年 7～8 月的英語營、暑期學校、主題營（運動、STEM、藝術、戶外），可以按週或按日報名的優先。
2. 國際學校、私立學校的暑期學校（Summer School）、對外開放的暑期營。
3. 英語學童、國際幼兒園、英會話教室的夏期短期利用、サマースクール、夏期講習（7 歲可上的）。
4. 公立、私立小學的夏季体験入学（給海外或外國孩子的），7 月上中旬最常見。
5. 給外國孩子的日語課（兒童班、親子班、junior summer course）。
6. 台灣、中國、香港、韓國代理商賣的這六地暑假遊學、親子遊學、小學體驗入學團。

2027 年梯次多半還沒公布。官網有 2026 年暑假梯次就收（`confirmed_other_year`，season 填 `other`），再建一筆 2027 的推估 session（`pattern_estimated`，season `summer_2027`，ID 用 `-tbd-2027s`，`estimate_basis` 寫 2026 日期和來源）。2026 沒有就往回找 2025，每家最多收 2 季往年。

## 已經在資料庫的機構

`_JP_EXISTING.md` 列的機構和方案，ID 一律照抄，不要另建新 ID：
- 已有 provider 和 program：只補缺的 session（例如 2026 暑假梯次、2027 推估）和缺的欄位（價格、年齡、時間、上課語言、師資、設施）。program 和 provider 物件只要寫 `id` 和你補的欄位，其他欄位省略。
- 同一家機構的新方案（例如已有冬季營，現在補暑期營）：沿用 provider ID，新建 program。
- 已有的 location 照用，不要為同一個校區另建 location。

## 收錄門檻

照 `_SWEEP_JP.md` 的收錄門檻。另外：
- 住宿營（合宿、宿泊キャンプ）：營地在六地範圍內才建檔，並在 notes 寫最小年齡和要不要會日語。營地在長野、山梨、北海道等範圍外的，記 leads 一行（名稱、地點、年齡、日期、價格、從哪裡出發）。
- 只用日語上課的日本營隊：照收，notes 第一句寫「日語授課。」並寫明有沒有說外國孩子或不會日語的孩子能不能參加。
- 單日或兩天的活動不收，記 leads 一行。

## 工具

- 以 WebSearch、WebFetch 為主。**WebSearch 每個 agent 最多 35 次**，用完就停，不要繞過。WebFetch 讀官網不限，每家機構最多約 6 頁。
- 日文、英文、中文、韓文關鍵字都要搜。例：「サマースクール 2026 小学生 英語」「夏休み 英語キャンプ 小学生 東京」「インターナショナルスクール サマースクール 一般生」「英語学童 夏期 短期 スポット」「体験入学 夏休み 海外 小学校 外国籍」「summer camp Tokyo kids 2026」「日本 暑假 遊學 小學 2026」「沖繩 親子遊學 暑假」「日本小學體驗入學 暑假」「일본 여름 영어캠프 초등」「오키나와 여름캠프」。
- Wayback：只在官網現在沒有梯次、要找去年證據時用。每次間隔 6 秒以上，最多 10 次。
- 不用 Chrome。遇到 Cloudflare、JS 頁面、圖片價目表、Facebook、Instagram、LINE 讀不到，記 not_found 附 URL，主線程之後補。
- 不改 repo 其他檔案，不做任何 git 操作。

## 分工表（不屬於你的機構只記 leads，不建檔）

| batch_id | 範圍 | 已知線索（先查，再自己搜尋補） |
|---|---|---|
| `jp-summer-tokyo-schools` | 東京圈國際學校、私立學校的暑期學校、暑期營、夏季体験入学 | `_JP_EXISTING.md` 東京段的所有學校（缺 2026 價格、年齡、是否對外的都補）；EtonHouse Tokyo、Rugby School Japan（柏，暑期住宿營與足球營）、Malvern College Tokyo、Tokyo International School（Minato）Summer Programme、Columbia、British School in Tokyo、K. International、NewInternational School、GIIS、Canadian International School、Seisen、Nishimachi（Summer Care 與鹿角營）、KAIS |
| `jp-summer-tokyo-camps` | 東京圈非學校的營與課：英語日營、英語學童與國際幼兒園的サマースクール、英會話的夏期課程、運動、STEM、程式、藝術、戶外 | Elev8 暑期、ABC International School（元麻布）、American Kids International School（港未來）、EWA Summer Camp、Harajuku Kids Club、Kids Duo サマースクール、Global Step Academy、Tokyo Kids Write、iForest、Tokyo YMCA（英語日營）、Nanbo Discovery Camp（館山）、Little Kids Box、Tokyo Coding Club、足球與網球營（FC Barcelona、Real Madrid Foundation 等在東京辦的兒童營） |
| `jp-summer-kansai` | 大阪、京都、神戶所有類型 | `_JP_EXISTING.md` 關西段所有機構（KIS Summer Camp PDF、SMIS 年齡、Canadian Academy 2027）；Aoba-BBT Osaka English Camp、TUJ Kyoto 暑期方案、京都外国語大学 English Summer School、Osaka YMCA International School 暑期、大阪 YMCA 英語營、Kansai International Academy、Marist Brothers、Doshisha International School Kyoto、關西的英語學童サマースクール |
| `jp-summer-fukuoka` | 福岡所有類型 | `_JP_EXISTING.md` 福岡段所有機構；Fukuoka International School Summer Camp、Kinder Kids 福岡校 Season School、福岡 YMCA 夏季英語營、福岡市公立小学校の体験入学（夏）、APCC 相關營隊、福岡的英語學童サマースクール |
| `jp-summer-okinawa` | 沖繩本島所有類型 | `_JP_EXISTING.md` 沖繩段所有機構（OIS 暑期兩個方案的價格與 2027、OCSI Summer Academy、Crystal Ward）；Churakids サマーキャンプ、U-GAKU、Okinawa YMCA、AmerAsian School、美軍基地周邊對外開放的英語營、沖繩的英語學童サマースクール、沖繩縣內小學夏季体験入学 |
| `jp-summer-study-tour` | 台、中、港、韓代理商賣的六地暑假遊學、親子遊學、小學體驗入學團；語言學校給外國孩子的暑期日語兒童班、親子班；順手收這些方案的家長心得當 review | 既有代理商 `hsinfei`、`studymap`、`uhakpeople`；Coto Academy Kids Summer、LTL 暑期營（`ltl-school-jp`）、GenkiJACS、ISI、Kai、赤門會、Yoshida、Sendagaya、ISI Osaka Summer Program；搜尋「日本 暑假 遊學 小學」「日本小學 體驗入學 暑假 台灣」「沖繩 親子遊學 暑假」「福岡 小學 體驗入學」「日本 夏令营 小学生 2026」「冲绳 夏令营 游学」「일본 여름방학 영어캠프 초등」「일본 초등학교 체험입학」 |

聚合站與媒體清單（Tokyo Weekender、Savvy Tokyo、Metropolis、Tokyo Cheapo、Kansai Scene、Fukuoka Now、Okinawa Hai!、International Schools Database、日文營隊站）每組自己查與本組城市有關的頁面，只收本組範圍的機構。

代理商賣的插班營：program 建在代理商名下，學校建成 location，價格照代理商的口徑。學校自己官網的方案歸學校那一組。英會話教室和英語學童在多個城市有分店的，歸 `jp-summer-tokyo-camps`，其他城市的分店建成 location。

## 輸出

寫到 `research/<batch_id>.json`，格式照 brief：providers、programs、locations、sessions、program_location_links、reviews、conflicts、not_found、leads、summary。既有的 provider、program 只寫 `id` 加補的欄位。寫完用 python 驗證 JSON 可以解析，並檢查每個新 location 的 `city` 都是六個值之一、每個 session 的 `program_id` 不是在你的檔裡就是在 `_JP_EXISTING.md` 裡。

## 回報（繁體中文，15 行內）

- 新收或補強幾家，每家一行：名稱、類型、城市、上課語言、2027 暑假有沒有日期（日期，或「2026 年是 X～Y」）、年齡、價格口徑。
- 查過不收的機構和原因。
- 讀不到、要用 Chrome 補的網址。
