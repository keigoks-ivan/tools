#!/usr/bin/env bash
# 排程跑這支：抓實價登錄（買賣/預售/租賃）+ 591 開價/租屋 + 預售屋備查建案，
# 算好戶別試算係數、供給、需求、價格走向，寫進 tw/qingpu/data/*.json。
# 任一來源失敗都不讓整支腳本掛掉，失敗訊息記在 data/meta.json 裡；後面的計算
# 腳本讀不到上一支的輸出就跳過自己那個區塊，不會讓整條管線掛掉。
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PYTHON="${PYTHON:-python3}"

echo "== fetch_lvr.py（實價登錄：買賣/預售/租賃，最新一批）=="
"$PYTHON" fetch_lvr.py || echo "fetch_lvr.py 失敗，繼續往下跑"

echo "== fetch_591.py（591 售屋開價）=="
"$PYTHON" fetch_591.py || echo "fetch_591.py 失敗，繼續往下跑"

echo "== fetch_591_rent.py（591 租屋，交叉核對用）=="
"$PYTHON" fetch_591_rent.py || echo "fetch_591_rent.py 失敗，繼續往下跑"

echo "== fetch_buildcase.py（預售屋備查建案，建案總表/交屋時間表依賴這支的輸出）=="
"$PYTHON" fetch_buildcase.py || echo "fetch_buildcase.py 失敗，繼續往下跑"

echo "== compute_estimate.py（戶別試算通用係數，依賴前兩支的輸出）=="
"$PYTHON" compute_estimate.py || echo "compute_estimate.py 失敗，繼續往下跑"

echo "== compute_supply.py（青埔未來供給，依賴前面幾支的輸出）=="
"$PYTHON" compute_supply.py || echo "compute_supply.py 失敗，繼續往下跑"

echo "== compute_demand.py（青埔需求，依賴 compute_supply.py 的輸出）=="
"$PYTHON" compute_demand.py || echo "compute_demand.py 失敗，繼續往下跑"

echo "== compute_price_outlook.py（價格走向，依賴前面幾支的輸出）=="
"$PYTHON" compute_price_outlook.py || echo "compute_price_outlook.py 失敗，繼續往下跑"

echo "== compute_summary.py（總覽分頁用的小檔，依賴前面所有輸出）=="
"$PYTHON" compute_summary.py || echo "compute_summary.py 失敗，繼續往下跑"

echo "== compute_compare.py（桃園各區／重劃區比較，跟前面互相獨立，失敗不擋其他輸出）=="
"$PYTHON" compute_compare.py || echo "compute_compare.py 失敗，繼續往下跑"

echo "== 完成 =="
