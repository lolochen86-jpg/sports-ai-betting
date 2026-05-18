"""
NBA 數據抓取模組

抓取內容：
  - 球隊效率統計（ORtg / DRtg / NetRtg / Pace）
  - 近期主客場勝率（L10）
  - 傷兵名單（ESPN 非官方 API）
  - 今日賽事排程

所有查詢嚴格以 as_of_date 為界，不得使用比賽當天之後的數據。
"""

import time
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

from utils import (
    NBA_DIR, get_logger, save_json, load_json, json_exists,
    parse_date, nba_season_str, safe_request, daily_cache
)

logger = get_logger("fetch_nba")

# nba_api 請求間隔（避免 429 Too Many Requests）
_API_DELAY = 0.7


def _nba_headers() -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.nba.com/",
        "Accept-Language": "en-US,en;q=0.9",
    }


# ── 球隊效率統計 ───────────────────────────────────────────
def fetch_team_efficiency(as_of_date: date | str) -> Optional[dict]:
    """
    抓取截至 as_of_date 的全聯盟球隊效率統計。
    來源：NBA Stats API leaguedashteamstats
    回傳：{team_abbr: {ortg, drtg, netrtg, pace, ...}}
    """
    from nba_api.stats.endpoints import leaguedashteamstats

    d = parse_date(as_of_date)
    season = nba_season_str(d)
    cache_path = NBA_DIR / f"team_efficiency_{d.isoformat()}.json"

    if json_exists(cache_path):
        logger.info(f"效率統計快取命中：{d}")
        return load_json(cache_path)

    logger.info(f"抓取球隊效率統計，賽季 {season}，截至 {d}")
    try:
        from nba_api.stats.static import teams as nba_teams_static
        id_to_abbr = {t["id"]: t["abbreviation"] for t in nba_teams_static.get_teams()}

        time.sleep(_API_DELAY)
        stats = leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="PerGame",
            date_to_nullable=d.strftime("%m/%d/%Y"),
        )
        df = stats.get_data_frames()[0]

        result = {}
        for _, row in df.iterrows():
            team_id = int(row["TEAM_ID"])
            abbr = id_to_abbr.get(team_id, row["TEAM_NAME"][:3].upper())
            result[abbr] = {
                "team_id":    team_id,
                "team_abbr":  abbr,
                "team_name":  row["TEAM_NAME"],
                "ortg":       float(row.get("OFF_RATING", 0)),
                "drtg":       float(row.get("DEF_RATING", 0)),
                "netrtg":     float(row.get("NET_RATING", 0)),
                "pace":       float(row.get("PACE", 0)),
                "ts_pct":     float(row.get("TS_PCT", 0)),
                "season_win_pct": float(row.get("W_PCT", 0)),
                "games_played":  int(row.get("GP", 0)),
            }

        save_json(result, cache_path)
        logger.info(f"球隊效率統計完成，共 {len(result)} 隊")
        return result

    except Exception as e:
        logger.error(f"fetch_team_efficiency 失敗：{e}")
        return None


