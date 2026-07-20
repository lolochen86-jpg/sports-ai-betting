import { apiCache, CacheTTL } from './cache';
import { getTeamNameCn } from './team-translations';
import type { TeamInfo, GameWithTeams, PlayerInfo, GameStatus } from '@/types/sports';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

// ─── Status mapping ───

function mapMLBStatus(detailedState: string): GameStatus {
  const s = detailedState.toLowerCase();
  if (s === 'final' || s === 'game over' || s === 'completed early') return 'completed';
  if (s === 'in progress' || s === 'warmup' || s === 'manager challenge') return 'live';
  if (s === 'postponed' || s === 'suspended') return 'postponed';
  if (s === 'cancelled') return 'cancelled';
  return 'scheduled';
}

// ─── Teams ───

export async function fetchMLBTeams(): Promise<TeamInfo[]> {
  const cacheKey = 'mlb:teams';
  const cached = apiCache.get<TeamInfo[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${MLB_BASE}/teams?sportId=1`, { next: { revalidate: CacheTTL.TEAMS } });
  if (!res.ok) throw new Error(`MLB Teams API error: ${res.status}`);

  const json = await res.json();

  const teams: TeamInfo[] = (json.teams ?? [])
    .filter((t: Record<string, unknown>) => t.active === true)
    .map((t: Record<string, unknown>): TeamInfo => ({
      id: String(t.id),
      name: t.name as string,
      code: t.abbreviation as string,
      city: t.locationName as string,
      logo: `https://midfield.mlbstatic.com/content/meta/team-logo/official/${t.id}`,
      nameCn: getTeamNameCn(t.abbreviation as string, 'MLB'),
    }));

  apiCache.set(cacheKey, teams, CacheTTL.TEAMS);
  return teams;
}

// ─── Games / Schedule ───

