# -*- coding: utf-8 -*-
"""
共用設定檔：青埔特區範圍、道路白名單、遠雄仰森辨識規則、各項計算參數。
改這個檔案就能調整「青埔特區」的範圍或仰森的判斷條件，抓取/計算腳本都讀這裡。

這是公開網站用的版本：不含任何特定戶別／特定買方資訊，「戶別試算」區塊是通用
工具（任何人可以選任何一戶試算），不是預先算好某一戶的答案。
"""
import os
import re

# ---------------------------------------------------------------------------
# 輸出路徑：資料寫到網站的 tw/qingpu/data/，跟頁面放在一起；LVR zip 快取放在
# scripts/qingpu/.cache/（.gitignore 排除）。用環境變數可以覆寫，方便本機測試。
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
DATA_DIR = os.environ.get("QINGPU_DATA_DIR", os.path.join(REPO_ROOT, "tw", "qingpu", "data"))
CACHE_DIR = os.environ.get("QINGPU_CACHE_DIR", os.path.join(SCRIPT_DIR, ".cache", "lvr"))

DEALS_JSON = os.path.join(DATA_DIR, "deals.json")
LISTINGS_JSON = os.path.join(DATA_DIR, "listings.json")
UNITS_JSON = os.path.join(DATA_DIR, "units.json")
META_JSON = os.path.join(DATA_DIR, "meta.json")
ESTIMATE_JSON = os.path.join(DATA_DIR, "estimate.json")
SUPPLY_DEMAND_JSON = os.path.join(DATA_DIR, "supply_demand.json")
DOOR_PROJECT_JSON = os.path.join(DATA_DIR, "door_project.json")
BUILDCASE_JSON = os.path.join(DATA_DIR, "buildcase.json")
OUTLOOK_JSON = os.path.join(DATA_DIR, "outlook.json")
RENTAL_JSON = os.path.join(DATA_DIR, "rental.json")
DEMAND_JSON = os.path.join(DATA_DIR, "demand.json")
SUMMARY_JSON = os.path.join(DATA_DIR, "summary.json")
COMPARE_JSON = os.path.join(DATA_DIR, "compare.json")
LISTING_HISTORY_JSONL = os.path.join(DATA_DIR, "listing_history.jsonl")
INVENTORY_HISTORY_JSONL = os.path.join(DATA_DIR, "inventory_history.jsonl")
LVR_CACHE_DIR = CACHE_DIR  # 相容舊名稱

# ---------------------------------------------------------------------------
# 青埔特區範圍：鄉鎮市區 + 道路白名單
# 地址只要落在下列鄉鎮市區，且包含對應道路白名單中任一路名（子字串比對），
# 就算青埔特區。預售屋地址常寫成「A路與B路交叉口」，一樣用子字串比對。
# ---------------------------------------------------------------------------
DISTRICTS = ["中壢區", "大園區"]

ROAD_WHITELIST_COMMON = [
    "領航南路", "領航北路",
    "高鐵北路", "高鐵南路",
    "高鐵站前路", "高鐵站前西路", "高鐵站前東路",
    "青商路", "青心路", "青埔路",
    "青昇路", "青雲路", "青峰路", "青溪路", "青境路", "青山路",
] + [f"青埔{n}街" for n in "一二三四五六七八九十"]

# 僅大園區適用的道路（致遠路、公園路一段在中壢區不算青埔）
ROAD_WHITELIST_DAYUAN_ONLY = ["公園路", "致遠一路", "致遠二路"]


def road_whitelist_for(district: str):
    roads = list(ROAD_WHITELIST_COMMON)
    if district == "大園區":
        roads = roads + ROAD_WHITELIST_DAYUAN_ONLY
    return roads


def is_qingpu_address(district: str, address: str) -> bool:
    """判斷一筆實價登錄地址是否落在青埔特區範圍內。"""
    if district not in DISTRICTS:
        return False
    if not address:
        return False
    return any(road in address for road in road_whitelist_for(district))


def matched_road(district: str, address: str):
    """回傳命中的道路白名單字串（找不到回傳 None），用於「青埔最新成交」的道路篩選。"""
    if district not in DISTRICTS or not address:
        return None
    for road in road_whitelist_for(district):
        if road in address:
            return road
    return None


