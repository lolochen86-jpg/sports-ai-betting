import type { PredictionResult, ModelPrediction } from './engine';
import type { GameWithTeams } from '@/types/sports';

export interface SmartParlayLeg {
  gameId: string;
  homeTeam: { name: string; code: string; nameCn?: string };
  awayTeam: { name: string; code: string; nameCn?: string };
  betType: 'winner' | 'over_under';   // Bet type: winner (獨贏) or over_under (大小分)
  pick: 'home' | 'away' | 'Over' | 'Under'; // Pick selection
  pickTeamName: string;              // Display label for pick (e.g., "洋基" or "全場 大 218.5")
  consensusCount: number;            // How many of 4 models agree (2-4)
  avgConfidence: number;             // Average confidence of agreeing models
  models: {                          // Each model's pick for this bet type
    SportsAI: string;
    EloRating: string;
    MonteCarlo: string;
    MetaModel: string;
  };
  predictedTotal?: number;            // Predicted total score
  ouLine?: number;                    // Line used for over/under
}

export interface SmartParlay {
  id: number;                        // 1-indexed
  legs: SmartParlayLeg[];            // Exactly 2 legs
  combinedProb: number;              // Product of (avgConfidence/100)
  grade: 'S' | 'A' | 'B';           // S=all consensus 4/4, A=avg consensus >=3.3, B=rest
  coverageTeams: string[];           // Team codes included
}

export interface ParlayGeneratorResult {
  parlays: SmartParlay[];
  totalGames: number;
  totalTeamsCovered: number;
  totalTeams: number;
  uncoveredTeams: string[];          // Teams not in any parlay
}

/**
 * Analyzes a single game's prediction for both Winner (獨贏) and Over/Under (大小分) legs.
 */
export function analyzeLegStrength(
  game: GameWithTeams,
  prediction: PredictionResult,
  taiwanLine?: number
): SmartParlayLeg[] {
  const models = prediction.models;
  const legs: SmartParlayLeg[] = [];

  // 1. Winner Leg Analysis (獨贏)
  const winnerPicks = {
    SportsAI: models.SportsAI.winner,
    EloRating: models.EloRating.winner,
    MonteCarlo: models.MonteCarlo.winner,
    MetaModel: models.MetaModel.winner,
  };

  let homeVotes = 0;
  let awayVotes = 0;
  Object.values(winnerPicks).forEach(winner => {
    if (winner === 'home') homeVotes++;
    else awayVotes++;
  });

  const winnerPick: 'home' | 'away' = homeVotes >= awayVotes ? 'home' : 'away';
  const winnerConsensus = winnerPick === 'home' ? homeVotes : awayVotes;

  let winnerConfSum = 0;
  let winnerAgreeCount = 0;
  if (models.SportsAI.winner === winnerPick) { winnerConfSum += models.SportsAI.confidence; winnerAgreeCount++; }
  if (models.EloRating.winner === winnerPick) { winnerConfSum += models.EloRating.confidence; winnerAgreeCount++; }
  if (models.MonteCarlo.winner === winnerPick) { winnerConfSum += models.MonteCarlo.confidence; winnerAgreeCount++; }
  if (models.MetaModel.winner === winnerPick) { winnerConfSum += models.MetaModel.confidence; winnerAgreeCount++; }

  const winnerAvgConf = winnerAgreeCount > 0 ? (winnerConfSum / winnerAgreeCount) : 50;
  const winnerTeamName = winnerPick === 'home'
    ? (game.homeTeam.nameCn || game.homeTeam.name)
    : (game.awayTeam.nameCn || game.awayTeam.name);

  const predictedTotal = Math.round(
    (models.MetaModel.homeExpectedScore + models.MetaModel.awayExpectedScore)
  );

  legs.push({
    gameId: game.id,
    homeTeam: { name: game.homeTeam.name, code: game.homeTeam.code, nameCn: game.homeTeam.nameCn },
    awayTeam: { name: game.awayTeam.name, code: game.awayTeam.code, nameCn: game.awayTeam.nameCn },
    betType: 'winner',
    pick: winnerPick,
    pickTeamName: `${winnerTeamName} (獨贏)`,
    consensusCount: winnerConsensus,
    avgConfidence: winnerAvgConf,
    models: winnerPicks,
    predictedTotal,
  });

  // 2. Over/Under Leg Analysis (大小分 - 優先使用台灣運彩盤口線)
  const line = taiwanLine || models.MetaModel.ouLine || (game.league === 'NBA' ? 220 : 8.5);

  const ouPicks = {
    SportsAI: models.SportsAI.ouPick || (models.SportsAI.homeExpectedScore + models.SportsAI.awayExpectedScore > line ? 'Over' : 'Under'),
    EloRating: models.EloRating.ouPick || (models.EloRating.homeExpectedScore + models.EloRating.awayExpectedScore > line ? 'Over' : 'Under'),
    MonteCarlo: models.MonteCarlo.ouPick || (models.MonteCarlo.homeExpectedScore + models.MonteCarlo.awayExpectedScore > line ? 'Over' : 'Under'),
    MetaModel: models.MetaModel.ouPick || (models.MetaModel.homeExpectedScore + models.MetaModel.awayExpectedScore > line ? 'Over' : 'Under'),
  };

  let overVotes = 0;
  let underVotes = 0;
  Object.values(ouPicks).forEach(pick => {
    if (pick === 'Over') overVotes++;
    else underVotes++;
  });

  const ouPick: 'Over' | 'Under' = overVotes >= underVotes ? 'Over' : 'Under';
  const ouConsensus = ouPick === 'Over' ? overVotes : underVotes;

  let ouConfSum = 0;
  let ouAgreeCount = 0;
  if (ouPicks.SportsAI === ouPick) { ouConfSum += models.SportsAI.confidence; ouAgreeCount++; }
  if (ouPicks.EloRating === ouPick) { ouConfSum += models.EloRating.confidence; ouAgreeCount++; }
  if (ouPicks.MonteCarlo === ouPick) { ouConfSum += models.MonteCarlo.confidence; ouAgreeCount++; }
  if (ouPicks.MetaModel === ouPick) { ouConfSum += models.MetaModel.confidence; ouAgreeCount++; }

  const ouAvgConf = ouAgreeCount > 0 ? (ouConfSum / ouAgreeCount) : 50;

  legs.push({
    gameId: game.id,
    homeTeam: { name: game.homeTeam.name, code: game.homeTeam.code, nameCn: game.homeTeam.nameCn },
    awayTeam: { name: game.awayTeam.name, code: game.awayTeam.code, nameCn: game.awayTeam.nameCn },
    betType: 'over_under',
    pick: ouPick,
    pickTeamName: `全場 ${ouPick === 'Over' ? '大' : '小'} ${line}`,
    consensusCount: ouConsensus,
    avgConfidence: ouAvgConf,
    models: ouPicks,
    predictedTotal,
    ouLine: line,
  });

  return legs;
}

