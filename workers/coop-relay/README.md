# coop-relay：紫刃夜行三人連線的轉送伺服器

三兄弟各自在不同裝置、不同網路，進同一個房間，在同一個關卡裡打**同一批敵人**。
第一階段同步角色位置與動作；第二階段起敵人由房主的裝置統一模擬（見下方「第二階段」）。

- 前端頁面：`game/trio/index.html`（單人版 `game/3d-next/` 完全不載入連線程式）
- 客戶端模組：`game/3d-next/net/`（三人頁 import，引擎本體沿用 `game/3d-next/`）
- 伺服器：本資料夾。Cloudflare Worker＋Durable Object（每個房間一個 DO，Hibernation API），免費方案可跑。

## 運作方式

1. 三人頁顯示「輸入你的代號」。代號送到 `POST /auth`。
2. Worker 用 constant-time 比對 secret `PLAYER_CODES`。對了就發一張 HMAC 憑證（`TOKEN_SECRET` 簽章，內含顯示名稱與 30 天到期），存在瀏覽器 localStorage。
3. 錯的代號只回「代號不正確。」。同一個 IP 10 分鐘內錯 5 次就擋，直到最舊那次過期。
4. 開房或加入房間走 WebSocket `/ws?room=NEW|房號&token=…`。顯示名稱取自憑證，不信任客戶端輸入。
5. 房間最多 4 人。第一個進來的是房主；房主離開時，最早進來的人接手，全員收到通知。
6. 伺服器只轉送與管理名單：單則訊息上限 512 bytes（房主的戰場訊息 4096），每個連線每秒超過 40 則就丟，持續濫發就斷線。

## 第二階段：大家打同一批敵人（房主權威）

**房主的裝置是唯一的戰場。** 出兵、敵人 AI、血量、死亡、段落進度、守將階段都只在房主那台跑；其他人看到的敵人是房主敵人的「傀儡」，不跑自己的 AI 或出兵。

| 訊息 | 誰送 | relay 怎麼處理 | 內容 |
|---|---|---|---|
| `s` | 每個人，12 Hz（靜止 2 Hz） | 轉給其他人（白名單欄位） | 自己的角色位置與動作（第一階段）；第三階段多一個狀態位元 `st`（1＝切到背景、2＝倒地，其他值丟掉） |
| `e` | 只有房主，10 Hz | 非房主送的直接丟；上限 4096 bytes；通用淨化後轉給其他人 | 敵人 delta（每秒一則關鍵幀）、關卡進度、事件、打到誰的傷害 `dm` |
| `h` | 隊友，打中時最多 10 Hz | 只轉給房主；每則最多 32 筆命中 | 命中申報 `[敵人 id, 原始傷害, 招式, 招式編號]`、想撿的補給（房主裁定誰拿到）；第三階段多一個 `r: 1`＝全滅或過關後按了重來，房主收到就重開 |
| `y` | 只有房主 | 改名單順序，廣播 `host` | 交棒：房主畫面停住（切背景、鎖屏）持續 2 秒以上時，交給持續看得到畫面的隊友（站著的優先）；沒人看得到就不交，剛接手或剛交過棒的一段時間內不再交（第三階段起倒地不再觸發交棒） |

- **打中**：隊友本機立刻播火花、音效、定格並顯示預測血量，同時申報給房主；房主寬鬆驗證（距離、傷害上限、每秒筆數）後用原本的扣血規則（防禦、破防、擊倒）套用，結果隨下一則 `e` 回來。無雙亂舞與起手定身也走同一條路。
- **被打**：房主判定敵人打中某位隊友時只送 `dm`，由那位隊友自己扣血（每個人擁有自己的血量；跳起來仍能閃過地面攻擊）。
- **仇恨分散**：敵人依「距離＋該玩家已被多少敵人追」分配目標，敵將與守將算 3 隻，每 0.5 秒重算並保留黏著，不會全部追房主。
- **人數加成**（`game/3d-next/net/scaling.js` 一處定義）：2 人＝整段敵人數 ×1.3、血量 ×1.4；3 人＝×2.0、×2.4（傷害 ×1.35）；4 人＝×2.5、×3.0（傷害 ×1.45）。同時在場上限（桌機 16／手機 10）不變：人多是打得更久，不是同時更多。
- **換房主**：房主離線、倒下或畫面停住時，新房主拿自己手上的最後一份鏡像接手（傀儡轉回真的敵人、重建段落計時），關卡不重來。
- **單人不受影響**：單人頁不載入任何連線程式；三人頁只剩自己一人時，所有掛鉤直接呼叫原本的方法。

目前已知的限制：影刃的突刺只會打到它追的那個人；守將怒吼的推擠不會推動隊友；兩人同時撿同一個補給可能都吃到；全員倒下時要等房主重試。

## 上線步驟

以下都在 `workers/coop-relay/` 執行。

```sh
npm install
npx wrangler login
```

### 1. 設定兩個 secret（代號永遠不進 repo、不進前端程式）

```sh
npx wrangler secret put PLAYER_CODES
# 貼上 JSON，最多 4 筆，例：{"自己想的長代號-1":"大哥","另一個長代號-2":"二哥","第三個長代號-3":"三弟","第四個長代號-4":"小弟"}

npx wrangler secret put TOKEN_SECRET
# 貼上至少 32 字元的亂數，例如 `openssl rand -base64 48` 的輸出
```

- `PLAYER_CODES` 超過 4 筆、不是 JSON、代號短於 4 字元、名稱重複，Worker 一律拒絕服務（登入回 500，WebSocket 以 4010 關閉），不會默默放行。
- 代號建議 12 字元以上、不要用生日或名字。

### 2. 決定伺服器網址

