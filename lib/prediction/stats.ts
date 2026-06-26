import type { League } from '@/types/sports';

export interface TeamRecentStats {
  wins: number;
  losses: number;
  averagePointsScored: number;
  averagePointsConceded: number;
  streak: number; // e.g., +3 for a 3-game win streak, -2 for a 2-game loss streak
  // ─── Home/Away Splits ───
  homeAvgScored?: number;
  awayAvgScored?: number;
  homeAvgConceded?: number;
  awayAvgConceded?: number;
  // ─── Scoring Momentum ───
  scoringMomentum?: number;    // slope of recent scores (positive = hot, negative = cold)
  defenseMomentum?: number;    // slope of recent conceded (positive = defense worsening)
  momentumLabel?: 'hot' | 'cold' | 'stable';
  // ─── 10-Game and History splits ───
  wins10?: number;
  losses10?: number;
  avgScore10?: number;
  avgConceded10?: number;
  recentForm?: string[];
}

export interface H2HRecord {
  totalGames: number;
  teamAWins: number;
  teamBWins: number;
  teamAAvgScore: number;
  teamBAvgScore: number;
}

export interface FatigueInfo {
  isBackToBack: boolean;
  gamesIn3Days: number;
  fatigueLevel: 'none' | 'mild' | 'heavy';
}

export interface PitcherInfo {
  name: string;
  era: number;
  whip?: number;
  advantageFactor: number; // >1 = pitcher advantage (opponent scores less), <1 = pitcher disadvantage
}

export interface PredictionDetailStats {
  homeProbability: number;
  awayProbability: number;
  homeExpectedScore: number;
  awayExpectedScore: number;
  ouLine: number;
  ouPick: 'Over' | 'Under';
}

/**
 * Dynamic model loader to dynamically load the public/models/mlb_model.json weights.
 * Evaluates require('fs') to remain browser-safe during Next.js builds.
 */
