import {
  EdgeSignal,
  DailyBudget,
  StrategySettings,
  BetRecommendation,
  BetLeg,
  BetTicketDraft,
} from '@/types/betting';
import { checkTaiwanRules } from './rule-checker';

/**
 * 今日推薦投注產生引擎
 */
export function generateDailyRecommendations(
  date: string,
  edges: EdgeSignal[],
  budget: DailyBudget,
  settings: StrategySettings
): BetRecommendation[] {
  // 1. 篩選出符合策略門檻的正期望值信號
  const validEdges = edges.filter(
    (e) =>
      e.isPositiveEdge &&
      e.confidenceScore >= settings.minConfidence &&
      e.expectedValue >= settings.minExpectedValue
  );

  if (validEdges.length === 0) return [];

  // 2. 依 Expected Value 降序排列
  const sortedEdges = [...validEdges].sort((a, b) => b.expectedValue - a.expectedValue);

  // 3. 確保每場賽事只推薦一個最優 selections (去重)
  const seenGames = new Set<string>();
  const uniqueGameEdges: EdgeSignal[] = [];

  for (const edge of sortedEdges) {
    if (!seenGames.has(edge.odds.gameExternalId)) {
      seenGames.add(edge.odds.gameExternalId);
      uniqueGameEdges.push(edge);
    }
  }

  const recommendations: BetRecommendation[] = [];
  const remainingBudget = { ...budget };

  // 4. 依照推薦策略（單場、2串1、3串1）組合推薦
  const parlaySize = settings.preferredParlaySize; // 預設 1

  // 將訊號分組，每組 parlaySize 個
  let currentGroup: EdgeSignal[] = [];
  
  for (const edge of uniqueGameEdges) {
    // 檢查每日注單額度上限
    if (recommendations.length >= settings.maxTicketsPerDay) break;
    // 檢查預算是否足夠
    if (remainingBudget.remaining < settings.stakePerTicket) break;

    currentGroup.push(edge);

    if (currentGroup.length === parlaySize) {
      // 轉換成投注腳 (BetLeg)
      const legs: BetLeg[] = currentGroup.map((g) => ({
        gameExternalId: g.odds.gameExternalId,
        league: g.odds.league,
        homeTeam: g.odds.homeTeam,
        awayTeam: g.odds.awayTeam,
        gameDate: g.odds.gameDate,
        marketType: g.odds.marketType,
        selection: g.odds.selection,
        odds: g.odds.taiwanOdds,
        line: g.odds.line,
      }));

      // 計算賠率與預期收益
      const parlayOdds = parseFloat(
        legs.reduce((acc, leg) => acc * leg.odds, 1).toFixed(2)
      );
      const estimatedPayout = Math.round(settings.stakePerTicket * parlayOdds);

      const ticketDraft: BetTicketDraft = {
        legs,
        stake: settings.stakePerTicket,
        parlayOdds,
        estimatedPayout,
      };

      // 執行規則檢查
      const ruleCheck = checkTaiwanRules(ticketDraft, remainingBudget, settings);

      if (ruleCheck.passed) {
        recommendations.push({
          id: `rec_${date}_${recommendations.length + 1}`,
          date,
          legs,
          edges: [...currentGroup],
          totalStake: settings.stakePerTicket,
          parlayLegs: legs.length,
          parlayOdds,
          estimatedPayout,
          ruleCheckPassed: true,
          ruleCheckDetails: ruleCheck,
          status: 'recommended',
          createdAt: new Date().toISOString(),
        });

        // 模擬扣減今日預算，以便後續推薦卡片有足夠餘額
        remainingBudget.remaining -= settings.stakePerTicket;
        remainingBudget.ticketsUsed += 1;
      }

      currentGroup = []; // 清空分組
    }
  }

  // 5. 如果 preferredParlaySize 太大導致不足以成團，且還有多餘信號，可降級為單場推薦
  if (recommendations.length === 0 && uniqueGameEdges.length > 0 && parlaySize > 1) {
    for (const edge of uniqueGameEdges) {
      if (recommendations.length >= settings.maxTicketsPerDay) break;
      if (remainingBudget.remaining < settings.stakePerTicket) break;

      const legs: BetLeg[] = [{
        gameExternalId: edge.odds.gameExternalId,
        league: edge.odds.league,
        homeTeam: edge.odds.homeTeam,
        awayTeam: edge.odds.awayTeam,
        gameDate: edge.odds.gameDate,
        marketType: edge.odds.marketType,
        selection: edge.odds.selection,
        odds: edge.odds.taiwanOdds,
        line: edge.odds.line,
      }];

      const parlayOdds = edge.odds.taiwanOdds;
      const estimatedPayout = Math.round(settings.stakePerTicket * parlayOdds);

      const ticketDraft: BetTicketDraft = {
        legs,
        stake: settings.stakePerTicket,
        parlayOdds,
        estimatedPayout,
      };

      const ruleCheck = checkTaiwanRules(ticketDraft, remainingBudget, settings);

      if (ruleCheck.passed) {
        recommendations.push({
          id: `rec_${date}_${recommendations.length + 1}_fallback`,
          date,
          legs,
          edges: [edge],
          totalStake: settings.stakePerTicket,
          parlayLegs: 1,
          parlayOdds,
          estimatedPayout,
          ruleCheckPassed: true,
          ruleCheckDetails: ruleCheck,
          status: 'recommended',
          createdAt: new Date().toISOString(),
        });

        remainingBudget.remaining -= settings.stakePerTicket;
        remainingBudget.ticketsUsed += 1;
      }
    }
  }

  return recommendations;
}
