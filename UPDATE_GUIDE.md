# Property Monitor — 季度更新指南
# 最後更新：2026-04-07

## 網站架構概覽

| 類型 | 數量 | 更新方式 | 說明 |
|------|------|----------|------|
| **A 類：build.py 生成** | ~40 頁 | 改 JSON → 跑 build.py | supply, demand, valuation, risk, index dashboard |
| **B 類：手寫深度頁** | ~80 頁 | 直接改 HTML 或給 Claude 指令 | report.html, 城市深度頁, home.html |

### 現有市場（13 個）

| 市場 | 目錄 | report.html | 城市深度頁 | build.py 頁面 |
|------|------|-------------|------------|---------------|
| 🇲🇾 Malaysia | `/` | ✅ 手寫（38 charts） | kl.html, penang.html | supply, demand, valuation, risk |
| 🇹🇼 Taiwan | `/tw` | ✅ 手寫（19 charts） | taipei.html, hsinchu.html | supply, demand, valuation, risk |
| 🇯🇵 Japan | `/jp` | ✅ 手寫（4 charts） | tokyo.html, fukuoka.html, osaka.html | supply, demand, valuation, risk |
| 🇦🇺 Australia | `/au` | ✅ 手寫（28 charts） | sydney(24), brisbane(20), goldcoast(20), melbourne(2) | supply, demand, valuation, risk |
| 🇳🇿 New Zealand | `/nz` | ✅ 手寫（4 charts） | auckland.html, christchurch.html | supply, demand, valuation, risk |
| 🇬🇧 UK | `/uk` | ✅ 手寫（4 charts） | london, manchester, edinburgh, birmingham, newcastle | supply, demand, valuation, risk |
| 🇺🇸 US | `/us` | ✅ 手寫（14 charts） | nyc, la, sf, sv, miami, chicago, austin, seattle, boston, denver, phoenix, sandiego | supply, demand, valuation, risk |
| 🇨🇦 Canada | `/ca` | ✅ 手寫（2 charts） | toronto.html, vancouver.html | supply, demand, valuation, risk |
| 🇰🇷 South Korea | `/kr` | ✅ 手寫（2 charts） | seoul.html, busan.html | supply, demand, valuation, risk |
| 🇹🇭 Thailand | `/th` | ✅ 手寫（2 charts） | bangkok.html, chiangmai.html | supply, demand, valuation, risk |
| 🇻🇳 Vietnam | `/vn` | ✅ 手寫（2 charts） | hochiminh.html, hanoi.html | supply, demand, valuation, risk |
| 🇸🇬 Singapore | 無獨立目錄 | — | — | 僅 home.html 城市表格 |
| 🇭🇰 Hong Kong | 無獨立目錄 | — | — | 僅 home.html 城市表格 |

### 關鍵檔案

| 檔案 | 用途 | 更新頻率 |
|------|------|----------|
| `home.html` | 首頁，57 城市比較表 | 每季 |
| `report.html` | 馬來西亞全市場報告（最大單檔，38 charts） | 每季 |
| `kl.html` | KL 深度分析（29 charts，含 RM1M+ luxury tabs） | 每季 |
| `docs/dd/DD_KL_RM1M_20260331.html` | KL 獨立深度研究報告 | 按需 |
| `index.html` | Redirect 到 home.html | 不需改 |

---

## 每季更新步驟（完整 SOP）

### 第 0 步：準備數據來源

收集以下資料（以 Q2 2026 更新為例）：

| 市場 | 主要數據來源 | 發布時間 |
|------|-------------|----------|
| MY | NAPIC 季報、BNM、REHDA、DOSM | 季後 2-3 個月 |
| TW | 內政部不動產平台、央行、住展、信義研究院 | 季後 1-2 個月 |
| AU | CoreLogic HVI、ABS、SQM Research、Domain | 月度/季度 |
| JP | REINS、MLIT、BOJ | 季後 1 個月 |
| NZ | REINZ、Stats NZ、CoreLogic NZ | 月度 |
| UK | Land Registry、ONS、Rightmove | 月度 |
| US | NAR、Zillow、Redfin、FRED | 月度 |

### 第 1 步：更新首頁城市比較表（home.html）

給 Claude 的指令範本：
```
更新 home.html 城市比較表的以下城市數據（只改數字，不動結構）：

KL: priceUSD→185000, priceDisp→'RM 830K', yoy→3.2, yield→4.6, pti→6.4, supply→'loose', pipeline→3.0, mortgage→4.20, outlook:{en:'SA clearing; landed steady',zh:'SA消化中；有地穩定'}
Sydney: priceUSD→1050000, yoy→4.5, yield→3.1, ...
（列出所有要改的城市）
```

### 第 2 步：更新 A 類頁面（build.py 生成）

```bash
# 改 JSON 數據
nano market_data/malaysia.json
nano market_data/taiwan.json
nano market_data/australia.json
# ... 其他市場

# 重新生成
python build.py

# 確認生成的 HTML 沒有問題
open supply.html
open demand.html
```

⚠️ **注意**：build.py 只生成 supply/demand/valuation/risk/index dashboard 頁面。
report.html 和城市深度頁**不會**被 build.py 覆蓋。

### 第 3 步：更新各市場 report.html（B 類手寫）

