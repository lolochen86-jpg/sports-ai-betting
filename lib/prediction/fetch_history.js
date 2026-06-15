const fs = require('fs');
const path = require('path');

const START_DATE = '2026-04-01';
// Dynamic end date: Taipei local date (UTC+8)
const END_DATE = new Date(Date.now() + 8 * 3600000).toISOString().split('T')[0];

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const MLB_BASE = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1';

// Generate Date List
function getDateList(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Translate MLB team IDs to standard Abbreviations
const MLB_TEAM_TRANSLATIONS = {
  '147': 'NYY', '119': 'LAD', '137': 'SFG', '117': 'HOU',
  '140': 'TEX', '111': 'BOS', '112': 'CHC', '144': 'ATL',
  '120': 'WSH', '121': 'NYM', '143': 'PHI', '146': 'MIA',
  '158': 'MIL', '138': 'STL', '113': 'CIN', '134': 'PIT',
  '135': 'SDP', '109': 'ARI', '115': 'COL', '136': 'SEA',
  '108': 'LAA', '133': 'OAK', '142': 'MIN', '110': 'BAL',
  '139': 'TB',  '116': 'CLE', '145': 'CWS', '118': 'KC',
  '114': 'DET'
};

function getMlbCode(teamId, name) {
  const idStr = String(teamId);
  if (MLB_TEAM_TRANSLATIONS[idStr]) return MLB_TEAM_TRANSLATIONS[idStr];
  return name.substring(0, 3).toUpperCase().replace(/\s/g, 'X');
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRealHistory() {
  const dates = getDateList(START_DATE, END_DATE);
  console.log(`Starting real game fetch for ${dates.length} days...`);
  
  const allGames = [];
  
  for (let dIdx = 0; dIdx < dates.length; dIdx++) {
    const dateStr = dates[dIdx];
    console.log(`[${dIdx + 1}/${dates.length}] Fetching date: ${dateStr}...`);
    
    // ─── 1. Fetch NBA Games from ESPN ───
    try {
      const dateParam = dateStr.replace(/-/g, '');
      const url = `${ESPN_BASE}/scoreboard?dates=${dateParam}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const events = json.events ?? [];
        
        events.forEach((event) => {
          const comp = event.competitions?.[0];
          const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
          const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');
          
          const homeScore = homeComp?.score != null ? Number(homeComp.score) : 0;
          const awayScore = awayComp?.score != null ? Number(awayComp.score) : 0;
          const statusId = Number(comp?.status?.type?.id ?? 1);
          
          // Only collect finished matches with valid scores
          if (statusId === 3 && homeScore > 0 && awayScore > 0) {
            allGames.push({
              id: `nba_${event.id}`,
              league: 'NBA',
              date: dateStr,
              homeCode: homeComp?.team?.abbreviation ?? 'HOME',
              homeName: homeComp?.team?.displayName ?? homeComp?.team?.name ?? 'Home Team',
              awayCode: awayComp?.team?.abbreviation ?? 'AWAY',
              awayName: awayComp?.team?.displayName ?? awayComp?.team?.name ?? 'Away Team',
              homeScore,
              awayScore
            });
          }
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch NBA for ${dateStr}:`, err.message);
    }
    
    // ─── 2. Fetch MLB Games from MLB Stats API ───
    try {
      const url = `${MLB_BASE}&date=${dateStr}&hydrate=linescore`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const games = (json.dates ?? []).flatMap((d) => d.games ?? []);
        
        games.forEach((g) => {
          const state = g.status?.detailedState;
          const homeScore = g.teams?.home?.score;
          const awayScore = g.teams?.away?.score;
          
          if (state === 'Final' && homeScore !== undefined && awayScore !== undefined) {
            const homeId = g.teams?.home?.team?.id;
            const awayId = g.teams?.away?.team?.id;
            const homeName = g.teams?.home?.team?.name ?? 'Home';
            const awayName = g.teams?.away?.team?.name ?? 'Away';
            
            allGames.push({
              id: `mlb_${g.gamePk}`,
              league: 'MLB',
              date: dateStr,
              homeCode: getMlbCode(homeId, homeName),
              homeName,
              awayCode: getMlbCode(awayId, awayName),
              awayName,
              homeScore: Number(homeScore),
              awayScore: Number(awayScore)
            });
          }
        });
      }
    } catch (err) {
      console.warn(`Failed to fetch MLB for ${dateStr}:`, err.message);
    }
    
    // Small delay to protect API rate limit
    await delay(35);
  }
  
  // Write to local JSON file
  const outputPath = path.join(__dirname, 'real_historical_games.json');
  fs.writeFileSync(outputPath, JSON.stringify(allGames, null, 2), 'utf-8');
  console.log(`Success! Saved ${allGames.length} real historical games to ${outputPath}`);
}

fetchRealHistory();
