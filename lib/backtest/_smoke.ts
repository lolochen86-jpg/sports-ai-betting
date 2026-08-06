/**
 * Smoke test — 用合成資料驗證整條回測流程能跑通，包含 Look-ahead 防禦與樣本數守衛驗證。
 * 執行：npx tsx lib/backtest/_smoke.ts
 */
import assert from "node:assert";
import {
  walkForward,
  naivePredictor,
  type FactorDescriptor,
  type PredictionRecord,
  type FactorKey,
} from "./index";

const FACTOR_KEYS: FactorKey[] = [
  "parkFactor",
  "restTravel",
  "adi",
  "bullpenDepth",
  "starterFip",
];

function day(d: number): string {
  return `2025-${String(Math.floor((d - 1) / 28) + 1).padStart(2, "0")}-${String(
    ((d - 1) % 28) + 1,
  ).padStart(2, "0")}`;
}

function buildRecords(days: number): PredictionRecord[] {
  const records: PredictionRecord[] = [];
  for (let d = 1; d <= days; d++) {
    const factors: Partial<Record<FactorKey, number>> = {};
    for (const k of FACTOR_KEYS) factors[k] = Math.random();
    const homeWin = Math.random() < 0.5;
    records.push({
      prediction: {
        gameId: `g-${d}`,
        day: day(d),
        predictedAt: `${day(d)}T12:00:00Z`,
        factors,
        enabledFactors: FACTOR_KEYS,
        market: {
          gameId: `g-${d}`,
          capturedAt: `${day(d)}T11:00:00Z`,
          marketType: "moneyline",
          line: 1.5,
          homeOdds: 1.9,
          awayOdds: 1.9,
        },
        side: homeWin ? "home" : "away",
        probability: 0.5,
        modelId: "skeleton",
      },
      outcome: { type: "moneyline", winner: homeWin ? "home" : "away" },
    });
  }
  return records;
}

const pastDescriptors: FactorDescriptor[] = FACTOR_KEYS.map((key, i) => ({
  key,
  availableAt: "2025-01-01T00:00:00Z",
  sampleCount: 500 - i * 40, // starterFip (340) 樣本偏少，測試自動停用
  calibratedCoefficient: null,
}));

const futureDescriptors: FactorDescriptor[] = FACTOR_KEYS.map((key, i) => ({
  key,
  // 刻意將 'adi' 設為未來時間戳
  availableAt: key === "adi" ? "2026-01-01T00:00:00Z" : "2025-01-01T00:00:00Z",
  sampleCount: 500 - i * 40,
  calibratedCoefficient: null,
}));

async function main() {
  console.log("==========================================");
  console.log("測試案例 1：全過去時間戳資料（基線測試）");
  console.log("==========================================");

  const records1 = buildRecords(120);
  const report1 = await walkForward(records1, {
    config: { trainDays: 30, validateDays: 7, stepDays: 7 },
    descriptors: pastDescriptors,
    predict: naivePredictor,
  });

  console.log("=== 視窗數 ===", report1.windows.length);
  console.log("=== 匯總 ===", report1.aggregate);
  console.log("=== 基線比較 ===", report1.baseline);
  console.log("=== 防護 ===", report1.guard);
  console.log("=== Look-ahead 攔截因子 ===", report1.guard?.lookAheadBlockedFactors);
  console.log("=== 因子樣本不足被停用 ===", report1.guard?.blockedFactors);
  console.log("=== 警告 ===", report1.warnings);

  // 斷言驗收標準
  assert.deepStrictEqual(
    report1.guard?.lookAheadBlockedFactors,
    [],
    "過去時間戳資料時，lookAheadBlockedFactors 應為空陣列",
  );
  assert.ok(
    report1.guard?.blockedFactors.includes("starterFip"),
    "starterFip 樣本數偏少 (340 < 350) 應被列入 blockedFactors",
  );
  assert.notStrictEqual(
    report1.aggregate.overallRoi,
    0.05,
    "overallRoi 不應再為寫死的 0.05",
  );

  console.log("\n==========================================");
  console.log("測試案例 2：含未來時間戳因子 (adi)（Look-ahead 攔截測試）");
  console.log("==========================================");

  const records2 = buildRecords(120);
  const report2 = await walkForward(records2, {
    config: { trainDays: 30, validateDays: 7, stepDays: 7 },
    descriptors: futureDescriptors,
    predict: naivePredictor,
  });

  console.log("=== 視窗數 ===", report2.windows.length);
  console.log("=== 匯總 ===", report2.aggregate);
  console.log("=== 防護 ===", report2.guard);
  console.log("=== Look-ahead 攔截因子 ===", report2.guard?.lookAheadBlockedFactors);
  console.log("=== 警告 ===", report2.warnings);

  // 斷言驗收標準
  assert.ok(
    report2.guard?.lookAheadBlockedFactors.includes("adi"),
    "含未來時間戳因子時，lookAheadBlockedFactors 必須包含 'adi'",
  );
  assert.ok(
    report2.warnings.some((w) => w.includes("Look-ahead 攔截")),
    "warnings 中必須出現 'Look-ahead 攔截' 訊息",
  );

  console.log("\n✅ 所有驗收標準皆已成功通過！");
}

main().catch((e) => {
  console.error("❌ 測試失敗:", e);
  process.exit(1);
});
