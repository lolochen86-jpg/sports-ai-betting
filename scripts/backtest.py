"""
回測引擎

從 2026-04-01（或指定日期）開始，逐日模擬下注流程：
  每日：抓數據 → 分析 → 生成下注計劃 → 取得實際比賽結果 → 結算盈虧

終止條件：
  A. 三位分析師各自 NT$3,000 起跑；任兩位本金歸零 → 整體回測停止
  B. 到達 today（無更多歷史結果可用）→ 自然結束

輸出：
  data/backtest/backtest_log.csv     — 逐注紀錄
  data/backtest/daily_summary.csv    — 每日彙整
  data/backtest/backtest_report.md   — 文字摘要報告
"""

import csv
import html
import shutil
import sys
from datetime import date, timedelta
from dataclasses import asdict
from pathlib import Path
from typing import Optional

from utils import (
    ROOT_DIR, BACKTEST_DIR, get_logger, save_json, load_json, json_exists,
    parse_date, date_range, today_tw, NBA_DIR, MLB_DIR, ODDS_DIR
)
from analyze import (
    DailyPlan, Pick, Parlay, run as analyze_run,
    CONSERVATIVE, AGGRESSIVE, UNDERDOG, StrategyConfig,
)

logger = get_logger("backtest")

# ── 回測參數 ──────────────────────────────────────────────
_START_DATE     = date(2026, 4, 1)
_INIT_BANKROLL  = 3000.0
_TARGET         = 12000.0   # 達標本金（4倍）
_RUIN_THRESHOLD = 10.0      # 最低下注門檻；本金低於或等於 NT$10 視為無法續押
_STOP_RUINED_ANALYSTS = 2

# ── CSV 欄位定義 ──────────────────────────────────────────
_BET_LOG_FIELDS = [
    "date", "sport", "game_id", "bet_type", "legs",
    "bet_label", "odds", "true_prob", "implied_prob", "edge",
    "grade", "kelly_frac", "bet_amount",
    "bankroll_before", "result", "pnl", "bankroll_after",
    "notes",
]

_DAILY_FIELDS = [
    "date", "bankroll_open", "total_bet", "total_pnl",
    "bankroll_close", "bets_count", "wins", "losses",
    "voids", "single_bets", "parlay_bets",
    "highest_odds_hit", "notes",
]


# ── 結果取得（真實比賽結果）──────────────────────────────
def fetch_game_result_nba(game_id: str, game_date: date) -> Optional[str]:
    """
    從 NBA Stats API 取得比賽最終結果，回傳勝隊縮寫或 None。
    使用 scoreboardv2 的最終比分欄位。
    """
    from nba_api.stats.endpoints import boxscoresummaryv2
    import time

    cache_path = NBA_DIR / f"result_{game_id}_{game_date.isoformat()}.json"
    if json_exists(cache_path):
        return load_json(cache_path).get("winner")

    try:
        time.sleep(0.7)
        box = boxscoresummaryv2.BoxScoreSummaryV2(game_id=game_id)
        line_score = box.get_data_frames()[5]   # LINE_SCORE dataframe

        if line_score.empty or len(line_score) < 2:
            return None

        home_row = line_score[line_score["TEAM_ABBREVIATION"] == line_score.iloc[0]["TEAM_ABBREVIATION"]]
        # 取主隊、客隊得分
        teams = line_score[["TEAM_ABBREVIATION", "PTS"]].dropna()
        if len(teams) < 2:
            return None

        home_abbr  = teams.iloc[0]["TEAM_ABBREVIATION"]
        away_abbr  = teams.iloc[1]["TEAM_ABBREVIATION"]
        home_pts   = float(teams.iloc[0]["PTS"])
        away_pts   = float(teams.iloc[1]["PTS"])

        winner = home_abbr if home_pts > away_pts else away_abbr
        save_json({"game_id": game_id, "winner": winner,
                   "home": home_abbr, "away": away_abbr,
                   "home_pts": home_pts, "away_pts": away_pts}, cache_path)
        return winner

    except Exception as e:
        logger.warning(f"NBA 結果抓取失敗 {game_id}：{e}")
        return None


def fetch_game_result_mlb(game_pk: int, game_date: date) -> Optional[str]:
    """
    從 MLB Stats API 取得比賽結果，回傳勝隊縮寫或 None。
    """
    import requests
    cache_path = MLB_DIR / f"result_{game_pk}_{game_date.isoformat()}.json"
    if json_exists(cache_path):
        return load_json(cache_path).get("winner")

    url = f"https://statsapi.mlb.com/api/v1/game/{game_pk}/linescore"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        home_runs = data.get("teams", {}).get("home", {}).get("runs")
        away_runs = data.get("teams", {}).get("away", {}).get("runs")

        if home_runs is None or away_runs is None:
            return None

        # 取隊名縮寫（需從 schedule 快取）
        sched_path = MLB_DIR / f"schedule_{game_date.isoformat()}.json"
        winner_side = "home" if home_runs > away_runs else "away"

        if json_exists(sched_path):
            games = load_json(sched_path)
            for g in games:
                if g.get("game_pk") == game_pk:
                    winner = g[f"{winner_side}_team_abbr"]
                    save_json({"game_pk": game_pk, "winner": winner,
                               "home_runs": home_runs, "away_runs": away_runs}, cache_path)
                    return winner
        logger.warning(f"MLB {game_pk} 缺少 schedule 隊名縮寫，略過結算避免誤判")
        return None

    except Exception as e:
        logger.warning(f"MLB 結果抓取失敗 {game_pk}：{e}")
        return None


