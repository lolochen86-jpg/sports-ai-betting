import {
  DataAuditReport,
  GameAuditData,
  DataCheckItem,
  PitcherAuditInfo,
  WeatherAuditInfo,
} from './types';
import {
  fetchStartingPitcher,
  extractRecentStats,
  fetchH2HRecord,
  detectFatigue,
} from '../prediction/features';
import { getParkFactor } from '../prediction/park-factors';
import { calculateRestAndTravel } from '../prediction/rest-travel';
import { fetchMLBGames } from '../sports-api/mlb';
import { fetchNBAGames } from '../sports-api/nba';
import type { GameWithTeams, League } from '@/types/sports';

const INDOOR_VENUES = [
  'LoanDepot Park', // MIA
  'Tropicana Field', // TB
  'Globe Life Field', // TEX
  'Chase Field', // ARI
  'American Family Field', // MIL
  'Rogers Centre', // TOR
  'Minute Maid Park', // HOU
];

export async function fetchWeatherForVenue(
  venueName: string,
  teamCode: string,
  date: string
): Promise<WeatherAuditInfo | null> {
  const isIndoor = INDOOR_VENUES.some((v) => venueName.toLowerCase().includes(v.toLowerCase()));
  if (isIndoor) {
    return {
      tempC: 22,
      humidity: 50,
      windSpeedKph: 0,
      windDirection: 'None',
      condition: 'Indoor',
      isIndoor: true,
      description: '室內球場，氣候控制恆溫',
    };
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn('[AI① 資料彙整員] OpenWeather API key is missing');
    return null;
  }

  try {
    // Basic mapping for cities based on teamCode, or just use venueName
    const city = venueName.split(' ')[0] || 'New York'; // Simplified for now
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
    const data = await res.json();
    
    return {
      tempC: data.main.temp,
      humidity: data.main.humidity,
      windSpeedKph: data.wind.speed * 3.6, // m/s to km/h
      windDirection: `${data.wind.deg}°`,
      condition: data.weather[0].main,
      isIndoor: false,
      description: data.weather[0].description,
    };
  } catch (err) {
    console.warn(`[AI① 資料彙整員] Failed to fetch weather for ${venueName}:`, err);
    return null;
  }
}

export async function checkDataCompleteness(
  game: GameWithTeams,
  league: League
): Promise<GameAuditData> {
  const checks: DataCheckItem[] = [];
  const gameDate = game.gameDate || new Date().toISOString().split('T')[0];
  
  // Initialize default fallback data
  let homePitcher: PitcherAuditInfo | null = null;
  let awayPitcher: PitcherAuditInfo | null = null;
  let homeRecentScores: number[] = [];
  let awayRecentScores: number[] = [];
  let homeRecord = '0-0';
  let awayRecord = '0-0';
  let homeStreak = 0;
  let awayStreak = 0;
  let parkFactor = null;
  let weather = null;
  let restTravel = null;
  let injuries = { home: [], away: [] };
  let h2h = null;

  // 1. Starting Pitcher (MLB only)
  if (league === 'MLB') {
    try {
      const pitchers = await fetchStartingPitcher(game.id);
      if (pitchers.home && pitchers.away) {
        homePitcher = pitchers.home;
        awayPitcher = pitchers.away;
        checks.push({ field: 'pitcher', label: '先發投手', status: 'ok' });
      } else {
        checks.push({ field: 'pitcher', label: '先發投手', status: 'missing', reason: 'TBD' });
      }
    } catch (err) {
      checks.push({ field: 'pitcher', label: '先發投手', status: 'missing', reason: 'Fetch failed' });
    }
  }

  // 2. Recent team stats
  try {
    const homeStats = await extractRecentStats(game.homeTeam.id, league, undefined, gameDate);
    const awayStats = await extractRecentStats(game.awayTeam.id, league, undefined, gameDate);
    homeRecentScores = homeStats.recentGameScores || [];
    awayRecentScores = awayStats.recentGameScores || [];
    homeStreak = homeStats.streak;
    awayStreak = awayStats.streak;
    checks.push({ field: 'recentStats', label: '近期戰績', status: 'ok' });
  } catch (err) {
    checks.push({ field: 'recentStats', label: '近期戰績', status: 'degraded', fallback: '使用預設數據' });
  }

  // 3. Park/venue factor
  try {
    parkFactor = getParkFactor(game.homeTeam.code, league, game.venue);
    checks.push({ field: 'parkFactor', label: '球場因子', status: 'ok' });
  } catch (err) {
    checks.push({ field: 'parkFactor', label: '球場因子', status: 'degraded', fallback: '標準球場' });
  }

  // 4. Weather info (outdoor only)
  if (league === 'MLB') {
    weather = await fetchWeatherForVenue(game.venue, game.homeTeam.code, gameDate);
    if (weather) {
      checks.push({ field: 'weather', label: '天氣資訊', status: 'ok' });
    } else {
      checks.push({ field: 'weather', label: '天氣資訊', status: 'missing', reason: 'No API key or fetch failed' });
    }
  } else {
    checks.push({ field: 'weather', label: '天氣資訊', status: 'ok', value: 'Indoor' });
  }

  // 5. Rest/travel fatigue
  try {
    const homeFatigue = await detectFatigue(game.homeTeam.id, gameDate, league);
    const awayFatigue = await detectFatigue(game.awayTeam.id, gameDate, league);
    
    // Default rest days calculation for calculateRestAndTravel
    const homeRest = homeFatigue.isBackToBack ? 0 : 1; 
    const awayRest = awayFatigue.isBackToBack ? 0 : 1;
    
    const rt = calculateRestAndTravel(game.awayTeam.code, game.homeTeam.code, league, awayRest);
    restTravel = {
      homeRestDays: homeRest,
      awayRestDays: awayRest,
      homeFatigue: homeFatigue.fatigueLevel,
      awayFatigue: awayFatigue.fatigueLevel
    };
    checks.push({ field: 'restTravel', label: '休息與移動', status: 'ok' });
  } catch (err) {
    checks.push({ field: 'restTravel', label: '休息與移動', status: 'degraded' });
  }

  // 6. Injury reports
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const injRes = await fetch(`${baseUrl}/api/predictions/injuries?teamId=${game.homeTeam.id}`);
    if (injRes.ok) {
      checks.push({ field: 'injuries', label: '傷兵名單', status: 'ok' });
    } else {
      checks.push({ field: 'injuries', label: '傷兵名單', status: 'missing' });
    }
  } catch (err) {
    checks.push({ field: 'injuries', label: '傷兵名單', status: 'missing', reason: 'Fetch failed' });
  }

  // 7. H2H record
  try {
    const h2hRecord = await fetchH2HRecord(game.homeTeam.id, game.awayTeam.id, league, undefined, gameDate);
    if (h2hRecord) {
      h2h = {
        homeWins: h2hRecord.teamAWins,
        awayWins: h2hRecord.teamBWins,
        totalGames: h2hRecord.totalGames
      };
      checks.push({ field: 'h2h', label: '對戰紀錄', status: 'ok' });
    } else {
      checks.push({ field: 'h2h', label: '對戰紀錄', status: 'missing', reason: 'No past matchups' });
    }
  } catch (err) {
    checks.push({ field: 'h2h', label: '對戰紀錄', status: 'missing' });
  }

  // 8. Team records/standings
  homeRecord = game.homeTeam.record || '0-0';
  awayRecord = game.awayTeam.record || '0-0';
  checks.push({ field: 'records', label: '球隊戰績', status: 'ok' });

  const completeness = (checks.filter(c => c.status === 'ok').length / checks.length) * 100;

  return {
    gameId: game.id,
    league,
    gameDate,
    homeTeam: { code: game.homeTeam.code, name: game.homeTeam.name, nameCn: game.homeTeam.nameCn || game.homeTeam.name },
    awayTeam: { code: game.awayTeam.code, name: game.awayTeam.name, nameCn: game.awayTeam.nameCn || game.awayTeam.name },
    venue: game.venue,
    checks,
    completeness,
    data: {
      homePitcher,
      awayPitcher,
      homeRecentScores,
      awayRecentScores,
      homeRecord,
      awayRecord,
      homeStreak,
      awayStreak,
      parkFactor: parkFactor ? { runFactor: parkFactor.runFactor, category: parkFactor.category, description: parkFactor.description } : null,
      weather,
      restTravel,
      injuries,
      h2h
    }
  };
}