建議與三人頁同一個網域，Cloudflare Access 才能用同一個 cookie 保護兩者：

- 在 `wrangler.toml` 取消註解：
  ```toml
  routes = [{ pattern = "tools.investmquest.com/coop-relay/*", zone_name = "investmquest.com" }]
  ```
  Worker 會自動去掉 `/coop-relay` 前綴。Worker route 比 Pages 優先，這條路徑不會被 Pages 接走。
- 或者不設 route，直接用 `https://coop-relay.<帳號>.workers.dev`。這樣三人頁要改 `PRODUCTION_RELAY`，而且日後開 Cloudflare Access 時，Access cookie 不會帶到另一個網域的 WebSocket。

### 3. 部署

```sh
npx wrangler deploy
curl https://tools.investmquest.com/coop-relay/health   # 應回 ok
```

### 4. 前端指向伺服器

`game/3d-next/net/protocol.js` 的 `PRODUCTION_RELAY` 預設是 `https://tools.investmquest.com/coop-relay`。用 workers.dev 就改成那個網址。
臨時測試可以在網址加 `?relay=https://…`，不用改程式。

### 5. Origin 白名單

`wrangler.toml` 的 `ALLOWED_ORIGINS` 預設只收 `https://tools.investmquest.com` 與本機（`localhost`／`127.0.0.1` 任意 port）。
要從 Pages 預覽網址測，加上 `https://*.<pages 專案名>.pages.dev`。

## 管理代號

| 想做的事 | 怎麼做 |
|---|---|
| 新增一位兄弟 | 重新 `npx wrangler secret put PLAYER_CODES`，貼上加了一筆的完整 JSON（總數仍不得超過 4） |
| 撤銷一位兄弟 | 同上，把他那一筆拿掉。他的舊憑證立即失效：每次連線都會檢查憑證上的名稱還在不在 `PLAYER_CODES` |
| 換某人的代號 | 同上，改他那筆的代號（名稱不變）。他已登入的裝置照常能用；要強制重登就同時輪換 `TOKEN_SECRET` |
| 撤銷所有人 | 重新 `npx wrangler secret put TOKEN_SECRET` 換新亂數。所有憑證立即失效，每個人都要重新輸入代號 |

秘密改完立即生效，不需要重新部署。

## 選用：Cloudflare Access（多一層門）

三人頁的 HTML 本身可以公開，代號＋憑證才是門。要再加一層：

1. Cloudflare Zero Trust → Access → Applications → Add → Self-hosted。
2. Application domain 加兩條路徑：
   - `tools.investmquest.com/game/trio/*`
   - `tools.investmquest.com/coop-relay/*`
3. Policy：Allow，Include → Emails，填三兄弟的 email（免費方案 50 人以內免費）。
4. 伺服器端若要再驗 Access JWT：設 `ACCESS_AUD` 變數。目前 `src/index.js` 的 `accessIdentity()` 只留了接點，設了 `ACCESS_AUD` 但尚未實作 JWT 驗證時會一律拒絕，避免誤以為有保護。

## 本機開發與測試

```sh
cp .dev.vars.example .dev.vars        # 假的測試代號，.dev.vars 已被 .gitignore
npx wrangler dev                       # http://localhost:8787
# 另一個終端，在 repo 根目錄：
python3 -m http.server 8931
# 開 http://localhost:8931/game/trio/ （localhost 自動連 localhost:8787）
```

- 端對端煙霧測試：`npm run smoke`（自己起 `wrangler dev`，用 3 個 WebSocket 客戶端跑登入、轉送、限速、房主轉移、戰場訊息只收房主、命中申報只給房主、交棒、滿房拒絕、錯誤設定，結束後關掉伺服器）。
- 純邏輯單元測試在 `game/tests/coop-relay.test.mjs`、`game/tests/coop-net.test.mjs`、`game/tests/coop-sync.test.mjs`（第二階段：封包、加成、仇恨、申報驗證，以及兩個真的關卡經假 relay 對打與換房主）、`game/tests/coop-team.test.mjs`（第三階段：倒地救援、全滅重來、合體大招、補給裁定、交棒遲滯），跟全部遊戲測試一起跑：
  `node --loader ./game/tests/three-loader.mjs --test game/tests/*.test.mjs`
- 同一台電腦開兩個分頁測試時要並排兩個視窗：被切到背景的分頁瀏覽器會停止繪製。

## 免費額度估算（3 人玩 1 小時）

以下是依 2026 年 Cloudflare Workers Free 方案條款估算，上線前請以官方文件現值再核一次。

- **Durable Object 請求**（免費每日 100,000）：只算進站訊息（relay 轉出去的不算），Hibernation 下 WebSocket 進站訊息以 20:1 計費。第二階段每秒：房主 12（角色）＋10（戰場）、兩位隊友各 12＋打中時最多 10 的申報，戰鬥中約 52–56 則／秒 ≈ 20 萬則／小時 ≈ **1 萬請求／小時**，每天約可玩 **10 小時**。站著不動、沒有打中時更少。
- **為什麼戰場訊息放寬到 4096 bytes**：免費額度按則數計、不按大小；18 隻敵人的關鍵幀加上一段事件常超過 512，硬切成多則反而多花額度。實測一則關鍵幀約 800–900 bytes，平常的 delta 更小。
- **Durable Object 時長**（免費每日 13,000 GB-s）：遊戲中房間不會休眠，128 MB × 3,600 秒 ≈ 460 GB-s／小時，每天約 28 小時。
- **Worker 請求**（免費每日 100,000）：只有登入與每次連線各算一次，可忽略。
- 房間清空 5 分鐘後刪除儲存；沒有人在房間時不耗時長。
