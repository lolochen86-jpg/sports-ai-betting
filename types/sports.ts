export type League = 'MLB' | 'NBA';
export type GameStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled';
export type PredictionWinner = 'home' | 'away' | 'tie';

// ─── Database-oriented types (Prisma model mirrors) ───

export interface Team {
  id: number;
  league: League;
  name: string;
  code: string;
  city: string;
  state?: string;
  logo?: string;
  establishedYear?: number;
}

export interface Player {
  id: number;
  teamId: number;
  name: string;
  position: string;
  number?: number;
  height?: string;
  weight?: number;
  dateOfBirth?: Date;
  nationality?: string;
  imageUrl?: string;
}

export interface Game {
  id: number;
  league: League;
  externalId?: string;
  homeTeamId: number;
  awayTeamId: number;
  gameDate: Date;
  season: number;
  status: GameStatus;
  homeScore?: number;
  awayScore?: number;
  homeOdds?: number;
  awayOdds?: number;
  venue?: string;
  attendance?: number;
  duration?: string;
}

export interface Prediction {
  id: number;
  gameId: number;
  predictedWinner: PredictionWinner;
  confidence: number;
  modelVersion: string;
  reasoningFactors?: string;
  isCorrect?: boolean;
  accuracy?: number;
}

// ─── API Response DTOs (for frontend consumption) ───

/** Lightweight team info embedded within game responses */
export interface TeamInfo {
  id: string;
  name: string;
  code: string;
  city: string;
  logo?: string;
  record?: string;
  /** Chinese translated name */
  nameCn?: string;
  avgPoints?: number;
}

/** Full game DTO with embedded team details (no foreign key IDs) */
export interface GameWithTeams {
  id: string;
  league: League;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  gameDate: string;
  venue: string;
  status: GameStatus;
  homeScore: number | null;
  awayScore: number | null;
}

/** Player DTO for roster responses */
export interface PlayerInfo {
  id: string;
  name: string;
  position: string;
  number: number | null;
  height?: string;
  weight?: number;
  teamId: string;
  teamCode: string;
}

/** Standardized API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    league?: League | 'ALL';
    date?: string;
    count: number;
    cached: boolean;
  };
  error?: string;
}
