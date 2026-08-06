import { NextResponse } from 'next/server';
import { runRealWalkForwardBacktestAsync } from '@/lib/backtest/realDataRunner';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const league = (searchParams.get('league') || 'ALL') as 'ALL' | 'NBA' | 'MLB';
    
    const report = await runRealWalkForwardBacktestAsync(league);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('Walk-Forward API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to run Walk-Forward backtest' }, { status: 500 });
  }
}
