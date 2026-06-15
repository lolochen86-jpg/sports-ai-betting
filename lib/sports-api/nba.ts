import { apiCache, CacheTTL } from './cache';
import { getTeamNameCn } from './team-translations';
import type { TeamInfo, GameWithTeams, PlayerInfo, GameStatus } from '@/types/sports';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// ─── Status mapping ───

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapNBAStatus(statusName: string, statusId: any): GameStatus {
  // statusId: 1=Scheduled, 2=In Progress, 3=Final
  const id = Number(statusId);
  if (id === 3) return 'completed';
  if (id === 2) return 'live';
  const s = statusName.toLowerCase();
  if (s.includes('postponed')) return 'postponed';
  if (s.includes('canceled') || s.includes('cancelled')) return 'cancelled';
  return 'scheduled';
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Teams ───

export async function fetchNBATeams(): Promise<TeamInfo[]> {
  const cacheKey = 'nba:teams';
  const cached = apiCache.get<TeamInfo[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${ESPN_BASE}/teams`, { next: { revalidate: CacheTTL.TEAMS } });
  if (!res.ok) throw new Error(`ESPN NBA Teams API error: ${res.status}`);

  const json = await res.json();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rawTeams = json.sports?.[0]?.leagues?.[0]?.teams ?? [];

  const teams: TeamInfo[] = rawTeams.map((entry: any): TeamInfo => {
    const t = entry.team;
    return {
      id: String(t.id),
      name: t.displayName ?? t.name ?? '',
      code: t.abbreviation ?? '',
      city: t.location ?? '',
      logo: t.logos?.[0]?.href,
      nameCn: getTeamNameCn(t.abbreviation ?? '', 'NBA'),
    };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  apiCache.set(cacheKey, teams, CacheTTL.TEAMS);
  return teams;
}

// ─── Scoreboard / Games ───

export async function fetchNBAGames(date?: string, bypassCache = false): Promise<GameWithTeams[]> {
  // ESPN expects dates in YYYYMMDD format
  const d = date || new Date().toISOString().split('T')[0];
  const dateParam = d.replace(/-/g, '');
  const cacheKey = `nba:games:${d}`;
  const cached = apiCache.get<GameWithTeams[]>(cacheKey);
  if (cached && !bypassCache) return cached;

  const fetchOptions: RequestInit = bypassCache
    ? { cache: 'no-store' }
    : { next: { revalidate: CacheTTL.GAMES } };

  const url = bypassCache
    ? `${ESPN_BASE}/scoreboard?dates=${dateParam}&_t=${Date.now()}`
    : `${ESPN_BASE}/scoreboard?dates=${dateParam}`;

  const res = await fetch(url, fetchOptions);
  if (!res.ok) throw new Error(`ESPN NBA Scoreboard API error: ${res.status}`);

  const json = await res.json();
  const events = json.events ?? [];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const games: GameWithTeams[] = events.map((event: any): GameWithTeams => {
    const comp = event.competitions?.[0];
    // ESPN: competitors[0] is typically the home team (homeAway === 'home')
    const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home') ?? comp?.competitors?.[0];
    const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away') ?? comp?.competitors?.[1];

    const homeTeam = homeComp?.team ?? {};
    const awayTeam = awayComp?.team ?? {};

    const statusType = comp?.status?.type ?? {};

    return {
      id: String(event.id),
      league: 'NBA',
      homeTeam: {
        id: String(homeTeam.id ?? ''),
        name: homeTeam.displayName ?? homeTeam.name ?? '',
        code: homeTeam.abbreviation ?? '',
        city: homeTeam.location ?? '',
        logo: homeTeam.logo ?? homeTeam.logos?.[0]?.href,
        nameCn: getTeamNameCn(homeTeam.abbreviation ?? '', 'NBA'),
        record: homeComp?.records?.[0]?.summary,
      },
      awayTeam: {
        id: String(awayTeam.id ?? ''),
        name: awayTeam.displayName ?? awayTeam.name ?? '',
        code: awayTeam.abbreviation ?? '',
        city: awayTeam.location ?? '',
        logo: awayTeam.logo ?? awayTeam.logos?.[0]?.href,
        nameCn: getTeamNameCn(awayTeam.abbreviation ?? '', 'NBA'),
        record: awayComp?.records?.[0]?.summary,
      },
      gameDate: event.date ?? '',
      venue: comp?.venue?.fullName ?? comp?.venue?.address?.city ?? '',
      status: mapNBAStatus(statusType.name ?? '', statusType.id ?? 1),
      homeScore: homeComp?.score != null ? Number(homeComp.score) : null,
      awayScore: awayComp?.score != null ? Number(awayComp.score) : null,
    };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  apiCache.set(cacheKey, games, CacheTTL.GAMES);
  return games;
}

// ─── Roster / Players ───

export async function fetchNBARoster(teamId: string): Promise<PlayerInfo[]> {
  const cacheKey = `nba:roster:${teamId}`;
  const cached = apiCache.get<PlayerInfo[]>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${ESPN_BASE}/teams/${teamId}?enable=roster`);
  if (!res.ok) throw new Error(`ESPN NBA Roster API error: ${res.status}`);

  const json = await res.json();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const teamData = json.team ?? {};
  const athletes = teamData.athletes ?? [];
  const teamCode = teamData.abbreviation ?? '';

  const players: PlayerInfo[] = athletes.map((a: any): PlayerInfo => ({
    id: String(a.id ?? ''),
    name: a.displayName ?? a.fullName ?? '',
    position: a.position?.abbreviation ?? a.position?.name ?? '',
    number: a.jersey ? parseInt(a.jersey, 10) : null,
    height: a.displayHeight,
    weight: a.displayWeight ? parseInt(a.displayWeight, 10) : undefined,
    teamId: teamId,
    teamCode: teamCode,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  apiCache.set(cacheKey, players, CacheTTL.PLAYERS);
  return players;
}
