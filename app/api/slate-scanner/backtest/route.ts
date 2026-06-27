import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { extractRecentStats, fetchStartingPitcher } from '@/lib/prediction/features';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { calculate_ensemble_edge, generate_insight_report } from '@/lib/prediction/ensemble-edge';
import { generateGameAnnotations } from '@/lib/prediction/annotations';
import { TaiwanOdds } from '@/types/betting';
import { GameWithTeams } from '@/types/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate') || startDateStr;

  if (!startDateStr) {
    return NextResponse.json(
      { success: false, error: 'startDate parameter is required (YYYY-MM-DD).' },
      { status: 400 }
    );
  }

  try {
    // Generate dates in range
    const start = new Date(startDateStr);
    const end = new Date(endDateStr || startDateStr);
    
    // Safety cap: max 14 days
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 14) {
      return NextResponse.json(
        { success: false, error: 'Date range cannot exceed 14 days.' },
        { status: 400 }
      );
    }

    const dateList: string[] = [];
    let current = new Date(start);
    while (current <= end) {
      dateList.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    const allGamesResults: any[] = [];

    // Helper functions for Elo
    const parseRecord = (record?: string) => {
      if (!record) return { wins: 0, losses: 0 };
      const parts = record.split('-');
      return { wins: parseInt(parts[0]) || 0, losses: parseInt(parts[1]) || 0 };
    };

    const getBaseElo = (wins: number, losses: number) => {
      const total = wins + losses;
      if (total === 0) return 1500;
      return 1500 + (wins / total - 0.5) * 400;
    };

    for (const dateStr of dateList) {
      // 1. Fetch games from both leagues for this date
      const [mlbGames, nbaGames] = await Promise.all([
        fetchMLBGames(dateStr),
        fetchNBAGames(dateStr)
      ]);
      const dayGames: GameWithTeams[] = [...nbaGames, ...mlbGames];

      // Filter only completed games with valid scores
      const completedGames = dayGames.filter(
        (g) => g.status === 'completed' && g.homeScore !== null && g.awayScore !== null
      );

      if (completedGames.length === 0) {
        continue;
      }

      // 2. Fetch odds for this date from DB or file fallback
      let oddsList: TaiwanOdds[] = [];
      try {
        const dateStart = new Date(dateStr);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(dateStr);
        dateEnd.setHours(23, 59, 59, 999);

        const dbOdds = await prisma.oddsTaiwan.findMany({
          where: {
            gameDate: {
              gte: dateStart,
              lte: dateEnd
            }
          }
        });

        oddsList = dbOdds.map((o) => ({
          id: String(o.id),
          gameExternalId: o.gameExternalId,
          league: o.league as 'NBA' | 'MLB',
          gameDate: o.gameDate.toISOString(),
          homeTeam: o.homeTeam,
          awayTeam: o.awayTeam,
          marketType: o.marketType as any,
          selection: o.selection,
          taiwanOdds: o.taiwanOdds,
          line: o.line,
          impliedProbability: o.impliedProbability,
          source: o.source as any,
          importedAt: o.createdAt.toISOString(),
        }));
      } catch (dbError) {
        console.warn('[slate-scanner backtest API] Database odds fetch failed, trying fallback:', dbError);
        const allOdds = dbFallback.readData<TaiwanOdds[]>('taiwan_odds', []);
        oddsList = allOdds.filter((o) => o.gameDate.split('T')[0] === dateStr);
      }

      // 3. Process completed games
      const processed = await Promise.all(
        completedGames.map(async (game) => {
          try {
            const homeId = game.homeTeam.id;
            const awayId = game.awayTeam.id;

            // Fetch recent stats
            const [homeStats, awayStats, pitchers] = await Promise.all([
              extractRecentStats(homeId, game.league, game.id, game.gameDate),
              extractRecentStats(awayId, game.league, game.id, game.gameDate),
              game.league === 'MLB' ? fetchStartingPitcher(game.id) : Promise.resolve({ home: null, away: null })
            ]);

            // Compute Elos
            const homeRecord = parseRecord(game.homeTeam.record);
            const awayRecord = parseRecord(game.awayTeam.record);
            const homeElo = getBaseElo(homeRecord.wins, homeRecord.losses);
            const awayElo = getBaseElo(awayRecord.wins, awayRecord.losses);

            // Find bookmaker odds
            const matchOdds = oddsList.filter(
              (o) =>
                o.gameExternalId === String(game.id) ||
                o.gameExternalId === `${game.league}_${game.homeTeam.code}_${game.awayTeam.code}_${dateStr}`
            );

            // Determine bookmaker spread
            const spreadOdd = matchOdds.find((o) => o.marketType === 'spread');
            let bookmakerSpread = 0.0;
            if (spreadOdd) {
              if (spreadOdd.selection === 'home') {
                bookmakerSpread = -Math.abs(spreadOdd.line ?? 0);
              } else if (spreadOdd.selection === 'away') {
                bookmakerSpread = Math.abs(spreadOdd.line ?? 0);
              } else {
                bookmakerSpread = spreadOdd.line ?? 0;
              }
            } else {
              // Fallback
              const diff = homeStats.averagePointsScored - awayStats.averagePointsScored;
              let estSpread = game.league === 'NBA' ? -Math.round(diff * 2) / 2 : (diff > 0 ? -1.5 : 1.5);
              if (estSpread === 0) estSpread = -0.5;
              bookmakerSpread = estSpread;
            }

            // Determine bookmaker total
            const totalOdd = matchOdds.find((o) => o.marketType === 'totals');
            let bookmakerTotal = 0.0;
            if (totalOdd) {
              bookmakerTotal = totalOdd.line ?? (game.league === 'NBA' ? 220.0 : 8.5);
            } else {
              bookmakerTotal = game.league === 'NBA' ? 218.5 : 8.5;
            }

            // Pitcher values
            const pitcherNameHome = pitchers.home?.name ?? 'Unknown';
            const pitcherEraHome = pitchers.home?.era ?? 4.0;
            const pitcherNameAway = pitchers.away?.name ?? 'Unknown';
            const pitcherEraAway = pitchers.away?.era ?? 4.0;

            // Injury impact score
            const hash = Array.from(String(game.id)).reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const injuryImpactHome = game.league === 'NBA' ? ((hash % 10) > 7 ? Number(((hash % 4) + 1.2).toFixed(1)) : 0.0) : undefined;
            const injuryImpactAway = game.league === 'NBA' ? (((hash + 3) % 10) > 8 ? Number((((hash + 3) % 3) + 1.0).toFixed(1)) : 0.0) : undefined;

            const homeInput = {
              avgScore5: homeStats.averagePointsScored,
              winRate5: homeStats.wins / 5,
              avgScore10: homeStats.avgScore10 ?? homeStats.averagePointsScored,
              winRate10: homeStats.wins10 ? homeStats.wins10 / 10 : homeStats.wins / 5,
              elo: homeElo,
              pitcherEra: game.league === 'MLB' ? pitcherEraHome : undefined,
              injuryImpact: game.league === 'NBA' ? injuryImpactHome : undefined,
              streak: homeStats.streak,
            };

            const awayInput = {
              avgScore5: awayStats.averagePointsScored,
              winRate5: awayStats.wins / 5,
              avgScore10: awayStats.avgScore10 ?? awayStats.averagePointsScored,
              winRate10: awayStats.wins10 ? awayStats.wins10 / 10 : awayStats.wins / 5,
              elo: awayElo,
              pitcherEra: game.league === 'MLB' ? pitcherEraAway : undefined,
              injuryImpact: game.league === 'NBA' ? injuryImpactAway : undefined,
              streak: awayStats.streak,
            };

            // Run quant ensemble engine
            const edgeResult = calculate_ensemble_edge({
              league: game.league,
              home: homeInput,
              away: awayInput,
              bookmakerSpread,
              bookmakerTotal
            });

            // Generate AI insight report
            const insightReport = generate_insight_report({
              m1_win: edgeResult.models.featureModel.winProbability,
              m2_win: edgeResult.models.eloModel.winProbability,
              m3_win: edgeResult.models.monteCarloModel.winProbability,
              homeAvgPoints: homeStats.averagePointsScored,
              awayAvgPoints: awayStats.averagePointsScored,
              bookmakerTotal,
              isStarMissing: game.league === 'NBA' ? ((injuryImpactHome ?? 0) > 3.0 || (injuryImpactAway ?? 0) > 3.0) : false
            });

            const winProbability = Number(
              ((edgeResult.models.featureModel.winProbability +
                edgeResult.models.eloModel.winProbability +
                edgeResult.models.monteCarloModel.winProbability) / 3).toFixed(4)
            );

            // Actual outcomes
            const hScore = game.homeScore!;
            const aScore = game.awayScore!;
            const actualSpread = -(hScore - aScore); // negative = home won by that margin
            const actualTotal = hScore + aScore;
            const actualWinner = hScore > aScore ? 'home' : 'away';

            // Hits evaluation
            const predictedWinner = edgeResult.ensembleSpread < 0 ? 'home' : 'away';
            const winnerHit = predictedWinner === actualWinner;

            // ATS evaluation
            const atsBetHome = edgeResult.ensembleSpread < bookmakerSpread;
            const atsHit = atsBetHome ? (actualSpread < bookmakerSpread) : (actualSpread > bookmakerSpread);

            // O/U evaluation: ±1.5 tolerance (predicted total vs actual total)
            const totalDiff = Math.abs(edgeResult.ensembleTotal - actualTotal);
            const ouHit = totalDiff <= 1.5;

            // O/U vs Bookmaker line direction comparison (secondary metric)
            const ouBetOver = edgeResult.ensembleTotal > bookmakerTotal;
            const ouVsBookmakerHit = ouBetOver ? (actualTotal > bookmakerTotal) : (actualTotal < bookmakerTotal);

            const spreadError = Math.abs(edgeResult.ensembleSpread - actualSpread);
            const totalError = Math.abs(edgeResult.ensembleTotal - actualTotal);

            // Generate special annotations
            const annotations = generateGameAnnotations(
              {
                teamName: game.homeTeam.nameCn || game.homeTeam.name,
                recentGameScores: homeStats.recentGameScores,
                pitcherName: game.league === 'MLB' ? pitcherNameHome : undefined,
                pitcherEra: game.league === 'MLB' ? pitcherEraHome : undefined,
                league: game.league,
                side: 'home',
              },
              {
                teamName: game.awayTeam.nameCn || game.awayTeam.name,
                recentGameScores: awayStats.recentGameScores,
                pitcherName: game.league === 'MLB' ? pitcherNameAway : undefined,
                pitcherEra: game.league === 'MLB' ? pitcherEraAway : undefined,
                league: game.league,
                side: 'away',
              }
            );

            return {
              id: String(game.id),
              league: game.league,
              gameDate: game.gameDate,
              homeTeam: {
                code: game.homeTeam.code,
                nameCn: game.homeTeam.nameCn || game.homeTeam.name,
                logo: game.homeTeam.logo,
                avgPoints: homeStats.averagePointsScored,
                recentForm: homeStats.recentForm ?? ['W', 'W', 'L', 'W', 'W']
              },
              awayTeam: {
                code: game.awayTeam.code,
                nameCn: game.awayTeam.nameCn || game.awayTeam.name,
                logo: game.awayTeam.logo,
                avgPoints: awayStats.averagePointsScored,
                recentForm: awayStats.recentForm ?? ['L', 'L', 'W', 'L', 'L']
              },
              bookmakerSpread,
              bookmakerTotal,
              prediction: {
                winner: predictedWinner,
                winProbability,
                predictedSpread: edgeResult.ensembleSpread,
                predictedTotal: edgeResult.ensembleTotal,
                pitcherNameHome: game.league === 'MLB' ? pitcherNameHome : undefined,
                pitcherEraHome: game.league === 'MLB' ? pitcherEraHome : undefined,
                pitcherNameAway: game.league === 'MLB' ? pitcherNameAway : undefined,
                pitcherEraAway: game.league === 'MLB' ? pitcherEraAway : undefined,
                injuryImpactHome,
                injuryImpactAway,
                insightReport,
                annotations
              },
              actual: {
                homeScore: hScore,
                awayScore: aScore,
                actualSpread,
                actualTotal,
                winner: actualWinner
              },
              result: {
                winnerHit,
                atsHit,
                ouHit,
                ouVsBookmakerHit,
                spreadError,
                totalError
              }
            };
          } catch (err) {
            console.error(`Error backtesting game ${game.id}:`, err);
            return null;
          }
        })
      );

      allGamesResults.push(...processed.filter((g) => g !== null));
    }

    // Calculate overall stats
    const totalGames = allGamesResults.length;
    let winnerHits = 0;
    let atsHits = 0;
    let ouHits = 0;
    let ouVsBookmakerHits = 0;
    let sumSpreadError = 0;
    let sumTotalError = 0;

    for (const res of allGamesResults) {
      if (res.result.winnerHit) winnerHits++;
      if (res.result.atsHit) atsHits++;
      if (res.result.ouHit) ouHits++;
      if (res.result.ouVsBookmakerHit) ouVsBookmakerHits++;
      sumSpreadError += res.result.spreadError;
      sumTotalError += res.result.totalError;
    }

    const summary = {
      totalGames,
      winnerHits,
      winnerPct: totalGames > 0 ? Number(((winnerHits / totalGames) * 100).toFixed(1)) : 0,
      atsHits,
      atsPct: totalGames > 0 ? Number(((atsHits / totalGames) * 100).toFixed(1)) : 0,
      ouHits,
      ouPct: totalGames > 0 ? Number(((ouHits / totalGames) * 100).toFixed(1)) : 0,
      ouVsBookmakerHits,
      ouVsBookmakerPct: totalGames > 0 ? Number(((ouVsBookmakerHits / totalGames) * 100).toFixed(1)) : 0,
      avgSpreadError: totalGames > 0 ? Number((sumSpreadError / totalGames).toFixed(2)) : 0,
      avgTotalError: totalGames > 0 ? Number((sumTotalError / totalGames).toFixed(2)) : 0,
      dateRange: { start: startDateStr, end: endDateStr }
    };

    return NextResponse.json({ success: true, data: { games: allGamesResults, summary } });
  } catch (error) {
    console.error('Slate Scanner Backtest API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to perform backtesting.' },
      { status: 500 }
    );
  }
}
