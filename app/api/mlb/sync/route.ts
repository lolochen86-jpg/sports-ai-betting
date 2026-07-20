import { NextRequest, NextResponse } from 'next/server';
import { runFullMLBSync, fetchTodaysProbablePitchers, fetchMLBInjuries } from '@/lib/mlb-data-sync';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 min for full sync

/**
 * POST /api/mlb/sync
 * Triggers a full MLB data sync: rosters, pitcher stats, team batting, injuries.
 * 
 * Body (optional):
 *   { "date": "2026-07-20" }   — sync for a specific date (defaults to today)
 *   { "mode": "pitchers" }     — only sync today's probable pitchers
 *   { "mode": "injuries" }     — only sync injuries
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = body.date as string | undefined;
    const mode = body.mode as string | undefined;

    if (mode === 'pitchers') {
      const pitchers = await fetchTodaysProbablePitchers(date);
      return NextResponse.json({
        success: true,
        data: pitchers,
        meta: { mode: 'pitchers', count: pitchers.length, syncedAt: new Date().toISOString() },
      });
    }

    if (mode === 'injuries') {
      const injuries = await fetchMLBInjuries();
      return NextResponse.json({
        success: true,
        data: injuries,
        meta: { mode: 'injuries', count: injuries.length, syncedAt: new Date().toISOString() },
      });
    }

    // Full sync
    const report = await runFullMLBSync(date);

    return NextResponse.json({
      success: true,
      data: report,
      meta: {
        mode: 'full',
        syncedAt: report.syncedAt,
        duration: `${(report.duration / 1000).toFixed(1)}s`,
      },
    });
  } catch (error) {
    console.error('[MLB Sync API] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mlb/sync
 * Returns the current sync status: last sync time, player counts, staleness.
 */
export async function GET() {
  try {
    // Get last sync timestamp
    const lastSyncRecord = await prisma.apiCache.findUnique({
      where: { key: 'mlb:lastSync' }
    });

    const lastSync = lastSyncRecord
      ? JSON.parse(lastSyncRecord.data)
      : null;

    // Count players and stats
    const playerCount = await prisma.player.count({
      where: { team: { league: 'MLB' } }
    });

    const statCount = await prisma.playerStat.count({
      where: { league: 'MLB' }
    });

    // Count teams
    const teamCount = await prisma.team.count({
      where: { league: 'MLB' }
    });

    // Check staleness (>24h = stale)
    const isStale = !lastSync || 
      (Date.now() - new Date(lastSync.syncedAt).getTime()) > 24 * 60 * 60 * 1000;

    // Get cached injuries count
    const today = new Date().toISOString().split('T')[0];
    const injuriesCache = await prisma.apiCache.findUnique({
      where: { key: `mlb:injuries:${today}` }
    });
    const injuryCount = injuriesCache 
      ? JSON.parse(injuriesCache.data).length 
      : 0;

    // Get cached pitcher count
    const pitchersCache = await prisma.apiCache.findUnique({
      where: { key: `mlb:pitchers:${today}` }
    });
    const pitcherCount = pitchersCache
      ? JSON.parse(pitchersCache.data).length
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        lastSync,
        isStale,
        counts: {
          teams: teamCount,
          players: playerCount,
          playerStats: statCount,
          todayInjuries: injuryCount,
          todayPitchers: pitcherCount,
        },
      },
    });
  } catch (error) {
    console.error('[MLB Sync Status API] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
