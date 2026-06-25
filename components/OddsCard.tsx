'use client';

import React from 'react';
import { Bookmaker } from '@/lib/odds/types';
import { calculateEdge, kellyFraction, gradeEdge } from '@/lib/odds/converters';

interface OddsCardProps {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmakers: Bookmaker[];
  aiHomeWinProb?: number; // AI home win probability (0-100), optional
}

export default function OddsCard({
  homeTeam,
  awayTeam,
  commenceTime,
  bookmakers,
  aiHomeWinProb
}: OddsCardProps) {
  // 1. Scan for the best (highest decimal price) H2H odds for home and away
  let bestHomeOdds = 0;
  let bestHomeBookmaker = '';
  let bestAwayOdds = 0;
  let bestAwayBookmaker = '';
  let latestUpdateIso = '';

  bookmakers.forEach((bm) => {
    const h2hMarket = bm.markets?.find((m) => m.key === 'h2h');
    if (!h2hMarket) return;

    if (bm.last_update && (!latestUpdateIso || bm.last_update > latestUpdateIso)) {
      latestUpdateIso = bm.last_update;
    }

    h2hMarket.outcomes.forEach((outcome) => {
      const nameLower = outcome.name.toLowerCase();
      const homeLower = homeTeam.toLowerCase();
      const awayLower = awayTeam.toLowerCase();

      // Precision matched against English names from the Odds API
      const isHome = nameLower === homeLower;
      const isAway = nameLower === awayLower;

      if (isHome) {
        if (outcome.price > bestHomeOdds) {
          bestHomeOdds = outcome.price;
          bestHomeBookmaker = bm.title;
        }
      } else if (isAway) {
        if (outcome.price > bestAwayOdds) {
          bestAwayOdds = outcome.price;
          bestAwayBookmaker = bm.title;
        }
      }
    });
  });

  const hasOdds = bestHomeOdds > 0 && bestAwayOdds > 0;

  // 2. Helper to display commencement time
  const formatTime = (isoString: string) => {
    try {
      const dateObj = new Date(isoString);
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      return `${mm}-${dd} ${hh}:${min}`;
    } catch {
      return isoString;
    }
  };

  // 3. Helper to count minutes ago for last update text
  const getMinutesAgoText = (isoString?: string) => {
    if (!isoString) return '剛剛';
    try {
      const diffMs = new Date().getTime() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins <= 0) return '剛剛';
      if (diffMins < 60) return `${diffMins} 分鐘前`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} 小時前`;
      return `${Math.floor(diffHours / 24)} 天前`;
    } catch {
      return '剛剛';
    }
  };

  // 4. Render Edge/Kelly analysis panels
  const renderAnalysis = (prob: number, odds: number, label: string) => {
    const analysis = calculateEdge(prob, odds);
    const fraction = kellyFraction(prob, odds, 0.25);
    const grade = gradeEdge(analysis.edge);

    const formattedEdge = (analysis.edge * 100).toFixed(1);
    const isPositiveEdge = analysis.edge > 0;
    const edgeColor = isPositiveEdge ? 'text-emerald-400' : 'text-red-400';
    const edgePrefix = isPositiveEdge ? '+' : '';

    const formattedEv = (analysis.evRoi * 100).toFixed(1);
    const formattedKelly = (fraction * 100).toFixed(1);

    // Style grade badge
    const badgeStyles = {
      'A+': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'A': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'B': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'skip': 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    };

    return (
      <div className="flex flex-col gap-2 p-3 bg-white/5 border border-white/5 rounded-2xl">
        <div className="flex justify-between items-center">
          <span className="text-xs font-black text-gray-400">{label} 推演</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${badgeStyles[grade]}`}>
            等級: {grade.toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mt-1">
          <div>
            <span className="block text-[10px] text-gray-500 font-mono uppercase">優勢 (Edge)</span>
            <span className={`text-xs font-black font-mono ${edgeColor}`}>
              {edgePrefix}{formattedEdge}%
            </span>
          </div>
          <div>
            <span className="block text-[10px] text-gray-500 font-mono uppercase">期望值 (EV)</span>
            <span className={`text-xs font-black font-mono ${isPositiveEdge ? 'text-emerald-400' : 'text-gray-400'}`}>
              {edgePrefix}{formattedEv}%
            </span>
          </div>
          <div>
            <span className="block text-[10px] text-gray-500 font-mono uppercase">1/4 凱利</span>
            <span className="text-xs font-black font-mono text-purple-400">
              {formattedKelly}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-panel rounded-3xl border border-white/5 p-6 flex flex-col justify-between space-y-6 hover:border-purple-500/25 transition-all shadow-xl bg-[#030712]/40">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex flex-col text-left">
          <span className="text-xs font-mono font-bold text-gray-500">🏆 國際盤口即時賠率對照</span>
          <span className="text-xs font-black text-purple-300 mt-1">時間: {formatTime(commenceTime)}</span>
        </div>
        <span className="px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-400 text-[10px] font-black tracking-wider uppercase border border-purple-500/20">
          H2H Moneyline
        </span>
      </div>

      {/* Matchup & Best Odds Display */}
      <div className="flex flex-col gap-4">
        {/* Away Team Line */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col text-left min-w-0">
            <span className="text-sm font-black text-white truncate">{awayTeam}</span>
            {hasOdds && <span className="text-[10px] font-mono text-gray-500 truncate">來源: {bestAwayBookmaker}</span>}
          </div>
          {hasOdds ? (
            <div className="flex flex-col items-end shrink-0">
              <span className="text-base font-black text-amber-400 font-mono">{bestAwayOdds.toFixed(2)}</span>
              <span className="text-[9px] font-mono text-gray-500 uppercase">最佳賠率</span>
            </div>
          ) : (
            <span className="text-xs text-gray-500 font-mono">--</span>
          )}
        </div>

        {/* Home Team Line */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col text-left min-w-0">
            <span className="text-sm font-black text-white truncate">{homeTeam} (主)</span>
            {hasOdds && <span className="text-[10px] font-mono text-gray-500 truncate">來源: {bestHomeBookmaker}</span>}
          </div>
          {hasOdds ? (
            <div className="flex flex-col items-end shrink-0">
              <span className="text-base font-black text-amber-400 font-mono">{bestHomeOdds.toFixed(2)}</span>
              <span className="text-[9px] font-mono text-gray-500 uppercase">最佳賠率</span>
            </div>
          ) : (
            <span className="text-xs text-gray-500 font-mono">--</span>
          )}
        </div>
      </div>

      {/* AI Probabilities Calculations */}
      {hasOdds && aiHomeWinProb !== undefined && (
        <div className="grid grid-cols-1 gap-3 pt-2 border-t border-white/5">
          {renderAnalysis(100 - aiHomeWinProb, bestAwayOdds, '客隊')}
          {renderAnalysis(aiHomeWinProb, bestHomeOdds, '主隊')}
        </div>
      )}

      {/* Edge Warning if no odds exists */}
      {!hasOdds && (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center flex flex-col items-center justify-center gap-1">
          <span className="text-xl">📡</span>
          <span className="text-xs font-bold text-gray-400">尚未同步國際盤數據，或找不到對應賽事。</span>
          <span className="text-[10px] text-gray-600">The Odds API 尚未提供此賽事之最新 Moneyline 賠率</span>
        </div>
      )}

      {/* Footer metadata */}
      <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 pt-1">
        <span>資料來源: The Odds API</span>
        <span>最後更新: {getMinutesAgoText(latestUpdateIso)}</span>
      </div>
    </div>
  );
}
