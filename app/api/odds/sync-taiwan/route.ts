import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchMLBGames } from '@/lib/sports-api/mlb';
import { fetchNBAGames } from '@/lib/sports-api/nba';
import { findTeamCodeByName } from '@/lib/sports-api/team-translations';

export const dynamic = 'force-dynamic';

interface ScrapedOdds {
  awayCode: string;
  homeCode: string;
  awayOdds: number | null;
  homeOdds: number | null;
  totalsLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

// Helper to crawl and parse Playsport odds
async function scrapePlaysport(dateStr: string, league: 'MLB' | 'NBA'): Promise<ScrapedOdds[]> {
  const allianceid = league === 'MLB' ? 1 : 3;
  // Playsport date format: YYYYMMDD
  const formattedDate = dateStr.replace(/-/g, '');
  const url = `https://www.playsport.cc/predictgame.php?action=scale&allianceid=${allianceid}&gamedate=${formattedDate}`;

  console.log(`[Sync Odds] Fetching ${league} from: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      next: { revalidate: 0 } // Bypass Next.js cache
    });

    if (!res.ok) {
      console.error(`[Sync Odds] Failed to fetch for ${league}: ${res.statusText}`);
      return [];
    }

    const html = await res.text();

    // 1. Find all gameids in the HTML
    const gameidRegex = /gameid="(\d+)"/g;
    const gameids: string[] = [];
    let match;
    while ((match = gameidRegex.exec(html)) !== null) {
      if (!gameids.includes(match[1])) {
        gameids.push(match[1]);
      }
    }

    console.log(`[Sync Odds] Found ${gameids.length} gameids in ${league} HTML`);

    const scrapedList: ScrapedOdds[] = [];

    // 2. Parse each game block
    for (const gameid of gameids) {
      const startIndex = html.indexOf(`gameid="${gameid}"`);
      if (startIndex === -1) continue;

      // Extract a block of HTML for this game (typical game block is ~15-20k chars)
      const gameBlock = html.slice(startIndex, startIndex + 25000);

      // Extract team names
      const teamLinkRegex = /href="[^"]*teamid=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      const teamNames: string[] = [];
      let tMatch;
      while ((tMatch = teamLinkRegex.exec(gameBlock)) !== null) {
        const name = tMatch[1].replace(/<[^>]*>/g, '').trim();
        if (name && !teamNames.includes(name)) {
          teamNames.push(name);
        }
      }

      if (teamNames.length < 2) continue;

      const teamAwayName = teamNames[0];
      const teamHomeName = teamNames[1];

      const awayCode = findTeamCodeByName(teamAwayName, league);
      const homeCode = findTeamCodeByName(teamHomeName, league);

      if (!awayCode || !homeCode) {
        console.warn(`[Sync Odds] Code not mapped for: ${teamAwayName} (${awayCode}) @ ${teamHomeName} (${homeCode})`);
        continue;
      }

      // We need to parse cell classes td-bank-bet03 (運彩不讓分) and td-bank-bet02 (運彩大小分)
      // Since it's a structured table, let's extract individual <td> segments
      const tds = gameBlock.split('<td');
      
      let awayOdds: number | null = null;
      let homeOdds: number | null = null;
      let totalsLine: number | null = null;
      let overOdds: number | null = null;
      let underOdds: number | null = null;

      tds.forEach((td) => {
        // ─── A. Parse Moneyline (td-bank-bet03) ───
        if (td.includes('class="td-bank-bet03"')) {
          // Look for odds inside span class="data-wrap"
          const oddsMatch = td.match(/<span>\s*([0-9.]+)\s*<\/span>/);
          const val = oddsMatch ? parseFloat(oddsMatch[1]) : null;
          
          if (td.includes(' team-side') && td.includes('客')) {
            awayOdds = val;
          } else if (td.includes(' team-side') && td.includes('主')) {
            homeOdds = val;
          } else {
            // Fallback checking by text indicators if class parsing differs
            const isAway = td.includes('客');
            const isHome = td.includes('主');
            if (isAway) awayOdds = val;
            if (isHome) homeOdds = val;
          }
        }

        // ─── B. Parse Totals (td-bank-bet02) ───
        if (td.includes('class="td-bank-bet02"')) {
          const lineMatch = td.match(/<strong>\s*([0-9.]+)\s*<\/strong>/);
          const oddsMatch = td.match(/<span>\s*([0-9.]+)\s*<\/span>/);
          
          const lineVal = lineMatch ? parseFloat(lineMatch[1]) : null;
          const oddsVal = oddsMatch ? parseFloat(oddsMatch[1]) : null;

          if (td.includes('大')) {
            totalsLine = lineVal;
            overOdds = oddsVal;
          } else if (td.includes('小')) {
            totalsLine = lineVal;
            underOdds = oddsVal;
          }
        }
      });

      console.log(`[Sync Odds] ${awayCode} @ ${homeCode} -> ML(客:${awayOdds}, 主:${homeOdds}) | Totals(盤口:${totalsLine}, 大:${overOdds}, 小:${underOdds})`);

      scrapedList.push({
        awayCode,
        homeCode,
        awayOdds,
        homeOdds,
        totalsLine,
        overOdds,
        underOdds
      });
    }

    return scrapedList;
  } catch (error) {
    console.error(`[Sync Odds] Scraper error for ${league}:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    // 1. Fetch official scheduled games from API for matching
    console.log(`[Sync Odds API] Loading games from APIs for date: ${dateStr}`);
    const [mlbGames, nbaGames] = await Promise.all([
      fetchMLBGames(dateStr, true).catch(() => []),
      fetchNBAGames(dateStr, true).catch(() => [])
    ]);

    const allGames = [...mlbGames, ...nbaGames];
    console.log(`[Sync Odds API] Loaded ${allGames.length} official games (${mlbGames.length} MLB, ${nbaGames.length} NBA)`);

    // Helper map of match code combinations to official game instances
    const officialGamesMap = new Map<string, typeof allGames[0]>();
    allGames.forEach((g) => {
      const away = g.awayTeam.code?.toUpperCase();
      const home = g.homeTeam.code?.toUpperCase();
      if (away && home) {
        // e.g. "NYY_LAD" or "LAL_GSW"
        officialGamesMap.set(`${away}_${home}`, g);
      }
    });

    // 2. Scrape Playsport odds for both leagues
    const [scrapedMlb, scrapedNba] = await Promise.all([
      scrapePlaysport(dateStr, 'MLB'),
      scrapePlaysport(dateStr, 'NBA')
    ]);

    const allScraped = [...scrapedMlb, ...scrapedNba];
    let upsertedCount = 0;
    const upsertedDetails: any[] = [];

    // 3. Match and upsert into database
    const oddsMap: Record<string, { awayOdds: number; homeOdds: number }> = {};

    for (const scraped of allScraped) {
      const matchKey = `${scraped.awayCode}_${scraped.homeCode}`;
      const officialGame = officialGamesMap.get(matchKey);

      if (!officialGame) {
        console.warn(`[Sync Odds API] No official game found matching key: ${matchKey}`);
        continue;
      }

      const gameId = officialGame.id;
      const league = officialGame.league;
      const gameDate = new Date(officialGame.gameDate);

      // Populate compatible oddsMap for frontend localState compatibility
      if (scraped.awayOdds || scraped.homeOdds) {
        oddsMap[matchKey] = {
          awayOdds: scraped.awayOdds || 0,
          homeOdds: scraped.homeOdds || 0
        };
      }

      // A. Upsert Moneyline (Away)
      if (scraped.awayOdds) {
        const item = await prisma.oddsTaiwan.upsert({
          where: {
            gameExternalId_marketType_selection: {
              gameExternalId: gameId,
              marketType: 'moneyline',
              selection: 'away'
            }
          },
          update: {
            taiwanOdds: scraped.awayOdds,
            impliedProbability: 1 / scraped.awayOdds,
            source: 'scraped',
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode
          },
          create: {
            gameExternalId: gameId,
            league,
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode,
            marketType: 'moneyline',
            selection: 'away',
            taiwanOdds: scraped.awayOdds,
            impliedProbability: 1 / scraped.awayOdds,
            source: 'scraped'
          }
        });
        upsertedCount++;
      }

      // B. Upsert Moneyline (Home)
      if (scraped.homeOdds) {
        await prisma.oddsTaiwan.upsert({
          where: {
            gameExternalId_marketType_selection: {
              gameExternalId: gameId,
              marketType: 'moneyline',
              selection: 'home'
            }
          },
          update: {
            taiwanOdds: scraped.homeOdds,
            impliedProbability: 1 / scraped.homeOdds,
            source: 'scraped',
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode
          },
          create: {
            gameExternalId: gameId,
            league,
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode,
            marketType: 'moneyline',
            selection: 'home',
            taiwanOdds: scraped.homeOdds,
            impliedProbability: 1 / scraped.homeOdds,
            source: 'scraped'
          }
        });
        upsertedCount++;
      }

      // C. Upsert Totals (Over)
      if (scraped.totalsLine && scraped.overOdds) {
        await prisma.oddsTaiwan.upsert({
          where: {
            gameExternalId_marketType_selection: {
              gameExternalId: gameId,
              marketType: 'totals',
              selection: 'over'
            }
          },
          update: {
            taiwanOdds: scraped.overOdds,
            line: scraped.totalsLine,
            impliedProbability: 1 / scraped.overOdds,
            source: 'scraped',
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode
          },
          create: {
            gameExternalId: gameId,
            league,
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode,
            marketType: 'totals',
            selection: 'over',
            taiwanOdds: scraped.overOdds,
            line: scraped.totalsLine,
            impliedProbability: 1 / scraped.overOdds,
            source: 'scraped'
          }
        });
        upsertedCount++;
      }

      // D. Upsert Totals (Under)
      if (scraped.totalsLine && scraped.underOdds) {
        await prisma.oddsTaiwan.upsert({
          where: {
            gameExternalId_marketType_selection: {
              gameExternalId: gameId,
              marketType: 'totals',
              selection: 'under'
            }
          },
          update: {
            taiwanOdds: scraped.underOdds,
            line: scraped.totalsLine,
            impliedProbability: 1 / scraped.underOdds,
            source: 'scraped',
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode
          },
          create: {
            gameExternalId: gameId,
            league,
            gameDate,
            homeTeam: scraped.homeCode,
            awayTeam: scraped.awayCode,
            marketType: 'totals',
            selection: 'under',
            taiwanOdds: scraped.underOdds,
            line: scraped.totalsLine,
            impliedProbability: 1 / scraped.underOdds,
            source: 'scraped'
          }
        });
        upsertedCount++;
      }

      upsertedDetails.push({
        match: `${scraped.awayCode} @ ${scraped.homeCode}`,
        gameId,
        league
      });
    }

    return NextResponse.json({
      success: true,
      data: oddsMap,
      upsertedCount,
      gamesSynced: upsertedDetails.length,
      details: upsertedDetails
    });
  } catch (error) {
    console.error('[Sync Odds API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Odds synchronization failed' },
      { status: 500 }
    );
  }
}
