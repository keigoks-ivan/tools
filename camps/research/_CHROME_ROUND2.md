# Chrome 第二輪任務（2026-10-10）

WebSearch 額度已用完；這輪全部用 Chrome。規則同第一輪（只讀、不送表單、不填個資、拒絕非必要 cookie）。
**遇到 Google 機器人驗證（CAPTCHA／unusual traffic）立刻停止該類查詢，不要嘗試破解**，記 not_found，改做下一類。
輸出：`/Users/ivanchang/tools/camps/research/chrome-round2.json`（brief 的 batch 格式＋`verifications[]`），ID 沿用 `/Users/ivanchang/tools/camps/data/*.json`。

## A. Google Maps 評價（platform=google_maps）
開 `https://www.google.com/maps/search/<查詢字串>`，讀：星等、則數、地址（與資料庫比對，不同就記 conflicts）。
若評論區能看到跟兒童營／兒童班有關的評論，摘 1–3 條原文短句放 highlights（附 Maps URL）。不要自己歸納整體口碑。

| entity_id | 查詢字串 |
|---|---|
| learning-fresh | Learning Fresh Mont Kiara Plaza Arcoris Jalan Kiara |
| learning-fresh | Learning Fresh KLCC Megan Avenue 2 Jalan Yap Kwan Seng |
| learning-fresh | Learning Fresh Damansara Heights Jalan Medan Setia 2 |
| erican | Erican Language Centre Jalan Yap Kwan Seng Kuala Lumpur |
| ems | EMS English Made Simple Language Centre Megan Avenue II Kuala Lumpur |
| awesome-academy | Awesome Academy Kuala Lumpur English language centre |
| bright-language-center | Bright Language Center Megan Avenue Kuala Lumpur |
| ace-language-centre | ACE Language Centre Plaza Mont Kiara |
| direct-english-kl | Direct English Bangunan Ming Kuala Lumpur |
| stratford-ilc | Stratford International Language Centre G Tower Jalan Tun Razak |
| global-leaders-academy | Global Leaders Academy Plaza Mont Kiara |
| manchester-language-centre | Manchester Language Centre Menara 1 Mont Kiara |
| gec-kk | Global English Centre Plaza Kingfisher Kota Kinabalu |
| newtonshow | Newtonshow Bangsar Menara Mutiara Bangsar |
| newtonshow | Newtonshow Bukit Bintang Wisma Chuang |
| newtonshow | Newtonshow Penang I-Santorini Tanjung Tokong |
| newtonshow | Newtonshow Johor Bahru Grid Sunway Iskandar Puteri |
| kidocode | Kidocode Solaris Mont Kiara |
| camp-beaumont | Camp Beaumont Asia Alice Smith School Kuala Lumpur |
| arrowhead-skills | Arrowhead Skills Garden International School Kuala Lumpur |
| epsom-college-malaysia | Epsom College in Malaysia Bandar Enstek |
| laliga-academy-malaysia | LALIGA Academy Malaysia Epsom College Bandar Enstek |
| mouratoglou-academy-malaysia | Mouratoglou Academy Malaysia Bandar Enstek |
| bskl | British International School Kuala Lumpur Bandar Utama |
| iskl | International School of Kuala Lumpur Ampang Hilir |
| straits-penang | Straits International School Penang Bayan Lepas |
| tenby-penang | Tenby Schools Penang Tanjung Bungah |
| uplands-penang | Uplands International School of Penang Batu Feringgi |
| kis-sabah | Kinabalu International School Kota Kinabalu |
| edwethink | Edwethink Plaza Arkadia Desa ParkCity |
| julia-gabriel | Julia Gabriel Bangsar Kuala Lumpur |
| ignite-learning | Ignite Learning Menara 1 MK Mont Kiara |
| larasplace | Lara's Place Kuala Lumpur |
| mad-about-education | Mad About Education Kelana Business Centre Petaling Jaya |
| embassy-camps | Embassy Camps Kuala Lumpur Malaysia |
| kensington-camps | Kensington Camps & Clubs Malaysia |
| disted-penang | DISTED College Macalister Road Penang |

## B. 已知網址
1. UCSI International School Kuala Lumpur 官網的 holiday／summer camp 頁（WebFetch 403）：2026 暑假與 2026/27 冬季日期、年齡、價格
2. Athletes Peak Academy（APA）官網：Sri KDU Penang 英語營與 POWIIS Balik Pulau 住宿營，資料在海報圖片 → 用 computer zoom 讀圖上的日期、年齡、價格
3. https://booknow.campbeaumont.asia ：有無 2027 春假／暑假梯次（只讀，不加入購物車）
4. https://kensington-cc.com ：2026 暑假逐週梯次、校區、價格；2026/27 冬季或 2027 暑假是否公布

## C. Google 搜尋補洞（`https://www.google.com/search?q=...`）
每個查詢讀前 10 筆結果，點進官方頁確認。找到 2026 暑假（6–8 月）或 2026-01~02 的實際梯次就建 confirmed_other_year session；若該 program 沒有 2027 推估，另建 pattern_estimated。
1. 吉隆坡／雪蘭莪國際學校 2026 暑期營：Sri KDU、Garden International School、Taylor's International School（KL／Puchong）、HELP International School、Fairview KL、Kingsgate、ELC International、Cempaka、SJI International、Australian International School Malaysia、Mont'Kiara International School、Tenby Tropicana Aman（查詢例：`"Sri KDU" holiday camp 2026`）
2. 檳城：Dalat、Fairview Penang、Stonyhurst Penang 2026 暑期營；Newtonshow Penang 2026 summer
3. 新山：Newtonshow JB 2026 summer、其他新山兒童暑期營
4. 沙巴、砂拉越兒童假期營 2026
5. 台灣代理商：`馬來西亞 遊學 2026 暑假 兒童`、`吉隆坡 冬令營 2027`、`馬來西亞 親子遊學 2027 寒假`
6. 簡體：`马来西亚 冬令营 2027`、`吉隆坡 游学 寒假 2026`

回報：15 行內摘要（A 成功幾筆、B 每項結果、C 每項結果、哪些因 CAPTCHA 中止）。