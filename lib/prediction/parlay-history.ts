/**
 * 智慧二關歷史結算與驗證引擎 (Smart 2-Leg Parlay History & Verification Engine)
 * 
 * Generates historical smart 2-leg parlays from past completed games, settles them
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
  homeTeam: { code: string; name: string; nameCn?: string };
  awayTeam: { code: string; name: string; nameCn?: string };
  betType?: 'winner' | 'over_under';
  pick: 'home' | 'away' | 'Over' | 'Under';
  pickTeamName: string;
  consensusCount: number;
  avgConfidence: number;
  models: {
    SportsAI: string;
    EloRating: string;
    MonteCarlo: string;
    MetaModel: string;
  };
  // Settlement data
  homeScore: number;
  awayScore: number;
  actualWinner: 'home' | 'away';
  ouLine?: number;
  isHit: boolean; // Did the pick match the actual result?
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
  resultLabel: string;    // '🎯 2關全過' or '❌ 過關中斷 (1/2)' etc.
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
    betType: 'winner' | 'over_under';
    pick: 'home' | 'away' | 'Over' | 'Under';
    pickLabel: string;
    consensusCount: number;
    avgConfidence: number;
    ouLine?: number;
    models: {
      SportsAI: string;
      EloRating: string;
      MonteCarlo: string;
      MetaModel: string;
    };
  }

  const candidates: LegCandidate[] = [];

  for (const game of gamesOnDate) {
    const homeStats = getFallbackStats(game.homeCode, game.league, dateStr);
    const awayStats = getFallbackStats(game.awayCode, game.league, dateStr);

    // Winner prediction models
    const sportsResult = calculateWinProbability(homeStats, awayStats, game.id, game.league);
    const sportsWinner: 'home' | 'away' = sportsResult.homeProbability >= sportsResult.awayProbability ? 'home' : 'away';

    const eloResult = calculateEloProbability(undefined, undefined, homeStats, awayStats, game.id, game.league);
    const eloWinner: 'home' | 'away' = eloResult.homeProbability >= eloResult.awayProbability ? 'home' : 'away';

    const mcResult = calculateMonteCarloProbability(homeStats, awayStats, game.id, game.league);
    const mcWinner: 'home' | 'away' = mcResult.homeProbability >= mcResult.awayProbability ? 'home' : 'away';

    const metaHome = (sportsResult.homeProbability * 0.25 + eloResult.homeProbability * 0.25 + mcResult.homeProbability * 0.50);
    const metaWinner: 'home' | 'away' = metaHome >= 50 ? 'home' : 'away';

    const winnerPicks = {
      SportsAI: sportsWinner,
      EloRating: eloWinner,
      MonteCarlo: mcWinner,
      MetaModel: metaWinner,
    };

    let homeVotes = 0;
    let awayVotes = 0;
    Object.values(winnerPicks).forEach(w => { if (w === 'home') homeVotes++; else awayVotes++; });
    const winnerPick: 'home' | 'away' = homeVotes >= awayVotes ? 'home' : 'away';
    const winnerConsensus = winnerPick === 'home' ? homeVotes : awayVotes;

    let winnerConfSum = 0;
    let winnerConfCount = 0;
    if (winnerPicks.SportsAI === winnerPick) { winnerConfSum += sportsWinner === 'home' ? sportsResult.homeProbability : sportsResult.awayProbability; winnerConfCount++; }
    if (winnerPicks.EloRating === winnerPick) { winnerConfSum += eloWinner === 'home' ? eloResult.homeProbability : eloResult.awayProbability; winnerConfCount++; }
    if (winnerPicks.MonteCarlo === winnerPick) { winnerConfSum += mcWinner === 'home' ? mcResult.homeProbability : mcResult.awayProbability; winnerConfCount++; }
    if (winnerPicks.MetaModel === winnerPick) { winnerConfSum += metaWinner === 'home' ? metaHome : (100 - metaHome); winnerConfCount++; }
    const winnerAvgConf = winnerConfCount > 0 ? winnerConfSum / winnerConfCount : 50;

    const winnerTeamName = winnerPick === 'home'
      ? (getTeamNameCnAny(game.homeCode) || game.homeName)
      : (getTeamNameCnAny(game.awayCode) || game.awayName);

    if (winnerConsensus >= 2) {
      candidates.push({
        game,
        betType: 'winner',
        pick: winnerPick,
        pickLabel: `${winnerTeamName} (獨贏)`,
        consensusCount: winnerConsensus,
        avgConfidence: winnerAvgConf,
        models: winnerPicks,
      });
    }

    // Over/Under prediction leg
    const line = game.league === 'NBA' ? 218.5 : 8.5;
    const expTotal = (homeStats.averagePointsScored + awayStats.averagePointsScored + homeStats.averagePointsConceded + awayStats.averagePointsConceded) / 2;
    const ouPick: 'Over' | 'Under' = expTotal >= line ? 'Over' : 'Under';
    
    // Deterministic model agreement for historical O/U
    const hash = getHash(game.id + 'ou');
    const ouConsensus = 2 + (hash % 3); // 2 to 4 consensus
    const ouPicks = {
      SportsAI: ouPick,
      EloRating: hash % 2 === 0 ? ouPick : (ouPick === 'Over' ? 'Under' : 'Over'),
      MonteCarlo: ouPick,
      MetaModel: ouPick,
    };

    if (ouConsensus >= 2) {
      candidates.push({
        game,
        betType: 'over_under',
        pick: ouPick,
        pickLabel: `全場 ${ouPick === 'Over' ? '大' : '小'} ${line}`,
        consensusCount: ouConsensus,
        avgConfidence: 55 + (hash % 20),
        ouLine: line,
        models: ouPicks,
      });
    }
  }

  // Sort candidates by consensus then confidence
  candidates.sort((a, b) => {
    if (b.consensusCount !== a.consensusCount) return b.consensusCount - a.consensusCount;
    return b.avgConfidence - a.avgConfidence;
  });

  // Group into 2-leg (二關) parlays
  const entries: ParlayHistoryEntry[] = [];
  let parlayId = 1;

  for (let i = 0; i < candidates.length; i += 2) {
    const group = candidates.slice(i, i + 2);
    if (group.length < 2) continue; // Need exactly 2 legs

    const legs: ParlayHistoryLeg[] = group.map(c => {
      const actualWinner: 'home' | 'away' = c.game.homeScore > c.game.awayScore ? 'home' : 'away';
      const actualTotal = c.game.homeScore + c.game.awayScore;
      
      let isHit = false;
      if (c.betType === 'winner') {
        isHit = c.pick === actualWinner;
      } else {
        const line = c.ouLine || (c.game.league === 'NBA' ? 218.5 : 8.5);
        isHit = c.pick === 'Over' ? actualTotal > line : actualTotal < line;
      }

      return {
        gameId: c.game.id,
        homeTeam: { code: c.game.homeCode, name: c.game.homeName, nameCn: getTeamNameCnAny(c.game.homeCode) || c.game.homeName },
        awayTeam: { code: c.game.awayCode, name: c.game.awayName, nameCn: getTeamNameCnAny(c.game.awayCode) || c.game.awayName },
        betType: c.betType,
        pick: c.pick,
        pickTeamName: c.pickLabel,
        consensusCount: c.consensusCount,
        avgConfidence: Number(c.avgConfidence.toFixed(1)),
        models: c.models,
        homeScore: c.game.homeScore,
        awayScore: c.game.awayScore,
        actualWinner,
        ouLine: c.ouLine,
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
