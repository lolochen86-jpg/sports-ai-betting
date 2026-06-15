import { TaiwanOdds, ModelPredictionSnapshot, EdgeSignal } from '@/types/betting';

/**
 * 計算隱含機率 (1 / 賠率)
 */
export function calculateImpliedProbability(odds: number): number {
  if (odds <= 0) return 0;
  return 1 / odds;
}

/**
 * 計算公平賠率 (1 / 機率)
 */
export function calculateFairOdds(modelProb: number): number {
  if (modelProb <= 0) return 999; // 趨於無窮大
  return 1 / modelProb;
}

/**
 * 計算期望值 Expected Value (機率 * 賠率 - 1)
 */
export function calculateExpectedValue(modelProb: number, taiwanOdds: number): number {
  return modelProb * taiwanOdds - 1;
}

/**
 * 計算 Edge 百分比 (EV * 100)
 */
export function calculateEdgePercent(modelProb: number, taiwanOdds: number): number {
  return calculateExpectedValue(modelProb, taiwanOdds) * 100;
}

/**
 * 批量計算與配對 Edge 信號
 */
export function calculateEdgeSignals(
  oddsList: TaiwanOdds[],
  predictions: ModelPredictionSnapshot[]
): EdgeSignal[] {
  const signals: EdgeSignal[] = [];

  for (const odds of oddsList) {
    // 找出對應的預測快照 (同一場比賽且模型匹配)
    const matchPred = predictions.find(
      (p) => p.gameExternalId === odds.gameExternalId
    );

    if (!matchPred) continue;

    // 根據玩法類型和下注選擇，決定模型的勝率
    let modelProbability = 0;

    if (odds.marketType === 'moneyline') {
      if (odds.selection === 'home') {
        modelProbability = matchPred.homeProb;
      } else if (odds.selection === 'away') {
        modelProbability = matchPred.awayProb;
      }
    } else if (odds.marketType === 'spread') {
      // 讓分玩法簡化估算機率
      // 若預測勝方與投注選擇一致，給予模型信心度機率，否則為 1 - 信心度
      const isWinnerPick = odds.selection === matchPred.predictedWinner;
      modelProbability = isWinnerPick ? matchPred.confidence / 100 : (100 - matchPred.confidence) / 100;
    } else if (odds.marketType === 'totals') {
      // 大小分玩法
      const isOUPick = odds.selection.toLowerCase() === matchPred.ouPick.toLowerCase();
      // 信心度轉化為大小分機率
      modelProbability = isOUPick ? matchPred.confidence / 100 : (100 - matchPred.confidence) / 100;
    } else if (odds.marketType === 'period_highest') {
      // 單局/節最高得分
      // 假設機率分佈在最優化算法中已處理，在此作預算配對
      // 若預測有最高得分單局預測，可直接配對
      // 預設給予模型信心度均值
      modelProbability = 0.25; // 預設值
    }

    if (modelProbability === 0) continue;

    const expectedValue = calculateExpectedValue(modelProbability, odds.taiwanOdds);
    const edgePercent = expectedValue * 100;
    const fairOdds = calculateFairOdds(modelProbability);
    // 信心度評分：結合預測信心度與 EV 幅度
    const confidenceScore = Math.min(100, Math.max(0, Math.round(matchPred.confidence * (1 + expectedValue))));

    signals.push({
      id: `${odds.id}_${matchPred.id}`,
      oddsId: odds.id,
      odds,
      modelPredId: matchPred.id,
      modelPrediction: matchPred,
      modelProbability,
      fairOdds,
      expectedValue,
      edgePercent,
      confidenceScore,
      isPositiveEdge: expectedValue > 0,
      modelSource: matchPred.model,
    });
  }

  return signals;
}

/**
 * 依 Edge 正期望值排序
 */
export function rankByEdge(signals: EdgeSignal[]): EdgeSignal[] {
  return [...signals].sort((a, b) => b.expectedValue - a.expectedValue);
}
