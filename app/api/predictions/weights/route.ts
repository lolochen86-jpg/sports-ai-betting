import { NextResponse } from 'next/server';
import { getMetaModelWeights } from '@/lib/prediction/weights';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const weights = getMetaModelWeights();
    return NextResponse.json({ success: true, weights }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      }
    });
  } catch (error) {
    console.error('[API predictions weights] Error:', error);
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