function getMLBModel() {
  try {
    const fs = eval('require')('fs');
    const path = eval('require')('path');
    const modelPath = path.join(process.cwd(), 'public', 'models', 'mlb_model.json');
    if (fs.existsSync(modelPath)) {
      const data = fs.readFileSync(modelPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Keep warning quiet in production unless necessary
  }
  return null;
}

/**
 * Predicts the MLB win probability using the Logistic Regression model.
 */
export function predictMLBWinProbabilityWithModel(
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  homeRecordStr?: string,
  awayRecordStr?: string
): { homeProbability: number; awayProbability: number } | null {
  const model = getMLBModel();
  if (!model) return null;

  try {
    const parseRec = (rec?: string) => {
      if (!rec) return { wins: 0, losses: 0 };
      const parts = rec.split('-');
      return { wins: parseInt(parts[0], 10) || 0, losses: parseInt(parts[1], 10) || 0 };
    };

    const homeRec = parseRec(homeRecordStr);
    const awayRec = parseRec(awayRecordStr);

    const homeTotal = homeRec.wins + homeRec.losses;
    const awayTotal = awayRec.wins + awayRec.losses;

    const home_win_pct = homeTotal > 0 ? homeRec.wins / homeTotal : 0.5;
    const away_win_pct = awayTotal > 0 ? awayRec.wins / awayTotal : 0.5;

    const home_l10_win_pct = (homeStats.wins10 ?? 5) / 10;
    const away_l10_win_pct = (awayStats.wins10 ?? 5) / 10;

    const home_rs_avg = homeStats.avgScore10 ?? homeStats.averagePointsScored;
    const away_rs_avg = awayStats.avgScore10 ?? awayStats.averagePointsScored;

    const home_ra_avg = homeStats.avgConceded10 ?? homeStats.averagePointsConceded;
    const away_ra_avg = awayStats.avgConceded10 ?? awayStats.averagePointsConceded;

    const is_home_advantage = 1.0;

    const featuresInput: Record<string, number> = {
      home_win_pct,
      away_win_pct,
      home_l10_win_pct,
      away_l10_win_pct,
      home_rs_avg,
      away_rs_avg,
      home_ra_avg,
      away_ra_avg,
      is_home_advantage,
    };

    let logit = model.intercept;
    for (const key of Object.keys(model.coefficients)) {
      const x = featuresInput[key] ?? 0;
      const mean = model.scaler_mean[key] ?? 0;
      const std = model.scaler_std[key] ?? 1.0;
      const xScaled = (x - mean) / (std === 0 ? 1.0 : std);
      logit += model.coefficients[key] * xScaled;
    }

    const homeProbability = 1 / (1 + Math.exp(-logit));
    const awayProbability = 1 - homeProbability;

    return {
      homeProbability: Number((homeProbability * 100).toFixed(1)),
      awayProbability: Number((awayProbability * 100).toFixed(1)),
    };
  } catch (error) {
    console.error('[MLB Model Prediction] Error predicting win probability:', error);
    return null;
  }
}

/**
 * Parses a standard team record string (e.g. "35-20") into wins and losses.
 */
export function parseRecord(record?: string): { wins: number; losses: number } {
  if (!record) return { wins: 0, losses: 0 };
  const parts = record.split('-');
  if (parts.length === 2) {
    const wins = parseInt(parts[0], 10);
    const losses = parseInt(parts[1], 10);
    if (!isNaN(wins) && !isNaN(losses)) {
      return { wins, losses };
    }
  }
  return { wins: 0, losses: 0 };
}

/**
 * Calculates a realistic Over/Under line based on team scores and game ID hash.
 */
export function calculateOverUnderLine(
  averageHomePoints: number,
  averageAwayPoints: number,
  gameId: string,
  league: League
): number {
  const hash = Array.from(gameId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = averageHomePoints + averageAwayPoints;
  if (league === 'NBA') {
    // Expected sum is around 210-230. Add fractional part .5 to avoid pushes
    const offset = (hash % 11) - 5; // -5 to +5 points shift
    return Math.round(base + offset) - 0.5;
  } else {
    // MLB: Expected sum around 7.5 - 10.5
    const offset = ((hash % 7) - 3) * 0.5; // -1.5 to +1.5 runs shift
    const line = Math.round(base) + offset;
    return Math.floor(line) + 0.5;
  }
}

/**
 * Calculates a team's base performance index based on recent game statistics.
 */
export function calculateStrengthIndex(stats: TeamRecentStats, league: League, isHome: boolean): number {
  const winRate = stats.wins + stats.losses > 0 ? stats.wins / (stats.wins + stats.losses) : 0.5;
  
  let index = winRate * 100;
  index += stats.streak * (stats.streak > 0 ? 2.5 : 2.0);
  
  const differential = stats.averagePointsScored - stats.averagePointsConceded;
  if (league === 'MLB') {
    index += differential * 4.5;
  } else {
    index += differential * 0.8;
  }
  
  if (isHome) {
    index += league === 'NBA' ? 4.0 : 3.0;
  }

  // Apply fluctuation adjustment to strength index (representing todays hand/form cooling/rebound)
  const fluct = calculateFluctuation(stats.streak, league);
  index += league === 'MLB' ? fluct.scoreAdj * 4.5 : fluct.scoreAdj * 0.8;
  
  return index;
}

/**
 * Calculates expected score adjustments and Monte Carlo standard deviation multipliers
 * based on player/team hot/cold streaks.
 */
export function calculateFluctuation(streak: number, league: League) {
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

/**
 * MODEL 1: SportsAI Feature Weighted Logistic Regression Model (v4.2)
 * Computes win probabilities and expected scores using strength differentials.
 */
export function calculateWinProbability(
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  gameId: string,
  league: League,
  homeRecordStr?: string,
  awayRecordStr?: string
): PredictionDetailStats {
  let finalHomeProb = 0.5;
  let finalAwayProb = 0.5;

  let modelUsed = false;
  if (league === 'MLB') {
    const modelResult = predictMLBWinProbabilityWithModel(
      homeStats,
      awayStats,
      homeRecordStr,
      awayRecordStr
    );
    if (modelResult) {
      finalHomeProb = modelResult.homeProbability / 100;
      finalAwayProb = modelResult.awayProbability / 100;
      modelUsed = true;
    }
  }

  if (!modelUsed) {
    const homeStrength = calculateStrengthIndex(homeStats, league, true);
    const awayStrength = calculateStrengthIndex(awayStats, league, false);
    
    const diff = homeStrength - awayStrength;
    const scaleFactor = league === 'MLB' ? 18.0 : 15.0;
    const homeProb = 1 / (1 + Math.exp(-diff / scaleFactor));
    
    finalHomeProb = homeProb;
    finalAwayProb = 1 - homeProb;
    
    const maxProb = league === 'MLB' ? 0.74 : 0.85;
    const minProb = league === 'MLB' ? 0.26 : 0.15;
    
    if (finalHomeProb > maxProb) {
      finalHomeProb = maxProb;
      finalAwayProb = 1 - maxProb;
    } else if (finalHomeProb < minProb) {
      finalHomeProb = minProb;
      finalAwayProb = 1 - minProb;
    }
  }

  // Compute expected scores based on recent scoring averages and team strengths
  const homeStrength = calculateStrengthIndex(homeStats, league, true);
  const awayStrength = calculateStrengthIndex(awayStats, league, false);
  const diff = homeStrength - awayStrength;
  const shift = diff * (league === 'NBA' ? 0.08 : 0.04);
  const homeFluct = calculateFluctuation(homeStats.streak, league);
  const awayFluct = calculateFluctuation(awayStats.streak, league);
  const homeExp = homeStats.averagePointsScored + shift + homeFluct.scoreAdj;
  const awayExp = awayStats.averagePointsScored - shift + awayFluct.scoreAdj;
  
  let homeExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, homeExp).toFixed(1));
  let awayExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, awayExp).toFixed(1));
  
  // Enforce consistency: predicted winner must have the higher expected score
  const predictedWinnerSports = finalHomeProb >= finalAwayProb ? 'home' : 'away';
  if (predictedWinnerSports === 'home' && awayExpectedScore > homeExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  } else if (predictedWinnerSports === 'away' && homeExpectedScore > awayExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  }
  
  const ouLine = calculateOverUnderLine(homeStats.averagePointsScored, awayStats.averagePointsScored, gameId, league);
  const ouPick = (homeExpectedScore + awayExpectedScore) > ouLine ? 'Over' : 'Under';
  
  return {
    homeProbability: Number((finalHomeProb * 100).toFixed(1)),
    awayProbability: Number((finalAwayProb * 100).toFixed(1)),
    homeExpectedScore,
    awayExpectedScore,
    ouLine,
    ouPick,
  };
}

