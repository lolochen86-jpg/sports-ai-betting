"""
結算模組 P8

功能：
  1. 讀取昨日計劃（data/live/plan_YYYY-MM-DD.json）
  2. 抓取 NBA / MLB 實際比賽結果
  3. 逐注比對結果（WIN / LOSS / VOID）
  4. 計算盈虧，更新 data/bankroll.json
  5. 寫入 data/live/settled_YYYY-MM-DD.json
  6. 對賠率線移做事後記錄（若賠率有大幅異動）

結算邏輯：
  - 單關（moneyline）：勝隊 = 選中方 → WIN，否則 LOSS
  - 串關：所有腳全中 → WIN，任一腳未中 → LOSS
  - VOID：比賽取消或結果無法取得（退還注碼）
"""

from __future__ import annotations

import csv
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import requests

from utils import (
    DATA_DIR, NBA_DIR, MLB_DIR, get_logger,
    save_json, load_json, json_exists, parse_date, today_tw
)

logger = get_logger("settle")

LIVE_DIR    = DATA_DIR / "live"
LIVE_DIR.mkdir(exist_ok=True)

_MLB_API    = "https://statsapi.mlb.com/api/v1"
_HEADERS    = {"User-Agent": "Mozilla/5.0 (compatible; SportsAnalyzer/1.0)"}


# ── NBA 結果抓取 ──────────────────────────────────────────
def get_nba_winner(game_id: str, game_date: date) -> Optional[str]:
    """
    從 NBA Stats API 取得比賽勝隊縮寫。
    優先使用快取；比賽未結束回傳 None。
    """
    cache_path = NBA_DIR / f"result_{game_id}_{game_date.isoformat()}.json"
    if json_exists(cache_path):
        data = load_json(cache_path)
        return data.get("winner")

    try:
        from nba_api.stats.endpoints import boxscoresummaryv2
        time.sleep(0.7)
        box    = boxscoresummaryv2.BoxScoreSummaryV2(game_id=game_id)
        frames = box.get_data_frames()

        # frame index 0 = GameSummary，1 = Other, 5 = LineScore
        line_df = frames[5]
        if line_df.empty or len(line_df) < 2:
            logger.warning(f"NBA {game_id}：LineScore 為空，比賽可能尚未結束")
            return None

        # 檢查比賽狀態（status_id 3 = Final）
        summary_df = frames[0]
        if not summary_df.empty:
            status = int(summary_df.iloc[0].get("GAME_STATUS_ID", 1))
            if status < 3:
                logger.info(f"NBA {game_id}：比賽尚未結束（status={status}）")
                return None

        teams = line_df[["TEAM_ABBREVIATION", "PTS"]].dropna()
        if len(teams) < 2:
            return None

        home_abbr = str(teams.iloc[0]["TEAM_ABBREVIATION"])
        away_abbr = str(teams.iloc[1]["TEAM_ABBREVIATION"])
        home_pts  = float(teams.iloc[0]["PTS"])
        away_pts  = float(teams.iloc[1]["PTS"])

        winner = home_abbr if home_pts > away_pts else away_abbr
        loser  = away_abbr if home_pts > away_pts else home_abbr

        result = {
            "game_id":   game_id,
            "winner":    winner,
            "loser":     loser,
            "home_team": home_abbr,
            "away_team": away_abbr,
            "home_pts":  home_pts,
            "away_pts":  away_pts,
            "status":    "Final",
        }
        save_json(result, cache_path)
        logger.info(f"  NBA {away_abbr}@{home_abbr} → 勝：{winner} ({away_pts:.0f}-{home_pts:.0f})")
        return winner

    except Exception as e:
        logger.warning(f"  NBA {game_id} 結果抓取失敗：{e}")
        return None