# ── 近期主客場勝率（L10）─────────────────────────────────
def fetch_team_recent_records(as_of_date: date | str, last_n: int = 10) -> Optional[dict]:
    """
    計算每隊最近 N 場的主客場勝率。
    來源：NBA Stats API teamgamelog（逐隊查詢，較慢但精確）
    回傳：{team_abbr: {home_win_pct_l10, away_win_pct_l10, l10_record, ...}}
    """
    from nba_api.stats.static import teams as nba_teams
    from nba_api.stats.endpoints import teamgamelog

    d = parse_date(as_of_date)
    season = nba_season_str(d)
    cache_path = NBA_DIR / f"team_recent_{d.isoformat()}_L{last_n}.json"

    if json_exists(cache_path):
        logger.info(f"近期戰績快取命中：{d}")
        return load_json(cache_path)

    logger.info(f"抓取各隊近 {last_n} 場戰績，截至 {d}")
    all_teams = nba_teams.get_teams()
    result = {}

    for team in all_teams:
        abbr = team["abbreviation"]
        tid  = team["id"]
        try:
            time.sleep(_API_DELAY)
            # 先抓季後賽，若無數據再抓例行賽
            df = pd.DataFrame()
            for stype in ["Playoffs", "Regular Season"]:
                log = teamgamelog.TeamGameLog(
                    team_id=tid,
                    season=season,
                    season_type_all_star=stype,
                    date_to_nullable=d.strftime("%m/%d/%Y"),
                )
                df_tmp = log.get_data_frames()[0]
                if not df_tmp.empty:
                    df = df_tmp
                    break
            if df.empty:
                continue

            # 取最近 last_n 場
            df = df.head(last_n)
            df["WL_BIN"] = (df["WL"] == "W").astype(int)
            df["IS_HOME"] = ~df["MATCHUP"].str.contains("@")

            home_games = df[df["IS_HOME"]]
            away_games = df[~df["IS_HOME"]]

            result[abbr] = {
                "team_id": tid,
                "team_abbr": abbr,
                "l10_wins":  int(df["WL_BIN"].sum()),
                "l10_games": len(df),
                "l10_win_pct": float(df["WL_BIN"].mean()),
                "home_win_pct_l10": float(home_games["WL_BIN"].mean()) if len(home_games) > 0 else 0.5,
                "away_win_pct_l10": float(away_games["WL_BIN"].mean()) if len(away_games) > 0 else 0.5,
                "home_games_l10": len(home_games),
                "away_games_l10": len(away_games),
                # 近 3 場連勝/連敗（熱度指標）
                "last3_wins": int(df.head(3)["WL_BIN"].sum()),
            }

        except Exception as e:
            logger.warning(f"  {abbr} 戰績抓取失敗：{e}")

    save_json(result, cache_path)
    logger.info(f"近期戰績完成，共 {len(result)} 隊")
    return result


# ── 傷兵名單（ESPN 非官方 API）────────────────────────────
def fetch_injury_report(as_of_date: date | str) -> Optional[dict]:
    """
    抓取 NBA 傷兵名單。
    來源：ESPN 非官方 API（免費，不需 API key）
    回傳：{team_abbr: [{player_name, status, description}, ...]}

    status 值：
      "Out"        → 確定缺陣
      "Doubtful"   → 成疑（勝率影響約 60%）
      "Questionable"→ 存疑（勝率影響約 30%）
      "Probable"   → 大概出賽（勝率影響約 10%）
    """
    d = parse_date(as_of_date)
    cache_path = NBA_DIR / f"injury_{d.isoformat()}.json"

    if json_exists(cache_path):
        logger.info(f"傷兵名單快取命中：{d}")
        return load_json(cache_path)

    # ESPN NBA 傷兵報告端點
    url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
    logger.info(f"抓取 NBA 傷兵名單（ESPN）：{d}")

    data = safe_request(url, headers=_nba_headers())
    if not data:
        logger.error("傷兵名單抓取失敗")
        return None

    result = {}
    for team_entry in data.get("injuries", []):
        team_info = team_entry.get("team", {})
        abbr = team_info.get("abbreviation", "UNK")
        players = []
        for injury in team_entry.get("injuries", []):
            athlete = injury.get("athlete", {})
            players.append({
                "player_id":   athlete.get("id"),
                "player_name": athlete.get("displayName", "Unknown"),
                "position":    athlete.get("position", {}).get("abbreviation", ""),
                "status":      injury.get("status", "Unknown"),
                "description": injury.get("longComment", ""),
                "as_of_date":  d.isoformat(),
            })
        if players:
            result[abbr] = players

    save_json(result, cache_path)
    logger.info(f"傷兵名單完成，{len(result)} 隊有傷兵")
    return result


