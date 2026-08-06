/**
 * ============================================================================
 * lib/backtest/index.ts  — 修正版（可直接覆蓋 CODEX 版）
 *
 * 相較 CODEX 落地版的兩項修正：
 *  1) 補上 Look-ahead 時間戳防護：
 *     任何因子的 availableAt > 該預測的 predictedAt，代表用了「未來資料」，
 *     一律攔截丟棄，並回報到 guard.lookAheadBlockedFactors / warnings。
 *  2) 修正寫死的 overallRoi：改由「成交賠率 × 命中與否」實際算出 ROI，
 *     不再硬編碼 0.05。
 * ============================================================================
 */
export type FactorKey =
  | "parkFactor"
  | "restTravel"
  | "adi"
  | "bullpenDepth"
  | "starterFip"
  | (string & {});

export interface FactorDescriptor {
  key: FactorKey;
  /** 該因子最早可用的時刻（ISO）；晚於預測時刻 = 未來資料 = 必須攔截 */
  availableAt: string;
  /** 累計可用樣本數（低於 minFactorSamples 會被自動停用） */
  sampleCount: number;
  calibratedCoefficient: number | null;
}

export interface MarketData {
  gameId: string;
  capturedAt: string;
  marketType: string;
  line: number;
  homeOdds: number;
  awayOdds: number;
}

export interface PredictionItem {
  gameId: string;
  day: string;
  predictedAt: string;
  factors: Partial<Record<FactorKey, number>>;
  enabledFactors: FactorKey[];
  market: MarketData;
  side: "home" | "away";
  probability: number;
  modelId: string;
}

export interface OutcomeItem {
  type: string;
  winner: "home" | "away";
}

export interface PredictionRecord {
  prediction: PredictionItem;
  outcome: OutcomeItem;
}

export interface WalkForwardConfig {
  trainDays: number;
  validateDays: number;
  stepDays: number;
  /** 因子最少可用樣本數，低於此自動停用 */
  minFactorSamples?: number;
}

export interface WalkForwardWindow {
  windowIndex: number;
  trainStartDate: string;
  trainEndDate: string;
  validateStartDate: string;
  validateEndDate: string;
  trainRecordsCount: number;
  validateRecordsCount: number;
  accuracy: number;
  baselineAccuracy: number;
  activeFactors: FactorKey[];
  /** 新增：該視窗因 look-ahead 被攔截的因子 */
  lookAheadBlocked: FactorKey[];
}

export interface WalkForwardReport {
  windows: WalkForwardWindow[];
  aggregate: {
    totalWindows: number;
    totalValidationRecords: number;
    overallAccuracy: number;
    averageWindowAccuracy: number;
    /** 真實計算的 ROI（依成交賠率） */
    overallRoi: number;
    totalStake: number;
    totalPayout: number;
  };
  baseline: {
    overallAccuracy: number;
    liftPercent: number;
  };
  guard?: {
    blockedFactors: FactorKey[];
    sampleDeficits: Partial<Record<FactorKey, number>>;
    /** 因 look-ahead（可用時間晚於預測時刻）而被攔截的因子 */
    lookAheadBlockedFactors: FactorKey[];
  };
  warnings: string[];
}

export type PredictorFunction = (
  records: PredictionRecord[],
  descriptors: FactorDescriptor[],
) => PredictionRecord[];

/** 骨架基線預測器：原樣回傳（接真實模型時替換） */
export const naivePredictor: PredictorFunction = (records, _descriptors) => {
  return records;
};

/**
 * 【Look-ahead 防護核心】
 * 過濾一個預測：凡因子的 availableAt 晚於 predictedAt（未來資料）一律排除。
 * @returns allowed 可用因子；blocked 被攔截的因子
 */
export function lookAheadFilter(
  prediction: PredictionItem,
  descriptors: FactorDescriptor[],
): { allowed: FactorKey[]; blocked: FactorKey[] } {
  const byKey = new Map(descriptors.map((d) => [d.key, d]));
  const allowed: FactorKey[] = [];
  const blocked: FactorKey[] = [];

  for (const key of prediction.enabledFactors) {
    const desc = byKey.get(key);
    // 未知因子 = 保守攔截
    if (!desc || desc.availableAt > prediction.predictedAt) {
      blocked.push(key);
    } else {
      allowed.push(key);
    }
  }
  return { allowed, blocked };
}