/**
 * MODEL 2: Elo Rating Power Index Model (v1.8)
 * Estimates Elo ratings and calculates expected scores using Elo differential.
 */
export function calculateEloProbability(
  homeRecordStr: string | undefined,
  awayRecordStr: string | undefined,
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  gameId: string,
  league: League
): PredictionDetailStats {
  const homeRec = parseRecord(homeRecordStr);
  const awayRec = parseRecord(awayRecordStr);
  
  const getBaseElo = (wins: number, losses: number) => {
    const total = wins + losses;
    if (total === 0) return 1500;
    const winRate = wins / total;
    return 1500 + (winRate - 0.5) * 400;
  };

  const homeElo = getBaseElo(homeRec.wins, homeRec.losses);
  const awayElo = getBaseElo(awayRec.wins, awayRec.losses);
  
  const homeAdv = league === 'NBA' ? 70 : 50; 
  const diff = (homeElo + homeAdv) - awayElo;
  
  const homeProb = 1 / (1 + Math.pow(10, -diff / 400));
  
  let finalHomeProb = homeProb;
  let finalAwayProb = 1 - homeProb;
  
  const maxProb = league === 'MLB' ? 0.72 : 0.82;
  const minProb = league === 'MLB' ? 0.28 : 0.18;
  
  if (finalHomeProb > maxProb) {
    finalHomeProb = maxProb;
    finalAwayProb = 1 - maxProb;
  } else if (finalHomeProb < minProb) {
    finalHomeProb = minProb;
    finalAwayProb = 1 - minProb;
  }

  // Score prediction using Elo delta and fluctuation
  const shift = diff * (league === 'NBA' ? 0.05 : 0.025);
  const homeFluct = calculateFluctuation(homeStats.streak, league);
  const awayFluct = calculateFluctuation(awayStats.streak, league);
  const homeExp = homeStats.averagePointsScored + shift + homeFluct.scoreAdj;
  const awayExp = awayStats.averagePointsScored - shift + awayFluct.scoreAdj;

  let homeExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, homeExp).toFixed(1));
  let awayExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, awayExp).toFixed(1));
  
  // Enforce consistency: predicted winner must have the higher expected score
  const predictedWinnerElo = finalHomeProb >= finalAwayProb ? 'home' : 'away';
  if (predictedWinnerElo === 'home' && awayExpectedScore > homeExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  } else if (predictedWinnerElo === 'away' && homeExpectedScore > awayExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  }
  
  const ouLine = calculateOverUnderLine(homeStats.averagePointsScored, awayStats.averagePointsScored, gameId, league);
  const ouPick = (homeExpectedScore + awayExpectedScore) > ouLine ? 'Over' : 'Under';

  return {
    homeProbability: Number((finalHomeProb * 100).toFixed(1)),
    awayProbability: Number((finalAwayProb * 100).toFixed(1)),
    homeExpectedScore,
    awayExpectedScore,
    ouLine,
    ouPick,
  };
}

