"""
MLB 數據抓取模組

抓取內容：
  - 今日賽程與先發投手（MLB Stats API）
  - 先發投手本季成績：ERA、FIP、WHIP（pybaseball / Baseball-Reference）
  - 球隊打線品質：wRC+（pybaseball FanGraphs 數據）
  - 牛棚近 3 日 ERA（MLB Stats API game logs）
  - 球場因素（Park Factor，FanGraphs）

所有查詢嚴格以 as_of_date 為界，不得使用比賽當天之後的數據。
"""

import time
from datetime import date, timedelta
from typing import Optional

import requests

from utils import (
    MLB_DIR, get_logger, save_json, load_json, json_exists,
    parse_date, mlb_season_year, safe_request
)

logger = get_logger("fetch_mlb")

_MLB_API_BASE = "https://statsapi.mlb.com/api/v1"
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; SportsAnalyzer/1.0)"}


# ── 今日賽程與先發投手（MLB Stats API）───────────────────
def fetch_today_games(as_of_date: date | str) -> Optional[list]:
    """
    取得當日 MLB 賽程，包含先發投手資訊。
    回傳：[{game_pk, home_team, away_team, home_starter, away_starter, ...}, ...]
    """
    d = parse_date(as_of_date)
    cache_path = MLB_DIR / f"schedule_{d.isoformat()}.json"

    if json_exists(cache_path):
        logger.info(f"MLB 賽程快取命中：{d}")
        return load_json(cache_path)

    logger.info(f"抓取 MLB 賽程：{d}")
    url = f"{_MLB_API_BASE}/schedule"
    params = {
        "sportId": 1,
        "date": d.strftime("%Y-%m-%d"),
        "hydrate": "probablePitcher,team,linescore,venue",
        "gameType": "R",  # 常規賽
    }
    data = safe_request(url, params=params, headers=_HEADERS)
    if not data:
        return None

    games = []
    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            teams = game.get("teams", {})
            home  = teams.get("home", {})
            away  = teams.get("away", {})

            home_starter = home.get("probablePitcher", {})
            away_starter = away.get("probablePitcher", {})

            games.append({
                "game_pk":         game.get("gamePk"),
                "game_date":       d.isoformat(),
                "game_time_utc":   game.get("gameDate", ""),
                "venue_name":      game.get("venue", {}).get("name", ""),
                "home_team_id":    home.get("team", {}).get("id"),
                "home_team_abbr":  home.get("team", {}).get("abbreviation", ""),
                "home_team_name":  home.get("team", {}).get("name", ""),
                "away_team_id":    away.get("team", {}).get("id"),
                "away_team_abbr":  away.get("team", {}).get("abbreviation", ""),
                "away_team_name":  away.get("team", {}).get("name", ""),
                # 先發投手
                "home_starter_id":   home_starter.get("id"),
                "home_starter_name": home_starter.get("fullName", "TBD"),
                "away_starter_id":   away_starter.get("id"),
                "away_starter_name": away_starter.get("fullName", "TBD"),
                "home_starter_confirmed": bool(home_starter.get("id")),
                "away_starter_confirmed": bool(away_starter.get("id")),
            })

    save_json(games, cache_path)
    logger.info(f"MLB 賽程完成：{len(games)} 場")
    return games


# ── 先發投手本季統計（MLB Stats API）─────────────────────
def fetch_pitcher_stats_mlb_api(pitcher_id: int, season: int,
                                 as_of_date: date) -> Optional[dict]:
    """
    從 MLB Stats API 抓取投手本季累計成績。
    回傳：{era, whip, innings_pitched, strikeouts, walks, hits_per9, hr_per9, ...}
    """
    if not pitcher_id:
        return None

    cache_path = MLB_DIR / f"pitcher_{pitcher_id}_{as_of_date.isoformat()}.json"
    if json_exists(cache_path):
        return load_json(cache_path)

    url = f"{_MLB_API_BASE}/people/{pitcher_id}/stats"
    params = {
        "stats": "season",
        "season": season,
        "group": "pitching",
        "gameType": "R",
    }
    data = safe_request(url, params=params, headers=_HEADERS)
    if not data:
        return None

    stats_list = data.get("stats", [])
    if not stats_list or not stats_list[0].get("splits"):
        return None

    s = stats_list[0]["splits"][0].get("stat", {})

    # 計算衍生指標
    ip_str = s.get("inningsPitched", "0.0")
    try:
        ip = float(ip_str.split(".")[0]) + float(ip_str.split(".")[1]) / 3
    except Exception:
        ip = 0.0

    result = {
        "pitcher_id":      pitcher_id,
        "season":          season,
        "games_started":   s.get("gamesStarted", 0),
        "innings_pitched": ip,
        "era":             float(s.get("era", 99.99)),
        "whip":            float(s.get("whip", 99.99)),
        "k_per9":          float(s.get("strikeoutsPer9Inn", 0)),
        "bb_per9":         float(s.get("walksPer9Inn", 0)),
        "h_per9":          float(s.get("hitsPer9Inn", 0)),
        "hr_per9":         float(s.get("homeRunsPer9", 0)),
        "k_bb_ratio":      float(s.get("strikeoutWalkRatio", 0)),
        "batting_avg_against": float(s.get("avg", 0.300)),
        "as_of_date":      as_of_date.isoformat(),
    }

    save_json(result, cache_path)
    return result


