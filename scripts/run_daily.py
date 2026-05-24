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
from datetime import date, timedelta
from pathlib import Path

from utils import (
    ROOT_DIR, DATA_DIR, NBA_DIR, MLB_DIR,
    get_logger, save_json, load_json, json_exists, parse_date, today_tw
)
import fetch_odds
import fetch_mlb
import fetch_nba
import score_predictions
from analyze import (
    DailyPlan,
    run as analyze_run,
    CONSERVATIVE,
    AGGRESSIVE,
    UNDERDOG,
)

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

    # 3. 分析引擎（三策略各自讀取獨立本金）
    def _load_strategy_bankroll(slug: str) -> float:
        """讀取策略專屬本金帳本，若不存在則 fallback 到共用帳本。"""
        path = DATA_DIR / f"bankroll_{slug}.json"
        if json_exists(path):
            return float(load_json(path).get("current", 3000.0))
        # fallback：讀共用帳本
        bk_path = DATA_DIR / "bankroll.json"
        return float((load_json(bk_path) if json_exists(bk_path) else {}).get("current", 3000.0))

    bankroll_c = _load_strategy_bankroll("conservative")
    bankroll_a = _load_strategy_bankroll("aggressive")
    bankroll_u = _load_strategy_bankroll("underdog")
    logger.info(f"  本金 穩健型 NT${bankroll_c:,.0f} / 激進型 NT${bankroll_a:,.0f} / 冷門型 NT${bankroll_u:,.0f}")

    # ── 停利停損檢查（三策略各自判斷，不只看 underdog）────────
    from analyze import check_stop_condition, _TARGET_BANKROLL, _RUIN_THRESHOLD
    strategy_inputs = {
        "conservative": (CONSERVATIVE, bankroll_c),
        "aggressive": (AGGRESSIVE, bankroll_a),
        "underdog": (UNDERDOG, bankroll_u),
    }
    stopped: dict[str, str] = {}
    for slug, (_, bankroll) in strategy_inputs.items():
        should_stop, stop_reason = check_stop_condition(bankroll)
        if not should_stop:
            continue
        stopped[slug] = stop_reason
        logger.warning(f"[{slug}] 停止交易：{stop_reason}")
        bk_path = DATA_DIR / f"bankroll_{slug}.json"
        bk = load_json(bk_path) if json_exists(bk_path) else {
            "initial": 3000.0, "current": bankroll, "peak": max(3000.0, bankroll),
            "strategy": slug, "history": [],
        }
        bk["current"] = bankroll
        bk["status"] = "target_reached" if bankroll >= _TARGET_BANKROLL else "ruined"
        bk["stop_date"] = d.isoformat()
        bk["stop_reason"] = stop_reason
        save_json(bk, bk_path)
        if slug == "underdog":
            save_json(bk, DATA_DIR / "bankroll.json")

    def _empty_stopped_plan(bankroll: float, reason: str) -> DailyPlan:
        return DailyPlan(
            date=d.isoformat(),
            bankroll=bankroll,
            single_picks=[],
            parlays=[],
            total_bet=0.0,
            reserved=bankroll,
            required_5_leg_note=f"stopped; {reason}",
        )

    # 三個策略分別執行，使用各自本金；已停用者保留空計劃供報表顯示原因。
    plan_c = (
        _empty_stopped_plan(bankroll_c, stopped["conservative"])
        if "conservative" in stopped
        else analyze_run(nba_games, mlb_games, bankroll_c, d.isoformat(), cfg=CONSERVATIVE)
    )
    plan_a = (
        _empty_stopped_plan(bankroll_a, stopped["aggressive"])
        if "aggressive" in stopped
        else analyze_run(nba_games, mlb_games, bankroll_a, d.isoformat(), cfg=AGGRESSIVE)
    )
    plan_u = (
        _empty_stopped_plan(bankroll_u, stopped["underdog"])
        if "underdog" in stopped
        else analyze_run(nba_games, mlb_games, bankroll_u, d.isoformat(), cfg=UNDERDOG)
    )

    plans = {
        "conservative": plan_c,
        "aggressive":   plan_a,
        "underdog":     plan_u,
    }

    # 預先準備台灣時間隔天賽程與三位分析師比分預測。
    next_d = d + timedelta(days=1)
    for pred_source_d in [d, next_d]:
        try:
            fetch_nba.run(pred_source_d)
        except Exception as e:
            logger.warning(f"NBA 台灣隔天預測來源資料準備失敗：{pred_source_d} {e}")
        try:
            fetch_mlb.run(pred_source_d)
        except Exception as e:
            logger.warning(f"MLB 台灣隔天預測來源資料準備失敗：{pred_source_d} {e}")
    try:
        score_predictions.run(d)
    except Exception as e:
        logger.warning(f"隔天比分預測產生失敗：{next_d} {e}")

    # 4. 序列化計劃（Pick / Parlay dataclass → dict）
    import dataclasses

    def _plan_to_dict(plan, dry_run=False):
        return {
            "date":         plan.date,
            "bankroll":     plan.bankroll,
            "total_bet":    plan.total_bet,
            "required_5_leg_note": getattr(plan, "required_5_leg_note", ""),
            "required_5_leg_candidates": getattr(plan, "required_5_leg_candidates", []),
            "single_picks": [dataclasses.asdict(p) for p in plan.single_picks],
            "parlays": [
                {
                    "legs":        [dataclasses.asdict(lg) for lg in par.legs],
                    "parlay_odds": par.parlay_odds,
                    "true_prob":   par.true_prob,
                    "parlay_ev":   par.parlay_ev,
                    "kelly_frac":  par.kelly_frac,
                    "fixed_bet":   par.fixed_bet,
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
