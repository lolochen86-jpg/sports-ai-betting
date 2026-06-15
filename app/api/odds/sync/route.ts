/**
 * POST/GET /api/odds/sync
 * 觸發從 The Odds API 抓取最新數據並更新快取
 */

import { NextResponse } from 'next/server';
import { fetchMLBOdds, fetchNBAOdds, hasOddsApiKey } from '@/lib/odds/theOddsApiClient';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get('league')?.toUpperCase() as 'MLB' | 'NBA' | null;
  const force = searchParams.get('force') === 'true';

  if (!hasOddsApiKey()) {
    return NextResponse.json(
      {
        success: false,
        reason: 'no_key',
        message: '尚未設定 ODDS_API_KEY，無法同步國際盤',
      },
      { status: 200 }
    );
  }

  try {
    const results: Record<string, unknown> = {};

    if (!league || league === 'MLB') {
      const mlb = await fetchMLBOdds(force);
      results.mlb = mlb
        ? {
            eventCount: mlb.events.length,
            remainingRequests: mlb.remainingRequests,
            usedRequests: mlb.usedRequests,
            cachedAt: new Date(mlb.cachedAt).toISOString(),
          }
        : { error: '抓取失敗' };
    }

    if (!league || league === 'NBA') {
      const nba = await fetchNBAOdds(force);
      results.nba = nba
        ? {
            eventCount: nba.events.length,
            remainingRequests: nba.remainingRequests,
            usedRequests: nba.usedRequests,
            cachedAt: new Date(nba.cachedAt).toISOString(),
          }
        : { error: '抓取失敗' };
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error('[/api/odds/sync] Error:', err);
    return NextResponse.json(
      { success: false, message: '同步失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
