import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBRoster } from '@/lib/sports-api/mlb';
import { fetchNBARoster } from '@/lib/sports-api/nba';
import type { PlayerInfo, ApiResponse } from '@/types/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase();
  const teamId = searchParams.get('teamId');

  if (!league || !teamId) {
    return NextResponse.json(
      {
        success: false,
        data: [],
        meta: { count: 0, cached: false },
        error: 'Both "league" (MLB or NBA) and "teamId" query parameters are required.',
      },
      { status: 400 }
    );
  }

  try {
    let players: PlayerInfo[] = [];

    if (league === 'MLB') {
      players = await fetchMLBRoster(teamId);
    } else if (league === 'NBA') {
      players = await fetchNBARoster(teamId);
    } else {
      return NextResponse.json(
        { success: false, data: [], meta: { count: 0, cached: false }, error: 'Invalid league. Use MLB or NBA.' },
        { status: 400 }
      );
    }

    const response: ApiResponse<PlayerInfo[]> = {
      success: true,
      data: players,
      meta: {
        league: league as 'MLB' | 'NBA',
        count: players.length,
        cached: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Players API error:', error);
    return NextResponse.json(
      { success: false, data: [], meta: { count: 0, cached: false }, error: String(error) },
      { status: 500 }
    );
  }
}
