import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { extractRecentStats, fetchStartingPitcher } from '@/lib/prediction/features';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { calculate_ensemble_edge, generate_insight_report } from '@/lib/prediction/ensemble-edge';
import { TaiwanOdds } from '@/types/betting';
import { GameWithTeams } from '@/types/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    // 1. Fetch games from both leagues
    const [mlbGames, nbaGames] = await Promise.all([
      fetchMLBGames(dateStr),
      fetchNBAGames(dateStr)
    ]);
    const games: GameWithTeams[] = [...nbaGames, ...mlbGames];

    if (games.length === 0) {
      return NextResponse.json({ success: true, data: [] });
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
      console.warn('[slate-scanner API] Database odds fetch failed, trying fallback:', dbError);
      const allOdds = dbFallback.readData<TaiwanOdds[]>('taiwan_odds', []);
      oddsList = allOdds.filter((o) => o.gameDate.split('T')[0] === dateStr);
    }

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

    // 3. Process each game in parallel to compile features, calculate ensemble, and generate insight reports
    const processedGames = await Promise.all(
      games.map(async (game) => {
        try {
          const homeId = game.homeTeam.id;
          const awayId = game.awayTeam.id;

          // Fetch recent stats for home and away in parallel
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

          // Find bookmaker odds for this game
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
            // Fallback: estimate from historical stats diff
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

          // Injury impact score (numerical mock fallback for NBA if not present)
          const hash = Array.from(String(game.id)).reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const injuryImpactHome = game.league === 'NBA' ? ((hash % 10) > 7 ? Number(((hash % 4) + 1.2).toFixed(1)) : 0.0) : undefined;
          const injuryImpactAway = game.league === 'NBA' ? (((hash + 3) % 10) > 8 ? Number((((hash + 3) % 3) + 1.0).toFixed(1)) : 0.0) : undefined;

          // Assemble input
          const homeInput = {
            avgScore5: homeStats.averagePointsScored,
            winRate5: homeStats.wins / 5,
            avgScore10: homeStats.avgScore10 ?? homeStats.averagePointsScored,
            winRate10: homeStats.wins10 ? homeStats.wins10 / 10 : homeStats.wins / 5,
            elo: homeElo,
            pitcherEra: game.league === 'MLB' ? pitcherEraHome : undefined,
            injuryImpact: game.league === 'NBA' ? injuryImpactHome : undefined,
          };

          const awayInput = {
            avgScore5: awayStats.averagePointsScored,
            winRate5: awayStats.wins / 5,
            avgScore10: awayStats.avgScore10 ?? awayStats.averagePointsScored,
            winRate10: awayStats.wins10 ? awayStats.wins10 / 10 : awayStats.wins / 5,
            elo: awayElo,
            pitcherEra: game.league === 'MLB' ? pitcherEraAway : undefined,
            injuryImpact: game.league === 'NBA' ? injuryImpactAway : undefined,
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
              winner: edgeResult.ensembleSpread < 0 ? 'home' : 'away',
              winProbability,
              predictedSpread: edgeResult.ensembleSpread,
              predictedTotal: edgeResult.ensembleTotal,
              pitcherNameHome: game.league === 'MLB' ? pitcherNameHome : undefined,
              pitcherEraHome: game.league === 'MLB' ? pitcherEraHome : undefined,
              pitcherNameAway: game.league === 'MLB' ? pitcherNameAway : undefined,
              pitcherEraAway: game.league === 'MLB' ? pitcherEraAway : undefined,
              injuryImpactHome,
              injuryImpactAway,
              insightReport
            }
          };
        } catch (gameErr) {
          console.error(`Error processing game ${game.id}:`, gameErr);
          return null;
        }
      })
    );

    // Filter out failed games
    const data = processedGames.filter((g) => g !== null);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Slate Scanner Games API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to retrieve scanner games.' },
      { status: 500 }
    );
  }
}
