/**
 * MLB 球員數據同步模組
 * 
 * 透過 MLB Stats API 抓取最新的：
 *   - 40 人名單 (active roster)
 *   - 球員本季累計數據 (打擊 / 投手)
 *   - 傷兵名單 (injuries)
 *   - 先發投手本季成績 (ERA, FIP, WHIP, K/9)
 *   - 球隊打線品質 (OPS, wRC+ 近似)
 *   - 牛棚近況 (近 3 日 ERA)
 * 
 * 所有資料會 upsert 進 Prisma 的 Player / PlayerStat 表。
 */

import { prisma } from '@/lib/prisma';

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; SportsAnalyzer/2.0)' };

// ─── MLB Team Code → Team ID mapping ────────────────────
const MLB_TEAMS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112,
  CWS: 145, CIN: 113, CLE: 114, COL: 115, DET: 116,
  HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146,
  MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133,
  PHI: 143, PIT: 134, SD: 135, SF: 137, SEA: 136,
  STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
};

// ─── Park Factors 2026 ─────────────────────────────────
const PARK_FACTORS: Record<string, number> = {
  COL: 115, CIN: 110, TEX: 108, BOS: 107, PHI: 106,
  NYY: 105, CHC: 104, HOU: 103, ATL: 102, LAA: 101,
  MIL: 100, DET: 100, STL: 100, ARI: 99,  TOR: 99,
  BAL: 98,  SEA: 97,  MIA: 97,  CWS: 96,  OAK: 96,
  TB:  95,  MIN: 95,  SF:  94,  CLE: 93,  KC:  93,
  LAD: 92,  WSH: 92,  PIT: 91,  NYM: 91,  SD:  90,
};

export function getParkFactorByTeam(teamCode: string): number {
  return PARK_FACTORS[teamCode] ?? 100;
}

// ─── Helpers ───────────────────────────────────────────
async function fetchJSON(url: string, params?: Record<string, string>): Promise<any> {
  const u = new URL(url);
  if (params) {
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  }
  const res = await fetch(u.toString(), { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`MLB API error ${res.status}: ${u.pathname}`);
  }
  return res.json();
}

function parseIP(ipStr: string): number {
  if (!ipStr) return 0;
  const parts = ipStr.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  const fraction = parseInt(parts[1] || '0', 10);
  return whole + fraction / 3;
}

// ─── Roster Sync ──────────────────────────────────────
export interface RosterSyncResult {
  teamCode: string;
  teamName: string;
  playersAdded: number;
  playersUpdated: number;
  errors: string[];
}

export async function syncTeamRoster(mlbTeamId: number, teamCode: string): Promise<RosterSyncResult> {
  const result: RosterSyncResult = { teamCode, teamName: '', playersAdded: 0, playersUpdated: 0, errors: [] };
  
  try {
    const data = await fetchJSON(`${MLB_API}/teams/${mlbTeamId}/roster`, { rosterType: 'active' });
    
    // Find or create team in Prisma
    let dbTeam = await prisma.team.findFirst({ where: { code: teamCode } });
    if (!dbTeam) {
      dbTeam = await prisma.team.create({
        data: {
          league: 'MLB',
          name: teamCode,
          code: teamCode,
          city: teamCode,
        }
      });
    }
    result.teamName = dbTeam.name;

    const roster = data.roster ?? [];
    for (const entry of roster) {
      const personId = entry.person?.id;
      const fullName = entry.person?.fullName ?? 'Unknown';
      const position = entry.position?.abbreviation ?? entry.position?.name ?? 'Unknown';
      const number = entry.jerseyNumber ? parseInt(entry.jerseyNumber, 10) : null;

      if (!personId) continue;

      try {
        const existing = await prisma.player.findFirst({
          where: { teamId: dbTeam.id, name: fullName }
        });

        if (existing) {
          await prisma.player.update({
            where: { id: existing.id },
            data: { position, number }
          });
          result.playersUpdated++;
        } else {
          await prisma.player.create({
            data: {
              teamId: dbTeam.id,
              name: fullName,
              position,
              number,
            }
          });
          result.playersAdded++;
        }
      } catch (err) {
        result.errors.push(`Player ${fullName}: ${err}`);
      }
    }
  } catch (err) {
    result.errors.push(`Team ${teamCode}: ${err}`);
  }

  return result;
}