# ---------------------------------------------------------------------------
# 遠雄仰森辨識規則
# 預售資料（B檔）直接比對建案名稱。買賣資料（A檔，交屋後轉手或預售過戶登記）
# 沒有建案名稱，改用實際門牌號：桃園市大園區領航南路二段 71/73/75/77/79 號。
# 地址常見全形數字（７７號），比對前要先轉半形。
# ---------------------------------------------------------------------------
YUANXIONG_PROJECT_NAME = "遠雄仰森"          # 預售資料的「建案名稱」欄位
YUANXIONG_DISTRICT = "大園區"
YUANXIONG_ADDRESS_KEYWORD = "領航南路二段"
YUANXIONG_DOOR_NUMBERS = {71, 73, 75, 77, 79}
YUANXIONG_COMMUNITY_KEYWORD_591 = "仰森"     # 591 community_name / title 比對關鍵字

_FULLWIDTH_DIGITS = "０１２３４５６７８９"
_HALFWIDTH_DIGITS = "0123456789"
_DIGIT_TRANS = str.maketrans(_FULLWIDTH_DIGITS, _HALFWIDTH_DIGITS)


def normalize_digits(s: str) -> str:
    return (s or "").translate(_DIGIT_TRANS)


def extract_door_number(address: str):
    """取地址中「YUANXIONG_ADDRESS_KEYWORD」後面緊接的門牌號（數字＋「號」）。
    找不到關鍵字或門牌號就回傳 None。"""
    addr = normalize_digits(address)
    keyword = normalize_digits(YUANXIONG_ADDRESS_KEYWORD)
    idx = addr.find(keyword)
    if idx == -1:
        return None
    rest = addr[idx + len(keyword):]
    m = re.match(r"(\d+)\s*號", rest)
    return int(m.group(1)) if m else None


def is_yuanxiong_address(district: str, address: str) -> bool:
    """買賣（A檔）判斷是不是遠雄仰森：大園區、領航南路二段、門牌號落在白名單。"""
    if district != YUANXIONG_DISTRICT:
        return False
    door = extract_door_number(address)
    return door is not None and door in YUANXIONG_DOOR_NUMBERS


# ---------------------------------------------------------------------------
# 住宅類型過濾
# ---------------------------------------------------------------------------
RESIDENTIAL_BUILDING_TYPES = ["住宅大樓", "華廈", "公寓", "透天"]
DROP_TRADE_TARGETS = ["土地", "車位"]  # 交易標的為純土地或純車位就丟棄

# 備註出現下列字樣視為特殊交易，中位數/圖表排除，但列表仍顯示
SPECIAL_NOTE_KEYWORDS = [
    "親友", "特殊關係", "員工", "瑕疵", "債權債務",
    "急買急賣", "含裝潢", "增建", "頂樓加蓋",
]

# 坪與平方公尺的換算：1 平方公尺 = 0.3025 坪
SQM_TO_PING = 0.3025

# 交屋後這麼多天內完成的買賣登記，當成預售合約的最終過戶／量體轉手，不算真正的中古
# 市場轉手：真正的中古交易需要原屋主先交屋、住進去或持有一段時間才會賣，不可能交屋
# 後一兩個月內就完成一筆全新的第三方交易。實際發現案例：領航北路二段302號整棟預售
# 案，交屋後 45-123 天內有多筆備註沒寫「預售屋」但價格明顯是 2021 年預售價的登記，
# 混進「中古」中位數會嚴重低估行情。
PRESALE_HANDOVER_GRACE_DAYS = 150