/**
 * MODEL 3: Monte Carlo 10,000 runs Simulation Model (v2.5)
 * Simulates the match 10,000 times to obtain win probabilities and average simulated scores.
 */
export function calculateMonteCarloProbability(
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  gameId: string,
  league: League
): PredictionDetailStats {
  const sims = 10000;
  let homeWins = 0;
  let totalHomeScore = 0;
  let totalAwayScore = 0;
  
  const stdDev = league === 'MLB' ? 2.3 : 8.2;
  const homeFieldAdv = league === 'NBA' ? 2.5 : 0.35; 
  
  const randomNormal = (mean: number, std: number): number => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * std + mean;
  };
  
  const homeFluct = calculateFluctuation(homeStats.streak, league);
  const awayFluct = calculateFluctuation(awayStats.streak, league);
  
  const homeStdDev = stdDev * homeFluct.stdDevMultiplier;
  const awayStdDev = stdDev * awayFluct.stdDevMultiplier;
  
  const homeMean = homeStats.averagePointsScored + homeFluct.scoreAdj;
  const awayMean = awayStats.averagePointsScored + awayFluct.scoreAdj;
  
  for (let i = 0; i < sims; i++) {
    const homeSimScore = randomNormal(homeMean, homeStdDev) + homeFieldAdv;
    const awaySimScore = randomNormal(awayMean, awayStdDev);
    
    totalHomeScore += homeSimScore;
    totalAwayScore += awaySimScore;
    
    if (homeSimScore > awaySimScore) {
      homeWins++;
    }
  }
  
  const homeProb = homeWins / sims;
  let finalHomeProb = homeProb;
  let finalAwayProb = 1 - homeProb;
  
  const maxProb = league === 'MLB' ? 0.75 : 0.86;
  const minProb = league === 'MLB' ? 0.25 : 0.14;
  
  if (finalHomeProb > maxProb) {
    finalHomeProb = maxProb;
    finalAwayProb = 1 - maxProb;
  } else if (finalHomeProb < minProb) {
    finalHomeProb = minProb;
    finalAwayProb = 1 - minProb;
  }

  // Obtain expected scores from the average of 10,000 simulation runs
  let homeExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, totalHomeScore / sims).toFixed(1));
  let awayExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, totalAwayScore / sims).toFixed(1));
  
  // Enforce consistency: predicted winner must have the higher expected score
  const predictedWinnerMC = finalHomeProb >= finalAwayProb ? 'home' : 'away';
  if (predictedWinnerMC === 'home' && awayExpectedScore > homeExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  } else if (predictedWinnerMC === 'away' && homeExpectedScore > awayExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  }
  
  const ouLine = calculateOverUnderLine(homeStats.averagePointsScored, awayStats.averagePointsScored, gameId, league);
  const ouPick = (homeExpectedScore + awayExpectedScore) > ouLine ? 'Over' : 'Under';

  return {
    homeProbability: Number((finalHomeProb * 100).toFixed(1)),
    awayProbability: Number((finalAwayProb * 100).toFixed(1)),
    homeExpectedScore,
    awayExpectedScore,
    ouLine,
    ouPick,
  };
}

// ═══════════════════════════════════════════════════════════════
// V2 Enhanced Model Functions (with 6 new data dimensions)
// ═══════════════════════════════════════════════════════════════

/**
 * V2 Enhanced Strength Index — incorporates home/away splits, momentum, H2H, fatigue, and pitcher data.
 */
