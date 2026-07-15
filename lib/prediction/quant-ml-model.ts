import type { GameWithTeams, League } from '@/types/sports';
import type { TeamRecentStats, PitcherInfo } from './stats';
import { getTeamDepth } from './depth-quality';
import { calculateAdi, MLB_ELEVATION_FT } from './adi-calculator';
import { applyDefensiveSynergy } from './defensive-synergy';
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
 * Core QuantML model - combines Python API and local Poisson GLM fallback
 */
export async function calculateQuantMLPrediction(
  game: GameWithTeams,
  league: League,
  homeRecent: TeamRecentStats,
  awayRecent: TeamRecentStats,
  homePitcher: PitcherInfo | null,
  awayPitcher: PitcherInfo | null
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
    awayPitcher
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
  awayPitcher: PitcherInfo | null
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
    const elevationFt = MLB_ELEVATION_FT[homeCode] ?? 100;
    const tempF = 72.0; // standard temperature
    const humidityPct = 50.0;
    const windSpeedMph = 5.0;

    // A. ADI calculation
    const adiResult = calculateAdi(tempF, elevationFt, humidityPct);
    const adi = adiResult.adi;
    const hrFactor = adiResult.hrFactor;

    reasoning.push(`Calculated home park ADI: ${adi.toFixed(1)}, HR Factor: ${hrFactor.toFixed(2)} (${elevationFt > 1000 ? 'High Altitude' : 'Standard elevation'})`);

    // B. Pitcher parameters & defensive synergy
    const homeSpGb = 0.43;
    const homeCatcherFraming = homeDepth?.bullpenTier === 'elite' ? 3.0 
                             : homeDepth?.bullpenTier === 'above_avg' ? 1.5 
                             : homeDepth?.bullpenTier === 'average' ? 0.0 
                             : homeDepth?.bullpenTier === 'below_avg' ? -1.5 
                             : -3.0;
    const homeMiOaa = homeCatcherFraming;
    const homeSpBaseRuns = homePitcher ? homePitcher.era * 0.9 : 4.2;
    const homeSynergy = applyDefensiveSynergy(homeSpGb, homeCatcherFraming, homeMiOaa, homeSpBaseRuns);

    const awaySpGb = 0.43;
    const awayCatcherFraming = awayDepth?.bullpenTier === 'elite' ? 3.0 
                             : awayDepth?.bullpenTier === 'above_avg' ? 1.5 
                             : awayDepth?.bullpenTier === 'average' ? 0.0 
                             : awayDepth?.bullpenTier === 'below_avg' ? -1.5 
                             : -3.0;
    const awayMiOaa = awayCatcherFraming;
    const awaySpBaseRuns = awayPitcher ? awayPitcher.era * 0.9 : 4.2;
    const awaySynergy = applyDefensiveSynergy(awaySpGb, awayCatcherFraming, awayMiOaa, awaySpBaseRuns);

    if (homePitcher) {
      reasoning.push(`Home starter ${homePitcher.name} base expected runs: ${homeSpBaseRuns.toFixed(2)}, adjusted by defensive synergy to ${homeSynergy.adjustedExpectedRuns.toFixed(2)}`);
    }
    if (awayPitcher) {
      reasoning.push(`Away starter ${awayPitcher.name} base expected runs: ${awaySpBaseRuns.toFixed(2)}, adjusted by defensive synergy to ${awaySynergy.adjustedExpectedRuns.toFixed(2)}`);
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
      home_sp_xfip_ema: homePitcher ? Math.max(Math.min(homePitcher.era * 0.95 + 0.2, 6.0), 2.0) : 4.5,
      home_sp_k_bb_pct_ema: homePitcher ? Math.max(Math.min(0.28 - (homePitcher.era * 0.03) - ((homePitcher.whip ?? 1.30) - 1.0) * 0.15, 0.35), 0.0) : 0.12,
      home_sp_gb_pct: homeSpGb,
      home_sp_expected_runs_base: homeSpBaseRuns,
      home_sp_expected_runs_adj: homeSynergy.adjustedExpectedRuns,
      home_def_synergy_total: homeSynergy.synergyTotal,
      home_def_gb_weight: homeSynergy.gbWeightMultiplier,
      
      away_lineup_woba_ema_sum: awayWobaSum,
      away_lineup_iso_ema_sum: awayIsoSum,
      away_lineup_size: 9,
      away_sp_xfip_ema: awayPitcher ? Math.max(Math.min(awayPitcher.era * 0.95 + 0.2, 6.0), 2.0) : 4.5,
      away_sp_k_bb_pct_ema: awayPitcher ? Math.max(Math.min(0.28 - (awayPitcher.era * 0.03) - ((awayPitcher.whip ?? 1.30) - 1.0) * 0.15, 0.35), 0.0) : 0.12,
      away_sp_gb_pct: awaySpGb,
      away_sp_expected_runs_base: awaySpBaseRuns,
      away_sp_expected_runs_adj: awaySynergy.adjustedExpectedRuns,
      away_def_synergy_total: awaySynergy.synergyTotal,
      away_def_gb_weight: awaySynergy.gbWeightMultiplier,

      adi: adi,
      hr_factor: hrFactor,
      temperature_f: tempF,
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
