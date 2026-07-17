import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { generatePrediction } from '@/lib/prediction/engine';
import { apiCache } from '@/lib/sports-api/cache';

export const dynamic = 'force-dynamic';

const CACHE_TTL_PREDICTION_ROUTE = 60 * 60; // Cache prediction results for 1 hour


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

export async function POST(request: NextRequest) {
  try {
    const { gameId, league, date } = await request.json();

    if (!gameId || !league) {
      return corsJson(
        { success: false, error: '缺少必要參數 (gameId 或 league)' },
        { status: 400 }
      );
    }

    const leagueUpper = league.toUpperCase() as 'MLB' | 'NBA';
    if (leagueUpper !== 'MLB' && leagueUpper !== 'NBA') {
      return corsJson(
        { success: false, error: '無效的聯盟名稱' },
        { status: 400 }
      );
    }

    // Check Cache first to protect API rates and assure speed
    const cacheKey = `prediction_result:${leagueUpper.toLowerCase()}:${gameId}`;
    const cachedPrediction = apiCache.get(cacheKey);
    if (cachedPrediction) {
      return corsJson({
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
      return corsJson(
        { success: false, error: '找不到指定賽事，AI 預測引擎目前僅支持解鎖本日賽事' },
        { status: 404 }
      );
    }

    // Run AI prediction calculations
    const prediction = await generatePrediction(game, leagueUpper);

    // Save prediction in TTL Cache
    apiCache.set(cacheKey, prediction, CACHE_TTL_PREDICTION_ROUTE);

    return corsJson({
      success: true,
      data: prediction,
      meta: { cached: false }
    });
  } catch (error) {
    console.error('Predictions API error:', error);
    return corsJson(
      { success: false, error: error instanceof Error ? error.message : '生成預測報告失敗，請重試' },
      { status: 500 }
    );
  }
}

// GET: 批次獲取指定日期的預測資料
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date'); // YYYY-MM-DD
  const league = searchParams.get('league')?.toUpperCase() || 'ALL';

  if (!dateStr) {
    return corsJson({ success: false, error: '缺少 date 參數' }, { status: 400 });
  }

  try {
    const formattedDate = dateStr.split('T')[0];
    let games: any[] = [];

    if (league === 'MLB') {
      games = await fetchMLBGames(formattedDate);
    } else if (league === 'NBA') {
      games = await fetchNBAGames(formattedDate);
    } else {
      const [mlb, nba] = await Promise.all([
        fetchMLBGames(formattedDate),
        fetchNBAGames(formattedDate),
      ]);
      games = [...nba, ...mlb];
    }

    const predictionsList = await Promise.all(
      games.map(async (game) => {
        try {
          const cacheKey = `prediction_result:${game.league.toLowerCase()}:${game.id}`;
          let prediction = apiCache.get(cacheKey);

          if (!prediction) {
            prediction = await generatePrediction(game, game.league);
            apiCache.set(cacheKey, prediction, CACHE_TTL_PREDICTION_ROUTE);
          }

          return {
            gameId: String(game.id),
            prediction,
          };
        } catch (err) {
          console.error(`Failed to generate prediction for game ${game.id}:`, err);
          return {
            gameId: String(game.id),
            error: String(err),
          };
        }
      })
    );

    return corsJson({
      success: true,
      data: predictionsList,
    });
  } catch (error) {
    console.error('Predictions GET API error:', error);
    return corsJson(
      { success: false, error: error instanceof Error ? error.message : '取得預測資料失敗' },
      { status: 500 }
    );
  }
}
