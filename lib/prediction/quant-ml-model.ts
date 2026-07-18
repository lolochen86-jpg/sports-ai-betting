import type { GameWithTeams, League } from '@/types/sports';
import type { TeamRecentStats, PitcherInfo } from './stats';
import { getTeamDepth } from './depth-quality';
import { calculateAdi } from './adi-calculator';
import { predictPoissonRuns } from './poisson-glm-lite';
import { fetchQuantPredictions } from './quant-bridge';

export interface QuantMLResult {
  homeExpectedScore: number;
  awayExpectedScore: number;
  homeProb: number;
  awayProb: number;
  reasoning: string[];
  isRealMl: boolean;
}

/**
 * Orchestrates QuantML model calculations
 */
export async function calculateQuantMLPrediction(
  game: GameWithTeams,
  league: League,
  homeRecent: TeamRecentStats,
  awayRecent: TeamRecentStats,
  homePitcher: PitcherInfo | null,
  awayPitcher: PitcherInfo | null,
  tempF?: number,
  humidityPct?: number
): Promise<QuantMLResult> {
  // 1. Try Python API first
  const apiResult = await fetchQuantPredictions(game, league);
  if (apiResult) {
    return apiResult;
  }

  // 2. If API fails, perform local mathematical fallback
  const syncResult = calculateQuantMLPredictionSync(
    game.homeTeam?.code ?? '',
    game.awayTeam?.code ?? '',
    league,
    homeRecent,
    awayRecent,
    homePitcher,
    awayPitcher,
    tempF,
    humidityPct
  );

  const reasoning = [
    "Python service offline. Activated local TypeScript Poisson GLM regression engine.",
    ...syncResult.reasoning
  ];

  return {
    ...syncResult,
    reasoning,
    isRealMl: false
  };
}

/**
 * Synchronous calculation of QuantML model (used for backtesting and fast path)
 */
