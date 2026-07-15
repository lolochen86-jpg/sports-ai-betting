export interface MetaModelWeights {
  SportsAI: number;
  EloRating: number;
  MonteCarlo: number;
  QuantML?: number;
}

export const DEFAULT_WEIGHTS: MetaModelWeights = {
  SportsAI: 0.35,
  EloRating: 0.20,
  MonteCarlo: 0.20,
  QuantML: 0.25
};

// In-memory cache for server-side weights (updated after DB reads or saves)
let _serverWeightsCache: MetaModelWeights | null = null;

// Helper to get the correct weights file path on server side
function getWeightsFilePath(): string {
  const path = eval('require')('path');
  const isVercel = process.env.VERCEL === '1' || process.env.NOW_BUILDER === '1';
  if (isVercel) {
    return path.join('/tmp', 'betting-store', 'meta_model_weights.json');
  }
  return path.join(process.cwd(), 'lib', 'prediction', 'weights.json');
}

/**
 * Synchronously reads meta-model weights.
 * - Browser: reads from localStorage
 * - Server: reads from in-memory cache → local JSON file → defaults
 */
export function normalizeWeights(weights: any): MetaModelWeights {
  if (!weights) return DEFAULT_WEIGHTS;
  let sportsAI = typeof weights.SportsAI === 'number' ? weights.SportsAI : 0.35;
  let eloRating = typeof weights.EloRating === 'number' ? weights.EloRating : 0.20;
  let monteCarlo = typeof weights.MonteCarlo === 'number' ? weights.MonteCarlo : 0.20;
  let quantML = typeof weights.QuantML === 'number' ? weights.QuantML : undefined;

  if (quantML === undefined) {
    const sumOthers = sportsAI + eloRating + monteCarlo;
    if (sumOthers > 0) {
      sportsAI = (sportsAI / sumOthers) * 0.75;
      eloRating = (eloRating / sumOthers) * 0.75;
      monteCarlo = (monteCarlo / sumOthers) * 0.75;
    } else {
      sportsAI = 0.35;
      eloRating = 0.20;
      monteCarlo = 0.20;
    }
    quantML = 0.25;
  }

  const total = sportsAI + eloRating + monteCarlo + quantML;
  if (Math.abs(total - 1.0) > 0.001 && total > 0) {
    const factor = 1.0 / total;
    sportsAI *= factor;
    eloRating *= factor;
    monteCarlo *= factor;
    quantML *= factor;
  }

  return {
    SportsAI: Number(sportsAI.toFixed(3)),
    EloRating: Number(eloRating.toFixed(3)),
    MonteCarlo: Number(monteCarlo.toFixed(3)),
    QuantML: Number(quantML.toFixed(3))
  };
}

export function getMetaModelWeights(): MetaModelWeights {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('meta_model_weights');
      if (cached) {
        return normalizeWeights(JSON.parse(cached));
      }
    } catch { /* ignore */ }
    return DEFAULT_WEIGHTS;
  }

  // Server: check in-memory cache first
  if (_serverWeightsCache) {
    return _serverWeightsCache;
  }

  try {
    const fs = eval('require')('fs');
    const weightsFilePath = getWeightsFilePath();
    if (fs.existsSync(weightsFilePath)) {
      const data = fs.readFileSync(weightsFilePath, 'utf8');
      const weights = normalizeWeights(JSON.parse(data));
      _serverWeightsCache = weights;
      return weights;
    }
  } catch (error) {
    console.error('[Weights Manager] Failed to read weights from file:', error);
  }
  return DEFAULT_WEIGHTS;
}

/**
 * Asynchronously reads weights from the database, falling back to synchronous sources.
 * Use this in API routes where async is available and fresh DB data is needed.
 */
export async function getMetaModelWeightsAsync(): Promise<MetaModelWeights> {
  if (typeof window !== 'undefined') {
    return getMetaModelWeights();
  }

  // Try database first
  try {
    const { prisma } = eval('require')('@/lib/prisma');
    const row = await prisma.myStrategyRules.findUnique({
      where: { key: 'meta_model_weights' }
    });
    if (row && row.value) {
      const weights = normalizeWeights(JSON.parse(row.value));
      _serverWeightsCache = weights;
      return weights;
    }
  } catch (error) {
    console.warn('[Weights Manager] DB read failed, falling back to file/defaults:', error);
  }

  // Fallback to synchronous file/defaults
  return getMetaModelWeights();
}

/**
 * Asynchronously saves meta-model weights.
 * Primary: database (works on Vercel's read-only filesystem).
 * Secondary: local JSON file (works in local dev, and uses /tmp on Vercel).
 * Returns true if at least one storage succeeds.
 */
export async function saveMetaModelWeights(weights: MetaModelWeights): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('meta_model_weights', JSON.stringify(weights));
      return true;
    } catch {
      return false;
    }
  }

  let dbSaved = false;
  let fileSaved = false;

  // 1. Write to database FIRST (primary — works on Vercel if DB is configured)
  try {
    const { prisma } = eval('require')('@/lib/prisma');
    await prisma.myStrategyRules.upsert({
      where: { key: 'meta_model_weights' },
      update: {
        value: JSON.stringify(weights),
        description: 'Ensemble MetaModel weights for SportsAI, EloRating, MonteCarlo, and QuantML'
      },
      create: {
        key: 'meta_model_weights',
        value: JSON.stringify(weights),
        description: 'Ensemble MetaModel weights for SportsAI, EloRating, MonteCarlo, and QuantML'
      }
    });
    dbSaved = true;
    console.log('[Weights Manager] Successfully saved weights to database:', weights);
  } catch (error) {
    console.warn('[Weights Manager] Database save failed:', error);
  }

  // 2. Write to local file (secondary — using /tmp on Vercel which is writable!)
  try {
    const fs = eval('require')('fs');
    const path = eval('require')('path');
    const weightsFilePath = getWeightsFilePath();
    
    // Ensure parent directory exists
    const dir = path.dirname(weightsFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(weightsFilePath, JSON.stringify(weights, null, 2), 'utf8');
    fileSaved = true;
    console.log('[Weights Manager] Successfully wrote weights to file:', weightsFilePath);
  } catch (error) {
    console.warn('[Weights Manager] File write failed:', error);
  }

  // Update in-memory cache regardless
  _serverWeightsCache = weights;

  if (!dbSaved && !fileSaved) {
    console.error('[Weights Manager] All save methods failed!');
    return false;
  }

  return true;
}

