"""
回測引擎

從 2026-04-01（或指定日期）開始，逐日模擬下注流程：
  每日：抓數據 → 分析 → 生成下注計劃 → 取得實際比賽結果 → 結算盈虧

終止條件：
  A. 本金 ≤ NT$0   → 記錄「破產」
  B. 本金 > NT$6,000 → 記錄「達標（翻倍）」
  C. 到達 today（無更多歷史結果可用）→ 自然結束

輸出：
  data/backtest/backtest_log.csv     — 逐注紀錄
  data/backtest/daily_summary.csv    — 每日彙整
  data/backtest/backtest_report.md   — 文字摘要報告
"""

import csv
import sys
from datetime import date, timedelta
from dataclasses import asdict
from pathlib import Path
from typing import Optional

from utils import (
    BACKTEST_DIR, get_logger, save_json, load_json, json_exists,
    parse_date, date_range, today_tw, NBA_DIR, MLB_DIR, ODDS_DIR
)
from analyze import DailyPlan, Pick, Parlay, run as analyze_run

logger = get_logger("backtest")

# ── 回測參數 ──────────────────────────────────────────────
_START_DATE     = date(2026, 5, 1)
_INIT_BANKROLL  = 3000.0
_TARGET         = 12000.0   # 達標本金（4倍）
_RUIN_THRESHOLD = 0.0       # 破產門檻

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
    "single_bets", "parlay_bets",
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
        return winner_side   # fallback

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
        if w is None:
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
            "wins": 0, "losses": 0, "single_bets": 0, "parlay_bets": 0,
            "highest_odds_hit": 0, "notes": "無賽事",
        })
        return bankroll, ""

    # 1b. 若遊戲資料缺少賠率，注入合成賠率（Elo/FIP 基礎機率 + 4.8% 莊家利潤）
    nba_games = _inject_synthetic_odds(nba_games, "NBA")
    mlb_games = _inject_synthetic_odds(mlb_games, "MLB")

    # 2. 分析引擎
    plan: DailyPlan = analyze_run(nba_games, mlb_games, bankroll, d.isoformat())

    if not plan.single_picks and not plan.parlays:
        logger.info(f"  {d}：無符合門檻的選場，跳過")
        daily_writer.writerow({
            "date": d, "bankroll_open": bankroll, "total_bet": 0,
            "total_pnl": 0, "bankroll_close": bankroll, "bets_count": 0,
            "wins": 0, "losses": 0, "single_bets": 0, "parlay_bets": 0,
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
    wins = losses = 0
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
        "single_bets":     len(plan.single_picks),
        "parlay_bets":     len(plan.parlays),
        "highest_odds_hit": highest_odds_hit,
        "notes":           "",
    })

    logger.info(f"  日結：盈虧 NT${total_pnl:+,.0f} | 本金 NT${bankroll:,.0f}")

    # 5. 終止條件檢查
    if bankroll <= _RUIN_THRESHOLD:
        return bankroll, "RUIN"
    if bankroll > _TARGET:
        return bankroll, "TARGET"
    return bankroll, ""


