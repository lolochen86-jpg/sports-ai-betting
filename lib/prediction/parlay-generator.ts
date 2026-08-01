import type { PredictionResult, ModelPrediction } from './engine';
import type { GameWithTeams } from '@/types/sports';

export interface SmartParlayLeg {
  gameId: string;
  homeTeam: { name: string; code: string; nameCn?: string };
  awayTeam: { name: string; code: string; nameCn?: string };
  pick: 'home' | 'away';            // Which team to pick
  pickTeamName: string;              // Display name of picked team
  consensusCount: number;            // How many of 4 models agree (2-4)
  avgConfidence: number;             // Average confidence of agreeing models
  models: {                          // Each model's pick
    SportsAI: 'home' | 'away';
    EloRating: 'home' | 'away';
    MonteCarlo: 'home' | 'away';
    MetaModel: 'home' | 'away';
  };
  predictedTotal?: number;            // Predicted total score
}

export interface SmartParlay {
  id: number;                        // 1-indexed
  legs: SmartParlayLeg[];            // Exactly 3 legs (or 2 if tail)
  combinedProb: number;              // Product of (avgConfidence/100)
  grade: 'S' | 'A' | 'B';           // S=all consensus 4/4, A=avg consensus >=3.3, B=rest
  coverageTeams: string[];           // Team codes included (e.g. ['NYY', 'LAD', 'BOS', 'SFG', ...])
}

export interface ParlayGeneratorResult {
  parlays: SmartParlay[];
  totalGames: number;
  totalTeamsCovered: number;
  totalTeams: number;
  uncoveredTeams: string[];          // Teams not in any parlay
}

/**
 * Analyzes a single game's prediction to determine leg strength and consensus.
 */
export function analyzeLegStrength(
  game: GameWithTeams,
  prediction: PredictionResult
): SmartParlayLeg {
  const models = prediction.models;
  
  const picks = {
    SportsAI: models.SportsAI.winner,
    EloRating: models.EloRating.winner,
    MonteCarlo: models.MonteCarlo.winner,
    MetaModel: models.MetaModel.winner,
  };

  // Count home vs away votes
  let homeVotes = 0;
  let awayVotes = 0;

  Object.values(picks).forEach(winner => {
    if (winner === 'home') homeVotes++;
    else awayVotes++;
  });

  const pick: 'home' | 'away' = homeVotes >= awayVotes ? 'home' : 'away';
  const consensusCount = pick === 'home' ? homeVotes : awayVotes;

  // Calculate average confidence of the agreeing models
  let confidenceSum = 0;
  let agreeingCount = 0;

  if (models.SportsAI.winner === pick) {
    confidenceSum += models.SportsAI.confidence;
    agreeingCount++;
  }
  if (models.EloRating.winner === pick) {
    confidenceSum += models.EloRating.confidence;
    agreeingCount++;
  }
  if (models.MonteCarlo.winner === pick) {
    confidenceSum += models.MonteCarlo.confidence;
    agreeingCount++;
  }
  if (models.MetaModel.winner === pick) {
    confidenceSum += models.MetaModel.confidence;
    agreeingCount++;
  }

  const avgConfidence = agreeingCount > 0 ? (confidenceSum / agreeingCount) : 50;
  const pickTeamName = pick === 'home' 
    ? (game.homeTeam.nameCn || game.homeTeam.name)
    : (game.awayTeam.nameCn || game.awayTeam.name);

  const predictedTotal = Math.round(
    (models.MetaModel.homeExpectedScore + models.MetaModel.awayExpectedScore)
  );

  return {
    gameId: game.id,
    homeTeam: {
      name: game.homeTeam.name,
      code: game.homeTeam.code,
      nameCn: game.homeTeam.nameCn,
    },
    awayTeam: {
      name: game.awayTeam.name,
      code: game.awayTeam.code,
      nameCn: game.awayTeam.nameCn,
    },
    pick,
    pickTeamName,
    consensusCount,
    avgConfidence,
    models: picks,
    predictedTotal,
  };
}

/**
 * Generates smart 3-leg parlay combinations from all games.
 * Tries to include every team across all parlays.
 */
export function generateSmartParlays(
  games: GameWithTeams[],
  predictions: Map<string, PredictionResult>
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
    
    const leg = analyzeLegStrength(game, pred);
    // Only include legs where there is some consensus (consensusCount >= 2)
    if (leg.consensusCount >= 2) {
      validLegs.push(leg);
    }
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

  // Group legs into 3-leg parlays greedily
  for (let i = 0; i < validLegs.length; i += 3) {
    const legsGroup = validLegs.slice(i, i + 3);
    if (legsGroup.length < 2) {
      // 1 leg is not a parlay, skip or append to previous if possible
      if (parlays.length > 0 && legsGroup.length === 1) {
        parlays[parlays.length - 1].legs.push(legsGroup[0]);
        parlays[parlays.length - 1].coverageTeams.push(legsGroup[0].homeTeam.code, legsGroup[0].awayTeam.code);
        coveredTeams.add(legsGroup[0].homeTeam.code);
        coveredTeams.add(legsGroup[0].awayTeam.code);
      }
      continue;
    }

    // Calculate combined probability
    const combinedProb = legsGroup.reduce((acc, leg) => acc * (leg.avgConfidence / 100), 1);

    // Grade the parlay:
    // S: All legs are consensus 4/4
    // A: Average consensus >= 3.3
    // B: Others
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
