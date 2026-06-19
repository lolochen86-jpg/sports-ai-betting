import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export interface MetaModelWeights {
  SportsAI: number;
  EloRating: number;
  MonteCarlo: number;
}

export const DEFAULT_WEIGHTS: MetaModelWeights = {
  SportsAI: 0.45,
  EloRating: 0.25,
  MonteCarlo: 0.30
};

const weightsFilePath = path.join(process.cwd(), 'lib', 'prediction', 'weights.json');

/**
  Synchronously reads meta-model weights from the local JSON file.
  Fallback to default values if not found or invalid.
 */
export function getMetaModelWeights(): MetaModelWeights {
  try {
    if (fs.existsSync(weightsFilePath)) {
      const data = fs.readFileSync(weightsFilePath, 'utf8');
      const weights = JSON.parse(data);
      if (
        typeof weights.SportsAI === 'number' &&
        typeof weights.EloRating === 'number' &&
        typeof weights.MonteCarlo === 'number'
      ) {
        // Ensure they sum to approximately 1.0 (100%)
        const sum = weights.SportsAI + weights.EloRating + weights.MonteCarlo;
        if (Math.abs(sum - 1.0) < 0.01) {
          return weights;
        }
      }
    }
  } catch (error) {
    console.error('[Weights Manager] Failed to read weights from file:', error);
  }
  return DEFAULT_WEIGHTS;
}

/**
  Asynchronously saves meta-model weights to both weights.json file and database.
 */
export async function saveMetaModelWeights(weights: MetaModelWeights): Promise<boolean> {
  // 1. Write to local file
  try {
    fs.writeFileSync(weightsFilePath, JSON.stringify(weights, null, 2), 'utf8');
    console.log('[Weights Manager] Successfully wrote weights to file:', weights);
  } catch (error) {
    console.error('[Weights Manager] Failed to write weights to file:', error);
    return false;
  }

  // 2. Write to database (MyStrategyRules)
  try {
    await prisma.myStrategyRules.upsert({
      where: { key: 'meta_model_weights' },
      update: {
        value: JSON.stringify(weights),
        description: 'Ensemble MetaModel weights for SportsAI, EloRating, and MonteCarlo'
      },
      create: {
        key: 'meta_model_weights',
        value: JSON.stringify(weights),
        description: 'Ensemble MetaModel weights for SportsAI, EloRating, and MonteCarlo'
      }
    });
    console.log('[Weights Manager] Successfully updated database strategy rules.');
  } catch (error) {
    console.warn('[Weights Manager] Database weights save failed, using local file backup:', error);
  }

  return true;
}
