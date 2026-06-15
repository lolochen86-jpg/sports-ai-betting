/**
 * 台灣運彩賠率 Edge 與分級判定引擎（含串關計算）
 * lib/betting/edgeEngine.ts
 */

export type BettingGrade = 'A' | 'B' | 'C' | 'D';

/**
 * 依據 Edge 和 EV ROI 進行下注分級
 * 輸入參數為小數 (例如 0.08 代表 8%)
 *
 * A 級：Edge >= 8% 且 EV ROI >= 8%
 * B 級：Edge >= 4% 且 EV ROI >= 4%
 * C 級：Edge >= 0 且 EV ROI >= 0
 * D 級：Edge < 0 或 EV ROI < 0
 */
export function getBettingGrade(edge: number, evRoi: number): BettingGrade {
  if (edge >= 0.08 && evRoi >= 0.08) return 'A';
  if (edge >= 0.04 && evRoi >= 0.04) return 'B';
  if (edge >= 0 && evRoi >= 0) return 'C';
  return 'D';
}

/**
 * 取得下注級別的建議文案
 */
export function getGradeText(grade: BettingGrade): string {
  switch (grade) {
    case 'A':
      return '高價值，可單關優先';
    case 'B':
      return '有下注價值，小注可買';
    case 'C':
      return '接近合理價，觀察即可';
    case 'D':
    default:
      return '賠率不划算，不建議下注';
  }
}

interface ParlayAdvice {
  text: string;
  isSuitableForParlay: boolean;
}

/**
 * 判定過關限制與 2 串 1 的適合程度
 * @param legLimit 台灣運彩過關限制：1 代表可單關，2 代表至少 2 關，3 代表至少 3 關
 * @param edge 邊際期望值百分比小數
 * @param grade 下注評級 A/B/C/D
 */
export function getParlayRecommendation(
  legLimit: number,
  edge: number,
  grade: BettingGrade
): ParlayAdvice {
  // 如果不能單關 (即限制 2 關或 3 關以上)
  if (legLimit > 1) {
    if (edge >= 0) {
      return {
        text: `此場限制過關 (${legLimit}關)，但預測具正價值 (${(edge * 100).toFixed(1)}%)，適合拿來做 2 串 1 組合。`,
        isSuitableForParlay: true,
      };
    } else {
      return {
        text: `此場不具價值且限制過關 (${legLimit}關)，不建議下注也不適合作為串關配腳。`,
        isSuitableForParlay: false,
      };
    }
  }

  // 如果可以單關
  switch (grade) {
    case 'A':
      return {
        text: '支持單關，且賠率價值極高，推薦直接單場下注！',
        isSuitableForParlay: false,
      };
    case 'B':
      return {
        text: '支持單關，具備投注價值，推薦單場小注下注。',
        isSuitableForParlay: false,
      };
    case 'C':
      return {
        text: '支持單關，但利潤空間極小，建議以配腳或觀察為主。',
        isSuitableForParlay: false,
      };
    case 'D':
    default:
      return {
        text: '雖支持單關，但期望值為負，不建議進行任何投注。',
        isSuitableForParlay: false,
      };
  }
}

// ─── 串關計算 ────────────────────────────────────────────────────────────────

export interface ParlayLeg {
  gameId: string;
  label: string;          // 顯示名稱，例如 "洋基 (Home)"
  aiProb: number;         // AI 勝率 (0-1)
  odds: number;           // 台運賠率 (decimal)
  grade: BettingGrade;
  edge: number;
  evRoi: number;
  legLimit: number;
}

export interface ParlayResult {
  legs: ParlayLeg[];
  parlayProb: number;     // 串關整體 AI 勝率
  parlayOdds: number;     // 串關整體賠率
  parlayEv: number;       // 串關 EV ROI
  /** 串關規則建議等級 */
  parlayGrade: 'AA' | 'AB' | 'BB' | 'invalid';
  /** 是否推薦 */
  isRecommended: boolean;
  /** 建議說明 */
  advice: string;
  /** 建議下注金額 */
  suggestedBet: number;
}

/**
 * 判斷串關組合是否合法且計算結果
 *
 * 串關規則：
 * - A + A → 推薦，標準下注
 * - A + B → 可小注
 * - B + B → 觀察，不主動推薦
 * - 含 C/D → 不可加入串關
 * - 三關以上 → 預設不推薦，除非全部 A 級
 */
