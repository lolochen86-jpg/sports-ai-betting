/**
 * Defensive Synergy Module
 * Ports the defensive synergy logic from feature_engineering.py.
 */

export interface DefensiveSynergyResult {
  baseExpectedRuns: number;
  adjustedExpectedRuns: number;
  framingAdjustment: number;
  infieldOaaAdjustment: number;
  gbWeightMultiplier: number;
  synergyTotal: number;
}

/**
 * Apply defensive synergy to adjust starting pitcher expected runs
 */
export function applyDefensiveSynergy(
  pitcherGbPct: number = 0.43,
  catcherFramingRuns: number = 0.0,
  middleInfieldOaa: number = 0.0,
  baseExpectedRuns: number = 4.2
): DefensiveSynergyResult {
  const gbPct = Number.isFinite(pitcherGbPct) ? pitcherGbPct : 0.43;
  const framing = Number.isFinite(catcherFramingRuns) ? catcherFramingRuns : 0.0;
  const miOaa = Number.isFinite(middleInfieldOaa) ? middleInfieldOaa : 0.0;

  const gbWeight = gbPct > 0.50 ? 1.75 : 1.0;

  const framingAdj = -framing * 0.08;
  const infieldAdj = -miOaa * 0.15 * gbWeight;
  const synergyTotal = framingAdj + infieldAdj;
  const adjustedRuns = Math.max(baseExpectedRuns + synergyTotal, 0.1);

  return {
    baseExpectedRuns,
    adjustedExpectedRuns: Number(adjustedRuns.toFixed(2)),
    framingAdjustment: Number(framingAdj.toFixed(2)),
    infieldOaaAdjustment: Number(infieldAdj.toFixed(2)),
    gbWeightMultiplier: gbWeight,
    synergyTotal: Number(synergyTotal.toFixed(2)),
  };
}
