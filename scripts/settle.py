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


def _mlb_team_abbr_from_schedule(game_pk: int, game_date: date, team_id: int | None) -> str:
    """從本機 schedule 快取補 MLB team abbreviation。MLB API 有時只回 id/name。"""
    if team_id is None:
        return ""
    schedule_path = MLB_DIR / f"schedule_{game_date.isoformat()}.json"
    if not json_exists(schedule_path):
        return ""
    for game in load_json(schedule_path):
        if int(game.get("game_pk", 0)) != int(game_pk):
            continue
        if int(game.get("home_team_id", 0)) == int(team_id):
            return str(game.get("home_team_abbr", ""))
        if int(game.get("away_team_id", 0)) == int(team_id):
            return str(game.get("away_team_abbr", ""))
    return ""


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
    """
    cache_path = MLB_DIR / f"result_{game_pk}_{game_date.isoformat()}.json"
    if json_exists(cache_path):
        data = load_json(cache_path)
        winner = data.get("winner")
        if winner:
            return winner

    try:
        # 用 /schedule?gamePk= 取狀態（/feed/live 已棄用，回傳 404）
        sched_url = f"{_MLB_API}/schedule?sportId=1&gamePk={game_pk}"
        sr = requests.get(sched_url, headers=_HEADERS, timeout=20)
        sr.raise_for_status()
        games = sr.json().get("dates", [{}])[0].get("games", [])
        if not games:
            logger.warning(f"  MLB {game_pk}：schedule API 查無比賽")
            return None

        g = games[0]
        status = g.get("status", {}).get("abstractGameState", "")
        if status != "Final":
            logger.info(f"  MLB {game_pk}：比賽尚未結束（{status}）")
            return None

        home_team = g.get("teams", {}).get("home", {}).get("team", {})
        away_team = g.get("teams", {}).get("away", {}).get("team", {})
        home_id   = home_team.get("id")
        away_id   = away_team.get("id")
        home_abbr = home_team.get("abbreviation") or _mlb_team_abbr_from_schedule(game_pk, game_date, home_id)
        away_abbr = away_team.get("abbreviation") or _mlb_team_abbr_from_schedule(game_pk, game_date, away_id)

        # 用 /linescore 取分數
        ls_url = f"{_MLB_API}/game/{game_pk}/linescore"
        lr = requests.get(ls_url, headers=_HEADERS, timeout=20)
        lr.raise_for_status()
        ls = lr.json()
        home_runs = ls.get("teams", {}).get("home", {}).get("runs")
        away_runs = ls.get("teams", {}).get("away", {}).get("runs")

        if home_runs is None or away_runs is None:
            return None

        winner = home_abbr if home_runs > away_runs else away_abbr
        loser  = away_abbr if home_runs > away_runs else home_abbr
        if not winner:
            logger.warning(f"  MLB {game_pk}：無法解析隊伍縮寫，略過結算")
            return None

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
    fixed  = float(parlay.get("fixed_bet", 0.0) or parlay.get("bet_amount", 0.0) or 0.0)
    if fixed > 0:
        amount = max(10.0, round(fixed / 10) * 10)
    else:
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


# ── 輔助：收集計劃中所有 game_id ──────────────────────────
def _collect_game_ids(plan: dict) -> set[str]:
    ids: set[str] = set()
    for p in plan.get("single_picks", []):
        ids.add(str(p.get("game_id", "")))
    for par in plan.get("parlays", []):
        for leg in par.get("legs", []):
            ids.add(str(leg.get("game_id", "")))
    ids.discard("")
    return ids


# ── 輔助：批次抓取所有比賽勝隊 ──────────────────────────────
def _fetch_winners(game_ids: set[str], d: date) -> dict[str, Optional[str]]:
    winners: dict[str, Optional[str]] = {}
    for gid in game_ids:
        nba_result = NBA_DIR / f"result_{gid}_{d.isoformat()}.json"
        mlb_result = MLB_DIR / f"result_{gid}_{d.isoformat()}.json"
        if json_exists(nba_result):
            winners[gid] = load_json(nba_result).get("winner") or get_nba_winner(gid, d)
        elif json_exists(mlb_result):
            try:
                winners[gid] = load_json(mlb_result).get("winner") or get_mlb_winner(int(gid), d)
            except ValueError:
                winners[gid] = None
        else:
            w = get_nba_winner(gid, d)
            if w:
                winners[gid] = w
            else:
                try:
                    winners[gid] = get_mlb_winner(int(gid), d)
                except ValueError:
                    winners[gid] = None
    return winners


# ── 單策略結算（含幂等保護 + 獨立本金更新）────────────────
def _settle_strategy_plan(
    d: date, slug: str, winners: dict[str, Optional[str]]
) -> tuple[list, dict]:
    """
    結算一個策略的計劃，更新對應 bankroll_{slug}.json。
    回傳 (settled_rows, stats_dict)。
    """
    settled_path = LIVE_DIR / f"settled_{d.isoformat()}_{slug}.json"
    bk_path      = DATA_DIR / f"bankroll_{slug}.json"

    def _cur_bk() -> float:
        return (load_json(bk_path) if json_exists(bk_path) else {}).get("current", 3000.0)

    def _make_stats(rows: list, bk_after: float) -> dict:
        pnl = sum(float(r.get("pnl", 0)) for r in rows)
        return {
            "pnl":     pnl,
            "wins":    sum(1 for r in rows if r.get("result") == "WIN"),
            "losses":  sum(1 for r in rows if r.get("result") == "LOSS"),
            "voids":   sum(1 for r in rows if r.get("result") == "VOID"),
            "bets":    len(rows),
            "bankroll_after": bk_after,
        }

    def _apply_pnl_to_bankroll(rows: list, bk_data: dict) -> tuple[float, float]:
        """計算並更新本金，回傳 (old_bal, new_bal)。若該日已在 history 則不重複加。"""
        already = any(h.get("date") == d.isoformat() for h in bk_data.get("history", []))
        old_bal = float(bk_data.get("current", 3000.0))
        if already:
            return old_bal, old_bal   # 本金已正確，不重複加
        pnl = sum(float(r.get("pnl", 0)) for r in rows)
        new_bal = old_bal + pnl
        bk_data["current"] = new_bal
        bk_data["peak"]    = max(float(bk_data.get("peak", new_bal)), new_bal)
        wins   = sum(1 for r in rows if r.get("result") == "WIN")
        losses = sum(1 for r in rows if r.get("result") == "LOSS")
        voids  = sum(1 for r in rows if r.get("result") == "VOID")
        bk_data.setdefault("history", []).append({
            "date": d.isoformat(), "open": old_bal, "close": new_bal,
            "pnl": pnl, "bets": len(rows),
            "wins": wins, "losses": losses, "voids": voids,
        })
        save_json(bk_data, bk_path)
        logger.info(f"  [{slug}] 本金補同步：NT${old_bal:,.0f} → NT${new_bal:,.0f}")
        return old_bal, new_bal

    # ── 幂等：已有策略結算檔 ──────────────────────────────
    if json_exists(settled_path):
        existing = load_json(settled_path)
        if any(r.get("result") in ("WIN", "LOSS") for r in existing):
            # 結算已完成，但檢查本金是否需要補同步（例如上次跑完未 commit）
            bk_data = load_json(bk_path) if json_exists(bk_path) else {
                "initial": 3000.0, "current": 3000.0, "peak": 3000.0,
                "strategy": slug, "history": [],
            }
            old_bal, new_bal = _apply_pnl_to_bankroll(existing, bk_data)
            if old_bal == new_bal:
                logger.info(f"  [{slug}] 已結算，略過重複扣款")
            return existing, _make_stats(existing, float(bk_data["current"]))

    # ── 向下相容：underdog 首次遷移預設結算檔 ────────────
    if slug == "underdog":
        default_settled = LIVE_DIR / f"settled_{d.isoformat()}.json"
        if json_exists(default_settled):
            existing = load_json(default_settled)
            if any(r.get("result") in ("WIN", "LOSS") for r in existing):
                logger.info(f"  [underdog] 從預設結算檔遷移（backward compat）")
                save_json(existing, settled_path)
                # 補同步本金
                bk_data = load_json(bk_path) if json_exists(bk_path) else {
                    "initial": 3000.0, "current": 3000.0, "peak": 3000.0,
                    "strategy": slug, "history": [],
                }
                _apply_pnl_to_bankroll(existing, bk_data)
                return existing, _make_stats(existing, float(bk_data.get("current", 3000.0)))

    # ── 讀取計劃 ─────────────────────────────────────────
    plan_path = LIVE_DIR / f"plan_{d.isoformat()}_{slug}.json"
    if not json_exists(plan_path) and slug == "underdog":
        plan_path = LIVE_DIR / f"plan_{d.isoformat()}.json"   # backward compat
    if not json_exists(plan_path):
        logger.info(f"  [{slug}] 無計劃檔，略過結算")
        return [], _make_stats([], _cur_bk())

    plan     = load_json(plan_path)
    bankroll = float(plan.get("bankroll", 3000.0))

    # ── 逐注結算 ─────────────────────────────────────────
    settled_rows: list = []
    total_pnl = 0.0
    wins = losses = voids = 0

    for p in plan.get("single_picks", []):
        gid    = str(p.get("game_id", ""))
        winner = winners.get(gid)
        row    = settle_single_pick(p, winner)
        settled_rows.append(row)
        total_pnl += row["pnl"]
        if row["result"] == "WIN":    wins   += 1
        elif row["result"] == "LOSS": losses += 1
        else:                         voids  += 1
        icon = {"WIN": "✅", "LOSS": "❌", "VOID": "⚪"}[row["result"]]
        logger.info(
            f"  [{slug}] {icon} {p.get('bet_label')} @{p.get('odds', 0):.2f} "
            f"→ {row['result']} NT${row['pnl']:+,.0f}"
        )

    for par in plan.get("parlays", []):
        row = settle_parlay_pick(par, winners, bankroll)
        settled_rows.append(row)
        total_pnl += row["pnl"]
        if row["result"] == "WIN":    wins   += 1
        elif row["result"] == "LOSS": losses += 1
        else:                         voids  += 1
        icon = {"WIN": "✅", "LOSS": "❌", "VOID": "⚪"}[row["result"]]
        logger.info(
            f"  [{slug}] {icon} 串關 @{par.get('parlay_odds', 0):.2f} "
            f"→ {row['result']} NT${row['pnl']:+,.0f}"
        )

    # ── 更新 bankroll_{slug}.json ────────────────────────
    bk_data = load_json(bk_path) if json_exists(bk_path) else {
        "initial": 3000.0, "current": 3000.0, "peak": 3000.0,
        "strategy": slug, "history": [],
    }
    history = bk_data.setdefault("history", [])
    previous_same_day = [h for h in history if h.get("date") == d.isoformat()]
    if previous_same_day:
        history[:] = [h for h in history if h.get("date") != d.isoformat()]
        old_bal = float(previous_same_day[0].get("open", bk_data.get("current", 3000.0)))
    else:
        old_bal = float(bk_data.get("current", 3000.0))
    new_bal  = old_bal + total_pnl
    bk_data["current"] = new_bal
    bk_data["peak"]    = max(
        float(bk_data.get("initial", new_bal)),
        *(float(h.get("close", new_bal)) for h in history),
        new_bal,
    )
    history.append({
        "date":   d.isoformat(),
        "open":   old_bal,
        "close":  new_bal,
        "pnl":    total_pnl,
        "bets":   len(settled_rows),
        "wins":   wins,
        "losses": losses,
        "voids":  voids,
    })
    save_json(bk_data, bk_path)

    # ── 寫入策略結算檔 ────────────────────────────────────
    save_json(settled_rows, settled_path)

    logger.info(
        f"  [{slug}] 勝{wins}/負{losses}/取消{voids} "
        f"| NT${total_pnl:+,.0f} | NT${old_bal:,.0f}→NT${new_bal:,.0f}"
    )

    stats = _make_stats(settled_rows, new_bal)
    stats["bankroll_before"] = old_bal
    return settled_rows, stats


# ── 每日結算主流程 ─────────────────────────────────────────
def run(settle_date: date | str | None = None) -> dict:
    """
    結算指定日期三個策略的所有下注，分別更新各自的本金帳本。
    settle_date：要結算的比賽日期（通常是昨天）。
    回傳：向下相容的 dict（以 underdog 策略為主），並附加 "strategies" 欄位。
    """
    d = parse_date(settle_date) if settle_date else today_tw() - timedelta(days=1)
    logger.info(f"===== 結算日期：{d}（三策略獨立本金）=====")

    # ── 收集全策略的 game_id，批次抓取勝隊 ────────────────
    all_game_ids: set[str] = set()
    for slug in ["conservative", "aggressive", "underdog"]:
        plan_path = LIVE_DIR / f"plan_{d.isoformat()}_{slug}.json"
        if not json_exists(plan_path) and slug == "underdog":
            plan_path = LIVE_DIR / f"plan_{d.isoformat()}.json"
        if json_exists(plan_path):
            all_game_ids |= _collect_game_ids(load_json(plan_path))

    winners = _fetch_winners(all_game_ids, d)
    logger.info(f"結果取得：{sum(1 for v in winners.values() if v)} / {len(winners)} 場")

    # ── 三策略分別結算 ────────────────────────────────────
    strategy_results: dict[str, tuple[list, dict]] = {}
    for slug in ["conservative", "aggressive", "underdog"]:
        rows, stats = _settle_strategy_plan(d, slug, winners)
        strategy_results[slug] = (rows, stats)

    # ── Backward compat：確保預設結算檔存在（= underdog）─────
    default_settled = LIVE_DIR / f"settled_{d.isoformat()}.json"
    if not json_exists(default_settled):
        underdog_rows, _ = strategy_results["underdog"]
        save_json(underdog_rows, default_settled)

    # ── Backward compat：同步 bankroll.json = bankroll_underdog.json ──
    bk_underdog_path = DATA_DIR / "bankroll_underdog.json"
    bk_default_path  = DATA_DIR / "bankroll.json"
    if json_exists(bk_underdog_path):
        save_json(load_json(bk_underdog_path), bk_default_path)

    _, underdog_stats = strategy_results["underdog"]

    logger.info(f"===== 三策略結算完成 =====")
    for slug in ["conservative", "aggressive", "underdog"]:
        _, s = strategy_results[slug]
        logger.info(
            f"  {slug}: 勝{s['wins']}/負{s['losses']} "
            f"| 本金 NT${s['bankroll_after']:,.0f}"
        )

    return {
        "date":            d.isoformat(),
        "pnl":             underdog_stats.get("pnl", 0),
        "wins":            underdog_stats.get("wins", 0),
        "losses":          underdog_stats.get("losses", 0),
        "voids":           underdog_stats.get("voids", 0),
        "bets":            underdog_stats.get("bets", 0),
        "bankroll_before": underdog_stats.get("bankroll_before", 3000.0),
        "bankroll_after":  underdog_stats.get("bankroll_after", 3000.0),
        "strategies": {slug: s for slug, (_, s) in strategy_results.items()},
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
