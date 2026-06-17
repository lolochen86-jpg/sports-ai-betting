import { NextRequest, NextResponse } from 'next/server';
import { calculate_ensemble_edge, EnsembleInput } from '@/lib/prediction/ensemble-edge';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required parameters
    if (!body.league || !body.home || !body.away || body.bookmakerSpread === undefined || body.bookmakerTotal === undefined) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required parameters. Make sure "league", "home", "away", "bookmakerSpread", and "bookmakerTotal" are provided.' 
        },
        { status: 400 }
      );
    }

    const input: EnsembleInput = {
      league: body.league,
      home: {
        avgScore5: Number(body.home.avgScore5),
        winRate5: Number(body.home.winRate5),
        avgScore10: Number(body.home.avgScore10),
        winRate10: Number(body.home.winRate10),
        elo: Number(body.home.elo),
        pitcherEra: body.home.pitcherEra !== undefined ? Number(body.home.pitcherEra) : undefined,
        injuryImpact: body.home.injuryImpact !== undefined ? Number(body.home.injuryImpact) : undefined,
      },
      away: {
        avgScore5: Number(body.away.avgScore5),
        winRate5: Number(body.away.winRate5),
        avgScore10: Number(body.away.avgScore10),
        winRate10: Number(body.away.winRate10),
        elo: Number(body.away.elo),
        pitcherEra: body.away.pitcherEra !== undefined ? Number(body.away.pitcherEra) : undefined,
        injuryImpact: body.away.injuryImpact !== undefined ? Number(body.away.injuryImpact) : undefined,
      },
      bookmakerSpread: Number(body.bookmakerSpread),
      bookmakerTotal: Number(body.bookmakerTotal),
    };

    // Calculate quantitative ensemble results
    const results = calculate_ensemble_edge(input);

    return NextResponse.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    console.error('Ensemble Edge API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to calculate ensemble edge.' 
      },
      { status: 500 }
    );
  }
}