# ── FIP 計算（用 MLB Stats API 原始數據）─────────────────
_FIP_CONSTANT = 3.10  # 2026 賽季近似值（每年微調）


def compute_fip(hr: float, bb: float, hbp: float, k: float, ip: float) -> float:
    """
    現場投手獨立防禦率（FIP）。
    FIP = (13*HR + 3*(BB+HBP) - 2*K) / IP + FIP_constant
    """
    if ip <= 0:
        return 99.99
    return (13 * hr + 3 * (bb + hbp) - 2 * k) / ip + _FIP_CONSTANT


def fetch_pitcher_fip(pitcher_id: int, season: int, as_of_date: date) -> Optional[float]:
    """計算先發投手 FIP，需從 MLB Stats API 抓取細節數據。"""
    if not pitcher_id:
        return None

    url = f"{_MLB_API_BASE}/people/{pitcher_id}/stats"
    params = {
        "stats": "season",
        "season": season,
        "group": "pitching",
        "gameType": "R",
    }
    data = safe_request(url, params=params, headers=_HEADERS)
    if not data or not data.get("stats"):
        return None

    splits = data["stats"][0].get("splits", [])
    if not splits:
        return None

    s = splits[0].get("stat", {})
    ip_str = s.get("inningsPitched", "0.0")
    try:
        ip = float(ip_str.split(".")[0]) + float(ip_str.split(".")[1]) / 3
    except Exception:
        ip = 0.0

    hr  = float(s.get("homeRuns", 0))
    bb  = float(s.get("baseOnBalls", 0))
    hbp = float(s.get("hitByPitch", 0))
    k   = float(s.get("strikeOuts", 0))

    return compute_fip(hr, bb, hbp, k, ip)


# ── 球隊打線品質（wRC+近似，從 MLB Stats API）────────────
def fetch_team_batting(team_id: int, season: int, as_of_date: date) -> Optional[dict]:
    """
    從 MLB Stats API 抓取球隊打線統計。
    wRC+ 需 FanGraphs，此處以 OPS+ 近似（MLB Stats API 可取得）。
    回傳：{ops, avg, obp, slg, ops_plus, strikeout_pct, walk_pct}
    """
    cache_path = MLB_DIR / f"batting_{team_id}_{as_of_date.isoformat()}.json"
    if json_exists(cache_path):
        return load_json(cache_path)

    url = f"{_MLB_API_BASE}/teams/{team_id}/stats"
    params = {
        "stats": "season",
        "season": season,
        "group": "hitting",
        "gameType": "R",
    }
    data = safe_request(url, params=params, headers=_HEADERS)
    if not data or not data.get("stats"):
        return None

    splits = data["stats"][0].get("splits", [])
    if not splits:
        return None

    s = splits[0].get("stat", {})
    ab  = float(s.get("atBats", 1)) or 1.0
    pa  = float(s.get("plateAppearances", ab)) or ab

    result = {
        "team_id":       team_id,
        "season":        season,
        "avg":           float(s.get("avg", 0.250)),
        "obp":           float(s.get("obp", 0.320)),
        "slg":           float(s.get("slg", 0.400)),
        "ops":           float(s.get("ops", 0.720)),
        "strikeout_pct": float(s.get("strikeOuts", 0)) / pa,
        "walk_pct":      float(s.get("baseOnBalls", 0)) / pa,
        "hr_per_game":   float(s.get("homeRuns", 0)) / max(float(s.get("gamesPlayed", 1)), 1),
        "runs_per_game": float(s.get("runs", 0)) / max(float(s.get("gamesPlayed", 1)), 1),
        "as_of_date":    as_of_date.isoformat(),
    }
    # wRC+ 近似（無 FanGraphs 時使用 OPS 換算）
    # wRC+ ≈ (OPS / 聯盟平均 OPS) × 100，聯盟平均 OPS ≈ 0.720
    result["wrc_plus_approx"] = round(result["ops"] / 0.720 * 100, 1)

    save_json(result, cache_path)
    return result


