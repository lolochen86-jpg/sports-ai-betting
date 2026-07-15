import type { GameWithTeams, League } from '@/types/sports';

export interface QuantPredictionResult {
  homeExpectedScore: number;
  awayExpectedScore: number;
  homeProb: number;
  awayProb: number;
  reasoning: string[];
  isRealMl: boolean; // True if fetched from Python XGBoost/Poisson API, False if fallback
}

/**
 * Fetch predictions from Python Quant System API
 */
export async function fetchQuantPredictions(
  game: GameWithTeams,
  league: League
): Promise<QuantPredictionResult | null> {
  if (league !== 'MLB') return null;

  try {
    const gameDateStr = new Date(game.gameDate).toISOString().split('T')[0];
    const url = `http://localhost:8788/api/predictions?date=${gameDateStr}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 60 * 15 } // Cache for 15 minutes
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.predictions)) {
      return null;
    }

    // Find our game PK in the list
    const gamePk = game.id;
    const match = data.predictions.find(
      (p: any) => String(p.mlb_game_pk) === String(gamePk)
    );

    if (!match) {
      return null;
    }

    // Parse values from Python Quant API response
    const homeExpectedScore = match.expected_runs?.home ?? 4.0;
    const awayExpectedScore = match.expected_runs?.away ?? 4.0;
    const homeProb = match.true_win_probability?.home ?? 0.50;
    const awayProb = match.true_win_probability?.away ?? 0.50;

    const reasoning = [
      `🔬 成功連接 Python XGBoost & Poisson 量化預測引擎。`,
      `📈 量化模型估算主隊獲勝機率: ${(homeProb * 100).toFixed(1)}%，客隊: ${(awayProb * 100).toFixed(1)}%。`,
      `🎯 XGBoost 真實賠率優勢與 Kelly 資金配置建議: ${match.recommended_side === 'home' ? '推薦主隊' : match.recommended_side === 'away' ? '推薦客隊' : '無優勢邊'}，下注比例: ${(match.bet_fraction * 100).toFixed(2)}%。`
    ];

    return {
      homeExpectedScore,
      awayExpectedScore,
      homeProb,
      awayProb,
      reasoning,
      isRealMl: true
    };
  } catch (err) {
    // API not reachable or timed out
    return null;
  }
}
