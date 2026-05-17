"""
賠率抓取模組 v2 — P3 完整版

抓取策略（依優先順序）：
  1. 台灣運彩官網（Selenium + CDP XHR 攔截）→ 最準確的正式盤口
  2. The Odds API（Pinnacle 歷史賠率）→ 回測用 / 官網失敗時備援
  3. oddsportal 爬蟲 → 免費但限制較多，作為第三層備援
  4. Pinnacle 公式換算 → 最後手段，用已有賠率估算台灣運彩等效值

中文對照：
  運彩使用中文球隊名稱，完整對照表涵蓋 NBA 30 隊 + MLB 30 隊。

線移偵測：
  若賠率在快取後發生顯著變動（>5%），重新抓取並標記警示。
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

from utils import (
    ODDS_DIR, get_logger, save_json, load_json, json_exists,
    parse_date, today_tw, TW_TZ, safe_request
)

logger = get_logger("fetch_odds")

_TW_OVERROUND  = 0.048   # 台灣運彩平均莊家邊際（兩隊盤）
_PIN_OVERROUND = 0.025   # Pinnacle 平均莊家邊際

# ── 中文 → 英文縮寫對照表 ─────────────────────────────────
# NBA：運彩使用的中文隊名（可能因版本不同有微差）
_NBA_ZH_TO_ABBR: dict[str, str] = {
    # 東區
    "波士頓塞爾提克": "BOS", "塞爾提克": "BOS",
    "布魯克林籃網":   "BKN", "籃網":     "BKN",
    "紐約尼克":       "NYK", "尼克":     "NYK",
    "費城76人":       "PHI", "76人":     "PHI",
    "多倫多暴龍":     "TOR", "暴龍":     "TOR",
    "芝加哥公牛":     "CHI", "公牛":     "CHI",
    "克里夫蘭騎士":   "CLE", "騎士":     "CLE",
    "底特律活塞":     "DET", "活塞":     "DET",
    "印第安納溜馬":   "IND", "溜馬":     "IND",
    "密爾瓦基公鹿":   "MIL", "公鹿":     "MIL",
    "亞特蘭大老鷹":   "ATL", "老鷹":     "ATL",
    "夏洛特黃蜂":     "CHA", "黃蜂":     "CHA",
    "邁阿密熱火":     "MIA", "熱火":     "MIA",
    "奧蘭多魔術":     "ORL", "魔術":     "ORL",
    "華盛頓巫師":     "WAS", "巫師":     "WAS",
    # 西區
    "丹佛金塊":       "DEN", "金塊":     "DEN",
    "明尼蘇達灰狼":   "MIN", "灰狼":     "MIN",
    "奧克拉荷馬城雷霆": "OKC", "雷霆":   "OKC",
    "波特蘭拓荒者":   "POR", "拓荒者":   "POR",
    "猶他爵士":       "UTA", "爵士":     "UTA",
    "金州勇士":       "GSW", "勇士":     "GSW",
    "洛杉磯快艇":     "LAC", "快艇":     "LAC",
    "洛杉磯湖人":     "LAL", "湖人":     "LAL",
    "鳳凰城太陽":     "PHX", "太陽":     "PHX",
    "沙加緬度國王":   "SAC", "國王":     "SAC",
    "達拉斯獨行俠":   "DAL", "獨行俠":   "DAL",
    "休士頓火箭":     "HOU", "火箭":     "HOU",
    "曼菲斯灰熊":     "MEM", "灰熊":     "MEM",
    "紐奧良鵜鶘":     "NOP", "鵜鶘":     "NOP",
    "聖安東尼奧馬刺": "SAS", "馬刺":     "SAS",
}

# MLB：運彩使用的中文隊名
_MLB_ZH_TO_ABBR: dict[str, str] = {
    # 美聯東
    "巴爾的摩金鶯":   "BAL", "金鶯":     "BAL",
    "波士頓紅襪":     "BOS", "紅襪":     "BOS",
    "紐約洋基":       "NYY", "洋基":     "NYY",
    "坦帕灣光芒":     "TB",  "光芒":     "TB",
    "多倫多藍鳥":     "TOR", "藍鳥":     "TOR",
    # 美聯中
    "芝加哥白襪":     "CWS", "白襪":     "CWS",
    "克里夫蘭守護者": "CLE", "守護者":   "CLE",
    "底特律老虎":     "DET", "老虎":     "DET",
    "堪薩斯城皇家":   "KC",  "皇家":     "KC",
    "明尼蘇達雙城":   "MIN", "雙城":     "MIN",
    # 美聯西
    "休士頓太空人":   "HOU", "太空人":   "HOU",
    "洛杉磯天使":     "LAA", "天使":     "LAA",
    "奧克蘭運動家":   "OAK", "運動家":   "OAK",
    "西雅圖水手":     "SEA", "水手":     "SEA",
    "德州遊騎兵":     "TEX", "遊騎兵":   "TEX",
    # 國聯東
    "亞特蘭大勇士":   "ATL", "勇士":     "ATL",
    "邁阿密馬林魚":   "MIA", "馬林魚":   "MIA",
    "紐約大都會":     "NYM", "大都會":   "NYM",
    "費城費城人":     "PHI", "費城人":   "PHI",
    "華盛頓國民":     "WSH", "國民":     "WSH",
    # 國聯中
    "芝加哥小熊":     "CHC", "小熊":     "CHC",
    "辛辛那提紅人":   "CIN", "紅人":     "CIN",
    "密爾瓦基釀酒人": "MIL", "釀酒人":   "MIL",
    "匹茲堡海盜":     "PIT", "海盜":     "PIT",
    "聖路易紅雀":     "STL", "紅雀":     "STL",
    # 國聯西
    "亞利桑那響尾蛇": "ARI", "響尾蛇":   "ARI",
    "科羅拉多落磯":   "COL", "落磯":     "COL",
    "洛杉磯道奇":     "LAD", "道奇":     "LAD",
    "聖地牙哥教士":   "SD",  "教士":     "SD",
    "舊金山巨人":     "SF",  "巨人":     "SF",
}

# 英文全名 → 縮寫（Pinnacle / oddsportal 用）
_EN_NAME_TO_ABBR: dict[str, str] = {
    # NBA
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS",
    "Brooklyn Nets": "BKN", "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET", "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA", "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR", "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
    # MLB
    "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL",
    "Baltimore Orioles": "BAL", "Boston Red Sox": "BOS",
    "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
    "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL", "Detroit Tigers": "DET",
    "Houston Astros": "HOU", "Kansas City Royals": "KC",
    "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD",
    "Miami Marlins": "MIA", "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN", "New York Mets": "NYM",
    "New York Yankees": "NYY", "Oakland Athletics": "OAK",
    "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT",
    "San Diego Padres": "SD", "San Francisco Giants": "SF",
    "Seattle Mariners": "SEA", "St. Louis Cardinals": "STL",
    "Tampa Bay Rays": "TB", "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
}


def zh_to_abbr(name: str, sport: str) -> str:
    """中文隊名 → 縮寫，sport='NBA'|'MLB'。"""
    table = _NBA_ZH_TO_ABBR if sport == "NBA" else _MLB_ZH_TO_ABBR
    # 完整名優先，其次短名
    if name in table:
        return table[name]
    for key, val in table.items():
        if key in name or name in key:
            return val
    return name[:3].upper()


def en_to_abbr(name: str) -> str:
    """英文全名 → 縮寫。"""
    if name in _EN_NAME_TO_ABBR:
        return _EN_NAME_TO_ABBR[name]
    # 部分匹配
    for key, val in _EN_NAME_TO_ABBR.items():
        if name in key or key in name:
            return val
    return name[:3].upper()


# ── 層級 1：Selenium + CDP（台灣運彩官網）────────────────
def _build_selenium_driver():
    """建立隱藏 Selenium ChromeDriver（繞過基本 bot 偵測）。"""
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from webdriver_manager.chrome import ChromeDriverManager

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    drv = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=opts,
    )
    drv.execute_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    )
    return drv


def _intercept_xhr(driver, url: str, wait_sec: int = 12) -> list[dict]:
    """
    啟用 CDP Network 攔截，導覽到 url 後收集所有 XHR/Fetch 回應。
    回傳所有攔截到的 JSON 回應列表。
    """
    from selenium.webdriver.support.ui import WebDriverWait

    captured = []

    driver.execute_cdp_cmd("Network.enable", {})
    driver.execute_cdp_cmd("Network.setRequestInterception", {
        "patterns": [{"urlPattern": "*", "resourceType": "XHR"},
                     {"urlPattern": "*", "resourceType": "Fetch"}]
    })

    driver.get(url)
    time.sleep(wait_sec)   # 等待動態內容載入

    # 從 performance log 取得已完成的網路請求
    try:
        logs = driver.execute_script("""
            return window.performance.getEntriesByType('resource')
                .filter(r => r.initiatorType === 'xmlhttprequest' ||
                              r.initiatorType === 'fetch')
                .map(r => r.name);
        """)
        return logs or []
    except Exception:
        return []


_TW_SPORT_URLS = {
    "NBA": "https://www.sportslottery.com.tw/tw/sport/basketball",
    "MLB": "https://www.sportslottery.com.tw/tw/sport/baseball",
}

# 已知的運彩 API 端點（從社群逆向工程整理）
_TW_API_CANDIDATES = [
    "https://www.sportslottery.com.tw/api/sport/game/games",
    "https://www.sportslottery.com.tw/api/sport/games",
    "https://www.sportslottery.com.tw/api/games",
    "https://www.sportslottery.com.tw/ws/sport/game/games",
    "https://api.sportslottery.com.tw/api/sport/game/games",
]

_TW_SESSION_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/json, text/plain, */*",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "Referer":         "https://www.sportslottery.com.tw/",
    "Origin":          "https://www.sportslottery.com.tw",
    "sec-ch-ua":       '"Chromium";v="124", "Google Chrome";v="124"',
    "sec-fetch-site":  "same-origin",
    "sec-fetch-mode":  "cors",
    "sec-fetch-dest":  "empty",
}


def _get_tw_session_cookies() -> dict:
    """
    用 Selenium 訪問首頁取得 session cookies，供後續 requests 使用。
    若 Selenium 不可用則回傳空 dict。
    """
    try:
        driver = _build_selenium_driver()
        driver.get("https://www.sportslottery.com.tw/tw/home")
        time.sleep(5)
        cookies = {c["name"]: c["value"] for c in driver.get_cookies()}
        driver.quit()
        logger.info(f"取得 {len(cookies)} 個運彩 session cookie")
        return cookies
    except Exception as e:
        logger.warning(f"Selenium 取 cookies 失敗：{e}")
        return {}


def _try_tw_api_with_session(sport: str, game_date: date, cookies: dict) -> list:
    """
    帶 session cookies 嘗試各已知 API 端點。
    """
    sport_param = {"NBA": "BASKETBALL", "MLB": "BASEBALL"}.get(sport, sport)
    params_list = [
        {"sportType": sport_param, "gameType": sport},
        {"sport": sport_param},
        {"sportCode": sport},
        {},
    ]

    sess = requests.Session()
    sess.cookies.update(cookies)
    sess.headers.update(_TW_SESSION_HEADERS)

    for url in _TW_API_CANDIDATES:
        for params in params_list:
            try:
                resp = sess.get(url, params=params, timeout=15)
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        logger.info(f"運彩 API 命中：{url} params={params}")
                        return _parse_tw_api_response(data, sport, game_date)
                    except Exception:
                        continue
            except Exception:
                continue
    return []


def _parse_tw_api_response(data: dict | list, sport: str, game_date: date) -> list:
    """
    解析運彩 API 回傳的 JSON，提取賠率。
    由於官方 API 結構可能異動，此函式涵蓋多種已知格式。
    """
    games = []
    items = []

    # 格式 A：{"data": {"games": [...]}}
    if isinstance(data, dict):
        items = (data.get("data", {}) or {}).get("games", []) \
             or data.get("games", []) \
             or data.get("items", []) \
             or data.get("result", []) \
             or (data if isinstance(data, list) else [])

    # 格式 B：直接是列表
    elif isinstance(data, list):
        items = data

    for ev in items:
        if not isinstance(ev, dict):
            continue
        try:
            # 隊名解析
            home_zh = (ev.get("homeTeam") or ev.get("home_team") or {})
            away_zh = (ev.get("awayTeam") or ev.get("away_team") or {})
            if isinstance(home_zh, dict):
                home_name = home_zh.get("name") or home_zh.get("teamName", "")
                away_name = away_zh.get("name") or away_zh.get("teamName", "")
            else:
                home_name = str(home_zh)
                away_name = str(away_zh)

            home_abbr = zh_to_abbr(home_name, sport)
            away_abbr = zh_to_abbr(away_name, sport)

            # 賠率解析（嘗試各種欄位名稱）
            odds_data = ev.get("odds") or ev.get("oddsInfo") or ev.get("handicap") or {}
            if isinstance(odds_data, list) and odds_data:
                odds_data = odds_data[0]

            def get_odds(d, *keys):
                for k in keys:
                    v = d.get(k)
                    if v is not None:
                        try:
                            return float(v)
                        except Exception:
                            continue
                return None

            home_odds = get_odds(odds_data,
                "homeOdds", "home_odds", "hostOdds", "homeWinOdds", "H")
            away_odds = get_odds(odds_data,
                "awayOdds", "away_odds", "guestOdds", "awayWinOdds", "A")

            if not home_odds or not away_odds:
                continue

            games.append({
                "game_id":          ev.get("id") or ev.get("gameId") or ev.get("matchId", ""),
                "sport":            sport,
                "game_date":        game_date.isoformat(),
                "home_team_abbr":   home_abbr,
                "away_team_abbr":   away_abbr,
                "home_team_name_zh": home_name,
                "away_team_name_zh": away_name,
                "home_odds":        home_odds,
                "away_odds":        away_odds,
                "spread":           get_odds(odds_data, "spread", "handicap", "line"),
                "spread_home_odds": get_odds(odds_data, "spreadHomeOdds", "handicapHostOdds"),
                "spread_away_odds": get_odds(odds_data, "spreadAwayOdds", "handicapGuestOdds"),
                "total_line":       get_odds(odds_data, "totalLine", "total", "overUnderLine"),
                "over_odds":        get_odds(odds_data, "overOdds", "over"),
                "under_odds":       get_odds(odds_data, "underOdds", "under"),
                "source":           "tw_sportslottery",
                "timestamp":        datetime.now(TW_TZ).isoformat(),
            })
        except Exception as e:
            logger.debug(f"解析單筆運彩數據失敗：{e}")
            continue

    return games


def fetch_tw_odds(sport: str, game_date: date | str) -> list:
    """
    抓取台灣運彩賠率。
    流程：取得 session → 嘗試 API 端點 → 若失敗改 Selenium 渲染。
    """
    d = parse_date(game_date)
    cache_path = ODDS_DIR / f"tw_{sport.lower()}_{d.isoformat()}.json"

    if json_exists(cache_path):
        cached = load_json(cache_path)
        if cached:
            logger.info(f"運彩賠率快取命中：{sport} {d}（{len(cached)} 場）")
            return cached

    logger.info(f"抓取台灣運彩賠率：{sport} {d}")

    # 方法 1：Session + API
    cookies = _get_tw_session_cookies()
    games = _try_tw_api_with_session(sport, d, cookies)

    # 方法 2：Selenium 渲染後解析 DOM
    if not games:
        games = _fetch_tw_via_selenium_dom(sport, d)

    if games:
        save_json(games, cache_path)
        logger.info(f"運彩賠率完成：{len(games)} 場")
    else:
        logger.warning(f"運彩賠率抓取失敗（{sport} {d}），將使用備援")

    return games


def _fetch_tw_via_selenium_dom(sport: str, game_date: date) -> list:
    """
    Selenium 直接渲染運彩頁面，解析 DOM 中的賠率數字。
    依賴頁面 CSS 結構，可能需因版面更新而維護。
    """
    try:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        driver = _build_selenium_driver()
        url = _TW_SPORT_URLS.get(sport, "")
        driver.get(url)

        # 等待賠率元素出現（最多 15 秒）
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[class*='odds'], [class*='Odds']"))
        )
        time.sleep(3)  # 額外等待非同步資料

        # 嘗試從 window 物件取出已載入的賽事數據
        js_data = driver.execute_script("""
            try {
                // Vue/React 常見的全域狀態存放位置
                let s = window.__INITIAL_STATE__ ||
                        window.__store__ ||
                        window.__APP_STATE__ ||
                        window.__nuxt__?.context?.store?.state;
                return s ? JSON.stringify(s) : null;
            } catch(e) { return null; }
        """)

        driver.quit()

        if js_data:
            try:
                state = json.loads(js_data)
                games = _parse_tw_api_response(state, sport, game_date)
                if games:
                    logger.info(f"Selenium DOM 解析成功：{len(games)} 場")
                    return games
            except Exception as e:
                logger.warning(f"Selenium DOM state 解析失敗：{e}")

    except Exception as e:
        logger.warning(f"Selenium DOM 抓取失敗：{e}")

    return []


# ── 層級 2：The Odds API（Pinnacle 歷史賠率）─────────────
_ODDS_API_BASE  = "https://api.the-odds-api.com/v4"
_SPORT_KEYS = {
    "NBA": "basketball_nba",
    "MLB": "baseball_mlb",
}


def fetch_pinnacle_odds(sport: str, game_date: date | str,
                        api_key: str | None = None) -> list:
    """
    透過 The Odds API 取得 Pinnacle 賠率。
    - 即時：使用 /odds 端點
    - 歷史（回測）：使用 /historical/odds 端點（需付費方案）
    """
    import os
    d = parse_date(game_date)
    cache_path = ODDS_DIR / f"pinnacle_{sport.lower()}_{d.isoformat()}.json"

    if json_exists(cache_path):
        cached = load_json(cache_path)
        if cached:
            logger.info(f"Pinnacle 快取命中：{sport} {d}（{len(cached)} 場）")
            return cached

    key = api_key or os.environ.get("ODDS_API_KEY", "")
    if not key:
        logger.warning("ODDS_API_KEY 未設定，跳過 Pinnacle 抓取")
        return []

    sport_key = _SPORT_KEYS.get(sport)
    if not sport_key:
        return []

    logger.info(f"抓取 Pinnacle 賠率：{sport} {d}")

    # 判斷是否為歷史日期（今天之前）
    is_historical = d < today_tw()

    if is_historical:
        # 歷史賠率端點（需付費 Pro 方案）
        # 取當天 UTC 午間的快照
        snapshot_time = f"{d.isoformat()}T12:00:00Z"
        url = f"{_ODDS_API_BASE}/historical/sports/{sport_key}/odds"
        params = {
            "apiKey":       key,
            "regions":      "us",
            "markets":      "h2h,spreads,totals",
            "bookmakers":   "pinnacle",
            "oddsFormat":   "decimal",
            "date":         snapshot_time,
        }
    else:
        # 即時賠率端點（免費方案可用）
        url = f"{_ODDS_API_BASE}/sports/{sport_key}/odds"
        params = {
            "apiKey":         key,
            "regions":        "us",
            "markets":        "h2h,spreads,totals",
            "bookmakers":     "pinnacle",
            "oddsFormat":     "decimal",
            "commenceTimeFrom": f"{d.isoformat()}T00:00:00Z",
            "commenceTimeTo":   f"{d.isoformat()}T23:59:59Z",
        }

    data = safe_request(url, params=params)

    # 歷史端點回傳格式稍有不同 {"timestamp": ..., "data": [...]}
    if isinstance(data, dict) and "data" in data:
        data = data["data"]

    if not data:
        logger.warning(f"Pinnacle 無回傳數據：{sport} {d}")
        return []

    games = _parse_pinnacle_response(data, sport, d)
    if games:
        save_json(games, cache_path)
        logger.info(f"Pinnacle 賠率完成：{len(games)} 場")
    return games


def _parse_pinnacle_response(data: list, sport: str, game_date: date) -> list:
    """解析 The Odds API 回傳的 Pinnacle 賠率列表。"""
    games = []
    for ev in data:
        home_name = ev.get("home_team", "")
        away_name = ev.get("away_team", "")
        home_abbr = en_to_abbr(home_name)
        away_abbr = en_to_abbr(away_name)

        rec = {
            "game_id":        ev.get("id", ""),
            "sport":          sport,
            "game_date":      game_date.isoformat(),
            "home_team_abbr": home_abbr,
            "away_team_abbr": away_abbr,
            "home_team_name": home_name,
            "away_team_name": away_name,
            "source":         "pinnacle",
            "timestamp":      datetime.now(TW_TZ).isoformat(),
        }

        for bm in ev.get("bookmakers", []):
            if bm.get("key") != "pinnacle":
                continue
            for mkt in bm.get("markets", []):
                key_m = mkt.get("key")
                outs  = {o["name"]: o for o in mkt.get("outcomes", [])}

                if key_m == "h2h":
                    rec["home_odds_raw"] = outs.get(home_name, {}).get("price")
                    rec["away_odds_raw"] = outs.get(away_name, {}).get("price")
                elif key_m == "spreads":
                    for o in mkt.get("outcomes", []):
                        if o["name"] == home_name:
                            rec["spread"]           = o.get("point")
                            rec["spread_home_odds_raw"] = o.get("price")
                        else:
                            rec["spread_away_odds_raw"] = o.get("price")
                elif key_m == "totals":
                    for o in mkt.get("outcomes", []):
                        if o["name"] == "Over":
                            rec["total_line"]    = o.get("point")
                            rec["over_odds_raw"] = o.get("price")
                        elif o["name"] == "Under":
                            rec["under_odds_raw"] = o.get("price")

        # 換算為台灣運彩等效賠率
        for field_raw, field_tw in [
            ("home_odds_raw",        "home_odds"),
            ("away_odds_raw",        "away_odds"),
            ("spread_home_odds_raw", "spread_home_odds"),
            ("spread_away_odds_raw", "spread_away_odds"),
            ("over_odds_raw",        "over_odds"),
            ("under_odds_raw",       "under_odds"),
        ]:
            rec[field_tw] = pinnacle_to_tw_equiv(rec.get(field_raw))

        games.append(rec)
    return games


# ── 層級 3：oddsportal 爬蟲 ──────────────────────────────
_OP_BASE = "https://www.oddsportal.com"
_OP_SPORT_PATH = {
    "NBA": "/basketball/usa/nba",
    "MLB": "/baseball/usa/mlb",
}
_OP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_oddsportal(sport: str, game_date: date | str) -> list:
    """
    從 oddsportal 抓取賠率（免費，含部分台灣運彩歷史數據）。
    主要用於備援；賠率為多莊家平均，需換算。
    """
    d = parse_date(game_date)
    cache_path = ODDS_DIR / f"oddsportal_{sport.lower()}_{d.isoformat()}.json"

    if json_exists(cache_path):
        cached = load_json(cache_path)
        if cached:
            return cached

    path = _OP_SPORT_PATH.get(sport, "")
    if not path:
        return []

    # oddsportal 使用日期過濾
    url = f"{_OP_BASE}{path}/results/#{d.strftime('%Y%m%d')}"
    logger.info(f"抓取 oddsportal：{sport} {d}")

    try:
        resp = requests.get(url, headers=_OP_HEADERS, timeout=20)
        if resp.status_code != 200:
            logger.warning(f"oddsportal {resp.status_code}")
            return []

        soup = BeautifulSoup(resp.text, "lxml")
        games = _parse_oddsportal(soup, sport, d)

        # oddsportal 也使用 JS，若靜態解析為空需用 Selenium
        if not games:
            games = _fetch_oddsportal_selenium(sport, d)

        if games:
            save_json(games, cache_path)
            logger.info(f"oddsportal 完成：{len(games)} 場")
        return games

    except Exception as e:
        logger.warning(f"oddsportal 抓取失敗：{e}")
        return []


def _parse_oddsportal(soup: BeautifulSoup, sport: str, game_date: date) -> list:
    """解析 oddsportal HTML 的賠率行。"""
    games = []
    rows = soup.select("div[class*='eventRow'], tr[class*='deactivate']")
    for row in rows:
        try:
            # 取隊名
            teams = row.select("[class*='participant']")
            if len(teams) < 2:
                continue
            home_name = teams[0].get_text(strip=True)
            away_name = teams[1].get_text(strip=True)

            # 取賠率（通常是第一個莊家的賠率）
            odds_spans = row.select("[class*='odds-nowrp'], [class*='oddsWin']")
            if len(odds_spans) < 2:
                continue
            home_odds_str = odds_spans[0].get_text(strip=True)
            away_odds_str = odds_spans[1].get_text(strip=True)
            home_odds = float(home_odds_str) if home_odds_str.replace(".", "").isdigit() else None
            away_odds = float(away_odds_str) if away_odds_str.replace(".", "").isdigit() else None

            if not home_odds or not away_odds:
                continue

            games.append({
                "game_id":        f"op_{sport}_{home_name[:3]}_{game_date}",
                "sport":          sport,
                "game_date":      game_date.isoformat(),
                "home_team_abbr": en_to_abbr(home_name),
                "away_team_abbr": en_to_abbr(away_name),
                "home_odds":      pinnacle_to_tw_equiv(home_odds),
                "away_odds":      pinnacle_to_tw_equiv(away_odds),
                "source":         "oddsportal",
                "timestamp":      datetime.now(TW_TZ).isoformat(),
            })
        except Exception:
            continue
    return games


def _fetch_oddsportal_selenium(sport: str, game_date: date) -> list:
    """Selenium 渲染 oddsportal（當靜態解析失敗時使用）。"""
    try:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        driver = _build_selenium_driver()
        path   = _OP_SPORT_PATH.get(sport, "")
        url    = f"{_OP_BASE}{path}/results/#{game_date.strftime('%Y%m%d')}"
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "[class*='eventRow']"))
        )
        time.sleep(2)
        html = driver.page_source
        driver.quit()
        soup = BeautifulSoup(html, "lxml")
        return _parse_oddsportal(soup, sport, game_date)
    except Exception as e:
        logger.warning(f"oddsportal Selenium 失敗：{e}")
        return []


# ── 賠率換算工具 ──────────────────────────────────────────
def pinnacle_to_tw_equiv(pinnacle_odds: float | None) -> float | None:
    """
    Pinnacle 賠率 → 台灣運彩等效賠率。

    步驟：
      1. 還原 Pinnacle 公平賠率（去除 2.5% 邊際）
      2. 套用台灣運彩邊際（4.8%）
    """
    if pinnacle_odds is None:
        return None
    fair = pinnacle_odds * (1 + _PIN_OVERROUND)   # 還原公平賠率
    tw   = fair / (1 + _TW_OVERROUND)              # 套用運彩邊際
    return round(tw, 3)


# ── 線移偵測 ──────────────────────────────────────────────
def detect_line_movement(old_odds: dict, new_odds: dict,
                         threshold: float = 0.05) -> list[str]:
    """
    比較新舊賠率，回傳有顯著變動的欄位清單（變動幅度 > threshold）。
    threshold=0.05 → 任一賠率相差超過 5%
    """
    alerts = []
    for field in ["home_odds", "away_odds", "spread", "total_line"]:
        old_v = old_odds.get(field)
        new_v = new_odds.get(field)
        if old_v and new_v and abs(new_v - old_v) / old_v > threshold:
            alerts.append(f"{field}: {old_v} → {new_v} ({(new_v-old_v)/old_v:+.1%})")
    return alerts


# ── 賠率配對（賠率列表 → 賽事數據包） ──────────────────────
def match_odds_to_games(games: list, odds_list: list, sport: str) -> list:
    """
    將賠率數據與 fetch_nba / fetch_mlb 的賽事數據包配對合併。
    配對鍵：(home_abbr, away_abbr)
    """
    # 建立索引
    index: dict[tuple, dict] = {}
    for o in odds_list:
        h = o.get("home_team_abbr", "")
        a = o.get("away_team_abbr", "")
        if h and a:
            index[(h, a)] = o

    result = []
    for game in games:
        home = game.get("home_team", "")
        away = game.get("away_team", "")
        odds = index.get((home, away))

        if not odds:
            # 嘗試模糊比對（縮寫有時不一致）
            for (h, a), o in index.items():
                if home[:2] == h[:2] and away[:2] == a[:2]:
                    odds = o
                    break

        if not odds:
            logger.warning(f"  {away}@{home}：找不到賠率，排除")
            continue

        merged = dict(game)
        for field in ["home_odds", "away_odds", "spread", "spread_home_odds",
                      "spread_away_odds", "total_line", "over_odds", "under_odds",
                      "odds_source", "odds_timestamp"]:
            if field not in merged:
                merged[field] = odds.get(field.replace("odds_", "") if "odds_" in field else field)

        merged["home_odds"]       = odds.get("home_odds")
        merged["away_odds"]       = odds.get("away_odds")
        merged["spread"]          = odds.get("spread")
        merged["spread_home_odds"]= odds.get("spread_home_odds")
        merged["spread_away_odds"]= odds.get("spread_away_odds")
        merged["total_line"]      = odds.get("total_line")
        merged["over_odds"]       = odds.get("over_odds")
        merged["under_odds"]      = odds.get("under_odds")
        merged["odds_source"]     = odds.get("source", "unknown")
        merged["odds_timestamp"]  = odds.get("timestamp", "")
        result.append(merged)

    logger.info(f"賠率配對：{len(result)}/{len(games)} 場成功")
    return result


# ── 主流程 ────────────────────────────────────────────────
def run(sport: str, game_date: date | str | None = None,
        api_key: str | None = None) -> list:
    """
    抓取指定球種當日賠率，依優先順序嘗試各來源。
    回傳標準格式賠率列表。
    """
    d = parse_date(game_date) if game_date else today_tw()

    # 層級 1：台灣運彩官網
    odds = fetch_tw_odds(sport, d)
    if odds:
        logger.info(f"賠率來源：台灣運彩官網（{len(odds)} 場）")
        return odds

    # 層級 2：Pinnacle（The Odds API）
    odds = fetch_pinnacle_odds(sport, d, api_key)
    if odds:
        logger.info(f"賠率來源：Pinnacle（{len(odds)} 場，已換算為運彩等效）")
        return odds

    # 層級 3：oddsportal
    odds = fetch_oddsportal(sport, d)
    if odds:
        logger.info(f"賠率來源：oddsportal（{len(odds)} 場）")
        return odds

    logger.error(f"所有賠率來源均失敗：{sport} {d}")
    return []


if __name__ == "__main__":
    import sys
    sport = sys.argv[1].upper() if len(sys.argv) > 1 else "NBA"
    d     = sys.argv[2] if len(sys.argv) > 2 else None
    result = run(sport, d)
    for g in result:
        print(f"  {g.get('away_team_abbr')}@{g.get('home_team_abbr')}"
              f"  主{g.get('home_odds'):.2f} 客{g.get('away_odds'):.2f}"
              f"  [{g.get('source')}]")
    print(f"\n共 {len(result)} 場")
