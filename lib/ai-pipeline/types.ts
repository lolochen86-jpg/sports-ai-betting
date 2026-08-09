/**
 * lib/ai-pipeline/types.ts
 * 三位 AI 協作預測報告流程 — 共用型別定義
 */

export interface DataCheckItem {
  field: string;           // 資料欄位名稱
  label: string;           // 中文標籤
  status: 'ok' | 'missing' | 'degraded';
  value?: unknown;         // 實際取得的值
  reason?: string;         // 缺少/降級原因
  fallback?: string;       // 降級替代方案
}

export interface GameAuditData {
  gameId: string;
  league: 'MLB' | 'NBA';
  gameDate: string;        // ISO date string
  homeTeam: { code: string; name: string; nameCn: string };
  awayTeam: { code: string; name: string; nameCn: string };
  venue: string;

  // 已核對的資料項
  checks: DataCheckItem[];
  completeness: number;    // 0-100 百分比

  // 彙整後的乾淨資料
  data: {
    homePitcher: PitcherAuditInfo | null;
    awayPitcher: PitcherAuditInfo | null;
    homeRecentScores: number[];
    awayRecentScores: number[];
    homeRecord: string;
    awayRecord: string;
    homeStreak: number;
    awayStreak: number;
    parkFactor: { runFactor: number; category: string; description: string } | null;
    weather: WeatherAuditInfo | null;
    restTravel: { homeRestDays: number; awayRestDays: number; homeFatigue: string; awayFatigue: string } | null;
    injuries: { home: string[]; away: string[] };
    h2h: { homeWins: number; awayWins: number; totalGames: number } | null;
  };
}

export interface PitcherAuditInfo {
  name: string;
  nameCn?: string;
  era: number;
  whip: number;
  recentEra?: number;
  recentFormSummary?: string;
  statusLabel?: string;
}

export interface WeatherAuditInfo {
  tempC: number;
  humidity: number;
  windSpeedKph: number;
  windDirection: string;
  condition: string;
  isIndoor: boolean;
  description: string;
}

export interface DataAuditReport {
  targetDate: string;       // YYYY-MM-DD
  generatedAt: string;      // ISO datetime
  totalGames: number;
  games: GameAuditData[];
  summary: {
    fullyComplete: number;
    partiallyComplete: number;
    averageCompleteness: number;
    missingItems: string[];
  };
}

// ─── AI② 報告分析員型別 ───

export interface GamePredictionReport {
  gameId: string;
  league: 'MLB' | 'NBA';
  homeTeam: { code: string; name: string; nameCn: string };
  awayTeam: { code: string; name: string; nameCn: string };
  venue: string;
  gameDate: string;

  prediction: {
    winner: 'home' | 'away';
    winnerTeamName: string;
    confidence: number;
    ouPick: 'Over' | 'Under';
    ouLine: number;
    predictedTotal: number;
    homeExpectedScore: number;
    awayExpectedScore: number;
  };

  reasoning: ReasoningSection[];

  modelBreakdown: {
    modelName: string;
    winner: 'home' | 'away';
    confidence: number;
    homeScore: number;
    awayScore: number;
  }[];
}

export interface ReasoningSection {
  icon: string;           // emoji icon
  category: string;       // e.g. '先發投手對決'
  explanation: string;    // 詳細說明
  impact: 'positive' | 'negative' | 'neutral';
  impactTeam?: 'home' | 'away';
}

export interface PredictionReportBundle {
  targetDate: string;
  generatedAt: string;
  totalGames: number;
  games: GamePredictionReport[];
  overallSummary: string;
}

// ─── AI③ 美編設計師型別 ───

export interface ImageGenerationResult {
  predictionImagePath: string;    // 預測圖片路徑
  resultImagePath?: string;       // 賽後結果圖片路徑
  width: number;
  height: number;
}

export interface GameResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  status: 'completed' | 'live' | 'scheduled';
  winnerCorrect?: boolean;
  ouCorrect?: boolean;
}

// ─── 流程調度器型別 ───

export interface PipelineStatus {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: 'audit' | 'report' | 'image' | 'done' | null;
  targetDate: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  auditReport?: DataAuditReport;
  predictionReport?: PredictionReportBundle;
  imageResult?: ImageGenerationResult;
}