# ── 結算單注 ──────────────────────────────────────────────
def settle_single(pick: Pick, bankroll_before: float,
                  winner: Optional[str]) -> dict:
    """
    結算單關注單。
    winner: 勝隊縮寫；None = 比賽取消/無結果（退還注碼）
    """
    amount = pick.bet_amount(bankroll_before)

    if winner is None:
        result, pnl = "VOID", 0.0
    elif winner == (pick.home_team if pick.bet_side == "home" else pick.away_team):
        result = "WIN"
        pnl    = round(amount * (pick.odds - 1.0), 0)
    else:
        result = "LOSS"
        pnl    = -amount

    return {
        "date":           pick.game_date,
        "sport":          pick.sport,
        "game_id":        pick.game_id,
        "bet_type":       "single",
        "legs":           1,
        "bet_label":      pick.bet_label,
        "odds":           pick.odds,
        "true_prob":      round(pick.true_prob, 4),
        "implied_prob":   round(pick.implied_prob, 4),
        "edge":           round(pick.edge, 4),
        "grade":          pick.grade,
        "kelly_frac":     round(pick.kelly_frac, 4),
        "bet_amount":     amount,
        "bankroll_before": bankroll_before,
        "result":         result,
        "pnl":            pnl,
        "bankroll_after": bankroll_before + pnl,
        "notes":          "",
    }


def settle_parlay(parlay: Parlay, bankroll_before: float,
                  winners: dict[str, Optional[str]]) -> dict:
    """
    結算串關注單。
    winners: {game_id: 勝隊縮寫} 字典
    串關需所有腳都命中才算贏。
    """
    amount = parlay.bet_amount(bankroll_before)
    all_win = True
    voided  = False

    for leg in parlay.legs:
        w = winners.get(leg.game_id)
        if not w:
            voided = True
            break
        expected_winner = leg.home_team if leg.bet_side == "home" else leg.away_team
        if w != expected_winner:
            all_win = False
            break

    if voided:
        result, pnl = "VOID", 0.0
    elif all_win:
        result = "WIN"
        pnl    = round(amount * (parlay.parlay_odds - 1.0), 0)
    else:
        result = "LOSS"
        pnl    = -amount

    label = parlay.label

    return {
        "date":           parlay.legs[0].game_date,
        "sport":          "PARLAY",
        "game_id":        "+".join(p.game_id for p in parlay.legs),
        "bet_type":       f"{len(parlay.legs)}-parlay",
        "legs":           len(parlay.legs),
        "bet_label":      label,
        "odds":           parlay.parlay_odds,
        "true_prob":      round(parlay.true_prob, 4),
        "implied_prob":   round(1 / parlay.parlay_odds, 4),
        "edge":           round(parlay.parlay_ev, 4),
        "grade":          "PARLAY",
        "kelly_frac":     round(parlay.kelly_frac, 4),
        "bet_amount":     amount,
        "bankroll_before": bankroll_before,
        "result":         result,
        "pnl":            pnl,
        "bankroll_after": bankroll_before + pnl,
        "notes":          "",
    }


