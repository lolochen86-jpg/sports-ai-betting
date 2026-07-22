import type { GameWithTeams, League } from '@/types/sports';
import type { TeamRecentStats, PitcherInfo } from './stats';
import type { ParkFactorInfo } from './park-factors';
import type { TeamDepthInfo } from './depth-quality';
import { sanitizeMlbScore, applyMlbTotalsLimits } from './stats';

export interface MatchupScoreResult {
  homeExpectedScore: number;
  awayExpectedScore: number;
  reasoning: string[];
}

/**
 * Pitcher & Bullpen Matchup Model (投打與牛棚深度對位預測模型)
 */
export function calculatePitcherBullpenScore(
  game: GameWithTeams,
  league: League,
  homeRecent: TeamRecentStats,
  awayRecent: TeamRecentStats,
  homePitcher: PitcherInfo | null,
  awayPitcher: PitcherInfo | null,
  homeDepth: TeamDepthInfo | null,
  awayDepth: TeamDepthInfo | null,
  parkFactor: ParkFactorInfo | null,
  ouLine?: number
): MatchupScoreResult {
  const reasoning: string[] = [];
  let homeExpectedScore = 0;
  let awayExpectedScore = 0;

  if (league === 'MLB') {
    // 1. Base Expected Runs (Teams' average points scored)
    const homeBase = homeRecent.averagePointsScored;
    const awayBase = awayRecent.averagePointsScored;

    // 2. Starter Innings Matchup (approx. 60% of game)
    // Home team batters face Away team's starting pitcher
    let homeVsStarter = homeBase * 0.60;
    if (awayPitcher) {
      // Standard pitcher has an ERA of 4.2. We use era/4.2 to scale, but clamp to avoid division by zero.
      const oppEra = awayPitcher.era > 0 ? awayPitcher.era : 4.2;
      const spQualityFactor = (oppEra / 4.2 + (awayPitcher.whip ?? 1.30) / 1.30) / 2.0;
      
      // Pitcher advantage factor: >1 is good for pitcher (bad for batters)
      const advantage = awayPitcher.advantageFactor > 0 ? awayPitcher.advantageFactor : (1.0 / spQualityFactor);
      
      homeVsStarter = homeVsStarter / advantage;
      reasoning.push(`🏠 主隊打線前段局數對決客隊先發投手 ${awayPitcher.name} (ERA ${awayPitcher.era.toFixed(2)})，受投手壓制力影響，預估得 ${homeVsStarter.toFixed(2)} 分。`);
    } else {
      reasoning.push(`🏠 主隊打線對決客隊先發投手 (未定/TBD)，維持基礎期望值。`);
    }

    // Away team batters face Home team's starting pitcher
    let awayVsStarter = awayBase * 0.60;
    if (homePitcher) {
      const oppEra = homePitcher.era > 0 ? homePitcher.era : 4.2;
      const spQualityFactor = (oppEra / 4.2 + (homePitcher.whip ?? 1.30) / 1.30) / 2.0;
      
      const advantage = homePitcher.advantageFactor > 0 ? homePitcher.advantageFactor : (1.0 / spQualityFactor);
      
      awayVsStarter = awayVsStarter / advantage;
      reasoning.push(`🚌 客隊打線前段局數對決主隊先發投手 ${homePitcher.name} (ERA ${homePitcher.era.toFixed(2)})，受投手壓制力影響，預估得 ${awayVsStarter.toFixed(2)} 分。`);
    } else {
      reasoning.push(`🚌 客隊打線對決主隊先發投手 (未定/TBD)，維持基礎期望值。`);
    }

    // 3. Bullpen Innings Matchup (approx. 40% of game)
    // Home team batters face Away team's bullpen
    let homeVsBullpen = homeBase * 0.40;
    if (awayDepth) {
      const bpTierMultiplier = awayDepth.bullpenTier === 'elite' ? 0.82 
                             : awayDepth.bullpenTier === 'above_avg' ? 0.90 
                             : awayDepth.bullpenTier === 'average' ? 1.0 
                             : awayDepth.bullpenTier === 'below_avg' ? 1.10 
                             : 1.20; // weak
      
      const oppBpEra = awayDepth.bullpenERA !== undefined && awayDepth.bullpenERA > 0 ? awayDepth.bullpenERA : 4.2;
      const bpEraMultiplier = oppBpEra / 4.2;
      // Blended factor
      const bpFactor = (bpTierMultiplier + bpEraMultiplier) / 2.0;
      homeVsBullpen = homeVsBullpen * bpFactor;
      reasoning.push(`🏠 主隊打線中後段局數上面對客隊後援牛棚 (${awayDepth.bullpenTier === 'elite' ? '精英' : awayDepth.bullpenTier === 'above_avg' ? '優良' : '普通'}級，ERA ${oppBpEra.toFixed(2)})，預估得 ${homeVsBullpen.toFixed(2)} 分。`);
    } else {
      reasoning.push(`🏠 主隊對手牛棚資訊未載入，採用基礎後援期望值。`);
    }

    // Away team batters face Home team's bullpen
    let awayVsBullpen = awayBase * 0.40;
    if (homeDepth) {
      const bpTierMultiplier = homeDepth.bullpenTier === 'elite' ? 0.82 
                             : homeDepth.bullpenTier === 'above_avg' ? 0.90 
                             : homeDepth.bullpenTier === 'average' ? 1.0 
                             : homeDepth.bullpenTier === 'below_avg' ? 1.10 
                             : 1.20; // weak
      
      const homeBpEra = homeDepth.bullpenERA !== undefined && homeDepth.bullpenERA > 0 ? homeDepth.bullpenERA : 4.2;
      const bpEraMultiplier = homeBpEra / 4.2;
      const bpFactor = (bpTierMultiplier + bpEraMultiplier) / 2.0;
      awayVsBullpen = awayVsBullpen * bpFactor;
      reasoning.push(`🚌 客隊打線中後段局數上面對主隊後援牛棚 (${homeDepth.bullpenTier === 'elite' ? '精英' : homeDepth.bullpenTier === 'above_avg' ? '優良' : '普通'}級，ERA ${homeBpEra.toFixed(2)})，預估得 ${awayVsBullpen.toFixed(2)} 分。`);
    } else {
      reasoning.push(`🚌 客隊對手牛棚資訊未載入，採用基礎後援期望值。`);
    }

    // 4. Combine and Apply Park Factor
    let rawHome = homeVsStarter + homeVsBullpen;
    let rawAway = awayVsStarter + awayVsBullpen;

    if (parkFactor) {
      rawHome = rawHome * parkFactor.runFactor;
      rawAway = rawAway * parkFactor.runFactor;
      reasoning.push(`🏟️ 【球場效應注入】本場比賽於 ${parkFactor.venueName || '球場'} 進行，球場得分因子為 ${parkFactor.runFactor.toFixed(2)}x。`);
    }

    // Non-linear saturation and totals limits
    const clamped = applyMlbTotalsLimits(rawHome, rawAway, ouLine);
    homeExpectedScore = Number(clamped.home.toFixed(1));
    awayExpectedScore = Number(clamped.away.toFixed(1));
    
  } else {
    // NBA: Starters (67%) vs Bench/Depth (33%)
    const homeBase = homeRecent.averagePointsScored;
    const awayBase = awayRecent.averagePointsScored;

    // 1. Starters matchup
    // Home starters face Away's starter defense
    let homeVsStarter = homeBase * 0.67;
    const awayDefRating = awayRecent.averagePointsConceded / 112; // 112 is league average
    homeVsStarter = homeVsStarter * (1.0 + (1.0 - awayDefRating) * 0.5);
    reasoning.push(`🏠 主隊先發陣容對決客隊防守體系，預估得 ${homeVsStarter.toFixed(1)} 分。`);

    // Away starters face Home's starter defense
    let awayVsStarter = awayBase * 0.67;
    const homeDefRating = homeRecent.averagePointsConceded / 112;
    awayVsStarter = awayVsStarter * (1.0 + (1.0 - homeDefRating) * 0.5);
    reasoning.push(`🚌 客隊先發陣容對決主隊防守體系，預估得 ${awayVsStarter.toFixed(1)} 分。`);

    // 2. Bench matchup
    // Home team face Away bench
    let homeVsBench = homeBase * 0.33;
    if (awayDepth) {
      // depthScore ranges from 50 to 100, standard is 75
      const depthFactor = 1.0 + (75 - awayDepth.depthScore) * 0.003;
      homeVsBench = homeVsBench * depthFactor;
      reasoning.push(`🏠 主隊進攻對位客隊板凳防守深度 (評分 ${awayDepth.depthScore})，預估得 ${homeVsBench.toFixed(1)} 分。`);
    }

    // Away team face Home bench
    let awayVsBench = awayBase * 0.33;
    if (homeDepth) {
      const depthFactor = 1.0 + (75 - homeDepth.depthScore) * 0.003;
      awayVsBench = awayVsBench * depthFactor;
      reasoning.push(`🚌 客隊進攻對位主隊板凳防守深度 (評分 ${homeDepth.depthScore})，預估得 ${awayVsBench.toFixed(1)} 分。`);
    }

    homeExpectedScore = Number((homeVsStarter + homeVsBench).toFixed(1));
    awayExpectedScore = Number((awayVsStarter + awayVsBench).toFixed(1));
  }

  return {
    homeExpectedScore,
    awayExpectedScore,
    reasoning
  };
}