export function calculateStrengthIndexV2(
  stats: TeamRecentStats,
  league: League,
  isHome: boolean,
  extras?: {
    h2h?: H2HRecord | null;
    isTeamA?: boolean;
    fatigue?: FatigueInfo;
    opponentPitcher?: PitcherInfo | null;
  }
): number {
  // Start with base V1 calculation
  let index = calculateStrengthIndex(stats, league, isHome);

  // ① Home/Away Splits adjustment
  if (isHome && stats.homeAvgScored !== undefined && stats.averagePointsScored > 0) {
    const homeDiff = stats.homeAvgScored - stats.averagePointsScored;
    index += league === 'NBA' ? homeDiff * 0.5 : homeDiff * 2.0;
  } else if (!isHome && stats.awayAvgScored !== undefined && stats.averagePointsScored > 0) {
    const awayDiff = stats.awayAvgScored - stats.averagePointsScored;
    index += league === 'NBA' ? awayDiff * 0.5 : awayDiff * 2.0;
  }

  // ② H2H historical advantage
  if (extras?.h2h && extras.h2h.totalGames >= 3) {
    const h2h = extras.h2h;
    const myWins = extras.isTeamA ? h2h.teamAWins : h2h.teamBWins;
    const h2hWinRate = myWins / h2h.totalGames;
    const h2hAdvantage = (h2hWinRate - 0.5) * (league === 'NBA' ? 10.0 : 6.0);
    index += h2hAdvantage;
  }

  // ③ Fatigue penalty
  if (extras?.fatigue) {
    if (extras.fatigue.fatigueLevel === 'heavy') {
      index -= league === 'NBA' ? 6.0 : 2.0;
    } else if (extras.fatigue.fatigueLevel === 'mild') {
      index -= league === 'NBA' ? 3.0 : 1.0;
    }
  }

  // ④ MLB Starting Pitcher (opponent's pitcher affects our scoring)
  if (league === 'MLB' && extras?.opponentPitcher) {
    // Good opponent pitcher (high advantage) = harder for us to score => lower index
    const pitcherImpact = (extras.opponentPitcher.advantageFactor - 1.0) * 4.0;
    index -= pitcherImpact;
  }

  // ⑤ Scoring Momentum
  if (stats.scoringMomentum !== undefined) {
    const momentumBoost = league === 'NBA'
      ? stats.scoringMomentum * 0.8  // NBA: each point of slope = 0.8 index points
      : stats.scoringMomentum * 1.5; // MLB: each run of slope = 1.5 index points
    index += momentumBoost;
  }

  return index;
}

/**
 * V2 MODEL 1: Enhanced SportsAI with 6 dimensions.
 */
export function calculateWinProbabilityV2(
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  gameId: string,
  league: League,
  extras?: {
    h2h?: H2HRecord | null;
    homeFatigue?: FatigueInfo;
    awayFatigue?: FatigueInfo;
    homePitcher?: PitcherInfo | null;
    awayPitcher?: PitcherInfo | null;
    homeRecord?: string;
    awayRecord?: string;
  }
): PredictionDetailStats {
  let finalHomeProb = 0.5;
  let finalAwayProb = 0.5;

  let modelUsed = false;
  if (league === 'MLB') {
    const modelResult = predictMLBWinProbabilityWithModel(
      homeStats,
      awayStats,
      extras?.homeRecord,
      extras?.awayRecord
    );
    if (modelResult) {
      finalHomeProb = modelResult.homeProbability / 100;
      finalAwayProb = modelResult.awayProbability / 100;
      modelUsed = true;
    }
  }

  if (!modelUsed) {
    const homeStrength = calculateStrengthIndexV2(homeStats, league, true, {
      h2h: extras?.h2h,
      isTeamA: true,
      fatigue: extras?.homeFatigue,
      opponentPitcher: extras?.awayPitcher, // Away pitcher affects home team's scoring
    });
    const awayStrength = calculateStrengthIndexV2(awayStats, league, false, {
      h2h: extras?.h2h,
      isTeamA: false,
      fatigue: extras?.awayFatigue,
      opponentPitcher: extras?.homePitcher, // Home pitcher affects away team's scoring
    });

    const diff = homeStrength - awayStrength;
    const scaleFactor = league === 'MLB' ? 18.0 : 15.0;
    const homeProb = 1 / (1 + Math.exp(-diff / scaleFactor));

    finalHomeProb = homeProb;
    finalAwayProb = 1 - homeProb;

    const maxProb = league === 'MLB' ? 0.74 : 0.85;
    const minProb = league === 'MLB' ? 0.26 : 0.15;

    if (finalHomeProb > maxProb) { finalHomeProb = maxProb; finalAwayProb = 1 - maxProb; }
    else if (finalHomeProb < minProb) { finalHomeProb = minProb; finalAwayProb = 1 - minProb; }
  }

  // Use home/away split averages for score baseline when available
  const homeBaseScore = homeStats.homeAvgScored ?? homeStats.averagePointsScored;
  const awayBaseScore = awayStats.awayAvgScored ?? awayStats.averagePointsScored;

  // Apply momentum adjustment to baseline
  const homeMomentumAdj = (homeStats.scoringMomentum ?? 0) * (league === 'NBA' ? 0.5 : 0.3);
  const awayMomentumAdj = (awayStats.scoringMomentum ?? 0) * (league === 'NBA' ? 0.5 : 0.3);

  // Apply fatigue penalty to scoring
  const homeFatiguePenalty = extras?.homeFatigue?.fatigueLevel === 'heavy' ? (league === 'NBA' ? 4.0 : 0.8) :
                             extras?.homeFatigue?.fatigueLevel === 'mild' ? (league === 'NBA' ? 2.0 : 0.4) : 0;
  const awayFatiguePenalty = extras?.awayFatigue?.fatigueLevel === 'heavy' ? (league === 'NBA' ? 4.0 : 0.8) :
                             extras?.awayFatigue?.fatigueLevel === 'mild' ? (league === 'NBA' ? 2.0 : 0.4) : 0;

  // Apply pitcher impact on opponent scoring
  const homePitcherAdj = league === 'MLB' && extras?.homePitcher
    ? (extras.homePitcher.advantageFactor - 1.0) * -1.5  // Good home pitcher reduces away score
    : 0;
  const awayPitcherAdj = league === 'MLB' && extras?.awayPitcher
    ? (extras.awayPitcher.advantageFactor - 1.0) * -1.5  // Good away pitcher reduces home score
    : 0;

  const homeStrength = calculateStrengthIndexV2(homeStats, league, true, {
    h2h: extras?.h2h,
    isTeamA: true,
    fatigue: extras?.homeFatigue,
    opponentPitcher: extras?.awayPitcher,
  });
  const awayStrength = calculateStrengthIndexV2(awayStats, league, false, {
    h2h: extras?.h2h,
    isTeamA: false,
    fatigue: extras?.awayFatigue,
    opponentPitcher: extras?.homePitcher,
  });
  const diff = homeStrength - awayStrength;
  const shift = diff * (league === 'NBA' ? 0.08 : 0.04);
  const homeFluct = calculateFluctuation(homeStats.streak, league);
  const awayFluct = calculateFluctuation(awayStats.streak, league);
  const homeExp = homeBaseScore + shift + homeMomentumAdj - homeFatiguePenalty + awayPitcherAdj + homeFluct.scoreAdj;
  const awayExp = awayBaseScore - shift + awayMomentumAdj - awayFatiguePenalty + homePitcherAdj + awayFluct.scoreAdj;

  let homeExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, homeExp).toFixed(1));
  let awayExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, awayExp).toFixed(1));

  const predictedWinner = finalHomeProb >= finalAwayProb ? 'home' : 'away';
  if (predictedWinner === 'home' && awayExpectedScore > homeExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  } else if (predictedWinner === 'away' && homeExpectedScore > awayExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  }

  const ouLine = calculateOverUnderLine(homeBaseScore, awayBaseScore, gameId, league);
  const ouPick = (homeExpectedScore + awayExpectedScore) > ouLine ? 'Over' : 'Under';

  return {
    homeProbability: Number((finalHomeProb * 100).toFixed(1)),
    awayProbability: Number((finalAwayProb * 100).toFixed(1)),
    homeExpectedScore,
    awayExpectedScore,
    ouLine,
    ouPick,
  };
}