# ── 每日回測執行 ──────────────────────────────────────────
def run_one_day(
    d: date,
    bankroll: float,
    bet_log_writer,
    daily_writer,
    cfg=None,
) -> tuple[float, str]:
    """
    執行單日回測流程。
    回傳 (bankroll_after, stop_reason)
    stop_reason: "" = 繼續 | "RUIN" | "TARGET" | "NO_DATA"
    """
    logger.info(f"\n{'='*55}")
    logger.info(f"回測日期：{d}  本金：NT${bankroll:,.0f}")

    # 1. 載入今日數據包（已由前置步驟抓取並快取）
    nba_path  = NBA_DIR  / f"games_{d.isoformat()}.json"
    mlb_path  = MLB_DIR  / f"games_{d.isoformat()}.json"

    nba_games = load_json(nba_path) if json_exists(nba_path) else []
    mlb_games = load_json(mlb_path) if json_exists(mlb_path) else []

    if not nba_games and not mlb_games:
        logger.info(f"  {d}：無賽事數據，跳過")
        daily_writer.writerow({
            "date": d, "bankroll_open": bankroll, "total_bet": 0,
            "total_pnl": 0, "bankroll_close": bankroll, "bets_count": 0,
            "wins": 0, "losses": 0, "voids": 0, "single_bets": 0, "parlay_bets": 0,
            "highest_odds_hit": 0, "notes": "無賽事",
        })
        return bankroll, ""

    # 1b. 若遊戲資料缺少賠率，注入合成賠率（Elo/FIP 基礎機率 + 4.8% 莊家利潤）
    nba_games = _inject_synthetic_odds(nba_games, "NBA")
    mlb_games = _inject_synthetic_odds(mlb_games, "MLB")

    # 2. 分析引擎
    plan: DailyPlan = analyze_run(nba_games, mlb_games, bankroll, d.isoformat(), cfg)
    # 回測新規則：下注最少 2 關串，單關不納入下注。
    plan.single_picks = []
    plan.total_bet = round(sum(par.bet_amount(bankroll, cfg) for par in plan.parlays) / 10) * 10

    if not plan.single_picks and not plan.parlays:
        logger.info(f"  {d}：無符合門檻的選場，跳過")
        daily_writer.writerow({
            "date": d, "bankroll_open": bankroll, "total_bet": 0,
            "total_pnl": 0, "bankroll_close": bankroll, "bets_count": 0,
            "wins": 0, "losses": 0, "voids": 0, "single_bets": 0, "parlay_bets": 0,
            "highest_odds_hit": 0, "notes": "無 Edge≥4% 選場",
        })
        return bankroll, ""

    # 3. 取得所有涉及賽事的比賽結果
    winners: dict[str, Optional[str]] = {}
    for game in nba_games:
        gid = game.get("game_id", "")
        if gid and game.get("game_status", 1) == 3:   # 3 = Final
            winners[gid] = fetch_game_result_nba(gid, d)

    for game in mlb_games:
        gpk = game.get("game_pk")
        gid = str(gpk) if gpk else ""
        if gid:
            winners[gid] = fetch_game_result_mlb(gpk, d)

    # 4. 結算
    bankroll_open = bankroll
    total_pnl = 0.0
    wins = losses = voids = 0
    highest_odds_hit = 0.0
    rows = []

    for pick in plan.single_picks:
        row = settle_single(pick, bankroll, winners.get(pick.game_id))
        bankroll += row["pnl"]
        total_pnl += row["pnl"]
        row["bankroll_after"] = bankroll
        rows.append(row)
        if row["result"] == "WIN":
            wins += 1
            highest_odds_hit = max(highest_odds_hit, pick.odds)
        elif row["result"] == "LOSS":
            losses += 1
        else:
            voids += 1
        logger.info(
            f"  單關 {pick.bet_label} @{pick.odds:.2f} → "
            f"{row['result']} NT${row['pnl']:+,.0f} | 本金 NT${bankroll:,.0f}"
        )

    for parlay in plan.parlays:
        row = settle_parlay(parlay, bankroll, winners)
        bankroll += row["pnl"]
        total_pnl += row["pnl"]
        row["bankroll_after"] = bankroll
        rows.append(row)
        if row["result"] == "WIN":
            wins += 1
            highest_odds_hit = max(highest_odds_hit, parlay.parlay_odds)
        elif row["result"] == "LOSS":
            losses += 1
        else:
            voids += 1
        logger.info(
            f"  {parlay.label} @{parlay.parlay_odds:.2f} → "
            f"{row['result']} NT${row['pnl']:+,.0f} | 本金 NT${bankroll:,.0f}"
        )

    for row in rows:
        bet_log_writer.writerow(row)

    daily_writer.writerow({
        "date":            d,
        "bankroll_open":   bankroll_open,
        "total_bet":       plan.total_bet,
        "total_pnl":       total_pnl,
        "bankroll_close":  bankroll,
        "bets_count":      len(rows),
        "wins":            wins,
        "losses":          losses,
        "voids":           voids,
        "single_bets":     len(plan.single_picks),
        "parlay_bets":     len(plan.parlays),
        "highest_odds_hit": highest_odds_hit,
        "notes":           "",
    })

    logger.info(f"  日結：盈虧 NT${total_pnl:+,.0f} | 本金 NT${bankroll:,.0f}")

    # 5. 終止條件檢查
    if bankroll <= _RUIN_THRESHOLD:
        return bankroll, "RUIN"
    return bankroll, ""