# ── 今日賽事排程 ──────────────────────────────────────────
def fetch_today_games(as_of_date: date | str) -> Optional[list]:
    """
    取得指定日期的 NBA 賽事列表。
    來源：NBA Stats API scoreboardv3（季後賽相容）
    回傳：[{game_id, home_team, away_team, game_time_et, arena}, ...]
    """
    d = parse_date(as_of_date)
    cache_path = NBA_DIR / f"schedule_{d.isoformat()}.json"

    if json_exists(cache_path):
        logger.info(f"賽程快取命中：{d}")
        return load_json(cache_path)

    logger.info(f"抓取 NBA 賽程：{d}")
    try:
        from nba_api.stats.endpoints import scoreboardv3

        time.sleep(_API_DELAY)
        board = scoreboardv3.ScoreboardV3(game_date=d.strftime("%Y-%m-%d"))
        data = board.get_dict()
        raw_games = data.get("scoreboard", {}).get("games", [])

        games = []
        for g in raw_games:
            home = g.get("homeTeam", {})
            away = g.get("awayTeam", {})
            games.append({
                "game_id":        str(g.get("gameId", "")),
                "game_date":      d.isoformat(),
                "home_team_id":   home.get("teamId", 0),
                "away_team_id":   away.get("teamId", 0),
                "home_team_abbr": home.get("teamTricode", ""),
                "away_team_abbr": away.get("teamTricode", ""),
                "game_status":    g.get("gameStatus", 1),
                "arena":          g.get("arena", {}).get("arenaName", ""),
            })

        save_json(games, cache_path)
        logger.info(f"今日 NBA 賽程：{len(games)} 場")
        return games

    except Exception as e:
        logger.error(f"fetch_today_games 失敗：{e}")
        return None


# ── Elo 評分（從歷史戰績計算）────────────────────────────
_DEFAULT_ELO = 1500.0
_K_FACTOR    = 20.0
_HOME_BONUS  = 100.0


def load_or_init_elo(as_of_date: date | str) -> dict:
    """
    載入截至 as_of_date 的 Elo 評分。
    若不存在則從 2026-04-01 起始值（所有隊 1500）重建。
    """
    d = parse_date(as_of_date)
    elo_path = NBA_DIR / f"elo_{d.isoformat()}.json"

    if json_exists(elo_path):
        return load_json(elo_path)

    # 找最近一份 Elo 快取
    for days_back in range(1, 180):
        prev = d - timedelta(days=days_back)
        prev_path = NBA_DIR / f"elo_{prev.isoformat()}.json"
        if json_exists(prev_path):
            logger.info(f"Elo：以 {prev} 的快取為基礎")
            return load_json(prev_path)

    logger.info("Elo：初始化所有球隊為 1500")
    return {}


def update_elo(elo: dict, winner: str, loser: str, home_team: str) -> dict:
    """更新一場比賽的 Elo 評分。"""
    elo = dict(elo)
    r_w = elo.get(winner, _DEFAULT_ELO)
    r_l = elo.get(loser,  _DEFAULT_ELO)

    # 主場獎勵套用在主隊
    if winner == home_team:
        r_w_adj = r_w + _HOME_BONUS
        r_l_adj = r_l
    else:
        r_w_adj = r_w
        r_l_adj = r_l + _HOME_BONUS

    expected_w = 1.0 / (1.0 + 10 ** ((r_l_adj - r_w_adj) / 400.0))
    elo[winner] = r_w + _K_FACTOR * (1.0 - expected_w)
    elo[loser]  = r_l + _K_FACTOR * (0.0 - (1.0 - expected_w))
    return elo


def elo_win_prob(home_elo: float, away_elo: float) -> float:
    """主隊勝率（已含主場 Elo 加成）。"""
    diff = home_elo - away_elo + _HOME_BONUS
    return 1.0 / (1.0 + 10 ** (-diff / 400.0))


# ── 傷兵對勝率的影響估算 ──────────────────────────────────
_INJURY_IMPACT = {
    "Out":          -0.035,
    "Doubtful":     -0.020,
    "Questionable": -0.010,
    "Probable":     -0.004,
}

_STAR_POSITIONS = {"PG", "SG", "SF", "PF", "C"}


def estimate_injury_adj(injury_list: list, is_home: bool) -> float:
    """
    根據傷兵名單估算勝率調整值（負數 = 傷兵削弱本隊）。
    先發（F/C/G）傷兵影響較大，後備影響打折。
    """
    adj = 0.0
    for p in injury_list:
        status = p.get("status", "Unknown")
        impact = _INJURY_IMPACT.get(status, 0.0)
        pos    = p.get("position", "")
        # 非先發位置影響減半
        if pos not in _STAR_POSITIONS:
            impact *= 0.5
        adj += impact
    return adj


