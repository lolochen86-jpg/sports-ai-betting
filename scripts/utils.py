"""
共用工具模組：日期處理、日誌、資料驗證、檔案 I/O
所有模組必須透過 as_of_date 限制查詢範圍，防止未來數據洩漏。
"""

import json
import logging
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import pytz

# ── 路徑設定 ──────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent.parent
DATA_DIR = ROOT_DIR / "data"
NBA_DIR  = DATA_DIR / "nba"
MLB_DIR  = DATA_DIR / "mlb"
ODDS_DIR = DATA_DIR / "odds"
BACKTEST_DIR = DATA_DIR / "backtest"

TW_TZ = pytz.timezone("Asia/Taipei")
ET_TZ = pytz.timezone("America/New_York")


# ── 日誌設定 ──────────────────────────────────────────────
def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                                datefmt="%Y-%m-%d %H:%M:%S")
        handler.setFormatter(fmt)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


# ── 日期工具 ──────────────────────────────────────────────
def today_tw() -> date:
    """台灣時間今天日期。"""
    return datetime.now(TW_TZ).date()


def parse_date(d: str | date) -> date:
    if isinstance(d, date):
        return d
    return datetime.strptime(d, "%Y-%m-%d").date()


def date_range(start: str | date, end: str | date):
    """產生 [start, end] 之間每一天的 date 物件。"""
    s = parse_date(start)
    e = parse_date(end)
    while s <= e:
        yield s
        s += timedelta(days=1)


def nba_season_str(d: date) -> str:
    """
    將日期轉為 NBA 賽季字串，例如 2026-04-01 → '2025-26'。
    NBA 賽季從每年 10 月開始。
    """
    year = d.year if d.month >= 10 else d.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def mlb_season_year(d: date) -> int:
    """MLB 賽季年份，通常等於日曆年。"""
    return d.year


# ── 檔案 I/O ──────────────────────────────────────────────
def save_json(data: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def load_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def json_exists(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


# ── 快取裝飾器（以日期為 key，避免重複抓取）────────────────
def daily_cache(cache_dir: Path, filename_template: str):
    """
    用法：@daily_cache(NBA_DIR, "team_stats_{date}.json")
    若當天快取存在則直接回傳，否則執行函式並存檔。
    """
    def decorator(func):
        def wrapper(*args, as_of_date: date | str | None = None, **kwargs):
            d = parse_date(as_of_date) if as_of_date else today_tw()
            cache_path = cache_dir / filename_template.format(date=d.isoformat())
            if json_exists(cache_path):
                get_logger("cache").info(f"快取命中：{cache_path.name}")
                return load_json(cache_path)
            result = func(*args, as_of_date=d, **kwargs)
            if result is not None:
                save_json(result, cache_path)
            return result
        return wrapper
    return decorator


# ── API 請求工具 ──────────────────────────────────────────
def safe_request(url: str, params: dict = None, headers: dict = None,
                 retries: int = 3, backoff: float = 2.0) -> Optional[dict]:
    """帶重試與退避的 GET 請求，回傳 JSON dict 或 None。"""
    import requests
    logger = get_logger("http")
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=20)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            wait = backoff ** attempt
            logger.warning(f"請求失敗（第 {attempt+1} 次）：{e}，{wait:.0f}s 後重試")
            time.sleep(wait)
    logger.error(f"請求失敗，已放棄：{url}")
    return None


# ── 數據完整性驗證 ─────────────────────────────────────────
NBA_REQUIRED_FIELDS = [
    "game_id", "game_date", "home_team", "away_team",
    "home_elo", "away_elo",
    "home_ortg", "home_drtg", "home_netrtg", "home_pace",
    "away_ortg", "away_drtg", "away_netrtg", "away_pace",
    "home_win_pct_l10", "away_win_pct_l10",
    "home_season_win_pct", "away_season_win_pct",
    "home_last3_wins", "away_last3_wins",
]

MLB_REQUIRED_FIELDS = [
    "home_team_id", "away_team_id",
    "home_starter_name", "away_starter_name",
    "home_starter_era", "away_starter_era",
    "home_starter_fip", "away_starter_fip",
    "home_starter_whip", "away_starter_whip",
    "home_team_wrc_plus", "away_team_wrc_plus",
    "home_bullpen_era_3d", "away_bullpen_era_3d",
    "park_factor",
]

ODDS_REQUIRED_FIELDS = [
    "home_odds", "away_odds",
]


def validate_nba_game(data: dict) -> tuple[bool, list[str]]:
    """回傳 (通過, 缺少的欄位清單)。"""
    missing = [f for f in NBA_REQUIRED_FIELDS if data.get(f) is None]
    return len(missing) == 0, missing


def validate_mlb_game(data: dict) -> tuple[bool, list[str]]:
    missing = [f for f in MLB_REQUIRED_FIELDS if data.get(f) is None]
    return len(missing) == 0, missing


def validate_odds(data: dict) -> tuple[bool, list[str]]:
    missing = [f for f in ODDS_REQUIRED_FIELDS if data.get(f) is None]
    return len(missing) == 0, missing


# ── 賠率工具 ──────────────────────────────────────────────
def implied_prob(decimal_odds: float) -> float:
    """十進位賠率 → 原始隱含勝率。"""
    return 1.0 / decimal_odds


def fair_implied_prob(home_odds: float, away_odds: float) -> tuple[float, float]:
    """去除莊家利潤（overround）後的公平隱含勝率。"""
    raw_home = implied_prob(home_odds)
    raw_away = implied_prob(away_odds)
    overround = raw_home + raw_away - 1.0
    if overround <= 0:
        return raw_home, raw_away
    return raw_home / (1 + overround), raw_away / (1 + overround)


def edge(true_prob: float, fair_prob: float) -> float:
    """模型估算勝率 - 公平隱含勝率。"""
    return true_prob - fair_prob


# ── 凱利公式 ──────────────────────────────────────────────
def kelly_fraction(decimal_odds: float, true_prob: float,
                   fraction: float = 0.25) -> float:
    """
    分數凱利公式。
    fraction=0.25 → 1/4 Kelly（單關預設）
    fraction=0.15 → 串關用
    回傳建議下注佔本金比例，最小為 0（不下注）。
    """
    b = decimal_odds - 1.0
    q = 1.0 - true_prob
    full_kelly = (b * true_prob - q) / b
    return max(0.0, full_kelly * fraction)


def kelly_bet_amount(bankroll: float, decimal_odds: float, true_prob: float,
                     fraction: float = 0.25, hard_cap_pct: float = 0.08) -> float:
    """
    計算實際下注金額，套用硬性上限（不超過本金 hard_cap_pct）。
    回傳取整後的金額（10 元整數倍，配合運彩最低單位）。
    """
    frac = kelly_fraction(decimal_odds, true_prob, fraction)
    amount = bankroll * frac
    cap = bankroll * hard_cap_pct
    amount = min(amount, cap)
    # 取最近的 10 元整數倍，最低 10 元
    amount = max(10.0, round(amount / 10) * 10)
    return amount