export async function auditTomorrowGames(targetDate?: string): Promise<DataAuditReport> {
  let dateToUse = targetDate;
  if (!dateToUse) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateToUse = tomorrow.toISOString().split('T')[0];
  }

  console.log(`[AI① 資料彙整員] Starting audit for target date: ${dateToUse}`);

  // Fetch MLB and NBA games
  const mlbGames = await fetchMLBGames(dateToUse);
  let nbaGames: GameWithTeams[] = [];
  try {
    nbaGames = await fetchNBAGames(dateToUse);
  } catch (err) {
    console.warn('[AI① 資料彙整員] Could not fetch NBA games, might be off-season.');
  }

  const allGames = [
    ...mlbGames.map(g => ({ game: g, league: 'MLB' as League })),
    ...nbaGames.map(g => ({ game: g, league: 'NBA' as League }))
  ];

  console.log(`[AI① 資料彙整員] Found ${allGames.length} games to audit.`);

  const auditedGames: GameAuditData[] = [];
  
  for (const { game, league } of allGames) {
    console.log(`[AI① 資料彙整員] Auditing game ${game.id} (${game.homeTeam.code} vs ${game.awayTeam.code})`);
    const audited = await checkDataCompleteness(game, league);
    auditedGames.push(audited);
  }

  const fullyComplete = auditedGames.filter(g => g.completeness === 100).length;
  const partiallyComplete = auditedGames.length - fullyComplete;
  const averageCompleteness = auditedGames.length > 0 
    ? auditedGames.reduce((acc, g) => acc + g.completeness, 0) / auditedGames.length 
    : 0;

  const missingItems = new Set<string>();
  auditedGames.forEach(g => {
    g.checks.forEach(c => {
      if (c.status !== 'ok') {
        missingItems.add(c.label);
      }
    });
  });

  console.log(`[AI① 資料彙整員] Audit complete. Avg completeness: ${averageCompleteness.toFixed(1)}%`);

  return {
    targetDate: dateToUse,
    generatedAt: new Date().toISOString(),
    totalGames: allGames.length,
    games: auditedGames,
    summary: {
      fullyComplete,
      partiallyComplete,
      averageCompleteness,
      missingItems: Array.from(missingItems)
    }
  };
}