# ---------------------------------------------------------------------------
# 591 售屋（開價）抓取設定
# ---------------------------------------------------------------------------
HOUSE_591_KEYWORDS = ["青埔", "仰森"]
HOUSE_591_REGION_ID = 6  # 桃園市
HOUSE_591_BASE_URL = "https://bff-house.591.com.tw/v1/web/sale/list"
HOUSE_591_DETAIL_URL_TMPL = "https://sale.591.com.tw/home/house/detail/2/{houseid}.html"
HOUSE_591_PAGE_SIZE = 30
HOUSE_591_SLEEP_SEC = 0.8
# 591 用「上次更新時間」排序，整輪爬約 4-5 分鐘內清單會洗牌，同一輪 firstRow 分頁
# 會漏掉幾十筆（不是真的下架）。這個門檻原本是給「每天跑」設計的（連續2輪都抓不到
# 才算下架，避免單輪洗牌誤判）；現在排程改成每月跑一次，連續2輪要等2個月才會標
# 下架，太慢。改成 1：只要這一輪是「完整爬完全部關鍵字」（all_keywords_ok）就直接
# 採信這一輪的結果，不用等第二輪確認——partial crawl（有關鍵字沒抓完整）的保護
# 還是保留，那種情況完全不判斷下架（見 fetch_591.py mark_missing_inactive 只在
# all_keywords_ok 時才呼叫）。
HOUSE_591_MISS_THRESHOLD = 1
HOUSE_591_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------------------
# 內政部實價登錄設定
# ---------------------------------------------------------------------------
LVR_LATEST_URL = "https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip"
LVR_SEASON_URL_TMPL = "https://plvr.land.moi.gov.tw/DownloadSeason?season={season}&type=zip&fileName=lvr_landcsv.zip"
# 每月 1/11/21 號公布的「歷史批次」zip：涵蓋還沒被季別檔收錄的最新資料，用來補
# 最新一季公布前的空窗（單靠 LVR_LATEST_URL 只有最近約 10 天，會漏掉一整季）。
# 每月排程只跑一次，所以要一次把「上次執行後所有還沒抓過」的 1/11/21 批次都補齊，
# 不能只補當天，見 fetch_lvr.py 的 bridge_recent_history。
# 當天日期還沒公布時，伺服器回 200 + 一小段 HTML，不是 zip，要跳過。
LVR_HISTORY_URL_TMPL = "https://plvr.land.moi.gov.tw/DownloadHistory?type=zip&fileName={date}"
LVR_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
LVR_SEED_START_SEASON = "110S3"  # --seed 模式回補的起始季度（民國年+S+季別）；預售(B檔)從110S3(2021年7月)才開始登記
LVR_TAOYUAN_FILES = {
    "resale": "h_lvr_land_a.csv",   # 買賣（中古屋/新成屋）
    "presale": "h_lvr_land_b.csv",  # 預售屋
    "rental": "h_lvr_land_c.csv",   # 租賃
}

# ---------------------------------------------------------------------------
# 坪數 / 屋齡分類（篩選用；邊界只改這裡，前端顯示文字對照同一組 key）
# 坪數以「建物移轉總面積」（不含車位）為準；591 沒有拆車位面積時就用 591 原始 area，
# 並在資料說明頁註記。
# ---------------------------------------------------------------------------
SIZE_BUCKETS = [
    ("small", "小 (<30坪)", None, 30),
    ("mid", "中 (30-45坪)", 30, 45),
    ("large", "大 (>45坪)", 45, None),
]

AGE_BUCKET_LABELS = {
    "presale": "預售",
    "new": "新成屋 (0-2年)",
    "mid_age": "3-10年",
    "old": "10年以上",
    "unknown": "未知",
}

# 總價帶（需求量分析用；單位：萬）
PRICE_BANDS = [
    ("lt1500", "<1500萬", None, 1500),
    ("1500_2000", "1500-2000萬", 1500, 2000),
    ("2000_2500", "2000-2500萬", 2000, 2500),
    ("gte2500", "2500萬+", 2500, None),
]


def size_bucket(area_ping):
    """回傳坪數分類 key（small/mid/large），area_ping 是 None 就回傳 None。"""
    if area_ping is None:
        return None
    for key, _label, lo, hi in SIZE_BUCKETS:
        if (lo is None or area_ping >= lo) and (hi is None or area_ping < hi):
            return key
    return None


def price_band(total_price_wan):
    if total_price_wan is None:
        return None
    for key, _label, lo, hi in PRICE_BANDS:
        if (lo is None or total_price_wan >= lo) and (hi is None or total_price_wan < hi):
            return key
    return None