export async function fetchMLBGames(date?: string, bypassCache = false): Promise<GameWithTeams[]> {
  const d = date || new Date().toISOString().split('T')[0];
  const cacheKey = `mlb:games:${d}`;
  const cached = apiCache.get<GameWithTeams[]>(cacheKey);
  if (cached && !bypassCache) return cached;

  // Fetch teams for name resolution
  const teams = await fetchMLBTeams();
  const teamMap = new Map(teams.map(t => [t.id, t]));

  const fetchOptions: RequestInit = bypassCache
    ? { cache: 'no-store' }
    : { next: { revalidate: CacheTTL.GAMES } };

  const url = bypassCache
    ? `${MLB_BASE}/schedule?sportId=1&date=${d}&hydrate=linescore,venue&_t=${Date.now()}`
    : `${MLB_BASE}/schedule?sportId=1&date=${d}&hydrate=linescore,venue`;

  const res = await fetch(url, fetchOptions);
  if (!res.ok) throw new Error(`MLB Schedule API error: ${res.status}`);

  const json = await res.json();
  const dates = json.dates ?? [];
  if (dates.length === 0) {
    apiCache.set(cacheKey, [], CacheTTL.GAMES);
    return [];
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const games: GameWithTeams[] = (dates[0].games ?? []).map((g: any): GameWithTeams => {
    const homeId = String(g.teams?.home?.team?.id ?? '');
    const awayId = String(g.teams?.away?.team?.id ?? '');
    const homeTeamInfo = teamMap.get(homeId);
    const awayTeamInfo = teamMap.get(awayId);

    const homeRecord = g.teams?.home?.leagueRecord;
    const awayRecord = g.teams?.away?.leagueRecord;

    return {
      id: String(g.gamePk),
      league: 'MLB',
      homeTeam: {
        id: homeId,
        name: (g.teams?.home?.team?.name as string) ?? 'Unknown',
        code: homeTeamInfo?.code ?? '',
        city: homeTeamInfo?.city ?? '',
        logo: homeTeamInfo?.logo,
        nameCn: homeTeamInfo?.nameCn,
        record: homeRecord ? `${homeRecord.wins}-${homeRecord.losses}` : undefined,
      },
      awayTeam: {
        id: awayId,
        name: (g.teams?.away?.team?.name as string) ?? 'Unknown',
        code: awayTeamInfo?.code ?? '',
        city: awayTeamInfo?.city ?? '',
        logo: awayTeamInfo?.logo,
        nameCn: awayTeamInfo?.nameCn,
        record: awayRecord ? `${awayRecord.wins}-${awayRecord.losses}` : undefined,
      },
      gameDate: g.gameDate ?? '',
      venue: g.venue?.name ?? '',
      status: mapMLBStatus(g.status?.detailedState ?? 'Scheduled'),
      homeScore: g.teams?.home?.score ?? null,
      awayScore: g.teams?.away?.score ?? null,
    };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  apiCache.set(cacheKey, games, CacheTTL.GAMES);
  return games;
}

// ─── Roster / Players ───

export async function fetchMLBRoster(teamId: string): Promise<PlayerInfo[]> {
  const cacheKey = `mlb:roster:${teamId}`;
  const cached = apiCache.get<PlayerInfo[]>(cacheKey);
  if (cached) return cached;

  // Get team abbreviation for response
  const teams = await fetchMLBTeams();
  const team = teams.find(t => t.id === teamId);

  const res = await fetch(`${MLB_BASE}/teams/${teamId}/roster?rosterType=active`);
  if (!res.ok) throw new Error(`MLB Roster API error: ${res.status}`);

  const json = await res.json();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const players: PlayerInfo[] = (json.roster ?? []).map((p: any): PlayerInfo => ({
    id: String(p.person?.id ?? ''),
    name: p.person?.fullName ?? '',
    position: p.position?.name ?? p.position?.abbreviation ?? '',
    number: p.jerseyNumber ? parseInt(p.jerseyNumber, 10) : null,
    teamId: teamId,
    teamCode: team?.code ?? '',
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  apiCache.set(cacheKey, players, CacheTTL.PLAYERS);
  return players;
}

// ─── Player Season Stats ───

export interface PlayerSeasonStats {
  playerId: string;
  name: string;
  position: string;
  teamCode: string;
  season: number;
  // Batting
  battingAvg?: number;
  ops?: number;
  homeRuns?: number;
  rbis?: number;
  stolenBases?: number;
  // Pitching
  era?: number;
  whip?: number;
  wins?: number;
  losses?: number;
  strikeouts?: number;
  saves?: number;
  inningsPitched?: number;
  gamesStarted?: number;
}

export async function fetchMLBPlayerStats(playerId: string, season?: number): Promise<PlayerSeasonStats | null> {
  const s = season || new Date().getFullYear();
  const cacheKey = `mlb:stats:${playerId}:${s}`;
  const cached = apiCache.get<PlayerSeasonStats>(cacheKey);
  if (cached) return cached;

  try {
    // First, get player info
    const personRes = await fetch(`${MLB_BASE}/people/${playerId}?hydrate=stats(group=[hitting,pitching],type=season,season=${s})`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!personRes.ok) return null;

    const personJson = await personRes.json();
    const person = personJson.people?.[0];
    if (!person) return null;

    const result: PlayerSeasonStats = {
      playerId,
      name: person.fullName ?? '',
      position: person.primaryPosition?.abbreviation ?? '',
      teamCode: '',
      season: s,
    };

    // Parse stats groups
    for (const statGroup of person.stats ?? []) {
      const group = statGroup.group?.displayName;
      const splits = statGroup.splits ?? [];
      if (!splits.length) continue;
      const stat = splits[0].stat;

      if (group === 'hitting') {
        result.battingAvg = parseFloat(stat.avg ?? '0');
        result.ops = parseFloat(stat.ops ?? '0');
        result.homeRuns = parseInt(stat.homeRuns ?? '0', 10);
        result.rbis = parseInt(stat.rbi ?? '0', 10);
        result.stolenBases = parseInt(stat.stolenBases ?? '0', 10);
      }

      if (group === 'pitching') {
        result.era = parseFloat(stat.era ?? '0');
        result.whip = parseFloat(stat.whip ?? '0');
        result.wins = parseInt(stat.wins ?? '0', 10);
        result.losses = parseInt(stat.losses ?? '0', 10);
        result.strikeouts = parseInt(stat.strikeOuts ?? '0', 10);
        result.saves = parseInt(stat.saves ?? '0', 10);
        result.gamesStarted = parseInt(stat.gamesStarted ?? '0', 10);
        const ipStr = stat.inningsPitched ?? '0';
        const parts = ipStr.split('.');
        result.inningsPitched = parseInt(parts[0] || '0', 10) + (parseInt(parts[1] || '0', 10) / 3);
      }
    }

    apiCache.set(cacheKey, result, CacheTTL.PLAYERS);
    return result;
  } catch {
    return null;
  }
}

// ─── Probable Pitchers for Today ───

export interface ProbablePitcherSummary {
  gamePk: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homePitcher?: { id: string; name: string; era?: number; whip?: number; record?: string };
  awayPitcher?: { id: string; name: string; era?: number; whip?: number; record?: string };
}

export async function fetchMLBProbablePitchers(date?: string): Promise<ProbablePitcherSummary[]> {
  const d = date || new Date().toISOString().split('T')[0];
  const cacheKey = `mlb:probable:${d}`;
  const cached = apiCache.get<ProbablePitcherSummary[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${MLB_BASE}/schedule?sportId=1&date=${d}&hydrate=probablePitcher(note),team`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }
    );
    if (!res.ok) return [];

    const json = await res.json();
    const results: ProbablePitcherSummary[] = [];

    for (const dateEntry of json.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const homeTeam = game.teams?.home?.team;
        const awayTeam = game.teams?.away?.team;
        const hp = game.teams?.home?.probablePitcher;
        const ap = game.teams?.away?.probablePitcher;

        results.push({
          gamePk: String(game.gamePk),
          homeTeamCode: homeTeam?.abbreviation ?? '',
          awayTeamCode: awayTeam?.abbreviation ?? '',
          homePitcher: hp ? {
            id: String(hp.id),
            name: hp.fullName ?? 'TBD',
            era: hp.pitchHand ? undefined : undefined, // stats loaded separately
          } : undefined,
          awayPitcher: ap ? {
            id: String(ap.id),
            name: ap.fullName ?? 'TBD',
          } : undefined,
        });
      }
    }

    apiCache.set(cacheKey, results, 1800); // 30min cache
    return results;
  } catch {
    return [];
  }
}