# ── MLB 結果抓取 ──────────────────────────────────────────
def get_mlb_winner(game_pk: int, game_date: date) -> Optional[str]:
    """
    從 MLB Stats API 取得比賽勝隊縮寫。
    使用 /linescore 端點（/feed/live 可能回傳 404）。
    """
    cache_path = MLB_DIR / f"result_{game_pk}_{game_date.isoformat()}.json"
    if json_exists(cache_path):
        data = load_json(cache_path)
        return data.get("winner")

    try:
        # 先從 schedule 取隊名縮寫與狀態
        sched_url = f"{_MLB_API}/schedule?sportId=1&gamePk={game_pk}"
        sr = requests.get(sched_url, headers=_HEADERS, timeout=15)
        sr.raise_for_status()
        sched = sr.json()
        games = sched.get("dates", [{}])[0].get("games", [])
        if not games:
            logger.warning(f"  MLB {game_pk}：schedule 找不到此場次")
            return None

        g = games[0]
        status = g.get("status", {}).get("abstractGameState", "")
        if status != "Final":
            logger.info(f"  MLB {game_pk}：比賽尚未結束（{status}）")
            return None

        home_abbr = g.get("teams", {}).get("home", {}).get("team", {}).get("abbreviation", "")
        away_abbr = g.get("teams", {}).get("away", {}).get("team", {}).get("abbreviation", "")

        # 用 linescore 取得比分
        ls_url = f"{_MLB_API}/game/{game_pk}/linescore"
        lr = requests.get(ls_url, headers=_HEADERS, timeout=15)
        lr.raise_for_status()
        ls = lr.json()
        home_runs = ls.get("teams", {}).get("home", {}).get("runs")
        away_runs = ls.get("teams", {}).get("away", {}).get("runs")

        if home_runs is None or away_runs is None:
            return None

        winner = home_abbr if home_runs > away_runs else away_abbr
        loser  = away_abbr if home_runs > away_runs else home_abbr

        result = {
            "game_pk":   game_pk,
            "winner":    winner,
            "loser":     loser,
            "home_team": home_abbr,
            "away_team": away_abbr,
            "home_runs": home_runs,
            "away_runs": away_runs,
            "status":    "Final",
        }
        save_json(result, cache_path)
        logger.info(f"  MLB {away_abbr}@{home_abbr} → 勝：{winner} ({away_runs}-{home_runs})")
        return winner

    except Exception as e:
        logger.warning(f"  MLB {game_pk} 結果抓取失敗：{e}")
        return None


# ── 結果查詢（統一介面）──────────────────────────────────
def get_winner(pick_dict: dict, game_date: date) -> Optional[str]:
    """
    依 sport 欄位呼叫對應的結果抓取函式。
    pick_dict 含 sport / game_id 欄位。
    """
    sport    = pick_dict.get("sport", "")
    game_id  = str(pick_dict.get("game_id", ""))
    bet_type = pick_dict.get("bet_type", "single")

    if "parlay" in bet_type:
        # 串關：逐腳取結果（由 settle_parlay 呼叫）
        return None

    if sport == "NBA":
        return get_nba_winner(game_id, game_date)
    elif sport == "MLB":
        try:
            game_pk = int(game_id)
            return get_mlb_winner(game_pk, game_date)
        except ValueError:
            return None
    return None


# ── 單注結算 ──────────────────────────────────────────────
def settle_single_pick(pick: dict, winner: Optional[str]) -> dict:
    """
    結算單關注單。
    pick 為 plan_dict["single_picks"] 中的序列化 dict。
    """
    bet_side = pick.get("bet_side", "home")
    home     = pick.get("home_team", "")
    away     = pick.get("away_team", "")
    expected = home if bet_side == "home" else away
    amount   = float(pick.get("raw_data", {}).get("bet_amount", 0)) or \
               _estimate_amount(pick)

    if winner is None:
        return {**pick, "result": "VOID",  "pnl": 0.0,
                "settled_winner": None, "bet_amount": amount}
    elif winner == expected:
        pnl = round(amount * (float(pick["odds"]) - 1.0), 0)
        return {**pick, "result": "WIN",  "pnl": pnl,
                "settled_winner": winner, "bet_amount": amount}
    else:
        return {**pick, "result": "LOSS", "pnl": -amount,
                "settled_winner": winner, "bet_amount": amount}


def settle_parlay_pick(parlay: dict, winners: dict[str, Optional[str]],
                       bankroll: float) -> dict:
    """
    結算串關注單。
    parlay 為 plan_dict["parlays"] 中的序列化 dict。
    winners: {game_id: 勝隊縮寫}
    """
    legs   = parlay.get("legs", [])
    odds   = float(parlay.get("parlay_odds", 1.0))
    frac   = float(parlay.get("kelly_frac", 0.0))
    amount = max(10.0, round(bankroll * frac / 10) * 10)
    amount = min(amount, bankroll * 0.08 * len(legs))
    amount = max(10.0, round(amount / 10) * 10)

    all_win = True
    voided  = False
    for leg in legs:
        gid      = str(leg.get("game_id", ""))
        bet_side = leg.get("bet_side", "home")
        expected = leg.get("home_team") if bet_side == "home" else leg.get("away_team")
        w = winners.get(gid)
        if w is None:
            voided = True
            break
        if w != expected:
            all_win = False
            break

    if voided:
        result, pnl = "VOID", 0.0
    elif all_win:
        result = "WIN"
        pnl    = round(amount * (odds - 1.0), 0)
    else:
        result = "LOSS"
        pnl    = -amount

    leg_labels = " + ".join(lg.get("bet_label", "") for lg in legs)
    return {
        "bet_type":    f"{len(legs)}-parlay",
        "bet_label":   f"{len(legs)}-串（{leg_labels}）",
        "sport":       "PARLAY",
        "parlay_odds": odds,
        "bet_amount":  amount,
        "result":      result,
        "pnl":         pnl,
        "legs":        legs,
    }