def age_bucket_from_years(years):
    """依屋齡年數回傳分類 key（new/mid_age/old），years 是 None 就回傳 unknown。
    0-2年＝新成屋，3-10年，10年以上（>10年）。"""
    if years is None:
        return "unknown"
    if years <= 2:
        return "new"
    if years <= 10:
        return "mid_age"
    return "old"


# ---------------------------------------------------------------------------
# 預售屋備查建案：抓 fetch_buildcase.py 用
# ---------------------------------------------------------------------------
LVR_BUILDCASE_URL = "https://plvr.land.moi.gov.tw/Download?PayType=saleremark&fileName=h_lvr_buildcase.csv"
LVR_BUILDINGPERMIT_URL = "https://plvr.land.moi.gov.tw/Download?PayType=saleremark&fileName=h_lvr_buildingpermit.csv"
# 備查建案的「坐落街道」比對用道路白名單，額外加青松街（實價登錄建案資料證實在青埔特區
# 內，但原本的道路白名單漏掉，這裡先補，不動原本 config 的 ROAD_WHITELIST_COMMON
# 以免影響已經驗證過的青埔範圍數字）。
BUILDCASE_ROAD_WHITELIST_EXTRA = ["青松街"]

# 備查建案名稱 → 實價登錄 B 檔建案名稱 的人工對照表（正規化之後還是對不起來的少數案例）。
PROJECT_NAME_ALIASES = {
    "欣宇": "詠勝欣宇",
    "自由之丘": "和發自由之丘",
}

# 極少數預售建案，官方備查資料（buildcase.json）已經確認在青埔特區內（坐落街道命中道路
# 白名單），但 B 檔每一筆交易自己登記的「土地位置建物門牌」用的是白名單外的鄰近道路
# （例如只寫「OO路187號對面」），照道路白名單整個建案會被濾掉，變成「已知在青埔、卻
# 查無成交」。這裡用建案名稱直接放行這些交易，不去動主要的 ROAD_WHITELIST_COMMON（怕
# 影響到其他已驗證過的數字）。
# 和發水慕白：買賣門牌寫「文智路187號對面」（文智路不在白名單），但 buildcase 的坐落
# 街道＝「領航南路一段文發路口」，領航南路在白名單內，確認是青埔特區內的建案。
PRESALE_PROJECT_NAME_ALLOWLIST_EXTRA = ["和發水慕白"]

# 完工後戶別釋出到市場的假設：已售戶用實測的交屋後釋出率；未售戶（建商餘屋）假設交屋後
# 4 季內線性去化完（每季 1/4），這個比例可以調。
UNSOLD_RELEASE_QUARTERS = 4

# 「逾期」建案（推算交屋時間已過、官方還沒登記第1次登記）交屋時間點本來就不確定，
# 不能全部疊到單一一季，改成戶數平均攤到未來這幾季（每季 1/N）。
OVERDUE_SPREAD_QUARTERS = 4

# 一個建案最近這麼多個月內有新的預售簽約，才算「還在銷售」；超過這個天數沒有新簽約、
# 但還有未售戶，算「停售/觀望」。
STILL_SELLING_WINDOW_MONTHS = 6

# ---------------------------------------------------------------------------
# 591 重複刊登去重：同一戶被好幾個仲介重複刊登，用（社區/道路、樓層字串、坪數取到
# 0.5坪）分組，組內價格差 >3% 才當成不同戶。
# ---------------------------------------------------------------------------
UNIT_DEDUPE_PRICE_TOLERANCE = 0.03

# 樂居（leju.com.tw）人工核對的仰森待售數，純參考、不是自動抓的，要更新自己改這裡；
# 拿掉「查了幾遍」之類的個人化文字，只留日期與筆數，中性陳述。
LEJU_REFERENCE = {"count": 27, "checked_on": "2026-09-30", "note": "樂居（leju.com.tw）人工比對之仰森待售筆數，非本站自動抓取，僅供交叉參考"}

