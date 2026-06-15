/**
 * The Odds API 客戶端
 * 文件: lib/odds/theOddsApiClient.ts
 *
 * 串接 https://the-odds-api.com/v4
 * - 內建 5 分鐘 in-memory cache，避免頻繁消耗 API 配額
 * - API key 不存在時回傳 null（不拋例外），網站正常運作
 */

const BASE_URL = 'https://api.the-odds-api.com/v4';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OddsOutcome {
  name: string;
  price: number;
  point?: number; // for spreads / totals
}

export interface OddsBookmakerMarket {
  key: 'h2h' | 'spreads' | 'totals';
  last_update: string;
  outcomes: OddsOutcome[];
}

export interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsBookmakerMarket[];
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface FetchOddsResult {
  events: OddsApiEvent[];
  remainingRequests: number | null;
  usedRequests: number | null;
  cachedAt: number;
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

const cache: Record<string, FetchOddsResult> = {};

function getCached(key: string): FetchOddsResult | null {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    delete cache[key];
    return null;
  }
  return entry;
}

function setCache(key: string, value: FetchOddsResult) {
  cache[key] = value;
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

async function fetchOdds(
  sportKey: string,
  forceRefresh = false
): Promise<FetchOddsResult | null> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null; // graceful: no key → return null

  const cacheKey = `odds:${sportKey}`;
  if (!forceRefresh) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  try {
    const params = new URLSearchParams({
      apiKey,
      regions: 'us,eu,uk',
      markets: 'h2h,spreads,totals',
      oddsFormat: 'decimal',
      dateFormat: 'iso',
    });

    const url = `${BASE_URL}/sports/${sportKey}/odds?${params.toString()}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 }, // no Next.js cache — managed manually
    });

    if (!res.ok) {
      console.error(`[TheOddsAPI] HTTP ${res.status} for ${sportKey}`);
      return null;
    }

    const data: OddsApiEvent[] = await res.json();
    const remaining = parseInt(res.headers.get('x-requests-remaining') ?? '-1', 10);
    const used = parseInt(res.headers.get('x-requests-used') ?? '-1', 10);

    const result: FetchOddsResult = {
      events: data,
      remainingRequests: isNaN(remaining) ? null : remaining,
      usedRequests: isNaN(used) ? null : used,
      cachedAt: Date.now(),
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[TheOddsAPI] Fetch error:', err);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchMLBOdds(forceRefresh = false): Promise<FetchOddsResult | null> {
  return fetchOdds('baseball_mlb', forceRefresh);
}

export async function fetchNBAOdds(forceRefresh = false): Promise<FetchOddsResult | null> {
  return fetchOdds('basketball_nba', forceRefresh);
}

export function getCachedMLBOdds(): FetchOddsResult | null {
  return getCached('odds:baseball_mlb');
}

export function getCachedNBAOdds(): FetchOddsResult | null {
  return getCached('odds:basketball_nba');
}

/** Check if API key is configured */
export function hasOddsApiKey(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}
