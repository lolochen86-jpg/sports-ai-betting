import { NextRequest, NextResponse } from 'next/server';
import { runAutoRebalancing } from '@/lib/prediction/rebalance';

export const dynamic = 'force-dynamic';

/**
 * GET or POST /api/predictions/rebalance
 *
 * Runs the dynamic weight auto-rebalancing check on the latest 50 completed games.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await runAutoRebalancing();
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: result
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to complete weight rebalancing.',
        data: result
      }, {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        }
      });
    }
  } catch (error) {
    console.error('[API predictions rebalance] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        }
      }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
