/**
 * 特殊標註生成器
 * 根據球隊近期得分分布與先發投手 ERA 產生注意事項標籤
 */

export interface AnnotationInput {
  teamName: string;            // 中文隊名
  recentGameScores?: number[]; // 近10場個別得分
  pitcherName?: string;        // 先發投手名
  pitcherEra?: number;         // 先發投手防禦率
  league: 'MLB' | 'NBA';
  side: 'home' | 'away';      // 主/客隊
}

/**
 * 產生單一球隊的特殊標註
 */
export function generateTeamAnnotations(input: AnnotationInput): string[] {
  const annotations: string[] = [];
  const { teamName, recentGameScores, pitcherName, pitcherEra, league } = input;

  if (recentGameScores && recentGameScores.length >= 5) {
    // 高得分警示：近10場中有 ≥3 場超過 10 分
    const highScoreGames = recentGameScores.filter(s => s > 10).length;
    if (highScoreGames >= 3) {
      annotations.push(`🔥 ${teamName} 近${recentGameScores.length}場有${highScoreGames}場破10分`);
    }

    // 低得分警示：近10場中有 ≥3 場低於 3 分
    const lowScoreGames = recentGameScores.filter(s => s < 3).length;
    if (lowScoreGames >= 3) {
      annotations.push(`🧊 ${teamName} 近${recentGameScores.length}場有${lowScoreGames}場低於3分`);
    }
  }

  // 王牌投手標註：ERA < 2.0 (僅 MLB)
  if (league === 'MLB' && pitcherName && pitcherEra !== undefined && pitcherEra < 2.0) {
    annotations.push(`👑 ${teamName} 王牌先發 ${pitcherName} (ERA ${pitcherEra.toFixed(2)})`);
  }

  return annotations;
}

/**
 * 產生一場比賽雙方的所有特殊標註
 */
export function generateGameAnnotations(
  homeInput: AnnotationInput,
  awayInput: AnnotationInput
): string[] {
  return [
    ...generateTeamAnnotations(homeInput),
    ...generateTeamAnnotations(awayInput),
  ];
}