**優先度排序**（按內容深度和讀者量）：
1. 🇲🇾 `report.html` — 最大最複雜（38 charts, 10 sections）
2. 🇹🇼 `tw/report.html` — 第二大（19 charts, 9 sections）
3. 🇦🇺 `au/report.html` — 第三大（28 charts, 9 sections）
4. 其他市場 report.html

給 Claude 的指令範本：
```
更新 report.html 的以下內容（只改文字段落，不動圖表 JS）：

EXECUTIVE SUMMARY 段落：
- 全國 Overhang: 28,672 → [新數字]
- 租金收益率: 5.19% → [新數字]
- ...

SUPPLY 章節段落：
- 完工量: 69,303 → [新數字]
- ...

（逐章節列出要改的數字）
```

### 第 4 步：更新城市深度頁（B 類手寫）

**需要更新的項目**：
1. **KPI 卡片數字**（6 個 KPI）
2. **文字段落中的數據**
3. **圖表數據**（如果要加新的時間點）

給 Claude 的指令範本（以 Sydney 為例）：
```
更新 au/sydney.html：

KPI cards 更新：
1. 獨棟中位價: A$1,607,046 → A$1,650,000 (+2.7% YoY)
2. 公寓中位價: A$903,080 → A$920,000
3. ...

圖表更新（加新資料點）：
chartSydneyPriceQ: labels 加 '2026Q2', Houses 加 1650000, Units 加 920000
chartClearanceRate: labels 加 'Jun 26', data 加 58

文字段落只改有數字變動的句子。
```

### 第 5 步：更新利率 badge

如果各國央行利率有變動：
```
在以下檔案中，把 opr-badge 的利率值更新：
- report.html: OPR: 2.75% → OPR: 3.00%
- au/*.html: RBA: 4.10% → RBA: 4.35%
- tw/*.html: CBC: 2.0% → CBC: 2.125%
（用 grep + sed 批量處理）
```

### 第 6 步：更新頁尾數據來源日期

```
把所有 report.html 的 source-footer 日期從 Q1 2026 改成 Q2 2026。
用 Python 批量處理 6 個 report.html。
```

### 第 7 步：提交和部署

```bash
git add -A
git status  # 確認改了什麼
git commit -m "data: Q2 2026 全站季度更新"
git push origin main
# Cloudflare Pages 自動部署，1-2 分鐘生效
```

---

## 常用 Claude 指令模板

### 批量改數字（不動結構）
```
目標：更新 ~/malaysia-property/[file] 的所有文字段落。
絕對禁止改動：HTML 結構、CSS、圖表程式碼（JS）、導航列。
只改：每個 <p> 段落的中英文內容中的數據數字。

找到 [舊數字]，改成 [新數字]。
（逐一列出所有要改的數字對）
```

### 新增圖表
```
在 [file] 的 [section name] 章節末尾新增 2 張圖。
在現有最後一張圖的 report-chart-grid </div> 之後插入新的 report-chart-grid。
每張圖用 allCharts.push()，在 initAllCharts 中呼叫。
不動現有任何圖表的程式碼。

[圖1] chartXxx：
  type: bar
  data: [...]
  ...

[圖2] chartYyy：
  type: line
  ...
```

### 新增章節
```
在 [file] 的 [A 章節] 之後、[B 章節] 之前，
新增一個完整的 [新章節名] 章節。
不動現有任何其他章節。

<h2><span class="lang-en">...</span><span class="lang-zh" style="display:none">...</span></h2>
（提供完整 EN + ZH 文字和圖表規格）
```

### 整頁重寫
```
完全重寫 [file] 的主要內容區（<main> 內所有內容）。
保留現有 navbar、CSS 結構、語言切換機制不變。

（提供完整的 KPI、sections、charts 規格）
```

---

## 檔案變動風險等級

| 風險 | 檔案 | 說明 |
|------|------|------|
| 🔴 高 | home.html | JS 語法錯誤會導致整個首頁空白（如未跳脫的引號） |
| 🔴 高 | report.html | 38 個 ECharts，改錯一個 function 會讓整頁圖表壞掉 |
| 🟡 中 | kl.html | 29 個 ECharts + 5 tab panels，結構複雜 |
| 🟡 中 | au/sydney.html | 24 個 ECharts，語言切換依賴 initCharts |
| 🟢 低 | 各市場 supply/demand/valuation/risk | build.py 生成，改 JSON 即可 |
| 🟢 低 | 簡單城市頁（<5 charts） | 結構簡單，不易出錯 |

---

## 常見陷阱

1. **JS 字串中的引號**：`outlook:{en:'buyer's market'}` → 壞掉。用 `buyer market` 或 `buyer\\'s market`
2. **build.py 會覆蓋**：不要手改 supply.html / demand.html 等 — 下次跑 build.py 會被蓋掉
3. **ECharts dispose**：setLang 切換時必須 dispose 再 reinit，否則圖表會疊加
4. **duplicate chart ID**：同一頁不能有兩個相同的 div id，echarts.init 只會找到第一個
5. **CSS 未逸出**：在 `<style>` 裡的 `&` 要用 `&amp;` 只在 HTML 內文，CSS 裡直接寫
6. **submodule 陷阱**：不要 `git add -A` 到巢狀的 `malaysia-property/` 目錄（已加入 .gitignore）
