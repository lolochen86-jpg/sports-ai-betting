import { DailyBudget, StrategySettings } from '@/types/betting';

/**
 * 建立/初始化每日預算
 */
export function createDailyBudget(
  date: string,
  settings: StrategySettings
): DailyBudget {
  return {
    date,
    totalBudget: settings.dailyBudget,
    spent: 0,
    remaining: settings.dailyBudget,
    maxTickets: settings.maxTicketsPerDay,
    ticketsUsed: 0,
    stakePerTicket: settings.stakePerTicket,
  };
}

/**
 * 扣減每日預算 (確認下注時)
 */
export function deductBudget(budget: DailyBudget, amount: number): DailyBudget {
  const spent = budget.spent + amount;
  const remaining = Math.max(0, budget.totalBudget - spent);
  const ticketsUsed = budget.ticketsUsed + 1;

  return {
    ...budget,
    spent,
    remaining,
    ticketsUsed,
  };
}

/**
 * 退還每日預算 (取消或廢單時)
 */
export function refundBudget(budget: DailyBudget, amount: number): DailyBudget {
  const spent = Math.max(0, budget.spent - amount);
  const remaining = budget.totalBudget - spent;
  const ticketsUsed = Math.max(0, budget.ticketsUsed - 1);

  return {
    ...budget,
    spent,
    remaining,
    ticketsUsed,
  };
}

/**
 * 檢查預算是否足夠
 */
export function canAfford(budget: DailyBudget, amount: number): boolean {
  return budget.remaining >= amount;
}

/**
 * 檢查是否還有注單配額
 */
export function hasTicketSlot(budget: DailyBudget): boolean {
  return budget.ticketsUsed < budget.maxTickets;
}
