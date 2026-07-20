import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBPlayerStats } from '@/lib/sports-api/mlb';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mlb/player-stats?playerId=660271&season=2026
 * Returns individual player season stats from MLB Stats API.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const season = searchParams.get('season');

  if (!playerId) {
    return NextResponse.json(
      { success: false, error: 'playerId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const stats = await fetchMLBPlayerStats(
      playerId,
      season ? parseInt(season, 10) : undefined
    );

    if (!stats) {
      return NextResponse.json(
        { success: false, error: 'Player not found or no stats available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[MLB Player Stats API] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