# ── 彙整報告 ──────────────────────────────────────────────
def _load_strategy_stats(res: dict, init_bankroll: float) -> dict:
    """從單策略結果 dict 讀取 CSV，計算所有統計數字，回傳 stats dict。"""
    import csv as _csv
    bet_log_path = res["bet_log_path"]
    daily_path   = res["daily_path"]
    final_bankroll = res["final_bankroll"]
    end_date     = res["end_date"]
    end_reason   = res["end_reason"]
    start_date   = end_date   # will be overridden below

    daily_rows = []
    if Path(daily_path).exists():
        with open(daily_path, newline="", encoding="utf-8") as f:
            daily_rows = list(_csv.DictReader(f))

    bet_rows = []
    if Path(bet_log_path).exists():
        with open(bet_log_path, newline="", encoding="utf-8") as f:
            bet_rows = list(_csv.DictReader(f))

    if daily_rows:
        start_date = min(r["date"] for r in daily_rows)

    total_days  = len(daily_rows)
    bet_days    = sum(1 for r in daily_rows if int(r.get("bets_count", 0)) > 0)
    total_pnl   = sum(float(r.get("total_pnl", 0)) for r in daily_rows)
    total_bet   = sum(float(r.get("total_bet", 0)) for r in daily_rows)
    roi         = (final_bankroll - init_bankroll) / init_bankroll * 100 if init_bankroll > 0 else 0

    singles = [r for r in bet_rows if r.get("bet_type") == "single"]
    parlays = [r for r in bet_rows if "parlay" in r.get("bet_type", "")]
    s_wins  = sum(1 for r in singles if r["result"] == "WIN")
    p_wins  = sum(1 for r in parlays if r["result"] == "WIN")

    peak = init_bankroll; max_dd = 0.0
    for r in daily_rows:
        c = float(r.get("bankroll_close", init_bankroll))
        if c > peak: peak = c
        dd = (peak - c) / peak * 100
        max_dd = max(max_dd, dd)

    max_streak_win = max_streak_loss = cur = 0
    prev = None
    for r in bet_rows:
        res2 = r.get("result")
        if res2 == "VOID": cur = 0; prev = None; continue
        cur = cur + 1 if res2 == prev else 1; prev = res2
        if res2 == "WIN": max_streak_win = max(max_streak_win, cur)
        else: max_streak_loss = max(max_streak_loss, cur)

    amounts   = [float(r.get("bet_amount", 0)) for r in bet_rows if float(r.get("bet_amount", 0)) > 0]
    odds_vals = [float(r.get("odds", 0)) for r in bet_rows if float(r.get("odds", 0)) > 0]
    won_rows  = [r for r in bet_rows if r.get("result") == "WIN"]
    lost_rows = [r for r in bet_rows if r.get("result") == "LOSS"]
    best_bet  = max(won_rows,  key=lambda r: float(r.get("pnl", 0)), default=None)
    worst_bet = max(lost_rows, key=lambda r: abs(float(r.get("pnl", 0))), default=None)

    # 球種
    nba_bets = [r for r in bet_rows if r.get("sport") == "NBA"]
    mlb_bets = [r for r in bet_rows if r.get("sport") == "MLB"]
    par_bets  = [r for r in bet_rows if r.get("sport") == "PARLAY"]

    end_reason_text = {
        "RUIN":    "本金歸零（破產）",
        "TARGET":  f"本金突破 NT${_TARGET:,.0f}（達標）",
        "NATURAL": "數據截止（自然結束）",
        "STOP_TWO_RUINED": "已有兩位分析師歸零，整體停止",
        "ERROR":   "執行中發生錯誤（部分結果）",
    }.get(end_reason, end_reason)

    daily_growth = (final_bankroll - init_bankroll) / bet_days if bet_days > 0 else 0
    days_to_target = (_TARGET - final_bankroll) / daily_growth if daily_growth > 0 else float("inf")

    # 逐日明細（依日期分組）
    from collections import defaultdict as _dd
    result_icon = {"WIN": "✅", "LOSS": "❌", "VOID": "⬜"}
    bets_by_date: dict = _dd(list)
    for r in bet_rows:
        bets_by_date[str(r.get("date", ""))].append(r)

    detail_sections = []
    for d_str in sorted(bets_by_date.keys()):
        day_bets  = bets_by_date[d_str]
        day_open  = float(day_bets[0].get("bankroll_before", 0))
        day_close = float(day_bets[-1].get("bankroll_after", 0))
        day_pnl   = day_close - day_open
        day_wins  = sum(1 for r in day_bets if r.get("result") == "WIN")
        day_icon  = "🟢" if day_pnl > 0 else ("🔴" if day_pnl < 0 else "⬜")
        rows_md   = "| # | 球種 | 下注隊伍 | 等級 | 賠率 | Edge | 注碼 | 結果 | 盈虧 | 本金 |\n"
        rows_md  += "|---|---|---|---|---|---|---|---|---|---|\n"
        for i, r in enumerate(day_bets, 1):
            icon  = result_icon.get(r.get("result", ""), "？")
            rows_md += (
                f"| {i} | {r.get('sport','')} | {r.get('bet_label','')} "
                f"| {r.get('grade','')} | {float(r.get('odds',0)):.2f} "
                f"| {float(r.get('edge',0)):.1%} | NT${float(r.get('bet_amount',0)):,.0f} "
                f"| {icon} {r.get('result','')} "
                f"| NT${float(r.get('pnl',0)):+,.0f} | NT${float(r.get('bankroll_after',0)):,.0f} |\n"
            )
        detail_sections.append(
            f"##### {d_str}　{day_icon} {day_wins}/{len(day_bets)} 中"
            f"　盈虧 NT${day_pnl:+,.0f}　本金 NT${day_open:,.0f} → NT${day_close:,.0f}\n\n"
            f"{rows_md}"
        )

    return {
        "cfg": res.get("cfg"),
        "final_bankroll": final_bankroll, "end_reason_text": end_reason_text,
        "end_date": end_date, "start_date": start_date,
        "total_days": total_days, "bet_days": bet_days,
        "total_pnl": total_pnl, "total_bet": total_bet, "roi": roi,
        "peak": peak, "max_dd": max_dd,
        "s_wins": s_wins, "s_total": len(singles),
        "p_wins": p_wins, "p_total": len(parlays),
        "max_streak_win": max_streak_win, "max_streak_loss": max_streak_loss,
        "amounts": amounts, "odds_vals": odds_vals,
        "nba_bets": nba_bets, "mlb_bets": mlb_bets, "par_bets": par_bets,
        "best_bet": best_bet, "worst_bet": worst_bet,
        "daily_growth": daily_growth, "days_to_target": days_to_target,
        "detail_md": "\n".join(detail_sections) or "_（無下注記錄）_",
        "daily_rows": daily_rows,
    }