# ---------------------------------------------------------------------------
# 「價格走向」參數（compute_price_outlook.py 用）。範圍：屋齡0-3年、
# 24-35坪（不含車位）、青埔全區，不分建案——這是仰森銷售主力戶型的代表範圍，
# 用來讓「價格走向」有一個穩定、樣本夠的比較基準，不是針對特定戶別。
# ---------------------------------------------------------------------------
OUTLOOK_PARAMS = {
    "scope_age_max_years": 3,
    "scope_area_range": (24.0, 35.0),
    "absorption_window_months": 12,
    "absorption_lag_months": 2,
    "area_mix_min_n": 10,  # 建案自己的預售筆數要有這麼多筆才用建案自己的坪數結構，不然退回青埔全區比例
    "calibration_start_quarter": "2021Q3",
    "calibration_min_n": 10,
    "calibration_min_r2": 0.1,
    "projection_quarters": 8,
    "premium_index_min_n": 5,  # 季價指數樣本數要有這麼多筆才拿來當「低點/高點」判斷依據，避免單筆噪音
    # 高點區間手動指定為 2024Q3-Q4：這兩季樣本數(16、6)都過門檻，是連續兩季的高檔，
    # 2025Q2雖然單季數字更高(1.4684)但n剛好卡在門檻邊緣(n=5)、只有單季，噪音風險較高，不當高點代表。
    "premium_index_peak_quarters": ["2024Q3", "2024Q4"],
    "premium_index_2023_baseline_year": "2023",  # 預售量縮的比較基準年
    "premium_index_shrink_since_quarter": "2024Q3",  # 觀察「量縮先於價跌」的起算季
}

# ---------------------------------------------------------------------------
# 「戶別試算」通用參數（compute_estimate.py 用；全部集中在這裡，方便稽核/調整）。
# 這裡不指定任何特定戶別——viewer 在頁面上選（或點銷控表格子）任何一戶，前端用
# 這裡輸出的通用係數（同案漲幅、樓層調整斜率、開價溢價、去化速度）幫該戶試算。
# ---------------------------------------------------------------------------
ESTIMATE_PARAMS = {
    # 樓層調整迴歸：每個戶別代碼（如 A1/B3/C8）自己的預售資料做迴歸，斜率代表
    # 該戶型每差一樓、單價差多少；樣本不足時退回同棟（A/B/C）迴歸，再不足退回全案迴歸。
    "floor_fit_min_n_unit_code": 8,
    "floor_fit_min_n_building": 15,
    # 591 開價同型戶判定：跟試算戶「自己的預售坪數」比對，扣車位後坪數差在這個範圍內
    # （591 面積用估的，範圍要放寬一點）算同型；坪數差距用車位面積估計值再放寬一點。
    "cross_check_adj_area_tolerance": 1.2,
    "cross_check_raw_area_tolerance": 1.8,
    # 建議開價：樓層調整後單價的百分位數
    "suggested_pctl": 0.25,
    "suggested_range_pctls": (0.20, 0.35),
    # 議價率／要多久：「青埔類似產品」的篩選條件（跟價格走向用同一組，樣本才夠）
    "similar_product_age_max_years": 5,
    "similar_product_area_range": (24.0, 35.0),
    "similar_product_months": 12,
    # 實價登錄公告落後，最近幾個月的成交數不拿來算月均去化
    "absorption_lag_months": 2,
    "absorption_range_mult": (0.7, 1.3),
    "capital_gains_tax_note": "持有未滿 2 年出售，房地合一稅稅率 45%；2–5 年 35%；起算日與適用情形請洽代書或會計師。",
}

# ---------------------------------------------------------------------------
# 購屋負擔／房貸試算參數（compute_demand.py 用）。利率、成數、年期都是假設值，
# 不是特定銀行報價，網頁上會註明這是假設情境。
# ---------------------------------------------------------------------------
MORTGAGE_PARAMS = {
    "rate_annual": 0.022,   # 假設房貸利率（年息）
    "years": 30,
    "ltv": 0.8,             # 假設貸款成數（8成）
}

# 新增家戶轉化為新增自住需求的比例假設：新增家戶數 × 這個比例＝估計的新增自住購屋需求
# （其餘家戶成長來自租屋、與現有房產合併、或非青埔特區內購屋），這是明確標註的假設值，
# 不是實測數字。
HOUSEHOLD_TO_DEMAND_OWNERSHIP_SHARE = 0.6

