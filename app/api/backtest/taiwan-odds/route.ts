import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // We only need the Totals lines to calculate Under/Over correctness
    const allOdds = await prisma.oddsTaiwan.findMany({
      where: {
        marketType: 'totals',
        selection: 'over'
      },
      select: {
        gameExternalId: true,
        line: true
      }
    });

    const linesMap: Record<string, number> = {};
    allOdds.forEach((item) => {
      if (item.line !== null && item.line !== undefined) {
        linesMap[item.gameExternalId] = item.line;
      }
    });

    return NextResponse.json({
      success: true,
      lines: linesMap
    });
  } catch (error) {
    console.error('[Backtest Taiwan Odds API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch odds lines' },
      { status: 500 }
    );
  }
}
