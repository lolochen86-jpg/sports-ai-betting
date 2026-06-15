/**
 * GET /api/odds/international
 * 查詢指定賽事的國際盤賠率數據
 *
 * Query params:
 *   league=MLB|NBA          (必填)
 *   gameId=xxx              (賽事 ID)
 *   homeTeam=xxx            (主隊名稱，用於模糊比對)
 *   awayTeam=xxx            (客隊名稱，用於模糊比對)
 *   gameDate=2026-06-15     (賽事日期，用於過濾)
 */

import { NextResponse } from 'next/server';
import {
  fetchMLBOdds,
  fetchNBAOdds,
  getCachedMLBOdds,
  getCachedNBAOdds,
  hasOddsApiKey,
} from '@/lib/odds/theOddsApiClient';
import { buildInternationalOddsData } from '@/lib/odds/oddsNormalizer';
import type { GameWithTeams } from '@/types/sports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get('league') ?? '').toUpperCase() as 'MLB' | 'NBA';
  const gameId = searchParams.get('gameId') ?? '';
  const homeTeamName = searchParams.get('homeTeam') ?? '';
  const awayTeamName = searchParams.get('awayTeam') ?? '';
  const gameDate = searchParams.get('gameDate') ?? new Date().toISOString();

  // ── 1. API key 未設定 ──────────────────────────────────────────────────────
  if (!hasOddsApiKey()) {
    return NextResponse.json({ hasData: false, reason: 'no_key' });
  }

  // ── 2. 驗證必填參數 ────────────────────────────────────────────────────────
  if (!league || (!homeTeamName && !awayTeamName)) {
    return NextResponse.json(
      {
        hasData: false,
        reason: 'no_data',
        error: 'league, homeTeam and awayTeam are required',
      },
      { status: 400 }
    );
  }

  try {
    // ── 3. 取得快取或觸發抓取 ────────────────────────────────────────────────
    let cached =
      league === 'MLB' ? getCachedMLBOdds() : getCachedNBAOdds();

    if (!cached) {
      cached = league === 'MLB'
        ? await fetchMLBOdds(false)
        : await fetchNBAOdds(false);
    }

    if (!cached || cached.events.length === 0) {
      return NextResponse.json({ hasData: false, reason: 'no_data' });
    }

    // ── 4. 建立最小化 GameWithTeams 供比對用 ─────────────────────────────────
    const mockGame: Pick<GameWithTeams, 'id' | 'league' | 'homeTeam' | 'awayTeam' | 'gameDate'> = {
      id: gameId,
      league,
      gameDate,
      homeTeam: {
        id: 'home',
        name: homeTeamName,
        code: homeTeamName.slice(0, 3).toUpperCase(),
        city: homeTeamName,
      },
      awayTeam: {
        id: 'away',
        name: awayTeamName,
        code: awayTeamName.slice(0, 3).toUpperCase(),
        city: awayTeamName,
      },
    };

    // ── 5. 比對並回傳 ─────────────────────────────────────────────────────────
    const oddsData = buildInternationalOddsData(
      mockGame as GameWithTeams,
      cached.events
    );
    return NextResponse.json(oddsData);
  } catch (err) {
    console.error('[/api/odds/international] Error:', err);
    // 降級：不讓錯誤傳播到前端造成頁面崩潰
    return NextResponse.json({ hasData: false, reason: 'no_data' });
  }
}
