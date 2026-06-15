/**
 * 台灣運彩賠率價值分析的數學計算公用單元
 */

/**
 * 計算保本最低賠率 (Break-even odds)
 * 保本賠率 = 1 / AI勝率
 */
export function calculateBreakEvenOdds(prob: number): number {
  if (prob <= 0) return 999;
  return Number((1 / prob).toFixed(2));
}

/**
 * 計算要求 Edge +4% 的最低賠率
 * targetOdds = 1 / (AI勝率 - 0.04)
 */
export function calculateTargetOddsEdge(prob: number): number {
  const adjustedProb = prob - 0.04;
  if (adjustedProb <= 0) return 999;
  return Number((1 / adjustedProb).toFixed(2));
}

/**
 * 計算要求 EV ROI +5% 的最低賠率
 * targetOdds = 1.05 / AI勝率
 */
export function calculateTargetOddsEv(prob: number): number {
  if (prob <= 0) return 999;
  return Number((1.05 / prob).toFixed(2));
}

/**
 * 計算台運隱含勝率
 * impliedProbability = 1 / 台運賠率
 */
export function calculateImpliedProbability(odds: number): number {
  if (odds <= 0) return 0;
  return Number((1 / odds).toFixed(4));
}

/**
 * 計算 Edge% (AI勝率 - 台運隱含勝率)
 * 回傳值為小數 (例如 0.08 代表 8%)
 */
export function calculateEdge(prob: number, odds: number): number {
  if (odds <= 0) return 0;
  const implied = 1 / odds;
  return Number((prob - implied).toFixed(4));
}

/**
 * 計算 EV ROI (AI勝率 * 台運賠率 - 1)
 * 回傳值為小數 (例如 0.05 代表 5%)
 */
export function calculateEvRoi(prob: number, odds: number): number {
  if (odds <= 0) return -1;
  return Number((prob * odds - 1).toFixed(4));
}

/**
 * 計算凱利公式建議比例 (Kelly Criterion)
 * b = 台運賠率 - 1
 * q = 1 - AI勝率
 * kelly = (b * prob - q) / b
 * 如果 Kelly < 0，回傳 0
 */
export function calculateKelly(prob: number, odds: number): number {
  if (odds <= 1 || prob <= 0) return 0;
  const b = odds - 1;
  const q = 1 - prob;
  const kelly = (b * prob - q) / b;
  return kelly < 0 ? 0 : Number(kelly.toFixed(4));
}

/**
 * 計算 1/4 凱利公式建議比例 (1/4 Kelly)
 */
export function calculateQuarterKelly(prob: number, odds: number): number {
  const kelly = calculateKelly(prob, odds);
  return Number((kelly / 4).toFixed(4));
}

/**
 * 計算建議下注金額
 * suggestedBet = 1/4 Kelly * 本金 (預設 10,000 元)
 */
export function calculateSuggestedBet(
  prob: number,
  odds: number,
  bankroll = 10000
): number {
  const quarterKelly = calculateQuarterKelly(prob, odds);
  return Math.round(quarterKelly * bankroll);
}
