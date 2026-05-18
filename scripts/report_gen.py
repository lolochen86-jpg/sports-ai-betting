"""
每日報告生成器

流程：
  1. 讀取 data/bankroll.json（本金紀錄）
  2. 讀取昨日下注明細（backtest_log 或 live picks）
  3. 載入今日 DailyPlan（由 analyze.run() 產生）
  4. 用 Jinja2 渲染 Markdown + HTML
  5. 寫入 reports/YYYY-MM-DD.md 與 docs/YYYY-MM-DD.html
  6. 更新 docs/index.html（首頁）與 data/performance.json
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from utils import (
    ROOT_DIR, DATA_DIR, get_logger, save_json, load_json,
    json_exists, parse_date, today_tw
)

logger = get_logger("report_gen")

REPORTS_DIR  = ROOT_DIR / "reports"
DOCS_DIR     = ROOT_DIR / "docs"
TEMPLATE_DIR = ROOT_DIR / "templates"
BANKROLL_PATH    = DATA_DIR / "bankroll.json"
PERFORMANCE_PATH = DATA_DIR / "performance.json"

REPORTS_DIR.mkdir(exist_ok=True)
DOCS_DIR.mkdir(exist_ok=True)


# ── 本金帳本 ──────────────────────────────────────────────
def load_bankroll() -> dict:
    if json_exists(BANKROLL_PATH):
        return load_json(BANKROLL_PATH)
    init = {
        "initial":   3000.0,
        "current":   3000.0,
        "peak":      3000.0,
        "history":   [],       # [{date, open, close, pnl, bets}]
    }
    save_json(init, BANKROLL_PATH)
    return init


def update_bankroll(bankroll: dict, d: date,
                    open_: float, close: float,
                    pnl: float, bets: int) -> dict:
    bankroll["current"] = close
    bankroll["peak"]    = max(bankroll["peak"], close)
    bankroll["history"].append({
        "date":  d.isoformat(),
        "open":  open_,
        "close": close,
        "pnl":   pnl,
        "bets":  bets,
    })
    save_json(bankroll, BANKROLL_PATH)
    return bankroll


def bankroll_stats(bankroll: dict) -> dict:
    cur    = bankroll["current"]
    init   = bankroll["initial"]
    peak   = bankroll["peak"]
    roi    = (cur - init) / init * 100
    dd     = (peak - cur) / peak * 100 if peak > 0 else 0
    streak = _compute_streak(bankroll["history"])
    return {
        "initial":    init,
        "current":    cur,
        "peak":       peak,
        "roi":        roi,
        "drawdown":   dd,
        "streak":     streak,   # 正數=連勝天數，負數=連虧天數
    }


def _compute_streak(history: list) -> int:
    if not history:
        return 0
    streak = 0
    sign   = 1 if history[-1]["pnl"] >= 0 else -1
    for entry in reversed(history):
        if (entry["pnl"] >= 0) == (sign == 1):
            streak += sign
        else:
            break
    return streak


# ── 昨日成績讀取 ──────────────────────────────────────────
def load_yesterday_results(yesterday: date) -> list[dict]:
    """
    讀取昨日每注的結算結果。
    來源：data/backtest/backtest_log_*.csv 或 data/live/picks_YYYY-MM-DD.json
    """
    from utils import BACKTEST_DIR
    import csv

    # 優先讀取 live picks 結算檔
    live_path = DATA_DIR / "live" / f"settled_{yesterday.isoformat()}.json"
    if json_exists(live_path):
        return load_json(live_path)

    # 回測模式：從 CSV 讀取
    for csv_path in sorted((BACKTEST_DIR).glob("backtest_log_*.csv"), reverse=True):
        try:
            with open(csv_path, newline="", encoding="utf-8") as f:
                rows = [r for r in csv.DictReader(f)
                        if r.get("date") == yesterday.isoformat()]
                if rows:
                    return rows
        except Exception:
            continue
    return []


# ── 績效統計更新 ──────────────────────────────────────────
def update_performance(d: date, results: list[dict]) -> dict:
    perf = load_json(PERFORMANCE_PATH) if json_exists(PERFORMANCE_PATH) else {
        "total_bets": 0, "wins": 0, "losses": 0,
        "total_wagered": 0.0, "total_pnl": 0.0,
        "single_bets": 0, "single_wins": 0,
        "parlay_bets": 0, "parlay_wins": 0,
        "by_sport": {"NBA": {"bets": 0, "wins": 0},
                     "MLB": {"bets": 0, "wins": 0}},
        "daily": [],
    }

    day_bets  = len(results)
    day_wins  = sum(1 for r in results if r.get("result") == "WIN")
    day_pnl   = sum(float(r.get("pnl", 0)) for r in results)
    day_waged = sum(float(r.get("bet_amount", 0)) for r in results)

    perf["total_bets"]    += day_bets
    perf["wins"]          += day_wins
    perf["losses"]        += sum(1 for r in results if r.get("result") == "LOSS")
    perf["total_wagered"] += day_waged
    perf["total_pnl"]     += day_pnl

    for r in results:
        is_parlay = "parlay" in r.get("bet_type", "")
        sport     = r.get("sport", "")
        if is_parlay:
            perf["parlay_bets"] += 1
            if r.get("result") == "WIN":
                perf["parlay_wins"] += 1
        else:
            perf["single_bets"] += 1
            if r.get("result") == "WIN":
                perf["single_wins"] += 1
        if sport in perf["by_sport"]:
            perf["by_sport"][sport]["bets"] += 1
            if r.get("result") == "WIN":
                perf["by_sport"][sport]["wins"] += 1

    perf["daily"].append({
        "date": d.isoformat(), "bets": day_bets,
        "wins": day_wins, "pnl": day_pnl,
    })
    save_json(perf, PERFORMANCE_PATH)
    return perf


# ── Jinja2 環境 ───────────────────────────────────────────
def _make_jinja_env() -> Environment:
    env = Environment(
        loader=select_autoescape(["html", "j2"]),
        autoescape=False,
    )
    env.loader = FileSystemLoader(str(TEMPLATE_DIR))

    # 自定義 filter
    env.filters["ntd"]     = lambda v: f"NT${float(v):,.0f}"
    env.filters["pct"]     = lambda v: f"{float(v)*100:.1f}%"
    env.filters["sign_ntd"] = lambda v: f"+NT${float(v):,.0f}" if float(v) >= 0 else f"-NT${abs(float(v)):,.0f}"
    env.filters["odds_fmt"] = lambda v: f"{float(v):.2f}" if v else "—"
    env.filters["result_icon"] = lambda v: {"WIN": "✅", "LOSS": "❌", "VOID": "⚪"}.get(v, "—")
    return env


# ── 報告渲染 ──────────────────────────────────────────────
def render_report(
    report_date: date,
    plan,                    # analyze.DailyPlan（主策略，向下相容）
    yesterday_results: list[dict],
    bankroll: dict,
    perf: dict,
    plans: dict | None = None,
) -> tuple[str, str]:
    """
    渲染 Markdown 與 HTML 報告。
    回傳 (markdown_str, html_str)
    """
    env   = _make_jinja_env()
    stats = bankroll_stats(bankroll)

    ctx = _build_context(report_date, plan, yesterday_results, stats, perf, plans=plans)

    md_tmpl   = env.get_template("report.md.j2")
    html_tmpl = env.get_template("report.html.j2")

    return md_tmpl.render(**ctx), html_tmpl.render(**ctx)


def _build_context(
    d: date, plan, results: list[dict],
    stats: dict, perf: dict,
    plans: dict | None = None,
) -> dict:
    """組合模板所需的所有變數。"""
    yesterday = d - timedelta(days=1)

    # 昨日成績彙整
    yest_total_bet = sum(float(r.get("bet_amount", 0)) for r in results)
    yest_pnl       = sum(float(r.get("pnl", 0)) for r in results)
    yest_wins      = sum(1 for r in results if r.get("result") == "WIN")

    # 今日下注明細
    singles = []
    if plan:
        for p in plan.single_picks:
            amt = p.bet_amount(stats["current"])
            singles.append({
                "label":      p.bet_label,
                "sport":      p.sport,
                "matchup":    f"{p.away_team}@{p.home_team}",
                "odds":       p.odds,
                "true_prob":  p.true_prob,
                "edge":       p.edge,
                "grade":      p.grade,
                "amount":     amt,
                "potential":  round(amt * (p.odds - 1), 0),
                "data_card":  p.data_card(stats["current"]),
            })

    parlays = []
    if plan:
        for par in plan.parlays:
            amt = par.bet_amount(stats["current"])
            parlays.append({
                "label":      par.label,
                "legs":       [{"label": lg.bet_label, "odds": lg.odds,
                                "sport": lg.sport,
                                "matchup": f"{lg.away_team}@{lg.home_team}"}
                               for lg in par.legs],
                "parlay_odds": par.parlay_odds,
                "true_prob":  par.true_prob,
                "parlay_ev":  par.parlay_ev,
                "amount":     amt,
                "potential":  round(amt * (par.parlay_odds - 1), 0),
            })

    total_today = sum(s["amount"] for s in singles) + sum(p["amount"] for p in parlays)

    # 三策略資料
    _STRATEGY_LABELS = {
        "conservative": "穩健型",
        "aggressive":   "激進型",
        "underdog":     "冷門獵人型",
    }
    strategies = []
    if plans:
        for slug, label in _STRATEGY_LABELS.items():
            p = plans.get(slug)
            if p is None:
                strategies.append({"name": label, "singles": [], "parlays": [], "total": 0, "no_picks": True})
                continue
            s_list = []
            for pick in p.single_picks:
                amt = pick.bet_amount(stats["current"])
                s_list.append({
                    "label":     pick.bet_label,
                    "sport":     pick.sport,
                    "matchup":   f"{pick.away_team}@{pick.home_team}",
                    "odds":      pick.odds,
                    "true_prob": pick.true_prob,
                    "edge":      pick.edge,
                    "grade":     pick.grade,
                    "amount":    amt,
                    "potential": round(amt * (pick.odds - 1), 0),
                })
            pa_list = []
            for par in p.parlays:
                amt = par.bet_amount(stats["current"])
                pa_list.append({
                    "label":       par.label,
                    "legs":        [{"label": lg.bet_label, "odds": lg.odds} for lg in par.legs],
                    "parlay_odds": par.parlay_odds,
                    "parlay_ev":   par.parlay_ev,
                    "amount":      amt,
                    "potential":   round(amt * (par.parlay_odds - 1), 0),
                })
            total = sum(x["amount"] for x in s_list) + sum(x["amount"] for x in pa_list)
            strategies.append({
                "name":     label,
                "singles":  s_list,
                "parlays":  pa_list,
                "total":    total,
                "no_picks": len(s_list) == 0 and len(pa_list) == 0,
            })

    # 整體勝率
    win_rate_single = (perf["single_wins"] / perf["single_bets"] * 100
                       if perf["single_bets"] > 0 else 0)
    win_rate_parlay = (perf["parlay_wins"] / perf["parlay_bets"] * 100
                       if perf["parlay_bets"] > 0 else 0)
    roi = (perf["total_pnl"] / perf["total_wagered"] * 100
           if perf["total_wagered"] > 0 else 0)

    return {
        "report_date":    d.isoformat(),
        "yesterday_date": yesterday.isoformat(),
        "publish_time":   "22:00（台灣時間）",

        # 本金
        "bankroll_initial": stats["initial"],
        "bankroll_current": stats["current"],
        "bankroll_peak":    stats["peak"],
        "bankroll_roi":     stats["roi"],
        "bankroll_dd":      stats["drawdown"],
        "bankroll_streak":  stats["streak"],

        # 昨日
        "yesterday_results":   results,
        "yesterday_total_bet": yest_total_bet,
        "yesterday_pnl":       yest_pnl,
        "yesterday_wins":      yest_wins,
        "yesterday_total":     len(results),

        # 今日
        "singles":      singles,
        "parlays":      parlays,
        "total_today":  total_today,
        "no_picks":     len(singles) == 0 and len(parlays) == 0,

        # 歷史績效
        "perf_total_bets":   perf["total_bets"],
        "perf_roi":          roi,
        "win_rate_single":   win_rate_single,
        "win_rate_parlay":   win_rate_parlay,
        "perf_nba_bets":     perf["by_sport"]["NBA"]["bets"],
        "perf_nba_wins":     perf["by_sport"]["NBA"]["wins"],
        "perf_mlb_bets":     perf["by_sport"]["MLB"]["bets"],
        "perf_mlb_wins":     perf["by_sport"]["MLB"]["wins"],

        # 三策略明細
        "strategies": strategies,

        # 給首頁圖表用的 JSON（最近 30 天本金曲線）
        "chart_data": json.dumps(_build_chart_data()),
    }


def _build_chart_data() -> dict:
    """產生 Chart.js 格式的本金曲線數據。"""
    bk = load_bankroll()
    hist = bk.get("history", [])[-30:]  # 最近 30 天
    return {
        "labels": [h["date"] for h in hist],
        "values": [h["close"] for h in hist],
        "initial": bk["initial"],
    }


# ── 寫入檔案 ──────────────────────────────────────────────
def write_daily_report(d: date, md_str: str, html_str: str) -> tuple[Path, Path]:
    md_path   = REPORTS_DIR / f"{d.isoformat()}.md"
    html_path = DOCS_DIR    / f"{d.isoformat()}.html"
    md_path.write_text(md_str,   encoding="utf-8")
    html_path.write_text(html_str, encoding="utf-8")
    logger.info(f"報告已寫入：{md_path.name} / {html_path.name}")
    return md_path, html_path


def update_index_html(perf: dict, bankroll: dict) -> Path:
    """更新 GitHub Pages 首頁 index.html。"""
    env      = _make_jinja_env()
    stats    = bankroll_stats(bankroll)
    tmpl     = env.get_template("index.html.j2")
    chart_d  = _build_chart_data()

    # 最近 10 份報告連結
    recent_reports = sorted(
        [p.stem for p in DOCS_DIR.glob("????-??-??.html")],
        reverse=True,
    )[:10]

    html = tmpl.render(
        stats=stats,
        perf=perf,
        chart_data=json.dumps(chart_d),
        recent_reports=recent_reports,
        today=today_tw().isoformat(),
    )
    idx_path = DOCS_DIR / "index.html"
    idx_path.write_text(html, encoding="utf-8")
    logger.info("首頁 index.html 已更新")
    return idx_path


# ── 主流程 ────────────────────────────────────────────────
def run(plan=None, plans: dict | None = None, report_date: date | str | None = None) -> dict:
    """
    執行完整報告生成流程。
    plans: dict 含三策略 {"conservative": DailyPlan, "aggressive": DailyPlan, "underdog": DailyPlan}
    plan:  單一 DailyPlan（向下相容舊呼叫方式）
    """
    # 向下相容：若只傳 plan，包成 plans dict
    if plans is None:
        plans = {"conservative": plan, "aggressive": None, "underdog": None}

    d         = parse_date(report_date) if report_date else today_tw()
    yesterday = d - timedelta(days=1)

    logger.info(f"===== 報告生成：{d} =====")

    # 1. 讀取昨日成績
    results = load_yesterday_results(yesterday)
    yest_pnl = sum(float(r.get("pnl", 0)) for r in results)
    logger.info(f"昨日成績：{len(results)} 注，盈虧 NT${yest_pnl:+,.0f}")

    # 2. 更新本金帳本
    bankroll = load_bankroll()
    open_bk  = bankroll["current"]
    close_bk = open_bk + yest_pnl
    bankroll  = update_bankroll(bankroll, yesterday, open_bk, close_bk,
                                yest_pnl, len(results))

    # 3. 更新績效統計
    perf = update_performance(yesterday, results)

    # 4. 渲染報告
    plan = plans.get("conservative") if plans else None
    md_str, html_str = render_report(d, plan, results, bankroll, perf, plans=plans)

    # 5. 寫入檔案
    md_path, html_path = write_daily_report(d, md_str, html_str)
    idx_path = update_index_html(perf, bankroll)

    stats = bankroll_stats(bankroll)
    logger.info(f"本金：NT${stats['current']:,.0f}（ROI {stats['roi']:+.1f}%）")
    logger.info(f"===== 報告完成 =====")

    return {
        "report_date":  d.isoformat(),
        "md_path":      str(md_path),
        "html_path":    str(html_path),
        "index_path":   str(idx_path),
        "bankroll":     stats["current"],
        "roi":          stats["roi"],
    }


if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else None
    run(report_date=d)
