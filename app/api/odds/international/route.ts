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
import { buildInternationalOddsData, removeVig } from '@/lib/odds/oddsNormalizer';
import type { GameWithTeams } from '@/types/sports';

export const dynamic = 'force-dynamic';

function tryReadLocalPinnacle(
  league: string,
  gameDate: string,
  homeTeam: string,
  awayTeam: string
): any | null {
  try {
    const fs = eval('require')('fs');
    const path = eval('require')('path');
    const dateStr = gameDate.split('T')[0];
    const filePath = path.join(process.cwd(), 'data', 'odds', `pinnacle_${league.toLowerCase()}_${dateStr}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const games = JSON.parse(content);

    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, '');

    const normHome = normalize(homeTeam);
    const normAway = normalize(awayTeam);

    for (const pg of games) {
      const pgHome = normalize(pg.home_team_name || '');
      const pgAway = normalize(pg.away_team_name || '');
      const pgHomeAbbr = normalize(pg.home_team_abbr || '');
      const pgAwayAbbr = normalize(pg.away_team_abbr || '');

      const homeMatches = (pgHome === normHome || pgHome.includes(normHome) || normHome.includes(pgHome) || pgHomeAbbr === normHome);
      const awayMatches = (pgAway === normAway || pgAway.includes(normAway) || normAway.includes(pgAway) || pgAwayAbbr === normAway);

      if (homeMatches && awayMatches) {
        return pg;
      }
    }
  } catch (err) {
    console.error('[Local Pinnacle Fallback] Error reading fallback:', err);
  }
  return null;
}

function buildLocalPinnacleFallbackResponse(
  localMatch: any,
  homeTeamName: string,
  awayTeamName: string
) {
  const { fairHomeProb, fairAwayProb } = removeVig(localMatch.home_odds, localMatch.away_odds);
  
  const mockBookmakers = [
    {
      key: 'pinnacle',
      title: 'Pinnacle',
      last_update: localMatch.updated_at || new Date().toISOString(),
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: homeTeamName, price: localMatch.home_odds },
            { name: awayTeamName, price: localMatch.away_odds }
          ]
        }
      ]
    }
  ];

  return {
    hasData: true,
    avgAwayOdds: localMatch.away_odds,
    avgHomeOdds: localMatch.home_odds,
    fairAwayProb,
    fairHomeProb,
    bookmakerCount: 1,
    eventId: localMatch.game_id,
    source: 'Pinnacle (Local)',
    bookmakers: mockBookmakers
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get('league') ?? '').toUpperCase() as 'MLB' | 'NBA';
  const gameId = searchParams.get('gameId') ?? '';
  const homeTeamName = searchParams.get('homeTeam') ?? '';
  const awayTeamName = searchParams.get('awayTeam') ?? '';
  const gameDate = searchParams.get('gameDate') ?? new Date().toISOString();

  // ── 1. 驗證必填參數 ────────────────────────────────────────────────────────
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

  // ── 2. API key 未設定：嘗試從本地 Pinnacle 檔案取得 ─────────────────────────
  if (!hasOddsApiKey()) {
    const localMatch = tryReadLocalPinnacle(league, gameDate, homeTeamName, awayTeamName);
    if (localMatch && localMatch.home_odds && localMatch.away_odds) {
      return NextResponse.json(buildLocalPinnacleFallbackResponse(localMatch, homeTeamName, awayTeamName));
    }
    return NextResponse.json({ hasData: false, reason: 'no_key' });
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
      // 嘗試降級至本地 Pinnacle
      const localMatch = tryReadLocalPinnacle(league, gameDate, homeTeamName, awayTeamName);
      if (localMatch && localMatch.home_odds && localMatch.away_odds) {
        return NextResponse.json(buildLocalPinnacleFallbackResponse(localMatch, homeTeamName, awayTeamName));
      }
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

    if (oddsData.hasData) {
      return NextResponse.json(oddsData);
    }

    // 如果 API 比對不到，再次嘗試降級至本地 Pinnacle
    const localMatch = tryReadLocalPinnacle(league, gameDate, homeTeamName, awayTeamName);
    if (localMatch && localMatch.home_odds && localMatch.away_odds) {
      return NextResponse.json(buildLocalPinnacleFallbackResponse(localMatch, homeTeamName, awayTeamName));
    }

    return NextResponse.json(oddsData);
  } catch (err) {
    console.error('[/api/odds/international] Error:', err);
    // 降級至本地 Pinnacle
    const localMatch = tryReadLocalPinnacle(league, gameDate, homeTeamName, awayTeamName);
    if (localMatch && localMatch.home_odds && localMatch.away_odds) {
      return NextResponse.json(buildLocalPinnacleFallbackResponse(localMatch, homeTeamName, awayTeamName));
    }
    return NextResponse.json({ hasData: false, reason: 'no_data' });
  }
}

