/**
 * 下注設定型別與預設值
 * lib/betting/bettingSettings.ts
 */

export interface BettingSettings {
  /** 本金 (元) */
  bankroll: number;
  /** 每日上限 (元) */
  dailyLimit: number;
  /** 要求 Edge% (小數，0.04 = 4%) */
  requiredEdge: number;
  /** 目標 EV ROI (小數，0.05 = 5%) */
  targetEvRoi: number;
  /** Kelly 倍數 (0.25 = 1/4 Kelly) */
  kellyMultiplier: number;
  /** 單場最高下注 (元) */
  maxSingleBet: number;
  /** 串關最高下注 (元) */
  maxParlayBet: number;
}

export const DEFAULT_BETTING_SETTINGS: BettingSettings = {
  bankroll: 4000,
  dailyLimit: 200,
  requiredEdge: 0.04,
  targetEvRoi: 0.05,
  kellyMultiplier: 0.25,
  maxSingleBet: 150,
  maxParlayBet: 80,
};

export const BETTING_SETTINGS_KEY = 'betting_settings_v1';

export function loadBettingSettings(): BettingSettings {
  if (typeof window === 'undefined') return DEFAULT_BETTING_SETTINGS;
  try {
    const saved = localStorage.getItem(BETTING_SETTINGS_KEY);
    if (!saved) return DEFAULT_BETTING_SETTINGS;
    return { ...DEFAULT_BETTING_SETTINGS, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_BETTING_SETTINGS;
  }
}

export function saveBettingSettings(settings: BettingSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BETTING_SETTINGS_KEY, JSON.stringify(settings));
}