# ── 整合：單場 NBA 分析數據包 ─────────────────────────────
def build_nba_game_data(
    game: dict,
    team_efficiency: dict,
    team_records: dict,
    injury_report: dict,
    elo: dict,
) -> Optional[dict]:
    """
    組合單場比賽所需的所有分析數據。
    回傳完整數據包，或 None（若關鍵數據缺失）。
    """
    home = game["home_team_abbr"]
    away = game["away_team_abbr"]

    eff_home = team_efficiency.get(home)
    eff_away = team_efficiency.get(away)
    rec_home = team_records.get(home)
    rec_away = team_records.get(away)

    # 任一效率/戰績缺失 → 排除
    if not eff_home or not eff_away or not rec_home or not rec_away:
        logger.warning(f"  {away}@{home}：效率或戰績數據缺失，排除")
        return None

    # 最少需要 7 場數據才算可靠
    if eff_home.get("games_played", 0) < 7 or eff_away.get("games_played", 0) < 7:
        logger.warning(f"  {away}@{home}：賽季場數不足 7 場，排除")
        return None

    inj_home = injury_report.get(home, [])
    inj_away = injury_report.get(away, [])

    return {
        "game_id":    game["game_id"],
        "game_date":  game["game_date"],
        "home_team":  home,
        "away_team":  away,

        # 效率數據
        "home_ortg":   eff_home["ortg"],
        "home_drtg":   eff_home["drtg"],
        "home_netrtg": eff_home["netrtg"],
        "home_pace":   eff_home["pace"],
        "away_ortg":   eff_away["ortg"],
        "away_drtg":   eff_away["drtg"],
        "away_netrtg": eff_away["netrtg"],
        "away_pace":   eff_away["pace"],

        # 近期戰績
        "home_l10_win_pct":      rec_home["l10_win_pct"],
        "home_win_pct_l10":      rec_home["home_win_pct_l10"],
        "away_win_pct_l10":      rec_away["away_win_pct_l10"],
        "home_season_win_pct":   eff_home["season_win_pct"],
        "away_season_win_pct":   eff_away["season_win_pct"],
        "home_last3_wins":       rec_home["last3_wins"],
        "away_last3_wins":       rec_away["last3_wins"],

        # Elo
        "home_elo": elo.get(home, _DEFAULT_ELO),
        "away_elo": elo.get(away, _DEFAULT_ELO),

        # 傷兵
        "home_injuries": inj_home,
        "away_injuries": inj_away,
        "home_injury_adj": estimate_injury_adj(inj_home, is_home=True),
        "away_injury_adj": estimate_injury_adj(inj_away, is_home=False),
        "home_out_count": sum(1 for p in inj_home if p["status"] == "Out"),
        "away_out_count": sum(1 for p in inj_away if p["status"] == "Out"),
    }


# ── 主流程 ────────────────────────────────────────────────
def run(as_of_date: date | str | None = None) -> Optional[list]:
    """
    執行當日 NBA 全部抓取流程。
    回傳：[game_data_dict, ...] 每場賽事的完整數據包。
    儲存至 data/nba/games_{date}.json。
    """
    from utils import today_tw
    d = parse_date(as_of_date) if as_of_date else today_tw()
    output_path = NBA_DIR / f"games_{d.isoformat()}.json"

    if json_exists(output_path):
        logger.info(f"今日 NBA 數據包已存在：{d}")
        return load_json(output_path)

    logger.info(f"===== NBA 數據抓取開始：{d} =====")

    games     = fetch_today_games(d)
    if not games:
        logger.info("今日無 NBA 賽事")
        # 只有明確為空（API 回傳 0 場）才快取，None 表示抓取失敗不快取
        if games is not None:
            save_json([], output_path)
        return []

    eff       = fetch_team_efficiency(d)
    records   = fetch_team_recent_records(d)
    injuries  = fetch_injury_report(d)
    elo       = load_or_init_elo(d)

    if not eff or not records:
        logger.error("核心統計數據缺失，中止")
        return None

    result = []
    for game in games:
        data = build_nba_game_data(game, eff, records, injuries or {}, elo)
        if data:
            result.append(data)
            logger.info(f"  ✓ {game['away_team_abbr']}@{game['home_team_abbr']}")
        else:
            logger.info(f"  ✗ {game['away_team_abbr']}@{game['home_team_abbr']} 排除")

    save_json(result, output_path)
    logger.info(f"===== NBA 完成：{len(result)}/{len(games)} 場通過驗證 =====")
    return result


if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else None
    run(d)
