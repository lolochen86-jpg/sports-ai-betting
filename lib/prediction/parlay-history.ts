/**
 * 智慧三關歷史結算與驗證引擎 (Smart Parlay History & Verification Engine)
 * 
 * Generates historical smart parlays from past completed games, settles them
 * against actual results, and computes aggregate accuracy statistics.
 */

import realGames from './real_historical_games.json';
import { 
  calculateWinProbability, 
  calculateEloProbability, 
  calculateMonteCarloProbability,
  type TeamRecentStats 
} from './stats';
import { getTeamNameCnAny } from '@/lib/sports-api/team-translations';

export interface RawHistoricalGame {
  id: string;
  league: 'NBA' | 'MLB';
  date: string;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
}

// ─── Deterministic Hash ───
function getHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ─── Fallback Stats for historical backtesting ───
function getFallbackStats(teamCode: string, league: 'NBA' | 'MLB', dateStr: string): TeamRecentStats {
  const hash = getHash(teamCode + dateStr);
  const isNBA = league === 'NBA';
  const wins = 2 + (hash % 4);
  const losses = 5 - wins;
  const baseScore = isNBA ? 106 + (hash % 15) : 3.8 + (hash % 6) * 0.7;
  const baseConceded = isNBA ? 104 + ((hash + 3) % 15) : 3.5 + ((hash + 3) % 6) * 0.7;
  const streak = wins >= 3 ? (wins - 1) : -(losses - 1);
  return {
    wins,
    losses,
    averagePointsScored: Number(baseScore.toFixed(1)),
    averagePointsConceded: Number(baseConceded.toFixed(1)),
    streak: streak === 0 ? (wins >= 3 ? 1 : -1) : streak
  };
}

// ─── Types ───

export interface ParlayHistoryLeg {
  gameId: string;
  homeTeam: { code: string; nameCn: string };
  awayTeam: { code: string; nameCn: string };
  pick: 'home' | 'away';
  pickTeamName: string;
  consensusCount: number;
  avgConfidence: number;
  models: {
    SportsAI: 'home' | 'away';
    EloRating: 'home' | 'away';
    MonteCarlo: 'home' | 'away';
    MetaModel: 'home' | 'away';
  };
  // Settlement data
  homeScore: number;
  awayScore: number;
  actualWinner: 'home' | 'away';
  isHit: boolean; // Did the pick match the actual winner?
}

export interface ParlayHistoryEntry {
  id: number;
  date: string;
  league: 'NBA' | 'MLB' | 'ALL';
  legs: ParlayHistoryLeg[];
  grade: 'S' | 'A' | 'B';
  combinedProb: number;
  // Settlement
  legsHit: number;       // How many legs were correct
  totalLegs: number;     // Total legs in parlay
  isPerfectHit: boolean;  // All legs correct = 全過通關
  resultLabel: string;    // '🎯 3關全過' or '❌ 過關中斷 (2/3)' etc.
}

export interface ParlayHistoryStats {
  totalParlays: number;
  perfectHits: number;         // 全過通關次數
  perfectHitRate: number;      // 全過通關率 (%)
  totalLegs: number;
  totalLegsHit: number;
  singleLegHitRate: number;    // 單關累積勝率 (%)
  gradeS: { total: number; hits: number; rate: number };
  gradeA: { total: number; hits: number; rate: number };
  gradeB: { total: number; hits: number; rate: number };
  // Recent form
  last10Parlays: ParlayHistoryEntry[];
  last10PerfectRate: number;
  // By league
  mlbStats: { total: number; hits: number; rate: number; legRate: number };
  nbaStats: { total: number; hits: number; rate: number; legRate: number };
}

export interface ParlayHistoryResult {
  entries: ParlayHistoryEntry[];
  stats: ParlayHistoryStats;
}

// ─── Core Settlement Engine ───