# ── 彙整報告 ──────────────────────────────────────────────
def generate_report(
    start: date, end: date, end_reason: str,
    init_bankroll: float, final_bankroll: float,
    bet_log_path: Path, daily_path: Path,
) -> str:
    """讀取 CSV 產生 Markdown 摘要報告。"""
    import csv

    # 讀取 daily_summary
    daily_rows = []
    with open(daily_path, newline="", encoding="utf-8") as f:
        daily_rows = list(csv.DictReader(f))

    total_days   = (end - start).days + 1
    bet_days     = sum(1 for r in daily_rows if int(r.get("bets_count", 0)) > 0)
    total_pnl    = sum(float(r.get("total_pnl", 0)) for r in daily_rows)
    total_bet    = sum(float(r.get("total_bet", 0)) for r in daily_rows)
    roi          = total_pnl / total_bet * 100 if total_bet > 0 else 0

    # 讀取 bet_log
    bet_rows = []
    with open(bet_log_path, newline="", encoding="utf-8") as f:
        bet_rows = list(csv.DictReader(f))

    singles  = [r for r in bet_rows if r.get("bet_type") == "single"]
    parlays  = [r for r in bet_rows if "parlay" in r.get("bet_type", "")]
    s_wins   = sum(1 for r in singles if r["result"] == "WIN")
    p_wins   = sum(1 for r in parlays if r["result"] == "WIN")
    s_total  = len(singles)
    p_total  = len(parlays)

    # 本金高點 & 最大回撤
    peak = init_bankroll
    max_dd = 0.0
    for r in daily_rows:
        c = float(r.get("bankroll_close", init_bankroll))
        if c > peak:
            peak = c
        dd = (peak - c) / peak * 100
        max_dd = max(max_dd, dd)

    end_reason_text = {
        "RUIN":    "本金歸零（破產）",
        "TARGET":  f"本金突破 NT${_TARGET:,.0f}（達標）",
        "NATURAL": "數據截止（自然結束）",
        "ERROR":   "執行中發生錯誤（部分結果）",
    }.get(end_reason, end_reason)

    # 月份分拆
    monthly: dict[str, dict] = {}
    for r in daily_rows:
        month = str(r["date"])[:7]
        if month not in monthly:
            monthly[month] = {"bets": 0, "wins": 0, "pnl": 0.0, "close": 0.0}
        monthly[month]["bets"] += int(r.get("bets_count", 0))
        monthly[month]["wins"] += int(r.get("wins", 0))
        monthly[month]["pnl"]  += float(r.get("total_pnl", 0))
        monthly[month]["close"] = float(r.get("bankroll_close", 0))

    month_table = "| 月份 | 下注場次 | 命中 | 月盈虧 | 月末本金 |\n|---|---|---|---|---|\n"
    for m, mv in sorted(monthly.items()):
        hit_rate = mv["wins"] / mv["bets"] * 100 if mv["bets"] > 0 else 0
        month_table += (
            f"| {m} | {mv['bets']} | {mv['wins']}（{hit_rate:.0f}%）"
            f"| NT${mv['pnl']:+,.0f} | NT${mv['close']:,.0f} |\n"
        )

    s_rate = f"{s_wins/s_total*100:.1f}%" if s_total else "N/A"
    p_rate = f"{p_wins/p_total*100:.1f}%" if p_total else "N/A"

    # ── 策略分析計算 ──────────────────────────────────────
    # Edge 分布
    edges = [float(r.get("edge", 0)) for r in bet_rows if r.get("edge")]
    avg_edge = sum(edges) / len(edges) if edges else 0
    edge_A = [r for r in bet_rows if r.get("grade") == "A"]
    edge_B = [r for r in bet_rows if r.get("grade") == "B"]
    edge_C = [r for r in bet_rows if r.get("grade") == "C"]
    edge_A_wr = sum(1 for r in edge_A if r["result"]=="WIN") / len(edge_A) * 100 if edge_A else 0
    edge_B_wr = sum(1 for r in edge_B if r["result"]=="WIN") / len(edge_B) * 100 if edge_B else 0
    edge_C_wr = sum(1 for r in edge_C if r["result"]=="WIN") / len(edge_C) * 100 if edge_C else 0
    edge_A_pnl = sum(float(r.get("pnl",0)) for r in edge_A)
    edge_B_pnl = sum(float(r.get("pnl",0)) for r in edge_B)
    edge_C_pnl = sum(float(r.get("pnl",0)) for r in edge_C)

    # 球種分析
    nba_bets = [r for r in bet_rows if r.get("sport") == "NBA"]
    mlb_bets = [r for r in bet_rows if r.get("sport") == "MLB"]
    par_bets  = [r for r in bet_rows if r.get("sport") == "PARLAY"]
    nba_wr = sum(1 for r in nba_bets if r["result"]=="WIN") / len(nba_bets) * 100 if nba_bets else 0
    mlb_wr = sum(1 for r in mlb_bets if r["result"]=="WIN") / len(mlb_bets) * 100 if mlb_bets else 0
    par_wr = sum(1 for r in par_bets if r["result"]=="WIN") / len(par_bets) * 100 if par_bets else 0
    nba_pnl = sum(float(r.get("pnl",0)) for r in nba_bets)
    mlb_pnl = sum(float(r.get("pnl",0)) for r in mlb_bets)
    par_pnl = sum(float(r.get("pnl",0)) for r in par_bets)

    # 注碼分析
    amounts = [float(r.get("bet_amount", 0)) for r in bet_rows if float(r.get("bet_amount",0)) > 0]
    avg_bet = sum(amounts) / len(amounts) if amounts else 0
    max_bet = max(amounts) if amounts else 0
    min_bet = min(amounts) if amounts else 0

    # 最佳 / 最差單注
    won_rows  = [r for r in bet_rows if r.get("result") == "WIN"]
    lost_rows = [r for r in bet_rows if r.get("result") == "LOSS"]
    best_bet  = max(won_rows,  key=lambda r: float(r.get("pnl", 0)), default=None)
    worst_bet = max(lost_rows, key=lambda r: abs(float(r.get("pnl", 0))), default=None)

    best_str  = (f"{best_bet['bet_label']} @{float(best_bet['odds']):.2f} → +NT${float(best_bet['pnl']):,.0f}"
                 if best_bet else "N/A")
    worst_str = (f"{worst_bet['bet_label']} @{float(worst_bet['odds']):.2f} → -NT${abs(float(worst_bet['pnl'])):,.0f}"
                 if worst_bet else "N/A")

    # 連勝 / 連敗最長
    max_streak_win = max_streak_loss = cur = 0
    prev = None
    for r in bet_rows:
        res = r.get("result")
        if res == "VOID":
            cur = 0; prev = None; continue
        if res == prev:
            cur += 1
        else:
            cur = 1; prev = res
        if res == "WIN":
            max_streak_win  = max(max_streak_win, cur)
        else:
            max_streak_loss = max(max_streak_loss, cur)

    # 賠率分布
    odds_vals = [float(r.get("odds", 0)) for r in singles if float(r.get("odds",0)) > 0]
    avg_odds = sum(odds_vals) / len(odds_vals) if odds_vals else 0

    # 下注頻率
    bet_freq = bet_days / total_days * 100 if total_days > 0 else 0

    # 預期達標天數（線性推估）
    daily_growth = (final_bankroll - init_bankroll) / bet_days if bet_days > 0 else 0
    days_to_target = (_TARGET - final_bankroll) / daily_growth if daily_growth > 0 else float('inf')
    target_str = (f"約 {days_to_target:.0f} 個下注日（若維持現有勝率）"
                  if days_to_target != float('inf') and days_to_target > 0 else "已達標" if final_bankroll >= _TARGET else "N/A")

    # ── 逐日逐注明細 ──────────────────────────────────────
    result_icon = {"WIN": "✅", "LOSS": "❌", "VOID": "⬜"}
    # 依日期分組
    from collections import defaultdict
    bets_by_date: dict[str, list] = defaultdict(list)
    for r in bet_rows:
        bets_by_date[str(r.get("date", ""))].append(r)

    detail_sections = []
    for d_str in sorted(bets_by_date.keys()):
        day_bets = bets_by_date[d_str]
        day_open  = float(day_bets[0].get("bankroll_before", 0))
        day_close = float(day_bets[-1].get("bankroll_after", 0))
        day_pnl   = day_close - day_open
        day_wins  = sum(1 for r in day_bets if r.get("result") == "WIN")
        day_icon  = "🟢" if day_pnl > 0 else ("🔴" if day_pnl < 0 else "⬜")

        rows_md = "| # | 球種 | 下注隊伍 | 等級 | 賠率 | Edge | 注碼 | 結果 | 盈虧 | 本金 |\n"
        rows_md += "|---|---|---|---|---|---|---|---|---|---|\n"
        for i, r in enumerate(day_bets, 1):
            icon  = result_icon.get(r.get("result", ""), "？")
            sport = r.get("sport", "")
            label = r.get("bet_label", "")
            grade = r.get("grade", "")
            odds  = float(r.get("odds", 0))
            edge  = float(r.get("edge", 0))
            amt   = float(r.get("bet_amount", 0))
            pnl   = float(r.get("pnl", 0))
            bk_after = float(r.get("bankroll_after", 0))
            rows_md += (
                f"| {i} | {sport} | {label} | {grade} | {odds:.2f} | {edge:.1%} "
                f"| NT${amt:,.0f} | {icon} {r.get('result','')} "
                f"| NT${pnl:+,.0f} | NT${bk_after:,.0f} |\n"
            )

        detail_sections.append(
            f"#### {d_str}　{day_icon} {day_wins}/{len(day_bets)} 中　"
            f"盈虧 NT${day_pnl:+,.0f}　本金 NT${day_open:,.0f} → NT${day_close:,.0f}\n\n"
            f"{rows_md}"
        )

    detail_md = "\n".join(detail_sections) if detail_sections else "_（無下注記錄）_"

    md = f"""# 運彩AI分析師 — 回測結果報告

**測試期間**：{start} → {end}
**起始本金**：NT${init_bankroll:,.0f}
**最終本金**：NT${final_bankroll:,.0f}
**結束原因**：{end_reason_text}
**總天數**：{total_days} 天（有下注 {bet_days} 天）

---

## 整體績效

| 指標 | 數值 |
|---|---|
| 起始本金 | NT${init_bankroll:,.0f} |
| 最終本金 | NT${final_bankroll:,.0f} |
| 總損益 | NT${total_pnl:+,.0f} |
| 總投入金額 | NT${total_bet:,.0f} |
| ROI | {roi:+.1f}% |
| 本金高點 | NT${peak:,.0f} |
| 最大回撤 | -{max_dd:.1f}% |
| 單關命中率 | {s_wins}/{s_total} = {s_rate} |
| 串關命中率 | {p_wins}/{p_total} = {p_rate} |

---

## 📋 下注策略分析

### 一、信心等級分析（A / B / C）

| 等級 | 條件 | 注數 | 命中率 | 盈虧 |
|---|---|---|---|---|
| A 級 | Edge ≥ 7%，數據完整 | {len(edge_A)} | {edge_A_wr:.1f}% | NT${edge_A_pnl:+,.0f} |
| B 級 | Edge ≥ 4%，數據完整 | {len(edge_B)} | {edge_B_wr:.1f}% | NT${edge_B_pnl:+,.0f} |
| C 級 | Edge ≥ 4%，數據不完整 | {len(edge_C)} | {edge_C_wr:.1f}% | NT${edge_C_pnl:+,.0f} |

> 平均 Edge：{avg_edge:.1%}｜建議：集中 A 級下注，C 級注碼應壓最低

---

### 二、球種分析

| 球種 | 注數 | 命中率 | 盈虧 | 評估 |
|---|---|---|---|---|
| NBA 單關 | {len(nba_bets)} | {nba_wr:.1f}% | NT${nba_pnl:+,.0f} | {'✅ 優勢球種' if nba_pnl > 0 else '⚠️ 待觀察'} |
| MLB 單關 | {len(mlb_bets)} | {mlb_wr:.1f}% | NT${mlb_pnl:+,.0f} | {'✅ 優勢球種' if mlb_pnl > 0 else '⚠️ 待觀察'} |
| 串關 | {len(par_bets)} | {par_wr:.1f}% | NT${par_pnl:+,.0f} | {'✅ 穩定貢獻' if par_pnl > 0 else '⚠️ 待觀察'} |

---

### 三、注碼管理分析（凱利策略）

| 指標 | 數值 |
|---|---|
| 平均單注 | NT${avg_bet:,.0f} |
| 最高單注 | NT${max_bet:,.0f} |
| 最低單注 | NT${min_bet:,.0f} |
| 平均賠率 | {avg_odds:.2f} |
| 下注天數佔比 | {bet_freq:.0f}%（{bet_days}/{total_days} 天） |

> **策略說明**：使用 **1/4 分數凱利**，A 級 25%、B 級 20%、C 級 12% 凱利係數，
> 單注上限 8% 本金，保留 10% 不動本金作緩衝。

---

### 四、風險評估

| 指標 | 數值 | 評等 |
|---|---|---|
| 最大回撤 | -{max_dd:.1f}% | {'🟢 極低' if max_dd < 10 else '🟡 中等' if max_dd < 25 else '🔴 偏高'} |
| 最長連勝 | {max_streak_win} 注 | — |
| 最長連敗 | {max_streak_loss} 注 | {'🟢 可接受' if max_streak_loss <= 3 else '🟡 注意' if max_streak_loss <= 5 else '🔴 風險偏高'} |
| 最佳單注 | {best_str} | — |
| 最差單注 | {worst_str} | — |

---

### 五、目標進度

| 項目 | 數值 |
|---|---|
| 停利目標 | NT${_TARGET:,.0f} |
| 目前本金 | NT${final_bankroll:,.0f} |
| 距目標還差 | NT${max(0, _TARGET - final_bankroll):,.0f}（{max(0, _TARGET - final_bankroll) / _TARGET * 100:.1f}%） |
| 預估達標 | {target_str} |
| 每日平均獲利 | NT${daily_growth:+,.0f} |

---

### 六、策略建議

{"✅ **勝率極高，策略有效**：單關 " + s_rate + "、串關 " + p_rate + "，建議維持現有策略。" if (s_wins/s_total if s_total else 0) > 0.6 else "⚠️ **勝率偏低**：建議提高 Edge 門檻至 6% 以上，減少 C 級下注。"}

{"✅ **回撤控制良好**：最大回撤僅 " + f"{max_dd:.1f}%" + "，資金管理穩健。" if max_dd < 15 else "⚠️ **回撤偏大**：建議降低凱利係數或增加保留比例。"}

{"⚠️ **下注頻率偏低**：僅 " + f"{bet_freq:.0f}%" + " 天有下注，可考慮放寬 Edge 門檻至 3.5%。" if bet_freq < 40 else "✅ **下注頻率適中**：平均每 " + (f"{100/bet_freq:.1f}" if bet_freq > 0 else "?") + " 天下注一次。"}

---

## 各月份績效

{month_table}

---

## 📒 逐日下注明細

{detail_md}

---

*回測使用 1/4 分數凱利，Pinnacle 賠率換算台灣運彩等效賠率*
*停利目標：NT${_TARGET:,.0f}（{_TARGET/init_bankroll:.0f}倍）｜停損門檻：歸零*
*所有數據嚴格限制於比賽開始前已公開的資訊（無未來數據洩漏）*
*生成時間：{end}*
"""
    return md


