import { loadRealGames, getBacktestGamesForDate, GameBacktestDetail } from './backtest';
import { getMetaModelWeights, saveMetaModelWeights, MetaModelWeights } from './weights';

export interface RebalanceResult {
  success: boolean;
  status: 'skipped' | 'rebalanced';
  metaWinRateBefore: number;
  threshold: number;
  gameCount: number;
  oldWeights: MetaModelWeights;
  newWeights: MetaModelWeights;
  subModelWinRates: {
    SportsAI: number;
    EloRating: number;
    MonteCarlo: number;
    QuantML: number;
  };
  logs: string[];
}

/**
 * Runs the dynamic weight auto-rebalancing based on the latest 50 completed games.
 */
export async function runAutoRebalancing(): Promise<RebalanceResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Auto-Rebalancing] ${msg}`);
    logs.push(msg);
  };

  log('Starting dynamic weight auto-rebalancing check...');

  // 1. Fetch all completed games and sort descending (latest first)
  const allRealGames = loadRealGames();
  
  // Sort descending by date, then id
  const sortedGames = [...allRealGames].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.id.localeCompare(a.id);
  });

  // Take the latest 50 games
  const latest50Games = sortedGames.slice(0, 50);
  const gameCount = latest50Games.length;

  log(`Retrieved the latest ${gameCount} completed games from history.`);

  if (gameCount < 10) {
    log('Too few games to evaluate (minimum 10 required). Skipping rebalance.');
    const currentWeights = getMetaModelWeights();
    return {
      success: true,
      status: 'skipped',
      metaWinRateBefore: 1.0,
      threshold: 0.60,
      gameCount,
      oldWeights: currentWeights,
      newWeights: currentWeights,
      subModelWinRates: { SportsAI: 0, EloRating: 0, MonteCarlo: 0, QuantML: 0 },
      logs
    };
  }

  // 2. Group the 50 games by date to batch call getBacktestGamesForDate
  const dates = Array.from(new Set(latest50Games.map(g => g.date)));
  const gameDetailsMap = new Map<string, GameBacktestDetail>();

  for (const dateStr of dates) {
    const dailyDetails = getBacktestGamesForDate(dateStr, 'ALL');
    for (const detail of dailyDetails) {
      gameDetailsMap.set(detail.id, detail);
    }
  }

  // 3. Evaluate hits for each model over the 50 games
  let metaCorrectCount = 0;
  let sportsCorrectCount = 0;
  let eloCorrectCount = 0;
  let mcCorrectCount = 0;
  let quantCorrectCount = 0;
  let evaluatedCount = 0;

  for (const game of latest50Games) {
    const detail = gameDetailsMap.get(game.id);
    if (detail) {
      evaluatedCount++;
      if (detail.MetaModel.winnerCorrect) metaCorrectCount++;
      if (detail.SportsAI.winnerCorrect) sportsCorrectCount++;
      if (detail.EloRating.winnerCorrect) eloCorrectCount++;
      if (detail.MonteCarlo.winnerCorrect) mcCorrectCount++;
      if (detail.QuantML && detail.QuantML.winnerCorrect) {
        quantCorrectCount++;
      } else if (!detail.QuantML) {
        // If QuantML is missing in historical backtest records, fallback to SportsAI for evaluation
        if (detail.SportsAI.winnerCorrect) quantCorrectCount++;
      }
    }
  }

  const metaWinRate = evaluatedCount > 0 ? metaCorrectCount / evaluatedCount : 0;
  const sportsWinRate = evaluatedCount > 0 ? sportsCorrectCount / evaluatedCount : 0;
  const eloWinRate = evaluatedCount > 0 ? eloCorrectCount / evaluatedCount : 0;
  const mcWinRate = evaluatedCount > 0 ? mcCorrectCount / evaluatedCount : 0;
  const quantWinRate = evaluatedCount > 0 ? quantCorrectCount / evaluatedCount : 0;

  log(`MetaModel Win Rate: ${(metaWinRate * 100).toFixed(1)}% (${metaCorrectCount}/${evaluatedCount})`);
  log(`Sub-model Win Rates over these ${evaluatedCount} games:`);
  log(`  - SportsAI (Regression): ${(sportsWinRate * 100).toFixed(1)}% (${sportsCorrectCount})`);
  log(`  - EloRating (Elo): ${(eloWinRate * 100).toFixed(1)}% (${eloCorrectCount})`);
  log(`  - MonteCarlo (Monte Carlo): ${(mcWinRate * 100).toFixed(1)}% (${mcCorrectCount})`);
  log(`  - QuantML (Quantitative): ${(quantWinRate * 100).toFixed(1)}% (${quantCorrectCount})`);

  const oldWeights = getMetaModelWeights();
  const subModelWinRates = {
    SportsAI: sportsWinRate,
    EloRating: eloWinRate,
    MonteCarlo: mcWinRate,
    QuantML: quantWinRate
  };

  // 4. Trigger check: Threshold = 60% (0.60)
  if (metaWinRate >= 0.60) {
    log(`Meta-Model win rate is ${(metaWinRate * 100).toFixed(1)}% (>= 60%). No rebalancing required.`);
    return {
      success: true,
      status: 'skipped',
      metaWinRateBefore: Number((metaWinRate * 100).toFixed(1)),
      threshold: 60,
      gameCount: evaluatedCount,
      oldWeights,
      newWeights: oldWeights,
      subModelWinRates: {
        SportsAI: Number((sportsWinRate * 100).toFixed(1)),
        EloRating: Number((eloWinRate * 100).toFixed(1)),
        MonteCarlo: Number((mcWinRate * 100).toFixed(1)),
        QuantML: Number((quantWinRate * 100).toFixed(1))
      },
      logs
    };
  }

  log(`Meta-Model win rate ${(metaWinRate * 100).toFixed(1)}% is below 60%. Triggering weight rebalancing!`);

  // 5. Weight rebalancing logic
  const models: Array<keyof MetaModelWeights> = ['SportsAI', 'EloRating', 'MonteCarlo', 'QuantML'];

  // Find the model with the lowest win rate
  let worstModel = models[0];
  let worstWinRate = subModelWinRates[worstModel];
  for (const m of models) {
    if (subModelWinRates[m] < worstWinRate) {
      worstWinRate = subModelWinRates[m];
      worstModel = m;
    }
  }

  // Find the model with the highest win rate
  let bestModel = models[0];
  let bestWinRate = subModelWinRates[bestModel];
  for (const m of models) {
    if (subModelWinRates[m] > bestWinRate) {
      bestWinRate = subModelWinRates[m];
      bestModel = m;
    }
  }

  log(`Worst-performing model: ${worstModel} (${(worstWinRate * 100).toFixed(1)}%)`);
  log(`Best-performing model: ${bestModel} (${(bestWinRate * 100).toFixed(1)}%)`);

  if (worstModel === bestModel) {
    log('All sub-models have identical performance. Skipping weight adjustment.');
    return {
      success: true,
      status: 'skipped',
      metaWinRateBefore: Number((metaWinRate * 100).toFixed(1)),
      threshold: 60,
      gameCount: evaluatedCount,
      oldWeights,
      newWeights: oldWeights,
      subModelWinRates: {
        SportsAI: Number((sportsWinRate * 100).toFixed(1)),
        EloRating: Number((eloWinRate * 100).toFixed(1)),
        MonteCarlo: Number((mcWinRate * 100).toFixed(1)),
        QuantML: Number((quantWinRate * 100).toFixed(1))
      },
      logs
    };
  }

  // Perform weight shifts: worst model -5%, best model +5%
  const currentWorstWeight = oldWeights[worstModel] ?? 0;
  const targetWorstWeight = Math.max(0, currentWorstWeight - 0.05);
  const actualDecrease = Number((currentWorstWeight - targetWorstWeight).toFixed(4));

  if (actualDecrease <= 0) {
    log(`Worst model ${worstModel} is already at minimum weight (0%). Cannot decrease further.`);
    return {
      success: true,
      status: 'skipped',
      metaWinRateBefore: Number((metaWinRate * 100).toFixed(1)),
      threshold: 60,
      gameCount: evaluatedCount,
      oldWeights,
      newWeights: oldWeights,
      subModelWinRates: {
        SportsAI: Number((sportsWinRate * 100).toFixed(1)),
        EloRating: Number((eloWinRate * 100).toFixed(1)),
        MonteCarlo: Number((mcWinRate * 100).toFixed(1)),
        QuantML: Number((quantWinRate * 100).toFixed(1))
      },
      logs
    };
  }

  // Build new weights
  const newWeights: MetaModelWeights = { ...oldWeights };
  newWeights[worstModel] = Number((currentWorstWeight - actualDecrease).toFixed(4));
  newWeights[bestModel] = Number(((oldWeights[bestModel] ?? 0) + actualDecrease).toFixed(4));

  // Round all weights to 4 decimal places for floating point safety
  newWeights.SportsAI = Number((newWeights.SportsAI ?? 0).toFixed(4));
  newWeights.EloRating = Number((newWeights.EloRating ?? 0).toFixed(4));
  newWeights.MonteCarlo = Number((newWeights.MonteCarlo ?? 0).toFixed(4));
  newWeights.QuantML = Number((newWeights.QuantML ?? 0).toFixed(4));

  // Verify weights sum to exactly 1.0 (100%)
  const weightSum = (newWeights.SportsAI ?? 0) + (newWeights.EloRating ?? 0) + (newWeights.MonteCarlo ?? 0) + (newWeights.QuantML ?? 0);
  if (Math.abs(weightSum - 1.0) > 0.0001) {
    // Gracefully correct any tiny rounding error by adjusting the bestModel's weight slightly
    const currentSum = (newWeights.SportsAI ?? 0) + (newWeights.EloRating ?? 0) + (newWeights.MonteCarlo ?? 0) + (newWeights.QuantML ?? 0);
    newWeights[bestModel] = Number((1.0 - (currentSum - (newWeights[bestModel] ?? 0))).toFixed(4));
  }

  log(`Weight adjustment plan:`);
  log(`  - ${worstModel}: ${(oldWeights[worstModel] ?? 0) * 100}% -> ${(newWeights[worstModel] ?? 0) * 100}% (-5%)`);
  log(`  - ${bestModel}: ${(oldWeights[bestModel] ?? 0) * 100}% -> ${(newWeights[bestModel] ?? 0) * 100}% (+5%)`);

  // Save the new weights to local file and database
  const saveSuccess = await saveMetaModelWeights(newWeights);

  if (saveSuccess) {
    log('Successfully updated Meta-Model weights in configuration and database!');
    return {
      success: true,
      status: 'rebalanced',
      metaWinRateBefore: Number((metaWinRate * 100).toFixed(1)),
      threshold: 60,
      gameCount: evaluatedCount,
      oldWeights,
      newWeights,
      subModelWinRates: {
        SportsAI: Number((sportsWinRate * 100).toFixed(1)),
        EloRating: Number((eloWinRate * 100).toFixed(1)),
        MonteCarlo: Number((mcWinRate * 100).toFixed(1)),
        QuantML: Number((quantWinRate * 100).toFixed(1))
      },
      logs
    };
  } else {
    log('Failed to save the new weights. Aborting rebalance.');
    return {
      success: false,
      status: 'skipped',
      metaWinRateBefore: Number((metaWinRate * 100).toFixed(1)),
      threshold: 60,
      gameCount: evaluatedCount,
      oldWeights,
      newWeights: oldWeights,
      subModelWinRates: {
        SportsAI: Number((sportsWinRate * 100).toFixed(1)),
        EloRating: Number((eloWinRate * 100).toFixed(1)),
        MonteCarlo: Number((mcWinRate * 100).toFixed(1)),
        QuantML: Number((quantWinRate * 100).toFixed(1))
      },
      logs
    };
  }
}
