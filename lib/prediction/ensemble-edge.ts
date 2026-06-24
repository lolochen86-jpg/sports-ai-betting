/**
 * Sports Quant Model: Ensemble Edge Calculator
 * 
 * This module implements the core quantitative logic to calculate prediction edges 
 * against bookmaker spread and total lines by combining three sub-models:
 * 1. Feature-weighted Regression Model (using decay-adjusted recent form)
 * 2. Elo Rating Power Index Model
 * 3. Monte Carlo Simulation Model (10,000 normal distribution runs)
 */

export interface TeamEdgeInput {
  // Recent form metrics
  avgScore5: number;
  winRate5: number;
  avgScore10: number;
  winRate10: number;
  
  // Power index
  elo: number;
  
  // Today's special adjustments (pitcher ERA for MLB or injury impact score for NBA)
  pitcherEra?: number;     // e.g. 3.50 (MLB starting pitcher)
  injuryImpact?: number;    // e.g. 4.5 (NBA key player absence value, higher = worse for team)
  
  streak: number;          // e.g. +3 for a 3-game win streak, -4 for a 4-game loss streak
}

/**
 * Calculates expected score adjustments and Monte Carlo standard deviation multipliers
 * based on player/team hot/cold streaks.
 */
function calculateFluctuation(streak: number, league: 'NBA' | 'MLB') {
  const isNBA = league === 'NBA';
  let scoreAdj = 0;
  let stdDevMultiplier = 1.0;
  
  if (streak >= 2) {
    // 兩到三場的火熱表現會慢慢降溫 (Cooling down, capped at 3 games streak influence)
    const cappedStreak = Math.min(streak, 3);
    scoreAdj = isNBA ? -1.5 * (cappedStreak - 1) : -0.15 * (cappedStreak - 1);
  } else if (streak <= -4) {
    // 四到五場極低的手感會慢慢或是回溫或是標發 (Rebound and high volatility)
    const absStreak = Math.abs(streak);
    scoreAdj = isNBA ? 0.5 * (absStreak - 3) + 1.5 : 0.05 * (absStreak - 3) + 0.15;
    stdDevMultiplier = isNBA ? 1.0 + 0.2 * (absStreak - 3) : 1.0 + 0.15 * (absStreak - 3);
  }
  
  return { scoreAdj, stdDevMultiplier };
}


export interface EnsembleInput {
  league: 'NBA' | 'MLB';
  home: TeamEdgeInput;
  away: TeamEdgeInput;
  
  // Bookmaker lines
  bookmakerSpread: number; // e.g. -4.5 (home team spread, negative = home is favorite)
  bookmakerTotal: number;  // e.g. 218.5
}

export interface SubModelResult {
  winner: 'home' | 'away';
  winProbability: number;
  predictedHomeScore: number;
  predictedAwayScore: number;
  predictedSpread: number; // predicted spread = -(homeExpected - awayExpected)
  predictedTotal: number;
}

export interface EnsembleEdgeResult {
  ensembleSpread: number;
  ensembleTotal: number;
  spreadEdge: number;
  overProbability: number; // probability of total score exceeding bookmaker's total line
  models: {
    featureModel: SubModelResult;
    eloModel: SubModelResult;
    monteCarloModel: SubModelResult & { overProbability: number };
  };
}

/**
 * Time decay weighting smoothing function
 * Adjusted_Value = (Recent_5 * 0.75) + (Recent_10 * 0.25)
 */
function calculateTimeDecayedValue(value5: number, value10: number): number {
  return (value5 * 0.75) + (value10 * 0.25);
}

/**
 * Standard Normal Distribution sampler (Box-Muller transform)
 */
function sampleNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

/**
 * Core Ensemble Edge Calculation Function
 */
