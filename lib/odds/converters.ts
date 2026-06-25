/**
 * Converts American odds representation to Decimal representation.
 * American odds: positive (e.g., +150) or negative (e.g., -110).
 * Decimal odds: represent return including stake (e.g., 2.50, 1.91).
 * 
 * @param american American odds value (e.g., 150 or -110)
 * @returns number Decimal odds format (returns 1.0 on invalid or zero odds)
 */
export function americanToDecimal(american: number): number {
  if (american === 0) return 1.0;
  
  if (american > 0) {
    return Number((1 + (american / 100)).toFixed(3));
  } else {
    return Number((1 + (100 / Math.abs(american))).toFixed(3));
  }
}

/**
 * Calculates the implied probability of winning from a decimal odds price.
 * Formula: Implied Probability = 1 / Decimal Odds.
 * 
 * @param decimalOdds Decimal odds price (e.g., 2.50)
 * @returns number Implied winning probability as a decimal (0.0 to 1.0)
 */
export function impliedProbability(decimalOdds: number): number {
  if (decimalOdds <= 1.0) return 0.0;
  return 1.0 / decimalOdds;
}

/**
 * Computes the recommended Kelly Criterion fraction bet size.
 * Uses fractional Kelly (defaulting to 1/4 Kelly, which is 0.25).
 * Formula: f* = (p * decimalOdds - 1) / (decimalOdds - 1)
 * 
 * @param aiWinProb AI-predicted winning probability (accepts 0-100 or 0-1)
 * @param decimalOdds Best decimal odds available (e.g., 2.15)
 * @param fraction Fractional Kelly multiplier (defaults to 0.25 for 1/4 Kelly)
 * @returns number Safe bet allocation size as a percentage fraction (0.0 to 1.0)
 */
export function kellyFraction(aiWinProb: number, decimalOdds: number, fraction: number = 0.25): number {
  if (decimalOdds <= 1.0) return 0.0;

  // Convert percentage (0-100) to decimal probability (0-1)
  const p = aiWinProb > 1.0 ? aiWinProb / 100 : aiWinProb;
  if (p <= 0.0 || p >= 1.0) return 0.0;

  // Net odds multiplier (b = decimalOdds - 1)
  const b = decimalOdds - 1.0;
  
  // standard Kelly Formula: f = (p * b - (1 - p)) / b = (p * decimalOdds - 1) / (decimalOdds - 1)
  const f = (p * decimalOdds - 1.0) / b;
  
  // Apply fractional Kelly limit and guard negative expectations
  if (f <= 0.0) return 0.0;
  return Number((f * fraction).toFixed(4));
}

/**
 * Calculates both the edge and Expected Value ROI for a prediction.
 * Edge is the absolute probability difference: p - impliedProbability.
 * EV ROI is the net expected return: p * decimalOdds - 1.
 * 
 * @param aiWinProb AI-predicted winning probability (accepts 0-100 or 0-1)
 * @param decimalOdds Available decimal odds price (e.g., 1.95)
 * @returns object Contains calculated edge, EV ROI, and a flag indicating if it has a positive expectation
 */
export function calculateEdge(
  aiWinProb: number,
  decimalOdds: number
): { edge: number; evRoi: number; shouldBet: boolean } {
  if (decimalOdds <= 1.0) {
    return { edge: 0.0, evRoi: 0.0, shouldBet: false };
  }

  const p = aiWinProb > 1.0 ? aiWinProb / 100 : aiWinProb;
  const implied = impliedProbability(decimalOdds);
  
  const edge = p - implied;
  const evRoi = p * decimalOdds - 1.0;
  const shouldBet = edge > 0.0;

  return {
    edge: Number(edge.toFixed(4)),
    evRoi: Number(evRoi.toFixed(4)),
    shouldBet
  };
}

/**
 * Returns a grade recommendation score based on the calculated edge.
 * 
 * @param edge Calculated edge probability difference (0.0 to 1.0)
 * @returns 'A+' | 'A' | 'B' | 'skip'
 */
export function gradeEdge(edge: number): 'A+' | 'A' | 'B' | 'skip' {
  if (edge >= 0.08) return 'A+';
  if (edge >= 0.04) return 'A';
  if (edge > 0.0) return 'B';
  return 'skip';
}
