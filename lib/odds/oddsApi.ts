import { OddsEvent, Sport } from './types';

let lastRemainingRequests: string | null = null;

/**
 * Gets the remaining request count from the last api call.
 */
export function getLastRemainingRequests(): string | null {
  return lastRemainingRequests;
}

/**
 * Fetches moneyline (h2h) odds for a given sport from The Odds API.
 * Uses Next.js fetch revalidation cache (120 seconds).
 * 
 * @param sport 'basketball_nba' | 'baseball_mlb'
 * @returns Promise<OddsEvent[]>
 */
export async function fetchOdds(sport: Sport): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  const baseUrl = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';

  if (!apiKey) {
    console.error('The Odds API Key is not set in environment variables.');
    return [];
  }

  try {
    // Moneyline (h2h) markets, decimal odds format, including US/EU/UK markets
    const url = `${baseUrl}/sports/${sport}/odds/?apiKey=${apiKey}&regions=us,eu,uk&markets=h2h&oddsFormat=decimal`;

    const response = await fetch(url, {
      next: { revalidate: 120 }
    });

    // Capture rate limits from header
    const remaining = response.headers.get('x-requests-remaining');
    if (remaining !== null) {
      lastRemainingRequests = remaining;
      console.log(`[The Odds API] x-requests-remaining: ${remaining}`);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch odds: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as OddsEvent[];
  } catch (error) {
    console.error(`[The Odds API Error] fetchOdds failed for sport ${sport}:`, error);
    return [];
  }
}