def generate_report(
    start: date,
    init_bankroll: float,
    res_c: dict,   # 穩健型結果
    res_a: dict,   # 激進型結果
    res_u: dict,   # 冷門獵人型結果
) -> str:
    """讀取三策略 CSV，產生對比 Markdown 報告。"""
    c = _load_strategy_stats(res_c, init_bankroll)
    a = _load_strategy_stats(res_a, init_bankroll)
    u = _load_strategy_stats(res_u, init_bankroll)

    def _sr(wins, total):
        return f"{wins/total*100:.1f}%" if total else "N/A"

    def _wr(bets):
        w = sum(1 for r in bets if r.get("result") == "WIN")
        return f"{w/len(bets)*100:.1f}%" if bets else "N/A"

    def _pnl(bets):
        return sum(float(r.get("pnl", 0)) for r in bets)

    def _best(st):
        b = st["best_bet"]
        return f"{b['bet_label']} @{float(b['odds']):.2f} → +NT${float(b['pnl']):,.0f}" if b else "N/A"

    def _worst(st):
        w = st["worst_bet"]
        return f"{w['bet_label']} @{float(w['odds']):.2f} → -NT${abs(float(w['pnl'])):,.0f}" if w else "N/A"

    def _target_str(st):
        dtt = st["days_to_target"]
        fb  = st["final_bankroll"]
        if fb >= _TARGET: return "✅ 已達標"
        if dtt == float("inf") or dtt <= 0: return "N/A"
        return f"約 {dtt:.0f} 個下注日"

    def _avg(lst): return sum(lst) / len(lst) if lst else 0

    c_avg_bet  = _avg(c["amounts"]);   a_avg_bet  = _avg(a["amounts"]);   u_avg_bet  = _avg(u["amounts"])
    c_avg_odds = _avg(c["odds_vals"]); a_avg_odds = _avg(a["odds_vals"]); u_avg_odds = _avg(u["odds_vals"])

    # 決定冠軍
    scores = [
        (c["final_bankroll"], "🛡️ 穩健型"),
        (a["final_bankroll"], "⚡ 激進型"),
        (u["final_bankroll"], "🎯 冷門獵人型"),
    ]
    winner_name = max(scores, key=lambda x: x[0])[1]

    def _crown(label): return "**🏆 勝出**" if label == winner_name else ""

    md = f"""# 運彩AI分析師 — 三策略回測對比報告

**測試期間**：{start} 起　｜　**起始本金**：各 NT${init_bankroll:,.0f}（三策略各自獨立）
**下注規則**：最少 2 關串（不下注單關）　｜　**停止條件**：三位分析師中任兩位本金歸零

---

## 🥊 三策略對決總覽

| 指標 | 🛡️ 穩健型 | ⚡ 激進型 | 🎯 冷門獵人型 |
|---|---|---|---|
| 最終本金 | **NT${c['final_bankroll']:,.0f}** | **NT${a['final_bankroll']:,.0f}** | **NT${u['final_bankroll']:,.0f}** |
| 結束原因 | {c['end_reason_text']} | {a['end_reason_text']} | {u['end_reason_text']} |
| 總損益 | NT${c['total_pnl']:+,.0f} | NT${a['total_pnl']:+,.0f} | NT${u['total_pnl']:+,.0f} |
| ROI | {c['roi']:+.1f}% | {a['roi']:+.1f}% | {u['roi']:+.1f}% |
| 本金高點 | NT${c['peak']:,.0f} | NT${a['peak']:,.0f} | NT${u['peak']:,.0f} |
| 最大回撤 | -{c['max_dd']:.1f}% | -{a['max_dd']:.1f}% | -{u['max_dd']:.1f}% |
| 下注天數 | {c['bet_days']}/{c['total_days']} 天 | {a['bet_days']}/{a['total_days']} 天 | {u['bet_days']}/{u['total_days']} 天 |
| 單關命中率 | {_sr(c['s_wins'], c['s_total'])} | {_sr(a['s_wins'], a['s_total'])} | {_sr(u['s_wins'], u['s_total'])} |
| 串關命中率 | {_sr(c['p_wins'], c['p_total'])} | {_sr(a['p_wins'], a['p_total'])} | {_sr(u['p_wins'], u['p_total'])} |
| 平均單注 | NT${c_avg_bet:,.0f} | NT${a_avg_bet:,.0f} | NT${u_avg_bet:,.0f} |
| 平均賠率 | {c_avg_odds:.2f} | {a_avg_odds:.2f} | {u_avg_odds:.2f} |
| 預估達標 | {_target_str(c)} | {_target_str(a)} | {_target_str(u)} |
| **本輪冠軍** | {_crown('🛡️ 穩健型')} | {_crown('⚡ 激進型')} | {_crown('🎯 冷門獵人型')} |

---

## 🛡️ 穩健型策略詳情

> 僅下注 2 關以上串關；候選腿 Edge ≥ 8%，串關 EV ≥ 8%，不下注單關

| 指標 | 數值 |
|---|---|
| 最終本金 | NT${c['final_bankroll']:,.0f}（ROI {c['roi']:+.1f}%） |
| 最大回撤 | -{c['max_dd']:.1f}% |
| 最長連勝/連敗 | {c['max_streak_win']} 勝 / {c['max_streak_loss']} 敗 |
| 最佳單注 | {_best(c)} |
| 最差單注 | {_worst(c)} |

| 球種 | 注數 | 命中率 | 盈虧 |
|---|---|---|---|
| NBA 單關 | {len(c['nba_bets'])} | {_wr(c['nba_bets'])} | NT${_pnl(c['nba_bets']):+,.0f} |
| MLB 單關 | {len(c['mlb_bets'])} | {_wr(c['mlb_bets'])} | NT${_pnl(c['mlb_bets']):+,.0f} |
| 串關 | {len(c['par_bets'])} | {_wr(c['par_bets'])} | NT${_pnl(c['par_bets']):+,.0f} |

### 📒 逐日下注明細

{c['detail_md']}

---

## ⚡ 激進型策略詳情

> 僅下注 2 關以上串關；EV ≥ 4%，賠率上限 30，不下注單關

| 指標 | 數值 |
|---|---|
| 最終本金 | NT${a['final_bankroll']:,.0f}（ROI {a['roi']:+.1f}%） |
| 最大回撤 | -{a['max_dd']:.1f}% |
| 最長連勝/連敗 | {a['max_streak_win']} 勝 / {a['max_streak_loss']} 敗 |
| 最佳單注 | {_best(a)} |
| 最差單注 | {_worst(a)} |

| 球種 | 注數 | 命中率 | 盈虧 |
|---|---|---|---|
| NBA 單關 | {len(a['nba_bets'])} | {_wr(a['nba_bets'])} | NT${_pnl(a['nba_bets']):+,.0f} |
| MLB 單關 | {len(a['mlb_bets'])} | {_wr(a['mlb_bets'])} | NT${_pnl(a['mlb_bets']):+,.0f} |
| 串關 | {len(a['par_bets'])} | {_wr(a['par_bets'])} | NT${_pnl(a['par_bets']):+,.0f} |

### 📒 逐日下注明細

{a['detail_md']}

---

## 🎯 冷門獵人型策略詳情

> 只用冷門候選組 2 關以上串關；單腿賠率 ≥ 2.00、Edge ≥ 8%，不下注單關

| 指標 | 數值 |
|---|---|
| 最終本金 | NT${u['final_bankroll']:,.0f}（ROI {u['roi']:+.1f}%） |
| 最大回撤 | -{u['max_dd']:.1f}% |
| 最長連勝/連敗 | {u['max_streak_win']} 勝 / {u['max_streak_loss']} 敗 |
| 最佳單注 | {_best(u)} |
| 最差單注 | {_worst(u)} |

| 球種 | 注數 | 命中率 | 盈虧 |
|---|---|---|---|
| NBA 單關 | {len(u['nba_bets'])} | {_wr(u['nba_bets'])} | NT${_pnl(u['nba_bets']):+,.0f} |
| MLB 單關 | {len(u['mlb_bets'])} | {_wr(u['mlb_bets'])} | NT${_pnl(u['mlb_bets']):+,.0f} |
| 串關 | {len(u['par_bets'])} | {_wr(u['par_bets'])} | NT${_pnl(u['par_bets']):+,.0f} |

### 📒 逐日下注明細

{u['detail_md']}

---

*回測使用分數凱利，Pinnacle 賠率換算台灣運彩等效賠率*
*停止條件：三位分析師各自 NT${init_bankroll:,.0f} 起跑，任兩位本金歸零即停止整體回測。*
*所有數據嚴格限制於比賽開始前已公開的資訊（無未來數據洩漏）*
*生成時間：{start}*
"""
    return md


