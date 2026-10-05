# v17 航線客量與動態供需

2026-10-05 取得資料。180 個機場，16,110 組配對、32,220 個方向。
1,493 組有官方航段客量，其餘 14,617 組是估算，沒有宣稱全部都有實測資料。
所有資料隨遊戲載入，遊戲期間不向第三方取資料。

## 官方資料與使用範圍

| 資料 | 年份 | 最終採用配對 | 定義 |
|---|---:|---:|---|
| [台灣民航局](https://www.caa.gov.tw/article.aspx?a=1746&lang=1)，表 53-1／53-2／53-4 | 2025 | 111 | TPE、KHH、RMQ 定期國際航線雙向旅客、座位 |
| [美國 BTS T-100 International Segment](https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FJE)，All Carriers | 2025 | 530 | 定期客運 CLASS=F，雙向、各公司、12 個月合計 |
| [英國 CAA Table 12.1](https://www.caa.co.uk/data-and-analysis/uk-aviation-market/airports/uk-airport-data/uk-airport-data-2025/annual-2025/) | 2025 | 138 | 定期國際航線雙向客量，不提供座位 |
| [Eurostat avia_par_*](https://ec.europa.eu/eurostat/cache/metadata/EN/avia_pa_esms.htm)，29 個報告國 | 2024 | 714 | PAS_BRD 航段旅客、ST_PAS 座位，含定期／非定期客運 |

這些是飛行航段的運量，包含轉機旅客；不是每位旅客的完整出發地—最終目的地需求。
沒有把歷史客量當成尚未滿足的候補旅客，玩家新增座位會與現有座位競爭。
2025 年桃園—洛杉磯：995,840 人次、1,365,065 個座位，載客率 72.95%。
同年的 BTS 數值略有不同；來源可能因申報與修訂而不同，採較優先的台灣報告，不平均兩者。

配對只對應同一座機場，沒有把 HND 合進 NRT、EWR 合進 JFK、LGW 合進 LHR、LIN 合進 MXP。
金邊 2025 年涉及 PNH／KTI 換機場，沒有把全年統計直接改標 KTI。
選擇順序是最新年份，再依台灣 CAA＞美國 BTS＞英國 CAA＞Eurostat，最後依報告機場／資料列排序。
Eurostat 兩端報告、台灣各公司的明細，都不再重複加總。
本次沒有取得全球完整 O-D、亞洲全部區內線、美國國內線、各國航權或各航線實收票價。
不在資料中不表示零需求，也不表示沒有直飛；估算市場不代表已存在直飛或可合法營運。

## 缺資料的估算與誤差

沿用原本人口／距離／觀光的重力模型形狀作先驗，將實際週客量的對數偏差以 ridge regression
配適截距、距離、180 個機場影響與 28 個區域配對影響。未觀測機場的影響收縮到零。
只用全年至少 25,000 人次、已知載客率至少 40% 的營運航線配適，共 1,396 組。
稀少、季節性或低載客率的實測值仍原樣保留，只不拿來推算其他市場。

以完整機場配對的 SHA-256 固定留出約 20%，沒有把同一配對的另一端放進訓練。
288 組留出樣本：乘法誤差中位數 1.519 倍，90 百分位 2.810 倍。
這是已營運航線上的驗證；存在選擇偏差，不能當成未開航市場的可信區間。
UK CAA 與缺座位的資料以客量／0.82 推估運力，明確標為設計值。
估算沒有設定玩家載客率下限；小市場與過多班次仍會很低。

## 遊戲供需與營收

- 年客量／52、年座位／52，皆包含兩個方向。週班次是來回班次，玩家週座位＝2×班次×單程座位。
- 需求依季節、年度成長、需求事件與固定種子的微幅波動變化。
- 依座位比例分配旅客，再調整票價、班次與服務。背景航空的合計不再當成一家具有超高班次優勢的公司。
- 初始具名對手的座位從背景總運力中切出，不再疊加一次。事件增班／新進對手才增加供給。
- 份額價格指數由 2×彈性改成 1×彈性，因為新航空在真實整體市場的占比通常很小。
- 平滑座位上限 p=8，避免原 p=2 在需求剛好等於座位時，把載客率壓成 70.7%。
- 沒有完整 O-D：保留 15% 航段客量給獨立轉機模型，當地客量與背景容量採另外 85%。這是設計假設，並非實測轉機占比。每線新增轉機不超過這個保留量與 60% 空位。
- 其他航空結算後才調整：每月向目標靠近 15%、每月最多增減原始背景運力 4%；指數限 0.4–2.5。目標隨長期需求、景氣與玩家座位的一半排擠量改變。六個月模式按月複合反應，不會在疫情當期瞬間撤掉全部航班。反應參數全是設計值。
- `marketSupply` 與初始具名對手的容量基準存入存檔；舊存檔補齊，不清除進度。
- 實際客量與座位不為獲利校準而修改。各基地票價指數、機組成本係數仍是遊戲設計值。新航網的航程組合改變後，機組係數採 1.25，並用既有成本占比／獲利測試校準。
- 廉航票價折扣、商務與觀光吸引力及轉機係數亦是設計值，沒有宣稱它們是官方實測。

## 重現與稽核

同樣使用台北、一年模式、seed 1、中票價與穩定客源預估的比較：

| 航線與班表 | v16 | v17 |
|---|---:|---:|
| TPE–NRT，A320neo，每週 7 趟來回 | 68.8% | 84.1% |
| TPE–SIN，A320neo，每週 7 趟來回 | 61.8% | 79.2% |
| TPE–LAX，A350-900，每週 5 趟來回 | 49.8% | 59.3% |

洛杉磯歷史 73% 是既有航空全年平均；玩家新增座位還要面對班次、季節與市場分配，
不會直接套成 73%。首航初期另有客源累積期；之後背景運力會逐步反應。

1. 建立 raw 資料目錄。將 OurAirports `airports.csv` 另存，匯出 `CITIES` 為 `cities.json`。
2. 將民航局 Excel [40812](https://www.caa.gov.tw/FileAtt.ashx?lang=1&id=40812) 存為 `tw2025.xls`。
3. UK CAA [CSV](https://www.caa.co.uk/Documents/Download/24007/87fb7670-4e10-4aeb-942d-509238aa25a1/17509) 存為 `uk2025.csv`。
4. BTS 官方下載表選 YEAR=2025、Period=All、Geography=All；選 ORIGIN、DEST、PASSENGERS、SEATS、DEPARTURES_PERFORMED、UNIQUE_CARRIER、YEAR、MONTH、CLASS。下載 ZIP 中 CSV 為 `bts2025.csv`。公開表單需要其 session 與 hidden form values；不要改用 Domestic US 表。
5. Eurostat API `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/avia_par_CC?freq=A&time=2024&unit=PAS&tra_meas=PAS_BRD` 儲存 `eu-CC.json`；`unit=SEAT&tra_meas=ST_PAS` 儲存 `seats-CC.json`。CC：be bg dk de ee el es fr hr it cy lv lt lu hu mt nl at pl pt ro si sk fi se is no ch tr。
6. `python3 games/airline/scripts/import-demand.py RAW_DIR AIRPORTS_CSV`（需要 numpy、xlrd）。
7. `node games/airline/scripts/audit-demand.mjs`。
8. `node --test games/airline/*.test.mjs`。

`ingestion.json` 保存每個來源 URL、原始檔 SHA-256、選擇順序與驗證誤差。
`observations.csv` 保存包括未選中的重複報告、來源與表格列號。
`demand-data.mjs` 是前端所需的彙總與校準係數，不含原始大檔。
`all-pairs.csv` 每個方向一列，保留歷史／估算的標籤與四種模式／經營型態的參考結果。
全配對檢查使用中票價與抽樣班次 1、2、3、4、5、7、10、14、21、28，不宣稱窮舉所有票價／班次。
非五個可玩基地的方向是中性票價指數的假想營運，不新增可玩基地。
`audit.json` 記錄有限數值／座位上限／航程檢查數量與五基地、兩模式、多種子完整經營結果。

## 來源授權與標示

- OurAirports：[公有領域資料](https://ourairports.com/data/)。
- 台灣 CAA：[政府資料開放授權條款第 1 版](https://www.caa.gov.tw/article.aspx?a=1433&lang=1)，標明民航局與年份，遊戲使用的是衍生彙總。
- 美國 BTS：美國交通部公開政府統計，標明 BTS、年份與資料表。
- UK CAA：依上述年度統計頁的重用條件標示 CAA 出處；不販售其資料或把本遊戲說成 CAA 認可的產品。
- Eurostat：[重用／著作權政策](https://ec.europa.eu/eurostat/about-us/policies/copyright)，標明 Eurostat、年份與資料表，估算與遊戲變化不屬官方統計。

遊戲來源頁與航線面板均保留官方出處。來源定義、年份、缺漏與遊戲估算不混為同一種資料。