export function calculate_ensemble_edge(input: EnsembleInput): EnsembleEdgeResult {
  const { league, home, away, bookmakerSpread, bookmakerTotal } = input;
  const isNBA = league === 'NBA';
  
  // ─── 1. Time Decay Weighting ───
  const homeAdjScore = calculateTimeDecayedValue(home.avgScore5, home.avgScore10);
  const awayAdjScore = calculateTimeDecayedValue(away.avgScore5, away.avgScore10);
  const homeAdjWinRate = calculateTimeDecayedValue(home.winRate5, home.winRate10);
  const awayAdjWinRate = calculateTimeDecayedValue(away.winRate5, away.winRate10);

  // ─── 2. Run Model 1: Feature-Weighted Model ───
  // Calculate raw expected scores based on decay-adjusted form
  const homeFluct = calculateFluctuation(home.streak, league);
  const awayFluct = calculateFluctuation(away.streak, league);

  let fHomeScore = homeAdjScore + homeFluct.scoreAdj;
  let fAwayScore = awayAdjScore + awayFluct.scoreAdj;

  // Apply special adjustments (starting pitcher ERA or injury impact)
  if (isNBA) {
    // Injury impact directly reduces team's expected offensive scoring capacity
    if (home.injuryImpact) fHomeScore -= home.injuryImpact;
    if (away.injuryImpact) fAwayScore -= away.injuryImpact;
  } else {
    // MLB Starting Pitcher ERA adjustment: Opponent starting pitcher affects our scoring.
    // Base league ERA is assumed to be 4.00.
    const homePitcherEra = home.pitcherEra ?? 4.0;
    const awayPitcherEra = away.pitcherEra ?? 4.0;
    
    // Good opponent pitcher (ERA < 4) lowers our score; poor opponent pitcher (ERA > 4) boosts it.
    fHomeScore += (4.0 - awayPitcherEra) * 0.35;
    fAwayScore += (4.0 - homePitcherEra) * 0.35;
  }

  // Calculate feature-based win probability using score differential
  const fDiff = fHomeScore - fAwayScore;
  const fScale = isNBA ? 12.0 : 2.5; // Scale factor for Logistic regression Sigmoid
  const fHomeProb = 1 / (1 + Math.exp(-fDiff / fScale));
  
  const model1: SubModelResult = {
    winner: fHomeProb >= 0.5 ? 'home' : 'away',
    winProbability: Number(fHomeProb.toFixed(4)),
    predictedHomeScore: Number(fHomeScore.toFixed(2)),
    predictedAwayScore: Number(fAwayScore.toFixed(2)),
    predictedSpread: Number((-fDiff).toFixed(2)),
    predictedTotal: Number((fHomeScore + fAwayScore).toFixed(2)),
  };

  // ─── 3. Run Model 2: Elo Rating Model ───
  // Home field advantage adjustment (in Elo points)
  const homeAdvantageElo = isNBA ? 75 : 45;
  const eloDiff = (home.elo + homeAdvantageElo) - away.elo;
  
  // Standard Elo win probability formula
  const eloHomeProb = 1 / (1 + Math.pow(10, -eloDiff / 400));
  
  // Map Elo difference to expected score margins
  // NBA: 100 Elo points ~ 2.5 points margin. MLB: 100 Elo points ~ 0.5 runs margin.
  const eloMarginScale = isNBA ? 2.5 / 100 : 0.5 / 100;
  const eloScoreDiff = eloDiff * eloMarginScale;
  
  // Distribute Elo score difference around the decay-adjusted baseline total and apply fluctuation
  const baseTotal = homeAdjScore + awayAdjScore;
  const eloHomeScore = (baseTotal / 2) + (eloScoreDiff / 2) + homeFluct.scoreAdj;
  const eloAwayScore = (baseTotal / 2) - (eloScoreDiff / 2) + awayFluct.scoreAdj;

  const model2: SubModelResult = {
    winner: eloHomeProb >= 0.5 ? 'home' : 'away',
    winProbability: Number(eloHomeProb.toFixed(4)),
    predictedHomeScore: Number(eloHomeScore.toFixed(2)),
    predictedAwayScore: Number(eloAwayScore.toFixed(2)),
    predictedSpread: Number((-eloScoreDiff).toFixed(2)),
    predictedTotal: Number((eloHomeScore + eloAwayScore).toFixed(2)),
  };

  // ─── 4. Run Model 3: Monte Carlo Simulator (10,000 runs) ───
  const simulations = 10000;
  // Default standard deviation (standard error of regression residuals)
  const defaultStdDev = isNBA ? 8.2 : 2.3; // Make sure baseline standard deviation matches stats.ts
  const homeStdDev = defaultStdDev * homeFluct.stdDevMultiplier;
  const awayStdDev = defaultStdDev * awayFluct.stdDevMultiplier;
  
  let mcHomeWins = 0;
  let mcOverCount = 0;
  let mcTotalHomeScore = 0;
  let mcTotalAwayScore = 0;

  // Expected scoring means (incorporating decay-adjusted form and injuries/pitchers)
  const mcHomeMean = fHomeScore; 
  const mcAwayMean = fAwayScore;

  for (let i = 0; i < simulations; i++) {
    // Draw random scores from normal distributions
    const simHome = sampleNormal(mcHomeMean, homeStdDev);
    const simAway = sampleNormal(mcAwayMean, awayStdDev);
    const simTotal = simHome + simAway;

    mcTotalHomeScore += simHome;
    mcTotalAwayScore += simAway;

    if (simHome > simAway) mcHomeWins++;
    if (simTotal > bookmakerTotal) mcOverCount++;
  }

  const mcHomeProb = mcHomeWins / simulations;
  const mcAvgHome = mcTotalHomeScore / simulations;
  const mcAvgAway = mcTotalAwayScore / simulations;
  const mcDiff = mcAvgHome - mcAvgAway;
  const overProbability = mcOverCount / simulations;

  const model3: SubModelResult & { overProbability: number } = {
    winner: mcHomeProb >= 0.5 ? 'home' : 'away',
    winProbability: Number(mcHomeProb.toFixed(4)),
    predictedHomeScore: Number(mcAvgHome.toFixed(2)),
    predictedAwayScore: Number(mcAvgAway.toFixed(2)),
    predictedSpread: Number((-mcDiff).toFixed(2)),
    predictedTotal: Number((mcAvgHome + mcAvgAway).toFixed(2)),
    overProbability: Number(overProbability.toFixed(4)),
  };

  // ─── 5. Ensemble Aggregation & Spread Edge ───
  // Calculate average spread prediction across the three models
  const ensembleSpread = Number(
    ((model1.predictedSpread + model2.predictedSpread + model3.predictedSpread) / 3).toFixed(2)
  );

  // Calculate average total score prediction across the three models
  const ensembleTotal = Number(
    ((model1.predictedTotal + model2.predictedTotal + model3.predictedTotal) / 3).toFixed(2)
  );

  // Calculate absolute edge against the bookmaker's line
  // Edge = |Model_Ensemble_Prediction - Bookmaker_Line|
  const spreadEdge = Number(Math.abs(ensembleSpread - bookmakerSpread).toFixed(2));

  return {
    ensembleSpread,
    ensembleTotal,
    spreadEdge,
    overProbability: model3.overProbability,
    models: {
      featureModel: model1,
      eloModel: model2,
      monteCarloModel: model3,
    },
  };
}