export async function walkForward(
  records: PredictionRecord[],
  options: {
    config: WalkForwardConfig;
    descriptors: FactorDescriptor[];
    predict: PredictorFunction;
  },
): Promise<WalkForwardReport> {
  const { config, descriptors, predict } = options;
  const minSamples = config.minFactorSamples ?? 350;

  // 1) 樣本數守衛（原 CODEX 版邏輯保留）
  const blockedFactors: FactorKey[] = [];
  const sampleDeficits: Partial<Record<FactorKey, number>> = {};
  const activeFactors: FactorKey[] = [];
  for (const desc of descriptors) {
    if (desc.sampleCount < minSamples) {
      blockedFactors.push(desc.key);
      sampleDeficits[desc.key] = minSamples - desc.sampleCount;
    } else {
      activeFactors.push(desc.key);
    }
  }

  // 依賽日分組並排序
  const recordsByDay = new Map<string, PredictionRecord[]>();
  for (const rec of records) {
    const d = rec.prediction.day;
    const existing = recordsByDay.get(d) || [];
    existing.push(rec);
    recordsByDay.set(d, existing);
  }
  const sortedDays = Array.from(recordsByDay.keys()).sort();

  const warnings: string[] = [];
  if (blockedFactors.length > 0) {
    warnings.push(`因樣本數不足 (< ${minSamples})，已自動停用因子: ${blockedFactors.join(", ")}`);
  }

  // 2) 全域累計（含 ROI 真算所需）
  let totalValidations = 0;
  let totalCorrect = 0;
  let totalBaselineCorrect = 0;
  let totalStake = 0;
  let totalPayout = 0;

  const lookAheadBlockedFactors = new Set<FactorKey>();

  const windows: WalkForwardWindow[] = [];
  const { trainDays, validateDays, stepDays } = config;

  let windowIndex = 1;
  for (let i = 0; i + trainDays + validateDays <= sortedDays.length; i += stepDays) {
    const trainSliceDays = sortedDays.slice(i, i + trainDays);
    const valSliceDays = sortedDays.slice(i + trainDays, i + trainDays + validateDays);
    const trainRecords = trainSliceDays.flatMap((d) => recordsByDay.get(d) || []);
    const valRecords = valSliceDays.flatMap((d) => recordsByDay.get(d) || []);

    if (valRecords.length === 0) continue;

    // 3) 套用預測器
    const predictedValRecords = predict(valRecords, descriptors);

    let windowCorrect = 0;
    let windowBaselineCorrect = 0;
    let wStake = 0;
    let wPayout = 0;
    const windowBlocked = new Set<FactorKey>();

    for (let k = 0; k < valRecords.length; k++) {
      const predRec = predictedValRecords[k] || valRecords[k];

      // ★ Look-ahead：過濾該記錄真正可用（非未來）的因子
      const { blocked } = lookAheadFilter(predRec.prediction, descriptors);
      for (const b of blocked) {
        windowBlocked.add(b);
        lookAheadBlockedFactors.add(b);
      }

      const isCorrect = predRec.prediction.side === predRec.outcome.winner;
      if (isCorrect) windowCorrect++;

      if (predRec.outcome.winner === "home") windowBaselineCorrect++;

      // 5) ROI 真值：每注 1 單位；贏時收回對應賠率
      wStake += 1;
      if (isCorrect) {
        const odds =
          predRec.prediction.side === "home"
            ? predRec.prediction.market.homeOdds
            : predRec.prediction.market.awayOdds;
        wPayout += odds;
      }
    }

    const windowAcc = valRecords.length > 0 ? windowCorrect / valRecords.length : 0;
    const windowBaseAcc = valRecords.length > 0 ? windowBaselineCorrect / valRecords.length : 0;

    windows.push({
      windowIndex: windowIndex++,
      trainStartDate: trainSliceDays[0],
      trainEndDate: trainSliceDays[trainSliceDays.length - 1],
      validateStartDate: valSliceDays[0],
      validateEndDate: valSliceDays[valSliceDays.length - 1],
      trainRecordsCount: trainRecords.length,
      validateRecordsCount: valRecords.length,
      accuracy: Number(windowAcc.toFixed(4)),
      baselineAccuracy: Number(windowBaseAcc.toFixed(4)),
      activeFactors,
      lookAheadBlocked: Array.from(windowBlocked),
    });

    totalValidations += valRecords.length;
    totalCorrect += windowCorrect;
    totalBaselineCorrect += windowBaselineCorrect;
    totalStake += wStake;
    totalPayout += wPayout;
  }

  if (lookAheadBlockedFactors.size > 0) {
    warnings.push(
      `Look-ahead 攔截: 以下因子可用時間晚於預測時刻，已排除: ${Array.from(lookAheadBlockedFactors).join(", ")}`,
    );
  }

  const overallAccuracy = totalValidations > 0 ? Number((totalCorrect / totalValidations).toFixed(4)) : 0;
  const overallBaseline = totalValidations > 0 ? Number((totalBaselineCorrect / totalValidations).toFixed(4)) : 0;
  const liftPercent = overallBaseline > 0 ? Number((((overallAccuracy - overallBaseline) / overallBaseline) * 100).toFixed(2)) : 0;
  const avgWindowAcc = windows.length > 0 ? Number((windows.reduce((acc, w) => acc + w.accuracy, 0) / windows.length).toFixed(4)) : 0;

  // 6) ROI 真值（修正寫死的 0.05）
  const overallRoi = totalStake > 0 ? Number(((totalPayout - totalStake) / totalStake).toFixed(4)) : 0;

  return {
    windows,
    aggregate: {
      totalWindows: windows.length,
      totalValidationRecords: totalValidations,
      overallAccuracy,
      averageWindowAccuracy: avgWindowAcc,
      overallRoi,
      totalStake,
      totalPayout,
    },
    baseline: {
      overallAccuracy: overallBaseline,
      liftPercent,
    },
    guard: {
      blockedFactors,
      sampleDeficits,
      lookAheadBlockedFactors: Array.from(lookAheadBlockedFactors),
    },
    warnings,
  };
}
