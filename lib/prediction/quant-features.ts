/**
 * MLB Quantitative Feature Calculations
 * Ports player-level metrics and Bayesian shrinkage logic from feature_engineering.py.
 */

export const REPLACEMENT_WOBA = 0.310;
export const REPLACEMENT_ISO = 0.145;
export const REPLACEMENT_K_BB = 0.080;
export const REPLACEMENT_XFIP = 4.50;

export const PA_THRESHOLD = 50;
export const IP_THRESHOLD = 30.0;

// Linear weights from FanGraphs (approximate)
export const WOBA_WEIGHTS = {
  BB: 0.690,
  HBP: 0.722,
  IB1: 0.880, // Single
  IB2: 1.242, // Double
  IB3: 1.569, // Triple
  HR: 2.015,
};

/**
 * Calculate wOBA (Weighted On-Base Average)
 */
export function calculateWoba(
  walks: number,
  hbp: number,
  hits: number,
  doubles: number,
  triples: number,
  hr: number,
  pa: number
): number {
  if (pa <= 0) return REPLACEMENT_WOBA;
  const singles = Math.max(0, hits - doubles - triples - hr);
  const numerator =
    WOBA_WEIGHTS.BB * walks +
    WOBA_WEIGHTS.HBP * hbp +
    WOBA_WEIGHTS.IB1 * singles +
    WOBA_WEIGHTS.IB2 * doubles +
    WOBA_WEIGHTS.IB3 * triples +
    WOBA_WEIGHTS.HR * hr;
  return Number((numerator / pa).toFixed(3));
}

/**
 * Calculate ISO (Isolated Power)
 */
export function calculateIso(
  doubles: number,
  triples: number,
  hr: number,
  ab: number
): number {
  if (ab <= 0) return REPLACEMENT_ISO;
  return Number(((doubles + 2 * triples + 3 * hr) / ab).toFixed(3));
}

/**
 * Calculate xFIP (Expected Fielding Independent Pitching)
 */
export function calculateXfip(
  hitsAllowed: number,
  walks: number,
  strikeouts: number,
  ip: number
): number {
  if (ip <= 0) return REPLACEMENT_XFIP;
  const hrEst = hitsAllowed * 0.115;
  const val = (13 * hrEst + 3 * walks - 2 * strikeouts) / ip + 3.10;
  return Number(val.toFixed(2));
}

/**
 * Calculate K-BB% (Strikeout minus Walk percentage)
 */
export function calculateKbbPct(
  strikeouts: number,
  walks: number,
  ip: number,
  hitsAllowed: number
): number {
  const bf = ip * 3 + hitsAllowed + walks + strikeouts;
  if (bf <= 0) return REPLACEMENT_K_BB;
  return Number(((strikeouts - walks) / bf).toFixed(3));
}

/**
 * Apply Bayesian Shrinkage
 * shrunk = weight * ema_value + (1 - weight) * prior_value
 * where weight = min(1.0, volume / threshold)
 */
export function applyBayesianShrinkage(
  emaValue: number,
  volume: number,
  priorValue: number,
  threshold: number
): number {
  const weight = Math.min(1.0, Math.max(0.0, volume / threshold));
  const val = weight * emaValue + (1.0 - weight) * priorValue;
  return Number(val.toFixed(3));
}
