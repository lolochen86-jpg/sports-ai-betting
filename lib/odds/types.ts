export type Sport = 'basketball_nba' | 'baseball_mlb';
export type OddsFormat = 'american' | 'decimal';

export interface Outcome {
  name: string;
  price: number;
  point?: number;
}

export interface Market {
  key: string;
  last_update?: string;
  outcomes: Outcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface EVResult {
  gameId: string;
  recommendedSide: 'home' | 'away';
  aiWinProbability: number;
  bestOdds: number;
  edge: number;
  evRoi: number;
  kellyFraction: number;
  grade: 'A+' | 'A' | 'B' | 'skip';
}
