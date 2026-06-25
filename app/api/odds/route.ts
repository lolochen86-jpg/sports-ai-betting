import { NextRequest, NextResponse } from 'next/server';
import { fetchOdds, getLastRemainingRequests } from '@/lib/odds/oddsApi';
import type { OddsEvent, Sport } from '@/lib/odds/types';

export const revalidate = 120; // 2 minutes API Route revalidation cache

export interface OddsApiResponse {
  success: boolean;
  data: OddsEvent[];
  remainingRequests: string | null;
  error?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sportParam = searchParams.get('sport')?.toUpperCase();

  if (!sportParam || (sportParam !== 'NBA' && sportParam !== 'MLB')) {
    return NextResponse.json<OddsApiResponse>(
      {
        success: false,
        data: [],
        remainingRequests: null,
        error: 'Missing or invalid sport query parameter. Expected ?sport=NBA or ?sport=MLB.'
      },
      { status: 400 }
    );
  }

  // Map to The Odds API sport keys
  const sportKey: Sport = sportParam === 'NBA' ? 'basketball_nba' : 'baseball_mlb';

  try {
    const oddsData = await fetchOdds(sportKey);
    const remaining = getLastRemainingRequests();

    return NextResponse.json<OddsApiResponse>({
      success: true,
      data: oddsData,
      remainingRequests: remaining
    });
  } catch (error) {
    console.error('Odds API Route encountered an error:', error);
    return NextResponse.json<OddsApiResponse>(
      {
        success: false,
        data: [],
        remainingRequests: null,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