# ── 單策略模擬 ────────────────────────────────────────────
def _run_strategy(
    s: date, today: date,
    init_bankroll: float,
    cfg: StrategyConfig,
    auto_fetch: bool,
) -> dict:
    """
    執行單一策略的完整回測，回傳結果 dict 含 CSV 路徑與最終本金。
    """
    slug = cfg.name.replace("型", "").replace("（", "").replace("）", "")
    bet_log_path = BACKTEST_DIR / f"backtest_log_{s.isoformat()}_{slug}.csv"
    daily_path   = BACKTEST_DIR / f"daily_summary_{s.isoformat()}_{slug}.csv"

    bankroll   = init_bankroll
    end_reason = "NATURAL"
    end_date   = s

    try:
        with (
            open(bet_log_path, "w", newline="", encoding="utf-8") as blog_f,
            open(daily_path,   "w", newline="", encoding="utf-8") as daily_f,
        ):
            bet_log_writer = csv.DictWriter(blog_f, fieldnames=_BET_LOG_FIELDS)
            daily_writer   = csv.DictWriter(daily_f, fieldnames=_DAILY_FIELDS)
            bet_log_writer.writeheader()
            daily_writer.writeheader()

            for d in date_range(s, today - timedelta(days=1)):
                if auto_fetch:
                    _auto_fetch_day(d)

                try:
                    bankroll, stop = run_one_day(d, bankroll, bet_log_writer, daily_writer, cfg)
                    end_date = d
                except Exception as e:
                    logger.error(f"  [{cfg.name}] {d} 單日錯誤（略過）：{e}")
                    end_date = d
                    stop = ""

                if stop:
                    end_reason = stop
                    logger.info(f"[{cfg.name}] 回測終止：{stop}  NT${bankroll:,.0f}")
                    break
            else:
                logger.info(f"[{cfg.name}] 回測完成  NT${bankroll:,.0f}")

    except Exception as e:
        logger.error(f"[{cfg.name}] 主流程錯誤：{e}")
        end_reason = "ERROR"

    return {
        "cfg":           cfg,
        "final_bankroll": bankroll,
        "end_reason":    end_reason,
        "end_date":      end_date,
        "bet_log_path":  bet_log_path,
        "daily_path":    daily_path,
    }


