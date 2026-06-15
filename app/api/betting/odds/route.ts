import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { TaiwanOdds } from '@/types/betting';

export const dynamic = 'force-dynamic';

// GET: 查詢今日已匯入賠率
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date'); // format: 'YYYY-MM-DD'
  const league = searchParams.get('league'); // 'NBA' | 'MLB'

  if (!dateStr) {
    return NextResponse.json(
      { success: false, error: '缺少 date 參數' },
      { status: 400 }
    );
  }

  const dateStart = new Date(dateStr);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(dateStr);
  dateEnd.setHours(23, 59, 59, 999);

  try {
    // 優先使用 PostgreSQL 資料庫
    const dbOdds = await prisma.oddsTaiwan.findMany({
      where: {
        gameDate: {
          gte: dateStart,
          lte: dateEnd,
        },
        ...(league ? { league } : {}),
      },
    });

    // 映射為前端所需的結構
    const formattedOdds: TaiwanOdds[] = dbOdds.map((o) => ({
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

    return NextResponse.json({ success: true, data: formattedOdds });
  } catch (dbError) {
    console.warn('[API odds GET] DB Error, falling back to file storage:', dbError);

    // 降級使用檔案儲存
    const allOdds = dbFallback.readData<TaiwanOdds[]>('taiwan_odds', []);
    let filteredOdds = allOdds.filter((o) => {
      const gDate = o.gameDate.split('T')[0];
      return gDate === dateStr;
    });

    if (league) {
      filteredOdds = filteredOdds.filter((o) => o.league === league);
    }

    return NextResponse.json({ success: true, data: filteredOdds, isFallback: true });
  }
}

// POST: 手動輸入/CSV 批量匯入賠率
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const oddsInput = Array.isArray(body) ? body : [body];

    const results: TaiwanOdds[] = [];

    for (const input of oddsInput) {
      const {
        gameExternalId,
        league,
        gameDate,
        homeTeam,
        awayTeam,
        marketType,
        selection,
        taiwanOdds,
        line,
        source = 'manual',
      } = input;

      if (!gameExternalId || !league || !gameDate || !homeTeam || !awayTeam || !marketType || !selection || !taiwanOdds) {
        continue;
      }

      const parsedOdds = parseFloat(taiwanOdds);
      const impliedProbability = parsedOdds > 0 ? 1 / parsedOdds : 0;
      const parsedLine = line !== undefined && line !== null ? parseFloat(line) : null;

      try {
        // 嘗試寫入 PostgreSQL 資料庫 (upsert 依據聯合唯一索引)
        const updated = await prisma.oddsTaiwan.upsert({
          where: {
            gameExternalId_marketType_selection: {
              gameExternalId,
              marketType,
              selection,
            },
          },
          update: {
            gameDate: new Date(gameDate),
            homeTeam,
            awayTeam,
            taiwanOdds: parsedOdds,
            line: parsedLine,
            impliedProbability,
            source,
          },
          create: {
            gameExternalId,
            league,
            gameDate: new Date(gameDate),
            homeTeam,
            awayTeam,
            marketType,
            selection,
            taiwanOdds: parsedOdds,
            line: parsedLine,
            impliedProbability,
            source,
          },
        });

        results.push({
          id: String(updated.id),
          gameExternalId: updated.gameExternalId,
          league: updated.league as any,
          gameDate: updated.gameDate.toISOString(),
          homeTeam: updated.homeTeam,
          awayTeam: updated.awayTeam,
          marketType: updated.marketType as any,
          selection: updated.selection,
          taiwanOdds: updated.taiwanOdds,
          line: updated.line,
          impliedProbability: updated.impliedProbability,
          source: updated.source as any,
          importedAt: updated.createdAt.toISOString(),
        });
      } catch (dbError) {
        console.warn('[API odds POST] DB Upsert Error, saving to file fallback:', dbError);
        
        // 降級使用檔案儲存
        const allOdds = dbFallback.readData<TaiwanOdds[]>('taiwan_odds', []);
        
        // 移除已有的重複項目
        const filtered = allOdds.filter(
          (o) =>
            !(
              o.gameExternalId === gameExternalId &&
              o.marketType === marketType &&
              o.selection === selection
            )
        );

        const newOdd: TaiwanOdds = {
          id: `fodd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          gameExternalId,
          league,
          gameDate,
          homeTeam,
          awayTeam,
          marketType,
          selection,
          taiwanOdds: parsedOdds,
          line: parsedLine,
          impliedProbability,
          source: source as any,
          importedAt: new Date().toISOString(),
        };

        filtered.push(newOdd);
        dbFallback.writeData('taiwan_odds', filtered);
        results.push(newOdd);
      }
    }

    // Determine isFallback by checking if any item went to file storage
    const isFallback = results.some(r => r.id.startsWith('fodd_'));
    return NextResponse.json({ success: true, data: results, isFallback });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '寫入賠率失敗' },
      { status: 500 }
    );
  }
}