# ---------------------------------------------------------------------------
# 591 租屋（rent.591.com.tw）抓取設定。若 bff 端點打不到，rental 區塊的 591 在租
# 筆數就留空、status 標記失敗，不擋掉其他計算。
# ---------------------------------------------------------------------------
RENT_591_BASE_URL = "https://bff-house.591.com.tw/v3/web/rent/list"  # 注意：租屋是 v3，跟售屋(v1)不同版
RENT_591_REGION_ID = 6
RENT_591_KEYWORDS = ["青埔", "仰森"]
RENT_591_PAGE_SIZE = 30
RENT_591_SLEEP_SEC = 0.8

# ---------------------------------------------------------------------------
# 人口（戶政司村里資料，ODRP014）確定在青埔特區內的村里。
# ---------------------------------------------------------------------------
POP_INCLUDED = [
    ("桃園市中壢區", ["青埔里", "青航里", "青園里"], "青埔里（2024年前後分割為青埔/青航/青園，加總）"),
    ("桃園市大園區", ["青山里"], "大園區青山里"),
    ("桃園市大園區", ["青峰里"], "大園區青峰里"),
]
# 候選村里：沒有可靠的特定區界圖資可以驗證「面積 70% 以上落在特定區內」，
# 為了不亂猜地理範圍，先全部排除，列在頁面上並附排除原因。
POP_EXCLUDED_CANDIDATES = [
    ("桃園市中壢區", "洽溪里"),
    ("桃園市中壢區", "芝芭里"),
    ("桃園市中壢區", "青溪里"),
    ("桃園市中壢區", "松嶺里"),
    ("桃園市中壢區", "仁德里"),
    ("桃園市大園區", "橫峰里"),
    ("桃園市大園區", "新南里"),
    ("桃園市大園區", "仁德里"),
]

# ---------------------------------------------------------------------------
# 「桃園各區比較」／「重劃區比較」用區域定義（compute_compare.py 用）。
# 桃園市13個行政區直接用「鄉鎮市區」欄位比對，不需要道路白名單，見
# TAOYUAN_DISTRICTS。這裡另外定義幾個「重劃區」（不是行政區、也不是青埔那種有
# 現成道路白名單的新市鎮），給青埔一個更像的比較對象。
#
# 每個 zone：
#   city/district：實價登錄「鄉鎮市區」比對用（新北市林口區用 file_prefix="f"，
#     其餘桃園市用 file_prefix="h"）。
#   roads：None＝整個行政區（林口）；有值＝地址子字串比對（跟 is_qingpu_address
#     同邏輯，只是換一組道路白名單）。道路清單是用實價登錄預售屋備查（B檔/備查
#     建案）的「坐落街道」實際聚類、對照新聞報導的重劃區範圍描述，交叉核對出來
#     的，不是官方地籍界線，邊界重疊或誤收/漏收的風險比青埔本身的道路白名單更高
#     （青埔的道路是新市鎮量體，路名新、幾乎不跟其他地區重複；這裡有些重劃區用
#     的是舊路名分段，例如中路重劃區的「永安路」、「大興西路三段」本身是很長的
#     幹道，只是那個路段落在重劃區邊界上）。
#   villages：(site_id, village) tuple 清單，跟 POP_INCLUDED 同格式，None 代表
#     查不到可靠對應的村里，總戶數/換手率留空、只算供給端三個數字。
#   village_note：村里對應的信心說明，寫進「怎麼算的」。
# ---------------------------------------------------------------------------
TAOYUAN_DISTRICTS = [
    "桃園區", "中壢區", "大溪區", "楊梅區", "蘆竹區", "大園區", "龜山區",
    "八德區", "龍潭區", "平鎮區", "新屋區", "觀音區", "復興區",
]

