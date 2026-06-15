import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBTeams } from '@/lib/sports-api/mlb';
import { fetchNBATeams } from '@/lib/sports-api/nba';
import type { TeamInfo, ApiResponse } from '@/types/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase();

  try {
    let teams: TeamInfo[] = [];

    if (league === 'MLB') {
      teams = await fetchMLBTeams();
    } else if (league === 'NBA') {
      teams = await fetchNBATeams();
    } else {
      // Fetch both
      const [mlb, nba] = await Promise.all([fetchMLBTeams(), fetchNBATeams()]);
      teams = [...mlb, ...nba];
    }

    const response: ApiResponse<TeamInfo[]> = {
      success: true,
      data: teams,
      meta: {
        league: (league as 'MLB' | 'NBA') ?? 'ALL',
        count: teams.length,
        cached: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Teams API error:', error);
    return NextResponse.json(
      { success: false, data: [], meta: { count: 0, cached: false }, error: String(error) },
      { status: 500 }
    );
  }
}
