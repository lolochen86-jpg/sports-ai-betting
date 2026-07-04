'use client';

import React, { useState, useEffect } from 'react';

interface SmartParlayLeg {
  gameId: string;
  homeTeam: { name: string; code: string; nameCn?: string };
  awayTeam: { name: string; code: string; nameCn?: string };
  pick: 'home' | 'away';
  pickTeamName: string;
  consensusCount: number;
  avgConfidence: number;
  models: {
    SportsAI: 'home' | 'away';
    EloRating: 'home' | 'away';
    MonteCarlo: 'home' | 'away';
    MetaModel: 'home' | 'away';
  };
  predictedTotal: number;
}

interface SmartParlay {
  id: number;
  legs: SmartParlayLeg[];
  combinedProb: number;
  grade: 'S' | 'A' | 'B';
  coverageTeams: string[];
}

interface SmartParlayCardProps {
  parlays: SmartParlay[];
  totalGames: number;
  totalTeamsCovered: number;
  totalTeams: number;
  uncoveredTeams: string[];
  manualOdds?: Record<string, { away: string; home: string; legLimit?: number }>;
  loading?: boolean;
}

const gradeStyles: Record<string, { bg: string; border: string; text: string; label: string; glow: string }> = {
  S: {
    bg: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    label: '🏆 至尊共識',
    glow: 'shadow-amber-500/5',
  },
  A: {
    bg: 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    label: '⭐ 強勢推薦',
    glow: 'shadow-emerald-500/5',
  },
  B: {
    bg: 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    label: '📊 數據支撐',
    glow: 'shadow-blue-500/5',
  },
};

const ConsensusStars = ({ count }: { count: number }) => (
  <span className="flex items-center gap-0.5">
    {Array.from({ length: 4 }).map((_, i) => (
      <span key={i} className={`text-[10px] ${i < count ? 'text-amber-400' : 'text-gray-700'}`}>
        ★
      </span>
    ))}
  </span>
);

const ModelDots = ({ models, pick }: { models: SmartParlayLeg['models']; pick: 'home' | 'away' }) => {
  const modelNames = ['SportsAI', 'EloRating', 'MonteCarlo', 'MetaModel'] as const;
  const shortNames = ['SA', 'Elo', 'MC', 'Meta'];
  return (
    <div className="flex items-center gap-1">
      {modelNames.map((m, i) => {
        const agrees = models[m] === pick;
        return (
          <span
            key={m}
            className={`text-[8.5px] font-mono font-bold px-1 py-0.5 rounded-sm ${
              agrees
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-400/50 border border-red-500/10'
            }`}
            title={`${m}: ${models[m] === 'home' ? '主隊' : '客隊'}`}
          >
            {shortNames[i]}
          </span>
        );
      })}
    </div>
  );
};

