/**
 * 特殊標註生成器
 * 根據球隊近期得分分布、連勝/連敗、失分率與先發投手 ERA 產生注意事項標籤
 */

export interface AnnotationInput {
  teamName: string;            // 中文隊名
  recentGameScores?: number[]; // 近10場個別得分
  pitcherName?: string;        // 先發投手名
  pitcherEra?: number;         // 先發投手防禦率
  league: 'MLB' | 'NBA';
  side: 'home' | 'away';      // 主/客隊
  streak?: number;             // 近期連勝(正數)/連敗(負數)
  avgConceded10?: number;      // 近十場平均場均失分
}

/**
 * 產生單一球隊的特殊標註
 */
export function generateTeamAnnotations(input: AnnotationInput): string[] {
  const annotations: string[] = [];
  const { teamName, recentGameScores, pitcherName, pitcherEra, league, streak, avgConceded10 } = input;

  // 1. 得分異常警示 (依據聯盟特性設定不同門檻)
  if (recentGameScores && recentGameScores.length >= 5) {
    if (league === 'MLB') {
      // 棒球：高得分場次 (得分 > 10)
      const highScoreGames = recentGameScores.filter(s => s > 10).length;
      if (highScoreGames >= 3) {
        annotations.push(`🔥 ${teamName} 近${recentGameScores.length}場有 ${highScoreGames} 場得分破10分`);
      }
      // 棒球：低得分場次 (得分 < 3)
      const lowScoreGames = recentGameScores.filter(s => s < 3).length;
      if (lowScoreGames >= 3) {
        annotations.push(`🧊 ${teamName} 近${recentGameScores.length}場有 ${lowScoreGames} 場得分低於3分`);
      }
    } else {
      // 籃球：高得分場次 (得分 > 120)
      const highScoreGames = recentGameScores.filter(s => s > 120).length;
      if (highScoreGames >= 3) {
        annotations.push(`🔥 ${teamName} 近${recentGameScores.length}場有 ${highScoreGames} 場得分破120分`);
      }
      // 籃球：低得分場次 (得分 < 100)
      const lowScoreGames = recentGameScores.filter(s => s < 100).length;
      if (lowScoreGames >= 3) {
        annotations.push(`🧊 ${teamName} 近${recentGameScores.length}場有 ${lowScoreGames} 場得分低於100分`);
      }
    }
  }

  // 2. 先發投手防禦率標註 (僅限 MLB)
  if (league === 'MLB' && pitcherName && pitcherEra !== undefined) {
    if (pitcherEra < 2.00) {
      annotations.push(`👑 ${teamName} 王牌先發 ${pitcherName} (ERA ${pitcherEra.toFixed(2)})`);
    } else if (pitcherEra > 5.00) {
      annotations.push(`⚠️ ${teamName} 先發投手 ${pitcherName} 防禦率偏高 (ERA ${pitcherEra.toFixed(2)})`);
    }
  }

  // 3. 連勝/連敗氣勢標註 (臨界值 >= 4 或 <= -4)
  if (streak !== undefined) {
    if (streak >= 4) {
      annotations.push(`🚀 ${teamName} 處於 ${streak} 連勝強勢期`);
    } else if (streak <= -4) {
      annotations.push(`📉 ${teamName} 處於 ${Math.abs(streak)} 連敗低潮期`);
    }
  }

  // 4. 防守失分率警示
  if (avgConceded10 !== undefined) {
    if (league === 'MLB' && avgConceded10 > 5.5) {
      annotations.push(`🛡️ ${teamName} 近期場均失分偏高 (${avgConceded10.toFixed(1)}分)`);
    } else if (league === 'NBA' && avgConceded10 > 118.0) {
      annotations.push(`🛡️ ${teamName} 近期場均失分偏高 (${avgConceded10.toFixed(1)}分)`);
    }
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