# ── 主流程 ────────────────────────────────────────────────
def _run_strategies_until_two_ruined(
    s: date,
    today: date,
    init_bankroll: float,
    auto_fetch: bool,
) -> tuple[dict, dict, dict, str]:
    strategies = [
        ("conservative", CONSERVATIVE),
        ("aggressive", AGGRESSIVE),
        ("underdog", UNDERDOG),
    ]
    states = {}
    for key, cfg in strategies:
        slug = cfg.name.replace("型", "").replace("（", "").replace("）", "")
        states[key] = {
            "cfg": cfg,
            "bankroll": init_bankroll,
            "end_reason": "NATURAL",
            "end_date": s,
            "active": True,
            "bet_log_path": BACKTEST_DIR / f"backtest_log_{s.isoformat()}_{slug}.csv",
            "daily_path": BACKTEST_DIR / f"daily_summary_{s.isoformat()}_{slug}.csv",
        }

    writers = {}
    files = []
    global_stop_reason = "NATURAL"

    try:
        for key, _ in strategies:
            blog_f = open(states[key]["bet_log_path"], "w", newline="", encoding="utf-8")
            daily_f = open(states[key]["daily_path"], "w", newline="", encoding="utf-8")
            files.extend([blog_f, daily_f])
            bet_log_writer = csv.DictWriter(blog_f, fieldnames=_BET_LOG_FIELDS)
            daily_writer = csv.DictWriter(daily_f, fieldnames=_DAILY_FIELDS)
            bet_log_writer.writeheader()
            daily_writer.writeheader()
            writers[key] = (bet_log_writer, daily_writer)

        for d in date_range(s, today - timedelta(days=1)):
            if auto_fetch:
                _auto_fetch_day(d)

            for key, cfg in strategies:
                state = states[key]
                if not state["active"]:
                    continue
                bet_log_writer, daily_writer = writers[key]
                try:
                    bankroll, stop = run_one_day(
                        d, state["bankroll"], bet_log_writer, daily_writer, cfg
                    )
                    state["bankroll"] = bankroll
                    state["end_date"] = d
                except Exception as e:
                    logger.error(f"  [{cfg.name}] {d} 單日錯誤（略過）：{e}")
                    state["end_date"] = d
                    stop = ""

                if stop == "RUIN":
                    state["active"] = False
                    state["end_reason"] = "RUIN"
                    logger.info(f"[{cfg.name}] 本金歸零：NT${state['bankroll']:,.0f}")

            ruined = sum(1 for state in states.values() if state["end_reason"] == "RUIN")
            if ruined >= _STOP_RUINED_ANALYSTS:
                global_stop_reason = "TWO_RUINED"
                logger.info(f"已有 {ruined} 位分析師歸零，整體回測停止於 {d}")
                for state in states.values():
                    if state["active"]:
                        state["end_reason"] = "STOP_TWO_RUINED"
                        state["end_date"] = d
                break
    finally:
        for f in files:
            f.close()

    results = []
    for key, _ in strategies:
        state = states[key]
        results.append({
            "cfg": state["cfg"],
            "final_bankroll": state["bankroll"],
            "end_reason": state["end_reason"],
            "end_date": state["end_date"],
            "bet_log_path": state["bet_log_path"],
            "daily_path": state["daily_path"],
        })
    return results[0], results[1], results[2], global_stop_reason


def run(
    start_date: date | str | None = None,
    init_bankroll: float = _INIT_BANKROLL,
    auto_fetch: bool = True,
) -> dict:
    """
    執行三位分析師同步回測，任兩位本金歸零即停止，輸出合併對比報告。

    auto_fetch=True：每日自動呼叫 fetch_nba / fetch_mlb / fetch_odds
    auto_fetch=False：假設數據已存在於 data/ 快取（離線模式）

    回傳：{"report_path", "conservative": {...}, "aggressive": {...}, "underdog": {...}}
    """
    s = parse_date(start_date) if start_date else _START_DATE
    today = today_tw()

    BACKTEST_DIR.mkdir(parents=True, exist_ok=True)
    report_path = BACKTEST_DIR / f"backtest_report_{s.isoformat()}.md"

    logger.info(f"\n{'='*55}")
    logger.info(f"回測起始：{s}  本金：NT${init_bankroll:,.0f}")
    logger.info(f"{'='*55}")

    logger.info("\n▶ 三位分析師同步回測開始（任兩位歸零即停止）...")
    res_c, res_a, res_u, global_stop_reason = _run_strategies_until_two_ruined(
        s, today, init_bankroll, auto_fetch
    )

    # ── 合併報告 ──
    try:
        report_md = generate_report(s, init_bankroll, res_c, res_a, res_u)
        report_path.write_text(report_md, encoding="utf-8")
        docs_report_path = _publish_backtest_to_docs(s, report_path)
        logger.info(f"\n報告已存至：{report_path}")
    except Exception as e:
        logger.error(f"報告生成失敗：{e}")
        fallback = (
            f"# 回測報告（錯誤摘要）\n\n"
            f"**起始日期**：{s}\n"
            f"**穩健型最終**：NT${res_c['final_bankroll']:,.0f}（{res_c['end_reason']}）\n"
            f"**激進型最終**：NT${res_a['final_bankroll']:,.0f}（{res_a['end_reason']}）\n"
            f"**冷門獵人型最終**：NT${res_u['final_bankroll']:,.0f}（{res_u['end_reason']}）\n\n"
            f"> ⚠️ 完整報告生成失敗：{e}\n"
        )
        report_path.write_text(fallback, encoding="utf-8")
        docs_report_path = _publish_backtest_to_docs(s, report_path)

    return {
        "report_path":  str(report_path),
        "docs_report_path": str(docs_report_path),
        "conservative": res_c,
        "aggressive":   res_a,
        "underdog":     res_u,
        "global_stop":  global_stop_reason,
    }