export default function SmartParlayCard({
  parlays,
  totalGames,
  totalTeamsCovered,
  totalTeams,
  uncoveredTeams,
  manualOdds,
  loading = false,
}: SmartParlayCardProps) {
  // Global stake state in NTD
  const [stake, setStake] = useState<string>('1000');
  // Local odds override state: { [parlayId]: [oddsLeg1, oddsLeg2, oddsLeg3] }
  const [customOdds, setCustomOdds] = useState<Record<number, string[]>>({});

  // Helper to compute realistic odds for a leg
  const getLegDefaultOdds = (leg: SmartParlayLeg): string => {
    if (manualOdds && manualOdds[leg.gameId]) {
      const gOdds = manualOdds[leg.gameId];
      const realOddsStr = leg.pick === 'home' ? gOdds.home : gOdds.away;
      if (realOddsStr && parseFloat(realOddsStr) > 1.0) {
        return parseFloat(realOddsStr).toFixed(2);
      }
    }
    // Dynamic fallback based on AI confidence (with 8% bookmaker margin)
    const winProb = Math.max(0.3, Math.min(0.9, (leg.avgConfidence || 50) / 100));
    const estimatedOdds = (1 / winProb) * 0.92;
    return Math.max(1.15, Math.min(3.20, estimatedOdds)).toFixed(2);
  };

  // Initialize odds state when parlays or manualOdds change
  useEffect(() => {
    if (parlays && parlays.length > 0) {
      const initialOdds: Record<number, string[]> = {};
      parlays.forEach(p => {
        initialOdds[p.id] = p.legs.map(leg => getLegDefaultOdds(leg));
      });
      setCustomOdds(initialOdds);
    }
  }, [parlays, manualOdds]);

  const handleOddsChange = (parlayId: number, legIdx: number, val: string) => {
    const targetParlay = parlays.find(p => p.id === parlayId);
    const defaults = targetParlay ? targetParlay.legs.map(l => getLegDefaultOdds(l)) : ['1.75', '1.75', '1.75'];
    setCustomOdds(prev => ({
      ...prev,
      [parlayId]: (prev[parlayId] || defaults).map((o, idx) => idx === legIdx ? val : o)
    }));
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-3xl border border-purple-500/20 p-6 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-white/5 rounded w-48" />
            <div className="h-3 bg-white/5 rounded w-32" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-20 bg-white/5 rounded-2xl" />
          <div className="h-20 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!parlays || parlays.length === 0) {
    return (
      <div className="glass-panel rounded-3xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">⚡</span>
          <h3 className="text-sm font-black text-white font-sans">今日智慧三關推薦</h3>
        </div>
        <p className="text-xs text-gray-500 font-sans">尚未產生推薦組合，需要至少 2 場賽事才能計算。</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl border border-purple-500/20 p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-60px] right-[-60px] w-[180px] h-[180px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <h3 className="text-sm font-black text-white font-sans tracking-wide">今日智慧三關推薦</h3>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
              基於 4 大 AI 模型共識度自動選腿 · {totalGames} 場賽事分析
            </p>
          </div>
        </div>

        {/* Interactive Stake Panel */}
        <div className="flex items-center gap-3 self-start md:self-auto bg-white/5 border border-white/10 rounded-2xl px-3 py-1.5 shadow-inner">
          <span className="text-xs text-gray-400 font-bold font-sans">投注預估本金：</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 font-bold">$</span>
            <input
              type="number"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="1000"
              className="bg-transparent text-xs font-black text-white w-20 focus:outline-none border-b border-white/10 focus:border-purple-500 text-center font-mono"
            />
            <span className="text-xs text-gray-500 font-bold">NTD</span>
          </div>
        </div>
      </div>

      {/* Parlay Cards */}
      <div className="space-y-4">
        {parlays.map((parlay) => {
          const style = gradeStyles[parlay.grade] || gradeStyles.B;
          const oddsArray = customOdds[parlay.id] || ['1.75', '1.75', '1.75'];
          
          // Calculate overall parlay stats
          const multiplier = oddsArray.reduce((acc, curr) => acc * (parseFloat(curr) || 1.0), 1.0);
          const stakeVal = parseFloat(stake) || 0;
          const estPayout = stakeVal * multiplier;
          
          // EV calculation: (combinedProb * multiplier - 1) * 100
          const ev = (parlay.combinedProb * multiplier - 1.0) * 100.0;
          const isEvPositive = ev > 0;

          return (
            <div
              key={parlay.id}
              className={`rounded-2xl border p-4 ${style.bg} ${style.border} ${style.glow} shadow-sm transition-all hover:scale-[1.01] flex flex-col gap-3`}
            >
              {/* Parlay Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${style.text}`}>{style.label}</span>
                  <span className="text-[10px] font-mono text-gray-500">
                    組合 #{parlay.id}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-gray-500">AI 勝率</span>
                    <span className={`text-xs font-black font-mono ${style.text}`}>
                      {(parlay.combinedProb * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Legs */}
              <div className="space-y-2">
                {parlay.legs.map((leg, legIdx) => {
                  const legNames = ['第一場', '第二場', '第三場'];
                  const currentLegOdds = oddsArray[legIdx] || '1.75';
                  return (
                    <div
                      key={leg.gameId}
                      className="flex items-center justify-between bg-black/35 rounded-xl px-3 py-2 border border-white/5"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-[9px] font-sans font-black text-gray-400 shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                          {legNames[legIdx] || `第 ${legIdx + 1} 場`}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-white truncate">
                              {leg.pickTeamName}
                            </span>
                            <span className={`text-[8.5px] font-black px-1 rounded-sm ${
                              leg.pick === 'home' 
                                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' 
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {leg.pick === 'home' ? '主勝' : '客勝'}
                            </span>
                          </div>
                          <span className="text-[9px] text-gray-500 font-mono truncate mt-0.5">
                            {leg.awayTeam.nameCn || leg.awayTeam.code} @ {leg.homeTeam.nameCn || leg.homeTeam.code}
                          </span>
                        </div>
                      </div>

                      {/* Leg Right: Model details & odds input */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          <ConsensusStars count={leg.consensusCount} />
                          <span className="text-[8.5px] font-mono text-gray-500">
                            {leg.avgConfidence.toFixed(0)}% 信心
                          </span>
                        </div>
                        <ModelDots models={leg.models} pick={leg.pick} />

                        {/* Interactive Odds Input */}
                        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-1.5 py-0.5 shrink-0">
                          <span className="text-[9px] text-gray-500 font-mono">賠率</span>
                          <input
                            type="number"
                            step="0.01"
                            value={currentLegOdds}
                            onChange={(e) => handleOddsChange(parlay.id, legIdx, e.target.value)}
                            className="bg-transparent text-[10px] font-black text-center text-white w-10 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Return Calculation Panel */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-black/20 rounded-xl p-3 border border-white/5 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-gray-500 text-[10px] font-bold">總賠率</span>
                  <span className="text-sm font-black text-white font-mono">{multiplier.toFixed(2)} 倍</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-gray-500 text-[10px] font-bold">預估獎金</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    ${Math.round(estPayout).toLocaleString()} 元
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 col-span-2">
                  <span className="text-gray-500 text-[10px] font-bold">AI 期望值 (EV ROI)</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-black font-mono ${isEvPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isEvPositive ? '+' : ''}{ev.toFixed(1)}%
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isEvPositive 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {isEvPositive ? '推薦投注' : '不符期望'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Parlay Footer info */}
              <div className="flex items-center justify-between text-[9px] font-mono text-gray-500 border-t border-white/5 pt-2">
                <span>過關隊伍: {parlay.coverageTeams.join(', ')}</span>
                <span>預估得分: {parlay.legs.map(l => l.predictedTotal).join(' / ')}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Uncovered Teams Notice */}
      {uncoveredTeams.length > 0 && (
        <div className="mt-4 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5 text-[10px] text-gray-500 font-mono">
          ⚠️ 未納入串關隊伍: {uncoveredTeams.join(', ')}（共識度不足或場次不夠）
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 text-[10px] text-gray-600 font-mono">
        <span>⚡ AI 多模型共識引擎 v1.1</span>
        <span>共 {parlays.length} 組三關推薦</span>
      </div>
    </div>
  );
}