// ─── Pitcher Stats Sync ──────────────────────────────
export interface PitcherStatsData {
  pitcherId: number;
  name: string;
  era: number;
  fip: number;
  whip: number;
  kPer9: number;
  bbPer9: number;
  inningsPitched: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  strikeouts: number;
  saves: number;
  battingAvgAgainst: number;
}

const FIP_CONSTANT = 3.10;

export async function fetchPitcherSeasonStats(pitcherId: number, season: number): Promise<PitcherStatsData | null> {
  try {
    const data = await fetchJSON(`${MLB_API}/people/${pitcherId}/stats`, {
      stats: 'season',
      season: String(season),
      group: 'pitching',
      gameType: 'R',
    });

    const statsArr = data.stats ?? [];
    if (!statsArr.length || !statsArr[0].splits?.length) return null;

    const s = statsArr[0].splits[0].stat;
    const ip = parseIP(s.inningsPitched ?? '0.0');

    // Calculate FIP
    const hr = parseFloat(s.homeRuns ?? '0');
    const bb = parseFloat(s.baseOnBalls ?? '0');
    const hbp = parseFloat(s.hitByPitch ?? '0');
    const k = parseFloat(s.strikeOuts ?? '0');
    const fip = ip > 0 ? (13 * hr + 3 * (bb + hbp) - 2 * k) / ip + FIP_CONSTANT : 99.99;

    return {
      pitcherId,
      name: '',
      era: parseFloat(s.era ?? '99.99'),
      fip: Math.round(fip * 100) / 100,
      whip: parseFloat(s.whip ?? '99.99'),
      kPer9: parseFloat(s.strikeoutsPer9Inn ?? '0'),
      bbPer9: parseFloat(s.walksPer9Inn ?? '0'),
      inningsPitched: ip,
      gamesStarted: parseInt(s.gamesStarted ?? '0', 10),
      wins: parseInt(s.wins ?? '0', 10),
      losses: parseInt(s.losses ?? '0', 10),
      strikeouts: parseInt(s.strikeOuts ?? '0', 10),
      saves: parseInt(s.saves ?? '0', 10),
      battingAvgAgainst: parseFloat(s.avg ?? '0.250'),
    };
  } catch {
    return null;
  }
}

// ─── Team Batting Stats Sync ─────────────────────────
export interface TeamBattingData {
  teamId: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  runsPerGame: number;
  hrPerGame: number;
  wrcPlusApprox: number;
}

export async function fetchTeamBattingStats(mlbTeamId: number, season: number): Promise<TeamBattingData | null> {
  try {
    const data = await fetchJSON(`${MLB_API}/teams/${mlbTeamId}/stats`, {
      stats: 'season',
      season: String(season),
      group: 'hitting',
      gameType: 'R',
    });

    const statsArr = data.stats ?? [];
    if (!statsArr.length || !statsArr[0].splits?.length) return null;

    const s = statsArr[0].splits[0].stat;
    const gp = Math.max(parseInt(s.gamesPlayed ?? '1', 10), 1);
    const ops = parseFloat(s.ops ?? '0.720');

    return {
      teamId: mlbTeamId,
      avg: parseFloat(s.avg ?? '0.250'),
      obp: parseFloat(s.obp ?? '0.320'),
      slg: parseFloat(s.slg ?? '0.400'),
      ops,
      runsPerGame: Math.round((parseFloat(s.runs ?? '0') / gp) * 100) / 100,
      hrPerGame: Math.round((parseFloat(s.homeRuns ?? '0') / gp) * 100) / 100,
      wrcPlusApprox: Math.round((ops / 0.720) * 100 * 10) / 10,
    };
  } catch {
    return null;
  }
}

// ─── Injuries ────────────────────────────────────────
export interface InjuryInfo {
  playerId: number;
  playerName: string;
  teamCode: string;
  injuryType: string;
  injuryDate: string;
}