export function calculateParlay(
  legs: ParlayLeg[],
  maxParlayBet: number
): ParlayResult {
  // 計算串關機率與賠率
  const parlayProb = legs.reduce((acc, leg) => acc * leg.aiProb, 1);
  const parlayOdds = legs.reduce((acc, leg) => acc * leg.odds, 1);
  const parlayEv = Number((parlayProb * parlayOdds - 1).toFixed(4));

  const grades = legs.map((l) => l.grade);
  const hasCD = grades.some((g) => g === 'C' || g === 'D');
  const allA = grades.every((g) => g === 'A');
  const legCount = legs.length;

  // 含 C/D → 無效
  if (hasCD) {
    return {
      legs,
      parlayProb,
      parlayOdds,
      parlayEv,
      parlayGrade: 'invalid',
      isRecommended: false,
      advice: '⛔ C/D 級不可加入串關，請移除低價值場次。',
      suggestedBet: 0,
    };
  }

  // 三關以上但非全 A
  if (legCount >= 3 && !allA) {
    return {
      legs,
      parlayProb,
      parlayOdds,
      parlayEv,
      parlayGrade: 'invalid',
      isRecommended: false,
      advice: '⚠️ 三關以上預設不推薦，除非全部為 A 級。不要為了湊關硬買，低賠不等於安全。',
      suggestedBet: 0,
    };
  }

  // 確定組合等級
  const aCount = grades.filter((g) => g === 'A').length;
  const bCount = grades.filter((g) => g === 'B').length;

  let parlayGrade: 'AA' | 'AB' | 'BB' | 'invalid';
  let isRecommended: boolean;
  let advice: string;
  let suggestedBet: number;

  if (allA) {
    parlayGrade = 'AA';
    isRecommended = parlayEv > 0;
    suggestedBet = Math.min(maxParlayBet, Math.round(maxParlayBet));
    advice = parlayEv > 0
      ? `🔥 A+A 串關，EV ROI ${(parlayEv * 100).toFixed(1)}%，建議下注 $${suggestedBet}。`
      : '⚠️ A+A 組合但整體 EV 為負，謹慎評估。';
  } else if (aCount >= 1 && bCount >= 1) {
    parlayGrade = 'AB';
    isRecommended = parlayEv > 0;
    suggestedBet = Math.min(Math.round(maxParlayBet * 0.5), maxParlayBet);
    advice = parlayEv > 0
      ? `💛 A+B 串關，EV ROI ${(parlayEv * 100).toFixed(1)}%，可小注 $${suggestedBet}。`
      : '⚠️ A+B 組合但整體 EV 為負，不建議下注。';
  } else {
    // B+B
    parlayGrade = 'BB';
    isRecommended = false;
    suggestedBet = 0;
    advice = `👀 B+B 串關，EV ROI ${(parlayEv * 100).toFixed(1)}%，僅觀察，不主動推薦。不要為了湊關硬買，低賠不等於安全。`;
  }

  return {
    legs,
    parlayProb: Number(parlayProb.toFixed(4)),
    parlayOdds: Number(parlayOdds.toFixed(3)),
    parlayEv,
    parlayGrade,
    isRecommended,
    advice,
    suggestedBet,
  };
}

/**
 * 從可用投注中自動產生所有 2 串 1 推薦組合（A+A 優先，其次 A+B）
 */
export function generateParlaySuggestions(
  legs: ParlayLeg[],
  maxParlayBet: number
): ParlayResult[] {
  const eligible = legs.filter(
    (l) => (l.grade === 'A' || l.grade === 'B') && l.odds > 0 && l.aiProb > 0
  );

  const results: ParlayResult[] = [];

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const combo = [eligible[i], eligible[j]];
      const result = calculateParlay(combo, maxParlayBet);
      if (result.parlayGrade !== 'invalid' && result.parlayEv > 0) {
        results.push(result);
      }
    }
  }

  // 排序：AA 優先，其次 AB，再依 EV 由高到低
  return results.sort((a, b) => {
    const gradeOrder = { AA: 0, AB: 1, BB: 2, invalid: 3 };
    if (gradeOrder[a.parlayGrade] !== gradeOrder[b.parlayGrade]) {
      return gradeOrder[a.parlayGrade] - gradeOrder[b.parlayGrade];
    }
    return b.parlayEv - a.parlayEv;
  });
}
