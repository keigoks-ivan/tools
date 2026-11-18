# 神戶港機甲對戰服務

每個邀請連結對應一個 Cloudflare Durable Object。玩家按下準備才開始運算，伺服器每秒推進 30 次，每兩步送一次對戰狀態。客戶端傳控制輸入，移動、碰撞、命中與勝負由 `game/mech/duel/rules.mjs` 裁定。

## 本機測試

在專案根目錄使用 Node.js 22 以上及現有 Wrangler 安裝。若本機尚未安裝 Wrangler，可執行 `npm ci --prefix workers/coop-relay`。

```sh
workers/coop-relay/node_modules/.bin/wrangler dev --config workers/mech-duel/wrangler.toml --port 8791
node --test workers/mech-duel/test/protocol.test.mjs
node workers/mech-duel/test/socket-smoke.mjs
```

冒煙測試也可透過 `DUEL_BASE` 和 `DUEL_ORIGIN` 指定已部署的測試環境。

## Endpoint

| 呼叫 | 成功回應 |
| --- | --- |
| `GET /health` | `{ ok: true, protocol: 1 }` |
| `POST /rooms` | `{ room }`，將房號放進分享連結 |
| `GET /ws?room=…&resume=…` | WebSocket；首次加入省略 `resume` |

WebSocket 連上後，`welcome` 提供座位 `slot`、重連金鑰 `resume`、最後收到的控制序號 `ack`、`members`、`ready` 與 `paused`。重連金鑰僅保存在各玩家的工作階段，分享連結只帶房號。兩個玩家各傳 `{t:"ready",value:true}` 後，伺服器以 `{t:"state",state,ack}` 傳送對局。輸入用 `{t:"input",seq,input}`，已確認的序號須遞增。結算後雙方各傳 `{t:"rematch"}` 即開下一場。

機體外型使用 `{t:"mech",id:"cangyan"|"bailu"|"tiechao"}` 選擇。`welcome` 與 `room` 提供 `mechs`、`canSelect`，對戰快照也帶有 `mechs`。選擇保存在座位中；尚未準備的大廳或結算畫面可以更換，準備後與交戰期間鎖定。外型資料不參與移動、碰撞、血量與武器規則，舊客戶端可忽略新增欄位。

有玩家離線時，戰鬥時間暫停，保留原座位 45 秒。逾時後 `{t:"aborted",reason:"disconnect"}` 會把仍在房間的玩家帶回大廳。主動傳送 `{t:"leave"}` 會立即釋出座位。房間大廳閒置 20 分鐘後到期。

兩端都用 `/ws` 的 `shield=1` 宣告支援防護罩，新對局的 `state.shieldEnabled` 才會為 `true`。輸入 `shield:true` 代表一次按下，剩餘吸收量 `shieldHp` 和冷卻秒數 `shieldCooldown` 由伺服器提供。舊客戶端可繼續玩原規則的對局。

## 部署

使用 `wrangler deploy --config workers/mech-duel/wrangler.toml` 部署獨立 Worker。正式前端透過 `https://mech-duel.keigoks.workers.dev` 連線，前端網域需列在 `ALLOWED_ORIGINS`。等待、結束或暫停時房間可休眠，對局開始後才持續執行。容量與成本依實測的並發房間數與狀態流量估算。
