export interface ErrorAnalysisResult {
  reasons: string[];       // Chinese-language reason strings
  severity: 'warning' | 'critical';  // warning = 3-5 diff, critical = 6+ diff
  scoreDiff: number;       // |actual - predicted|
}

export interface GameActualResult {
  homeScore: number;
  awayScore: number;
  actualTotal: number;
  actualWinner: 'home' | 'away';
}

export interface TeamContext {
  name: string;
  code: string;
  avgScored: number;       // Recent average points scored
  avgConceded: number;     // Recent average points conceded
  streak: number;          // Positive = win streak, negative = loss streak
  record?: string;         // e.g. '45-30'
}

export interface PredictionContext {
  predictedTotal: number;
  predictedWinner: 'home' | 'away';
  predictedHomeScore: number;
  predictedAwayScore: number;
  league: 'MLB' | 'NBA';
  pitcherHome?: { name: string; era: number } | null;
  pitcherAway?: { name: string; era: number } | null;
}

/**
 * Analyzes why a prediction missed by >=3 points.
 * Returns null if the prediction was close enough (diff < 3).
 */
export function analyzeScoreError(
  actual: GameActualResult,
  prediction: PredictionContext,
  homeTeam: TeamContext,
  awayTeam: TeamContext
): ErrorAnalysisResult | null {
  const scoreDiff = Math.abs(actual.actualTotal - prediction.predictedTotal);
  if (scoreDiff < 3) {
    return null;
  }

  const severity: 'warning' | 'critical' = scoreDiff >= 6 ? 'critical' : 'warning';
  const reasons: string[] = [];

  const isMLB = prediction.league === 'MLB';

  // 1. High/Low scoring thresholds check
  if (isMLB) {
    if (actual.actualTotal >= 12) {
      reasons.push("本場出現高比分大亂鬥，雙方投手群未能有效壓制對手打線。");
    } else if (actual.actualTotal <= 4) {
      reasons.push("本場為典型低比分投手戰，雙方打線受制於投手壓制。");
    }
  } else {
    // NBA
    if (actual.actualTotal >= 235) {
      reasons.push("本場出現極高比分對決，雙方打法節奏極快，防守端壓制力不足。");
    } else if (actual.actualTotal <= 195) {
      reasons.push("本場出現極低比分防守大戰，雙方命中率偏低且防守強度極高。");
    }
  }

  // 2. Exploding or cold team offense
  const highScoringMultiplier = isMLB ? 1.5 : 1.2;
  const lowScoringMultiplier = isMLB ? 0.5 : 0.8;

  if (actual.homeScore >= homeTeam.avgScored * highScoringMultiplier) {
    reasons.push(`${homeTeam.name} 本場進攻火力爆發，單場攻下 ${actual.homeScore} 分（近期場均 ${homeTeam.avgScored.toFixed(1)} 分）。`);
  } else if (actual.homeScore <= homeTeam.avgScored * lowScoringMultiplier && actual.homeScore > 0) {
    reasons.push(`${homeTeam.name} 本場進攻端全面啞火，僅得 ${actual.homeScore} 分（近期場均 ${homeTeam.avgScored.toFixed(1)} 分）。`);
  }

  if (actual.awayScore >= awayTeam.avgScored * highScoringMultiplier) {
    reasons.push(`${awayTeam.name} 本場進攻火力爆發，單場攻下 ${actual.awayScore} 分（近期場均 ${awayTeam.avgScored.toFixed(1)} 分）。`);
  } else if (actual.awayScore <= awayTeam.avgScored * lowScoringMultiplier && actual.awayScore > 0) {
    reasons.push(`${awayTeam.name} 本場進攻端全面啞火，僅得 ${actual.awayScore} 分（近期場均 ${awayTeam.avgScored.toFixed(1)} 分）。`);
  }

  // 3. Streak Reversion
  if (homeTeam.streak >= 4 && actual.actualWinner === 'away') {
    reasons.push(`${homeTeam.name} 終結了 ${homeTeam.streak} 連勝，出現連勝中止的回歸均值效應。`);
  } else if (homeTeam.streak <= -4 && actual.actualWinner === 'home') {
    reasons.push(`${homeTeam.name} 終結了 ${Math.abs(homeTeam.streak)} 連敗，觸底反彈成功。`);
  }

  if (awayTeam.streak >= 4 && actual.actualWinner === 'home') {
    reasons.push(`${awayTeam.name} 終結了 ${awayTeam.streak} 連勝，出現連勝中止的回歸均值效應。`);
  } else if (awayTeam.streak <= -4 && actual.actualWinner === 'away') {
    reasons.push(`${awayTeam.name} 終結了 ${Math.abs(awayTeam.streak)} 連敗，觸底反彈成功。`);
  }

  // 4. Starting Pitcher Check (MLB only)
  if (isMLB) {
    if (prediction.pitcherHome && prediction.pitcherHome.era > 5.0 && actual.awayScore >= 6) {
      reasons.push(`${homeTeam.name} 先發投手 ${prediction.pitcherHome.name} 本季防禦率偏高 (ERA ${prediction.pitcherHome.era.toFixed(2)})，本場局數拉不長且失分偏多。`);
    }
    if (prediction.pitcherAway && prediction.pitcherAway.era > 5.0 && actual.homeScore >= 6) {
      reasons.push(`${awayTeam.name} 先發投手 ${prediction.pitcherAway.name} 本季防禦率偏高 (ERA ${prediction.pitcherAway.era.toFixed(2)})，本場局數拉不長且失分偏多。`);
    }
  }

  // 5. Winner mismatch impacting score flow
  if (prediction.predictedWinner !== actual.actualWinner) {
    const expectedWinnerName = prediction.predictedWinner === 'home' ? homeTeam.name : awayTeam.name;
    const actualWinnerName = actual.actualWinner === 'home' ? homeTeam.name : awayTeam.name;
    reasons.push(`AI 預測的勝方 ${expectedWinnerName} 意外敗給了 ${actualWinnerName}，致使賽事進程及分數流向大幅偏離預期。`);
  }

  // 6. Generic reason if nothing else triggered
  if (reasons.length === 0) {
    reasons.push("賽事臨場調度、牛棚戰損或天氣變化超出了模型常規計算範疇，導致最終比分產生較大誤差。");
  }

  return {
    reasons,
    severity,
    scoreDiff
  };
}