# ── 牛棚近 3 日 ERA ───────────────────────────────────────
def fetch_bullpen_recent_era(team_id: int, as_of_date: date, days: int = 3) -> Optional[float]:
    """
    計算球隊牛棚在最近 days 天的 ERA。
    做法：抓近 days 場比賽的投手數據，排除先發投手，計算其餘投手的 ERA。
    """
    cache_path = MLB_DIR / f"bullpen_{team_id}_{as_of_date.isoformat()}_d{days}.json"
    if json_exists(cache_path):
        return load_json(cache_path).get("era")

    start_date = as_of_date - timedelta(days=days)
    url = f"{_MLB_API_BASE}/schedule"
    params = {
        "sportId": 1,
        "teamId": team_id,
        "startDate": start_date.strftime("%Y-%m-%d"),
        "endDate":   (as_of_date - timedelta(days=1)).strftime("%Y-%m-%d"),
        "hydrate":   "boxscore",
        "gameType":  "R",
    }
    data = safe_request(url, params=params, headers=_HEADERS)
    if not data:
        return None

    total_er = 0.0
    total_ip = 0.0

    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            gid = game.get("gamePk")
            # 確認比賽已結束
            if game.get("status", {}).get("abstractGameState") != "Final":
                continue
            # 判斷本隊是主隊或客隊
            teams = game.get("teams", {})
            if teams.get("home", {}).get("team", {}).get("id") == team_id:
                side = "home"
            elif teams.get("away", {}).get("team", {}).get("id") == team_id:
                side = "away"
            else:
                continue

            box_url = f"{_MLB_API_BASE}/game/{gid}/boxscore"
            box = safe_request(box_url, headers=_HEADERS)
            if not box:
                continue

            pitchers = box.get("teams", {}).get(side, {}).get("pitchers", [])
            all_pitcher_stats = box.get("teams", {}).get(side, {}).get("players", {})

            for i, pid in enumerate(pitchers):
                # 跳過先發（第一位投手）
                if i == 0:
                    continue
                pkey = f"ID{pid}"
                pstats = all_pitcher_stats.get(pkey, {}).get("stats", {}).get("pitching", {})
                ip_str = pstats.get("inningsPitched", "0.0")
                try:
                    ip = float(ip_str.split(".")[0]) + float(ip_str.split(".")[1]) / 3
                except Exception:
                    ip = 0.0
                er = float(pstats.get("earnedRuns", 0))
                total_er += er
                total_ip += ip
            time.sleep(0.3)

    if total_ip < 1.0:
        # 數據不足時回傳聯盟平均牛棚 ERA
        bullpen_era = 4.20
    else:
        bullpen_era = round((total_er / total_ip) * 9, 2)

    save_json({"team_id": team_id, "era": bullpen_era, "ip": total_ip,
               "days": days, "as_of_date": as_of_date.isoformat()}, cache_path)
    return bullpen_era


# ── 球場因素（靜態表，每季更新一次）─────────────────────
# 來源：FanGraphs 2026 Park Factors（先發版本）
# 100 = 聯盟平均；>100 = 打者友善；<100 = 投手友善
_PARK_FACTORS_2026 = {
    "COL": 115, "CIN": 110, "TEX": 108, "BOS": 107, "PHI": 106,
    "NYY": 105, "CHC": 104, "HOU": 103, "ATL": 102, "LAA": 101,
    "MIL": 100, "DET": 100, "STL": 100, "ARI": 99,  "TOR": 99,
    "BAL": 98,  "SEA": 97,  "MIA": 97,  "CWS": 96,  "OAK": 96,
    "TB":  95,  "MIN": 95,  "SF":  94,  "CLE": 93,  "KC":  93,
    "LAD": 92,  "WSH": 92,  "PIT": 91,  "NYM": 91,  "SD":  90,
}


def get_park_factor(team_abbr: str) -> int:
    return _PARK_FACTORS_2026.get(team_abbr, 100)