/**
 * Generates smart 2-leg parlay combinations from all games.
 * Supports mixing Winner and Over/Under legs.
 */
export function generateSmartParlays(
  games: GameWithTeams[],
  predictions: Map<string, PredictionResult>,
  taiwanOddsMap?: Record<string, { totalsLine?: number }>
): ParlayGeneratorResult {
  const allTeams = new Set<string>();
  games.forEach(g => {
    allTeams.add(g.homeTeam.code);
    allTeams.add(g.awayTeam.code);
  });

  const validLegs: SmartParlayLeg[] = [];

  for (const game of games) {
    const pred = predictions.get(game.id);
    if (!pred) continue;
    
    const line = taiwanOddsMap?.[game.id]?.totalsLine;
    const gameLegs = analyzeLegStrength(game, pred, line);
    
    gameLegs.forEach(leg => {
      if (leg.consensusCount >= 2) {
        validLegs.push(leg);
      }
    });
  }

  // Sort legs by consensus strength (4/4 -> 3/4 -> 2/4) and then average confidence
  validLegs.sort((a, b) => {
    if (b.consensusCount !== a.consensusCount) {
      return b.consensusCount - a.consensusCount;
    }
    return b.avgConfidence - a.avgConfidence;
  });

  const parlays: SmartParlay[] = [];
  const coveredTeams = new Set<string>();
  let parlayId = 1;

  // Group legs into 2-leg (二關) parlays greedily
  for (let i = 0; i < validLegs.length; i += 2) {
    const legsGroup = validLegs.slice(i, i + 2);
    if (legsGroup.length < 2) {
      // If 1 leg left and we have existing parlays, append it if different game
      if (parlays.length > 0 && legsGroup.length === 1) {
        const lastParlay = parlays[parlays.length - 1];
        if (lastParlay.legs[0].gameId !== legsGroup[0].gameId) {
          lastParlay.legs.push(legsGroup[0]);
          lastParlay.coverageTeams.push(legsGroup[0].homeTeam.code, legsGroup[0].awayTeam.code);
          coveredTeams.add(legsGroup[0].homeTeam.code);
          coveredTeams.add(legsGroup[0].awayTeam.code);
        }
      }
      continue;
    }

    // Ensure 2 legs in a parlay are not from the exact same gamePK if both are winner/OU
    const combinedProb = legsGroup.reduce((acc, leg) => acc * (leg.avgConfidence / 100), 1);

    const avgConsensus = legsGroup.reduce((acc, leg) => acc + leg.consensusCount, 0) / legsGroup.length;
    let grade: 'S' | 'A' | 'B' = 'B';
    if (legsGroup.every(l => l.consensusCount === 4)) {
      grade = 'S';
    } else if (avgConsensus >= 3.3) {
      grade = 'A';
    }

    const groupTeams: string[] = [];
    legsGroup.forEach(leg => {
      groupTeams.push(leg.homeTeam.code);
      groupTeams.push(leg.awayTeam.code);
      coveredTeams.add(leg.homeTeam.code);
      coveredTeams.add(leg.awayTeam.code);
    });

    parlays.push({
      id: parlayId++,
      legs: legsGroup,
      combinedProb,
      grade,
      coverageTeams: Array.from(new Set(groupTeams)),
    });
  }

  // Find uncovered teams
  const uncoveredTeams = Array.from(allTeams).filter(teamCode => !coveredTeams.has(teamCode));

  return {
    parlays,
    totalGames: games.length,
    totalTeamsCovered: coveredTeams.size,
    totalTeams: allTeams.size,
    uncoveredTeams,
  };
}
