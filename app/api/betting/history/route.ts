import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { BetTicket, ProfitLossSummary } from '@/types/betting';

export const dynamic = 'force-dynamic';

// GET: 查詢下注歷史與損益總覽
export async function GET(request: NextRequest) {
  try {
    let tickets: BetTicket[] = [];
    let isFallback = false;

    // 1. 嘗試查詢 DB
    try {
      const dbTickets = await prisma.betTicket.findMany({
        include: {
          legs: true,
          settlement: true,
        },
        orderBy: { date: 'desc' },
      });

      tickets = dbTickets.map((t) => ({
        id: String(t.id),
        date: t.date.toISOString().split('T')[0],
        legs: t.legs.map((l) => ({
          id: String(l.id),
          gameExternalId: l.gameExternalId,
          league: l.league as any,
          homeTeam: l.homeTeam,
          awayTeam: l.awayTeam,
          gameDate: '',
          marketType: l.marketType as any,
          selection: l.selection,
          odds: l.odds,
          line: l.line,
          result: l.result as any,
        })),
        stake: t.stake,
        parlayOdds: t.parlayOdds,
        estimatedPayout: t.estimatedPayout,
        status: t.status as any,
        fromRecommendationId: t.fromRecommendationId ? String(t.fromRecommendationId) : null,
        actualPayout: t.settlement?.actualPayout || 0,
        profitLoss: t.settlement?.profitLoss || 0,
        notes: t.notes || undefined,
        createdAt: t.createdAt.toISOString(),
      }));
    } catch {
      isFallback = true;
      tickets = dbFallback.readData<BetTicket[]>('tickets', []);
      tickets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // 2. 計算損益總覽指標
    let totalInvested = 0;
    let totalReturned = 0;
    let wins = 0;
    let losses = 0;
    let pending = 0;

    for (const t of tickets) {
      if (t.status === 'won') {
        totalInvested += t.stake;
        totalReturned += t.actualPayout;
        wins++;
      } else if (t.status === 'lost') {
        totalInvested += t.stake;
        losses++;
      } else if (t.status === 'pending') {
        pending++;
      }
      // void / cancelled 不算入投注與損益
    }

    const netProfitLoss = totalReturned - totalInvested;
    const roi = totalInvested > 0 ? (netProfitLoss / totalInvested) * 100 : 0;
    const totalBets = wins + losses + pending;
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

    const summary: ProfitLossSummary = {
      totalInvested,
      totalReturned,
      netProfitLoss,
      roi: parseFloat(roi.toFixed(2)),
      totalBets,
      wins,
      losses,
      pending,
      winRate: parseFloat(winRate.toFixed(2)),
    };

    return NextResponse.json({
      success: true,
      data: {
        summary,
        tickets,
      },
      isFallback,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '查詢損益失敗' },
      { status: 500 }
    );
  }
}