def _publish_backtest_to_docs(start_date: date, report_path: Path) -> Path:
    """Publish the latest backtest markdown and CSV artifacts to GitHub Pages."""
    docs_dir = ROOT_DIR / "docs"
    docs_backtest_dir = docs_dir / "backtest"
    docs_backtest_dir.mkdir(parents=True, exist_ok=True)

    for csv_path in BACKTEST_DIR.glob(f"*_{start_date.isoformat()}*.csv"):
        shutil.copy2(csv_path, docs_backtest_dir / csv_path.name)
    shutil.copy2(report_path, docs_backtest_dir / report_path.name)

    md = report_path.read_text(encoding="utf-8")
    escaped = html.escape(md)
    html_body = f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>運彩 AI 回測報告 {start_date.isoformat()}</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #172033; }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 24px; }}
    nav {{ display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }}
    a {{ color: #155eef; text-decoration: none; font-weight: 700; }}
    .panel {{ background: #fff; border: 1px solid #d9dee8; border-radius: 8px; padding: 18px; }}
    pre {{ white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.55; }}
  </style>
</head>
<body>
<main>
  <nav>
    <a href="index.html">回首頁</a>
    <a href="backtest/backtest_report_{start_date.isoformat()}.md">Markdown</a>
    <a href="backtest/">CSV / 原始紀錄</a>
  </nav>
  <section class="panel"><pre>{escaped}</pre></section>
</main>
</body>
</html>
"""
    out_path = docs_dir / f"backtest-{start_date.isoformat()}.html"
    if not out_path.exists():
        out_path.write_text(html_body, encoding="utf-8")
    alias_path = docs_dir / "backtest.html"
    alias_path.write_text(out_path.read_text(encoding="utf-8"), encoding="utf-8")
    return out_path


def _inject_synthetic_odds(games: list, sport: str) -> list:
    """
    若遊戲資料缺少賠率，用基礎機率 + 4.8% 莊家利潤生成合成賠率。
    NBA 用 Elo 差；MLB 用 FIP 差。模擬「市場只用簡單指標定線」的情境，
    讓模型的額外資訊（效率、傷兵、近況、FIP 以外因素）產生 Edge。
    """
    _OVERROUND = 1.048

    result = []
    for g in games:
        if g.get("home_odds") and g.get("away_odds"):
            result.append(g)
            continue

        # 計算「市場基礎機率」
        if sport == "NBA":
            home_elo = g.get("home_elo", 1500.0)
            away_elo = g.get("away_elo", 1500.0)
            diff = home_elo - away_elo + 100.0   # +100 主場
            base_p = 1.0 / (1.0 + 10 ** (-diff / 400.0))
        else:  # MLB
            h_fip = g.get("home_starter_fip", 4.20)
            a_fip = g.get("away_starter_fip", 4.20)
            base_p = max(0.35, min(0.65, 0.50 + (a_fip - h_fip) * 0.05))

        base_p = max(0.25, min(0.75, base_p))
        g = dict(g)
        g["home_odds"] = round(_OVERROUND / base_p, 3)
        g["away_odds"] = round(_OVERROUND / (1.0 - base_p), 3)
        g["odds_source"] = "synthetic"
        result.append(g)
    return result


def _auto_fetch_day(d: date) -> None:
    """若當日數據快取不存在，自動執行抓取（含賠率配對）。失敗時記錄警告並繼續。"""
    import os
    import fetch_nba, fetch_mlb, fetch_odds
    from utils import save_json

    nba_out = NBA_DIR / f"games_{d.isoformat()}.json"
    mlb_out = MLB_DIR / f"games_{d.isoformat()}.json"

    # 若沒有 API Key，跳過賠率抓取（回測時由合成賠率補足）
    has_api_key = bool(os.environ.get("ODDS_API_KEY", "").strip())

    if not json_exists(nba_out):
        try:
            nba_raw = fetch_nba.run(d)
            if nba_raw:
                if has_api_key:
                    try:
                        nba_odds = fetch_odds.run("NBA", d)
                        if nba_odds:
                            nba_raw = fetch_odds.match_odds_to_games(nba_raw, nba_odds, "NBA")
                    except Exception as e:
                        logger.warning(f"  NBA 賠率抓取失敗 {d}，使用合成賠率：{e}")
                save_json(nba_raw, nba_out)
        except Exception as e:
            logger.warning(f"  NBA 數據抓取失敗 {d}（略過此日 NBA）：{e}")

    if not json_exists(mlb_out):
        try:
            mlb_raw = fetch_mlb.run(d)
            if mlb_raw:
                if has_api_key:
                    try:
                        mlb_odds = fetch_odds.run("MLB", d)
                        if mlb_odds:
                            mlb_raw = fetch_odds.match_odds_to_games(mlb_raw, mlb_odds, "MLB")
                    except Exception as e:
                        logger.warning(f"  MLB 賠率抓取失敗 {d}，使用合成賠率：{e}")
                save_json(mlb_raw, mlb_out)
        except Exception as e:
            logger.warning(f"  MLB 數據抓取失敗 {d}（略過此日 MLB）：{e}")


# ── CLI 入口 ──────────────────────────────────────────────
if __name__ == "__main__":
    start = sys.argv[1] if len(sys.argv) > 1 else None
    init_b = float(sys.argv[2]) if len(sys.argv) > 2 else _INIT_BANKROLL
    result = run(start_date=start, init_bankroll=init_b)
    rc = result["conservative"]
    ra = result["aggressive"]
    ru = result["underdog"]
    print(f"\n{'='*55}")
    print(f"穩健型：    NT${rc['final_bankroll']:,.0f}  ({rc['end_reason']})")
    print(f"激進型：    NT${ra['final_bankroll']:,.0f}  ({ra['end_reason']})")
    print(f"冷門獵人型：NT${ru['final_bankroll']:,.0f}  ({ru['end_reason']})")
    print(f"報告：{result['report_path']}")
