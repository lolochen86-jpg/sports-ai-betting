"""
每日主流程整合腳本（GitHub Actions 呼叫）

執行順序：
  1. 載入 NBA / MLB 數據包（已由前面步驟抓取並快取）
  2. 載入賠率並配對
  3. 執行分析引擎，產生 DailyPlan
  4. 儲存今日計劃至 data/live/plan_YYYY-MM-DD.json
  5. 報告生成器讀取計劃後渲染報告（由 report_gen.py 單獨執行）
"""

import os
import sys
from datetime import date
from pathlib import Path

from utils import (
    ROOT_DIR, DATA_DIR, NBA_DIR, MLB_DIR,
    get_logger, save_json, load_json, json_exists, parse_date, today_tw
)
import fetch_odds
from analyze import run as analyze_run, CONSERVATIVE, AGGRESSIVE, UNDERDOG

logger = get_logger("run_daily")

LIVE_DIR = DATA_DIR / "live"
LIVE_DIR.mkdir(exist_ok=True)


def run(report_date: date | str | None = None, dry_run: bool = False) -> None:
    d = parse_date(report_date) if report_date else today_tw()
    logger.info(f"===== 每日主流程：{d}  dry_run={dry_run} =====")

    # 1. 載入數據包
    nba_path = NBA_DIR / f"games_{d.isoformat()}.json"
    mlb_path = MLB_DIR / f"games_{d.isoformat()}.json"
    nba_games = load_json(nba_path) if json_exists(nba_path) else []
    mlb_games = load_json(mlb_path) if json_exists(mlb_path) else []
    logger.info(f"  NBA {len(nba_games)} 場 / MLB {len(mlb_games)} 場")

    # 2. 賠率配對
    for sport, games, path in [("NBA", nba_games, nba_path), ("MLB", mlb_games, mlb_path)]:
        if not games:
            continue
        odds = fetch_odds.run(sport, d)
        if odds:
            merged = fetch_odds.match_odds_to_games(games, odds, sport)
            save_json(merged, path)
            # 重新載入已合併版本
            if sport == "NBA":
                nba_games = merged
            else:
                mlb_games = merged
        else:
            logger.warning(f"  {sport} 賠率取得失敗，跳過該球種")
            if sport == "NBA":
                nba_games = []
            else:
                mlb_games = []

    # 3. 分析引擎
    from utils import load_json as lj
    bk = lj(DATA_DIR / "bankroll.json") if json_exists(DATA_DIR / "bankroll.json") \
         else {"current": 3000.0}
    bankroll = bk.get("current", 3000.0)

    # ── 停利停損檢查 ────────────────────────────────────────
    from analyze import check_stop_condition, _TARGET_BANKROLL, _RUIN_THRESHOLD
    should_stop, stop_reason = check_stop_condition(bankroll)
    if should_stop:
        logger.warning(f"===== 停止交易 =====")
        logger.warning(stop_reason)
        # 更新 bankroll.json 狀態
        bk["status"] = "target_reached" if bankroll >= _TARGET_BANKROLL else "ruined"
        bk["stop_date"] = d.isoformat()
        bk["stop_reason"] = stop_reason
        save_json(bk, DATA_DIR / "bankroll.json")
        # 仍生成報告（但無下注計劃）
        import report_gen
        report_gen.run(plan=None, report_date=d)
        return

    # 三個策略分別執行
    plan_c = analyze_run(nba_games, mlb_games, bankroll, d.isoformat(), cfg=CONSERVATIVE)
    plan_a = analyze_run(nba_games, mlb_games, bankroll, d.isoformat(), cfg=AGGRESSIVE)
    plan_u = analyze_run(nba_games, mlb_games, bankroll, d.isoformat(), cfg=UNDERDOG)

    plans = {
        "conservative": plan_c,
        "aggressive":   plan_a,
        "underdog":     plan_u,
    }

    # 4. 序列化計劃（Pick / Parlay dataclass → dict）
    import dataclasses

    def _plan_to_dict(plan, dry_run=False):
        return {
            "date":         plan.date,
            "bankroll":     plan.bankroll,
            "total_bet":    plan.total_bet,
            "single_picks": [dataclasses.asdict(p) for p in plan.single_picks],
            "parlays": [
                {
                    "legs":        [dataclasses.asdict(lg) for lg in par.legs],
                    "parlay_odds": par.parlay_odds,
                    "true_prob":   par.true_prob,
                    "parlay_ev":   par.parlay_ev,
                    "kelly_frac":  par.kelly_frac,
                }
                for par in plan.parlays
            ],
            "dry_run": dry_run,
        }

    for slug, plan in [("conservative", plan_c), ("aggressive", plan_a), ("underdog", plan_u)]:
        plan_path = LIVE_DIR / f"plan_{d.isoformat()}_{slug}.json"
        save_json(_plan_to_dict(plan, dry_run), plan_path)
        logger.info(f"計劃已儲存：{plan_path.name}  單關 {len(plan.single_picks)} 注，串關 {len(plan.parlays)} 組")

    # 冷門獵人型為預設策略（settle.py 讀取無後綴的計劃檔）
    default_path = LIVE_DIR / f"plan_{d.isoformat()}.json"
    save_json(_plan_to_dict(plan_u, dry_run), default_path)
    logger.info(f"預設策略（冷門獵人型）已儲存：{default_path.name}")

    # 5. 報告生成（傳入三個策略計劃）
    import report_gen
    report_gen.run(plans=plans, report_date=d)


if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    dry      = os.environ.get("DRY_RUN", "false").lower() == "true"
    run(date_arg, dry_run=dry)