export interface InsightInput {
  m1_win: number;          // Model 1 (Feature) win probability (0 to 1)
  m2_win: number;          // Model 2 (Elo) win probability (0 to 1)
  m3_win: number;          // Model 3 (Monte Carlo) win probability (0 to 1)
  homeAvgPoints: number;   // Home team recent average points scored
  awayAvgPoints: number;   // Away team recent average points scored
  bookmakerTotal: number;  // Bookmaker's total score line (O/U Line)
  isStarMissing: boolean;  // Star player missing indicator (主力球星缺陣標記)
}

/**
 * Helper Function: generate_insight_report
 * 
 * Analyzes win probability spreads across three models and recent scoring form
 * against bookmaker total lines to output localized quantitative betting insights.
 */
export function generate_insight_report(input: InsightInput): string {
  const { m1_win, m2_win, m3_win, homeAvgPoints, awayAvgPoints, bookmakerTotal, isStarMissing } = input;
  
  // Calculate maximum difference between the three models
  const max_diff = Math.max(m1_win, m2_win, m3_win) - Math.min(m1_win, m2_win, m3_win);
  
  const insights: string[] = [];

  // Rule 1: 短期虛胖 (Feature model wins significantly higher than Elo rating)
  if (m1_win - m2_win > 0.15) {
    insights.push("⚠️ 模型分歧：近期狀態遠超整季基本盤，提防賽程紅利與莊家誘盤，建議尋找對手受讓價值。");
  }

  // Rule 2: 強隊低谷 (Elo rating wins significantly higher than Feature model)
  if (m2_win - m1_win > 0.15) {
    insights.push("🔍 強隊低谷：長線實力強但近期當機，盤口易低估。逢低買進獨贏絕佳時機。");
  }

  // Rule 3: 極端波動 / 火力衝突
  // A. Check if Monte Carlo (m3) is vastly different from both m1 and m2 (> 20%)
  const isM3Extreme = Math.abs(m3_win - m1_win) > 0.20 && Math.abs(m3_win - m2_win) > 0.20;
  
  // B. Check if recent points sum > 10 runs (MLB) while bookmaker line is <= 8.5 runs
  const recentScoreSum = homeAvgPoints + awayAvgPoints;
  const isTotalClash = recentScoreSum > 10 && bookmakerTotal <= 8.5;

  if (isM3Extreme || isTotalClash) {
    insights.push("🔥 火力衝突：特徵模型偵測到雙方打線極度火熱，萬次模擬顯示突破大分機率極高。");
  }

  // Fallback default insights if no specific rule matches
  if (insights.length === 0) {
    if (max_diff < 0.05) {
      insights.push("📊 三核共識：各模型預測高度吻合，盤口穩定，可依勝率優勢進行標準投注。");
    } else {
      insights.push("💡 穩健觀察：盤口與預測無顯著偏離，建議聚焦臨場先發陣容與資金比例管理。");
    }
  }

  let finalReport = insights.join(" ");

  // Rule 4: 主力球星缺陣 (Force injury alert at the beginning)
  if (isStarMissing) {
    finalReport = `🚨 臨場異動警報：已扣除缺陣球員權重，模型策略已翻轉。 ` + finalReport;
  }

  return finalReport;
}