function generateAndSettleParlaysForDate(
  gamesOnDate: RawHistoricalGame[],
  dateStr: string
): ParlayHistoryEntry[] {
  if (gamesOnDate.length < 2) return [];

  interface LegCandidate {
    game: RawHistoricalGame;
    pick: 'home' | 'away';
    consensusCount: number;
    avgConfidence: number;
    models: {
      SportsAI: 'home' | 'away';
      EloRating: 'home' | 'away';
      MonteCarlo: 'home' | 'away';
      MetaModel: 'home' | 'away';
    };
  }

  const candidates: LegCandidate[] = [];

  for (const game of gamesOnDate) {
    const homeStats = getFallbackStats(game.homeCode, game.league, dateStr);
    const awayStats = getFallbackStats(game.awayCode, game.league, dateStr);

    // Model 1: SportsAI
    const sportsResult = calculateWinProbability(homeStats, awayStats, game.league);
    const sportsWinner: 'home' | 'away' = sportsResult.homeProbability >= sportsResult.awayProbability ? 'home' : 'away';
    const sportsConf = sportsWinner === 'home' ? sportsResult.homeProbability : sportsResult.awayProbability;

    // Model 2: Elo
    const eloResult = calculateEloProbability(homeStats, awayStats, game.league);
    const eloWinner: 'home' | 'away' = eloResult.homeProbability >= eloResult.awayProbability ? 'home' : 'away';
    const eloConf = eloWinner === 'home' ? eloResult.homeProbability : eloResult.awayProbability;

    // Model 3: MonteCarlo
    const mcResult = calculateMonteCarloProbability(homeStats, awayStats, game.id, game.league);
    const mcWinner: 'home' | 'away' = mcResult.homeProbability >= mcResult.awayProbability ? 'home' : 'away';
    const mcConf = mcWinner === 'home' ? mcResult.homeProbability : mcResult.awayProbability;

    // Model 4: MetaModel (weighted ensemble)
    const metaHome = (sportsResult.homeProbability * 0.25 + eloResult.homeProbability * 0.25 + mcResult.homeProbability * 0.50);
    const metaWinner: 'home' | 'away' = metaHome >= 50 ? 'home' : 'away';
    const metaConf = metaWinner === 'home' ? metaHome : (100 - metaHome);

    const picks = {
      SportsAI: sportsWinner,
      EloRating: eloWinner,
      MonteCarlo: mcWinner,
      MetaModel: metaWinner,
    };

    // Count consensus
    let homeVotes = 0;
    let awayVotes = 0;
    Object.values(picks).forEach(w => {
      if (w === 'home') homeVotes++;
      else awayVotes++;
    });

    const pick: 'home' | 'away' = homeVotes >= awayVotes ? 'home' : 'away';
    const consensusCount = pick === 'home' ? homeVotes : awayVotes;

    let confSum = 0;
    let confCount = 0;
    if (picks.SportsAI === pick) { confSum += sportsConf; confCount++; }
    if (picks.EloRating === pick) { confSum += eloConf; confCount++; }
    if (picks.MonteCarlo === pick) { confSum += mcConf; confCount++; }
    if (picks.MetaModel === pick) { confSum += metaConf; confCount++; }
    const avgConfidence = confCount > 0 ? confSum / confCount : 50;

    if (consensusCount >= 2) {
      candidates.push({
        game,
        pick,
        consensusCount,
        avgConfidence,
        models: picks,
      });
    }
  }

  // Sort by consensus then confidence
  candidates.sort((a, b) => {
    if (b.consensusCount !== a.consensusCount) return b.consensusCount - a.consensusCount;
    return b.avgConfidence - a.avgConfidence;
  });

  // Group into 3-leg parlays
  const entries: ParlayHistoryEntry[] = [];
  let parlayId = 1;

  for (let i = 0; i < candidates.length; i += 3) {
    const group = candidates.slice(i, i + 3);
    if (group.length < 2) continue; // Need at least 2 legs

    const legs: ParlayHistoryLeg[] = group.map(c => {
      const actualWinner: 'home' | 'away' = c.game.homeScore > c.game.awayScore ? 'home' : 'away';
      const isHit = c.pick === actualWinner;
      const pickTeamName = c.pick === 'home'
        ? (getTeamNameCnAny(c.game.homeCode) || c.game.homeName)
        : (getTeamNameCnAny(c.game.awayCode) || c.game.awayName);

      return {
        gameId: c.game.id,
        homeTeam: { code: c.game.homeCode, nameCn: getTeamNameCnAny(c.game.homeCode) || c.game.homeName },
        awayTeam: { code: c.game.awayCode, nameCn: getTeamNameCnAny(c.game.awayCode) || c.game.awayName },
        pick: c.pick,
        pickTeamName,
        consensusCount: c.consensusCount,
        avgConfidence: Number(c.avgConfidence.toFixed(1)),
        models: c.models,
        homeScore: c.game.homeScore,
        awayScore: c.game.awayScore,
        actualWinner,
        isHit,
      };
    });

    const legsHit = legs.filter(l => l.isHit).length;
    const totalLegs = legs.length;
    const isPerfectHit = legsHit === totalLegs;
    const combinedProb = group.reduce((acc, c) => acc * (c.avgConfidence / 100), 1);

    const avgConsensus = group.reduce((acc, c) => acc + c.consensusCount, 0) / group.length;
    let grade: 'S' | 'A' | 'B' = 'B';
    if (group.every(c => c.consensusCount === 4)) grade = 'S';
    else if (avgConsensus >= 3.3) grade = 'A';

    const resultLabel = isPerfectHit
      ? `🎯 ${totalLegs}關全過`
      : `❌ 過關中斷 (${legsHit}/${totalLegs})`;

    const leagues = new Set(group.map(c => c.game.league));
    const league = leagues.size === 1 ? Array.from(leagues)[0] as 'NBA' | 'MLB' : 'ALL';

    entries.push({
      id: parlayId++,
      date: dateStr,
      league,
      legs,
      grade,
      combinedProb: Number(combinedProb.toFixed(4)),
      legsHit,
      totalLegs,
      isPerfectHit,
      resultLabel,
    });
  }

  return entries;
}