export function calculateQuantMLPredictionSync(
  homeCode: string,
  awayCode: string,
  league: League,
  homeRecent: TeamRecentStats,
  awayRecent: TeamRecentStats,
  homePitcher: PitcherInfo | null,
  awayPitcher: PitcherInfo | null,
  tempF?: number,
  humidityPct?: number
): {
  homeExpectedScore: number;
  awayExpectedScore: number;
  homeProb: number;
  awayProb: number;
  reasoning: string[];
} {
  const reasoning: string[] = [];
  let homeExpectedScore = 0.0;
  let awayExpectedScore = 0.0;
  let homeProb = 0.50;
  let awayProb = 0.50;

  if (league === 'MLB') {
    // Fetch team depth info to use as defensive proxy
    const homeDepth = getTeamDepth(homeCode, 'MLB');
    const awayDepth = getTeamDepth(awayCode, 'MLB');

    // Fetch Elevation
    // Note: Python model was trained using 500.0ft default because game elevation is missing in the database.
    // Setting elevationFt to 500.0 is critical to prevent collinearity cancellation explosion between ADI and elevation.
    const elevationFt = 500.0;
    const currentTemp = tempF ?? 72.0;
    const currentHumidity = humidityPct ?? 50.0;
    const windSpeedMph = 3.0; // matching default live wind speed in Python model

    // A. ADI calculation
    const adiResult = calculateAdi(currentTemp, elevationFt, currentHumidity);
    const adi = adiResult.adi;
    const hrFactor = adiResult.hrFactor;

    reasoning.push(`Calculated home park ADI: ${adi.toFixed(1)}, HR Factor: ${hrFactor.toFixed(2)} (Standard elevation)`);

    // B. Pitcher parameters
    const homeSpGb = 0.43;
    const homeSpXfip = homePitcher ? Math.max(Math.min(homePitcher.era * 0.95 + 0.2, 6.0), 2.0) : 4.5;
    // Starter Expected Runs are scaled by 6/9 innings (approx. 60% of game)
    const homeSpBaseRuns = homeSpXfip * (6.0 / 9.0);
    // Note: expected_runs_adj must match base runs exactly to avoid collinearity cancellation explosion
    const homeSpExpectedRunsAdj = homeSpBaseRuns;
    const homeDefSynergyTotal = 0.0;
    const homeDefGbWeight = 1.0;

    const awaySpGb = 0.43;
    const awaySpXfip = awayPitcher ? Math.max(Math.min(awayPitcher.era * 0.95 + 0.2, 6.0), 2.0) : 4.5;
    const awaySpBaseRuns = awaySpXfip * (6.0 / 9.0);
    const awaySpExpectedRunsAdj = awaySpBaseRuns;
    const awayDefSynergyTotal = 0.0;
    const awayDefGbWeight = 1.0;

    if (homePitcher) {
      reasoning.push(`Home starter ${homePitcher.name} expected runs: ${homeSpBaseRuns.toFixed(2)} (scaled to 6 innings)`);
    }
    if (awayPitcher) {
      reasoning.push(`Away starter ${awayPitcher.name} expected runs: ${awaySpBaseRuns.toFixed(2)} (scaled to 6 innings)`);
    }

    // C. Lineup wOBA and ISO estimation
    const homeWobaAvg = 0.310 + (homeRecent.averagePointsScored - 4.4) * 0.015;
    const homeIsoAvg = 0.145 + (homeRecent.averagePointsScored - 4.4) * 0.010;
    const homeWobaSum = 9 * homeWobaAvg;
    const homeIsoSum = 9 * homeIsoAvg;

    const awayWobaAvg = 0.310 + (awayRecent.averagePointsScored - 4.4) * 0.015;
    const awayIsoAvg = 0.145 + (awayRecent.averagePointsScored - 4.4) * 0.010;
    const awayWobaSum = 9 * awayWobaAvg;
    const awayIsoSum = 9 * awayIsoAvg;

    // D. Construct feature vectors
    const features: Record<string, number> = {
      const: 1.0,
      home_lineup_woba_ema_sum: homeWobaSum,
      home_lineup_iso_ema_sum: homeIsoSum,
      home_lineup_size: 9,
      home_sp_xfip_ema: homeSpXfip,
      home_sp_k_bb_pct_ema: homePitcher ? Math.max(Math.min(0.28 - (homePitcher.era * 0.03) - ((homePitcher.whip ?? 1.30) - 1.0) * 0.15, 0.35), 0.0) : 0.08,
      home_sp_gb_pct: homeSpGb,
      home_sp_expected_runs_base: homeSpBaseRuns,
      home_sp_expected_runs_adj: homeSpExpectedRunsAdj,
      home_def_synergy_total: homeDefSynergyTotal,
      home_def_gb_weight: homeDefGbWeight,
      
      away_lineup_woba_ema_sum: awayWobaSum,
      away_lineup_iso_ema_sum: awayIsoSum,
      away_lineup_size: 9,
      away_sp_xfip_ema: awaySpXfip,
      away_sp_k_bb_pct_ema: awayPitcher ? Math.max(Math.min(0.28 - (awayPitcher.era * 0.03) - ((awayPitcher.whip ?? 1.30) - 1.0) * 0.15, 0.35), 0.0) : 0.08,
      away_sp_gb_pct: awaySpGb,
      away_sp_expected_runs_base: awaySpBaseRuns,
      away_sp_expected_runs_adj: awaySpExpectedRunsAdj,
      away_def_synergy_total: awayDefSynergyTotal,
      away_def_gb_weight: awayDefGbWeight,

      adi: adi,
      hr_factor: hrFactor,
      temperature_f: currentTemp,
      elevation_ft: elevationFt,
      wind_speed_mph: windSpeedMph
    };

    // E. Evaluate GLM Poisson formulas
    homeExpectedScore = predictPoissonRuns(features, 'home');
    awayExpectedScore = predictPoissonRuns(features, 'away');

    const scoreDiff = homeExpectedScore - awayExpectedScore;
    homeProb = 0.50 + Math.max(Math.min(scoreDiff * 0.06, 0.40), -0.40);
    awayProb = 1.0 - homeProb;

    reasoning.push(`Poisson regression score: Home ${homeExpectedScore.toFixed(1)}, Away ${awayExpectedScore.toFixed(1)} (Home Win Prob: ${(homeProb*100).toFixed(1)}%)`);
  } else {
    // NBA Fallback
    const homeBase = homeRecent.averagePointsScored;
    const awayBase = awayRecent.averagePointsScored;
    const homeDef = homeRecent.averagePointsConceded;
    const awayDef = awayRecent.averagePointsConceded;

    const homeOff = (homeBase + awayDef) / 2.0 + 1.25;
    const awayOff = (awayBase + homeDef) / 2.0 - 1.25;

    homeExpectedScore = Math.round(homeOff * 10) / 10;
    awayExpectedScore = Math.round(awayOff * 10) / 10;

    const diff = homeExpectedScore - awayExpectedScore;
    homeProb = 0.50 + Math.max(Math.min(diff * 0.035, 0.45), -0.45);
    awayProb = 1.0 - homeProb;

    reasoning.push(`NBA ratings adjustment: home win prob ${(homeProb * 100).toFixed(1)}%, score projection ${homeExpectedScore.toFixed(1)} vs ${awayExpectedScore.toFixed(1)}`);
  }

  return {
    homeExpectedScore,
    awayExpectedScore,
    homeProb,
    awayProb,
    reasoning
  };
}