export async function fetchMLBInjuries(): Promise<InjuryInfo[]> {
  try {
    // MLB API doesn't have a direct injuries endpoint that's publicly documented,
    // so we use the transaction list which shows IL moves
    const injuries: InjuryInfo[] = [];
    
    // Fetch from each team's roster and check for IL status
    for (const [code, teamId] of Object.entries(MLB_TEAMS)) {
      try {
        const data = await fetchJSON(`${MLB_API}/teams/${teamId}/roster`, { 
          rosterType: 'fullRoster',
          hydrate: 'person(stats(type=season))'
        });

        for (const entry of data.roster ?? []) {
          const status = entry.status?.description ?? '';
          if (status.toLowerCase().includes('injured') || status.toLowerCase().includes('il')) {
            injuries.push({
              playerId: entry.person?.id ?? 0,
              playerName: entry.person?.fullName ?? 'Unknown',
              teamCode: code,
              injuryType: status,
              injuryDate: entry.status?.date ?? '',
            });
          }
        }
      } catch {
        // Skip team on error
      }
    }

    return injuries;
  } catch {
    return [];
  }
}

// ─── Today's Probable Pitchers ──────────────────────
export interface ProbablePitcherInfo {
  gamePk: number;
  homeTeamCode: string;
  awayTeamCode: string;
  homeStarter: { id: number; name: string; stats: PitcherStatsData | null } | null;
  awayStarter: { id: number; name: string; stats: PitcherStatsData | null } | null;
}

export async function fetchTodaysProbablePitchers(date?: string): Promise<ProbablePitcherInfo[]> {
  const d = date || new Date().toISOString().split('T')[0];
  const season = parseInt(d.substring(0, 4), 10);

  const schedData = await fetchJSON(`${MLB_API}/schedule`, {
    sportId: '1',
    date: d,
    hydrate: 'probablePitcher,team',
    gameType: 'R',
  });

  const results: ProbablePitcherInfo[] = [];

  for (const dateEntry of schedData.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      const homeTeam = game.teams?.home?.team;
      const awayTeam = game.teams?.away?.team;
      const homeStarter = game.teams?.home?.probablePitcher;
      const awayStarter = game.teams?.away?.probablePitcher;

      const homeCode = homeTeam?.abbreviation ?? '';
      const awayCode = awayTeam?.abbreviation ?? '';

      let homeStats: PitcherStatsData | null = null;
      let awayStats: PitcherStatsData | null = null;

      if (homeStarter?.id) {
        homeStats = await fetchPitcherSeasonStats(homeStarter.id, season);
        if (homeStats) homeStats.name = homeStarter.fullName ?? '';
      }
      if (awayStarter?.id) {
        awayStats = await fetchPitcherSeasonStats(awayStarter.id, season);
        if (awayStats) awayStats.name = awayStarter.fullName ?? '';
      }

      results.push({
        gamePk: game.gamePk,
        homeTeamCode: homeCode,
        awayTeamCode: awayCode,
        homeStarter: homeStarter?.id ? {
          id: homeStarter.id,
          name: homeStarter.fullName ?? 'TBD',
          stats: homeStats,
        } : null,
        awayStarter: awayStarter?.id ? {
          id: awayStarter.id,
          name: awayStarter.fullName ?? 'TBD',
          stats: awayStats,
        } : null,
      });
    }
  }

  return results;
}

// ─── Full Sync Orchestrator ──────────────────────────
export interface SyncReport {
  syncedAt: string;
  teamsProcessed: number;
  playersAdded: number;
  playersUpdated: number;
  pitcherStatsUpdated: number;
  teamBattingUpdated: number;
  injuriesFound: number;
  errors: string[];
  duration: number;
}

