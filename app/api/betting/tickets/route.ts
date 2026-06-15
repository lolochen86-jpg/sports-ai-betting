import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { checkTaiwanRules } from '@/lib/betting/rule-checker';
import { deductBudget, refundBudget } from '@/lib/betting/budget-manager';
import { BetTicket, BetTicketDraft, DailyBudget, MyBet, StrategySettings, DEFAULT_STRATEGY } from '@/types/betting';

export const dynamic = 'force-dynamic';

// GET: 查詢注單列表
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date'); // YYYY-MM-DD
  const status = searchParams.get('status'); // 'pending' | 'won' | 'lost'

  try {
    const dateStart = dateStr ? new Date(dateStr) : undefined;
    if (dateStart) dateStart.setHours(0, 0, 0, 0);
    const dateEnd = dateStr ? new Date(dateStr) : undefined;
    if (dateEnd) dateEnd.setHours(23, 59, 59, 999);

    const dbTickets = await prisma.betTicket.findMany({
      where: {
        ...(dateStr ? { date: { gte: dateStart, lte: dateEnd } } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        legs: true,
        settlement: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted: BetTicket[] = dbTickets.map((t) => ({
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

    return NextResponse.json({ success: true, data: formatted });
  } catch (error) {
    console.warn('[API tickets GET] DB error, fallback to file:', error);
    const allTickets = dbFallback.readData<BetTicket[]>('tickets', []);
    let filtered = allTickets;

    if (dateStr) {
      filtered = filtered.filter((t) => t.date === dateStr);
    }
    if (status) {
      filtered = filtered.filter((t) => t.status === status);
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ success: true, data: filtered, isFallback: true });
  }
}

// POST: 確認/提交投注
export async function POST(request: NextRequest) {
  try {
    const draft: BetTicketDraft & { fromRecommendationId?: string } = await request.json();
    const today = new Date().toISOString().split('T')[0];

    // 1. 取得今日預算
    let budget: DailyBudget = {
      date: today,
      totalBudget: 200,
      spent: 0,
      remaining: 200,
      maxTickets: 2,
      ticketsUsed: 0,
      stakePerTicket: 100,
    };

    try {
      const dbBudget = await prisma.myDailyBudget.findUnique({ where: { date: new Date(today) } });
      if (dbBudget) {
        budget = {
          date: today,
          totalBudget: dbBudget.totalBudget,
          spent: dbBudget.spent,
          remaining: dbBudget.remaining,
          maxTickets: dbBudget.maxTickets,
          ticketsUsed: dbBudget.ticketsUsed,
          stakePerTicket: dbBudget.stakePerTicket,
        };
      }
    } catch {
      const allBudgets = dbFallback.readData<DailyBudget[]>('budgets', []);
      const match = allBudgets.find((b) => b.date === today);
      if (match) budget = match;
    }

    // 2. 進行規則校驗
    const settings: StrategySettings = dbFallback.readData<StrategySettings>('strategy_settings', DEFAULT_STRATEGY);
    const ruleCheck = checkTaiwanRules(draft, budget, settings);
    if (!ruleCheck.passed) {
      const modeText = '國際盤';
      return NextResponse.json(
        { success: false, error: `未通過${modeText}投注規則檢查`, details: ruleCheck.checks.filter(c => !c.passed) },
        { status: 400 }
      );
    }

    // 3. 扣減預算
    const updatedBudget = deductBudget(budget, draft.stake);

    // 4. 建立注單
    const ticketId = `ticket_${Date.now()}`;
    const newTicket: BetTicket = {
      id: ticketId,
      date: today,
      legs: draft.legs.map((l) => ({ ...l, result: 'pending' })),
      stake: draft.stake,
      parlayOdds: draft.parlayOdds,
      estimatedPayout: draft.estimatedPayout,
      status: 'pending',
      fromRecommendationId: draft.fromRecommendationId || null,
      actualPayout: 0,
      profitLoss: 0,
      createdAt: new Date().toISOString(),
    };

    // 5. 儲存注單與預算 (嘗試 DB，否則 fallback)
    try {
      // 寫入預算
      await prisma.myDailyBudget.upsert({
        where: { date: new Date(today) },
        update: {
          spent: updatedBudget.spent,
          remaining: updatedBudget.remaining,
          ticketsUsed: updatedBudget.ticketsUsed,
        },
        create: {
          date: new Date(today),
          totalBudget: updatedBudget.totalBudget,
          spent: updatedBudget.spent,
          remaining: updatedBudget.remaining,
          maxTickets: updatedBudget.maxTickets,
          ticketsUsed: updatedBudget.ticketsUsed,
          stakePerTicket: updatedBudget.stakePerTicket,
        }
      });

      // 寫入注單
      const created = await prisma.betTicket.create({
        data: {
          date: new Date(today),
          stake: draft.stake,
          parlayOdds: draft.parlayOdds,
          estimatedPayout: draft.estimatedPayout,
          status: 'pending',
          fromRecommendationId: draft.fromRecommendationId ? parseInt(draft.fromRecommendationId.replace('rec_', '')) : null,
          legs: {
            create: draft.legs.map((l) => ({
              gameExternalId: l.gameExternalId,
              league: l.league,
              homeTeam: l.homeTeam,
              awayTeam: l.awayTeam,
              marketType: l.marketType,
              selection: l.selection,
              odds: l.odds,
              line: l.line,
            }))
          }
        }
      });

      newTicket.id = String(created.id);
    } catch (dbError) {
      console.warn('[API tickets POST] DB error, saving to file:', dbError);

      // 儲存預算
      const allBudgets = dbFallback.readData<DailyBudget[]>('budgets', []);
      const bIndex = allBudgets.findIndex((b) => b.date === today);
      if (bIndex > -1) {
        allBudgets[bIndex] = updatedBudget;
      } else {
        allBudgets.push(updatedBudget);
      }
      dbFallback.writeData('budgets', allBudgets);

      // 儲存注單
      const allTickets = dbFallback.readData<BetTicket[]>('tickets', []);
      allTickets.push(newTicket);
      dbFallback.writeData('tickets', allTickets);
    }

    // Determine isFallback based on if the ID was fodd/local or if db failed
    const isFallback = newTicket.id.startsWith('ticket_');
    return NextResponse.json({ success: true, data: newTicket, isFallback });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '下注失敗' },
      { status: 500 }
    );
  }
}

// PATCH: 更新注單結果 (完賽結算)
export async function PATCH(request: NextRequest) {
  try {
    const { ticketId, result, actualPayout } = await request.json(); // result: 'won' | 'lost' | 'void' | 'cancelled'
    
    if (!ticketId || !result) {
      return NextResponse.json({ success: false, error: '缺少參數' }, { status: 400 });
    }

    const payoutNum = parseFloat(actualPayout || 0);

    try {
      const ticket = await prisma.betTicket.findUnique({
        where: { id: parseInt(ticketId) },
        include: { settlement: true }
      });

      if (!ticket) throw new Error('Ticket not found in DB');

      const profitLoss = result === 'won' ? payoutNum - ticket.stake : (result === 'lost' ? -ticket.stake : 0);

      // 更新注單狀態
      const updated = await prisma.betTicket.update({
        where: { id: parseInt(ticketId) },
        data: { status: result }
      });

      // 寫入/更新結算
      await prisma.myBet.upsert({
        where: { ticketId: parseInt(ticketId) },
        update: {
          actualResult: result,
          actualPayout: payoutNum,
          profitLoss: profitLoss,
        },
        create: {
          ticketId: parseInt(ticketId),
          actualResult: result,
          actualPayout: payoutNum,
          profitLoss: profitLoss,
        }
      });

      // 如果是取消或廢單，退還預算
      if (result === 'cancelled' || result === 'void') {
        const todayStr = ticket.date.toISOString().split('T')[0];
        const dbBudget = await prisma.myDailyBudget.findUnique({ where: { date: new Date(todayStr) } });
        if (dbBudget) {
          const budget: DailyBudget = {
            date: todayStr,
            totalBudget: dbBudget.totalBudget,
            spent: dbBudget.spent,
            remaining: dbBudget.remaining,
            maxTickets: dbBudget.maxTickets,
            ticketsUsed: dbBudget.ticketsUsed,
            stakePerTicket: dbBudget.stakePerTicket,
          };
          const refunded = refundBudget(budget, ticket.stake);
          await prisma.myDailyBudget.update({
            where: { date: new Date(todayStr) },
            data: {
              spent: refunded.spent,
              remaining: refunded.remaining,
              ticketsUsed: refunded.ticketsUsed,
            }
          });
        }
      }

      return NextResponse.json({ success: true, message: '結算完成' });
    } catch (dbError) {
      console.warn('[API tickets PATCH] DB error, settling in file storage:', dbError);

      const allTickets = dbFallback.readData<BetTicket[]>('tickets', []);
      const ticketIndex = allTickets.findIndex((t) => t.id === ticketId);

      if (ticketIndex === -1) {
        return NextResponse.json({ success: false, error: '找不到注單' }, { status: 404 });
      }

      const ticket = allTickets[ticketIndex];
      ticket.status = result;
      ticket.actualPayout = payoutNum;
      ticket.profitLoss = result === 'won' ? payoutNum - ticket.stake : (result === 'lost' ? -ticket.stake : 0);

      // 如果是取消或廢單，退還預算
      if (result === 'cancelled' || result === 'void') {
        const allBudgets = dbFallback.readData<DailyBudget[]>('budgets', []);
        const bIndex = allBudgets.findIndex((b) => b.date === ticket.date);
        if (bIndex > -1) {
          allBudgets[bIndex] = refundBudget(allBudgets[bIndex], ticket.stake);
          dbFallback.writeData('budgets', allBudgets);
        }
      }

      dbFallback.writeData('tickets', allTickets);
      return NextResponse.json({ success: true, data: ticket });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '更新注單失敗' },
      { status: 500 }
    );
  }
}
