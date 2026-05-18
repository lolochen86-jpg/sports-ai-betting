"""
分析引擎

輸入：fetch_nba / fetch_mlb 產生的數據包 + fetch_odds 賠率
輸出：每場比賽的完整分析結果，含：
  - 模型估算勝率（附各調整項明細）
  - Edge（模型勝率 - 公平隱含勝率）
  - 凱利注碼建議
  - 信心等級（A/B/C）
  - 數據卡文字（用於報告）

Edge ≥ 4% 才納入候選；串關 EV ≥ 8% 才組合。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from datetime import date
from itertools import combinations
from typing import Optional

from utils import (
    get_logger, fair_implied_prob, edge as calc_edge,
    kelly_fraction, kelly_bet_amount, validate_nba_game, validate_mlb_game,
    validate_odds
)
from team_names import nba_zh, mlb_zh

logger = get_logger("analyze")

# ── 模型參數預設值（穩健型）────────────────────────────
_MIN_EDGE          = 0.04    # 最低 Edge 門檻
_MIN_TRUE_PROB     = 0.52    # 最低估算勝率
_MIN_ODDS          = 1.70    # 最低賠率（過低無串關價值）
_MAX_ODDS          = 3.50    # 最高賠率（冷門風險過高）
_PARLAY_MIN_EV     = 0.08    # 串關最低 EV
_PARLAY_4_MIN_EV   = 0.10    # 4-串最低 EV
_MAX_PARLAY_ODDS   = 15.0    # 串關最高賠率上限
_KELLY_SINGLE      = 0.25    # 單關凱利係數
_KELLY_PARLAY      = 0.15    # 串關凱利係數
_HARD_CAP_PCT      = 0.08    # 單注上限（本金 %）

# ── 停利停損設定 ──────────────────────────────────────────
_INITIAL_BANKROLL  = 3000.0   # 起始本金
_TARGET_BANKROLL   = 12000.0  # 停利目標（4倍）
_RUIN_THRESHOLD    = 10.0     # 視為歸零門檻（NT$10 以下停止）


# ── 策略設定檔 ────────────────────────────────────────────
from dataclasses import dataclass as _dc

@_dc
class StrategyConfig:
    """
    下注策略設定檔。
    傳入 analyze.run() 可切換不同風格。
    """
    name:              str   = "穩健型"
    # Pick 篩選門檻
    min_edge:          float = 0.04   # 最低 Edge（用於找候選 picks）
    min_true_prob:     float = 0.52   # 最低估算勝率
    min_odds:          float = 1.70   # 最低賠率
    max_odds:          float = 3.50   # 最高賠率
    single_min_edge:   float = 0.04   # 加入單關的最低 Edge（激進型設更高）
    # 串關設定
    parlay_min_ev:     float = 0.08   # 串關最低 EV
    parlay_4_min_ev:   float = 0.10   # 4-串最低 EV
    max_parlay_odds:   float = 15.0   # 串關最高賠率上限
    max_parlays_per_n: int   = 3      # 每種 n-串最多組數
    # 凱利係數
    kelly_single_A:    float = 0.25   # A 級單關
    kelly_single_B:    float = 0.20   # B 級單關
    kelly_single_C:    float = 0.12   # C 級單關
    kelly_parlay:      float = 0.15   # 串關
    hard_cap_pct:      float = 0.08   # 單注上限（本金 %）
    # 每日配置
    max_singles:       int   = 4      # 每日最多單關數


# 穩健型（原本行為不變）
CONSERVATIVE = StrategyConfig(
    name="穩健型",
    min_edge=0.04,       min_true_prob=0.52,
    min_odds=1.70,       max_odds=3.50,
    single_min_edge=0.04,
    parlay_min_ev=0.08,  parlay_4_min_ev=0.10,
    max_parlay_odds=15.0, max_parlays_per_n=3,
    kelly_single_A=0.25, kelly_single_B=0.20, kelly_single_C=0.12,
    kelly_parlay=0.15,   hard_cap_pct=0.08,
    max_singles=4,
)

# 激進型（高賠率串關為主）
AGGRESSIVE = StrategyConfig(
    name="激進型",
    min_edge=0.03,       min_true_prob=0.50,   # 放寬篩選，取更多候選
    min_odds=1.70,       max_odds=5.00,         # 接受更高賠率冷門
    single_min_edge=0.08,                       # 單關需極高信心
    parlay_min_ev=0.04,  parlay_4_min_ev=0.06, # 降低串關 EV 門檻
    max_parlay_odds=30.0, max_parlays_per_n=5,  # 允許高賠率、更多串關組合
    kelly_single_A=0.20, kelly_single_B=0.15, kelly_single_C=0.08,
    kelly_parlay=0.22,   hard_cap_pct=0.10,    # 串關更積極，上限略高
    max_singles=2,                              # 每日最多 2 場單關
)

# 冷門獵人型（只押冷門隊伍，賠率 ≥ 2.00）
UNDERDOG = StrategyConfig(
    name="冷門獵人型",
    min_edge=0.05,       min_true_prob=0.40,   # 放寬勝率，冷門本來就低
    min_odds=2.00,       max_odds=6.00,         # 只下真正冷門
    single_min_edge=0.05,                       # 單關需明確 edge
    parlay_min_ev=0.10,  parlay_4_min_ev=0.15, # 串關要求較高 EV
    max_parlay_odds=20.0, max_parlays_per_n=2,  # 少量冷門串關
    kelly_single_A=0.15, kelly_single_B=0.12, kelly_single_C=0.08,
    kelly_parlay=0.10,   hard_cap_pct=0.08,    # 保守 Kelly（冷門波動大）
    max_singles=4,                              # 每日最多 4 場單關
)


def check_stop_condition(bankroll: float) -> tuple[bool, str]:
    """
    檢查是否達到停利或停損條件。
    回傳 (should_stop, reason)
    """
    if bankroll >= _TARGET_BANKROLL:
        return True, f"🎯 達到停利目標！本金 NT${bankroll:,.0f} ≥ 目標 NT${_TARGET_BANKROLL:,.0f}"
    if bankroll <= _RUIN_THRESHOLD:
        return True, f"⛔ 本金歸零！本金 NT${bankroll:,.0f} ≤ 門檻 NT${_RUIN_THRESHOLD:,.0f}"
    return False, ""


# ── 數據結構 ───────────────────────────────────────────────
@dataclass
class ProbBreakdown:
    """勝率拆解：各調整項數值，用於數據卡透明呈現。"""
    base_prob:        float = 0.0   # 基礎勝率（Elo 或投手對決）
    efficiency_adj:   float = 0.0   # 效率差調整（NBA）
    injury_adj:       float = 0.0   # 傷兵調整（NBA）
    form_adj:         float = 0.0   # 近期狀態調整（NBA）
    offense_adj:      float = 0.0   # 打線品質調整（MLB）
    park_adj:         float = 0.0   # 球場因素調整（MLB）
    bullpen_adj:      float = 0.0   # 牛棚調整（MLB）
    final_prob:       float = 0.0   # 最終勝率（已 clamp）


@dataclass
class Pick:
    """單場選場結果。"""
    sport:           str
    game_id:         str
    game_date:       str
    home_team:       str
    away_team:       str
    bet_side:        str          # "home" | "away"
    bet_label:       str          # 顯示用，如 "BOS -5.5" 或 "LAL 勝"
    bet_type:        str          # "moneyline" | "spread"
    odds:            float        # 選中方的賠率
    true_prob:       float        # 模型估算勝率
    implied_prob:    float        # 去莊家利潤後隱含勝率
    edge:            float        # true_prob - implied_prob
    kelly_frac:      float        # 凱利比例（已套分數係數）
    grade:           str          # "A" | "B" | "C"
    breakdown:       ProbBreakdown = field(default_factory=ProbBreakdown)
    raw_data:        dict         = field(default_factory=dict)

    def bet_amount(self, bankroll: float,
                  cfg: "StrategyConfig | None" = None) -> float:
        coef = self._kelly_coef(cfg)
        cap  = (cfg.hard_cap_pct if cfg else _HARD_CAP_PCT)
        return kelly_bet_amount(bankroll, self.odds, self.true_prob, coef, cap)

    def _kelly_fraction_raw(self) -> float:
        # grade 對應的凱利係數（預設穩健型）
        return {"A": 0.25, "B": 0.20, "C": 0.12}.get(self.grade, _KELLY_SINGLE)

    def _kelly_coef(self, cfg: "StrategyConfig | None" = None) -> float:
        if cfg is None:
            return self._kelly_fraction_raw()
        return {"A": cfg.kelly_single_A,
                "B": cfg.kelly_single_B,
                "C": cfg.kelly_single_C}.get(self.grade, cfg.kelly_single_A)

    def data_card(self, bankroll: float) -> str:
        """產生報告用的數據卡文字。"""
        b = self.breakdown
        amount = self.bet_amount(bankroll)
        b_net = self.odds - 1.0
        full_kelly = (b_net * self.true_prob - (1 - self.true_prob)) / b_net
        lines = [
            f"【數據卡 — {self.away_team}@{self.home_team}，下注 {self.bet_label}】\n",
            f"原始數據：（詳見 raw_data）\n",
            f"模型計算：",
            f"  基礎勝率:     {b.base_prob:.1%}",
        ]
        if self.sport == "NBA":
            lines += [
                f"  效率差調整:   {b.efficiency_adj:+.1%}",
                f"  傷兵調整:     {b.injury_adj:+.1%}",
                f"  近期狀態調整: {b.form_adj:+.1%}",
            ]
        else:
            lines += [
                f"  打線品質調整: {b.offense_adj:+.1%}",
                f"  球場因素調整: {b.park_adj:+.1%}",
                f"  牛棚調整:     {b.bullpen_adj:+.1%}",
            ]
        lines += [
            f"  最終估算勝率: {self.true_prob:.1%}",
            f"\n賠率分析：",
            f"  運彩賠率:     {self.odds:.2f}",
            f"  隱含勝率(去莊): {self.implied_prob:.1%}",
            f"  Edge:         {self.edge:+.1%}  ← {'通過' if self.edge >= _MIN_EDGE else '未通過'} {_MIN_EDGE:.0%} 門檻",
            f"\n凱利計算：",
            f"  b={b_net:.2f}, p={self.true_prob:.3f}, q={1-self.true_prob:.3f}",
            f"  Full Kelly:   {full_kelly:.1%}",
            f"  分數Kelly({self._kelly_fraction_raw():.0%}): {self.kelly_frac:.1%}",
            f"  當日本金:     NT${bankroll:,.0f}",
            f"  建議注碼:     NT${amount:,.0f}",
            f"  信心等級:     {self.grade} 級",
        ]
        return "\n".join(lines)


@dataclass
class Parlay:
    """串關組合。"""
    legs:          list[Pick]
    parlay_odds:   float         # 各腳賠率相乘
    true_prob:     float         # 各腳勝率相乘
    parlay_ev:     float         # true_prob * parlay_odds - 1
    kelly_frac:    float

    def bet_amount(self, bankroll: float,
                  cfg: "StrategyConfig | None" = None) -> float:
        k   = self.kelly_frac
        cap_pct = (cfg.hard_cap_pct if cfg else _HARD_CAP_PCT)
        raw = bankroll * k
        cap = bankroll * cap_pct * len(self.legs)
        raw = min(raw, cap)
        return max(10.0, round(raw / 10) * 10)

    @property
    def label(self) -> str:
        n = len(self.legs)
        parts = [p.bet_label for p in self.legs]
        return f"{n}-串（{'、'.join(parts)}）"

    @property
    def potential_payout_ratio(self) -> float:
        return self.parlay_odds


# ── NBA 勝率模型 ───────────────────────────────────────────
def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def nba_win_probability(game: dict) -> tuple[float, ProbBreakdown]:
    """
    主隊勝率估算（Elo + 效率差 + 傷兵 + 近期狀態）。
    回傳 (home_win_prob, ProbBreakdown)
    """
    from fetch_nba import elo_win_prob, _DEFAULT_ELO

    home_elo = game.get("home_elo", _DEFAULT_ELO)
    away_elo = game.get("away_elo", _DEFAULT_ELO)

    # 步驟 1：Elo 基礎勝率（含主場 +100 Elo 加成）
    base_prob = elo_win_prob(home_elo, away_elo)

    # 步驟 2：淨效率差調整
    home_net = game.get("home_netrtg", 0.0)
    away_net = game.get("away_netrtg", 0.0)
    eff_diff = home_net - away_net
    # sigmoid 使大差距的影響趨緩，× 0.15 限制最大影響
    efficiency_adj = (_sigmoid(eff_diff / 8.0) - 0.5) * 0.30

    # 步驟 3：傷兵調整（已在 fetch_nba 計算好）
    home_inj = game.get("home_injury_adj", 0.0)
    away_inj = game.get("away_injury_adj", 0.0)
    injury_adj = home_inj - away_inj   # 正數 = 主隊受益（客隊傷兵多）

    # 步驟 4：近期狀態調整（L10 勝率差）
    home_l10 = game.get("home_l10_win_pct", 0.5)
    away_l10 = game.get("away_win_pct_l10", 0.5)  # 客場 L10
    form_adj = (home_l10 - away_l10) * 0.08

    raw = base_prob + efficiency_adj + injury_adj + form_adj
    final = max(0.05, min(0.95, raw))

    bd = ProbBreakdown(
        base_prob=base_prob,
        efficiency_adj=efficiency_adj,
        injury_adj=injury_adj,
        form_adj=form_adj,
        final_prob=final,
    )
    return final, bd


# ── MLB 勝率模型 ───────────────────────────────────────────
_LEAGUE_AVG_FIP = 4.20
_LEAGUE_AVG_WRC = 100.0
_LEAGUE_AVG_BP_ERA = 4.20


def mlb_win_probability(game: dict) -> tuple[float, ProbBreakdown]:
    """
    主隊勝率估算（先發 FIP 對決 + 打線 wRC+ + 球場 + 牛棚）。
    回傳 (home_win_prob, ProbBreakdown)
    """
    h_fip = game.get("home_starter_fip", _LEAGUE_AVG_FIP)
    a_fip = game.get("away_starter_fip", _LEAGUE_AVG_FIP)

    # 步驟 1：先發投手對決（FIP 差轉換為勝率）
    # FIP 差 1.0 分 ≈ 勝率差 5%（歷史校準值）
    fip_diff = a_fip - h_fip       # 正數 = 主隊投手占優
    base_prob = 0.50 + fip_diff * 0.05
    base_prob = max(0.30, min(0.70, base_prob))  # 先發模型限制範圍

    # 步驟 2：打線品質調整（wRC+ 差）
    h_wrc = game.get("home_team_wrc_plus", _LEAGUE_AVG_WRC)
    a_wrc = game.get("away_team_wrc_plus", _LEAGUE_AVG_WRC)
    wrc_diff = h_wrc - a_wrc
    offense_adj = wrc_diff / 1000.0    # 每 10 wRC+ 差 ≈ 0.1% 勝率

    # 步驟 3：球場因素
    pf = game.get("park_factor", 100)
    # 球場偏打者 → 主隊略有優勢（熟悉球場）
    park_adj = (pf - 100) / 100.0 * 0.015

    # 步驟 4：牛棚近況調整
    h_bp = game.get("home_bullpen_era_3d", _LEAGUE_AVG_BP_ERA)
    a_bp = game.get("away_bullpen_era_3d", _LEAGUE_AVG_BP_ERA)
    bp_diff = a_bp - h_bp           # 正數 = 主隊牛棚占優
    bullpen_adj = bp_diff * 0.015

    raw = base_prob + offense_adj + park_adj + bullpen_adj
    final = max(0.05, min(0.95, raw))

    bd = ProbBreakdown(
        base_prob=base_prob,
        offense_adj=offense_adj,
        park_adj=park_adj,
        bullpen_adj=bullpen_adj,
        final_prob=final,
    )
    return final, bd


# ── 單場分析主函式 ─────────────────────────────────────────
def analyze_nba_game(game: dict,
                     cfg: "StrategyConfig | None" = None) -> list[Pick]:
    """
    分析一場 NBA 賽事，回傳所有通過門檻的 Pick 列表。
    同一場最多產生 2 個 Pick（主隊/客隊各一，但通常只有一個過門檻）。
    """
    c = cfg or CONSERVATIVE
    ok, missing = validate_nba_game(game)
    if not ok:
        logger.warning(f"NBA {game.get('away_team')}@{game.get('home_team')} 數據不足：{missing}")
        return []

    ok2, miss2 = validate_odds(game)
    if not ok2:
        logger.warning(f"NBA {game.get('away_team')}@{game.get('home_team')} 賠率缺失：{miss2}")
        return []

    home_win_prob, bd = nba_win_probability(game)
    away_win_prob = 1.0 - home_win_prob

    h_odds = game.get("home_odds")
    a_odds = game.get("away_odds")
    if not h_odds or not a_odds:
        return []

    h_fair, a_fair = fair_implied_prob(h_odds, a_odds)
    h_edge = calc_edge(home_win_prob, h_fair)
    a_edge = calc_edge(away_win_prob, a_fair)

    picks = []
    for (side, prob, fair, edge_val, odds, abbr) in [
        ("home", home_win_prob, h_fair, h_edge, h_odds, game["home_team"]),
        ("away", away_win_prob, a_fair, a_edge, a_odds, game["away_team"]),
    ]:
        if edge_val < c.min_edge:
            continue
        if prob < c.min_true_prob:
            continue
        if odds < c.min_odds or odds > c.max_odds:
            continue

        frac = _kelly_frac_for_edge(edge_val, prob, odds, c)
        grade = _grade(edge_val, game)
        label = f"{nba_zh(abbr)} 勝"

        # 客隊勝率對應的 breakdown 要翻轉
        if side == "away":
            bd_use = ProbBreakdown(
                base_prob=1 - bd.base_prob,
                efficiency_adj=-bd.efficiency_adj,
                injury_adj=-bd.injury_adj,
                form_adj=-bd.form_adj,
                final_prob=prob,
            )
        else:
            bd_use = bd

        picks.append(Pick(
            sport="NBA", game_id=game["game_id"],
            game_date=game["game_date"],
            home_team=game["home_team"], away_team=game["away_team"],
            bet_side=side, bet_label=label, bet_type="moneyline",
            odds=odds, true_prob=prob, implied_prob=fair,
            edge=edge_val, kelly_frac=frac, grade=grade,
            breakdown=bd_use, raw_data=game,
        ))

    return picks


def analyze_mlb_game(game: dict,
                     cfg: "StrategyConfig | None" = None) -> list[Pick]:
    """分析一場 MLB 賽事，回傳通過門檻的 Pick 列表。"""
    c = cfg or CONSERVATIVE
    ok, missing = validate_mlb_game(game)
    if not ok:
        logger.warning(f"MLB {game.get('away_team')}@{game.get('home_team')} 數據不足：{missing}")
        return []

    ok2, miss2 = validate_odds(game)
    if not ok2:
        logger.warning(f"MLB {game.get('away_team')}@{game.get('home_team')} 賠率缺失：{miss2}")
        return []

    home_win_prob, bd = mlb_win_probability(game)
    away_win_prob = 1.0 - home_win_prob

    h_odds = game.get("home_odds")
    a_odds = game.get("away_odds")
    if not h_odds or not a_odds:
        return []

    h_fair, a_fair = fair_implied_prob(h_odds, a_odds)
    h_edge = calc_edge(home_win_prob, h_fair)
    a_edge = calc_edge(away_win_prob, a_fair)

    picks = []
    for (side, prob, fair, edge_val, odds, abbr) in [
        ("home", home_win_prob, h_fair, h_edge, h_odds, game["home_team"]),
        ("away", away_win_prob, a_fair, a_edge, a_odds, game["away_team"]),
    ]:
        if edge_val < c.min_edge:
            continue
        if prob < c.min_true_prob:
            continue
        if odds < c.min_odds or odds > c.max_odds:
            continue

        frac = _kelly_frac_for_edge(edge_val, prob, odds, c)
        grade = _grade(edge_val, game)
        label = f"{mlb_zh(abbr)} 勝"

        if side == "away":
            bd_use = ProbBreakdown(
                base_prob=1 - bd.base_prob,
                offense_adj=-bd.offense_adj,
                park_adj=-bd.park_adj,
                bullpen_adj=-bd.bullpen_adj,
                final_prob=prob,
            )
        else:
            bd_use = bd

        picks.append(Pick(
            sport="MLB", game_id=str(game["game_pk"]),
            game_date=game["game_date"],
            home_team=game["home_team"], away_team=game["away_team"],
            bet_side=side, bet_label=label, bet_type="moneyline",
            odds=odds, true_prob=prob, implied_prob=fair,
            edge=edge_val, kelly_frac=frac, grade=grade,
            breakdown=bd_use, raw_data=game,
        ))

    return picks


# ── 輔助：凱利比例 & 信心等級 ────────────────────────────
def _kelly_frac_for_edge(edge_val: float, true_prob: float, odds: float,
                         cfg: "StrategyConfig | None" = None) -> float:
    c = cfg or CONSERVATIVE
    grade = "A" if edge_val >= 0.07 else ("B" if edge_val >= 0.04 else "C")
    coef  = {"A": c.kelly_single_A, "B": c.kelly_single_B, "C": c.kelly_single_C}[grade]
    return kelly_fraction(odds, true_prob, coef)


def _grade(edge_val: float, game: dict) -> str:
    """數據完整性 + Edge 大小決定信心等級。"""
    data_complete = (
        game.get("home_injuries") is not None or   # NBA 有傷兵欄位
        game.get("home_starter_fip") is not None   # MLB 有 FIP 欄位
    )
    if edge_val >= 0.07 and data_complete:
        return "A"
    if edge_val >= 0.04 and data_complete:
        return "B"
    return "C"


# ── 串關組合生成 ───────────────────────────────────────────
def build_parlays(picks: list[Pick], bankroll: float,
                  cfg: "StrategyConfig | None" = None) -> list[Parlay]:
    """
    從候選 Pick 中生成所有符合 EV 門檻的串關組合（2〜4 串）。
    同一場比賽不能出現兩次。
    """
    c = cfg or CONSERVATIVE
    parlays = []

    for n in range(2, 5):
        if len(picks) < n:
            continue
        min_ev = c.parlay_4_min_ev if n == 4 else c.parlay_min_ev

        for combo in combinations(picks, n):
            # 同一場不能重複
            game_ids = [p.game_id for p in combo]
            if len(game_ids) != len(set(game_ids)):
                continue

            p_odds   = 1.0
            p_prob   = 1.0
            for p in combo:
                p_odds *= p.odds
                p_prob *= p.true_prob

            if p_odds > c.max_parlay_odds:
                continue

            ev = p_prob * p_odds - 1.0
            if ev < min_ev:
                continue

            # 本金 < 1500 時禁止 4-串
            if n == 4 and bankroll < 1500:
                continue

            b_net = p_odds - 1.0
            full_k = (b_net * p_prob - (1 - p_prob)) / b_net if b_net > 0 else 0
            frac = max(0.0, full_k * c.kelly_parlay)

            parlays.append(Parlay(
                legs=list(combo),
                parlay_odds=round(p_odds, 3),
                true_prob=round(p_prob, 4),
                parlay_ev=round(ev, 4),
                kelly_frac=frac,
            ))

    # 每個 n 最多保留 EV 前 N 的組合，避免注碼過散
    from collections import defaultdict
    by_n: dict[int, list[Parlay]] = defaultdict(list)
    for p in parlays:
        by_n[len(p.legs)].append(p)
    result = []
    for n, group in by_n.items():
        group.sort(key=lambda x: x.parlay_ev, reverse=True)
        result.extend(group[:c.max_parlays_per_n])

    return result


# ── 本金區間凱利係數調整 ──────────────────────────────────
def bankroll_kelly_multiplier(bankroll: float) -> float:
    """根據本金餘額動態調整凱利係數倍率。"""
    # 先檢查停利停損
    should_stop, reason = check_stop_condition(bankroll)
    if should_stop:
        logger.warning(reason)
        return 0.0

    if bankroll >= 2000:
        return 1.00
    if bankroll >= 1500:
        return 0.60   # 凱利降至 0.15
    if bankroll >= 1000:
        return 0.40   # 凱利降至 0.10，只下單關
    return 0.0        # 危險區：停止下注


# ── 每日下注配置計算 ───────────────────────────────────────
@dataclass
class DailyPlan:
    """每日完整下注計劃。"""
    date:        str
    bankroll:    float
    single_picks: list[Pick]
    parlays:     list[Parlay]
    total_bet:   float
    reserved:    float              # 保留 10% 不動

    def summary_lines(self) -> list[str]:
        lines = [f"本金：NT${self.bankroll:,.0f}，今日投入：NT${self.total_bet:,.0f}"]
        for p in self.single_picks:
            amt = p.bet_amount(self.bankroll)
            lines.append(f"  單關 {p.bet_label} @{p.odds:.2f}  NT${amt:,.0f}  [Edge {p.edge:+.1%} / {p.grade}級]")
        for par in self.parlays:
            amt = par.bet_amount(self.bankroll)
            lines.append(f"  {par.label} @{par.parlay_odds:.2f}  NT${amt:,.0f}  [EV {par.parlay_ev:+.1%}]")
        return lines


def make_daily_plan(picks: list[Pick], bankroll: float, game_date: str,
                    cfg: "StrategyConfig | None" = None) -> DailyPlan:
    """
    依策略設定分配每日注碼。
    穩健型：平衡單關與串關。
    激進型：少量高信心單關 + 大量高賠率串關。
    """
    c = cfg or CONSERVATIVE
    km = bankroll_kelly_multiplier(bankroll)
    if km == 0.0:
        logger.warning(f"本金 NT${bankroll:.0f} 低於危險線，今日停止下注")
        return DailyPlan(game_date, bankroll, [], [], 0.0, bankroll)

    available = bankroll * 0.90   # 保留 10%
    reserved  = bankroll * 0.10

    # 候選 picks 依策略篩選單關門檻
    all_sorted = sorted(picks, key=lambda x: x.edge, reverse=True)

    # 低本金時只下單關
    if bankroll < 1000:
        picks_limited = all_sorted[:2]
        parlays_list  = []
    else:
        # 激進型：單關需高信心，其餘都用來組串關
        single_candidates = [p for p in all_sorted if p.edge >= c.single_min_edge]
        picks_limited     = single_candidates[:c.max_singles]
        # 串關候選：所有 picks（包含 edge < single_min_edge 的也可組串）
        parlay_candidates = all_sorted[:8]
        parlays_list      = build_parlays(parlay_candidates, bankroll, c)

    # 計算各注碼
    total = 0.0
    for p in picks_limited:
        amt = kelly_bet_amount(bankroll, p.odds, p.true_prob,
                               p._kelly_coef(c) * km, c.hard_cap_pct)
        total += amt

    for par in parlays_list:
        amt = par.bet_amount(bankroll, c)
        total += amt * km

    # 若超出可用資金，等比縮減
    if total > available and total > 0:
        scale = available / total
        for p in picks_limited:
            p.kelly_frac *= scale
        for par in parlays_list:
            par.kelly_frac *= scale
        total = available

    return DailyPlan(
        date=game_date,
        bankroll=bankroll,
        single_picks=picks_limited,
        parlays=parlays_list,
        total_bet=round(total / 10) * 10,
        reserved=reserved,
    )


# ── 主流程 ────────────────────────────────────────────────
def run(nba_games: list, mlb_games: list, bankroll: float,
        game_date: str,
        cfg: "StrategyConfig | None" = None) -> DailyPlan:
    """
    執行當日完整分析，回傳 DailyPlan。
    nba_games / mlb_games 已附加賠率欄位。
    cfg: 策略設定，預設為 CONSERVATIVE（穩健型）
    """
    c = cfg or CONSERVATIVE
    logger.info(f"===== 分析引擎[{c.name}]：{game_date}，本金 NT${bankroll:,.0f} =====")
    all_picks: list[Pick] = []

    for game in nba_games:
        picks = analyze_nba_game(game, c)
        all_picks.extend(picks)
        if picks:
            for p in picks:
                logger.info(f"  ✓ NBA {p.bet_label} Edge={p.edge:+.1%} [{p.grade}]")

    for game in mlb_games:
        picks = analyze_mlb_game(game, c)
        all_picks.extend(picks)
        if picks:
            for p in picks:
                logger.info(f"  ✓ MLB {p.bet_label} Edge={p.edge:+.1%} [{p.grade}]")

    logger.info(f"  候選 Pick：{len(all_picks)} 個（Edge≥{c.min_edge:.0%}）")
    plan = make_daily_plan(all_picks, bankroll, game_date, c)

    for line in plan.summary_lines():
        logger.info(line)

    return plan