/**
 * V2 MODEL 2: Enhanced Elo Rating Power Index Model
 */
export function calculateEloProbabilityV2(
  homeRecordStr: string | undefined,
  awayRecordStr: string | undefined,
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  gameId: string,
  league: League,
  extras?: {
    h2h?: H2HRecord | null;
    homeFatigue?: FatigueInfo;
    awayFatigue?: FatigueInfo;
  }
): PredictionDetailStats {
  const homeRec = parseRecord(homeRecordStr);
  const awayRec = parseRecord(awayRecordStr);
  
  const getBaseElo = (wins: number, losses: number) => {
    const total = wins + losses;
    if (total === 0) return 1500;
    const winRate = wins / total;
    return 1500 + (winRate - 0.5) * 400;
  };

  const homeElo = getBaseElo(homeRec.wins, homeRec.losses);
  const awayElo = getBaseElo(awayRec.wins, awayRec.losses);
  
  const homeAdv = league === 'NBA' ? 70 : 50; 
  let diff = (homeElo + homeAdv) - awayElo;
  
  // H2H adjustment to Elo difference
  if (extras?.h2h && extras.h2h.totalGames >= 3) {
    const h2h = extras.h2h;
    const teamAWinRate = h2h.teamAWins / h2h.totalGames;
    // Shift Elo difference by H2H results (up to +/- 50 Elo points)
    diff += (teamAWinRate - 0.5) * 100;
  }

  // Fatigue adjustment to Elo difference
  if (extras?.homeFatigue) {
    if (extras.homeFatigue.fatigueLevel === 'heavy') diff -= 30;
    else if (extras.homeFatigue.fatigueLevel === 'mild') diff -= 15;
  }
  if (extras?.awayFatigue) {
    if (extras.awayFatigue.fatigueLevel === 'heavy') diff += 30;
    else if (extras.awayFatigue.fatigueLevel === 'mild') diff += 15;
  }

  const homeProb = 1 / (1 + Math.pow(10, -diff / 400));
  
  let finalHomeProb = homeProb;
  let finalAwayProb = 1 - homeProb;
  
  const maxProb = league === 'MLB' ? 0.72 : 0.82;
  const minProb = league === 'MLB' ? 0.28 : 0.18;
  
  if (finalHomeProb > maxProb) {
    finalHomeProb = maxProb;
    finalAwayProb = 1 - maxProb;
  } else if (finalHomeProb < minProb) {
    finalHomeProb = minProb;
    finalAwayProb = 1 - minProb;
  }

  // Use splits for baseline expected score
  const homeBaseScore = homeStats.homeAvgScored ?? homeStats.averagePointsScored;
  const awayBaseScore = awayStats.awayAvgScored ?? awayStats.averagePointsScored;

  // Score prediction using Elo delta and fluctuation
  const shift = diff * (league === 'NBA' ? 0.05 : 0.025);
  const homeFluct = calculateFluctuation(homeStats.streak, league);
  const awayFluct = calculateFluctuation(awayStats.streak, league);
  let homeExp = homeBaseScore + shift + homeFluct.scoreAdj;
  let awayExp = awayBaseScore - shift + awayFluct.scoreAdj;

  // Apply fatigue penalty to Elo expected score
  if (extras?.homeFatigue?.fatigueLevel === 'heavy') homeExp -= (league === 'NBA' ? 3.0 : 0.6);
  else if (extras?.homeFatigue?.fatigueLevel === 'mild') homeExp -= (league === 'NBA' ? 1.5 : 0.3);

  if (extras?.awayFatigue?.fatigueLevel === 'heavy') awayExp -= (league === 'NBA' ? 3.0 : 0.6);
  else if (extras?.awayFatigue?.fatigueLevel === 'mild') awayExp -= (league === 'NBA' ? 1.5 : 0.3);

  let homeExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, homeExp).toFixed(1));
  let awayExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, awayExp).toFixed(1));
  
  // Enforce consistency: predicted winner must have the higher expected score
  const predictedWinnerElo = finalHomeProb >= finalAwayProb ? 'home' : 'away';
  if (predictedWinnerElo === 'home' && awayExpectedScore > homeExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  } else if (predictedWinnerElo === 'away' && homeExpectedScore > awayExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  }
  
  const ouLine = calculateOverUnderLine(homeBaseScore, awayBaseScore, gameId, league);
  const ouPick = (homeExpectedScore + awayExpectedScore) > ouLine ? 'Over' : 'Under';

  return {
    homeProbability: Number((finalHomeProb * 100).toFixed(1)),
    awayProbability: Number((finalAwayProb * 100).toFixed(1)),
    homeExpectedScore,
    awayExpectedScore,
    ouLine,
    ouPick,
  };
}

