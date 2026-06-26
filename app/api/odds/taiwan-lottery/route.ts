import { NextRequest, NextResponse } from 'next/server';
import { findTeamCodeByName } from '@/lib/sports-api/team-translations';

export const dynamic = 'force-dynamic';

async function fetchAndParseLeagueOdds(dateStr: string, league: 'MLB' | 'NBA') {
  const allianceid = league === 'MLB' ? 2 : 3;
  const url = `https://www.playsport.cc/predictgame.php?action=scale&allianceid=${allianceid}&gamedate=${dateStr}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      next: { revalidate: 300 } // Cache for 5 minutes
    });
    
    if (!res.ok) {
      console.error(`[Taiwan Lottery Scraper] Failed to fetch playsport for ${league}: ${res.statusText}`);
      return {};
    }
    
    const html = await res.text();
    
    // Find all unique numeric gameids
    const gameidRegex = /gameid="(\d+)"/g;
    const gameids: string[] = [];
    let match;
    while ((match = gameidRegex.exec(html)) !== null) {
      if (!gameids.includes(match[1])) {
        gameids.push(match[1]);
      }
    }
    
    const oddsMap: Record<string, { awayOdds: number; homeOdds: number }> = {};
    
    gameids.forEach(gameid => {
      const startIndex = html.indexOf(`gameid="${gameid}"`);
      if (startIndex === -1) return;
      
      // Slice block covering both row occurrences
      const gameBlock = html.slice(startIndex, startIndex + 12000);
      
      // Extract team links
      const teamLinkRegex = /href="[^"]*teamid=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      const teamNames: string[] = [];
      let tMatch;
      while ((tMatch = teamLinkRegex.exec(gameBlock)) !== null) {
        const name = tMatch[1].replace(/<[^>]*>/g, '').trim();
        if (name && !teamNames.includes(name)) {
          teamNames.push(name);
        }
      }
      
      if (teamNames.length < 2) return;
      
      const teamAwayName = teamNames[0];
      const teamHomeName = teamNames[1];
      
      const awayCode = findTeamCodeByName(teamAwayName, league);
      const homeCode = findTeamCodeByName(teamHomeName, league);
      
      if (!awayCode || !homeCode) return;
      
      // Parse Moneyline (不讓分 - td-bank-bet03) odds
      const mlRegex = /class="td-bank-bet03"[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/g;
      const oddsList: (number | null)[] = [];
      let cMatch;
      while ((cMatch = mlRegex.exec(gameBlock)) !== null) {
        const divContent = cMatch[1];
        if (divContent.includes('span class="data-wrap"')) {
          const oddsMatch = divContent.match(/<span>([^<]+)</);
          if (oddsMatch) {
            const raw = oddsMatch[1].replace(/,/g, '').trim();
            const val = parseFloat(raw);
            oddsList.push(isNaN(val) ? null : val);
          } else {
            oddsList.push(null);
          }
        } else {
          oddsList.push(null);
        }
      }
      
      const awayOdds = oddsList[0] || null;
      const homeOdds = oddsList[1] || null;
      
      if (awayOdds !== null || homeOdds !== null) {
        const key = `${awayCode}_${homeCode}`;
        oddsMap[key] = {
          awayOdds: awayOdds || 0,
          homeOdds: homeOdds || 0
        };
      }
    });
    
    return oddsMap;
  } catch (err) {
    console.error(`[Taiwan Lottery Scraper] Error scraping ${league}:`, err);
    return {};
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date'); // YYYY-MM-DD
  const leagueParam = searchParams.get('league') || 'ALL'; // MLB | NBA | ALL
  
  // Format date to YYYYMMDD. Fallback to today in GMT+8 (Taipei time)
  let dateStr = '';
  if (dateParam) {
    dateStr = dateParam.replace(/-/g, '');
  } else {
    const taipeiTime = new Date(new Date().getTime() + 8 * 3600000);
    dateStr = taipeiTime.toISOString().split('T')[0].replace(/-/g, '');
  }
  
  try {
    let combinedOdds: Record<string, { awayOdds: number; homeOdds: number }> = {};
    
    if (leagueParam === 'ALL' || leagueParam === 'MLB') {
      const mlbOdds = await fetchAndParseLeagueOdds(dateStr, 'MLB');
      combinedOdds = { ...combinedOdds, ...mlbOdds };
    }
    
    if (leagueParam === 'ALL' || leagueParam === 'NBA') {
      const nbaOdds = await fetchAndParseLeagueOdds(dateStr, 'NBA');
      combinedOdds = { ...combinedOdds, ...nbaOdds };
    }
    
    return NextResponse.json({ success: true, data: combinedOdds });
  } catch (error) {
    console.error('[Taiwan Lottery Odds API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch odds' },
      { status: 500 }
    );
  }
}
