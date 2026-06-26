import { NextRequest, NextResponse } from 'next/server';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { generatePrediction } from '@/lib/prediction/engine';
import { generateSmartParlays } from '@/lib/prediction/parlay-generator';
import type { GameWithTeams } from '@/types/sports';
import type { PredictionResult } from '@/lib/prediction/engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const league = (searchParams.get('league') || 'MLB').toUpperCase();

  try {
    // 1. Fetch games
    let games: GameWithTeams[] = [];
    if (league === 'MLB' || league === 'ALL') {
      games = [...games, ...await fetchMLBGames(dateStr)];
    }
    if (league === 'NBA' || league === 'ALL') {
      games = [...games, ...await fetchNBAGames(dateStr)];
    }

    // Filter to scheduled or live games
    const activeGames = games.filter(g => g.status === 'scheduled' || g.status === 'live');

    if (activeGames.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          parlays: [],
          totalGames: 0,
          totalTeamsCovered: 0,
          totalTeams: 0,
          uncoveredTeams: []
        }
      });
    }

    // 2. Generate predictions for each game
    const predictions = new Map<string, PredictionResult>();
    for (const game of activeGames) {
      try {
        const pred = await generatePrediction(game, game.league);
        predictions.set(game.id, pred);
      } catch (err) {
        console.warn(`[Smart Parlays API] Prediction failed for game ${game.id}:`, err);
      }
    }

    // 3. Generate smart parlays
    const result = generateSmartParlays(activeGames, predictions);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Smart Parlays API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate parlays' },
      { status: 500 }
    );
  }
}
