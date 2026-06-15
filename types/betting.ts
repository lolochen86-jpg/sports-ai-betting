// ─── Betting Mode Type Definitions ───

export type MarketType = 'moneyline' | 'spread' | 'totals' | 'period_highest';
export type BetStatus = 'pending' | 'won' | 'lost' | 'void' | 'cancelled';
export type RecommendationStatus = 'recommended' | 'accepted' | 'rejected' | 'expired';
export type OddsSource = 'manual' | 'csv';
export type ModelSource = 'MetaModel' | 'SportsAI' | 'EloRating' | 'MonteCarlo';

// ─── Taiwan Odds ───

export interface TaiwanOdds {
  id: string;
  gameExternalId: string;
  league: 'NBA' | 'MLB';
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  marketType: MarketType;
  selection: string;          // e.g. 'home', 'away', 'over', 'under', '第5局', '一樣多'
  taiwanOdds: number;         // e.g. 1.85
  line?: number | null;       // e.g. -3.5 for spread, 8.5 for totals
  impliedProbability: number; // = 1 / taiwanOdds
  source: OddsSource;
  importedAt: string;
}

export interface OddsImportRow {
  league: 'NBA' | 'MLB';
  gameDate: string;
  homeTeam: string;
  awayTeam: string;
  marketType: MarketType;
  selection: string;
  taiwanOdds: number;
  line?: number | null;
}

// ─── Model Prediction Snapshot ───

export interface ModelPredictionSnapshot {
  id: string;
  gameExternalId: string;
  league: 'NBA' | 'MLB';
  model: ModelSource;
  predictedWinner: 'home' | 'away';
  confidence: number;
  homeProb: number;
  awayProb: number;
  homeExpectedScore: number;
  awayExpectedScore: number;
  ouPick: 'Over' | 'Under';
  ouLine: number;
  createdAt: string;
}

// ─── Edge Signal ───

export interface EdgeSignal {
  id: string;
  oddsId: string;
  odds: TaiwanOdds;
  modelPredId: string;
  modelPrediction: ModelPredictionSnapshot;
  modelProbability: number;
  fairOdds: number;            // = 1 / modelProbability
  expectedValue: number;       // = modelProbability * taiwanOdds - 1
  edgePercent: number;         // = expectedValue * 100
  confidenceScore: number;     // 0-100
  isPositiveEdge: boolean;
  modelSource: ModelSource;
}

// ─── Rule Check ───

export interface RuleCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface RuleCheckResult {
  passed: boolean;
  checks: RuleCheck[];
}

// ─── Bet Ticket ───

export interface BetLeg {
  id?: string;
  gameExternalId: string;
  league: 'NBA' | 'MLB';
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  marketType: MarketType;
  selection: string;
  odds: number;
  line?: number | null;
  result?: BetStatus;
}

export interface BetTicketDraft {
  legs: BetLeg[];
  stake: number;              // 投注金額 (以 10 元為單位)
  parlayOdds: number;         // 組合賠率 = 各腿賠率相乘
  estimatedPayout: number;    // = stake * parlayOdds
}

export interface BetTicket extends BetTicketDraft {
  id: string;
  date: string;
  status: BetStatus;
  fromRecommendationId?: string | null;
  actualResult?: BetStatus;
  actualPayout: number;
  profitLoss: number;
  notes?: string;
  createdAt: string;
}

// ─── Bet Recommendation ───

export interface BetRecommendation {
  id: string;
  date: string;
  legs: BetLeg[];
  edges: EdgeSignal[];
  totalStake: number;          // 100 元
  parlayLegs: number;          // 過關數
  parlayOdds: number;
  estimatedPayout: number;
  ruleCheckPassed: boolean;
  ruleCheckDetails: RuleCheckResult;
  status: RecommendationStatus;
  createdAt: string;
}

// ─── Daily Budget ───

export interface DailyBudget {
  date: string;
  totalBudget: number;         // 預設 200
  spent: number;
  remaining: number;
  maxTickets: number;          // 預設 2
  ticketsUsed: number;
  stakePerTicket: number;      // 預設 100
}

// ─── Strategy Settings ───

export interface StrategySettings {
  bookmakerMode: 'taiwan' | 'international';
  dailyBudget: number;
  maxTicketsPerDay: number;
  stakePerTicket: number;
  minExpectedValue: number;    // 預設 0 (正 EV 即推薦)
  minConfidence: number;       // 預設 75
  modelWeights: {
    MetaModel: number;
    SportsAI: number;
    EloRating: number;
    MonteCarlo: number;
  };
  preferredParlaySize: number; // 預設 1 (單場)
  maxParlaySize: number;       // 預設 12
}

export const DEFAULT_STRATEGY: StrategySettings = {
  bookmakerMode: 'international',
  dailyBudget: 200,
  maxTicketsPerDay: 20,
  stakePerTicket: 10,
  minExpectedValue: 0,
  minConfidence: 75,
  modelWeights: {
    MetaModel: 0.40,
    SportsAI: 0.25,
    EloRating: 0.15,
    MonteCarlo: 0.20,
  },
  preferredParlaySize: 1,
  maxParlaySize: 12,
};

// ─── Profit / Loss Summary ───

export interface ProfitLossSummary {
  totalInvested: number;
  totalReturned: number;
  netProfitLoss: number;
  roi: number;                 // = netProfitLoss / totalInvested * 100
  totalBets: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;             // = wins / (wins + losses) * 100
}

export interface MyBet {
  id: string;
  ticketId: string;
  actualResult: BetStatus;
  actualPayout: number;
  profitLoss: number;
  createdAt: string;
}

// ─── Mistake Log ───

export interface MistakeLog {
  id: string;
  date: string;
  ticketId?: string | null;
  category: 'tilt' | 'overbet' | 'chasing' | 'ignore_edge' | 'other';
  description: string;
  lesson: string;
  createdAt: string;
}

// ─── API Response Types ───

export interface BettingApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  error?: string;
}
