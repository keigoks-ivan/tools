#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
history_build.py — 歷史板塊建置腳本（catalog 驅動，冪等可重跑）

★ repo 是唯一真實來源 ★
  /history/*.html 一旦存在，本腳本「永不覆蓋」——所有編輯都直接改 repo 裡的檔。
  Google Drive 的源檔（SRC_ROOT）只在「某篇第一次匯入 repo」時用一次，之後脫鉤。

執行時會：
  1. 掃 ENTRIES，凡 repo 尚未有的 slug，才從 Google Drive 複製進來（複製時注入返回列/TOC）
  2. repo 已存在的檔一律不動（保護手動擴充的內容，例如 philippines-epic）
  3. 依 ENTRIES 重建 /history/catalog.json（分類/座標等 metadata 仍集中管理）

== 日後加新檔（兩種情境）==
  A. 新的史詩 HTML：把檔放進 Google Drive → 在 ENTRIES 貼一筆（src/slug/zh/en/cat/lat/lng）
     → 跑本腳本，它只把「repo 還沒有的新篇」抓進來。之後要改就改 repo 裡的檔。
  B. 直接在 repo 新增/編輯：把 .html 放進 /history/ 並在 ENTRIES 補 metadata → 跑腳本只更新 catalog。

用法:  python3 scripts/history_build.py            # 匯入新篇 + 重建 catalog（不覆蓋既有檔）
       python3 scripts/history_build.py --check    # 只報告：已有/待匯入/來源缺，不寫檔
"""
import json, os, re, shutil, sys

# ---- 路徑 ----
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_DIR = os.path.join(REPO, "history")
SRC_ROOT = ("/Users/ivanchang/Library/CloudStorage/GoogleDrive-keigoks@gmail.com/"
            "我的雲端硬碟/001投資/產業claude分析/歷史")

# ---- 分類顯示順序與標籤 ----
CATS = [
    ("nation", "國家／區域史詩", "Nations & Regions"),
    ("city",   "城市史詩",        "Cities"),
    ("theme",  "主題史詩",        "Themes"),
    ("sport",  "運動史",          "Sports"),
]

# ============================================================
# CATALOG — 唯一真實來源。去重後保留版本。
#   src   : 相對 SRC_ROOT 的路徑（或絕對路徑）
#   slug  : 輸出檔名（英文，不含 .html）
#   zh/en : 卡片標題
#   cat   : nation | city | theme | sport
#   lat/lng: 地圖標點（nation/city 用；theme/sport 可留 None）
#   group : （選填）城市隸屬國家，用於列表分組
#   blurb : （選填）卡片副標
# ============================================================
ENTRIES = [
    # ---------- 國家／區域史詩 ----------
    dict(src="台灣歷史/台灣史詩_海上孤舟.html", slug="taiwan-epic", cat="nation",
         zh="海上孤舟：台灣四百年的身世", en="Taiwan: Four Centuries Adrift", lat=23.7, lng=121.0),
    dict(src="東北亞歷史/中國史詩_天下王朝與大一統.html", slug="china-epic", cat="nation",
         zh="天下、王朝循環，與大一統的千年回歸：中國", en="China: All-Under-Heaven, the Dynastic Cycle & the Return to Unity", lat=35.0, lng=104.0),
    dict(src="東北亞歷史/蒙古史詩_草原成吉思汗與最大的陸地帝國.html", slug="mongolia", cat="nation",
         zh="草原、成吉思汗，與史上最大的陸地帝國：蒙古", en="Mongolia: The Steppe, Genghis Khan & the Largest Land Empire", lat=46.9, lng=103.8),
    dict(src="澳洲史詩_最古老的土地最年輕的國家.html", slug="australia-epic", cat="nation",
         zh="最古老的土地，最年輕的國家：澳洲", en="Australia: Oldest Land, Youngest Nation", lat=-25.3, lng=133.8),
    dict(src="紐西蘭史詩_最後的島嶼與兩個民族的條約.html", slug="newzealand-epic", cat="nation",
         zh="最後的島嶼，與兩個民族的條約：紐西蘭", en="New Zealand: The Last Islands", lat=-41.3, lng=174.0),
    dict(src="日本史詩_菊與刀與永不止息的浪.html", slug="japan-epic", cat="nation",
         zh="菊與刀,與永不止息的浪：日本的千年身世", en="Japan: The Chrysanthemum and the Sword", lat=36.2, lng=138.3),
    dict(src="東北亞歷史/南韓史詩_半島的意志.html", slug="southkorea-epic", cat="nation",
         zh="半島的意志：南韓從廢墟到尖端", en="South Korea: The Will of the Peninsula", lat=36.5, lng=127.8),
    dict(src="東北亞歷史/北韓史詩_堡壘之國.html", slug="northkorea-epic", cat="nation",
         zh="堡壘之國：北韓的身世", en="North Korea: The Fortress State", lat=40.3, lng=127.5),
    dict(src="東北亞歷史/香港史詩_海港難民與兩制.html", slug="hongkong-epic", cat="city", group="中國 China",
         zh="海港、難民與兩制：香港的身世", en="Hong Kong: Harbour, Refugees & Two Systems", lat=22.32, lng=114.17),
    dict(src="東北亞歷史/澳門史詩_海岬教堂與賭城.html", slug="macau-epic", cat="nation",
         zh="海岬、教堂與賭城：澳門的身世", en="Macau: Cape, Church & Casino", lat=22.20, lng=113.54),
    dict(src="東南亞 南亞 歷史/印度史詩_季風文明與諸王之地.html", slug="india-epic", cat="nation",
         zh="季風、種姓與諸神：印度五千年", en="India: Monsoon Civilization", lat=22.0, lng=79.0),
    dict(src="東南亞 南亞 歷史/巴基斯坦史詩_河流信仰與山口.html", slug="pakistan-epic", cat="nation",
         zh="河流、信仰與山口：巴基斯坦", en="Pakistan: Rivers, Faith & Passes", lat=30.0, lng=70.0),
    dict(src="東南亞 南亞 歷史/孟加拉史詩_河口語言與洪水.html", slug="bangladesh-epic", cat="nation",
         zh="河口、語言與洪水：孟加拉", en="Bangladesh: Delta, Language & Floods", lat=23.7, lng=90.4),
    dict(src="東南亞 南亞 歷史/Nepal_尼泊爾史詩.html", slug="nepal-epic", cat="nation",
         zh="群峰、聖河與廓爾喀：尼泊爾", en="Nepal: Peaks, Rivers & Gurkhas", lat=28.4, lng=84.1),
    dict(src="東南亞 南亞 歷史/Bhutan_不丹史詩.html", slug="bhutan-epic", cat="nation",
         zh="雪峰、雷龍與宗堡：不丹", en="Bhutan: Snow Peaks & Dragon", lat=27.5, lng=90.4),
    dict(src="東南亞 南亞 歷史/新加坡史詩_小紅點從生存到第一世界.html", slug="singapore-epic", cat="nation",
         zh="小紅點：新加坡從生存到第一世界", en="Singapore: The Little Red Dot", lat=1.35, lng=103.82),
    dict(src="東南亞 南亞 歷史/馬來西亞/馬來西亞史詩_海峽錫礦與會館_擴充版.html", slug="malaysia-epic", cat="nation",
         zh="海峽、錫礦與會館：馬來西亞五百年", en="Malaysia: Straits, Tin & Clan Halls", lat=4.2, lng=102.0),
    dict(src="東南亞 南亞 歷史/印尼/印尼史詩_香料群島與殊途同歸_擴充版.html", slug="indonesia-epic", cat="nation",
         zh="香料、群島與殊途同歸：印尼兩千年", en="Indonesia: Spice Islands", lat=-2.5, lng=118.0),
    dict(src="東南亞 南亞 歷史/泰國/泰國史詩_佛塔王冠與永不淪陷_擴充版.html", slug="thailand-epic", cat="nation",
         zh="佛塔、王冠與永不淪陷：泰國七百年", en="Thailand: Never Colonized", lat=15.0, lng=101.0),
    dict(src="東南亞 南亞 歷史/越南史詩_竹與龍兩千年不屈之身.html", slug="vietnam-epic", cat="nation",
         zh="竹與龍：越南兩千年的不屈之身", en="Vietnam: Bamboo & Dragon", lat=16.0, lng=107.8),
    dict(src="東南亞 南亞 歷史/Cambodia_柬埔寨史詩.html", slug="cambodia-epic", cat="nation",
         zh="大湖、神廟與廢墟：柬埔寨", en="Cambodia: Lake, Temples & Ruins", lat=12.5, lng=104.9),
    dict(src="東南亞 南亞 歷史/寮國史詩_大河群山與佛塔.html", slug="laos-epic", cat="nation",
         zh="大河、群山與佛塔：寮國", en="Laos: River, Mountains & Stupas", lat=18.0, lng=103.0),
    dict(src="東南亞 南亞 歷史/緬甸史詩_大江金塔與高牆.html", slug="myanmar-epic", cat="nation",
         zh="大江、金塔與高牆：緬甸", en="Myanmar: River, Pagodas & Walls", lat=21.0, lng=96.0),
    dict(src="東南亞 南亞 歷史/汶萊史詩_石油蘇丹與天佑之邦.html", slug="brunei-epic", cat="nation",
         zh="石油、蘇丹與天佑之邦：汶萊", en="Brunei: Oil & the Sultan", lat=4.5, lng=114.7),
    dict(src="東南亞 南亞 歷史/菲律賓/菲律賓史詩_十字架群島與我們是誰.html", slug="philippines-epic", cat="nation",
         zh="十字架、群島與我們是誰：菲律賓", en="Philippines: Cross & Archipelago", lat=12.9, lng=122.0),

    # ---------- 歐洲史詩 ----------
    dict(src="歐洲歷史/葡萄牙史詩_大地盡頭大海起點.html", slug="portugal-epic", cat="nation",
         zh="大地盡頭，大海起點：葡萄牙的航海身世", en="Portugal: Where the Land Ends and the Sea Begins", lat=39.5, lng=-8.2),
    dict(src="歐洲歷史/英國史詩_島與帝國與不流血的演化.html", slug="uk-epic", cat="nation",
         zh="島、帝國，與不流血的演化：英國", en="Britain: The Island, the Empire & Bloodless Evolution", lat=54.0, lng=-2.5),
    dict(src="歐洲歷史/法國史詩_革命與國家與一個自以為普世的民族.html", slug="france-epic", cat="nation",
         zh="革命、國家，與一個自以為普世的民族：法蘭西", en="France: Revolution, the State & a Nation That Believes Itself Universal", lat=46.6, lng=2.4),
    dict(src="歐洲歷史/荷蘭史詩_海平面之下水合議與商人之國.html", slug="netherlands-epic", cat="nation",
         zh="海平面之下：水、合議，與一個商人打造的國家：荷蘭", en="Netherlands: Below Sea Level — Water, Consensus & a Nation Built by Merchants", lat=52.13, lng=5.29),
    dict(src="歐洲歷史/比利時史詩_不可能的王國戰場兩個民族與妥協.html", slug="belgium-epic", cat="nation",
         zh="不可能的王國：戰場、兩個民族，與一場永不結束的妥協：比利時", en="Belgium: The Improbable Kingdom — Battlefield, Two Peoples & an Endless Compromise", lat=50.64, lng=4.67),
    dict(src="歐洲歷史/愛爾蘭史詩_隔鄰與饑荒與一場驚人的翻轉.html", slug="ireland-epic", cat="nation",
         zh="隔鄰、饑荒，與一場驚人的翻轉：愛爾蘭", en="Ireland: The Neighbour, the Famine & an Astonishing Reversal", lat=53.4, lng=-8.0),
    dict(src="歐洲歷史/德國史詩_中央之地與遲到的國家與一場清算.html", slug="germany-epic", cat="nation",
         zh="中央之地、遲到的國家，與一場與深淵的清算：德意志", en="Germany: The Land in the Middle, the Belated Nation & a Reckoning with the Abyss", lat=51.2, lng=10.4),
    dict(src="歐洲歷史/西班牙史詩_帝國與多元與兩個西班牙.html", slug="spain-epic", cat="nation",
         zh="帝國、多元，與兩個西班牙：西班牙", en="Spain: Empire, Plurality & the Two Spains", lat=40.2, lng=-3.7),
    dict(src="歐洲歷史/瑞士史詩_山與意志與一個中立的例外.html", slug="switzerland-epic", cat="nation",
         zh="山、意志，與一個中立的例外：瑞士", en="Switzerland: Mountains, Will & a Neutral Exception", lat=46.8, lng=8.2),
    dict(src="歐洲歷史/義大利史詩_碎片光輝與一個比國家古老的民族.html", slug="italy-epic", cat="nation",
         zh="碎片、光輝，與一個比國家古老得多的民族：義大利", en="Italy: Fragments, Glory & a People Far Older than Their State", lat=42.8, lng=12.6),
    dict(src="歐洲歷史/奧地利史詩_帝國的回聲與德意志的問題與一座中立的橋.html", slug="austria-epic", cat="nation",
         zh="帝國的回聲、德意志的問題，與一座中立的橋：奧地利", en="Austria: The Echo of Empire, the German Question & a Neutral Bridge", lat=47.5, lng=14.5),
    dict(src="歐洲歷史/捷克史詩_歐洲的心臟與真理必勝與好兵帥克.html", slug="czech-epic", cat="nation",
         zh="歐洲的心臟、真理必勝，與好兵帥克：捷克", en="Czechia: The Heart of Europe, Truth Prevails & the Good Soldier Švejk", lat=49.8, lng=15.5),
    dict(src="歐洲歷史/希臘史詩_光海與永恆的重生.html", slug="greece-epic", cat="nation",
         zh="光、海，與永恆的重生：希臘", en="Greece: The Light, the Sea & the Eternal Resurrection", lat=37.98, lng=23.73),
    dict(src="歐洲歷史/丹麥史詩_海收縮與信任.html", slug="denmark-epic", cat="nation",
         zh="海、收縮，與信任：丹麥", en="Denmark: The Sea, the Shrinking & Trust", lat=55.68, lng=12.57),
    dict(src="歐洲歷史/挪威史詩_峽灣海與全民的石油.html", slug="norway-epic", cat="nation",
         zh="峽灣、海，與一筆全民共有的石油：挪威", en="Norway: The Fjord, the Sea & a Trillion-Dollar Trust", lat=61.0, lng=9.0),
    dict(src="歐洲歷史/瑞典史詩_帝國人民之家與兩百年中立.html", slug="sweden-epic", cat="nation",
         zh="帝國、人民之家，與兩百年中立：瑞典", en="Sweden: Empire, the People's Home & Two Centuries of Neutrality", lat=62.0, lng=15.0),
    dict(src="歐洲歷史/芬蘭史詩_兩個帝國之間語言西蘇與生存.html", slug="finland-epic", cat="nation",
         zh="兩個帝國之間，西蘇，與生存的藝術：芬蘭", en="Finland: Between Two Empires, Sisu & the Art of Survival", lat=64.0, lng=26.0),
    dict(src="歐洲歷史/匈牙利史詩_孤獨邊界與一道永不癒合的傷口.html", slug="hungary-epic", cat="nation",
         zh="孤獨、邊界，與一道永不癒合的傷口：匈牙利", en="Hungary: Alone, the Frontier & an Unhealing Wound", lat=47.50, lng=19.04),
    dict(src="歐洲歷史/波蘭史詩_消失與復活與夾在兩個巨人之間.html", slug="poland-epic", cat="nation",
         zh="消失、復活，與夾在兩個巨人之間：波蘭", en="Poland: Disappearance, Resurrection & a Nation Between Two Giants", lat=52.0, lng=19.5),
    dict(src="歐洲歷史/馬爾他史詩_磐石十字路口與出租的島.html", slug="malta-epic", cat="nation",
         zh="磐石、十字路口，與一座出租自己的島：馬爾他", en="Malta: The Rock, the Crossroads & an Island That Rents Itself Out", lat=35.9, lng=14.4),
    dict(src="歐亞歷史/土耳其史詩_海峽帝國的幽靈與國父的工程.html", slug="turkey-epic", cat="nation",
         zh="海峽、帝國的幽靈，與國父的工程：土耳其", en="Türkiye: The Strait, the Ghost of Empire & the Father's Project", lat=39.0, lng=35.2),
    dict(src="非洲歷史/埃及史詩_尼羅河永恆與被征服的兩千年.html", slug="egypt-epic", cat="nation",
         zh="尼羅河、永恆，與被征服的兩千年：埃及", en="Egypt: The Nile, Eternity & a Civilization Ruled by Others", lat=26.8, lng=30.8),
    dict(src="非洲歷史/摩洛哥史詩_柏柏爾馬格里布與從未被完全征服的西大門.html", slug="morocco", cat="nation",
         zh="柏柏爾、馬格里布，與從未被完全征服的西大門：摩洛哥", en="Morocco: The Berbers, the Maghreb & the Gate of the Far West", lat=31.8, lng=-7.1),
    dict(src="非洲歷史/衣索比亞史詩_高原所羅門與多民族帝國.html", slug="ethiopia-epic", cat="nation",
         zh="高原、所羅門的血脈，與一個多民族帝國：衣索比亞", en="Ethiopia: The Highlands, the Line of Solomon & an Empire of Nations", lat=9.1, lng=40.5),
    dict(src="非洲歷史/奈及利亞史詩_三百個民族黑金與比國家更強大的人民.html", slug="nigeria-epic", cat="nation",
         zh="三百個民族、黑金的詛咒，與一個比國家更強大的民族：奈及利亞", en="Nigeria: The Giant — 300 Nations, the Oil Curse & a People Larger Than Their State", lat=9.0, lng=8.7),
    dict(src="非洲歷史/南非史詩_黃金鑽石種族高牆與兩道牆.html", slug="southafrica-epic", cat="nation",
         zh="黃金與鑽石、種族的高牆，與一道拆得掉與一道拆不掉的牆：南非", en="South Africa: Gold, Diamonds, the Wall of Race & the Two Walls", lat=-29.0, lng=24.5),
    dict(src="歐亞歷史/伊朗史詩_波斯什葉與強權的棋盤.html", slug="iran-epic", cat="nation",
         zh="波斯、什葉，與強權棋盤上的古老文明：伊朗", en="Iran: Persia, Shiism & a Civilization on the Chessboard", lat=32.4, lng=53.7),
    dict(src="歐亞歷史/伊拉克史詩_兩河文明的搖籃與巴格達的黃金與灰燼.html", slug="iraq", cat="nation",
         zh="兩河、文明的搖籃，與巴格達的黃金與灰燼：伊拉克", en="Iraq: Two Rivers, the Cradle of Civilization & the Gold and Ash of Baghdad", lat=33.2, lng=43.7),
    dict(src="非洲歷史/沙烏地阿拉伯史詩_沙漠聖地與劍與經.html", slug="saudi-epic", cat="nation",
         zh="沙漠、聖地，與劍與經的契約：沙烏地阿拉伯", en="Saudi Arabia: Desert, the Holy Cities & the Pact of Sword and Book", lat=24.0, lng=45.0),
    dict(src="歐亞歷史/以色列史詩_應許之地避難所與兩個民族.html", slug="israel-epic", cat="nation",
         zh="應許之地、避難所，與兩個民族的一塊土地：以色列", en="Israel: The Promised Land, the Refuge & One Land for Two Peoples", lat=31.4, lng=35.0),
    dict(src="歐亞歷史/俄羅斯史詩_平原與垂直線與第三羅馬.html", slug="russia-epic", cat="nation",
         zh="無垠的平原、權力的垂直線，與第三羅馬：俄羅斯", en="Russia: The Boundless Plain, the Vertical of Power & the Third Rome", lat=61.5, lng=105.3),
    dict(src="歐亞歷史/烏克蘭史詩_邊地哥薩克的自由與被打出來的民族.html", slug="ukraine-epic", cat="nation",
         zh="邊地、哥薩克的自由，與一個被打出來的民族：烏克蘭", en="Ukraine: The Borderland, the Cossack's Freedom & a Nation Forged in Fire", lat=49.0, lng=31.5),

    # ---------- 中東／黎凡特史詩 ----------
    dict(src="中東歷史/敘利亞史詩_十字路口鑲嵌畫與吞噬自身的戰爭.html", slug="syria-epic", cat="nation",
         zh="文明的十字路口、碎裂的鑲嵌畫，與一場吞噬自身的戰爭：敘利亞", en="Syria: The Crossroads, the Shattered Mosaic & a War That Devoured Itself", lat=35.0, lng=38.5),
    dict(src="中東歷史/黎巴嫩史詩_山海港與十八個教派.html", slug="lebanon-epic", cat="nation",
         zh="山、海港，與十八個教派的脆弱平衡：黎巴嫩", en="Lebanon: The Mountain, the Port & the Fragile Balance of Eighteen Sects", lat=33.9, lng=35.9),
    dict(src="中東歷史/葉門史詩_幸福的阿拉伯咖啡與被遺忘的戰爭.html", slug="yemen-epic", cat="nation",
         zh="幸福的阿拉伯、咖啡的故鄉，與一場被遺忘的戰爭：葉門", en="Yemen: Arabia Felix, the Birthplace of Coffee & a Forgotten War", lat=15.5, lng=47.6),
    dict(src="中東歷史/約旦史詩_沙漠綠洲難民方舟與被維繫的王國.html", slug="jordan-epic", cat="nation",
         zh="沙漠中的綠洲、難民的方舟，與一個被精心維繫的王國：約旦", en="Jordan: The Desert Oasis, the Ark of Refugees & a Kingdom Carefully Kept", lat=31.2, lng=36.5),

    # ---------- 美洲史詩 ----------
    dict(src="美洲歷史/美國史詩_自由與枷鎖與永不止息的邊疆.html", slug="usa-epic", cat="nation",
         zh="自由與枷鎖，與永不止息的邊疆：美利堅", en="America: Liberty, Bondage & the Frontier", lat=39.5, lng=-98.35),
    dict(src="美洲歷史/加拿大史詩_兩個孤獨與一個縫起來的國家.html", slug="canada-epic", cat="nation",
         zh="兩個孤獨，與一個縫起來的國家：加拿大", en="Canada: Two Solitudes, Stitched Together", lat=56.1, lng=-106.3),
    dict(src="美洲歷史/阿根廷史詩_豐饒與衰落與永遠不來的未來.html", slug="argentina-epic", cat="nation",
         zh="豐饒與衰落，與永遠不來的未來：阿根廷", en="Argentina: Abundance, Decline & the Future That Never Comes", lat=-38.4, lng=-63.6),
    dict(src="美洲歷史/墨西哥史詩_血與玉米與一座建在神廟上的城.html", slug="mexico-epic", cat="nation",
         zh="血與玉米，與一座建在神廟上的城：墨西哥", en="Mexico: Blood, Corn & a City on a Temple", lat=23.6, lng=-102.5),
    dict(src="美洲歷史/巴西史詩_未來之國混血的大陸與縫隙裡的即興.html", slug="brazil-epic", cat="nation",
         zh="未來之國、混血的大陸，與縫隙裡的即興：巴西", en="Brazil: The Country of the Future, the Mixed Continent & the Jeitinho", lat=-14.2, lng=-51.9),
    dict(src="美洲歷史/秘魯史詩_安地斯印加與波托西的銀山.html", slug="peru", cat="nation",
         zh="安地斯、印加，與波托西吃人的銀山：秘魯", en="Peru: The Andes, the Inca & the Silver of Potosí", lat=-9.2, lng=-75.0),
    dict(src="美洲歷史/古巴史詩_糖奴隸革命與九十英里外的帝國.html", slug="cuba", cat="nation",
         zh="糖、奴隸、革命，與九十英里外的帝國：古巴", en="Cuba: Sugar, Slavery, Revolution & the Empire Ninety Miles Away", lat=21.5, lng=-79.5),

    # ---------- 城市史詩 ----------
    dict(src="台灣歷史/台北_盆地之城.html", slug="taipei", cat="city", group="台灣 Taiwan",
         zh="盆地之城：台北的身世", en="Taipei: City in a Basin", lat=25.03, lng=121.57),
    dict(src="台灣歷史/台中_大墩在中間崛起.html", slug="taichung", cat="city", group="台灣 Taiwan",
         zh="大墩：在中間崛起的城", en="Taichung: Rising in the Middle", lat=24.15, lng=120.67),
    dict(src="台灣歷史/台南_台灣的起點.html", slug="tainan", cat="city", group="台灣 Taiwan",
         zh="府城：台灣的起點", en="Tainan: Where Taiwan Began", lat=22.99, lng=120.21),
    dict(src="台灣歷史/高雄_潟湖之港.html", slug="kaohsiung", cat="city", group="台灣 Taiwan",
         zh="潟湖之港：高雄的身世", en="Kaohsiung: Port of the Lagoon", lat=22.63, lng=120.30),
    dict(src="台灣歷史/基隆_雨港被掩蓋的門戶.html", slug="keelung", cat="city", group="台灣 Taiwan",
         zh="雨港：被光芒掩蓋的門戶", en="Keelung: The Rainy Gateway", lat=25.13, lng=121.74),
    dict(src="東北亞歷史/Tokyo_city_of_fire.html", slug="tokyo", cat="city", group="日本 Japan",
         zh="火與灰燼之城：東京四百年", en="Tokyo: City of Fire", lat=35.68, lng=139.69),
    dict(src="東北亞歷史/Osaka_kitchen_of_the_nation.html", slug="osaka", cat="city", group="日本 Japan",
         zh="天下的廚房：大阪四百年", en="Osaka: Kitchen of the Nation", lat=34.69, lng=135.50),
    dict(src="東北亞歷史/Kobe_city_facing_the_sea.html", slug="kobe", cat="city", group="日本 Japan",
         zh="面向大海的城：神戶", en="Kobe: City Facing the Sea", lat=34.69, lng=135.20),
    dict(src="東北亞歷史/Fukuoka_against_the_wind.html", slug="fukuoka", cat="city", group="日本 Japan",
         zh="逆風的城：福岡", en="Fukuoka: Against the Wind", lat=33.59, lng=130.40),
    dict(src="東北亞歷史/Macau_four_centuries.html", slug="macau-city", cat="city", group="中國 China",
         zh="大海在此結束：澳門四百年", en="Macau: Four Centuries", lat=22.16, lng=113.55),
    dict(src="東南亞 南亞 歷史/河內_千年不曾移動的龍城.html", slug="hanoi", cat="city", group="越南 Vietnam",
         zh="千年不曾移動的龍城：河內", en="Hanoi: The Unmoved Dragon City", lat=21.03, lng=105.85),
    dict(src="東南亞 南亞 歷史/胡志明市_輸掉戰爭丟掉名字卻拼命向前的城.html", slug="hochiminh", cat="city", group="越南 Vietnam",
         zh="輸掉戰爭卻拼命向前的城：胡志明市", en="Ho Chi Minh City: Reborn After Loss", lat=10.82, lng=106.63),
    dict(src="東南亞 南亞 歷史/金邊_被清空又被重新住滿的城.html", slug="phnompenh", cat="city", group="柬埔寨 Cambodia",
         zh="被清空又被重新住滿的城：金邊", en="Phnom Penh: Emptied and Refilled", lat=11.56, lng=104.92),
    dict(src="東南亞 南亞 歷史/泰國/曼谷_從未被殖民的天使之城.html", slug="bangkok", cat="city", group="泰國 Thailand",
         zh="從未被殖民的天使之城：曼谷", en="Bangkok: The Uncolonized City of Angels", lat=13.76, lng=100.50),
    dict(src="東南亞 南亞 歷史/泰國/清邁_不爭第一的蘭納古都.html", slug="chiangmai", cat="city", group="泰國 Thailand",
         zh="不爭第一的蘭納古都：清邁", en="Chiang Mai: The Lanna Capital", lat=18.79, lng=98.98),
    dict(src="東南亞 南亞 歷史/印尼/雅加達_重到正在沉沒的巨城.html", slug="jakarta", cat="city", group="印尼 Indonesia",
         zh="重到正在沉沒的巨城：雅加達", en="Jakarta: The Sinking Megacity", lat=-6.21, lng=106.85),
    dict(src="東南亞 南亞 歷史/菲律賓/馬尼拉_被三個帝國層層覆寫的城.html", slug="manila", cat="city", group="菲律賓 Philippines",
         zh="被三個帝國層層覆寫的城：馬尼拉", en="Manila: Overwritten by Three Empires", lat=14.60, lng=120.98),
    dict(src="東南亞 南亞 歷史/馬來西亞/吉隆坡_泥濘河口的錫礦王國.html", slug="kualalumpur", cat="city", group="馬來西亞 Malaysia",
         zh="泥濘河口的錫礦王國：吉隆坡", en="Kuala Lumpur: The Tin Kingdom", lat=3.14, lng=101.69),
    dict(src="東南亞 南亞 歷史/馬來西亞/檳城_用免稅憑空造出的城.html", slug="penang", cat="city", group="馬來西亞 Malaysia",
         zh="用免稅憑空造出的城：檳城", en="Penang: Conjured by Free Trade", lat=5.41, lng=100.33),
    dict(src="東南亞 南亞 歷史/馬來西亞/怡保_錫造出的百萬富翁之城.html", slug="ipoh", cat="city", group="馬來西亞 Malaysia",
         zh="錫造出的百萬富翁之城：怡保", en="Ipoh: City of Tin Millionaires", lat=4.60, lng=101.07),
    dict(src="東南亞 南亞 歷史/馬來西亞/新山_活在巨人陰影下的邊境之城.html", slug="johorbahru", cat="city", group="馬來西亞 Malaysia",
         zh="活在巨人陰影下的邊境之城：新山", en="Johor Bahru: In the Giant's Shadow", lat=1.49, lng=103.74),
    dict(src="東南亞 南亞 歷史/馬來西亞/馬六甲_扼住海峽咽喉的天賦之城.html", slug="malacca", cat="city", group="馬來西亞 Malaysia",
         zh="扼住海峽咽喉的天賦之城：馬六甲", en="Malacca: Throat of the Straits", lat=2.20, lng=102.25),
    dict(src="東南亞 南亞 歷史/馬來西亞/芙蓉太平金寶_三座承載史詩的小城.html", slug="seremban-taiping-kampar", cat="city", group="馬來西亞 Malaysia",
         zh="三座承載史詩的小城：芙蓉·太平·金寶", en="Seremban · Taiping · Kampar", lat=4.85, lng=101.40),
    dict(src="東南亞 南亞 歷史/馬來西亞/哥打巴魯瓜拉丁加奴關丹_守著一個民族之根的東海岸三城.html", slug="east-coast-trio", cat="city", group="馬來西亞 Malaysia",
         zh="東海岸三城：哥打巴魯·瓜拉丁加奴·關丹", en="East Coast Trio", lat=5.0, lng=103.2),
    dict(src="紐西蘭/奧克蘭_地峽與火山之城.html", slug="auckland", cat="city", group="紐西蘭 New Zealand",
         zh="地峽、火山與帆之城：奧克蘭的身世", en="Auckland: The Isthmus Desired by Many", lat=-36.85, lng=174.76),
    dict(src="澳洲/雪梨_流放地與港灣之城.html", slug="sydney", cat="city", group="澳洲 Australia",
         zh="流放地、港灣與房價：雪梨的兩百年身世", en="Sydney: From the Fatal Shore to the Harbour Empire", lat=-33.87, lng=151.21),
    dict(src="澳洲/布里斯本_棕蛇之河流放與奧運.html", slug="brisbane", cat="city", group="澳洲 Australia",
         zh="棕蛇之河、流放與奧運：布里斯本的身世", en="Brisbane: The Penal River That Became an Olympic City", lat=-27.47, lng=153.02),

    # ---------- 歐洲城市 ----------
    dict(src="歐洲歷史/紐卡索_運煤到紐卡索.html", slug="newcastle", cat="city", group="英國 United Kingdom",
         zh="運煤到紐卡索：煤、船與泰恩河的傲骨", en="Newcastle upon Tyne: Coal, Ships & Geordie Pride", lat=54.98, lng=-1.61),

    # ---------- 美國城市 ----------
    dict(src="美國/紐約_港口金錢與屬於全世界的城.html", slug="newyork", cat="city", group="美國 United States",
         zh="如果你能在這裡成功：紐約的身世", en="New York: From New Amsterdam to the Capital of the World", lat=40.71, lng=-74.01),
    dict(src="美國/波士頓_山巔之城靠頭腦重生.html", slug="boston", cat="city", group="美國 United States",
         zh="山巔之城：波士頓靠頭腦重生的身世", en="Boston: A City upon a Hill — From the Puritan Errand to the Capital of the Mind", lat=42.36, lng=-71.06),
    dict(src="美國/費城_發明美國卻被超越.html", slug="philadelphia", cat="city", group="美國 United States",
         zh="第一個首都：費城發明美國卻被超越的身世", en="Philadelphia: The City That Invented America and Was Overtaken by It", lat=39.95, lng=-75.16),
    dict(src="美國/舊金山_瞬間之城淘金潮.html", slug="sanfrancisco", cat="city", group="美國 United States",
         zh="瞬間之城：舊金山從黃金到程式碼的身世", en="San Francisco: The Instant City on a Fault Line — From Gold to Code", lat=37.77, lng=-122.42),

    # ---------- 美國城市 ----------
    dict(src="美國/西雅圖_雨木與重新發明.html", slug="seattle", cat="city", group="美國 United States",
         zh="雨、木，與一座不斷重新發明自己的城：西雅圖", en="Seattle: Rain, Timber & the City That Keeps Reinventing Itself", lat=47.61, lng=-122.33),
    dict(src="美國/洛杉磯_水夢與無中生有.html", slug="los-angeles", cat="city", group="美國 United States",
         zh="水、夢，與一座無中生有的沙漠巨城：洛杉磯", en="Los Angeles: Water, Dreams & a Metropolis Conjured from a Desert", lat=34.05, lng=-118.24),
    dict(src="美國/聖地牙哥_海灣邊界與軍港.html", slug="san-diego", cat="city", group="美國 United States",
         zh="海灣、邊界，與一座面朝太平洋的軍港：聖地牙哥", en="San Diego: The Bay, the Border & the City Facing the Pacific", lat=32.72, lng=-117.16),

    # ---------- 主題史詩 ----------
    dict(src="大航海時代/final 1大航海時代_史詩敘事_深度長文版.html", slug="age-of-sail", cat="theme",
         zh="海權、契約與資本：六百年特許公司興衰", en="The Age of Sail", lat=None, lng=None),
    dict(src="大航海時代/殖民勢力交替_動畫地圖_真實底圖版.html", slug="colonial-map", cat="theme",
         zh="殖民勢力交替動畫地圖 · 1500–1900", en="Colonial Powers: Animated Map", lat=None, lng=None),
    dict(src="經濟史/skyscraper-curse-v2.html", slug="skyscraper-curse", cat="theme",
         zh="摩天大樓詛咒：最高樓與經濟轉折", en="The Skyscraper Curse", lat=None, lng=None),
    dict(src="經濟史/工業革命與AI時代的回聲.html", slug="industrial-revolution", cat="theme",
         zh="從蒸汽到演算法：工業革命與 AI 時代的回聲", en="From Steam to Algorithm: The Industrial Revolution & the Age of AI", lat=None, lng=None),
    dict(src="世界史/帝國主義與非洲的兩百年.html", slug="africa-imperialism", cat="theme",
         zh="瓜分、枷鎖與未竟的獨立：帝國主義與非洲的兩百年", en="Imperialism in Africa: From the Scramble to the New Scramble", lat=None, lng=None),
    dict(src="世界史/伊斯蘭世界_啟示商道與烏瑪.html", slug="islamic-world", cat="theme",
         zh="從麥加出發：啟示、商道與烏瑪的一千四百年", en="Out of Mecca: Revelation, Commerce & the Umma — 1,400 Years of Islam", lat=None, lng=None),
    dict(src="世界史/基督教文明_十字架與兩把劍.html", slug="christian-world", cat="theme",
         zh="十字架與兩把劍：信仰、權力，與分裂的兩千年", en="The Cross & the Two Swords: Faith, Power & Schism — Two Thousand Years of Christendom", lat=None, lng=None),
    dict(src="世界史/猶太文明_書盟約與離散.html", slug="jewish-world", cat="theme",
         zh="書、盟約與離散：猶太人的四千年", en="The Book, the Covenant & the Diaspora — Four Thousand Years of the Jews", lat=None, lng=None),
    dict(src="世界史/佛教世界_佛僧伽與空.html", slug="buddhist-world", cat="theme",
         zh="佛、僧伽與空：佛教的兩千五百年", en="The Buddha, the Sangha & Emptiness — 2,500 Years of Buddhism", lat=None, lng=None),
    dict(src="世界史/印度教文明_法輪迴與萬神歸一.html", slug="hindu-world", cat="theme",
         zh="法、輪迴，與萬神歸一：印度教文明的身世", en="The Hindu World: Dharma, the Wheel & the One in the Many", lat=None, lng=None),
    dict(src="經濟史/股市史詩_貪婪與恐懼.html", slug="stock-market", cat="theme",
         zh="貪婪與恐懼：泡沫、崩盤，與股市四百年的人心", en="Greed & Fear: Four Centuries of the Market", lat=None, lng=None),
    dict(src="經濟史/信任_貨幣三千年.html", slug="money-trust", cat="theme",
         zh="信任：貨幣三千年的興衰與背叛", en="Trust: Money's 3,000 Years", lat=None, lng=None),
    dict(src="經濟史/莊家通吃_賭博與賭性.html", slug="gambling", cat="theme",
         zh="莊家通吃：賭博、機率，與人類的賭性", en="The House Always Wins: Gambling & the Itch", lat=None, lng=None),
    dict(src="經濟史/打敗市場的人.html", slug="the-investors", cat="theme",
         zh="打敗市場的人：投資史上的天才、信徒，與騙子", en="The Investors: Geniuses, Believers & Frauds", lat=None, lng=None),
    dict(src="經濟史/時間的價格_利率與債券三千年.html", slug="bond-market", cat="theme",
         zh="時間的價格：利率與債券的三千年", en="The Price of Time: 3,000 Years of Interest & Bonds", lat=None, lng=None),
    dict(src="經濟史/提神的帝國_咖啡茶與糖.html", slug="stimulants", cat="theme",
         zh="提神的帝國：咖啡、茶與糖如何叫醒了世界", en="The Empire of Stimulation: How Coffee, Tea & Sugar Woke the World", lat=None, lng=None),
    dict(src="世界史/絲綢之路_黃沙駝鈴與文明.html", slug="silk-road", cat="theme",
         zh="絲綢之路：黃沙、駝鈴，與運送文明的兩千年", en="The Silk Road: Sand, Caravans & Two Millennia of Connection", lat=None, lng=None),
    dict(src="世界史/文藝復興_重生人與一枚金幣.html", slug="renaissance", cat="theme",
         zh="重生、人，與一枚金幣：文藝復興與現代的誕生", en="The Renaissance: Rebirth, Man & the Florin", lat=None, lng=None),
    dict(src="世界史/理性時代_觀測理性與敢於求知.html", slug="age-of-reason", cat="theme",
         zh="觀測、理性，與一句「敢於求知」：科學革命與啟蒙", en="The Age of Reason: Observation, Reason & 'Dare to Know'", lat=None, lng=None),
    dict(src="世界史/浪漫主義_心民族與歷史的根.html", slug="romanticism", cat="theme",
         zh="心、民族，與歷史的根：浪漫主義與民族主義", en="Romanticism & Nationalism: The Heart, the Volk & the Roots of History", lat=None, lng=None),
    dict(src="經濟史/看不見的手_經濟思想四百年.html", slug="the-economists", cat="theme",
         zh="看不見的手：經濟思想四百年，與那場永不落幕的辯論", en="The Invisible Hand: Four Centuries of Economic Thought", lat=None, lng=None),
    dict(src="經濟史/立足之地_土地與房地產文明史.html", slug="land-property", cat="theme",
         zh="立足之地：土地、租金，與一部關於屋簷的文明史", en="Standing Ground: A History of Land, Rent & the Roof Over Our Heads", lat=None, lng=None),
    dict(src="經濟史/銀行三千年_錢莊擠兌與大到不能倒.html", slug="banking", cat="theme",
         zh="錢莊、擠兌，與大到不能倒：銀行三千年", en="Banks: 3,000 Years of Trust, Runs & Too-Big-to-Fail", lat=None, lng=None),
    dict(src="經濟史/七肥年與七瘦年_景氣循環五座鐘.html", slug="business-cycle", cat="theme",
         zh="七肥年與七瘦年：景氣循環，與五座永不停歇的鐘", en="Seven Fat Years, Seven Lean: The Business Cycle & the Five Clocks", lat=None, lng=None),
    dict(src="經濟史/中間人_離散貿易少數民族.html", slug="middleman-minorities", cat="theme",
         zh="中間人：被關上的門、織起的網，與成功的詛咒", en="The Middleman: The Shut Door, the Woven Web & the Curse of Success", lat=None, lng=None),
    dict(src="經濟史/黑金_石油能量權力與帳單.html", slug="oil-epic", cat="theme",
         zh="黑金：石油，與一部關於能量、權力，與帳單的文明史", en="Black Gold: Oil, and a History of Energy, Power & the Bill Coming Due", lat=None, lng=None),
    dict(src="經濟史/沙摩爾定律與矽片上的世界戰爭.html", slug="semiconductor-epic", cat="theme",
         zh="沙、摩爾定律，與一塊矽片上的世界戰爭", en="Of Sand & Moore's Law: The World War Fought on a Sliver of Silicon", lat=None, lng=None),
    dict(src="經濟史/戰爭的生意_軍火傭兵與國防工業.html", slug="war-business", cat="theme",
         zh="軍火、傭兵，與把恐懼變成利潤的人：戰爭的生意三千年", en="The Business of War: Arms, Mercenaries & the Trade in Fear", lat=None, lng=None),
    dict(src="經濟史/保險_把不確定變成生意三千年.html", slug="insurance", cat="theme",
         zh="把不確定變成生意：保險，與一份關於明天的承諾三千年", en="Insurance: 3,000 Years of Turning Uncertainty into Business", lat=None, lng=None),
    dict(src="經濟史/稅_國家如何伸手進你的口袋.html", slug="taxation", cat="theme",
         zh="國家如何伸手進你的口袋：稅，與一部討價還價的文明史", en="Taxation: How the State Reaches Into Your Pocket", lat=None, lng=None),

    # ---------- 運動史 ----------
    dict(src="運動歷史/足球史_史詩敘事_深度長文版.html", slug="football-history", cat="sport",
         zh="草根、國旗與資本：足球一百六十年", en="Football: 160 Years", lat=None, lng=None),
    dict(src="運動歷史/籃球史_史詩敘事_深度長文版.html", slug="basketball-history", cat="sport",
         zh="桃籃、街頭與資本：籃球一百三十年", en="Basketball: 130 Years", lat=None, lng=None),
    dict(src="運動歷史/棒球史_白球與三魂_深度長文版.html", slug="baseball-history", cat="sport",
         zh="白球與三魂：棒球一百八十年", en="Baseball: 180 Years", lat=None, lng=None),
    dict(src="運動歷史/網球史_紳士的戰爭_深度長文版.html", slug="tennis-history", cat="sport",
         zh="紳士的戰爭：網球一百五十年", en="Tennis: 150 Years", lat=None, lng=None),
    dict(src="運動歷史/美式足球史_星期天的神殿_深度長文版.html", slug="americanfootball-history", cat="sport",
         zh="星期天的神殿：美式足球", en="American Football: Sunday's Temple", lat=None, lng=None),
    dict(src="運動歷史/橄欖球史_泥土裡的紳士_深度長文版.html", slug="rugby-history", cat="sport",
         zh="泥土裡的紳士：橄欖球", en="Rugby: Gentlemen in the Mud", lat=None, lng=None),
    dict(src="運動歷史/排球史_網的兩端零接觸_深度長文版.html", slug="volleyball-history", cat="sport",
         zh="網的兩端，零接觸：排球", en="Volleyball: No Contact", lat=None, lng=None),
    dict(src="運動歷史/小球與大國 桌球一百二十年.html", slug="tabletennis-history", cat="sport",
         zh="小球與大國：桌球一百二十年", en="Table Tennis: Small Ball, Big Power", lat=None, lng=None),
]

# ============================================================
# 注入片段
# ============================================================
BACKBAR_MARK = "imq-history-backbar"
BACKBAR_HTML = """<!-- {mark} -->
<div id="{mark}" style="position:sticky;top:0;z-index:9999;background:#16140f;border-bottom:1px solid #a8842f;
  font-family:system-ui,-apple-system,'Noto Serif TC',serif;display:flex;align-items:center;gap:16px;
  padding:8px 18px;font-size:13px;letter-spacing:.02em">
  <a href="/history/" style="color:#cda551;text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:6px">
    <span style="font-size:15px">←</span><span data-imq-zh>返回歷史總覽</span><span data-imq-en style="display:none">All Histories</span></a>
  <span style="color:#665a45">·</span>
  <a href="/home.html" style="color:#9a8f78;text-decoration:none">Property Monitor</a>
  <button onclick="(function(){{var z=document.documentElement.getAttribute('data-imq-lang')!=='en';document.documentElement.setAttribute('data-imq-lang',z?'en':'zh');document.querySelectorAll('[data-imq-zh]').forEach(function(e){{e.style.display=z?'none':'';}});document.querySelectorAll('[data-imq-en]').forEach(function(e){{e.style.display=z?'':'none';}});}})()"
    style="margin-left:auto;background:transparent;border:1px solid #665a45;color:#cda551;border-radius:4px;
    padding:3px 10px;font-size:11px;cursor:pointer;font-family:inherit">EN / 中</button>
</div>
"""

TOC_MARK = "imq-auto-toc"
TOC_SNIPPET = """<!-- {mark} -->
<style id="{mark}-style">
#{mark}{{position:fixed;top:46px;left:0;z-index:9000;max-height:calc(100vh - 60px);width:300px;
  overflow-y:auto;background:rgba(243,238,226,.97);border-right:1px solid #c6b58e;
  font-family:'Noto Serif TC',serif;padding:18px 16px 40px;transform:translateX(-300px);
  transition:transform .25s ease;box-shadow:2px 0 18px rgba(22,20,15,.12)}}
#{mark}.open{{transform:translateX(0)}}
#{mark} .imq-toc-h{{font-size:11px;letter-spacing:.18em;color:#8a3a23;font-weight:700;margin-bottom:12px;text-transform:uppercase}}
#{mark} a{{display:block;color:#16140f;text-decoration:none;font-size:13px;line-height:1.45;padding:5px 8px;
  border-left:2px solid transparent;border-radius:3px}}
#{mark} a:hover{{background:rgba(168,132,47,.12);border-left-color:#a8842f}}
#{mark} a.on{{border-left-color:#8a3a23;background:rgba(168,132,47,.16);font-weight:600}}
#{mark}-toggle{{position:fixed;top:54px;left:12px;z-index:9001;background:#16140f;color:#cda551;
  border:1px solid #a8842f;border-radius:6px;width:38px;height:38px;cursor:pointer;font-size:16px;
  display:flex;align-items:center;justify-content:center}}
@media(max-width:820px){{#{mark}{{width:80vw;transform:translateX(-82vw)}}}}
</style>
<nav id="{mark}" aria-label="Contents"><div class="imq-toc-h">目錄 · Contents</div></nav>
<button id="{mark}-toggle" title="目錄 Contents" aria-label="Contents">☰</button>
<script>(function(){{
function init(){{
  var nav=document.getElementById('{mark}'),btn=document.getElementById('{mark}-toggle');
  var heads=[].slice.call(document.querySelectorAll('h2.act-title, h2.ptitle'));
  if(heads.length<3){{btn.style.display='none';return;}}
  var links=[];
  heads.forEach(function(h,i){{
    var sec=h.closest('section')||h;
    if(!sec.id) sec.id='imqsec-'+i;
    var t=(h.textContent||'').trim().replace(/\\s+/g,' ');
    var a=document.createElement('a');a.href='#'+sec.id;a.textContent=t;
    if(h.classList.contains('ptitle')){{a.style.fontWeight='700';a.style.color='#8a3a23';a.style.marginTop='8px';}}
    a.addEventListener('click',function(){{if(window.innerWidth<=820)nav.classList.remove('open');}});
    nav.appendChild(a);links.push({{a:a,sec:sec}});
  }});
  btn.addEventListener('click',function(){{nav.classList.toggle('open');}});
  if(window.innerWidth>1100)nav.classList.add('open');
  var ticking=false;
  function mark(){{ticking=false;var y=window.scrollY+120,cur=null;
    links.forEach(function(l){{if(l.sec.offsetTop<=y)cur=l;}});
    links.forEach(function(l){{l.a.classList.toggle('on',l===cur);}});}}
  window.addEventListener('scroll',function(){{if(!ticking){{requestAnimationFrame(mark);ticking=true;}}}});
  mark();
}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
}})();</script>
"""

def src_path(e):
    s = e["src"]
    return s if os.path.isabs(s) else os.path.join(SRC_ROOT, s)

def has_native_toc(html):
    return bool(re.search(r'class="[^"]*\btoc\b|id="toc"', html))

def inject_after_body(html, snippet):
    m = re.search(r'<body[^>]*>', html, re.IGNORECASE)
    if not m:
        return snippet + html
    i = m.end()
    return html[:i] + "\n" + snippet + html[i:]

def build():
    os.makedirs(HISTORY_DIR, exist_ok=True)

    # 先盤點：哪些 entry 在 repo 已有、哪些是新的（需從 Drive 匯入）
    need_import = []   # repo 還沒有，要從 Drive 抓
    src_missing = []   # 要匯入、但 Drive 源檔也找不到
    for e in ENTRIES:
        out = os.path.join(HISTORY_DIR, e["slug"] + ".html")
        if os.path.exists(out):
            continue  # repo 已有 → 永不覆蓋
        need_import.append(e)
        if not os.path.exists(src_path(e)):
            src_missing.append(e["src"])

    if src_missing:
        print("⚠️  以下新檔在 Google Drive 找不到來源，無法匯入：")
        for m in src_missing:
            print("   -", m)

    if "--check" in sys.argv:
        print(f"\n共 {len(ENTRIES)} 筆 · repo 已有 {len(ENTRIES)-len(need_import)} 篇（不覆蓋）"
              f" · 待匯入 {len(need_import)} 篇 · 來源缺 {len(src_missing)} 篇。")
        return

    # 只匯入 repo 尚未有、且 Drive 找得到源檔的新篇（複製時注入返回列/TOC）
    imported = 0
    for e in need_import:
        sp = src_path(e)
        if not os.path.exists(sp):
            continue
        with open(sp, encoding="utf-8", errors="replace") as f:
            html = f.read()
        if BACKBAR_MARK not in html:
            html = inject_after_body(html, BACKBAR_HTML.format(mark=BACKBAR_MARK))
        if not has_native_toc(html) and TOC_MARK not in html:
            html = inject_after_body(html, TOC_SNIPPET.format(mark=TOC_MARK))
        out = os.path.join(HISTORY_DIR, e["slug"] + ".html")
        with open(out, "w", encoding="utf-8") as f:
            f.write(html)
        imported += 1

    # catalog.json 永遠依 ENTRIES 重建（metadata 集中管理）；
    # 只收錄 repo 裡實際存在的檔，避免列出不存在的篇。
    built = []
    for e in ENTRIES:
        if not os.path.exists(os.path.join(HISTORY_DIR, e["slug"] + ".html")):
            continue
        rec = {k: e.get(k) for k in ("slug", "zh", "en", "cat", "lat", "lng", "group")}
        rec["blurb"] = e.get("blurb", "")
        built.append(rec)

    catalog = {"cats": [{"key": k, "zh": z, "en": en} for (k, z, en) in CATS],
               "items": built}
    with open(os.path.join(HISTORY_DIR, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    print(f"✅ 建置完成：catalog {len(built)} 篇 → {HISTORY_DIR}")
    print(f"   本次新匯入 {imported} 篇；其餘 repo 既有檔未動。")
    by = {}
    for r in built:
        by[r["cat"]] = by.get(r["cat"], 0) + 1
    for k, z, en in CATS:
        print(f"   {z}: {by.get(k,0)}")

if __name__ == "__main__":
    build()
