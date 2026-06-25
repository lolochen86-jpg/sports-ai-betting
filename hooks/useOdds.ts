'use client';

import { useState, useEffect, useCallback } from 'react';
import type { OddsEvent } from '@/lib/odds/types';
import type { OddsApiResponse } from '@/app/api/odds/route';

/**
 * Custom React hook to fetch moneyline odds from `/api/odds` API route.
 * Automatically polls and refetches every 2 minutes.
 * 
 * @param sport 'NBA' | 'MLB'
 * @returns odds, loading, error, remainingRequests, refetch
 */
export function useOdds(sport: 'NBA' | 'MLB') {
  const [odds, setOdds] = useState<OddsEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingRequests, setRemainingRequests] = useState<string | null>(null);

  const fetchOddsData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/odds?sport=${sport}`);
      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `HTTP error! Status: ${response.status}`);
      }

      const payload = (await response.json()) as OddsApiResponse;
      
      if (payload.success) {
        setOdds(payload.data);
        setRemainingRequests(payload.remainingRequests);
      } else {
        throw new Error(payload.error || 'Failed to fetch odds data.');
      }
    } catch (err) {
      console.error(`[useOdds Error] Failed to fetch odds for ${sport}:`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sport]);

  // Fetch immediately on mount or sport change
  useEffect(() => {
    fetchOddsData();

    // Auto-polling refetch interval (2 minutes = 120000ms)
    const intervalId = setInterval(() => {
      fetchOddsData(true); // Silent refetch without triggering fullscreen loading states
    }, 120000);

    return () => clearInterval(intervalId);
  }, [fetchOddsData]);

  return {
    odds,
    loading,
    error,
    remainingRequests,
    refetch: () => fetchOddsData(false)
  };
}
