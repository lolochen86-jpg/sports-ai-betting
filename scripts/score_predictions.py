from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from analyze import mlb_win_probability, nba_win_probability
from utils import (
    DATA_DIR,
    MLB_DIR,
    NBA_DIR,
    TW_TZ,
    get_logger,
    json_exists,
    load_json,
    parse_date,
    save_json,
)

logger = get_logger("score_predictions")

LIVE_DIR = DATA_DIR / "live"

STRATEGIES = {
    "conservative": {
        "name": "穩健型 Conservative",
        "total_mult": 0.98,
        "margin_mult": 0.82,
        "underdog_shift": 0.0,
    },
    "aggressive": {
        "name": "激進型 Aggressive",
        "total_mult": 1.03,
        "margin_mult": 1.18,
        "underdog_shift": 0.0,
    },
    "underdog": {
        "name": "冷門獵人 Underdog",
        "total_mult": 1.00,
        "margin_mult": 0.92,
        "underdog_shift": 1.0,
    },
}


def prediction_path(report_date: date | str) -> Any:
    d = parse_date(report_date)
    target = d + timedelta(days=1)
    return LIVE_DIR / f"score_predictions_{d.isoformat()}_for_{target.isoformat()}.json"


def load_predictions(report_date: date | str) -> dict:
    path = prediction_path(report_date)
    if json_exists(path):
        return load_json(path)
    return run(report_date, save=False)


def run(report_date: date | str | None = None, save: bool = True) -> dict:
    d = parse_date(report_date) if report_date else datetime.now(TW_TZ).date()
    target = d + timedelta(days=1)

    nba_games = _load_tw_target_games(NBA_DIR, target, "NBA")
    mlb_games = _load_tw_target_games(MLB_DIR, target, "MLB")
    source_note = _source_note(nba_games, mlb_games)

    payload = {
        "report_date": d.isoformat(),
        "target_date": target.isoformat(),
        "timezone": "Asia/Taipei",
        "generated_at_tw": datetime.now(TW_TZ).isoformat(timespec="seconds"),
        "source_note": source_note,
        "strategies": [],
    }

    all_rows = [_predict_game(g, "NBA") for g in nba_games]
    all_rows.extend(_predict_game(g, "MLB") for g in mlb_games)
    all_rows = [r for r in all_rows if r]
    all_rows.sort(key=lambda r: (r.get("tw_datetime_sort") or "9999", r["sport"], r["matchup"]))

    for slug, profile in STRATEGIES.items():
        games = [_apply_strategy(row, slug, profile) for row in all_rows]
        payload["strategies"].append({
            "slug": slug,
            "name": profile["name"],
            "games": games,
            "total_games": len(games),
        })

    if save:
        out = prediction_path(d)
        save_json(payload, out)
        logger.info(f"隔天比分預測已寫入：{out.name}")
    return payload


def _load_games_or_schedule(base_dir, target: date, sport: str) -> list[dict]:
    games_path = base_dir / f"games_{target.isoformat()}.json"
    schedule_path = base_dir / f"schedule_{target.isoformat()}.json"
    schedule = load_json(schedule_path) if json_exists(schedule_path) else []

    if json_exists(games_path):
        games = load_json(games_path)
        if games:
            out = list(games)
            seen = {_game_key(g, sport) for g in out}
            for sched in schedule:
                key = _game_key(sched, sport)
                if key not in seen:
                    out.append(_schedule_to_game(sched, sport, target))
            return out

    if schedule:
        return [_schedule_to_game(g, sport, target) for g in schedule]

    return []


def _load_tw_target_games(base_dir, target: date, sport: str) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for source_date in [target - timedelta(days=1), target]:
        for game in _load_games_or_schedule(base_dir, source_date, sport):
            if not _belongs_to_tw_date(game, target):
                continue
            key = _game_key(game, sport)
            if key in seen:
                continue
            seen.add(key)
            out.append(game)
    return out


def _belongs_to_tw_date(game: dict, target: date) -> bool:
    dt = _parse_utc(game.get("game_time_utc", ""))
    if dt:
        return dt.astimezone(TW_TZ).date() == target
    return game.get("game_date") == target.isoformat()


def _game_key(game: dict, sport: str) -> str:
    if sport == "NBA":
        return str(game.get("game_id", ""))
    return str(game.get("game_pk", ""))


def _schedule_to_game(game: dict, sport: str, target: date) -> dict:
    if sport == "NBA":
        return {
            "game_id": str(game.get("game_id", "")),
            "game_date": target.isoformat(),
            "home_team": game.get("home_team_abbr", ""),
            "away_team": game.get("away_team_abbr", ""),
            "game_time_utc": game.get("game_time_utc", ""),
            "arena": game.get("arena", ""),
            "data_quality": "schedule_only",
        }
    return {
        "game_pk": game.get("game_pk"),
        "game_date": target.isoformat(),
        "home_team": game.get("home_team_abbr", ""),
        "away_team": game.get("away_team_abbr", ""),
        "game_time_utc": game.get("game_time_utc", ""),
        "venue": game.get("venue_name", ""),
        "home_starter_name": game.get("home_starter_name", "TBD"),
        "away_starter_name": game.get("away_starter_name", "TBD"),
        "data_quality": "schedule_only",
    }


