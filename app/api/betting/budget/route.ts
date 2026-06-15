import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { dbFallback } from '@/lib/betting/db-fallback';
import { createDailyBudget } from '@/lib/betting/budget-manager';
import { DailyBudget, StrategySettings, DEFAULT_STRATEGY } from '@/types/betting';

export const dynamic = 'force-dynamic';

// GET: 查詢每日預算狀態
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date'); // YYYY-MM-DD

  if (!dateStr) {
    return NextResponse.json({ success: false, error: '缺少 date 參數' }, { status: 400 });
  }

  const settings: StrategySettings = dbFallback.readData<StrategySettings>('strategy_settings', DEFAULT_STRATEGY);

  try {
    const dbBudget = await prisma.myDailyBudget.findUnique({
      where: { date: new Date(dateStr) }
    });

    if (dbBudget) {
      const budget: DailyBudget = {
        date: dateStr,
        totalBudget: dbBudget.totalBudget,
        spent: dbBudget.spent,
        remaining: dbBudget.remaining,
        maxTickets: dbBudget.maxTickets,
        ticketsUsed: dbBudget.ticketsUsed,
        stakePerTicket: dbBudget.stakePerTicket,
      };
      return NextResponse.json({ success: true, data: budget });
    }

    // 若資料庫查無預算，在 DB 初始化並返回
    const newBudget = createDailyBudget(dateStr, settings);
    const created = await prisma.myDailyBudget.create({
      data: {
        date: new Date(dateStr),
        totalBudget: newBudget.totalBudget,
        spent: newBudget.spent,
        remaining: newBudget.remaining,
        maxTickets: newBudget.maxTickets,
        ticketsUsed: newBudget.ticketsUsed,
        stakePerTicket: newBudget.stakePerTicket,
      }
    });

    const budget: DailyBudget = {
      date: dateStr,
      totalBudget: created.totalBudget,
      spent: created.spent,
      remaining: created.remaining,
      maxTickets: created.maxTickets,
      ticketsUsed: created.ticketsUsed,
      stakePerTicket: created.stakePerTicket,
    };

    return NextResponse.json({ success: true, data: budget });
  } catch (error) {
    console.warn('[API budget GET] DB error, fallback to file:', error);

    const allBudgets = dbFallback.readData<DailyBudget[]>('budgets', []);
    let budget = allBudgets.find((b) => b.date === dateStr);

    if (!budget) {
      budget = createDailyBudget(dateStr, settings);
      allBudgets.push(budget);
      dbFallback.writeData('budgets', allBudgets);
    }

    return NextResponse.json({ success: true, data: budget, isFallback: true });
  }
}

// POST: 重設/修改每日預算
export async function POST(request: NextRequest) {
  try {
    const { date, totalBudget, maxTickets, stakePerTicket, settings } = await request.json(); // date is required

    if (!date) {
      return NextResponse.json({ success: false, error: '缺少 date 參數' }, { status: 400 });
    }

    if (settings) {
      dbFallback.writeData('strategy_settings', settings);
    }

    const tBudget = totalBudget ? parseFloat(totalBudget) : 200;
    const mTickets = maxTickets ? parseInt(maxTickets) : 2;
    const sTicket = stakePerTicket ? parseFloat(stakePerTicket) : 100;

    try {
      // 獲取目前已花費的預算，避免覆蓋造成資料不一致
      const existing = await prisma.myDailyBudget.findUnique({ where: { date: new Date(date) } });
      const spent = existing ? existing.spent : 0;
      const ticketsUsed = existing ? existing.ticketsUsed : 0;
      const remaining = Math.max(0, tBudget - spent);

      const dbBudget = await prisma.myDailyBudget.upsert({
        where: { date: new Date(date) },
        update: {
          totalBudget: tBudget,
          remaining,
          maxTickets: mTickets,
          stakePerTicket: sTicket,
        },
        create: {
          date: new Date(date),
          totalBudget: tBudget,
          spent,
          remaining,
          maxTickets: mTickets,
          ticketsUsed,
          stakePerTicket: sTicket,
        }
      });

      const budget: DailyBudget = {
        date,
        totalBudget: dbBudget.totalBudget,
        spent: dbBudget.spent,
        remaining: dbBudget.remaining,
        maxTickets: dbBudget.maxTickets,
        ticketsUsed: dbBudget.ticketsUsed,
        stakePerTicket: dbBudget.stakePerTicket,
      };

      return NextResponse.json({ success: true, data: budget });
    } catch (dbError) {
      console.warn('[API budget POST] DB error, saving in file:', dbError);

      const allBudgets = dbFallback.readData<DailyBudget[]>('budgets', []);
      const bIndex = allBudgets.findIndex((b) => b.date === date);

      const spent = bIndex > -1 ? allBudgets[bIndex].spent : 0;
      const ticketsUsed = bIndex > -1 ? allBudgets[bIndex].ticketsUsed : 0;
      const remaining = Math.max(0, tBudget - spent);

      const budget: DailyBudget = {
        date,
        totalBudget: tBudget,
        spent,
        remaining,
        maxTickets: mTickets,
        ticketsUsed,
        stakePerTicket: sTicket,
      };

      if (bIndex > -1) {
        allBudgets[bIndex] = budget;
      } else {
        allBudgets.push(budget);
      }

      dbFallback.writeData('budgets', allBudgets);
      return NextResponse.json({ success: true, data: budget, isFallback: true });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '設置預算失敗' },
      { status: 500 }
    );
  }
}