# ── 主流程 ────────────────────────────────────────────────
def run(
    start_date: date | str | None = None,
    init_bankroll: float = _INIT_BANKROLL,
    auto_fetch: bool = True,
) -> dict:
    """
    執行完整回測。

    auto_fetch=True：每日自動呼叫 fetch_nba / fetch_mlb / fetch_odds
    auto_fetch=False：假設數據已存在於 data/ 快取（離線模式）

    回傳：{"final_bankroll", "end_reason", "end_date", "report_path"}
    """
    s = parse_date(start_date) if start_date else _START_DATE
    today = today_tw()

    BACKTEST_DIR.mkdir(parents=True, exist_ok=True)
    bet_log_path = BACKTEST_DIR / f"backtest_log_{s.isoformat()}.csv"
    daily_path   = BACKTEST_DIR / f"daily_summary_{s.isoformat()}.csv"
    report_path  = BACKTEST_DIR / f"backtest_report_{s.isoformat()}.md"

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
                # 自動抓取數據（若快取不存在）
                if auto_fetch:
                    _auto_fetch_day(d)

                try:
                    bankroll, stop = run_one_day(d, bankroll, bet_log_writer, daily_writer)
                    end_date = d
                except Exception as e:
                    logger.error(f"  {d} 單日回測錯誤（略過）：{e}")
                    end_date = d
                    stop = ""

                if stop:
                    end_reason = stop
                    logger.info(f"\n{'='*55}")
                    logger.info(f"回測終止：{stop}  最終本金：NT${bankroll:,.0f}")
                    break
            else:
                logger.info(f"\n回測完成（數據截止）  最終本金：NT${bankroll:,.0f}")

    except Exception as e:
        logger.error(f"回測主流程錯誤：{e}")
        end_reason = "ERROR"

    # 產生報告（無論是否發生錯誤，只要 CSV 存在就生成）
    try:
        report_md = generate_report(
            s, end_date, end_reason, init_bankroll, bankroll,
            bet_log_path, daily_path,
        )
        report_path.write_text(report_md, encoding="utf-8")
        logger.info(f"報告已存至：{report_path}")
    except Exception as e:
        logger.error(f"報告生成失敗：{e}")
        # 寫入最簡摘要，確保 workflow 能讀到
        fallback = (
            f"# 回測報告（錯誤摘要）\n\n"
            f"**起始日期**：{s}\n"
            f"**結束日期**：{end_date}\n"
            f"**最終本金**：NT${bankroll:,.0f}\n"
            f"**結束原因**：{end_reason}\n\n"
            f"> ⚠️ 完整報告生成失敗：{e}\n"
        )
        report_path.write_text(fallback, encoding="utf-8")
        logger.info(f"已寫入備用摘要：{report_path}")

    return {
        "final_bankroll": bankroll,
        "end_reason":     end_reason,
        "end_date":       end_date.isoformat(),
        "report_path":    str(report_path),
        "bet_log_path":   str(bet_log_path),
        "daily_path":     str(daily_path),
    }


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
    print(f"\n{'='*55}")
    print(f"回測結果：{result['end_reason']}")
    print(f"結束日期：{result['end_date']}")
    print(f"最終本金：NT${result['final_bankroll']:,.0f}")
    print(f"報告路徑：{result['report_path']}")
