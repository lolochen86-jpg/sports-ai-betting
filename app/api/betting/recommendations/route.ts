import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { generateDailyRecommendations } from '@/lib/betting/recommender';
import { EdgeSignal, DailyBudget, StrategySettings, BetRecommendation, DEFAULT_STRATEGY } from '@/types/betting';

export const dynamic = 'force-dynamic';

// GET: 查詢今日推薦注單
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date'); // YYYY-MM-DD

  if (!dateStr) {
    return NextResponse.json({ success: false, error: '缺少 date 參數' }, { status: 400 });
  }

  try {
    const dateStart = new Date(dateStr);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStr);
    dateEnd.setHours(23, 59, 59, 999);

    const dbRecs = await prisma.betRecommendation.findMany({
      where: {
        date: {
          gte: dateStart,
          lte: dateEnd,
        }
      },
      include: {
        legs: true
      }
    });

    if (dbRecs.length > 0) {
      const formatted: BetRecommendation[] = dbRecs.map((r) => ({
        id: String(r.id),
        date: r.date.toISOString().split('T')[0],
        legs: r.legs.map((l) => ({
          gameExternalId: l.gameExternalId,
          league: l.league as any,
          homeTeam: l.homeTeam,
          awayTeam: l.awayTeam,
          gameDate: '', // 簡化
          marketType: l.marketType as any,
          selection: l.selection,
          odds: l.odds,
        })),
        edges: [], // DB 不載入關聯 edges
        totalStake: r.totalStake,
        parlayLegs: r.parlayLegs,
        parlayOdds: r.parlayOdds,
        estimatedPayout: r.estimatedPayout,
        ruleCheckPassed: true,
        ruleCheckDetails: r.ruleCheckJson ? JSON.parse(r.ruleCheckJson) : { passed: true, checks: [] },
        status: r.status as any,
        createdAt: r.createdAt.toISOString(),
      }));

      return NextResponse.json({ success: true, data: formatted });
    }

    throw new Error('No DB recommendations, fallback to file');
  } catch (error) {
    const allRecs = dbFallback.readData<BetRecommendation[]>('recommendations', []);
    const filtered = allRecs.filter((r) => r.date === dateStr);
    return NextResponse.json({ success: true, data: filtered, isFallback: true });
  }
}

// POST: 產生今日推薦注單
export async function POST(request: NextRequest) {
  try {
    const { date, edges: passedEdges } = await request.json(); // YYYY-MM-DD, optional client-passed edges
    if (!date) {
      return NextResponse.json({ success: false, error: '缺少 date 參數' }, { status: 400 });
    }

    let isFallback = passedEdges ? true : false;

    // 1. 取得今日 Edge Signals
    let edges: EdgeSignal[] = passedEdges || [];
    if (edges.length === 0) {
      try {
        const res = await fetch(`${request.nextUrl.origin}/api/betting/edge?date=${date}`);
        const json = await res.json();
        if (json.success) {
          edges = json.data;
          if (json.isFallback) isFallback = true;
        }
      } catch {
        isFallback = true;
        const allEdges = dbFallback.readData<EdgeSignal[]>('edge_signals', []);
        edges = allEdges.filter((e) => e.odds.gameDate.split('T')[0] === date);
      }
    }

    // 2. 取得今日預算狀態
    let budget: DailyBudget = {
      date,
      totalBudget: 200,
      spent: 0,
      remaining: 200,
      maxTickets: 2,
      ticketsUsed: 0,
      stakePerTicket: 100,
    };
    try {
      const res = await fetch(`${request.nextUrl.origin}/api/betting/budget?date=${date}`);
      const json = await res.json();
      if (json.success && json.data) {
        budget = json.data;
        if (json.isFallback) isFallback = true;
      }
    } catch {
      isFallback = true;
      const allBudgets = dbFallback.readData<DailyBudget[]>('budgets', []);
      const match = allBudgets.find((b) => b.date === date);
      if (match) budget = match;
    }

    // 3. 取得策略設定 (可讀自 settings)
    const settings: StrategySettings = dbFallback.readData<StrategySettings>('strategy_settings', DEFAULT_STRATEGY);

    // 4. 執行推薦引擎
    const recommendations = generateDailyRecommendations(date, edges, budget, settings);

    // 5. 儲存推薦 (試圖寫入 DB，否則檔案備用)
    try {
      // 刪除今日舊的推薦
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);

      await prisma.betRecommendation.deleteMany({
        where: { date: { gte: dateStart, lte: dateEnd } }
      });

      for (const rec of recommendations) {
        const created = await prisma.betRecommendation.create({
          data: {
            date: new Date(rec.date),
            status: rec.status,
            totalStake: rec.totalStake,
            parlayLegs: rec.parlayLegs,
            parlayOdds: rec.parlayOdds,
            estimatedPayout: rec.estimatedPayout,
            ruleCheckJson: JSON.stringify(rec.ruleCheckDetails),
          }
        });

        // 插入推薦 Legs
        for (const leg of rec.legs) {
          // 找對應的 edgeSignal id
          const matchingEdge = rec.edges.find((e) => e.odds.gameExternalId === leg.gameExternalId);
          // 這裡簡化寫入，因為 DB 外鍵依賴 EdgeSignal
          // 若無 edgeSignalId 則寫入預設 1 (在此若拋出錯誤會走 catch)
          if (matchingEdge) {
            const dbEdge = await prisma.edgeSignal.findFirst({
              where: {
                odds: { gameExternalId: leg.gameExternalId }
              }
            });

            if (dbEdge) {
              await prisma.betRecommendationLeg.create({
                data: {
                  recommendationId: created.id,
                  edgeSignalId: dbEdge.id,
                  gameExternalId: leg.gameExternalId,
                  league: leg.league,
                  homeTeam: leg.homeTeam,
                  awayTeam: leg.awayTeam,
                  marketType: leg.marketType,
                  selection: leg.selection,
                  odds: leg.odds,
                }
              });
            }
          }
        }
      }
    } catch (dbError) {
      console.warn('[API recommendations POST] DB error, saving to file storage:', dbError);
      isFallback = true;
      
      const allRecs = dbFallback.readData<BetRecommendation[]>('recommendations', []);
      const filtered = allRecs.filter((r) => r.date !== date);
      filtered.push(...recommendations);
      dbFallback.writeData('recommendations', filtered);
    }

    return NextResponse.json({ success: true, data: recommendations, isFallback });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '產生推薦失敗' },
      { status: 500 }
    );
  }
}
