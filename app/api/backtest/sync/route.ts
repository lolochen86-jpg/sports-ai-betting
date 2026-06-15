import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';

export const dynamic = 'force-dynamic';

/**
 * GET /api/backtest/sync?after=2026-06-02
 *
 * 從 MLB Stats API 和 ESPN NBA API 抓取指定日期之後所有已完賽的比賽數據，
 * 返回與 real_historical_games.json 相同格式的資料，用於動態更新回測走勢。
 *
 * Query params:
 *   after  - 起始日期 (不含), 格式 YYYY-MM-DD，預設為 JSON 檔案中的最後日期
 *   before - 結束日期 (含), 格式 YYYY-MM-DD，預設為昨天
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const afterDate = searchParams.get('after') || '2026-06-02';
  
  // 結束日期預設為今天 (API 內部會過濾僅保留已完賽的)
  const now = new Date();
  // 使用 UTC+8 計算當前日期
  const todayLocal = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const defaultBefore = todayLocal.toISOString().split('T')[0];
  const beforeDate = searchParams.get('before') || defaultBefore;

  try {
    // 產生需要抓取的日期列表
    const dates: string[] = [];
    const startDate = new Date(afterDate);
    startDate.setDate(startDate.getDate() + 1); // 不含 after 那天
    const endDate = new Date(beforeDate);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    if (dates.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: { afterDate, beforeDate, datesChecked: 0, gamesFound: 0 },
      });
    }

    // 限制一次最多抓 31 天，避免單次請求過大，但便於以月為單位進行歷史同步
    const datesToFetch = dates.slice(0, 31);

    interface HistoricalGame {
      id: string;
      league: 'NBA' | 'MLB';
      date: string;
      homeCode: string;
      homeName: string;
      awayCode: string;
      awayName: string;
      homeScore: number;
      awayScore: number;
    }

    const allGames: HistoricalGame[] = [];

    // 計算 3 天前的日期字串，用於判斷是否能啟用快取
    const threeDaysAgo = new Date(todayLocal);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

    // 逐日抓取 MLB 和 NBA 的完賽數據
    for (const dateStr of datesToFetch) {
      try {
        const isRecent = dateStr >= threeDaysAgoStr;
        const [mlbGames, nbaGames] = await Promise.all([
          fetchMLBGames(dateStr, isRecent).catch(() => []),
          fetchNBAGames(dateStr, isRecent).catch(() => []),
        ]);

        // 只保留已完賽且有比分的比賽
        for (const g of mlbGames) {
          if (g.status === 'completed' && g.homeScore != null && g.awayScore != null) {
            allGames.push({
              id: `mlb_${g.id}`,
              league: 'MLB',
              date: dateStr,
              homeCode: g.homeTeam.code,
              homeName: g.homeTeam.name,
              awayCode: g.awayTeam.code,
              awayName: g.awayTeam.name,
              homeScore: g.homeScore,
              awayScore: g.awayScore,
            });
          }
        }

        for (const g of nbaGames) {
          if (g.status === 'completed' && g.homeScore != null && g.awayScore != null) {
            allGames.push({
              id: `nba_${g.id}`,
              league: 'NBA',
              date: dateStr,
              homeCode: g.homeTeam.code,
              homeName: g.homeTeam.name,
              awayCode: g.awayTeam.code,
              awayName: g.awayTeam.name,
              homeScore: g.homeScore,
              awayScore: g.awayScore,
            });
          }
        }
      } catch (err) {
        // 單日抓取失敗不影響其他日期
        console.error(`Backtest sync: failed to fetch games for ${dateStr}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      data: allGames,
      meta: {
        afterDate,
        beforeDate,
        datesChecked: datesToFetch.length,
        gamesFound: allGames.length,
        remainingDates: dates.length - datesToFetch.length,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      }
    });
  } catch (error) {
    console.error('Backtest sync API error:', error);
    return NextResponse.json(
      { success: false, data: [], error: String(error) },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        }
      }
    );
  }
}
