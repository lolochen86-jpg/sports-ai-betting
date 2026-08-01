import { NextRequest, NextResponse } from 'next/server';
import { generateParlayHistory } from '@/lib/prediction/parlay-history';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get('league') || 'ALL').toUpperCase() as 'NBA' | 'MLB' | 'ALL';
  const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : undefined;

  try {
    const result = generateParlayHistory(league, days);
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Smart Parlays History API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate parlay history' },
      { status: 500 }
    );
  }
}
