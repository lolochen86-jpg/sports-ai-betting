import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { generatePrediction } from '@/lib/prediction/engine';
import { apiCache } from '@/lib/sports-api/cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL_PREDICTION_ROUTE = 60 * 60; // Cache prediction results for 1 hour

export async function POST(request: NextRequest) {
  try {
    const { gameId, league, date } = await request.json();

    if (!gameId || !league) {
      return NextResponse.json(
        { success: false, error: '缺少必要參數 (gameId 或 league)' },
        { status: 400 }
      );
    }

    const leagueUpper = league.toUpperCase() as 'MLB' | 'NBA';
    if (leagueUpper !== 'MLB' && leagueUpper !== 'NBA') {
      return NextResponse.json(
        { success: false, error: '無效的聯盟名稱' },
        { status: 400 }
      );
    }

    // Check Cache first to protect API rates and assure speed
    const cacheKey = `prediction_result:${leagueUpper.toLowerCase()}:${gameId}`;
    const cachedPrediction = apiCache.get(cacheKey);
    if (cachedPrediction) {
      return NextResponse.json({
        success: true,
        data: cachedPrediction,
        meta: { cached: true }
      });
    }

    // Fetch games for the specified date (fallback to today)
    const formattedDate = date ? String(date).split('T')[0] : undefined;
    let games = [];

    if (leagueUpper === 'MLB') {
      games = await fetchMLBGames(formattedDate);
    } else {
      games = await fetchNBAGames(formattedDate);
    }

    const game = games.find(g => String(g.id) === String(gameId));
    if (!game) {
      return NextResponse.json(
        { success: false, error: '找不到指定賽事，AI 預測引擎目前僅支持解鎖本日賽事' },
        { status: 404 }
      );
    }

    // Run AI prediction calculations
    const prediction = await generatePrediction(game, leagueUpper);

    // Save prediction in TTL Cache
    apiCache.set(cacheKey, prediction, CACHE_TTL_PREDICTION_ROUTE);

    return NextResponse.json({
      success: true,
      data: prediction,
      meta: { cached: false }
    });
  } catch (error) {
    console.error('Predictions API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '生成預測報告失敗，請重試' },
      { status: 500 }
    );
  }
}
