'use client';

import { useState, useEffect } from 'react';
import type { TeamInfo } from '@/types/sports';

interface UseTeamsResult {
  teams: TeamInfo[];
  loading: boolean;
  error: string | null;
}

export function useTeams(league?: 'NBA' | 'MLB'): UseTeamsResult {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const fetchTeams = async () => {
      try {
        const url = league ? `/api/teams?league=${league}` : '/api/teams';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (!active) return;

        if (json.success) {
          setTeams(json.data);
        } else {
          throw new Error(json.error || 'Failed to fetch teams');
        }
      } catch (err) {
        if (!active) return;
        console.error('useTeams error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch teams');
        setTeams([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchTeams();

    return () => {
      active = false;
    };
  }, [league]);

  return { teams, loading, error };
}