def _estimate_amount(pick: dict) -> float:
    """若 pick 沒有明確注碼，從 kelly_frac 與 bankroll 反推。"""
    bankroll = float(pick.get("bankroll", 3000.0))
    frac     = float(pick.get("kelly_frac", 0.0))
    amount   = bankroll * frac
    return max(10.0, round(amount / 10) * 10)


# ── 每日結算主流程 ─────────────────────────────────────────
def run(settle_date: date | str | None = None) -> dict:
    """
    結算指定日期的所有下注。
    settle_date：要結算的比賽日期（通常是昨天）。
    回傳：{"pnl": ..., "wins": ..., "losses": ..., "bankroll": ...}
    """
    d = parse_date(settle_date) if settle_date else today_tw() - timedelta(days=1)
    logger.info(f"===== 結算日期：{d} =====")

    # 讀取計劃
    plan_path = LIVE_DIR / f"plan_{d.isoformat()}.json"
    if not json_exists(plan_path):
        logger.warning(f"找不到計劃檔：{plan_path.name}，略過結算")
        bk_path = DATA_DIR / "bankroll.json"
        cur_bk  = (load_json(bk_path) if json_exists(bk_path) else {}).get("current", 0.0)
        return {"pnl": 0.0, "wins": 0, "losses": 0, "voids": 0, "bets": 0,
                "date": d.isoformat(), "bankroll_before": cur_bk, "bankroll_after": cur_bk}

    plan     = load_json(plan_path)
    bankroll = float(plan.get("bankroll", 3000.0))

    # ── 抓取所有策略計劃中涉及的賽事 ───────────────────────
    # 同時讀三個策略，確保 winners dict 涵蓋所有賽事
    game_ids: set[str] = set()
    all_slugs = ["conservative", "aggressive", "underdog"]
    for slug in all_slugs:
        p2 = LIVE_DIR / f"plan_{d.isoformat()}_{slug}.json"
        extra = load_json(p2) if json_exists(p2) else {}
        for p in extra.get("single_picks", []):
            game_ids.add(str(p.get("game_id", "")))
        for par in extra.get("parlays", []):
            for leg in par.get("legs", []):
                game_ids.add(str(leg.get("game_id", "")))
    # 預設計劃也加入
    for p in plan.get("single_picks", []):
        game_ids.add(str(p.get("game_id", "")))
    for par in plan.get("parlays", []):
        for leg in par.get("legs", []):
            game_ids.add(str(leg.get("game_id", "")))

    winners: dict[str, Optional[str]] = {}
    for gid in game_ids:
        if not gid:
            continue
        # 從 NBA 快取或即時抓取判斷 sport
        nba_result = NBA_DIR / f"result_{gid}_{d.isoformat()}.json"
        mlb_result = MLB_DIR / f"result_{gid}_{d.isoformat()}.json"

        if json_exists(nba_result):
            winners[gid] = load_json(nba_result).get("winner")
        elif json_exists(mlb_result):
            winners[gid] = load_json(mlb_result).get("winner")
        else:
            # 先嘗試 NBA
            w = get_nba_winner(gid, d)
            if w:
                winners[gid] = w
            else:
                # 嘗試 MLB（game_id 可能是 game_pk 數字）
                try:
                    w = get_mlb_winner(int(gid), d)
                    winners[gid] = w
                except ValueError:
                    winners[gid] = None

    logger.info(f"結果取得：{sum(1 for v in winners.values() if v)} / {len(winners)} 場")

    # ── 逐注結算 ──────────────────────────────────────────
    settled_rows = []
    total_pnl    = 0.0
    wins = losses = voids = 0

    for p in plan.get("single_picks", []):
        gid    = str(p.get("game_id", ""))
        winner = winners.get(gid)

        # 若尚無結果，嘗試即時再抓一次
        if winner is None:
            sport = p.get("sport", "")
            if sport == "NBA":
                winner = get_nba_winner(gid, d)
            elif sport == "MLB":
                try:
                    winner = get_mlb_winner(int(gid), d)
                except ValueError:
                    pass
            winners[gid] = winner

        row = settle_single_pick(p, winner)
        settled_rows.append(row)
        total_pnl += row["pnl"]
        if row["result"] == "WIN":
            wins  += 1
        elif row["result"] == "LOSS":
            losses += 1
        else:
            voids += 1

        icon = {"WIN": "✅", "LOSS": "❌", "VOID": "⚪"}[row["result"]]
        logger.info(
            f"  {icon} {p.get('bet_label')} @{p.get('odds'):.2f} "
            f"→ {row['result']} NT${row['pnl']:+,.0f}"
        )

    for par in plan.get("parlays", []):
        row = settle_parlay_pick(par, winners, bankroll)
        settled_rows.append(row)
        total_pnl += row["pnl"]
        if row["result"] == "WIN":
            wins  += 1
        elif row["result"] == "LOSS":
            losses += 1
        else:
            voids += 1

        icon = {"WIN": "✅", "LOSS": "❌", "VOID": "⚪"}[row["result"]]
        logger.info(
            f"  {icon} {par.get('bet_label','串關')} @{par.get('parlay_odds'):.2f} "
            f"→ {row['result']} NT${row['pnl']:+,.0f}"
        )

    # ── 更新 bankroll.json ──────────────────────────────────
    bk_path  = DATA_DIR / "bankroll.json"
    bankroll_data = load_json(bk_path) if json_exists(bk_path) else {
        "initial": 3000.0, "current": 3000.0, "peak": 3000.0, "history": []
    }
    old_balance = bankroll_data["current"]
    new_balance = old_balance + total_pnl
    bankroll_data["current"] = new_balance
    bankroll_data["peak"]    = max(bankroll_data["peak"], new_balance)
    bankroll_data["history"].append({
        "date":   d.isoformat(),
        "open":   old_balance,
        "close":  new_balance,
        "pnl":    total_pnl,
        "bets":   len(settled_rows),
        "wins":   wins,
        "losses": losses,
        "voids":  voids,
    })
    save_json(bankroll_data, bk_path)

    # ── 儲存結算結果 ────────────────────────────────────────
    settled_path = LIVE_DIR / f"settled_{d.isoformat()}.json"
    save_json(settled_rows, settled_path)

    logger.info(f"===== 結算完成 =====")
    logger.info(f"  勝 {wins} / 負 {losses} / 取消 {voids}")
    logger.info(f"  今日盈虧：NT${total_pnl:+,.0f}")
    logger.info(f"  本金：NT${old_balance:,.0f} → NT${new_balance:,.0f}")

    return {
        "date":        d.isoformat(),
        "pnl":         total_pnl,
        "wins":        wins,
        "losses":      losses,
        "voids":       voids,
        "bets":        len(settled_rows),
        "bankroll_before": old_balance,
        "bankroll_after":  new_balance,
    }