def _predict_game(game: dict, sport: str) -> dict | None:
    home = game.get("home_team") or game.get("home_team_abbr")
    away = game.get("away_team") or game.get("away_team_abbr")
    if not home or not away:
        return None

    if sport == "NBA":
        home_prob, _ = _safe_prob(nba_win_probability, game)
        base_home, base_away = _nba_base_score(game, home_prob)
        venue = game.get("arena", "")
    else:
        home_prob, _ = _safe_prob(mlb_win_probability, game)
        base_home, base_away = _mlb_base_score(game, home_prob)
        venue = game.get("venue", "")

    return {
        "sport": sport,
        "game_id": str(game.get("game_id") or game.get("game_pk") or ""),
        "matchup": f"{away}@{home}",
        "home_team": home,
        "away_team": away,
        "home_win_prob": round(home_prob, 4),
        "base_home_score": base_home,
        "base_away_score": base_away,
        "tw_time": _format_tw_time(game.get("game_time_utc", "")),
        "tw_datetime_sort": _tw_sort_key(game.get("game_time_utc", "")),
        "venue": venue,
        "data_quality": game.get("data_quality", "model"),
        "home_starter": game.get("home_starter_name", ""),
        "away_starter": game.get("away_starter_name", ""),
    }


def _safe_prob(fn, game: dict) -> tuple[float, Any]:
    try:
        return fn(game)
    except Exception:
        return 0.54, None


def _nba_base_score(game: dict, home_prob: float) -> tuple[float, float]:
    pace = _avg(game.get("home_pace"), game.get("away_pace"), default=98.5)
    home_pp100 = _avg(game.get("home_ortg"), game.get("away_drtg"), default=113.0)
    away_pp100 = _avg(game.get("away_ortg"), game.get("home_drtg"), default=111.5)
    home = pace * home_pp100 / 100.0 + 1.5
    away = pace * away_pp100 / 100.0
    target_margin = (home_prob - 0.5) * 24.0
    return _blend_margin(home, away, target_margin)


def _mlb_base_score(game: dict, home_prob: float) -> tuple[float, float]:
    park = (float(game.get("park_factor", 100) or 100) - 100.0) / 100.0
    home = (
        0.50 * float(game.get("home_runs_per_game", 4.45) or 4.45)
        + 0.30 * float(game.get("away_starter_fip", 4.20) or 4.20)
        + 0.20 * float(game.get("away_bullpen_era_3d", 4.20) or 4.20)
        + park * 0.35
        + 0.15
    )
    away = (
        0.50 * float(game.get("away_runs_per_game", 4.35) or 4.35)
        + 0.30 * float(game.get("home_starter_fip", 4.20) or 4.20)
        + 0.20 * float(game.get("home_bullpen_era_3d", 4.20) or 4.20)
        + park * 0.35
    )
    target_margin = (home_prob - 0.5) * 6.0
    return _blend_margin(home, away, target_margin)


def _apply_strategy(row: dict, slug: str, profile: dict) -> dict:
    home = float(row["base_home_score"])
    away = float(row["base_away_score"])
    total = (home + away) * profile["total_mult"]
    margin = (home - away) * profile["margin_mult"]

    if slug == "underdog":
        favorite_home = row["home_win_prob"] >= 0.5
        if favorite_home:
            margin -= profile["underdog_shift"]
        else:
            margin += profile["underdog_shift"]

    pred_home = max(0, int(round((total + margin) / 2.0)))
    pred_away = max(0, int(round((total - margin) / 2.0)))

    if pred_home == pred_away:
        if margin >= 0:
            pred_home += 1
        else:
            pred_away += 1

    winner = row["home_team"] if pred_home > pred_away else row["away_team"]
    confidence = _confidence(row["home_win_prob"], pred_home, pred_away, slug)
    out = dict(row)
    out.update({
        "pred_home_score": pred_home,
        "pred_away_score": pred_away,
        "predicted_score": f"{row['away_team']} {pred_away} - {row['home_team']} {pred_home}",
        "predicted_winner": winner,
        "confidence": confidence,
    })
    out.pop("base_home_score", None)
    out.pop("base_away_score", None)
    out.pop("tw_datetime_sort", None)
    return out


def _blend_margin(home: float, away: float, target_margin: float) -> tuple[float, float]:
    total = max(1.0, home + away)
    current_margin = home - away
    margin = current_margin * 0.55 + target_margin * 0.45
    return (total + margin) / 2.0, (total - margin) / 2.0


def _confidence(home_prob: float, home_score: int, away_score: int, slug: str) -> str:
    edge = abs(home_prob - 0.5)
    margin = abs(home_score - away_score)
    if slug == "underdog" and edge < 0.08:
        return "中"
    if edge >= 0.12 or margin >= 8:
        return "高"
    if edge >= 0.06 or margin >= 4:
        return "中"
    return "低"


def _avg(a, b, default: float) -> float:
    vals = [float(x) for x in [a, b] if x is not None]
    if not vals:
        return default
    return sum(vals) / len(vals)


def _format_tw_time(value: str) -> str:
    dt = _parse_utc(value)
    if not dt:
        return "台灣時間待定"
    return dt.astimezone(TW_TZ).strftime("%m/%d %H:%M")


def _tw_sort_key(value: str) -> str:
    dt = _parse_utc(value)
    if not dt:
        return ""
    return dt.astimezone(TW_TZ).isoformat()


def _parse_utc(value: str) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _source_note(nba_games: list[dict], mlb_games: list[dict]) -> str:
    total = len(nba_games) + len(mlb_games)
    if total == 0:
        return "尚未取得隔天 NBA / MLB 賽程資料"
    schedule_only = sum(1 for g in nba_games + mlb_games if g.get("data_quality") == "schedule_only")
    if schedule_only == total:
        return "目前僅有隔天賽程，比分以聯盟平均與主場修正預估"
    if schedule_only:
        return "部分比賽缺少完整模型資料，已用賽程與聯盟平均補足"
    return "使用隔天賽程、球隊模型資料與先發/攻守資料產生"


if __name__ == "__main__":
    import sys

    arg = sys.argv[1] if len(sys.argv) > 1 else None
    run(arg)
