export interface ErrorAnalysisResult {
  reasons: string[];       // Chinese-language reason strings
  severity: 'perfect' | 'success' | 'warning' | 'critical';
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
 * Analyzes prediction outcome and generates detailed post-match review reasons.
 */
export function analyzeScoreError(
  actual: GameActualResult,
  prediction: PredictionContext,
  homeTeam: TeamContext,
  awayTeam: TeamContext
): ErrorAnalysisResult {
  const scoreDiff = Number(Math.abs(actual.actualTotal - prediction.predictedTotal).toFixed(1));
  const isWinnerCorrect = prediction.predictedWinner === actual.actualWinner;

  let severity: 'perfect' | 'success' | 'warning' | 'critical';
  if (scoreDiff <= 1.5 && isWinnerCorrect) {
    severity = 'perfect';
  } else if (scoreDiff < 3) {
    severity = 'success';
  } else if (scoreDiff >= 6 || !isWinnerCorrect) {
    severity = 'critical';
  } else {
    severity = 'warning';
  }

  const reasons: string[] = [];
  const isMLB = prediction.league === 'MLB';

  // 1. Success / Perfect Insights
  if (severity === 'perfect') {
    reasons.push(`🎯 模型完美預測！預估總分 (${prediction.predictedTotal} 分) 與完賽總分 (${actual.actualTotal} 分) 誤差僅 ${scoreDiff} 分，精準掌握全場節奏。`);
    if (isMLB && prediction.pitcherHome && prediction.pitcherAway) {
      reasons.push(`投手壓制力評估（${homeTeam.name} ERA ${prediction.pitcherHome.era.toFixed(2)} vs ${awayTeam.name} ERA ${prediction.pitcherAway.era.toFixed(2)}）與實戰投手戰演變高度吻合。`);
    } else {
      reasons.push(`雙方近期火力與防守係數分析成功鎖定比分流向，獨贏與大小分均準確命中。`);
    }
    return { reasons, severity, scoreDiff };
  }

  if (severity === 'success') {
    reasons.push(`✅ 模型預測相當精準！實際總分 ${actual.actualTotal} 分與預估總分 ${prediction.predictedTotal} 分偏差僅 ${scoreDiff} 分。`);
    if (!isWinnerCorrect) {
      const winnerName = actual.actualWinner === 'home' ? homeTeam.name : awayTeam.name;
      reasons.push(`雖比分控制精準，但 ${winnerName} 在賽事尾段關鍵時刻發揮出色，實現逆轉勝。`);
    } else {
      reasons.push(`兩隊戰力與近況火爆度的對比權重完全符合比賽發展。`);
    }
    return { reasons, severity, scoreDiff };
  }

  // 2. High/Low scoring thresholds check for Warning / Critical
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

  // 3. Exploding or cold team offense
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

  // 4. Streak Reversion
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

  // 5. Starting Pitcher Check (MLB only)
  if (isMLB) {
    if (prediction.pitcherHome && prediction.pitcherHome.era > 5.0 && actual.awayScore >= 6) {
      reasons.push(`${homeTeam.name} 先發投手 ${prediction.pitcherHome.name} 本季防禦率偏高 (ERA ${prediction.pitcherHome.era.toFixed(2)})，本場局數拉不長且失分偏多。`);
    }
    if (prediction.pitcherAway && prediction.pitcherAway.era > 5.0 && actual.homeScore >= 6) {
      reasons.push(`${awayTeam.name} 先發投手 ${prediction.pitcherAway.name} 本季防禦率偏高 (ERA ${prediction.pitcherAway.era.toFixed(2)})，本場局數拉不長且失分偏多。`);
    }
  }

  // 6. Winner mismatch impacting score flow
  if (!isWinnerCorrect) {
    const expectedWinnerName = prediction.predictedWinner === 'home' ? homeTeam.name : awayTeam.name;
    const actualWinnerName = actual.actualWinner === 'home' ? homeTeam.name : awayTeam.name;
    reasons.push(`AI 預測的勝方 ${expectedWinnerName} 意外敗給了 ${actualWinnerName}，致使賽事進程及分數流向產生偏差。`);
  }

  // 7. Generic reason if nothing else triggered
  if (reasons.length === 0) {
    reasons.push("賽事臨場調度、牛棚戰損或天氣變化超出了模型常規計算範疇，導致最終比分產生偏差。");
  }

  return {
    reasons,
    severity,
    scoreDiff
  };
}