/**
 * Generate the full parlay history from all completed games.
 */
export function generateParlayHistory(
  leagueFilter?: 'NBA' | 'MLB' | 'ALL',
  maxDays?: number
): ParlayHistoryResult {
  const allGames = realGames as RawHistoricalGame[];
  
  const gamesByDate = new Map<string, RawHistoricalGame[]>();
  for (const game of allGames) {
    if (leagueFilter && leagueFilter !== 'ALL' && game.league !== leagueFilter) continue;
    const existing = gamesByDate.get(game.date) || [];
    existing.push(game);
    gamesByDate.set(game.date, existing);
  }

  const sortedDates = Array.from(gamesByDate.keys()).sort((a, b) => b.localeCompare(a));
  const datesToProcess = maxDays ? sortedDates.slice(0, maxDays) : sortedDates;

  const allEntries: ParlayHistoryEntry[] = [];
  let globalId = 1;

  for (const date of datesToProcess) {
    const gamesOnDate = gamesByDate.get(date)!;
    const dateEntries = generateAndSettleParlaysForDate(gamesOnDate, date);
    for (const entry of dateEntries) {
      entry.id = globalId++;
      allEntries.push(entry);
    }
  }

  // Aggregate Statistics
  const totalParlays = allEntries.length;
  const perfectHits = allEntries.filter(e => e.isPerfectHit).length;
  const perfectHitRate = totalParlays > 0 ? Number(((perfectHits / totalParlays) * 100).toFixed(1)) : 0;

  const totalLegs = allEntries.reduce((sum, e) => sum + e.totalLegs, 0);
  const totalLegsHit = allEntries.reduce((sum, e) => sum + e.legsHit, 0);
  const singleLegHitRate = totalLegs > 0 ? Number(((totalLegsHit / totalLegs) * 100).toFixed(1)) : 0;

  const gradeBreakdown = (grade: 'S' | 'A' | 'B') => {
    const filtered = allEntries.filter(e => e.grade === grade);
    const total = filtered.length;
    const hits = filtered.filter(e => e.isPerfectHit).length;
    return { total, hits, rate: total > 0 ? Number(((hits / total) * 100).toFixed(1)) : 0 };
  };

  const last10Parlays = allEntries.slice(0, 10);
  const last10Perfect = last10Parlays.filter(e => e.isPerfectHit).length;
  const last10PerfectRate = last10Parlays.length > 0 ? Number(((last10Perfect / last10Parlays.length) * 100).toFixed(1)) : 0;

  const leagueBreakdown = (league: 'NBA' | 'MLB') => {
    const filtered = allEntries.filter(e => e.league === league || e.league === 'ALL');
    const total = filtered.length;
    const hits = filtered.filter(e => e.isPerfectHit).length;
    const legs = filtered.reduce((sum, e) => sum + e.totalLegs, 0);
    const legsHit = filtered.reduce((sum, e) => sum + e.legsHit, 0);
    return {
      total,
      hits,
      rate: total > 0 ? Number(((hits / total) * 100).toFixed(1)) : 0,
      legRate: legs > 0 ? Number(((legsHit / legs) * 100).toFixed(1)) : 0,
    };
  };

  const stats: ParlayHistoryStats = {
    totalParlays,
    perfectHits,
    perfectHitRate,
    totalLegs,
    totalLegsHit,
    singleLegHitRate,
    gradeS: gradeBreakdown('S'),
    gradeA: gradeBreakdown('A'),
    gradeB: gradeBreakdown('B'),
    last10Parlays,
    last10PerfectRate,
    mlbStats: leagueBreakdown('MLB'),
    nbaStats: leagueBreakdown('NBA'),
  };

  return { entries: allEntries, stats };
}
