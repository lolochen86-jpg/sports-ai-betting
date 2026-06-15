'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GameWithTeams } from '@/types/sports';

interface UseGamesResult {
  games: GameWithTeams[];
  loading: boolean;
  error: string | null;
  refetch: (force?: boolean) => void;
}

export function useGames(league: 'NBA' | 'MLB', date?: string): UseGamesResult {
  const [games, setGames] = useState<GameWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ league });
      if (date) params.set('date', date);
      if (force) {
        params.set('force', 'true');
        params.set('_t', Date.now().toString());
      }

      const res = await fetch(`/api/games?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      if (json.success) {
        setGames(json.data);
      } else {
        throw new Error(json.error || 'Unknown error');
      }
    } catch (err) {
      console.error('useGames error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch games');
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [league, date]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  return { games, loading, error, refetch: fetchGames };
}
