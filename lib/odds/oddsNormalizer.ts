/**
 * 賠率標準化與公平勝率計算工具
 * 文件: lib/odds/oddsNormalizer.ts
 *
 * 功能：
 * - 雙邊去水 (remove vig)，計算公平勝率
 * - 多家博彩平均賠率
 * - 隊名模糊比對，將 GameWithTeams 匹配至 OddsApiEvent
 * - 建立前端所需的完整國際盤物件
 */

import type { OddsApiEvent, OddsBookmaker } from './theOddsApiClient';
import type { GameWithTeams } from '@/types/sports';
import type { Bookmaker } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InternationalOddsData {
  hasData: true;
  /** 平均客隊賠率（含水） */
  avgAwayOdds: number;
  /** 平均主隊賠率（含水） */
  avgHomeOdds: number;
  /** 去水後公平客隊勝率 (0-1) */
  fairAwayProb: number;
  /** 去水後公平主隊勝率 (0-1) */
  fairHomeProb: number;
  /** 參與計算的博彩商數量 */
  bookmakerCount: number;
  /** 原始賽事 ID */
  eventId: string;
  /** 詳細博彩商賠率數據 */
  bookmakers?: Bookmaker[];
}

export interface InternationalOddsEmpty {
  hasData: false;
  reason?: 'no_key' | 'no_match' | 'no_data';
}

export type InternationalOdds = InternationalOddsData | InternationalOddsEmpty;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 雙邊去水：計算兩支隊伍的公平勝率
 * 去水原理：公平勝率 = 隱含勝率 / (所有隱含勝率之和)
 */
export function removeVig(
  homeOdds: number,
  awayOdds: number
): { fairHomeProb: number; fairAwayProb: number; vig: number } {
  if (homeOdds <= 0 || awayOdds <= 0) {
    return { fairHomeProb: 0.5, fairAwayProb: 0.5, vig: 0 };
  }
  const impliedHome = 1 / homeOdds;
  const impliedAway = 1 / awayOdds;
  const totalImplied = impliedHome + impliedAway;
  const vig = totalImplied - 1; // 超過 1 的部分即為水錢

  return {
    fairHomeProb: Number((impliedHome / totalImplied).toFixed(4)),
    fairAwayProb: Number((impliedAway / totalImplied).toFixed(4)),
    vig: Number(vig.toFixed(4)),
  };
}

/**
 * 從多家博彩商取得指定隊伍的平均 h2h 賠率
 */
export function averageH2hOdds(
  bookmakers: OddsBookmaker[],
  teamName: string
): number {
  const prices: number[] = [];

  for (const bm of bookmakers) {
    const h2h = bm.markets.find((m) => m.key === 'h2h');
    if (!h2h) continue;
    const outcome = h2h.outcomes.find(
      (o) => o.name.toLowerCase() === teamName.toLowerCase()
    );
    if (outcome && outcome.price > 0) {
      prices.push(outcome.price);
    }
  }

  if (prices.length === 0) return 0;
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return Number(avg.toFixed(3));
}

/**
 * 隊名模糊比對：計算兩個字串的相似度分數
 * 使用 token-level 包含比對，適合球隊全名/簡稱差異
 */
function teamNameScore(apiName: string, localName: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  const a = normalize(apiName);
  const b = normalize(localName);

  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  // token overlap
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));
  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  if (intersection.length > 0) {
    return intersection.length / Math.max(tokensA.size, tokensB.size);
  }

  return 0;
}

/**
 * 從 OddsApiEvent[] 中找到最匹配的賽事
 */
export function matchGameToEvent(
  game: GameWithTeams,
  events: OddsApiEvent[]
): OddsApiEvent | null {
  let bestEvent: OddsApiEvent | null = null;
  let bestScore = 0;

  const homeNames = [
    game.homeTeam.name,
    game.homeTeam.nameCn ?? '',
    game.homeTeam.city ?? '',
    game.homeTeam.code,
  ].filter(Boolean);

  const awayNames = [
    game.awayTeam.name,
    game.awayTeam.nameCn ?? '',
    game.awayTeam.city ?? '',
    game.awayTeam.code,
  ].filter(Boolean);

  for (const event of events) {
    // Only consider events within ±2 days of the game
    const eventDate = new Date(event.commence_time).getTime();
    const gameDate = new Date(game.gameDate).getTime();
    if (Math.abs(eventDate - gameDate) > 2 * 24 * 60 * 60 * 1000) continue;

    let homeScore = 0;
    for (const name of homeNames) {
      homeScore = Math.max(homeScore, teamNameScore(event.home_team, name));
    }

    let awayScore = 0;
    for (const name of awayNames) {
      awayScore = Math.max(awayScore, teamNameScore(event.away_team, name));
    }

    const combined = homeScore * 0.5 + awayScore * 0.5;
    if (combined > bestScore) {
      bestScore = combined;
      bestEvent = event;
    }
  }

  // 需要兩隊都有一定相似度才算成功匹配
  return bestScore >= 0.4 ? bestEvent : null;
}

/**
 * 建立前端所需的完整國際盤物件
 */
export function buildInternationalOddsData(
  game: GameWithTeams,
  events: OddsApiEvent[]
): InternationalOdds {
  const event = matchGameToEvent(game, events);
  if (!event) {
    return { hasData: false, reason: 'no_match' };
  }

  const avgHome = averageH2hOdds(event.bookmakers, event.home_team);
  const avgAway = averageH2hOdds(event.bookmakers, event.away_team);

  if (avgHome === 0 || avgAway === 0) {
    return { hasData: false, reason: 'no_data' };
  }

  const { fairHomeProb, fairAwayProb } = removeVig(avgHome, avgAway);
  const bookmakerCount = event.bookmakers.filter((bm) =>
    bm.markets.some((m) => m.key === 'h2h')
  ).length;

  return {
    hasData: true,
    avgAwayOdds: avgAway,
    avgHomeOdds: avgHome,
    fairAwayProb,
    fairHomeProb,
    bookmakerCount,
    eventId: event.id,
    bookmakers: event.bookmakers as any,
  };
}

/**
 * 計算 AI 勝率與國際盤公平勝率的差距
 * @returns 差距百分比（正值=AI 高估，負值=AI 低估）
 */
export function calcAiVsMarketGap(aiProb: number, fairMarketProb: number): number {
  return Number(((aiProb - fairMarketProb) * 100).toFixed(1));
}

/**
 * 三向共識判斷：AI、國際盤、台運賠率是否同向支持某隊
 * @param aiWinner 'home' | 'away'
 * @param marketFavorite 'home' | 'away' (公平勝率較高者)
 * @param taiwanOddsFavorite 'home' | 'away' | null (台運賠率較低者=被看好者，可能為 null)
 */
export function checkTripleConsensus(
  aiWinner: 'home' | 'away',
  marketFavorite: 'home' | 'away',
  taiwanOddsFavorite: 'home' | 'away' | null
): boolean {
  if (taiwanOddsFavorite === null) return false;
  return aiWinner === marketFavorite && aiWinner === taiwanOddsFavorite;
}