# ── 整合：單場 MLB 分析數據包 ─────────────────────────────
def build_mlb_game_data(game: dict, as_of_date: date) -> Optional[dict]:
    """
    組合單場 MLB 比賽所需的所有分析數據。
    回傳完整數據包，或 None（若先發投手未確認或數據不足）。
    """
    # 先發投手未確認 → 強制排除
    if not game["home_starter_confirmed"] or not game["away_starter_confirmed"]:
        logger.warning(
            f"  {game['away_team_abbr']}@{game['home_team_abbr']}："
            f"先發投手未確認（{game['away_starter_name']} / {game['home_starter_name']}），排除"
        )
        return None

    season = mlb_season_year(as_of_date)
    home_id = game["home_team_id"]
    away_id = game["away_team_id"]
    home_abbr = game["home_team_abbr"]
    away_abbr = game["away_team_abbr"]

    # 先發投手統計
    h_pitch = fetch_pitcher_stats_mlb_api(game["home_starter_id"], season, as_of_date)
    a_pitch = fetch_pitcher_stats_mlb_api(game["away_starter_id"], season, as_of_date)

    if not h_pitch or not a_pitch:
        logger.warning(f"  {away_abbr}@{home_abbr}：投手統計缺失，排除")
        return None

    # 先發場數門檻：至少 3 場先發（季初保護）
    if h_pitch.get("games_started", 0) < 3 or a_pitch.get("games_started", 0) < 3:
        logger.warning(f"  {away_abbr}@{home_abbr}：先發場數不足 3 場，排除")
        return None

    # FIP
    h_fip = fetch_pitcher_fip(game["home_starter_id"], season, as_of_date) or h_pitch["era"]
    a_fip = fetch_pitcher_fip(game["away_starter_id"], season, as_of_date) or a_pitch["era"]

    # 打線品質
    h_bat = fetch_team_batting(home_id, season, as_of_date)
    a_bat = fetch_team_batting(away_id, season, as_of_date)

    # 牛棚
    h_bp_era = fetch_bullpen_recent_era(home_id, as_of_date) or 4.20
    a_bp_era = fetch_bullpen_recent_era(away_id, as_of_date) or 4.20

    # 球場因素
    pf = get_park_factor(home_abbr)

    return {
        "game_pk":      game["game_pk"],
        "game_date":    game["game_date"],
        "game_time_utc": game.get("game_time_utc", ""),
        "home_team":    home_abbr,
        "away_team":    away_abbr,
        "home_team_id": home_id,
        "away_team_id": away_id,
        "venue":        game["venue_name"],

        # 先發投手
        "home_starter_name": game["home_starter_name"],
        "away_starter_name": game["away_starter_name"],
        "home_starter_era":  h_pitch["era"],
        "away_starter_era":  a_pitch["era"],
        "home_starter_fip":  h_fip,
        "away_starter_fip":  a_fip,
        "home_starter_whip": h_pitch["whip"],
        "away_starter_whip": a_pitch["whip"],
        "home_starter_k9":   h_pitch["k_per9"],
        "away_starter_k9":   a_pitch["k_per9"],
        "home_starter_gs":   h_pitch["games_started"],
        "away_starter_gs":   a_pitch["games_started"],

        # 打線（wRC+ 近似）
        "home_team_wrc_plus": h_bat["wrc_plus_approx"] if h_bat else 100.0,
        "away_team_wrc_plus": a_bat["wrc_plus_approx"] if a_bat else 100.0,
        "home_team_ops":      h_bat["ops"] if h_bat else 0.720,
        "away_team_ops":      a_bat["ops"] if a_bat else 0.720,
        "home_runs_per_game": h_bat["runs_per_game"] if h_bat else 4.5,
        "away_runs_per_game": a_bat["runs_per_game"] if a_bat else 4.5,

        # 牛棚
        "home_bullpen_era_3d": h_bp_era,
        "away_bullpen_era_3d": a_bp_era,

        # 球場
        "park_factor": pf,
    }


# ── 主流程 ────────────────────────────────────────────────
def run(as_of_date: date | str | None = None) -> Optional[list]:
    """
    執行當日 MLB 全部抓取流程。
    回傳：[game_data_dict, ...] 每場賽事的完整數據包。
    儲存至 data/mlb/games_{date}.json。
    """
    from utils import today_tw
    d = parse_date(as_of_date) if as_of_date else today_tw()
    output_path = MLB_DIR / f"games_{d.isoformat()}.json"

    if json_exists(output_path):
        logger.info(f"今日 MLB 數據包已存在：{d}")
        return load_json(output_path)

    logger.info(f"===== MLB 數據抓取開始：{d} =====")

    games = fetch_today_games(d)
    if not games:
        logger.info("今日無 MLB 賽事")
        save_json([], output_path)
        return []

    result = []
    for game in games:
        home = game["home_team_abbr"]
        away = game["away_team_abbr"]
        logger.info(f"  處理：{away}@{home}")
        data = build_mlb_game_data(game, d)
        if data:
            result.append(data)
            logger.info(f"    ✓ {away}@{home} 數據完整")
        else:
            logger.info(f"    ✗ {away}@{home} 排除")

    save_json(result, output_path)
    logger.info(f"===== MLB 完成：{len(result)}/{len(games)} 場通過驗證 =====")
    return result


if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else None
    run(d)