ZONES = [
    {
        "id": "qingpu",
        "name": "青埔",
        "is_qingpu": True,  # 直接沿用既有 is_qingpu_address／POP_INCLUDED，不重複定義
    },
    {
        "id": "linkou",
        "name": "林口",
        "city": "新北市",
        "district": "林口區",
        "file_prefix": "f",
        "roads": None,  # 整個行政區，不是子區域
        "villages": None,  # 整個行政區，用 ODRP014 該 site_id 全部村里加總，不是子集
        "village_note": "新北市林口區全區（整個行政區，不是重劃區子區域），戶數為該區所有村里加總。",
    },
    {
        "id": "a7",
        "name": "A7（龜山）",
        "city": "桃園市",
        "district": "龜山區",
        "file_prefix": "h",
        "roads": [
            "文化一路", "文化二路", "文化三路", "文化七路", "文化東路", "文化村",
            "文桃路", "文青路", "文青二路", "文達路", "文禾路", "文光街", "文康街",
            "文三一街", "文三二街",
            "樂善一路", "樂善二路", "樂善三路", "樂學一路", "樂學二路", "樂學三路", "樂學路",
            "樂安街", "樂安路", "牛角坡路", "大湖一路", "南林路", "華亞三路", "文德路",
            "忠義路二段", "興華一街", "興華二街", "興華五街",
            "長慶一街", "長慶二街", "長慶三街", "新興街", "光安街", "光明街", "育英街",
        ],
        "villages": [("桃園市龜山區", ["樂善里", "文化里"])],
        "village_note": "官方報導稱A7重劃區涵蓋龜山樂善里、文化里及「部分」長庚里；長庚里只有一部分落在範圍內、比例不明，這裡不計入長庚里，總戶數會偏低估。",
    },
    {
        "id": "xiaoguixi",
        "name": "小檜溪",
        "city": "桃園市",
        "district": "桃園區",
        "file_prefix": "h",
        "roads": [
            "青溪一路", "青溪二路", "青溪三路", "朝陽街", "中央街", "日光路",
            "民光東路", "春日路", "三民路二段",
        ],
        "villages": [("桃園市桃園區", ["青溪里"])],
        "village_note": "小檜溪重劃區的官方行政區即「青溪里」（故又稱青溪特區），村里對行政邊界信心較高。",
    },
    {
        "id": "zhonglu",
        "name": "中路",
        "city": "桃園市",
        "district": "桃園區",
        "file_prefix": "h",
        "roads": [
            "正光路", "正光二街", "力行路", "慈文路", "慈愛街", "慈愛一街",
            "文中路", "文中一路", "文中二路", "文中東路", "忠一路",
            "永安路", "大興西路三段", "延壽街", "如意十五街", "溫州一路",
        ],
        "villages": [("桃園市桃園區", ["中路里"])],
        "village_note": "中路重劃區的官方行政區即「中路里」，村里對行政邊界信心較高；「永安路」「大興西路三段」是重劃區邊界幹道，路段本身比重劃區略長，可能小幅高估。",
    },
    {
        "id": "jingguo",
        "name": "經國",
        "city": "桃園市",
        "district": "桃園區",
        "file_prefix": "h",
        "roads": [
            "經國一路", "經國二路", "水岸一街", "水岸二街", "水汴一路",
            "有恆路", "幸福路", "新埔一街",
        ],
        "villages": None,
        "village_note": "經國重劃區規劃656公頃、分四期開發，橫跨多個里且各里只有部分面積落在範圍內，找不到可靠對應的單一村里，總戶數／換手率留空，只算供給端三個數字（一年轉手、未完工、近一年完工）。",
    },
    {
        "id": "yiwen",
        "name": "藝文特區",
        "city": "桃園市",
        "district": "桃園區",
        "file_prefix": "h",
        "roads": [
            "同德一街", "同德二街", "同德五街", "新埔六街", "中埔一街", "中埔二街",
            "莊敬路二段", "同安街", "寶慶路",
        ],
        "villages": [("桃園市桃園區", ["藝文里"])],
        "village_note": "藝文特區跟經國重劃區地理相鄰但是不同世代的重劃區（藝文特區早、面積小；經國重劃區晚、面積大），這裡分成兩個獨立列。2026年3月同安里分割出「藝文里」，範圍即官方所稱的藝文特區廣義範圍，村里對行政邊界信心較高。",
    },
]