/**
 * V2 MODEL 3: Enhanced Monte Carlo 10,000 runs Simulation Model
 */
export function calculateMonteCarloProbabilityV2(
  homeStats: TeamRecentStats,
  awayStats: TeamRecentStats,
  gameId: string,
  league: League,
  extras?: {
    h2h?: H2HRecord | null;
    homeFatigue?: FatigueInfo;
    awayFatigue?: FatigueInfo;
    homePitcher?: PitcherInfo | null;
    awayPitcher?: PitcherInfo | null;
  }
): PredictionDetailStats {
  const sims = 10000;
  let homeWins = 0;
  let totalHomeScore = 0;
  let totalAwayScore = 0;
  
  // Base standard deviation and field advantage
  let homeStdDev = league === 'MLB' ? 2.3 : 8.2;
  let awayStdDev = league === 'MLB' ? 2.3 : 8.2;
  const homeFieldAdv = league === 'NBA' ? 2.5 : 0.35;

  const homeFluct = calculateFluctuation(homeStats.streak, league);
  const awayFluct = calculateFluctuation(awayStats.streak, league);

  // Apply fluctuation standard deviation multipliers
  homeStdDev *= homeFluct.stdDevMultiplier;
  awayStdDev *= awayFluct.stdDevMultiplier;

  // Fatigue increases variance (standard deviation)
  if (extras?.homeFatigue?.fatigueLevel === 'heavy') homeStdDev *= 1.25;
  else if (extras?.homeFatigue?.fatigueLevel === 'mild') homeStdDev *= 1.1;

  if (extras?.awayFatigue?.fatigueLevel === 'heavy') awayStdDev *= 1.25;
  else if (extras?.awayFatigue?.fatigueLevel === 'mild') awayStdDev *= 1.1;
  
  const randomNormal = (mean: number, std: number): number => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return num * std + mean;
  };

  // Base mean scoring is home/away splits
  let homeMean = homeStats.homeAvgScored ?? homeStats.averagePointsScored;
  let awayMean = awayStats.awayAvgScored ?? awayStats.averagePointsScored;

  // Apply fluctuation adjustment to mean scores
  homeMean += homeFluct.scoreAdj;
  awayMean += awayFluct.scoreAdj;

  // Adjust mean based on H2H history
  if (extras?.h2h && extras.h2h.totalGames >= 3) {
    const h2h = extras.h2h;
    const diffAvg = h2h.teamAAvgScore - h2h.teamBAvgScore;
    // Shift baseline towards H2H differential
    homeMean += diffAvg * 0.15;
    awayMean -= diffAvg * 0.15;
  }

  // Adjust mean based on momentum
  if (homeStats.scoringMomentum !== undefined) {
    homeMean += homeStats.scoringMomentum * (league === 'NBA' ? 0.3 : 0.15);
  }
  if (awayStats.scoringMomentum !== undefined) {
    awayMean += awayStats.scoringMomentum * (league === 'NBA' ? 0.3 : 0.15);
  }

  // Pitcher advantages for MLB
  if (league === 'MLB') {
    if (extras?.homePitcher) {
      // Good home pitcher reduces away scoring mean
      awayMean -= (extras.homePitcher.advantageFactor - 1.0) * 1.0;
    }
    if (extras?.awayPitcher) {
      // Good away pitcher reduces home scoring mean
      homeMean -= (extras.awayPitcher.advantageFactor - 1.0) * 1.0;
    }
  }

  // Fatigue penalty to mean scores
  if (extras?.homeFatigue?.fatigueLevel === 'heavy') homeMean -= (league === 'NBA' ? 3.5 : 0.7);
  else if (extras?.homeFatigue?.fatigueLevel === 'mild') homeMean -= (league === 'NBA' ? 1.5 : 0.3);

  if (extras?.awayFatigue?.fatigueLevel === 'heavy') awayMean -= (league === 'NBA' ? 3.5 : 0.7);
  else if (extras?.awayFatigue?.fatigueLevel === 'mild') awayMean -= (league === 'NBA' ? 1.5 : 0.3);
  
  for (let i = 0; i < sims; i++) {
    const homeSimScore = randomNormal(homeMean, homeStdDev) + homeFieldAdv;
    const awaySimScore = randomNormal(awayMean, awayStdDev);
    
    totalHomeScore += homeSimScore;
    totalAwayScore += awaySimScore;
    
    if (homeSimScore > awaySimScore) {
      homeWins++;
    }
  }
  
  const homeProb = homeWins / sims;
  let finalHomeProb = homeProb;
  let finalAwayProb = 1 - homeProb;
  
  const maxProb = league === 'MLB' ? 0.75 : 0.86;
  const minProb = league === 'MLB' ? 0.25 : 0.14;
  
  if (finalHomeProb > maxProb) {
    finalHomeProb = maxProb;
    finalAwayProb = 1 - maxProb;
  } else if (finalHomeProb < minProb) {
    finalHomeProb = minProb;
    finalAwayProb = 1 - minProb;
  }

  // Obtain expected scores from the average of 10,000 simulation runs
  let homeExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, totalHomeScore / sims).toFixed(1));
  let awayExpectedScore = Number(Math.max(league === 'NBA' ? 80 : 1, totalAwayScore / sims).toFixed(1));
  
  // Enforce consistency: predicted winner must have the higher expected score
  const predictedWinnerMC = finalHomeProb >= finalAwayProb ? 'home' : 'away';
  if (predictedWinnerMC === 'home' && awayExpectedScore > homeExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  } else if (predictedWinnerMC === 'away' && homeExpectedScore > awayExpectedScore) {
    [homeExpectedScore, awayExpectedScore] = [awayExpectedScore, homeExpectedScore];
  }
  
  const ouLine = calculateOverUnderLine(homeMean, awayMean, gameId, league);
  const ouPick = (homeExpectedScore + awayExpectedScore) > ouLine ? 'Over' : 'Under';

  return {
    homeProbability: Number((finalHomeProb * 100).toFixed(1)),
    awayProbability: Number((finalAwayProb * 100).toFixed(1)),
    homeExpectedScore,
    awayExpectedScore,
    ouLine,
    ouPick,
  };
}