export async function runFullMLBSync(date?: string): Promise<SyncReport> {
  const startTime = Date.now();
  const d = date || new Date().toISOString().split('T')[0];
  const season = parseInt(d.substring(0, 4), 10);

  const report: SyncReport = {
    syncedAt: new Date().toISOString(),
    teamsProcessed: 0,
    playersAdded: 0,
    playersUpdated: 0,
    pitcherStatsUpdated: 0,
    teamBattingUpdated: 0,
    injuriesFound: 0,
    errors: [],
    duration: 0,
  };

  // 1. Sync all team rosters
  console.log('[MLB Sync] Starting roster sync for all 30 teams...');
  for (const [code, mlbId] of Object.entries(MLB_TEAMS)) {
    try {
      const result = await syncTeamRoster(mlbId, code);
      report.playersAdded += result.playersAdded;
      report.playersUpdated += result.playersUpdated;
      report.teamsProcessed++;
      report.errors.push(...result.errors);
    } catch (err) {
      report.errors.push(`Roster sync ${code}: ${err}`);
    }
  }
  console.log(`[MLB Sync] Roster sync complete: ${report.playersAdded} added, ${report.playersUpdated} updated`);

  // 2. Fetch today's probable pitchers and their stats
  console.log('[MLB Sync] Fetching probable pitchers...');
  try {
    const pitchers = await fetchTodaysProbablePitchers(d);
    for (const game of pitchers) {
      // Update pitcher stats in DB
      for (const side of [game.homeStarter, game.awayStarter]) {
        if (side?.stats) {
          try {
            const dbPlayer = await prisma.player.findFirst({ where: { name: side.name } });
            if (dbPlayer) {
              await prisma.playerStat.upsert({
                where: { playerId_season: { playerId: dbPlayer.id, season } },
                create: {
                  playerId: dbPlayer.id,
                  season,
                  league: 'MLB',
                  era: side.stats.era,
                  strikeouts: side.stats.strikeouts,
                  wins: side.stats.wins,
                  saves: side.stats.saves,
                  gamesPlayed: side.stats.gamesStarted,
                },
                update: {
                  era: side.stats.era,
                  strikeouts: side.stats.strikeouts,
                  wins: side.stats.wins,
                  saves: side.stats.saves,
                  gamesPlayed: side.stats.gamesStarted,
                },
              });
              report.pitcherStatsUpdated++;
            }
          } catch (err) {
            report.errors.push(`Pitcher stat ${side.name}: ${err}`);
          }
        }
      }
    }
    console.log(`[MLB Sync] Pitcher stats updated: ${report.pitcherStatsUpdated}`);
  } catch (err) {
    report.errors.push(`Pitcher sync: ${err}`);
  }

  // 3. Fetch team batting stats
  console.log('[MLB Sync] Fetching team batting stats...');
  for (const [code, mlbId] of Object.entries(MLB_TEAMS)) {
    try {
      const batting = await fetchTeamBattingStats(mlbId, season);
      if (batting) {
        // Cache team batting in ApiCache for prediction engine to use
        await prisma.apiCache.upsert({
          where: { key: `mlb:batting:${code}:${season}` },
          create: {
            key: `mlb:batting:${code}:${season}`,
            data: JSON.stringify(batting),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          },
          update: {
            data: JSON.stringify(batting),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          }
        });
        report.teamBattingUpdated++;
      }
    } catch (err) {
      report.errors.push(`Batting ${code}: ${err}`);
    }
  }
  console.log(`[MLB Sync] Team batting updated: ${report.teamBattingUpdated}`);

  // 4. Fetch injuries
  console.log('[MLB Sync] Fetching injuries...');
  try {
    const injuries = await fetchMLBInjuries();
    report.injuriesFound = injuries.length;

    // Store injuries in ApiCache for prediction engine
    await prisma.apiCache.upsert({
      where: { key: `mlb:injuries:${d}` },
      create: {
        key: `mlb:injuries:${d}`,
        data: JSON.stringify(injuries),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h
      },
      update: {
        data: JSON.stringify(injuries),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      }
    });
    console.log(`[MLB Sync] Injuries found: ${report.injuriesFound}`);
  } catch (err) {
    report.errors.push(`Injuries: ${err}`);
  }

  // 5. Store probable pitchers data in cache for engine
  console.log('[MLB Sync] Caching probable pitchers for engine...');
  try {
    const pitchers = await fetchTodaysProbablePitchers(d);
    await prisma.apiCache.upsert({
      where: { key: `mlb:pitchers:${d}` },
      create: {
        key: `mlb:pitchers:${d}`,
        data: JSON.stringify(pitchers),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6h
      },
      update: {
        data: JSON.stringify(pitchers),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    });
  } catch (err) {
    report.errors.push(`Pitcher cache: ${err}`);
  }

  // 6. Store last sync timestamp
  await prisma.apiCache.upsert({
    where: { key: 'mlb:lastSync' },
    create: {
      key: 'mlb:lastSync',
      data: JSON.stringify({ syncedAt: report.syncedAt, date: d }),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    update: {
      data: JSON.stringify({ syncedAt: report.syncedAt, date: d }),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }
  });

  report.duration = Date.now() - startTime;
  console.log(`[MLB Sync] ✅ Full sync complete in ${(report.duration / 1000).toFixed(1)}s`);
  return report;
}
