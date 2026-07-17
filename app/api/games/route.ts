import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { extractRecentStats } from '@/lib/prediction/features';
import type { GameWithTeams, ApiResponse } from '@/types/sports';

export const dynamic = 'force-dynamic';


const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsJson(data: any, init?: ResponseInit) {
  const mergedHeaders = new Headers(init?.headers);
  Object.entries(CORS_HEADERS).forEach(([key, val]) => {
    mergedHeaders.set(key, val);
  });
  return NextResponse.json(data, {
    ...init,
    headers: mergedHeaders,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase();
  const date = searchParams.get('date') ?? undefined; // YYYY-MM-DD
  const refresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';

  try {
    let games: GameWithTeams[] = [];

    if (league === 'MLB') {
      games = await fetchMLBGames(date, refresh);
    } else if (league === 'NBA') {
      games = await fetchNBAGames(date, refresh);
    } else {
      // Fetch both leagues in parallel
      const [mlb, nba] = await Promise.all([
        fetchMLBGames(date, refresh),
        fetchNBAGames(date, refresh),
      ]);
      games = [...nba, ...mlb]; // NBA first since it's the default active tab
    }

    // Fetch recent stats for all teams in parallel to display average points on the scoreboard
    const gamesWithStats = await Promise.all(
      games.map(async (game) => {
        try {
          const [homeStats, awayStats] = await Promise.all([
            extractRecentStats(game.homeTeam.id, game.league, game.id, game.gameDate),
            extractRecentStats(game.awayTeam.id, game.league, game.id, game.gameDate),
          ]);
          return {
            ...game,
            homeTeam: {
              ...game.homeTeam,
              avgPoints: homeStats.averagePointsScored,
            },
            awayTeam: {
              ...game.awayTeam,
              avgPoints: awayStats.averagePointsScored,
            },
          };
        } catch (err) {
          console.error(`Failed to fetch recent stats for game ${game.id}:`, err);
          return game;
        }
      })
    );

    const response: ApiResponse<GameWithTeams[]> = {
      success: true,
      data: gamesWithStats,
      meta: {
        league: (league as 'MLB' | 'NBA') ?? 'ALL',
        date: date ?? new Date().toISOString().split('T')[0],
        count: gamesWithStats.length,
        cached: true,
      },
    };

    return corsJson(response);
  } catch (error) {
    console.error('Games API error:', error);
    return corsJson(
      { success: false, data: [], meta: { count: 0, cached: false }, error: String(error) },
      { status: 500 }
    );
  }
}