# ── 補結算（手動輸入結果）────────────────────────────────
def manual_settle(settle_date: date | str,
                  overrides: dict[str, str]) -> dict:
    """
    人工補填比賽結果（API 無法取得時使用）。
    overrides: {game_id: 勝隊縮寫}

    用法範例：
        from settle import manual_settle
        manual_settle("2026-04-15", {"0022501234": "BOS", "745678": "NYY"})
    """
    d = parse_date(settle_date)

    # 寫入快取，讓 run() 自動讀取
    for gid, winner in overrides.items():
        # 判斷是 NBA 還是 MLB（長度 10 位數字 = NBA game_id 格式）
        if len(gid) == 10 and gid.isdigit():
            cache_path = NBA_DIR / f"result_{gid}_{d.isoformat()}.json"
            sport = "NBA"
        else:
            cache_path = MLB_DIR / f"result_{gid}_{d.isoformat()}.json"
            sport = "MLB"
        save_json({"game_id": gid, "winner": winner,
                   "source": "manual", "sport": sport}, cache_path)
        logger.info(f"  手動補填：{sport} {gid} → {winner}")

    return run(d)


if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else None
    result = run(d)
    print(f"\n結算結果：{result['wins']}勝 {result['losses']}負 "
          f"| 盈虧 NT${result['pnl']:+,.0f} "
          f"| 本金 NT${result['bankroll_after']:,.0f}")
