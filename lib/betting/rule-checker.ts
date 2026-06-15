import { BetTicketDraft, DailyBudget, RuleCheckResult, RuleCheck, StrategySettings } from '@/types/betting';

/**
 * 投注規則檢查器（支援台灣運彩與國際盤模式）
 */
export function checkTaiwanRules(
  ticket: BetTicketDraft,
  budget: DailyBudget,
  settings?: StrategySettings
): RuleCheckResult {
  const checks: RuleCheck[] = [];
  // 已經全面改為國際盤模式
  const bookmakerMode = 'international';
  const isInternational = true;

  // 1. 每組合投注金額以 10 元為單位
  const stakeDivisibleBy10 = ticket.stake % 10 === 0;
  checks.push({
    name: 'stake_unit',
    passed: stakeDivisibleBy10,
    message: stakeDivisibleBy10 
      ? '投注金額符合以 10 元為單位' 
      : `投注金額必須以 10 元為單位（例如 ${isInternational ? '10, 20, 30' : '100, 110, 120'}）`,
  });

  // 2. 每次投注總價至少限制 (台灣運彩 100 元，國際盤 10 元)
  const minRequiredStake = isInternational ? 10 : 100;
  const minTotalStake = ticket.stake >= minRequiredStake;
  checks.push({
    name: 'min_total_stake',
    passed: minTotalStake,
    message: minTotalStake 
      ? `投注金額大於等於最低限制 ${minRequiredStake} 元` 
      : `投注總金額至少需要 ${minRequiredStake} 元`,
  });

  // 3. 過關數範圍為 1~12 場
  const legsCount = ticket.legs.length;
  const parlayRangeValid = legsCount >= 1 && legsCount <= 12;
  checks.push({
    name: 'parlay_range',
    passed: parlayRangeValid,
    message: parlayRangeValid
      ? `過關數符合限制 (共 ${legsCount} 場)`
      : `過關數必須在 1 到 12 場之間 (目前為 ${legsCount} 場)`,
  });

  // 4. 同一場賽事不得重複選取過關
  const gameIds = ticket.legs.map((leg) => leg.gameExternalId);
  const uniqueGameIds = new Set(gameIds);
  const noDuplicateGame = uniqueGameIds.size === gameIds.length;
  checks.push({
    name: 'no_duplicate_game',
    passed: noDuplicateGame,
    message: noDuplicateGame ? '無重複賽事選擇' : '同一個注單中，同一場賽事不得重複選擇不同的過關組合',
  });

  // 5. 今日剩餘預算是否足夠
  const budgetSufficient = budget.remaining >= ticket.stake;
  checks.push({
    name: 'budget_sufficient',
    passed: budgetSufficient,
    message: budgetSufficient
      ? `今日剩餘預算足夠 (剩餘 ${budget.remaining} 元，此注單需要 ${ticket.stake} 元)`
      : `今日剩餘預算不足 (僅剩 ${budget.remaining} 元，此注單需要 ${ticket.stake} 元)`,
  });

  // 6. 今日已使用注單數未超過上限
  const ticketsCountValid = budget.ticketsUsed < budget.maxTickets;
  checks.push({
    name: 'max_tickets_limit',
    passed: ticketsCountValid,
    message: ticketsCountValid
      ? `今日注單配額未達上限 (已用 ${budget.ticketsUsed}/${budget.maxTickets})`
      : `今日注單配額已達上限 (${budget.ticketsUsed}/${budget.maxTickets})，請修改今日設定或明日再試`,
  });

  const passed = checks.every((c) => c.passed);

  return {
    passed,
    checks,
  };
}
